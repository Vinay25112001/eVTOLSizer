/* =====================================================================
   NASA OpenVSP MODEL REPLICATION GATE
   =====================================================================
   The .vsp3 files are PUBLISHED GEOMETRY. When the tool is asked to replicate
   one, it must reproduce that geometry — not approximately, but to the
   precision the file states it, because every number is an input the model
   fixes rather than a quantity the loop is free to choose.

   This gate proves it can, and it is the reason the replication is worth
   anything: without it "adopt the NASA models" is a claim, not a fact.

   TWO OF THESE ROWS ARE REAL TESTS, NOT ECHOES:
     - wing aspect ratio is recomputed from the span and area the engine
       PRODUCED, so it exercises the wing model;
     - blade chord is over-determined in the file (diameter, blade count AND
       solidity are all published), and the engine derives its own from the
       same relation, so agreement means the rotor model and the file agree
       about the blade rather than sharing an assumption.

   The models publish NO mass, power or mission, so gross weight is a RESULT
   here and is reported, never scored.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { VSP_MODELS, VSP_META, derived, paramsFromModel,
         wingLoadingForMTOW, minCruiseSpeedFor, compareToModel } from "../src/data/vsp-models.js";

const TOL = 1.0;                       // percent — the file is exact, so this is tight
const BASE = { payload:200, range:60, vCruise:60, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, eOsw:0.85, clCruiseMax:0.90, clDesign:0.55, twRatio:1.3,
  convTolExp:-6, etaHov:0.74, tipSpeed:167.64, etaSys:0.80, rateOfClimb:5.08, climbAngle:5,
  descentAngle:6, climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.90,
  socMin:0.19, ewf:0.50, weightModel:"buildup", autoPositionWing:true, targetSM:0.15,
  fusDiam:1.3, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const MISSION = { raven: { payload:200, range:60, M0:900 },
                  swft:  { payload:1200, range:150, M0:5000 } };

/** Close the airframe: MTOW sets W/S (to hold the published area) and the wing
    sets the minimum cruise speed, so both are iterated with the loop. */
function replicate(key) {
  const mi = MISSION[key];
  let M = mi.M0, V = BASE.vCruise, R = null, p = null;
  for (let i = 0; i < 60; i++) {
    V = Math.max(BASE.vCruise, 1.02 * minCruiseSpeedFor(key, M, BASE.clCruiseMax));
    p = { ...paramsFromModel(key, BASE), payload: mi.payload, vCruise: V,
          wingLoadingNm2: wingLoadingForMTOW(key, M),
          range: mi.range + 0.76 * V * (BASE.reserveMinutes * 60) / 1000 };
    R = runSizing(p);
    if (!R || !isFinite(R.MTOW)) return { R: null, p, M, V };
    const nM = M + 0.5 * (R.MTOW - M);
    if (Math.abs(nM - M) < 0.01) { M = nM; break; }
    M = nM;
  }
  return { R, p, M, V };
}

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("NASA OpenVSP MODEL REPLICATION GATE");

/* The BD-6 is a fixed-wing control case and must be refused as an eVTOL. */
check(paramsFromModel("bd6") === null,
  "the BD-6 donor airframe is refused as an eVTOL configuration");

/* Both eVTOL models are the same 4-tilt + 2-lift architecture. */
for (const key of ["raven", "swft"]) {
  const d = derived(VSP_MODELS[key]);
  check(d.nRotors === 6 && d.nTilting === 4 && d.nLiftOnly === 2,
    `${key}: 6 rotors read as 4 tilt + 2 lift-only from the hinge set`,
    `${d.nTilting}T + ${d.nLiftOnly}L`);
  check(d.rotorsOutboardOfTip === true,
    `${key}: rotors sit outboard of the wingtip, as modelled`,
    `rotor half-span ${d.rotorHalfSpan_m} m vs wing half-span ${(d.wingSpan_m/2).toFixed(3)} m`);
}

console.log("");
for (const key of ["raven", "swft"]) {
  const { R, M, V } = replicate(key);
  console.log(`── ${VSP_META[key].label}`);
  if (!R) { check(false, `${key}: replication converged`); continue; }
  console.log(`   gross weight ${M.toFixed(0)} kg and cruise ${V.toFixed(1)} m/s are RESULTS —`
    + ` the .vsp3 publishes no mass, power or mission`);
  const c = compareToModel(key, R);
  let worst = 0, worstKey = "";
  for (const r of c.rows) {
    const e = r.errPct;
    console.log(`     ${r.key.padEnd(19)}${String(r.published).padStart(9)}`
      + `${r.engine != null ? (+r.engine).toFixed(3).padStart(11) : "          —"}`
      + `${e != null ? (e + "%").padStart(9) : "        —"}`);
    if (e != null && Math.abs(e) > worst) { worst = Math.abs(e); worstKey = r.key; }
  }
  check(worst <= TOL, `${key}: every published geometry reproduced within ${TOL}%`,
    `worst ${worst.toFixed(1)}% on ${worstKey}`);
}

console.log("");
console.log(fails.length ? `VSP GATE FAILED: ${fails.length} check(s)` : "VSP GATE PASSED");
process.exit(fails.length ? 1 : 0);
