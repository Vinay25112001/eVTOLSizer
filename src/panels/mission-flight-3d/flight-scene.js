/* =====================================================================
   FLIGHT SCENE — three.js, and nothing else
   =====================================================================
   Draws what MissionFlight3D hands it: the aircraft's faces (already
   split into airframe and rotors by flight-view.js, from buildMesh), the
   mission profile (from missionPathAt), and each frame's position and
   nacelle endpoint. It computes no quantity of the aircraft or of the
   mission. Loaded on demand, so three.js never reaches a page that does
   not open this view.

   AXES. Geometry is +x aft, +y right, +z up. The world here is +X along
   the ground track (forward), +Y up, +Z to the right, which is the same
   handedness turned: (x, y, z) -> (-x, z, y).

   SCALE. True, in every axis: the aircraft, the heights and the ground
   track are all in metres. Only the clock is compressed, and the panel
   says by how much.
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const PAL = {
  light: { sky: "#dce6ef", ground: "#d3dacb", grid: "#b2bba6", gridMajor: "#8c977f", pad: "#f4f1e8", padInk: "#2f6fb0", path: "#2f6fb0", post: "#7b8794", shadow: 0.26 },
  dark:  { sky: "#0d1826", ground: "#132131", grid: "#203448", gridMajor: "#2f4a66", pad: "#1d2f44", padInk: "#6fb2ff", path: "#6fb2ff", post: "#4d6175", shadow: 0.45 },
};
/* Rotor spin is DRAWN, to show which rotors turn. It is not the rotor
   speed: at sixty frames a second a true rotor speed strobes into a
   rotor that looks stopped or backwards, which is worse than a stated
   drawing rate. */
export const DRAWN_SPIN_REV_PER_S = 2.5;
export const CAMERAS = Object.freeze(["chase", "side", "orbit"]);

const toWorld = ([x, y, z], c) => [-(x - c[0]), z - c[2], y - c[1]];

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
  });
}

/* Polygons -> one non-indexed triangle soup with a colour per face. The
   palette is sRGB; three works in linear, so each colour is converted
   rather than written raw (raw would wash every face out). */
