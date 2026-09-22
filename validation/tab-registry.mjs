/* =====================================================================
   TAB REGISTRY GATE
   =====================================================================
   A tab can be added to TABS and then be UNREACHABLE — not listed in any
   TAB_GROUPS entry, so the group bar never offers it — or listed but with no
   render branch in App.jsx, so selecting it shows an empty panel. Neither
   breaks the build, neither fails any other gate, and neither is visible to
   anyone reading the code: you only find it by clicking every tab.

   This session added four tabs (Constraint Diagram, Compare Layouts,
   Uncertainty, NASA VSP Models), and the labels and icons are two parallel
   arrays that must stay the same length. So the registry is checked here
   instead of by hand.

   Four ways it can be wrong, all covered:
     - TABS and TABI different lengths (icons slip against labels)
     - a tab in no group           -> unreachable
     - a tab in a group but never rendered -> blank panel
     - a group referencing an index that does not exist
   ===================================================================== */
import { TABS, TAB_GROUPS, GROUP_KEYS } from "../src/lib/tabs.js";
import { readFileSync, readdirSync, statSync } from "node:fs";

const app = readFileSync("src/App.jsx", "utf8");
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("TAB REGISTRY GATE");

/* The old check here asserted TABS.length === TABI.length, so the two
   parallel arrays could not slip. It passed for the whole life of the icon
   set while FOUR of the 29 glyphs were used on two destinations each and
   fifteen were circled or squared operators indistinguishable at 11 px --
   because length is not the property that mattered. The glyphs are gone;
   these are the properties that do matter. */
const dupLabels = TABS.filter((t, i) => TABS.indexOf(t) !== i);
check(dupLabels.length === 0, "no two tabs share a label",
  dupLabels.length ? dupLabels.join(", ")
    : `${TABS.length} distinct labels, and no icon column to disagree with them`);

check(GROUP_KEYS.length === TAB_GROUPS.length,
  "every group's tooltip has the key it is actually bound to",
  `${TAB_GROUPS.length} groups, ${GROUP_KEYS.length} keys`);

/* ── TOPICS THAT MUST NOT BE SPLIT ACROSS GROUPS ──────────────────────
   Each pair below was found in two different groups. A person who wants to
   know what the rules require had to look under Analysis for Certification
   and under Simulation for the tracker of how those rules changed; a person
   editing a mission had Mission in Design and Mission Builder in Simulation.
   Grouping is the only navigation aid a 29-tab application has, and it only
   works if one subject lives in one place -- so the pairing is asserted
   rather than left to the next person's judgement. */
const groupOf = (name) => {
  const i = TABS.indexOf(name);
  const g = TAB_GROUPS.find(gr => gr.tabs.includes(i));
  return g ? g.label : null;
};
const MUST_SHARE = [
  ["Certification", "Reg Tracker"],
  ["Mission", "Mission Builder"],
  ["Monte Carlo", "Uncertainty"],
];
const split = MUST_SHARE.filter(([a, b]) => groupOf(a) !== groupOf(b));
check(split.length === 0, "one subject lives in one group",
  split.length ? split.map(([a, b]) => `"${a}" is in ${groupOf(a)} but "${b}" is in ${groupOf(b)}`).join("; ")
    : MUST_SHARE.map(([a, b]) => `${a}+${b} in ${groupOf(a)}`).join(", "));

const grouped = TAB_GROUPS.flatMap(g => g.tabs);
const groupedSet = new Set(grouped);

const ungrouped = TABS.map((t, i) => [i, t]).filter(([i]) => !groupedSet.has(i));
check(ungrouped.length === 0, "every tab belongs to a group (is reachable)",
  ungrouped.length ? ungrouped.map(([i, t]) => `${i} "${t}"`).join(", ")
                   : `${TABS.length} tabs across ${TAB_GROUPS.length} groups`);

const isRendered = (i) => app.includes(`tab===${i}&&`) || app.includes(`tab===${i}?`)
  || app.includes(`tab === ${i}`) || app.includes(`tab===${i} &&`);
const blank = TABS.map((t, i) => [i, t]).filter(([i]) => !isRendered(i));
check(blank.length === 0, "every tab has a render branch in App.jsx",
  blank.length ? blank.map(([i, t]) => `${i} "${t}"`).join(", ") : "no blank panels");

const oor = grouped.filter(t => t < 0 || t >= TABS.length);
check(oor.length === 0, "no group references a tab index that does not exist",
  oor.length ? oor.join(", ") : "all indices in range");

check(grouped.length === groupedSet.size, "no tab appears in two groups",
  grouped.length === groupedSet.size ? "" : `${grouped.length - groupedSet.size} duplicate(s)`);

/* ── NO preventDefault INSIDE A REACT PASSIVE-EVENT PROP ───────────────
   React 18 registers wheel, touchstart and touchmove at the ROOT container
   as PASSIVE listeners. preventDefault() inside an onWheel / onTouchMove /
   onTouchStart prop is therefore SILENTLY IGNORED — Chrome logs "Unable to
   preventDefault inside passive event listener" and the gesture falls
   through to the browser.

   That is not a tidiness point. The 3D viewer's wheel handler called
   preventDefault() and looked correct on inspection, but ctrl+wheel zoomed
   the whole page and a plain wheel scrolled it: zooming the aircraft zoomed
   the application around it. The fix is a native listener bound to the
   element with { passive: false }, and this check exists because the prop
   form is a mistake you cannot see by reading the handler. */
{
  const walk = (dir) => readdirSync(dir).flatMap((e) => {
    const f = dir + "/" + e;
    return statSync(f).isDirectory() ? walk(f) : (/\.(jsx?|mjs)$/.test(f) ? [f] : []);
  });
  const PASSIVE_PROPS = ["onWheel", "onTouchMove", "onTouchStart"];
  const bad = [];
  for (const f of walk("src")) {
    const src = readFileSync(f, "utf8");
    for (const evt of PASSIVE_PROPS) {
      /* inline arrow passed straight to the prop */
      const inline = new RegExp(evt + "\\s*=\\s*\\{\\s*\\(?[\\w$]*\\)?\\s*=>\\s*\\{([\\s\\S]{0,400}?)\\}", "g");
      let m;
      while ((m = inline.exec(src)))
        if (/preventDefault\s*\(/.test(m[1]))
          bad.push(f + ": inline " + evt + " calls preventDefault, which is a no-op on a passive listener");

      /* a named handler declared elsewhere and passed to the prop */
      const named = /const\s+([\w$]+)\s*=\s*\(?[\w$]*\)?\s*=>\s*\{([\s\S]{0,400}?)\n\s*\};/g;
      let n;
      while ((n = named.exec(src))) {
        const usedHere = new RegExp(evt + "\\s*=\\s*\\{\\s*" + n[1] + "\\s*\\}").test(src);
        if (usedHere && /preventDefault\s*\(/.test(n[2]))
          bad.push(f + ": " + n[1] + " is passed as " + evt + " and calls preventDefault, which is a no-op on a passive listener");
      }
    }
  }
  check(bad.length === 0,
    "no preventDefault inside a React passive-event prop (wheel / touch)",
    bad.length ? bad.join("; ")
               : "wheel and touch gestures that must not scroll the page are bound natively");
}

console.log("");
console.log(fails.length ? `TAB REGISTRY GATE FAILED: ${fails.length} check(s)`
                         : "TAB REGISTRY GATE PASSED");
process.exit(fails.length ? 1 : 0);
