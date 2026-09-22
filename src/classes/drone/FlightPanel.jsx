/* =====================================================================
   FLIGHT — the integrated trajectory, played back
   =====================================================================
   The airframe tab draws a stationary aircraft with its rotors turning.
   This one flies it: every frame of this animation is a state the 6-DOF
   integrator produced, played back at the rate it was computed.

   NOTHING HERE IS KEYFRAMED. The path, the attitude and the per-rotor
   thrusts are read out of the simulation trace. If the aircraft tumbles,
   it is because the equations tumbled it. The scrubber moves through
   computed states, not through a drawn animation, which is why the
   traces underneath stay locked to the picture.

   WHAT THE PICTURE CANNOT TELL YOU, and the panel says so beside it: a
   scenario that flies proves nothing about controllability. The
   hexacopter in the failure case below flies every scenario offered here
   with a rotor dead, while half of all moment directions are
   unattainable to it. That is on the Airframe tab, measured by ACAI, and
   it is not visible in any trajectory.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Legend,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import { buildAirframe, DEG } from "./geometry3d.js";
import {
  buildModel, simulate, DECLARED_DYNAMICS_INPUTS, ARDUPILOT_GAINS,
  makeScenario, SCENARIO_PRESETS, SCENARIO_LIMITS, tiltAccelerationMps2,
  qRotate, eulerToQ,
} from "./dynamics.js";
import { DEFAULT_SCENE, firstContact, DECLARED_IMPACT_INPUTS } from "./obstacles.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));

/* THE VIEWPORT IS AN INSTRUMENT CANVAS AND STAYS DARK IN BOTH THEMES, so
   every colour INSIDE it is fixed rather than a theme token — a token
   flips with the theme and puts dark ink on this dark ground. Same rule
   and same constants as the airframe view. */
const VIEW = Object.freeze({
  text: "#C8D8E8",
  muted: "#7F97A8",
  amber: "#E8A020",
  hub: "#16202C",
});

/* A preset is a STARTING POINT, not the menu. Opening one fills the
   editor with its segments; from there it is the user's scenario. */
function presetToState(p) {
  const d = (rad) => +((rad ?? 0) * 180 / Math.PI).toFixed(3);
  return {
    label: p.label,
    startAltitudeM: p.startAltitudeM,
    initialRollDeg: d(p.initialAttitude?.rollRad),
    initialPitchDeg: d(p.initialAttitude?.pitchRad),
    initialYawDeg: d(p.initialAttitude?.yawRad),
    segments: p.segments.map((s) => ({
      durationS: s.durationS, rollDeg: s.rollDeg ?? 0, pitchDeg: s.pitchDeg ?? 0,
      yawDeg: s.yawDeg ?? 0, altitudeM: s.altitudeM, altitudeRateMps: s.altitudeRateMps ?? "",
    })),
  };
}

/* World -> screen. Orthographic, z DOWN, so a positive z is lower on
   screen. The camera orbits the FOLLOW POINT rather than the origin, so
   the aircraft stays in frame as it moves. */
function makeView({ yaw, pitch, scale, cx, cy, follow }) {
  const cy_ = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  return (p) => {
    const x = p[0] - follow[0], y = p[1] - follow[1], z = p[2] - follow[2];
    const X = x * cy_ - y * sy, Y = x * sy + y * cy_;
    return {
      sx: cx + scale * Y,
      sy: cy + scale * (z * cp - X * sp),
      depth: X * cp + z * sp,
    };
  };
}

