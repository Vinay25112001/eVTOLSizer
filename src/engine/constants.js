/* =====================================================================
   PHYSICAL CONSTANTS
   =====================================================================
   These are the eVTOL engine's constants. They are NOT the only place a
   physical constant is written in this tree: the aircraft, transport,
   turboprop and drone classes each open with their own compact preamble
   of unit factors and constants, because each is a self-contained port of
   a published method and reads better next to the formulae it serves. The
   header here used to claim to be the single source of truth, which was
   not true and had not been true for a long time. What holds the tree
   together is not this file, it is validation/constants.mjs, which reads
   every source file and requires that a constant written in more than one
   place carry the SAME VALUE in all of them.

   GRAVITY WAS THE DEFECT THAT PROMPTED THAT GATE. G0 here was 9.81 while
   ten other modules wrote 9.80665, and the split ran INSIDE a single
   class: classes/transport/atmosphere.js imports G0 for its barometric
   formula while size.js, takeoff.js, landing.js and mission.js use
   9.80665, so one aeroplane was sized under two gravities depending on
   which module you were in. 9.81 carried no citation anywhere in the repo.

   9.80665 IS THE DEFINED VALUE, and the sources this tool already relies
   on all state it:
     - NACA TR-824, notation list: "Standard acceleration of gravity =
       9.80665 m/s2".
     - NDARC Theory (NASA TP-2015-218751, R1.13) p.1-6, "reference
       gravitational acceleration (9.80665 m/sec2)", and its constants
       table, "g  9.80665 m/sec2  32.17405 ft/sec2".
     - Loftin (NASA RP-1060) Table 1.II converts g units by 9.80665.
     - Airbus, Getting to Grips with Aircraft Performance (2002) s1.1:
       the ISA aerostatic equation dP = -rho g dh is written with
       g0 = 9.80665 m/s2. This is the one that settles atmosphere.js — an
       atmosphere built on 9.81 is not implementing the ISA.

   Adopting it moved 18,069 values across 220 fields, MTOW on 170 cases,
   by 0.035% (app-default MTOW 2799.45 -> 2798.46 kg). That is far below
   this tool's ~9% mean absolute error and changes no conclusion; it was
   done because a tool whose thesis is provenance should not size one
   aeroplane with two gravities, and should use the value its own
   references define.
   ===================================================================== */

export const G0      = 9.80665;   // standard gravity, m/s^2 — exact by definition; see header
export const RHO_MSL = 1.225;     // ISA sea-level density, kg/m^3
export const T0      = 288.15;    // ISA sea-level temperature, K
export const LAPSE   = 0.0065;    // ISA tropospheric lapse rate, K/m
/* ── THE SPECIFIC GAS CONSTANT IS NOT A FREE CHOICE ───────────────────
   R_GAS was 287, and 287 is not merely imprecise here — it made THIS FILE
   contradict itself. P0, RHO_MSL and T0 are all declared above, and the
   ideal gas law ties the four together: with R = 287,
       P0 / (R * T0) = 101325 / (287 * 288.15) = 1.225226 kg/m^3
   against the RHO_MSL = 1.225 declared two lines up. Four numbers, and
   they could not all be true at once. An engine cannot hold a sea-level
   density that its own pressure, temperature and gas constant deny.

   THE VALUE IS DERIVED, NOT LOOKED UP. NDARC Theory's constants table
   (NASA TP-2015-218751 R1.13) publishes p0 = 101325 N/m2, rho0 = 1.225
   kg/m3 and T0 = 288.15 K but no R, so R is what those three imply:
       R = p0 / (rho0 * T0) = 287.052874 J/(kg*K)
   and 287.05287 reproduces that to every digit the rounded rho0 supports.

   IT IS THEN CONFIRMED BY A NUMBER NOT USED IN THE DERIVATION. The same
   NDARC table publishes the sea-level speed of sound, cs0 = 340.294
   m/sec. sqrt(GAMMA * R * T0) gives 340.2940 at 287.05287 — exact — and
   340.2626 at 287, which misses NDARC's published figure by 0.03 m/s.
   So the table refutes 287 twice over, once through density and once
   through the speed of sound, and neither route was fitted to the other.

   Airbus (Getting to Grips with Aircraft Performance, 2002, s1.1) and
   Lucht (HAW Hamburg, TOFL) both write 287.053, which is this same value
   at six significant figures. The drone sizer separately carried 287.058,
   a third value with no citation of its own; it is gone.
   ===================================================================== */
