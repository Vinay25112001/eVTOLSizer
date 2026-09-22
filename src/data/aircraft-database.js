/* =====================================================================
   THE AIRCRAFT DATABASE — every row tiered by how it was obtained
   =====================================================================
   The industry's advantage is a database of aircraft it has weighed. That
   data is proprietary and no amount of research reaches it. What research
   CAN reach is every number a manufacturer or a national lab has put in
   print, and the discipline that makes such a database trustworthy is not
   its size but its PEDIGREE: knowing, for every row, whether the number
   came off a scale, out of a sizing code, off a datasheet, or off a
   photograph.

   NASA-STD-7009B calls this "M&S Data Pedigree", the first of its five
   credibility factors, and requires that calibrations be recorded with
   "the domain of calibration". Every row here carries a `tier`:

     weighed    a real aircraft, measured                 (NASA TP-20250006187 Table 2)
     sized      the output of a published sizing code     (NASA TP-20250006187 Tables 10, 12)
     tested     bench or flight test data                 (Yang 2024 Table 5, T-MOTOR)
     datasheet  a manufacturer's published specification  (Yang 2024 Table 1)
     estimated  inferred from images or other numbers     (Yang 2024 Table 4 — see cabin.js)

   and a `src` that a reader can open. Nothing here was typed from memory.
   Every table was extracted from the document on disk this session, and
   where the extraction could not be trusted the row is ABSENT and the gap
   is recorded (see NASA_INPUTS_PENDING) rather than filled.

   ── WHAT NASA CALIBRATES AGAINST ────────────────────────────────────
   NASA/TP-20250006187 (Johnson, Silva et al., 2025), "Impact of Technology
   and Mission Variations on NASA Advanced Air Mobility Concept Vehicles",
   Table 2 "Small rotorcraft for weight model calibration": ten real
   helicopters plus the XV-15. This is the population the AFDD weight
   equations were checked against for the AAM vehicles, and Table 3 records
   the result per group as a mean and standard deviation — exactly the
   record 7009B asks for, and exactly what this tool's own [CAL] constants
   lack. Both tables are carried here so the comparison is explicit.

   ── THE SIXTEEN NASA VEHICLES ───────────────────────────────────────
   Tables 10 and 12 publish full weight statements for eight baseline and
   eight alternate AAM concept vehicles: quadrotor, quad single-main-rotor,
   side-by-side and tiltrotor, each turboshaft (TS) and all-electric (E).
   The design mission (Table 1) is 5 occupants at 1000 lb payload, 37.5 nm
   cruise at 6000 ft — NOT the 6-occupant 75 nm mission of
   TM-20210017971, so these are new sizings, not restatements.

   Only the MAJOR groups are carried. The sub-group rows (blade, hub,
   fuselage, gear ...) come out of the PDF with labels displaced one row
   from their values, and disentangling them by plausibility is guessing.
   The major groups sum: WE = structure + propulsion + systems + vibration
   + contingency, and the gate asserts that identity on all sixteen — a
   transcription error fails the build.
   ===================================================================== */

const LB = 0.45359237;

/* NASA TP-20250006187 Table 2. Values as printed (lb, ft). */
export const NASA_CALIBRATION_SET = [
  { name: "Bell 412",                   crew: 1, pass: 13, emptyLb: 6789, maxLb: 11900, rotorDiaFt: 46,    tier: "weighed" },
  { name: "Sikorsky S-76C++",           crew: 2, pass: 13, emptyLb: 7005, maxLb: 11700, rotorDiaFt: 44,    tier: "weighed" },
  { name: "Eurocopter SA-365 Dauphin",  crew: 2, pass: 10, emptyLb: 6896, maxLb: 9480,  rotorDiaFt: 39,    tier: "weighed" },
  { name: "AgustaWestland A109",        crew: 1, pass: 7,  emptyLb: 3505, maxLb: 6283,  rotorDiaFt: 36.09, tier: "weighed" },
  { name: "MBB Bo-105",                 crew: 1, pass: 4,  emptyLb: 2813, maxLb: 5512,  rotorDiaFt: 26.4,  tier: "weighed" },
  { name: "Bell OH-58D",                crew: 1, pass: 6,  emptyLb: 3829, maxLb: 5500,  rotorDiaFt: 35,    tier: "weighed" },
  { name: "Eurocopter AS350",           crew: 1, pass: 5,  emptyLb: 2588, maxLb: 4960,  rotorDiaFt: 35.1,  tier: "weighed" },
  { name: "McDonnell Douglas MD500M",   crew: 2, pass: 3,  emptyLb: 2550, maxLb: 3000,  rotorDiaFt: 27.33, tier: "weighed" },
  { name: "NASA/Army/Navy/Bell XV-15",  crew: 2, pass: 0,  emptyLb: null, maxLb: 15000, rotorDiaFt: 25,  tier: "weighed",
    note: "TWO extraction defects in this one row. (1) The empty weight column "
        + "reads 570, which cannot be right for a 15,000 lb aircraft; left null. "
        + "(2) The rotor column read 12.5, which is the XV-15's rotor RADIUS in "
        + "ft, not its diameter -- every other row in this table is a genuine "
        + "main-rotor diameter (Bell 412 46 ft, S-76 44 ft), so anything "
        + "computing disk area from this field was out by a factor of four on "
        + "this row alone. Corrected to the 25 ft diameter. The row plainly "
        + "came out of a shredded table and the rest of it should be treated "
        + "with the same suspicion." },
].map((r) => ({ ...r, src: "NASA/TP-20250006187 Table 2" }));

