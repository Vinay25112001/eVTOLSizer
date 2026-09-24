/* =====================================================================
   PHYSICAL CONSTANTS — one value per constant, everywhere in the tree
   =====================================================================
   This gate exists because gravity had two values at once, and nothing
   in the repository could see it.

   src/engine/constants.js declared G0 = 9.81 while ten other modules
   wrote 9.80665 in their own preambles, and more than twenty further
   sites — the engine's Raymer surface weights, the report exporter's
   printed equations, the BEM, V-n, convergence, V-tail and regulatory
   panels, and App.jsx's own barometric density — wrote 9.81 inline. The
   split ran INSIDE a single class: classes/transport/atmosphere.js
   imports G0 for its barometric formula while size.js, takeoff.js,
   landing.js and mission.js use 9.80665, so one aeroplane was sized
   under two gravities depending on which module you happened to be in.

   NO EXISTING GATE COULD HAVE CAUGHT IT, and it is worth saying why,
   because it is the same shape as the defect validation/units.mjs was
   extended for. Every harness here scores the engine's OUTPUT against a
   reference. A constant that is wrong by 0.035% moves every output by
   0.035%, which is a hundred times below the tolerance of the loosest
   comparison in this repository and two hundred times below the tool's
   own ~9% mean absolute error. Nothing that grades a number against a
   published number can resolve it. The only way to see it is to stop
   looking at the answers and read the SOURCE, and require that a
   quantity written in twenty places be written the same way in all
   twenty. That is what this file does.

   THE RULE: a literal that is in the immediate neighbourhood of a
   physical constant must BE that constant, exactly, or be listed below
   with a reason. The neighbourhood is deliberately narrow — for gravity
   it is 9.805 to 9.815, not "about ten" — because a wide band collects
   percentages, aspect ratios and data points that merely happen to land
   near the value, and a gate that cries wolf gets an ever-growing
   allowlist until it means nothing. Narrow and exact beats wide and
   negotiable.

   WHERE THE BAND CANNOT REACH, AND WHY IT IS NOT WIDENED. The other
   value people write for g is a bare 9.8, and 9.8 is not a number this
   gate can claim on sight: the first version of this file banded it in
   and immediately hit four sites that are nothing to do with gravity —
   an MTOW error of 9.8 per cent, a battery's 9.8 A continuous discharge,
   and two comments quoting the multicopter's 9.8 degree glide angle. A
   band that collects those is a band somebody eventually silences. So
   9.8 is pursued by CONTEXT instead, in two narrower passes that cost
   nothing in false positives: an identifier that MEANS gravity must hold
   an accepted value whatever it holds, and a bare 9.8 used as a
   MULTIPLIER OR DIVISOR in live code is treated as gravity, because that
   is what multiplying a mass by 9.8 is. A bare 9.8 sitting in a data
   table or a sentence is left alone, and this gate does not pretend
   otherwise: that is a stated limit, not a silent one.

   Run: node validation/constants.mjs
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { G0 } from "../src/engine/constants.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};

console.log("PHYSICAL CONSTANTS GATE");
console.log("=".repeat(78));

/* ── 1. THE VALUE ITSELF, AGAINST THE DOCUMENTS ─────────────────────── */
/* Standard gravity is DEFINED, not measured, so this is an equality and
   not a tolerance. The sources are quoted in src/engine/constants.js:
   NACA TR-824's notation list, NDARC Theory's constants table, Loftin
   RP-1060 Table 1.II, and the ISA aerostatic equation as Airbus writes
   it in Getting to Grips with Aircraft Performance s1.1. */
const G_SI = 9.80665;
/* The imperial value is NOT an independent number to be looked up — it
   is the same constant through the DEFINED foot, 0.3048 m exactly. NDARC
   publishes 32.17405 and this reproduces it, which is the check. */
const G_FT = 32.17405;

