/* =====================================================================
   GEOMETRY AND EXPORT GATE
   =====================================================================
   Three properties, each of which has already caught a real defect:

   1. NO ROTOR OVERLAPS ANOTHER. The NASA sponson arrangement carries exactly
      two rotors a side; asking it to carry five put 2.37 m discs 0.19 m apart.
      Rotors are now spaced by what the discs need and the layout switches to a
      spanwise row when a sponson cannot hold them, so an intersecting rotor
      array cannot be drawn or exported.

   2. THE EXPORT AND THE VIEW ARE THE SAME AIRCRAFT. engine/export/vsp3.js used
      to compute its OWN stations while three comments claimed it shared
      engine/geometry.js. They disagreed in substance — tip rotors on the
      wingtip against 4% outboard of it — so the .vsp3 a user downloaded was a
      different aeroplane from the one on screen.

   3. EVERY GEOM IS NAMED. The exporter emitted `<n>` where OpenVSP reads
      `<Name>`, so every geom of every file it ever produced arrived unnamed.
      Invisible, because the shapes still drew.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { generateVSP3File } from "../src/export/vsp3.js";
import * as CFG from "../src/engine/configuration.js";
import { buildMesh, PALETTE, tiltAngleRad, tiltPt } from "../src/engine/mesh.js";
import { CG_STATIONS } from "../src/engine/cg.js";

const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const CASES = [["hybrid",[6,8,12]], ["tiltrotor",[4,6]], ["liftcruise",[4,6,8]],
               ["hybridPusher",[6,8]], ["multicopter",[4,6,8]], ["sideBySide",[2]]];

/* COAXIAL cases, run through every geometric check the coplanar ones face.
   A contra-rotating pair is COINCIDENT IN PLAN by construction, so the
   rotor-overlap test has to know the difference between two rotors sharing a
   station on purpose and two rotors fouling each other. */
const COAX_CASES = [["multicopter", [4, 6, 8]]];
const coaxParams = (cfg, n) => ({ ...B, configType: cfg, nPropHover: n,
                                  rotorArrangement: "coaxial" });

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};
console.log("GEOMETRY & EXPORT GATE");

/* ── 1. no rotor overlaps another, on any layout at any count ─────────── */
let worstRatio = Infinity, worstAt = "";
for (const [cfg, ns] of CASES) for (const n of ns) {
  const p = { ...B, configType: cfg, nPropHover: n };
  const g = aircraftGeometry(p, runSizing(p));
  const rs = g.bodies.filter(b => b.kind === "rotor");
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const d = Math.hypot(rs[i].x - rs[j].x, rs[i].y - rs[j].y);
    const need = rs[i].radius + rs[j].radius;
    if (need > 0 && d / need < worstRatio) { worstRatio = d / need; worstAt = `${cfg} n=${n}`; }
  }
}
check(worstRatio >= 1.0, "no rotor overlaps another, across every layout and rotor count",
  `tightest ${worstRatio.toFixed(3)} x (disc sum) on ${worstAt}`);

/* ── 1b. NOTHING FLOATS ────────────────────────────────────────────────
   Every body must be reachable from the FUSELAGE through touching structure.
   This is the check that would have caught the worst defect in this viewer:
   rotors were placed at 0.221 x fuselage LENGTH — a height scaled by a length —
   which put the whole rotor plane 1.3 m above a wing it was supposed to be
   bolted to, with 0.8 m nacelle stubs that reached nothing and two booms at
   stations no rotor occupied. Twelve propellers hanging in space.

   Reachability, not proximity: a pod that touches a rotor but nothing else is
   still floating, and only a path back to the airframe proves otherwise. */
function aabb(b) {
  const mm = (a, c) => [Math.min(a, c), Math.max(a, c)];
  if (b.stations) {
    /* THE BOX MUST INCLUDE THE SECTION OFFSETS. Each station carries a dz —
       OpenVSP's ZLocPercent, which is how RAVEN lifts its tail boom above the
       cabin centreline — and this box ignored it, taking z as b.z +/- maxH/2.
       Once the fuselage carried RAVEN's real profile the body's true top was
       0.43 m above the box, so the WING, correctly mounted on the cabin roof,
       was reported as floating. The gate was wrong, not the aircraft. */
    const w = Math.max(...b.stations.map(s => s.w)) / 2;
    const zTop = Math.max(...b.stations.map(s => (s.dz || 0) + s.h / 2));
    const zBot = Math.min(...b.stations.map(s => (s.dz || 0) - s.h / 2));
    const [x0, x1] = mm(b.x0, b.x1);
    return { x: [x0, x1], y: [b.y - w, b.y + w], z: [b.z + zBot, b.z + zTop] };
  }
  if (b.kind === "wing") {
    const t = Math.max(b.rootChord, b.tipChord) * (b.thickRatio || 0.12) / 2;
    const sw = Math.tan((b.sweepDeg || 0) * Math.PI / 180) * b.span / 2;
    return { x: [b.x, b.x + b.rootChord + Math.max(0, sw)],
             y: [-b.span / 2, b.span / 2], z: [b.z - t, b.z + t] };
  }
  if (b.kind === "vtail") {
    /* A V-TAIL IS A V. Its panels run from the root out at the dihedral, so it
       is span*cos(g) wide and span*sin(g) tall. The first version of this check
       used span in BOTH — a box so oversized it overlapped nearly everything,
       which is why it reported "no floating parts" while the tail was visibly
       hanging off the aeroplane. */
    const g = (b.dihedralDeg || 45) * Math.PI / 180;
    const t = Math.max(b.rootChord, b.tipChord) * (b.thickRatio || 0.10) / 2;
    const sw = Math.tan((b.sweepDeg || 0) * Math.PI / 180) * b.span;
    return { x: [b.x, b.x + b.rootChord + Math.max(0, sw)],
             y: [-b.span * Math.cos(g), b.span * Math.cos(g)],
             z: [b.z - t, b.z + b.span * Math.sin(g) + t] };
  }
  /* A FIN is a half surface standing on one side of its root — vertical, so
     its span is a HEIGHT. A negative span hangs it below (the ventral fin).
     A STABILATOR is a full-span horizontal surface like a small wing. Without
     these cases aabb returned null and both read as floating the moment the
     conventional tail was drawn — the same gap the wheel kind had. */
  if (b.kind === "vfin") {
    const t = Math.max(b.rootChord, b.tipChord) * (b.thickRatio || 0.10) / 2;
    const sw = Math.tan((b.sweepDeg || 0) * Math.PI / 180) * Math.abs(b.span);
    const [z0, z1] = mm(b.z, b.z + b.span);
    return { x: [b.x, b.x + b.rootChord + Math.max(0, sw)],
             y: [-t, t], z: [z0, z1] };
  }
  if (b.kind === "htail") {
    const t = Math.max(b.rootChord, b.tipChord) * (b.thickRatio || 0.10) / 2;
    const sw = Math.tan((b.sweepDeg || 0) * Math.PI / 180) * b.span / 2;
    return { x: [b.x, b.x + b.rootChord + Math.max(0, sw)],
             y: [-b.span / 2, b.span / 2], z: [b.z - t, b.z + t] };
  }
  if (b.kind === "boom") {
    const r = b.radius || 0.1;
    const [x0, x1] = mm(b.x0, b.x1), [y0, y1] = mm(b.y0 ?? b.y, b.y);
    const [z0, z1] = mm(b.z0 ?? b.z, b.z);
    return { x: [x0 - r, x1 + r], y: [y0 - r, y1 + r], z: [z0 - r, z1 + r] };
  }
  if (b.quad) {
    /* control surfaces carry their four corners; the box round them is exact
       enough, since a control surface IS a thin quadrilateral */
    const xs = b.quad.map(q => q[0]), ys = b.quad.map(q => q[1]), zs = b.quad.map(q => q[2]);
    const t = 0.03;
    return { x: [Math.min(...xs), Math.max(...xs)],
             y: [Math.min(...ys), Math.max(...ys)],
             z: [Math.min(...zs) - t, Math.max(...zs) + t] };
  }
  /* A WHEEL is a disc about the lateral axis: its tyre radius in x and z, its
     section width in y. Without this case aabb returned null for the kind and
     every wheel read as floating the moment the gear was first drawn — the
     gate cannot see a body whose shape it has no box for. */
  if (b.kind === "wheel") {
    const r = b.radius || 0.25, hw = (b.width || 0.15) / 2;
    return { x: [b.x - r, b.x + r], y: [b.y - hw, b.y + hw], z: [b.z - r, b.z + r] };
  }
  if (b.kind === "rotor" || b.kind === "pusher")
    return { x: [b.x - b.radius * 0.12, b.x + b.radius * 0.12],
             y: [b.y - b.radius, b.y + b.radius], z: [b.z - b.radius, b.z + b.radius] };
  return null;
}
const touches = (A, C, tol = 0.02) => A && C &&
  A.x[0] <= C.x[1] + tol && C.x[0] <= A.x[1] + tol &&
  A.y[0] <= C.y[1] + tol && C.y[0] <= A.y[1] + tol &&
  A.z[0] <= C.z[1] + tol && C.z[0] <= A.z[1] + tol;
