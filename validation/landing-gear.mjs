/* =====================================================================
   LANDING GEAR GATE — the tyre rule, against aircraft that actually fly
   =====================================================================
   G9 of LANDING-GEAR.md section 4. Every case below is an aeroplane whose
   gear is published in its manufacturer's Airport Planning document, and
   the question this gate asks is the one 25.733 actually poses: does
   the tyre that aeroplane FLIES comply with every rule that applies to it,
   at the margin the research note measured?

   NOT "does the tool pick Boeing's tyre". It does not, and that is not a
   failure: 25.733 is a constraint, not an optimiser. On the 737-8 the
   lightest complying tyre is the 46x17.0R20 at 0.8 % margin while Boeing
   fits the H44.5x16.5R21 at 5.7 %. Both comply. Asserting the stronger
   claim would be asserting something the regulation never says.

   WHY THIS IS NOT A SELF-CONSISTENCY TEST. The engine could compute a
   load, look up a tyre for that load, and agree with itself forever. The
   737 and 777 cases below are external: the loads come from the ACAP, the
   tyres come from Goodyear's application charts, and neither was derived
   from this code.

   THE DATA BOOK ITSELF IS CHECKED, not assumed. The generator
   (tools/extract-tyres.py) refuses to emit unless every row agrees
   between the `pdftotext -table` extraction and an independent
   coordinate re-extraction of the PDF. This gate additionally checks
   that the rows the validation depends on are PRESENT and carry the
   values the research note transcribed by hand -- because the first
   version of that generator silently dropped the entire radial table,
   which is the table these aircraft use, and every row it did emit was
   perfectly correct. Correct is not complete.
   ===================================================================== */
import { TYRES } from "../src/data/tyres.js";
import {
  selectMainTyre, selectNoseTyre, pavementCode, verifyTyre, MULTI_WHEEL_FACTOR,
} from "../src/engine/gear/tyre-select.js";
import {
  staticReactions, brakedNoseReaction, noseTyreLoads,
  dynamicResponseFactor, BRAKING,
} from "../src/engine/gear/ground-loads.js";
import {
  sinkCases, part23SinkFps, PART25_SINK, PART23_SINK, certificationBasis,
} from "../src/engine/gear/sink-speed.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const pct = (x) => `${(100 * x).toFixed(1)} %`;

console.log("LANDING GEAR GATE");
console.log("=".repeat(78));

/* ── 1. THE DATA BOOK ROWS THE VALIDATION RESTS ON ────────────────────
   Transcribed by hand in LANDING-GEAR.md section 3.3 from page 11 of the
   data book. If the generator ever drops the radial table again, this
   fires immediately rather than three checks later as a mystery. */
console.log("\n-- the radial rows these aircraft use are present and right --");

const RADIAL_TRUTH = [
  { size: "27x7.75R15",    ply: 12, loadLb: 9650,  psi: 200, brakeLb: 14475, bottomLb: 28950,  odMaxIn: 27.70, slrIn: 11.75 },
  { size: "42x17.0R18",    ply: 26, loadLb: 36100, psi: 194, brakeLb: 54150, bottomLb: 108300, odMaxIn: 43.50, slrIn: 17.42 },
  { size: "H44.5x16.5R21", ply: 30, loadLb: 48400, psi: 230, brakeLb: 70180, bottomLb: 130680, odMaxIn: 45.95, slrIn: 18.14 },
  { size: "50x20.0R22",    ply: 32, loadLb: 57100, psi: 220, brakeLb: 85650, bottomLb: 171300, odMaxIn: 51.75, slrIn: 20.83 },
  { size: "46x17.0R20",    ply: 30, loadLb: 46000, psi: 222, brakeLb: 69000, bottomLb: 138000, odMaxIn: 47.50, slrIn: 19.20 },
];

for (const t of RADIAL_TRUTH) {
  const row = TYRES.find((r) => r.size === t.size && r.ply === t.ply);
  if (!row) {
    check(false, `${t.size} ${t.ply}PR is in the data book`,
      "absent - has the generator dropped a table?");
    continue;
  }
  const same = row.loadLb === t.loadLb && row.psi === t.psi
            && row.brakeLb === t.brakeLb && row.bottomLb === t.bottomLb
            && near(row.odMaxIn, t.odMaxIn, 1e-9) && near(row.slrIn, t.slrIn, 1e-9);
  check(same, `${t.size} ${t.ply}PR matches the hand-transcribed row`,
    `${row.loadLb} lb at ${row.psi} psi, OD ${row.odMaxIn} in, SLR ${row.slrIn} in`);
}

