/* PHASE 2 AUDIT TOOLING - the corrected question-20 evidence detector (F-67).
   Durable copy, kept so F-67 is reproducible after any scratchpad is gone.
   This file is NOT a harness and is deliberately NOT in `npm test`: it does not
   run the engine and asserts nothing about the aircraft. Its tests live beside
   it in q20-tests.mjs.

   WHAT QUESTION 20 ASKS: is zero, negative or non-finite input handled at this
   relation's site? The verdict set is ASYMMETRIC BY DESIGN and PASS is
   unreachable:

     evidence of a guard   -> UNVERIFIED  ("a guard is present, coverage unproven")
     no evidence of one    -> WARNING CANDIDATE, which is a reason to READ THE
                              SOURCE and nothing more. A WARNING may only be
                              recorded after a hole has been hand-verified.

   The asymmetry puts the burden of evidence on WARNING, because a WARNING
   asserts "nothing guards this case" while UNVERIFIED asserts nothing at all.
   Nothing in this file may ever return PASS.

   WHAT IT CORRECTS, relative to the original scan that F-65 describes:
     1. COMMENTS are not executable protection, so comment text is removed.
     2. STRING AND TEMPLATE LITERAL CONTENTS are not executable protection
        either - guard-shaped prose inside a message string credited a guard
        that does not exist - so literal text is removed too, while `${...}`
        interpolations are KEPT because those are code.
     3. The repository's NEGATED REFUSAL FORMS are recognised: !(x > 0),
        !(a > 0 && b > 0), !d || !(x > 0), !isFinite(...).
     4. `EPS` must be an identifier at word boundaries, not the letters inside
        an English word; `clamp` must be a call, not a word in prose.

   WHAT IT DOES NOT DECIDE. Scope is the same +/-25-line window the recorded
   Q20 contract uses. The window is the WRONG scope - a guard controlling a
   relation can sit outside it, and a guard inside it can belong to unrelated
   code - but re-scoping would silently redefine every Q20 verdict in the
   ledger, so it is left to an explicit ruling. See F-67. */

/* ---- 1. the scrubber ----------------------------------------------------
   Blank comment text and literal text, preserving every newline and every
   column so a reported line number still points at the real source line.
   A character state machine, not a regex: a regex cannot tell a // inside a
   string from a comment, cannot track a block comment across a boundary, and
   cannot keep a ${...} interpolation while dropping the text around it. */
export function scrubCode(text) {
  const out = [];
  const push = (ch) => out.push(ch === "\n" ? "\n" : " ");
  let i = 0;
  let state = "code";
  let quote = "";
  const stack = [];            /* template-literal nesting across ${ } */
  let braceDepth = 0;

  while (i < text.length) {
    const c = text[i], d = text[i + 1];

    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out.push(" ", " "); i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out.push(" ", " "); i += 2; continue; }
      if (c === '"' || c === "'") { state = "str"; quote = c; out.push(c); i++; continue; }
      if (c === "`") { state = "tmpl"; out.push(c); i++; continue; }
      if (stack.length) {
        /* inside a ${...}: track braces so the matching } returns to template */
        if (c === "{") braceDepth++;
        else if (c === "}") {
          if (braceDepth === 0) { state = "tmpl"; stack.pop(); out.push(c); i++; continue; }
          braceDepth--;
        }
      }
      out.push(c); i++; continue;
    }

    if (state === "line") {
      if (c === "\n") { state = "code"; out.push("\n"); i++; continue; }
      push(c); i++; continue;
    }

    if (state === "block") {
      if (c === "*" && d === "/") { state = "code"; out.push(" ", " "); i += 2; continue; }
      push(c); i++; continue;
    }

    if (state === "str") {
      if (c === "\\") { out.push(" ", " "); i += 2; continue; }   /* escape, blanked */
      if (c === quote) { state = "code"; out.push(c); i++; continue; }
      push(c); i++; continue;                                     /* literal text dropped */
    }

    /* state === "tmpl" */
    if (c === "\\") { out.push(" ", " "); i += 2; continue; }
    if (c === "$" && d === "{") {                                 /* interpolation is CODE */
      state = "code"; stack.push(true); braceDepth = 0; out.push("$", "{"); i += 2; continue;
    }
    if (c === "`") { state = "code"; out.push(c); i++; continue; }
    push(c); i++; continue;                                       /* template text dropped */
  }
  return out.join("");
}

