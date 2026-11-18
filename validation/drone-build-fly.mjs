/* =====================================================================
   BUILD & FLY — the guided build and the arena show the sized design
   =====================================================================
   The Build tab (src/classes/drone/build-fly/BuildTab.jsx) edits the one
   design every drone tab reads; the Fly tab (FlyTab.jsx) flies it with
   live-flight.js, whose physics validation/drone-live-flight.mjs holds
   bit-identical to the Flight sim. This gate holds the two TABS to:

     1. THE STEPS. Ten steps, parts to review, the same list the
        workbench poses; every field a step sets is a field of the design;
        the rotor-count reconciliation and the catalogue labels say what
        the catalogue and the sizing say.
     2. THE BUILD TAB, rendered (react-dom/server, the real components):
        every step renders with no "null", "undefined" or "NaN" on screen;
        the spec sheet's numbers are sizeDrone()'s, to the printed digit;
        a frame whose rotor count differs from the sizing's is named and
        offered a one-click match; the frame diagrams share ONE caption;
        "You'll need" and "Do this" quote the design's own numbers.
     3. THE FLY TAB, rendered: a converged design whose rotor count
        matches its frame gets the arena; a mismatch or a design that
        does not converge is refused, saying why; the notices name what is
        not modelled and the audit findings on the flight sim (F-101,
        F-102), with F-101's figures as AUDIT/FINDINGS.md states them.
     4. SOURCE. three.js is imported by drone-scene.js and the parts it
        draws with (drone-parts.js) alone, and neither imports any physics;
        the two tabs fetch the scene by ONE dynamic import each, so the
        studio's bundle carries no 3D; the arena draws the same obstacles
        the flight is checked against; the studio lists Build and Fly
        first and its tab bar wraps.
     5. TRUE SCALE. The drone model, built in Node, is measured: a motor's
        stator and shaft, a propeller's tip radius and twist, an ESC's
        case, every cell, and the rotor positions are the catalogue's and
        the airframe builder's numbers; a part with no published size is
        named as drawn.
   ===================================================================== */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILD_STEPS, rotorMismatch, massLabelG, isFourInOne } from "../src/classes/drone/build-fly/build-steps.js";
import { DESIGN_DEFAULTS } from "../src/classes/drone/design-state.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { ESCS } from "../src/data/drone-components.js";
import { LOITER_WITHDRAWN } from "../src/classes/drone/dynamics.js";
import { BENCH_STEPS } from "../src/classes/drone/build-fly/drone-scene.js";
import { buildDrone } from "../src/classes/drone/build-fly/drone-parts.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, BATTERIES } from "../src/data/drone-components.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { billOfMaterials, partFacts } from "../src/classes/drone/build-fly/build-steps.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const frameOf = (c, t) => FRAMES.find((f) => f.frameClass === c && f.frameType === t);
const QUAD_X = frameOf("QUAD", "X"), HEXA_X = frameOf("HEXA", "X");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const BAD = /\b(null|undefined|NaN)\b/;

console.log("DRONE BUILD & FLY GATE");
console.log("=".repeat(78));

console.log("\n1. The steps");
{
  const keys = BUILD_STEPS.map((s) => s.key);
  check("ten steps, parts first and review last, and the workbench poses the same ten",
    keys.join(",") === "parts,frame,motor,prop,esc,cell,pack,avionics,mission,review" && BENCH_STEPS.join(",") === keys.join(","), keys.join(","));
  const unknown = BUILD_STEPS.flatMap((s) => s.sets).filter((k) => !(k in DESIGN_DEFAULTS));
  const unset = Object.keys(DESIGN_DEFAULTS).filter((k) => k !== "escId" && !BUILD_STEPS.some((s) => s.sets.includes(k)));
  check("every field a step sets is a design field, and every design field but the ESC default has a step",
    unknown.length === 0 && unset.length === 0 && BUILD_STEPS.find((s) => s.key === "esc").sets.includes("escId"),
    `unknown [${unknown}] · no step [${unset}]`);
  check("the rotor counts are reconciled: equal is no mismatch, unequal names both, no frame is no claim",
    rotorMismatch({ rotors: 4 }, QUAD_X) === null
    && JSON.stringify(rotorMismatch({ rotors: 4 }, HEXA_X)) === JSON.stringify({ sized: 4, frame: 6 })
    && rotorMismatch({ rotors: 4 }, null) === null);
  check("a catalogue mass reads as published: a number, versions with the one the sizing uses, or not published",
    massLabelG(12) === "12 g" && massLabelG(null) === "mass not published"
    && massLabelG({ version_a: 50, version_b: 45 }) === "50 / 45 g · sized at 45 g" && massLabelG({}) === "mass not published");
  const quads = ESCS.filter(isFourInOne).map((e) => e.model);
  const missed = ESCS.filter((e) => !isFourInOne(e) && /4\s*-?\s*in\s*-?\s*1|4in1/i.test(e.model));
  check("every 4-in-1 board in the catalogue is flagged and no single ESC is",
    quads.length >= 1 && missed.length === 0 && !ESCS.filter(isFourInOne).some((e) => /single/i.test(e.model)),
    quads.join(" | "));
}

