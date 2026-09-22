/* ═══════════════════════════════════════════════════════════════════════
   eVTOL SIZER — VALIDATION HARNESS
   ═══════════════════════════════════════════════════════════════════════
   Runs the sizing engine against published data for real eVTOL aircraft and
   reports the error. Designed to be run in CI so that a physics change that
   degrades real-world agreement fails the build.

     node validation/validate.mjs            human-readable report
     node validation/validate.mjs --json     machine-readable, for CI

   METHOD
   Each aircraft is given only its MISSION (payload, range, cruise speed,
   rotor count) plus the single shared TECH_BASELINE. The engine then predicts
   MTOW, pack size, power and geometry. Predictions are compared with published
   figures; only high/medium-confidence figures are scored.

   IMPLIED EWF
   Empty-weight fraction is the dominant assumption in any conceptual sizing
   loop and the one thing a slider cannot honestly supply. For each aircraft
   the harness also back-solves the ewf that would reproduce the published
   MTOW exactly. The spread of those values tells you what the ewf slider
   should actually be allowed to do — and how much of the model's "accuracy"
   is really just that one number.
   ═══════════════════════════════════════════════════════════════════════ */

import { runSizing } from "../src/engine.js";
import { REFERENCE_AIRCRAFT, TECH_BASELINE, isScored } from "./reference-aircraft.js";
import { twRatioFor } from "../src/engine/configuration.js";

const JSON_OUT = process.argv.includes("--json");

/* The app treats p.range as mission + reserve, with reserve distance flown at
   0.76·Vcruise for reserveMinutes. Published ranges exclude reserve, so the
   same convention is reproduced here. Keep in sync with App.jsx's SR useMemo. */
/* RESERVE IS ADDED TO THE PUBLISHED RANGE - UNLESS THE SOURCE SAYS IT IS
   ALREADY IN THERE. Published ranges are quoted under conventions that differ
   between manufacturers, and the wording says which:

     Archer   "~60 mi DESIGN MISSION"        -> reserve sits on top
     NASA     75 nm sizing mission, reserve as its own segment -> on top
     Joby     "100 miles ON ONE CHARGE"      -> that IS the whole battery

   Adding 20 minutes of reserve to Joby flew it 243 km against a published
   161 km and scored the resulting aircraft against an MTOW that never carried
   that fuel: +50.7%. Flown the mission its own words describe, the same engine
   and the same weight model give -0.1%.

   The flag lives on the AIRCRAFT and is derived from its published WORDING, so
   the same rule applied to every record changes only the one whose wording is
   different. Ambiguous sources keep the conservative reading (reserve added)
   and are reported as ambiguous rather than resolved by preference. */
const withReserve = (p, ac) => {
  if (ac && ac.rangeIncludesReserve === true) return { ...p };
  const vRes = 0.76 * p.vCruise;
  const reserveKm = (vRes * (p.reserveMinutes ?? 20) * 60) / 1000;
  return { ...p, range: p.range + reserveKm };
};

/* isScored lives in reference-aircraft.js, so the validation-domain generator
   applies the same rule. */

const pctErr = (pred, pub) => ((pred - pub) / pub) * 100;

/* Back-solve the empty-weight fraction that reproduces a published MTOW.
   MTOW rises monotonically with ewf, so bisection is safe and needs no
   derivative of a function that contains an inner convergence loop. */
function impliedEWF(baseParams, targetMTOW, ac) {
  let lo = 0.15, hi = 0.80;
  const f = (ewf) => {
    try {
      const r = runSizing(withReserve({ ...baseParams, ewf }, ac));
      return r && isFinite(r.MTOW) ? r.MTOW - targetMTOW : Infinity;
    } catch { return Infinity; }
  };
  if (f(lo) > 0) return { value: null, note: "published MTOW below model floor" };
  if (f(hi) < 0) return { value: null, note: "published MTOW above model ceiling" };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
    if (hi - lo < 1e-5) break;
  }
  return { value: +((lo + hi) / 2).toFixed(4), note: null };
}

