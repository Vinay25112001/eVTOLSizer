/* ═══════════════════════════════════════════════════════════════════════
   PAVEMENT LOADING GATE — G8
   ═══════════════════════════════════════════════════════════════════════
   G8 reports three things and computes no ACN (LANDING-GEAR.md §1.6):
   the tyre-pressure code (30), the load per main leg and per wheel, and
   an ACN ESTIMATE by (31), Airbus's own linear interpolation between two
   published anchors of a similar aircraft with its stated 5-10 % error.

   THE GATE ON (31) IS THE SOURCE'S OWN WORKED EXAMPLE. Boeing's 737 MAX
   ACAP (D6-38A004 Rev K, section 7.10 p. 7-16) reads its charts for a
   737-7 at 135,000 lb on a code-B subgrade: flexible ACN 32.6, rigid 37.8.
   Linear interpolation between the table's two anchors on p. 7-17 must
   land inside the 10 % Airbus states, and it does at +3 % and +0.8 %. That
   is a check of the rule against a manufacturer's chart, not of the code
   against itself; the transcription of every anchor is asserted against
   the numbers read off the pages this session.

   Then: the code thresholds are Table 4-2's exactly; the estimate refuses
   outside the published range and for any gear that is not twin-wheel;
   the band brackets the point; the nearest covering reference is chosen;
   on the sized aircraft only the transport gets an estimate, the business
   jet and turboprop being far below every anchor, and the per-leg load
   fraction is reported beside the ACAPs' 46.7-47.2 %.

   MUTANTS, nine, every one caught by a named check: flexible and rigid
   swapped on an anchor; one anchor digit wrong; extrapolation allowed; the
   fraction reversed; four-wheel bogies accepted; the heaviest covering
   reference chosen; a 1 % band; the leg load over the whole weight; the
   code from the rated rather than the operating pressure.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as E from "../src/classes/aircraft/engine.js";
import { gearOf } from "../src/classes/aircraft/gear.js";
import { pavementCode } from "../src/engine/gear/tyre-select.js";
import { ACN_REFERENCES, interpolateAcn, chooseReference, pavementOf, ACN_ERROR_BAND } from "../src/engine/gear/pavement.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
console.log(bar); console.log("PAVEMENT LOADING GATE — G8"); console.log(bar);

/* ── 1. TRANSCRIPTION of the anchors, against the pages ──────────────── */
console.log("\n1. The anchors are the pages' numbers");
const PAGE = {   // read off 737MAX_RevK.pdf p. 191 and LANDING-GEAR.md section 3.5 this session
  "Boeing 737-7": [[177500, 200, [43, 46, 51, 56], [50, 52, 55, 57]], [95000, 200, [21, 22, 23, 27], [24, 25, 26, 28]]],
  "Boeing 737-8": [[182700, 207, [45, 48, 53, 58], [52, 55, 57, 59]], [95000, 207, [21, 22, 23, 27], [24, 25, 27, 28]]],
  "Boeing 737-9": [[195200, 225, [50, 53, 58, 63], [58, 61, 63, 65]], [95000, 225, [22, 22, 24, 27], [25, 26, 27, 29]]],
  "Airbus A320-200 (WV008)": [[null, 171, [38, 39, 44, 50], [41, 44, 47, 49]], [null, 171, [20, 20, 22, 25], [21, 23, 24, 26]]],
};
for (const ref of ACN_REFERENCES) {
  const want = PAGE[ref.aircraft];
  const ok = want && ref.anchors.every((a, i) => (want[i][0] == null || a.massLb === want[i][0]) && a.tyrePsi === want[i][1]
    && JSON.stringify(a.flexible) === JSON.stringify(want[i][2]) && JSON.stringify(a.rigid) === JSON.stringify(want[i][3]));
  check(!!ok, `${ref.aircraft}: both anchors, flexible and rigid A-D, match the page`, ref.source.slice(0, 70));
}
check(ACN_REFERENCES.find((r) => r.aircraft.includes("A320")).anchors.map((a) => a.massKg).sort((a, b) => a - b).join("/") === "42000/73900",
  "the A320 anchors are at 42 000 and 73 900 kg, the ACAP's own two rows", "");

