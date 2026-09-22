/* =====================================================================
   DYNAMICS — a 6-DOF multirotor, and an honest account of its inputs
   =====================================================================
   Everything above this module is measured. This one is not, and the
   difference has to be stated before any of it is used.

   WHAT IS SOURCED:
     equations of motion   Bauersfeld & Scaramuzza, "Range, Endurance and
                           Optimal Speed Estimates for Multicopters",
                           IEEE RA-L 2022 (arXiv 2109.04741), Eqs. (1)-(3)
     control allocation    the effectiveness matrix of Du, Quan, Yang &
                           Cai, already implemented and validated in this
                           repository against their published 1.53 kg
                           hexacopter
     controller gains      ArduPilot's own shipped frame parameters,
                           Tools/Frame_params, Hexsoon EDU450, Copter
                           4.0.0 (md5 0a1e07214c11c5d8f6738fb0a39a3c45)
     rotor thrust          the measured UIUC curve, through rotor.js
     rotor geometry        ArduPilot AP_MotorsMatrix, through geometry3d.js

   WHAT IS NOT SOURCED, AND IS THEREFORE DECLARED:
     1. INERTIA. No commercial multirotor publishes an inertia tensor -
        not one of the seven in the vehicle survey. It is COMPUTED here
        from the sized design (point masses at the rotors, arms as rods,
        body as a cylinder), which is a derivation this tool owns rather
        than a figure anyone published. NASA publishes measured tensors
        for two research vehicles (GAMMA, RAVEN-SWFT) and they are the
        only check available - neither is reproducible here, because
        neither vehicle's rotor is in the measured propeller database.
     2. MOTOR TIME CONSTANT. Unsourceable. KDE publishes rotor inertia
        for two motors and nobody publishes a first-order lag. Declared.
     3. AIRFRAME DRAG COEFFICIENT. The literature archive states in
        writing that this is unusable for preliminary design: Pollet et
        al. (ICAS 2020) survey the options - 0.47 sphere, 1.05 cube, 2.05
        long body, one CFD result of 0.425 for an airframe its own author
        warns was "optimized to minimize drag" - and then simply assume
        1.0. Declared, with that provenance attached.

   SO WHAT IS THIS FOR. It answers questions about the SHAPE of a
   response - does the aircraft hold attitude, what happens to yaw when a
   rotor dies, how fast does it settle - which depend on the structure of
   the equations and only weakly on the declared numbers. It is not a
   performance prediction, and no trajectory it produces should be read
   as one.

   THE ONE RESULT THAT IS EVIDENCE. ACAI answers rotor-loss
   controllability by zonotope geometry at hover, with no time
   integration at all. This module answers it by integrating the
   equations forward with a real controller. The two share no arithmetic.
   Where they agree - and on the quadrotor they agree exactly - that is
   two independent methods reaching the same conclusion, which is worth
   more than either alone.
   ===================================================================== */
import { signedDistance, contactNormal, reflectVelocity } from "./obstacles.js";
import { effectivenessMatrix, torqueToThrustRatio } from "../../engine/controlauthority.js";

export const G_NED = Object.freeze([0, 0, 9.80665]);   // z DOWN

/* ── ArduPilot's own shipped gains, transcribed ─────────────────────
   Read from Tools/Frame_params/Hexsoon-edu450.param, an ArduPilot
   release artefact, not a tuning invented here. The angle loop is P
   only; the rate loop is PID. Acceleration limits are published in
   centidegrees/s^2 and converted once, here. */
export const ARDUPILOT_GAINS = Object.freeze({
  source: "ArduPilot Tools/Frame_params, Hexsoon EDU450, Copter 4.0.0",
  md5: "0a1e07214c11c5d8f6738fb0a39a3c45",
  angP: Object.freeze({ roll: 11, pitch: 11, yaw: 7.2 }),        // ATC_ANG_*_P
  rate: Object.freeze({
    roll: { p: 0.17, i: 0.17, d: 0.00602 },                      // ATC_RAT_RLL_*
    pitch: { p: 0.17, i: 0.17, d: 0.00602 },
    yaw: { p: 0.6, i: 0.06, d: 0 },
  }),
  accelMaxRadS2: Object.freeze({                                 // ATC_ACC_*_MAX, cdeg/s^2
    roll: 700 * 0.01 * Math.PI / 180 * 100,
    pitch: 700 * 0.01 * Math.PI / 180 * 100,
    yaw: 120 * 0.01 * Math.PI / 180 * 100,
  }),
  note: "These gains were tuned by ArduPilot for a 450-class quadrotor. Applying "
      + "them to a different airframe is what a real operator would then re-tune; "
      + "they are used unmodified here so the controller is a published one.",
});

/* Inputs with no published source. Exposed so a UI can render them as
   declared, with their provenance, rather than as anonymous numbers. */
export const DECLARED_DYNAMICS_INPUTS = Object.freeze([
  Object.freeze({
    key: "motorTimeConstantS", units: "s", typical: 0.05,
    what: "First-order lag from commanded to actual rotor speed.",
    whyDeclared: "Unsourceable. Of 24 catalogue motors only KDE publishes rotor "
      + "inertia, and for 2 of its 4 entries; no vendor publishes a time constant. "
      + "A lag could be derived from rotor inertia, Kt and torque, but that "
      + "derivation would be this tool's, not a citation.",
  }),
  Object.freeze({
    key: "bodyDragCoefficient", units: "-", typical: 1.0,
    what: "Parasite drag coefficient of the airframe, on its reference area.",
    whyDeclared: "The literature archive declares this unusable for preliminary "
      + "design in writing. Pollet et al. (ICAS 2020) list 0.47 for a sphere, 1.05 "
      + "for a cube, 2.05 for a long body, and one CFD value of 0.425 for an "
      + "airframe they warn 'has been optimized to minimize drag ... which is not "
      + "the case for most multicopter designs' - then assume 1.0 themselves.",
  }),
  Object.freeze({
    key: "bodyReferenceAreaM2", units: "m^2", typical: null,
    what: "Frontal reference area the drag coefficient acts on.",
    whyDeclared: "Pollet et al. give a scaling law (S ~ M^(2/3)) but no absolute "
      + "value for an arbitrary airframe. Defaulted here from the body radius, "
      + "which is itself declared.",
  }),
]);

/* ── QUATERNION AND VECTOR HELPERS ──────────────────────────────────
   Quaternion is [w, x, y, z], body -> world. */
const qNorm = (q) => { const n = Math.hypot(...q); return q.map((x) => x / n); };
const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
/* Rotate a body vector into world. */
export function qRotate(q, v) {
  const [w, x, y, z] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}
