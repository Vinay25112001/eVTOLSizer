/* =====================================================================
   RENDERED-INTERFACE AUDIT — every tab, both themes, checked not looked at
   =====================================================================
   Every interface defect in this project was found the same way: somebody
   rendered a screen and happened to look at the right part of it. A 48 px
   dice emoji survived a whole emoji audit because it sat below the fold.
   Grid lines were drawn in the panel-border colour for months. SC.dim was
   used as a text colour in 57 places at 1.39:1.

   That method has a ceiling and this is what raises it. src/ui/audit.js
   runs inside the real application, over the resolved DOM with computed
   styles, and asserts what a careful reviewer would notice: text below the
   WCAG AA contrast ratio for its size, controls that render nothing at all,
   and content wider than the box holding it. This driver sweeps every tab
   in both themes and aggregates.

   It is not a screenshot differ. Screenshots tell you something changed;
   they cannot tell you what is wrong, and they fail on every legitimate
   change. These are assertions about the rendered result.

   REQUIRES a built app and a preview server, so it is run on demand rather
   than from `npm test` — a gate that needs a browser and a port does not
   belong in a loop developers run constantly.
     npx vite build && npx vite preview --port 5401 &
     node validation/ui-audit.mjs
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TABS } from "../src/lib/tabs.js";

const PORT = process.env.AUDIT_PORT || 5401;
const CHROME = process.env.CHROME
  || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TMP = process.env.TEMP || ".";
const ONLY = process.argv.includes("--quick") ? [0, 2, 5, 9, 11, 19] : null;

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

function auditOne(tab, theme) {
  const url = `http://localhost:${PORT}/?tab=${tab}&theme=${theme}&audit=1`;
  let dom = "";
  try {
    dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--window-size=1600,1200",
      "--virtual-time-budget=9000", "--dump-dom", url],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
  const m = dom.match(/<script type="application\/json" id="ui-audit">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

console.log("RENDERED-INTERFACE AUDIT");
console.log("=".repeat(78));

const tabs = ONLY || TABS.map((_, i) => i);
const all = [];
let unreachable = 0;
console.log(`\nsweeping ${tabs.length} tab(s) x 2 themes on port ${PORT}\n`);
console.log("   tab                     theme   elements   contrast   empty   overflow");
for (const t of tabs) {
  for (const theme of ["light", "dark"]) {
    const r = auditOne(t, theme);
    if (!r) { unreachable++; console.log("   " + String(TABS[t]).padEnd(22) + " " + theme.padEnd(7) + "   UNREACHABLE"); continue; }
    const by = (k) => r.findings.filter((f) => f.kind === k).length;
    all.push({ tab: t, label: TABS[t], theme, findings: r.findings });
    console.log("   " + String(TABS[t]).padEnd(22) + " " + theme.padEnd(7)
      + String(r.counted).padStart(9) + String(by("contrast")).padStart(11)
      + String(by("empty-control")).padStart(8) + String(by("overflow")).padStart(11));
  }
}

check(unreachable === 0, "every tab renders and reports an audit in both themes",
  unreachable ? `${unreachable} tab/theme combinations produced no audit node`
              : `${all.length} combinations audited`);

/* ── aggregate by CAUSE, not by occurrence ──────────────────────────── */
const flat = all.flatMap((a) => a.findings.map((f) => ({ ...f, theme: a.theme, label: a.label })));

const empties = flat.filter((f) => f.kind === "empty-control");
check(empties.length === 0, "no control renders with nothing in it",
  empties.length
    ? [...new Set(empties.map((e) => e.where))].slice(0, 6).join("; ")
    : "every button and link has text, an accessible name or a graphic");

const invisible = flat.filter((f) => f.kind === "invisible-text");
check(invisible.length === 0, "no text is drawn in its own background colour",
  invisible.length ? [...new Set(invisible.map((e) => e.text))].slice(0, 5).join(" | ")
                   : "no element resolves to a contrast below 1.15:1");

/* Contrast is reported by the COLOUR PAIR responsible, because one token
   used in the wrong place produces hundreds of findings that are all the
   same defect. */
const pairs = new Map();
for (const f of flat.filter((x) => x.kind === "contrast")) {
  const m = f.detail.match(/([\d.]+):1 .*? — (rgb\([^)]*\)) on (rgb\([^)]*\))/);
  if (!m) continue;
  const key = `${m[2]} on ${m[3]}`;
  const cur = pairs.get(key) || { ratio: parseFloat(m[1]), n: 0, themes: new Set() };
  cur.n++; cur.themes.add(f.theme);
  pairs.set(key, cur);
}
const ranked = [...pairs.entries()].sort((a, b) => b[1].n - a[1].n);
if (ranked.length) {
  console.log("\nContrast failures grouped by the colour pair responsible:\n");
  console.log("   occurrences  ratio   themes        foreground on background");
  for (const [k, v] of ranked.slice(0, 8))
    console.log("   " + String(v.n).padStart(11) + v.ratio.toFixed(2).padStart(8)
      + "   " + [...v.themes].join("+").padEnd(12) + "  " + k);
}
check(ranked.length === 0, "all text meets the WCAG AA contrast ratio for its size",
  ranked.length
    ? `${flat.filter(f => f.kind === "contrast").length} occurrences from ${ranked.length} `
      + `distinct colour pair(s) — the worst is ${ranked[0][1].ratio.toFixed(2)}:1 on `
      + `${ranked[0][1].n} elements, which is one token used in the wrong role rather `
      + `than ${ranked[0][1].n} separate mistakes`
    : "every text element clears 4.5:1, or 3:1 where it is large");

const over = flat.filter((f) => f.kind === "overflow");
check(over.length === 0, "no content is wider than the box holding it",
  over.length ? [...new Set(over.map((o) => o.where))].slice(0, 5).join("; ")
              : "nothing clips horizontally outside a scroll container");

try {
  mkdirSync(`${TMP}/evtol-ui-audit`, { recursive: true });
  const out = `${TMP}/evtol-ui-audit/findings.json`;
  writeFileSync(out, JSON.stringify(all, null, 1));
  console.log(`\n   full findings written to ${out}`);
} catch { /* reporting only */ }

console.log("");
console.log(fails.length ? `UI AUDIT FAILED: ${fails.length} check(s)`
                         : "UI AUDIT PASSED");
process.exit(fails.length ? 1 : 0);
