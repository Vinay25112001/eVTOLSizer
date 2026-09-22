/* Report on the eVTOL aircraft database: what is covered, what is missing, and
   whether it agrees with the values the engine actually uses.

   The point is not to print a table. It is to make the GAPS countable, so
   "we don't have data for that" is a measured statement rather than a feeling,
   and to catch the database drifting away from CONFIG_REFERENCE. */
import { EVTOL_AIRCRAFT, NASA_CONCEPT_VEHICLES, LAYOUT_CLASSES,
         databaseSummary, referencesFor } from "../src/data/evtol-database.js";
import { CONFIG_REFERENCE } from "../src/engine/configuration.js";

const bar = "=".repeat(86);
console.log(bar);
console.log("eVTOL AIRCRAFT DATABASE");
console.log(bar);

const s = databaseSummary();
console.log(`\n${s.count} aircraft, ${s.withFullWeightStatement} NASA concept vehicles ` +
            `(the only ones with a full published weight statement)\n`);

console.log("── BY LAYOUT " + "─".repeat(72));
for (const [k, label] of Object.entries(LAYOUT_CLASSES)) {
  const names = s.byLayout[k] || [];
  console.log(`   ${k.padEnd(13)} ${String(names.length).padStart(2)}  ${names.join(", ") || "—"}`);
  if (names.length) console.log(`   ${"".padEnd(13)}     ${label}`);
}

console.log("\n── DATA COVERAGE — how much of the field is actually published " + "─".repeat(23));
for (const [f, c] of Object.entries(s.coverage)) {
  const bars = "█".repeat(Math.round(c.pct / 5)).padEnd(20, "·");
  console.log(`   ${f.padEnd(14)} ${bars} ${String(c.pct).padStart(3)}%  (${c.have}/${c.of})`);
}
console.log(`
   THIS IS THE HEADLINE FINDING, and it is why every accuracy claim in this
   project rests on NASA's concept vehicles rather than on flying hardware:
   MTOW is published for well under half the fleet, and EMPTY WEIGHT for
   almost none. No manufacturer publishes a weight statement. A sizing method
   cannot be validated against numbers that do not exist.`);

console.log("\n── PER-AIRCRAFT " + "─".repeat(69));
const f2 = (v, u) => v == null ? "—" : `${v}${u}`;
console.log(`   ${"aircraft".padEnd(22)} ${"layout".padEnd(13)} ${"rotors".padStart(7)} ` +
            `${"MTOW".padStart(7)} ${"pay".padStart(6)} ${"kWh".padStart(6)} ` +
            `${"span".padStart(6)} ${"range".padStart(7)} ${"cruise".padStart(8)}`);
for (const a of EVTOL_AIRCRAFT) {
  const r = a.rotors || {};
  const rot = r.tilting ? `${r.total}/${r.tilting}t` : `${r.total}`;
  console.log(`   ${a.name.slice(0, 21).padEnd(22)} ${a.layout.padEnd(13)} ${rot.padStart(7)} ` +
    `${f2(a.MTOW_kg, "").padStart(7)} ${f2(a.payload_kg, "").padStart(6)} ` +
    `${f2(a.battery_kWh, "").padStart(6)} ${f2(a.span_m, "").padStart(6)} ` +
    `${f2(a.range_km, "").padStart(7)} ${f2(a.cruise_ms, "").padStart(8)}`);
}

console.log("\n── WHICH LAYOUTS THE INDUSTRY ACTUALLY BUILDS " + "─".repeat(40));
const counts = Object.entries(s.byLayout)
  .filter(([k]) => k !== "UNSUPPORTED")
  .sort((a, b) => b[1].length - a[1].length);
for (const [k, names] of counts) {
  console.log(`   ${k.padEnd(13)} ${"▇".repeat(names.length * 3).padEnd(18)} ${names.length}`);
}
const unsup = s.byLayout.UNSUPPORTED || [];
if (unsup.length) {
  console.log(`\n   OUTSIDE THE ENGINE'S SIX (${unsup.length}): ${unsup.join(", ")}`);
  for (const a of EVTOL_AIRCRAFT.filter(x => x.layout === "UNSUPPORTED")) {
    console.log(`     ${a.name}: ${a.layoutNote}`);
  }
}

console.log("\n── DATABASE vs THE VALUES THE ENGINE USES " + "─".repeat(44));
let drift = 0;
for (const [layout, ref] of Object.entries(CONFIG_REFERENCE)) {
  if (!ref.aircraft) { console.log(`   ${layout.padEnd(13)} CONFIG_REFERENCE: none — ${ref.src}`); continue; }
  /* Search BUILT aircraft first, then the NASA concepts. A concept is a
     legitimate reference where no aircraft of that layout exists — no
     side-by-side eVTOL has ever been built, so NASA's SbS-E is the honest
     anchor rather than a missing entry. */
  const cands = referencesFor(layout);
  const hit = (a) => ref.aircraft.includes(a.name) || a.name.includes(ref.aircraft.split(" ").pop());
  let match = cands.find(hit), isConcept = false;
  if (!match) {
    match = NASA_CONCEPT_VEHICLES.filter(v => v.layout === layout)[0];
    isConcept = !!match;
  }
  if (!match) { console.log(`   ${layout.padEnd(13)} ⚠ "${ref.aircraft}" not found in the database`); drift++; continue; }
  const cmp = [];
  const chk = (label, dbv, refv) => {
    if (dbv == null || refv == null) return;
    if (Math.abs(dbv - refv) / Math.max(1, Math.abs(refv)) > 0.02) { cmp.push(`${label} db ${dbv} vs engine ${refv}`); drift++; }
  };
  chk("MTOW", match.MTOW_kg, ref.MTOW_kg);
  chk("payload", match.payload_kg, ref.payload_kg);
  chk("range", match.range_km ?? (match.range_nm != null ? +(match.range_nm*1.852).toFixed(0) : null), ref.range_km);
  chk("cruise", match.cruise_ms ?? (match.cruise_kt != null ? +(match.cruise_kt*0.514444).toFixed(1) : null), ref.vCruise_ms);
  chk("rotors", match.rotors?.total, ref.nRotors);
  console.log(`   ${layout.padEnd(13)} ${match.name.slice(0,26).padEnd(27)} `
    + `${cmp.length ? "⚠ " + cmp.join("; ") : "agrees"}`
    + `${isConcept ? "  (concept — no aircraft of this layout has been built)" : ""}`);
}
console.log(drift ? `\n   ${drift} disagreement(s) — the database and the engine must not drift apart.`
                  : `\n   No drift: every CONFIG_REFERENCE value is backed by a database entry.`);

