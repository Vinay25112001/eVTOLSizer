/* ═══════════════════════════════════════════════════════════════════════
   TYRE STOWAGE — G7: the grown envelope, the clearances, the bay it needs
   ═══════════════════════════════════════════════════════════════════════
   14 CFR 25.733(d): "Each tire installed on a retractable landing gear
   system must, at the maximum size of the tire type expected in service,
   have a clearance to surrounding structure and systems that is adequate to
   prevent unintended contact between the tire and any part of the structure
   or systems." What "adequate" is, the Tire and Rim Association states in
   closed form, reprinted in the Goodyear Aircraft Tire Data Book 2018
   pp. 21-22 (LANDING-GEAR.md §1.7, read from the page images). Every
   equation below is quoted from there and numbered as the research note
   numbers it.

   BIAS tyres (p. 21, "Growth and Minimum Clearance Allowance — Bias"):
     H    = (D_O − D) / 2                       section height, from the max OD
     G_H  = 1.115 − 0.075 × AR                  section height growth factor
     G_W  = 1.04                                section width growth factor
     W_G  = G_W × W                              (32) grown width
     D_G  = D + 2 G_H H                          (33) grown diameter
     C_R  = [(17.02 + 2.61 (SPEED/100)^3.348) / 1000] × W_G + 0.4     (36)
     C_W  = 0.019 × W_G + 0.23                                          (37)
     R_x  = D_G/2 + C_R ;  W_x = W_G/2 + C_W ;  S_x = (C_W + C_R)/2   (38)
   with SPEED in mph and every length in inches.

   RADIAL tyres (p. 22, "Radial Tire Only Envelope"):
     C_R  = 0.029 × (D_G − D)^0.5 × (W_G − A)^0.5 × (SPEED/D_G)^0.5 + 0.15   (39)
     C_W  = 0.01 × W_G, 0.10 minimum                                          (40)
     R_x, W_x, S_x as (38)                                                     (41)
   where A is the rim width between flanges. THE GOODYEAR RADIAL TABLE
   PRINTS ITS OUTSIDE DIAMETER AND SECTION WIDTH ALREADY GROWN ("Grown
   Max", page 11, read this session), so for a radial D_G and W_G are the
   table's values and the growth step is NOT applied a second time. That is
   an interpretation of the two pages together and is stated in the result.

   The bay (§1.7c): (42) half-height ≥ R_x; (43) half-width per tyre ≥ W_x;
   (44) stowed length ≥ extended strut length − a retraction allowance. The
   strut LENGTH is not something this tool computes (G5 sizes the stroke,
   not the oleo length; LANDING-GEAR.md §4 says so), so (44) is reported as
   what it needs and left unevaluated rather than filled with a guess. The
   stowed cross-section per tyre, 2R_x × 2W_x, is computed; the volume is
   that times a length the reader supplies.

   Rotational inertia for the retraction and spin-up cases (p. 20, §6):
     k_tyre  = (Max OD + Min OD) / 5.12          (45)
     k_wheel = 0.40 × D_rim, ±20 %               (46)
   The radial table prints no minimum OD, so (45) is null for a radial and
   says so. The loads themselves (§25.729) need V_SR and are not computed.

   SPEED. The T&RA rule takes the aircraft's ground speed. This module uses
   the selected tyre's RATED speed, the largest ground speed the tyre may be
   run to and the number the book prints beside it; the caller may pass a
   lift-off speed instead. Which was used is reported.
   ═══════════════════════════════════════════════════════════════════════ */

export const G_W_BIAS = 1.04;
export const C_W_RADIAL_MIN_IN = 0.10;
export const K_TYRE_DIVISOR = 5.12;
export const K_WHEEL_FACTOR = 0.40;
export const K_WHEEL_TOLERANCE = 0.20;

/** (32)-(33) for a bias tyre; the radial table is already grown. */
export function grownEnvelope(tyre) {
  const D = tyre.rimDiaIn, W = tyre.widthMaxIn, DO = tyre.odMaxIn;
  if (![D, W, DO].every((v) => Number.isFinite(v) && v > 0)) {
    return { resolved: false, why: "the tyre row lacks a rim diameter, section width or outside diameter" };
  }
  if (tyre.radial) {
    return { resolved: true, radial: true, D, W_G: W, D_G: DO, H: (DO - D) / 2,
             G_H: null, G_W: null, AR: (DO - D) / (2 * W),
             basis: "Goodyear radial table prints OD and width GROWN (p. 11); no growth applied" };
  }
  const AR = Number.isFinite(tyre.aspect) ? tyre.aspect : (DO - D) / (2 * W);
  const H = (DO - D) / 2;
  const G_H = 1.115 - 0.075 * AR;
  return { resolved: true, radial: false, D, H, AR, G_H, G_W: G_W_BIAS,
           W_G: G_W_BIAS * W, D_G: D + 2 * G_H * H,
           basis: "T&RA bias growth, Goodyear data book 2018 p. 21, (32)-(35)" };
}

