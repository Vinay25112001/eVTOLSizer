/* =====================================================================
   GEOMETRY -> TRIANGLE MESH
   =====================================================================
   Turns the parametric bodies from engine/geometry.js into shaded triangles
   for the interactive 3D view. Kept separate from the renderer so the mesh is
   testable on its own — a face count and a bounding box are checkable facts,
   a canvas is not.

   Aircraft axes: +x aft along the fuselage, +y right, +z up.
   ===================================================================== */

/** Ring of points around the x-axis at station x, half-width w, half-height h. */
/* A cross-section ring. `r` is the CORNER RADIUS as a fraction of the half
   width; 0 gives the ellipse this function used to draw unconditionally.

   WHY THE ROUNDED RECTANGLE MATTERS. NASA's RAVEN fuselage is a RoundedRect
   section, not an ellipse, and it is TALL — height over width runs 0.75 at the
   nose to 1.69 at the cabin, with the corners squared off aft. Lofting
   ellipses through even perfectly measured stations produces a torpedo, which
   is what every body in this tool looked like. The section shape, not the
   station table, was the thing that was wrong. */
function ring(x, y, z, w, h, n, r = 0) {
  const pts = [];
  if (!(r > 0.001)) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pts.push([x, y + w * Math.cos(a), z + h * Math.sin(a)]);
    }
    return pts;
  }
  /* Rounded rectangle: a superellipse is the stable way to draw one at low
     tessellation — exponent 2 is the ellipse, large exponents approach the
     rectangle, and the corner radius maps onto it monotonically. Chosen over
     four arcs and four lines because it cannot produce degenerate facets when
     `seg` is small, which is the regime this renderer works in. */
  const rr = Math.max(0.02, Math.min(0.5, r));
  const nExp = 2 + 6 * (1 - rr / 0.5);          // r=0.5 -> 2 (ellipse), r->0 -> 8
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const ca = Math.cos(a), sa = Math.sin(a);
    const fy = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / nExp);
    const fz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / nExp);
    pts.push([x, y + w * fy, z + h * fz]);
  }
  return pts;
}

/** Loft a body (fuselage / sponson / nacelle) into quads between stations. */
function loftFaces(b, seg, colour) {
  const out = [];
  const L = b.x1 - b.x0;
  const rings = b.stations.map(s =>
    ring(b.x0 + s.t * L, b.y, b.z + (s.dz || 0), s.w / 2, s.h / 2, seg, s.r || 0));
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      out.push({ v: [A[i], A[j], B[j], B[i]], colour });
    }
  }
  /* Cap the ends so the body reads as solid from any angle. */
  out.push({ v: rings[0].slice().reverse(), colour });
  out.push({ v: rings[rings.length - 1], colour });
  return out;
}

/** A tapered lifting panel with thickness — wing, V-tail, or a rotor blade. */
function panelFaces(o, colour) {
  const { x, y = 0, z, span, rootChord, tipChord, sweepDeg = 0,
          dihedralDeg = 0, thickRatio = 0.12, bothSides = true } = o;
  const out = [];
  const sw = Math.tan((sweepDeg * Math.PI) / 180);
  const dh = Math.tan((dihedralDeg * Math.PI) / 180);
  const sides = bothSides ? [-1, 1] : [1];
  for (const s of sides) {
    const half = span / 2;
    /* A FIN IS NOT A PANEL AT 90 DEGREES OF DIHEDRAL. tan(90 deg) is 1.6e16,
       so expressing a vertical surface that way sent the tip to infinity and
       the whole render collapsed to a line the first time a fin was drawn.
       `vertical` places the tip straight up (or down, for a negative span)
       with no lateral offset, which is what a fin actually is. */
    const yT = o.vertical ? y : y + s * half;
    const zT = o.vertical ? z + span : z + Math.abs(half) * dh;
    const xT = x + Math.abs(o.vertical ? span : half) * sw;
    const tR = rootChord * thickRatio / 2, tT = tipChord * thickRatio / 2;
    /* Root and tip sections as thin boxes; enough for a solid silhouette. */
    const root = [[x, y, z - tR], [x + rootChord, y, z - tR],
                  [x + rootChord, y, z + tR], [x, y, z + tR]];
    const tip  = [[xT, yT, zT - tT], [xT + tipChord, yT, zT - tT],
                  [xT + tipChord, yT, zT + tT], [xT, yT, zT + tT]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      out.push({ v: [root[i], root[j], tip[j], tip[i]], colour });
    }
    out.push({ v: root.slice().reverse(), colour });
    out.push({ v: tip, colour });
  }
  return out;
}

