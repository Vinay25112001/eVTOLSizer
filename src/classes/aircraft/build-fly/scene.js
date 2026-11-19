/* =====================================================================
   AIRCRAFT BUILD & FLY SCENES — three.js, and nothing else
   =====================================================================
   Draws what the Build and Fly tabs hand it: the plan (plan.js) and the
   mission profile (mission-profile.js). It computes no quantity of the
   aeroplane or of its mission. The airfoil section, the nacelle profile,
   the pylons, struts, spinner and blades are drawing shapes at the plan's
   sized dimensions; the tabs say which numbers are sized.

   AXES. The plan is x aft, y starboard, z up (metres, nose at the
   origin). The world is +X forward along the track, +Y up, +Z starboard:
   (x, y, z) -> (-x, z, y), the same turn flight-scene.js uses.

   Loaded on demand, so three.js never reaches a page that does not open
   one of these tabs. Both scenes draw only when something changes.
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const PERSON_HEIGHT_M = 1.8;
export const CAMERAS = Object.freeze(["chase", "side", "orbit"]);

const PAL = {
  dark:  { sky: 0x0d1826, floor: 0x15212f, grid: 0x24384d, gridMajor: 0x35526f, ground: 0x18283a, groundGrid: 0x24384d, runway: 0x2a3644,
           mark: 0xd8e2ee, path: 0x6fb2ff, hull: 0xdfe5ec, trim: 0x5f7387, glass: 0x1b2a3a, accent: 0xf2b23a, tyre: 0x22282f, person: 0x8ea3b8 },
  light: { sky: 0xdce6ef, floor: 0xe9ece6, grid: 0xc4cbbd, gridMajor: 0x99a38d, ground: 0xc9d3c0, groundGrid: 0xa9b59e, runway: 0x6b7178,
           mark: 0xf7f7f2, path: 0x2f6fb0, hull: 0xf4f6f8, trim: 0x52667a, glass: 0x24384c, accent: 0xd9921a, tyre: 0x2a2f35, person: 0x56687a },
};
const toWorld = (x, y, z) => new THREE.Vector3(-x, z, y);

/* ── the aeroplane ──────────────────────────────────────────────────── */

/* NACA four-digit symmetric thickness, as a drawing of a section. */
function sectionPoints(n = 22) {
  const up = [];
  for (let i = 0; i <= n; i++) {
    const x = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    const yt = 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    up.push([x, yt]);
  }
  const lo = up.slice(1, -1).reverse().map(([x, y]) => [x, -y]);
  return [...up, ...lo];       // closed loop, trailing edge first point
}
const SECTION = sectionPoints();

