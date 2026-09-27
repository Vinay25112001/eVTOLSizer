/* =====================================================================
   CONTROL-SURFACE SPANWISE STATIONS — where the surfaces actually sit
   =====================================================================
   control-surfaces.js computes what can be computed about the surfaces:
   the 25.415 ground-gust hinge moment, from an AREA and a MEAN CHORD. It
   deliberately holds no spanwise geometry, because when it was written no
   source on disk gave any:

     "this tool has no control-surface geometry and no transport publishes
      any. The research checked: the 737 ACAPS has zero occurrences of
      'aileron' ... in 7,616 lines"

   That is still true of the airport-planning manuals. It is NOT true of
   NASA CR-2144, which prints a SCALED GENERAL ARRANGEMENT for each
   aircraft it documents, with the surfaces drawn on it. A drawing carries
   its own scale and its own datum, so the stations can be measured — the
   same move that turned the tail-cone closure from a convention into a
   measurement.

   Research corpus: classes/cross-class/CONTROL-SURFACE-STATIONS.md, with
   the harness at harness/measure-control-surfaces.py and its full output
   in CONTROL-SURFACE-STATIONS-measurements.txt.

   WHAT IS MEASURED, AND HOW IT WAS CHECKED. The B-747 general arrangement
   (CR-2144 Figure IX-2, printed p. 213) rasterised at 600 dpi, ink taken
   by threshold because the page is a SCAN and has no outline colour to
   mask. Each drawn panel is a white region enclosed by its outline. Scale
   from the span printed on the figure (195.68 ft) and CROSS-CHECKED
   against the drawing's own 0-100 ft scale bar: the two agree to 0.078 %.
   Both wings were measured independently and every control surface's two
   readings agree to 0.003 of semispan.

   THE LABELLING IS THE DRAWING'S, NOT A GUESS. CR-2144's own text on
   printed p. 211 describes "five spoiler panels, an inboard aileron
   between the inboard and outboard flaps, and an outboard aileron which
   operates with flaps down only", plus "the most inboard sixth spoiler
   panel". Measured: the inboard flap ends at 0.376 and the outboard flap
   begins at 0.444, and the isolated panel runs 0.382-0.436 — it fills that
   gap. Six discrete spoiler panels came out of each wing. The drawing does
   not say which spoiler is the symmetric-only sixth, so this does not say.

   WHAT IS STILL A CONVENTION. Every class except the transport. Howe 2000
   Table 8.2, reproduced third-hand in Coene 2008 Table 2.8, is the only
   table that gives aileron stations by aircraft class. It is used for
   those classes and labelled, never presented as measured.

   AND A CORRECTION THAT MATTERS. That table's `y_A,M/b` is a fraction of
   the FULL span measured from the centreline, not of the semispan. The
   research note read it as semispan and was wrong by a factor of two; the
   table refutes that without any outside source, because it also prints
   the aileron volume coefficient and only the full-span reading
   reproduces it (V_A = (S_A/S)(y_A,M/b), four rows, printed precision).
   The measurement above then confirms it independently: the 747's ailerons
   sit at 0.409 and 0.831 of semispan, against the corrected reading's 0.38
   and 0.86, and nowhere near the old reading's 0.19 and 0.43.
   ===================================================================== */

/* Measured off a scaled general arrangement. eta is a fraction of the
   SEMISPAN, from the centreline. Station uncertainty is +/-0.005 semispan:
   0.003 of left/right spread and 0.004 from the two centreline datums,
   which themselves disagree by 0.36 ft on this drawing.

   A MIDPOINT IS ROBUST; A SPAN IS AN UPPER BOUND. Each pair below is the
   spanwise extent of the panel's BOUNDING BOX, and two things push that
   extent around in opposite directions. A white region is the INSIDE of
   its outline, which reads a span about 0.008 semispan low. Against that,
   the divider drawn between two adjacent panels runs CHORDWISE, which on
   a swept wing is slanted relative to the span axis, so a slanted panel's
   bounding box reaches past its own footprint at each end — which is why
   the adjacent spoiler extents below overlap by up to 0.007 rather than
   meeting. Both effects are symmetric about the panel's centre, so the
   midpoints are unaffected; the spans are not, and the outboard aileron's
   measured 0.217 against Howe's 0.200 is partly this. Every comparison
   drawn from these numbers uses midpoints. */
