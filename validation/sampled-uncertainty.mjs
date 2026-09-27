/* =====================================================================
   SAMPLED UNCERTAINTY — the OAT's bands drawn together, and what that shows
   =====================================================================
   WHY THIS EXISTS

   The uncertainty tab combines one-at-a-time excursions by root-sum-square,
   which assumes the effects add. The sizing loop is a fixed point, not a sum:
   a heavier battery needs a bigger wing needs a heavier structure needs a
   bigger battery. engine/uncertainty.js now carries sampledBand(), which draws
   every tagged input at once from the SAME [LAY] bands, truncated to the SAME
   physical bounds, by Latin hypercube with a seeded generator, and re-runs the
   loop per draw. This harness gates the mechanism and reports what the sampled
   range says beside the OAT band.

   WHAT IS GATED, and the defect each check exists to catch:
     1. same seed, same numbers, bit for bit; a different seed differs
        (a Math.random creeping in; a seed that is read but not used)
     2. every band zero -> every draw equals the baseline exactly
        (a perturbation applied outside the band, or a draw that leaks)
     3. one input sampled alone -> every outcome lies strictly inside the OAT's
        own two excursions for that input (a band scaled wrong, an interval
        mapped from the wrong end)
     4. counts are never drawn, by name not by value
     5. converged + failed = drawn; nothing dropped
     6. a band wider than a physical bound is truncated INTO the bound, and
        every sampled interval lies within its bound
     7. replicates carry different seeds (five identical replicates would
        report a false stability)
     8. the hypercube's columns are near-independent (a shuffle that does not
        shuffle gives rank-correlated columns)
     9. holding the design variables narrows the range (the switch does
        something) and the held list is exactly the design variables present

   MUTANTS RUN AGAINST IT, ten, all caught by a named check: hypercube not
   shuffled (8); truncation reported but not applied (6); counts sampled (4);
   seed ignored (1); replicates sharing one seed (7); failed draws dropped
   (5, on the 90 % band run, where draws do fail); quantile returning the
   minimum (9); the design-variable switch doing nothing (9); a band at twice
   its width (3); a draw leaking 5 % outside its band (3).

   WHAT IS REPORTED, not gated, because no failure mode sets a bound on it:
     the sampled P5/P50/P95 of MTOW beside the OAT RSS band and envelope; the
     replicate spread at this N; the failed fraction; the range with and
     without the design variables. Numbers, not verdicts.

   Run: node validation/sampled-uncertainty.mjs            (N = 200, ~1 min)
        node validation/sampled-uncertainty.mjs --full     (N = 2000 for the
                                                            headline, ~4 min)
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { uncertaintyBand, sampledBand, latinHypercube, lcg, BANDS, PHYSICAL_BOUNDS,
         COUNT_KEYS, DESIGN_VARIABLE_KEYS } from "../src/engine/uncertainty.js";

const FULL = process.argv.includes("--full");
const N_HEAD = FULL ? 2000 : 200;

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};
const f0 = (x) => (x == null ? "n/a" : x.toFixed(0));
const f1 = (x) => (x == null ? "n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);

/* The same aircraft analysis-layers.mjs hands the OAT, so the two are read
   against one baseline. */
const P = { payload:455, range:100, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.90, clDesign:0.55, nPropHover:12, propDiam:2.37, twRatio:1.3, convTolExp:-6,
  etaHov:0.740, tipSpeed:167.64, etaSys:0.80, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, sedCell:300, etaBat:0.90, socMin:0.19,
  ewf:0.50, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, configType:"hybrid",
  fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5,
  hoverTimeTakeoffS:30, hoverTimeLandingS:30 };
const size = (x) => runSizing({ ...x, range: x.range + 0.76 * x.vCruise * 20 * 60 / 1000 });

console.log("SAMPLED UNCERTAINTY");
console.log(bar);

/* ── 1. determinism ──────────────────────────────────────────────────── */
const a = sampledBand(size, P, { N: 20, seed: 11 });
const b = sampledBand(size, P, { N: 20, seed: 11 });
const c = sampledBand(size, P, { N: 20, seed: 12 });
const vals = (S) => S.samples.map((s) => s.value);
check(JSON.stringify(vals(a)) === JSON.stringify(vals(b)) && a.p50 === b.p50,
  "the same seed reproduces every draw bit for bit", `${a.drawn} draws, p50 ${f0(a.p50)}`);
check(JSON.stringify(vals(a)) !== JSON.stringify(vals(c)),
  "a different seed draws different numbers", `p50 ${f0(a.p50)} vs ${f0(c.p50)}`);

