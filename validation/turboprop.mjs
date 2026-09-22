/* =====================================================================
   TURBOPROP GATE — the turboprop-transport class
   =====================================================================
   1. IMPLEMENTATION. The published numbers the methods were taken from:
      Scholz & Nita 2008 Table 2 (ATR 72 redesign) and NASA CR-114399
      Table III (propeller weights calculated by Hamilton Standard).
   2. IDENTITIES. Matching, cruise and closure do what they say.
   3. VALIDATION. Published aircraft (validation-cases.js). Bands were set
      after the first measurement; the errors are printed every run.
   4. INPUTS. Every input states its source status.
   ===================================================================== */

import { sizeTurboprop, analyzeTurboprop, matching, cruise, missionFuel, tripFuel, powerLapse, POWER_LAPSE, psfcSI }
  from "../src/classes/turboprop/size.js";
import { propellerWeight } from "../src/classes/turboprop/propulsion.js";
import { TURBOPROP_INPUTS, TURBOPROP_DEFAULTS } from "../src/classes/turboprop/defaults.js";
import { TURBOPROP_REAL_CASES, TURBOPROP_BLOCK_FUEL, ATR72_SIZING_TARGETS } from "../src/classes/turboprop/validation-cases.js";
import { classOf, sizeDesign } from "../src/classes/registry.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const pct = (a, b) => `${((a / b - 1) * 100).toFixed(2)}%`;
const D = TURBOPROP_DEFAULTS;

console.log("TURBOPROP GATE");
console.log("=".repeat(72));

/* ── 1. implementation ─────────────────────────────────────────────── */
console.log("\n1. The published numbers the methods come from");
{
  const m = matching(D);
  check("second-segment CL is CLmax,TO/1.2² = 1.46 (Scholz & Nita Table 2)", Math.abs(m.cl2 - 1.46) < 0.005, m.cl2.toFixed(3));
  check("missed-approach CL is CLmax,L/1.3² = 1.48 (Table 2)", Math.abs(m.clMa - 1.48) < 0.005, m.clMa.toFixed(3));
  check("second-segment L/D is 12.28 at A 12 (Table 2)", Math.abs(m.e2 - 12.28) < 0.05, m.e2.toFixed(3));
  check("missed-approach L/D is 10.79 with 0.015 gear drag (Table 2)", Math.abs(m.eMa - 10.79) < 0.05, m.eMa.toFixed(3));
  check("landing wing loading reproduces the ATR 72 design point, 373.7 kg/m² (Table 3)", rel(m.wsTakeoff, 373.7) < 0.005, m.wsTakeoff.toFixed(1));
  check("take-off power/mass at that wing loading reproduces 179.8 W/kg (Table 3) within 1%", rel(m.pmTakeoff, 179.8) < 0.01, m.pmTakeoff.toFixed(1));
  /* Cruise at the paper's inputs: Swet/S from its Emax 15.74 = 11.22 √(12/x). */
  const swet = 12 / (15.74 / 11.22) ** 2;
  const c = cruise(D, m.wsTakeoff, swet);
  const cs = cruise({ ...D, powerLapse: "schaufele" }, m.wsTakeoff, swet);
  check("Emax is 15.74 (Table 2)", Math.abs(c.eMax - 15.74) < 0.01, c.eMax.toFixed(3));
  /* The paper's cruise altitude, 3,888 m (p.18): capping the ceiling there gives cruise at that altitude. */
  const at = cruise({ ...D, powerLapse: "schaufele", maxAltitudeFt: 3888 / 0.3048 }, m.wsTakeoff, swet);
  check("at the paper's 3,888 m the lift equation gives its cruise CL 0.503 (Table 2) within 2%", rel(at.cl, 0.503) < 0.02, at.cl.toFixed(3));
  check("and L/D 12.49 (Table 2) within 1%", rel(at.E, 12.49) < 0.01, at.E.toFixed(2));
  check("the paper's altitude is within 0.3% of least cruise power (Schaufele lapse; the curve is flat)",
        rel(at.pm, cs.pm) < 0.003, `${at.pm.toFixed(1)} vs ${cs.pm.toFixed(1)} W/kg at ${cs.altM.toFixed(0)} m`);
  check("that cruise power/mass is the design point's 179.8 W/kg (Table 3) within 1%", rel(cs.pm, 179.8) < 0.01, cs.pm.toFixed(1));
  console.log(`       with the recommended "average" lapse: CL ${c.cl.toFixed(3)}, L/D ${c.E.toFixed(2)}, ${c.altM.toFixed(0)} m`);
  console.log(`       cruise power/mass there: ${c.pm.toFixed(1)} W/kg with the recommended "average" lapse, ${cs.pm.toFixed(1)} with Schaufele's row; the paper's design point is 179.8 (the example appears to use a row other than the average)`);
}
{
  /* CR-114399 Table III, 1970 class V propellers use type (3); speed in mph at sea level. */
  const rows = [
    ["DHC-7", 135, 4, 116, 1140, 1210, 270, 344],
    ["1500 HP", 132, 3, 133, 1500, 1563, 305, 341],
    ["HP 137", 102, 3, 110, 800, 1783, 200, 156],
    ["Twin Otter", 102, 3, 110, 550, 2200, 184, 160],
  ];
  const got = rows.map(([n, d, b, af, shp, rpm, mph, calc]) => {
    const w = propellerWeight({ type: 3, diameterFt: d / 12, blades: b, activityFactor: af, rpm, shp, mach: mph * 0.44704 / 340.294 });
    return [n, w, calc];
  });
  const worst = got.map(([n, w, c]) => [n, rel(w, c), w, c]).sort((a, b) => b[1] - a[1])[0];
  check("CR-114399 Table II reproduces the table's own class V weights within 3%", worst[1] < 0.03,
        got.map(([n, w, c]) => `${n} ${w.toFixed(1)}/${c}`).join(", "));
  const dhc7 = got[0][1];
  console.log(`       DHC-7 actual propeller 377 lb (aluminium) / 320 lb (fibreglass): the equation gives ${dhc7.toFixed(0)} lb (${pct(dhc7, 377)} / ${pct(dhc7, 320)})`);
}

