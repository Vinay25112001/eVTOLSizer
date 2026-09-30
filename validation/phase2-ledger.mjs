/* =====================================================================
   PHASE 2 LEDGER GATE — Phase 2 (P02-086 … P02-112)
   =====================================================================
   WHY THIS EXISTS

   Phase 2 requires a verdict per formula from a fixed vocabulary — PASS,
   FAIL, WARNING, UNVERIFIED (P02-108…111) — and forbids "probably correct"
   (P02-112). AUDIT/PHASE-2-LEDGER.md carries that verdict for all 1,288
   retained engineering relations against the twenty questions of
   P02-087…106.

   A ledger of 25,760 determinations that nothing holds to the code is a
   document that is true on the day it is written. Eleven of Phase 0's
   requirements already score NO REGRESSION TEST for exactly that reason:
   the work was done, documented, and left ungated. This gate is what stops
   the Phase 2 ledger joining them.

   ── THE DIRECTION OF THE COMPARISON MATTERS ──────────────────────────
   This gate reads the COMMITTED ledger and re-derives the determinable
   verdicts from the register, then compares. It never regenerates the
   ledger and compares that against itself. N-19 is the local gate runner
   doing precisely the latter — `npm run report` followed by
   `npm run report:check` — and a check that runs on something which cannot
   fail is not a check. The register is the independent input here; the
   ledger is the artefact under test.

   ── CR IS STRIPPED FIRST, NOT LAST ───────────────────────────────────
   `core.autocrlf=true` means every AUDIT document is CRLF in the working
   tree and LF in the blob. F-40 is `validation/report.mjs` stripping CR at
   the END of its normalisation chain, after regexes whose `^\s*` can match
   between the CR and the LF and swallow a line break — which made a current
   report read as stale for four sessions. Every read below therefore strips
   CR on the first line, before anything is split or matched.

   ── WHAT IS CHECKED ──────────────────────────────────────────────────
   1. The register still parses into the two tables it is known to have,
      and its trailing columns still resolve to their controlled
      vocabularies. A naive split on "|" is corrupt past `equation as
      coded`, because equations legitimately contain "||" (N-21), so the
      columns before the equation are taken from the LEFT and those after
      it from the RIGHT. If that shape ever changes, every verdict derived
      from the register is suspect, so it is checked before anything else.

   2. The ledger covers the retained relations EXACTLY — same population,
      same count, no orphan and no omission, and each row's site agrees
      with the register's file and line for that ID.

   3. Every verdict is drawn from P02-108…111's four-token vocabulary and
      nothing else, and every row carries all twenty.

   4. The three register-derived questions still agree with the register:
      units against `unit verif`, coefficient sourcing against `source`,
      duplication against equation-shape uniqueness. This is the anti-drift
      core — if the register is rebuilt and the ledger is not, these fail.

   5. The zero/negative/NaN question carries NO PASS. The asymmetry is
      structural, not incidental: absence of a guard is evidence the case is
      unhandled, but a guard's presence does not show it covers the relation
      in question, so a mechanical scan can only produce WARNING or
      UNVERIFIED. A PASS appearing here would mean someone had taught the
      scan to claim something it cannot know.

   6. Every verdict that is not UNVERIFIED states its basis, so no verdict
      is assertion-only. This is P02-112 made mechanical.

   7. The summary table the document leads with matches the ledger it
      summarises, including the stated determination total. A document whose
      headline figure drifts from its own body is the F-39 shape.

   ── WHAT IS NOT CHECKED ──────────────────────────────────────────────
   Whether any verdict is CORRECT as engineering. This gate cannot know
   whether an equation is right; it knows whether the ledger still describes
   the register and obeys the phase's own rules. Sixteen of the twenty
   questions are UNVERIFIED for every relation, and nothing here can change
   that — only work can. In particular a high UNVERIFIED count is not a
   failure condition, because UNVERIFIED is the honest verdict the phase
   provides where evidence is absent.
   ===================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r/g, "");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const bar = "=".repeat(78);
console.log(bar);
console.log("PHASE 2 LEDGER GATE — the per-formula verdict record against the register");
console.log(bar);

/* ── 1. the register still has the shape every verdict rests on ─────── */
console.log("\n-- 1. the register parses, and its controlled vocabularies hold --");

