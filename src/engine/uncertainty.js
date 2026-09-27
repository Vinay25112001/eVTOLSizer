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

/* =====================================================================
   SAMPLED PROPAGATION - the same bands, drawn together instead of one at a time
   =====================================================================
   uncertaintyBand() above perturbs each tagged input alone and combines the
   excursions by root-sum-square, which assumes the effects add and cannot see
   an interaction between two inputs. This function draws EVERY tagged input at
   once from the same [LAY] bands, truncated to the same PHYSICAL_BOUNDS, and
   re-runs the sizing loop per draw, so the spread of the outcomes is the
   propagation the OAT approximates. Nothing here adds an assumption the OAT
   does not already carry; it removes one (additivity).

   What is deliberately the same as the OAT: the input set, the band per
   provenance status, the physical bounds, the requirement exclusion. What is
   different, and stated:

     - Sampling scheme. Latin hypercube (Helton & Davis, SAND2001-0417 p.13):
       each input's interval is cut into N equal strata, one draw per stratum,
       strata paired across inputs by random permutation. Chosen over plain
       Monte Carlo because it removes sample-to-sample wobble in the
       percentiles; the model is cheap, so it buys no accuracy plain MC would
       not (SAND2001-0417 p.55, quoted in the research corpus).
     - Uniform within each band. A band with no stated shape is an interval;
       the uniform is the maximum-entropy law on it, and anything peaked would
       assert information the registry does not hold. The OUTPUT is therefore
       a RANGE over assumed input ranges, and its percentiles are positions in
       that range, NOT a confidence interval; the note says so.
     - Truncation, not clamping. Where a band crosses a physical bound the
       draw is uniform on the intersection, so no probability piles up on the
       bound. Which inputs were truncated is reported, as the OAT reports
       clamping.
     - Counts are excluded. Rotor count and the like are integers and a draw
       of 10.4 rotors is not an aircraft (UNCERTAINTY-AND-RISK.md 1.4, trap 2).
       They are named in COUNT_KEYS because an integer VALUE does not identify
       one: aspect ratio 9 and wing loading 1371 N/m2 are continuous.
     - Non-converged draws are COUNTED and shown, never dropped silently;
       the percentiles are over the converged draws and say how many.
     - Replicates. Five independent replicates of N/5 with their own seeds,
       pooled for the headline and reported separately, so the reader can see
       whether the percentiles are stable at this N (SAND2001-0417 p.55: the
       only defensible way to judge sample size is to replicate and look).
     - Deterministic. A seeded LCG (the golden master's) drives every draw, so
       the same seed reproduces the same numbers bit for bit.

   THE SPLIT THE CORPUS INSISTS ON. UNCERTAINTY-AND-RISK.md 1.3 point 4: only
   parameters the designer cannot choose belong in an uncertainty sample -
   physics and technology constants; design variables belong in the trade
   grid. The OAT's tagged set mixes the two (fuselage length, aspect ratio,
   rotor diameter are decisions, not unknowns). DESIGN_VARIABLE_KEYS names
   that split so the sample can be run both ways; the default keeps the OAT's
   set so the two are comparable, and the result lists which design variables
   it sampled. The classification is a reading of the corpus rule, [LAY].
   ===================================================================== */

/* Integer and categorical inputs: never drawn continuously. */
export const COUNT_KEYS = new Set([
  "nPropHover", "nRotorsStopped", "nBlades", "boomCount", "nSeats", "nOccupants",
  "nPax", "hops", "nNoseWheels", "nMainWheels",
]);

/* Decisions the designer makes, per UNCERTAINTY-AND-RISK.md 1.3 point 4. [LAY]
   reading of that rule: geometry, layout, mission-profile and operating-rule
   choices. Technology and physics constants (efficiencies, cell energy,
   empty-weight calibration, model constants) are NOT here. */
export const DESIGN_VARIABLE_KEYS = new Set([
  "fusLen", "fusDiam", "AR", "taper", "tc", "propDiam", "wingLoadingNm2",
  "vtCh", "vtCv", "vtAR", "vtGamma", "climbAngle", "descentAngle", "rateOfClimb",
  "targetSM", "socMin", "hoverTimeTakeoffS", "hoverTimeLandingS", "tipSpeed",
]);

/* Same generator as validation/golden-master.mjs, so a seed means one thing. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/* Latin hypercube on the unit cube: N rows, d columns, each column a
   permutation of the N strata with one uniform draw inside each stratum. */
