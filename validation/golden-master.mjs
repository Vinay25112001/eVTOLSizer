/* ═══════════════════════════════════════════════════════════════════════
   GOLDEN-MASTER REGRESSION TEST
   ═══════════════════════════════════════════════════════════════════════
   Refactoring 900 lines of coupled physics is only safe if you can prove the
   numbers did not move. This runs the engine over a deterministic sweep of
   parameter sets, hashes every numeric output, and compares against a stored
   snapshot.

     node validation/golden-master.mjs --record    write the snapshot
     node validation/golden-master.mjs             verify against it

   Any refactor that is genuinely behaviour-preserving passes with ZERO drift.
   A physics change is expected to fail — re-record deliberately and say so in
   the commit, never silently.

   Determinism: the parameter sweep uses a seeded LCG, never Math.random, so
   the same cases are generated on every machine and every run.
   ═══════════════════════════════════════════════════════════════════════ */

import { runSizing } from "../src/engine.js";
import { classOf } from "../src/classes/registry.js";
import { CONFIG_DEFAULTS } from "../src/engine/configuration.js";
import { fingerprint, sameValue, RTOL } from "../src/lib/fingerprint.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, "golden-master.snapshot.json");
const RECORD = process.argv.includes("--record");
/* --via-registry: the same cases through the aircraft-class registry's eVTOL
   entry (src/classes/registry.js). Adding classes must not move one eVTOL
   number, so this path is checked against the stored snapshot AND, value by
   value with Object.is, against the direct engine call in the same process. */
const VIA_REGISTRY = process.argv.includes("--via-registry");
if (RECORD && VIA_REGISTRY) {
  console.log("--record and --via-registry cannot be combined: the snapshot is recorded from the engine itself");
  process.exit(1);
}
const run = VIA_REGISTRY ? classOf("evtol").size : runSizing;
const strictMismatches = [];

/* Seeded linear congruential generator — reproducible everywhere. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const BASE = {
  payload: 455, range: 190, vCruise: 67, cruiseAlt: 1000, hoverHeight: 15.24,
  reserveMinutes: 20, LD: 14, AR: 9, eOsw: 0.85, clDesign: 0.55, taper: 0.45,
  tc: 0.15, nPropHover: 6, propDiam: 3.0, twRatio: 1.3, convTolExp: -6,
  etaHov: 0.70, etaSys: 0.80, rateOfClimb: 5.08, climbAngle: 5, descentAngle: 6,
  climbLDPenalty: 0.13, deltaISA: 0, cRateDerate: 0.08, sedCell: 300,
  etaBat: 0.90, socMin: 0.19, ewf: 0.50, fusLen: 7.2, fusDiam: 1.65,
  vtGamma: 45, vtCh: 0.45, vtCv: 0.032, vtAR: 2.5,
};

/* Ranges chosen to stay inside the sliders' own limits, so every case is one a
   user could actually produce in the UI. */
const SWEEP = {
  payload:    [100, 900],   range:      [50, 250],   vCruise:  [30, 120],
  cruiseAlt:  [200, 3000],  LD:         [8, 20],     AR:       [5, 15],
  clDesign:   [0.35, 1.0],  taper:      [0.25, 0.75], tc:      [0.09, 0.19],
  propDiam:   [1.5, 4.5],   twRatio:    [1.0, 1.55], etaHov:   [0.45, 0.82],
  etaSys:     [0.55, 0.92], sedCell:    [160, 480],  etaBat:   [0.75, 0.97],
  socMin:     [0.06, 0.35], ewf:        [0.32, 0.66], fusLen:  [3.5, 9.5],
  fusDiam:    [0.9, 2.4],   vtGamma:    [22, 66],    vtCh:     [0.18, 0.55],
  vtCv:       [0.02, 0.09], vtAR:       [1.6, 3.8],  deltaISA: [-15, 30],
  rateOfClimb:[1.5, 11],    climbAngle: [2.5, 14],
};
const ROTORS = [4, 6, 8, 10, 12];
const MODELS = ["fraction", "buildup"];

