/* =====================================================================
   EVTOL BUILD LAB — the aircraft as modelled parts (three.js, lazy-loaded)
   =====================================================================
   buildEvtol(plan) shapes every part build-plan.js lists, at the sizing's
   own dimensions, for the hangar scene to lay out and assemble. It is a
   DRAWING of the sized aircraft and computes nothing about it.

   TO SCALE, from aircraftGeometry(p, SR)
     fuselage        length and every sized station: the surface passes
                     exactly through each station's section (the same
                     rounded-rectangle section engine/mesh.js lofts)
     wing, tail      planform: span, root and tip chord, sweep, dihedral,
                     and the thickness ratio
     booms           stations, radius, position
     motor stacks    motor, spacer and hub radii and heights
     rotors, pusher  tip radius, blade count, position
     gear            leg ends, tyre radius and width, strut chord
   DRAWN, not sized
     the smoothing between fuselage stations (monotone cubic, so it never
     overshoots a station), the windows, doors and paint; every aerofoil
     section (symmetric NACA four-digit at the sized thickness ratio); the
     blade planform, twist and section (the mean chord is the one the
     other 3D views draw); motor fins and spinners; the hubs; the seats,
     the battery box, the assembly stands and the 1.8 m person.

   Axes. The geometry is +x aft, +y right, +z up. three.js is y up: a
   point maps to (-(x - cx), z - zGround, y), a proper rotation, so the
   nose points along +x, the right wing along +z, and the ground is y = 0.

   Pose. Every rotor is drawn in the HOVER pose, the attitude the geometry
   hands over. A tilting nacelle is the one body authored in the airplane
   attitude, and it is stood up through engine/mesh.js's own posing
   function, about its rotor's hub, exactly as the other 3D views do it.
   ===================================================================== */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tiltAngleRad, tiltPt } from "../../engine/mesh.js";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const DEG = Math.PI / 180;

/* ── Frames ─────────────────────────────────────────────────────────── */
export function worldFrame(plan) {
  const f = plan.fuselage, cx = (f.x0 + f.x1) / 2, zG = plan.zGround;
  return {
    cx, zG,
    toWorld: (x, y, z) => new THREE.Vector3(-(x - cx), z - zG, y),
    fromWorld: (v) => [cx - v.x, v.z, v.y + zG],
  };
}

/* ── Sections ───────────────────────────────────────────────────────── */
/* The superellipse exponent engine/mesh.js gives a station's corner
   radius; r <= 0.001 is its ellipse (exponent 2). Written the same way so
   a station's ring here is the mesh's ring. */
export function sectionExponent(r) {
  if (!(r > 0.001)) return 2;
  const rr = Math.max(0.02, Math.min(0.5, r));
  return 2 + 6 * (1 - rr / 0.5);
}
/* `around` points (a multiple of 4), starting at the bottom and going up
   the right side, plus the first again so the texture has a seam. */
function ringPts(x, yc, zc, hw, hh, e, around) {
  const pts = [];
  for (let k = 0; k <= around; k++) {
    /* The same angle engine/mesh.js computes for this point (its j-th of
       `around`), written the same way so the two rings agree to the bit. */
    const j = (k + (3 * around) / 4) % around, a = (2 * Math.PI * j) / around;
    const ca = Math.cos(a), sa = Math.sin(a);
    const fy = e === 2 ? ca : Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
    const fz = e === 2 ? sa : Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
    pts.push([x, yc + hw * fy, zc + hh * fz]);
  }
  return pts;
}
/* Monotone cubic (Fritsch–Carlson) through (xs, ys): smooth, through
   every point, and never overshooting one. */
