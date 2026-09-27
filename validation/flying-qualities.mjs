/* =====================================================================
   FLYING-QUALITIES LEVELS GATE — Phase D, first slice
   =====================================================================
   The engine's classical wing-borne modes are placed on MIL-F-8785C's
   Category B tables. Nothing here compares to an aircraft (no eVTOL
   publishes modal data); what is gated is that the tables in the code are
   the tables on the pages, that the level logic lands where the tables say
   at both sides of every boundary, that what cannot be levelled is refused
   rather than defaulted, and that the four winged layouts get a level with
   a named worst mode.

   TRANSCRIPTION. The PAGE constant below is a second, independent reading
   of the standard's rendered pages (STABILITY-LEVELS.md section 1 holds the
   same numbers with the reading notes); the module's table must equal it.

   MUTANTS, ten, every one caught by a named check: phugoid Level 1 at 0.4;
   the Category A frequency band; the Category A/C damping column; the
   Dutch-roll zeta*omega minimum dropped; the Category A roll row; the
   spiral levelled by default; time-to-double from omega alone; the worst
   level taken as the minimum; rotor-borne layouts levelled; omega instead
   of omega squared in the frequency criterion.

   Run: node validation/flying-qualities.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { hoverQualities } from "../src/engine/hoverqualities.js";
import { wingModes } from "../src/engine/wingmodes.js";
import * as CFG from "../src/engine/configuration.js";
import { MIL_F_8785C, flyingQualities, phugoidLevel, shortPeriodFrequencyLevel, shortPeriodDampingLevel,
         dutchRollLevel, rollModeLevel } from "../src/engine/flyingqualities.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};
console.log("FLYING-QUALITIES LEVELS GATE (MIL-F-8785C, Category B)");
console.log(bar);

/* ── 1. TRANSCRIPTION ────────────────────────────────────────────────── */
console.log("\n1. The tables in the code are the tables on the pages");
const PAGE = {   // read from the rendered pages of sources/stability/MIL-F-8785C_1980-11-05.pdf this session
  phugoid: { p: 12, L1zeta: 0.04, L2zeta: 0, L3T2: 55 },
  spFreqB: { p: 15, L1: [0.085, 3.6], L2: [0.038, 10.0], L3lo: 0.038 },
  spDampB: { p: 13, L1: [0.30, 2.00], L2: [0.20, 2.00], L3lo: 0.15 },
  drB:     { p: 22, L1: [0.08, 0.15, 0.4], L2: [0.02, 0.05, 0.4], L3: [0, null, 0.4] },
  rollB:   { p: 23, L1: 1.4, L2: 3.0, L3: 10 },
  spiralB: { p: 23, L1: 20, L2: 8, L3: 4 },
};
const T = MIL_F_8785C;
check(T.phugoid.level1.zetaMin === PAGE.phugoid.L1zeta && T.phugoid.level2.zetaMin === PAGE.phugoid.L2zeta && T.phugoid.level3.T2min_s === PAGE.phugoid.L3T2 && T.phugoid.src.includes("p. 12"),
  "3.2.1.2 phugoid: 0.04 / 0 / 55 s, p. 12", "");
check(JSON.stringify(T.shortPeriodFrequency.level1) === JSON.stringify(PAGE.spFreqB.L1) && JSON.stringify(T.shortPeriodFrequency.level2) === JSON.stringify(PAGE.spFreqB.L2) && T.shortPeriodFrequency.level3[0] === PAGE.spFreqB.L3lo && T.shortPeriodFrequency.level3[1] === null,
  "Figure 2 short-period frequency, Category B: 0.085-3.6 / 0.038-10.0 / >= 0.038, p. 15", "");
check(JSON.stringify(T.shortPeriodDamping.level1) === JSON.stringify(PAGE.spDampB.L1) && JSON.stringify(T.shortPeriodDamping.level2) === JSON.stringify(PAGE.spDampB.L2) && T.shortPeriodDamping.level3[0] === PAGE.spDampB.L3lo,
  "Table IV short-period damping, Category B: 0.30-2.00 / 0.20-2.00 / >= 0.15, p. 13", "");
