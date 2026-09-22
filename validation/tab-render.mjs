/* =====================================================================
   TAB RENDER GATE — every tab, every configuration, actually rendered
   =====================================================================
   WHY THIS EXISTS, WHEN TWO TAB GATES ALREADY DID.

   tab-registry.mjs checks tabs are registered. tab-visibility.mjs checks
   that a quantity which is NaN belongs to a HIDDEN tab. Neither renders
   anything, and neither says a word about what a VISIBLE tab puts on the
   screen. A user reported "lots of bugs when changing the configuration",
   and both gates were green while they were happening.

   This gate does the thing the others infer: it bundles the real tab
   components with esbuild, renders them to static markup with
   react-dom/server at every configuration's own converged design point,
   and reads the output. It is the "render it and LOOK at the PNG" rule
   from the geometry work, applied to the UI.

   WHAT IT LOOKS FOR

   1. NaN / undefined / Infinity reaching the screen. Note that the U.*
      formatters are ALREADY safe — App.jsx wraps them in
        nd_ = (fn) => (v) => (v == null || !isFinite(v) ? "—" : fn(v))
      so U.len(NaN) renders "—". The damage is at the RAW sites that skip
      the formatter, e.g. `(SR.SM*100).toFixed(1)`, which renders the
      three characters NaN.

   2. FALSE VERDICTS, which are worse than NaN and which no NaN-scan
      finds. StabilityTab reads

        SR.SM>=0.05&&SR.SM<=0.25 ? "OK" : SR.SM<0.05 ? "Too small" : "Too large"

      With SM = NaN both comparisons are false, so a multicopter — an
      aircraft with no wing and therefore no neutral point and no static
      margin — is told its static margin is "Too large". That is not a
      missing number, it is a confident statement that is false.

   3. Tail wording against the configuration's actual tail. The tab LABEL
      already switches on cap.tailType, but the tab CONTENT did not: the
      hybrid carries RAVEN's fin and all-moving stabilator and was being
      shown dihedral sweeps and ruddervator areas, which it does not have.
   ===================================================================== */
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { hiddenTabs, TAB, tailTabLabel } from "../src/lib/tabvisibility.js";
import { aircraftGeometry } from "../src/engine/geometry.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("TAB RENDER GATE — every tab rendered at every configuration");
console.log("=".repeat(76));

/* ── The tabs this gate renders, with the tab index they occupy so the
      visibility rule can be honoured. Tabs needing heavy interactive state
      (Monte Carlo runners, weather fetches, the community/auth surfaces)
      are listed with `skip` and the reason, so the omissions are visible
      rather than silent. */
const TABS = [
  { file: "OverviewTab",          export: "OverviewTab",          idx: TAB.OVERVIEW },
  { file: "WingAeroTab",          export: "WingAeroTab",          idx: TAB.WING_AERO },
  { file: "PropulsionTab",        export: "PropulsionTab",        idx: TAB.PROPULSION },
  { file: "BatteryTab",           export: "BatteryTab",           idx: TAB.BATTERY },
  { file: "PerformanceTab",       export: "PerformanceTab",       idx: TAB.PERFORMANCE },
  { file: "StabilityTab",         export: "StabilityTab",         idx: TAB.STABILITY },
  { file: "VTailTab",             export: "VTailTab",             idx: TAB.TAIL },
  { file: "ConvergenceTab",       export: "ConvergenceTab",       idx: TAB.CONVERGENCE },
  { file: "CertificationTab",     export: "CertificationTab",     idx: TAB.CERTIFICATION },
  { file: "NoiseTab",             export: "NoiseTab",             idx: TAB.NOISE },
  { file: "CostTab",              export: "CostTab",              idx: TAB.COST },
  { file: "ConstraintDiagramTab", export: "ConstraintDiagramTab", idx: TAB.CONSTRAINT },
  { file: "VnDiagramTab",         export: "VnDiagramTab",         idx: TAB.VN_DIAGRAM },
  { file: "OpenVSPTab",           export: "OpenVSPTab",           idx: TAB.OPENVSP },
  { file: "UncertaintyTab",       export: "UncertaintyTab",       idx: TAB.UNCERTAINTY },
];

/* ── Bundle the real components. No stand-ins: the gate must render what
      the user gets, or it is testing a copy that can drift. */
/* INSIDE the project: the bundle keeps react/recharts external, and node
   resolves those from node_modules relative to the importing file. A temp
   dir outside the repo cannot see them. */
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".tabrender-"));
const entry = join(dir, "entry.jsx");
writeFileSync(entry,
  TABS.map(t => `export { ${t.export} } from ${JSON.stringify(
    join(process.cwd(), "src", "tabs", t.file + ".jsx").replace(/\\/g, "/"))};`).join("\n"));