export const SURFACE_STATIONS_MEASURED = Object.freeze([
  Object.freeze({
    aircraft: "Boeing 747", class: "transport",
    drawing: "NASA CR-2144 (Heffley & Jewell, 1972) Figure IX-2, printed p. 213 (PDF index 218)",
    method: "600 dpi, ink threshold; panels as white connected components; scale from the printed span "
          + "195.68 ft across the airframe component",
    crossCheck: "the drawing's own 0-100 ft scale bar gives 11.180 px/ft against the span's 11.171: 0.078 %; "
              + "the fuselage reads 21.5 ft wide against a real 21.3 ft",
    resolutionM: 0.0272, semispanFt: 97.84, etaUncertainty: 0.005,
    labelling: "CR-2144 printed p. 211: \"five spoiler panels, an inboard aileron between the inboard and "
             + "outboard flaps, and an outboard aileron which operates with flaps down only on each wing\", "
             + "with \"the most inboard sixth spoiler panel\". The measured inboard aileron fills the gap "
             + "between the two measured flap runs, and six spoiler panels came off each wing.",
    /* Each entry: [eta inboard, eta outboard], the mean of the two wings. */
    flap: Object.freeze([Object.freeze([0.116, 0.376]), Object.freeze([0.444, 0.693])]),
    aileron: Object.freeze([Object.freeze([0.382, 0.436]), Object.freeze([0.722, 0.940])]),
    spoiler: Object.freeze([
      Object.freeze([0.207, 0.283]), Object.freeze([0.280, 0.354]),
      Object.freeze([0.452, 0.513]), Object.freeze([0.506, 0.566]),
      Object.freeze([0.560, 0.618]), Object.freeze([0.611, 0.671]),
    ]),
    /* Nacelle centres, right wing (the left inboard nacelle's outline is
       broken by its pylon lines, so it is not averaged in; nacelles carry
       about +/-0.02 rather than +/-0.005).

       THESE ARE TWO-PER-SIDE STATIONS AND ONLY APPLY TO A WING THAT HAS
       TWO PER SIDE. The 747 is a four-engine aeroplane; where its inboard
       engine sits says nothing about where a twin's single engine sits,
       and the default transport in this tool IS a twin. A measurement
       taken on one layout is not evidence about another, so the selector
       below hands it back only when the layout matches. */
    nacelleEta: Object.freeze([0.396, 0.703]), nacelleEtaPerSide: 2, nacelleEtaUncertainty: 0.02,
  }),
]);

/* Howe 2000 Table 8.2, as reproduced in Coene 2008 Table 2.8 (p. 51).
   THIRD-HAND: a student thesis reproducing a textbook that is not on disk,
   with no aircraft named behind any row. `b` is the FULL span and `y_A,M`
   is measured from the centreline, so a semispan figure is TWICE the
   printed one — see the header. `bA` is the total of BOTH ailerons, so one
   aileron spans bA/b of the semispan. */
export const HOWE_AILERON_CONVENTION = Object.freeze({
  source: "Howe 2000 p. 127 Table 8.2, reproduced in Coene 2008 Table 2.8 (HAW Hamburg) — THIRD-HAND, "
        + "no aircraft named; y_A,M/b is a FULL-span fraction from the centreline and bA/b is the total "
        + "of both ailerons, so a semispan station is 2 y_A,M/b and one aileron spans bA/b of the semispan",
  rows: Object.freeze({
    trainer:   Object.freeze({ label: "twin prop general",       bAoverB: 0.320, cAoverC: 0.260, yAMoverB: 0.360 }),
    turboprop: Object.freeze({ label: "twin regional turboprop", bAoverB: 0.330, cAoverC: 0.250, yAMoverB: 0.400 }),
    bizjet:    Object.freeze({ label: "executive jets",          bAoverB: 0.270, cAoverC: 0.250, yAMoverB: 0.390 }),
    transport: Object.freeze({ label: "jet transport, low speed", bAoverB: 0.200, cAoverC: 0.230, yAMoverB: 0.430 }),
  }),
});

/* One aileron's semispan range from a Howe row: centred at 2*y_A,M/b of
   the semispan, spanning bA/b of it. */
export function howeAileronEta(row) {
  const centre = 2 * row.yAMoverB, half = row.bAoverB / 2;
  return [centre - half, centre + half];
}

/* The unsourced fallback the drawing used before any of this existed, kept
   so the two can be told apart and so a layout with no measurement still
   draws something honest. */
export const NACELLE_ETA_CONVENTION = Object.freeze({
  one: 0.34, twoInner: 0.30, twoStep: 0.27,
  source: "drawing convention, unsourced: it placed wing pods at 0.34 of semispan for one per side and "
        + "0.30 / 0.57 for two, which sits well inboard of the only stations anyone has measured here",
});