console.log("\n-- the value, against the documents that define it --");
check(G0 === G_SI, "G0 is standard gravity exactly",
  `${G0} against ${G_SI} — defined by the 3rd CGPM (1901) and stated as ` +
  `"Standard acceleration of gravity = 9.80665 m/s2" in NACA TR-824`);
check(Math.abs(G_SI / 0.3048 - G_FT) < 5e-6,
  "the imperial value is the same constant through the defined foot",
  `${G_SI} / 0.3048 = ${(G_SI / 0.3048).toFixed(7)} against NDARC's published ${G_FT}`);

/* ── 2. THE NEIGHBOURHOODS ──────────────────────────────────────────── */
const BANDS = [
  { name: "gravity, SI",       lo: 9.805,  hi: 9.815, exact: G_SI, unit: "m/s^2" },
  { name: "gravity, imperial", lo: 32.15,  hi: 32.20, exact: G_FT, unit: "ft/s^2" },
];

/* EVERY EXCEPTION CARRIES A REASON. An entry here is a claim that a
   literal in the band is not this constant, or is this constant written
   by somebody else and reproduced deliberately. */
const ALLOWED = [
  {
    file: "src/classes/trainer/weights.js", value: "32.2",
    why: "GASP's gust mass ratio as Aviary implements it (design_load.py). This " +
         "module reproduces a published method and validation/trainer.mjs scores it " +
         "against that method's own results, so the literal belongs to the source, " +
         "not to us. NOT VERIFIED against the primary — design_load.py is not " +
         "vendored in the corpus and the 32.2 could not be read back from it, so it " +
         "is left exactly as found rather than silently corrected to 32.17405.",
  },
  {
    file: "src/lib/units.js", value: "9.807",
    why: "prose, not arithmetic: a comment recording that a bad round-trip came back " +
         "'a factor of 9.807 out'. It describes the SIZE of a historical error and " +
         "writing it to six decimals would claim a precision the observation never had.",
  },
  {
    file: "src/engine/constants.js", value: "9.81",
    why: "the header narrates the defect this gate was written for, and has to be " +
         "able to name the wrong value in order to explain the right one.",
    /* AND ONLY THERE. Without this the exception would excuse the very line it
       is describing: an allowlist keyed on (file, value) alone would let
       G0 = 9.81 back into the one file the reader trusts most. The declaration
       is never excused, only the prose about it. */
    notOnLineMatching: /export\s+const\s+G0/,
  },
];
const excused = (file, value, lineText) =>
  ALLOWED.some((a) =>
    a.file === file.replace(/\\/g, "/") &&
    a.value === value &&
    !(a.notOnLineMatching && a.notOnLineMatching.test(lineText)));

/* THE HARNESSES ARE SCANNED TOO, and that is not padding. The first
   version of this gate read src/ only, and the full suite then failed in
   validation/: transport-mission.mjs re-derived the tropopause pressure
   with 9.81 written into the HARNESS, reg-applicability.mjs mirrored the
   regulatory panel's gravity with its own 9.81, and identities.mjs — the
   harness whose entire subject is relations that must hold BY DEFINITION
   — kept a private copy of the constants block declaring G0 = 9.81. That
   last one is the worst of the three and the reason this section exists:
   it checks its relations to 0.2%, so a gravity that is wrong by 0.035%
   could never have failed it. A check written against the wrong constant
   does not report the defect, it CERTIFIES it.

   identities.mjs restates the constants rather than importing them on
   purpose — a harness that imports the value it is checking proves only
   that the file is self-consistent — so the fix there is to restate them
   correctly, and this gate is what keeps a deliberate copy from drifting
   into an accidental one. */
const ROOTS = ["src", "validation"];

/* Two files are skipped whole, because their subject IS the wrong value
   and they have to be able to write it down. Neither computes anything:
   this gate holds the defect's history in its own prose and needs 9.81,
   9.8 and 32.2 as fixtures for its positive controls, and report.mjs
   carries the paragraph describing all of it into VALIDATION.md. */
