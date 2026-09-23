/* =====================================================================
   PROJECTION — aircraft geometry to flat polygons, in one place
   =====================================================================
   These three functions were private to Aircraft3D.jsx, which was fine
   while it was the only view that drew the aircraft. The mission
   animation draws the same aircraft at a position on a flight profile,
   and a second copy of the projection is how two views of one aircraft
   start disagreeing — the same argument geometry.js already makes about
   the viewer and the .vsp3 exporter sharing one module.

   Nothing here was changed in the move. The render freeze compares the
   rendered PNGs byte for byte, so if a character of this had drifted the
   gate would have said so rather than this comment.

   They are pure: geometry in, polygons out, no React and no clock.
   ===================================================================== */
import { SC } from "../lib/theme.js";

/* Orthographic projection with yaw/pitch, aircraft axes -> screen. */
export function project(pt, yaw, pitch) {
  const [x, y, z] = pt;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = x * cy + y * sy;
  const y1 = -x * sy + y * cy;
  const z1 = z;
  return { u: y1, v: -(z1 * cp - x1 * sp), depth: x1 * cp + z1 * sp };
}

/* A circle in 3D (rotor disk) sampled as a polygon in the plane z = const. */
export function diskPoints(cx, cy, cz, r, n = 28, tilted = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    /* A tilting rotor is drawn in its CRUISE attitude (disk in the x-normal
       plane); a lift rotor is drawn horizontal. That is the visual difference
       between a tiltrotor and a lift+cruise, so it should be visible. */
    pts.push(tilted
      ? [cx, cy + r * Math.cos(t), cz + r * Math.sin(t)]
      : [cx + r * Math.cos(t), cy + r * Math.sin(t), cz]);
  }
  return pts;
}

export function bodyPolys(b) {
  const P = [];
  if (b.kind === "fuselage") {
    const n = 18, r = b.diam / 2;
    /* Fuselage as a lofted body of revolution — a fineness-ratio profile so a
       side view reads as an aircraft rather than a cylinder. */
    const prof = (s) => r * Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, s)), 0.62));
    for (let i = 0; i < n; i++) {
      const s0 = i / n, s1 = (i + 1) / n;
      const x0 = s0 * b.len, x1 = s1 * b.len;
      const r0 = prof(s0), r1 = prof(s1);
      for (let k = 0; k < 12; k++) {
        const t0 = (2 * Math.PI * k) / 12, t1 = (2 * Math.PI * (k + 1)) / 12;
        P.push({ pts: [
          [x0, r0 * Math.cos(t0), r0 * Math.sin(t0)],
          [x1, r1 * Math.cos(t0), r1 * Math.sin(t0)],
          [x1, r1 * Math.cos(t1), r1 * Math.sin(t1)],
          [x0, r0 * Math.cos(t1), r0 * Math.sin(t1)]],
          /* CONTRAST, and this was the whole bug on first release: the
             fuselage was filled SC.panel (#0F1520) on a SC.bg (#0A0E14)
             background — near-black on near-black — while every other body
             drew at 0.16-0.30 fill opacity. The view rendered 968 polygons
             and looked like blank space. Bodies now carry a visible stroke
             and a fill with real contrast against the panel. */
          fill: SC.muted, stroke: SC.text, op: 0.30 });
      }
    }
  } else if (b.kind === "wing") {
    const sw = Math.tan((b.sweepDeg || 0) * Math.PI / 180);
    for (const s of [1, -1]) {
      const yT = s * b.span / 2;
      const xT = b.x + Math.abs(yT) * sw;
      P.push({ pts: [
        [b.x, 0, b.z], [b.x + b.rootChord, 0, b.z],
        [xT + b.tipChord, yT, b.z], [xT, yT, b.z]],
        /* SC.teal and SC.green are the SAME hex (#00C896) in this theme, so a
           teal wing was indistinguishable from a green turning rotor while the
           legend claimed otherwise. The wing uses SC.blue (advisory) instead. */
        fill: SC.blue, stroke: SC.blue, op: 0.55 });
    }
  } else if (b.kind === "vtail") {
    const g = (b.dihedralDeg || 45) * Math.PI / 180;
    for (const s of [1, -1]) {
      const yT = s * b.span * Math.sin(g), zT = b.z + b.span * Math.cos(g);
      P.push({ pts: [
        [b.x, 0, b.z], [b.x + b.rootChord, 0, b.z],
        [b.x + b.rootChord * 0.6 + b.tipChord, yT, zT], [b.x + b.rootChord * 0.6, yT, zT]],
        fill: SC.amber, stroke: SC.amber, op: 0.55 });
    }
  } else if (b.kind === "boom") {
    const r = Math.max(0.03, b.radius), y0 = b.y0 ?? b.y;
    for (let k = 0; k < 8; k++) {
      const t0 = (2 * Math.PI * k) / 8, t1 = (2 * Math.PI * (k + 1)) / 8;
      P.push({ pts: [
        [b.x0, y0 + r * Math.cos(t0), b.z + r * Math.sin(t0)],
        [b.x1, b.y + r * Math.cos(t0), b.z + r * Math.sin(t0)],
        [b.x1, b.y + r * Math.cos(t1), b.z + r * Math.sin(t1)],
        [b.x0, y0 + r * Math.cos(t1), b.z + r * Math.sin(t1)]],
        fill: SC.muted, stroke: SC.text, op: 0.75 });
    }
  } else if (b.kind === "rotor" || b.kind === "pusher") {
    const col = b.kind === "pusher" ? SC.amber : b.stopped ? SC.red : SC.green;
    P.push({ pts: diskPoints(b.x, b.y, b.z, b.radius, 28, b.tilting || b.kind === "pusher"),
      fill: col, stroke: col, op: b.stopped ? 0.34 : 0.50 });
  }
  return P;
}

/* SIDE AND FRONT WERE THE WRONG WAY ROUND, and had been since the view
   was written. project() puts the screen's horizontal axis at u = y at
   yaw 0, and y is SPANWISE — so `side: { yaw: 0 }` was looking straight
   down the fuselage and the pane labelled "Side" was the front
   elevation. The two are easy to confuse on a layout whose fuselage is
   short and whose span is wide, which is every configuration here.

   Measured, on a nose at x=0, tail at x=10, tips at y=+/-6:

     yaw 0      nose-tail spread 0.0, tip-tip spread 12.0   -> FRONT
     yaw pi/2   nose-tail spread 10.0, tip-tip spread 0.0   -> SIDE

   Found by drawing an aircraft on a flight profile with VIEWS.side and
   getting one seen nose-on. The labels were right about what the reader
   wanted; the angles were wrong. Swapping the angles keeps the four-up
   in its usual order and makes each pane show what it says. */
export const VIEWS = {
  iso:   { yaw: -0.62, pitch: 0.42, label: "Isometric" },
  top:   { yaw: 0,     pitch: Math.PI / 2 - 0.0001, label: "Top" },
  side:  { yaw: Math.PI / 2, pitch: 0, label: "Side" },
  front: { yaw: 0,     pitch: 0,    label: "Front" },
};
