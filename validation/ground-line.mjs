/* =====================================================================
   GROUND LINE GATE — how high the aeroplane stands
   =====================================================================
   The module under test replaced a one-term ground line with a
   three-term one: trunnion station, oleo length, tyre static loaded
   radius. This gate asks four kinds of question and they carry different
   weight, so it says which is which.

   EXTERNAL REPRODUCTION — a published number this code did not produce
   and cannot be tuned to. The transport's drawn centreline height must
   land inside Boeing's own published ground-clearance band for the
   737-7. The trainer's tyre must come out as the Cessna 172's published
   6.00-6. The transport's tyre, at the aft-CG end of the measured
   nose-load band, must come out as the 737-800's published
   H44.5x16.5-21. None of these three come from this codebase.

   ALGEBRAIC FALSIFICATION — a property that must hold for any correct
   implementation. The three terms must sum to the answer exactly. And
   the two REJECTED formulations must be shown to be worse, not merely
   asserted to be: the old belly-referenced form, and the "add the tyre
   but keep the belly reference" form that is the obvious minimal fix.

   THE REJECTED SHORTCUT — loading the mains with the whole aeroplane as
   a conservative bound. It is checked to be measurably wrong rather than
   safely wrong, because that is the reason it was not used, and a reason
   that is not checked decays into a preference.

   REFUSALS — the module must say which classes have an external check
   and which do not. Three of the four have none: the corpus holds three
   ACAP ground-clearance tables (737 MAX, 777, A320) and all three are
   jet transports.

   WHAT THIS GATE DELIBERATELY DOES NOT ASSERT. It does not claim the
   BELLY clearance matches Boeing's. It cannot: belly clearance is the
   centreline height minus the fuselage radius, and this tool sizes the
   transport's fuselage 3.969 m deep against the real 737's 3.76 m. That
   0.21 m belongs to the fuselage model, not to the gear, so the gate
   checks the quantity this module predicts — the centreline — and
   reports the other. It also does not claim the stance is SIZED. The
   trunnion station is a drawing convention and stays one until G6.
   ===================================================================== */
import * as E from "../src/classes/aircraft/engine.js";
import {
  generalArrangement, groundStance, stanceMainTyre,
  NOSE_LOAD_BAND, MAIN_WHEELS_PER_AXLE, TRAINER_MAX_PSI, val,
} from "../src/classes/aircraft/geometry.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const IN = 0.0254;
const m = (x) => `${x.toFixed(3)} m`;

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const RES = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const GA = Object.fromEntries(TYPES.map((t) => [t, generalArrangement(RES[t])]));

/* ── PUBLISHED DATA, transcribed with its page reference ──────────────
   Boeing D6-38A004 Rev K, 737 MAX, section 2.3.1 Ground Clearances for
   the 737-7, PDF page 29. The dimension text on Boeing's drawings is
   vector outline and does not extract; these were read from the rendered
   page as an image.

   Airbus AC_A320_0624, section 2-3-0 Ground Clearances, PDF page 48,
   reference point F1 (FUSELAGE BOTTOM FWD). Airbus's dimensions DO
   extract as text. The five values are the five non-jacked
   configurations; the 2.434 m jacked case is excluded because the
   aeroplane is not standing on its gear. */
const B737_7 = Object.freeze({
  fuselageTopM: [5.05, 5.51], fuselageBottomM: [1.27, 1.55],
  src: "Boeing D6-38A004 Rev K section 2.3.1, PDF p.29",
});
const A320 = Object.freeze({
  fuselageBottomFwdM: [1.719, 1.825],
  src: "Airbus AC_A320_0624 section 2-3-0, PDF p.48, point F1",
});
/* The centreline follows from the two published faces without assuming a
   diameter, which is the point of using both. */
const B737_7_CENTRELINE = Object.freeze([
  (B737_7.fuselageTopM[0] + B737_7.fuselageBottomM[0]) / 2,
  (B737_7.fuselageTopM[1] + B737_7.fuselageBottomM[1]) / 2,
]);

console.log("GROUND LINE GATE");
console.log("=".repeat(78));

/* ── 1. THE PUBLISHED BANDS, AS TRANSCRIBED ──────────────────────────
   These check the transcription, not the code. They are here because a
   band typed in the wrong order, or with a digit dropped, would make
   every check below pass against nonsense. */
