/* =====================================================================
   GEAR ORCHESTRATION GATE — the chain, end to end, for one aeroplane
   =====================================================================
   G1 through G6 each have their own gate and each passed while NOTHING
   IN THE APP CALLED ANY OF THEM. This gate covers the seam: the module
   that drives the chain for a sized aeroplane, and therefore the first
   thing that can get the couplings wrong rather than the physics.

   THE COUPLING THAT MATTERS MOST is A and B. `gear/ground-loads.js`
   labels A the arm from the CG to the NOSE wheel, from 14 CFR
   25.493(e); `gear-geometry.js` maps NACA SR-63's l2 and l1 onto the
   same two arms. They AGREE, which is what lets the orchestrator pass
   them across untranslated.

   A comment in gear-geometry.js previously claimed the opposite, and
   shipped that way. It was wrong and is corrected — but a corrected
   comment is still only a comment, so this gate asserts the agreement
   NUMERICALLY, by making the two modules compute the same static split
   from the same arms. Swapping A and B produces entirely plausible
   numbers, which is exactly why it has to be measured and not read.

   THE OTHER SEAM IS THE ORDER. eta_t is derived from the SELECTED
   tyre's own tabulated geometry, so the strut cannot be sized before
   the tyre is chosen. That dependency is invisible in any single
   module's gate and is checked here.
   ===================================================================== */
import * as E from "../src/classes/aircraft/engine.js";
import { gearOf, GEAR_REACTION_FACTOR } from "../src/classes/aircraft/gear.js";
import { staticReactions } from "../src/engine/gear/ground-loads.js";
import { tyreEfficiencyFor, strokeFromEnergy } from "../src/engine/gear/strut.js";
import { G0 } from "../src/engine/constants.js";
import { pavementCode } from "../src/engine/gear/tyre-select.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const G = Object.fromEntries(TYPES.map((t) => [t, gearOf(E.designAircraft({ type: t }))]));
const TRICYCLE = ["transport", "bizjet", "turboprop"];

console.log("GEAR ORCHESTRATION GATE");
console.log("=".repeat(78));

/* ── 1. THE CHAIN RUNS, OR DECLINES FOR A STATED REASON ─────────────*/
console.log("\n1. The chain runs end to end");
TRICYCLE.forEach((t) => {
  const g = G[t];
  check(g.resolved && g.geometry.resolved && g.statics.resolved
     && g.tyres.main.resolved && g.strut.resolved,
    `${t}: geometry, loads, tyre and strut all resolve`,
    g.resolved
      ? `${g.tyres.main.tyre.size} main, stroke ${(g.strut.strokeM * 39.3701).toFixed(1)} in, `
        + `E ${g.geometry.E.toFixed(2)} m`
      : g.why);
});
check(G.trainer.resolved === false && /wheelbase/.test(G.trainer.why),
  "the trainer declines, and names the wheelbase as what is missing",
  G.trainer.why);

/* ── 2. A AND B CROSS THE SEAM UNTRANSLATED ─────────────────────────*/
console.log("\n2. The two A/B conventions agree, measured not read");
TRICYCLE.forEach((t) => {
  const g = G[t];
  /* Recompute the split independently from G6's arms, through the
     25.493(e) module. If either module had them the other way round,
     these two fractions would differ by roughly an order of magnitude —
     the nose arm is the long one. */
  const again = staticReactions({ weight: 1000, noseArmA: g.geometry.A, mainArmB: g.geometry.B });
  check(Math.abs(again.noseFraction - g.geometry.noseFraction) < 1e-12,
    `${t}: ground-loads and gear-geometry agree on the static split from the same arms`,
    `${(again.noseFraction * 100).toFixed(3)} % both ways; a swap would give `
    + `${((g.geometry.A / (g.geometry.A + g.geometry.B)) * 100).toFixed(0)} % and still look plausible`);

  /* THE CHECK ABOVE IS NOT ENOUGH, and a mutant proved it: it recomputes
     from geom.A and geom.B directly, so it tests that the two MODULES
     agree and says nothing about what the ORCHESTRATOR actually handed
     over. Swapping the arms at the call site survived it. This compares
     the split the orchestrator really produced against the one G6
     computed from the same aeroplane. */
  check(Math.abs(g.statics.noseFraction - g.geometry.noseFraction) < 1e-12,
    `${t}: and the split the orchestrator produced is that same one`,
    `orchestrator ${(g.statics.noseFraction * 100).toFixed(3)} %, `
    + `geometry ${(g.geometry.noseFraction * 100).toFixed(3)} % — the arms were not `
    + `swapped on the way across`);

  /* The main tyre must be sized on the computed split, not on a
     fraction. The "90 % on the mains" rule of thumb is precisely what
     the tyre work replaced, so it must not creep back in as a fallback. */
  const totalLb = g.tyres.main.loadPerTyreLb * g.tyres.legs * g.tyres.wheelsPerAxle;
  check(Math.abs(totalLb - g.statics.mainLoadTotal) < 1e-6,
    `${t}: the main tyre was sized on the computed split, not a 90 % rule of thumb`,
    `${Math.round(totalLb)} lb across ${g.tyres.legs}×${g.tyres.wheelsPerAxle} wheels, `
    + `against ${Math.round(g.statics.mainLoadTotal)} lb from statics`);
});