check(TYRES.some((t) => t.size.includes("R")),
  "the radial family survived extraction at all",
  `${TYRES.filter((t) => t.size.includes("R")).length} radial rows of ${TYRES.length}`);

/* ── 2. BOEING 737-8 ──────────────────────────────────────────────────
   LANDING-GEAR.md section 3.3, derived from D6-38A004 Rev K.
   Main: 2 tyres per strut, 85 258 lb on the strut.
   Nose: 2 tyres, 15 894 lb static, 26 282 lb at the 0.31 g case. */
console.log("\n-- Boeing 737-8: does the tyre it flies comply? --");

{
  const perStrutLb = 85258;
  const m = selectMainTyre({ mainLoadTotalLb: perStrutLb, legs: 1, wheelsPerAxle: 2 });
  check(m.resolved && near(m.requiredRatingLb, 45613, 2),
    "737-8 main: the 1.07 factor reproduces the note's 45 613 lb",
    m.resolved ? `${Math.round(m.loadPerTyreLb)} x ${MULTI_WHEEL_FACTOR} = `
               + `${Math.round(m.requiredRatingLb)} lb` : m.why);

  /* THE PROVABLE CLAIM: Boeing's actual tyre complies, at the margin the
     research note records. */
  const boeing = TYRES.find((t) => t.size === "H44.5x16.5R21" && t.ply === 30);
  const v = verifyTyre(boeing, [
    { label: "main, 25.733(c)(1)", requiredRatingLb: 45613, src: "14 CFR 25.733(c)(1)" },
  ]);
  check(v.complies && near(v.marginPct, 5.7, 0.2),
    "737-8 main: the tyre Boeing actually fits complies, at the note's 5.7 % margin",
    `H44.5x16.5R21 rated ${boeing.loadLb} lb, margin ${v.marginPct.toFixed(1)} %`);

  /* AND the tool's suggestion also complies -- which is all the rule asks.
     It is NOT Boeing's tyre, and that is not a failure: 25.733 constrains,
     it does not select. */
  const suggestion = verifyTyre(m.tyre, [
    { label: "main, 25.733(c)(1)", requiredRatingLb: m.requiredRatingLb },
  ]);
  check(suggestion.complies,
    "737-8 main: the tool's lightest-complying suggestion also complies",
    `${m.tyre.size} rated ${m.tyre.loadLb} lb, margin ${suggestion.marginPct.toFixed(1)} % `
    + `- a different tyre from Boeing's, both legal`);

  const noseCases = [
    { label: "static",     resolved: true, load: 15894, limitFactor: 1.0, src: "25.733(b)(1)" },
    { label: "0.31 g fwd", resolved: true, load: 26282, limitFactor: 1.5, src: "25.733(b)(2)" },
  ];
  const n = selectNoseTyre({ cases: noseCases, tyres: 2 });
  check(n.resolved && n.binding.label === "0.31 g fwd",
    "737-8 nose: the BRAKED case binds, not the static one",
    n.resolved ? n.demands.map((d) => `${d.label} ${Math.round(d.requiredRatingLb)} lb`).join(", ")
               : n.why);

  const boeingNose = TYRES.find((t) => t.size === "27x7.75R15" && t.ply === 12);
  const vn = verifyTyre(boeingNose, n.demands);
  check(vn.complies && near(vn.marginPct, 9.2, 0.3),
    "737-8 nose: Boeing's 27x7.75R15 complies, at the note's 9.2 % margin",
    `binding ${Math.round(vn.binding.requiredRatingLb)} lb against `
    + `${boeingNose.loadLb} lb rated, margin ${vn.marginPct.toFixed(1)} %`);

  check(vn.speed.ok === null && /UNCHECKED/.test(vn.speed.why),
    "with no lift-off speed supplied, the 25.733(a) speed rating is reported UNCHECKED",
    "not silently passed");
}

/* ── 3. BOEING 777-200ER at 658 000 lb ────────────────────────────────
   Six tyres per truck, 302 000 lb per truck; nose 70 100 lb static. */
console.log("\n-- Boeing 777-200ER: the six-wheel truck --");

