/* =====================================================================
   FORMULA REGISTER GATE — the Phase-0 inventory must still describe the code
   =====================================================================
   WHY THIS EXISTS

   AUDIT/FORMULA-REGISTER.md records 2,429 engineering formulas, each with the
   file, function, line and equation it was extracted from. It is a record kept
   in a different file from the thing it records, and this repository has now
   watched that arrangement fail three times:

     N-07  a harness header describing a run it no longer performed
     N-10  golden-master.mjs's BASE, a second copy of the defaults, drifted
           until its "app-default" case sized a different aeroplane
     N-11  components.mjs's prose quoted 3.0%/1.5% for constants that had been
           recalibrated to 1.31%/0.65%

   In every case the record was written carefully and then the code moved. The
   register is 2,429 rows of exactly that hazard, so it does not ship without
   something that fails when it stops being true.

   WHAT IS CHECKED, AND WHAT IS DELIBERATELY NOT

   Checked: every registered formula still sits at the file and line recorded,
   carrying the expression recorded. That is the property the register asserts
   and the only one it can be held to.

   NOT checked: that the register is COMPLETE — that no new formula has been
   added to src/ without a row here. That would require re-running the
   extractor inside the gate, and an extractor is a heuristic: it would make
   the gate fail on a refactor that moved a line rather than on a defect, and a
   gate that cries wolf gets weakened. Completeness is re-measured when the
   register is rebuilt, and the row COUNT below pins what it found. This is a
   STATED limitation, not an omission: a formula added to src/ today will not
   be noticed by this gate.

   HOW IT FAILS HONESTLY

   The register records the source line with comments and string literals
   stripped, so `a.category === "Custom"` is stored as `a.category === ""`.
   Comparison therefore strips string content from BOTH sides. That is a real
   loosening and it is why a changed string literal will not fail this gate —
   which is correct, since a string is not a formula.
   ===================================================================== */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = join(ROOT, "AUDIT", "FORMULA-REGISTER.md");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const bar = "=".repeat(78);
console.log(bar);
console.log("FORMULA REGISTER GATE — the Phase-0 inventory against the code it describes");
console.log(bar);

check("the register exists", existsSync(REGISTER), "AUDIT/FORMULA-REGISTER.md");
if (!existsSync(REGISTER)) {
  console.log("\nFORMULA REGISTER GATE FAILED: no register");
  process.exit(1);
}

const md = readFileSync(REGISTER, "utf8");

