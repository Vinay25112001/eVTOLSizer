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
  fuselageSideOutline, fuselagePlanOutline, outlinePath, sectionStringerPoints,
  FUSELAGE_FINENESS, FUSELAGE_CONVENTION, FUSELAGE_UPSWEEP_MEASURED, fuselageClosure,
  generalArrangement, val, fuselageOutlinePoints,
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

/* ── 2b. AND THE SAME INVARIANTS ON EVERY CLASS THAT ACTUALLY DRAWS ───
   Everything above runs on the DEFAULT convention, which is
   self-consistent by construction, so it can never fail. That made it
   decorative the moment a class started drawing something else.

   IT MISSED A REAL INVERSION. Measuring the Dash 8's keel put the
   turboprop's keel tip at 0.243 H, ABOVE the convention's 0.220 H crown
   that the same class was still using, so its tail cone was drawn with a
   crossed tip face — by a change that only touched the keel. A tail cone
   closing on a face whose crown is above its keel is not a convention; it
   is what a closed shape means. So the invariants are re-run here against
   the closure each class really draws with. */
console.log("\n-- and the same invariants on every class's own closure --");

for (const t of ["transport", "bizjet", "turboprop", "trainer"]) {
  const c = fuselageClosure(t);
  check(c.crownTipZ > c.keelTipZ,
    `${t}: the tip face is not inverted — the crown stays above the keel`,
    `crown ${c.crownTipZ.toFixed(3)} H over keel ${c.keelTipZ.toFixed(3)} H, `
    + `face ${(c.crownTipZ - c.keelTipZ).toFixed(3)} H tall`);
  check(c.keelTipZ > 0 && c.crownTipZ > 0 && c.crownTipZ < 0.5,
    `${t}: the whole tip face sits above the centreline and below the crown line`, "");
  check((0.5 + c.keelTipZ) > (0.5 - c.crownTipZ),
    `${t}: the keel still rises further than the crown falls`,
    `keel +${(0.5 + c.keelTipZ).toFixed(3)} H against crown −${(0.5 - c.crownTipZ).toFixed(3)} H`);
}

/* A crown borrowed from another class must SAY it was borrowed. */
const tpClosure = fuselageClosure("turboprop");
check(tpClosure.crownFromOtherClass === true && /DISQUALIFIED/.test(tpClosure.source)
      && /different class/.test(tpClosure.source),
  "a class whose measured keel disqualifies the convention's crown says so in its own source",
  tpClosure.source.slice(0, 120) + "...");
check(fuselageClosure("transport").crownFromOtherClass !== true
      && fuselageClosure("trainer").crownFromOtherClass !== true,
  "and a class whose convention is still valid does not claim a borrowed crown", "");

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

/* ── 5. THE CONVENTION IS STILL A CONVENTION; THE MEASUREMENT IS SEPARATE ──
   The failure this guards is somebody attaching one of the published
   upsweep ANGLES to the convention. They are all measured from different
   datums. What replaced the convention for the measured classes is not an
   angle from a text but a closure read off the manufacturers' own drawings,
   and it lives in its own table with its pages (section 9). */
console.log("\n-- the fallback convention is still uncited, and the measurement is a separate table --");

check(!("cite" in FUSELAGE_CONVENTION) && !("source" in FUSELAGE_CONVENTION),
  "the closure convention carries NO citation, because none exists for it",
  "CABIN-LAYOUT.md section 5: \"Tail-cone upsweep angle. Not sourced anywhere. "
  + "... Do not invent one.\" -- the measured closures are in FUSELAGE_UPSWEEP_MEASURED, not here");

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

/* ── 9. THE MEASURED CLOSURES ARE THE DRAWINGS' NUMBERS, AND EACH CLASS DRAWS ITS OWN ──
   Three manufacturers' dimensioned side views were measured (research
   corpus, classes/cross-class/FUSELAGE-UPSWEEP.md; harness/measure-upsweep.py;
   log FUSELAGE-UPSWEEP-measurements.txt). LOG is a second, independent
   reading of that log; the table in geometry.js must equal it, every row
   must carry its drawing and a cross-check against a printed dimension,
   and the class closures must be built from the rows and nothing else. */
