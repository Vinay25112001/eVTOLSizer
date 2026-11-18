/* =====================================================================
   EVTOL BUILD LAB — the hangar (three.js, lazy-loaded; never server-rendered)
   =====================================================================
   mountHangar draws the build lab's stage: a hangar floor with a build
   bay ruled in true metres, the sized aircraft's parts laid out on it
   (evtol-parts.js shapes them), and the aircraft put together step by
   step, the way the drone workbench assembles a drone.

   THE SCENE OWNS NO NUMBERS. It is handed the plan (build-plan.js) and
   draws it. Also drawn here, not sized: how the parts are laid out on the
   floor, the way they fly into place, the see-through skin of the cabin
   step, the assembly stands, the person, the lighting.
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { buildEvtol, disposeGroup, PERSON_HEIGHT_M } from "./evtol-parts.js";
import { GROUP_ORDER, STEP_FITS } from "./build-plan.js";

export const PALETTES = Object.freeze({
  light: { sky: "#e4e8ec", floor: "#c9ccd0", bay: "#d6d8da", ink: "rgba(38,44,52,", hazard: "#f2b23a", accent: 0xe8a020 },
  dark:  { sky: "#0f1620", floor: "#1a222c", bay: "#232c37", ink: "rgba(214,226,238,", hazard: "#d79a2c", accent: 0xe8a020 },
});
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
function roomLight(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const tex = pmrem.fromScene(room, 0.04).texture;
  scene.environment = tex;
  room.dispose?.(); pmrem.dispose();
  return tex;
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/* The build bay: painted concrete ruled in true metres, a heavier line
   every 5 m, numbered along two edges, inside a hazard border. */
