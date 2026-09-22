/* =====================================================================
   AUTOROTATION — can it get down with the power off?
   =====================================================================
   THE METRIC IS FRADENBURGH'S AUTOROTATIVE INDEX. Fradenburgh, E.A.,
   "A Simple Autorotative Flare Index", Journal of the American Helicopter
   Society, Vol. 29 No. 3, 1984. Definition as restated by Scaramuzzino,
   Pavel, Pool, Stroosma, Mulder & Quaranta, "Effects of Helicopter
   Dynamics on Autorotation Transfer of Training" (TU Delft / Politecnico
   di Milano), which also carries the population values:

     "The AI can be interpreted as the ratio between the available energy,
      i.e. rotor kinetic energy I_R Omega^2/2, where I_R is the polar moment
      of inertia of the rotor system and Omega is the rotor RPM, and the
      energy required to stop the rate of descent of the helicopter,
      proportional to the helicopter weight W and the disk loading DL.
      Therefore, high values of the index are desirable."

       AI = (I_R Omega^2 / 2) / (W DL)      [ft^3/lb]

   Dimensionally: slug-ft^2/s^2 = lb-ft, over (lb)(lb/ft^2), gives ft^3/lb.

   THE POPULATION, QUOTED, so the thresholds are not this project's:

     "Several helicopters have been considered and all of them have an
      autorotative index between 5 and 40 ft^3/lb."
     "values of the index above 30 ft^3/lb can only be achieved by
      single-engine helicopters, whereas values below 15 ft^3/lb are typical
      of large helicopters (maximum mass greater than 9072 kg)."

   ── THE PRIOR QUESTION IS WHETHER AUTOROTATION IS POSSIBLE AT ALL ─────
   An index is meaningless on a rotor that cannot enter autorotation.
   Entering requires dropping COLLECTIVE PITCH to keep the rotor turning on
   the energy of the descent. A fixed-pitch rotor has no collective to drop.

   NASA's own concept vehicles are fixed-pitch, and say so — AIAA 2018-3847:

     "A hard constraint on diameter of 10 ft was imposed, since these are
      fixed-pitch hingeless rotors with RPM control, and the rotor inertia is
      expected to increase beyond the capability of RPM control to provide
      enough responsiveness for maneuvering at diameters over 10 ft."

     "Edgewise fixed-pitch rotors: The quadrotor and lift+cruise aircraft,
      when operating with RPM control..."

   NOTE THE TRAP IN THAT FIRST SENTENCE. Rotor inertia is exactly what makes
   autorotation survivable, and it is the thing NASA had to LIMIT to keep RPM
   control responsive. The two requirements pull in opposite directions, and
   a design cannot quietly have both.

   So for an RPM-controlled fixed-pitch aircraft the honest answer is not a
   low index — it is that the manoeuvre does not exist, and safety rests on
   redundancy instead. That is why EASA SC-VTOL asks for continued safe
   flight and landing after a failure rather than for autorotation.

   ── WHAT IS NOT CLAIMED ───────────────────────────────────────────────
   The index is a FLARE index: energy available against energy needed to
   arrest the descent. It is not a landing simulation. It says nothing about
   entry delay, rotor speed decay before the pilot reacts, or height-velocity
   avoid regions. It orders designs; it does not certify one.
   ===================================================================== */

const LB_PER_KG = 2.2046226218, FT_PER_M = 3.280839895, G0 = 9.80665;

/** Population band, quoted from the reference above. */
export const AI_POPULATION = { min: 5, max: 40, singleEngineAbove: 30, largeBelow: 15 };

/**
 * Rotor polar moment of inertia about the shaft, for N_b uniform blades.
 * A uniform rod of mass m hinged at the axis has I = m R^2 / 3. The hub is
 * deliberately omitted: it sits at small radius and contributes little, and
 * leaving it out makes I_R a LOWER bound, so the index is conservative.
 */
export function rotorInertia(bladeMassPerRotorKg, R_m) {
  const m = Number(bladeMassPerRotorKg), R = Number(R_m);
  if (!isFinite(m) || !isFinite(R) || m <= 0 || R <= 0) return null;
  return (m * R * R) / 3;                       // kg-m^2, all blades of one rotor
}