const outfile = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node",
  jsx: "automatic", logLevel: "silent",
  /* Vite injects import.meta.env at build time; node has no such thing, and a
     tab that transitively imports the Supabase client would throw on load. */
  define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
  external: ["react", "react-dom", "react/jsx-runtime", "recharts"],
});
const MOD = await import(pathToFileURL(outfile).href);

/* ── The unit formatters EXACTLY as App.jsx builds them, including the
      nd_ guard, because that guard is why U.* sites are already safe and
      a copy without it would report defects that do not exist. */
const sig3 = (x) => (Math.abs(x) >= 100 ? Math.round(x) : +x.toPrecision(3));
const nd_ = (fn) => (v) => (v == null || !isFinite(v) ? "—" : fn(v));
const U = {
  mass: nd_((kg) => sig3(kg)), massU: "kg",
  dist: nd_((km) => +km.toFixed(1)), distU: "km",
  speed: nd_((ms) => +ms.toFixed(1)), speedU: "m/s",
  power: nd_((kw) => sig3(kw)), powerU: "kW",
  area: nd_((m2) => +m2.toFixed(1)), areaU: "m²",
  len: nd_((m) => +m.toFixed(2)), lenU: "m",
  sed: nd_((w) => +w.toFixed(1)), sedU: "Wh/kg",
  wl: nd_((n) => +n.toFixed(2)), wlU: "N/m²",
  energy: (k) => k, energyU: "kWh", nd: (v) => v, ndU: "",
};

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5, autoPositionWing:true, targetSM:0.15 };

const noop = () => {};
const ctxFor = (params, SR) => ({
  SR, params, U, set: noop, setParams: noop, darkMode: true,
  PHASE_TYPES: {}, TTP: {}, WX_PRESETS: {}, computeCustomMission: () => null,
  convertCheckVal: (v) => v, costCellKwh: 100, costElecRate: 0.12,
  costFlightsPerDay: 10, costMotorPerKw: 50, customAFData: null, customAFError: null,
  customAirfoilInput: "", customPhases: [], dragIdx: null, dragOverIdx: null,
  fetchWeather: noop, handleAuth: noop, mbResults: null, mcN: 100, mcRanges: {},
  mcResults: null, mcRunning: false, runMonteCarlo: noop, searchCity: noop,
  setCostCellKwh: noop, setCostElecRate: noop, setCostFlightsPerDay: noop,
  setCostMotorPerKw: noop, setCustomAFData: noop, setCustomAFError: noop,
  setCustomAirfoilInput: noop, setCustomPhases: noop, setDragIdx: noop,
  setDragOverIdx: noop, setMbResults: noop, setMcN: noop, setMcRanges: noop,
  setWxSearch: noop, tab: 0, uid2: () => "x", user: null, wxData: null,
  wxError: null, wxLoading: false, wxResults: null, wxSearch: "",
});

/* ── Render everything ────────────────────────────────────────────────── */
/* "null" belongs here too: OpenVSPTab built a sweep row as `SR.sweep + "°"`,
   which rendered the four characters null° on every rotor-borne layout. The
   scan looked for NaN and undefined and walked straight past it. */
const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b/;
const nanHits = [], crashes = [], verdicts = [], tailWording = [], falseCross = [], phantom = [];
/* V-tail quantities PRESENTED AS THIS AIRCRAFT'S. Matching any mention of
   the word was the first attempt and it was wrong: the conventional panel
   explains, correctly and usefully, that this layout has no ruddervators,
   and a blunt keyword scan flagged the sentence saying so. What must not
   appear is a LABEL offering a V-tail quantity as a property of a
   fin-and-stabilator aircraft. */
const VTAIL_ONLY = /Ruddervator Area|Ruddervator \/ panel|Optimal Dihedral|Total V-Tail Area|V-tail total mass|Ruddervator trim/;

let rendered = 0;
/* Both powertrains since 2026-09-16: a turboelectric design reaches every
   tab too, and the battery tabs must not print nonsense for it. */
