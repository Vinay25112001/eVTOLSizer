/* =====================================================================
   DRONE MOTOR GATE — scoring a model against what is actually measured
   =====================================================================
   WHAT CAN AND CANNOT BE SCORED HERE, stated first because getting this
   wrong would make every number below meaningless.

   KDE's tables publish shaft TORQUE and RPM, so mechanical power is
   measured. They publish DC BUS power, so total electrical input is
   measured. They do NOT publish the motor's own terminal power, because
   nobody instruments between the ESC and the motor on a production thrust
   stand. So:

       P_mech  = M * omega        MEASURED
       P_bus                      MEASURED
       eta_total = P_mech/P_bus   MEASURED
       P_motor                    the MODEL'S OUTPUT
       eta_motor, eta_esc         a SPLIT the model proposes

   eta_motor therefore cannot be compared against a measured eta_motor —
   there is none. An earlier version of this work quoted "eta_motor 86-90 %
   across 419 points" as though that were an accuracy result. It is not; it
   is the model describing itself. This gate scores the three things the
   measurements CAN contradict instead:

   1. THE HARD BOUND. P_motor must not exceed P_bus. An ESC dissipates, it
      does not generate. A model predicting the motor drew more than the
      bus delivered is falsified on that row, full stop — and this bound
      needs no assumption about the ESC whatsoever.
   2. THE VOLTAGE BOUND. rpm/Kv is a lower bound on supply voltage from Kv
      and RPM alone. An ESC bucks; it cannot boost.
   3. THE RESIDUAL'S ORDER. Whatever the model does not account for is
      charged to the ESC. If the motor model were wrong, that residual
      would be arbitrary; if it is right, it should be ordered by the
      quantity an ESC's loss depends on, which is duty. It is — the
      residual rises with duty and flattens. That is evidence FOR the
      motor model in a way its own mean efficiency can never be.
      What FUNCTIONAL FORM the residual takes is a different question, and
      the ESC gate answers it: neither a series resistance nor a
      diode-drop form survives contact with the data.

   WHAT THIS GATE FOUND — and the correction that followed.

   First pass: the model appeared falsified on 4 of 419 rows. Three were
   the KDE2814XF-515 at high throttle, over the measured bus power by
   2.7-3.9 %. Diagnosed one constant at a time, no-load loss could not
   explain it (I0 = 0 still leaves the worst row at 1.0034) and the only
   reconciliations were Kv +4.2 % or Rm -47 %, the latter destroying the
   Km = Kt/sqrt(R) identity that holds to 0.35 %. The hypothesis on the
   table was unmodelled timing advance, which KDE does specify.

   THAT WAS WRONG, AND THE THING THAT CAUGHT IT WAS A COINCIDENCE WORTH
   RECORDING. Those three rows all sit in the KDE2814's 4S block — the
   same block the pack-voltage audit had independently flagged as
   impossible. Two tests sharing no inputs (one uses only Kv and RPM, the
   other only P_motor/P_bus) pointing at the same 21 rows is not a
   coincidence to shrug at.

   The link is that POWER INPUT is not a measurement. Across every block
   it equals the printed pack voltage times AMPERAGE to within rounding,
   so the sheet publishes two measured electrical quantities, not three.
   A block whose voltage LABEL is wrong therefore has a wrong POWER column
   too — invisibly, because the column still looks independent.

   The 2814's 4S block is labelled 3.70 V/cell, the LiPo NOMINAL, where
   all thirteen other blocks use 4.20, the CHARGED voltage. Substituting
   4.20 — the value the rest of the data set uses, not a fitted one —
   takes the block from 4 rows needing more voltage than the pack and 3
   exceeding the bus power, to 1 and 0. ONE substitution removes BOTH
   anomalies, and needs no unmodelled physics.

   So the model is NOT falsified. A vendor mislabelled one test block and
   the derived power column carried the error. Nothing is corrected in the
   data — the true test voltage is stated nowhere on the sheet, and
   inventing it is what this tool must not do. The block is EXCLUDED from
   analysis instead, and the exclusion is checked here rather than assumed.

   What remains is one KDE6213 row over by 0.23 % — 0.6 W on a 245 W row,
   inside twice the integer-watt printing resolution. That is recorded as
   marginal, not as a physical claim.
   ===================================================================== */