const dr = (r) => [r.zetaMin, r.zetaWnMin, r.wnMin];
check(JSON.stringify(dr(T.dutchRoll.level1)) === JSON.stringify(PAGE.drB.L1) && JSON.stringify(dr(T.dutchRoll.level2)) === JSON.stringify(PAGE.drB.L2) && JSON.stringify(dr(T.dutchRoll.level3)) === JSON.stringify(PAGE.drB.L3),
  "Table VI Dutch roll, Category B: 0.08/0.15/0.4, 0.02/0.05/0.4, 0/-/0.4, p. 22", "");
check(T.rollMode.level1 === PAGE.rollB.L1 && T.rollMode.level2 === PAGE.rollB.L2 && T.rollMode.level3 === PAGE.rollB.L3, "Table VII roll mode, Category B: 1.4 / 3.0 / 10 s, p. 23", "");
check(T.spiral.level1 === PAGE.spiralB.L1 && T.spiral.level2 === PAGE.spiralB.L2 && T.spiral.level3 === PAGE.spiralB.L3, "Table VIII spiral, Category B: 20 / 8 / 4 s, p. 23 (carried, never applied)", "");
check(T.category === "B" && /5 November 1980/.test(T.standard), "the table is Category B of MIL-F-8785C, 5 November 1980", "");

/* ── 2. EITHER SIDE OF EVERY BOUNDARY ────────────────────────────────── */
console.log("\n2. A mode just inside and just outside each boundary lands on the right level");
const e = 1e-6;
const lv = (r) => r.level;
check(lv(phugoidLevel(0.04, 0.1)) === 1 && lv(phugoidLevel(0.04 - e, 0.1)) === 2 && lv(phugoidLevel(0, 0.1)) === 2 && lv(phugoidLevel(-e, 0.1)) === 3,
  "phugoid: 0.04 is Level 1, a hair below is 2, 0 is 2, a hair below 0 is 3 (a slow divergence)", "");
{ const wn = 0.1; const zeta55 = -Math.log(2) / (55 * wn);   // T2 = 55 s exactly
  check(lv(phugoidLevel(zeta55 + e, wn)) === 3 && lv(phugoidLevel(zeta55 - e, wn)) === null && phugoidLevel(zeta55, wn).timeToDouble_s > 54.99,
    "phugoid: a divergence doubling in 55 s is Level 3, faster is worse than Level 3", `zeta at T2 = 55 s: ${zeta55.toFixed(5)}`); }
{ const na = 10; const at = (cap) => lv(shortPeriodFrequencyLevel(Math.sqrt(cap * na), na));
  check(at(0.085) === 1 && at(0.085 - e) === 2 && at(3.6) === 1 && at(3.6 + e) === 2 && at(0.038) === 2 && at(0.038 - e) === null && at(10.0) === 2 && at(10.0 + e) === 3 && at(50) === 3,
    "short-period frequency: the four printed lines of Figure 2 each switch the level, and above 10.0 is Level 3 with no upper bound", ""); }
check(lv(shortPeriodDampingLevel(0.30)) === 1 && lv(shortPeriodDampingLevel(0.30 - e)) === 2 && lv(shortPeriodDampingLevel(2.0)) === 1 && lv(shortPeriodDampingLevel(2.0 + e)) === 3 && lv(shortPeriodDampingLevel(0.20 - e)) === 3 && lv(shortPeriodDampingLevel(0.15 - e)) === null,
  "short-period damping: 0.30 and 2.00 bound Level 1; above 2.00 falls to Level 3 (no Level 2 ceiling above it); below 0.15 is worse than 3", "");
{ const d = (z, w) => dutchRollLevel(z, w);
  check(lv(d(0.08, 2.0)) === 1 && lv(d(0.08 - e, 2.0)) === 2 && lv(d(0.5, 0.4 - e)) === null && lv(d(0.10, 1.0)) === 2 && d(0.10, 1.0).bindingForNextLevel === "zeta*omega" && lv(d(0.01, 5)) === 3 && lv(d(-e, 5)) === null,
    "Dutch roll: each of the three minima binds on its own, the binding one is named, and omega below 0.4 is worse than 3 at any damping", `0.10 at 1.0 rad/s: zeta*omega ${(0.1).toFixed(2)} < 0.15 -> Level 2, binding ${d(0.10, 1.0).bindingForNextLevel}`); }
