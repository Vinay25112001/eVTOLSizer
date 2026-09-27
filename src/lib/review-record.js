/* =====================================================================
   REVIEW RECORDS — what moves the two Technical Review factors off zero
   =====================================================================
   NASA-STD-7009B scores M&S Development Technical Review and M&S Use/
   Analysis Technical Review (Tables 10 and 19). Level 1 on each is "a
   favorable informal internal peer review", scope covering Data Pedigree,
   Verification and Validation at a minimum. E.3.5 says what a peer review
   is - conducted by persons of equal technical standing to those
   responsible for the work - and what its record must show: scope and
   depth, who reviewed and their association with the project, and when.

   This module reads a review record written to docs/reviews/README.md's
   format and decides, from the record alone, whether it clears Level 1.
   It is pure: the report generator reads the files and hands the text in,
   and the gate tests the decision on fixtures. The rule is the standard's,
   not a courtesy: a self-review does not qualify, an unfavourable opinion
   on any of the three factors leaves the level at 0, and a record missing
   the fields E.3.5 requires is not a record.
   ===================================================================== */

const REQUIRED = ["reviewer", "role", "association", "date", "commit", "artefacts",
                  "data_pedigree", "verification", "validation"];
const OPINIONS = ["data_pedigree", "verification", "validation"];

/** Parse a `key: value` front-matter block between --- lines. Values are strings. */
export function parseReviewRecord(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ""));
  if (!m) return { ok: false, why: "no front-matter block (--- ... ---)" };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  const missing = REQUIRED.filter((k) => !(k in fields) || fields[k] === "");
  if (missing.length) return { ok: false, why: `missing field(s) the record must carry (E.3.5): ${missing.join(", ")}`, fields };
  const bad = OPINIONS.filter((k) => !/^(favourable|favorable|unfavourable|unfavorable)$/i.test(fields[k]));
  if (bad.length) return { ok: false, why: `opinion(s) must be favourable or unfavourable: ${bad.join(", ")}`, fields };
  if (!/^[0-9a-f]{7,40}$/i.test(fields.commit)) return { ok: false, why: "commit must be a hash of 7 to 40 hex digits", fields };
  return { ok: true, fields };
}

/**
 * The level the two review factors earn from a set of records.
 * @param records  [{ file, text }]
 * @param opts.authors  names/handles that count as the author (a self-review does not qualify)
 */
export function reviewFactorLevel(records, { authors = [] } = {}) {
  const parsed = records.map((r) => ({ file: r.file, ...parseReviewRecord(r.text) }));
  const lower = (s) => String(s ?? "").toLowerCase();
  const qualifying = [], rejected = [];
  for (const p of parsed) {
    if (!p.ok) { rejected.push({ file: p.file, why: p.why }); continue; }
    const f = p.fields;
    if (authors.some((a) => lower(f.reviewer).includes(lower(a)))) { rejected.push({ file: p.file, why: "a self-review does not qualify as a peer review (E.3.5)" }); continue; }
    if (/^author\b|self/i.test(f.association)) { rejected.push({ file: p.file, why: `association "${f.association}" is the author's own; not a peer` }); continue; }
    const unfav = OPINIONS.filter((k) => /^unfav/i.test(f[k]));
    if (unfav.length) { rejected.push({ file: p.file, why: `unfavourable on ${unfav.join(", ")}; the record is kept and the level stays 0` }); continue; }
    qualifying.push({ file: p.file, reviewer: f.reviewer, role: f.role, association: f.association, date: f.date, commit: f.commit, artefacts: f.artefacts });
  }
  const level = qualifying.length ? 1 : 0;
  const why = level === 1
    ? `A favorable informal internal peer review is on record: ${qualifying.map((q) => `${q.reviewer} (${q.role}, ${q.association}) on ${q.date} at ${q.commit.slice(0, 7)}, ${q.file}`).join("; ")}. `
      + "Scope covered Data Pedigree, Verification and Validation, the minimum Table 10 / Table 19 name for level 1. "
      + "Level 2 requires a formal internal review, which has not been conducted."
    : (parsed.length
        ? `Insufficient evidence. ${parsed.length} record(s) in docs/reviews, none qualifying: ${rejected.map((r) => `${r.file}: ${r.why}`).join("; ")}. Level 1 requires a favorable informal internal peer review by a peer, not the author.`
        : "Insufficient evidence. There has been no peer review of any kind: not independent, not formal internal, not informal internal. Level 1 requires a favorable informal internal peer review, and a developer reviewing their own work is not a peer review under any reading of the standard. docs/reviews/ holds the brief and the record format; a record there, written by a peer, moves this factor.");
  return { level, why, qualifying, rejected, recordsSeen: parsed.length };
}