function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x, i) => {
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/* The rings of a lofted body (fuselage, boom, nacelle, sponson), in the
   geometry's own axes. Rings at the stations are the stations exactly;
   rings between them are drawn. Two stations at one t are a step (an end
   face), not a curve. */
export function loftRings(b, { around = 64, maxStep = 0.12 } = {}) {
  const L = b.x1 - b.x0, st = b.stations, rings = [];
  const y = b.y ?? 0;
  const at = (x, w, h, dz, e, station) => ({ x: b.x0 + x, station, pts: ringPts(b.x0 + x, y, b.z + dz, w / 2, h / 2, e, around) });
  const chains = [];
  let start = 0;
  for (let k = 1; k <= st.length; k++) if (k === st.length || !(st[k].t > st[k - 1].t)) { chains.push([start, k - 1]); start = k; }
  for (const [a, z] of chains) {
    const idx = []; for (let k = a; k <= z; k++) idx.push(k);
    const xs = idx.map((k) => st[k].t * L);
    const exact = (k) => at(st[k].t * L, st[k].w, st[k].h, st[k].dz || 0, sectionExponent(st[k].r || 0), k);
    if (idx.length === 1) { rings.push(exact(idx[0])); continue; }
    const F = {
      w: monotone(xs, idx.map((k) => st[k].w)), h: monotone(xs, idx.map((k) => st[k].h)),
      dz: monotone(xs, idx.map((k) => st[k].dz || 0)), e: monotone(xs, idx.map((k) => sectionExponent(st[k].r || 0))),
    };
    for (let i = 0; i < idx.length - 1; i++) {
      rings.push(exact(idx[i]));
      const n = Math.max(1, Math.ceil((xs[i + 1] - xs[i]) / maxStep));
      for (let s = 1; s < n; s++) {
        const x = xs[i] + ((xs[i + 1] - xs[i]) * s) / n;
        rings.push(at(x, Math.max(0, F.w(x, i)), Math.max(0, F.h(x, i)), F.dz(x, i), clamp(F.e(x, i), 2, 8), null));
      }
    }
    rings.push(exact(idx[idx.length - 1]));
  }
  return rings;
}

/* NACA four-digit symmetric half thickness, closed trailing edge. */
const nacaHalf = (xi, tc) => 5 * tc * (0.2969 * Math.sqrt(Math.max(0, xi)) - 0.126 * xi - 0.3516 * xi * xi + 0.2843 * xi ** 3 - 0.1036 * xi ** 4);
/* A section loop from xi0 to the trailing edge: upper surface TE -> xi0,
   then lower xi0 -> TE. Cosine spaced. */
function loopXi(np, xi0 = 0) {
  const up = [], lo = [];
  for (let i = 0; i <= np; i++) { const s = xi0 + (1 - xi0) * 0.5 * (1 - Math.cos((Math.PI * i) / np)); up.push([s, 1]); lo.push([s, -1]); }
  return [...up.reverse(), ...lo.slice(xi0 === 0 ? 1 : 0)];
}

/* ── Geometry from rings ────────────────────────────────────────────── */
function ringsGeometry(rings, toW, { uv = null, caps = true } = {}) {
  const pos = [], uvs = [], idx = [], m = rings[0].length;
  rings.forEach((r, i) => r.forEach((p, k) => {
    const w = toW(p[0], p[1], p[2]); pos.push(w.x, w.y, w.z);
    const t = uv ? uv(i, k) : [i / Math.max(1, rings.length - 1), k / Math.max(1, m - 1)];
    uvs.push(t[0], t[1]);
  }));
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < m - 1; k++) {
    const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
    const r = rings[ri]; let cx = 0, cy = 0, cz = 0;
    r.forEach((p) => { cx += p[0]; cy += p[1]; cz += p[2]; });
    const c = toW(cx / m, cy / m, cz / m), ci = pos.length / 3;
    pos.push(c.x, c.y, c.z); uvs.push(ri === 0 ? 0 : 1, 0.5);
    for (let k = 0; k < m - 1; k++) { const a = ri * m + k, b = a + 1; flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm3 = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* A lifting surface through sections { le, c, tc, n }: chord streamwise
   (+x), thickness along n. xi0 > 0 draws only the part aft of a hinge. */
function surfaceRings(sections, { np = 22, xi0 = 0, inflate = 1, proud = 0 } = {}) {
  const loop = loopXi(np, xi0);
  return sections.map((s) => loop.map(([xi, side]) => {
    const half = nacaHalf(xi, s.tc) * s.c * inflate + (xi < 1 ? proud : 0);
    return add3([s.le[0] + xi * s.c, s.le[1], s.le[2]], s.n, side * half);
  }));
}
/* The sections of a geometry body, as engine/mesh.js places its planform. */
export function surfaceSections(b) {
  const sw = Math.tan((b.sweepDeg ?? 0) * DEG), tc = b.thickRatio ?? 0.12;
  const sec = (le, c, n) => ({ le, c, tc, n });
  if (b.kind === "vtail") {
    const g = (b.dihedralDeg ?? 45) * DEG, lat = b.span * Math.cos(g), up = b.span * Math.sin(g), y = b.y ?? 0;
    return [-1, 1].map((s) => [
      sec([b.x, y, b.z], b.rootChord, [0, -s * Math.sin(g), Math.cos(g)]),
      sec([b.x + lat * sw, y + s * lat, b.z + up], b.tipChord, [0, -s * Math.sin(g), Math.cos(g)]),
    ]);
  }
  if (b.kind === "vfin") {
    const y = b.y ?? 0;
    return [[sec([b.x, y, b.z], b.rootChord, [0, 1, 0]), sec([b.x + Math.abs(b.span) * sw, y, b.z + b.span], b.tipChord, [0, 1, 0])]];
  }
  const half = b.span / 2, dh = Math.tan((b.dihedralDeg ?? 0) * DEG), y = b.y ?? 0;
  const tip = (s) => sec([b.x + half * sw, y + s * half, b.z + half * dh], b.tipChord, [0, 0, 1]);
  return [[tip(-1), sec([b.x, y, b.z], b.rootChord, [0, 0, 1]), tip(1)]];
}

/* A straight member (pylon, strut, shaft, stack part) from p0 to p1:
   round at its radius, or faired to a streamwise aerofoil of `chord`
   whose thickness is the member's diameter. */
function memberRings(p0, p1, R, chord = 0, n = 24) {
  const u = norm3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
  let ex = [1 - u[0] * u[0], -u[0] * u[1], -u[0] * u[2]];
  if (Math.hypot(...ex) < 1e-6) ex = Math.abs(u[2]) < 0.9 ? cross3(u, [0, 0, 1]) : cross3(u, [0, 1, 0]);
  ex = norm3(ex);
  const e2 = norm3(cross3(u, ex));
  const pts = (c) => {
    if (chord > 0) return loopXi(n / 2).map(([xi, side]) => add3(add3(c, ex, (xi - 0.5) * chord), e2, side * nacaHalf(xi, (2 * R) / chord) * chord));
    const out = [];
    for (let k = 0; k <= n; k++) { const a = (2 * Math.PI * k) / n; out.push(add3(add3(c, ex, R * Math.cos(a)), e2, R * Math.sin(a))); }
    return out;
  };
  return [pts(p0), pts(p1)];
}
const endsOf = (b) => [[b.x0 ?? b.x, b.y0 ?? b.y ?? 0, b.z0 ?? b.z], [b.x1 ?? b.x, b.y ?? 0, b.z]];

/* ── Materials ──────────────────────────────────────────────────────── */
function canvasTexture(w, h, draw) {
  if (typeof document === "undefined") return null;          // a gate in Node draws no textures
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/* The fuselage paint (drawn): u runs nose to tail, v round the section
   from the belly up the right side (v 0.25), over the top (0.5) and down
   the left (0.75). Windows sit at the seat rows. */
function paintFuselage(plan) {
  const f = plan.fuselage, L = f.x1 - f.x0;
  const rows = [...new Set(plan.seats.map((s) => s.x.toFixed(3)))].map(Number).map((x) => (x - f.x0) / L);
  return canvasTexture(2048, 1024, (x, W, H) => {
    x.fillStyle = "#f5f7f9"; x.fillRect(0, 0, W, H);
    const band = (v0, v1, col) => { x.fillStyle = col; x.fillRect(0, v0 * H, W, (v1 - v0) * H); };
    band(0, 0.07, "#c9d0d8"); band(0.93, 1, "#c9d0d8");
    for (const [a, b] of [[0.155, 0.185], [0.815, 0.845]]) band(a, b, "#1f5fbf");
    for (const [a, b] of [[0.19, 0.198], [0.802, 0.81]]) band(a, b, "#f2b23a");
    const glass = (u0, u1, v0, v1, r = 18) => {
      const X = u0 * W, Y = v0 * H, w = (u1 - u0) * W, h = (v1 - v0) * H;
      const g = x.createLinearGradient(X, Y, X + w, Y + h); g.addColorStop(0, "#1b2a3a"); g.addColorStop(0.55, "#355a7c"); g.addColorStop(1, "#14202c");
      x.fillStyle = g; x.beginPath(); x.roundRect(X, Y, w, h, Math.min(r, w / 2, h / 2)); x.fill();
      x.strokeStyle = "rgba(20,26,34,0.55)"; x.lineWidth = 3; x.stroke();
    };
    glass(0.06, 0.165, 0.34, 0.66, 40);                                  // windscreen
    for (const side of [[0.255, 0.315], [0.685, 0.745]]) for (const u of rows) glass(u - 0.03, u + 0.03, side[0], side[1]);
    x.strokeStyle = "rgba(60,70,82,0.6)"; x.lineWidth = 3;               // door outlines
    const doorU = rows.length > 1 ? rows[1] : rows[0] ?? 0.4;
    for (const [v0, v1] of [[0.12, 0.335], [0.665, 0.88]]) { x.beginPath(); x.roundRect((doorU - 0.055) * W, v0 * H, 0.11 * W, (v1 - v0) * H, 14); x.stroke(); }
  });
}
function makeMaterials() {
  const std = (color, roughness = 0.5, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide, ...extra });
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.14, side: THREE.DoubleSide });
  return {
    paint, white: paint(0xf2f4f6), surface: paint(0xe6eaee), control: paint(0xcfd6de),
    blade: new THREE.MeshPhysicalMaterial({ color: 0x2b3038, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, side: THREE.DoubleSide }),
    alu: std(0xbcc3cb, 0.3, 1), gunmetal: std(0x3a3f47, 0.35, 0.85), dark: std(0x24282e, 0.5, 0.3), rubber: std(0x17191c, 0.92),
    fabric: std(0x2c3542, 0.86), frame: std(0x4a515b, 0.4, 0.7), cushion: std(0x3b4757, 0.8),
    casing: std(0x2f3e52, 0.45, 0.45), hv: std(0xf08a24, 0.5, 0.1),
    stand: std(0xe2a72a, 0.5, 0.3), pad: std(0x202226, 0.9),
    skin: std(0x8f9aa7, 0.8), vest: std(0xf2b23a, 0.7), boots: std(0x2a2d31, 0.8), helmet: std(0xf4f4f0, 0.4),
  };
}
const mesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; return m; };