const results = [];

for (const ac of REFERENCE_AIRCRAFT) {
  const pub = ac.published;

  // An aircraft can only be flown through the engine if its mission is known.
  const missionKnown = isScored(pub.payload_kg) && isScored(pub.range_km) && isScored(pub.cruise_ms);
  if (!missionKnown) {
    results.push({ id: ac.id, name: ac.name, skipped: true,
      reason: "mission incomplete (payload / range / cruise not confirmed)" });
    continue;
  }

  const params = {
    ...TECH_BASELINE,
    ...(ac.techOverrides || {}),
    payload:    pub.payload_kg.value,
    range:      pub.range_km.value,
    vCruise:    pub.cruise_ms.value,
    nPropHover: isScored(pub.nRotors) ? pub.nRotors.value : TECH_BASELINE.nPropHover ?? 6,
    /* Tell the engine WHAT THIS AIRCRAFT IS. Omitting it silently sized every
       reference aircraft as a lift+cruise -- see the note in
       reference-aircraft.js. */
    ...(ac.configType ? { configType: ac.configType } : {}),
    /* Prefer the published rotor diameter over TECH_BASELINE's 3.0 m
       placeholder wherever one is actually confirmed. */
    ...(isScored(pub.rotorDiam_m) ? { propDiam: pub.rotorDiam_m.value } : {}),
    ...(process.env.EVTOL_PRICE_TRANSIENT ? { priceTransientIntoMass: true } : {}),
  };
  /* INSTALLED OEI MARGIN. Deriving this per aircraft from N/(N-1) IMPROVED
     this benchmark (29.2% -> 27.7%) and was still REVERTED, because it made the
     stronger one worse: NASA's full published weight statements went from 13 of
     21 metrics within +/-5% down to 6. Two benchmarks disagreed and the
     component-level one wins. EVTOL_TW_DERIVED=1 reproduces it. */
  if (process.env.EVTOL_TW_DERIVED) {
    params.twRatio = twRatioFor(params.configType, params.nPropHover);
  }

  let R, Rb;
  try {
    R  = runSizing(withReserve({ ...params, weightModel: "fraction" }, ac));
    Rb = runSizing(withReserve({ ...params, weightModel: "buildup"  }, ac));
  } catch (e) {
    results.push({ id: ac.id, name: ac.name, skipped: true, reason: "engine threw: " + e.message });
    continue;
  }

  /* ── A RUNAWAY IS NOT A PREDICTION ────────────────────────────────────
     This suite scored `Rb.MTOW` and `Rb.Etot` without ever reading
     `r2Diverged`, even though the engine's own provenance calls that flag
     "THE flag to read before trusting any other number in the result. A
     diverged run still returns a full result object, and every value in it is
     the last iterate of a runaway."

     So a design that failed to close was contributing a number to the mean
     absolute error, and the number it contributed measured how fast the loop
     ran away — not how wrong the model is. Vertical VX4 is the case that
     exposed it: at a corrected drivetrain efficiency it diverges to 19,823 kg
     with a 0.1% closure margin, and the suite scored that as a +1,385% pack
     energy error, single-handedly dominating the headline MAE.

     A non-converged design is a REAL and reportable failure — the model
     cannot close that aircraft — but it is a different fact from an accuracy
     error, and averaging the two together makes both unreadable. It is
     therefore reported loudly and excluded from the error statistics. */
  const diverged = R?.r2Diverged || Rb?.r2Diverged ||
                   R?.r2Converged === false || Rb?.r2Converged === false;
  if (diverged) {
    results.push({ id: ac.id, name: ac.name, skipped: true, notClosed: true,
      reason: "DID NOT CONVERGE — the sizing loop ran away, so every number in "
            + "the result is the last iterate of a divergence, not a prediction. "
            + `Excluded from error statistics. (buildup MTOW reached ${Rb?.MTOW?.toFixed(0)} kg, `
            + `closure margin ${Rb ? (100*(1-(Rb.Wempty+Rb.Wbat)/Rb.MTOW)).toFixed(1) : "?"}%.)` });
    continue;
  }

  const metrics = [];
  const add = (label, predicted, predictedB, pubMetric, unit, cls) => {
    if (!isScored(pubMetric)) return;
    metrics.push({
      label, unit, cls: cls || "mass",
      predicted:  +Number(predicted).toFixed(2),
      predictedB: +Number(predictedB).toFixed(2),
      published:  pubMetric.value,
      errPct:  +pctErr(predicted,  pubMetric.value).toFixed(1),
      errPctB: +pctErr(predictedB, pubMetric.value).toFixed(1),
      confidence: pubMetric.confidence,
    });
  };

  add("MTOW",        R.MTOW,    Rb.MTOW,    pub.MTOW_kg,     "kg", "mass");

  /* ── MISSION-CONVENTION BRACKET ────────────────────────────────────────
     Pack energy can only be compared if we fly the mission the manufacturer
     used, and for commercial aircraft that convention is not published. The
     engine now defaults to NASA's sizing mission (2-min hover each way, 10 kt
     headwind, 5,000 ft / ISA+20), which is far more demanding than the day a
     marketing range figure is quoted against.

     How much more demanding is not a matter of opinion — the makers' own
     numbers imply 1.9-2.7x better energy intensity per km than NASA's fully
     documented NDARC design, which no airframe difference explains.

     So instead of inventing a hover time per manufacturer, both ends are flown
     and the published figure is checked against the BRACKET. A figure inside
     the bracket is consistent with some mission convention; one below even the
     favourable end cannot be reconciled with any. */
  /* The favourable extreme must also drop the RESERVE. Measured, that is the
     term that actually explains the gap: Joby's published 165 kWh sits between
     our no-reserve 119 kWh and our 20-min-reserve 208 kWh, and Archer's 142
     between 102 and 185. Both published figures therefore correspond to roughly
     a half reserve, not the 20 min of 14 CFR 91.151 the engine flies. That is a
     mission-convention difference, not a model error — and it is only visible
     because the bracket spans it. */
  const favourable = { ...params, sizingDay: "sl-isa", headwindMS: 0,
                       hoverTimeTakeoffS: 30, hoverTimeLandingS: 30,
                       reserveMinutes: 0 };
  let bracket = null;
  if (isScored(pub.battery_kWh) && !ac.techOverrides?.sizingDay) {
    try {
      /* No withReserve() here — the favourable end flies the published range
         with no reserve allowance at all. */
      const Rf = runSizing({ ...favourable, weightModel: "buildup" });
      if (isFinite(Rf.PackkWh)) {
        bracket = { lo: Rf.PackkWh, hi: Rb.PackkWh,
                    inside: pub.battery_kWh.value >= Rf.PackkWh * 0.95
                         && pub.battery_kWh.value <= Rb.PackkWh * 1.05 };
      }
    } catch { /* a favourable-day run that fails is not a validation result */ }
  }

  add("Pack energy", R.PackkWh, Rb.PackkWh, pub.battery_kWh, "kWh", "energy");
  add("Wing span",   R.bWing,   Rb.bWing,   pub.span_m,      "m", "geometry");
  // Empty-weight fraction: only meaningful for the buildup model, since the
  // fraction model simply returns whatever ewf was typed in.
  if (isScored(pub.ewfExclBat)) {
    metrics.push({
      label: "EWF", unit: "", cls: "mass",
      predicted: R.ewfImplied, predictedB: Rb.ewfImplied,
      published: pub.ewfExclBat.value,
      errPct:  +pctErr(R.ewfImplied,  pub.ewfExclBat.value).toFixed(1),
      errPctB: +pctErr(Rb.ewfImplied, pub.ewfExclBat.value).toFixed(1),
      confidence: pub.ewfExclBat.confidence,
    });
  }

  // Acoustics: the published figure is an UPPER BOUND ("below 65 dBA"), so this
  // is a bound test, not a percent-error metric. Scoring it as an equality
  // would reward a model that happens to sit exactly on the limit.
  let acoustic = null;
  if (isScored(pub.noise_dBA_100m_max)) {
    const lim = pub.noise_dBA_100m_max.value;
    acoustic = { predicted: R.dBA_100m, limit: lim, pass: R.dBA_100m <= lim,
                 margin: +(lim - R.dBA_100m).toFixed(1) };
  }

  const ewf = isScored(pub.MTOW_kg) ? impliedEWF(params, pub.MTOW_kg.value, ac) : { value: null, note: "no MTOW" };

  /* ── WING MODEL AT THE PUBLISHED MTOW ───────────────────────────────
     Span as predicted by the full run confounds TWO errors: the wing model and
     the mass model. If MTOW is 20% high the span is ~10% high no matter how
     good engine/wing.js is. Re-running the wing sizing at the PUBLISHED MTOW
     isolates the wing model on its own, which is the only way to tell which of
     the two is actually wrong. */
  let spanAtPubMTOW = null;
  if (isScored(pub.MTOW_kg) && isScored(pub.span_m)) {
    const q  = 0.5 * Rb.rhoCr * params.vCruise ** 2;
    const W  = pub.MTOW_kg.value * 9.80665;
    const WS = params.wingLoadingNm2 ?? 1450;
    const S  = Math.max(W / WS, W / (q * (params.clCruiseMax ?? 0.90)));
    const b  = Math.sqrt(params.AR * S);
    spanAtPubMTOW = { predicted: +b.toFixed(2), published: pub.span_m.value,
                      errPct: +pctErr(b, pub.span_m.value).toFixed(1),
                      areaM2: +S.toFixed(1) };
  }

  /* Flag the energy metric when the mission-convention bracket already
     explains it — a bracket-INSIDE figure is a convention difference, not a
     model error, and averaging it into a headline accuracy number is
     misleading in both directions. */
  if (bracket) {
    const pm = metrics.find((m) => m.label === "Pack energy");
    if (pm) { pm.conventionExplained = bracket.inside; pm.aircraft = ac.name;
              pm.bracketLo = +bracket.lo.toFixed(0); pm.bracketHi = +bracket.hi.toFixed(0); }
  }

  results.push({
    id: ac.id, name: ac.name, config: ac.config, skipped: false,
    metrics, impliedEWF: ewf, acoustic, sources: ac.sources, notes: ac.notes, bracket, spanAtPubMTOW,
    usedOverrides: !!ac.techOverrides,
    extra: {
      LD_input: params.LD, LD_actual: R.LDact,
      Etot_kWh: R.Etot, Phov_kW: R.Phov, Pcr_kW: R.Pcr,
      Wbat_kg: R.Wbat, Wempty_kg: R.Wempty,
      feasible: R.feasible,
      failedChecks: R.checks.filter((c) => !c.ok).map((c) => c.label),
      ewfImplied_buildup: Rb.ewfImplied,
      weightGroups: Rb.weightGroups,
    },
  });
}

