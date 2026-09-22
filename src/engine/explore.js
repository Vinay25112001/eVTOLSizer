/* =====================================================================
   DESIGN-SPACE EXPLORATION — compare, sweep, optimise
   =====================================================================
   Three capabilities that all amount to "run the sizing loop many times and
   report the shape of the answer". They are ANALYSIS LAYERS: none of them
   changes a sized result, so the golden master is untouched by all three.

   `size` is injected rather than imported, so this module carries no circular
   dependency on engine.js — the same pattern certification.js uses.

   A note on cost, because it is the thing that will bite a UI. This comment
   first estimated "5-20 ms per run". MEASURED on this machine it is 60-125 ms,
   three to six times worse, so the estimate is replaced by the measurement:

     compareConfigurations   6 runs      ~570 ms
     6x5 sweep              30 runs     ~3,800 ms   (125 ms/run)
     optimiser 9x8 + refine 216 runs   ~13,200 ms   (61 ms/run)

   compareConfigurations is just about live-renderable. A SWEEP AND THE
   OPTIMISER ARE NOT: a 40x40 grid is 1,600 runs and over three minutes. Drive
   both from an explicit user action with a progress indication, never from a
   slider onChange, and keep default grids coarse.
   ===================================================================== */

const converged = (r) => !!r && !(r.r2Diverged || r.r2Converged === false);

/* -- WHAT COUNTS AS A FAILURE -------------------------------------------
   This originally counted every check with ok:false, and that was WRONG. The
   engine grades its checks in three classes and only ONE of them is a verdict
   on the design:

     no kind            a HARD check. A real feasibility violation.
     kind:"advisory"    reported, deliberately excluded from `feasible` - e.g.
                        the OEI transient, which is an unresolved industry
                        question rather than a defect in the user's aircraft.
     kind:"omission"    a disclosure that some physics is not modelled. Never a
                        property of the design at all.

   Counting all three together reported "no layout passes every check" when in
   fact FOUR OF SIX were feasible with every hard check passing. The engine's
   own `feasible` and `checksPassed/checksTotal` had it right the whole time;
   this module was the thing that was wrong. Advisories and omissions are still
   surfaced - separately, and labelled - because they matter; they are just not
   scored as failures. */
const failCount  = (r) => (r?.checks || []).filter(c => !c.kind && !c.ok).length;
const softChecks = (r, kind) => (r?.checks || [])
  .filter(c => c.kind === kind && !c.ok).map(c => c.label);

/* ── 1. SIX CONFIGURATIONS ON ONE MISSION ───────────────────────────────
   The question this whole tool exists to answer, and it was not on screen.
   Every layout flies the SAME mission — that is the point, and it is why the
   mission is deliberately not overwritten when the configuration changes.
   Each layout still brings its own published design point (rotor count, disk
   loading, cruise speed, effective L/D, figure of merit, tip speed, wing
   loading, thrust margin) from CONFIG_DEFAULTS. */
