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
                   subject, quoted with its real title. THREE rules qualify.
     "tool"        this project's own design rule. Useful, defensible, and NOT
                   a certification requirement. Seven rules, and the panel now
                   says so on every row.

   The split is counted by ruleBasisCounts() rather than written out, because
   the prose above said "two" and "nine" while the table held three and eight
   from the day SC-VTOL-02's MCTOM row was promoted to "regulation". The
   function existed for the panel "to state up front" and the panel never
   called it, so nothing anywhere printed the true split.

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
      /* ── WITHDRAWN: "Dive speed margin", V_D >= 1.25 V_C ──────────────
         IT COMPARED A QUANTITY TO ITSELF AND COULD NOT FAIL. engine.js
         computes `const VD = p.vCruise*1.25`, and the row evaluated
         `SR.VD / p.vCruise >= 1.25`. Measured across eight designs --
         cruise 40 to 110 m/s, four configurations, both categories, MTOW
         2 209 to 11 285 kg -- the ratio was 1.250000 every time.

         This is the defect validation/load-factor-source.mjs exists to
         refuse: "a constant against a constant: it could not fail, it did
         not change when the design changed". It survived that gate because
         that gate scans for numeric LITERALS bound to load-factor names,
         and this row is a ratio of a thing to itself rather than a literal.
         validation/reg-applicability.mjs now refuses the shape directly:
         every rule's value must MOVE across a design sweep.

         IT IS NOT RETUNED, BECAUSE IT CANNOT BE. The real constraint is
         MOC VTOL.2200(c) -- "VNE should not be greater than 0.9 times VD"
         and "VNO ... should be less than or equal to VH and VNE", giving
         VD >= 1.111 VNO. That is a different and looser relation against a
         speed this engine does not compute: there is no VNO, VNE or VH
         anywhere in it. Picking 1.25 and citing VTOL.2200(c) would be this
         tool choosing a number and wearing EASA's name on it, which is the
         thing regdb.js was rewritten to stop. Restoring the row honestly
         means giving the engine a VNO first. */
      {
        id: null, basis: "tool",
        name: "Hover thrust-to-weight", param: "twRatio",
        threshold: 1.0, unit: "", direction: "min",
        desc: "Positive hover climb gradient. Physics, not regulation.",
      },
    ],
  },
};

/* =====================================================================
   APPLICABILITY — WHICH AIRCRAFT THE DOCUMENT GOVERNS AT ALL
   =====================================================================
   THE DEFECT THIS EXISTS FOR. The panel scored every design against all
   eleven rules and rendered "MTOW <= 5700 kg" as an ordinary compliance
   row with a PASS/FAIL badge. So a design the engine produces from one
   slider move -- vCruise 110 m/s, which sizes to MTOW 11 284 kg -- was
   shown as:

       EASA SC-VTOL   [x 1 FAIL]
         VTOL.2215  Positive limit load factor  >= 2 g   3.795   PASS
         VTOL.2215  Negative limit load factor <= -0.5 g  -1.5   PASS
         ... nine of eleven rows PASS

   VTOL.2215 does not apply to an 11-tonne aircraft. A mass above the
   MCTOM is not a non-compliance; it means SC-VTOL-02 does not govern
   this aircraft and every other row in the table is void. The panel had
   no way to say that, so it said PASS.

   ── THE FIVE GATES, AND WHY ONLY SOME ARE CHECKABLE ──────────────────
   SC-VTOL-02 Issue 2 gates its own applicability in five places. This
   tool can decide three of them, bound one, and cannot see the last:

     VTOL.2000(a)  person-carrying VTOL, small category   ASSUMED
     VTOL.2000(c)  not pressurised                        STRUCTURAL
     VTOL.2000(d)  VNO <= 250 KCAS                        BOUNDED
     VTOL.2005(a)  <= 9 passenger seats                   NEEDS nSeats
     VTOL.2005(a)  MCTOM <= 5 700 kg                      COMPUTED

   VTOL.2000(d) is a ONE-SIDED test and is implemented as one. MOC
   VTOL.2200(c) defines VNO as "the maximum structural cruising speed",
   so VNO >= the design cruise speed always. A cruise speed above
   250 kt therefore puts VNO above 250 kt and the aircraft out of scope,
   decisively. A cruise speed below it decides NOTHING, because VNO is
   not modelled anywhere in this engine. The panel reports exactly that
   asymmetry rather than reading a pass into it.

   The speed is compared in EAS, not CAS. The paragraph says KCAS; this
   engine carries true airspeed at cruise density and no compressibility
   correction, so what is computed is equivalent airspeed. Below about
   250 kt the two differ by under one percent, which does not matter for
   a bound that only fires well above the line -- but it is a bound on
   the wrong quantity by a small margin, and saying so is cheaper than
   pretending the engine has a VNO.

   ── THE TWO REGIMES DISAGREE ABOUT WHO THEY COVER ────────────────────
   These limits are NOT the same number in different units, and a tool
   that rounds one to the other designs straight into the gap:

                    EASA SC-VTOL-02 Iss.2    FAA AC 21.17-4 App.A
       mass         <= 5 700 kg              <= 12 500 lb = 5 669.905 kg
       seats        <= 9                     <= 6
       pressurised  excluded, VTOL.2000(c)   permitted, conditional
       speed        VNO <= 250 KCAS          no limit
       propulsion   unrestricted             battery-electric propellers

   A 5 690 kg eight-seater is inside EASA scope and outside FAA scope on
   BOTH counts, in a 30.1 kg band. This is the same defect class that
   data/drone-regulatory.js was written to refuse -- "25 kg IS NOT 55 lb
   ... rounding one to the other designs straight into a 52 g band where
   an aircraft is legal in neither place" -- on the other half of this
   codebase, 30 kg instead of 52 g. So the FAA figure is derived from the
   pound here, never written as a rounded kilogramme.
   ===================================================================== */

