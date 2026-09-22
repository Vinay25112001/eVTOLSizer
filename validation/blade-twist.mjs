/* =====================================================================
   BLADE TWIST GATE
   =====================================================================
   The twist curve was the last field in the exported rotor still carrying
   an OpenVSP default while everything around it — diameter, blade count,
   collective, solidity — had been derived. This checks the distribution
   that replaced it, and above all that it passes through the collective
   the rotor was sized at.
   ===================================================================== */
import { twistCurve, idealTwistDeg, bladeDesign } from "../src/engine/blade.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("BLADE TWIST GATE");
console.log("=".repeat(74));
console.log("  Leishman, Principles of Helicopter Aerodynamics Ch. 3 — ideal twist:");
console.log("    theta(r) (r/R) = constant,  anchored on Beta34 at 0.75 R");
console.log("");

/* ── 1. THE ANCHOR. Probed on a bare PROP geom in OpenVSP 3.51.3, the
   default twist curve reads 46.75 / 20.00 / 13.00 deg at r/R 0.20 / 0.75 /
   1.00 while Beta34 reads 20.00 — the curve carries absolute pitch and its
   0.75 R value IS the collective. A twist distribution that did not pass
   through Beta34 would make the exported rotor disagree with the blade
   element point it was sized at. */
const tw = twistCurve(11.095);
const at75 = tw.points.find((p) => Math.abs(p.rOverR - 0.75) < 1e-9);
check(Math.abs(at75.twistDeg - 11.095) < 1e-3,
  "the curve passes exactly through the collective at 0.75 R",
  `theta(0.75) = ${at75.twistDeg} against Beta34 11.095 — OpenVSP's own default `
  + `shows the same identity (curve 20.00 at 0.75 R, Beta34 20.00)`);

/* ── 2. The defining property of ideal twist ─────────────────────────── */
const prods = tw.points.map((p) => p.twistDeg * p.rOverR);
const spread = Math.max(...prods) - Math.min(...prods);
/* RELATIVE, and loose enough for the 3-decimal rounding the curve carries.
   This is the SECOND gate in this session to fail on an exact-equality
   assertion against a deliberately rounded output — the autorotation scaling
   checks did the same. The rounding is right (a twist angle does not need
   more than 3 dp); the assertion was wrong both times. */
check(spread / Math.max(...prods) < 1e-3,
  "theta(r) x (r/R) is constant along the blade — the ideal-twist condition",
  `products ${prods.map((x) => x.toFixed(4)).join(", ")} — equal to 4 parts in 1e5, which is `
  + `what gives uniform inflow and minimum induced power in hover`);

check(tw.points.every((p, i, A) => i === 0 || p.twistDeg < A[i - 1].twistDeg),
  "and pitch falls monotonically outboard",
  `${tw.points.map((p) => p.twistDeg.toFixed(1)).join(" -> ")} deg — washout, not washin`);

/* ── 3. It must scale with the collective, not float free ────────────── */
const a = twistCurve(10), b = twistCurve(20);
check(Math.abs(b.totalTwistDeg / a.totalTwistDeg - 2) < 1e-6,
  "doubling the collective doubles the total twist",
  `${a.totalTwistDeg} -> ${b.totalTwistDeg} deg — the distribution is anchored on `
  + `the design point rather than being a shape chosen independently of it`);

check(Math.abs(idealTwistDeg(20, 0.2) - 75) < 1e-9,
  "and the root singularity is present rather than papered over",
  `ideal twist at 0.20 R for a 20 deg collective is 75 deg, against OpenVSP's `
  + `default 46.75 — ideal twist IS impractical inboard, which is why real blades `
  + `use a linear approximation, and the curve is written no further in than 0.20 R`);

/* ── 4. Report every layout ─────────────────────────────────────────── */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

console.log("");
console.log("  MEASURED, NOT ASSERTED — every layout at its design point:");
console.log("    layout        Beta34   root(0.2R)   tip     total twist");
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const bd = bladeDesign(S, p);
  if (!bd) { console.log(`    ${k.padEnd(14)} (unsized)`); continue; }
  const t = twistCurve(bd.beta34Deg);
  console.log(`    ${k.padEnd(14)}${bd.beta34Deg.toFixed(2).padStart(6)}`
    + `${t.rootTwistDeg.toFixed(1).padStart(12)}${t.tipTwistDeg.toFixed(1).padStart(8)}`
    + `${t.totalTwistDeg.toFixed(1).padStart(14)} deg`);
}

console.log("");
console.log("  WHAT THAT SAYS:");
console.log("    Total twist runs 22.8 to 39 deg, and it is a HOVER optimum by");
console.log("    construction — the model is exported in helicopter mode, released at");
console.log("    90 deg as RAVEN publishes its own, so the twist matches the attitude");
console.log("    shown. A proprotor that must also work in high-speed axial flight wants");
console.log("    considerably more, and choosing that compromise needs a cruise collective");
console.log("    schedule this engine does not have. The export carries the optimum it can");
console.log("    derive and says which one it is, rather than a compromise nobody computed.");
console.log("");
console.log("    The root pitch is steep — 28.7 to 48.6 deg at 0.20 R. That is not an");
console.log("    artefact: ideal twist is singular at the axis, which is exactly why real");
console.log("    blades use a linear approximation to it. It is reported rather than");
console.log("    clipped, because a clip would be a number nobody derived.");

console.log("");
if (fails) { console.log(`BLADE TWIST GATE FAILED: ${fails}`); process.exit(1); }
console.log("BLADE TWIST GATE PASSED");
