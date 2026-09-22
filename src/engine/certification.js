/* =====================================================================
   CERTIFICATION BASIS AS A DESIGN CONSTRAINT
   =====================================================================
   Real conceptual design does not size an aircraft freely and then check the
   mass afterwards. The certification category is chosen FIRST and the design
   is sized to fit inside it. Archer Midnight is quoted at 3,175 kg — exactly
   the ceiling of SC-VTOL Issue 1, the rule in force when Midnight was being
   designed — which is not a coincidence, it is what designing to a category
   looks like.

   ── CORRECTED 2026-08-31, AND THE CORRECTION REVERSES AN EARLIER EDIT ──
   This module first used 3,175 kg citing SC-VTOL-01, and in doing so REPLACED
   an existing "MTOW < 5700 kg" check that was dismissed as "the CS-23
   aeroplane boundary, not SC-VTOL". THAT WAS WRONG. 5,700 kg is exactly the
   current SC-VTOL number and the original check was right.

   [SRC] EASA SC-VTOL **Issue 2**, consolidated in the Easy Access Rules for
   small category VCA (October 2024, with MOC-1 Issue 2, MOC-2 Issue 3, MOC-3
   Issue 2; MOC-4 followed July 2025): applies to a VTOL-capable aircraft with
   a pilot on board, "a passenger seating configuration of 9 or less and a
   maximum certified take-off mass of 5,700 kg or less".
   Issue 2 RAISED the MCTOM from the 3,175 kg (7,000 lb) of Issue 1 (2019).
   Both are kept below: an aircraft may still be certified against Issue 1.

   IT REMAINS A PARAMETER, NOT A WALL. Under Issue 1's 3,175 kg, NASA's own
   all-electric lift+cruise (8,210 lb = 3,724 kg) sat OUTSIDE the category, and
   a hardcoded limit would have declared NASA's own reference vehicle invalid.
   Under Issue 2's 5,700 kg it fits — which is precisely why a certification
   limit must be DATA that can be corrected, not a constant baked into the
   physics. It was corrected once already; it will change again.
   ===================================================================== */

/** [SRC] EASA SC-VTOL Issue 2 small category: MCTOM 5,700 kg, <=9 pax, pilot
    on board. THE CURRENT LIMIT. */
export const MTOM_SMALL_CATEGORY_KG = 5700;
/** [SRC] SC-VTOL Issue 1 (2019): 3,175 kg (7,000 lb). Superseded by Issue 2,
    kept because aircraft certified against Issue 1 still exist. */
export const MTOM_SMALL_CATEGORY_ISSUE1_KG = 3175;

/** Named certification bases, so a UI can offer the choice rather than
    burying a number. */
export const MTOM_LIMITS = {
  scVtolSmall: {
    kg: 5700,
    label: "EASA SC-VTOL Issue 2 small category (current)",
    /* Cited to the Special Condition itself, read 2026-09-06. The previous
       citation pointed at the Easy Access Rules consolidation (Oct 2024),
       which republishes this text rather than being its source, and added
       "pilot on board" — a qualifier that appears NOWHERE in Issue 2. The
       document says "person-carrying". */
    src: "[SRC] EASA SC-VTOL-02 Issue 2, 10 June 2024, VTOL.2005(a): 'an aircraft with a passenger seating configuration of 9 or less and a maximum certified take-off mass of 5 700 kg or less'. Scope per VTOL.2000(a) is a person-carrying VTOL-capable aircraft in the small category",
  },
  scVtolIssue1: {
    kg: 3175,
    label: "EASA SC-VTOL Issue 1 (2019, superseded)",
    src: "[SRC] <=9 passenger seats, MCTOM 3,175 kg (7,000 lb). SC-VTOL-02 Issue 2 change note: 'The maximum certified take-off mass (MCTOM) of 3 175 kg (7 000 lbs) in requirement VTOL.2005 of the first issue of the Special Condition is modified to 5 700 kg, leaving the maximum passenger seating configuration (MPSC) of 9 unchanged'",
  },
  none: {
    kg: Infinity,
    label: "No certification limit (research study)",
    src: "[LAY] unconstrained — for concept studies outside a certification basis",
  },
};

export const mtomLimitFor = (p) => {
  if (p?.mtomLimitKg != null) return Math.max(1, p.mtomLimitKg);
  const named = MTOM_LIMITS[p?.certBasis];
  return named ? named.kg : MTOM_SMALL_CATEGORY_KG;
};

