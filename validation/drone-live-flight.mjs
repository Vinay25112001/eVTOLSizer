/* =====================================================================
   LIVE FLIGHT — the Fly tab flies the Flight sim's 6-DOF, not a copy
   =====================================================================
   src/classes/drone/live-flight.js steps the flight one integration step
   at a time so a reader can hold the stick. Its claim is that it adds NO
   physics: it calls dynamics.js's controller, allocator and integrator
   and flight-energy.js's pack in the order simulate() calls them. This
   gate holds it to that claim, bit for bit:

     1. IDENTITY. Driven by each shipped scenario's target function, the
        rows it samples must EQUAL simulate()'s trace rows exactly (JSON
        compared, so every float to the last bit), on a quad and a hexa,
        with and without the energy model, with a motor failed, and when
        the pack ends the flight.
     2. THE STICKS. Held keys map to the setpoints a scenario segment
        holds, with the caps dynamics.js declares, and the aircraft moves
        the way the stick says.
     3. CONTACT. The ground ends the flight exactly where simulate() says
        it does; an obstacle ends it where firstContact() locates the
        strike on simulate()'s own trace (within one 20 ms sample).
     4. A MOTOR FAILED IN FLIGHT stops being driven and its thrust decays
        at the declared motor time constant.
     5. SOURCE. The module imports only dynamics.js, flight-energy.js and
        obstacles.js, and defines no equations of motion of its own.
   ===================================================================== */
import { readFileSync } from "node:fs";
import {
  buildModel, simulate, makeScenario, SCENARIO_PRESETS, SCENARIOS, SCENARIO_LIMITS, G_NED,
} from "../src/classes/drone/dynamics.js";
import { buildEnergyModel } from "../src/classes/drone/flight-energy.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { makeBox, firstContact } from "../src/classes/drone/obstacles.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";
import {
  createFlight, stepFlight, advanceFlight, failMotor, sticksToTarget, initialSetpoint,
  STICK_DEFAULTS, LIVE_DT_S, LIVE_SAMPLE_EVERY,
} from "../src/classes/drone/live-flight.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE LIVE FLIGHT GATE");
console.log("=".repeat(78));

/* ── The reference designs: the Fly tab's defaults (quad) and the energy
   gate's reference hexacopter. ── */
