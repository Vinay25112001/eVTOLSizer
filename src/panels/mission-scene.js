/* =====================================================================
   MISSION SCENE — the flight profile as a flat list of primitives
   =====================================================================
   A time goes in, a drawing comes out. The drawing is a list of flat
   primitives in screen coordinates, exactly as scene3d.js does for the
   drone, and for the same reason: one description consumed by both the
   panel and a headless renderer, so a render gate freezes the drawing
   itself rather than a copy of it.

   NO CLOCK. `t` is an argument. Two calls with the same arguments give
   the same list, which is what makes a frame at a declared time
   reproducible.

   THE AIRCRAFT IS THE REAL AIRCRAFT. Its outline comes from
   aircraftGeometry through the same projection Aircraft3D uses, so the
   thing flying the mission is the configuration the user sized and the
   one the .vsp3 export writes. It is not a symbol chosen to look like
   an aircraft.

   ── THE TWO DISPLAY CONVENTIONS, BOTH STATED ON THE DRAWING ─────────
   A 100 km mission climbing to 1 km is 100:1. Drawn true, the whole
   flight is a horizontal line and nothing can be read off it. So:

     1. THE VERTICAL SCALE IS EXAGGERATED, by a factor this module
        computes and returns so the view can print it. An exaggeration
        nobody states is a lie about the climb angle.
     2. THE AIRCRAFT IS NOT TO SCALE. A 10 m aircraft on a 39 km axis is
        a quarter of a pixel. It is drawn at a fixed readable size, and
        the view says so.

   Neither convention touches a computed quantity: the PATH is to scale
   in both axes, and only the mapping to pixels is stretched.

   ── WHAT IS NOT DRAWN ───────────────────────────────────────────────
   THE AIRCRAFT IS DRAWN LEVEL, ALWAYS. Its attitude is not computed
   anywhere in this tool — attitude is the flight-path angle plus an
   angle of attack, and nothing solves for the second. Rotating the
   outline to the flight-path angle would look more convincing and would
   assert something the sizing never worked out; in the vertical legs it
   would be plainly wrong as well, since a lift+cruise aircraft does not
   stand on its tail to climb at 100 ft/min. The path carries the angle;
   the aircraft does not pretend to.

   The transition and the engine-failure transient are not drawn at all.
   mission-path.js carries the list and the citations; a view built on
   this prints them.
   ===================================================================== */
import { SC } from "../lib/theme.js";
import { missionPathAt, missionPathSamples, groundTrackM, PHASE_LABEL } from "../engine/mission-path.js";
import { project, bodyPolys, VIEWS } from "./projection.js";

const PAD = { l: 52, r: 16, t: 18, b: 34 };

/* The aircraft outline, projected once and normalised to a unit box so
   the caller can place it at any size without re-projecting. */
function aircraftOutline(geo) {
  if (!geo || !geo.bodies || !geo.bodies.length) return null;
  const polys = [];
  for (const b of geo.bodies) {
    for (const q of bodyPolys(b)) {
      const proj = q.pts.map((pt) => project(pt, VIEWS.side.yaw, VIEWS.side.pitch));
      polys.push({ fill: q.fill, stroke: q.stroke, op: q.op, proj,
        depth: proj.reduce((a, pp) => a + pp.depth, 0) / proj.length });
    }
  }
  if (!polys.length) return null;
  polys.sort((a, b) => a.depth - b.depth);   /* painter's algorithm, far first */

  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const q of polys) for (const pp of q.proj) {
    if (pp.u < uMin) uMin = pp.u; if (pp.u > uMax) uMax = pp.u;
    if (pp.v < vMin) vMin = pp.v; if (pp.v > vMax) vMax = pp.v;
  }
  const w = Math.max(1e-9, uMax - uMin), h = Math.max(1e-9, vMax - vMin);
  return { polys, uMin, vMin, w, h, aspect: w / h };
}

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

