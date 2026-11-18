/* =====================================================================
   DRONE PARTS — the drone as modelled parts (three.js, lazy-loaded)
   =====================================================================
   One function, buildDrone(airframe, kit), returns the drone the Build
   bench assembles and the Fly arena flies. It is a DRAWING of the design,
   at true scale where the design or the catalogue publishes a size:

   PUBLISHED, drawn to that size
     arm length and rotor positions   the airframe builder (geometry3d.js)
     propeller diameter and pitch     the UIUC propeller picked; the blade
                                      twist is the helix of that nominal
                                      pitch, atan(P / 2 pi r)
     motor stator diameter and        the motor's catalogue entry
     height, shaft diameter, mount
     hole circle
     ESC length x width x height      the ESC's catalogue entry, where given
     cell diameter and length, and    the cell's catalogue entry, and the
     the count S x P                  pack the sizing assembled
   DRAWN, not published
     the motor bell, base and windows; the blade planform and section;
     the centre plates, standoffs, tube diameter and landing gear; the
     flight controller (avionics are one declared mass, not a part); the
     GPS mast, receiver, wiring, straps and payload box; how the cells are
     packed (geometry3d.js cellLayout, itself declared); all colours.

   The model owns no physics. Axes are three.js: x right, y up, forward
   is -z. The origin is the centre of the arm plane; the skids reach down
   to y = -gearDepthM.
   ===================================================================== */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { parseDimsMm, cellLayout } from "../geometry3d.js";

const MM = 1e-3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/* Body frame (x forward, y right, z down) to three (x right, y up, -z forward). */
export const fromBody = (x, y, z) => V(y, -z, -x);

/* "66.0 x 21.8 x 11.0" -> { l, w, h }; versions -> the first; two numbers
   -> h null. Null when nothing usable is published. */
export function dimsMm(s) {
  if (s && typeof s === "object") s = Object.values(s).find((x) => typeof x === "string");
  if (typeof s !== "string") return null;
  const n = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0);
  if (n.length < 2) return null;
  return { l: n[0], w: n[1], h: n.length >= 3 ? n[2] : null };
}
/* "M4/3 x Phi25 mm; M3/2.5 x Phi32 mm" -> the largest hole circle, mm. */
export function holeCircleMm(s) {
  const n = [...String(s ?? "").matchAll(/Phi\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
}

/* ── Surfaces ─────────────────────────────────────────────────────────── */
function canvasTexture(w, h, draw) {
  if (typeof document === "undefined") return null;          // a gate in Node draws no textures
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function drawWeave(x, w) {
  const n = 8, s = w / n;
  x.fillStyle = "#121418"; x.fillRect(0, 0, w, w);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const along = (i + j) % 2 === 0;
    const g = along ? x.createLinearGradient(0, j * s, 0, (j + 1) * s) : x.createLinearGradient(i * s, 0, (i + 1) * s, 0);
    g.addColorStop(0, "#16191d"); g.addColorStop(0.5, "#3b4048"); g.addColorStop(1, "#16191d");
    x.fillStyle = g; x.fillRect(i * s + 0.6, j * s + 0.6, s - 1.2, s - 1.2);
  }
}
function drawPcb(x, w, h) {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = "#123b2a"; x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(120,200,150,0.35)"; x.lineWidth = 2;
  for (let i = 0; i < 40; i++) { x.beginPath(); let px = rnd() * w, py = rnd() * h; x.moveTo(px, py); for (let k = 0; k < 3; k++) { if (rnd() < 0.5) px += (rnd() - 0.5) * 120; else py += (rnd() - 0.5) * 120; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 26; i++) { x.fillStyle = "#d9b45a"; x.fillRect(rnd() * w, rnd() * h, 6, 6); }
  for (let i = 0; i < 9; i++) { x.fillStyle = "#15161a"; const cw = 18 + rnd() * 34; x.fillRect(rnd() * (w - cw), rnd() * (h - cw), cw, cw * (0.6 + rnd() * 0.5)); }
}
function labelTexture(lines, { bg = "#f4f1e8", ink = "#1b2430", accent = "#d4572a" } = {}) {
  return canvasTexture(512, 256, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = accent; x.fillRect(0, 0, w, 34);
    x.fillStyle = ink; x.textBaseline = "top";
    lines.forEach((l, i) => { x.font = i === 0 ? "700 54px system-ui, sans-serif" : "500 34px system-ui, sans-serif"; x.fillText(l, 22, 52 + (i === 0 ? 0 : 20 + i * 44)); });
  });
}

export const SPIN_COLOURS = Object.freeze({ CW: 0xff8a3c, CCW: 0x2fbfb6 });

export function makeMaterials() {
  const weave = canvasTexture(128, 128, drawWeave);
  const pcbMap = canvasTexture(256, 256, drawPcb);
  const std = (color, roughness = 0.5, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const carbonCache = new Map();
  /* One weave tile is 16 mm across, whatever the surface; rx, ry are its repeats. */
  const carbon = (rx = 1, ry = 1) => {
    const key = `${rx.toFixed(1)}|${ry.toFixed(1)}`;
    if (carbonCache.has(key)) return carbonCache.get(key);
    const m = new THREE.MeshPhysicalMaterial({ color: weave ? 0xffffff : 0x24272c, roughness: 0.4, metalness: 0.2, clearcoat: 0.85, clearcoatRoughness: 0.18 });
    if (weave) { m.map = weave.clone(); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; }
    carbonCache.set(key, m);
    return m;
  };
  return {
    carbon,
    alu: std(0xb9c0c8, 0.3, 1), gunmetal: std(0x353a42, 0.32, 0.9, { side: THREE.DoubleSide }),
    copper: std(0xc4703a, 0.36, 1), steel: std(0xd5d9de, 0.2, 1), laminate: std(0x6c727a, 0.45, 0.8),
    black: std(0x1c1e22, 0.55), rubber: std(0x131416, 0.9), white: std(0xe9ecef, 0.45),
    cw: std(SPIN_COLOURS.CW, 0.35, 0.55), ccw: std(SPIN_COLOURS.CCW, 0.35, 0.55),
    red: std(0xc8322b, 0.5), blue: std(0x2a63c4, 0.5), yellow: std(0xf2c230, 0.5), green: std(0x2e9b52, 0.5),
    shrink: std(0x1f4f93, 0.42, 0.05), pcb: pcbMap ? std(0xffffff, 0.5, 0.05, { map: pcbMap }) : std(0x1f5f3a, 0.5),
    cellWrap: std(0x2d6db7, 0.28, 0.15), nickel: std(0xc3c7bf, 0.35, 1),
    clearShrink: new THREE.MeshPhysicalMaterial({ color: 0xa9c8e6, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false, clearcoat: 1 }),
    damper: std(0xff7a2f, 0.7), cardboard: std(0xc6a36d, 0.92), tape: std(0xd8c58f, 0.45),
    propLight: std(0xd2cab8, 0.42, 0, { side: THREE.DoubleSide }), propDark: std(0x202329, 0.38, 0, { side: THREE.DoubleSide }),
    strap: std(0xb83227, 0.75), foam: std(0x111214, 1),
  };
}

function mesh(geo, mat, name) { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; return m; }
function tube(points, radius, mat, name) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 8, false), mat, name);
}