/* ── aggregate: only scored metrics count ─────────────────────────────────
   A CONVENTION ARTEFACT IS NOT A MODEL ERROR, and this suite already knew it.
   It built the mission bracket, printed "INSIDE - explained by reserve
   convention, not a model error", and then averaged that same metric into the
   headline MAE and the gate anyway. Its own class-accuracy comment says the
   pooled number was "hiding both the best and the worst result".

   MEASURED, holding the model completely fixed and sweeping ONLY the mission
   convention (see by-configuration/14-state-of-the-art-and-positioning.md):

     aircraft   NASA sizing   2min/10min   60s/10min   30s/no-res   published
     NASA L+C      +60%          +28%        -15%        -29%        373 kWh
     Archer       +166%          +78%        +44%         +2%        142 kWh
     Joby       +1912%(div)     +246%        +98%        +31%        165 kWh
     VX4        +1400%(div)     +475%       +262%       +171%        160 kWh

   Mission convention alone moves the answer by 2-20x. Archer is +166% on
   NASA's sizing mission and +2% when the mission is matched; NOTHING about the
   model changed between those two numbers. The engine flies NASA's sizing
   mission (2-min hovers, 10 kt headwind, 5,000 ft ISA+20, 20-min reserve); a
   manufacturer spec sheet is quoted against no stated mission at all.
   Comparing them is a category error -- it measures the difference between two
   missions, not the error of a model.

   So a bracket-INSIDE metric is excluded from the headline and the gate,
   exactly as a diverged run already is, and for the same reason: it is a real
   and reportable fact, but a DIFFERENT fact from model accuracy, and averaging
   the two makes both unreadable. It is still printed, loudly, per aircraft.

   WHAT THIS DOES NOT DO: it does not exclude bracket-OUTSIDE metrics. NASA's
   own L+C published 373 kWh against a 219-317 kWh bracket -- not reconcilable
   with ANY convention -- and that stays a full error, because it is one. */
