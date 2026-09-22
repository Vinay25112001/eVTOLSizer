/* =====================================================================
   WING AUTO-POSITIONING — outer geometry loop
   =====================================================================
   Real conceptual design does not freeze the wing station. It positions the
   wing so the CG sits a chosen fraction of MAC ahead of the neutral point.
   The inherited engine had the station frozen at 0.2589*fusLen, so static
   margin was whatever fell out — and the in-sizing solver showed that constant
   had evidently been reverse-engineered to make the margin look right.

   WHY THIS NEEDS AN OUTER LOOP.

   The in-sizing scan (wingLEfracForTargetSM) holds MTOW, wing area and MAC
   fixed while sweeping the station. That is a PARTIAL solve: moving the wing
   also moves the wing aerodynamic centre, which changes the tail moment arm,
   which changes V-tail area and the Raymer fuselage weight (its Lt term),
   which changes empty weight and MTOW — shifting the CG and neutral point
   again. The scan cannot see that feedback, because it runs after convergence.

   WHY NOT SIMPLY ITERATE THE SCAN.

   The obvious approach — frac_{k+1} = scan(runSizing(frac_k)) — was implemented
   first and it FAILS on real designs. Because the scan's slope is a partial
   derivative that disagrees with the true one, the iteration overshoots and
   settles into a two-cycle. Measured on one such case:

       it3  frac 0.3120  SM 16.72%
       it4  frac 0.3015  SM 13.76%
       it5  frac 0.3100  SM 16.47%      ... alternating, never converging

   Under-relaxation only slowed the bouncing, it did not remove it, because the
   problem is a wrong derivative and not too large a step. 14 of 600 random
   designs did this.

   So the station is solved by a root find on the TRUE outer function

       g(frac) = SM( full sizing at frac ) - targetSM

   secant-first for speed, with bracketed bisection as the guaranteed fallback.

   NOT EVERY TARGET IS REACHABLE. Moving the wing aft carries the CG aft, which
   raises SM, but also shortens the tail arm, which lowers the neutral point.
   SM is therefore not monotonic in station: it peaks, then falls. On one
   measured design SM maxed at 14.4%, so a 15% target has no solution at that
   geometry. This reports that honestly instead of returning the closest
   non-solution — including the best margin actually attainable and where.
   ===================================================================== */

export const WING_FRAC_MIN = 0.06, WING_FRAC_MAX = 0.65;

/**
 * @param p     parameter set (p.autoPositionWing already known true)
 * @param core  the un-wrapped sizing function, runSizingCore
 */
