/* THE RUNNER AND THE REPORT ARE TWO MANIFESTS, AND NOTHING HELD THEM TOGETHER.
   ===========================================================================
   `npm test` lists the harnesses it runs in package.json. The report describes
   the harnesses in harness-manifest.mjs. They are maintained by hand,
   independently, and they have drifted three times:

     - once when the report's list was "FOUND STALE" and a third of the
       evidence was missing (the comment above that list still records it);
     - again when the drone engine landed, which the same comment anticipated;
     - and again with phase2-ledger.mjs, which the commit that wrote it wired
       into `npm test` while never touching report.mjs. The Phase-2 ledger gate
       therefore ran in CI for nine commits while the published VALIDATION.md
       described neither the gate nor a single one of its verdicts.

   The opposite direction had drifted too, and nothing could see it:
   general-arrangement.mjs was written together with its entry in the report's
   list and never added to the test script, so the sentence the report prints
   above its own table — that every harness there is gated in `npm test` and
   run in CI on every push — was false for one row since the day it landed.

   A report that omits evidence understates the verification factor it scores,
   which is the argument the paper in this repository is built on. So the two
   manifests are now held to each other HERE, mechanically.

   WHY THIS IMPORTS THE LIST RATHER THAN READING report.mjs AS TEXT. The first
   version of this gate parsed report.mjs with a line-anchored pattern and
   UNDERCOUNTED BY TWO, because two entries are written on the same source line
   as the entry before them. It reported 74 where the report itself ran 76, and
   its pinned population was wrong by the same two. A guard that silently
   miscounts the thing it guards is the defect it exists to prevent. So the
   list was moved into harness-manifest.mjs — pure data, no harness execution —
   and both the report and this gate now import the same array. report.mjs
   itself cannot be imported here: it runs every harness in the list at module
   load, which is the whole suite.

   WHAT THIS GATE DOES AND DOES NOT ASSERT, stated plainly because the
   difference is the whole design:

   1. Harnesses classified REPORTABLE must appear in the report. The
      classification is deliberately NARROW — the gates that hold an AUDIT/
      artefact to the code it describes — because widening it would mean
      writing a description for every unlisted harness, which is a refactor
      and not a guard.

   2. Every harness the report describes must actually be run by `npm test`.

   3. The remaining runner-only harnesses are PINNED BY COUNT, not classified
      and not excused individually. A population count rather than an
      allowlist, for the reason constants.mjs already records in this tree: an
      allowlist keyed on a filename excuses the very line it describes, and one
      that grows stops being read. The pin means a NEW omission fails even
      though the existing ones are known and unremediated — and it is checked
      from BELOW as well, so closing part of the gap without lowering the
      number fails rather than banking slack. */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HARNESSES } from "./harness-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r/g, "");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const bar = "=".repeat(78);
console.log(bar);
console.log("REPORT MANIFEST GATE — the runner's harness list against the report's");
console.log(bar);

/* ── the two manifests ───────────────────────────────────────────────── */
console.log("\n-- 1. both manifests parse, and parse into something --");

const pkg = JSON.parse(read("package.json"));
const testCmd = pkg.scripts?.test ?? "";
const runnerSeq = [...testCmd.matchAll(/node\s+validation\/([a-z0-9-]+\.mjs)/g)].map((m) => m[1]);
const runner = new Set(runnerSeq);

const reportSeq = HARNESSES.map(([f]) => f);
const report = new Set(reportSeq);

/* Not a harness: the shared data module both sides import, and this gate's
   own reason for existing. Named so it is not mistaken for an omission. */
const NOT_A_HARNESS = new Set(["harness-manifest.mjs"]);
const onDisk = new Set(readdirSync(join(ROOT, "validation"))
  .filter((f) => f.endsWith(".mjs") && !NOT_A_HARNESS.has(f)));

check("the npm test script parses into harness invocations", runnerSeq.length > 50,
  `${runnerSeq.length} invocations, ${runner.size} distinct`);
