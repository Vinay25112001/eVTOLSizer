/* =====================================================================
   COMPONENT-LEVEL VALIDATION — each model alone, at published inputs
   =====================================================================
   WHY THIS EXISTS, AND WHY THE OTHER TWO HARNESSES CANNOT DO IT

   `nasa-configs.mjs` and `validate.mjs` both run the FULL SIZING LOOP and
   compare converged answers. That is the right end-to-end test, but it cannot
   tell you WHICH MODEL is wrong, because the loop mixes every component
   together and then amplifies the mixture through the mass spiral. This
   project has now been bitten by that three separate times:

     * a group-boundary error and an empty-weight convention error pointing
       opposite ways, cancelling inside MTOW;
     * a lift+cruise motor group 3x too heavy, hidden because the energy was
       low by a compensating amount;
     * an `etaSys` set to the wrong definition, masked by a benchmark that
       happened to score well.

   Every one of those survived because only converged totals were being
   checked. **A component measured at PUBLISHED inputs cannot hide behind
   another component.** That is what this file does: it feeds each weight model
   NASA's own published geometry and reads the answer straight out, with no
   iteration, no convergence and no feedback.

   `validate.mjs` already does this for exactly one model — "wing model alone
   (span at the PUBLISHED MTOW)" — and that line has been the single most
   informative number in the suite (2.6% against 27.8% for the same model
   inside the loop). This generalises it.

   ── WHAT IT SCORES AGAINST ───────────────────────────────────────────
   NASA/TM-20210017971 Table 12 publishes, per vehicle: rotor group weight,
   structures, propulsion, fuel system, drive system, systems and flight
   controls. Table 12's ROTOR GROUP line is the ground truth for the rotor
   model; the drive system line for the drive model; and so on.

   Nothing here is fitted. Where an input is not published (blade count, flap
   frequency) the harness SWEEPS it and reports the range, rather than picking
   the value that scores best.

     node validation/components.mjs
   ===================================================================== */
import { rotorGroup } from "../src/engine/rotorgroup.js";
import { driveSystem } from "../src/engine/drivesystem.js";
import { nacelleGroup } from "../src/engine/nacelle.js";
import { flightControls } from "../src/engine/flightcontrols.js";
import { WEIGHT_CONSTANTS as K } from "../src/engine/weights.js";
import { motorMass, EMRAX_TAU_MAX_NM } from "../src/engine/motormass.js";

const LB = 2.20462, FT = 3.28084;

/* NASA/TM-20210017971 Table 12 — published per-vehicle geometry and the
   published component weights they produced. Only the all-electric columns
   have a usable propulsion breakdown, but the ROTOR GROUP line is published
   for all eight variants, so the turboshaft ones are usable here even though
   the sizing harness cannot fly them. */
const VEHICLES = [
  /* ⚠ ROTOR COUNT IS NOT THE "Number lift motors" ROW. On the turboshaft
     variants that row is the number of ENGINES: the turboshaft quadrotor has
     ONE engine driving FOUR rotors. Reading it as a rotor count gave Quad-TS
     a single 9.2 ft rotor and a −78.9% error that looked like a model defect
     and was a data-entry defect. Rotor counts here come from the CONFIGURATION
     (a quadrotor has four, a side-by-side two, a single-main-rotor one). */
  { key:"SMR-TS", fc_lb:89.1, dgw_lb:3760,  nRotors:1, R_ft:17.3, tip:550, solidity:0.0666, rotor_lb:279, tilting:false },
  { key:"Quad-TS", fc_lb:91, dgw_lb:3740, nRotors:4, R_ft:9.20, tip:550, solidity:0.0650, rotor_lb:325, tilting:false },
  { key:"Quad-E", fc_lb:108, dgw_lb:6480,  nRotors:4, R_ft:13.1, tip:550, solidity:0.0550, rotor_lb:628, tilting:false,
    drive_lb:397, motor_lb:233, gearRatio:13.3, PmotKW:168*0.7457, systems_lb:536 },
  { key:"SbS-TS", fc_lb:93, dgw_lb:3470,  nRotors:2, R_ft:10.5, tip:550, solidity:0.0830, rotor_lb:196, tilting:false },
  { key:"SbS-E", fc_lb:93, dgw_lb:4900,   nRotors:2, R_ft:14.9, tip:550, solidity:0.0580, rotor_lb:345, tilting:false,
    drive_lb:255, motor_lb:145, gearRatio:14.1, PmotKW:214*0.7457, systems_lb:507 },
  { key:"L+C-E", fc_lb:152, dgw_lb:8210,   nRotors:8, R_ft:5.00, tip:585, solidity:0.267,  rotor_lb:948, tilting:false,
    drive_lb:358, motor_lb:632, gearRatio:3.85, PmotKW:139*0.7457, systems_lb:540 },
  { key:"L+C-TE", fc_lb:111, dgw_lb:8190,  nRotors:8, R_ft:5.00, tip:668, solidity:0.217,  rotor_lb:849, tilting:false },
  { key:"TW-TE", fc_lb:231, dgw_lb:6760,   nRotors:8, R_ft:3.66, tip:550, solidity:0.247,  rotor_lb:232, tilting:true },
];

