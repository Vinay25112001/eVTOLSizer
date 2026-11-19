/* =====================================================================
   BUILD & FLY — the three.js scenes (lazy-loaded; never server-rendered)
   =====================================================================
   Two stages share one drone model, drone-parts.js's buildDrone():
     mountWorkbench  the Build tab's bench: a cutting mat ruled in true
                     centimetres, the parts laid out on it, and the drone
                     assembled on it step by step.
     mountArena      the Fly tab's test field: the drone flies the state
                     live-flight.js integrates, in the Flight sim's scene.

   THE SCENE OWNS NO PHYSICS. It is handed a design (airframe + parts) and,
   in the arena, a pose and per-rotor thrust fractions, and draws them.
   What is to scale and what is drawn is listed in drone-parts.js and on
   the tabs. Also drawn here: how the parts are laid out on the mat, the
   way they fly into place, the lighting, and the propeller spin rate (a
   drawn rate that rises with thrust, not the rotor rpm, which would alias
   at 60 Hz).

   Frames. The engine is NED with a forward-right-down body. three.js is
   y-up. A vector maps (north, east, down) -> (east, up, -north), a proper
   rotation, so an NED quaternion [w,x,y,z] becomes three's (y, -z, -x, w)
   and the body's forward axis is three's -z: a camera given the drone's
   quaternion looks out of its nose.
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { buildDrone, disposeGroup } from "./drone-parts.js";

export const PALETTES = Object.freeze({
  light: { sky: "#dde7f0", ground: "#c9d3bd", grid: "#a9b39c", gridMajor: "#7f8a72", fog: "#dde7f0", label: "#22303c", obstacle: "#b9b1a2", roof: "#9f9584", trunk: "#7b5b3a", canopy: "#6f8f5a", pad: "#f4f1e8", padInk: "#df5f28", trail: "#df5f28", shadow: 0.22,
           bench: "#f3f0ea", benchLine: "#e4dfd4", mat: "#23604b", matEdge: "#184536", matInk: "rgba(236,248,241,", accent: 0xe8a020 },
  dark:  { sky: "#0d1826", ground: "#15222e", grid: "#22384f", gridMajor: "#33506d", fog: "#0d1826", label: "#cfe0f2", obstacle: "#2c3d50", roof: "#3a4f66", trunk: "#5a4632", canopy: "#2f5a43", pad: "#1d2f44", padInk: "#ff8a4c", trail: "#ff8a4c", shadow: 0.4,
           bench: "#101821", benchLine: "#18232f", mat: "#1f5948", matEdge: "#143d31", matInk: "rgba(226,240,233,", accent: 0xe8a020 },
});
const FAILED = 0xe0574a;

export const nedQuatToThree = (q) => new THREE.Quaternion(q[2], -q[3], -q[1], q[0]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* The design the scenes draw: the airframe plus the parts picked. */
const kitOf = (kit, payload) => ({ ...(kit ?? {}), payloadKg: payload === false ? 0 : (kit?.payloadKg ?? 0) });

/* Spin the drawn propellers. `frac` per rotor in [0, 1] of max thrust. */
function spinRotors(rotors, fracs, failed, dt) {
  rotors.forEach((r, i) => {
    const dead = failed?.has?.(r.motor);
    const f = dead ? 0 : clamp(fracs?.[i] ?? 0.5, 0, 1);
    r.angle += r.spin * (dead ? 0 : 18 + 42 * Math.sqrt(f)) * dt;     // drawn rate, not rpm
    r.blades.rotation.y = r.angle;
    r.disc.material.opacity = dead ? 0.05 : 0.06 + 0.16 * f;
    r.ring.material.opacity = 0.75;
    const c = dead ? FAILED : r.rim;
    r.ring.material.color.set(c); r.disc.material.color.set(c);
  });
}

