/* =====================================================================
   HIGH LIFT — CLmax computed from the flap and slat, not entered
   =====================================================================
   This is the module the landing-line replacement was for. While the
   landing constraint was Loftin's fitted line, CLmax was half of a fitted
   pair and had to carry the value the product demanded; nothing computed
   could be substituted for it. Now that 25.125 is computed (landing.js),
   CLmax is a free physical quantity and a flap system can set it.

   TWO ROUTES EXIST AND THEY DISAGREE ABOUT WHAT FLAP TYPE EVEN MEANS.

   DATCOM §6.1.1.3 picks a curve by flap type and reads Δc_lmax off it.
   Torenbeek, through Olson (NASA/NTRS 20150006019), is closed form, and in
   his Eq. (10) flap type does NOT appear at all: for a sharp-nosed section

       Δ_f c'_lmax = c_lα · δ_f · sin θ_f / π,    θ_f = acos(2 c_f/c − 1)

   All of the "a Fowler beats a plain flap" behaviour lives in the chord
   extension c'/c and in the effectiveness η_δ, not in the maximum-lift
   increment. That is the sharpest methodological difference between the two
   and it is why this module implements TORENBEEK as its trailing-edge
   route: it is closed form, its three charts are digitised from Olson's own
   figures, and the research validated it against measured two-dimensional
   data at −10 % to +6 % with nothing tuned. The research's own DATCOM
   digitisation, by contrast, reads its k2 factor about 0.10 low and returns
   9–15 % less than DATCOM's own worked answers.

   LEADING AND TRAILING EDGE INCREMENTS ARE NOT ADDITIVE, and both primary
   sources say so. DATCOM §6.1.4.3 p. 6.1.4.3-1, verbatim: "Maximum lift
   increments of leading-edge and trailing-edge flaps cannot, in general, be
   added when these devices are used in combination." It then offers no
   combination rule — a gap, not a licence to add. Torenbeek gives the one
   rule that exists, and it REPLACES the section maximum lift rather than
   adding to it, Eq. (16):

       c_lmax = (1 − k_s) · [c_l0 + Δ_f c_l0 + 0.47 c_lα] / [1 + 0.035 c_lα]

   with k_s between 0.03 and 0.15, 0.07 a reasonable average. He states it
   covers Krueger flaps as well as slats, which matters here because DATCOM
   deliberately withholds a Krueger method and the 737's inboard leading
   edge is Krueger, not slat.

   SECTION TO WING — ONE EQUATION PER DEVICE. DATCOM §6.1.4.3-a is a
   TRAILING-EDGE equation: it defines its own input as "the increment in
   airfoil section maximum-lift coefficient due to trailing-edge flaps,
   obtained from Section 6.1.1.3", and the chart it depends on, Figure
   6.1.4.3-10, is titled "PLANFORM CORRECTION FACTOR — TRAILING-EDGE
   FLAPS". Slats have their own wing-level equation, 6.1.4.3-b. This module
   therefore sends the flap through 6.1.4.3-a and the leading-edge device
   through 6.1.4.3-b and reports them SEPARATELY; their sum is published as
   an upper bound and labelled one, because DATCOM says the two cannot be
   added and then declines to give a combination rule.

   An earlier version of this module took Torenbeek Eq. (16)'s COMBINED
   section maximum lift — which already contains the leading-edge device —
   and pushed the whole increment through the trailing-edge factor. That
   returned a 737-800 CLmax of 3.34 against a published 2.35. Splitting the
   two returns 2.75. Nothing was tuned; an equation was simply stopped from
   being used on a quantity it was not written for.

       ΔC_Lmax = Δc_lmax · (S_Wf/S_W) · K_Λ

   and Figure 6.1.4.3-10 prints its own closed form on the chart face, which
   removes the last chart from the method:

       K_Λ = (1 − 0.08 cos²Λ_c/4) · cos^0.75 Λ_c/4

   Note K_Λ(0°) = 0.920, NOT 1.0 — even an unswept wing loses 8 % of the
   two-dimensional increment in this correlation, and an implementation
   using a bare cos Λ silently gains that back. The three published sweep
   corrections disagree by 23 % at the 737's 25° and by 73 % at 40°; this
   takes DATCOM's because it is the only one whose original database is
   identified (Furlong & McHugh, NACA TR 1339, 142 reports).

   S_Wf/S_W IS AN AREA, NOT A SPAN. DATCOM says the flap-affected area
   explicitly, and "does not include any increase in wing area due to flap
   extension". On a tapered wing the area ratio is much larger than the span
   ratio because the flap sits inboard where the chord is wide: on the
   737-800's taper a flap from the side of body to η = 0.75 covers 64 % of
   the span but about 78 % of the area. Using the span fraction where the
   area ratio is meant under-predicts by about a fifth, so this module takes
   the span stations and computes the area itself.

   WHAT THIS DOES NOT DO. It does not evaluate Olson's Eq. (11), the
   short-bubble branch that governs sections with a blunt nose, because that
   needs the leading-edge sharpness parameter Δy and no source on disk gives
   one for a transport aerofoil. It computes no pitching moment, which is
   the increment that would size the tail. It is NOT wired into the sizing
   loop: it reports a CLmax beside the one in use, and the comparison is the
   product.
   ===================================================================== */