/* A lathe between two world points: profile [[radius, s in 0..1]]. */
function latheBetween(p0, p1, profile, mat, seg = 40) {
  const d = new THREE.Vector3().subVectors(p1, p0), len = d.length();
  const g = new THREE.LatheGeometry(profile.map(([r, s]) => new THREE.Vector2(Math.max(1e-4, r), s * len)), seg);
  const m = mesh(g, mat);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.position.copy(p0);
  return m;
}

/* A blade set in the rotor's own frame: radial +x, disc normal +y.
   Mean chord as the other views draw it; planform, twist (a drawn linear
   washout) and section (NACA 0012) are drawn. */
function bladesGeometry(R, nB, chord, r0) {
  const NS = 26, loop = loopXi(10), geos = [];
  for (let b = 0; b < nB; b++) {
    const psi = (2 * Math.PI * b) / nB, cp = Math.cos(psi), sp = Math.sin(psi);
    const rings = [];
    for (let i = 0; i <= NS; i++) {
      const r = r0 + (R - r0) * (i / NS), x = r / R;
      let c = chord * (1.18 - 0.36 * x);
      if (x > 0.95) c *= Math.sqrt(Math.max(0, 1 - ((x - 0.95) / 0.05) ** 2));     // a rounded tip that closes at R
      const th = (10 - 14 * (x - 0.75)) * DEG, ct = Math.cos(th), st = Math.sin(th);
      rings.push(loop.map(([xi, side]) => {
        const t = (0.25 - xi) * c, n = side * nacaHalf(xi, 0.12) * c;
        const T = t * ct - n * st, N = t * st + n * ct;
        return [r * cp - T * sp, N, -(r * sp + T * cp)];
      }));
    }
    geos.push(ringsGeometry(rings, (x, y, z) => new THREE.Vector3(x, y, z)));
  }
  return geos;
}

