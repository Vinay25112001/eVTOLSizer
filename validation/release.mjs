/* =====================================================================
   RELEASE GATE — one version, one changelog, one citation
   =====================================================================
   The tool showed "v2.0" in its header and reports, package.json said
   1.0.0 and CITATION.cff 0.1.0, and nothing had ever been tagged. A
   version number that depends on where you look identifies nothing.

   The rule (CHANGELOG.md, top):
     - package.json is the only place the version is written;
     - while a release is being prepared it is X.Y.Z-dev, CHANGELOG.md
       starts with "## [Unreleased]", and CITATION.cff names the last
       released version, which must have its own changelog section;
     - at a release it is X.Y.Z, CHANGELOG.md has "## [X.Y.Z] - date"
       as its first version section, and CITATION.cff has the same
       version and date-released.
   ===================================================================== */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("RELEASE GATE");
console.log("=".repeat(72));

const version = JSON.parse(read("package.json")).version;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
const m = SEMVER.exec(version);
check("package.json version is Semantic Versioning 2.0.0", !!m, version);
const dev = !!m?.[4];

const log = read("CHANGELOG.md");
const sections = [...log.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm)].map(x => ({ name: x[1], date: x[2] ?? null }));
check("CHANGELOG.md has version sections", sections.length > 0, sections.map(s => s.name).join(", "));
const released = sections.filter(s => s.name !== "Unreleased");
check("every released section has an ISO date", released.every(s => s.date), released.filter(s => !s.date).map(s => s.name).join(", "));
check("released sections are valid versions, newest first",
      released.every(s => SEMVER.test(s.name)) && released.every((s, i) => i === 0 || cmp(released[i - 1].name, s.name) > 0));
const types = [...log.matchAll(/^### (.+)$/gm)].map(x => x[1].trim());
const ALLOWED = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
check("only Keep a Changelog change types are used", types.every(t => ALLOWED.includes(t)), [...new Set(types)].join(", "));

const cff = read("CITATION.cff");
const cffVersion = /^version:\s*"?([^"\n]+)"?\s*$/m.exec(cff)?.[1];
const cffDate = /^date-released:\s*"?([^"\n]+)"?\s*$/m.exec(cff)?.[1];

if (dev) {
  check("a -dev version is being prepared under [Unreleased] at the top", sections[0]?.name === "Unreleased");
  const base = `${m[1]}.${m[2]}.${m[3]}`;
  check("the version being prepared is newer than the last release", !released[0] || cmp(base, released[0].name) > 0,
        `${base} vs ${released[0]?.name}`);
  check("CITATION.cff names the last released version", cffVersion === released[0]?.name, `${cffVersion}`);
  check("…with that release's date", cffDate === released[0]?.date, `${cffDate} vs ${released[0]?.date}`);
} else {
  check("the release is the first version section", released[0]?.name === version && sections[0]?.name !== "Unreleased",
        sections[0]?.name);
  check("CITATION.cff names this release", cffVersion === version, `${cffVersion}`);
  check("…with its date", cffDate === released[0]?.date, `${cffDate} vs ${released[0]?.date}`);
}

/* No second place writes a version. */
const hard = [];
const walk = (d) => {
  for (const e of readdirSync(join(ROOT, d))) {
    const rel = `${d}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
    else if (/\.(js|jsx)$/.test(e) && !/validation-domain\.js$/.test(e)) {
      read(rel).split("\n").forEach((l, i) => {
        if (/eVTOL Sizer v\d|SIZER v\d|>v\d+\.\d+/i.test(l)) hard.push(`${rel}:${i + 1}`);
      });
    }
  }
};
walk("src");
check("no source file hard-codes a version label", hard.length === 0, hard.join(", "));
const app = read("src/App.jsx"), rep = read("src/export/report.js"), cap = read("src/lib/capture.js");
check("the header, the report and screenshots show the build-stamp version",
      /appVersionLabel\(\)/.test(app) && (rep.match(/appVersionLabel\(\)/g) || []).length >= 2 && /appVersionLabel\(\)/.test(cap));
check("the build stamp reads package.json", /pkg\.version/.test(read("vite.config.js")));

/* ── the manuals CM-S-014 §4.2 expects, and that they match the app ──── */
{
  const { existsSync } = await import("node:fs");
  const docs = ["docs/USER-GUIDE.md", "docs/THEORY.md", "docs/API.md", "VALIDATION.md", "CHANGELOG.md"];
  const missing = docs.filter(d => !existsSync(join(ROOT, d)));
  check("user guide, theory manual, API reference and validation report exist", missing.length === 0, missing.join(", "));
  const readme = read("README.md");
  check("the README links the user guide and the theory manual",
        /docs\/USER-GUIDE\.md/.test(readme) && /docs\/THEORY\.md/.test(readme));
  const { TABS, TAB_GROUPS, GROUP_KEYS } = await import("../src/lib/tabs.js");
  const guide = existsSync(join(ROOT, "docs/USER-GUIDE.md")) ? read("docs/USER-GUIDE.md") : "";
  const drift = [];
  TAB_GROUPS.forEach((g, i) => {
    const want = `| **${g.label}** | ${GROUP_KEYS[i]} | ${g.tabs.map(t => TABS[t]).join(", ")} |`;
    if (!guide.includes(want)) drift.push(g.label);
  });
  check("the user guide's tab table matches the tab registry", drift.length === 0,
        drift.length ? `stale rows: ${drift.join(", ")}` : `${TAB_GROUPS.length} groups`);
}

function cmp(a, b) {
  const pa = a.split(/[.-]/).slice(0, 3).map(Number), pb = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

console.log("");
console.log(fail ? `RELEASE GATE FAILED: ${fail} check(s)` : `RELEASE GATE PASSED (${version}${dev ? ", in preparation" : ""})`);
process.exit(fail ? 1 : 0);