/** Exact, by definition: the international avoirdupois pound. */
export const KG_PER_LB = 0.45359237;

/** FAA AC 21.17-4 appendix A, PL.2000(a): 12 500 lb, stated in pounds. */
export const FAA_MGW_LB = 12500;
export const FAA_MGW_KG = FAA_MGW_LB * KG_PER_LB;   // 5 669.904 625 kg

/** EASA SC-VTOL-02 Issue 2, VTOL.2005(a). Issue 1 used 3 175 kg. */
export const EASA_MCTOM_KG = 5700;
export const EASA_MAX_SEATS = 9;
export const FAA_MAX_SEATS = 6;

/** VTOL.2000(d). Knots; compared against EAS, see the note above. */
export const EASA_VNO_LIMIT_KT = 250;
const MS_PER_KT = 1852 / 3600;

/* A gate's verdict. "out" withdraws the whole document; "unknown" leaves
   the applicability test INCOMPLETE, which is not the same as passing. */
export const GATE = { IN: "in", OUT: "out", UNKNOWN: "unknown" };

/**
 * Decide whether SC-VTOL-02 Issue 2 governs this design at all.
 *
 * @param p   the parameter set (needs nSeats, vCruise, cruiseAlt)
 * @param sr  the sizing result (needs MTOW)
 * @param eas cruise equivalent airspeed in m/s, or null if not computable
 * TWO KINDS OF "NOT DECIDABLE", AND THEY MUST NOT BE CONFLATED. The seat
 * gate is undecided because nobody typed a number, and one keystroke
 * closes it. VTOL.2000(d) is undecided because this engine has no VNO at
 * all, and NOTHING the user types closes it. Reporting both as one
 * "incomplete" flag made the flag permanent and therefore meaningless —
 * a warning that is always on is not a warning. So `fixable` marks the
 * ones a user can close, and the panel asks for those and merely states
 * the others.
 *
 * @returns {{gates, applies, undecided, fixable, complete}}
 */
export function scVtolApplicability(p, sr, eas) {
  const seats = Number(p?.nSeats);
  const hasSeats = Number.isFinite(seats) && seats > 0;
  const mtow = Number(sr?.MTOW);
  const easKt = Number.isFinite(eas) ? eas / MS_PER_KT : null;

  const gates = [
    {
      para: "VTOL.2000(a)",
      name: "Person-carrying VTOL-capable aircraft, small category",
      state: GATE.IN,
      shown: "assumed",
      note: "This engine sizes nothing else. Not a measurement.",
    },
    {
      para: "VTOL.2000(c)",
      name: "Aircraft is not pressurised",
      state: GATE.IN,
      shown: "unpressurised",
      note: "Structural, not a check: the eVTOL weight model carries no "
          + "pressure term at all (engine/weights.js, the cabin is sized "
          + "with dP = 0). Pressurisation exists only in AIRCRAFT mode.",
    },
    (() => {
      /* ONE-SIDED. Above the line it decides; below it, it does not. */
      if (easKt === null) return {
        para: "VTOL.2000(d)", name: "VNO at most 250 KCAS",
        state: GATE.UNKNOWN, shown: "cruise speed unavailable",
        note: "No cruise speed to bound VNO with.",
      };
      const over = easKt > EASA_VNO_LIMIT_KT;
      return {
        para: "VTOL.2000(d)",
        name: "VNO at most 250 KCAS",
        state: over ? GATE.OUT : GATE.UNKNOWN,
        shown: easKt.toFixed(1) + " kt EAS at cruise",
        note: over
          ? "VNO is the maximum structural cruising speed (MOC VTOL.2200(c)), "
          + "so VNO >= this. Above 250 kt the aircraft is out of scope."
          : "Cruise is below the line, which decides NOTHING: VNO is not "
          + "modelled in this engine, and only VNO is what the paragraph "
          + "limits. Compared in EAS; the paragraph says KCAS.",
      };
    })(),
    {
      para: "VTOL.2005(a)",
      name: "Passenger seating configuration of 9 or fewer",
      state: !hasSeats ? GATE.UNKNOWN
           : seats <= EASA_MAX_SEATS ? GATE.IN : GATE.OUT,
      fixable: !hasSeats,      // one keystroke closes this one
      shown: hasSeats ? seats + " seats" : "not stated",
      note: hasSeats
        ? "Occupants including crew, as entered."
        : "Declare a seat count to complete the applicability test. It is "
        + "NOT inferred from payload: occupants and cargo are the same "
        + "kilogrammes to this engine, and a certification gate must not "
        + "rest on a guess about which is which.",
    },
    {
      para: "VTOL.2005(a)",
      name: "Maximum certificated take-off mass at most 5 700 kg",
      state: !Number.isFinite(mtow) ? GATE.UNKNOWN
           : mtow <= EASA_MCTOM_KG ? GATE.IN : GATE.OUT,
      shown: Number.isFinite(mtow) ? mtow.toFixed(1) + " kg" : "not sized",
      note: "Issue 2 raised this from Issue 1's 3 175 kg (7 000 lb). The "
          + "FAA's comparable gate is 12 500 lb = "
          + FAA_MGW_KG.toFixed(3) + " kg, which is a DIFFERENT limit.",
    },
  ];

  const undecided = gates.filter((g) => g.state === GATE.UNKNOWN);
  return {
    gates,
    applies:   !gates.some((g) => g.state === GATE.OUT),
    undecided,
    fixable:   undecided.filter((g) => g.fixable === true),
    /* True only if every gate is decided. With no VNO in the engine this
       is presently unreachable, and saying so is the point: the
       applicability test against SC-VTOL-02 cannot be completed by this
       tool as it stands. Give the engine a VNO and it becomes reachable. */
    complete:  undecided.length === 0,
  };
}