export function qConj(q) { return [q[0], -q[1], -q[2], -q[3]]; }
export function qToEuler(q) {
  const [w, x, y, z] = q;
  const sinp = 2 * (w * y - z * x);
  return {
    rollRad: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    pitchRad: Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp),
    yawRad: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}
export function eulerToQ({ rollRad = 0, pitchRad = 0, yawRad = 0 }) {
  const cr = Math.cos(rollRad / 2), sr = Math.sin(rollRad / 2);
  const cp = Math.cos(pitchRad / 2), sp = Math.sin(pitchRad / 2);
  const cy = Math.cos(yawRad / 2), sy = Math.sin(yawRad / 2);
  return qNorm([cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy,
                cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const matVec = (M, v) => M.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));

/* ── INERTIA, COMPUTED FROM THE SIZED DESIGN ────────────────────────
   Point masses at the rotors, arms as uniform rods from the centre, and
   the body as a uniform cylinder. This is a DERIVATION, not a published
   figure, and the result says so.

   THE KNOWN UNDER-ESTIMATE: battery and payload are placed at the body
   centre, where they contribute only their own small self-inertia. A
   real pack has extent. The eVTOL side of this repository records the
   same caveat for the same reason, and a lumped-centroid attempt there
   came out about 40x low on one axis. Treat this tensor as a floor. */
export function inertiaFromDesign({ rotors, rotorMassKg, armMassKg, bodyMassKg, bodyRadiusM }) {
  let Ixx = 0, Iyy = 0, Izz = 0, Ixz = 0;
  for (const r of rotors) {
    Ixx += rotorMassKg * (r.y * r.y + r.z * r.z);
    Iyy += rotorMassKg * (r.x * r.x + r.z * r.z);
    Izz += rotorMassKg * (r.x * r.x + r.y * r.y);
    Ixz -= rotorMassKg * r.x * r.z;
  }
  /* Arms: a uniform rod from the origin to each distinct arm tip. About
     an axis through one end, a rod of mass m and length L has m L^2 / 3. */
  const armTips = [...new Map(rotors.map((r) => [`${r.x.toFixed(6)},${r.y.toFixed(6)}`, r])).values()];
  const perArm = armTips.length ? armMassKg / armTips.length : 0;
  for (const t of armTips) {
    const L2 = t.x * t.x + t.y * t.y;
    const c = perArm * L2 / 3;
    /* The rod lies in the x-y plane, so it adds to the axes perpendicular
       to its own direction and fully to z. */
    Ixx += c * (t.y * t.y) / (L2 || 1);
    Iyy += c * (t.x * t.x) / (L2 || 1);
    Izz += c;
  }
  /* Body as a uniform solid cylinder of radius a, height 2a/3. */
  const a = bodyRadiusM, h = (2 * a) / 3;
  Ixx += bodyMassKg * (3 * a * a + h * h) / 12;
  Iyy += bodyMassKg * (3 * a * a + h * h) / 12;
  Izz += bodyMassKg * a * a / 2;
  return {
    J: [[Ixx, 0, Ixz], [0, Iyy, 0], [Ixz, 0, Izz]],
    Ixx, Iyy, Izz, Ixz,
    isDerived: true,
    derivation: "point masses at the rotors, arms as uniform rods about one end, "
      + "body as a uniform cylinder",
    caveat: "Battery and payload sit at the body centre and contribute only their own "
      + "self-inertia. A real pack has extent, so this tensor is a FLOOR. No commercial "
      + "multirotor in the survey publishes a measured tensor to check it against.",
  };
}

function invert3(M) {
  const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-18) throw new Error("dynamics: inertia tensor is singular");
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

/* ── THE MIXER ──────────────────────────────────────────────────────
   Desired [collective thrust, Mx, My, Mz] to per-rotor thrusts, by the
   Moore-Penrose pseudo-inverse of Du et al.'s effectiveness matrix. The
   SAME matrix ACAI uses, so the two analyses cannot silently disagree
   about what the airframe can do. */
export function buildMixer(rotorGeom, kMu) {
  const B = effectivenessMatrix(rotorGeom, kMu);   // row per rotor, col [T, Mx, My, Mz]
  const m = B.length;
  /* Normal equations for the least-norm solution: f = B (B^T B)^-1 u. */
  const BtB = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) =>
    B.reduce((s, row) => s + row[i] * row[j], 0)));
  return { B, BtB, rotors: m };
}

function solve4(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;      // rank deficient
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2, 3].map((i) => M[i][4] / M[i][i]);
}

/* Per-rotor thrust demands for a wrench.

   Returns null when all four axes cannot be spanned - a quadrotor that
   has lost a rotor has three inputs and cannot span four axes, exactly
   the structural result ACAI reports.

   WHAT A REAL AUTOPILOT DOES THEN, and what this models. It does not cut
   the motors. It keeps flying with what it has and loses the axis it
   cannot hold. `allocateDegraded` therefore drops axes from the END of
   the wrench - yaw first, then pitch - until the reduced problem is
   solvable, and reports which axes it gave up.

   This matters for what the simulation shows. Cutting all motors makes a
   failed quadrotor fall flat and level, which is not what happens. Giving
   up yaw makes it hold roll and pitch while spinning up uncontrollably,
   which is what happens, and which is the same conclusion ACAI reaches
   by a completely different route. */
export function allocate(mixer, wrench) {
  const y = solve4(mixer.BtB, wrench);
  if (!y) return null;
  return mixer.B.map((row) => row.reduce((s, x, i) => s + x * y[i], 0));
}

/* Rank is not the only way an allocation can fail, and it is not the
   interesting way.

   A ROTOR CANNOT PULL. Every demanded thrust must lie in [0, fMax], and
   a mixer can be full rank while the solution it returns asks a rotor
   for negative lift. Du, Quan, Yang & Cai's central result is exactly
   this: "a hexacopter is uncontrollable when one rotor fails, even
   though the hexacopter is over-actuated and its controllability matrix
   is row full rank". ACAI measures it as the radius of the largest
   sphere that fits inside the ATTAINABLE set, which is bounded by those
   limits.

   Clamping a negative demand to zero and carrying on would hide that:
   the simulation would fly a wrench the aircraft cannot produce and look
   fine. So saturation is DETECTED and reported, and the axes are then
   dropped in the same order as for a rank failure. */
