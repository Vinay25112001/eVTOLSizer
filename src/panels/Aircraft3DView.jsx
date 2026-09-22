import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { SC } from "../lib/theme.js";
import { aircraftGeometry } from "../engine/geometry.js";
import { buildMesh } from "../engine/mesh.js";

/* =====================================================================
   INTERACTIVE 3D AIRCRAFT VIEW
   =====================================================================
   Drag to orbit, wheel to zoom, shift-drag to pan — the model turns under the
   mouse the way NASA's own RAVEN viewer does, instead of four fixed
   projections. It redraws whenever a sizing parameter changes, so the aircraft
   on screen is always the aircraft the loop just sized.

   ── WHY IT IS HAND-ROLLED AND NOT three.js ───────────────────────────
   This app ships react, react-dom and recharts and nothing else, and it runs
   on a machine where installs are awkward. The whole renderer is a perspective
   transform, a painter's-algorithm sort and flat shading — a few hundred lines
   against a multi-megabyte WebGL engine, for a model of about a thousand
   polygons. Canvas 2D draws that comfortably at interactive rates.

   ── THE GEOMETRY IS NOT DEFINED HERE ─────────────────────────────────
   It comes from engine/geometry.js — the SAME module the .vsp3 exporter uses,
   laid out on NASA's measured RAVEN/SWFT station fractions. A viewer with its
   own idea of the aircraft would drift from the file the user downloads.
   ===================================================================== */

import { PALETTE } from "../engine/mesh.js";

/* Rotate a point by yaw (about z) then pitch (about the screen-horizontal). */
function rotate([x, y, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const X = x * cy - y * sy, Y = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [X, Y * cp - z * sp, Y * sp + z * cp];
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const L = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / L, n[1] / L, n[2] / L];
}