{
  const m = selectMainTyre({ mainLoadTotalLb: 302000, legs: 1, wheelsPerAxle: 6 });
  check(m.resolved && near(m.requiredRatingLb, 53857, 3),
    "777-200ER main: reproduces the note's 53 857 lb requirement",
    m.resolved ? `302000/6 = ${Math.round(m.loadPerTyreLb)}, x1.07 = ${Math.round(m.requiredRatingLb)}` : m.why);

  const boeing = TYRES.find((t) => t.size === "50x20.0R22" && t.ply === 32);
  const v = verifyTyre(boeing, [
    { label: "main, 25.733(c)(1)", requiredRatingLb: 53857 },
  ]);
  check(v.complies && near(v.marginPct, 5.7, 0.2),
    "777-200ER main: Boeing's 50x20.0R22 complies at 5.7 % -- the SAME margin as the 737",
    `rated ${boeing.loadLb} lb, margin ${v.marginPct.toFixed(1)} % `
    + `(the note remarks on the coincidence, and it holds)`);

  const boeingNose = TYRES.find((t) => t.size === "42x17.0R18" && t.ply === 26);
  const vn = verifyTyre(boeingNose, [
    { label: "nose static, 25.733(b)(1)", requiredRatingLb: 70100 / 2 },
  ]);
  check(vn.complies && near(vn.marginPct, 2.9, 0.3),
    "777-200ER nose: Boeing's 42x17.0R18 complies statically at the note's 2.9 %",
    `${70100 / 2} lb against ${boeingNose.loadLb} lb rated, margin ${vn.marginPct.toFixed(1)} %`);

  /* The note records that the PUBLISHED braked figure exceeds 1.5x rating
     by 1.9 %, and explains it: the ACAP number is at maximum design taxi
     weight while 25.733(b)(2) applies at maximum LANDING weight. Encode the
     discrepancy so it stays explained rather than being rediscovered. */
  const braked = verifyTyre(boeingNose, [
    { label: "nose braked at MDTW (the ACAP figure)",
      requiredRatingLb: 110400 / 2 / 1.5 },
  ]);
  check(!braked.complies && near(-braked.marginPct, 1.9, 0.4),
    "777-200ER nose: the ACAP braked figure DOES exceed 1.5 x rating, by the note's 1.9 %",
    `over by ${(-braked.marginPct).toFixed(1)} % - not a contradiction: the ACAP is at max `
    + `design TAXI weight, 25.733(b)(2) applies at max LANDING weight`);
}

/* ── 4. THE WEIGHT THE BRAKED CASE IS RUN AT ──────────────────────────
   LANDING-GEAR.md section 3.3 records that the 777's published braked
   nose load EXCEEDS 1.5x rating by 1.9 % -- and that this is not a
   contradiction, because the ACAP figure is at maximum design taxi
   weight while 25.733(b)(2) applies the 0.31 g case at maximum LANDING
   weight. The note asks for this to be flagged in the tool. Encode it as
   a check rather than a comment: running (b)(2) at the wrong weight
   over-sizes the nose tyre, and the gate proves the direction. */
console.log("\n-- 25.733(b)(2) is a LANDING-weight case, and it matters --");

{
  /* 777-200ER order of magnitude: wheelbase 25.9 m, nose load ~8 %, CG ~5 m up. */
  const geom = { noseArmA: 23.8, mainArmB: 2.07, cgHeightE: 5.0 };
  const mtow = 658000, mlw = 470000;     // 777-200ER order of magnitude
  const atMlw = noseTyreLoads({ rampWeight: mtow, landingWeight: mlw, ...geom });
  const wrong = noseTyreLoads({ rampWeight: mtow, landingWeight: mtow, ...geom });
  const c1 = atMlw.cases.find((c) => c.label === "0.31 g fwd");
  const c2 = wrong.cases.find((c) => c.label === "0.31 g fwd");
  check(c1.resolved && c2.resolved && c2.requiredRating > c1.requiredRating,
    "running the 0.31 g case at take-off weight over-sizes the nose tyre",
    `at MLW ${Math.round(c1.requiredRating)} lb vs at MTOW ${Math.round(c2.requiredRating)} lb `
    + `(+${pct(c2.requiredRating / c1.requiredRating - 1)})`);
  check(c1.limitFactor === 1.5,
    "and the 0.31 g case carries the rule's 1.5 x rating allowance",
    "14 CFR 25.733(b)(2)");
}