import {
  MOTOR_TRUTHSET, MOTOR_TRUTHSET_COLUMNS, MOTOR_TRUTHSET_CONSTANTS,
  MOTOR_TRUTHSET_SOURCE, MOTOR_TRUTHSET_REJECTED, MOTOR_TRUTHSET_QUANTISATION,
  MOTOR_TRUTHSET_VOLTAGE_BLOCKS, MOTOR_TRUTHSET_VOLTAGE_ANOMALIES,
  MOTOR_TRUTHSET_POWER_COLUMN,
} from "../src/data/drone-motor-truthset.js";
import { BLDC_MOTORS, MODELLABLE_MOTORS } from "../src/data/drone-components.js";
import {
  motorConstants, motorPoint, modellability, constantsSelfConsistency,
  limitStatus, USABLE_RESISTANCE_CONVENTIONS,
} from "../src/classes/drone/motor.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE MOTOR GATE");
console.log("=".repeat(78));

/* ── 1. THE TRUTH SET AND ITS PROVENANCE ───────────────────────────── */
const C = Object.fromEntries(MOTOR_TRUTHSET_COLUMNS.map((n, i) => [n, i]));
check("measured truth set is present", MOTOR_TRUTHSET.length === 419,
  `${MOTOR_TRUTHSET.length} rows across ${MOTOR_TRUTHSET_CONSTANTS.length} motors`);

check("every motor's workbook is hashed, so the rows can be re-derived",
  MOTOR_TRUTHSET_CONSTANTS.every((c) => /^[0-9a-f]{64}$/.test(c.workbookSha256)),
  MOTOR_TRUTHSET_CONSTANTS.map((c) => `${c.model.slice(3, 7)}:${c.workbookSha256.slice(0, 8)}`).join(" "));

