/* ═══════════════════════════════════════════════════════════════════════
   LOAD FACTOR SOURCE GATE — one number, one home, and it must move
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT THIS EXISTS FOR. The limit load factor existed FIVE times in
   this codebase, computed once and copied four times:

     engine/loadcases.js   the real one: worst of the SC-VTOL VTOL.2215(f)
                           gust set and the VTOL.2200(f) manoeuvre case
     tabs/CertificationTab const n_pos = 3.5
     export/report.js      const nPosLim = 3.5      (the V-n TABLE)
     export/report.js      const nPos_f  = 3.5      (the V-n FIGURE)
     panels/RegTracker     case "n_pos_limit": return 3.5

   Four compliance rows then compared the tab's 3.5 to the literals 3.5,
   5.25 and 1.5. Every one of those was a constant against a constant: it
   could not fail, it did not change when the design changed, and it was
   identical for all six layouts including the two whose rotors cannot pull
   3.5 g. The engine reported nLimit as null for those two, which is why
   every consumer had written its own number in the first place.

   Nothing that checks arithmetic can catch this. The arithmetic was right;
   the number simply was not connected to anything.

   WHAT THIS GATE DOES
     1. Every layout — winged and wingless — must report a real load factor.
     2. The factor must MOVE between layouts. A display wired to a constant
        passes every other check in this repo; it cannot pass this one.
     3. Ultimate = 1.5 x limit exactly, per BOTH authorities.
     4. The limit factor must meet MOC VTOL.2200(f)'s floor of 2.0.
     5. A source scan: no load-factor identifier anywhere in src/ may be
        bound to a numeric literal outside engine/loadcases.js.
     6b. Since 2026-09-16 the WEIGHT MODEL is sized to the same load cases,
        and the manoeuvre limit must therefore change the airframe mass.
     6. And the claim that started this, checked against the document
        itself: AC 21.17-4 states no numeric load factor at all.
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runSizing } from "../src/engine.js";
import { thrustBorneLimitFactor, ULTIMATE_FACTOR_OF_SAFETY,
         SC_VTOL_N_LIMIT_FLOOR, SC_VTOL_N_NEG_FLOOR,
         N_LIMIT_MANOEUVRE_INPUT_RANGE } from "../src/engine/loadcases.js";
import * as CFG from "../src/engine/configuration.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CORPUS = join(ROOT, "..", "eVTOL_Sizing_Research", "extracted");

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}\n        ${detail}`);
  if (!ok) fails++;
};

const bar = "═".repeat(76);
console.log(bar);
console.log("LOAD FACTOR SOURCE GATE — one number, one home, and it must move");
console.log(bar);

/* ── the six layouts at their design points ─────────────────────────── */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

const measured = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const cap = CFG.capabilitiesFor(k, d.nRotors);
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  measured.push({ k, p, S, hasWing: cap.hasWing !== false });
}

console.log("\nMEASURED — every layout, not just the winged ones:");
console.log("    layout          nLimit  nUltimate  basis         governing case");
for (const m of measured) {
  console.log(`    ${m.k.padEnd(14)}${String(m.S.nLimit).padStart(7)}`
    + `${String(m.S.nUltimate).padStart(11)}  ${String(m.S.loadFactorBasis).padEnd(13)} ${m.S.loadGoverningCase}`);
}
console.log("");

/* ── 1. every layout reports a real number ──────────────────────────── */
const nullish = measured.filter((m) => !Number.isFinite(m.S.nLimit)
                                    || !Number.isFinite(m.S.nUltimate));
check(nullish.length === 0,
  "every layout reports a finite limit AND ultimate load factor",
  nullish.length === 0
    ? `all ${measured.length} layouts. Before this change the two wingless layouts `
      + `reported null, because loadCases() needs a wing loading — which is exactly `
      + `why four consumers carried their own 3.5 instead`
    : `null or NaN from: ${nullish.map((m) => m.k).join(", ")}`);

/* ── 2. THE ONE THAT CATCHES A REWIRED CONSTANT ─────────────────────── */
const distinct = new Set(measured.map((m) => m.S.nLimit));
check(distinct.size > 1,
  "the limit load factor DIFFERS between layouts",
  distinct.size > 1
    ? `${distinct.size} distinct values across ${measured.length} layouts `
      + `(${[...distinct].sort((a, b) => a - b).join(", ")}). A display wired to a `
      + `constant passes every other gate in this repo and fails here — that is the `
      + `whole point of this check`
    : `every layout reports ${[...distinct][0]}. Either the load factor has been `
      + `re-hardcoded, or a consumer is reading a literal again`);

