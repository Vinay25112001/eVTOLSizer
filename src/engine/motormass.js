/* =====================================================================
   MOTOR MASS — four reference classes, one place
   =====================================================================
   EXTRACTED FROM weights.js so it can be TESTED ON ITS OWN. It was three
   closures inside componentWeights(), which meant the largest single mass in
   the aircraft (333 kg at the app default, more than the fuselage) had no
   component-level check against published data — while the rotor, systems,
   drive, nacelle and flight-controls groups all had one. Motor+drive is also
   the WORST metric against NASA's published weight statements, at +33% to
   +35%, and engine/drivesystem.js already scores -1.9%/+1.7% on two of three
   vehicles, which points the finger here rather than at the gearbox.

   Nothing about the arithmetic changed in the extraction; the golden master
   gates that.

   WHICH POPULATION THE REGRESSION IS FITTED TO IS THE WHOLE QUESTION — the
   recurring defect in this engine has been reference class, not algebra.

     emraxTorque    DEFAULT. W = 0.5591 tau^0.6266, fitted to the four EMRAX
                    axial-flux entries in src/Components.jsx (2024 datasheets).
                    Modern eVTOL traction motors.
     nasaTorque     NASA/TM-20210017971 6.1.2.2, W_lb = 0.5663 tau_ftlb^0.8207
                    times a 1.322 technology factor, fitted to the 2021 NDARC
                    database. Correct for NASA's own vehicles, ~2x heavy for a
                    modern eVTOL.
     torqueDensity  tau / 49 N-m/kg [SRC] Joby propulsion motor rated torque
                    density. One aircraft, so a point estimate, not a fit.
     specificPower  the legacy [CAL] 5.0 kW/kg constant, which cannot tell a
                    slow lift rotor from a fast cruise prop.
   ===================================================================== */

const LB = 2.20462;
const NM_TO_FTLB = 0.737562;

/** Largest torque in the EMRAX fit (EMRAX 348). [SRC] datasheet. */
export const EMRAX_TAU_MAX_NM = 546;

/**
 * @param {object} o  {model, P_kW, omega, gearRatio, K}
 *   omega     rotor angular velocity, rad/s (motor speed is omega*gearRatio)
 * @returns {{kg:number, tauNm:number, extrapolated:boolean, model:string}}
 */
export function motorMass({ model = "emraxTorque", P_kW, omega, gearRatio = 1, K }) {
  const g     = Math.max(1, gearRatio);
  const tauNm = (P_kW * 1000) / Math.max(1e-6, omega * g);
  let extrapolated = false;
  let kg;

  if (model === "specificPower") {
    kg = P_kW / K.motorSpecPowerKWkg;
  } else if (model === "nasaTorque") {
    const tauFt = tauNm * NM_TO_FTLB;
    kg = (K.motorTechFactor * 0.5663 * Math.pow(Math.max(1e-9, tauFt), 0.8207)) / LB;
  } else if (model === "torqueDensity") {
    kg = tauNm / Math.max(1e-6, K.motorTorqueDensityNmKg);
  } else {
    /* THE HAND-OFF MUST BE CONTINUOUS. A hard switch at 546 N-m is a STEP, and
       a design sitting near the boundary oscillates across it and never
       converges — Archer did exactly that, stopping at a perfectly healthy
       16.5% margin, which is the signature of a discontinuity rather than an
       infeasible aircraft. So the curve is evaluated AT its largest fitted
       point and the power beyond that point is added at the family's specific
       power: the branches meet exactly at 546 N-m, and outside the fitted range
       mass grows linearly in power instead of extrapolating a power law 3.6x
       past its evidence. */
    const fitAt = (t) => K.emraxA * Math.pow(Math.max(1e-9, t), K.emraxB);
    if (tauNm <= EMRAX_TAU_MAX_NM) {
      kg = fitAt(tauNm);
    } else {
      extrapolated = true;
      const P_at_tauMax = EMRAX_TAU_MAX_NM * Math.max(1e-6, omega * g) / 1000;
      kg = fitAt(EMRAX_TAU_MAX_NM)
         + Math.max(0, P_kW - P_at_tauMax) / K.motorSpecPowerKWkg;
    }
  }
  return { kg, tauNm, extrapolated, model };
}
