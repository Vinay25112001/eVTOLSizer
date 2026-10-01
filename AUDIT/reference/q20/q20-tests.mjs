/* PHASE 2 AUDIT TOOLING - regression and mutation tests for the corrected
   question-20 detector (F-67). Durable, self-contained, no repository data read.

   Usage, from the repository root:
     node AUDIT/reference/q20/q20-tests.mjs        # exit 0 = all assertions hold

   Not a harness and deliberately not in `npm test`; see q20-reproduce.mjs.

   FOUR LAYERS, because "the tests pass" is not evidence a rule is load-bearing:
     A FIXTURES      every failure mode this detector must handle, including the
                     ones that must yield NO evidence.
     B NECESSITY     each rule is deleted in turn and some fixture's verdict must
                     move. Rules that cannot move one because a broader rule
                     always matches are DECLARED subsumed in the detector, not
                     discovered here.
     C THE OLD BUG   the as-built regex must misclassify the prose and literal
                     fixtures where this detector does not, with the mechanism
                     that fixes each one named.
     D ASYMMETRY     PASS must be unreachable, and absence of evidence must never
                     be reported as more than WARNING. */
import { scrubCode, detect, RULES, SUBSUMED } from "./q20-detector.mjs";

const NL = String.fromCharCode(10);
const Q = String.fromCharCode(34);     /* a double quote, built not escaped */
const BT = String.fromCharCode(96);    /* a backtick */

const FIXTURES = [
  /* ---- executable guards: MUST count ---- */
  { n: "refusal idiom !(x > 0)", c: "if (!(x > 0)) return null; return 1/x;", e: "U", r: "refusal-positivity" },
  { n: "compound !(a > 0 && b > 0)", c: "if (!(a > 0 && b > 0)) return null;", e: "U", r: "refusal-compound" },
  { n: "negated finiteness !isFinite(v)", c: "if (!isFinite(v)) return null;", e: "U", r: "refusal-finite" },
  { n: "Number.isFinite executable", c: "const ok = Number.isFinite(x) && x > 0;", e: "U", r: "finite-check" },
  { n: "NaN check executable", c: "if (Number.isNaN(q)) return 0;", e: "U", r: "nan-check" },
  { n: "EPS identifier executable", c: "if (d < TOLERANCE) return 0;", e: "U", r: "tolerance-symbol" },
  { n: "clamp call executable", c: "const y = clamp(x, 0, 1);", e: "U", r: "clamp-call" },
  { n: "Math.max(0,..) floor", c: "const y = Math.max(0, x - 1);", e: "U", r: "clamp-max0" },
  { n: "ISO compare-le0", c: "if (wb <= 0) return null;", e: "U", r: "compare-le0" },
  { n: "ISO compare-lt0", c: "if (z < 0) return null;", e: "U", r: "compare-lt0" },
  { n: "ISO positive-ternary", c: "const y = n > 0 ? n : 1;", e: "U", r: "positive-ternary" },
  { n: "ISO clamp-min", c: "const y = Math.min(a, b);", e: "U", r: "clamp-min" },
  { n: "ISO abs", c: "const d = Math.abs(v);", e: "U", r: "abs" },

  /* ---- comments: MUST NOT count ---- */
  { n: "English word containing eps (keeps) in a comment",
    c: "/* the shaft keeps both rotors turning */" + NL + "const y = a/b;", e: "W" },
  { n: "comment-only EPS", c: "// EPS is handled upstream" + NL + "const y = a/b;", e: "W" },
  { n: "comment-only guard", c: "/* guarded by the caller */" + NL + "const y = a/b;", e: "W" },
  { n: "comment-only clamp", c: "// we clamp(x) elsewhere" + NL + "const y = a/b;", e: "W" },
  { n: "comment-only Number.isFinite", c: "// Number.isFinite(x) is checked upstream" + NL + "const y = a/b;", e: "W" },

  /* ---- STRING AND TEMPLATE LITERALS: MUST NOT count (the F-67 correction) ---- */
  { n: "STRING: Number.isFinite(x) inside a double-quoted string",
    c: "const msg = " + Q + "Number.isFinite(x) must hold" + Q + "; return 1/x;", e: "W" },
  { n: "STRING: !(x > 0) inside a double-quoted string",
    c: "const msg = " + Q + "requires !(x > 0) first" + Q + "; return 1/x;", e: "W" },
  { n: "STRING: EPS inside a double-quoted string",
    c: "const msg = " + Q + "tolerance EPS applies" + Q + "; return 1/x;", e: "W" },
  { n: "STRING: isNaN inside a single-quoted string",
    c: "throw new Error('isNaN(v) was true');", e: "W" },
  { n: "STRING: clamp( inside a string",
    c: "const why = " + Q + "we clamp(x) upstream" + Q + ";", e: "W" },
  { n: "TEMPLATE: guard text inside a template literal",
    c: "const m = " + BT + "value !(x > 0) and EPS" + BT + ";", e: "W" },
  { n: "TEMPLATE: interpolation is still CODE and does count",
    c: "const m = " + BT + "v=${Number.isFinite(x) ? 1 : 0}" + BT + ";", e: "U", r: "finite-check" },
  { n: "STRING then real guard: the real one counts",
    c: "const msg = " + Q + "no guard here" + Q + ";" + NL + "if (!(x > 0)) return null;", e: "U", r: "refusal-positivity" },

  /* ---- not protection ---- */
  { n: "nullish default alone", c: "const n = opts.n ?? 0; return 1/n;", e: "W" },

  /* ---- by design, documented ---- */
  { n: "unrelated nearby guard still counts as nearby evidence",
    c: "if (!(other > 0)) return null;" + NL + "const y = a/b;", e: "U", r: "refusal-positivity",
    note: "UNVERIFIED means a guard is nearby and coverage unproven" },
  { n: "partial-input guard counts as evidence, not coverage",
    c: "if (!(a > 0)) return null;" + NL + "const y = a/b;", e: "U", r: "refusal-positivity",
    note: "b is unguarded; UNVERIFIED claims nothing about b" },
];

