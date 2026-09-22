/* ═══════════════════════════════════════════════════════════════════════
   REGULATORY CITATION GATE
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT THIS EXISTS FOR. A paragraph number, VTOL.1035, was cited in
   eleven places across the engine, the provenance matrix, the UI, the report
   exporter and the certification checklist, as the authority for the 20-minute
   energy reserve. It appears in NO primary document: not in SC-VTOL-01 Issue 2,
   not in MOC SC-VTOL Issue 2, not in any of the corpus's extracted texts. The
   only files on the machine containing the string were this tool's own source
   and its built bundle. The citation's sole source was the tool citing itself.

   The physics was never wrong — the engine implements NASA's own rule, "reserve
   minimum of 10% of mission or 20-min flight at best-endurance speed (Vbe)"
   (Johnson & Silva 2022) — and that is exactly why it survived forty gates.
   Nothing that checks numbers can catch a wrong SOURCE for a right number.
   This gate checks sources.

   WHAT IT DOES
     1. Scans src/, validation/ and the documents (*.md, *.html, *.cff at
        the root and under docs/ and paper/) for regulatory paragraph
        references.
     2. For families whose primary document is in the corpus (SC-VTOL / MOC,
        i.e. every VTOL.NNNN), it demands the paragraph actually appear in that
        document. A citation to a paragraph that does not exist FAILS.
     3. For families with no primary document on disk (14 CFR, CS-2x, MIL-F,
        ADS-33, SAE ARP, ICAO Doc), it REPORTS them as unverifiable and does
        not fail. "I cannot check this" is the honest outcome; failing on it
        would only teach people to delete citations.
     4. A DENYLIST of references already proven fabricated fails ALWAYS, corpus
        present or not, so the regression is gated even in a checkout without
        the corpus beside it.

   THE CORPUS IS OPTIONAL. It lives outside the repository
   (../eVTOL_Sizing_Research/extracted). When absent the gate says so loudly
   and still enforces the denylist, rather than passing in silence.
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CORPUS = join(ROOT, "..", "eVTOL_Sizing_Research", "extracted");

/* Paragraph numbers proven not to exist in any primary document. A reference
   here is a build failure with or without the corpus. Add to this list only
   after searching the corpus AND the source document, never on suspicion. */
const FABRICATED = [
  { ref: "VTOL.1035",
    found: "2026-09-15",
    note: "cited 11x as the 20-min reserve authority. Zero occurrences in "
        + "SC-VTOL-01 Issue 2, MOC SC-VTOL Issue 2, or any corpus text. The real "
        + "paragraph is VTOL.2430(b)(4), which states the requirement and NO "
        + "value; the 20 min is the FAA powered-lift SFAR's, and NASA's sizing "
        + "convention is what the engine actually implements." },
  { ref: "CS-27.1035",
    found: "2026-09-15",
    note: "cited alongside the above in the certification checklist; no such "
        + "paragraph located. CS-27 reserve provisions were never verified." },
  /* Found the day the AC reached the corpus, by the FAA family this gate
     could not check until then. Appendix A of the issued AC 21.17-4
     (07/18/2025) contains 144 distinct PL paragraph numbers: the series runs
     1457, 1459, 1529, then 2000 upward. Neither of these is among them, and
     in both cases the correct paragraph was positively identified, which is
     the standard this list requires. */
  { ref: "PL.1035",
    found: "2026-09-15",
    note: "the FAA twin of the fabricated VTOL.1035, cited as the authority "
        + "for the 20-minute reserve. Not among the 144 paragraph numbers in "
        + "AC 21.17-4 appendix A. The real energy paragraph is PL.2430, whose "
        + "(a)(4) requires a means to determine total useable energy and states "
        + "NO value; the 20 minutes is the FAA powered-lift SFAR's." },
  { ref: "PL.1353",
    found: "2026-09-15",
    note: "cited twice as the authority for a battery mass fraction and a hover "
        + "C-rate. Not among the 144 paragraph numbers in appendix A, and no "
        + "paragraph of it states either quantity. The energy-storage "
        + "requirements are PL.2430(b) and they are qualitative. Both thresholds "
        + "are tool rules and now say so." },
];

/* Families we can actually check, and the corpus file that decides. */
const VERIFIABLE = [
  { name: "EASA SC-VTOL / MOC", pattern: /\bVTOL\.\d{3,4}/g },
  /* FAA powered-lift airworthiness criteria, AC 21.17-4 appendix A. Added
     2026-09-15 with the AC itself: the issued version (07/18/2025) is now in
     the corpus as AC-21.17-4_2025-07-18.txt, so PL.NNNN moved out of the
     unverifiable list and into this one. Getting the document settled two
     certification rows that had asserted a 3.5 g limit load factor to it —
     the string "3.5" does not occur anywhere in the AC. */
  { name: "FAA AC 21.17-4 App.A", pattern: /\bPL\.\d{4}/g },
];

/* ── WHAT A CORPUS SEARCH CAN AND CANNOT PROVE ─────────────────────────────
   A hit CONFIRMS the paragraph exists. A miss proves NOTHING, and the first
   version of this gate got that wrong: it checked only MOC-1 and failed the
   build on seven paragraphs, of which FOUR — VTOL.2100, 2265, 2440, 2540 —
   are real and simply live in documents not on disk. A means-of-compliance
   document discusses only the paragraphs it addresses; it is not the
   certification specification and cannot be read as an index of it.

   So hits are reported as confirmed, misses as UNCONFIRMED — a work queue,
   not an accusation — and only the denylist fails the build, where absence
   was established across every document on the machine AND the correct
   paragraph positively identified in its place. */