const pct = (g, w) => (w ? (g - w) / w * 100 : NaN);
const f1 = (x) => (isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(1)}%` : "  n/a");
const bar = "=".repeat(78);

console.log(bar);
console.log("COMPONENT-LEVEL VALIDATION — each model alone, at NASA's published inputs");
console.log("no sizing loop, no convergence, no feedback: a component cannot hide");
console.log("behind another one here");
console.log(bar);

/* ── ROTOR GROUP ──────────────────────────────────────────────────────
   The headline comparison this file was built for: an invented [CAL]
   constant against NDARC's published regression, on the same 8 aircraft. */
console.log(`\n── ROTOR GROUP  (NASA Table 12 "Rotor group weight", 8 variants)`);
console.log(`   nu (flap frequency) and blade count are NOT published per vehicle,`);
console.log(`   so both are SWEPT and the range reported rather than chosen.\n`);

/* ── nu BY PUBLISHED ROTOR TYPE, NOT SWEPT ────────────────────────────
   NASA publish BOTH the values and which vehicle uses which:
     "Flapping (flap frequency 1.03/rev, 4% hinge offset) and hingeless
      (flap frequency 1.25/rev) rotors are considered."
        - Concept Vehicles for VTOL Air Taxi Operations, Table 8 discussion
     "using FLAPPING rotors and collective control"          (quadrotor)
     "This design has RIGID rotors" / "These HINGELESS,
      fixed-pitch rotors"                                    (lift+cruise)
        - Johnson & Silva 2022 sec.5.1 and sec.6.3
   The lift+cruise rotors STOP in cruise and must survive edgewise flow as a
   cantilever, which is why they are rigid. Assigning nu by that published
   type is a sourced physical property, NOT a fit to the weight data. */
const NU_BY_TYPE = { flapping: 1.03, hingeless: 1.25 };
const ROTOR_TYPE = { "SMR-TS":"flapping", "Quad-TS":"flapping", "Quad-E":"flapping",
  "SbS-TS":"flapping", "SbS-E":"flapping", "L+C-E":"hingeless", "L+C-TE":"hingeless",
  "TW-TE":"flapping" };

function scoreRotor(model, nBlades, nu) {
  const errs = [];
  for (const v of VEHICLES) {
    const R_m = v.R_ft / FT;
    const nuV = nu === "byType" ? NU_BY_TYPE[ROTOR_TYPE[v.key] ?? "flapping"] : nu;
    const out = rotorGroup(
      { rotorMassModel: model, nBlades, rotorFlapFreq: nuV, solidity: v.solidity },
      { nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT,
        diskArea_m2: v.nRotors * Math.PI * R_m * R_m, isTilting: v.tilting },
      K.rotorMassPerDiskAreaKgM2);
    errs.push(pct(out.mass, v.rotor_lb / LB));
  }
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
  return { errs, mae };
}

const calRow = scoreRotor("diskArea", 3, 1.25);
console.log(`   ${"model".padEnd(26)} ${VEHICLES.map(v => v.key.padStart(8)).join("")}   MAE`);
console.log(`   ${"[CAL] 2.0 kg/m2 disk".padEnd(26)} ${calRow.errs.map(e => f1(e).padStart(8)).join("")}  ${calRow.mae.toFixed(1)}%`);

let best = { mae: Infinity };
for (const model of ["afdd82", "afdd00"]) {
  for (const nb of [2, 3, 4, 5]) {
    for (const nu of [1.03, 1.10, 1.25]) {
      const r = scoreRotor(model, nb, nu);
      if (r.mae < best.mae) best = { ...r, model, nb, nu };
    }
  }
}
for (const model of ["afdd82", "afdd00"]) {
  for (const nu of [1.03, 1.10, 1.25]) {
    const r = scoreRotor(model, 3, nu);
    console.log(`   ${`${model.toUpperCase()} 3 blades nu=${nu}`.padEnd(26)} ${r.errs.map(e => f1(e).padStart(8)).join("")}  ${r.mae.toFixed(1)}%`);
  }
}
for (const model of ["afdd82", "afdd00"]) {
  const r = scoreRotor(model, 3, "byType");
  console.log(`   ${`${model.toUpperCase()} 3 bl nu BY TYPE`.padEnd(26)} ${r.errs.map(e => f1(e).padStart(8)).join("")}  ${r.mae.toFixed(1)}%`);
}
console.log(`\n   best over the swept grid: ${best.model.toUpperCase()}, ${best.nb} blades, `
          + `nu=${best.nu} -> MAE ${best.mae.toFixed(1)}%`);
console.log(`   (BOUND for a single UNIFORM nu. A best-fit uniform nu would be a fit;`);
console.log(`    nu BY PUBLISHED ROTOR TYPE is not — NASA give 1.03 flapping /`);
console.log(`    1.25 hingeless AND say which vehicle uses which.)`);

/* ── SYSTEMS GROUP ────────────────────────────────────────────────────
   ADDED 2026-08-31 because nothing tested it and it turned out to be the
   largest un-measured error in the buildup.

   GROUP BOUNDARIES FIRST, because getting them wrong is how this project has
   produced false findings before:
     - packSystems is battery PACKAGING. In NASA's statement the battery sits
       in the PROPULSION group (fuel system), so packaging does NOT belong in
       systems. Excluded.
     - flightControls IS INSIDE "SYSTEMS AND EQUIPMENT" per NDARC fig. 8-3a
       (which lists flight controls, auxiliary power, instruments, hydraulic,
       pneumatic, electrical, AVIONICS, furnishings, environmental, anti-icing
       and load & handling under that one heading). Whether Table 12's separate
       flight-controls line is a CHILD of its systems total or a SIBLING was an
       open ambiguity, reported here as a range.
       IT IS NOW RESOLVED, BY CONTRADICTION. Subtracting the sourced avionics
       and furnishings from the published systems total, with flight controls
       counted INSIDE, leaves 11.6 / 5.3 / -6.5 kg for electrical, instruments,
       hydraulics, APU and lights on 2.2-3.7 tonne aircraft. A NEGATIVE
       electrical group is impossible, so the systems line EXCLUDES flight
       controls and reading A is the correct one. Reading B is kept in the
       output only as the evidence for that conclusion.
     - avionics IS inside systems and equipment, confirmed from the same
       figure. That was checked because NDARC calls it "avionics group (mission
       equipment)", which reads like a separate group and is not.
   What is left — avionics + electrical + ECS + furnishings — is the closest
   like-for-like against NASA's published `systems_lb`.

   SOURCE HUNT DONE 2026-08-31, and it EXONERATED the prime suspect.
   The working hypothesis was that the avionics buildup was wrong: it had
   doubled a flat 45 kg to 92.5 kg and was the one entry in provenance.js
   marked "unverified". It is now CORROBORATED and the hypothesis is dead.
     FLOPS (The Flight Optimization System Weights Estimation Method, Eq. 108)
       WAVONC = 15.8 * DESRNG^0.1 * NFLCR^0.7 * FPAREA^0.43   [lb]
     At NASA's quadrotor design point — 75 nmi, 1 flight crew, a 7.2 x 1.65 m
     fuselage giving 128 ft^2 planform — that is 196 lb = 88.9 kg against this
     model's 92.5 kg. Agreement within 4%, from a completely independent
     regression. AVIONICS IS NOT THE PROBLEM.

   FURNISHINGS is now partly sourced: NASA (Silva 2024) price removable seats
   at 23 lb = 10.43 kg each for a UAM aircraft of this class, so the seat term
   is [SRC] and only the trim/insulation/emergency remainder is [LAY]. The
   total per seat is unchanged, so this changes no number — it changes what is
   KNOWN about the number, which is the point of a source hunt.

   ELECTRICAL could not be anchored. FLOPS has two equations and they disagree
   wildly for this class: the transport form (Eq. 106) gives ~513 kg and the
   short-form (Eq. 107) ~147 kg for a Joby-sized aircraft, against this model's
   ~89 kg. Both are fitted to conventional aircraft whose electrical
   architecture is nothing like a distributed-electric one. NO ANCHOR FOUND.

   NOT TUNED. Nothing here was adjusted to close the gap — that would be
   fitting. What the hunt bought is a smaller suspect list: avionics is
   cleared, furnishings is half-sourced, and the remaining gap sits in
   electrical + environmental, where no usable published model exists. */
console.log(`
── SYSTEMS GROUP  (NASA Table 12 "Systems and equipment weight")`);
console.log(`   boundaries: avionics + electrical + ECS + furnishings.`);
console.log(`   EXCLUDES battery packaging (propulsion group) and flight controls (tested above).`);
console.log(`   ${"vehicle".padEnd(10)} ${"published".padStart(10)} ${"ours".padStart(10)} ${"err(A)".padStart(8)} ${"err(B)".padStart(9)}`);
console.log(`   A = systems EXCLUDES flight controls (CORRECT — B implies a negative electrical group)`);
for (const v of VEHICLES.filter(x => x.systems_lb)) {
  const MTOW_kg = v.dgw_lb / LB;
  const pubKg = v.systems_lb / LB;
  const AV = 92.5, FURN = 90.0;
  /* Read the ACTUAL constants rather than restating them — a test that
     hardcodes the value it is checking silently stops testing anything. */
  const elec = K.electricalFrac * MTOW_kg, ecs = K.ecsAntiIceFrac * MTOW_kg;
  const ours = AV + FURN + elec + ecs;
  /* Reading A: Table 12's systems line EXCLUDES flight controls (compare like
     for like). Reading B: it INCLUDES them, so add ours in and compare to the
     same published total. The truth is one of these; the table cannot say. */
  const eA = 100 * (ours / pubKg - 1);
  const eB = 100 * ((ours + v.fc_lb / LB) / pubKg - 1);
  console.log(`   ${v.key.padEnd(10)} ${pubKg.toFixed(1).padStart(10)} ${ours.toFixed(1).padStart(10)} `
    + `${((eA > 0 ? "+" : "") + eA.toFixed(1) + "%").padStart(8)} `
    + `${((eB > 0 ? "+" : "") + eB.toFixed(1) + "%").padStart(9)}`);
}
console.log(`
   THE FINDING SURVIVES THE SOURCE HUNT, but the suspect list is smaller.
   Avionics is CLEARED (FLOPS agrees within 4%). Furnishings now has a sourced
   seat term (NASA, 23 lb/seat). The residual sits in ELECTRICAL and
   ENVIRONMENTAL, modelled as flat fractions of MTOW (3.0% and 1.5%) for which
   no eVTOL-relevant published model was found — FLOPS' two electrical
   equations disagree by 3.5x on this class because both are fitted to
   conventional aircraft.
   The boundary ambiguity is real and is reported as a RANGE rather than
   resolved by choosing the flattering reading.`);

/* ── DRIVE SYSTEM ─────────────────────────────────────────────────────
   Already validated in engine/drivesystem.js against 2 vehicles; this puts it
   in the same table as everything else so the comparison is uniform. */
console.log(`\n── DRIVE SYSTEM  (NASA Table 12 "Drive system weight")`);
console.log(`   ${"vehicle".padEnd(10)} ${"published".padStart(10)} ${"AFDD00/train".padStart(13)} ${"error".padStart(8)}`);
for (const v of VEHICLES.filter(x => x.drive_lb)) {
  const R_m = v.R_ft / FT;
  const omega = (v.tip / FT) / R_m;
  const out = driveSystem({ motorGearRatio: v.gearRatio },
    { nRotors: v.nRotors, PmotKW: v.PmotKW, omegaRotor: omega });
  console.log(`   ${v.key.padEnd(10)} ${(v.drive_lb / LB).toFixed(1).padStart(8)} kg ${out.mass.toFixed(1).padStart(11)} kg ${f1(pct(out.mass, v.drive_lb / LB)).padStart(8)}`);
}

/* ── MOTOR GROUP ──────────────────────────────────────────────────────
   THE LARGEST SINGLE MASS IN THE AIRCRAFT, AND UNTIL NOW UNTESTED. At the app
   default the motor group is 333 kg — more than the fuselage — and motor+drive
   is the worst metric against NASA's published weight statements at +33% to
   +35%. engine/drivesystem.js already scores -1.9% / +1.7% on two of the three
   vehicles, so the gearbox is not the cause; this table asks the motor model
   the same question directly, at NASA's own published shaft power and rotor
   speed, with no sizing loop to hide behind.

   The four models are REFERENCE CLASSES, not refinements of one another: which
   population the regression was fitted to is the entire question. */
console.log(`
── MOTOR GROUP  (NASA Table 12 "Motor weight", 3 electric variants)`);
console.log(`   at NASA's published power per motor and rotor speed; gear ratios are`);
console.log(`   NASA's own, recovered by inverting their motor-group weights.
`);
{
  const MODELS = ["emraxTorque", "nasaTorque", "torqueDensity", "specificPower"];
  console.log(`   ${"vehicle".padEnd(9)}${"published".padStart(10)}` +
    MODELS.map(m => m.padStart(15)).join(""));
  const errs = Object.fromEntries(MODELS.map(m => [m, []]));
  let tauLine = [];
  for (const v of VEHICLES.filter(x => x.motor_lb)) {
    const R_m = v.R_ft / FT, omega = (v.tip / FT) / R_m;
    const pub = v.motor_lb / LB;
    const cells = MODELS.map(m => {
      const r = motorMass({ model: m, P_kW: v.PmotKW, omega, gearRatio: v.gearRatio, K });
      const tot = v.nRotors * r.kg;
      errs[m].push(Math.abs(pct(tot, pub)));
      if (m === "emraxTorque") tauLine.push(`${v.key} ${r.tauNm.toFixed(0)} N·m`
        + (r.tauNm > EMRAX_TAU_MAX_NM ? " (EXTRAPOLATED)" : ""));
      return `${tot.toFixed(0)}kg ${f1(pct(tot, pub))}`.padStart(15);
    });
    console.log(`   ${v.key.padEnd(9)}${(pub.toFixed(0) + " kg").padStart(10)}${cells.join("")}`);
  }
  console.log("");
  for (const m of MODELS) {
    const mae = errs[m].reduce((a2, b3) => a2 + b3, 0) / errs[m].length;
    console.log(`   ${m.padEnd(16)} MAE ${mae.toFixed(1)}%${m === "emraxTorque" ? "   <- DEFAULT" : ""}`);
  }
  console.log(`
   motor torque demanded at NASA's own design points:`);
  console.log(`     ${tauLine.join(" · ")}`);
  console.log(`   (the EMRAX fit runs to ${EMRAX_TAU_MAX_NM} N·m; beyond it the model adds`);
  console.log(`    power at the family's specific power rather than extrapolating.)`);
}