/* ── A motor: base, copper stator in a windowed bell, shaft ───────────
   Local origin at the centre of the base's underside; y up. */
export function motorModel(motor, M, spin = "CW") {
  const pub = motor?.stator_diameter_mm > 0 && motor?.stator_height_mm > 0;
  const sD = (pub ? motor.stator_diameter_mm : 28) * MM, sH = (pub ? motor.stator_height_mm : 10) * MM;
  const shaftD = (motor?.shaft_diameter_mm > 0 ? motor.shaft_diameter_mm : 4) * MM;
  const rs = sD / 2, rb = rs * 1.12 + 2 * MM, hb = Math.max(3 * MM, 0.2 * rs), gap = 0.8 * MM;
  const bellH = sH + 2 * gap + 0.22 * rs, capT = Math.max(1.4 * MM, 0.07 * rs);
  const g = new THREE.Group(); g.name = "motor";
  const base = mesh(new THREE.CylinderGeometry(rb * 0.96, rb, hb, 48), M.gunmetal, "motor-base"); base.position.y = hb / 2; g.add(base);
  const stator = mesh(new THREE.CylinderGeometry(rs, rs, sH, 40), M.copper, "stator"); stator.position.y = hb + gap + sH / 2; g.add(stator);
  const core = mesh(new THREE.CylinderGeometry(rs * 0.4, rs * 0.4, sH + 2 * MM, 24), M.laminate); core.position.y = stator.position.y; g.add(core);
  const wall = mesh(new THREE.CylinderGeometry(rb, rb, bellH, 64, 1, true), M.gunmetal, "bell"); wall.position.y = hb + 0.6 * MM + bellH / 2; g.add(wall);
  const band = mesh(new THREE.CylinderGeometry(rb * 1.004, rb * 1.004, Math.min(2.4 * MM, bellH * 0.2), 64, 1, true), spin === "CCW" ? M.ccw : M.cw);
  band.position.y = hb + 0.6 * MM + bellH * 0.12; g.add(band);
  /* The bell's top: a disc with six windows onto the windings. */
  const cap = new THREE.Shape(); cap.absarc(0, 0, rb, 0, Math.PI * 2, false);
  for (let k = 0; k < 6; k++) {
    const a0 = (k * Math.PI) / 3 + 0.16, a1 = ((k + 1) * Math.PI) / 3 - 0.16;
    const h = new THREE.Path(); h.absarc(0, 0, rb * 0.8, a0, a1, false); h.absarc(0, 0, rb * 0.34, a1, a0, true); h.closePath(); cap.holes.push(h);
  }
  const capGeo = new THREE.ExtrudeGeometry(cap, { depth: capT, bevelEnabled: true, bevelThickness: 0.4 * MM, bevelSize: 0.4 * MM, bevelSegments: 2, curveSegments: 32 });
  capGeo.rotateX(-Math.PI / 2);
  const capM = mesh(capGeo, M.gunmetal, "bell-cap"); capM.position.y = hb + 0.6 * MM + bellH; g.add(capM);
  const seatY = capM.position.y + capT + 0.4 * MM;
  const adapterR = Math.max(3.5 * MM, shaftD * 1.3), adapterH = 3.5 * MM;
  const adapter = mesh(new THREE.CylinderGeometry(adapterR, adapterR * 1.1, adapterH, 24), M.alu); adapter.position.y = seatY + adapterH / 2; g.add(adapter);
  const shaft = mesh(new THREE.CylinderGeometry(shaftD / 2, shaftD / 2, adapterH + 0.35 * rs, 16), M.steel, "shaft"); shaft.position.y = seatY + (adapterH + 0.35 * rs) / 2; g.add(shaft);
  return { group: g, radiusM: rb, propSeatY: seatY + adapterH, published: pub, statorDiameterM: sD, statorHeightM: sH, shaftDiameterM: shaftD };
}

