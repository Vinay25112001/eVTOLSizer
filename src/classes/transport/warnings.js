/* =====================================================================
   TRANSPORT WARNINGS — what a transport result cannot be trusted for
   =====================================================================
   Same categories as the trainer and eVTOL warnings. Validation errors are
   recomputed from the cases, never quoted.
   ===================================================================== */

import { TRANSPORT_INPUTS } from "./defaults.js";
import { TRANSPORT_REAL_CASES, TRANSPORT_VALIDATED_DOMAIN as D, B738_SIZING_TARGETS } from "./validation-cases.js";
import { analyzeTransport, sizeTransport, icaRequiredAltFt } from "./size.js";

let measured = null;
export function measuredTransportChecks() {
  if (!measured) {
    const real = TRANSPORT_REAL_CASES.map(c => {
      const v = c.pick(analyzeTransport(c.inputs));
      return { id: c.id, name: c.name, unit: c.unit, actual: c.actual, predicted: v, errPct: (v / c.actual - 1) * 100 };
    });
    const s = sizeTransport({});
    const sizing = B738_SIZING_TARGETS.map(t => ({ ...t, predicted: s[t.key], errPct: (s[t.key] / t.actual - 1) * 100 }));
    measured = { real, sizing };
  }
  return measured;
}

const within = (v, [lo, hi], tol = 0) => v >= lo * (1 - tol) && v <= hi * (1 + tol);

export function transportWarnings(result) {
  const out = [];
  const p = result.inputs || {};
  if (result.mode === "sizing" && !result.converged) {
    out.push({ level: "error", category: "execution",
      text: `The sizing loop did not converge: ${result.stopReason}. The numbers shown are the last iteration, not a design.` });
  }
  if (result.mode === "sizing" && result.fuelFits === false) {
    out.push({ level: "error", category: "execution",
      text: `The mission needs ${Math.round(result.fuelLb).toLocaleString("en-US")} lb of fuel and the wing holds ${Math.round(result.fuelCapacityLb).toLocaleString("en-US")} lb. Add fuselage tanks, a larger wing or a shorter range.` });
  }
  const pax = (p.firstClass ?? 0) + (p.businessClass ?? 0) + (p.economyClass ?? 0);
  const outside = [];
  if (!within(result.grossLb, D.grossLb, 0.05)) outside.push(`gross weight ${Math.round(result.grossLb).toLocaleString("en-US")} lb`);
  if (!within(pax, D.passengers, 0.1)) outside.push(`${pax} passengers`);
  if (!within(p.designRange, D.rangeNm, 0.1)) outside.push(`range ${p.designRange} nm`);
  if (p.numEngines !== 2) outside.push(`${p.numEngines} engines`);
  if (outside.length) out.push({ level: "caution", category: "domain", text: `Outside the validated domain (${D.note}): ${outside.join(", ")}.` });
  if (p.fuelMethod === "regulatory") {
    out.push({ level: "caution", category: "method",
      text: "The regulatory fuel method (generic segment fractions and 14 CFR 121.639 reserves) sizes the 737-800 about 20% heavy; the Loftin method is the one validated." });
  }
  const assumed = Object.entries(TRANSPORT_INPUTS).filter(([, v]) => v.status === "assumed");
  out.push({ level: "info", category: "inputs",
    text: `${assumed.length} inputs have no free source: ${assumed.map(([, v]) => v.label.toLowerCase()).join("; ")}. The 737-800 defaults come largely from NASA's FLOPS model of that aircraft, so sizing it back is a consistency check, not an independent prediction.` });
  /* Buffet at the initial cruise altitude, when the user has supplied a
     limit. 1.3 g is the margin Airbus applies (p.138) and the 0.3 g margin
     AC 25-7D §10.1.2.4 calls "practical operating criteria imposed by most
     operators". No public correlation gives CL_buffet(M), so nothing is
     checked unless a limit is entered, and the omission is stated. */
  const ic = result.constraints?.ica;
  const icaFt = icaRequiredAltFt(p);
  if (icaFt > 0 && p.buffetClLimit > 0 && ic) {
    const need = ic.clBuffetMargin;
    out.push({ level: need > p.buffetClLimit ? "caution" : "info", category: need > p.buffetClLimit ? "criterion" : "method",
      text: need > p.buffetClLimit
        ? `Buffet: at ${icaFt.toLocaleString("en-US")} ft and M ${p.cruiseMach} this wing flies at CL ${ic.cl.toFixed(3)} at maximum take-off mass, so the 1.3 g margin needs CL ${need.toFixed(3)}, above the ${p.buffetClLimit} entered as the buffet limit. The aircraft cannot hold that altitude at that weight.`
        : `Buffet: CL ${ic.cl.toFixed(3)} at ${icaFt.toLocaleString("en-US")} ft and maximum take-off mass, needing CL ${need.toFixed(3)} at 1.3 g against the ${p.buffetClLimit} entered. The limit is the user's; no public buffet correlation is used.` });
  } else if (icaFt > 0) {
    out.push({ level: "info", category: "omission",
      text: "The initial cruise altitude is checked against thrust with a residual rate of climb, but not against buffet: no verified public buffet-lift-coefficient correlation was found, so nothing is assumed. Enter a buffet CL for this wing to have the 1.3 g margin checked." });
  }
  const notModelled = ["step cruise",
    "balanced field length from the take-off run itself (the field lengths are Loftin's statistical fit)",
    "fuselage sizing from the cabin layout", "balance and centre of gravity", "cost"];
  if (!(icaFt > 0))
    notModelled.unshift("whether the aircraft can reach the altitude it is said to cruise at (set an initial cruise altitude requirement to check it)");
  if (p.dragMethod !== "flops")
    notModelled.unshift("a component drag build-up (this run uses c_f × wetted area plus induced drag, with no compressibility term; the FLOPS build-up is the \"flops\" drag method)");
  if (p.fuelMethod !== "mission")
    notModelled.unshift("climb and descent as flown (this run uses segment fractions; the \"mission\" fuel method integrates them)");
  out.push({ level: "info", category: "omission",
    text: `Not modelled: ${notModelled.join(", ")}. The FLOPS wetted-area formulas are ported but have no FLOPS test values.` });
  if (p.thrustLapseMethod === "scholz") {
    out.push({ level: "caution", category: "method",
      text: "Two thrust lapses are in use at once: the matching chart takes cruise thrust from Scholz (5.29), which gives 0.233 of take-off thrust at 35,000 ft for a bypass ratio of 5.1, while the mission takes it from the NASA Aviary FLOPS deck, which gives 0.186 there — 25% apart. Choose the \"deck\" cruise thrust lapse to make them agree, as Boeing's own process does." });
  }
  out.push({ level: "caution", category: "method",
    text: "The take-off and climb requirements use static thrust rather than thrust at V2, which is optimistic by about 9% on the second-segment line. No thrust model here varies with temperature, so a hot-day sizing is not available from the propulsion side, although the field lengths themselves can be given a field elevation and a temperature above ISA." });
  const m = measuredTransportChecks();
  out.push({ level: "info", category: "uncertainty",
    text: `Checked against published aircraft: ${m.real.map(r => `${r.name} ${r.errPct >= 0 ? "+" : ""}${r.errPct.toFixed(1)}%`).join("; ")}. A 737-800 sized from its requirements: ${m.sizing.map(t => `${t.label.toLowerCase()} ${t.errPct >= 0 ? "+" : ""}${t.errPct.toFixed(1)}%`).join(", ")}.` });
  return out;
}
