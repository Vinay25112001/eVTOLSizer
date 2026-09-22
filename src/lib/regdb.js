/* =====================================================================
   REGULATORY TRACKER — WHAT IS A RULE, AND WHAT IS OURS
   =====================================================================
   THIS FILE USED TO BE A TABLE OF INVENTED REGULATIONS. Eleven engineering
   thresholds, each wearing a certification paragraph number, rendered in a
   panel with PASS/FAIL badges as though an authority had demanded them.
   Checked line by line against SC-VTOL-02 Issue 2, every one of the seven
   EASA entries was wrong:

     claimed para  claimed subject      what that paragraph actually is
       2280        OEI thrust margin    DOES NOT EXIST — the 22xx series runs
                                        2260, 2265, 2270, then jumps to 2500
       2315        positive load factor "Means of egress and emergency exits"
       2320        negative load factor "Occupant physical environment"
       2500        min battery reserve  "General requirements on systems and
                                         equipment function"
       2510        max tip Mach         "Equipment, systems, and installations"
       2540        static margin min    "(reserved)" — an EMPTY paragraph
       2541        static margin max    DOES NOT EXIST

   (Paragraph numbers above are written bare, without the VTOL. prefix, so that
   validation/citations.mjs does not read this post-mortem as a live citation
   and keep them on its unconfirmed queue for ever.)

   The specification numbers its paragraphs in multiples of five. 2241, 2280
   and 2541 are not in the scheme at all — the same signature as the invented
   reserve paragraph removed in commit 1c2562c, which validation/citations.mjs
   now bans by name.

   The FAA set fared no better: "MTOW Limit (Part 27) 5,700 kg" attributes an
   EASA figure to an American rule. 5 700 kg is SC-VTOL Issue 2's own MCTOM,
   which that document raised from 3,175 kg; Part 27 applicability is 7,000 lb.
   An advisory circular does not set battery mass fractions or hover thrust-to-
   weight ratios in any case.

   ── WHAT CHANGED ─────────────────────────────────────────────────────
   The THRESHOLDS are mostly sound engineering. What was false was the claim
   that somebody official requires them. So every rule now declares a `basis`:

     "regulation"  a paragraph verified to exist AND verified to be about this
                   subject, quoted with its real title. Two rules qualify.
     "tool"        this project's own design rule. Useful, defensible, and NOT
                   a certification requirement. Nine rules, and the panel now
                   says so on every row.

   A threshold labelled "our rule" is honest. The same threshold wearing a
   paragraph number that turns out to be about emergency exits is not, and it
   is worse than no citation at all, because a reader cannot tell the
   difference without the document in front of them.
   ===================================================================== */

