/* =====================================================================
   AUTOPILOT EXPORT — what this sizing run is entitled to tell a flight
   controller, and what it must refuse to say
   =====================================================================
   A parameter file is the most dangerous artefact this tool produces.
   Every other tab is read by a person who can disagree with it. A .param
   file is loaded into an aircraft that then flies on it. So the rule here
   is stricter than anywhere else in the studio: a parameter is emitted
   ONLY when the sizing run determines it and the ecosystem's own
   documentation says that is the parameter's meaning. Everything else is
   refused BY NAME, with the reason, in `refusals` — a refusal is a
   result, not an omission.

   ── THE FOUR THINGS THIS MODULE REFUSES TO DO ────────────────────────

   1. IT DOES NOT WRITE THE COMPUTED HOVER THROTTLE INTO MOT_THST_HOVER.
      This is the one a naive exporter gets wrong, because the parameter
      is named for the quantity we hold. ArduPilot's own setup page says
      the opposite of what the name suggests:
        "MOT_THST_HOVER: 0.25 or below the expected actual hover thrust
         percentage (lower is safe)"
      with MOT_HOVER_LEARN refining it in flight. Writing a computed 0.42
      into it contradicts the documentation and removes the safety margin
      the documentation is asking for. The computed figure is emitted as a
      COMMENT in the file, where it informs without commanding, and
      MOT_HOVER_LEARN is set to learn-and-save instead.

      PX4 is the opposite and MPC_THR_HOVER IS emitted — see (2). The same
      physical quantity, opposite official advice. That is a real
      behavioural difference between the ecosystems, not a naming one.

   2. THRUST FRACTION IS NOT CONTROL-SIGNAL FRACTION, EXCEPT WHEN IT IS.
      What this tool computes is `hoverThrottleFraction` = hover thrust /
      maximum measured thrust. That is a THRUST ratio. MPC_THR_HOVER is a
      CONTROL SIGNAL ratio. PX4 publishes the relation between them:
        rel_thrust = factor * rel_signal^2 + (1 - factor) * rel_signal
      so the two coincide exactly — and only — when factor is 0, which is
      PX4's shipped default for THR_MDL_FAC. So MPC_THR_HOVER is emitted
      as the computed thrust fraction, and the file states that it is
      correct only while THR_MDL_FAC remains 0. Change one and the other
      is wrong.

   3. IT DOES NOT TRANSLATE MOT_THST_EXPO INTO THR_MDL_FAC. They are
      numerically the same model — ArduPilot inverts the identical
      quadratic in AP_Motors_Thrust_Linearization.cpp — but ArduPilot has
      never published that formula, and PX4 publishes no propeller-size
      guidance of its own. Emitting a PX4 curvature derived from
      ArduPilot's prop-size table would be dressing one ecosystem's
      rule-of-thumb in the other's parameter name, with source code as the
      only bridge. THR_MDL_FAC is left at its default and the reason is
      recorded. (This is also what keeps (2) valid.)

   4. IT DOES NOT EMIT HARDWARE CALIBRATION. BATT_AMP_PERVLT,
      BATT_VOLT_MULT, BATT_*_PIN and PX4's BAT1_V_DIV / BAT1_A_PER_V are
      properties of the power module someone soldered in, not of the
      airframe this tool sized. They appear in every real .param file,
      which is exactly why an exporter is tempted to emit them. Emitting
      them silently mis-calibrates the user's telemetry.

   ── THE CHEMISTRY TRAP ───────────────────────────────────────────────
   Both ecosystems state their cell-voltage guidance for LiPo:
   ArduPilot "4.2v x No. Cells for standard LiPos, or as appropriate if
   using a different battery type"; PX4's BAT1_V_EMPTY says "chosen above
   the steep dropoff at 3.5V". The default cell in this studio is a
   Molicel INR21700, which is Li-ion NMC: its datasheet minimum discharge
   voltage is 2.5 V, not 3.3, and it has no 3.5 V dropoff shoulder.
   Applying the LiPo constants to it would be applying one chemistry's
   rule to another's cell.

   So the pack endpoints come from THE SELECTED CELL'S OWN PUBLISHED
   VOLTAGES (`max_charge_voltage_v`, `min_discharge_voltage_v`) times the
   series count, and when the chemistry is not LiPo the file says so and
   names the guidance it is departing from. The 4.2/3.3 rule is used only
   when the cell is actually LiPo and publishes nothing better.

   ── INTERPOLATION, NOT EXTRAPOLATION ─────────────────────────────────
   ArduPilot publishes its prop-size tables at three diameters each. A
   design between two of them is interpolated linearly and labelled
   `interpolated`. A design OUTSIDE the published range is CLAMPED to the
   nearest published endpoint and labelled `clamped`, never extended — the
   same refusal the rotor module makes about measured thrust curves. The
   ATC_ACC_* table starts at 10 in, so most of this studio's propellers
   (0.15-0.48 m = 5.9-18.9 in) sit below its first knot and clamp.

   ── SOURCES ──────────────────────────────────────────────────────────
   Parameter names, descriptions and the prop-size tables:
     https://ardupilot.org/copter/docs/parameters.html
     https://ardupilot.org/copter/docs/setting-up-for-tuning.html
     https://ardupilot.org/copter/docs/motor-thrust-scaling.html
     https://docs.px4.io/main/en/advanced_config/parameter_reference.html
     https://docs.px4.io/main/en/airframes/airframe_reference.html
   File formats:
     .param   — de facto, from ArduPilot's shipped Tools/Frame_params/*.param
     .params  — https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/parameters.html
     .waypoints — https://mavlink.io/en/file_formats/  ("QGC WPL 110")
     .plan    — https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/plan.html
   Enumerations (MAV_CMD, MAV_FRAME, MAV_TYPE, MAV_AUTOPILOT) read from
   the MAVLink definitions themselves, not from a rendered doc page:
     message_definitions/v1.0/common.xml
       sha256 04f01bbaa94e51e554765ba1fc7f3058204876cffb8de99a49b6671b2c9bfc58
     message_definitions/v1.0/minimal.xml   (MAV_TYPE lives here)
       sha256 d4c7c7346432814348bb858cbab8cee7a17b23e37937c1574e2018148cbfb785
     retrieved 2026-09-21 from https://raw.githubusercontent.com/mavlink/mavlink/master/
   Full research note, including what could not be sourced:
     Archives/drone-literature-20260921/autopilot-integration/FINDINGS.md
   ===================================================================== */