export function allocateDegraded(mixer, wrench, fMaxN = Infinity) {
  const full = allocate(mixer, wrench);
  if (full) {
    const sat = full.some((x, i) => (mixer.B[i][0] > 0) && (x < -1e-9 || x > fMaxN + 1e-9));
    if (!sat) return { thrusts: full, axesDropped: [], degraded: false, saturated: false, momentScale: 1 };

    /* Saturated, but full rank. A real autopilot does not abandon the
       axis - it SCALES the moment demand until the solution fits inside
       the attainable set, prioritising attitude over yaw. ArduPilot does
       exactly this. So scale the moments (never the collective, which is
       holding the aircraft up) down to the boundary.

       Only if NO positive scale fits - the axis is unattainable at any
       magnitude, which is what a lost rotor does - is the axis dropped. */
    let lo = 0, hi = 1;
    const fits = (k) => {
      const t = allocate(mixer, [wrench[0], wrench[1] * k, wrench[2] * k, wrench[3] * k]);
      return t && !t.some((x, i) => mixer.B[i][0] > 0 && (x < -1e-9 || x > fMaxN + 1e-9));
    };
    if (fits(0)) {
      for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); (fits(mid) ? (lo = mid) : (hi = mid)); }
      const t = allocate(mixer, [wrench[0], wrench[1] * lo, wrench[2] * lo, wrench[3] * lo]);
      return { thrusts: t, axesDropped: [], degraded: true, saturated: true,
               momentScale: lo, fullRankButUnattainable: lo < 0.999 };
    }
    /* Even zero moment does not fit: the collective alone is unattainable. */
    const reduced = reduceAxes(mixer, wrench, fMaxN);
    return { ...reduced, saturated: true, fullRankButUnattainable: true, momentScale: 0 };
  }
  return { ...reduceAxes(mixer, wrench, fMaxN), saturated: false };
}

function reduceAxes(mixer, wrench, fMaxN) {

  const AXIS = ["thrust", "roll", "pitch", "yaw"];
  for (let keep = 3; keep >= 1; keep--) {
    const idx = [...Array(keep).keys()];                  // keep the first `keep` axes
    const A = idx.map((i) => idx.map((j) => mixer.BtB[i][j]));
    const b = idx.map((i) => wrench[i]);
    const y = solveN(A, b);
    if (!y) continue;
    const th = mixer.B.map((row) => idx.reduce((s, j, k) => s + row[j] * y[k], 0));
    /* A reduced solution that still asks a live rotor to pull is no more
       attainable than the full one; keep dropping axes. */
    if (th.some((x, i) => mixer.B[i][0] > 0 && (x < -1e-9 || x > fMaxN + 1e-9))) continue;
    return { thrusts: th, axesDropped: AXIS.slice(keep), degraded: true };
  }
  return { thrusts: mixer.B.map(() => 0), axesDropped: AXIS, degraded: true };
}

function solveN(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [...Array(n).keys()].map((i) => M[i][n] / M[i][i]);
}

/* ── THE CONTROLLER ─────────────────────────────────────────────────
   ArduPilot's cascade: angle error -> rate demand (P, limited by the
   published acceleration maxima), rate error -> moment (PID). */
/* ── LOITER: THE LOOP THAT MAKES RELEASING THE STICK MEAN SOMETHING ──
   Until now this simulation closed ATTITUDE and ALTITUDE and nothing
   else, which is ArduPilot's STABILIZE mode. In Stabilize, levelling the
   aircraft removes the accelerating force but not the velocity already
   built up: it keeps going, for ever, because nothing is asked to stop
   it. That is correct for Stabilize and it is why a commanded 15 deg
   pulse drifts 38.7 m after returning to level.

   It is NOT what a drone does when you let go of the stick, because a
   real one is flown in LOITER (ArduPilot) or POSITION (PX4), which close
   an outer loop on velocity and position. Releasing the stick there
   commands zero velocity and the aircraft BRAKES to a stop and holds.

   THE NUMBERS ARE ARDUPILOT'S OWN, from AC_Loiter.cpp's default block
   for the non-helicopter build:

     LOITER_SPEED_DEFAULT_MS            12.5   m/s    max horizontal speed
     LOITER_ACCEL_MAX_DEFAULT_MSS        5.0   m/s^2  max correction accel
     LOITER_BRAKE_ACCEL_DEFAULT_MSS      2.5   m/s^2  braking accel
     LOITER_BRAKE_JERK_DEFAULT_MSSS      5.0   m/s^3  braking jerk limit
     LOITER_BRAKE_START_DELAY_DEFAULT_S  1.0   s      delay before braking

   and the brake delay is real behaviour, not a detail: ArduPilot waits a
   second before braking so that a pilot feathering the stick is not
   fought by the controller. A release therefore coasts briefly and then
   stops, which is what one looks like.

   A HORIZONTAL ACCELERATION IS A LEAN ANGLE. The only way a multirotor
   pushes sideways is by tilting its thrust, so the outer loop's output
   is converted with theta = atan(a / g) — the same relation
   tiltAccelerationMps2 already inverts for the Stabilize case. Braking
   at 2.5 m/s^2 is a 14.3 deg lean, which is why the aircraft visibly
   pitches back as it stops. */
export const ARDUPILOT_LOITER = Object.freeze({
  source: "ArduPilot AC_Loiter.cpp, non-Heli defaults (APM_BUILD_Heli branch not taken)",
  maxSpeedMps: 12.5,
  maxAccelMps2: 5.0,
  brakeAccelMps2: 2.5,
  brakeJerkMps3: 5.0,
  brakeDelayS: 1.0,
  minSpeedMps: 0.2,
  /* The cascade's gains, from AC_PosControl.cpp's constructor defaults
     for the Copter build (the Heli, Plane and Sub branches differ):

       PSC_VELXY_P  2.0    PSC_VELXY_I  1.0    PSC_VELXY_D  0.25
       PSC_VELXY_IMAX 10.0  FLTE 5.0 Hz        FLTD 5.0 Hz
       PSC_POSXY_P  1.0

     The D term is not optional. With P alone the loop limit-cycled at
     plus or minus 0.9 m/s and plus or minus 24 degrees of pitch once it
     had stopped — a proportional velocity loop driving an attitude loop
     that lags it will always do that. */
  velP: 2.0, velI: 1.0, velD: 0.25, velIMax: 10.0, velFiltHz: 5.0,
  posP: 1.0,
});

/* The horizontal lean a velocity-hold loop asks for.

   `vel` and `target` are world-frame horizontal velocities. Returns the
   acceleration to command, already limited: to maxAccel while a target
   is being tracked, and to the braking accel and jerk while stopping.
   `state` carries the jerk limiter and the brake delay between steps. */
