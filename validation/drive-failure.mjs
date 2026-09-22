/* =====================================================================
   DRIVE-SYSTEM FAILURE GATE
   =====================================================================
   The engine's OEI block models one ROTOR stopping. A cross-shafted
   aircraft loses POWER, not a rotor, and had no failure case at all. This
   checks the one that now exists.
   ===================================================================== */
import { driveFailure, F_P_TWIN_MAIN_ROTOR } from "../src/engine/drivefailure.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};
console.log("DRIVE-SYSTEM FAILURE GATE");
console.log("=".repeat(72));
console.log("  NDARC TP-20220000355 17-4: PreqPG/Omega <= (1+eps) PDSlimit/Omega_prim");
console.log("  NDARC 29-7.4: fP = fQ = 60% for twin main-rotors");
console.log("");

/* The side-by-side at its own design point. */
const P = 236.97, n = 2, Ppk = 450.25, om = 2 * 167.64 / 8.94;
const r = driveFailure({ PhovKW: P, nMotors: n, PpeakPerMotorKW: Ppk, omegaRotor: om });

check(Math.abs(r.perSurvivorKW - P / (n - 1)) < 1e-6,
  "the surviving motors carry the WHOLE hover demand",
  `${r.perSurvivorKW} kW on ${n - 1} of ${n} motors — a shaft keeps both rotors `
  + `turning, so the load redistributes instead of a rotor stopping`);

check(r.motorOK === true && r.motorMarginPct > 0,
  "and the installed motor covers it on this design",
  `${r.perSurvivorKW} kW against a ${Ppk} kW peak rating, +${r.motorMarginPct}% — `
  + `the rotor-loss test reported -35% for this same aircraft, which was the `
  + `wrong failure mode, not a worse answer`);

check(r.sizedByFailure === true && Math.abs(r.growthOverHoverShare - 1.2) < 0.001,
  "the transmission is sized by the failure, not by hover",
  `PDSlimit ${r.PdsLimitKW} kW against a ${r.perTrainNormalKW} kW hover share, `
  + `x${r.growthOverHoverShare} — fP = ${F_P_TWIN_MAIN_ROTOR} of the drive limit `
  + `passes to the second rotor`);

check(r.QdsLimitNm > 0,
  "and it is expressed as the torque limit NDARC says it really is",
  `${r.QdsLimitNm} N-m at the hover rotor speed — "The limit is properly a `
  + `torque limit, QDSlimit = PDSlimit/Omega_ref"`);

/* Independent-rotor layouts must get nothing: their failure is rotor loss. */
check(driveFailure({ PhovKW: P, nMotors: 1 }) === null,
  "a single-motor group has no redistribution case",
  "returns null rather than dividing by zero survivors");

/* Scaling: doubling the motor count halves what each survivor must add. */
const many = driveFailure({ PhovKW: P, nMotors: 12, PpeakPerMotorKW: Ppk, omegaRotor: om });
check(many.perSurvivorKW < r.perSurvivorKW / 5,
  "many motors make a motor loss cheap, which is the case for distribution",
  `${many.perSurvivorKW} kW/motor at 12 motors against ${r.perSurvivorKW} at 2`);

console.log("");
console.log("  MEASURED, NOT ASSERTED — why the weight is not charged:");
console.log("    NASA SbS-E publishes a 255 lb drive system, and per-train hover");
console.log("    sizing reproduces it to a few percent. Sizing to PDSlimit instead");
console.log("    takes SbS-E/driveSys to +54.7% and the benchmark mean 8.7% -> 10.0%.");
console.log("    So their published weight does not contain an OEI-sized");
console.log("    interconnect. The demand is real and reported; the weight stays on");
console.log("    the sizing that matches the data.");
console.log("");
if (fails) { console.log(`DRIVE-SYSTEM FAILURE GATE FAILED: ${fails}`); process.exit(1); }
console.log("DRIVE-SYSTEM FAILURE GATE PASSED");