/* NASA TP-20250006187 Table 3: the calibration RECORD — what 7009B asks for. */
export const NASA_CALIBRATION_RECORD = {
  src: "NASA/TP-20250006187 Table 3 'Technology factors for weight models', calibration mean and std dev",
  fuselage:        { mean: 0.994, stdDev: 0.069 },
  rotorBlade:      { mean: 0.853, stdDev: 0.081 },
  rotorHubHinge:   { mean: 0.954, stdDev: 0.083 },
  auxiliaryThrust: { mean: 1.023, stdDev: 0.101 },
  note: "Each is the ratio of actual to predicted weight over the Table 2 population. "
      + "A std dev of 0.07 to 0.10 is the honest fidelity of an AFDD group equation on the "
      + "aircraft it was fitted to; anything tighter claimed on an eVTOL is suspect.",
};

/* NASA TP-20250006187 design mission, Table 1. */
export const NASA_2025_MISSION = {
  src: "NASA/TP-20250006187 Table 1 'UAM design mission and conditions'",
  occupants: 5, payloadLb: 1000, cruiseNm: 37.5, cruiseAltFt: 6000, hoverAltFt: 6050,
  hoverSec: 30, transitionSec: 10, taxiSec: 15,
};

/* Tables 10 (baseline) and 12 (alternate). Major groups only, lb as printed.
   contingency is the row the extractor labelled "FIXED USEFUL LOAD"; the
   true FUL is the small row after OPERATING WEIGHT (5 or 10 lb) and OW = WE + FUL
   to the pound, which is how the two were told apart. */
const V = (set, key, layout, power, dgw, we, str, prop, batt, sys, vib, cont, ful, ow) => ({
  set, key, layout, power, tier: "sized",
  src: `NASA/TP-20250006187 Table ${set === "baseline" ? 10 : 12}`,
  dgwLb: dgw, weightEmptyLb: we, structureLb: str, propulsionLb: prop, batteryLb: batt,
  systemsLb: sys, vibrationLb: vib, contingencyLb: cont, fixedUsefulLoadLb: ful, operatingWeightLb: ow,
});
export const NASA_2025_VEHICLES = [
  V("baseline",  "quad TS", "quadrotor",   "turboshaft", 4621, 3401, 1404, 1138, 674, 587, 102, 170, 10, 3411),
  V("baseline",  "quad E",  "quadrotor",   "electric",   6881, 5875, 1919, 2869, 260, 617, 176, 294, 5,  5880),
  V("baseline",  "QSMR TS", "quadSMR",     "turboshaft", 4602, 3354, 1363, 1141, 692, 582, 101, 168, 10, 3364),
  V("baseline",  "QSMR E",  "quadSMR",     "electric",   7429, 6424, 2171, 3118, 357, 621, 193, 321, 5,  6429),
  V("baseline",  "side TS", "sideBySide",  "turboshaft", 4771, 3545, 1506, 1118, 674, 637, 106, 177, 10, 3555),
  V("baseline",  "side E",  "sideBySide",  "electric",   8945, 7936, 2687, 3887, 332, 727, 238, 397, 10, 7946),
  V("baseline",  "tilt TS", "tiltrotor",   "turboshaft", 4979, 3686, 1251, 1320, 760, 821, 111, 184, 10, 3696),
  V("baseline",  "tilt E",  "tiltrotor",   "electric",   8109, 7100, 2080, 3554, 480, 897, 213, 355, 10, 7110),
  V("alternate", "quad TS", "quadrotor",   "turboshaft", 5302, 3705, 1557, 1254, 684, 598, 111, 185, null, null),
  V("alternate", "quad E",  "quadrotor",   "electric",   6740, 5735, 1887, 2774, 257, 615, 172, 287, null, null),
  V("alternate", "QSMR TS", "quadSMR",     "turboshaft", 5431, 3755, 1583, 1276, 706, 596, 113, 188, null, null),
  V("alternate", "QSMR E",  "quadSMR",     "electric",   7256, 6252, 2121, 3012, 350, 619, 188, 313, null, null),
  V("alternate", "side TS", "sideBySide",  "turboshaft", 5589, 3960, 1744, 1243, 684, 656, 119, 198, null, null),
  V("alternate", "side E",  "sideBySide",  "electric",   8771, 7762, 2633, 3785, 327, 723, 233, 388, null, null),
  V("alternate", "tilt TS", "tiltrotor",   "turboshaft", 6040, 4297, 1385, 1673, 813, 896, 129, 215, null, null),
  V("alternate", "tilt E",  "tiltrotor",   "electric",   9840, 8830, 2502, 4655, 565, 968, 265, 442, null, null),
];