console.log("\n-- the measured closures equal the measurement log, and each class draws its own --");
const LOG = [   // aircraft, keelTipZ (H above CL), crownTipZ or null, coneStartLf, coneLengthH, keelChordDeg, cross-check %
  ["Boeing 737-100",       0.098, null,  0.658, 2.36, 14.2, 0.3],
  ["Airbus A320-200",      0.146, 0.389, 0.564, 3.96,  9.3, 1.7],
  ["Bombardier Dash 8-400", 0.243, null,  0.740, 2.93, 14.2, 1.1],
];
check(FUSELAGE_UPSWEEP_MEASURED.length === 3 && LOG.every(([name, k, c, s, l, a]) => {
    const r = FUSELAGE_UPSWEEP_MEASURED.find((x) => x.aircraft === name);
    return r && near(r.keelTipZ, k, 1e-12) && (c == null ? r.crownTipZ === null : near(r.crownTipZ, c, 1e-12))
        && near(r.coneStartLf, s, 1e-12) && near(r.coneLengthH, l, 1e-12) && near(r.keelChordDeg, a, 1e-12);
  }),
  "the three measured rows equal the measurement log (keel, crown, cone start, cone length, chord angle)",
  LOG.map(([n, k, c]) => `${n}: keel +${k} H, crown ${c == null ? "hidden by the fin" : "+" + c + " H"}`).join("; "));
check(FUSELAGE_UPSWEEP_MEASURED.every((r) => /p\. \d+|PDF index \d+/.test(r.drawing) && /\d+(\.\d+)? %/.test(r.crossCheck) && r.resolutionM > 0 && r.resolutionM < 0.02),
  "every row names its drawing page, states a cross-check against a printed dimension, and a pixel resolution under 2 cm",
  FUSELAGE_UPSWEEP_MEASURED.map((r) => `${r.aircraft}: ${r.crossCheck}`).join(" | "));
check(FUSELAGE_UPSWEEP_MEASURED.every((r) => r.keelTipZ > FUSELAGE_CONVENTION.keelTipZ),
  "every measured keel tip sits ABOVE the old convention's 0.05 H -- the convention was low, and is now only a labelled fallback",
  `measured ${FUSELAGE_UPSWEEP_MEASURED.map((r) => r.keelTipZ).join(", ")} H against ${FUSELAGE_CONVENTION.keelTipZ} H`);
const tr = fuselageClosure("transport"), tp = fuselageClosure("turboprop"), bj = fuselageClosure("bizjet"), tn = fuselageClosure("trainer");
check(tr.measured && near(tr.keelTipZ, (0.098 + 0.146) / 2, 1e-12) && near(tr.crownTipZ, 0.389, 1e-12) && tr.n === 2 && tr.crownMeasured,
  "transport: keel is the mean of the 737 and A320 (0.122 H), crown the A320's (0.389 H), n = 2, range stated",
  tr.source);
/* This check used to assert that the turboprop's crown "stays the
   convention". That was the defect: the Dash 8's measured keel of 0.243 H
   rises ABOVE the convention's 0.220 H crown, so keeping it drew an
   inverted tip face. What must be true now is that the class's own
   measurement disqualifies the convention, the crown is not claimed as
   this class's measurement, and the tip face is the right way up. */
check(tp.measured && near(tp.keelTipZ, 0.243, 1e-12) && !tp.crownMeasured
      && tp.crownFromOtherClass === true && near(tp.crownTipZ, 0.389, 1e-12)
      && tp.crownTipZ > tp.keelTipZ && /DISQUALIFIED/.test(tp.source),
  "turboprop: keel is the Dash 8's (0.243 H), which disqualifies the convention's 0.220 H crown; "
  + "the crown used is the only measured one, named as another class's",
  tp.source);
check(!bj.measured && !tn.measured && near(bj.keelTipZ, FUSELAGE_CONVENTION.keelTipZ, 1e-12) && /below every measured/.test(bj.source) && /below every measured/.test(tn.source),
  "bizjet and trainer: no drawing on disk, the convention is used and labelled as below the measured range",
  bj.source.slice(0, 90) + "...");
const sideT = fuselageSideOutline({ ...BODY, closure: tr });
check(near(sideT[4][1][1], BODY.height * tr.keelTipZ, 1e-12) && near(sideT[3][2][1], BODY.height * tr.crownTipZ, 1e-12)
   && sideT[4][1][1] > 0 && sideT[3][2][1] > sideT[4][1][1] && (sideT[4][1][1] + BODY.height / 2) > (BODY.height / 2 - sideT[3][2][1]),
  "an outline drawn with the transport closure puts the tip where the drawings do, and section 2's asymmetry still holds",
  `keel +${sideT[4][1][1].toFixed(3)} m, crown +${sideT[3][2][1].toFixed(3)} m on a ${BODY.height} m body`);
