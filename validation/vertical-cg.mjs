/* =====================================================================
   VERTICAL CG GATE — E, and how much of it is really a prediction
   =====================================================================
   THE EXTERNAL NUMBER. E is measurable from published data with no model
   at all: 25.493-style statics on the ACAP's own static and braked nose
   loads give E = (A+B)(V_b - V_s)/(W a/g). Across five 737 MAX variants
   that returns 2.857 m with a 1.0 % spread. It comes from outside this
   codebase and cannot be tuned by it.

   THE CHECK THAT MATTERS IS NOT "IS E CLOSE". A build-up with four
   unsourced stations can be made close by moving any of them, so
   "within X %" would measure nothing but how wide X was chosen. The
   check here is stricter and is the honest question: does the published
   value lie INSIDE the envelope the module's own declared assumptions
   span, and WHERE in it? An envelope that misses the published answer
   means the model is wrong. An envelope so wide it cannot miss means the
   model predicts nothing. Both are reported as numbers.

   WHAT THE SENSITIVITY IS FOR. Every assumed station is swept across its
   stated range and ranked. The Phase C research expected the seated
   occupant to be the only unsourced station; it is one of four, and it
   is not the largest. Reporting that is the point - a module that hid
   three assumptions behind one would be worse than one that declares
   four.

   ALGEBRAIC FALSIFICATION. The tapered-surface centroid is exact and is
   checked against cases with closed-form answers. The mass must close on
   the take-off weight. The unitemised residual must be CG-neutral in z
   for the same reason B3 showed it is CG-neutral in x. Every item
   balance.js produces must get a station: an unplaced item does not
   fail, it silently drops mass out of the sum, which is exactly how the
   trainer first came out with half its weight missing.

   WHAT THIS GATE DOES NOT ASSERT. It does not claim E is sized. E is
   measured from the ground line, and the ground line is `sourced` on the
   transport and a convention on the other three classes, so E inherits
   that and the result says so. It does not validate the 777 target of
   5.092 m: this tool holds no 777 input deck, and inventing one to hit a
   number is not validation. It does not use the A320 back-solve as a
   target either - that data gives E = 3.06-3.31 m, an 8.3 % spread
   against the 737 family's 1.0 %, and two of its weight variants report
   IDENTICAL nose loads at different ramp weights, which is what design
   maxima look like rather than per-weight reactions. It is recorded as a
   cross-check that the method is not a Boeing artefact, not as a target.
   ===================================================================== */
import * as E from "../src/classes/aircraft/engine.js";
import { balanceOf } from "../src/classes/aircraft/balance.js";
import { generalArrangement, val } from "../src/classes/aircraft/geometry.js";
import {
  verticalCg, loadedVerticalCg, sensitivity, verticalStations,
  taperedCentroidFraction, ASSUMED,
} from "../src/classes/aircraft/vertical-cg.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const m = (x) => `${x.toFixed(3)} m`;

/* Back-solved from Boeing D6-38A004 Rev K sections 2.2 and 7.3, five
   737 MAX variants. See the module header for the statics. */
const E_737 = Object.freeze({ value: 2.857, spread: 0.010,
  src: "737 MAX ACAP sections 2.2/7.3, five variants, 1.0 % spread" });

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const CASE = Object.fromEntries(TYPES.map((t) => {
  const r = E.designAircraft({ type: t });
  const ga = generalArrangement(r);
  const balance = balanceOf(r);
  const fuselageHeightM = val(ga.fuselage.height);
  return [t, { r, ga, balance, fuselageHeightM }];
}));
const vcg = (t) => verticalCg(CASE[t]);
const lcg = (t) => loadedVerticalCg(CASE[t]);

console.log("VERTICAL CG GATE");
console.log("=".repeat(78));

/* ── 1. EVERY ITEM GETS A STATION ─────────────────────────────────────
   An unplaced item is not an error anywhere - it is mass that quietly
   leaves the moment sum. The trainer names its items differently from
   the jets and lost 49.5 % of its weight that way. */
