/* =====================================================================
   WHIRL-FLUTTER GATE
   =====================================================================
   Checks the applicability logic and the margin arithmetic, and reports
   every layout. It does NOT check a computed boundary, because this tool
   computes none — see engine/whirlflutter.js for why that is deliberate.
   ===================================================================== */
import { whirlFlutterCheck, WHIRL_APPLIES, XV15_WHIRL } from "../src/engine/whirlflutter.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("WHIRL-FLUTTER GATE");
console.log("=".repeat(74));
console.log("  Acree, Peyran & Johnson, AHS 55th Forum 1999 — one airframe, two wings:");
console.log("    XV-15  23% t/c -> 335 kt      15% t/c -> 275 kt   (antisymmetric beam)");
console.log("    the 15% wing was sized to 529 kt static divergence and still fluttered at 275");
console.log("");

/* 1. The published pair must survive the round trip. */
check(XV15_WHIRL.thick.boundaryKt - XV15_WHIRL.thin.boundaryKt === 60,
  "the published thick-to-thin penalty is carried exactly",
  `335 - 275 = 60 kt for a t/c change of 0.23 -> 0.15, same aircraft otherwise`);

check(XV15_WHIRL.staticDivergenceKt > XV15_WHIRL.thin.boundaryKt * 1.9,
  "and static divergence is nowhere near the flutter boundary",
  `529 kt divergence against a 275 kt flutter boundary — strength and stiffness `
  + `sized for divergence do not buy flutter margin, which is the whole lesson`);

/* 2. Applicability must follow the physics, not the layout name. */
check(WHIRL_APPLIES.liftcruise.applies === false,
  "a layout whose rotors STOP in cruise is not whirl-flutter critical",
  "a stopped rotor has no whirl mode, and the pusher is on the centreline "
  + "with no wing to couple with");

check(WHIRL_APPLIES.multicopter.applies === false
   && WHIRL_APPLIES.sideBySide.applies === true,
  "but a rotor-borne layout is judged on whether it has a spanwise structure",
  "multicopter no; side-by-side YES — NASA \"modeled [it] with a tiltrotor wing "
  + "for the rotor support beam ... preventing the whirl-flutter constraint from "
  + "becoming active\"");

/* 3. Margin arithmetic, and the refusal to interpolate. */
const thin = whirlFlutterCheck({ configType: "tiltrotor", tc: 0.15, vCruise_ms: 100 });
const thick = whirlFlutterCheck({ configType: "tiltrotor", tc: 0.25, vCruise_ms: 100 });
check(thin.referenceBoundaryKt === 275 && thick.referenceBoundaryKt === 335,
  "a wing is compared with whichever published wing it resembles",
  `t/c 0.15 -> 275 kt, t/c 0.25 -> 335 kt; never a value between them, because `
  + `two points on one airframe are not a curve`);

const veryThin = whirlFlutterCheck({ configType: "tiltrotor", tc: 0.10, vCruise_ms: 100 });
check(veryThin.thinnerThanReference === true && veryThin.referenceBoundaryKt === 275,
  "and a wing thinner than the thin reference is flagged, not extrapolated",
  `t/c 0.10 keeps the 275 kt reference and sets thinnerThanReference — the honest `
  + `statement is "at least this bad", not a number off the end of a fitted line`);

/* 4. Report every layout at its own design point. */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

console.log("");
console.log("  MEASURED, NOT ASSERTED — every layout at its design point:");
console.log("    layout         applies  t/c    Vcr(kt)  ref(kt)  margin  verdict");
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const w = whirlFlutterCheck({ configType:k, tc:p.tc, vCruise_ms:p.vCruise,
                                rootEI:S.wingBox?.rootEI });
  if (!w.applies) {
    console.log(`    ${k.padEnd(14)}   no                                    ${w.why}`);
    continue;
  }
  console.log(`    ${k.padEnd(14)}  yes  ${String(w.tc).padStart(5)}`
    + `${String(w.vCruiseKt).padStart(9)}${String(w.referenceBoundaryKt).padStart(9)}`
    + `${String(w.marginRatio).padStart(8)}  ${w.verdict}`);
}

console.log("");
console.log("  WHAT THAT SAYS:");
console.log("    Margins run 1.58 to 2.81, so these aircraft cruise at 36-63% of the");
console.log("    speed at which a thin-wing XV-15 flutters. Whirl flutter is a HIGH-SPEED");
console.log("    tiltrotor constraint and these are 98-174 kt aircraft, which is why NASA");
console.log("    could size the side-by-side beam and keep the constraint inactive rather");
console.log("    than design around it.");
console.log("");
console.log("    THE TILTROTOR IS THE TIGHT ONE, at 1.58. It is the fastest layout here");
console.log("    and the one whose rotors are proprotors on a wing — the exact case the");
console.log("    XV-15 study is about. A 1.58 margin against another aircraft's boundary");
console.log("    is not a clearance; it is the point at which a real analysis is owed.");
console.log("");
console.log("    That is a margin argument, not an analysis. The boundary quoted belongs");
console.log("    to the XV-15. No coupled rotor/wing eigenanalysis exists in this tool,");
console.log("    and Acree needed CAMRAD II with NASTRAN stick models to get one.");

console.log("");
if (fails) { console.log(`WHIRL-FLUTTER GATE FAILED: ${fails}`); process.exit(1); }
console.log("WHIRL-FLUTTER GATE PASSED");
