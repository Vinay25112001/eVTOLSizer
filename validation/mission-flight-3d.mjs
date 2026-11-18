/* =====================================================================
   MISSION FLIGHT 3D — the 3D view flies the sized aircraft on the sized
   mission, and draws nothing the sizing does not compute
   =====================================================================
   The panel (src/panels/mission-flight-3d/MissionFlight3D.jsx) sits in
   the OpenVSP tab under the 2D mission animation. This gate holds it to:

     1. EVERY CONFIGURATION, replayed through the app's own switch from
        the default design and sized through engineInputs, as the app
        sizes it:
        - the aircraft drawn is buildMesh's, exactly: the airframe and the
          rotors split out to turn add back to buildMesh's faces, at both
          nacelle endpoints;
        - every number in a frame is missionPathAt's;
        - the nacelles are drawn at the two ends of the convention only
          (helicopter mode in the vertical phases, airplane mode in the
          forward ones), never between, and the rotor axes say so;
        - stopped rotors stop and the pusher starts in forward flight
          only; on the ground nothing turns;
        - power in the vertical phases is labelled SHAFT (Phov, F-13);
        - the two hover/forward boundaries are where the view stops, with
          missionPathAt's values either side.
     2. THE PANEL, rendered (react-dom/server, the real component), for
        every configuration: no null/undefined/NaN; the HUD at take-off;
        the notices; the transition card with the right sentence for the
        layout; refusal of a non-converged sizing, of a mission whose
        cruise run is below zero, and of a result with no mission.
     3. SOURCE. three.js is imported by the scene module only, which
        imports nothing of the engine and so computes nothing; the panel
        fetches it by one dynamic import; no audit-flagged output is read;
        the OpenVSP tab mounts the panel under the 2D animation, and the
        tab count does not change.
   ===================================================================== */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import * as CFG from "../src/engine/configuration.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { buildMesh, PALETTE } from "../src/engine/mesh.js";
import { missionPathAt, groundTrackM, NOT_MODELLED, PHASES } from "../src/engine/mission-path.js";
import { TABS } from "../src/lib/tabs.js";
import { engineInputs } from "../src/lib/designfile.js";
import * as FV from "../src/panels/mission-flight-3d/flight-view.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ");
const BAD = /\b(null|undefined|NaN|Infinity)\b/;

/* THE APP'S CONFIGURATION SWITCH, replayed from the default design the
   way the configType <select> handler in App.jsx writes it: the layout's
   rotor count and its disk-loading-solved diameter (seeded, as the app
   seeds it, at the mass on screen), cruise speed, L/D, figure of merit,
   tip speed, fuselage, empty-weight fraction, wing loading and the OEI
   thrust margin, with no stopped count carried over. Each design is then
   sized as the app sizes it, through engineInputs (lib/designfile.js),
   which adds the reserve distance to the mission range; the panel is
   handed the raw parameters and that result, as OpenVSPTab hands them. */
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
  return { p: next, solved };
}
const KEYS = Object.keys(CFG.CONFIGURATIONS);
const CASES = Object.fromEntries(KEYS.map((k) => { const p = appSwitch(k).p; return [k, { p, r: runSizing(engineInputs(p)) }]; }));
const FIELDS = ["t", "phase", "label", "phaseIndex", "fractionThroughPhase", "flown", "altitudeAglM", "altitudeMslM", "groundM", "speedMS", "powerKW"];

console.log("MISSION FLIGHT 3D GATE");
console.log("=".repeat(78));

