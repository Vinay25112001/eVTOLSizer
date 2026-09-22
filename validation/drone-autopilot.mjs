/* =====================================================================
   DRONE AUTOPILOT GATE — what a sizing run may tell a flight controller
   =====================================================================
   A parameter file is the only artefact this tool produces that an
   aircraft then flies on. Every other output is read by a person who can
   disagree with it. So this gate is not about arithmetic; it is about
   what the exporter DECLINES to say, and whether the files it writes are
   the formats they claim to be.

   THE CENTRAL CHECK IS A REFUSAL. This run computes a hover thrust
   fraction, and ArduPilot has a parameter called MOT_THST_HOVER. The
   names line up, the quantities look identical, and writing one into the
   other is wrong: ArduPilot's own setup page says "MOT_THST_HOVER: 0.25
   or below the expected actual hover thrust percentage (lower is safe)"
   and has MOT_HOVER_LEARN find the real value in flight. PX4's
   MPC_THR_HOVER is the same physical quantity with the OPPOSITE official
   advice — it wants the real number, because it seeds an estimator and
   the land detector. The gate requires the exporter to get this
   asymmetry right in both directions, since a tool that treated the two
   parameters as synonyms would pass every arithmetic test.

   THRUST FRACTION IS NOT SIGNAL FRACTION. PX4 publishes
   rel_thrust = factor * rel_signal^2 + (1 - factor) * rel_signal, so the
   computed thrust fraction equals the control signal only when factor is
   0. The gate checks that MPC_THR_HOVER is emitted together with a
   THR_MDL_FAC refusal, because the number is only correct while that
   default holds.

   REPRODUCING A SHIPPED FILE. ArduPilot ships Hexsoon-edu450.param, a
   real 3S 450-class quad. The gate re-derives its frame codes and its
   pack endpoints from this exporter's own rules and requires them to
   match the published file exactly. That is an external check against
   someone else's artefact, not a self-consistency check.
   ===================================================================== */
import {
  FRAME_CLASS, FRAME_TYPE, PX4_AIRFRAME, MAV_CMD, MAV_TYPE_BY_ROTORS,
  MAV_FRAME_GLOBAL_RELATIVE_ALT, MAV_PARAM_TYPE, MAV_AUTOPILOT,
  exportContext, arduPilotParameters, px4Parameters,
  formatArduPilotParam, formatQgcParams, formatWaypoints, formatPlan,
  hoverTestMission, packEndpoints, fromKnots, formatValue, toInches, isLipo,
} from "../src/classes/drone/autopilot.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";
import { findPropeller, PROPELLERS } from "../src/data/drone-propellers.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE AUTOPILOT GATE");
console.log("=".repeat(78));

/* ── a real converged design, built the way the studio builds one ───── */
function build({ propellerId = "apce_14x7_static_1006od", cellId = "molicel-inr21700-p42a",
                 series = 6, parallel = 3, frameClass = "QUAD", frameType = "X", rotors = 4 } = {}) {
  const propeller = findPropeller(propellerId);
  const motor = MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360");
  const esc = ESCS.find((e) => e.continuous_current_a >= 40);
  const cell = BATTERIES.find((b) => b.id === cellId);
  const pack = assemblePack(cell, { series, parallel, overheadFraction: 0.15 });
  const selection = {
    rotors, propeller, propellerMassG: 45, motor, esc, battery: pack,
    packVoltageV: pack.voltagePrintedV, packCells: pack.cellsSeries,
  };
  const result = sizeDrone({
    mission: { payloadKg: 0.5, hoverEnduranceMin: 15 },
    selection,
    declared: {
      structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
      avionicsPowerW: 8, thrustToWeightRequired: 2.0,
    },
    options: { altitudeM: 0 },
  });
  const frame = FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType);
  return { ctx: exportContext({ frame, selection, result, cell }), cell, result, frame };
}

const { ctx, cell, result } = build();
const ap = arduPilotParameters(ctx);
const px = px4Parameters(ctx);
const apText = formatArduPilotParam(ctx, ap);
const pxText = formatQgcParams(ctx, px);

