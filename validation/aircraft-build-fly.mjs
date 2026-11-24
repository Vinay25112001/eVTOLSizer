/* =====================================================================
   AIRCRAFT BUILD & FLY GATE — the two aircraft studio tabs
   =====================================================================
   The Build tab assembles the sized aeroplane; the Fly tab replays the
   sized mission. Neither may compute a quantity of the aeroplane or of
   its mission, and both must say which of their numbers the sizing made
   and which they drew. This gate holds them to that.

   1. THE PLAN (build-fly/plan.js) is the general arrangement, read and
      not recomputed: its size, wing, tails and body are the general
      arrangement's own numbers; every fact names where it came from; a
      drawn fact carries no number.
   2. THE MISSION PROFILE (build-fly/mission-profile.js) prints the
      sizing's numbers only: every time, distance and fuel on a sized leg
      IS the mission segment's; a drawn leg has no time or distance; the
      one derived value is distance ÷ speed and is marked. The legs join
      end to end, start and finish on the ground, and the replay moves
      forward only.
   3. THE TABS render on the server with no bad value, print "not
      computed" wherever a number was not computed, and print the sized
      minutes where one was.
   4. THREE.JS STAYS LAZY: no tab module imports three or the scene
      statically, so the studio's first load does not carry it.
   5. THE CHECKS CAN FAIL: each predicate above is run once on a copy
      broken in exactly the way it guards against, and must reject it.
   ===================================================================== */
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("AIRCRAFT BUILD & FLY GATE");
console.log("=".repeat(72));

const ROOT = process.cwd();
const E = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/engine.js")).href);
const G = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/geometry.js")).href);
const P = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/build-fly/plan.js")).href);
const M = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/build-fly/mission-profile.js")).href);

const CASES = [];
for (const type of E.TYPE_IDS) {
  const t = E.typeOf(type);
  const analysis = Object.fromEntries(Object.entries(t.analysisInputs).map(([k, v]) => [k, v.value]));
  for (const mode of ["size", "analyse"]) {
    const params = mode === "analyse" ? { ...t.defaults, ...analysis } : { ...t.defaults };
    CASES.push({ type, mode, params, analysis, result: E.designAircraft({ type, mode, params }) });
  }
}
const FT = 0.3048;
const PROVS = new Set(["sized", "sourced", "derived", "partly", "drawn"]);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/* ── predicates, so section 5 can prove each one rejects a broken copy ── */

function planProblems(plan, ga) {
  const out = [];
  const val = G.val;
  if (!near(plan.size.length, val(ga.fuselage.length))) out.push(`length ${plan.size.length} ≠ GA ${val(ga.fuselage.length)}`);
  if (!near(plan.size.span, ga.wing.span)) out.push(`span ${plan.size.span} ≠ GA ${ga.wing.span}`);
  if (!near(plan.wing.root, ga.wing.root) || !near(plan.wing.tip, ga.wing.tip)) out.push("wing chords differ from the GA");
  if (!near(plan.ht.root, ga.ht.root) || !near(plan.vt.semi, ga.vt.height)) out.push("tail differs from the GA");
  const facts = plan.steps.flatMap((s) => s.facts.map((f) => ({ ...f, step: s.key })));
  for (const f of facts) {
    if (!PROVS.has(f.prov)) out.push(`${f.step}/${f.label}: provenance "${f.prov}"`);
    if (f.prov === "drawn" && f.value != null) out.push(`${f.step}/${f.label}: drawn but carries ${f.value}`);
    if (f.prov === "drawn" && !(typeof f.why === "string" && f.why.length > 10)) out.push(`${f.step}/${f.label}: drawn without a reason`);
    if (f.prov !== "drawn" && f.value != null && !Number.isFinite(f.value)) out.push(`${f.step}/${f.label}: ${f.value}`);
  }
  const byLabel = Object.fromEntries(facts.map((f) => [`${f.step}/${f.label}`, f]));
  const same = (k, v) => { const f = byLabel[k]; if (f && f.prov !== "drawn" && !near(f.value, v)) out.push(`${k}: prints ${f.value}, GA has ${v}`); };
  same("fuselage/Length", val(ga.fuselage.length));
  same("wing/Area", ga.wing.area);
  same("wing/Span", ga.wing.span);
  same("tail/Horizontal tail area", ga.ht.area);
  same("tail/Vertical tail area", ga.vt.area);
  const st = plan.fuselage.stations;
  if (!(st.length > 20 && st.every((s, i) => i === 0 || s.x > st[i - 1].x) && near(st[0].x, 0, 1e-6)
        && near(st[st.length - 1].x, plan.fuselage.length, 1e-6) && st.every((s) => s.a >= 0 && s.b >= 0 && Number.isFinite(s.zc)))) {
    out.push("body stations are not a clean nose-to-tail loft");
  }
  return out;
}