check("every motor's constants carry the URL they were transcribed from",
  MOTOR_TRUTHSET_CONSTANTS.every((c) => /^https:\/\//.test(c.sourceUrl)));

check("the rejected row is listed rather than silently dropped",
  MOTOR_TRUTHSET_REJECTED.length === 1 && MOTOR_TRUTHSET_REJECTED[0].tipMach > 4,
  `${MOTOR_TRUTHSET_REJECTED[0].model} at throttle ${MOTOR_TRUTHSET_REJECTED[0].throttle}: ` +
  `tip Mach ${MOTOR_TRUTHSET_REJECTED[0].tipMach.toFixed(2)} — a typo in a vendor table`);

check("the thrust column is NOT flagged as sea level",
  MOTOR_TRUTHSET_SOURCE.thrustColumnIsSeaLevel === false,
  `measured at an implied ${MOTOR_TRUTHSET_SOURCE.impliedTestDensityKgM3.toFixed(4)} kg/m^3, ` +
  `${(100 * (1.225 / MOTOR_TRUTHSET_SOURCE.impliedTestDensityKgM3 - 1)).toFixed(1)} % below ISA sea level`);

check("KDE's stated test conditions are recorded as mutually inconsistent",
  MOTOR_TRUTHSET_SOURCE.statedConditionsAreConsistent === false);

/* ── 2. THE RESOLUTION FLOOR ───────────────────────────────────────── */
const Q = MOTOR_TRUTHSET_QUANTISATION;
console.log("-".repeat(78));
console.log("  what the PRINTING RESOLUTION alone costs, before any model error:");
console.log(`    torque printed to ${Q.torqueResolutionNm} Nm  ->  eta_motor uncertain by`);
console.log(`    median ${Q.medianPct.toFixed(2)} %, p90 ${Q.p90Pct.toFixed(2)} %, ` +
            `p99 ${Q.p99Pct.toFixed(2)} %, worst ${Q.worstPct.toFixed(2)} %`);
console.log(`    rows above 1 %: ${Q.rowsAbove1Pct}   above 2 %: ${Q.rowsAbove2Pct}   ` +
            `above 5 %: ${Q.rowsAbove5Pct}`);

check("the truth set's own resolution is finer than the 5 % target",
  Q.worstPct < 5 && Q.rowsAbove5Pct === 0,
  `worst row ${Q.worstPct.toFixed(2)} % — a tighter gate than this would be measuring the rounding`);

/* ── 3. THE IDENTITIES THAT LICENSE USING R UNMODIFIED ─────────────── */
console.log("-".repeat(78));
console.log("  vendor constant self-consistency — Kt = 9.5493/Kv and Km = Kt/sqrt(R).");
console.log("  If a vendor's own printed triple satisfies these, the R it prints IS");
console.log("  the R the standard model wants, and no convention conversion applies.");
console.log(`  ${"motor".padEnd(17)}${"Kt d%".padStart(8)}${"R d%".padStart(8)}`);
let worstIdentity = 0;
for (const c of MOTOR_TRUTHSET_CONSTANTS) {
  const s = constantsSelfConsistency({
    model: c.model, kv: c.kv, ktNmPerA: c.ktNmPerA, kmNmPerSqrtW: c.kmNmPerSqrtW, rmOhm: c.rmOhm,
  });
  worstIdentity = Math.max(worstIdentity, Math.abs(s.ktDeltaPct), Math.abs(s.rDeltaPct));
  console.log(`  ${c.model.padEnd(17)}${s.ktDeltaPct.toFixed(2).padStart(7)}%${s.rDeltaPct.toFixed(2).padStart(7)}%`);
}
check("published Kv, Kt, Km and Rm are mutually consistent on every motor",
  worstIdentity < 1.0, `worst deviation ${worstIdentity.toFixed(2)} % across 8 identities`);

check("every truth-set motor states its resistance convention",
  MOTOR_TRUTHSET_CONSTANTS.every((c) =>
    USABLE_RESISTANCE_CONVENTIONS.includes(c.resistanceConvention)),
  MOTOR_TRUTHSET_CONSTANTS[0].resistanceLabelOnSource);

check("every truth-set motor's no-load current carries its reference voltage",
  MOTOR_TRUTHSET_CONSTANTS.every((c) => c.i0RefV > 0),
  `all at ${MOTOR_TRUTHSET_CONSTANTS[0].i0RefV} V — the survey also found 18, 22 and 24 V in use`);

/* ── 4. THE CATALOGUE BINDING ──────────────────────────────────────── */
console.log("-".repeat(78));
const reasons = new Map();
let accepted = 0;
for (const e of BLDC_MOTORS) {
  const m = modellability(e);
  if (m.modellable) { accepted++; continue; }
  for (const r of m.missing) reasons.set(r, (reasons.get(r) ?? 0) + 1);
}
console.log("  why catalogue motors are held back from the loss model:");
for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1]))
  console.log(`    ${String(n).padStart(3)}  ${r}`);

check("the module accepts exactly the motors the catalogue marks modellable",
  accepted === MODELLABLE_MOTORS.length,
  `${accepted} of ${BLDC_MOTORS.length} motors — the rest are held back, not guessed at`);

check("a motor with no stated convention is REFUSED, not silently modelled",
  (() => {
    const bad = BLDC_MOTORS.find((e) => e.resistance_convention === "undeclared");
    try { motorConstants(bad); return false; } catch { return true; }
  })(),
  "attempting to build constants from an undeclared entry throws");

check("every accepted motor builds constants with a real resistance and I0",
  MODELLABLE_MOTORS.every((e) => {
    const c = motorConstants(e);
    return c.rmOhm > 0 && c.i0A > 0 && c.ktNmPerA > 0 && c.kv > 0;
  }),
  MODELLABLE_MOTORS.map((e) => e.model).join(", "));

/* ── 5. THE ARITHMETIC CLOSES ──────────────────────────────────────── */
const sample = motorConstants(MODELLABLE_MOTORS.find((e) => e.model === "KDE4213XF-360"));
let worstClosure = 0;
for (const rpm of [1000, 2500, 4000, 6000]) {
  for (const torqueNm of [0.05, 0.2, 0.5, 1.0]) {
    const p = motorPoint(sample, { torqueNm, rpm });
    worstClosure = Math.max(worstClosure, Math.abs(p.closureW) / p.elecPowerW);
  }
}
check("the loss split closes: P_elec = P_mech + I^2R + I0*backEMF",
  worstClosure < 0.005,
  `worst residual ${(100 * worstClosure).toFixed(3)} % — the gap is Kt vs 9.5493/Kv rounding`);