/* ── 2. identities ──────────────────────────────────────────────────── */
console.log("\n2. Identities");
{
  const m = matching(D);
  check("landing wing loading is 0.137 × CLmax,L × s_LFL / (m_ML/m_MTO)",
        Math.abs(m.wsTakeoff - 0.137 * 2.5 * 1067 / 0.98) < 1e-9);
  check("V_APP = 1.64 √s_LFL and V2 = 1.2 × V_APP/1.3 × √(CLmax,L/CLmax,TO)",
        Math.abs(m.vApp - 1.64 * Math.sqrt(1067)) < 1e-12 && Math.abs(m.v2 - 1.2 * m.vApp / 1.3 * Math.sqrt(2.5 / 2.1)) < 1e-12);
  check("second-segment power uses the 25.121(b) gradient for twins, 2.4%",
        Math.abs(m.pmSecond - 2 * (1 / m.e2 + 0.024) * m.v2 * 9.80665 / D.etaClimb) < 1e-9);
  check("the power lapse is A M^m σ^n (equals A at M 1, σ 1)",
        Math.abs(powerLapse(POWER_LAPSE.average, 1, 1) - 1.371) < 1e-12);
  check("0.5 lb/hp/h is 0.0845 mg/(W·s) (Scholz Table 5.8 prints 0.085)", Math.abs(psfcSI(0.5) * 1e6 - 0.0845) < 0.0005,
        (psfcSI(0.5) * 1e6).toFixed(4));
  const c = cruise(D, 372.9, 6);
  const f = missionFuel(D, c);
  const Bs = c.E * D.etaCruise / (psfcSI(D.sfcCruise) * 9.80665);
  check("cruise fraction is exp(−R/B_s), B_s = E η/(SFC g) (Scholz 5.54-5.55)",
        Math.abs(f.cruise - Math.exp(-715 * 1852 / Bs)) < 1e-12);
  check("the Breguet method is cruise × alternate × hold, nothing else",
        Math.abs(f.Mff - f.cruise * f.alternate * f.loiter) < 1e-12);
  check("the 45-minute hold burns exp(−t V / B_s) (Nita eq 3.7.10, B_t = B_s / V)",
        Math.abs(f.loiter - Math.exp(-45 * 60 * c.V / Bs)) < 1e-12);
  const fr = missionFuel({ ...D, fuelMethod: "roskam" }, c);
  check("the Roskam method is Nita's product with start and taxi included",
        Math.abs(fr.Mff - 0.990 * 0.995 * 0.995 * 0.985 * fr.cruise * 0.985 * 0.985 * fr.alternate * fr.loiter * 0.985 * 0.995) < 1e-12);
  {
    const lo = cruise({ ...D, maxAltitudeFt: 5000 }, 372.9, 6);
    check("the cruise altitude never exceeds the ceiling", lo.altM <= 5000 * 0.3048 + 1e-6, `${lo.altM.toFixed(0)} m`);
    check("no altitude below the ceiling needs less cruise power", [0, 500, 1000, 1500].every(h =>
      cruise({ ...D, maxAltitudeFt: h / 0.3048 }, 372.9, 6).pm >= lo.pm - 1e-9));
  }
  const s = sizeTurboprop({});
  check("the default turboprop converges", s.converged, `${s.iterations} iterations`);
  check("gross = zero-fuel + mission fuel", Math.abs(s.grossLb - (s.zeroFuelLb + s.fuelLb)) < 1, s.grossLb.toFixed(1));
  check("power meets every requirement", s.powerToMass >= Math.max(s.constraints.pmTakeoff, s.constraints.pmSecond,
        s.constraints.pmMissed, s.constraints.pmCruise) - 1e-12, s.powerGovernedBy);
  check("installed shp × engines = power/mass × gross", rel(s.shpEach * 2 * 745.69987, s.powerToMass * s.grossLb * 0.45359237) < 1e-5,
        "to the closure tolerance");
  check("engine = specific weight × shp and engine section = 0.338 × engine (GASP V.1.4, V.1.56)",
        Math.abs(s.propulsion.engine - D.engineSpecificWeight * s.shpEach) < 1e-9
        && Math.abs(s.propulsion.section - 0.338 * s.propulsion.engine) < 1e-9
        && Math.abs(s.weights.structure.nacelles - 2 * s.propulsion.section) < 1e-9
        && Math.abs(s.weights.propulsion.engines - 2 * s.propulsion.engine) < 1e-9);
  check("the propulsion group has propellers and no thrust reversers",
        s.weights.propulsion.propellers > 0 && !("thrustReversers" in s.weights.propulsion));
  check("sizeDesign dispatches the turboprop class", classOf("turboprop").size === sizeTurboprop
        && Math.abs(sizeDesign({ aircraftClass: "turboprop", params: {} }).grossLb - s.grossLb) < 1e-9);
  check("more range needs a heavier aircraft", sizeTurboprop({ designRange: 1000 }).grossLb > s.grossLb);
  check("a lighter engine gives a lighter aircraft", sizeTurboprop({ engineSpecificWeight: 0.3 }).grossLb < s.grossLb);
  check("a longer take-off run needs less power", sizeTurboprop({ takeoffFieldLengthM: 1600 }).powerToMass < s.powerToMass);
  check("the propeller type may arrive as text from the screen", sizeTurboprop({ propellerType: "5" }).grossLb === s.grossLb);
  check("containerised cargo adds FLOPS's containers", sizeTurboprop({ cargoContainers: true }).weights.operating.cargoContainers > 0
        && s.weights.operating.cargoContainers === 0);
  for (const bad of [{ cargoContainers: "0" }, { numEngines: 1 }, { numEngines: 2.5 }, { powerLapse: "guess" }, { propellerType: 7 }, { sfcCruise: NaN }]) {
    let threw = false; try { sizeTurboprop(bad); } catch { threw = true; }
    check(`refused: ${JSON.stringify(bad)}`, threw);
  }
  const far = sizeTurboprop({ designRange: 20000 });
  check("an impossible mission (20,000 nm) is reported as not converged, with a reason",
        far.converged === false && typeof far.stopReason === "string");
}