export function loiterStep(state, { vel, target, pos, dt, cfg = ARDUPILOT_LOITER }) {
  const stopping = Math.hypot(target[0] ?? 0, target[1] ?? 0) < 1e-9;
  state.idleS = stopping ? (state.idleS ?? 0) + dt : 0;
  const braking = stopping && state.idleS >= cfg.brakeDelayS;
  if (stopping && !braking) {
    state.hold = null;
    return { ax: 0, ay: 0, braking: false, coasting: true, holding: false };
  }

  /* POSITION HOLD closes the outer-most loop. Once braking has brought
     the aircraft below ArduPilot's own minimum loiter speed the spot is
     LATCHED, and from then on the velocity target comes from the
     position error rather than being zero — which is what stops it
     sliding away on the residual and makes "release and it hovers"
     literally true rather than approximately true. */
  let tx = target[0] ?? 0, ty = target[1] ?? 0;
  const speed = Math.hypot(vel[0], vel[1]);
  if (braking && pos) {
    if (!state.hold && speed < cfg.minSpeedMps) state.hold = [pos[0], pos[1]];
    if (state.hold) {
      tx = cfg.posP * (state.hold[0] - pos[0]);
      ty = cfg.posP * (state.hold[1] - pos[1]);
      const tm = Math.hypot(tx, ty);
      if (tm > cfg.maxSpeedMps) { tx *= cfg.maxSpeedMps / tm; ty *= cfg.maxSpeedMps / tm; }
    }
  } else if (!stopping) {
    state.hold = null;
  }

  const ex = tx - vel[0], ey = ty - vel[1];

  /* DERIVATIVE ON THE MEASUREMENT, NOT THE ERROR. The position-hold
     latch steps the velocity target the instant it engages, and a
     derivative taken on the error turns that step into a spike — the
     classic derivative kick. Differentiating the measured velocity
     instead gives the same damping with no response to a target change.
     Low-pass filtered at FLTD, as ArduPilot does, because an unfiltered
     derivative of a sampled velocity is mostly noise. */
  const rc = 1 / (2 * Math.PI * cfg.velFiltHz);
  const a = dt / (dt + rc);
  const dvx = (vel[0] - (state.lastVx ?? vel[0])) / dt;
  const dvy = (vel[1] - (state.lastVy ?? vel[1])) / dt;
  state.dEx = (state.dEx ?? 0) + a * (-dvx - (state.dEx ?? 0));
  state.dEy = (state.dEy ?? 0) + a * (-dvy - (state.dEy ?? 0));
  state.lastVx = vel[0]; state.lastVy = vel[1];

  const cap = braking ? cfg.brakeAccelMps2 : cfg.maxAccelMps2;

  /* CONDITIONAL INTEGRATION. The acceleration is capped, so while the
     loop is saturated the integrator is accumulating error it cannot
     act on; releasing it later is an overshoot that has nothing to do
     with the aircraft. Integrating only while unsaturated is the
     standard remedy and costs no gain anybody has to invent — without
     it this loop held position to 2.7 m and plus or minus 1.9 m/s. */
  const pdx = cfg.velP * ex + cfg.velD * state.dEx;
  const pdy = cfg.velP * ey + cfg.velD * state.dEy;
  if (Math.hypot(pdx, pdy) < cap) {
    state.iEx = Math.max(-cfg.velIMax, Math.min(cfg.velIMax, (state.iEx ?? 0) + ex * dt));
    state.iEy = Math.max(-cfg.velIMax, Math.min(cfg.velIMax, (state.iEy ?? 0) + ey * dt));
  }

  let ax = pdx + cfg.velI * (state.iEx ?? 0);
  let ay = pdy + cfg.velI * (state.iEy ?? 0);

  const mag = Math.hypot(ax, ay);
  if (mag > cap && mag > 0) { ax *= cap / mag; ay *= cap / mag; }

  const jmax = cfg.brakeJerkMps3 * dt;
  const dax = ax - (state.ax ?? 0), day = ay - (state.ay ?? 0);
  const dmag = Math.hypot(dax, day);
  if (dmag > jmax && dmag > 0) { ax = (state.ax ?? 0) + dax * jmax / dmag; ay = (state.ay ?? 0) + day * jmax / dmag; }
  state.ax = ax; state.ay = ay;
  return { ax, ay, braking, coasting: false, holding: !!state.hold };
}

/* A horizontal acceleration expressed as the lean angle that produces
   it. The exact inverse of tiltAccelerationMps2. */
export function leanForAccel(aMps2, maxTiltRad = 45 * Math.PI / 180) {
  const th = Math.atan(Math.abs(aMps2) / 9.80665);
  return Math.sign(aMps2) * Math.min(th, maxTiltRad);
}

export function makeController(gains = ARDUPILOT_GAINS) {
  return { integ: [0, 0, 0], lastErr: [0, 0, 0], gains };
}

export function controllerStep(ctl, { attitude, rates, target, dt }) {
  const e = qToEuler(attitude);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const angErr = [
    wrap((target.rollRad ?? 0) - e.rollRad),
    wrap((target.pitchRad ?? 0) - e.pitchRad),
    wrap((target.yawRad ?? 0) - e.yawRad),
  ];
  const g = ctl.gains;
  const angP = [g.angP.roll, g.angP.pitch, g.angP.yaw];
  const accMax = [g.accelMaxRadS2.roll, g.accelMaxRadS2.pitch, g.accelMaxRadS2.yaw];
  const rateDes = angErr.map((x, i) => {
    const r = angP[i] * x;
    const lim = Math.sqrt(2 * accMax[i] * Math.abs(x) + 1e-12);
    return Math.max(-lim, Math.min(lim, r));
  });
  const rateErr = [0, 1, 2].map((i) => rateDes[i] - rates[i]);
  const k = [g.rate.roll, g.rate.pitch, g.rate.yaw];
  const moment = [0, 1, 2].map((i) => {
    ctl.integ[i] = Math.max(-1, Math.min(1, ctl.integ[i] + rateErr[i] * dt));
    const d = dt > 0 ? (rateErr[i] - ctl.lastErr[i]) / dt : 0;
    return k[i].p * rateErr[i] + k[i].i * ctl.integ[i] + k[i].d * d;
  });
  ctl.lastErr = rateErr;
  return { moment, rateDes, angErr };
}

/* ── THE EQUATIONS OF MOTION ────────────────────────────────────────
   Bauersfeld & Scaramuzza Eqs. (1)-(3), verbatim in structure:

     p_dot = v
     q_dot = q (x) omega / 2
     v_dot = (1/m) q (x) (f_prop + f_body) + g
     omega_dot = J^-1 (tau_prop - omega x J omega)
     f_prop = SUM f_i,  tau_prop = SUM tau_i + r_i x f_i
     f_body = -0.5 c_body |A . v_rel| v_rel                          */
