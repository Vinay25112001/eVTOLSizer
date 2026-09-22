/* =====================================================================
   AIRCRAFT ENGINE GATE (src/classes/aircraft/engine.js)
   =====================================================================
   The aircraft engine adds no physics of its own; it wraps each class's
   validated sizing loop in one result and builds the design views on it.
   This gate checks that the wrapping is faithful and the views are
   consistent with the sizing they come from:
   1. the common result equals the class's own numbers, for every type
      and both jobs, and its masses add up;
   2. the matching chart's design point satisfies every drawn requirement;
   3. the payload-range diagram passes through the design mission;
   4. trades change exactly what they say;
   5. the type comparison and the reference table behave as documented;
   6. the studio's tabs are all reachable.
   ===================================================================== */

import * as E from "../src/classes/aircraft/engine.js";
import { REFERENCE_AIRCRAFT } from "../src/classes/aircraft/reference-aircraft.js";
import { sizeTrainer, analyzeTrainer } from "../src/classes/trainer/size.js";
import { sizeTurboprop, analyzeTurboprop } from "../src/classes/turboprop/size.js";
import { sizeTransport, analyzeTransport } from "../src/classes/transport/size.js";
import { BIZJET_DEFAULTS } from "../src/classes/bizjet/defaults.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const LB = 0.45359237;
const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...BIZ } = BIZJET_DEFAULTS;

console.log("AIRCRAFT ENGINE GATE");
console.log("=".repeat(72));

console.log("\n1. The common result");
const own = {
  trainer: [() => sizeTrainer({}), (a) => analyzeTrainer(a)],
  turboprop: [() => sizeTurboprop({}), (a) => analyzeTurboprop(a)],
  transport: [() => sizeTransport({}), (a) => analyzeTransport(a)],
  bizjet: [() => sizeTransport(BIZ), (a) => analyzeTransport({ ...BIZ, ...a })],
};
const results = {};
for (const id of E.TYPE_IDS) {
  const t = E.typeOf(id);
  const an = Object.fromEntries(Object.entries(t.analysisInputs).map(([k, v]) => [k, v.value]));
  const r = E.designAircraft({ type: id, mode: "size", params: {} });
  const a = E.designAircraft({ type: id, mode: "analyse", params: an });
  results[id] = r;
  const [sz, anz] = own[id];
  const s0 = sz(), a0 = anz(an);
  check(`${t.label}: sized and analysed results are the class's own`,
        r.mtowKg === s0.grossLb * LB && r.converged === s0.converged && a.mtowKg === a0.grossLb * LB
        && Math.abs(a.oewKg - (a0.operatingEmptyLb ?? a0.emptyLb) * LB) < 1e-9,
        `MTOW ${r.mtowKg.toFixed(0)} kg, OEW ${r.oewKg.toFixed(0)} kg, wing ${r.wingAreaM2.toFixed(1)} m²`);
  check(`${t.label}: zero-fuel + fuel = take-off mass, and the weight groups add to the empty mass`,
        rel(r.zfwKg + r.fuelKg, r.mtowKg) < 1e-6
        && rel(r.weightGroups.filter((g) => !/Operating items/.test(g.name)).reduce((s, g) => s + g.kg, 0)
               + (id === "trainer" ? 0 : r.raw.weights.totals.margin * LB), r.emptyKg) < 1e-9);
  if (r.mission.length) {
    const segSum = r.mission.reduce((s, x) => s + x.kg, 0);
    check(`${t.label}: mission segments add to the mission fuel`, rel(segSum, r.fuelKg) < (id === "turboprop" ? 1e-6 : 1e-6),
          `${segSum.toFixed(1)} vs ${r.fuelKg.toFixed(1)} kg`);
  }
}
{
  let threw = false; try { E.designAircraft({ type: "glider" }); } catch { threw = true; }
  check("an unknown aircraft type is refused", threw);
}

console.log("\n2. Matching chart");
for (const id of E.TYPE_IDS) {
  const r = results[id], d = E.constraintDiagram(r);
  const x = d.design.x;
  const at = (c) => {        // linear interpolation of a curve at the design wing loading
    const p = c.points; const i = p.findIndex((q) => q[0] >= x);
    if (i <= 0) return p[0][1];
    const [x0, y0] = p[i - 1], [x1, y1] = p[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  };
  const worst = Math.max(...d.curves.map((c) => at(c) / d.design.y - 1));
  check(`${E.typeOf(id).label}: the design point meets every requirement drawn, and one of them binds`,
        worst <= 0.02 && worst >= -0.02 && Math.abs(d.verticals[0].x - x) < 1e-9 && d.curves.length >= 2,
        `closest curve ${(worst * 100).toFixed(2)} % from the design point`);
}
{
  /* Each curve is the class's own requirement: at the design wing loading it
     takes the class's value, and the take-off line is proportional to W/S. */
  const at0 = (c, x) => c.points.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b));
  const ok = ["transport", "bizjet", "turboprop"].every((id) => {
    const r = results[id], d = E.constraintDiagram(r), k = r.raw.constraints;
    const [to, cr] = d.curves;
    const prop = to.points.every((p) => Math.abs(p[1] / p[0] - to.points[0][1] / to.points[0][0]) < 1e-12);
    const want = id === "turboprop" ? [k.pmTakeoff, k.pmCruise] : [k.twTakeoff, k.twCruise];
    const x0 = d.design.x;
    const lin = (c) => { const i = c.points.findIndex((p) => p[0] >= x0); const [a, b] = [c.points[i - 1], c.points[i]];
                         return a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]); };
    return prop && Math.abs(lin(to) / want[0] - 1) < 1e-9 && Math.abs(lin(cr) / want[1] - 1) < (id === "turboprop" ? 0.01 : 0.002)
           && at0(to, x0);
  });
  check("take-off and cruise curves reproduce the class's own requirements at the design wing loading", ok);
}
check("an analysis has no matching chart", E.constraintDiagram(E.designAircraft({ type: "transport", mode: "analyse",
      params: Object.fromEntries(Object.entries(E.typeOf("transport").analysisInputs).map(([k, v]) => [k, v.value])) })) === null);

console.log("\n3. Payload-range");
for (const id of E.TYPE_IDS) {
  const r = results[id], pr = E.payloadRange(r);
  /* The design mission is the point the aircraft was sized at, so it is the
     one that must land on the design range. Where a maximum zero-fuel mass
     gives a structural payload above the design payload, that corner is a
     separate, shorter-range point, and the design point is labelled. */
  const A = pr.points.find((p) => p.design) ?? pr.points[1];
  const tanks = r.fuelCapacityKg >= r.fuelKg - 1e-6;
  check(`${E.typeOf(id).label}: the design payload at MTOW flies the design range${tanks ? "" : " (tanks too small: capped)"}`,
        tanks ? Math.abs(A.rangeNm - r.designRangeNm) < 0.5 : A.rangeNm < r.designRangeNm,
        `${A.rangeNm.toFixed(1)} vs ${r.designRangeNm} nm (${A.label})`);
  /* A structural maximum payload must sit above the design payload, or the
     entered MZFW ratio and the sized take-off mass disagree. */
  check(`${E.typeOf(id).label}: the maximum payload is at least the design payload`,
        pr.maxPayloadKg >= r.payloadKg - 1e-6,
        `${pr.maxPayloadKg.toFixed(0)} vs ${r.payloadKg.toFixed(0)} kg`
        + (pr.mzfwBelowDesign ? " — MZFW ratio below the design payload, fell back to it" : ""));
  const ranges = pr.points.map((p) => p.rangeNm), loads = pr.points.map((p) => p.payloadKg);
  check(`${E.typeOf(id).label}: range grows and payload falls along the diagram`,
        ranges.every((v, i) => i === 0 || v >= ranges[i - 1] - 1e-6) && loads.every((v, i) => i === 0 || v <= loads[i - 1] + 1e-6)
        && loads[loads.length - 1] === 0,
        pr.points.map((p) => `${p.rangeNm.toFixed(0)} nm/${p.payloadKg.toFixed(0)} kg`).join(", "));
}

console.log("\n4. Polars and trades");
for (const id of E.TYPE_IDS) {
  const r = results[id], pc = E.polarCurve(r);
  const cruise = pc.points.reduce((best, p) => (Math.abs(p.cl - r.cruise.cl) < Math.abs(best.cl - r.cruise.cl) ? p : best));
  check(`${E.typeOf(id).label}: the polar's best L/D matches the result's`,
        rel(Math.max(...pc.points.filter((p) => p.cl > 0).map((p) => p.cl / p.cd)), r.cruise.LDmax) < 0.03,
        `${Math.max(...pc.points.filter((p) => p.cl > 0).map((p) => p.cl / p.cd)).toFixed(2)} vs ${r.cruise.LDmax.toFixed(2)} (grid 0.05 in CL); near-cruise CD ${cruise.cd.toFixed(4)}`);
}
{
  const cases = E.sensitivityCases("transport", E.typeOf("transport").defaults);
  check("sensitivity: one case per numeric input, each changing only that input",
        cases.length === E.numericInputs("transport").length
        && cases.every((c) => Object.keys(c.params).filter((k) => c.params[k] !== E.typeOf("transport").defaults[k]).join() === c.key));
  const up = cases.find((c) => c.key === "designRange");
  const ev = E.evaluateCase("transport", up.params);
  check("more design range gives a heavier airliner", ev.ok && ev.mtowKg > results.transport.mtowKg);
  const g = E.tradeGrid("trainer", E.typeOf("trainer").defaults, "rangeNm", [400, 518, 700], "AR", [7, 8]);
  check("trade grid: rows by the second input, columns by the first, each point sized",
        g.length === 2 && g.every((row) => row.row.length === 3 && row.row.every((c) => c.ok))
        && g[0].row[2].mtowKg > g[0].row[0].mtowKg);
}

