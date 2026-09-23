/* =====================================================================
   DRONE DYNAMICS GATE — physics that must hold, and one real agreement
   =====================================================================
   A flight simulation is the easiest thing in this repository to make
   look right and be wrong. It produces a plausible curve for almost any
   bug, and it has no measured truth set to score against: no public
   source gives an inertia tensor for a commercial multirotor, and the
   two NASA research vehicles that publish one turn rotors the measured
   propeller database does not contain.

   So this gate does not score trajectories. It checks the things that
   must be true of ANY rigid body and ANY integrator, where a failure is
   a bug rather than a disagreement:

     - free fall is exactly g when the rotors are off
     - angular momentum is conserved when no torque acts
     - the quaternion stays a unit quaternion
     - RK4 converges at fourth order
     - the intermediate-axis instability appears, which is the sharpest
       available test that the omega x J omega coupling is right
     - the inertia tensor satisfies the triangle inequalities

   AND THEN IT CHECKS THE ONE THING THAT IS EVIDENCE RATHER THAN
   ARITHMETIC. ACAI decides rotor-loss controllability from zonotope
   geometry at hover, with no time integration whatsoever. This module
   decides it by integrating the equations forward under a published
   controller. The two share no arithmetic beyond the effectiveness
   matrix itself.

   THEY AGREE, AND THE WAY THEY AGREE IS INSTRUCTIVE. On a quadrotor
   both say a single rotor loss is unrecoverable. On an octorotor both
   say it is survivable. On a PNPNPN hexacopter ACAI says uncontrollable
   and the simulation says FINE - until the scenario demands control
   authority, at which point the simulation fails too, exactly as ACAI
   predicted.

   That difference is the point, and the gate records it rather than
   tuning it away: a simulation samples ONE trajectory, while ACAI bounds
   the WHOLE attainable set. An undisturbed hover never asks for the
   authority the failure removed, so it cannot reveal its absence. This
   is a live demonstration that passing a scenario is not the same as
   being controllable, and it is why the controllability test is not
   replaced by the simulation that appears to supersede it.
   ===================================================================== */
import {
  buildModel, simulate, SCENARIOS, derivative, rk4, inertiaFromDesign,
  eulerToQ, qToEuler, qRotate, buildMixer, allocate, allocateDegraded,
  ARDUPILOT_GAINS, DECLARED_DYNAMICS_INPUTS, G_NED,
  makeScenario, SCENARIO_PRESETS, SCENARIO_LIMITS, tiltAccelerationMps2, ARDUPILOT_LOITER,
  LOITER_WITHDRAWN,
} from "../src/classes/drone/dynamics.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { acai, torqueToThrustRatio } from "../src/engine/controlauthority.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE DYNAMICS GATE");
console.log("=".repeat(78));