const REG_COLS = ["ID", "file", "function", "line", "equation", "inputs", "outUnits",
  "source", "sourceLoc", "assumption", "impl", "unitVerif", "indepVerif", "validation",
  "regression", "finding", "provenance", "confidence"];
const NCOL = REG_COLS.length, LEFT = 4, RIGHT = NCOL - LEFT - 1;

const retained = [], excluded = [];
for (const raw of read("AUDIT/FORMULA-REGISTER.md").split("\n")) {
  if (!/^\|\s*FORMULA-/.test(raw)) continue;
  const parts = raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  if (parts.length < NCOL) { excluded.push(parts[0].trim()); continue; }
  const vals = [...parts.slice(0, LEFT),
                parts.slice(LEFT, parts.length - RIGHT).join("|"),
                ...parts.slice(parts.length - RIGHT)]
               .map((v) => v.trim().replace(/^`|`$/g, ""));
  const r = {}; REG_COLS.forEach((c, i) => (r[c] = vals[i]));
  r.line = parseInt(r.line, 10);
  retained.push(r);
}

check("the register parses into its two tables", retained.length > 0 && excluded.length > 0,
  `${retained.length} retained at ${NCOL} columns + ${excluded.length} excluded at 7 = ${retained.length + excluded.length}`);

const distinct = (k) => new Set(retained.map((r) => r[k]));
/* If the right-hand parse were misaligned these would fill with equation debris.
   The counts are PINNED, not bounded: a new value means the register changed shape
   and every register-derived verdict below must be re-derived, not re-blessed. */
check("`impl` resolves to its single value", distinct("impl").size === 1,
  `${distinct("impl").size} distinct: ${[...distinct("impl")].join(", ").slice(0, 40)}`);
check("`confidence` resolves to exactly three values", distinct("confidence").size === 3,
  `${[...distinct("confidence")].sort().join(", ")}`);
check("`unit verif` resolves to exactly five values", distinct("unitVerif").size === 5,
  `${[...distinct("unitVerif")].sort().join(", ")}`);
check("every retained row carries a parseable line number",
  retained.every((r) => Number.isFinite(r.line)),
  `${retained.filter((r) => !Number.isFinite(r.line)).length} unparseable`);

/* ── 2. the ledger covers the retained relations exactly ────────────── */
console.log("\n-- 2. the ledger covers the retained relations exactly --");

const NQ = 20;
const rows = [];
for (const raw of read("AUDIT/PHASE-2-LEDGER.md").split("\n")) {
  if (!/^\|\s*FORMULA-/.test(raw)) continue;
  const c = raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  if (c.length < 2 + NQ) continue;
  rows.push({
    ID: c[0].trim(),
    site: c[1].trim().replace(/^`|`$/g, ""),
    v: c.slice(2, 2 + NQ).map((x) => x.trim()),
    notes: c.slice(2 + NQ).join("|").trim(),
  });
}

check("the ledger parses into rows", rows.length > 0, `${rows.length} rows`);
check("the ledger row count equals the retained relation count",
  rows.length === retained.length, `ledger ${rows.length}, register ${retained.length}`);

const regById = new Map(retained.map((r) => [r.ID, r]));
const ledById = new Map(rows.map((r) => [r.ID, r]));
const orphan = rows.filter((r) => !regById.has(r.ID)).map((r) => r.ID);
const missing = retained.filter((r) => !ledById.has(r.ID)).map((r) => r.ID);
check("no ledger row names a formula the register does not have", orphan.length === 0,
  orphan.length ? `${orphan.length}: ${orphan.slice(0, 3).join(", ")}` : "0 orphans");
check("no retained relation is absent from the ledger", missing.length === 0,
  missing.length ? `${missing.length}: ${missing.slice(0, 3).join(", ")}` : "0 omissions");

const badSite = rows.filter((r) => {
  const g = regById.get(r.ID);
  return g && r.site !== `${g.file}:${g.line}`;
});
check("every ledger site matches the register's file and line for that ID",
  badSite.length === 0,
  badSite.length ? `${badSite.length} differ, first ${badSite[0].ID}: ledger ${badSite[0].site}` : "0 differing");