/** Rotate every vertex of a face list about a body's own pivot, so a lofted
    body can be swung to match the rotor it carries. */
const tiltFaces = (faces, ang, c) => faces.map(f => ({
  ...f, v: f.v.map(([x, y, z]) => tiltPt(x - c.x, y - c.y, z - c.z, c.x, c.y, c.z, ang)),
}));

/** Rotate a point about y (tilt) then place it — used for tilting rotors. */
/* Rotate a point about the lateral (y) axis through (cx,cy,cz).

   THE SENSE MATTERS AND IT WAS BACKWARDS. In this geometry x = 0 is the NOSE
   and x = fL is the tail, so +x points AFT. The previous form carried the disc
   normal from (0,0,1) in hover to (+1,0,0) in airplane mode — thrust along +x,
   pointing at the tail. Every tiltrotor and every hybrid converted the wrong
   way, and the pusher, drawn at the same 90 deg, pushed backwards too.

   Turning the other way takes the normal to (-1,0,0): thrust forward, which is
   what a proprotor in airplane mode does. The hub then swings FORWARD and down
   about its wing-plane pivot as it converts, which is the direction RAVEN's
   nacelles travel. */
const tiltPt = (px, py, pz, cx, cy, cz, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [cx + px * c - pz * s, cy + py, cz + px * s + pz * c];
};

/* =====================================================================
   THE POSING CONVENTION, IN ONE PLACE
   =====================================================================
   THE BODIES THIS FILE IS HANDED ARE NOT ALL AUTHORED IN THE SAME
   ATTITUDE, and that is deliberate — it mirrors RAVEN's own file, where a
   Stack is authored along +X and stood up by its hinge's JointRotate.

       lofted nacelle   authored in AIRPLANE attitude -> turns (a - 90)
       everything else  authored in HOVER attitude    -> turns (a)
       (stack parts, nacelle members, the disc itself)

   THE CONSEQUENCE IS EASY TO MISS: the authored coordinate set is not a
   pose the aircraft ever holds. Testing it for connectivity — which the
   geometry gate did — asks whether a hover stack touches an airplane-mode
   nacelle, and the answer is no whatever the design. Anything that reasons
   about where a tilting part IS must pose it first, through this function,
   which is why the angle is no longer written out at each of the three
   call sites below. */
export function tiltAngleRad(b, tiltDeg) {
  if (!b || !b.tilting) return 0;
  return ((b.kind === "nacelle" ? tiltDeg - 90 : tiltDeg) * Math.PI) / 180;
}

export { tiltPt };


/* =====================================================================
   THE ONE PALETTE
   =====================================================================
   This lived in Aircraft3DView.jsx while tools/render3d.mjs kept a SECOND
   copy of it. The two had already drifted: the headless renderer had no
   colour for the landing gear, so gear faces came out untinted in exactly
   the images used to check the gear. A viewer that draws its own idea of
   the aircraft drifts from the file the user downloads — which is the
   reason this module exists at all — and a palette is no exception.
   ===================================================================== */
export const PALETTE = {
  body:      [176, 186, 198],
  sponson:   [140, 150, 163],
  nacTilt:   [ 96, 150, 205],
  nacLift:   [150, 128, 108],
  wing:      [158, 170, 184],
  tail:      [140, 152, 166],
  diskTilt:  [ 64, 144, 216],
  diskLift:  [206, 150,  70],
  bladeTilt: [ 74, 116, 158],
  bladeLift: [156, 118,  74],
  /* Control surfaces are deliberately a different hue from the wing they sit
     on. NASA's own RAVEN renders show them picked out; a wing drawn as one
     flat plank tells a reader nothing about where the roll authority is. */
  flap:      [122, 134, 150],
  aileron:   [196, 140,  92],
  rudder:    [176, 128,  96],
  /* Gear is dark and unsaturated: structure the eye reads as underneath the
     aircraft, not another propulsion item competing with the rotors. */
  tyre:      [ 58,  60,  66],
  strut:     [118, 124, 134],
  diskPush:  [ 90, 196, 140],
  bladePush: [ 70, 150, 110],
};

