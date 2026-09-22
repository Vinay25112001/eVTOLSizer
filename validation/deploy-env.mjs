/* =====================================================================
   THE BUILD MUST BE GIVEN THE VARIABLES THE SOURCE READS
   =====================================================================
   Vite replaces import.meta.env.VITE_X at build time with whatever X held
   in the build environment, and with `undefined` when it held nothing. It
   does not warn. So a name that differs between the workflow and the code
   produces a build that succeeds, deploys, and silently has the feature
   turned off.

   That is exactly what had happened. The deploy workflow exported

       VITE_EMAILJS_SERVICE_ID   VITE_EMAILJS_TEMPLATE_ID   VITE_EMAILJS_PUBLIC_KEY

   and the source reads

       VITE_EMAILJS_SERVICE      VITE_EMAILJS_TEMPLATE      VITE_EMAILJS_KEY

   so all three EmailJS values reached the bundle as undefined and the
   one-time-password path was dead on the live site. Nothing failed; the
   secrets were configured, the workflow logged "OK: ... is set", and the
   feature simply did not work.

   Comparing the two lists is the whole check, and neither side can be
   trusted to remember the other. Secret NAMES in the repository settings
   are free to differ — the workflow maps them — but the environment
   variable names must match the code.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from "node:fs";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

console.log("DEPLOY ENVIRONMENT GATE");
console.log("=".repeat(78));

/* every VITE_ name the application actually reads */
const walk = (d) => readdirSync(d).flatMap((e) => {
  const f = d + "/" + e;
  return statSync(f).isDirectory() ? walk(f) : (/\.(jsx?|mjs)$/.test(f) ? [f] : []);
});
const read = new Set(), optional = new Set();
for (const f of walk("src")) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)\s*(\?\?|\|\|)?/g)) {
    read.add(m[1]);
    /* A read with an explicit fallback is a variable the code is DESIGNED to
       run without: VITE_SSO_CODE ?? "" disables single sign-on when absent,
       which is the secure default and not a misconfiguration. A read with no
       fallback resolves to undefined and is a defect. */
    if (m[2]) optional.add(m[1]);
  }
}

/* every VITE_ name the workflow puts into the build environment */
const wf = readFileSync(".github/workflows/deploy.yml", "utf8");
const provided = new Set([...wf.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*:/gm)].map((m) => m[1]));

console.log("\n   source reads " + read.size + ", workflow provides " + provided.size + "\n");
console.log("   variable                      read   provided");
for (const v of [...new Set([...read, ...provided])].sort())
  console.log("   " + v.padEnd(30) + (read.has(v) ? "yes" : " no").padStart(4)
    + (provided.has(v) ? "       yes" : "        no")
    + (optional.has(v) ? "     optional (has a fallback)" : ""));

/* A variable the code reads but the build never receives becomes `undefined`
   in the bundle. That is the silent failure. */
const missing = [...read].filter((v) => !provided.has(v) && !optional.has(v));
check(missing.length === 0,
  "every variable the source reads is supplied to the build",
  missing.length
    ? missing.join(", ") + " — these compile to `undefined` in the bundle, so the "
      + "features behind them are off on the live site with no error anywhere"
    : "no variable resolves to undefined at build time");

/* The reverse is only untidy, not broken, so it is reported and not failed. */
const unused = [...provided].filter((v) => !read.has(v));
if (unused.length)
  console.log("\n   supplied but never read (harmless, but likely a rename left behind): "
    + unused.join(", "));

console.log("");
console.log(fails.length ? `DEPLOY ENVIRONMENT GATE FAILED: ${fails.length} check(s)`
                         : "DEPLOY ENVIRONMENT GATE PASSED");
process.exit(fails.length ? 1 : 0);
