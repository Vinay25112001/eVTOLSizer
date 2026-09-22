/* =====================================================================
   TURBOELECTRIC POWERTRAIN — validation and verification
   =====================================================================
   VALIDATION: NASA's turboelectric lift+cruise (Silva et al., AIAA ATIO
   2018, Table 3, "L+C TE"), sized from its own published parameters with
   the same mission and technology mapping as the all-electric L+C that
   validation/nasa-configs.mjs scores (paramsFor, validation/nasa-vehicles.js).

   THE ACCEPTANCE RULE IS RELATIVE, NOT A CHOSEN PERCENTAGE. The lift+cruise
   model already under-predicts the all-electric sibling's gross weight by a
   measured amount. The turboelectric powertrain adds a fuel system on top of
   that airframe; it passes if it makes the aircraft's error NO WORSE than the
   battery version's (plus 5 points [LAY]), and if the quantities only the
   powertrain determines — fuel carried, fuel burned, turboshaft power — are
   within 15% [LAY]. Both thresholds are assumptions and are printed.

   VERIFICATION: the model's own identities on every layout — mass closure
   with fuel, zero net battery flow, the emergency pack criteria, the tank
   fraction, the engine table reproduced at its rows, and the lapse function.
   ===================================================================== */

import { runSizing } from "../src/engine.js";
import { NASA_VEHICLES, NASA_TE_VEHICLES, paramsFor } from "./nasa-vehicles.js";
import {
  turboshaftTechnology, referredLapse, TURBOSHAFT_TABLE, TURBOELECTRIC_DEFAULTS, HP,
} from "../src/engine/turboelectric.js";
import { makeISA } from "../src/engine/atmosphere.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { engineInputs } from "../src/lib/designfile.js";
import { provenanceOf } from "../src/lib/provenance.js";
import { mtowErrorSummary } from "../src/lib/warnings.js";
import { readFileSync } from "node:fs";

const LB = 2.20462;
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const pct = (a, b) => 100 * (a / b - 1);

console.log("═".repeat(76));
console.log("TURBOELECTRIC POWERTRAIN");
console.log("═".repeat(76));

/* ── 1. validation against NASA ───────────────────────────────────────── */
console.log("\n1. NASA lift+cruise, turboelectric (Silva et al. 2018 Table 3)\n");
const v = NASA_TE_VEHICLES[0];
const R = runSizing({ ...paramsFor(v), powertrain: "turboelectric" });
const pub = v.published;
const rows = [
  ["gross weight (lb)",        R.MTOW * LB,                         pub.DGW_lb],
  ["empty weight (lb)",        R.Wempty * LB,                       pub.empty_lb],
  ["battery (lb)",             R.Wbat * LB,                         pub.pack_lb],
  ["fuel carried (lb)",        R.fuelMassKg * LB,                   pub.fuelCapacity_lb],
  ["fuel burn (lb)",           R.fuelBurnKg * LB,                   pub.fuelBurn_lb],
  ["energy burn (MJ)",         R.fuelEnergyBurnMJ,                  pub.energyBurn_MJ],
  ["turboshaft at 6k ft (hp)", R.turboshaftHoverAvailKW / HP,       pub.turboshaft_hp],
];
console.log("   quantity                   published     tool      error");
for (const [k, got, want] of rows)
  console.log(`   ${k.padEnd(26)} ${String(want).padStart(8)} ${got.toFixed(0).padStart(8)}   ${pct(got, want) >= 0 ? "+" : ""}${pct(got, want).toFixed(1)}%`);

const E = runSizing(paramsFor(NASA_VEHICLES.find(x => x.key === "L+C-E")));
const eErr = pct(E.MTOW * LB, NASA_VEHICLES.find(x => x.key === "L+C-E").published.DGW_lb);
const teErr = pct(R.MTOW * LB, pub.DGW_lb);
console.log(`\n   all-electric sibling (L+C-E) gross weight error: ${eErr.toFixed(1)}%`);
check("the design converges", R.r2Converged === true && R.powertrain === "turboelectric");
check("gross-weight error no worse than the battery sibling's (+5 points)",
      Math.abs(teErr) <= Math.abs(eErr) + 5, `turboelectric ${teErr.toFixed(1)}% vs electric ${eErr.toFixed(1)}%`);