/* THE GAP, RECORDED. To VALIDATE the tool against a NASA vehicle it has to
   be RUN at that vehicle's inputs, and those live in Tables 9 and 11: disk
   loading, rotor radius, tip speed, blade count, battery capacity, drag
   D/q, cruise speed. The PDF text extractor displaces those rows' labels
   from their values (a units column shifts them), and both plain and
   fixed-pitch extraction were tried. Assigning values to labels by
   plausibility would be guessing. They need transcribing by eye from
   TP-20250006187 pages 26 and 107. Until then these sixteen vehicles are
   REFERENCE weight statements, not validation targets. */
export const NASA_INPUTS_PENDING = {
  tables: ["Table 9 (page 26)", "Table 11 (page 107)"],
  fields: ["diskLoadingLbFt2", "bladeRadiusFt", "tipSpeedFts", "nBlades",
           "batteryCapacityKWh", "dragDqFt2", "cruiseSpeedKt", "nMainRotors"],
  why: "PDF row labels displaced from values by the units column; plain and -fixed extraction both interleave",
};

/* Yang, Liang, Pröbsting, Li, Zhang, Hu, Aerospace 2024, 11, 200, Table 1.
   Motor continuous power and mass, from the manufacturers' datasheets the
   paper cites ([38] T-MOTOR, [40][41] Joby, [42] Emrax). */
export const MOTOR_DATASHEETS = [
  { name: "Joby JM1S",       contKW: 8.2, massKg: 1.8  },
  { name: "Joby JM1",        contKW: 12,  massKg: 2.8  },
  { name: "T-MOTOR U15L",    contKW: 16,  massKg: 3.6  },
  { name: "T-MOTOR U15XL",   contKW: 23,  massKg: 4.4  },
  { name: "T-MOTOR U15XXL",  contKW: 28,  massKg: 5.13 },
  { name: "Emrax 188",       contKW: 37,  massKg: 7.6  },
  { name: "Emrax 208",       contKW: 56,  massKg: 10   },
  { name: "Emrax 228",       contKW: 75,  massKg: 13.2 },
].map((r) => ({ ...r, tier: "datasheet", src: "Yang et al. 2024 Table 1", specificPowerKWkg: r.contKW / r.massKg }));

/* Yang 2024 Table 5: T-MOTOR UAM propulsion unit, hover test. 15 points. */
export const TMOTOR_HOVER_TEST = {
  tier: "tested", src: "Yang et al. 2024 Table 5, citing T-MOTOR [38]",
  rpm:      [863, 1014, 1134, 1256, 1349, 1475, 1592, 1677, 1867, 1958, 1989, 2050, 2111, 2142, 2203],
  thrustKg: [12.4, 17.8, 22.7, 26.9, 31.9, 38.0, 44.8, 52.2, 64.6, 69.3, 75.0, 80.5, 86.5, 92.6, 99.0],
  torqueNm: [9.34, 13.2, 17.0, 20.0, 23.8, 28.5, 33.6, 39.3, 48.8, 52.6, 56.8, 61.3, 65.9, 71.0, 75.8],
  powerLoadingGperW: [11.44, 9.85, 9.45, 8.58, 7.98, 7.37, 6.79, 6.34, 5.74, 5.5, 5.28, 5.03, 4.83, 4.61, 4.44],
};

export const TIERS = ["weighed", "sized", "tested", "datasheet", "estimated"];

/** Census by tier, for the provenance report. */
export function databaseCensus() {
  const rows = [
    ...NASA_CALIBRATION_SET, ...NASA_2025_VEHICLES, ...MOTOR_DATASHEETS, TMOTOR_HOVER_TEST,
  ];
  const byTier = {};
  for (const r of rows) byTier[r.tier] = (byTier[r.tier] || 0) + 1;
  return { rows: rows.length, byTier, inputsPending: NASA_INPUTS_PENDING.fields.length };
}

export { LB };
