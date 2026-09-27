/* ═══════════════════════════════════════════════════════════════════════
   FUSELAGE LOADS GATE — Phase E / F1, shear force and bending moment
   ═══════════════════════════════════════════════════════════════════════
   WHAT MAKES THIS GATE WORTH RUNNING

   A bending-moment diagram is the easiest thing in this repo to get
   plausibly wrong. It is a smooth curve that peaks at the wing box, and
   it looks right whether or not the load is in the correct place. Every
   defect found while building F1 produced a curve of exactly the right
   shape and the wrong magnitude:

     1. quadrature across a point load lost half a cell of it, biasing
        every station inboard by a constant;
     2. quadrature across the pressure-bulkhead step leaked half a cell
        of distributed load past the shell end, biasing every station by
        an amount growing linearly with distance;
     3. the closed form was fed items the source explicitly excludes,
        which inverted the SIGN of the comparison.

   None of those changes the shape. None would be caught by a smoke
   test, a render check, or a tolerance band chosen after seeing the
   answer. What caught all three is section 2: degrade the stationed
   route to TASOPT's own assumption and demand the two agree EXACTLY.
   Not "within 5 %" — exactly, to floating point, because under matched
   assumptions they are the same statics computed two different ways and
   any difference at all is a defect.

   That is the difference between a gate and a thermometer. A band would
   have passed all three defects.
   ═══════════════════════════════════════════════════════════════════════ */
import * as E from "../src/classes/aircraft/engine.js";
import { balanceOf } from "../src/classes/aircraft/balance.js";
import {
  fuselageLoads, shearAndMoment, tasoptA79, loadGrid, uniformSpan, R_MH,
} from "../src/classes/aircraft/fuselage-structure-loads.js";
import { G0 } from "../src/engine/constants.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};

const bar = "═".repeat(76);
console.log(bar);
console.log("FUSELAGE LOADS GATE — F1, shear force and bending moment");
console.log(bar);

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const SIZED = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const LOADS = Object.fromEntries(TYPES.map((t) => [t, fuselageLoads(SIZED[t])]));
/* The classes that carry a load factor, and so get a diagram at all. */
const WITH = TYPES.filter((t) => LOADS[t] && !LOADS[t].unavailable);

/* ── 1. A CLASS EITHER GETS A DIAGRAM OR IS TOLD WHY ─────────────────
   The trainer carries no ultimate load factor. It must decline, and it
   must decline with a reason rather than returning zeros — a zero
   bending moment is indistinguishable from a weightless aeroplane. */
console.log("\n1. Every class either gets a diagram or a stated reason");
check(WITH.length >= 3, "at least the three Part 25 classes get a diagram",
  `with a diagram: ${WITH.join(", ")}`);
check(LOADS.trainer?.unavailable === true && typeof LOADS.trainer.reason === "string"
      && LOADS.trainer.reason.length > 40,
  "the trainer declines, and says why, rather than returning zeros",
  LOADS.trainer?.reason ?? "no result at all");
for (const t of WITH) {
  const f = LOADS[t];
  check(f.scenarios.length >= 1 && f.scenarios.every((s) => s.stations.length > 50),
    `${t}: the diagram has stations`,
    `${f.scenarios.length} scenario(s), ${f.scenarios[0].stations.length} stations`);
}

/* ── 2. THE EQUIVALENCE TEST — the reason this gate exists ───────────
   Feed the stationed route TASOPT's own assumption: the named items
   uniform over l_shell, the tail lumped at x_tail, no aero load. It
   must then reproduce (A.79) across the whole rear fuselage to
   floating-point precision.

   THE TOLERANCE IS NOT A JUDGEMENT CALL. Under matched assumptions the
   two are algebraically identical, so the only difference admissible is
   rounding. 1e-12 is about four orders of magnitude above the observed
   3e-16 and about four below the smallest real defect found (1.2e-3,
   the point-load quadrature on the bizjet), so it separates the two
   cleanly rather than splitting the difference. */
