/* =====================================================================
   GEAR GEOMETRY GATE — G6, the five criteria
   =====================================================================
   THE STRONGEST CHECK IN THIS FILE IS THE OLDEST DOCUMENT. NACA SR-63
   (1937) does not merely state the turnover and tip-back equations, it
   works them for a real aeroplane — the W-1A, with h+r = 4.5 ft,
   l₂ = 7.68 ft, l = 8.46 ft, l₃ = 9.0 ft — and publishes the answers:
   it turns over at mu = 0.8, and tips back at "about 10 degrees".
   Reproducing a 1937 report's own arithmetic is external in a way
   nothing in this codebase can influence, and it pins the transcription
   of both equations at once. If either were copied wrong, these two
   numbers would not come back.

   THE SECOND EXTERNAL CHECK is the A320, whose wheelbase and track are
   the only pair published as TEXT anywhere in this corpus (Boeing's are
   dimensions on scale drawings). Note what is asserted about the track
   and what is not: equation (25) yields a MINIMUM, so the published
   7.59 m must EXCEED the computed floor. A real aeroplane clearing a
   floor is the only relationship a floor can be checked by; asserting
   the two were equal would be asserting something the criterion never
   claims.

   WHAT THIS GATE REFUSES TO LET PASS. The trainer reports ONE combined
   "Landing gear" item. That is a gear mass centroid, not a wheelbase,
   and treating it as the main axle puts the CG behind the wheels and
   reports a NEGATIVE nose load — an aeroplane sitting on its tail. The
   module must decline, and the gate checks that it declines for that
   reason rather than producing a confident absurdity.

   AND THE TRAP THE DRAWING SETS. The tail cone upsweeps, so the tail TIP
   is high and far aft while the start of the cone is low and nearer.
   Taking the tip as the strike point gives a larger, flattering angle.
   The gate asserts the strike point is NOT the tip on any class, which
   is what makes the sampling worth doing rather than assuming.
   ===================================================================== */
import * as E from "../src/classes/aircraft/engine.js";
import { balanceOf } from "../src/classes/aircraft/balance.js";
import { generalArrangement, val } from "../src/classes/aircraft/geometry.js";
import { loadedVerticalCg } from "../src/classes/aircraft/vertical-cg.js";
import { A320_INPUTS } from "../src/classes/transport/validation-cases.js";
import {
  gearGeometry, turnoverMuCritical, minimumTrack, tipBackAngleDeg,
  MU_GROUND, PORPOISING_FLOOR, PROP_CLEARANCE_IN,
} from "../src/classes/aircraft/gear-geometry.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const FT = 0.3048;
const TYPES = ["transport", "bizjet", "turboprop", "trainer"];

function evaluate(type, params) {
  const r = E.designAircraft(params ? { type, params } : { type });
  const ga = generalArrangement(r);
  const balance = balanceOf(r);
  const verticalCg = loadedVerticalCg({ balance, ga, fuselageHeightM: val(ga.fuselage.height) });
  const propDiameterM = ga.props && ga.props.length ? ga.props[0].d : 0;
  return gearGeometry({ balance, ga, verticalCg, propDiameterM });
}
const G = Object.fromEntries(TYPES.map((t) => [t, evaluate(t)]));

console.log("GEAR GEOMETRY GATE");
console.log("=".repeat(78));

/* ── 1. NACA SR-63's OWN WORKED AEROPLANE ────────────────────────────*/
console.log("\n1. The 1937 report's own numbers");
{
  const W1A = { E: 4.5 * FT, A: 7.68 * FT, wheelbase: 8.46 * FT, track: 9.0 * FT };
  const mu = turnoverMuCritical(W1A);
  check(Math.abs(mu - 0.80) < 0.01,
    "eq. (25) reproduces SR-63's W-1A turnover at mu = 0.8",
    `computed ${mu.toFixed(3)} — NACA SR-63 p.6, "would nose over for mu >= 0.8"`);

  const phi = tipBackAngleDeg({ B: (8.46 - 7.68) * FT, E: 4.5 * FT });
  check(Math.abs(phi - 10) < 0.5,
    "eq. (26) reproduces the same aeroplane's tip-back of about 10 degrees",
    `computed ${phi.toFixed(1)} deg — SR-63 p.6, "amounted to about 10 deg for the W-1A"`);

  /* The two equations are inverses through the track, so solving one
     must return the other's input exactly. This catches a sign or a
     factor of two that both worked examples might tolerate. */
  const t = minimumTrack({ E: W1A.E, A: W1A.A, wheelbase: W1A.wheelbase, mu });
  check(Math.abs(t - W1A.track) < 1e-12,
    "and solving (25) for the track inverts it exactly",
    `recovered ${(t / FT).toFixed(4)} ft from mu = ${mu.toFixed(4)}, against 9.0 ft in`);
}

