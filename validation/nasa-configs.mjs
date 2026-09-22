/* =====================================================================
   PER-CONFIGURATION BENCHMARK — NASA reference vehicles, own parameters in
   =====================================================================
   WHAT THIS DOES, AND WHY IT IS DIFFERENT FROM validate.mjs

   `validate.mjs` scores against brochure-grade aircraft (Joby, Archer, VX4,
   Beta) using ONE shared technology baseline, because their real geometry is
   not published. That is the right test for "would this tool have predicted a
   real aircraft", but it confounds the sizing loop with a pile of assumed
   inputs, and three of its four aircraft have data problems severe enough to
   put a 5% target out of reach (see eVTOL_Sizing_Research/README.md).

   This does the other test, the one that isolates the LOOP: take NASA's
   reference vehicles, plug in THEIR OWN published parameters — rotor radius,
   disk loading, tip speed, solidity, figure of merit, rotor count, battery,
   payload, range — and ask whether our loop reproduces THEIR published weight
   statement. Same mission, same technology, same geometry. Any error left is
   ours.

   SOURCE: NASA/TM-20210017971 Table 12, "Comparison of Current NASA
   Six-Passenger UAM Reference Vehicle Attributes". Full component weight
   statements for eight vehicle variants across five configurations, all sized
   to the same 75 nm mission by NDARC.

   ── THE BATTERY LINE, RECONCILED ─────────────────────────────────────
   Table 12 carries BOTH "Battery weight" and "Fuel system weight" for the
   electric vehicles, and they are not the same thing. Measured across all
   three all-electric columns:

       vehicle   capacity   battery line    fuel-system line
       Quad-E    369.4 kWh  518.8 Wh/kg     399.3 Wh/kg
       SbS-E     235.0 kWh  519.6 Wh/kg     401.6 Wh/kg
       L+C-E     400.0 kWh  521.8 Wh/kg     400.8 Wh/kg

   The fuel-system line lands on 399-402 Wh/kg for all three — exactly NASA's
   stated "400 Wh/kg installed usable pack". So the FUEL SYSTEM line is the
   installed pack and the battery line is cell-level (~520 Wh/kg, i.e. a ~77%
   packaging factor). Our Wbat is an installed pack mass, so it is compared
   against the FUEL SYSTEM line. Getting this backwards would put every battery
   comparison out by 30%.

   ── THE GROUP BOUNDARIES ARE NDARC'S, NOT OURS ───────────────────────
   Fixed 2026-08-28, and it invalidated the conclusions previously drawn from
   the `struct` and `prop` rows. NDARC's weight statement (TP-20250010468
   fig. 8-3a, itself following SAWE RP8A) draws its group lines like this:

     STRUCTURE  = wing + ROTOR GROUP + empennage + fuselage + alighting gear
                  + engine section/nacelle + air induction
     PROPULSION = engine system + propeller/fan install + FUEL SYSTEM
                  + DRIVE SYSTEM

   Our internal `groupSums` does neither: it puts rotors in PROPULSION and the
   battery outside every group. So the old comparison charged our propulsion
   group with rotor mass while measuring it against a NASA number that is 76%
   battery — two errors pointing opposite ways, in the same cell.

   Arithmetic confirms the published table follows fig. 8-3a. For Quad-E,
   structures 1640 + propulsion 2670 + systems 536 = 4846 against an empty
   weight of 5270; adding the separately-listed rotor group (628) and fuel
   system (2040) as well gives 7514, which exceeds empty weight and is
   therefore impossible. Rotor group is INSIDE structures and fuel system is
   INSIDE propulsion. The same test holds for all eight columns.

   Decomposing propulsion accordingly gives a motor group of 233/145/632 lb
   for Quad-E/SbS-E/L+C-E, i.e. 4.74/4.85/4.53 kW/kg — three vehicles agreeing
   to 7%, which is the check that this reading of the table is right.

   ⚠ AND THE OTHER NASA TABLE USES THE OTHER CONVENTION. Johnson & Silva 2022
   Table 3 (validation/nasa-table3.js) lists Battery as a row SEPARATE from
   Propulsion — its figure 6 caption states "weight empty = structure +
   propulsion + systems + vibration control + contingency". So "propulsion"
   means one thing in TM-20210017971 Table 12 and another in AJ Table 3. Check
   which convention a NASA weight statement uses before comparing anything to
   it; the word alone does not tell you.

   ── WHY EACH VEHICLE CARRIES A GEAR RATIO ────────────────────────────
   NASA's electric quadrotor and side-by-side are GEARED — that is what their
   397 lb and 255 lb drive systems are. Benchmarking our direct-drive default
   against them compares two different architectures, and the motor mass is
   where it shows: at rotor speed our motors come out 4-15x NASA's published
   motor group. Each vehicle therefore carries `gearRatio`, recovered by
   inverting NASA's own motor regression against NASA's own motor weight (see
   engine/drivesystem.js). This makes the comparison like-for-like; it does
   NOT change the engine's own direct-drive default.

   ── REFUTED: NASA'S PUBLISHED C-RATES ARE OUTPUTS, NOT CONSTRAINTS ───
   Table 12 publishes hover C-rate 1.1 / 1.4 / 2.4 and cruise 0.8 / 0.7 / 0.7
   for Quad-E / SbS-E / L+C-E. Our engine's `maxCRate` defaults to 4.0, so its
   power-limited battery branch (W_P = P_hover / SP) never binds, and feeding
   NASA's numbers in looked like the obvious fix for the lift+cruise energy
   shortfall. IT DIVERGES: L+C-E goes to +386% MTOW, because W_P grows linearly
   in P_hover while P_hover grows as W^1.5, so once W_P binds the loop runs
   away — the exact failure the engine.js comment on spBattery warns about.

   The reason is a category error. A published C-rate is hover power divided by
   installed capacity for a CONVERGED design — an OUTPUT. Imposing it as a
   design constraint asserts something NASA never did. Recorded here so it is
   not retried. (Our L+C sits at C = 2.52 against their 2.4 anyway, so the
   quantity agrees; it is only unusable as an input.)

   ── WHAT IS NOT DETERMINABLE, AND SO IS NOT ASSUMED ──────────────────
   Table 12 has three unlabelled airspeed rows per vehicle ("at DGW 6kISA
   (KTAS)"). They are almost certainly best-endurance, best-range and maximum,
   but the extraction does not label them, so cruise speed is taken from the
   MIDDLE row as best-range and FLAGGED. If that is wrong the cruise energy is
   wrong with it.

   Run: node validation/nasa-configs.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { rotorGroup, flapFreqFor } from "../src/engine/rotorgroup.js";
import { twRatioFor } from "../src/engine/configuration.js";

const LB = 2.20462, FT = 3.28084, KT = 0.514444;


import { NASA_VEHICLES, PAYLOAD_KG, RANGE_KM, POWERTRAIN_ETA, paramsFor } from "./nasa-vehicles.js";
export { NASA_VEHICLES, POWERTRAIN_ETA, paramsFor };



const err = (got, want) => (want ? (got - want) / want * 100 : null);
const f = (x, n = 1) => (x == null || !isFinite(x) ? "  n/a" : x.toFixed(n));
const pct = (x) => (x == null ? "   n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);

/* ── PER-GROUP TOLERANCE, FROM AFDD'S OWN PUBLISHED FIT STATISTICS ─────
   NDARC Theory Manual (NASA/TP-2015-218751) section 27-13 p.241 and Table
   27-21 give the average error of the AFDD weight equations AGAINST THE
   CONVENTIONAL ROTORCRAFT THEY WERE REGRESSED ON. That is the best case the
   method can produce, and it is published, so it is not ours to choose.

   This replaces a flat +/-5% applied to every group. That number is
   approximately AFDD's error for the WHOLE AIRCRAFT in population (5.3%),
   and applying it per group demanded the rotor group be 1.7x better than
   AFDD manages on helicopters, and the tails 4.5x better - on eVTOLs, which
   are not in the fitting population at all. It was not a stretch target, it
   was arithmetically impossible, and its real cost was that group-level
   reporting felt like failure and got avoided. That is how a -46.7% rotor
   error sat hidden inside a -0.7% structures total. See research note 27.

   `ref` is AFDD's in-population average error for the closest matching group.
   null means AFDD publishes no figure for it - battery, installed energy and
   the systems fractions are not AFDD parametric equations - and those are
   reported without a reference line rather than given an invented one. */