check("efficiency is an OUTPUT, never an input",
  (() => {
    const a = motorPoint(sample, { torqueNm: 0.3, rpm: 3000 });
    return a.etaMotor > 0.5 && a.etaMotor < 1 &&
           Math.abs(a.etaMotor - a.mechPowerW / a.elecPowerW) < 1e-12;
  })());

check("a non-physical operating point is refused rather than returned",
  (() => {
    try { motorPoint(sample, { torqueNm: -1, rpm: 3000 }); return false; } catch {
      try { motorPoint(sample, { torqueNm: 0.3, rpm: 0 }); return false; } catch { return true; }
    }
  })());

/* ── 6. THE HARD BOUND: P_motor <= P_bus, on every measured row ────── */
console.log("-".repeat(78));
console.log("  THE FALSIFIABLE TEST. The model's P_motor against the MEASURED bus power.");
console.log("  Bus power is printed to the nearest watt, so a row is only counted as a");
console.log("  real violation when it exceeds P_bus by more than that half-digit.");

const constFor = Object.fromEntries(MOTOR_TRUTHSET_CONSTANTS.map((c) => [c.model, {
  model: c.model, kv: c.kv, ktNmPerA: c.ktNmPerA, rmOhm: c.rmOhm,
  i0A: c.i0A, i0RefV: c.i0RefV, resistanceConvention: c.resistanceConvention,
  maxContinuousCurrentA: null, maxPowerW: null,
}]));

const hard = [], marginal = [], etaMotor = [], etaEsc = [], duty = [];
for (const row of MOTOR_TRUTHSET) {
  const c = constFor[row[C.model]];
  const p = motorPoint(c, { torqueNm: row[C.torqueNm], rpm: row[C.rpm] });
  const busW = row[C.busW];
  const ratio = p.elecPowerW / busW;
  etaMotor.push(p.etaMotor);
  etaEsc.push(p.elecPowerW / busW);
  duty.push(p.voltageV / row[C.packV]);
  const rec = { model: row[C.model], throttle: row[C.throttle], rpm: row[C.rpm],
                pMotor: p.elecPowerW, busW, ratio };
  if (p.elecPowerW > busW + 0.5) hard.push(rec);
  else if (p.elecPowerW > busW) marginal.push(rec);
}

console.log(`  ${"motor".padEnd(17)}${"thr".padStart(6)}${"rpm".padStart(7)}` +
            `${"P_motor".padStart(10)}${"P_bus".padStart(8)}${"over by".padStart(9)}`);
for (const r of [...hard].sort((a, b) => b.ratio - a.ratio))
  console.log(`  ${r.model.padEnd(17)}${r.throttle.toFixed(3).padStart(6)}${String(r.rpm).padStart(7)}` +
              `${r.pMotor.toFixed(1).padStart(10)}${r.busW.toFixed(0).padStart(8)}` +
              `${(100 * (r.ratio - 1)).toFixed(2).padStart(8)}%`);

const worstOver = hard.length ? Math.max(...hard.map((r) => r.ratio)) : 1;
const anomalousBlock = new Set(
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES.map((a) => `${a.model}/${a.cells}`));
const inAnomalous = hard.filter((r) => {
  const row = MOTOR_TRUTHSET.find((x) =>
    x[C.model] === r.model && x[C.rpm] === r.rpm && x[C.throttle] === r.throttle);
  return row && anomalousBlock.has(`${row[C.model]}/${row[C.cells]}`);
});

check("every hard violation sits in a block already flagged by the VOLTAGE audit",
  inAnomalous.length === hard.length - 1,
  `${inAnomalous.length} of ${hard.length}; two tests sharing no inputs point at the same block`);

/* ── THE POWER COLUMN IS DERIVED, WHICH IS WHY THE TWO LINK ────────── */
console.log("-".repeat(78));
console.log("  is POWER INPUT a third measurement, or V x AMPERAGE?");
console.log(`  ${"motor".padEnd(17)}${"cells".padStart(6)}${"n".padStart(5)}${"busW/(V*A)".padStart(12)}`);
for (const p of MOTOR_TRUTHSET_POWER_COLUMN.perBlock.slice(0, 4))
  console.log(`  ${p.model.padEnd(17)}${String(p.cells).padStart(6)}${String(p.n).padStart(5)}` +
              `${p.meanRatio.toFixed(4).padStart(12)}`);