import {
  MAV_PARAM_TYPE, formatValue, writeArduPilotParam, writeQgcParams,
} from "../../export/autopilot-format.js";

/* The file FORMATS live in src/export/autopilot-format.js because the
   VTOL exporter writes the identical two formats from entirely different
   parameters. Re-exported here so this module stays the one import a
   caller needs. */
export { MAV_PARAM_TYPE, formatValue };

/* ── enumerations ───────────────────────────────────────────────────── */

/* ArduPilot FRAME_CLASS, from the Copter parameter list. The studio's
   frame records carry ArduPilot's own symbolic class names, read from
   AP_MotorsMatrix.cpp, so this maps symbol -> the documented number. */
export const FRAME_CLASS = Object.freeze({
  QUAD: 1, HEXA: 2, OCTA: 3, OCTAQUAD: 4, Y6: 5, TRI: 7,
  DODECAHEXA: 12, DECA: 14,
});

/* ArduPilot FRAME_TYPE. Same source. The symbols are the studio's
   frameType strings. */
export const FRAME_TYPE = Object.freeze({
  PLUS: 0, X: 1, V: 2, H: 3, VTAIL: 4, ATAIL: 5,
  Y6B: 10, Y6F: 11, BF_X: 12, DJI_X: 13, CW_X: 14, I: 15,
  X_REV: 18, Y4: 19,
});

/* PX4 SYS_AUTOSTART, from the Airframes Reference. PX4 cannot compose a
   layout the way ArduPilot can: there is one index pointing at a named
   airframe script, so a layout with no published generic airframe has no
   PX4 answer at all and is refused rather than approximated. */
export const PX4_AIRFRAME = Object.freeze({
  "QUAD/X": { id: 4001, name: "Generic Quadcopter" },
  "QUAD/PLUS": { id: 5001, name: "Generic Quad + geometry" },
  "HEXA/X": { id: 6001, name: "Generic Hexarotor x geometry" },
  "HEXA/PLUS": { id: 7001, name: "Generic Hexarotor + geometry" },
  "OCTA/X": { id: 8001, name: "Generic Octocopter X geometry" },
  "OCTA/PLUS": { id: 9001, name: "Generic Octocopter + geometry" },
  "OCTAQUAD/X": { id: 12001, name: "Generic 10 inch Octo coaxial geometry" },
  "TRI/PLUS": { id: 14001, name: "Generic Multirotor with tilt" },
  "DODECAHEXA/X": { id: 24001, name: "Generic Dodecarotor cox geometry" },
});

