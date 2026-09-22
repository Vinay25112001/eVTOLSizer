/* =====================================================================
   DRONE COMPONENT CATALOGUE GATE — provenance, and the convention traps
   =====================================================================
   WHY THIS FILE EXISTS.

   The drone engine sizes by SELECTING real parts rather than estimating
   masses from correlations, so the catalogue is load-bearing in a way a
   correlation coefficient never is: a wrong number here becomes a wrong
   recommendation for hardware somebody buys and flies.

   Rule 1 of this project is "never invent a number", and for a catalogue
   that means every entry names the page it came from. This gate enforces
   it mechanically, the way citations.mjs does for the aircraft engine.

   THE TRAP THIS GATE MAINLY EXISTS FOR.
   A motor's copper loss is I^2 * R_phase. Vendors print "resistance" under
   eight different labels across this survey, and the quantity they mean
   differs by a factor of three:

     phase-to-phase resistance, WYE motor   = 2   * R_phase
     phase-to-phase resistance, DELTA motor = 2/3 * R_phase

   Only some vendors say which they measured. The published literature
   independently reports that catalogue resistance is 2-3x below what a
   loss model needs, which is the same size as this ambiguity and may well
   BE this ambiguity. So the catalogue classifies rather than converts, and
   this gate makes sure nothing marked "modellable" is resting on a
   convention the vendor never stated. The no-load current gets the same
   treatment: it is meaningless without its reference voltage, and this
   survey found four different ones in use (10, 18, 22 and 24 V).

   The gate deliberately does NOT require a minimum number of modellable
   motors. How many there are is a finding about the industry, not a
   target: at the time of writing it is 3 of 24, and if that number falls
   the right response is to record it, not to loosen the definition.
   ===================================================================== */
import {
  ALL_COMPONENTS, CATALOGUE_META, CATEGORIES, BLDC_MOTORS, MODELLABLE_MOTORS,
} from "../src/data/drone-components.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE COMPONENT CATALOGUE GATE");
console.log("=".repeat(72));

check("catalogue is populated", ALL_COMPONENTS.length > 0, `${ALL_COMPONENTS.length} entries`);

/* ── PROVENANCE ───────────────────────────────────────────────────── */
const noSource = ALL_COMPONENTS.filter((e) => typeof e.source_url !== "string" || !e.source_url.trim());
check("every entry names a source URL", noSource.length === 0,
  noSource.length ? noSource.slice(0, 5).map((e) => `${e.category}/${e.model}`).join(", ")
                  : `${ALL_COMPONENTS.length} entries, all sourced`);