const DEG = Math.PI / 180;

/* Olson Fig. 3 — flap lift effectiveness η_δ against deflection, by system.
   Read at 200 dpi from the paper and tabulated in the research note. */
const ETA_DELTA = Object.freeze({
  plain:            { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.90, 0.875, 0.640, 0.495, 0.437, 0.400, 0.367] },
  "single-slotted": { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.82, 0.815, 0.775, 0.695, 0.585, 0.470, 0.350] },
  "single-fowler":  { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.88, 0.875, 0.845, 0.780, 0.580, 0.300, 0.300] },
  "double-slotted": { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.745, 0.745, 0.740, 0.715, 0.665, 0.585, 0.500] },
  "double-optimum": { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.81, 0.81, 0.805, 0.775, 0.715, 0.645, 0.540] },
  "triple-slotted": { deg: [0, 10, 20, 30, 40, 50, 60], eta: [0.81, 0.81, 0.805, 0.790, 0.765, 0.735, 0.675] },
});

/* Olson Fig. 4 — chord extension Δ_f c / c, per cent, against deflection.
   All curves rise from zero at δ_f = 0. */
const CHORD_EXTENSION = Object.freeze({
  plain:            { deg: [0, 60], pct: [0, 0] },                       // a plain flap extends no chord
  "single-slotted": { deg: [0, 10, 20, 30, 40, 50, 60], pct: [0, 9, 20, 25, 29, 31, 31.5] },
  "single-fowler":  { deg: [0, 8, 10, 20, 30, 40, 50], pct: [0, 47, 48, 52, 57, 61, 62] },
  "double-slotted": { deg: [0, 10, 20, 30, 40, 50, 60], pct: [0, 12, 24, 32, 38, 41, 41] },
  "double-optimum": { deg: [0, 10, 20, 30, 40, 50, 60], pct: [0, 18, 31, 40, 51, 62, 72] },
  "triple-slotted": { deg: [0, 8, 10, 20, 30, 40, 50, 60], pct: [0, 47, 48, 58, 68, 78, 87, 95] },
});

export const FLAP_TYPES = Object.freeze(Object.keys(ETA_DELTA));
export const LE_DEVICES = Object.freeze(["none", "slat", "krueger", "droop"]);

/* Torenbeek Eq. (16)'s non-linearity factor: 0.03 to 0.15, 0.07 average. */
export const K_S_DEFAULT = 0.07;

const lerp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0; while (xs[i + 1] < x) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
};

export const etaDelta = (type, deflectionDeg) => {
  const t = ETA_DELTA[type] ?? ETA_DELTA["single-slotted"];
  return lerp(t.deg, t.eta, deflectionDeg);
};
export const chordExtension = (type, deflectionDeg) => {
  const t = CHORD_EXTENSION[type] ?? CHORD_EXTENSION["single-slotted"];
  return lerp(t.deg, t.pct, deflectionDeg) / 100;
};

/* Olson Eq. (4) and (3). */
export const thetaF = (cfOverC) => Math.acos(2 * Math.min(0.9, Math.max(0.01, cfOverC)) - 1);
export const alphaDelta = (cfOverC) => {
  const th = thetaF(cfOverC);
  return 1 - (th - Math.sin(th)) / Math.PI;
};

/* DATCOM Fig. 6.1.4.3-10, the closed form printed on the chart face.
   NOTE THE FIGURE'S OWN TITLE: "PLANFORM CORRECTION FACTOR — TRAILING-EDGE
   FLAPS". K_Λ is a trailing-edge quantity and must not be applied to a
   section increment that already contains a leading-edge device. */
export const kLambda = (sweepC4Deg) => {
  const c = Math.cos(sweepC4Deg * DEG);
  return (1 - 0.08 * c * c) * Math.pow(c, 0.75);
};