console.log("\n1. The published bands");
{
  check(B737_7_CENTRELINE[0] > 3.15 && B737_7_CENTRELINE[0] < 3.17
     && B737_7_CENTRELINE[1] > 3.52 && B737_7_CENTRELINE[1] < 3.54,
    "737-7 centreline band derives from the two published faces",
    `${m(B737_7_CENTRELINE[0])} to ${m(B737_7_CENTRELINE[1])} — ${B737_7.src}`);

  const depth = B737_7.fuselageTopM[0] - B737_7.fuselageBottomM[0];
  check(Math.abs(depth - 3.76) < 0.05,
    "737 top minus bottom reproduces the 737's own 3.76 m fuselage diameter",
    `${m(depth)} — the reading is self-consistent, which is what licenses using both faces`);

  /* Two published transports, and they do NOT agree on how high a jet
     transport stands. This is a statement about Airbus and Boeing, not
     about this code, and it is the reason a single drawing convention is
     checked against ONE aeroplane and not claimed for the class. */
  check(A320.fuselageBottomFwdM[0] > B737_7.fuselageBottomM[1],
    "the A320 stands HIGHER than the 737-7, with no overlap between the bands",
    `A320 ${m(A320.fuselageBottomFwdM[0])}-${m(A320.fuselageBottomFwdM[1])} vs `
    + `737-7 ${m(B737_7.fuselageBottomM[0])}-${m(B737_7.fuselageBottomM[1])}; `
    + `one convention cannot hit both — ${A320.src}`);
}

/* ── 2. EXTERNAL REPRODUCTION ────────────────────────────────────────── */
console.log("\n2. External reproduction");
{
  const s = GA.transport.stance;
  const centreline = -s.z;
  check(centreline >= B737_7_CENTRELINE[0] && centreline <= B737_7_CENTRELINE[1],
    "the transport's drawn centreline lands inside Boeing's published band",
    `${m(centreline)} in ${m(B737_7_CENTRELINE[0])}-${m(B737_7_CENTRELINE[1])}`);

  /* The Cessna 172's main tyre, from LANDING-GEAR.md section 3.6's
     verbatim Goodyear application chart. The trainer is sized by
     PRESSURE, not by load; sizing it by load picks a 5.00-5, which
     section 3.6 predicts in as many words ("two sizes too small"). */
  const tr = GA.trainer.stance;
  check(tr.tyre && tr.tyre.size === "6.00-6",
    "the trainer reproduces the Cessna 172's published 6.00-6 main tyre",
    `picked ${tr.tyre ? tr.tyre.size : "none"} at the ${TRAINER_MAX_PSI} psi cap`);

  /* The 737-800's own main tyre. It comes out at the aft-CG end of the
     measured band, which is where a 737-800 at its aft CG actually sits. */
  const aft = stanceMainTyre("transport", RES.transport.mtowKg, NOSE_LOAD_BAND.min);
  check(aft && aft.tyre.size === "H44.5x16.5-21",
    "the transport reproduces the 737-800's published H44.5x16.5-21 at the aft-CG end",
    `picked ${aft ? aft.tyre.size : "none"} at a ${(NOSE_LOAD_BAND.min * 100).toFixed(1)} % nose load`);
}

/* ── 3. THE TWO REJECTED FORMULATIONS, SHOWN TO BE WORSE ─────────────── */
console.log("\n3. The rejected formulations");
{
  const ga = GA.transport, s = ga.stance;
  const fusH = val(ga.fuselage.height);

  /* The form that shipped until now: the oleo length hung off the belly. */
  const old = fusH / 2 + s.terms.oleo;
  check(old > B737_7_CENTRELINE[1],
    "the old belly-referenced form is ABOVE the published band",
    `${m(old)} against a ${m(B737_7_CENTRELINE[1])} ceiling — ${((old / -s.z - 1) * 100).toFixed(1)} % taller than the fix`);

  /* The obvious minimal fix — keep the belly reference, add the missing
     tyre — and it goes the WRONG WAY. This is the check that identifies
     the reference as the dominant error, and it is the reason the fix is
     not a one-line addition. */
  const minimal = fusH / 2 + s.terms.oleo + s.terms.tyreRadius;
  check(minimal > old && minimal > B737_7_CENTRELINE[1],
    "adding the tyre while keeping the belly reference makes it WORSE, not better",
    `${m(minimal)} against ${m(old)} before — the reference is the dominant error`);

  /* The three terms are the answer, exactly. */
  const sum = s.terms.trunnionZ - s.terms.oleo - s.terms.tyreRadius;
  check(Math.abs(sum - s.z) < 1e-12,
    "the three terms sum to the ground line exactly",
    `trunnion ${m(s.terms.trunnionZ)} − oleo ${m(s.terms.oleo)} − slr ${m(s.terms.tyreRadius)} = ${m(s.z)}`);
}

