/* =====================================================================
   THE AIRCRAFT DATABASE MUST BE INTERNALLY CONSISTENT AND FULLY TIERED
   =====================================================================
   A database transcribed from PDFs is only as good as the check on the
   transcription. NASA publishes its weight statements with an identity
   built in — WE = structure + propulsion + systems + vibration +
   contingency, and OW = WE + fixed useful load — so a mistyped number
   breaks arithmetic NASA already did. That is the check, on all sixteen.

   And every row must say how it was obtained. A row without a tier is a
   number nobody can defend, which is the state this database exists to end.
   ===================================================================== */
import {
  NASA_CALIBRATION_SET, NASA_CALIBRATION_RECORD, NASA_2025_VEHICLES, NASA_2025_MISSION,
  NASA_INPUTS_PENDING, MOTOR_DATASHEETS, TMOTOR_HOVER_TEST, TIERS, databaseCensus,
} from "../src/data/aircraft-database.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

console.log("AIRCRAFT DATABASE GATE");
console.log("=".repeat(78));

/* ── 1. every row is tiered and sourced ──────────────────────────────── */
const rows = [...NASA_CALIBRATION_SET, ...NASA_2025_VEHICLES, ...MOTOR_DATASHEETS, TMOTOR_HOVER_TEST];
const untiered = rows.filter((r) => !TIERS.includes(r.tier));
const unsourced = rows.filter((r) => !r.src || !/NASA|Yang/.test(r.src));
check(untiered.length === 0 && unsourced.length === 0,
  "every row carries a pedigree tier and an openable source",
  `${rows.length} rows; tiers ${JSON.stringify(databaseCensus().byTier)}`);

/* ── 2. NASA's own arithmetic holds on every vehicle ─────────────────── */
let sumFails = [];
for (const v of NASA_2025_VEHICLES) {
  const sum = v.structureLb + v.propulsionLb + v.systemsLb + v.vibrationLb + v.contingencyLb;
  /* 3 lb, not 1. NASA print each group rounded to the pound, so five rounded
     groups can miss a rounded total by a few pounds; alternate tilt E sums
     8832 against a printed 8830. That is the document's rounding, not ours,
     and forcing it to zero would mean editing NASA's numbers. */
  if (Math.abs(sum - v.weightEmptyLb) > 3)
    sumFails.push(`${v.set} ${v.key}: groups sum ${sum} vs WE ${v.weightEmptyLb}`);
  if (v.operatingWeightLb != null && Math.abs(v.weightEmptyLb + v.fixedUsefulLoadLb - v.operatingWeightLb) > 1)
    sumFails.push(`${v.set} ${v.key}: WE+FUL ${v.weightEmptyLb + v.fixedUsefulLoadLb} vs OW ${v.operatingWeightLb}`);
}
check(sumFails.length === 0,
  "WE = structure + propulsion + systems + vibration + contingency on all 16 NASA vehicles",
  sumFails.length ? sumFails.slice(0, 4).join("; ")
                  : "within 3 lb on all 16 (15 to the pound; alternate tilt E off by 2, NASA's per-group rounding), "
                    + "and OW = WE + FUL to the pound on the 8 baselines — the transcription reproduces NASA's arithmetic");

/* ── 3. the battery row is inside the propulsion group ───────────────── */
check(NASA_2025_VEHICLES.every((v) => v.batteryLb < v.propulsionLb),
  "battery (fuel system) is a sub-row of propulsion on every vehicle",
  "an all-electric propulsion group of 2.8–4.7 klb carrying a 257–565 lb 'fuel system' row is the battery tray, not the pack — "
  + "NASA book the cells elsewhere, which is why this engine adds Wbat back when scoring Table 12");

