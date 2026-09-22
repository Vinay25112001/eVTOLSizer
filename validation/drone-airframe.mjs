/* =====================================================================
   DRONE AIRFRAME GATE — the arm length is a consequence, not a drawing
   =====================================================================
   The 3D view exists to be measured off, so the quantity it draws has to
   be right. The one that matters is arm length, and the tempting way to
   compute it is wrong.

   THE TRAP. For N rotors it is natural to write the angular spacing as
   2*pi/N and get

       r_min = R (1 + gap) / sin(pi/N)

   That is correct ONLY for an evenly spaced ring. Real frames are not
   evenly spaced: ArduPilot ships several four-rotor layouts whose
   azimuth sets differ, and on any frame with an uneven gap the even-ring
   formula returns a SMALLER radius than the discs actually need. The
   view would then draw overlapping propellers and call the number a
   clearance.

   So the module computes the smallest angular gap from the ACTUAL
   azimuths, and this gate checks the distinction on the frames where it
   bites — including by verifying that no pair of discs overlaps at the
   radius returned, across every frame in the database.

   IT ALSO CHECKS THE PROJECTION. An orthographic view is only
   measurable if the rotation preserves lengths, so the rotation is
   checked for orthonormality rather than assumed.
   ===================================================================== */
import {
  buildAirframe, minimumArmLengthM, smallestAngularGap, rotate, project,
  discPath, cylinderPaths, annulusPath, depthSort, yawBalance, DEG,
  parseDimsMm, cellLayout,
} from "../src/classes/drone/geometry3d.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { PROPELLERS } from "../src/data/drone-propellers.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE AIRFRAME GATE");
console.log("=".repeat(78));

const prop = PROPELLERS.find((p) => p.diameterM > 0.3 && p.static?.length >= 4);
const quad0 = FRAMES.find((f) => f.frameClass === "QUAD" && f.frameType === "X");
const R = prop.diameterM / 2;
const GAP = 0.10;

/* ── 1. THE ANGULAR GAP IS TAKEN FROM THE REAL AZIMUTHS ────────────── */
check("the smallest gap on an even quad is 90 degrees",
  Math.abs(smallestAngularGap([45, 135, -135, -45]) / DEG - 90) < 1e-9);

check("the wrap at 360 is handled",
  Math.abs(smallestAngularGap([350, 10, 90, 180]) / DEG - 20) < 1e-9,
  "350 to 10 is 20 degrees, not 340");

check("an uneven set reports its SMALLEST gap, not its average",
  Math.abs(smallestAngularGap([0, 10, 180, 190]) / DEG - 10) < 1e-9);

/* The frames where the even-ring shortcut would have been wrong. */
console.log("-".repeat(78));
console.log(`  ${"frame".padEnd(22)}${"N".padStart(3)}${"min gap".padStart(10)}` +
            `${"even 2pi/N".padStart(12)}${"arm mm".padStart(9)}${"even mm".padStart(9)}  verdict`);
let unevenFound = 0;
for (const f of FRAMES) {
  const azim = f.motors.map((m) => m.angleDeg);
  const gapDeg = smallestAngularGap(azim) / DEG;
  const evenDeg = 360 / f.motors.length;
  const rReal = minimumArmLengthM(azim, R, GAP);
  const rEven = R * (1 + GAP) / Math.sin((evenDeg / 2) * DEG);
  const uneven = Math.abs(gapDeg - evenDeg) > 0.5;
  if (uneven) {
    unevenFound++;
    if (unevenFound <= 6)
      console.log(`  ${`${f.frameClass}/${f.frameType}`.padEnd(22)}${String(f.motors.length).padStart(3)}` +
        `${gapDeg.toFixed(1).padStart(10)}${evenDeg.toFixed(1).padStart(12)}` +
        `${(rReal * 1000).toFixed(0).padStart(9)}${(rEven * 1000).toFixed(0).padStart(9)}  ` +
        `even-ring would UNDER-size by ${(100 * (rReal - rEven) / rReal).toFixed(0)} %`);
  }
}
check("some shipped frames are NOT evenly spaced, so 2pi/N is the wrong gap",
  unevenFound > 0,
  `${unevenFound} of ${FRAMES.length} frames have a smallest gap different from 360/N`);

