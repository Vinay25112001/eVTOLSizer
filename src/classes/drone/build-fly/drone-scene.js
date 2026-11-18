/* =====================================================================
   BUILD & FLY — the three.js scenes (lazy-loaded; never server-rendered)
   =====================================================================
   Two stages share one drone model:
     mountHangar  the Build tab's turntable: parts arrive step by step.
     mountArena   the Fly tab's test field: the drone flies the state
                  live-flight.js integrates, in the Flight sim's scene.

   THE SCENE OWNS NO PHYSICS. It is handed a pose (position, quaternion)
   and per-rotor thrust fractions and draws them. Where the drawing
   chooses something the engine does not compute it is a DRAWING choice,
   listed here and on the tab:
     - rotor arm length, propeller radius, rotor positions and spin
       directions are the airframe builder's (geometry3d.js); coaxial
       rotors sit at its declared stack spacing;
     - the body, battery, ESC, flight-controller and payload blocks are
       drawn to a nominal size, not to the parts' dimensions;
     - the propeller spin rate on screen is a drawn rate that rises with
       thrust; it is not the rotor rpm (a real rpm would alias at 60 Hz).

   Frames. The engine is NED with a forward-right-down body. three.js is
   y-up. A vector maps (north, east, down) -> (east, up, -north), a proper
   rotation, so an NED quaternion [w,x,y,z] becomes three's (y, -z, -x, w)
   and the body's forward axis is three's -z: a camera given the drone's
   quaternion looks out of its nose.
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const PALETTES = Object.freeze({
  light: { sky: "#dde7f0", ground: "#d6dccd", grid: "#a9b39c", gridMajor: "#7f8a72", fog: "#dde7f0", label: "#22303c", obstacle: "#b9b1a2", roof: "#9f9584", trunk: "#7b5b3a", canopy: "#6f8f5a", pad: "#f4f1e8", padInk: "#df5f28", trail: "#df5f28", shadow: 0.28, turntable: "#c9cfd6" },
  dark:  { sky: "#0d1826", ground: "#132131", grid: "#22384f", gridMajor: "#33506d", fog: "#0d1826", label: "#cfe0f2", obstacle: "#2c3d50", roof: "#3a4f66", trunk: "#5a4632", canopy: "#2f5a43", pad: "#1d2f44", padInk: "#ff8a4c", trail: "#ff8a4c", shadow: 0.45, turntable: "#1b2a3b" },
});
/* Part colours match the Sizing tab's mass-breakdown bars. */
const PART = Object.freeze({
  frame: "#2b2f36", motor: "#a9b2bc", cw: "#ff8a3c", ccw: "#2fbfb6", failed: "#e0574a",
  esc: "#4a6fe3", pack: "#e0574a", avionics: "#54c7a8", payload: "#4ea1ff", nose: "#ff8a3c",
});

const fromBody = (x, y, z) => new THREE.Vector3(y, -z, -x);
export const nedQuatToThree = (q) => new THREE.Quaternion(q[2], -q[3], -q[1], q[0]);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
}