function fuselageGeometry(stations, around = 40) {
  const pos = [], idx = [];
  for (const s of stations) {
    for (let j = 0; j < around; j++) {
      const th = (2 * Math.PI * j) / around;
      const v = toWorld(s.x, s.b * Math.sin(th), s.zc + s.a * Math.cos(th));
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j, b = i * around + ((j + 1) % around), c = a + around, d = b + around;
      idx.push(a, c, b, b, c, d);
    }
  }
  /* close the tail */
  const last = stations[stations.length - 1], ci = pos.length / 3;
  const cv = toWorld(last.x, 0, last.zc); pos.push(cv.x, cv.y, cv.z);
  const base = (stations.length - 1) * around;
  for (let j = 0; j < around; j++) idx.push(base + j, base + ((j + 1) % around), ci);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* One panel of a lifting surface between two chordwise sections.
   `sec(f)` returns { le: [x, y, z], chord, tc, vertical } at span
   fraction f. */
function surfaceGeometry(sec, steps = 1) {
  const pos = [], idx = [], N = SECTION.length;
  for (let s = 0; s <= steps; s++) {
    const { le, chord, tc, vertical } = sec(s / steps);
    for (const [u, t] of SECTION) {
      const th = t * tc * chord;
      const x = le[0] + u * chord;
      const p = vertical ? toWorld(x, le[1] + th, le[2]) : toWorld(x, le[1], le[2] + th);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let s = 0; s < steps; s++) for (let j = 0; j < N; j++) {
    const a = s * N + j, b = s * N + ((j + 1) % N), c = a + N, d = b + N;
    idx.push(a, b, c, b, d, c);
  }
  /* cap both ends */
  for (const s of [0, steps]) {
    const o = s * N;
    for (let j = 1; j < N - 1; j++) s === 0 ? idx.push(o, o + j + 1, o + j) : idx.push(o, o + j, o + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function liftingSurface(sf, side) {
  const tanS = Math.tan(sf.sweepLE), tanD = Math.tan(sf.dihedral || 0);
  return surfaceGeometry((f) => {
    const y = sf.y0 + f * (sf.semi - sf.y0);
    const chord = sf.root + (sf.tip - sf.root) * (y / Math.max(sf.semi, 1e-9));
    return { le: [sf.rootLE + y * tanS, side * y, sf.z + y * tanD], chord, tc: sf.tc };
  });
}
function finSurface(vt) {
  const tanS = Math.tan(vt.sweepLE);
  return surfaceGeometry((f) => {
    const h = f * vt.semi;
    return { le: [vt.rootLE + h * tanS, 0, vt.z + h], chord: vt.root + (vt.tip - vt.root) * f, tc: vt.tc, vertical: true };
  });
}

/* A nacelle drawn as a turned profile at the sized diameter and length. */
function nacelleGeometry(d, l) {
  const r = d / 2, pts = [
    [0.80 * r, 0], [0.97 * r, 0.04 * l], [r, 0.18 * l], [r, 0.55 * l], [0.86 * r, 0.88 * l], [0.62 * r, l], [0.0, l],
  ].map(([rr, x]) => new THREE.Vector2(rr, x));
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(Math.PI / 2);          // lathe axis +Y -> -X (forward is +X, so the inlet faces forward)
  return g;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...opts });
}

/* The aeroplane as named groups (fuselage, wing, tail, engines, gear) in
   world axes, nose at the origin, ground line at y = plan.groundZ. */
export function buildAircraft(plan, pal) {
  const root = new THREE.Group();
  const groups = {};
  for (const k of ["fuselage", "wing", "tail", "engines", "gear"]) { groups[k] = new THREE.Group(); groups[k].name = k; root.add(groups[k]); }
  /* Materials per group, so the Build tab can light up one group alone. */
  const mats = {};
  const M = (k, which) => (mats[k] ??= { hull: mat(pal.hull), trim: mat(pal.trim) })[which];
  const glass = mat(pal.glass, { roughness: 0.2, metalness: 0.3 });

  groups.fuselage.add(new THREE.Mesh(fuselageGeometry(plan.fuselage.stations), M("fuselage", "hull")));
  /* A windscreen band, drawn, so the nose reads as the front. */
  const L = plan.fuselage.length, st = plan.fuselage.stations;
  const xw = Math.min(L * 0.12, L * 0.5);
  const sw = st.reduce((best, s) => (Math.abs(s.x - xw) < Math.abs(best.x - xw) ? s : best), st[0]);
  const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), glass);
  ws.scale.set(sw.a * 0.55, sw.a * 0.45, sw.b * 0.98);
  ws.position.copy(toWorld(sw.x, 0, sw.zc + sw.a * 0.42)); ws.rotation.z = -0.5;
  groups.fuselage.add(ws);

  for (const s of [1, -1]) groups.wing.add(new THREE.Mesh(liftingSurface(plan.wing, s), M("wing", "hull")));
  for (const s of [1, -1]) groups.tail.add(new THREE.Mesh(liftingSurface(plan.ht, s), M("tail", "hull")));
  groups.tail.add(new THREE.Mesh(finSurface(plan.vt), M("tail", "hull")));
  const trim = M("engines", "trim");

  for (const n of plan.nacelles) {
    if (n.kind === "nose") {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.12, plan.fuselage.height * 0.12), Math.max(0.3, plan.fuselage.height * 0.35), 24), trim);
      sp.rotation.z = -Math.PI / 2; sp.position.copy(toWorld(-plan.fuselage.height * 0.12, 0, 0));
      groups.engines.add(sp);
      continue;
    }
    const pod = new THREE.Mesh(nacelleGeometry(n.d, n.l), trim);
    pod.position.copy(toWorld(n.x, n.y, n.z));
    groups.engines.add(pod);
    /* a pylon, drawn, from the pod to the wing or the body */
    const toBody = n.kind === "pod" && plan.engineLocation === "aft-fuselage";
    const py = new THREE.Mesh(new THREE.BoxGeometry(n.l * 0.55, toBody ? n.d * 0.18 : n.d * 0.55, toBody ? Math.abs(n.y) * 0.6 : n.d * 0.12), trim);
    if (toBody) py.position.copy(toWorld(n.x + n.l * 0.5, n.y * 0.62, n.z));
    else py.position.copy(toWorld(n.x + n.l * 0.55, n.y, n.z + n.d * 0.42));
    groups.engines.add(py);
  }
  const props = [];
  for (const p of plan.props) {
    const hub = new THREE.Group();
    hub.position.copy(toWorld(p.x - 0.05 * p.d, p.y, p.z));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.d / 2, 48),
      new THREE.MeshBasicMaterial({ color: pal.trim, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.y = Math.PI / 2; hub.add(disc);
    const blades = new THREE.Group();
    for (let i = 0; i < (plan.engineLocation === "nose" ? 2 : 4); i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.d * 0.02, p.d * 0.46, p.d * 0.06), trim);
      b.position.y = p.d * 0.23; const arm = new THREE.Group(); arm.add(b); arm.rotation.x = (i * 2 * Math.PI) / (plan.engineLocation === "nose" ? 2 : 4);
      blades.add(arm);
    }
    hub.add(blades); groups.engines.add(hub); props.push(blades);
  }

  const tyre = mat(pal.tyre, { roughness: 0.9 });
  for (const w of plan.wheels) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, w.r * 0.7, 28), tyre);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.copy(toWorld(w.x, w.y, plan.groundZ + w.r));
    groups.gear.add(wheel);
    /* the strut, drawn, from the axle up into the body or the wing */
    const top = w.kind === "nose" ? -plan.fuselage.height * 0.25 : plan.wing.z;
    const len = Math.max(0.1, top - (plan.groundZ + w.r));
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(w.r * 0.18, w.r * 0.18, len, 12), M("gear", "trim"));
    strut.position.copy(toWorld(w.x, w.y, plan.groundZ + w.r + len / 2));
    groups.gear.add(strut);
  }
  root.userData.props = props;
  return { root, groups, props };
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [o.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); }
  });
}

