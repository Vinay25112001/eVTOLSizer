/* =====================================================================
   MASS MOMENTS OF INERTIA — from the geometry, not from a centroid
   =====================================================================
   WHY THIS EXISTS

   The CG model assigns `motors`, `inverters`, `rotors` and `booms` all to
   `xRotCentroid` — a single point. For a CENTRE OF GRAVITY that is
   perfectly defensible: the centroid of a symmetric rotor array IS its
   mass centre, and the CG is a mass-weighted mean.

   For INERTIA it is fatal, because the spread is the whole quantity. A
   first attempt at Iyy from the itemised CG list returned 326 kg m^2 for a
   3,381 kg aircraft — around 40x too small — and a pitch acceleration of
   2,934 deg/s^2, which is three orders of magnitude beyond anything that
   flies.

   `engine/geometry.js` already knows where every rotor, boom, nacelle and
   panel is, in x, y AND z. `engine/cg.js` does not use it. This module is
   the join: it distributes the sized weight groups onto the drawn bodies
   and returns a real inertia tensor about the CG.

   DISTRIBUTED BODIES ARE NOT POINTS. A wing is not a lump at its
   centroid — it contributes m b^2 / 12 about its own span axis before the
   parallel-axis term. Same for booms along their length. Treating them as
   points understates roll inertia badly on exactly the layouts where roll
   inertia matters.

   [LAY] where a group has no obvious body (avionics, furnishings, ECS) it
   stays at its CG station on the centreline, which is what cg.js already
   assumes and is the best available.
   ===================================================================== */

/* Which drawn bodies carry which sized weight group. Anything not listed
   falls back to the fuselage centreline at its CG station. */
/* MOTOR MASS NOW HAS A DRAWN MOTOR TO SIT ON. These mappings all keyed on
   `nacelle`, which worked only while EVERY rotor had one. Once the geometry
   started following RAVEN — where a fixed prop has no nacelle at all, just a
   Hub/Spacer/Motor stack — the motor group had nowhere to go on the lift-only
   rotors and piled onto the tilting ones instead. The hover-dynamics gate
   caught it: the damping/agility rank correlation fell from -0.94 to -0.43.

   The stack bodies also had to be excluded from `booms`. They are drawn as
   cylinders, so `kind === "boom"` swept them up and spread boom mass over
   every motor housing on the aircraft. They carry `motorPart` for exactly
   this reason. */
const GROUP_TO_BODY = {
  rotors:     (b) => b.kind === "rotor",
  /* the motor can itself — present on every rotor, tilting or not */
  motors:     (b) => b.motorPart === true && / motor$/.test(b.label || ""),
  /* inverters/ESCs ride with the nacelle where there is one, else the hub */
  inverters:  (b) => b.kind === "nacelle"
                  || (b.motorPart === true && / hub$/.test(b.label || "")),
  booms:      (b) => b.kind === "boom" && b.motorPart !== true,
  wing:       (b) => b.kind === "wing",
  vtail:      (b) => b.kind === "vtail",
  cruisePropulsion: (b) => b.kind === "pusher",
  nacelle:    (b) => b.kind === "nacelle" || b.motorPart === true,
  sponsons:   (b) => b.kind === "sponson",
};

/* Groups with no drawn body AND no CG station: they exist in the mass
   buildup but nothing says where they are. Battery packaging rides with the
   pack, which sits at the CG, so it is placed there and contributes only
   through its own extent — i.e. nothing. That is the honest position for a
   mass whose location is unmodelled, and it is REPORTED rather than silently
   dropped, because a mass that vanishes from the tensor understates inertia. */
const AT_CG = new Set(["packSystems", "bms", "thermal"]);

const sq = (x) => x * x;

/* Point-mass contribution to the tensor about (cx,cy,cz). */
function addPoint(T, m, x, y, z, c) {
  const dx = x - c.x, dy = y - c.y, dz = z - c.z;
  T.Ixx += m * (sq(dy) + sq(dz));
  T.Iyy += m * (sq(dx) + sq(dz));
  T.Izz += m * (sq(dx) + sq(dy));
  T.Ixz += m * dx * dz;
  T.m += m;
}

/* A slender body of length L along a given axis carries m L^2 / 12 about the
   two axes perpendicular to it, ON TOP of the parallel-axis term. */
function addSlender(T, m, L, axis) {
  const own = (m * sq(L)) / 12;
  if (axis === "y") { T.Ixx += own; T.Izz += own; }   // spanwise (wing, tail)
  else if (axis === "x") { T.Iyy += own; T.Izz += own; }  // fore/aft (booms)
  else { T.Ixx += own; T.Iyy += own; }
}

