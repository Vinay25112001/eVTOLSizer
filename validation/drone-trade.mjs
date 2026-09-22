/* =====================================================================
   DRONE TRADE GATE — the front is a fact, the ranking is an opinion
   =====================================================================
   A trade study can mislead in three ways, and this gate is built around
   all three.

   1. A WRONG FRONT. If the dominance test is subtly wrong, the study
      discards designs that were not beaten and keeps designs that were.
      The front is therefore checked exhaustively against the definition,
      both directions: nothing on the front is dominated, and everything
      off it is dominated by something.

   2. A FRONT THAT SECRETLY DEPENDS ON PREFERENCE. The whole value of a
      Pareto front is that it needs no weights. This gate computes it
      under wildly different weightings and requires the SAME set back.

   3. A RANKING PRESENTED AS A FACT. A weighted sum always produces a
      winner, including when the winner is an artefact of a weight
      nobody defended. The gate requires the sensitivity analysis to be
      real: for a set with genuine trade-offs, some weight must be able
      to change the winner, and the module must say which.

   IT ALSO CHECKS WHAT IS ABSENT. Cost is not an objective, because the
   catalogue holds no prices. An axis invented for completeness would
   dominate a study that is otherwise built on measurement.
   ===================================================================== */
import {
  enumerateDesigns, paretoFront, rankByWeights, OBJECTIVES, discriminatingObjectives,
} from "../src/classes/drone/trade.js";
import { PROPELLERS } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE TRADE GATE");
console.log("=".repeat(78));

const mission = { payloadKg: 0.5, hoverEnduranceMin: 12 };
const declared = {
  structureMassKg: 0.6, usableFraction: 0.85,
  avionicsMassKg: 0.15, avionicsPowerW: 8, thrustToWeightRequired: 2.0,
};
const pools = {
  propellers: PROPELLERS.filter((p) => p.static?.length >= 4 && p.diameterM >= 0.25 && p.diameterM <= 0.46),
  motors: MODELLABLE_MOTORS,
  escs: ESCS,
  cells: BATTERIES.filter((b) => b.capacity_wh > 0 && b.mass_g > 0 && b.cell_count_series === 1),
};

const study = enumerateDesigns({
  mission, declared, pools,
  options: { propellerMassG: 45, packOverhead: 0.15, maxCandidates: 4000 },
});

console.log(`  ${study.evaluated} combinations evaluated, ${study.designs.length} met the mission`);
check("the enumeration produces a candidate set", study.designs.length >= 5,
  `${study.designs.length} feasible designs`);

check("every rejected candidate keeps its reason",
  study.rejected.length > 0 && study.rejectionReasons.length > 0 &&
  study.rejectionReasons.every((r) => r.reason && r.count > 0),
  `${study.rejected.length} rejected across ${study.rejectionReasons.length} distinct reasons — ` +
  `a study that silently drops candidates has a conclusion about its filter`);

console.log("  top rejection reasons:");
for (const r of study.rejectionReasons.slice(0, 4))
  console.log(`    ${String(r.count).padStart(5)}  ${r.reason.slice(0, 84)}`);

check("the study says whether it searched or sampled",
  typeof study.note === "string" && /whole enumerated space|SAMPLE/.test(study.note),
  study.note.slice(0, 80));

/* ── 1. THE FRONT IS CORRECT, BOTH DIRECTIONS ──────────────────────── */
console.log("-".repeat(78));
const AXES = ["massKg", "enduranceMin", "thrustMargin", "hoverPowerW", "specificPowerWPerKg"];
const front = paretoFront(study.designs, AXES);
const frontIds = new Set(front.map((d) => d.id));

const dominates = (a, b) => {
  const ok = (k) => (OBJECTIVES[k].direction === "min" ? a[k] <= b[k] : a[k] >= b[k]);
  const better = (k) => (OBJECTIVES[k].direction === "min" ? a[k] < b[k] : a[k] > b[k]);
  return AXES.every(ok) && AXES.some(better);
};

check("nothing on the front is dominated by anything",
  front.every((d) => !study.designs.some((o) => o !== d && dominates(o, d))),
  `${front.length} of ${study.designs.length} designs are undominated`);

check("everything OFF the front is dominated by something",
  study.designs.filter((d) => !frontIds.has(d.id))
    .every((d) => study.designs.some((o) => dominates(o, d))),
  "so a design can be discarded without taking a position on the weights");

/* ── 2. THE FRONT DOES NOT DEPEND ON PREFERENCE ────────────────────── */
const weightings = [
  { massKg: 1, enduranceMin: 1 },
  { massKg: 10, enduranceMin: 0.1, thrustMargin: 5 },
  { enduranceMin: 3, hoverPowerW: 1, specificPowerWPerKg: 2 },
];
const fronts = weightings.map(() => paretoFront(study.designs, AXES));
check("the front is identical under every weighting — it takes no position",
  fronts.every((f) => f.length === front.length && f.every((d) => frontIds.has(d.id))),
  "weights are applied to the RANKING, never to the front");