export const R_GAS   = 287.05287; // specific gas constant for air, J/(kg*K) — derived; see above
export const GAMMA   = 1.4;       // ratio of specific heats
/* ── THE COEFFICIENT WAS THE WRONG QUANTITY, NOT THE WRONG NUMBER ──────
   MU0 read 1.47e-5 under the label "reference dynamic viscosity, Pa*s".
   1.47e-5 is not the dynamic viscosity of air at sea level. It is very
   nearly the KINEMATIC viscosity: Sutherland's law (White, Viscous Fluid
   Flow 3e, eq. 1-36, mu = 1.458e-6 T^1.5/(T+110.4)) gives

       mu(288.15 K)      = 1.789380e-5 Pa*s   [ICAO Doc 7488 tabulates 1.7894e-5]
       nu  = mu/rho      = 1.460719e-5 m2/s

   so the shipped value sat 17.8 % BELOW dynamic and within 0.64 % of
   kinematic. It was then consumed as a dynamic viscosity in Re = rho V L / mu
   at five sites in engine.js, making every Reynolds number in the tree 21.7 %
   high and every Prandtl-Schlichting Cf about 3 % low, which understates
   parasite drag.

   THE LAW IT FEEDS IS A DYNAMIC-VISCOSITY LAW, so the formula was right and
   only the coefficient was wrong. Over 288.15 -> 216.65 K, viscosity() in
   atmosphere.js gives (T/T0)^0.75 = 0.80743 against Sutherland's 0.79447 --
   1.6 % apart. The true KINEMATIC ratio over the same interval is 2.67431,
   off by 3.3x. A kinematic coefficient cannot be what this law transports.

   1.789e-5 agrees with Sutherland to 0.02 % and is the value the tree already
   carried under the same label in two other places (engine/noise.js and
   export/report.js), so this makes it ONE value rather than three sites and
   two numbers. validation/constants.mjs now pins it by RELATION -- Sutherland
   evaluated at T0 -- rather than by its digits, the same instrument already
   used for R_GAS above. [SRC] White 3e eq.1-36; ICAO Doc 7488 */
export const MU0     = 1.789e-5;  // reference dynamic viscosity at T0, Pa*s
export const P0      = 101325;    // ISA sea-level static pressure, Pa


/* ── FUSELAGE WETTED AREA, VALID AT ANY FINENESS ──────────────────────
   Raymer's fineness-corrected form  S = pi D L (1 - 2/lf)^(2/3) (1 + 1/lf^2)
   is a fit for STREAMLINED bodies. It goes to ZERO at lf = 2 and returns NaN
   below it, and at lf 2.44 -- the VoloCity's published 3.9 x 1.6 m pod -- it
   gives 7.3 m2 for a body whose bare cylinder is 19.6 m2. That is not a
   small error, it is a formula outside its domain. It was in the DRAG path
   already (engine.js) and was brought into the WEIGHT path on 2026-09-06 to
   stop the two modules using different areas for one body -- at which point
   the VoloCity check, an independent production-aircraft comparison, fell
   from a 975/798 kg bracket to a 492 kg fraction-model fallback in BOTH of
   its cases, because a stubby pod's wetted area had become ~7 m2.

   Below the fit's domain the honest area is GEOMETRIC: a prolate spheroid of
   length L and diameter D has the closed-form surface
       S = 2 pi b^2 ( 1 + (a / (b e)) asin(e) ),  a = L/2, b = D/2,
       e = sqrt(1 - b^2/a^2)
   which is exact, finite at every lf >= 1, and equals the sphere at lf = 1.
   It is used where Raymer is not valid. The switch is at lf = 2.5 [LAY]:
   Raymer's form has collapsed to under half the geometric area by then and
   is within ~15% of it above ~4. The two forms do not meet, so there is a
   step at the threshold; it is stated rather than smoothed, because a blend
   would be a number nobody chose. Above 2.5 nothing changes -- the app's
   7.2 x 1.65 m default (lf 4.36) and every NASA benchmark vehicle stay on
   Raymer exactly as before. */
export const FUSELAGE_RAYMER_MIN_FINENESS = 2.5;   // [LAY] below this Raymer is invalid
export function fuselageWettedArea(L, D) {
  const len = Math.max(0.1, Number(L) || 0), dia = Math.max(0.1, Number(D) || 0);
  const lf = len / dia;
  if (lf > FUSELAGE_RAYMER_MIN_FINENESS)
    return Math.PI * dia * len * Math.pow(1 - 2 / lf, 2 / 3) * (1 + 1 / (lf * lf));
  const a = Math.max(len, dia) / 2, b = Math.min(len, dia) / 2;
  if (a - b < 1e-9) return 4 * Math.PI * b * b;                     // a sphere
  const e = Math.sqrt(1 - (b * b) / (a * a));
  return 2 * Math.PI * b * b * (1 + (a / (b * e)) * Math.asin(e));
}