const SKIP = [
  ["validation/constants.mjs", "this gate — its controls are made of the wrong values"],
  ["validation/report.mjs",    "prose only: the harness description that explains this gate"],
];
const skipped = (rel) => SKIP.some(([f]) => f === rel);

/* A number, not part of a longer number. Strings are scanned along with
   code on purpose: the report exporter prints its equations as LaTeX, so
   a displayed "\times 9.81" beside a computation that used 9.80665 is a
   defect in the same way a wrong coefficient is — the reader is shown an
   equation the tool did not solve. */
const LITERAL = /(?<![\d.\w])(\d+(?:\.\d+)?)(?![\d.])/g;

/* The 1-based line number of an offset, and the whole line it sits on —
   the allowlist needs the text as well as the number, because one of the
   exceptions below is allowed in prose and forbidden in a declaration. */
const NL = String.fromCharCode(10);
function lineAt(text, index) {
  const lines = text.split(NL);
  const n = text.slice(0, index).split(NL).length;
  return { n, text: lines[n - 1] ?? "" };
}

function scan(text, file) {
  const hits = [];
  for (const m of text.matchAll(LITERAL)) {
    const raw = m[1];
    const v = Number(raw);
    for (const b of BANDS) {
      if (v < b.lo || v > b.hi || v === b.exact) continue;
      const at = lineAt(text, m.index);
      hits.push({ file, line: at.n, raw, band: b, lineText: at.text });
    }
  }
  return hits;
}

/* ── 3. POSITIVE CONTROL, BEFORE THE RESULT IS TRUSTED ──────────────── */
/* A scanner that finds nothing and a scanner that looks at nothing print
   the same thing. One of the unit scanners written during this audit was
   itself broken and reported a clean tree, so no probe in this repository
   gets believed until it has been shown to fire. */
console.log("\n-- positive control: the scanner is shown to fire --");
const MUST_FIRE = [
  ["const G = 9.81;",                  "the value that was actually there"],
  ["const G_FT = 32.2;",               "an imperial gravity rounded off"],
  ["eq('W \\\\times 9.807 = ')",       "a wrong g inside a displayed equation"],
];
for (const [snippet, why] of MUST_FIRE) {
  check(scan(snippet, "control").length > 0, `fires on: ${snippet.trim()}`, why);
}
const MUST_NOT_FIRE =
  "const G = 9.80665, G_FT = 32.17405;\n" +
  "const oewErrPct = 9.78, powerLoading = 9.85, piSquared = 9.8696;\n" +
  "const dischargeA = 9.8, mtowErrPct = 9.8;\n" +
  "const noseFrac = 32.1;  // per cent of body length, and a 9.8 deg glide angle\n";
check(scan(MUST_NOT_FIRE, "control").length === 0,
  "and stays silent on the correct values and on near neighbours that are not gravity",
  "9.78, 9.85 and a bare 9.8 are data, 9.8696 is pi^2, 32.1 is a percentage — a band " +
  "wide enough to catch these would be a band nobody could keep clean");

/* ── 4. THE TREE ────────────────────────────────────────────────────── */
console.log("\n-- every source file in src/ --");
const offenders = [];
let filesRead = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(jsx?|mjs)$/.test(e)) continue;
    const rel = p.replace(/\\/g, "/");
    if (skipped(rel)) continue;
    filesRead++;
    for (const h of scan(readFileSync(p, "utf8"), rel)) {
      if (!excused(h.file, h.raw, h.lineText)) offenders.push(h);
    }
  }
};
for (const r of ROOTS) walk(r);

check(filesRead > 100, "the scan actually read the tree",
  `${filesRead} source files — a passing result from an empty walk is not a result`);

check(offenders.length === 0,
  "no source file writes a physical constant with a value of its own",
  offenders.length
    ? offenders.slice(0, 12).map((o) => `${o.file}:${o.line} ${o.raw} (${o.band.name})`).join(" | ")
    : `${ALLOWED.length} named exceptions, each with a reason: ` +
      ALLOWED.map((a) => `${a.file} ${a.value}`).join("; "));

