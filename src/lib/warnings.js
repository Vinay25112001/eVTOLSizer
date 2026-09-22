/* =====================================================================
   RESULT WARNINGS — NASA-STD-7009B §4.3.8, applied to every result
   =====================================================================
   [M&S 32] (4.3.8.1): "When reporting M&S results to decision makers,
   explicit warnings shall be included for the following occurrences,
   accompanied by at least a qualitative estimate of the impact":
     a. unachieved acceptance criteria        e. unfavourable appropriateness
     b. violation of assumptions              f. setup and utilisation issues
     c. violation of the M&S limits           g. waivers
     d. execution warnings and errors         h. outstanding defects
   [M&S 33] (4.3.8.2): an uncertainty estimate — quantitative, qualitative,
   "or c. A clear statement that no quantitative estimate or qualitative
   description of uncertainty is available."
   [M&S 34] (4.3.8.3): how that estimate was obtained.

   Every item below is built from something the engine or a harness already
   measured. Nothing here invents a threshold: where the tool has no
   evidence, the text says so.
   ===================================================================== */

import { OUTPUTS } from "./provenance.js";
import { assessDomain, describeExcursion, DOMAIN } from "./domain.js";

const LAYOUT_LABEL = {
  liftcruise: "lift+cruise", hybrid: "tilt+lift hybrid", hybridPusher: "hybrid with pusher",
  tiltrotor: "tiltrotor", multicopter: "multicopter", sideBySide: "side-by-side",
};

export const CATEGORIES = [
  ["a", "Acceptance criteria not met"],
  ["b", "Model assumptions or omissions that affect this design"],
  ["c", "Outside the domain the tool has been checked in"],
  ["d", "Execution warnings and errors"],
  ["e", "Appropriateness for the intended use"],
  ["f", "Setup and use issues"],
  ["g", "Waivers"],
  ["h", "Outstanding known defects"],
];

const pct = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;

/* params: UI state; R: engine result or null; continuity: a design-file
   continuity check (lib/designfile.js) for the design last opened, or null. */
export function resultWarnings({ params, R, continuity = null }) {
  const items = [];
  const add = (cat, severity, text, impact) => items.push({ cat, severity, text, impact });
  const layout = params?.configType ?? "liftcruise";

  /* d first: without a result nothing else can be said. */
  if (!R) {
    add("d", "error", "The sizing engine did not return a result for these inputs.",
        "No output can be used.");
  } else {
    if (R.r2Diverged) add("d", "error",
      `The sizing loop did not converge${R.mtowCeilingHit ? " (take-off mass hit the ceiling guard)" : ""}.`,
      "Every mass, energy and power shown is the last iterate, not a solution. Do not use them.");
    for (const [stage, msg] of Object.entries(R._stageErrors || {})) add("d", "error",
      `Analysis stage "${stage}" failed: ${msg}.`, "Outputs of that stage are missing; the converged design is unaffected.");
    if (Number.isFinite(R.massBalanceGapKg) && Math.abs(R.massBalanceGapKg) > 0.5) add("d", "warning",
      `The mass statement does not close by ${R.massBalanceGapKg.toFixed(1)} kg.`,
      "The weight breakdown and the take-off mass disagree by that amount.");
    if (R.weightBuildupUsed === false && (R.weightBuildupFallbacks ?? 0) > 0) add("d", "warning",
      `The component weight build-up fell back to the empty-weight fraction on ${R.weightBuildupFallbacks} iteration(s).`,
      "Empty weight is not a component build-up for this design.");

    for (const c of R.checks || []) {
      if (c.ok) continue;
      if (!c.kind) add("a", "error", `${c.label}: ${c.val ?? "not met"}`,
        "The design fails this criterion as the tool evaluates it.");
      else if (c.kind === "advisory") add("a", "warning", `${c.label} (advisory): ${c.val ?? "not met"}`,
        "An advisory criterion from the literature; the design may still be acceptable, but the shortfall is real.");
      else add("b", "warning", `${c.label}: ${c.val ?? "not modelled"}`,
        c.kind === "omission" ? "The model leaves this effect out for this design; results are biased in the direction stated."
                              : "The tool cannot determine this for this design.");
    }
  }

  /* c: domains */
  const dom = assessDomain(params, R);
  for (const x of dom.excursions) {
    add("c", x.domain === "validation" ? "warning" : "info", describeExcursion(x),
        x.domain === "validation" ? dom.consequence : dom.verificationConsequence);
  }

  /* e: standing */
  add("e", "info",
    "This is a conceptual sizing tool (NPR 7150.2D Class E). Whether it is appropriate for a particular decision has not been assessed.",
    "Do not use its results to make decisions about an aircraft that will be built without further analysis.");

  /* f: setup */
  if (continuity) {
    if (continuity.hashOK === false) add("f", "error",
      "The opened design file's inputs do not match its checksum.",
      "The file was edited or damaged after saving; the inputs may not be what was saved.");
    if (continuity.legacy) add("f", "warning",
      `The opened design predates full design records; ${continuity.missingInputs?.length ?? 0} input(s) were taken from today's defaults.`,
      "The design may not be the one originally saved.");
    if (continuity.status === "changed") add("f", "warning",
      `Today's engine gives a different result for the opened design (${continuity.moved?.length ?? 0} output(s) moved).`,
      "Results saved with the design are not reproduced by this version.");
  }

  /* g: waivers */
  add("g", "info", "No NASA-STD-7009B requirement is waived. Several are not met; VALIDATION.md lists them.", "None.");

  /* h: measured shortfalls on this layout */
  const pt = params?.powertrain === "turboelectric" ? "turboelectric" : "battery";
  const same = (DOMAIN.validation.cases || []).filter(c => c.configType === layout && (c.powertrain ?? "battery") === pt && c.errorPct?.MTOW != null);
  for (const c of same) {
    const e = c.errorPct.MTOW;
    if (Math.abs(e) <= 5) continue;
    const extra = ["empty", "struct"].filter(k => c.errorPct[k] != null)
      .map(k => `${k === "struct" ? "structure" : "empty mass"} ${pct(c.errorPct[k])}`).join(", ");
    add("h", "warning",
      `On ${c.name} the tool's take-off mass is ${pct(e)} against the published value${extra ? ` (${extra})` : ""}.`,
      `A measured, unresolved error on this layout: expect ${e < 0 ? "under" : "over"}-prediction of similar size.`);
  }
  add("h", "info",
    "No independent review of the method or code has been done (VALIDATION.md §9).",
    "Errors shared by the model and its author would not be caught by any check in the tool.");

  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of items) counts[i.severity]++;
  return { items, counts, domain: dom };
}

