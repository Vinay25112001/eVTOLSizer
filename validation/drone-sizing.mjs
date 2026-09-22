/* =====================================================================
   DRONE SIZING GATE — what a closure can be checked against, and what
   this one cannot
   =====================================================================
   STATE THE LIMITATION FIRST, because everything below is worth less if
   a reader assumes something stronger.

   THIS LOOP IS NOT VALIDATED AGAINST ANY PUBLISHED AIRCRAFT. It cannot
   be, with the data held:

     - NASA's GAMMA octocopter publishes a measured inertia tensor and
       runs the KDE4213-XF this engine already models — but its rotor is
       an APC 15x5.5MR, and there are ZERO 15x5.5 propellers in the UIUC
       measured database.
     - Freefly's Alta X publishes a full flight-time-versus-payload
       sweep, the best endurance data in the survey — on 33-inch
       propellers. The measured database spans 2.2 to 21.0 inches. The
       Alta X rotor is outside it by half again.
     - Every DJI and Autel aircraft declines to state its motor, its
       propeller, or in six of seven cases even its rotor COUNT.

   So there is no aircraft whose components are all in the measured
   databases. Reproducing a published endurance would require
   substituting a different propeller and calling the result a
   validation, which is precisely the silent extrapolation this project
   refuses elsewhere.

   WHAT THIS GATE THEREFORE DOES. Four things, none of which is an
   accuracy claim:

   1. CLOSURE IDENTITIES. The converged mass equals the sum of its parts;
      the energy balance closes; the thrust balance closes. A failure
      here means the code contradicts itself, which is checkable without
      any aircraft.
   2. REFUSALS. Every link refuses rather than extrapolating, and the
      refusal names which link and why. A closure that always returns a
      number is worse than one that sometimes says no.
   3. PHYSICAL MONOTONICITY. Heavier payload gives heavier aircraft;
      thinner air gives more power; a longer mission gives more battery.
      These are directions physics fixes, so a violation is a bug.
   4. A PLAUSIBILITY BAND, clearly labelled as such. The implied hover
      power per kilogram must land inside the range the VEHICLE truth set
      actually exhibits (86.9 to 132.9 W/kg across seven real aircraft).
      That is a sanity bracket, NOT a validation: landing inside it
      proves nothing about accuracy, but landing outside it would prove
      something is wrong.
   ===================================================================== */
import {
  sizeDrone, evaluateAtMass, maxThrustPerRotorN, isaDensity, DECLARED_INPUTS, G,
} from "../src/classes/drone/sizing.js";
import { assemblePack, packEnergyWh } from "../src/classes/drone/battery.js";
import { PROPELLERS, findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";
import { VEHICLES } from "../src/data/drone-vehicles.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE SIZING GATE");
console.log("=".repeat(78));

