/* =====================================================================
   UNITS — every factor exact, and no unit quietly unhandled
   =====================================================================
   A unit converter is the easiest place in a tool like this to be
   confidently wrong: the number changes, the label changes, and nothing
   looks broken. So the factors are checked against their DEFINITIONS
   rather than against each other, and the set of units the interface
   actually displays is checked against the table, so a new one cannot
   appear unhandled and unnoticed.

   THE FACTORS ARE EXACT, NOT APPROXIMATE. The pound, the foot, the inch
   and the nautical mile are all DEFINED in SI terms — 0.45359237 kg,
   0.3048 m, 25.4 mm, 1852 m — so every conversion here closes to machine
   precision and is checked to 1e-12. A tolerance of "about a percent"
   would hide a transposed digit.

   ROUND-TRIPPING IS THE SHARPEST TEST: convert to the other system and
   back, and the original number must return. That catches a reciprocal
   used the wrong way round, which is the single most likely error and
   the one that looks most plausible on screen.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { UNIT_TABLE, NO_CONVERT, convertDisplay, isKnownUnit } from "../src/lib/units.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("UNITS GATE");
console.log("=".repeat(78));

/* ── 1. THE DEFINED FACTORS ─────────────────────────────────────────── */
console.log("\n-- each factor against the definition of the unit --");
const DEFINED = [
  ["kg", "lb", 1 / 0.45359237, "the pound is DEFINED as 0.45359237 kg"],
  ["m", "ft", 1 / 0.3048, "the foot is DEFINED as 0.3048 m"],
  ["mm", "in", 1 / 25.4, "the inch is DEFINED as 25.4 mm"],
  ["km", "nm", 1 / 1.852, "the nautical mile is DEFINED as 1852 m"],
  ["m²", "ft²", 1 / (0.3048 * 0.3048), "area follows the foot, squared"],
  ["m/s", "kt", 3600 / 1852, "a knot is one nautical mile per hour"],
];
for (const [from, to, k, why] of DEFINED) {
  const spec = UNIT_TABLE[from];
  check(!!spec && spec.to === to && near(spec.k, k, 1e-12),
    `${from} -> ${to} is exact`, `${spec ? spec.k : "missing"} against ${k} — ${why}`);
}

/* A worked case a reader can check by hand, so the table is not just
   self-consistent but produces the number a person expects. */
/* Two decimals in, two decimals out: the displayed precision follows the
   value as written, so a mass shown as whole kg shows as whole lb. */
const t = convertDisplay("1000.00", "kg", "IMP");
/* Tolerance is half the last DISPLAYED digit, not machine epsilon: the
   exact value is 2204.62262 and two decimals is what the reader sees. */
check(t.unit === "lb" && near(Number(t.value), 2204.62262, 0.005),
  "1000.00 kg displays as 2204.62 lb", `${t.value} ${t.unit} (exact 2204.62262)`);
const whole = convertDisplay("1000", "kg", "IMP");
check(whole.value === "2205",
  "and a whole number stays whole rather than growing decimals", `${whole.value} lb`);
const f = convertDisplay("100.0", "m", "IMP");
check(f.unit === "ft" && near(Number(f.value), 328.1, 0.05),
  "100.0 m displays as 328.1 ft", `${f.value} ${f.unit}`);

/* ── 2. ROUND TRIP ──────────────────────────────────────────────────── */
console.log("\n-- every pair round-trips, which a flipped reciprocal cannot --");
const missing = Object.entries(UNIT_TABLE).filter(([, s2]) => !UNIT_TABLE[s2.to]);
check(missing.length === 0, "every counterpart is itself a unit in the table",
  missing.map(([u, s2]) => `${u} -> ${s2.to}`).join(", ") || "no dangling counterparts");

/* Round-trip only TRUE inverse pairs. kN -> lbf -> N is deliberate and
   correct: the imperial side has no kilo-prefix in use, so the return
   trip lands on the base SI unit. The VALUE is right; only the prefix
   differs, and requiring symmetry there would force a fake "klbf". */