console.log("\n5. Type comparison and reference aircraft");
{
  check("the reference table holds only manufacturer or regulator values, each with its document",
        REFERENCE_AIRCRAFT.length > 500 && REFERENCE_AIRCRAFT.every((r) => r.source_file && Number.isFinite(r.mtow_kg)),
        `${REFERENCE_AIRCRAFT.length} aircraft`);
  const env = E.typeEnvelopes(REFERENCE_AIRCRAFT);
  check("every type has an envelope from real aircraft", E.TYPE_IDS.every((id) => env[id].n > 5 && env[id].seats && env[id].rangeNm),
        E.TYPE_IDS.map((id) => `${id} ${env[id].n}`).join(", "));
  const cmp = E.compareTypes({ seats: 70, rangeNm: 800, cruiseKt: 300, runwayM: 1500 }, REFERENCE_AIRCRAFT);
  const by = Object.fromEntries(cmp.map((c) => [c.id, c]));
  check("70 seats, 800 nm, 300 kt: a turboprop is inside its envelope; a trainer is not",
        by.turboprop.inEnvelope && by.turboprop.result?.converged && !by.trainer.inEnvelope,
        `turboprop MTOW ${by.turboprop.mtowKg?.toFixed(0)} kg; trainer: ${by.trainer.reasons[0]}`);
  const tiny = Object.fromEntries(E.compareTypes({ seats: 2, rangeNm: 400, cruiseKt: 120, runwayM: 600 }, REFERENCE_AIRCRAFT).map((c) => [c.id, c]));
  check("2 seats, 400 nm, 120 kt: below the airliner envelope, inside the trainer's",
        !tiny.transport.inEnvelope && /seats 2 /.test(tiny.transport.reasons.join()) && tiny.trainer.inEnvelope);
  check("the comparison sizes each type with its own method", cmp.length === E.TYPE_IDS.length
        && cmp.filter((c) => c.result).every((c) => c.result.type === c.id));
  const rc = E.realityCheck(results.transport, REFERENCE_AIRCRAFT);
  check("the reality check finds airliners near the default 737-800 class design",
        rc.near.length === 8 && rc.near.every((r) => ["narrowbody", "widebody", "regional-jet"].includes(r.category))
        && rc.near.some((r) => /737|A320/.test(`${r.model} ${r.variant}`)) && rc.percentile.oewFraction >= 0 && rc.percentile.oewFraction <= 1,
        rc.near.slice(0, 3).map((r) => `${r.model} ${r.variant ?? ""}`).join("; "));
  const cats = ["narrowbody", "widebody", "regional-jet"];
  check("the reality check compares against the same type only",
        rc.count === REFERENCE_AIRCRAFT.filter((r) => cats.includes(r.category)).length
        && rc.oewFraction.length <= rc.count && rc.oewFraction.length > 50);
  check("warnings and validation rows exist for every type",
        E.TYPE_IDS.every((id) => Array.isArray(E.typeWarnings(results[id])) && E.typeValidation(id).length > 0
                             && E.typeValidation(id).every((v) => Number.isFinite(v.errPct))));
}

{
  /* The ± band shown with the take-off mass is the measured mean absolute
     empty-mass error, recomputed here so the quoted number cannot drift.
     (The airliner figure comes from the dataset runs, outside the gates:
     9.6 % over 168 aircraft (was 8.8 % on Loftin's fitted landing line), eVTOL_Sizing_Research/datasets/validation-runs/
     run_default-2026-09-17f_loftinICA.txt. It was 7.9 % over 140 until the
     three-engine rows — 727, DC-10, MD-11 — were read off the ACAPS charts
     and added; the trijets size worse than the rest, so the number went up
     without the code changing. Change it only from a fresh run.) */
  const mae = (id, re) => { const v = E.typeValidation(id).filter((r) => re.test(r.name)).map((r) => Math.abs(r.errPct));
                            return v.reduce((s, x) => s + x, 0) / v.length; };
  const m = { trainer: mae("trainer", /./), turboprop: mae("turboprop", /operating empty weight/),
              bizjet: mae("bizjet", /basic operating weight/) };
  check("the quoted mass-error bands equal the measured errors (trainer, turboprop, business jet)",
        Object.entries(m).every(([id, v]) => Math.abs(v - E.METHOD_ACCURACY[id].massErrorPct) < 0.06)
        && E.METHOD_ACCURACY.transport.massErrorPct === 9.6,
        Object.entries(m).map(([id, v]) => `${id} ${v.toFixed(2)} %`).join(", "));
}