console.log("\n2. The stationed route reproduces TASOPT (A.79) EXACTLY under its assumptions");
const EXACT = 1e-12;
for (const t of WITH) {
  const f = LOADS[t], G = f.geometry, N = f.loadFactor.ultimateManoeuvre;
  const bal = balanceOf(SIZED[t]);
  const lumpNames = new Set(G.lumpedItems.map((i) => i.name));
  const spread = bal.items.filter((i) => i.group === "fuselage" && !lumpNames.has(i.name));
  const sc = f.scenarios.find((s) => s.id === "manoeuvre");
  /* the same named set the module smears, rebuilt from the result */
  const named = new Set(sc.smearedBasis.namedItems);
  const distributedWeightN =
    (G.payloadKg + spread.filter((i) => named.has(i.name)).reduce((s, i) => s + i.kg, 0)) * G0;

  const grid = loadGrid(G.fuselageLengthM, [G.shellFwdX, G.shellAftX, G.xTail, G.xWing]);
  const spans = uniformSpan(G.shellFwdX, G.shellAftX, N * distributedWeightN);
  const points = [{ x: G.xTail, n: N * G.tailMassKg * G0 }];
  const st = shearAndMoment({ grid, spans, points, xWing: G.xWing });

  let worst = 0, worstX = 0, n = 0;
  for (let i = 0; i < grid.length; i++) {
    const x = grid[i];
    if (x < G.xWing || x > G.shellAftX) continue;      // (A.79) is the REAR fuselage
    const a79 = tasoptA79({ x, nFactor: N, distributedWeightN, lShell: G.lShell,
      xShell2: G.shellAftX, tailWeightN: G.tailMassKg * G0, tailAeroN: 0, xTail: G.xTail });
    if (Math.abs(a79) < 1) continue;
    const rel = Math.abs(st.momentAft[i] - a79) / Math.abs(a79);
    if (rel > worst) { worst = rel; worstX = x; }
    n++;
  }
  check(n > 20 && worst < EXACT,
    `${t}: matches the closed form at every rear-fuselage station`,
    `${n} stations, worst relative difference ${worst.toExponential(2)} at x = ${worstX.toFixed(2)} m `
    + `(admissible ${EXACT.toExponential(0)})`);
}

/* ── 3. AND IT MUST NOT MATCH ONCE THE REAL STATIONS ARE USED ────────
   An equivalence test on its own is satisfiable by a module that
   ignores its stations and always evaluates (A.79). So the converse is
   asserted too: with the real load set the two must DIFFER, in the
   direction the omitted mass dictates.

   (A.79)'s distributed term omits the systems group, the crew and
   containerised cargo. Carrying them can only ADD bending, so the
   stationed route must come out at or above the closed form. Below it
   means mass has gone missing. */
console.log("\n3. With the real stations the two DIFFER, and in the direction the omitted mass sets");
for (const t of WITH) {
  const sc = LOADS[t].scenarios.find((s) => s.id === "manoeuvre");
  const d = sc.atWing.deltaPct, omitted = sc.smearedBasis.omittedKg;
  check(d >= -0.5,
    `${t}: the stationed route is not BELOW the closed form`,
    `${d >= 0 ? "+" : ""}${d.toFixed(1)} % at the wing box, carrying ${omitted.toFixed(0)} kg `
    + "of equipment, crew and cargo that (A.79) omits");
}
{
  /* At least one class must show a real difference, or the two routes are
     not independent at all and section 2 is measuring nothing. */
  const spread = WITH.map((t) => LOADS[t].scenarios.find((s) => s.id === "manoeuvre").atWing.deltaPct);
  check(Math.max(...spread.map(Math.abs)) > 2,
    "at least one class differs by more than 2 %, so the routes are genuinely independent",
    WITH.map((t, i) => `${t} ${spread[i] >= 0 ? "+" : ""}${spread[i].toFixed(1)} %`).join(", "));
}

/* ── 4. CONSERVATION — nothing joins or leaves the beam ──────────────
   The shear at the nose, taken from the aft side, is by definition the
   whole load on the beam. Checked against the mass the module says it
   carried, times the load factor, so an item silently dropped from the
   span/point split shows up here. */
