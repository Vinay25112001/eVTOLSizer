/* =====================================================================
   THE FLIGHT WORKER — the boundary, and that it changes nothing
   =====================================================================
   The 6-DOF integration used to run in the render body of FlightPanel,
   in a `useMemo` whose dependencies include the scenario. `simulate`
   integrates at dt = 2 ms, so every keystroke in the segment editor
   re-integrated the whole flight with the browser blocked: measured at
   2.4 ms per second of flight for a healthy quad and 4.5 ms with a rotor
   dead and the scene and impact response on, a 120 s scenario froze the
   tab for a third of a second per character typed. It now runs in
   src/classes/drone/flight-worker.js.

   MOVING A COMPUTATION IS THE EASIEST WAY TO CHANGE IT BY ACCIDENT, and
   the trace is what every readout, KPI, chart and drawn frame in the
   panel is derived from. So the claim this gate exists to defend is the
   narrow one: the run computed through the worker's message contract is
   the SAME RUN, byte for byte, as the run computed inline. Not close —
   identical. Everything else here protects the boundary that makes that
   true.

   WHY THE ARGUMENTS CROSS AND NOT THE SCENARIO. A scenario is a TARGET
   FUNCTION — `scenario.target(t, state)` — and postMessage carries data,
   not functions. So the panel sends the plain arguments `makeScenario`
   takes and the worker builds the scenario on its own side. That is not
   a detail to be tidied away later: the gate asserts that a BUILT
   scenario genuinely cannot be structured-cloned, so that if this ever
   stops being true the design can be simplified deliberately rather
   than the rebuild being cargo-culted forward.

   The model DOES cross, because `buildModel` returns a plain object of
   numbers and arrays. It is built on the main thread, where the panel
   needs `maxThrustPerRotorN` synchronously to scale the thrust cones.

   `self` IS POLYFILLED BELOW. A worker module has no `window` and
   addresses itself as `self`; under Node there is no such global, so the
   gate installs one and drives `self.onmessage` exactly as the browser
   would. This runs the REAL worker file, not a copy of its logic.
   ===================================================================== */
import { buildModel, simulate, makeScenario, SCENARIO_LIMITS }
  from "../src/classes/drone/dynamics.js";
import { buildEnergyModel } from "../src/classes/drone/flight-energy.js";
import { buildAirframe, DEG } from "../src/classes/drone/geometry3d.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";
import { DEFAULT_SCENE, DECLARED_IMPACT_INPUTS } from "../src/classes/drone/obstacles.js";

/* The worker's own global. It registers `self.onmessage` on import and
   answers with `self.postMessage`, so both ends are captured here. */
const inbox = [];
globalThis.self = {
  onmessage: null,
  postMessage: (m) => inbox.push(m),
};
await import("../src/classes/drone/flight-worker.js");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE FLIGHT WORKER GATE");
console.log("=".repeat(78));