/* ── 2. collapse ─────────────────────────────────────────────────────── */
const zero = Object.fromEntries(Object.keys(BANDS).map((k) => [k, BANDS[k] == null ? null : 0]));
const Z = sampledBand(size, P, { N: 10, bands: zero });
check(Z.inputsSampled === 0 && Z.samples.every((s) => s.value === Z.base),
  "with every band zero, every draw is the baseline exactly",
  `${Z.drawn} draws all ${f0(Z.base)} kg, ${Z.inputsSampled} inputs sampled`);

/* ── 3. one input alone stays inside the OAT's excursions ────────────── */
const U = uncertaintyBand(size, P);
const oatEta = U.contributions.find((x) => x.key === "etaSys");
const one = sampledBand(size, P, { N: 40, keys: ["etaSys"], seed: 5 });
const oLo = Math.min(oatEta.atMinus, oatEta.atPlus), oHi = Math.max(oatEta.atMinus, oatEta.atPlus);
check(one.inputsSampled === 1 && one.min > oLo && one.max < oHi,
  "etaSys sampled alone: every outcome lies strictly inside the OAT's two excursions",
  `sampled ${f0(one.min)}-${f0(one.max)} kg inside OAT ${f0(oLo)}-${f0(oHi)} kg`);

/* ── 4. counts by name ───────────────────────────────────────────────── */
const H = sampledBand(size, P, { N: N_HEAD });
check(H.inputsSkipped.counts.includes("nPropHover") && !H.inputs.some((i) => COUNT_KEYS.has(i.key)),
  "rotor count is never drawn, and is excluded by NAME rather than by an integer value",
  `counts held: ${H.inputsSkipped.counts.join(", ")}; integer-valued continuous inputs still sampled: `
  + H.inputs.filter((i) => Number.isInteger(i.baseValue)).map((i) => i.key).join(", "));

/* ── 5. nothing dropped ──────────────────────────────────────────────── */
check(H.converged + H.failed === H.drawn && H.samples.length === H.drawn,
  "converged plus failed equals drawn; every planned draw is accounted for",
  `${H.converged} converged, ${H.failed} failed of ${H.drawn}`);

/* ── 6. truncation into physical bounds ──────────────────────────────── */
const wide = { ...BANDS, unverified: 0.9, sourced: 0.9, validated: 0.9, calibrated: 0.9 };
const W = sampledBand(size, P, { N: 10, bands: wide });
const outOfBounds = W.inputs.filter((i) => PHYSICAL_BOUNDS[i.key]
  && (i.lo < PHYSICAL_BOUNDS[i.key][0] - 1e-12 || i.hi > PHYSICAL_BOUNDS[i.key][1] + 1e-12));
check(W.converged + W.failed === W.drawn && W.samples.length === W.drawn,
  "at bands of 90% the failed draws, if any, are counted rather than dropped",
  `${W.converged} converged, ${W.failed} failed of ${W.drawn}` + (W.failed ? "" : " - no draw failed, so dropping is not observable here"));
check(W.truncatedByPhysics.length > 0 && outOfBounds.length === 0,
  "a band that crosses a physical bound is truncated into it, and reported",
  `${W.truncatedByPhysics.length} truncated (${W.truncatedByPhysics.map((t) => t.key).join(", ")}), `
  + `${outOfBounds.length} intervals outside their bound`);

/* ── 7. replicates are independent ───────────────────────────────────── */
const repP50 = H.replicateResults.map((r) => r.p50);
check(new Set(repP50.map((x) => x.toFixed(6))).size === H.replicates,
  "the five replicates carry different seeds and give different medians",
  repP50.map(f0).join(" / "));

/* ── 8. the hypercube's columns are near-independent ─────────────────── */
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; idx.forEach(([, i], k) => { r[i] = k; }); return r; };
const spearman = (x, y) => { const rx = rank(x), ry = rank(y), n = x.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)); };
{
  const n = 200, d = 6, cube = latinHypercube(n, d, lcg(3));
  let worst = 0;
  for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) worst = Math.max(worst, Math.abs(spearman(cube.map((r) => r[i]), cube.map((r) => r[j]))));
  const strata = cube.every((r) => r.every((u) => u >= 0 && u < 1))
    && Array.from({ length: d }, (_, k) => new Set(cube.map((r) => Math.floor(r[k] * n))).size === n).every(Boolean);
  /* Bound from the failure mode: an unshuffled column gives |rho| = 1 against
     any other unshuffled column; 200 independent permutations give
     |rho| ~ 1/sqrt(199) = 0.07 in scale, so 0.3 sits an order of magnitude
     below the defect and four sigma above the innocent case. */
  check(strata && worst < 0.3,
    "every column visits every stratum once and columns are near-independent",
    `worst |Spearman rho| ${worst.toFixed(3)} over ${d * (d - 1) / 2} pairs at N=${n}`);
}

