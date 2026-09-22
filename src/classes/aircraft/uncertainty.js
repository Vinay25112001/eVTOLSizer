/* =====================================================================
   UNCERTAINTY — what the tool's own validation record says about a design
   =====================================================================
   The aircraft result used to carry a single plus-or-minus band, the mean
   absolute error of the method on real aircraft. That is wrong in three
   ways, and this module replaces it.

   1. THE RESIDUALS ARE NOT GAUSSIAN. A normal law with the airliner mean
      absolute error would put 35 % of aircraft inside 5 %; 51 % are inside
      it. Reading a mean absolute error as a standard deviation, or
      multiplying it by 1.2533 as the Gaussian relation invites, gives an
      interval that does not describe this tool. NASA measured the same
      thing for FLOPS gross weight and reported "even a bimodal response
      pattern is observed" (AIAA 2002-3140). So: empirical percentiles,
      nothing fitted.

   2. THE ERROR IS STRUCTURED, NOT RANDOM. Over the 168-aircraft record the
      error is 4.3 % for aircraft of 50 to 150 t and 25.4 % above 300 t;
      6.7 % for twins, 19.1 % for four-engine aircraft. Quoting the fleet
      figure to someone sizing an A380-class aeroplane understates the
      uncertainty by a factor of six. The band is therefore taken from the
      stratum the design falls in, and the stratum is named.

   3. BIAS IS NOT SCATTER. The classes validated on three aircraft have
      residuals that are almost all bias: the turboprop's are +14.8, +4.4
      and +2.0 %, so the mean and the mean absolute error are the same
      number and a symmetric band would imply an even chance of sizing
      light, which has not happened once. Where the sample cannot support
      an interval this module returns the residuals themselves and no
      interval, which is what NASA-STD-7009B [M&S 33] asks for.

   WHY NOT MONTE CARLO OVER THE INPUTS. Sampling input distributions is the
   usual answer and it is not available honestly: no public source gives a
   distribution for cruise TSFC, drag or an empty-weight fraction on a
   fixed-wing aircraft. The literature that pioneered the method says so in
   its own words - "triangular distributions are assumed", "the percentages
   in Table 4 are notional", "chosen for convenience" - and two of its
   tables are titled "ASSUMED VARIANCE". This tool's own input minima and
   maxima are UI plausibility bounds, not uncertainty ranges: cruise TSFC
   spans 0.45 to 0.90, which is every turbofan ever built. Sampling them
   would produce a confidence band that describes nothing.

   What IS defensible is a model-error distribution built from measured
   validation residuals, which is what DeLaurentis & Mavris do in AIAA
   2000-0422 - the one statistically grounded uncertainty model in this
   literature - and what the 168 residuals here are. See
   eVTOL_Sizing_Research/classes/cross-class/UNCERTAINTY-AND-RISK.md.
   ===================================================================== */

import { VALIDATION_RESIDUALS } from "./validation-residuals.js";
import { METHOD_ACCURACY } from "./engine.js";

/* Strata over the airliner record. A design is placed in the narrowest
   stratum that holds at least MIN_SAMPLE aircraft, so the band is as
   specific as the evidence allows and no more. */
const MIN_SAMPLE = 12;

const STRATA = [
  { id: "mass+engines", label: (d) => `${massBand(d.mtowKg).label}, ${d.engines} engines`,
    match: (r, d) => massBand(r.mtowKg).id === massBand(d.mtowKg).id && r.engines === d.engines },
  { id: "engines", label: (d) => `${d.engines}-engine aircraft`,
    match: (r, d) => r.engines === d.engines },
  { id: "mass", label: (d) => massBand(d.mtowKg).label,
    match: (r, d) => massBand(r.mtowKg).id === massBand(d.mtowKg).id },
  { id: "all", label: () => "all validated airliners", match: () => true },
];

const BANDS = [
  { id: "sub50", lo: 0, hi: 50e3, label: "under 50 t" },
  { id: "50-150", lo: 50e3, hi: 150e3, label: "50 to 150 t" },
  { id: "150-300", lo: 150e3, hi: 300e3, label: "150 to 300 t" },
  { id: "over300", lo: 300e3, hi: Infinity, label: "over 300 t" },
];
export const massBand = (kg) => BANDS.find((b) => kg >= b.lo && kg < b.hi) ?? BANDS[BANDS.length - 1];