/* ── THE INVERSE PROBLEM ────────────────────────────────────────────────
   "Size me an aircraft for 139 km" answers the wrong question when the answer
   is heavier than the category allows. The question a designer actually asks
   is the inverse: GIVEN the category, what mission closes?

   Bisection on range with the full sizing loop inside. This is the bracketed
   search Ugwueze et al. 2023 (Aerospace 10, 311) recommend for exactly this
   problem — "sizing an aircraft within the bounds of a regulatory limit such
   as the maximum mass for the aircraft category" — applied to the mission
   rather than to the mass.

   `size` is injected rather than imported so this module stays free of a
   circular dependency on engine.js.

   A range is FEASIBLE when the loop converges AND the converged MTOW is at or
   under the limit. Non-convergence counts as infeasible, which is correct: a
   design that does not close is not a lighter design, it is no design. */
export function maxRangeAtMTOM(size, p, opts = {}) {
  const limit   = opts.limitKg ?? mtomLimitFor(p);
  if (!isFinite(limit)) return { limitKg: limit, rangeKm: null, note: "no limit set" };
  const iters   = Math.max(6, opts.iterations ?? 22);
  const tolKm   = opts.tolKm ?? 0.5;
  const hiStart = Math.max(1, opts.maxRangeKm ?? (p.range ?? 139) * 2);

  const feasible = (rangeKm) => {
    let r;
    try { r = size({ ...p, range: rangeKm }); } catch { return { ok: false }; }
    const converged = !(r?.r2Diverged || r?.r2Converged === false);
    return { ok: converged && isFinite(r?.MTOW) && r.MTOW <= limit, MTOW: r?.MTOW, r };
  };

  /* A zero-range design still has to lift itself; if even that misses the
     limit the airframe alone is out of category and no mission helps. */
  const atZero = feasible(1);
  if (!atZero.ok) {
    return { limitKg: limit, rangeKm: 0, mtowKg: atZero.MTOW ?? null, iterations: 1,
      note: "no mission closes inside the limit — the airframe alone exceeds it" };
  }

  let lo = 1, hi = hiStart;
  const atHi = feasible(hi);
  if (atHi.ok) {
    return { limitKg: limit, rangeKm: hi, mtowKg: atHi.MTOW, iterations: 2, bounded: true,
      note: `feasible at the ${hi.toFixed(0)} km search bound; raise maxRangeKm to find the true maximum` };
  }

  let best = atZero, n = 2;
  for (; n < iters && (hi - lo) > tolKm; n++) {
    const mid = 0.5 * (lo + hi);
    const f = feasible(mid);
    if (f.ok) { lo = mid; best = f; } else { hi = mid; }
  }
  return {
    limitKg: limit,
    rangeKm: +lo.toFixed(1),
    mtowKg: best.MTOW ?? null,
    iterations: n,
    note: `bisection on range, ${n} sizing evaluations, converged to +/-${tolKm} km`,
  };
}

/** The same inverse question asked of payload: given the category and the
    mission, how much can it actually carry? */
export function maxPayloadAtMTOM(size, p, opts = {}) {
  const limit = opts.limitKg ?? mtomLimitFor(p);
  if (!isFinite(limit)) return { limitKg: limit, payloadKg: null, note: "no limit set" };
  const iters = Math.max(6, opts.iterations ?? 22);
  const tolKg = opts.tolKg ?? 1;
  const feasible = (payload) => {
    let r;
    try { r = size({ ...p, payload }); } catch { return { ok: false }; }
    const converged = !(r?.r2Diverged || r?.r2Converged === false);
    return { ok: converged && isFinite(r?.MTOW) && r.MTOW <= limit, MTOW: r?.MTOW };
  };
  let lo = 0, hi = Math.max(1, opts.maxPayloadKg ?? (p.payload ?? 455) * 2), best = null, n = 0;
  if (feasible(hi).ok) return { limitKg: limit, payloadKg: hi, iterations: 1, bounded: true,
    note: `feasible at the ${hi.toFixed(0)} kg search bound` };
  for (; n < iters && (hi - lo) > tolKg; n++) {
    const mid = 0.5 * (lo + hi);
    const f = feasible(mid);
    if (f.ok) { lo = mid; best = f; } else { hi = mid; }
  }
  return { limitKg: limit, payloadKg: +lo.toFixed(0), mtowKg: best?.MTOW ?? null,
    iterations: n, note: `bisection on payload, ${n} sizing evaluations` };
}
