/* =====================================================================
   TRADE — there is no best design, and saying so is the useful part
   =====================================================================
   The request this module answers is "pick the perfect one". It cannot,
   and neither can anything else, because the objectives conflict: the
   lightest design is not the longest-endurance one, and the one with the
   most thrust margin is neither. A tool that returns a single winner has
   not solved that — it has hidden a preference inside itself.

   So this module does two separate things and keeps them separate.

   1. THE PARETO FRONT, which is objective. A design is on the front if
      no other design beats it on every objective at once. Nothing is
      weighted, nothing is normalised, no preference is expressed. A
      design NOT on the front is strictly worse than something, and can
      be discarded without an argument. A design ON it can only be
      preferred by taking a position.

   2. THE RANKING, which is not objective and says so. Weights come from
      the caller, the normalisation is stated, and the result carries
      both. Change the weights and the winner changes — which is the
      point, and why `rankByWeights` returns the sensitivity of the
      ranking to each weight alongside the ranking itself.

   WHY THE FRONT IS COMPUTED ON MEASURED QUANTITIES ONLY. Every objective
   here is either a published mass, or a consequence of a measured curve:
   all-up mass, hover endurance, thrust margin, hover power. None is a
   correlation and none is fitted. Cost is deliberately ABSENT — the
   catalogue records no prices, prices move weekly, and a trade study
   whose dominant axis is invented would be worse than one axis short.

   ── WHAT IS ENUMERATED, AND THE COMBINATORIAL HONESTY ────────────────
   The full space is propellers x motors x ESCs x cells x series x
   parallel x rotor counts, which is millions of points. This module does
   NOT pretend to search it. It enumerates the axes that change the
   PHYSICS — propeller, motor, rotor count, pack configuration — and for
   each, picks the lightest ESC that is within its published limits,
   because the ESC affects mass and feasibility but not the loss model
   (the measured table is ESC-independent, which is itself a limitation
   the ESC layer records).

   Every candidate that fails is KEPT with its reason. A trade study that
   silently drops two thirds of its candidates is a trade study whose
   conclusion is about the filter, not the design.
   ===================================================================== */
import { sizeDrone } from "./sizing.js";
import { escLimitStatus } from "./esc.js";
import { assemblePack } from "./battery.js";

/* Objectives available to the front. `direction` is which way is better.
   Each names where its number comes from, so a front can be read without
   trusting the axis labels. */
export const OBJECTIVES = Object.freeze({
  massKg: Object.freeze({
    label: "All-up mass", units: "kg", direction: "min",
    from: "sum of published component masses plus declared structure and avionics",
  }),
  enduranceMin: Object.freeze({
    label: "Hover endurance", units: "min", direction: "max",
    from: "published pack Wh at the declared usable fraction, over the computed hover bus power",
  }),
  thrustMargin: Object.freeze({
    label: "Thrust margin", units: "T/W", direction: "max",
    from: "measured maximum propeller thrust, or the motor's published continuous current, whichever binds first",
  }),
  hoverPowerW: Object.freeze({
    label: "Hover power", units: "W", direction: "min",
    from: "measured rotor power through the published motor constants and the measured ESC residual",
  }),
  specificPowerWPerKg: Object.freeze({
    label: "Specific power", units: "W/kg", direction: "min",
    from: "hover bus power divided by all-up mass",
  }),
});

/* Does this ESC survive the point, and what does it weigh? Returns the
   lightest ESC whose PUBLISHED limits cover the demand. An ESC with no
   published rating is not silently accepted: `requireStatedLimits`
   decides, and defaults to requiring them. */
function pickEsc(escs, { busCurrentA, cells, requireStatedLimits = true }) {
  const viable = [];
  for (const e of escs) {
    let m = e.mass_g;
    if (m && typeof m === "object") {
      const vals = Object.values(m).filter((x) => typeof x === "number");
      m = vals.length ? Math.min(...vals) : null;
    }
    if (m == null) continue;
    const s = escLimitStatus(e, { busCurrentA }, { cells });
    const currentOk = s.continuousCurrent.within === true
      || (!requireStatedLimits && s.continuousCurrent.within === null);
    const cellsOk = s.cellCountOk !== false;
    if (currentOk && cellsOk) viable.push({ esc: e, massG: m, status: s });
  }
  viable.sort((a, b) => a.massG - b.massG);
  return viable[0] ?? null;
}

