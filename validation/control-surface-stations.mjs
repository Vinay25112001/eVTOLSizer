/* =====================================================================
   CONTROL-SURFACE STATIONS GATE
   =====================================================================
   WHAT THIS GATE IS FOR

   The stations are the first control-surface geometry in the tool, and
   they arrive from two very different places: one set MEASURED off a
   scaled NASA drawing, the rest a THIRD-HAND table. The failure mode is
   not arithmetic. It is that the two get mixed, that a convention starts
   being described as a measurement, or that the drawing quietly draws one
   number while the module reports another.

   So the checks are about PROVENANCE, IDENTITY and TOPOLOGY:

     - the measured table equals a second, independent transcription of
       the same measurement log — the way the upsweep gate checks its own;
     - the drawing's own topology still holds: the inboard aileron sits in
       the gap between the two flap runs, which is what identified it;
     - the third-hand table is read as FULL span, and the table's own
       volume-coefficient column is what proves that, not an assertion;
     - the measurement and the corrected table AGREE, which is the whole
       reason the correction is trusted;
     - a class with no drawing is never reported as measured;
     - the panel a view draws lies on the surface it is drawn on;
     - and the two tail conventions are INCONSISTENT, which is stated
       rather than hidden.
   ===================================================================== */
import { readFileSync } from "node:fs";
import {
  SURFACE_STATIONS_MEASURED, HOWE_AILERON_CONVENTION, TAIL_SURFACE_SPAN_IMPLIED,
  NACELLE_ETA_CONVENTION, surfaceStations, nacelleEtas, howeAileronEta,
} from "../src/classes/aircraft/control-surface-stations.js";
import { surfacePanelPlan, trailingEdgeRun, generalArrangement, leSweepRad, val } from "../src/classes/aircraft/geometry.js";
import { SURFACE_CONVENTIONS } from "../src/classes/aircraft/control-surfaces.js";
import * as E from "../src/classes/aircraft/engine.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const mid = ([a, b]) => (a + b) / 2;

console.log("=".repeat(78));
console.log("CONTROL-SURFACE STATIONS GATE");
console.log("=".repeat(78));

/* ── 1. THE MEASURED TABLE IS THE MEASUREMENT LOG'S NUMBERS ──────────
   Transcribed a second time here, by hand, from
   classes/cross-class/CONTROL-SURFACE-STATIONS.md. A typo in the module
   has to be made twice, identically, to survive. */
console.log("\n-- the measured table is a second reading of the drawing --");

const LOG = {
  flap: [[0.116, 0.376], [0.444, 0.693]],
  aileron: [[0.382, 0.436], [0.722, 0.940]],
  spoiler: [[0.207, 0.283], [0.280, 0.354], [0.452, 0.513],
            [0.506, 0.566], [0.560, 0.618], [0.611, 0.671]],
  nacelleEta: [0.396, 0.703],
};
const M = SURFACE_STATIONS_MEASURED.find((r) => r.class === "transport");
check(!!M && SURFACE_STATIONS_MEASURED.length === 1,
  "one aircraft is measured, and it is the transport", M ? M.aircraft : "none");

for (const key of ["flap", "aileron", "spoiler"]) {
  const same = M[key].length === LOG[key].length
    && M[key].every((p, i) => near(p[0], LOG[key][i][0], 1e-12) && near(p[1], LOG[key][i][1], 1e-12));
  check(same, `every ${key} station equals the measurement log`,
    `${M[key].length} run(s): ${M[key].map(([a, b]) => `${a.toFixed(3)}-${b.toFixed(3)}`).join(", ")}`);
}
check(M.nacelleEta.every((e, i) => near(e, LOG.nacelleEta[i], 1e-12)),
  "and the nacelle stations do too", M.nacelleEta.join(", "));

check(/CR-2144/.test(M.drawing) && /213/.test(M.drawing) && /218/.test(M.drawing),
  "the row names its drawing, its printed page and its PDF index",
  M.drawing);
check(/0\.078/.test(M.crossCheck) && /scale bar/.test(M.crossCheck),
  "and states the cross-check that makes the scale trustworthy",
  M.crossCheck);
check(M.etaUncertainty > 0 && M.etaUncertainty <= 0.01 && M.nacelleEtaUncertainty > M.etaUncertainty,
  "the stated uncertainty is real, and the nacelles carry a bigger one than the surfaces",
  `surfaces +/-${M.etaUncertainty}, nacelles +/-${M.nacelleEtaUncertainty}`);

