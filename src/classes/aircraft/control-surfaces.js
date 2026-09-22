/* =====================================================================
   CONTROL SURFACES — what can honestly be computed about them
   =====================================================================
   The tool had no ailerons, elevator, rudder or spoilers at all. The
   research that went looking for a way to SIZE them came back with a
   narrow answer, and this module is deliberately shaped to it:

     eVTOL_Sizing_Research/classes/cross-class/CONTROL-SURFACES.md §5 —
     "size the tail, check the aileron and rudder, size nothing else."

   SO THIS SIZES NOTHING. It computes the one closed-form regulatory
   quantity available, states the requirements the surfaces must meet with
   the numbers the FAA itself publishes, and is explicit about the much
   larger set it refuses to claim.

   WHAT IS COMPUTED, EXACTLY: the 25.415 ground-gust hinge moment.

       H = K · ½ ρ₀ V² · c · S        with V = 65 kt, 25.415(a)-(b)

   K comes from the table in 25.415(c) — 0.75 for an aileron with the
   column locked mid-position, ±0.50 at full throw, ±0.75 either way for
   the elevator, 0.75 for the rudder both neutral and at full throw. Then
   25.415(d) puts 1.25 on it for limit control-system loads and 25.415(e)
   adds 1.6 for dynamic effects absent a rational analysis. THE TWO
   COMPOUND: 1.25 × 1.6 = 2.0 on a 65-knot static hinge moment with the
   surface at full throw and the system locked. On a low wing loading that
   routinely beats the flight hinge moment, which is why the research calls
   it the case that most often sizes the actuator.

   That equation needs only an area, a mean chord and a table lookup — no
   aerodynamics and no charts. It is the only part of this subject that is
   chart-free, and it is the reason this module exists at all.

   WHAT IS STATED BUT NOT CHECKED: the roll requirements. The regulation
   text of 25.147(d) and 25.181 is qualitative, but the FAA publishes the
   numbers in its own flight test guide, so no military specification is
   needed and none is cited:

     - 25.149(h)(3), regulation: 20° of bank in not more than 5 seconds at
       V_MCL.
     - FAA AC 25-7D p. 5-22, for 25.147(d): from a steady 30° banked turn
       at V2 with the critical engine inoperative, roll to 30° the other
       way "in not more than 11 seconds".
     - FAA AC 25-7D p. 10-9, for 25.253(a)(4): near V_DF, 20° to 20° the
       other way, "using lateral control alone", "in not more than 8
       seconds".

   They are REPORTED, not evaluated, because a roll rate needs the aileron
   rolling effectiveness, and DATCOM §6.2.1.1 cannot be run without about
   a dozen undigitised scanned figures. Printing a time to bank from a
   fabricated effectiveness would be worse than printing nothing.

   WHAT IS REFUSED OUTRIGHT:
     - SPOILERS. 14 CFR 25.459 requires their loads to "be determined from
       test data". There is no analytical route and this does not invent
       one.
     - Aerodynamic balance. The correlation exists but its second factor is
       an undigitised chart, and the worked example in the source is too
       OCR-damaged to check against.
     - Flight hinge moments. DATCOM's own stated accuracy on both hinge
       moment derivatives is ±0.05 per radian, about ±17 % on C_h_α, and
       the method needs the same blocked charts.
     - Elevator sizing. NASA CR-186872, the only NASA-published conceptual
       module for this, takes elevator chord ratio and deflections as FIXED
       INPUTS and iterates the TAIL AREA instead. Control sizing feeds back
       into tail area, but never through the elevator.

   AND ONE HONEST WARNING ABOUT THE GEOMETRY. The hinge moment is exact
   given S and c. But this tool has no control-surface geometry — no
   transport publishes any. The research checked: the 737 ACAPS has zero
   occurrences of "aileron", "elevator", "rudder" or "spoiler" in 7,616
   lines; the A320 planning manual mentions them only as ground-clearance
   datum points; and the 737 and 747 type certificates refuse to state
   deflections at all, delegating to non-public Boeing rigging drawings.
   So S and c here come from CONVENTIONS measured on FOUR LIGHT SINGLES,
   none heavier than 3,800 lb and none a transport, with ±26 % scatter on
   the aileron area fraction. Every number downstream inherits that, and
   the result says so rather than letting an exact-looking equation imply
   an exact answer.
   ===================================================================== */

