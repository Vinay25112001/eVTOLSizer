/* =====================================================================
   DRIVE SYSTEM (GEARBOX) MASS
   =====================================================================
   Closes the gap flagged in weights.js: `motorGearRatio` already let a design
   spin its motor faster than its rotor — which makes the motor dramatically
   lighter through the torque regression — while the gearbox that does the
   speed change weighed NOTHING. That is a free lunch, and it made every geared
   design look better than it is. Gearing and gearbox mass belong together, or
   neither belongs in the model.

   ── THE EQUATION IS NDARC'S, QUOTED VERBATIM ─────────────────────────
   Johnson, W., "NDARC — NASA Design and Analysis of Rotorcraft, Theory",
   NASA TP-20250010468, section 29-7.4 "Drive System" (the same equations
   appear unchanged in TP-2015-218751 and TP-2009-215402):

     "The gear box and rotor shaft weights for the AFDD00 model are:
        w_gbrs = 95.7634 N_rotor^0.38553 P_DSlimit^0.78137 W_eng^0.09899
                 / W_rotor^0.80686
        W_gb = X_gb (1 - f_rs) w_gbrs
        W_rs = X_rs f_rs w_gbrs
      Based on 52 aircraft, the average error of the gear box and rotor shaft
      equation is 8.6%.  Typically f_rs = 0.13 (range 0.06 to 0.20)."

   and the older AFDD83 model from the same section:

        w_gbrs = 57.72 P_DSlimit^0.8195 f_Q^0.0680 N_gb^0.0663
                 (W_eng/1000)^0.0369 / W_rotor^0.6379
      "Based on 30 aircraft, the average error ... is 7.7%."

   Units, per NDARC table 29-13: P_DSlimit is the drive-system power limit
   (MCP) in hp, rotational speeds are rpm, f_Q is a percentage, weight is lb.

   ── THE REFERENCE-CLASS QUESTION, ASKED AND THEN MEASURED ────────────
   Rule 2 of this project: always ask "fitted to WHICH population?". AFDD00 is
   fitted to 52 HELICOPTERS, where ONE interconnected transmission feeds every
   rotor — which is what the N_rotor^0.38553 growth term is describing. A
   distributed-electric eVTOL is not that aircraft: it has N INDEPENDENT
   single-stage reductions, one motor to one rotor, with no cross-shafting and
   no power sharing. Applying the equation once with N_rotor = N would charge
   our aircraft for an interconnection it does not have.

   So both readings were tested against NASA's OWN published drive-system
   weights (NASA/TM-20210017971 Table 12), which were themselves produced by
   NDARC — an internal-consistency test in which every number is NASA's:

     vehicle  published   whole-aircraft N_rotor=N     per drive train x N
     Quad-E     397 lb    482-499 lb (tf 0.80-0.82)    382-396 lb (tf 1.00-1.04)
     SbS-E      255 lb    287-295 lb (tf 0.87-0.89)    255-263 lb (tf 0.97-1.00)

   **The per-drive-train reading lands within 0.2-3.9% with NO technology
   factor at all; the helicopter reading needs a 0.80-0.89 fudge to fit.** That
   is the reference-class defect showing up exactly where rule 2 predicts, and
   it is why this module applies the equation PER DRIVE TRAIN (N_rotor = 1,
   P_DSlimit = one rotor's share) and multiplies by the rotor count.

   ── WHAT THE MOTOR SPEED IS, AND WHY ITS UNCERTAINTY DOES NOT MATTER ─
   NASA does not publish the motor speed of the quadrotor or side-by-side, so
   it was recovered by inverting their own motor regression (TM-20210017971
   6.1.2.2, W_lb = 1.322 x 0.5663 tau_ftlb^0.8207) against their own published
   motor-group weight. That gives 4,380-6,296 rpm for Quad-E and 4,274-5,668
   rpm for SbS-E, the spread being whether the 15 lb/motor controller allowance
   sits inside the engine-system line. Gear ratios 10.9-16.1.

   That recovery is an INFERENCE, not a published figure — but the drive-system
   result barely depends on it, because W_eng enters at the 0.09899 power: the
   whole 4,000-7,000 rpm range moves gearbox weight by 5.8%. The inference is
   load-bearing for MOTOR mass, not for gearbox mass.

   ── WHAT IS DELIBERATELY NOT MODELLED ────────────────────────────────
   * At gearRatio = 1 this returns ZERO. A direct-drive machine has no gear
     train, and inventing 13% of a gearbox it does not have would break rule 1.
     The rotor shaft NDARC bills at f_rs = 0.13 of w_gbrs is a real omission at
     ratio 1 — it is currently absorbed by the [CAL] rotor mass constant, and
     is recorded here rather than guessed at.
   * The CRUISE propulsor is not covered. It is sized by a specific-power
     constant, not by torque, so it has no rotational speed to gear. A pusher
     on an electric aircraft is usually direct-drive; if that changes, this is
     the omission to close first.
   * Drive shaft (AFDD82) and rotor brake are not modelled: both are
     cross-shafting / interconnect items that a distributed-electric layout
     with independent drive trains does not carry.
   * NO technology factor is applied by default (driveTechFactor = 1.0). The
     measured NASA-implied credit is 0.97-1.04 per drive train, i.e. indis-
     tinguishable from 1.0 over n=2 — so there is nothing to claim. This
     follows the same discipline as structTechFactor, whose fitted 1.414 was
     deliberately not shipped.
   ===================================================================== */

