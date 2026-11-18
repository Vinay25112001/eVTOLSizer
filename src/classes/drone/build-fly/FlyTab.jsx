/* =====================================================================
   FLY — the test arena (Drone Sizer · Fly · 3D)
   =====================================================================
   The design you built, flown live with the keyboard (or the on-screen
   pads) in the Flight sim's scene. The flight is live-flight.js: the
   Flight sim tab's own 6-DOF, controller, motor lag and pack chain,
   stepped at 2 ms as the keys move the setpoints. The 3D view
   (drone-scene.js, three.js) only draws it, and is fetched only when
   this tab opens.

   Everything on the HUD is read from the flight's own state or from
   sizeDrone(); the notices under the arena say what is not modelled and
   which audit findings bear on what you see.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { T, S, MONO, SANS } from "../../../ui/tokens.js";
import { Card } from "../../ui-kit.jsx";
import { buildAirframe } from "../geometry3d.js";
import { buildModel, DECLARED_DYNAMICS_INPUTS, LOITER_WITHDRAWN, qToEuler } from "../dynamics.js";
import { buildEnergyModel } from "../flight-energy.js";
import { DEFAULT_SCENE, DECLARED_IMPACT_INPUTS } from "../obstacles.js";
import { createFlight, stepFlight, failMotor, sticksToTarget, initialSetpoint, STICK_DEFAULTS } from "../live-flight.js";
import { rotorMismatch } from "./build-steps.js";

const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const CAMERA_LABEL = { chase: "Chase", fpv: "FPV", orbit: "Orbit", top: "Top" };
const CAMERA_ORDER = ["chase", "fpv", "orbit", "top"];

/* Keys -> stick axes. Space/Shift move the held altitude. */
const KEYMAP = {
  KeyW: ["pitch", 1], ArrowUp: ["pitch", 1], KeyS: ["pitch", -1], ArrowDown: ["pitch", -1],
  KeyD: ["roll", 1], ArrowRight: ["roll", 1], KeyA: ["roll", -1], ArrowLeft: ["roll", -1],
  KeyE: ["yaw", 1], KeyQ: ["yaw", -1],
  Space: ["climb", 1], PageUp: ["climb", 1], ShiftLeft: ["climb", -1], ShiftRight: ["climb", -1], PageDown: ["climb", -1],
};
function sticksFrom(keys, pads) {
  const s = { pitch: 0, roll: 0, yaw: 0, climb: 0 };
  for (const k of keys) { const m = KEYMAP[k]; if (m) s[m[0]] += m[1]; }
  for (const [axis, val] of Object.entries(pads)) s[axis] += val;
  for (const k of Object.keys(s)) s[k] = Math.max(-1, Math.min(1, s[k]));
  return s;
}