const AFDD_INPOP = {
  MTOW:     { ref: 5.3,  src: "sum of all parametric weight, 42 aircraft" },
  empty:    { ref: 5.3,  src: "sum of all parametric weight, 42 aircraft" },
  struct:   { ref: 6.1,  src: "structural group, 42 aircraft" },
  rotor:    { ref: 8.6,  src: "rotor group alone, 42 aircraft" },
  motDrv:   { ref: 10.9, src: "propulsion group, 42 aircraft" },
  driveSys: { ref: 8.6,  src: "gear box + rotor shaft AFDD00, 52 aircraft" },
  fltCtrl:  { ref: 8.7,  src: "flight controls group, 42 aircraft" },
  systems:  { ref: null, src: "no AFDD parametric equation for this group" },
  pack:     { ref: null, src: "battery is not an AFDD group" },
  energy:   { ref: null, src: "installed energy is not a weight equation" },
};

const bar = "=".repeat(86);
console.log(bar);
console.log("PER-CONFIGURATION BENCHMARK — NASA reference vehicles, own parameters plugged in");
console.log("source: NASA/TM-20210017971 Table 12 · mission 75 nm, 1200 lb payload, 400 Wh/kg pack");
console.log(bar);

const rows = [];
const GEO_USED = {};
for (const v of NASA_VEHICLES) {
  let R;
  try { R = runSizing(paramsFor(v)); }
  catch (e) { console.log(`\n${v.label}\n   THREW: ${e.message}`); continue; }

  const pub = v.published;
  /* Re-roll our components onto NDARC's OWN group boundaries (fig. 8-3a) —
     see the header. `groupSums` is our internal split and does not match. */
  const W = R.weightGroupsRaw;
  const structNDARC = W
    ? W.wing + W.fuselage + W.vtail + W.gear + W.booms + W.rotors
    : null;
  /* Motor + drive train only. Compared against the published propulsion group
     with its fuel-system (battery) line removed, because our propulsion group
     carries no battery — both sides are then "everything that turns the rotor,
     minus the energy store". The battery is scored separately as `pack`. */
  const driveNDARC = W
    ? W.motors + W.inverters + W.cruisePropulsion + (W.driveSys ?? 0)
    : null;
  /* ── THREE MORE GROUPS, ALREADY PUBLISHED AND PREVIOUSLY UNUSED ─────
     Table 12 gives a rotor group, a systems group and a flight-controls line
     for every vehicle. Only the first was being used, and only inside `struct`;
     the other two sat in the file unscored — the systems figure was even being
     computed in a debug print and then thrown away. Scoring them takes the
     benchmark from 21 published comparisons to 30.

     BOUNDARIES ARE THE WHOLE DIFFICULTY, and they are not guessed here:
     validation/components.mjs already established them by measurement.
       systems  = avionics + electrical + ECS + furnishings.
                  EXCLUDES flight controls (scored separately) and EXCLUDES
                  battery packaging, which NDARC puts in the propulsion group.
                  The alternative reading — systems including flight controls —
                  was tested there and implies a NEGATIVE electrical group, so
                  it is not merely less tidy, it is impossible.
       rotor    = blades and hubs only, the same line components.mjs scores.
       fltCtrl  = Table 12's own flight-controls row. */
  const systemsNDARC = W
    ? (W.avionics ?? 0) + (W.electrical ?? 0) + (W.ecs ?? 0) + (W.furnishings ?? 0)
    : null;
  const got = {
    MTOW:    R.MTOW,
    /* NASA's empty weight INCLUDES the battery; ours excludes it. Proof from
       the table itself: Quad-E operating weight 5280 lb = empty 5270 + 10 lb
       crew/fluids, and 5280 + 1200 lb payload = 6480 lb DGW exactly. The same
       identity closes for all three all-electric columns. Comparing our
       battery-free Wempty against it understated empty weight by ~30-39% while
       MTOW was within 4% — an error that cancels out of MTOW and so hides. */
    empty:   R.Wempty + R.Wbat,
    pack:    R.Wbat,
    struct:  structNDARC,
    motDrv:  driveNDARC,
    driveSys: W ? (W.driveSys ?? 0) : null,
    rotor:   W ? (W.rotors ?? 0) : null,
    systems: systemsNDARC,
    fltCtrl: W ? (W.flightControls ?? 0) : null,
    energy:  R.Etot,
    /* INSTALLED SHAFT RATING PER LIFT MOTOR. Table 12 publishes 'MRP power
       per lifter' for every vehicle and this harness never scored it, which
       is why a +33-37% motDrv bias sat unexplained: the mass model was being
       blamed for what was a POWER error. Scoring it separates the two.
       PARTLY CIRCULAR ON THE QUADROTOR, and said out loud rather than
       buried: there the installed-margin condition still governs, and that
       margin now comes from Table 12, so the Quad-E row is closer to a
       round-trip than a test. On SbS-E and L+C-E the governing condition is
       NASA's own 500 fpm vertical climb, so those two are real. */
    liftPower: R.PmotInstalledKW,
    /* FUSELAGE AND TOTAL DRAG AREA, ft^2. Both published per vehicle (AIAA
       2018-3847 Table 3 / TM Table 12) and neither was scored. The fuselage
       row is a direct check on the Raymer buildup against NASA's flat 0.0045;
       the total row was impossible to score before because Dq_ft2 read
       CD0*Swing and returned 0.00 for anything without a wing. */
    fusDq:   R.dragAreas?.fuselage != null ? R.dragAreas.fuselage * 10.7639 : null,
    totalDq: R.Dq_ft2,
  };
  const want = {
    MTOW:   pub.DGW_lb / LB,
    empty:  pub.empty_lb / LB,
    pack:   pub.pack_lb / LB,
    struct: pub.structures_lb / LB,                          // includes rotor group
    motDrv: (pub.propulsion_lb - pub.pack_lb) / LB,          // propulsion less fuel system
    driveSys: pub.drive_lb / LB,
    rotor:  pub.rotor_lb / LB,
    systems: pub.systems_lb / LB,
    fltCtrl: pub.fc_lb / LB,
    energy: pub.capacity_MJ / 3.6,
    liftPower: pub.mrp_hp_lifter == null ? null : pub.mrp_hp_lifter * 0.7457,
    fusDq:   v.fusDq_ft2 ?? null,
    totalDq: v.Dq_ft2 ?? null,
  };

  console.log(`\n── ${v.label}   [${v.configType}, ${v.nRotors} rotors, R=${v.radius_ft} ft]`);
  console.log(`   converged: ${R.r2Converged ? "yes" : "NO — result unreliable"}` +
    (R.weightBuildupUsed === false
      ? `   ⚠ BUILDUP FELL BACK to the ewf fraction on ${R.weightBuildupFallbacks} iteration(s)` +
        (R.weightBuildupLastTotal != null ? ` (buildup total ${R.weightBuildupLastTotal} kg vs MTOW ${R.MTOW.toFixed(0)} kg)` : "") +
        ` — empty weight below is NOT a component buildup`
      : ""));
  if (R.driveSystem) console.log(`   drive: ${R.driveSystem.note}`);
  console.log("   quantity        published      engine        error");
  /* EVTOL_DEBUG=1 dumps the propulsion split, because "motDrv +29.6%" does not
     say WHICH of motors / inverters / drive system is responsible. */
  if (process.env.EVTOL_DEBUG) {
    const Wg = R.weightGroupsRaw || {};
    const sysOurs = (Wg.avionics??0)+(Wg.electrical??0)+(Wg.ecs??0)
                  +(Wg.furnishings??0)+(Wg.flightControls??0)+(Wg.packSystems??0);
    console.log(`   [debug] SYSTEMS ours ${sysOurs.toFixed(1)} kg vs published `
      + `${(v.published.systems_lb/LB).toFixed(1)} kg  `
      + `(${(100*(sysOurs/(v.published.systems_lb/LB)-1)).toFixed(0)}%)  `
      + `| avionics ${(Wg.avionics??0).toFixed(1)} elec ${(Wg.electrical??0).toFixed(1)} `
      + `ecs ${(Wg.ecs??0).toFixed(1)} furn ${(Wg.furnishings??0).toFixed(1)} `
      + `fc ${(Wg.flightControls??0).toFixed(1)} pack ${(Wg.packSystems??0).toFixed(1)}`);
    console.log(`   [debug] STRUCT wing ${(Wg.wing??0).toFixed(1)}  fus ${(Wg.fuselage??0).toFixed(1)}`
      + `  vtail ${(Wg.vtail??0).toFixed(1)}  gear ${(Wg.gear??0).toFixed(1)}  booms ${(Wg.booms??0).toFixed(1)}`
      + `  rotors ${(Wg.rotors??0).toFixed(1)}  nacelle ${(Wg.nacelle??0).toFixed(1)}`);
    console.log(`   [debug] motors ${(Wg.motors??0).toFixed(1)}  inverters ${(Wg.inverters??0).toFixed(1)}`
      + `  cruiseProp ${(Wg.cruisePropulsion??0).toFixed(1)}  driveSys ${(Wg.driveSys??0).toFixed(1)}`
      + `  | installed/motor ${(R.PmotInstalledKW??0).toFixed(1)} kW  x${R.cfg?.nRotors ?? "?"}`
      + `  | motorSizedBy ${R.motorSizedBy ?? "?"}`);
  }
  GEO_USED[v.key] = { R: R.propDiam ? R.propDiam / 2 : null,
                      vTip: R.tipSpeed ?? R.vTip ?? null,
                      sigma: R.solidityUsed ?? R.solidityEff ?? R.solidityDesign ?? R.sigma ?? null,
                      det: R.rotorGroupDetail ?? null };
  for (const k of ["MTOW", "empty", "pack", "struct", "rotor", "motDrv",
                   "driveSys", "systems", "fltCtrl", "energy", "liftPower", "fusDq", "totalDq"]) {
    const e = err(got[k], want[k]);
    const unit = k === "energy" ? "kWh" : k === "liftPower" ? "kW " : (k === "fusDq" || k === "totalDq") ? "ft2" : "kg";
    /* The reference line is AFDD's OWN in-population error for this group,
       not a number we picked. `x N` is the out-of-population degradation:
       how much worse this group is on an eVTOL than the same equations are
       on the rotorcraft they were fitted to. That ratio is a RESULT, not a
       pass mark - nothing fails on it. */
    const ref = AFDD_INPOP[k]?.ref ?? null;
    const within = e != null && ref != null && Math.abs(e) <= ref;
    const degr = e != null && ref ? Math.abs(e) / ref : null;
    console.log(`   ${k.padEnd(14)} ${f(want[k]).padStart(8)} ${unit}  ${f(got[k]).padStart(8)} ${unit}  ${pct(e).padStart(8)}` +
                (ref == null ? "    (no AFDD reference)"
                             : `   vs AFDD ${ref.toFixed(1)}%` +
                               (within ? "  WITHIN" : `  x${degr.toFixed(1)}`)));
    rows.push({ v: v.key, k, e, ref, within, degr });
  }
}



