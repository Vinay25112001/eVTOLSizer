import React, { useState, useMemo, useRef } from "react";
import { SC } from "../lib/theme.js";
import { aircraftGeometry } from "../engine/geometry.js";
/* Moved to their own module so the mission animation draws the aircraft
   with the SAME projection rather than a second copy of it. */
import { project, bodyPolys, VIEWS } from "./projection.js";

/* =====================================================================
   LIVE 3D LAYOUT VIEWER — OpenVSP-style four-up, in the browser
   =====================================================================
   The OpenVSP tab could only export a .vsp3 and ask the user to go and open
   it in OpenVSP. This shows the sized aircraft immediately, in the four views
   OpenVSP itself presents (Top / Front / Side / Iso), so the layout can be
   checked without leaving the app.

   ── WHY IT IS HAND-ROLLED SVG AND NOT three.js ───────────────────────
   This app ships react, react-dom and recharts and nothing else. Adding a
   WebGL engine for a wireframe of ~10 primitives would be a large dependency
   for a small job, and this project runs offline on a machine where npm
   installs are awkward. Everything below is orthographic projection and
   painter's-algorithm ordering — a few dozen lines of arithmetic — rendered
   as SVG, which also means it prints and exports cleanly.

   ── THE GEOMETRY IS NOT DEFINED HERE ─────────────────────────────────
   It comes from engine/geometry.js, the SAME module the .vsp3 exporter uses.
   That is deliberate: a viewer that draws its own idea of the aircraft would
   drift from the file the user downloads, and this codebase has been bitten
   repeatedly by one quantity being derived in two places.
   ===================================================================== */


function ViewPane({ geo, yaw, pitch, label, w, h, showDims }) {
  const polys = useMemo(() => {
    const out = [];
    for (const b of geo.bodies) for (const q of bodyPolys(b)) {
      const proj = q.pts.map((pt) => project(pt, yaw, pitch));
      out.push({ ...q, proj, depth: proj.reduce((a, p) => a + p.depth, 0) / proj.length });
    }
    /* Painter's algorithm: far first. Enough for a convex-ish wireframe. */
    return out.sort((a, b) => a.depth - b.depth);
  }, [geo, yaw, pitch]);

  if (!polys.length) return null;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const q of polys) for (const p of q.proj) {
    if (p.u < uMin) uMin = p.u; if (p.u > uMax) uMax = p.u;
    if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v;
  }
  const pad = 0.10 * Math.max(uMax - uMin, vMax - vMin, 1e-6);
  const sx = (w - 16) / Math.max(1e-6, (uMax - uMin) + 2 * pad);
  const sy = (h - 26) / Math.max(1e-6, (vMax - vMin) + 2 * pad);
  const s  = Math.min(sx, sy);
  const ox = 8 + (w - 16 - s * (uMax - uMin)) / 2 - s * uMin;
  const oy = 20 + (h - 26 - s * (vMax - vMin)) / 2 - s * vMin;
  const X = (p) => ox + s * p.u, Y = (p) => oy + s * p.v;

  return (
    /* Darker ground than the surrounding panel so each pane reads as a
       viewport. Safe now that every body carries a bright stroke — it was NOT
       safe before, when the fuselage was SC.panel on SC.bg. */
    <svg width={w} height={h} style={{ background: SC.bg, borderRadius: 6, border: `1px solid ${SC.border}` }}>
      <text x={8} y={13} fill={SC.muted} fontSize={9} fontFamily="'DM Mono',monospace">{label}</text>
      {polys.map((q, i) => (
        <polygon key={i}
          points={q.proj.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(" ")}
          fill={q.fill} fillOpacity={q.op} stroke={q.stroke} strokeOpacity={0.9} strokeWidth={0.9}/>
      ))}
      {showDims && (
        <text x={w - 8} y={h - 6} fill={SC.muted} fontSize={8.5} textAnchor="end"
          fontFamily="'DM Mono',monospace">
          {((uMax - uMin)).toFixed(2)} × {((vMax - vMin)).toFixed(2)} m
        </text>
      )}
    </svg>
  );
}

export function Aircraft3D({ params, SR }) {
  const [yaw, setYaw]     = useState(VIEWS.iso.yaw);
  const [pitch, setPitch] = useState(VIEWS.iso.pitch);
  const [fourUp, setFourUp] = useState(true);
  const drag = useRef(null);

  const geo = useMemo(() => aircraftGeometry(params, SR), [params, SR]);
  if (!geo.bodies.length) {
    return <div style={{ color: SC.muted, fontSize: 11, padding: 16 }}>No sizing result to draw.</div>;
  }

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setYaw(d.yaw + (e.clientX - d.x) * 0.01);
    setPitch(Math.max(-1.5, Math.min(1.5, d.pitch + (e.clientY - d.y) * 0.01)));
  };
  const onUp = () => { drag.current = null; };

  const ext = geo.extents;
  const btn = (on) => ({ padding: "4px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10,
    fontFamily: "system-ui,sans-serif", background: on ? `${SC.amber}22` : "transparent",
    border: `1px solid ${on ? SC.amber : SC.border}`, color: on ? SC.amber : SC.muted });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <button type="button" style={btn(fourUp)} onClick={() => setFourUp(true)}>Four-up</button>
        <button type="button" style={btn(!fourUp)} onClick={() => setFourUp(false)}>Single (drag to rotate)</button>
        {!fourUp && Object.entries(VIEWS).map(([k, v]) => (
          <button key={k} type="button" style={btn(false)}
            onClick={() => { setYaw(v.yaw); setPitch(v.pitch); }}>{v.label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: SC.muted, fontFamily: "'DM Mono',monospace" }}>
          {ext && `L ${(ext.xMax - ext.xMin).toFixed(2)} × W ${(ext.yMax - ext.yMin).toFixed(2)} × H ${(ext.zMax - ext.zMin).toFixed(2)} m`}
        </span>
      </div>

      {fourUp ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ViewPane geo={geo} {...VIEWS.iso}   w={330} h={210} showDims/>
          <ViewPane geo={geo} {...VIEWS.top}   w={330} h={210} showDims/>
          <ViewPane geo={geo} {...VIEWS.side}  w={330} h={210} showDims/>
          <ViewPane geo={geo} {...VIEWS.front} w={330} h={210} showDims/>
        </div>
      ) : (
        <div onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ cursor: drag.current ? "grabbing" : "grab", display: "inline-block" }}>
          <ViewPane geo={geo} yaw={yaw} pitch={pitch} label="Drag to rotate" w={676} h={430} showDims/>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: SC.muted, fontFamily: "system-ui,sans-serif", lineHeight: 1.5 }}>
        <b>{geo.note}</b>
        <br/>
        <span style={{ color: SC.green }}>■</span> turning rotor&nbsp;&nbsp;
        <span style={{ color: SC.red }}>■</span> stopped in cruise&nbsp;&nbsp;
        <span style={{ color: SC.amber }}>■</span> cruise propulsor / V-tail&nbsp;&nbsp;
        <span style={{ color: SC.blue }}>■</span> wing
        <br/>
        Drawn from <code>engine/geometry.js</code> — the same layout the .vsp3
        export uses, so what you see is what downloads.
      </div>
    </div>
  );
}
