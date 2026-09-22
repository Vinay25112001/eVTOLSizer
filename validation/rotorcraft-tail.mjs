/* =====================================================================
   ROTORCRAFT TAIL SIZING — NDARC's rotor-referenced tail volume
   =====================================================================
   Checks the method reproduces the aircraft it was measured from, that it
   is dimensionally what NDARC defines, and that it stays silent for the
   layouts with no published tail.
   ===================================================================== */
import { rotorcraftTailArea, ROTORCRAFT_TAIL_VOLUME, SBS_TAIL_ARM_OVER_R,
         SBS_BODY_LEN_OVER_R } from "../src/engine/rotorcrafttail.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("ROTORCRAFT TAIL GATE");
console.log("=".repeat(72));
console.log("  NDARC Theory NASA/TP-20220000355 sec. 14-1:  V = S l / (R A)");
console.log("");

/* 1. It reproduces the vehicle V was measured from. */
const R = 4.541;                                   // NASA SbS-E, 14.9 ft
const arm = SBS_TAIL_ARM_OVER_R * R;
const t = rotorcraftTailArea("sideBySide", R, arm);
const A = Math.PI * R * R;
const Vback = (t.Sh * arm) / (R * A);
check(Math.abs(Vback - ROTORCRAFT_TAIL_VOLUME.sideBySide.Vh) < 1e-9,
  "inverting the formula returns the V it was built from",
  `V ${Vback.toFixed(4)} — S = V R A / l and V = S l / R A are the same statement`);

/* 2. The area it gives at NASA's own rotor is the surface on their drawing.
      Measured span 220 px and chord 63 px against R = 375 px scale to
      2.66 m x 0.76 m at R = 4.541 m. */
const spanRef = (220 / 375) * R, chordRef = (63 / 375) * R;
const Sref = spanRef * chordRef;
check(Math.abs(t.Sh - Sref) / Sref < 0.02,
  "and the area matches the stabiliser measured off the drawing",
  `${t.Sh.toFixed(3)} m2 against ${Sref.toFixed(3)} m2 from span ${spanRef.toFixed(2)} m `
  + `x chord ${chordRef.toFixed(2)} m — closes to ${(100*Math.abs(t.Sh-Sref)/Sref).toFixed(2)}%`);

/* 3. Aspect ratio of that surface is a real stabiliser's, not a sliver. */
const AR = (spanRef * spanRef) / Sref;
check(AR > 2 && AR < 6,
  "the stabiliser has a stabiliser's aspect ratio",
  `AR ${AR.toFixed(2)} — between a stub and a sailplane, as a tail surface is`);

/* 4. A SHORTER arm demands MORE area, exactly as S = V R A / l requires.
      This is the property that makes the short-body case unshippable rather
      than merely inaccurate, and it should be visible in the model. */
const half = rotorcraftTailArea("sideBySide", R, arm / 2);
check(Math.abs(half.Sh / t.Sh - 2) < 1e-9,
  "halving the tail arm doubles the required area",
  `${t.Sh.toFixed(2)} -> ${half.Sh.toFixed(2)} m2 — inverse in l, so a stub boom `
  + `asks for an absurd surface instead of quietly under-sizing one`);

/* 5. Scale invariance: V is dimensionless, so the method must not care what
      units or what size aircraft it is handed. */
const big = rotorcraftTailArea("sideBySide", 2 * R, 2 * arm);
check(Math.abs(big.Sh / t.Sh - 4) < 1e-9,
  "area scales as R^2 when the aircraft is scaled",
  `doubling R and the arm gives x${(big.Sh / t.Sh).toFixed(2)} area — S ~ R A / l ~ R^2`);

/* 6. Layouts with no published tail get none. */
check(rotorcraftTailArea("multicopter", R, arm) === null,
  "a multicopter is given no tail",
  "NASA's quadrotor three-view (AIAA 2018-3847 Fig. 1) shows none, so the "
  + "model offers none rather than inventing one");

/* 7. The reference proportions are self-consistent: the tail arm has to fit
      inside the body it hangs off. */
check(SBS_TAIL_ARM_OVER_R < SBS_BODY_LEN_OVER_R,
  "the measured tail arm fits within the measured body length",
  `arm ${SBS_TAIL_ARM_OVER_R} R inside a ${SBS_BODY_LEN_OVER_R} R body — `
  + `the two were measured independently off the same figure and agree`);

console.log("");
if (fails) { console.log(`ROTORCRAFT TAIL GATE FAILED: ${fails}`); process.exit(1); }
console.log("ROTORCRAFT TAIL GATE PASSED");