/** Rotor: hub, the disk annulus, and real blades at the modelled blade count.
    A TILTING rotor is drawn tilted forward so the two kinds are distinguishable
    at a glance — which is the whole point of showing the layout in 3D. */
function rotorFaces(r, colDisk, colBlade, tiltDeg) {
  const out = [];
  const ang = r.tilting ? (tiltDeg * Math.PI) / 180 : 0;
  const R = r.radius, nB = Math.max(2, r.blades || 3);
  const chord = Math.max(0.04 * R, (r.solidity || 0.1) * Math.PI * R / nB);
  const hubR = Math.max(0.06 * R, chord * 0.7);

  /* ── ONE HUB PER ROTOR, AND IT IS THE MEASURED ONE ────────────────
     This drew a hub cylinder on the disc axis while addRotor ALSO builds a
     Hub body in the RAVEN hub/spacer/motor stack, so every rotor carried two
     concentric hubs — 0.078 m and 0.145 m radius, one inside the other. The
     larger lump at each propeller was the second hub.

     RAVEN has ONE Hub geom per prop. The stack's is the one to keep: its
     diameter is measured (0.137 D), while this one was inferred from
     solidity and blade count. A rotor that carries no stack — the cruise
     pusher, which is not built through addRotor — still needs one, so the
     hub is drawn only when nothing else provides it. */
  const seg = 12;
  if (!r.hasStack) {
    const hub = [-0.5, 0.5].map(o =>
      Array.from({ length: seg }, (_, i) => {
        const a = (2 * Math.PI * i) / seg;
        return tiltPt(hubR * Math.cos(a), hubR * Math.sin(a), o * hubR * 1.1,
                      r.x, r.y, r.z, ang);
      }));
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      out.push({ v: [hub[0][i], hub[0][j], hub[1][j], hub[1][i]], colour: colBlade });
    }
    out.push({ v: hub[1], colour: colBlade });
  }

  /* Blades, evenly spaced, each a flat tapered plate in the disk plane. */
  for (let b = 0; b < nB; b++) {
    const th = (2 * Math.PI * b) / nB;
    const ct = Math.cos(th), st = Math.sin(th);
    const r0 = hubR * 1.2, c0 = chord * 1.05, c1 = chord * 0.62;
    const th2 = Math.max(0.004, chord * 0.06);
    const quad = [];
    for (const [rr, cc] of [[r0, c0], [R, c1]])
      for (const sgn of [-1, 1])
        quad.push([rr * ct - sgn * cc * st * 0.5, rr * st + sgn * cc * ct * 0.5]);
    const [A, B, C, Dp] = [quad[0], quad[1], quad[3], quad[2]];
    for (const dz of [-th2, th2])
      out.push({ v: [A, B, C, Dp].map(([u, v]) => tiltPt(u, v, dz, r.x, r.y, r.z, ang)),
                 colour: colBlade });
  }
  /* Faint disk annulus so the swept area is readable. */
  const ringPts = (rad) => Array.from({ length: 40 }, (_, i) => {
    const a = (2 * Math.PI * i) / 40;
    return tiltPt(rad * Math.cos(a), rad * Math.sin(a), 0, r.x, r.y, r.z, ang);
  });
  const inner = ringPts(R * 0.985), outer = ringPts(R);
  for (let i = 0; i < 40; i++) {
    const j = (i + 1) % 40;
    out.push({ v: [inner[i], inner[j], outer[j], outer[i]], colour: colDisk, thin: true });
  }
  return out;
}

/** A wheel: a short cylinder about the Y (lateral) axis, at its tyre radius
    and section width. Both come from the Goodyear size the gear model already
    selected, so the wheel is drawn at the size that was actually chosen. */
function wheelFaces(b, colour) {
  const seg = 14, out = [];
  const R = b.radius || 0.25, hw = (b.width || 0.15) / 2;
  const rings = [-hw, hw].map(off =>
    Array.from({ length: seg }, (_, i) => {
      const a2 = (2 * Math.PI * i) / seg;
      return [b.x + R * Math.cos(a2), b.y + off, b.z + R * Math.sin(a2)];
    }));
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    out.push({ v: [rings[0][i], rings[0][j], rings[1][j], rings[1][i]], colour });
  }
  out.push({ v: rings[0].slice().reverse(), colour });
  out.push({ v: rings[1], colour });
  return out;
}

