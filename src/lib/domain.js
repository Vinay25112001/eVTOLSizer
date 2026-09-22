/* =====================================================================
   IS THIS DESIGN INSIDE WHAT THE TOOL HAS CHECKED? — NASA-STD-7009B [M&S 26]
   =====================================================================
   Results "used outside the domains of V&V" must carry "the type of limit
   exceeded, the extent that the limit was exceeded, and an assessment of the
   consequences" (NASA-STD-7009B 4.3.1.5). The domains themselves are
   generated from the harnesses into validation-domain.js by
   validation/validation-domain.mjs, and CI fails if that file is stale.

   THE CONSEQUENCE IS STATED AS UNKNOWN, ON PURPOSE. The accuracy the tool
   reports was measured inside the validation envelope. Nothing measures it
   outside, so the honest assessment is that the error there is not known —
   not that it is "probably small". The extent is given as a number because
   that part IS known.
   ===================================================================== */

import DOMAIN from "./validation-domain.js";
import { engineInputs } from "./designfile.js";

export { DOMAIN };

const LAYOUT_LABEL = {
  liftcruise: "lift+cruise", hybrid: "tilt+lift hybrid", hybridPusher: "hybrid with pusher",
  tiltrotor: "tiltrotor", multicopter: "multicopter", sideBySide: "side-by-side",
};

function excursion(domain, key, label, unit, value, lo, hi) {
  if (!Number.isFinite(value)) return null;
  if (value >= lo && value <= hi) return null;
  const edge = value < lo ? lo : hi;
  const extentPct = edge !== 0 ? (100 * (value - edge)) / Math.abs(edge) : null;
  return { domain, key, label, unit, value, min: lo, max: hi, side: value < lo ? "below" : "above", extentPct };
}

/* params: UI state. R: the engine result for it (may be null). */
export function assessDomain(params, R) {
  const out = [];
  const layout = params?.configType ?? "liftcruise";

  /* ── validation ─────────────────────────────────────────────────── */
  const V = DOMAIN.validation;
  const powertrain = params?.powertrain === "turboelectric" ? "turboelectric" : "battery";
  /* Validated per powertrain: a turboelectric design is not validated by
     battery aircraft, whatever its size. */
  const PT = V.byPowertrain?.[powertrain] ?? { envelope: {}, layouts: {}, count: 0 };
  const validatedLayout = Array.isArray(PT.layouts[layout]);
  if (!validatedLayout) {
    out.push({ domain: "validation", key: "configType", label: "Layout", unit: "",
               value: LAYOUT_LABEL[layout] ?? layout, side: "outside", extentPct: null,
               detail: `no ${powertrain === "turboelectric" ? "turboelectric " : ""}${LAYOUT_LABEL[layout] ?? layout} aircraft has been compared with this tool` });
  }
  const vals = { payload: params?.payload, range_km: params?.range, vCruise: params?.vCruise, MTOW: R?.MTOW };
  for (const [k, e] of Object.entries(PT.envelope)) {
    const x = excursion("validation", k, e.label, e.unit, vals[k], e.min, e.max);
    if (x) out.push(x);
  }

  /* ── verification ───────────────────────────────────────────────── */
  const W = DOMAIN.verification;
  if (!W.layouts.includes(layout)) {
    out.push({ domain: "verification", key: "configType", label: "Layout", unit: "",
               value: layout, side: "outside", extentPct: null,
               detail: "the identity checks never run this layout" });
  }
  const e = params ? engineInputs(params) : {};
  for (const [k, [lo, hi]] of Object.entries(W.sweep)) {
    const x = excursion("verification", k, k === "range" ? "range incl. reserve" : k, "", e[k], lo, hi);
    if (x) out.push(x);
  }

  const insideValidation = !out.some(x => x.domain === "validation");
  const insideVerification = !out.some(x => x.domain === "verification");
  return {
    insideValidation, insideVerification, excursions: out,
    powertrain,
    validatedCases: PT.count,
    sameLayoutCases: validatedLayout ? PT.layouts[layout].length : 0,
    consequence: insideValidation
      ? (PT.count === 1 ? "At the one validated aircraft of this powertrain. " : "") + "Inside the envelope of the validated aircraft. The envelope is a per-variable box, so a design can sit inside every interval and still be unlike each case."
      : "Outside the envelope of the validated aircraft. The accuracy in VALIDATION.md was measured inside it; the error here has not been measured and is unknown.",
    verificationConsequence: insideVerification
      ? "Inside the design points the independent identity checks run on."
      : "Some inputs lie outside the design points the identity checks run on; the equations are the same there, but that they are coded correctly at these values has not been checked.",
  };
}

export function describeExcursion(x) {
  if (x.detail) return `${x.label}: ${x.detail}.`;
  const f = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : +v.toPrecision(3));
  const ext = x.extentPct == null ? "" : ` (${Math.abs(x.extentPct).toFixed(0)}% ${x.side} the ${x.side === "below" ? "lowest" : "highest"})`;
  return `${x.label} ${f(x.value)}${x.unit ? " " + x.unit : ""} is ${x.side} the ${x.domain === "validation" ? "validated" : "verified"} range ${f(x.min)}–${f(x.max)}${x.unit ? " " + x.unit : ""}${ext}.`;
}
