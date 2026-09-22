/* =====================================================================
   GEOMETRY 3D — the airframe as a consequence, not a drawing
   =====================================================================
   Everything this module places is DERIVED from data already in the
   engine. Nothing is drawn to look right.

     motor azimuth      ArduPilot AP_MotorsMatrix, the flight code itself
     spin direction     the same table's yaw_factor
     propeller radius   the MEASURED diameter of the selected propeller
     arm length         the smallest radius at which the discs do not
                        overlap, computed from the actual azimuths
     rotor count        the selected frame

   THE ARM LENGTH IS THE ONLY INTERESTING ONE. For rotors at azimuths
   phi_i on a common ring of radius r, the centre-to-centre distance
   between neighbours i and j is

       d_ij = 2 r sin(|phi_i - phi_j| / 2)

   and the discs clear when d_ij >= 2 R (1 + gap). So the minimum ring
   radius is

       r_min = R (1 + gap) / sin(dphi_min / 2)

   with dphi_min the smallest angular gap between any two rotors in the
   ACTUAL frame — not 2*pi/N, because real frames are not evenly spaced.
   A BetaFlight X quad, an H frame and a DJI X quad all have four rotors
   at four different azimuth sets, and using 2*pi/N would silently
   under-size the arms on every one of them.

   `gap` is DECLARED. Tip clearance is a structural and aeroacoustic
   choice, not a physical constant, and no vendor in the survey publishes
   the clearance they used. Zero gap means discs exactly touching, which
   nobody builds.

   WHAT THIS MODULE DOES NOT KNOW. Body size, arm cross-section, landing
   gear and payload shape are not derivable from anything held. They are
   drawn from declared dimensions, and the renderer marks them as such
   rather than implying they were computed.

   ── PROJECTION ───────────────────────────────────────────────────────
   A right-handed body frame, x forward, y right, z DOWN, which is the
   aerospace convention ArduPilot's azimuths are quoted in. Azimuth is
   measured clockwise from the nose when seen from above, so

       x = r cos(phi),  y = r sin(phi)

   Rotation is applied as yaw-pitch-roll about the body origin and then
   projected orthographically, because an orthographic view preserves
   parallel lengths and so can be measured off the screen. A perspective
   view would look more like a photograph and be less useful for reading
   a length off, which is what this view is for.
   ===================================================================== */

export const DEG = Math.PI / 180;

/* ── COAXIAL FRAMES ARE NOT A SPECIAL CASE, THEY ARE A THIRD OF THEM ──
   Ten of the twenty-five frames ArduPilot ships put TWO motors at the
   same azimuth: every OCTAQUAD (eight motors on four arms) and every
   DODECAHEXA (twelve on six). Their rotors are stacked vertically, not
   spread around a ring.

   A first version of this module treated the motor list as one coplanar
   ring and refused those frames outright, because two rotors at the same
   azimuth make the ring spacing zero. That refusal was right about the
   arithmetic and wrong about the aircraft. Arms are what sit on the
   ring; motors sit on arms.

   WHAT THIS COSTS ELSEWHERE, and it is not small. The rotor block
   interpolates UIUC measurements of an ISOLATED rotor. A coaxial pair
   does not make twice an isolated rotor's thrust — the lower disc works
   in the upper's wake — and no correction for that exists in this
   engine, because the measured database does not contain one.
   `coaxialUnmodelled` says so on every coaxial frame, so a caller cannot
   size one of these as though it were N independent rotors without being
   told. */

/* Distinct arm azimuths, and the motors carried on each. */
export function armsOf(motors) {
  const byAzimuth = new Map();
  for (const m of motors) {
    const key = (((m.angleDeg % 360) + 360) % 360).toFixed(6);
    if (!byAzimuth.has(key)) byAzimuth.set(key, { angleDeg: m.angleDeg, motors: [] });
    byAzimuth.get(key).motors.push(m);
  }
  return [...byAzimuth.values()].sort((a, b) => a.angleDeg - b.angleDeg);
}

/* Smallest angular separation between two ARMS, in radians. Computed
   over the distinct azimuth set, including the wrap at 360. */
export function smallestAngularGap(azimuthsDeg) {
  const a = [...new Set(azimuthsDeg.map((d) => (((d % 360) + 360) % 360).toFixed(6)))]
    .map(Number).sort((x, y) => x - y);
  if (a.length < 2) return 2 * Math.PI;
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    const next = i === a.length - 1 ? a[0] + 360 : a[i + 1];
    min = Math.min(min, next - a[i]);
  }
  return min * DEG;
}

/* The smallest ring radius at which no two discs overlap. */
export function minimumArmLengthM(azimuthsDeg, propRadiusM, tipGapFraction) {
  if (!(propRadiusM > 0)) throw new Error("geometry3d: propeller radius must be positive");
  if (!(tipGapFraction >= 0))
    throw new Error("geometry3d: tipGapFraction must be declared and >= 0 — tip clearance "
      + "is a structural and acoustic choice, and no vendor in this survey publishes theirs");
  const dphi = smallestAngularGap(azimuthsDeg);
  const s = Math.sin(dphi / 2);
  if (s <= 1e-9) throw new Error("geometry3d: two rotors share an azimuth; a coplanar ring cannot separate them");
  return propRadiusM * (1 + tipGapFraction) / s;
}