/* ── 3. validation ──────────────────────────────────────────────────── */
console.log("\n3. Validation");
for (const c of TURBOPROP_REAL_CASES) {
  const v = c.pick(analyzeTurboprop(c.inputs));
  check(`${c.name} within ±${c.band * 100}%`, rel(v, c.actual) <= c.band,
        `${v.toFixed(0)} vs ${c.actual} ${c.unit} (${pct(v, c.actual)}); ${c.source}`);
}
for (const c of TURBOPROP_BLOCK_FUEL) {
  const a = analyzeTurboprop(c.inputs);
  const v = tripFuel(a.fuel, c.rangeNm, c.landingKg / 0.45359237) * 0.45359237;
  check(`${c.name} within ±${c.band * 100}%`, rel(v, c.actual) <= c.band, `${v.toFixed(0)} vs ${c.actual} kg (${pct(v, c.actual)}); ${c.source}`);
}
{
  const r = analyzeTurboprop({ ...TURBOPROP_DEFAULTS, fuelMethod: "roskam", grossLb: 22800 / 0.45359237, wingAreaFt2: 61 / 0.09290304,
                               shpEach: 2051e3 / 745.69987, fuelCapacityLb: 5000 / 0.45359237 });
  const v = tripFuel(r.fuel, 200, 21000 / 0.45359237) * 0.45359237;
  console.log(`       with Roskam's segment fractions the ATR 72's 200 nm block fuel would be ${v.toFixed(0)} kg (${pct(v, 638)})`);
}
{
  const s = sizeTurboprop({});
  console.log("       ATR 72 sized from the Scholz & Nita requirement (715 nm, 6,460 kg):");
  for (const t of ATR72_SIZING_TARGETS)
    check(`ATR 72 sizing: ${t.label.toLowerCase()} within ±${t.band * 100}%`, rel(t.pick(s), t.actual) <= t.band,
          `${t.pick(s).toFixed(0)} vs ${t.actual} ${t.unit} (${pct(t.pick(s), t.actual)})`);
  console.log(`       power set by ${s.powerGovernedBy}; cruise ${s.cruise.altFt.toFixed(0)} ft, CL ${s.cruise.cl.toFixed(3)}, L/D ${s.cruise.E.toFixed(2)}, S_wet/S ${s.cruise.swetOverS.toFixed(2)}`);
}