export function derivative(state, model, thrusts) {
  const { m, Jinv, J, rotors, kMu, cBody, areaM2, rho } = model;
  const [px, py, pz, vx, vy, vz, qw, qx, qy, qz, wx, wy, wz] = state;
  const q = [qw, qx, qy, qz], w = [wx, wy, wz];

  /* Rotor forces act along body -z (thrust up in a z-down frame). */
  let fz = 0;
  const tau = [0, 0, 0];
  for (let i = 0; i < rotors.length; i++) {
    const T = Math.max(0, thrusts[i] ?? 0);
    fz -= T;
    const r = rotors[i];
    const f = [0, 0, -T];
    const mArm = cross([r.x, r.y, r.z], f);
    tau[0] += mArm[0]; tau[1] += mArm[1]; tau[2] += mArm[2];
    /* Reaction torque about z, sign from the rotor's own spin. Du et
       al.'s convention: w = +1 anticlockwise. */
    tau[2] += (r.w ?? 0) * kMu * T;
  }

  /* Airframe drag, in the body frame, opposing the relative airspeed. */
  const vWorld = [vx, vy, vz];
  const vBody = qRotate(qConj(q), vWorld);
  const drag = vBody.map((c) => -0.5 * rho * cBody * areaM2 * Math.abs(c) * c);
  const fBody = [drag[0], drag[1], fz + drag[2]];

  const aWorld = qRotate(q, fBody).map((c, i) => c / m + G_NED[i]);
  const qd = qMul(q, [0, w[0], w[1], w[2]]).map((c) => 0.5 * c);
  const Jw = matVec(J, w);
  const wd = matVec(Jinv, [tau[0] - cross(w, Jw)[0], tau[1] - cross(w, Jw)[1], tau[2] - cross(w, Jw)[2]]);

  return [vx, vy, vz, aWorld[0], aWorld[1], aWorld[2], qd[0], qd[1], qd[2], qd[3], wd[0], wd[1], wd[2]];
}

/* Classical RK4. Fixed step, because a variable-step integrator would
   make the trace's time base depend on the solver rather than on the
   request. */
export function rk4(state, model, thrusts, dt) {
  const add = (s, k, f) => s.map((x, i) => x + f * k[i]);
  const k1 = derivative(state, model, thrusts);
  const k2 = derivative(add(state, k1, dt / 2), model, thrusts);
  const k3 = derivative(add(state, k2, dt / 2), model, thrusts);
  const k4 = derivative(add(state, k3, dt), model, thrusts);
  const out = state.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  const q = qNorm([out[6], out[7], out[8], out[9]]);
  out[6] = q[0]; out[7] = q[1]; out[8] = q[2]; out[9] = q[3];
  return out;
}

/* Build the simulation model from a converged sizing result and an
   airframe. Every unsourceable quantity must be passed in. */
export function buildModel({ sizing, airframe, declared }) {
  for (const d of DECLARED_DYNAMICS_INPUTS)
    if (d.key !== "bodyReferenceAreaM2" && !(declared?.[d.key] > 0))
      throw new Error(`dynamics: ${d.key} must be declared — ${d.whyDeclared.slice(0, 80)}`);

  const mass = sizing.massKg;
  const unit = sizing.massBreakdown.perUnit.totalKg;
  const inertia = inertiaFromDesign({
    rotors: airframe.rotors,
    rotorMassKg: unit,
    armMassKg: sizing.massBreakdown.structureKg * 0.6,
    bodyMassKg: mass - unit * airframe.rotors.length - sizing.massBreakdown.structureKg * 0.6,
    bodyRadiusM: airframe.bodyRadiusM,
  });
  const kMu = torqueToThrustRatio({
    thrustPerRotorN: sizing.hover.thrustPerRotorN,
    R_m: airframe.propRadiusM,
    tipSpeed_ms: (sizing.hover.rpm * 2 * Math.PI / 60) * airframe.propRadiusM,
    FM: sizing.hover.figureOfMerit,
    rho: sizing.rho,
  });
  if (kMu == null) throw new Error("dynamics: torque-to-thrust ratio could not be computed");

  const rotors = airframe.rotors.map((r) => ({
    x: r.x, y: r.y, z: r.z, w: r.rotation === "CCW" ? 1 : -1, motor: r.motor,
  }));
  const geom = airframe.rotors.map((r) => ({
    r: Math.hypot(r.x, r.y), phi: Math.atan2(r.y, r.x),
    w: r.rotation === "CCW" ? 1 : -1, eta: 1,
  }));
  const areaM2 = declared.bodyReferenceAreaM2 ?? Math.PI * airframe.bodyRadiusM * airframe.bodyRadiusM;

  return {
    m: mass, J: inertia.J, Jinv: invert3(inertia.J), inertia,
    /* The rotor-tip envelope, for contact. A multirotor strikes
       things with its blades, not its hub. */
    envelopeRadiusM: airframe.spanM / 2,
    rotors, geom, kMu, rho: sizing.rho,
    cBody: declared.bodyDragCoefficient, areaM2,
    motorTauS: declared.motorTimeConstantS,
    maxThrustPerRotorN: sizing.thrustToWeight.maxThrustPerRotorN,
    hoverThrustPerRotorN: sizing.hover.thrustPerRotorN,
    isDerivedInertia: true,
  };
}

/* ── THE SCENARIO RUNNER ────────────────────────────────────────────
   Integrates forward with the controller in the loop and the motors
   lagged. `failed` is a set of motor numbers whose thrust is forced to
   zero, which is the same eta = 0 ACAI uses. */
/* The surface currently penetrated, or null. Works in NED, the frame the
   state is in: `signedDistance` and `contactNormal` take an ALTITUDE, so
   z is negated on the way in and the normal's z on the way out. The
   ground is included as a surface rather than a special case, so a
   landing and a wall strike go down the same path. */
function nearestSurface(state, obstacles, envelopeR) {
  const x = state[0], y = state[1], alt = -state[2];
  let best = null;
  for (const o of obstacles) {
    const d = signedDistance(o, x, y, alt) - envelopeR;
    if (d < 0 && (best === null || d < best.d)) {
      const n = contactNormal(o, x, y, alt);
      best = { d, depth: -d, name: o.name, nNed: [n[0], n[1], -n[2]] };
    }
  }
  const groundDepth = envelopeR - alt;
  if (groundDepth > 0 && (best === null || -groundDepth < best.d))
    best = { d: -groundDepth, depth: groundDepth, name: "ground", nNed: [0, 0, -1] };
  return best;
}

/* Which rotor took the blow: the one furthest along the contact normal,
   i.e. nearest the surface. Body offsets are rotated into NED and
   compared by their projection onto -n. */