/* ── 3. the factor of safety, per BOTH authorities ──────────────────── */
const badFoS = measured.filter((m) =>
  Math.abs(m.S.nUltimate - ULTIMATE_FACTOR_OF_SAFETY * m.S.nLimit) > 5e-3);
check(badFoS.length === 0,
  "ultimate = 1.5 x limit on every layout",
  `AC 21.17-4 App.A PL.2230(b) and SC-VTOL-02 VTOL.2230(a)(2) state this `
  + `identically and neither leaves it to the applicant`
  + (badFoS.length ? ` — violated by ${badFoS.map((m) => m.k).join(", ")}` : ""));

/* ── 4. the only numeric floor either authority publishes ───────────── */
const belowFloor = measured.filter((m) => m.S.nLimit < SC_VTOL_N_LIMIT_FLOOR - 1e-9);
check(belowFloor.length === 0,
  `every layout meets MOC VTOL.2200(f)'s ${SC_VTOL_N_LIMIT_FLOOR}g floor`,
  belowFloor.length === 0
    ? `"The positive load factor is not less than 2.0" — MOC SC-VTOL Issue 2, `
      + `VTOL.2200(f). This is the ONLY numeric limit-load-factor requirement in `
      + `either framework; the FAA's AC states none`
    : `below the floor: ${belowFloor.map((m) => `${m.k} ${m.S.nLimit}`).join(", ")}`);

/* ── 5. the thrust-borne path is actually taken where there is no wing ─ */
for (const m of measured.filter((x) => !x.hasWing)) {
  const want = thrustBorneLimitFactor(m.p);
  check(m.S.loadFactorBasis === "thrust-borne" && Math.abs(m.S.nLimit - want) < 5e-3,
    `${m.k} uses the thrust-borne factor, not a wing case`,
    `nLimit ${m.S.nLimit} against thrustBorneLimitFactor ${want.toFixed(3)} — `
    + `booms.js has sized to this number all along; the certification tab was `
    + `showing 3.5 g for the same aircraft`);
}

/* ── 6. the weight model sizes to THESE load cases ──────────────────────
   Until 2026-09-16 weights.js carried its own 5.25 and never read the load
   cases. It is now handed the load factor inside the sizing loop. The value
   it actually used is exported, and must equal the post-loop load cases at
   convergence — if the two are ever disconnected again, this fails. */
const disconnected = measured.filter((m) =>
  !Number.isFinite(m.S.weightsNzUltimate)
  || Math.abs(m.S.weightsNzUltimate - m.S.nUltimate) > 0.01);
check(disconnected.length === 0,
  "the weight model sized every layout to that layout's own load cases",
  disconnected.length === 0
    ? measured.map((m) => `${m.k} ${m.S.weightsNzUltimate}g`).join(", ")
      + ` — each equal to its post-loop nUltimate. NDARC: nzult is "specified, `
      + `in particular for use in the component weight estimates"`
    : disconnected.map((m) => `${m.k}: weights used ${m.S.weightsNzUltimate}g, `
      + `load cases say ${m.S.nUltimate}g`).join("; "));