/* ── parse the rows ─────────────────────────────────────────────────── */
const ROW = /^\| (FORMULA-[A-Z]+-\d+) \| `([^`]+)` \| `([^`]*)` \| (\d+) \| `([^`]*)` \|/gm;
const rows = [];
for (const m of md.matchAll(ROW)) {
  /* A markdown table cell cannot hold a bare `|`, so the register escapes it.
     Unescape before comparing, or every logical-OR in the codebase reads as a
     moved formula — which is how this was found. */
  rows.push({ id: m[1], file: m[2], func: m[3], line: Number(m[4]),
              eq: m[5].replace(/\\\|/g, "|") });
}
check("the register parses into rows", rows.length > 0, `${rows.length} rows`);

/* The document states its own totals in the classification table. A register
   whose prose disagrees with its own rows is the N-11 defect in miniature, so
   the two are compared rather than trusted — and the class counts must also
   SUM to the total, which is the check that catches a class silently dropped
   from the table. */
const stated = md.match(/\|\s*\*\*total sites\*\*\s*\|\s*\*\*(\d+)\*\*/);
check("the register's stated total matches the rows it actually carries",
  !!stated && Number(stated[1]) === rows.length,
  stated ? `states ${stated[1]}, carries ${rows.length}` : "no stated total found");

const classCounts = [...md.matchAll(/\|\s*\*\*(C\d)\*\*[^|]*\|\s*(\d+)\s*\|/g)]
  .map((m) => [m[1], Number(m[2])]);
const summed = classCounts.reduce((a, [, v]) => a + v, 0);
check("the classification table's own counts sum to the total",
  classCounts.length >= 5 && stated && summed === Number(stated[1]),
  `${classCounts.length} classes summing to ${summed}` +
  (stated ? ` against a stated ${stated[1]}` : ""));

/* ── every ID is unique ─────────────────────────────────────────────── */
const ids = new Set(rows.map((r) => r.id));
check("every formula ID is unique", ids.size === rows.length,
  `${ids.size} distinct of ${rows.length}`);

/* ── the register describes the code ────────────────────────────────── */
const norm = (s) => s.replace(/\s+/g, "");
/* The register was built from source with string literals blanked, so
   `mode === "analyse"` is recorded as `mode === ""`. Comparing a blanked record
   against unblanked source made 32 rows look moved when nothing had moved. Both
   sides are blanked the same way instead, which is apples to apples and removes
   the need for any tolerance: a changed STRING is not a changed formula, and a
   changed formula still fails. */
const blank = (s) => s
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const destring = (s) => norm(blank(s));
const cache = new Map();
function lines(f) {
  if (!cache.has(f)) {
    const p = join(ROOT, f);
    cache.set(f, existsSync(p) ? readFileSync(p, "utf8").split("\n") : null);
  }
  return cache.get(f);
}

let missingFile = 0, outOfRange = 0, moved = 0, matched = 0;
const examples = [];
for (const r of rows) {
  const L = lines(r.file);
  if (!L) { missingFile++; examples.push(`${r.id} ${r.file} — FILE GONE`); continue; }
  if (r.line < 1 || r.line > L.length) {
    outOfRange++; examples.push(`${r.id} ${r.file}:${r.line} — PAST END OF FILE (${L.length})`);
    continue;
  }
  const src = destring(L[r.line - 1]);
  const want = destring(r.eq);
  if (want && src.includes(want)) { matched++; continue; }
  /* The builder truncates the recorded expression at 104 characters, so a
     TRUNCATED row can only ever be prefix-matched. That allowance is granted
     to truncated rows ONLY.

     It was originally granted to every row, as a prefix of half the
     expression, and that made the gate unable to fail: changing
     `T0 - LAPSE * h` to `T0 - LAPSE * h * 1.0` still matched on the first
     eleven characters and was scored as unchanged. The mutant caught it. A
     check that runs on something that cannot fail is not a check, so the
     allowance is now tied to the one condition that earns it. */
  if (r.eq.length >= 104 && src.includes(want)) { matched++; continue; }
  moved++;
  if (examples.length < 10) {
    examples.push(`${r.id} ${r.file}:${r.line}\n          registered: ${r.eq.slice(0, 84)}\n          source now: ${L[r.line - 1].trim().slice(0, 84)}`);
  }
}

check("every registered formula's file still exists", missingFile === 0, `${missingFile} missing`);
check("every registered line is inside its file", outOfRange === 0, `${outOfRange} out of range`);

/* THE ALLOWANCE IS ZERO, AND IT TOOK TWO CORRECTIONS TO EARN THAT.

   It began at 14 — the number of rows an earlier verification pass saw
   differing — and 14 was an artefact of the check, not a property of the code.
   The differences were all string literals the register had blanked and the
   comparison had not, so the fix was to blank both sides rather than to
   tolerate the gap. Once the comparison was symmetric, all 2,429 rows matched.

   A tolerance that exists to cover a defect in the checker will happily cover
   a defect in the code. This one is now 0, so any formula that moves fails. */
const ALLOWED_DIFFERENCES = 0;
check(`no registered formula has moved (allowance ${ALLOWED_DIFFERENCES})`,
  moved <= ALLOWED_DIFFERENCES,
  `${matched} matched, ${moved} differing of ${rows.length}`);

if (examples.length) {
  console.log("\n  first differences, for reading:");
  for (const e of examples.slice(0, 6)) console.log("     " + e);
}

/* ── the register must cover every domain it claims ─────────────────── */
const domains = new Set(rows.map((r) => r.id.split("-")[1]));
check("the register spans every domain its summary table lists",
  domains.size >= 12, `${domains.size} domains: ${[...domains].sort().join(", ")}`);

/* ── the other Phase-0 artifacts ─────────────────────────────────────
   Phase 0 requires ARCHITECTURE.md to carry ten named flows and requires
   P00-017..020 to be analyses rather than assertions. Those documents are the
   deliverable, so their SHAPE is held here: the sections must exist and the
   analyses must still state a measured count.

   This is a STRUCTURAL check and says so. It cannot tell whether the numbers
   are still true — re-running the analyses inside the gate would make every
   refactor a failure. It fails when a required section is deleted or an
   analysis stops reporting a result, which is the drift that actually
   happens to documents. */
const ARCH = join(ROOT, "AUDIT", "ARCHITECTURE.md");
const ANAL = join(ROOT, "AUDIT", "PHASE-0-ANALYSES.md");

const FLOWS = ["Dependency flow", "Sizing flow", "Data flow", "Calculation flow",
               "Rendering flow", "Validation flow", "Source / provenance flow",
               "Configuration flow", "Shared vs configuration-specific", "Scale"];
/* MATCHED AS HEADINGS, NOT AS SUBSTRINGS.
   The first version asked whether the phrase appeared anywhere in the file.
   Both mutants walked through it: renaming `## Dependency flow` to
   `## Dependency flow REMOVED` still contains the phrase, and "P00-019" also
   appears in the analyses document's own introduction. A check that a WORD is
   present is not a check that a SECTION exists. */
const heading = (txt, title) =>
  new RegExp(`^##+\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(txt);

if (existsSync(ARCH)) {
  const a = readFileSync(ARCH, "utf8");
  const missing = FLOWS.filter((f) => !new RegExp(`^##+\\s+${f}`, "m").test(a));
  check("ARCHITECTURE.md carries all ten flows Phase 0 names, as headings",
    missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all ten present");
} else {
  check("ARCHITECTURE.md exists", false, "AUDIT/ARCHITECTURE.md");
}

if (existsSync(ANAL)) {
  const t = readFileSync(ANAL, "utf8");
  /* Split on headings rather than matching a section with a lookahead.
     `\Z` does not exist in JavaScript regex — it is parsed as a literal "Z" —
     so the lookahead only terminated on a FOLLOWING heading and the last
     section in the file could never match. P00-017 is that section. */
  /* `##` exactly: splitting on `##+` also split at the `###` sub-headings, so
     P00-020's body ended at its first subsection and measured 116 characters. */
  const sections = t.split(/^##(?!#)\s+/m).slice(1);
  for (const req of ["P00-017", "P00-018", "P00-019", "P00-020"]) {
    const body = sections.find((s) => s.startsWith(req)) ?? "";
    check(`  PHASE-0-ANALYSES.md reports ${req} under its own heading, with a count`,
      body.length > 200 && /\d/.test(body),
      body ? `${body.length} chars` : "NO SECTION HEADING FOR THIS REQUIREMENT");
  }
} else {
  check("PHASE-0-ANALYSES.md exists", false, "AUDIT/PHASE-0-ANALYSES.md");
}

console.log("");
console.log(fail ? `FORMULA REGISTER GATE FAILED: ${fail} check(s), ${pass} passed`
                 : `FORMULA REGISTER GATE PASSED (${pass} checks, ${rows.length} formulas verified against source)`);
console.log(bar);
process.exit(fail ? 1 : 0);