/* ── 4. THE SPLIT WE CANNOT COMPUTE YET DOES NOT BIND ─────────────────
   Selecting a main tyre wants the static load split, which wants the
   gear stations A and B, which is G6 and is not built. The claim that
   licenses drawing the ground line anyway is that the answer barely
   moves across the whole measured band. That claim is checked here
   rather than asserted in a comment. */
console.log("\n4. The unknown load split does not bind");
{
  const w = RES.transport.mtowKg;

  /* The nominal fraction the drawing actually uses must be a value the
     measured band contains. Without this the fraction could drift to
     zero — the rejected whole-aeroplane shortcut — and every other check
     here would still pass, because the clearance band is too wide to
     notice. Found by mutating this gate rather than by reading it. */
  const nominal = GA.transport.stance.terms.nominalNose;
  check(nominal >= NOSE_LOAD_BAND.min && nominal <= NOSE_LOAD_BAND.max,
    "the nominal nose-load fraction is inside the measured band",
    `${(nominal * 100).toFixed(2)} % in ${(NOSE_LOAD_BAND.min * 100).toFixed(1)}-`
    + `${(NOSE_LOAD_BAND.max * 100).toFixed(1)} %`);
  const radii = [];
  for (let f = NOSE_LOAD_BAND.min; f <= NOSE_LOAD_BAND.max + 1e-9; f += 0.002) {
    const p = stanceMainTyre("transport", w, f);
    if (p) radii.push(p.tyre.slrIn * IN);
  }
  const lo = Math.min(...radii), hi = Math.max(...radii);
  const spread = (hi - lo) / lo;
  const ga = GA.transport;
  const centrelineFor = (r) => -(val(ga.wing.z) - ga.stance.terms.oleo - r);

  /* THE CLAIM THAT LICENSES DRAWING THIS BEFORE G6, and it is not "the
     radius barely moves" — it moves 12.5 %. It is that every pick the
     band can produce still lands inside Boeing's band, because 0.057 m
     of tyre is small against 0.37 m of published spread. Checked over
     the whole band, not at two ends: the first version of this gate
     checked the ends, and the ends are not the extremes. */
  const outside = radii.filter((r) => {
    const c = centrelineFor(r);
    return c < B737_7_CENTRELINE[0] || c > B737_7_CENTRELINE[1];
  });
  check(radii.length > 30 && outside.length === 0,
    "EVERY tyre the measured band can produce leaves the centreline inside Boeing's band",
    `${radii.length} picks over ${(NOSE_LOAD_BAND.min * 100).toFixed(1)}-`
    + `${(NOSE_LOAD_BAND.max * 100).toFixed(1)} % nose load; radius ${m(lo)} to ${m(hi)} `
    + `(spread ${(spread * 100).toFixed(1)} %), centreline ${m(centrelineFor(lo))} to ${m(centrelineFor(hi))}`);

  /* WHY THE RADIUS IS JUMPY. `smallestTyre` minimises RATED LOAD, not
     size, and the book is not monotone in one against the other. Proved
     from the rows themselves rather than asserted, because everything
     geometric downstream — G7's stowage volume above all — inherits it. */
  const big = stanceMainTyre("transport", RES.transport.mtowKg, 0.118).tyre;
  const small = stanceMainTyre("transport", RES.transport.mtowKg, NOSE_LOAD_BAND.min).tyre;
  check(big.odMaxIn > small.odMaxIn && big.loadLb < small.loadLb,
    "the selector is sharp in LOAD and incidental in SIZE: a larger tyre carries less",
    `${big.size} is ${(big.odMaxIn - small.odMaxIn).toFixed(1)} in larger than ${small.size} `
    + `and rated ${small.loadLb - big.loadLb} lb LOWER — correct for a load rule, `
    + `but the geometry that comes back is incidental`);

  /* THE REJECTED SHORTCUT, stated honestly. Loading the mains with the
     whole aeroplane misses the published tyre by 19 % in radius — and
     STILL lands inside the clearance band. So the band alone does not
     discriminate, and it is the tyre reproduction in section 2 that
     does. A gate that only checked the band would have accepted this. */
  const whole = stanceMainTyre("transport", RES.transport.mtowKg, 0).tyre;
  const published = 18.5 * IN;                       // H44.5x16.5-21, the 737-800's own
  const radiusError = whole.slrIn * IN / published - 1;
  const stillInside = centrelineFor(whole.slrIn * IN) <= B737_7_CENTRELINE[1];
  check(radiusError > 0.15 && stillInside,
    "the whole-aeroplane shortcut misses the published tyre by 19 % yet passes the band",
    `${whole.size} at ${m(whole.slrIn * IN)} vs the 737-800's ${m(published)} — `
    + `${(radiusError * 100).toFixed(0)} % out, centreline ${m(centrelineFor(whole.slrIn * IN))} `
    + `still inside. The clearance band is too wide to catch it; the tyre check is not.`);
}