/* ── 6b. and therefore the manoeuvre limit reaches the airframe mass ────
   THE DEFECT THE REWIRING FIXED: at SC-VTOL's 2.0g floor the load cases
   moved and MTOW did not, to the kilogram. A winged layout flown to 2.0g is
   gust-governed below 5.25g ultimate and must now come out lighter. */
{
  const m = measured.find((x) => x.k === "liftcruise");
  const S20 = runSizing({ ...m.p, nLimitManoeuvre: 2.0 });
  check(S20.nUltimate < m.S.nUltimate - 0.01 && S20.MTOW < m.S.MTOW - 1,
    "liftcruise at the 2.0g manoeuvre floor is lighter than at 3.5g",
    `nUltimate ${m.S.nUltimate} -> ${S20.nUltimate}g, MTOW `
    + `${m.S.MTOW.toFixed(1)} -> ${S20.MTOW.toFixed(1)} kg. Before the rewiring `
    + `the MTOW did not move at all — the manoeuvre limit reached only the `
    + `wing-box detail design`);

  /* 6c. and the drawn V-n envelope follows the same setting. Its caps were
     local literals 3.5 / -1.5, and it drew no gust lines on the strength of a
     comment falsely saying MOC VTOL.2215 gives no gust velocity. */
  const vb = m.S.vnBasis, vb20 = S20.vnBasis;
  const gl = vb.gustLines || [];
  const gustMatch = gl.length === (m.S.gustCases || []).length
    && gl.every((g, j) => Math.abs(g.nPos - m.S.gustCases[j].nLimit) < 5e-3);
  check(vb.capPos === 3.5 && vb20.capPos === 2 && S20.vnData.every((r) => r.nPos <= 2 + 1e-9)
        && gustMatch && gl.length > 0,
    "the V-n envelope is capped at the design's manoeuvre limit and carries the SC-VTOL gust lines",
    `caps ${vb.capPos} at the default, ${vb20.capPos} at the 2.0g floor; `
    + `${gl.length} gust lines (${gl.map((g) => `${g.label} ${g.nPos}`).join(", ")}) `
    + `identical to the load cases that size the structure`);
  const wl = measured.filter((x) => !x.hasWing);
  check(wl.every((x) => (x.S.vnBasis.gustLines || []).length === 0
                     && x.S.vnBasis.capPos === x.S.nLimit),
    "wingless layouts draw no wing gust lines, and cap at their thrust-borne factor",
    wl.map((x) => `${x.k} cap ${x.S.vnBasis.capPos}`).join(", "));
}

/* ── 7. SOURCE SCAN — no fifth copy may reappear ────────────────────── */
/* The eVTOL load model has one owner. A different aircraft class has its own
   certification basis and its own owner: the piston trainer's FAR 23 design
   speeds, manoeuvre factors and 23.341 gust model live in its weights.js
   (GASP V.1.30-43, validation/trainer.mjs). Named file by file, so class code
   cannot become a general hiding place for eVTOL load factors. */
/* 2026-09-18: a THIRD owner, for the same reason the second exists. The
   Part 25 classes now have their own flight envelope — the 25.333(b)
   manoeuvre diagram, the 25.337(b) limit factor, the 25.335 design speeds
   and the 25.341(a) discrete-gust model with the current 56/44/20.86 ft/s
   reference velocities. Those are a DIFFERENT REGULATION from both the
   eVTOL special condition and the trainer's Part 23, and mixing them is the
   specific error the flight-envelope module was built to prevent: the old
   pre-1996 gust velocities are 25-30 % more severe at altitude. So it owns
   its own constants, and like the other two it is named file by file. */
const OWNERS = ["src/engine/loadcases.js", "src/classes/trainer/weights.js",
                "src/classes/aircraft/flight-envelope.js"];

/* TWO FORMS, because the first version of this scan caught only one and
   passed a deliberately re-introduced defect. It required
   `identifier <=|:> number`, so it matched `const n_pos = 3.5` but NOT
   `case "n_pos_limit": return 3.5;` — which is the exact shape the
   regulation tracker carried. A gate that passes for the wrong reason is
   worse than no gate, so it is now checked against a real re-introduction
   below rather than trusted. */
/* 2026-09-16: THE SECOND VERSION MISSED FOUR MORE COPIES, so the names are now
   matched by PREFIX, not as an exact list. An exact list of `nPosLim` did not
   match `nPosLimit` (word boundary), and `NZ_CAP_POS` was not on it at all.
   What slipped through: VnDiagramTab `nPosLimit=3.5`, engine.js
   `NZ_CAP_POS = 3.5`, wingbox.js `nz = g.nz ?? 5.25`, engine.js
   `Math.sqrt(3.5)` in VA, PerformanceTab `<ReferenceLine y={3.5}>` and
   `val:"+3.5 g"`, and a gust alleviation factor built from the aspect ratio. */
const IDENT_WORDS =
  "n_?(?:pos|neg|ult)\\w*|nPos\\w*|nNeg\\w*|nLimit\\w*|nUlt\\w*|nMan\\w*"
  + "|NZ_\\w*|N[zZ]\\w*|nz\\w*";

/* form 1 — bound to a literal, directly or as a `??` default:
   `const n_pos = 3.5`, `nz: 5.25`, `"nz":5.25`, `nz = g.nz ?? 5.25` */