console.log(`  ... ${MOTOR_TRUTHSET_POWER_COLUMN.perBlock.length} blocks in all`);

check("POWER INPUT is derived from the voltage LABEL, not measured",
  MOTOR_TRUTHSET_POWER_COLUMN.isDerived === true &&
  MOTOR_TRUTHSET_POWER_COLUMN.perBlock.every((p) => Math.abs(p.meanRatio - 1) < 0.02),
  "so a block with a wrong voltage label has a wrong power column too, invisibly");

/* ── ONE SUBSTITUTION REMOVES BOTH ANOMALIES ───────────────────────── */
const anom = MOTOR_TRUTHSET_VOLTAGE_ANOMALIES[0];
console.log("-".repeat(78));
console.log(`  ${anom.model} ${anom.cells}S — what each per-cell voltage in use would give:`);
console.log(`  ${"V/cell".padStart(8)}${"packV".padStart(8)}${"rows needing more V".padStart(21)}` +
            `${"rows over bus".padStart(15)}${"worst ratio".padStart(13)}`);
for (const s of anom.substitutionTest)
  console.log(`  ${s.perCellV.toFixed(2).padStart(8)}${s.packV.toFixed(1).padStart(8)}` +
              `${String(s.rowsNeedingMoreVoltage).padStart(21)}${String(s.rowsExceedingBusPower).padStart(15)}` +
              `${s.worstEtaJoint.toFixed(4).padStart(13)}`);

const atNominal = anom.substitutionTest.find((s) => Math.abs(s.perCellV - 3.70) < 1e-9);
const atCharged = anom.substitutionTest.find((s) => Math.abs(s.perCellV - 4.20) < 1e-9);

check("the printed 3.70 V/cell is the LiPo NOMINAL, and it breaks physics",
  atNominal.rowsNeedingMoreVoltage > 0 && atNominal.rowsExceedingBusPower > 0,
  `${atNominal.rowsNeedingMoreVoltage} rows need more voltage than the pack, ` +
  `${atNominal.rowsExceedingBusPower} exceed the bus power`);

check("4.20 V/cell — the CHARGED voltage all 13 other blocks use — removes both",
  atCharged.rowsExceedingBusPower === 0 && atCharged.worstEtaJoint < 1 &&
  atCharged.rowsNeedingMoreVoltage < atNominal.rowsNeedingMoreVoltage,
  `${atCharged.rowsNeedingMoreVoltage} and ${atCharged.rowsExceedingBusPower}; ` +
  `worst ratio falls ${atNominal.worstEtaJoint.toFixed(3)} -> ${atCharged.worstEtaJoint.toFixed(3)}. ` +
  `A substitution taken from the data set, not fitted`);

check("the model is NOT falsified once that block is set aside",
  hard.length - inAnomalous.length === 1 &&
  hard.filter((r) => r.model === "KDE6213XF-185").length === 1,
  "one KDE6213 row remains, 0.6 W on a 245 W row — inside twice the printing resolution");

check("nothing in the data was corrected to achieve that",
  anom.finding.includes("nothing here is corrected"),
  "the true test voltage is stated nowhere on the sheet; the block is excluded, not rewritten");

check("no row was quietly excused by rounding",
  marginal.length === 0,
  "every row over bus power is over it by more than the half-digit, so none is hidden");

/* ── 7. THE RESIDUAL MUST BEHAVE LIKE AN ESC ───────────────────────── */
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let c = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    c += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2;
  }
  return c / Math.sqrt(sx * sy);
};
const rEsc = corr(duty, etaEsc);

