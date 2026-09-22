/* =====================================================================
   REGULATORY COMPLIANCE — which requirements this design meets, live
   =====================================================================
   Every row carries its FAA paragraph, the CS-25 paragraph beside it, the
   verbatim requirement, the quantity it constrains, and a signed margin in
   the requirement's own units. Sourced from the research note
   eVTOL_Sizing_Research/classes/cross-class/REGULATORY-MATRIX.md, which
   holds 60 checkable rows; this module implements the subset the tool can
   feed today from quantities it already computes, and every other row is
   reported NOT EVALUATED rather than silently omitted.

   THREE STATES, NOT TWO. NASA/SP-2016-6105 Rev 2 asks for the verification
   method and product form to be stated, and for status to distinguish
   "not yet verified" from "failed". A requirement this tool cannot
   evaluate is NOT a pass. The panel therefore reports PASS, FAIL and
   NOT EVALUATED, and the third is the honest answer for most of Part 25.

   THE VERIFICATION METHOD IS ALWAYS "ANALYSIS", and the product form is a
   concept description, never a certified article. Nothing here is
   compliance. A green row means a conceptual sizing model, carrying the
   error this tool measures on real aircraft, puts the quantity on the
   right side of a number. An actual finding of compliance needs flight
   test, a type certificate and an authority.

   AMENDMENT LEVELS, because a regulation without one is a rumour:
     14 CFR Part 25 — current eCFR text as fetched 2026-09-17
     CS-25 — Amendment 28, 15 December 2023
   Where the two differ numerically the row says so. The largest divergence
   found is NOT implemented here because the tool has no pressure-vessel
   model: 14 CFR 25.365(d) requires a 1.67 factor above 45,000 ft where
   CS-25 Amdt 28 says 1.33 flat, so a FL510 business jet carries a 25 %
   higher pressure-vessel design load under the FAA. That is recorded in
   the research note and listed NOT EVALUATED below.
   ===================================================================== */

const G = 9.80665, FT = 0.3048, KG = 0.45359237;

/* Gradients that vary with engine count. 14 CFR 25.121 and CS 25.121 carry
   identical numbers; CS writes them with a middle dot and metres first. */
const GRAD = {
  second:  { 2: 0.024, 3: 0.027, 4: 0.030 },   // 25.121(b)(1)
  missed:  { 2: 0.021, 3: 0.024, 4: 0.027 },   // 25.121(d)(1)
  final:   { 2: 0.012, 3: 0.015, 4: 0.017 },   // 25.121(c)(1)
  first:   { 2: 0.0,   3: 0.003, 4: 0.005 },   // 25.121(a)
  netDrop: { 2: 0.011, 3: 0.014, 4: 0.016 },   // 25.123(b)
};

const PASS = "PASS", FAIL = "FAIL", NE = "NOT EVALUATED";

/* ICAO Annex 14, Volume I, Table 1-1 — the aerodrome reference code.
   Element 1 is the aeroplane reference field length, element 2 the
   wingspan. NOTE: the outer-main-gear-wheel-span column was REMOVED from
   this table by Amendment 14, applicable 8 November 2018, and re-deployed
   as an independent parameter; any code that maps a code letter to a gear
   span implements a pre-2018 standard. */
const CODE_NUMBER = [
  { n: 1, lo: 0, hi: 800, label: "less than 800 m" },
  { n: 2, lo: 800, hi: 1200, label: "800 m up to but not including 1 200 m" },
  { n: 3, lo: 1200, hi: 1800, label: "1 200 m up to but not including 1 800 m" },
  { n: 4, lo: 1800, hi: Infinity, label: "1 800 m and over" },
];
const CODE_LETTER = [
  { c: "A", lo: 0, hi: 15 }, { c: "B", lo: 15, hi: 24 }, { c: "C", lo: 24, hi: 36 },
  { c: "D", lo: 36, hi: 52 }, { c: "E", lo: 52, hi: 65 }, { c: "F", lo: 65, hi: 80 },
];

export function aerodromeCode(result) {
  const arfl = result.raw?.inputs?.takeoffFieldLengthM;
  const span = result.spanM;
  if (!(arfl > 0 && span > 0)) return null;
  const num = CODE_NUMBER.find((r) => arfl >= r.lo && arfl < r.hi);
  const let_ = CODE_LETTER.find((r) => span >= r.lo && span < r.hi);
  return {
    code: `${num.n}${let_ ? let_.c : "—"}`,
    number: num, letter: let_ ?? null,
    arflM: arfl, spanM: span,
    beyondF: !let_ && span >= 80,
    source: "ICAO Annex 14 Vol. I, Table 1-1. The reference field length is the balanced field length at "
          + "maximum certificated take-off mass, sea level, standard atmosphere, still air and zero runway "
          + "slope — which is exactly what this tool's take-off field length is.",
  };
}

