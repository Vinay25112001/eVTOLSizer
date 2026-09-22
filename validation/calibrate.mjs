/* ═══════════════════════════════════════════════════════════════════════
   TECHNOLOGY-FACTOR CALIBRATION
   ═══════════════════════════════════════════════════════════════════════
   Solves for the single structural technology factor that minimises MTOW
   error across the reference aircraft, and reports the residual per aircraft.

   This is CALIBRATION, not prediction. One free parameter fitted to a small
   set of aircraft. It is legitimate (NDARC does the same with per-group tech
   factors) but it must be stated plainly, and the residual spread is the
   honest measure of how much physics the buildup is actually capturing:
   a tight spread means the model captures configuration differences and only
   needed a level shift; a wide spread means it does not.
   ═══════════════════════════════════════════════════════════════════════ */
import { runSizing } from "../src/engine.js";
import { REFERENCE_AIRCRAFT, TECH_BASELINE } from "./reference-aircraft.js";

const withReserve = (p) => ({ ...p, range: p.range + (0.76 * p.vCruise * (p.reserveMinutes ?? 20) * 60) / 1000 });
const ok = (m) => m && m.value != null && (m.confidence === "high" || m.confidence === "medium");

const cases = REFERENCE_AIRCRAFT
  .filter((a) => ok(a.published.payload_kg) && ok(a.published.range_km) && ok(a.published.cruise_ms) && ok(a.published.MTOW_kg))
  .map((a) => ({
    name: a.name,
    target: a.published.MTOW_kg.value,
    params: { ...TECH_BASELINE, weightModel: "buildup", ...(a.techOverrides || {}),
      payload: a.published.payload_kg.value,
      range:   a.published.range_km.value,
      vCruise: a.published.cruise_ms.value,
      nPropHover: ok(a.published.nRotors) ? a.published.nRotors.value : 6 },
  }));

const errFor = (tf) => cases.map((c) => {
  const R = runSizing(withReserve({ ...c.params, structTechFactor: tf }));
  return { name: c.name, pred: R.MTOW, target: c.target,
           errPct: ((R.MTOW - c.target) / c.target) * 100, ewf: R.ewfImplied };
});

// Golden-section style scan then refine — the objective is smooth in tf.
let best = { tf: 1, mae: Infinity };
for (let tf = 0.80; tf <= 2.20; tf += 0.001) {
  const e = errFor(tf);
  const mae = e.reduce((a, b) => a + Math.abs(b.errPct), 0) / e.length;
  if (mae < best.mae) best = { tf: +tf.toFixed(3), mae };
}

console.log("═".repeat(72));
console.log("STRUCTURAL TECHNOLOGY FACTOR — CALIBRATION");
console.log("═".repeat(72));
console.log(`Aircraft in fit      : ${cases.length}`);
console.log(`Free parameters      : 1  (structTechFactor)`);
console.log(`Best-fit factor      : ${best.tf}`);
console.log(`MTOW mean abs error  : ${best.mae.toFixed(1)}%\n`);
console.log("residuals at best fit:");
for (const e of errFor(best.tf)) {
  console.log(`  ${e.name.padEnd(22)} pred ${e.pred.toFixed(0).padStart(6)} kg   ` +
              `published ${String(e.target).padStart(5)} kg   ` +
              `${(e.errPct > 0 ? "+" : "") + e.errPct.toFixed(1)}%   EWF ${e.ewf}`);
}
console.log("\nuncalibrated (factor = 1.00) for comparison:");
for (const e of errFor(1.0)) {
  console.log(`  ${e.name.padEnd(22)} pred ${e.pred.toFixed(0).padStart(6)} kg   ` +
              `${(e.errPct > 0 ? "+" : "") + e.errPct.toFixed(1)}%   EWF ${e.ewf}`);
}
console.log("\nCaution: 1 parameter fitted to " + cases.length + " aircraft. The residual SPREAD, " +
            "not the\nmean, tells you whether the buildup captures configuration differences.");
