/* =====================================================================
   TAKE-OFF FIELD LENGTH — the run itself, not a statistical fit
   =====================================================================
   The matching chart takes take-off field length from Loftin's statistical
   line (Scholz 5.10): one constant k_TO fitted to a fleet, with static
   thrust and a sea-level standard day. It cannot represent bypass ratio,
   flap setting, the V1 schedule or the runway state, and on the 737-800 it
   overpredicts the published field length by 7.9 %, which carries straight
   into 7.8 % of sized thrust.

   This module computes the distances the rule defines, by integrating the
   equations of motion along the run. Sources, all read (the CFR text is
   held verbatim in eVTOL_Sizing_Research/classes/transport/extracted/):

     14 CFR 25.109(a)  accelerate-stop distance, dry runway. The greater of
       (a)(1) accelerate all engines to VEF, accelerate from VEF to the
              highest speed of the rejected take-off with the critical
              engine failed at VEF and the reject begun at V1, stop, "plus
              a distance equivalent to 2 seconds at the V1 for takeoff from
              a dry runway"; and
       (a)(2) the same with all engines operating throughout, plus the same
              2 seconds at V1.
     14 CFR 25.113(a)  take-off distance, dry runway. The greater of
       (a)(1) the distance to 35 ft with the engine failure, and
       (a)(2) 115 percent of the all-engines distance to 35 ft.
     14 CFR 25.107     take-off speeds. V1 ≥ VEF plus the speed gained in
       the recognition interval (a)(2); V2MIN ≥ 1.13 VSR (b)(1); VR ≥ V1
       (e)(1)(i).

   The balanced field length is the V1 at which the accelerate-stop and
   take-off distances are equal — accelerate-stop grows with V1 and the
   take-off distance falls with it, so the crossing is unique — and the
   field length is the larger of the two branches there.

   Ground roll, from Newton's second law along the runway:

     a(V) = g [ T(V)/W − D(V)/W − μ (1 − L(V)/W) ]
     s    = ∫ V dV / a(V)

   with D/W = q CD/(W/S) and L/W = q CL/(W/S), so the whole calculation
   depends on the aircraft only through wing loading and thrust-to-weight
   and can be drawn as a curve on the matching chart.

   Thrust varies with speed: T(V) = T_static × deck(M(V), h). That alone is
   the audit's point that the take-off and climb requirements were using
   static thrust — worth about 9 % on the second-segment line.

   The air distance from lift-off to the 35 ft screen is an energy balance,
   not a correlation:

     s_air = [ (V2² − V_LOF²)/(2 g) + h_screen ] / ((T − D)/W)

   the excess thrust doing the work that raises the aircraft to the screen
   height and accelerates it to V2.

   WHAT IS ASSUMED, and it is a lot. The rule defines the distances, not
   the aeroplane: the speed schedule, the ground lift and drag, the braking
   friction and the rotation time all have to come from somewhere, and no
   public source gives them for a generic transport. Every one is an input
   with status "assumed" in defaults.js, and the whole method is off by
   default. It is offered because it can be checked against published field
   lengths, not because its inputs are sourced.

   WHAT IT MEASURES. Against the 23 dataset aircraft that publish a take-off
   field length together with a maximum take-off mass, wing area, thrust and
   engine count, each given its own class's high-lift values
   (run_tofl-far25-vs-loftin-2026-09-17b.txt):

     14 CFR 25.109/25.113  mean -2.7 %, mean absolute error 11.6 %
     Loftin (Scholz 5.10)  mean +21.3 %, mean absolute error 22.6 %

   On the 737-800, whose high-lift values are the ones the defaults describe,
   it gives 2,157 m against a published 2,195 m (-1.7 %) where Loftin gives
   +7.9 %, with a balanced V1 of 142 kt, and sizing that aircraft it gives
   thrust +2.3 % and take-off mass -0.7 % against the real aeroplane, where
   Loftin gives +7.8 % and +0.5 %.

   WHY IT IS STILL NOT THE DEFAULT. Over the whole 168-aircraft dataset, with
   the initial-cruise-altitude requirement on, it gives a mean take-off-mass
   error of -3.6 % and 8.3 % absolute, against the statistical line's -0.0 %
   and 8.8 % (run_takeoffFar25-ICA-2026-09-17.txt against
   run_default-2026-09-17f_loftinICA.txt). The absolute error is the better
   of the two and the bias is the worse, and the statistical line puts 87
   aircraft inside 5 % against this one's 84.

   The residual bias is concentrated in the three- and four-engine widebodies,
   and the reason is instructive: Loftin's take-off line carries no engine
   count at all, while losing one of four engines costs far less than losing
   one of two, so this method asks a quad for about 30 % less thrust to make
   the same balanced field. That is correct, and it means the take-off run
   does not size those aeroplanes - something else does, and the model of
   whatever that is (hot-day, long-range climb, or a cruise requirement the
   tool does not yet carry) is what would have to improve next. Prefer this
   method when the engine count or the configuration is unusual, precisely
   because the statistical line cannot see either.

   Not modelled: wet and contaminated runways (25.109(b)-(f)), clearways and
   the take-off run (25.113(c)), VMCG and VMU limits on V1 and VLOF
   (25.149, 25.107(e)(1)(iv)), reverse thrust (which 25.109 does not allow
   on a dry runway anyway), brake energy limits, and runway slope.
   ===================================================================== */