/* ── 2. THE ONE PUBLISHED WHEELBASE AND TRACK ────────────────────────*/
console.log("\n2. Against the A320, the only pair published as text");
{
  const a = evaluate("transport", A320_INPUTS);
  const WB = 12.64, TRACK = 7.59;      // AC_A320_0624 section 2-2, via LANDING-GEAR.md section 3.5

  check(a.resolved && Math.abs(a.wheelbase / WB - 1) < 0.10,
    "the wheelbase lands within the note's 10 % target",
    `${a.wheelbase.toFixed(2)} m against ${WB} m published, `
    + `${((a.wheelbase / WB - 1) * 100).toFixed(1)} %`);

  check(TRACK > a.turnover.minimumTrackM,
    "the A320's published track EXCEEDS the turnover minimum, as a floor requires",
    `published ${TRACK} m against a ${a.turnover.minimumTrackM.toFixed(2)} m floor — `
    + `(25) yields a minimum, so equality is not the claim and is not asserted`);
}

/* ── 3. THE REFUSAL ──────────────────────────────────────────────────*/
console.log("\n3. What the module declines to answer");
{
  const t = G.trainer;
  check(t.resolved === false,
    "the trainer is declined, not answered");
  check(/combined|single station/.test(t.why || ""),
    "and the reason names the combined gear item, not a vague failure",
    t.why);

  /* The absurdity it is refusing to print. */
  const r = E.designAircraft({ type: "trainer" });
  const bal = balanceOf(r);
  const lg = bal.items.find((i) => i.name === "Landing gear");
  const B = lg.x - bal.takeoff.xM;
  check(B < 0,
    "because treating that one station as the main axle gives a NEGATIVE nose load",
    `B = ${B.toFixed(3)} m: the CG would sit AFT of the main wheels, i.e. on its tail`);
}

/* ── 4. THE TAIL STRIKE IS NOT AT THE TIP ────────────────────────────*/
console.log("\n4. Where the aeroplane actually strikes");
["transport", "bizjet", "turboprop"].forEach((t) => {
  const g = G[t];
  check(g.rotation.atTailTip === false,
    `${t}: the strike point is on the cone, not at the tail tip`,
    `${g.rotation.angleDeg.toFixed(1)} deg at x = ${g.rotation.strikePoint.xM.toFixed(1)} m, `
    + `arm ${g.rotation.strikePoint.armM.toFixed(1)} m — the tip is higher and further aft, `
    + `so taking it would flatter the angle`);
});

/* ── 5. STATICS AND SYMBOLS ──────────────────────────────────────────*/
console.log("\n5. The statics, and the symbols they are written in");
["transport", "bizjet", "turboprop"].forEach((t) => {
  const g = G[t];
  check(Math.abs(g.noseFraction - g.B / (g.A + g.B)) < 1e-12,
    `${t}: the nose fraction is B/(A+B), plain statics and nothing else`);
  /* SR-63's A is the NOSE arm and is the long one. gear/ground-loads.js
     uses 14 CFR 25.493(e)'s opposite convention. Getting them the wrong
     way round still produces plausible numbers, which is exactly why
     this is asserted rather than trusted. */
  check(g.A > g.B,
    `${t}: A is the long arm, so the symbols are SR-63's and not 25.493(e)'s`,
    `A = ${g.A.toFixed(2)} m to the nose wheel, B = ${g.B.toFixed(2)} m to the mains`);
});

/* ── 6. REPORTED, NOT ASSERTED ───────────────────────────────────────
   Section 3.4 measures 4.6-12.7 % on flown aircraft and SR-63's 8 %
   porpoising figure sits INSIDE that band, so real aeroplanes fly at and
   below it. It is a warning, never a constraint, and the module says so. */
console.log("\n6. The soft floor, and the regulation that is not soft");
["transport", "bizjet", "turboprop"].forEach((t) => {
  const g = G[t];
  check(g.noseFraction > 0.046 && g.noseFraction < 0.127,
    `${t}: the static nose load lands in the measured 4.6-12.7 % band`,
    `${(g.noseFraction * 100).toFixed(1)} %, against SR-63's ${PORPOISING_FLOOR * 100} % `
    + `porpoising figure — a warning, not a constraint`);
});
{
  check(/soft warning/.test(G.transport.porpoising.note),
    "and the result says the floor is soft, rather than implying a failure");

  const p = G.turboprop.propeller;
  check(p && Math.abs(p.requiredM - PROP_CLEARANCE_IN.noseWheel * 0.0254) < 1e-12,
    "the propeller clearance is the regulation's seven inches, exactly",
    `${p.requiredM.toFixed(4)} m required, ${p.clearanceM.toFixed(3)} m available — `
    + `14 CFR 25.925(a) / 23.925(a)`);
  check(p.compliant === (p.clearanceM >= p.requiredM),
    "and compliance is the comparison, not a separate opinion");

  check(MU_GROUND === 0.8,
    "the turnover friction is the regulation's 0.8",
    "14 CFR 25.473(e) and 25.493(b)");

  check(/stalling angle/.test(G.transport.rotation.note),
    "the rotation result declares it is only the geometric half of 25.481(c)",
    "the regulation takes the lesser of this and the stalling angle");
}

console.log("\n" + "=".repeat(78));
console.log(`${passes} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
