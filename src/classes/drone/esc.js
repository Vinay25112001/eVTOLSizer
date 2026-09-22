/* =====================================================================
   ESC — the measured residual, carried as a band and not as a model
   =====================================================================
   The motor block says what electrical power the motor must draw. This
   block says what the BATTERY must deliver to provide it. In between is
   the speed controller, and this file is mostly an account of why that
   gap cannot honestly be modelled from anything anyone publishes.

   ── TWO CANDIDATE MODELS, BOTH FALSIFIED ON THE MEASURED DATA ────────

   1. DAI'S SERIES RESISTANCE. Dai, Quan, Ren & Cai (IEEE/ASME T-Mech
      2019) Eqs. (31)-(32) model the ESC as one resistance R_e:

          U_e = U_m + I_m R_e,  I_e = I_m,  eta_e = U_m/(U_m + I_m R_e)

      With the battery side I_b = sigma I_e, that predicts
      P_bus - P_motor = I_m^2 R_e, where R_e is a CONSTANT for a given
      ESC. Solved for R_e on every measured row it is not constant: it
      runs 0.93 ohm at low duty to 0.17 ohm near full, a factor of 5.5,
      and the drift is the same sign on all four motors independently
      (4.6x, 4.9x, 5.4x, 3.7x). corr(duty, R_e) = -0.38. The ESC loss on
      this hardware is not a series resistance.

   2. DIODE FREEWHEELING. With synchronous rectification off the
      freewheeling current crosses a body diode at a roughly constant
      forward drop, giving a loss ~ (1-duty) V_f I_m that falls as duty
      rises — the right direction, and KDE states "Synchronous
      Rectification: Deactivated". Fitting
      P_bus - P_motor = I_m^2 R_e + (1-duty) V_f I_m per motor returns
      V_f = +2.03, +3.19, -0.26, -2.82 V. Half of them are NEGATIVE,
      which is not a diode, and none is near the 0.3-1.0 V a real one
      drops. The form is absorbing something else, so it is not used.

   It is not that the residual is noise. Propagating only the printing
   resolution — bus power to the nearest watt, torque to two decimals —
   gives 2-6 % of the loss. The signal is real; the models are wrong.

   ── THE DEEPER REASON: ONE MEASUREMENT, TWO UNKNOWNS ─────────────────
   P_bus is measured and P_mech is measured. P_motor is not — no
   production thrust stand instruments between the ESC and the motor. So

       P_bus - P_motor(model)  =  ESC loss  +  motor-model error

   and nothing in this data separates the two terms. Calling the residual
   "ESC efficiency" would assert the motor model is exact, which §10 of
   MOTOR-MODEL.md shows it is not — it is falsified outright on 4 rows.
   Everything below is therefore named a JOINT residual, and a caller who
   wants the ESC's own efficiency does not get it from here.

   ── SO WHAT THIS MODULE DOES ─────────────────────────────────────────
   The same thing rotor.js does: look up what was measured, interpolate
   between measurements, refuse to extrapolate, and say which of those
   happened. The table is built at module load from the vendored measured
   rows and the current motor block, so it cannot go stale relative to
   motor.js — there is no generated copy to forget to regenerate.

   The band is carried, not just the median. At a given duty the four
   motors disagree by up to 8 points and the p10-p90 spread is 11-22
   points. A single number there would be a fiction.

   WHY NOT JUST USE A CONSTANT. Because the measured median runs 72 % at
   low duty to 88 % near full, and a fixed 85 % — the all-row median — is
   +17.4 % wrong at quarter duty. That error lands directly on predicted
   endurance.

   ── SCOPE, WHICH IS NARROW ───────────────────────────────────────────
   These rows describe ONE ESC: the KDE-UAS125UVC, with synchronous
   rectification DEACTIVATED, at 20-59 V and 1.8-57.5 A of motor current.
   A modern BLHeli_32 or AM32 controller uses complementary PWM, which
   removes exactly the body-diode conduction that dominates this table's
   low-duty end. Applying this table to such a controller would be
   pessimistic at low duty by an amount nobody in the survey publishes.

   In the current catalogue 1 of 10 ESCs states its rectification mode
   (APD HV Pro, "synchronous rectification"); the other 9 state nothing.
   `rectificationMode` reports that, and `escPoint` flags rather than
   silently applying a diode-mode table to a part that may not be one.
   ===================================================================== */