/* ── CONFIGURATION COVERAGE — THE GAP THIS GATE HAD ────────────────────
   The sweep never set `configType`, so ALL 253 cases fell through to the
   liftcruise default and the regression gate had ZERO coverage of the other
   five layouts. It demonstrated the hole itself: a change to the design blade
   loading moved hybrid MTOW by 2% and this file still reported "every numeric
   output identical", because nothing here was a hybrid.

   That matters more than it sounds. Per-configuration physics is the core of
   this engine — rotor count, disk loading, download, blade loading, control
   scheme and thrust margin all switch on the layout — and none of it was
   regression-tested. */
const CONFIGS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor",
                 "multicopter", "sideBySide"];

function buildCases(n = 240) {
  const rnd = lcg(20260824);
  const cases = [{ name: "app-default", p: { ...BASE } }];
  for (const m of MODELS) cases.push({ name: `default-${m}`, p: { ...BASE, weightModel: m } });
  /* Wing auto-positioning is opt-in, so the sweep above never exercises it.
     Pin it explicitly across both weight models and a range of SM targets —
     otherwise a regression in the outer root find would go unnoticed. */
  for (const m of MODELS)
    for (const t of [0.05, 0.10, 0.15, 0.20, 0.25])
      cases.push({ name: `autowing-${m}-sm${Math.round(t*100)}`,
                   p: { ...BASE, weightModel: m, autoPositionWing: true, targetSM: t } });
  /* Every configuration at the baseline, on both weight models — so a change
     to any layout's physics has to be recorded deliberately. */
  for (const cfg of CONFIGS)
    for (const m of MODELS)
      cases.push({ name: `config-${cfg}-${m}`,
                   p: { ...BASE, weightModel: m, configType: cfg } });
  /* AT EACH LAYOUT'S OWN ROTOR COUNT, NOT THE BASELINE'S SIX. The sweep above
     pins every configuration but leaves nPropHover at BASE's 6, so the
     "config-sideBySide-*" cases sized a side-by-side with SIX rotors — an
     aircraft that does not exist. It is not a harmless surplus: the two-rotor
     case is where the non-overlap rule a >= R/sin(pi/N) is exact, and both
     geometry.js and booms.js excluded N = 2 with an off-by-one. That left the
     side-by-side drawing a 7.03 m rotor arm while charging for 2.87 m, a
     factor of 2.44 with boom mass going as L^2 — and all 265 golden cases
     passed throughout, because not one of them ran the layout at two rotors.

     A sweep that varies the configuration but not the thing the
     configuration DEFINES is not covering the configuration. */
  for (const cfg of CONFIGS)
    for (const m of MODELS)
      cases.push({ name: `native-${cfg}-${m}`,
                   p: { ...BASE, weightModel: m, configType: cfg,
                        nPropHover: CONFIG_DEFAULTS[cfg]?.nRotors ?? BASE.nPropHover } });
  for (let i = 0; i < n; i++) {
    const p = { ...BASE };
    for (const [k, [lo, hi]] of Object.entries(SWEEP)) p[k] = +(lo + rnd() * (hi - lo)).toFixed(4);
    p.nPropHover = ROTORS[Math.floor(rnd() * ROTORS.length)];
    p.weightModel = MODELS[Math.floor(rnd() * MODELS.length)];
    // exercise the configuration-aware drag paths too
    p.hubsExposed = rnd() > 0.4;
    p.nRotorsStopped = Math.floor(rnd() * (p.nPropHover + 1));
    p.gearType = ["fixed", "retractable", "faired"][Math.floor(rnd() * 3)];
    /* Sweep the LAYOUT too. Without this every random case was a liftcruise. */
    p.configType = CONFIGS[Math.floor(rnd() * CONFIGS.length)];
    cases.push({ name: `sweep-${i}`, p });
  }
  return cases;
}

