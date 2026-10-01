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