function nearestRotorIndex(model, state, nNed) {
  const q = [state[6], state[7], state[8], state[9]];
  let best = -1, bestProj = -Infinity;
  /* geom carries rotor positions in POLAR form - {r, phi} - not x/y.
     Reading g.x here gave undefined, every projection was NaN, the
     comparison never matched and no blade ever broke. */
  model.geom.forEach((g, i) => {
    const w = qRotate(q, [g.r * Math.cos(g.phi), g.r * Math.sin(g.phi), 0]);
    const proj = -(w[0] * nNed[0] + w[1] * nNed[1] + w[2] * nNed[2]);
    if (proj > bestProj) { bestProj = proj; best = i; }
  });
  return best;
}

export function simulate({ model, scenario, declared, durationS = 8, dt = 0.002,
                           failed = new Set(), obstacles = [], impact = null }) {
  const ctl = makeController();
  const n = model.rotors.length;
  const geom = model.geom.map((g, i) => ({ ...g, eta: failed.has(model.rotors[i].motor) ? 0 : 1 }));
  let mixer = buildMixer(geom, model.kMu);

  let state = [
    0, 0, -(scenario.startAltitudeM ?? 2), 0, 0, 0,
    ...eulerToQ(scenario.initialAttitude ?? {}), 0, 0, 0,
  ];
  let thrusts = new Array(n).fill(model.hoverThrustPerRotorN);
  const trace = [];
  const steps = Math.round(durationS / dt);
  const every = Math.max(1, Math.round(0.02 / dt));
  let allocationFailed = 0, axesDropped = [], hitGround = false, fullRankButUnattainable = false;
  const impacts = [], broken = [];
  const loiter = { ax: 0, ay: 0, idleS: 0 };
  let brakingS = 0;

  for (let s = 0; s <= steps; s++) {
    const t = s * dt;
    const q = [state[6], state[7], state[8], state[9]];
    const rates = [state[10], state[11], state[12]];
    const target = scenario.target(t, state);

    /* LOITER: the outer loop picks the lean angle, the attitude loop
       then flies it. In STABILIZE the commanded attitude is used as it
       always was, so nothing about the existing scenarios changes. */
    if (target.mode === "loiter") {
      const yaw = qToEuler([state[6], state[7], state[8], state[9]]).yawRad;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      /* The stick is in BODY axes — forward is forward whichever way the
         nose points — so the commanded velocity is rotated into the
         world before it is compared with the world velocity. */
      const wantX = target.vxMps * c - target.vyMps * sn;
      const wantY = target.vxMps * sn + target.vyMps * c;
      const a = loiterStep(loiter, { vel: [state[3], state[4]], target: [wantX, wantY],
                                    pos: [state[0], state[1]], dt });
      /* World acceleration back into body axes, then into lean angles.
         Forward is a NEGATIVE pitch: nose down tilts the thrust ahead. */
      const aFwd = a.ax * c + a.ay * sn;
      const aRight = -a.ax * sn + a.ay * c;
      target.pitchRad = -leanForAccel(aFwd);
      target.rollRad = leanForAccel(aRight);
      if (a.braking) brakingS += dt;
    }

    const { moment, angErr } = controllerStep(ctl, { attitude: q, rates, target, dt });
    /* Collective: hold altitude with a simple proportional term on
       vertical velocity and position, tilted-thrust compensated. */
    const e = qToEuler(q);
    const tiltComp = Math.min(2.5, 1 / Math.max(0.4, Math.cos(e.rollRad) * Math.cos(e.pitchRad)));
    const altErr = (target.altitudeM ?? scenario.startAltitudeM ?? 2) - (-state[2]);
    const vz = -state[5];
    const collective = scenario.collective
      ? scenario.collective(t, state)
      : Math.max(0, model.m * 9.80665 * tiltComp + 6 * model.m * altErr - 4 * model.m * vz);

    const demand = allocateDegraded(mixer,
      [collective, moment[0], moment[1], moment[2]], model.maxThrustPerRotorN);
    if (demand.degraded) {
      allocationFailed++;
      if (demand.axesDropped.length > axesDropped.length) axesDropped = demand.axesDropped;
      if (demand.fullRankButUnattainable) fullRankButUnattainable = true;
    }
    const cmd = demand.thrusts.map((x, i) => (geom[i].eta === 0 ? 0
      : Math.max(0, Math.min(model.maxThrustPerRotorN, x))));

    /* First-order motor lag on THRUST, which is the observable the rotor
       block gives; lagging thrust rather than rpm avoids inventing a
       second curve between them. */
    thrusts = thrusts.map((x, i) => x + (cmd[i] - x) * Math.min(1, dt / model.motorTauS));

    if (s % every === 0) {
      trace.push({
        t, x: state[0], y: state[1], altitudeM: -state[2],
        vx: state[3], vy: state[4], vz: -state[5],
        rollDeg: e.rollRad * 180 / Math.PI, pitchDeg: e.pitchRad * 180 / Math.PI,
        yawDeg: e.yawRad * 180 / Math.PI,
        p: rates[0], q: rates[1], r: rates[2],
        thrusts: [...thrusts], collective,
        yawErrDeg: angErr[2] * 180 / Math.PI,
      });
    }
    state = rk4(state, model, thrusts, dt);

    /* ── CONTACT ──────────────────────────────────────────────────────
       With no `impact` declared this is the original behaviour exactly:
       the ground ends the flight. With one, the surface is resolved as
       an impulse and the integration CONTINUES, so a bounce, a skid or
       a tumble comes out of the same 6-DOF loop that produced the rest
       of the flight rather than being drawn on afterwards.

       Worked in NED throughout — the frame the state and the quaternion
       are already in — so no axis is flipped twice between the normal,
       the impulse and the body rates. */
    if (!impact) {
      if (-state[2] < 0) { hitGround = true; break; }   // ground
    } else {
      const hit = nearestSurface(state, obstacles, model.envelopeRadiusM ?? 0);
      if (hit) {
        const vIn = [state[3], state[4], state[5]];
        const vOut = reflectVelocity(vIn, hit.nNed,
          { restitution: impact.restitution, scrub: impact.tangentialScrub });
        const closing = -(vIn[0] * hit.nNed[0] + vIn[1] * hit.nNed[1] + vIn[2] * hit.nNed[2]);

        /* RESTING CONTACT IS NOT AN IMPACT. Once the aircraft is against a
           surface, thrust and gravity push it a little way in on every
           step, it is pushed back out, and treating each of those as a
           strike logged 2,748 "impacts" at 0.0 m/s in a ten-second flight
           and re-applied an angular impulse each time. Below a threshold
           the contact is resolved silently: pushed out, normal velocity
           removed, nothing recorded and no spin imparted. */
        const RESTING_MPS = 0.15;
        const isImpact = closing > RESTING_MPS;

        /* Out of the surface first. Leaving the aircraft embedded would
           re-trigger contact on the next step and pin it there. */
        state[0] += hit.nNed[0] * hit.depth;
        state[1] += hit.nNed[1] * hit.depth;
        state[2] += hit.nNed[2] * hit.depth;
        state[3] = vOut[0]; state[4] = vOut[1]; state[5] = vOut[2];

        /* An off-centre blow spins it. The arm runs from the CG to the
           contact, which is one envelope radius along -n, and the
           impulse is the momentum the reflection removed. */
        const m = model.m, R = model.envelopeRadiusM ?? 0;
        const r = [-hit.nNed[0] * R, -hit.nNed[1] * R, -hit.nNed[2] * R];
        const J = [m * (vOut[0] - vIn[0]), m * (vOut[1] - vIn[1]), m * (vOut[2] - vIn[2])];
        const Lned = [r[1] * J[2] - r[2] * J[1], r[2] * J[0] - r[0] * J[2], r[0] * J[1] - r[1] * J[0]];
        if (isImpact) {
          const Lb = qRotate(qConj([state[6], state[7], state[8], state[9]]), Lned);
          const dw = matVec(model.Jinv, Lb);
          state[10] += dw[0]; state[11] += dw[1]; state[12] += dw[2];
          impacts.push({ t, name: hit.name, closingMps: closing,
                         speedMps: Math.hypot(...vIn), altitudeM: -state[2] });
        }

        /* Blades break above a DECLARED closing speed. The mixer is
           rebuilt because a dead rotor changes what the allocator can
           attain; leaving it stale would keep commanding thrust from a
           motor that is gone. */
        if (isImpact && closing > (impact.bladeBreakSpeedMps ?? Infinity)) {
          const near = nearestRotorIndex(model, state, hit.nNed);
          if (near >= 0 && geom[near].eta !== 0) {
            geom[near] = { ...geom[near], eta: 0 };
            broken.push({ t, motor: model.rotors[near].motor, closingMps: closing });
            mixer = buildMixer(geom, model.kMu);
          }
        }
        /* Settled on the ground ends the flight, as it did before: the
           aircraft is down and nothing after that is modelled. A wall is
           different - it can be slid along - so only the ground stops it. */
        if (hit.name === "ground" && !isImpact) { hitGround = true; break; }
      }
    }
  }

  const last = trace[trace.length - 1];
  return {
    trace, dt, durationS,
    failed: [...failed],
    allocationFailed,
    allocationRankDeficient: allocationFailed > 0,
    axesDropped,
    fullRankButUnattainable,
    yawUncontrolled: axesDropped.includes("yaw"),
    finalAltitudeM: last.altitudeM,
    /* Ground contact is detected by the integrator crossing zero, not by
       whether the last SAMPLED trace point happens to be low: the trace
       is recorded every 20 ms and the crossing can fall between samples. */
    impacts, broken, brakingS,
    crashed: hitGround,
    hitGroundAtS: hitGround ? last.t : null,
    maxTiltDeg: Math.max(...trace.map((r) => Math.hypot(r.rollDeg, r.pitchDeg))),
    yawDriftDeg: Math.abs(last.yawDeg - trace[0].yawDeg),
    inertia: model.inertia,
    declared,
  };
}