const names = (b) => b.params.map((p) => p.name);
const valueOf = (b, n) => b.params.find((p) => p.name === n)?.value;
const refused = (b, re) => b.refusals.some((r) => re.test(r.name));

console.log(`\n  design: ${ctx.frame.frameClass}/${ctx.frame.frameType}, ${ctx.rotors} rotors, `
  + `${ctx.propDiameterIn.toFixed(1)} in props, ${ctx.massKg.toFixed(2)} kg, `
  + `hover ${(100 * ctx.hoverThrustFraction).toFixed(0)} % of max thrust, `
  + `${ctx.enduranceMin.toFixed(1)} min\n`);

/* ── the refusals ───────────────────────────────────────────────────── */
console.log("  THE REFUSALS");

check("MOT_THST_HOVER is NOT emitted, and the refusal names the guidance",
  !names(ap).includes("MOT_THST_HOVER") && refused(ap, /^MOT_THST_HOVER$/)
  && /0\.25 or below/.test(ap.refusals.find((r) => r.name === "MOT_THST_HOVER").why),
  `a computed ${(100 * ctx.hoverThrustFraction).toFixed(0)} % would overwrite the margin the documentation asks for`);

check("MOT_HOVER_LEARN is emitted instead, set to learn and save",
  valueOf(ap, "MOT_HOVER_LEARN") === 2);

check("the computed hover figure still reaches the user, as a comment",
  new RegExp(`computed hover thrust fraction ${(100 * ctx.hoverThrustFraction).toFixed(0)} %`).test(apText)
  && !/^MOT_THST_HOVER,/m.test(apText),
  "it informs without commanding");

check("PX4 takes the opposite decision on the same quantity",
  names(px).includes("MPC_THR_HOVER")
  && Math.abs(valueOf(px, "MPC_THR_HOVER") - Math.round(ctx.hoverThrustFraction * 100) / 100) < 1e-9,
  "MPC_THR_HOVER seeds an estimator and the land detector, so PX4 wants the real number");

check("THR_MDL_FAC is refused, because the equivalence is read from source",
  !names(px).includes("THR_MDL_FAC") && refused(px, /^THR_MDL_FAC$/),
  "and leaving it at 0 is what keeps MPC_THR_HOVER a valid control-signal fraction");

check("the thrust-fraction / signal-fraction distinction is stated in the file",
  /rel_thrust = factor \* rel_signal\^2/.test(pxText) && /THR_MDL_FAC/.test(pxText));

check("no power-module calibration is emitted by either exporter",
  !names(ap).some((n) => /^BATT_(AMP_PERVLT|VOLT_MULT|VOLT_PIN|CURR_PIN|AMP_OFFSET)$/.test(n))
  && !names(px).some((n) => /^BAT1_(V_DIV|A_PER_V)$/.test(n))
  && refused(ap, /BATT_AMP_PERVLT/) && refused(px, /BAT1_V_DIV/),
  "they depend on the hardware someone soldered in, not on the airframe");

check("no rate-loop gain is emitted",
  !names(ap).some((n) => /^ATC_RAT_(RLL|PIT|YAW)_[PID]$/.test(n)) && refused(ap, /ATC_RAT_RLL_P/),
  "the shipped frame files carry measured tuning results, not geometry");

check("PX4's state-of-charge failsafes are refused, not converted",
  !names(px).some((n) => /^BAT_(LOW|CRIT|EMERGEN)_THR$/.test(n)) && refused(px, /BAT_LOW_THR/),
  "they are fractions of remaining SoC, not volts or mAh");

check("ArduPilot's missing mass parameter is reported as a gap",
  refused(ap, /vehicle mass/) && names(px).includes("WEIGHT_BASE") && names(px).includes("WEIGHT_GROSS"),
  `${ctx.massKg.toFixed(2)} kg has nowhere to go in ArduPilot; PX4 takes it directly in kg`);

/* ── reproducing ArduPilot's own shipped file ───────────────────────── */
/* Tools/Frame_params/Hexsoon-edu450.param, quoted in the research note;
   the local copy's md5 is 0a1e07214c11c5d8f6738fb0a39a3c45. It is a 3S
   LiPo 450-class quad and publishes FRAME_CLASS,1 / FRAME_TYPE,1 /
   MOT_BAT_VOLT_MAX,12.6 / MOT_BAT_VOLT_MIN,9.9. */