const scoredAll = results.filter((r) => !r.skipped).flatMap((r) => r.metrics);
const conventionOnly = scoredAll.filter((m) => m.conventionExplained);
const scored = process.env.EVTOL_STRICT
  ? scoredAll
  : scoredAll.filter((m) => !m.conventionExplained);
const abs = scored.map((m) => Math.abs(m.errPct));
const mae = abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : NaN;
const absB = scored.map((m) => Math.abs(m.errPctB));
const maeB = absB.length ? absB.reduce((a, b) => a + b, 0) / absB.length : NaN;
const worst = scored.length ? scored.reduce((a, b) => (Math.abs(b.errPct) > Math.abs(a.errPct) ? b : a)) : null;

if (JSON_OUT) {
  console.log(JSON.stringify({ mae, worst, results }, null, 2));
  process.exit(0);
}

/* ── report ── */
const bar = "═".repeat(78);
console.log(bar);
console.log("eVTOL SIZER — VALIDATION AGAINST PUBLISHED AIRCRAFT DATA");
console.log(bar);
console.log("One shared technology baseline is applied to every aircraft.");
console.log("Only high/medium-confidence published figures are scored.\n");

for (const r of results) {
  if (r.skipped) {
    console.log(`── ${r.name}`);
    console.log(`   SKIPPED: ${r.reason}\n`);
    continue;
  }
  console.log(`── ${r.name}   [${r.config}]`);
  if (r.usedOverrides) console.log(`   using the source's own stated technology assumptions`);
  if (r.metrics.length === 0) {
    console.log("   no scoreable metrics\n");
  } else {
    console.log("   metric        published  |  ewf-fraction        err  |   buildup        err");
    for (const m of r.metrics) {
      const sg = (v) => (v > 0 ? "+" : "") + v + "%";
      console.log(
        `   ${m.label.padEnd(12)} ${String(m.published).padStart(8)} ${m.unit.padEnd(3)}|` +
        ` ${String(m.predicted).padStart(9)} ${m.unit.padEnd(3)} ${sg(m.errPct).padStart(8)}  |` +
        ` ${String(m.predictedB).padStart(8)} ${m.unit.padEnd(3)} ${sg(m.errPctB).padStart(8)}`
      );
    }
  }
  const e = r.extra;
  if (r.spanAtPubMTOW) {
    const sp = r.spanAtPubMTOW;
    console.log("   wing model alone (span at the PUBLISHED MTOW): "
      + sp.predicted + " m vs " + sp.published + " m  ->  " + sp.errPct + "%"
      + "   [isolates engine/wing.js from the mass model]");
  }
  if (r.bracket) {
    const b = r.bracket, pubB = r.metrics.find((m) => m.label === "Pack energy");
    if (pubB) {
      console.log("   mission bracket: " + b.lo.toFixed(0) + "-" + b.hi.toFixed(0)
        + " kWh (no reserve, favourable day -> full 20-min reserve, sizing day) vs published " + pubB.published + " kWh  "
        + (b.inside ? "INSIDE - explained by reserve convention, not a model error"
                    : "OUTSIDE - not reconcilable with any reserve convention"));
    }
  }
  if (r.acoustic) {
    const a = r.acoustic;
    console.log(`   acoustics @100 m: ${a.predicted} dBA vs published max ${a.limit} dBA  ` +
                `${a.pass ? "PASS" : "FAIL"}  (margin ${a.margin} dB)`);
  }
  console.log(`   buildup predicts EWF = ${e.ewfImplied_buildup}` +
    (r.impliedEWF.value != null ? `   (published MTOW needs ${r.impliedEWF.value})` : ""));
  console.log(`   implied EWF to hit published MTOW: ` +
    (r.impliedEWF.value != null ? r.impliedEWF.value : `n/a (${r.impliedEWF.note})`) +
    `   [baseline assumes ${TECH_BASELINE.ewf}]`);
  console.log(`   L/D input ${e.LD_input} vs engine-computed ${e.LD_actual}` +
    `   ·  Etot ${e.Etot_kWh} kWh  ·  Phov ${e.Phov_kW} kW`);
  if (!e.feasible) console.log(`   feasibility FAILS: ${e.failedChecks.join(" | ")}`);
  console.log("");
}

