/* =====================================================================
   ONE FUSELAGE, ONE OUTLINE
   =====================================================================
   The body was drawn by three views that each wrote the curve out by
   hand: the general arrangement, the structural profile and the station
   diagram. Nothing held them together, and they drifted. The general
   arrangement closed its tail cone on +0.14H..+0.02H while the other two
   closed on +0.22H..+0.05H, so the same aeroplane had two different
   upsweeps depending on which tab was open, and the general arrangement's
   nose started 6% of H BELOW the centreline while the other two mirrored
   theirs. No harness mentioned any of the three files, which is why it
   survived.

   THE ASYMMETRY IS THE POINT, SO THIS GATE PROTECTS IT RATHER THAN
   REMOVING IT. An aft fuselage rises toward the tail — that is upsweep,
   and it is what buys rotation clearance. A symmetric tail cone would
   draw a dart. So the checks below assert the asymmetry has the right
   SIGN and lives only where it belongs: the keel must rise further than
   the crown falls, the tip must sit above the centreline, and everything
   else — the nose in side view, both halves in plan — must mirror exactly.
   Getting the upsweep backwards would still look like an aeroplane at a
   glance, which is precisely why it needs a gate and not an eye.

   WHAT IS SOURCED AND WHAT IS NOT, held here so neither can drift:

     nose fineness 1.8      Torenbeek 1982 §3.5.1 pp. 93-94, published 1.5-2.0
     tail-cone fineness 3.0 Torenbeek 1982 §3.5.1 pp. 93-94, published 2.5-3.0
     tail-cone upsweep      NOT SOURCED. CABIN-LAYOUT.md §5: "Do not invent one."

   The last line is the one that matters most. This gate checks that the
   upsweep is still declared an unsourced convention and still carries no
   citation, because the failure mode is somebody attaching a borrowed
   number to it. The sources that discuss upsweep do not share a datum —
   Torenbeek and Raymer measure it on the CENTRELINE, Raymer's 25 deg is a
   LOWER-SURFACE figure for rear-loading freighters only, and Kroo measures
   the centre of cross-sectional area at 75% of cone length — so a number
   lifted from any of them would be measured from the wrong line.
   ===================================================================== */
import { readFileSync } from "node:fs";
import {
  fuselageSideOutline, fuselagePlanOutline, outlinePath,
  FUSELAGE_FINENESS, FUSELAGE_CONVENTION, generalArrangement, val,
} from "../src/classes/aircraft/geometry.js";
import * as E from "../src/classes/aircraft/engine.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("FUSELAGE OUTLINE GATE");
console.log("=".repeat(78));

/* A body deliberately unlike a round number, so a fraction that is
   accidentally hard-coded cannot coincide with the right answer. */
const BODY = { length: 37.57, height: 4.01, noseLength: 5.26, tailLength: 12.03 };
const PLAN = { length: 37.57, width: 3.76, noseLength: 5.26, tailLength: 12.03 };
const side = fuselageSideOutline(BODY);
const plan = fuselagePlanOutline(PLAN);

/* ── 1. THE NOSE MIRRORS ──────────────────────────────────────────────
   In side view the nose is the half the code has no physical reason to
   make asymmetric, and the general arrangement made it so anyway. */
console.log("\n-- the nose is symmetric about the centreline --");

const tip = side[0][1];
check(near(tip[1], 0, 1e-12),
  "the nose tip sits exactly on the centreline",
  `z = ${tip[1]} m`);

const noseUpper = side[1], noseLower = side[7];
check(near(noseUpper[1][0], noseLower[1][0], 1e-12)
   && near(noseUpper[1][1], -noseLower[1][1], 1e-12),
  "the nose control points mirror in z at the same station",
  `upper (${noseUpper[1][0].toFixed(3)}, ${noseUpper[1][1].toFixed(3)}) against `
  + `lower (${noseLower[1][0].toFixed(3)}, ${noseLower[1][1].toFixed(3)})`);

check(near(side[1][2][1], -side[6][1][1], 1e-12),
  "the nose meets the barrel at equal and opposite z",
  `+${side[1][2][1].toFixed(3)} against ${side[6][1][1].toFixed(3)} m`);

/* ── 2. THE UPSWEEP HAS THE RIGHT SIGN AND SIZE ──────────────────────
   Both surfaces converge; what makes it upsweep is that the keel travels
   further than the crown. Reversing that would still close the shape. */
console.log("\n-- the tail cone is upswept, and upswept the right way --");

const H = BODY.height;
const crownTipZ = side[3][2][1], keelTipZ = side[4][1][1];
const crownDrop = H / 2 - crownTipZ;
const keelRise = keelTipZ - -H / 2;