/* ── 5. REFUSALS AND LABELLING ────────────────────────────────────────
   Three of the four classes have no published ground-clearance table in
   this corpus. The module must say so rather than let a drawn number
   pass for a checked one. */
console.log("\n5. What is checked and what is only drawn");
{
  check(GA.transport.stance.validated === true,
    "the transport is marked as having an external check");

  const unchecked = TYPES.filter((t) => t !== "transport");
  check(unchecked.every((t) => GA[t].stance.validated === false),
    "the other three classes are marked as having none",
    unchecked.join(", ") + " — the corpus's three ACAPs are all jet transports");

  check(unchecked.every((t) => /no published ground-clearance table/.test(GA[t].stance.why)),
    "and each says why, in the result, not only in a comment");

  /* A stance that put the ground inside the fuselage would be a sign the
     terms had been stacked the wrong way round. */
  TYPES.forEach((t) => {
    const ga = GA[t];
    check(ga.stance.bellyClearance > 0,
      `${t}: the ground is below the fuselage, not inside it`,
      `belly clearance ${m(ga.stance.bellyClearance)}, centreline ${m(-ga.stance.z)}`);
  });

  /* The trainer is the only single-wheel class, and that is not a
     convention — section 3.6's Cessna 172 has one wheel a side. */
  check(MAIN_WHEELS_PER_AXLE.trainer === 1
     && ["transport", "bizjet", "turboprop"].every((t) => MAIN_WHEELS_PER_AXLE[t] === 2),
    "the trainer is single-wheel and the Part 25 classes are dual");

  /* ── WHAT THE DRAWING IS ALLOWED TO DIMENSION ──────────────────────
     The general arrangement dimensions OVERALL HEIGHT to the ground
     line, and its title block promises "dimensioned features are
     sized". The ground line is not sized on any class — it is a
     construction on the wing station, which the same title block lists
     as a convention. So the drawing was contradicting itself on all
     four classes, and it is the `sourced` category that resolves it:
     dimensionable where a published range exists to sit inside,
     provided the source is named; otherwise no dimension.

     This is checked here rather than in the render gate because the
     PERMISSION is a property of the geometry, not of the SVG. */
  check(GA.transport.stance.zProvenance.sourced === true
     && GA.transport.stance.zProvenance.sized !== true,
    "the transport's ground line is `sourced` — dimensionable, but not a result");

  check(/Boeing 737-7 ACAP/.test(GA.transport.stance.zProvenance.cite || ""),
    "and it carries the citation the drawing is required to render",
    GA.transport.stance.zProvenance.cite);

  check(unchecked.every((t) => {
    const p = GA[t].stance.zProvenance;
    return p.sourced !== true && p.sized !== true && typeof p.why === "string";
  }), "the other three are plain `drawn`, so the drawing must omit the height dimension",
    "a drawn quantity carries no dimension — the same rule the wing station already obeys");

  /* The provenance must agree with the value it wraps, or the drawing
     would dimension one number and the model would hold another. */
  TYPES.forEach((t) => {
    check(Math.abs(GA[t].stance.zProvenance.value - GA[t].stance.z) < 1e-12,
      `${t}: the dimensioned ground line is the one the model computed`);
  });
}

console.log("\n" + "=".repeat(78));
console.log(`${passes} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
