/* =====================================================================
   VALIDATION AND VERIFICATION DOMAINS — generated, then gated
   =====================================================================
   NASA-STD-7009B [M&S 26] (4.3.1.5): M&S results used "outside the domains
   of V&V" must be placarded with "the type of limit exceeded, the extent that
   the limit was exceeded, and an assessment of the consequences". A tool can
   only do that if it knows its domains. This file writes them down, from the
   harnesses that define them, into src/lib/validation-domain.js, which the
   app reads (src/lib/domain.js).

     DOMAIN OF VALIDATION   the envelope of the aircraft the tool has been
                            compared against: the NASA concept vehicles
                            (nasa-configs.mjs) and every reference aircraft
                            whose mission AND take-off mass are scored
                            (validate.mjs's own isScored rule).
     DOMAIN OF VERIFICATION the design points validation/identities.mjs
                            checks its independent re-derivations on.

   An ENVELOPE is a per-variable [min, max] box, which is generous: a design
   inside every interval can still be unlike every case. That is stated in
   the app rather than hidden.

     node validation/validation-domain.mjs            check the generated module is current
     node validation/validation-domain.mjs --record   rewrite it
   ===================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NASA_VEHICLES, NASA_TE_VEHICLES, PAYLOAD_KG, RANGE_KM, paramsFor } from "./nasa-vehicles.js";
import { runSizing } from "../src/engine.js";
import { REFERENCE_AIRCRAFT, isScored } from "./reference-aircraft.js";
import { IDENTITY_SWEEP_FULL as IDENTITY_SWEEP, IDENTITY_LAYOUTS } from "./identity-sweep.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "lib", "validation-domain.js");
const LB = 2.20462, KT = 0.514444;
const r = (x, d = 3) => +x.toFixed(d);

const cases = [];
for (const v of NASA_VEHICLES) {
  cases.push({
    id: v.key, name: v.label, source: "validation/nasa-vehicles.js (NASA/TM-20210017971 Table 12)",
    configType: v.configType, powertrain: "battery", payload: r(PAYLOAD_KG, 1), range_km: r(RANGE_KM, 1),
    vCruise: r(v.vCruise_kt * KT, 2), MTOW: r(v.published.DGW_lb / LB, 0),
  });
}
for (const ac of REFERENCE_AIRCRAFT) {
  const p = ac.published;
  if (!(isScored(p.payload_kg) && isScored(p.range_km) && isScored(p.cruise_ms) && isScored(p.MTOW_kg))) continue;
  cases.push({
    id: ac.id, name: ac.name, source: "validation/reference-aircraft.js",
    configType: ac.configType ?? "liftcruise", powertrain: "battery", payload: p.payload_kg.value,
    range_km: p.range_km.value, vCruise: p.cruise_ms.value, MTOW: p.MTOW_kg.value,
  });
}

/* ── MEASURED ERROR PER CASE ─────────────────────────────────────────
   The two benchmark harnesses are run and their take-off-mass errors kept,
   so the app can say what agreement was measured on aircraft of the same
   layout ([M&S 33]) and where a measured shortfall is still open ([M&S 32]h).
   validate.mjs has a --json mode; nasa-configs.mjs prints a fixed-format
   table, parsed here, and the parse is checked to have found every vehicle. */
