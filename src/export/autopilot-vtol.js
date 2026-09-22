/* =====================================================================
   VTOL AUTOPILOT EXPORT — a hybrid VTOL's parameters, and the ones its
   size puts out of reach
   =====================================================================
   The drone half of this tool exports Copter parameters for a multirotor
   it sized from measured data. This is the other half: an aircraft with a
   WING, exported as an ArduPilot QuadPlane and as a PX4 VTOL.

   WHY IT IS DRIVEN FROM THE AIRCRAFT ENGINE AND NOT THE DRONE ENGINE.
   Every VTOL parameter that matters is an AIRSPEED — the transition
   speed, the fixed-wing floor, the stall speed, the cruise trim. The
   drone engine sizes multirotors from thrust-stand data and computes no
   airspeed at all: it has no wing, no stall and no cruise. Exporting a
   transition airspeed from it would mean inventing one. The aircraft
   engine computes Vstall, VA, VD and a cruise speed, so that is what
   feeds this.

   ── THE FINDING THAT SHAPES THIS WHOLE MODULE ────────────────────────
   THE AUTOPILOTS' VTOL PARAMETERS ARE SCOPED TO SMALL UAVs, AND THIS
   ENGINE SIZES AIRCRAFT. PX4's VT_ARSP_TRANS — the airspeed at which it
   switches to fixed wing — is published with a range of 0 to 30 m/s. A
   lift+cruise sized here stalls at about 41 m/s and transitions near 49.
   The parameter cannot hold the number. ArduPilot's Q_M_BAT_VOLT_MAX is
   published 6 to 53 V and these packs run to 800 V.

   So a range is not a formatting detail here, it is the result. Every
   value is checked against the PUBLISHED range before it is emitted, and
   one that does not fit is REFUSED BY NAME with the number that did not
   fit. Clamping it would produce a file that loads cleanly and describes
   a different aircraft.

   ── ARDUPILOT'S OWN GUIDANCE CAN CONTRADICT ITSELF AT THIS SIZE ──────
   AIRSPEED_MIN is documented as "20% higher than level flight stall
   speed". AIRSPEED_MAX is documented as BOTH "slightly less than level
   flight speed at THR_MAX" AND "at least 50% above AIRSPEED_MIN". For a
   design whose dive speed is less than 1.8x its stall speed those two
   cannot both hold, and this engine produces such designs. The exporter
   detects it, emits the value that follows from the aircraft, and says
   which half of the guidance it could not satisfy.

   ── WHAT THE TWO ECOSYSTEMS DO NOT SHARE ─────────────────────────────
   Not naming differences — different quantities:

     transition speed  PX4 VT_ARSP_TRANS is the CRITERION. ArduPilot has
                       no such parameter: AIRSPEED_MIN is the fixed-wing
                       floor and Q_ASSIST_SPEED is an ASSIST threshold,
                       documented as "3 m/s below the minimum airspeed you
                       will fly at" (5 without an airspeed sensor).
     transition time   PX4 VT_F_TRANS_DUR is the WHOLE front transition.
                       ArduPilot Q_TRANSITION_MS is explicitly the time
                       AFTER minimum airspeed is reached — a tail period.
                       They must not be cross-converted 1:1.
     back transition   PX4 VT_B_TRANS_DUR is a DURATION in seconds.
                       ArduPilot Q_TRANS_DECEL is a DECELERATION in m/s^2
                       used for stopping distance. Different physical
                       quantities entirely.
     weight            PX4 scales VT_F_TRANS_THR by sqrt(WEIGHT_GROSS /
                       WEIGHT_BASE). ArduPilot has no weight parameter, so
                       there is no equivalent behaviour to emit.

   Sources: ArduPilot Plane complete parameter list; PX4 parameter
   reference and VTOL airframe catalogue; research note S8 in
   Archives/drone-literature-20260921/autopilot-integration/FINDINGS.md.
   ===================================================================== */
import { MAV_PARAM_TYPE } from "./autopilot-format.js";

/* ── published ranges ──────────────────────────────────────────────────
   Quoted from the two parameter references. A value outside one of these
   is not emitted. `null` means the reference states no bound. */