/* A ROTOR DISC IS NOT STRUCTURE. Nothing hangs off a propeller, so a rotor may
   BE attached but can never make anything else attached. Allowing it let a
   V-tail count as connected because its box grazed a lift-rotor disc. */
const carries = (b) => b.kind !== "rotor" && b.kind !== "pusher";

/* ── THE AUTHORED POSE IS NOT A POSE THE AIRCRAFT EVER HOLDS ──────────
   A tilting installation is authored in two attitudes at once: the lofted
   nacelle in airplane mode, the stack, members and disc in hover (see
   tiltAngleRad in mesh.js, which is now the single place that rule lives).
   Testing the authored numbers therefore asks whether a hover stack touches
   an airplane-mode nacelle — and the answer is no for ANY design, so the
   check was reporting a defect of its own making.

   THE FIX ALSO MAKES THE TEST STRONGER. Posing the bodies means connectivity
   can be demanded at BOTH ends of the travel, so a nacelle that reaches its
   wing in hover but leaves it in cruise now fails. It is checked at 0 and 90
   degrees only, and that is deliberate: at multiples of 90 a rotation maps an
   axis-aligned box to an axis-aligned box EXACTLY, while at intermediate
   angles re-bounding an AABB inflates it and could manufacture a contact that
   is not there. A test that invents connections is worse than none. */
const posedBox = (b, g, tiltDeg) => {
  const box = aabb(b);
  if (!box || !b.tilting) return box;
  /* A lofted nacelle carries no hinge of its own; it turns about its rotor's,
     exactly as mesh.js finds it. Same lookup, so the two cannot drift. */
  const pivot = b.hinge || (() => {
    const owner = String(b.label || "").replace(/ nacelle$/, "");
    const m = (g.bodies || []).find(o => o.kind === "rotor" && (o.label || "") === owner);
    return m && (m.hinge || m);
  })();
  if (!pivot) return box;
  const a = tiltAngleRad(b, tiltDeg);
  const X = [Infinity, -Infinity], Y = [Infinity, -Infinity], Z = [Infinity, -Infinity];
  for (const cx of box.x) for (const cy of box.y) for (const cz of box.z) {
    const [px, py, pz] = tiltPt(cx - pivot.x, cy - pivot.y, cz - pivot.z,
                                pivot.x, pivot.y, pivot.z, a);
    X[0] = Math.min(X[0], px); X[1] = Math.max(X[1], px);
    Y[0] = Math.min(Y[0], py); Y[1] = Math.max(Y[1], py);
    Z[0] = Math.min(Z[0], pz); Z[1] = Math.max(Z[1], pz);
  }
  return { x: X, y: Y, z: Z };
};

let floatTotal = 0, floatAt = "";
for (const [cfg, ns] of CASES) for (const n of ns) for (const tilt of [90, 0]) {
  const p = { ...B, configType: cfg, nPropHover: n };
  const g = aircraftGeometry(p, runSizing(p));
  const boxes = g.bodies.map(b => posedBox(b, g, tilt));
  const att = g.bodies.map(b => b.kind === "fuselage");
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (let i = 0; i < g.bodies.length; i++) {
      if (att[i]) continue;
      for (let j = 0; j < g.bodies.length; j++)
        if (i !== j && att[j] && carries(g.bodies[j]) && touches(boxes[i], boxes[j]))
          { att[i] = true; changed = true; break; }
    }
    if (!changed) break;
  }
  const loose = g.bodies.filter((_, i) => !att[i]);
  if (loose.length) {
    floatTotal += loose.length;
    if (!floatAt) floatAt = `${cfg} n=${n} at ${tilt} deg: `
      + loose.slice(0, 3).map(b => b.label || b.kind).join(", ");
  }
}
check(floatTotal === 0, "every body is structurally connected back to the fuselage",
  floatTotal ? `${floatTotal} floating — ${floatAt}`
    : "no floating parts in any layout, in HELICOPTER mode and in AIRPLANE mode "
      + "— the installation stays attached through the conversion, not just as authored");

/* ── 1c. NO PART PASSES THROUGH ANOTHER ───────────────────────────────
   The geometry reports its own interferences in 3D — disc against disc, the
   pusher against the V-tail, and any disc reaching down into the wing box —
   so a picture cannot quietly show a propeller cutting through a tail.

   Both of these checks had bugs of their own that this caught: a LIFT rotor
   turns in the horizontal plane and has almost no extent in z, so treating
   every disc as a sphere flagged every boom-mounted rotor as cutting the wing;
   and a V-tail panel is a RAY from its root, not an infinite line, so measuring
   to the line reported a foul whenever the tail was mounted above the
   propeller — where the line continues down through the disc but the aeroplane
   does not. */
{
  let total = 0, first = "";
  const mismatches = [];
  for (const [cfg, ns] of CASES) for (const n of ns) {
    const p = { ...B, configType: cfg, nPropHover: n };
    const g = aircraftGeometry(p, runSizing(p));
    total += g.collisions.length;
    if (!first && g.collisions.length)
      first = `${cfg} n=${n}: ${g.collisions[0].kind} ${g.collisions[0].a}/${g.collisions[0].b}`;
    if (g.boomCountMismatch)
      mismatches.push(`${cfg} n=${n}: ${g.boomCountMismatch.boomsNeeded} needed vs `
                    + `${g.boomCountMismatch.boomsSized} sized`);
  }
  check(total === 0, "no part passes through another, in any layout",
    total ? `${total} interference(s) — ${first}` : "clean across every configuration");

  /* THE AIRFRAME AND THE BOOMS THAT WERE WEIGHED MUST BE THE SAME STRUCTURE.
     configuration.js used to return a fixed boomCount of 2 for every winged
     layout, decided from the total rotor count before the stopped/tilting split
     was known. It reproduced the references only while four rotors rode booms;
     at twelve it asked two booms to carry ten, so the aircraft drawn was not
     the one the boom mass was computed for. Both sides now derive the count the
     same way — two rotors per boom, mirrored pairs — and this asserts they
     agree rather than merely reporting when they do not. */
  check(mismatches.length === 0,
    "the drawn boom count matches the one the boom mass was sized on",
    mismatches.length ? mismatches.join("; ") : "agreed on every layout");
}

/* ── 2. the export carries EXACTLY the geometry's rotor stations ──────── */
let maxDev = 0, devAt = "";
for (const [cfg, ns] of CASES) for (const n of ns) {
  const p = { ...B, configType: cfg, nPropHover: n };
  const R = runSizing(p);
  const g = aircraftGeometry(p, R);
  const xml = generateVSP3File(p, R);
  for (const r of g.bodies.filter(b => b.kind === "rotor")) {
    /* Find this rotor by name in the file and compare its station. */
    const i = xml.indexOf(`<Name>${r.label}</Name>`);
    if (i < 0) { maxDev = Infinity; devAt = `${cfg} n=${n}: "${r.label}" missing`; continue; }
    const seg = xml.slice(i, i + 2600);
    const gx = (k) => {
      const m = seg.match(new RegExp(`<${k} Value="([-0-9.eE+]+)"`));
      return m ? parseFloat(m[1]) : NaN;
    };
    for (const [k, want] of [["X_Location", r.x], ["Y_Location", r.y], ["Z_Location", r.z]]) {
      const dev = Math.abs(gx(k) - want);
      if (!(dev <= 1e-6)) { if (!(dev <= maxDev)) { maxDev = dev; devAt = `${cfg} n=${n} ${r.label} ${k}`; } }
    }
  }
}
check(maxDev <= 1e-6, "every exported rotor sits where the 3D view puts it",
  isFinite(maxDev) ? `worst deviation ${maxDev.toExponential(1)} m` : devAt);