console.log("\n1. Every configuration, through the app's own switch");
check("six configurations, each converged", KEYS.length === 6 && KEYS.every((k) => CASES[k].r.r2Converged === true),
  KEYS.map((k) => `${k}:${CASES[k].r.r2Converged}`).join(" "));
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const geo = aircraftGeometry(p, r);
    for (const tilt of [FV.NACELLE_HELICOPTER_DEG, FV.NACELLE_AIRPLANE_DEG]) {
      const parts = FV.airframeParts(geo, tilt);
      const whole = buildMesh(geo, PALETTE, { nacelleTiltDeg: tilt }).length;
      const nRot = parts.rotors.reduce((s, x) => s + x.faces.length, 0);
      const nSpin = geo.bodies.filter((b) => b.kind === "rotor" || b.kind === "pusher").length;
      if (parts.unmatched !== 0 || parts.airframe.length + nRot !== whole || parts.rotors.length !== nSpin || parts.rotors.some((x) => !x.faces.length))
        bad.push(`${k}@${tilt}: ${parts.airframe.length}+${nRot} of ${whole}, ${parts.unmatched} unmatched, ${parts.rotors.length}/${nSpin} rotors`);
    }
  }
  check("the aircraft drawn is buildMesh's exactly: airframe + turning parts = every face, at both nacelle endpoints", bad.length === 0, bad.join(" | ") || "6 × 2 meshes");
}
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    for (let i = 0; i <= 60; i++) {
      const t = (r.tPhases[5] * i) / 60;
      const f = FV.flightFrame(r, p, t), m = missionPathAt(r, p, t);
      const off = FIELDS.filter((x) => f[x] !== m[x]);
      if (off.length) { bad.push(`${k} t=${t.toFixed(0)}: ${off.join(",")}`); break; }
    }
  }
  check("every number in a frame is missionPathAt's, unchanged", bad.length === 0, bad.join(" | ") || "61 instants × 6");
}
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    PHASES.slice(0, 5).forEach((ph, j) => {
      const f = FV.flightFrame(r, p, (r.tPhases[j] + r.tPhases[j + 1]) / 2);
      const want = ph === "TO" || ph === "Land" ? 90 : 0;
      if (f.phase !== ph || f.nacelleTiltDeg !== want) bad.push(`${k} ${ph}: ${f.nacelleTiltDeg}`);
      const kind = ph === "TO" || ph === "Land" ? "shaft" : "electrical";
      if (f.powerKind !== kind) bad.push(`${k} ${ph}: power ${f.powerKind}`);
      if (kind === "shaft" && f.powerKW !== r.Phov) bad.push(`${k} ${ph}: shaft power is not Phov`);
    });
    const all = [];
    for (let i = 0; i <= 200; i++) all.push(FV.flightFrame(r, p, (r.tPhases[6] * i) / 200).nacelleTiltDeg);
    if (all.some((x) => x !== 0 && x !== 90)) bad.push(`${k}: an angle between the endpoints`);
  }
  check("nacelles at the endpoints only: helicopter mode in the vertical phases, airplane mode forward, nothing between",
    bad.filter((x) => !/power/.test(x)).length === 0, bad.filter((x) => !/power/.test(x)).join(" | ") || "RAVEN 90 / 0");
  check("vertical-phase power is labelled shaft and is Phov; every other phase is electrical",
    bad.filter((x) => /power/.test(x)).length === 0, bad.filter((x) => /power/.test(x)).join(" | "));
}
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const geo = aircraftGeometry(p, r);
    const heli = FV.airframeParts(geo, 90), plane = FV.airframeParts(geo, 0);
    heli.rotors.forEach((x) => { if (x.kind === "rotor" && Math.abs(x.axis[2]) < 0.999) bad.push(`${k} ${x.label}: hover axis ${x.axis.map((v) => v.toFixed(2))}`); });
    plane.rotors.forEach((x) => { if (x.tilting && Math.abs(x.axis[0]) < 0.999) bad.push(`${k} ${x.label}: airplane-mode axis ${x.axis.map((v) => v.toFixed(2))}`); });
    plane.rotors.forEach((x) => { if (x.kind === "rotor" && !x.tilting && Math.abs(x.axis[2]) < 0.999) bad.push(`${k} ${x.label}: a non-tilting rotor moved`); });
  }
  check("the rotor axes say what the labels say: vertical in helicopter mode, fore-aft for tilting rotors in airplane mode",
    bad.length === 0, bad.slice(0, 3).join(" | ") || "every rotor, both endpoints");
}
{
  const bad = [];
  for (const k of KEYS) {
    const geo = aircraftGeometry(CASES[k].p, CASES[k].r);
    const rotors = FV.airframeParts(geo, 90).rotors;
    for (const x of rotors) {
      const v = FV.rotorTurns(x, "vertical"), f = FV.rotorTurns(x, "forward"), g = FV.rotorTurns(x, "ground");
      const want = x.kind === "pusher" ? [false, true] : x.stopped ? [true, false] : [true, true];
      if (v !== want[0] || f !== want[1] || g) bad.push(`${k} ${x.label}: ${v}/${f}/${g}`);
    }
    if (k === "multicopter" && rotors.some((x) => x.stopped || x.tilting)) bad.push("multicopter has a stopped or tilting rotor");
  }
  check("stopped rotors stop and the pusher starts in forward flight only; nothing turns on the ground", bad.length === 0, bad.slice(0, 3).join(" | ") || "rotor flags from the geometry");
}
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const tr = FV.transitionsOf(r, p);
    const ok = tr.length === 2 && tr[0].from === "TO" && tr[0].to === "Climb" && tr[1].from === "Desc" && tr[1].to === "Land"
      && tr[0].t === r.tPhases[1] && tr[1].t === r.tPhases[4]
      && tr.every((x) => {
        const b = missionPathAt(r, p, x.t - 1e-6), a = missionPathAt(r, p, x.t);
        return x.before.speedMS === b.speedMS && x.before.powerKW === b.powerKW && x.after.speedMS === a.speedMS && x.after.powerKW === a.powerKW;
      })
      && tr[0].before.powerKind === "shaft" && tr[0].after.powerKind === "electrical" && tr[1].before.powerKind === "electrical" && tr[1].after.powerKind === "shaft";
    if (!ok) bad.push(`${k}: ${JSON.stringify(tr.map((x) => x.label))}`);
  }
  check("the view stops at the two hover/forward boundaries, carrying missionPathAt's values either side", bad.length === 0, bad.join(" | ") || "take-off → climb, descent → landing");
}