/* ── 5. GRAVITY-NAMED BINDINGS ──────────────────────────────────────── */
/* The band catches a value that is nearly right. This catches a value
   that is nowhere near right but is bound to a name that means gravity,
   which the band would sail straight past. A bare g or G is only
   considered when the value is already in the region where it could only
   have been meant as gravity, so that an unrelated one-letter variable
   holding a 0 or a 2 is not dragged in. */
console.log("\n-- identifiers that mean gravity --");
const NAMED = /\b(G0|g0|gn|GRAVITY|gravity|G_FT|g_ft|G|g)\s*=\s*(\d+(?:\.\d+)?)\b/g;
const PLAUSIBLY_G = (v) => (v >= 8 && v <= 12) || (v >= 30 && v <= 35);
const misnamed = [];
const walkNames = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walkNames(p); continue; }
    if (!/\.(jsx?|mjs)$/.test(e)) continue;
    const rel = p.replace(/\\/g, "/");
    if (skipped(rel)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(NAMED)) {
      const name = m[1], v = Number(m[2]);
      const bare = name === "G" || name === "g";
      if (bare && !PLAUSIBLY_G(v)) continue;
      if (v === G_SI || v === G_FT) continue;
      if (excused(rel, m[2], lineAt(text, m.index).text)) continue;
      misnamed.push(`${rel} ${name} = ${m[2]}`);
    }
  }
};
for (const r of ROOTS) walkNames(r);
check(misnamed.length === 0,
  "every identifier that means gravity holds one of the two accepted values",
  misnamed.length ? misnamed.slice(0, 8).join(" | ")
                  : "9.80665 m/s^2 or 32.17405 ft/s^2, and nothing else");

/* ── 6. A BARE 9.8 DOING ARITHMETIC ─────────────────────────────────── */
/* The band will not claim a bare 9.8, because 9.8 is also an amperage, a
   percentage and a glide angle in this tree. But multiplying or dividing
   by 9.8 is not ambiguous — in a sizing tool that is a weight being made
   from a mass, or the reverse. Comments and their contents are removed
   first, so a sentence mentioning a 9.8 degree descent is not arithmetic. */
console.log("\n-- a bare 9.8 used as a multiplier or divisor --");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const AS_OPERAND = /(?:[*/]\s*9\.8(?![\d])|(?<![\d.])9\.8(?![\d])\s*[*/])/;
const scanOperand = (text) => {
  const out = [];
  stripComments(text).split("\n").forEach((ln, i) => {
    if (AS_OPERAND.test(ln)) out.push(i + 1);
  });
  return out;
};
check(scanOperand("const W = m * 9.8;").length === 1 &&
      scanOperand("const m = W / 9.8;").length === 1,
  "control: it fires on a mass multiplied or divided by 9.8",
  "which is the one use of a bare 9.8 that can only be gravity");
check(scanOperand("const a = 9.8; // 9.8 deg glide\nconst dischargeA = 9.8;\n").length === 0,
  "control: and not on a bare 9.8 that is data or prose",
  "a value assigned, tabulated or described is left to the band and the name passes");

const operandHits = [];
const walkOperands = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walkOperands(p); continue; }
    if (!/\.(jsx?|mjs)$/.test(e)) continue;
    const rel = p.replace(/\\/g, "/");
    if (skipped(rel)) continue;
    for (const ln of scanOperand(readFileSync(p, "utf8"))) operandHits.push(`${rel}:${ln}`);
  }
};
for (const r of ROOTS) walkOperands(r);
check(operandHits.length === 0,
  "nothing in src/ or validation/ multiplies or divides by a bare 9.8",
  operandHits.length ? operandHits.slice(0, 8).join(" | ")
                     : "a mass becomes a weight through G0 or through 9.80665 written out, nowhere else");

console.log("");
console.log(fails.length ? `CONSTANTS GATE FAILED: ${fails.length} check(s)`
                         : `CONSTANTS GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
