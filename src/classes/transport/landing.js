/* =====================================================================
   LANDING FIELD LENGTH — 14 CFR 25.125, computed rather than correlated
   =====================================================================
   THE LINE THIS REPLACES, AND WHY IT HAD TO GO.

   The matching chart's landing constraint was Loftin's, in Scholz's SI
   form, and it is the line that sets the wing loading:

       m_ML/S = k_L · sigma · CLmax,L · s_LFL      with k_L = 0.107 kg/m³

   k_L is not a physical constant. Loftin fitted it as a regression of FAR
   landing field length against approach speed squared over eighteen 1970s
   aircraft, WITH THE OLD 1/1.69 SPEED CONVENTION BAKED INTO IT (NASA
   RP-1060 p. 106). Two things follow, and together they are why this file
   exists.

   First, the CLmax that line needs is not a lift coefficient. Put the
   737-800's own published numbers in — 66,360 kg over 124.58 m², a 1,649 m
   landing field length from Boeing D6-58325-6 §3.4.30 — and the equation
   demands CLmax = 3.02. The aeroplane's actual 1-g CLmax, from its
   published 144 kt approach speed via 25.125(b)(2)(i)(A), is 2.35. The gap
   is a factor of 1.28, and since S goes as 1/CLmax on that line, it is 28 %
   of wing area.

   Second, the gap decomposes and neither half is a mystery. A factor of
   1.117 is the obsolete speed convention: the rule has required
   V_REF >= 1.23 V_SR0 since Amendment 25-108, not 1.3 V_S, so the divisor
   is 1.513 rather than 1.69. The residual 1.15 is real physics k_L
   absorbed — a 1970s fleet's braking, spoilers and reverse are not a
   737-800's.

   So k_L and CLmax were a MATCHED PAIR, and the tool carried three gate
   checks saying so. This file dissolves the pair instead of re-fitting it:
   with the distance computed, k_L disappears from the landing constraint
   entirely and CLmax becomes an honest lift coefficient again.

   THE METHOD. The same shape as the take-off run in takeoff.js, which
   already integrates a braked deceleration with sourced friction, so the
   two field lengths are computed with one set of physics rather than one
   computed and one fitted.

   AIR DISTANCE, from the 50 ft height of 25.125(a) to touchdown. The
   work-energy theorem, not a correlation:

       W·h50 + (W/2g)(V_REF² - V_TD²) = D̄ · s_air

       s_air = [ h50 + (V_REF² - V_TD²)/(2g) ] / (D̄/W)

   The aeroplane arrives at the screen at V_REF and touches down at V_TD,
   having descended 50 ft; the height energy and the kinetic energy it
   sheds are both done as work against drag. D̄/W is the drag-to-weight in
   the landing configuration at the mean lift coefficient of the segment.
   Idle thrust is taken as zero, which is conservative — it lengthens the
   air distance — and is stated rather than tuned.

   V_REF is the regulation's: 25.125(b)(2)(i)(A), "V_REF may not be less
   than 1.23 V_SR0". The 25.149(f) V_MCL floor and the 25.143(h)
   manoeuvre-capability floor of (b)(2)(i)(B) and (C) are NOT applied —
   this tool computes neither — so V_REF here is a LOWER BOUND on the real
   one and the landing distance is correspondingly optimistic.

   GROUND ROLL, from touchdown to a stop. Integrated, with the braking
   model takeoff.js already uses and the same inputs: braking friction on
   the braked fraction of the normal load, less the lift still being
   carried, plus aerodynamic drag. A transition interval after touchdown
   during which the brakes are not yet developed, exactly as the rejected
   take-off has one.

   THE 60 PER CENT. 25.125 gives the certified LANDING DISTANCE. The
   number an airport quotes, and the number this tool's input carries, is
   the FIELD LENGTH, and 14 CFR 121.195(b) is what connects them: a turbine
   aeroplane may not be despatched unless it can make "a full stop landing
   at the intended destination airport within 60 percent of the effective
   length" of the runway. So

       s_LFL = s_landing / 0.60

   WHAT THIS DOES NOT MODEL: icing (25.125(a)(2)), the V_MCL and manoeuvre
   floors on V_REF, wind corrections (25.125(f)), reverse thrust or
   engine-out landing (25.125(g)), brake energy limits, runway slope, wet
   or contaminated surfaces, and the 25.125(c)(2) restriction on brake and
   tyre wear. Every one of those lengthens the distance or restricts the
   weight, so the figure here is optimistic in the same direction as its
   take-off counterpart.
   ===================================================================== */

const G = 9.80665, FT = 0.3048, RHO0 = 1.225;

/* ISA to the tropopause, shared shape with takeoff.js. */
function isa(hM) {
  const T0 = 288.15, P0 = 101325, L = 0.0065, R = 287.05287;
  if (hM <= 11000) {
    const T = T0 - L * hM;
    return { T, P: P0 * Math.pow(T / T0, G / (L * R)) };
  }
  const T = 216.65;
  return { T, P: 22632.06 * Math.exp((-G * (hM - 11000)) / (R * T)) };
}