const ASSIGN = new RegExp(
  `['"]?\\b(${IDENT_WORDS})\\b['"]?\\s*[:=]\\s*(?:[^;,\\n]*?\\?\\?\\s*)?(-?\\d+(?:\\.\\d+)?)\\b`, "g");
/* form 2 — returned as a literal from a line that names one of them */
const NAMED  = new RegExp(`['"]?\\b(${IDENT_WORDS})\\b`);
const RETLIT = /\breturn\s+(-?\d+(?:\.\d+)?)\s*[;,)]?\s*$/;
/* form 3 — a square root of a literal next to a stall or manoeuvre speed:
   `VA = Vstall*Math.sqrt(3.5)` */
const SQRTLIT = /\bsqrt\(\s*\d+(?:\.\d+)?\s*\)/;
const SPEEDS  = /\b(VA|Vstall|VS)\w*/;
/* form 4 — a load-factor chart line drawn at a literal, or a literal "3.5 g"
   / "n=3.5" label, in any file that draws a load factor */
const CHARTLIT = /ReferenceLine\s+y=\{\s*-?(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)\s*\}/;
const GSTRING  = /["'`][+−-]?\d+(?:\.\d+)?\s?g["'`]|["'`]n=-?\d/;
const LOADFILE = /load\s*factor|V-n/i;
/* form 5 — a private gust model: an alleviation factor 0.88*x/(5.3+x), or a
   gust velocity bound to a literal. Both belong to engine/loadcases.js. */
const KGLIT = /0\.88\s*\*[^;\n]*5\.3/;
const UGLIT = /\bU(?:g|de)\w*\s*=\s*\d/;
/* A chart line is only a load-factor line if its value could be one. */
const chartLF = (m) => { const v = Math.abs(parseFloat(m[0].match(/-?[\d.]+/)[0])); return v > 0 && v <= 10; };

/* NAMED EXEMPTIONS, each with its reason. These are a DIFFERENT quantity -
   the hover THRUST load factor n_z of the VFS 2025 study (a motor
   continuous-torque floor, 1.35-1.77 g), not the structural limit or
   ultimate factor - and they are sourced where they are defined. An
   exemption whose name no longer exists fails the gate, so this list
   cannot silently outlive what it excuses. */
const EXEMPT = [
  { file: "src/engine.js", name: "NZ_HOVER_MIN",
    why: "VFS 2025 hover n_z continuous-torque floor, not a structural factor" },
  { file: "src/engine.js", name: "NZ_HOVER_MAX",
    why: "VFS 2025 largest hover n_z that converged, not a structural factor" },
  { file: "src/engine/configuration.js", name: "NZ_CONTINUOUS_TORQUE_MIN",
    why: "VFS 2025 motor continuous-torque floor, not a structural factor" },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

/* Comments are stripped before scanning, and stripped by REPLACING each
   comment with as many newlines as it spanned so reported line numbers still
   point at the real line. A prefix test is not enough: the finding this gate
   records is written in a block comment whose continuation lines quote the
   old `const n_pos = 3.5`, and a naive scan accuses its own documentation. */
function stripComments(src) {
  const blanked = src.replace(/\/\*[\s\S]*?\*\//g,
    (m) => m.replace(/[^\n]/g, " "));
  return blanked.split("\n").map((ln) => ln.replace(/\/\/.*$/, "")).join("\n");
}

const offenders = [];
for (const f of walk(join(ROOT, "src"))) {
  const rel = relative(ROOT, f).split("\\").join("/");
  if (OWNERS.includes(rel)) continue;
  const raw = readFileSync(f, "utf8");
  const drawsLoad = LOADFILE.test(raw);
  stripComments(raw).split("\n").forEach((ln, i) => {
    const hit = (why, text) =>
      offenders.push({ file: rel, line: i + 1, text: `[${why}] ${text.trim().slice(0, 90)}` });
    for (const m of ln.matchAll(ASSIGN)) {
      if (EXEMPT.some((x) => x.file === rel && m[1] === x.name)) continue;
      hit("literal", m[0]);
    }
    if (RETLIT.test(ln) && NAMED.test(ln)) hit("return", ln);
    if (SQRTLIT.test(ln) && SPEEDS.test(ln)) hit("sqrt", ln);
    const cm = drawsLoad && ln.match(CHARTLIT);
    if (cm && chartLF(cm)) hit("chart", cm[0]);
    if (drawsLoad && GSTRING.test(ln) && /load|limit|n[+-]/i.test(ln)) hit("label", ln);
    if (KGLIT.test(ln)) hit("gust Kg", ln);
    if (UGLIT.test(ln)) hit("gust U", ln);
  });
}
const staleExempt = EXEMPT.filter((x) =>
  !existsSync(join(ROOT, x.file))
  || !new RegExp(`\\b${x.name}\\b`).test(readFileSync(join(ROOT, x.file), "utf8")));
check(staleExempt.length === 0,
  "every scan exemption still names something that exists",
  staleExempt.length === 0
    ? EXEMPT.map((x) => `${x.name} (${x.why})`).join("; ")
    : `stale: ${staleExempt.map((x) => `${x.file} ${x.name}`).join(", ")}`);
check(offenders.length === 0,
  "no load factor, gust model or V-n line is hardcoded outside loadcases.js",
  offenders.length === 0
    ? `scanned ${walk(join(ROOT, "src")).length} files. Only engine/loadcases.js may `
      + `define one — weights.js included, since 2026-09-16; everything else must read SR.nLimit / `
      + `SR.nUltimate. This is the check that would have caught the original defect`
    : offenders.map((o) => `${o.file}:${o.line}  ${o.text}`).join("\n        "));

/* ── 7b. THE EXPORTED REPORT, ACTUALLY GENERATED ──────────────────────
   NOTHING in the suite called generateReport() before 2026-09-16, so two
   rounds of edits to its V-n section had never been executed by a test. It
   imports JSX, so it is bundled first, the way tab-render.mjs does it. */
{
  const { build } = await import("esbuild");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(ROOT, "node_modules", ".lfreport-"));
  const out = join(dir, "report.mjs");
  try {
    await build({ entryPoints: [join(ROOT, "src", "export", "report.js")], outfile: out,
      bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
      define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
      external: ["react", "react-dom", "react/jsx-runtime", "recharts"] });
    const { generateReport } = await import(pathToFileURL(out).href);
    const problems = [];
    for (const m of measured) {
      const html = String(generateReport(m.p, m.S));
      const a = html.indexOf("11. V-n Diagram");
      const sec = html.slice(a, html.indexOf("One-Engine-Inoperative Analysis</h3>", a));
      const f0 = html.indexOf('<svg viewBox="0 0 480 197"');
      const fig = html.slice(f0, html.indexOf("</svg>", f0));
      const want = 2 * (m.S.vnBasis.gustLines || []).length;
      const got = (fig.match(/stroke="#d97706"/g) || []).length;
      if (a < 0 || f0 < 0) problems.push(`${m.k}: V-n section or figure missing`);
      if (/NaN|undefined|Infinity/.test(sec + fig)) problems.push(`${m.k}: NaN/undefined in V-n output`);
      if (got !== want) problems.push(`${m.k}: ${got} gust lines drawn, ${want} expected`);
      if (!sec.includes(m.S.nUltimate.toFixed(2))) problems.push(`${m.k}: ultimate ${m.S.nUltimate} not in the table`);
    }
    check(problems.length === 0,
      "the exported report's V-n section generates for every layout and matches the engine",
      problems.length === 0
        ? `${measured.length} reports generated; gust lines drawn match the load cases `
          + `(${measured.map((m) => (m.S.vnBasis.gustLines || []).length * 2).join("/")}), `
          + `no NaN, ultimate factor present`
        : problems.join("; "));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ── 8. THE CLAIM, AGAINST THE DOCUMENT ─────────────────────────────── */
const acPath = join(CORPUS, "AC-21.17-4_2025-07-18.txt");
if (existsSync(acPath)) {
  const ac = readFileSync(acPath, "utf8");
  check(!/\b3\.5\b/.test(ac),
    "AC 21.17-4 contains no 3.5 g load factor — because it contains no 3.5 at all",
    `Two certification rows asserted "limit load factor must be >= 3.5g" to this `
    + `document. The string does not occur in it. PL.2215 lists the flight `
    + `CONDITIONS and gives no factor; the AC's only load-factor requirement is `
    + `PL.2200(b), which is performance-based`);
  check(/Design maneuvering load factors not less than those, which service history/.test(ac),
    "and PL.2200(b) reads as the certification tab now quotes it",
    `"Design maneuvering load factors not less than those, which service history `
    + `shows, may occur within the structural design envelope" — there is no `
    + `service history for this class, which is why the tab checks EASA's floor `
    + `and says so`);
} else {
  console.log(`  --    AC 21.17-4 not in the corpus at ${relative(ROOT, acPath)}`);
  console.log(`        The two document checks are SKIPPED. This is not a clean pass.`);
}