/* ── the domain the wing-level method was actually fitted in ──────────
   Figure 6.1.4.3-9 prints its own database along the bottom of the chart:
   twelve planforms, each with its sweep, aspect ratio, taper and aerofoil
   section. That table is the answer to why the wing conversion does not
   close on a modern transport, and it is reproduced here from the chart
   face rather than described.

   Λ_c/4   35 40 40 45 45 45 45 45 45 50 50 60      degrees
   A      6.0 4.0 3.9 3.4 3.5 3.5 4.0 5.1 8.0 2.9 2.9 3.5
   λ      .50 .62 .62 .51 .50 .50 .60 .38 .45 .62 .62 .25
   section 64₁-212, 64₁-112, circular arc, 64₁A112, 65A006, 64-210,
           65₁A012, 64A006 — 1940s–50s NACA 6-series and circular-arc,
           six to twelve per cent thick.

   DATCOM's own trailing-edge sample problem sits in the same place:
   A = 5.1, λ = 0.383, Λ_c/4 = 46°, NACA 64-210 (its reference 4 is a
   47.7° sweptback wing). A modern transport is outside this database on
   THREE axes at once — below it in sweep, above it in aspect ratio, and
   on a section family that does not appear in it at all. */
export const DATCOM_WING_DATABASE = Object.freeze({
  sweepC4Deg: Object.freeze([35, 60]),
  aspectRatio: Object.freeze([2.9, 8.0]),
  taper: Object.freeze([0.25, 0.62]),
  clMaxCeiling: 2.05,
  sections: "1940s–50s NACA 6-series (64-/65-series) and circular-arc, 6 to 12 per cent thick",
  source: "USAF DATCOM Figure 6.1.4.3-9, planform table printed beneath the chart; the underlying "
        + "database is Furlong & McHugh, NACA TR 1339 (1957) — DATCOM §6.1.4.3 reference 1, "
        + "\"Tabulated data from 142 reports are presented in Reference 1\". TR 1339's own Figure 38 "
        + "(printed p. 1425) carries the SAME twelve planforms, table for table (its tables 19, 20, 21, "
        + "30/31, 32, 33, 29, 34, 25, 38, 39, 44), so DATCOM's summary chart is lifted from it",
});

/* ── what the ORIGINAL database says about its own correlatability ───
   DATCOM §6.1.4.3's reference 1 is Furlong & McHugh, NACA Report 1339
   (1957). Its Figure 38 carries the SAME twelve planforms as DATCOM's
   Figure 6.1.4.3-9, table for table, so DATCOM's summary chart is lifted
   from it. Every string below was read off the rendered page images of
   TR 1339 at 190-300 dpi (the scan has no text layer at all) and the
   printed page number is given for each. Nothing here is second-hand.

   THE CENTRAL FINDING. TR 1339 tried to build exactly the correlation
   DATCOM later published, and reported that it could not. Printed p. 1425,
   under "MAXIMUM LIFT", sub-heading "Trailing-edge flaps":

     "An attempt was made to analyze the data presented in figure 36 and
      other available data, either in terms of the maximum lift increment
      at Λ_c/4 = 0° or the linear lift increment previously discussed.
      NO CLEAR CORRELATION COULD BE FOUND."

   Scope, stated because it matters: the direct evidence there is
   partial-span SPLIT flaps at 60° on two aerofoil families, plus
   unattributed "other available data". It is not a blanket finding over
   every flap type. The sentence that follows is the substantive one — the
   sweep effect is AEROFOIL-DEPENDENT, approximately constant through the
   sweep range for NACA 230-series sections and "materially increased with
   an increase in sweep angle" for 65-series. A single-valued K(Λ) cannot
   express that.

   AND THE SAME REPORT SAYS A SINGLE-VALUED RULE IS THE WRONG SHAPE.
   Printed p. 1419:

     "This simple rule [that CLmax varies as cos²Λ], as it is generally
      known, has not been found to be consistent with the experimental
      maximum lift coefficients of finite-span wings. The maximum lift
      coefficient is not only a function of sweep but … it is also
      dependent on the type of flow separation involved."

     "Hence, any attempt to establish an empirical rule to predict the
      maximum lift coefficient that is based on a correlation of
      experimental data must necessarily take into account the type of
      flow separation."

   Its Figure 31 — the ancestor of DATCOM Figure 6.1.4.3-10 — accordingly
   has TWO DIVERGENT BRANCHES, not one curve: wings with leading-edge
   vortex flow PRESENT (sharp nose) RISE above 1.0 with sweep, reaching
   about 1.8 at 50°, while wings with it ABSENT (round nose, which is what
   a transport is) FALL. K_Λ is the round-nose branch only. Two further
   facts read off that figure and its text:
     - the round-nose branch's plotted data lies between about 15° and 45°
       and its faired curve ends there; there is no plotted round-nose
       point at 50° or 60°, so K_Λ beyond ~45° is extrapolation;
     - the ratio's DENOMINATOR is not measured for those wings — "estimates
       in the case of the round-leading-edge airfoils had to be used".

   NOT ADDITIVE, from the source rather than from DATCOM's restatement.
   Printed p. 1426:

     "When these devices are used in combination, the increments of maximum
      lift coefficient are not additive except in a few isolated cases as
      can be seen from an inspection of the data presented in the tables."

   THE LINEARITY IN FLAPPED FRACTION IS DEVICE-DEPENDENT. Figure 39,
   printed p. 1426, on a 35°, A 6.0, λ 0.5, NACA 64₁-212 wing at
   R 6.8×10⁶: a double-slotted flap at 50° rises essentially LINEARLY
   through the origin to ΔCLmax ≈ 1.04 at 96 % span, while a split flap at
   60° is visibly concave and SATURATES at ≈ 0.39. Eq. 6.1.4.3-a is linear
   in the flapped fraction, so it is the right shape for the device class
   this tool sizes and the wrong shape for split flaps. (Abscissa is
   percent of FULL span; DATCOM's equation uses AREA. Different bases.) */