/* ── WHERE THE ROTOR-GROUP ERROR COMES FROM ────────────────────────────
   The old flat tolerance could say only "the rotor group is wrong by X".
   It could not say WHICH of two quite different things was wrong, and they
   need different responses:

     (a) THE EQUATION is out of population - the published AFDD correlation
         does not describe an eVTOL rotor. Nothing we can do in code; it is
         the state of the art and the paper's subject.
     (b) THE LOOP SIZED A DIFFERENT ROTOR than the published one - our
         solidity, and therefore blade chord, is a sizing OUTPUT, not a copy
         of the vehicle's published value. Chord enters the AFDD00 blade
         equation at the 0.773 power, so a different rotor legitimately
         weighs differently. That is the tool doing its job, not a defect.

   Splitting them: evaluate the SAME equation, with the ENGINE'S OWN
   settings, at the vehicle's PUBLISHED rotor geometry. The residual is (a).
   The gap between that and the loop's answer is (b).

   NOTE ON A WRONG TURN, kept because it is the kind that ships silently:
   the first version of this block used the by-published-rotor-type flap
   frequency from components.mjs and reported "14-19 points of implementation
   error". That was comparing two different MODELLING CHOICES and calling the
   difference a defect - the engine deliberately does not set nu from the
   published rotor type, because nu is unpublished for these aircraft and
   choosing it by type is fitting an unpublished parameter to the benchmark.
   Like has to be compared with like or the number is worse than useless. */