export function latinHypercube(N, d, rand) {
  const cols = [];
  for (let k = 0; k < d; k++) {
    const perm = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {              // Fisher-Yates on the strata
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    cols.push(perm.map((stratum) => (stratum + rand()) / N));
  }
  return Array.from({ length: N }, (_, i) => cols.map((c) => c[i]));
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function sampledBand(size, p, opts = {}) {
  const {
    objective = "MTOW", bands = BANDS, N = 200, replicates = 5, seed = 20260927,
    includeRequirements = false, excludeDesignVariables = false, keys = null,
  } = opts;

  const base = size(p);
  const base0 = base?.[objective];
  if (base0 == null || !isFinite(base0))
    return { error: "baseline did not produce a finite " + objective };

  const all = keys ?? Object.keys(p);
  const inputs = [], truncated = [], designVariablesSampled = [], designVariablesHeld = [];
  for (const k of all) {
    if (!isNumericInput(p[k])) continue;
    if (!includeRequirements && REQUIREMENT_KEYS.has(k)) continue;
    if (COUNT_KEYS.has(k)) continue;
    const st = INPUTS[k]?.status, w = bands[st];
    if (st == null || w == null) continue;
    if (DESIGN_VARIABLE_KEYS.has(k)) {
      if (excludeDesignVariables) { designVariablesHeld.push(k); continue; }
      designVariablesSampled.push(k);
    }
    const v0 = p[k];
    let lo = v0 * (1 - w), hi = v0 * (1 + w);
    if (lo > hi) [lo, hi] = [hi, lo];              // a negative base value
    const b = PHYSICAL_BOUNDS[k];
    const tLo = b ? Math.max(lo, b[0]) : lo, tHi = b ? Math.min(hi, b[1]) : hi;
    if (b && (tLo !== lo || tHi !== hi)) truncated.push({ key: k, low: tLo !== lo, high: tHi !== hi });
    if (!(tHi > tLo)) continue;                    // zero band, or bound-pinned: hold
    inputs.push({ key: k, status: st, band: w, baseValue: v0, lo: tLo, hi: tHi,
                  isDesignVariable: DESIGN_VARIABLE_KEYS.has(k) });
  }

  const R = Math.max(1, Math.floor(replicates));
  const perRep = Math.max(1, Math.floor(N / R));
  const samples = [];            // every draw, converged or not, in order
  const reps = [];
  for (let r = 0; r < R; r++) {
    const rand = lcg(seed + 7919 * r);
    const cube = latinHypercube(perRep, inputs.length, rand);
    const vals = [];
    for (let i = 0; i < perRep; i++) {
      const q = { ...p };
      inputs.forEach((inp, k) => { q[inp.key] = inp.lo + cube[i][k] * (inp.hi - inp.lo); });
      let y = null;
      try { const out = size(q); y = (out && !out.r2Diverged && isFinite(out[objective])) ? out[objective] : null; }
      catch { y = null; }
      samples.push({ replicate: r, value: y, converged: y != null, u: cube[i] });
      if (y != null) vals.push(y);
    }
    const sorted = vals.slice().sort((a, b) => a - b);
    reps.push({ replicate: r, drawn: perRep, converged: vals.length,
                p5: quantile(sorted, 0.05), p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95) });
  }
  const converged = samples.filter((s) => s.converged).map((s) => s.value).sort((a, b) => a - b);
  const drawn = R * perRep;      // PLANNED, so a draw that vanishes from `samples` is visible
  const p5 = quantile(converged, 0.05), p50 = quantile(converged, 0.5), p95 = quantile(converged, 0.95);
  const spread = (f) => {
    const xs = reps.map(f).filter((x) => x != null);
    return xs.length ? Math.max(...xs) - Math.min(...xs) : null;
  };

  return {
    objective, base: base0, seed, N: drawn, replicates: R, perReplicate: perRep,
    drawn, converged: converged.length, failed: drawn - converged.length,
    failedPct: drawn ? 100 * (drawn - converged.length) / drawn : 0,
    p5, p50, p95, min: converged[0] ?? null, max: converged[converged.length - 1] ?? null,
    p5Pct: p5 != null ? 100 * (p5 - base0) / base0 : null,
    p50Pct: p50 != null ? 100 * (p50 - base0) / base0 : null,
    p95Pct: p95 != null ? 100 * (p95 - base0) / base0 : null,
    replicateResults: reps,
    replicateSpread: { p5: spread((r) => r.p5), p50: spread((r) => r.p50), p95: spread((r) => r.p95) },
    inputs, inputsSampled: inputs.length,
    truncatedByPhysics: truncated,
    designVariablesSampled, designVariablesHeld,
    inputsSkipped: {
      requirements: includeRequirements ? [] : [...REQUIREMENT_KEYS].filter((k) => k in p),
      counts: [...COUNT_KEYS].filter((k) => k in p && isNumericInput(p[k])),
      untagged: all.filter((k) => isNumericInput(p[k]) && INPUTS[k]?.status == null),
      derived:  all.filter((k) => isNumericInput(p[k]) && INPUTS[k]?.status === "derived"),
    },
    samples,
    note:
      "A RANGE over assumed input ranges, not a confidence interval: each tagged "
      + "input is drawn uniformly within its [LAY] band (the same band widths as "
      + "the one-at-a-time screen), truncated to physical bounds, all inputs at "
      + "once by Latin hypercube, and the sizing loop re-run per draw. The "
      + "percentiles are positions in the outcome range under those bands and "
      + "carry no probability beyond them. Inputs are drawn independently; "
      + "correlations between them are not known and not modelled. Draws that "
      + "do not converge are counted, not dropped. Untagged and derived inputs "
      + "and user requirements are held fixed and listed; so are counts. "
      + (designVariablesSampled.length
          ? "Design variables (" + designVariablesSampled.join(", ") + ") are "
            + "sampled here to match the one-at-a-time screen; UNCERTAINTY-AND-"
            + "RISK.md 1.3 says they are decisions, not unknowns, and the run "
            + "with excludeDesignVariables shows the band without them. "
          : "Design variables are held at their values. ")
      + "Five replicates of N/5 are reported so the stability of the "
      + "percentiles at this N can be seen rather than assumed.",
  };
}