export const TR1339 = Object.freeze({
  citation: "Furlong, G. C., and McHugh, J. G., \"A Summary and Analysis of the Low-Speed Longitudinal "
          + "Characteristics of Swept Wings at High Reynolds Number\", NACA Report 1339, 1957 — "
          + "USAF DATCOM §6.1.4.3 reference 1",
  noCorrelation: "No clear correlation could be found.",
  noCorrelationPage: 1425,
  noCorrelationScope: "partial-span split flaps at 60° on two aerofoil families, plus other available "
                    + "data; the sweep effect is aerofoil-dependent — constant through the sweep range "
                    + "for NACA 230-series sections, materially increasing with sweep for 65-series",
  notAdditive: "When these devices are used in combination, the increments of maximum lift coefficient "
             + "are not additive except in a few isolated cases.",
  notAdditivePage: 1426,
  separationType: "any attempt to establish an empirical rule to predict the maximum lift coefficient "
                + "that is based on a correlation of experimental data must necessarily take into "
                + "account the type of flow separation",
  separationTypePage: 1419,
  /* Figure 31, round-nose branch — the branch K_Λ represents. */
  fig31RoundNoseDataDeg: Object.freeze([15, 45]),
  fig31Note: "Figure 31 has two divergent branches by leading-edge type; the round-nose branch (a "
           + "transport) falls with sweep and its plotted data and faired curve end near 45°, while "
           + "the sharp-nose branch RISES above 1.0. Its zero-sweep denominator is estimated, not "
           + "measured: \"estimates in the case of the round-leading-edge airfoils had to be used\".",
  /* Figure 39 — linearity in flapped fraction is device-dependent. */
  fig39: Object.freeze({
    wing: "Λ_c/4 35°, A 6.0, λ 0.50, NACA 64₁-212, R 6.8×10⁶",
    doubleSlotted50: "rises essentially linearly through the origin to ΔCLmax ≈ 1.04 at 96 % span",
    split60: "visibly concave, saturating at ΔCLmax ≈ 0.39",
    page: 1426,
  }),
});

/* Report every axis on which a wing is an extrapolation of Figure
   6.1.4.3-9's database. This does not correct anything and must not: it
   states where the method is being used outside its own evidence. */