const DD = { motorTimeConstantS: 0.05, bodyDragCoefficient: 1.0 };
const pack = assemblePack(BATTERIES.find((b) => b.id === "molicel-inr21700-p42a"),
  { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");
const declared = { structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
                   avionicsPowerW: 8, thrustToWeightRequired: 2.0 };
function design(frameClass, frameType) {
  const frame = FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType);
  const selection = {
    rotors: frame.motors.length, propeller: prop, propellerMassG: 45,
    motor: MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360"),
    esc: ESCS.find((e) => e.continuous_current_a >= 40) ?? ESCS[0],
    battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
  };
  const sizing = sizeDrone({ mission: { payloadKg: 0.5, hoverEnduranceMin: 15 }, selection, declared });
  const airframe = buildAirframe({ frame, propellerDiameterM: prop.diameterM, tipGapFraction: 0.10 });
  const model = buildModel({ sizing, airframe, declared: DD });
  const energy = buildEnergyModel({ selection, declared, sizing });
  return { frame, selection, sizing, airframe, model, energy };
}
const QUAD = design("QUAD", "X");
const HEXA = design("HEXA", "X");
check("both reference designs size and build a dynamics model",
  QUAD.sizing.status.startsWith("converged") && HEXA.sizing.status.startsWith("converged")
  && QUAD.model.rotors.length === 4 && HEXA.model.rotors.length === 6,
  `quad ${QUAD.sizing.massKg.toFixed(3)} kg, hexa ${HEXA.sizing.massKg.toFixed(3)} kg`);

/* Drive live-flight with a scenario's own target, exactly as simulate()
   asks it: target(t, state) before the step. */
function flyLive({ model, scenario, durationS = 10, failed = new Set(), energy = null, obstacles = [] }) {
  const f = createFlight({ model, startAltitudeM: scenario.startAltitudeM ?? 2,
    initialAttitude: scenario.initialAttitude ?? {}, failed, energy, obstacles });
  const steps = Math.round(durationS / f.dt);
  const rows = [];
  for (let s = 0; s <= steps && !f.ended; s++) {
    const r = stepFlight(f, scenario.target(f.s * f.dt, f.state), scenario.collective ?? null);
    if (r) rows.push(r);
  }
  return { f, rows };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const firstDiff = (a, b) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return `row ${i} (t=${a[i].t})`;
  return a.length === b.length ? "none" : `length ${a.length} vs ${b.length}`;
};

console.log("\n1. Identity with simulate()");
check("the live step and sampling interval are simulate()'s for flights under 240 s",
  LIVE_DT_S === 0.002 && LIVE_SAMPLE_EVERY === Math.max(1, Math.round(Math.max(0.02, 10 / 12000) / 0.002)));

for (const [name, D] of [["quad", QUAD], ["hexa", HEXA]]) {
  const keys = Object.keys(SCENARIO_PRESETS).filter((k) => k !== "endurance");
  let allSame = true, worst = "";
  for (const k of keys) {
    const scenario = makeScenario(SCENARIO_PRESETS[k]);
    const run = simulate({ model: D.model, scenario, declared: DD, durationS: 10 });
    const live = flyLive({ model: D.model, scenario, durationS: 10 });
    const ok = same(live.rows, run.trace) && (live.f.ended?.reason === "ground") === run.crashed;
    if (!ok) { allSame = false; worst += `${k}: ${firstDiff(live.rows, run.trace)}; `; }
  }
  check(`${name}: every shipped preset (${keys.length}) samples the same rows as simulate(), bit for bit`,
    allSame, allSame ? `${keys.join(", ")}` : worst);
}

{
  let allSame = true, worst = "";
  for (const [k, scenario] of Object.entries(SCENARIOS)) {
    const run = simulate({ model: QUAD.model, scenario, declared: DD, durationS: 8 });
    const live = flyLive({ model: QUAD.model, scenario, durationS: 8 });
    if (!same(live.rows, run.trace)) { allSame = false; worst += `${k}: ${firstDiff(live.rows, run.trace)}; `; }
  }
  check("quad: the five raw SCENARIOS (state-reading targets) match simulate() bit for bit", allSame, worst);
}

{
  const scenario = makeScenario(SCENARIO_PRESETS.pitchPulse);
  const run = simulate({ model: HEXA.model, scenario, declared: DD, durationS: 10, energy: HEXA.energy });
  const live = flyLive({ model: HEXA.model, scenario, durationS: 10, energy: HEXA.energy });
  check("hexa with the energy model: rows, pack power and state of charge match simulate()",
    same(live.rows, run.trace) && live.f.energyWh === run.energy.energyWh,
    `${run.trace.length} rows, ${run.energy.energyWh.toFixed(4)} Wh`);
}

{
  const scenario = makeScenario(SCENARIO_PRESETS.hover);
  const failed = new Set([HEXA.model.rotors[0].motor]);
  const run = simulate({ model: HEXA.model, scenario, declared: DD, durationS: 10, failed });
  const live = flyLive({ model: HEXA.model, scenario, durationS: 10, failed });
  check("hexa with a motor failed from the start: matches simulate() bit for bit",
    same(live.rows, run.trace) && live.f.allocationFailed === run.allocationFailed,
    `allocation degraded on ${run.allocationFailed} steps in both`);
}

{
  /* A small declared usable energy, so the pack ends a 10 s flight. */
  const small = { ...HEXA.energy, usableWh: HEXA.energy.usableWh * 0.004 };
  const scenario = makeScenario(SCENARIO_PRESETS.hover);
  const run = simulate({ model: HEXA.model, scenario, declared: DD, durationS: 10, energy: small });
  const live = flyLive({ model: HEXA.model, scenario, durationS: 10, energy: small });
  check("when the pack ends the flight, it ends on the same sample with the same energy",
    run.energy.batteryEmpty && live.f.ended?.reason === "battery"
    && live.f.ended.t === run.energy.emptyAtS && same(live.rows, run.trace),
    `empty at ${run.energy.emptyAtS?.toFixed(2)} s in both`);
}

console.log("\n2. The sticks");
const f0 = createFlight({ model: QUAD.model, startAltitudeM: 3 });
const sp0 = initialSetpoint(f0);
const DT = LIVE_DT_S, D2R = Math.PI / 180;
const hold = (sp, sticks, seconds, opts) => {
  let s = sp;
  for (let i = 0; i < Math.round(seconds / DT); i++) s = sticksToTarget(s, sticks, DT, opts);
  return s;
};
check("centred sticks hold the setpoint: level, heading kept, altitude kept",
  same(hold(sp0, {}, 1), { rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 3 }));
{
  const s = hold(sp0, { pitch: 1 }, 1);
  check("forward stick commands nose-DOWN to the declared tilt (pitch is negative forward)",
    Math.abs(s.pitchRad + STICK_DEFAULTS.maxTiltDeg * D2R) < 1e-12, `${(s.pitchRad / D2R).toFixed(3)}°`);
  const r = hold(s, {}, 1);
  check("releasing the stick ramps the attitude back to level", Math.abs(r.pitchRad) < 1e-12);
}
check("no requested tilt exceeds dynamics.js's cap",
  Math.abs(hold(sp0, { roll: 1 }, 2, { maxTiltDeg: 89 }).rollRad - SCENARIO_LIMITS.maxTiltDeg * D2R) < 1e-12,
  `cap ${SCENARIO_LIMITS.maxTiltDeg}°`);
{
  const y = hold(sp0, { yaw: 1 }, 0.5);
  check("the yaw stick integrates a heading at the declared rate",
    Math.abs(y.yawRad - STICK_DEFAULTS.yawRateDegS * 0.5 * D2R) < 1e-9, `${(y.yawRad / D2R).toFixed(4)}° after 0.5 s`);
  const w = hold(sp0, { yaw: 1 }, 2.5);
  check("the heading wraps into (−180°, 180°]", w.yawRad <= Math.PI && w.yawRad > -Math.PI, `${(w.yawRad / D2R).toFixed(2)}°`);
}
check("the climb stick moves the held altitude, clamped to [0, cap]",
  Math.abs(hold(sp0, { climb: 1 }, 1).altitudeM - (3 + STICK_DEFAULTS.climbRateMps)) < 1e-9
  && hold(sp0, { climb: -1 }, 5).altitudeM === 0
  && hold({ ...sp0, altitudeM: SCENARIO_LIMITS.maxAltitudeM - 0.5 }, { climb: 1 }, 2).altitudeM === SCENARIO_LIMITS.maxAltitudeM);

/* Fly the sticks and confirm the aircraft goes where they point. */
function flySticks(D, sticks, seconds, startAltitudeM = 5) {
  const f = createFlight({ model: D.model, startAltitudeM });
  let sp = initialSetpoint(f);
  for (let i = 0; i < Math.round(seconds / f.dt) && !f.ended; i++) {
    sp = sticksToTarget(sp, sticks, f.dt);
    stepFlight(f, sp);
  }
  return { f, sp };
}
{
  const fwd = flySticks(QUAD, { pitch: 1 }, 2);
  const right = flySticks(QUAD, { roll: 1 }, 2);
  const yaw = flySticks(QUAD, { yaw: 1 }, 1);
  const up = flySticks(QUAD, { climb: 1 }, 3);
  check("forward stick flies the quad north (+x), roll right flies it east (+y)",
    fwd.f.state[0] > 1 && Math.abs(fwd.f.state[1]) < 0.05 * fwd.f.state[0]
    && right.f.state[1] > 1 && Math.abs(right.f.state[0]) < 0.05 * right.f.state[1],
    `fwd x ${fwd.f.state[0].toFixed(2)} m, right y ${right.f.state[1].toFixed(2)} m`);
  check("the yaw stick turns the nose clockwise from above (heading increases)",
    yaw.f.last.yawDeg > 20, `${yaw.f.last.yawDeg.toFixed(1)}° after 1 s`);
  check("the climb stick climbs", up.f.last.altitudeM > 6, `${up.f.last.altitudeM.toFixed(2)} m after 3 s from 5 m`);
}

console.log("\n3. Contact");
{
  /* Collective held at 80 % of the weight: the quad sinks and lands. */
  const scenario = { label: "sink", startAltitudeM: 3,
    target: () => ({ rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 3 }),
    collective: () => 0.8 * QUAD.model.m * G_NED[2] };
  const run = simulate({ model: QUAD.model, scenario, declared: DD, durationS: 10 });
  const live = flyLive({ model: QUAD.model, scenario, durationS: 10 });
  check("a sinking flight ends on the ground where simulate() says it does, rows identical",
    same(live.rows, run.trace) &&
    run.crashed && live.f.ended?.reason === "ground" && live.f.last.t === run.hitGroundAtS,
    `last sample ${run.hitGroundAtS} s in both, touchdown ${live.f.ended?.verticalMps?.toFixed(2)} m/s`);
}
{
  /* Nose DOWN (negative pitch) flies forward, +x, into the wall. */
  const wall = makeBox({ name: "test wall", x: 12, y: 0, wx: 1, wy: 30, h: 15 });
  const scenario = makeScenario({ label: "into the wall", startAltitudeM: 3,
    segments: [{ durationS: 10, pitchDeg: -15, rollDeg: 0, yawDeg: 0, altitudeM: 3 }] });
  const run = simulate({ model: QUAD.model, scenario, declared: DD, durationS: 10 });
  const fc = firstContact(run.trace, [wall], QUAD.model.envelopeRadiusM);
  const live = flyLive({ model: QUAD.model, scenario, durationS: 10, obstacles: [wall] });
  check("an obstacle ends the flight where firstContact() locates the strike on simulate()'s trace",
    fc && live.f.ended?.reason === "obstacle" && live.f.ended.name === "test wall"
    && Math.abs(live.f.ended.t - fc.t) <= LIVE_SAMPLE_EVERY * LIVE_DT_S + 1e-9,
    fc ? `firstContact ${fc.t.toFixed(3)} s, live ${live.f.ended?.t.toFixed(3)} s` : "no contact found");
  check("up to the strike, the flight with the obstacle is the flight without it",
    live.rows.length > 50 && same(live.rows, run.trace.slice(0, live.rows.length)), `${live.rows.length} rows`);
}

console.log("\n4. A motor failed in flight");
{
  const f = createFlight({ model: HEXA.model, startAltitudeM: 3 });
  const sp = initialSetpoint(f);
  advanceFlight(f, 2, sp);
  const m = HEXA.model.rotors[0].motor;
  const first = failMotor(f, m), again = failMotor(f, m), bogus = failMotor(f, 999);
  advanceFlight(f, 1, sp);
  const decay = f.thrusts[0];
  const expect = HEXA.model.hoverThrustPerRotorN * Math.pow(1 - LIVE_DT_S / DD.motorTimeConstantS, 500);
  check("failing a motor stops driving it; failing it twice or failing a motor that is not there is refused",
    first && !again && !bogus && f.failedMotors.length === 1);
  check("its thrust decays at the declared motor time constant",
    decay >= 0 && decay < 1e-6 && f.geom[0].eta === 0, `${decay.toExponential(2)} N after 1 s (≈ ${expect.toExponential(1)})`);
}

console.log("\n5. Source");
{
  const src = readFileSync(new URL("../src/classes/drone/live-flight.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort();
  check("live-flight.js imports only dynamics.js, flight-energy.js and obstacles.js",
    same(imports, ["./dynamics.js", "./flight-energy.js", "./obstacles.js"]), imports.join(", "));
  check("live-flight.js defines no equations of motion, integrator or controller of its own",
    !/function\s+(derivative|rk4|controllerStep|allocate\w*|buildMixer|packPoint)\b/.test(src)
    && !/qRotate|qMul|Jinv|cBody/.test(src));
  const dyn = readFileSync(new URL("../src/classes/drone/dynamics.js", import.meta.url), "utf8");
  check("the two lines it repeats are still simulate()'s lines",
    dyn.includes("Math.max(0, model.m * 9.80665 * tiltComp + 6 * model.m * altErr - 4 * model.m * vz)")
    && dyn.includes("thrusts = thrusts.map((x, i) => x + (cmd[i] - x) * Math.min(1, dt / model.motorTauS));")
    && src.includes("Math.max(0, model.m * G_NED[2] * tiltComp + 6 * model.m * altErr - 4 * model.m * vz)")
    && src.includes("f.thrusts = f.thrusts.map((x, i) => x + (cmd[i] - x) * Math.min(1, dt / model.motorTauS));"));
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
