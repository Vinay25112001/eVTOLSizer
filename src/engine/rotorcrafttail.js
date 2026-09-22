/* =====================================================================
   TAIL SIZING FOR A ROTOR-BORNE AIRCRAFT
   =====================================================================
   THE PROBLEM. This tool sized every tail from the fixed-wing volume
   coefficients

       S_ht = C_h S_w MAC / l        S_vt = C_v S_w b_w / l

   which need a wing area, a mean chord and a span. A helicopter has none
   of them, so the side-by-side was given nTail = 0 and drew no tail at
   all — while NASA's side-by-side concept vehicle plainly has a tail boom,
   a horizontal stabiliser and a fin, in every one of its four published
   views. The tool was not making a modelling choice; it had no method.

   THE METHOD IS PUBLISHED, AND IT IS NDARC'S. NASA/TP-20220000355,
   "NDARC NASA Design and Analysis of Rotorcraft Theory", Ch. 14
   *Empennage*, section 14-1 *Geometry*:

     "The tail volume can be referenced to rotor radius and disk area,
      V = S l/RA; to wing area and chord for horizontal tails,
      V = S l/S_w c_w; or to wing area and span for vertical tails,
      V = S l/S_w b_w. Here the tail length is l = |x_ht - x_cg| or
      l = |x_vt - x_cg| for horizontal tail or vertical tail."

   So the rotorcraft form is the FIRST one, and it is a definition rather
   than a correlation:

       S = V R A / l          A = pi R^2,  l = |x_tail - x_cg|

   Inverting it on a real aircraft gives V, and V is DIMENSIONLESS — which
   is what makes it measurable off a published three-view, because the
   pixel scale cancels exactly.

   ── V MEASURED ON THE REFERENCE VEHICLE ───────────────────────────────
   AIAA 2018-3847 Fig. 4, the side-by-side concept vehicle. Plan view, in
   pixels of the extracted figure:

       rotor radius R      375      (both rotors independently: 375, 375)
       hub separation      636      -> l/D 0.849, the overlap measured before
       rotor x station     992      = x_cg, see below
       stabiliser span     220      chord 63   -> S = 13,860
       stabiliser centroid 1691     -> tail arm l = 699

       V_ht = S l / (R A) = 13860 * 699 / (375 * pi * 375^2) = 0.0586

   x_cg IS NOT ASSUMED. A helicopter in hover must carry its centre of
   gravity essentially under the rotor thrust vector or it cannot trim; on
   a side-by-side both rotors share one x station, so the CG lies at that
   station. That is a trim requirement, not a guess.

   The vertical fin is measured off the side elevation and is MUCH weaker:
   it is small and partly merged with the tail boom in the drawing.
   Exposed fin chord ~56 px, height ~46 px clear of the boom, so
   S_vt ~ 2,576 and V_vt ~ 0.0109. Carried with that uncertainty stated,
   and it matters less than it looks: two counter-rotating rotors produce
   no net torque, so this fin is for cruise yaw stability, not anti-torque.

   ── SCOPE, DELIBERATELY NARROW ────────────────────────────────────────
   This applies to the side-by-side and to nothing else. NASA's quadrotor
   concept has NO tail — confirmed in both its three-view (AIAA 2018-3847
   Fig. 1) and the concept-vehicle renderings — so a multicopter correctly
   gets none, and giving one to every rotor-borne layout would be inventing
   aircraft rather than modelling them.

   ONE VEHICLE IS ONE VEHICLE. V here is measured from a single published
   aircraft, and off a rendered figure rather than a parametric model. It
   is the aircraft this configuration IS, which is the strongest anchor
   available, but it is not a population and this file does not pretend
   otherwise.
   ===================================================================== */

/** NDARC 14-1 rotor-referenced tail volumes, measured on AIAA 2018-3847 Fig. 4. */
export const ROTORCRAFT_TAIL_VOLUME = {
  sideBySide: {
    Vh: 0.0586,      // horizontal stabiliser, plan view, well resolved
    Vv: 0.0109,      // fin, side elevation, partly merged with the boom
    src: "NDARC Theory NASA/TP-20220000355 sec. 14-1 (V = S l/RA); "
       + "V measured on AIAA 2018-3847 Fig. 4",
    note: "stabiliser span 220 px / chord 63 px, arm 699 px, R 375 px",
  },
};

/**
 * Tail areas for a rotor-borne layout, by NDARC's rotor-referenced volume.
 * @param configType  layout key
 * @param R           rotor radius, m
 * @param armM        tail arm |x_tail - x_cg|, m
 * @returns {Sh, Sv, Vh, Vv, src} in m^2, or null where the layout has no tail
 */
export function rotorcraftTailArea(configType, R, armM) {
  const V = ROTORCRAFT_TAIL_VOLUME[configType];
  const Rm = Number(R), l = Number(armM);
  if (!V || !isFinite(Rm) || !isFinite(l) || Rm <= 0 || l <= 0) return null;
  const A = Math.PI * Rm * Rm;
  return {
    Sh: (V.Vh * Rm * A) / l,
    Sv: (V.Vv * Rm * A) / l,
    Vh: V.Vh, Vv: V.Vv, R: Rm, arm: l, diskArea: A, src: V.src,
  };
}

/**
 * The tail arm this layout can actually offer: from the rotor station (which
 * is the CG, by the hover trim requirement above) to a station near the tail
 * of the body. Measured on the same figure as a fraction of rotor radius, so
 * it scales with the aircraft rather than with an assumed fuselage length:
 * arm 699 px / R 375 px = 1.864 R.
 */
export const SBS_TAIL_ARM_OVER_R = 1.864;

/* =====================================================================
   A HELICOPTER'S LENGTH IS SET BY ITS ROTOR, NOT BY A FINENESS RATIO
   =====================================================================
   The tail needs an arm, the arm needs a boom, and the boom is why a
   helicopter is long. This tool gave the side-by-side fusLen = fineness x
   fusDiam = 7.21 m against a 4.47 m rotor radius — 1.61 R, with the rotors
   at mid-length, leaving 0.80 R of body behind them. NASA's has 1.87 R of
   arm alone. There was physically nowhere to put a tail, which is the real
   reason nTail was 0.

   MEASURED on the same figure (AIAA 2018-3847 Fig. 4 plan view), taking
   only the fuselage band between the two rotor hubs so the rotor blades and
   the axis legend cannot contaminate it:

       nose            x = 647 px
       rotor station   x = 992 px
       tail tip        x = 1723 px
       rotor radius    R = 375 px

       body length     1076 px = 2.87 R
       nose -> rotor    345 px = 0.92 R   (32.1% of body length)
       rotor -> tail    731 px = 1.95 R
       stabiliser arm   699 px = 1.865 R

   Expressed in R because that is what physically sets them: the boom must
   carry the empennage out of the rotor wake and give it a useful moment
   arm, and both distances scale with the rotor, not with cabin width. At
   NASA's R = 4.541 m these give a 13.04 m aircraft with an 8.47 m tail arm,
   which is the aircraft their drawing shows. */
export const SBS_BODY_LEN_OVER_R  = 2.87;    // nose to tail tip

/** Per-layout body length in rotor radii. Only layouts with a measured
    reference appear; everything else keeps its fineness-driven length. */
export const ROTORCRAFT_BODY_LEN_OVER_R = { sideBySide: SBS_BODY_LEN_OVER_R };
export const SBS_ROTOR_STATION    = 0.321;   // rotor x, as a fraction of body length