const badUrl = ALL_COMPONENTS.filter((e) => typeof e.source_url === "string" && !/^https?:\/\//.test(e.source_url));
check("every source URL is http(s)", badUrl.length === 0,
  badUrl.slice(0, 4).map((e) => `${e.model}: ${e.source_url}`).join(", "));

/* Categories name their part differently — a motor has a `model`, a radio link
   and a material have a `product`. Any one of them identifies the entry; none
   of them means the entry is anonymous. */
const identify = (e) => e.model ?? e.product ?? e.designation ?? e.name ?? null;
const noModel = ALL_COMPONENTS.filter((e) => !identify(e));
check("every entry is identifiable", noModel.length === 0,
  noModel.length ? noModel.slice(0, 5).map((e) => `${e.category}/${e.manufacturer}`).join(", ")
                 : `${ALL_COMPONENTS.length} entries named`);

check("declared entry count matches the data",
  (CATALOGUE_META?.total_entries ?? ALL_COMPONENTS.length) === ALL_COMPONENTS.length,
  `meta says ${CATALOGUE_META?.total_entries}, data has ${ALL_COMPONENTS.length}`);

/* No numeric field may be NaN or Infinity. A null is fine and means "not
   published"; a NaN is a parse that went wrong and will propagate silently. */
const badNum = [];
for (const e of ALL_COMPONENTS)
  for (const [k, v] of Object.entries(e))
    if (typeof v === "number" && !Number.isFinite(v)) badNum.push(`${e.model}.${k}`);
check("no numeric field is NaN or Infinity", badNum.length === 0, badNum.slice(0, 5).join(", "));

/* ── THE MOTOR CONVENTION TRAP ────────────────────────────────────── */
const CONVENTIONS = ["phaseToPhaseDelta", "phaseToPhaseWye", "phaseToPhase", "undeclared"];

const badConv = BLDC_MOTORS.filter((m) => !CONVENTIONS.includes(m.resistance_convention));
check("every motor carries a known resistance-convention classification",
  badConv.length === 0, badConv.map((m) => `${m.model}: ${m.resistance_convention}`).join(", "));

/* A published resistance must keep the vendor's own label. Without it the
   classification cannot be re-derived or challenged. */
const rNoLabel = BLDC_MOTORS.filter(
  (m) => m.internal_resistance_mohm != null && !m.internal_resistance_label_on_source);
check("a published resistance keeps the vendor's printed label",
  rNoLabel.length === 0, rNoLabel.map((m) => m.model).join(", "));

/* The load-bearing one: nothing may be modellable on an unstated convention. */
const modellableUndeclared = MODELLABLE_MOTORS.filter((m) => m.resistance_convention === "undeclared");
check("no motor is modellable on an UNDECLARED resistance convention",
  modellableUndeclared.length === 0,
  modellableUndeclared.map((m) => m.model).join(", "));

const modellableNoRef = MODELLABLE_MOTORS.filter((m) => m.no_load_current_measured_at_v == null);
check("every modellable motor states its no-load reference voltage",
  modellableNoRef.length === 0, modellableNoRef.map((m) => m.model).join(", "));

const modellableIncomplete = MODELLABLE_MOTORS.filter(
  (m) => !m.kv || m.internal_resistance_mohm == null || m.no_load_current_i0_a == null);
check("every modellable motor has the full Kv + R + I0 triple",
  modellableIncomplete.length === 0, modellableIncomplete.map((m) => m.model).join(", "));

/* The flag and the reasons must agree, in both directions: a motor is either
   modellable with no reason listed, or not modellable with at least one. */
const flagMismatch = BLDC_MOTORS.filter(
  (m) => m.first_principles_modellable === Boolean(m.not_modellable_because?.length));
check("modellable flag and its stated reasons agree",
  flagMismatch.length === 0, flagMismatch.map((m) => m.model).join(", "));

check("MODELLABLE_MOTORS is exactly the flagged subset",
  MODELLABLE_MOTORS.length === BLDC_MOTORS.filter((m) => m.first_principles_modellable).length);

/* ── WHAT THE SURVEY FOUND, PRINTED RATHER THAN ASSERTED ──────────── */
console.log("-".repeat(72));
for (const [name, entries] of Object.entries(CATEGORIES))
  console.log(`  ${name.padEnd(22)} ${String(entries.length).padStart(3)} entries`);

const byConv = {};
for (const m of BLDC_MOTORS) byConv[m.resistance_convention] = (byConv[m.resistance_convention] ?? 0) + 1;
console.log("-".repeat(72));
console.log("  motor resistance convention, as the vendor stated it:");
for (const [k, v] of Object.entries(byConv).sort((a, b) => b[1] - a[1]))
  console.log(`    ${k.padEnd(20)} ${v}`);
console.log(`  first-principles modellable from the datasheet alone: ` +
            `${MODELLABLE_MOTORS.length} of ${BLDC_MOTORS.length}`);
for (const m of MODELLABLE_MOTORS)
  console.log(`    ${m.manufacturer} ${m.model}`);

console.log("=".repeat(72));
console.log(fail === 0 ? `DRONE COMPONENT CATALOGUE GATE PASSED (${pass} checks)`
                       : `DRONE COMPONENT CATALOGUE GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
