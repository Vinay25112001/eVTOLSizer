/* =====================================================================
   WING-BORNE MODES GATE
   =====================================================================
   THIS HARNESS VALIDATES NOTHING AGAINST AN AIRCRAFT, AND SAYS SO.

   Zero of 857 eVTOL-relevant corpus papers publish modal data, damping
   ratios or eigenvalues. There is no aircraft to compare against, and no
   amount of work changes that. Everything wing-modes produces is tagged
   `unverified`.

   What CAN be checked are the internal properties the classical theory
   guarantees, which are violated by the arithmetic slips these
   approximations are prone to:

     1. PHUGOID IS THE LANCHESTER IDENTITY. wn = sqrt(2) g / U depends on
        nothing but speed, so it can be checked exactly, and its damping
        zeta = 1 / (sqrt(2) L/D) must agree with the L/D the loop already
        converged on. If either drifts, the trim state is inconsistent.
     2. TIMESCALE SEPARATION. The short period must be far faster than the
        phugoid — that separation is the assumption the two-mode
        decomposition rests on. If they approach each other the
        approximations are invalid and reporting them would be wrong.
     3. ROLL SUBSIDENCE IS THE FASTEST MODE. It is a first-order
        convergence and in any conventional aeroplane it is quicker than
        dutch roll.
     4. STATIC MARGIN GOVERNS SHORT-PERIOD FREQUENCY. wn_sp^2 carries
        -M_alpha, and M_alpha is proportional to -SM. So a bigger static
        margin MUST raise the short-period frequency; that is a prediction
        the module makes and it can be tested by sweeping SM.

   Run: node validation/wing-modes.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { hoverQualities } from "../src/engine/hoverqualities.js";
import { wingModes } from "../src/engine/wingmodes.js";
import * as CFG from "../src/engine/configuration.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

const caseFor = (key, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[key];
  return { ...B, configType: key, nPropHover: d.nRotors,
    /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
    etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}), ...over };
};
const modesFor = (p) => { const R = runSizing(p); return { R, M: wingModes(R, hoverQualities(p, R).inertia || {}, p) }; };

console.log("WING-BORNE MODES GATE");
console.log(bar);
console.log("nothing here is compared to an aircraft: 0 of 857 corpus papers publish");
console.log("eVTOL modal data. These are the theory's own internal guarantees.\n");

const WINGED = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor"];
const rows = [];
for (const key of WINGED) {
  const p = caseFor(key);
  const { R, M } = modesFor(p);
  if (!M.applicable) { console.log(`  (${key}: not applicable)`); continue; }
  rows.push({ key, p, R, M });
  console.log(`   ${key.padEnd(13)} phugoid ${String(M.phugoid.period_s).padStart(6)}s z=${String(M.phugoid.zeta).padStart(6)}` +
    `   sp wn=${String(M.shortPeriod.wn).padStart(6)} z=${String(M.shortPeriod.zeta).padStart(6)}` +
    `   dr wn=${String(M.dutchRoll.wn).padStart(6)} z=${String(M.dutchRoll.zeta).padStart(6)}` +
    `   roll tau ${M.rollSubsidence.tau_s}s`);
}
console.log("");

check(rows.length === WINGED.length, "modes resolve on every winged layout", `${rows.length} of ${WINGED.length}`);

/* 1. the Lanchester identity, exactly */
const ph = rows.filter(r => {
  const wnPred = Math.SQRT2 * 9.80665 / r.p.vCruise;
  const zPred = 1 / (Math.SQRT2 * r.R.LDact);
  return Math.abs(r.M.phugoid.wn / wnPred - 1) > 0.001 ||
         Math.abs(r.M.phugoid.zetaClassic / zPred - 1) > 0.001;
});
check(ph.length === 0,
  "the CLASSICAL phugoid is the Lanchester identity in the loop's own U and L/D",
  ph.length ? ph.map(r => r.key).join(", ")
    : "wn = sqrt(2)g/U and zetaClassic = 1/(sqrt(2) L/D) reproduced on every layout");

/* 1b. the aero-propulsive correction must ADD damping, never remove it.
   Thrust falls with speed on a power-limited aircraft, and a thrust lapse is
   an extra -X_u, which is what damps the phugoid. A correction that reduced
   damping would be a sign error. */
const lapse = rows.filter(r => !(r.M.phugoid.zeta > r.M.phugoid.zetaClassic));
check(lapse.length === 0,
  "the thrust lapse ADDS phugoid damping, as -X_u requires",
  lapse.length ? lapse.map(r => r.key).join(", ")
    : rows.map(r => `${r.key} ${r.M.phugoid.zetaClassic}->${r.M.phugoid.zeta}`).join(", "));

/* 2. timescale separation — the assumption the decomposition rests on */
const sep = rows.filter(r => !(r.M.shortPeriod.wn > 5 * r.M.phugoid.wn));
check(sep.length === 0,
  "short period and phugoid stay well separated, so the approximations hold",
  sep.length ? sep.map(r => `${r.key} ratio ${(r.M.shortPeriod.wn / r.M.phugoid.wn).toFixed(1)}`).join(", ")
    : `frequency ratios ${rows.map(r => (r.M.shortPeriod.wn / r.M.phugoid.wn).toFixed(0)).join(", ")} — an order of magnitude apart`);