let bad = [];
for (const [unit, spec] of Object.entries(UNIT_TABLE)) {
  const back = UNIT_TABLE[spec.to];
  if (back.to !== unit) continue;                    // prefix pair, checked below
  if (!near(spec.k * back.k, 1, 1e-12)) bad.push(`${unit}<->${spec.to}: ${spec.k * back.k}`);
}
check(bad.length === 0, "k(a->b) * k(b->a) = 1 for every true inverse pair",
  bad.slice(0, 3).join(" | ") || "a flipped reciprocal cannot survive this");

const prefix = Object.entries(UNIT_TABLE).filter(([u, s2]) => UNIT_TABLE[s2.to].to !== u);
const prefixBad = prefix.filter(([u, s2]) => {
  const back = UNIT_TABLE[s2.to];
  const ratio = s2.k * back.k;                       // must be a clean power of ten
  return !near(Math.log10(ratio) - Math.round(Math.log10(ratio)), 0, 1e-9);
});
check(prefixBad.length === 0,
  "and every prefix pair differs from unity by an exact power of ten",
  prefix.map(([u, s2]) => `${u}->${s2.to}`).join(", ") || "none");

const sysBad = Object.entries(UNIT_TABLE).filter(([, s]) => !["SI", "IMP"].includes(s.system));
check(sysBad.length === 0, "every unit declares which system it belongs to",
  sysBad.map(([u]) => u).join(", ") || "all declared");

/* ── 3. IT CONVERTS BOTH WAYS ───────────────────────────────────────── */
console.log("\n-- both directions, because this interface already mixes them --");
const imp = convertDisplay("120.5", "kt", "SI");
check(imp.unit === "m/s" && near(Number(imp.value), 62.0, 0.1),
  "an IMPERIAL source quantity converts when SI is asked for",
  `120.5 kt -> ${imp.value} ${imp.unit} — the aircraft studio publishes speeds in knots`);
const same = convertDisplay("120.5", "kt", "IMP");
check(same.value === "120.5" && same.unit === "kt",
  "and is left exactly alone when it is already in the asked-for system");

/* ── 4. THE SAFE FAILURE ────────────────────────────────────────────── */
console.log("\n-- what it does when it does not know --");
const dash = convertDisplay("—", "kg", "IMP");
check(dash.value === "—" && dash.unit === "kg",
  "a non-numeric placeholder is never converted", "an em dash stays an em dash");
const unknown = convertDisplay("42.0", "furlongs", "IMP");
check(unknown.value === "42.0" && unknown.unit === "furlongs",
  "an UNKNOWN unit passes through with its label intact",
  "a value that fails to convert is a small annoyance; one converted with "
  + "the wrong factor and labelled as correct is the thing to avoid");
const grouped = convertDisplay("78,797", "kg", "IMP");
check(/,/.test(grouped.value) && near(Number(grouped.value.replace(/,/g, "")), 173717, 1),
  "a grouped number keeps its separator", `78,797 kg -> ${grouped.value} lb`);
const dp = convertDisplay("3.00", "m", "IMP");
check(decimals(dp.value) === 2, "and the original number of decimals is preserved",
  `3.00 m -> ${dp.value} ft`);
function decimals(s) { const m = /\.(\d+)/.exec(String(s)); return m ? m[1].length : 0; }

/* ── 5. NOTHING THE INTERFACE SHOWS IS UNHANDLED ────────────────────── */
console.log("\n-- every unit the studios display is accounted for --");
const roots = ["src/classes/aircraft", "src/classes/drone", "src/classes"];
const seen = new Map();
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.jsx?$/.test(e)) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/unit="([^"]*)"/g)) {
      if (!seen.has(m[1])) seen.set(m[1], p);
    }
  }
};
for (const r of roots) { try { walk(r); } catch { /* absent in some builds */ } }

