/* =====================================================================
   RENDER MISSION — the flight profile, headless, so it can be LOOKED AT
   =====================================================================
   Same argument as render3d and render-drone: a mission animation is
   easy to make look right and be wrong, and the defects that matter are
   the ones a person sees in a second and a test never thinks to ask
   about. This renders a frame at a DECLARED TIME from the same
   buildMissionScene the panel uses, so what is frozen is the drawing
   itself and not a copy of it.

   It reuses render-drone's rasteriser rather than carrying a second
   one. Text primitives are skipped: the rasteriser has no font, and the
   thing worth freezing here is the geometry of the path and the
   aircraft on it, not the labels.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { png } from "./render3d.mjs";
import { rasterise } from "./render-drone.mjs";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { buildMissionScene } from "../src/panels/mission-scene.js";

/* buildMissionScene speaks SVG; the rasteriser speaks its own shape.
   One translation, here, rather than two primitive vocabularies. */
function toRasterScene(prims, W, H) {
  const out = [];
  for (const p of prims) {
    if (p.type === "line") {
      out.push({ k: "line", a: [p.x1, p.y1], b: [p.x2, p.y2],
        stroke: p.stroke, width: p.width ?? 1, opacity: p.op ?? 1 });
    } else if (p.type === "polygon") {
      out.push({ k: "poly", pts: p.pts, fill: p.fill, fillOpacity: p.op ?? 1,
        stroke: p.stroke, width: p.width ?? 0.7, strokeOpacity: p.op ?? 1 });
    }
    /* text: no font in the rasteriser, and the labels are not the thing
       a geometry freeze is protecting. */
  }
  return { W, H, primitives: out };
}

/* The frames chosen for the freeze. One per phase on the default
   configuration, because each phase is a different part of the drawing
   (a vertical leg, a slope, a level cruise), plus a wingless layout,
   where the aircraft outline has no wing to draw and the path must be
   unchanged anyway. */
export const MISSION_FRAMES = Object.freeze([
  { key: "liftcruise-whole",  configType: "liftcruise",  at: "phase", v: 2, phaseFilter: null },
  { key: "liftcruise-takeoff", configType: "liftcruise", at: "phase", v: 0, phaseFilter: "TO" },
  { key: "liftcruise-climb",  configType: "liftcruise",  at: "phase", v: 1, phaseFilter: "Climb" },
  { key: "liftcruise-cruise", configType: "liftcruise",  at: "phase", v: 2, phaseFilter: "Cruise" },
  { key: "liftcruise-descent", configType: "liftcruise", at: "phase", v: 3, phaseFilter: "Desc" },
  { key: "multicopter-whole", configType: "multicopter", at: "phase", v: 2, phaseFilter: null },
  { key: "tiltrotor-whole",   configType: "tiltrotor",   at: "phase", v: 2, phaseFilter: null },
]);

export function renderMission(frame, W = 900, H = 340, file) {
  const p = { ...DEFAULT_PARAMS, configType: frame.configType };
  const r = runSizing(p);
  const geo = aircraftGeometry(p, r);

  /* A time the caller states, never a clock. Mid-phase rather than on a
     boundary, so the frame shows the phase rather than the join. */
  const t = frame.at === "phase"
    ? (r.tPhases[frame.v] + r.tPhases[frame.v + 1]) / 2
    : r.tPhases[6] * frame.v;

  const scene = buildMissionScene({ geo, r, p, t, w: W, h: H, phaseFilter: frame.phaseFilter });
  if (!scene.meta.ok) throw new Error(`${frame.key}: ${scene.meta.reason}`);

  const buf = rasterise(toRasterScene(scene.prims, W, H), "#0F1520");
  if (file) writeFileSync(file, png(W, H, buf));
  return { key: frame.key, t, prims: scene.prims.length, meta: scene.meta, buf };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`
    || process.argv[1]?.endsWith("render-mission.mjs")) {
  const OUT = process.argv[2] || "validation/renders";
  for (const f of MISSION_FRAMES) {
    const res = renderMission(f, 900, 340, `${OUT}/mission-${f.key}.png`);
    console.log(`mission-${res.key}.png  t=${res.t.toFixed(1)}s  ${res.prims} primitives`
      + `  exaggeration ${res.meta.exaggeration.toFixed(0)}x`);
  }
}