/* ── 2. NO DISCS OVERLAP, ON EVERY FRAME IN THE DATABASE ───────────── */
console.log("-".repeat(78));
let worstClearance = Infinity, worstFrame = null, built = 0;
for (const f of FRAMES) {
  const air = buildAirframe({ frame: f, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
  built++;
  for (let i = 0; i < air.rotors.length; i++)
    for (let j = i + 1; j < air.rotors.length; j++) {
      const a = air.rotors[i], b = air.rotors[j];
      if (a.armIndex === b.armIndex) continue;   // coaxial pair: separated in z, by design
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const clearance = d - 2 * R;          // metres of tip-to-tip gap
      if (clearance < worstClearance) { worstClearance = clearance; worstFrame = `${f.frameClass}/${f.frameType}`; }
    }
}
check("every frame in the database builds an airframe", built === FRAMES.length,
  `${built} frames`);

check("no two discs overlap at the computed arm length, on any frame",
  worstClearance >= -1e-9,
  `tightest pair is ${worstFrame} at ${(worstClearance * 1000).toFixed(1)} mm of tip clearance`);

check("the declared tip gap is actually delivered",
  worstClearance >= 2 * R * GAP - 1e-6,
  `${GAP * 100} % of a ${(2 * R / 0.0254).toFixed(1)} in disc is ` +
  `${(2 * R * GAP * 1000).toFixed(0)} mm, and the tightest pair has ${(worstClearance * 1000).toFixed(1)} mm`);

/* Shrinking the arm below the computed minimum MUST overlap. */
const quad = FRAMES.find((f) => f.frameClass === "QUAD" && f.frameType === "X");
const rMin = minimumArmLengthM(quad.motors.map((m) => m.angleDeg), R, 0);
const tight = buildAirframe({ frame: quad, propellerDiameterM: prop.diameterM, tipGapFraction: 0, armLengthM: rMin * 0.95 });
const overlaps = (() => {
  for (let i = 0; i < tight.rotors.length; i++)
    for (let j = i + 1; j < tight.rotors.length; j++) {
      const a = tight.rotors[i], b = tight.rotors[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * R - 1e-9) return true;
    }
  return false;
})();
check("a 5 % shorter arm DOES overlap, so the minimum is genuinely minimal",
  overlaps, "the bound is tight, not conservative padding");

/* ── 2b. COAXIAL FRAMES ARE A THIRD OF THE DATABASE ────────────────── */
console.log("-".repeat(78));
const coax = FRAMES.filter((f) => {
  const a = buildAirframe({ frame: f, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
  return a.isCoaxial;
});
check("coaxial frames are built, not refused",
  coax.length >= 8,
  `${coax.length} of ${FRAMES.length} frames stack two motors per arm — every OCTAQUAD and DODECAHEXA`);

check("a coaxial pair is separated in z, not spread around the ring",
  (() => {
    const oq = FRAMES.find((f) => f.frameClass === "OCTAQUAD");
    const a = buildAirframe({ frame: oq, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
    const pair = a.rotors.filter((r) => r.armIndex === a.rotors[0].armIndex);
    return pair.length === 2 && Math.abs(pair[0].z - pair[1].z) > 1e-6 &&
           Math.abs(pair[0].x - pair[1].x) < 1e-9 && Math.abs(pair[0].y - pair[1].y) < 1e-9;
  })(), "eight motors on four arms, stacked");

check("disc area counts ARMS, not motors",
  (() => {
    const oq = FRAMES.find((f) => f.frameClass === "OCTAQUAD");
    const a = buildAirframe({ frame: oq, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
    return a.discAreaCountsArms === true &&
           Math.abs(a.discAreaM2 - a.arms * Math.PI * R * R) < 1e-12 &&
           a.arms === 4 && a.rotors.length === 8;
  })(), "two stacked rotors sweep one disc of air — the reason a pair is not worth two isolated rotors");

check("every coaxial frame carries the warning that its thrust is unsupported",
  coax.every((f) => {
    const a = buildAirframe({ frame: f, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
    return typeof a.coaxialUnmodelled === "string" && /ISOLATED rotor/.test(a.coaxialUnmodelled);
  }),
  "UIUC measured isolated rotors; the lower disc works in the upper's wake and no correction exists here");

check("a non-coaxial frame carries no such warning",
  (() => {
    const a = buildAirframe({ frame: quad0, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
    return a.isCoaxial === false && a.coaxialUnmodelled === null && a.arms === 4;
  })());

/* ── 3. TIP GAP IS DECLARED ────────────────────────────────────────── */
check("tip gap must be declared, with no default",
  (() => { try { minimumArmLengthM([0, 90, 180, 270], R, undefined); return false; } catch { return true; } })(),
  "tip clearance is a structural and acoustic choice; no vendor in the survey publishes theirs");

/* Sharing an azimuth is LEGITIMATE — that is what a coaxial arm is — so
   the refusal must fire only when there is no ring at all to space. */
check("rotors sharing an azimuth are a coaxial arm, not an error",
  (() => { const r = minimumArmLengthM([0, 0, 180, 180], R, 0.1); return isFinite(r) && r > 0; })(),
  "two arms at 0 and 180, each carrying two stacked motors");

check("a frame with only ONE distinct azimuth is refused",
  (() => { try { minimumArmLengthM([0, 0, 0], R, 0.1); return false; } catch { return true; } })(),
  "there is no ring to space, and dividing by the gap would be a divide by zero");

/* ── 4. THE PROJECTION IS MEASURABLE ───────────────────────────────── */
console.log("-".repeat(78));
const len = (p) => Math.hypot(p.x, p.y, p.z);
let worstLen = 0;
for (const v of [{ x: 1, y: 0, z: 0 }, { x: 0.3, y: -0.7, z: 0.2 }, { x: -0.5, y: 0.5, z: -0.5 }])
  for (const ang of [{ yawDeg: 37, pitchDeg: 21 }, { yawDeg: -110, pitchDeg: 64, rollDeg: 15 }])
    worstLen = Math.max(worstLen, Math.abs(len(rotate(v, ang)) - len(v)));
check("the rotation preserves length, so the view can be measured off",
  worstLen < 1e-12,
  `worst deviation ${worstLen.toExponential(1)} — an orthographic view is only measurable if this holds`);

const air = buildAirframe({ frame: quad, propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
const view = { scale: 200, cx: 300, cy: 200, viewYawDeg: 35, viewPitchDeg: 22 };
check("a projected disc is a closed path of finite points",
  (() => {
    const d = discPath(air.rotors[0], R, view);
    return d.endsWith("Z") && !/NaN|Infinity/.test(d) && d.split("L").length > 20;
  })(), "sampled rather than approximated by guessed ellipse parameters");

check("nothing projects to NaN",
  air.rotors.every((r) => { const p = project(r, view); return isFinite(p.sx) && isFinite(p.sy); }));

check("depth sorting orders rotors back to front",
  (() => {
    const s = depthSort(air.rotors, view);
    const d = s.map((r) => project(r, view).depth);
    return s.length === air.rotors.length && d.every((x, i) => i === 0 || x >= d[i - 1] - 1e-9);
  })());

/* ── 5. SPIN BALANCE IS REPORTED, NOT CORRECTED ────────────────────── */
console.log("-".repeat(78));
const balanced = FRAMES.filter((f) => {
  const b = yawBalance(f.motors.map((m) => ({ rotation: m.rotation })));
  return b.balanced;
}).length;
check("yaw balance is computed per frame and reported either way",
  balanced > 0 && balanced <= FRAMES.length,
  `${balanced} of ${FRAMES.length} frames have equal CW and CCW, so their hover reaction torques cancel`);

check("an unbalanced frame says what that costs rather than being corrected",
  (() => {
    const b = yawBalance([{ rotation: "CW" }, { rotation: "CW" }, { rotation: "CCW" }]);
    return b.balanced === false && /cannot yaw-trim/.test(b.note);
  })());

/* ── 6. THE GEOMETRY MATCHES THE SOURCE DATA ───────────────────────── */
/* Rotors are emitted in ARM order, so identity is checked by motor
   number rather than by array position. */
check("every motor survives with its azimuth and spin unchanged from the flight code",
  air.rotors.length === quad.motors.length &&
  quad.motors.every((m) => {
    const r = air.rotors.find((x) => x.motor === m.motor);
    return r && r.angleDeg === m.angleDeg && r.rotation === m.rotation;
  }),
  "the view draws ArduPilot's table, not a redrawing of it");

check("x is forward and y is right, matching the azimuth convention",
  (() => {
    const nose = buildAirframe({ frame: { frameClass: "T", frameType: "T", motors: [
      { motor: 1, angleDeg: 0, rotation: "CW" }, { motor: 2, angleDeg: 90, rotation: "CCW" },
      { motor: 3, angleDeg: 180, rotation: "CW" }, { motor: 4, angleDeg: 270, rotation: "CCW" }] },
      propellerDiameterM: prop.diameterM, tipGapFraction: GAP });
    const fwd = nose.rotors[0], right = nose.rotors[1];
    return fwd.x > 0 && Math.abs(fwd.y) < 1e-9 && right.y > 0 && Math.abs(right.x) < 1e-9;
  })(), "azimuth is clockwise from the nose, so 0 is forward and +90 is right");


/* ── SOLIDS DRAWN AT PUBLISHED DIMENSIONS ──────────────────────────────
   The view gained shaded solids for the motor stator and the cells. The
   risk they introduce is not visual: it is that a solid drawn at an
   ASSUMED size reads as a measurement. So the parser must refuse a field
   it cannot read rather than return a default, and a solid must be the
   published size and no other.

   Shading itself is checked too, in the only way that matters: the disc
   is still exactly the measured propeller radius after the gradients
   went in. Lighting moves no vertex, and this is what says so. */
console.log("\n  SOLIDS AT PUBLISHED DIMENSIONS");

check("a cell dimension string parses to its two published numbers",
  (() => {
    const d = parseDimsMm("21.55 (dia, max) x 70.15 (height, max)");
    return d && Math.abs(d.diameterMm - 21.55) < 1e-9 && Math.abs(d.heightMm - 70.15) < 1e-9;
  })(), "21.55 x 70.15 mm, as printed");

check("an unreadable or absent dimension is REFUSED, never defaulted",
  parseDimsMm(null) === null && parseDimsMm("") === null
  && parseDimsMm("21700") === null && parseDimsMm(undefined) === null,
  "a cell drawn at an assumed size would read as a measurement");

check("the cell layout uses the pack's own series and parallel counts",
  (() => {
    const l = cellLayout({ cellsSeries: 6, cellsParallel: 3 }, { diameterMm: 21.55, heightMm: 70.15 });
    return l && l.cells.length === 18 && l.cols === 6 && l.rows === 3;
  })(), "18 cells for a 6S3P pack");

check("cells are laid out symmetrically about the body centre",
  (() => {
    const l = cellLayout({ cellsSeries: 6, cellsParallel: 3 }, { diameterMm: 21.55, heightMm: 70.15 });
    const sx = l.cells.reduce((a, c) => a + c.x, 0), sy = l.cells.reduce((a, c) => a + c.y, 0);
    return Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9;
  })(), "the pack's centroid sits on the centre, not off to one side");

check("no layout is produced without both a pack and a published size",
  cellLayout(null, { diameterMm: 21, heightMm: 70 }) === null
  && cellLayout({ cellsSeries: 6, cellsParallel: 3 }, null) === null);

check("a cylinder's ring measures its published diameter across",
  (() => {
    const view = { scale: 1000, cx: 0, cy: 0, viewYawDeg: 0, viewPitchDeg: 0 };
    const c = cylinderPaths({ x: 0, y: 0, z: 0 }, 0.021, 0.070, view, 64);
    const xs = (c.bottom.match(/-?\d+\.\d+(?=,)/g) || []).map(Number);
    const widthM = (Math.max(...xs) - Math.min(...xs)) / view.scale;
    return Math.abs(widthM - 0.042) < 2e-4;
  })(), "a 21 mm radius ring is 42 mm across, so the solid is the published part");

check("the cylinder body extends UPWARD, against z-down",
  (() => {
    const view = { scale: 1000, cx: 0, cy: 0, viewYawDeg: 0, viewPitchDeg: 0 };
    const c = cylinderPaths({ x: 0, y: 0, z: 0 }, 0.021, 0.070, view, 24);
    return c.topCentre.sy < c.baseCentre.sy;
  })(), "z is down in the body frame, so a seated part rises to negative z");

check("the swept annulus is two rings in one path, so the hub shows through",
  (() => {
    const view = { scale: 500, cx: 0, cy: 0, viewYawDeg: 20, viewPitchDeg: 30 };
    const a = annulusPath({ x: 0, y: 0, z: 0 }, 0.178, 0.02, view, 24);
    return (a.match(/M/g) || []).length === 2 && (a.match(/Z/g) || []).length === 2;
  })(), "with fill-rule evenodd it is the area the blades sweep, not a filled disc");

check("shading changed no geometry: the disc is still the measured radius",
  (() => {
    const frame = FRAMES.find((f) => f.frameClass === "QUAD" && f.frameType === "X");
    const air = buildAirframe({ frame, propellerDiameterM: 0.356, tipGapFraction: 0.10 });
    return air.rotors.every((r) => Math.abs(r.radiusM - 0.178) < 1e-12);
  })(), "gradients and opacity move no vertex");

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE AIRFRAME GATE PASSED (${pass} checks)`
                       : `DRONE AIRFRAME GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