function profileProblems(profile, result) {
  const out = [];
  const segs = result.mission ?? [];
  const byName = (re) => segs.find((s) => re.test(s.name || ""));
  const source = { climb: byName(/^Climb$/), cruise: byName(/^Cruise$/) ?? byName(/^Trip/), descent: byName(/^Descent$/) };
  for (const l of profile.legs) {
    if (!PROVS.has(l.prov)) out.push(`${l.key}: provenance "${l.prov}"`);
    if (l.prov === "drawn" && (l.minutes != null || l.nm != null)) out.push(`${l.key}: drawn but carries a time or distance`);
    if (l.prov === "drawn" && l.kg != null && l.kind !== "ground") out.push(`${l.key}: drawn but carries fuel`);
    if (l.prov === "partly" && l.nm != null) out.push(`${l.key}: path drawn but prints a distance`);
    if (l.prov !== "sized" && !(typeof l.why === "string" && l.why.length > 10)) out.push(`${l.key}: ${l.prov} without a reason`);
    const s = source[l.key];
    if (s && (l.prov === "sized" || l.prov === "partly" || l.prov === "derived")) {
      if (l.nm != null && l.nm !== s.nm) out.push(`${l.key}: prints ${l.nm} nm, the sizing has ${s.nm}`);
      if (l.kg != null && l.kg !== s.kg) out.push(`${l.key}: prints ${l.kg} kg, the sizing has ${s.kg}`);
      if (l.prov !== "derived" && l.minutes != null && l.minutes !== s.minutes) out.push(`${l.key}: prints ${l.minutes} min, the sizing has ${s.minutes}`);
      if (l.prov === "derived" && (Number.isFinite(s.minutes) || !near(l.minutes, (s.nm / profile.kt) * 60))) out.push(`${l.key}: derived time is not distance ÷ speed`);
    }
    if (s == null && l.prov !== "drawn" && l.kind !== "ground") out.push(`${l.key}: ${l.prov} with no sized segment behind it`);
  }
  for (let i = 1; i < profile.legs.length; i++) {
    const a = profile.legs[i - 1], b = profile.legs[i];
    if (a.toM !== b.fromM) out.push(`${a.key}→${b.key}: a gap along the track`);
    if (a.toFt !== b.fromFt) out.push(`${a.key}→${b.key}: a step in height`);
  }
  /* The track is the mission's sized distance and the two drawn runway
     rolls: a drawn climb or descent must sit inside a sized distance, not
     lengthen the flight. */
  const printedM = profile.legs.reduce((a, l) => a + (Number.isFinite(l.nm) ? l.nm : 0), 0) * 1852;
  const rolls = profile.legs.filter((l) => l.kind === "ground" || l.kind === "landing").reduce((a, l) => a + (l.toM - l.fromM), 0);
  if (!near(profile.trackM, printedM + rolls, 1e-9)) out.push(`track ${(profile.trackM / 1852).toFixed(1)} nm is not the sized ${(printedM / 1852).toFixed(1)} nm plus the runway rolls`);
  const segNm = segs.filter((s) => !s.reserve && Number.isFinite(s.nm)).reduce((a, s) => a + s.nm, 0);
  if (!near(profile.missionNm, segNm, 1e-9)) out.push(`mission distance ${profile.missionNm} is not the segments' ${segNm}`);
  const first = profile.legs[0], last = profile.legs[profile.legs.length - 1];
  if (first.fromM !== 0 || first.fromFt !== 0 || last.toFt !== 0 || last.toM !== profile.trackM) out.push("does not start and end on the ground at the ends of the track");
  /* the replay moves forward only, and stays between the ground and the ceiling */
  const top = profile.cruiseFt * FT + 1e-6;
  if (Number.isFinite(result.topOfClimbFt) && profile.cruiseFt !== result.topOfClimbFt) out.push("a jet does not cruise at the sizing's top of climb");
  let prev = -1;
  for (let s = 0; s <= profile.playSeconds + 1e-9; s += 0.05) {
    const p = M.profileAt(profile, s);
    if (!(p.xM >= prev - 1e-6)) { out.push(`replay runs backwards at ${s.toFixed(2)} s`); break; }
    if (!(p.hM >= -1e-6 && p.hM <= top)) { out.push(`replay height ${p.hM} m at ${s.toFixed(2)} s`); break; }
    prev = p.xM;
  }
  const end = M.profileAt(profile, profile.playSeconds);
  if (!near(end.xM, profile.trackM) || Math.abs(end.hM) > 1e-6) out.push("replay does not finish on the arrival runway");
  return out;
}