console.log("\n  REPRODUCING ArduPilot's SHIPPED Hexsoon-edu450.param");

const EDU450 = Object.freeze({ FRAME_CLASS: 1, FRAME_TYPE: 1, MOT_BAT_VOLT_MAX: 12.6, MOT_BAT_VOLT_MIN: 9.9, cells: 3 });

check("QUAD/X maps to the frame codes the shipped file publishes",
  FRAME_CLASS.QUAD === EDU450.FRAME_CLASS && FRAME_TYPE.X === EDU450.FRAME_TYPE
  && valueOf(ap, "FRAME_CLASS") === EDU450.FRAME_CLASS && valueOf(ap, "FRAME_TYPE") === EDU450.FRAME_TYPE,
  `FRAME_CLASS,${EDU450.FRAME_CLASS} FRAME_TYPE,${EDU450.FRAME_TYPE}`);

const syntheticLipo = { chemistry: "LiPo (lithium polymer)" };
const eduEnds = packEndpoints(syntheticLipo, EDU450.cells);
check("the LiPo rule reproduces the shipped file's pack endpoints at 3S",
  eduEnds.ok && eduEnds.vMax === EDU450.MOT_BAT_VOLT_MAX && eduEnds.vMin === EDU450.MOT_BAT_VOLT_MIN,
  `4.2x3 = ${EDU450.MOT_BAT_VOLT_MAX} V and 3.3x3 = ${EDU450.MOT_BAT_VOLT_MIN} V, as published`);

/* ── the chemistry trap ─────────────────────────────────────────────── */
console.log("\n  CHEMISTRY");

check("the studio's default cell is not the chemistry the guidance describes",
  !isLipo(cell) && /li-ion/i.test(cell.chemistry),
  `${cell.model} is ${cell.chemistry}`);

const ends = packEndpoints(cell, ctx.series);
check("pack endpoints come from the cell's datasheet, not the LiPo rule",
  ends.vMax === Math.round(cell.max_charge_voltage_v * ctx.series * 100) / 100
  && ends.vMin === Math.round(cell.min_discharge_voltage_v * ctx.series * 100) / 100
  && ends.vMin !== Math.round(3.3 * ctx.series * 100) / 100,
  `${ends.vMin} V from ${cell.min_discharge_voltage_v} V/cell, not ${(3.3 * ctx.series).toFixed(1)} V from the LiPo rule`);

check("the departure from the published guidance is stated, not silent",
  ends.notes.length > 0 && /not LiPo/.test(ends.notes[0]) && new RegExp(`${(3.3 * ctx.series).toFixed(1)}`).test(ends.notes[0])
  && /not LiPo/.test(apText));

check("PX4's 3.5 V dropoff advice is flagged as not applying to this cell",
  px.notes.some((n) => /steep dropoff at 3\.5V/.test(n) && /no 3\.5 V shoulder/.test(n)));