/* ── 3. the verdict vocabulary is the one the phase fixes ───────────── */
console.log("\n-- 3. the verdict vocabulary is P02-108…111 and nothing else --");

const VOCAB = new Set(["P", "F", "W", "U"]);
const badTok = [];
for (const r of rows) for (const t of r.v) if (!VOCAB.has(t)) badTok.push(`${r.ID}:${t}`);
check("every verdict is PASS, FAIL, WARNING or UNVERIFIED", badTok.length === 0,
  badTok.length ? `${badTok.length} outside the vocabulary, first ${badTok[0]}` : "P/F/W/U only");
check(`every row carries all ${NQ} verdicts`, rows.every((r) => r.v.length === NQ),
  `${rows.filter((r) => r.v.length !== NQ).length} rows with a different count`);

/* ── 4. the register-derived questions still agree with the register ── */
console.log("\n-- 4. the register-derived verdicts still agree with the register --");

const Q = (n) => n - 1;                       // Q3 is index 2

/* F-42: A `CONFLICT` IS NOT A DEFECT, IT IS AN UNRESOLVED RECORD, so it maps to
   UNVERIFIED and not to FAIL. The register's own provenance reads "neither is
   adopted" on those rows, and a field that adopts neither reading cannot support an
   assertion that the repository is wrong. All six proved to be the analyser: five the
   naming heuristic, one the literal-`0` initialiser. N-16 had already made this a
   rule -- ask whether the analyser caused it before calling a conflict a defect --
   and the first ledger did not ask.

   FAIL IS DELIBERATELY STILL REACHABLE. A dimensional error hand-verified in the code
   should be recorded as one, so a Q3 FAIL is accepted when, and only when, the row's
   basis says it was hand-verified. That narrows the mapping without making the verdict
   unreachable, and it keeps the basis requirement doing the work. */
const wantUnits = (r) =>
  r.unitVerif === "DECLARED" || r.unitVerif === "DERIVED" ? "P" : "U";
const HAND_FAIL = /hand-verified code defect/i;
const unitsBad = rows.filter((r) => {
  const want = wantUnits(regById.get(r.ID));
  const got = r.v[Q(3)];
  if (got === want) return false;
  return !(got === "F" && HAND_FAIL.test(r.notes));
});
check("Q3 units agrees with the register's `unit verif` on every row", unitsBad.length === 0,
  unitsBad.length ? `${unitsBad.length} disagree, first ${unitsBad[0].ID}`
                  : `${rows.filter((r) => r.v[Q(3)] === "P").length} PASS, ${rows.filter((r) => r.v[Q(3)] === "F").length} FAIL, ${rows.filter((r) => r.v[Q(3)] === "U").length} UNVERIFIED`);

/* F-42 pinned explicitly, not left implicit in the agreement check above: no row whose
   only evidence is a recorded dimensional CONFLICT may carry a repository FAIL. */
const conflictRows = rows.filter((r) => regById.get(r.ID).unitVerif === "CONFLICT");
const conflictAsFail = conflictRows.filter((r) => r.v[Q(3)] === "F" && !HAND_FAIL.test(r.notes));
check("no recorded dimensional CONFLICT is asserted as a repository FAIL",
  conflictAsFail.length === 0,
  conflictAsFail.length
    ? `${conflictAsFail.length} of ${conflictRows.length} CONFLICT rows claim FAIL without hand verification, first ${conflictAsFail[0].ID}`
    : `${conflictRows.length} CONFLICT rows, all UNVERIFIED — every one proved to be the analyser (F-42)`);

const wantSrc = (r) =>
  r.source === "DIRECTLY STATED" || r.source === "MEASURED FROM SOURCE" ? "P"
  : r.source === "ENGINEERING ASSUMPTION" ? "W" : "U";
const srcBad = rows.filter((r) => r.v[Q(10)] !== wantSrc(regById.get(r.ID)));
check("Q10 coefficient sourcing agrees with the register's `source` on every row",
  srcBad.length === 0,
  srcBad.length ? `${srcBad.length} disagree, first ${srcBad[0].ID}`
                : `${rows.filter((r) => r.v[Q(10)] === "P").length} PASS, ${rows.filter((r) => r.v[Q(10)] === "W").length} WARNING, ${rows.filter((r) => r.v[Q(10)] === "U").length} UNVERIFIED`);