/* ── 3. every geom in the file is named, the way OpenVSP reads them ───── */
{
  const p = { ...B, configType: "hybrid", nPropHover: 12 };
  const xml = generateVSP3File(p, runSizing(p));
  check(!/<n>/.test(xml) && /<Name>/.test(xml),
    "geom names use <Name>, which is what OpenVSP reads",
    `${(xml.match(/<Name>/g) || []).length} named, ${(xml.match(/<n>/g) || []).length} legacy`);
  check((xml.match(/<Geom>/g) || []).length === (xml.match(/<\/Geom>/g) || []).length,
    "the exported XML is balanced",
    `${(xml.match(/<Geom>/g) || []).length} geoms`);
}

/* ── 4. THE AIRCRAFT THE USER ACTUALLY SEES ───────────────────────────
   Everything above sweeps rotor counts at one rotor diameter. The app applies
   each configuration's OWN published design point when the layout is selected,
   which is a different aircraft — a multicopter gets 8.3 m rotors off a 3.0
   lb/ft^2 disk loading, a side-by-side 10.9 m. Checking only the sweep missed
   that, so the six real configurations are checked as the app builds them. */
{
  const appCase = (key) => {
    const d = CFG.CONFIG_DEFAULTS[key];
    const p = { ...B, configType: key, nPropHover: d.nRotors,
      /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
      vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
      etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
      twRatio: Math.max(1.30, CFG.oeiThrustMarginFor(key, d.nRotors) ?? 1.30),
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}),
    ...(d.fusFineness ? { fusLen: +(d.fusFineness * (B.fusDiam ?? 1.65)).toFixed(2) } : {}) };
    return { ...p, range: 100 + 0.76 * p.vCruise * 20 * 60 / 1000 };
  };
  let bad = [], asym = [], below = [], miscount = [], loose = [];
  for (const key of Object.keys(CFG.CONFIGURATIONS)) {
    const p = appCase(key);
    const g = aircraftGeometry(p, runSizing(p));
    if (g.collisions.length) bad.push(`${key}: ${g.collisions[0].kind}`);
    /* EXACTLY THE ROTORS THE AIRCRAFT WAS SIZED WITH. The placement used to
       fill every boom station it found rather than take the number required, so
       a six-rotor lift+cruise was DRAWN WITH EIGHT and a six-rotor hybrid got a
       2/4 tilt-lift split where the configuration says 3/3. Rotors invented and
       mis-typed is what an uneven pattern on screen actually is, and nothing
       here was checking the count. */
    const nDrawn = g.bodies.filter(b2 => b2.kind === "rotor").length;
    if (nDrawn !== p.nPropHover)
      miscount.push(`${key}: drew ${nDrawn} of ${p.nPropHover}`);
    /* Connectivity at the app's own design points, not just the sweep — the
       sweep uses one rotor diameter and missed a floating pusher, floating
       outboard wing rotors and a tail hanging off the back. */
    /* POSED, AND AT BOTH ENDS OF THE TRAVEL — the same fix the harness above
       already carries. This was its twin and was left on raw boxes, so it
       compared a hover-authored stack against an airplane-authored nacelle and
       reported a tilting installation as floating whenever the two authored
       frames happened not to overlap. Two checks of the same property must
       pose the same way or one of them is measuring an aircraft that never
       exists. */
    const lo = [];
    for (const tilt of [90, 0]) {
      const bx = g.bodies.map(b2 => posedBox(b2, g, tilt));
      const at = g.bodies.map(b2 => b2.kind === "fuselage");
      for (let k = 0; k < 20; k++) {
        let ch = false;
        for (let i2 = 0; i2 < g.bodies.length; i2++) {
          if (at[i2]) continue;
          for (let j2 = 0; j2 < g.bodies.length; j2++)
            if (i2 !== j2 && at[j2] && carries(g.bodies[j2]) && touches(bx[i2], bx[j2]))
              { at[i2] = true; ch = true; break; }
        }
        if (!ch) break;
      }
      for (const b2 of g.bodies.filter((_, i2) => !at[i2]))
        if (!lo.includes(b2)) lo.push(b2);
    }
    if (lo.length) loose.push(`${key}: ${lo.slice(0,2).map(b2 => b2.label || b2.kind).join(", ")}`);
    const rot = g.bodies.filter(b2 => b2.kind === "rotor");
    /* Left/right mirror — an asymmetric aeroplane is visibly wrong and no
       reference aircraft is one. */
    const sym = rot.every(r => Math.abs(r.y) < 1e-6 || rot.some(o =>
      Math.abs(o.y + r.y) < 1e-3 && Math.abs(o.x - r.x) < 1e-3 && Math.abs(o.z - r.z) < 1e-3));
    if (!sym) asym.push(key);
    /* The V-tail root belongs on the UPPER body. Scaling its height by rotor
       diameter once drove it to −0.16 m — under the fuselage. */
    const vt = g.bodies.find(b2 => b2.kind === "vtail");
    if (vt && vt.z < 0) below.push(`${key}: vtail z ${vt.z.toFixed(2)}`);
  }
  check(bad.length === 0, "no interference in any configuration as the app builds it",
    bad.length ? bad.join("; ") : "all six clean at their own design points");
  check(asym.length === 0, "every configuration is left/right symmetric",
    asym.length ? asym.join(", ") : "all six mirrored");
  check(below.length === 0, "the V-tail root sits on the upper body, never under it",
    below.length ? below.join("; ") : "above the centreline in every layout");
  check(miscount.length === 0,
    "every configuration draws exactly the rotors it was sized with",
    miscount.length ? miscount.join("; ") : "counts match in all six");
  check(loose.length === 0,
    "nothing floats at the app's own design points",
    loose.length ? loose.join("; ") : "all six fully connected");
}

/* ── EVERY WING-MOUNTED STRUT FOOT LANDS ON REAL WING ──────────────────
   WHY A SECOND CONNECTIVITY CHECK EXISTS.

   The connectivity check above works on axis-aligned bounding boxes, and a
   swept, tapered wing fills its bounding box very badly. The box spans from
   the ROOT leading edge to the TIP trailing edge, so a large wedge of empty
   air ahead of the outboard wing is inside the box. A strut whose foot lands
   in that wedge touches nothing and the AABB test still says "connected".

   That is not hypothetical. The wingtip rotor pylons computed their foot from
   the ROOT leading edge and the ROOT chord; at y = 0.97 b/2 on a 9.6 deg swept
   wing the local leading edge has moved 2.06 m aft, so the foot sat 1.09 m
   ahead of the wing. It was inside the bounding box, the gate passed, and the
   tip rotors were visibly floating in the viewer.

   This check uses the ACTUAL PLANFORM: local leading edge from the sweep,
   local chord from the taper. It is the geometric statement the AABB test was
   only approximating. */
{
  const offWing = [];
  for (const [cfg, ns] of CASES) for (const n of ns) {
    const p = { ...B, configType: cfg, nPropHover: n };
    const g = aircraftGeometry(p, runSizing(p));
    const w = g.bodies.find(b => b.kind === "wing");
    if (!w || !(w.span > 0)) continue;
    const half = w.span / 2;
    const leAt = y => w.x + Math.abs(y) * Math.tan((w.sweepDeg || 0) * Math.PI / 180);
    const cAt  = y => w.rootChord + (w.tipChord - w.rootChord) * Math.min(1, Math.abs(y) / half);
    const booms = g.bodies.filter(b => b.kind === "boom" && !/pylon/i.test(b.label || ""));
    /* A foot that lands on a BOOM is correctly attached - the boom carries it
       to the wing. Only feet that land on nothing else are held to the wing
       planform, which is what makes this test specific rather than noisy. */
    const onABoom = (fx, fy, fz) => booms.some(bm => {
      const r = (bm.radius || 0) + 0.05;
      const by = bm.y, bz = bm.z, bz0 = bm.z0 ?? bm.z;
      return Math.abs(fy - by) <= r
          && fx >= Math.min(bm.x0, bm.x1) - r && fx <= Math.max(bm.x0, bm.x1) + r
          && fz >= Math.min(bz, bz0) - r && fz <= Math.max(bz, bz0) + r;
    });
    const thick = Math.max(0.08, (w.thickRatio || 0.15) * w.rootChord * 0.5);
    for (const b of g.bodies) {
      if (b.kind !== "boom" || !/pylon/i.test(b.label || "")) continue;
      /* the foot is the LOWER end of the strut: the end nearer the airframe */
      const z0 = b.z0 ?? b.z, z1 = b.z;
      const footIsLow = z0 <= z1;
      const fz = footIsLow ? z0 : z1;
      const fx = footIsLow ? (b.x1 ?? b.x0) : (b.x0 ?? b.x1);
      const fy = b.y0 != null && !footIsLow ? b.y0 : b.y;
      if (onABoom(fx, fy, fz)) continue;                      // carried by a boom
      if (Math.abs(fz - w.z) > thick) continue;               // not a wing foot
      if (Math.abs(fy) > half + 1e-6) continue;               // outboard of the tip
      const le = leAt(fy), te = le + cAt(fy);
      if (fx < le - 1e-6 || fx > te + 1e-6) {
        const gap = fx < le ? le - fx : fx - te;
        offWing.push(`${cfg} n=${n} ${b.label}: foot x=${fx.toFixed(2)} at y=${fy.toFixed(2)}, ` +
                     `wing there is ${le.toFixed(2)}..${te.toFixed(2)} (off by ${gap.toFixed(2)} m)`);
      }
    }
  }
  check(offWing.length === 0,
    "every wing-mounted strut foot lies between the LOCAL leading and trailing edges",
    offWing.length ? offWing.join("; ") : "sweep and taper respected on every layout");
}