/* ── 5. THE STATIC SPLIT AGAINST AIRCRAFT THAT FLY ────────────────────
   LANDING-GEAR.md section 3.4: measured nose-load fractions run 4.6 % to
   12.7 % of maximum design taxi weight across the 737 and 777 families.

   THE LOW END WAS WRONG HERE AND IS CORRECTED. This band was written as
   5.6-12.7 %, taken from the note's SUMMARY table (section 3.7). The
   note's own DATA table has a 4.6 % row — the 777-200 at 447,000 lb at
   its aft CG — which the summary drops, and this gate and
   src/engine/gear/ground-loads.js both copied the summary. 4.6 % is the
   measured minimum and is what the band says now.

   It mattered: the A320 case below lands at 5.85 %, which cleared the old
   5.6 % floor by a quarter of a point. A bound that close to a CORRECT
   result is a coin flip, not a gate. The check keeps its teeth from the
   swap case that follows, which is the failure this band exists for and
   which misses by an order of magnitude, not by a quarter point.
   The A320 ACAP gives "load on one main gear leg 47.0 %", i.e. 94 % on
   the mains and 6 % on the nose. A split outside that band means A and B
   have been swapped, which otherwise produces entirely plausible numbers. */
console.log("\n-- the static split lands where real aeroplanes land --");

{
  const r = staticReactions({ weight: 73900, noseArmA: 11.9, mainArmB: 0.74 });
  check(r.resolved && r.noseFraction > 0.046 && r.noseFraction < 0.127,
    "A320-like geometry puts the nose load inside the measured 4.6-12.7 % band",
    r.resolved ? `nose ${pct(r.noseFraction)}, one main leg ${pct((1 - r.noseFraction) / 2)} `
               + `against the ACAP's 47.0 %` : r.why);

  /* Swapping A and B is the failure this band exists to catch. */
  const swapped = staticReactions({ weight: 73900, noseArmA: 0.74, mainArmB: 11.9 });
  check(swapped.resolved && swapped.noseFraction > 0.5,
    "swapping the nose and main arms is caught by that band, not hidden",
    `swapped gives nose ${pct(swapped.noseFraction)} - absurd, and detectable`);

  check(!staticReactions({ weight: 1000, noseArmA: 0, mainArmB: 0 }).resolved,
    "a degenerate wheelbase refuses rather than dividing by zero", "resolved:false");
}

/* ── 6. 25.493(e), AND ITS OWN DEFINITION OF f ────────────────────────
   f = 1 + exp(-pi z / sqrt(1-z^2)) is given in the rule itself, and at
   zero damping it equals 2 -- which IS the blanket value the rule directs
   be used. Checking that identity is what makes the constant sourced
   rather than merely quoted. */
console.log("\n-- the dynamic response factor is the rule's own formula --");

check(near(dynamicResponseFactor(0), 2.0, 1e-12),
  "f(0) = 2 exactly, so the rule's blanket 2.0 IS the undamped case",
  `f(0) = ${dynamicResponseFactor(0)}`);
check(dynamicResponseFactor(0.2) < 2.0 && dynamicResponseFactor(0.5) < dynamicResponseFactor(0.2),
  "and any substantiated damping gives a LOWER factor, never higher",
  `f(0.2) = ${dynamicResponseFactor(0.2).toFixed(4)}, f(0.5) = ${dynamicResponseFactor(0.5).toFixed(4)}`);
check(BRAKING.frictionCoefficient === 0.8,
  "the braking friction coefficient is the rule's 0.80", "14 CFR 25.493(e)");

{
  const b = brakedNoseReaction({ takeoffWeight: 658000, noseArmA: 23.8, mainArmB: 2.07, cgHeightE: 5.0 });
  check(b.resolved && b.load > b.staticLoad,
    "braking transfers load ONTO the nose, which is the point of the case",
    b.resolved ? `static ${Math.round(b.staticLoad)} lb -> braked ${Math.round(b.load)} lb `
               + `(x${b.transferRatio.toFixed(2)})` : b.why);
}

/* ── 7. SINK SPEED — the right rule per class, and the clips ──────────*/
console.log("\n-- sink speed comes from the certification basis, not from 25.337 --");

check(certificationBasis("transport") === "part25" && certificationBasis("trainer") === "part23",
  "the trainer certifies to Part 23 and the rest to Part 25", "");

{
  const p25 = sinkCases({ type: "transport", mtowKg: 79000, mlwKg: 66000 });
  check(p25.cases.length === 2,
    "Part 25 gives TWO sizing cases, not one",
    p25.cases.map((c) => `${c.label} ${c.vFps} fps`).join(", "));
  check(p25.cases.find((c) => c.label === "landing").vFps === 10
     && p25.cases.find((c) => c.label === "take-off").vFps === 6
     && p25.reserve.vFps === 12,
    "10 fps at MLW, 6 fps at MTOW, 12 fps reserve",
    "14 CFR 25.473(a)(2),(3) and 25.723(b)");
  check(p25.liftFraction === 1.0,
    "Part 25 may assume lift equal to weight", "14 CFR 25.473(b)");
}