import {
  MOTOR_TRUTHSET, MOTOR_TRUTHSET_COLUMNS, MOTOR_TRUTHSET_CONSTANTS,
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES,
} from "../../data/drone-motor-truthset.js";
import { motorPoint } from "./motor.js";

const COL = Object.fromEntries(MOTOR_TRUTHSET_COLUMNS.map((n, i) => [n, i]));

export const ESC_UNDER_TEST = Object.freeze({
  model: "KDE-UAS125UVC",
  statedBy: "KDE, on every performance sheet in the truth set",
  synchronousRectification: false,
  statedVerbatim: "Synchronous Rectification: Deactivated",
  note: "One controller, one firmware, one set of conditions. Nothing here "
      + "generalises to a synchronously rectified ESC, and the direction of "
      + "the difference is known while its size is not.",
});

/* What the residual actually contains. Kept as data so a caller cannot
   read `etaJoint` as an ESC efficiency without meeting this. */
export const RESIDUAL_MEANING = Object.freeze({
  isEscEfficiency: false,
  contains: Object.freeze(["ESC loss", "any error in the motor model"]),
  separable: false,
  why: "P_bus and P_mech are measured; P_motor is not. One measurement, two "
     + "unknowns. The motor model is independently known to be falsified on "
     + "4 of 419 rows, so the residual cannot be attributed wholly to the ESC.",
});

/* Models tried against this data and rejected, with the number that
   rejected them. Recorded so the next person does not re-derive them. */
export const REJECTED_MODELS = Object.freeze([
  Object.freeze({
    name: "Dai series resistance",
    source: "Dai, Quan, Ren & Cai, IEEE/ASME T-Mech 2019, Eqs. (31)-(32)",
    prediction: "P_bus - P_motor = I_m^2 R_e with R_e constant per ESC",
    result: "R_e varies 5.5x with duty (0.93 -> 0.17 ohm); same sign on all "
          + "four motors (4.6x, 4.9x, 5.4x, 3.7x); corr(duty, R_e) = -0.38",
    verdict: "falsified on this hardware",
  }),
  Object.freeze({
    name: "Diode freewheeling two-term",
    source: "standard power-electronics form, motivated by KDE's stated "
          + "'Synchronous Rectification: Deactivated'",
    prediction: "P_bus - P_motor = I_m^2 R_e + (1-duty) V_f I_m, V_f ~ 0.3-1.0 V",
    result: "fitted V_f = +2.03, +3.19, -0.26, -2.82 V across the four motors; "
          + "half negative, none in the physical band",
    verdict: "not supported; the form absorbs something other than diode drop",
  }),
]);

/* ── BUILDING THE TABLE FROM THE MEASURED ROWS ──────────────────────
   Two exclusions, both principled rather than convenient:

   1. Rows where the model already predicts more power than the bus
      delivered. Those are the pinned falsifications; including them
      would put an above-unity efficiency into the table.
   2. Every row in a test block whose printed pack voltage is impossible.
      Duty is V_motor/V_pack, so a bad denominator makes duty meaningless
      — and it is exactly why some raw rows compute a duty above 1. This
      drops the KDE2814's 4S block, which the voltage audit flagged
      independently of anything here. */
const anomalousBlocks = new Set(
  MOTOR_TRUTHSET_VOLTAGE_ANOMALIES.map((a) => `${a.model}/${a.cells}`));

const constFor = Object.fromEntries(MOTOR_TRUTHSET_CONSTANTS.map((c) => [c.model, {
  model: c.model, kv: c.kv, ktNmPerA: c.ktNmPerA, rmOhm: c.rmOhm,
  i0A: c.i0A, i0RefV: c.i0RefV, resistanceConvention: c.resistanceConvention,
  maxContinuousCurrentA: null, maxPowerW: null,
}]));