export default function FlightPanel({ design, frame }) {
  const { built, result, ok, v } = design;
  const [preset, setPreset] = useState("disturbance");
  const [scen, setScen] = useState(() => presetToState(SCENARIO_PRESETS.disturbance));
  const [editing, setEditing] = useState(false);
  const lastGoodScenario = useRef(null);
  /* A SET, BECAUSE THE SIMULATION ALWAYS TOOK ONE. simulate() accepts
     `failed` as a Set and zeroes eta on every motor in it, so multiple
     simultaneous failures were supported from the start; the UI was a
     single <select> and could only ever express one. Clicking a rotor
     in the viewport toggles it, which is also the only way to ask for
     the two-motor cases the controllability work is about. */
  const [failedMotors, setFailedMotors] = useState(() => new Set());
  const failedKey = [...failedMotors].sort((a, b) => a - b).join(",");
  const toggleMotor = (m) => setFailedMotors((prev) => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });
  /* ── FLYING IT BY HAND ────────────────────────────────────────────
     A press does NOT nudge the drawn aircraft. It appends a segment to
     the scenario and the whole flight is integrated again, so the panel's
     one guarantee holds: every frame on screen is still a state the
     6-DOF integrator produced. That is also why a command cannot be
     undone mid-flight - there is no "now" to steer from, only a scenario
     that is re-flown from t=0.

     THE SIGNS ARE MEASURED, NOT ASSUMED. Running the integrator at a
     held tilt gives, on the default quad from 5 m:

        pitch +15 deg  ->  x = -19.56 m      (nose UP, thrust tilts aft)
        pitch -15 deg  ->  x = +19.56 m
        roll  +15 deg  ->  y = +19.56 m      (right wing down, goes right)

     so FORWARD is a NEGATIVE pitch command. Labelling the buttons from
     the sign convention rather than from the measurement is how a
     "forward" button ends up flying backwards.

     Commands are RELATIVE to the last segment, which is what a pilot
     expects: pressing forward twice doubles the tilt rather than
     re-issuing it. maxSegments (12) is a validated scenario limit, so
     the pad disables itself at the cap instead of building a scenario
     makeScenario would reject. */
  const STEP_DEG = 10, STEP_YAW_DEG = 45, STEP_ALT_M = 1, STEP_S = 1;
  const padFull = scen.segments.length >= SCENARIO_LIMITS.maxSegments;
  const clampTilt = (d) => Math.max(-SCENARIO_LIMITS.maxTiltDeg,
                                    Math.min(SCENARIO_LIMITS.maxTiltDeg, d));
  const command = (mut) => setScen((st) => {
    if (st.segments.length >= SCENARIO_LIMITS.maxSegments) return st;
    const last = st.segments[st.segments.length - 1] ?? {};
    const base = {
      durationS: STEP_S,
      rollDeg: Number(last.rollDeg) || 0,
      pitchDeg: Number(last.pitchDeg) || 0,
      yawDeg: Number(last.yawDeg) || 0,
      altitudeM: Number(last.altitudeM) || Number(st.startAltitudeM) || 2,
      altitudeRateMps: "",
    };
    return { ...st, label: "Flown by hand", segments: [...st.segments, mut(base)] };
  });
  const CONTROLS = [
    { k: "fwd",  glyph: "▲", title: `forward — pitch ${-STEP_DEG}° for ${STEP_S}s (nose down)`,
      go: () => command((b) => ({ ...b, pitchDeg: clampTilt(b.pitchDeg - STEP_DEG) })) },
    { k: "back", glyph: "▼", title: `backward — pitch +${STEP_DEG}° for ${STEP_S}s`,
      go: () => command((b) => ({ ...b, pitchDeg: clampTilt(b.pitchDeg + STEP_DEG) })) },
    { k: "left", glyph: "◀", title: `left — roll ${-STEP_DEG}° for ${STEP_S}s`,
      go: () => command((b) => ({ ...b, rollDeg: clampTilt(b.rollDeg - STEP_DEG) })) },
    { k: "right",glyph: "▶", title: `right — roll +${STEP_DEG}° for ${STEP_S}s`,
      go: () => command((b) => ({ ...b, rollDeg: clampTilt(b.rollDeg + STEP_DEG) })) },
    { k: "yawL", glyph: "↺", title: `yaw left ${STEP_YAW_DEG}°`,
      go: () => command((b) => ({ ...b, yawDeg: b.yawDeg - STEP_YAW_DEG })) },
    { k: "yawR", glyph: "↻", title: `yaw right ${STEP_YAW_DEG}°`,
      go: () => command((b) => ({ ...b, yawDeg: b.yawDeg + STEP_YAW_DEG })) },
    { k: "up",   glyph: "↑", title: `climb ${STEP_ALT_M} m`,
      go: () => command((b) => ({ ...b, altitudeM: Math.min(SCENARIO_LIMITS.maxAltitudeM, b.altitudeM + STEP_ALT_M) })) },
    { k: "down", glyph: "↓", title: `descend ${STEP_ALT_M} m`,
      go: () => command((b) => ({ ...b, altitudeM: Math.max(0, b.altitudeM - STEP_ALT_M) })) },
    { k: "level",glyph: "⌂", title: "level — roll and pitch to zero, heading and altitude held",
      go: () => command((b) => ({ ...b, rollDeg: 0, pitchDeg: 0 })) },
  ];

  const [motorTau, setMotorTau] = useState(0.05);
  const [cd, setCd] = useState(1.0);
  const [view, setView] = useState({ yaw: 38, pitch: 26 });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(2.4);
  const [camera, setCamera] = useState("auto");
  /* Obstacles are scene furniture, so they are opt-out: a reader who
     wants the bare trajectory can have it, and nothing the sizing loop
     computes depends on them. */
  const [scenery, setScenery] = useState(true);
  /* DECLARED, not sourced — the same status bodyDragCoefficient carries.
     Exposed so the reader can move them and see that the response is
     theirs, rather than a number this tool is pretending to know. */
  const [bounce, setBounce] = useState(true);
  const [restitution, setRestitution] = useState(DECLARED_IMPACT_INPUTS.restitution.value);
  const [breakSpeed, setBreakSpeed] = useState(DECLARED_IMPACT_INPUTS.bladeBreakSpeedMps.value);
  const drag = useRef(null);

  const airframe = useMemo(() => {
    if (!ok) return null;
    try {
      return buildAirframe({
        frame, propellerDiameterM: built.propeller.diameterM, tipGapFraction: 0.10,
      });
    } catch { return null; }
  }, [ok, frame, built.propeller]);

  /* The scenario the user is describing. A half-typed number is not an
     error worth blanking the view for, so an invalid edit keeps flying
     the last valid scenario and shows what is wrong. */
  const scenarioBuild = useMemo(() => {
    try {
      return { ok: makeScenario({
        label: scen.label,
        startAltitudeM: Number(scen.startAltitudeM),
        initialAttitude: {
          rollRad: (Number(scen.initialRollDeg) || 0) * DEG,
          pitchRad: (Number(scen.initialPitchDeg) || 0) * DEG,
          yawRad: (Number(scen.initialYawDeg) || 0) * DEG,
        },
        segments: scen.segments,
      }) };
    } catch (e) { return { error: e.message }; }
  }, [scen]);

  useEffect(() => {
    if (scenarioBuild.ok) lastGoodScenario.current = scenarioBuild.ok;
  }, [scenarioBuild]);
  const scenario = scenarioBuild.ok ?? lastGoodScenario.current
    ?? makeScenario(SCENARIO_PRESETS.hover);

  const sim = useMemo(() => {
    if (!ok || !airframe) return null;
    try {
      const model = buildModel({
        sizing: result, airframe,
        declared: { motorTimeConstantS: motorTau, bodyDragCoefficient: cd },
      });
      const failed = new Set(failedMotors);
      return {
        model,
        run: simulate({
          model, scenario,
          declared: { motorTimeConstantS: motorTau, bodyDragCoefficient: cd },
          durationS: scenario.totalDurationS, failed,
          obstacles: scenery ? DEFAULT_SCENE : [],
          impact: scenery && bounce ? {
            restitution,
            tangentialScrub: DECLARED_IMPACT_INPUTS.tangentialScrub.value,
            bladeBreakSpeedMps: breakSpeed,
          } : null,
        }),
      };
    } catch (e) { return { error: e.message }; }
  }, [ok, airframe, result, scenario, failedKey, motorTau, cd, scenery, bounce, restitution, breakSpeed]);

  /* THE FLIGHT ENDS AT THE FIRST STRIKE.

     Detection runs over the finished trace rather than inside the
     integrator, so the validated 6-DOF loop is untouched: the aircraft
     is flown exactly as before and the trace is then cut at the contact.
     Cutting is equivalent to stopping, because nothing after the strike
     is modelled - the same treatment simulate() already gives the
     ground, where it breaks on the zero crossing and reports `crashed`
     rather than modelling the landing. */
  const fullTrace = sim?.run?.trace ?? [];
  const strike = useMemo(
    () => (scenery && airframe ? firstContact(fullTrace, DEFAULT_SCENE, airframe.spanM / 2) : null),
    [fullTrace, scenery, airframe]);
  /* With an impact response declared the INTEGRATOR resolves contact and
     keeps flying, so the trace is already correct and must not be cut.
     Cutting is only right when nothing after the strike is modelled. */
  const trace = (!bounce && strike) ? fullTrace.slice(0, Math.max(2, strike.index + 1)) : fullTrace;
  useEffect(() => { setI(0); }, [scenario, failedKey, motorTau, cd, scenery, bounce, restitution, breakSpeed]);

  useEffect(() => {
    if (!playing || trace.length < 2) return;
    let raf, last = performance.now(), acc = 0;
    const step = (t) => {
      const dt = (t - last) / 1000; last = t;
      acc += dt * speed;
      const sampleDt = trace[1].t - trace[0].t;
      while (acc >= sampleDt) { acc -= sampleDt; setI((k) => (k + 1) % trace.length); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, trace.length]);

  if (!ok) {
    return <Card title="Flight"><div style={{ fontSize: T.label, color: SC.muted }}>
      The design has not converged, so there is nothing to fly. Fix the Sizing tab first.
    </div></Card>;
  }
  if (sim?.error) {
    return <Card title="Flight"><div style={{ fontSize: T.label, color: SC.muted }}>{sim.error}</div></Card>;
  }

  /* `now` is the state being drawn. The airframe FRAME is a prop, so this
     cannot be called `frame`. */
  const now = trace[Math.min(i, trace.length - 1)] ?? trace[0];
  const W = 760, H = 460;
  const span = airframe.spanM;

  /* FIT THE WHOLE FLIGHT, rather than chasing the aircraft.

     A camera locked to the vehicle's ground track put it 3 m above the
     viewport on the first scenario tried - the aircraft was simply off
     screen. Framing the flight volume instead keeps the trajectory, the
     ground and the aircraft in one picture, which is what makes the
     motion readable. `zoom` then lets a close look happen on demand. */
  const ext = useMemo(() => {
    if (!trace.length) return { cx: 0, cy: 0, cz: 0, world: span * 4 };
    const xs = trace.map((r) => r.x), ys = trace.map((r) => r.y), as = trace.map((r) => r.altitudeM);
    const xMid = (Math.max(...xs) + Math.min(...xs)) / 2;
    const yMid = (Math.max(...ys) + Math.min(...ys)) / 2;
    const aMax = Math.max(...as), aMin = Math.min(...as);
    /* Frame what MOVES, not where the aircraft happens to be. A hover
       recovery at 3 m has almost no translation, so fitting the absolute
       altitude shrank the aircraft to a speck in an empty box; its
       altitude is already on the KPI and the trace. A descent, which
       does change altitude, still gets framed wide by the same rule. */
    const world = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      (aMax - aMin) * 1.3,
      span * 2.1);
    return { cx: xMid, cy: yMid, cz: -(aMax + aMin) / 2, world };
  }, [trace, span]);

  /* FITTING THE FLIGHT STOPS WORKING WHEN THE FLIGHT RUNS AWAY.
     Fit framing is right for a manoeuvre that stays put: a hover, a yaw,
     a roll upset. It is wrong for anything that translates, because this
     simulation closes no position loop — a held 15 deg tilt accelerates
     at g*tan(theta) and covers 91.6 m in ten seconds, so the fit box
     becomes 91.6 m wide and the aircraft renders at 1 % of the frame.
     That is the "zooming out and acting weird": the view was faithfully
     fitting a flight that genuinely flew away.

     So the camera follows the aircraft once fitting would shrink it
     below a readable share of the frame, and the distance travelled
     moves to a readout instead of being expressed as a tiny aircraft. */
  const READABLE_MIN = 0.12;        // aircraft's share of the frame under fit framing
  const FOLLOW_WORLD_SPANS = 3.4;   // how much world a following camera shows
  const fitShare = span / ext.world;
  const mode = camera === "auto" ? (fitShare < READABLE_MIN ? "follow" : "fit") : camera;
  const world = mode === "follow" ? span * FOLLOW_WORLD_SPANS : ext.world;
  const followPt = mode === "follow"
    ? [now.x, now.y, -now.altitudeM]
    : [ext.cx, ext.cy, ext.cz];

  const scale = (Math.min(W, H) * 0.42 * zoom) / world;
  const project = makeView({
    yaw: view.yaw, pitch: view.pitch, scale, cx: W / 2, cy: H * 0.52,
    follow: followPt,
  });
  const gridStep = world > 8 ? 2 : 1;
  /* THE GROUND IS FIXED IN THE WORLD, NOT UNDER THE AIRCRAFT.

     It used to snap: `gridCx = round(now.x / gridStep) * gridStep`, meant
     to keep a continuous floor in follow mode. But the grid is PERIODIC
     and every line was drawn identically, so snapping it to the nearest
     whole square made it translation-invariant — the aircraft drifted up
     to half a square, the whole grid jumped back by one square, and it
     appeared to return to where it started. A 15 deg pitch really does
     accelerate the aircraft at g*tan(theta) and carry it 38.7 m in a
     pulse, and NONE of that was visible: it read as the aircraft wobbling
     back and forth over a floor that never moved.

     So the lattice is now absolute. Lines are drawn at whole multiples of
     gridStep in WORLD coordinates and the visible window slides over them,
     which is what makes travel legible. Every fifth line is heavier and
     CARRIES ITS COORDINATE, because a uniform grid — snapped or not — is
     still ambiguous at its own period: only a number distinguishes 20 m
     from 30 m. */
  const gridHalfSpan = 10 * gridStep;
  const gridAnchorX = Math.round((mode === "follow" ? now.x : ext.cx) / gridStep) * gridStep;
  const gridAnchorY = Math.round((mode === "follow" ? now.y : ext.cy) / gridStep) * gridStep;
  const MAJOR_EVERY = 5;
  const travelledM = trace.length ? Math.hypot(now.x - trace[0].x, now.y - trace[0].y) : 0;

  /* WHAT WAS ASKED FOR AT THIS INSTANT, to sit under what was achieved.
     Walks the scenario's own segments by elapsed time rather than reading
     a controller set-point, so the readout is the commanded scenario and
     not a second copy of the state it produced. */
  const cmdNow = (() => {
    let t = now?.t ?? 0;
    for (const sg of scenario.segments) {
      if (t <= sg.durationS) return sg;
      t -= sg.durationS;
    }
    return scenario.segments[scenario.segments.length - 1] ?? null;
  })();

  /* Where each major grid line's number goes. The line is a segment in
     screen space; this clips it to the viewport (Liang-Barsky on the
     rectangle) and returns the visible end that sits LOWER on screen,
     which under this projection is the end nearest the viewer. A line
     that misses the viewport entirely gets no label rather than a number
     parked against the frame edge pointing at nothing. */
  const gridLabels = (() => {
    const PAD = 14, out = [];
    const clip = (p0, p1) => {
      let t0 = 0, t1 = 1;
      const dx = p1.sx - p0.sx, dy = p1.sy - p0.sy;
      const tests = [[-dx, p0.sx - PAD], [dx, W - PAD - p0.sx], [-dy, p0.sy - PAD], [dy, H - PAD - p0.sy]];
      for (const [p, q] of tests) {
        if (p === 0) { if (q < 0) return null; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
      const at = (t) => ({ sx: p0.sx + t * dx, sy: p0.sy + t * dy });
      return [at(t0), at(t1)];
    };
    for (let k = 0; k <= 20; k++) {
      const off = (k - 10) * gridStep;
      const wx = gridAnchorX + off, wy = gridAnchorY + off;
      if (Math.round(wx / gridStep) % MAJOR_EVERY === 0) {
        const seg = clip(project([wx, gridAnchorY - gridHalfSpan, 0]),
                         project([wx, gridAnchorY + gridHalfSpan, 0]));
        if (seg) {
          const p = seg[0].sy >= seg[1].sy ? seg[0] : seg[1];
          out.push({ key: `gx${k}`, sx: p.sx, sy: p.sy - 4, anchor: "middle", text: `${wx.toFixed(0)}` });
        }
      }
      if (Math.round(wy / gridStep) % MAJOR_EVERY === 0) {
        const seg = clip(project([gridAnchorX - gridHalfSpan, wy, 0]),
                         project([gridAnchorX + gridHalfSpan, wy, 0]));
        if (seg) {
          const p = seg[0].sy >= seg[1].sy ? seg[0] : seg[1];
          out.push({ key: `gy${k}`, sx: p.sx, sy: p.sy - 4, anchor: "middle", text: `${wy.toFixed(0)}` });
        }
      }
    }
    return out;
  })();

  /* The aircraft, at this frame's attitude and position. */
  const q = eulerToQ({
    rollRad: now.rollDeg * DEG, pitchRad: now.pitchDeg * DEG, yawRad: now.yawDeg * DEG,
  });
  const bodyToWorld = (b) => {
    const r = qRotate(q, b);
    return [now.x + r[0], now.y + r[1], -now.altitudeM + r[2]];
  };
  const centre = project(bodyToWorld([0, 0, 0]));
  const rotors = airframe.rotors.map((r, k) => {
    const world = bodyToWorld([r.x, r.y, r.z]);
    const p = project(world);
    const thrust = now.thrusts?.[k] ?? 0;
    const tipTop = project(bodyToWorld([r.x, r.y, r.z - 0.12 - 0.5 * thrust / Math.max(1, sim.model.maxThrustPerRotorN)]));
    return { ...r, p, thrust, tipTop, dead: failedMotors.has(r.motor), depth: p.depth, world };
  }).sort((a, b) => a.depth - b.depth);

  const trail = trace.slice(0, i + 1).filter((_, k) => k % 2 === 0)
    .map((r) => project([r.x, r.y, -r.altitudeM]));
  const shadow = project([now.x, now.y, 0]);

  const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, ...view }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setView({ yaw: drag.current.yaw + (e.clientX - drag.current.x) * 0.5,
              pitch: Math.max(-5, Math.min(85, drag.current.pitch + (e.clientY - drag.current.y) * 0.4)) });
  };
  const onUp = () => { drag.current = null; };

  const run = sim.run;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
      <Card title="Flight — every frame is an integrated state, not a keyframe">
        <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap", alignItems: "center", marginBottom: S.sm }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>start from{" "}
            <select value={preset} onChange={(e) => {
                setPreset(e.target.value);
                setScen(presetToState(SCENARIO_PRESETS[e.target.value]));
              }}
              style={{ background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 6px", fontFamily: SANS }}>
              {Object.entries(SCENARIO_PRESETS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <button onClick={() => setEditing((e) => !e)}
            style={{ background: SC.inset, color: SC.text, border: `1px solid ${SC.caution}`,
                     borderRadius: 3, padding: "4px 10px", fontSize: T.label, cursor: "pointer", fontFamily: SANS }}>
            {editing ? "hide scenario" : `edit scenario (${scen.segments.length} segment${scen.segments.length === 1 ? "" : "s"})`}
          </button>
          <label style={{ fontSize: T.label, color: SC.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={scenery} onChange={(e) => setScenery(e.target.checked)} />
            obstacles
          </label>
          {/* THE IMPACT COEFFICIENTS, shown as DECLARED. They are the
              reader's numbers; nothing here sources them. */}
          {scenery ? (
            <label style={{ fontSize: T.label, color: SC.muted, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={bounce} onChange={(e) => setBounce(e.target.checked)} />
              bounce
              {bounce ? (
                <>
                  <span style={{ color: SC.dim, fontFamily: MONO }} title={DECLARED_IMPACT_INPUTS.restitution.why}>
                    e
                  </span>
                  <input type="number" value={restitution} step={0.05} min={0} max={1}
                    onChange={(ev) => setRestitution(Math.max(0, Math.min(1, +ev.target.value)))}
                    style={{ width: 52, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                             borderRadius: 3, padding: "2px 4px", fontFamily: MONO }} />
                  <span style={{ color: SC.dim, fontFamily: MONO }}
                        title={DECLARED_IMPACT_INPUTS.bladeBreakSpeedMps.why}>
                    blades break
                  </span>
                  <input type="number" value={breakSpeed} step={0.5} min={0}
                    onChange={(ev) => setBreakSpeed(Math.max(0, +ev.target.value))}
                    style={{ width: 56, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                             borderRadius: 3, padding: "2px 4px", fontFamily: MONO }} />
                  <span style={{ color: SC.dim, fontFamily: MONO }}>m/s (declared)</span>
                </>
              ) : null}
            </label>
          ) : null}
          {/* THE CONTROL PAD. Each press appends a segment and the flight is
              re-integrated; nothing here moves the drawn aircraft directly. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: T.label, color: SC.muted }}>fly</span>
            {CONTROLS.map((c) => (
              <button key={c.k} type="button" onClick={c.go} disabled={padFull} title={c.title}
                style={{ background: SC.inset, color: padFull ? SC.dim : SC.text,
                         border: `1px solid ${SC.caution}`, borderRadius: 3,
                         padding: "3px 8px", fontSize: T.body, lineHeight: 1.1,
                         cursor: padFull ? "not-allowed" : "pointer", fontFamily: SANS }}>
                {c.glyph}
              </button>
            ))}
            <span style={{ fontSize: T.label, color: padFull ? SC.caution : SC.dim, fontFamily: MONO }}>
              {padFull
                ? `${SCENARIO_LIMITS.maxSegments}-segment limit reached — edit or reset the scenario`
                : `${SCENARIO_LIMITS.maxSegments - scen.segments.length} left`}
            </span>
          </div>
          {/* KILL ROTORS BY NAME HERE OR BY CLICKING THEM IN THE VIEW. One
              chip per motor, because the simulation takes a SET and the old
              single <select> could not express the multi-failure cases that
              decide whether a layout is controllable at all. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: T.label, color: SC.muted }}>kill rotor</span>
            {/* Sorted for the hand, not for the geometry: ArduPilot motor
                numbers are OUTPUT CHANNELS, so airframe.rotors comes back in
                ring order (2,3,1,4 on a quad X) and the chips would be shuffled.
                Sorting the buttons changes nothing about which motor is which. */}
            {[...airframe.rotors].sort((a, b) => a.motor - b.motor).map((r) => {
              const dead = failedMotors.has(r.motor);
              return (
                <button key={r.motor} type="button" aria-pressed={dead}
                  onClick={() => toggleMotor(r.motor)}
                  title={dead ? `motor ${r.motor} is dead — click to restore` : `kill motor ${r.motor}`}
                  style={{ background: dead ? "#7d2a22" : SC.inset,
                           color: dead ? "#ffd9d4" : SC.text,
                           border: `1px solid ${dead ? "#e0574a" : SC.border}`,
                           borderRadius: 3, padding: "3px 8px", fontSize: T.label,
                           cursor: "pointer", fontFamily: MONO, minWidth: 26 }}>
                  {r.motor}
                </button>
              );
            })}
            <button type="button" onClick={() => setFailedMotors(new Set())}
              disabled={failedMotors.size === 0}
              style={{ background: "transparent", color: failedMotors.size ? SC.text : SC.dim,
                       border: `1px solid ${SC.border}`, borderRadius: 3, padding: "3px 8px",
                       fontSize: T.label, cursor: failedMotors.size ? "pointer" : "default",
                       fontFamily: SANS }}>
              all live
            </button>
          </div>
          <button onClick={() => setPlaying((p) => !p)}
            style={{ background: SC.teal, color: SC.bg, border: "none", borderRadius: 4,
                     padding: "4px 14px", fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
            {playing ? "pause" : "play"}
          </button>
          <label style={{ fontSize: T.label, color: SC.muted }}>speed{" "}
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)}
              style={{ background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 6px", fontFamily: MONO }}>
              {[0.25, 0.5, 1, 2].map((x) => <option key={x} value={x}>{x}×</option>)}
            </select>
          </label>
          <label style={{ fontSize: T.label, color: SC.muted }}>zoom{" "}
            <input type="range" min={0.6} max={4} step={0.2} value={zoom}
              onChange={(e) => setZoom(+e.target.value)} style={{ verticalAlign: "middle" }} />
          </label>
          <label style={{ fontSize: T.label, color: SC.muted }}>camera{" "}
            <select value={camera} onChange={(e) => setCamera(e.target.value)}
              style={{ background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 6px", fontFamily: SANS }}>
              <option value="auto">auto ({mode})</option>
              <option value="fit">fit whole flight</option>
              <option value="follow">follow aircraft</option>
            </select>
          </label>
          <span style={{ fontSize: T.label, color: SC.muted, fontFamily: MONO }}>
            t = {num(now.t, 2)} s
          </span>
        </div>

        {scenarioBuild.error ? (
          <div style={{ fontSize: T.label, color: SC.caution, borderLeft: `2px solid ${SC.caution}`,
                        paddingLeft: S.sm, marginBottom: S.sm }}>
            {scenarioBuild.error} — still flying the last valid scenario.
          </div>
        ) : null}

        {editing ? (
          <div style={{ border: `1px solid ${SC.border}`, borderRadius: 6, padding: S.sm, marginBottom: S.sm }}>
            <div style={{ fontSize: T.label, color: SC.muted, marginBottom: S.sm, lineHeight: 1.5 }}>
              A scenario is a commanded attitude and altitude over time, so there is no fixed menu:
              describe the flight you want. Segments run in order and the last one holds to the end.
              Leave a rate empty to step the altitude, or give one to approach it at that speed.
              <b> This simulation closes an attitude loop and an altitude loop and no position loop</b>,
              which is what Stabilize mode does — so a held tilt has no equilibrium and the aircraft
              will accelerate for as long as you command it.
            </div>

            <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap", alignItems: "flex-end", marginBottom: S.sm }}>
              {[["start altitude (m)", "startAltitudeM"], ["initial roll (°)", "initialRollDeg"],
                ["initial pitch (°)", "initialPitchDeg"], ["initial yaw (°)", "initialYawDeg"]].map(([lab, key]) => (
                <label key={key} style={{ fontSize: 10, color: SC.muted, fontFamily: SANS }}>
                  {lab}<br />
                  <input value={scen[key]} onChange={(e) => setScen((s) => ({ ...s, [key]: e.target.value }))}
                    style={{ width: 82, fontFamily: MONO, fontSize: T.label, padding: 3,
                             background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3 }} />
                </label>
              ))}
            </div>

            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["#", "duration s", "roll °", "pitch °", "yaw °", "altitude m", "alt rate m/s", ""].map((h) => (
                    <th key={h} style={{ ...th(), fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scen.segments.map((sg, idx) => (
                  <tr key={idx}>
                    <td style={{ ...td(true), fontSize: 10 }}>{idx + 1}</td>
                    {["durationS", "rollDeg", "pitchDeg", "yawDeg", "altitudeM", "altitudeRateMps"].map((k) => (
                      <td key={k} style={{ padding: "2px 4px" }}>
                        <input value={sg[k] ?? ""} placeholder={k === "altitudeRateMps" ? "step" : ""}
                          onChange={(e) => setScen((s) => {
                            const segs = s.segments.map((x, j) => j === idx ? { ...x, [k]: e.target.value } : x);
                            return { ...s, segments: segs };
                          })}
                          style={{ width: 66, fontFamily: MONO, fontSize: T.label, padding: 3,
                                   background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3 }} />
                      </td>
                    ))}
                    <td style={{ padding: "2px 4px" }}>
                      {scen.segments.length > 1 ? (
                        <button onClick={() => setScen((s) => ({ ...s, segments: s.segments.filter((_, j) => j !== idx) }))}
                          style={{ background: "none", border: "none", color: SC.muted, cursor: "pointer", fontSize: T.label }}>
                          remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: S.sm, display: "flex", gap: S.sm, alignItems: "center", flexWrap: "wrap" }}>
              <button disabled={scen.segments.length >= SCENARIO_LIMITS.maxSegments}
                onClick={() => setScen((s) => ({ ...s, segments: [...s.segments, {
                  durationS: 2, rollDeg: 0, pitchDeg: 0, yawDeg: 0,
                  altitudeM: s.segments[s.segments.length - 1]?.altitudeM ?? s.startAltitudeM,
                  altitudeRateMps: "" }] }))}
                style={{ background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`,
                         borderRadius: 3, padding: "4px 10px", fontSize: T.label,
                         cursor: scen.segments.length >= SCENARIO_LIMITS.maxSegments ? "not-allowed" : "pointer",
                         fontFamily: SANS }}>
                add segment
              </button>
              <span style={{ fontSize: T.label, color: SC.muted, fontFamily: MONO }}>
                total {num(scenario.totalDurationS, 1)} s
              </span>
            </div>

            {scenario.driftingSegments?.length ? (
              <div style={{ marginTop: S.sm, fontSize: T.label, color: SC.caution, lineHeight: 1.5 }}>
                {scenario.driftingSegments.map((s) => (
                  <div key={s.index}>
                    segment {s.index} holds {num(Math.abs(s.rollDeg) > 0 ? s.rollDeg : s.pitchDeg, 0)}° of tilt
                    for {num(s.durationS, 1)} s — with no position loop that is an unopposed{" "}
                    <b>{num(s.driftAccelMps2, 2)} m/s²</b>, so the aircraft accelerates away rather than
                    holding station. The camera follows it; the distance is on the readout.
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <input type="range" min={0} max={Math.max(0, trace.length - 1)} value={i}
          onChange={(e) => { setPlaying(false); setI(+e.target.value); }}
          style={{ width: "100%", marginBottom: S.sm }} />

        <div style={{ display: "flex", gap: S.md, flexWrap: "wrap" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            style={{ border: `1px solid ${SC.border}`, borderRadius: 6, cursor: "grab" }}>

            {/* Shading only — every vertex below is where it always was.
                Lighting is gradients and opacity, so the geometry that a
                render diff would compare is unchanged by it. */}
            <defs>
              <linearGradient id="fp-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d1622" />
                <stop offset="58%" stopColor="#0a111b" />
                <stop offset="100%" stopColor="#070c14" />
              </linearGradient>
              <radialGradient id="fp-glow" cx="50%" cy="44%" r="62%">
                <stop offset="0%" stopColor="#1b3350" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#1b3350" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="fp-arm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fa6b8" />
                <stop offset="45%" stopColor="#5d7387" />
                <stop offset="100%" stopColor="#2b3946" />
              </linearGradient>
              <radialGradient id="fp-pod" cx="38%" cy="32%" r="72%">
                <stop offset="0%" stopColor="#9fb3c4" />
                <stop offset="60%" stopColor="#47586a" />
                <stop offset="100%" stopColor="#1d2731" />
              </radialGradient>
              {[["ccw", "#4ea1ff"], ["cw", "#f2a33c"], ["dead", "#e0574a"]].map(([k, c]) => (
                <radialGradient key={k} id={`fp-disc-${k}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={c} stopOpacity="0.02" />
                  <stop offset="62%" stopColor={c} stopOpacity="0.10" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.26" />
                </radialGradient>
              ))}
              {/* The shadow ellipse is only tens of pixels across at the
                  framing this view uses, so a large kernel erases it
                  rather than softening it. */}
              <filter id="fp-soft" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            <rect x="0" y="0" width={W} height={H} fill="url(#fp-sky)" />
            <rect x="0" y="0" width={W} height={H} fill="url(#fp-glow)" />

            {/* THE GROUND, ON AN ABSOLUTE WORLD LATTICE. Lines sit at whole
                multiples of gridStep in world coordinates and the window
                slides over them, so travel is visible instead of being
                cancelled out by a grid that moved with the aircraft. Every
                fifth line is heavier and labelled with its own coordinate:
                a uniform grid is ambiguous at its own period, and only the
                number separates 20 m from 30 m. Fades with distance so it
                reads as receding rather than as flat pattern. */}
            <g>
              {Array.from({ length: 21 }, (_, k) => {
                const off = (k - 10) * gridStep;
                const wx = gridAnchorX + off, wy = gridAnchorY + off;
                const L = gridHalfSpan;
                const fade = 0.34 * (1 - Math.abs(k - 10) / 12);
                const majorX = Math.round(wx / gridStep) % MAJOR_EVERY === 0;
                const majorY = Math.round(wy / gridStep) % MAJOR_EVERY === 0;
                const a = project([wx, gridAnchorY - L, 0]), b = project([wx, gridAnchorY + L, 0]);
                const c = project([gridAnchorX - L, wy, 0]), d = project([gridAnchorX + L, wy, 0]);
                return (<g key={k} opacity={Math.max(0.05, fade)}>
                  <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
                        stroke={majorX ? "#7ea6c8" : "#5b7f9e"} strokeWidth={majorX ? 1.7 : 1} />
                  <line x1={c.sx} y1={c.sy} x2={d.sx} y2={d.sy}
                        stroke={majorY ? "#7ea6c8" : "#5b7f9e"} strokeWidth={majorY ? 1.7 : 1} />
                </g>);
              })}
              {/* THE COORDINATES, PLACED WHERE THEY CAN ACTUALLY BE SEEN.

                  Drawn first at the lattice edge (+/-10 m), which is off
                  screen at every zoom this panel uses, so the caption
                  promised labels the view never showed. Each major line is
                  now clipped to the viewport and the number is put at the
                  end that is lower on screen, i.e. nearest the viewer.
                  Full strength, because a faded number is not a reference
                  anyone can read. */}
              {gridLabels.map((L) => (
                <text key={L.key} x={L.sx} y={L.sy} textAnchor={L.anchor}
                      fill={VIEW.muted} fontSize="10" fontFamily={MONO} opacity="0.9">
                  {L.text}
                </text>
              ))}
            </g>

            {/* THE OBSTACLES. Drawn from their own dimensions and labelled
                with them, so they read as scale references rather than as
                scenery: a box captioned "hangar 14x10x8 m" tells you how far
                the aircraft has travelled in a way a bare grid cannot. Sorted
                back-to-front so nearer solids overlap farther ones. */}
            {scenery ? (
              <g>
                {DEFAULT_SCENE.filter((o) => {
                  /* CULLED TO THE VISIBLE WINDOW. A hover frames a few metres
                     while the hangar is 14 m wide and 26 m away, so without
                     this it is drawn at enormous scale, fills a quarter of the
                     frame and pushes its own caption off screen. An obstacle
                     appears when the aircraft is near enough for it to mean
                     something, which is also when a strike is possible. */
                  const rad = o.kind === "box" ? Math.hypot(o.wx, o.wy) / 2 : o.canopyR;
                  const d = Math.hypot(o.x - followPt[0], o.y - followPt[1]) - rad;
                  return d <= Math.max(world, 12);
                }).map((o) => {
                  const base = project([o.x, o.y, 0]);
                  const strook = strike && strike.obstacle === o;
                  const edge = strook ? "#e0574a" : "#6d8ea8";
                  const face = strook ? "#3a1a17" : "#1b2733";
                  if (o.kind === "box") {
                    const cs = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) =>
                      [o.x + a * o.wx / 2, o.y + b * o.wy / 2]);
                    const foot = cs.map((c) => project([c[0], c[1], 0]));
                    const roof = cs.map((c) => project([c[0], c[1], o.h]));
                    const poly = (pts) => pts.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(" ");
                    return (
                      <g key={o.name} opacity="0.95">
                        {cs.map((_, k) => {
                          const n = (k + 1) % 4;
                          return <polygon key={k} points={poly([foot[k], foot[n], roof[n], roof[k]])}
                                          fill={face} stroke={edge} strokeWidth="1" opacity="0.9" />;
                        })}
                        <polygon points={poly(roof)} fill={strook ? "#5a2320" : "#243444"}
                                 stroke={edge} strokeWidth="1.2" />
                        <text x={base.sx} y={base.sy + 13} textAnchor="middle"
                              fill={strook ? "#ffb4aa" : VIEW.muted} fontSize="9" fontFamily={MONO}>
                          {`${o.name} ${o.wx}×${o.wy}×${o.h} m`}
                        </text>
                      </g>
                    );
                  }
                  const cz = o.h - o.canopyR;
                  const top = project([o.x, o.y, o.h]);
                  const crown = project([o.x, o.y, cz]);
                  const rpx = Math.abs(project([o.x + o.canopyR, o.y, cz]).sx - crown.sx);
                  return (
                    <g key={o.name} opacity="0.95">
                      <line x1={base.sx} y1={base.sy} x2={top.sx} y2={top.sy}
                            stroke={strook ? "#e0574a" : "#5a4632"} strokeWidth={Math.max(1.5, o.trunkR * 8)} />
                      <circle cx={crown.sx} cy={crown.sy} r={Math.max(3, rpx)}
                              fill={strook ? "#4a1f1c" : "#1d3326"} stroke={edge} strokeWidth="1" opacity="0.92" />
                      <text x={base.sx} y={base.sy + 13} textAnchor="middle"
                            fill={strook ? "#ffb4aa" : VIEW.muted} fontSize="9" fontFamily={MONO}>
                        {`${o.name} ${o.h} m`}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* shadow and the vertical drop line, so altitude is readable.
                The shadow softens with height, which is what a shadow does
                and also makes the altitude readable without the drop line. */}
            <ellipse cx={shadow.sx} cy={shadow.sy}
                     rx={scale * span * 0.42 * (1 + 0.16 * Math.min(3, now.altitudeM / Math.max(0.5, span)))}
                     ry={scale * span * 0.42 * Math.sin(view.pitch * DEG) * (1 + 0.16 * Math.min(3, now.altitudeM / Math.max(0.5, span)))}
                     fill="#02060a" opacity="0.78" filter="url(#fp-soft)" />
            <line x1={shadow.sx} y1={shadow.sy} x2={centre.sx} y2={centre.sy}
                  stroke={VIEW.muted} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />

            {/* flown path */}
            {trail.length > 1 ? (
              <polyline points={trail.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ")}
                        fill="none" stroke="#4ea1ff" strokeWidth="2" opacity="0.75" />
            ) : null}

            {/* the aircraft */}
            {rotors.map((r) => {
              const col = r.dead ? "#e0574a" : r.rotation === "CCW" ? "#4ea1ff" : "#f2a33c";
              /* The disc is a circle in the BODY x-y plane; it is sampled and
                 projected, so it tilts with the aircraft as a real disc does. */
              const disc = [];
              for (let k = 0; k <= 28; k++) {
                const a = (k / 28) * 2 * Math.PI;
                const pt = project(bodyToWorld([
                  r.x + r.radiusM * Math.cos(a), r.y + r.radiusM * Math.sin(a), r.z]));
                disc.push(`${k === 0 ? "M" : "L"}${pt.sx.toFixed(1)},${pt.sy.toFixed(1)}`);
              }
              const frac = r.thrust / Math.max(1e-9, sim.model.maxThrustPerRotorN);
              const key = r.dead ? "dead" : r.rotation === "CCW" ? "ccw" : "cw";
              /* the arm as a tapered solid rather than a flat stroke */
              const ux = r.p.sx - centre.sx, uy = r.p.sy - centre.sy;
              const L2 = Math.hypot(ux, uy) || 1;
              const px = -uy / L2, py = ux / L2;
              const wRoot = Math.max(2.2, scale * airframe.propRadiusM * 0.10);
              const wTip = Math.max(1.5, scale * airframe.propRadiusM * 0.055);
              const armPath =
                `M${centre.sx + px * wRoot},${centre.sy + py * wRoot} ` +
                `L${r.p.sx + px * wTip},${r.p.sy + py * wTip} ` +
                `L${r.p.sx - px * wTip},${r.p.sy - py * wTip} ` +
                `L${centre.sx - px * wRoot},${centre.sy - py * wRoot} Z`;
              return (
                /* The disc is the target: clicking a rotor in the picture is
                   the same action as its chip above, so a failure can be
                   chosen where it is being looked at. */
                <g key={r.motor} onClick={() => toggleMotor(r.motor)}
                   style={{ cursor: "pointer" }}
                   role="button" tabIndex={0}
                   aria-label={r.dead ? `motor ${r.motor} dead, click to restore` : `kill motor ${r.motor}`}>
                  <path d={armPath} fill={r.dead ? "#7d2a22" : "url(#fp-arm)"}
                        stroke="#0a1118" strokeWidth="0.7" opacity={r.dead ? 0.7 : 1} />
                  <path d={disc.join(" ") + " Z"} fill={`url(#fp-disc-${key})`}
                        stroke={col} strokeWidth="1.6" strokeOpacity={r.dead ? 0.55 : 0.9}
                        strokeDasharray={r.dead ? "4 3" : "none"} />
                  {!r.dead ? (
                    <>
                      <line x1={r.p.sx} y1={r.p.sy} x2={r.tipTop.sx} y2={r.tipTop.sy}
                            stroke="#54c7a8" strokeWidth="3.5" strokeLinecap="round" opacity="0.95" />
                      {/* thrust as a share of this rotor's measured maximum */}
                      <text x={r.p.sx + 8} y={r.p.sy - 6} fill="#54c7a8" fontSize="9" fontFamily={MONO}>
                        {(100 * frac).toFixed(0)}%
                      </text>
                    </>
                  ) : (
                    <text x={r.p.sx} y={r.p.sy - 10} fill="#e0574a" fontSize="10"
                          fontFamily={MONO} textAnchor="middle">dead</text>
                  )}
                  <circle cx={r.p.sx} cy={r.p.sy} r="3.5" fill={VIEW.hub} stroke={col} strokeWidth="2" />
                </g>
              );
            })}
            {/* body pod */}
            <circle cx={centre.sx} cy={centre.sy} r={Math.max(5, scale * airframe.bodyRadiusM)}
                    fill="url(#fp-pod)" stroke="#0a1118" strokeWidth="1" />
            {/* nose direction, so the yaw is readable */}
            {(() => {
              const n = project(bodyToWorld([airframe.armLengthM * 0.75, 0, 0]));
              return <line x1={centre.sx} y1={centre.sy} x2={n.sx} y2={n.sy}
                           stroke={VIEW.amber} strokeWidth="2.5" strokeLinecap="round" />;
            })()}

            <text x={10} y={H - 10} fill={VIEW.muted} fontSize="10" fontFamily={MONO}>
              {`drag to orbit · grid ${gridStep} m, every ${MAJOR_EVERY * gridStep} m labelled in world metres · green = computed thrust per rotor · orthographic`}
            </text>
          </svg>

          <div style={{ minWidth: 230, flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: S.sm }}>
              {/* ACHIEVED, with COMMANDED beneath. The two differ whenever the
                  controller is still catching up, and the gap is the only
                  visible evidence that a command is being tracked rather
                  than applied. */}
              <Kpi label="Altitude" value={num(now.altitudeM, 2)} unit="m"
                   sub={cmdNow ? `commanded ${num(cmdNow.altitudeM, 2)} m` : undefined} />
              <Kpi label="Roll" value={num(now.rollDeg, 1)} unit="°"
                   sub={cmdNow ? `commanded ${num(cmdNow.rollDeg, 1)}°` : undefined} />
              <Kpi label="Pitch" value={num(now.pitchDeg, 1)} unit="°"
                   sub={cmdNow ? `commanded ${num(cmdNow.pitchDeg, 1)}°` : undefined} />
              <Kpi label="Yaw" value={num(now.yawDeg, 1)} unit="°"
                   sub={cmdNow ? `commanded ${num(cmdNow.yawDeg, 1)}°` : undefined} />
              <Kpi label="Travelled" value={num(travelledM, 1)} unit="m"
                   sub="from the start point — no position loop holds station" />
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: S.sm }}>
              <tbody>
                {run.impacts?.length ? (
                  <tr><td style={td()}>impacts</td>
                      <td style={{ ...td(true), color: "#e0574a", fontWeight: 600 }}>
                        {`${run.impacts.length} — ${run.impacts.slice(0, 4).map((z) => `${z.name} @ ${z.closingMps.toFixed(1)} m/s`).join(", ")}`}
                        <div style={{ fontSize: 10, color: SC.muted, fontWeight: 400, marginTop: 2 }}>
                          restitution, scrub and the blade-break speed are DECLARED inputs, not measurements
                        </div>
                      </td></tr>
                ) : null}
                {run.broken?.length ? (
                  <tr><td style={td()}>rotors destroyed</td>
                      <td style={{ ...td(true), color: "#e0574a", fontWeight: 600 }}>
                        {run.broken.map((z) => `motor ${z.motor} at ${z.closingMps.toFixed(1)} m/s`).join(", ")}
                      </td></tr>
                ) : null}
                {!bounce && strike ? (
                  <tr><td style={td()}>struck</td>
                      <td style={{ ...td(true), color: "#e0574a", fontWeight: 600 }}>
                        {`${strike.name} at ${strike.speedMps.toFixed(1)} m/s, t = ${strike.t.toFixed(2)} s`}
                        <div style={{ fontSize: 10, color: SC.muted, fontWeight: 400, marginTop: 2 }}>
                          {`${strike.horizontalMps.toFixed(1)} m/s horizontal, ${strike.verticalMps.toFixed(1)} m/s vertical `}
                          {`at ${strike.altitudeM.toFixed(1)} m — ${strike.note}`}
                        </div>
                      </td></tr>
                ) : null}
                <tr><td style={td()}>outcome</td>
                    <td style={{ ...td(true), color: run.crashed ? "#e0574a" : "#54c7a8", fontWeight: 600 }}>
                      {run.crashed ? `ground at ${num(run.hitGroundAtS, 2)} s` : "flew the scenario"}</td></tr>
                <tr><td style={td()}>axes lost</td>
                    <td style={{ ...td(true), color: run.axesDropped.length ? "#e0574a" : SC.muted }}>
                      {run.axesDropped.length ? run.axesDropped.join(", ") : "none"}</td></tr>
                <tr><td style={td()}>moment saturated</td>
                    <td style={td(true)}>{run.fullRankButUnattainable ? "yes" : "no"}</td></tr>
                <tr><td style={td()}>max tilt</td><td style={td(true)}>{num(run.maxTiltDeg, 1)}°</td></tr>
                <tr><td style={td()}>yaw drift</td><td style={td(true)}>{num(run.yawDriftDeg, 1)}°</td></tr>
                <tr><td style={td()}>Ixx / Iyy / Izz</td>
                    <td style={td(true)}>{num(run.inertia.Ixx, 3)} / {num(run.inertia.Iyy, 3)} / {num(run.inertia.Izz, 3)}</td></tr>
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: SC.muted, lineHeight: 1.5, marginTop: 6 }}>
              {run.inertia.caveat}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Traces — the same states, plotted">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trace} margin={{ top: 8, right: 16, bottom: 22, left: 6 }}>
            <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
            <XAxis dataKey="t" {...axis} type="number" domain={["dataMin", "dataMax"]}
              label={{ value: "s", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: 11 }} />
            <YAxis yAxisId="a" {...axis} width={46}
              label={{ value: "deg", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
            <YAxis yAxisId="h" orientation="right" {...axis} width={46}
              label={{ value: "m", angle: 90, position: "insideRight", fill: SC.muted, fontSize: 11 }} />
            <Tooltip formatter={(x, n) => [num(+x, 2), n]} labelFormatter={(t) => `t = ${num(+t, 2)} s`} />
            <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="a" type="monotone" dataKey="rollDeg" stroke="#4ea1ff" dot={false} strokeWidth={2} isAnimationActive={false} name="roll" />
            <Line yAxisId="a" type="monotone" dataKey="pitchDeg" stroke="#f2a33c" dot={false} strokeWidth={2} isAnimationActive={false} name="pitch" />
            <Line yAxisId="a" type="monotone" dataKey="yawDeg" stroke="#9b8cff" dot={false} strokeWidth={2} isAnimationActive={false} name="yaw" />
            <Line yAxisId="h" type="monotone" dataKey="altitudeM" stroke="#54c7a8" dot={false} strokeWidth={2} isAnimationActive={false} name="altitude" />
            <ReferenceLine yAxisId="a" x={now.t} stroke={SC.caution} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
          The vertical line is the frame on screen above. Nothing is drawn between samples: the
          trace is the integrator's own output at 20 ms.
        </div>
      </Card>

      <Card title="What this model rests on">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th()}>Quantity</th><th style={th()}>Status</th><th style={th()}>Source, or why not</th></tr></thead>
          <tbody>
            <tr><td style={td()}>Equations of motion</td><td style={{ ...td(), color: "#54c7a8" }}>sourced</td>
                <td style={{ ...td(), fontSize: 11 }}>Bauersfeld &amp; Scaramuzza, IEEE RA-L 2022, Eqs. (1)–(3)</td></tr>
            <tr><td style={td()}>Control allocation</td><td style={{ ...td(), color: "#54c7a8" }}>sourced</td>
                <td style={{ ...td(), fontSize: 11 }}>Du, Quan, Yang &amp; Cai — the same matrix ACAI uses</td></tr>
            <tr><td style={td()}>Controller gains</td><td style={{ ...td(), color: "#54c7a8" }}>sourced</td>
                <td style={{ ...td(), fontSize: 11 }}>{ARDUPILOT_GAINS.source}</td></tr>
            <tr><td style={td()}>Rotor thrust</td><td style={{ ...td(), color: "#54c7a8" }}>measured</td>
                <td style={{ ...td(), fontSize: 11 }}>UIUC wind-tunnel rows, through the rotor block</td></tr>
            <tr><td style={td()}>Inertia tensor</td><td style={{ ...td(), color: SC.caution }}>DERIVED</td>
                <td style={{ ...td(), fontSize: 11 }}>{run.inertia.derivation} — no commercial multirotor publishes one</td></tr>
            {DECLARED_DYNAMICS_INPUTS.map((d) => (
              <tr key={d.key}><td style={td()}>{d.key}</td>
                <td style={{ ...td(), color: SC.caution }}>DECLARED</td>
                <td style={{ ...td(), fontSize: 11 }}>{d.whyDeclared}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: S.md, marginTop: S.sm, flexWrap: "wrap" }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>motor τ (s){" "}
            <input type="number" value={motorTau} step={0.01} min={0.005} max={0.5}
              onChange={(e) => setMotorTau(Math.max(0.005, +e.target.value))}
              style={{ width: 70, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} /></label>
          <label style={{ fontSize: T.label, color: SC.muted }}>body C_d{" "}
            <input type="number" value={cd} step={0.05} min={0.1} max={2.5}
              onChange={(e) => setCd(Math.max(0.1, +e.target.value))}
              style={{ width: 70, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} /></label>
        </div>
        <div style={{ fontSize: T.label, color: SC.caution, lineHeight: 1.6, marginTop: S.sm,
                      borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
          A scenario that flies proves nothing about controllability. With a rotor dead this
          airframe may fly every scenario offered here while whole directions of moment remain
          unattainable — a simulation samples only the directions its scenario demands. The
          Airframe tab measures the whole attainable set with ACAI, and that is the test to read.
        </div>
      </Card>
    </div>
  );
}