check("the shared harness manifest is a well-formed list of [file, proves]",
  HARNESSES.length > 50 && HARNESSES.every((e) => Array.isArray(e) && e.length === 2
    && typeof e[0] === "string" && /^[a-z0-9-]+\.mjs$/.test(e[0])
    && typeof e[1] === "string" && e[1].length > 20),
  `${HARNESSES.length} entries, ${report.size} distinct`);
check("neither manifest lists the same harness twice",
  runnerSeq.length - runner.size <= 1 && reportSeq.length === report.size,
  `runner repeats ${runnerSeq.length - runner.size} (golden-master runs twice, by design), `
  + `report repeats ${reportSeq.length - report.size}`);

/* THE MANIFEST MUST STAY PURE DATA, and this is not housekeeping — it closes a
   hole this file's own existence opened. constants.mjs skips three files WHOLE
   because their subject is the wrong value and they must be able to write it
   down; harness-manifest.mjs is the third, because the descriptions of
   constants.mjs and unit-system.mjs quote the wrong gravities and the wrong
   gas constant as the defects they record. A whole-file skip means a REAL
   declaration in there would not be seen either — measured: appending a
   gravity declaration to that file leaves constants.mjs passing.
   constants.mjs's own header warns about precisely this, that an allowlist
   keyed on a file would have let the wrong gravity back into the one file a
   reader trusts most. So the manifest is held to carrying nothing BUT the
   list: one export, no imports, and no other declaration of any kind.

   This comment deliberately NAMES no numeral. Writing one here would make
   THIS file a fourth candidate for that whole-file skip, and this file
   contains logic rather than prose, so it has to stay scannable. That is not
   a hypothetical: the first draft of this paragraph quoted the values and
   constants.mjs failed on it, which is the gate behaving exactly as designed. */
const manifestSrc = read("validation/harness-manifest.mjs");
const exportLines = [...manifestSrc.matchAll(/^export\s+(?:const|let|var|function|class|default)\s+(\w+)?/gm)]
  .map((m) => m[1] ?? "default");
const declLines = [...manifestSrc.matchAll(/^(?:const|let|var|function|class)\s+(\w+)/gm)].map((m) => m[1]);
const importLines = [...manifestSrc.matchAll(/^\s*import\s/gm)];
check("the shared manifest exports HARNESSES and nothing else",
  exportLines.length === 1 && exportLines[0] === "HARNESSES",
  exportLines.length ? `exports: ${exportLines.join(", ")}` : "no export found");
check("the shared manifest declares nothing besides the list, so the whole-file skip in constants.mjs cannot hide a constant",
  declLines.length === 0 && importLines.length === 0,
  `${declLines.length} other declaration(s)${declLines.length ? ": " + declLines.join(", ") : ""}, `
  + `${importLines.length} import(s) — it must execute nothing when imported`);

/* A manifest that names a harness nobody can run is worse than one that omits
   a real gate, because it reports a pass that never happened. */
const ghostRunner = runnerSeq.filter((f) => !onDisk.has(f));
const ghostReport = reportSeq.filter((f) => !onDisk.has(f));
check("every harness the runner names exists on disk", ghostRunner.length === 0,
  ghostRunner.length ? ghostRunner.join(", ") : `all ${runner.size} present`);
check("every harness the report names exists on disk", ghostReport.length === 0,
  ghostReport.length ? ghostReport.join(", ") : `all ${report.size} present`);

/* ── 2. the reportable classification ────────────────────────────────── */
console.log("\n-- 2. a harness that holds an AUDIT/ artefact to the code must be reported --");

/* NARROW BY CHOICE. These are the gates whose whole purpose is to stop a
   record in AUDIT/ from drifting away from the code it describes. If one is
   missing from the report, the report is silent about the very machinery that
   makes the audit trustworthy — which is what happened to phase2-ledger.mjs.
   Each entry says which record it protects. */