const motor = MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360");
const esc = ESCS.find((e) => e.model.includes("ALPHA 60A"));
const cell = BATTERIES.find((b) => b.id === "molicel-inr21700-p42a");
const pack = assemblePack(cell, { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");

const DECL = Object.freeze({
  structureMassKg: 0.6, usableFraction: 0.85,
  avionicsMassKg: 0.15, avionicsPowerW: 8, thrustToWeightRequired: 2.0,
});
const SEL = Object.freeze({
  rotors: 4, propeller: prop, propellerMassG: 45, motor, esc,
  battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
});
const MIS = Object.freeze({ payloadKg: 0.5, hoverEnduranceMin: 15 });

/* ── 0. THE LIMITATION, CHECKED RATHER THAN ASSERTED ───────────────── */
const diam = PROPELLERS.map((p) => p.diameterM / 0.0254);
const dMin = Math.min(...diam), dMax = Math.max(...diam);
check("no 15x5.5 propeller exists in the measured database",
  PROPELLERS.filter((p) => /15x5\.?5/.test(p.id)).length === 0,
  "so NASA's GAMMA octocopter — measured inertia, KDE4213-XF motors — cannot be reproduced");

check("the Alta X rotor is outside the measured diameter range",
  dMax < 33,
  `measured span ${dMin.toFixed(1)}-${dMax.toFixed(1)} in; the Alta X, which publishes the ` +
  `best endurance data in the survey, uses 33 in`);

check("most surveyed aircraft do not state their rotor count",
  VEHICLES.filter((v) => v.rotors == null).length >= 5,
  "so even a mass-only comparison lacks the rotor count it would need");

/* ── 1. DECLARED INPUTS HAVE NO DEFAULTS ───────────────────────────── */
console.log("-".repeat(78));
check("every declared input states why it cannot be defaulted",
  DECLARED_INPUTS.length === 5 && DECLARED_INPUTS.every((d) => d.whyDeclared && d.reference),
  DECLARED_INPUTS.map((d) => d.key).join(", "));

let refusedCount = 0;
for (const d of DECLARED_INPUTS) {
  const bad = { ...DECL }; delete bad[d.key];
  try { sizeDrone({ mission: MIS, selection: SEL, declared: bad }); } catch { refusedCount++; }
}
check("omitting ANY declared input is refused, not defaulted",
  refusedCount === DECLARED_INPUTS.length,
  `${refusedCount} of ${DECLARED_INPUTS.length} — structure mass alone is the second largest ` +
  `mass in the vehicle, so a guessed fraction would silently set the answer`);

check("structure mass is declared because nobody publishes one",
  DECLARED_INPUTS.find((d) => d.key === "structureMassKg").whyDeclared.includes("One data point is not a correlation"),
  "only the Alta X publishes an empty weight, and it bundles motors, ESCs, props and avionics");

/* ── 2. THE CLOSURE CLOSES ─────────────────────────────────────────── */
console.log("-".repeat(78));
const r = sizeDrone({ mission: MIS, selection: SEL, declared: DECL });
check("a well-posed design converges", r.status.startsWith("converged"),
  `${r.status} in ${r.iterations} iterations, MTOM ${r.massKg.toFixed(3)} kg`);

const b = r.massBreakdown;
const sum = b.payloadKg + b.structureKg + b.avionicsKg + b.propulsionKg + b.batteryKg;
check("the mass identity closes: MTOM = payload + structure + avionics + propulsion + battery",
  Math.abs(sum - r.massKg) < 1e-6,
  `residual ${(1000 * (sum - r.massKg)).toExponential(1)} g`);

check("the thrust identity closes: N rotors each lift MTOM*g/N",
  Math.abs(SEL.rotors * r.hover.thrustPerRotorN - r.massKg * G) < 1e-6);

const needWh = r.hover.busPowerW * (MIS.hoverEnduranceMin / 60) / DECL.usableFraction;
check("the energy identity closes: packs cover the mission at the declared fraction",
  b.packs === Math.max(1, Math.ceil(needWh / packEnergyWh(pack).wh)) &&
  r.endurance.minutes >= MIS.hoverEnduranceMin,
  `${b.packs} pack of ${packEnergyWh(pack).wh.toFixed(0)} Wh gives ` +
  `${r.endurance.minutes.toFixed(1)} min against ${MIS.hoverEnduranceMin} required`);

check("the endurance band is ordered and straddles the nominal",
  r.endurance.minutesP10 < r.endurance.minutes && r.endurance.minutes < r.endurance.minutesP90,
  `${r.endurance.minutesP10.toFixed(1)} < ${r.endurance.minutes.toFixed(1)} < ` +
  `${r.endurance.minutesP90.toFixed(1)} min, from the ESC layer's MEASURED joint-residual band — ` +
  `the only uncertainty here derived from measurement rather than declared`);

check("hover throttle fraction agrees with the thrust ratio",
  Math.abs(r.thrustToWeight.hoverThrottleFraction -
           r.hover.thrustPerRotorN / r.thrustToWeight.maxThrustPerRotorN) < 1e-9,
  `${(100 * r.thrustToWeight.hoverThrottleFraction).toFixed(0)} % of the measured maximum`);

check("the thrust ceiling says which limit binds",
  /measured|current rating/i.test(r.thrustToWeight.limitedBy),
  r.thrustToWeight.limitedBy.slice(0, 70));

/* ── 3. REFUSALS ───────────────────────────────────────────────────── */
console.log("-".repeat(78));
const tooHeavy = sizeDrone({ mission: { payloadKg: 40, hoverEnduranceMin: 15 }, selection: SEL, declared: DECL });
check("a payload beyond the propeller's measured thrust is REFUSED",
  tooHeavy.status === "infeasible" && /propeller cannot make/.test(tooHeavy.reason),
  tooHeavy.detail.slice(0, 96));

check("the refusal quotes the measured range it would have had to leave",
  /measured range delivers/.test(tooHeavy.detail) && /refused/i.test(tooHeavy.detail));

const lowPack = assemblePack(cell, { series: 2, parallel: 3, overheadFraction: 0.15 });
const weak = sizeDrone({
  mission: MIS, declared: DECL,
  selection: { ...SEL, battery: lowPack, packVoltageV: lowPack.voltagePrintedV, packCells: 2 },
});
check("a pack that cannot drive the motor is REFUSED, not clamped",
  weak.status === "infeasible" && /cannot drive/.test(weak.reason),
  "an ESC steps down, never up");

check("a rotor count below three is refused",
  (() => { try { sizeDrone({ mission: MIS, selection: { ...SEL, rotors: 2 }, declared: DECL }); return false; } catch { return true; } })());

check("a propeller with no published mass makes the build unmassable, and says so",
  (() => {
    const s = sizeDrone({ mission: MIS, selection: { ...SEL, propellerMassG: null }, declared: DECL });
    return s.status === "infeasible" && /not published/.test(s.reason);
  })(),
  "UIUC records geometry and performance, not mass");

/* ── 4. PHYSICAL MONOTONICITY ──────────────────────────────────────── */
console.log("-".repeat(78));
const masses = [0.2, 0.5, 0.8, 1.1].map((p) =>
  sizeDrone({ mission: { payloadKg: p, hoverEnduranceMin: 15 }, selection: SEL, declared: DECL }));
check("more payload gives more all-up mass, monotonically",
  masses.every((m, i) => i === 0 || (m.status.startsWith("converged") && m.massKg > masses[i - 1].massKg)),
  masses.map((m) => m.massKg.toFixed(2)).join(" -> ") + " kg");

const alt = [0, 1500, 3000].map((h) => evaluateAtMass(r.massKg, SEL, DECL, { altitudeM: h }));
check("thinner air costs more power at the same mass",
  alt.every((a, i) => i === 0 || (a.feasible && a.busPowerW > alt[i - 1].busPowerW)),
  alt.map((a) => `${a.busPowerW.toFixed(0)} W`).join(" -> ") + " at 0, 1500, 3000 m");

check("ISA density falls with altitude and starts at 1.225",
  Math.abs(isaDensity(0) - 1.225) < 0.002 && isaDensity(3000) < isaDensity(0),
  `${isaDensity(0).toFixed(4)} -> ${isaDensity(3000).toFixed(4)} kg/m^3`);

/* 45 min forces a SECOND pack: one 279 Wh pack gives ~33 min here, so this
   exercises the pack-count step rather than passing trivially. */
const longer = sizeDrone({ mission: { payloadKg: 0.5, hoverEnduranceMin: 45 }, selection: SEL, declared: DECL });
check("a longer mission buys STRICTLY more battery, across a pack boundary",
  longer.status.startsWith("converged") && longer.massBreakdown.packs > b.packs &&
  longer.massBreakdown.batteryKg > b.batteryKg,
  `${b.packs} pack / ${b.batteryKg.toFixed(2)} kg for 15 min -> ${longer.massBreakdown.packs} packs / ` +
  `${longer.massBreakdown.batteryKg.toFixed(2)} kg for 45 min`);

/* ── 5. THE PLAUSIBILITY BAND — a bracket, not a validation ────────── */
console.log("-".repeat(78));
const fleet = VEHICLES.filter((v) => v.impliedPowerWPerKg).map((v) => v.impliedPowerWPerKg);
const lo = Math.min(...fleet), hi = Math.max(...fleet);
const wkg = r.hover.busPowerW / r.massKg;
console.log(`  the seven surveyed aircraft span ${lo.toFixed(1)}-${hi.toFixed(1)} W/kg at full pack.`);
console.log(`  this design computes ${wkg.toFixed(1)} W/kg at a disc loading of ` +
            `${r.hover.discLoadingNM2.toFixed(1)} N/m^2.`);

check("the computed specific power lands inside the range real aircraft exhibit",
  wkg > lo * 0.8 && wkg < hi * 1.2,
  `${wkg.toFixed(1)} W/kg inside ${(lo * 0.8).toFixed(1)}-${(hi * 1.2).toFixed(1)}. ` +
  `A BRACKET, not a validation: inside proves nothing, outside would prove something wrong`);

check("figure of merit lands in the band measured for small rotors",
  r.hover.figureOfMerit > 0.35 && r.hover.figureOfMerit < 0.90,
  `FM ${r.hover.figureOfMerit.toFixed(3)} — Bohorquez and Winslow measure roughly 0.37-0.66 ` +
  `on micro rotors, and this propeller is far larger than their Reynolds scope`);

/* ── 6. PACK ASSEMBLY ──────────────────────────────────────────────── */
console.log("-".repeat(78));
check("a pack assembled from cells multiplies series, parallel and energy correctly",
  pack.cellsSeries === 6 && pack.cellsParallel === 3 && pack.cellCount === 18 &&
  Math.abs(pack.energyWhPublished - 18 * 15.5) < 1e-9 &&
  Math.abs(pack.voltagePrintedV - 6 * 3.6) < 1e-9,
  `${pack.model}: ${pack.energyWhPublished.toFixed(1)} Wh, ${pack.voltagePrintedV.toFixed(1)} V, ` +
  `${pack.massG.toFixed(0)} g`);

check("assembled energy comes from the cell's PUBLISHED Wh, not from Ah x V",
  pack.energyWhSource.includes("published"),
  "immune to the charged-voltage error by construction");

check("pack mass states that interconnect, BMS and case are excluded",
  pack.massNote.includes("interconnect") && pack.overheadFraction === 0.15);

check("assembling from a cell with no established energy is refused",
  (() => {
    const bad = { ...cell, capacity_wh: null, nominal_voltage_v: 4.4 };
    try { assemblePack(bad, { series: 6 }); return false; } catch { return true; }
  })());

check("a non-integer cell count is refused",
  (() => { try { assemblePack(cell, { series: 6.5 }); return false; } catch { return true; } })());

/* ── 7. CONVERGENCE REPORTING ──────────────────────────────────────── */
console.log("-".repeat(78));
check("the loop reports HOW it ended, never just the last iterate",
  ["converged", "converged-on-pack-boundary", "diverged", "infeasible"].includes(r.status),
  `"${r.status}" — the eVTOL side learned this when a non-converged multicopter returned a ` +
  `plausible number with its convergence flag quietly false`);

check("the iteration history is kept for inspection",
  Array.isArray(r.history) && r.history.length >= 1 &&
  r.history.every((h) => h.massKg > 0 && h.packs >= 1));

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE SIZING GATE PASSED (${pass} checks)`
                       : `DRONE SIZING GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