/* MAV_TYPE, by motor count, from minimal.xml. Used for the .plan
   vehicleType field only. */
export const MAV_TYPE_BY_ROTORS = Object.freeze({
  3: { id: 15, name: "MAV_TYPE_TRICOPTER" },
  4: { id: 2, name: "MAV_TYPE_QUADROTOR" },
  6: { id: 13, name: "MAV_TYPE_HEXAROTOR" },
  8: { id: 14, name: "MAV_TYPE_OCTOROTOR" },
  10: { id: 35, name: "MAV_TYPE_DECAROTOR" },
  12: { id: 29, name: "MAV_TYPE_DODECAROTOR" },
});

export const MAV_AUTOPILOT = Object.freeze({ ardupilot: 3, px4: 12 });
export const MAV_FRAME_GLOBAL_RELATIVE_ALT = 3;
export const MAV_CMD = Object.freeze({
  NAV_WAYPOINT: 16, NAV_LOITER_TIME: 19, NAV_RETURN_TO_LAUNCH: 20,
  NAV_LAND: 21, NAV_TAKEOFF: 22,
});


/* ── the published propeller-size tables ────────────────────────────── */

/* Each knot is a diameter in inches and the value ArduPilot publishes at
   it. Nothing here is fitted; these are the numbers as printed. */
const EXPO_KNOTS = Object.freeze([[5, 0.55], [10, 0.65], [20, 0.75]]);
const GYRO_FILTER_KNOTS = Object.freeze([[5, 80], [10, 40], [20, 20]]);
const ACC_RP_KNOTS = Object.freeze([[10, 1100], [20, 500], [30, 200]]);
const ACC_Y_KNOTS = Object.freeze([[10, 200], [20, 100], [30, 90]]);

/* Piecewise-linear between published knots; clamped at the ends. The
   mode is returned with the value because a clamped number and an
   interpolated one do not carry the same weight, and the file says
   which it is. */
export function fromKnots(knots, x) {
  const first = knots[0], last = knots[knots.length - 1];
  if (x <= first[0]) return { value: first[1], mode: x < first[0] ? "clamped" : "published", knot: first[0] };
  if (x >= last[0]) return { value: last[1], mode: x > last[0] ? "clamped" : "published", knot: last[0] };
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i], [x1, y1] = knots[i + 1];
    if (x === x0) return { value: y0, mode: "published", knot: x0 };
    if (x > x0 && x < x1) {
      const t = (x - x0) / (x1 - x0);
      return { value: y0 + t * (y1 - y0), mode: "interpolated", between: [x0, x1] };
    }
  }
  return { value: last[1], mode: "published", knot: last[0] };
}

/* ── helpers ────────────────────────────────────────────────────────── */

const M_PER_INCH = 0.0254;
export const toInches = (metres) => metres / M_PER_INCH;


const round2 = (x) => Math.round(x * 100) / 100;

/* Is this cell the chemistry the ecosystems' guidance was written for? */
export function isLipo(cell) {
  return /lipo|lithium polymer/i.test(cell?.chemistry ?? "");
}

/* Pack endpoints. Prefers the cell's own published voltages; falls back
   to the ecosystem's LiPo constants only for an actual LiPo that
   publishes neither. Returns the provenance either way. */
