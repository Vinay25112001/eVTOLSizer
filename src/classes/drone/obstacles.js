/* =====================================================================
   OBSTACLES — things to hit, and the honest limit of hitting them
   =====================================================================
   The flight view had nothing in it but the aircraft, a trail and a
   ground grid, so a drone that genuinely flew 38 m looked like it was
   wobbling on the spot. Objects of KNOWN SIZE fix that twice over: they
   make translation legible, and they give the simulation something to
   run into.

   WHAT THIS MODELS, AND WHAT IT REFUSES TO.

   It models CONTACT: where the aircraft's rotor envelope first
   intersects a solid, at what speed, at what time. That is geometry, and
   geometry is the one part of an impact this tool can state exactly.

   What happens NEXT is split in two, and the split is the whole point.
   The RESPONSE is computed - reflection about the true surface normal,
   an angular impulse from the off-centre blow, a rotor destroyed above a
   threshold - and the integration continues, so a bounce, a skid or a
   tumble comes out of the same 6-DOF loop as the rest of the flight.
   But the COEFFICIENTS that response needs are not sourced anywhere:
   `structureMassKg` is a DECLARED scalar (0.6 kg by default) with no
   material, no wall thickness and no geometry; nothing in the component
   survey publishes a propeller's impact strength; and no source here
   gives a restitution coefficient against concrete, brick or foliage.

   So they are DECLARED INPUTS, carried exactly as `bodyDragCoefficient`
   and `motorTimeConstantS` already are - the user's numbers, shown as
   declared, never presented as measured. That keeps the response
   falsifiable even though its constants are not: energy may not
   increase, e = 0 must kill the normal velocity exactly, e = 1 must
   reverse it exactly, and the normal must be a unit vector everywhere
   including on a box corner. See validation/drone-obstacles.mjs.

   With no `impact` declared, `simulate()` behaves exactly as before and
   the ground simply ends the flight.

   THE ENVELOPE IS THE ROTOR DISC, NOT THE HUB. A multirotor strikes
   things with its propeller tips, which is why `spanM` (2*(armLength +
   propRadius)) is the radius that matters. Testing the centre point
   would report a clean pass for a flight that took the blades off.

   Dimensions below are ORDINARY REAL SIZES chosen to be legible at the
   scale this panel draws, and they are labelled with their metres in the
   view so they read as scale references rather than scenery. They are
   scene furniture, not sourced engineering data, and nothing computed by
   the sizing loop depends on them.
   ===================================================================== */

/* A box: axis-aligned, sitting on the ground. Buildings, walls, crates.
   A cylinder: trunk plus a canopy sphere. Trees.

   Both carry their own dimensions in metres so the view can label them,
   and a `name` so a strike can be reported against something a person
   recognises rather than an index. */
export const OBSTACLE_KINDS = Object.freeze(["box", "tree"]);

export function makeBox({ name, x, y, wx, wy, h }) {
  if (!(wx > 0 && wy > 0 && h > 0)) throw new Error("obstacles: a box needs positive extents");
  return Object.freeze({ kind: "box", name, x, y, wx, wy, h });
}

export function makeTree({ name, x, y, trunkR, canopyR, h }) {
  if (!(trunkR > 0 && canopyR > 0 && h > 0)) throw new Error("obstacles: a tree needs positive extents");
  return Object.freeze({ kind: "tree", name, x, y, trunkR, canopyR, h });
}

/* A small default scene. Spread wide enough that a hover is unobstructed
   and a translating flight meets something within the distance a 15 deg
   tilt actually covers (38.7 m in a pulse), which is the whole point. */
export const DEFAULT_SCENE = Object.freeze([
  makeBox({ name: "hangar", x: 26, y: -6, wx: 14, wy: 10, h: 8 }),
  makeBox({ name: "tower", x: 44, y: 5, wx: 6, wy: 6, h: 22 }),
  makeBox({ name: "low wall", x: -16, y: 0, wx: 1, wy: 18, h: 2.5 }),
  makeTree({ name: "oak", x: 12, y: 11, trunkR: 0.35, canopyR: 3.2, h: 9 }),
  makeTree({ name: "pine", x: -9, y: -13, trunkR: 0.28, canopyR: 2.1, h: 12 }),
  makeTree({ name: "elm", x: 30, y: 17, trunkR: 0.4, canopyR: 3.8, h: 10 }),
]);