/* ── 2. THE STATIONS ARE PHYSICALLY POSSIBLE ─────────────────────────── */
console.log("\n-- the stations sit on a wing, in order, without overlapping --");

const allRuns = [...M.flap, ...M.aileron, ...M.spoiler];
check(allRuns.every(([a, b]) => a >= 0 && b <= 1 && a < b),
  "every run is inside the semispan and runs outboard",
  `${allRuns.length} runs, innermost ${Math.min(...allRuns.map((r) => r[0])).toFixed(3)}, `
  + `outermost ${Math.max(...allRuns.map((r) => r[1])).toFixed(3)}`);

/* Consecutive runs must be ORDERED, but they are NOT required to be
   disjoint, and the reason is geometry rather than slop. Each station is
   the spanwise extent of the panel's bounding box, and the divider drawn
   between two adjacent panels runs CHORDWISE, which on a swept wing is
   slanted relative to the span axis. So two touching panels' extents
   overlap by roughly the panel's depth times the tangent of the sweep.
   Measured, the worst overlap is 0.007 of semispan on the spoiler row.
   Requiring disjoint extents would be asserting something the drawing
   does not say; what it does say is that they are in order and that the
   overlap stays at the scale of that slant. The consequence is recorded
   in the module: a MIDPOINT is robust, a SPAN is an upper bound. */
for (const key of ["flap", "aileron", "spoiler"]) {
  const s = [...M[key]].sort((p, q) => p[0] - q[0]);
  check(s.every((p, i) => i === 0 || (p[0] > s[i - 1][0] && p[1] > s[i - 1][1])),
    `the ${key} runs are strictly ordered outboard`,
    s.map(([a, b]) => `${a.toFixed(3)}-${b.toFixed(3)}`).join(" | "));
  const worst = Math.max(0, ...s.map((p, i) => (i === 0 ? 0 : s[i - 1][1] - p[0])));
  check(worst <= 0.010,
    `and any overlap between adjacent ${key} runs is at the scale of the chordwise divider's slant`,
    `worst overlap ${worst.toFixed(3)} of semispan`);
}

/* ── 3. THE TOPOLOGY THAT IDENTIFIED THE INBOARD AILERON ─────────────
   CR-2144 printed p. 211 calls it "an inboard aileron between the inboard
   and outboard flaps". That is not a label on the drawing; it is a
   RELATION, and the measurement either satisfies it or the panel was
   misidentified. This is the check that would catch a relabelling. */
console.log("\n-- the drawing's own topology still identifies the surfaces --");

const [inbdFlap, outbdFlap] = M.flap;
const [inbdAil, outbdAil] = M.aileron;
check(inbdAil[0] > inbdFlap[1] && inbdAil[1] < outbdFlap[0],
  "the inboard aileron lies strictly between the two flap runs, as CR-2144 p. 211 describes it",
  `inboard flap ends ${inbdFlap[1].toFixed(3)}, aileron ${inbdAil[0].toFixed(3)}-${inbdAil[1].toFixed(3)}, `
  + `outboard flap starts ${outbdFlap[0].toFixed(3)}`);
check(outbdAil[0] > outbdFlap[1],
  "and the outboard aileron lies outboard of the outboard flap",
  `outboard flap ends ${outbdFlap[1].toFixed(3)}, aileron starts ${outbdAil[0].toFixed(3)}`);
check(M.spoiler.length === 6,
  "six spoiler panels came off the wing, against the text's five plus a most-inboard sixth",
  "the drawing does not say which is the symmetric-only one, and neither does the module");
check(/five spoiler panels/.test(M.labelling) && /between the inboard and/.test(M.labelling),
  "the row carries the text the identification rests on, verbatim", "");

/* ── 4. HOWE'S TABLE IS READ AS FULL SPAN, AND ITS OWN COLUMN PROVES IT ──
   The printed table gives b_A/b, c_A/c, y_A,M/b, S_A/S and the aileron
   volume coefficient V_A. Coene section 2.9.2 states l_A = 2 y_A,M, and
   with that the only form that reproduces the printed V_A column is
   V_A = (S_A/S)(y_A,M/b) — under the FULL-span reading. The semispan
   reading is exactly half on every row. This gate carries the arithmetic
   rather than the conclusion, so the conclusion cannot rot. */
console.log("\n-- Howe's y_A,M/b is a full-span fraction, by the table's own arithmetic --");

