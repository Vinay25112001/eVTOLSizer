/* =====================================================================
   ENGINE SECTION / NACELLE GROUP
   =====================================================================
   NDARC's weight statement (TP-20250010468 fig. 8-3a) puts an "engine section
   or nacelle group" inside STRUCTURE, and this engine did not model it at all.
   Every benchmark comparison against a NASA structures figure was therefore
   comparing our structure against one that contains a group we omit.

   ── THE EQUATIONS ARE NDARC'S, QUOTED ────────────────────────────────
   TP-20250010468 section 29-6, "Engine Section or Nacelle Group and Air
   Induction Group". AFDD82 model:

     "The engine section or nacelle group consists of: engine support
      structure, engine cowling, and pylon support structure."

        W_supt   = X_supt  0.0412 (1 - f_airind)(W_eng/N_eng)^1.1433 N_eng^1.3762
        W_cowl   = X_cowl  0.2315 S_nac^1.3476
        W_pylon  = X_pylon f_pylon W_MTO
        W_airind = X_airind 0.0412 f_airind (W_eng/N_eng)^1.1433 N_eng^1.3762

     "Based on 12 aircraft, the average error of the engine support equation is
      11.0% ... the engine cowling equation is 17.9% ... the air induction
      equation is 11.0%.  Typically f_airind = 0.3 (range 0.1 to 0.6)."

   Units (table 29-9): W_MTO and W_eng in lb, S_nac in ft^2 (wetted area of
   nacelles and pylon, less spinner), f_airind and f_pylon are fractions.

   ── REFERENCE CLASS: THREE SEPARATE JUDGEMENTS, NOT ONE ──────────────
   Rule 2 of this project. AFDD82 is fitted to 12 aircraft with TURBOSHAFT
   ENGINES, and the four terms above do NOT all survive the move to electric
   propulsion equally. Taking them one at a time rather than importing the set:

   1. AIR INDUCTION IS ZERO, and that is physics, not a guess. The group is
      the intake ducting that feeds combustion air to a gas turbine. An
      all-electric aircraft has no combustion and no intake. `f_airind`
      therefore defaults to 0 here, against NDARC's turboshaft-typical 0.3 —
      which also removes the (1 - f_airind) discount from the support term.

   2. ENGINE SUPPORT MAPS TO MOTOR SUPPORT. `W_eng` is "weight all main
      engines": the mass the support structure has to carry and react loads
      from. For an electric aircraft that is the MOTOR group. The substitution
      is a reference-class stretch and it is stated as one — a turboshaft mount
      also reacts hot-section thermal growth and a different vibration
      spectrum. The exponent is superlinear (1.1433), so it is not a scaling
      this model should be trusted far outside the fitted mass range.

   3. PYLON SUPPORT IS ALREADY MODELLED HERE, UNDER ANOTHER NAME. NDARC's
      pylon support is the structure carrying the propulsor away from the
      airframe. On this engine that is engine/booms.js, which sizes booms from
      the rotor thrust they carry and the arm they carry it over. Charging
      f_pylon * W_MTO on top would double-count it. `nacellePylonFrac`
      therefore defaults to 0, and is exposed for layouts that carry a genuine
      pylon distinct from a boom (a tilting nacelle, say).

   4. COWLING NEEDS A WETTED AREA THAT IS NOT AVAILABLE, so it is NOT guessed.
      S_nac is a geometric input. NASA/TM-20210017971 6.1.2.2 publishes motor
      diameter and length regressions that would give it, but their
      coefficients do not survive extraction: both `-layout` and raw reading
      order render them as run-together digits ("= 0.81810.3094"), and the two
      readings disagree. Taken as INCHES the diameter and length equations
      agree on the same motor torque to 4% (459 vs 478 ft-lb); taken as the
      FEET the surrounding text states, they disagree by a factor of 14. A
      recovered unit is not a source, so cowling is returned only when the
      caller supplies `nacelleWettedAreaM2`, and is otherwise ZERO and
      reported as a stated omission. This is the same discipline that kept
      NDARC's F_P out of the rotorborne L/D model.

   ── SO WHAT THIS ACTUALLY ADDS ───────────────────────────────────────
   With air induction zero, pylon zero and cowling unavailable, what is left is
   the engine-support term alone. That is deliberately a SMALL number — for
   NASA's lift+cruise, 9 motors totalling 632 lb give about 110 lb (50 kg), not
   the ~290 kg that a cursory reading of the structures gap suggested. Measuring
   that, rather than assuming the group was large enough to explain the gap, is
   the point of implementing it.
   ===================================================================== */

const LB = 2.20462;
const FT2_PER_M2 = 10.7639;

/**
 * Engine section / nacelle group mass.
 *
 * @param {object} p parameters. Reads `nacelleAirInductionFrac` (default 0 —
 *   electric), `nacellePylonFrac` (default 0 — booms already carry it),
 *   `nacelleWettedAreaM2` (no default; cowling omitted when absent),
 *   `nacelleTechFactor` (default 1.0).
 * @param {object} g { motorMassKg, nMotors, MTOW }
 */
export function nacelleGroup(p = {}, g = {}) {
  const nEng = Math.max(1, Math.round(g.nMotors ?? 0));
  const wEngLb = Math.max(0, (g.motorMassKg ?? 0) * LB);
  const fAir = Math.min(0.6, Math.max(0, p.nacelleAirInductionFrac ?? 0));
  const fPyl = Math.max(0, p.nacellePylonFrac ?? 0);
  const tf = Math.max(0, p.nacelleTechFactor ?? 1.0);

  /* AFDD82 engine support. Zero if there is no motor mass to support. */
  const perEng = wEngLb / nEng;
  const supportLb = wEngLb > 0
    ? 0.0412 * (1 - fAir) * Math.pow(perEng, 1.1433) * Math.pow(nEng, 1.3762)
    : 0;

  /* Air induction — zero for an all-electric aircraft, see header note 1. */
  const airIndLb = wEngLb > 0 && fAir > 0
    ? 0.0412 * fAir * Math.pow(perEng, 1.1433) * Math.pow(nEng, 1.3762)
    : 0;

  /* Cowling — only when a wetted area is supplied. Never guessed. */
  const sNacFt2 = p.nacelleWettedAreaM2 != null
    ? Math.max(0, p.nacelleWettedAreaM2) * FT2_PER_M2 : null;
  const cowlLb = sNacFt2 != null ? 0.2315 * Math.pow(sNacFt2, 1.3476) : 0;

  /* Pylon — zero unless the layout has one distinct from its booms. */
  const pylonLb = fPyl > 0 ? fPyl * Math.max(0, (g.MTOW ?? 0) * LB) : 0;

  const massKg = tf * (supportLb + airIndLb + cowlLb + pylonLb) / LB;
  return {
    mass: massKg,
    supportKg: tf * supportLb / LB,
    airInductionKg: tf * airIndLb / LB,
    cowlingKg: tf * cowlLb / LB,
    pylonKg: tf * pylonLb / LB,
    cowlingModelled: sNacFt2 != null,
    note: sNacFt2 != null
      ? `AFDD82 support + cowling over ${nEng} motor(s)`
      : `AFDD82 engine support over ${nEng} motor(s); cowling OMITTED `
        + `(no nacelle wetted area supplied — see engine/nacelle.js)`,
  };
}