/* ── 4. electric heavier than turboshaft, every layout, both sets ─────── */
const pairs = [];
for (const set of ["baseline", "alternate"])
  for (const lay of ["quadrotor", "quadSMR", "sideBySide", "tiltrotor"]) {
    const ts = NASA_2025_VEHICLES.find((v) => v.set === set && v.layout === lay && v.power === "turboshaft");
    const e  = NASA_2025_VEHICLES.find((v) => v.set === set && v.layout === lay && v.power === "electric");
    pairs.push({ set, lay, ratio: e.dgwLb / ts.dgwLb });
  }
check(pairs.every((p) => p.ratio > 1.2),
  "the all-electric variant is heavier than its turboshaft twin on every layout",
  "DGW ratios " + pairs.map((p) => `${p.lay.slice(0, 4)}:${p.ratio.toFixed(2)}`).join(" ")
  + " — the battery penalty NASA measure, 1.27x to 1.88x");

/* ── 5. the calibration record is what 7009B asks for ────────────────── */
const rec = NASA_CALIBRATION_RECORD;
check([rec.fuselage, rec.rotorBlade, rec.rotorHubHinge, rec.auxiliaryThrust]
        .every((g) => g.mean > 0.8 && g.mean < 1.1 && g.stdDev > 0.05 && g.stdDev < 0.15),
  "NASA's calibration record carries a mean AND a spread per group",
  `fuselage ${rec.fuselage.mean}±${rec.fuselage.stdDev}, blade ${rec.rotorBlade.mean}±${rec.rotorBlade.stdDev}, `
  + `hub ${rec.rotorHubHinge.mean}±${rec.rotorHubHinge.stdDev} — this is the form our 12 [CAL] constants should take`);

/* ── 6. motor datasheets: mass grows with power, and the exponent is sane ─ */
const m = MOTOR_DATASHEETS;
const lx = m.map((r) => Math.log(r.contKW)), ly = m.map((r) => Math.log(r.massKg));
const n = m.length, mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
const b = lx.reduce((s, x, i) => s + (x - mx) * (ly[i] - my), 0) / lx.reduce((s, x) => s + (x - mx) ** 2, 0);
check(b > 0.7 && b < 1.1,
  "motor mass scales with continuous power at a physical exponent",
  `mass ∝ power^${b.toFixed(3)} across ${n} datasheets (Joby, T-MOTOR, Emrax), specific power `
  + `${Math.min(...m.map((r) => r.specificPowerKWkg)).toFixed(1)}–${Math.max(...m.map((r) => r.specificPowerKWkg)).toFixed(1)} kW/kg`);

/* ── 7. the T-MOTOR hover curve behaves like a rotor ─────────────────── */
const T = TMOTOR_HOVER_TEST;
const monotone = T.thrustKg.every((t, i) => i === 0 || t > T.thrustKg[i - 1])
              && T.powerLoadingGperW.every((p, i) => i === 0 || p < T.powerLoadingGperW[i - 1]);
const tOverRpm2 = T.thrustKg.map((t, i) => t / T.rpm[i] ** 2);
const spread = Math.max(...tOverRpm2) / Math.min(...tOverRpm2);
check(monotone && spread < 1.25,
  "thrust rises with rpm, power loading falls, and T/rpm² is near-constant",
  `15 points; T/rpm² varies by ${((spread - 1) * 100).toFixed(0)}% over the sweep — momentum theory says constant, `
  + `and a fixed-pitch prop's C_T drift covers the rest`);

/* ── 8. the gap is recorded, not papered over ────────────────────────── */
check(NASA_INPUTS_PENDING.fields.length >= 6 && /displaced|interleave/.test(NASA_INPUTS_PENDING.why),
  "the sizing inputs that could not be extracted are recorded as pending",
  `${NASA_INPUTS_PENDING.fields.length} fields from ${NASA_INPUTS_PENDING.tables.join(", ")} await manual transcription — `
  + "until then the 16 vehicles are reference weight statements, not validation targets");

console.log("");
console.log(fails.length ? `AIRCRAFT DATABASE GATE FAILED: ${fails.length} check(s)`
                         : "AIRCRAFT DATABASE GATE PASSED");
process.exit(fails.length ? 1 : 0);
