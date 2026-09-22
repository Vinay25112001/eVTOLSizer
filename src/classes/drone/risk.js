/* =====================================================================
   RISK — what is actually known to be uncertain about THIS drone
   =====================================================================
   This follows the position the aircraft side already took in
   src/classes/aircraft/risk.js, and for the same reasons.

   WHAT THIS DELIBERATELY IS NOT.

   It is not a five-by-five likelihood-consequence matrix. NASA publishes
   none: NPR 8000.4C contains no matrix and no scales, and
   NASA/SP-20240014019 (2024) p. 74 states the qualitative five-by-five
   "can no longer be considered valid".

   It is not a Monte Carlo over input distributions. The aircraft module
   gives the argument in full; on the drone side it is worse, not better.
   Three of the five sizing inputs are DECLARED precisely because nobody
   publishes them, so sampling them would be sampling this tool's own
   plausibility bounds and calling the spread an uncertainty. The two
   cited candidates for usable fraction do not even disagree in degree -
   they disagree in KIND, a capacity fraction against a cell voltage.
   There is no distribution to sample.

   ── WHAT IT IS, AND THE HONEST LIMIT OF IT ───────────────────────────

   1. AN EXCEEDANCE CURVE over the one layer of this engine that HAS a
      cross-validated error distribution: the rotor. Every interior
      measured point in the UIUC database is dropped in turn, predicted
      from the propeller's remaining points by the same module the app
      uses, and compared with what was measured there. That is 3,621
      held-out predictions and it is a model-error distribution built
      from measurement, which is the one statistically grounded
      construction available here.

   2. A RISK REGISTER whose every entry is a checkable fact about THIS
      design, with the consequence quantified wherever the record
      supports it. No likelihood is scored, because nothing here can
      honestly score one. `severity` orders the list for reading; it is
      not a number and is not multiplied by anything.

   ── THE LIMIT, STATED PLAINLY ────────────────────────────────────────
   THE EXCEEDANCE CURVE DESCRIBES THE ROTOR LAYER ONLY. It is not a
   confidence interval on take-off mass or on endurance, and it must
   never be presented as one. The other layers have no error
   distribution, and the reasons differ:

     motor    eta_motor is not measured on any production thrust stand,
              so the motor/ESC split is the model's own output. There is
              nothing to take a residual against.
     ESC      the p10-p90 band is the disagreement BETWEEN motors at the
              same duty, which is a spread, not a prediction error.
     battery  the pack discrepancies are data-quality findings about
              vendor sheets, not model error.
     vehicle  NOTHING. No aircraft exists whose components are all in the
              measured databases, so the sizing loop has never been
              scored against a real drone at all.

   A reader who wants a confidence band on the whole answer cannot have
   one, and the register says so as its first entry rather than leaving
   the exceedance curve to imply otherwise.
   ===================================================================== */
import { PROPELLERS } from "../../data/drone-propellers.js";
import { VEHICLES } from "../../data/drone-vehicles.js";
import { staticCoefficients } from "./rotor.js";
import { JOINT_RESIDUAL_TABLE, TABLE_PROVENANCE, rectificationMode } from "./esc.js";
import { voltageFieldAudit, PER_CELL_V } from "./battery.js";
import { modellability } from "./motor.js";

/* ── THE ONE MEASURED ERROR DISTRIBUTION ────────────────────────────
   Leave-one-out over the measured propeller database. Endpoints are
   excluded rather than extrapolated, because scoring an extrapolation
   the module refuses to perform would flatter it. Computed once and
   cached: 3,621 points take about 7 ms. */
let _loo = null;
export function rotorResiduals() {
  if (_loo) return _loo;
  const all = [], byProp = new Map();
  for (const p of PROPELLERS) {
    if (!p.static || p.static.length < 3) continue;
    const mine = [];
    for (let i = 1; i < p.static.length - 1; i++) {
      const held = p.static[i];
      const sub = { ...p, static: p.static.filter((_, k) => k !== i) };
      try {
        const pred = staticCoefficients(sub, held[0]);
        if (pred.mode !== "interpolated") continue;     // never score a clamp
        const e = 100 * (pred.ct - held[1]) / held[1];
        if (!isFinite(e)) continue;
        all.push(e); mine.push(e);
      } catch { /* a propeller that cannot be bracketed contributes nothing */ }
    }
    if (mine.length) byProp.set(p.id, mine.sort((a, b) => a - b));
  }
  all.sort((a, b) => a - b);
  _loo = { all, byProp, n: all.length, propellers: byProp.size };
  return _loo;
}

