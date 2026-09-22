/* =====================================================================
   FAILURE-MODE CONTROLLABILITY — can it still be FLOWN after a failure?
   =====================================================================
   The OEI work in this engine asks whether enough THRUST survives a
   failure. That is necessary and nowhere near sufficient. An aircraft can
   have ample thrust after losing a rotor and still be uncontrollable,
   because the surviving rotors cannot produce the MOMENTS needed to hold
   attitude while producing that thrust. Those are different questions and
   this tool only ever asked the first.

   ── THE METHOD, AND IT IS NOT A HEURISTIC ────────────────────────────
   Du, G.-X., Quan, Q., Yang, B., Cai, K.-Y., "Controllability Analysis for
   Multirotor Helicopter Rotor Degradation and Failure", Journal of
   Guidance, Control, and Dynamics (arXiv:1403.5986), with the hexacopter
   application in Du, Quan & Cai, Journal of Intelligent & Robotic Systems,
   2015 (arXiv:1307.0276).

   Their control effectiveness matrix, equation (5), verbatim in structure:

       Bf = [  eta_i                    ]   total thrust
            [ -eta_i r_i sin(phi_i)     ]   roll
            [  eta_i r_i cos(phi_i)     ]   pitch
            [  eta_i w_i k_mu           ]   yaw

     "where w_i is defined by  1, if rotor i rotates anticlockwise;
      -1, if rotor i rotates clockwise"

   and eta_i in [0,1] "is used to account for rotor wear/failure. If the
   i-th rotor fails, then eta_i = 0."

   The attainable control set is Omega = {F : F = Bf f, f in F}, the image
   of the admissible per-rotor lift box. The Available Control Authority
   Index is defined as

     "rho(G, dOmega) ... which is the radius of the biggest enclosed sphere
      centered at G in the attainable control set Omega. In practice, it is
      the maximum control thrust/torque that can be produced in all
      directions."

   and Theorem 2 makes it the test: the system is controllable if and only
   if the rank condition holds AND rho(G, dOmega) > 0.

   G is the control required to hold hover: weight, and zero moments.

   ── WHY THIS IS WORTH HAVING, IN THEIR OWN RESULT ────────────────────
   "a hexacopter is uncontrollable when one rotor fails, even though the
   hexacopter is over-actuated and its controllability matrix is row full
   rank" — rank 8, ACAI 0. Rank is not the test. A different spin
   arrangement of the same six rotors survives the same failure. That is a
   result no amount of thrust bookkeeping can reach, and it is the reason
   this module exists.

   ── HOW ACAI IS COMPUTED HERE ────────────────────────────────────────
   Omega is a ZONOTOPE: the image of a box under a linear map, hence the
   Minkowski sum of m segments. Its facets have normals orthogonal to
   (4-1) = 3 of the generators, so every candidate normal is the null vector
   of a 3x4 matrix built from a combination of three columns. For each
   normal the support is sum|n.g_i| about the centre, and the distance from
   G to the two parallel facets follows directly. ACAI is the minimum over
   all of them, and is NEGATIVE when G lies outside Omega.

   That is exact for a zonotope rather than a sampled approximation, and it
   is O(C(m,3)) normals — 4 for a quadrotor, 220 for twelve rotors.

   ── WHAT THIS DOES NOT DO ────────────────────────────────────────────
   It is a HOVER controllability test, linearised about hover, which is what
   the source derives. It says nothing about the transient during the
   failure, about whether a control law exists that finds the attainable
   point, or about structural loads while it is happening. And the source is
   explicit that it "considers only the multirotor helicopters controlled by
   varying the RPM of each rotor" — which is exactly this tool's fixed-pitch
   layouts, and an extension for collective-pitch machines that it notes but
   does not derive.
   ===================================================================== */

/**
 * Torque-to-thrust ratio k_mu, in metres, derived rather than assumed.
 * Hover: P = T v_i / FM with v_i = sqrt(T / (2 rho A)); Q = P / Omega.
 *   k_mu = Q/T = v_i / (FM Omega) = v_i R / (FM Vtip)
 * Every term is a quantity this engine already sizes.
 */
export function torqueToThrustRatio({ thrustPerRotorN, R_m, tipSpeed_ms, FM, rho = 1.225 }) {
  const T = Number(thrustPerRotorN), R = Number(R_m), Vt = Number(tipSpeed_ms);
  const fm = Number(FM);
  if (![T, R, Vt, fm].every((x) => isFinite(x) && x > 0)) return null;
  const vi = Math.sqrt(T / (2 * rho * Math.PI * R * R));
  return (vi * R) / (fm * Vt);
}

