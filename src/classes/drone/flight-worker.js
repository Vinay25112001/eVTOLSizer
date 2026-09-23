/* =====================================================================
   THE FLIGHT SIMULATION, OFF THE MAIN THREAD
   =====================================================================
   `simulate` integrates at dt = 2 ms, so a 120 s scenario is 60,000 RK4
   steps and a dead rotor adds a bisection to the allocator on every one
   of them. Measured on this machine: 2.4 ms per second of flight for a
   healthy quad, 4.5 ms with a rotor dead and the scene and impact
   response on. That is 0.3-0.5 s for a 120 s scenario.

   That cost used to be paid inside the render body of FlightPanel, in a
   `useMemo` whose dependencies include the scenario. Every keystroke in
   the segment editor therefore re-integrated the whole flight with the
   browser blocked: typing a duration froze the tab for a third of a
   second per character, and the editor was unusable long before the cap
   was reached. Nothing about the physics required that — the trace is
   read-only once computed — so the integration happens here instead and
   the panel waits for a message.

   WHAT CROSSES THE BOUNDARY, AND WHY IT IS SHAPED THIS WAY. A scenario
   is a TARGET FUNCTION (`scenario.target(t, state)`), and a function
   cannot be structured-cloned. So the panel does not send a scenario; it
   sends the plain arguments `makeScenario` takes and this worker builds
   the scenario on its own side. `makeScenario` is pure validation and
   arithmetic, so building it twice — once on the main thread to validate
   the edit and report what is wrong, once here to get the function —
   costs nothing measurable and keeps the two sides from disagreeing
   about what a scenario is.

   `model` DOES cross, because `buildModel` returns a plain object of
   numbers and arrays. It is built on the main thread, where the panel
   needs `maxThrustPerRotorN` synchronously to scale the thrust cones,
   and handed over as data. The alternative — rebuilding it here — would
   make the panel wait for a message before it could draw an airframe.

   THIS FILE ADDS NO PHYSICS. It calls the same `makeScenario` and
   `simulate` the validation harness calls, with the same arguments, so
   a trace computed here is the trace that was computed before. The gate
   still exercises them directly on the main thread.
   ===================================================================== */
import { makeScenario, simulate } from "./dynamics.js";
import { DEFAULT_SCENE } from "./obstacles.js";

/* A request carries its own id and the reply carries it back. The panel
   starts a run per edit and only the newest answer is wanted; ids let it
   drop the stale ones rather than letting a slow earlier run overwrite a
   newer trace. The worker answers every request it is given — deciding
   which reply still matters is the caller's job, not the integrator's. */
self.onmessage = (e) => {
  const { id, model, scenarioArgs, declared, failed, scenery, impact, energy } = e.data;
  try {
    const scenario = makeScenario(scenarioArgs);
    const run = simulate({
      model, scenario, declared,
      durationS: scenario.totalDurationS,
      failed: new Set(failed),
      obstacles: scenery ? DEFAULT_SCENE : [],
      impact,
      /* The energy model is built on the main thread and crosses as
         data: `buildEnergyModel` returns plain records and frozen
         constants precisely so it can. With it the flight runs the pack
         down and may end early; without it the loop is untouched. */
      energy,
    });
    /* The run already carries `durationS` — the duration the INTEGRATOR
       used — so the panel reads that rather than recomputing it from an
       editor state that may have moved on since the request was sent. */
    self.postMessage({ id, run });
  } catch (err) {
    self.postMessage({ id, error: err?.message ?? String(err) });
  }
};
