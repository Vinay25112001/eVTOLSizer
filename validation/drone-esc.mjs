/* =====================================================================
   DRONE ESC GATE — re-deriving two rejections, not trusting a comment
   =====================================================================
   The ESC module carries a measured table instead of a model, and its
   header gives two reasons: Dai's series resistance is falsified on this
   data, and the diode-freewheeling form fits nonsense. A comment saying
   so is worth nothing on its own — the next person to read it has no way
   to tell whether it was ever true or whether the data has moved since.

   So this gate REPRODUCES both rejections from the measured rows every
   time it runs. If Dai's R_e ever became constant on this data, or a
   physical V_f ever fitted, these checks would fail and the module's
   justification for carrying a table would have to be revisited. That is
   the point: a rejection is a result, and results get gated.

   IT ALSO GUARDS THE THING MOST LIKELY TO GO WRONG QUIETLY — the naming.
   The residual contains ESC loss AND motor-model error, inseparably. The
   moment someone renames `etaJoint` to `etaEsc`, every number downstream
   silently asserts the motor model is exact, which it is not: it is
   falsified outright on 4 of 419 rows. The gate checks the module still
   says so about itself.
   ===================================================================== */
import {
  MOTOR_TRUTHSET, MOTOR_TRUTHSET_COLUMNS, MOTOR_TRUTHSET_CONSTANTS,
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES,
} from "../src/data/drone-motor-truthset.js";
import { ESCS } from "../src/data/drone-components.js";
import { motorPoint } from "../src/classes/drone/motor.js";
import {
  JOINT_RESIDUAL_TABLE, TABLE_PROVENANCE, RESIDUAL_MEANING, REJECTED_MODELS,
  ESC_UNDER_TEST, jointResidualAt, escPoint, escLimitStatus, rectificationMode,
} from "../src/classes/drone/esc.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE ESC GATE");
console.log("=".repeat(78));

/* ── Rebuild the sample set independently of the module ────────────── */
const COL = Object.fromEntries(MOTOR_TRUTHSET_COLUMNS.map((n, i) => [n, i]));
const anomalous = new Set(MOTOR_TRUTHSET_VOLTAGE_ANOMALIES.map((a) => `${a.model}/${a.cells}`));
const constFor = Object.fromEntries(MOTOR_TRUTHSET_CONSTANTS.map((c) => [c.model, {
  model: c.model, kv: c.kv, ktNmPerA: c.ktNmPerA, rmOhm: c.rmOhm,
  i0A: c.i0A, i0RefV: c.i0RefV, maxContinuousCurrentA: null, maxPowerW: null,
}]));

const S = [];
for (const row of MOTOR_TRUTHSET) {
  const model = row[COL.model];
  if (anomalous.has(`${model}/${row[COL.cells]}`)) continue;
  const p = motorPoint(constFor[model], { torqueNm: row[COL.torqueNm], rpm: row[COL.rpm] });
  const eta = p.elecPowerW / row[COL.busW];
  if (!(eta <= 1)) continue;
  S.push({ model, duty: p.voltageV / row[COL.packV], eta,
           im: p.currentA, loss: row[COL.busW] - p.elecPowerW,
           busW: row[COL.busW], torqueNm: row[COL.torqueNm], rpm: row[COL.rpm] });
}

check("the table is built from the measured rows, not a stored copy",
  TABLE_PROVENANCE.rowsUsed === S.length && TABLE_PROVENANCE.builtFrom.includes("module load"),
  `${TABLE_PROVENANCE.rowsUsed} rows used of ${TABLE_PROVENANCE.rowsInTruthSet}`);

check("the excluded rows are excluded for stated physical reasons",
  TABLE_PROVENANCE.excludedFalsified > 0 && TABLE_PROVENANCE.excludedAnomalousVoltageBlock > 0,
  `${TABLE_PROVENANCE.excludedFalsified} where the model already exceeds bus power, ` +
  `${TABLE_PROVENANCE.excludedAnomalousVoltageBlock} in the block whose printed pack voltage is impossible`);

check("no sample has an above-unity residual",
  S.every((s) => s.eta <= 1), "an ESC dissipates; it does not generate");

