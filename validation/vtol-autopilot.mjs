/* =====================================================================
   VTOL AUTOPILOT GATE — a hybrid VTOL's parameters, and the ones its
   size puts out of reach
   =====================================================================
   The multirotor exporter is gated separately. This one covers the
   aircraft half: a winged VTOL exported as an ArduPilot QuadPlane and a
   PX4 VTOL. Three things make it a different problem.

   FIRST, IT CANNOT BE DRIVEN FROM THE DRONE ENGINE AT ALL. Every VTOL
   parameter of consequence is an airspeed — the transition speed, the
   fixed-wing floor, the stall speed, the cruise trim. The drone engine
   sizes multirotors from thrust-stand data and computes no airspeed: no
   wing, no stall, no cruise. So a configuration without a wing is
   refused outright rather than exported with invented numbers, and this
   gate checks that refusal first.

   SECOND, THE AUTOPILOTS' VTOL PARAMETERS ARE SCOPED TO SMALL UAVs AND
   THIS ENGINE SIZES AIRCRAFT. PX4 publishes VT_ARSP_TRANS — the airspeed
   at which it switches to fixed wing — with a range of 0 to 30 m/s. Every
   aircraft this engine produces stalls above that, so the parameter
   cannot hold the number and is refused with the number that did not fit.
   The same happens to ArduPilot's battery-compensation parameters, which
   are published 6 to 53 V against packs that run to 800 V. The gate
   requires those refusals, because clamping would produce a file that
   loads cleanly and describes a different aircraft.

   THIRD, ARDUPILOT'S OWN GUIDANCE CAN CONTRADICT ITSELF AT THIS SIZE.
   AIRSPEED_MAX is documented as BOTH "slightly less than level flight
   speed at THR_MAX" AND "at least 50% above AIRSPEED_MIN". A design whose
   dive speed is under 1.8x its stall speed satisfies neither reading of
   both, and this engine produces those. The gate requires the exporter to
   notice and say which half it could not meet.
   ===================================================================== */
import {
  VTOL_CONFIG, RANGES, Q_FRAME_CLASS_BY_ROTORS, withinRange,
  vtolContext, quadPlaneParameters, px4VtolParameters, vtolHeader,
} from "../src/export/autopilot-vtol.js";
import { writeArduPilotParam, writeQgcParams, MAV_PARAM_TYPE } from "../src/export/autopilot-format.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("VTOL AUTOPILOT GATE");
console.log("=".repeat(78));

const BASE = {
  payload: 455, range: 161, vCruise: 67, cruiseAlt: 1000, hoverHeight: 15.24, reserveMinutes: 20,
  LD: 8.5, AR: 9, eOsw: 0.85, taper: 0.45, tc: 0.15, wingLoadingNm2: 1371, clCruiseMax: 0.9,
  clDesign: 0.55, propDiam: 2.37, twRatio: 1.3, convTolExp: -6, etaHov: 0.74, tipSpeed: 167.64,
  etaSys: 0.8, rateOfClimb: 5.08, climbAngle: 5, descentAngle: 6, climbLDPenalty: 0.13, deltaISA: 0,
  cRateDerate: 0.08, sedCell: 300, etaBat: 0.9, socMin: 0.19, ewf: 0.5, weightModel: "buildup",
  autoPositionWing: true, targetSM: 0.15, fusLen: 7.2, fusDiam: 1.65, vtGamma: 45, vtCh: 0.45,
  vtCv: 0.032, vtAR: 2.5,
};

function build(configType) {
  const d = CFG.CONFIG_DEFAULTS[configType];
  const p = {
    ...BASE, configType, nPropHover: d.nRotors,
    vCruise: d.vCruise_ms ?? BASE.vCruise, LD: d.LD_target ?? BASE.LD,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}),
  };
  const sizing = runSizing(p);
  const ctx = vtolContext({ configType, sizing, inputs: p });
  return { ctx, ap: quadPlaneParameters(ctx), px: px4VtolParameters(ctx), sizing, inputs: p };
}

const WINGED = ["liftcruise", "tiltrotor", "hybrid", "hybridPusher"];
const cases = Object.fromEntries(WINGED.map((k) => [k, build(k)]));
const lc = cases.liftcruise;

const names = (b) => b.params.map((p) => p.name);
const valueOf = (b, n) => b.params.find((p) => p.name === n)?.value;
const refusalFor = (b, n) => b.refusals.find((r) => r.name === n || r.name.startsWith(n));

