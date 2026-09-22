/* =====================================================================
   RISK — what is actually known to be uncertain about THIS design
   =====================================================================
   WHAT THIS DELIBERATELY IS NOT.

   It is not a five-by-five likelihood-consequence matrix. NASA does not
   publish one: NPR 8000.4C contains no matrix, no scales and no colour
   classification, and delegates them to each project's risk management
   plan; NASA/SP-20240014019 (2024), p. 74, states that the qualitative
   five-by-five "can no longer be considered valid". A matrix invented here
   would be decoration with an official-looking shape, and the research
   note recommends leading with an exceedance curve instead.

   It is not a Monte Carlo over input distributions either. No public
   source gives a distribution for cruise TSFC, drag or an empty-weight
   fraction on a fixed-wing aircraft. The literature that pioneered the
   method says so in its own words - "triangular distributions are
   assumed", "the percentages in Table 4 are notional", "chosen for
   convenience" - and two of its tables are titled "ASSUMED VARIANCE".
   Worse, this tool's own input minima and maxima are user-interface
   plausibility bounds, not uncertainty ranges: cruise TSFC spans 0.45 to
   0.90, which is every turbofan ever built. Sampling them would produce a
   confidence band that describes nothing.

   WHAT IT IS. Two things, both measured.

   1. AN EXCEEDANCE CURVE over the tool's own validation residuals, for the
      stratum this design falls in. It answers the only probabilistic
      question the evidence supports: of the aircraft like this one that
      the tool has been checked against, what fraction came out more than
      x per cent heavy or light. That is a model-error distribution built
      from measured residuals, which is the one statistically grounded
      construction in this literature (DeLaurentis & Mavris, AIAA
      2000-0422).

   2. A RISK REGISTER whose every entry is a fact about this design that
      can be checked, with the consequence quantified from the validation
      record wherever the record supports it. No likelihood is scored,
      because nothing here can honestly score one.
   ===================================================================== */

import { uncertaintyOf } from "./uncertainty.js";
import { METHOD_ACCURACY } from "./engine.js";

/* Exceedance: the fraction of validated aircraft whose error exceeded a
   given magnitude, and the signed cumulative distribution beside it. Both
   are order statistics of real residuals; nothing is fitted. */
export function exceedance(type, result) {
  const u = uncertaintyOf(type, result);
  if (!u || u.kind !== "empirical") return null;
  /* Use exactly the residuals the interval was drawn from. Re-deriving the
     stratum here produced a curve labelled "4-engine aircraft" computed over
     all 168. */
  const errs = [...u.residuals].sort((a, b) => a - b);
  const lo = Math.floor(Math.min(...errs)), hi = Math.ceil(Math.max(...errs));
  const curve = [];
  for (let x = lo; x <= hi; x += 1) {
    curve.push({
      errPct: x,
      /* P(error <= x): the empirical cumulative distribution. */
      cdf: (100 * errs.filter((e) => e <= x).length) / errs.length,
      /* P(|error| > |x|): what a reader actually wants - how often was it
         out by more than this much, either way. */
      exceed: (100 * errs.filter((e) => Math.abs(e) > Math.abs(x)).length) / errs.length,
    });
  }
  return { n: errs.length, stratum: u.stratum, stratumId: u.stratumId, curve, errs };
}

/* ── the register ─────────────────────────────────────────────────────
   Every entry names the evidence and, where the validation record
   supports it, the size of the consequence. `severity` orders the list for
   reading; it is NOT a score and is not multiplied by anything. */