const run = (file, args = []) => execFileSync(process.execPath, [join(ROOT, "validation", file), ...args],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const nasaText = (() => { try { return run("nasa-configs.mjs"); } catch (e) { return e.stdout || ""; } })();
const nasaErr = {};
for (const block of nasaText.split(/\n── /).slice(1)) {
  const label = block.split("   [")[0].trim();
  const v = NASA_VEHICLES.find(x => x.label === label);
  if (!v || nasaErr[v.key]) continue;
  const row = (k) => { const m = new RegExp(`^\\s+${k}\\s+[\\d.]+ kg\\s+[\\d.]+ kg\\s+([+-][\\d.]+)%`, "m").exec(block); return m ? +m[1] : null; };
  nasaErr[v.key] = { MTOW: row("MTOW"), empty: row("empty"), struct: row("struct") };
}
const refJson = JSON.parse(run("validate.mjs", ["--json"]));
const refErr = {};
for (const r of refJson.results) {
  const m = (r.metrics || []).find(x => x.label === "MTOW");
  if (m) refErr[r.id] = { MTOW: m.errPctB };
}
for (const c of cases) {
  c.errorPct = nasaErr[c.id] ?? refErr[c.id] ?? null;
  c.errorModel = nasaErr[c.id] ? "nasa-configs.mjs (NASA technology inputs)" : "validate.mjs, build-up weight model";
}

/* Turboelectric cases (validation/turboelectric.mjs scores them in full). */
for (const v of NASA_TE_VEHICLES) {
  const R = runSizing({ ...paramsFor(v), powertrain: "turboelectric" });
  const pct = (a, b) => r(100 * (a / b - 1), 1);
  cases.push({
    id: v.key, name: v.label, source: "validation/nasa-vehicles.js (Silva et al. 2018 Table 3)",
    configType: v.configType, powertrain: "turboelectric", payload: r(PAYLOAD_KG, 1), range_km: r(RANGE_KM, 1),
    vCruise: r(v.vCruise_kt * KT, 2), MTOW: r(v.published.DGW_lb / LB, 0),
    errorPct: { MTOW: pct(R.MTOW * LB, v.published.DGW_lb), empty: pct(R.Wempty * LB, v.published.empty_lb),
                fuel: pct(R.fuelMassKg * LB, v.published.fuelCapacity_lb) },
    errorModel: "validation/turboelectric.mjs (NASA technology inputs)",
  });
}

const VARS = {
  payload:  { label: "Payload", unit: "kg" },
  range_km: { label: "Mission range", unit: "km" },
  vCruise:  { label: "Cruise speed", unit: "m/s" },
  MTOW:     { label: "Take-off mass", unit: "kg" },
};
/* Per powertrain: a turboelectric design is not validated by battery
   aircraft, whatever its size. */
const byPowertrain = {};
for (const pt of [...new Set(cases.map(c => c.powertrain))]) {
  const cs = cases.filter(c => c.powertrain === pt);
  const envelope = {};
  for (const k of Object.keys(VARS)) {
    const xs = cs.map(c => c[k]);
    envelope[k] = { ...VARS[k], min: Math.min(...xs), max: Math.max(...xs) };
  }
  const layouts = {};
  for (const c of cs) (layouts[c.configType] ??= []).push(c.id);
  byPowertrain[pt] = { envelope, layouts, count: cs.length };
}
const envelope = byPowertrain.battery.envelope;
const layouts = byPowertrain.battery.layouts;

const domain = {
  note: "GENERATED by validation/validation-domain.mjs --record. Do not edit.",
  validation: {
    cases, envelope, layouts, byPowertrain,
    caveat: "A per-variable envelope. Ranges are as each source publishes them; "
      + "some include a reserve and some do not (see validate.mjs).",
  },
  verification: {
    source: "validation/identity-sweep.js (validation/identities.mjs)",
    layouts: IDENTITY_LAYOUTS,
    sweep: IDENTITY_SWEEP,
  },
};
/* A JS module rather than .json: Node needs import attributes for JSON and
   the app's bundler is not guaranteed to accept them. */
const text = "/* GENERATED by validation/validation-domain.mjs --record. Do not edit. */\n"
  + "export default " + JSON.stringify(domain, null, 1) + ";\n";

if (process.argv.includes("--record")) {
  writeFileSync(OUT, text);
  console.log(`recorded ${cases.length} validation cases, ${Object.keys(IDENTITY_SWEEP).length} swept inputs -> src/lib/validation-domain.js`);
  process.exit(0);
}

console.log("VALIDATION DOMAIN GATE");
console.log("=".repeat(72));
console.log(`${cases.length} validated cases over ${Object.keys(layouts).length} layout(s):`);
for (const c of cases) console.log(`   ${c.configType.padEnd(13)} ${c.name}  (MTOW ${c.MTOW} kg, ${c.payload} kg, ${c.range_km} km; MTOW error ${c.errorPct?.MTOW}%)`);
for (const [k, e] of Object.entries(envelope)) console.log(`   ${e.label.padEnd(14)} ${e.min} - ${e.max} ${e.unit}`);
const unvalidated = IDENTITY_LAYOUTS.filter(l => !layouts[l]);
console.log(`   layouts with NO validated case: ${unvalidated.join(", ") || "none"}`);

let ok = true;
if (!existsSync(OUT)) { console.log("FAIL  src/lib/validation-domain.js is missing - run with --record"); ok = false; }
else if (readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") !== text) {
  console.log("FAIL  src/lib/validation-domain.js is STALE - the harness cases changed. Run with --record and commit.");
  ok = false;
}
const missingErr = cases.filter(c => c.errorPct?.MTOW == null).map(c => c.id);
if (missingErr.length) { console.log("FAIL  no measured take-off-mass error parsed for: " + missingErr.join(", ")); ok = false; }
if (cases.length < 3) { console.log("FAIL  fewer than three validation cases were found"); ok = false; }
console.log(ok ? "PASS  the app's domain file matches the harnesses" : "VALIDATION DOMAIN GATE FAILED");
process.exit(ok ? 0 : 1);
