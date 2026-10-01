/* PHASE 2 AUDIT TOOLING - reproduces the question-20 evidence behind F-67.
   Durable and self-contained: it depends on nothing outside this repository, so
   F-67 stays reproducible after any working scratchpad is gone.

   Usage, from the repository root:
     node AUDIT/reference/q20/q20-reproduce.mjs            # verify, exit 1 on drift
     node AUDIT/reference/q20/q20-reproduce.mjs --write    # regenerate the baseline

   It is NOT a harness and is deliberately not in `npm test`: it does not run the
   engine. Putting it under validation/ would also make the report-manifest gate
   treat it as an undescribed harness, which is why it lives under AUDIT/.

   WHAT IT REPRODUCES
     AUDIT/data/q20-baseline.tsv - the ORIGINAL question-20 derivation for all
     1,288 relations from the as-built scanner: its exact GUARD regex tested
     against the RAW +/-25-line window. That is the state F-65 describes, and the
     baseline every later claim is measured against.

   WHAT IT CANNOT REPRODUCE, BY DESIGN. The change record carries a human
   adjudication per row - whether the guard constrains quantities the relation
   consumes, and any lead left for a future block. A tool cannot re-derive that,
   so AUDIT/data/q20-change-record.tsv is EVIDENCE and is never machine-written.

   HOW THE RECORD IS CHECKED. Once the correction is applied the "candidate set"
   is empty by construction, because those rows are already UNVERIFIED, so
   re-deriving candidates is not a durable test. The durable invariant is
   post-hoc and is checked in BOTH directions: every recorded row must have been
   WARNING in the as-built baseline, must be UNVERIFIED in the ledger now, and
   must still show executable evidence in its window; and no row outside the
   record may show that same shape. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { scrubCode, detect, windowOf } from "./q20-detector.mjs";

const WRITE = process.argv.includes("--write");
const LEDGER = "AUDIT/PHASE-2-LEDGER.md";
const REGISTER = "AUDIT/FORMULA-REGISTER.md";
const BASELINE = "AUDIT/data/q20-baseline.tsv";
const RECORD = "AUDIT/data/q20-change-record.tsv";
const NQ = 20;

/* the as-built scanner, VERBATIM. Do not "improve" it: it IS the baseline. */
const GUARD_AS_BUILT = /Number\.isFinite|isNaN|Math\.max\s*\(\s*0|Math\.min|<=\s*0|<\s*0|>\s*0\s*\?|\|\|\s*0|\?\?\s*0|clamp|Math\.abs|EPS|guard/i;

/* register parser, inlined so this file has no external dependency. Naive
   splitting on a bar corrupts everything past the equation column because
   equations legitimately contain a double bar, so columns before the equation
   are taken from the left and those after it from the right. */
const COLS = ["ID", "file", "function", "line", "equation", "inputs", "outUnits", "source",
  "sourceLoc", "assumption", "impl", "unitVerif", "indepVerif", "validation", "regression",
  "finding", "provenance", "confidence"];
const LEFT = 4, RIGHT = COLS.length - LEFT - 1;
function parseRegister(path = REGISTER) {
  const out = [];
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!/^\|\s*FORMULA-/.test(raw)) continue;
    const parts = raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    if (parts.length < COLS.length) continue;
    const vals = [...parts.slice(0, LEFT),
                  parts.slice(LEFT, parts.length - RIGHT).join("|"),
                  ...parts.slice(parts.length - RIGHT)]
      .map((v) => v.trim().replace(/^`|`$/g, ""));
    const r = {};
    COLS.forEach((c, i) => (r[c] = vals[i]));
    r.line = parseInt(r.line, 10);
    out.push(r);
  }
  return out;
}

/* the nine files whose relations an audit block worked BY HAND; a WARNING there
   was recorded by a person and is never overruled by a tool */
const HAND_AUDITED_FILES = new Set([
  "src/engine/gearlayout.js",
  "src/classes/aircraft/fuselage-bending-material.js",
  "src/classes/aircraft/fuselage-structure-loads.js",
  "src/classes/aircraft/fuselage-pressure-shell.js",
  "src/classes/aircraft/fuselage-shear-flow.js",
  "src/engine/gear/stowage.js",
  "src/classes/aircraft/flight-envelope.js",
  "src/classes/aircraft/fuselage-structure.js",
  "src/engine/gear/strut.js",
]);

const rawCache = new Map(), scrubCache = new Map();
function load(f) {
  if (!rawCache.has(f)) {
    let t = null;
    for (const c of [f, "src/" + f]) if (existsSync(c)) { t = readFileSync(c, "utf8"); break; }
    rawCache.set(f, t);
    scrubCache.set(f, t == null ? null : scrubCode(t));
  }
}
const rawLines = (f) => { load(f); const t = rawCache.get(f); return t == null ? null : t.split(/\r?\n/); };
const scrubLines = (f) => { load(f); const t = scrubCache.get(f); return t == null ? null : t.split(/\r?\n/); };

const led = new Map();
for (const raw of readFileSync(LEDGER, "utf8").split(/\r?\n/)) {
  if (!/^\|\s*FORMULA-/.test(raw)) continue;
  const c = raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  if (c.length < 2 + NQ) continue;
  led.set(c[0].trim(), c.slice(2, 2 + NQ)[19].trim());
}