export function packEndpoints(cell, series) {
  const lipo = isLipo(cell);
  const maxCell = cell?.max_charge_voltage_v ?? null;
  const minCell = cell?.min_discharge_voltage_v ?? null;
  const notes = [];

  let vMax, vMin, source;
  if (maxCell != null && minCell != null) {
    vMax = maxCell * series; vMin = minCell * series;
    source = `the cell's own published limits, ${maxCell} V charged and ${minCell} V discharged, times ${series} in series`;
    if (!lipo) {
      notes.push(
        `${cell.chemistry} is not LiPo, and both ecosystems state their cell-voltage guidance for LiPo `
        + `(ArduPilot "4.2v x No. Cells for standard LiPos, or as appropriate if using a different battery type"). `
        + `The LiPo rule would give ${formatValue(round2(4.2 * series))} V and ${formatValue(round2(3.3 * series))} V; `
        + `this cell's datasheet gives ${formatValue(round2(vMax))} V and ${formatValue(round2(vMin))} V. `
        + `The datasheet is used.`);
    }
  } else if (lipo) {
    vMax = 4.2 * series; vMin = 3.3 * series;
    source = `ArduPilot's published LiPo rule, 4.2 V and 3.3 V per cell times ${series} in series, `
      + `because this cell publishes no charge/discharge endpoints of its own`;
  } else {
    return {
      ok: false,
      reason: `${cell?.chemistry ?? "this cell"} publishes no charge/discharge endpoints, and it is not LiPo, `
        + `so the LiPo rule of 4.2/3.3 V per cell cannot stand in for them`,
      notes,
    };
  }
  return { ok: true, vMax: round2(vMax), vMin: round2(vMin), source, notes, lipo };
}

/* ── the context a caller assembles ─────────────────────────────────── */
/* Everything the exporters need, pulled out of the studio's frame record,
   the design selection and the converged sizing result. Kept explicit so
   a gate can build one without React. */
export function exportContext({ frame, selection, result, cell, altitudeM = 0 }) {
  if (!frame) throw new Error("no frame selected");
  if (!selection) throw new Error("no selection");
  if (!result || !String(result.status ?? "").startsWith("converged"))
    throw new Error("the sizing run has not converged; there is nothing to export");

  const propDiameterIn = toInches(selection.propeller.diameterM);
  return Object.freeze({
    frame, selection, result, cell, altitudeM,
    propDiameterIn,
    rotors: frame.motorCount,
    massKg: result.massKg,
    hoverThrustFraction: result.thrustToWeight.hoverThrottleFraction,
    enduranceMin: result.endurance.minutes,
    capacityMah: selection.battery.capacityMah,
    series: selection.packCells,
    usableFraction: result.endurance.usableFraction,
  });
}

/* ── ArduPilot ──────────────────────────────────────────────────────── */

