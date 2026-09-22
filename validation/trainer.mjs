/* =====================================================================
   TRAINER GATE — the piston trainer class, checked four ways
   =====================================================================
   1. IMPLEMENTATION. The GASP equations reproduce the values NASA's Aviary
      tests take from the original GASP program, and the propeller equation
      reproduces its own source table. These are the checks that catch a
      transcription error, including the three misprints in CR-152303 Vol V
      (V.1.63, V.1.69, V.1.74) that this code follows Aviary on.
   2. IDENTITIES. The sizing loop closes: gross = empty + payload + fuel.
   3. VALIDATION. Empty weight of three real trainers from their gross
      weight, wing and engine, and a C172S sized from its own requirements.
      The bands below were set AFTER the first measurement (2026-09-16), so
      they are regression bands, not accuracy claims; the measured errors are
      printed every run.
   4. INPUTS. Every input says whether its default is sourced, derived or
      assumed, and names where it came from.
   ===================================================================== */

import * as W from "../src/classes/trainer/weights.js";
import * as P from "../src/classes/trainer/performance.js";
import { analyzeTrainer, sizeTrainer } from "../src/classes/trainer/size.js";
import { TRAINER_INPUTS } from "../src/classes/trainer/defaults.js";
import { classOf, sizeDesign } from "../src/classes/registry.js";
import { TRAINER_EMPTY_WEIGHT_CASES, C172S_SIZING_CASE } from "../src/classes/trainer/validation-cases.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const pct = (a, b) => `${((a / b - 1) * 100).toFixed(1)}%`;
const r1 = (x) => Math.round(x * 10) / 10;

console.log("TRAINER GATE");
console.log("=".repeat(72));

/* ── 1. implementation ──────────────────────────────────────────────── */
console.log("\n1. Implementation against NASA's own numbers");
{
  // Aviary test_fuel.py FuselageMassTestCase1 (large single aisle 1 V3, from GASP)
  const w = W.fuselageWeight({ contentsLb: 102270, wettedFt2: 4000, widthFt: 13.1, lengthFt: 129.4,
                               vdKt: 420, pressureDiffPsi: 7.5, ultimate: 3.893, skB: 128 });
  check("fuselage (V.1.74, numerator form) reproduces Aviary's GASP case 18,763 lb", rel(w, 18763) < 1e-3, `${r1(w)} lb`);
  // Aviary test_wing.py WingMassSolveTestCase (same aircraft)
  const half = 0.3947081519145335;
  const wing = W.wingWeight({ grossLb: 175400, ultimate: 3.893, spanFt: 117.8, taper: 0.33, tcRoot: 0.15,
                              cosHalfChordSweep: Math.cos(half), strutFraction: 0, gearOnWing: true,
                              skWW: 102.5, enginePositionFactor: 0.98, highLiftLb: 3645 });
  check("wing (V.1.67-72, + sign in V.1.69) reproduces Aviary's GASP case 15,830 lb", rel(wing.wingLb, 15830) < 5e-4, `${r1(wing.wingLb)} lb`);
  check("the material factor for that wing is Aviary's 1.2213063", Math.abs(wing.skNO - 1.2213063198183813) < 1e-9, wing.skNO.toFixed(7));
  /* NASA CR-114289 Table III, Piper PA-28-235 fixed-pitch propeller: calc
     38.4 lb. The table gives 170 mph but not the altitude, so the Mach number
     is not known: 0.22 (sea level) to 0.27 spans 37.8-38.6 lb. Hence ±2%. */
  const mach = 170 * 1.46667 / 1116.45;
  const prop = W.propellerWeight({ diameterFt: 80 / 12, blades: 2, activityFactor: 77.5, rpm: 2700, shp: 260,
                                   mach, kind: "fixed" });
  check("propeller (CR-114289 Table V) reproduces its Table III PA-28-235 calculation, 38.4 lb (±2%, Mach not given)", rel(prop, 38.4) < 0.02, `${r1(prop)} lb at sea-level Mach`);
  check("landing gear reproduces GASP Fig V.1.5, Cessna 172: 117 lb at 2,300 lb",
        Math.abs(W.landingGearWeight({ grossLb: 2300, skLG: 0.05087 }) - 117) < 0.1);
  const loads = W.designLoads({ category: "normal", wingLoading: 14.66, maxStructSpeedKt: 126, meanChordFt: 4.9, AR: 7.48 });
  check("normal category: ultimate load factor is 1.5 × 3.8 when manoeuvre governs", loads.governing === "manoeuvre" && Math.abs(loads.ultimate - 5.7) < 1e-12, `${loads.ultimate}`);
  const util = W.designLoads({ category: "utility", wingLoading: 14.66, maxStructSpeedKt: 126, meanChordFt: 4.9, AR: 7.48 });
  check("utility category: 1.5 × 4.4", Math.abs(util.ultimate - 6.6) < 1e-12);
  let threw = false; try { W.designLoads({ category: "glider", wingLoading: 10, maxStructSpeedKt: 100, meanChordFt: 4, AR: 8 }); } catch { threw = true; }
  check("an unknown category is refused", threw);
  // (C_L^1.5/C_D)max from Loftin (6.20) equals the polar's numeric maximum
  const pol = P.polar({ CD0: 0.0296, AR: 7.48, e: 0.7 });
  let best = 0; for (let cl = 0.05; cl < 3; cl += 0.0005) best = Math.max(best, cl ** 1.5 / pol.CD(cl));
  check("Loftin (6.20) is the maximum of the parabolic polar", rel(pol.climbParamMax, best) < 2e-3, `${pol.climbParamMax.toFixed(3)} vs ${best.toFixed(3)}`);
  const lapse = [0, 4000, 8000, 12000, 16000, 20000].map(P.pistonPowerRatio);
  check("Loftin Fig 6.28 power ratio falls with altitude and is 1 at sea level",
        lapse[0] === 1 && lapse.every((v, i) => i === 0 || v < lapse[i - 1]));
  check("outside Fig 6.28 the power ratio is undefined, not extrapolated", Number.isNaN(P.pistonPowerRatio(30000)));
  const fuel = P.breguetFuel({ rangeNm: 500, startWeightLb: 2500, eta: 0.85, sfc: 0.43, LD: 10 });
  const back = P.breguetRangeNm({ fuelLb: fuel, startWeightLb: 2500, eta: 0.85, sfc: 0.43, LD: 10 });
  check("Breguet (6.40) fuel and range are inverses", Math.abs(back - 500) < 1e-9, `${back}`);
}