/* ── A propeller: two twisted blades on a hub ─────────────────────────
   The blade twist is the helix angle of the nominal pitch; the planform
   and the section are drawn. spin +1 = CCW seen from above. */
function bladeGeometry(R, P, r0, spin) {
  const NS = 32, NC = 18, pos = [];
  for (let i = 0; i <= NS; i++) {
    const r = r0 + (R - r0) * (i / NS), x = r / R;
    let c = R * (0.05 + 0.03 * (1 - x) + 0.31 * x * Math.pow(1 - x, 1.6));
    if (x > 0.9) c *= Math.sqrt(Math.max(0.03, 1 - ((x - 0.9) / 0.1) ** 2));
    const beta = Math.atan2(P, 2 * Math.PI * r), cb = Math.cos(beta), sb = Math.sin(beta);
    const th = c * (0.14 - 0.09 * x);
    for (let k = 0; k < NC; k++) {
      const s = (k / NC) * 2 * Math.PI, xc = 0.5 * (1 - Math.cos(s));
      const half = th * Math.sqrt(Math.max(0, xc * (1 - xc))) * (1.15 - 0.6 * xc);
      const v = c * 0.14 * xc * (1 - xc) + (s < Math.PI ? half : -half);
      const u = (xc - 0.3) * c;
      pos.push(r, -u * sb + v * cb, spin * (u * cb + v * sb));
    }
  }
  const idx = [];
  for (let i = 0; i < NS; i++) for (let k = 0; k < NC; k++) {
    const a = i * NC + k, b = i * NC + ((k + 1) % NC), c = a + NC, d = b + NC;
    idx.push(a, c, b, b, c, d);
  }
  const tip = NS * NC; let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < NC; k++) { cx += pos[(tip + k) * 3]; cy += pos[(tip + k) * 3 + 1]; cz += pos[(tip + k) * 3 + 2]; }
  pos.push(cx / NC, cy / NC, cz / NC);
  const centre = tip + NC;
  for (let k = 0; k < NC; k++) idx.push(tip + k, centre, tip + ((k + 1) % NC));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