console.log(`\n${bar}`);
console.log("ROTOR GROUP - equation error vs sizing divergence");
const DIVERGENCE = [];
console.log(bar);
const FT2 = 3.280839895;
for (const v of NASA_VEHICLES) {
  const row = rows.find(r => r.v === v.key && r.k === "rotor");
  if (!row || row.e == null) continue;
  const R_m = v.radius_ft / FT2;
  const det = GEO_USED[v.key]?.det || null;
  const nB = det?.nBlades ?? 3;
  const alone = rotorGroup(
    { rotorMassModel: det?.model ?? "afdd00", nBlades: nB,
      rotorFlapFreq: det?.flapFreq ?? flapFreqFor({ configType: v.configType }),
      solidity: v.solidity },
    { nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tipSpeed_fts / FT2,
      diskArea_m2: v.nRotors * Math.PI * R_m * R_m, isTilting: !!v.tilting },
    2.0);
  const want = v.published.rotor_lb / LB;
  const eAlone = 100 * (alone.mass - want) / want;
  DIVERGENCE.push(Math.abs(row.e - eAlone));
  const cPub = (v.solidity * Math.PI * R_m) / nB;
  const cLoop = det?.chord_m ?? null;
  console.log(`   ${v.key.padEnd(8)} equation at PUBLISHED rotor ${eAlone >= 0 ? "+" : ""}${eAlone.toFixed(1)}%` +
              `   loop ${row.e >= 0 ? "+" : ""}${row.e.toFixed(1)}%   sizing divergence ${Math.abs(row.e - eAlone).toFixed(1)} pts`);
  console.log(`            engine rotorGroupDetail: ${JSON.stringify(det)}`);
  console.log(`            blade chord: published ${cPub.toFixed(3)} m vs loop ` +
              `${cLoop == null ? "?" : cLoop.toFixed(3)} m` +
              (cLoop ? `  (${(100 * (cLoop - cPub) / cPub).toFixed(0)}%)` : "") +
              `   nu ${det?.flapFreq ?? "?"}  blades ${nB}`);
}
console.log(`\n   Equation error is the published method out of population and is the`);
console.log(`   paper's subject. Sizing divergence is this tool choosing a different`);
console.log(`   rotor from the published one, which is what a SIZING tool does.`);
console.log(`   Neither is gated: both are reported, which is the point.`);