/* Named scenarios. Each is a TARGET function, not a prescribed path:
   the trajectory that comes out is integrated, never drawn. */
export const SCENARIOS = Object.freeze({
  hover: {
    label: "Hover", startAltitudeM: 2,
    target: () => ({ rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 2 }),
  },
  yawTurn: {
    label: "Yaw 180°", startAltitudeM: 2,
    target: (t) => ({ rollRad: 0, pitchRad: 0, altitudeM: 2,
                      yawRad: t < 1 ? 0 : Math.PI }),
  },
  pitchStep: {
    label: "Pitch 15° step", startAltitudeM: 2,
    target: (t) => ({ rollRad: 0, altitudeM: 2, yawRad: 0,
                      pitchRad: t < 1 ? 0 : 15 * Math.PI / 180 }),
  },
  disturbance: {
    label: "20° roll upset", startAltitudeM: 3,
    initialAttitude: { rollRad: 20 * Math.PI / 180 },
    target: () => ({ rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 3 }),
  },
  descent: {
    label: "Controlled descent", startAltitudeM: 6,
    target: (t) => ({ rollRad: 0, pitchRad: 0, yawRad: 0,
                      altitudeM: Math.max(0.2, 6 - 1.0 * t) }),
  },
});

/* ── SCENARIOS THE USER BUILDS ─────────────────────────────────────────
   The five above are starting points, not the menu. A scenario is only a
   commanded attitude and altitude over time, so there is no reason to
   ship a fixed list: this builds the same thing from segments a user
   types, and `simulate` cannot tell the difference.

   WHAT A SEGMENT IS. A duration, plus the roll, pitch and yaw the
   autopilot is told to hold and the altitude it is told to keep. Segments
   run in order and the last one holds to the end of the run. An altitude
   may be stepped or approached at a stated rate, which is the difference
   between "go to 2 m" and "descend at 1 m/s".

   THE THING THIS HAS TO SAY OUT LOUD. A HELD TILT HAS NO EQUILIBRIUM.
   This simulation closes an attitude loop and an altitude loop, and no
   position loop, which is exactly what ArduPilot's Stabilize mode does.
   So a commanded 15 deg pitch is not "fly forward a bit" — the
   horizontal component of thrust is opposed only by drag and the
   aircraft accelerates at g*tan(theta) for as long as the tilt is held.
   The shipped 15 deg pitch step covers 91.6 m in ten seconds for that
   reason. That is the physics behaving correctly, and a scenario editor
   that lets anyone command a held tilt has to report it rather than let
   the view quietly zoom out until the aircraft is a speck. */

export const SCENARIO_LIMITS = Object.freeze({
  maxSegments: 12,
  maxSegmentDurationS: 120,
  maxTotalDurationS: 120,
  maxTiltDeg: 60,
  maxAltitudeM: 400,
});

/* The unopposed horizontal acceleration of a multirotor holding a tilt,
   with no position loop to arrest it. Drag reduces the distance actually
   flown; this is the acceleration the tilt commands. */
export function tiltAccelerationMps2(tiltRad) {
  const a = Math.abs(tiltRad);
  if (!(a >= 0) || a >= Math.PI / 2) return Infinity;
  return 9.80665 * Math.tan(a);
}