console.log("-".repeat(78));
console.log("  the residual charged to the ESC, by duty band:");
console.log(`  ${"duty".padEnd(12)}${"n".padStart(5)}${"eta_motor".padStart(11)}${"eta_esc".padStart(10)}`);
for (const [lo, hi] of [[0, 0.35], [0.35, 0.5], [0.5, 0.65], [0.65, 0.8], [0.8, 1.2]]) {
  const idx = duty.map((d, i) => [d, i]).filter(([d]) => d >= lo && d < hi).map(([, i]) => i);
  if (!idx.length) continue;
  const m = idx.reduce((a, i) => a + etaMotor[i], 0) / idx.length;
  const e = idx.reduce((a, i) => a + etaEsc[i], 0) / idx.length;
  console.log(`  ${`${lo.toFixed(2)}-${hi.toFixed(2)}`.padEnd(12)}${String(idx.length).padStart(5)}` +
              `${(100 * m).toFixed(1).padStart(10)}%${(100 * e).toFixed(1).padStart(9)}%`);
}

check("the residual is ORDERED by duty rather than arbitrary",
  rEsc > 0.4,
  `corr(duty, eta_esc) = ${rEsc.toFixed(3)} — a wrong motor model would leave an arbitrary ` +
  `residual. What SHAPE it has is a separate question the ESC gate answers, and neither a ` +
  `series resistance nor a diode-drop form survives there`);

const emin = Math.min(...etaMotor), emax = Math.max(...etaMotor);
check("predicted motor efficiency stays physical on every row",
  emin > 0.5 && emax < 1.0,
  `${(100 * emin).toFixed(1)}-${(100 * emax).toFixed(1)} %, median ` +
  `${(100 * [...etaMotor].sort((a, b) => a - b)[Math.floor(etaMotor.length / 2)]).toFixed(1)} %`);

check("the ESC residual is never above unity except on the pinned rows",
  etaEsc.filter((e) => e > 1).length === hard.length + marginal.length);

/* ── 8. THE VOLTAGE BOUND ──────────────────────────────────────────── */
console.log("-".repeat(78));
console.log("  pack-voltage label audit — rpm/Kv is a floor on supply voltage,");
console.log("  and it uses only Kv and the measured RPM.");
for (const b of MOTOR_TRUTHSET_VOLTAGE_ANOMALIES)
  console.log(`    ${b.model} ${b.cells}S: printed ${b.printedPackV} V ` +
              `(${b.perCellPrintedV} V/cell) but ${b.atRpm} rpm needs ` +
              `${b.minSupplyV.toFixed(2)} V — ${b.shortfallPct.toFixed(1)} % short`);

check("exactly one test block prints an impossible pack voltage",
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES.length === 1 &&
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES[0].model === "KDE2814XF-515",
  `13 of 14 blocks print 4.20 V/cell (LiPo charged); this one prints 3.70 (nominal)`);

check("the anomaly is reported, not corrected",
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES[0].finding.includes("nothing here is corrected"),
  "the true test voltage is not recoverable from the sheet, so no value is invented");

check("every other block's printed voltage clears the back-EMF floor",
  MOTOR_TRUTHSET_VOLTAGE_BLOCKS.filter((b) => !b.labelIsPossible).length === 1,
  `${MOTOR_TRUTHSET_VOLTAGE_BLOCKS.length} blocks checked`);

/* ── 9. PUBLISHED LIMITS ───────────────────────────────────────────── */
const kde4213 = motorConstants(MODELLABLE_MOTORS.find((e) => e.model === "KDE4213XF-360"));
const inside = limitStatus(kde4213, motorPoint(kde4213, { torqueNm: 0.2, rpm: 3000 }));
const outside = limitStatus(kde4213, motorPoint(kde4213, { torqueNm: 2.5, rpm: 6000 }));
check("an operating point inside the vendor's ratings is reported as such",
  inside.withinPublishedLimits === true && inside.current.stated,
  `${inside.current.value.toFixed(1)} A against a published ${inside.current.max} A continuous`);
check("an operating point beyond the vendor's ratings is caught",
  outside.withinPublishedLimits === false,
  `${outside.current.value.toFixed(1)} A exceeds the published ${outside.current.max} A`);
check("an unstated limit reads as unknown, never as unlimited",
  (() => {
    const s = limitStatus({ ...kde4213, maxPowerW: null }, motorPoint(kde4213, { torqueNm: 0.2, rpm: 3000 }));
    return s.power.within === null && s.power.stated === false;
  })());

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE MOTOR GATE PASSED (${pass} checks)`
                       : `DRONE MOTOR GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
