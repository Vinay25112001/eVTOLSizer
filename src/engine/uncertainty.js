/* =====================================================================
   UNCERTAINTY PROPAGATION - an error bar sourced from the provenance tags
   =====================================================================
   Every engine input already carries a provenance status in
   src/lib/provenance.js. Those tags ARE an uncertainty model that nobody has
   read as one. This module reads them as one: it turns "MTOW 3,046 kg" into
   "MTOW 3,046 kg, +X/-Y, dominated by <the three inputs that actually matter>".

   THE VALUE IS THAT THE RANKING IS SOURCED. The band WIDTHS below are [LAY]
   assumptions and are labelled as such - what is NOT an assumption is WHICH
   inputs get a wide band, because that comes from the same registry CI already
   enforces. An input cannot quietly acquire a narrow band without someone
   upgrading its evidence in the registry first.

   -- THE DISTINCTION THAT MAKES THIS HONEST -------------------------------
   "unverified" in the registry covers TWO different things, and conflating
   them would produce a meaningless number:

     - ASSUMPTIONS (eOsw 0.85, AR 9, clCruiseMax 0.90) - genuinely uncertain.
       We do not know the right value. These belong in the band.
     - REQUIREMENTS (payload, range, vCruise, cruiseAlt) - not uncertain at
       all. They are what the user ASKED FOR. Perturbing payload by 25% does
       not widen the error bar on this aircraft; it sizes a DIFFERENT one.
       Those belong in a parametric sweep, not here.

   REQUIREMENT_KEYS below is that separation, and it is the reason this is an
   uncertainty analysis rather than a disguised sensitivity sweep.

   -- METHOD ---------------------------------------------------------------
   One-at-a-time perturbation of each tagged input, re-running the full sizing
   loop each time. That is a Morris screening in all but name. Two combinations
   are reported because they answer different questions:

     RSS    sqrt(sum of squares) - the realistic band if the inputs are
            independent, which is the usual assumption and roughly right here.
     WORST  linear sum - the envelope if every assumption is wrong in the same
            direction at once. Always larger, and quoted so nobody mistakes the
            RSS band for a guarantee.

   OAT CANNOT SEE INTERACTIONS. Said out loud in the returned note rather than
   left for a reader to discover.
   ===================================================================== */

import { INPUTS } from "../lib/provenance.js";

/* Band half-width by provenance status. [LAY] - these widths are assumed;
   the ASSIGNMENT of inputs to them is not. */
export const BANDS = {
  validated:   0.01,   // checked against data and passing a gate
  sourced:     0.02,   // a published figure - reading and rounding only
  calibrated:  0.10,   // fitted to data, no independent source
  unverified:  0.25,   // an assumption
  derived:     null,   // computed elsewhere or superseded - not an independent input
};

/* Inputs that are USER REQUIREMENTS, not uncertain quantities. See the header. */
export const REQUIREMENT_KEYS = new Set([
  "payload", "range", "vCruise", "cruiseAlt", "hoverHeight", "reserveMinutes",
  "fieldElev", "deltaISA", "nPax", "hops", "reserveDistanceKm",
]);

/* -- PHYSICAL BOUNDS: the correction that made this an error bar ---------
   The first run of this module returned "MTOW 3,005 kg +/- 62%", dominated by
   etaBat with an elasticity of 2.22. That number was WRONG, and wrong in an
   instructive way: a +25% multiplicative band on a battery discharge
   efficiency of 0.90 perturbs it to 1.125 - a battery returning more energy
   than was drawn from it. The dominant contributor to the error bar was a
   physical impossibility, and a naive multiplicative perturbation will do this
   to EVERY efficiency, fraction and probability in any model.

   So excursions are CLAMPED to physical bounds before the loop is run, and the
   clamping is REPORTED rather than hidden: if a band is one-sided because
   physics stopped it, the reader is told. The upper limit is 0.995 rather than
   1.0 because a lossless component is no more real than a superunity one; it is
   simply the closest bound worth evaluating. */
export const PHYSICAL_BOUNDS = {
  /* DISCHARGE-path efficiency, not round-trip - an aircraft never charges in
     flight, so charge-side losses cannot size it. NDARC Theory sec.28:
     eta_batt = E_comp/E_batt. An earlier comment here said "round-trip", which
     was wrong about the quantity as well as about its bound. */
  etaBat:         [0.50, 0.995],  // discharge-path efficiency
  etaHov:         [0.40, 0.90],   // figure of merit; 0.9 is beyond any real rotor
  etaSys:         [0.40, 0.95],   // full propulsive chain incl. propeller
  eOsw:           [0.60, 0.995],  // Oswald span efficiency, 1.0 = elliptic
  socMin:         [0.00, 0.60],   // usable-SOC floor
  cRateDerate:    [0.00, 0.40],   // fractional derate
  ewf:            [0.30, 0.75],   // empty-weight fraction
  climbLDPenalty: [0.00, 0.50],
  taper:          [0.20, 1.00],
  tc:             [0.06, 0.25],
  targetSM:       [0.02, 0.40],
};