/* Enumerate, size, and keep the reasons. */
export function enumerateDesigns({ mission, declared, pools, options = {} }) {
  const {
    propellers, motors, escs, cells,
    rotorOptions = [4], seriesOptions = [6], parallelOptions = [1, 2, 3],
  } = pools;
  const propellerMassG = options.propellerMassG ?? null;
  const packOverhead = options.packOverhead ?? 0.15;
  const maxCandidates = options.maxCandidates ?? 20000;
  const requireStatedLimits = options.requireStatedLimits ?? true;

  const kept = [], rejected = [];
  const reasons = new Map();
  const note = (why) => reasons.set(why, (reasons.get(why) ?? 0) + 1);
  let evaluated = 0, budgetHit = false;

  outer:
  for (const cell of cells) {
    for (const series of seriesOptions) {
      for (const parallel of parallelOptions) {
        let pack;
        try { pack = assemblePack(cell, { series, parallel, overheadFraction: packOverhead }); }
        catch (e) { note(`pack: ${e.message.slice(0, 60)}`); continue; }
        for (const motor of motors) {
          for (const propeller of propellers) {
            for (const rotors of rotorOptions) {
              if (evaluated >= maxCandidates) { budgetHit = true; break outer; }
              evaluated++;

              /* Size once with a provisional ESC to learn the current, then
                 pick the real one and size again. Two passes, because the
                 ESC's mass depends on the current and the current depends
                 on the mass. */
              const provisional = escs[0];
              const trial = safeSize({
                mission, declared, rotors, propeller, propellerMassG, motor,
                esc: provisional, pack, options,
              });
              if (!trial.ok) { note(trial.reason); rejected.push(trial); continue; }

              const chosen = pickEsc(escs, {
                busCurrentA: trial.result.hover.esc.busCurrentA,
                cells: pack.cellsSeries, requireStatedLimits,
              });
              if (!chosen) {
                note("no ESC in the catalogue covers this current within its published rating");
                rejected.push({ ok: false, reason: "no ESC within published limits",
                                propeller: propeller.id, motor: motor.model, rotors });
                continue;
              }

              const final = safeSize({
                mission, declared, rotors, propeller, propellerMassG, motor,
                esc: chosen.esc, pack, options,
              });
              if (!final.ok) { note(final.reason); rejected.push(final); continue; }
              if (!final.result.meetsMission) {
                const failed = Object.entries(final.result.checks)
                  .filter(([, v]) => !v).map(([k]) => k).join(", ");
                note(`mission not met: ${failed}`);
                rejected.push({ ok: false, reason: `mission not met: ${failed}`,
                                propeller: propeller.id, motor: motor.model, rotors });
                continue;
              }

              const r = final.result;
              kept.push({
                id: `${propeller.id}|${motor.model}|${rotors}|${pack.id}`,
                propeller, motor, esc: chosen.esc, pack, rotors,
                propellerDiameterIn: propeller.diameterM / 0.0254,
                massKg: r.massKg,
                enduranceMin: r.endurance.minutes,
                enduranceMinP10: r.endurance.minutesP10,
                enduranceMinP90: r.endurance.minutesP90,
                thrustMargin: r.thrustToWeight.available,
                hoverPowerW: r.hover.busPowerW,
                specificPowerWPerKg: r.hover.busPowerW / r.massKg,
                hoverThrottleFraction: r.thrustToWeight.hoverThrottleFraction,
                figureOfMerit: r.hover.figureOfMerit,
                discLoadingNM2: r.hover.discLoadingNM2,
                packs: r.massBreakdown.packs,
                warnings: r.warnings,
                result: r,
              });
            }
          }
        }
      }
    }
  }

  return {
    designs: kept, rejected, evaluated, budgetHit,
    rejectionReasons: Object.freeze([...reasons.entries()]
      .sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }))),
    note: budgetHit
      ? `stopped at the ${maxCandidates} candidate budget — the space is larger than this and the result is a SAMPLE, not a search`
      : "the whole enumerated space was evaluated",
  };
}

function safeSize({ mission, declared, rotors, propeller, propellerMassG, motor, esc, pack, options }) {
  try {
    const r = sizeDrone({
      mission, declared,
      selection: {
        rotors, propeller, propellerMassG, motor, esc, battery: pack,
        packVoltageV: pack.voltagePrintedV, packCells: pack.cellsSeries,
      },
      options: { altitudeM: options.altitudeM ?? 0 },
    });
    if (!r.status || !r.status.startsWith("converged"))
      return { ok: false, reason: r.reason ?? r.status, propeller: propeller.id, motor: motor.model, rotors };
    return { ok: true, result: r };
  } catch (e) {
    return { ok: false, reason: e.message.slice(0, 80), propeller: propeller.id, motor: motor.model, rotors };
  }
}

