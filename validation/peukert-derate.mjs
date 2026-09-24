/* =====================================================================
   THE C-RATE CAPACITY DERATE — PEUKERT
   =====================================================================
   The derate was a flat 8% with the provenance note "8% SED derate; no
   source", applied identically across a demanded hover C-rate of 1.16C to
   3.92C — a factor of 3.4 — and it was the highest-leverage unverified
   input in the registry (validation/unverified-leverage.mjs).

   It is now computed from the rate each design demands:

     [SRC] NDARC Theory Manual NASA/TP-2015-218751 ch.26 "Battery Model",
     line 10652 (same text as ch.28 of the 2025 revision TP-20250010468):
       "The Peukert model assumes I^k*T = constant ... The Peukert
        coefficient k = 1.2 to 1.3 for lead-acid batteries, and k = 1.01 to
        1.05 for lithium-ion batteries (weak dependence). Thus the capacity
        C = IT ~ 1/x^(k-1). An increase in current by a factor of 10 means
        a 2-11% reduction of capacity for lithium-ion batteries."

     and x IS the C-rate, from the same chapter, line 10650:
       "The current is measured in terms of the charge capacity: I = xC
        (A), corresponding to a discharge time of 1/x hours. The units of x
        are 1/hr."

   WHAT THIS GATE IS FOR. Not to re-assert the equation — anyone can read
   it — but to hold the things that would silently go wrong:
     1. that the implementation reproduces NDARC'S OWN worked example, so
        the constants and the algebra agree with the source;
     2. that k cannot leave the PUBLISHED RANGE, because a k outside
        1.01-1.05 is an unsourced number wearing a sourced name;
     3. that the rate the derate is KEYED ON is the rate the engine
        REPORTS — the bug this gate was written after, where the derate was
        computed against pack NAMEPLATE while NDARC defines x against
        USABLE capacity, a systematic factor of (1-socMin);
     4. that an override is honoured AND declared, so a sourced model
        cannot be replaced in silence;
     5. that the old flat 8% is not reachable by default anywhere.
   ===================================================================== */
import { runSizing, peukertDerate, hoverCRate, batteryConvention,
         PEUKERT_K_MIN, PEUKERT_K_MAX, PEUKERT_K_DEFAULT } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };
const build = (k, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD,
    etaHov:d.etaHov ?? B.etaHov, ...over };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};
const LAYOUTS = ["liftcruise","hybrid","hybridPusher","tiltrotor","multicopter","sideBySide"];

console.log("PEUKERT C-RATE DERATE GATE");
console.log("=".repeat(78));

/* ── 1. NDARC'S OWN WORKED EXAMPLE ───────────────────────────────────────
   The manual states the answer for a 10x current increase. If our
   implementation cannot reproduce the source's own number, the source has
   not been implemented — whatever the comment says. */
console.log("\n1. Reproduce NDARC's stated '10x current -> 2-11% reduction':\n");
const d10min = peukertDerate(10, PEUKERT_K_MIN);
const d10max = peukertDerate(10, PEUKERT_K_MAX);
console.log(`   k=${PEUKERT_K_MIN} -> ${(100*d10min).toFixed(1)}%    k=${PEUKERT_K_MAX} -> ${(100*d10max).toFixed(1)}%`);
check(Math.abs(100*d10min - 2) < 0.5, "lower bound reproduces NDARC's 2%",
      `${(100*d10min).toFixed(2)}% vs 2% stated`);
check(Math.abs(100*d10max - 11) < 0.5, "upper bound reproduces NDARC's 11%",
      `${(100*d10max).toFixed(2)}% vs 11% stated`);

/* ── 2. k CANNOT LEAVE THE PUBLISHED RANGE ───────────────────────────── */
console.log("\n2. k is bounded by its source:\n");
check(PEUKERT_K_MIN === 1.01 && PEUKERT_K_MAX === 1.05,
      "the bounds are NDARC's published lithium-ion range", `${PEUKERT_K_MIN}-${PEUKERT_K_MAX}`);
check(peukertDerate(4, 5.0) === peukertDerate(4, PEUKERT_K_MAX)
   && peukertDerate(4, 0.5) === peukertDerate(4, PEUKERT_K_MIN),
      "out-of-range k CLAMPS rather than extrapolating",
      "k=5.0 -> k_max, k=0.5 -> k_min");