console.log("\n4. The beam carries exactly the mass the module says it carries");
for (const t of WITH) {
  const f = LOADS[t], G = f.geometry;
  const sc = f.scenarios.find((s) => s.id === "manoeuvre");
  const carriedKg = G.payloadKg + G.tailMassKg
    + sc.stationedBasis.smearedOverShell.reduce((s, i) => s + i.kg, 0)
    + sc.stationedBasis.asPointLoads.reduce((s, i) => s + i.kg, 0);
  const expectedN = carriedKg * G0 * sc.nFactor;
  /* At the nose the FORWARD side carries nothing — there is no fuselage
     ahead of x = 0 — so the whole-beam load is the AFT side's shear
     there. Asking the switched value would be asking the wrong side and
     getting a correct zero. */
  const shearAtNose = sc.stations[0].shearAftN;
  check(sc.stations[0].shearFwdN === 0,
    `${t}: nothing is forward of the nose`,
    `forward-side shear at x = 0 is ${sc.stations[0].shearFwdN}`);
  const rel = Math.abs(shearAtNose - expectedN) / expectedN;
  check(rel < 1e-10,
    `${t}: total shear at the nose equals the whole beam load`,
    `${(shearAtNose / 1e3).toFixed(1)} kN against ${(expectedN / 1e3).toFixed(1)} kN `
    + `from ${carriedKg.toFixed(0)} kg at n = ${sc.nFactor.toFixed(2)} (rel ${rel.toExponential(1)})`);
}

/* ── 5. THE MOMENT PEAKS AT THE WING BOX ────────────────────────────
   Both cantilevers are built off the wing, so the maximum has to be
   there. If it is anywhere else the two integrations have been stitched
   together wrongly. */
console.log("\n5. The bending moment peaks at the wing box, where both cantilevers meet");
for (const t of WITH) {
  const f = LOADS[t], sc = f.scenarios.find((s) => s.id === "manoeuvre");
  const off = Math.abs(sc.peakMomentXM - f.geometry.xWing);
  check(off < 0.5 * f.geometry.fuselageLengthM / 100 + 0.30,
    `${t}: peak moment is at x_wing`,
    `peak ${(sc.peakMomentNm / 1e6).toFixed(3)} MN·m at ${sc.peakMomentXM.toFixed(2)} m, `
    + `x_wing ${f.geometry.xWing.toFixed(2)} m (offset ${off.toFixed(3)} m)`);
  check(sc.peakMomentNm > 0 && sc.peakShearN > 0,
    `${t}: the diagram is not identically zero`,
    `peak V ${(sc.peakShearN / 1e3).toFixed(0)} kN`);
}

/* ── 6. THE LOAD FACTOR HAS TO MOVE THE ANSWER ───────────────────────
   The defect the load-factor source gate exists for is a number that is
   displayed but not connected. With no tail airload the whole diagram
   is linear in n, so doubling n must double the moment — exactly, not
   approximately. */
console.log("\n6. The load factor moves the answer, exactly linearly with no airload");
for (const t of WITH) {
  const base = LOADS[t].scenarios.find((s) => s.id === "manoeuvre");
  const n0 = LOADS[t].loadFactor.ultimateManoeuvre;
  const doubled = fuselageLoads(SIZED[t], { ultimateLoadFactor: 2 * n0 });
  const sc2 = doubled.scenarios.find((s) => s.id === "manoeuvre");
  const ratio = sc2.peakMomentNm / base.peakMomentNm;
  check(Math.abs(ratio - 2) < 1e-10,
    `${t}: doubling the ultimate load factor doubles the bending moment`,
    `ratio ${ratio.toFixed(12)} at n ${n0.toFixed(3)} -> ${(2 * n0).toFixed(3)}`);
}

/* ── 7. WHAT IS NOT EVALUATED SAYS SO, AND CHANGES THINGS WHEN GIVEN ─
   Two quantities are deliberately not defaulted: CL_hmax, because
   TASOPT states none and a 2-D section clmax is not a 3-D surface CL,
   and the emergency-landing factor, because 14 CFR 25.561's inertia
   forces are not in this corpus.

   Both halves are checked. Absent, they must be reported absent — a
   silent zero would read as "no tail airload" rather than "not
   evaluated". Supplied, they must MOVE the answer, because an input
   that is accepted and ignored is the same defect in the other
   direction. */