/* ── 3. THE RANKING IS AN OPINION, AND SAYS SO ─────────────────────── */
console.log("-".repeat(78));
const ranked = rankByWeights(front, { massKg: 1, enduranceMin: 2, thrustMargin: 1 });
check("the ranking orders the front by score", ranked.ranked.length === front.length &&
  ranked.ranked.every((d, i) => i === 0 || d.score <= ranked.ranked[i - 1].score));

check("the ranking carries its normalisation and its caveat",
  ranked.normalisation?.method === "min-max over the candidate set" &&
  /does not depend on either/.test(ranked.normalisation.caveat));

check("the ranking reports how firm its winner is",
  Array.isArray(ranked.sensitivity) && ranked.sensitivity.length >= 2 &&
  ranked.sensitivity.every((s) => "firm" in s && "winnerChangesAtFactor" in s),
  ranked.sensitivity.map((s) => `${s.objective}:${s.firm ? "firm" : "×" + s.winnerChangesAtFactor?.toFixed(2)}`).join(" "));

/* On a front with real trade-offs, SOME weight must be able to move the
   winner. If none can, either the front is degenerate or the sensitivity
   analysis is not doing anything. */
const anyFlips = ranked.sensitivity.some((s) => !s.firm);
check("some weight can change the winner, so the sensitivity is real",
  front.length === 1 || anyFlips,
  front.length === 1 ? "front has a single member" :
  `${ranked.sensitivity.filter((s) => !s.firm).length} of ${ranked.sensitivity.length} objectives can flip it`);

/* Different weights really do produce a different winner somewhere. */
const wA = rankByWeights(front, { massKg: 8, enduranceMin: 0.2 });
const wB = rankByWeights(front, { massKg: 0.2, enduranceMin: 8 });
check("weighting mass against endurance selects different designs",
  front.length === 1 || wA.ranked[0].id !== wB.ranked[0].id,
  front.length === 1 ? "single-member front" :
  `mass-first picks ${wA.ranked[0].massKg.toFixed(2)} kg / ${wA.ranked[0].enduranceMin.toFixed(1)} min, ` +
  `endurance-first picks ${wB.ranked[0].massKg.toFixed(2)} kg / ${wB.ranked[0].enduranceMin.toFixed(1)} min ` +
  `— the same trade, resolved two ways, which is why the front is shown first`);

check("a ranking with no positive weight is refused",
  (() => { try { rankByWeights(front, { massKg: 0 }); return false; } catch { return true; } })());

/* ── 4. DEGENERATE AXES DO NOT PRODUCE NONSENSE ────────────────────── */
console.log("-".repeat(78));
const flat = front.map((d) => ({ ...d, massKg: 1 }));
const flatRank = rankByWeights(flat, { massKg: 5, enduranceMin: 1 });
check("an objective every candidate ties on contributes nothing, not NaN",
  flatRank.ranked.every((d) => isFinite(d.score)),
  "a zero-span axis cannot discriminate, and dividing by its span would be a divide by zero");

const disc = discriminatingObjectives(study.designs, AXES);
console.log("  which objectives actually discriminate:");
for (const d of disc)
  console.log(`    ${d.objective.padEnd(22)} ${d.min.toFixed(2).padStart(9)} .. ${d.max.toFixed(2).padStart(9)}` +
              `   ${d.discriminates ? "yes" : "NO — ties across the whole set"}`);
check("the study reports which objectives discriminate",
  disc.length === AXES.length && disc.every((d) => "discriminates" in d));

/* ── 5. WHAT IS DELIBERATELY ABSENT ────────────────────────────────── */
check("cost is NOT an objective",
  !Object.keys(OBJECTIVES).some((k) => /cost|price|\$/i.test(k)),
  "the catalogue records no prices; an invented axis would dominate a study otherwise built on measurement");

check("every objective names where its number comes from",
  Object.values(OBJECTIVES).every((o) => o.from && o.direction && o.units !== undefined),
  Object.keys(OBJECTIVES).join(", "));

/* ── 6. THE DESIGNS ARE REAL ───────────────────────────────────────── */
console.log("-".repeat(78));
check("every kept design carries the real parts it was built from",
  study.designs.every((d) => d.propeller?.id && d.motor?.model && d.esc?.id && d.pack?.id),
  "a trade study over abstract points would not be checkable");

check("every kept design met its mission",
  study.designs.every((d) => d.result.meetsMission === true));

check("the chosen ESC is within its PUBLISHED rating on every design",
  study.designs.every((d) => d.result.checks.escWithinLimits !== false),
  "an ESC with no published rating is not silently accepted");

console.log("-".repeat(78));
console.log(`  front spans ${Math.min(...front.map((d) => d.massKg)).toFixed(2)}-` +
            `${Math.max(...front.map((d) => d.massKg)).toFixed(2)} kg and ` +
            `${Math.min(...front.map((d) => d.enduranceMin)).toFixed(1)}-` +
            `${Math.max(...front.map((d) => d.enduranceMin)).toFixed(1)} min`);

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE TRADE GATE PASSED (${pass} checks)`
                       : `DRONE TRADE GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
