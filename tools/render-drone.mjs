/* Headless renderer for the DRONE views, so their geometry can be
   byte-compared the way the eVTOL aircraft already is.

   It draws the scene `Drone3D.jsx` draws — not a copy of it. Both take
   the identical primitive list from src/classes/drone/scene3d.js, so a
   change to the geometry reaches this PNG because it reaches that list.
   What is deliberately NOT drawn here is text: a label is not geometry,
   and a font change should not fail a geometry gate.

   The rasteriser is the same shape as tools/render3d.mjs — scanline fill
   with sorted edge crossings, which is even-odd by construction and so
   renders the swept annulus's hole for free. Opacity is composited; the
   Gaussian blur the browser applies to shadows is not, because a blur
   kernel is cosmetic and reproducing it exactly across two engines is
   not worth making the freeze fragile. Shadows are drawn flat at their
   own opacity instead.

   Deterministic: no clock, no randomness, fixed camera, fixed blade
   angle, fixed size. Verified by the freeze gate rendering twice. */
import { writeFileSync } from "node:fs";
import { png } from "./render3d.mjs";
import { buildDroneScene } from "../src/classes/drone/scene3d.js";
import { parseDimsMm, cellLayout } from "../src/classes/drone/geometry3d.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { MODELLABLE_MOTORS, BATTERIES } from "../src/data/drone-components.js";

const hex = (h) => {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function surface(W, H, bg) {
  const buf = Buffer.alloc(W * H * 3);
  const [r, g, b] = hex(bg);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = r; buf[i * 3 + 1] = g; buf[i * 3 + 2] = b; }
  return buf;
}

function blend(buf, W, H, x, y, col, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const o = (y * W + x) * 3;
  const k = a >= 1 ? 1 : a;
  buf[o] = Math.round(buf[o] * (1 - k) + col[0] * k);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - k) + col[1] * k);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - k) + col[2] * k);
}

/* Scanline fill over every supplied ring at once. Sorting the crossings
   and filling alternate pairs IS the even-odd rule, so a hole ring
   punches itself out without any extra case. */
function fillRings(buf, W, H, rings, col, alpha) {
  const ys = rings.flat().map((p) => p[1]);
  if (!ys.length) return;
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const A = ring[i], B = ring[(i + 1) % ring.length];
        if ((A[1] <= y && B[1] > y) || (B[1] <= y && A[1] > y))
          xs.push(A[0] + (y - A[1]) / (B[1] - A[1]) * (B[0] - A[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) blend(buf, W, H, x, y, col, alpha);
    }
  }
}

/* A thick segment, stamped as a disc along its length. Round caps come
   free; a butt cap would need the stamp clipped and nothing here asks
   for one. */
function strokeSeg(buf, W, H, a, b, col, width, alpha) {
  const r = Math.max(0.5, width / 2);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len * 2));
  const ri = Math.ceil(r);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = a[0] + dx * t, cy = a[1] + dy * t;
    for (let yy = -ri; yy <= ri; yy++)
      for (let xx = -ri; xx <= ri; xx++)
        if (xx * xx + yy * yy <= r * r)
          blend(buf, W, H, Math.round(cx) + xx, Math.round(cy) + yy, col, alpha);
  }
}

/* Dash a polyline by arc length. Solid when no pattern is given. */
function strokePath(buf, W, H, pts, closed, col, width, alpha, dash) {
  const pattern = dash ? dash.split(/[\s,]+/).map(Number).filter((n) => n > 0) : null;
  let phase = 0, on = true, left = pattern ? pattern[0] : Infinity, idx = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    let segLen = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let t0 = 0;
    while (segLen - t0 > 1e-9) {
      const take = Math.min(left, segLen - t0);
      if (on) {
        const p = (u) => [A[0] + (B[0] - A[0]) * (u / segLen), A[1] + (B[1] - A[1]) * (u / segLen)];
        strokeSeg(buf, W, H, p(t0), p(t0 + take), col, width, alpha);
      }
      t0 += take; left -= take; phase += take;
      if (left <= 1e-9 && pattern) { idx = (idx + 1) % pattern.length; left = pattern[idx]; on = !on; }
    }
  }
}

function circlePts(c, r, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return out;
}