/* 3. roll subsidence is the quickest mode */
const roll = rows.filter(r => !(r.M.rollSubsidence.tau_s < r.M.dutchRoll.period_s));
check(roll.length === 0,
  "roll subsidence converges faster than a dutch roll cycle",
  roll.length ? roll.map(r => r.key).join(", ") : "on every layout");

/* 4. the prediction: more static margin -> faster short period */
{
  const p1 = caseFor("liftcruise", { targetSM: 0.08, autoPositionWing: true });
  const p2 = caseFor("liftcruise", { targetSM: 0.25, autoPositionWing: true });
  const a = modesFor(p1).M, b2 = modesFor(p2).M;
  const ok = a.applicable && b2.applicable && b2.shortPeriod.wn > a.shortPeriod.wn;
  check(ok, "a larger static margin raises the short-period frequency, as -M_alpha requires",
    a.applicable && b2.applicable
      ? `SM 0.08 -> wn ${a.shortPeriod.wn}, SM 0.25 -> wn ${b2.shortPeriod.wn}`
      : "one case did not resolve");
}

/* 5. the spiral verdict must NOT be issued */
const spiral = rows.filter(r => r.M.spiral.stable !== null);
check(spiral.length === 0,
  "no spiral stability verdict is issued, because Cl_beta is not computed",
  spiral.length ? "a verdict leaked out" : "parameter withheld rather than manufactured from an assumed Cl_beta");

/* ── AERO-PROPULSIVE COUPLING ─────────────────────────────────────────
   The configuration question this module got wrong first time: WHICH rotors
   blow the wing. A lift+cruise stops its lift rotors and pushes from the
   tail, so nothing blows its wing in cruise; a tiltrotor's proprotors sit on
   the leading edge and blow all of it. A first version applied hover thrust
   from every rotor and reported 30% lift augmentation on the one layout that
   has none. */
{
  const { aeroPropulsive, ROTOR_AIRFRAME_THRUST_LOSS } = await import("../src/engine/aeropropulsive.js");
  const { aircraftGeometry } = await import("../src/engine/geometry.js");
  const apRows = [];
  for (const key of WINGED) {
    const p = caseFor(key);
    const R = runSizing(p);
    const g = aircraftGeometry(p, R);
    const rot = g.bodies.filter(x => x.kind === "rotor")
      .map(r => ({ ...r, blowsWing: r.tilting === true && !r.stopped }));
    const AP = aeroPropulsive({
      thrustTotal: R.MTOW * 9.80665, cruiseThrust: (R.MTOW * 9.80665) / (R.LDact || 10),
      rotors: rot, V: p.vCruise, rho: R.rhoCr || 1.1, Swing: R.Swing, bWing: R.bWing,
      viHover: 10, wingBorne: !!R.Swing });
    apRows.push({ key, AP, blowers: rot.filter(r => r.blowsWing).length });
  }
  const lc = apRows.find(r => r.key === "liftcruise");
  check(lc && lc.blowers === 0 && lc.AP.slipstream?.liftAugmentation === 1,
    "the lift+cruise gets NO slipstream blowing, because nothing blows its wing",
    lc ? `${lc.blowers} blowing rotors, augmentation ${lc.AP.slipstream?.liftAugmentation}` : "missing");

  const tr = apRows.find(r => r.key === "tiltrotor");
  check(tr && tr.blowers > 0 && tr.AP.slipstream.liftAugmentation > 1,
    "and the tiltrotor does, because its proprotors sit on the leading edge",
    tr ? `${tr.blowers} blowing rotors, augmentation ${tr.AP.slipstream.liftAugmentation}` : "missing");

  const loss = apRows.every(r => r.AP.thrustLossFraction >= ROTOR_AIRFRAME_THRUST_LOSS.lo &&
                                 r.AP.thrustLossFraction <= ROTOR_AIRFRAME_THRUST_LOSS.hi);
  check(loss, "rotor-airframe thrust loss stays inside the measured 10-12% band",
    "NASA Langley quadrotor, Altamirano & McCrink: nearly 12% less thrust actually produced");

  const aug = apRows.filter(r => r.AP.slipstream && r.AP.slipstream.liftAugmentation < 1);
  check(aug.length === 0, "blowing never REDUCES lift",
    aug.length ? aug.map(r => r.key).join(", ") : "augmentation >= 1 on every layout");
}

console.log(`\n  OBSERVED, NOT VALIDATED, and worth a reader's attention:`);
for (const r of rows) {
  if (r.M.shortPeriod.zeta != null && r.M.shortPeriod.zeta < 0.3)
    console.log(`    ${r.key}: short-period damping ${r.M.shortPeriod.zeta} is below the 0.3 that`);
}
console.log(`    MIL-F-83300 and AGARD required of V/STOL aircraft. That is a MILITARY`);
console.log(`    specification and DOT/FAA/TC-23/59 (2024) states such thresholds are`);
console.log(`    "not requirements in civil certification". Reported, not gated.`);

console.log(`\n${bar}`);
console.log(fails.length ? `WING-BORNE MODES GATE FAILED: ${fails.length}` : "WING-BORNE MODES GATE PASSED");
process.exit(fails.length ? 1 : 0);