/* Empirical percentile: the order statistic, with no interpolation and no
   distribution behind it. */
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[i];
}

function describe(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((t, x) => t + x, 0) / n;
  const mae = s.reduce((t, x) => t + Math.abs(x), 0) / n;
  return {
    n, mean, mae,
    p05: percentile(s, 0.05), p25: percentile(s, 0.25), p50: percentile(s, 0.50),
    p75: percentile(s, 0.75), p95: percentile(s, 0.95),
    min: s[0], max: s[n - 1],
    within5: s.filter((x) => Math.abs(x) <= 5).length,
    within10: s.filter((x) => Math.abs(x) <= 10).length,
    /* One-sided: the residuals are not symmetric, so say which way they lean. */
    over: s.filter((x) => x > 0).length,
  };
}

/* The uncertainty statement for a sized result.

   Returns, for the airliner class, an empirical interval drawn from the
   narrowest stratum with enough aircraft in it. For the classes validated
   on three aircraft it returns those three residuals and `interval: null`,
   because three points cannot carry a 5th-to-95th percentile and pretending
   otherwise is the thing this module exists to stop. */
export function uncertaintyOf(type, result) {
  const acc = METHOD_ACCURACY[type];
  const quantity = type === "transport" || type === "bizjet" ? "take-off mass" : "take-off mass";

  if (type !== "transport") {
    /* trainer, turboprop, bizjet: a handful of aircraft, and the error is
       mostly bias. Hand back the cases, not an interval. */
    return {
      kind: "cases", quantity, basis: acc.basis, summary: acc.summary, interval: null,
      note: "Validated on three aircraft. Three residuals cannot support a percentile interval, and for "
          + "these classes the error is mostly bias rather than scatter, so a symmetric band would imply a "
          + "chance of sizing light that has not been observed. The measured cases are listed instead.",
    };
  }

  const design = { mtowKg: result.mtowKg, engines: result.propulsion?.engines ?? 2 };
  for (const stratum of STRATA) {
    const hits = VALIDATION_RESIDUALS.filter((r) => stratum.match(r, design));
    if (hits.length < MIN_SAMPLE && stratum.id !== "all") continue;
    const errs = hits.map((r) => r.mtowErrPct);
    const d = describe(errs);
    const fleet = describe(VALIDATION_RESIDUALS.map((r) => r.mtowErrPct));
    return {
      kind: "empirical", quantity,
      stratum: stratum.label(design), stratumId: stratum.id,
      /* The residuals this interval was drawn from, so anything plotting a
         distribution uses the SAME population the interval came from rather
         than re-deriving a stratum and disagreeing with its own label. */
      residuals: errs,
      ...d,
      interval: { lo: d.p05, hi: d.p95 },
      fleet: { n: fleet.n, mae: fleet.mae, mean: fleet.mean },
      /* The absolute masses the interval implies, which is what a reader wants. */
      massLoKg: result.mtowKg * (1 + d.p05 / 100) / (1 + d.mean / 100),
      massHiKg: result.mtowKg * (1 + d.p95 / 100) / (1 + d.mean / 100),
      note: `From the ${d.n} validated aircraft in this stratum, not a fitted distribution. `
          + `The 5th to 95th percentile of the error is ${d.p05.toFixed(0)} % to ${d.p95.toFixed(0)} %, `
          + `with a ${d.mean >= 0 ? "high" : "low"} bias of ${Math.abs(d.mean).toFixed(1)} %. `
          + (stratum.id === "all"
              ? "No narrower stratum had enough aircraft, so this is the whole fleet and the design may sit in a harder corner of it."
              : `The whole-fleet figure would be ${fleet.mae.toFixed(1)} % absolute, which is ${fleet.mae < d.mae ? "narrower" : "wider"} than this stratum.`),
    };
  }
  return null;
}

/* The residuals themselves, for a plot: the design's stratum highlighted. */
export function residualsFor(type, result) {
  if (type !== "transport") return [];
  const design = { mtowKg: result.mtowKg, engines: result.propulsion?.engines ?? 2 };
  const band = massBand(design.mtowKg);
  return VALIDATION_RESIDUALS.map((r) => ({
    ...r, inStratum: massBand(r.mtowKg).id === band.id && r.engines === design.engines,
  }));
}