/* ── 9. THE SETTING IS REACHABLE, AND ITS NOTES TELL THE TRUTH ─────────
   Until 2026-09-16 nLimitManoeuvre and nLimitManoeuvreNeg were honoured by
   the engine, the weights, the V-n tab and the report, and NO control in the
   app could set them: the 2.0 g result existed only for code. The sidebar
   now carries both. This checks they are wired to the right keys, bounded by
   the owner's floors, and that the two claims their notes make are true —
   the positive setting does nothing to a thrust-borne layout, and the
   negative one sizes no structure anywhere. */
{
  const app = stripComments(readFileSync(join(ROOT, "src", "App.jsx"), "utf8"));
  const wired = ["nLimitManoeuvre", "nLimitManoeuvreNeg"].filter((k) =>
    new RegExp(`<Slider[^>]*onChange=\\{set\\("${k}"\\)\\}`, "s").test(app));
  const R = N_LIMIT_MANOEUVRE_INPUT_RANGE;
  check(wired.length === 2
        && /N_LIMIT_MANOEUVRE_INPUT_RANGE\.pos\.min/.test(app)
        && /N_LIMIT_MANOEUVRE_INPUT_RANGE\.neg\.max/.test(app)
        && R.pos.min === SC_VTOL_N_LIMIT_FLOOR && R.neg.max === SC_VTOL_N_NEG_FLOOR,
    "the sidebar sets both manoeuvre limits, bounded at the MOC VTOL.2200(f) floors",
    `wired: ${wired.join(", ") || "none"}; input range +${R.pos.min}..${R.pos.max} / `
    + `${R.neg.min}..${R.neg.max} (inner ends are the floors; outer ends are an `
    + `unsourced input range, stated as such in loadcases.js)`);

  const lc = measured.find((x) => x.k === "liftcruise");
  const ends = [R.pos.min, R.pos.max].map((v) => runSizing({ ...lc.p, nLimitManoeuvre: v }))
    .concat([R.neg.min, R.neg.max].map((v) => runSizing({ ...lc.p, nLimitManoeuvreNeg: v })));
  check(ends.every((S) => Number.isFinite(S.MTOW) && Number.isFinite(S.nUltimate)),
    "every end of the input range sizes a finite liftcruise design",
    ends.map((S) => `${S.MTOW.toFixed(0)} kg @ ${S.nUltimate}g ult`).join(", "));

  const wl = measured.filter((x) => !x.hasWing);
  const moved = wl.filter((x) => {
    const S = runSizing({ ...x.p, nLimitManoeuvre: R.pos.max });
    return x.S.loadFactorBasis !== "thrust-borne"
      || S.MTOW !== x.S.MTOW || S.nLimit !== x.S.nLimit;
  });
  check(moved.length === 0,
    "the positive setting does nothing to a thrust-borne layout, as its note says",
    moved.length === 0
      ? `${wl.map((x) => x.k).join(", ")}: basis "thrust-borne", MTOW and nLimit `
        + `unchanged at +${R.pos.max}`
      : `moved or mislabelled: ${moved.map((x) => `${x.k} (${x.S.loadFactorBasis})`).join(", ")}`);

  const negMoved = measured.filter((x) => {
    const S = runSizing({ ...x.p, nLimitManoeuvreNeg: R.neg.min });
    return S.MTOW !== x.S.MTOW || S.nLimitNeg !== R.neg.min || S.vnBasis.capNeg !== R.neg.min;
  });
  check(negMoved.length === 0,
    "the negative setting moves the V-n envelope and sizes no structure, as its note says",
    negMoved.length === 0
      ? `all ${measured.length} layouts: nLimitNeg and the envelope cap follow `
        + `${R.neg.min}, MTOW identical to the kilogram`
      : `wrong in: ${negMoved.map((x) => x.k).join(", ")}`);
}

console.log("\n" + bar);
if (fails) {
  console.log(`LOAD FACTOR SOURCE GATE FAILED — ${fails} check(s)`);
  process.exit(1);
}
console.log("LOAD FACTOR SOURCE GATE PASSED");