export function riskRegister(type, result, extras = {}) {
  const out = [];
  const acc = METHOD_ACCURACY[type];
  const u = uncertaintyOf(type, result);
  const add = (r) => out.push(r);

  /* 1. How well has the method been checked for a design like this one? */
  if (u && u.kind === "empirical") {
    add({
      id: "validation-stratum", severity: u.n >= 30 ? "low" : u.n >= 12 ? "medium" : "high",
      title: "Strength of the validation evidence for this class of aircraft",
      evidence: `${u.n} validated aircraft in the stratum "${u.stratum}"; error 5th to 95th percentile `
              + `${u.p05.toFixed(0)} % to ${u.p95.toFixed(0)} %, bias ${u.mean >= 0 ? "+" : ""}${u.mean.toFixed(1)} %.`,
      consequence: `Take-off mass could reasonably fall anywhere in ${Math.round(u.massLoKg).toLocaleString("en-US")}`
                 + ` to ${Math.round(u.massHiKg).toLocaleString("en-US")} kg on this evidence alone.`,
      reduce: u.n < 30 ? "Add validated aircraft of this size and engine count to the dataset." : "No action: this is the best-evidenced stratum.",
    });
  } else {
    add({
      id: "validation-stratum", severity: "high",
      title: "This class is validated on three aircraft",
      evidence: `${acc?.basis ?? "three aircraft"}. The error is almost entirely bias rather than scatter, `
              + "so no interval is quoted at all.",
      consequence: "A quantitative confidence statement is not available for this class.",
      reduce: "Validate against more aircraft of this class before relying on the absolute numbers.",
    });
  }

  /* 2. Known-weak corners of the method, from the measured record. */
  const engines = result.propulsion?.engines ?? 2;
  if (engines >= 4) add({
    id: "four-engine", severity: "high",
    title: "Four-engine aircraft are the method's weakest group",
    evidence: "Over the 168-aircraft record, four-engine types size to 19.1 % mean absolute error with a "
            + "+12.5 % high bias, against 6.7 % for twins.",
    consequence: "The take-off mass is more likely to be overstated than understated, by a wide margin.",
    reduce: "Treat the result as indicative. The take-off run under 25.109/25.113 models the engine-count "
          + "effect that Loftin's statistical line cannot see, and may be the better choice here.",
  });
  else if (engines === 3) add({
    id: "three-engine", severity: "medium",
    title: "Three-engine aircraft size low",
    evidence: "11.8 % mean absolute error with a -5.7 % bias over the validated record.",
    consequence: "Take-off mass is likely understated.",
    reduce: "Compare against the DC-10 and MD-11 rows in the reality check.",
  });
  if (result.mtowKg > 300e3) add({
    id: "very-large", severity: "high",
    title: "Above 300 t the method has been checked on few aircraft and fits them badly",
    evidence: "25.4 % mean absolute error over 21 aircraft; only one of them sized within 5 %.",
    consequence: "The mass, and everything derived from it, carries an error of the order of a quarter.",
    reduce: "Do not use this for a very large aircraft without an independent weight estimate.",
  });
  if (result.mtowKg < 50e3 && type === "transport") add({
    id: "small", severity: "medium",
    title: "Below 50 t the airliner method is out of its comfortable range",
    evidence: "19.2 % mean absolute error over 12 aircraft.",
    consequence: "Consider whether the business-jet or turboprop class describes this aircraft better.",
    reduce: "Size it again in the class whose defaults match the aircraft.",
  });

  /* 3. How much of the design rests on inputs with no source. */
  const inputs = extras.inputs ?? {};
  const specs = extras.inputSpecs ?? {};
  const assumed = Object.entries(specs).filter(([, v]) => v?.status === "assumed").map(([k]) => k);
  if (assumed.length) add({
    id: "assumed-inputs", severity: assumed.length > 12 ? "medium" : "low",
    title: `${assumed.length} inputs carry no published source`,
    evidence: "Each is marked assumed in the input deck with the judgement behind it stated.",
    consequence: "These are design decisions rather than measured quantities; a different designer would "
               + "reasonably choose differently and get a different aeroplane.",
    reduce: "Hover each assumed chip and satisfy yourself the judgement suits your aircraft.",
  });

  /* 4. Things the tool does not model at all, which are risks precisely
        because their absence is silent. */
  add({
    id: "not-modelled", severity: "medium",
    title: "Effects not modelled that size real aircraft",
    evidence: "No balance or centre-of-gravity model, so the wing station and tail size are not closed. "
            + "No V_MCG, so the balanced field length has no lower bound from control power. No "
            + "aeroelastics, which 14 CFR 25.301(c) requires. Fuselage is not sized from the cabin.",
    consequence: "Each of these sizes a real aeroplane and none of them can push this one's mass down.",
    reduce: "Read the warnings tab, which lists the omissions for the methods actually selected.",
  });

  const order = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    entries: out,
    counts: { high: out.filter((r) => r.severity === "high").length,
              medium: out.filter((r) => r.severity === "medium").length,
              low: out.filter((r) => r.severity === "low").length },
    note: "Severity orders this list for reading. It is not a score, it is not multiplied by a likelihood, "
        + "and there is no five-by-five matrix here: NASA publishes no such scale (NPR 8000.4C has none) and "
        + "NASA/SP-20240014019 states the qualitative five-by-five can no longer be considered valid.",
  };
}