/* ── Bundle the REAL panel (as validation/tab-render.mjs does). ── */
console.log("\n2. The panel, rendered");
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".flight3d-"));
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
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const { txt, err } = render({ params: p, SR: r });
    const label = CFG.CONFIGURATIONS[k].label.split(" —")[0];
    const c = FV.conversionOf(aircraftGeometry(p, r));
    const need = ["Mission flight — 3D, true scale", "Vertical take-off", `0:00 of ${Math.floor(r.tPhases[5] / 60)}:`, "ALT 0 m AGL", "GROUND 0.00 km",
      `vertical speed ${r.hoverClimbRateMS.toFixed(1)} m/s`, `${Math.round(r.Phov)} kW shaft (Phov, F-13)`, label, "level: attitude not computed",
      "Loading the 3D flight", `${(groundTrackM(r) / 1000).toFixed(1)} km ground track`, "audit finding F-13", "Drawn, not computed",
      "stop at each transition",
      /* At take-off every rotor turns and a pusher does not. */
      `${c.tilting ? "helicopter mode · " : ""}${c.rotors} of ${c.rotors + c.pushers} rotors turning`];
    const miss = need.filter((x) => !txt.includes(x));
    const nm = NOT_MODELLED.filter((n) => !txt.includes(n.what.charAt(0).toLowerCase() + n.what.slice(1)));
    if (err || BAD.test(txt) || miss.length || nm.length || !/data-stage="flight3d"/.test(render({ params: p, SR: r }).html))
      bad.push(`${k}: ${err || (BAD.exec(txt) || [])[0] || ""} missing [${miss.join(" / ")}] ${nm.length} not-modelled`);
  }
  check("every configuration renders the stage, the HUD at take-off and the notices, with no null/undefined/NaN", bad.length === 0, bad.join(" | ") || "6 configurations");
}
{
  const bad = [];
  for (const k of KEYS) {
    const { p, r } = CASES[k];
    const geo = aircraftGeometry(p, r);
    const conv = FV.conversionOf(geo);
    const tr = FV.transitionsOf(r, p);
    for (const [i, toForward] of [[0, true], [1, false]]) {
      const { txt, err } = render({ params: p, SR: r, initialTransition: i });
      const x = tr[i];
      const need = ["Transition — not modelled", x.label,
        `before · ${i === 0 ? "vertical speed" : "airspeed"} ${x.before.speedMS.toFixed(1)} m/s · ${Math.round(x.before.powerKW)} kW ${i === 0 ? "shaft (Phov, F-13)" : "electrical"}`,
        `after · ${i === 0 ? "airspeed" : "vertical speed"} ${x.after.speedMS.toFixed(1)} m/s · ${Math.round(x.after.powerKW)} kW ${i === 0 ? "electrical" : "shaft (Phov, F-13)"}`,
        "the view stops here instead of drawing it", FV.conversionSentence(conv, toForward), "Continue past the step"];
      const miss = need.filter((s) => !txt.includes(s));
      if (err || BAD.test(txt) || miss.length) bad.push(`${k}#${i}: ${err || ""} missing [${miss.join(" / ")}]`);
      /* The card is shown with the aircraft still in the state BEFORE the step. */
      if (!txt.includes(`${i === 0 ? "Vertical take-off" : "Descent"} ${mmssOf(x.t - 1e-3)}`)) bad.push(`${k}#${i}: HUD not before the step`);
    }
  }
  check("the transition card states the step with missionPathAt's numbers either side, and the right sentence for the layout",
    bad.length === 0, bad.slice(0, 3).join(" | ") || "12 cards");
  const mc = FV.conversionSentence(FV.conversionOf(aircraftGeometry(CASES.multicopter.p, CASES.multicopter.r)), true);
  const hy = FV.conversionSentence(FV.conversionOf(aircraftGeometry(CASES.hybrid.p, CASES.hybrid.r)), true);
  const lc = FV.conversionSentence(FV.conversionOf(aircraftGeometry(CASES.liftcruise.p, CASES.liftcruise.r)), true);
  check("a multicopter is said not to convert; a hybrid tilts and stops; a lift + cruise stops its lift rotors and starts its pusher",
    /does not convert/.test(mc) && /helicopter mode to airplane mode/.test(hy) && /drawn stopping/.test(hy)
    && /lift rotors? drawn stopping/.test(lc) && /cruise propeller drawn starting/.test(lc) && !/airplane mode/.test(lc), `${hy} || ${lc}`);
}
function mmssOf(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }
{
  const { p, r } = CASES.hybrid;
  const nc = render({ params: p, SR: { ...r, r2Converged: false } });
  const np = render({ params: p, SR: { ...r, tPhases: undefined } });
  check("a sizing that has not converged is refused, and nothing is drawn",
    /has not converged/.test(nc.txt) && !/data-stage=/.test(nc.html) && !nc.err, nc.txt.slice(0, 90));
  check("a result with no mission profile draws nothing", /no mission profile to fly/.test(np.txt) && !/data-stage=/.test(np.html) && !np.err);
  /* A real sizing whose cruise run is below zero: three hops of a 50 km
     mission spend more on climbs and descents than the range holds.
     missionHops is an engine input (engine.js, the two-hop NASA mission). */
  const pt = { ...CASES.hybrid.p, range: 50, missionHops: 3 }, rt = runSizing(engineInputs(pt));
  const chk = (rt.checks || []).find((c) => /^Cruise range > 0/.test(c.label));
  const tt = render({ params: pt, SR: rt });
  check("a converged sizing whose cruise run is below zero is refused, quoting the sizing's own failing check",
    rt.r2Converged === true && rt.cruiseRunM < 0 && chk && chk.ok === false && FV.flightRefusal(rt)?.kind === "negative-run"
    && tt.txt.includes(`the cruise run is ${(rt.cruiseRunM / 1000).toFixed(1)} km`) && tt.txt.includes(`"${chk.label}" fails (${chk.val})`)
    && !/data-stage=/.test(tt.html) && !BAD.test(tt.txt),
    `cruise ${rt.cruiseRunM} m · ${chk?.label}: ${chk?.val}`);
  check("every configuration as the app sizes it converges with a cruise to fly, so none is refused",
    KEYS.every((k) => FV.flightRefusal(CASES[k].r) === null), KEYS.map((k) => `${k} ${(CASES[k].r.cruiseRunM / 1000).toFixed(1)} km`).join(" · "));
}