export function compareConfigurations(size, p, cfg) {
  const { CONFIG_DEFAULTS, CONFIGURATIONS, rotorDiameterFor,
          oeiThrustMarginFor, CONFIG_REFERENCE } = cfg;
  const rows = [];
  for (const key of Object.keys(CONFIGURATIONS)) {
    const d = CONFIG_DEFAULTS[key];
    if (!d) continue;
    /* 1.30 thrust = a 1.482 power factor, inside NASA's published band. The
       fully derived per-configuration form (twRatioFor) was refuted against
       NASA's weight statements - see configuration.js. */
    const tw = Math.max(1.30, oeiThrustMarginFor(key, d.nRotors) ?? 1.30);
    const params = {
      ...p, configType: key, nPropHover: d.nRotors,
      propDiam: rotorDiameterFor(key, p.mtowGuessKg ?? 3175, d.nRotors),
      vCruise: d.vCruise_ms ?? p.vCruise, LD: d.LD_target ?? p.LD,
      etaHov: d.etaHov ?? p.etaHov, tipSpeed: d.tipSpeed_ms ?? p.tipSpeed,
      twRatio: tw,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}),
    };
    delete params.nRotorsStopped;   // the stopped fraction is definitional per layout
    let r = null;
    try { r = size(params); } catch { /* a layout that throws is reported, not hidden */ }
    const ref = CONFIG_REFERENCE?.[key];
    rows.push({
      key, label: CONFIGURATIONS[key]?.label ?? key,
      reference: ref?.aircraft ?? null,
      nRotors: d.nRotors, diskLoading_lbft2: d.DL_lbft2, vCruise_ms: params.vCruise,
      converged: converged(r),
      MTOW_kg: r?.MTOW ?? null, packKWh: r?.PackkWh ?? null,
      span_m: r?.bWing || null, DL_lbft2: r?.DL_lbft2 ?? null,
      ctSigma: r?.ctSigma ?? null, LDact: r?.LDact ?? null,
      withinMTOM: r?.withinMTOM ?? null, mtomMarginKg: r?.mtomMarginKg ?? null,
      feasible: r?.feasible ?? null,
      failing: r ? failCount(r) : null,
      checksPassed: r?.checksPassed ?? null, checksTotal: r?.checksTotal ?? null,
      failedChecks: r ? (r.checks || []).filter(c => !c.kind && !c.ok).map(c => c.label) : [],
      advisories: r ? softChecks(r, "advisory") : [],
      omissions:  r ? softChecks(r, "omission") : [],
    });
  }
  /* Rank by MTOW among the ones that actually close. A layout that does not
     converge is not "worst", it is ABSENT — it has no design at this mission. */
  const closed = rows.filter(r => r.converged && r.MTOW_kg != null)
                     .sort((a, b) => a.MTOW_kg - b.MTOW_kg);
  const clean = closed.filter(r => r.failing === 0);

  /* A check that fails on EVERY layout is telling you something about the
     MISSION or the MODEL, not about any one configuration - so it is pulled out
     separately. Reporting it per-row only invites six separate investigations
     of one cause. */
  const counts = new Map();
  for (const r of rows) for (const c of [...r.failedChecks, ...r.advisories])
    counts.set(c, (counts.get(c) ?? 0) + 1);
  const sharedFailures = [...counts.entries()]
    .filter(([, n]) => n >= Math.max(2, Math.ceil(rows.length / 2)))
    .sort((a2, b2) => b2[1] - a2[1])
    .map(([label, n]) => ({ label, layouts: n, of: rows.length,
      /* Whether the shared item is a hard failure or only an advisory - the
         difference between "these designs do not work" and "the industry has
         not settled this criterion". */
      hard: rows.some(r => r.failedChecks.includes(label)) }));

  return {
    rows,
    ranking: closed.map((r, i) => ({ rank: i + 1, key: r.key, MTOW_kg: r.MTOW_kg,
                                     failing: r.failing })),
    lightest: closed[0]?.key ?? null,
    /* THE ONE THAT SHOULD BE QUOTED. "Lightest" alone will happily nominate a
       design that fails blade loading or the OEI transient - lighter BECAUSE it
       fails them. lightestClean is null when nothing passes cleanly, and a null
       here is a real answer: no layout closes this mission without a violation. */
    lightestClean: clean[0]?.key ?? null,
    cleanCount: clean.length,
    sharedFailures,
    note: "Every layout flies the SAME mission and brings its OWN published "
        + "design point. Layouts that do not converge have no design at this "
        + "mission and are excluded from the ranking rather than ranked last. "
        + "Quote lightestClean, not lightest: the lightest design is often "
        + "lightest BECAUSE it violates a check.",
  };
}

/* ── 2. PARAMETRIC SWEEP ────────────────────────────────────────────────
   A 2-D grid over any two inputs, returning any output plus a FEASIBILITY
   MASK so a UI can shade the region where the design actually closes and
   passes its checks. The mask is the useful half: a carpet plot of MTOW with
   no feasibility shading invites reading a number off a design that does not
   exist. */
export function parametricSweep(size, p, {
  xKey, xValues, yKey, yValues, outputs = ["MTOW"], maxRuns = 2500,
}) {
  const total = (xValues?.length ?? 0) * (yValues?.length ?? 0);
  if (!xKey || !yKey || !total) return { error: "need xKey/xValues and yKey/yValues" };
  if (total > maxRuns) {
    return { error: `${total} runs exceeds maxRuns ${maxRuns} — coarsen the grid. `
                  + `Each run is a full sizing loop; this is not a slider action.` };
  }
  const cells = [];
  for (const y of yValues) {
    const row = [];
    for (const x of xValues) {
      let r = null;
      try { r = size({ ...p, [xKey]: x, [yKey]: y }); } catch { /* recorded as infeasible */ }
      const ok = converged(r);
      const vals = {};
      for (const o of outputs) vals[o] = ok ? (r?.[o] ?? null) : null;
      row.push({ x, y, feasible: ok, failing: r ? failCount(r) : null,
                 allChecksPass: ok && failCount(r) === 0, ...vals });
    }
    cells.push(row);
  }
  const flat = cells.flat();
  return {
    xKey, yKey, outputs, cells,
    runs: total,
    feasibleCount: flat.filter(c => c.feasible).length,
    cleanCount: flat.filter(c => c.allChecksPass).length,
    note: "feasible = the loop closed. allChecksPass = it closed AND every "
        + "feasibility check passed. Shade on the second, not the first.",
  };
}