export function arduPilotParameters(ctx) {
  const params = [];
  const refusals = [];
  const notes = [];
  const p = (name, value, why) => params.push({ name, value, why });

  /* Frame. Both halves are looked up, never guessed: an unmapped symbol
     is a refusal, because a wrong FRAME_TYPE flips a motor pair. */
  const cls = FRAME_CLASS[ctx.frame.frameClass];
  const typ = FRAME_TYPE[ctx.frame.frameType];
  if (cls == null) {
    refusals.push({ name: "FRAME_CLASS", why: `no documented FRAME_CLASS number for the class "${ctx.frame.frameClass}"` });
  } else {
    p("FRAME_CLASS", cls, `${ctx.frame.frameClass}, ${ctx.frame.motorCount} motors. Reboot required.`);
  }
  if (ctx.frame.frameClass === "TRI") {
    refusals.push({
      name: "FRAME_TYPE",
      why: `FRAME_TYPE is "Not used for Tri or Traditional Helicopters" per its own official description`,
    });
  } else if (typ == null) {
    refusals.push({ name: "FRAME_TYPE", why: `no documented FRAME_TYPE number for the type "${ctx.frame.frameType}"` });
  } else {
    p("FRAME_TYPE", typ, `${ctx.frame.frameType} layout (${ctx.frame.frameTypeEnum}). Reboot required.`);
  }

  /* Battery. Capacity is a direct sizing output; the endpoints come from
     the selected cell. */
  p("BATT_CAPACITY", Math.round(ctx.capacityMah),
    `the assembled pack's capacity, ${ctx.selection.battery.cellsSeries}S${ctx.selection.battery.cellsParallel}P`);

  const ends = packEndpoints(ctx.cell, ctx.series);
  notes.push(...(ends.notes ?? []));
  if (ends.ok) {
    p("MOT_BAT_VOLT_MAX", ends.vMax, `thrust-compensation ceiling, from ${ends.source}`);
    p("MOT_BAT_VOLT_MIN", ends.vMin, `thrust-compensation floor, from ${ends.source}`);
  } else {
    refusals.push({ name: "MOT_BAT_VOLT_MAX / MOT_BAT_VOLT_MIN", why: ends.reason });
  }

  /* Propeller-size derived. */
  const expo = fromKnots(EXPO_KNOTS, ctx.propDiameterIn);
  p("MOT_THST_EXPO", round2(expo.value),
    `${expo.mode} from ArduPilot's published table (0.55 at 5 in, 0.65 at 10 in, 0.75 at 20 in) `
    + `for a ${ctx.propDiameterIn.toFixed(1)} in propeller`);
  notes.push(
    `MOT_THST_EXPO is an approximation for hobby-grade hardware. ArduPilot: "This parameter should be `
    + `derived by thrust stand measurements for best results (dont trust manufacturer data)", and "Some ESCs `
    + `have built-in linearizing curves and the default EXPO value of 0.65 will cause stability issues, `
    + `requiring thrust stand measurements to adjust the EXPO. Typically, values of 0 to 0.2 will result."`);

  const gyro = fromKnots(GYRO_FILTER_KNOTS, ctx.propDiameterIn);
  p("INS_GYRO_FILTER", Math.round(gyro.value),
    `${gyro.mode} from the published table (80 Hz at 5 in, 40 Hz at 10 in, 20 Hz at 20 in)`);
  p("INS_ACCEL_FILTER", 10, `the published value; it does not vary with propeller size`);

  const accRP = fromKnots(ACC_RP_KNOTS, ctx.propDiameterIn);
  const accY = fromKnots(ACC_Y_KNOTS, ctx.propDiameterIn);
  const accNote = accRP.mode === "clamped"
    ? `clamped at the 10 in end of the published table — it starts at 10 in and this propeller is `
      + `${ctx.propDiameterIn.toFixed(1)} in, so the value is held rather than extended`
    : `${accRP.mode} from the published table (1100 at 10 in, 500 at 20 in, 200 at 30 in)`;
  p("ATC_ACC_R_MAX", Math.round(accRP.value), accNote);
  p("ATC_ACC_P_MAX", Math.round(accRP.value), accNote);
  p("ATC_ACC_Y_MAX", Math.round(accY.value),
    accY.mode === "clamped" ? `clamped at the 10 in end of the published table (200 at 10 in)`
      : `${accY.mode} from the published table (200 at 10 in, 100 at 20 in, 90 at 30 in)`);

  /* The filter parameters the same page derives from INS_GYRO_FILTER. */
  const half = Math.round(gyro.value) / 2;
  for (const n of ["ATC_RAT_RLL_FLTD", "ATC_RAT_RLL_FLTT", "ATC_RAT_PIT_FLTD", "ATC_RAT_PIT_FLTT", "ATC_RAT_YAW_FLTT"])
    p(n, half, `INS_GYRO_FILTER / 2, as the published setup table specifies`);
  p("ATC_RAT_YAW_FLTE", 2, `the published value`);

  /* Hover throttle — the refusal this module exists for. */
  p("MOT_HOVER_LEARN", 2, `learn and save the hover throttle in flight, which is what the documentation asks for`);
  refusals.push({
    name: "MOT_THST_HOVER",
    why: `this run computes a hover thrust fraction of ${(100 * ctx.hoverThrustFraction).toFixed(0)} %, but `
      + `ArduPilot's setup page says to set MOT_THST_HOVER to "0.25 or below the expected actual hover thrust `
      + `percentage (lower is safe)" and let MOT_HOVER_LEARN find the real value. Writing the computed figure `
      + `in would contradict the documentation and remove the margin it asks for. The figure is in the header `
      + `comment instead.`,
  });
  refusals.push({
    name: "ATC_RAT_RLL_P / ATC_RAT_PIT_P / ATC_RAT_YAW_P and the rest of the rate gains",
    why: `not sizing outputs. The official page says the rate-loop P/I/D defaults "are usually safe for first `
      + `test hovers of most vehicles" and sends the user to the in-flight tuning process. The gains in `
      + `ArduPilot's shipped frame files are measured results from tuning one known airframe, not geometry.`,
  });
  refusals.push({
    name: "BATT_AMP_PERVLT / BATT_VOLT_MULT / BATT_VOLT_PIN / BATT_CURR_PIN",
    why: `power-module calibration, not airframe. These depend on the hardware someone soldered in; emitting `
      + `them would silently mis-calibrate the user's telemetry.`,
  });
  refusals.push({
    name: "a vehicle mass parameter",
    why: `ArduPilot has no parameter that takes a mass, in Copter or Plane. This run's ${ctx.massKg.toFixed(2)} kg `
      + `all-up mass has nowhere to go. PX4 has WEIGHT_BASE and WEIGHT_GROSS; ArduPilot has no equivalent.`,
  });

  return { params, refusals, notes };
}