/**
 * @param groups  sized weight groups, kg, e.g. { rotors: 283, booms: 251, ... }
 * @param bodies  geometry bodies from aircraftGeometry()
 * @param cg      { x, y, z } centre of gravity, m
 * @param extra   point masses not in the weight groups: [{ mass, x, y, z, label }]
 * @param stationOf  fallback x station per group, from cg.js
 * @param zRef    fuselage centreline z, used for groups with no body
 */
export function inertiaTensor(groups = {}, bodies = [], cg = { x: 0, y: 0, z: 0 },
                              extra = [], stationOf = {}, zRef = 0) {
  const T = { Ixx: 0, Iyy: 0, Izz: 0, Ixz: 0, m: 0 };
  const c = { x: cg.x || 0, y: cg.y || 0, z: cg.z || 0 };
  const placed = [], unplaced = [];

  for (const [group, mass] of Object.entries(groups)) {
    if (!isFinite(mass) || mass <= 0) continue;
    const pick = GROUP_TO_BODY[group];
    const hits = pick ? bodies.filter(pick) : [];

    if (hits.length) {
      /* Split the group's mass equally over the bodies that carry it. The
         bodies are symmetric by construction, so equal division is right for
         the tensor even though individual units may differ. */
      const per = mass / hits.length;
      for (const b of hits) {
        if (b.kind === "wing" || b.kind === "vtail") {
          /* panels: centred on the aircraft, mass spread along the span */
          const span = b.kind === "wing" ? (b.span || 0)
                     : (b.span || 0) * 2 * Math.cos(((b.dihedralDeg || 45) * Math.PI) / 180);
          const zc = b.kind === "wing" ? (b.z || 0)
                   : (b.z || 0) + (b.span || 0) * 0.5 *
                     Math.sin(((b.dihedralDeg || 45) * Math.PI) / 180);
          addPoint(T, per, (b.x || 0) + (b.rootChord || 0) * 0.4, 0, zc, c);
          addSlender(T, per, span, "y");
        } else if (b.kind === "boom") {
          const x0 = b.x0 ?? b.x, x1 = b.x1 ?? b.x;
          const y0 = b.y0 ?? b.y, y1 = b.y ?? 0;
          const z0 = b.z0 ?? b.z, z1 = b.z ?? 0;
          const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
          addPoint(T, per, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, c);
          /* dominant direction decides which axes get the own-inertia term */
          const ax = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? "x" : "y";
          addSlender(T, per, L, ax);
        } else {
          const x = b.x ?? ((b.x0 + b.x1) / 2);
          addPoint(T, per, x, b.y || 0, b.z || 0, c);
        }
        placed.push({ group, body: b.label || b.kind, mass: +per.toFixed(1) });
      }
    } else {
      /* no body: leave it on the centreline at its CG station */
      let x = stationOf[group];
      if (x == null && AT_CG.has(group)) x = c.x;
      if (x == null) { unplaced.push(group); continue; }
      addPoint(T, mass, x, 0, zRef, c);
      placed.push({ group, body: "(centreline)", mass: +mass.toFixed(1) });
    }
  }

  for (const e of extra) {
    if (!isFinite(e.mass) || e.mass <= 0) continue;
    addPoint(T, e.mass, e.x, e.y ?? 0, e.z ?? zRef, c);
    placed.push({ group: e.label || "extra", body: "(point)", mass: +e.mass.toFixed(1) });
  }

  /* Radii of gyration, which is how rotorcraft people sanity-check inertia:
     k = sqrt(I/m). For this class k should land in the low metres, and a
     value far below the rotor arm means something has been lumped. */
  const k = (I) => (T.m > 0 ? Math.sqrt(I / T.m) : 0);
  return {
    Ixx: +T.Ixx.toFixed(1), Iyy: +T.Iyy.toFixed(1), Izz: +T.Izz.toFixed(1),
    Ixz: +T.Ixz.toFixed(1), massAccounted: +T.m.toFixed(1),
    kx: +k(T.Ixx).toFixed(3), ky: +k(T.Iyy).toFixed(3), kz: +k(T.Izz).toFixed(3),
    placed, unplaced,
    note: `inertia about the CG from ${placed.length} placed items; `
        + `radii of gyration ${k(T.Ixx).toFixed(2)}/${k(T.Iyy).toFixed(2)}/${k(T.Izz).toFixed(2)} m`,
  };
}