/* One row of the matrix. `margin` is signed and in the requirement's own
   units: positive is compliant, and the sign convention is uniform. */
const row = (o) => ({ verdict: NE, method: "Analysis", productForm: "concept description", ...o });

export function complianceMatrix(type, result) {
  const p = result.raw?.inputs ?? {};
  const c = result.raw?.constraints ?? {};
  const nE = Math.min(4, Math.max(2, result.propulsion?.engines ?? p.numEngines ?? 2));
  const partEquals = type === "trainer" ? "23" : "25";
  const rows = [];

  /* ── climb gradients ────────────────────────────────────────────────
     The matching chart states each climb requirement as a thrust-to-weight
     line of the form (Scholz 5.14, after 14 CFR 25.121):
         T/W_required = nE/(nE-1) * (1/E + gamma)
     so a unit of thrust-to-weight in hand buys (nE-1)/nE of gradient, NOT a
     unit of it. Writing gamma = gamma_req + (T/W_design - T/W_req) omits
     that factor and overstates a twin's second segment by two.

     The thrust basis is the same one the matching chart uses - sea-level
     STATIC thrust - so these gradients are optimistic in exactly the way
     the tool's own limitations text already says: the climb requirements
     use static thrust rather than thrust at V2, worth about 9 % on the
     second-segment line, and the surplus over the requirement here is
     larger still because the take-off field length, not the climb, is what
     sized the engine. Read the margin as "comfortably clear", not as a
     certifiable gradient. */
  const twDesign = result.propulsion?.toWeight;
  const climb = (id, faa, cs, key, req, text, note) => {
    const twReq = c[key];
    if (!(Number.isFinite(twReq) && Number.isFinite(twDesign))) {
      return rows.push(row({ id, faa, cs, title: text, quantity: "climb gradient",
        detail: "The matching chart does not report this requirement for this class.", note }));
    }
    const achieved = req + (twDesign - twReq) * ((nE - 1) / nE);
    rows.push(row({
      id, faa, cs, title: text, quantity: "climb gradient",
      required: req, achieved, margin: achieved - req,
      units: "gradient", format: (v) => `${(v * 100).toFixed(2)} %`,
      verdict: achieved >= req - 1e-9 ? PASS : FAIL, note,
    }));
  };

  if (type !== "trainer") {
    climb("B-15", "25.121(b)(1)", "CS 25.121(b)(1)", "twSecond", GRAD.second[nE],
      `Second-segment climb, one engine inoperative, gear up, at V2`,
      "Identical numbers in CS-25 Amdt 28. For a twin this is usually the most binding thrust requirement "
      + "after the take-off field length. The gradient uses the matching chart's static-thrust basis and is "
      + "therefore optimistic; treat a large margin as 'clear', not as a certifiable number.");
    climb("B-17", "25.121(d)(1)", "CS 25.121(d)(1)", "twMissed", GRAD.missed[nE],
      "Approach (missed-approach) climb, one engine inoperative, at maximum landing mass",
      "DEVIATION: the rule requires this with the landing gear RETRACTED and at maximum landing mass. "
      + "This tool's missed-approach line is computed with a gear-down drag increment, which is "
      + "conservative by roughly 6 % of gradient — so a PASS here is real, but a marginal FAIL may not be.");
  }

  /* ── weights: 25.25(a), three simultaneous checks the tool can do ──── */
  const oew = result.oewKg, payload = result.payloadKg, fuel = result.fuelKg, mtow = result.mtowKg;
  const mzfw = result.mzfwKg, mlw = result.mlwKg;
  const trip = result.raw?.fuel?.mission?.trip;
  const tripKg = Number.isFinite(trip) ? (trip / G) : null;

  if (Number.isFinite(mzfw) && mzfw > 0) {
    rows.push(row({
      id: "W-1a", faa: "25.25(a)", cs: "CS 25.25(a)",
      title: "Operating empty mass plus payload must not exceed the maximum zero-fuel mass",
      quantity: "mass", required: mzfw, achieved: oew + payload, margin: mzfw - (oew + payload),
      units: "kg", format: (v) => `${Math.round(v).toLocaleString("en-US")} kg`,
      verdict: oew + payload <= mzfw + 1e-6 ? PASS : FAIL,
      note: "CS 25.25(a)(3) says generically \"the noise certification requirements\" where the FAA names Part 36.",
    }));
  }
  if (Number.isFinite(mlw) && mlw > 0 && tripKg !== null) {
    const landing = mtow - tripKg;
    rows.push(row({
      id: "W-1c", faa: "25.25(a)", cs: "CS 25.25(a)",
      title: "Landing mass at the destination must not exceed the maximum landing mass",
      quantity: "mass", required: mlw, achieved: landing, margin: mlw - landing,
      units: "kg", format: (v) => `${Math.round(v).toLocaleString("en-US")} kg`,
      verdict: landing <= mlw + 1e-6 ? PASS : FAIL,
      note: "Take-off mass less the trip fuel. Reserves are still aboard at landing and are not deducted.",
    }));
  }

  /* ── 25.1001(a): is a fuel jettison system REQUIRED? ─────────────────
     A real mass and systems penalty, decided by two climb gradients
     evaluated at MTOW less fifteen minutes of fuel. The tool has the climb
     lines but not a 15-minute fuel burn at that condition, so this is
     reported as the conditional it is rather than guessed. */
  rows.push(row({
    id: "W-2", faa: "25.1001(a)", cs: "CS 25.1001(a)",
    title: "Whether a fuel jettisoning system is required",
    quantity: "system requirement",
    detail: "Required unless the landing climb of 25.119 and the approach climb of 25.121(d) are both met at "
          + "maximum take-off mass less the fuel for a fifteen-minute flight. This tool evaluates those two "
          + "gradients at maximum LANDING mass, not at that condition, so the test is not performed. If it "
          + "fails, a jettison system and its mass must be carried.",
    note: "One of the highest-value rows in the matrix: it turns a climb margin into a mass penalty.",
  }));

  /* ── rows the tool cannot feed, listed rather than omitted ─────────── */
  const notEvaluated = [
    ["B-14", "25.121(a)", "First-segment climb, gear down, at V_LOF",
      "No gear-down first-segment climb model."],
    ["B-16", "25.121(c)(1)", "Final-segment climb at V_FTO on maximum continuous thrust",
      "No maximum-continuous-thrust rating is modelled; the deck carries maximum thrust only."],
    ["B-18", "25.119", "Landing (balked-landing) climb, all engines, 3.2 %",
      "No all-engines climb model at maximum landing mass with eight-second spool-up thrust."],
    ["B-20", "25.123(b)", "One-engine-inoperative NET flight path, gross gradient less "
      + `${(GRAD.netDrop[nE] * 100).toFixed(1)} %`,
      "The initial-cruise-altitude module runs all-engines; an OEI drift-down path is not computed."],
    ["S-1", "25.365(d)", "Fuselage pressure-vessel design factor",
      "No pressure-vessel model. NOTE the divergence: 14 CFR requires 1.67 above 45,000 ft; CS-25 "
      + "Amendment 28 says 1.33 with no altitude threshold, so a FL510 aircraft carries a 25 % higher "
      + "design load under the FAA."],
    ["W-3", "25.807(g)", "Maximum passenger seats permitted by the exit complement",
      "No cabin layout: exits are not modelled. This row becomes checkable once the cabin module lands, "
      + "and the rule reproduced A320 and A321 certified capacity exactly, six cases out of six."],
    ["V-1", "25.149", "Minimum control speed, ground (V_MCG)",
      "No control-power model, so the balanced field length has no lower bound from V_MCG and four "
      + "separate speed branches of 25.107 and 25.125 cannot be evaluated."],
  ];
  for (const [id, faa, title, detail] of notEvaluated) {
    rows.push(row({ id, faa, cs: `CS ${faa.replace(/^25\./, "25.")}`, title, quantity: "—", detail }));
  }

  const counts = { pass: 0, fail: 0, notEvaluated: 0 };
  for (const r of rows) {
    if (r.verdict === PASS) counts.pass++;
    else if (r.verdict === FAIL) counts.fail++;
    else counts.notEvaluated++;
  }

  return {
    part: partEquals, rows, counts, code: aerodromeCode(result),
    amendments: { faa: "14 CFR Part 25, current eCFR text, fetched 2026-09-17",
                  easa: "CS-25 Amendment 28, 15 December 2023" },
    disclaimer:
      "Verification method: Analysis. Product form: concept description. None of this is a finding of "
      + "compliance. A PASS means a conceptual sizing model — carrying the error this tool measures against "
      + "real aircraft — puts the quantity on the compliant side of a number. Showing compliance needs "
      + "flight test, a type certificate and an authority. NOT EVALUATED is not a pass, and most of Part 25 "
      + "sits there.",
  };
}

export { PASS, FAIL, NE };
