/* =====================================================================
   FLIGHT ENERGY — the flight runs the pack down, and says what it cannot
   =====================================================================
   The flight simulator can now integrate state of charge and END when
   the declared usable energy is gone, the way it already ends on ground
   contact. The claim that has to be defended is that this adds NO new
   physics: it walks the same thrust -> rpm -> motor -> ESC -> pack chain
   `sizing.js` walks for the hover point, and integrates it over time.

   TWO IDENTITIES CARRY THAT CLAIM, and both are exact rather than
   approximate, which is why they are worth having:

     1. THE CHAIN. Evaluated at `sizing.hover.thrustPerRotorN`, this
        module must reproduce `sizing.hover.busPowerW` to the bit -- same
        rpm, same shaft power, same per-rotor bus power, same pack total.
        If it ever does not, a second power model has grown here.

     2. THE INTEGRATOR. Over a window where the aircraft holds thrust
        steady, the accumulated energy must equal P*t to floating point.
        That is what makes the figure an integral of the sizing chain
        rather than a new estimate of endurance.

   WHAT THIS GATE DELIBERATELY DOES *NOT* ASSERT: that a simulated hover
   empties the pack at `enduranceMin()`. It does not, and it should not.
   `enduranceMin` is energy divided by a STEADY hover power; the
   simulation closes an attitude loop and an altitude loop and NO
   position loop, exactly as ArduPilot's Stabilize mode does. So a
   hovering aircraft drifts -- nothing arrests it -- and once it has
   drifted it leans, the per-rotor thrusts spread apart, and because
   power is convex in thrust a spread costs more than a uniform thrust of
   the same mean. Measured on the reference hexacopter: steady at 451.6 W
   and 7.8241 N per rotor for the first ~290 s, then rising to ~537 W
   with thrusts spread 6.3-11.0 N, emptying at 29.0 min against the
   idealised 31.5. That difference is the position loop's absence being
   paid for, and it is a result worth showing rather than an error to
   tune away. The gate pins the mechanism instead: it requires the
   drifted flight to cost MORE than the steady one, and never less.
   ===================================================================== */
import { buildModel, simulate } from "../src/classes/drone/dynamics.js";
import { buildEnergyModel, packPoint, rotorPoint, ASSUMES, SOC_MEANING }
  from "../src/classes/drone/flight-energy.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack, usableEnergyWh, enduranceMin } from "../src/classes/drone/battery.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE FLIGHT ENERGY GATE");
console.log("=".repeat(78));