/**
 * Fradenburgh autorotative index, in ft^3/lb.
 * @param o.bladeMassPerRotorKg  total blade mass of ONE rotor, kg
 * @param o.R_m                  rotor radius, m
 * @param o.tipSpeed_ms          hover tip speed, m/s (Omega = Vtip / R)
 * @param o.MTOW_kg              gross weight
 * @param o.nRotors              rotors sharing the descent energy
 */
export function autorotativeIndex(o = {}) {
  const R = Number(o.R_m), Vtip = Number(o.tipSpeed_ms), W = Number(o.MTOW_kg);
  const n = Math.max(1, Math.round(Number(o.nRotors) || 1));
  const Ione = rotorInertia(o.bladeMassPerRotorKg, R);
  if (Ione == null || !isFinite(Vtip) || !isFinite(W) || W <= 0) return null;

  const omega = Vtip / R;                                   // rad/s
  const I_R_kgm2 = n * Ione;                                // whole rotor system
  const KE_J = 0.5 * I_R_kgm2 * omega * omega;              // available energy, J

  /* Disk loading on the TOTAL disk area — the area doing the arresting, which
     is the quantity the index's DL term stands for. */
  const A_m2 = n * Math.PI * R * R;
  const DL_Nm2 = (W * G0) / A_m2;

  /* Into the index's own units: energy lb-ft, weight lb, disk loading lb/ft^2. */
  const KE_ftlb  = (KE_J / G0) * LB_PER_KG * FT_PER_M;      // J -> kgf-m -> lb-ft
  const W_lb     = W * LB_PER_KG;
  const DL_lbft2 = (DL_Nm2 / G0) * LB_PER_KG / (FT_PER_M * FT_PER_M);
  const AI = KE_ftlb / (W_lb * DL_lbft2);

  return {
    AI: +AI.toFixed(2),
    I_R_kgm2: +I_R_kgm2.toFixed(1),
    omega_rads: +omega.toFixed(2),
    rotorKE_MJ: +(KE_J / 1e6).toFixed(3),
    DL_lbft2: +DL_lbft2.toFixed(3),
    inPopulation: AI >= AI_POPULATION.min && AI <= AI_POPULATION.max,
    verdict: AI >= AI_POPULATION.singleEngineAbove ? "above the single-engine band"
           : AI >= AI_POPULATION.largeBelow ? "within the helicopter population"
           : AI >= AI_POPULATION.min ? "low — large-helicopter end of the band"
           : "BELOW every helicopter in the published population",
    src: "Fradenburgh, JAHS 29(3) 1984; population from Scaramuzzino et al. "
       + "(TU Delft/PoliMi): 5-40 ft^3/lb, >30 single-engine only, <15 large",
  };
}

/**
 * Rotor pitch control per layout, from the reference vehicles only. A layout
 * with no reference gets null: a design decision nobody has made is not the
 * same thing as a fixed-pitch rotor, and reporting it as one would be an
 * invention.
 */
export const ROTOR_PITCH_CONTROL = {
  /* [SRC] AIAA 2018-3847: "Edgewise fixed-pitch rotors: The quadrotor and
     lift+cruise aircraft, when operating with RPM control..." and "these are
     fixed-pitch hingeless rotors with RPM control". */
  multicopter: "fixed",
  liftcruise:  "fixed",
  /* A side-by-side helicopter is a helicopter: collective and cyclic are how
     it is controlled and trimmed at all, so collective exists by construction. */
  sideBySide:  "collective",
};

export function canAutorotate(configType) {
  const pc = ROTOR_PITCH_CONTROL[configType];
  if (!pc) {
    return { possible: null, pitchControl: null,
      reason: "no reference vehicle fixes the rotor pitch control for this "
            + "layout, so whether it can autorotate is an open design decision "
            + "rather than a property this tool can report" };
  }
  if (pc === "fixed") {
    return { possible: false, pitchControl: pc,
      reason: "fixed-pitch, RPM-controlled rotors have no collective to drop, "
            + "so autorotation cannot be ENTERED at any index. Safety rests on "
            + "redundancy, which is what SC-VTOL asks for instead" };
  }
  return { possible: true, pitchControl: pc,
    reason: "collective pitch is available, so the rotor can be unloaded and "
          + "kept turning on the energy of the descent" };
}