/* ── 1 ─────────────────────────────────────────────────────────────── */
console.log("\n1. The plan is the general arrangement, read not recomputed");
for (const c of CASES) {
  const plan = P.buildPlanOf(c.result);
  if (!plan.ok) { check(`${c.type}/${c.mode}: a plan`, false, plan.refusal); continue; }
  const probs = planProblems(plan, G.generalArrangement(c.result));
  const n = plan.steps.reduce((a, s) => a + s.facts.length, 0), drawn = plan.steps.reduce((a, s) => a + s.facts.filter((f) => f.prov === "drawn").length, 0);
  check(`${c.type}/${c.mode}: ${plan.steps.length} steps, ${n} facts (${drawn} drawn), body ${plan.size.length.toFixed(1)} m, span ${plan.size.span.toFixed(1)} m`,
        probs.length === 0, probs.slice(0, 3).join(" | "));
}

/* ── 2 ─────────────────────────────────────────────────────────────── */
console.log("\n2. The mission profile prints the sizing's numbers and no others");
let refused = 0;
for (const c of CASES) {
  const prof = M.missionProfileOf(c.result);
  if (!prof.ok) {
    refused++;
    check(`${c.type}/${c.mode}: refuses, and says why`, !(c.result.mission ?? []).length && /mission/.test(prof.refusal), prof.refusal);
    continue;
  }
  const probs = profileProblems(prof, c.result);
  check(`${c.type}/${c.mode}: ${prof.legs.map((l) => `${l.key} ${l.prov}`).join(", ")}`, probs.length === 0, probs.slice(0, 3).join(" | "));
}
check("only an analysed design with no fuel breakdown is refused", refused <= 1, `${refused} refused`);
{
  const bad = [], design = [];
  for (const c of CASES) {
    const prof = M.missionProfileOf(c.result);
    if (!prof.ok) continue;
    const want = c.result.missionIsDesign === true;
    if (want) design.push(`${c.type}/${c.mode}`);
    if (prof.missionIsDesign !== want) bad.push(`${c.type}/${c.mode}: flag ${prof.missionIsDesign} vs ${want}`);
    if (want && !(near(prof.fuelCarriedKg, c.result.fuelKg) && near(prof.reachNm, c.result.rangeNm)))
      bad.push(`${c.type}/${c.mode}: carries ${prof.fuelCarriedKg} vs ${c.result.fuelKg}, reach ${prof.reachNm} vs ${c.result.rangeNm}`);
  }
  check("a replay of a design mission says so, with the fuel carried and the range it reaches",
        bad.length === 0 && design.length >= 1, bad.join(" | ") || design.join(", "));
}