const PRINTED = [
  { row: "twin prop general", SAoverS: 0.065, yAMoverB: 0.360, VA: 0.024 },
  { row: "twin regional turboprop", SAoverS: 0.058, yAMoverB: 0.400, VA: 0.023 },
  { row: "executive jets", SAoverS: 0.052, yAMoverB: 0.390, VA: 0.020 },
  { row: "jet transport, low speed only", SAoverS: 0.032, yAMoverB: 0.420, VA: 0.014 },
];
const fullOk = PRINTED.every((r) => near(r.SAoverS * r.yAMoverB, r.VA, 0.001));
const semiMatches = PRINTED.filter((r) => near(r.SAoverS * r.yAMoverB / 2, r.VA, 0.001)).length;
check(fullOk,
  "the FULL-span reading reproduces the printed V_A on all four rows",
  PRINTED.map((r) => `${(r.SAoverS * r.yAMoverB).toFixed(4)} vs ${r.VA}`).join("; "));
check(semiMatches === 0,
  "and the semispan reading reproduces it on none of them",
  "it is exactly half on every row, which is the factor the research note was out by");
check(/FULL-span/.test(HOWE_AILERON_CONVENTION.source) && /third-hand|THIRD-HAND/i.test(HOWE_AILERON_CONVENTION.source),
  "the convention states both the reading and that it is third-hand",
  HOWE_AILERON_CONVENTION.source.slice(0, 90) + "...");

/* ── 5. THE MEASUREMENT AND THE CORRECTED TABLE AGREE ────────────────
   This is the independent test of section 4. The drawing knows nothing of
   Howe; if the corrected reading were still wrong, this would not close. */
console.log("\n-- the measurement confirms the corrected reading of the table --");

/* The station comes from the MODULE's own reader, not from arithmetic
   repeated here. A gate that recomputes `2 * y_A,M/b` for itself would
   still pass if the module went back to reading the table as semispan --
   the same hole eta_t and r_Mh went through. */
const jt = HOWE_AILERON_CONVENTION.rows.transport;
const howeOutbd = mid(howeAileronEta(jt));         // 0.86 of semispan
check(near(howeOutbd, 2 * jt.yAMoverB, 1e-12),
  "the module's own reader puts the aileron centre at TWICE the printed y_A,M/b",
  `howeAileronEta gives ${howeOutbd.toFixed(3)}, the printed figure is ${jt.yAMoverB}`);
const measuredOutbd = mid(outbdAil);
const err = Math.abs(measuredOutbd - howeOutbd) / howeOutbd;
check(err < 0.10,
  "the measured outboard aileron sits where the corrected table puts it, within 10 %",
  `measured ${measuredOutbd.toFixed(3)} vs corrected ${howeOutbd.toFixed(2)} (${(100 * err).toFixed(1)} %)`);
const oldReading = jt.yAMoverB;                    // 0.43, the semispan misreading
check(Math.abs(measuredOutbd - oldReading) / oldReading > 0.5,
  "and nowhere near the old semispan reading",
  `measured ${measuredOutbd.toFixed(3)} against ${oldReading} — out by `
  + `${(measuredOutbd / oldReading).toFixed(2)}x`);

/* ── 6. A CLASS WITH NO DRAWING IS NEVER REPORTED AS MEASURED ────────── */
console.log("\n-- a convention is never dressed as a measurement --");

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
for (const t of TYPES) {
  const s = surfaceStations(t);
  const shouldBeMeasured = t === "transport";
  check(!!s && s.measured === shouldBeMeasured,
    `${t}: measured = ${shouldBeMeasured}`,
    s.source.slice(0, 96) + (s.source.length > 96 ? "..." : ""));
}
for (const t of TYPES.filter((x) => x !== "transport")) {
  const s = surfaceStations(t);
  check(s.flap === null && s.spoiler === null && s.nacelleEta === null,
    `${t} draws no flap, spoiler or nacelle station, because none is sourced for it`,
    "Howe's table gives ailerons only");
  check(/convention, not measured/.test(s.source),
    `${t} says so in its own source string`, "");
}
check(TYPES.every((t) => {
  const s = surfaceStations(t);
  return s.aileron.every(([a, b]) => a >= 0 && b <= 1 && a < b);
}), "every class's aileron lands on its wing", TYPES.map((t) => {
  const [a, b] = surfaceStations(t).aileron[surfaceStations(t).aileron.length - 1];
  return `${t} ${a.toFixed(2)}-${b.toFixed(2)}`;
}).join(", "));

