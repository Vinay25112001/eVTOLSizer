/* ═══════════════════════════════════════════════════════════════════════
   SCOPE CHECK — unresolved identifier detector
   ═══════════════════════════════════════════════════════════════════════
   Parses every source file and reports identifiers that are REFERENCED but
   never bound: not imported, not declared, not a parameter, not a known
   runtime global.

   Why this exists: a regex-based version of this check missed `{...TTP}`,
   because JSX spread puts the identifier immediately after a dot and the
   pattern's lookbehind treated that as a property access. Ten tab files
   shipped referencing an unbound `TTP` and the production build passed —
   bundlers do not resolve free variables, they leave them to the runtime.
   Only a real parser with real scope analysis catches this class of bug.

     node validation/scope-check.mjs

   Exit code 1 if anything is unresolved, so it can gate CI.
   ═══════════════════════════════════════════════════════════════════════ */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const traverse = _traverse.default || _traverse;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/* Identifiers that legitimately have no binding in the module. */
const RUNTIME_GLOBALS = new Set([
  "window","document","console","navigator","location","localStorage","sessionStorage",
  "fetch","URL","URLSearchParams","Blob","FileReader","Image","XMLSerializer","MediaStream",
  "RTCPeerConnection","RTCSessionDescription","RTCIceCandidate","AbortController",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame",
  "Math","JSON","Date","Number","String","Boolean","Object","Array","Promise","Set","Map",
  "Error","RegExp","Symbol","BigInt","Intl","parseFloat","parseInt","isNaN","isFinite",
  /* The other standard error constructors. `Error` was listed and its six
     siblings were not, so the first `throw new TypeError(...)` in the codebase
     was reported as an unbound identifier — the checker flagging a JavaScript
     builtin rather than a defect. */
  "TypeError","RangeError","SyntaxError","ReferenceError","EvalError","URIError","AggregateError",
  "encodeURIComponent","decodeURIComponent","btoa","atob","crypto","structuredClone",
  "alert","confirm","prompt","performance","process","globalThis","undefined","NaN","Infinity",
  "Uint8Array","Uint16Array","Float32Array","ArrayBuffer","DataView","TextEncoder","TextDecoder",
  "React","katex","import","require","module","exports","__dirname","HTMLElement","Event",
  /* Build-time constant substituted by vite.config.js (define). It has no
     binding outside a build, so its one reader (lib/designfile.js) guards it
     with typeof, and validation/design-file.mjs checks that it is read
     nowhere else and never unguarded. */
  "__EVTOL_BUILD__",
]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

let failures = 0, checked = 0;
const report = [];

for (const file of walk(SRC).sort()) {
  const code = readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"],
    });
  } catch (err) {
    report.push({ file, parseError: err.message });
    failures++;
    continue;
  }
  checked++;

  /* Babel records every identifier referenced with no binding anywhere in the
     file's scope chain as a "global" on the Program scope. That is precisely
     the set we want — it includes JSX spread arguments, which is what the
     regex approach could not see. */
  let unresolved = [];
  traverse(ast, {
    Program(path) {
      unresolved = Object.keys(path.scope.globals).filter((n) => !RUNTIME_GLOBALS.has(n));
    },
  });
  if (unresolved.length) {
    report.push({ file, unresolved });
    failures++;
  }
}

const bar = "═".repeat(74);
console.log(bar);
console.log(`SCOPE CHECK — ${checked} file(s) parsed`);
console.log(bar);

if (!report.length) {
  console.log("PASS — every referenced identifier is imported, declared or a runtime global.");
  process.exit(0);
}

for (const r of report) {
  const rel = relative(ROOT, r.file).replace(/\\/g, "/");
  if (r.parseError) { console.log(`  ${rel}\n      PARSE ERROR: ${r.parseError}`); continue; }
  console.log(`  ${rel}`);
  console.log(`      unresolved: ${r.unresolved.join(", ")}`);
}
console.log(`\nFAIL — ${failures} file(s) reference identifiers that are never bound.`);
console.log("These will throw at runtime the moment that code path renders.");
process.exit(1);
