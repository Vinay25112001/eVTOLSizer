/* =====================================================================
   EVERY RELATIVE IMPORT MUST RESOLVE ON A CASE-SENSITIVE CLEAN CHECKOUT
   =====================================================================
   A build on this machine proves less than it appears to. Windows is
   case-insensitive, so `./ui/Marks.jsx` and `./ui/marks.jsx` are the same
   file here and two different files on the Linux runner that builds the
   deployment. And a local build reads the working DIRECTORY, so a file
   that exists on disk but was never committed resolves perfectly here and
   is simply absent from a fresh clone.

   Both produce the same symptom, and it appears only in CI:

       Could not resolve "./ui/marks.jsx" from "src/App.jsx"

   This gate resolves every relative import in src/ against the set of
   files GIT IS TRACKING, comparing names byte for byte rather than
   case-insensitively. It answers the question the local build cannot:
   would this tree build on a clean case-sensitive checkout?
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

console.log("IMPORT RESOLUTION GATE");
console.log("=".repeat(78));

/* The authority is git, not the filesystem: a file present on disk but not
   committed is exactly the failure this exists to catch. */
const tracked = new Set(
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean));

const sources = [...tracked].filter((f) => /^src\/.*\.(jsx?|mjs)$/.test(f));
const EXT = ["", ".js", ".jsx", ".mjs", ".json", "/index.js", "/index.jsx"];

const broken = [];
let checked = 0;
for (const f of sources) {
  const text = readFileSync(f, "utf8");
  const specs = [
    ...text.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  for (const spec of specs) {
    checked++;
    /* posix separators: git tracks with forward slashes on every platform */
    const base = normalize(join(dirname(f), spec)).split("\\").join("/");
    const hit = EXT.map((e) => base + e).find((c) => tracked.has(c));
    if (!hit) {
      /* Distinguish the two causes, because the remedy differs. */
      const ciHit = EXT.map((e) => (base + e).toLowerCase())
        .find((c) => [...tracked].some((t) => t.toLowerCase() === c));
      broken.push({ from: f, spec,
        why: ciHit ? "CASE MISMATCH — resolves only on a case-insensitive filesystem"
                   : "NOT TRACKED — exists locally at best, absent from a clean clone" });
    }
  }
}

console.log(`\n   ${sources.length} source files, ${checked} relative imports resolved\n`);
if (broken.length)
  for (const b of broken.slice(0, 12))
    console.log(`   ${b.from}  ->  ${b.spec}\n       ${b.why}`);

check(broken.length === 0,
  "every relative import resolves to a file git is tracking, case exactly",
  broken.length
    ? `${broken.length} unresolvable — these build here and fail on the deployment runner`
    : `${checked} imports across ${sources.length} files, all resolving on a `
      + "case-sensitive clean checkout");

console.log("");
console.log(fails.length ? `IMPORT RESOLUTION GATE FAILED: ${fails.length} check(s)`
                         : "IMPORT RESOLUTION GATE PASSED");
process.exit(fails.length ? 1 : 0);
