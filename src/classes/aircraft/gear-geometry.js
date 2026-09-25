/* =====================================================================
   GEAR GEOMETRY — G6 of LANDING-GEAR.md section 1.5
   =====================================================================
   Turnover, tip-back, the nose-load floor, rotation clearance and
   propeller clearance. All five are measured from E, the CG height above
   the ground, which is why this package was blocked until vertical-cg.js
   existed and the ground line under it was fixed.

   THIS MODULE DOES NOT SOLVE FOR THE GEAR POSITION, AND THAT IS
   DELIBERATE. Section 1.5d offers a solve — choose B from (27), then A,
   then T from (25), "and iterate". This tool does not need it and should
   not pretend to: `balance.js` ALREADY places both gear stations, from
   the TASOPT 737 deck's own offsets, and has since B2. A and B therefore
   exist. Re-deriving them from the criteria that are supposed to JUDGE
   them would be scoring the layout against itself — and the park records
   what that costs: a fixed point was once built on GASP's FCGLIM that
   converged in twenty iterations and meant nothing.

   So this module EVALUATES the layout the tool already draws. The one
   quantity genuinely absent is the track, which nothing in the tool
   sets, and that is solved from (25) as a MINIMUM rather than a value.

   THE SYMBOLS ARE NACA SR-63's, so the equations can be read against the
   report without translating:

     l₁ = B   CG to the main axle
     l₂ = A   nose wheel to the CG
     l  = A + B, the wheelbase
     l₃ = T   the track
     h + r = E, the CG height above ground

   Note that A and B here are SR-63's, and they are the opposite way
   round from `gear/ground-loads.js`, which uses 14 CFR 25.493(e)'s
   convention where A is the NOSE arm. Both modules are internally
   consistent with the document they implement; this comment exists so
   that nobody reconciles them by assuming.
   ===================================================================== */

const IN = 0.0254;

/* geometry.js wraps its drawn values as { value, ... }. */
const valOf = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

/* Tyre/ground friction. 14 CFR 25.473(e) and 25.493(b) both prescribe
   0.8, and SR-63's own worked example turns over at exactly that value,
   which is the coincidence that makes the example a usable check. */
export const MU_GROUND = 0.8;

/* NACA SR-63 p. 9: "when l₁/l < 0.08, a slow oscillation in pitch,
   called 'porpoising', occurred." A floor, and section 3.4 measures real
   aircraft AT OR A LITTLE BELOW it, so it is reported as a warning and
   never as a hard failure. */
export const PORPOISING_FLOOR = 0.08;

/* 14 CFR 25.925(a) and 23.925(a), word for word the same: seven inches
   for a nose-wheel aeroplane, nine for a tail-wheel one. */
export const PROP_CLEARANCE_IN = { noseWheel: 7, tailWheel: 9 };

/* ── (25) LATERAL TURNOVER — NACA SR-63 p. 6 ──────────────────────────
   "The condition for nosing over will be  μ(h+r) ≥ l₂ sin tan⁻¹(l₃/2l)"
   so the aeroplane is SAFE while μ(h+r) < that, and the critical
   friction coefficient it turns over at is the value of μ that makes the
   two equal. Reporting μ_crit rather than a pass/fail is what lets the
   result be checked against SR-63's own worked aeroplane. */
export function turnoverMuCritical({ E, A, wheelbase, track }) {
  if (!(E > 0) || !(wheelbase > 0) || !(track > 0)) return null;
  const theta = Math.atan(track / (2 * wheelbase));
  return (A * Math.sin(theta)) / E;
}

/* The same equation solved the other way: the narrowest track that still
   survives a given μ. This is the only geometric quantity this module
   produces rather than judges, because nothing in the tool sets a track. */
export function minimumTrack({ E, A, wheelbase, mu = MU_GROUND }) {
  if (!(E > 0) || !(A > 0) || !(wheelbase > 0)) return null;
  const s = (mu * E) / A;
  if (!(s < 1)) return null;          // no track is wide enough; the CG is too high
  return 2 * wheelbase * Math.tan(Math.asin(s));
}

/* ── (26) TIP-BACK — NACA SR-63 p. 6 ──────────────────────────────────
   "the largest angle to which the airplane can be tilted backward and
   still return is approximately l₁/h radians". The note checked against
   the report's own W-1A that the "h" in that sentence is the full CG
   height, and that the small-angle form and the arctangent agree there. */
export function tipBackAngleDeg({ B, E }) {
  if (!(E > 0)) return null;
  return (Math.atan(B / E) * 180) / Math.PI;
}