for (const [k, got, want] of rows.slice(3)) {
  check(`${k} within 15%`, Math.abs(pct(got, want)) <= 15, `${pct(got, want).toFixed(1)}%`);
}
check("hover and cruise C-rate are zero, as NASA reports", R.CrateHov === 0 && R.CrateCr === 0);

/* ── 2. identities on every layout ─────────────────────────────────────── */
console.log("\n2. Identities on every layout (app defaults, turboelectric)\n");
const LAYOUTS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"];
const k = TURBOELECTRIC_DEFAULTS;
const bad = [];
for (const c of LAYOUTS) {
  for (const extra of [{}, { payload: 300, range: 60 }, { fieldElev: 1829, deltaISA: 20 }]) {
    const p = engineInputs({ ...DEFAULT_PARAMS, configType: c, powertrain: "turboelectric", ...extra });
    const r = runSizing(p);
    if (r.r2Diverged) { bad.push(`${c}: diverged`); continue; }
    const id = (name, ok) => { if (!ok) bad.push(`${c} ${JSON.stringify(extra)}: ${name}`); };
    id("mass closes with fuel", Math.abs(p.payload + r.Wempty + r.Wbat + r.fuelMassKg - r.MTOW) < 0.03);
    id("gap reported as zero", Math.abs(r.massBalanceGapKg) <= 0.02);
    id("fuel = burn + reserve", Math.abs(r.fuelMassKg - r.fuelBurnKg - r.fuelReserveKg) < 0.02);
    id("tank = 0.19 x fuel", Math.abs(r.fuelTankMassKg - k.tankFraction * r.fuelMassKg) < 0.02);
    id("groups include engine, generator, tank",
       Math.abs(r.weightGroupsRaw.turboshaft - r.turboshaftMassKg) < 0.01
       && Math.abs(r.weightGroupsRaw.generator - r.generatorMassKg) < 0.01
       && Math.abs(r.weightGroupsRaw.fuelTank - r.fuelTankMassKg) < 0.01);
    id("empty mass = sum of groups",
       Math.abs(Object.values(r.weightGroupsRaw).reduce((s, x) => s + (Number(x) || 0), 0) - r.Wempty) < 0.05);
    const packKWh = r.Wbat * (p.sedCell * (1 - (p.cRateDerate ?? 0.08))) / 1000;
    /* The pack is sized inside the loop from that pass's hover power; the
       reported Phov can differ by the convergence tolerance, hence 0.1%. */
    id("pack power within 14C", r.Phov / packKWh <= k.emergencyCRate * (1 + 1e-3));
    id("pack covers 2-min hover", r.checks.find(x => /2-min engine-out/.test(x.label))?.ok === true);
    id("generator carries the hover demand", r.generatorRatedKW >= r.Phov - 0.1);
    id("fuel energy = burn x 42.8", Math.abs(r.fuelEnergyBurnMJ - r.fuelBurnKg * 42.8) < 0.25);   // burn is published to 0.01 kg
    id("battery-only analyses marked", r.checks.find(x => x.label === "Residual SoC")?.val.startsWith("not applicable"));
  }
}
check("every layout closes and satisfies the powertrain identities", bad.length === 0, bad.slice(0, 4).join(" | ") || "18 design points");

/* ── 3. the pieces ─────────────────────────────────────────────────────── */
console.log("\n3. Model pieces\n");
check("the engine table is reproduced exactly at its rows",
      TURBOSHAFT_TABLE.every(row => {
        const t = turboshaftTechnology(row.hp * HP);
        return Math.abs(t.lbPerHp - row.lbPerHp) < 1e-12 && Math.abs(t.sfcLbPerHpHr - row.sfc) < 1e-12 && !t.clamped;
      }));