check(lv(rollModeLevel(1.4)) === 1 && lv(rollModeLevel(1.4 + e)) === 2 && lv(rollModeLevel(3.0 + e)) === 3 && lv(rollModeLevel(10 + e)) === null && rollModeLevel(0).level === null,
  "roll mode: 1.4 / 3.0 / 10 s switch the level; no time constant refuses", "");

/* ── 3. REFUSALS ─────────────────────────────────────────────────────── */
console.log("\n3. What cannot be levelled is refused, not defaulted");
check(flyingQualities({ applicable: false, note: "rotor-borne" }).applicable === false && /bandwidth|rotor-borne/.test(flyingQualities({ applicable: false }).why),
  "a layout without wing-borne modes refuses, naming ADS-33's bandwidth requirement as the reason no hover level is given", "");
check(flyingQualities({ applicable: true }, { category: "C" }).applicable === false && /not encoded/.test(flyingQualities({ applicable: true }, { category: "A" }).why),
  "Categories A and C refuse: their figures draw floors they do not print", "");

/* ── 4. THE WINGED LAYOUTS ───────────────────────────────────────────── */
console.log("\n4. The four winged layouts: a level per mode, a named worst, the spiral withheld");
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24, reserveMinutes:20, LD:8.5, AR:9,
  eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371, clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3,
  convTolExp:-6, etaHov:0.74, tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5, weightModel:"buildup",
  autoPositionWing:true, targetSM:0.15, fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const caseFor = (key) => { const d = CFG.CONFIG_DEFAULTS[key]; return { ...B, configType: key, nPropHover: d.nRotors,
  propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors }, runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
  vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD, etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
  ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) }; };
const summary = [];
for (const key of ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"]) {
  const p = caseFor(key); const R = runSizing(p); const M = wingModes(R, hoverQualities(p, R).inertia || {}, p);
  const F = flyingQualities(M);
  if (!M.applicable) { check(F.applicable === false, `${key}: rotor-borne -> refused`, F.why.slice(0, 80)); continue; }
  const m = F.modes;
  const levelled = ["phugoid", "shortPeriodFrequency", "shortPeriodDamping", "dutchRoll", "rollMode"].filter((k) => m[k].why == null);
  check(F.applicable && levelled.length >= 4 && F.worst.mode != null && m.spiral.notLevelled && m.spiral.level === null,
    `${key}: ${levelled.length} modes levelled, worst is ${F.worst.mode} at Level ${F.worst.level ?? ">3"}, spiral withheld`,
    `phugoid L${m.phugoid.level ?? ">3"} (zeta ${m.phugoid.zeta}) · sp freq L${m.shortPeriodFrequency.level ?? ">3"} (w2/(n/a) ${m.shortPeriodFrequency.omegaSq_over_nAlpha?.toFixed(3)}, n/a ${m.shortPeriodFrequency.nAlpha}) · sp damp L${m.shortPeriodDamping.level ?? ">3"} (${m.shortPeriodDamping.zeta}) · DR L${m.dutchRoll.level ?? ">3"} (${m.dutchRoll.zeta} @ ${m.dutchRoll.wn}) · roll L${m.rollMode.level ?? ">3"} (${m.rollMode.tau_s} s)`);
  const worstByHand = Math.max(...levelled.map((k) => m[k].level ?? 4));
  check((F.worst.level ?? 4) === worstByHand, `${key}: the worst level is the maximum over the levelled modes`, "");
  summary.push(`${key} L${F.worst.level ?? ">3"} (${F.worst.mode})`);
}
check(/unvalidated|not a statement about an aircraft/i.test(flyingQualities(wingModes(runSizing(caseFor("hybrid")), hoverQualities(caseFor("hybrid"), runSizing(caseFor("hybrid"))).inertia || {}, caseFor("hybrid"))).caveat),
  "the caveat says a level is about the approximation, not an aircraft", summary.join(" · "));

console.log(`\n${bar}`);
console.log(fails.length ? `FLYING-QUALITIES GATE: ${fails.length} FAILED` : "FLYING-QUALITIES GATE PASSED");
process.exit(fails.length ? 1 : 0);
