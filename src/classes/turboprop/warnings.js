/* =====================================================================
   TURBOPROP WARNINGS — what a turboprop result cannot be trusted for
   =====================================================================
   Same categories as the other classes. Validation errors are recomputed
   from the cases, never quoted.
   ===================================================================== */

import { TURBOPROP_INPUTS } from "./defaults.js";
import { TURBOPROP_REAL_CASES, TURBOPROP_BLOCK_FUEL, TURBOPROP_VALIDATED_DOMAIN as D, ATR72_SIZING_TARGETS } from "./validation-cases.js";
import { analyzeTurboprop, sizeTurboprop, tripFuel } from "./size.js";

const KG = 0.45359237;
let measured = null;
export function measuredTurbopropChecks() {
  if (!measured) {
    const err = (v, a) => (v / a - 1) * 100;
    const real = TURBOPROP_REAL_CASES.map(c => {
      const v = c.pick(analyzeTurboprop(c.inputs));
      return { id: c.id, name: c.name, unit: c.unit, actual: c.actual, predicted: v, errPct: err(v, c.actual) };
    });
    const block = TURBOPROP_BLOCK_FUEL.map(c => {
      const v = tripFuel(analyzeTurboprop(c.inputs).fuel, c.rangeNm, c.landingKg / KG) * KG;
      return { id: c.id, name: c.name, unit: "kg", actual: c.actual, predicted: v, errPct: err(v, c.actual) };
    });
    const s = sizeTurboprop({});
    const sizing = ATR72_SIZING_TARGETS.map(t => ({ ...t, predicted: t.pick(s), errPct: err(t.pick(s), t.actual) }));
    measured = { real, block, sizing };
  }
  return measured;
}

const within = (v, [lo, hi], tol = 0) => v >= lo * (1 - tol) && v <= hi * (1 + tol);
const signed = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

export function turbopropWarnings(result) {
  const out = [];
  const p = result.inputs || {};
  if (result.mode === "sizing" && !result.converged) {
    out.push({ level: "error", category: "execution",
      text: `The sizing loop did not converge: ${result.stopReason}. The numbers shown are the last iteration, not a design.` });
  }
  if (result.mode === "sizing" && result.fuelFits === false) {
    out.push({ level: "error", category: "execution",
      text: `The mission needs ${Math.round(result.fuelLb * KG).toLocaleString("en-US")} kg of fuel and the wing holds ${Math.round(result.fuelCapacityLb * KG).toLocaleString("en-US")} kg.` });
  }
  if (result.mode === "analysis" && result.cruisePowerMet === false) {
    out.push({ level: "caution", category: "execution",
      text: "The engines as given cannot hold the cruise Mach at any altitude up to the ceiling with the assumed power lapse; the range shown assumes they can." });
  }
  const outside = [];
  const kg = result.grossLb * KG;
  if (!within(kg, D.grossKg, 0.05)) outside.push(`take-off mass ${Math.round(kg).toLocaleString("en-US")} kg`);
  if (!within(p.passengers, D.passengers, 0.1)) outside.push(`${p.passengers} passengers`);
  if (!within(p.designRange, D.rangeNm, 0.1)) outside.push(`range ${p.designRange} nm`);
  if (p.numEngines !== 2) outside.push(`${p.numEngines} engines`);
  if (outside.length) out.push({ level: "caution", category: "domain", text: `Outside the validated domain (${D.note}): ${outside.join(", ")}.` });
  if (p.fuelMethod === "roskam") {
    out.push({ level: "caution", category: "method",
      text: "Roskam's segment fractions charge about three times the block fuel the ATR 72 factsheet gives for 200 nm; the Breguet method is the one checked against it." });
  }
  const m = measuredTurbopropChecks();
  out.push({ level: "caution", category: "uncertainty",
    text: `FLOPS was fitted to jet transports. On these turboprops it gives operating empty weights of ${m.real.map(r => `${r.name.replace(" operating empty weight", "")} ${signed(r.errPct)}`).join(", ")}; NASA found the same for the ATR 42 (Antcliff et al. 2016) and calibrated FLOPS to it. No calibration is applied here. Sizing the ATR 72 from its requirements: ${m.sizing.map(t => `${t.label.toLowerCase()} ${signed(t.errPct)}`).join(", ")}.` });
  out.push({ level: "info", category: "uncertainty",
    text: `Block fuel against the factsheets: ${m.block.map(r => `${r.name.replace(" block fuel", "").replace(" trip fuel", "")} ${signed(r.errPct)}`).join("; ")}.` });
  const assumed = Object.entries(TURBOPROP_INPUTS).filter(([, v]) => v.status === "assumed");
  out.push({ level: "info", category: "inputs",
    text: `${assumed.length} inputs have no free source: ${assumed.map(([, v]) => v.label.toLowerCase()).join("; ")}.` });
  out.push({ level: "info", category: "omission",
    text: "Not modelled: propeller performance maps (efficiencies are inputs, from Scholz & Nita's ATR 72 example), hot-day or high-field take-off, climb and descent as flown, a component drag build-up (L/D from Scholz & Nita's statistical k_E), fuselage sizing from the cabin, balance, noise and cost. The power lapse is a generic fit; the ATR 72 example's cruise matches its Schaufele row rather than the recommended average." });
  return out;
}