function chip(on) {
  return { padding: "4px 10px", fontSize: T.label, borderRadius: 3, cursor: "pointer", fontFamily: SANS,
    background: on ? SC.inset : "transparent", color: on ? SC.text : SC.muted, border: `1px solid ${on ? SC.caution : SC.border}` };
}
const hudBox = { background: "rgba(8,14,22,0.72)", color: "#dfe9f3", borderRadius: 6, padding: "8px 10px", fontFamily: MONO,
  fontSize: 12, lineHeight: 1.5, border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(2px)" };

/* ── The minimap: north up, centred on the drone. ── */
function drawMinimap(cv, { x, y, yawDeg }, trail, obstacles, failedCount) {
  if (!cv) return;
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, R = 70;           // metres shown either side
  const k = W / (2 * R);
  const P = (n, e) => [W / 2 + (e - y) * k, H / 2 - (n - x) * k];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(8,14,22,0.78)"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
  for (let g = -200; g <= 200; g += 10) {
    const [gx] = P(0, g), [, gy] = P(g, 0);
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }
  const [px, py] = P(0, 0);
  ctx.strokeStyle = "#ff8a4c"; ctx.beginPath(); ctx.arc(px, py, 2.2 * k, 0, Math.PI * 2); ctx.stroke();
  for (const o of obstacles) {
    ctx.fillStyle = o.kind === "tree" ? "rgba(111,170,110,0.75)" : "rgba(180,190,205,0.8)";
    if (o.kind === "box") { const [bx, by] = P(o.x + o.wx / 2, o.y - o.wy / 2); ctx.fillRect(bx, by, o.wy * k, o.wx * k); }
    else { const [tx, ty] = P(o.x, o.y); ctx.beginPath(); ctx.arc(tx, ty, o.canopyR * k, 0, Math.PI * 2); ctx.fill(); }
  }
  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(255,138,76,0.85)"; ctx.lineWidth = 1.5; ctx.beginPath();
    trail.forEach(([n, e], i) => { const [a, b] = P(n, e); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
  }
  const h = yawDeg * Math.PI / 180;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(h);
  ctx.fillStyle = failedCount ? "#e0574a" : "#ffffff";
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#dfe9f3"; ctx.font = "11px ui-monospace, Menlo, Consolas, monospace"; ctx.fillText("N", W / 2 - 3, 12);
  ctx.fillText(`${2 * R} m`, 6, H - 6);
}

function Arena({ model, airframe, energy, sizing, dark, obstacles, maxTiltDeg, payload, kit }) {
  const canvasRef = useRef(null), mapRef = useRef(null), stageRef = useRef(null), apiRef = useRef(null);
  const flightRef = useRef(null), spRef = useRef(null), keysRef = useRef(new Set()), padsRef = useRef({});
  const trailRef = useRef([]), pausedRef = useRef(true), tiltRef = useRef(maxTiltDeg);
  const [sceneState, setSceneState] = useState("loading");
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(true);
  const [camera, setCamera] = useState("chase");
  const [run, setRun] = useState(0);
  const [narrow, setNarrow] = useState(false);
  tiltRef.current = maxTiltDeg;

  const restart = () => {
    flightRef.current = createFlight({ model, startAltitudeM: 2, energy, obstacles });
    spRef.current = initialSetpoint(flightRef.current);
    trailRef.current = [];
    setRun((r) => r + 1);
  };
  useEffect(() => { restart(); }, [model, energy, obstacles]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* The 3D scene: three.js is fetched here, on first open. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    import("./drone-scene.js").then((mod) => {
      if (cancelled || !canvasRef.current) return;
      try { apiRef.current = mod.mountArena({ canvas: canvasRef.current, airframe, obstacles, dark, payload, kit }); apiRef.current.setCamera(camera); setSceneState("ready"); }
      catch (e) { setSceneState(`unavailable: ${e.message}`); }
    }).catch((e) => setSceneState(`unavailable: ${e.message}`));
    const ro = window.ResizeObserver ? new window.ResizeObserver(() => apiRef.current?.resize()) : null;
    if (ro && canvasRef.current) ro.observe(canvasRef.current);
    return () => { cancelled = true; ro?.disconnect(); apiRef.current?.dispose(); apiRef.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiRef.current?.setAirframe(airframe, { payload, kit }); }, [airframe, payload, kit]);
  useEffect(() => { apiRef.current?.setObstacles(obstacles); }, [obstacles]);
  useEffect(() => { apiRef.current?.setDark(dark); }, [dark]);
  useEffect(() => { apiRef.current?.setCamera(camera); }, [camera, sceneState]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  /* Below about 620 px the HUD packs into smaller panels, so no two overlap. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof window === "undefined" || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => setNarrow(el.clientWidth < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* The loop: step the flight in real time, draw it, refresh the HUD. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let raf = 0, last = 0, acc = 0, hudAt = 0, mapAt = 0, trailAt = -1, resetTrail = true;
    const frame = (now) => {
      const real = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
      const f = flightRef.current;
      if (f && !pausedRef.current && !f.ended) {
        acc += real;
        const n = Math.floor(acc / f.dt + 1e-9); acc -= n * f.dt;
        const sticks = sticksFrom(keysRef.current, padsRef.current);
        for (let i = 0; i < n && !f.ended; i++) {
          spRef.current = sticksToTarget(spRef.current, sticks, f.dt, { maxTiltDeg: tiltRef.current });
          stepFlight(f, spRef.current);
        }
      }
      if (f) {
        const st = f.state, q = [st[6], st[7], st[8], st[9]], e = qToEuler(q);
        const t = f.s * f.dt;
        const pose = { x: st[0], y: st[1], altitudeM: -st[2], q, yawDeg: e.yawRad * 180 / Math.PI, t };
        const fracs = f.thrusts.map((x) => x / model.maxThrustPerRotorN);
        const failed = new Set(f.failedMotors);
        apiRef.current?.render(pose, { fracs, failed, dt: pausedRef.current ? 0 : real, resetTrail });
        resetTrail = false;
        if (t - trailAt >= 0.1 || t < trailAt) { trailAt = t; trailRef.current.push([st[0], st[1]]); if (trailRef.current.length > 900) trailRef.current.shift(); }
        if (now - mapAt > 50) { mapAt = now; drawMinimap(mapRef.current, pose, trailRef.current, obstacles, failed.size); }
        if (now - hudAt > 100) {
          hudAt = now;
          setHud({
            t, alt: -st[2], vs: -st[5], gs: Math.hypot(st[3], st[4]),
            hdg: ((e.yawRad * 180 / Math.PI) + 360) % 360, roll: e.rollRad * 180 / Math.PI, pitch: e.pitchRad * 180 / Math.PI,
            holdAlt: spRef.current?.altitudeM, soc: f.last?.soc, packW: f.last?.packPowerW, packA: f.last?.packCurrentA, wh: f.energyWh,
            fracs, motors: model.rotors.map((r) => r.motor), spin: model.rotors.map((r) => r.w), failed: [...failed],
            ended: f.ended, x: st[0], y: st[1],
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, model, obstacles]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (ev) => {
    if (KEYMAP[ev.code]) { ev.preventDefault(); keysRef.current.add(ev.code); if (paused) setPaused(false); return; }
    if (ev.code === "KeyR" || ev.code === "Enter") { ev.preventDefault(); restart(); setPaused(false); }
    else if (ev.code === "KeyP") { ev.preventDefault(); setPaused((p) => !p); }
    else if (ev.code === "KeyC") { ev.preventDefault(); setCamera((c) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(c) + 1) % CAMERA_ORDER.length]); }
  };
  const onKeyUp = (ev) => { keysRef.current.delete(ev.code); };
  const onBlur = () => { keysRef.current.clear(); padsRef.current = {}; setPaused(true); };
  const pad = (axis, val) => ({
    onPointerDown: (e) => { e.preventDefault(); padsRef.current = { ...padsRef.current, [axis]: val }; setPaused(false); stageRef.current?.focus(); },
    onPointerUp: () => { const p = { ...padsRef.current }; delete p[axis]; padsRef.current = p; },
    onPointerLeave: () => { const p = { ...padsRef.current }; delete p[axis]; padsRef.current = p; },
  });

  const end = hud?.ended;
  const breakMps = DECLARED_IMPACT_INPUTS.bladeBreakSpeedMps.value;
  const endText = !end ? null
    : end.reason === "ground" ? `Touched down at ${num(end.verticalMps, 1)} m/s down, ${num(end.horizontalMps, 1)} m/s across${end.speedMps > breakMps ? ` — faster than the declared blade-break speed (${breakMps} m/s)` : ""}. The flight sim ends a flight at ground contact; take-off from the ground is not modelled.`
    : end.reason === "obstacle" ? `Struck the ${end.name} at ${num(end.speedMps, 1)} m/s. The flight ends at contact; the impact itself is not flown here.`
    : `The pack reached its declared usable energy after ${clock(end.t)}.`;
  const box = narrow ? { ...hudBox, fontSize: 11, padding: "5px 7px" } : hudBox;
  const halfWidth = { width: "calc(50% - 12px)", boxSizing: "border-box" };
  const mapPx = narrow ? 96 : 168;
  const padBtn = { width: 44, height: 40, borderRadius: 6, border: `1px solid ${SC.border}`, background: SC.inset, color: SC.text, fontSize: 16, cursor: "pointer", touchAction: "none", userSelect: "none" };

  return (
    <div>
      <div ref={stageRef} tabIndex={0} role="application" aria-label="Flight arena. Keys: W S pitch, A D roll, Q E yaw, Space and Shift climb and descend, C camera, P pause, R restart."
        onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur}
        style={{ position: "relative", height: "min(68vh, 620px)", minHeight: 380, borderRadius: 8, overflow: "hidden", border: `1px solid ${SC.border}`, outline: "none", background: SC.inset }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        {sceneState !== "ready" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: SC.muted, fontSize: T.label }}>
            {sceneState === "loading" ? "Loading the 3D arena…" : `3D view ${sceneState}`}
          </div>
        )}
        {hud && (
          <div data-hud="flight" style={{ position: "absolute", left: 8, top: 8, ...box, minWidth: narrow ? 0 : 170 }}>
            <div style={{ color: "#ff8a4c", fontSize: 11 }}>STABILIZE · ALT HOLD</div>
            <div>ALT {num(hud.alt, 1)} m <span style={{ opacity: 0.6 }}>hold {num(hud.holdAlt, 1)}</span></div>
            <div>V/S {num(hud.vs, 1)} m/s</div>
            <div>G/S {num(hud.gs, 1)} m/s</div>
            <div>HDG {String(Math.round(hud.hdg) % 360).padStart(3, "0")}°</div>
            <div>R {num(hud.roll, 0)}° · P {num(hud.pitch, 0)}°</div>
            <div style={{ opacity: 0.7 }}>T+ {clock(hud.t)}</div>
          </div>
        )}
        <canvas ref={mapRef} data-hud="map" width={168} height={168} aria-label="Minimap, north up" style={{ position: "absolute", right: 8, top: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", width: mapPx, height: mapPx }} />
        {hud && (
          <div data-hud="pack" style={{ position: "absolute", left: 8, bottom: 8, ...box, ...(narrow ? halfWidth : { minWidth: 190 }) }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{narrow ? "PACK · usable energy" : "PACK · share of declared usable energy"}</div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.12)", borderRadius: 4, overflow: "hidden", margin: "3px 0" }}>
              <div style={{ width: `${100 * (hud.soc ?? 1)}%`, height: "100%", background: (hud.soc ?? 1) > 0.25 ? "#00c896" : "#e0574a" }} />
            </div>
            {narrow ? (
              <>
                <div>{num(100 * (hud.soc ?? 1), 1)} % · {num(hud.wh, 2)} Wh</div>
                <div>{num(hud.packW, 0)} W · {num(hud.packA, 1)} A</div>
              </>
            ) : (
              <>
                <div>{num(100 * (hud.soc ?? 1), 1)} % · {num(hud.packW, 0)} W · {num(hud.packA, 1)} A</div>
                <div style={{ opacity: 0.7 }}>{num(hud.wh, 2)} Wh used · sized hover {num(sizing.endurance.minutes, 1)} min</div>
              </>
            )}
          </div>
        )}
        {hud && (
          <div data-hud="rotors" style={{ position: "absolute", right: 8, bottom: 8, ...box, ...(narrow ? halfWidth : {}) }}>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 3 }}>{narrow ? "ROTORS · tap to fail" : "ROTORS · thrust / max · click to fail"}</div>
            <div style={{ display: "flex", gap: narrow ? 3 : 5, alignItems: "flex-end", height: narrow ? 40 : 54 }}>
              {hud.motors.map((m, i) => {
                const dead = hud.failed.includes(m), fr = Math.max(0, Math.min(1, hud.fracs[i] ?? 0));
                return (
                  <button key={m} type="button" title={dead ? `Motor ${m}: failed` : `Motor ${m}: ${num(100 * fr, 0)} % — click to fail it`}
                    onClick={() => { if (flightRef.current && failMotor(flightRef.current, m)) stageRef.current?.focus(); }}
                    style={{ flex: narrow ? "1 1 0" : "0 0 16px", maxWidth: 16, minWidth: 0, height: "100%", padding: 0, border: "none", background: "rgba(255,255,255,0.1)", borderRadius: 3, position: "relative", cursor: dead ? "default" : "pointer" }}>
                    <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${100 * fr}%`, borderRadius: 3, background: dead ? "#e0574a" : hud.spin[i] > 0 ? "#2fbfb6" : "#ff8a3c" }} />
                    <span style={{ position: "absolute", left: 0, right: 0, top: -1, fontSize: 9, color: "#dfe9f3" }}>{dead ? "×" : m}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {(paused || end) && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", ...hudBox, width: "max-content", maxWidth: "min(440px, calc(100% - 24px))", boxSizing: "border-box", textAlign: "center", fontFamily: SANS, fontSize: narrow ? 13 : 14, padding: "14px 18px" }}>
            {end ? (
              <>
                <div style={{ marginBottom: 8 }}>{endText}</div>
                <button type="button" onClick={() => { restart(); setPaused(false); stageRef.current?.focus(); }}
                  style={{ padding: "6px 16px", borderRadius: 4, border: "none", background: "#ff8a4c", color: "#0b1524", fontWeight: 600, fontFamily: SANS, fontSize: 13, cursor: "pointer" }}>Fly again (R)</button>
              </>
            ) : (
              <button type="button" onClick={() => { setPaused(false); stageRef.current?.focus(); }} style={{ background: "transparent", border: "none", color: "#dfe9f3", cursor: "pointer", fontFamily: SANS, fontSize: narrow ? 13 : 14, lineHeight: 1.6 }}>
                <b>Click to fly.</b> W/S pitch · A/D roll · Q/E yaw · Space/Shift climb and descend<br />C camera · P pause · R restart
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, alignItems: "center", marginTop: S.sm }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Camera">
          {CAMERA_ORDER.map((c) => <button key={c} type="button" aria-pressed={camera === c} onClick={() => { setCamera(c); stageRef.current?.focus(); }} style={chip(camera === c)}>{CAMERA_LABEL[c]}</button>)}
        </div>
        <button type="button" onClick={() => { restart(); stageRef.current?.focus(); setPaused(false); }} style={chip(false)}>Restart</button>
        <button type="button" onClick={() => setPaused((p) => !p)} style={chip(paused)}>{paused ? "Paused" : "Pause"}</button>
        {/* On-screen sticks, for touch. */}
        <div style={{ display: "flex", gap: S.md, marginLeft: "auto", flexWrap: "wrap" }} aria-label="On-screen sticks">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 44px)", gap: 3 }}>
            <span /><button type="button" aria-label="Climb" style={padBtn} {...pad("climb", 1)}>⤒</button><span />
            <button type="button" aria-label="Yaw left" style={padBtn} {...pad("yaw", -1)}>⟲</button><span />
            <button type="button" aria-label="Yaw right" style={padBtn} {...pad("yaw", 1)}>⟳</button>
            <span /><button type="button" aria-label="Descend" style={padBtn} {...pad("climb", -1)}>⤓</button><span />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 44px)", gap: 3 }}>
            <span /><button type="button" aria-label="Pitch forward" style={padBtn} {...pad("pitch", 1)}>▲</button><span />
            <button type="button" aria-label="Roll left" style={padBtn} {...pad("roll", -1)}>◀</button><span />
            <button type="button" aria-label="Roll right" style={padBtn} {...pad("roll", 1)}>▶</button>
            <span /><button type="button" aria-label="Pitch back" style={padBtn} {...pad("pitch", -1)}>▼</button><span />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlyTab({ design, frame, dark, onBuild }) {
  const { ok, result, selection, declared: sizingDeclared, built, v, set } = design;
  const mismatch = rotorMismatch(v, frame);
  const typ = (k) => DECLARED_DYNAMICS_INPUTS.find((d) => d.key === k).typical;
  const [motorTau, setMotorTau] = useState(typ("motorTimeConstantS"));
  const [cd, setCd] = useState(typ("bodyDragCoefficient"));
  const [scenery, setScenery] = useState(true);
  const [maxTilt, setMaxTilt] = useState(STICK_DEFAULTS.maxTiltDeg);

  const airframe = useMemo(() => {
    if (!ok || !frame || mismatch) return null;
    try { return buildAirframe({ frame, propellerDiameterM: built.propeller.diameterM, tipGapFraction: 0.10 }); }
    catch { return null; }
  }, [ok, frame, built.propeller, mismatch]);
  /* The parts the drone is drawn from (drone-parts.js): the same picks the sizing used. */
  const kit = useMemo(() => ({ motor: built.motor, propeller: built.propeller, esc: built.esc, cell: built.cell, pack: built.pack, payloadKg: v.payloadKg }),
    [built.motor, built.propeller, built.esc, built.cell, built.pack, v.payloadKg]);
  const modelBuild = useMemo(() => {
    if (!airframe) return null;
    try { return { ok: buildModel({ sizing: result, airframe, declared: { motorTimeConstantS: motorTau, bodyDragCoefficient: cd } }) }; }
    catch (e) { return { error: e.message }; }
  }, [airframe, result, motorTau, cd]);
  const energy = useMemo(() => {
    if (!modelBuild?.ok || !selection) return null;
    try { return buildEnergyModel({ selection, declared: sizingDeclared, sizing: result }); } catch { return null; }
  }, [modelBuild, selection, sizingDeclared, result]);
  const obstacles = useMemo(() => (scenery ? DEFAULT_SCENE : []), [scenery]);

  const blocked = !ok ? `The design does not converge (${result.reason ?? result.status}), so there is nothing to fly yet.`
    : mismatch ? `The sizing has ${mismatch.sized} rotors but the ${frame.frameClass} ${frame.frameType} frame has ${mismatch.frame}. The flight would mix one aircraft's thrust with another's layout.`
    : !airframe ? "The airframe builder cannot lay out this frame with this propeller."
    : modelBuild?.error ? `The flight model cannot be built: ${modelBuild.error}` : null;

  return (
    <div style={{ maxWidth: 1400 }}>
      {blocked ? (
        <Card title="Fly · 3D">
          <p style={{ fontSize: T.body, color: SC.text, lineHeight: 1.6, margin: `0 0 ${S.sm}px` }}>{blocked}</p>
          <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap" }}>
            {mismatch && (
              <button type="button" onClick={() => set("rotors")(mismatch.frame)} style={chip(true)}>
                Size it with {mismatch.frame} rotors, as the frame has
              </button>
            )}
            <button type="button" onClick={onBuild} style={chip(!mismatch)}>Open the Build tab</button>
          </div>
        </Card>
      ) : (
        <Arena model={modelBuild.ok} airframe={airframe} energy={energy} sizing={result} dark={dark} obstacles={obstacles} maxTiltDeg={maxTilt} payload={v.payloadKg > 0} kit={kit} />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, marginTop: S.md, alignItems: "flex-start" }}>
        <Card title="Flight settings">
          <label style={{ display: "block", fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
            Stick authority: full stick = {maxTilt}° of tilt
            <input type="range" min={5} max={45} step={1} value={maxTilt} onChange={(e) => setMaxTilt(Number(e.target.value))} style={{ display: "block", width: 240 }} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: T.label, color: SC.text, marginBottom: S.sm }}>
            <input type="checkbox" checked={scenery} onChange={(e) => setScenery(e.target.checked)} /> Scenery (the Flight sim's hangar, tower, wall and trees)
          </label>
          {[["Motor time constant", "s", motorTau, setMotorTau, 0.005, 0.01, 0.5], ["Body drag coefficient", "", cd, setCd, 0.05, 0.1, 3]].map(([label, unit, val, setter, step, min, max]) => (
            <label key={label} style={{ display: "block", fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
              {label}{unit ? ` (${unit})` : ""} · declared
              <input type="number" value={val} step={step} min={min} max={max}
                onChange={(e) => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) setter(Math.min(max, Math.max(min, x))); }}
                style={{ display: "block", width: 120, background: SC.bg, color: SC.text, fontFamily: MONO, border: `1px solid ${SC.border}`, borderRadius: 4, padding: "4px 6px" }} />
            </label>
          ))}
          <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5, margin: 0, maxWidth: 340 }}>
            Neither constant can be sourced for an arbitrary build (dynamics.js says why); both are yours, as on the Flight sim tab.
          </p>
        </Card>

        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <Card title="What you are flying">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.text, lineHeight: 1.6 }}>
              <li><b>Computed.</b> The Flight sim tab's 6-DOF (Bauersfeld &amp; Scaramuzza's equations, RK4 at 2 ms), its ArduPilot-gain attitude controller, its altitude loop, the motor lag and the pack chain, stepped live as you fly. validation/drone-live-flight.mjs proves the steps equal the Flight sim's, bit for bit.</li>
              <li><b>Mode: Stabilize with altitude hold.</b> The sticks command an attitude; letting go levels the drone but does not stop it, because there is no position hold. Loiter is withdrawn: {LOITER_WITHDRAWN.reason}.</li>
              <li><b>Not modelled.</b> Wind and gusts; voltage sag (the pack holds its nominal voltage); ground effect; take-off and ground contact (touching down ends the flight); impacts (touching an obstacle ends the flight).</li>
              <li><b>Audit findings that bear on this flight.</b> F-101: drag is applied per body axis, not along the velocity, which makes forward-flight thrust and energy optimistic (thrust 0.89× and ideal power about 16 % low at 20 m/s on the audited airframe). F-102: the rate loop treats ArduPilot's normalised output as newton-metres, so the attitude response is softer than ArduPilot's.</li>
              <li><b>Drawn, not computed.</b> The drone is drawn from its parts: the propellers, the motors' stators, the ESC cases and the cells are at their published sizes, and the arms at the airframe builder's length; the frame plates, landing gear, wiring, flight controller and payload box are drawn. Also drawn: the propeller spin rate, the light, the shadows and the trail.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