check("outside the table the end row is used and flagged",
      turboshaftTechnology(50 * HP).clamped && turboshaftTechnology(50 * HP).lbPerHp === 0.70
      && turboshaftTechnology(9000 * HP).clamped && turboshaftTechnology(9000 * HP).sfcLbPerHpHr === 0.35);
{
  const isa = makeISA(0);
  const sl = referredLapse(isa(0)), k6 = referredLapse(isa(6000 / 3.28084));
  check("δ√θ is 1 at sea level ISA", Math.abs(sl - 1) < 1e-9, sl.toFixed(6));
  check("δ√θ at 6,000 ft ISA is 0.785 (δ 0.8014, θ 0.9588)", Math.abs(k6 - 0.7847) < 0.001, k6.toFixed(4));
  const hot = referredLapse(makeISA(20)(0));
  check("a hot day raises √θ (δ unchanged at sea level)", hot > 1 && Math.abs(hot - Math.sqrt(308.15 / 288.15)) < 1e-9);
}
{
  const b = runSizing(engineInputs(DEFAULT_PARAMS));
  check("a battery aircraft reports no fuel and no turboshaft",
        b.powertrain === "battery" && b.fuelMassKg === 0 && b.turboshaftRatedKW === null && b.generatorMassKg === null);
  const hi = runSizing(engineInputs({ ...DEFAULT_PARAMS, powertrain: "turboelectric", fieldElev: 1829, deltaISA: 20 }));
  const lo = runSizing(engineInputs({ ...DEFAULT_PARAMS, powertrain: "turboelectric" }));
  check("hot and high needs a bigger turboshaft (lapse is applied)", hi.turboshaftRatedKW > lo.turboshaftRatedKW * 1.1,
        `${lo.turboshaftRatedKW} -> ${hi.turboshaftRatedKW} kW`);
  const longer = runSizing(engineInputs({ ...DEFAULT_PARAMS, powertrain: "turboelectric", range: 200 }));
  check("a longer mission carries more fuel but not a bigger emergency pack in proportion",
        longer.fuelMassKg > lo.fuelMassKg * 1.5 && longer.Wbat < lo.Wbat * 1.5,
        `fuel ${lo.fuelMassKg} -> ${longer.fuelMassKg} kg, pack ${lo.Wbat} -> ${longer.Wbat} kg`);
  const rp = lo.rpData;
  const design = rp.find(x => x.segment === "design");
  check("payload-range: less payload buys no range (tank is full), more payload costs range",
        rp[0].range === design.range && rp[rp.length - 1].range < design.range);
}

/* ── 4. what the screen says about a turboelectric number ────────────── */
console.log("\n4. Badges and summaries follow the powertrain\n");
{
  check("the pack and mission energy are not VAL on a turboelectric design",
        provenanceOf("Wbat", "turboelectric").status !== "validated"
        && provenanceOf("Etot", "turboelectric").status !== "validated"
        && provenanceOf("PackkWh", "turboelectric").status !== "validated"
        && provenanceOf("Wbat", "battery").status === "validated");
  check("the fuel outputs are not VAL on a battery design (they are zero)",
        provenanceOf("fuelMassKg", "battery").status === "derived"
        && provenanceOf("fuelMassKg", "turboelectric").status === "validated");
  check("the take-off-mass card quotes the measured error for its own powertrain",
        /one published turboelectric aircraft/.test(mtowErrorSummary({ powertrain: "turboelectric" }))
        && /mean error over \d+ published aircraft/.test(mtowErrorSummary({})),
        `${mtowErrorSummary({ powertrain: "turboelectric" })} | ${mtowErrorSummary({})}`);
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  check("the card no longer types its own accuracy figure",
        !/±14% measured/.test(read("src/tabs/OverviewTab.jsx")) && /mtowErrorSummary\(params\)/.test(read("src/tabs/OverviewTab.jsx")));
  check("every chip reads the powertrain of the design on screen",
        /useContext\(PowertrainContext\)/.test(read("src/ui/Provenance.jsx"))
        && /<PowertrainContext\.Provider value=\{deferredParams\.powertrain/.test(read("src/App.jsx")));
  check("the Cost tab says it does not price fuel", /data-cost-powertrain-note/.test(read("src/tabs/CostTab.jsx")));
  check("the sidebar offers the powertrain",
        /data-powertrain-toggle/.test(read("src/App.jsx")) && /\["turboelectric","Turboelectric"\]/.test(read("src/App.jsx")));
}

console.log("\n" + "═".repeat(76));
console.log(fail ? `TURBOELECTRIC GATE FAILED: ${fail} check(s)` : `TURBOELECTRIC GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