function boundsOf(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return { box, size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()) };
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7a6a, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 60, 40); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-40, 20, -30); scene.add(fill);
}

function renderOnDemand(renderer, scene, camera, controls) {
  let dirty = 2, raf = 0, alive = true;
  const wake = () => { dirty = 2; };
  controls?.addEventListener("change", wake);
  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    /* A disabled OrbitControls still re-aims the camera at its own target
       on update(), so it is only asked when it is in charge. */
    const moved = controls?.enabled ? controls.update() : false;
    if (!moved && dirty <= 0) return;
    if (dirty > 0) dirty--;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  return { wake, stop: () => { alive = false; cancelAnimationFrame(raf); controls?.removeEventListener("change", wake); } };
}

/* ── Build: the aeroplane on a floor ruled in metres ────────────────── */

export function mountBuild({ canvas, plan, dark = true, groupsShown = [], highlight = null }) {
  let pal = dark ? PAL.dark : PAL.light;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.sky);
  lights(scene);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;

  let span = Math.max(plan.size.length, plan.size.span);
  let lift = -plan.groundZ;
  let floor = null, person = null, model = null;

  function dress() {
    if (floor) { scene.remove(floor); disposeTree(floor); }
    floor = new THREE.Group();
    const size = Math.ceil((span * 1.7) / 10) * 10;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: pal.floor }));
    plane.rotation.x = -Math.PI / 2; floor.add(plane);
    const minor = new THREE.GridHelper(size, size, pal.grid, pal.grid); minor.position.y = 0.004; floor.add(minor);
    const major = new THREE.GridHelper(size, size / 5, pal.gridMajor, pal.gridMajor); major.position.y = 0.006; floor.add(major);
    floor.position.set(-plan.size.length / 2, 0, 0);
    scene.add(floor);
    if (person) { scene.remove(person); disposeTree(person); }
    person = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, PERSON_HEIGHT_M - 0.62, 6, 12), mat(pal.person));
    body.position.y = (PERSON_HEIGHT_M - 0.22) / 2; person.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat(pal.person)); head.position.y = PERSON_HEIGHT_M - 0.11; person.add(head);
    /* Just ahead of the nose and to the near side, where it reads against
       the cockpit; further out it falls below the frame. */
    person.position.set(Math.max(2.5, plan.size.length * 0.08), 0, plan.size.width / 2 + 2.5);
    scene.add(person);
  }
  function rebuild() {
    if (model) { scene.remove(model.root); disposeTree(model.root); }
    model = buildAircraft(plan, pal);
    model.root.position.y = lift;
    scene.add(model.root);
    apply();
  }
  function apply() {
    for (const [k, g] of Object.entries(model.groups)) {
      g.visible = groupsShown.includes(k);
      g.traverse((o) => {
        if (!o.isMesh || !o.material?.emissive) return;
        o.material.emissive.setHex(k === highlight ? pal.accent : 0x000000);
        o.material.emissiveIntensity = k === highlight ? 0.22 : 0;
      });
    }
  }
  dress(); rebuild();
  function frame(keepView) {
    const { size, centre } = boundsOf(model.root);
    if (keepView) {
      /* Same viewing direction, distance scaled to the new aeroplane. */
      const off = camera.position.clone().sub(controls.target);
      controls.target.copy(centre);
      camera.position.copy(centre).add(off.setLength(Math.max(1, span * 1.25)));
    } else {
      controls.target.copy(centre);
      camera.position.set(centre.x + size.x * 0.75, centre.y + span * 0.45, centre.z + span * 0.95);
    }
    controls.update();
  }
  frame(false);

  const loop = renderOnDemand(renderer, scene, camera, controls);
  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); loop.wake();
  }
  resize();
  return {
    show(next, hi) { groupsShown = next; highlight = hi; apply(); loop.wake(); },
    /* A new sizing: rebuild in place, on the same context. */
    setPlan(next) {
      const was = span;
      plan = next; span = Math.max(plan.size.length, plan.size.span); lift = -plan.groundZ;
      dress(); rebuild();
      if (Math.abs(span - was) > 0.05 * was) frame(true); else controls.target.copy(boundsOf(model.root).centre);
      loop.wake();
    },
    setDark(d) { pal = d ? PAL.dark : PAL.light; scene.background = new THREE.Color(pal.sky); dress(); rebuild(); loop.wake(); },
    resize,
    redraw: loop.wake,
    dispose() { loop.stop(); controls.dispose(); disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
}

/* ── Fly: the mission, at true scale ────────────────────────────────── */

/* One ground tile is TILE_M square, ruled every kilometre. */
const TILE_M = 4000, GROUND_M = 400000, PIECE_M = 50000;
function groundTexture(pal) {
  const n = 1024, c = document.createElement("canvas"); c.width = c.height = n;
  const g = c.getContext("2d");
  const col = (h) => `#${new THREE.Color(h).getHexString()}`;
  g.fillStyle = col(pal.ground); g.fillRect(0, 0, n, n);
  g.strokeStyle = col(pal.groundGrid); g.lineWidth = 1.5;
  for (let i = 0; i <= n; i += n / 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, n); g.moveTo(0, i); g.lineTo(n, i); g.stroke(); }
  g.strokeStyle = col(pal.gridMajor); g.lineWidth = 3; g.strokeRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mountFly({ canvas, plan, path, trackM, rollM, dark = true }) {
  let pal = dark ? PAL.dark : PAL.light;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 600000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enabled = false;

  let L = plan.size.length, B = plan.size.span, lift = -plan.groundZ;
  let world = null, ground = null, model = null, mode = "chase", last = { xM: 0, hM: 0, pitch: 0 }, spin = 0;

  function dress() {
    if (world) { scene.remove(world); disposeTree(world); }
    world = new THREE.Group();
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.sky, 20000, GROUND_M * 0.47);
    /* PRECISION. The track runs thousands of kilometres, and a vertex that
       far from its mesh's origin has about half a metre of float32 error:
       more than a runway sits above the ground. So nothing is one long
       mesh. The ground is a patch that follows the aeroplane, snapped to
       whole tiles so the grid stays put; the path is drawn in pieces, each
       placed at its own start. */
    const tex = groundTexture(pal); tex.repeat.set(GROUND_M / TILE_M, GROUND_M / TILE_M);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_M, GROUND_M), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.6, 0); world.add(ground);
    /* Two runways, drawn: departure and arrival. */
    for (const [x0, x1] of [[-300, rollM + 1400], [trackM - rollM - 1400, trackM + 300]]) {
      const rw = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, Math.max(30, B * 1.4)), new THREE.MeshLambertMaterial({ color: pal.runway }));
      rw.rotation.x = -Math.PI / 2; rw.position.set((x0 + x1) / 2, 0, 0); world.add(rw);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 120, 0.9), new THREE.MeshBasicMaterial({ color: pal.mark }));
      cl.rotation.x = -Math.PI / 2; cl.position.set((x0 + x1) / 2, 0.08, 0); world.add(cl);
    }
    /* The path, through the aeroplane's centre. */
    const lineMat = new THREE.LineBasicMaterial({ color: pal.path, transparent: true, opacity: 0.6 });
    for (let i = 1; i < path.length; i++) {
      const [g0, h0] = path[i - 1], [g1, h1] = path[i];
      const n = Math.max(1, Math.ceil((g1 - g0) / PIECE_M));
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        const xa = g0 + a * (g1 - g0), xb = g0 + b * (g1 - g0);
        const piece = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, h0 + a * (h1 - h0) + lift, 0), new THREE.Vector3(xb - xa, h0 + b * (h1 - h0) + lift, 0)]), lineMat);
        piece.position.x = xa; world.add(piece);
      }
    }
    scene.add(world);
    if (model) { scene.remove(model.holder); disposeTree(model.holder); }
    model = buildAircraft(plan, pal);
    model.root.traverse((o) => { if (o.isMesh && o.material?.emissive) o.material.emissiveIntensity = 0; });
    const holder = new THREE.Group(); holder.add(model.root);
    /* Turn about the wing, not the nose: the plan's origin is the nose. */
    model.root.position.set(L * 0.45, 0, 0);
    model.holder = holder;
    scene.add(holder);
  }
  dress();

  function place({ xM, hM, pitch }) {
    const h = model.holder;
    h.position.set(xM, hM + lift, 0);
    /* Whole tiles, offset by half a tile so no heavy line lies across the
       runway threshold at the origin. */
    ground.position.x = Math.round(xM / TILE_M) * TILE_M + TILE_M / 2;
    h.rotation.z = pitch;
    for (const p of model.props) p.rotation.x = spin;
    const at = h.position.clone();
    if (mode === "chase") {
      const back = L * 1.7 + B * 0.55;
      camera.position.set(at.x - back * Math.cos(pitch), at.y + back * 0.32 + back * Math.sin(pitch), at.z + B * 0.18);
      camera.lookAt(at.x + L * 0.6, at.y, at.z);
    } else if (mode === "side") {
      camera.position.set(at.x - L * 0.2, at.y + B * 0.12, at.z + Math.max(B, L) * 1.6);
      camera.lookAt(at);
    } else {
      const off = camera.position.clone().sub(controls.target);
      controls.target.copy(at);
      camera.position.copy(at).add(off.lengthSq() > 1 ? off : new THREE.Vector3(L * 1.2, B * 0.6, B * 1.2));
      controls.update();
    }
    last = { xM, hM, pitch };
  }

  const loop = renderOnDemand(renderer, scene, camera, controls);
  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); loop.wake();
  }
  resize();
  place({ xM: 0, hM: 0, pitch: 0 });
  return {
    /* The tab drives the clock and hands each frame's position here. */
    seek(frame, spinRad = spin) { spin = spinRad; place(frame); loop.wake(); },
    setCamera(m) {
      mode = CAMERAS.includes(m) ? m : "chase";
      controls.enabled = mode === "orbit";
      if (mode === "orbit") camera.position.copy(model.holder.position).add(new THREE.Vector3(L * 1.2, B * 0.6, B * 1.2));
      place(last); loop.wake();
    },
    /* A new sizing: a new aeroplane and a new track, on the same context.
       The tab seeks afterwards. */
    setMission(next) {
      ({ plan, path, trackM } = next);
      L = plan.size.length; B = plan.size.span; lift = -plan.groundZ;
      dress(); loop.wake();
    },
    setDark(d) { pal = d ? PAL.dark : PAL.light; dress(); place(last); loop.wake(); },
    resize,
    redraw: loop.wake,
    dispose() { loop.stop(); controls.dispose(); disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
}