let pass = 0, fail = 0;
const ck = (c, m) => { if (c) pass++; else { fail++; console.log(`  FAIL  ${m}`); } };

console.log("A. FIXTURES");
for (const f of FIXTURES) {
  const r = detect(scrubCode(f.c));
  const ok = r.verdict === f.e;
  ck(ok, `${f.n}: expected ${f.e}, got ${r.verdict} [${r.evidence.join(",")}]`);
  if (ok) console.log(`  ok    ${f.n} -> ${r.verdict}${r.evidence.length ? " via " + r.evidence.join(",") : ""}`);
  if (f.r) ck(r.evidence.includes(f.r), `${f.n}: must be carried by ${f.r}, got [${r.evidence.join(",")}]`);
  if (f.note) console.log(`        note: ${f.note}`);
}

/* scrubbing must not move line numbers, or a cited evidence line would be wrong */
const multi = "line1" + NL + "/* c */" + NL + Q + "s" + Q + NL + "if (!(x > 0)) return 1;";
ck(scrubCode(multi).split(NL).length === multi.split(NL).length,
  "scrubCode preserves the line count so cited line numbers stay true");
ck(scrubCode(multi).split(NL)[3].includes("!(x > 0)"),
  "scrubCode leaves executable code on its original line");

console.log(NL + "B. RULE NECESSITY - delete each rule, some fixture must change verdict");
const dead = [];
for (const [name] of RULES) {
  const reduced = RULES.filter(([n]) => n !== name);
  let moved = 0;
  for (const f of FIXTURES) {
    if (detect(scrubCode(f.c)).verdict !== detect(scrubCode(f.c), reduced).verdict) moved++;
  }
  if (moved === 0) {
    if (SUBSUMED[name]) console.log(`  subs  ${name}: subsumed by ${SUBSUMED[name]}`);
    else dead.push(name);
  } else console.log(`  ok    removing ${name} changes ${moved} fixture verdict(s)`);
}
for (const d of dead) console.log(`  DEAD  ${d}: no fixture detects its removal`);
ck(dead.length === 0, `every non-subsumed rule is load-bearing (dead: ${dead.join(",") || "none"})`);

console.log(NL + "C. THE AS-BUILT BUG - the old regex must misclassify what this detector does not");
const GUARD_AS_BUILT = /Number\.isFinite|isNaN|Math\.max\s*\(\s*0|Math\.min|<=\s*0|<\s*0|>\s*0\s*\?|\|\|\s*0|\?\?\s*0|clamp|Math\.abs|EPS|guard/i;
let byScrub = 0, byShape = 0;
for (const f of FIXTURES.filter((x) => x.e === "W")) {
  const oldV = GUARD_AS_BUILT.test(f.c) ? "U" : "W";
  const newV = detect(scrubCode(f.c)).verdict;
  const newNoScrub = detect(f.c).verdict;
  ck(newV === "W", `${f.n}: corrected detector must say W (got ${newV})`);
  if (oldV === "U") {
    if (newNoScrub === "U") { byScrub++; console.log(`  ok    ${f.n}: old=U new=W, fixed by SCRUBBING`); }
    else { byShape++; console.log(`  ok    ${f.n}: old=U new=W, fixed by RULE SHAPE`); }
  } else console.log(`  --    ${f.n}: old regex also said W; not an as-built failure case`);
}
ck(byScrub >= 4, `scrubbing is load-bearing for at least 4 fixtures (got ${byScrub})`);
ck(byShape >= 1, `rule shape alone fixes at least 1 fixture (got ${byShape})`);
console.log(`  summary: ${byScrub} fixed by scrubbing, ${byShape} by rule shape`);

console.log(NL + "D. ASYMMETRY - PASS unreachable, absence stays WARNING");
let p = 0;
for (const f of FIXTURES) if (detect(scrubCode(f.c)).verdict === "P") p++;
ck(p === 0, `no fixture yields PASS (got ${p})`);
ck(detect(scrubCode("const y = a/b;")).verdict === "W", "bare arithmetic yields WARNING");
ck(detect(scrubCode("")).verdict === "W", "an empty window yields WARNING");
console.log(`  ok    PASS unreachable across ${FIXTURES.length} fixtures and 2 degenerate inputs`);

console.log(NL + `Q20 DETECTOR TESTS: ${pass} passed, ${fail} failed, ${dead.length} dead rule(s)`);
process.exit(fail ? 1 : 0);