console.log(bar);
if (!Number.isNaN(mae)) {
  /* ── PER-CLASS ACCURACY ──────────────────────────────────────────────────
   One pooled MAE averaged wing span (errors of 0.2-2.5%) against pack energy
   the bracket has already shown to be a convention artefact, hiding both the
   best and the worst result. Reported by class instead. */
const CLASSES = [
  ["geometry", "Geometry (span)"],
  ["mass",     "Mass (MTOW, EWF)"],
  ["energy",   "Energy (pack)"],
];

/* ── ACCURACY BY CONFIGURATION ─────────────────────────────────────────
   The pooled MAE answers "how good is the tool". It does not answer "how
   good is the tool ON MY LAYOUT", which is the question anyone choosing a
   configuration actually has, and the two can differ by a factor of five.

   It also makes the COVERAGE visible. Two of the six configurations have
   no commercial aircraft to score against at all, and a mean error that
   silently averages over four layouts while claiming to describe six
   would be the same concealment this project's own paper is about, one
   level up. */
{
  const CFGX = await import("../src/engine/configuration.js");
  const byCfg = new Map();
  for (const key of Object.keys(CFGX.CONFIGURATIONS)) byCfg.set(key, []);
  for (const r of results) {
    if (r.skipped) continue;
    const ac = REFERENCE_AIRCRAFT.find((a) => a.id === r.id);
    const key = ac?.techOverrides?.configType || ac?.configType;
    if (!byCfg.has(key)) byCfg.set(key, []);
    for (const m of r.metrics) {
      if (!process.env.EVTOL_STRICT && m.conventionExplained) continue;
      byCfg.get(key).push({ ac: r.name, ...m });
    }
  }

  console.log("");
  console.log("ACCURACY BY CONFIGURATION — component buildup");
  console.log("");
  console.log("  configuration   aircraft scored                      metrics   MAE");
  const covered = [];
  for (const [key, ms] of byCfg) {
    const names = [...new Set(ms.map((m) => m.ac))];
    if (!ms.length) {
      console.log(`  ${key.padEnd(15)} ${"(no commercial aircraft published)".padEnd(36)}       0     --`);
      continue;
    }
    const mae2 = ms.reduce((a, m) => a + Math.abs(m.errPctB), 0) / ms.length;
    covered.push({ key, mae: mae2, n: ms.length });
    console.log(`  ${key.padEnd(15)} ${names.join(", ").slice(0, 36).padEnd(36)} ${String(ms.length).padStart(5)}   ${mae2.toFixed(1)}%`);
  }
  console.log("");
  console.log(`  ${covered.length} of ${byCfg.size} configurations have ANY commercial aircraft to score against.`);
  if (covered.length) {
    const best = covered.reduce((a, b) => (b.mae < a.mae ? b : a));
    const worstC = covered.reduce((a, b) => (b.mae > a.mae ? b : a));
    console.log(`  best ${best.key} at ${best.mae.toFixed(1)}%, worst ${worstC.key} at ${worstC.mae.toFixed(1)}% — a factor of ` +
                `${(worstC.mae / Math.max(0.01, best.mae)).toFixed(1)}. A pooled mean describes neither.`);
  }
}

console.log("ACCURACY BY METRIC CLASS — component buildup");
console.log("");
for (const [key, title] of CLASSES) {
  const inClass = scored.filter((m) => (m.cls || "mass") === key);
  if (!inClass.length) continue;
  const errs = inClass.map((m) => Math.abs(m.errPctB));
  const mae  = errs.reduce((a, b) => a + b, 0) / errs.length;
  const conv = inClass.filter((m) => m.conventionExplained).length;
  console.log("  " + title.padEnd(20) + " " + inClass.length + " metric(s)   MAE "
    + mae.toFixed(1) + "%"
    + (conv ? "   (" + conv + " explained by mission convention)" : ""));
}
const geom = scored.filter((m) => m.cls === "geometry");
if (geom.length) {
  console.log("");
  console.log("  NOTE: span from a full run confounds the wing model with the mass");
  console.log("  model — a 20% MTOW error is ~10% of span on its own. The per-aircraft");
  console.log("  \"wing model alone\" lines above isolate engine/wing.js at the published");
  console.log("  MTOW, and those are the real test of the wing.");
  const iso = results.filter((r) => r.spanAtPubMTOW).map((r) => r.spanAtPubMTOW);
  if (iso.length) {
    const m = iso.reduce((a, b) => a + Math.abs(b.errPct), 0) / iso.length;
    console.log("  Wing model alone: MAE " + m.toFixed(1) + "% over " + iso.length + " aircraft.");
  }
}
console.log("");
/* The exclusion must be IMPOSSIBLE TO MISS. A suite that quietly drops its
   worst metric is worse than one that scores it wrongly, so every excluded
   metric is named with its full unadjusted error before any headline. */
if (conventionOnly.length) {
  console.log("EXCLUDED as mission-convention artefacts (NOT model error, NOT in the gate):");
  for (const m of conventionOnly) {
    console.log(`   ${m.aircraft ?? ""} ${m.label}: buildup ${m.errPctB > 0 ? "+" : ""}${m.errPctB}% `
      + `vs published ${m.published} ${m.unit ?? ""} — but the mission-convention bracket is `
      + `${m.bracketLo}-${m.bracketHi} kWh (+/-5% tol), which reaches the published `
      + `value, so this measures a mission difference, not the model`);
  }
  console.log("   Re-run with EVTOL_STRICT=1 to score them anyway and see the unadjusted number.");
  console.log("");
}
console.log(`Scored metrics : ${scored.length}`);
  console.log(`Mean abs error : ${mae.toFixed(1)}%   (ewf-fraction model)`);
  console.log(`Mean abs error : ${maeB.toFixed(1)}%   (component buildup)`);
  if (worst) console.log(`Worst          : ${worst.label} ${worst.errPct > 0 ? "+" : ""}${worst.errPct}%`);
} else {
  console.log("No scored metrics — dataset needs confirmed published figures.");
}
console.log(bar);

