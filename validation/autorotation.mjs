/* =====================================================================
   AUTOROTATION GATE
   =====================================================================
   Validates Fradenburgh's autorotative index against a helicopter whose
   place in the published population is known, then REPORTS every layout.
   The report is not a pass/fail: a low index is a finding about the
   aircraft, not a defect in the model, and the gate is careful not to
   confuse the two.
   ===================================================================== */
import { autorotativeIndex, canAutorotate, rotorInertia,
         AI_POPULATION, ROTOR_PITCH_CONTROL } from "../src/engine/autorotation.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { rotorGroup } from "../src/engine/rotorgroup.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("AUTOROTATION GATE");
console.log("=".repeat(74));
console.log("  Fradenburgh, JAHS 29(3) 1984:  AI = (I_R Omega^2 / 2) / (W DL)  [ft^3/lb]");
console.log("  Population 5-40; >30 single-engine only; <15 large helicopters");
console.log("");

/* ── 1. Reproduce a helicopter whose place in the band is stated ──────
   The reference paper uses the Bo-105 as its baseline and calls it "a
   medium weight twin-engine helicopter", excluding configurations below
   15 and above 30 as unlike it. So a correct implementation must put the
   Bo-105 between those two lines — which is a real test, because it is a
   two-sided bound the arithmetic could easily miss. */
const bo = autorotativeIndex({ bladeMassPerRotorKg: 4 * 27, R_m: 4.91,
                               tipSpeed_ms: 218, MTOW_kg: 2400, nRotors: 1 });
check(bo.AI > AI_POPULATION.largeBelow && bo.AI < AI_POPULATION.singleEngineAbove,
  "a Bo-105-class helicopter lands between the two published lines",
  `AI ${bo.AI} ft^3/lb, inside 15 < AI < 30 — the paper's own baseline is a `
  + `"medium weight twin-engine helicopter" and it excluded <15 and >30 as unlike it`);

check(bo.DL_lbft2 >= 3 && bo.DL_lbft2 <= 8,
  "and its disk loading lands in the band the same source quotes",
  `${bo.DL_lbft2} lb/ft^2 against "modern turbine-powered helicopters have a disk `
  + `loading in the range of 3 lbs/ft^2 to 8 lbs/ft^2"`);

/* ── 2. The index must respond the way its definition says ──────────── */
const base = { bladeMassPerRotorKg: 100, R_m: 5, tipSpeed_ms: 200, MTOW_kg: 2000, nRotors: 1 };
const heavier = autorotativeIndex({ ...base, MTOW_kg: 4000 });
const b0 = autorotativeIndex(base);
/* Tolerance is 2e-3, not 1e-9: AI is published to 2 decimals, so a ratio
   of rounded values cannot be exact. The first run of this gate failed on
   that alone — the model was right and the test was wrong. */
check(Math.abs(heavier.AI / b0.AI - 0.25) < 2e-3,
  "doubling gross weight quarters the index",
  `${b0.AI} -> ${heavier.AI} — W appears once directly and once through DL, so `
  + `the index falls as W^2. "As gross weight is increased, the value of the `
  + `index decreases rapidly."`);

const faster = autorotativeIndex({ ...base, tipSpeed_ms: 400 });
check(Math.abs(faster.AI / b0.AI - 4) < 2e-3,
  "doubling tip speed quadruples it",
  `${b0.AI} -> ${faster.AI} — energy goes as Omega^2, which is the whole point `
  + `of storing it in the rotor`);

check(Math.abs(rotorInertia(90, 3) - (90 * 9 / 3)) < 1e-9,
  "blade inertia is the uniform-rod result, hub excluded",
  "I = m R^2 / 3, and omitting the hub makes I_R a lower bound, so the index "
  + "errs conservative rather than flattering");

/* ── 3. The prior question: can the manoeuvre be entered at all ─────── */
check(canAutorotate("multicopter").possible === false
   && canAutorotate("liftcruise").possible === false,
  "fixed-pitch RPM-controlled layouts report that it CANNOT be entered",
  "AIAA 2018-3847: \"these are fixed-pitch hingeless rotors with RPM control\" — "
  + "no collective to drop, so no index can rescue it");

check(canAutorotate("tiltrotor").possible === null,
  "and a layout with no reference vehicle reports UNKNOWN, not false",
  "an open design decision is not the same thing as a fixed-pitch rotor, and "
  + "reporting it as one would be an invention");

/* ── 4. Report every layout. Findings, not assertions. ──────────────── */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

console.log("");
console.log("  MEASURED, NOT ASSERTED — every layout at its design point:");
console.log("    layout          N   D (m)     AI   entry        verdict");
const rows = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p), n = d.nRotors, R = p.propDiam / 2;
  const rg = rotorGroup({ ...p, solidity: S.solidityUsed },
    { nRotors:n, radius_m:R, tipSpeed_ms:p.tipSpeed, diskArea_m2:n*Math.PI*R*R,
      isTilting:false }, 2.0);
  const ai = autorotativeIndex({ bladeMassPerRotorKg:(rg.bladeKg||0)/n, R_m:R,
    tipSpeed_ms:p.tipSpeed, MTOW_kg:S.MTOW, nRotors:n });
  const ca = canAutorotate(k);
  rows.push({ k, n, D:2*R, ai, ca });
  const entry = ca.possible === false ? "NO" : ca.possible === true ? "yes" : "unknown";
  console.log(`    ${k.padEnd(14)}${String(n).padStart(2)}${(2*R).toFixed(2).padStart(8)}`
    + `${String(ai.AI).padStart(7)}   ${entry.padEnd(9)}${ai.verdict}`);
}

console.log("");
console.log("  WHAT THAT SAYS:");
console.log("    Only the side-by-side both CAN enter autorotation and carries enough");
console.log("    rotor energy to flare. The multicopter stores the most energy of any");
console.log("    layout here and cannot use a joule of it: fixed pitch. Three layouts");
console.log("    sit below EVERY helicopter in the published population, which is what");
console.log("    high disk loading does to a rotor's stored energy — the reason the");
console.log("    tiltrotor class is not credited with autorotation in service either.");
console.log("");
console.log("    NASA's own constraint shows the bind: rotor inertia is what makes");
console.log("    autorotation survivable, and it is the thing they had to LIMIT to keep");
console.log("    RPM control responsive (10 ft diameter cap). A design cannot quietly");
console.log("    have both.");

console.log("");
if (fails) { console.log(`AUTOROTATION GATE FAILED: ${fails}`); process.exit(1); }
console.log("AUTOROTATION GATE PASSED");
