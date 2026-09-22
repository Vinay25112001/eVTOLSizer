/* =====================================================================
   TRAINER WARNINGS — what a trainer result cannot be trusted for
   =====================================================================
   The same categories as the eVTOL warnings (NASA-STD-7009B [M&S 32]):
   execution problems, domain excursions, model omissions and the inputs
   nobody has a source for. Returned as plain data so the screen and any
   report say the same thing.
   ===================================================================== */

import { TRAINER_INPUTS } from "./defaults.js";
import { TRAINER_VALIDATED_DOMAIN as D, TRAINER_EMPTY_WEIGHT_CASES } from "./validation-cases.js";
import { analyzeTrainer } from "./size.js";

/* Measured, not quoted: the validation errors are recomputed from the cases
   so this text cannot drift from the model. */
let measured = null;
export function measuredEmptyWeightErrors() {
  if (!measured) {
    measured = TRAINER_EMPTY_WEIGHT_CASES.map(c => ({
      id: c.id, name: c.name, actual: c.emptyLb,
      predicted: analyzeTrainer(c.inputs).emptyLb,
    })).map(r => ({ ...r, errPct: (r.predicted / r.actual - 1) * 100 }));
  }
  return measured;
}

const within = (v, [lo, hi], tol = 0) => v >= lo * (1 - tol) && v <= hi * (1 + tol);

export function trainerWarnings(result) {
  const out = [];
  const p = result.inputs || {};
  if (result.mode === "sizing" && !result.converged) {
    out.push({ level: "error", category: "execution",
      text: `The sizing loop did not converge: ${result.stopReason}. The numbers shown are the last iteration, not a design.` });
  }
  if (result.mode === "sizing" && result.cruisePowerAvailable === false) {
    out.push({ level: "caution", category: "domain",
      text: `At ${p.cruiseAltFt} ft an unsupercharged engine gives ${(result.cruiseAltitudePowerRatio * 100).toFixed(1)}% of rated power (Loftin Fig 6.28), less than the ${(p.cruisePowerFrac * 100).toFixed(0)}% cruise setting asked for. The C172S POH quotes 75% at 8,500 ft, so the curve is approximate here.` });
  }
  const gross = result.grossLb, hp = result.hp, S = result.wingAreaFt2 ?? result.geometry?.wingAreaFt2;
  const seats = (p.pax ?? 0) + 1;
  const outside = [];
  if (!within(gross, D.grossLb, 0.05)) outside.push(`gross weight ${Math.round(gross)} lb`);
  if (!within(hp, D.hp, 0.05)) outside.push(`power ${Math.round(hp)} hp`);
  if (S && !within(S, D.wingAreaFt2, 0.10)) outside.push(`wing area ${Math.round(S)} ft²`);
  if (!within(seats, D.seats)) outside.push(`${seats} seats`);
  if (outside.length) {
    out.push({ level: "caution", category: "domain",
      text: `Outside the validated domain (${D.note}): ${outside.join(", ")}.` });
  }
  const assumed = Object.entries(TRAINER_INPUTS).filter(([, v]) => v.status === "assumed");
  out.push({ level: "info", category: "inputs",
    text: `${assumed.length} inputs have no free source and use stated judgements: ${assumed.map(([, v]) => v.label.toLowerCase()).join("; ")}. The largest effects are the strut station and fuselage width (about ±9% of empty weight each across their ranges).` });
  out.push({ level: "info", category: "omission",
    text: "Not modelled: take-off and landing distances, the drag build-up (a single C_D0 is used), electric or hybrid propulsion, retractable gear, pressurisation, and balance. Climb fuel uses the cruise sfc, which is the only value Loftin Table 6.III gives." });
  const m = measuredEmptyWeightErrors();
  const mean = m.reduce((a, r) => a + Math.abs(r.errPct), 0) / m.length;
  out.push({ level: "info", category: "uncertainty",
    text: `Empty-weight error on the validation aircraft: ${m.map(r => `${r.name} ${r.errPct >= 0 ? "+" : ""}${r.errPct.toFixed(1)}%`).join(", ")} (mean ${mean.toFixed(1)}%). Sizing a C172S from its own requirements under-predicts its power and fuel (see the validation table): the drag model is more optimistic than the real aircraft.` });
  return out;
}