/* Build the airframe. Returns positions in metres in the body frame.

   `coaxialSpacingM` is DECLARED. Rotor separation on a coaxial pair
   changes the interference between the discs, and no vendor in this
   survey publishes the spacing they used. It positions the stack; it
   does NOT correct the thrust, because nothing here can. */
export function buildAirframe({
  frame, propellerDiameterM, tipGapFraction, armLengthM = null,
  bodyRadiusM = null, coaxialSpacingM = null,
}) {
  if (!frame?.motors?.length) throw new Error("geometry3d: a frame with motors is required");
  const R = propellerDiameterM / 2;
  const arms = armsOf(frame.motors);
  const azim = arms.map((a) => a.angleDeg);
  const rMin = minimumArmLengthM(azim, R, tipGapFraction);
  const r = armLengthM ?? rMin;
  const maxPerArm = Math.max(...arms.map((a) => a.motors.length));
  const isCoaxial = maxPerArm > 1;
  const spacing = coaxialSpacingM ?? 0.7 * R;

  const rotors = [];
  for (const arm of arms) {
    const phi = arm.angleDeg * DEG;
    const n = arm.motors.length;
    arm.motors.forEach((m, k) => {
      /* Stack symmetrically about the arm plane. z is DOWN, so the first
         motor of a pair sits above (negative z) and the second below. */
      const z = n === 1 ? 0 : (k - (n - 1) / 2) * spacing;
      rotors.push({
        motor: m.motor, angleDeg: m.angleDeg, rotation: m.rotation,
        x: r * Math.cos(phi), y: r * Math.sin(phi), z,
        radiusM: R, testingOrder: m.testingOrder,
        armIndex: arms.indexOf(arm), stackIndex: k, coaxial: n > 1,
      });
    });
  }

  return {
    rotors, arms: arms.length, motorsPerArm: maxPerArm, isCoaxial,
    coaxialSpacingM: isCoaxial ? spacing : null,
    coaxialSpacingIsDeclared: isCoaxial ? coaxialSpacingM != null : null,
    coaxialUnmodelled: isCoaxial
      ? `${frame.motors.length} motors on ${arms.length} arms: the rotors are COAXIAL. `
        + `The rotor block interpolates UIUC measurements of an ISOLATED rotor, so a `
        + `coaxial pair is modelled here as two independent rotors. It is not — the lower `
        + `disc works in the upper's wake — and the measured database contains no `
        + `correction for that. Thrust and power for this frame are therefore NOT `
        + `supported by the data the rest of the engine rests on.`
      : null,
    armLengthM: r, minimumArmLengthM: rMin,
    armIsMinimum: armLengthM == null,
    smallestAngularGapDeg: smallestAngularGap(azim) / DEG,
    propRadiusM: R, tipGapFraction,
    bodyRadiusM: bodyRadiusM ?? Math.max(0.04, 0.35 * r),
    bodyRadiusIsDeclared: bodyRadiusM != null,
    spanM: 2 * (r + R),
    frameClass: frame.frameClass, frameType: frame.frameType,
    /* Disc area counts ARMS, not motors: two stacked rotors sweep one
       disc's worth of air, which is the whole reason a coaxial pair is
       not worth two isolated rotors. */
    discAreaM2: arms.length * Math.PI * R * R,
    discAreaCountsArms: true,
  };
}

/* ── ROTATION AND PROJECTION ───────────────────────────────────────── */
export function rotate({ x, y, z }, { yawDeg = 0, pitchDeg = 0, rollDeg = 0 }) {
  const cy = Math.cos(yawDeg * DEG), sy = Math.sin(yawDeg * DEG);
  const cp = Math.cos(pitchDeg * DEG), sp = Math.sin(pitchDeg * DEG);
  const cr = Math.cos(rollDeg * DEG), sr = Math.sin(rollDeg * DEG);
  /* yaw about z, then pitch about y, then roll about x */
  let X = x * cy - y * sy, Y = x * sy + y * cy, Z = z;
  const X2 = X * cp + Z * sp, Z2 = -X * sp + Z * cp;
  X = X2; Z = Z2;
  const Y2 = Y * cr - Z * sr, Z3 = Y * sr + Z * cr;
  return { x: X, y: Y2, z: Z3 };
}

/* Orthographic projection to screen. z is DOWN in the body frame, so a
   positive z moves DOWN the screen, and screen y is negated once for the
   SVG convention rather than twice by accident. */
export function project(p, { scale = 1, cx = 0, cy = 0, viewYawDeg = 35, viewPitchDeg = 22 }) {
  const r = rotate(p, { yawDeg: viewYawDeg, pitchDeg: viewPitchDeg });
  return {
    sx: cx + scale * r.y,
    sy: cy + scale * (r.z * 0.85 - r.x * 0.5),
    depth: r.x,
  };
}

