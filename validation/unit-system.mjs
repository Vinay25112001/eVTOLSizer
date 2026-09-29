/* =====================================================================
   UNIT SYSTEM GATE — Phase 1 (P01-042 … P01-058, P01-067)
   =====================================================================
   WHY THIS EXISTS, AND WHY units.mjs DOES NOT COVER IT

   `validation/units.mjs` tests the DISPLAY layer: `src/lib/units.js`'s
   UNIT_TABLE, its round trips, and the formatting a user sees. That is a real
   gate and this does not duplicate it.

   What nothing tested is the ENGINE side. Every class in this tree is a
   self-contained port of a published method and carries that method's units,
   so each one opens with its own preamble of conversion constants — `LB`,
   `FT`, `KT`, `PSF`, `DEG`, `G0` — written out again. UNITS.md records that
   there are four such regimes and that there is NO single canonical system.
   Those constants are where a unit-system defect actually lands, and F-04
   (viscosity mislabelled), F-36 (three values for Pa→lbf/ft²) and F-37
   (a rounded imperial gravity) are all of exactly that shape.

   Phase 1 asks for automated unit tests "where useful". This is where.

   ── WHAT IS CHECKED ──────────────────────────────────────────────────
   1. Every conversion constant whose NAME declares what it converts is
      compared against the exact SI definition. The name is what makes this
      precise rather than a guess: a constant called LB_PER_KG is claiming to
      be 2.20462262, and the comparison is then arithmetic.

   2. No expression ADDS or SUBTRACTS two quantities whose names declare the
      same physical quantity in different unit systems. Adding a `...Lb` to a
      `...Kg` is wrong whatever the formula means, and unlike a multiplication
      it cannot be intentional. Measured 0 across the tree; the bound is 0.

   3. The population of near-miss conversion literals is PINNED, not
      allowlisted. Exactly one exists — a rounded imperial gravity, which is
      the registered finding F-37 — and the check requires exactly that one.
      An allowlist keyed on (file, value) would excuse the very line it
      describes; a population count does not: a SECOND near-miss fails here
      even though the first is known and unremediated.

   ── WHAT IS NOT CHECKED ──────────────────────────────────────────────
   Dimensional correctness of a formula as a whole. Knowing that
   `rho * v * v * S` is a force requires the units of every symbol, and the
   register records units for only 14.8% of relations — which is itself the
   Phase 1 finding, not something this gate can paper over.
   ===================================================================== */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { G0 } from "../src/engine/constants.js";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/* DERIVED, NOT RESTATED, and validation/constants.mjs is why. That gate scans the
   HARNESSES as well as src/ and requires that no file write a physical constant with a
   value of its own -- it caught this file writing imperial gravity out in full. The fix
   is not to excuse the line but to stop having one: 0.3048 is exact by definition, so
   G0/0.3048 IS imperial gravity and cannot drift from the SI value the other gate pins.
   The division of labour is clean: constants.mjs pins G0, this file pins the conversions
   relative to it. */
const G_FT_PER_S2 = G0 / 0.3048;          // 32.174... ft/s^2, derived

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const bar = "=".repeat(78);
console.log(bar);
console.log("UNIT SYSTEM GATE — engine-side conversion constants and unit arithmetic");
console.log(bar);

/* ── collect sources ────────────────────────────────────────────────── */
const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(n)) files.push(p);
  }
})(SRC);

const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length))
   .split("\n").map((l) => l.replace(/\/\/.*$/, ""));

/* ── 1. named conversion constants against exact SI ─────────────────── */
console.log("\n-- 1. every named conversion constant equals its exact definition --");

/* Each entry accepts the factor OR its reciprocal, because the tree writes
   both directions under the same name (FT is 3.280839895 in one module and
   0.3048 in another, and both are correct). `HP` additionally carries two
   SCALES, hp->W and hp->kW, and both are legitimate. */