/* ── THE EVALUATION ──────────────────────────────────────────────────*/
export function gearGeometry({ balance, ga, verticalCg, propDiameterM = 0 }) {
  const items = balance.items || [];
  const named = (re) => items.find((i) => re.test(i.name || ""));
  const main = named(/^Main gear$/);
  const nose = named(/^Nose gear$/);

  /* REFUSAL. A class that reports ONE combined gear item has a gear mass
     centroid, not a wheelbase, and treating that single station as the
     main axle puts the CG behind the wheels and reports a NEGATIVE nose
     load — an aeroplane sitting on its tail. Decline instead. */
  if (!main || !nose) {
    return {
      resolved: false,
      why: (named(/^Landing gear$/)
        ? "this class reports one combined \"Landing gear\" item, which is a mass "
        + "centroid and not a wheelbase; a single station cannot give A and B"
        : "this class reports no separate main and nose gear stations"),
    };
  }

  const E = verticalCg.eM;
  const xCg = balance.takeoff?.xM;
  const B = main.x - xCg;                 // l₁, CG to main axle
  const A = xCg - nose.x;                 // l₂, nose wheel to CG
  const wheelbase = main.x - nose.x;      // l
  const noseFraction = B / wheelbase;     // V_N/W, plain statics

  const minT = minimumTrack({ E, A, wheelbase });
  const tipBack = tipBackAngleDeg({ B, E });

  /* ── (28) ROTATION / TAIL CLEARANCE, 14 CFR 25.481(c) ──────────────
     Rotating about the main wheels, the aeroplane strikes its tail when
     the tail cone reaches the ground. The angle is set by how far the
     tail is aft of the main wheels and how high it sits above the
     ground. The regulation makes the available attitude the LESSER of
     the stalling angle and this clearance angle; the stalling angle is
     an aerodynamic quantity this module does not own, so what is
     reported is the geometric half and it says so. */
  const groundZ = ga.stance.z;
  const L = valOf(ga.fuselage.length);
  const H = valOf(ga.fuselage.height);
  const tailLen = valOf(ga.fuselage.tailLength);

  /* THE STRIKE POINT IS NOT THE TAIL TIP. The outline upsweeps the tail
     cone from the keel at −H/2 to +0.05 H at the tip, so the tip is high
     and far aft while the START of the cone is low and nearer. Rotating
     about the main wheels, a point at (x, z) runs out of clearance at
     atan((z − ground)/(x − x_main)), and the strike angle is the SMALLEST
     such angle over every point aft of the wheels. Taking the tip gives a
     larger, flattering angle that no real tail strike would respect.

     Sampled off the drawn keel rather than solved in closed form: a
     closed form would be a second copy of the outline's own convention,
     and the two would drift the moment either changed. */
  const xConeStart = L - tailLen;
  const P0 = { x: L, z: H * 0.05 };                   // FUSELAGE_CONVENTION.keelTipZ
  const P1 = { x: L - tailLen * 0.45, z: -H / 2 };    // FUSELAGE_CONVENTION.keelControlX
  const P2 = { x: xConeStart, z: -H / 2 };
  const keel = [{ x: xConeStart, z: -H / 2 }];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, v = 1 - u;
    keel.push({ x: v * v * P0.x + 2 * v * u * P1.x + u * u * P2.x,
                z: v * v * P0.z + 2 * v * u * P1.z + u * u * P2.z });
  }

  let strike = null;
  for (const pt of keel) {
    const arm = pt.x - main.x;
    if (arm <= 0) continue;             // forward of the wheels: it rises, not falls
    const deg = (Math.atan((pt.z - groundZ) / arm) * 180) / Math.PI;
    if (strike == null || deg < strike.deg) strike = { deg, x: pt.x, z: pt.z, arm };
  }

  /* ── (29) PROPELLER CLEARANCE, 14 CFR 25.925(a) / 23.925(a) ────────*/
  let propeller = null;
  if (propDiameterM > 0 && ga.props && ga.props.length) {
    const lowestTipZ = Math.min(...ga.props.map((p) => p.z - p.d / 2));
    const clearanceM = lowestTipZ - groundZ;
    const requiredM = PROP_CLEARANCE_IN.noseWheel * IN;
    propeller = {
      clearanceM, requiredM,
      compliant: clearanceM >= requiredM,
      marginM: clearanceM - requiredM,
      src: "14 CFR 25.925(a) / 23.925(a): seven inches, nose-wheel gear, "
         + "static, level take-off attitude",
    };
  }

  return {
    resolved: true,
    E, A, B, wheelbase, xCg,
    noseFraction,
    porpoising: {
      floor: PORPOISING_FLOOR,
      ratio: noseFraction,
      clears: noseFraction >= PORPOISING_FLOOR,
      /* Section 3.4 measures 4.6-12.7 % on flown aircraft, i.e. real
         aeroplanes sit at or a little below SR-63's floor. So falling
         under it is a remark, not a defect. */
      note: "NACA SR-63 p.9 gives 0.08 as the porpoising threshold; "
          + "LANDING-GEAR.md section 3.4 measures 4.6-12.7 % on flown "
          + "aircraft, so this is a soft warning and not a constraint",
    },
    turnover: {
      minimumTrackM: minT,
      mu: MU_GROUND,
      src: "NACA SR-63 p.6 eq. (25), with mu = 0.8 from 14 CFR 25.473(e)",
    },
    tipBack: { angleDeg: tipBack, src: "NACA SR-63 p.6 eq. (26)" },
    rotation: {
      angleDeg: strike ? strike.deg : null,
      strikePoint: strike ? { xM: strike.x, zM: strike.z, armM: strike.arm } : null,
      atTailTip: strike ? Math.abs(strike.x - L) < 1e-9 : null,
      /* (26) must EXCEED the rotation the aeroplane needs, or it sits
         down on its tail before it flies. Reported, not asserted: the
         rotation it NEEDS is a stalling angle this module does not have. */
      tipBackExceedsStrike: strike && tipBack != null ? tipBack > strike.deg : null,
      note: "the geometric half of 14 CFR 25.481(c) only: the regulation "
          + "takes the LESSER of the stalling angle and this clearance "
          + "angle, and the stalling angle is not this module's to supply",
    },
    propeller,
  };
}