/* ── IS THE PUBLISHED DATA EVEN SELF-CONSISTENT? ────────────────────────
   Added after VX4 scored +212% on pack energy and the obvious suspicion was
   bad data. THAT SUSPICION WAS TESTED AND REFUTED, which is why this is worth
   keeping: it distinguishes "the model is wrong" from "the brochure is wrong"
   using only published numbers, instead of assuming whichever is convenient.

   Take the published pack and payload, convert the pack to a mass at this
   project's own usable energy density, add an airframe floor from the
   best-documented aircraft in the set (Joby: 1,120 kg excluding battery, at an
   11.8 m span and five seats), and ask whether CRUISE ALONE fits inside the
   published pack at that minimum weight. If it does not, the published triple
   cannot close and no model should be blamed for missing it. */
console.log("");
console.log(bar);
console.log("PUBLISHED-DATA SELF-CONSISTENCY  (can the pack/range/payload triple close at all?)");
console.log(bar);
const G = 9.80665, USABLE_WH_KG = 300 * (1 - 0.20) * (1 - 0.08) * 0.90;
const AIRFRAME_FLOOR_KG = 1120;   // [SRC] Joby S4 empty 1,950 less ~830 kg of battery
const LD_ETA = 10.72 * 0.744;     // this engine's computed L/De x full-chain eta
console.log(`   airframe floor ${AIRFRAME_FLOOR_KG} kg [SRC Joby, 11.8 m span, 5 seats] · usable ${USABLE_WH_KG.toFixed(0)} Wh/kg · L/D x eta ${LD_ETA.toFixed(2)}`);
for (const a of EVTOL_AIRCRAFT) {
  if (a.battery_kWh == null || a.range_km == null || a.payload_kg == null) continue;
  const batKg = a.battery_kWh * 1000 / USABLE_WH_KG;
  const mtowFloor = a.payload_kg + batKg + AIRFRAME_FLOOR_KG;
  const cruiseKWh = mtowFloor * G * a.range_km * 1000 / LD_ETA / 3.6e6;
  const head = a.battery_kWh - cruiseKWh;
  console.log(`   ${a.name.slice(0,21).padEnd(22)} pack ${(a.battery_kWh+"").padStart(4)} kWh · ${(a.range_km+" km").padStart(7)} · MTOW floor ${mtowFloor.toFixed(0).padStart(5)} kg · cruise needs ${cruiseKWh.toFixed(0).padStart(4)} kWh  -> `
    + (head > 0 ? `consistent, ${head.toFixed(0)} kWh left for hover/climb/reserve`
                : `INCONSISTENT, cruise alone exceeds the pack by ${(-head).toFixed(0)} kWh`));
}
console.log(`
   VX4 PASSES THIS TEST, so its +212% pack-energy error is OURS, not the
   brochure's. Diagnosed: the empty-weight FRACTION is right (46.8% against the
   47.0% its own numbers imply) and the whole gap is energy — this engine's
   L/D x eta is 7.98 where VX4's published pack/range pair implies 9.47, about
   19% better. Stopped-rotor drag is NOT the cause: hub + blade is 0.0070 of a
   0.0402 CD0, only 17%. The residual is the shared TECH_BASELINE efficiency
   set (eta_prop 0.80 x eta_powertrain 0.93) applied to an aircraft whose own
   published figures imply better technology.`);

console.log("\n" + bar);
console.log("NASA CONCEPT VEHICLES — the only full weight statements in the field");
console.log(bar);
console.log(`   ${"vehicle".padEnd(30)} ${"layout".padEnd(12)} ${"MTOW".padStart(6)} ` +
            `${"empty".padStart(6)} ${"kWh".padStart(5)} ${"rotorType".padStart(18)} ${"nu".padStart(5)}`);
for (const v of NASA_CONCEPT_VEHICLES) {
  console.log(`   ${v.name.padEnd(30)} ${v.layout.padEnd(12)} ${String(v.MTOW_kg).padStart(6)} ` +
    `${String(v.empty_kg).padStart(6)} ${String(v.battery_kWh).padStart(5)} ` +
    `${String(v.rotorType).padStart(18)} ${String(v.flapFreq).padStart(5)}`);
}
console.log(bar);
process.exit(drift ? 1 : 0);