/* Closest distance from a point to a solid, NEGATIVE inside it.

   Written as a signed distance rather than a boolean so the crossing can
   be found by bisection between two trace samples: a 20 ms sample at
   10 m/s moves 200 mm, so a boolean test alone would report the strike
   up to a fifth of a metre late, or miss a thin wall entirely. */
export function signedDistance(o, px, py, pz) {
  const zAbove = pz - o.h;                       // pz is altitude, +up
  if (o.kind === "box") {
    const dx = Math.abs(px - o.x) - o.wx / 2;
    const dy = Math.abs(py - o.y) - o.wy / 2;
    const dz = pz < 0 ? -pz : zAbove;            // below ground counts as inside
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0);
    const outside = Math.hypot(ox, oy, oz);
    const inside = Math.min(Math.max(dx, Math.max(dy, dz)), 0);
    return outside + inside;
  }
  /* A tree is the union of trunk and canopy, so the distance is the
     smaller of the two — a union takes the min of its parts. */
  const rxy = Math.hypot(px - o.x, py - o.y);
  const trunkR = Math.max(0, rxy - o.trunkR);
  const trunkZ = pz < 0 ? -pz : Math.max(0, pz - (o.h - o.canopyR));
  const dTrunk = Math.hypot(trunkR, trunkZ);
  const cz = o.h - o.canopyR;
  const dCanopy = Math.hypot(rxy, pz - cz) - o.canopyR;
  return Math.min(dTrunk, dCanopy);
}

/* The FIRST contact along a trace, or null.

   `radiusM` is the aircraft's rotor envelope radius: contact is when the
   signed distance falls below it, not when the centre is inside the
   solid. Between the two samples that straddle the crossing the time is
   refined by bisection, so the reported speed and position are the ones
   at contact rather than at the next 20 ms sample. */
export function firstContact(trace, obstacles, radiusM) {
  if (!Array.isArray(trace) || trace.length < 2 || !obstacles?.length) return null;
  const clear = (s) => {
    let best = Infinity, who = null;
    for (const o of obstacles) {
      const d = signedDistance(o, s.x, s.y, s.altitudeM) - radiusM;
      if (d < best) { best = d; who = o; }
    }
    return { d: best, o: who };
  };

  let prev = trace[0], prevC = clear(prev);
  if (prevC.d <= 0) return contactAt(prev, prevC.o, 0);
  for (let i = 1; i < trace.length; i++) {
    const cur = trace[i], curC = clear(cur);
    if (curC.d <= 0) {
      let lo = prev, hi = cur;
      for (let k = 0; k < 24; k++) {
        const mid = lerpSample(lo, hi, 0.5);
        if (clear(mid).d <= 0) hi = mid; else lo = mid;
      }
      return contactAt(hi, curC.o, i);
    }
    prev = cur; prevC = curC;
  }
  return null;
}

function lerpSample(a, b, u) {
  const L = (k) => a[k] + (b[k] - a[k]) * u;
  return {
    ...a, t: L("t"), x: L("x"), y: L("y"), altitudeM: L("altitudeM"),
    vx: L("vx"), vy: L("vy"), vz: L("vz"),
  };
}

function contactAt(s, o, index) {
  const speed = Math.hypot(s.vx ?? 0, s.vy ?? 0, s.vz ?? 0);
  return Object.freeze({
    t: s.t, index, obstacle: o, name: o?.name ?? "obstacle",
    x: s.x, y: s.y, altitudeM: s.altitudeM,
    speedMps: speed,
    horizontalMps: Math.hypot(s.vx ?? 0, s.vy ?? 0),
    verticalMps: Math.abs(s.vz ?? 0),
    /* What this contact record is, and is not. The geometry here is
       exact; whether anything happens AFTER it depends on whether the
       caller declared impact coefficients. `firstContact` itself only
       locates the strike. */
    note: "contact located exactly; the response depends on declared coefficients",
  });
}