/** Boom / arm as a slim cylinder between two points. */
/* A control surface is a thin quadrilateral lying on its parent panel. It is
   drawn very slightly PROUD of the surface (a few millimetres along the local
   normal) so the painter's-algorithm sort cannot leave it fighting with the
   wing it sits on and flickering. */
function controlFaces(b, colour) {
  const q = b.quad;
  if (!q || q.length !== 4) return [];
  const lift = 0.012;
  const up = (pt) => [pt[0], pt[1], pt[2] + lift];
  const dn = (pt) => [pt[0], pt[1], pt[2] - lift];
  const out = [];
  const top = q.map(up), bot = q.map(dn);
  out.push({ v: top, colour });
  out.push({ v: bot.slice().reverse(), colour });
  /* close the rim so the surface reads as a solid panel from any angle */
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.push({ v: [bot[i], bot[j], top[j], top[i]], colour });
  }
  return out;
}

function boomFaces(b, colour) {
  const seg = 8, out = [];
  const x0 = b.x0, x1 = b.x1, y0 = b.y0 ?? b.y, y1 = b.y;
  const z0 = b.z0 ?? b.z, z1 = b.z;
  /* A TRUE 3D CYLINDER. The old version built its ring from the PLAN direction
     only, so a purely vertical strut — a rotor pylon standing on a boom — had
     zero plan length and collapsed to a degenerate shape. Rotor hubs sit above
     their booms on exactly such struts (RAVEN carries a hub/spacer/motor stack
     there), so this has to work in any direction. */
  const d = [x1 - x0, y1 - y0, z1 - z0];
  const len = Math.hypot(...d) || 1e-6;
  const u = d.map(c => c / len);
  /* Any vector not parallel to u, to build the ring basis from. */
  const ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cross = (a2, b2) => [a2[1]*b2[2]-a2[2]*b2[1], a2[2]*b2[0]-a2[0]*b2[2], a2[0]*b2[1]-a2[1]*b2[0]];
  const norm = (v) => { const L = Math.hypot(...v) || 1; return v.map(c => c / L); };
  const e1 = norm(cross(u, ref)), e2 = norm(cross(u, e1));
  const R = b.radius || 0.1;
  /* A FAIRED MEMBER IS NOT A TUBE. RAVEN models its Main Gear Struts as a
     WING geom — an aerofoil section, chord streamwise — not a rod, and a bare
     cylinder of the same thickness reads as scaffolding next to it. When
     `chord` is given the section becomes a streamwise ellipse: chord/2 along
     the flight direction, the strut's own radius across it. The basis e1/e2
     is orthogonal to the member, so the chord is projected onto whichever of
     them carries the x direction. */
  const chord = Number(b.chord) || 0;
  const rings = [0, 1].map(t => Array.from({ length: seg }, (_, i) => {
    const a2 = (2 * Math.PI * i) / seg, c = Math.cos(a2), s2 = Math.sin(a2);
    let A = R, Bx = R;
    if (chord > 0) {
      /* how much of each basis vector points along x */
      const w1 = Math.abs(e1[0]), w2 = Math.abs(e2[0]);
      A  = R + (chord / 2 - R) * w1;
      Bx = R + (chord / 2 - R) * w2;
    }
    return [x0 + d[0] * t + A * e1[0] * c + Bx * e2[0] * s2,
            y0 + d[1] * t + A * e1[1] * c + Bx * e2[1] * s2,
            z0 + d[2] * t + A * e1[2] * c + Bx * e2[2] * s2];
  }));
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    out.push({ v: [rings[0][i], rings[0][j], rings[1][j], rings[1][i]], colour });
  }
  out.push({ v: rings[0].slice().reverse(), colour });
  out.push({ v: rings[1], colour });
  return out;
}