/* ── EVERY MOUNTED THING, ON EVERY SURFACE, AT ITS OWN SPAN STATION ────
   THE GENERALISATION OF THE CHECK ABOVE, AND WHY IT HAD TO BE WRITTEN.

   The check above states the right invariant and then applies it to exactly
   one surface and one kind of part: `kind === "wing"` carrying `/pylon/`
   struts. The V-tail is the same geometry — swept 34.4 deg, tapered 2.5:1 —
   and it carries a HINGE and a NACELLE rather than a strut. Both filters
   missed it, so when the tail pair's stations were computed from host.x and
   host.rootChord the gate above stayed green while the nacelle hung 0.80 m
   ahead of the panel's local leading edge, attached to nothing.

   That is the FOURTH time this repository has measured a swept surface at
   its root. Each of the first three was fixed where it was found and guarded
   by a check shaped around the instance rather than the class. This one is
   shaped around the class:

     every surface that has a planform  x  every part that claims to be
     mounted on it, held to the LOCAL leading edge and the LOCAL chord.

   A hinge is held to lie strictly inside the local chord: it is a bearing,
   and a bearing outside the structure is not a mechanism. A nacelle is held
   to OVERLAP the local chord, because a nacelle the surface passes through
   is the mounting and a nacelle that grazes it is not — in the defect the
   overlap was 0.05 m of a 0.68 m chord, 7%, which reads as "touching" to any
   bounding-box test and as "floating" to the eye.

   Parts carried by a boom are exempt and skipped, as above: the boom is
   their structure and the connectivity checks cover it. */
{
  const offSurf = [];
  /* LOCAL planform at a lateral station. For the wing and stabilator the
     panel runs straight out, so the run along the panel IS |y|. For a V-tail
     at dihedral gamma the panel is longer than its lateral projection by
     1/cos(gamma), and its surface rises as it goes — measuring the run as |y|
     would read the chord at the wrong station and the height at none. */
  const surfAt = (b, y) => {
    const gam = ((b.dihedralDeg || 0) * Math.PI) / 180;
    const cg = Math.cos(gam) || 1;
    const runMax = b.kind === "vtail" ? b.span : b.span / 2;
    const run = Math.abs(y) / cg;
    if (!(runMax > 0) || run > runMax + 1e-6) return null;
    const f = run / runMax;
    const le = b.x + run * Math.tan(((b.sweepDeg || 0) * Math.PI) / 180);
    const ch = b.rootChord + ((b.tipChord ?? b.rootChord) - b.rootChord) * f;
    return { le, te: le + ch, ch, z: b.z + run * Math.sin(gam) };
  };

  for (const [cfg, ns] of CASES) for (const n of ns) {
    const p = { ...B, configType: cfg, nPropHover: n };
    const g = aircraftGeometry(p, runSizing(p));
    const D = Number(p.propDiam) || 2.4;
    const surfaces = g.bodies.filter(b =>
      (b.kind === "wing" || b.kind === "htail" || b.kind === "vtail") && b.span > 0);
    if (!surfaces.length) continue;
    const booms = g.bodies.filter(b => b.kind === "boom");
    const onABoom = (x, y, z) => booms.some(bm => {
      const r = (bm.radius || 0) + 0.05, z0 = bm.z0 ?? bm.z;
      return Math.abs(y - bm.y) <= r
        && x >= Math.min(bm.x0, bm.x1) - r && x <= Math.max(bm.x0, bm.x1) + r
        && z >= Math.min(bm.z, z0) - r && z <= Math.max(bm.z, z0) + r;
    });
    /* Which surface is this part mounted on? The one whose LOCAL skin it sits
       at, within the panel's own thickness plus the part stack's stand-off. */
    const hostOf = (x, y, z) => {
      for (const sf of surfaces) {
        const loc = surfAt(sf, y);
        if (!loc) continue;
        const tol = Math.max(0.10, 0.5 * (sf.thickRatio || 0.12) * loc.ch) + 0.02 * D;
        if (Math.abs(z - loc.z) <= tol) return { sf, loc };
      }
      return null;
    };

    /* 1. PIVOTS — strictly inside the local chord. */
    for (const b of g.bodies) {
      if (!b.hinge || b.kind !== "rotor") continue;
      const { x, y, z } = b.hinge;
      if (onABoom(x, y, z)) continue;
      const h = hostOf(x, y, z);
      if (!h) continue;                       // carried by something without a planform
      if (x < h.loc.le - 1e-6 || x > h.loc.te + 1e-6) {
        const gap = x < h.loc.le ? h.loc.le - x : x - h.loc.te;
        offSurf.push(`${cfg} n=${n} ${b.label} pivot x=${x.toFixed(2)} at y=${y.toFixed(2)}: `
          + `${h.sf.kind} there is ${h.loc.le.toFixed(2)}..${h.loc.te.toFixed(2)} `
          + `(off by ${gap.toFixed(2)} m)`);
      }
    }

    /* 2. NACELLES — the surface must PASS THROUGH, not graze. */
    for (const b of g.bodies) {
      if (b.kind !== "nacelle") continue;
      const nx0 = Math.min(b.x0, b.x1), nx1 = Math.max(b.x0, b.x1);
      const y = b.y, z = b.z;
      if (onABoom((nx0 + nx1) / 2, y, z)) continue;
      const h = hostOf((nx0 + nx1) / 2, y, z);
      if (!h) continue;
      const ov = Math.min(nx1, h.loc.te) - Math.max(nx0, h.loc.le);
      const need = 0.25 * Math.min(h.loc.ch, nx1 - nx0);
      if (!(ov >= need))
        offSurf.push(`${cfg} n=${n} ${b.label} x=${nx0.toFixed(2)}..${nx1.toFixed(2)} `
          + `at y=${y.toFixed(2)}: ${h.sf.kind} there is ${h.loc.le.toFixed(2)}..`
          + `${h.loc.te.toFixed(2)}, overlap ${ov.toFixed(2)} m of a needed ${need.toFixed(2)} m`);
    }
  }
  check(offSurf.length === 0,
    "every pivot and nacelle is measured at its OWN span station, on every surface",
    offSurf.length ? offSurf.join("; ")
      : "wing, stabilator and V-tail all held to their local leading edge and local "
      + "chord — the check above did this for the wing alone, and the V-tail defect "
      + "walked through the gap");
}