check(keelRise > crownDrop,
  "the keel rises further than the crown falls -- this IS the upsweep",
  `keel +${keelRise.toFixed(3)} m against crown -${crownDrop.toFixed(3)} m `
  + `(${(keelRise / crownDrop).toFixed(2)}x)`);

check(crownTipZ > 0 && keelTipZ > 0,
  "the whole tip face sits above the centreline",
  `crown +${crownTipZ.toFixed(3)} m, keel +${keelTipZ.toFixed(3)} m`);

check(crownTipZ > keelTipZ,
  "the tip face is not inverted -- the crown stays above the keel",
  `${crownTipZ.toFixed(3)} m over ${keelTipZ.toFixed(3)} m`);

check(crownDrop > 0,
  "the crown descends over the tail cone rather than staying level",
  `${crownDrop.toFixed(3)} m, ${(100 * crownDrop / H).toFixed(0)}% of H -- an earlier `
  + "comment claimed it stayed level while the code dropped it 36% of H");

check(near(crownTipZ, H * FUSELAGE_CONVENTION.crownTipZ, 1e-12)
   && near(keelTipZ, H * FUSELAGE_CONVENTION.keelTipZ, 1e-12),
  "the tip face comes from the declared convention, not a literal",
  `${FUSELAGE_CONVENTION.crownTipZ} / ${FUSELAGE_CONVENTION.keelTipZ} of H`);

/* ── 3. THE PLAN VIEW MIRRORS EXACTLY ────────────────────────────────
   An aeroplane is symmetric about its vertical plane. There is no
   equivalent of upsweep here, so any asymmetry is a defect. */
console.log("\n-- the plan view is symmetric about the centreline --");

const starboardY = plan.slice(0, 4).flatMap(([, ...pts]) => pts.map((p) => p[1]));
const portY = plan.slice(4, 8).flatMap(([, ...pts]) => pts.map((p) => p[1]));
const mirrored = starboardY.length === portY.length
  && starboardY.every((y, i) => near(y, -portY[portY.length - 1 - i], 1e-12));
check(mirrored,
  "every port ordinate is the exact negative of its starboard twin",
  `${starboardY.length} points a side`);

const planXs = plan.slice(0, 4).flatMap(([, ...pts]) => pts.map((p) => p[0]));
const portXs = plan.slice(4, 8).flatMap(([, ...pts]) => pts.map((p) => p[0]));
check(planXs.every((x, i) => near(x, portXs[portXs.length - 1 - i], 1e-12)),
  "and sits at the same station as its twin",
  "port and starboard share every x");

/* ── 4. THE SOURCED NUMBERS ARE INSIDE THE PUBLISHED RANGES ──────────
   Torenbeek gives ranges, not values. What can be checked is that the
   value used sits inside the range quoted, and that the quote names him. */
console.log("\n-- nose and tail-cone fineness are Torenbeek's --");

const [nLo, nHi] = FUSELAGE_FINENESS.noseRange, [tLo, tHi] = FUSELAGE_FINENESS.tailConeRange;
check(FUSELAGE_FINENESS.nose >= nLo && FUSELAGE_FINENESS.nose <= nHi,
  "nose fineness sits inside the published range",
  `${FUSELAGE_FINENESS.nose} in ${nLo}-${nHi} -- "a frequently used value for the `
  + `length/diameter ratio is 1.5 to 2.0"`);

check(FUSELAGE_FINENESS.tailCone >= tLo && FUSELAGE_FINENESS.tailCone <= tHi,
  "tail-cone fineness sits inside the published range",
  `${FUSELAGE_FINENESS.tailCone} in ${tLo}-${tHi} -- the tail "is usually 2.5 to 3 `
  + `times the diameter of the cylindrical section"`);

check(/Torenbeek/.test(FUSELAGE_FINENESS.cite) && /3\.5\.1/.test(FUSELAGE_FINENESS.cite),
  "the citation names the author and the section, not just a number",
  FUSELAGE_FINENESS.cite);

/* ── 5. THE UPSWEEP IS STILL DECLARED UNSOURCED ──────────────────────
   The failure this guards is somebody attaching one of the published
   upsweep angles to it. They are all measured from different datums. */
console.log("\n-- the upsweep is still carried as an unsourced convention --");

check(!("cite" in FUSELAGE_CONVENTION) && !("source" in FUSELAGE_CONVENTION),
  "the closure convention carries NO citation, because none exists",
  "CABIN-LAYOUT.md section 5: \"Tail-cone upsweep angle. Not sourced anywhere. "
  + "... Do not invent one.\"");

const geomSrc = readFileSync(new URL("../src/classes/aircraft/geometry.js", import.meta.url), "utf8");
check(/Do not invent one/.test(geomSrc) && /ESDU 80006/.test(geomSrc),
  "geometry.js records the ruling and names the item that would replace it",
  "ESDU 80006, \"Drag increment due to rear fuselage upsweep\" -- paywalled");