const quantile = (sorted, f) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : null;

function describe(errs) {
  if (!errs.length) return null;
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  return {
    n: errs.length,
    median: quantile(errs, 0.5),
    p05: quantile(errs, 0.05), p95: quantile(errs, 0.95),
    medianAbs: quantile(abs, 0.5),
    p95Abs: quantile(abs, 0.95),
    worstAbs: abs[abs.length - 1],
    mean: errs.reduce((s, x) => s + x, 0) / errs.length,
  };
}

/* The exceedance curve, for the stratum this design falls in.

   The stratum is THIS propeller when it has enough held-out points of
   its own to say anything, and the whole database otherwise. Both are
   returned, because the difference between them is informative: a
   propeller markedly worse than the database is a reason to choose a
   different one.

   `minForOwnStratum` is 20 because a 95th percentile over a dozen points
   is an order statistic of a dozen points, not a percentile. Most
   propellers in this database carry fewer than that, so most designs are
   scored against the full 3,621 and the result says which was used. */
export function exceedance(propellerId, { minForOwnStratum = 20 } = {}) {
  const loo = rotorResiduals();
  const own = propellerId ? loo.byProp.get(propellerId) : null;
  const useOwn = own && own.length >= minForOwnStratum;
  const errs = useOwn ? own : loo.all;
  const stratum = useOwn
    ? `${propellerId} — this propeller's own held-out points`
    : `all ${loo.propellers} measured propellers`;

  const maxAbs = Math.max(1, Math.ceil(Math.max(...errs.map(Math.abs))));
  const step = maxAbs > 12 ? 0.5 : 0.25;
  const curve = [];
  for (let x = 0; x <= maxAbs + 1e-9; x += step) {
    curve.push({
      errPct: x,
      /* P(|error| > x): how often the held-out prediction was out by more
         than this much, either way. */
      exceed: 100 * errs.filter((e) => Math.abs(e) > x).length / errs.length,
    });
  }
  return {
    stratum, usedOwnStratum: !!useOwn, curve,
    ...describe(errs),
    databaseWide: describe(loo.all),
    appliesTo: "the ROTOR layer only — thrust coefficient from the measured curve. "
      + "It is NOT a confidence interval on take-off mass or endurance, and no such "
      + "interval exists for this engine.",
    method: "leave-one-out cross-validation over the UIUC measured static rows, scored by "
      + "the same rotor module the app uses. Endpoints are excluded rather than "
      + "extrapolated. Nothing is fitted, so this is the method's error and not a "
      + "residual after calibration.",
  };
}

/* ── THE REGISTER ───────────────────────────────────────────────────
   Every entry is a fact about THIS design that can be checked. No
   likelihood is scored. `severity` orders the list for reading. */