const DD = { motorTimeConstantS: 0.05, bodyDragCoefficient: 1.0 };
const pack = assemblePack(BATTERIES.find((b) => b.id === "molicel-inr21700-p42a"),
  { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");
const frame = FRAMES.find((f) => f.frameClass === "HEXA" && f.frameType === "X");
const selection = {
  rotors: frame.motors.length, propeller: prop, propellerMassG: 45,
  motor: MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360"),
  esc: ESCS.find((e) => e.model.includes("ALPHA 60A")),
  battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
};
const declared = { structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
                   avionicsPowerW: 8, thrustToWeightRequired: 2.0 };
const sizing = sizeDrone({ mission: { payloadKg: 0.5, hoverEnduranceMin: 15 },
                           selection, declared });
const airframe = buildAirframe({ frame, propellerDiameterM: prop.diameterM,
                                 tipGapFraction: 0.10 });
const model = buildModel({ sizing, airframe, declared: DD });
const em = buildEnergyModel({ selection, declared, sizing });
const N = selection.rotors;
const hoverT = sizing.hover.thrustPerRotorN;

/* A held hover, as a raw target function: no position loop, which is the
   behaviour the notes above are about. */
const steady = { startAltitudeM: 4, initialAttitude: {},
                 target: () => ({ rollRad: 0, pitchRad: 0, yawRad: 0, altitudeM: 4 }) };

/* ── 1. IDENTITY: THE CHAIN IS THE SIZING CHAIN ────────────────────── */
console.log("-".repeat(78));
const rp = rotorPoint(em, hoverT);
check("one rotor at the hover thrust reproduces the sizing hover's rpm",
  rp.rpm === sizing.hover.rpm, `${rp.rpm} rpm, both`);
check("and its shaft power, to the bit",
  rp.shaftPowerW === sizing.hover.shaftPowerW, `${rp.shaftPowerW} W, both`);
check("and its per-rotor bus power, to the bit",
  rp.busPowerW === sizing.hover.esc.busPowerW, `${rp.busPowerW} W, both`);

const pp = packPoint(em, new Array(N).fill(hoverT));
check("the whole aircraft at hover reproduces sizing.hover.busPowerW EXACTLY",
  pp.packPowerW === sizing.hover.busPowerW,
  `${pp.packPowerW} W — N x bus + declared avionics, the sizing.js:222 convention`);
check("no rotor sample was out of range or clamped at the hover point",
  pp.subFloor === 0 && pp.refused === 0 && pp.infeasible === 0);

/* ── 2. IDENTITY: THE INTEGRATOR IS AN INTEGRAL ────────────────────── */
console.log("-".repeat(78));
const shortRun = simulate({ model, scenario: steady, declared: DD, durationS: 60, energy: em });
const tEnd = shortRun.trace[shortRun.trace.length - 1].t;
/* Steady to a relative 1e-9, not bit-exact: the first-order motor lag
   re-derives the thrust every step from an allocator output that agrees
   with the hover value only to the last bits, so exact equality is a
   stricter claim than the model makes. The P*t identity below is the one
   that has to be tight, and it is. */
let worst = 0;
for (const r of shortRun.trace)
  for (const x of r.thrusts) worst = Math.max(worst, Math.abs(x - hoverT) / hoverT);
check("the aircraft held the hover thrust steady for this window",
  worst < 1e-9, `${hoverT} N on every rotor, worst deviation ${worst.toExponential(2)} relative`);
const exactWh = sizing.hover.busPowerW * tEnd / 3600;
const relErr = Math.abs((shortRun.energy.energyWh - exactWh) / exactWh);
check("energy accumulated over a steady window equals P*t to floating point",
  relErr < 1e-11,
  `${shortRun.energy.energyWh.toFixed(9)} Wh vs ${exactWh.toFixed(9)} Wh, rel err ${relErr.toExponential(2)}`);

/* ── 3. OPT-OUT: WITHOUT AN ENERGY MODEL, NOTHING CHANGED ──────────── */
console.log("-".repeat(78));
const withOut = simulate({ model, scenario: steady, declared: DD, durationS: 60 });
check("a run with no energy model reports energy: null, not a zero",
  withOut.energy === null, "the loop did not compute it, so it does not claim it");
check("and no energy field appears anywhere in its trace",
  withOut.trace.every((r) => r.soc === undefined && r.packPowerW === undefined));
const strippedA = JSON.stringify(withOut);
const strippedB = JSON.stringify({ ...shortRun, energy: null,
  trace: shortRun.trace.map((r) => {
    const { soc, packPowerW, packCurrentA, energyWh, ...rest } = r; return rest;
  }) });
check("the TRAJECTORY is identical with and without the energy model",
  strippedA === strippedB,
  "integrating state of charge does not perturb the flight it measures");

/* ── 4. THE FLIGHT ENDS WHEN THE PACK DOES ─────────────────────────── */
console.log("-".repeat(78));
const usable = usableEnergyWh(pack,
  { usableFraction: declared.usableFraction, packs: sizing.massBreakdown.packs }).usableWh;
const long = simulate({ model, scenario: steady, declared: DD, durationS: 2400, energy: em });
check("a flight long enough to empty the pack ends on the pack, not the clock",
  long.energy.batteryEmpty === true && long.energy.emptyAtS < 2400,
  `empty at ${(long.energy.emptyAtS / 60).toFixed(2)} min, of a 40 min scenario`);
check("it stopped because the DECLARED usable energy was gone",
  long.energy.energyWh >= long.energy.usableWh
    && Math.abs(long.energy.usableWh - usable) < 1e-9,
  `${long.energy.energyWh.toFixed(2)} Wh of ${usable.toFixed(2)} Wh usable`);
check("state of charge reaches zero and never rises anywhere in the flight",
  long.trace[long.trace.length - 1].soc === 0
    && long.trace.every((r, i) => i === 0 || r.soc <= long.trace[i - 1].soc + 1e-15),
  "monotone non-increasing, by construction");
check("state of charge is a fraction of the DECLARED usable energy, not the pack",
  long.energy.socIsFractionOf === SOC_MEANING.isFractionOf
    && SOC_MEANING.isFractionOf === "declared usable energy"
    && SOC_MEANING.isCoulombCount === false,
  `at usableFraction ${declared.usableFraction} an empty flight leaves `
  + `${(100 * (1 - declared.usableFraction)).toFixed(0)} % of published energy unreachable`);

/* ── 5. THE MECHANISM THE IDEALISED FIGURE MISSES ──────────────────── */
console.log("-".repeat(78));
/* Not a tuned number — a direction. With no position loop the aircraft
   drifts, and a drifted hover costs more than a steady one. The gate
   requires the inequality and reports the size, so the size can move
   with the model without the claim becoming wrong. */
const ideal = enduranceMin({ usableWh: usable, powerW: sizing.hover.busPowerW }).minutes;
const simulated = long.energy.emptyAtS / 60;
check("a drifting hover costs MORE than the idealised steady hover, never less",
  long.energy.meanPackPowerW > sizing.hover.busPowerW && simulated < ideal,
  `${long.energy.meanPackPowerW.toFixed(1)} W mean vs ${sizing.hover.busPowerW.toFixed(1)} W steady; `
  + `${simulated.toFixed(2)} min vs ${ideal.toFixed(2)} min — no position loop, so nothing arrests the drift`);
check("the peak draw is recorded, and exceeds the steady hover",
  long.energy.peakPackPowerW > sizing.hover.busPowerW
    && long.energy.peakPackCurrentA > 0,
  `peak ${long.energy.peakPackPowerW.toFixed(0)} W, ${long.energy.peakPackCurrentA.toFixed(1)} A at the pack`);

/* ── 6. THE GAP IS BOUNDED, NOT INVENTED ───────────────────────────── */
console.log("-".repeat(78));
check("the measured thrust range comes from the propeller, not a literal",
  em.measuredThrustRangeN[0] > 0 && em.measuredThrustRangeN[1] > em.measuredThrustRangeN[0]
    && em.floorBusPowerW > 0,
  `${em.measuredThrustRangeN[0].toFixed(3)}..${em.measuredThrustRangeN[1].toFixed(3)} N, `
  + `floor costs ${em.floorBusPowerW.toFixed(2)} W at the bus`);
check("a thrust below the measured floor is refused, not extrapolated",
  rotorPoint(em, em.measuredThrustRangeN[0] * 0.5).computable === false);
check("a thrust above the measured ceiling is refused AND flagged as such",
  rotorPoint(em, em.measuredThrustRangeN[1] * 2).aboveCeiling === true,
  "it cannot be bounded from inside the data, so it invalidates the figure");

/* A hexacopter with one rotor dead: the allocator idles the rotor
   opposite the failure, which is where the sub-floor samples come from. */
const dead = simulate({ model, scenario: steady, declared: DD, durationS: 120,
                        failed: new Set([2]), energy: em });
check("with a rotor dead, sub-floor samples occur and are COUNTED",
  dead.energy.subFloorSamples > 0 && dead.energy.subFloorFraction > 0,
  `${dead.energy.subFloorSamples} of ${dead.energy.rotorSamples} rotor-samples `
  + `(${(100 * dead.energy.subFloorFraction).toFixed(1)} %) below ${em.measuredThrustRangeN[0].toFixed(3)} N`);
check("their energy is carried as an upper BOUND, never added to the figure",
  dead.energy.unaccountedMaxWh > 0
    && dead.energy.unaccountedMaxWh <= dead.energy.subFloorSamples * em.floorBusPowerW * 0.02 / 3600 + 1e-12,
  `true energy lies in [${dead.energy.energyWh.toFixed(3)}, `
  + `${(dead.energy.energyWh + dead.energy.unaccountedMaxWh).toFixed(3)}] Wh`);
check("and that bound is a small fraction of the figure, so the interval is tight",
  dead.energy.unaccountedMaxWh / dead.energy.energyWh < 0.01,
  `${(100 * dead.energy.unaccountedMaxWh / dead.energy.energyWh).toFixed(4)} % of the energy consumed`);
check("a run with no out-of-ceiling sample reports the figure as available",
  long.energy.available === true && long.energy.refusedSamples === 0);

/* ── 7. WHAT TRAVELS WITH THE NUMBER ───────────────────────────────── */
console.log("-".repeat(78));
check("every run carries the four assumptions the endurance figure carries",
  Array.isArray(long.energy.assumes) && long.energy.assumes.length === 4
    && long.energy.assumes === ASSUMES,
  "constant published voltage, fresh pack, room temperature, no Peukert");
check("the constant-voltage assumption is stated first and explains itself",
  /voltage/i.test(ASSUMES[0]) && /no pack in the survey publishes/i.test(ASSUMES[0]));
check("no Peukert derating is claimed, matching battery.js's refusal",
  ASSUMES.some((a) => /Peukert/.test(a) && /no surveyed pack publishes the curve/.test(a)));

/* usableFraction has no defensible default, and this layer must not
   invent one either -- battery.js throws, and that throw must surface. */
let threw = false;
try { buildEnergyModel({ selection, declared: { ...declared, usableFraction: undefined }, sizing }); }
catch { threw = true; }
check("an undeclared usableFraction is refused rather than defaulted",
  threw, "no manufacturer in the survey publishes a cut-off criterion");

let threwAvionics = false;
try { buildEnergyModel({ selection, declared: { ...declared, avionicsPowerW: undefined }, sizing }); }
catch { threwAvionics = true; }
check("an undeclared avionics draw is refused rather than defaulted",
  threwAvionics, "it is a DECLARED_INPUTS entry, not a property of the airframe");

/* ── 8. THE MODEL CROSSES THE WORKER BOUNDARY ──────────────────────── */
console.log("-".repeat(78));
let cloneErr = null;
try { structuredClone(em); } catch (e) { cloneErr = e.message; }
check("the energy model is structured-cloneable, because the flight runs in a worker",
  cloneErr === null, cloneErr ?? "propeller, motor constants, ESC entry and pack are all plain data");

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE FLIGHT ENERGY GATE PASSED (${pass} checks)`
                       : `DRONE FLIGHT ENERGY GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