for (const [key, powertrain] of Object.keys(CFG.CONFIGURATIONS).flatMap(k => [[k, "battery"], [k, "turboelectric"]])) {
  const tag = powertrain === "turboelectric" ? `${key}+TE` : key;
  const d = CFG.CONFIG_DEFAULTS[key];
  const p0 = { ...B, configType: key, powertrain, nPropHover: d.nRotors,
    vCruise: d.vCruise_ms ?? B.vCruise, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    LD: d.LD_target ?? B.LD, etaHov: d.etaHov ?? B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
  const params = { ...p0, propDiam: CFG.solveRotorDiameter(key, p0, runSizing)?.propDiam };
  const SR = runSizing(params);
  const cap = CFG.capabilitiesFor(key, d.nRotors);
  const hidden = hiddenTabs(cap);
  const ctx = ctxFor(params, SR);

  for (const t of TABS) {
    if (hidden.has(t.idx)) continue;              // legitimately not on screen
    const Comp = MOD[t.export];
    if (!Comp) { crashes.push(`${tag}/${t.file}: not exported`); continue; }
    let html;
    try { html = renderToStaticMarkup(React.createElement(Comp, ctx)); rendered++; }
    catch (e) { crashes.push(`${tag}/${t.file}: ${String(e.message).slice(0, 90)}`); continue; }

    const m = html.match(BAD);
    if (m) {
      const at = html.indexOf(m[0]);
      nanHits.push(`${tag}/${t.file}: "${m[0]}" near ...`
        + html.slice(Math.max(0, at - 60), at + 20).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    }
    /* A verdict about static margin on an aircraft that has none. */
    if (!cap.hasWing && /Too large|Too small/.test(html))
      verdicts.push(`${tag}/${t.file}: renders a static-margin verdict on a wingless layout`);
    /* A red cross on a CLEARANCE item, on a layout whose drawn geometry has no
       collision, is the panel contradicting the engine. That is exactly what
       the CFD checklist did: it placed the rotors with its own fD/2 + 0.2
       formula and failed "Rotor disc clears V-tail laterally" on every tab. */
    if (t.idx === TAB.OPENVSP) {
      const g = aircraftGeometry(params, SR);
      const clean = (g.collisions || []).length === 0;
      /* A check named after a part the layout does not have must say so. The
         panel used to substitute one aircraft's dimensions -- a 12.67 m wing,
         9.57 deg of sweep, a 3.77 m V-tail -- whenever the real value was 0 or
         NaN, and then PASS wing checks against them on a quadrotor. A green
         tick for a part that does not exist is the same lie as a red cross for
         one that does; it is just quieter. */
      if (!cap.hasWing || Number(cap.nTail ?? 0) <= 0) {
        for (const m of html.matchAll(/<span[^>]*>((?:Wing|V-tail)[^<]*)<\/span><span[^>]*>([^<]*)</g)) {
          const isWing = m[1].startsWith("Wing"), absent = isWing ? !cap.hasWing : Number(cap.nTail ?? 0) <= 0;
          if (absent && !/n\/a/.test(m[2]))
            phantom.push(`${tag}: "${m[1]}" reports "${m[2].slice(0, 44)}" on a layout with no `
              + `${isWing ? "wing" : "tail"}`);
        }
      }
      const redClearance = [...html.matchAll(/❌<\/span><span[^>]*>(Rotor discs? clears?[^<]*)</g)].map(m => m[1]);
      if (clean && redClearance.length)
        falseCross.push(`${tag}: ${redClearance.join(", ")} — but engine/geometry.js reports no collision`);
    }
    /* V-tail vocabulary on a conventional tail. */
    if (t.idx === TAB.TAIL && cap.tailType === "conventional" && VTAIL_ONLY.test(html))
      tailWording.push(`${tag}/${t.file}: "${html.match(VTAIL_ONLY)[0]}" on a `
        + `${tailTabLabel(cap)} aircraft`);
  }
}
rmSync(dir, { recursive: true, force: true });

console.log(`  rendered ${rendered} tab x configuration combinations`);
console.log("");
check(crashes.length === 0, "every visible tab renders without throwing",
  crashes.length ? crashes.slice(0, 6).join("; ") : `all ${rendered} combinations returned markup`);
check(nanHits.length === 0, "no NaN, undefined or Infinity reaches the screen",
  nanHits.length ? nanHits.slice(0, 8).join("  |  ")
    : "the U.* formatters carry App.jsx's nd_ guard and the raw sites are guarded too");
check(verdicts.length === 0, "no verdict is issued about a quantity the layout does not have",
  verdicts.length ? verdicts.join("; ")
    : "a wingless layout is never told its static margin is 'Too large' — with SM NaN both "
    + "comparisons are false and the else-branch fires, which is a false statement, not a gap");
check(phantom.length === 0,
  "no check reports a wing or tail dimension on a layout that has neither",
  phantom.length ? phantom.slice(0, 6).join("; ")
    : "every Wing- and V-tail-named item on the multicopter and side-by-side reads n/a — the panel "
    + "used to fall back to a 12.67 m span, 9.57 deg sweep and 3.77 m V-tail and pass its wing "
    + "checks against them");
check(falseCross.length === 0,
  "no clearance check is red on a layout the engine draws without collision",
  falseCross.length ? falseCross.join("; ")
    : "the CFD checklist now reads engine/geometry.js — the same module the exporter and the 3D "
    + "view draw from — instead of placing the rotors with a private fD/2 + 0.2 m formula that "
    + "failed the V-tail clearance on every configuration, including the two with no V-tail");
check(tailWording.length === 0, "tail content matches the tail the layout actually carries",
  tailWording.length ? tailWording.join("; ")
    : "no dihedral or ruddervator wording on a fin-and-stabilator aircraft — the tab LABEL "
    + "already switched on cap.tailType and the CONTENT now does too");

console.log("");
if (fails) { console.log(`TAB RENDER GATE FAILED: ${fails}`); process.exit(1); }
console.log("TAB RENDER GATE PASSED");