export function makeScenario({
  label = "Custom", startAltitudeM = 2, initialAttitude = {}, segments,
} = {}) {
  const L = SCENARIO_LIMITS;
  if (!Array.isArray(segments) || segments.length === 0)
    throw new Error("a scenario needs at least one segment");
  if (segments.length > L.maxSegments)
    throw new Error(`at most ${L.maxSegments} segments`);
  if (!(Number(startAltitudeM) >= 0))
    throw new Error("the start altitude cannot be negative");

  let commandedAlt = Number(startAltitudeM);
  let total = 0;
  const prepared = segments.map((s, i) => {
    const n = i + 1;
    const durationS = Number(s.durationS);
    if (!Number.isFinite(durationS) || durationS <= 0)
      throw new Error(`segment ${n}: duration must be a positive number of seconds`);
    if (durationS > L.maxSegmentDurationS)
      throw new Error(`segment ${n}: duration is capped at ${L.maxSegmentDurationS} s`);

    const deg = (x) => { const v = Number(x ?? 0); return Number.isFinite(v) ? v : 0; };
    const rollDeg = deg(s.rollDeg), pitchDeg = deg(s.pitchDeg), yawDeg = deg(s.yawDeg);
    for (const [k, v] of [["roll", rollDeg], ["pitch", pitchDeg]])
      if (Math.abs(v) > L.maxTiltDeg)
        throw new Error(`segment ${n}: ${k} of ${v}° exceeds the ${L.maxTiltDeg}° cap — `
          + `beyond that the thrust vector is closer to horizontal than vertical and the `
          + `altitude loop cannot hold height at any throttle`);

    const altitudeM = s.altitudeM == null ? commandedAlt : Number(s.altitudeM);
    if (!Number.isFinite(altitudeM) || altitudeM < 0)
      throw new Error(`segment ${n}: altitude must be zero or more`);
    if (altitudeM > L.maxAltitudeM)
      throw new Error(`segment ${n}: altitude is capped at ${L.maxAltitudeM} m`);

    const rateRaw = s.altitudeRateMps == null || s.altitudeRateMps === "" ? null : Number(s.altitudeRateMps);
    if (rateRaw != null && (!Number.isFinite(rateRaw) || rateRaw <= 0))
      throw new Error(`segment ${n}: an altitude rate must be a positive speed, or empty for a step`);

    const startAlt = commandedAlt;
    commandedAlt = altitudeM;
    total += durationS;
    /* MODE. "stabilize" commands an ATTITUDE, which is what this
       simulation has always done and is ArduPilot's Stabilize. "loiter"
       commands a VELOCITY and lets the outer loop choose the attitude,
       which is what Loiter and PX4 Position do — and the only mode in
       which releasing the stick brings the aircraft to a stop. */
    const mode = s.mode === "loiter" ? "loiter" : "stabilize";
    const vxMps = Number(s.vxMps ?? 0) || 0;
    const vyMps = Number(s.vyMps ?? 0) || 0;
    const seg = {
      durationS, startAlt, altitudeM, rateMps: rateRaw,
      mode, vxMps, vyMps,
      rollDeg, pitchDeg, yawDeg,
      rollRad: rollDeg * Math.PI / 180,
      pitchRad: pitchDeg * Math.PI / 180,
      yawRad: yawDeg * Math.PI / 180,
    };
    seg.tiltRad = Math.acos(Math.max(-1, Math.min(1,
      Math.cos(seg.rollRad) * Math.cos(seg.pitchRad))));
    seg.driftAccelMps2 = tiltAccelerationMps2(seg.tiltRad);
    return seg;
  });

  if (total > L.maxTotalDurationS)
    throw new Error(`the scenario runs ${total.toFixed(1)} s; the cap is ${L.maxTotalDurationS} s`);

  const target = (t) => {
    let acc = 0;
    let seg = prepared[prepared.length - 1];
    let tIn = Math.max(0, t - (total - seg.durationS));
    for (const s of prepared) {
      if (t < acc + s.durationS) { seg = s; tIn = t - acc; break; }
      acc += s.durationS;
    }
    let altitudeM = seg.altitudeM;
    if (seg.rateMps != null) {
      const moved = seg.rateMps * Math.max(0, tIn);
      altitudeM = seg.altitudeM >= seg.startAlt
        ? Math.min(seg.altitudeM, seg.startAlt + moved)
        : Math.max(seg.altitudeM, seg.startAlt - moved);
    }
    return { rollRad: seg.rollRad, pitchRad: seg.pitchRad, yawRad: seg.yawRad, altitudeM,
             mode: seg.mode, vxMps: seg.vxMps, vyMps: seg.vyMps };
  };

  return {
    label, startAltitudeM: Number(startAltitudeM), initialAttitude, target,
    segments: prepared, totalDurationS: total, custom: true,
    /* Segments that command a held tilt, with the acceleration that tilt
       implies. The panel shows these so a runaway is explained rather
       than merely rendered. */
    driftingSegments: prepared
      .map((s, i) => ({ index: i + 1, ...s }))
      .filter((s) => s.driftAccelMps2 > 0.05),
  };
}

/* The five shipped scenarios expressed as segments, so the editor can
   open one and the user can change it rather than start from nothing. */
export const SCENARIO_PRESETS = Object.freeze({
  hover: { label: "Hover", startAltitudeM: 2, initialAttitude: {},
    segments: [{ durationS: 10, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 2 }] },
  yawTurn: { label: "Yaw 180°", startAltitudeM: 2, initialAttitude: {},
    segments: [{ durationS: 1, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 2 },
               { durationS: 9, rollDeg: 0, pitchDeg: 0, yawDeg: 180, altitudeM: 2 }] },
  pitchPulse: { label: "Pitch 15° pulse, then level", startAltitudeM: 2, initialAttitude: {},
    segments: [{ durationS: 1, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 2 },
               { durationS: 2, rollDeg: 0, pitchDeg: 15, yawDeg: 0, altitudeM: 2 },
               { durationS: 7, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 2 }] },
  pitchHold: { label: "Pitch 15° held (flies away)", startAltitudeM: 2, initialAttitude: {},
    segments: [{ durationS: 1, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 2 },
               { durationS: 9, rollDeg: 0, pitchDeg: 15, yawDeg: 0, altitudeM: 2 }] },
  disturbance: { label: "20° roll upset", startAltitudeM: 3,
    initialAttitude: { rollRad: 20 * Math.PI / 180 },
    segments: [{ durationS: 10, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 3 }] },
  descent: { label: "Controlled descent", startAltitudeM: 6, initialAttitude: {},
    segments: [{ durationS: 10, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 0.2, altitudeRateMps: 1.0 }] },
});