/* ---- 2. the evidence rules ---------------------------------------------- */
export const RULES = [
  ["refusal-positivity", /!\s*\(\s*[A-Za-z_$][\w$.?\[\]'"]*\s*>=?\s*0\s*\)/,           "zero and negative"],
  ["refusal-compound",   /!\s*\([^)\n]*>=?\s*0\s*(?:&&|\|\|)[^)\n]*\)/,                "zero and negative across several inputs"],
  ["refusal-truthy-mix", /!\s*[A-Za-z_$][\w$.]*\s*(?:&&|\|\|)\s*!\s*\([^)\n]*>=?\s*0/, "zero, negative and absence"],
  ["refusal-finite",     /!\s*(?:Number\.)?isFinite\s*\(/,                             "NaN and Infinity"],
  ["finite-check",       /\b(?:Number\.)?isFinite\s*\(/,                               "NaN and Infinity"],
  ["nan-check",          /\b(?:Number\.)?isNaN\s*\(/,                                  "NaN"],
  ["compare-le0",        /[A-Za-z_$][\w$.?\[\]]*\s*<=\s*0\b/,                          "zero and negative"],
  ["compare-lt0",        /[A-Za-z_$][\w$.?\[\]]*\s*<\s*0\b/,                           "negative"],
  ["positive-ternary",   /[A-Za-z_$][\w$.?\[\]]*\s*>\s*0\s*\?/,                        "zero and negative"],
  ["clamp-max0",         /Math\.max\s*\(\s*0\b/,                                       "negative clamped"],
  ["clamp-min",          /Math\.min\s*\(/,                                             "upper clamp"],
  ["clamp-call",         /\bclamp\s*\(|\.clamp\s*\(/,                                  "range clamped"],
  ["tolerance-symbol",   /\b(?:EPS|EPSILON|TOL|TOLERANCE)\b/,                          "near-zero tolerance"],
  ["abs",                /Math\.abs\s*\(/,                                             "sign removed"],
  ["nullish-default",    /\?\?\s*0\b|\|\|\s*0\b/,                                      "absent becomes 0"],
];

/* Reported but never credited: substituting 0 for an ABSENT value does not
   protect against a supplied 0, a negative or a NaN. */
export const NOT_EVIDENCE = new Set(["nullish-default"]);

/* Declared redundancy, so the test suite does not pretend these are necessary.
   `refusal-truthy-mix` is PROVABLY subsumed: its inner expression is
   parenthesis-free by construction, so the token before "> 0" is always a plain
   identifier, which refusal-positivity already matches. */
export const SUBSUMED = {
  "refusal-finite": "finite-check",
  "refusal-truthy-mix": "refusal-positivity (inner expression is paren-free by construction)",
  "nullish-default": "(never counted as evidence)",
};

/* `scrubbed` must already have been through scrubCode(). */
export function detect(scrubbed, rules = RULES) {
  const hits = [], kinds = new Set();
  for (const [name, re, covers] of rules) {
    if (re.test(scrubbed)) { hits.push(name); if (!NOT_EVIDENCE.has(name)) kinds.add(covers); }
  }
  const evidence = hits.filter((h) => !NOT_EVIDENCE.has(h));
  return { hits, evidence, kinds: [...kinds], verdict: evidence.length ? "U" : "W" };
}

/* The window the recorded contract uses, 0-based half-open, as the original
   builder computes it. Kept here so the scope is stated in one place. */
export function windowOf(line, lineCount) {
  return { a: Math.max(0, line - 25), b: Math.min(lineCount, line + 25) };
}

/* First evidence line within the window, for citing a line number. */
export function firstEvidenceLine(scrubbedLines, line) {
  const { a, b } = windowOf(line, scrubbedLines.length);
  for (let i = a; i < b; i++) {
    const L = scrubbedLines[i];
    if (!L || !L.trim()) continue;
    for (const [name, re, covers] of RULES) {
      if (NOT_EVIDENCE.has(name)) continue;
      if (re.test(L)) return { rule: name, covers, line: i + 1 };
    }
  }
  return null;
}

/* ===========================================================================
   THE CHANGE-RECORD POLICY  (holder ruling on F-75, 2026-10-01)
   ===========================================================================
   What the 31 rows in AUDIT/data/q20-change-record.tsv are, and are not.

   THEY ARE historical evidence that each row was withdrawn from a FALSE,
   mechanically-derived WARNING to UNVERIFIED at the `2082ef4` checkpoint. The
   record is human-adjudicated and is never machine-written.

   THEY ARE NOT a permanent prohibition on a later WARNING. The ledger's own
   section 2 states the Q20 rule: "A guard that is present and does not cover
   the case is the WARNING condition, not the UNVERIFIED one." UNVERIFIED on
   these rows recorded a gap NOT YET MEASURED, not a verdict for all time, and
   an engineering block that measures the gap by hand must be able to record it.

   The first version of this pin asserted `ledger === "U"` for all 31 rows. That
   froze the verdict LETTER and so forbade exactly that outcome - it could not
   tell a regex re-asserting the F-65 claim from a person who had executed the
   code. That defect is F-75. The policy below protects the FAILURE MODE instead:

     U            always valid - the withdrawal stands, unexamined since.
     W            valid ONLY IF the Q20 basis records independent hand or source
                  verification AND does not re-assert the withdrawn mechanical
                  claim. Re-asserting it is the F-65 condition returning, which
                  is the thing this pin exists to stop, and on THESE rows that
                  claim is known false - the guard is demonstrably present.
     P            never valid. PASS is unreachable for Q20 by design.

   HONEST LIMIT, stated rather than hidden: a textual marker is a PERSON'S
   ASSERTION, not a proof. It has exactly the standing of the change record
   itself. What it does buy is that a tool sweeping the ledger cannot silently
   recreate the F-65 false-warning condition: to turn one of these rows back to
   WARNING it would have to delete the mechanical rationale AND write a claim of
   hand verification that a reader can check against the cited behaviour. */

/* the as-built scanner's rationale, verbatim as it was written into the ledger */
export const OLD_MECHANICAL_CLAIM = /no\s+zero\/negative\/NaN\s+guard\s+within\s+\+\/-\s*25\s+lines/i;

/* a person's assertion that the hole was established by reading or running the
   code, rather than inferred from a scan finding nothing */
export const HAND_VERIFIED = /hand-verified|hand verified|source-inspected|source inspection|verified by (inspection|execution|reading)/i;

/* the question-20 clause of a ledger basis: "20: ..." to the end of the cell */
export function q20Clause(basis) {
  const m = String(basis == null ? "" : basis).match(/(^|;\s*)20:\s*([\s\S]*)$/);
  return m ? m[2].trim() : "";
}

/* The durable invariant for one change-record row.
   Returns { ok, why } so a caller can report WHICH rule decided it. */
export function recordRowStatus({ q20, basis }) {
  const v = String(q20 == null ? "" : q20).trim();
  const clause = q20Clause(basis);
  if (v === "U") return { ok: true, why: "UNVERIFIED - the withdrawal stands" };
  if (v === "P") return { ok: false, why: "Q20 may never be PASS" };
  if (v !== "W") return { ok: false, why: `unexpected Q20 verdict ${JSON.stringify(v)}` };
  if (OLD_MECHANICAL_CLAIM.test(clause)) {
    return { ok: false,
             why: "WARNING re-asserts the withdrawn mechanical claim - that is the F-65 condition, "
                + "and on this row the claim is known false" };
  }
  if (!HAND_VERIFIED.test(clause)) {
    return { ok: false,
             why: "WARNING carries no record of hand or source verification, so it is not "
                + "distinguishable from a tool's output" };
  }
  return { ok: true, why: "WARNING, hand-verified - a measured hole, not a scan result" };
}