export function domainOfValidity({ sweepC4Deg, aspectRatio = null, taper = null, supercritical = false,
                                   flapType = null }) {
  const D = DATCOM_WING_DATABASE;
  const out = [];
  /* K_Λ's own ancestor, TR 1339 Figure 31, plots its round-nose branch
     only between about 15° and 45°. Beyond that the factor is a drawn
     curve with nothing under it. Note this is a DIFFERENT range from the
     twelve-planform summary set below, and a transport at 25° is INSIDE
     it — so the sweep factor is not this wing's problem. */
  const [lo, hi] = TR1339.fig31RoundNoseDataDeg;
  if (sweepC4Deg > hi || sweepC4Deg < lo) {
    out.push({ axis: "sweep factor K_Λ", value: sweepC4Deg, range: TR1339.fig31RoundNoseDataDeg,
      direction: sweepC4Deg > hi ? "above" : "below",
      note: `K_Λ's own source data (TR 1339 Figure 31, round-nose branch) lies between ${lo}° and `
          + `${hi}°; at ${sweepC4Deg.toFixed(1)}° the factor is extrapolated. ${TR1339.fig31Note}` });
  }
  if (flapType === "plain") {
    out.push({ axis: "flap type", value: flapType, range: "slotted and Fowler families",
      direction: "linearity not supported",
      note: "Eq. 6.1.4.3-a is LINEAR in the flapped fraction. TR 1339 Figure 39 shows that linearity "
          + "holds for a double-slotted flap (near-linear to ΔCLmax ≈ 1.04 at 96 % span) but FAILS for "
          + "a split flap, which saturates at ≈ 0.39. A plain or split flap is the case where the "
          + "linear form is known to be the wrong shape." });
  }
  if (sweepC4Deg < D.sweepC4Deg[0]) {
    out.push({ axis: "sweep", value: sweepC4Deg, range: D.sweepC4Deg, direction: "below",
      note: `Λ_c/4 = ${sweepC4Deg.toFixed(1)}° is below the database's lowest wing (35°). K_Λ is `
          + "extrapolated towards zero sweep, where Figure 6.1.4.3-10 is a drawn curve with no plotted "
          + "data behind it." });
  } else if (sweepC4Deg > D.sweepC4Deg[1]) {
    out.push({ axis: "sweep", value: sweepC4Deg, range: D.sweepC4Deg, direction: "above",
      note: `Λ_c/4 = ${sweepC4Deg.toFixed(1)}° is beyond the database's 60°.` });
  }
  if (aspectRatio !== null && aspectRatio > D.aspectRatio[1]) {
    out.push({ axis: "aspect ratio", value: aspectRatio, range: D.aspectRatio, direction: "above",
      note: `A = ${aspectRatio.toFixed(1)} is above every wing in the database (highest 8.0, and only `
          + "one of the twelve is above 6). Aspect ratio governs how far the tip-stall penalty that K_Λ "
          + "represents actually reaches, so this is not a small extrapolation." });
  } else if (aspectRatio !== null && aspectRatio < D.aspectRatio[0]) {
    out.push({ axis: "aspect ratio", value: aspectRatio, range: D.aspectRatio, direction: "below",
      note: `A = ${aspectRatio.toFixed(1)} is below the database's 2.9.` });
  }
  if (taper !== null && (taper < D.taper[0] || taper > D.taper[1])) {
    out.push({ axis: "taper", value: taper, range: D.taper, direction: taper < D.taper[0] ? "below" : "above",
      note: `λ = ${taper.toFixed(2)} is outside the database's ${D.taper[0]}–${D.taper[1]}.` });
  }
  if (supercritical) {
    out.push({ axis: "section", value: "supercritical", range: D.sections, direction: "not represented",
      note: "No supercritical section appears anywhere in the database; it is 1940s–50s NACA 6-series "
          + "and circular-arc. A supercritical section's stall is a different mechanism from the one "
          + "the correlation was fitted to." });
  }
  return out;
}

/* DATCOM Eq. 6.1.4.3-b — slats, at wing level, closed form. The 1.28 is
   DATCOM's assumed slat section maximum lift, and it says a test value may
   be substituted. Reproduces its own worked example exactly (0.2522 against
   the printed 0.252), while being 15 % low against that example's test
   value of 0.295 — DATCOM's own number, not this implementation's error. */
export function datcomSlatIncrement({ slatChordRatio, slatSpanRatio, sweepC4Deg, sectionClMax = 1.28 }) {
  const c = Math.cos(sweepC4Deg * DEG);
  return sectionClMax * (slatChordRatio / 0.18) * slatSpanRatio * slatSpanRatio * c * c;
}

/* The flap-affected AREA ratio of a straight-tapered wing, between two
   spanwise stations, measured to the centreline as DATCOM's construction
   does and WITHOUT the chord the flap adds when it extends. */
export function flappedAreaRatio({ etaInner, etaOuter, taper, runsToSideOfBody = true }) {
  const chord = (e) => 1 - (1 - taper) * e;                  // normalised by the root chord
  const area = (e0, e1) => (e1 - e0) * 0.5 * (chord(e0) + chord(e1));
  /* DATCOM's construction, as the research note states it: the trapezoid is
     "extended forward to the leading edge AND INBOARD TO THE AIRCRAFT
     CENTRELINE where the flap runs to the side of body". A flap that starts
     at the side of body therefore counts the carry-through area too, and
     leaving it out is worth about a fifth on a transport. */
  const inner = runsToSideOfBody ? 0 : etaInner;
  return area(inner, etaOuter) / area(0, 1);
}