/**
 * The FAA's gate, for contrast only. Reported beside the EASA one so the
 * two limits are never silently treated as the same number.
 */
export function faaApplicability(p, sr) {
  const seats = Number(p?.nSeats);
  const mtow  = Number(sr?.MTOW);
  return [
    { para: "PL.2000(a)", name: "Maximum weight at most 12 500 lb",
      state: !Number.isFinite(mtow) ? GATE.UNKNOWN
           : mtow <= FAA_MGW_KG ? GATE.IN : GATE.OUT,
      shown: Number.isFinite(mtow) ? mtow.toFixed(1) + " kg" : "not sized",
      note: "12 500 lb = " + FAA_MGW_KG.toFixed(3) + " kg exactly." },
    { para: "PL.2000(a)", name: "Passenger seating of 6 or fewer",
      state: !(Number.isFinite(seats) && seats > 0) ? GATE.UNKNOWN
           : seats <= FAA_MAX_SEATS ? GATE.IN : GATE.OUT,
      shown: Number.isFinite(seats) && seats > 0 ? seats + " seats" : "not stated",
      note: "Three fewer than EASA allows." },
    { para: "AC 21.17-4 §5.2", name: "Battery-electric engine-driven propellers",
      state: GATE.IN, shown: "assumed",
      note: "This engine sizes battery-electric propulsion only." },
  ];
}

/* =====================================================================
   CATEGORY BASIC vs ENHANCED — VTOL.2005(b)
   =====================================================================
   The category is NOT cosmetic and it is NOT this panel's invention: it
   is already a sizing lever in this engine, and this panel was the only
   consumer ignoring it.

   VTOL.2005(b) requires certification in one or both categories, and
   makes Enhanced MANDATORY for operations over congested areas or for
   commercial air transport of passengers -- which is the mission this
   tool exists to size. The two are named in 21 places across the
   specification, from VTOL.2005 to VTOL.2510.

   Only what the engine ACTUALLY does with it is listed below. The rest
   of the category-conditioned text (durability VTOL.2240, bird strike
   VTOL.2250(f), lightning VTOL.2515, monitoring VTOL.2510(c)) is real
   and is NOT modelled here, so it is named as unmodelled rather than
   quietly dropped.
   ===================================================================== */
export const CATEGORY_EFFECTS = {
  modelled: [
    { para: "VTOL.2005(b)",
      what: "Avionics redundancy lanes: triplex for Enhanced, duplex for "
          + "Basic, worth about 2% of MTOW",
      where: "engine/avionics.js" },
    { para: "VTOL.2120(b)",
      what: "Climb requirement is taken one unit down for Enhanced rather "
          + "than all-operating",
      where: "engine/certification-climb.js" },
    { para: "MOC VTOL.2200(c)",
      what: "The VB gust case applies to Enhanced only",
      where: "engine/loadcases.js" },
  ],
  notModelled: [
    { para: "VTOL.2240", what: "Durability: in-service monitoring provisions" },
    { para: "VTOL.2250(f)", what: "Bird strike, which also turns on a seat count of 7 or more" },
    { para: "VTOL.2510(c)", what: "In-service monitoring of hazardous-failure systems" },
    { para: "VTOL.2515", what: "Lightning protection of flight-critical functions" },
  ],
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