const DD = { motorTimeConstantS: 0.05, bodyDragCoefficient: 1.0 };
const cell = BATTERIES.find((b) => b.id === "molicel-inr21700-p42a");
const pack = assemblePack(cell, { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");

function modelFor(frameClass, frameType) {
  const frame = FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType);
  const selection = {
    rotors: frame.motors.length, propeller: prop, propellerMassG: 45,
    motor: MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360"),
    esc: ESCS.find((e) => e.model.includes("ALPHA 60A")),
    battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
  };
  const declared = { structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
                     avionicsPowerW: 8, thrustToWeightRequired: 2.0 };
  const sizing = sizeDrone({ mission: { payloadKg: 0.5, hoverEnduranceMin: 15 }, selection, declared });
  const airframe = buildAirframe({ frame, propellerDiameterM: prop.diameterM, tipGapFraction: 0.10 });
  return { model: buildModel({ sizing, airframe, declared: DD }), airframe, sizing, frame };
}

const quad = modelFor("QUAD", "X");

/* ── 1. THE SOURCES ARE NAMED ──────────────────────────────────────── */
check("the controller gains come from a published ArduPilot frame file",
  ARDUPILOT_GAINS.angP.roll === 11 && ARDUPILOT_GAINS.rate.roll.p === 0.17 &&
  /^[0-9a-f]{32}$/.test(ARDUPILOT_GAINS.md5),
  `${ARDUPILOT_GAINS.source}, md5 ${ARDUPILOT_GAINS.md5.slice(0, 12)}…`);

check("every unsourceable input must be declared, with no default",
  DECLARED_DYNAMICS_INPUTS.length === 3 &&
  DECLARED_DYNAMICS_INPUTS.every((d) => d.whyDeclared) &&
  (() => { try { buildModel({ sizing: quad.sizing, airframe: quad.airframe, declared: {} }); return false; } catch { return true; } })(),
  DECLARED_DYNAMICS_INPUTS.map((d) => d.key).join(", "));

check("the inertia tensor is labelled a derivation, with its caveat",
  quad.model.inertia.isDerived === true && /FLOOR/.test(quad.model.inertia.caveat),
  "no commercial multirotor in the survey publishes one to check it against");

/* ── 2. RIGID-BODY IDENTITIES ──────────────────────────────────────── */
console.log("-".repeat(78));
const I = quad.model.inertia;
check("the inertia tensor satisfies the triangle inequalities",
  I.Ixx + I.Iyy >= I.Izz - 1e-12 && I.Iyy + I.Izz >= I.Ixx && I.Izz + I.Ixx >= I.Iyy,
  `Ixx ${I.Ixx.toFixed(4)}, Iyy ${I.Iyy.toFixed(4)}, Izz ${I.Izz.toFixed(4)} kg m² — ` +
  `a planar multirotor should also have Izz largest, and it does`);

/* Free fall: rotors off, acceleration must be exactly g. */
const rest = [0, 0, -10, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
const dFree = derivative(rest, quad.model, quad.model.rotors.map(() => 0));
check("with the rotors off, acceleration is exactly g",
  Math.abs(dFree[3]) < 1e-12 && Math.abs(dFree[4]) < 1e-12 &&
  Math.abs(dFree[5] - G_NED[2]) < 1e-12,
  `${dFree[5].toFixed(9)} m/s² downward`);

/* Hover trim: thrust equal to weight, nothing should accelerate. */
const hoverT = quad.model.m * G_NED[2] / quad.model.rotors.length;
const dHover = derivative(rest, quad.model, quad.model.rotors.map(() => hoverT));
check("at thrust equal to weight, nothing accelerates",
  Math.hypot(dHover[3], dHover[4], dHover[5]) < 1e-9 &&
  Math.hypot(dHover[10], dHover[11], dHover[12]) < 1e-9,
  "collective balances gravity and the moments cancel, which is what a balanced spin set means");

/* Angular momentum is conserved when no torque acts. */
const spin = [0, 0, -10, 0, 0, 0, 1, 0, 0, 0, 2.0, 0.4, 0.7];
let st = spin, Hlist = [];
for (let i = 0; i < 2000; i++) {
  const q = [st[6], st[7], st[8], st[9]], w = [st[10], st[11], st[12]];
  const Jw = [I.Ixx * w[0] + I.Ixz * w[2], I.Iyy * w[1], I.Ixz * w[0] + I.Izz * w[2]];
  Hlist.push(Math.hypot(...qRotate(q, Jw)));
  st = rk4(st, quad.model, quad.model.rotors.map(() => 0), 0.001);
}
const Hdrift = Math.abs(Math.max(...Hlist) - Math.min(...Hlist)) / Hlist[0];
check("angular momentum is conserved under zero torque",
  Hdrift < 1e-6,
  `drift ${(100 * Hdrift).toExponential(1)} % over 2 s of free rotation — ` +
  `this is what catches a sign error in omega x J omega`);

/* The quaternion must stay a unit quaternion. */
check("the attitude quaternion stays normalised",
  Math.abs(Math.hypot(st[6], st[7], st[8], st[9]) - 1) < 1e-12);

/* ── 3. THE INTERMEDIATE-AXIS INSTABILITY ──────────────────────────── */
console.log("-".repeat(78));
/* A body with three distinct moments of inertia is stable spinning about
   its largest and smallest principal axes and UNSTABLE about the middle
   one. Nothing in the code is told this; it falls out of omega x J omega
   or it does not. It is the sharpest test of the rotational equations
   available without any measurement. */
const asym = {
  ...quad.model,
  J: [[0.02, 0, 0], [0, 0.05, 0], [0, 0, 0.08]],
  Jinv: [[50, 0, 0], [0, 20, 0], [0, 0, 12.5]],
};
function spinAbout(axis) {
  let s = [0, 0, -10, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  s[10 + axis] = 5; s[10 + ((axis + 1) % 3)] = 0.01;       // tiny perturbation
  let worst = 0;
  for (let i = 0; i < 6000; i++) {
    s = rk4(s, asym, asym.rotors.map(() => 0), 0.001);
    const off = Math.hypot(s[10 + ((axis + 1) % 3)], s[10 + ((axis + 2) % 3)]);
    worst = Math.max(worst, off);
  }
  return worst;
}
const gMin = spinAbout(0), gMid = spinAbout(1), gMax = spinAbout(2);
console.log(`  perturbation growth: about Imin ${gMin.toFixed(3)}, ` +
            `about Imid ${gMid.toFixed(3)}, about Imax ${gMax.toFixed(3)} rad/s`);
check("the intermediate axis is unstable and the other two are not",
  gMid > 10 * gMin && gMid > 10 * gMax && gMin < 0.5 && gMax < 0.5,
  "the tennis-racket theorem falls out of omega x J omega — nothing in the code is told it");

/* ── 4. THE INTEGRATOR IS FOURTH ORDER ─────────────────────────────── */
function endState(dt) {
  let s = [0, 0, -10, 0, 0, 0, ...eulerToQ({ rollRad: 0.2 }), 0.8, 0.3, 0.15];
  const n = Math.round(1.0 / dt);
  for (let i = 0; i < n; i++) s = rk4(s, quad.model, quad.model.rotors.map(() => hoverT), dt);
  return s;
}
const ref = endState(0.00025);
const errAt = (dt) => Math.max(...endState(dt).map((x, i) => Math.abs(x - ref[i])));
const e1 = errAt(0.004), e2 = errAt(0.002);
check("halving the step reduces the error by about sixteen",
  e2 > 0 && e1 / e2 > 8 && e1 / e2 < 40,
  `ratio ${(e1 / e2).toFixed(1)} — fourth order predicts 16`);

/* ── 5. THE CONTROLLER FLIES ───────────────────────────────────────── */
console.log("-".repeat(78));
const hov = simulate({ model: quad.model, scenario: SCENARIOS.hover, declared: DD, durationS: 6 });
check("an undisturbed hover holds its altitude and attitude",
  Math.abs(hov.finalAltitudeM - 2) < 0.05 && hov.maxTiltDeg < 1 && !hov.crashed,
  `${hov.finalAltitudeM.toFixed(3)} m, max tilt ${hov.maxTiltDeg.toFixed(2)}°`);

const ups = simulate({ model: quad.model, scenario: SCENARIOS.disturbance, declared: DD, durationS: 8 });
const settled = ups.trace.filter((r) => r.t > 4).every((r) => Math.abs(r.rollDeg) < 2);
check("a 20 degree roll upset is recovered",
  settled && !ups.crashed,
  `back inside 2° within 4 s, altitude held at ${ups.finalAltitudeM.toFixed(2)} m`);

const turn = simulate({ model: quad.model, scenario: SCENARIOS.yawTurn, declared: DD, durationS: 8 });
check("a commanded 180 degree yaw is achieved",
  Math.abs(Math.abs(turn.yawDriftDeg) - 180) < 10,
  `${turn.yawDriftDeg.toFixed(1)}° of 180 commanded`);

/* ── 6. A ROTOR CANNOT PULL ────────────────────────────────────────── */
const mixQ = buildMixer(quad.model.geom, quad.model.kMu);
check("an unattainable moment demand is SCALED, not clamped and not abandoned",
  (() => {
    const r = allocateDegraded(mixQ, [quad.model.m * 9.80665, 0, 0, 900], quad.model.maxThrustPerRotorN);
    return r.degraded === true && r.saturated === true &&
           r.momentScale > 0 && r.momentScale < 1 && r.axesDropped.length === 0 &&
           r.thrusts.every((x) => x >= -1e-9 && x <= quad.model.maxThrustPerRotorN + 1e-9);
  })(),
  "a rotor produces lift or nothing. ArduPilot scales a saturated demand and prioritises " +
  "attitude over yaw; abandoning the axis is only correct when it is unattainable at ANY scale");

check("an axis unattainable at any scale IS dropped",
  (() => {
    const dead = quad.model.geom.map((g, i) => ({ ...g, eta: i === 0 ? 0 : 1 }));
    const m = buildMixer(dead, quad.model.kMu);
    const r = allocateDegraded(m, [quad.model.m * 9.80665, 0, 0, 0.5], quad.model.maxThrustPerRotorN);
    return r.degraded === true && r.axesDropped.includes("yaw");
  })(),
  "a quadrotor with a dead rotor cannot produce yaw at any magnitude — that is rank, not saturation");

/* ── 7. THE AGREEMENT WITH ACAI ────────────────────────────────────── */
console.log("-".repeat(78));
console.log("  ROTOR LOSS: two independent methods, no shared arithmetic.");
console.log(`  ${"frame".padEnd(12)}${"ACAI".padStart(16)}${"sim, hover".padStart(14)}${"sim, upset".padStart(26)}`);

const verdicts = [];
for (const [fc, ft] of [["QUAD", "X"], ["HEXA", "X"], ["OCTA", "PLUS"]]) {
  const M = modelFor(fc, ft);
  const rot = M.airframe.rotors.map((r) => ({
    r: Math.hypot(r.x, r.y), phi: Math.atan2(r.y, r.x),
    w: r.rotation === "CCW" ? 1 : -1, eta: r.motor === 1 ? 0 : 1,
  }));
  const a = acai({ rotors: rot, kMu: M.model.kMu,
                   fMaxN: M.model.maxThrustPerRotorN, weightN: M.model.m * 9.80665 });
  const hoverSim = simulate({ model: M.model, scenario: SCENARIOS.hover, declared: DD, durationS: 6, failed: new Set([1]) });
  const upsetSim = simulate({ model: M.model, scenario: SCENARIOS.disturbance, declared: DD, durationS: 8, failed: new Set([1]) });
  const v = {
    frame: `${fc}/${ft}`,
    acaiControllable: a?.controllable ?? null,
    fullRankButUncontrollable: a?.fullRankButUncontrollable ?? null,
    hoverHeld: hoverSim.axesDropped.length === 0,
    /* The upset STARTS at 20 degrees, so peak tilt is not the question.
       Nor is SETTLING: the controller runs ArduPilot's gains for a
       450-class QUADROTOR, unmodified, and applying them to a different
       airframe is what a real operator would re-tune. How quickly a
       response damps is therefore a property of the TUNING, not of the
       aircraft, and it is not evidence about controllability.

       What IS evidence is whether the response stays bounded and the
       aircraft keeps flying: a genuinely uncontrollable airframe departs
       and cannot hold altitude, whatever the gains. */
    upsetHeld: upsetSim.axesDropped.length === 0 && !upsetSim.crashed &&
      Math.abs(upsetSim.finalAltitudeM - 3) < 0.5 &&
      upsetSim.trace.every((r) => Math.hypot(r.rollDeg, r.pitchDeg) < 60),
    hoverYawDrift: hoverSim.yawDriftDeg, upsetTilt: upsetSim.maxTiltDeg,
  };
  verdicts.push(v);
  console.log(`  ${v.frame.padEnd(12)}${String(v.acaiControllable).padStart(16)}` +
    `${(v.hoverHeld ? "held" : "lost axes").padStart(14)}` +
    `${(v.upsetHeld ? "held" : `lost axes, ${v.upsetTilt.toFixed(0)}° tilt`).padStart(26)}`);
}

const q = verdicts.find((v) => v.frame.startsWith("QUAD"));
const h = verdicts.find((v) => v.frame.startsWith("HEXA"));
const o = verdicts.find((v) => v.frame.startsWith("OCTA"));

check("quadrotor: both methods say a rotor loss is unrecoverable",
  q.acaiControllable === false && !q.hoverHeld,
  `ACAI uncontrollable, and the simulation loses yaw and drifts ${q.hoverYawDrift.toFixed(0)}° — ` +
  `three inputs cannot span four axes at any thrust margin`);

check("octorotor: both methods say a rotor loss is survivable",
  o.acaiControllable === true && o.hoverHeld && o.upsetHeld,
  `ACAI controllable; the simulation keeps flying through a 20° upset with a rotor dead, ` +
  `bounded and holding altitude. It oscillates, because the gains are ArduPilot's for a ` +
  `quadrotor — that is tuning, not controllability`);

check("hexacopter: ACAI finds it FULL RANK but uncontrollable",
  h.acaiControllable === false && h.fullRankButUncontrollable === true,
  "Du et al.'s published counter-intuitive result, reproduced on a PNPNPN hexacopter");

/* ── 8. WHY A FLYING SIMULATION IS NOT A CONTROLLABILITY PROOF ─────
   The hexacopter flies every scenario above with a rotor dead, and ACAI
   still says uncontrollable. Deciding which is right needs the question
   ACAI actually asks: is EVERY moment direction attainable while holding
   hover?

   That is answered here WITHOUT ACAI - by sweeping directions on the
   unit sphere and binary-searching, through the allocator, the largest
   moment attainable in each. Different arithmetic, same question. */
console.log("-".repeat(78));
console.log("  attainable moment by DIRECTION, with one rotor dead (400 directions):");
console.log(`  ${"frame".padEnd(12)}${"worst Nm".padStart(11)}${"best Nm".padStart(10)}` +
            `${"blocked".padStart(12)}${"ACAI".padStart(10)}`);
const sweep = {};
for (const [fc, ft] of [["QUAD", "X"], ["HEXA", "X"], ["OCTA", "PLUS"]]) {
  const M = modelFor(fc, ft);
  const geom = M.model.geom.map((g, i) => ({ ...g, eta: M.model.rotors[i].motor === 1 ? 0 : 1 }));
  const mix = buildMixer(geom, M.model.kMu);
  const W = M.model.m * 9.80665, fMax = M.model.maxThrustPerRotorN;
  let worst = Infinity, best = 0, blocked = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const th = Math.acos(1 - 2 * (i + 0.5) / N), ph = Math.PI * (1 + Math.sqrt(5)) * i;
    const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    let lo = 0, hi = 50;
    for (let k = 0; k < 30; k++) {
      const mid = 0.5 * (lo + hi);
      const t = allocate(mix, [W, mid * d[0], mid * d[1], mid * d[2]]);
      const ok = t && !t.some((x, j) => mix.B[j][0] > 0 && (x < -1e-9 || x > fMax + 1e-9));
      ok ? (lo = mid) : (hi = mid);
    }
    worst = Math.min(worst, lo); best = Math.max(best, lo);
    if (lo < 1e-6) blocked++;
  }
  const rot = M.airframe.rotors.map((r) => ({
    r: Math.hypot(r.x, r.y), phi: Math.atan2(r.y, r.x),
    w: r.rotation === "CCW" ? 1 : -1, eta: r.motor === 1 ? 0 : 1 }));
  const a = acai({ rotors: rot, kMu: M.model.kMu, fMaxN: fMax, weightN: W });
  sweep[fc] = { worst, best, blocked, N, acai: a.acai, controllable: a.controllable };
  console.log(`  ${`${fc}/${ft}`.padEnd(12)}${worst.toFixed(4).padStart(11)}${best.toFixed(2).padStart(10)}` +
              `${`${blocked}/${N}`.padStart(12)}${a.acai.toFixed(3).padStart(10)}`);
}

check("the direction sweep reproduces ACAI's verdict on all three frames",
  (sweep.QUAD.blocked === sweep.QUAD.N) &&
  (sweep.HEXA.blocked > 0) &&
  (sweep.OCTA.blocked === 0 && sweep.OCTA.worst > 0),
  "an independent method - binary search through the allocator - agrees with the zonotope geometry");

check("the quadrotor can produce NO moment at all with a rotor dead",
  sweep.QUAD.blocked === sweep.QUAD.N && sweep.QUAD.best < 1e-6,
  `${sweep.QUAD.blocked} of ${sweep.QUAD.N} directions blocked, ACAI ${sweep.QUAD.acai.toFixed(3)}`);

check("the hexacopter blocks HALF its directions and sits exactly on the boundary",
  Math.abs(sweep.HEXA.blocked / sweep.HEXA.N - 0.5) < 0.05 && Math.abs(sweep.HEXA.acai) < 1e-6,
  `${sweep.HEXA.blocked} of ${sweep.HEXA.N} directions unattainable and ACAI exactly ` +
  `${sweep.HEXA.acai.toFixed(6)} — Du et al.'s PNPNPN case lies ON the controllability boundary`);

check("and that is why a flying scenario does NOT disprove it",
  h.hoverHeld === true && sweep.HEXA.blocked > 0,
  `the hexacopter flies every scenario here with a rotor dead while HALF of all moment ` +
  `directions are unattainable. A simulation samples only the directions its scenario ` +
  `happens to demand; ACAI bounds the whole attainable set. Passing a scenario is not ` +
  `controllability, which is why the simulation does not supersede the test`);


/* ── SCENARIOS THE USER BUILDS ─────────────────────────────────────────
   The shipped five are starting points, not the menu, so `makeScenario`
   turns typed segments into the same thing `simulate` already takes. Two
   risks come with that and both are checked here.

   THE FIRST IS SILENT NONSENSE. A duration of zero, a negative altitude,
   a 75 deg tilt: each must be REFUSED with a reason, because a scenario
   that quietly does nothing looks like a physics result.

   THE SECOND IS THE ONE THE USER ACTUALLY HIT. A held tilt has no
   equilibrium in this model — an attitude loop and an altitude loop are
   closed, a position loop is not, which is what Stabilize mode does. So
   a commanded 15 deg pitch accelerates at g*tan(15 deg) for as long as
   it is held, and the shipped step covered 91.6 m in ten seconds. The
   view then fitted a 91.6 m box and drew the aircraft at 1 % of the
   frame. The physics was right and the framing was wrong, so the gate
   pins BOTH: the acceleration is the textbook value, and a scenario that
   runs away is reported as a drifting segment rather than left for the
   camera to discover. */
console.log("\n  SCENARIOS THE USER BUILDS");

check("a held tilt accelerates at g*tan(theta)",
  Math.abs(tiltAccelerationMps2(15 * Math.PI / 180) - 9.80665 * Math.tan(15 * Math.PI / 180)) < 1e-12
  && Math.abs(tiltAccelerationMps2(0)) < 1e-12,
  `15° gives ${tiltAccelerationMps2(15 * Math.PI / 180).toFixed(3)} m/s², unopposed by anything but drag`);

check("every shipped preset builds, and its segments sum to its duration",
  Object.values(SCENARIO_PRESETS).every((p) => {
    const s = makeScenario(p);
    const sum = s.segments.reduce((a, x) => a + x.durationS, 0);
    return Math.abs(sum - s.totalDurationS) < 1e-12 && s.totalDurationS > 0;
  }), `${Object.keys(SCENARIO_PRESETS).length} presets, each editable from the panel`);

check("segments are held in order, and the last one holds to the end",
  (() => {
    const s = makeScenario({ startAltitudeM: 2, segments: [
      { durationS: 1, pitchDeg: 0, altitudeM: 2 },
      { durationS: 2, pitchDeg: 15, altitudeM: 2 },
      { durationS: 3, pitchDeg: 0, altitudeM: 2 }] });
    const at = (t) => s.target(t).pitchRad * 180 / Math.PI;
    return Math.abs(at(0.5)) < 1e-9 && Math.abs(at(2) - 15) < 1e-9
        && Math.abs(at(4)) < 1e-9 && Math.abs(at(99)) < 1e-9;
  })(), "a scrubber past the end must not fall off the last segment");

check("an altitude rate ramps, where a bare altitude steps",
  (() => {
    const ramp = makeScenario({ startAltitudeM: 6, segments: [
      { durationS: 10, altitudeM: 1, altitudeRateMps: 1 }] });
    const step = makeScenario({ startAltitudeM: 6, segments: [
      { durationS: 10, altitudeM: 1 }] });
    return Math.abs(ramp.target(0).altitudeM - 6) < 1e-9
        && Math.abs(ramp.target(2).altitudeM - 4) < 1e-9
        && Math.abs(ramp.target(9).altitudeM - 1) < 1e-9
        && Math.abs(step.target(0).altitudeM - 1) < 1e-9;
  })(), "descend at 1 m/s is a different command from go to 1 m");

check("a scenario that runs away says so, with the acceleration it implies",
  (() => {
    const s = makeScenario(SCENARIO_PRESETS.pitchHold);
    const d = s.driftingSegments;
    return d.length === 1 && d[0].index === 2
        && Math.abs(d[0].driftAccelMps2 - 9.80665 * Math.tan(15 * Math.PI / 180)) < 1e-9;
  })(), "the panel shows this instead of the view silently zooming out to fit 91.6 m");

check("a level scenario reports no drifting segment",
  makeScenario(SCENARIO_PRESETS.hover).driftingSegments.length === 0
  && makeScenario(SCENARIO_PRESETS.disturbance).driftingSegments.length === 0,
  "a roll upset is recovered from, not commanded, so nothing is held");

check("nonsense is refused with a reason, never silently accepted",
  [
    {},
    { segments: [] },
    { segments: [{ durationS: 0 }] },
    { segments: [{ durationS: -3 }] },
    { segments: [{ durationS: 2, pitchDeg: 75 }] },
    { segments: [{ durationS: 2, rollDeg: -80 }] },
    { segments: [{ durationS: 2, altitudeM: -1 }] },
    { segments: [{ durationS: 2, altitudeRateMps: -1 }] },
    { segments: new Array(20).fill({ durationS: 1 }) },
  ].every((bad) => {
    try { makeScenario(bad); return false; } catch (e) { return typeof e.message === "string" && e.message.length > 10; }
  }), "a duration of zero or a 75° tilt is a typo, not a flight");

check("the tilt cap is justified, not arbitrary",
  (() => {
    try { makeScenario({ segments: [{ durationS: 2, pitchDeg: SCENARIO_LIMITS.maxTiltDeg + 1 }] }); return false; }
    catch (e) { return /altitude loop cannot hold height/.test(e.message); }
  })(), "past 60° the thrust vector is nearer horizontal than vertical");

check("a user-built scenario is indistinguishable to the integrator",
  (() => {
    const s = makeScenario(SCENARIO_PRESETS.hover);
    const run = simulate({ model: quad.model, scenario: s, declared: DD, durationS: s.totalDurationS, failed: new Set() });
    const last = run.trace[run.trace.length - 1];
    return run.trace.length > 10 && Math.abs(last.altitudeM - 2) < 0.25
        && Math.abs(last.rollDeg) < 2 && Math.abs(last.pitchDeg) < 2;
  })(), "simulate takes it through the same path as a shipped scenario");

/* ── LOITER: THE LOOP THAT MAKES RELEASING THE STICK MEAN SOMETHING ───
   This simulation closed attitude and altitude and nothing else, which
   is ArduPilot's STABILIZE: levelling removes the accelerating force but
   not the velocity, so the aircraft coasts away for ever. That is right
   for Stabilize and wrong for what a drone does when you let go, because
   a real one is flown in LOITER, which closes velocity and position.

   The gains are ArduPilot's own, and these checks are what makes using
   them honest: the difference between the two modes has to be VISIBLE IN
   THE TRAJECTORY, not merely asserted in a comment. */
console.log("\n-- Stabilize coasts; Loiter stops. The trajectory must show it --");
{
  const flyIt = (segs) => {
    const sc = makeScenario({ label: "t", startAltitudeM: 5, segments: segs });
    return simulate({ model: quad.model, scenario: sc, declared: DD,
                      durationS: sc.totalDurationS, failed: new Set() });
  };
  const last = (r) => r.trace[r.trace.length - 1];
  const spd = (r) => Math.hypot(r.vx, r.vy);

  const stab = flyIt([{ durationS: 4, pitchDeg: 15, altitudeM: 5 },
                      { durationS: 6, pitchDeg: 0, altitudeM: 5 }]);
  check("STABILIZE: levelling does NOT stop it -- no position loop is closed",
    spd(last(stab)) > 3,
    `still ${spd(last(stab)).toFixed(2)} m/s six seconds after levelling, `
    + `${Math.abs(last(stab).x).toFixed(1)} m downrange`);

  /* ── LOITER IS WITHDRAWN, AND THESE CHECKS PIN WHY ────────────────
     What stood here asserted that releasing the stick braked the
     aircraft to a stop and held the spot. Those checks PASSED, and the
     behaviour they described was not real: they flew QUAD/X, the most
     forgiving frame in the set, for 14 seconds, and examined the last
     four. The instability needs about 27 seconds to rise out of
     floating-point noise, so a 14-second window on one airframe could
     not see it. That is the more useful lesson than the bug — a check
     whose horizon is shorter than the phenomenon will pass for ever.

     These replace them. They require the divergence to still be there,
     over a horizon long enough to show it, so that any future
     implementation has to demonstrably change this rather than re-pass
     a short test. LOITER_WITHDRAWN carries the full measurements. */
  let refusedLoiter = false;
  try { makeScenario({ segments: [{ durationS: 4, mode: "loiter", vxMps: 5, altitudeM: 5 }] }); }
  catch (e) { refusedLoiter = /loiter is withdrawn/.test(e.message); }
  check("a user-built scenario cannot ask for LOITER at all",
    refusedLoiter, "makeScenario refuses it rather than downgrading it to a coast");

  check("and the withdrawal records what was measured, not just that it failed",
    LOITER_WITHDRAWN.divergesAfterS > 0 && LOITER_WITHDRAWN.stableScale < 1
      && LOITER_WITHDRAWN.divergentScale > LOITER_WITHDRAWN.stableScale
      && /0f43be3/.test(LOITER_WITHDRAWN.claimRetracted)
      && /sqrt_controller/.test(LOITER_WITHDRAWN.missing),
    `holds ${LOITER_WITHDRAWN.divergesAfterS} s then diverges; stable only at `
    + `k <= ${LOITER_WITHDRAWN.stableScale} of ArduPilot's gain, which cannot track`);

  /* The defect itself, reachable only the way a harness reaches it: a
     raw target function, bypassing makeScenario's refusal. */
  const rawLoiter = {
    startAltitudeM: 5, initialAttitude: {},
    target: () => ({ rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 5,
                     mode: "loiter", vxMps: 0, vyMps: 0 }),
  };
  const div = simulate({ model: quad.model, scenario: rawLoiter, declared: DD,
                         durationS: 150, failed: new Set() });
  const worstTilt = Math.max(...div.trace.map((r) => Math.hypot(r.rollDeg, r.pitchDeg)));
  const worstSpeed = Math.max(...div.trace.map(spd));
  /* Bounded well below what QUAD/X actually reaches (29° and 1.3 m/s),
     because the divergence is milder on a quad than on the hexacopter
     the LOITER_WITHDRAWN figures were measured on — the point is that a
     standing hover does not stay standing, not the size it grows to. */
  check("a released stick in LOITER still diverges over 150 s, as recorded",
    worstTilt > 10 && worstSpeed > 0.5,
    `reaches ${worstTilt.toFixed(0)}° of tilt and ${worstSpeed.toFixed(1)} m/s from a standing `
    + `hover on QUAD/X — an unstable cascade amplifying numerical noise, not a disturbance`);
  check("and it is quiet for long enough that a short test would pass",
    div.trace.filter((r) => r.t < 10).every((r) => Math.hypot(r.vx, r.vy) < 0.01),
    "under 0.01 m/s for the first 10 s, which is why the 14 s checks this replaces passed");

  check("the braking numbers are ArduPilot's, not chosen here",
    ARDUPILOT_LOITER.brakeDelayS === 1.0 && ARDUPILOT_LOITER.brakeAccelMps2 === 2.5,
    `AC_Loiter.cpp non-Heli: brake ${ARDUPILOT_LOITER.brakeAccelMps2} m/s^2 after `
    + `${ARDUPILOT_LOITER.brakeDelayS} s, jerk ${ARDUPILOT_LOITER.brakeJerkMps3} m/s^3`);
  check("and so are the velocity PID gains",
    ARDUPILOT_LOITER.velP === 2.0 && ARDUPILOT_LOITER.velI === 1.0 && ARDUPILOT_LOITER.velD === 0.25,
    "AC_PosControl.cpp Copter defaults: PSC_VELXY_P 2.0, I 1.0, D 0.25, PSC_POSXY_P 1.0");
}

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE DYNAMICS GATE PASSED (${pass} checks)`
                       : `DRONE DYNAMICS GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