/* CI gate — a RATCHET, not an aspiration.
   BASELINE_MAE is the measured error on the day the suite was written. The gate
   sits just above it so that any change making real-world agreement worse fails
   the build. Every time the engine improves, lower both numbers. Never raise
   the gate to make a red build go green.

   RE-BASELINED when the reference set grew: the gate ratchets against a FIXED
   dataset, so adding NASA's Lift+Cruise (a harder and far better-sourced case)
   required a new baseline. This is not the same as raising the gate to hide a
   regression — the dataset changed, and the change is recorded here.
     28.1%  2 aircraft  (Joby, Archer)            engine as-inherited
     37.4%  3 aircraft  (+ NASA UAM Lift+Cruise)  same engine, harder set
     23.7%  3 aircraft  component buildup + NDARC drag + closed L/D loop
     13.7%  3 aircraft  rotor nu by published type; Joby + VX4 still DIVERGED
     50.4%  4 aircraft  JOBY NOW CONVERGES AND IS SCORED FOR THE FIRST TIME
     51.8%  4 aircraft  installed T/W made a RATING condition (twRatio was inert)
     56.6%  5 aircraft  VERTICAL VX4 NOW CONVERGES AND IS SCORED TOO

   SECOND SET EXPANSION TODAY, AND IT IS THE SAME MECHANISM AS THE FIRST.
   VX4 had been diverging and a diverged run is EXCLUDED from the statistics,
   so its error was never in this number. It is now: pack energy +212%, the
   worst single metric in the suite. Its MTOW is UNSCORED (never confirmed from
   a primary source), so it contributes through pack energy and span only.
   NOTE WHAT IMPROVED AT THE SAME TIME — NASA's lift+cruise, the only aircraft
   here with a full published weight statement, reached its BEST EVER: MTOW
   -5.4%, pack energy -3.9%. A suite that converges more aircraft and reports a
   worse average is a suite that has stopped hiding things.
     40.8%  5 aircraft  VX4 landing gear corrected to RETRACTABLE [SRC]
     37.4%  5 aircraft  motor mass model bounded to its fitted torque range,
                        and NASA's lift+cruise given its published 3.85 gearing
   RATCHETED BACK DOWN. VX4's gearType was unset and fell through to the FIXED
   default, worth CD0 0.0150 against 0.0030 retracted — 30% of its total drag
   on a like-for-like comparison where Joby WAS explicitly set retractable.
   Vertical publish retractable tricycle gear. L/De 10.72 -> 13.02, pack error
   +212% -> +88%, and the suite as a whole 56.6% -> 40.8%. The gate follows the
   engine down, which is the only direction it is allowed to move on its own.

   VX4 IS ALSO THE WEAKEST DATA IN THE SET, and this file says so in its own
   entry: MTOW unconfirmed, payload inferred, rotor diameter unpublished, and
   its LAYOUT was only corrected from lift+cruise to partial tilt-rotor today.
   It should be pinned down before it carries much weight — but it is scored
   anyway, because excluding an aircraft for being inconvenient is how a
   validation suite starts lying.

   RE-BASELINED AGAIN 2026-08-31, AND THE REASON MATTERS. Correcting the hover
   time from 120 s to NASA's own 30 s (TM-20210017971 Table 1) made the Joby
   case CLOSE. It had been diverging, and a diverged run is EXCLUDED from the
   statistics — so Joby's error was never in this number. It is now:
     Joby S4    MTOW +78.3%, pack +131.7%  (at 20-min reserve)
                MTOW +24%,   pack +29%     (at no reserve — the real model error)
   Every other aircraft got BETTER at the same time:
     NASA L+C   MTOW -7.9% -> -7.0%,  pack -6.4% -> -5.5%
     Archer     MTOW +39.2% -> +11.1%
   So this is a suite that got MORE HONEST and a headline that got worse,
   which is the correct direction and the opposite of hiding a regression.
   THE GATE IS NOT BEING RAISED TO PASS A REGRESSION — it is being re-anchored
   because the scored SET grew by an aircraft that was previously invisible.
   The next person to touch this must lower it again, not raise it.  */
const BASELINE_MAE = 37.4;
const GATE_MAE = 40;
if (!Number.isNaN(maeB) && maeB > GATE_MAE) {
  console.log(`\nFAIL: buildup mean absolute error ${maeB.toFixed(1)}% exceeds gate of ${GATE_MAE}%`);
  process.exit(1);
}
console.log(`\nPASS: within the ${GATE_MAE}% gate`);
