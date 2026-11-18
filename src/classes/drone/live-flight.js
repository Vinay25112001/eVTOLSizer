/* =====================================================================
   LIVE FLIGHT — the Flight sim's 6-DOF, one step at a time
   =====================================================================
   The Fly tab hands the stick to the reader, so the flight cannot be
   integrated ahead of time the way `simulate` does it: the next target
   is not known until the next key is pressed. This module steps the SAME
   flight one integration step at a time.

   IT IS THE SAME FLIGHT, NOT A SECOND MODEL. Every piece of physics and
   control is imported from dynamics.js and flight-energy.js: the
   controller (makeController / controllerStep), the mixer and allocator
   (buildMixer / allocateDegraded), the equations of motion (rk4 over
   derivative) and the pack (packPoint). What is written here is only the
   ORDER in which `simulate` calls them, with its two inline lines — the
   altitude-hold collective and the first-order motor lag — repeated
   exactly. validation/drone-live-flight.mjs drives this with each shipped
   scenario and requires every trace row to equal `simulate`'s, bit for
   bit, with and without the energy model and with a motor failed. So if
   either copy drifts, the gate fails.

   dynamics.js is deliberately NOT edited to export a step function: it
   is the audited module (F-101, F-102 cite its lines), and leaving it
   byte-for-byte as audited is worth the two repeated lines.

   WHAT THIS ADDS, AND SAYS SO
   - Live input: `sticksToTarget` turns held keys into the same attitude
     and altitude setpoints a scenario segment holds (Stabilize, with the
     altitude loop the simulation always closes). Pilot-input shaping
     only: the keys ramp the setpoint rather than step it.
   - Contact with the scene: `simulate` with no impact model ends the run
     when the centre of gravity reaches the ground; this does the same,
     and also ends it when the rotor envelope touches an obstacle (the
     same signed distance firstContact() uses). Nothing after a contact
     is modelled, as in `simulate`.
   - A motor failed in flight: thrust command forced to zero and the
     mixer rebuilt — what `simulate` itself does when a blade breaks.

   WHAT IT DOES NOT ADD: no wind, no voltage sag, no ground effect, no
   take-off from the ground and no position hold (loiter is withdrawn in
   dynamics.js). The Fly tab prints these beside the flight.
   ===================================================================== */
import {
  makeController, controllerStep, buildMixer, allocateDegraded, rk4,
  qToEuler, eulerToQ, G_NED, SCENARIO_LIMITS,
} from "./dynamics.js";
import { packPoint } from "./flight-energy.js";
import { signedDistance } from "./obstacles.js";

/* The integration step and the sampling interval `simulate` uses for
   every flight shorter than 240 s (dt = 2 ms, a row every 10 steps). */
export const LIVE_DT_S = 0.002;
export const LIVE_SAMPLE_EVERY = 10;

const RAD = Math.PI / 180;

export function createFlight({
  model, startAltitudeM = 2, initialAttitude = {}, failed = new Set(),
  energy = null, obstacles = [], dt = LIVE_DT_S, every = LIVE_SAMPLE_EVERY,
}) {
  if (!model?.rotors?.length) throw new Error("live-flight: a dynamics model is required");
  const n = model.rotors.length;
  const geom = model.geom.map((g, i) => ({ ...g, eta: failed.has(model.rotors[i].motor) ? 0 : 1 }));
  return {
    model, dt, every, energy, obstacles, startAltitudeM,
    traceIntervalS: every * dt,
    ctl: makeController(),
    geom,
    mixer: buildMixer(geom, model.kMu),
    state: [
      0, 0, -startAltitudeM, 0, 0, 0,
      ...eulerToQ(initialAttitude), 0, 0, 0,
    ],
    thrusts: new Array(n).fill(model.hoverThrustPerRotorN),
    s: 0,
    energyWh: 0,
    allocationFailed: 0,
    failedMotors: [...failed],
    last: null,
    ended: null,
  };
}

/* One integration step. Returns the trace row when this step is a
   sampling step (every `every` steps, as `simulate` records them) and
   null otherwise. `collectiveFn` mirrors scenario.collective. */