/* ── INSTALLED MOTOR MARGIN ───────────────────────────────────────────
   WHY THE MOTOR GROUP IS WRONG, AND IT IS NOT THE MASS MODEL.

   The motor mass table above shows every model UNDER-predicting NASA's
   published motor weights, yet the sized aircraft OVER-predicts motor+drive by
   +33%. Both are true, and this table is why: the sizing loop installs more
   motor power than NASA does, and the mass follows the power.

   NASA's installed margin is RECOVERED HERE FROM THEIR OWN PUBLISHED NUMBERS —
   gross weight, disk loading and figure of merit — through momentum theory, so
   it does not depend on anything this engine computes:

       P_hover/rotor = (W/FM) sqrt(DL / 2 rho) / N      at 5,000 ft ISA+20

   The result is NOT a constant, and that is the finding. This engine applies a
   single twRatio of 1.30 to every layout, which momentum theory turns into a
   uniform POWER factor of 1.30^1.5 = 1.482. */
console.log(`
── INSTALLED MOTOR MARGIN  (recovered from NASA's own DL, FM and DGW)`);
{
  const RHO_5K_ISA20 = 0.985;     // 5,000 ft, ISA+20 — NASA's sizing day
  const PSF_N = 47.8803, G = 9.80665;
  const NASA = [
    { k:"Quad-E", W_kg:2939.3, DL:3.00, FM:0.700, N:4, hp:168,
      note:"rotor-borne, 4 INDEPENDENT rotors — must hover on N-1" },
    { k:"SbS-E",  W_kg:2222.6, DL:3.50, FM:0.680, N:2, hp:214,
      note:"INTERCONNECTED — a motor failure costs no rotor" },
    { k:"L+C-E",  W_kg:3724.0, DL:14.0, FM:0.740, N:8, hp:139,
      note:"WING-BORNE — the wing unloads the rotors; NASA keep baseline motors" },
  ];
  const OURS = Math.pow(1.30, 1.5);
  console.log(`   ${"vehicle".padEnd(9)}${"hover kW/rotor".padStart(15)}${"NASA kW/motor".padStart(15)}`
    + `${"NASA factor".padStart(13)}${"ours".padStart(8)}${"over by".padStart(10)}`);
  for (const v of NASA) {
    const P = (v.W_kg * G / v.FM) * Math.sqrt(v.DL * PSF_N / (2 * RHO_5K_ISA20)) / 1000 / v.N;
    const nasaKW = v.hp * 0.7457, factor = nasaKW / P;
    console.log(`   ${v.k.padEnd(9)}${P.toFixed(1).padStart(15)}${nasaKW.toFixed(1).padStart(15)}`
      + `${factor.toFixed(3).padStart(13)}${OURS.toFixed(3).padStart(8)}`
      + `${(OURS / factor).toFixed(2).padStart(9)}x`);
  }
  for (const v of NASA) console.log(`     ${v.k.padEnd(8)} ${v.note}`);
  console.log("");
  console.log(`   NASA's margin is CONFIGURATION-DEPENDENT (1.425 / 1.080 / 0.911) and this`);
  console.log(`   engine applies a uniform 1.482 — which is the motor+drive error, and it`);
  console.log(`   tracks: +8.7% / +35.2% / +33.3%. NASA say so themselves (corpus S3270):`);
  console.log(`   "This power factor is a FUNCTION OF THE AIRCRAFT CONFIGURATION".`);
  console.log("");
  console.log(`   RESOLVED — AND IT IS NOT A MODEL ERROR. The quantity being compared is`);
  console.log(`   NASA's own HOVER LOAD FACTOR n_z, and Hartman, Altamirano & Suh (VFS 81st`);
  console.log(`   Forum, 2025) size this exact lift+cruise against it, sweeping n_z from`);
  console.log(`   1.00 g to 1.77 g. Their finding about the baseline is decisive:`);
  console.log(`     "the operating torque required to hover EXCEEDS the continuous operation`);
  console.log(`      rated torque ... this design would NOT BE ACCEPTABLE without`);
  console.log(`      modification"  — satisfied only "by the 1.35 g design variant", so`);
  console.log(`     "design variants below 1.35 g load factor could be eliminated".`);
  console.log("");
  console.log(`   Table 12's weight statements are designs at about n_z = 1.00 — the point`);
  console.log(`   NASA's own flight-dynamics work REJECTS. This engine sizes at n_z = 1.30,`);
  console.log(`   just under their 1.35 floor, so the motor+drive gap measures a DESIGN`);
  console.log(`   POINT DIFFERENCE, not model error: n_z^1.5 gives 1.482x against 1.000x.`);
  console.log(`   Measured confirmation: moving the default to 1.35 makes the comparison`);
  console.log(`   WORSE (13 of 21 within +/-5% -> 8, motor+drive +33% -> +44%), which is the`);
  console.log(`   benchmark drifting further from a 1.00 g aircraft, not the model decaying.`);
  console.log(`   Separately, deriving n_z per configuration from N/(N-1) was refuted`);
  console.log(`   (1.54 / 1.00 / 1.22 against 1.425 / 1.080 / 0.911) — see note 20.`);
}

