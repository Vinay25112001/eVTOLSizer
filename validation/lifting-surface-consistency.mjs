/* =====================================================================
   ONE WING, ONE TAIL — the lifting surfaces drawn the same in every view
   =====================================================================
   The sibling of fuselage-outline.mjs, and it exists for the same reason:
   the general arrangement drew the same surface differently depending on
   which view you read, and no harness mentioned the file.

   fuselage-outline.mjs caught the BODY drifting between three views. The
   lifting surfaces were drifting in exactly the same way and were not
   covered by it:

     - the wing sat at -0.18H in the side view and -0.16H in the front
       view, so the aeroplane carried its wing at two heights on one sheet
       that promises orthographic alignment;

     - the tail LEADING EDGE was computed from a hardcoded taper of 0.4 on
       both tails, while the PLANFORM it was supposed to bound was built
       from the class's own taper -- 0.3 on a jet. The leading edge did not
       belong to the shape drawn beside it. This is the same drift the
       sweep helper was hoisted to fix (see leSweepRad), one argument to
       the left of it, and it survived that fix;

     - the tail SECTION THICKNESS was four different unsourced literals:
       0.13 for the tailplane in side view against 0.09 for the same
       tailplane in front view, and 0.11 / 0.055 / 0.06 for the fin --
       while engine/control-surfaces.js already carried a SOURCED value,
       tailThickness(), which the engine itself uses.

   WHAT IS SOURCED AND WHAT IS NOT, held here so neither can drift:

     tail section thickness   0.90 x wing t/c, clamped 9-12%
                              [SRC] Scholz ch.9 -- a real citation
     tail taper               NOT SOURCED. It is whatever the class sets;
                              this gate checks only that ONE value reaches
                              both the chords and the leading edge.
     wing vertical station    NOT SOURCED, and must stay declared as a
                              convention. Nothing in this tool sizes a
                              wing's height on the fuselage.

   THE POINT OF THE SOURCE-TEXT CHECKS. Several checks below read
   GeneralArrangement.jsx as text. That is deliberate: the failure mode
   here is not a wrong number, it is somebody RE-HARDCODING one next to
   the value that was hoisted, at which point the computed value is still
   correct and still unused. A value check alone cannot see that.
   ===================================================================== */
import { readFileSync } from "node:fs";
import { generalArrangement, val, leSweepRad } from "../src/classes/aircraft/geometry.js";
import { tailThickness, TAIL_TC_MIN, TAIL_TC_MAX, TAIL_TC_WING_FRACTION }
  from "../src/engine/control-surfaces.js";
import * as E from "../src/classes/aircraft/engine.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("LIFTING SURFACE CONSISTENCY GATE");
console.log("=".repeat(78));

const CLASSES = ["transport", "bizjet", "turboprop", "trainer"];
const GA = Object.fromEntries(CLASSES.map((type) =>
  [type, generalArrangement(E.designAircraft({ type, mode: "size", params: {} }))]));

const SRC = readFileSync(new URL("../src/classes/aircraft/GeneralArrangement.jsx", import.meta.url), "utf8");

/* Source-text checks run against CODE, not SRC: the comments explain the
   bugs being guarded against and therefore QUOTE them. Testing the raw file
   means documenting a defect re-triggers its own gate, which is how the
   first version of this file failed. Strip block and line comments first. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. ONE WING, ONE HEIGHT ──────────────────────────────────────────
   The two views must read one value, and that value must stay a declared
   convention rather than quietly becoming a result. */
console.log("\n-- the wing sits at one height, and it is declared a convention --");

for (const type of CLASSES) {
  const z = GA[type].wing.z;
  check(z && typeof z === "object" && "value" in z,
    `${type}: the wing carries a vertical station as a tagged value`,
    `z = ${JSON.stringify(z)}`);
  check(z && z.sized === false && !z.sourced && typeof z.why === "string" && z.why.length > 0,
    `${type}: that station is declared an unsourced convention, with a reason`,
    z ? `sized=${z.sized} sourced=${!!z.sourced} why="${z.why}"` : "absent");
  check(near(val(z), -val(GA[type].fuselage.height) * 0.16, 1e-12),
    `${type}: it is the declared fraction of body height, not a second number`,
    `${val(z).toFixed(4)} m against -0.16 x ${val(GA[type].fuselage.height).toFixed(4)} m`);
}

check(/sZ\(wingZ\)/.test(CODE) && /fZ\(wingZ\)/.test(CODE),
  "both the side view and the front view read that one station",
  "sZ(wingZ) and fZ(wingZ) are both present");