/* ── CONTROL SURFACES MATCH THE RAVEN FILE ─────────────────────────────
   The placements come from the SS_Control sub-surfaces of RAVEN's own
   .vsp3. These checks assert the properties that make them a layout rather
   than four numbers, so a later edit cannot quietly break the reasoning. */
{
  const { RAVEN_CONTROLS, NASA_LAYOUT } = await import("../src/engine/geometry.js");
  const W = RAVEN_CONTROLS.wing;
  const inb = W.find(c => c.name === "Flap inboard");
  const outb = W.find(c => c.name === "Flap outboard");
  const ail = W.find(c => c.name === "Aileron");

  /* THE HEADLINE: the flap gap exists because the boom is in it. The boom
     station was measured from the geom positions and the flap ends from the
     sub-surfaces - two independent reads of the same file. If they ever stop
     agreeing, one of them has been edited on a guess. */
  const gapMid = (inb.eta1 + outb.eta0) / 2;
  const boom = NASA_LAYOUT.boomYoverHalfSpan;
  check(Math.abs(gapMid - boom) < 0.01,
    "the inboard/outboard flap gap is centred on the boom station",
    `gap ${inb.eta1}..${outb.eta0} centre ${gapMid.toFixed(4)} vs boom ${boom} ` +
    `(difference ${Math.abs(gapMid - boom).toFixed(4)} of half span)`);

  check(inb.eta1 < outb.eta0 && outb.eta1 <= ail.eta0,
    "wing control surfaces are ordered and do not overlap",
    `${inb.eta0}-${inb.eta1}, ${outb.eta0}-${outb.eta1}, ${ail.eta0}-${ail.eta1}`);
  check(Math.abs(ail.eta1 - 1) < 1e-9,
    "the aileron runs out to the wing tip", `ends at eta ${ail.eta1}`);
  check(W.every(c => c.chord > 0 && c.chord < 0.6),
    "every control surface chord is a sane fraction of the local chord",
    W.map(c => `${c.name} ${(100 * c.chord).toFixed(1)}%`).join(", "));

  /* and they must actually appear on the aircraft the app draws */
  const missing = [];
  for (const [cfg, ns] of CASES) for (const n of ns) {
    const p = { ...B, configType: cfg, nPropHover: n };
    const g = aircraftGeometry(p, runSizing(p));
    if (!g.bodies.some(b => b.kind === "wing")) continue;
    const cs = g.bodies.filter(b => b.kind === "control" && b.surface === "wing");
    /* COUNTING BODIES IS THE WRONG TEST NOW. A surface is CUT at every boom —
       RAVEN splits its flap around its single boom and this tool applies the
       same rule to layouts with three — so a twelve-rotor hybrid legitimately
       carries ten wing surfaces where RAVEN carries six. What must hold is
       that each KIND still exists on each side, and that the sides match. */
    for (const side of [-1, 1]) {
      const mine = cs.filter(b => b.side === side);
      for (const kind of ["flap", "aileron"])
        if (!mine.some(b => b.ctrlKind === kind))
          missing.push(`${cfg} n=${n}: no ${kind} on side ${side}`);
    }
    const nL = cs.filter(b => b.side === -1).length, nR = cs.filter(b => b.side === 1).length;
    if (nL !== nR) missing.push(`${cfg} n=${n}: ${nL} left vs ${nR} right`);
  }
  check(missing.length === 0,
    "every winged layout carries flaps and an aileron on each side, symmetrically",
    missing.length ? missing.join("; ")
      : "each kind present both sides on every winged layout; counts differ by "
        + "layout because surfaces are cut around every boom, as RAVEN cuts its flap");
}

/* ── THE EXPORT CARRIES THE CONTROL SURFACES ───────────────────────────
   The exporter wrote `<SubSurfaces/>` on every wing it ever produced, so a
   model opened in OpenVSP had no flap, aileron or rudder to deflect and
   nothing for VSPAERO to hinge. This asserts they survive the round trip and
   arrive with RAVEN's own span fractions, not merely that the tag is there. */
{
  const { RAVEN_CONTROLS } = await import("../src/engine/geometry.js");
  const p = { ...B, configType: "liftcruise", nPropHover: 6 };
  const xml = generateVSP3File(p, runSizing(p));
  const nCtrl = (xml.match(/<SubSurfaceInfo><Type>3<\/Type><\/SubSurfaceInfo>/g) || []).length;
  const want = RAVEN_CONTROLS.wing.length + RAVEN_CONTROLS.vtail.length;
  check(nCtrl >= want,
    "the exported .vsp3 carries every control surface as an SS_Control",
    `${nCtrl} against RAVEN's ${want} (flaps + aileron + rudder); more when a `
    + "layout's booms cut a surface into segments");

  /* THE ENVELOPE IS RAVEN'S; THE CUTS INSIDE IT ARE THE LAYOUT'S.
     Asserting the exact set of eta values only held for a layout with RAVEN's
     single boom pair. Asserting that each RAVEN start SURVIVES is also wrong:
     where a boom sits on RAVEN's flap start, the flap legitimately cannot
     begin there — you cannot hinge a surface through a boom.

     What must hold is that no control surface reaches INBOARD of RAVEN's
     inboard-most station or OUTBOARD of its tip: the surfaces live inside the
     span RAVEN gave them, cut wherever this layout's booms fall. Anything
     outside that envelope is invented control authority. */
  const starts = [...xml.matchAll(/<EtaStart Value="([0-9.eE+-]+)"/g)].map(m => +m[1]);
  const ends = [...xml.matchAll(/<EtaEnd Value="([0-9.eE+-]+)"/g)].map(m => +m[1]);
  const rMin = Math.min(...[...RAVEN_CONTROLS.wing, ...RAVEN_CONTROLS.vtail].map(c => c.eta0));
  const rMax = Math.max(...[...RAVEN_CONTROLS.wing, ...RAVEN_CONTROLS.vtail].map(c => c.eta1));
  const outside = [
    ...starts.filter(e => e < rMin - 1e-6).map(e => `start ${e.toFixed(4)} < ${rMin}`),
    ...ends.filter(e => e > rMax + 1e-6).map(e => `end ${e.toFixed(4)} > ${rMax}`),
  ];
  check(outside.length === 0,
    "every control surface lies inside RAVEN's measured span envelope",
    outside.length ? outside.join("; ")
      : `${starts.length} surfaces, all within eta ${rMin}..${rMax} — cut around `
        + "this layout's booms, never reaching past the span RAVEN gave them");

  /* one per surface, not one per side: the geom is a mirrored half wing */
  check(!/<Name>[^<]*_L<\/Name>/.test(xml),
    "controls are exported once and mirrored, never duplicated per side",
    "no left-hand duplicates in the file");
}

/* ── NO ROTOR HUB IS EMBEDDED IN THE SURFACE IT IS MOUNTED ON ──────────
   Every rotor on this aircraft stands off its structure by the part stack
   (hubAbove: blade clearance + structure radius + margin). One placement
   skipped it — the tiltrotor's rear pair, mounted on the V-tail, had its hub
   at the point ON the panel, standoff 0.000 m. In hover the disc plane then
   passes straight through the tail, i.e. the blades cut it off.

   The existing overlap gate could not see this: it compares rotor hubs with
   OTHER ROTOR hubs, so a rotor buried in a wing or a tail is invisible to it.
   This checks rotor against lifting SURFACE. */
{
  const embedded = [];
  for (const [cfg, ns] of CASES) for (const n of ns) {
    const p = { ...B, configType: cfg, nPropHover: n };
    const g = aircraftGeometry(p, runSizing(p));
    const panels = g.bodies.filter(b => b.kind === "wing" || b.kind === "vtail");
    for (const r of g.bodies.filter(b => b.kind === "rotor")) {
      for (const s of panels) {
        const gam = s.kind === "vtail" ? (s.dihedralDeg || 45) * Math.PI / 180 : 0;
        const halfY = s.kind === "wing" ? s.span / 2 : s.span * Math.cos(gam);
        if (halfY <= 0 || Math.abs(r.y) > halfY) continue;
        const eta = Math.abs(r.y) / halfY;
        const le = s.x + Math.abs(r.y) * Math.tan((s.sweepDeg || 0) * Math.PI / 180);
        const c = s.rootChord + (s.tipChord - s.rootChord) * eta;
        const zP = s.kind === "wing" ? s.z : s.z + eta * s.span * Math.sin(gam);
        const thick = Math.max(0.05, (s.thickRatio || 0.12) * c * 0.5);
        /* the disc is a thin plane through the hub: does the surface pass
           through it, inside the disc radius? */
        const chordOverlap = r.x + r.radius > le && r.x - r.radius < le + c;
        if (chordOverlap && Math.abs(r.z - zP) < thick + 0.02)
          embedded.push(cfg + " n=" + n + " " + r.label + ": hub z=" + r.z.toFixed(2) +
            " but " + s.label + " skin is at z=" + zP.toFixed(2) +
            " (standoff " + (r.z - zP).toFixed(3) + " m) and the disc spans its chord");
      }
    }
  }
  check(embedded.length === 0,
    "no rotor disc passes through the surface carrying it",
    embedded.length ? embedded.join("; ")
                    : "every hub stands off its structure by the part stack");
}