function bayTexture(wM, dM, pal) {
  const ppm = clamp(Math.floor(4096 / Math.max(wM, dM)), 40, 128);
  const W = Math.round(wM * ppm), H = Math.round(dM * ppm);
  return canvasTex(W, H, (x) => {
    x.fillStyle = pal.bay; x.fillRect(0, 0, W, H);
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (W * H) / 260; i++) { x.fillStyle = `rgba(0,0,0,${0.035 * rnd()})`; x.fillRect(rnd() * W, rnd() * H, 2, 2); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.02 * rnd()})`; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 160, 20 + rnd() * 90, rnd() * 3, 0, 7); x.fill(); }
    const line = (horiz, k) => {
      const major = k % 5 === 0;
      x.strokeStyle = `${pal.ink}${major ? 0.55 : 0.22})`;
      x.lineWidth = major ? Math.max(3, ppm * 0.05) : Math.max(1.5, ppm * 0.018);
      x.beginPath();
      if (horiz) { x.moveTo(0, k * ppm); x.lineTo(W, k * ppm); } else { x.moveTo(k * ppm, 0); x.lineTo(k * ppm, H); }
      x.stroke();
    };
    for (let k = 1; k < wM; k++) line(false, k);
    for (let k = 1; k < dM; k++) line(true, k);
    /* The hazard border: yellow on black, slanted. */
    const hz = Math.round(ppm * 0.22);
    x.fillStyle = "#1c1e21"; x.fillRect(0, 0, W, hz); x.fillRect(0, H - hz, W, hz); x.fillRect(0, 0, hz, H); x.fillRect(W - hz, 0, hz, H);
    x.fillStyle = pal.hazard;
    for (let i = -hz * 2; i < W + hz * 2; i += hz * 2) for (const y0 of [0, H - hz]) {
      x.beginPath(); x.moveTo(i, y0); x.lineTo(i + hz, y0); x.lineTo(i + hz * 2, y0 + hz); x.lineTo(i + hz, y0 + hz); x.closePath(); x.fill();
    }
    for (let j = -hz * 2; j < H + hz * 2; j += hz * 2) for (const x0 of [0, W - hz]) {
      x.beginPath(); x.moveTo(x0, j); x.lineTo(x0, j + hz); x.lineTo(x0 + hz, j + hz * 2); x.lineTo(x0 + hz, j + hz); x.closePath(); x.fill();
    }
    x.fillStyle = `${pal.ink}0.85)`; x.font = `700 ${Math.round(ppm * 0.42)}px ui-monospace, Menlo, Consolas, monospace`;
    x.textBaseline = "bottom";
    for (let k = 5; k < wM - 1; k += 5) x.fillText(`${k} m`, k * ppm + ppm * 0.12, H - hz - ppm * 0.12);
    x.textBaseline = "top";
    for (let k = 5; k < dM - 1; k += 5) x.fillText(`${k} m`, hz + ppm * 0.14, k * ppm + ppm * 0.1);
    x.font = `600 ${Math.round(ppm * 0.36)}px system-ui, sans-serif`; x.textAlign = "right"; x.textBaseline = "top";
    x.fillText("1 m grid · true scale", W - hz - ppm * 0.3, hz + ppm * 0.2);
  });
}

/* The box round what you can see of a part. */
function solidBox(root, out) {
  const b = new THREE.Box3();
  out.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || (o.material?.transparent && o.material.opacity < 0.05)) return;
    o.geometry.computeBoundingBox();
    out.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return out;
}
/* Every part laid flat on the floor, each kind as one block, the blocks
   packed in rows about as wide, for their area, as the view. A part
   longer across than along is turned to lie along the view; the pusher
   is laid on its back. Drawn: real parts are laid out however you like. */
function knollLayout(model, aspect) {
  const blocks = [], gap = 0.45, inner = 0.22;
  const tmp = new THREE.Box3(), size = new THREE.Vector3();
  for (const key of GROUP_ORDER) {
    const grp = model.groups.find((g) => g.key === key);
    if (!grp) continue;
    const n = grp.items.length, cols = n <= 2 ? n : key === "seats" ? n : Math.ceil(Math.sqrt(n));
    const boxes = grp.items.map((it) => {
      const keepQ = it.quaternion.clone(), keepP = it.position.clone();
      let q = new THREE.Quaternion();
      if (key === "pusher") q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      it.quaternion.copy(q); it.position.set(0, 0, 0);
      solidBox(it, tmp); tmp.getSize(size);
      if (size.z > size.x * 1.15) {
        q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(q);
        it.quaternion.copy(q); solidBox(it, tmp);
      }
      const box = tmp.clone();
      it.quaternion.copy(keepQ); it.position.copy(keepP); it.updateMatrixWorld(true);
      return { it, q, box };
    });
    const cw = Math.max(...boxes.map((b) => b.box.getSize(size).x)), cd = Math.max(...boxes.map((b) => b.box.getSize(size).z));
    const rows = Math.ceil(n / cols);
    blocks.push({ grp, boxes, cols, cw, cd, w: cols * cw + (cols - 1) * inner, d: rows * cd + (rows - 1) * inner });
  }
  /* On a tall (phone) view the camera looks along the rows instead of
     across them, so the rows are packed for the turned view. */
  const portrait = aspect < 0.95;
  const area = blocks.reduce((a, b) => a + (b.w + gap) * (b.d + gap), 0);
  const usable = Math.max(...blocks.map((b) => b.w), Math.sqrt(area * clamp(portrait ? 1 / aspect : aspect, 0.8, 2.4)) * 1.08);
  blocks.sort((a, b) => b.w * b.d - a.w * a.d);
  const shelves = [];
  for (const b of blocks) {
    let s = shelves.find((sh) => sh.x + b.w <= usable);
    if (!s) { s = { x: 0, d: 0, items: [] }; shelves.push(s); }
    b.x = s.x; s.x += b.w + gap; s.d = Math.max(s.d, b.d); s.items.push(b);
  }
  let z = 0, widest = 0;
  for (const s of shelves) { for (const b of s.items) b.z = z; z += s.d + gap; widest = Math.max(widest, s.x - gap); }
  const depth = z - gap, ox = -widest / 2, oz = -depth / 2;
  const poses = new Map(), anchors = [];
  for (const b of blocks) {
    b.boxes.forEach(({ it, q, box }, k) => {
      const c = k % b.cols, r = Math.floor(k / b.cols);
      const cx = ox + b.x + c * (b.cw + inner) + b.cw / 2, cz = oz + b.z + r * (b.cd + inner) + b.cd / 2;
      const mid = box.getCenter(new THREE.Vector3());
      poses.set(it, { p: new THREE.Vector3(cx - mid.x, -box.min.y + 0.002, cz - mid.z), q });
    });
    /* Each label hangs under its block as the camera sees it: on the near
       side (+z) normally, on the near end (-x) when the view is turned. */
    anchors.push({ key: b.grp.key, label: b.grp.label, at: portrait
      ? new THREE.Vector3(ox + b.x - 0.12, 0.01, oz + b.z + b.d / 2)
      : new THREE.Vector3(ox + b.x + b.w / 2, 0.01, oz + b.z + b.d + 0.12) });
  }
  return { poses, anchors, width: widest, depth, portrait };
}

export function mountHangar({ canvas, labelLayer = null, plan, dark = true, step = 0, onHover, onPick }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  let pal = PALETTES[dark ? "dark" : "light"];
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.sky, 60, 160);
  const env = roomLight(renderer, scene);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7d838c, 0.45); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.3); key.castShadow = true; scene.add(key, key.target);
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.55); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = true; controls.maxPolarAngle = Math.PI * 0.495;
  let labels = null;
  if (labelLayer) {
    labels = new CSS2DRenderer({ element: labelLayer });
    /* Its own stacking context: CSS2DRenderer gives every label a z-index, which must not lift it over the page's cards. */
    Object.assign(labelLayer.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" });
  }
  const sizeTo = () => {
    const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); labels?.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; ground.receiveShadow = true; scene.add(ground);
  let bay = null, bayW = 0, bayD = 0;

  let model = null, knoll = null, current = 0, curPlan = plan, steps = plan.steps;
  let anchorObjs = [], personTag = null, labelsOn = true, presets = [], homeBox = new Map();
  const anim = new Map();
  let playing = true, speed = 1, hoverKey = null, pinned = null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const fittedBy = (i) => new Set(steps.slice(1, i + 1).flatMap((k) => STEP_FITS[k] ?? []));
  const stepKey = (i) => steps[i];

  function tint(keyOn) {
    for (const g of model?.groups ?? []) {
      const on = g.key === keyOn;
      for (const it of g.items) it.traverse((o) => {
        if (o.isMesh && o.material?.emissive && !o.material.transparent) { o.material.emissive.setHex(on ? pal.accent : 0x000000); o.material.emissiveIntensity = on ? 0.3 : 1; }
      });
    }
  }
  /* The cabin step sees through the skin. */
  function cutaway(on) {
    for (const m of model?.fuselageMeshes ?? []) {
      const mt = m.material;
      if (mt.transparent === on) continue;
      mt.transparent = on; mt.opacity = on ? 0.2 : 1; mt.depthWrite = !on; mt.needsUpdate = true;
      m.castShadow = !on;
    }
    tint(pinned ?? hoverKey);
  }
  const home = (it) => ({ p: it.userData.homeP, q: it.userData.homeQ });
  function poseOf(i, it) {
    if (i === 0) return knoll.poses.get(it) ?? null;
    return fittedBy(i).has(it.userData.groupKey) ? home(it) : null;
  }
  /* The stands carry the fuselage until the gear is on; the person stands
     by the build spot, or by the parts on the floor. */
  function props(i) {
    const fus = fittedBy(i).has("fuselage"), gear = fittedBy(i).has("gear");
    model.stands.visible = i > 0 && fus && !gear;
    if (i === 0) model.person.position.set(-knoll.width / 2 - 1.1, 0, knoll.depth / 2 - 0.4);
    else model.person.position.copy(model.toWorld(curPlan.person.x, curPlan.person.y, curPlan.zGround)).setY(0);
    model.person.rotation.y = Math.atan2(model.person.position.z, -model.person.position.x);     // facing the aircraft
    if (personTag) personTag.position.copy(model.person.position).setY(PERSON_HEIGHT_M + 0.12);
    cutaway(stepKey(i) === "cabin");
  }
  function poseInstant(i) {
    anim.clear();
    for (const it of model.items) {
      const ps = poseOf(i, it);
      it.visible = !!ps;
      if (ps) { it.position.copy(ps.p); it.quaternion.copy(ps.q); }
    }
    for (const a of anchorObjs) a.visible = i === 0 && labelsOn;
    props(i);
  }
  /* Step to i: the parts this step fits lift off the floor and fly into
     place, one after another; going back takes them away. */
  function applyStep(i, { instant = false, replay = false } = {}) {
    const prev = current; current = clamp(i, 0, steps.length - 1);
    if (instant || reduced || !model) { if (model) poseInstant(current); flyCamera(presets[current], true); return; }
    anim.clear();
    const before = prev === 0 ? null : fittedBy(prev);
    let k = 0;
    const order = [...model.items].sort((a, b) => GROUP_ORDER.indexOf(a.userData.groupKey) - GROUP_ORDER.indexOf(b.userData.groupKey));
    const n = order.filter((it) => poseOf(current, it)).length;
    const stagger = Math.min(0.12, 1.6 / Math.max(1, n));
    for (const it of order) {
      const to = poseOf(current, it);
      if (!to) { it.visible = false; continue; }
      const wasThere = prev === 0 ? current === 0 : before.has(it.userData.groupKey) && current !== 0;
      const fresh = replay ? (current === 0 || (STEP_FITS[stepKey(current)] ?? []).includes(it.userData.groupKey)) : !wasThere;
      if (!fresh && it.visible) { it.position.copy(to.p); it.quaternion.copy(to.q); continue; }
      const from = current === 0 ? { p: to.p.clone().add(new THREE.Vector3(0, 0.8 + 0.4 * Math.random(), 0)), q: to.q } : (knoll.poses.get(it) ?? to);
      it.visible = true; it.position.copy(from.p); it.quaternion.copy(from.q);
      anim.set(it, { fp: from.p.clone(), fq: from.q.clone(), tp: to.p, tq: to.q, delay: (k++) * stagger, dur: current === 0 ? 0.55 : 1.1, t: 0 });
    }
    for (const a of anchorObjs) a.visible = current === 0 && labelsOn;
    props(current);
    flyCamera(presets[current]);
  }
  function stepAnim(dt) {
    const lift = 1.6;
    for (const [it, a] of anim) {
      a.t += dt;
      const u = clamp((a.t - a.delay) / a.dur, 0, 1), e = easeInOut(u);
      it.position.lerpVectors(a.fp, a.tp, e);
      if (current !== 0) it.position.y += Math.sin(Math.PI * e) * lift;
      it.quaternion.slerpQuaternions(a.fq, a.tq, e);
      if (u >= 1) anim.delete(it);
    }
  }

  /* Camera views, one per step, framed on what that step fits. */
  const camAnim = { t: 1, fp: new THREE.Vector3(), ft: new THREE.Vector3(), tp: new THREE.Vector3(), tt: new THREE.Vector3() };
  function fitDist(rx, ry) { const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), th = tv * camera.aspect; return 1.1 * Math.max(rx / th, ry / tv); }
  function view(target, dir, rx, ry = rx * 0.62) { const d = dir.clone().normalize().multiplyScalar(fitDist(rx, ry)); return { pos: target.clone().add(d), target }; }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function makePresets() {
    const all = new THREE.Box3(); for (const b of homeBox.values()) all.union(b);
    const c = all.getCenter(new THREE.Vector3()), sz = all.getSize(new THREE.Vector3());
    const at = (g, fb = c) => (homeBox.get(g) ? homeBox.get(g).getCenter(new THREE.Vector3()) : fb.clone());
    const span = sz.z, len = sz.x;
    const m0 = model.groups.find((g) => g.key === "motors")?.items.reduce((best, it) => (!best || it.userData.homeP.x + it.userData.homeP.z > best.userData.homeP.x + best.userData.homeP.z ? it : best), null);
    return steps.map((k) => {
      switch (k) {
        case "parts": {
          /* Turned on a tall view: the camera looks up the rows from their
             near end, so the long rows run up the screen. */
          if (knoll.portrait) {
            const dir = V(-0.5, 1, 0).normalize(), elev = Math.atan2(dir.y, -dir.x);
            return view(V(-0.5, 0, 0), dir, (knoll.depth + 2.6) / 2, ((knoll.width + 3.2) * Math.sin(elev)) / 2 + 0.6);
          }
          const dir = V(0, 1, 0.5).normalize(), elev = Math.atan2(dir.y, dir.z);
          return view(V(-0.9, 0, 0.3), dir, (knoll.width + 4.6) / 2, ((knoll.depth + 1.6) * Math.sin(elev)) / 2 + 0.6);
        }
        case "fuselage": return view(at("fuselage").setY(at("fuselage").y * 0.8), V(0.55, 0.32, 1), sz.x * 0.4 + 0.8);
        case "cabin": return view(at("seats", at("fuselage")), V(0.42, 1.05, 0.78), 3.3);
        case "wing": return view(at("wing"), V(0.7, 0.75, 0.9), span / 2 + 0.4);
        /* From behind and a little above: both tail panels, as a V. */
        case "tail": return view(at("tail"), V(-1, 0.42, 0.32), 3.2);
        case "booms": return view(at("booms"), V(0.6, 0.85, 0.9), span * 0.36 + 0.6);
        /* Side on to the near boom, so the stack is seen standing on it. */
        case "motors": return view(m0 ? m0.userData.homeP.clone().add(V(-0.9, -0.1, 0)) : c, V(0.22, 0.42, 1), 2.6);
        case "rotors": return view(c.clone().setY(c.y + 0.6), V(0.6, 0.95, 0.85), span / 2 + 0.6);
        case "pusher": return view(at("pusher"), V(-1, 0.5, 0.45), 3.0);
        /* Side on, with the person by the nose in the picture. */
        case "gear": return view(c.clone().setY(c.y * 0.45).add(V(0.8, 0, 0)), V(0.28, 0.12, 1), len / 2 + 1.7);
        case "nacelles": return view(at("nacelles"), V(0.8, 0.55, 0.9), 2);
        default: return view(c.clone().setY(c.y * 0.75), V(0.85, 0.42, 0.95), span / 2 + 0.9);
      }
    });
  }
  function flyCamera(p, instant = false) {
    if (!p) return;
    if (instant || reduced) { camera.position.copy(p.pos); controls.target.copy(p.target); camAnim.t = 1; controls.update(); return; }
    camAnim.fp.copy(camera.position); camAnim.ft.copy(controls.target); camAnim.tp.copy(p.pos); camAnim.tt.copy(p.target); camAnim.t = 0;
  }

  function setPlan(pl, { keepCamera = false } = {}) {
    curPlan = pl; steps = pl.steps;
    const oldSpan = model ? homeBox.get("wing")?.getSize(new THREE.Vector3()).z : null;
    if (model) { scene.remove(model.group, model.stands, model.person); disposeGroup(model.group); disposeGroup(model.stands); disposeGroup(model.person); }
    anchorObjs.forEach((a) => { a.removeFromParent(); a.element.remove(); }); anchorObjs = [];
    if (personTag) { personTag.removeFromParent(); personTag.element.remove(); personTag = null; }
    model = buildEvtol(pl);
    homeBox = new Map();
    for (const it of model.items) {
      it.userData.homeP = it.position.clone(); it.userData.homeQ = it.quaternion.clone();
      const g = it.userData.groupKey, b = solidBox(it, new THREE.Box3());
      homeBox.set(g, homeBox.has(g) ? homeBox.get(g).union(b) : b);
    }
    knoll = knollLayout(model, camera.aspect);
    /* The bay: big enough for the aircraft and for its parts laid out. */
    const all = new THREE.Box3(); for (const b of homeBox.values()) all.union(b);
    const asz = all.getSize(new THREE.Vector3());
    const w = Math.ceil(Math.max(asz.x, knoll.width + 3) + 6), d = Math.ceil(Math.max(asz.z, knoll.depth) + 6);
    if (!bay || w !== bayW || d !== bayD) {
      if (bay) { scene.remove(bay); disposeGroup(bay); }
      bayW = w; bayD = d;
      bay = new THREE.Mesh(new THREE.PlaneGeometry(bayW, bayD), new THREE.MeshStandardMaterial({ map: bayTexture(bayW, bayD, pal), roughness: 0.82, envMapIntensity: 0.5 }));
      bay.rotation.x = -Math.PI / 2; bay.receiveShadow = true; scene.add(bay);
      const s = Math.max(bayW, bayD);
      key.position.set(s * 0.35, s * 0.9, s * 0.55); key.target.position.set(0, 0, 0);
      Object.assign(key.shadow.camera, { left: -s * 0.62, right: s * 0.62, top: s * 0.62, bottom: -s * 0.62, near: 0.5, far: s * 3 });
      key.shadow.camera.updateProjectionMatrix();
      fill.position.set(-s, s * 0.6, -s * 0.4);
      controls.minDistance = 1.5; controls.maxDistance = s * 3;
    }
    scene.add(model.group, model.stands, model.person);
    if (labels) {
      const tagOf = (text) => {
        const el = document.createElement("div"), tag = document.createElement("div");
        tag.textContent = text; el.className = "bench-label"; el.appendChild(tag);
        Object.assign(tag.style, { font: "600 11px system-ui, sans-serif", padding: "2px 7px", borderRadius: "4px", whiteSpace: "nowrap",
          background: dark ? "rgba(15,21,32,0.92)" : "rgba(255,255,255,0.96)", color: dark ? "#C8D8E8" : "#0B1524",
          border: `1px solid ${dark ? "#1C2B3A" : "#d9d3c7"}`, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" });
        return el;
      };
      for (const a of knoll.anchors) {
        const o = new CSS2DObject(tagOf(a.label)); o.position.copy(a.at); o.center.set(0.5, 0);
        o.userData.key = a.key; scene.add(o); anchorObjs.push(o);
      }
      personTag = new CSS2DObject(tagOf("person, 1.8 m")); personTag.center.set(0.5, 1); personTag.visible = labelsOn; scene.add(personTag);
    }
    presets = makePresets();
    poseInstant(current = clamp(current, 0, steps.length - 1));
    const span = homeBox.get("wing")?.getSize(new THREE.Vector3()).z;
    if (!keepCamera || !oldSpan || Math.abs(span / oldSpan - 1) > 0.05) flyCamera(presets[current], true);
    tint(pinned ?? hoverKey);
    return model;
  }

  /* Hover and click: find the part under the pointer. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pointer = null, down = null;
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const pick = (cx, cy) => {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(model.items, true).find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3) && isShown(h.object));
    const root = hit?.object.userData.itemRoot;
    if (!root) return null;
    const g = model.groups.find((x) => x.key === root.userData.groupKey);
    return g ? { key: g.key, label: g.label, count: g.items.length } : null;
  };
  const onMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
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

  sizeTo();
  current = clamp(step, 0, plan.steps.length - 1);
  setPlan(plan);

  /* Labels that would overlap on screen are pushed down, one under the
     other, the way a printed key is set. */
  function declutter() {
    const boxes = [...anchorObjs, personTag].filter((a) => a && a.visible).map((a) => {
      const tag = a.element.firstChild, r = tag.getBoundingClientRect(), dy = a.userData.dy ?? 0;
      return { a, tag, l: r.left, r: r.right, t: r.top - dy, b: r.bottom - dy };
    }).filter((x) => x.r > x.l).sort((x, y) => x.t - y.t || x.l - y.l);
    const placed = [];
    for (const x of boxes) {
      let dy = 0;
      for (let pass = 0; pass < 12; pass++) {
        const hit = placed.find((q) => x.l < q.r + 3 && x.r > q.l - 3 && x.t + dy < q.b + 2 && x.b + dy > q.t - 2);
        if (!hit) break;
        dy = hit.b + 2 - x.t;
      }
      if ((x.a.userData.dy ?? 0) !== dy) { x.a.userData.dy = dy; x.tag.style.transform = dy ? `translateY(${Math.round(dy)}px)` : ""; }
      placed.push({ l: x.l, r: x.r, t: x.t + dy, b: x.b + dy });
    }
    /* The person's tag is dropped when it would sit under the tool buttons
       down the right edge, or run off the picture. */
    if (personTag?.visible) {
      const c = canvas.getBoundingClientRect(), r = personTag.element.firstChild.getBoundingClientRect();
      const off = r.width > 0 && (r.right > c.right - 56 || r.left < c.left + 2 || r.top < c.top + 2 || r.bottom > c.bottom - 2);
      personTag.element.style.visibility = off ? "hidden" : "";
    }
  }
  let raf = 0, last = 0, alive = true, lastPickAt = 0, lastTidy = 0;
  function frame(now) {
    if (!alive) return;
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (playing) stepAnim(dt * speed);
    if (camAnim.t < 1) {
      camAnim.t = Math.min(1, camAnim.t + dt / 1.2);
      const e = easeInOut(camAnim.t);
      camera.position.lerpVectors(camAnim.fp, camAnim.tp, e); controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
    }
    if (pointer && now - lastPickAt > 60) {
      lastPickAt = now;
      const g = pick(pointer.x, pointer.y), k = g?.key ?? null;
      if (k !== hoverKey) { hoverKey = k; tint(pinned ?? hoverKey); onHover?.(g, pointer.x, pointer.y); canvas.style.cursor = g ? "pointer" : "grab"; }
      else if (g) onHover?.(g, pointer.x, pointer.y);
    }
    controls.update();
    renderer.render(scene, camera);
    labels?.render(scene, camera);
    if (labels && labelsOn && now - lastTidy > 150) { lastTidy = now; declutter(); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame((n) => { last = n; frame(n); });

  return {
    setStep: (i) => applyStep(i),
    replay: () => applyStep(current, { replay: true }),
    setPlaying: (on) => { playing = !!on; },
    setSpeed: (x) => { speed = clamp(Number(x) || 1, 0.25, 4); },
    setLabels: (on) => { labelsOn = !!on; for (const a of anchorObjs) a.visible = current === 0 && labelsOn; if (personTag) personTag.visible = labelsOn; },
    highlight: (k) => { pinned = k ?? null; tint(pinned ?? hoverKey); },
    zoom(dir) {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(dir > 0 ? 0.8 : 1.25);
      const len = clamp(off.length(), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(off.setLength(len)); camAnim.t = 1;
    },
    resetView: () => flyCamera(presets[current]),
    setPlan: (pl) => setPlan(pl, { keepCamera: true }),
    /* One small picture per step, for the step strip. Not while parts or
       the camera are moving: posing every step would cut the move short. */
    thumbnails(w = 176, h = 112) {
      if (!model) return [];
      if (anim.size > 0 || camAnim.t < 1) return null;
      const keep = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
      const cam = camera.clone(); const shown = anchorObjs.map((a) => a.visible), tagShown = personTag?.visible;
      renderer.setPixelRatio(1); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      const urls = steps.map((_, i) => {
        poseInstant(i);
        const p = presets[i]; cam.position.copy(p.pos); cam.lookAt(p.target);
        renderer.render(scene, cam);
        return canvas.toDataURL("image/jpeg", 0.82);
      });
      renderer.setPixelRatio(pr); renderer.setSize(keep.x, keep.y, false);
      poseInstant(current);
      anchorObjs.forEach((a, k) => { a.visible = shown[k]; }); if (personTag) personTag.visible = tagShown;
      renderer.render(scene, camera);
      return urls;
    },
    setDark(d) {
      dark = d; pal = PALETTES[d ? "dark" : "light"];
      scene.background = new THREE.Color(pal.sky); scene.fog.color.set(pal.sky); ground.material.color.set(pal.floor);
      if (bay) { scene.remove(bay); disposeGroup(bay); bay = null; }
      setPlan(curPlan, { keepCamera: true });
    },
    resize: () => { sizeTo(); if (model) presets = makePresets(); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); controls.dispose();
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      anchorObjs.forEach((a) => a.element.remove()); personTag?.element.remove();
      disposeGroup(scene); env.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