/* ── REJECTION 1: Dai's series resistance ──────────────────────────── */
console.log("-".repeat(78));
console.log("  REJECTION 1 — Dai, Quan, Ren & Cai (T-Mech 2019) Eqs. (31)-(32):");
console.log("    P_bus - P_motor = I_m^2 R_e, with R_e ONE CONSTANT per ESC.");
console.log("  Solve for R_e on every row and see whether it is constant.");
console.log(`  ${"duty band".padEnd(12)}${"n".padStart(5)}${"R_e mean".padStart(11)}${"I_m mean".padStart(10)}`);

const bandsOf = (lo, hi) => S.filter((s) => s.duty >= lo && s.duty < hi);
const reBands = [];
for (const [lo, hi] of [[0, 0.35], [0.35, 0.5], [0.5, 0.65], [0.65, 0.8], [0.8, 1.01]]) {
  const g = bandsOf(lo, hi).filter((s) => s.loss > 0);
  if (g.length < 5) continue;
  const re = g.reduce((a, s) => a + s.loss / (s.im * s.im), 0) / g.length;
  const im = g.reduce((a, s) => a + s.im, 0) / g.length;
  reBands.push(re);
  console.log(`  ${`${lo.toFixed(2)}-${hi.toFixed(2)}`.padEnd(12)}${String(g.length).padStart(5)}` +
              `${re.toFixed(4).padStart(11)}${im.toFixed(1).padStart(10)}`);
}
const reDrift = reBands[0] / reBands[reBands.length - 1];
check("Dai's R_e is NOT constant on this data, so the series model is refused",
  reDrift > 3,
  `R_e drifts ${reDrift.toFixed(1)}x from lowest to highest duty band; the model requires 1.0x`);

/* Same sign on every motor, so it is not one motor dragging the trend. */
const perMotorDrift = [];
for (const m of new Set(S.map((s) => s.model))) {
  const g = S.filter((s) => s.model === m && s.loss > 0);
  const lo = g.filter((s) => s.duty < 0.45).map((s) => s.loss / (s.im * s.im));
  const hi = g.filter((s) => s.duty >= 0.7).map((s) => s.loss / (s.im * s.im));
  if (lo.length < 3 || hi.length < 3) continue;
  const a = lo.reduce((x, y) => x + y) / lo.length;
  const b = hi.reduce((x, y) => x + y) / hi.length;
  perMotorDrift.push({ m, ratio: a / b });
}
check("the drift has the same sign on every motor independently",
  perMotorDrift.length >= 3 && perMotorDrift.every((d) => d.ratio > 2),
  perMotorDrift.map((d) => `${d.m.slice(3, 7)} ${d.ratio.toFixed(1)}x`).join(", "));

/* ── REJECTION 2: the diode two-term form ──────────────────────────── */
console.log("-".repeat(78));
console.log("  REJECTION 2 — P_bus - P_motor = I_m^2 R_e + (1-duty) V_f I_m.");
console.log("  A silicon body diode drops ~0.7-1.0 V, a Schottky ~0.3-0.5 V.");
console.log(`  ${"motor".padEnd(17)}${"R_e".padStart(9)}${"V_f".padStart(9)}`);
const fits = [];
for (const m of [...new Set(S.map((s) => s.model))].sort()) {
  const g = S.filter((s) => s.model === m && s.loss > 0);
  if (g.length < 10) continue;
  let s11 = 0, s12 = 0, s22 = 0, sy1 = 0, sy2 = 0;
  for (const s of g) {
    const x1 = s.im * s.im, x2 = (1 - s.duty) * s.im;
    s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; sy1 += x1 * s.loss; sy2 += x2 * s.loss;
  }
  const det = s11 * s22 - s12 * s12;
  const re = (sy1 * s22 - sy2 * s12) / det, vf = (s11 * sy2 - s12 * sy1) / det;
  fits.push({ m, re, vf });
  console.log(`  ${m.padEnd(17)}${re.toFixed(4).padStart(9)}${vf.toFixed(3).padStart(9)}`);
}
const nonPhysical = fits.filter((f) => f.vf < 0.2 || f.vf > 1.5).length;
check("the fitted diode drop is non-physical, so the two-term form is refused",
  nonPhysical >= Math.ceil(fits.length / 2),
  `${nonPhysical} of ${fits.length} motors fit V_f outside 0.2-1.5 V ` +
  `(${fits.map((f) => f.vf.toFixed(1)).join(", ")} V) — including negative values, which are not diodes`);