import { makeJetISA } from "./atmosphere.js";
import { deckShape } from "./engine-deck.js";

const G = 9.80665, FT = 0.3048;
const isa = makeJetISA(0);
const RHO0 = isa(0).rho;

/* Simpson integration of ∫ V dV / a(V) between two speeds. `accel` returns
   the acceleration (m/s², signed) at a speed. Returns a positive distance;
   an acceleration that changes sign inside the interval means the aircraft
   cannot make the speed, and the caller gets Infinity. */
function rollDistance(from, to, accel, steps = 20) {
  if (to <= from) return 0;
  const h = (to - from) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const V = from + i * h;
    const a = accel(V);
    if (!(Math.abs(a) > 1e-6) || a * accel(from) < 0) return Infinity;
    const f = V / a;
    sum += f * (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2);
  }
  return Math.abs(sum * h / 3);
}

/* One take-off, at a given V1. All speeds true airspeed, m/s. */
function run(c, v1) {
  const { rho, a0, wsN, twStatic, nE, cd, clGround, muRoll, muBrake, brakedFraction,
          vs, vr, vlof, v2, hFieldFt, rotationS, recognitionS, transitionS, screenM } = c;

  const q = (V) => 0.5 * rho * V * V;
  const thrustRatio = (V) => deckShape(V / a0, hFieldFt).maxThrustRatio;
  const idleRatio = (V) => deckShape(V / a0, hFieldFt).idleThrustRatio;

  /* Acceleration on the ground. `engines` is how many are producing thrust,
     `braking` swaps rolling friction for braking friction and idles the
     engines (25.109 does not credit reverse thrust on a dry runway). */
  const ground = (engines, braking) => (V) => {
    const qq = q(V);
    const lOverW = qq * clGround / wsN;
    const dOverW = qq * cd(clGround) / wsN;
    const tOverW = braking
      ? twStatic * idleRatio(V) * (engines / nE)
      : twStatic * thrustRatio(V) * (engines / nE);
    const mu = braking ? muBrake : muRoll;
    return G * (tOverW - dOverW - mu * Math.max(0, 1 - lOverW));
  };

  const accelAll = ground(nE, false);
  const accelOei = ground(nE - 1, false);
  /* Braking. 25.109(b)(2)(ii) asks for "the distribution of the normal load
     between braked and unbraked wheels": the nose gear carries part of the
     weight and does not brake, so only a fraction of the normal force turns
     into retarding force. The lift still on the wing is taken off the normal
     force first. Idle thrust still pushes forward; 25.109 does not credit
     reverse thrust on a dry runway. */
  const stopAll = (V) => -G * (muBrake * brakedFraction * Math.max(0, 1 - q(V) * clGround / wsN)
                              + q(V) * cd(clGround) / wsN
                              - twStatic * idleRatio(V));

  /* VEF is V1 less the speed gained in the recognition interval, with the
     engine already failed (25.107(a)(2)). */
  const aAtV1 = accelOei(v1);
  const vef = Math.max(0, v1 - Math.max(0, aAtV1) * recognitionS);

  /* The rejected take-off does not begin decelerating at V1. 25.109(a)(1)(ii)
     has the aeroplane "accelerate from VEF to the highest speed reached
     during the rejected takeoff", the pilot having taken the first action at
     V1, and (a)(1)(iii) then stops it "from the speed reached as prescribed
     in paragraph (a)(1)(ii)" — not from V1. The two seconds of (a)(1)(iv)
     are a separate margin added afterwards, not this interval.

     Between the first action and fully developed braking the engines spool
     down, the spoilers deploy and the brakes build pressure. Here thrust is
     taken to fall linearly from its operating value to idle across that
     interval with the brakes not yet effective, so the speed rises a little
     further and the stop starts from there. Integrated in time, because the
     interval is a duration rather than a speed range. */
  const transition = (engines) => {
    const n = 12, dt = transitionS / n;
    let V = v1, s = 0, vMax = v1;
    for (let i = 0; i < n; i++) {
      const left = 1 - (i + 0.5) / n;                    // thrust still spooling down
      const qq = q(V);
      const tOverW = twStatic * (engines / nE) * thrustRatio(V) * left
                   + twStatic * idleRatio(V) * (1 - left);
      const a = G * (tOverW - qq * cd(clGround) / wsN
                     - muRoll * Math.max(0, 1 - qq * clGround / wsN));
      s += V * dt + 0.5 * a * dt * dt;
      V = Math.max(0, V + a * dt);
      if (V > vMax) vMax = V;
    }
    return { s, V, vMax };
  };

  /* 25.109(a)(1): accelerate-stop with the engine failure. */
  const tOei = transition(nE - 1);
  const sA1 = rollDistance(0, vef, accelAll) + rollDistance(vef, v1, accelOei)
            + tOei.s + rollDistance(0, tOei.V, stopAll) + 2 * v1;
  /* 25.109(a)(2): the same with all engines operating throughout. */
  const tAeo = transition(nE);
  const sA2 = rollDistance(0, v1, accelAll)
            + tAeo.s + rollDistance(0, tAeo.V, stopAll) + 2 * v1;
  const accelStop = Math.max(sA1, sA2);

  /* Air distance from lift-off to the screen, by energy. */
  const air = (engines) => {
    const vm = 0.5 * (vlof + v2);
    const tOverW = twStatic * thrustRatio(vm) * (engines / nE);
    const clAir = wsN / q(vm);
    const dOverW = q(vm) * cd(clAir) / wsN;
    const excess = tOverW - dOverW;
    if (!(excess > 1e-4)) return Infinity;             // cannot climb to the screen
    return ((v2 * v2 - vlof * vlof) / (2 * G) + screenM) / excess;
  };

  /* 25.113(a)(1): to 35 ft with the engine failed at VEF. */
  const toOei = rollDistance(0, vef, accelAll) + rollDistance(vef, vr, accelOei)
              + rotationS * vr + air(nE - 1);
  /* 25.113(a)(2): 115 % of the all-engines distance to 35 ft. */
  const toAeo = 1.15 * (rollDistance(0, vr, accelAll) + rotationS * vr + air(nE));
  const takeoff = Math.max(toOei, toAeo);

  return { accelStop, takeoff, toOei, toAeo, sA1, sA2, vef,
           vMaxRto: Math.max(tOei.vMax, tAeo.vMax), balanced: accelStop - toOei };
}