/* ── 7. THE TWO TAIL CONVENTIONS DO NOT AGREE, AND THAT IS STATED ──────
   areaFraction / chordRatio is the span the pair implies. Both come out
   longer than the surface they sit on, so they cannot both be drawn. */
console.log("\n-- the tail area and chord conventions are inconsistent, and the module says so --");

for (const k of ["elevator", "rudder"]) {
  const t = TAIL_SURFACE_SPAN_IMPLIED[k], c = SURFACE_CONVENTIONS[k];
  check(near(t.areaFraction, c.areaFraction, 1e-12) && near(t.chordRatio, c.chordRatio, 1e-12),
    `the ${k} figures are READ from control-surfaces.js, not restated`,
    `area ${t.areaFraction}, chord ${t.chordRatio}`);
  check(near(t.impliedSpanFraction, t.areaFraction / t.chordRatio, 1e-12) && t.impliedSpanFraction > 1,
    `the ${k}'s implied span is ${t.impliedSpanFraction.toFixed(2)} of its surface — longer than the surface`,
    "which is why the pair cannot both be drawn");
}
check(TAIL_SURFACE_SPAN_IMPLIED.drawnSpanFraction === 1.0 && /chord ratio/.test(TAIL_SURFACE_SPAN_IMPLIED.why),
  "the drawing takes the chord ratio and draws full span, and records that choice",
  TAIL_SURFACE_SPAN_IMPLIED.why.slice(0, 96) + "...");

/* ── 8. A DRAWN PANEL LIES ON THE SURFACE IT IS DRAWN ON ─────────────── */
console.log("\n-- a control-surface panel sits on its planform --");

const G = generalArrangement(E.designAircraft({ type: "transport" }));
const semi = G.wing.span / 2, y0 = val(G.fuselage.width) / 2 * 0.98;
const sweepLE = leSweepRad(G.wing.sweepDeg, (G.wing.span ** 2) / G.wing.area, G.wing.taper);
const geom = { rootLE: val(G.wing.rootLE), root: G.wing.root, tip: G.wing.tip, semi, sweepLE, y0 };
const CF = SURFACE_CONVENTIONS.aileron.chordRatio;
const panel = surfacePanelPlan({ ...geom, side: 1, eta0: outbdAil[0], eta1: outbdAil[1], chordFrac: CF });

const chordAt = (y) => geom.root + (geom.tip - geom.root) * ((y - y0) / (semi - y0));
const teAt = (y) => geom.rootLE + (y - y0) * Math.tan(sweepLE) + chordAt(y);
const leAt = (y) => geom.rootLE + (y - y0) * Math.tan(sweepLE);
check(panel.every(([x, y]) => x >= leAt(y) - 1e-9 && x <= teAt(y) + 1e-9),
  "every corner of the panel lies between the local leading and trailing edges",
  `${panel.length} corners, aileron chord ${(100 * CF).toFixed(0)} % of local`);
check(near(panel[1][0], teAt(panel[1][1]), 1e-9) && near(panel[2][0], teAt(panel[2][1]), 1e-9),
  "its aft edge IS the trailing edge, not a line near it", "");
check(near(panel[1][0] - panel[0][0], CF * chordAt(panel[0][1]), 1e-9),
  "and its chord is the stated fraction of the LOCAL chord, so it tapers with the wing",
  `inboard ${(panel[1][0] - panel[0][0]).toFixed(3)} m, outboard ${(panel[2][0] - panel[3][0]).toFixed(3)} m`);
check((panel[2][0] - panel[3][0]) < (panel[1][0] - panel[0][0]),
  "the outboard end is narrower than the inboard end on a tapered wing", "");

const mirror = surfacePanelPlan({ ...geom, side: -1, eta0: outbdAil[0], eta1: outbdAil[1], chordFrac: CF });
check(panel.every(([x, y], i) => near(x, mirror[i][0], 1e-12) && near(y, -mirror[i][1], 1e-12)),
  "the port panel is the exact sign flip of the starboard panel", "");

const run = trailingEdgeRun({ ...geom, side: 1, eta0: inbdFlap[0], eta1: inbdFlap[1] });
check(run.length === 2 && run.every(([x, y]) => near(x, teAt(y), 1e-9)),
  "a flap is drawn as a run ALONG the trailing edge, because its span is measured and its chord is not",
  `${(inbdFlap[1] - inbdFlap[0]).toFixed(3)} semispan of trailing edge`);