console.log("\n7. CL_hmax and the landing factor are declared, not defaulted — and they bite");
for (const t of WITH) {
  const f = LOADS[t];
  check(f.tailAero.evaluated === false && f.tailAero.appliedN === 0
        && typeof f.tailAero.why === "string" && f.tailAero.why.length > 60,
    `${t}: with no CL_hmax the tail airload is reported NOT EVALUATED, not zeroed silently`,
    f.tailAero.why?.slice(0, 96) + "…");
  check(f.scenarios.every((s) => s.id !== "landing"),
    `${t}: with no landing factor the emergency-landing scenario is absent, not invented`,
    `scenarios: ${f.scenarios.map((s) => s.id).join(", ")}`);
  check(f.caveats.some((c) => /NOT EVALUATED/.test(c)),
    `${t}: the omissions reach the caveats a reader sees`,
    `${f.caveats.filter((c) => /NOT EVALUATED/.test(c)).length} of ${f.caveats.length} caveats say so`);
}
{
  const t = "transport";
  const withTail = fuselageLoads(SIZED[t], { clHMax: 0.8 });
  const sc0 = LOADS[t].scenarios.find((s) => s.id === "manoeuvre");
  const sc1 = withTail.scenarios.find((s) => s.id === "manoeuvre");
  /* THE RELIEF FACTOR MUST BE THE ONE APPLIED, not merely the one
     reported. A mutant that dropped r_Mh from the applied load survived
     the first version of this gate, because section 10 asserted only
     that the CONSTANT was 0.4 — exactly the defect this project already
     found on the strut, where nothing tied the tyre efficiency reported
     to the one used. So the arithmetic is tied down here: the applied
     load must BE the relief factor times the maximum load, and the
     relief must actually reduce it. */
  const ta = withTail.tailAero;
  check(Math.abs(ta.appliedN - R_MH * ta.lHMaxN) < 1e-9 * Math.abs(ta.lHMaxN)
        && ta.appliedN < ta.lHMaxN,
    "the applied tail load IS r_Mh times L_hmax, not merely reported beside it",
    `applied ${(ta.appliedN / 1e3).toFixed(1)} kN against r_Mh·L_hmax = `
    + `${(R_MH * ta.lHMaxN / 1e3).toFixed(1)} kN (L_hmax ${(ta.lHMaxN / 1e3).toFixed(1)} kN)`);

  /* And it must reach the moment. An unrelieved load would raise the
     bending moment by 1/r_Mh, so the relieved and unrelieved cases are
     distinguishable — which is what makes the check above meaningful
     rather than an assertion about a field nobody reads. */
  const unrelieved = sc0.peakMomentNm + (sc1.peakMomentNm - sc0.peakMomentNm) / R_MH;
  check(Math.abs(sc1.peakMomentNm - unrelieved) > 0.1 * sc0.peakMomentNm,
    "the relief is visible in the bending moment, so dropping it would change the answer",
    `relieved ${(sc1.peakMomentNm / 1e6).toFixed(3)} MN·m against `
    + `${(unrelieved / 1e6).toFixed(3)} MN·m unrelieved`);

  check(withTail.tailAero.evaluated === true && withTail.tailAero.appliedN > 0
        && sc1.peakMomentNm > sc0.peakMomentNm,
    "supplying CL_hmax evaluates the tail airload AND raises the bending moment",
    `L_hmax ${(withTail.tailAero.lHMaxN / 1e3).toFixed(0)} kN, relieved to `
    + `${(withTail.tailAero.appliedN / 1e3).toFixed(0)} kN by r_Mh = ${R_MH}; peak moment `
    + `${(sc0.peakMomentNm / 1e6).toFixed(3)} -> ${(sc1.peakMomentNm / 1e6).toFixed(3)} MN·m`);

  const nLift = LOADS[t].loadFactor.ultimateManoeuvre;
  const withLand = fuselageLoads(SIZED[t], { landingUltimateLoadFactor: 2 * nLift });
  const land = withLand.scenarios.find((s) => s.id === "landing");
  check(land !== undefined && withLand.governing === "landing" && land.sourced === false,
    "supplying a larger landing factor adds the scenario, lets it govern, and marks it unsourced",
    `scenarios ${withLand.scenarios.map((s) => s.id).join(", ")}, governing ${withLand.governing}, `
    + `peak ${(land?.peakMomentNm / 1e6).toFixed(3)} MN·m at n = ${(2 * nLift).toFixed(2)}`);
  check(land?.tailAeroN === 0,
    "the emergency-landing scenario carries no tail airload, per (A.83) L_h = 0",
    `tail airload on the landing case: ${land?.tailAeroN}`);
}