/* ── THE AIRCRAFT ───────────────────────────────────────────────────── */
export function buildEvtol(plan) {
  const M = makeMaterials();
  const { toWorld: W } = worldFrame(plan);
  const root = new THREE.Group(); root.name = "evtol";
  const items = [], groups = new Map(), rotors = [];
  let fuselageMeshes = [];

  const bodyMeshes = (b, it) => {
    switch (b.kind) {
      case "fuselage": {
        const rings = loftRings(b, { around: 64, maxStep: 0.1 });
        const L = b.x1 - b.x0;
        const g = ringsGeometry(rings.map((r) => r.pts), W, { uv: (i, k) => [(rings[i].x - b.x0) / L, k / 64] });
        const map = paintFuselage(plan);
        const mat = map ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12, side: THREE.DoubleSide }) : M.white;
        const m = mesh(g, mat, "fuselage"); fuselageMeshes.push(m);
        return [m];
      }
      case "sponson": case "nacelle": {
        let rings = loftRings(b, { around: 32, maxStep: 0.12 }).map((r) => r.pts);
        if (b.kind === "nacelle" && b.tilting) {
          /* The same mate, pivot and angle as engine/mesh.js, at tilt 0. */
          const mate = plan.geo.bodies.find((o) => o.kind === "rotor" && String(o.label ?? "") === String(b.label ?? "").replace(/ nacelle$/, ""));
          const c = mate ? (mate.hinge || mate) : null, a = tiltAngleRad(b, 0);
          if (c) rings = rings.map((pts) => pts.map(([x, y, z]) => tiltPt(x - c.x, y - c.y, z - c.z, c.x, c.y, c.z, a)));
        }
        return [mesh(ringsGeometry(rings, W), M.white, b.kind)];
      }
      case "wing": case "htail": case "vtail": case "vfin":
        return surfaceSections(b).map((secs) => mesh(ringsGeometry(surfaceRings(secs), W), M.surface, b.kind));
      case "control": {
        const q = b.quad; if (!q || q.length !== 4) return [];
        const parent = plan.wing;
        if (b.surface === "wing" && parent) {
          const sec = (h, t) => { const c = (t[0] - h[0]) / b.chordFrac; return { le: [t[0] - c, h[1], h[2]], c, tc: parent.thickRatio ?? 0.12, n: [0, 0, 1] }; };
          return [mesh(ringsGeometry(surfaceRings([sec(q[0], q[1]), sec(q[3], q[2])], { np: 8, xi0: 1 - b.chordFrac, inflate: 1.05, proud: 0.004 }), W), M.control, "control")];
        }
        const n = norm3(cross3([q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]]));
        const slab = [q, q.map((p) => add3(p, n, 0.02))].map((s) => [...s, s[0]]);
        return [mesh(ringsGeometry(slab, W), M.control, "control")];
      }
      case "rotor": case "pusher": {
        const R = b.radius, nB = Math.max(2, b.blades || 3);
        const sol = b.kind === "pusher" ? 0.12 : (b.solidity || 0.1);
        const chord = Math.max(0.04 * R, (sol * Math.PI * R) / nB);
        const hubR = b.kind === "pusher" ? Math.max(0.06 * R, chord * 0.7) : Math.max(0.06 * R, chord * 0.7);
        const blades = new THREE.Group(); blades.name = "blades";
        for (const g of bladesGeometry(R, nB, chord, hubR * 0.8)) blades.add(mesh(g, M.blade, "blade"));
        const disc = new THREE.Group(); disc.add(blades);
        const out = [disc];
        if (b.kind === "pusher") {
          /* Disc normal along the flight path; blades parked across it. */
          disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
          blades.rotation.y = Math.PI / 2;
          const shaft = plan.items.find((i) => i.key === "pusher")?.bodies.find((x) => x.kind === "boom");
          const sr = shaft?.radius ?? hubR;
          const spin = latheBetween(W(b.x, b.y ?? 0, b.z), W(b.x + 3.2 * sr, b.y ?? 0, b.z),
            [[sr * 1.02, 0], [sr * 1.0, 0.25], [sr * 0.8, 0.6], [sr * 0.42, 0.88], [0.001, 1]], M.white, 32);
          out.push(spin);
        } else {
          /* Parked: overlapping discs are parked out of each other's way. */
          blades.rotation.y = plan.rotorPhase?.get(b.label) ?? 0;
          if (!b.hasStack) out.push(latheBetween(W(b.x, b.y, b.z - hubR * 0.5), W(b.x, b.y, b.z + hubR * 0.5), [[hubR, 0], [hubR, 1]], M.gunmetal));
        }
        disc.position.copy(W(b.x, b.y ?? 0, b.z));
        rotors.push({ blades, kind: b.kind, label: b.label, radius: R, angle: 0 });
        return out;
      }
      case "wheel": {
        const R = b.radius || 0.25, w = b.width || 0.15, rr = 0.58 * R, rc = (R + rr) / 2, a = (R - rr) / 2;
        const prof = [];
        for (let i = 0; i <= 28; i++) {
          const ph = -Math.PI / 2 + (Math.PI * i) / 28, c = Math.cos(ph), s = Math.sin(ph);
          prof.push(new THREE.Vector2(rc + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / 3), (w / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / 3)));
        }
        prof[0].x = rr; prof[prof.length - 1].x = rr;
        const tyre = new THREE.LatheGeometry(prof, 48); tyre.rotateX(Math.PI / 2);
        const hub = new THREE.CylinderGeometry(rr * 1.01, rr * 1.01, w * 0.84, 32); hub.rotateX(Math.PI / 2);
        const cap = new THREE.CylinderGeometry(rr * 0.42, rr * 0.5, w * 0.95, 24); cap.rotateX(Math.PI / 2);
        const c = W(b.x, b.y, b.z);
        return [[tyre, M.rubber, "tyre"], [hub, M.alu, "hub"], [cap, M.gunmetal, "hubcap"]].map(([g, m, n]) => { const o = mesh(g, m, n); o.position.copy(c); return o; });
      }
      case "boom": {
        if (b.stations) return [mesh(ringsGeometry(loftRings(b, { around: 24, maxStep: 0.25 }).map((r) => r.pts), W), M.white, "boom")];
        const [p0, p1] = endsOf(b);
        const label = String(b.label ?? "");
        if (b.motorPart && / motor$/.test(label)) {
          const R = b.radius, fins = [];
          for (let i = 0; i <= 8; i++) { const s = 0.08 + (0.8 * i) / 8; fins.push([R, s], [R * 0.93, s + 0.05]); }
          return [latheBetween(W(...p0), W(...p1), [[R * 0.6, 0], [R * 0.97, 0.02], [R, 0.06], ...fins, [R, 0.94], [R * 0.9, 1]], M.gunmetal, 48)];
        }
        if (b.motorPart && / hub$/.test(label)) {
          const R = b.radius;
          return [latheBetween(W(...p0), W(...p1), [[R * 0.98, 0], [R, 0.08], [R, 0.92], [R * 0.98, 1]], M.dark, 40),
                  latheBetween(W(...p1), W(p1[0], p1[1], p1[2] + 0.55 * R), [[R * 0.62, 0], [R * 0.56, 0.4], [R * 0.36, 0.78], [0.001, 1]], M.white, 32)];
        }
        if (b.motorPart) return [mesh(ringsGeometry(memberRings(p0, p1, b.radius, 0, 32), W), M.alu, "spacer")];
        if (label === "Pusher shaft") return [mesh(ringsGeometry(memberRings(p0, p1, b.radius, 0, 32), W), M.white, "shaft")];
        const strut = / strut$/.test(label);
        return [mesh(ringsGeometry(memberRings(p0, p1, b.radius, Number(b.chord) || 0, 24), W), strut ? M.alu : M.white, strut ? "strut" : "pylon")];
      }
      default: return [];
    }
  };

  const itemObj = (it) => {
    const g = new THREE.Group(); g.name = it.key;
    for (const b of it.bodies) for (const m of bodyMeshes(b, it)) g.add(m);
    if (it.group === "seats") g.add(...seatMeshes(it.seat, M, W));
    if (it.group === "battery") g.add(...packMeshes(it.pack, M, W));
    /* Centre the item on its own box, so it turns about itself on the floor. */
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
    for (const ch of g.children) ch.position.sub(c);
    g.position.copy(c);
    Object.assign(g.userData, { item: true, itemKey: it.key, groupKey: it.group, label: it.label });
    g.traverse((o) => { if (o.isMesh) { o.userData.itemRoot = g; o.castShadow = true; o.receiveShadow = true; } });
    return g;
  };
  for (const it of plan.items) {
    const g = itemObj(it);
    root.add(g); items.push(g);
    if (!groups.has(it.group)) groups.set(it.group, { key: it.group, label: GROUP_LABEL(plan, it.group), items: [] });
    groups.get(it.group).items.push(g);
  }
  /* One set of materials per group, so a highlight tints one group only. */
  for (const grp of groups.values()) {
    const own = new Map();
    for (const it of grp.items) it.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!own.has(o.material)) own.set(o.material, o.material.clone());
      o.material = own.get(o.material);
    });
  }
  fuselageMeshes = groups.get("fuselage")?.items.flatMap((it) => { const a = []; it.traverse((o) => { if (o.isMesh) a.push(o); }); return a; }) ?? [];

  const stands = new THREE.Group(); stands.name = "stands";
  for (const s of plan.stands) stands.add(standObj(s, M, W, plan.zGround));
  const person = personObj(M);

  return { group: root, items, groups: [...groups.values()], rotors, fuselageMeshes, stands, person, materials: M, toWorld: W };
}
/* The plan names the groups for its layout; the drawn ones say so. */
const GROUP_LABEL = (plan, g) => `${plan.groupLabel(g)}${g === "seats" || g === "battery" ? " (drawn)" : ""}`;