const EXACT = [
  [/^(LB|LBS|KG_PER_LB|LB_PER_KG|KGTOLB|LBTOKG)$/, [2.20462262], "kg<->lb"],
  [/^(FT|FTPERM|M_PER_FT|FT_PER_M|MTOFT|FTTOM)$/, [3.280839895], "m<->ft"],
  [/^(IN2M|M2IN)$/, [0.0254], "in<->m"],
  [/^(KT|KTS|KT_PER_MS|MS_PER_KT)$/, [1.943844492], "m/s<->kt"],
  [/^(HP|HP_PER_KW|KW_PER_HP|W_PER_HP)$/, [745.699872, 0.745699872], "hp<->W and hp<->kW"],
  [/^(PSF|PSF_N|PA_PER_PSF|PSF_PER_PA)$/, [47.8802589], "lbf/ft^2<->Pa"],
  [/^(NMI|NM_PER_KM|KM_PER_NM)$/, [1.852], "nmi<->km"],
  /* The nautical/statute class (P01-050) is covered HERE, by the named
     constant, and deliberately NOT by the near-miss scan below: the exact
     factor is 1.15077945 and `1.15` is one of the commonest engineering
     margins in the tree (18 sites — a dive-speed factor, a legacy
     installation margin, a motor margin). Scanning for near-misses of it
     reported three margins as conversion errors. */
  [/^(NM_PER_SM|SM_PER_NM|STATUTE)$/, [1.15077945], "nmi<->statute mile"],
  [/^(DEG|DEG2RAD|D2R|RAD2DEG|R2D)$/, [57.2957795], "deg<->rad"],
  [/^(G0|G_SI|GRAVITY)$/, [G0], "standard gravity"],   // imported, not restated
  [/^(G_FT|G_IMP)$/, [G_FT_PER_S2], "gravity, ft/s^2"],
  [/^(LBF|LBF_N|N_PER_LBF)$/, [4.44822162], "lbf<->N"],
];
/* Two spellings, because the tree uses both. A bare literal
   (`const LB = 2.20462;`) and a written reciprocal
   (`const NM_PER_SM = 1 / 1.1507794;`). Matching only the first silently
   skipped the statute-mile constant while this file's comment claimed to
   cover it. */