/* ── PX4 ────────────────────────────────────────────────────────────── */

export function px4Parameters(ctx) {
  const params = [];
  const refusals = [];
  const notes = [];
  const p = (name, value, type, why) => params.push({ name, value, type, why });

  const key = `${ctx.frame.frameClass}/${ctx.frame.frameType}`;
  const airframe = PX4_AIRFRAME[key];
  if (airframe) {
    p("SYS_AUTOSTART", airframe.id, MAV_PARAM_TYPE.INT32,
      `"${airframe.name}". Reboot required.`);
  } else {
    refusals.push({
      name: "SYS_AUTOSTART",
      why: `PX4 selects an airframe from a published catalogue rather than composing one from a class and a `
        + `type, and the catalogue has no generic entry for ${key}. ArduPilot expresses this layout as `
        + `FRAME_CLASS x FRAME_TYPE; PX4 cannot express it at all without a custom airframe file. Picking a `
        + `neighbouring airframe would change the motor geometry.`,
    });
  }

  p("BAT1_CAPACITY", Math.round(ctx.capacityMah), MAV_PARAM_TYPE.REAL32,
    `the assembled pack's capacity. Reboot required.`);
  p("BAT1_N_CELLS", ctx.series, MAV_PARAM_TYPE.INT32,
    `cells in series. PX4 takes this directly; ArduPilot has no cell-count parameter and encodes it `
    + `implicitly in the MOT_BAT_VOLT endpoints.`);

  /* PX4's per-cell voltages are ESTIMATOR inputs, not thrust clamps, and
     its defaults are deliberately not the charge limits. Same cell data,
     different meaning, so the reasoning is stated separately. */
  const lipo = isLipo(ctx.cell);
  const vFull = ctx.cell?.max_charge_voltage_v ?? null;
  const vEmpty = ctx.cell?.min_discharge_voltage_v ?? null;
  if (vFull != null && vEmpty != null) {
    p("BAT1_V_CHARGED", vFull, MAV_PARAM_TYPE.REAL32,
      `the cell's published charge voltage. PX4 defaults to 4.05 V and advises setting it below the charge `
      + `limit for estimator accuracy, so this is the conservative direction only if the user lowers it. `
      + `Reboot required.`);
    p("BAT1_V_EMPTY", vEmpty, MAV_PARAM_TYPE.REAL32,
      `the cell's published minimum discharge voltage. Reboot required.`);
    if (!lipo) {
      notes.push(
        `PX4's BAT1_V_EMPTY guidance — "The voltage should be chosen above the steep dropoff at 3.5V" — `
        + `describes a LiPo discharge curve. This pack is ${ctx.cell.chemistry}, whose published floor is `
        + `${vEmpty} V and which has no 3.5 V shoulder. The datasheet value is used and the guidance is `
        + `noted as not applying.`);
    }
    /* Two different depths of discharge, and only one of them is a cell
       property. Worth saying out loud, because the endurance figure in
       the header and the parameter three lines below it do not describe
       the same flight. */
    notes.push(
      `BAT1_V_EMPTY here is the CELL'S floor (${vEmpty} V), not the depth this tool sized to. The `
      + `${ctx.enduranceMin.toFixed(1)} min endurance was computed on a declared usable fraction of `
      + `${(100 * ctx.usableFraction).toFixed(0)} %, which stops well above that voltage. PX4 will happily `
      + `fly the pack deeper than the endurance figure assumes, so the two numbers answer different `
      + `questions: one is where the cell is empty, the other is where this design chose to stop.`);
  } else {
    refusals.push({
      name: "BAT1_V_CHARGED / BAT1_V_EMPTY",
      why: `the selected cell publishes no charge/discharge endpoints`,
    });
  }

  /* Hover throttle — emitted here, and the reason it is valid is stated. */
  p("MPC_THR_HOVER", round2(ctx.hoverThrustFraction), MAV_PARAM_TYPE.REAL32,
    `the computed hover thrust fraction. PX4 wants the real value here: it seeds the hover-thrust estimator `
    + `and feeds the land detector. Valid as written ONLY while THR_MDL_FAC is 0 — see the note.`);
  notes.push(
    `MPC_THR_HOVER is a CONTROL SIGNAL fraction; what this tool computes is a THRUST fraction. PX4's published `
    + `model is rel_thrust = factor * rel_signal^2 + (1 - factor) * rel_signal, so the two are equal exactly `
    + `when factor is 0 — which is THR_MDL_FAC's shipped default, and why this file does not change it. If you `
    + `set THR_MDL_FAC to anything else, MPC_THR_HOVER as written here is no longer the right number.`);
  refusals.push({
    name: "THR_MDL_FAC",
    why: `ArduPilot's MOT_THST_EXPO and PX4's THR_MDL_FAC are the same quadratic — ArduPilot inverts it in `
      + `AP_Motors_Thrust_Linearization.cpp — but ArduPilot has never published that formula, and PX4 publishes `
      + `no propeller-size guidance of its own. Deriving a PX4 curvature from ArduPilot's prop-size table would `
      + `bridge two ecosystems across unpublished source code. Left at its default, which also keeps `
      + `MPC_THR_HOVER correct.`,
  });

  /* The one place a mass goes directly into an autopilot. */
  p("WEIGHT_BASE", round2(ctx.massKg), MAV_PARAM_TYPE.REAL32,
    `the sized all-up mass. WEIGHT_BASE and WEIGHT_GROSS are the only parameters in either ecosystem that `
    + `take a mass in kilograms.`);
  p("WEIGHT_GROSS", round2(ctx.massKg), MAV_PARAM_TYPE.REAL32,
    `equal to WEIGHT_BASE for the as-sized aircraft; raise it when payload is added.`);

  refusals.push({
    name: "BAT_LOW_THR / BAT_CRIT_THR / BAT_EMERGEN_THR",
    why: `PX4's failsafe thresholds are fractions of remaining state of charge, not voltages or mAh. They are `
      + `not convertible from this run's usable-energy figure without PX4's own SoC estimator, and guessing `
      + `them would set a failsafe the user believes was computed.`,
  });
  refusals.push({
    name: "BAT1_V_DIV / BAT1_A_PER_V",
    why: `power-module calibration, not airframe — the PX4 equivalent of ArduPilot's BATT_AMP_PERVLT.`,
  });

  return { params, refusals, notes };
}