export function stepFlight(f, target, collectiveFn = null) {
  if (f.ended) return null;
  if (target?.mode === "loiter")
    throw new Error("live-flight: loiter is withdrawn in dynamics.js; only stabilize is flown");
  const { model, dt, geom, energy } = f;
  const s = f.s, t = s * dt, state = f.state;
  const q = [state[6], state[7], state[8], state[9]];
  const rates = [state[10], state[11], state[12]];

  const { moment, angErr } = controllerStep(f.ctl, { attitude: q, rates, target, dt });
  /* simulate(): altitude hold, tilted-thrust compensated. Same order of
     operations, so the same bits. */
  const e = qToEuler(q);
  const tiltComp = Math.min(2.5, 1 / Math.max(0.4, Math.cos(e.rollRad) * Math.cos(e.pitchRad)));
  const altErr = (target.altitudeM ?? f.startAltitudeM ?? 2) - (-state[2]);
  const vz = -state[5];
  const collective = collectiveFn
    ? collectiveFn(t, state)
    : Math.max(0, model.m * G_NED[2] * tiltComp + 6 * model.m * altErr - 4 * model.m * vz);

  const demand = allocateDegraded(f.mixer,
    [collective, moment[0], moment[1], moment[2]], model.maxThrustPerRotorN);
  if (demand.degraded) f.allocationFailed++;
  const cmd = demand.thrusts.map((x, i) => (geom[i].eta === 0 ? 0
    : Math.max(0, Math.min(model.maxThrustPerRotorN, x))));
  /* simulate(): first-order lag on thrust. */
  f.thrusts = f.thrusts.map((x, i) => x + (cmd[i] - x) * Math.min(1, dt / model.motorTauS));

  let row = null;
  if (s % f.every === 0) {
    row = {
      t, x: state[0], y: state[1], altitudeM: -state[2],
      vx: state[3], vy: state[4], vz: -state[5],
      rollDeg: e.rollRad * 180 / Math.PI, pitchDeg: e.pitchRad * 180 / Math.PI,
      yawDeg: e.yawRad * 180 / Math.PI,
      p: rates[0], q: rates[1], r: rates[2],
      thrusts: [...f.thrusts], collective,
      yawErrDeg: angErr[2] * 180 / Math.PI,
    };
    if (energy) {
      const driven = f.thrusts.map((x, i) => (geom[i].eta === 0 ? 0 : x));
      const pp = packPoint(energy, driven);
      if (s > 0) f.energyWh += pp.packPowerW * f.traceIntervalS / 3600;
      row.packPowerW = pp.packPowerW;
      row.packCurrentA = pp.packCurrentA;
      row.energyWh = f.energyWh;
      row.soc = Math.max(0, 1 - f.energyWh / energy.usableWh);
      if (f.energyWh >= energy.usableWh) f.ended = { reason: "battery", t };
    }
    f.last = row;
    /* simulate() stops after recording the exhausted sample, before
       integrating again. */
    if (f.ended) return row;
  }

  f.state = rk4(state, model, f.thrusts, dt);
  f.s = s + 1;

  /* simulate() with no impact model: the ground ends the flight. */
  if (-f.state[2] < 0) {
    f.ended = { reason: "ground", t: f.s * dt, ...contactSpeeds(f.state) };
    return row;
  }
  /* The scene, by the signed distance firstContact() uses, at the rotor
     envelope. An addition: `simulate` without an impact model flies
     through obstacles and FlightPanel reports the first contact after. */
  const R = model.envelopeRadiusM ?? 0;
  for (const o of f.obstacles) {
    if (signedDistance(o, f.state[0], f.state[1], -f.state[2]) < R) {
      f.ended = { reason: "obstacle", name: o.name, t: f.s * dt, ...contactSpeeds(f.state) };
      break;
    }
  }
  return row;
}

function contactSpeeds(state) {
  return {
    verticalMps: Math.abs(state[5]),
    horizontalMps: Math.hypot(state[3], state[4]),
    speedMps: Math.hypot(state[3], state[4], state[5]),
  };
}

/* Advance by `seconds` of flight time; returns the sampled rows. */
export function advanceFlight(f, seconds, target) {
  const rows = [];
  const steps = Math.max(0, Math.round(seconds / f.dt));
  for (let i = 0; i < steps && !f.ended; i++) {
    const r = stepFlight(f, target);
    if (r) rows.push(r);
  }
  return rows;
}

/* A motor stops in flight: its command is forced to zero from now on and
   the mixer is rebuilt, which is what simulate() does when a blade
   breaks. Its lagged thrust then decays at the motor time constant. */
export function failMotor(f, motor) {
  const i = f.model.rotors.findIndex((r) => r.motor === motor);
  if (i < 0 || f.geom[i].eta === 0) return false;
  f.geom = f.geom.map((g, k) => (k === i ? { ...g, eta: 0 } : g));
  f.mixer = buildMixer(f.geom, f.model.kMu);
  f.failedMotors = [...f.failedMotors, motor];
  return true;
}

/* ── THE STICKS ────────────────────────────────────────────────────────
   Held keys -> the setpoints a scenario segment holds. Stabilize: pitch
   and roll sticks command an ATTITUDE, so releasing them levels the
   aircraft but does not stop it (there is no position loop; see
   LOITER_WITHDRAWN). The yaw stick commands a heading RATE, integrated
   into the absolute heading controllerStep expects. The throttle stick
   moves the altitude the altitude loop holds.

   sticks: { pitch, roll, yaw, climb } each in [-1, 1]; pitch +1 = nose
   down (forward), roll +1 = right, yaw +1 = clockwise from above,
   climb +1 = up. Ramps are pilot-input shaping, stated as such. */
export const STICK_DEFAULTS = Object.freeze({
  maxTiltDeg: 25,                      // reader-adjustable, capped below
  yawRateDegS: 90,
  climbRateMps: 2,
  tiltRampDegS: 120,                   // how fast a held key reaches full tilt
});

export function initialSetpoint(f) {
  return { rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: f.startAltitudeM };
}

export function sticksToTarget(prev, sticks, dt, opts = {}) {
  const o = { ...STICK_DEFAULTS, ...opts };
  const maxTilt = Math.min(Math.abs(o.maxTiltDeg), SCENARIO_LIMITS.maxTiltDeg) * RAD;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const toward = (cur, want, maxStep) => cur + clamp(want - cur, -maxStep, maxStep);
  const ramp = o.tiltRampDegS * RAD * dt;
  const stick = (k) => clamp(Number(sticks?.[k]) || 0, -1, 1);
  /* Forward is a NEGATIVE pitch: nose down tilts the thrust ahead. */
  const pitchRad = toward(prev.pitchRad, -stick("pitch") * maxTilt, ramp);
  const rollRad = toward(prev.rollRad, stick("roll") * maxTilt, ramp);
  let yawRad = prev.yawRad + stick("yaw") * o.yawRateDegS * RAD * dt;
  yawRad = Math.atan2(Math.sin(yawRad), Math.cos(yawRad));
  const altitudeM = clamp(prev.altitudeM + stick("climb") * o.climbRateMps * dt,
    0, SCENARIO_LIMITS.maxAltitudeM);
  return { rollRad, pitchRad, yawRad, altitudeM };
}