/** (36)-(38) bias, (39)-(41) radial. speedMph is the ground speed used. */
export function clearances(env, { speedMph, rimWidthIn }) {
  if (!env?.resolved) return { resolved: false, why: env?.why ?? "no envelope" };
  if (!(speedMph > 0)) return { resolved: false, why: "a ground speed in mph is needed" };
  const { W_G, D_G, D } = env;
  let C_R, C_W, rule;
  if (env.radial) {
    if (!(rimWidthIn > 0) || !(W_G > rimWidthIn)) {
      return { resolved: false, why: "the radial rule needs the rim width between flanges A, below the grown width" };
    }
    C_R = 0.029 * Math.sqrt(D_G - D) * Math.sqrt(W_G - rimWidthIn) * Math.sqrt(speedMph / D_G) + 0.15;
    C_W = Math.max(0.01 * W_G, C_W_RADIAL_MIN_IN);
    rule = "T&RA radial-only envelope, Goodyear data book 2018 p. 22, (39)-(41)";
  } else {
    C_R = ((17.02 + 2.61 * Math.pow(speedMph / 100, 3.348)) / 1000) * W_G + 0.4;
    C_W = 0.019 * W_G + 0.23;
    rule = "T&RA bias clearance, Goodyear data book 2018 p. 21, (36)-(38)";
  }
  return { resolved: true, speedMph, C_R, C_W,
           R_x: D_G / 2 + C_R, W_x: W_G / 2 + C_W, S_x: (C_W + C_R) / 2, rule };
}

/** (45)-(46). */
export function radiiOfGyration(tyre) {
  const kTyre = Number.isFinite(tyre.odMinIn) ? (tyre.odMaxIn + tyre.odMinIn) / K_TYRE_DIVISOR : null;
  const kWheel = Number.isFinite(tyre.rimDiaIn) ? K_WHEEL_FACTOR * tyre.rimDiaIn : null;
  return {
    kTyreIn: kTyre, kWheelIn: kWheel, kWheelToleranceFrac: K_WHEEL_TOLERANCE,
    kTyreNote: kTyre == null ? "the radial table prints no minimum OD, so (45) cannot be formed" : null,
    src: "Goodyear data book 2018 p. 20, section 6: (45) tyre assemblies, (46) wheel assemblies including rotating brake parts, approximate to +/-20 %",
  };
}

/**
 * The stowage envelope for one selected tyre.
 * @param sel  a resolved select*Tyre() result ({ tyre, tyres|legs*wheelsPerAxle })
 */
export function stowageOf(sel, { speedMph = null, tyresPerLeg = null } = {}) {
  if (!sel?.resolved || !sel.tyre) return { resolved: false, why: sel?.why ?? "no tyre was selected" };
  const t = sel.tyre;
  const env = grownEnvelope(t);
  if (!env.resolved) return { resolved: false, why: env.why, tyre: t };
  const speed = speedMph ?? t.speedMph;
  const speedBasis = speedMph != null ? "caller-supplied ground speed" : "the tyre's rated speed";
  const cl = clearances(env, { speedMph: speed, rimWidthIn: t.rimWidthIn });
  if (!cl.resolved) return { resolved: false, why: cl.why, tyre: t, envelope: env };
  const IN = 0.0254;
  const perTyre = {
    bayHalfHeightIn: cl.R_x, bayHalfWidthIn: cl.W_x, shoulderClearanceIn: cl.S_x,
    crossSectionIn2: (2 * cl.R_x) * (2 * cl.W_x),
    crossSectionM2: (2 * cl.R_x * IN) * (2 * cl.W_x * IN),
  };
  const n = tyresPerLeg ?? sel.wheelsPerAxle ?? sel.tyres ?? 1;
  return {
    resolved: true,
    tyre: { size: t.size, part: t.part, radial: !!t.radial, ply: t.ply, speedMph: t.speedMph,
            odMaxIn: t.odMaxIn, odMinIn: t.odMinIn, widthMaxIn: t.widthMaxIn,
            rimDiaIn: t.rimDiaIn, rimWidthIn: t.rimWidthIn, aspect: t.aspect },
    envelope: env,
    clearance: cl,
    speed: { mph: speed, basis: speedBasis },
    perTyre,
    perLeg: { tyres: n, bayWidthIn: n * 2 * cl.W_x, bayHeightIn: 2 * cl.R_x,
              crossSectionM2: n * perTyre.crossSectionM2 },
    bayLength: { evaluated: false,
                 rule: "(44) stowed length >= extended strut length - retraction allowance",
                 why: "the oleo LENGTH is not computed by this tool (G5 sizes the stroke); supply it to get a volume" },
    inertia: radiiOfGyration(t),
    requirement: "14 CFR 25.733(d), clearance at the maximum tyre size expected in service",
    caveats: [
      "SPEED in the clearance rule is " + speedBasis + "; a real bay is checked at the aircraft's maximum ground speed.",
      env.radial
        ? "Radial: the Goodyear table's OD and width are printed grown, so (32)-(33) are not applied again; that reading of pp. 11 and 22 together is an interpretation, stated here."
        : "Bias: growth per (32)-(35) with the printed aspect ratio; the T&RA note says radial tyres need less clearance, and this tyre is not one.",
      "The bay length and the stowed volume need a strut length this tool does not compute; only the cross-section is given.",
      "Retraction and spin-up LOADS (25.729) need V_SR and are not computed; the radii of gyration (45)-(46) are what they would start from.",
      "Centrifugal growth at speed is inside the T&RA clearance term, not modelled separately.",
    ],
  };
}