check(near(side[4][1][1], BODY.height * FUSELAGE_CONVENTION.keelTipZ, 1e-12),
  "an outline drawn with no closure still uses the convention -- callers must pass the class closure to get the measurement",
  "");
const gaT = generalArrangement(E.designAircraft({ type: "transport" }));
const gaP = generalArrangement(E.designAircraft({ type: "turboprop" }));
check(gaT.fuselage.closure.measured && near(gaT.fuselage.closure.keelTipZ, tr.keelTipZ, 1e-12)
   && gaP.fuselage.closure.measured && near(gaP.fuselage.closure.keelTipZ, tp.keelTipZ, 1e-12),
  "the general arrangement carries the class closure, so every view draws the same measured tip",
  `transport keel ${gaT.fuselage.closure.keelTipZ.toFixed(3)} H, turboprop ${gaP.fuselage.closure.keelTipZ.toFixed(3)} H`);
const viewFiles = ["GeneralArrangement.jsx", "FuselageViews.jsx", "BalanceViews.jsx"];
const passesClosure = viewFiles.filter((f) => {
  const s = readFileSync(new URL(`../src/classes/aircraft/${f}`, import.meta.url), "utf8");
  return /fuselageSideOutline\(\{[^}]*closure:/.test(s);
});
check(passesClosure.length === viewFiles.length,
  "all three views that draw the side outline pass the class closure (a view that omits it silently draws the convention)",
  passesClosure.join(", "));
const fsT = readFileSync(new URL("../src/classes/aircraft/fuselage-structure.js", import.meta.url), "utf8");
check(/closure: ga\.fuselage\.closure/.test(fsT),
  "the fuselage-structure shell carries the closure the general arrangement chose, so the fuselage tab draws the same tip",
  "");

/* -- 10. THE CROSS-SECTION STRINGERS MIRROR ---------------------------
   Same argument as section 3, one view along. A cross-section is
   symmetric about the aeroplane's vertical plane and has nothing like
   upsweep, so any left-right asymmetry is a defect.

   THIS IS A REGRESSION GATE ON A REAL DEFECT. The stringers used to be
   placed inside FuselageViews.jsx by walking the perimeter from the SIDE
   and putting stringer i at arc fraction i/n. The mirror of that point is
   at 1 - i/n, which is only in the set when n is EVEN. The count is
   Math.round(perimeter / pitch) and is odd about half the time, so the
   drawing broke its own symmetry on half the inputs; the trainer's 17
   stringers missed by a fifth of the semi-width. The placement now lives
   in geometry.js, measures from the crown at (i + 0.5)/n, and builds the
   port half as the sign flip of the starboard half.

   The odd counts are the ones that matter, so they are tested explicitly
   and the check is exact, not a tolerance. */
console.log("\n-- the cross-section stringers are symmetric about the vertical plane --");

const SECT = { width: 3.76, height: 4.01 };        // the same deliberately unround body
const oddCounts = [5, 17, 31, 53], evenCounts = [4, 16, 30, 52];
let worstMiss = 0, worstAt = 0;
for (const count of [...oddCounts, ...evenCounts]) {
  const pts = sectionStringerPoints({ count, ...SECT });
  const miss = Math.max(...pts.map(([y, z]) =>
    Math.min(...pts.map(([u, v]) => Math.hypot(u + y, v - z)))));
  if (miss > worstMiss) { worstMiss = miss; worstAt = count; }
}
check(worstMiss <= 1e-12,
  "every stringer has an exact mirror twin, at both odd and even counts",
  `worst miss ${worstMiss.toExponential(1)} m at n = ${worstAt}, over counts ${[...oddCounts, ...evenCounts].join(", ")}`);

check([...oddCounts, ...evenCounts].every((count) =>
        sectionStringerPoints({ count, ...SECT }).length === count),
  "and the count drawn is the count asked for",
  "an odd count keeps its keel stringer, which is its own mirror");

const odd17 = sectionStringerPoints({ count: 17, ...SECT });
check(odd17.filter(([y]) => Math.abs(y) < 1e-12).length === 1
      && odd17.filter(([y]) => y > 0).length === 8
      && odd17.filter(([y]) => y < 0).length === 8,
  "an odd count splits 8 / 1 on the keel / 8, not 9 / 8",
  "the unpaired stringer is ON the plane of symmetry rather than beside it");

/* The spacing must still be by ARC LENGTH, or the stringers bunch at the
   ends of the major axis. Equal arc length means equal neighbour gaps. */
const ring = sectionStringerPoints({ count: 52, ...SECT });
const gaps = ring.map(([y, z], i) => {
  const [u, v] = ring[(i + 1) % ring.length];
  return Math.hypot(u - y, v - z);
});
const spread = (Math.max(...gaps) - Math.min(...gaps)) / (gaps.reduce((s, g) => s + g, 0) / gaps.length);
check(spread < 0.02,
  "the stringers are spaced by arc length, not by angle",
  `chord spread ${(100 * spread).toFixed(2)} % of the mean gap (stepping the ANGLE instead gives 6.4 % on this section)`);

/* Tie the drawing to the hoisted function, the way section 6 ties the
   three side views to the shared outline. */
const fvSrc = readFileSync(new URL("../src/classes/aircraft/FuselageViews.jsx", import.meta.url), "utf8");
check(/sectionStringerPoints\(/.test(fvSrc) && !/2 \* Math\.PI \* i/.test(fvSrc),
  "the cross-section view calls the hoisted placement and no longer walks the ellipse itself",
  "a view that rolls its own placement can break the symmetry again without this gate noticing");

/* ── 11. the outline can be ASKED where the skin is ──────────────────
   A consumer that needs a point on the body — the tail-strike search is
   the first — must not describe the shape a second time. gear-geometry.js
   did, with the tip at a hard-coded 0.05 H, and drifted the moment the
   closure became per-class. fuselageOutlinePoints is the one sampler, so
   it is checked HERE, beside the outline it walks, and per class rather
   than on the default convention. */
console.log("\n11. The outline, sampled as points");
for (const type of ["transport", "bizjet", "turboprop", "trainer"]) {
  const r = E.designAircraft({ type });
  const ga = generalArrangement(r);
  const H = val(ga.fuselage.height), L = val(ga.fuselage.length);
  const spec = { length: L, height: H, noseLength: val(ga.fuselage.noseLength),
                 tailLength: val(ga.fuselage.tailLength), closure: ga.fuselage.closure };
  const pts = fuselageOutlinePoints(spec);
  check(pts.length > 100, `${type}: the outline samples to points`, `${pts.length} points`);

  /* THE TIP FACE THE CLASS ACTUALLY DRAWS must appear in the samples.
     This is the assertion that would have caught the drift: on a
     transport the keel tip is 0.122 H, not the convention's 0.05 H. */
  const atTip = pts.filter((p) => Math.abs(p.x - L) < 1e-9).map((p) => p.z / H).sort((a, b) => a - b);
  check(atTip.length >= 2, `${type}: the tip face is sampled`, `z/H at the tip: ${atTip.map((z) => z.toFixed(3)).join(", ")}`);
  check(atTip.some((z) => Math.abs(z - ga.fuselage.closure.keelTipZ) < 1e-9),
    `${type}: and carries the keel tip this class draws (${ga.fuselage.closure.keelTipZ.toFixed(3)} H)`,
    "a sampler that fell back to the convention would read 0.050 H here on every class");
  check(atTip.some((z) => Math.abs(z - ga.fuselage.closure.crownTipZ) < 1e-9),
    `${type}: and its crown tip (${ga.fuselage.closure.crownTipZ.toFixed(3)} H)`);

  /* every sampled point lies within the body it came from */
  const within = pts.every((p) => p.x >= -1e-9 && p.x <= L + 1e-9
                                  && p.z >= -H / 2 - 1e-9 && p.z <= H / 2 + 1e-9);
  check(within, `${type}: every sampled point lies inside the body's own bounds`);
  /* EVERY ANCHOR OF THE PATH MUST SURVIVE THE SAMPLING, so that a segment
     cannot be dropped silently. This replaced a check that the walk closed
     on the nose it started from, which could not fail: the side outline's
     last segment already ends at the nose, so first and last are equal
     whether or not the sampler handles the closing command at all. A
     mutant that removed that handling walked straight through it. */
  const anchors = fuselageSideOutline(spec)
    .filter(([op]) => op !== "Z")
    .map((seg) => seg[seg.length - 1]);
  const missing = anchors.filter((a) => !pts.some((p) => Math.abs(p.x - a[0]) < 1e-9 && Math.abs(p.z - a[1]) < 1e-9));
  check(missing.length === 0,
    `${type}: every one of the outline's ${anchors.length} anchor points appears in the samples`,
    missing.length ? `missing: ${missing.map((a) => `(${a[0].toFixed(3)}, ${a[1].toFixed(3)})`).join(" ")}` : "");
}

console.log("");
console.log(fails.length ? `FUSELAGE OUTLINE GATE FAILED: ${fails.length} check(s)`
                         : `FUSELAGE OUTLINE GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