/* ── 6. ALL THREE VIEWS DRAW THE SHARED CURVE ────────────────────────
   Checking the function alone would not catch a view that stops calling
   it, which is exactly how the three copies came to exist. */
console.log("\n-- every view that draws the body calls the shared outline --");

const VIEWS = [
  ["GeneralArrangement.jsx", true],
  ["FuselageViews.jsx", false],
  ["BalanceViews.jsx", false],
];
for (const [file, alsoPlan] of VIEWS) {
  const src = readFileSync(new URL(`../src/classes/aircraft/${file}`, import.meta.url), "utf8");
  check(/fuselageSideOutline\s*\(/.test(src),
    `${file} builds its side view from the shared outline`);
  if (alsoPlan)
    check(/fuselagePlanOutline\s*\(/.test(src),
      `${file} builds its plan view from the shared outline`);
  /* A hand-written body path is the thing that drifted. Any path literal
     that walks the fuselage stations by hand will mention a tail-cone
     fraction next to a height fraction, which is the shape of the old code. */
  check(!/`M \$\{[sXp]/.test(src),
    `${file} carries no hand-written fuselage path literal`);
}

/* ── 7. PROVENANCE FOLLOWS THE RATIO ACTUALLY DRAWN ──────────────────
   Torenbeek publishes RANGES, so the only honest question is whether the
   cone as drawn lands inside one — not which of the two terms won.

   THE MEASURED ANSWER IS THAT IT DOES NOT, on any class this tool sizes.
   The length fraction binds everywhere and the result falls below both
   published ranges, so the 1.8 and 3.0 caps are inert. That gap is held
   here as a number rather than left as a remark, because the temptation
   it guards against is relabelling these as sourced to get a dimension
   line onto the drawing. */
console.log("\n-- provenance follows the fineness the drawing ends up with --");

const CLASSES = ["transport", "bizjet", "turboprop", "trainer"];
const measured = [];
for (const type of CLASSES) {
  const ga = generalArrangement(E.designAircraft({ type, mode: "size", params: {} }));
  const D = Math.max(val(ga.fuselage.width), val(ga.fuselage.height));
  const parts = [
    ["nose", ga.fuselage.noseLength, FUSELAGE_FINENESS.noseRange],
    ["tail cone", ga.fuselage.tailLength, FUSELAGE_FINENESS.tailConeRange],
  ];
  for (const [name, node, [lo, hi]] of parts) {
    const f = val(node) / D, inside = f >= lo && f <= hi;
    measured.push([type, name, f, inside]);
    check(!!node.sourced === inside,
      `${type}: the ${name} is marked sourced exactly when its fineness is inside the range`,
      `fineness ${f.toFixed(2)} against published ${lo}-${hi} -- `
      + `${inside ? "inside" : "outside"}, marked ${node.sourced ? "sourced" : "convention"}`);
    check(node.sized === false,
      `${type}: the ${name} is never marked sized -- no loop produces it`);
    check(/Torenbeek/.test(node.sourced ? node.cite : node.why),
      `${type}: the ${name} names Torenbeek either way, as the range it met or missed`);
  }
}

/* The gap itself, stated as a fact rather than an aspiration. If a future
   change makes a cone slender enough to land in range, this check fails and
   the comment in geometry.js has to be re-measured -- which is the point. */
const anyInside = measured.some(([, , , inside]) => inside);
check(!anyInside,
  "no class currently draws a cone inside Torenbeek's ranges -- the caps are inert",
  measured.map(([t, n, f]) => `${t} ${n} ${f.toFixed(2)}`).join(", "));

/* ── 8. THE PATH FORMATTER IS FAITHFUL ───────────────────────────────── */
console.log("\n-- body coordinates reach the sheet unchanged --");

const path = outlinePath(side, (x) => x, (z) => z);
check(path.startsWith("M 0 0") && path.endsWith("Z"),
  "the path opens on a move and closes on Z",
  path.slice(0, 44) + " ... " + path.slice(-2));
check((path.match(/Q /g) || []).length === 4 && (path.match(/L /g) || []).length === 3,
  "every segment of the side outline survives formatting",
  "4 quadratics, 3 lines, 1 move, 1 close");

const scaled = outlinePath(side, (x) => 2 * x, (z) => 10 - z);
check(scaled.includes(`${2 * BODY.length} `),
  "the caller's own mappers are the only thing applied",
  `x doubled reaches ${2 * BODY.length}`);

console.log("");
console.log(fails.length ? `FUSELAGE OUTLINE GATE FAILED: ${fails.length} check(s)`
                         : `FUSELAGE OUTLINE GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
