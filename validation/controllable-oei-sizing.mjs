/* =====================================================================
   SIZING T/W FOR CONTROLLABLE ONE-ROTOR-OUT
   =====================================================================
   twRatioFor sizes installed thrust to REPLACE the failed rotor's lift,
   from NASA's published OEI power-factor band. Holding attitude after the
   failure additionally requires the survivors to trim the asymmetry, and
   validation/spin-arrangement.mjs measured that this needs more margin.

   solveControllableTW closes that loop: it iterates margin, geometry and
   spin arrangement together, because the required margin depends on the
   converged ring radius and torque-to-thrust ratio, which depend on the
   margin. Same fixed point as solveRotorDiameter and the same pattern.

   THE RESULT IS A CONFIGURATION-SELECTION STATEMENT, not a tuning knob.
   Rotor count dominates: twelve rotors buy full single-failure tolerance
   for almost no weight, six pay heavily for partial tolerance, and four
   cannot buy it at any price.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

const mk = (k, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD,
    etaHov:d.etaHov ?? B.etaHov, ...over };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};

console.log("CONTROLLABLE ONE-ROTOR-OUT SIZING GATE");
console.log("=".repeat(78));
console.log("\n  layout          thrust T/W   controllable T/W   MTOW base   sized   delta %   achieves");

const rows = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const base = runSizing(mk(k, { twRatio: CFG.twRatioFor(k, d.nRotors) }));
  const S = CFG.solveControllableTW(k, mk(k), runSizing, { target: "any" });
  if (!S || !S.attainable) {
    rows.push({ k, N: d.nRotors, attainable: false, reason: S?.reason || "n/a" });
    console.log("  " + k.padEnd(14) + (CFG.twRatioFor(k, d.nRotors)?.toFixed(3) ?? "—").padStart(12)
      + "                  —" + String(base ? Math.round(base.MTOW) : "—").padStart(12)
      + "       —         —   not attainable");
    continue;
  }
  const up = runSizing(mk(k, { twRatio: S.twRatio, rotorSpins: S.rotorSpins }));
  const got = up?.oeiControllability;
  rows.push({ k, N: d.nRotors, attainable: true, tw: S.twRatio, base: base.MTOW,
              sized: up.MTOW, got: got?.survivable ?? 0, of: got?.of ?? d.nRotors });
  console.log("  " + k.padEnd(14) + S.twThrustReplacement.toFixed(3).padStart(12)
    + S.twRatio.toFixed(3).padStart(19) + String(Math.round(base.MTOW)).padStart(12)
    + String(Math.round(up.MTOW)).padStart(8)
    + (100 * (up.MTOW - base.MTOW) / base.MTOW).toFixed(1).padStart(10)
    + "   " + (got ? `${got.survivable}/${got.of}` : "—"));
}

/* ── 0. the shipped margin satisfies BOTH published criteria ─────────
   Nothing else in the suite covers twRatioFor's OUTPUT: golden-master pins
   twRatio explicitly at 1.3 so it tests the engine at fixed inputs, and both
   benchmarks set it per vehicle from published values. A change to the
   configuration default was therefore invisible to every gate. */
const twBad = [];
for (const [k, d] of Object.entries(CFG.CONFIG_DEFAULTS)) {
  const b = CFG.twRatioBasis(k, d.nRotors);
  const tw = CFG.twRatioFor(k, d.nRotors);
  if (tw < CFG.NZ_CONTINUOUS_TORQUE_MIN - 1e-9) twBad.push(k + "=" + tw + " below torque floor");
  if (tw < b.oei - 1e-9) twBad.push(k + "=" + tw + " below OEI replacement " + b.oei);
}
check(twBad.length === 0,
  "the shipped thrust margin satisfies both published criteria at once",
  twBad.length ? twBad.join("; ")
    : "every layout clears NASA S3270's OEI replacement AND the VFS 2025 "
      + "continuous-torque floor of " + CFG.NZ_CONTINUOUS_TORQUE_MIN + " g; n_z = 1.35 is a "
      + "power factor of 1.568, inside NASA's published 1.3-1.8 band, so meeting the "
      + "stricter one does not leave the other's range");

/* ── 1. what it sizes for is what it gets ───────────────────────────── */
const inconsistent = rows.filter(r => r.attainable && r.got < 1);
check(inconsistent.length === 0,
  "an aircraft sized for controllable one-rotor-out achieves it",
  inconsistent.length
    ? "sized but not achieved on: " + inconsistent.map(r => r.k).join(", ")
      + " — the sizing solver and the engine's own verification disagree"
    : "the solver's target and engine/controlauthority.js's independent verdict on the "
      + "sized aircraft agree on every attainable layout");

/* ── 2. four rotors are reported unattainable, not sized heavier ────── */
const quads = rows.filter(r => r.N === 4);
check(quads.length > 0 && quads.every(r => !r.attainable),
  "a four-rotor layout is reported unattainable rather than sized towards an asymptote",
  "three surviving rotors cannot span the four-axis allocation while balancing reaction "
  + "torque, so yaw is lost at any margin. Sizing heavier would spend weight and buy "
  + "nothing, and a solver that kept climbing would never terminate.");

/* ── 3. rotor count dominates, and the gate states the trade ────────── */
const twelve = rows.find(r => r.N === 12 && r.attainable);
const six = rows.filter(r => r.N === 6 && r.attainable);
if (twelve && six.length) {
  const cost12 = 100 * (twelve.sized - twelve.base) / twelve.base;
  const cost6 = six.map(r => 100 * (r.sized - r.base) / r.base);
  check(cost12 <= 0.1 && Math.min(...cost6) > 5,
    "rotor count, not thrust margin, is the dominant fault-tolerance variable",
    `twelve rotors reach ${twelve.got}/${twelve.of} controllable failures for `
    + `${cost12.toFixed(1)}% MTOW — the continuous-torque floor of 1.35 already exceeds `
    + `the margin controllability needs there, so it costs nothing at all. Six rotors `
    + `reach ${six[0].got}/${six[0].of} for ${cost6.map(c => c.toFixed(1)).join("% and ")}%, `
    + "and four rotors cannot buy it at any price. The layout decides this; buying "
    + "margin afterwards barely moves it.");
}

console.log("\n   SCOPE. This is a DESIGN mode, invoked through solveControllableTW.");
console.log("   The benchmarks keep thrust-replacement sizing, because their job is to");
console.log("   reproduce published aircraft as their designers sized them — not to");
console.log("   re-size NASA's vehicles to a requirement NASA did not apply.");

console.log("");
console.log(fails.length ? `CONTROLLABLE OEI SIZING GATE FAILED: ${fails.length} check(s)`
                         : "CONTROLLABLE OEI SIZING GATE PASSED");
process.exit(fails.length ? 1 : 0);