const clampToBounds = (k, v) => {
  const b = PHYSICAL_BOUNDS[k];
  if (!b) return { v, clamped: false };
  const c = Math.min(b[1], Math.max(b[0], v));
  return { v: c, clamped: c !== v };
};

const isNumericInput = (v) => typeof v === "number" && isFinite(v);

export function uncertaintyBand(size, p, opts = {}) {
  const {
    objective = "MTOW", bands = BANDS,
    includeRequirements = false, keys = null,
  } = opts;

  const base  = size(p);
  const base0 = base?.[objective];
  if (base0 == null || !isFinite(base0))
    return { error: "baseline did not produce a finite " + objective };

  const all = keys ?? Object.keys(p);
  const candidates = all.filter((k) => {
    if (!isNumericInput(p[k])) return false;
    if (!includeRequirements && REQUIREMENT_KEYS.has(k)) return false;
    const st = INPUTS[k]?.status;
    return st != null && bands[st] != null;
  });

  const contributions = [];
  for (const k of candidates) {
    const st = INPUTS[k].status, w = bands[st], v0 = p[k];
    const plus  = clampToBounds(k, v0 * (1 + w));
    const minus = clampToBounds(k, v0 * (1 - w));
    const at = (val) => {
      if (val === v0) return null;                 // clamped back onto the baseline
      try { const r = size({ ...p, [k]: val }); return (r && !r.r2Diverged) ? r[objective] : null; }
      catch { return null; }                       // infeasible excursion
    };
    const hi = at(plus.v), lo = at(minus.v);
    const seen = [hi, lo].filter((x) => x != null && isFinite(x));
    if (!seen.length) continue;
    /* Kept ASYMMETRIC. A symmetric half-range would hide exactly the case the
       clamping creates: an input free to fall but not to rise (etaBat) moves the
       objective one way only, and reporting +/-X for it would invent an upside
       the physics forbids. */
    const up   = Math.max(0, Math.max.apply(null, seen) - base0);
    const down = Math.max(0, base0 - Math.min.apply(null, seen));
    const half = Math.max(up, down);
    if (!(half > 0)) continue;
    contributions.push({
      key: k, status: st, band: w, baseValue: v0,
      atPlusInput: plus.v, atMinusInput: minus.v,
      clampedHigh: plus.clamped, clampedLow: minus.clamped,
      atPlus: hi, atMinus: lo, up, down, half,
      pctOfBase: 100 * half / base0,
      /* Elasticity: % change in the objective per % change in the input - a
         scale-free number, so inputs with different units can be ranked. */
      elasticity: w > 0 ? (half / base0) / w : null,
      oneSided: hi == null || lo == null || plus.clamped || minus.clamped,
    });
  }

  contributions.sort((a, b) => b.half - a.half);
  const rssUp   = Math.sqrt(contributions.reduce((s, c) => s + c.up   * c.up,   0));
  const rssDown = Math.sqrt(contributions.reduce((s, c) => s + c.down * c.down, 0));
  const rss   = Math.max(rssUp, rssDown);
  const worst = contributions.reduce((s, c) => s + c.half, 0);
  const top   = contributions.slice(0, 3);
  const topRss = Math.sqrt(top.reduce((s, c) => s + c.half * c.half, 0));

  return {
    objective, base: base0, rss, worst,
    rssPct: 100 * rss / base0, worstPct: 100 * worst / base0,
    rssUp, rssDown,
    band:     { lo: base0 - rssDown, hi: base0 + rssUp },
    envelope: { lo: base0 - worst, hi: base0 + worst },
    contributions,
    dominatedBy: top.map((c) => c.key),
    topThreeShareOfRSS: rss > 0 ? 100 * topRss / rss : 0,
    inputsPerturbed: contributions.length,
    clampedByPhysics: contributions.filter((c) => c.clampedHigh || c.clampedLow)
      .map((c) => ({ key: c.key, high: c.clampedHigh, low: c.clampedLow })),
    inputsSkipped: {
      requirements: includeRequirements ? [] : [...REQUIREMENT_KEYS].filter((k) => k in p),
      untagged: all.filter((k) => isNumericInput(p[k]) && INPUTS[k]?.status == null),
      derived:  all.filter((k) => isNumericInput(p[k]) && INPUTS[k]?.status === "derived"),
    },
    note:
      "Band widths are [LAY] assumptions; the ASSIGNMENT of inputs to them is "
      + "read from the provenance registry, so an input cannot get a narrow band "
      + "without its evidence being upgraded first. RSS assumes the inputs are "
      + "independent; the envelope is every assumption wrong the same way at "
      + "once. One-at-a-time perturbation CANNOT see interactions between "
      + "inputs. User requirements (payload, range, speed, altitude) are "
      + "excluded by design - perturbing those sizes a different aircraft. "
      + "Excursions are CLAMPED to physical bounds, so the band is asymmetric "
      + "wherever physics stops an input moving one way.",
  };
}