/** Full mesh for a geometry, as flat-shaded polygons. */
export function buildMesh(geo, palette, opts = {}) {
  /* ── NACELLE TILT, IN RAVEN'S OWN CONVENTION ────────────────────────
     [SRC] Wright, S.J. & Silva, C., "RAVEN Proprotor Performance and
     Aeroelastic Stability Predictions", NASA Ames (corpus S3568):

       "Per convention, a tilt of 90 deg refers to 'helicopter mode' while
        a tilt of 0 deg refers to 'airplane mode.'"

     and RAVEN's own analysed set is 90, 75, 60, 45 deg (their Table 2).

     THIS FILE HAD THE CONVENTION UPSIDE DOWN. It carried `tiltDeg = 82`
     described as "near cruise attitude", but its zero is a HORIZONTAL disc
     — the same angle it draws lift-only rotors at, and 90 is what it hands
     a pusher, whose disc is vertical. So its 82 meant RAVEN's 8, and anyone
     reading "82 deg" alongside the RAVEN reference this geometry is built
     on would read it as almost helicopter mode: the opposite of what was
     drawn. The number was also unsourced, and 8 deg sits outside the range
     RAVEN publishes.

     The angle is now stated the way the reference states it. Tilting
     rotors default to airplane mode, which is the attitude the drawing was
     always trying to show, and it is a defined endpoint of the convention
     rather than a rake somebody liked the look of. */
  const nacelleTiltDeg = opts.nacelleTiltDeg ?? 90;  // RAVEN: 0 = airplane, 90 = helicopter
  const tiltDeg = 90 - nacelleTiltDeg;               // this file's internal sense
  const seg = opts.seg ?? 16;
  const P = palette;
  const faces = [];
  for (const b of geo.bodies || []) {
    if (b.kind === "fuselage") faces.push(...loftFaces(b, seg, P.body));
    else if (b.kind === "sponson") faces.push(...loftFaces(b, Math.max(8, seg - 4), P.sponson));
    else if (b.kind === "nacelle") {
      /* A TILTING NACELLE MUST TILT WITH ITS ROTOR. The rotor was drawn
         rotated to the nacelle tilt angle while the nacelle
         was lofted flat along x and never rotated at all, so on every tilting
         layout the disc stood on edge in front of a horizontal pod and the hub
         sat off the nacelle axis. They could not be aligned: nothing rotated
         the nacelle. It now turns about its own rotor's hub, the same point
         and the same angle the rotor uses, so the pair stays rigid. */
      const nf = loftFaces(b, 10, b.tilting ? P.nacTilt : P.nacLift);
      const mate = b.tilting
        ? (geo.bodies || []).find(o => o.kind === "rotor" &&
            (o.label || "") === String(b.label || "").replace(/ nacelle$/, ""))
        : null;
      /* ── THE NACELLE LIES ALONG THE ROTOR AXIS, NOT ALONG THE FUSELAGE ──
         RAVEN settles this: every Tilt Nacelle, Prop, Hub, Spacer and Motor in
         the released model carries Y_Rotation = 90 deg. A Stack's axis is +X
         by default, so 90 deg about Y stands it VERTICAL — and the model is
         released in HELICOPTER mode, where the rotor axis is vertical and the
         nacelle hangs down along it.

         This file lofts the nacelle along +x and drew it unrotated in hover, so
         the pod lay flat like a sausage under a horizontal disc, and at
         airplane mode it stood on end pointing up and back. Ninety degrees out
         of phase in both directions.

         The nacelle axis must be the rotor axis reversed — extending BEHIND the
         disc. With the disc normal at (-sin a, 0, cos a), that direction is
         (sin a, 0, -cos a), which is +x turned through (a - 90):

             hover     a = 0   -> axis (0,0,-1)  hangs below the rotor
             airplane  a = 90  -> axis (1,0,0)   lies aft of a tractor prop

         The hub/spacer/motor stack was already right: it is drawn as vertical
         cylinders, which is its hover attitude, and it turns with the rotor. */
      const pivot = mate ? (mate.hinge || mate) : null;
      faces.push(...(pivot
        ? tiltFaces(nf, tiltAngleRad(b, tiltDeg), pivot) : nf));
    }
    else if (b.kind === "wing") faces.push(...panelFaces(b, P.wing));
    else if (b.kind === "vtail")
      /* THE V-TAIL WAS DRAWN AT HALF ITS SIZE. `span` on a vtail body is
         `bvt_panel`, the span of ONE PANEL - that is how the engine computes
         it (bvt_panel = sqrt(AR_vt * Svt_panel), with Cr_vt derived from it)
         and how the geometry gate's bounding box reads it. But panelFaces
         treats `span` as a FULL span and halves it before mirroring, so every
         V-tail this tool has ever drawn was half the surface the loop sized.
         Doubling it here makes the drawing agree with the aircraft; the
         alternative, changing panelFaces, would silently halve the wing. */
      /* AND IT MUST BE DRAWN ALONG ITS DIHEDRAL, WHICH DOUBLING ALONE DOES NOT
         DO. panelFaces treats `span` as a LATERAL span: it puts the tip at
         y = span/2 and raises it by (span/2) tan(gamma). A V-tail's
         `bvt_panel` is the length of the panel ALONG the surface, so its tip
         belongs at y = span cos(gamma), z = span sin(gamma).

         Passing span*2 fixed the halving but left the lateral scale wrong by
         1/cos(gamma) — at the solved 38 deg that is 1.27x too wide AND 1.27x
         too tall, so the tail was drawn at 1.61x the area the loop sized. It
         is why the V-tail looked nearly as large as the wing, and why the
         RUDDER — which resolves the dihedral correctly — did not lie on it and
         read as a second, colliding part.

         Scaling by cos(gamma) puts the tip at y = span cos(gamma) and, since
         the dihedral is unchanged, at z = span cos(gamma) tan(gamma) =
         span sin(gamma). Panel and rudder now describe the same surface. */
      faces.push(...panelFaces({ ...b,
        span: b.span * 2 * Math.cos(((b.dihedralDeg ?? 45) * Math.PI) / 180) },
        P.tail));
    else if (b.kind === "vfin")
      /* A fin is a HALF surface standing on one side of its root. A negative
         span hangs it BELOW the boom, which is how the ventral fin is carried. */
      faces.push(...panelFaces({ ...b, vertical: true, bothSides: false }, P.tail));
    else if (b.kind === "htail")
      faces.push(...panelFaces(b, P.tail));
    else if (b.kind === "boom") {
      /* Motor parts are coloured with the rotor they belong to, so a lift-only
         installation reads as lift-only at a glance — RAVEN's aft props have no
         nacelle to carry that colour, and the stack is all there is. */
      const col = (b.motorPart || b.nacelleMember)
                ? (b.tilting ? P.nacTilt : P.nacLift)
                : /strut$/.test(b.label || "") ? P.strut : P.sponson;
      /* A boom carrying `stations` is a lofted SPONSON — RAVEN's is a constant
         circle that sweeps its tail up through 0.053 of its length — so it is
         lofted rather than drawn as a straight cylinder. Everything else with
         this kind (pylons, gear legs, motor parts) has no stations and stays a
         cylinder. */
      const bf = b.stations ? loftFaces(b, 12, col) : boomFaces(b, col);
      /* A motor part carrying a pivot converts with its rotor. */
      /* A nacelle MEMBER spans hinge-to-hub, so it turns with the rotor's own
         angle — both its ends stay attached. The axial pod uses (a - 90)
         because it lies ALONG the rotor axis instead of across to the wing. */
      faces.push(...((b.motorPart || b.nacelleMember) && b.hinge
        ? tiltFaces(bf, tiltAngleRad(b, tiltDeg), b.hinge) : bf));
    }
    else if (b.kind === "wheel") faces.push(...wheelFaces(b, P.tyre));
    else if (b.kind === "control") faces.push(...controlFaces(b,
      b.ctrlKind === "aileron" ? P.aileron : b.ctrlKind === "rudder" ? P.rudder : P.flap));
    else if (b.kind === "rotor") {
      /* A CONVERTING PROPROTOR TRANSLATES. Its hub stands off the wing-plane
         pivot (RAVEN SWFT: +0.11 D up and 0.05 D forward inboard, +0.28 D up
         outboard), so going from helicopter to airplane mode swings the hub
         through an arc — it does not spin the disc about a fixed centre. This
         file used to rotate about the hub, which holds it still and is the
         wrong mechanism however close it looks at small angles. */
      const a2 = tiltAngleRad(b, tiltDeg);
      const rb = (b.tilting && b.hinge)
        ? (() => { const [hx, hy, hz] = tiltPt(b.x - b.hinge.x, b.y - b.hinge.y,
                                               b.z - b.hinge.z,
                                               b.hinge.x, b.hinge.y, b.hinge.z, a2);
                   return { ...b, x: hx, y: hy, z: hz }; })()
        : b;
      faces.push(...rotorFaces(rb, b.tilting ? P.diskTilt : P.diskLift,
                               b.tilting ? P.bladeTilt : P.bladeLift, tiltDeg));
    }
    else if (b.kind === "pusher")
      faces.push(...rotorFaces({ ...b, tilting: true, solidity: 0.12 },
                               P.diskPush, P.bladePush, 90));
  }
  return faces;
}