/* ── 2. identities ──────────────────────────────────────────────────── */
console.log("\n2. Identities");
const S0 = sizeTrainer({});
check("the default trainer converges", S0.converged, `${S0.iterations} iterations`);
check("gross = empty + payload + fuel", Math.abs(S0.grossLb - (S0.emptyLb + S0.payloadLb + S0.fuelLb)) < 0.05,
      `${r1(S0.grossLb)} vs ${r1(S0.emptyLb + S0.payloadLb + S0.fuelLb)}`);
check("empty weight is the sum of its groups",
      Math.abs(S0.emptyLb - Object.values(S0.groups).reduce((a, b) => a + b, 0)) < 1e-9);
check("fuel = allowance + climb + cruise + reserve",
      Math.abs(S0.fuel.usableLb - (S0.fuel.allowanceLb + S0.fuel.climbLb + S0.fuel.cruiseLb + S0.fuel.reserveLb)) < 1e-9);
check("the wing area meets the stall requirement exactly",
      Math.abs(P.stallSpeedKt({ wingLoading: S0.grossLb / S0.wingAreaFt2, clMax: S0.inputs.clMaxLanding }) - S0.inputs.stallKt) < 1e-3);
check("sizeDesign dispatches the trainer class to its own loop",
      classOf("trainer").size === sizeTrainer && Math.abs(sizeDesign({ aircraftClass: "trainer", params: {} }).grossLb - S0.grossLb) < 1e-9);
check("more range needs a heavier aircraft", sizeTrainer({ rangeNm: 700 }).grossLb > S0.grossLb);
check("more payload needs a heavier aircraft", sizeTrainer({ pax: 4 }).grossLb > S0.grossLb);
{
  let threw = false; try { sizeTrainer({ rangeNm: NaN }); } catch { threw = true; }
  check("a non-numeric input is refused, not sized", threw);
  const impossible = sizeTrainer({ rangeNm: 5000 });
  check("an impossible mission (5,000 nm) is reported as not converged, with a reason",
        impossible.converged === false && typeof impossible.stopReason === "string" && impossible.stopReason.length > 0,
        `converged ${impossible.converged}, last gross ${r1(impossible.grossLb)} lb`);
  const far = sizeTrainer({ rangeNm: 1200 });
  check("a long but possible mission (1,200 nm) converges and closes", far.converged &&
        Math.abs(far.grossLb - (far.emptyLb + far.payloadLb + far.fuelLb)) < 0.05, `${r1(far.grossLb)} lb`);
}