/* ── COAXIAL ARRANGEMENT ───────────────────────────────────────────────
   A contra-rotating pair is COINCIDENT IN PLAN by construction, so the
   plan-view overlap test above would report every coaxial aircraft as
   fouling itself. These checks assert the properties that actually define
   the arrangement, and treat a pair as one station.

   [SRC] Yang et al., Aerospace 2024 11:200: N rotors on N/2 arms, both
   discs counted in the disk area, half the booms of a coplanar layout. */
{
  const bad = [];
  for (const [cfg, ns] of COAX_CASES) for (const n of ns) {
    const p = coaxParams(cfg, n);
    const SR = runSizing(p);
    const g = aircraftGeometry(p, SR);
    const rotors = g.bodies.filter(b => b.kind === "rotor");
    const arms = g.bodies.filter(b => b.kind === "boom" && /^Arm/.test(b.label || ""));
    const tag = `${cfg} n=${n} coaxial`;

    /* every rotor the loop sized is drawn, and they come in pairs */
    if (rotors.length !== n) bad.push(`${tag}: drew ${rotors.length} rotors, sized ${n}`);
    if (arms.length !== n / 2) bad.push(`${tag}: ${arms.length} arms, expected ${n / 2}`);
    if (SR.rotorArrangement !== "coaxial") bad.push(`${tag}: engine reports ${SR.rotorArrangement}`);
    if (!(SR.coaxKappa > 1)) bad.push(`${tag}: interference factor ${SR.coaxKappa} should exceed 1`);

    /* group the rotors by plan position: each station must hold exactly two,
       separated vertically, and DIFFERENT stations must still clear */
    const stations = [];
    for (const r of rotors) {
      const st = stations.find(s => Math.hypot(s.x - r.x, s.y - r.y) < 1e-6);
      if (st) st.rs.push(r); else stations.push({ x: r.x, y: r.y, rs: [r] });
    }
    if (stations.length !== n / 2) bad.push(`${tag}: ${stations.length} plan stations, expected ${n / 2}`);
    for (const st of stations) {
      if (st.rs.length !== 2) { bad.push(`${tag}: a station holds ${st.rs.length} rotors, not a pair`); continue; }
      const dz = Math.abs(st.rs[0].z - st.rs[1].z);
      if (!(dz > 0.02)) bad.push(`${tag}: a pair is not vertically separated (dz ${dz.toFixed(3)} m)`);
      /* the two discs must not be so far apart that they are not a pair */
      if (dz > st.rs[0].radius) bad.push(`${tag}: pair separation ${dz.toFixed(2)} m exceeds the rotor radius`);
    }
    /* DIFFERENT stations must not overlap in plan - the real fouling test */
    for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i], b2 = stations[j];
      const d = Math.hypot(a.x - b2.x, a.y - b2.y);
      const need = a.rs[0].radius + b2.rs[0].radius;
      if (d < need) bad.push(`${tag}: stations overlap, ${d.toFixed(2)} m apart, need ${need.toFixed(2)} m`);
    }

    /* the arrangement must actually pay for itself somewhere: fewer booms */
    const coplanar = runSizing({ ...p, rotorArrangement: "coplanar" });
    if (!(SR.boomCount < coplanar.boomCount))
      bad.push(`${tag}: boom count ${SR.boomCount} not below coplanar ${coplanar.boomCount}`);
    if (!(SR.Phov > coplanar.Phov * 0.999))
      bad.push(`${tag}: coaxial hover power ${SR.Phov?.toFixed(0)} kW should not be BELOW coplanar ${coplanar.Phov?.toFixed(0)} kW`);
  }
  check(bad.length === 0,
    "coaxial layouts: N rotors on N/2 arms, pairs stacked, stations clear",
    bad.length ? bad.join("; ")
               : "pairs stacked and separated, stations clear, booms halved, interference charged");
}