function makeRenderer(canvas, shadowMap = 2048) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadowMap > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
/* Image-based light from three's own procedural room: no file is fetched. */
function roomLight(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const tex = pmrem.fromScene(room, 0.04).texture;
  scene.environment = tex;
  room.dispose?.(); pmrem.dispose();
  return tex;
}
function sizeTo(renderer, camera, canvas, labels) {
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400;
  renderer.setSize(w, h, false);
  labels?.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* ── THE WORKBENCH (Build tab) ──────────────────────────────────────── */
/* The steps, in the Build tab's order (build-steps.js; the gate holds the
   two lists equal), and the part each one fits. */
export const BENCH_STEPS = Object.freeze(["parts", "frame", "motor", "prop", "esc", "cell", "pack", "avionics", "mission", "review"]);
const FITS = Object.freeze({ frame: ["frame"], motor: ["motor"], prop: ["prop"], esc: ["esc"], cell: ["cell"], pack: ["pack"], avionics: ["avionics"], mission: ["payload"] });
const fittedBy = (i) => new Set(BENCH_STEPS.slice(1, i + 1).flatMap((k) => FITS[k] ?? []));
export const KNOLL_ORDER = Object.freeze(["plates", "standoffs", "arms", "gear", "motors", "props", "escs", "pdb", "cells", "avionics", "payload"]);

/* The mat: true centimetres, a heavy line every 5 cm and 10 cm, numbered
   along two edges, the way a real self-healing cutting mat is printed. */
function matTexture(wM, dM, pal) {
  const ppc = clamp(Math.floor(4096 / Math.max(wM, dM) / 100), 6, 28);           // pixels per cm
  const W = Math.round(wM * 100 * ppc), H = Math.round(dM * 100 * ppc);
  return canvasTex(W, H, (x) => {
    x.fillStyle = pal.mat; x.fillRect(0, 0, W, H);
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (W * H) / 900; i++) { x.fillStyle = `rgba(0,0,0,${0.03 * rnd()})`; x.fillRect(rnd() * W, rnd() * H, 2, 2); }
    const line = (horiz, k) => {
      const major = k % 10 === 0, mid = k % 5 === 0;
      x.strokeStyle = `${pal.matInk}${major ? 0.55 : mid ? 0.32 : 0.14})`;
      x.lineWidth = major ? Math.max(2, ppc * 0.16) : mid ? Math.max(1.4, ppc * 0.1) : 1;
      x.beginPath();
      if (horiz) { x.moveTo(0, k * ppc); x.lineTo(W, k * ppc); } else { x.moveTo(k * ppc, 0); x.lineTo(k * ppc, H); }
      x.stroke();
    };
    for (let k = 1; k < W / ppc; k++) line(false, k);
    for (let k = 1; k < H / ppc; k++) line(true, k);
    x.fillStyle = `${pal.matInk}0.8)`; x.font = `600 ${Math.round(ppc * 1.25)}px ui-monospace, Menlo, Consolas, monospace`;
    x.textBaseline = "bottom";
    for (let k = 5; k < W / ppc - 1; k += 5) x.fillText(String(k), k * ppc + ppc * 0.2, H - ppc * 0.25);
    x.textBaseline = "top";
    for (let k = 5; k < H / ppc - 1; k += 5) x.fillText(String(k), ppc * 0.25, k * ppc + ppc * 0.15);
    x.font = `500 ${Math.round(ppc * 1.1)}px system-ui, sans-serif`; x.textAlign = "right"; x.textBaseline = "top";
    x.fillText("1 cm grid · true scale", W - ppc * 0.6, ppc * 0.5);
  });
}

/* The box round what you can see of a part: the propeller's disc and tip
   ring are drawn only when it spins (opacity 0 on the bench), so they do
   not count. */
function solidBox(root, out) {
  const b = new THREE.Box3();
  out.makeEmpty();
  root.traverse((o) => {
    if (!o.isMesh || (o.material?.transparent && o.material.opacity < 0.05)) return;
    o.geometry.computeBoundingBox();
    out.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return out;
}
/* Lay every part out flat on the mat, each kind as one block (the cells
   as their S x P grid), blocks packed in rows about as wide, for their
   area, as the view is (aspect). Positions are in the drone group's frame.
   Drawn: real kits are laid out however you like. */
function knollLayout(drone, aspect, groupY, matTopY) {
  const blocks = [], gap = 0.035;
  const tmp = new THREE.Box3(), size = new THREE.Vector3();
  for (const key of KNOLL_ORDER) {
    const grp = drone.groups.find((g) => g.key === key);
    if (!grp) continue;
    const cells = key === "cells", n = grp.items.length;
    const cols = cells ? Math.max(1, drone.pack?.cellsSeries ?? n) : n <= 2 ? n : Math.ceil(Math.sqrt(n));
    const inner = cells ? 0.004 : 0.014;
    const boxes = grp.items.map((it) => {
      const keep = it.rotation.clone(), pos = it.position.clone();
      const flat = new THREE.Euler(key === "cells" ? Math.PI / 2 : 0, 0, 0);
      it.rotation.copy(flat); it.position.set(0, 0, 0); it.updateMatrixWorld(true);
      solidBox(it, tmp);
      it.rotation.copy(keep); it.position.copy(pos); it.updateMatrixWorld(true);
      return { it, flat, box: tmp.clone() };
    });
    const cw = Math.max(...boxes.map((b) => b.box.getSize(size).x)), cd = Math.max(...boxes.map((b) => b.box.getSize(size).z));
    const rows = Math.ceil(n / cols);
    blocks.push({ grp, boxes, cols, cw, cd, inner, w: cols * cw + (cols - 1) * inner, d: rows * cd + (rows - 1) * inner });
  }
  /* Shelf-pack the blocks into rows about sqrt(area x aspect) wide. */
  const area = blocks.reduce((a, b) => a + (b.w + gap) * (b.d + gap), 0);
  const usable = Math.max(...blocks.map((b) => b.w), Math.sqrt(area * clamp(aspect, 0.8, 2.4)) * 1.08);
  blocks.sort((a, b) => b.d - a.d);
  let x = 0, z = 0, shelfD = 0, widest = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > usable) { z += shelfD + gap; x = 0; shelfD = 0; }
    b.x = x; b.z = z; x += b.w + gap; shelfD = Math.max(shelfD, b.d); widest = Math.max(widest, x - gap);
  }
  const depth = z + shelfD;
  const ox = -widest / 2, oz = -depth / 2;
  const poses = new Map(), anchors = [];
  for (const b of blocks) {
    b.boxes.forEach(({ it, flat, box }, k) => {
      const c = k % b.cols, r = Math.floor(k / b.cols);
      const cx = ox + b.x + c * (b.cw + b.inner) + b.cw / 2, cz = oz + b.z + r * (b.cd + b.inner) + b.cd / 2;
      const mid = box.getCenter(new THREE.Vector3());
      poses.set(it, { p: new THREE.Vector3(cx - mid.x, matTopY - groupY - box.min.y + 0.0005, cz - mid.z), q: new THREE.Quaternion().setFromEuler(flat) });
    });
    anchors.push({ key: b.grp.key, label: b.grp.label, at: new THREE.Vector3(ox + b.x + b.w / 2, matTopY - groupY + 0.002, oz + b.z + b.d + 0.012) });
  }
  return { poses, anchors, width: widest, depth };
}