check(!/[-(]\s*H\s*\*\s*0\.1[0-9]/.test(CODE),
  "no view has re-hardcoded a wing height beside it",
  "no `H * 0.1x` literal survives in the drawing");

/* ── 2. ONE TAIL, ONE TAPER ───────────────────────────────────────────
   The leading edge must be computed from the taper the chords were built
   from. The old literal was 0.4 on both tails. */
console.log("\n-- the tail leading edge belongs to the planform drawn beside it --");

const taperOf = (s) => (s.root > 0 ? s.tip / s.root : 1);

for (const type of CLASSES) {
  for (const which of ["ht", "vt"]) {
    const s = GA[type][which];
    const t = taperOf(s);
    check(t > 0.05 && t <= 1.0 && Number.isFinite(t),
      `${type} ${which}: the drawn chords imply a usable taper`,
      `tip ${s.tip.toFixed(4)} / root ${s.root.toFixed(4)} = ${t.toFixed(4)}`);
  }
}

/* Line-based, NOT a single regex over the whole call. `leSweep\([^)]*,0\.4\)`
   looks right and cannot work: the argument list contains Math.max(...), so
   [^)] stops at the wrong bracket and the guard silently matches nothing. A
   mutant that put the literal back survived it. Match the LINE instead. */
const sweepLines = CODE.split("\n").filter((l) => l.includes("leSweep("));
check(sweepLines.length >= 2,
  "both tail leading edges are computed through the shared helper",
  `${sweepLines.length} leSweep call site(s)`);
/* Every call must READ a taper -- taperOf(...) for the tails, g.wing.taper
   for the wing, which is a real per-class value -- and none may STATE one
   as a decimal literal. */
check(sweepLines.every((l) => /taperOf\(|\.taper\b/.test(l))
   && !sweepLines.some((l) => /,\s*0\.\d+\s*\)/.test(l)),
  "no leading-edge sweep is computed from a hardcoded taper",
  `${sweepLines.length} call sites, each reading a taper rather than stating one`);

/* THE CHECK THAT CAN FAIL. If the hardcoded 0.4 had happened to equal
   every class's real taper, the fix would be untestable and this gate
   would be theatre. It does not: measure the angle the old literal would
   have drawn against the one the planform actually implies. */
const drift = [];
for (const type of CLASSES) {
  const s = GA[type].ht;
  const ar = s.span ** 2 / Math.max(s.area, 1e-6);
  const sweep = val(s.sweepDeg);
  const real = leSweepRad(sweep, ar, taperOf(s));
  const old = leSweepRad(sweep, ar, 0.4);
  drift.push([type, ((real - old) * 180) / Math.PI]);
}
const worst = drift.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
check(Math.abs(worst[1]) > 0.1,
  "the hardcoded taper really did draw a different leading edge",
  drift.map(([t, d]) => `${t} ${d >= 0 ? "+" : ""}${d.toFixed(2)} deg`).join(", ")
    + ` -- worst ${worst[0]}`);

/* ── 3. ONE TAIL, ONE THICKNESS, AND IT IS THE SOURCED ONE ────────────
   Check the RELATION, not the digits: where a quantity is pinned by
   another quantity, the digits can be right for the wrong reason. */
console.log("\n-- tail section thickness is the sourced one, in every view --");

for (const type of CLASSES) {
  const wingTC = GA[type].wing.tc;
  const t = tailThickness(wingTC);
  check(t >= TAIL_TC_MIN - 1e-12 && t <= TAIL_TC_MAX + 1e-12,
    `${type}: the tail thickness lies inside Scholz's published 9-12% band`,
    `wing t/c ${wingTC} -> tail t/c ${t.toFixed(4)}`);
  const unclamped = TAIL_TC_WING_FRACTION * wingTC;
  if (unclamped >= TAIL_TC_MIN && unclamped <= TAIL_TC_MAX) {
    check(near(t, unclamped, 1e-12),
      `${type}: and it IS 0.90 x the wing's, not a coincidence at the clamp`,
      `0.90 x ${wingTC} = ${unclamped.toFixed(4)}`);
  } else {
    check(near(t, Math.min(TAIL_TC_MAX, Math.max(TAIL_TC_MIN, unclamped)), 1e-12),
      `${type}: the band binds, and it binds to the published edge`,
      `0.90 x ${wingTC} = ${unclamped.toFixed(4)} -> clamped to ${t.toFixed(4)}`);
  }
}

check(/import\s*\{\s*tailThickness\s*\}/.test(CODE),
  "the drawing reads the sourced thickness rather than restating it",
  "tailThickness is imported by GeneralArrangement.jsx");

for (const [lit, what] of [
  ["0\\.13", "tailplane in side view"],
  ["0\\.09", "tailplane in front view"],
  ["0\\.11", "fin in plan view"],
  ["0\\.055", "fin half-width in front view"],
  ["0\\.06", "fin tip half-width in front view"],
]) {
  check(!new RegExp(`(g\\.(?:ht|vt)\\.(?:root|tip)\\s*\\*\\s*${lit})`).test(CODE),
    `no unsourced thickness literal survives for the ${what}`,
    `no \`g.ht/vt.root|tip * ${lit.replace("\\", "")}\``);
}

/* ── 4. THE SHEET DOES NOT CLAIM A SCALE IT CANNOT HONOUR ─────────────
   The drawing renders at width:100%, so its printed size is whatever the
   container is. "1 : N on a 280 mm sheet" asserted a ratio no reader
   could measure. */
console.log("\n-- the title block claims only what the sheet can honour --");

/* This keys on the COMPUTATION, not on the phrase. Keying it on the words
   the old cell printed failed the moment the fix's own comment quoted them
   to explain itself -- a source-text check must match something that only
   live code can contain, or documenting the bug re-triggers the gate. */
check(!/mm\s*sheet/.test(CODE) && !/1\s*:\s*\$\{/.test(CODE)
   && !/sheetW\s*\/\s*0\.28/.test(CODE),
  "the title block states no printed scale ratio, computed or literal",
  "no `1 : N on a NNN mm sheet` claim survives in code");
check(/one scale, all three views/.test(CODE),
  "it states the thing that IS true -- the three views share one scale",
  "the views can be compared against each other");

console.log("");
console.log(fails.length ? `LIFTING SURFACE GATE FAILED: ${fails.length} check(s)`
                         : `LIFTING SURFACE GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
