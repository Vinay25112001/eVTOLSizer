/* =====================================================================
   TEST FLIGHT — the cockpit reads the sized mission, and the flight
   stops where the sizing's own checks fail, and nowhere else
   =====================================================================
   The 3D mission flight (src/panels/mission-flight-3d/) carries a test
   flight: five instruments under the stage (Cockpit.jsx), a pre-flight
   list, and a red flag that stops the playback in each phase where a
   design check fails (flight-checks.js sorts the checks into phases;
   flight-view.js turns them into stops). Nothing in it computes physics.
   This gate holds it to that:

     1. EVERY CHECK HAS A PHASE. Every label the sizing emits, across the
        six layouts and a spread of inputs, is either placed in a flown
        phase or named as a check on the design as a whole. A label the
        table does not know is reported UNCLASSIFIED, so a check the
        engine gains later fails this gate instead of being filed before
        the flight by default.
     2. IT READS THE VERDICT ONLY. The sorting reads `label`, `ok` and
        `kind` of each check and nothing else of the result (a recording
        proxy proves it), and no check's figures (`val`) reach the page.
     3. THE INSTRUMENTS ARE THE MISSION'S. Airspeed, altitude and power
        are missionPathAt's own numbers; the vertical speed equals the
        slope of the path's height, measured independently; no needle
        ever runs past its dial.
     4. THE STOPS. A flag stops the clock 1 ms inside its phase, only for
        a FAILED check (advisories and model gaps are marked, not
        stopped at), and a transition at the same boundary comes first.
     5. RENDERED. Every layout renders the pre-flight list and the
        cockpit with no null/undefined/NaN; the lift + cruise stops at
        the climb, on the climb-gradient check; flying it again in
        category Basic, where that check passes, takes the flag away.

   Run: node validation/test-flight.mjs
   ===================================================================== */
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import * as CFG from "../src/engine/configuration.js";
import { engineInputs } from "../src/lib/designfile.js";
import { missionPathAt, PHASES, PHASE_LABEL } from "../src/engine/mission-path.js";
import * as FV from "../src/panels/mission-flight-3d/flight-view.js";
import * as FC from "../src/panels/mission-flight-3d/flight-checks.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ");
const BAD = /\b(null|undefined|NaN|Infinity)\b/;
const FLOWN = PHASES.slice(0, 5);

/* The app's configuration switch, replayed from the default design as
   validation/mission-flight-3d.mjs replays it (see the note there). */
const SR0 = runSizing(engineInputs(DEFAULT_PARAMS));
function appSwitch(key) {
  const q = DEFAULT_PARAMS, dflt = CFG.CONFIG_DEFAULTS[key];
  const next = { ...q, configType: key };
  delete next.nRotorsStopped;
  next.nPropHover = dflt.nRotors;
  const solved = CFG.solveRotorDiameter(key, { ...q, configType: key, nPropHover: dflt.nRotors }, runSizing, { seedMTOW: SR0.MTOW || q.payload * 8 });
  const D = solved?.propDiam ?? CFG.rotorDiameterFor(key, SR0.MTOW || q.payload * 8, dflt.nRotors);
  if (D && isFinite(D)) next.propDiam = D;
  if (dflt.vCruise_ms && isFinite(dflt.vCruise_ms)) next.vCruise = dflt.vCruise_ms;
  if (dflt.LD_target && isFinite(dflt.LD_target)) next.LD = dflt.LD_target;
  if (dflt.etaHov && isFinite(dflt.etaHov)) next.etaHov = dflt.etaHov;
  if (dflt.tipSpeed_ms && isFinite(dflt.tipSpeed_ms)) next.tipSpeed = dflt.tipSpeed_ms;
  const w = Number(next.fusDiam) || Number(q.fusDiam) || 1.65;
  if (dflt.fusFineness && isFinite(dflt.fusFineness)) next.fusLen = +(dflt.fusFineness * w).toFixed(2);
  if (dflt.ewf && isFinite(dflt.ewf)) next.ewf = dflt.ewf;
  next.fusHeight = dflt.fusHeightRatio && isFinite(dflt.fusHeightRatio) ? +(dflt.fusHeightRatio * w).toFixed(2) : undefined;
  if (dflt.wingLoadingNm2 && isFinite(dflt.wingLoadingNm2)) next.wingLoadingNm2 = dflt.wingLoadingNm2;
  next.twRatio = Math.max(1.30, CFG.oeiThrustMarginFor(key, dflt.nRotors) ?? 1.30);
  return next;
}
const KEYS = Object.keys(CFG.CONFIGURATIONS);
const size = (p) => ({ p, r: runSizing(engineInputs(p)) });
const CASES = Object.fromEntries(KEYS.map((k) => [k, size(appSwitch(k))]));
/* A spread of inputs, so labels that appear only off the default (a
   lighter or heavier payload, the other certification category, a
   turboelectric hybrid) are classified too. */