const scored = rows.filter(r => r.e != null && isFinite(r.e));
/* PRIMARY COUNT: metrics inside AFDD's OWN in-population error for that group.
   The old primary count was "within +/-5%", a single number applied to every
   group. +/-5% is approximately AFDD's error for the WHOLE AIRCRAFT on the
   aircraft it was fitted to (5.3%); applied per group it demanded the rotor
   group be 1.7x better than AFDD manages on helicopters and the tails 4.5x
   better, on aircraft outside the fitting population entirely. It was not a
   stretch target, it was arithmetically impossible. See research note 27. */
const referenced = scored.filter(r => r.ref != null);
const within = referenced.filter(r => r.within);
const meanAbs = scored.reduce((a, r) => a + Math.abs(r.e), 0) / Math.max(1, scored.length);
const worst = scored.slice().sort((a, b) => Math.abs(b.e) - Math.abs(a.e))[0];
const degrs = referenced.filter(r => r.degr != null).map(r => r.degr);
const meanDegr = degrs.length ? degrs.reduce((a, b) => a + b, 0) / degrs.length : null;

console.log(`Metrics scored: ${scored.length}   mean |error|: ${meanAbs.toFixed(1)}%`);
console.log(`Against AFDD's own in-population error: ${within.length} of ${referenced.length} groups are ` +
            `AT OR BETTER than the method achieves on the rotorcraft it was fitted to`);
if (meanDegr != null)
  console.log(`Mean out-of-population degradation: x${meanDegr.toFixed(1)}  ` +
              `(how much worse these equations are on an eVTOL than on a helicopter)`);
if (within.length) console.log(`  within AFDD: ${within.map(r => `${r.v}/${r.k}`).join(", ")}`);
if (worst) console.log(`Worst: ${worst.v}/${worst.k} at ${pct(worst.e)}` +
  (worst.ref != null ? ` (AFDD in-population ${worst.ref.toFixed(1)}%, x${(Math.abs(worst.e) / worst.ref).toFixed(1)})` : ""));
/* legacy line, kept so the change in reporting is visible rather than silent */
const flat5 = scored.filter(r => Math.abs(r.e) <= 5).length;
console.log(`  [for comparison, under the retired flat rule: ${flat5} of ${scored.length} within +/-5%]`);
console.log(bar);