/* ── THE IMPACT ITSELF ────────────────────────────────────────────────
   Everything above is geometry, and geometry is exact. Everything below
   needs MATERIAL properties, and this project has none: `structureMassKg`
   is a declared scalar with no material, wall thickness or geometry, the
   component survey publishes no propeller impact strength, and nothing
   here gives a restitution coefficient against concrete, brick or wood.

   So the split is kept explicit. The CONTACT NORMAL and the IMPULSE ARM
   are computed from the scene and are as exact as the contact point. The
   RESTITUTION, the tangential scrub and the blade-break speed are
   DECLARED inputs, carried the same way `bodyDragCoefficient` and
   `motorTimeConstantS` already are — they are the user's numbers, shown
   as declared, and never presented as measured.

   What that buys is that the RESPONSE is still falsifiable even though
   the coefficients are not sourced: energy may not increase, e = 0 must
   kill the normal velocity exactly, e = 1 must reverse it exactly, and
   the normal must be a unit vector everywhere including on a box corner.
   Those are checked in validation/drone-obstacles.mjs. */

export const DECLARED_IMPACT_INPUTS = Object.freeze({
  restitution: {
    value: 0.25, unit: "-", status: "declared",
    why: "No source in this project gives a coefficient of restitution for a "
       + "multirotor airframe against concrete, brick or foliage. 0.25 is a "
       + "mostly-inelastic default; it is an input, not a measurement.",
  },
  tangentialScrub: {
    value: 0.5, unit: "-", status: "declared",
    why: "Fraction of velocity ALONG the surface retained after contact. "
       + "Friction between a carbon airframe and a wall is not published here.",
  },
  bladeBreakSpeedMps: {
    value: 3.0, unit: "m/s", status: "declared",
    why: "Closing speed above which the struck rotor is taken as destroyed. "
       + "No propeller in the component survey publishes an impact strength, "
       + "so this threshold is declared and adjustable, never derived.",
  },
});

/* Outward unit normal of the solid at a point, from the gradient of the
   signed-distance field. Central differences rather than per-kind
   analytic normals: one expression that cannot disagree with the
   distance function that decides contact, and it is correct on corners
   and on the tree's trunk/canopy union, where an analytic normal has to
   pick a branch. */
export function contactNormal(o, px, py, pz, h = 1e-4) {
  const d = (x, y, z) => signedDistance(o, x, y, z);
  let nx = d(px + h, py, pz) - d(px - h, py, pz);
  let ny = d(px, py + h, pz) - d(px, py - h, pz);
  let nz = d(px, py, pz + h) - d(px, py, pz - h);
  const m = Math.hypot(nx, ny, nz);
  if (!(m > 0)) return [0, 0, 1];          // degenerate: push straight up
  return [nx / m, ny / m, nz / m];
}

/* Velocity after contact, in the same (x, y, up) frame as the input.

   v' = v - (1 + e)(v.n)n            on the normal component
        then the tangential part is scaled by `scrub`.

   Only an APPROACHING contact is resolved: if v.n >= 0 the aircraft is
   already separating and reflecting it again would inject energy and
   trap it against the surface.

   `scrub` therefore acts AT AN IMPACT, not continuously. A purely
   tangential velocity is a slide, not a strike, and is returned
   untouched - sliding friction is a force acting over time and would
   need a coefficient and a normal load this project does not have.
   Applying the scrub per integration step instead would erase the
   velocity in milliseconds, which is not friction, it is a bug. */
export function reflectVelocity(v, n, { restitution = 0, scrub = 1 } = {}) {
  const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  if (vn >= 0) return [...v];
  const nrm = [vn * n[0], vn * n[1], vn * n[2]];
  const tan = [v[0] - nrm[0], v[1] - nrm[1], v[2] - nrm[2]];
  const e = Math.max(0, Math.min(1, restitution));
  const k = Math.max(0, Math.min(1, scrub));
  return [
    tan[0] * k - nrm[0] * e,
    tan[1] * k - nrm[1] * e,
    tan[2] * k - nrm[2] * e,
  ];
}