export function mountWorkbench({ canvas, labelLayer = null, airframe, kit, dark = true, step = 0, onHover, onPick }) {
  const renderer = makeRenderer(canvas, 2048);
  const scene = new THREE.Scene();
  let pal = PALETTES[dark ? "dark" : "light"];
  scene.background = new THREE.Color(pal.bench);
  const env = roomLight(renderer, scene);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.35); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4); key.castShadow = true; scene.add(key, key.target);
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.0015;
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = true; controls.maxPolarAngle = Math.PI * 0.49;
  let labels = null;
  if (labelLayer) {
    labels = new CSS2DRenderer({ element: labelLayer });
    /* Its own stacking context: CSS2DRenderer gives every label a z-index, which must not lift it over the page's cards. */
    Object.assign(labelLayer.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" });
  }

  /* The bench: a table top with a faint large grid, and the mat on it. */
  const bench = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: pal.bench, roughness: 0.95 }));
  bench.rotation.x = -Math.PI / 2; bench.receiveShadow = true; scene.add(bench);
  const benchGridOf = (pl) => { const g = new THREE.GridHelper(60, 120, pl.benchLine, pl.benchLine); g.position.y = 0.0004; g.material.transparent = true; g.material.opacity = 0.45; return g; };
  let benchGrid = benchGridOf(pal); scene.add(benchGrid);
  const MAT_T = 0.003;
  let mat = null, matW = 1, matD = 1;

  let drone = null, knoll = null, groupY = 0, current = clamp(step, 0, BENCH_STEPS.length - 1), lastAf = airframe, lastKit = kit;
  let anchorObjs = [], labelsOn = true, presets = [];
  const anim = new Map();            // item -> { fp, fq, tp, tq, delay, dur, t }
  let playing = true, speed = 1, hoverKey = null, pinned = null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function tint(keyOn) {
    for (const g of drone?.groups ?? []) {
      const on = g.key === keyOn;
      for (const it of g.items) it.traverse((o) => {
        if (o.isMesh && o.material?.emissive && !o.material.transparent) { o.material.emissive.setHex(on ? pal.accent : 0x000000); o.material.emissiveIntensity = on ? 0.32 : 1; }
      });
    }
  }
  function home(it) { return { p: it.userData.homeP, q: it.userData.homeQ }; }
  function poseOf(i, it) {
    if (i === 0) return knoll.poses.get(it) ?? null;
    return fittedBy(i).has(it.userData.part) ? home(it) : null;
  }
  /* Put every part where step i has it, with no animation. */
  function poseInstant(i) {
    anim.clear();
    for (const it of drone.items) {
      const ps = poseOf(i, it);
      it.visible = !!ps;
      if (ps) { it.position.copy(ps.p); it.quaternion.copy(ps.q); }
    }
    for (const a of anchorObjs) a.visible = i === 0 && labelsOn;
    spinTo(i, 0);
  }
  /* Step to i: the parts this step fits lift off the mat and fly into
     place, one after another; going back takes them away. */
  function applyStep(i, { instant = false, replay = false } = {}) {
    const prev = current; current = clamp(i, 0, BENCH_STEPS.length - 1);
    if (instant || reduced || !drone) { if (drone) poseInstant(current); return; }
    anim.clear();
    const before = prev === 0 ? null : fittedBy(prev);
    let k = 0;
    const order = [...drone.items].sort((a, b) => KNOLL_ORDER.indexOf(a.userData.groupKey) - KNOLL_ORDER.indexOf(b.userData.groupKey));
    const n = order.filter((it) => poseOf(current, it)).length;
    const stagger = Math.min(0.09, 1.4 / Math.max(1, n));
    for (const it of order) {
      const to = poseOf(current, it);
      if (!to) { it.visible = false; continue; }
      const wasThere = prev === 0 ? current === 0 : before.has(it.userData.part) && current !== 0;
      const fresh = replay ? (current === 0 || (FITS[BENCH_STEPS[current]] ?? []).includes(it.userData.part)) : !wasThere;
      if (!fresh && it.visible) { it.position.copy(to.p); it.quaternion.copy(to.q); continue; }
      const from = current === 0 ? { p: to.p.clone().add(new THREE.Vector3(0, 0.12 + 0.05 * Math.random(), 0)), q: to.q } : (knoll.poses.get(it) ?? to);
      it.visible = true; it.position.copy(from.p); it.quaternion.copy(from.q);
      anim.set(it, { fp: from.p.clone(), fq: from.q.clone(), tp: to.p, tq: to.q, delay: (k++) * stagger, dur: current === 0 ? 0.5 : 0.95, t: 0 });
    }
    for (const a of anchorObjs) a.visible = current === 0 && labelsOn;
    flyCamera(presets[current]);
  }
  function stepAnim(dt) {
    const lift = (drone?.spanM ?? 0.5) * 0.22;
    for (const [it, a] of anim) {
      a.t += dt;
      const u = clamp((a.t - a.delay) / a.dur, 0, 1), e = easeInOut(u);
      it.position.lerpVectors(a.fp, a.tp, e);
      if (current !== 0) it.position.y += Math.sin(Math.PI * e) * lift;
      it.quaternion.slerpQuaternions(a.fq, a.tq, e);
      if (u >= 1) anim.delete(it);
    }
  }
  let spinRate = 0;
  function spinTo(i, dt) {
    const want = BENCH_STEPS[i] === "review" && !reduced ? 5 : 0;           // a drawn turn, not rpm
    spinRate += (want - spinRate) * Math.min(1, dt * 1.5);
    if (Math.abs(spinRate) < 1e-3 && want === 0) { spinRate = 0; return false; }
    for (const r of drone?.rotors ?? []) { r.angle += r.spin * spinRate * dt; r.blades.rotation.y = r.angle; }
    return true;
  }

  /* Camera views, one per step, framed on what that step fits. */
  const camAnim = { t: 1, fp: new THREE.Vector3(), ft: new THREE.Vector3(), tp: new THREE.Vector3(), tt: new THREE.Vector3() };
  /* The distance at which something rx across (half-width on screen) and
     ry high (half-height on screen) fills the view, with a margin. A drone
     is wide and flat, so fitting a sphere round it leaves it small. */
  function fitDist(rx, ry) { const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), th = tv * camera.aspect; return 1.12 * Math.max(rx / th, ry / tv); }
  function view(target, dir, rx, ry = rx * 0.62) { const d = dir.clone().normalize().multiplyScalar(fitDist(rx, ry)); return { pos: target.clone().add(d), target }; }
  function makePresets() {
    const span = drone.spanM, top = groupY + drone.topY;
    const c = new THREE.Vector3(0, groupY, 0);
    const m0 = drone.parts.motor[0];
    const wp = (o) => (o ? o.userData.homeP.clone().add(new THREE.Vector3(0, groupY, 0)) : c.clone());
    const motorAt = wp(m0);
    const three4 = new THREE.Vector3(0.72, 0.62, 0.95);
    const arm = lastAf?.armLengthM ?? span * 0.3;
    return BENCH_STEPS.map((k) => {
      switch (k) {
        case "parts": {
          /* Looking down on the parts, steeply, the way the kit is photographed. */
          const dir = new THREE.Vector3(0, 1, 0.42).normalize(), elev = Math.atan2(dir.y, dir.z);
          return view(new THREE.Vector3(0, 0, 0.012), dir, (knoll.width + 0.06) / 2, ((knoll.depth + 0.08) * Math.sin(elev)) / 2 + 0.01);
        }
        case "frame": return view(new THREE.Vector3(0, groupY * 0.7, 0), three4, arm + 0.07);
        case "motor": return view(motorAt.clone().add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(0.9, 0.75, 0.9), Math.max(0.1, 0.2 * span));
        case "esc": return view(c.clone().lerp(motorAt, 0.45), three4, Math.max(0.14, 0.42 * span));
        case "cell": case "pack": case "avionics": return view(new THREE.Vector3(0, top - 0.02, 0), new THREE.Vector3(0.75, 0.85, 0.95), Math.max(0.14, 0.34 * span));
        case "mission": return view(new THREE.Vector3(0, groupY * 0.6, 0), new THREE.Vector3(0.8, 0.32, 1.0), Math.max(0.16, 0.46 * span));
        default: return view(new THREE.Vector3(0, groupY * 0.8, 0), three4, 0.52 * span);
      }
    });
  }
  function flyCamera(p, instant = false) {
    if (!p) return;
    if (instant || reduced) { camera.position.copy(p.pos); controls.target.copy(p.target); camAnim.t = 1; controls.update(); return; }
    camAnim.fp.copy(camera.position); camAnim.ft.copy(controls.target); camAnim.tp.copy(p.pos); camAnim.tt.copy(p.target); camAnim.t = 0;
  }

  function setDesign(af, k, { keepCamera = false } = {}) {
    const oldSpan = drone?.spanM; lastAf = af; lastKit = k;
    if (drone) { scene.remove(drone.group); disposeGroup(drone.group); }
    anchorObjs.forEach((a) => { a.removeFromParent(); a.element.remove(); }); anchorObjs = [];
    drone = buildDrone(af, k);
    drone.pack = k?.pack ?? null;
    groupY = MAT_T + drone.gearDepthM;
    for (const it of drone.items) { it.userData.homeP = it.position.clone(); it.userData.homeQ = it.quaternion.clone(); }
    /* The mat: big enough for the drone and for its parts laid out. */
    const want = Math.max(0.6, Math.ceil(drone.spanM * 1.25 * 10) / 10);
    knoll = knollLayout(drone, camera.aspect, groupY, MAT_T);
    const w = Math.max(want, Math.ceil((knoll.width + 0.14) * 10) / 10), d = Math.max(Math.ceil(want * 0.75 * 10) / 10, Math.ceil((knoll.depth + 0.16) * 10) / 10, Math.ceil(drone.spanM * 1.1 * 10) / 10);
    if (!mat || w !== matW || d !== matD) {
      if (mat) { scene.remove(mat); disposeGroup(mat); }
      matW = w; matD = d;
      mat = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(matW, MAT_T, matD), [
        ...Array(2).fill(new THREE.MeshStandardMaterial({ color: pal.matEdge, roughness: 0.8 })),
        new THREE.MeshStandardMaterial({ map: matTexture(matW, matD, pal), roughness: 0.86, envMapIntensity: 0.55 }),
        ...Array(3).fill(new THREE.MeshStandardMaterial({ color: pal.matEdge, roughness: 0.8 })),
      ]);
      top.position.y = MAT_T / 2; top.receiveShadow = true; mat.add(top); scene.add(mat);
      const s = Math.max(matW, matD);
      key.position.set(s * 0.55, s * 1.3, s * 0.75); key.target.position.set(0, 0, 0);
      Object.assign(key.shadow.camera, { left: -s * 0.75, right: s * 0.75, top: s * 0.75, bottom: -s * 0.75, near: 0.05, far: s * 4 });
      key.shadow.camera.updateProjectionMatrix();
      fill.position.set(-s, s * 0.6, -s * 0.4);
      controls.minDistance = 0.05; controls.maxDistance = s * 4;
    }
    drone.group.position.y = groupY;
    scene.add(drone.group);
    if (labels) for (const a of knoll.anchors) {
      const el = document.createElement("div"), tag = document.createElement("div");
      tag.textContent = a.label;
      el.className = "bench-label"; el.appendChild(tag);
      Object.assign(tag.style, { font: "600 11px system-ui, sans-serif", padding: "2px 7px", borderRadius: "4px", whiteSpace: "nowrap",
        background: dark ? "rgba(15,21,32,0.92)" : "rgba(255,255,255,0.96)", color: dark ? "#C8D8E8" : "#0B1524",
        border: `1px solid ${dark ? "#1C2B3A" : "#d9d3c7"}`, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" });
      const o = new CSS2DObject(el); o.position.copy(a.at).add(new THREE.Vector3(0, groupY, 0)); o.center.set(0.5, 0);
      o.userData.key = a.key; scene.add(o); anchorObjs.push(o);
    }
    presets = makePresets();
    poseInstant(current);
    if (!keepCamera || !oldSpan || Math.abs(drone.spanM / oldSpan - 1) > 0.05) flyCamera(presets[current], true);
    tint(pinned ?? hoverKey);
    return drone;
  }

  /* Hover and click: find the part under the pointer. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pointer = null, down = null;
  const pick = (cx, cy) => {
    if (!drone) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(drone.items, true).find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.1) && isShown(h.object));
    const root = hit?.object.userData.itemRoot;
    if (!root) return null;
    const g = drone.groups.find((x) => x.key === root.userData.groupKey);
    return g ? { key: g.key, part: g.part, label: g.label, count: g.items.length } : null;
  };
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const onMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; pointerMoved = true; };
  const onLeave = () => { pointer = null; if (hoverKey) { hoverKey = null; tint(pinned); onHover?.(null); } };
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
    down = null;
    const g = pick(e.clientX, e.clientY);
    pinned = g?.key ?? null; tint(pinned ?? hoverKey); onPick?.(g);
  };
  canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);

  sizeTo(renderer, camera, canvas, labels);
  setDesign(airframe, kit);
  presets = makePresets(); flyCamera(presets[current], true);

  /* Labels that would overlap on screen are pushed down, one under the
     other, the way a printed key is set. */
  function declutter() {
    const boxes = anchorObjs.filter((a) => a.visible).map((a) => {
      const tag = a.element.firstChild, r = tag.getBoundingClientRect(), dy = a.userData.dy ?? 0;
      return { a, tag, l: r.left, r: r.right, t: r.top - dy, b: r.bottom - dy };
    }).filter((x) => x.r > x.l).sort((x, y) => x.t - y.t || x.l - y.l);
    const placed = [];
    for (const x of boxes) {
      let dy = 0;
      for (let pass = 0; pass < 10; pass++) {
        const hit = placed.find((q) => x.l < q.r + 3 && x.r > q.l - 3 && x.t + dy < q.b + 2 && x.b + dy > q.t - 2);
        if (!hit) break;
        dy = hit.b + 2 - x.t;
      }
      if ((x.a.userData.dy ?? 0) !== dy) { x.a.userData.dy = dy; x.tag.style.transform = dy ? `translateY(${Math.round(dy)}px)` : ""; }
      placed.push({ l: x.l, r: x.r, t: x.t + dy, b: x.b + dy });
    }
  }
  /* RENDER ON DEMAND. The picture is drawn when something in it changes
     (a part or the camera moving, a hover, a setting from the panel) and
     not otherwise. Drawing the same still picture 60 times a second kept
     a laptop core busy with the bench idle (Edge, 2026-11-18: 37-67 % of
     a core for the eVTOL lab, 27 % for the drone bench). Off the screen
     (another tab, a hidden studio) nothing is drawn at all. */
  let dirty = 2, onScreen = true, tidyDue = false, pointerMoved = false;
  const wake = () => { dirty = Math.max(dirty, 2); };
  const io = typeof window.IntersectionObserver === "function"
    ? new window.IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); if (onScreen) wake(); }) : null;
  io?.observe(canvas);
  controls.addEventListener("change", wake);
  let raf = 0, last = 0, alive = true, lastPickAt = 0, lastTidy = 0;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (!onScreen) return;
    let moving = false;
    if (playing && anim.size > 0) { stepAnim(dt * speed); moving = true; }
    if (spinTo(current, dt)) moving = true;
    if (camAnim.t < 1) {
      camAnim.t = Math.min(1, camAnim.t + dt / 1.1);
      const e = easeInOut(camAnim.t);
      camera.position.lerpVectors(camAnim.fp, camAnim.tp, e); controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
      moving = true;
    }
    if (controls.update()) moving = true;
    if (pointer && (pointerMoved || moving) && now - lastPickAt > 60) {
      lastPickAt = now; pointerMoved = false;
      const g = pick(pointer.x, pointer.y), k = g?.key ?? null;
      if (k !== hoverKey) { hoverKey = k; tint(pinned ?? hoverKey); onHover?.(g, pointer.x, pointer.y); canvas.style.cursor = g ? "pointer" : "grab"; dirty = Math.max(dirty, 1); }
      else if (g) onHover?.(g, pointer.x, pointer.y);
    }
    if (moving || dirty > 0) {
      renderer.render(scene, camera);
      labels?.render(scene, camera);
      if (labels && current === 0 && labelsOn) tidyDue = true;
      if (dirty > 0) dirty--;
    }
    if (tidyDue && now - lastTidy > 150) { lastTidy = now; tidyDue = false; declutter(); }
  }
  raf = requestAnimationFrame((n) => { last = n; frame(n); });

  const api = {
    setStep: (i) => applyStep(i),
    replay: () => applyStep(current, { replay: true }),
    setPlaying: (on) => { playing = !!on; },
    setSpeed: (x) => { speed = clamp(Number(x) || 1, 0.25, 4); },
    setLabels: (on) => { labelsOn = !!on; for (const a of anchorObjs) a.visible = current === 0 && labelsOn; },
    highlight: (k) => { pinned = k ?? null; tint(pinned ?? hoverKey); },
    zoom(dir) {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(dir > 0 ? 0.8 : 1.25);
      const len = clamp(off.length(), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(off.setLength(len)); camAnim.t = 1;
    },
    resetView: () => flyCamera(presets[current]),
    setAirframe: (af, k) => setDesign(af, k, { keepCamera: true }),
    notes: () => drone?.notes ?? [],
    /* One small picture per step, for the step strip: the bench posed at
       each step and rendered at thumbnail size, then put back. */
    thumbnails(w = 176, h = 112) {
      if (!drone) return [];
      /* Not while parts or the camera are moving: posing every step would cut the move short. Ask again. */
      if (anim.size > 0 || camAnim.t < 1) return null;
      const keep = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
      const cam = camera.clone(); const shown = anchorObjs.map((a) => a.visible);
      renderer.setPixelRatio(1); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      const saved = drone.rotors.map((r) => r.angle);
      const urls = BENCH_STEPS.map((_, i) => {
        poseInstant(i);
        const p = presets[i]; cam.position.copy(p.pos); cam.lookAt(p.target);
        renderer.render(scene, cam);
        return canvas.toDataURL("image/jpeg", 0.82);
      });
      renderer.setPixelRatio(pr); renderer.setSize(keep.x, keep.y, false);
      poseInstant(current); drone.rotors.forEach((r, k) => { r.angle = saved[k]; });
      anchorObjs.forEach((a, k) => { a.visible = shown[k]; });
      renderer.render(scene, camera);
      return urls;
    },
    setDark(d) {
      dark = d; pal = PALETTES[d ? "dark" : "light"];
      scene.background = new THREE.Color(pal.bench); bench.material.color.set(pal.bench);
      if (mat) { scene.remove(mat); disposeGroup(mat); mat = null; }
      scene.remove(benchGrid); disposeGroup(benchGrid);
      benchGrid = benchGridOf(pal); scene.add(benchGrid);
      setDesign(lastAf, lastKit, { keepCamera: true });
    },
    resize: () => { sizeTo(renderer, camera, canvas, labels); if (drone) presets = makePresets(); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); io?.disconnect(); controls.removeEventListener("change", wake); controls.dispose();
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      anchorObjs.forEach((a) => a.element.remove());
      disposeGroup(scene); env.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
  /* Whatever the panel asks for (a step, a highlight, the labels, the
     theme, a resize) changes the picture: draw it again. */
  for (const k of Object.keys(api)) { const f = api[k]; api[k] = (...a) => { const r = f(...a); wake(); return r; }; }
  return api;
}

/* ── THE ARENA (Fly tab) ────────────────────────────────────────────── */
function textSprite(text, color) {
  const tex = canvasTex(256, 64, (x) => {
    x.font = "600 30px ui-monospace, Menlo, Consolas, monospace"; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 128, 32);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(6, 1.5, 1);
  return sp;
}
function padTexture(pal) {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = pal.pad; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
    x.strokeStyle = pal.padInk; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
    x.fillStyle = pal.padInk; x.font = "700 120px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("H", 128, 136);
  });
}
function shadowTexture() {
  return canvasTex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
}
/* Mown grass, drawn: a light and dark stripe with speckle, tiled. */
function groundTexture(pal) {
  const t = canvasTex(512, 512, (x, w, h) => {
    const base = new THREE.Color(pal.ground);
    x.fillStyle = `#${base.getHexString()}`; x.fillRect(0, 0, w, h);
    x.fillStyle = `#${base.clone().offsetHSL(0, 0, 0.025).getHexString()}`; x.fillRect(0, 0, w / 2, h);
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) { const l = rnd() < 0.5 ? 0.06 : -0.06; x.fillStyle = `#${base.clone().offsetHSL(0, 0, l * rnd()).getHexString()}`; x.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
  return t;
}

export const CAMERAS = Object.freeze(["chase", "fpv", "orbit", "top"]);
const TRAIL_MAX = 1500;

export function mountArena({ canvas, airframe, obstacles = [], dark = true, payload = true, kit = null }) {
  const renderer = makeRenderer(canvas, 1024);
  const scene = new THREE.Scene();
  let pal = PALETTES[dark ? "dark" : "light"];
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.fog, 60, 260);
  const env = roomLight(renderer, scene);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7a6a, 0.9));
  /* The sun follows the drone so its shadow stays sharp at any range. */
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; scene.add(sun, sun.target);
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.01;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 1200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enabled = false;

  /* Ground, grid and pad. */
  const world = new THREE.Group(); scene.add(world);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ map: groundTexture(pal), roughness: 0.97 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const gridMinor = new THREE.GridHelper(400, 200, pal.grid, pal.grid); gridMinor.position.y = 0.005;
  gridMinor.material.transparent = true; gridMinor.material.opacity = 0.22; world.add(gridMinor);
  const gridMajor = new THREE.GridHelper(400, 20, pal.gridMajor, pal.gridMajor); gridMajor.position.y = 0.008;
  gridMajor.material.transparent = true; gridMajor.material.opacity = 0.6; world.add(gridMajor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ map: padTexture(pal), transparent: true, roughness: 0.8 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.012; pad.receiveShadow = true; world.add(pad);
  const north = textSprite("N ↑", pal.label); north.position.set(0, 0.6, -3.4); north.scale.set(2.4, 0.6, 1); world.add(north);

  /* The Flight sim's scene, at the same coordinates (x north, y east). */
  const obstacleGroup = new THREE.Group(); scene.add(obstacleGroup);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra });
  function setObstacles(list) {
    obstacleGroup.children.slice().forEach((o) => { obstacleGroup.remove(o); disposeGroup(o); });
    for (const o of list) {
      if (o.kind === "box") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.wy, o.h, o.wx), std(pal.obstacle, { roughness: 0.85 }));
        m.position.set(o.y, o.h / 2, -o.x); m.receiveShadow = true; obstacleGroup.add(m);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(o.wy * 1.01, 0.08, o.wx * 1.01), std(pal.roof));
        roof.position.set(o.y, o.h + 0.04, -o.x); obstacleGroup.add(roof);
      } else if (o.kind === "tree") {
        const trunkH = Math.max(0.1, o.h - o.canopyR);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(o.trunkR, o.trunkR * 1.1, trunkH, 12), std(pal.trunk));
        t.position.set(o.y, trunkH / 2, -o.x); obstacleGroup.add(t);
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(o.canopyR, 2), std(pal.canopy, { roughness: 0.9, flatShading: true }));
        c.position.set(o.y, o.h - o.canopyR, -o.x); c.receiveShadow = true; obstacleGroup.add(c);
      }
      const label = textSprite(o.name, pal.label);
      label.position.set(o.y, o.h + 1.4, -o.x); obstacleGroup.add(label);
    }
  }
  setObstacles(obstacles);

  /* Drone, contact shadow, drop line, trail. */
  let kitNow = kit, payloadOn = payload;
  let drone = buildDrone(airframe, kitOf(kitNow, payloadOn));
  scene.add(drone.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: pal.shadow }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; scene.add(shadow);
  const dropGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const drop = new THREE.Line(dropGeo, new THREE.LineDashedMaterial({ color: pal.trail, dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.7 }));
  scene.add(drop);
  const trailPos = new Float32Array(TRAIL_MAX * 3);
  const trailGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: pal.trail, transparent: true, opacity: 0.75 }));
  scene.add(trail);
  let trailN = 0, trailLastT = -1;

  let mode = "chase";
  /* The chase camera follows a smoothed HEADING, not a smoothed position:
     a lagging position falls behind in proportion to the speed and the
     drone shrinks to a speck in fast flight. */
  const camFwd = new THREE.Vector3(0, 0, -1), lastDrone = new THREE.Vector3();
  const FPV_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 6 * Math.PI / 180);
  sizeTo(renderer, camera, canvas);

  function fitSun() {
    const s = Math.max(2, drone.spanM * 2.5);
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  fitSun();

  function setCamera(m) {
    mode = CAMERAS.includes(m) ? m : "chase";
    controls.enabled = mode === "orbit";
    /* FPV looks out from the drone, so its own arms and blocks are hidden. */
    drone.group.visible = mode !== "fpv"; drop.visible = mode !== "fpv";
    camera.up.set(0, 1, 0);
    if (mode === "orbit") {
      controls.target.copy(drone.group.position);
      camera.position.copy(drone.group.position).add(new THREE.Vector3(drone.spanM * 4, drone.spanM * 2.5, drone.spanM * 4));
    }
    if (mode === "top") camera.up.set(0, 0, -1);
  }

  /* pose: { x, y, altitudeM, q:[w,x,y,z], yawDeg, t }, fracs: per-rotor
     thrust / max, failed: Set of motor numbers. */
  function render(pose, { fracs, failed, dt = 1 / 60, resetTrail = false } = {}) {
    if (resetTrail) { trailN = 0; trailLastT = -1; trailGeo.setDrawRange(0, 0); }
    const snap = resetTrail;
    const p = new THREE.Vector3(pose.y, pose.altitudeM, -pose.x);
    drone.group.position.copy(p);
    drone.group.quaternion.copy(nedQuatToThree(pose.q));
    spinRotors(drone.rotors, fracs, failed, dt);
    sun.target.position.copy(p); sun.position.copy(p).add(new THREE.Vector3(9, 30, 12));

    const alt = Math.max(0, pose.altitudeM);
    const sz = drone.spanM * (1.1 + alt * 0.05);
    shadow.position.set(p.x, 0.02, p.z); shadow.scale.set(sz, sz, 1);
    shadow.material.opacity = pal.shadow * Math.max(0.15, 1 - alt / 40);
    const dp = dropGeo.attributes.position;
    dp.setXYZ(0, p.x, p.y, p.z); dp.setXYZ(1, p.x, 0.02, p.z); dp.needsUpdate = true; drop.computeLineDistances();

    if (pose.t - trailLastT >= 0.05) {
      trailLastT = pose.t;
      if (trailN >= TRAIL_MAX) { trailPos.copyWithin(0, 3); trailN = TRAIL_MAX - 1; }
      trailPos[trailN * 3] = p.x; trailPos[trailN * 3 + 1] = p.y; trailPos[trailN * 3 + 2] = p.z; trailN++;
      trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, trailN);
    }

    const yaw = pose.yawDeg * Math.PI / 180;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    const span = drone.spanM;
    if (snap) camFwd.copy(fwd);
    else { camFwd.lerp(fwd, 1 - Math.exp(-dt * 4)); if (camFwd.lengthSq() < 1e-8) camFwd.copy(fwd); camFwd.normalize(); }
    if (mode === "chase") {
      /* Close enough to see the parts the drone is drawn from. */
      camera.position.copy(p).addScaledVector(camFwd, -(0.45 + span * 1.15)).add(new THREE.Vector3(0, 0.22 + span * 0.4, 0));
      camera.position.y = Math.max(0.3, camera.position.y);
      camera.lookAt(p.clone().addScaledVector(camFwd, span * 0.7).add(new THREE.Vector3(0, span * 0.05, 0)));
    } else if (mode === "fpv") {
      camera.position.copy(p).add(new THREE.Vector3(0, drone.scale * 0.5, 0));
      camera.quaternion.copy(drone.group.quaternion).multiply(FPV_TILT);
    } else if (mode === "top") {
      camera.position.set(p.x, p.y + 8 + span * 6, p.z + 0.001);
      camera.lookAt(p);
    } else if (mode === "orbit") {
      const d = p.clone().sub(lastDrone);
      camera.position.add(d); controls.target.copy(p);
      controls.update();
    }
    lastDrone.copy(p);
    renderer.render(scene, camera);
  }

  return {
    render, setCamera, setObstacles,
    getCamera: () => mode,
    setAirframe(af, opts = {}) {
      if (opts.payload != null) payloadOn = opts.payload;
      if (opts.kit) kitNow = opts.kit;
      scene.remove(drone.group); disposeGroup(drone.group);
      drone = buildDrone(af, kitOf(kitNow, payloadOn)); drone.group.visible = mode !== "fpv"; scene.add(drone.group);
      fitSun();
    },
    setDark(d) {
      pal = PALETTES[d ? "dark" : "light"];
      scene.background = new THREE.Color(pal.sky); scene.fog.color.set(pal.fog);
      ground.material.map?.dispose(); ground.material.map = groundTexture(pal); ground.material.needsUpdate = true;
    },
    resize: () => sizeTo(renderer, camera, canvas),
    dispose() {
      controls.dispose(); disposeGroup(scene); env.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