/* 14 CFR 121.195(b): the despatch rule that turns a certified landing
   distance into a field length. */
export const DESPATCH_FACTOR = 0.60;

/* 14 CFR 25.125(b)(2)(i)(A). */
export const VREF_OVER_VSR0 = 1.23;

/* 14 CFR 25.125(a): "from a point 50 feet above the landing surface". */
export const SCREEN_HEIGHT_M = 50 * FT;

/* The certified landing distance and the field length it implies, at a
   given landing wing loading. */
export function landingFieldLength(p, wsLandingKgM2) {
  const atm = isa(p.fieldElevationFt * FT);
  const rho = atm.P / (287.05287 * (atm.T + p.fieldDeltaIsaC));
  const wsN = wsLandingKgM2 * G;

  /* 25.103: the reference stall speed is a 1-g speed. */
  const vsr0 = Math.sqrt((2 * wsN) / (rho * p.clMaxLanding));
  const vRef = VREF_OVER_VSR0 * vsr0;
  const vTd = (p.vTouchdownOverVref ?? 0.95) * vRef;

  /* Landing polar: clean profile drag plus the flap and gear increments
     the matching chart already uses (Scholz 5.19-5.21b), induced at the
     flapped Oswald factor. Same construction as takeoff.js. */
  const k = 1 / (Math.PI * p.wingAspectRatio * p.oswaldFlaps);
  const flap = (cl) => (cl >= 1.1 ? 0.05 * cl - 0.055 : 0);
  const cd = (cl) => p.cd0Clean + flap(cl) + 0.015 + k * cl * cl;

  /* AIR DISTANCE. Mean lift coefficient over the segment, from the mean of
     the squared speeds, which is what the energy form wants. */
  const vBar2 = 0.5 * (vRef * vRef + vTd * vTd);
  const clBar = (2 * wsN) / (rho * vBar2);
  const dOverW = cd(clBar) / clBar;
  const sAir = (SCREEN_HEIGHT_M + (vRef * vRef - vTd * vTd) / (2 * G)) / dOverW;

  /* GROUND ROLL. Integrated from touchdown, with a transition during which
     the brakes are not yet developed. */
  const q = (V) => 0.5 * rho * V * V;
  /* LANDING-SPECIFIC, and separate from the rejected take-off's values on
     purpose. The one thing that is unambiguously different is the ground
     spoilers: on landing they deploy and destroy lift, which is what puts
     the weight on the wheels. The braking coefficient and the delay are
     left equal to the RTO values rather than shortened and raised to fit —
     see their sources in defaults.js. */
  const clGround = p.landingSpoilers === false ? p.clGroundRoll : 0;
  const muBrake = p.landingMuBraking ?? p.muBraking;
  const brakedFraction = p.brakedWeightFraction;
  const decel = (V, braking) => {
    const lOverW = (q(V) * clGround) / wsN;
    const dragOverW = (q(V) * cd(clGround)) / wsN;
    const mu = braking ? muBrake * brakedFraction : p.muRolling;
    return -G * (dragOverW + mu * Math.max(0, 1 - lOverW));
  };
  /* Free roll at touchdown: 25.125 leaves the delay to the applicant, and
     this reuses the take-off model's transition rather than inventing a
     second number. */
  const tFree = p.landingFreeRollS ?? p.brakeTransitionS ?? 2.0;
  let s = 0, V = vTd, t = 0;
  const dt = 0.01;
  while (t < tFree && V > 0.1) {
    const a = decel(V, false);
    s += V * dt + 0.5 * a * dt * dt;
    V += a * dt; t += dt;
  }
  let guard = 0;
  while (V > 0.1 && guard++ < 200000) {
    const a = decel(V, true);
    s += V * dt + 0.5 * a * dt * dt;
    V += a * dt;
  }
  const sGround = s;

  const sLanding = sAir + sGround;
  return {
    fieldLengthM: sLanding / DESPATCH_FACTOR,
    landingDistanceM: sLanding,
    airDistanceM: sAir, groundRollM: sGround,
    vsr0, vRef, vTd, clBar, dOverW,
    rho, sigma: rho / RHO0,
  };
}

/* The landing wing loading that just makes a required field length: the
   landing line of the matching chart, computed rather than fitted. Field
   length rises monotonically with wing loading, so bisect. */
export function landingWingLoading(p, requiredM) {
  const f = (ws) => landingFieldLength(p, ws).fieldLengthM - requiredM;
  let lo = 50, hi = 1200;
  if (f(lo) > 0) return lo;                       // even a tiny wing loading overruns
  if (f(hi) < 0) return hi;                       // the requirement never binds
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (f(m) < 0) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}