/* Take-off field length (m) for a wing loading and thrust-to-weight.
     wsKgM2    maximum take-off mass over wing area, kg/m²
     twStatic  sea-level static thrust of all engines over take-off weight
   Returns the field length and the speeds and branch distances behind it. */
export function takeoffFieldLength(p, wsKgM2, twStatic) {
  const hFieldFt = p.fieldElevationFt;
  const atm = isa(hFieldFt * FT);
  /* Density at the field's pressure altitude and its temperature, which is
     the same σ the Loftin lines use. */
  const rho = atm.P / (287.05287 * (atm.T + p.fieldDeltaIsaC));
  const a0 = Math.sqrt(1.4 * 287.05287 * (atm.T + p.fieldDeltaIsaC));
  const wsN = wsKgM2 * G;
  const nE = p.numEngines;

  /* Take-off polar: clean CD0 plus the flap and gear increments the matching
     chart already uses (Scholz 5.19-5.21b), with the induced term at the
     flapped Oswald factor. */
  const k = 1 / (Math.PI * p.wingAspectRatio * p.oswaldFlaps);
  const flap = (cl) => (cl >= 1.1 ? 0.05 * cl - 0.055 : 0);
  const cd = (cl) => p.cd0Clean + flap(cl) + 0.015 + k * cl * cl;

  const vs = Math.sqrt(2 * wsN / (rho * p.clMaxTakeoff));
  const vr = p.vrOverVs * vs;
  const vlof = p.vlofOverVs * vs;
  const v2 = p.v2OverVs * vs;

  const c = { rho, a0, wsN, twStatic, nE, cd, clGround: p.clGroundRoll,
              muRoll: p.muRolling, muBrake: p.muBraking, brakedFraction: p.brakedWeightFraction,
              vs, vr, vlof, v2,
              hFieldFt, rotationS: p.rotationTimeS, recognitionS: p.recognitionTimeS,
              transitionS: p.brakeTransitionS, screenM: 35 * FT };

  /* The balanced V1: accelerate-stop rises with V1 and the take-off distance
     falls with it, so bisect on their difference. V1 cannot exceed VR
     (25.107(e)(1)(i)) and is bounded below well clear of a standstill. */
  const lo = 0.35 * vr, hi = vr;
  let fLo = run(c, lo).balanced, fHi = run(c, hi).balanced;
  let v1, r;
  if (!(fLo < 0) || !(fHi > 0)) {
    /* No crossing in range: the field length is then set at the V1 bound
       that gives the shorter field, which is what a real schedule would do. */
    const rLo = run(c, lo), rHi = run(c, hi);
    const useLo = Math.max(rLo.accelStop, rLo.takeoff) <= Math.max(rHi.accelStop, rHi.takeoff);
    v1 = useLo ? lo : hi; r = useLo ? rLo : rHi;
  } else {
    let a = lo, b = hi;
    for (let i = 0; i < 28; i++) {                       // 1e-6 m/s on V1
      const m = 0.5 * (a + b), f = run(c, m).balanced;
      if (f < 0) a = m; else b = m;
    }
    v1 = 0.5 * (a + b); r = run(c, v1);
  }

  const fieldLengthM = Math.max(r.accelStop, r.takeoff);
  return {
    fieldLengthM, v1, vef: r.vef, vr, vlof, v2, vs, vMaxRto: r.vMaxRto,
    accelStopM: r.accelStop, takeoffDistanceM: r.takeoff,
    takeoffOeiM: r.toOei, takeoffAeoM: r.toAeo,
    accelStopOeiM: r.sA1, accelStopAeoM: r.sA2,
    governedBy: r.accelStop >= r.takeoff ? "accelerate-stop" : "take-off distance",
    balanced: Math.abs(r.accelStop - r.toOei) / fieldLengthM < 0.01,
    rho, sigma: rho / RHO0,
  };
}

/* The thrust-to-weight that just makes a required field length at a given
   wing loading: the take-off line of the matching chart, computed rather
   than fitted. Field length falls monotonically with thrust, so bisect. */
export function takeoffThrustToWeight(p, wsKgM2, requiredM) {
  const f = (tw) => takeoffFieldLength(p, wsKgM2, tw).fieldLengthM - requiredM;
  let lo = 0.05, hi = 1.2;
  if (!(f(lo) > 0)) return lo;                 // even a token engine makes it
  if (f(hi) > 0) return NaN;                   // not attainable within range
  for (let i = 0; i < 28; i++) {                         // 4e-9 on T/W
    const m = 0.5 * (lo + hi);
    if (f(m) > 0) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}