check(PEUKERT_K_DEFAULT === PEUKERT_K_MAX,
      "the default is the PESSIMISTIC end of the range",
      `${PEUKERT_K_DEFAULT} — where a source gives a range, sizing takes the end that cannot flatter`);

/* ── 3. SHAPE ────────────────────────────────────────────────────────── */
console.log("\n3. Shape of the law:\n");
check(peukertDerate(1, 1.05) === 0 && peukertDerate(0.5, 1.05) === 0,
      "no derate at or below the reference rate", "x <= 1 -> 0, per 'usable capacity at low current'");
let mono = true;
for (let x = 1.1; x < 8; x += 0.1) if (peukertDerate(x+0.1,1.05) <= peukertDerate(x,1.05)) mono = false;
check(mono, "derate increases monotonically with C-rate");
let monoK = true;
for (const kk of [1.01,1.02,1.03,1.04]) if (peukertDerate(3.5,kk+0.01) <= peukertDerate(3.5,kk)) monoK = false;
check(monoK, "derate increases monotonically with k");
check(!Number.isFinite(peukertDerate(NaN,1.05)) === false && peukertDerate(NaN,1.05) === 0,
      "a non-finite rate yields 0 rather than NaN propagating into pack mass");

/* ── 4. THE IDENTITY THAT CAUGHT A REAL BUG ──────────────────────────────
   The rate the derate is keyed on must be the rate the engine reports.
   These were once out by a constant (1-socMin) = 0.81, because the derate
   was computed against pack NAMEPLATE energy while NDARC defines x against
   USABLE capacity. A ratio pinned near 1.00 is what makes that unrepeatable.

   The residual is NOT zero and should not be: CrateHov is reported from
   integer cell counts (Nseries x Npar) and rounded to 2 dp, while the
   sizing rate is the continuous value the loop used. The error is largest
   on the smallest pack, which is the direction cell-count rounding
   predicts, so the tolerance is set by that mechanism and not by taste. */
console.log("\n4. The derate is keyed on the rate the engine reports:\n");
console.log("   layout          cRateSizing  CrateHov    ratio   pack kWh");
let worstRatio = 0;
for (const L of LAYOUTS) {
  const r = runSizing(build(L));
  const ratio = r.cRateSizing / r.CrateHov;
  worstRatio = Math.max(worstRatio, Math.abs(ratio - 1));
  console.log("   " + L.padEnd(14) + (r.cRateSizing ?? NaN).toFixed(3).padStart(11)
    + (r.CrateHov ?? NaN).toFixed(3).padStart(10) + ratio.toFixed(4).padStart(9)
    + (r.PackInstalledkWh ?? NaN).toFixed(1).padStart(11));
}
check(worstRatio < 0.03, "sizing rate equals reported hover C-rate",
      `worst departure ${(100*worstRatio).toFixed(2)}% — integer cell-count rounding, not a convention mismatch`);
check(worstRatio > 1e-6, "the two are computed INDEPENDENTLY, not read from each other",
      "an exactly-zero residual would mean one is a copy of the other and this check is vacuous");

/* ── 5. THE DERATE IS ACTUALLY APPLIED, AND VARIES BY LAYOUT ─────────── */
console.log("\n5. One rate does not fit all — the point of the change:\n");
console.log("   layout          C_hover   derate %   vs flat 8%");
const applied = [];
for (const L of LAYOUTS) {
  const r = runSizing(build(L));
  applied.push(r.cRateDerate);
  console.log("   " + L.padEnd(14) + (r.cRateSizing ?? NaN).toFixed(2).padStart(8)
    + (100*r.cRateDerate).toFixed(2).padStart(11)
    + (r.cRateDerate < 0.08 ? "   lighter" : "   heavier"));
}
const spread = Math.max(...applied) - Math.min(...applied);
check(spread > 0.02, "the derate RESPONDS to the demanded rate",
      `spread ${(100*spread).toFixed(2)} points across layouts — the flat form had a spread of 0`);
check(applied.every(d => d < 0.08),
      "every layout derates LESS than the unsourced flat 8%",
      "the flat value was too pessimistic even at the pessimistic end of NDARC's range");