/* A seat (drawn): base, pan, reclined back and headrest, facing forward. */
function seatMeshes(s, M, W) {
  const at = W(s.x, s.y, s.floorZ), out = [];
  const box = (w, h, d, r, mat, x, y, z, rz = 0) => { const m = mesh(new RoundedBoxGeometry(d, h, w, 3, r), mat, "seat"); m.position.set(at.x + x, at.y + y, at.z + z); m.rotation.z = rz; out.push(m); return m; };
  box(0.36, 0.2, 0.36, 0.03, M.frame, 0.02, 0.1, 0);
  box(0.46, 0.1, 0.48, 0.04, M.cushion, 0.03, 0.25, 0);
  box(0.46, 0.7, 0.11, 0.04, M.fabric, -0.21, 0.62, 0, 0.21);
  box(0.26, 0.17, 0.1, 0.04, M.cushion, -0.29, 1.03, 0, 0.21);
  return out;
}
/* The battery pack (drawn): a casing with a high-voltage band. */
function packMeshes(p, M, W) {
  const at = W(p.x, p.y, p.z);
  const body = mesh(new RoundedBoxGeometry(p.l, p.h, p.w, 3, 0.03), M.casing, "pack"); body.position.copy(at);
  const band = mesh(new THREE.BoxGeometry(p.l * 1.004, p.h * 0.18, p.w * 1.004), M.hv, "pack-band"); band.position.copy(at).add(new THREE.Vector3(0, p.h * 0.3, 0));
  const ribs = [];
  for (let i = 1; i < 6; i++) { const r = mesh(new THREE.BoxGeometry(0.012, p.h * 0.62, p.w * 1.01), M.dark, "pack-rib"); r.position.copy(at).add(new THREE.Vector3(-p.l / 2 + (i * p.l) / 6, -p.h * 0.1, 0)); ribs.push(r); }
  return [body, band, ...ribs];
}
/* An assembly stand (drawn): base, two posts and a padded cradle whose
   top is the fuselage's underside at that station. */
