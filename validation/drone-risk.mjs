/* =====================================================================
   DRONE RISK GATE — an uncertainty statement that cannot quietly grow
   =====================================================================
   A risk page is the easiest place in a tool to say more than the
   evidence supports. An exceedance curve looks like a confidence
   interval on the whole answer; a register with severities looks like a
   scored assessment. Neither is true here, and this gate exists to keep
   both from drifting into being presented that way.

   WHAT IT ENFORCES

   1. THE CURVE IS ORDER STATISTICS OF REAL RESIDUALS. Every point is a
      count of held-out predictions, so it must be monotone, start at
      100 % and reach zero. Nothing is fitted, so no distribution
      parameter may appear anywhere in the result.

   2. THE CURVE NEVER SCORES A CLAMP. The rotor module refuses to
      extrapolate; scoring the refusal would flatter it. Only
      interpolated predictions enter the residual set, and the gate
      checks that the count matches what interpolation alone can produce.

   3. THE CURVE IS LABELLED ROTOR-ONLY. It is not a band on take-off mass
      or endurance, and the register's FIRST entry must say that no such
      band exists, because nothing above the rotor has ever been scored
      against a real drone.

   4. NO LIKELIHOOD IS SCORED. `severity` orders the list for reading.
      The gate checks that no entry carries a probability, a score, or a
      number that could be multiplied by a consequence — which is the
      shape of the five-by-five matrix NASA/SP-20240014019 p. 74 says can
      no longer be considered valid.

   5. THE REGISTER RESPONDS TO THE DESIGN. An entry that appears for
      every design is not a finding about the design. The gate builds
      several different aircraft and requires the register to differ.
   ===================================================================== */
import { exceedance, riskRegister, rotorResiduals } from "../src/classes/drone/risk.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { acai, torqueToThrustRatio } from "../src/engine/controlauthority.js";
import { PROPELLERS, findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { VEHICLE_BATTERIES } from "../src/data/drone-vehicles.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE RISK GATE");
console.log("=".repeat(78));

const cell = BATTERIES.find((b) => b.id === "molicel-inr21700-p42a");
const pack = assemblePack(cell, { series: 6, parallel: 3, overheadFraction: 0.15 });
const motor = MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360");
const esc = ESCS.find((e) => e.model.includes("ALPHA 60A"));

function designFor(propId, frameClass, frameType, overrides = {}) {
  const propeller = findPropeller(propId);
  const frame = FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType);
  const v = {
    structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
    avionicsPowerW: 8, thrustToWeightRequired: 2.0, ...overrides,
  };
  const built = { propeller, motor, esc, cell, pack: overrides.pack ?? pack };
  const selection = {
    rotors: frame.motors.length, propeller, propellerMassG: 45, motor, esc,
    battery: built.pack, packVoltageV: built.pack.voltagePrintedV,
    packCells: built.pack.cellsSeries,
  };
  const result = sizeDrone({
    mission: { payloadKg: 0.5, hoverEnduranceMin: 15 }, selection, declared: v,
  });
  const airframe = buildAirframe({
    frame, propellerDiameterM: propeller.diameterM, tipGapFraction: 0.10,
  });
  let acaiPerRotor = null;
  if (result.status?.startsWith("converged")) {
    const kMu = torqueToThrustRatio({
      thrustPerRotorN: result.hover.thrustPerRotorN, R_m: airframe.propRadiusM,
      tipSpeed_ms: (result.hover.rpm * 2 * Math.PI / 60) * airframe.propRadiusM,
      FM: result.hover.figureOfMerit, rho: result.rho,
    });
    const W = result.massKg * 9.80665, fMax = result.thrustToWeight.maxThrustPerRotorN;
    acaiPerRotor = airframe.rotors.map((r, i) => {
      const set = airframe.rotors.map((x, k) => ({
        r: Math.hypot(x.x, x.y), phi: Math.atan2(x.y, x.x),
        w: x.rotation === "CCW" ? 1 : -1, eta: k === i ? 0 : 1,
      }));
      const a = acai({ rotors: set, kMu, fMaxN: fMax, weightN: W });
      return { motor: r.motor, controllable: a?.controllable ?? null };
    });
  }
  return { design: { v, built, result, ok: result.status?.startsWith("converged") },
           airframe, acaiPerRotor };
}

const quad = designFor("apce_14x7_static_1006od", "QUAD", "X");

/* ── 1. THE RESIDUALS ARE REAL AND HELD OUT ────────────────────────── */
const loo = rotorResiduals();
check("the residual set is held-out predictions over the measured database",
  loo.n > 3000 && loo.propellers > 200,
  `${loo.n} leave-one-out points across ${loo.propellers} propellers`);

/* Interior points only: a propeller with k measured rows can yield at
   most k-2 interpolated held-out predictions. */
const maxPossible = PROPELLERS
  .filter((p) => p.static?.length >= 3)
  .reduce((s, p) => s + p.static.length - 2, 0);
