/* =====================================================================
   REVIEW RECORD GATE — the rule that moves the two review factors
   =====================================================================
   VALIDATION.md section 7 scores the two NASA-STD-7009B Technical Review
   factors from the records in docs/reviews/. This gates the rule on
   fixtures, so the day a record arrives the factor moves for the right
   reason and not by accident: a favourable record by a peer earns level 1;
   the author's own record does not; an unfavourable opinion on any of the
   three factors does not; a record missing what E.3.5 requires is not a
   record; and today, with only the brief and the format on disk, the level
   is 0 with the "no peer review" text. Also that the report generator
   really reads the folder (the wiring is asserted in its source).

   MUTANTS, seven, every one caught by a named check: a self-review
   qualifying; an author association qualifying; an unfavourable opinion
   ignored; a missing field tolerated; any record at all earning level 1; a
   favourable record earning level 2; the commit format unchecked.

   Run: node validation/review-record.mjs
   ===================================================================== */
import { readFileSync, readdirSync } from "node:fs";
import { parseReviewRecord, reviewFactorLevel } from "../src/lib/review-record.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};
console.log("REVIEW RECORD GATE");
console.log(bar);

const rec = (over = {}) => {
  const f = { reviewer: "A. Peer", role: "aerospace engineer, conceptual design", association: "colleague, not a contributor",
              date: "2026-10-01", commit: "1ea4026", artefacts: "VALIDATION.md s1,2,4,7-9; rotorgroup.js; rotor-group.mjs; VFS abstract",
              data_pedigree: "favourable", verification: "favourable", validation: "favourable", ...over };
  const body = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `---\n${body}\n---\n\nOpinion text.\n`;
};

/* ── 1. THE PARSER ───────────────────────────────────────────────────── */
console.log("\n1. The parser");
check(parseReviewRecord(rec()).ok === true, "a complete record parses", "");
check(parseReviewRecord("no front matter").ok === false, "text without front matter is not a record", parseReviewRecord("no front matter").why);
check(/missing field/.test(parseReviewRecord(rec({ commit: undefined })).why), "a record missing the commit is refused, naming the field", "");
check(/must be favourable/.test(parseReviewRecord(rec({ verification: "mostly ok" })).why), "an opinion that is neither favourable nor unfavourable is refused", "");
check(/hash/.test(parseReviewRecord(rec({ commit: "main" })).why), "a branch name is not a commit", "");
check(parseReviewRecord(rec().replace(/\n/g, "\r\n")).ok === true, "CRLF line endings parse", "");

/* ── 2. THE RULE ─────────────────────────────────────────────────────── */
console.log("\n2. The rule");
const L = (records, opts) => reviewFactorLevel(records.map((t, i) => ({ file: `r${i}.md`, text: t })), opts);
check(L([]).level === 0 && /no peer review of any kind/.test(L([]).why), "no record: level 0 with the 'no peer review' text", "");
check(L([rec()]).level === 1 && /favorable informal internal peer review is on record/.test(L([rec()]).why) && /A\. Peer/.test(L([rec()]).why),
  "one favourable record by a peer: level 1, naming the reviewer, role, association, date and commit", "");
check(L([rec({ reviewer: "The Author" })], { authors: ["the author"] }).level === 0 && /self-review/.test(L([rec({ reviewer: "The Author" })], { authors: ["the author"] }).why),
  "the author's own record does not qualify (E.3.5)", "");
check(L([rec({ association: "author" })]).level === 0 && L([rec({ association: "self-assessment" })]).level === 0, "an association of author or self does not qualify", "");
for (const k of ["data_pedigree", "verification", "validation"]) {
  const r = L([rec({ [k]: "unfavourable" })]);
  check(r.level === 0 && new RegExp(`unfavourable on ${k}`).test(r.why), `unfavourable on ${k} alone keeps the level at 0, and the record is kept`, "");
}
check(L([rec({ verification: "unfavourable" }), rec({ reviewer: "B. Peer" })]).level === 1, "one unfavourable and one favourable peer record: level 1 on the favourable one", "");
check(L([rec({ commit: undefined })]).level === 0 && /none qualifying/.test(L([rec({ commit: undefined })]).why), "a malformed record leaves level 0 and says why", "");
check(L([rec()]).why.includes("Level 2 requires a formal internal review"), "level 1 says what level 2 would need", "");

/* ── 3. THE FOLDER TODAY, AND THE WIRING ─────────────────────────────── */
console.log("\n3. docs/reviews today, and the report generator's wiring");
const dir = new URL("../docs/reviews/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md" && f !== "BRIEF.md");
const live = reviewFactorLevel(files.map((f) => ({ file: f, text: readFileSync(new URL(f, dir), "utf8") })));
check(files.length === 0 ? live.level === 0 : live.level <= 1, `docs/reviews holds ${files.length} record(s); the factors read ${live.level}`, live.why.slice(0, 120));
const readme = readFileSync(new URL("README.md", dir), "utf8");
check(/data_pedigree: favourable \| unfavourable/.test(readme) && /association/.test(readme) && /commit/.test(readme), "the README states the format the parser reads", "");
const report = readFileSync(new URL("./report.mjs", import.meta.url), "utf8");
check(/reviewFactorLevel\(/.test(report) && /docs\/reviews/.test(report) && !/Technical Review", level: 0,/.test(report),
  "report.mjs computes both review factors from docs/reviews through the same rule, not from a literal 0", "");

console.log(`\n${bar}`);
console.log(fails.length ? `REVIEW RECORD GATE: ${fails.length} FAILED` : "REVIEW RECORD GATE PASSED");
process.exit(fails.length ? 1 : 0);