const shape = new Map();
for (const r of retained) shape.set(r.equation, (shape.get(r.equation) || 0) + 1);
const dupBad = rows.filter((r) => {
  const g = regById.get(r.ID);
  return r.v[Q(9)] !== (shape.get(g.equation) > 1 ? "W" : "P");
});
check("Q9 duplication agrees with equation-shape uniqueness in the retained set",
  dupBad.length === 0,
  dupBad.length ? `${dupBad.length} disagree, first ${dupBad[0].ID}`
                : `${rows.filter((r) => r.v[Q(9)] === "W").length} share a shape, 0 UNVERIFIED`);

/* ── 5. the asymmetry that keeps a mechanical scan honest ───────────── */
console.log("\n-- 5. the zero/negative/NaN question cannot bank an unearned PASS --");

const q20pass = rows.filter((r) => r.v[Q(20)] === "P").length;
check("Q20 zero/negative/NaN carries no PASS", q20pass === 0,
  q20pass ? `${q20pass} rows claim PASS from a scan that cannot establish it`
          : `${rows.filter((r) => r.v[Q(20)] === "W").length} WARNING, ${rows.filter((r) => r.v[Q(20)] === "U").length} UNVERIFIED, 0 PASS`);

/* ── 6. no verdict is assertion-only ───────────────────────────────── */
console.log("\n-- 6. every verdict that is not UNVERIFIED states its basis --");

const silent = rows.filter((r) => r.v.some((t) => t !== "U") && r.notes.length === 0);
check("every row with a determined verdict carries a stated basis", silent.length === 0,
  silent.length ? `${silent.length} rows assert without a basis, first ${silent[0].ID}`
                : `${rows.filter((r) => r.notes.length > 0).length} rows carry a basis`);

/* ── 7. the document's own summary matches its body ─────────────────── */
console.log("\n-- 7. the leading summary matches the ledger it summarises --");

const doc = read("AUDIT/PHASE-2-LEDGER.md");
const tally = [];
for (let i = 0; i < NQ; i++) {
  const t = { P: 0, F: 0, W: 0, U: 0 };
  for (const r of rows) t[r.v[i]]++;
  tally.push(t);
}
let summaryRows = 0, summaryBad = [];
for (const m of doc.matchAll(/^\|\s*(\d{1,2})\s*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm)) {
  const n = +m[1];
  if (n < 1 || n > NQ) continue;
  summaryRows++;
  const t = tally[n - 1];
  if (t.P !== +m[2] || t.W !== +m[3] || t.F !== +m[4] || t.U !== +m[5])
    summaryBad.push(`Q${n} states ${m[2]}/${m[3]}/${m[4]}/${m[5]}, body has ${t.P}/${t.W}/${t.F}/${t.U}`);
}
check(`the summary table carries a row for all ${NQ} questions`, summaryRows === NQ,
  `${summaryRows} summary rows found`);
check("every summary row matches the ledger body", summaryBad.length === 0,
  summaryBad.length ? summaryBad[0] : "all rows agree");

const determined = tally.reduce((n, t) => n + t.P + t.W + t.F, 0);
const required = rows.length * NQ;
const stated = doc.match(/Determined\s+(\d[\d,]*)\s+of\s+(\d[\d,]*)/);
const num = (s) => +s.replace(/,/g, "");
check("the stated determination total matches the ledger body",
  !!stated && num(stated[1]) === determined && num(stated[2]) === required,
  stated ? `states ${stated[1]} of ${stated[2]}, body has ${determined} of ${required}`
         : "no determination total found in the document");

console.log("");
console.log(fail
  ? `PHASE 2 LEDGER GATE FAILED: ${fail} check(s), ${pass} passed`
  : `PHASE 2 LEDGER GATE PASSED (${pass} checks, ${rows.length} relations, ${determined} of ${required} determinations recorded)`);
console.log(bar);
process.exit(fail ? 1 : 0);