const SPREAD = KEYS.flatMap((k) => [300, 380, 550].map((payload) => [`${k}@${payload} kg`, size({ ...CASES[k].p, payload })])
  .concat([[`${k} basic`, size({ ...CASES[k].p, vtolCategory: "basic" })]]));
const ALL = [...KEYS.map((k) => [k, CASES[k]]), ...SPREAD].filter(([, c]) => Array.isArray(c.r?.checks));

console.log("TEST FLIGHT GATE");
console.log("=".repeat(78));

/* ── 1 ─────────────────────────────────────────────────────────────── */
console.log("\n1. Every check has a phase");
{
  const labels = new Map();
  for (const [tag, { r }] of ALL) for (const c of r.checks) if (!labels.has(c.label)) labels.set(c.label, tag);
  const un = [...labels.keys()].filter((l) => FC.phaseOfCheck(l).unclassified);
  check("every label the sizing emits is placed in a flown phase or named as a design-level check",
    labels.size > 30 && un.length === 0, un.length ? un.map((l) => `"${l}" (${labels.get(l)})`).join(" | ") : `${labels.size} distinct labels over ${ALL.length} sized designs`);
  const fresh = FC.flightFlags({ checks: [{ label: "A check the engine gains later", ok: false }] });
  check("a label the table does not know is reported unclassified, not filed before the flight silently",
    FC.phaseOfCheck("A check the engine gains later").unclassified === true && fresh.Pre.length === 1 && fresh.Pre[0].unclassified === true);
  const L = [...labels.keys()], bad = [];
  for (const l of L) {
    const { phase, why } = FC.phaseOfCheck(l);
    const named = /^Hover\b/i.test(l) ? "TO" : /^Climb\b/i.test(l) ? "Climb" : /^Cruise\b/i.test(l) ? "Cruise" : /^Descent\b/i.test(l) ? "Desc" : /mission end/i.test(l) ? "Land" : null;
    if (named && (phase !== named || why !== null)) bad.push(`${l} -> ${phase}`);
    if (!named && phase !== FC.PREFLIGHT && !(typeof why === "string" && why.length > 20)) bad.push(`${l}: placed in ${phase} with no reason`);
  }
  check("a label that names its phase goes to that phase; any other placed in a phase carries its reason",
    bad.length === 0, bad.join(" | ") || `${L.filter((l) => FC.phaseOfCheck(l).phase !== FC.PREFLIGHT).length} placed in flight, ${L.filter((l) => FC.phaseOfCheck(l).phase === FC.PREFLIGHT).length} before it`);
  check("tip Mach, which mixes hover tip speed with the cruise-altitude speed of sound, is not pinned to one phase",
    FC.phaseOfCheck("Tip Mach < 0.70").phase === FC.PREFLIGHT && !FC.phaseOfCheck("Tip Mach < 0.70").unclassified);
  const sev = [];
  for (const [tag, { r }] of ALL) {
    const f = FC.flightFlags(r), items = Object.values(f).flat();
    const failing = r.checks.filter((c) => !c.ok);
    if (items.length !== failing.length) sev.push(`${tag}: ${items.length} flags for ${failing.length} failing checks`);
    for (const c of failing) {
      const want = !c.kind ? "red" : c.kind === "advisory" ? "amber" : c.kind === "omission" || c.kind === "indeterminate" ? "grey" : "?";
      const got = items.find((x) => x.label === c.label)?.severity;
      if (got !== want) sev.push(`${tag}: ${c.label} kind=${c.kind} -> ${got}`);
    }
  }
  check("every failing check is flagged once and only failing ones: hard red, advisory amber, omission or indeterminate grey",
    sev.length === 0, sev.slice(0, 3).join(" | ") || `${ALL.length} designs`);
}