export function propModel({ diameterM, pitchM, family = "" }, M, rotation = "CW", colourAs = rotation) {
  const R = diameterM / 2, spin = rotation === "CCW" ? 1 : -1;
  const hubR = Math.max(5 * MM, 0.07 * R), hubH = Math.max(6 * MM, 0.07 * R);
  const mat = /cf|carbon/i.test(family) ? M.carbon(2, 2) : /^(apc|ma)/i.test(family) ? M.propLight : M.propDark;
  const g = new THREE.Group(); g.name = "propeller";
  const blades = new THREE.Group(); g.add(blades);
  blades.add(mesh(new THREE.CylinderGeometry(hubR, hubR, hubH, 32), mat, "prop-hub")).position.y = hubH / 2;
  const geo = bladeGeometry(R, pitchM, hubR * 0.8, spin);
  for (let b = 0; b < 2; b++) { const bl = mesh(geo, mat, "blade"); bl.rotation.y = b * Math.PI; bl.position.y = hubH / 2; blades.add(bl); }
  const nut = mesh(new THREE.CylinderGeometry(hubR * 0.72, hubR * 0.8, hubH * 0.7, 6), colourAs === "CCW" ? M.ccw : M.cw, "prop-nut");
  nut.position.y = hubH + hubH * 0.35; blades.add(nut);
  /* What a spinning propeller looks like to the eye: a faint disc, and a
     rim in the spin colour. Both start invisible; the scene sets them. */
  const disc = mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshBasicMaterial({ color: 0x9aa4ae, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = hubH / 2; disc.renderOrder = 2; g.add(disc);
  const ring = mesh(new THREE.RingGeometry(R * 0.985, R, 96), new THREE.MeshBasicMaterial({ color: SPIN_COLOURS[colourAs === "CCW" ? "CCW" : "CW"], transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = hubH / 2; ring.renderOrder = 2; g.add(ring);
  return { group: g, blades, disc, ring, spin, tipRadiusM: R, hubH };
}

/* ── THE DRONE ─────────────────────────────────────────────────────── */
export const PART_KEYS = Object.freeze(["frame", "motor", "prop", "esc", "cell", "pack", "avionics", "payload"]);

export function buildDrone(airframe, kit = {}) {
  const M = makeMaterials();
  const g = new THREE.Group(); g.name = "drone";
  const items = [], parts = Object.fromEntries(PART_KEYS.map((k) => [k, []])), groups = new Map();
  const item = (obj, part, groupKey, label, extra = {}) => {
    Object.assign(obj.userData, { item: true, part, groupKey, ...extra });
    obj.traverse((o) => { if (o.isMesh) { o.userData.itemRoot = obj; o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
    g.add(obj); items.push(obj); parts[part].push(obj);
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, part, label, items: [] });
    groups.get(groupKey).items.push(obj);
    return obj;
  };

  const R = airframe.propRadiusM, L = airframe.armLengthM, bodyR = airframe.bodyRadiusM;
  const propeller = kit.propeller ?? { diameterM: 2 * R, pitchM: R, family: "", label: "propeller" };
  const tubeR = clamp(0.055 * R, 5 * MM, 20 * MM);
  const plateGap = 2 * tubeR + 2 * MM, botT = 2.5 * MM, topT = 2 * MM;
  const yTopPlate = tubeR + 1 * MM, yBotPlate = -tubeR - 1 * MM - botT;
  const yTopSurface = yTopPlate + topT;
  const armAngles = [...new Map(airframe.rotors.map((r) => [`${r.x.toFixed(4)},${r.y.toFixed(4)}`, Math.atan2(r.y, r.x)])).values()];
  const notes = [];

  /* Centre plates: a lobed outline reaching out along each arm, with
     lightening holes between the arms. Drawn. */
  const alphas = armAngles.map((phi) => Math.PI / 2 - phi);
  const plateShape = () => {
    const s = new THREE.Shape(), N = 120;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let r = bodyR * 0.8;
      for (const al of alphas) { const d = Math.atan2(Math.sin(a - al), Math.cos(a - al)); r = Math.max(r, bodyR * (0.8 + 0.22 * Math.exp(-((d / 0.32) ** 2)))); }
      if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a)); else s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    const mids = alphas.map((al, i) => { const b = alphas[(i + 1) % alphas.length]; let d = b - al; while (d <= 0) d += Math.PI * 2; return al + d / 2; });
    for (const m of mids) { const h = new THREE.Path(); h.absarc(0.55 * bodyR * Math.cos(m), 0.55 * bodyR * Math.sin(m), 0.11 * bodyR, 0, Math.PI * 2, true); s.holes.push(h); }
    const c = new THREE.Path(); c.absarc(0, 0, 0.16 * bodyR, 0, Math.PI * 2, true); s.holes.push(c);
    return { shape: s, mids };
  };
  const { shape, mids } = plateShape();
  const plate = (t, name) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.35 * MM, bevelSize: 0.35 * MM, bevelSegments: 2, curveSegments: 24 });
    geo.rotateX(-Math.PI / 2);
    return mesh(geo, M.carbon(62.5, 62.5), name);
  };
  const bottom = plate(botT, "bottom-plate"); bottom.position.y = yBotPlate;
  item(bottom, "frame", "plates", "centre plates, carbon");
  const top = plate(topT, "top-plate"); top.position.y = yTopPlate;
  item(top, "frame", "plates", "centre plates, carbon");
  const stand = new THREE.Group(); stand.name = "standoffs";
  for (const m of mids) {
    const s = mesh(new THREE.CylinderGeometry(3.2 * MM, 3.2 * MM, plateGap, 6), M.alu);
    s.position.set(0.76 * bodyR * Math.cos(m), 0, -0.76 * bodyR * Math.sin(m)); stand.add(s);
    const head = mesh(new THREE.CylinderGeometry(2.6 * MM, 2.6 * MM, 1.6 * MM, 16), M.steel);
    head.position.set(s.position.x, yTopSurface + 0.8 * MM, s.position.z); stand.add(head);
  }
  item(stand, "frame", "standoffs", `${mids.length}× standoffs and screws`);

  /* Arms: carbon tubes out to a mount plate under each motor. */
  const hole = holeCircleMm(kit.motor?.mounting_hole_pattern);
  const motorProbe = motorModel(kit.motor, M);
  const rootX = 0.42 * bodyR;
  for (const phi of armAngles) {
    const arm = new THREE.Group(); arm.name = "arm";
    const len = L - rootX + 0.5 * motorProbe.radiusM;
    const t = mesh(new THREE.CylinderGeometry(tubeR, tubeR, len, 28), M.carbon((2 * Math.PI * tubeR) / 0.016, len / 0.016), "arm-tube");
    t.rotation.z = Math.PI / 2; t.position.x = rootX + len / 2; arm.add(t);
    const mountR = Math.max(motorProbe.radiusM * 1.08, hole ? (hole / 2 + 4) * MM : 0);
    const mount = mesh(new THREE.CylinderGeometry(mountR, mountR, 3 * MM, 40), M.carbon(8, 8), "motor-mount"); mount.position.set(L, tubeR + 1.5 * MM, 0); arm.add(mount);
    const clampB = mesh(new RoundedBoxGeometry(mountR * 1.3, tubeR * 2.5, tubeR * 2.6, 2, 1.5 * MM), M.gunmetal); clampB.position.set(L, -0.1 * tubeR, 0); arm.add(clampB);
    const rootB = mesh(new RoundedBoxGeometry(tubeR * 3, tubeR * 2.3, tubeR * 2.6, 2, 1.2 * MM), M.gunmetal); rootB.position.set(rootX + tubeR * 1.5, 0, 0); arm.add(rootB);
    arm.rotation.y = Math.PI / 2 - phi;
    item(arm, "frame", "arms", `${armAngles.length}× arm, ${(2 * tubeR / MM).toFixed(0)} mm carbon tube`);
  }
  disposeGroup(motorProbe.group);

  /* Landing gear and payload: drawn. */
  const pay = kit.payloadKg > 0;
  const edge = clamp(bodyR * 0.95, 0.05, 0.24), boxH = edge * 0.55;
  const gearH = (pay ? boxH : 0) + 0.03 + 0.15 * bodyR;
  const gear = new THREE.Group(); gear.name = "landing-gear";
  const legR = Math.max(3.5 * MM, 0.55 * tubeR), skidY = yBotPlate - gearH, skidX = 0.85 * bodyR, skidLen = 2.0 * bodyR;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) gear.add(tube([V(sx * 0.45 * bodyR, yBotPlate, sz * 0.4 * bodyR), V(sx * 0.62 * bodyR, yBotPlate - gearH * 0.55, sz * 0.48 * bodyR), V(sx * skidX, skidY + legR, sz * 0.52 * bodyR)], legR, M.carbon(4, 20)));
    const skid = mesh(new THREE.CylinderGeometry(legR * 1.1, legR * 1.1, skidLen, 20), M.carbon(3, 30), "skid"); skid.rotation.x = Math.PI / 2; skid.position.set(sx * skidX, skidY + legR, 0); gear.add(skid);
    for (const sz of [-1, 1]) { const cap = mesh(new THREE.CylinderGeometry(legR * 1.5, legR * 1.5, 14 * MM, 16), M.foam); cap.rotation.x = Math.PI / 2; cap.position.set(sx * skidX, skidY + legR, sz * (skidLen / 2 + 7 * MM)); gear.add(cap); }
  }
  item(gear, "frame", "gear", "landing gear, drawn");
  const gearDepthM = -(skidY);

  /* Motors and propellers at the builder's rotor positions. */
  const rotors = [];
  const mountTop = tubeR + 3 * MM;
  for (const r of airframe.rotors) {
    const p = fromBody(r.x, r.y, 0), below = r.z > 1e-6;
    const mm = motorModel(kit.motor, M, r.rotation);
    mm.group.position.set(p.x, below ? -tubeR - 1 * MM : mountTop, p.z);
    if (below) mm.group.rotation.x = Math.PI;
    item(mm.group, "motor", "motors", `${airframe.rotors.length}× ${kit.motor?.model ?? "motor"}`, { motorNumber: r.motor });
    /* A rotor under the arm is a pusher mounted upside down: in its own
       frame it turns the other way, and its blades are the mirror. */
    const localRot = below ? (r.rotation === "CCW" ? "CW" : "CCW") : r.rotation;
    const pr = propModel(propeller, M, localRot, r.rotation);
    const seat = below ? -tubeR - 1 * MM - mm.propSeatY : mountTop + mm.propSeatY;
    pr.group.position.set(p.x, seat, p.z);
    if (below) pr.group.rotation.x = Math.PI;
    item(pr.group, "prop", "props", `${airframe.rotors.length}× ${propeller.label} ${propeller.family}`.trim(), { motorNumber: r.motor });
    rotors.push({ motor: r.motor, hub: pr.group, blades: pr.blades, disc: pr.disc, ring: pr.ring, spin: pr.spin, angle: 0, rim: SPIN_COLOURS[r.rotation === "CCW" ? "CCW" : "CW"] });
  }
  if (!kit.motor?.stator_diameter_mm) notes.push("motor: no published stator size, drawn at a nominal size");

  /* ESCs: one per arm on the tube, or one 4-in-1 board in the stack. */
  const ed = dimsMm(kit.esc?.dimensions_mm), fourInOne = /4[\s-]?in[\s-]?1/i.test(kit.esc?.model ?? "");
  const escL = (ed?.l ?? (fourInOne ? 36 : 60)) * MM, escW = (ed?.w ?? (fourInOne ? 36 : 28)) * MM, escH = (ed?.h ?? (fourInOne ? 6 : 12)) * MM;
  if (!ed) notes.push("ESC: no published size, drawn at a nominal size");
  else if (ed.h == null) notes.push("ESC: thickness not published, drawn");
  const nRot = airframe.rotors.length, boards = Math.ceil(nRot / 4);
  const escLabel = fourInOne ? `${boards}× ${kit.esc?.model ?? "4-in-1 ESC"}` : `${nRot}× ${kit.esc?.model ?? "ESC"}`;
  if (fourInOne && boards > 1) notes.push(`ESC: ${boards} 4-in-1 boards are needed; one is drawn`);
  if (!fourInOne && nRot > armAngles.length) notes.push("ESC: one is drawn per arm; a coaxial arm takes two");
  if (fourInOne) {
    const board = new THREE.Group(); board.name = "esc";
    const b = mesh(new RoundedBoxGeometry(escW, escH, escL, 2, 0.8 * MM), M.pcb, "esc-body"); b.position.y = -tubeR + escH / 2; board.add(b);
    for (const phi of armAngles) {
      const d = V(Math.sin(phi), 0, -Math.cos(phi));
      [-1, 0, 1].forEach((k, i) => {
        const side = V(Math.cos(phi), 0, Math.sin(phi)).multiplyScalar(k * 2.4 * MM);
        board.add(tube([d.clone().multiplyScalar(escL * 0.4).add(side).setY(-tubeR + escH), d.clone().multiplyScalar(rootX + 0.04).add(side).setY(tubeR + 1.2 * MM), d.clone().multiplyScalar(L - motorProbe.radiusM * 1.1).add(side).setY(tubeR + 1.2 * MM), d.clone().multiplyScalar(L - motorProbe.radiusM * 0.6).add(side).setY(mountTop + 2 * MM)], 0.9 * MM, [M.black, M.black, M.black][i]));
      });
    }
    item(board, "esc", "escs", escLabel, { matless: false });
  } else {
    for (const phi of armAngles) {
      const e = new THREE.Group(); e.name = "esc";
      const x0 = rootX + 0.45 * (L - rootX);
      const body = mesh(new RoundedBoxGeometry(escL, escH, escW, 3, Math.min(escH, escW) * 0.3), M.shrink, "esc-body");
      body.position.set(x0, tubeR + escH / 2 + 0.5 * MM, 0); e.add(body);
      for (const dx of [-0.3, 0.3]) {
        const tie = mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), M.black);
        tie.rotation.y = Math.PI / 2; tie.position.set(x0 + dx * escL, (escH + 0.5 * MM) / 2, 0);
        const hz = Math.max(tubeR, escW / 2) + 0.8 * MM, hy = tubeR + (escH + 0.5 * MM) / 2 + 0.8 * MM;
        tie.scale.set(hz, hy, hz); e.add(tie);
      }
      [-2.6, 0, 2.6].forEach((dz) => e.add(tube([V(x0 + escL / 2, tubeR + escH / 2, dz * MM), V(x0 + escL / 2 + 0.03, tubeR + 3 * MM, dz * MM), V(L - motorProbe.radiusM * 1.05, tubeR + 3 * MM, dz * MM), V(L - motorProbe.radiusM * 0.7, mountTop + 3 * MM, dz * MM)], 1.0 * MM, M.black)));
      [[-2, M.red], [2, M.black]].forEach(([dz, mat]) => e.add(tube([V(x0 - escL / 2, tubeR + escH / 2, dz * MM), V(x0 - escL / 2 - 0.02, tubeR + 2 * MM, dz * MM), V(rootX * 0.9, 0, dz * MM)], 1.3 * MM, mat)));
      e.rotation.y = Math.PI / 2 - phi;
      item(e, "esc", "escs", escLabel);
    }
    const pdb = new THREE.Group(); pdb.name = "pdb";
    const board = mesh(new THREE.BoxGeometry(0.5 * bodyR, 1.6 * MM, 0.5 * bodyR), M.pcb); board.position.y = -tubeR + 0.8 * MM; pdb.add(board);
    item(pdb, "esc", "pdb", "power distribution board, drawn", { matless: true });
  }

  /* The battery: the sizing's S x P cells at their published size, laid
     out by geometry3d.js's declared grid, on the top plate. */
  const pack = kit.pack, cell = kit.cell;
  const cd = parseDimsMm(cell?.dimensions_mm), box = /L\s*x\s*W/i.test(String(cell?.dimensions_mm ?? "")) ? dimsMm(cell.dimensions_mm) : null;
  let packTop = yTopSurface, packHalfX = 0.4 * bodyR, packHalfZ = 0.3 * bodyR;
  const S = pack?.cellsSeries ?? 0, P = pack?.cellsParallel ?? 0, padY = yTopSurface + 2 * MM;
  const cellLabel = `${S * P}× ${cell?.model ?? "cell"}`;
  if (pack && box) {
    const bl = box.l * MM, bw = box.w * MM, bh = (box.h ?? 20) * MM;
    for (let r = 0; r < P; r++) for (let c = 0; c < S; c++) {
      const b = mesh(new RoundedBoxGeometry(bw, bh, bl, 2, 2 * MM), M.cellWrap, "cell");
      b.position.set((c - (S - 1) / 2) * bw * 1.02, padY + (r + 0.5) * bh * 1.02, 0);
      item(b, "cell", "cells", cellLabel);
    }
    packTop = padY + P * bh * 1.02; packHalfX = (S * bw * 1.02) / 2; packHalfZ = bl / 2;
  } else if (pack && cd) {
    const lay = cellLayout(pack, cd);
    for (const c of lay.cells) {
      const cg = new THREE.Group(); cg.name = "cell";
      const body = mesh(new THREE.CylinderGeometry(c.radiusM, c.radiusM, c.heightM, 28), M.cellWrap, "cell"); cg.add(body);
      const cap = mesh(new THREE.CylinderGeometry(c.radiusM * 0.55, c.radiusM * 0.55, 0.8 * MM, 20), M.steel); cap.position.y = c.heightM / 2 + 0.4 * MM; cg.add(cap);
      const ring = mesh(new THREE.CylinderGeometry(c.radiusM * 1.003, c.radiusM * 1.003, c.heightM * 0.08, 28, 1, true), M.white); ring.position.y = c.heightM * 0.38; cg.add(ring);
      cg.rotation.x = Math.PI / 2;
      cg.position.set(c.x, padY + lay.diameterM * 0.51 + (c.y + ((lay.rows - 1) / 2) * lay.diameterM * 1.02), 0);
      item(cg, "cell", "cells", cellLabel);
    }
    packTop = padY + lay.rows * lay.diameterM * 1.02; packHalfX = lay.footprintM[0] / 2; packHalfZ = lay.heightM / 2;
  } else if (pack) notes.push("cell: no published size, the pack is not drawn");
  if (pack && (cd || box)) {
    const wrapH = packTop - padY;
    const pk = new THREE.Group(); pk.name = "pack";
    const wrap = mesh(new RoundedBoxGeometry(packHalfX * 2 + 3 * MM, wrapH + 3 * MM, packHalfZ * 2 + 4 * MM, 3, 3 * MM), M.clearShrink, "pack-wrap");
    wrap.position.y = padY + wrapH / 2; wrap.renderOrder = 3; pk.add(wrap);
    if (cd && !box) for (const zs of [-1, 1]) for (let r = 0; r < P; r++) {
      const strip = mesh(new THREE.BoxGeometry(packHalfX * 2 - 2 * MM, cd.diameterMm * MM * 0.42, 0.3 * MM), M.nickel);
      strip.position.set(0, padY + (r + 0.5) * cd.diameterMm * MM * 1.02, zs * (packHalfZ + 0.6 * MM)); pk.add(strip);
    }
    const lt = labelTexture([`${S}S${P}P  ${pack.voltagePrintedV ?? "—"} V`, `${pack.capacityMah ?? "—"} mAh · ${Math.round(pack.energyWhPublished ?? 0)} Wh`, cell?.model ?? ""]);
    const label = mesh(new THREE.PlaneGeometry(packHalfX * 1.5, Math.min(packHalfZ * 1.3, packHalfX * 0.75)), lt ? new THREE.MeshStandardMaterial({ map: lt, roughness: 0.6 }) : M.white, "pack-label");
    label.rotation.x = -Math.PI / 2; label.position.y = packTop + 1.6 * MM; pk.add(label);
    const pad = mesh(new THREE.BoxGeometry(packHalfX * 2, 2 * MM, packHalfZ * 2), M.foam); pad.position.y = yTopSurface + 1 * MM; pk.add(pad);
    for (const zs of [-0.5, 0.5]) {
      const z = zs * packHalfZ, w = 18 * MM, t2 = 1.2 * MM;
      const topS = mesh(new THREE.BoxGeometry(packHalfX * 2 + 8 * MM, t2, w), M.strap); topS.position.set(0, packTop + 2.6 * MM, z); pk.add(topS);
      for (const sx of [-1, 1]) { const side = mesh(new THREE.BoxGeometry(t2, packTop - yTopPlate + 2 * MM, w), M.strap); side.position.set(sx * (packHalfX + 4 * MM), (packTop + yTopPlate) / 2 + 1 * MM, z); pk.add(side); }
      const buckle = mesh(new THREE.BoxGeometry(14 * MM, 4 * MM, w * 1.15), M.black); buckle.position.set(packHalfX * 0.55, packTop + 3.5 * MM, z); pk.add(buckle);
    }
    const rear = packHalfZ + 2 * MM;
    [[-6, M.red], [6, M.black]].forEach(([dx, mat]) => pk.add(tube([V(dx * MM, padY + wrapH * 0.5, rear), V(dx * MM, padY + wrapH * 0.5, rear + 0.03), V(dx * MM * 1.5, yTopPlate - 2 * MM, rear + 0.045), V(dx * MM, 0, 0.35 * bodyR)], 2.2 * MM, mat)));
    const xt = mesh(new RoundedBoxGeometry(16 * MM, 9 * MM, 21 * MM, 2, 1.5 * MM), M.yellow, "connector"); xt.position.set(0, padY + wrapH * 0.5, rear + 0.03); pk.add(xt);
    const bal = mesh(new RoundedBoxGeometry(4 * MM, 6 * MM, (S + 1) * 2.5 * MM, 2, 0.8 * MM), M.white); bal.position.set(packHalfX + 9 * MM, packTop - 4 * MM, -packHalfZ * 0.3); pk.add(bal);
    item(pk, "pack", "pack", `pack: wrap, nickel strips, leads, straps`, { matless: true });
  }

  /* Avionics: one declared mass, so the module is a generic drawing. */
  const av = new THREE.Group(); av.name = "avionics";
  const fcZ = -Math.min(bodyR * 0.62, packHalfZ + 0.03), fcY = yTopSurface + 6 * MM;
  const fc = mesh(new RoundedBoxGeometry(31.8 * MM, 14.6 * MM, 38.8 * MM, 3, 2.5 * MM), M.black, "flight-controller"); fc.position.set(0, fcY + 7.3 * MM, fcZ); av.add(fc);
  const arrow = new THREE.Shape(); arrow.moveTo(0, 12 * MM); arrow.lineTo(6 * MM, 2 * MM); arrow.lineTo(2 * MM, 2 * MM); arrow.lineTo(2 * MM, -10 * MM); arrow.lineTo(-2 * MM, -10 * MM); arrow.lineTo(-2 * MM, 2 * MM); arrow.lineTo(-6 * MM, 2 * MM); arrow.closePath();
  const ag = new THREE.ExtrudeGeometry(arrow, { depth: 0.4 * MM, bevelEnabled: false }); ag.rotateX(-Math.PI / 2);
  const am = mesh(ag, M.white); am.position.set(0, fcY + 14.7 * MM, fcZ); av.add(am);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const d = mesh(new THREE.SphereGeometry(3.2 * MM, 14, 10), M.damper); d.position.set(dx * 12 * MM, yTopSurface + 3 * MM, fcZ + dz * 15 * MM); av.add(d); }
  for (let k = 0; k < 4; k++) { const c = mesh(new THREE.BoxGeometry(2.5 * MM, 4 * MM, 6 * MM), M.white); c.position.set(16.6 * MM, fcY + 7 * MM, fcZ - 12 * MM + k * 8 * MM); av.add(c); }
  const mastZ = Math.max(packHalfZ + 0.02, bodyR * 0.55), mastH = clamp(0.5 * bodyR, 0.06, 0.16);
  const mast = mesh(new THREE.CylinderGeometry(3.2 * MM, 3.2 * MM, mastH, 14), M.carbon(2, 10)); mast.position.set(-Math.max(0.03, packHalfX * 0.55), yTopSurface + mastH / 2, mastZ); av.add(mast);
  const hinge = mesh(new RoundedBoxGeometry(10 * MM, 12 * MM, 10 * MM, 2, 1 * MM), M.gunmetal); hinge.position.set(mast.position.x, yTopSurface + 6 * MM, mastZ); av.add(hinge);
  const gps = mesh(new THREE.CylinderGeometry(30 * MM, 32 * MM, 12 * MM, 40), M.white, "gps"); gps.position.set(mast.position.x, yTopSurface + mastH + 6 * MM, mastZ); av.add(gps);
  const gpsArrow = mesh(ag.clone(), M.black); gpsArrow.position.set(mast.position.x, yTopSurface + mastH + 12.2 * MM, mastZ); av.add(gpsArrow);
  const rxX = Math.max(0.03, packHalfX * 0.55);
  const rx = mesh(new RoundedBoxGeometry(14 * MM, 7 * MM, 24 * MM, 2, 1 * MM), M.black, "receiver"); rx.position.set(rxX, yTopSurface + 3.5 * MM, mastZ); av.add(rx);
  for (const s of [-1, 1]) { const ant = mesh(new THREE.CylinderGeometry(0.9 * MM, 0.9 * MM, 70 * MM, 8), M.black); ant.position.set(rxX + s * 0.022, yTopSurface + 0.03, mastZ + 0.022); ant.rotation.set(0.7, 0, s * 0.7); av.add(ant); }
  item(av, "avionics", "avionics", "flight controller, GPS, receiver (drawn)");

  /* Payload: a box under the frame, carrying the declared mass. */
  if (pay) {
    const pg = new THREE.Group(); pg.name = "payload";
    const b = mesh(new RoundedBoxGeometry(edge, boxH, edge * 0.8, 2, 3 * MM), M.cardboard, "payload-box"); b.position.y = yBotPlate - 4 * MM - boxH / 2; pg.add(b);
    const tape = mesh(new THREE.BoxGeometry(edge * 1.003, boxH * 0.15, edge * 0.8 * 1.004), M.tape); tape.position.y = b.position.y + boxH * 0.42; pg.add(tape);
    const lt = labelTexture([`${kit.payloadKg} kg`, "payload, declared"], { bg: "#efe3c8", accent: "#1d4f91" });
    if (lt) { const l = mesh(new THREE.PlaneGeometry(edge * 0.5, boxH * 0.42), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.7 })); l.position.set(0, b.position.y, -edge * 0.4 - 0.4 * MM); l.rotation.y = Math.PI; pg.add(l); }
    for (const sx of [-1, 1]) { const hook = mesh(new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, 4 * MM + 1 * MM, 8), M.steel); hook.position.set(sx * edge * 0.3, yBotPlate - 2.5 * MM, 0); pg.add(hook); }
    item(pg, "payload", "payload", `payload box, ${kit.payloadKg} kg declared`);
  }

  for (const grp of groups.values()) {
    const own = new Map();
    for (const it of grp.items) it.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.transparent) return;
      if (!own.has(o.material)) own.set(o.material, o.material.clone());
      o.material = own.get(o.material);
    });
  }

  return {
    group: g, items, parts, groups: [...groups.values()], rotors, notes,
    spanM: airframe.spanM, scale: Math.max(0.06, bodyR), gearDepthM,
    topY: Math.max(packTop, yTopSurface + mastH + 12 * MM),
  };
}

export function disposeGroup(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
  });
}
