/* =====================================================================
   TAB VISIBILITY GATE
   =====================================================================
   Selecting a rotor-borne layout used to leave every tab on screen, and
   the wing- and tail-dependent ones did not go quiet — they printed
   zeros and NaN:

       multicopter:  Swing 0   bWing 0   Vstall 0   VA 0
                     Svt_total NaN   Sh_eff NaN   Sv_eff NaN   SM NaN

   A tool that shows NaN where a number belongs has told the user
   something false. This gate asserts the two halves of the fix:

     1. every quantity a VISIBLE tab depends on is finite for every
        configuration — i.e. nothing on screen can be NaN;
     2. every quantity that IS NaN or zero belongs to a HIDDEN tab —
        i.e. the hiding is driven by the physics, not by a hand-written
        list that can drift from it.

   The second is the one that matters: it is what stops someone adding a
   layout and quietly getting NaN back.

   Run: node validation/tab-visibility.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { hiddenTabs, tailTabLabel, TAB } from "../src/lib/tabvisibility.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

/* What each gated tab actually needs to have a number to show. */
const NEEDS = {
  [TAB.WING_AERO]:  ["Swing", "bWing", "MAC", "wingLoadingNm2"],
  [TAB.TAIL]:       ["Sh_eff", "Sv_eff", "SM"],
  [TAB.VN_DIAGRAM]: ["Vstall", "VA"],
};

console.log("TAB VISIBILITY GATE");
console.log(bar);
console.log("a hidden tab is not a tidiness choice — it is the alternative to");
console.log("printing NaN where a number belongs\n");

const rows = [];
for (const key of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[key];
  const p0 = { ...B, configType: key, nPropHover: d.nRotors,
    vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
    etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
  const R = runSizing(p);
  const cap = CFG.capabilitiesFor(key, d.nRotors) || {};
  const hid = hiddenTabs(cap);
  rows.push({ key, R, cap, hid });
  console.log(`   ${key.padEnd(14)} wing ${String(cap.hasWing).padEnd(5)} tail ${cap.nTail}` +
    `  tab 7 reads "${tailTabLabel(cap)}"` +
    `  hidden: ${hid.size ? [...hid.keys()].join(", ") : "none"}`);
}
console.log("");

/* 1. nothing VISIBLE may be NaN */
const shown = [];
for (const { key, R, hid } of rows)
  for (const [idx, fields] of Object.entries(NEEDS)) {
    if (hid.has(+idx)) continue;
    for (const f of fields)
      if (!Number.isFinite(R[f])) shown.push(`${key}: tab ${idx} shows ${f}=${R[f]}`);
  }
check(shown.length === 0, "no visible tab depends on a quantity that is NaN",
  shown.length ? shown.slice(0, 4).join("; ")
    : "every field behind every shown tab is finite on all six layouts");

/* 2. anything NaN belongs to a HIDDEN tab — the hiding tracks the physics */
const leaked = [];
for (const { key, R, hid } of rows)
  for (const [idx, fields] of Object.entries(NEEDS)) {
    if (!hid.has(+idx)) continue;
    const anyFinite = fields.some(f => Number.isFinite(R[f]) && R[f] !== 0);
    if (anyFinite) leaked.push(`${key}: tab ${idx} hidden but ${fields.find(f => Number.isFinite(R[f]) && R[f] !== 0)} is real`);
  }
check(leaked.length === 0, "every hidden tab is hidden because its physics is absent",
  leaked.length ? leaked.join("; ")
    : "nothing is hidden that still has a number — the rule follows the layout, "
      + "not a hand-written list");

/* 3. the tail tab must not call a fin-and-stabilator a V-tail */
const mislabel = rows.filter(r => Number(r.cap.nTail ?? 0) > 0
  && ((r.cap.tailType === "conventional") !== (tailTabLabel(r.cap) !== "V-Tail")));
check(mislabel.length === 0, "the tail tab is named after the tail the layout has",
  mislabel.length ? mislabel.map(r => r.key).join(", ")
    : rows.filter(r => Number(r.cap.nTail ?? 0) > 0)
        .map(r => `${r.key}="${tailTabLabel(r.cap)}"`).join(", "));

/* 4. every layout keeps at least one tab in some group */
const empty = rows.filter(r => r.hid.size >= 29);
check(empty.length === 0, "no configuration hides everything",
  empty.length ? empty.map(r => r.key).join(", ") : "every layout has tabs to show");

console.log(`\n${bar}`);
console.log(fails.length ? `TAB VISIBILITY GATE FAILED: ${fails.length}` : "TAB VISIBILITY GATE PASSED");
process.exit(fails.length ? 1 : 0);
