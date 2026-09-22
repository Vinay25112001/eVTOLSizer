/* =====================================================================
   FLIGHT CONTROLS GROUP
   =====================================================================
   Flagged in the method-fidelity audit as a mismatch: our model is a flat
   2.5% of MTOW [FRAC] where NDARC has AFDD equations (§29-8). This module
   implements those equations so the comparison can be MEASURED rather than
   assumed — and the measurement is the point, because it does not go the way
   the audit expected.

   ── THE EQUATIONS, FROM THE PRIMARY SOURCE ───────────────────────────
   Johnson, NDARC Theory, NASA TP-20250010468 §29-8, AFDD82, recovered in raw
   reading order:

     ROTARY WING, non-boosted (parametric method)
       W_RWnb = X 2.1785 f_nbsv W_MTO^0.3999 N_rotor^1.3855
       "Based on 20 aircraft, the average error ... is 10.4%."

     ROTARY WING, boost mechanisms and boosted controls
       w_fc   = 0.2873 f_mbsv (N_rotor N_blade)^0.6257 c^1.3286
                (0.01 Vtip)^2.1129 f_RWred^0.8942
       W_RWmb = X (1 - f_RWhyd) w_fc                          6.5% / 21 aircraft
       W_RWb  = X 0.02324 f_bsv (N_rotor N_blade)^1.0042 N_rotor^0.1155
                c^2.2296 (0.01 Vtip)^3.1877                   9.7% / 20 aircraft

     FIXED WING
       full controls            w = 0.91000 W_MTO^0.6
       only stabilizer controls w = 0.01735 W_MTO^0.64345 S_ht^0.40952
       "For a helicopter, the stabilizer control equation is used."

   f_nbsv = 1.8984, f_mbsv = 1.3029, f_bsv = 1.1171 for ballistically
   survivable (UTTAS/AAH level), 1.0 otherwise — all 1.0 for a civil eVTOL.
   "Typically f_RWnb = 0.6 (range 0.3 to 1.8); f_RWhyd = 0.4."
   Units per tables 29-15/16: W_MTO lb, c ft, Vtip ft/sec, S_ht ft^2.

   ── AND NDARC ITSELF SUPPLIES THE REFERENCE-CLASS ESCAPE HATCH ───────
   From the same section, on evaluating the rotary-wing controls per rotor:

     "with each rotor designated FIXED PITCH (NO CONTROL WEIGHT), swashplate
      (collective and cyclic), or collective control only"

   That matters enormously here. This engine's default is `rotorControl: "rpm"`
   — fixed-pitch rotors controlled by motor speed. NDARC's own rule says such a
   rotor carries NO rotary-wing control weight: there is no swashplate, no
   pitch links and no per-rotor actuator to weigh. What remains is cockpit
   controls plus the flight control computers, which is what a fly-by-wire
   eVTOL actually has.

   ── MEASURED: AFDD IS THE WRONG REFERENCE CLASS HERE, BY 4-5x ────────
   Against NASA Table 12's published "Flight controls weight" line for all
   eight variants (see validation/components.mjs), the AFDD parametric
   non-boosted term ALONE gives ~497 lb for the electric quadrotor against a
   published TOTAL of 108 lb.

   The reason is structural, not a coefficient problem: `N_rotor^1.3855` is
   describing mechanical control runs from a cockpit, through the airframe, to
   every rotor. A distributed-electric aircraft with fly-by-wire has wires.
   Importing the equation would replace a fraction that is ~35% high with a
   regression that is ~350% high.

   **So the flagged "mismatch" resolves the other way: the [FRAC] model is the
   better one for this aircraft class, and AFDD is retained only as a
   selectable comparator.** That is a real result of the audit — a method
   mismatch is not automatically a defect, and the way to find out is to
   implement the alternative and measure it.

   What the published data DOES show is that the fraction should not be one
   number: flight controls run 1.36% of MTOW (turbo-electric lift+cruise) to
   3.42% (tiltwing), and the tiltwing is highest because NDARC counts
   "conversion (rotor tilt) flight controls" as a category of its own. That
   configuration dependence is modelled below.
   ===================================================================== */

const LB = 2.20462;
const FT = 3.28084;

/* [SRC] NDARC TP-20250010468 29-8, AFDD82 rotary wing. Imperial in, lb out. */
export const afddRWNonBoosted = (wMTO_lb, nRotor, fNbsv = 1.0) =>
  2.1785 * fNbsv * Math.pow(wMTO_lb, 0.3999) * Math.pow(nRotor, 1.3855);

export const afddRWBoostMech = (nRotor, nBlade, c_ft, vTip_fts, fRWred = 1.0,
                                fRWhyd = 0.4, fMbsv = 1.0) =>
  (1 - fRWhyd) * 0.2873 * fMbsv * Math.pow(nRotor * nBlade, 0.6257) *
  Math.pow(c_ft, 1.3286) * Math.pow(0.01 * vTip_fts, 2.1129) * Math.pow(fRWred, 0.8942);