console.log("\n1. Nothing falls out of the sum");
TYPES.forEach((t) => {
  const v = vcg(t);
  check(v.unplaced.length === 0,
    `${t}: every mass item balance.js produces has a vertical station`,
    v.unplaced.length ? `UNPLACED: ${v.unplaced.join(", ")}` : `${v.items.length} items placed`);
});

TYPES.forEach((t) => {
  const l = lcg(t);
  const mtow = CASE[t].balance.takeoff?.massKg || 0;
  check(Math.abs(l.massKg - mtow) < 1e-6,
    `${t}: the loaded mass closes on the take-off weight exactly`,
    `${l.massKg.toFixed(3)} kg against ${mtow.toFixed(3)} kg`);
});

/* FUEL IS THE LARGEST SINGLE MASS AND ITS STATION MUST BE THE WING.
   B3 already sources the tank as the box between the spars (FAA AMT
   Handbook, via STRUCTURAL-LAYOUT.md:376), so the fuel rides at the wing
   station and nowhere else. This check exists because a mutant that hung
   the fuel on the centreline instead SURVIVED everything else in this
   gate: it moves E by 150 mm, and the assumption envelope is wide enough
   to bracket the published value either way. The largest mass in the
   aeroplane needs a check of its own, not an envelope it can hide in. */
TYPES.forEach((t) => {
  const l = lcg(t);
  const fuel = l.added.find((a) => a.name === "Fuel");
  const wingZ = val(CASE[t].ga.wing.z);
  if (!fuel) { check(true, `${t}: carries no fuel item to place`); return; }
  check(Math.abs(fuel.z - wingZ) < 1e-12,
    `${t}: fuel rides at the wing station, because the tank IS the wing box`,
    `fuel at ${m(fuel.z)}, wing at ${m(wingZ)}, ${Math.round(fuel.massKg)} kg `
    + `= ${((fuel.massKg / l.massKg) * 100).toFixed(0)} % of the loaded aeroplane`);
});

/* ── 2. THE EXTERNAL NUMBER, AND WHERE IT SITS IN THE ENVELOPE ────────*/
console.log("\n2. Against Boeing's published E");
{
  const t = "transport";
  const l = lcg(t);
  const s = sensitivity(CASE[t]);

  /* The envelope: every assumed station pushed to whichever end of its
     own range raises E, and then to whichever lowers it. This is the
     widest E the module's declared uncertainty can produce. */
  let up = 0, down = 0;
  for (const d of s.drivers) {
    const hi = Math.max(d.eAtLo, d.eAtHi), lo = Math.min(d.eAtLo, d.eAtHi);
    up += hi - s.baseE;
    down += s.baseE - lo;
  }
  const envHi = l.eM + up, envLo = l.eM - down;

  check(E_737.value >= envLo && E_737.value <= envHi,
    "Boeing's published E lies INSIDE the envelope this module's assumptions span",
    `published ${m(E_737.value)} in [${m(envLo)}, ${m(envHi)}]; `
    + `model ${m(l.eM)} (${((l.eM / E_737.value - 1) * 100).toFixed(1)} %) — ${E_737.src}`);

  /* And the envelope must not be so wide that it could not have missed.
     A band wider than the answer itself asserts nothing. */
  const width = envHi - envLo;
  check(width < 0.25 * E_737.value,
    "and that envelope is narrow enough for the check to have been able to fail",
    `envelope ${m(width)} wide, ${((width / E_737.value) * 100).toFixed(1)} % of E — `
    + `a band that could not miss would prove nothing`);

  check(l.eM > 0 && l.eM < l.zCgM + 1e9 && l.zCgM < 0,
    "the CG sits BELOW the fuselage centreline, as it must on a low-wing twin",
    `z_cg ${m(l.zCgM)}, E ${m(l.eM)} above a ground line at ${m(CASE[t].ga.stance.z)}`);
}

/* ── 3. E BARELY MOVES WITH LOAD — WHICH IS WHY THE ACAP DATA WORKS ───
   The published E is constant to 1 % across five 737 variants of quite
   different weight. That is only possible if E is insensitive to load.
   The model reproduces that rather than assuming it: fuel sits low at
   the wing, passengers sit high above the floor, cargo sits lowest, and
   they very nearly cancel. */