console.log(`\n  ${WINGED.length} winged configurations sized: `
  + WINGED.map((k) => `${k} ${Math.round(cases[k].ctx.massKg)} kg / Vs ${cases[k].ctx.vStall.toFixed(0)}`).join(" · ")
  + "\n");

/* ── a wing is the precondition ─────────────────────────────────────── */
console.log("  A WING IS THE PRECONDITION");

check("a configuration with no wing is refused, not exported",
  ["multicopter", "sideBySide"].every((k) => {
    try { vtolContext({ configType: k, sizing: { Vstall: 40 }, inputs: {} }); return false; }
    catch (e) { return /no wing/.test(e.message) && /no stall speed/.test(e.message); }
  }), "a multirotor has no transition to describe; the drone half exports those");

check("a run with no stall speed is refused",
  (() => {
    try { vtolContext({ configType: "liftcruise", sizing: { Vstall: 0 }, inputs: {} }); return false; }
    catch (e) { return /no stall speed/.test(e.message); }
  })(), "every VTOL parameter of consequence is an airspeed");

check("all four winged configurations build",
  WINGED.every((k) => cases[k].ctx.vStall > 0 && cases[k].ap.params.length > 0),
  WINGED.join(", "));

/* ── the size problem, which is the headline ────────────────────────── */
console.log("\n  THE AUTOPILOTS' VTOL PARAMETERS ARE SCOPED TO SMALL UAVs");

check("PX4's transition airspeed is REFUSED, with the number that did not fit",
  WINGED.every((k) => {
    const r = refusalFor(cases[k].px, "VT_ARSP_TRANS");
    return !names(cases[k].px).includes("VT_ARSP_TRANS") && r && /above the published maximum of 30/.test(r.why);
  }),
  `VT_ARSP_TRANS is published 0-30 m/s; this aircraft transitions at `
  + `${lc.ctx.vTransition.toFixed(1)} m/s`);

check("and so is the blending airspeed, for the same published reason",
  WINGED.every((k) => !names(cases[k].px).includes("VT_ARSP_BLEND") && refusalFor(cases[k].px, "VT_ARSP_BLEND")));

check("ArduPilot's battery compensation is REFUSED at these pack voltages",
  !names(lc.ap).includes("Q_M_BAT_VOLT_MAX")
  && /above the published maximum of 53/.test(refusalFor(lc.ap, "Q_M_BAT_VOLT_MAX").why),
  `${lc.ctx.cellsSeries} cells in series is about ${Math.round(lc.ctx.packV)} V; the parameter stops at 53 V`);

check("nothing emitted anywhere is outside its own published range",
  WINGED.every((k) => [...cases[k].ap.params, ...cases[k].px.params]
    .every((p) => withinRange(p.name, p.value).ok)),
  "a clamped value would load cleanly and describe a different aircraft");

check("the range check itself refuses below, above and non-finite",
  withinRange("VT_ARSP_TRANS", 45).ok === false
  && withinRange("VT_ARSP_TRANS", 12).ok === true
  && withinRange("AIRSPEED_MIN", 2).ok === false
  && withinRange("AIRSPEED_MIN", NaN).ok === false
  && withinRange("FW_AIRSPD_TRIM", 500).ok === true,
  "FW_AIRSPD_TRIM has no published bound, so it is not invented one");

/* ── the airspeeds that DO come through ─────────────────────────────── */
console.log("\n  THE AIRSPEEDS, AND WHOSE RULE EACH FOLLOWS");

check("AIRSPEED_MIN is 20 % above the computed stall speed, ArduPilot's own rule",
  WINGED.every((k) => Math.abs(valueOf(cases[k].ap, "AIRSPEED_MIN") - 1.2 * cases[k].ctx.vStall) < 0.02),
  `${lc.ctx.vStall.toFixed(2)} -> ${valueOf(lc.ap, "AIRSPEED_MIN")} m/s`);

check("Q_ASSIST_SPEED is 3 m/s below it, as its own description instructs",
  Math.abs(valueOf(lc.ap, "Q_ASSIST_SPEED") - (1.2 * lc.ctx.vStall - 3)) < 0.02
  && /ASSIST threshold and NOT a transition airspeed/.test(
       lc.ap.params.find((p) => p.name === "Q_ASSIST_SPEED").why),
  "ArduPilot has no transition-airspeed parameter, so this must not be presented as one");

