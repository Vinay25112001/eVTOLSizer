/* =====================================================================
   TEST FLIGHT — which mission phase each design check belongs to
   =====================================================================
   The sizing's checks (SR.checks: { label, ok, kind, val }) are verdicts
   on the converged design. None of them carries a time. The test flight
   stops at the phase a failing check belongs to, so each check needs a
   phase, and that assignment is made here, in one table, where it can be
   read and gated.

   THE RULE. A check belongs to the phase its own label names: "Hover…"
   to vertical take-off, "Climb…" to the climb, "Cruise…" to the cruise,
   "Descent…" to the descent, "…mission end" to the landing. A few labels
   name no phase but their check is plainly about one flight condition;
   each of those carries its reason, taken from what the check itself
   evaluates. Everything else is a property of the design as a whole
   (its mass, structure, layout, proportions) and is listed BEFORE the
   flight rather than pinned to a moment it does not belong to.

   Hover is flown twice, at take-off and at landing. A hover check stops
   the flight at TAKE-OFF, the first time the condition is met.

   Nothing here computes anything. It reads `ok` and `kind` and sorts.
   ===================================================================== */

export const PREFLIGHT = "Pre";

/* [pattern on the label, phase, why — null when the label names the phase] */
export const CHECK_PHASE = Object.freeze([
  [/^Hover\b/i, "TO", null],
  [/^Climb\b/i, "Climb", null],
  [/^Cruise\b/i, "Cruise", null],
  [/^Descent\b/i, "Desc", null],
  [/mission end/i, "Land", null],
  [/^Residual SoC\b/i, "Land", "it is the charge left when the mission ends"],
  /* Each reason below was read off the check's own computation in
     engine.js, not inferred from its name. Tip Mach is deliberately NOT
     here: it divides the hover tip speed by the speed of sound at CRUISE
     altitude (engine.js, TipMach), so it belongs to no single phase. */
  [/^Disk loading\b/i, "TO", "it is the hover-equilibrium disk loading"],
  [/^Blade loading CT\/σ/i, "TO", "it is evaluated at the hover-equilibrium disk loading"],
  [/^Controllable after a single rotor failure/i, "TO", "it asks whether the remaining rotors can hold attitude while carrying the weight in hover with one rotor out"],
  [/^Motor peak capability ≥ OEI transient/i, "TO", "its requirement is stated as a multiple of hover power"],
  [/^Strut clears reserve-energy drop/i, "Land", "it is a landing-gear drop test: a landing impact"],
  [/^Usable pack ≥ Mission E/i, "Land", "it compares the usable pack with the whole mission's energy, reserve included, so any shortfall shows by the end of the flight"],
  [/^Mach < /i, "Cruise", "the Mach number checked is the cruise speed's"],
]);

/* Checks on the design as a whole: listed before the flight. Named one
   by one, so that a check the engine gains later is caught by the gate
   as UNCLASSIFIED instead of falling here by default. */
export const DESIGN_LEVEL = Object.freeze([
  /^MTOW within certification limit/i, /^Mission matches the reference aircraft/i,
  /^Sizing loop (converged|stayed inside the design space)/i, /^SM /, /^Cell peak/i,
  /^Main tyre rated load/i, /^Wing tip deflection/i, /^Structural margin of safety/i,
  /^Weight-closure margin/i, /^Battery Frac/i, /^Rotor solidity within buildable bound/i,
  /^Boom mass/i, /^Cabin holds its occupants/i, /^V-tail (pitch|yaw) auth/i, /^Ruddervator trims/i,
  /^Tail\/Wing area/i, /^Fus\/Span proportion/i, /^AR vs LD compatible/i, /^Rotors: even/i,
  /^Rotors fit within the span/i, /^Fuselage pitch moment in NP/i,
  /^Rotor array (footprint|fits the landing pad)/i, /^Tip Mach/i,
  /^Usable pack ≥ 2-min engine-out hover/i, /^Turboshaft /i, /^Actual L\/D > 10/i,
]);

export function phaseOfCheck(label) {
  const s = String(label ?? "");
  for (const [re, ph, why] of CHECK_PHASE) if (re.test(s)) return { phase: ph, why, unclassified: false };
  return { phase: PREFLIGHT, why: null, unclassified: !DESIGN_LEVEL.some((re) => re.test(s)) };
}

/* Severity of a check that is not ok. Hard fails flag red, advisories
   amber, and checks that could not be evaluated or describe something
   the model leaves out flag grey: they are not a failure of the design. */
export function severityOf(c) {
  const k = String(c?.kind ?? "");
  if (k.includes("omission")) return "grey";
  if (k.includes("indeterminate")) return "grey";
  if (k.includes("advisory")) return "amber";
  return "red";
}

/* The failing checks, sorted into the pre-flight list and the phase
   stops, each with its severity. Passing checks are dropped. */
export function flightFlags(SR) {
  const out = { [PREFLIGHT]: [], TO: [], Climb: [], Cruise: [], Desc: [], Land: [] };
  for (const c of SR?.checks ?? []) {
    if (!c || c.ok) continue;
    const { phase, why, unclassified } = phaseOfCheck(c.label);
    out[phase].push({ label: c.label, severity: severityOf(c), why, unclassified });
  }
  return out;
}