/* ── THE PARETO FRONT ───────────────────────────────────────────────
   A dominates B when A is at least as good on every objective and
   strictly better on at least one. The front is everything undominated.

   No weights, no normalisation, no preference. This is the part of a
   trade study that is a fact rather than an opinion. */
export function paretoFront(designs, objectiveKeys) {
  const better = (a, b, k) => {
    const dir = OBJECTIVES[k].direction;
    return dir === "min" ? a[k] < b[k] : a[k] > b[k];
  };
  const atLeastAsGood = (a, b, k) => {
    const dir = OBJECTIVES[k].direction;
    return dir === "min" ? a[k] <= b[k] : a[k] >= b[k];
  };
  const dominates = (a, b) =>
    objectiveKeys.every((k) => atLeastAsGood(a, b, k)) &&
    objectiveKeys.some((k) => better(a, b, k));

  const front = [];
  for (const d of designs) {
    if (!designs.some((o) => o !== d && dominates(o, d))) front.push(d);
  }
  return front;
}

/* ── THE RANKING, WHICH IS AN OPINION ───────────────────────────────
   Min-max normalisation over the candidate set, then a weighted sum.
   Both choices are stated on the result because both change the answer:

     - Normalisation is over the SET, so adding a candidate can reorder
       the others. That is a property of min-max scaling, not a bug, and
       it is why the front matters more than the ranking.
     - The weighted sum assumes objectives trade linearly and that a
       point's value does not depend on where it sits. Neither is
       generally true. It is used because it is transparent, not because
       it is right.

   `sensitivity` reports how far each weight can move before the top
   design changes, which is the honest way to say how firm a winner is. */
export function rankByWeights(designs, weights) {
  const keys = Object.keys(weights).filter((k) => OBJECTIVES[k] && weights[k] > 0);
  if (!keys.length) throw new Error("trade: at least one objective must carry a positive weight");
  if (!designs.length) return { ranked: [], normalisation: null, sensitivity: [] };

  const range = {};
  for (const k of keys) {
    const vals = designs.map((d) => d[k]).filter((x) => isFinite(x));
    range[k] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  const total = keys.reduce((s, k) => s + weights[k], 0);

  const score = (d, w) => {
    let s = 0;
    for (const k of keys) {
      const { min, max } = range[k];
      const span = max - min;
      /* A degenerate axis contributes nothing rather than dividing by zero:
         if every candidate ties on an objective, it cannot discriminate. */
      const unit = span === 0 ? 0
        : (OBJECTIVES[k].direction === "min" ? (max - d[k]) / span : (d[k] - min) / span);
      s += (w[k] / total) * unit;
    }
    return s;
  };

  const ranked = designs
    .map((d) => ({ ...d, score: score(d, weights) }))
    .sort((a, b) => b.score - a.score);

  /* How firm is the winner? For each objective, find the smallest change
     to its weight that changes which design ranks first. */
  const top = ranked[0];
  const sensitivity = keys.map((k) => {
    let flipAt = null;
    for (let f = 0.05; f <= 20; f += 0.05) {
      const w = { ...weights, [k]: weights[k] * f };
      const best = designs.reduce((a, b) => (score(b, w) > score(a, w) ? b : a));
      if (best.id !== top.id) { flipAt = f; break; }
    }
    return {
      objective: k, weight: weights[k],
      winnerChangesAtFactor: flipAt,
      firm: flipAt == null,
    };
  });

  return {
    ranked,
    normalisation: {
      method: "min-max over the candidate set",
      range,
      caveat: "Normalising over the set means adding a candidate can reorder the "
        + "others, and a weighted sum assumes the objectives trade linearly. Both "
        + "are properties of the method, not of the designs. The Pareto front is "
        + "the part of this study that does not depend on either.",
    },
    weights, sensitivity,
  };
}

/* Which objectives actually discriminate across this candidate set?
   An objective every candidate ties on cannot inform a choice, and
   presenting it as an axis would imply it did. */
export function discriminatingObjectives(designs, objectiveKeys) {
  return objectiveKeys.map((k) => {
    const vals = designs.map((d) => d[k]).filter((x) => isFinite(x));
    const min = Math.min(...vals), max = Math.max(...vals);
    const spreadPct = min === 0 ? null : 100 * (max - min) / Math.abs(min);
    return { objective: k, min, max, spreadPct, discriminates: max > min };
  });
}