export const REG_DB = {
  "EASA SC-VTOL": {
    lastChecked: "2026-09-15",
    source: "SC-VTOL-02 Issue 2 and MOC SC-VTOL Issues 1-4, read from the "
          + "project research corpus. validation/citations.mjs confirms every "
          + "paragraph number below against those documents on each run.",
    rules: [
      /* ── VERIFIED REGULATION ─────────────────────────────────────────── */
      {
        id: "VTOL.2215", basis: "regulation",
        title: "Flight load conditions",
        name: "Positive limit load factor", param: "n_pos_limit",
        threshold: 2.0, unit: "g", direction: "min",
        desc: "CERTIFIED MINIMUM, not a cap. MOC VTOL.2200(f): the positive "
            + "limit manoeuvring load factor is not less than 2.0. The 3.5 g "
            + "this tool draws its V-n envelope to is an APPLICANT PROPOSAL "
            + "with no source, and engine.js reports it as unsourced.",
      },
      {
        id: "VTOL.2215", basis: "regulation",
        title: "Flight load conditions",
        name: "Negative limit load factor", param: "n_neg_limit",
        threshold: -0.5, unit: "g", direction: "max",
        desc: "CERTIFIED MINIMUM. MOC VTOL.2200(f): not less than -0.5. The "
            + "-1.5 g drawn on the envelope is likewise an applicant proposal.",
      },
      /* ── OUR RULES, SAID PLAINLY ─────────────────────────────────────── */
      {
        id: null, basis: "tool",
        name: "OEI thrust margin", param: "OEI_margin_pct",
        threshold: 0, unit: "%", direction: "min",
        desc: "Remaining thrust at least hover weight with one rotor out. No "
            + "SC-VTOL paragraph states this as a number. The engine's real "
            + "one-rotor-out test is ACAI controllability (Du, Quan, Yang & "
            + "Cai) plus NDARC's drive-system torque limit, both sourced.",
      },
      {
        id: null, basis: "tool",
        name: "Residual state of charge", param: "socMin",
        threshold: 0.20, unit: "frac", direction: "min",
        desc: "Pack retains 20% at mission end. EASA requires a reserve and "
            + "states NO value — VTOL.2430(b)(4), and MOC SC-VTOL Issue 2 p.5 "
            + "speaks only of 'the sufficient reserve accepted for compliance'. "
            + "This number is ours.",
      },
      {
        id: null, basis: "tool",
        name: "Blade tip Mach", param: "TipMach",
        threshold: 0.70, unit: "Mach", direction: "max",
        desc: "Compressibility and noise limit. An aerodynamic design choice; "
            + "no certification paragraph sets it.",
      },
      {
        id: null, basis: "tool",
        name: "Static margin, lower", param: "SM_vt",
        threshold: 0.05, unit: "MAC", direction: "min",
        desc: "Longitudinal stability floor. Ours. The paragraph this was "
            + "previously cited to, VTOL.2540, is marked '(reserved)' in the "
            + "specification — it has no content at all.",
      },
      {
        id: null, basis: "tool",
        name: "Static margin, upper", param: "SM_vt",
        threshold: 0.25, unit: "MAC", direction: "max",
        desc: "Controllability ceiling. Ours.",
      },
    ],
  },

  "Category limits": {
    lastChecked: "2026-09-15",
    source: "SC-VTOL-02 Issue 2 for the mass limit; the remainder are this "
          + "tool's own feasibility rules and are labelled as such.",
    rules: [
      {
        id: "SC-VTOL-02", basis: "regulation",
        title: "Applicability (Issue 2)",
        name: "Maximum certificated take-off mass", param: "MTOW",
        threshold: 5700, unit: "kg", direction: "max",
        desc: "SC-VTOL Issue 2 raised MCTOM for the small category to 5 700 kg "
            + "with 9 or fewer passenger seats. PREVIOUSLY LABELLED 'Part 27' — "
            + "this is a European figure, and Part 27 applicability is 7,000 lb "
            + "(3,175 kg), which Issue 1 of this same Special Condition used.",
      },
      {
        id: null, basis: "tool",
        name: "Battery mass fraction", param: "batFrac",
        threshold: 55, unit: "%", direction: "max",
        desc: "Closure feasibility: past roughly this fraction the weight loop "
            + "has no root, which engine.js demonstrates rather than asserts. "
            + "A modelling limit, not a rule anyone published.",
      },
      {
        id: null, basis: "tool",
        name: "Dive speed margin", param: "VD_margin",
        threshold: 1.25, unit: "xVC", direction: "min",
        desc: "V_D at least 1.25 V_C. Conventional practice carried over from "
            + "fixed-wing sizing; no SC-VTOL paragraph verified for it.",
      },
      {
        id: null, basis: "tool",
        name: "Hover thrust-to-weight", param: "twRatio",
        threshold: 1.0, unit: "", direction: "min",
        desc: "Positive hover climb gradient. Physics, not regulation.",
      },
    ],
  },
};

/** how many rules are actually regulatory, for the panel to state up front */
export function ruleBasisCounts() {
  const all = Object.values(REG_DB).flatMap((g) => g.rules);
  return {
    total: all.length,
    regulation: all.filter((r) => r.basis === "regulation").length,
    tool: all.filter((r) => r.basis === "tool").length,
  };
}
