/* =====================================================================
   WHICH BATTERY CONSTRAINT ACTUALLY BINDS
   =====================================================================
   The pack is sized as the heavier of two requirements:

       W_E = E_total / (SED_eff)            enough ENERGY for the mission
       W_P = P_hover / SP                   enough POWER to hover at all
       W_battery = max(W_E, W_P)

   A reviewer of the companion paper made an observation that is worth
   taking seriously as a question about the MODEL rather than about the
   prose: if W_E exceeds W_P at every point that was reported, then the
   power constraint changed nothing, and any weight difference attributed
   to "dual constraints" was really caused by whatever else changed at the
   same time -- adding full-mission energy instead of cruise-only, adding
   SOC margin, adding round-trip efficiency.

   That is a falsifiable claim about this engine, so it is measured here
   rather than argued. The gate does not assert that one constraint wins.
   It asserts that we KNOW which one wins, everywhere, and that the
   crossover -- if it exists -- is located rather than assumed.

   WHAT MAKES THE POWER SIDE BIND. W_P/W_E rises when hover power is large
   relative to mission energy, i.e. SHORT missions with heavy hover: the
   energy need falls with range while the hover power does not fall at all.
   So range is the sweep variable, and the crossover range is the number
   worth reporting.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

const build = (k, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD,
    etaHov:d.etaHov ?? B.etaHov, ...over };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};

console.log("BATTERY BINDING-CONSTRAINT GATE");
console.log("=".repeat(78));

/* ── 1. AT THE REFERENCE MISSION, WHICH SIDE WINS ON EACH LAYOUT ────── */
console.log("\nAt the reference mission (455 kg, 161 km total):\n");
console.log("   layout          W_E kg   W_P kg   W_P/W_E   binding");
const atRef = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const S = runSizing(build(k));
  if (!S || !Number.isFinite(S.WE_kg)) continue;
  const r = S.WP_kg / S.WE_kg;
  atRef.push({ k, WE:S.WE_kg, WP:S.WP_kg, r, power:S.battPowerLimited });
  console.log("   %s %s %s %s   %s", k.padEnd(14),
    S.WE_kg.toFixed(1).padStart(7), S.WP_kg.toFixed(1).padStart(8),
    r.toFixed(3).padStart(8), S.battPowerLimited ? "POWER" : "energy");
}
check(atRef.length >= 5, "every layout reports both constraints",
  `${atRef.length} layouts sized, W_E and W_P both finite on each`);

/* ── 2. THE CROSSOVER, BY BISECTION ──────────────────────────────────
   A COARSE SWEEP GOT THIS WRONG AND THE ERROR WAS PUBLISHED. Walking a
   fixed list [161,120,90,70,...] and keeping the largest sampled range at
   which W_P wins does not return the crossover -- it returns the lower
   bracket of the interval containing it. That reported 90 km for three
   layouts whose true crossover is 111-116 km. Bisect instead. */
console.log("\nCrossover range by bisection (0.5 km tolerance), reserve at 20 min:\n");
console.log("   layout          crossover        r at 161 km   r at 10 km");
const ratio = (k, R, res) => {
  const S = runSizing(build(k, { range: R, reserveMinutes: res ?? B.reserveMinutes }));
  return (S && S.WE_kg > 0) ? S.WP_kg / S.WE_kg : NaN;
};
const crossings = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  let lo = 2, hi = 161;
  const rLo = ratio(k, lo), rHi = ratio(k, hi);
  let cross = null;
  if (rLo >= 1 && rHi < 1) {
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (ratio(k, m) >= 1) lo = m; else hi = m; }
    cross = (lo + hi) / 2;
  }
  crossings.push({ k, cross });
  console.log("   %s %s   %s   %s", k.padEnd(14),
    (cross === null ? "none in 2-161 km" : `${cross.toFixed(1)} km`).padStart(16),
    rHi.toFixed(3).padStart(11), ratio(k, 10).toFixed(3).padStart(10));
}

/* ── 3. AND THE RESERVE MOVES IT, WHICH THE FIRST PASS MISSED ────────
   "The rotor-borne layouts never become power-limited" was published as a
   property of those configurations. It is not. A fixed 20-minute reserve is
   a large CONSTANT floor under mission energy: as range falls, E_total does
   not fall towards zero, it falls towards the reserve. Shorten the reserve
   and the floor drops with it, and both rotor-borne layouts cross too.

   So the binding constraint is a function of TWO mission variables, not one,
   and any claim about which side governs must name both. */
console.log("\nW_P/W_E at 10 km, against reserve — the no-crossing result is conditional:\n");
console.log("   layout           20 min    10 min     5 min     0 min");
let reserveFlips = 0;
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const r = [20, 10, 5, 0].map(res => ratio(k, 10, res));
  if (r[0] < 1 && r.some(v => v >= 1)) reserveFlips++;
  console.log("   %s%s", k.padEnd(14),
    r.map(v => (Number.isFinite(v) ? v.toFixed(3) : "n/a").padStart(10)).join(""));
}
check(true, "the reserve's effect on the binding constraint is measured",
  reserveFlips > 0
    ? `${reserveFlips} layout(s) that are energy-governed at a 20-min reserve become `
      + "POWER-governed at a shorter one — 'never power-limited' is a statement about "
      + "the reserve, not about the configuration"
    : "no layout changes its binding constraint with reserve");

const everBinds = crossings.some(c => c.cross !== null);
check(everBinds, "the power constraint binds somewhere in the swept space",
  `${crossings.filter(c => c.cross !== null).length} of ${crossings.length} layouts cross within 2-161 km at a 20-min reserve`);

console.log("");
console.log(fails.length ? `BATTERY BINDING GATE FAILED: ${fails.length} check(s)`
                         : "BATTERY BINDING GATE PASSED");
process.exit(fails.length ? 1 : 0);
