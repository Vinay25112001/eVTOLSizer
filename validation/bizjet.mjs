/* =====================================================================
   BUSINESS-JET GATE
   =====================================================================
   1. METHOD. The business jet is the jet-transport method with its own
      inputs: the registry dispatches it to sizeTransport, the seats and
      the carried passengers are separate, and a missing carried count
      means every seat (the airliner numbers do not move).
   2. VALIDATION. The three "tier A" business jets (validation-cases.js):
      basic operating weight and published range. Bands were set after the
      first measurement (2026-09-17) and are regression bands; the errors
      are printed every run.
   3. INPUTS. Every input states its source status.
   ===================================================================== */

import { sizeTransport, analyzeTransport } from "../src/classes/transport/size.js";
import { flopsWeights } from "../src/classes/transport/flops-weights.js";
import { BIZJET_DEFAULTS, BIZJET_INPUTS, BIZJET_ALL_INPUTS } from "../src/classes/bizjet/defaults.js";
import { BIZJET_REAL_CASES } from "../src/classes/bizjet/validation-cases.js";
import { measuredBizjetChecks, bizjetWarnings } from "../src/classes/bizjet/warnings.js";
import { classOf, sizeDesign } from "../src/classes/registry.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const pct = (a, b) => `${((a / b - 1) * 100).toFixed(1)}%`;
const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...BASE } = BIZJET_DEFAULTS;

console.log("BUSINESS-JET GATE");
console.log("=".repeat(72));

console.log("\n1. Method");
const s = sizeDesign({ aircraftClass: "bizjet", params: {} });
check("the registry sizes a business jet with the jet-transport loop and business-jet defaults",
      classOf("bizjet").size === sizeTransport && s.converged && s.inputs.engineLocation === "aft-fuselage"
      && s.inputs.reservePolicy === "nbaa" && s.inputs.tTail === true,
      `MTOW ${(s.grossLb * 0.45359237).toFixed(0)} kg, wing ${(s.wingAreaFt2 * 0.0929).toFixed(1)} m², ${s.thrustEachLbf.toFixed(0)} lbf`);
check("the payload is the carried passengers, not the seats",
      Math.abs(s.payloadLb - 4 * 200) < 1e-9 && s.weights.totals.payload === 800);
{
  const a = { ...sizeTransport({}).geometryInputs };
  const w1 = flopsWeights(a), w2 = flopsWeights({ ...a, passengersCarried: a.passengers });
  check("no carried count means every seat: airliner weights unchanged", JSON.stringify(w1) === JSON.stringify(w2));
  const w3 = flopsWeights({ ...a, passengersCarried: 10 });
  check("carrying fewer passengers changes the payload and nothing else",
        w3.totals.payload === 10 * (a.massPerPassenger + a.baggagePerPassenger) + a.cargo
        && w3.totals.operatingEmpty === w1.totals.operatingEmpty - (w1.operating.cargoContainers - w3.operating.cargoContainers));
}
{
  const nine = sizeDesign({ aircraftClass: "bizjet", params: { firstClass: 9 } });
  const twelve = sizeDesign({ aircraftClass: "bizjet", params: { firstClass: 12 } });
  check("more installed seats mean more furnishings at the same carried load",
        twelve.weights.systems.furnishings - nine.weights.systems.furnishings > 3 * 112 - 1);
}
check("business-jet warnings state the NBAA and FLOPS limits",
      bizjetWarnings(s).some((w) => /NBAA/.test(w.text)) && bizjetWarnings(s).some((w) => /Sabreliner/.test(w.text)));

console.log("\n2. Published business jets");
for (const r of measuredBizjetChecks()) {
  const c = BIZJET_REAL_CASES.find((x) => x.id === r.id);
  check(`${r.name} within ±${c.band * 100}%`, rel(r.predicted, r.actual) <= c.band,
        `${r.predicted.toFixed(0)} vs ${r.actual} ${r.unit} (${pct(r.predicted, r.actual)}); ${c.source}`);
}
{
  const lat = BIZJET_REAL_CASES[0].inputs;
  const sz = sizeTransport({ ...BASE, firstClass: 9, designRange: 2700 });
  console.log(`       Citation Latitude sized from its requirements: MTOW ${(sz.grossLb * 0.45359237).toFixed(0)} kg (${pct(sz.grossLb, lat.grossLb)}),`
            + ` wing ${(sz.wingAreaFt2 * 0.0929).toFixed(1)} m² (${pct(sz.wingAreaFt2, lat.wingAreaFt2)}),`
            + ` thrust ${sz.thrustEachLbf.toFixed(0)} lbf (${pct(sz.thrustEachLbf, lat.thrustEachLbf)}), set by ${sz.thrustGovernedBy}`);
  /* The wing loading is what the landing constraint actually sets, and it is
     now built from the Latitude's own published numbers (VREF 108 kt at MLW
     and its MLW landing distance), so it is gated. METHODS.md §8.4 predicts
     301.2 kg/m² against a published 277.3 for this aircraft, +9 %; the
     recalibration's RMS over the eight MLW-referenced types is about 7 %.
     MTOW and wing area separately are not gated: they carry the weight
     method's error as well as the matching error. */
  const wsSized = sz.grossLb * 0.45359237 / (sz.wingAreaFt2 * 0.09290304);
  const wsPublished = 13971 / 50.4;
  check("Citation Latitude wing loading from the landing constraint within ±15%",
        rel(wsSized, wsPublished) <= 0.15,
        `${wsSized.toFixed(1)} vs ${wsPublished.toFixed(1)} kg/m² (${pct(wsSized, wsPublished)}); `
        + "METHODS.md §8.4 Route A predicts 301.2 kg/m² (+9 %) with k_L 0.091 and CLmax,L 2.17");
}

console.log("\n3. Input provenance");
const bad = Object.entries(BIZJET_ALL_INPUTS).filter(([, v]) =>
  !["sourced", "derived", "assumed"].includes(v.status) || !v.source || !v.label || !v.section);
check("every business-jet input has a status, a source, a label and a section", bad.length === 0, bad.map(([k]) => k).join(", "));
check("every business-jet default is a value the sizer accepts",
      Object.keys(BIZJET_INPUTS).every((k) => k in BASE) && Number.isFinite(analyzeTransport({ ...BASE, ...BIZJET_REAL_CASES[0].inputs }).rangeNm));
console.log(`       assumed (no free source): ${Object.entries(BIZJET_INPUTS).filter(([, v]) => v.status === "assumed").map(([k]) => k).join(", ")}`);

console.log("");
console.log(fail ? `BUSINESS-JET GATE FAILED: ${fail} check(s)` : `BUSINESS-JET GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
