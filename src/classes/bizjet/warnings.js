/* =====================================================================
   BUSINESS-JET WARNINGS AND MEASURED CHECKS
   =====================================================================
   The jet-transport warnings apply unchanged (same method); these add what
   is particular to business jets.
   ===================================================================== */
import { transportWarnings } from "../transport/warnings.js";
import { analyzeTransport } from "../transport/size.js";
import { BIZJET_DEFAULTS } from "./defaults.js";
import { BIZJET_REAL_CASES, BIZJET_VALIDATED_DOMAIN as D } from "./validation-cases.js";

const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...BASE } = BIZJET_DEFAULTS;

let measured = null;
export function measuredBizjetChecks() {
  if (!measured) {
    measured = BIZJET_REAL_CASES.map((c) => {
      const v = c.pick(analyzeTransport({ ...BASE, ...c.inputs }));
      return { group: "Published business jets", id: c.id, name: c.name, unit: c.unit, actual: c.actual, predicted: v,
               errPct: (v / c.actual - 1) * 100, band: c.band, source: c.source };
    });
  }
  return measured;
}

const within = (v, [lo, hi], tol = 0) => v >= lo * (1 - tol) && v <= hi * (1 + tol);

export function bizjetWarnings(result) {
  const out = transportWarnings(result).filter((w) => !/single-aisle|airliner/i.test(w.text));
  const p = result.inputs || {};
  out.push({ level: "info", category: "omission",
    text: "NBAA IFR reserves have no public primary definition (NBAA confirms only that the 1964 range format exists). The nbaa policy flies the alternate distance set here and a 30-minute hold at 5,000 ft; manufacturers quote 100 or 200 nm alternates." });
  out.push({ level: "info", category: "omission",
    text: "FLOPS weights were fitted to a database running \"from the T-39 Sabreliner to the Boeing 747\" (McCullers 1984); no business-jet validation of FLOPS is published. Furnishings and systems of executive cabins are the least certain groups." });
  if (Number.isFinite(p.passengersCarried) && p.passengersCarried > p.firstClass + p.businessClass + p.economyClass)
    out.push({ level: "caution", category: "setup", text: "More passengers are carried than there are seats." });
  const mtowKg = result.grossLb * 0.45359237;
  if (!within(mtowKg, D.mtowKg, 0.25))
    out.push({ level: "caution", category: "domain",
      text: `Take-off mass ${Math.round(mtowKg)} kg is outside the validated business jets (${D.note}).` });
  return out;
}