/* ── 3 ─────────────────────────────────────────────────────────────── */
console.log("\n3. The tabs render, and say \"not computed\" where nothing was");
const dir = mkdtempSync(join(ROOT, "node_modules", ".buildfly-"));
const src = (p) => JSON.stringify(join(ROOT, p).replace(/\\/g, "/"));
const entry = join(dir, "entry.jsx");
writeFileSync(entry, [
  `export { AircraftBuildTab } from ${src("src/classes/aircraft/build-fly/BuildTab.jsx")};`,
  `export { AircraftFlyTab } from ${src("src/classes/aircraft/build-fly/FlyTab.jsx")};`,
  `export { fmt } from ${src("src/classes/ui-kit.jsx")};`,
].join("\n"));
const outfile = join(dir, "bundle.mjs");
let UI;
try {
  await build({
    entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
    external: ["react", "react-dom", "react/jsx-runtime", "recharts", "three", "three/*"],
  });
  globalThis.window = { location: { search: "", pathname: "/" }, history: { replaceState() {} }, matchMedia: () => ({ matches: true }) };
  UI = await import(pathToFileURL(outfile).href);
} catch (e) { check("the tabs bundle", false, e.message); }
const BAD = /\bNaN\b|\bundefined\b|Infinity|\[object Object\]/;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
if (UI) {
  for (const c of CASES) {
    const ctx = { type: c.type, mode: c.mode, params: c.params, analysis: c.analysis, result: c.result, setTab() {} };
    const bh = renderToStaticMarkup(React.createElement(UI.AircraftBuildTab, ctx));
    const plan = P.buildPlanOf(c.result);
    const firstDrawn = plan.ok ? plan.steps[0].facts.filter((f) => f.prov === "drawn") : [];
    const rowSaysNot = (html, label) => { const i = html.indexOf(`>${esc(label)}</td>`); return i >= 0 && html.slice(i, i + 400).includes("not computed"); };
    check(`${c.type}/${c.mode}: Build renders its first step, drawn rows say "not computed"`,
          !BAD.test(bh) && bh.length > 400 && firstDrawn.every((f) => rowSaysNot(bh, f.label)),
          BAD.test(bh) ? (bh.match(new RegExp(`.{0,60}(${BAD.source}).{0,30}`)) ?? [""])[0] : `${bh.length} characters, ${firstDrawn.length} drawn row(s)`);

    const fh = renderToStaticMarkup(React.createElement(UI.AircraftFlyTab, ctx));
    const prof = M.missionProfileOf(c.result);
    if (!prof.ok) { check(`${c.type}/${c.mode}: Fly renders the refusal`, !BAD.test(fh) && fh.includes(esc(prof.refusal)), `${fh.length} characters`); continue; }
    const missing = prof.legs.filter((l) => Number.isFinite(l.minutes) && !fh.includes(`${UI.fmt(l.minutes, 0)} min`)).map((l) => l.key);
    const notRows = prof.legs.filter((l) => !rowSaysNot(fh, l.label) && (l.minutes == null || l.nm == null || l.kg == null)).map((l) => l.key);
    check(`${c.type}/${c.mode}: Fly renders, prints each sized time, and "not computed" in every row missing one`,
          !BAD.test(fh) && missing.length === 0 && notRows.length === 0,
          BAD.test(fh) ? (fh.match(new RegExp(`.{0,60}(${BAD.source}).{0,30}`)) ?? [""])[0]
                       : missing.length || notRows.length ? `missing time: ${missing.join(",")}; no "not computed": ${notRows.join(",")}` : `${fh.length} characters`);
  }
}
rmSync(dir, { recursive: true, force: true });

