/* =====================================================================
   WHICH TABS A CONFIGURATION ACTUALLY HAS
   =====================================================================
   THE DEFECT THIS CLOSES IS NOT COSMETIC. Selecting the multicopter left
   every tab on screen, and the wing- and tail-dependent ones do not merely
   become irrelevant — they show NOTHING, or worse, NaN:

       multicopter:  Swing 0      bWing 0     Vstall 0    VA 0
                     Svt_total NaN   Sh_eff NaN   Sv_eff NaN
                     SM NaN          MAC NaN

   A tool that prints NaN where a number belongs has told the user
   something false. Hiding the tab is the honest behaviour, and it is also
   what a reader expects: an aircraft with no wing has no wing loading, and
   an aircraft with no tail has no tail volume.

   THE RULE IS DRIVEN BY CAPABILITIES, NOT BY A LIST OF LAYOUT NAMES.
   configuration.js already publishes `hasWing`, `nTail`, `tailType` and
   `hasFixedWingControls` per layout, so a new configuration gets the right
   tabs without this file being edited. A hard-coded list of which layouts
   are wingless would be a second place for that fact to live, and this
   codebase has been bitten repeatedly by one quantity being derived twice.

   WHAT IS DELIBERATELY *NOT* HIDDEN, because it still has content:
     Stability      a rotor-borne aircraft has no static margin, but it has
                    hover attitude dynamics (hoverqualities.js) and those
                    are real outputs. The tab stays and reports what applies.
     Constraint     disk loading and power loading are meaningful with or
                    without a wing.
     Certification, Noise, Cost, Battery, Mission, Propulsion — none of
                    these depend on a lifting surface.
   ===================================================================== */

/* Tab indices, from src/lib/tabs.js. Named so a reordering of TABS is a
   one-line change here rather than a hunt for magic numbers. */
export const TAB = {
  OVERVIEW: 0, MISSION: 1, WING_AERO: 2, PROPULSION: 3, BATTERY: 4,
  PERFORMANCE: 5, STABILITY: 6, TAIL: 7, CONVERGENCE: 8, MONTE_CARLO: 9,
  CERTIFICATION: 10, NOISE: 11, COST: 12, MISSION_BUILDER: 13, WEATHER: 14,
  OPENVSP: 15, REFERENCE: 16, ARCHIVE: 17, VN_DIAGRAM: 18, DESIGN_SPACE: 19,
  BEM_ROTOR: 20, REG_TRACKER: 21, DESIGN_NAV: 22, WB_ENVELOPE: 23,
  COMPONENTS: 24, CONSTRAINT: 25, COMPARE: 26, UNCERTAINTY: 27, VSP_MODELS: 28,
};

/**
 * Tabs a configuration cannot meaningfully show, with the reason.
 * @param cap capabilitiesFor(configType, nRotors)
 * @returns Map<tabIndex, reason>
 */
export function hiddenTabs(cap = {}) {
  const out = new Map();
  const hasWing = cap.hasWing !== false;
  const nTail = Number(cap.nTail ?? 0);

  if (!hasWing) {
    out.set(TAB.WING_AERO,
      "this layout is rotor-borne — it has no wing, so wing area, span, "
      + "aspect ratio and wing loading are all zero");
    out.set(TAB.VN_DIAGRAM,
      "a V-n envelope is bounded by the wing's stall boundary; with no wing "
      + "the stall speed and manoeuvre speed are zero and the diagram is "
      + "degenerate");
  }
  if (nTail <= 0) {
    out.set(TAB.TAIL,
      "this layout carries no tail surface, so tail volume, tail area and "
      + "static margin are undefined");
  }
  return out;
}

/**
 * The tail tab's label, which is not fixed: this tool builds a V-tail on
 * most layouts and RAVEN's fin + all-moving stabilator on the hybrid, and
 * calling the second one "V-Tail" would be simply wrong.
 */
export function tailTabLabel(cap = {}) {
  if (Number(cap.nTail ?? 0) <= 0) return "Tail";
  return cap.tailType === "conventional" ? "Fin & Stabilator" : "V-Tail";
}

/** Convenience: is a given tab index visible for these capabilities? */
export function tabVisible(idx, cap = {}) {
  return !hiddenTabs(cap).has(idx);
}