function buildSamples() {
  const kept = [], excluded = { falsified: 0, anomalousVoltageBlock: 0 };
  for (const row of MOTOR_TRUTHSET) {
    const model = row[COL.model];
    if (anomalousBlocks.has(`${model}/${row[COL.cells]}`)) {
      excluded.anomalousVoltageBlock++;
      continue;
    }
    const p = motorPoint(constFor[model], {
      torqueNm: row[COL.torqueNm], rpm: row[COL.rpm],
    });
    const etaJoint = p.elecPowerW / row[COL.busW];
    if (!(etaJoint <= 1)) { excluded.falsified++; continue; }
    kept.push({
      model, duty: p.voltageV / row[COL.packV], etaJoint,
      motorCurrentA: p.currentA, busPowerW: row[COL.busW],
      packV: row[COL.packV], throttle: row[COL.throttle],
    });
  }
  kept.sort((a, b) => a.duty - b.duty);
  return { kept, excluded };
}

const { kept: SAMPLES, excluded: EXCLUDED } = buildSamples();

export const TABLE_PROVENANCE = Object.freeze({
  rowsInTruthSet: MOTOR_TRUTHSET.length,
  rowsUsed: SAMPLES.length,
  excludedFalsified: EXCLUDED.falsified,
  excludedAnomalousVoltageBlock: EXCLUDED.anomalousVoltageBlock,
  dutyRange: Object.freeze([SAMPLES[0].duty, SAMPLES[SAMPLES.length - 1].duty]),
  motorCurrentRangeA: Object.freeze([
    Math.min(...SAMPLES.map((s) => s.motorCurrentA)),
    Math.max(...SAMPLES.map((s) => s.motorCurrentA))]),
  packVoltages: Object.freeze([...new Set(SAMPLES.map((s) => s.packV))].sort((a, b) => a - b)),
  builtFrom: "computed at module load from the vendored measured rows and the "
           + "current motor block, so it cannot go stale relative to motor.js",
});

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/* The table. Bands of duty wide enough that each holds several motors, so
   the spread reported is disagreement BETWEEN motors and not scatter
   within one. */
const EDGES = Object.freeze([0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.001]);

export const JOINT_RESIDUAL_TABLE = Object.freeze(
  EDGES.slice(0, -1).map((lo, i) => {
    const hi = EDGES[i + 1];
    const g = SAMPLES.filter((s) => s.duty >= lo && s.duty < hi);
    if (g.length < 5) return null;
    const e = g.map((s) => s.etaJoint).sort((a, b) => a - b);
    return Object.freeze({
      dutyLo: lo, dutyHi: hi, duty: 0.5 * (lo + hi),
      n: g.length,
      motors: new Set(g.map((s) => s.model)).size,
      median: quantile(e, 0.5),
      p10: quantile(e, 0.10),
      p90: quantile(e, 0.90),
      spread: quantile(e, 0.90) - quantile(e, 0.10),
    });
  }).filter(Boolean));

/* Look the residual up at a duty.

   Linear interpolation between band centres. Outside the measured duty
   range the nearest band is returned UNCHANGED and flagged `clamped-low`
   or `clamped-high` — it is not an estimate for that duty, exactly as
   rotor.js treats an out-of-range RPM. */
export function jointResidualAt(duty) {
  if (!Number.isFinite(duty) || duty <= 0)
    throw new Error(`esc: duty must be positive, got ${duty}`);
  const T = JOINT_RESIDUAL_TABLE;
  const first = T[0], last = T[T.length - 1];
  const out = (b, mode) => ({
    duty, median: b.median, p10: b.p10, p90: b.p90,
    spread: b.spread, n: b.n, mode, measuredDuty: b.duty,
  });
  if (duty <= first.duty) return out(first, duty === first.duty ? "measured" : "clamped-low");
  if (duty >= last.duty) return out(last, duty === last.duty ? "measured" : "clamped-high");
  for (let i = 1; i < T.length; i++) {
    const a = T[i - 1], b = T[i];
    if (duty >= a.duty && duty <= b.duty) {
      const t = (duty - a.duty) / (b.duty - a.duty);
      const mix = (x, y) => x + t * (y - x);
      return {
        duty,
        median: mix(a.median, b.median),
        p10: mix(a.p10, b.p10),
        p90: mix(a.p90, b.p90),
        spread: mix(a.spread, b.spread),
        n: a.n + b.n, mode: "interpolated",
      };
    }
  }
  throw new Error(`esc: no bracket for duty ${duty}`);
}