/* ── Bundle the REAL components (as validation/tab-render.mjs does). ── */
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".buildfly-"));
const abs = (rel) => JSON.stringify(join(process.cwd(), rel).replace(/\\/g, "/"));
writeFileSync(join(dir, "entry.jsx"), `
import { useDroneDesign } from ${abs("src/classes/drone/design-state.js")};
import { sizeDrone } from ${abs("src/classes/drone/sizing.js")};
import BuildTab from ${abs("src/classes/drone/build-fly/BuildTab.jsx")};
import FlyTab from ${abs("src/classes/drone/build-fly/FlyTab.jsx")};
export function BuildHarness({ frame, step, sink }) {
  const d = useDroneDesign(); sink.design = d;
  return <BuildTab design={d} frame={frame} pickFrame={() => {}} onFly={() => {}} dark={false} initialStep={step} />;
}
export function FlyHarness({ frame, impossible, sink }) {
  const d0 = useDroneDesign();
  let d = d0;
  if (impossible) {
    let result;
    try { result = sizeDrone({ mission: { payloadKg: 60, hoverEnduranceMin: 240 }, selection: d0.selection, declared: d0.declared }); }
    catch (e) { result = { status: "infeasible", reason: "inputs rejected", detail: e.message }; }
    d = { ...d0, result, ok: !!(result.status && result.status.startsWith("converged")) };
  }
  sink.design = d;
  return <FlyTab design={d} frame={frame} dark={false} onBuild={() => {}} />;
}
`);
let MOD;
try {
  await build({
    entryPoints: [join(dir, "entry.jsx")], outfile: join(dir, "bundle.mjs"), bundle: true, format: "esm", platform: "node",
    jsx: "automatic", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
    external: ["react", "react-dom", "react/jsx-runtime", "recharts", "three", "three/*"],
  });
  MOD = await import(pathToFileURL(join(dir, "bundle.mjs")).href);
} finally { /* the bundle is loaded; the folder can go */ }
const render = (Comp, props) => {
  const sink = {};
  let html = "", err = null;
  try { html = renderToStaticMarkup(React.createElement(Comp, { ...props, sink })); } catch (e) { err = e.message; }
  return { html, txt: text(html), err, d: sink.design };
};