/* ── THE DRONE ──────────────────────────────────────────────────────── */
export function buildDroneMesh(airframe, { payload = true } = {}) {
  const g = new THREE.Group();
  const R = airframe.propRadiusM, arm = airframe.armLengthM, bodyR = airframe.bodyRadiusM;
  const s = Math.max(0.06, bodyR);                               // drawing scale for the nominal blocks
  const parts = { frame: [], motor: [], prop: [], esc: [], pack: [], avionics: [], payload: [] };
  const add = (key, mesh) => { parts[key].push(mesh); g.add(mesh); return mesh; };

  /* Body: a flat puck with a nose marker so the heading reads. */
  const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR * 0.92, s * 0.32, 40), std(PART.frame));
  add("frame", body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(s * 0.16, s * 0.42, 16), std(PART.nose));
  nose.rotation.x = -Math.PI / 2;                                // point along -z (forward)
  nose.position.copy(fromBody(bodyR + s * 0.12, 0, 0));
  add("frame", nose);
  /* Skids. */
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(s * 0.06, s * 0.06, bodyR * 2.4), std(PART.frame));
    skid.position.copy(fromBody(0, side * bodyR * 0.7, s * 0.75));
    add("frame", skid);
    for (const fore of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(s * 0.05, s * 0.6, s * 0.05), std(PART.frame));
      leg.position.copy(fromBody(fore * bodyR * 0.6, side * bodyR * 0.7, s * 0.45));
      add("frame", leg);
    }
  }

  /* Arms, motors, ESCs and propellers, at the builder's rotor positions. */
  const armW = Math.max(0.012, 0.05 * arm);
  const seenArms = new Set();
  const rotors = [];
  for (const r of airframe.rotors) {
    const key = `${r.x.toFixed(4)},${r.y.toFixed(4)}`;
    if (!seenArms.has(key)) {
      seenArms.add(key);
      const a = new THREE.Mesh(new THREE.BoxGeometry(armW, armW * 0.8, arm), std(PART.frame));
      a.position.copy(fromBody(r.x / 2, r.y / 2, 0));
      a.lookAt(a.position.clone().add(fromBody(r.x, r.y, 0)));
      add("frame", a);
      const esc = new THREE.Mesh(new THREE.BoxGeometry(armW * 1.5, armW * 0.6, armW * 2.4), std(PART.esc));
      esc.position.copy(fromBody(r.x * 0.55, r.y * 0.55, -armW * 0.7));
      esc.lookAt(esc.position.clone().add(fromBody(r.x, r.y, 0)));
      add("esc", esc);
    }
    const mR = Math.max(0.012, 0.14 * R);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(mR, mR, mR * 1.3, 24), std(PART.motor, { metalness: 0.6, roughness: 0.35 }));
    can.position.copy(fromBody(r.x, r.y, r.z - mR * 0.65 * (r.z > 0 ? -1 : 1)));
    add("motor", can);

    const hub = new THREE.Group();
    hub.position.copy(fromBody(r.x, r.y, r.z + (r.z > 0 ? mR * 1.4 : -mR * 1.4)));
    const rim = r.rotation === "CCW" ? PART.ccw : PART.cw;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48),
      new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    hub.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.96, R, 64),
      new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    hub.add(ring);
    /* A two-blade propeller: one bar across the diameter. */
    const blades = new THREE.Group();
    blades.add(new THREE.Mesh(new THREE.BoxGeometry(R * 2 * 0.98, Math.max(0.002, R * 0.02), R * 0.11), std("#1d2026")));
    hub.add(blades);
    add("prop", hub);
    /* Spin sign as seen from above: CCW turns +y in three. */
    rotors.push({ motor: r.motor, hub, blades, disc, ring, spin: r.rotation === "CCW" ? 1 : -1, angle: 0, rim });
  }

  /* Battery under the body, flight controller on top, payload below. */
  const pack = new THREE.Mesh(new THREE.BoxGeometry(bodyR * 1.0, s * 0.42, bodyR * 1.5), std(PART.pack));
  pack.position.copy(fromBody(0, 0, s * 0.38));
  add("pack", pack);
  const fc = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.12, s * 0.5), std(PART.avionics));
  fc.position.copy(fromBody(0, 0, -s * 0.24));
  add("avionics", fc);
  const gps = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.14, s * 0.14, s * 0.06, 20), std(PART.avionics));
  gps.position.copy(fromBody(-bodyR * 0.45, 0, -s * 0.5));
  add("avionics", gps);
  if (payload) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(bodyR * 0.8, s * 0.38, bodyR * 0.8), std(PART.payload));
    p.position.copy(fromBody(0, 0, s * 0.8));
    add("payload", p);
  }
  return { group: g, parts, rotors, spanM: airframe.spanM, scale: s };
}

/* Spin the drawn propellers. `frac` per rotor in [0, 1] of max thrust. */
function spinRotors(rotors, fracs, failed, dt) {
  rotors.forEach((r, i) => {
    const dead = failed?.has?.(r.motor);
    const f = dead ? 0 : Math.max(0, Math.min(1, fracs?.[i] ?? 0.5));
    r.angle += r.spin * (dead ? 0 : 18 + 42 * Math.sqrt(f)) * dt;     // drawn rate, not rpm
    r.blades.rotation.y = r.angle;
    r.disc.material.opacity = dead ? 0.05 : 0.08 + 0.22 * f;
    const c = dead ? PART.failed : r.rim;
    r.ring.material.color.set(c); r.disc.material.color.set(c);
  });
}

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
  });
}

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return renderer;
}