check("PX4's stall, minimum and trim airspeeds all come through",
  ["FW_AIRSPD_STALL", "FW_AIRSPD_MIN", "FW_AIRSPD_TRIM"].every((n) => names(lc.px).includes(n))
  && Math.abs(valueOf(lc.px, "FW_AIRSPD_STALL") - lc.ctx.vStall) < 0.02,
  "these carry no published range, so the aircraft's own numbers survive");

check("the transition speed is derived from a PUBLISHED margin, and says so",
  /20 % above the computed stall speed/.test(
    lc.px.refusals.find((r) => r.name === "VT_ARSP_TRANS").why)
  && Math.abs(lc.ctx.vTransition - 1.2 * lc.ctx.vStall) < 1e-9,
  "PX4 publishes no margin rule of its own; its default 10 m/s is an absolute unrelated to the aircraft");

/* ── the contradiction in ArduPilot's own guidance ──────────────────── */
console.log("\n  WHERE ARDUPILOT'S GUIDANCE CONTRADICTS ITSELF");

const contradicted = WINGED.filter((k) => {
  const min = valueOf(cases[k].ap, "AIRSPEED_MIN"), max = valueOf(cases[k].ap, "AIRSPEED_MAX");
  return Number.isFinite(min) && Number.isFinite(max) && max < 1.5 * min;
});

check("a design that cannot satisfy both halves of AIRSPEED_MAX is detected",
  contradicted.length > 0
  && contradicted.every((k) => cases[k].ap.notes.some((n) => /cannot satisfy both/.test(n))),
  contradicted.length
    ? `${contradicted.join(", ")}: dive speed is under 1.5x AIRSPEED_MIN`
    : "no case contradicted");

check("the note names the gap in m/s rather than waving at it",
  contradicted.every((k) => cases[k].ap.notes.some((n) => /The gap is [\d.]+ m\/s/.test(n)))
  && cases[contradicted[0]].ap.notes.some((n) => /TECS altitude control/.test(n)),
  "and names what the documentation says it costs");

check("the emitted value follows the aircraft, not the rule it cannot meet",
  contradicted.every((k) => Math.abs(valueOf(cases[k].ap, "AIRSPEED_MAX") - cases[k].ctx.VD) < 0.02),
  "the dive speed is a computed property; the 50 % rule is guidance");

/* ── the two ecosystems disagree about quantities, not names ────────── */
console.log("\n  DIFFERENT QUANTITIES, NOT DIFFERENT NAMES");

check("neither transition DURATION is emitted, and the refusal says why they differ",
  !names(lc.ap).includes("Q_TRANSITION_MS") && !names(lc.px).includes("VT_F_TRANS_DUR")
  && /AFTER minimum airspeed is reached/.test(refusalFor(lc.ap, "Q_TRANSITION_MS").why)
  && /WHOLE front transition/.test(refusalFor(lc.px, "VT_F_TRANS_DUR").why),
  "PX4's is the whole transition; ArduPilot's is only the tail after minimum airspeed");

check("the back transition is refused on BOTH sides, as different physical quantities",
  !names(lc.ap).includes("Q_TRANS_DECEL") && !names(lc.px).includes("VT_B_TRANS_DUR")
  && /m\/s\^2/.test(refusalFor(lc.ap, "Q_TRANS_DECEL").why)
  && /DURATION in seconds/.test(refusalFor(lc.px, "VT_B_TRANS_DUR").why),
  "a deceleration and a duration cannot be cross-converted");

check("mass goes to PX4 and is reported as a gap for ArduPilot",
  names(lc.px).includes("WEIGHT_BASE") && names(lc.px).includes("WEIGHT_GROSS")
  && Math.abs(valueOf(lc.px, "WEIGHT_BASE") - lc.ctx.massKg) < 0.5
  && refusalFor(lc.ap, "a vehicle mass"),
  `${Math.round(lc.ctx.massKg)} kg has nowhere to go in ArduPilot`);

check("the hover-throttle refusal is the same one the multirotor exporter makes",
  !names(lc.ap).includes("Q_M_THST_HOVER") && /let it be learned in flight/.test(refusalFor(lc.ap, "Q_M_THST_HOVER").why));