check("both rejections are recorded in the module with the number that rejected them",
  REJECTED_MODELS.length === 2 && REJECTED_MODELS.every((r) => r.source && r.result && r.verdict));

/* ── The residual is signal, not rounding ──────────────────────────── */
console.log("-".repeat(78));
let worstNoiseFrac = 0;
for (const [lo, hi] of [[0, 0.35], [0.35, 0.5], [0.5, 0.65], [0.65, 0.8], [0.8, 1.01]]) {
  const g = bandsOf(lo, hi).filter((s) => s.loss > 0);
  if (g.length < 5) continue;
  let loss = 0, noise = 0;
  for (const s of g) {
    const c = constFor[s.model];
    const hiP = motorPoint(c, { torqueNm: s.torqueNm + 0.005, rpm: s.rpm }).elecPowerW;
    const loP = motorPoint(c, { torqueNm: Math.max(s.torqueNm - 0.005, 1e-6), rpm: s.rpm }).elecPowerW;
    loss += s.loss;
    noise += Math.sqrt(0.5 ** 2 + ((hiP - loP) / 2) ** 2);
  }
  worstNoiseFrac = Math.max(worstNoiseFrac, noise / loss);
}
check("the residual is real signal, not the printing resolution",
  worstNoiseFrac < 0.15,
  `worst band: rounding is ${(100 * worstNoiseFrac).toFixed(0)} % of the loss — ` +
  `so the models were rejected by data, not by noise`);

/* ── The table itself ──────────────────────────────────────────────── */
console.log("-".repeat(78));
console.log("  the measured table, with the spread that forbids a single number:");
console.log(`  ${"duty".padEnd(12)}${"n".padStart(5)}${"motors".padStart(8)}${"median".padStart(9)}` +
            `${"p10".padStart(8)}${"p90".padStart(8)}${"spread".padStart(9)}`);
for (const b of JOINT_RESIDUAL_TABLE)
  console.log(`  ${`${b.dutyLo.toFixed(2)}-${b.dutyHi.toFixed(2)}`.padEnd(12)}${String(b.n).padStart(5)}` +
              `${String(b.motors).padStart(8)}${(100 * b.median).toFixed(1).padStart(8)}%` +
              `${(100 * b.p10).toFixed(1).padStart(7)}%${(100 * b.p90).toFixed(1).padStart(7)}%` +
              `${(100 * b.spread).toFixed(1).padStart(8)}`);

check("the residual rises with duty across the table",
  JOINT_RESIDUAL_TABLE[JOINT_RESIDUAL_TABLE.length - 1].median > JOINT_RESIDUAL_TABLE[0].median + 0.08,
  `${(100 * JOINT_RESIDUAL_TABLE[0].median).toFixed(0)} % at low duty to ` +
  `${(100 * JOINT_RESIDUAL_TABLE[JOINT_RESIDUAL_TABLE.length - 1].median).toFixed(0)} % near full`);

check("every band draws on more than one motor, so the spread is real disagreement",
  JOINT_RESIDUAL_TABLE.every((b) => b.motors >= 2 && b.n >= 5));

const worstSpread = Math.max(...JOINT_RESIDUAL_TABLE.map((b) => b.spread));
check("the band is carried, not just the median",
  worstSpread > 0.05 && JOINT_RESIDUAL_TABLE.every((b) => b.p10 < b.median && b.p90 > b.median),
  `widest band is ${(100 * worstSpread).toFixed(0)} points p10-p90 — a single number there would be a fiction`);

/* What a constant would have cost — the justification for the table. */
const allEta = S.map((s) => s.eta).sort((a, b) => a - b);
const flat = allEta[Math.floor(allEta.length / 2)];
const worstFlatErr = Math.max(...JOINT_RESIDUAL_TABLE.map((b) => Math.abs(100 * (flat - b.median) / b.median)));
check("a fixed efficiency would be materially wrong, which is why a table exists",
  worstFlatErr > 10,
  `a constant ${(100 * flat).toFixed(0)} % is ${worstFlatErr.toFixed(0)} % off the measured median at its worst duty`);