{
  /* 4.4 (W/S)^0.25: the clips are the rule's own words, so exercise both. */
  const low = part23SinkFps(4), mid = part23SinkFps(20), high = part23SinkFps(60);
  check(low.clipped === "low" && low.fps === 7,
    "a very light wing loading is clipped UP to the 7 fps floor",
    `W/S 4 gives ${low.raw.toFixed(2)} fps -> ${low.fps}`);
  check(high.clipped === "high" && high.fps === 10,
    "a heavy wing loading is clipped DOWN to the 10 fps ceiling",
    `W/S 60 gives ${high.raw.toFixed(2)} fps -> ${high.fps}`);
  check(mid.clipped === null && near(mid.fps, 4.4 * Math.pow(20, 0.25), 1e-12),
    "and in between, the law itself governs",
    `W/S 20 gives ${mid.fps.toFixed(3)} fps`);
  check(PART23_SINK.liftFraction === 2 / 3,
    "Part 23 may assume only two-thirds of weight as lift", "14 CFR 23.473(e)");
}

/* ── 8. PAVEMENT PRESSURE CODE ────────────────────────────────────────
   AC 150/5335-5C Table 4-2. The A320 ACAP prints 1.18 MPa (171 psi) and
   1.38 MPa (200 psi) for two of its variants, which straddle the Y/X
   boundary at 181 psi -- a real pair to test the boundary with. */
console.log("\n-- the pavement code is the one pavement number we can be exact about --");

check(pavementCode(171).code === "Y", "171 psi (A320 at 1.18 MPa) is code Y", "Y limit 181 psi");
check(pavementCode(200).code === "X", "200 psi (A320 at 1.38 MPa) is code X", "X limit 254 psi");
check(pavementCode(73).code === "Z" && pavementCode(73.1).code === "Y",
  "the Z/Y boundary sits exactly at 73 psi", "AC 150/5335-5C Table 4-2");
check(pavementCode(300).code === "W", "above 254 psi there is no pressure limit: W", "");

/* ── 9. THE METHOD REFUSES RATHER THAN INVENTS ────────────────────────*/
console.log("\n-- an impossible demand is refused, not rounded down --");

{
  const huge = selectMainTyre({ mainLoadTotalLb: 5_000_000, legs: 2, wheelsPerAxle: 2 });
  check(!huge.resolved && /no tyre/i.test(huge.why),
    "a load beyond every tyre in the book refuses and says why",
    huge.why);
  const capped = selectMainTyre({ mainLoadTotalLb: 200000, legs: 2, wheelsPerAxle: 2, maxPsi: 73 });
  check(!capped.resolved || capped.tyre.psi <= 73,
    "a pressure cap is honoured rather than quietly exceeded",
    capped.resolved ? `${capped.tyre.size} at ${capped.tyre.psi} psi` : capped.why);
}

/* The 1.07 must actually bind: if it were dropped, a smaller tyre would
   sometimes be chosen. Prove it moves a real selection. */
{
  /* Same load PER TYRE under both arrangements, so the only difference is
     the rule that applies. Both must resolve, or the comparison is vacuous
     -- an earlier version of this check asked for 90 400 lb on one wheel,
     which no tyre in the book carries, so it compared against undefined. */
  const perTyre = 60000;
  const single = selectMainTyre({ mainLoadTotalLb: perTyre, legs: 1, wheelsPerAxle: 1 });
  const dual = selectMainTyre({ mainLoadTotalLb: 2 * perTyre, legs: 1, wheelsPerAxle: 2 });
  check(single.resolved && dual.resolved,
    "both arrangements resolve, so the comparison below is not vacuous",
    single.resolved && dual.resolved
      ? `single ${single.tyre.size}, dual ${dual.tyre.size}` : "one did not resolve");
  check(single.multiWheelFactor === 1.0 && dual.multiWheelFactor === MULTI_WHEEL_FACTOR
     && near(dual.requiredRatingLb / single.requiredRatingLb, MULTI_WHEEL_FACTOR, 1e-9),
    "the 1.07 applies to a multi-wheel axle and not to a single wheel",
    `same ${perTyre} lb per tyre: single needs ${Math.round(single.requiredRatingLb)} lb, `
    + `dual needs ${Math.round(dual.requiredRatingLb)} lb - 14 CFR 25.733(c)(1) against (a)(1)`);
}

console.log("");
console.log(fails.length ? `LANDING GEAR GATE FAILED: ${fails.length} check(s)`
                         : `LANDING GEAR GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