const unhandled = [...seen.entries()].filter(([u]) => !isKnownUnit(u));
check(unhandled.length === 0,
  `all ${seen.size} literal unit strings are in the table or declared not-converted`,
  unhandled.length
    ? unhandled.map(([u, f]) => `"${u}" in ${f}`).slice(0, 5).join(" | ")
    : `${Object.keys(UNIT_TABLE).length} convertible, ${Object.keys(NO_CONVERT).length} deliberately not`);

check(Object.values(NO_CONVERT).every((why) => typeof why === "string" && why.length > 3),
  "and every not-converted unit says WHY, so it reads as a decision",
  "not an omission nobody noticed");

const overlap = Object.keys(UNIT_TABLE).filter((u) => u in NO_CONVERT);
check(overlap.length === 0, "no unit is both convertible and not-converted", overlap.join(", ") || "disjoint");

/* ── 6. THE SECOND LINE OF A TILE IS A DISPLAY TOO ──────────────────── */
console.log("\n-- no headline figure sits above a sub-line in the other system --");

/* Kpi converts its own value/unit pair, so the toggle needed no change
   at the call sites. Its `sub` line had no such route: it is free text,
   and a span written as `${fmt(spanM, 1)} m` went on saying metres while
   the figure above it switched to feet. The tile then read "6.56 ft"
   over "commanded 2.00 m" — two numbers side by side in two systems,
   which is worse than showing one system badly.

   This scans for the SHAPE of that bug: an interpolated value followed
   immediately by a convertible unit, inside a `sub` template literal.
   The fix is the Q component, which converts like Kpi does.

   WHY THIS IS A SOURCE SCAN AND NOT A CONVERTER. A pass over the
   finished text would find the `g` in "at 3.75 g ultimate" — a LOAD
   FACTOR, not a mass — and turn it into ounces. Only the call site knows
   which `g` it wrote, so the exemptions below are named, with the reason,
   exactly as NO_CONVERT names its own. */
const SUB_EXEMPT = [
  { needle: "g ultimate",
    why: "load factor in g, not grams — converting it to ounces would be nonsense" },
  { needle: 'in "',
    why: 'the English preposition in `the N in "stratum"`, not inches' },
];

/* Longest token first, so "m/s" is not read as "m" and "kg/m²" is not
   read as "kg". A unit followed by / · or a superscript is part of a
   larger unit that this table does not convert, so it is not the bug. */
const TOKENS = Object.keys(UNIT_TABLE).sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const RAW_IN_SUB = new RegExp(`\\}\\s*(?:${TOKENS})(?![A-Za-z0-9/·²³])`, "g");

const offenders = [];
const scanSubs = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { scanSubs(p); continue; }
    if (!/\.jsx$/.test(e)) continue;
    const src = readFileSync(p, "utf8");
    src.split("\n").forEach((line, i) => {
      if (!/sub=\{/.test(line)) return;
      for (const lit of line.matchAll(/`[^`]*`/g)) {
        const text = lit[0];
        if (SUB_EXEMPT.some((x) => text.includes(x.needle))) continue;
        const hit = text.match(RAW_IN_SUB);
        if (hit) offenders.push(`${p}:${i + 1} ${hit[0].trim()}`);
      }
    });
  }
};
for (const r of roots) { try { scanSubs(r); } catch { /* absent in some builds */ } }

check(offenders.length === 0,
  "every quantity in a Kpi sub-line converts with the toggle, or is exempt with a reason",
  offenders.length ? offenders.slice(0, 5).join(" | ")
    : `${SUB_EXEMPT.length} named exemptions — ${SUB_EXEMPT.map((x) => x.why).join("; ")}`);

const kit = readFileSync("src/classes/ui-kit.jsx", "utf8");
check(/export function Q\(/.test(kit) && /convertDisplay\(v, u, system\)/.test(kit),
  "and the component they use converts through the same table as Kpi",
  "Q takes an already-formatted value and a named unit, so the author's decimals survive");

console.log("");
console.log(fails.length ? `UNITS GATE FAILED: ${fails.length} check(s)`
                         : `UNITS GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