import { generalArrangement, val, macOf } from "./geometry.js";

const KT = 0.514444;
const RHO0 = 1.225;                                   // kg/m³, ISA sea level

/* 14 CFR 25.415. Every constant here is the regulation's own. */
export const GROUND_GUST = Object.freeze({
  speedKt: 65,                                        // 25.415(a)
  limitFactor: 1.25,                                  // 25.415(d)
  dynamicFactor: 1.6,                                 // 25.415(e), absent a rational analysis
  minRationalDynamicFactor: 1.2,                      // 25.415(e), the floor if one is done
  /* 25.415(c), verbatim in the note's §1. */
  cases: Object.freeze([
    { surface: "aileron",  k: 0.75, condition: "control column locked or lashed in mid-position" },
    { surface: "aileron",  k: 0.50, condition: "ailerons at full throw", signed: true },
    { surface: "elevator", k: 0.75, condition: "elevator full down", signed: true },
    { surface: "elevator", k: 0.75, condition: "elevator full up", signed: true },
    { surface: "rudder",   k: 0.75, condition: "rudder in neutral" },
    { surface: "rudder",   k: 0.75, condition: "rudder at full throw" },
  ]),
  source: "14 CFR 25.415(a)-(e): H = K·½ρ₀V²·c·S at 65 kt, ×1.25 for limit control-system loads, "
        + "×1.6 for dynamic effects unless a rational analysis substantiates a lower factor (never below 1.2)",
});

/* The roll requirements, with the FAA's own numbers. No military
   specification is cited, because none is needed. */
export const ROLL_REQUIREMENTS = Object.freeze([
  { id: "vmcl", bankDeg: 20, seconds: 5, oneWay: true,
    at: "V_MCL", cite: "14 CFR 25.149(h)(3)",
    text: "Roll 20° of bank in not more than 5 seconds at the minimum control speed in the landing configuration." },
  { id: "v2-oei", bankDeg: 30, seconds: 11, oneWay: false,
    at: "V2, critical engine inoperative", cite: "FAA AC 25-7D p. 5-22, for 25.147(d)",
    text: "From a steady 30° banked turn, roll to 30° of bank the other way in not more than 11 seconds. "
        + "The rudder may be used to the extent necessary to minimize sideslip." },
  { id: "vdf-upset", bankDeg: 20, seconds: 8, oneWay: false,
    at: "close to V_DF/M_DF", cite: "FAA AC 25-7D p. 10-9, for 25.253(a)(4)",
    text: "From a steady 20° banked turn, roll to 20° the other way in not more than 8 seconds, "
        + "using lateral control ALONE." },
]);

/* Geometry conventions. EVERY ONE is measured on light singles; see the
   header. The chord ratios and area fractions are kept separate because
   the hinge moment needs both and they are not the same quantity. */