/** Build Du et al. eq. (5). rotors: [{ r, phi, w, eta }] */
export function effectivenessMatrix(rotors, kMu) {
  return rotors.map((ro) => {
    const e = ro.eta == null ? 1 : Number(ro.eta);
    return [e, -e * ro.r * Math.sin(ro.phi), e * ro.r * Math.cos(ro.phi), e * ro.w * kMu];
  });               // columns b_i, returned row-per-rotor for convenience
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* Null vector of three 4-vectors: the generalised cross product in R^4,
   as the 4 signed 3x3 minors of the 3x4 matrix. */
function nullVec4(u, v, w) {
  const M = [u, v, w];
  const minor = (skip) => {
    const c = [0, 1, 2, 3].filter((i) => i !== skip);
    const [a, b, d] = c;
    return M[0][a] * (M[1][b] * M[2][d] - M[1][d] * M[2][b])
         - M[0][b] * (M[1][a] * M[2][d] - M[1][d] * M[2][a])
         + M[0][d] * (M[1][a] * M[2][b] - M[1][b] * M[2][a]);
  };
  return [minor(0), -minor(1), minor(2), -minor(3)];
}

/**
 * ACAI = rho(G, dOmega), the radius of the largest ball centred on the hover
 * requirement that fits inside the attainable control set.
 *
 * @param o.rotors    [{ r, phi, w, eta }]  positions, spin, health
 * @param o.kMu       torque/thrust ratio, m
 * @param o.fMaxN     maximum lift per rotor, N
 * @param o.weightN   aircraft weight, N  (G = [weightN, 0, 0, 0])
 * @returns { acai, controllable, rank, limitingAxis }
 */
export function acai(o = {}) {
  const rotors = o.rotors || [];
  const m = rotors.length;
  const fMax = Number(o.fMaxN), W = Number(o.weightN);
  if (m < 4 || !isFinite(fMax) || !isFinite(W) || fMax <= 0) return null;

  const cols = effectivenessMatrix(rotors, Number(o.kMu));

  /* Zonotope: centre at the mid-box, generators at half the lift range. */
  const centre = [0, 1, 2, 3].map((k) => cols.reduce((s, c) => s + c[k] * fMax / 2, 0));
  const gens = cols.map((c) => c.map((x) => x * fMax / 2));
  const G = [W, 0, 0, 0];
  const d = G.map((x, k) => x - centre[k]);        // hover point relative to centre

  let best = Infinity, limiting = null;
  const idx = [...Array(m).keys()];
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++)
      for (let k = j + 1; k < m; k++) {
        const n = nullVec4(gens[i], gens[j], gens[k]);
        const nn = Math.hypot(...n);
        if (nn < 1e-12) continue;                  // degenerate triple, no facet
        const support = gens.reduce((s, g) => s + Math.abs(dot(n, g)), 0);
        const proj = dot(n, d);
        /* distance to the two parallel facets normal to n */
        const dist = (support - Math.abs(proj)) / nn;
        if (dist < best) {
          best = dist;
          limiting = ["thrust", "roll", "pitch", "yaw"][
            n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)))];
        }
      }

  /* Rank of Bf, to report the distinction the source insists on: full rank
     does NOT imply controllable. Gaussian elimination on the 4 x m. */
  const A = [0, 1, 2, 3].map((k) => cols.map((c) => c[k]));
  let rank = 0;
  for (let col = 0, row = 0; col < m && row < 4; col++) {
    let piv = row;
    for (let rr = row; rr < 4; rr++) if (Math.abs(A[rr][col]) > Math.abs(A[piv][col])) piv = rr;
    if (Math.abs(A[piv][col]) < 1e-9) continue;
    [A[row], A[piv]] = [A[piv], A[row]];
    for (let rr = 0; rr < 4; rr++) if (rr !== row) {
      const f = A[rr][col] / A[row][col];
      for (let cc = 0; cc < m; cc++) A[rr][cc] -= f * A[row][cc];
    }
    row++; rank++;
  }

  /* ZERO MEANS ZERO. Theorem 2 requires rho STRICTLY greater than zero, and
     a zonotope whose boundary passes exactly through G returns a value at
     machine epsilon rather than 0.0 — the PNPNPN hexacopter does exactly
     this, and without a tolerance four of its six single-rotor failures were
     reported controllable on a residue of order 1e-16. The published result
     is that ALL of them are not. The tolerance is scaled by the weight, so
     it is dimensionally consistent with the thrust axis it guards. */
  const tol = 1e-9 * Math.max(1, Math.abs(W));
  const strictlyPositive = best > tol;

  return {
    acai: +best.toFixed(4),
    controllable: rank === 4 && strictlyPositive,
    rank,
    limitingAxis: limiting,
    /* The distinction the source insists on, made explicit: full rank does
       NOT imply controllable, and this flag is how a caller can see it. */
    fullRankButUncontrollable: rank === 4 && !strictlyPositive,
  };
}