/* ── 2 ─────────────────────────────────────────────────────────────── */
console.log("\n2. It reads the verdict only");
{
  const seenSR = new Set(), seenC = new Set();
  for (const [, { r }] of ALL) {
    const checks = r.checks.map((c) => new Proxy(c, { get(t, k) { if (typeof k === "string") seenC.add(k); return t[k]; } }));
    FC.flightFlags(new Proxy({ ...r, checks }, { get(t, k) { if (typeof k === "string") seenSR.add(k); return t[k]; } }));
  }
  check("sorting the checks reads `checks` of the result and `label`, `ok`, `kind` of each check, nothing else",
    [...seenSR].join() === "checks" && [...seenC].every((k) => ["label", "ok", "kind"].includes(k)), `result: ${[...seenSR].join(", ")} · check: ${[...seenC].join(", ")}`);
  const fc = read("src/panels/mission-flight-3d/flight-checks.js");
  const panel = read("src/panels/mission-flight-3d/MissionFlight3D.jsx");
  const cockpit = read("src/panels/mission-flight-3d/Cockpit.jsx");
  check("the sorting module imports nothing, and no test-flight file touches a check's figures (`val`)",
    !/^\s*import\b/m.test(fc) && ![fc, panel, cockpit].some((s) => /\.val\b|\["val"\]/.test(s)));
  const FLAGGED = /\b(MTOW|PmotKW|Torque|MotMass|CrateHov|CrateCr|Rint|Pheat|Ncells|vi_ind|DLrotor|DL_installed)\b/;
  const ACCESS = /(\.\s*|\[\s*["'])(MTOW|PmotKW|Torque|MotMass|CrateHov|CrateCr|Rint|Pheat|Ncells|vi_ind|DLrotor|DL_installed)\b/;
  /* The cockpit is held to the flight view's rule word for word. The
     sorting module is held to it as property access: it has to NAME
     "MTOW within certification limit" to classify that label, and a
     label is not a read of the mass. */
  check("no audit-flagged output and no mass is read by the cockpit or the sorting module",
    !FLAGGED.test(cockpit) && !ACCESS.test(fc), [FLAGGED.test(cockpit) && "Cockpit.jsx", ACCESS.test(fc) && "flight-checks.js"].filter(Boolean).join(", "));
  const imp = (s) => [...s.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  check("the cockpit imports the theme and nothing else; the view model still reads only the mesh builder and the mission path",
    JSON.stringify(imp(cockpit)) === JSON.stringify(["../../lib/theme.js"])
    && JSON.stringify(imp(read("src/panels/mission-flight-3d/flight-view.js"))) === JSON.stringify(["../../engine/mesh.js", "../../engine/mission-path.js"]),
    `${imp(cockpit).join(", ")}`);
}

/* ── 3 ─────────────────────────────────────────────────────────────── */
console.log("\n3. The instruments are the mission's");
{
  const bad = [], vs = [], pin = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k], tp = r.tPhases, sc = FV.instrumentScales(r, p);
    for (let i = 0; i <= 240; i++) {
      const t = (tp[5] * i) / 240, f = FV.flightFrame(r, p, t), m = missionPathAt(r, p, t), x = FV.instrumentsAt(r, f);
      const flying = m.flown && FLOWN.includes(m.phase);
      if (x.flying !== flying || x.altitudeM !== m.altitudeAglM
        || (flying ? x.airspeedMS !== m.speedMS || x.powerKW !== m.powerKW : x.airspeedMS !== null || x.powerKW !== null || x.verticalSpeedMS !== null))
        bad.push(`${k}@${t.toFixed(1)}s`);
      if (flying) {
        if (Math.abs(x.airspeedMS) > sc.airspeedMS || Math.abs(x.altitudeM) > sc.altitudeM || Math.abs(x.verticalSpeedMS) > sc.verticalSpeedMS || Math.abs(x.powerKW) > sc.powerKW) pin.push(`${k}@${t.toFixed(0)}s`);
        /* The slope of the path's own height, away from the phase ends. */
        if (m.fractionThroughPhase > 0.05 && m.fractionThroughPhase < 0.95) {
          const j = PHASES.indexOf(m.phase), h = Math.min(0.5, 0.01 * (tp[j + 1] - tp[j]));
          const slope = (missionPathAt(r, p, t + h).altitudeAglM - missionPathAt(r, p, t - h).altitudeAglM) / (2 * h);
          /* engine.js publishes the rates at three decimals (descentRateMS:
             +RoD.toFixed(3)), so the needle can sit half a unit of that last
             digit off the path's exact slope; a needle reading the wrong
             leg's rate, or the wrong sign, is off by metres per second. */
          if (!(Math.abs(slope - x.verticalSpeedMS) <= 5e-4 + 1e-6 * Math.max(1, Math.abs(slope)))) vs.push(`${k} ${m.phase}: needle ${x.verticalSpeedMS} vs path ${slope.toFixed(6)}`);
        }
      }
    }
    const big = Object.entries(sc).filter(([key]) => key !== "altitudeM").map(([key, s]) => {
      const top = Math.max(...Array.from({ length: 241 }, (_, i) => { const y = FV.instrumentsAt(r, FV.flightFrame(r, p, (tp[5] * i) / 240)); return Math.abs(Number(y?.[key]) || 0); }));
      return [key, s / top];
    }).filter(([, q]) => !(q <= 2.5));
    if (big.length) pin.push(`${k}: scale too coarse ${big.map(([a, q]) => `${a} ×${q.toFixed(2)}`).join(", ")}`);
  }
  check("airspeed, altitude and power are missionPathAt's own numbers; on the ground after landing they read nothing", bad.length === 0, bad.slice(0, 4).join(" | ") || "241 instants × 6");
  check("the vertical-speed needle equals the slope of the path's height in every leg", vs.length === 0, vs.slice(0, 3).join(" | ") || "measured by finite difference, independent of the rates");
  check("no needle runs past its dial, and no dial is more than 2.5× what the mission reaches", pin.length === 0, pin.slice(0, 3).join(" | "));
}

/* ── 4 ─────────────────────────────────────────────────────────────── */
console.log("\n4. The stops");
{
  const bad = [];
  for (const [tag, { p, r }] of ALL) {
    if (!(r.r2Converged === true) || !Array.isArray(r.tPhases)) continue;
    const f = FC.flightFlags(r), stops = FV.flagStopsOf(r, f);
    const want = FLOWN.filter((ph) => f[ph].some((x) => x.severity === "red"));
    if (JSON.stringify(stops.map((s) => s.phase)) !== JSON.stringify(want)) bad.push(`${tag}: stops ${stops.map((s) => s.phase)} want ${want}`);
    for (const s of stops) if (missionPathAt(r, p, s.t).phase !== s.phase || s.t !== r.tPhases[PHASES.indexOf(s.phase)] + FV.FLAG_OFFSET_S) bad.push(`${tag}: ${s.phase} stop at ${s.t}`);
  }
  check("the flight stops in exactly the phases with a failed check, 1 ms inside each; never for advisories, gaps or design-level checks",
    bad.length === 0, bad.slice(0, 3).join(" | ") || `${ALL.length} designs`);
  /* Every phase forced red, then the panel's own clock rule walked from
     take-off to touchdown: each stop is met once, in order, and at the
     two hover/forward boundaries the transition comes before the flag. */
  const order = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const red = Object.fromEntries(FLOWN.map((ph) => [ph, [{ label: "x", severity: "red", why: null }]]));
    const all = [...FV.transitionsOf(r, p), ...FV.flagStopsOf(r, red)];
    const seq = [];
    for (let t = 0, guard = 0; t < r.tPhases[5] && guard < 1e5; guard++) {
      const next = t + 3.7, hit = FV.firstStopBetween(all, t, next);
      if (hit) { seq.push(hit.kind === "flag" ? hit.phase : `${hit.from}>${hit.to}`); t = hit.t; } else t = next;
    }
    const want = "TO,TO>Climb,Climb,Cruise,Desc,Desc>Land,Land";
    if (seq.join() !== want) order.push(`${k}: ${seq.join()}`);
  }
  check("walking the clock meets every stop once, in order, a transition before the flag at the same boundary", order.length === 0, order.join(" | ") || "6 layouts");
  const panel = read("src/panels/mission-flight-3d/MissionFlight3D.jsx");
  check("the panel's clock uses that rule, for the stops whose boxes are ticked",
    /const hit = firstStopBetween\(\[\.\.\.\(stopAtTransitions \? transitions : \[\]\), \.\.\.\(stopAtFlags \? flagStops : \[\]\)\], prev, next\);/.test(panel)
    && /if \(hit\) \{ setT\(hit\.kind === "flag" \? hit\.t : hit\.t - 1e-3\); setPending\(hit\); setPlaying\(false\); return; \}/.test(panel));
}

/* ── 5 ─────────────────────────────────────────────────────────────── */
console.log("\n5. Rendered");
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".testflight-"));
const abs = (rel) => JSON.stringify(join(process.cwd(), rel).replace(/\\/g, "/"));
writeFileSync(join(dir, "entry.jsx"), `export { MissionFlight3D } from ${abs("src/panels/mission-flight-3d/MissionFlight3D.jsx")};\n`);
let MOD;
try {
  await build({
    entryPoints: [join(dir, "entry.jsx")], outfile: join(dir, "bundle.mjs"), bundle: true, format: "esm", platform: "node",
    jsx: "automatic", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
    external: ["react", "react-dom", "react/jsx-runtime", "recharts", "three", "three/*"],
  });
  MOD = await import(pathToFileURL(join(dir, "bundle.mjs")).href);
} finally { rmSync(dir, { recursive: true, force: true }); }
const render = (props) => {
  let html = "", err = null;
  try { html = renderToStaticMarkup(React.createElement(MOD.MissionFlight3D, props)); } catch (e) { err = e.message; }
  return { html, txt: text(html), err };
};
const vals = (r) => r.checks.filter((c) => !c.ok && typeof c.val === "string" && c.val.length >= 12).map((c) => c.val);
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const { html, txt, err } = render({ params: p, SR: r });
    const f = FC.flightFlags(r), f0 = FV.flightFrame(r, p, 0);
    const need = ["Test flight: pre-flight check", "Airspeed", "Altitude", "Vertical speed", "Power", "Phase", "stop where a check fails",
      `+${r.hoverClimbRateMS.toFixed(1)}`, `${f0.powerKW.toFixed(0)} kW shaft`, "Phov, rotor shaft power (F-13)", "Change the design on the left and fly again",
      ...f.Pre.map((x) => x.label)];
    const miss = need.filter((s) => !txt.includes(s));
    const leak = vals(r).filter((v) => txt.includes(v));
    if (err || BAD.test(txt) || miss.length || leak.length || !/data-cockpit=""/.test(html) || !/data-preflight=""/.test(html) || /role="dialog"/.test(html))
      bad.push(`${k}: ${err || (BAD.exec(txt) || [])[0] || ""} missing [${miss.join(" / ")}] ${leak.length} val leaked`);
  }
  check("every layout renders the pre-flight list and the cockpit at take-off, with no null/undefined/NaN and no check's figures",
    bad.length === 0, bad.join(" | ") || "6 layouts");

  const lc = CASES.liftcruise, f = FC.flightFlags(lc.r);
  const climb = f.Climb.find((x) => x.severity === "red");
  const st = render({ params: lc.p, SR: lc.r, initialFlag: "Climb" });
  const fr = FV.flightFrame(lc.r, lc.p, lc.r.tPhases[1] + FV.FLAG_OFFSET_S);
  const need = [`Flagged: ${PHASE_LABEL.Climb}`, climb?.label ?? "<no red climb check>", "Carry on flying", "checks list on the bar at the foot of the page",
    `+${lc.r.climbRateMS.toFixed(1)}`, `${fr.powerKW.toFixed(0)} kW electrical`];
  const miss = need.filter((s) => !st.txt.includes(s));
  check("the lift + cruise stops at the climb, on its climb-gradient check, with the cockpit in the climb",
    !!climb && /^Climb gradient/.test(climb.label) && !st.err && !miss.length && /data-flag-stop="Climb"/.test(st.html) && !BAD.test(st.txt)
    && !vals(lc.r).some((v) => st.txt.includes(v)), st.err || `missing [${miss.join(" / ")}]`);
  const none = render({ params: lc.p, SR: lc.r, initialFlag: "Cruise" });
  check("a phase with no failed check does not stop", !/role="dialog"/.test(none.html) && !none.err);

  const basic = size({ ...lc.p, vtolCategory: "basic" });
  const b = render({ params: basic.p, SR: basic.r }), bs = render({ params: basic.p, SR: basic.r, initialFlag: "Climb" });
  const cgB = basic.r.checks.find((c) => /^Climb gradient/.test(c.label));
  check("flown again in category Basic, where its climb-gradient check passes, the climb flag is gone",
    cgB?.ok === true && FC.flightFlags(basic.r).Climb.every((x) => x.severity !== "red") && !/role="dialog"/.test(bs.html)
    && b.txt.includes("No check fails during the flight") && !b.err && !BAD.test(b.txt), cgB ? `${cgB.label}: ok ${cgB.ok}` : "no climb check");
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