export const RANGES = Object.freeze({
  AIRSPEED_MIN:      { min: 5, max: 100, unit: "m/s" },
  AIRSPEED_MAX:      { min: 5, max: 100, unit: "m/s" },
  AIRSPEED_CRUISE:   { min: null, max: null, unit: "m/s" },
  Q_ASSIST_SPEED:    { min: 0, max: 100, unit: "m/s" },
  Q_ASSIST_ANGLE:    { min: 0, max: 90, unit: "deg" },
  Q_TRANSITION_MS:   { min: 500, max: 30000, unit: "ms" },
  Q_TRANS_DECEL:     { min: 0.2, max: 5, unit: "m/s^2" },
  Q_TILT_MAX:        { min: 20, max: 80, unit: "deg" },
  Q_M_BAT_VOLT_MAX:  { min: 6, max: 53, unit: "V" },
  Q_M_BAT_VOLT_MIN:  { min: 6, max: 42, unit: "V" },
  VT_ARSP_TRANS:     { min: 0, max: 30, unit: "m/s" },
  VT_ARSP_BLEND:     { min: 0, max: 30, unit: "m/s" },
  VT_F_TRANS_DUR:    { min: 0.1, max: 20, unit: "s" },
  VT_B_TRANS_DUR:    { min: 0.1, max: 20, unit: "s" },
  VT_TRANS_TIMEOUT:  { min: 0.1, max: 30, unit: "s" },
  VT_F_TRANS_THR:    { min: 0, max: 1, unit: "norm" },
  FW_AIRSPD_STALL:   { min: null, max: null, unit: "m/s" },
  FW_AIRSPD_MIN:     { min: null, max: null, unit: "m/s" },
  FW_AIRSPD_TRIM:    { min: null, max: null, unit: "m/s" },
  MPC_XY_VEL_MAX:    { min: 0, max: 20, unit: "m/s" },
  WEIGHT_BASE:       { min: null, max: null, unit: "kg" },
  WEIGHT_GROSS:      { min: null, max: null, unit: "kg" },
});