export const SURFACE_CONVENTIONS = Object.freeze({
  elevator: {
    count: 1,
    chordRatio: 0.30, areaFraction: 0.33,
    areaRange: [0.286, 0.416], areaN: 3,
    chordSource: "NASA CR-186872 (Swanson 1990) carries CELV = 0.30 as a fixed input to its conceptual "
               + "horizontal-surface module, which it validates to 1.0-3.9 % on the F-16A, 727-200 and Viggen",
    areaSource: "elevator / total horizontal tail, 28.6-41.6 % measured on three light singles; "
              + "Scholz gives 25-40 % of chord, attributed to Torenbeek 1988 and Roskam II, neither obtainable",
  },
  rudder: {
    count: 1,
    chordRatio: 0.32, areaFraction: 0.38,
    areaRange: [0.297, 0.469], areaN: 3,
    chordSource: "no primary source obtained; taken as the elevator ratio, which the same light-single "
               + "measurements bracket",
    areaSource: "rudder / total vertical tail, 29.7-46.9 % measured on three light singles — this RUNS HIGH "
              + "against Scholz's 25-40 %, with two of the three above the band",
  },
  aileron: {
    /* The published fraction is for BOTH ailerons, because that is how the
       sources state it. A hinge moment is per surface — the measured data
       is itself given as "area of one aileron" — so `count` splits it. */
    count: 2,
    chordRatio: 0.26, areaFraction: 0.060,
    areaRange: [0.048, 0.079], areaN: 4, scatterPct: 26,
    chordSource: "24.4 % measured on the one aircraft that publishes a mean chord (NASA TN D-7149); "
               + "Howe gives 26 % third-hand",
    areaSource: "both ailerons / wing area, 4.8-7.9 % over four light singles, mean 6.0 %, scatter ±26 %",
  },
});

/* The one number this module computes exactly. */
export function groundGustHingeMoment({ k, areaM2, meanChordM }) {
  const v = GROUND_GUST.speedKt * KT;
  const staticH = k * 0.5 * RHO0 * v * v * meanChordM * areaM2;       // N·m
  return {
    staticNm: staticH,
    limitNm: staticH * GROUND_GUST.limitFactor,
    designNm: staticH * GROUND_GUST.limitFactor * GROUND_GUST.dynamicFactor,
  };
}

