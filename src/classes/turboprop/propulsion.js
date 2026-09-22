/* =====================================================================
   TURBOPROP PROPULSION GROUP — engine, engine section, propeller
   =====================================================================
   FLOPS (NASA/TM-2017-219627) sizes a thrust-rated propulsion group only:
   it has no shaft-power engine weight and no propeller weight (METHODS.md
   §5.4). These replace it for a turboprop, from GASP (NASA CR-152303
   Vol V) and Hamilton Standard (NASA CR-114399); both pages were read as
   rendered images.

     engine            W_ENG = SW_SLS × HP_MSLS                     (V.1.4)
                       SW_SLS = 0.5 lb/hp for turboprops unless input (V.1.3)
     engine section    W_PES = SK_PES × W_ENG, "SK_PES is input as .338,
                       typically" (nacelle and pylon structure)     (V.1.56)
     propeller         W_T = K_W [(D/10)² (B/4)^0.7 (AF/100)^u (ND/20000)^v
                              (SHP/10D²)^0.12 (M+1)^0.5] + C_W,
                       C_W = y (D/10)² B (AF/100)² (20000/ND)^0.3
                       CR-114399 Table II, p.26: lb, D ft, N take-off rpm,
                       SHP take-off, M at maximum-power cruise. Excludes
                       spinner, de-icing and governor.
   ===================================================================== */

/* CR-114399 Table II, propeller types (1)-(5). The 1970-technology column
   uses type (3) for aircraft classes III-V; the 1980 column uses (5) for
   class V. */
export const PROPELLER_TYPES = Object.freeze({
  1: { kw: 170, u: 0.9, v: 0.35, y: 0,   label: "(1) fixed pitch" },
  2: { kw: 200, u: 0.9, v: 0.35, y: 0,   label: "(2) McCauley constant speed, non-feathering" },
  3: { kw: 220, u: 0.7, v: 0.40, y: 5.0, label: "(3) Hartzell / Hamilton Standard, counterweighted, feathering" },
  4: { kw: 190, u: 0.7, v: 0.40, y: 3.5, label: "(4) fibreglass, counterweighted, feathering" },
  5: { kw: 190, u: 0.7, v: 0.30, y: 0,   label: "(5) fibreglass, double-acting, feathering, reversing" },
});

export function propellerWeight({ type, diameterFt: D, blades: B, activityFactor: AF, rpm: N, shp, mach }) {
  const c = PROPELLER_TYPES[type];
  if (!c) throw new Error(`Unknown propeller type "${type}" (CR-114399 Table II has types 1-5)`);
  const cw = c.y * (D / 10) ** 2 * B * (AF / 100) ** 2 * (20000 / (N * D)) ** 0.3;
  return c.kw * ((D / 10) ** 2 * (B / 4) ** 0.7 * (AF / 100) ** c.u * (N * D / 20000) ** c.v
         * (shp / (10 * D * D)) ** 0.12 * (mach + 1) ** 0.5) + cw;
}

/* One installed engine, lb. */
export function turbopropGroup({ shp, specificWeight, sectionFactor, propeller }) {
  const engine = specificWeight * shp;
  const section = sectionFactor * engine;
  const prop = propellerWeight({ ...propeller, shp });
  return { engine, section, propeller: prop, total: engine + section + prop };
}
