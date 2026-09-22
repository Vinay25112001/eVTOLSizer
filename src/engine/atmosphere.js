/* =====================================================================
   ATMOSPHERE
   ISA with temperature deviation. See derivation notes inside.
   ===================================================================== */

import { G0, T0, LAPSE, R_GAS, GAMMA, MU0, P0 } from "./constants.js";

/* Returns a function h(metres) -> { T, P, rho, a } for a given ISA deviation.

   A hot day does not change the pressure profile, only the temperature, so
   density comes from the gas law at the ACTUAL temperature:
      T_std(h) = T0 - L*h
      P(h)     = P0*(T_std/T0)^(G0/(L*R))     independent of deltaISA
      T(h)     = T_std(h) + deltaISA
      rho(h)   = P(h)/(R*T(h))
   Scaling a fixed 1.225 by a temperature ratio (the previous approach) leaves
   sea-level density untouched on a hot day and is wrong in sign.
   Ref: ICAO Doc 7488, Manual of the ICAO Standard Atmosphere. */
export function makeISA(deltaISA = 0) {
  return function isa(hMetres) {
    const h = Math.max(0, hMetres || 0);
    const Tstd = T0 - LAPSE * h;
    const P = P0 * Math.pow(Tstd / T0, G0 / (LAPSE * R_GAS));
    const T = Tstd + deltaISA;
    return { T, P, rho: P / (R_GAS * T), a: Math.sqrt(GAMMA * R_GAS * T) };
  };
}

/* Dynamic viscosity via power law on absolute temperature. */
export const viscosity = (T) => MU0 * Math.pow(T / T0, 0.75);

/* ── SIZING DAY ─────────────────────────────────────────────────────────
   A VTOL is sized by its HOT-AND-HIGH condition, not by a standard sea-level
   day: reduced density cuts rotor thrust and raises hover power, which is the
   governing power condition. The engine defaulted to field elevation 0 and
   ISA+0, which is the least demanding day possible.

   NASA UAM primary sizing mission (Johnson & Silva 2022, section 5):
     "All the segments are flown at atmospheric conditions of 5,000-ft altitude
      and ISA+20 C."
   and the alternate: "A second sizing mission has these segments flown at sea
   level and ISA+20 C."

   Note it says ALL SEGMENTS — so this sets the cruise altitude as well as the
   field elevation, not just the vertiport. */
export const SIZING_DAYS = {
  "nasa-uam": { fieldElevM: 1524, cruiseAltM: 1524, deltaISA: 20,
    label: "NASA UAM primary — 5,000 ft / ISA+20",
    src: "Johnson & Silva, Aeronautical Journal 126(1295) 2022, section 5" },
  "nasa-sl":  { fieldElevM: 0, cruiseAltM: 0, deltaISA: 20,
    label: "NASA UAM alternate — sea level / ISA+20",
    src: "Johnson & Silva 2022, section 5 (second sizing mission)" },
  "sl-isa":   { fieldElevM: 0, cruiseAltM: null, deltaISA: 0,
    label: "Sea level / ISA+0 — marketing-spec day, NOT a sizing condition",
    src: "no standard; what manufacturers usually quote range against" },
};

/* Resolve the sizing day into explicit conditions. Returns the parameter set
   the rest of the engine should use. Leaves p untouched when no day is named,
   so existing designs are unaffected. */
export function applySizingDay(p) {
  const d = SIZING_DAYS[p.sizingDay];
  if (!d) return p;
  return {
    ...p,
    fieldElev: d.fieldElevM,
    cruiseAlt: d.cruiseAltM != null ? d.cruiseAltM : p.cruiseAlt,
    deltaISA:  d.deltaISA,
  };
}

/* The three atmospheric points every sizing run needs. */
export function atmosphereSet(p) {
  const isa = makeISA(p.deltaISA || 0);
  const fieldElev = p.fieldElev || 0;
  return {
    isa,
    fieldElev,
    cruise: isa(p.cruiseAlt),
    hover:  isa(fieldElev + (p.hoverHeight || 15.24)),   // hover is ABOVE the vertiport
    field:  isa(fieldElev),
  };
}