const cases = buildCases();
const current = {};
let threw = 0;
for (const c of cases) {
  try {
    const R = run(c.p);
    const fp = fingerprint(R);
    if (VIA_REGISTRY) {
      const direct = fingerprint(runSizing(c.p));
      for (const f of new Set([...Object.keys(direct), ...Object.keys(fp)]))
        if (!Object.is(direct[f], fp[f]) && JSON.stringify(direct[f]) !== JSON.stringify(fp[f]))
          strictMismatches.push(`${c.name}.${f}`);
    }
    /* A DIVERGED RUN HAS NO VALUE TO REPRODUCE. It returns whatever the loop
       held when it hit the iteration cap, which depends on the last bits of
       every operation before it. Recording those numbers as a baseline makes
       the gate a platform detector. What IS worth regressing is the fact of
       divergence, so that is kept and the numbers are dropped. */
    if (R && R.r2Diverged === true) {
      current[c.name] = { _diverged: true, itersR2: R.itersR2 ?? null,
                          /* WHY it failed is stable even though the value is not:
                             ceiling = the weight spiral has no root; cap = a limit
                             cycle. Both survive a float perturbation; the MTOW at
                             the moment the loop gave up does not. */
                          ceiling: R.mtowCeilingHit === true,
                          configType: fp.configType, weightModel: fp.weightModel };
    } else {
      current[c.name] = fp;
    }
  }
  catch (e) { current[c.name] = { _threw: e.message }; threw++; }
}

if (RECORD) {
  writeFileSync(SNAPSHOT, JSON.stringify(current, null, 1));
  console.log(`recorded ${cases.length} cases -> ${SNAPSHOT}`);
  if (threw) console.log(`note: ${threw} case(s) threw; that is captured in the snapshot too`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.log("no snapshot found — run with --record first");
  process.exit(1);
}

const stored = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const diffs = [];
/* the largest difference actually ACCEPTED, so the margin is visible */
let maxRel = 0, maxRelAt = "";
for (const name of Object.keys(stored)) {
  const a = stored[name], b = current[name];
  if (!b) { diffs.push({ name, field: "(whole case)", was: "present", now: "missing" }); continue; }
  for (const f of Object.keys(a)) {
    const { same, rel } = sameValue(a[f], b[f]);
    if (!same) diffs.push({ name, field: f, was: a[f], now: b[f], rel });
    else if (Number.isFinite(rel) && rel > maxRel) { maxRel = rel; maxRelAt = `${name}.${f}`; }
  }
  for (const f of Object.keys(b)) if (!(f in a)) diffs.push({ name, field: f, was: "(absent)", now: b[f] });
}

console.log("═".repeat(72));
console.log(`GOLDEN MASTER${VIA_REGISTRY ? " (through the aircraft-class registry)" : ""} — ${cases.length} cases, ${Object.keys(stored).length} in snapshot`);
console.log("═".repeat(72));
if (VIA_REGISTRY) {
  if (strictMismatches.length) {
    console.log(`FAIL — the registry path differs from the engine in ${strictMismatches.length} value(s), e.g. ${strictMismatches.slice(0, 5).join(", ")}`);
    process.exit(1);
  }
  console.log("PASS — registry path bit-identical (Object.is) to the direct engine call in every case.");
}
if (diffs.length === 0) {
  console.log("PASS — no output moved by more than " + RTOL.toExponential(0) + " relative.");
  console.log(maxRel > 0
    ? `       largest accepted difference ${maxRel.toExponential(2)} at ${maxRelAt} `
      + `— ${(RTOL / maxRel).toFixed(0)}x headroom to the threshold`
    : "       every value bit-identical; full headroom to the threshold");
  process.exit(0);
}
const byField = {};
for (const d of diffs) (byField[d.field] ||= []).push(d);
console.log(`FAIL — ${diffs.length} differences across ${Object.keys(byField).length} field(s)\n`);
for (const [field, list] of Object.entries(byField).slice(0, 25)) {
  const e = list[0];
  console.log(`  ${field}  (${list.length} case${list.length > 1 ? "s" : ""})`);
  console.log(`     e.g. ${e.name}:  was ${JSON.stringify(e.was)}  now ${JSON.stringify(e.now)}`
    + (Number.isFinite(e.rel) ? `   (${e.rel.toExponential(2)} relative, threshold ${RTOL.toExponential(0)})` : ""));
}
if (Object.keys(byField).length > 25) console.log(`  … and ${Object.keys(byField).length - 25} more fields`);
process.exit(1);