/* What a catalogue ESC says about its own rectification.

   Returns "synchronous", "diode", or "notStated". Only an explicit
   statement counts. Inferring it from a firmware name would be a guess
   dressed as a datum: BLHeli_32 and AM32 do default to complementary
   PWM, but neither the ESC's page nor its spec table says so, and the
   setting is user-configurable in both. */
export function rectificationMode(escEntry) {
  const hay = `${escEntry?.firmware ?? ""} ${escEntry?.firmware_note ?? ""} `
            + `${escEntry?.notes ?? ""} ${escEntry?.protocol_note ?? ""}`.toLowerCase();
  if (/synchronous rectification/.test(hay)) return "synchronous";
  if (/(non-synchronous|asynchronous) rectification|rectification:\s*deactivated/.test(hay))
    return "diode";
  return "notStated";
}

/* THE ESC POINT. Motor demand in, battery demand out.

   `etaJoint` is the median of the measured band. `p10`/`p90` come with it
   and a caller propagating uncertainty should use them rather than
   treating the median as exact — at low duty they are 22 points apart.

   `warnings` is the honest part: it says when the table is being applied
   outside what it describes. It is never empty for a part whose
   rectification mode is unstated, which is 9 of the 10 catalogue ESCs. */
export function escPoint(point, { packVoltageV, escEntry = null } = {}) {
  if (!(packVoltageV > 0))
    throw new Error(`esc: pack voltage must be positive, got ${packVoltageV}`);
  const warnings = [];
  const duty = point.voltageV / packVoltageV;

  /* An ESC bucks; it cannot boost. A duty above 1 means the pack cannot
     drive this operating point at all — a hard feasibility failure, not
     something to clamp and carry on from. */
  const feasible = duty <= 1;
  if (!feasible)
    warnings.push(`pack cannot drive this point: the motor needs `
      + `${point.voltageV.toFixed(2)} V but the pack is ${packVoltageV.toFixed(2)} V `
      + `(duty ${duty.toFixed(3)}). An ESC steps down, never up.`);

  const band = jointResidualAt(Math.min(duty, 1));
  if (band.mode.startsWith("clamped"))
    warnings.push(`duty ${duty.toFixed(3)} is outside the measured range `
      + `${TABLE_PROVENANCE.dutyRange.map((d) => d.toFixed(2)).join("-")}; `
      + `the nearest measured band is returned unchanged, not an estimate for this duty`);

  const mode = escEntry ? rectificationMode(escEntry) : "notStated";
  if (mode === "synchronous")
    warnings.push("this ESC states SYNCHRONOUS rectification; the table was "
      + "measured with it DEACTIVATED, so the table is pessimistic at low duty "
      + "by an amount no vendor in the survey publishes");
  else if (mode === "notStated")
    warnings.push("this ESC does not state its rectification mode, so whether "
      + "the measured table applies to it is unknown (9 of 10 catalogue ESCs)");

  if (point.currentA > TABLE_PROVENANCE.motorCurrentRangeA[1])
    warnings.push(`motor current ${point.currentA.toFixed(1)} A is above the `
      + `${TABLE_PROVENANCE.motorCurrentRangeA[1].toFixed(1)} A the table was measured to`);

  const busPowerW = point.elecPowerW / band.median;
  return {
    duty, feasible,
    etaJoint: band.median,
    etaJointP10: band.p10, etaJointP90: band.p90,
    lookupMode: band.mode,
    busPowerW,
    busPowerW_p10: point.elecPowerW / band.p90,   // best case -> least bus power
    busPowerW_p90: point.elecPowerW / band.p10,   // worst case -> most bus power
    busCurrentA: busPowerW / packVoltageV,
    lossW: busPowerW - point.elecPowerW,
    isEscEfficiency: false,
    warnings: Object.freeze(warnings),
  };
}