/** Standard alternating spin, the arrangement almost every multirotor uses. */
export const alternating = (m) => Array.from({ length: m }, (_, i) => (i % 2 ? -1 : 1));

/**
 * Rotors evenly spaced on a ring, which is how this tool draws every
 * rotor-borne layout (see engine/geometry.js ringRadiusFor).
 */
export function ringRotors(m, r, spins) {
  const w = spins || alternating(m);
  return Array.from({ length: m }, (_, i) => ({
    r, phi: (2 * Math.PI * i) / m, w: w[i], eta: 1,
  }));
}

/** Fail one rotor (eta = 0) and return a new rotor set. */
export const failRotor = (rotors, i) =>
  rotors.map((ro, k) => (k === i ? { ...ro, eta: 0 } : ro));

/* =====================================================================
   WHICH SPIN ARRANGEMENT — the design variable nothing in this tool set
   =====================================================================
   Du, Quan & Cai's result is not that hexacopters are uncontrollable after
   a failure. It is that SOME ARRANGEMENTS OF THE SAME SIX ROTORS are and
   some are not: PNPNPN loses control on every single failure while PPNNPN
   "can remain controllable when one of some rotors fails". Identical
   geometry, identical thrust, different answer.

   Until now this engine assumed `alternating`, which for a hexacopter is
   exactly PNPNPN — the bad member of the published pair. That was not a
   decision anyone made; it was the default argument of ringRotors.

   THE SEARCH SPACE IS CONSTRAINED BY PHYSICS, NOT JUST BY COMBINATORICS.
   In nominal hover every rotor carries the same thrust, so the reaction
   torques sum to k_mu * sum(w_i). For that to be zero — no yaw trim demand
   with nothing failed — the arrangement must carry EQUAL numbers of
   clockwise and anticlockwise rotors. An odd rotor count cannot satisfy
   that at equal thrust at all, which is a real property of odd-rotor
   multirotors and is reported rather than worked around.

   That leaves C(m, m/2) sign vectors, and mirroring every rotor is the
   same aircraft viewed from below, so w[0] is fixed to +1: C(m-1, m/2-1)
   arrangements. Twenty become ten for a hexacopter, 924 become 462 for a
   twelve. Small enough to enumerate exhaustively rather than heuristically.

   NOT CALLED FROM THE SIZING LOOP. Each candidate costs m+1 ACAI
   evaluations and each of those is O(m^3), so a twelve-rotor search is
   ~1.3M null-space solves. runSizing is called repeatedly by the rotor
   diameter solver; putting this inside it would make sizing unusable. It
   is a post-convergence design study, which is what choosing a spin
   arrangement actually is.
   ===================================================================== */

/** Every balanced sign vector for m rotors, with w[0] fixed to +1. */
export function balancedSpins(m) {
  if (m % 2 !== 0 || m < 4) return [];
  const out = [];
  const need = m / 2 - 1;                    // further +1s among indices 1..m-1
  const rest = m - 1;
  const rec = (i, chosen, acc) => {
    if (chosen === need) {
      const w = Array(m).fill(-1);
      w[0] = 1;
      for (const k of acc) w[k] = 1;
      out.push(w);
      return;
    }
    if (i > rest) return;
    if (rest - i + 1 < need - chosen) return;
    rec(i + 1, chosen + 1, [...acc, i]);
    rec(i + 1, chosen, acc);
  };
  rec(1, 0, []);
  return out;
}

/**
 * Exhaustive search for the spin arrangement that survives the most single
 * rotor failures. Ties are broken on the worst ACAI across failures, so a
 * design that survives the same number of failures with more margin wins.
 *
 * @returns null for odd or too-small rotor counts, with `reason` explaining.
 */
