/* =====================================================================
   TRAINER PERFORMANCE — Loftin, NASA RP-1060 (1980), Chapter 6
   =====================================================================
   Propeller-driven light aircraft. Pounds, feet, knots, horsepower.
   Equations read from the rendered pages of RP-1060 (public domain):
     (6.14)-(6.15) p.341  climb: h' = 33000 [η P/W − √(W/S)/(19 (CL^1.5/CD) √σ)]
     (6.20)        p.343  (CL^1.5/CD)max = 1.345 (A e)^0.75 / CD0^0.25, which is
                          the maximum of the parabolic polar (checked by
                          differentiation: (3π)^0.75/4 = 1.346)
     (6.39)-(6.40) p.364  Breguet range R = 375 (η/c)(L/D) ln[1/(1 − Wf/Wg)],
                          R in statute miles, c in lb/hp/h
     Fig. 6.28     p.374  power ratio with altitude, unsupercharged engine
   ===================================================================== */

import { makeISA } from "../../engine/atmosphere.js";

export const FT = 0.3048;
export const KT_FPS = 1.6878099;     // ft/s per knot
export const NM_PER_SM = 1 / 1.1507794;
export const RHO_SL_SLUG = 0.0023769;
const isa = makeISA(0);
const RHO_SL_SI = isa(0).rho;

export const densityRatio = (altFt) => isa(altFt * FT).rho / RHO_SL_SI;
export const machOf = (vKt, altFt) => vKt * 0.514444 / isa(altFt * FT).a;

/* Loftin Fig. 6.28, read from the rendered figure at 4,000 ft steps
   (reading precision about ±0.01). The curve agrees with the widely used
   1.132σ − 0.132 at every point, but that form's original source is not in
   the library, so the figure is what is cited and interpolated. */
const LAPSE_FIG_6_28 = [[0, 1.00], [4000, 0.87], [8000, 0.75], [12000, 0.645],
                        [16000, 0.55], [20000, 0.47], [24000, 0.40]];
export function pistonPowerRatio(altFt) {
  const t = LAPSE_FIG_6_28;
  if (altFt <= 0) return 1;
  if (altFt >= t[t.length - 1][0]) return NaN;   // outside the figure
  for (let i = 1; i < t.length; i++) {
    if (altFt <= t[i][0]) {
      const [h0, r0] = t[i - 1], [h1, r1] = t[i];
      return r0 + (r1 - r0) * (altFt - h0) / (h1 - h0);
    }
  }
  return NaN;
}

export const dynamicPressure = (vKt, altFt) => 0.5 * RHO_SL_SLUG * densityRatio(altFt) * (vKt * KT_FPS) ** 2;

export function polar({ CD0, AR, e }) {
  const k = 1 / (Math.PI * AR * e);
  return {
    CD: (CL) => CD0 + k * CL * CL,
    LDmax: 0.5 / Math.sqrt(CD0 * k),
    climbParamMax: 1.345 * (AR * e) ** 0.75 / CD0 ** 0.25,
    CLminPower: Math.sqrt(3 * CD0 / k),
  };
}

/* Shaft horsepower to fly level at a speed and altitude. */
export function levelFlight({ weightLb, wingAreaFt2, vKt, altFt, pol, eta }) {
  const q = dynamicPressure(vKt, altFt);
  const CL = weightLb / (q * wingAreaFt2);
  const CD = pol.CD(CL);
  const dragLb = q * wingAreaFt2 * CD;
  return { CL, CD, LD: CL / CD, dragLb, shaftHp: dragLb * vKt * KT_FPS / (550 * eta) };
}

/* Loftin (6.15) solved for the power loading that gives a rate of climb. */
export function climbPowerRequired({ weightLb, wingLoading, rocFpm, altFt, pol, eta }) {
  const sigma = densityRatio(altFt);
  const pOverW = (rocFpm / 33000 + Math.sqrt(wingLoading) / (19 * pol.climbParamMax * Math.sqrt(sigma))) / eta;
  return pOverW * weightLb;
}

export function rateOfClimb({ weightLb, wingLoading, hp, altFt, pol, eta }) {
  const sigma = densityRatio(altFt);
  return 33000 * (eta * hp / weightLb - Math.sqrt(wingLoading) / (19 * pol.climbParamMax * Math.sqrt(sigma)));
}

/* Stall: W/S = ½ ρ V² CLmax (the relation behind Loftin 6.8). */
export const stallWingLoading = ({ vsKt, clMax, altFt = 0 }) =>
  0.5 * RHO_SL_SLUG * densityRatio(altFt) * (vsKt * KT_FPS) ** 2 * clMax;
export const stallSpeedKt = ({ wingLoading, clMax, altFt = 0 }) =>
  Math.sqrt(2 * wingLoading / (RHO_SL_SLUG * densityRatio(altFt) * clMax)) / KT_FPS;

/* Breguet (6.40): fuel burned over a range, and range from fuel. */
export function breguetFuel({ rangeNm, startWeightLb, eta, sfc, LD }) {
  const rangeSm = rangeNm / NM_PER_SM;
  const endWeight = startWeightLb * Math.exp(-rangeSm * sfc / (375 * eta * LD));
  return startWeightLb - endWeight;
}
export function breguetRangeNm({ fuelLb, startWeightLb, eta, sfc, LD }) {
  return 375 * (eta / sfc) * LD * Math.log(startWeightLb / (startWeightLb - fuelLb)) * NM_PER_SM;
}