export function solveWingPosition(p, core) {
  const targetSM = p.targetSM ?? 0.15;
  const smTol    = p.wingPosSMTol ?? 1e-3;    // 0.1 percentage point of MAC
  const maxEval  = p.wingPosMaxEval ?? 45;    // hard ceiling on full sizings
  /* Independent of maxEval. evals only counts CACHE MISSES, so a solver that
     oscillates between two stations it has already evaluated would never
     increment it — an earlier version spun forever on exactly that, growing the
     trace array until the heap died. In a browser that is a hung tab, so the
     iteration guard must not depend on the cache. */
  const maxIter  = p.wingPosMaxIter ?? 60;

  const baseFrac = p.wingLEfrac ?? 0.2589;

  /* MEMORY: a full sizing result carries multi-thousand-point payload-range and
     sweep arrays. An earlier version cached the whole result object per
     evaluation and exhausted the V8 heap when this ran across a large design
     sweep. The cache therefore holds only the scalar SM per station; the chosen
     geometry is rebuilt with one final sizing at the end. */
  const smCache = new Map();
  let evals = 0;

  const smAt = (frac) => {
    const key = frac.toFixed(6);
    if (smCache.has(key)) return smCache.get(key);
    let sm = null, seedFrac;
    try {
      const R = core({ ...p, wingLEfrac: frac, autoPositionWing: false });
      sm = isFinite(R?.SM) ? R.SM : null;
      seedFrac = R?.wingLEfracForTargetSM;
    } catch { /* leave sm null — an infeasible station is data, not a crash */ }
    evals++;
    smCache.set(key, sm);
    if (seedFrac !== undefined) lastSeed = seedFrac;
    return sm;
  };

  let lastSeed;
  const g     = (frac) => { const sm = smAt(frac); return sm == null ? null : sm - targetSM; };
  const clamp = (f) => Math.min(WING_FRAC_MAX, Math.max(WING_FRAC_MIN, f));

  const trace = [];
  const note  = (frac, how) => {
    if (trace.length >= 64) return;          // bounded: a trace is for diagnosis, not a log
    const sm = smCache.get(frac.toFixed(6));
    if (sm != null) trace.push({ frac: +frac.toFixed(5), SM: +sm.toFixed(5), how });
  };

  let bestFrac = baseFrac, bestErr = Infinity;
  const offer = (frac) => {
    const sm = smCache.get(frac.toFixed(6));
    if (sm == null) return;
    const e = Math.abs(sm - targetSM);
    if (e < bestErr) { bestErr = e; bestFrac = frac; }
  };

  /* Seed: the cheap in-sizing scan is a good first guess even though it is not
     a fixed point — it typically lands within ~0.003 of the true root. */
  const g0 = g(baseFrac);
  note(baseFrac, "seed");
  offer(baseFrac);
  const seed = lastSeed;

  let converged = g0 != null && Math.abs(g0) <= smTol;
  let solFrac = converged ? baseFrac : null;

  /* ── Phase 1: secant on the true function ─────────────────────────────── */
  if (!converged) {
    let fa = baseFrac;
    let fb = clamp(seed != null ? seed : baseFrac + 0.02);
    g(fb); note(fb, "secant-init"); offer(fb);

    let iter = 0;
    while (evals < maxEval && ++iter <= maxIter) {
      const ga = g(fa), gb = g(fb);
      if (gb != null && Math.abs(gb) <= smTol) { converged = true; solFrac = fb; break; }
      if (ga == null || gb == null || ga === gb) break;
      const next = clamp(fb - gb * (fb - fa) / (gb - ga));
      if (!isFinite(next) || Math.abs(next - fb) < 1e-6) break;
      /* Revisiting an already-evaluated station means the secant is cycling
         rather than converging — hand over to bracketed bisection. */
      if (smCache.has(next.toFixed(6))) break;
      g(next); note(next, "secant"); offer(next);
      fa = fb; fb = next;
    }
  }

  /* ── Phase 2: bracketed bisection — guaranteed, used when secant stalls ── */
  let bracketed = false;
  if (!converged) {
    /* Sweep for a sign change in g: coarse enough to stay cheap, wide enough to
       find the root wherever it lies in the physical station range. */
    const pts = [];
    const N = 12;
    for (let i = 0; i <= N && evals < maxEval; i++) {
      const f = WING_FRAC_MIN + (WING_FRAC_MAX - WING_FRAC_MIN) * i / N;
      if (g(f) != null) { pts.push(f); offer(f); }
    }
    let lo = null, hi = null;
    for (let i = 1; i < pts.length; i++) {
      const g1 = g(pts[i - 1]), g2 = g(pts[i]);
      if (g1 != null && g2 != null && g1 * g2 <= 0) { lo = pts[i - 1]; hi = pts[i]; bracketed = true; break; }
    }
    let biter = 0;
    while (bracketed && !converged && evals < maxEval && ++biter <= maxIter) {
      const mid = 0.5 * (lo + hi);
      const gm = g(mid);
      note(mid, "bisect"); offer(mid);
      if (gm == null) break;
      if (Math.abs(gm) <= smTol) { converged = true; solFrac = mid; break; }
      if (g(lo) * gm <= 0) hi = mid; else lo = mid;
      if (Math.abs(hi - lo) < 1e-5) break;
    }
  }

  /* ── Result ───────────────────────────────────────────────────────────── */
  /* Best margin attainable anywhere we looked — makes an unreachable target
     actionable instead of merely a failure flag. */
  let peakFrac = null, peakSM = -Infinity;
  for (const [k, sm] of smCache) {
    if (sm != null && sm > peakSM) { peakSM = sm; peakFrac = parseFloat(k); }
  }
  if (peakFrac == null) return core(p);   // nothing evaluated; let core throw honestly

  /* Rebuild the chosen geometry once. If the target could not be met, return
     the design the caller actually asked for rather than a substitute. */
  const finalFrac = converged ? solFrac : baseFrac;
  const R = core({ ...p, wingLEfrac: finalFrac, autoPositionWing: false });

  return {
    ...R,
    wingAutoPositioned:  converged,
    wingPosConverged:    converged,
    wingPosUnreachable:  !converged,
    wingPosBracketed:    bracketed,
    wingPosEvals:        evals + 1,
    wingPosHistory:      trace,
    wingPosTargetSM:     targetSM,
    wingPosSMError:      converged && isFinite(R?.SM) ? +(R.SM - targetSM).toFixed(5) : null,
    wingPosBestSM:       +peakSM.toFixed(5),
    wingPosBestFrac:     +peakFrac.toFixed(5),
    wingPosReason:       converged ? null
      : (bracketed
          ? `static margin crosses the ${(targetSM * 100).toFixed(1)}% target but jumps across it `
            + `discontinuously — the sizing loop lands on a different branch either side of the `
            + `crossing, so no wing station actually produces this margin. Usually a sign the `
            + `design itself is marginal; check whether MTOW and convergence are sane before `
            + `trusting any station here`
        : peakSM < targetSM
          ? `target SM ${(targetSM * 100).toFixed(1)}% exceeds the maximum attainable `
            + `${(peakSM * 100).toFixed(1)}% at this geometry (wing station `
            + `${peakFrac.toFixed(3)}); moving the wing further aft shortens the `
            + `tail arm faster than it carries the CG aft`
          : "no wing station in the physical range produced the target static margin"),
  };
}