function standObj(s, M, W, zG) {
  const g = new THREE.Group(), top = s.topZ - zG, at = W(s.x, 0, zG), wide = Math.max(0.5, s.w * 0.7);
  const base = mesh(new THREE.BoxGeometry(0.55, 0.05, wide + 0.3), M.stand); base.position.set(at.x, 0.025, 0); g.add(base);
  for (const z of [-wide / 2 + 0.05, wide / 2 - 0.05]) { const p = mesh(new THREE.CylinderGeometry(0.035, 0.04, top - 0.1, 16), M.stand); p.position.set(at.x, (top - 0.1) / 2 + 0.05, z); g.add(p); }
  const cradle = mesh(new THREE.BoxGeometry(0.34, 0.06, wide), M.stand); cradle.position.set(at.x, top - 0.08, 0); g.add(cradle);
  const pad = mesh(new THREE.BoxGeometry(0.36, 0.05, wide * 0.9), M.pad); pad.position.set(at.x, top - 0.025, 0); g.add(pad);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
/* A person 1.8 m tall (drawn), feet at y = 0, facing +x. */
export const PERSON_HEIGHT_M = 1.8;
function personObj(M) {
  const g = new THREE.Group(); g.name = "person";
  const cap = (r, h, mat, x, y, z, sx = 1, sz = 1) => { const m = mesh(new THREE.CapsuleGeometry(r, h - 2 * r, 6, 16), mat); m.position.set(x, y, z); m.scale.set(sx, 1, sz); g.add(m); return m; };
  for (const z of [-0.1, 0.1]) { cap(0.075, 0.9, M.skin, 0, 0.47, z); const b = mesh(new RoundedBoxGeometry(0.26, 0.09, 0.12, 2, 0.03), M.boots); b.position.set(0.04, 0.045, z); g.add(b); }
  cap(0.165, 0.66, M.vest, 0, 1.18, 0, 0.72, 1.12);
  for (const z of [-0.25, 0.25]) cap(0.055, 0.64, M.skin, 0, 1.14, z);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 12), M.skin); neck.position.y = 1.53; g.add(neck);
  const head = mesh(new THREE.SphereGeometry(0.105, 24, 16), M.skin); head.position.y = 1.67; g.add(head);
  const hat = mesh(new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.helmet); hat.position.y = PERSON_HEIGHT_M - 0.118; g.add(hat);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function disposeGroup(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
  });
}
