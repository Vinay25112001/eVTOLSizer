/* =====================================================================
   PIPELINE
   =====================================================================
   Sizing is expressed as an ordered list of named stages rather than one
   long function. Each stage is a pure (ctx) => partialResults; the runner
   merges the outputs and threads them forward, so a later stage can read an
   earlier stage's results without any stage reaching into another's locals.

   Why this shape:
     - each stage is separately readable, testable and replaceable
     - the order of the physics is visible in one place instead of implied
       by 900 lines of statement order
     - swapping a model (a different acoustics or weight method) is a
       one-line change to the stage list

   MIGRATION STATUS
   The CONVERGENCE CORE (atmosphere -> aero -> hover -> mission energy ->
   weights -> battery, iterated to close MTOW) is still a single block in
   engine.js. It is a fixed-point loop whose intermediate values are mutually
   dependent, so it is being migrated last and deliberately: splitting it
   carelessly would change results. Everything downstream of convergence is
   what moves into stages first, because those stages only READ the converged
   design.

   Stages migrated so far:  acoustics
   Still inline in engine.js: geometry, drag, stability, v-tail, propulsion,
   battery architecture, performance, payload-range, sweeps, checks
   ===================================================================== */

export function runPipeline(stages, ctx) {
  let out = {};
  for (const stage of stages) {
    const name = stage.name || "anonymous";
    let part;
    try {
      part = stage({ ...ctx, ...out });
    } catch (err) {
      /* A failing analysis stage must not take down the whole sizing run:
         the converged design is still valid and worth showing. Record the
         failure so it surfaces instead of silently producing blanks. */
      out = { ...out, _stageErrors: { ...(out._stageErrors || {}), [name]: err.message } };
      continue;
    }
    out = { ...out, ...part };
  }
  return out;
}