console.log("\n2. The Build tab, rendered");
{
  const steps = BUILD_STEPS.map((s, i) => ({ key: s.key, ...render(MOD.BuildHarness, { frame: QUAD_X, step: i }) }));
  const broken = steps.filter((s) => s.err || !s.html);
  const dirty = steps.filter((s) => BAD.test(s.txt)).map((s) => `${s.key}: "${s.txt.match(new RegExp(`.{0,40}${BAD.source}.{0,20}`))?.[0]}"`);
  check("every step renders", broken.length === 0, broken.map((s) => `${s.key}: ${s.err}`).join(" | "));
  check("no step shows null, undefined or NaN", dirty.length === 0, dirty.join(" | "));
  const s0 = steps[0], r = s0.d.result;
  const strip = s0.html.slice(s0.html.indexOf('aria-label="Build steps"'));
  const at = (st) => strip.indexOf(`>${st.title.replace(/&/g, "&amp;")}<`);
  check("the step strip lists the ten steps in order, and the workbench waits for its lazy 3D import",
    BUILD_STEPS.every((s, i) => at(s) >= 0 && (i === 0 || at(s) > at(BUILD_STEPS[i - 1])))
    && /Loading the 3D workbench/.test(s0.txt));
  const want = [r.massKg.toFixed(3), r.endurance.minutes.toFixed(1), r.thrustToWeight.available.toFixed(2),
                r.hover.busPowerW.toFixed(0), r.hover.rpm.toFixed(0), (100 * r.thrustToWeight.hoverThrottleFraction).toFixed(0)];
  check("the spec sheet prints sizeDrone()'s numbers: mass, endurance, T/W, bus power, rpm, throttle",
    s0.d.ok && want.every((x) => s0.txt.includes(x)) && /converged/.test(s0.txt), want.join(" · "));
  check("a matched frame raises no mismatch", !/The sizing has \d+ rotors/.test(s0.txt));
  const fr = steps.find((s) => s.key === "frame");
  const caps = (fr.html.match(/AP_MotorsMatrix\.cpp/g) || []).length;
  check("the frame step's diagrams share one caption, not one each", caps === 1, `${caps} caption(s)`);
  const af = buildAirframe({ frame: QUAD_X, propellerDiameterM: s0.d.built.propeller.diameterM, tipGapFraction: 0.10 });
  const bom = billOfMaterials(s0.d, QUAD_X, af);
  check("the parts step lists the whole bill of materials, every step's rows",
    /Bill of materials/.test(s0.txt) && s0.txt.includes(`0 / ${bom.length}`) && bom.length >= 12
    && bom.every((x) => s0.txt.includes(x.text)), `${bom.length} rows`);
  check("the frame step's instructions quote the airframe builder's arm length and tip gap",
    fr.txt.includes(`each motor centre is ${Math.round(af.armLengthM * 1000)} mm from the frame centre`)
    && fr.txt.includes(`clear each other by ${Math.round(2 * af.tipGapFraction * af.propRadiusM * 1000)} mm`));
  const mo = steps.find((s) => s.key === "motor"), m = s0.d.built.motor;
  check("the motor step needs one motor per rotor, on its published hole pattern",
    mo.txt.includes(`4× ${m.model}`) && mo.txt.includes(m.mounting_hole_pattern) && /You'll need/.test(mo.txt));
  const pr = steps.find((s) => s.key === "prop");
  const cwM = af.rotors.filter((r) => r.rotation === "CW").map((r) => r.motor).sort().join(", ");
  check("the propeller step splits CW and CCW by the frame's own spin directions", pr.txt.includes(`go on motors ${cwM};`), cwM);
  const pk = steps.find((s) => s.key === "pack"), P = s0.d.built.pack;
  check("the pack step quotes the pack the sizing assembled",
    pk.txt.includes(`${P.cellsSeries}S${P.cellsParallel}P, ${P.voltagePrintedV} V nominal, ${P.capacityMah} mAh`) && pk.txt.includes(`${P.cellsSeries * P.cellsParallel}× `));
  const facts = partFacts("motors", s0.d, af);
  check("a clicked motor shows its catalogue stator, shaft and mounting, and says what is drawn",
    facts.rows.some(([k, x]) => k === "stator" && x === `${m.stator_diameter_mm} × ${m.stator_height_mm} mm`) && /Bell and base drawn/.test(facts.scale));
  const hx = render(MOD.BuildHarness, { frame: HEXA_X, step: 0 });
  check("a 6-rotor frame on a 4-rotor sizing is named and offered a one-click match",
    /The sizing has 4 rotors but the frame has 6/.test(hx.txt) && /Size it with 6 rotors/.test(hx.txt));
  const esc = steps.find((s) => s.key === "esc");
  check("an ESC without a published continuous current says so; 4-in-1 boards say how they are counted",
    /continuous current not published/.test(esc.txt) && /4-in-1 board: the sizing counts its whole mass once per motor/.test(esc.txt)
    && ESCS.some((e) => e.continuous_current_a == null));
  const rev = steps.find((s) => s.key === "review");
  check("the review step offers the flight, enabled, for the converged matched design",
    /Fly it in the arena/.test(rev.txt) && !/<button[^>]*disabled[^>]*>Fly it in the arena/.test(rev.html));
}

console.log("\n3. The Fly tab, rendered");
{
  const q = render(MOD.FlyHarness, { frame: QUAD_X });
  check("a converged design on its own frame gets the arena, waiting for the lazy 3D import, paused at 'click to fly'",
    !q.err && /Loading the 3D arena/.test(q.txt) && /Click to fly/.test(q.txt) && /W\/S pitch/.test(q.txt), q.err ?? "");
  check("the arena shows no null, undefined or NaN", !BAD.test(q.txt));
  check("the notices: what is computed, the mode, what is not modelled, what is drawn",
    /Computed\./.test(q.txt) && /Stabilize with altitude hold/.test(q.txt) && /no position hold/.test(q.txt)
    && /Not modelled\..*Wind.*voltage sag.*ground effect.*take-off/.test(q.txt) && /Drawn, not computed\./.test(q.txt));
  check("Loiter is named as withdrawn, with dynamics.js's own reason", q.txt.includes(LOITER_WITHDRAWN.reason));
  const F = read("AUDIT/FINDINGS.md");
  check("F-101 and F-102 are on screen, and F-101's figures are AUDIT/FINDINGS.md's",
    /F-101: drag is applied per body axis/.test(q.txt) && /F-102: the rate loop/.test(q.txt)
    && /thrust 0\.89× and ideal power about 16 % low at 20 m\/s/.test(q.txt)
    && /\| 20 m\/s \| 0\.8909 \| 0\.8409 \|/.test(F) && /about 16 % in ideal power at 20 m\/s/.test(F));
  const h = render(MOD.FlyHarness, { frame: HEXA_X });
  check("a frame with a different rotor count from the sizing is refused, saying both counts, with a one-click match",
    !h.err && !/Loading the 3D arena/.test(h.txt) && /The sizing has 4 rotors but the HEXA X frame has 6/.test(h.txt)
    && /Size it with 6 rotors/.test(h.txt), h.err ?? "");
  const x = render(MOD.FlyHarness, { frame: QUAD_X, impossible: true });
  check("a design that does not converge is refused, saying so",
    !x.err && x.d && !x.d.ok && /The design does not converge/.test(x.txt) && !/Loading the 3D arena/.test(x.txt),
    x.d ? `status ${x.d.result.status}` : x.err);
}
rmSync(dir, { recursive: true, force: true });

console.log("\n4. Source");
{
  const scene = read("src/classes/drone/build-fly/drone-scene.js");
  const sceneImports = [...scene.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]).sort();
  check("drone-scene.js imports three.js, its addons and the parts, and nothing else, so it holds no physics",
    JSON.stringify(sceneImports) === JSON.stringify(["./drone-parts.js", "three", "three/addons/controls/OrbitControls.js", "three/addons/environments/RoomEnvironment.js", "three/addons/renderers/CSS2DRenderer.js"]) && !/import\(/.test(scene),
    sceneImports.join(", "));
  const partsSrc = read("src/classes/drone/build-fly/drone-parts.js");
  const partsImports = [...partsSrc.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]).sort();
  check("drone-parts.js imports three.js and the airframe's geometry only, so it holds no physics",
    JSON.stringify(partsImports) === JSON.stringify(["../geometry3d.js", "three", "three/addons/geometries/RoundedBoxGeometry.js"]) && !/import\(/.test(partsSrc),
    partsImports.join(", "));
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(n) && files.push(p); } };
  walk(new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const threeUsers = files.filter((p) => /from\s+"three|import\("three/.test(readFileSync(p, "utf8"))).map((p) => p.replace(/\\/g, "/").split("/src/")[1]);
  /* three.js lives only in the lazily loaded scene files: this one and the
     eVTOL mission flight's (panels/mission-flight-3d, gated by its own
     validation/mission-flight-3d.mjs). */
  check("no other source file imports three.js", JSON.stringify(threeUsers.sort()) === JSON.stringify(["classes/drone/build-fly/drone-parts.js", "classes/drone/build-fly/drone-scene.js", "panels/mission-flight-3d/flight-scene.js"]), threeUsers.join(", "));
  const partsUsers = files.filter((p) => /from\s+"\.\/drone-parts|import\("\.\/drone-parts/.test(readFileSync(p, "utf8"))).map((p) => p.replace(/\\/g, "/").split("/src/")[1]).sort();
  check("only the scene imports the parts, so they too load with the 3D only",
    JSON.stringify(partsUsers) === JSON.stringify(["classes/drone/build-fly/drone-scene.js"]), partsUsers.join(", "));
  const sceneUsers = files.filter((p) => /drone-scene/.test(readFileSync(p, "utf8"))).map((p) => p.replace(/\\/g, "/").split("/src/")[1]).sort();
  const lazyOnce = ["BuildTab.jsx", "FlyTab.jsx"].every((f) => {
    const s = read(`src/classes/drone/build-fly/${f}`);
    return (s.match(/import\("\.\/drone-scene\.js"\)/g) || []).length === 1 && !/from\s+"\.\/drone-scene/.test(s);
  });
  check("the Build and Fly tabs fetch the scene by one dynamic import each, and nothing else imports it",
    lazyOnce && JSON.stringify(sceneUsers) === JSON.stringify(["classes/drone/build-fly/BuildTab.jsx", "classes/drone/build-fly/FlyTab.jsx"]),
    sceneUsers.join(", "));
  const fly = read("src/classes/drone/build-fly/FlyTab.jsx");
  check("the Fly tab steps the flight through live-flight.js only and defines no dynamics of its own",
    /from "\.\.\/live-flight\.js"/.test(fly) && /stepFlight\(f, spRef\.current\)/.test(fly)
    && !/\b(rk4|derivative|controllerStep|buildMixer|allocateDegraded)\s*\(/.test(fly));
  check("the arena draws the same obstacles the flight is checked against",
    /createFlight\(\{ model, startAltitudeM: 2, energy, obstacles \}\)/.test(fly)
    && /mountArena\(\{ canvas: canvasRef\.current, airframe, obstacles,/.test(fly)
    && /apiRef\.current\?\.setObstacles\(obstacles\)/.test(fly));
  const studio = read("src/classes/drone/DroneStudio.jsx");
  const tabs = [...studio.slice(studio.indexOf("const TABS")).matchAll(/\["([a-z-]+)",\s*"/g)].map((m) => m[1]);
  check("the drone studio lists Build and Fly first and renders both",
    tabs[0] === "build" && tabs[1] === "fly" && /<BuildTab /.test(studio) && /<FlyTab /.test(studio), tabs.slice(0, 4).join(", "));
  const nav = studio.match(/<nav aria-label="Sections"[^>]*>/s)?.[0] ?? "";
  check("the drone studio's tab bar wraps instead of scrolling sideways",
    /flexWrap: "wrap"/.test(nav) && !/overflowX/.test(nav));
  const pkg = JSON.parse(read("package.json"));
  check("three.js is a declared dependency at the version the scene was written for",
    /^\^?0\.160\.\d+$/.test(pkg.dependencies?.three ?? ""), pkg.dependencies?.three);
}

console.log("\n5. True scale");
{
  const prop = findPropeller(DESIGN_DEFAULTS.propellerId);
  const motor = MODELLABLE_MOTORS.find((m) => m.model === DESIGN_DEFAULTS.motorModel);
  const esc = ESCS.find((e) => e.id === "HW-XROTOR-PRO-40A");
  const cell = BATTERIES.find((b) => b.id === DESIGN_DEFAULTS.cellId);
  const pack = assemblePack(cell, { series: DESIGN_DEFAULTS.series, parallel: DESIGN_DEFAULTS.parallel, overheadFraction: DESIGN_DEFAULTS.packOverhead });
  const af = buildAirframe({ frame: QUAD_X, propellerDiameterM: prop.diameterM, tipGapFraction: 0.10 });
  const d = buildDrone(af, { motor, propeller: prop, esc, cell, pack, payloadKg: 0.5 });
  const named = (root, name) => { const out = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
  const size = (o) => { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]; };
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
  const stator = named(d.group, "stator"), shaft = named(d.group, "shaft");
  check("every motor's stator is the catalogue's diameter and height, its shaft the catalogue's diameter",
    stator.length === 4 && stator.every((s) => near(s.geometry.parameters.radiusTop * 2, motor.stator_diameter_mm / 1000) && near(s.geometry.parameters.height, motor.stator_height_mm / 1000))
    && shaft.length === 4 && shaft.every((s) => near(s.geometry.parameters.radiusTop * 2, motor.shaft_diameter_mm / 1000)),
    `${motor.model}: ${motor.stator_diameter_mm} × ${motor.stator_height_mm} mm, shaft ${motor.shaft_diameter_mm} mm`);
  const blades = named(d.group, "blade");
  const tips = blades.map((b) => { b.geometry.computeBoundingBox(); return b.geometry.boundingBox.max.x; });
  check("every blade reaches the propeller's published radius, no more and no less",
    blades.length === 8 && tips.every((x) => near(x, prop.diameterM / 2, 1e-7)), `R = ${prop.diameterM / 2} m`);
  /* The chord line (leading to trailing edge) of every section is at the
     helix angle of the nominal pitch, atan(P / 2 pi r). */
  const NC = 18, pos = blades[0].geometry.attributes.position;
  let worst = 0;
  for (let i = 0; i <= 32; i++) {
    const le = i * NC, te = i * NC + NC / 2;
    const r = pos.getX(le), dy = pos.getY(le) - pos.getY(te), dz = Math.abs(pos.getZ(le) - pos.getZ(te));
    worst = Math.max(worst, Math.abs(Math.atan2(dy, dz) - Math.atan2(prop.pitchM, 2 * Math.PI * r)));
  }
  check("the blade twist is the helix angle of the nominal pitch at every section", worst < 1e-5, `worst ${worst.toExponential(1)} rad`);
  const ed = esc.dimensions_mm.version_a.split("x").map((x) => parseFloat(x) / 1000);
  const bodies = named(d.group, "esc-body").map(size);
  check("every ESC case is the catalogue's length × width × height",
    bodies.length === 4 && bodies.every(([x, y, z]) => near(x, ed[0], 1e-6) && near(z, ed[1], 1e-6) && near(y, ed[2], 1e-6)), esc.dimensions_mm.version_a);
  const cells = named(d.group, "cell").filter((o) => o.isMesh);
  check("the bench carries S × P cells, each at the catalogue's diameter and length",
    cells.length === pack.cellsSeries * pack.cellsParallel
    && cells.every((c) => near(c.geometry.parameters.radiusTop * 2, 0.02155) && near(c.geometry.parameters.height, 0.07015)), `${cells.length} cells, ${cell.dimensions_mm}`);
  const box = BATTERIES.find((b) => b.id === "tattu-rline-v5-1400-6s");
  const db = buildDrone(af, { motor, propeller: prop, esc, cell: box, pack: assemblePack(box, { series: 1, parallel: 2 }), payloadKg: 0 });
  const boxes = named(db.group, "cell").map(size);
  check("a finished pack is drawn as S × P boxes at its published size",
    boxes.length === 2 && boxes.every(([x, y, z]) => near(x, 0.039) && near(y, 0.042) && near(z, 0.078)), box.dimensions_mm);
  const hubs = d.rotors.map((r) => Math.hypot(r.hub.position.x, r.hub.position.z));
  const spinOk = d.rotors.every((r) => r.spin === (af.rotors.find((x) => x.motor === r.motor).rotation === "CCW" ? 1 : -1));
  check("every rotor sits at the airframe builder's arm length and turns its frame's way",
    hubs.length === 4 && hubs.every((h) => near(h, af.armLengthM, 1e-9)) && spinOk, `${af.armLengthM.toFixed(4)} m`);
  const flame = ESCS.find((e) => e.dimensions_mm == null);
  const dn = buildDrone(af, { motor, propeller: prop, esc: flame, cell, pack, payloadKg: 0 });
  check("a part with no published size is named as drawn", dn.notes.some((n) => /ESC: no published size, drawn/.test(n)) && d.notes.length === 0, dn.notes.join("; "));
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