/* ── REGRESSION GATE ────────────────────────────────────────────────────────
   Until now this file printed the project's PRIMARY validation — every
   comparison against a published NASA weight statement — and then exited 0 no
   matter what it measured. It was not in `npm test` either, so the one harness
   that decides whether the tool is accurate could drift indefinitely without
   anything noticing. That is the opposite of the arrangement this project
   claims to have.

   The thresholds below are the values MEASURED at the commit that added them.
   They are a REGRESSION GUARD, not an accuracy claim and not a target: they
   say "no change may quietly make this worse", nothing more. A change that
   improves the tool should TIGHTEN these numbers in the same commit; a change
   that legitimately trades one metric for a better one elsewhere has to move
   them deliberately and say why in the message. Both are fine. Silence is not.

   Measured 2026-09-01: 30 scored, 19 within +/-5%, mean 9.4%, worst -46.7%
   (the L+C rotor group, a known AFDD out-of-population case — see
   validation/components.mjs, which scores the same model at -51.4% on this
   vehicle at component level with no sizing loop around it). */
/* Thresholds are the values MEASURED at the commit that set them. They are a
   RATCHET, not an accuracy claim: nothing may quietly make this worse. A change
   that improves the tool tightens them in the same commit; a change that trades
   one metric for a better one elsewhere moves them deliberately and says why.

   Measured 2026-09-01, after correcting the tilting-rotor factor:
     30 scored, mean 8.5%, worst -46.7% (L+C rotor),
     12 of 21 referenced groups at or better than AFDD's own in-population error,
     sizing divergence 0.0 points on all three vehicles. */
/* ── MOVED 2026-09-04, AND THE COUNT WENT DOWN. Read this before trusting
   the headline. ────────────────────────────────────────────────────────
   Removing the flat 1.30 installed-thrust margin (see paramsFor) fixed the
   motDrv bias on all three vehicles and took the within-AFDD count DOWN from
   13 to 10. Both statements are true and the second is the honest cost.

   WHAT IMPROVED                      WHAT REGRESSED
     motDrv  +5.9 -> +3.5              L+C MTOW    -2.3 -> -14.3
             +36.8 -> +5.4             L+C empty   -2.6 -> -16.6
             +33.3 -> -7.1             L+C pack   -11.1 -> -22.3
     driveSys +30.4 -> +1.5 (SbS)      L+C energy -11.3 -> -22.5
     installed power vs published      L+C driveSys +9.8 -> -26.3
     MRP: +4.6/+37.5/+49.0             L+C fltCtrl -0.3 -> -12.3
       ->  +1.8/-0.3/-10.6

   WHY THE L+C COLUMN COLLAPSED, AND WHY THAT IS NOT AN ARGUMENT FOR PUTTING
   THE MARGIN BACK: its rotor group is -46.7%, the worst metric in this
   benchmark and a known AFDD out-of-population failure (components.mjs scores
   the same model at -51.4% with no sizing loop around it). That is roughly
   -200 kg. The old +33.3% motDrv was roughly +150 kg. The two very nearly
   cancelled, so L+C MTOW read -2.3% while BOTH of its largest groups were
   badly wrong. Taking the false weight out did not break the lift+cruise; it
   stopped a compensating error from hiding the real one, and the whole column
   is now visibly downstream of the rotor group.

   This project has a name for the thing being avoided here: matching for the
   wrong reason. A -2.3% MTOW built from +150 kg of motor and -200 kg of rotor
   is not accuracy, and a threshold that rewards it is not a quality gate. */
/* ── MOVED AGAIN, 2026-09-04, AND THIS IS THE SECOND TIME IN ONE DAY.
   That is worth saying out loud, because a ratchet moved twice is a ratchet
   nobody is holding. Both moves came from the same class of fix -- removing a
   load or a margin the aircraft cannot actually generate -- and both traded
   headline accuracy for component truth.

   THE CHANGE: booms.js sized every boom at an ultimate 5.25 (1.5 x 3.5 g),
   hard-coded, for aircraft whose rotors produce 1.3 g. MOC SC-VTOL
   VTOL.2200(f) sets the limit factor from "the MAXIMUM CAPABILITY OF THE
   AIRCRAFT" with a floor of 2.0, so the sourced value is 3.00. loadcases.js
   had already established this for the WING; the booms were left behind, and
   on the two rotor-borne layouts loadCases() returns null so the 5.25 was not
   merely inconsistent, it was unsourced.

   WHAT IT DID, structures group:
     Quad-E   +10.3% (x1.7)  ->   +0.4%  WITHIN AFDD
     SbS-E     -7.1% (x1.2)  ->  -11.1% (x1.8)
     L+C-E     -9.8% (x1.6)  ->  -19.9% (x3.3)
     mean 8.8% -> 11.4%,  within-AFDD 10 -> 9 of 21

   The multicopter is the layout booms dominate and it moved INSIDE AFDD's own
   error. That is the evidence the fix is right. The lift+cruise moved the
   other way for the reason its column always moves: the paper documents its
   structures total as rotor -46.7% cancelling a +11.6% remainder, and taking
   103 kg of false boom out weakens that cancellation further. Same mechanism,
   one more layer off it.

   IT ALSO REMOVED THE MULTICOPTER SPACING RUNAWAY, which is why it was done.
   NASA's quadrotor sits at 1.37 D hub spacing (35% tip clearance); this tool
   shipped 1.05 D (5%), seven times tighter and outside the range of any
   published interference data. At 5.25 ultimate, 1.37 D diverged to 11,389 kg
   with 2,769 kg of booms. At 3.00 it converges smoothly:
     1.05 D  3242 kg   204 kg booms    5% tip gap
     1.25 D  3609 kg   312 kg booms   25%
     1.37 D  3925 kg   406 kg booms   37%
   The spacing itself is NOT changed here -- that is a separate design decision
   with a +21% MTOW cost -- but it is now affordable, and the file's previous
   explanation for the runaway (the rotor being too large) was measured and is
   wrong: our rotor is 8.90 m against NASA's 7.99 m at the same disk loading. */