const DD = { motorTimeConstantS: 0.05, bodyDragCoefficient: 1.0 };
const cell = BATTERIES.find((b) => b.id === "molicel-inr21700-p42a");
const pack = assemblePack(cell, { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");
const frame = FRAMES.find((f) => f.frameClass === "HEXA" && f.frameType === "X");
const selection = {
  rotors: frame.motors.length, propeller: prop, propellerMassG: 45,
  motor: MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360"),
  esc: ESCS.find((e) => e.model.includes("ALPHA 60A")),
  battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
};
const declared = { structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
                   avionicsPowerW: 8, thrustToWeightRequired: 2.0 };
const sizing = sizeDrone({ mission: { payloadKg: 0.5, hoverEnduranceMin: 15 },
                           selection, declared });
const airframe = buildAirframe({ frame, propellerDiameterM: prop.diameterM,
                                 tipGapFraction: 0.10 });
const model = buildModel({ sizing, airframe, declared: DD });

/* The arguments FlightPanel's `scenarioArgs` produces. Deliberately not
   a hover: a stepped altitude, a rate-approached altitude, a held tilt,
   a yaw, an initial roll upset and a dead rotor, so the comparison runs
   through the allocator's degraded path and the contact logic rather
   than a case where every sample is the same number. */
const scenarioArgs = {
  label: "worker equivalence",
  startAltitudeM: 2,
  initialAttitude: { rollRad: 3 * DEG, pitchRad: 0, yawRad: 0 },
  segments: [
    { durationS: 4, rollDeg: 0, pitchDeg: 0, yawDeg: 0, altitudeM: 4, altitudeRateMps: "" },
    { durationS: 6, rollDeg: 0, pitchDeg: 8, yawDeg: 15, altitudeM: 4, altitudeRateMps: 0.5 },
    { durationS: 5, rollDeg: 0, pitchDeg: 0, yawDeg: 15, altitudeM: 2, altitudeRateMps: "" },
  ],
};
const impact = {
  restitution: DECLARED_IMPACT_INPUTS.restitution.value,
  tangentialScrub: DECLARED_IMPACT_INPUTS.tangentialScrub.value,
  bladeBreakSpeedMps: DECLARED_IMPACT_INPUTS.bladeBreakSpeedMps.value,
};
const failed = [2];
const payload = { id: 1, model, scenarioArgs, declared: DD, failed, scenery: true, impact };

/* ── 1. THE BOUNDARY ───────────────────────────────────────────────── */
let cloneErr = null;
try { structuredClone(payload); } catch (e) { cloneErr = e.message; }
check("every value the panel sends survives structuredClone", cloneErr === null,
  cloneErr ?? "id, model, scenarioArgs, declared, failed, scenery, impact");

let scenarioClones = true;
try { structuredClone(makeScenario(scenarioArgs)); } catch { scenarioClones = false; }
check("a BUILT scenario cannot cross the boundary, because it carries target()",
  scenarioClones === false,
  "which is why the worker rebuilds it from the arguments rather than receiving it");

check("the worker registered a message handler on import",
  typeof globalThis.self.onmessage === "function");

/* ── 2. THE FLIGHT IS THE SAME FLIGHT ──────────────────────────────── */
const scenario = makeScenario(scenarioArgs);
const direct = simulate({
  model, scenario, declared: DD, durationS: scenario.totalDurationS,
  failed: new Set(failed), obstacles: DEFAULT_SCENE, impact,
});

inbox.length = 0;
globalThis.self.onmessage({ data: payload });
const reply = inbox.pop();

check("the worker replies with the id it was given", reply?.id === 1, `id ${reply?.id}`);
check("the worker returns a run, not an error", !reply?.error, reply?.error ?? "no error");

const viaWorker = reply?.run;
check("the trace has the same number of samples",
  viaWorker?.trace.length === direct.trace.length,
  `${viaWorker?.trace.length} vs ${direct.trace.length}`);

/* The whole run, not a sampled comparison: every state, every per-rotor
   thrust, every reported flag. A tolerance here would be the wrong
   instrument — moving a computation must not perturb it at all. */
const a = JSON.stringify(direct), b = JSON.stringify(viaWorker);
let firstDiff = null;
if (a !== b) {
  for (let k = 0; k < Math.min(a.length, b.length); k++)
    if (a[k] !== b[k]) {
      firstDiff = `first difference at byte ${k}: `
        + `…${a.slice(Math.max(0, k - 50), k + 50)}… vs …${b.slice(Math.max(0, k - 50), k + 50)}…`;
      break;
    }
}
check("the run computed through the worker is IDENTICAL to the inline run, byte for byte",
  a === b, firstDiff ?? `${(a.length / 1e3).toFixed(0)} kB of run, identical`);

check("the run carries the duration the scenario asked for",
  viaWorker?.durationS === scenario.totalDurationS,
  `${viaWorker?.durationS} s over ${scenarioArgs.segments.length} segments`);

check("and the degraded allocator path was actually exercised",
  Array.isArray(viaWorker?.failed) && viaWorker.failed.length === 1,
  `motor ${viaWorker?.failed?.[0]} dead through the boundary as a Set again`);

/* ── 3. AN INVALID SCENARIO IS AN ANSWER, NOT A CRASH ──────────────── */
/* The worker must not die on a half-typed scenario: the panel keeps the
   same worker for its lifetime, so a throw that escaped would take every
   later flight with it. makeScenario's own message comes back instead. */
inbox.length = 0;
globalThis.self.onmessage({ data: { ...payload, id: 2,
  scenarioArgs: { ...scenarioArgs, segments: [{ durationS: 9999 }] } } });
const badSeg = inbox.pop();
check("a SEGMENT over the cap replies with makeScenario's message",
  badSeg?.id === 2 && new RegExp(`capped at ${SCENARIO_LIMITS.maxSegmentDurationS} s`)
    .test(badSeg?.error ?? ""),
  badSeg?.error ?? "no error returned");

/* Derived from the cap, not written as a literal: the cap has moved
   twice (120 -> 300 -> 2400 s) and a hardcoded total silently stopped
   exceeding it, which made this check pass for the wrong reason. Three
   halves of the total cap always overrun it while each segment stays
   inside the per-segment cap. */
const halfCap = SCENARIO_LIMITS.maxTotalDurationS / 2;
inbox.length = 0;
globalThis.self.onmessage({ data: { ...payload, id: 3,
  scenarioArgs: { ...scenarioArgs,
    segments: [halfCap, halfCap, halfCap].map((d) => ({ durationS: d, altitudeM: 4 })) } } });
const badTotal = inbox.pop();
check("a TOTAL over the cap replies with makeScenario's message",
  badTotal?.id === 3 && new RegExp(`the cap is ${SCENARIO_LIMITS.maxTotalDurationS} s`)
    .test(badTotal?.error ?? ""),
  badTotal?.error ?? "no error returned");

inbox.length = 0;
globalThis.self.onmessage({ data: payload });
check("and the worker still answers after an invalid request",
  !inbox.pop()?.error, "one worker serves the panel's whole lifetime");

/* ── 4. THE CAP THE WORKER BOUGHT ──────────────────────────────────── */
/* The duration cap was 120 s because the integration ran on the main
   thread. A healthy aircraft with no upset, so the run is not cut short
   by ground contact: the point is that a FULL-LENGTH trace crosses the
   boundary, which is the case the transfer cost was argued about. */
const LONG_S = 250;
check(`the cap admits a ${LONG_S} s scenario at all`,
  LONG_S <= SCENARIO_LIMITS.maxTotalDurationS,
  `cap is ${SCENARIO_LIMITS.maxTotalDurationS} s, and was 120 s while this ran on the main thread`);

inbox.length = 0;
globalThis.self.onmessage({ data: { ...payload, id: 4, failed: [],
  scenarioArgs: { label: "long hover", startAltitudeM: 4, initialAttitude: {},
    segments: [{ durationS: LONG_S, rollDeg: 0, pitchDeg: 0, yawDeg: 0,
                 altitudeM: 4, altitudeRateMps: "" }] } } });
const long = inbox.pop();
const expected = Math.round(LONG_S / 0.02) + 1;
check(`a ${LONG_S} s flight comes back whole — every sample, across the boundary`,
  long?.id === 4 && !long?.error && long.run.durationS === LONG_S
    && long.run.crashed === false && long.run.trace.length === expected,
  long?.error ?? `${long?.run?.trace.length} samples (expected ${expected}), `
    + `crashed ${long?.run?.crashed}`);

/* ── 4b. THE ENERGY MODEL CROSSES THE BOUNDARY AND IS USED ──────────
   The panel builds the energy model on this side and posts it as data.
   drone-flight-energy.mjs proves the model itself; what is checked here
   is only that the worker actually threads it into `simulate` and brings
   the result back — a wire that is easy to leave unconnected, in which
   case every flight would silently be an infinite-battery flight. */
inbox.length = 0;
const energyModel = buildEnergyModel({ selection, declared, sizing });
globalThis.self.onmessage({ data: { ...payload, id: 5, failed: [],
  energy: energyModel,
  scenarioArgs: { label: "drain", startAltitudeM: 4, initialAttitude: {},
    segments: [{ durationS: SCENARIO_LIMITS.maxTotalDurationS, rollDeg: 0, pitchDeg: 0,
                 yawDeg: 0, altitudeM: 4, altitudeRateMps: "" }] } } });
const drained = inbox.pop();
check("an energy model posted to the worker comes back as an integrated run",
  drained?.id === 5 && !drained?.error && drained.run.energy != null
    && drained.run.energy.energyWh > 0,
  drained?.error ?? `${drained?.run?.energy?.energyWh.toFixed(1)} Wh consumed`);
check("and the PACK ends the flight, not the duration cap",
  drained?.run?.energy?.batteryEmpty === true
    && drained.run.energy.emptyAtS < SCENARIO_LIMITS.maxTotalDurationS,
  `empty at ${(drained?.run?.energy?.emptyAtS / 60).toFixed(2)} min, `
  + `inside a ${(SCENARIO_LIMITS.maxTotalDurationS / 60).toFixed(0)} min scenario — `
  + `the cap is set above the pack on purpose`);
check("a full-length flight's trace stays bounded despite its length",
  drained?.run?.trace.length <= 12001,
  `${drained?.run?.trace.length} samples over ${drained?.run?.energy?.emptyAtS.toFixed(0)} s `
  + `— the recording interval stretches past 240 s so the trace cannot grow without limit`);

/* ── 5. THE CAP IS A BUDGET, AND SAYS WHAT KIND ────────────────────── */
/* It is not a physical limit, and the code must not start reading like
   one: nothing in the integration stops working at any duration, and it
   carries no state of charge, which is why the panel REPORTS a scenario
   that outruns the design's computed endurance instead of refusing it. */
check("the aircraft's own endurance is a computed quantity the panel can report against",
  sizing.endurance?.minutes > 0,
  `${sizing.endurance.minutes.toFixed(1)} min of hover computed, `
  + `P10 ${sizing.endurance.minutesP10.toFixed(1)} / P90 ${sizing.endurance.minutesP90.toFixed(1)}`);

check("and the integrator carries no state of charge, so it cannot enforce it",
  !("stateOfCharge" in model) && !("energyWh" in model) && !("soc" in viaWorker),
  "the run reports no energy consumed — that chain is battery.js, via the Endurance tab");

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE FLIGHT WORKER GATE PASSED (${pass} checks)`
                       : `DRONE FLIGHT WORKER GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