check("only INTERPOLATED predictions are scored, never a clamped one",
  loo.n <= maxPossible,
  `${loo.n} scored against a ceiling of ${maxPossible} interior points — scoring the ` +
  `extrapolation the module refuses to perform would flatter it`);

const ex = exceedance(quad.design.built.propeller.id);
console.log("-".repeat(78));
console.log(`  stratum: ${ex.stratum}`);
console.log(`  n ${ex.n}, median ${ex.median.toFixed(3)} %, median |err| ${ex.medianAbs.toFixed(3)} %, ` +
            `p95 |err| ${ex.p95Abs.toFixed(2)} %, worst ${ex.worstAbs.toFixed(1)} %`);
console.log(`  ${"|err| >".padStart(10)}${"P".padStart(9)}`);
for (const x of [0.5, 1, 2, 3, 5]) {
  const row = ex.curve.reduce((a, b) => (Math.abs(b.errPct - x) < Math.abs(a.errPct - x) ? b : a));
  console.log(`  ${`${row.errPct.toFixed(2)} %`.padStart(10)}${`${row.exceed.toFixed(1)} %`.padStart(9)}`);
}

/* ── 2. THE CURVE IS AN ORDER STATISTIC, NOT A FIT ─────────────────── */
/* Not exactly 100 % at zero: a handful of held-out points are hit
   EXACTLY by the interpolation, and |0| > 0 is false for those. That is
   a real property of the data, not a rounding artefact, so the check
   admits it rather than being written to the number it wanted. */
const exactlyZero = rotorResiduals().all.filter((e) => e === 0).length;
check("the exceedance curve starts at essentially 100 % and falls to zero",
  ex.curve[0].exceed > 99 && ex.curve[ex.curve.length - 1].exceed === 0,
  `P(|err| > 0) = ${ex.curve[0].exceed.toFixed(4)} % — ${exactlyZero} of ${ex.n} held-out points ` +
  `are reproduced exactly, so they do not exceed zero. ` +
  `P(|err| > ${ex.curve[ex.curve.length - 1].errPct.toFixed(1)} %) = 0`);

check("the curve is monotone non-increasing, as a count of residuals must be",
  ex.curve.every((c, i) => i === 0 || c.exceed <= ex.curve[i - 1].exceed + 1e-12));

check("no distribution parameter appears anywhere in the result",
  !("sigma" in ex) && !("mu" in ex) && !("stdev" in ex) && !("dist" in ex) &&
  /Nothing is fitted/.test(ex.method),
  "the curve is counts of measured residuals — there is nothing to fit and nothing is fitted");

check("the curve is labelled as describing the ROTOR layer only",
  /ROTOR layer only/.test(ex.appliesTo) && /NOT a confidence interval/.test(ex.appliesTo));

/* ── 3. THE STRATUM IS CHOSEN HONESTLY ─────────────────────────────── */
const thin = [...loo.byProp.entries()].find(([, a]) => a.length < 20);
const fat = [...loo.byProp.entries()].find(([, a]) => a.length >= 20);
check("a propeller with too few held-out points falls back to the whole database",
  exceedance(thin[0]).usedOwnStratum === false &&
  exceedance(thin[0]).n === loo.n,
  `${thin[0]} has ${thin[1].length} points; a 95th percentile over that is an order ` +
  `statistic, not a percentile`);

check("a propeller with enough points is scored on its own",
  fat ? exceedance(fat[0]).usedOwnStratum === true : true,
  fat ? `${fat[0]} has ${fat[1].length} points` : "no propeller reaches the threshold");

check("the database-wide distribution is always reported alongside",
  ex.databaseWide && ex.databaseWide.n === loo.n,
  `so a propeller worse than the database is visible: database median |err| ` +
  `${ex.databaseWide.medianAbs.toFixed(3)} %, p95 ${ex.databaseWide.p95Abs.toFixed(2)} %`);

/* ── 4. THE REGISTER SAYS WHAT IS MISSING, FIRST ───────────────────── */
console.log("-".repeat(78));
const reg = riskRegister(quad);
for (const r of reg) console.log(`  ${r.severity.toUpperCase().padEnd(7)} ${r.title}`);

check("the register leads with the absence of any whole-vehicle validation",
  reg[0].id === "no-vehicle-validation" && reg[0].severity === "high",
  "otherwise the exceedance curve would be left to imply a band that does not exist");

check("that entry names why no validation is possible",
  /GAMMA/.test(reg[0].evidence) && /Alta X/.test(reg[0].evidence) &&
  /rotor count/.test(reg[0].evidence));

check("every entry carries evidence and a consequence",
  reg.every((r) => r.evidence && r.consequence && r.title && r.id && r.reduce),
  `${reg.length} entries`);

/* ── 5. NOTHING IS SCORED ──────────────────────────────────────────── */
check("no entry carries a likelihood, probability or score",
  reg.every((r) => !("likelihood" in r) && !("probability" in r) &&
                   !("score" in r) && !("rating" in r) && !("p" in r)),
  "NASA publishes no five-by-five matrix, and NASA/SP-20240014019 p. 74 states the " +
  "qualitative form can no longer be considered valid");