/* Where the wing pods go, for a class and a layout. A measurement is
   handed back ONLY when the layout it was taken on matches the layout
   being drawn; otherwise the convention, said to be one. */
export function nacelleEtas(type, perSide) {
  const m = SURFACE_STATIONS_MEASURED.find((r) => r.class === type);
  if (m && m.nacelleEta && perSide === m.nacelleEtaPerSide) {
    return Object.freeze({
      etas: m.nacelleEta, measured: true, uncertainty: m.nacelleEtaUncertainty,
      source: `measured on ${m.aircraft}, which has ${perSide} engines a side, off ${m.drawing}`,
    });
  }
  const C = NACELLE_ETA_CONVENTION;
  const etas = perSide === 1 ? [C.one] : Array.from({ length: perSide }, (_, i) => C.twoInner + C.twoStep * i);
  return Object.freeze({
    etas: Object.freeze(etas), measured: false, uncertainty: null,
    source: m
      ? `${C.source}. ${m.aircraft} was measured but has ${m.nacelleEtaPerSide} a side, not ${perSide}, `
        + "so its stations are not evidence about this layout"
      : C.source,
  });
}

/* The stations a class draws with. `measured` says whether a drawing was
   read; nothing here is ever presented as sized, because none of it is. */
export function surfaceStations(type) {
  const m = SURFACE_STATIONS_MEASURED.find((r) => r.class === type);
  if (m) {
    return Object.freeze({
      measured: true, aircraft: m.aircraft, drawing: m.drawing,
      etaUncertainty: m.etaUncertainty,
      flap: m.flap, aileron: m.aileron, spoiler: m.spoiler,
      nacelleEta: m.nacelleEta, nacelleEtaUncertainty: m.nacelleEtaUncertainty,
      source: `measured off ${m.drawing}; ${m.crossCheck}`,
    });
  }
  const row = HOWE_AILERON_CONVENTION.rows[type];
  if (!row) return null;
  return Object.freeze({
    measured: false, aircraft: null, drawing: null, etaUncertainty: null,
    flap: null, spoiler: null, nacelleEta: null, nacelleEtaUncertainty: null,
    aileron: Object.freeze([Object.freeze(howeAileronEta(row))]),
    row,
    source: `convention, not measured: the "${row.label}" row of ${HOWE_AILERON_CONVENTION.source}`,
  });
}

/* =====================================================================
   THE AREA CONVENTION AND THE CHORD CONVENTION DO NOT AGREE
   =====================================================================
   control-surfaces.js carries both, from different samples: an area as a
   fraction of the parent surface, and a chord as a fraction of the
   parent's chord. A drawing needs a SPAN, and the two conventions imply
   one only together — span fraction = areaFraction / chordRatio:

     elevator  0.33 / 0.30 = 1.10 of the horizontal tail span
     rudder    0.38 / 0.32 = 1.19 of the vertical tail height

   Both exceed the surface they sit on, so the pair is not self-consistent.
   That is not a defect in either number; they come from different places
   (the chords from NASA CR-186872's input deck, the areas measured on
   three light singles) and were never meant to be multiplied together.

   A DRAWING HAS TO CHOOSE, AND IT CHOOSES THE CHORD. A tail surface is
   drawn full span at its sourced chord ratio, because the chord ratio is
   the geometric quantity and the span it would need is unavailable. The
   area that falls out is then 0.30 and 0.32 of the parent rather than the
   0.33 and 0.38 the area convention states, and the drawing says so
   instead of quietly drawing one and reporting the other. Nothing computed
   changes: control-surfaces.js still takes its hinge moment from the AREA
   convention, which is the quantity 25.415 asks for. */
export const TAIL_SURFACE_SPAN_IMPLIED = Object.freeze({
  elevator: Object.freeze({ areaFraction: 0.33, chordRatio: 0.30, impliedSpanFraction: 0.33 / 0.30 }),
  rudder: Object.freeze({ areaFraction: 0.38, chordRatio: 0.32, impliedSpanFraction: 0.38 / 0.32 }),
  drawnSpanFraction: 1.0,
  why: "The area and chord conventions come from different samples and imply a surface longer than the one "
     + "it sits on (1.10 and 1.19 of it). The drawing takes the chord ratio, which is geometric, and draws "
     + "the surface full span; the area that falls out is the chord ratio, not the area convention. "
     + "control-surfaces.js is unchanged and still computes the hinge moment from the area convention.",
});