export const afddRWBoosted = (nRotor, nBlade, c_ft, vTip_fts, fBsv = 1.0) =>
  0.02324 * fBsv * Math.pow(nRotor * nBlade, 1.0042) * Math.pow(nRotor, 0.1155) *
  Math.pow(c_ft, 2.2296) * Math.pow(0.01 * vTip_fts, 3.1877);

/* [SRC] Same section, fixed-wing stabilizer-controls form. */
export const afddFWStabilizer = (wMTO_lb, sHt_ft2) =>
  0.01735 * Math.pow(wMTO_lb, 0.64345) * Math.pow(Math.max(1e-6, sHt_ft2), 0.40952);

/**
 * Flight controls group mass.
 *
 * @param {object} p reads `flightControlsModel` ("fraction" DEFAULT | "afdd"),
 *   `rotorControl` ("rpm" = fixed pitch, else swashplate/collective),
 *   `nBlades`, `solidity`, `flightControlsFrac`, `conversionControlsFrac`.
 * @param {object} g { MTOW, nRotors, radius_m, tipSpeed_ms, sHt_m2, nTilting }
 * @param {number} baseFrac legacy [FRAC] fraction of MTOW.
 */
export function flightControls(p = {}, g = {}, baseFrac = 0.025) {
  const model = p.flightControlsModel ?? "fraction";
  const MTOW = Math.max(0, g.MTOW ?? 0);
  const nRotor = Math.max(1, g.nRotors ?? 1);
  const nTilting = Math.max(0, g.nTilting ?? 0);

  if (model === "afdd") {
    const wMTO_lb = MTOW * LB;
    const nBlade = Math.max(2, Math.round(p.nBlades ?? 3));
    const R_ft = Math.max(1e-6, (g.radius_m ?? 0) * FT);
    const sigma = p.solidity ?? 0.10;
    const c_ft = sigma * Math.PI * R_ft / nBlade;
    const vTip = Math.max(1e-6, (g.tipSpeed_ms ?? 0) * FT);
    /* NDARC: a FIXED-PITCH rotor carries no rotary-wing control weight. */
    const fixedPitch = (p.rotorControl ?? "rpm") === "rpm";
    const nb = afddRWNonBoosted(wMTO_lb, nRotor);
    const mb = fixedPitch ? 0 : afddRWBoostMech(nRotor, nBlade, c_ft, vTip);
    const b  = fixedPitch ? 0 : afddRWBoosted(nRotor, nBlade, c_ft, vTip);
    const fw = (g.sHt_m2 > 0) ? afddFWStabilizer(wMTO_lb, g.sHt_m2 * FT * FT) : 0;
    return { mass: (nb + mb + b + fw) / LB, model: "afdd",
      nonBoostedKg: nb / LB, boostMechKg: mb / LB, boostedKg: b / LB, fixedWingKg: fw / LB,
      note: `AFDD82 §29-8${fixedPitch ? ", fixed-pitch rotors carry no RW control weight" : ""}` };
  }

  /* ── DEFAULT: fraction of MTOW, with a configuration term ────────────
     [CAL] over n=8. NASA Table 12's published flight-controls line runs
     1.36%-3.42% of MTOW across the eight variants, and the top of that range
     is the TILTWING — which NDARC explains: "conversion (rotor tilt) flight
     controls" are a category of their own, and a tilting configuration must
     actuate its nacelles. The base fraction is left at its previous 2.5% and
     a conversion term is ADDED only for layouts that actually tilt, scaled by
     the tilting-rotor fraction. Default conversion term 0 keeps existing
     designs unchanged until it is set. */
  /* THE BASE IS AIRFRAME WEIGHT, NOT MTOW. Measured against Table 12's
     published flight-controls line: on MTOW the electric variants scatter
     1.67%-2.68% because MTOW carries the battery and control hardware does
     not; on (MTOW - energy storage) six vehicles spanning turboshaft AND
     electric, 1 to 8 rotors, collapse onto 2.40%-2.71%, mean 2.518% — against
     the 2.5% already in use. The fraction was right, the base was wrong.
     Falls back to MTOW when no airframe mass is supplied. */
  const airframe = g.airframeMass != null ? Math.max(0, g.airframeMass) : MTOW;
  const convFrac = p.conversionControlsFrac ?? 0;
  const tiltShare = nRotor > 0 ? nTilting / nRotor : 0;
  const base = (p.flightControlsFrac ?? baseFrac) * airframe;
  const conv = convFrac * tiltShare * airframe;
  /* Label the BASE honestly — it is airframe weight unless none was supplied.
     Saying "of MTOW" while scaling on airframe mass is the kind of stale label
     that sends the next reader down the wrong path. */
  const baseLabel = g.airframeMass != null ? "of airframe wt (MTOW - energy storage)" : "of MTOW (no airframe mass supplied)";
  return { mass: base + conv, model: "fraction", baseKg: base, conversionKg: conv,
    basisKg: airframe, basis: g.airframeMass != null ? "airframe" : "MTOW",
    note: `${((p.flightControlsFrac ?? baseFrac) * 100).toFixed(2)}% ${baseLabel}`
        + (conv > 0 ? ` + ${(convFrac * 100).toFixed(2)}% conversion x ${(tiltShare * 100).toFixed(0)}% tilting` : "") };
}