function facesToGeometry(faces, c) {
  const pos = [], col = [], tmp = new THREE.Color();
  for (const f of faces) {
    tmp.setRGB(f.colour[0] / 255, f.colour[1] / 255, f.colour[2] / 255, THREE.SRGBColorSpace);
    const w = f.v.map((q) => toWorld(q, c));
    for (let i = 1; i + 1 < w.length; i++) for (const q of [w[0], w[i], w[i + 1]]) { pos.push(...q); col.push(tmp.r, tmp.g, tmp.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildVariant(parts, centre, discColours, mats) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(facesToGeometry(parts.airframe, centre), mats.solid));
  const rotors = parts.rotors.map((r) => {
    const pivot = new THREE.Group();
    const hub = toWorld(r.centre, centre);
    pivot.position.set(...hub);
    /* The rotor's own faces, about its own hub, so turning the pivot
       turns the blades in their plane and moves nothing else. */
    const local = [hub[0], hub[1], hub[2]];
    const isDisc = (f) => discColours.includes(f.colour.join(","));
    const shift = (g) => { g.translate(-local[0], -local[1], -local[2]); return g; };
    const blades = new THREE.Mesh(shift(facesToGeometry(r.faces.filter((f) => !isDisc(f)), centre)), mats.solid);
    const disc = new THREE.Mesh(shift(facesToGeometry(r.faces.filter(isDisc), centre)), mats.disc);
    pivot.add(blades, disc);
    group.add(pivot);
    const a = r.axis;
    return { pivot, disc, axis: new THREE.Vector3(-a[0], a[2], a[1]).normalize(), angle: 0 };
  });
  return { group, rotors };
}

function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* variants: { heli, plane } — airframeParts at the two nacelle endpoints
   (the same object twice for an aircraft that does not convert).
   bounds: boundsOf(heli). profile: [[groundM, altitudeAglM], ...] over the
   flown mission. trackM: the ground track. */
export function mountFlight({ canvas, variants, bounds, discColours, profile, trackM, dark = true }) {
  const pal = dark ? PAL.dark : PAL.light;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.sky, 400, 6000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7a6a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-300, 800, 400); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 40000);

  const { lo, hi } = bounds;
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const halfH = (hi[2] - lo[2]) / 2;
  const L = Math.max(hi[0] - lo[0], hi[1] - lo[1]);

  /* Ground, a grid that travels with the aircraft, the two pads, and a
     post every kilometre along the track so the distance reads. */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(trackM + 40000, 40000),
    new THREE.MeshLambertMaterial({ color: pal.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(trackM / 2, 0, 0); scene.add(ground);
  const grid = new THREE.GridHelper(3000, 60, pal.gridMajor, pal.grid);
  grid.position.y = 0.03; scene.add(grid);
  for (const x of [0, trackM]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(L * 1.1, 48), new THREE.MeshLambertMaterial({ color: pal.pad }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.05, 0); scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(L * 0.95, L * 1.05, 48), new THREE.MeshBasicMaterial({ color: pal.padInk }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.07, 0); scene.add(ring);
  }
  const nPost = Math.max(0, Math.floor(trackM / 1000)) + 1;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 14, 1.2), new THREE.MeshLambertMaterial({ color: pal.post }), nPost);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nPost; i++) { m4.makeTranslation(i * 1000, 7, -60); posts.setMatrixAt(i, m4); }
  scene.add(posts);

  /* The profile the aircraft flies, at true scale, through its centre. */
  const path = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(profile.map(([g, a]) => new THREE.Vector3(g, a + halfH, 0))),
    new THREE.LineBasicMaterial({ color: pal.path, transparent: true, opacity: 0.55 }));
  scene.add(path);

  const mats = {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.08 }),
    disc: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const craft = new THREE.Group(); scene.add(craft);
  const heli = buildVariant(variants.heli, centre, discColours, mats);
  const plane = variants.plane === variants.heli ? heli : buildVariant(variants.plane, centre, discColours, mats);
  craft.add(heli.group); if (plane !== heli) craft.add(plane.group);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: pal.shadow }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: pal.path, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.6 }));
  scene.add(drop);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enabled = false;

  let mode = "chase", frame = { groundM: 0, altitudeAglM: 0, nacelleTiltDeg: 90, turning: [] };
  let alive = true, raf = 0, last = performance.now(), snap = true;
  const target = new THREE.Vector3();
  const camGoal = new THREE.Vector3(), camOffset = new THREE.Vector3();

  const sizeTo = () => {
    const w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  /* DRAWN WHEN IT CHANGES. The view is drawn when the aircraft moves, a
     rotor turns, the camera eases or is dragged, or the size changes, and
     not otherwise; off the screen (another tab, a hidden studio) it is not
     drawn at all. It used to draw every frame regardless. */
  let dirty = 2, onScreen = true;
  const io = typeof window.IntersectionObserver === "function"
    ? new window.IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); if (onScreen) dirty = 2; }) : null;
  io?.observe(canvas);
  controls.addEventListener("change", () => { dirty = 2; });   // a drag in the orbit view
  const ro = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(() => { sizeTo(); dirty = 2; }) : null;
  ro?.observe(canvas); sizeTo();

  const place = () => {
    const y = frame.altitudeAglM + halfH;
    craft.position.set(frame.groundM, y, 0);
    const airplane = frame.nacelleTiltDeg === 0;
    heli.group.visible = !airplane || plane === heli;
    if (plane !== heli) plane.group.visible = airplane;
    const sz = L * Math.max(0.6, 1.4 - frame.altitudeAglM / 400);
    shadow.position.set(frame.groundM, 0.09, 0); shadow.scale.set(sz, sz * 0.8, 1);
    shadow.material.opacity = pal.shadow * Math.max(0.12, 1 - frame.altitudeAglM / 600);
    drop.geometry.setFromPoints([new THREE.Vector3(frame.groundM, 0.1, 0), new THREE.Vector3(frame.groundM, Math.max(0.1, frame.altitudeAglM), 0)]);
    drop.computeLineDistances();
    grid.position.x = Math.round(frame.groundM / 50) * 50;
  };

  const tick = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (!onScreen) return;
    let moving = snap;
    const active = frame.nacelleTiltDeg === 0 ? plane : heli;
    active.rotors.forEach((r, i) => {
      const on = !!frame.turning[i];
      if (r.disc.visible !== on) { r.disc.visible = on; moving = true; }
      if (on) { r.angle += 2 * Math.PI * DRAWN_SPIN_REV_PER_S * dt * (i % 2 ? -1 : 1); r.pivot.quaternion.setFromAxisAngle(r.axis, r.angle); moving = true; }
    });
    const prevTarget = target.clone();
    target.copy(craft.position);
    if (!target.equals(prevTarget)) moving = true;
    if (mode === "orbit") {
      camera.position.add(target.clone().sub(prevTarget));
      controls.target.copy(target); if (controls.update()) moving = true;
    } else {
      /* The camera eases its OFFSET from the aircraft, never its position:
         at a compressed clock the aircraft covers a kilometre a second, and
         a camera chasing a position would trail hundreds of metres behind. */
      if (mode === "chase") camGoal.set(-(L * 1.9 + 6), L * 0.55 + 2.5, L * 0.85);
      else camGoal.set(0, L * 0.12, L * 3.2 + 12);
      if (camOffset.distanceToSquared(camGoal) > 1e-8) moving = true;
      if (snap) camOffset.copy(camGoal); else camOffset.lerp(camGoal, 1 - Math.exp(-dt * 5));
      camera.position.copy(target).add(camOffset);
      camera.lookAt(target);
    }
    snap = false;
    if (!moving && dirty <= 0) return;
    if (dirty > 0) dirty--;
    renderer.render(scene, camera);
  };
  place();
  raf = requestAnimationFrame(tick);

  return {
    setFrame(f) { frame = f; place(); dirty = 2; },
    setCamera(m) {
      if (!CAMERAS.includes(m)) return;
      mode = m; controls.enabled = m === "orbit"; snap = m !== "orbit"; dirty = 2;
      if (m === "orbit") { camera.position.copy(craft.position).add(new THREE.Vector3(-L * 1.6, L * 0.9, L * 1.6)); controls.target.copy(craft.position); controls.update(); }
    },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect(); controls.dispose();
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