/* ── NACELLE GROUP ────────────────────────────────────────────────────
   No published line to score against — Table 12 does not break the nacelle
   group out of structures. Reported as a MAGNITUDE check instead, which is
   what it was built to answer. */
console.log(`\n── NACELLE GROUP  (no published line in Table 12 — magnitude check only)`);
console.log(`   built to test the claim that a missing nacelle group explained a`);
console.log(`   ~290 kg lift+cruise structures gap:\n`);
for (const v of VEHICLES.filter(x => x.motor_lb)) {
  const out = nacelleGroup({}, { motorMassKg: v.motor_lb / LB, nMotors: v.nRotors, MTOW: 3000 });
  console.log(`   ${v.key.padEnd(10)} motors ${(v.motor_lb / LB).toFixed(0).padStart(4)} kg over ${String(v.nRotors).padStart(2)} -> nacelle ${out.mass.toFixed(1).padStart(6)} kg`);
}
console.log(`   -> the group is tens of kg, not hundreds. The 290 kg inference was wrong.`);

console.log(`\n${bar}`);
console.log("Component accuracy is NOT the same as loop accuracy. A component that");
console.log("scores well here can still produce a bad aircraft if it is fed the wrong");
console.log("inputs by the loop -- and a component that scores badly here is a defect");
console.log("regardless of what the loop happens to converge to.");
console.log(bar);