/* `phaseFilter` is null for the whole mission, or a phase key, in which
   case the axes frame that phase alone and the path outside it is drawn
   faintly so the phase keeps its place in the flight rather than
   floating free. */
export function buildMissionScene({ geo, r, p, t, w = 900, h = 340, phaseFilter = null, samples = 240 }) {
  const prims = [];
  const tPhases = r?.tPhases;
  if (!Array.isArray(tPhases) || tPhases.length < 7) {
    return { prims, meta: { ok: false, reason: "no mission in this result" } };
  }

  const path = missionPathSamples(r, p, samples).filter(Boolean);
  const now = missionPathAt(r, p, t);
  const trackM = groundTrackM(r);

  /* The window. A phase filter zooms both axes to that phase, with a
     margin, so "choose climb and watch the climb" shows the climb. */
  let x0 = 0, x1 = Math.max(1, trackM);
  let yTop = Math.max(10, Math.max(...path.map((s) => s.altitudeAglM)) * 1.12);
  const idx = phaseFilter ? ["TO", "Climb", "Cruise", "Desc", "Land", "Res"].indexOf(phaseFilter) : -1;
  if (idx >= 0) {
    const inPhase = path.filter((s) => s.phaseIndex === idx);
    if (inPhase.length) {
      const a = Math.min(...inPhase.map((s) => s.groundM));
      const b = Math.max(...inPhase.map((s) => s.groundM));
      const m = Math.max(50, (b - a) * 0.12);
      x0 = a - m; x1 = b + m;
      /* A vertical leg has no ground extent at all, so a window around
         it would be zero wide. Give it one the height can be read in. */
      if (b - a < 1) { x0 = a - 400; x1 = b + 400; }
      /* AND THE HEIGHT MUST FRAME THE PHASE TOO. Framing only the
         horizontal left the take-off — 15 m of climb — drawn against a
         1,120 m axis, where it was a speck on the ground line and the
         phase view was useless. Caught by rendering it and looking. */
      const hi = Math.max(...inPhase.map((s) => s.altitudeAglM));
      const lo = Math.min(...inPhase.map((s) => s.altitudeAglM));
      yTop = Math.max(hi * 1.15, hi + Math.max(2, (hi - lo) * 0.15), 5);
    }
  }

  const plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b;
  const sx = (m) => PAD.l + (m - x0) / Math.max(1e-9, x1 - x0) * plotW;
  const sy = (m) => PAD.t + plotH - (m / yTop) * plotH;

  /* The exaggeration this drawing applies, as a number the view prints.
     Metres per pixel vertically against metres per pixel horizontally. */
  const mPerPxX = (x1 - x0) / Math.max(1, plotW);
  const mPerPxY = yTop / Math.max(1, plotH);
  const exaggeration = mPerPxX / Math.max(1e-9, mPerPxY);

  /* ── axes ─────────────────────────────────────────────────────────── */
  const xStep = niceStep(x1 - x0, 6), yStep = niceStep(yTop, 4);
  for (let m = Math.ceil(x0 / xStep) * xStep; m <= x1; m += xStep) {
    prims.push({ type: "line", x1: sx(m), y1: PAD.t, x2: sx(m), y2: PAD.t + plotH,
      stroke: SC.border, width: 1, op: 0.35 });
    prims.push({ type: "text", x: sx(m), y: PAD.t + plotH + 14, anchor: "middle",
      text: `${(m / 1000).toFixed(x1 - x0 > 8000 ? 0 : 1)}`, fill: SC.subtle, size: 10 });
  }
  for (let m = 0; m <= yTop; m += yStep) {
    prims.push({ type: "line", x1: PAD.l, y1: sy(m), x2: PAD.l + plotW, y2: sy(m),
      stroke: SC.border, width: 1, op: 0.35 });
    prims.push({ type: "text", x: PAD.l - 6, y: sy(m) + 3, anchor: "end",
      text: `${Math.round(m)}`, fill: SC.subtle, size: 10 });
  }
  prims.push({ type: "text", x: PAD.l + plotW / 2, y: h - 6, anchor: "middle",
    text: "ground distance  km", fill: SC.muted, size: 10 });
  prims.push({ type: "text", x: 12, y: PAD.t + plotH / 2, anchor: "middle", rotate: -90,
    text: "height above the vertiport  m", fill: SC.muted, size: 10 });

  /* the ground */
  prims.push({ type: "line", x1: PAD.l, y1: sy(0), x2: PAD.l + plotW, y2: sy(0),
    stroke: SC.text, width: 1.5, op: 0.8 });

  /* ── the flight path ──────────────────────────────────────────────── */
  const PHASE_COLOR = { TO: SC.green, Climb: SC.blue, Cruise: SC.teal ?? SC.green,
                        Desc: SC.amber, Land: SC.green, Res: SC.muted };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (!a.flown || !b.flown) continue;      /* the reserve is not flown */
    const dim = idx >= 0 && b.phaseIndex !== idx;
    prims.push({ type: "line", x1: sx(a.groundM), y1: sy(a.altitudeAglM),
      x2: sx(b.groundM), y2: sy(b.altitudeAglM),
      stroke: PHASE_COLOR[b.phase] || SC.text, width: dim ? 1.2 : 2.4, op: dim ? 0.22 : 0.95 });
  }

  /* phase boundaries, labelled where there is room */
  for (let j = 0; j < 6; j++) {
    const s = missionPathAt(r, p, tPhases[j]);
    if (!s) continue;
    const inWindow = s.groundM >= x0 && s.groundM <= x1;
    if (!inWindow) continue;
    prims.push({ type: "line", x1: sx(s.groundM), y1: PAD.t, x2: sx(s.groundM), y2: sy(0),
      stroke: SC.border, width: 1, op: 0.55, dash: "3 3" });
    prims.push({ type: "text", x: sx(s.groundM) + 4, y: PAD.t + 10, anchor: "start",
      text: PHASE_LABEL[["TO", "Climb", "Cruise", "Desc", "Land", "Res"][j]],
      fill: SC.subtle, size: 9 });
  }

  /* ── the aircraft, at the position the path puts it ───────────────── */
  const out = aircraftOutline(geo);
  let aircraftPx = 0;
  if (out && now) {
    /* A fixed readable size, stated as not-to-scale. Kept modest so it
       does not swamp a zoomed phase window. */
    aircraftPx = Math.max(26, Math.min(64, plotW * 0.055));
    const scale = aircraftPx / Math.max(1e-9, out.w);
    const cx = sx(now.groundM), cy = sy(now.altitudeAglM);
    for (const q of out.polys) {
      prims.push({ type: "polygon", fill: q.fill, stroke: q.stroke, op: q.op, width: 0.7,
        pts: q.proj.map((pp) => [
          cx + (pp.u - out.uMin - out.w / 2) * scale,
          cy + (pp.v - out.vMin - out.h / 2) * scale]) });
    }
  }

  /* where it is, in one line, anchored to the aircraft */
  if (now) {
    prims.push({ type: "text", x: sx(now.groundM), y: sy(now.altitudeAglM) - aircraftPx * 0.45 - 6,
      anchor: "middle", size: 10, fill: SC.text,
      text: `${now.label} — ${Math.round(now.altitudeAglM)} m, ${(now.groundM / 1000).toFixed(1)} km, ${now.speedMS.toFixed(1)} m/s, ${Math.round(now.powerKW)} kW` });
  }

  return {
    prims,
    meta: {
      ok: true,
      exaggeration,
      aircraftToScale: false,
      aircraftPx,
      attitudeDrawn: false,
      trackM,
      now,
      xRangeM: [x0, x1],
      yTopM: yTop,
    },
  };
}