/* ── 3. THE ORDER: eta_t COMES FROM THE CHOSEN TYRE ─────────────────*/
console.log("\n3. The strut is sized on the tyre that was actually selected");
TRICYCLE.forEach((t) => {
  const g = G[t];
  const direct = tyreEfficiencyFor(g.tyres.main.tyre);
  check(direct.resolved && Math.abs(direct.eta - g.tyreEfficiency.eta) < 1e-12
     && Math.abs(g.strut.etaT - direct.eta) < 1e-12,
    `${t}: eta_t is this tyre's own, and it is reported as such`,
    `${direct.eta.toFixed(4)} from ${g.tyres.main.tyre.size} — not a constant, and not `
    + `some other tyre's`);

  /* REPORTING IT IS NOT USING IT. A mutant that fed the stroke a
     hard-coded 0.47 while still reporting the derived value survived the
     check above, because nothing tied the number shown to the number
     used. The stroke is recomputed here from the efficiencies the result
     REPORTS; if the two ever diverge, this fires. */
  const s = strokeFromEnergy({
    V: g.sink.cases[0].vFps * 0.3048, L: g.sink.liftFraction, N: g.reaction.N,
    etaS: g.strut.etaS, etaT: g.strut.etaT, deltaT: g.strut.deflectionM, g: G0,
  });
  check(s.resolved && Math.abs(s.strokeM - g.strut.strokeM) < 1e-12,
    `${t}: and the stroke reproduces from the efficiencies the result reports`,
    `${(s.strokeM * 39.3701).toFixed(3)} in recomputed against `
    + `${(g.strut.strokeM * 39.3701).toFixed(3)} in reported`);
});

/* ── 4. WHAT IS REPORTED HONESTLY ───────────────────────────────────*/
console.log("\n4. What the result admits about itself");
{
  check(GEAR_REACTION_FACTOR.value === 2.0 && /not a reaction/.test(GEAR_REACTION_FACTOR.why),
    "the reaction factor N is declared a design choice, not a requirement",
    GEAR_REACTION_FACTOR.why);

  /* A class with no published landing weight falls back to MTOW, which
     makes the landing cases heavier than they should be. Flagged so a
     reader is not told a landing weight was used when none exists. */
  check(G.transport.usedLandingWeight === true && G.turboprop.usedLandingWeight === false,
    "a class with no maximum landing weight says so rather than implying one",
    `transport has one; turboprop does not and falls back to MTOW`);

  TRICYCLE.forEach((t) => {
    const g = G[t];
    const code = pavementCode(g.tyres.main.operatingPsi);
    check(g.tyres.mainPavement && g.tyres.mainPavement.code === code.code,
      `${t}: the pavement code is the one its own operating pressure gives`,
      `${Math.round(g.tyres.main.operatingPsi)} psi -> code ${code.code} (${code.label})`);
  });

  /* The research note is explicit that a real ACN is a layered-elastic
     computation and must not be promised. Nothing in the result may
     carry one. */
  const anyAcn = TRICYCLE.some((t) => JSON.stringify(G[t].tyres).toLowerCase().includes("acn"));
  check(!anyAcn, "no ACN is computed or claimed anywhere in the result",
    "AC 150/5335-5D makes it layered elastic analysis; the note forbids promising one");
}

/* ── 5. THE NOSE RULE IS THREE RULES ────────────────────────────────*/
console.log("\n5. The binding nose case is a result, not an assumption");
TRICYCLE.forEach((t) => {
  const g = G[t];
  const n = g.tyres.nose;
  if (!n.resolved) { check(false, `${t}: a nose tyre resolves`, n.why); return; }
  const worstLoad = n.demands.reduce((a, b) => (b.loadLb > a.loadLb ? b : a));
  const binding = n.binding;
  check(n.tyres === 2,
    `${t}: the nose carries two tyres, which is what every required rating divides by`,
    `a different count silently rescales every case in this table`);
  check(n.demands.length >= 2 && binding.requiredRatingLb
        >= Math.max(...n.demands.map((d) => d.requiredRatingLb)) - 1e-9,
    `${t}: the binding case is the largest REQUIRED RATING, over ${n.demands.length} rules`,
    `binding ${binding.label} at ${Math.round(binding.requiredRatingLb)} lb; `
    + `the heaviest LOAD is ${worstLoad.label} at ${Math.round(worstLoad.loadLb)} lb`
    + (worstLoad.label !== binding.label
        ? " — different cases, which is the whole point of the 1.5 allowance"
        : " — the same case here"));
});

console.log("\n" + "=".repeat(78));
console.log(`${passes} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