/* ── file formatters ────────────────────────────────────────────────── */

/* Both writers delegate to the shared format layer; only the header
   lines are this exporter's own. */
export function formatArduPilotParam(ctx, built = arduPilotParameters(ctx)) {
  return writeArduPilotParam({ headerNotes: droneHeader(ctx), ...built });
}

export function formatQgcParams(ctx, built = px4Parameters(ctx), vehicleId = 1, componentId = 1) {
  return writeQgcParams({ headerNotes: droneHeader(ctx), ...built }, vehicleId, componentId);
}

function droneHeader(ctx) {
  return [
    `generated by eVTOL Sizer for a ${ctx.frame.frameClass}/${ctx.frame.frameType} `
      + `at ${ctx.massKg.toFixed(2)} kg all-up`,
    `${ctx.rotors} rotors, ${ctx.propDiameterIn.toFixed(1)} in propellers, `
      + `${ctx.selection.battery.cellsSeries}S${ctx.selection.battery.cellsParallel}P `
      + `${Math.round(ctx.capacityMah)} mAh, hover endurance ${ctx.enduranceMin.toFixed(1)} min`,
    `computed hover thrust fraction ${(100 * ctx.hoverThrustFraction).toFixed(0)} % of measured `
      + `maximum. This is NOT written to MOT_THST_HOVER -- see the refusals below.`,
  ];
}

/* ── the hover endurance test mission ───────────────────────────────── */

/* The only mission this tool is entitled to write. It computed a hover
   endurance; a mission that takes off, hovers and lands is that number
   made flyable, and nothing else here is derived from the sizing run.
   Waypoint coordinates are not sizing outputs — the home position is
   declared by the caller and the aircraft never leaves it.

   THE LOITER TIME IS NOT THE COMPUTED ENDURANCE. MAVLink defines
   NAV_LOITER_TIME param1 as "Loiter time (only starts once Lat, Lon and
   Alt is reached)", so the clock excludes the climb and says nothing
   about the descent, while the computed endurance covers the whole time
   the pack is delivering hover power. Asking for the full endurance
   would schedule a landing that begins after the energy budget has run
   out. The caller declares the fraction; the default leaves a quarter of
   the budget unspent and the file states what it is reserving for. */