export function bestSpinArrangement(o = {}) {
  const m = Math.round(Number(o.m) || 0);
  const { r, fMaxN, weightN, kMu } = o;
  if (m < 4) return { m, reason: "fewer than 4 rotors cannot span the 4-axis allocation" };
  if (m % 2 !== 0)
    return { m, reason: "an odd rotor count cannot balance reaction torque at equal thrust, "
                      + "so no arrangement is yaw-trimmed in nominal hover" };

  const score = (w) => {
    const rotors = ringRotors(m, r, w);
    /* An arrangement that cannot hover intact is not a candidate however
       well it tolerates failures. */
    const nominal = acai({ rotors, fMaxN, weightN, kMu });
    if (!nominal || !nominal.controllable) return null;
    let survivable = 0, worst = Infinity;
    for (let i = 0; i < m; i++) {
      const f = acai({ rotors: failRotor(rotors, i), fMaxN, weightN, kMu });
      if (!f) continue;
      if (f.controllable) survivable++;
      if (f.acai < worst) worst = f.acai;
    }
    return { w, survivable, worst, nominalACAI: nominal.acai };
  };

  const candidates = balancedSpins(m).map(score).filter(Boolean);
  if (!candidates.length)
    return { m, reason: "no balanced arrangement is controllable even intact" };

  candidates.sort((a, b) => (b.survivable - a.survivable) || (b.worst - a.worst));
  const best = candidates[0];
  const dflt = score(alternating(m));

  return {
    m,
    evaluated: candidates.length,
    best: { spins: best.w, survivable: best.survivable, worstACAI: +best.worst.toFixed(2) },
    default: dflt
      ? { spins: alternating(m), survivable: dflt.survivable, worstACAI: +dflt.worst.toFixed(2) }
      : { spins: alternating(m), survivable: 0, worstACAI: null,
          note: "the alternating arrangement is not controllable intact at this scale" },
    gain: dflt ? best.survivable - dflt.survivable : null,
  };
}

/* =====================================================================
   THE THRUST MARGIN CONTROLLABLE ONE-ROTOR-OUT ACTUALLY REQUIRES
   =====================================================================
   twRatioFor sizes installed thrust from NASA's OEI power-factor band,
   which is a THRUST-replacement argument: put back the lift the failed
   rotor was carrying. That is necessary and it is not the binding
   requirement. Holding ATTITUDE after the failure needs the survivors to
   produce moments as well as lift, and the margin that buys is larger.

   This solves for it directly rather than reading it off a table, because
   the answer depends on the aircraft: ring radius sets the moment arms,
   k_mu sets how much yaw authority a rotor has, and both come out of the
   converged design. Bisection on T/W, with the spin arrangement optimised
   at each trial, because the two variables are coupled — an arrangement
   that fails at one margin can succeed at another.

   NOT EVERY CONFIGURATION HAS A SOLUTION. A quadrotor cannot be made
   controllable after a single failure at ANY thrust margin: three
   surviving rotors cannot span the four-axis allocation while balancing
   reaction torque, so yaw is lost however much thrust is installed. The
   function returns null with a reason rather than bisecting forever, and
   a caller that treats "no solution" as "size it heavier" would be
   chasing an asymptote.
   ===================================================================== */

/**
 * Minimum installed T/W at which `target` single-rotor failures remain
 * controllable, with the spin arrangement chosen to suit each trial margin.
 *
 * @param o.target  how many of m failures must remain controllable.
 *                  Defaults to "any" (at least one).
 * @returns { twRequired, spins, survivable } or { reason } when unattainable.
 */
export function requiredTWForControllableOEI(o = {}) {
  const m = Math.round(Number(o.m) || 0);
  const { r, kMu, weightN } = o;
  const hi = Number(o.max) || 3.0;
  const target = o.target === "any" || o.target == null ? 1 : Math.min(m, Number(o.target));
  if (m < 4) return { reason: "fewer than 4 rotors cannot span the 4-axis allocation" };
  if (m % 2 !== 0) return { reason: "an odd rotor count is not yaw-trimmed at equal thrust" };

  const bestAt = (tw) => bestSpinArrangement({ m, r, kMu, weightN, fMaxN: weightN * tw / m });

  /* Is it attainable at all inside the search ceiling? */
  const top = bestAt(hi);
  if (!top.best || top.best.survivable < target)
    return {
      reason: `no arrangement reaches ${target} controllable failure(s) at T/W up to ${hi.toFixed(1)}`
            + (m === 4
                ? " — with four rotors this is structural: removing one leaves three inputs "
                  + "for four axes and yaw cannot be trimmed at any margin"
                : ""),
      ceilingTried: hi,
      bestAtCeiling: top.best ? top.best.survivable : 0,
    };

  /* Bisect between the known-bad floor and the known-good ceiling. Thrust
     replacement N/(N-1) is the natural floor: below it the surviving rotors
     cannot hold the weight at all, so controllability is moot. */
  const floor = m / (m - 1);
  const atFloor = bestAt(floor);
  if ((atFloor.best?.survivable ?? 0) >= target)
    return { twRequired: +floor.toFixed(3), spins: atFloor.best.spins,
             survivable: atFloor.best.survivable, target,
             note: "already met at thrust replacement" };

  let a = floor, b = hi;
  for (let i = 0; i < 24 && b - a > 1e-3; i++) {
    const mid = (a + b) / 2;
    if ((bestAt(mid).best?.survivable ?? 0) >= target) b = mid; else a = mid;
  }
  const at = bestAt(b);
  return {
    twRequired: +b.toFixed(3),
    spins: at.best.spins,
    survivable: at.best.survivable,
    target,
  };
}