/* ── FLIGHT CONTROLS ──────────────────────────────────────────────────
   The second mismatch flagged by the method-fidelity audit: a flat 2.5% of
   MTOW [FRAC] against NDARC AFDD82 §29-8. Table 12 publishes the flight
   controls line for all eight variants, so this is directly testable — and
   the result does NOT go the way the audit assumed. */
console.log(`\n── FLIGHT CONTROLS  (NASA Table 12 "Flight controls weight", 8 variants)`);
console.log(`   ${"vehicle".padEnd(9)} ${"published".padStart(9)} ${"% of MTOW".padStart(10)} ${"FRAC 2.5%".padStart(11)} ${"err".padStart(8)} ${"AFDD82".padStart(10)} ${"err".padStart(9)}`);
let fracErrs = [], afddErrs = [];
for (const v of VEHICLES) {
  const MTOW = v.dgw_lb / LB, want = v.fc_lb / LB;
  const R_m = v.R_ft / FT;
  const g = { MTOW, nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT,
              sHt_m2: 0, nTilting: v.tilting ? v.nRotors : 0 };
  const fr = flightControls({ solidity: v.solidity }, g, K.flightControlsFrac);
  const af = flightControls({ flightControlsModel: "afdd", solidity: v.solidity,
                              rotorControl: "rpm" }, g, K.flightControlsFrac);
  fracErrs.push(pct(fr.mass, want)); afddErrs.push(pct(af.mass, want));
  console.log(`   ${v.key.padEnd(9)} ${want.toFixed(1).padStart(7)} kg ${(100*want/MTOW).toFixed(2).padStart(9)}% ${fr.mass.toFixed(1).padStart(9)} kg ${f1(pct(fr.mass,want)).padStart(8)} ${af.mass.toFixed(1).padStart(8)} kg ${f1(pct(af.mass,want)).padStart(9)}`);
}
const mae = (a) => a.reduce((x, y) => x + Math.abs(y), 0) / a.length;
console.log(`\n   [FRAC] 2.5% of MTOW   MAE ${mae(fracErrs).toFixed(1)}%`);
console.log(`   AFDD82 §29-8          MAE ${mae(afddErrs).toFixed(1)}%`);
console.log(`\n   THE FLAGGED "MISMATCH" RESOLVES THE OTHER WAY. AFDD's N_rotor^1.3855`);
console.log(`   term describes mechanical control runs from a cockpit to every rotor;`);
console.log(`   a distributed-electric aircraft with fly-by-wire has wires. Importing`);
console.log(`   the equation would replace a fraction that is modestly high with a`);
console.log(`   regression that is several times high. The [FRAC] model is KEPT.`);
console.log(`   Published spread is 1.36%-3.42% of MTOW, and the top of it is the`);
console.log(`   TILTWING — NDARC counts "conversion (rotor tilt) flight controls" as`);
console.log(`   its own category, which is real configuration dependence.`);