/* ── 8. THE TAIL LUMP IS THE SOURCE'S, NOT A GUESS ───────────────────
   (A.70) and (A.71): the lump is a mass and a centroid. x_tail must lie
   among the stations of the items lumped into it — outside them and the
   centroid arithmetic is wrong — and the tails themselves must be in
   it on every class. */
console.log("\n8. The lumped tail is a real centroid of real items, (A.70) and (A.71)");
for (const t of WITH) {
  const G = LOADS[t].geometry, xs = G.lumpedItems.map((i) => i.xM);
  const names = G.lumpedItems.map((i) => i.name);
  check(G.xTail >= Math.min(...xs) - 1e-9 && G.xTail <= Math.max(...xs) + 1e-9,
    `${t}: x_tail lies within the stations of the items lumped into it`,
    `x_tail ${G.xTail.toFixed(2)} m within [${Math.min(...xs).toFixed(2)}, ${Math.max(...xs).toFixed(2)}]`);
  check(names.includes("Horizontal tail") && names.includes("Vertical tail"),
    `${t}: both tails are in the lump`,
    `${G.tailMassKg.toFixed(0)} kg from ${names.join(", ")}`);
  check(G.xTail > G.xWing,
    `${t}: the lump is aft of the wing, so its arm bends the aft fuselage`,
    `x_tail ${G.xTail.toFixed(2)} m against x_wing ${G.xWing.toFixed(2)} m`);
}

/* ── 9. THE DISTRIBUTED/POINT SPLIT IS THE SOURCE'S LIST ─────────────
   The shell must be smeared — it is the largest fuselage mass and
   putting it at one station was the defect that inverted section 3's
   comparison. The nose-concentrated fixed weight must be excluded from
   the closed form, which is (A.79)'s own sentence about W_fix. */
console.log("\n9. The shell is distributed and the nose fixed weight is excluded, per (A.79)");
for (const t of WITH) {
  const sc = LOADS[t].scenarios.find((s) => s.id === "manoeuvre");
  const smeared = sc.stationedBasis.smearedOverShell.map((i) => i.name);
  const excluded = sc.smearedBasis.excludedAsNoseFixedWeight.map((i) => i.name);
  check(smeared.includes("Fuselage"),
    `${t}: the fuselage shell is spread along the shell, not left at one station`,
    `smeared: ${smeared.join(", ")}`);
  check(excluded.length > 0 && sc.smearedBasis.excludedWhy.includes("Wfix"),
    `${t}: nose-concentrated fixed weight is excluded from the closed form, quoting the source`,
    `excluded: ${excluded.join(", ") || "none"}`);
  const shellKg = sc.stationedBasis.smearedOverShell.find((i) => i.name === "Fuselage")?.kg ?? 0;
  const pointKg = sc.stationedBasis.asPointLoads.reduce((s, i) => s + i.kg, 0);
  check(shellKg > 0.25 * pointKg,
    `${t}: the smeared shell is a material fraction of the fuselage mass, so the split matters`,
    `shell ${shellKg.toFixed(0)} kg against ${pointKg.toFixed(0)} kg of point loads`);
}

/* ── 10. PROVENANCE ─────────────────────────────────────────────────── */
console.log("\n10. Every number here is traceable to the document it came from");
for (const t of WITH) {
  const f = LOADS[t];
  check(/A\.79/.test(f.sources.bending) && /TASOPT/.test(f.sources.bending),
    `${t}: the bending model cites TASOPT Appendix A by equation`, f.sources.bending.slice(0, 92) + "…");
  check(/A\.77/.test(f.sources.relief),
    `${t}: the inertial-relief factor cites the equation it comes from`, f.sources.relief.slice(0, 92) + "…");
  check(f.caveats.some((c) => /TAILCONE IS NOT IN THE LUMP/.test(c))
        && f.caveats.some((c) => /WING-GROUP CG/.test(c)),
    `${t}: the two known departures from the source are stated, not buried`,
    `${f.caveats.length} caveats`);
}
check(R_MH === 0.4, "r_Mh is TASOPT's stated 0.4 and is not silently retuned", `r_Mh = ${R_MH}`);

console.log(`\n${bar}`);
console.log(`FUSELAGE LOADS GATE: ${passes} passed, ${fails} failed`);
console.log(bar);
process.exit(fails > 0 ? 1 : 0);