const HP_PER_KW = 1 / 0.7457;
const LB        = 2.20462;

/* NDARC TP-20250010468 29-7.4, AFDD00. Returns lb; speeds rpm; power hp. */
export const afdd00GearBoxRotorShaft = (nRotor, P_hp, rpmEng, rpmRotor) =>
  95.7634 * Math.pow(nRotor, 0.38553) * Math.pow(P_hp, 0.78137) *
  Math.pow(rpmEng, 0.09899) / Math.pow(rpmRotor, 0.80686);

/* NDARC TP-20250010468 29-7.4, AFDD83. Returns lb. */
export const afdd83GearBoxRotorShaft = (P_hp, fQ_pct, nGb, rpmEng, rpmRotor) =>
  57.72 * Math.pow(P_hp, 0.8195) * Math.pow(fQ_pct, 0.0680) *
  Math.pow(nGb, 0.0663) * Math.pow(rpmEng / 1000, 0.0369) /
  Math.pow(rpmRotor, 0.6379);

/**
 * Drive-system (gear box + rotor shaft) mass for a distributed-electric rotor
 * drive, applied per drive train.
 *
 * @param {object} p design parameters. Reads `motorGearRatio` (1 = direct
 *   drive, the default), `driveSystemModel` ("afdd00" default | "afdd83"),
 *   `driveTechFactor` (default 1.0), `driveRotorShaftFrac` (f_rs, default 0.13
 *   per NDARC), `driveFQpct` (AFDD83 only).
 * @param {object} g { nRotors, PmotKW, omegaRotor } — omegaRotor in rad/s,
 *   PmotKW the installed power of ONE motor.
 */
export function driveSystem(p = {}, g = {}) {
  const gearRatio = Math.max(1, p.motorGearRatio ?? 1);
  const nRotors   = Math.max(1, g.nRotors ?? 1);
  const PmotKW    = Math.max(0, g.PmotKW ?? 0);
  const omega     = Math.max(0, g.omegaRotor ?? 0);          // rad/s
  const rpmRotor  = omega * 60 / (2 * Math.PI);

  if (gearRatio === 1 || PmotKW <= 0 || !isFinite(rpmRotor) || rpmRotor <= 0) {
    return {
      mass: 0, gearRatio, model: "none", rpmRotor, rpmMotor: rpmRotor * gearRatio,
      perTrainKg: 0, gearBoxKg: 0, rotorShaftKg: 0,
      note: gearRatio === 1
        ? "direct drive — no gear train exists, so no gear-box mass is charged"
        : "no drive-system mass: zero power or zero rotor speed",
    };
  }

  const rpmMotor = rpmRotor * gearRatio;
  const model = p.driveSystemModel ?? "afdd00";
  const P_hp  = PmotKW * HP_PER_KW;                  // ONE drive train's share
  const fRs   = p.driveRotorShaftFrac ?? 0.13;       // NDARC "typically 0.13"
  const tf    = p.driveTechFactor ?? 1.0;

  /* Per drive train: one motor, one gear box, one rotor — hence N_rotor = 1
     and N_gb = 1. See the reference-class note in the header. */
  const wLb = model === "afdd83"
    ? afdd83GearBoxRotorShaft(P_hp, p.driveFQpct ?? 100, 1, rpmMotor, rpmRotor)
    : afdd00GearBoxRotorShaft(1, P_hp, rpmMotor, rpmRotor);

  const perTrainKg = tf * wLb / LB;
  return {
    mass: nRotors * perTrainKg,
    gearRatio, model, rpmRotor, rpmMotor, perTrainKg,
    gearBoxKg:    nRotors * perTrainKg * (1 - fRs),
    rotorShaftKg: nRotors * perTrainKg * fRs,
    note: `${model.toUpperCase()} per drive train x${nRotors}, ` +
          `${rpmRotor.toFixed(0)} rotor rpm -> ${rpmMotor.toFixed(0)} motor rpm`,
  };
}