const rows = parseRegister();

/* ---- 1. the as-built baseline ---- */
const NEWLINE = String.fromCharCode(10);
const baseline = ["relationID\tfile\tline\twindowStart\twindowEnd\tasBuiltQ20\tasBuiltMatch"];
const asBuilt = new Map();
let bW = 0, bU = 0;
for (const r of rows) {
  const L = rawLines(r.file);
  if (!L) continue;
  const { a, b } = windowOf(r.line, L.length);
  const m = L.slice(a, b).join(NEWLINE).match(GUARD_AS_BUILT);
  const v = m ? "U" : "W";
  if (v === "W") bW++; else bU++;
  asBuilt.set(r.ID, v);
  baseline.push([r.ID, r.file, r.line, a + 1, b, v,
                 m ? m[0].replace(/\s+/g, " ").slice(0, 40) : ""].join("\t"));
}

/* ---- 2. the corrected detector over the same windows ---- */
let cW = 0, cU = 0, downgraded = 0;
for (const r of rows) {
  const SL = scrubLines(r.file);
  if (!SL) continue;
  const { a, b } = windowOf(r.line, SL.length);
  const v = detect(SL.slice(a, b).join(NEWLINE)).verdict;
  if (v === "W") cW++; else cU++;
  if (asBuilt.get(r.ID) === "U" && v === "W") downgraded++;
}

console.log(`relations                                  : ${rows.length}`);
console.log(`as-built scanner                           : ${bW} WARNING / ${bU} UNVERIFIED`);
console.log(`corrected detector                         : ${cW} WARNING / ${cU} UNVERIFIED`);
console.log(`as-built UNVERIFIED with no executable evidence: ${downgraded}`);
console.log(`  (prose, comment-only or literal-only matches. These are NOT ledger changes:`);
console.log(`   UNVERIFIED asserts nothing, so the cells stand and only the rationale was wrong.)`);

let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log(`  MISMATCH: ${m}`); } };

if (WRITE) {
  writeFileSync(BASELINE, baseline.join(NEWLINE) + NEWLINE);
  console.log(`\nwrote ${BASELINE} (${baseline.length - 1} rows)`);
  console.log(`NOTE: ${RECORD} is human-adjudicated evidence and is never machine-written.`);
} else {
  chk(existsSync(BASELINE), `${BASELINE} exists`);
  if (existsSync(BASELINE)) {
    const want = readFileSync(BASELINE, "utf8").replace(/\r\n/g, NEWLINE).trim();
    chk(want === baseline.join(NEWLINE).trim(), `${BASELINE} matches a fresh derivation`);
  }
  chk(existsSync(RECORD), `${RECORD} exists`);
  if (existsSync(RECORD)) {
    const recs = readFileSync(RECORD, "utf8").replace(/\r\n/g, NEWLINE).trim().split(NEWLINE)
      .slice(1).filter((l) => l.trim()).map((l) => l.split("\t"));
    const recIds = new Set(recs.map((f) => f[0]));
    chk(recs.length > 0, `the change record is not empty (${recs.length} rows)`);

    for (const f of recs) {
      const id = f[0];
      chk(f[2] === "W" && f[3] === "U" && f[4] === "U",
        `${id}: record reads W -> U -> U (got ${f[2]} -> ${f[3]} -> ${f[4]})`);
      chk(asBuilt.get(id) === "W",
        `${id}: the as-built scanner did record WARNING, so this was a withdrawal`);
      chk(led.get(id) === "U", `${id}: the ledger now records UNVERIFIED`);
      const r = rows.find((x) => x.ID === id);
      chk(!!r, `${id}: present in the register`);
      if (r) {
        const SL = scrubLines(r.file);
        const { a, b } = windowOf(r.line, SL.length);
        chk(detect(SL.slice(a, b).join(NEWLINE)).verdict === "U",
          `${id}: the corrected detector still finds executable evidence in its window`);
      }
    }

    /* the other direction: no row outside the record may show the same shape */
    const strays = [];
    for (const r of rows) {
      if (recIds.has(r.ID)) continue;
      if (r.ID.startsWith("FORMULA-STRUCT-") && HAND_AUDITED_FILES.has(r.file)) continue;
      if (asBuilt.get(r.ID) !== "W" || led.get(r.ID) !== "U") continue;
      const SL = scrubLines(r.file);
      if (!SL) continue;
      const { a, b } = windowOf(r.line, SL.length);
      if (detect(SL.slice(a, b).join(NEWLINE)).verdict === "U") strays.push(r.ID);
    }
    chk(strays.length === 0,
      `no withdrawal outside the change record (strays: ${strays.join(", ") || "none"})`);
  }
  console.log(bad === 0
    ? `\nVERIFIED: the baseline reproduces byte-for-byte, and all ${readFileSync(RECORD, "utf8").trim().split(NEWLINE).length - 1} recorded withdrawals hold in both directions.`
    : `\nFAILED: ${bad} mismatch(es).`);
  process.exit(bad ? 1 : 0);
}
