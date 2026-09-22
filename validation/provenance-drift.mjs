/* =====================================================================
   PROVENANCE MUST DESCRIBE THE VALUE THE CODE ACTUALLY USES
   =====================================================================
   Asked whether the NASA reference aircraft are eVTOLs and whether this
   engine follows them correctly, the answer turned out to be yes on the
   physics and no on the documentation.

   NASA/TM-20210017971 Table 12 publishes four concept vehicles, and they
   are NOT all battery-electric: the tiltwing is TURBOELECTRIC and one
   side-by-side is hybrid. validation/nasa-configs.mjs states the rule
   correctly -- "Only the ALL-ELECTRIC columns are usable as sizing cases
   -- the turboshaft and turboelectric variants burn fuel, which this
   engine does not model" -- and the benchmark obeys it: the 39 scored
   comparisons use Quad-E, SbS-E and L+C-E only.

   The design blade loading is a separate question, because CT/sigma is a
   ROTOR AERODYNAMIC choice set by stall margin and control authority, and
   is independent of whether the shaft power comes from a battery or a
   turbogenerator. Borrowing it across power-train types is legitimate.
   Borrowing it across CONFIGURATIONS is not, and that had already been
   caught: the tiltrotor row once carried the tiltWING's 0.1126 and was
   corrected to 0.0973 from an all-electric six-rotor tiltrotor.

   What had NOT been corrected was provenance.js, which still described
   the old value and the wrong aircraft. The engine was right and its own
   documentation misreported which aircraft it follows -- which is the
   failure mode this whole project exists to prevent, so it gets a gate
   rather than a fix alone.
   ===================================================================== */
import { DESIGN_CT_SIGMA_BY_CONFIG } from "../src/engine/rotorgroup.js";
import * as P from "../src/lib/provenance.js";
import { readFileSync } from "node:fs";
import { NASA_VEHICLES } from "./nasa-vehicles.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

console.log("PROVENANCE DRIFT GATE");
console.log("=".repeat(78));

/* ── 1. every shipped CT/sigma appears in the note that documents it ── */
const notes = [P.INPUTS?.designCTsigma?.src || "", P.OUTPUTS?.designCTsigma?.src || ""].join(" ");
const missing = [];
console.log("\nDesign blade loading actually shipped, and whether the note says so:\n");
console.log("   configuration   CT/sigma   documented");
for (const [cfg, entry] of Object.entries(DESIGN_CT_SIGMA_BY_CONFIG)) {
  const v = entry.v ?? entry;
  const shown = v.toFixed(4);
  /* accept either the 4-dp or a trimmed form, e.g. 0.0973 or 0.097 */
  const found = notes.includes(shown) || notes.includes(v.toFixed(3)) || notes.includes(String(v));
  if (!found) missing.push(`${cfg}=${shown}`);
  console.log("   " + cfg.padEnd(15) + shown.padStart(8) + "   " + (found ? "yes" : "NO"));
}
check(missing.length === 0,
  "every shipped CT/sigma value is the one its provenance note describes",
  missing.length
    ? "the note documents a value the engine does not use: " + missing.join(", ")
      + " — a reader auditing the source would check the wrong aircraft"
    : `${Object.keys(DESIGN_CT_SIGMA_BY_CONFIG).length} configurations, each value present in its note`);

/* ── 2. no turboelectric or turboshaft vehicle is used as a MASS or
       ENERGY datum, because this engine models neither fuel nor a
       turbogenerator ─────────────────────────────────────────────────── */
/* Imported from the data module (validation/nasa-vehicles.js). This used to
   regex the harness SCRIPT's source for key/label pairs; when the data moved
   out of it the regex matched nothing and the check below passed on ZERO
   vehicles. It now also demands that there are some. */
const vehicles = NASA_VEHICLES.map(v => ({ key: v.key, label: v.label }));
const nonElectric = vehicles.filter(v => !/all-electric/i.test(v.label || ""));
check(vehicles.length > 0, "the NASA sizing cases were found", `${vehicles.length} vehicle(s)`);
console.log("\nVehicles carried as sizing cases:\n");
for (const v of vehicles) console.log("   " + String(v.key).padEnd(10) + (v.label || ""));
check(nonElectric.length === 0,
  "no non-all-electric vehicle is carried as a sizing case",
  nonElectric.length
    ? "these burn fuel and this engine models no fuel system: "
      + nonElectric.map(v => v.key).join(", ")
    : `${vehicles.length} vehicles, every one labelled all-electric`);

/* ── 3. the tiltrotor datum must come from a TILTROTOR ───────────────── */
const tr = DESIGN_CT_SIGMA_BY_CONFIG.tiltrotor;
const trSrc = (tr?.src || "").toLowerCase();
check(/tiltrotor/.test(trSrc) && !/tw-te/.test(trSrc),
  "the tiltrotor blade loading comes from a tiltrotor, not the tiltwing",
  trSrc.includes("tr6-e")
    ? "TR6-E, a six-rotor all-electric tiltrotor — the configuration this row sizes"
    : "source reads: " + (tr?.src || "(none)").slice(0, 120));

console.log("");
console.log(fails.length ? `PROVENANCE DRIFT GATE FAILED: ${fails.length} check(s)`
                         : "PROVENANCE DRIFT GATE PASSED");
process.exit(fails.length ? 1 : 0);