/* A propeller disc as a projected ellipse path. The disc is a circle in
   the body x-y plane; under this projection it becomes an ellipse, and
   sampling it is more honest than guessing the ellipse parameters. */
export function discPath(centre, radiusM, view, samples = 48) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const p = { x: centre.x + radiusM * Math.cos(t), y: centre.y + radiusM * Math.sin(t), z: centre.z };
    const s = project(p, view);
    pts.push(`${i === 0 ? "M" : "L"}${s.sx.toFixed(2)},${s.sy.toFixed(2)}`);
  }
  return pts.join(" ") + " Z";
}

/* ── PARTS DRAWN AT PUBLISHED DIMENSIONS ───────────────────────────────
   These live here rather than in the panel because a gate has to be able
   to import them, and a gate runs under plain node where a .jsx file
   will not load. The same reason the ESC and radio logic sits in .js.

   "21.55 (dia, max) x 70.15 (height, max)" -> { diameterMm, heightMm }.
   Returns null rather than a guess when the field is absent or does not
   carry two numbers, because a cell drawn at an assumed size reads as a
   measurement, which is exactly what this view refuses to imply. */
export function parseDimsMm(s) {
  if (typeof s !== "string") return null;
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const [d, h] = nums.map(Number);
  return Number.isFinite(d) && Number.isFinite(h) && d > 0 && h > 0
    ? { diameterMm: d, heightMm: h } : null;
}

/* The cells laid out as a grid. The COUNT and the electrical arrangement
   are computed by the pack; which cell physically sits where is a
   packaging choice nobody publishes, so the grid is DECLARED and the
   view says so. */
export function cellLayout(pack, dims) {
  if (!pack || !dims) return null;
  const cols = Math.max(1, pack.cellsSeries ?? 1);
  const rows = Math.max(1, pack.cellsParallel ?? 1);
  const dM = dims.diameterMm / 1000, hM = dims.heightMm / 1000;
  const pitch = dM * 1.02;
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cells.push({
        x: (c - (cols - 1) / 2) * pitch,
        y: (r - (rows - 1) / 2) * pitch,
        z: 0, radiusM: dM / 2, heightM: hM,
      });
  return { cells, rows, cols, diameterM: dM, heightM: hM,
           footprintM: [cols * pitch, rows * pitch] };
}

/* A cylinder, for a part whose real diameter and height are PUBLISHED —
   a motor stator, a cell. Sampled the same way discPath is, for the same
   reason: the silhouette of a circle under this projection is an ellipse
   and guessing its parameters is worse than sampling it.

   `base` is the seating face and the body extends by heightM along -z,
   i.e. UPWARD, because z is down in the body frame. The wall is the
   closed band between the two rings, which under an orthographic
   projection of a convex solid is exactly its silhouette. */
export function cylinderPaths(base, radiusM, heightM, view, samples = 32) {
  const ring = (z) => {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 2 * Math.PI;
      pts.push(project({ x: base.x + radiusM * Math.cos(t), y: base.y + radiusM * Math.sin(t), z }, view));
    }
    return pts;
  };
  const toPath = (p) =>
    p.map((s, i) => `${i === 0 ? "M" : "L"}${s.sx.toFixed(2)},${s.sy.toFixed(2)}`).join(" ") + " Z";
  const bottom = ring(base.z);
  const top = ring(base.z - heightM);
  return {
    bottom: toPath(bottom), top: toPath(top),
    wall: toPath([...bottom, ...[...top].reverse()]),
    topCentre: project({ x: base.x, y: base.y, z: base.z - heightM }, view),
    baseCentre: project(base, view),
  };
}

/* The annulus a turning rotor actually sweeps. Two rings in one path with
   fill-rule evenodd, so the hub shows through. This is the blade's swept
   area, not a decorative ring: rOuter is where the blade tips run. */
export function annulusPath(centre, rOuterM, rInnerM, view, samples = 48) {
  return `${discPath(centre, rOuterM, view, samples)} ${discPath(centre, rInnerM, view, samples)}`;
}

/* Which rotors are nearest the viewer, so they draw last. */
export function depthSort(rotors, view) {
  return [...rotors]
    .map((r) => ({ r, depth: project(r, view).depth }))
    .sort((a, b) => a.depth - b.depth)
    .map((x) => x.r);
}

/* Yaw balance: the sum of spin signs. Zero means the reaction torques
   cancel at equal thrust. A frame that cannot yaw-trim at equal thrust
   is a real property of the frame, reported rather than corrected. */
export function yawBalance(rotors) {
  const cw = rotors.filter((r) => r.rotation === "CW").length;
  const ccw = rotors.filter((r) => r.rotation === "CCW").length;
  return {
    cw, ccw, balanced: cw === ccw,
    note: cw === ccw
      ? "equal CW and CCW, so hover reaction torques cancel at equal thrust"
      : `${cw} CW against ${ccw} CCW — this frame cannot yaw-trim at equal thrust, `
        + `so hover requires unequal rotor speeds`,
  };
}