/* ── 2. THE RULE AGAINST THE MANUFACTURER'S CHART ────────────────────── */
console.log("\n2. (31) against Boeing's worked example: 737-7, 135,000 lb, subgrade B");
{
  const ref = ACN_REFERENCES.find((r) => r.aircraft === "Boeing 737-7");
  const ex = ref.workedExample;
  const est = interpolateAcn(ref, ex.massLb / 2.20462);
  const eF = est.flexible[1] / ex.flexible - 1, eR = est.rigid[1] / ex.rigid - 1;
  check(est.resolved && Math.abs(eF) < ACN_ERROR_BAND && Math.abs(eR) < ACN_ERROR_BAND,
    "linear interpolation lands inside the 10 % the source states, on both pavement types",
    `flexible ${est.flexible[1].toFixed(1)} vs chart ${ex.flexible} (${(100 * eF).toFixed(1)} %); rigid ${est.rigid[1].toFixed(1)} vs ${ex.rigid} (${(100 * eR).toFixed(1)} %)`);
  check(Math.abs(eF) > 0.01, "and it is not exact: the chart is curved and the rule is a line, which is why the band exists", `${(100 * eF).toFixed(1)} % on flexible`);
  // by hand, different arithmetic, in the page's own kilograms (43,091 and 80,512 kg, which are
  // the ACAP's rounded conversions and not 95,000 / 2.20462 to the last digit)
  const f = (135000 / 2.20462 - 43091) / (80512 - 43091);
  check(Math.abs(est.flexible[1] - (22 + 24 * f)) < 1e-9 && Math.abs(est.rigid[1] - (25 + 27 * f)) < 1e-9 && Math.abs(est.fraction - f) < 1e-12,
    "the interpolation reproduces the hand value", `fraction ${f.toFixed(5)} (in pounds it would be ${((135000 - 95000) / (177500 - 95000)).toFixed(5)}: the ACAP's kg column is rounded)`);
}

/* ── 3. THE RULE'S EDGES ─────────────────────────────────────────────── */
console.log("\n3. Refusals and the code thresholds");
{
  const ref = ACN_REFERENCES.find((r) => r.aircraft === "Boeing 737-8");
  const below = interpolateAcn(ref, 30000), above = interpolateAcn(ref, 90000), edge = interpolateAcn(ref, 43091);
  check(!below.resolved && !above.resolved && edge.resolved && edge.fraction === 0,
    "outside the published range the estimate is refused, not extrapolated; the edge is inside", below.why);
  const twin = chooseReference(60000, { wheelsPerAxle: 2, legs: 2 }), quad = chooseReference(60000, { wheelsPerAxle: 4, legs: 2 });
  check(twin.resolved && twin.ref.aircraft === "Airbus A320-200 (WV008)" && !quad.resolved,
    "60 t picks the lightest covering twin-wheel reference (the A320) and a four-wheel bogie is refused", quad.why);
  const heavy = chooseReference(85000, { wheelsPerAxle: 2, legs: 2 });
  check(heavy.resolved && heavy.ref.aircraft === "Boeing 737-9", "85 t is covered only by the 737-9", heavy.ref.aircraft);
  const tiny = chooseReference(9000, { wheelsPerAxle: 2, legs: 2 });
  check(!tiny.resolved && /outside every published reference/.test(tiny.why), "9 t is below every anchor and gets no estimate", tiny.why);
  const codes = [[300, "W"], [254, "X"], [254.1, "W"], [181, "Y"], [181.1, "X"], [73, "Z"], [73.1, "Y"], [50, "Z"]];
  check(codes.every(([psi, c]) => pavementCode(psi).code === c), "(30): W/X/Y/Z break exactly at 254, 181 and 73 psi, AC 150/5335-5C Table 4-2",
    codes.map(([p, c]) => `${p}:${pavementCode(p).code}`).join(" "));
}