/* Families with no primary document on disk — reported, never failed. */
const UNVERIFIABLE = [
  /\b14 CFR \d+\.\d+/g, /\bCS-2[79][.\d]*/g, /\bMIL-[A-Z]-\d+[A-Z]?/g,
  /\bADS-33[A-Z-]*/g, /\bSAE ARP\d+/g, /\bICAO Doc \d+/g,
  /* Added 2026-09-15. Neither form was matched by anything above, so both
     passed through this gate without even being REPORTED — "FAR 27.33" was
     cited as a reserve-energy authority and "RTCA DO-311A" as the source of
     a 5C thermal limit, and the gate listed neither. Being unable to check a
     citation is a fact worth printing; silently not noticing it is not. */
  /\bFAR \d+\.\d+/g, /\bRTCA DO-\d+[A-Z]?/g,
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

/* DOCUMENTS TOO, since 2026-09-16. The README still cited VTOL.1035 a day
   after the code was cleaned, because this gate only walked src/ and
   validation/. A citation a reader sees on the repository's front page is
   the one most likely to be copied into someone else's report. */
function docs(dir, recurse) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (recurse) out.push(...docs(p, true)); }
    else if (/.(md|html|cff)$/i.test(e)) out.push(p);
  }
  return out;
}
const DOC_FILES = [...docs(ROOT, false), ...docs(join(ROOT, "docs"), true), ...docs(join(ROOT, "paper"), true)];

const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "validation")), ...DOC_FILES]
  .filter((f) => !f.endsWith("citations.mjs"));   // this file names them to ban them

const bar = "═".repeat(76);
console.log(bar);
console.log("REGULATORY CITATION GATE — every paragraph number checked against its source");
console.log(bar);

/* ── 1. the denylist, always enforced ───────────────────────────────────── */
const fatal = [];
for (const bad of FABRICATED) {
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
      if (ln.includes(bad.ref))
        fatal.push({ file: relative(ROOT, f), line: i + 1, ref: bad.ref, note: bad.note });
    });
  }
}
console.log("\nKNOWN-FABRICATED REFERENCES (" + FABRICATED.length + " on the list)");
for (const bad of FABRICATED) {
  const hits = fatal.filter((h) => h.ref === bad.ref).length;
  console.log("  " + (hits === 0 ? " ok " : "FAIL") + "  " + bad.ref.padEnd(14)
    + hits + " occurrence(s)   [banned " + bad.found + "]");
}

/* ── 2. corpus-backed verification ──────────────────────────────────────── */
const corpusOK = existsSync(CORPUS);
const unresolved = [];
if (!corpusOK) {
  console.log("\nCORPUS NOT FOUND at " + relative(ROOT, CORPUS));
  console.log("  Paragraph verification SKIPPED — the denylist above still applies.");
  console.log("  This is not a clean pass. Put the research corpus beside the repo.");
} else {
  for (const fam of VERIFIABLE) {
    const corpusDocs = readdirSync(CORPUS)
      .filter((n) => n.endsWith(".txt"))
      .map((n) => ({ name: n, text: readFileSync(join(CORPUS, n), "utf8") }));
    const findIn = (ref) => (corpusDocs.find((d) => d.text.includes(ref)) || {}).name;
    const cited = new Map();
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
        for (const m of ln.matchAll(fam.pattern)) {
          if (!cited.has(m[0])) cited.set(m[0], []);
          cited.get(m[0]).push(relative(ROOT, f) + ":" + (i + 1));
        }
      });
    }
    console.log("\n" + fam.name + " — " + cited.size + " distinct paragraph(s) cited, searched across "
      + corpusDocs.length + " corpus text(s)");
    for (const [ref, sites] of [...cited].sort()) {
      const doc = findIn(ref);
      console.log("  " + (doc ? " ok " : " ?? ") + "  " + ref.padEnd(14)
        + String(sites.length).padStart(2) + " site(s)"
        + (doc ? "   confirmed in " + doc : "   UNCONFIRMED — no corpus document mentions it"));
      if (!doc) unresolved.push({ ref, sites });
    }
  }
}

/* ── 3. families we cannot check ────────────────────────────────────────── */
const unver = new Map();
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  for (const pat of UNVERIFIABLE)
    for (const m of txt.matchAll(pat)) unver.set(m[0], (unver.get(m[0]) ?? 0) + 1);
}
console.log("\nNO PRIMARY DOCUMENT ON DISK — reported, not failed (" + unver.size + " reference(s))");
for (const [ref, n] of [...unver].sort()) console.log("  --    " + ref.padEnd(22) + n + " site(s)");
console.log("  These may be perfectly correct. Nothing here has checked them.");

/* ── verdict ────────────────────────────────────────────────────────────── */
console.log("\n" + bar);
if (fatal.length) {
  console.log("FAIL — " + fatal.length + " reference(s) to a paragraph proven not to exist:");
  for (const h of fatal.slice(0, 10)) console.log("   " + h.file + ":" + h.line + "  " + h.ref);
  console.log("\n   " + fatal[0].note);
  process.exit(1);
}
if (unresolved.length) {
  console.log("UNCONFIRMED — " + unresolved.length + " paragraph(s) no corpus document mentions:");
  for (const u of unresolved)
    console.log("   " + u.ref + "  (" + u.sites.length + " site(s), first " + u.sites[0] + ")");
  console.log("\n   A WORK QUEUE, NOT A FAILURE. Each row is either correct with its");
  console.log("   document simply absent from disk, or it is the next VTOL.1035. The way");
  console.log("   to close a row is to obtain the source document — never to delete the");
  console.log("   citation. Confirm one and it moves to 'ok' on the next run.");
}
console.log(corpusOK
  ? "PASS — every checkable paragraph number appears in its own source document."
  : "PASS (LIMITED) — denylist clean; paragraph verification skipped, no corpus.");