export const DEFAULT_TEST_FRACTION = 0.75;

export function hoverTestMission(ctx, {
  homeLat, homeLon, homeAltAmslM = 0, altitudeM = null, testFraction = DEFAULT_TEST_FRACTION,
} = {}) {
  if (!Number.isFinite(homeLat) || !Number.isFinite(homeLon))
    throw new Error("a home position is required: it is declared, not computed");
  if (!(testFraction > 0 && testFraction <= 1))
    throw new Error("testFraction must be in (0, 1]");

  const alt = altitudeM ?? (ctx.altitudeM > 0 ? ctx.altitudeM : 10);
  const loiterS = Math.round(ctx.enduranceMin * 60 * testFraction);

  const items = [
    { command: MAV_CMD.NAV_TAKEOFF, params: [0, 0, 0, null, homeLat, homeLon, alt],
      label: `climb to ${alt} m above home` },
    { command: MAV_CMD.NAV_LOITER_TIME, params: [loiterS, 0, 0, null, homeLat, homeLon, alt],
      label: `hover ${loiterS} s = ${(100 * testFraction).toFixed(0)} % of the computed `
        + `${ctx.enduranceMin.toFixed(1)} min` },
    { command: MAV_CMD.NAV_LAND, params: [0, 0, 0, null, homeLat, homeLon, 0],
      label: `land at home` },
  ];
  return {
    items, alt, loiterS, testFraction,
    homeLat, homeLon, homeAltAmslM,
    enduranceMin: ctx.enduranceMin,
    reserveMin: ctx.enduranceMin * (1 - testFraction),
  };
}

/* QGC WPL 110: 12 TAB-separated columns. The official example on
   mavlink.io has latitude and longitude swapped relative to its own
   column header (it puts 8.548 in the LATITUDE column for Zurich, which
   is at 47.376 N). The header is followed here, not the example. */
export function formatWaypoints(mission) {
  const L = ["QGC WPL 110"];
  mission.items.forEach((it, i) => {
    const [p1, p2, p3, p4, lat, lon, alt] = it.params;
    L.push([
      i, i === 0 ? 1 : 0, MAV_FRAME_GLOBAL_RELATIVE_ALT, it.command,
      formatValue(p1 ?? 0), formatValue(p2 ?? 0), formatValue(p3 ?? 0), formatValue(p4 ?? 0),
      formatValue(lat, 8), formatValue(lon, 8), formatValue(alt),
      1,
    ].join("\t"));
  });
  return L.join("\n") + "\n";
}

/* QGC .plan JSON. SimpleItem only: the complex items (Survey,
   CorridorScan, StructureScan) have fields the official document itself
   marks "?", so they are not emitted. */
export function formatPlan(ctx, mission, { firmware = "ardupilot" } = {}) {
  const vt = MAV_TYPE_BY_ROTORS[ctx.rotors];
  if (!vt) throw new Error(`no MAV_TYPE is defined for a ${ctx.rotors}-rotor vehicle`);
  const plan = {
    fileType: "Plan",
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: "eVTOL Sizer",
    mission: {
      cruiseSpeed: 15,
      firmwareType: MAV_AUTOPILOT[firmware],
      globalPlanAltitudeMode: 1,
      hoverSpeed: 5,
      items: mission.items.map((it, i) => ({
        AMSLAltAboveTerrain: null,
        Altitude: it.params[6],
        AltitudeMode: 1,
        autoContinue: true,
        command: it.command,
        doJumpId: i + 1,
        frame: MAV_FRAME_GLOBAL_RELATIVE_ALT,
        params: it.params,
        type: "SimpleItem",
      })),
      plannedHomePosition: [mission.homeLat, mission.homeLon, mission.homeAltAmslM],
      vehicleType: vt.id,
      version: 2,
    },
    rallyPoints: { points: [], version: 2 },
    version: 1,
  };
  return JSON.stringify(plan, null, 4) + "\n";
}