export function riskRegister({ design, airframe = null, acaiPerRotor = null } = {}) {
  const { v, built, result, ok } = design;
  const out = [];
  const add = (r) => out.push(r);

  /* 1. THE ONE EVERY READER NEEDS FIRST. */
  add({
    id: "no-vehicle-validation", severity: "high",
    title: "The sizing loop has never been scored against a real drone",
    evidence: "No aircraft exists whose components are all in the measured databases. NASA's GAMMA "
      + "octocopter publishes a measured inertia tensor and runs the KDE4213-XF this engine models, "
      + "but turns an APC 15x5.5 that UIUC never tested. Freefly's Alta X publishes the best "
      + "endurance sweep in the survey, on 33-inch rotors against a measured span of 2.2 to 21.0 "
      + `inches. ${VEHICLES.filter((x) => x.rotors == null).length} of ${VEHICLES.length} surveyed `
      + "aircraft do not state their rotor count.",
    consequence: "There is no validated error band on take-off mass or endurance. The exceedance "
      + "curve on this page describes the ROTOR layer and nothing above it.",
    reduce: "Either measure a propeller that a published aircraft actually uses, or accept the "
      + "result as a component-selection calculation rather than a performance prediction.",
  });

  if (!ok) return out;

  const mtom = result.massKg;
  const bd = result.massBreakdown;

  /* 2. DECLARED INPUTS, ORDERED BY HOW MUCH THEY MOVE THE ANSWER. */
  const structFrac = bd.structureKg / mtom;
  add({
    id: "structure-declared", severity: structFrac > 0.12 ? "high" : "medium",
    title: "Structure mass is declared, and nothing publishes one",
    evidence: `Only the Alta X publishes an empty weight (10.4 kg at 34.9 kg MTOM) and it bundles `
      + `motors, ESCs, propellers and avionics together, so it cannot be decomposed. One data point `
      + `is not a correlation. Here structure is ${(100 * structFrac).toFixed(1)} % of all-up mass, `
      + `the ${structFrac > bd.batteryFraction ? "largest" : "second largest"} single item after the battery.`,
    consequence: `A 20 % error in the declared ${v.structureMassKg.toFixed(2)} kg moves all-up mass `
      + `by about ${(0.2 * bd.structureKg).toFixed(2)} kg before the loop re-closes, and the battery `
      + `grows with it.`,
    reduce: "Weigh a frame. Until then this input, not the component choice, sets the answer.",
  });

  add({
    id: "usable-fraction-declared", severity: "medium",
    title: "Usable pack fraction is declared, and the cited criteria disagree in kind",
    evidence: "No manufacturer page in the survey states a discharge cut-off. Dai et al. use 0.85 as "
      + "a capacity fraction; Bauersfeld & Scaramuzza define end of discharge as 3.5 V per cell, "
      + "which carries no fraction at all because converting it needs a discharge curve nobody "
      + `publishes. This design uses ${v.usableFraction.toFixed(2)}.`,
    consequence: `Endurance scales directly with it: at 0.80 this design gives `
      + `${(result.endurance.minutes * 0.80 / v.usableFraction).toFixed(1)} min, at 0.90 `
      + `${(result.endurance.minutes * 0.90 / v.usableFraction).toFixed(1)} min, against the `
      + `${result.endurance.minutes.toFixed(1)} min shown.`,
    reduce: "Choose a cut-off criterion and state it with the result.",
  });

  /* 3. WHERE THE OPERATING POINT SITS INSIDE THE MEASURED DATA. */
  const pts = built.propeller.static;
  const rpmLo = pts[0][0], rpmHi = pts[pts.length - 1][0];
  const headroom = (rpmHi - result.hover.rpm) / (rpmHi - rpmLo);
  if (result.rotorMode && result.rotorMode.startsWith("clamped")) add({
    id: "rotor-clamped", severity: "high",
    title: "The hover point is outside the propeller's measured range",
    evidence: `Hover needs ${result.hover.rpm.toFixed(0)} rpm; the measured range is ${rpmLo}-${rpmHi} rpm.`,
    consequence: "The coefficient returned is the nearest measured one, unchanged. It is not an "
      + "estimate for this rpm.",
    reduce: "Choose a propeller whose measured range covers the hover point.",
  });
  else if (headroom < 0.15) add({
    id: "rotor-near-edge", severity: "medium",
    title: "The hover point sits near the top of the measured range",
    evidence: `Hover at ${result.hover.rpm.toFixed(0)} rpm against a measured ceiling of ${rpmHi} rpm `
      + `— ${(100 * headroom).toFixed(0)} % of the range left above it.`,
    consequence: "Thrust margin is bounded by the edge of the DATA, not by the motor. The quoted "
      + "thrust-to-weight cannot be exceeded without leaving what was measured.",
    reduce: "A larger propeller, or one measured to higher rpm.",
  });

  const ex = exceedance(built.propeller.id);
  add({
    id: "rotor-accuracy", severity: ex.p95Abs > 3 ? "medium" : "low",
    title: "Cross-validated accuracy of the rotor layer",
    evidence: `${ex.n} held-out predictions over ${ex.stratum}. Median absolute error `
      + `${ex.medianAbs.toFixed(2)} %, 95th percentile ${ex.p95Abs.toFixed(2)} %, worst `
      + `${ex.worstAbs.toFixed(1)} %.`,
    consequence: `Thrust at a given rpm carries about this error, and hover power carries it too. `
      + `It is the best-evidenced layer in the engine.`,
    reduce: ex.usedOwnStratum ? "No action: scored on this propeller's own points."
      : "Not enough held-out points on this propeller alone; the database-wide figure is used.",
  });

  /* 4. THE LAYERS WITH NO ERROR DISTRIBUTION AT ALL. */
  add({
    id: "motor-split-unmeasured", severity: "medium",
    title: "The motor/ESC split is the model's own output, not a measurement",
    evidence: "No production thrust stand instruments between the ESC and the motor. KDE publishes "
      + "shaft torque, rpm and DC bus power, so mechanical and total electrical power are measured "
      + "but the motor's terminal power is not.",
    consequence: `The ${(100 * result.hover.motor.etaMotor).toFixed(1)} % motor efficiency shown has `
      + "no measured counterpart to be scored against. What IS checked is that predicted motor power "
      + "never exceeds the measured bus power, on 419 rows.",
    reduce: "A bench measurement between ESC and motor would make this scoreable.",
  });

  const mode = rectificationMode(built.esc);
  add({
    id: "esc-rectification", severity: mode === "notStated" ? "medium" : "low",
    title: mode === "notStated"
      ? "This ESC does not state its rectification mode"
      : `This ESC states ${mode} rectification`,
    evidence: `The measured table came from a ${TABLE_PROVENANCE.rowsUsed}-row set on one controller `
      + "with synchronous rectification DEACTIVATED. 9 of 10 catalogue ESCs state nothing about theirs.",
    consequence: mode === "synchronous"
      ? "The table is pessimistic at low duty for this part, by an amount no vendor publishes."
      : mode === "notStated"
        ? `Whether the table applies here is unknown. At the design duty of `
          + `${result.hover.esc.duty.toFixed(2)} the measured band spans `
          + `${(100 * result.hover.esc.etaJointP10).toFixed(0)}-${(100 * result.hover.esc.etaJointP90).toFixed(0)} %, `
          + `which is ${(100 * (result.hover.esc.etaJointP90 - result.hover.esc.etaJointP10)).toFixed(0)} points on bus power.`
        : "The table's conditions match this part.",
    reduce: "Ask the vendor, or measure it.",
  });

  /* 5. COMPONENT-LEVEL FACTS. */
  const held = modellability(built.motor);
  if (!held.conventionFullyStated) add({
    id: "motor-convention", severity: "medium",
    title: "This motor's winding topology is not stated",
    evidence: `Resistance convention "${held.convention}". Phase-to-phase resistance is 2x R_phase on `
      + "a wye motor and 2/3 x on a delta one, so the printed number is ambiguous by a factor of three "
      + "where the winding is unstated.",
    consequence: "Copper loss, which is I^2 R, inherits that ambiguity.",
    reduce: "Prefer a motor that states both. Only 3 of 24 in the catalogue can be modelled at all.",
  });

  const audit = voltageFieldAudit(built.pack);
  if (audit.checkable && audit.consistent === false) {
    /* TWO DIFFERENT DEFECTS WEAR THE SAME SYMPTOM, and grading them alike
       over-weights the mild one. A double-digit error means the voltage
       field holds a CHARGE LIMIT — DJI's TB60 is +14.4 % because 52.8 V
       is 4.40 V/cell, its own charging limit. A few percent usually means
       the printed nominal is simply coarser than the mean discharge
       voltage the energy figure implies: Molicel's P42A publishes
       "4200 mAh / 15.5 Wh", which needs 3.69 V, against a 3.60 V label.
       Both are worth reporting; only the first changes an answer. */
    const big = Math.abs(audit.errorPct) >= 10;
    add({
    id: "pack-voltage-field", severity: big ? "high" : "medium",
    title: big
      ? "This pack's voltage field holds a CHARGE LIMIT, not a nominal"
      : "This pack's printed nominal is coarser than its energy figure implies",
    /* The evidence has to agree with the title. Saying "charge limit" on a
       row headed "coarser nominal" is the row contradicting itself. */
    evidence: `Capacity x printed voltage gives ${audit.ahTimesVWh.toFixed(1)} Wh against a published `
      + `${audit.energyWhPublished} Wh, ${audit.errorPct.toFixed(1)} % out. At `
      + `${audit.perCellPrintedV.toFixed(2)} V per cell the printed field is `
      + (big
          ? `a CHARGE LIMIT, not a nominal — the defect DJI's TB60 makes at 4.40 V per cell.`
          : `inside the ${PER_CELL_V.nominalBand.join("-")} V nominal band, so it IS a nominal; `
            + `it is simply coarser than the ${audit.perCellImpliedV.toFixed(2)} V per cell the `
            + `published energy implies.`),
    consequence: big
      ? "Anyone computing energy as capacity times voltage gets a pack that does not exist, by "
        + `${Math.abs(audit.errorPct).toFixed(0)} %. The published watt-hour figure is used here.`
      : `Computing energy as capacity times voltage would be ${Math.abs(audit.errorPct).toFixed(1)} % `
        + `out. The published watt-hour figure is used here, so nothing downstream is affected; `
        + `the implied mean discharge voltage is ${audit.impliedNominalV.toFixed(2)} V against a `
        + `printed ${built.pack.voltagePrintedV.toFixed(2)} V.`,
    reduce: big
      ? "Use the published Wh. Treat the voltage field on this vendor's sheets with suspicion."
      : "No action: the published Wh is used. Do not compute pack energy from the nominal.",
  });
  }

  if (result.packDischarge && result.packDischarge.stated === false) add({
    id: "pack-discharge-unknown", severity: "medium",
    title: "This pack publishes no continuous discharge rating",
    evidence: `The design draws ${result.packDischarge.currentA.toFixed(1)} A per pack, which is `
      + `${result.packDischarge.cRateDemanded ? result.packDischarge.cRateDemanded.toFixed(1) + " C" : "an unknown C rate"}. `
      + "The vendor publishes neither a continuous current nor a C rating.",
    consequence: "Whether the pack can sustain the hover draw is UNKNOWN, not verified.",
    reduce: "Choose a cell that publishes a discharge rating.",
  });

  const lim = result.hover.motorLimits;
  if (lim.current.stated && lim.current.marginPct < 25) add({
    id: "motor-current-margin", severity: lim.current.within === false ? "high" : "medium",
    title: lim.current.within === false
      ? "Hover current exceeds the motor's published continuous rating"
      : "Little margin on the motor's continuous current rating",
    evidence: `${lim.current.value.toFixed(1)} A at hover against a published ${lim.current.max} A `
      + `continuous (${lim.current.marginPct.toFixed(0)} % margin). ${lim.note}`,
    consequence: "Hover is the LIGHTEST case. Manoeuvre and disturbance rejection both demand more.",
    reduce: "A larger motor, a larger propeller, or more rotors.",
  });

  /* 6. AIRFRAME-LEVEL FACTS, when an airframe has been built. */
  if (airframe?.isCoaxial) add({
    id: "coaxial-unmodelled", severity: "high",
    title: "This frame is coaxial and its thrust is not supported by the measured data",
    evidence: `${airframe.rotors.length} motors on ${airframe.arms} arms. The rotor block interpolates `
      + "UIUC measurements of an ISOLATED rotor.",
    consequence: "A coaxial pair is modelled here as two independent rotors. It is not — the lower "
      + "disc works in the upper's wake — and the measured database holds no correction.",
    reduce: "Use a frame with one motor per arm, or obtain coaxial measurements.",
  });

  if (acaiPerRotor && acaiPerRotor.length) {
    const survivable = acaiPerRotor.filter((p) => p.controllable).length;
    if (survivable < acaiPerRotor.length) add({
      id: "rotor-loss", severity: survivable === 0 ? "high" : "medium",
      title: survivable === 0
        ? "No single rotor loss is survivable on this frame"
        : `Only ${survivable} of ${acaiPerRotor.length} single rotor losses are survivable`,
      evidence: "ACAI controllability (Du, Quan, Yang & Cai), computed on this design's geometry, "
        + "thrust ceiling and weight."
        + (acaiPerRotor.length === 4
          ? " A quadrotor cannot be made single-failure controllable at ANY thrust margin: three "
            + "remaining inputs cannot span four axes."
          : ""),
      consequence: "After the failure no thrust set exists that holds hover and trims all three "
        + "moments. A simulated scenario may still fly, because it samples only the directions it "
        + "happens to demand.",
      reduce: acaiPerRotor.length === 4
        ? "More rotors. This is structural, not a margin problem."
        : "A different spin arrangement, or more thrust margin, or more rotors.",
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