/* ── the method ──────────────────────────────────────────────────────── */
export function highLift(cfg) {
  const {
    flapType = "double-slotted",
    flapChordRatio = 0.30,
    flapDeflectionDeg = 40,
    etaInner = 0.11, etaOuter = 0.75,
    taper = 0.24,
    sweepC4Deg = 25,
    leDevice = "none",
    slatChordRatio = 0.15, slatSpanRatio = 0.75,
    clAlpha = 2 * Math.PI,                 // per radian, thin aerofoil
    clMaxCleanSection = 1.60,
    cl0Section = 0.30,
    kS = K_S_DEFAULT,
    clMaxCleanWing = null,                 // if given, the increment is added to it
    aspectRatio = null,                    // for the domain-of-validity report only
    supercritical = false,                 // ditto — never changes a number
  } = cfg;

  const dfRad = flapDeflectionDeg * DEG;
  const th = thetaF(flapChordRatio);
  const aDelta = alphaDelta(flapChordRatio);
  const eta = etaDelta(flapType, flapDeflectionDeg);
  const dcOverC = chordExtension(flapType, flapDeflectionDeg);
  const cPrimeOverC = 1 + dcOverC;

  /* Olson Eqs. (7) and (6), NOT the bare Eq. (5). This is where the whole
     Fowler effect lives and leaving it out is a real error: Eq. (5) gives
     the increment on the ORIGINAL chord, but a slotted flap extends the
     chord, and Eq. (6) carries that through —

         Δ_f c'_l0 = η_δ · α'_δ · c_lα · δ_f                        (7)
         Δ_f c_l0  = Δ_f c'_l0 · (c'/c) + c_l0 · (c'/c − 1)         (6)

     with α'_δ evaluated at the flap chord referred to the EXTENDED chord,
     c_f/c'. Using Eq. (5) alone under-predicts a triple-slotted section by
     a quarter, because a triple-slotted flap at 40° extends the chord by
     78 % and none of that was being counted. */
  const aDeltaPrime = alphaDelta(flapChordRatio / cPrimeOverC);
  const dfCl0Prime = eta * aDeltaPrime * clAlpha * dfRad;                     // Eq. (7)
  const dfCl0 = dfCl0Prime * cPrimeOverC + cl0Section * (cPrimeOverC - 1);    // Eq. (6)
  /* Olson Eq. (10): the sharp-nose maximum-lift increment. Flap type does
     not appear; it enters only through c'/c and through η_δ above. */
  const dfClMaxSharp = (clAlpha * dfRad * Math.sin(th)) / Math.PI;

  let clMaxSection, route, leNote;
  if (leDevice === "none") {
    /* No leading-edge device: the flap increment adds to the clean section. */
    clMaxSection = clMaxCleanSection + dfClMaxSharp;
    route = "Torenbeek Eq. (10), flap increment added to the clean section";
    leNote = null;
  } else {
    /* Torenbeek Eq. (16). It REPLACES the section maximum lift rather than
       adding an increment — that is the whole point of it, and it is the
       only combination rule either source offers. He states it covers
       Krueger flaps as well as slats. */
    clMaxSection = ((1 - kS) * (cl0Section + dfCl0 + 0.47 * clAlpha)) / (1 + 0.035 * clAlpha);
    route = "Torenbeek Eq. (16), which REPLACES the section maximum lift (leading and trailing edge "
          + "increments are not additive, and both DATCOM and Torenbeek say so)";
    leNote = leDevice === "krueger"
      ? "Krueger: DATCOM deliberately withholds a method for these. Torenbeek states Eq. (16) covers them, "
      + "and that is the only route taken here."
      : leDevice === "droop"
      ? "A drooped leading edge is not a slat: Torenbeek's Eq. (15) applies and is valid only to about 25°. "
      + "Eq. (16) is used regardless here, which overstates a droop."
      : null;
  }

  const dClMaxSection = clMaxSection - clMaxCleanSection;
  const sWf = flappedAreaRatio({ etaInner, etaOuter, taper, runsToSideOfBody: cfg.runsToSideOfBody !== false });
  const kL = kLambda(sweepC4Deg);

  /* ── SECTION TO WING ─────────────────────────────────────────────────
     EACH DEVICE THROUGH ITS OWN EQUATION. The earlier implementation took
     the COMBINED section maximum lift of Torenbeek Eq. (16) — which already
     contains the leading-edge device — subtracted the clean section, and
     pushed the whole thing through DATCOM Eq. 6.1.4.3-a. Three things are
     wrong with that and all three are in DATCOM's own pages:

       1. Figure 6.1.4.3-10 is titled "PLANFORM CORRECTION FACTOR —
          TRAILING-EDGE FLAPS". K_Λ is a trailing-edge factor.
       2. Eq. 6.1.4.3-a defines its input as "the increment in airfoil
          section maximum-lift coefficient due to TRAILING-EDGE flaps,
          obtained from Section 6.1.1.3" — a trailing-edge quantity, and
          DATCOM's own, not Torenbeek's.
       3. DATCOM publishes a SEPARATE equation for slats, 6.1.4.3-b, at
          wing level, and states the two cannot be added.

     So the trailing edge goes through 6.1.4.3-a and the leading edge
     through 6.1.4.3-b, and they are reported separately. On the 737-800
     this moves the wing answer from 3.34 to about 2.75 against a published
     2.35 — still high, and see `domain` below for why. */
  const dCLmaxWingTE = dfClMaxSharp * sWf * kL;

  /* DATCOM Eq. 6.1.4.3-b. Its span ratio is to the EXPOSED wing span, not
     the full span — DATCOM: "is the ratio of the total slat span to the
     exposed wing span. For a segmented leading-edge slat, b_slat is the
     total span of the segments." */
  const datcomSlat = leDevice === "none"
    ? null
    : datcomSlatIncrement({ slatChordRatio, slatSpanRatio, sweepC4Deg });
  const dCLmaxWingLE = datcomSlat;

  /* NOT ADDITIVE. DATCOM §6.1.4.3 p. 6.1.4.3-1, verbatim: "Maximum lift
     increments of leading-edge and trailing-edge flaps cannot, in general,
     be added when these devices are used in combination." It then points at
     Figure 6.1.4.3-9 rather than giving a rule, and that figure is a
     scatter of measured aircraft, not a method. The sum is therefore
     reported as an UPPER BOUND and labelled one — it is the only thing the
     sources license, and it is not a prediction. */
  const dCLmaxWingUpperBound = dCLmaxWingTE + (dCLmaxWingLE ?? 0);
  const dCLmaxWing = dCLmaxWingUpperBound;
  const clMaxWing = clMaxCleanWing === null ? null : clMaxCleanWing + dCLmaxWing;

  /* What the previous implementation returned, kept so the change is
     visible and can be regression-checked rather than taken on trust. */
  const dCLmaxWingCombinedRoute = dClMaxSection * sWf * kL;

  /* AN UNRESOLVED CONTRADICTION, RECORDED RATHER THAN DECIDED.
     Olson's Eq. (10) is written for Δ_f c'_lmax — the PRIMED symbol, which
     throughout his paper means "referred to the EXTENDED chord c'". Eq. (6)
     shows the referral back to the stowed chord for the zero-lift
     increment, and this module performs it there. It does NOT perform it
     for the maximum-lift increment, and the research note's §2.4 says it
     should ("the stowed-chord increment is about 0.96 × 1.25 = 1.20").
     Applying it would multiply the sharp-nose increment by c'/c.
     The reason it is not applied: doing so takes the single-slotted
     CR-2214 case from +3.2 % to about +17 % against measured two-
     dimensional data, i.e. the measurement contradicts the referral.
     Both values are reported; neither is silently chosen. */
  const dfClMaxSharpChordReferred = dfClMaxSharp * cPrimeOverC;

  const domain = domainOfValidity({ sweepC4Deg, aspectRatio, taper, supercritical, flapType });

  return {
    clMaxSection, clMaxWing, dCLmaxWing, dClMaxSection,
    /* the wing level, decomposed by device — each through its own equation */
    dCLmaxWingTE, dCLmaxWingLE, dCLmaxWingUpperBound, dCLmaxWingCombinedRoute,
    domain,
    route, leNote,
    terms: {
      thetaFDeg: th / DEG, alphaDelta: aDelta, etaDelta: eta,
      chordExtension: dcOverC, cPrimeOverC,
      dfCl0, dfCl0Prime, alphaDeltaPrime: aDeltaPrime, dfClMaxSharp, dfClMaxSharpChordReferred,
      flappedAreaRatio: sWf, kLambda: kL,
      spanFraction: etaOuter - etaInner,
    },
    datcomSlatIncrement: datcomSlat,
    caveats: [
      "Olson Eq. (11), the short-bubble branch that governs a blunt-nosed section, is NOT evaluated: it "
      + "needs the leading-edge sharpness parameter Δy and no source on disk gives one for a transport "
      + "aerofoil. The sharp-nose Eq. (10) is used instead.",
      "K_Λ(0°) = 0.920, not 1.0 — even an unswept wing loses 8 % of the two-dimensional increment in "
      + "DATCOM's correlation. The three published sweep corrections disagree by 23 % at 25° and 73 % at "
      + "40°; DATCOM's is taken because it is the only one whose source database is identified.",
      "THE WING-LEVEL METHOD IS BEING USED OUTSIDE ITS OWN DATABASE, and that database is printed on the "
      + "face of Figure 6.1.4.3-9: twelve planforms at 35° to 60° of sweep, aspect ratio 2.9 to 8.0, taper "
      + "0.25 to 0.62, on 1940s–50s NACA 6-series and circular-arc sections. A 737-800 (25°, A 9.45, "
      + "supercritical) is outside it on three axes at once — below in sweep, above in aspect ratio, and "
      + "on a section family that does not appear at all. No point on that chart exceeds a CLmax of about "
      + "2.05. This is the explanation for the residual over-prediction, and it is not a coding defect.",
      "THE ORIGINAL DATABASE REPORTS THAT THIS CORRELATION COULD NOT BE FOUND. DATCOM's reference 1 is "
      + "Furlong & McHugh, NACA TR 1339, and on its printed page 1425 it says of exactly this problem — "
      + "the influence of sweep on the maximum-lift effectiveness of trailing-edge flaps — \"No clear "
      + "correlation could be found.\" Its evidence there is partial-span split flaps at 60° on two "
      + "aerofoil families, so it is not a blanket finding; but it also records that the sweep effect is "
      + "AEROFOIL-DEPENDENT, which a single-valued K_Λ cannot express. DATCOM published a single-valued "
      + "curve anyway and cited this report for it.",
      "TR 1339 p. 1419: \"any attempt to establish an empirical rule to predict the maximum lift "
      + "coefficient that is based on a correlation of experimental data must necessarily take into "
      + "account the type of flow separation\". Its Figure 31, the ancestor of DATCOM's K_Λ chart, "
      + "accordingly has TWO DIVERGENT BRANCHES: sharp-nosed wings RISE above 1.0 with sweep while "
      + "round-nosed wings fall. K_Λ is the round-nose branch alone, its plotted data stops near 45°, "
      + "and its zero-sweep denominator was ESTIMATED rather than measured.",
      "Eq. 6.1.4.3-a is LINEAR in the flapped fraction, and TR 1339 Figure 39 shows that is the right "
      + "shape for a double-slotted flap (near-linear to ΔCLmax ≈ 1.04 at 96 % span) and the WRONG shape "
      + "for a split flap (concave, saturating at ≈ 0.39). The linear form is defensible here only "
      + "because transports use slotted and Fowler flaps.",
      "Leading and trailing edge are NOT added as a prediction. Each goes through its own DATCOM equation "
      + "— 6.1.4.3-a for the flap, 6.1.4.3-b for the slat — and their sum is reported as an UPPER BOUND, "
      + "because DATCOM states the two cannot be added and then offers no combination rule.",
      "DATCOM Eq. 6.1.4.3-b over-predicts the only fully-predictive three-dimensional slat measurement "
      + "available (NASA TP-1580/TP-1805, the Energy Efficient Transport model: full-span 15.5 % slat, "
      + "measured increment 0.57) by +53 %, returning 0.875. DATCOM itself says the method \"has not been "
      + "substantiated beyond the test data that were used to formulate the method\".",
      "DATCOM forbids substituting a computed section maximum lift into the slat equation, verbatim: "
      + "\"Attempts to use the predicted section maximum-lift value from Section 6.1.1.3 have been "
      + "unsatisfactory, as the resulting estimates underpredicted the test values.\" The assumed 1.28 is "
      + "therefore kept, and only a TEST value should ever replace it.",
      "Eq. 6.1.4.3-a's input is defined by DATCOM as the section increment \"obtained from Section "
      + "6.1.1.3\" — its own two-dimensional method. This module feeds it Torenbeek's instead, which on a "
      + "30 % double-slotted flap at 30° gives 0.96 against DATCOM's 1.49. The two are not "
      + "interchangeable and the splice is a known weakness, not a validated equivalence.",
      "The flap-affected fraction is an AREA and is computed from the span stations and the taper, not "
      + "taken as a span fraction. Using the span where the area is meant under-predicts by about a fifth.",
      "DATCOM's own statement on this class of method, verbatim: \"The estimation of wing maximum-lift "
      + "coefficient is at best approximate\" and it \"is intended to be used as a first-order "
      + "approximation … when experimental data are not available\".",
      "No pitching moment is computed, and that is the increment that would size the tail. DATCOM's "
      + "swept-wing term dominates the section term for a transport, so a tail sized on two-dimensional "
      + "data alone would be under-sized.",
      "This is NOT wired into the sizing loop. It reports a CLmax beside the one in use; comparing them is "
      + "the point.",
    ],
  };
}