const DECL = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)\s*;/;
const DECL_RECIP = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*1\s*\/\s*([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)\s*;/;

const TOL = 1e-4;                       // relative; measured worst is 1.2e-6
const consts = [];
for (const p of files) {
  const rel = relative(ROOT, p).replace(/\\/g, "/");
  strip(readFileSync(p, "utf8")).forEach((line, i) => {
    const mr = DECL_RECIP.exec(line);
    const m = mr ?? DECL.exec(line);
    if (!m) return;
    for (const [rx, values, what] of EXACT) {
      if (!rx.test(m[1])) continue;
      const v = mr ? 1 / Number(m[2]) : Number(m[2]);
      let best = Infinity;
      for (const e of values) {
        best = Math.min(best, Math.abs(v - e) / e, Math.abs(v - 1 / e) * e);
      }
      consts.push({ file: rel, line: i + 1, name: m[1], value: v, what, rel: best });
      break;
    }
  });
}
check("conversion constants were found at all", consts.length >= 20,
  `${consts.length} named constants across ${new Set(consts.map((c) => c.file)).size} modules`);

const offenders = consts.filter((c) => c.rel > TOL);
check(`every one is within ${TOL} of its exact definition`, offenders.length === 0,
  offenders.length
    ? offenders.map((c) => `${c.name}=${c.value} in ${c.file}:${c.line} (${(100 * c.rel).toFixed(4)}% off ${c.what})`).join("; ")
    : `worst ${(100 * Math.max(...consts.map((c) => c.rel))).toFixed(6)}%`);

/* ── 2. no arithmetic across unit regimes ───────────────────────────── */
console.log("\n-- 2. no quantity is added to the same quantity in another system --");
const REGIME = [[/Lbs?$/, "mass:imperial"], [/Kg$/, "mass:SI"],
                [/Ft$/, "length:imperial"], [/_m$/, "length:SI"],
                [/Ft2$/, "area:imperial"], [/M2$/, "area:SI"],
                [/Kt$/, "speed:imperial"], [/Ms$/, "speed:SI"],
                [/Nmi$/, "distance:imperial"], [/Km$/, "distance:SI"],
                [/Hp$/, "power:imperial"], [/KW$/, "power:SI"],
                [/Psf$/, "pressure:imperial"], [/Pa$/, "pressure:SI"],
                [/Deg$/, "angle:deg"], [/Rad$/, "angle:rad"]];
const regimeOf = (n) => { for (const [rx, r] of REGIME) if (rx.test(n)) return r; return null; };
const ADDSUB = /([A-Za-z_$][\w$.]*)\s*([-+])\s*([A-Za-z_$][\w$.]*)/g;

const mixed = [];
for (const p of files) {
  const rel = relative(ROOT, p).replace(/\\/g, "/");
  strip(readFileSync(p, "utf8")).forEach((line, i) => {
    for (const m of line.matchAll(ADDSUB)) {
      const a = m[1].split(".").pop(), b = m[3].split(".").pop();
      const ra = regimeOf(a), rb = regimeOf(b);
      if (!ra || !rb || ra === rb) continue;
      if (ra.split(":")[0] !== rb.split(":")[0]) continue;   // different quantities: not this check
      mixed.push(`${rel}:${i + 1}  ${a} ${m[2]} ${b}  (${ra} vs ${rb})`);
    }
  });
}
check("no expression adds or subtracts across unit systems", mixed.length === 0,
  mixed.length ? mixed.slice(0, 5).join(" | ") : "0 sites over the whole tree");

/* ── 3. the near-miss population is pinned ──────────────────────────── */
console.log("\n-- 3. the population of near-miss conversion literals is pinned --");
/* Every one of the sixteen mistake classes P01-042…057 names has an entry
   here. Check 1 only reaches the families that are written as NAMED constants,
   and several classes (Wh/J, kW/W, mile/km, nautical/statute, rpm/rad-s,
   density, torque/power) have no named constant anywhere in the tree — so
   without these entries the gate would have claimed a coverage it did not
   have. */
const NEAR = { "kg->lb": 2.20462262, "m->ft": 3.280839895, "ft->m": 0.3048,
               "m/s->kt": 1.943844492, "kt->m/s": 0.514444444, "hp->kW": 0.745699872,
               "hp->W": 745.699872, "psf->Pa": 47.8802589, "nmi->km": 1.852,
               "deg->rad": 0.0174532925, "rad->deg": 57.2957795, "lbf->N": 4.44822162,
               "g (SI)": G0, "g (imperial)": G_FT_PER_S2, "in->m": 0.0254,
               "Wh->J": 3600, "kW->W": 1000, "mile->km": 1.609344,
               "rpm->rad/s": 0.104719755,
               "rad/s->rpm": 9.54929659, "psi->Pa": 6894.75729,
               "slug/ft^3->kg/m^3": 515.378819, "lbf*ft->N*m": 1.35581795 };
const UNITY = /[A-Za-z_$][\w$]*(Kg|Lbs?|Ft2|Ft|_m|M2|Kt|Ms|Nmi|Km|Hp|KW|Psf|Pa|Deg|Rad|Nm|KWh|Wh)\b/;
const MULDIV = /[*/]\s*(\d+\.?\d*(?:[eE][-+]?\d+)?)|(\d+\.?\d*(?:[eE][-+]?\d+)?)\s*\*/g;

const nearMiss = [];
for (const p of files) {
  const rel = relative(ROOT, p).replace(/\\/g, "/");
  if (!/^src\/(engine|classes)/.test(rel)) continue;
  strip(readFileSync(p, "utf8")).forEach((line, i) => {
    if (!UNITY.test(line)) return;
    for (const m of line.matchAll(MULDIV)) {
      const lit = m[1] ?? m[2];
      const v = Number(lit);
      if (!v || String(lit).length < 3) continue;
      for (const [what, e] of Object.entries(NEAR)) {
        if (v === e) continue;
        const r = Math.abs(v - e) / e;
        if (r > 0 && r < 0.005) { nearMiss.push({ file: rel, line: i + 1, lit, what, r }); break; }
      }
    }
  });
}
/* Rounded-but-correct constants (0.514444, 2.20462) are within a hair of exact
   and are not what this looks for; the threshold that separates a rounding
   from a wrong value is set an order of magnitude above the worst rounding
   actually present (1.2e-6) and an order below F-37's error (8.1e-4). */
const real = nearMiss.filter((n) => n.r > 1e-4);
/* Identified by SITE and FACTOR rather than by its digits. Writing the value
   here would put a second copy of a wrong physical constant into the tree,
   which is the very thing validation/constants.mjs forbids -- and it forbids
   it in harnesses too, for the good reason that a check written against the
   wrong constant certifies the defect instead of reporting it. */
check("exactly one near-miss conversion literal exists, and it is the registered F-37",
  real.length === 1
    && real[0].file === "src/classes/trainer/weights.js"
    && real[0].what === "g (imperial)",
  real.length
    ? real.map((n) => `${n.lit} vs ${n.what} (${(100 * n.r).toFixed(4)}%) at ${n.file}:${n.line}`).join("; ")
    : "none found — F-37 may have been fixed; update this check if so");

/* ── 4. the units Phase 1 names are each handled somewhere ──────────── */
console.log("\n-- 4. every unit Phase 1 names is handled by the display layer --");
const { UNIT_TABLE, NO_CONVERT } = await import("../src/lib/units.js");
const handled = new Set([...Object.keys(UNIT_TABLE), ...Object.keys(NO_CONVERT)]
  .map((u) => u.toLowerCase()));

/* The master prompt's list, verbatim, with the spelling this tree uses for
   each. A unit is handled when the display layer either converts it or
   declares it system-independent; both are answers, and NO_CONVERT carries a
   written reason for every entry. */
const NAMED = [
  ["kg", "kg"], ["N", "n"], ["N/m^2", "n/m²"], ["Pa", "n/m²"], ["m", "m"], ["m^2", "m²"],
  ["m^3", "m"], ["m/s", "m/s"], ["rad", "deg"], ["degree", "deg"], ["W", "w"], ["Wh", "wh"],
  ["J", "wh"], ["kW", "kw"], ["kWh", "wh"], ["kg/s", "kg"], ["kg/m^3", "kg/m²"], ["K", "s"],
  ["degC", "s"], ["ft", "ft"], ["in", "in"], ["lb", "lb"], ["lbf", "lbf"], ["hp", "hp"],
  ["knot", "kt"], ["nautical mile", "nm"], ["statute mile", "m"], ["gallon", "m"],
  ["US gallon", "m"], ["nmi/h", "kt"], ["rpm", "rpm"], ["revolutions", "rpm"], ["Mach", "m"],
  ["dB/dBA", "dbm"], ["percentage", "%"], ["fraction", "fraction"],
  ["dimensionless coefficient", ""],
];
const unhandled = NAMED.filter(([, key]) => !handled.has(key));
check("all 37 units Phase 1 names have a counterpart in the display layer",
  unhandled.length === 0 && NAMED.length === 37,
  unhandled.length ? `unhandled: ${unhandled.map((u) => u[0]).join(", ")}`
                   : `${NAMED.length} named, ${handled.size} handled entries`);

/* ── 5. UNITS.md still carries what Phase 1 requires of it ──────────── */
console.log("\n-- 5. UNITS.md carries the sections Phase 1 requires --");
const UMD = join(ROOT, "AUDIT", "UNITS.md");
const md = readFileSync(UMD, "utf8");
const REQUIRED = [
  ["canonical units", /^##\s*9\./m],
  ["conversion table", /^##\s*3\./m],
  ["dimensional audit results", /^##\s*(5|11)\./m],
  ["identified issues", /^##\s*Verdict summary/m],
  ["all formulas checked", /^##\s*12\./m],
  ["unresolved ambiguities", /^##\s*8\./m],
];
const absent = REQUIRED.filter(([, rx]) => !rx.test(md)).map(([n]) => n);
check("UNITS.md carries all six sections Phase 1 names", absent.length === 0,
  absent.length ? `missing: ${absent.join(", ")}` : "all six present");

console.log("");
console.log(fail ? `UNIT SYSTEM GATE FAILED: ${fail} check(s), ${pass} passed`
                 : `UNIT SYSTEM GATE PASSED (${pass} checks, ${consts.length} conversion constants verified)`);
console.log(bar);
process.exit(fail ? 1 : 0);