/* ── 3. validation ──────────────────────────────────────────────────── */
console.log("\n3. Validation against real trainers");
const cases = TRAINER_EMPTY_WEIGHT_CASES.map(c => ({ name: c.name, actual: c.emptyLb, band: c.band, src: c.source, inp: c.inputs }));
let absSum = 0;
for (const c of cases) {
  const r = analyzeTrainer(c.inp);
  absSum += rel(r.emptyLb, c.actual);
  check(`${c.name}: empty weight within ±${c.band * 100}%`, rel(r.emptyLb, c.actual) <= c.band,
        `${r1(r.emptyLb)} lb vs ${c.actual} (${pct(r.emptyLb, c.actual)}); ${c.src}`);
}
console.log(`       mean absolute empty-weight error over ${cases.length} aircraft: ${(absSum / cases.length * 100).toFixed(1)}%`);
console.log("       Loftin's empty weights do not say whether oil and unusable fuel are included; the C172S's do (TCDS 3A12).");
{
  const clC172S = C172S_SIZING_CASE.clMaxLanding;
  const s = sizeTrainer({ clMaxLanding: clC172S });
  console.log(`       C172S sized from its own POH requirements (CLmax ${clC172S.toFixed(3)} derived from 48 KCAS at 2,550 lb, 174 ft²):`);
  const rows = C172S_SIZING_CASE.targets.map(t => [t.label.toLowerCase(), s[t.key], t.actual, t.band]);
  check("C172S sizing converges", s.converged);
  for (const [n, got, act, band] of rows)
    check(`C172S sizing: ${n} within ±${band * 100}%`, rel(got, act) <= band, `${r1(got)} vs ${act} (${pct(got, act)})`);
  console.log(`       power set by ${s.powerGovernedBy} (cruise ${r1(s.hpCruise)} hp, climb ${r1(s.hpClimb)} hp);`
            + ` Loftin Fig 6.28 gives ${(s.cruiseAltitudePowerRatio * 100).toFixed(1)}% power available at 8,500 ft against the POH's 75% setting`);
}

/* ── 4. inputs ──────────────────────────────────────────────────────── */
console.log("\n4. Input provenance");
const bad = Object.entries(TRAINER_INPUTS).filter(([, v]) =>
  !["sourced", "derived", "assumed"].includes(v.status) || !v.source || !v.label || !v.section);
check("every trainer input has a status, a source, a label and a section", bad.length === 0, bad.map(([k]) => k).join(", "));
const assumed = Object.entries(TRAINER_INPUTS).filter(([, v]) => v.status === "assumed").map(([k]) => k);
console.log(`       assumed (no free source): ${assumed.join(", ")}`);
{
  const base = analyzeTrainer(cases[0].inp).emptyLb;
  const swing = {};
  for (const k of assumed) {
    const v = TRAINER_INPUTS[k];
    if (typeof v.value !== "number") continue;
    const lo = analyzeTrainer({ ...cases[0].inp, [k]: v.min }).emptyLb;
    const hi = analyzeTrainer({ ...cases[0].inp, [k]: v.max }).emptyLb;
    swing[k] = Math.max(Math.abs(lo - base), Math.abs(hi - base));
  }
  const worst = Object.entries(swing).sort((a, b) => b[1] - a[1]);
  console.log("       C172S empty-weight change across each assumed input's full range:");
  for (const [k, d] of worst) console.log(`         ${k.padEnd(18)} ±${r1(d)} lb (${(d / base * 100).toFixed(1)}%)`);
  check("the sensitivity survey covers every numeric assumed input", worst.length === assumed.filter(k => typeof TRAINER_INPUTS[k].value === "number").length);
}

console.log("");
console.log(fail ? `TRAINER GATE FAILED: ${fail} check(s)` : `TRAINER GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