/* ── Refusals and flags ────────────────────────────────────────────── */
console.log("-".repeat(78));
check("the module states the residual is NOT an ESC efficiency",
  RESIDUAL_MEANING.isEscEfficiency === false && RESIDUAL_MEANING.separable === false &&
  RESIDUAL_MEANING.contains.length === 2,
  "contains ESC loss AND motor-model error, inseparably — one measurement, two unknowns");

check("an out-of-range duty is flagged, never returned as an estimate",
  (() => {
    const lo = jointResidualAt(0.05), hi = jointResidualAt(0.999);
    return lo.mode === "clamped-low" && (hi.mode === "clamped-high" || hi.mode === "interpolated");
  })());

check("a non-physical duty is refused rather than returned",
  (() => { try { jointResidualAt(0); return false; } catch { return true; } })());

const kdeEsc = ESCS.find((e) => rectificationMode(e) === "synchronous");
const modes = ESCS.map(rectificationMode);
console.log(`  rectification mode across the catalogue: ` +
  `${modes.filter((m) => m === "synchronous").length} synchronous, ` +
  `${modes.filter((m) => m === "diode").length} diode, ` +
  `${modes.filter((m) => m === "notStated").length} not stated`);

check("rectification mode is read only from an explicit statement",
  modes.filter((m) => m === "notStated").length >= 8 && kdeEsc != null,
  "BLHeli_32 and AM32 default to complementary PWM, but neither page states it " +
  "and the setting is user-configurable — inferring it would be a guess dressed as a datum");

check("applying the table to an ESC of unstated mode always warns",
  (() => {
    const c = constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 0.3, rpm: 3500 });
    const unstated = ESCS.find((e) => rectificationMode(e) === "notStated");
    const r = escPoint(p, { packVoltageV: 25.2, escEntry: unstated });
    return r.warnings.some((w) => w.includes("does not state"));
  })());

check("applying it to a synchronously rectified ESC warns about the direction",
  (() => {
    const c = constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 0.3, rpm: 3500 });
    const r = escPoint(p, { packVoltageV: 25.2, escEntry: kdeEsc });
    return r.warnings.some((w) => w.includes("pessimistic"));
  })());

check("a pack that cannot drive the point is reported infeasible, not clamped",
  (() => {
    const c = constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 0.6, rpm: 8000 });
    const r = escPoint(p, { packVoltageV: 14.8 });
    return r.feasible === false && r.warnings.some((w) => w.includes("never up"));
  })(), "an ESC steps down, never up");

check("bus power exceeds motor power, and the band brackets it",
  (() => {
    const c = constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 0.3, rpm: 3500 });
    const r = escPoint(p, { packVoltageV: 25.2 });
    return r.busPowerW > p.elecPowerW && r.busPowerW_p10 < r.busPowerW &&
           r.busPowerW_p90 > r.busPowerW && r.isEscEfficiency === false;
  })());

check("an unstated ESC rating reads as unknown, never as a pass",
  (() => {
    const c = constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 0.3, rpm: 3500 });
    const r = escPoint(p, { packVoltageV: 25.2 });
    const s = escLimitStatus({ continuous_current_a: null, burst_current_a: null }, r);
    return s.continuousCurrent.within === null && s.continuousCurrent.stated === false;
  })());

check("an ESC rating that IS published is enforced",
  (() => {
    const c = constFor["KDE10218XF-105"] ?? constFor["KDE4213XF-360"];
    const p = motorPoint(c, { torqueNm: 1.2, rpm: 5000 });
    const r = escPoint(p, { packVoltageV: 25.2 });
    const s = escLimitStatus({ continuous_current_a: 10, burst_current_a: 15 }, r);
    return s.continuousCurrent.within === false && s.withinPublishedLimits === false;
  })());

check("the ESC under test is named, with its rectification setting",
  ESC_UNDER_TEST.synchronousRectification === false &&
  ESC_UNDER_TEST.statedVerbatim.includes("Deactivated"),
  `${ESC_UNDER_TEST.model} — one controller, one firmware, one set of conditions`);

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE ESC GATE PASSED (${pass} checks)`
                       : `DRONE ESC GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
