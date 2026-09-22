/* =====================================================================
   DRONE SCENE — one description of the drawing, two consumers
   =====================================================================
   WHY THIS EXISTS. render-freeze.mjs renders the eVTOL aircraft to PNG
   and byte-compares it, because every geometry defect this project has
   ever shipped was found by a human looking at the screen and never by a
   harness. The drone views were not covered by it: `tools/render3d.mjs`
   draws the eVTOL MESH and contains the string "drone" zero times, so
   the airframe and flight views had no regression protection at all.

   The tempting fix is a second headless renderer that draws the drone
   the way the panel draws it. That fails the moment the two drift: the
   freeze would then guard a copy of the drawing rather than the drawing.
   So the scene is described ONCE, here, as an ordered list of flat
   primitives in screen coordinates, and both consumers render the same
   list — `Drone3D.jsx` turns it into SVG elements, `tools/render-drone.mjs`
   turns it into pixels. A geometry change reaches the frozen PNG because
   it reaches this list first.

   WHAT IS IN THE LIST AND WHAT IS NOT. Geometry is here: the ground grid,
   the shadows, the arms, the discs, the swept annuli, the motor stators,
   the cells, the pod, the nose marker, the blades. Text labels are NOT —
   a label is not geometry, glyph rasterising is not worth writing, and a
   font change should not fail a geometry gate. The panel draws the text
   itself from the same numbers.

   DETERMINISM. The blade angle is an input (`spinDeg`), not a clock read,
   so the caller decides. The panel passes its animation; the renderer
   passes a fixed angle. Nothing here reads time or randomness.

   COORDINATES. Everything is already projected to screen x/y by
   geometry3d's orthographic `project`, so a consumer needs no 3D maths —
   only the ability to fill a polygon and stroke a line. */
import {
  buildAirframe, project, discPath, depthSort, DEG,
} from "./geometry3d.js";

/* Shared so the panel and the renderer cannot disagree about them. */
export const SCENE_STYLE = Object.freeze({
  ccw: "#4ea1ff", cw: "#f2a33c", dead: "#e0574a",
  arm: "#5d7387", armLit: "#8fa6b8", armDark: "#2b3946", armDead: "#7d2a22",
  statorWall: "#4a5b6b", statorTop: "#93a9ba",
  cellWall: "#2f5d4c", cellTop: "#79bda1",
  grid: "#5b7f9e", shadow: "#03070c", pod: "#8595A5", amber: "#E8A020",
  sky: "#0a111b", outline: "#0a1118",
  groundDropFraction: 0.9,
  blurGhosts: 4, ghostSweepDeg: 24, sweptOpacity: 0.16,
});

/* A ring of screen points for a circle of `radiusM` in the body plane.
   Sampled rather than approximated, for the reason discPath gives. */
function ring(centre, radiusM, v, samples) {
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const p = project({
      x: centre.x + radiusM * Math.cos(t),
      y: centre.y + radiusM * Math.sin(t),
      z: centre.z,
    }, v);
    pts.push([p.sx, p.sy]);
  }
  return pts;
}

/* The wall of a cylinder standing on `base` and rising heightM along -z
   (z is DOWN), as one closed band — under an orthographic projection of
   a convex solid that band is exactly its silhouette. */
function cylinder(base, radiusM, heightM, v, samples) {
  const bottom = ring(base, radiusM, v, samples);
  const top = ring({ x: base.x, y: base.y, z: base.z - heightM }, radiusM, v, samples);
  return { wall: [...bottom, ...[...top].reverse()], top, bottom };
}