check("the cell's empty voltage and the sized depth of discharge are not conflated",
  px.notes.some((n) => /CELL'S floor/.test(n) && /declared usable fraction/.test(n))
  && valueOf(px, "BAT1_V_EMPTY") === cell.min_discharge_voltage_v
  && ctx.usableFraction < 1,
  `BAT1_V_EMPTY is ${cell.min_discharge_voltage_v} V/cell while the `
  + `${ctx.enduranceMin.toFixed(1)} min endurance assumed only ${(100 * ctx.usableFraction).toFixed(0)} % of `
  + `the pack — PX4 will fly deeper than the endurance figure assumes`);

check("a non-LiPo cell with no published endpoints is refused, not defaulted",
  (() => {
    const r = packEndpoints({ chemistry: "Li-ion NMC (cylindrical 21700)" }, 6);
    return r.ok === false && /not LiPo/.test(r.reason);
  })());

/* ── interpolation, never extrapolation ─────────────────────────────── */
console.log("\n  THE PUBLISHED PROPELLER-SIZE TABLES");

check("a diameter between two published knots interpolates",
  (() => { const r = fromKnots([[5, 0.55], [10, 0.65], [20, 0.75]], 14);
           return r.mode === "interpolated" && r.value > 0.65 && r.value < 0.75; })(),
  "14 in sits between the 10 in and 20 in knots");

check("a diameter below the first knot CLAMPS and says so",
  (() => { const r = fromKnots([[10, 1100], [20, 500], [30, 200]], 5.9);
           return r.mode === "clamped" && r.value === 1100; })(),
  "the ATC_ACC_* table starts at 10 in; the value is held, not extended");

/* Sweep every propeller the studio offers. Most small ones cannot lift
   this design at all — the sizing loop refuses to converge rather than
   extrapolating its measured thrust curve — so the sweep keeps only the
   designs that actually close and checks the bound over those. */
const swept = PROPELLERS
  .filter((p) => p.static?.length >= 4 && p.diameterM >= 0.15 && p.diameterM <= 0.48)
  .sort((a, b) => a.diameterM - b.diameterM)
  .map((p) => { try { return build({ propellerId: p.id }); } catch { return null; } })
  .filter(Boolean)
  .map((b) => ({ inches: b.ctx.propDiameterIn, ap: arduPilotParameters(b.ctx) }));

check("no emitted acceleration limit ever exceeds the table's own maximum",
  swept.length > 0
  && swept.every((s) => valueOf(s.ap, "ATC_ACC_R_MAX") <= 1100 && valueOf(s.ap, "ATC_ACC_R_MAX") >= 200)
  && swept.every((s) => valueOf(s.ap, "ATC_ACC_Y_MAX") <= 200 && valueOf(s.ap, "ATC_ACC_Y_MAX") >= 90),
  `${swept.length} convergent designs from ${swept[0].inches.toFixed(1)} to `
  + `${swept[swept.length - 1].inches.toFixed(1)} in; clamping cannot invent a limit larger than anything published`);

check("a sub-10-inch design, where one converges, clamps at the published 10 in value",
  (() => {
    const small = swept.filter((s) => s.inches < 10);
    return small.length === 0 || small.every((s) => valueOf(s.ap, "ATC_ACC_R_MAX") === 1100);
  })(),
  swept.some((s) => s.inches < 10)
    ? `${swept.filter((s) => s.inches < 10).length} converged below the table's first knot`
    : "no design below 10 in converges on measured data, so nothing is clamped in practice");

check("MOT_THST_EXPO rises with propeller diameter, as the table does",
  (() => {
    const a = fromKnots([[5, 0.55], [10, 0.65], [20, 0.75]], 6).value;
    const b = fromKnots([[5, 0.55], [10, 0.65], [20, 0.75]], 16).value;
    return b > a;
  })());

check("the expo warning travels with the number",
  ap.notes.some((n) => /dont trust manufacturer data/.test(n) && /0 to 0\.2 will result/.test(n)),
  "an ESC with a built-in linearising curve needs 0 to 0.2, not the 0.65 default");

check("the rate filters are derived from INS_GYRO_FILTER, not invented",
  valueOf(ap, "ATC_RAT_RLL_FLTD") === valueOf(ap, "INS_GYRO_FILTER") / 2
  && valueOf(ap, "ATC_RAT_PIT_FLTT") === valueOf(ap, "INS_GYRO_FILTER") / 2
  && valueOf(ap, "ATC_RAT_YAW_FLTE") === 2);

/* ── PX4 cannot compose a layout ────────────────────────────────────── */
console.log("\n  PX4's CATALOGUE");

check("a layout with a published generic airframe gets SYS_AUTOSTART",
  valueOf(px, "SYS_AUTOSTART") === PX4_AIRFRAME["QUAD/X"].id,
  `${PX4_AIRFRAME["QUAD/X"].id}, "${PX4_AIRFRAME["QUAD/X"].name}"`);

check("a layout with no generic airframe is refused, not approximated",
  (() => {
    const h = FRAMES.find((f) => f.frameClass === "QUAD" && f.frameType === "H");
    if (!h) return false;
    const b = build({ frameClass: "QUAD", frameType: "H" });
    const p2 = px4Parameters(b.ctx);
    return !names(p2).includes("SYS_AUTOSTART") && refused(p2, /SYS_AUTOSTART/);
  })(),
  "QUAD/H is FRAME_CLASS 1 / FRAME_TYPE 3 in ArduPilot and has no generic PX4 entry");

check("ArduPilot still expresses the layout PX4 cannot",
  (() => {
    const b = build({ frameClass: "QUAD", frameType: "H" });
    const a2 = arduPilotParameters(b.ctx);
    return valueOf(a2, "FRAME_CLASS") === 1 && valueOf(a2, "FRAME_TYPE") === 3;
  })(),
  "two orthogonal parameters compose; one catalogue index does not");

/* ── the file formats ───────────────────────────────────────────────── */
console.log("\n  FILE FORMATS");

const apLines = apText.split("\n").filter((l) => l.length);
const apData = apLines.filter((l) => !l.startsWith("#"));

check("the .param file is NAME,VALUE with exactly one comma and no spaces",
  apData.length > 0 && apData.every((l) => (l.match(/,/g) || []).length === 1 && !/\s/.test(l)),
  `${apData.length} parameter lines`);

check("every parameter name fits MAVLink's 16-character param_id limit",
  apData.every((l) => l.split(",")[0].length <= 16)
  && px.params.every((p) => p.name.length <= 16));

check("every emitted value is finite and plainly formatted",
  apData.every((l) => /^-?\d+(\.\d+)?$/.test(l.split(",")[1])),
  "no exponent notation, no trailing-zero noise");

check("a non-finite value is refused rather than written",
  (() => { try { formatValue(NaN); return false; } catch { return true; } })());

check("the .param file carries the Mission Planner workflow warning",
  /Load from File, review the diff, then Write Params/.test(apText),
  "a generated file is never applied automatically");

const pxLines = pxText.split("\n").filter((l) => l.length);
const pxData = pxLines.filter((l) => !l.startsWith("#"));

check("the .params file uses TAB separation and five columns",
  pxData.length > 0 && pxData.every((l) => l.split("\t").length === 5),
  "the QGC spec's columns are Vehicle-Id, Component-Id, Name, Value, Type");

check("the .params file carries the documented QGC header",
  pxLines[0] === "# Onboard parameters for Vehicle 1"
  && pxLines.some((l) => l === "# # Vehicle-Id Component-Id Name Value Type"));

check("the two formats are not interchangeable, and are not treated as such",
  !apData.some((l) => l.includes("\t")) && pxData.every((l) => !l.includes(",")),
  "comma for ArduPilot, tab for QGC; cross-compatibility is undocumented");

check("every PX4 parameter carries a MAV_PARAM_TYPE from the enum",
  px.params.every((p) => p.type === MAV_PARAM_TYPE.INT32 || p.type === MAV_PARAM_TYPE.REAL32)
  && valueOf(px, "BAT1_N_CELLS") === ctx.series
  && px.params.find((p) => p.name === "BAT1_N_CELLS").type === MAV_PARAM_TYPE.INT32,
  "INT32 -> 6, REAL32 -> 9");

/* ── the mission ────────────────────────────────────────────────────── */
console.log("\n  THE HOVER ENDURANCE TEST MISSION");

const HOME = { homeLat: 39.780, homeLon: -84.063, homeAltAmslM: 250 };
const mission = hoverTestMission(ctx, HOME);
const wp = formatWaypoints(mission);
const plan = JSON.parse(formatPlan(ctx, mission, { firmware: "ardupilot" }));

check("a mission without a declared home position is refused",
  (() => { try { hoverTestMission(ctx, {}); return false; } catch { return true; } })(),
  "coordinates are not sizing outputs");

check("the loiter time is LESS than the computed endurance",
  mission.loiterS < ctx.enduranceMin * 60 && mission.reserveMin > 0,
  `${mission.loiterS} s hover against a computed ${ctx.enduranceMin.toFixed(1)} min, `
  + `leaving ${mission.reserveMin.toFixed(1)} min unspent`);

check("the reason is the MAVLink definition, not a round number",
  /only starts once Lat, Lon and Alt is reached/.test(
    readFileSync(new URL("../src/classes/drone/autopilot.js", import.meta.url), "utf8")
      .replace(/\s*\n\s*\*?\s*/g, " ")),
  "NAV_LOITER_TIME's clock excludes the climb, so the full endurance would schedule a landing after empty");

check("the mission is takeoff, loiter, land, with the sourced command numbers",
  mission.items.map((i) => i.command).join(",") === [22, 19, 21].join(",")
  && MAV_CMD.NAV_TAKEOFF === 22 && MAV_CMD.NAV_LOITER_TIME === 19 && MAV_CMD.NAV_LAND === 21);

const wpLines = wp.split("\n").filter((l) => l.length);
check("the .waypoints file is QGC WPL 110 with 12 tab-separated columns",
  wpLines[0] === "QGC WPL 110" && wpLines.slice(1).every((l) => l.split("\t").length === 12),
  `${wpLines.length - 1} mission items`);

check("only the first item carries the CURRENT WP flag",
  wpLines.slice(1).map((l) => l.split("\t")[1]).join("") === "1" + "0".repeat(wpLines.length - 2));

check("latitude is in the latitude column, despite the official example",
  (() => {
    const first = wpLines[1].split("\t");
    return Math.abs(parseFloat(first[8]) - HOME.homeLat) < 1e-6
        && Math.abs(parseFloat(first[9]) - HOME.homeLon) < 1e-6;
  })(),
  "mavlink.io's own example puts 8.548 in the LATITUDE column for Zurich, at 47.376 N; the header wins");

check("every waypoint row declares the relative-altitude frame",
  wpLines.slice(1).every((l) => Number(l.split("\t")[2]) === MAV_FRAME_GLOBAL_RELATIVE_ALT)
  && MAV_FRAME_GLOBAL_RELATIVE_ALT === 3);

check("the .plan file matches the documented top-level shape",
  plan.fileType === "Plan" && plan.version === 1 && plan.mission.version === 2
  && Array.isArray(plan.geoFence.polygons) && plan.rallyPoints.version === 2);

check("the .plan contains SimpleItem entries only",
  plan.mission.items.every((i) => i.type === "SimpleItem"),
  "the official document marks several complex-item fields \"?\" in its own table");

check("doJumpId is auto-numbered from 1, as the spec requires",
  plan.mission.items.map((i) => i.doJumpId).join(",") === "1,2,3");

check("vehicleType and firmwareType come from the MAVLink enums",
  plan.mission.vehicleType === MAV_TYPE_BY_ROTORS[ctx.rotors].id
  && MAV_TYPE_BY_ROTORS[4].id === 2 && MAV_TYPE_BY_ROTORS[6].id === 13
  && MAV_TYPE_BY_ROTORS[8].id === 14 && MAV_TYPE_BY_ROTORS[12].id === 29
  && plan.mission.firmwareType === MAV_AUTOPILOT.ardupilot && MAV_AUTOPILOT.px4 === 12,
  `MAV_TYPE_QUADROTOR = 2 for this ${ctx.rotors}-rotor design`);

check("the planned home position is the declared one, in lat/lon/AMSL order",
  plan.mission.plannedHomePosition[0] === HOME.homeLat
  && plan.mission.plannedHomePosition[1] === HOME.homeLon
  && plan.mission.plannedHomePosition[2] === HOME.homeAltAmslM);

/* ── nothing is exported from a design that did not converge ────────── */
console.log("\n  PRECONDITIONS");

check("an unconverged sizing run cannot be exported",
  (() => {
    try {
      exportContext({ frame: FRAMES[0], selection: {}, result: { status: "infeasible" }, cell });
      return false;
    } catch (e) { return /has not converged/.test(e.message); }
  })(),
  "there is nothing to say about an aircraft that does not close");

check("a missing frame is refused",
  (() => { try { exportContext({ frame: null, selection: {}, result, cell }); return false; }
           catch (e) { return /no frame/.test(e.message); } })());

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE AUTOPILOT GATE PASSED (${pass} checks)`
                       : `DRONE AUTOPILOT GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