/* ── 4 ─────────────────────────────────────────────────────────────── */
console.log("\n4. three.js stays out of the studio's first load");
const BF = "src/classes/aircraft/build-fly";
const staticThree = ["BuildTab.jsx", "FlyTab.jsx", "ui.jsx", "plan.js", "mission-profile.js"].filter((f) => {
  const code = readFileSync(join(ROOT, BF, f), "utf8");
  return /^\s*import\b[^;]*?from\s+["'](three(\/[^"']*)?|\.\/scene\.js)["']/m.test(code);
});
check("no tab module imports three or the scene statically", staticThree.length === 0, staticThree.join(", ") || "BuildTab, FlyTab, ui, plan, mission-profile");
check("the scene is fetched by a dynamic import", /import\(\s*["']\.\/scene\.js["']\s*\)/.test(readFileSync(join(ROOT, BF, "ui.jsx"), "utf8")));
check("the studio imports the tabs, not the scene", !/build-fly\/scene/.test(readFileSync(join(ROOT, "src/classes/aircraft/AircraftStudio.jsx"), "utf8")));

/* ── 5 ─────────────────────────────────────────────────────────────── */
console.log("\n5. Each check rejects a copy broken the way it guards against");
const jet = CASES.find((c) => c.type === "transport" && c.mode === "size");
const tr = CASES.find((c) => c.type === "trainer" && c.mode === "size");
const jp = M.missionProfileOf(jet.result), tp = M.missionProfileOf(tr.result);
const clone = (o) => structuredClone(o);
const mutants = [
  ["a drawn leg given a time", /landing: drawn but carries/, () => { const p = clone(jp); p.legs.find((l) => l.prov === "drawn" && l.kind === "landing").minutes = 4; return profileProblems(p, jet.result); }],
  ["a sized climb 1% longer than the sizing's", /climb: prints .* nm/, () => { const p = clone(jp); p.legs.find((l) => l.key === "climb").nm *= 1.01; return profileProblems(p, jet.result); }],
  ["a sized cruise fuel off by 1 kg", /cruise: prints .* kg/, () => { const p = clone(jp); p.legs.find((l) => l.key === "cruise").kg += 1; return profileProblems(p, jet.result); }],
  ["a derived cruise time that is not distance ÷ speed", /cruise: derived time/, () => { const p = clone(tp); p.legs.find((l) => l.key === "cruise").minutes *= 1.02; return profileProblems(p, tr.result); }],
  ["a partly-sized climb that prints a distance", /climb: path drawn but prints a distance/, () => { const p = clone(tp); p.legs.find((l) => l.key === "climb").nm = 10; return profileProblems(p, tr.result); }],
  ["a drawn climb that lengthens the flight", /is not the sized .* plus the runway rolls/, () => { const p = clone(tp); const c = p.legs.find((l) => l.key === "climb"); const d = 5000; c.toM += d; for (const l of p.legs.slice(p.legs.indexOf(c) + 1)) { l.fromM += d; l.toM += d; } p.trackM += d; return profileProblems(p, tr.result); }],
  ["a gap between two legs", /a gap along the track/, () => { const p = clone(jp); p.legs[2].fromM += 500; return profileProblems(p, jet.result); }],
  ["a replay that ends in the air", /start and end on the ground|finish on the arrival runway/, () => { const p = clone(jp); p.legs[p.legs.length - 1].toFt = 500; return profileProblems(p, jet.result); }],
  ["a plan whose span is not the GA's", /^span /, () => { const p = P.buildPlanOf(jet.result); p.size.span *= 1.02; return planProblems(p, G.generalArrangement(jet.result)); }],
  ["a drawn fact that carries a number", /drawn but carries 1\.5/, () => { const p = P.buildPlanOf(jet.result); p.steps[0].facts.find((f) => f.prov === "drawn").value = 1.5; return planProblems(p, G.generalArrangement(jet.result)); }],
  ["a printed wing area that is not the GA's", /wing\/Area: prints/, () => { const p = P.buildPlanOf(jet.result); p.steps[1].facts.find((f) => f.label === "Area").value *= 1.01; return planProblems(p, G.generalArrangement(jet.result)); }],
];
/* Each mutant must be caught by the problem it was built to cause, not by
   some other complaint that happens to fire on the same copy. */
const cleanJet = profileProblems(jp, jet.result).length + planProblems(P.buildPlanOf(jet.result), G.generalArrangement(jet.result)).length;
const cleanTr = profileProblems(tp, tr.result).length;
check("the unbroken copies the mutants start from are clean", cleanJet === 0 && cleanTr === 0, `${cleanJet + cleanTr} problem(s)`);
for (const [name, want, run] of mutants) {
  const probs = run();
  const hit = probs.find((p) => want.test(p));
  check(`rejects ${name}`, !!hit, hit ?? (probs[0] ? `caught only for another reason: ${probs[0]}` : "accepted — the check cannot fail"));
}

console.log("");
console.log(fail ? `AIRCRAFT BUILD & FLY GATE FAILED: ${fail} check(s)` : `AIRCRAFT BUILD & FLY GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