/* ── 3. OPTIMISER — minimise an objective subject to the checks ──────────
   Coarse grid then local refine, over up to two variables. Deliberately NOT a
   gradient method: the objective is a sizing loop with discrete branches in it
   (motor-model hand-off, solidity clamp, buildup fallback), and a gradient
   optimiser on a function with steps in it reports confident nonsense. The
   grid is slow and honest.

   `requireAllChecks` is the whole point. Minimising MTOW without it just walks
   to the smallest aircraft that closes, which is usually one that fails blade
   loading or the certification limit. */
export function optimiseDesign(size, p, {
  variables,                   // [{key, min, max, steps}] — one or two
  objective = "MTOW",
  minimise = true,
  requireAllChecks = true,
  refine = 2,
}) {
  if (!variables?.length || variables.length > 2)
    return { error: "optimiseDesign takes one or two variables" };

  let evaluations = 0;
  const evaluate = (vals) => {
    let r = null;
    try { r = size({ ...p, ...vals }); } catch { return null; }
    evaluations++;
    if (!converged(r)) return null;
    if (requireAllChecks && failCount(r) > 0) return null;
    const v = r[objective];
    return (v == null || !isFinite(v)) ? null : { vals, value: v, result: r };
  };

  const axis = (v, n) => Array.from({ length: n },
    (_, i) => v.min + (v.max - v.min) * i / Math.max(1, n - 1));

  let best = null, ranges = variables.map(v => ({ ...v }));
  for (let pass = 0; pass <= refine; pass++) {
    const grids = ranges.map(v => axis(v, v.steps ?? 9));
    const combos = grids.length === 1
      ? grids[0].map(a => ({ [ranges[0].key]: a }))
      : grids[0].flatMap(a => grids[1].map(b =>
          ({ [ranges[0].key]: a, [ranges[1].key]: b })));
    for (const c of combos) {
      const got = evaluate(c);
      if (!got) continue;
      if (!best || (minimise ? got.value < best.value : got.value > best.value)) best = got;
    }
    if (!best) break;
    /* Refine: shrink each range to a window around the incumbent. */
    ranges = ranges.map(v => {
      const at = best.vals[v.key], half = (v.max - v.min) / 4;
      return { ...v, min: Math.max(v.min, at - half), max: Math.min(v.max, at + half) };
    });
  }

  /* IS THE ANSWER ON THE EDGE OF THE BOX? If the optimum sits on a bound of the
     search range, the range was too narrow and the reported point is an artefact
     of where the user stopped looking rather than an optimum. Measured on the
     first run of this function: minimising MTOW over W/S 900-1900 and tip speed
     130-200 returned exactly (1900, 200) - both upper corners - which is not an
     optimum, it is the edge of the box. Saying so is the difference between a
     solver and a solver you can trust. */
  const onBoundary = best ? variables.filter(v => {
    const at = best.vals[v.key], span = Math.abs(v.max - v.min) || 1;
    return Math.abs(at - v.min) / span < 1e-6 || Math.abs(at - v.max) / span < 1e-6;
  }).map(v => v.key) : [];

  return best ? {
    objective, minimise, evaluations,
    at: best.vals, value: best.value,
    onBoundary,
    boundaryWarning: onBoundary.length
      ? "The optimum sits on the search bound for " + onBoundary.join(" and ")
        + ", so it is the EDGE OF THE RANGE, not an interior optimum. Widen the "
        + "range, or accept that this variable simply wants to be as large or as "
        + "small as it is allowed to be and needs a physical limit instead."
      : null,
    MTOW_kg: best.result.MTOW, packKWh: best.result.PackkWh,
    failing: failCount(best.result),
    note: `Grid-with-refine, not a gradient method: the sizing loop has discrete `
        + `branches (motor-model hand-off, solidity clamp, buildup fallback) and a `
        + `gradient optimiser on a stepped function reports confident nonsense.`
        + (requireAllChecks ? " Every feasibility check was required to pass." : ""),
  } : {
    objective, evaluations, error:
      "no point in the given ranges both converged and passed every check"
      + (requireAllChecks ? " — try requireAllChecks:false to see what closes at all" : ""),
  };
}
