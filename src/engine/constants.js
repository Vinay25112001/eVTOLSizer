/* =====================================================================
   PHYSICAL CONSTANTS
   Single source of truth. Previously redeclared inside several functions.
   ===================================================================== */

export const G0      = 9.81;      // gravitational acceleration, m/s^2
export const RHO_MSL = 1.225;     // ISA sea-level density, kg/m^3
export const T0      = 288.15;    // ISA sea-level temperature, K
export const LAPSE   = 0.0065;    // ISA tropospheric lapse rate, K/m
export const R_GAS   = 287;       // specific gas constant for air, J/(kg*K)
export const GAMMA   = 1.4;       // ratio of specific heats
export const MU0     = 1.47e-5;   // reference dynamic viscosity, Pa*s
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
