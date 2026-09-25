/* =====================================================================
   OSWALD SPAN EFFICIENCY — COMPUTED, NOT ASSUMED
   =====================================================================
   e was a flat input defaulting to 0.85, and it ranked THIRD of thirteen in
   validation/unverified-leverage.mjs at 6.9% of MTOW across its plausible
   range. A wing's span efficiency is not a free constant: it follows from
   the planform.

   [SRC] Howe, D., "Aircraft Conceptual Design Synthesis" (2000) eq.6.14a,
   reproduced as eqs.13.26-13.27 of Scholz, D., "Aircraft Design", HAW
   Hamburg / HOOU open courseware, ch.13 "Drag":

     "According to Howe 2000 (equation 6.14a), the Oswald factor e can be
      estimated for the subsonic range and for transonic flows (M < 0.95)
      for aircraft with a wing aspect ratio of A > 5 from

          e = 1 / { (1 + 0.12 M^6)
                    [ 1 + (0.142 + f(L) A (10 t/c)^0.33)/(cos Phi_25)^2
                        + 0.1 (3 Ne + 1)/(4 + A)^0.8 ] }

      In this equation M is the flight Mach number, A is the (effective)
      aspect ratio, t/c is the relative airfoil thickness, Phi_25 is the wing
      sweep of the 25% line, Ne is the number of engines on the wing (if
      none, then Ne = 0).

          f(L) = 0.005 (1 + 1.5 (L - 0.6)^2)

      In this equation L is the wing taper. A typical value for f(L) is
      0.0062."

   So e depends on aspect ratio, taper, thickness, sweep and Mach — every one
   of which this engine already knows. At the tool's defaults (A 9, taper
   0.45, t/c 0.15, M 0.15, unswept, no wing-mounted engines) it returns 0.828
   against the 0.85 that was assumed.

   Ne = 0 HERE, AND THAT IS PHYSICS RATHER THAN AN OMISSION. Howe's term
   describes the interference of podded engine NACELLES on a wing. A
   distributed-electric eVTOL carries rotors on booms, not turbofan pods, and
   no source in the corpus extends the term to them. Applying it would be a
   transfer, not a citation; it is exposed as an input so a configuration
   with genuine wing-mounted nacelles can declare them.

   OUT OF DOMAIN IS REPORTED, NOT EXTRAPOLATED. Howe states A > 5 and
   M < 0.95. Below or above that the fit is outside its stated range, and
   this says so rather than returning a number that looks like the others. */
export const OSWALD_MIN_AR = 5;     // [SRC] Howe via Scholz: "aspect ratio of A > 5"
export const OSWALD_MAX_MACH = 0.95; // [SRC] same: "transonic flows (M < 0.95)"

export function oswaldTaperTerm(taper) {
  return 0.005 * (1 + 1.5 * (taper - 0.6) ** 2);
}

export function oswaldEfficiency({ AR, taper, tc, mach = 0, sweep25Deg = 0, nWingEngines = 0 }) {
  const inDomain = AR > OSWALD_MIN_AR && mach < OSWALD_MAX_MACH
    && taper > 0 && tc > 0 && Number.isFinite(AR);
  if (!(AR > 0) || !(taper > 0) || !(tc > 0)) return { e: null, inDomain: false };
  const cos2 = Math.cos(sweep25Deg * Math.PI / 180) ** 2;
  const planform = (0.142 + oswaldTaperTerm(taper) * AR * Math.pow(10 * tc, 0.33)) / cos2;
  const nacelle = 0.1 * (3 * nWingEngines + 1) / Math.pow(4 + AR, 0.8);
  const e = 1 / ((1 + 0.12 * mach ** 6) * (1 + planform + nacelle));
  return { e, inDomain };
}

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