console.log("\n3. The loaded and empty aeroplane stand at nearly the same E");
TYPES.forEach((t) => {
  const l = lcg(t);
  check(Math.abs(l.loadShiftM) < 0.15,
    `${t}: loading the aeroplane moves E by under 150 mm`,
    `empty ${m(l.emptyE)} -> loaded ${m(l.eM)}, shift ${(l.loadShiftM * 1000).toFixed(0)} mm`);
});

/* ── 4. WHAT THE ASSUMPTIONS ARE WORTH, RANKED ────────────────────────*/
console.log("\n4. The declared assumptions, ranked by what they move");
{
  const s = sensitivity(CASE.transport);
  s.drivers.forEach((d) => {
    console.log(`          ${d.key.padEnd(26)} ${m(d.swingM)}  `
      + `(${(d.swingPctOfE * 100).toFixed(1)} % of E)  over ${JSON.stringify(d.range)}`);
  });

  check(s.drivers.length === Object.keys(ASSUMED).length && s.drivers.length === 4,
    "every assumed station is declared in ASSUMED and swept here",
    `${s.drivers.length} assumptions, none hidden`);

  /* The research expected one gap and there are four. Recording it as a
     check keeps the claim honest if someone later adds a fifth. */
  check(s.drivers[0].key !== "occupantCgAboveFloorM",
    "the seated occupant is NOT the largest assumption, contrary to the research note",
    `largest is ${s.drivers[0].key} at ${m(s.drivers[0].swingM)}; `
    + `the occupant is ${m(s.drivers.find((d) => d.key === "occupantCgAboveFloorM").swingM)}`);

  check(s.drivers.every((d) => d.swingPctOfE < 0.10),
    "and no single assumption can move E by more than 10 %",
    "so E is not one guess wearing a build-up as a disguise");
}

/* ── 5. ALGEBRAIC FALSIFICATION ───────────────────────────────────────*/
console.log("\n5. The exact things, checked exactly");
{
  /* A rectangular surface's centroid is at half span; a perfect triangle
     at one third. Both are closed form and neither can be argued with. */
  check(Math.abs(taperedCentroidFraction(1) - 0.5) < 1e-12,
    "a untapered surface has its centroid at half span");
  check(Math.abs(taperedCentroidFraction(0) - 1 / 3) < 1e-12,
    "a fully tapered surface has its centroid at one third span");

  /* The residual carries no station of its own, so it must not move the
     answer - the same property B3 proved for the longitudinal case. */
  const t = "transport";
  const v = vcg(t);
  const res = v.items.find((i) => /^Unitemised/.test(i.name));
  const without = v.items.filter((i) => !/^Unitemised/.test(i.name));
  const mNo = without.reduce((a, p) => a + p.massKg, 0);
  const zNo = without.reduce((a, p) => a + p.massKg * p.z, 0) / mNo;
  check(res && Math.abs(zNo - v.zCgM) < 1e-9,
    "the unitemised OEW residual is CG-neutral in z, as it is in x",
    `with ${m(v.zCgM)}, without ${m(zNo)} — it sits at the centroid by construction`);

  /* The floor is the one sourced station and must stay sourced. */
  const st = verticalStations(CASE.transport);
  check(st.floor.kind === "sourced" && /Scholz/.test(st.floor.cite || ""),
    "the cabin floor is the module's one sourced station and names its source",
    st.floor.cite);
}

/* ── 6. E INHERITS THE GROUND LINE'S PROVENANCE ───────────────────────
   E is measured from the stance. The stance is checked against published
   clearance on the transport and is a bare convention on the other
   three, so E cannot be more external than that, and says so. */
console.log("\n6. E is only as external as the ground line under it");
{
  check(vcg("transport").stanceProvenance === "sourced",
    "the transport's E stands on a ground line with a published check");
  check(["bizjet", "turboprop", "trainer"].every((t) => vcg(t).stanceProvenance === "drawn"),
    "the other three stand on a convention, and the result carries that word");
  check(/no published check/.test(vcg("trainer").why),
    "and each says so in the result, not only in a comment",
    vcg("trainer").why);
}

console.log("\n" + "=".repeat(78));
console.log(`${passes} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