export function controlSurfaces(result, opts = {}) {
  const ga = generalArrangement(result);
  if (!ga) return null;
  const p = result.raw?.inputs ?? {};
  const conv = { ...SURFACE_CONVENTIONS, ...(opts.conventions ?? {}) };

  const wingMac = macOf({ area: ga.wing.area, span: ga.wing.span, taper: ga.wing.taper,
                          sweepC4Deg: ga.wing.sweepDeg }).mac;

  /* Each surface: area a fraction of its parent, mean chord aft of the
     hinge a fraction of its parent's mean chord. Both conventions. */
  const parents = [
    { id: "elevator", label: "Elevator", parent: "horizontal tail",
      parentAreaM2: ga.ht.area, parentMacM: ga.ht.mac, c: conv.elevator },
    { id: "rudder", label: "Rudder", parent: "vertical tail",
      parentAreaM2: ga.vt.area, parentMacM: ga.vt.mac, c: conv.rudder },
    { id: "aileron", label: "Aileron", parent: "wing",
      parentAreaM2: ga.wing.area, parentMacM: wingMac, c: conv.aileron },
  ];

  const surfaces = parents.map((s) => {
    const areaM2 = s.parentAreaM2 * s.c.areaFraction;      // all surfaces of this kind
    const count = s.c.count ?? 1;
    const areaPerSurfaceM2 = areaM2 / count;               // what one actuator drives
    const meanChordM = s.parentMacM * s.c.chordRatio;
    /* 25.415(b)'s S is "area of THE control surface aft of the hinge line",
       singular — and the hinge moment an actuator has to hold is the moment
       on the one surface it drives, not on the pair. */
    const cases = GROUND_GUST.cases
      .filter((g) => g.surface === s.id)
      .map((g) => ({ ...g, ...groundGustHingeMoment({ k: g.k, areaM2: areaPerSurfaceM2, meanChordM }) }));
    const worst = cases.reduce((a, c) => (c.designNm > a.designNm ? c : a));
    /* The area fraction's measured spread, carried through. H is linear in
       area, so the spread carries straight into the actuator load. */
    const loRange = s.c.areaRange ? s.c.areaRange[0] / s.c.areaFraction : null;
    const hiRange = s.c.areaRange ? s.c.areaRange[1] / s.c.areaFraction : null;
    return {
      id: s.id, label: s.label, parent: s.parent,
      parentAreaM2: s.parentAreaM2, parentMacM: s.parentMacM,
      areaM2, areaPerSurfaceM2, count, meanChordM,
      areaFraction: s.c.areaFraction, chordRatio: s.c.chordRatio,
      areaSource: s.c.areaSource, chordSource: s.c.chordSource,
      measuredRange: s.c.areaRange, measuredN: s.c.areaN,
      cases, worst,
      designNmLo: loRange === null ? null : worst.designNm * loRange,
      designNmHi: hiRange === null ? null : worst.designNm * hiRange,
    };
  });

  return {
    type: result.type,
    speedKt: GROUND_GUST.speedKt,
    compounding: GROUND_GUST.limitFactor * GROUND_GUST.dynamicFactor,
    surfaces,
    rollRequirements: ROLL_REQUIREMENTS,
    rollEvaluated: false,
    rollWhy: "A time to bank needs the aileron rolling effectiveness, and DATCOM §6.2.1.1 cannot be run "
           + "without about a dozen undigitised scanned figures. The requirements are stated so the numbers "
           + "are in front of you; they are NOT evaluated, and a figure produced from a fabricated "
           + "effectiveness would be worse than none.",
    /* 25.427(b) and 25.445(b): the asymmetric case, stated because it sizes
       the attachment even though this module computes no flight load. */
    asymmetric: {
      onSide: 1.0, otherSide: 0.80,
      cite: "14 CFR 25.427(b), and 25.445(b) for outboard fins and winglets",
      text: "The horizontal tail must take 100 % of the maximum symmetrical manoeuvre and vertical-gust "
          + "loading on one side of the plane of symmetry and 80 % on the other.",
    },
    notClaimed: [
      { feature: "Spoilers and speed brakes",
        why: "14 CFR 25.459 requires their loads to \"be determined from test data\". There is no analytical "
           + "route in the public literature and none is invented here. Note also that 25.125 contains no "
           + "mention of spoilers at all — 25.125(c)(3) merely PERMITS \"means other than wheel brakes\"." },
      { feature: "Roll rate and time to bank",
        why: "Needs aileron rolling effectiveness from DATCOM §6.2.1.1, whose method is locked behind "
           + "undigitised charts." },
      { feature: "Flight hinge moments",
        why: "DATCOM's stated accuracy on both hinge-moment derivatives is ±0.05 per radian — about ±17 % "
           + "on C_h_α — and the method needs the same blocked charts. Only the ground-gust case is computed." },
      { feature: "Aerodynamic balance",
        why: "The correlation's second factor is an undigitised chart and its worked example is too "
           + "OCR-damaged to check." },
      { feature: "Elevator area as a sized quantity",
        why: "NASA CR-186872, the only NASA-published conceptual module here, takes elevator chord and "
           + "deflections as fixed inputs and iterates TAIL AREA instead. Control sizing reaches tail area, "
           + "but not through the elevator." },
      { feature: "Control surface deflection limits",
        why: "The 737 and 747 type certificates decline to state them, delegating to non-public Boeing "
           + "rigging drawings." },
    ],
    caveats: [
      "THE EQUATION IS EXACT; THE GEOMETRY IS NOT. 25.415 gives the hinge moment exactly from an area and a "
      + "mean chord, but this tool has no control-surface geometry and no transport publishes any. The areas "
      + "and chords above are conventions measured on FOUR LIGHT SINGLES, none over 3,800 lb and none a "
      + "transport. The aileron area fraction alone scatters ±26 % across them, and the hinge moment is "
      + "linear in area, so that spread carries straight into the actuator load.",
      "The 1.25 of 25.415(d) and the 1.6 of 25.415(e) COMPOUND to 2.0. Dropping the dynamic factor needs a "
      + "rational analysis, and even then the regulation floors it at 1.2.",
      "Only the ground-gust case is computed. It is often the one that sizes the actuator, but it is not the "
      + "only load: 25.391 also points at the flight conditions of 25.331, 25.341, 25.349 and 25.351.",
      "No surface is SIZED here. The research's own conclusion is to size the tail, check the aileron and "
      + "rudder, and size nothing else — and the check needs charts this tool does not have.",
    ],
  };
}