/* ── 6. OVERRIDE IS HONOURED AND DECLARED ────────────────────────────────
   A reference design declares "no derating" by setting cRateDerate 0. That
   must keep working — but it must also be VISIBLE, or a sourced model can
   be swapped out with nothing on the record. */
console.log("\n6. An explicit override is honoured AND declared:\n");
const ovr = runSizing(build("liftcruise", { cRateDerate: 0 }));
const nat = runSizing(build("liftcruise"));
check(ovr.cRateDerate === 0 && ovr.cRateOverridden === true,
      "cRateDerate:0 suppresses the derate and says so", "the NASA reference entry relies on this");
check(nat.cRateOverridden === false,
      "an un-overridden run declares that the sourced model is in force");
check(ovr.MTOW < nat.MTOW,
      "suppressing the derate makes the aircraft lighter",
      `${ovr.MTOW.toFixed(0)} vs ${nat.MTOW.toFixed(0)} kg — direction check on the applied derate`);

/* ── 7. THE FLAT 8% IS NOT REACHABLE BY DEFAULT ──────────────────────── */
console.log("\n7. The unsourced flat value is gone from the defaults:\n");
check(DEFAULT_PARAMS.cRateDerate === undefined,
      "DEFAULT_PARAMS carries no cRateDerate",
      "a value there would override the sourced model on every run");
check((DEFAULT_PARAMS.peukertK ?? null) !== null
   && DEFAULT_PARAMS.peukertK >= PEUKERT_K_MIN && DEFAULT_PARAMS.peukertK <= PEUKERT_K_MAX,
      "DEFAULT_PARAMS carries a k inside the published range", `k = ${DEFAULT_PARAMS.peukertK}`);

/* ── 8. THE SHARED CONVENTION HELPER AGREES WITH THE SIZING LOOP ─────────
   batteryConvention() is the single helper the secondary paths (payload-
   range, sweeps) go through. It existed because those paths had drifted
   from the sizing loop before. It must not drift again on this. */
console.log("\n8. The shared helper matches the sizing loop:\n");
const rl = runSizing(build("liftcruise"));
const bc = batteryConvention({ ...build("liftcruise"), peukertK:PEUKERT_K_DEFAULT },
                             { Etot: rl.Etot, Evert: rl.Eto + rl.Eld, Phov: rl.Phov });
check(Math.abs(bc.cRateDerate - rl.cRateDerate) < 5e-3,
      "batteryConvention reproduces the loop's derate",
      `helper ${(100*bc.cRateDerate).toFixed(2)}% vs loop ${(100*rl.cRateDerate).toFixed(2)}%`);
check(bc.rateKnown === true, "the helper reports the rate as known when hover power is supplied");
const bcNoRate = batteryConvention({ ...build("liftcruise") }, { Etot: rl.Etot, Evert: rl.Eto + rl.Eld });
check(bcNoRate.rateKnown === false && bcNoRate.cRateDerate === 0,
      "with no hover power the helper SAYS the rate is unknown",
      "it does not quietly substitute a number — the caller decides");

/* ── 9. hoverCRate PICKS THE BINDING BRANCH ──────────────────────────── */
console.log("\n9. The rate takes the larger pack, i.e. the smaller rate:\n");
const energyGoverned = hoverCRate({ Phov:500, Etot:200, etaEff:1, usableFrac:0.81, maxCRate:4 });
const powerGoverned  = hoverCRate({ Phov:5000, Etot:200, etaEff:1, usableFrac:0.81, maxCRate:4 });
check(Math.abs(energyGoverned - 2.5) < 1e-9,
      "energy-governed: x = P_hover/E_req", `${energyGoverned.toFixed(3)}`);
check(Math.abs(powerGoverned - 4/0.81) < 1e-9,
      "power-governed: x is capped at maxCRate/(1-socMin)", `${powerGoverned.toFixed(3)}`);
check(hoverCRate({ Phov:0, Etot:200, etaEff:1, usableFrac:0.81, maxCRate:4 }) === null,
      "an undeterminable rate returns null rather than a number");

console.log("\n" + "=".repeat(78));
if (fails.length) {
  console.log(`PEUKERT DERATE GATE FAILED — ${fails.length} check(s):`);
  for (const f of fails) console.log("   - " + f);
  process.exit(1);
}
console.log("PEUKERT DERATE GATE PASSED");