const REPORTABLE = [
  ["formula-register.mjs", "holds AUDIT/FORMULA-REGISTER.md to the source it was extracted from"],
  ["phase2-ledger.mjs",    "holds AUDIT/PHASE-2-LEDGER.md to the register it was derived from"],
  ["report-manifest.mjs",  "holds the report's own harness list to the runner's — this gate"],
];
for (const [file, protects] of REPORTABLE) {
  check(`${file} is described in the report`, report.has(file), protects);
  check(`${file} is run by npm test`, runner.has(file),
    runner.has(file) ? "in the test script" : "NOT in the test script — the guard would be unguarded");
}

/* ── 3. the report may not describe a harness the runner does not run ── */
console.log("\n-- 3. every reported harness is actually gated in npm test --");

const reportOnly = reportSeq.filter((f) => !runner.has(f)).sort();
check("no harness is described in the report but left out of the test script",
  reportOnly.length === 0,
  reportOnly.length
    ? `${reportOnly.length}: ${reportOnly.join(", ")} — the report's own "all gated in npm test" claim is false for these`
    : `all ${report.size} reported harnesses run in npm test`);

/* ── 4. the unlisted population is pinned, not excused ───────────────── */
console.log("\n-- 4. the runner-only population is pinned, so a NEW omission fails --");

/* These harnesses run in CI and are not described in the report. A known,
   unremediated gap: describing each is a writing job, not a fix, and doing it
   under a guard commit would be a refactor. What IS enforced is that the gap
   does not GROW silently, and that it is not quietly over-stated either.

   TO CHANGE THIS NUMBER: either add the harness to harness-manifest.mjs with a
   description of what it PROVES, or lower the pin deliberately in the same
   commit that closes the gap. Never raise it to make a run green. */
const RUNNER_ONLY_PIN = 45;

const runnerOnly = [...runner].filter((f) => !report.has(f)).sort();
/* The message gives the COUNT and points at the list printed below. It does
   NOT name "the new one": this gate stores a number, not a set, so which
   harness is newly unlisted is not something it can know, and a diagnostic
   that guesses is worse than one that defers. Storing the set would make this
   an allowlist, which is the thing the pin exists instead of. */
check("the number of harnesses that run but are not described has not grown",
  runnerOnly.length <= RUNNER_ONLY_PIN,
  `${runnerOnly.length} runner-only, pinned at ${RUNNER_ONLY_PIN}`
  + (runnerOnly.length > RUNNER_ONLY_PIN
      ? ` — ${runnerOnly.length - RUNNER_ONLY_PIN} more than the pin; the full list is printed below,`
        + ` and the addition is in this commit's diff of package.json`
      : ""));
check("the pin is not stale, i.e. it is not above the measured population",
  runnerOnly.length === RUNNER_ONLY_PIN,
  runnerOnly.length === RUNNER_ONLY_PIN
    ? `exactly ${RUNNER_ONLY_PIN}, so the pin still measures something`
    : `pin ${RUNNER_ONLY_PIN} but only ${runnerOnly.length} measured — lower the pin in the commit that closed the gap`);

console.log(`\n  the ${runnerOnly.length} harnesses that run in npm test and are not described:`);
for (let i = 0; i < runnerOnly.length; i += 4)
  console.log("    " + runnerOnly.slice(i, i + 4).map((s) => s.padEnd(31)).join("").trimEnd());

/* On disk but in NEITHER manifest. Not a failure: calibrate.mjs and report.mjs
   are npm scripts in their own right, and sensitivity.mjs is a Phase 17
   instrument deliberately in neither runner. Reported so the number is visible
   rather than discovered. */
const orphans = [...onDisk].filter((f) => !runner.has(f) && !report.has(f)).sort();
console.log(`\n  on disk but in neither manifest (${orphans.length}): ${orphans.join(", ")}`);

console.log("");
console.log(fail
  ? `REPORT MANIFEST GATE FAILED: ${fail} check(s), ${pass} passed`
  : `REPORT MANIFEST GATE PASSED (${pass} checks, runner ${runner.size}, report ${report.size}, runner-only ${runnerOnly.length})`);
console.log(bar);
process.exit(fail ? 1 : 0);