function sizeTo(renderer, camera, canvas) {
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ── THE HANGAR (Build tab) ─────────────────────────────────────────── */
/* Parts revealed by each build step, in order. */
export const STEP_PARTS = Object.freeze([
  ["frame"], ["motor"], ["prop"], ["esc"], ["pack"], ["pack"], ["avionics"], ["payload"], [],
]);

export function mountHangar({ canvas, airframe, dark = true, step = 0, payload = true }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  let pal = PALETTES[dark ? "dark" : "light"];
  scene.background = new THREE.Color(pal.sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 4, 3); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 1.2;

  const table = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 64), std(pal.turntable));
  scene.add(table);
  let drone = null, current = step, revealedAt = new Map(), payloadOn = payload;

  function setAirframe(af) {
    if (drone) { scene.remove(drone.group); disposeTree(drone.group); }
    drone = buildDroneMesh(af, { payload: payloadOn });
    scene.add(drone.group);
    const span = af.spanM;
    drone.group.position.y = drone.scale * 1.1;
    table.scale.set(span * 0.62, 1, span * 0.62);
    camera.position.set(span * 0.72, span * 0.48, span * 0.8);
    controls.target.set(0, drone.scale * 0.6, 0);
    controls.minDistance = span * 0.4; controls.maxDistance = span * 4;
    revealedAt = new Map();
    applyStep(current, true);
  }
  function applyStep(i, instant = false) {
    current = i;
    const shown = new Set(STEP_PARTS.slice(0, i + 1).flat());
    if (i >= STEP_PARTS.length - 1) Object.keys(drone.parts).forEach((k) => shown.add(k));
    for (const [k, list] of Object.entries(drone.parts)) {
      const on = shown.has(k);
      for (const m of list) {
        if (on && !revealedAt.has(m)) revealedAt.set(m, instant ? -1 : 0);
        if (!on) revealedAt.delete(m);
        m.visible = on;
        if (!m.userData.home) m.userData.home = m.position.clone();
      }
    }
  }
  setAirframe(airframe);
  sizeTo(renderer, camera, canvas);

  const focusKeys = () => new Set(STEP_PARTS[current] ?? []);
  let raf = 0, last = 0, alive = true, t = 0;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotate = !reduced;
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    /* Parts arrive from above and settle (drawn). */
    for (const [m, age] of revealedAt) {
      if (age < 0) { m.position.copy(m.userData.home); continue; }
      const a = Math.min(1, age + dt * 2.2);
      revealedAt.set(m, a >= 1 ? -1 : a);
      const ease = 1 - Math.pow(1 - a, 3);
      m.position.copy(m.userData.home).add(new THREE.Vector3(0, (1 - ease) * drone.spanM * 0.5, 0));
    }
    const focus = focusKeys();
    const pulse = 0.25 + 0.25 * Math.sin(t * 5);
    for (const [k, list] of Object.entries(drone.parts))
      for (const m of list) m.traverse((o) => { if (o.material?.emissive) o.material.emissive.setRGB(focus.has(k) ? pulse : 0, focus.has(k) ? pulse * 0.6 : 0, 0); });
    spinRotors(drone.rotors, drone.rotors.map(() => (current >= 2 ? 0.25 : 0)), null, reduced ? 0 : dt);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame((n) => { last = n; frame(n); });

  return {
    setStep: (i) => applyStep(i),
    setAirframe: (af, opts = {}) => { if (opts.payload != null) payloadOn = opts.payload; setAirframe(af); },
    setDark(d) { pal = PALETTES[d ? "dark" : "light"]; scene.background = new THREE.Color(pal.sky); table.material.color.set(pal.turntable); },
    resize: () => sizeTo(renderer, camera, canvas),
    dispose() {
      alive = false; cancelAnimationFrame(raf); controls.dispose();
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}

/* ── THE ARENA (Fly tab) ────────────────────────────────────────────── */
function textSprite(text, color) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d");
  x.font = "600 30px ui-monospace, Menlo, Consolas, monospace"; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(6, 1.5, 1);
  return sp;
}