/* ── 4. ON THE SIZED AIRCRAFT ────────────────────────────────────────── */
console.log("\n4. On the sized aircraft");
for (const type of ["transport", "bizjet", "turboprop", "trainer"]) {
  const r = E.designAircraft({ type }); const g = gearOf(r);
  if (!g.resolved) { check(g.pavement === undefined || g.pavement.resolved === false, `${type}: no gear -> no pavement report`, g.why); continue; }
  const pv = g.pavement;
  check(pv.resolved && pv.code.main.code === pavementCode(g.tyres.main.operatingPsi).code,
    `${type}: the code follows the selected main tyre's operating pressure`, `${g.tyres.main.operatingPsi.toFixed(0)} psi -> ${pv.code.main.code} (${pv.code.main.label})`);
  check(Math.abs(pv.legLoad.pctOfWeight - 100 * g.statics.mainLoadTotal / 2 / (r.mtowKg * 2.20462)) < 1e-9,
    `${type}: load on one main leg is G2's static split over two legs`, `${pv.legLoad.pctOfWeight.toFixed(1)} % of weight (ACAPs: 46.7-47.2 %), ${pv.legLoad.perWheelLb.toFixed(0)} lb per wheel`);
  if (type === "transport") {
    check(pv.acn.resolved && pv.acn.estimate && pv.acn.flexible.length === 4 && pv.acn.bandFlexible[1][0] < pv.acn.flexible[1] && pv.acn.flexible[1] < pv.acn.bandFlexible[1][1],
      `transport: an ACN estimate is made against ${pv.acn.aircraft} with a +/-10 % band that brackets the point`,
      `flexible A-D ${pv.acn.flexible.map((v) => v.toFixed(0)).join("/")}, rigid ${pv.acn.rigid.map((v) => v.toFixed(0)).join("/")} at ${Math.round(r.mtowKg)} kg; reference tyre ${pv.acn.referenceTyrePsi} psi vs ours ${pv.acn.aircraftTyrePsi?.toFixed(0)} psi`);
    const own = interpolateAcn(ACN_REFERENCES.find((x) => x.aircraft === pv.acn.aircraft), r.mtowKg);
    check(JSON.stringify(own.flexible) === JSON.stringify(pv.acn.flexible), "transport: the estimate is (31) on the chosen reference, nothing else", "");
  } else {
    check(pv.acn.resolved === false && /outside every published reference/.test(pv.acn.why),
      `${type}: no estimate, because ${Math.round(r.mtowKg)} kg is below every published anchor`, pv.acn.why.slice(0, 90));
  }
}

/* ── 5. WHAT IS NOT COMPUTED IS SAID ─────────────────────────────────── */
console.log("\n5. The absences are named");
{
  const src = readFileSync(new URL("../src/engine/gear/pavement.js", import.meta.url), "utf8");
  check(/FAARFIELD/.test(src) && /5335-5D/.test(src) && /5335-5C/.test(src) && /7-9-0/.test(src) && !/Westergaard[^]*=/.test(src.split("export function")[1] ?? ""),
    "the module names the FAA circulars and the Airbus rule and computes no Westergaard or CBR solution", "");
  const pv = pavementOf(gearOf(E.designAircraft({ type: "transport" })), E.designAircraft({ type: "transport" }));
  check(pv.notComputed.length >= 3 && pv.notComputed.some((c) => /layered elastic/.test(c)) && pv.acn.massUsed.basis.includes("TAXI"),
    "the ACN method, the taxi weight and the PCN comparison are each named as not computed", `${pv.notComputed.length} items`);
}

console.log(`\n${bar}\nPAVEMENT LOADING GATE: ${passes} passed, ${fails} failed\n${bar}`);
process.exit(fails ? 1 : 0);
