/* =====================================================================
   STANDARD ATMOSPHERE TO 20 KM — for jets
   =====================================================================
   The eVTOL engine's makeISA (src/engine/atmosphere.js) is the
   troposphere only: its temperature keeps falling above 11,000 m, which no
   eVTOL reaches but a jet cruising at 41,000 ft does (it gave 207 K, not
   216.65 K). This is the same model up to the tropopause and the ICAO
   isothermal layer above it (ICAO Doc 7488):
      T = T11 = T0 − 11,000 L
      P = P11 exp(−G0 (h − 11,000)/(R T11))
   with the engine's own constants, so it joins the troposphere exactly.
   A temperature deviation shifts T and leaves P alone, as in makeISA.
   ===================================================================== */

import { makeISA } from "../../engine/atmosphere.js";
import { G0, GAMMA, R_GAS } from "../../engine/constants.js";

export const TROPOPAUSE_M = 11000;

export function makeJetISA(deltaISA = 0) {
  const lower = makeISA(deltaISA);
  const top = makeISA(0)(TROPOPAUSE_M);
  return function isa(hMetres) {
    const h = Math.max(0, hMetres || 0);
    if (h <= TROPOPAUSE_M) return lower(h);
    const P = top.P * Math.exp(-G0 * (h - TROPOPAUSE_M) / (R_GAS * top.T));
    const T = top.T + deltaISA;
    return { T, P, rho: P / (R_GAS * T), a: Math.sqrt(GAMMA * R_GAS * T) };
  };
}