check("severity is one of three words, used only for ordering",
  reg.every((r) => ["high", "medium", "low"].includes(r.severity)) &&
  reg.every((r, i) => i === 0 || ({ high: 0, medium: 1, low: 2 })[r.severity] >=
                                 ({ high: 0, medium: 1, low: 2 })[reg[i - 1].severity]),
  "ordered high to low, and never multiplied by anything");

/* ── 6. THE REGISTER IS ABOUT THIS DESIGN ──────────────────────────── */
console.log("-".repeat(78));
const octaquad = designFor("apce_14x7_static_1006od", "OCTAQUAD", "X");
const octa = designFor("apce_14x7_static_1006od", "OCTA", "PLUS");
const regOQ = riskRegister(octaquad);
const regO = riskRegister(octa);

check("a coaxial frame raises the coaxial finding, and a planar one does not",
  regOQ.some((r) => r.id === "coaxial-unmodelled") &&
  !regO.some((r) => r.id === "coaxial-unmodelled"),
  "OCTAQUAD stacks two motors per arm; OCTA does not");

check("the quadrotor raises the rotor-loss finding with its structural reason",
  (() => {
    const e = reg.find((r) => r.id === "rotor-loss");
    return e && e.severity === "high" && /cannot span four axes/.test(e.evidence);
  })(),
  "no single rotor loss is survivable at any thrust margin");

check("the octorotor does NOT raise it",
  !regO.some((r) => r.id === "rotor-loss"),
  "ACAI finds every single failure survivable on this frame");

/* A pack whose voltage field is sound must not raise the pack finding;
   one whose field is a charge limit must.

   The real offender, DJI's TB60, is 12S against this motor's published
   8S maximum, so that design does not converge and the register stops at
   its first entry. Rather than weaken the test, the same DEFECT is
   reproduced on a pack the motor can actually run: the assembled Molicel
   pack with its nominal replaced by the charged 4.20 V/cell, which is
   exactly the error the TB60 makes. */
/* The clean baseline must be a cell that IS consistent. The studio's
   default Molicel P42A is not: it publishes "4200 mAh / 15.5 Wh", which
   needs 3.69 V against its 3.60 V label, so it trips at -2.45 %. Two of
   its siblings are exact. */
const cleanCell = BATTERIES.find((b) => b.id === "molicel-inr21700-p45b");
const cleanPack = assemblePack(cleanCell, { series: 6, parallel: 3, overheadFraction: 0.15 });
const cleanDesign = designFor("apce_14x7_static_1006od", "QUAD", "X", { pack: cleanPack });
const chargedLabel = { ...cleanPack, voltagePrintedV: cleanPack.cellsSeries * 4.20 };
const badPack = designFor("apce_14x7_static_1006od", "QUAD", "X", { pack: chargedLabel });

check("a consistent pack raises no voltage-field finding",
  !riskRegister(cleanDesign).some((r) => r.id === "pack-voltage-field"),
  `${cleanCell.model} reproduces its published Wh exactly`);

check("a charge limit in the nominal field is raised as HIGH",
  (() => {
    const e = riskRegister(badPack).find((r) => r.id === "pack-voltage-field");
    return e && e.severity === "high" && /CHARGE LIMIT/.test(e.title);
  })(),
  "4.20 V/cell in the nominal's place — the defect DJI's TB60 makes, at +14.4 %");

check("a merely coarse nominal is raised as MEDIUM, not HIGH",
  (() => {
    const e = reg.find((r) => r.id === "pack-voltage-field");
    return e && e.severity === "medium" && /coarser/.test(e.title) && /No action/.test(e.reduce);
  })(),
  "the default Molicel P42A is -2.45 % out because its label is coarser than its energy " +
  "figure implies; that is worth reporting but changes no answer");

const ids = new Set([...reg, ...regOQ, ...regO].map((r) => r.id));
check("the register differs across designs rather than being a fixed list",
  ids.size > reg.length,
  `${ids.size} distinct findings across three designs, against ${reg.length} on any one — ` +
  `an entry that appears for every design is not a finding about the design`);

/* ── 7. CONSEQUENCES ARE QUANTIFIED WHERE THE RECORD ALLOWS ────────── */
const struct = reg.find((r) => r.id === "structure-declared");
check("the structure-mass finding quantifies its own consequence",
  struct && /kg/.test(struct.consequence) && /%/.test(struct.evidence),
  struct.consequence.slice(0, 96));

const usable = reg.find((r) => r.id === "usable-fraction-declared");
check("the usable-fraction finding quantifies endurance at both cited values",
  usable && /min/.test(usable.consequence) && /0\.80/.test(usable.consequence),
  usable.consequence.slice(0, 96));

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE RISK GATE PASSED (${pass} checks)`
                       : `DRONE RISK GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
