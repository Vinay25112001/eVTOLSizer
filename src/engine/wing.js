/* =====================================================================
   WING AREA — sized by constraint, not by asserting a cruise CL
   =====================================================================
   WHAT WAS WRONG

       Swing = 2*W / (rho * vCruise^2 * clDesign)      // clDesign fixed at 0.55

   This asserts that every aircraft cruises at CL = 0.55, which makes wing area
   a pure function of cruise speed: S ~ 1/V^2. The consequences were severe and
   went in opposite directions for different aircraft.

   Measured against published data, with clDesign = 0.55:

     aircraft   published span   engine span   engine W/S     published W/S
     Joby S4        11.8 m         8.96 m      249 kg/m^2      ~155 kg/m^2
     Archer         14.3 m        13.08 m      139 kg/m^2      ~140 kg/m^2
     NASA L+C       "large"       29.13 m       53 kg/m^2         --

   Joby's wing came out 42% too small in area. The reason is that its entry
   uses 200 mph — its MAXIMUM speed — as the cruise point, and forcing CL = 0.55
   at max speed shrinks the wing. Joby's real cruise CL is about 0.34.

   WHY THAT POISONED FAR MORE THAN THE WING.

   Every parasite-drag term in the engine is referenced to wing area, and the
   wetted areas scale with it too, so a wrong wing area corrupts the ABSOLUTE
   drag area, not merely its non-dimensional form. Checked against the NDARC
   correlation D/q = k(W/1000)^(2/3) (NASA TP-20220000355 section 8-11), where
   k = 1.4 turboprop, 1.6 tiltrotor, 2.5 low-drag helicopter, 9 old helicopter:

       Joby      k = 1.00   "below turboprop — implausibly clean"
       Archer    k = 3.51   "helicopter class"
       NASA L+C  k = 6.62   "helicopter class"

   Three winged eVTOLs spanning implausibly-clean to old-helicopter. They should
   all sit near 1.6-2.5. That spread is the wing-area error, and it is why L/D
   and therefore cruise power and pack energy were wrong.

   THE CORRECT METHODOLOGY

   Wing loading is a top-level design choice made on a constraint diagram
   (Raymer ch.5), not an output of asserting a cruise CL. Two constraints bound
   it here:

     1. the chosen design wing loading W/S;
     2. cruise CL must stay below the drag-rise/buffet region — at some point a
        slow aircraft simply needs more wing.

   The wing takes the LARGER area the two demand:

       S = max( W / (W/S)_design ,  W / (q * CL_cruise_max) )

   and the cruise CL is then DERIVED from the wing the aircraft actually has:

       CL_cruise = W / (q * S)

   That derivation matters beyond the wing. Previously CDi = clDesign^2/(pi AR e)
   was the SAME NUMBER for every design in the sweep, because the wing had been
   sized to force it — induced drag carried no information at all.

   This also matches NASA's own statement of what sets wing area on a lift+cruise
   aircraft (Johnson & Silva 2022, section 6.3): "The design hover CT/sigma must
   be low enough and the wing area large enough that transition from rotor-borne
   to wing-borne flight is possible over a reasonable speed range."
   ===================================================================== */

/* Design wing loading, N/m^2.  [CAL]
   Anchored on the two aircraft with published spans:
     Joby S4        2404 kg / (11.8^2/9) m^2 = 1524 N/m^2
     Archer Midnight 3175 kg / (14.3^2/9) m^2 = 1371 N/m^2
   Both assume the baseline AR of 9, which is itself an assumption — the spans
   are published, the areas are not. The midpoint is used. Treat this as
   calibrated-to-two-aircraft, not as a published constant. */
export const WING_LOADING_DEFAULT_NM2 = 1450;

/* Maximum cruise CL before the wing is considered too heavily loaded to cruise
   efficiently. Well below CL_max (~1.5); a wing cruising above this is close
   enough to buffet that trim drag and margin to stall both suffer. [LAY] */
export const CL_CRUISE_MAX_DEFAULT = 0.90;

/**
 * @param p  parameter set
 * @param W  weight in newtons (MTOW * g)
 * @param q  cruise dynamic pressure, Pa
 */
export function wingArea(p, W, q) {
  /* Legacy mode: reproduce the original fixed-CL sizing exactly. Retained so a
     saved design can be re-opened with its original geometry, and so the change
     above is auditable rather than merely asserted. */
  if (p.wingSizedBy === "cl") {
    const S = 2 * W / (2 * q) / p.clDesign;   // = W/(q*clDesign)
    return { Swing: S, driver: "fixed cruise CL (legacy)", S_ws: S, S_cl: S };
  }

  const WS      = p.wingLoadingNm2 ?? WING_LOADING_DEFAULT_NM2;
  const CLmaxCr = p.clCruiseMax ?? CL_CRUISE_MAX_DEFAULT;

  const S_ws = W / Math.max(1e-6, WS);          // from the design wing loading
  const S_cl = W / Math.max(1e-6, q * CLmaxCr); // from the cruise-CL ceiling

  const Swing = Math.max(S_ws, S_cl);
  return {
    Swing,
    S_ws, S_cl,
    driver: S_cl > S_ws ? "cruise-CL ceiling (slow for this wing loading)"
                        : "design wing loading",
  };
}