/* Is a catalogue ESC electrically able to run this point?

   Checks only what the vendor publishes, and reports `null` — not a pass
   — where it publishes nothing. An unstated rating is unknown, never
   unlimited. */
export function escLimitStatus(escEntry, esc, { cells = null } = {}) {
  const lim = (value, max) =>
    max == null ? { value, max: null, stated: false, within: null }
                : { value, max, stated: true, within: value <= max,
                    marginPct: 100 * (max - value) / max };
  const cont = escEntry?.continuous_current_a ?? null;
  const burst = escEntry?.burst_current_a ?? null;
  const current = lim(esc.busCurrentA, cont);
  const burstC = lim(esc.busCurrentA, burst);
  let cellsOk = null;
  if (cells != null && escEntry?.lipo_cell_count_min != null && escEntry?.lipo_cell_count_max != null)
    cellsOk = cells >= escEntry.lipo_cell_count_min && cells <= escEntry.lipo_cell_count_max;
  return {
    continuousCurrent: current,
    burstCurrent: burstC,
    cellCountOk: cellsOk,
    withinPublishedLimits: current.within !== false && cellsOk !== false,
    limitsStated: [current, burstC].filter((x) => x.stated).length + (cellsOk === null ? 0 : 1),
  };
}

/* ── SELECTING AN ESC ───────────────────────────────────────────────
   Ranks the catalogue against a demand, on PUBLISHED data only.

   Two things this refuses to do. It does not rank on the measured
   residual table — that table describes one controller and applies
   equally to every candidate, so using it to choose between them would
   be ranking on a constant. And it does not treat an unpublished rating
   as headroom: `requireStatedLimits` defaults to true, so a part whose
   vendor states no continuous current is EXCLUDED with a reason rather
   than silently accepted.

   `completeness` counts how much of what matters the vendor actually
   published. It is reported, not scored into the ranking, because a
   well-documented part that cannot carry the current is still the wrong
   part. */
export const ESC_KEY_FIELDS = Object.freeze([
  "continuous_current_a", "burst_current_a", "burst_duration_s",
  "lipo_cell_count_max", "mass_g", "telemetry", "cooling",
]);

export function escCandidates(escs, { busCurrentA, cells = null, requireStatedLimits = true } = {}) {
  if (!(busCurrentA > 0)) throw new Error("esc: a positive current demand is required");
  const out = [];
  for (const e of escs) {
    let massG = e.mass_g;
    let massNote = null;
    if (massG && typeof massG === "object") {
      const vals = Object.values(massG).filter((x) => typeof x === "number");
      massNote = `vendor publishes ${vals.length} masses for this part (${vals.join(", ")} g); the lightest is used`;
      massG = vals.length ? Math.min(...vals) : null;
    }
    const s = escLimitStatus(e, { busCurrentA }, { cells });
    const published = ESC_KEY_FIELDS.filter((k) => e[k] != null).length;
    const reasons = [];
    if (s.continuousCurrent.stated === false) reasons.push("no continuous current rating published");
    else if (s.continuousCurrent.within === false)
      reasons.push(`${busCurrentA.toFixed(1)} A exceeds the published ${s.continuousCurrent.max} A`);
    if (s.cellCountOk === false) reasons.push(`pack is ${cells}S, outside the published ${e.lipo_cell_count_min}-${e.lipo_cell_count_max}S`);
    if (massG == null) reasons.push("no mass published");

    const viable = reasons.length === 0
      || (!requireStatedLimits && reasons.length === 1 && /no continuous current/.test(reasons[0]));
    out.push({
      esc: e, massG, massNote, status: s, viable,
      excludedBecause: viable ? null : reasons,
      headroomPct: s.continuousCurrent.stated ? s.continuousCurrent.marginPct : null,
      burstStated: e.burst_current_a != null,
      burstDurationStated: e.burst_duration_s != null,
      rectification: rectificationMode(e),
      completeness: published, completenessOf: ESC_KEY_FIELDS.length,
    });
  }
  /* Viable first, then lightest — mass is the only axis on which these
     differ that the vendor publishes for all of them. */
  return out.sort((a, b) =>
    (b.viable - a.viable) || ((a.massG ?? 1e9) - (b.massG ?? 1e9)));
}