{
  /* The optional systems factor: off by default, fitted on the ATR 42 and
     then checked on the two aircraft it was not fitted to. */
  const KG = 0.45359237, K = 0.858;
  const oew = (c, k) => analyzeTurboprop({ ...c.inputs, systemsFactor: k }).operatingEmptyLb * KG;
  const byId = Object.fromEntries(TURBOPROP_REAL_CASES.map((c) => [c.id, c]));
  const base = analyzeTurboprop(byId["atr42-oew"].inputs), one = analyzeTurboprop({ ...byId["atr42-oew"].inputs, systemsFactor: 1 });
  check("systems factor 1 changes nothing", JSON.stringify(base.weights) === JSON.stringify(one.weights));
  const cal = analyzeTurboprop({ ...byId["atr42-oew"].inputs, systemsFactor: K });
  check("the factor scales every systems item and nothing else",
        Object.keys(base.weights.systems).every((k) => Math.abs(cal.weights.systems[k] - K * base.weights.systems[k]) < 1e-9)
        && JSON.stringify(cal.weights.structure) === JSON.stringify(base.weights.structure));
  const e = (id) => oew(byId[id], K) / byId[id].actual - 1;
  check("fitted 0.858: ATR 42 within 0.5 %, then ATR 72 within +12 % and Dash 8-400 within 4 %",
        Math.abs(e("atr42-oew")) < 0.005 && e("atr72-oew") > 0 && e("atr72-oew") < 0.12 && Math.abs(e("q400-oew")) < 0.04,
        `ATR 42 ${pct(oew(byId["atr42-oew"], K), 11550)}, ATR 72 ${pct(oew(byId["atr72-oew"], K), 13010)}, Q400 ${pct(oew(byId["q400-oew"], K), 17885)}`);
}

/* ── 4. inputs ──────────────────────────────────────────────────────── */
console.log("\n4. Input provenance");
const bad = Object.entries(TURBOPROP_INPUTS).filter(([, v]) =>
  !["sourced", "derived", "assumed"].includes(v.status) || !v.source || !v.label || !v.section);
check("every turboprop input has a status, a source, a label and a section", bad.length === 0, bad.map(([k]) => k).join(", "));
const assumed = Object.entries(TURBOPROP_INPUTS).filter(([, v]) => v.status === "assumed").map(([k]) => k);
console.log(`       assumed (no free source): ${assumed.join(", ")}`);

console.log("");
console.log(fail ? `TURBOPROP GATE FAILED: ${fail} check(s)` : `TURBOPROP GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