/* ── THIRD MOVE, 2026-09-06. Three in two days, and that is the number
   worth staring at. ────────────────────────────────────────────────────
   Each move was individually justified and I would make each again. Taken
   together they say something the individual justifications do not: this
   benchmark's agreement was resting on several compensating errors at once,
   and every time one is removed the headline gets worse while the components
   get more honest. That is a real property of the tool as it was, not a
   drift in standards -- but a reader is entitled to check that claim rather
   than take it, so all three are listed with what moved:

     1. propulsion margin   mean  8.7 ->  8.8   within 13 -> 10 (over 21)
        flat 1.30 installed thrust margin replaced by NASA's published
        per-vehicle MRP. motDrv +36.8% -> +5.4% on the side-by-side.
     2. boom load factor    mean  8.8 -> 11.4   within 10 ->  9
        hard-coded 5.25 ultimate replaced by MOC SC-VTOL VTOL.2200(f)'s
        3.00. Quad-E structures +10.3% -> +0.4%.
     3. THIS ONE           mean 11.4 -> 12.0   within  9 ->  8
        multicopter hub spacing 1.05 D -> NASA's measured 1.37 D.

   WHAT THIS MOVE BUYS, and why a worse number is the right trade. The tool
   shipped adjacent hubs at 2.10 R -- a 5% tip gap. Healy, Misiorowski &
   Gandhi (JAHS 67(1) 012006) tested 2.5 R, 3 R and 3.5 R; at the CLOSEST of
   those, at 40 kt, an aft rotor already loses 8.4% thrust and needs 13.4%
   more torque, and the penalty grows as spacing falls. So 2.10 R was an
   extrapolation off the bad end of the only published data, in a tool that
   models no edgewise interference at all. NASA's own quadrotor sits at
   1.37 D (35% tip gap) and this tool now does too, at 37%.

   The single metric that moved is Quad-E structures: +0.4% -> +15.5%, which
   takes it from WITHIN AFDD to x2.5 and is the whole of the 9 -> 8. MTOW and
   empty both stay INSIDE AFDD's own error (+3.8%, +4.8%). Nothing else on
   any vehicle changed.

   THAT +15.5% IS THE NAMED OPEN ITEM. At NASA's geometry this tool needs
   860 kg of structure where NASA publish 744. Part of that gap is ours --
   the boom is heavy, see validation/boom-construction.mjs -- and part is
   theirs: NASA state their published figure OMITS the boom mounting
   entirely (quoted in booms.js). The two parts are not yet separable, and
   until they are, closing the gap by tuning would be fitting to a number its
   own authors call incomplete. */