function padTexture(pal) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = pal.pad; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
  x.strokeStyle = pal.padInk; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
  x.fillStyle = pal.padInk; x.font = "700 120px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("H", 128, 136);
  return new THREE.CanvasTexture(c);
}

function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export const CAMERAS = Object.freeze(["chase", "fpv", "orbit", "top"]);
const TRAIL_MAX = 1500;

export function mountArena({ canvas, airframe, obstacles = [], dark = true, payload = true }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  let pal = PALETTES[dark ? "dark" : "light"];
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.fog, 60, 260);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7a6a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-40, 80, 30); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 1200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enabled = false;

  /* Ground, grid and pad. */
  const world = new THREE.Group(); scene.add(world);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), std(pal.ground, { roughness: 0.95, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; world.add(ground);
  const gridMinor = new THREE.GridHelper(400, 200, pal.grid, pal.grid); gridMinor.position.y = 0.005;
  gridMinor.material.transparent = true; gridMinor.material.opacity = 0.35; world.add(gridMinor);
  const gridMajor = new THREE.GridHelper(400, 20, pal.gridMajor, pal.gridMajor); gridMajor.position.y = 0.008; world.add(gridMajor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ map: padTexture(pal), transparent: true }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.012; world.add(pad);
  /* North arrow at the pad edge. */
  const north = textSprite("N ↑", pal.label); north.position.set(0, 0.6, -3.4); north.scale.set(2.4, 0.6, 1); world.add(north);

  /* The Flight sim's scene, at the same coordinates (x north, y east). */
  const obstacleGroup = new THREE.Group(); scene.add(obstacleGroup);
  function setObstacles(list) {
    obstacleGroup.children.slice().forEach((o) => { obstacleGroup.remove(o); disposeTree(o); });
    for (const o of list) {
      if (o.kind === "box") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.wy, o.h, o.wx), std(pal.obstacle, { roughness: 0.85 }));
        m.position.set(o.y, o.h / 2, -o.x); obstacleGroup.add(m);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(o.wy * 1.01, 0.08, o.wx * 1.01), std(pal.roof));
        roof.position.set(o.y, o.h + 0.04, -o.x); obstacleGroup.add(roof);
      } else if (o.kind === "tree") {
        const trunkH = Math.max(0.1, o.h - o.canopyR);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(o.trunkR, o.trunkR * 1.1, trunkH, 12), std(pal.trunk));
        t.position.set(o.y, trunkH / 2, -o.x); obstacleGroup.add(t);
        const c = new THREE.Mesh(new THREE.SphereGeometry(o.canopyR, 20, 14), std(pal.canopy, { roughness: 0.9 }));
        c.position.set(o.y, o.h - o.canopyR, -o.x); obstacleGroup.add(c);
      }
      const label = textSprite(o.name, pal.label);
      label.position.set(o.y, o.h + 1.4, -o.x); obstacleGroup.add(label);
    }
  }
  setObstacles(obstacles);

  /* Drone, shadow, drop line, trail. */
  let payloadOn = payload;
  let drone = buildDroneMesh(airframe, { payload: payloadOn });
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
      camera.position.copy(p).addScaledVector(camFwd, -(1.4 + span * 2.2)).add(new THREE.Vector3(0, 0.45 + span * 0.8, 0));
      camera.position.y = Math.max(0.3, camera.position.y);
      camera.lookAt(p.clone().addScaledVector(camFwd, span * 1.2).add(new THREE.Vector3(0, span * 0.1, 0)));
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
      scene.remove(drone.group); disposeTree(drone.group);
      drone = buildDroneMesh(af, { payload: payloadOn }); drone.group.visible = mode !== "fpv"; scene.add(drone.group);
    },
    setDark(d) {
      pal = PALETTES[d ? "dark" : "light"];
      scene.background = new THREE.Color(pal.sky); scene.fog.color.set(pal.fog);
      ground.material.color.set(pal.ground);
    },
    resize: () => sizeTo(renderer, camera, canvas),
    dispose() {
      controls.dispose(); disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