/* ── 9. A MEASUREMENT IS ONLY USED ON THE LAYOUT IT WAS TAKEN ON ──────
   The 747 is a four-engine aeroplane and the measured pod stations are
   two-a-side stations. The default transport in this tool is a TWIN.
   Where a 747's inboard engine sits is not evidence about where a twin's
   single engine sits, so the selector must refuse to transfer it — and
   this is the check that would catch it being transferred anyway. */
console.log("\n-- a nacelle measurement is not transferred to a different layout --");

const twoASide = nacelleEtas("transport", 2);
check(twoASide.measured && twoASide.etas.every((e, i) => near(e, M.nacelleEta[i], 1e-12)),
  "a transport with two engines a side gets the measured stations",
  twoASide.etas.join(", "));
const oneASide = nacelleEtas("transport", 1);
check(!oneASide.measured && oneASide.etas.length === 1,
  "a transport with ONE engine a side does NOT get them, and says why",
  oneASide.source.slice(0, 110) + "...");
check(/not evidence about this layout/.test(oneASide.source),
  "the refusal names the reason rather than silently falling back", "");
for (const t of ["bizjet", "turboprop", "trainer"]) {
  check(!nacelleEtas(t, 2).measured,
    `${t} with two a side is still a convention — nothing was measured for it`, "");
}
check(nacelleEtas("transport", 2).etas.every((e) => e > 0 && e < 1)
      && nacelleEtas("transport", 2).etas[0] > NACELLE_ETA_CONVENTION.twoInner,
  "and the measured inboard pod sits OUTBOARD of the convention it replaces",
  `measured ${M.nacelleEta[0]} against the convention's ${NACELLE_ETA_CONVENTION.twoInner}`);

/* The live drawing must agree with the selector for whatever layout it
   actually has — tie reported to used, one more time. */
const perSide = Math.max(1, Math.round(G.engines / 2));
const sel = nacelleEtas(G.type, perSide);
const pods = G.nacelles.filter((n) => n.kind === "pod" && n.y > 0).sort((a, b) => a.y - b.y);
check(pods.length === sel.etas.length
      && pods.every((n, i) => near(Math.abs(n.y) / semi, sel.etas[i], 1e-9)),
  "the drawn pods are at the stations the selector returns for this aeroplane's own layout",
  `${G.engines} engines, ${perSide} a side, ${sel.measured ? "measured" : "convention"}: `
  + pods.map((n) => (Math.abs(n.y) / semi).toFixed(3)).join(", "));

/* ── 10. TIE REPORTED TO USED ─────────────────────────────────────────
   The same hole that eta_t and r_Mh went through: a gate that checks the
   CONSTANT while the drawing reads something else. */
console.log("\n-- the drawing reads these stations and no others --");

const gaSrc = readFileSync(new URL("../src/classes/aircraft/GeneralArrangement.jsx", import.meta.url), "utf8");
/* Checking that the NAMES appear is not enough: a view can shadow them
   with its own local definitions and keep calling them. So the IMPORT is
   what is asserted, from the module that owns each one. */
check(/import\s*\{[^}]*\bsurfacePanelPlan\b[^}]*\btrailingEdgeRun\b[^}]*\}\s*from\s*"\.\/geometry\.js"/s.test(gaSrc),
  "the general arrangement IMPORTS the panel builders from geometry.js",
  "asserting only that the name appears would pass a view that shadowed it with its own");
check(/import\s*\{[^}]*\bsurfaceStations\b[^}]*\}\s*from\s*"\.\/control-surface-stations\.js"/s.test(gaSrc),
  "and imports the stations from the module that measured them",
  "a view that hard-codes a station can drift from the measurement without this gate noticing");
check(!/const\s+(surfacePanelPlan|trailingEdgeRun|surfaceStations)\s*=/.test(gaSrc),
  "and does not define its own copy of any of them", "");
check(!/0\.30 \+ 0\.27 \* i/.test(readFileSync(new URL("../src/classes/aircraft/geometry.js", import.meta.url), "utf8")),
  "the old unsourced nacelle station is gone from geometry.js", "");

console.log("");
console.log(fails.length ? `CONTROL-SURFACE STATIONS GATE FAILED: ${fails.length} check(s)`
                         : `CONTROL-SURFACE STATIONS GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