export function withinRange(name, value) {
  const r = RANGES[name];
  if (!r) return { ok: true };
  if (!Number.isFinite(value)) return { ok: false, why: "not a finite number" };
  if (r.min != null && value < r.min)
    return { ok: false, why: `${round(value)} ${r.unit} is below the published minimum of ${r.min}` };
  if (r.max != null && value > r.max)
    return { ok: false, why: `${round(value)} ${r.unit} is above the published maximum of ${r.max}` };
  return { ok: true };
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/* ── configuration -> what the autopilots call it ──────────────────────
   The engine's configurations are defined in engine/configuration.js by
   what actually moves: whether the lift rotors stop, whether any tilt,
   and whether there is a separate cruise propulsor. That is exactly the
   distinction VT_TYPE encodes, so the mapping is by mechanism rather
   than by name. Where PX4's catalogue has no entry, that is recorded as
   a gap and nothing is emitted, because SYS_AUTOSTART selects a whole
   airframe script and a neighbouring one is a different aircraft. */
export const VTOL_CONFIG = Object.freeze({
  liftcruise: {
    vtolKind: "standard",
    px4: { VT_TYPE: 2, SYS_AUTOSTART: 13000, airframe: "Generic Standard VTOL" },
    mavType: { id: 22, name: "MAV_TYPE_VTOL_FIXEDROTOR" },
    tilts: false,
    why: "lift rotors stop and a separate propulsor drives cruise, which is what PX4 calls a "
       + "Standard VTOL and ArduPilot calls a QuadPlane",
  },
  tiltrotor: {
    vtolKind: "tiltrotor",
    px4: { VT_TYPE: 1, SYS_AUTOSTART: 13100, airframe: "Generic Tiltrotor VTOL" },
    mavType: { id: 21, name: "MAV_TYPE_VTOL_TILTROTOR" },
    tilts: true,
    why: "the rotors ARE the cruise propulsors and none stop",
  },
  hybrid: {
    vtolKind: "tilt-and-lift",
    px4: null,
    mavType: { id: 21, name: "MAV_TYPE_VTOL_TILTROTOR" },
    tilts: true,
    why: "some rotors tilt for cruise while the rest stop, with no separate pusher",
    px4Gap: "PX4's catalogue has Tailsitter, Tiltrotor and Standard VTOL. It has no generic airframe "
          + "for a vehicle that both tilts SOME rotors and stops the others; picking Tiltrotor would "
          + "tell the autopilot that every rotor tilts, and picking Standard would tell it that none do.",
  },
  hybridPusher: {
    vtolKind: "tilt-lift-and-pusher",
    px4: null,
    mavType: { id: 22, name: "MAV_TYPE_VTOL_FIXEDROTOR" },
    tilts: true,
    why: "tip rotors tilt and run alongside a pusher while the boom rotors stop",
    px4Gap: "no generic PX4 airframe combines tilting rotors, stopped lift rotors and a pusher. "
          + "Cruise thrust here is SHARED between the tilting rotors and the pusher, which no single "
          + "VT_TYPE describes.",
  },
});

/* ArduPilot Q_FRAME_CLASS, for the multicopter component of a QuadPlane.
   Same enumeration as Copter's FRAME_CLASS. */
export const Q_FRAME_CLASS_BY_ROTORS = Object.freeze({
  4: { id: 1, name: "Quad" }, 6: { id: 2, name: "Hexa" }, 8: { id: 3, name: "Octa" },
  10: { id: 14, name: "Deca" }, 12: { id: 12, name: "DodecaHexa" },
});

/* ── the context a caller assembles ───────────────────────────────── */
export function vtolContext({ configType, sizing, inputs }) {
  const cfg = VTOL_CONFIG[configType];
  if (!cfg)
    throw new Error(`${configType} is not a hybrid VTOL: it has no wing, so it has no stall speed, `
      + `no transition and no fixed-wing mode. A multirotor is exported by the drone half of this tool.`);
  if (!sizing) throw new Error("no sizing result");
  const vStall = Number(sizing.Vstall);
  if (!Number.isFinite(vStall) || vStall <= 0)
    throw new Error("the sizing run produced no stall speed, so no airspeed parameter can be derived");

  return Object.freeze({
    configType, cfg,
    rotors: Math.round(inputs?.nPropHover ?? 0),
    massKg: Number(sizing.MTOW),
    vStall, VA: Number(sizing.VA), VD: Number(sizing.VD),
    vCruise: Number(inputs?.vCruise ?? sizing.VA),
    cellsSeries: Math.round(sizing.Nseries ?? 0),
    packV: Number(sizing.PackV ?? 0),
    /* ArduPilot's published margin, used as the transition criterion
       because PX4 publishes no margin rule of its own — its default of
       10 m/s is an absolute number unrelated to the aircraft. */
    vMin: 1.2 * vStall,
    vTransition: 1.2 * vStall,
  });
}

/* ── ArduPilot QuadPlane ─────────────────────────────────────────── */
export function quadPlaneParameters(ctx) {
  const params = [], refusals = [], notes = [];
  const push = (name, value, why) => {
    const r = withinRange(name, value);
    if (r.ok) params.push({ name, value: typeof value === "number" ? round(value) : value, why });
    else refusals.push({ name, why: `${r.why}. ${why}` });
  };

  push("Q_ENABLE", 1, `enables the multicopter component. Reboot required.`);

  const fc = Q_FRAME_CLASS_BY_ROTORS[ctx.rotors];
  if (fc) push("Q_FRAME_CLASS", fc.id, `${fc.name} — ${ctx.rotors} hover rotors. Reboot required.`);
  else refusals.push({ name: "Q_FRAME_CLASS",
    why: `no documented frame class for ${ctx.rotors} hover rotors; the enumeration covers 4, 6, 8, 10 and 12` });
  refusals.push({ name: "Q_FRAME_TYPE",
    why: `the motor LAYOUT is not a sizing output. This engine sizes rotor count, diameter and thrust; `
       + `which azimuth each motor sits at, and therefore the mixing, is a configuration choice. `
       + `Guessing X would silently set the mixer.` });

  /* airspeeds — the reason this is driven from the aircraft engine */
  push("AIRSPEED_MIN", ctx.vMin,
    `20 % above the computed ${round(ctx.vStall)} m/s stall speed, which is ArduPilot's own published rule`);
  push("AIRSPEED_CRUISE", ctx.vCruise, `the cruise speed this aircraft was sized at`);

  /* AIRSPEED_MAX carries the contradiction */
  const needed = 1.5 * ctx.vMin;
  const maxCandidate = ctx.VD;
  if (Number.isFinite(maxCandidate)) {
    push("AIRSPEED_MAX", maxCandidate,
      `the computed dive speed VD. ArduPilot asks for "slightly less than level flight speed at THR_MAX" `
      + `AND "at least 50% above AIRSPEED_MIN"`);
    if (maxCandidate < needed)
      notes.push(
        `AIRSPEED_MAX is documented as BOTH "slightly less than level flight speed at THR_MAX" and `
        + `"at least 50% above AIRSPEED_MIN to allow for accurate TECS altitude control". This aircraft `
        + `cannot satisfy both: AIRSPEED_MIN is ${round(ctx.vMin)} m/s so the second rule asks for `
        + `${round(needed)} m/s, while the computed dive speed is ${round(maxCandidate)} m/s. The value `
        + `emitted follows the AIRCRAFT. The gap is ${round(needed - maxCandidate)} m/s, and TECS `
        + `altitude control is the thing the documentation says it costs.`);
  }

  /* Q_ASSIST_SPEED is an ASSIST threshold, not a transition speed */
  push("Q_ASSIST_SPEED", ctx.vMin - 3,
    `3 m/s below AIRSPEED_MIN, as the parameter's own description instructs for an aircraft WITH an `
    + `airspeed sensor. Without one the documented figure is 5 m/s below. This is an ASSIST threshold `
    + `and NOT a transition airspeed — ArduPilot has no transition-airspeed parameter.`);

  /* battery — where the aircraft's size usually ends the conversation */
  if (ctx.cellsSeries > 0) {
    push("Q_M_BAT_VOLT_MAX", 4.2 * ctx.cellsSeries,
      `4.2 V per cell times the ${ctx.cellsSeries} cells in series, which is the rule the parameter's `
      + `own description gives`);
    push("Q_M_BAT_VOLT_MIN", 3.3 * ctx.cellsSeries,
      `3.3 V per cell times ${ctx.cellsSeries} in series, as the description gives`);
  }

  refusals.push({ name: "Q_TRANSITION_MS",
    why: `this is the time AFTER minimum airspeed is reached, not the duration of the transition. `
       + `Nothing in this sizing run computes how long the aircraft takes to settle once it is already `
       + `at AIRSPEED_MIN, so the value would be invented.` });
  refusals.push({ name: "Q_TRANS_DECEL",
    why: `a back-transition deceleration in m/s^2, used to compute stopping distance. This engine does `
       + `not compute a deceleration profile.` });
  refusals.push({ name: "Q_M_THST_HOVER",
    why: `the same refusal the multirotor exporter makes: ArduPilot's setup guidance is to set the hover `
       + `throttle AT OR BELOW the real value and let it be learned in flight, so writing a computed `
       + `figure in would remove the margin the documentation asks for.` });
  refusals.push({ name: "a vehicle mass parameter",
    why: `ArduPilot has no parameter that takes a mass, in Copter or in Plane. This aircraft's `
       + `${round(ctx.massKg, 0)} kg has nowhere to go. PX4 takes it directly.` });

  if (ctx.cfg.tilts) {
    refusals.push({ name: "Q_TILT_MASK / Q_TILT_TYPE / Q_TILT_MAX",
      why: `this configuration tilts some of its rotors, but WHICH OUTPUTS tilt is a wiring choice and `
         + `not a sizing output, and Q_TILT_MASK is a bitmask of exactly those outputs. Q_TILT_TYPE `
         + `(continuous, binary, vectored yaw) is likewise a mechanism this tool does not select.` });
    notes.push(
      `This is a ${ctx.cfg.vtolKind} configuration — ${ctx.cfg.why}. The tilt parameters are left for `
      + `you to set, because the sizing run knows how many rotors tilt but not which outputs they are.`);
  }

  return { params, refusals, notes };
}

/* ── PX4 VTOL ────────────────────────────────────────────────────── */
export function px4VtolParameters(ctx) {
  const params = [], refusals = [], notes = [];
  const push = (name, value, type, why) => {
    const r = withinRange(name, value);
    if (r.ok) params.push({ name, value: typeof value === "number" ? round(value) : value, type, why });
    else refusals.push({ name, why: `${r.why}. ${why}` });
  };

  if (ctx.cfg.px4) {
    push("SYS_AUTOSTART", ctx.cfg.px4.SYS_AUTOSTART, MAV_PARAM_TYPE.INT32,
      `"${ctx.cfg.px4.airframe}". Reboot required.`);
    push("VT_TYPE", ctx.cfg.px4.VT_TYPE, MAV_PARAM_TYPE.INT32,
      `${ctx.cfg.vtolKind}: ${ctx.cfg.why}. Reboot required.`);
  } else {
    refusals.push({ name: "SYS_AUTOSTART / VT_TYPE", why: ctx.cfg.px4Gap });
  }

  /* the airspeeds, and the range that usually stops them */
  push("FW_AIRSPD_STALL", ctx.vStall, MAV_PARAM_TYPE.REAL32,
    `the computed stall speed`);
  push("FW_AIRSPD_MIN", ctx.vMin, MAV_PARAM_TYPE.REAL32,
    `20 % above stall. PX4 asks for "some margin between the stall speed and minimum airspeed" without `
    + `naming one, so ArduPilot's published 20 % is used and said so.`);
  push("FW_AIRSPD_TRIM", ctx.vCruise, MAV_PARAM_TYPE.REAL32,
    `the cruise speed this aircraft was sized at`);

  push("VT_ARSP_TRANS", ctx.vTransition, MAV_PARAM_TYPE.REAL32,
    `the airspeed at which PX4 switches to fixed wing, taken as 20 % above the computed stall speed`);
  push("VT_ARSP_BLEND", 0.8 * ctx.vTransition, MAV_PARAM_TYPE.REAL32,
    `0.8 of the transition airspeed, the ratio PX4's own defaults carry (8 against 10)`);

  if (Number.isFinite(ctx.massKg) && ctx.massKg > 0) {
    push("WEIGHT_BASE", ctx.massKg, MAV_PARAM_TYPE.REAL32,
      `the sized all-up mass. WEIGHT_BASE and WEIGHT_GROSS are the only parameters in either ecosystem `
      + `that take a mass in kilograms, and PX4 scales VT_F_TRANS_THR by the square root of their ratio.`);
    push("WEIGHT_GROSS", ctx.massKg, MAV_PARAM_TYPE.REAL32,
      `equal to WEIGHT_BASE for the as-sized aircraft; raise it when payload is added`);
  }

  refusals.push({ name: "VT_F_TRANS_DUR",
    why: `the duration of the WHOLE front transition. It is not ArduPilot's Q_TRANSITION_MS, which is `
       + `the time after minimum airspeed is reached, so it cannot be carried across from one. Nothing `
       + `here computes a transition duration.` });
  refusals.push({ name: "VT_B_TRANS_DUR",
    why: `a back-transition DURATION in seconds. ArduPilot's Q_TRANS_DECEL is a DECELERATION in m/s^2 — `
       + `a different physical quantity — so even a computed deceleration would need integrating against `
       + `a trajectory this engine does not produce.` });
  refusals.push({ name: "VT_F_TRANS_THR",
    why: `a transition throttle fraction. PX4 scales it by sqrt(WEIGHT_GROSS / WEIGHT_BASE) itself, and `
       + `this run computes no transition throttle to seed it with.` });
  refusals.push({ name: "BAT1_V_CHARGED / BAT1_V_EMPTY / BAT1_N_CELLS",
    why: `the aircraft engine sizes the pack by energy and voltage, not by a catalogue cell, so there is `
       + `no published per-cell datasheet behind it to quote. The drone half emits these because it `
       + `selects a real cell.` });

  if (ctx.packV > 60)
    notes.push(
      `This pack runs at about ${round(ctx.packV, 0)} V across ${ctx.cellsSeries} cells in series. `
      + `ArduPilot's battery-compensation parameters are published with ranges of 6 to 53 V and 6 to 42 V, `
      + `so they cannot hold it — which is why they are refused above rather than clamped. The autopilots' `
      + `battery parameters were scoped to hobby and small-UAV packs.`);

  return { params, refusals, notes };
}

/* The header lines both files carry. */
export function vtolHeader(ctx) {
  return [
    `generated by eVTOL Sizer for a ${ctx.configType} (${ctx.cfg.vtolKind}) at `
      + `${round(ctx.massKg, 0)} kg all-up`,
    `${ctx.rotors} hover rotors · stall ${round(ctx.vStall)} m/s · transition `
      + `${round(ctx.vTransition)} m/s · cruise ${round(ctx.vCruise)} m/s`,
    `THE AUTOPILOTS' VTOL PARAMETERS ARE SCOPED TO SMALL UAVs. Anything this aircraft's size puts `
      + `outside a published range is refused below by name, with the number that did not fit.`,
  ];
}