export function buildDroneScene({
  frame, propellerDiameterM, tipGapFraction = 0.10,
  stator = null, cells = null,
  W = 720, H = 540, viewYawDeg = 38, viewPitchDeg = 34,
  spinDeg = 0, failed = new Set(), samples = 48,
} = {}) {
  const air = buildAirframe({ frame, propellerDiameterM, tipGapFraction });
  const scale = (W * 0.40) / (air.armLengthM + air.propRadiusM);
  const v = { scale, cx: W / 2, cy: H / 2 + 6, viewYawDeg, viewPitchDeg };
  const origin = project({ x: 0, y: 0, z: 0 }, v);
  const groundZ = air.propRadiusM * SCENE_STYLE.groundDropFraction;
  const reach = air.armLengthM + air.propRadiusM;
  const S = SCENE_STYLE;
  const out = [];
  const isDead = (m) => failed.has(m);
  /* The panel needs each disc's outline again as a click target. Handing
     it back costs nothing and stops the panel from sampling its own
     slightly different ring. */
  const discRings = {};

  /* 1. reference plane, 100 mm squares, BELOW the aircraft */
  for (let i = 0; i < 15; i++) {
    const t = (i - 7) * 0.1;
    const lim = reach * 1.15;
    if (Math.abs(t) > lim) continue;
    const fade = Math.max(0.05, 0.30 * (1 - Math.abs(t) / (lim * 1.25)));
    const a = project({ x: t, y: -lim, z: groundZ }, v), b = project({ x: t, y: lim, z: groundZ }, v);
    const c = project({ x: -lim, y: t, z: groundZ }, v), d = project({ x: lim, y: t, z: groundZ }, v);
    out.push({ k: "line", a: [a.sx, a.sy], b: [b.sx, b.sy], stroke: S.grid, width: 1, opacity: fade, role: "grid" });
    out.push({ k: "line", a: [c.sx, c.sy], b: [d.sx, d.sy], stroke: S.grid, width: 1, opacity: fade, role: "grid" });
  }

  /* 2. shadows: each disc's own outline on that plane */
  for (const r of air.rotors)
    out.push({ k: "poly", pts: ring({ x: r.x, y: r.y, z: groundZ }, r.radiusM * 0.96, v, samples),
               fill: S.shadow, fillOpacity: 0.5, blur: 6, role: "shadow" });
  out.push({ k: "poly", pts: ring({ x: 0, y: 0, z: groundZ }, air.bodyRadiusM, v, samples),
             fill: S.shadow, fillOpacity: 0.5, blur: 6, role: "shadow" });

  /* 3. nose marker — the +x axis */
  const nose = project({ x: reach * 1.06, y: 0, z: 0 }, v);
  out.push({ k: "line", a: [origin.sx, origin.sy], b: [nose.sx, nose.sy],
             stroke: S.amber, width: 1.5, opacity: 0.85, dash: "5 4", role: "nose" });
  out.push({ k: "circle", c: [nose.sx, nose.sy], r: 2.5, fill: S.amber, role: "nose" });

  /* 4. the pod — DECLARED, hollow so it cannot be read as a measurement */
  out.push({ k: "circle", c: [origin.sx, origin.sy], r: Math.max(6, air.bodyRadiusM * scale),
             stroke: S.pod, width: 1.5, dash: "3 3", opacity: 0.75, role: "pod" });

  /* 5. the rotors, back to front */
  for (const r of depthSort(air.rotors, v)) {
    const dead = isDead(r.motor);
    const c = project(r, v);
    const colour = dead ? S.dead : r.rotation === "CCW" ? S.ccw : S.cw;

    /* arm as a tapered solid rather than a flat stroke */
    const wRoot = Math.max(2.5, air.propRadiusM * 0.10 * scale);
    const wTip = Math.max(1.8, air.propRadiusM * 0.055 * scale);
    const ux = c.sx - origin.sx, uy = c.sy - origin.sy;
    const L = Math.hypot(ux, uy) || 1;
    const px = -uy / L, py = ux / L;
    out.push({ k: "poly", motor: r.motor, role: "arm",
      pts: [[origin.sx + px * wRoot, origin.sy + py * wRoot],
            [c.sx + px * wTip, c.sy + py * wTip],
            [c.sx - px * wTip, c.sy - py * wTip],
            [origin.sx - px * wRoot, origin.sy - py * wRoot]],
      fill: dead ? S.armDead : S.arm, gradient: dead ? "arm-dead" : "arm",
      stroke: S.outline, width: 0.7, opacity: dead ? 0.6 : 1 });

    /* the swept annulus — the area the blades actually cover */
    if (!dead)
      out.push({ k: "poly", motor: r.motor, role: "swept",
        pts: ring(r, r.radiusM * 0.94, v, samples),
        hole: ring(r, r.radiusM * 0.12, v, samples),
        fill: colour, fillOpacity: S.sweptOpacity, evenOdd: true });

    /* the disc: the MEASURED propeller diameter */
    const discRing = ring(r, r.radiusM, v, samples);
    discRings[r.motor] = discRing;
    out.push({ k: "poly", motor: r.motor, role: "disc",
      pts: discRing,
      fill: colour, fillOpacity: 0.12, gradient: `disc-${dead ? "dead" : r.rotation === "CCW" ? "ccw" : "cw"}`,
      stroke: colour, width: dead ? 1.2 : 1.6, strokeOpacity: dead ? 0.55 : 0.9,
      dash: dead ? "4 3" : null });

    /* motor stator — PUBLISHED diameter and height, never the can */
    if (stator) {
      const cyl = cylinder(r, stator.radiusM, stator.heightM, v, 22);
      out.push({ k: "poly", motor: r.motor, role: "stator-wall", pts: cyl.wall,
                 fill: S.statorWall, gradient: "stator", stroke: S.outline, width: 0.7,
                 opacity: dead ? 0.45 : 1 });
      out.push({ k: "poly", motor: r.motor, role: "stator-top", pts: cyl.top,
                 fill: S.statorTop, stroke: S.outline, width: 0.7, opacity: dead ? 0.45 : 1 });
    } else {
      out.push({ k: "circle", motor: r.motor, role: "hub", c: [c.sx, c.sy], r: 5,
                 fill: dead ? S.dead : "#16202c", stroke: colour, width: 2 });
    }

    /* blades: strokes, not scaled solids. No datasheet in this survey
       publishes a blade chord, so a tapered planform would be invented. */
    if (!dead) {
      const hubZ = r.z - (stator ? stator.heightM : 0);
      const hub = project({ x: r.x, y: r.y, z: hubZ }, v);
      for (let g = 0; g < S.blurGhosts; g++) {
        const lag = (g / Math.max(1, S.blurGhosts - 1)) * S.ghostSweepDeg;
        const op = 0.85 * Math.pow(1 - g / S.blurGhosts, 2.8);
        for (const b of [0, 180]) {
          const ang = (r.rotation === "CCW" ? spinDeg - lag : -(spinDeg - lag)) + b;
          const tip = project({
            x: r.x + r.radiusM * 0.94 * Math.cos(ang * DEG),
            y: r.y + r.radiusM * 0.94 * Math.sin(ang * DEG),
            z: hubZ,
          }, v);
          out.push({ k: "line", motor: r.motor, role: "blade",
            a: [hub.sx, hub.sy], b: [tip.sx, tip.sy],
            stroke: colour, width: g === 0 ? 2.4 : 1.5, opacity: op, cap: "round" });
        }
      }
    }
  }

  /* 6. the cells, after the arms: they stand UP from the arm plane, so an
     arm at z = 0 does not pass in front of them */
  if (cells) {
    const ordered = [...cells.cells]
      .map((cl) => ({ cl, depth: project(cl, v).depth }))
      .sort((a, b) => a.depth - b.depth);
    for (const { cl } of ordered) {
      const cyl = cylinder(cl, cl.radiusM, cl.heightM, v, 20);
      out.push({ k: "poly", role: "cell-wall", pts: cyl.wall, fill: S.cellWall,
                 gradient: "cell", stroke: "#08120e", width: 0.7 });
      out.push({ k: "poly", role: "cell-top", pts: cyl.top, fill: S.cellTop,
                 stroke: "#08120e", width: 0.7 });
    }
  }

  return { W, H, v, air, origin, groundZ, scale, primitives: out, discRings };
}

/* The panel needs SVG `d` strings; the renderer needs points. Kept here
   so the two cannot disagree about winding or closure. */
export function pathOf(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + " Z";
}