/* ── configuration is mapped by mechanism ───────────────────────────── */
console.log("\n  CONFIGURATION, MAPPED BY MECHANISM");

check("lift+cruise is a Standard VTOL and a tiltrotor is a Tiltrotor",
  valueOf(cases.liftcruise.px, "VT_TYPE") === 2 && valueOf(cases.tiltrotor.px, "VT_TYPE") === 1
  && valueOf(cases.liftcruise.px, "SYS_AUTOSTART") === 13000,
  "VT_TYPE encodes whether the rotors stop or tilt, which is how the engine defines these too");

check("a configuration PX4's catalogue cannot express is refused, not approximated",
  ["hybrid", "hybridPusher"].every((k) =>
    !names(cases[k].px).includes("VT_TYPE") && !names(cases[k].px).includes("SYS_AUTOSTART")
    && /no generic/i.test(refusalFor(cases[k].px, "SYS_AUTOSTART").why)),
  "tilting SOME rotors while stopping the others is neither Tiltrotor nor Standard");

check("ArduPilot still expresses those layouts, because it composes",
  ["hybrid", "hybridPusher"].every((k) => names(cases[k].ap).includes("Q_ENABLE")
    && names(cases[k].ap).includes("Q_FRAME_CLASS")),
  "Q_ENABLE plus a frame class is not a catalogue lookup");

check("Q_FRAME_CLASS follows the hover rotor count",
  WINGED.every((k) => {
    const want = Q_FRAME_CLASS_BY_ROTORS[cases[k].ctx.rotors];
    return !want || valueOf(cases[k].ap, "Q_FRAME_CLASS") === want.id;
  }), "the same enumeration Copter's FRAME_CLASS uses");

check("Q_FRAME_TYPE is refused, because a layout is not a sizing output",
  WINGED.every((k) => !names(cases[k].ap).includes("Q_FRAME_TYPE") && refusalFor(cases[k].ap, "Q_FRAME_TYPE")),
  "guessing X would silently set the mixer");

check("a tilting configuration refuses the tilt parameters and says why",
  ["tiltrotor", "hybrid", "hybridPusher"].every((k) =>
    refusalFor(cases[k].ap, "Q_TILT_MASK") && /wiring choice/.test(refusalFor(cases[k].ap, "Q_TILT_MASK").why))
  && !refusalFor(cases.liftcruise.ap, "Q_TILT_MASK"),
  "which OUTPUTS tilt is a bitmask of a wiring decision, and lift+cruise tilts nothing");

/* ── the files ──────────────────────────────────────────────────────── */
console.log("\n  THE FILES");

const apText = writeArduPilotParam({ headerNotes: vtolHeader(lc.ctx), ...lc.ap });
const pxText = writeQgcParams({ headerNotes: vtolHeader(lc.ctx), ...lc.px });
const apData = apText.split("\n").filter((l) => l.length && !l.startsWith("#"));
const pxData = pxText.split("\n").filter((l) => l.length && !l.startsWith("#"));

check("the .param file is NAME,VALUE with exactly one comma and no spaces",
  apData.length > 0 && apData.every((l) => (l.match(/,/g) || []).length === 1 && !/\s/.test(l)),
  `${apData.length} parameter lines`);

check("the .params file is TAB separated with five columns and a type",
  pxData.length > 0 && pxData.every((l) => l.split("\t").length === 5)
  && lc.px.params.every((p) => p.type === MAV_PARAM_TYPE.INT32 || p.type === MAV_PARAM_TYPE.REAL32));

check("every parameter name fits MAVLink's 16-character param_id limit",
  [...lc.ap.params, ...lc.px.params].every((p) => p.name.length <= 16));

check("both files carry the refusals, which is the half a user cannot get elsewhere",
  /NOT EMITTED, and why:/.test(apText) && /NOT EMITTED, and why:/.test(pxText)
  && /Q_M_BAT_VOLT_MAX/.test(apText) && /VT_ARSP_TRANS/.test(pxText));

check("the header states the scoping problem rather than burying it",
  /scoped to small UAVs/i.test(apText) && /scoped to small UAVs/i.test(pxText));

check("the .param file carries the Mission Planner workflow warning",
  /Load from File, review the diff, then Write Params/.test(apText));

console.log("=".repeat(78));
console.log(fail === 0 ? `VTOL AUTOPILOT GATE PASSED (${pass} checks)`
                       : `VTOL AUTOPILOT GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