/* ── FOURTH MOVE, 2026-09-06, AND THIS ONE WAS THE USER'S CALL, NOT MINE.
   Three moves in two days were taken on my own judgment. A fourth was not:
   the decomposition below was put to the user with the alternatives, and
   "keep all four and move the ratchet" was the instruction. Recorded as such.

   WHAT THIS MOVE IS MADE OF -- four changes from a fuselage audit that should
   have been done before any of the boom, load-factor or spacing work, and was
   not. The harness had been flying a quadrotor, a side-by-side and a
   lift+cruise on ONE fixed-wing body (fusLen 7.2 / fusDiam 1.65) with no
   per-configuration treatment at all:

     1. ONE WETTED AREA. weights.js formed the fuselage wetted area as a bare
        cylinder pi*D*L (37.3 m2) while engine.js formed the SAME body's area
        for drag with Raymer's fineness correction (26.1 m2). Aligned. Every
        layout's fuselage is ~6% lighter for it (AFDD84 exponent 0.1676).
     2. WINGLESS TOTAL DRAG WAS ZERO. Dq read CD0*S_wing and the wing term
        poisoned the dimensional sum, so every rotor-borne layout reported a
        total drag area of 0.00. Fixed at the sum.
     3. NASA'S OWN FUSELAGE FACTORS, in NDARC 29-4's verified structure
        W = chi_basic w_basic (1 + chi_cw f_cw): chi_basic 0.76, chi_cw 0.90,
        f_cw 15% (quad) / 6% (others), +25 lb AEI increment on the quadrotor.
        Net 0.863 / 0.801 against the app's single 0.90 (Johnson, Silva &
        Solis 2018, Table 6 and p.6). A first reading compounded these as
        0.76 x 0.90 x 1.15; the theory manual corrected it.
     4. SIX PUBLISHED COMPARISONS SCORED FOR THE FIRST TIME: fuselage drag
        area (1.4 / 1.6 / 1.7 ft2) and total drag area (12.9 / 7.5 / 16.9)
        per vehicle, AIAA 2018-3847 Table 3. Both had sat on the vehicle
        records unscored; the second could not be scored until item 2.

   MEASURED DECOMPOSITION, so the move can be audited piece by piece:
     committed                                12.0%  33 metrics   8 of 21
     + items 1 and 3                          13.6%  33           7
     + item 4 (six drag rows)                 14.5%  39           7
     NASA's factors alone are ~1.2 of the 1.6 points; the six drag rows
     average 16.9% low on their own.

   WHAT THE NEW ROWS SAY, which is the finding: the Raymer fuselage buildup
   implies a drag coefficient on wetted area of 0.0042 / 0.0038 / 0.0036
   against the flat 0.0045 NASA assume for a "well-designed and built
   low-drag fuselage", and total drag 8-30% below NASA's. That is a
   coefficient-level disagreement in the DRAG model, not a geometry one, and
   it did not exist as a number before these rows were scored.

   TRIED AND NOT APPLIED: per-vehicle fuselage lengths inferred from NASA's
   drag areas (7.73 / 8.52 / 8.91 m). Two inferences deep, negligible effect
   on the drag row, and they lengthened the lift+cruise boom arm 2.80 ->
   3.43 m through a fuselage-station coupling the source does not support.
   Kept on the records as fusLenM for the day a published dimension replaces
   them.

   AND THE RESEARCH REVERSED THE PREMISE THAT PROMPTED IT. The audit began
   from "multicopters and side-by-sides carry a passenger pod, not a tube".
   NASA's primary source says otherwise for THIS class: the 6-occupant
   payload "results in a very different concept aircraft, with a large
   fuselage and very large rotors" (AIAA 2018-3847 p.4), the L+C "has a
   fuselage similar to that of the Side-by-Side" (p.8), and the fuselages
   "do not appear to be wildly different from existing rotorcraft" (p.15).
   The 1-2 seat pod (Yang et al. 2024, fineness 1.4-3.6) is real and is what
   the app applies on configuration select; it is not the benchmark vehicle.
   What differs per configuration in NASA's own method is the crash-weight
   fraction, the AEI increment and the drag area -- all now carried. */
const MEAN_MAX     = 14.6;   // measured 14.5 - RAISED from 12.1, see above
const WITHIN_MIN   = 7;      // measured 7 of 21 - LOWERED from 8, see above
const WORST_MAX    = 50.0;   // measured 46.7, unchanged (the L+C rotor group)
const SCORED_MIN   = 39;     // TIGHTENED 33 -> 39: fuselage and total drag
                             // area are now scored on all three vehicles
const DIVERGE_MAX  = 0.5;    // measured 0.00 - the loop must reproduce the
                             // equation at published inputs. THIS is where a
                             // tight tolerance belongs: it is the only part of
                             // the error that is ours rather than the method's.

const worstAbs = worst ? Math.abs(worst.e) : Infinity;
const fails = [];
if (scored.length < SCORED_MIN) fails.push(`only ${scored.length} metrics scored, expected >= ${SCORED_MIN} (a comparison was lost)`);
if (meanAbs > MEAN_MAX)   fails.push(`mean |error| ${meanAbs.toFixed(1)}% > ${MEAN_MAX}%`);
if (within.length < WITHIN_MIN) fails.push(`only ${within.length} groups at or better than AFDD in-population, expected >= ${WITHIN_MIN}`);
if (worstAbs > WORST_MAX) fails.push(`worst metric ${pct(worst.e)} exceeds ${WORST_MAX}%`);
const worstDiv = Math.max(0, ...DIVERGENCE);
if (worstDiv > DIVERGE_MAX) fails.push(`sizing divergence ${worstDiv.toFixed(2)} pts exceeds ${DIVERGE_MAX} - the loop no longer reproduces the equation at published inputs`);

if (fails.length) {
  console.log(`\nFAIL: accuracy regressed against the published NASA weight statements`);
  for (const f2 of fails) console.log(`  - ${f2}`);
  console.log(`If the change is intended, update the thresholds above and say why in the commit.`);
  process.exit(1);
}
/* THE SUMMARY LINE CARRIED THE OLD LABEL ON THE NEW NUMBER. When the primary
   criterion moved from a flat +/-5% to AFDD's own per-group in-population
   error (research note 27), the `within` array was repointed at the new test
   and this line was not: it went on printing "N within +/-5%" while N counted
   something else entirely, and pairing it with scored.length put a count out
   of 21 next to a total of 30. Both halves were wrong, and this is the line
   every reader quotes -- it reached VALIDATION.md and every summary written
   from it. The two counts are now printed separately, each labelled with the
   criterion it actually applies. */
console.log(`\nPASS: ${scored.length} published comparisons, mean ${meanAbs.toFixed(1)}%, worst ${pct(worst.e)}`);
console.log(`      ${within.length} of ${referenced.length} referenced groups at or better than AFDD's own in-population error`);
console.log(`      ${flat5} of ${scored.length} within a flat +/-5% (retired criterion, kept for continuity)`);