console.log("\n6. The studio");
{
  const src = readFileSync(new URL("../src/classes/aircraft/AircraftStudio.jsx", import.meta.url), "utf8");
  const tabsSrc = readFileSync(new URL("../src/classes/aircraft/tabs.jsx", import.meta.url), "utf8");
  const ids = [...src.matchAll(/\["([a-z-]+)", "[^"]+", Tabs\.(\w+)\]/g)];
  check("every studio tab names a tab component that exists, with unique ids",
        ids.length >= 15 && new Set(ids.map((m) => m[1])).size === ids.length
        && ids.every((m) => new RegExp(`export function ${m[2]}\\b`).test(tabsSrc)),
        `${ids.length} tabs`);
  const { INPUT_DECKS, deckFor, applies } = await import("../src/classes/aircraft/input-deck.js");
  const deckOk = E.TYPE_IDS.map((id) => {
    const inputs = E.typeOf(id).inputs, d = INPUT_DECKS[id];
    const listed = [...d.key, ...d.pages.flatMap((p) => p.groups.flatMap((g) => g.keys))];
    const dup = listed.filter((k, i) => listed.indexOf(k) !== i);
    const missing = Object.keys(inputs).filter((k) => !listed.includes(k));
    const unknown = [...listed, ...Object.keys(d.when)].filter((k) => !(k in inputs));
    return { id, dup, missing, unknown, other: deckFor(id, inputs).pages.some((p) => p.id === "other") };
  });
  check("the input deck places every input of every type exactly once, and names only real inputs",
        deckOk.every((r) => !r.dup.length && !r.missing.length && !r.unknown.length && !r.other),
        deckOk.filter((r) => r.dup.length || r.missing.length || r.unknown.length).map((r) => `${r.id}: dup ${r.dup} missing ${r.missing} unknown ${r.unknown}`).join("; "));
  {
    const d = deckFor("transport", E.typeOf("transport").inputs), p = E.typeOf("transport").defaults;
    check("method-only inputs show for their method alone (Loftin increment, FLOPS drag inputs, tail ratios)",
          !applies(d, "reserveIncrementNm", p) && applies(d, "reserveIncrementNm", { ...p, fuelMethod: "loftin" })
          && !applies(d, "airfoilTech", p) && applies(d, "airfoilTech", { ...p, dragMethod: "flops" })
          && applies(d, "climbCasKt", p) && !applies(d, "climbCasKt", { ...p, fuelMethod: "regulatory" })
          && applies(d, "htAreaRatio", p) && !applies(d, "htAreaRatio", { ...p, tailSizing: "volume" }));
    const largest = Math.max(...E.TYPE_IDS.map((id) => { const dd = deckFor(id, E.typeOf(id).inputs);
      return dd.key.length + Math.max(...dd.pages.map((pg) => pg.groups.reduce((s, g) => s + g.keys.length, 0))); }));
    check("no screen of the input deck shows more than 25 inputs at once", largest <= 25, `largest ${largest}`);
  }
  check("the studio never imports the eVTOL engine", !/from "\.\.\/\.\.\/engine|src\/engine\.js|lib\/defaults\.js/.test(src + tabsSrc));
}

console.log("");
console.log("\n7. Uncertainty from the validation record");
{
  const U = await import("../src/classes/aircraft/uncertainty.js");
  const { VALIDATION_RESIDUALS: RES } = await import("../src/classes/aircraft/validation-residuals.js");
  const errs = RES.map((r) => r.mtowErrPct);
  const mae = errs.reduce((s, x) => s + Math.abs(x), 0) / errs.length;
  const within5 = errs.filter((x) => Math.abs(x) <= 5).length;

  check("the residual record is the whole validated fleet, one row per aircraft",
        RES.length >= 160 && RES.every((r) => Number.isFinite(r.mtowErrPct) && r.mtowKg > 0 && r.engines >= 2),
        `${RES.length} aircraft`);

  /* The reason the band is empirical rather than a multiple of the mean
     absolute error: a Gaussian with this MAE would put ~35 % of aircraft
     inside 5 %, and far more than that are. If this ever stops being true
     the empirical machinery is no longer buying anything. */
  const gaussianWithin5 = 2 * (0.5 * (1 + erf(5 / ((mae * 1.2533) * Math.SQRT2)))) - 1;
  check("the residuals are not Gaussian, which is why nothing is fitted to them",
        within5 / RES.length > gaussianWithin5 * 1.3,
        `${within5} of ${RES.length} (${(100 * within5 / RES.length).toFixed(0)} %) within 5 %, against `
        + `${(100 * gaussianWithin5).toFixed(0)} % for a normal law with the same mean absolute error`);

  const light = E.designAircraft({ type: "transport" });
  const heavy = E.designAircraft({ type: "transport", params: { economyClass: 400, designRange: 7000, numEngines: 4 } });
  const uL = U.uncertaintyOf("transport", light), uH = U.uncertaintyOf("transport", heavy);
  check("a design is given the band of its own stratum, not the fleet average",
        uL.stratumId !== "all" && uL.n >= 12 && uH.n >= 12,
        `${uL.stratum} (n=${uL.n}) and ${uH.stratum} (n=${uH.n})`);
  check("a four-engine design is told its uncertainty is much wider than a twin's",
        (uH.p95 - uH.p05) > (uL.p95 - uL.p05) * 1.8,
        `twin ${uL.p05.toFixed(0)}..${uL.p95.toFixed(0)} %, four-engine ${uH.p05.toFixed(0)}..${uH.p95.toFixed(0)} %`);
  check("the interval is an order statistic of real aircraft, so its ends are residuals that happened",
        errs.includes(uL.p05) && errs.includes(uL.p95));
  for (const id of ["trainer", "turboprop", "bizjet"]) {
    const u = U.uncertaintyOf(id, E.designAircraft({ type: id }));
    check(`${E.typeOf(id).label}: three validation aircraft buy no interval, and it says so`,
          u.kind === "cases" && u.interval === null);
  }
}
function erf(x) {                       // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}


console.log("\n8. Wing box structure");
{
  const WS = await import("../src/classes/aircraft/wing-structure.js");
  const box = WS.wingBox(E.designAircraft({ type: "transport" }), { material: "2024-T3" });
  const st = box.stations;

  check("shear and bending moment are zero at the tip and greatest at the root",
        Math.abs(st[st.length - 1].shearN) < 1 && Math.abs(st[st.length - 1].momentNm) < 1
        && Math.abs(st[0].shearN) === Math.max(...st.map((x) => Math.abs(x.shearN)))
        && Math.abs(st[0].momentNm) === Math.max(...st.map((x) => Math.abs(x.momentNm))),
        `root ${(st[0].shearN / 1e3).toFixed(0)} kN, ${(st[0].momentNm / 1e6).toFixed(2)} MN.m`);

  check("both fall monotonically from root to tip, as a cantilever's must",
        st.every((x, i) => i === 0 || Math.abs(x.momentNm) <= Math.abs(st[i - 1].momentNm) + 1e-6)
        && st.every((x, i) => i === 0 || Math.abs(x.shearN) <= Math.abs(st[i - 1].shearN) + 1e-6));

  /* The load the box is sized for must be the load the aircraft is sized for. */
  const liftSum = st.reduce((t, x, i) => t + x.liftNm * (i === 0 || i === st.length - 1 ? 0.5 : 1), 0)
                * (st[1].yM - st[0].yM);
  const want = box.loadFactor.ultimate * E.designAircraft({ type: "transport" }).mtowKg * 9.80665 / 2;
  check("the Schrenk distribution integrates to the design lift on the semi-span",
        Math.abs(liftSum / want - 1) < 0.02, `${(liftSum / 1e3).toFixed(0)} kN against ${(want / 1e3).toFixed(0)} kN`);

  check("no station is stressed above the allowable it was sized against",
        st.every((x) => x.sigmaUltPa <= box.material.ftu * 1.001)
        && st.every((x) => x.sigmaLimitPa <= box.material.fcy * 1.001),
        `peak ${(Math.max(...st.map((x) => x.sigmaUltPa)) / 1e6).toFixed(0)} MPa against Ftu `
        + `${(box.material.ftu / 1e6).toFixed(0)} MPa`);

  /* 25.305 is two checks, and which governs depends on the alloy: 7075-T6
     has Fty/Ftu = 0.90, so the limit case bites first. */
  const b75 = WS.wingBox(E.designAircraft({ type: "transport" }), { material: "7075-T6" });
  check("a stronger alloy needs less cap material", b75.root.capThickM < box.root.capThickM,
        `2024-T3 ${(box.root.capThickM * 1e3).toFixed(1)} mm, 7075-T6 ${(b75.root.capThickM * 1e3).toFixed(1)} mm`);
  check("a heavier load factor needs more", WS.wingBox(E.designAircraft({ type: "transport" }),
        { material: "2024-T3", ultimateLoadFactor: 5.0 }).root.capThickM > box.root.capThickM);

  /* The cover is ONE piece of material. Counting a buckling skin on top of
     the bending cap double-counts it, which made a trainer's box come out
     five times its real mass before it was caught. */
  check("the cover is counted once: box mass is the two covers and two webs, nothing more",
        Math.abs(box.mass.boxKg - box.stations.reduce((t, x, i) => {
          if (i === 0) return 0;
          const a0 = box.stations[i - 1], dy = (x.yM - a0.yM) / Math.cos((box.geometry.sweepDeg ?? 0) * Math.PI / 180);
          return t + ((a0.capAreaM2 + x.capAreaM2) + (a0.webThickM * a0.boxDepthM + x.webThickM * x.boxDepthM)) * dy * box.material.rho;
        }, 0) * 2) < box.mass.boxKg * 0.02);

  /* Where there is nothing independent to compare against, say so rather
     than inventing a reference and measuring against it. */
  const tp = WS.wingBox(E.designAircraft({ type: "turboprop" }), { material: "2024-T3" });
  check("a mass comparison is only shown against a wing mass the model actually reports",
        (tp.mass.referenceWingKg === null) === (tp.mass.deltaPct === null));
  check("the classes that do report one get a signed comparison that has not been tuned to agree",
        typeof box.mass.deltaPct === "number" && Math.abs(box.mass.deltaPct) > 1,
        `${box.mass.deltaPct.toFixed(1)} % against the mass model's wing group; the non-box fraction is left at `
        + `${box.mass.nonBoxFraction} rather than fitted`);

  check("every type either produces a finite analysis or says why it cannot", E.TYPE_IDS.every((id) => {
    const w = WS.wingBox(E.designAircraft({ type: id }), { material: "2024-T3" });
    if (!w) return false;
    if (w.unavailable) return typeof w.reason === "string" && w.reason.length > 20;
    return [w.root.momentNm, w.root.capThickM, w.tipDeflectionLimitM, w.mass.boxKg].every(Number.isFinite);
  }));
  check("a class with no ultimate load factor is refused rather than given a transport's",
        WS.wingBox(E.designAircraft({ type: "trainer" }), { material: "2024-T3" }).unavailable === true,
        "the trainer carries no ultimate load factor and 3.75 is a Part 25 figure");
}

console.log("\n9. Airfoil selection and risk");
{
  const AF = await import("../src/classes/aircraft/airfoils.js");
  const RK = await import("../src/classes/aircraft/risk.js");

  /* Mason p.7-19 gives two flight-test calibrations; the equation must
     reproduce them, or the equation is wrong. */
  const m747 = AF.dragDivergenceMach({ techFactor: 0.89, tc: 0.105, sweepDeg: 37.5, cl: 0.5 });
  const m777 = AF.dragDivergenceMach({ techFactor: 0.955, tc: 0.12, sweepDeg: 31.6, cl: 0.5 });
  check("Mason Eq. (7-4) reproduces the 747-100 and 777 calibrations",
        Math.abs(m747 - 0.85) < 0.03 && Math.abs(m777 - 0.87) < 0.03,
        `747 ${m747.toFixed(3)} (cruises 0.84-0.85), 777 ${m777.toFixed(3)} (cruises 0.84)`);

  /* The thickness term is NOT divided by ten. If it were, thickness would
     barely move the answer - that is the slip this guards against. */
  const thin = AF.dragDivergenceMach({ techFactor: 0.9, tc: 0.08, sweepDeg: 25, cl: 0.5 });
  const thick = AF.dragDivergenceMach({ techFactor: 0.9, tc: 0.16, sweepDeg: 25, cl: 0.5 });
  check("thickness carries its full weight in the drag-divergence relation",
        (thin - thick) > 0.08,
        `8 % to 16 % thickness moves M_dd by ${(thin - thick).toFixed(3)}; a /10 slip would give ~0.009`);

  check("the forward and inverse forms agree", (() => {
    const a = AF.requiredTechFactor({ mDdRequired: 0.8, tc: 0.12, sweepDeg: 25, cl: 0.5 });
    return Math.abs(AF.dragDivergenceMach({ techFactor: a, tc: 0.12, sweepDeg: 25, cl: 0.5 }) - 0.8) < 1e-9;
  })());

  const adv = AF.airfoilAdvice(E.designAircraft({ type: "transport" }));
  check("a real 737-class wing is called supercritical, not impossible",
        adv.technology.verdict.level === "supercritical",
        `needs A ${adv.technology.required.toFixed(3)}; margin in hand ${adv.technology.marginInHand.toFixed(3)}`);
  check("every section offered actually clears the swept-wing requirement",
        adv.candidates.filter((c) => c.meets).every((c) => c.mDd >= adv.design.mNormal + adv.design.margin));
  check("a low-speed design is not told that zero sections suit it",
        (() => { const t = AF.airfoilAdvice(E.designAircraft({ type: "turboprop" }));
                 return t.divergenceRelevant === false && typeof t.note === "string"; })(),
        "below M 0.5 drag divergence does not size the wing and no section is ranked against it");
  check("no airfoil number is invented: a missing value stays null",
        AF.AIRFOILS.every((a) => [a.mDd, a.clMaxClean, a.cmQuarter].every((v) => v === null || Number.isFinite(v)))
        && AF.AIRFOILS.some((a) => a.mDd === null),
        `${AF.AIRFOILS.length} sections, ${AF.AIRFOILS.filter((a) => a.mDd !== null).length} with a measured M_dd`);

  /* Risk: no invented matrix, and the curve must come from the same
     population as the interval it sits beside. */
  const big = E.designAircraft({ type: "transport", params: { economyClass: 400, designRange: 7000, numEngines: 4 } });
  const ex = RK.exceedance("transport", big);
  const U = await import("../src/classes/aircraft/uncertainty.js");
  check("the exceedance curve is drawn from the same aircraft as the interval",
        ex.n === U.uncertaintyOf("transport", big).n && ex.stratum === U.uncertaintyOf("transport", big).stratum,
        `${ex.n} aircraft, "${ex.stratum}"`);
  check("exceedance falls as the threshold grows, and is a percentage",
        ex.curve.every((c) => c.exceed >= 0 && c.exceed <= 100)
        && ex.curve.find((c) => c.errPct === 20).exceed <= ex.curve.find((c) => c.errPct === 5).exceed);
  const reg = RK.riskRegister("transport", big, { inputSpecs: E.typeOf("transport").inputs });
  check("a four-engine design is told it is in the method's weakest group",
        reg.entries.some((r) => r.id === "four-engine" && r.severity === "high"));
  check("no risk entry carries a likelihood score or a five-by-five cell",
        reg.entries.every((r) => !("likelihood" in r) && !("score" in r) && !("cell" in r))
        && /no five-by-five matrix here/i.test(reg.note));
  check("a class validated on three aircraft is told so as a high risk, with no interval",
        RK.riskRegister("turboprop", E.designAircraft({ type: "turboprop" }), {})
          .entries.some((r) => r.id === "validation-stratum" && r.severity === "high")
        && RK.exceedance("turboprop", E.designAircraft({ type: "turboprop" })) === null);
}

console.log("\n10. Regulatory compliance");
{
  const C = await import("../src/classes/aircraft/compliance.js");
  const r = E.designAircraft({ type: "transport" });
  const m = C.complianceMatrix("transport", r);

  /* The reference field length and span put a 737-800 in code 4C, an
     A340-class quad in 4E and a Citation-class jet in 2B. These are the
     real aircraft's published codes. */
  const codeOf = (t, params) => C.aerodromeCode(E.designAircraft({ type: t, params })).code;
  check("the ICAO aerodrome reference code matches the real aircraft",
        codeOf("transport", {}) === "4C" && codeOf("bizjet", {}) === "2B"
        && codeOf("transport", { numEngines: 4, economyClass: 400, designRange: 7000 }) === "4E",
        `737-class ${codeOf("transport", {})}, bizjet ${codeOf("bizjet", {})}, `
        + `quad ${codeOf("transport", { numEngines: 4, economyClass: 400, designRange: 7000 })}`);

  check("three states, and an unevaluated requirement is never a pass",
        m.rows.every((x) => [C.PASS, C.FAIL, C.NE].includes(x.verdict))
        && m.counts.notEvaluated > 0
        && m.rows.filter((x) => x.verdict === C.NE).every((x) => !Number.isFinite(x.margin)),
        `${m.counts.pass} pass, ${m.counts.fail} fail, ${m.counts.notEvaluated} not evaluated`);

  check("every row names its verification method and product form",
        m.rows.every((x) => x.method === "Analysis" && x.productForm === "concept description"));
  check("every row cites a paragraph on both sides", m.rows.every((x) => x.faa && x.cs));
  check("the panel refuses to call any of this a finding of compliance",
        /None of this is a finding of compliance/i.test(m.disclaimer)
        && /NOT EVALUATED is not a pass/i.test(m.disclaimer)
        && /Verification method: Analysis/i.test(m.disclaimer));
  check("the amendment level is stated, because a regulation without one is a rumour",
        /CS-25 Amendment 28/.test(m.amendments.easa) && /14 CFR Part 25/.test(m.amendments.faa));

  /* 25.121 gradients: a unit of thrust-to-weight buys (nE-1)/nE of gradient,
     not a unit of it. Getting that wrong doubled a twin's second segment. */
  const g2 = m.rows.find((x) => x.id === "B-15");
  const tw = r.propulsion.toWeight, twReq = r.raw.constraints.twSecond;
  check("the second-segment gradient uses the nE/(nE-1) factor of the requirement line",
        Math.abs(g2.achieved - (0.024 + (tw - twReq) * 0.5)) < 1e-9,
        `${(g2.achieved * 100).toFixed(2)} % at T/W ${tw.toFixed(3)} against a ${twReq.toFixed(3)} line`);

  /* The bizjet's MZFW is below its own design payload - a real internal
     inconsistency the payload-range work already surfaced. The panel must
     report it as a FAIL rather than smoothing it over. */
  const bz = C.complianceMatrix("bizjet", E.designAircraft({ type: "bizjet" }));
  check("an internal weight inconsistency is reported as a failure, not smoothed over",
        bz.rows.some((x) => x.id === "W-1a" && x.verdict === C.FAIL),
        "the business jet sizes light, so its ratio-derived MZFW sits below its own design payload");

  check("rows the tool cannot feed are listed with a reason, not omitted",
        m.rows.filter((x) => x.verdict === C.NE).every((x) => typeof x.detail === "string" && x.detail.length > 20)
        && m.rows.some((x) => x.id === "V-1"),
        "V_MCG, the pressure-vessel factor and the exit/seat rule are named as not evaluated");
}

console.log("\n11. Fuselage internal arrangement");
{
  const F = await import("../src/classes/aircraft/fuselage-structure.js");
  const f = F.fuselageStructure(E.designAircraft({ type: "transport" }));

  /* 14 CFR 25.365(e)(2) verbatim: H_o = P*A_s, P = A_s/6240 + 0.024, and
     H_o need not exceed 20 ft^2. Checked against the arithmetic done by
     hand, not against the function's own output. */
  const v = F.decompressionVent(100 * 0.3048 * 0.3048);          // A_s = 100 ft^2 exactly
  check("25.365(e)(2) reproduces its own arithmetic",
        Math.abs(v.asFt2 - 100) < 1e-9
        && Math.abs(v.P - (100 / 6240 + 0.024)) < 1e-12
        && Math.abs(v.hoFt2 - 100 * (100 / 6240 + 0.024)) < 1e-9
        && !v.capped,
        `A_s 100 ft^2 -> P ${v.P.toFixed(6)}, H_o ${v.hoFt2.toFixed(3)} ft^2`);

  /* The 20 ft^2 cap is part of the rule, not a clamp someone added. It
     starts to bite in widebody territory. */
  const big = F.decompressionVent(400 * 0.3048 * 0.3048);
  check("the 20 ft^2 cap in the rule is applied and reported",
        big.capped && big.hoFt2 === 20 && big.uncappedFt2 > 20,
        `A_s 400 ft^2 would give ${big.uncappedFt2.toFixed(1)} ft^2, capped to 20`);

  /* The two classes with no published frame pitch must draw no frames. A
     number here would be read as sourced, which is exactly what the
     research note forbids. */
  check("no frame pitch is invented for the classes that have none",
        F.FRAME_PITCH_BY_CLASS.bizjet.pitchM === null
        && F.FRAME_PITCH_BY_CLASS.turboprop.pitchM === null
        && F.fuselageStructure(E.designAircraft({ type: "bizjet" })).frames.drawn === false
        && F.fuselageStructure(E.designAircraft({ type: "turboprop" })).frames.drawn === false,
        "bizjet and turboprop show the shell and leave the frames out");

  /* Where a pitch IS sourced, the drawn pitch must land inside the band it
     came from, or the count has been rounded past the evidence. */
  const tr = F.fuselageStructure(E.designAircraft({ type: "trainer" }));
  check("a sourced frame pitch stays inside its sourced band",
        f.frames.inBand && tr.frames.inBand,
        `transport ${(f.frames.pitchM / 0.0254).toFixed(1)} in in 20-21, `
        + `trainer ${(tr.frames.pitchM / 0.0254).toFixed(1)} in in 10-23`);

  /* The stringer count follows the ellipse perimeter. Ramanujan's second
     approximation is checked against a numerically integrated arc length,
     because an approximation nobody has checked is an assumption. */
  const arc = (a, b) => { let s = 0, px = a, py = 0;
    for (let i = 1; i <= 200000; i++) { const t = (2 * Math.PI * i) / 200000;
      const qx = a * Math.cos(t), qy = b * Math.sin(t); s += Math.hypot(qx - px, qy - py); px = qx; py = qy; }
    return s; };
  const relErr = (a, b) => Math.abs(F.ellipsePerimeter(a, b) / arc(a, b) - 1);
  check("the elliptical perimeter is right, checked against numerical integration",
        relErr(1.88, 1.985) < 1e-9 && relErr(3.0, 1.5) < 1e-6 && relErr(2, 2) < 1e-9,
        `worst relative error ${Math.max(relErr(1.88, 1.985), relErr(3.0, 1.5)).toExponential(1)} over 2:1 to circular`);

  /* And it is the perimeter, not pi times an equivalent diameter, that the
     count comes from. The two agree on a near-circular single-aisle section
     and separate as the section flattens, which is where it would matter. */
  const piD = Math.PI * f.shell.equivDiaM;
  const flat = Math.abs(F.ellipsePerimeter(3.0, 1.5) / (Math.PI * 2 * Math.sqrt(3.0 * 1.5)) - 1);
  check("the stringer count comes from the perimeter, not pi times a diameter",
        f.stringers.count === Math.round(f.shell.perimeterM / f.stringers.pitchNominalM) && flat > 0.02,
        `here they agree to ${(100 * Math.abs(f.shell.perimeterM / piD - 1)).toFixed(2)} %, `
        + `but on a 2:1 section they differ by ${(100 * flat).toFixed(1)} %`);

  /* The skin panel is the frame pitch by the stringer pitch, both of them
     the ACTUAL pitches the drawing uses, not the nominal ones. */
  check("the skin panel is the two drawn pitches, and the panel count follows",
        Math.abs(f.panel.aspect - f.frames.pitchM / f.stringers.pitchM) < 1e-12
        && f.panel.count === (f.frames.count - 1) * f.stringers.count,
        `${(f.panel.lengthM * 1e3).toFixed(0)} x ${(f.panel.widthM * 1e3).toFixed(0)} mm, ${f.panel.count} panels`);

  /* Nothing on this view may claim a sized longitudinal station: every one
     of them is anchored to the drawing's nose and tail-cone lengths. */
  check("no attachment station claims to be sized",
        f.heavy.length > 0 && f.heavy.every((h) => h.sized === false && typeof h.why === "string" && h.why.length > 10)
        && f.pressure.boundariesSized === false,
        `${f.heavy.length} heavy frames, all declared conventions`);

  /* A port and a starboard engine hang off one frame. */
  const three = F.fuselageStructure(E.designAircraft({ type: "bizjet" }));
  check("coincident attachment stations are one frame, not two",
        new Set(three.heavy.map((h) => `${h.label}@${h.x.toFixed(6)}`)).size === three.heavy.length,
        `${three.heavy.length} distinct stations on the business jet`);

  /* The features the research could not source must be listed, not drawn. */
  const named = f.notDrawn.map((n) => n.feature.toLowerCase()).join(" | ");
  check("the unsourced members are listed with a reason instead of being drawn",
        ["longeron", "stanchion", "keel beam", "window", "bulkhead shape", "seat track"]
          .every((k) => named.includes(k))
        && f.notDrawn.every((n) => typeof n.why === "string" && n.why.length > 20),
        `${f.notDrawn.length} features named and explained`);

  /* Part 25 is not applied to a class that is not certificated under it. */
  check("25.365 is not evaluated on a class with no pressurized compartment",
        tr.pressure.applies === false && /not a pass/i.test(tr.pressure.why),
        "the trainer gets no pressure-vessel section rather than a silent pass");
}

console.log("\n12. Balance, wing placement and the neutral point");
{
  const B = await import("../src/classes/aircraft/balance.js");
  const G = await import("../src/classes/aircraft/geometry.js");
  const r = E.designAircraft({ type: "transport" });
  const bal = B.balanceOf(r);

  /* The trapezoid MAC against the published 737-800 figure. If this is
     wrong every per-cent-MAC number on the tab is wrong with it. */
  check("the mean aerodynamic chord matches the real aircraft",
        Math.abs(bal.mac / 4.17 - 1) < 0.05,
        `${bal.mac.toFixed(3)} m against the 737-800's published 4.17 m — ${(100 * (bal.mac / 4.17 - 1)).toFixed(1)} %`);

  /* THE SWEEP CONVENTION. Inputs carry quarter-chord sweep; a drawing needs
     the leading edge. The structural planform used to apply
     Math.atan(Math.tan(x)), a no-op, and drew a different wing from the
     general arrangement. One helper now, and it must actually convert. */
  const leDeg = (G.leSweepRad(25.03, 9.45, 0.159) * 180) / Math.PI;
  check("quarter-chord sweep is converted to leading-edge sweep, not passed through",
        leDeg > 28.0 && leDeg < 29.0 && Math.abs(leDeg - 25.03) > 3,
        `25.03° at c/4 becomes ${leDeg.toFixed(2)}° at the leading edge`);

  /* Scholz (10.24) is a closed form: ask for a balance point and the wing
     must land exactly there, not near it. */
  const exact = [0.15, 0.25, 0.35].map((t) => {
    const b = B.balanceOf(r, { targetCgPctMac: t });
    return { t, got: b.oew.pctMac, le: b.xWingRootLE };
  });
  check("the wing placement hits the requested balance point exactly",
        exact.every((e) => Math.abs(e.got - e.t) < 1e-9),
        exact.map((e) => `${(100 * e.t).toFixed(0)}%→${(100 * e.got).toFixed(2)}%`).join(", "));
  check("moving the balance point moves the wing, and aft CG means a wing further forward",
        exact[0].le > exact[1].le && exact[1].le > exact[2].le,
        `root LE ${exact.map((e) => e.le.toFixed(2)).join(" → ")} m as the target goes 15 → 35 % MAC`);

  /* The moment sum must close: Σ m_i x_i / Σ m_i is the reported CG. */
  const sumM = bal.items.reduce((t, i) => t + i.kg, 0);
  const sumMx = bal.items.reduce((t, i) => t + i.kg * i.x, 0);
  check("the moment sum closes on the reported centre of gravity",
        Math.abs(sumMx / sumM - bal.oew.xM) < 1e-9 && Math.abs(sumM - bal.oew.massKg) < 1e-9,
        `${bal.items.length} masses, ${Math.round(sumM).toLocaleString("en-US")} kg`);

  /* The critical loading case is a PART-FULL cabin. An empty-vs-full sweep
     misses it, and TASOPT says so explicitly. */
  const fwdCase = bal.envelope.fwd, aftCase = bal.envelope.aft;
  /* Drela's own converged 737 run reports rpayfwd = 0.47 and rpayaft = 0.44
     (Tasopt2.16/runs/737/737.out, quoted in BALANCE-AND-TAIL.md section 1.2).
     Reproducing those to within a few points from an independent mass
     breakdown and an independent cabin length is a real agreement, not a
     range check — so it is asserted as one. */
  check("the critical load fractions reproduce TASOPT's converged 737 case",
        Math.abs(fwdCase.rPay - 0.47) < 0.10 && Math.abs(aftCase.rPay - 0.44) < 0.10,
        `forward ${fwdCase.rPay.toFixed(2)} against Drela's 0.47, aft ${aftCase.rPay.toFixed(2)} against 0.44 `
        + "— a part-full cabin, which an empty-vs-full sweep misses entirely");

  /* The fuselage term is BRACKETED, not known, and the pessimistic bound is
     measurably over-counted. A single static margin must not be reported. */
  const np = bal.neutralPoint;
  check("the static margin is reported as a bracket, and the slender-body bound is flagged as over-counted",
        Number.isFinite(np.bracket.optimisticSm) && Number.isFinite(np.bracket.pessimisticSm)
        && np.bracket.pessimisticSm < np.bracket.optimisticSm
        && np.cmvf1Ratio > 2,
        `${(100 * np.bracket.optimisticSm).toFixed(1)} % to ${(100 * np.bracket.pessimisticSm).toFixed(1)} %; `
        + `slender body returns ${np.cmvf1Ratio.toFixed(2)}× the 737 deck's calibrated C_MVf1`);

  /* Downwash must reduce tail effectiveness, and the 737 case should land
     near the 0.342 that Drela's own converged run reports. */
  check("the tail effectiveness carries the downwash and lands near TASOPT's own 737 value",
        np.dClhDcl > 0.25 && np.dClhDcl < 0.42,
        `dCLh/dCL = ${np.dClhDcl.toFixed(3)} against 0.342 in runs/737/737.out`);

  /* Engine-out yaw: available on the twins, correctly refused on a single. */
  const tp = B.balanceOf(E.designAircraft({ type: "turboprop" }));
  const tr = B.balanceOf(E.designAircraft({ type: "trainer" }));
  check("engine-out yaw is evaluated on the multi-engine classes and refused on the single",
        bal.yaw.available && tp.yaw.available && !tr.yaw.available
        && /single-engine/i.test(tr.yaw.why),
        `transport fin ×${bal.yaw.ratio.toFixed(2)} of requirement, turboprop ×${tp.yaw.ratio.toFixed(2)}`);

  /* A propeller class has no thrust to read, so the thrust must come from
     momentum theory rather than silently defaulting. */
  check("a propeller class gets its engine-out thrust from actuator-disc theory, not a missing field",
        tp.yaw.thrustN > 0 && /momentum theory/i.test(tp.yaw.thrustFrom),
        `${(tp.yaw.thrustN / 1e3).toFixed(1)} kN from ${(E.designAircraft({ type: "turboprop" }).propulsion.perEngine).toFixed(0)} kW at V_MC`);

  /* The speed basis is the regulatory ceiling, so the answer is a MINIMUM
     fin. If that ever stops being said, the number becomes misleading. */
  check("the fin result declares that its speed basis makes it a minimum, not a size",
        /MINIMUM that could comply/i.test(bal.yaw.vMcBasis),
        "V_MC is taken at its regulatory ceiling, which is the least conservative end");

  /* THE SPEED BASIS IS THE REGULATION'S, NOT GASP'S. 14 CFR 25.149(c) says
     "V MC may not exceed 1.13 V SR"; GASP Vol. V uses 1.2 against the stall
     speed. The difference is 13 % of fin area in the unsafe direction, so
     the constant is pinned here. */
  check("the engine-out control speed follows 25.149(c), not GASP's 1.2",
        B.BALANCE_DEFAULTS.vmcOverVsr === 1.13 && /25\.149\(c\)/.test(bal.yaw.vMcBasis),
        "1.13 V_SR — taking GASP's 1.2 would under-size the fin by 13 %");

  /* And the payoff: at the regulation's speed the 737-class fin that the
     area ratio produces is within a couple of per cent of the area that
     engine-out yaw demands. That exercises the whole chain at once — wing
     placement, tail arm, engine station, thrust and yaw balance — so it is
     asserted rather than admired. */
  check("the engine-out fin area reproduces the 737-class fin the area ratio gives",
        Math.abs(bal.yaw.ratio - 1) < 0.06,
        `required ${bal.yaw.svRequiredM2.toFixed(1)} m² against ${bal.yaw.svActualM2.toFixed(1)} m² fitted `
        + `— ${(100 * (bal.yaw.ratio - 1)).toFixed(1)} %`);
}

console.log("\n13. Flight envelope: V-n, gust, and which case governs");
{
  const FE = await import("../src/classes/aircraft/flight-envelope.js");
  const r = E.designAircraft({ type: "transport" });
  const env = FE.flightEnvelope(r);

  /* THE PREMISE CORRECTION, ASSERTED. I expected the gust case to beat the
     manoeuvre case on a large transport. It is the other way round and the
     margin widens with size, because dn_gust falls as 1/(W/S) while
     25.337(b) is pinned at 2.5. If this ever flips on a transport, either
     the gust model or the wing loading is wrong. */
  check("the manoeuvre case governs on a transport, and by a wide margin",
        env.governing === "manoeuvre" && env.nGustMax < env.manoeuvreN * 0.8,
        `n_gust ${env.nGustMax.toFixed(2)} against n_man ${env.manoeuvreN.toFixed(2)} `
        + `at ${env.wingLoadingLbFt2.toFixed(0)} lb/ft²`);

  /* Reproduce the research note's own worked 737-400 case at its inputs.
     The note computes n_gust = 1.71; anything more than a couple of points
     away means a constant has drifted. */
  const nb = FE.flightEnvelope(r, { vcKt: 340 }).nGustMax;
  check("the gust increment reproduces the research note's worked 737-400 case",
        Math.abs(nb - 1.71) < 0.06,
        `${nb.toFixed(2)} against the note's 1.71 at V_C 340 kt`);

  /* dn falls as 1/(W/S): the low wing-loading classes must show a HIGHER
     gust factor than the transport. That ordering is the whole finding. */
  const bz = FE.flightEnvelope(E.designAircraft({ type: "bizjet" }));
  const tp = FE.flightEnvelope(E.designAircraft({ type: "turboprop" }));
  check("the gust load factor rises as wing loading falls",
        bz.nGustMax > env.nGustMax && tp.nGustMax > env.nGustMax
        && bz.wingLoadingLbFt2 < env.wingLoadingLbFt2,
        `transport ${env.nGustMax.toFixed(2)} at ${env.wingLoadingLbFt2.toFixed(0)}, `
        + `bizjet ${bz.nGustMax.toFixed(2)} at ${bz.wingLoadingLbFt2.toFixed(0)} lb/ft²`);

  /* V_B/V_A is sqrt(n_gust)/sqrt(n_man) by construction — 25.335(c)(1) and
     25.335(d)(1) are the same shape — so it must agree with the load
     factors it is derived from. That is a free internal consistency check. */
  /* NOTE THE VELOCITY. 25.335(d)(1) builds V_B from the RAW U_ref, with no
     F_g and no gradient factor; 25.341(a)(4) loads the wing with
     U_ds = U_ref*F_g*(H/350)^(1/6), which is smaller. So V_B/V_A equals
     sqrt(n_gust)/sqrt(n_man) only for the U_ref version, and comparing it
     against the U_ds version looks like a bug when it is the regulation. */
  const ratioFromN = Math.sqrt(env.nGustVcUref) / Math.sqrt(env.manoeuvreN);
  check("V_B/V_A agrees with the load factors it is built from, on the regulation's own velocity",
        Math.abs(env.speeds.vbOverVa - ratioFromN) < 0.02
        && env.nGustVcUref > env.nGustVc,
        `${env.speeds.vbOverVa.toFixed(3)} against √(n_gust@U_ref)/√(n_man) = ${ratioFromN.toFixed(3)}; `
        + `the load uses U_ds and gives ${env.nGustVc.toFixed(2)} instead of ${env.nGustVcUref.toFixed(2)}`);

  /* The current rule, not the pre-1996 one: U_ref is the SAME at V_B and
     V_C and halved at V_D, so the V_C gust line is the critical one. The
     old 66/50/25 values would make V_B critical. */
  const gB = env.gust.find((g) => g.label === "V_B"), gC = env.gust.find((g) => g.label === "V_C");
  const gD = env.gust.find((g) => g.label === "V_D");
  check("the gust envelope uses the current rule, so V_C is the critical gust speed",
        gC.nPos >= gB.nPos && Math.abs(gD.dn / gC.dn - 0.5 * (gD.v / gC.v)) < 1e-9,
        `V_B ${gB.nPos.toFixed(2)}, V_C ${gC.nPos.toFixed(2)}, V_D ${gD.nPos.toFixed(2)} — `
        + "same U_ref B to C, halved at D");
  check("the sea-level reference gust velocity is the mandatory 56.0 ft/s",
        FE.uRefFtS(0) === 56.0 && Math.abs(FE.uRefFtS(15000) - 44.0) < 1e-9
        && Math.abs(FE.uRefFtS(60000) - 20.86) < 1e-9,
        "56.0 at sea level, 44.0 at 15,000 ft, 20.86 at 60,000 ft");

  /* Part 23 must not be given Part 25's numbers. */
  const tr = FE.flightEnvelope(E.designAircraft({ type: "trainer" }));
  check("the Part 23 class is refused a Part 25 envelope rather than given a plausible wrong one",
        tr.unavailable === true && tr.part === 23 && /designLoads/.test(tr.why),
        "the trainer keeps its own Part 23 envelope in trainer/weights.js");

  /* The envelope must close: five boundaries, and the diagram must not be
     open on the right. */
  check("the manoeuvre diagram has all five boundaries and closes at V_D",
        env.diagram.manoeuvre.some((d) => d.branch === "stall")
        && env.diagram.manoeuvre.some((d) => d.branch === "limit")
        && env.diagram.negative.some((d) => Math.abs(d.nNeg + 1) < 1e-6)
        && Math.abs(env.diagram.negative[env.diagram.negative.length - 1].nNeg) < 1e-6,
        "stall parabola, limit line, inverted parabola, −1 g plateau, and the V_C→V_D ramp to zero");

  /* The bridge and the unsourced negative-branch number must stay declared. */
  check("the gust method declares its bridge and its one unsourced number",
        env.caveats.some((c) => /engineering construction, not a regulation/i.test(c))
        && env.caveats.some((c) => /C_N,min/.test(c) && /ASSUMED/.test(c))
        && env.caveats.some((c) => /25\.341\(b\).*NOT evaluated/i.test(c)),
        "H = 12.5 c̄ is a construction, |C_N,min| is assumed, continuous turbulence is not evaluated");
}

console.log("\n14. The landing line: CLmax is physical, and the Loftin pair is still a trap");
{
  const DEF = await import("../src/classes/transport/defaults.js");
  const D = DEF.TRANSPORT_INPUTS;
  const L = await import("../src/classes/transport/landing.js");

  /* THE LINE IS NOW COMPUTED, NOT FITTED. 25.125 replaces Loftin, and that
     is what lets CLmax be a lift coefficient instead of half of a fitted
     pair: while k_L sat in the constraint, CLmax had to carry the 3.0 the
     pair demanded, a round integer the Aviary deck disclaims in its own
     comments. */
  check("the landing constraint is computed from 25.125 by default, and CLmax is physical",
        D.landingMethod.value === "far25"
        && Math.abs(D.clMaxLanding.value - 2.35) < 1e-9
        && D.clMaxLanding.status === "derived"
        && /144 kt approach speed/.test(D.clMaxLanding.source),
        `CLmax ${D.clMaxLanding.value}, the 737-800's own 1-g value from its published approach speed`);

  check("25.125 and 121.195 supply the speed factor, the screen height and the despatch factor",
        L.VREF_OVER_VSR0 === 1.23
        && Math.abs(L.SCREEN_HEIGHT_M - 50 * 0.3048) < 1e-12
        && L.DESPATCH_FACTOR === 0.60,
        "V_REF >= 1.23 V_SR0, a 50 ft screen, and 60 % of the runway for despatch");

  /* V_REF must land on the real aeroplane's published approach speed. That
     checks the speed side of the method independently of everything
     downstream of it. */
  const r = L.landingFieldLength({ ...DEF.TRANSPORT_DEFAULTS }, 66360 / 124.58);
  check("V_REF reproduces the 737-800's published approach speed",
        Math.abs(r.vRef / 0.514444 - 144) < 2,
        `${(r.vRef / 0.514444).toFixed(0)} kt against the published 144 kt at maximum landing weight`);

  /* THE PAIR IS STILL A TRAP ON THE OTHER PATH. far25 does not use k_L at
     all, but switching back to "loftin" while CLmax is the physical 2.35
     sizes the wing on 0.107 x 2.35, a product Loftin never fitted. The pair
     that reproduces his line with a physical CLmax is k_L 0.137, and it
     measures the same on the 168-aircraft record. */
  const base = E.designAircraft({ type: "transport" });
  const naive = E.designAircraft({ type: "transport", params: { landingMethod: "loftin" } });
  const paired = E.designAircraft({ type: "transport", params: { landingMethod: "loftin", kLanding: 0.137 } });
  check("switching back to Loftin without moving k_L grows the wing, and the paired k_L restores it",
        naive.wingAreaM2 > base.wingAreaM2 * 1.10
        && Math.abs(paired.wingAreaM2 / base.wingAreaM2 - 1) < 0.08,
        `far25 ${base.wingAreaM2.toFixed(1)} m2; loftin at k_L 0.107 ${naive.wingAreaM2.toFixed(1)}; `
        + `loftin at the paired 0.137 ${paired.wingAreaM2.toFixed(1)}`);
  check("both landing inputs still carry the pairing warning for anyone who switches back",
        /k_L must move with this value/.test(D.clMaxLanding.source)
        && /MATCHED PAIR/.test(D.kLanding.source),
        "the trap is documented on both halves");

  /* The one fitted number left, and it is fitted on the FLEET. Fitting one
     aeroplane and fitting the fleet disagree here, and the fleet wins. */
  check("the landing braking coefficient is calibrated on the fleet and says so",
        Math.abs(D.landingMuBraking.value - 0.50) < 1e-9
        && D.landingMuBraking.status === "derived"
        && /168-aircraft/.test(D.landingMuBraking.source)
        && /NOT the 0.544/.test(D.landingMuBraking.source),
        "0.50 on the fleet against 0.544 for the 737-800 alone");
}

console.log("\n15. 25.343 fuel load cases on the wing box");
{
  const WS = await import("../src/classes/aircraft/wing-structure.js");
  const box = WS.wingBox(E.designAircraft({ type: "transport" }));

  /* THE DESIGN MISSION IS NOT THE CRITICAL WING-BENDING CASE, and the box
     used to be sized to it alone. Fuel in the wing relieves bending, so the
     worst case at a given gross mass carries the LEAST wing fuel — reached
     by trading fuel for payload until the payload hits MZFW. That trade is
     what MZFW exists to bound. */
  const design = box.loadCases.find((c) => c.id === "design");
  const mzfw = box.loadCases.find((c) => c.id === "mzfw-mtow");
  check("the MZFW-payload case is formed and governs over the design mission",
        !!mzfw && mzfw.governs && !design.governs && mzfw.vsDesignPct > 1,
        `${(mzfw.rootMomentNm / 1e6).toFixed(3)} against ${(design.rootMomentNm / 1e6).toFixed(3)} MN·m, `
        + `+${mzfw.vsDesignPct.toFixed(1)} % — and it carries ${Math.round(mzfw.fuelInWingKg).toLocaleString("en-US")} kg `
        + `of wing fuel against the design mission's ${Math.round(design.fuelInWingKg).toLocaleString("en-US")}`);

  /* Same gross mass, less relief: the governing case must not be winning by
     being heavier, or the comparison is meaningless. */
  check("the governing case wins on less bending relief, not on more mass",
        Math.abs(mzfw.grossKg - design.grossKg) < 1e-6 && mzfw.fuelInWingKg < design.fuelInWingKg,
        "both at maximum take-off mass; only the wing fuel differs");

  /* The box must actually be sized to the governing case. */
  check("the box is sized to the governing case, not to the design mission",
        Math.abs(box.root.momentNm - mzfw.rootMomentNm) < 1e-6,
        `root moment ${(box.root.momentNm / 1e6).toFixed(3)} MN·m`);

  /* Zero wing fuel is LESS severe, not more — removing the fuel removes the
     lift it was holding up, and the relief it removes sits inboard where the
     moment arm is short. Worth pinning, because the intuition runs the other
     way and a future change may "fix" it. */
  const zf = box.loadCases.find((c) => c.id === "zero-fuel");
  check("the zero-wing-fuel case comes out lighter than the design mission, not heavier",
        !!zf && zf.vsDesignPct < 0,
        `${zf.vsDesignPct.toFixed(1)} % — the lost lift outweighs the lost inboard relief`);

  /* 25.343(b)(1)'s +2.25 g is a RELAXATION that an applicant elects, so it
     must be off by default and must say why. */
  const withReserve = WS.wingBox(E.designAircraft({ type: "transport" }), { structuralReserveFuel: true });
  check("the +2.25 g case of 25.343(b)(1) is off by default and appears only when elected",
        !box.loadCases.some((c) => c.id === "reserve-2g25")
        && withReserve.loadCases.some((c) => c.id === "reserve-2g25")
        && box.casesOmitted.some((o) => /structural reserve fuel condition is selected/i.test(o)),
        "an election under 25.343(a), and a relaxation — leaving it out is the conservative choice");

  /* A class that cannot form the cases must say so rather than quietly
     evaluating one point and looking complete. */
  const tp = WS.wingBox(E.designAircraft({ type: "turboprop" }));
  const bz = WS.wingBox(E.designAircraft({ type: "bizjet" }));
  check("a class that cannot form the 25.343 cases explains why instead of showing a short list",
        tp.loadCases.length === 1 && tp.casesOmitted.some((o) => /no maximum zero-fuel mass/i.test(o))
        && bz.casesOmitted.some((o) => /MZFW sits below its own/i.test(o)),
        "turboprop reports no MZFW; the business jet's MZFW is below its own design zero-fuel mass");
}

console.log("\n16. Control surfaces: the 25.415 ground gust, and what is refused");
{
  const CS = await import("../src/classes/aircraft/control-surfaces.js");
  const cs = CS.controlSurfaces(E.designAircraft({ type: "transport" }));

  /* The equation, against hand arithmetic. H = K*0.5*rho0*V^2*c*S at 65 kt. */
  const h = CS.groundGustHingeMoment({ k: 0.75, areaM2: 10, meanChordM: 1 });
  const v = 65 * 0.514444;
  const want = 0.75 * 0.5 * 1.225 * v * v * 1 * 10;
  check("25.415(b) reproduces its own arithmetic at 65 knots",
        Math.abs(h.staticNm - want) < 1e-6,
        `K 0.75, S 10 m², c 1 m → ${h.staticNm.toFixed(1)} N·m`);

  /* 25.415(d) and (e) COMPOUND. Dropping the 1.6 needs a rational analysis
     and even then the rule floors it at 1.2. */
  check("the 1.25 and 1.6 factors compound to 2.0 and neither is silently dropped",
        Math.abs(h.designNm / h.staticNm - 2.0) < 1e-9
        && Math.abs(h.limitNm / h.staticNm - 1.25) < 1e-9
        && CS.GROUND_GUST.minRationalDynamicFactor === 1.2,
        "×1.25 for limit control-system loads, ×1.6 for dynamic effects");

  /* The K table is the regulation's, all six rows. */
  const ks = CS.GROUND_GUST.cases;
  check("all six 25.415(c) hinge-moment factors are carried",
        ks.length === 6
        && ks.filter((c) => c.surface === "aileron").map((c) => c.k).sort().join() === "0.5,0.75"
        && ks.filter((c) => c.surface === "elevator").every((c) => c.k === 0.75)
        && ks.filter((c) => c.surface === "rudder").every((c) => c.k === 0.75),
        "aileron 0.75 locked and 0.50 full throw; elevator ±0.75; rudder 0.75 both");

  /* An actuator holds ONE surface. The aileron convention is published for
     the pair, so it must be halved before it becomes a hinge moment. */
  const ail = cs.surfaces.find((s) => s.id === "aileron");
  check("the aileron hinge moment is taken on one surface, not the published pair",
        ail.count === 2 && Math.abs(ail.areaPerSurfaceM2 * 2 - ail.areaM2) < 1e-9,
        `${ail.areaM2.toFixed(2)} m² for both → ${ail.areaPerSurfaceM2.toFixed(2)} m² per actuator`);

  /* The measured scatter must be carried, not dropped: H is linear in area,
     so a +-26 % area spread is a +-26 % actuator load. */
  check("the measured area spread is carried through to the actuator load",
        cs.surfaces.every((s) => s.designNmLo < s.worst.designNm && s.designNmHi > s.worst.designNm),
        `aileron ${(ail.designNmLo / 1e3).toFixed(1)} to ${(ail.designNmHi / 1e3).toFixed(1)} kN·m `
        + `about ${(ail.worst.designNm / 1e3).toFixed(1)}`);

  /* THE ROLL NUMBERS ARE THE FAA'S OWN. A previous brief of mine assumed
     they had to come from MIL-F-8785C; AC 25-7D was on disk all along and
     publishes them. No military specification may be cited here. */
  const roll = cs.rollRequirements;
  check("the roll criteria are the FAA's own numbers, with no military specification cited",
        roll.length === 3
        && roll.find((r) => r.id === "vmcl").seconds === 5
        && roll.find((r) => r.id === "v2-oei").seconds === 11
        && roll.find((r) => r.id === "vdf-upset").seconds === 8
        && roll.every((r) => !/MIL-/i.test(r.cite)),
        "25.149(h)(3) 20° in 5 s; AC 25-7D 30°→30° in 11 s at V2; 20°→20° in 8 s near V_DF");

  /* And they are STATED, not evaluated — the roll rate needs blocked charts. */
  check("roll capability is reported as unevaluated rather than estimated",
        cs.rollEvaluated === false && /undigitised/i.test(cs.rollWhy),
        "a time to bank from a fabricated effectiveness would be worse than none");

  /* Spoilers are foreclosed by regulation, not by laziness. */
  check("spoilers are refused with the regulation that forecloses them",
        cs.notClaimed.some((n) => /spoiler/i.test(n.feature) && /25\.459/.test(n.why) && /test data/i.test(n.why)),
        "25.459: their loads \"must be determined from test data\"");

  /* Nothing here may claim to SIZE a surface. */
  check("no control surface is claimed to be sized",
        cs.caveats.some((c) => /No surface is SIZED here/.test(c))
        && cs.notClaimed.some((n) => /Elevator area as a sized quantity/.test(n.feature)),
        "size the tail, check the aileron and rudder, size nothing else");
}

console.log("\n17. High lift: the section validates; the wing conversion is an extrapolation, and says so");
{
  const H = await import("../src/classes/transport/high-lift.js");

  /* The closed forms, against the values tabulated from the sources. */
  const d = 180 / Math.PI;
  check("Olson Eqs. (3) and (4) reproduce their tabulated values",
        Math.abs(H.thetaF(0.30) * d - 113.6) < 0.1 && Math.abs(H.alphaDelta(0.30) - 0.661) < 0.002
        && Math.abs(H.alphaDelta(0.10) - 0.396) < 0.002,
        `c_f/c 0.30 gives theta_f ${(H.thetaF(0.30) * d).toFixed(1)} deg, alpha_delta ${H.alphaDelta(0.30).toFixed(3)}`);

  /* DATCOM Fig. 6.1.4.3-10's own closed form. K_Lambda(0) is 0.920, NOT 1 —
     a bare cos(Lambda) silently gains 8 % back at zero sweep. */
  check("DATCOM's sweep factor is its own closed form, and is 0.920 at zero sweep",
        Math.abs(H.kLambda(0) - 0.920) < 0.001 && Math.abs(H.kLambda(25) - 0.868) < 0.002
        && Math.abs(H.kLambda(40) - 0.780) < 0.002,
        "0.920 / 0.868 / 0.780 at 0, 25 and 40 degrees");

  /* DATCOM's slat equation against its own worked example. */
  const slat = H.datcomSlatIncrement({ slatChordRatio: 0.177, slatSpanRatio: 0.535, sweepC4Deg: 33.2 });
  check("DATCOM Eq. 6.1.4.3-b reproduces its own worked example",
        Math.abs(slat - 0.252) < 0.001,
        `${slat.toFixed(4)} against the printed 0.252 (whose own test value is 0.295, so DATCOM is 15 % low)`);

  /* THE FLAPPED FRACTION IS AN AREA. DATCOM extends it inboard to the
     centreline where the flap runs to the side of body, and excludes the
     chord the flap adds. Using a span fraction under-predicts. */
  const area = H.flappedAreaRatio({ etaInner: 0.11, etaOuter: 0.75, taper: 0.24 });
  check("the flapped fraction is an area extended to the centreline, not a span fraction",
        area > 0.75 && area > (0.75 - 0.11) * 1.2,
        `${area.toFixed(3)} of the area against ${(0.75 - 0.11).toFixed(2)} of the span`);

  /* THE SECTION METHOD VALIDATES against measured two-dimensional data.
     This is the check that Olson Eqs. (6) and (7) are implemented: without
     the chord-extension treatment a triple-slotted section comes out a
     quarter low, because a triple-slotted flap at 40 degrees extends the
     chord by 78 % and none of it is counted. */
  const sec = (flapType, leDevice) => H.highLift({ flapType, leDevice, flapChordRatio: 0.30,
    flapDeflectionDeg: 40, clMaxCleanSection: 1.60, cl0Section: 0.30, clMaxCleanWing: null }).clMaxSection;
  const cr2214 = [["single-slotted", "none", 2.79], ["double-slotted", "slat", 4.85], ["triple-slotted", "slat", 5.50]];
  const errs = cr2214.map(([f, le, m]) => 100 * (sec(f, le) / m - 1));
  check("the section method reproduces NASA CR-2214's measured 2-D data within the research's band",
        errs.every((e) => e > -12 && e < 7),
        cr2214.map(([f], i) => `${f} ${errs[i] >= 0 ? "+" : ""}${errs[i].toFixed(1)} %`).join(", "));

  /* AND THE WING CONVERSION STILL DOES NOT CLOSE — but it is now wrong for
     a reason that is written down rather than unexplained. Each device goes
     through its own DATCOM equation: 6.1.4.3-a for the flap (whose Figure
     6.1.4.3-10 is titled "PLANFORM CORRECTION FACTOR — TRAILING-EDGE
     FLAPS") and 6.1.4.3-b for the slat. Pushing Torenbeek Eq. (16)'s
     COMBINED section value through the trailing-edge factor, as this
     module used to, returned +42 %. */
  const wing = H.highLift({ flapType: "double-slotted", flapChordRatio: 0.30, flapDeflectionDeg: 40,
    etaInner: 0.11, etaOuter: 0.75, taper: 0.24, sweepC4Deg: 25.03, leDevice: "slat",
    clMaxCleanSection: 1.60, cl0Section: 0.30, clMaxCleanWing: 1.30,
    aspectRatio: 9.45, supercritical: true });
  check("the wing level is decomposed by device, each through its own DATCOM equation",
        Math.abs(wing.dCLmaxWingTE + wing.dCLmaxWingLE - wing.dCLmaxWingUpperBound) < 1e-12
        && wing.dCLmaxWingTE > 0 && wing.dCLmaxWingLE > 0,
        `trailing edge ${wing.dCLmaxWingTE.toFixed(3)} (6.1.4.3-a) + leading edge `
        + `${wing.dCLmaxWingLE.toFixed(3)} (6.1.4.3-b) = ${wing.dCLmaxWingUpperBound.toFixed(3)}, an UPPER `
        + "BOUND because DATCOM says the two cannot be added and gives no combination rule");

  check("routing each device through its own equation beats the old combined route",
        wing.dCLmaxWingCombinedRoute > wing.dCLmaxWingUpperBound * 1.3,
        `old route ${(1.30 + wing.dCLmaxWingCombinedRoute).toFixed(2)} `
        + `(+${(100 * ((1.30 + wing.dCLmaxWingCombinedRoute) / 2.35 - 1)).toFixed(0)} %) against `
        + `${wing.clMaxWing.toFixed(2)} (+${(100 * (wing.clMaxWing / 2.35 - 1)).toFixed(0)} %) now`);

  /* The residual over-prediction is NOT unexplained and NOT a coding
     defect: the correlation is being read outside the database printed on
     the face of Figure 6.1.4.3-9. If this ever starts closing at a
     transport's real CLmax, something has been tuned. */
  check("the wing-level result is recorded as STILL NOT closing on the real aircraft",
        wing.clMaxWing / 2.35 > 1.10,
        `${wing.clMaxWing.toFixed(2)} against the 737-800's published 2.35, `
        + `+${(100 * (wing.clMaxWing / 2.35 - 1)).toFixed(0)} % — reported beside the CLmax in use, not feeding it`);

  check("the module reports WHICH axes take the wing outside DATCOM's own database",
        wing.domain.length === 4
        && wing.domain.some((d) => d.axis === "sweep" && d.direction === "below")
        && wing.domain.some((d) => d.axis === "aspect ratio" && d.direction === "above")
        && wing.domain.some((d) => d.axis === "section"),
        "Figure 6.1.4.3-9's database is 35-60 deg sweep, A 2.9-8.0, taper 0.25-0.62, 1940s-50s NACA "
        + "6-series and circular-arc; a 737-800 at 25 deg, A 9.45, supercritical is outside it on "
        + `${wing.domain.length} axes at once`);

  check("that database is sourced to the chart face and to Furlong & McHugh",
        /Figure 6\.1\.4\.3-9/.test(H.DATCOM_WING_DATABASE.source)
        && /NACA TR 1339/.test(H.DATCOM_WING_DATABASE.source)
        && H.DATCOM_WING_DATABASE.sweepC4Deg[0] === 35 && H.DATCOM_WING_DATABASE.aspectRatio[1] === 8.0,
        "DATCOM 6.1.4.3 reference 1: \"Tabulated data from 142 reports are presented in Reference 1\"");

  /* THE ONLY FULLY PREDICTIVE THREE-DIMENSIONAL CHECK THAT EXISTS.
     NASA TP-1580 / TP-1805, the Energy Efficient Transport high-lift model:
     a full-span 15.5 % slat on a 27 deg, A = 12 wing. Both the slat chord
     and its span are published, so DATCOM Eq. 6.1.4.3-b can be run against
     it with nothing assumed. It over-predicts. */
  const eetSlat = H.datcomSlatIncrement({ slatChordRatio: 0.155, slatSpanRatio: 1.0, sweepC4Deg: 27 });
  const eetMeasured = 1.90 - 1.33;                    // climb (slat only) minus cruise, trimmed
  check("DATCOM's slat equation over-predicts the one measured 3-D slat increment, and that is recorded",
        eetSlat / eetMeasured > 1.40,
        `${eetSlat.toFixed(3)} against the EET model's measured ${eetMeasured.toFixed(2)} `
        + `(+${(100 * (eetSlat / eetMeasured - 1)).toFixed(0)} %) — DATCOM: the method "has not been `
        + "substantiated beyond the test data that were used to formulate the method\"");

  /* THE ORIGINAL DATABASE SAYS THE CORRELATION COULD NOT BE FOUND.
     Read first-hand off the rendered page images of NACA TR 1339 (the scan
     has no text layer); printed page numbers carried with each quotation. */
  check("TR 1339, the database DATCOM cites, reports that this correlation could not be found",
        H.TR1339.noCorrelation === "No clear correlation could be found."
        && H.TR1339.noCorrelationPage === 1425
        && /aerofoil-dependent/.test(H.TR1339.noCorrelationScope),
        "printed p. 1425, on the influence of sweep on the maximum-lift effectiveness of trailing-edge "
        + "flaps; scope is partial-span split flaps at 60 deg on two aerofoil families, and the sweep "
        + "effect is recorded as aerofoil-dependent — which a single-valued K_Lambda cannot express");

  check("the non-additivity rule is carried from the SOURCE, not from DATCOM's restatement of it",
        /not additive except in a few isolated cases/.test(H.TR1339.notAdditive)
        && H.TR1339.notAdditivePage === 1426,
        "TR 1339 printed p. 1426 — the same finding DATCOM restates at 6.1.4.3-1");

  check("K_Lambda's own ancestor is two-branched and its round-nose data stops near 45 degrees",
        H.TR1339.fig31RoundNoseDataDeg[0] === 15 && H.TR1339.fig31RoundNoseDataDeg[1] === 45
        && /two divergent branches/i.test(H.TR1339.fig31Note)
        && /estimates in the case of the round-leading-edge airfoils had to be used/.test(H.TR1339.fig31Note),
        "TR 1339 Figure 31, printed p. 1419: sharp-nosed wings RISE above 1.0 with sweep, round-nosed "
        + "wings fall, and the round-nose zero-sweep denominator was estimated rather than measured");

  /* A 737 at 25 deg is INSIDE Figure 31's round-nose range, so the sweep
     factor is NOT this wing's problem — the aspect ratio and the section
     are. The report must not blame the wrong axis. */
  const dom25 = H.domainOfValidity({ sweepC4Deg: 25.03, aspectRatio: 9.45, taper: 0.24, supercritical: true });
  const dom55 = H.domainOfValidity({ sweepC4Deg: 55, aspectRatio: 5, taper: 0.4 });
  check("the sweep FACTOR is not blamed at a transport's sweep, but is flagged beyond its data",
        !dom25.some((d) => d.axis === "sweep factor K_Λ")
        && dom55.some((d) => d.axis === "sweep factor K_Λ" && d.direction === "above"),
        "25 deg is inside Figure 31's 15-45 deg round-nose data and is not flagged; 55 deg is");

  check("the linear flapped-fraction form is flagged for the device class where TR 1339 shows it fails",
        H.domainOfValidity({ sweepC4Deg: 25, flapType: "plain" }).some((d) => d.axis === "flap type")
        && !H.domainOfValidity({ sweepC4Deg: 25, flapType: "double-slotted" }).some((d) => d.axis === "flap type"),
        "TR 1339 Figure 39: double-slotted is near-linear to 1.04 at 96 % span, split saturates at 0.39");

  /* Olson's Eq. (10) is written for a PRIMED quantity (extended chord) and
     this module does not refer it back. The research note says it should;
     the CR-2214 measurement says it should not. Recorded, not decided. */
  check("the Eq. (10) chord-referral contradiction is carried in the open, both values reported",
        wing.terms.dfClMaxSharpChordReferred > wing.terms.dfClMaxSharp
        && Math.abs(wing.terms.dfClMaxSharpChordReferred - wing.terms.dfClMaxSharp * wing.terms.cPrimeOverC) < 1e-12,
        `bare ${wing.terms.dfClMaxSharp.toFixed(3)} against chord-referred `
        + `${wing.terms.dfClMaxSharpChordReferred.toFixed(3)}; applying the referral takes the `
        + "single-slotted CR-2214 case from +3.2 % to about +17 %, so the measurement contradicts it");

  /* Leading- and trailing-edge increments are NOT additive, and the slat
     branch must therefore REPLACE the section maximum lift. */
  check("a leading-edge device replaces the section maximum lift rather than adding to it",
        /REPLACES the section maximum lift/.test(wing.route)
        && wing.clMaxSection !== 1.60 + wing.terms.dfClMaxSharp,
        "DATCOM: \"Maximum lift increments of leading-edge and trailing-edge flaps cannot, in general, be added\"");
  check("the module declares that it is not wired into the sizing loop",
        wing.caveats.some((c) => /NOT wired into the sizing loop/.test(c)));
}

console.log(fail ? `AIRCRAFT ENGINE GATE FAILED: ${fail} check(s)` : `AIRCRAFT ENGINE GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