/* One line for the take-off-mass card: the measured error for this
   powertrain, from the generated domain data rather than a typed number. */
export function mtowErrorSummary(params) {
  const pt = params?.powertrain === "turboelectric" ? "turboelectric" : "battery";
  const all = (DOMAIN.validation.cases || []).filter(c => (c.powertrain ?? "battery") === pt && c.errorPct?.MTOW != null);
  if (!all.length) return "no measured error for this powertrain";
  if (all.length === 1) return `${pct(all[0].errorPct.MTOW)} on the one published ${pt} aircraft`;
  const mae = all.reduce((s, c) => s + Math.abs(c.errorPct.MTOW), 0) / all.length;
  return `±${mae.toFixed(1)}% mean error over ${all.length} published aircraft`;
}

/* [M&S 33] and [M&S 34], per output. */
export function uncertaintyStatement(key, { params = null } = {}) {
  const status = OUTPUTS[key]?.status ?? null;
  if (key === "MTOW") {
    const layout = params?.configType ?? "liftcruise";
    const pt = params?.powertrain === "turboelectric" ? "turboelectric" : "battery";
    const all = (DOMAIN.validation.cases || []).filter(c => (c.powertrain ?? "battery") === pt && c.errorPct?.MTOW != null);
    const same = all.filter(c => c.configType === layout);
    const mean = (xs) => xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length;
    return {
      kind: "quantitative",
      text: `Measured against ${all.length} published ${pt === "turboelectric" ? "turboelectric " : ""}aircraft: mean absolute take-off-mass error ${mean(all.map(c => c.errorPct.MTOW)).toFixed(1)}%`
        + (same.length ? `; ${same.length} of them ${LAYOUT_LABEL[layout] ?? layout}: ${same.map(c => pct(c.errorPct.MTOW)).join(", ")}.`
                       : `; none of them is a ${LAYOUT_LABEL[layout] ?? layout}, so no layout-specific figure exists.`),
      method: "Comparison with published take-off mass (validation/nasa-configs.mjs, validation/validate.mjs). "
        + "It applies inside the validation envelope only. The Uncertainty tab computes a separate input-driven band by one-at-a-time perturbation.",
    };
  }
  switch (status) {
    case "validated": return { kind: "quantitative",
      text: "Compared numerically with published aircraft; the recorded error in VALIDATION.md is the estimate.",
      method: "Comparison with published data in the validation harnesses; inside the validation envelope only." };
    case "sourced": return { kind: "none",
      text: "Follows a published method or value, but has not been compared with an aircraft. No quantitative estimate of its uncertainty is available.",
      method: "None performed." };
    case "calibrated": return { kind: "none",
      text: "Fitted to data with no independent check. No quantitative estimate of its uncertainty is available.",
      method: "None performed." };
    case "derived": return { kind: "none",
      text: "Computed from other results and inherits their uncertainty. No separate estimate is available.",
      method: "None performed." };
    case "unverified": return { kind: "none",
      text: "Rests on an assumption. No estimate of its uncertainty is available.",
      method: "None performed." };
    default: return { kind: "none",
      text: "This output is not classified. No estimate of its uncertainty is available.",
      method: "None performed." };
  }
}