export function rasterise(scene, bg = "#0a111b") {
  const { W, H, primitives } = scene;
  const buf = surface(W, H, bg);
  for (const p of primitives) {
    if (p.k === "poly") {
      const rings = p.hole ? [p.pts, p.hole] : [p.pts];
      if (p.fill) fillRings(buf, W, H, rings, hex(p.fill), (p.fillOpacity ?? 1) * (p.opacity ?? 1));
      if (p.stroke && p.width)
        strokePath(buf, W, H, p.pts, true, hex(p.stroke), p.width,
                   (p.strokeOpacity ?? 1) * (p.opacity ?? 1), p.dash);
    } else if (p.k === "line") {
      strokePath(buf, W, H, [p.a, p.b], false, hex(p.stroke), p.width, p.opacity ?? 1, p.dash);
    } else if (p.k === "circle") {
      const pts = circlePts(p.c, p.r);
      if (p.fill) fillRings(buf, W, H, [pts], hex(p.fill), p.opacity ?? 1);
      if (p.stroke && p.width)
        strokePath(buf, W, H, pts, true, hex(p.stroke), p.width, p.opacity ?? 1, p.dash);
    }
  }
  return buf;
}

/* ── the frozen configurations ─────────────────────────────────────────
   Chosen for geometry variety rather than looks: a planar quad, the same
   quad from above where an azimuth error is obvious, a hexa, the two
   COAXIAL layouts where the stacking offset lives, and a failure case
   where a dead rotor changes what is drawn. */
const PROP_DIAMETER_M = 0.356;         // APC 14x7, the studio default
const VIEWS = {
  iso: { viewYawDeg: 38, viewPitchDeg: 34 },
  top: { viewYawDeg: 0, viewPitchDeg: 88 },
};

export const DRONE_CONFIGS = Object.freeze([
  { key: "quadX-iso", frameClass: "QUAD", frameType: "X", view: "iso" },
  { key: "quadX-top", frameClass: "QUAD", frameType: "X", view: "top" },
  { key: "hexaX-iso", frameClass: "HEXA", frameType: "X", view: "iso" },
  { key: "octaquad-iso", frameClass: "OCTAQUAD", frameType: "X", view: "iso" },
  /* DODECAHEXA is 12 motors on 6 arms — the other coaxial stacking, and
     the highest rotor count the frame table carries. There is no Y6 in
     AP_MotorsMatrix's table, so there is none here either. */
  { key: "dodeca-iso", frameClass: "DODECAHEXA", frameType: "X", view: "iso" },
  { key: "quadX-failed", frameClass: "QUAD", frameType: "X", view: "iso", failed: [1] },
]);

function parts() {
  const motor = MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360");
  const cell = BATTERIES.find((b) => b.id === "molicel-inr21700-p42a");
  const stator = motor && Number.isFinite(motor.stator_diameter_mm)
    ? { radiusM: motor.stator_diameter_mm / 2000, heightM: motor.stator_height_mm / 1000 }
    : null;
  const cells = cellLayout({ cellsSeries: 6, cellsParallel: 3 }, parseDimsMm(cell?.dimensions_mm));
  return { stator, cells };
}

export function renderDrone(cfg, W = 720, H = 540, file) {
  const frame = FRAMES.find((f) => f.frameClass === cfg.frameClass && f.frameType === cfg.frameType);
  if (!frame) throw new Error(`no frame ${cfg.frameClass}/${cfg.frameType}`);
  const { stator, cells } = parts();
  const scene = buildDroneScene({
    frame, propellerDiameterM: PROP_DIAMETER_M, stator, cells,
    W, H, ...VIEWS[cfg.view], spinDeg: 0, failed: new Set(cfg.failed ?? []),
  });
  const buf = rasterise(scene);
  if (file) writeFileSync(file, png(W, H, buf));
  return { scene, buf,
    note: `${cfg.key}: ${scene.air.rotors.length} rotors, arm ${(scene.air.armLengthM * 1000).toFixed(0)} mm, `
        + `${scene.primitives.length} primitives${file ? ` -> ${file}` : ""}` };
}

const isCLI = !!(process.argv[1] && process.argv[1].split("\\").join("/").endsWith("tools/render-drone.mjs"));
if (isCLI) {
  const OUT = process.argv[2] || ".";
  for (const cfg of DRONE_CONFIGS)
    console.log(renderDrone(cfg, 720, 540, `${OUT}/drone-${cfg.key}.png`).note);
}