/* ── THE DESIGN FLIES THE DISK LOADING IT WAS SIZED FOR ────────────────
   rotorDiameterFor is a real calculation - R = sqrt(W/(N pi DL)) - but every
   caller evaluated it at a HARDCODED 3175 kg placeholder, because MTOW is not
   known before sizing. The aircraft then converged to somewhere between 1987
   and 3514 kg and kept a rotor sized for a different one, so the disk loading
   the design actually flew drifted -17.6% to -35.0% off its target.

   That is not cosmetic: hover power goes as sqrt(DL), AFDD rotor weight as
   R^1.74, and the entire layout is drawn to that radius. The tool was sizing
   one aircraft and drawing another.

   Diameter and MTOW are mutually dependent, so the answer is a fixed point.
   This gate asserts the loop actually reaches it. */
{
  const dlBad = [];
  for (const key of Object.keys(CFG.CONFIGURATIONS)) {
    const d = CFG.CONFIG_DEFAULTS[key];
    const p0 = { ...B, configType: key, nPropHover: d.nRotors,
      vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
      etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
    const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
    const R = runSizing(p);
    const A = d.nRotors * Math.PI * Math.pow(p.propDiam / 2, 2);
    const dl = ((R.MTOW * 9.80665) / A) * 0.0208854;      // N/m2 -> lb/ft2
    const err = (100 * (dl - d.DL_lbft2)) / d.DL_lbft2;
    if (Math.abs(err) > 2) dlBad.push(`${key} ${dl.toFixed(2)} vs ${d.DL_lbft2} (${err.toFixed(1)}%)`);
  }
  check(dlBad.length === 0,
    "every layout converges to the disk loading its configuration specifies",
    dlBad.length ? dlBad.join("; ")
      : "rotor diameter is SOLVED with MTOW, not evaluated at a placeholder mass");
}

/* ── LANDING GEAR ─────────────────────────────────────────────────────
   The tool sized a CS-27 gear, reported its mass, and drew nothing: every
   rendered aircraft stood on air while the weight statement charged for
   wheels. These checks are about the gear being THERE, standing on ONE
   ground plane, and sitting where the moment balance puts it.

   The last of them is not a pass/fail on the gear at all. It measures the
   gear mass centroid that RESULTS from the placement against the 0.52 fL
   that cg.js assumes [LAY], and prints the difference. If those two ever
   agree it will be because someone made them agree; today they do not,
   and the number is printed so the disagreement stays visible rather than
   being averaged into a weight statement nobody reads twice. */
{
  const noGear = [], fwdOfCG = [], buried = [], centroids = [];
  for (const key of Object.keys(CFG.CONFIGURATIONS)) {
    const d = CFG.CONFIG_DEFAULTS[key];
    const p0 = { ...B, configType: key, nPropHover: d.nRotors,
      vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
      etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
    const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
    const R = runSizing(p);
    const g = aircraftGeometry(p, R);
    const G = g.gear;
    if (!G?.applicable) { noGear.push(key); continue; }
    if (!G.mainAftOfCG) fwdOfCG.push(`${key} main ${G.xMain.toFixed(2)} vs CG ${R.xCGtotal?.toFixed(2)}`);
    /* Every wheel bottom must lie on the SAME ground plane. */
    const wheels = g.bodies.filter(b => b.kind === "wheel");
    const bottoms = wheels.map(w => w.z - w.radius);
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    if (spread > 1e-6) buried.push(`${key} wheel bottoms spread ${(spread * 1000).toFixed(1)} mm`);
    centroids.push({ key, got: G.xMassCentroidFrac });
  }
  check(noGear.length === 0, "every configuration carries the landing gear it was charged for",
    noGear.length ? `no gear on ${noGear.join(", ")}`
      : "gear drawn on all six, at the tyre size and stroke the CS-27 drop test selected");
  check(fwdOfCG.length === 0, "the main gear lies aft of the CG on every layout",
    fwdOfCG.length ? fwdOfCG.join("; ")
      : "from the moment balance, not a chosen station — an aircraft with its mains forward of the CG sits on its tail");
  check(buried.length === 0, "every wheel stands on one ground plane",
    buried.length ? buried.join("; ") : "all wheel bottoms coplanar in all six");

  /* ── ONLY THE WHEELS MAY TOUCH THE GROUND ────────────────────────────
     The ventral fin, drawn at the span its aspect ratio implies, hung to
     z = -1.70 while the wheels stood on z = -1.159: the aeroplane rested on
     its tail fin, not its undercarriage. Nothing catches that except asking
     the question directly, so it is asked here for every layout and every
     body. A fin below the ground is not a proportions quibble — it is an
     aircraft that cannot be parked. */
  {
    const underground = [];
    for (const key of Object.keys(CFG.CONFIGURATIONS)) {
      const d = CFG.CONFIG_DEFAULTS[key];
      const p0 = { ...B, configType: key, nPropHover: d.nRotors,
        vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
        etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
        ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
      const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
      const g = aircraftGeometry(p, runSizing(p));
      const G = g.gear;
      if (!G?.applicable) continue;
      for (const b of g.bodies) {
        if (b.kind === "wheel") continue;
        let z = null;
        if (b.kind === "vfin") z = Math.min(b.z, b.z + b.span);
        else if (b.kind === "boom") z = Math.min(b.z, b.z0 ?? b.z) - (b.radius || 0);
        else if (b.stations) z = b.z + Math.min(...b.stations.map(st => (st.dz || 0) - st.h / 2));
        if (z != null && z < G.zGround - 1e-6)
          underground.push(`${key}/${b.label || b.kind} at ${z.toFixed(3)} vs ground ${G.zGround.toFixed(3)}`);
      }
    }
    check(underground.length === 0,
      "nothing but the wheels reaches the ground plane",
      underground.length ? underground.slice(0, 3).join("; ")
        : "no fin, boom or body below the wheels on any layout — the aircraft "
          + "stands on its undercarriage");
  }

  /* ── A PYLON MUST START AT THE ROTOR IT CARRIES ──────────────────────
     The pylon body was cross-wired: boomFaces draws from (x0,y0,z0) to
     (x1,y,z), and the builder set z0 to the ATTACH height while leaving z at
     the ROTOR height, so the member ran from (rotor x, rotor y, attach z) to
     (attach x, attach y, rotor z). Each end was half one point and half the
     other, and the rod touched neither the rotor above it nor the wing below.

     EVERY EXISTING CHECK PASSED IT, and the reason is worth keeping: they all
     work on axis-aligned bounding boxes, and the box around a cross-wired
     diagonal is the SAME box as around the correct one. It grazes both bodies
     either way. A member has to be checked by its ENDPOINTS. */
  {
    const detached = [];
    for (const key of Object.keys(CFG.CONFIGURATIONS)) {
      const d = CFG.CONFIG_DEFAULTS[key];
      const p0 = { ...B, configType: key, nPropHover: d.nRotors,
        vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
        etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
        ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
      const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
      const g = aircraftGeometry(p, runSizing(p));
      for (const b of g.bodies) {
        if (b.kind !== "boom" || !/ pylon$/.test(b.label || "")) continue;
        const owner = String(b.label).replace(/ pylon$/, "");
        const r = g.bodies.find(o => o.kind === "rotor" && o.label === owner);
        if (!r) continue;
        const dStart = Math.hypot(b.x0 - r.x, (b.y0 ?? b.y) - r.y, (b.z0 ?? b.z) - r.z);
        if (dStart > 1e-6)
          detached.push(`${key}/${b.label} starts ${dStart.toFixed(3)} m from its rotor`);
      }
    }
    check(detached.length === 0,
      "every pylon starts exactly at the rotor it carries",
      detached.length ? detached.slice(0, 3).join("; ")
        : "endpoints checked, not bounding boxes — a cross-wired member has the "
          + "same box as a correct one and passes every extent test");
  }

  /* ── A TILTING INSTALLATION IS COLINEAR WITH ITS HINGE ────────────────
     RAVEN's tip nacelle is offset from its parent hinge by Y 0.0000 and
     Z 0.0000 with zero rotation, and its propeller is forward of it on the
     same axis. Every part of a tilting installation lies on ONE LINE through
     the pivot, because that is the only arrangement a single hinge can carry.

     This file drew a tip rotor at 1.0392 b/2 and pivoted it at a foot 0.97
     b/2 inboard, then ran a member across the 0.47 m of span and 0.84 m of
     height between them. It looked like a strut and it was reported as "extra
     rods mounted to the wing tip". Nothing in the reference spans that gap
     because the gap does not exist there.

     The lateral offset is the one that matters and the one nothing else
     catches: a hinge with a lateral axis CANNOT swing a mass that is offset
     along its own axis into the right place, so any y mismatch is a mechanism
     that does not work, not a cosmetic one. */
  {
    const offAxis = [];
    for (const key of Object.keys(CFG.CONFIGURATIONS)) {
      const d = CFG.CONFIG_DEFAULTS[key];
      const p0 = { ...B, configType: key, nPropHover: d.nRotors,
        vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
        etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
        ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
      const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
      const g = aircraftGeometry(p, runSizing(p));
      for (const b of g.bodies) {
        if (!b.tilting || !b.hinge) continue;
        const ys = b.kind === "boom" ? [b.y0 ?? b.y, b.y] : [b.y];
        for (const yv of ys) {
          const dy = Math.abs(yv - b.hinge.y);
          if (dy > 1e-6)
            offAxis.push(`${key}/${b.label} is ${dy.toFixed(3)} m off its hinge axis`);
        }
      }
    }
    check(offAxis.length === 0,
      "every tilting part lies on its hinge axis — no member spans a gap the "
      + "reference does not have",
      offAxis.length ? offAxis.slice(0, 4).join("; ")
        : "nacelle, hub, spacer, motor and disc all share the pivot's span "
          + "station, as RAVEN's Tip Nacelle does at Y_Rel_Location 0.0000");
  }

  /* ── THE TOOL MUST NOT DRAW ONE AIRCRAFT AND WEIGH ANOTHER ────────────
     On a rotor-borne layout the rotor support arm is both a drawn length and
     a sized structural member, and the two came from different rules that had
     drifted apart. On the side-by-side they disagreed by a factor of 2.44:

         drawn      7.028 m   (fuselage-clearance heuristic, unsourced)
         charged    2.875 m   (fore/aft WING stations, on a wingless layout)
         geometry   4.388 m   (non-overlap, a >= R/sin(pi/N), exact at N=2)

     Boom mass goes as L^2 in bending, so the drawn aircraft's arms would
     weigh roughly six times what the weight statement carried. Worse, the
     charged arm came from fuselage stations and so did not depend on the
     rotor at all — doubling the rotor left it unchanged.

     Both files excluded N = 2 from the geometric rule with the same
     off-by-one (`> 2` where `>= 2` was meant), which is why exactly one
     configuration was affected and why no existing test saw it: every check
     compared the drawing to itself or the mass to itself, and none compared
     them to EACH OTHER. */
  {
    const drift = [];
    for (const key of Object.keys(CFG.CONFIGURATIONS)) {
      const d = CFG.CONFIG_DEFAULTS[key];
      const p0 = { ...B, configType: key, nPropHover: d.nRotors,
        vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
        etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
        ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
      const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
      const SR = runSizing(p);
      const cap = CFG.capabilitiesFor(key, d.nRotors);
      if (cap.hasWing !== false) continue;          // ring arms only
      const g = aircraftGeometry(p, SR);
      const rot = g.bodies.filter(b => b.kind === "rotor");
      if (!rot.length) continue;
      const drawn = Math.max(...rot.map(r => Math.hypot(r.x - (SR.fusLen ?? p.fusLen) * 0.5, r.y)));
      const charged = Number(SR.boomDetail?.armM);
      if (!isFinite(charged) || charged <= 0) continue;
      const ratio = drawn / charged;
      if (ratio < 0.90 || ratio > 1.15)
        drift.push(`${key}: drawn ${drawn.toFixed(2)} m vs charged `
                 + `${charged.toFixed(2)} m (x${ratio.toFixed(2)})`);
    }
    check(drift.length === 0,
      "the drawn rotor arm is the arm the mass model charged for",
      drift.length ? drift.join("; ")
        : "every rotor-borne layout draws the support arm it was weighed with, "
          + "within the 5% clearance margin the drawing adds so discs do not graze");
  }

  const assumed = CG_STATIONS.gear.frac;
  const worst = centroids.reduce((a, c) =>
    Math.abs(c.got - assumed) > Math.abs(a.got - assumed) ? c : a, centroids[0]);
  console.log("");
  console.log(`  MEASURED, NOT ASSERTED — gear mass centroid vs the ${assumed} fL cg.js assumes [LAY]:`);
  for (const c of centroids)
    console.log(`    ${c.key.padEnd(14)} ${c.got.toFixed(3)} fL   ${((c.got - assumed) * 100).toFixed(1)} points of fL from the assumption`);
  console.log(`  The placement that satisfies the moment balance puts the gear FORWARD of where`);
  console.log(`  the CG model carries it, by ${Math.abs(worst.got - assumed).toFixed(3)} fL at worst (${worst.key}). One of the two is wrong.`);
}

/* ── THE TILT MECHANISM, AGAINST RAVEN SWFT'S OWN HINGE GEOMS ─────────
   The .vsp3 says the proprotors pivot about a LATERAL axis on the WING
   PLANE, travel 0-110 deg, and are released at 90 (helicopter mode). The
   hub stands off that pivot, so converting swings it through an arc. This
   file used to rotate the disc about the hub, which holds the hub still —
   the wrong mechanism, and invisible at small angles, which is why it
   survived. These checks make it visible. */
{
  const offPlane = [], noPivot = [], noSwing = [];
  for (const key of Object.keys(CFG.CONFIGURATIONS)) {
    const d = CFG.CONFIG_DEFAULTS[key];
    const p0 = { ...B, configType: key, nPropHover: d.nRotors,
      vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
      etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
    const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
    const g = aircraftGeometry(p, runSizing(p));
    const wing = g.bodies.find(b => b.kind === "wing");
    const tilters = g.bodies.filter(b => b.kind === "rotor" && b.tilting);
    if (!tilters.length) continue;
    /* THE PIVOT IS ON THE STRUCTURE THAT CARRIES THE ROTOR — which is the
       wing only for wing-mounted rotors. RAVEN's own inboard hinge sits
       0.0865 m (0.015 D) off the wing plane because it is on the SPONSON,
       and RAVEN has no tail-mounted proprotor at all, so it cannot
       adjudicate one. The first version of this check demanded the wing
       plane for every tilting rotor and failed the boom and tail rotors,
       which are correct. The invariant that actually holds is that a hinge
       lies on some carrying body. */
    const carriers = g.bodies.filter(b => b.kind === "wing" || b.kind === "boom"
                                       || b.kind === "vtail" || b.kind === "sponson");
    for (const r of tilters) {
      if (!r.hinge) { noPivot.push(`${key}/${r.label}`); continue; }
      /* THE SURFACE'S HEIGHT AT THE HINGE'S OWN SPAN STATION, not at its root.
         This compared against b.z alone -- the ROOT height -- which on a panel
         with dihedral is never where the rotor is. On the V-tail at 38 deg the
         skin has climbed 1.56 m by the tip, so the test could not have been
         satisfied by the V-tail at any station: whenever it passed for a
         tail rotor it was matching some unrelated BOOM at a similar height.
         It was answering "is anything at this altitude" rather than "is this
         pivot on its structure", and it went green throughout the period when
         the tail nacelle was floating 0.80 m ahead of the panel.

         Same lesson as the local-chord gate above, one axis over: a station
         taken at the root of a swept OR dihedralled surface is correct only at
         the root. This check keeps its own job -- catching a pivot attached to
         NOTHING, which the local-chord gate skips rather than flags -- and now
         does it against the real skin. */
      const zSurfAt = (b, y) => {
        if (b.kind !== "wing" && b.kind !== "vtail" && b.kind !== "htail") return null;
        const gam = ((b.dihedralDeg || 0) * Math.PI) / 180;
        const cg = Math.cos(gam) || 1;
        const runMax = b.kind === "vtail" ? b.span : b.span / 2;
        const run = Math.abs(y) / cg;
        if (!(runMax > 0) || run > runMax * 1.001 + 1e-6) return null;
        return b.z + run * Math.sin(gam);
      };
      const onStructure = carriers.some(b => {
        const zs = [zSurfAt(b, r.hinge.y), b.z, b.z0].filter(Number.isFinite);
        return zs.some(z => Math.abs(r.hinge.z - z) <= 0.02 * p.propDiam);
      });
      if (!onStructure)
        offPlane.push(`${key}/${r.label} pivot z ${r.hinge.z.toFixed(3)} on no structure`);
    }
    /* The hub must actually MOVE between helicopter and airplane mode. */
    /* THE HUB TRAVELS AN ARC, SO BOTH AXES COUNT. This returned the x
       centroid alone, and a 90 deg conversion moves the hub 0.175 m in x and
       0.398 m in z — measuring one of them found 40% of the travel and
       reported the mechanism as barely moving. */
    const disc = (deg) => {
      const f = buildMesh(g, PALETTE, { nacelleTiltDeg: deg })
        .filter(q => q.colour && q.colour[0] === 64 && q.colour[1] === 144);
      const xs = f.flatMap(q => q.v.map(v => v[0]));
      const zs = f.flatMap(q => q.v.map(v => v[2]));
      return [(Math.min(...xs) + Math.max(...xs)) / 2,
              (Math.min(...zs) + Math.max(...zs)) / 2];
    };
    /* HOW FAR THE HUB SHOULD MOVE IS NOT A GUESS. It rides at a radius
       r = |hub - pivot| about a lateral axis, so a 90 deg conversion carries
       it along a chord of r*sqrt(2). Comparing against that ties the check to
       the measured stand-off instead of to a fraction of D someone chose —
       the first version used 0.05 D and failed the hybridPusher at 0.142 m
       for no reason connected to its geometry. */
    const t0 = tilters[0];
    const rArm = Math.hypot(t0.x - t0.hinge.x, t0.z - t0.hinge.z);
    const expect = rArm * Math.SQRT2;
    const d0 = disc(0), d90 = disc(90);
    const swing = Math.hypot(d0[0] - d90[0], d0[1] - d90[1]);
    if (!(swing > 0.5 * expect))
      noSwing.push(`${key} moved ${swing.toFixed(3)} m of an expected ${expect.toFixed(3)} m`);
  }
  check(noPivot.length === 0, "every tilting rotor carries a pivot, not just an angle",
    noPivot.length ? noPivot.join("; ") : "each one knows the hinge it converts about");
  check(offPlane.length === 0, "every tilt pivot lies on the structure carrying its rotor",
    offPlane.length ? offPlane.join("; ")
      : "wing rotors pivot on the wing plane, boom and tail rotors on theirs — "
        + "RAVEN's own hinges sit -0.015 D and +0.001 D off the wing, on the sponson");
  check(noSwing.length === 0, "the hub SWINGS between helicopter and airplane mode",
    noSwing.length ? noSwing.join("; ")
      : "the hub stands off the pivot and travels an arc, rather than the disc spinning in place");
}

/* ── THE V-TAIL, AGAINST THE ONE EQUIVALENT TO RAVEN SWFT'S ───────────
   SWFT has no V-tail: it carries a Vertical Stabilizer (9.4244 m2) and a
   Horizontal Stabilator (11.7070 m2) on a wing of 58.1211 m2. The V-tail
   that does the same job has their combined area at a dihedral splitting
   the authority in the same ratio, tan(gamma) = sqrt(Sv/Sh):

       gamma  = 41.9 deg,  S/Sw = 0.3636

   This tool's tail solver never sees any of that — it sizes from static
   margin and yaw authority. Landing near it is therefore a genuine
   independent check, and it is the reason this comparison is worth
   gating rather than merely printing. */
{
  const { RAVEN_TAIL } = await import("../src/engine/geometry.js");
  const rows = [];
  for (const key of Object.keys(CFG.CONFIGURATIONS)) {
    const d = CFG.CONFIG_DEFAULTS[key];
    const p0 = { ...B, configType: key, nPropHover: d.nRotors,
      vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
      etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
    const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
    const R = runSizing(p);
    if (!(R.Swing > 0 && R.Svt_total > 0)) continue;
    rows.push({ key, ratio: (R.Svt_total / R.Swing) / RAVEN_TAIL.vtailEquivAreaOverSw,
                gamma: R.vtGamma_opt });
  }
  const worst = rows.reduce((a, r) => Math.abs(r.ratio - 1) > Math.abs(a.ratio - 1) ? r : a, rows[0]);
  check(rows.length > 0 && rows.every(r => r.ratio > 0.75 && r.ratio < 1.35),
    "the sized V-tail area lands near the one equivalent to RAVEN SWFT's tail",
    `worst ${worst.key} at ${worst.ratio.toFixed(2)}x of RAVEN's 0.3636 Sw — ` +
    `sized from static margin and yaw authority, which never see RAVEN`);
  const gammas = [...new Set(rows.map(r => r.gamma))];
  check(rows.every(r => Math.abs((r.gamma ?? 0) - RAVEN_TAIL.vtailEquivGammaDeg) <= 8),
    "and the solved dihedral lands near RAVEN's equivalent 41.9 deg",
    `solver picks ${gammas.join("/")} deg against 41.9 — two routes to the same tail`);
}

console.log("");
console.log(fails.length ? `GEOMETRY & EXPORT GATE FAILED: ${fails.length}` : "GEOMETRY & EXPORT GATE PASSED");
process.exit(fails.length ? 1 : 0);