/* ── 9. holding the design variables does something, and the right thing ─ */
const D = sampledBand(size, P, { N: N_HEAD, excludeDesignVariables: true });
const present = [...DESIGN_VARIABLE_KEYS].filter((k) => H.inputs.some((i) => i.key === k)).sort();
check(JSON.stringify(D.designVariablesHeld.slice().sort()) === JSON.stringify(present)
  && D.inputsSampled === H.inputsSampled - present.length,
  "excludeDesignVariables holds exactly the design variables that were sampled",
  `${present.length} held, ${D.inputsSampled} still sampled`);
check((D.p95 - D.p5) < (H.p95 - H.p5),
  "the range without design variables is narrower than the range with them",
  `P5-P95 ${f0(D.p95 - D.p5)} kg without, ${f0(H.p95 - H.p5)} kg with`);

/* ── the report ──────────────────────────────────────────────────────── */
console.log(`
SAMPLED RANGE vs ONE-AT-A-TIME BAND   (${P.configType}, MTOW ${f0(H.base)} kg, N=${H.drawn}, ${H.replicates} replicates of ${H.perReplicate}, seed ${H.seed})`);
console.log(`   inputs sampled ${H.inputsSampled} (${H.designVariablesSampled.length} of them design variables); held: `
  + `${H.inputsSkipped.requirements.length} requirements, ${H.inputsSkipped.counts.length} counts, `
  + `${H.inputsSkipped.untagged.length} untagged (${H.inputsSkipped.untagged.join(", ")}), ${H.inputsSkipped.derived.length} derived`);
console.log(`   converged ${H.converged} of ${H.drawn} (${H.failedPct.toFixed(1)}% failed)`);
console.log(`
   ${"".padEnd(34)}${"P5".padStart(10)}${"P50".padStart(10)}${"P95".padStart(10)}${"min".padStart(10)}${"max".padStart(10)}`);
const row = (label, S) => console.log(`   ${label.padEnd(34)}${f0(S.p5).padStart(10)}${f0(S.p50).padStart(10)}${f0(S.p95).padStart(10)}${f0(S.min).padStart(10)}${f0(S.max).padStart(10)}`
  + `    (${f1(S.p5Pct)} / ${f1(S.p50Pct)} / ${f1(S.p95Pct)})`);
row("sampled, OAT's input set", H);
row("sampled, design variables held", D);
console.log(`   ${"OAT root-sum-square band".padEnd(34)}${f0(U.band.lo).padStart(10)}${f0(U.base).padStart(10)}${f0(U.band.hi).padStart(10)}`
  + `    (-${(100 * U.rssDown / U.base).toFixed(1)}% / +${(100 * U.rssUp / U.base).toFixed(1)}%)`);
console.log(`   ${"OAT linear envelope".padEnd(34)}${f0(U.envelope.lo).padStart(10)}${"".padStart(10)}${f0(U.envelope.hi).padStart(10)}    (+/-${U.worstPct.toFixed(1)}%)`);
console.log(`
   replicate spread at this N:  P5 ${f0(H.replicateSpread.p5)} kg   P50 ${f0(H.replicateSpread.p50)} kg   P95 ${f0(H.replicateSpread.p95)} kg`
  + `   (per replicate P50: ${repP50.map(f0).join(" / ")})`);
console.log(`   ${FULL ? "" : "quick look; run with --full for N=2000, the default the corpus recommends (SAND2001-0417 p.55)"}`);
console.log(`
   READ IT AS A RANGE. The inputs are intervals with no stated shape, so the
   percentiles locate positions in the outcome range under those [LAY] bands
   and carry no probability. The median sits ${f1(H.p50Pct)} from the deterministic
   point against a replicate spread of ${f0(H.replicateSpread.p50)} kg (${(100 * H.replicateSpread.p50 / H.base).toFixed(1)}%)
   on the median at this N: read the offset as curvature of the loop only
   where it stands clear of that spread.
   Design variables are decisions, not unknowns (UNCERTAINTY-AND-RISK.md 1.3):
   the second row is the range over what the designer does NOT choose.
   Correlations between inputs are unknown and not modelled. Whether this is
   NASA-STD-7009B Table 17 level 3 is a judgement for the report, not a claim
   made here: the [GAP]s (untagged and derived inputs) are unpropagated.`);

console.log(`\n${bar}`);
console.log(fails.length ? `SAMPLED UNCERTAINTY: ${fails.length} FAILED` : "SAMPLED UNCERTAINTY PASSED");
process.exit(fails.length ? 1 : 0);