console.log("\n3. Source");
{
  const walk = (d) => readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : [q]; });
  const srcDir = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = walk(srcDir).filter((f) => /\.(m?js|jsx)$/.test(f));
  const rel = (f) => f.slice(srcDir.length + 1).replace(/\\/g, "/");
  const threeUsers = files.filter((f) => /from\s+"three(\/[^"]*)?"/.test(readFileSync(f, "utf8"))).map(rel).sort();
  check("three.js is imported by the two scene modules only",
    JSON.stringify(threeUsers) === JSON.stringify(["classes/drone/build-fly/drone-scene.js", "panels/mission-flight-3d/flight-scene.js"]), threeUsers.join(", "));
  const scene = read("src/panels/mission-flight-3d/flight-scene.js");
  const sceneImports = [...scene.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  check("the flight scene imports three.js and its orbit control and nothing else, so it computes nothing",
    JSON.stringify(sceneImports) === JSON.stringify(["three", "three/addons/controls/OrbitControls.js"]), sceneImports.join(", "));
  const panel = read("src/panels/mission-flight-3d/MissionFlight3D.jsx");
  const sceneUsers = files.filter((f) => /(from\s+|import\()\s*"[^"]*flight-scene/.test(readFileSync(f, "utf8"))).map(rel);
  check("the panel fetches the scene by one dynamic import, and nothing else references it",
    (panel.match(/import\("\.\/flight-scene\.js"\)/g) || []).length === 1 && !/from\s+"\.\/flight-scene/.test(panel)
    && JSON.stringify(sceneUsers) === JSON.stringify(["panels/mission-flight-3d/MissionFlight3D.jsx"]), sceneUsers.join(", "));
  const view = read("src/panels/mission-flight-3d/flight-view.js");
  const viewImports = [...view.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  check("the view model reads the mesh builder and the mission path, nothing else",
    JSON.stringify(viewImports) === JSON.stringify(["../../engine/mesh.js", "../../engine/mission-path.js"]), viewImports.join(", "));
  /* Outputs the audit flags (F-25 motor sizing, F-E10 pack C-rate and
     heat, F-P04 disk loading) and the mass, which this view has no use for. */
  const FLAGGED = /\b(MTOW|PmotKW|Torque|MotMass|CrateHov|CrateCr|Rint|Pheat|Ncells|vi_ind|DLrotor|DL_installed)\b/;
  const hits = ["MissionFlight3D.jsx", "flight-view.js", "flight-scene.js"].filter((f) => FLAGGED.test(read(`src/panels/mission-flight-3d/${f}`)));
  check("no audit-flagged output and no mass is read by the view", hits.length === 0, hits.join(", "));
  const vsp = read("src/tabs/OpenVSPTab.jsx");
  const ia = vsp.indexOf("<MissionAnimation params={params} SR={SR}/>"), ib = vsp.indexOf("<MissionFlight3D params={params} SR={SR}/>");
  const between = ia >= 0 && ib > ia ? vsp.slice(ia, ib) : "";
  check("the OpenVSP tab mounts the 3D flight directly under the 2D animation",
    ia >= 0 && ib > ia && !/<Panel\b/.test(between) && (vsp.match(/<MissionFlight3D /g) || []).length === 1);
  check("no new tab: the tab list is still the 29 the validation record counts", TABS.length === 29 && TABS[15] === "OpenVSP", `${TABS.length} tabs`);
  check("every scene gets a fresh canvas, removed with it, so a rebuilt scene never inherits a released WebGL context",
    /const canvas = document\.createElement\("canvas"\);/.test(panel) && /return \(\) => \{ s\.dispose\(\); sceneRef\.current = null; canvas\.remove\(\); \};/.test(panel)
    && !/<canvas/.test(panel) && /forceContextLoss/.test(scene));
  /* The clock never runs backwards: a negative first-frame dt stepped it
     back under a transition just continued past, and it stopped there
     again (found by the Edge probe, about one run in three). */
  check("the mission clock and the scene's spin never step backwards",
    /const dt = Math\.max\(0, Math\.min\(0\.1, \(now - last\) \/ 1000\)\); last = now;\r?\n\s+const prev = tRef\.current, next = prev \+ dt \* rate;/.test(panel)
    && /const dt = Math\.max\(0, Math\.min\(0\.1, \(now - last\) \/ 1000\)\); last = now;/.test(scene));
  check("the panel observes visibility and size through window, as scope-check requires",
    /window\.IntersectionObserver/.test(panel) && /window\.ResizeObserver/.test(panel) && /window\.ResizeObserver/.test(scene)
    && !/[^.\w]IntersectionObserver\(/.test(panel.replace(/window\.IntersectionObserver/g, "")));
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