export function Aircraft3DView({ params, SR, height = 460 }) {
  const canvasRef = useRef(null);
  const dragRef   = useRef(null);
  const [view, setView] = useState({ yaw: -0.62, pitch: 0.42, zoom: 1, panX: 0, panY: 0 });
  const [showDisks, setShowDisks] = useState(true);
  /* ── CONVERSION SLIDER ────────────────────────────────────────────────
     The tilt mechanism is the most interesting thing about half these
     layouts and it was only visible by exporting the .vsp3 and opening
     OpenVSP. The angle is in RAVEN'S OWN CONVENTION — 90 deg is helicopter
     mode, 0 deg is airplane mode (Wright & Silva, corpus S3568) — and the
     travel limits are RAVEN's hinge geoms: JointRotMin 0, JointRotMax 110,
     released at 90. So the slider does not sweep an arbitrary range; it
     sweeps the range the hinge actually has, including the 20 deg PAST
     hover that SWFT's hinge allows.

     buildMesh already rotates the rotor and its nacelle about the wing-plane
     pivot, so nothing here computes geometry — it only chooses the angle. */
  const [tiltDeg, setTiltDeg] = useState(90);
  const [playing, setPlaying] = useState(false);

  const geo   = useMemo(() => aircraftGeometry(params, SR), [params, SR]);
  const faces = useMemo(() => buildMesh(geo, PALETTE, { nacelleTiltDeg: tiltDeg }),
    [geo, tiltDeg]);
  /* Does this aircraft convert at all? A lift+cruise and a multicopter do not,
     and offering them a conversion slider would suggest a mechanism they do
     not have. */
  const canTilt = useMemo(
    () => (geo?.bodies || []).some(b => b.kind === "rotor" && b.tilting && b.hinge),
    [geo]);

  /* Sweep helicopter -> airplane -> back, at a rate that reads as a conversion
     rather than a flicker. Stops itself if the layout cannot tilt. */
  useEffect(() => {
    if (!playing || !canTilt) return undefined;
    let raf = 0, last = 0, dir = -1;
    const step = (t) => {
      if (last) {
        const dt = Math.min(64, t - last);
        setTiltDeg(prev => {
          let next = prev + dir * dt * 0.045;      // ~2 s end to end
          if (next <= 0) { next = 0; dir = 1; }
          else if (next >= 110) { next = 110; dir = -1; }
          return next;
        });
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, canTilt]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !geo.extents) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const e = geo.extents;
    const cx = (e.xMin + e.xMax) / 2, cy = (e.yMin + e.yMax) / 2, cz = (e.zMin + e.zMax) / 2;
    const spanMax = Math.max(e.xMax - e.xMin, e.yMax - e.yMin, e.zMax - e.zMin) || 1;
    const scale = (Math.min(W, H) * 0.78 * view.zoom) / spanMax;
    const camD = spanMax * 3.2;                      // perspective distance

    const project = (p) => {
      const r = rotate([p[0] - cx, p[1] - cy, p[2] - cz], view.yaw, view.pitch);
      const depth = r[1] + camD;                     // +y into the screen after rotation
      const f = camD / Math.max(0.05 * camD, depth);
      return { x: W / 2 + view.panX + r[0] * scale * f,
               y: H / 2 + view.panY - r[2] * scale * f, depth };
    };

    /* Light from over the viewer's left shoulder, in world space. */
    const LIGHT = (() => { const v = [-0.45, -0.75, 0.5];
      const L = Math.hypot(...v); return v.map(c => c / L); })();

    const drawList = [];
    for (const f of faces) {
      if (f.thin && !showDisks) continue;
      const pts = f.v.map(project);
      if (pts.some(p => !isFinite(p.x) || !isFinite(p.y))) continue;
      const n = faceNormal(f.v[0], f.v[1], f.v[2]);
      const lam = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const shade = 0.34 + 0.66 * lam;               // ambient + diffuse
      drawList.push({ pts, colour: f.colour, shade, thin: !!f.thin,
                      depth: pts.reduce((s, p) => s + p.depth, 0) / pts.length });
    }
    /* Painter's algorithm: far faces first. */
    drawList.sort((a, b) => b.depth - a.depth);

    for (const d of drawList) {
      const [r, g, b] = d.colour;
      const k = d.thin ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(d.pts[0].x, d.pts[0].y);
      for (let i = 1; i < d.pts.length; i++) ctx.lineTo(d.pts[i].x, d.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(r * d.shade)},${Math.round(g * d.shade)},`
                    + `${Math.round(b * d.shade)},${d.thin ? 0.30 : 1})`;
      ctx.fill();
      if (!d.thin) {
        ctx.strokeStyle = `rgba(0,0,0,0.22)`;
        ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
  }, [faces, geo, view, showDisks, tiltDeg]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const on = () => draw();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [draw]);

  /* ── MOUSE: drag orbits, shift-drag pans, wheel zooms ───────────────── */
  const onDown = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    dragRef.current = { x: ev.clientX - r.left, y: ev.clientY - r.top,
                        pan: ev.shiftKey || ev.button === 1 || ev.button === 2,
                        yaw: view.yaw, pitch: view.pitch,
                        panX: view.panX, panY: view.panY };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev) => {
    const d = dragRef.current;
    if (!d) return;
    const r = canvasRef.current.getBoundingClientRect();
    const dx = (ev.clientX - r.left) - d.x, dy = (ev.clientY - r.top) - d.y;
    if (d.pan) setView(v => ({ ...v, panX: d.panX + dx, panY: d.panY + dy }));
    else setView(v => ({ ...v, yaw: d.yaw + dx * 0.0095,
      /* Clamp pitch just inside the poles so the model never flips through
         vertical, which reads as a glitch rather than a rotation. */
      pitch: Math.max(-1.45, Math.min(1.45, d.pitch + dy * 0.0095)) }));
  };
  const onUp = () => { dragRef.current = null; };
  /* ── WHEEL ZOOM MUST BE A NATIVE, NON-PASSIVE LISTENER ────────────────
     This was a React `onWheel` prop that called preventDefault(), and the
     call did nothing: React 18 registers wheel at the ROOT container as a
     PASSIVE listener, so preventDefault() inside it is ignored and Chrome
     logs "Unable to preventDefault inside passive event listener". The
     gesture then fell through to the browser — ctrl+wheel zoomed the whole
     page and a plain wheel scrolled it, so zooming the aircraft zoomed the
     application around it.

     Binding straight to the canvas with { passive: false } is the only way
     to keep the gesture inside the viewer. stopPropagation as well, so a
     scrollable ancestor cannot claim it either.

     deltaY is normalised by deltaMode first: a mouse wheel reports pixels
     (0), but some report lines (1) and some pages (2), and treating 3 lines
     as 3 pixels makes those devices barely zoom at all. The exponential
     keeps each notch a constant RATIO, so zooming in and back out returns
     to exactly where it started instead of drifting. */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheelNative = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1;
      const k = Math.exp(-ev.deltaY * unit * 0.0015);
      setView(v => ({ ...v, zoom: Math.max(0.25, Math.min(6, v.zoom * k)) }));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const PRESETS = [
    ["Iso",   { yaw: -0.62, pitch: 0.42 }],
    ["Top",   { yaw: 0,     pitch: 1.44 }],
    ["Front", { yaw: 0,     pitch: 0    }],
    ["Side",  { yaw: -Math.PI / 2, pitch: 0 }],
  ];
  const btn = (on) => ({
    background: on ? SC.advisory + "22" : SC.panel, color: on ? SC.advisory : SC.muted,
    border: `1px solid ${on ? SC.advisory : SC.border}`, borderRadius: 5,
    padding: "3px 9px", fontSize: 10.5, cursor: "pointer", fontFamily: "system-ui,sans-serif",
  });

  if (!geo.extents) {
    return <div style={{ color: SC.muted, fontSize: 12, padding: 16 }}>
      Size a design to see the model.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {PRESETS.map(([label, v]) => (
          <button key={label} type="button" style={btn(false)}
            onClick={() => setView(s => ({ ...s, ...v }))}>{label}</button>
        ))}
        <button type="button" style={btn(showDisks)} onClick={() => setShowDisks(s => !s)}>
          rotor disks</button>
        <button type="button" style={btn(false)}
          onClick={() => setView({ yaw: -0.62, pitch: 0.42, zoom: 1, panX: 0, panY: 0 })}>
          reset</button>
        <span style={{ color: SC.muted, fontSize: 10.5, marginLeft: 4 }}>
          drag to rotate · wheel to zoom · shift-drag to pan
        </span>
      </div>

      {canTilt && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                      padding: "6px 8px", borderRadius: 6,
                      border: `1px solid ${SC.border}`, background: SC.panel }}>
          <button type="button" style={btn(playing)} onClick={() => setPlaying(p2 => !p2)}>
            {playing ? "pause" : "▶ convert"}</button>
          <input type="range" min={0} max={110} step={1} value={Math.round(tiltDeg)}
            onChange={(e) => { setPlaying(false); setTiltDeg(+e.target.value); }}
            style={{ flex: "1 1 180px", accentColor: SC.teal, cursor: "pointer" }}
            aria-label="nacelle tilt angle" />
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11,
                         color: SC.text, minWidth: 116 }}>
            {Math.round(tiltDeg)}°{" "}
            <span style={{ color: SC.muted }}>
              {tiltDeg >= 88 ? "helicopter" : tiltDeg <= 3 ? "airplane"
                : tiltDeg > 90 ? "past hover" : "converting"}
            </span>
          </span>
          {[["airplane", 0], ["45°", 45], ["hover", 90]].map(([lab, v]) => (
            <button key={lab} type="button" style={btn(Math.round(tiltDeg) === v)}
              onClick={() => { setPlaying(false); setTiltDeg(v); }}>{lab}</button>
          ))}
          <span style={{ color: SC.muted, fontSize: 10 }}>
            RAVEN convention · 90° helicopter, 0° airplane · hinge travels 0–110°
          </span>
        </div>
      )}

      <canvas ref={canvasRef}
        style={{ width: "100%", height, display: "block", borderRadius: 8,
                 background: `linear-gradient(180deg, ${SC.panel} 0%, ${SC.bg} 100%)`,
                 border: `1px solid ${SC.border}`, cursor: dragRef.current ? "grabbing" : "grab",
                 touchAction: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerLeave={onUp}
        onContextMenu={(e) => e.preventDefault()} />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, color: SC.muted }}>
        {[["Tilting rotor", PALETTE.diskTilt], ["Lift-only rotor", PALETTE.diskLift],
          ["Cruise pusher", PALETTE.diskPush], ["Airframe", PALETTE.body]].map(([l, c]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2,
                           background: `rgb(${c[0]},${c[1]},${c[2]})` }} />{l}
          </span>
        ))}
      </div>

      {/* INTERFERENCES, NAMED. A picture will happily show a propeller through
          a tail; the geometry checks for it in 3D and says which parts foul. */}
      {geo.collisions?.length > 0 && (
        <div style={{ background: SC.warning + "14", border: `1px solid ${SC.warning}55`,
                      borderRadius: 8, padding: "9px 11px", fontSize: 11.5,
                      color: SC.primary, lineHeight: 1.55 }}>
          <b style={{ color: SC.warning }}>
            {geo.collisions.length} interference{geo.collisions.length > 1 ? "s" : ""}</b>
          <ul style={{ margin: "5px 0 0 16px", padding: 0 }}>
            {geo.collisions.slice(0, 6).map((c, i) => (
              <li key={i}><b>{c.a}</b> / <b>{c.b}</b> — {c.detail}</li>))}
          </ul>
        </div>
      )}
      {geo.boomCountMismatch && (
        <div style={{ background: SC.caution + "12", border: `1px solid ${SC.caution}44`,
                      borderRadius: 8, padding: "9px 11px", fontSize: 11.5,
                      color: SC.primary, lineHeight: 1.55 }}>
          <b style={{ color: SC.caution }}>Boom count disagrees with the mass model.</b>{" "}
          The layout needs <b>{geo.boomCountMismatch.boomsNeeded}</b> booms — each carries one
          rotor forward and one aft — while <code>configuration.js</code> sizes the boom mass
          for <b>{geo.boomCountMismatch.boomsSized}</b>. Archer, the reference for this layout,
          flies twelve rotors on six booms. The airframe drawn here and the booms that were
          weighed are not the same structure.
        </div>
      )}
      {geo.tailArmShort && (
        <div style={{ color: SC.caution, fontSize: 11.5, lineHeight: 1.55 }}>
          <b>Tail arm shortened by {geo.tailArmShort.shortfall.toFixed(2)} m.</b> The stability
          solution asked for the tail at x = {geo.tailArmShort.wanted.toFixed(2)} m, but its
          root chord will not fit on a {(params.fusLen ?? 0).toFixed(1)} m fuselage — the
          trailing edge would hang past the tail cone. The fuselage length is an input that
          does not grow with gross weight, so a heavy design gets a short body.
        </div>
      )}
      {geo.rotorsOverlap && (
        <div style={{ color: SC.caution, fontSize: 11.5, lineHeight: 1.55 }}>
          The rotor row is wider than the wing it is sized for — see the
          <b> Rotors fit within the span</b> check.
        </div>
      )}

      <div style={{ color: SC.muted, fontSize: 11, lineHeight: 1.55 }}>{geo.note}</div>
    </div>
  );
}
