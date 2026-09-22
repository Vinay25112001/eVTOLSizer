/* =====================================================================
   BOOM CONSTRUCTION GATE
   =====================================================================
   WHAT THIS MEASURES AND WHY IT IS NOT A PASS/FAIL ON MASS.

   booms.js sizes a boom wall as the worst of bending stress, shell buckling
   and minimum gauge. Measured across the six layouts, WHICH criterion wins
   splits cleanly by configuration, and that split is the finding:

     liftcruise    bending stress    t_buckle / t_stress = 0.52
     hybrid        bending stress                          0.32
     hybridPusher  bending stress                          0.50
     multicopter   shell buckling                          1.62
     sideBySide    shell buckling                          1.73

   On the two ROTOR-BORNE layouts the wall carries 62% and 73% more material
   than strength requires, purely to stop a thin monolithic shell buckling.
   Nobody builds that. wingbox.js reached the identical conclusion about the
   wing skin ("Monolithic skin was measured to buckle at 0.34 MPa against a
   350 MPa cap allowable") and made sandwich its default.

   THE BOOM HAS NOT FOLLOWED, AND THIS GATE EXISTS TO KEEP THAT VISIBLE
   RATHER THAN LET IT BECOME AN UNREVIEWED DEFAULT EITHER WAY. Switching the
   default moves the benchmark away from the published data (mean 11.4% ->
   12.4%; Quad-E structures +0.4% -> -3.7%), because two of three vehicles are
   already under-predicted in structures. But the benchmark's own target is
   incomplete for precisely this component -- NASA state that their published
   weights omit the boom mounting entirely. So neither number settles it, and
   the honest thing is to measure both constructions on every layout and leave
   the choice explicit.

   The checks below therefore assert PHYSICS and CONSISTENCY, not that one
   construction beats the other.
   ===================================================================== */
import { boomStructure, BOOM_CONSTANTS as K } from "../src/engine/booms.js";
import { WINGBOX_MATERIALS } from "../src/engine/wingbox.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("BOOM CONSTRUCTION GATE");
console.log("=".repeat(76));

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

const rows = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD, etaHov:d.etaHov ?? B.etaHov };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const gg = { MTOW:S.MTOW, nRotors:d.nRotors, Thov:S.MTOW * 9.80665 };
  const mono = boomStructure({ ...p, boomConstruction:"monolithic" }, gg);
  const sand = boomStructure({ ...p, boomConstruction:"sandwich" }, gg);
  /* The DEFAULT: same params, boomConstruction left unset, so this is exactly
     what the app ships rather than a reconstruction of it. */
  const ship = boomStructure(p, gg);
  if (!mono.nBooms) continue;
  rows.push({ k, mono, sand, ship,
              rotorBorne: CFG.capabilitiesFor(k, d.nRotors).hasWing === false });
}

console.log("");
console.log("  layout         wall driver      t_buck/t_str   monolithic   sandwich   shipped");
for (const r of rows)
  console.log(`    ${r.k.padEnd(14)}${String(r.mono.wallDriver).padEnd(16)}`
    + `${(r.mono.tBuckle / r.mono.tStress).toFixed(2).padStart(9)}`
    + `${r.mono.mass.toFixed(0).padStart(14)} kg${r.sand.mass.toFixed(0).padStart(10)} kg`
    + `   ${r.ship.construction}`);
console.log("");

/* ── 1. THE SPLIT IS REAL AND IT FOLLOWS THE CONFIGURATION ──────────── */
const rb = rows.filter(r => r.rotorBorne), wb = rows.filter(r => !r.rotorBorne);
check(rb.every(r => r.mono.wallDriver === "shell buckling")
      && wb.every(r => r.mono.wallDriver === "bending stress"),
  "a monolithic boom is buckling-sized on rotor-borne layouts and strength-sized on wing-borne",
  `${rb.map(r => `${r.k} ${(r.mono.tBuckle / r.mono.tStress).toFixed(2)}`).join(", ")} against `
  + `${wb.map(r => `${r.k} ${(r.mono.tBuckle / r.mono.tStress).toFixed(2)}`).join(", ")} — the `
  + `configuration difference falls out of the statics, it is not asserted`);

/* ── 2. THE SANDWICH DOES WHAT A SANDWICH IS FOR ────────────────────── */
check(rb.every(r => r.sand.mass < r.mono.mass) && wb.every(r => r.sand.mass > r.mono.mass),
  "and the sandwich is lighter exactly where buckling governs, heavier where it does not",
  rows.map(r => `${r.k} ${r.mono.mass.toFixed(0)}->${r.sand.mass.toFixed(0)}`).join(", ")
  + " kg — a core buys nothing on a wall already sized by strength, which is why this is a "
  + "per-layout question and not a global switch");

/* ── 3. FACE WRINKLING IS THE MODE THAT NEARLY BINDS, AND IT IS SOURCED ─ */
const core = WINGBOX_MATERIALS.nomex48;
const sWrinkle = 0.5 * Math.cbrt(core.Ec * core.Gc * K.E_laminate);
check(sWrinkle > K.sigmaAllowPa && sWrinkle < 2 * K.sigmaAllowPa,
  "face wrinkling on Nomex-48 sits just above the material allowable, so the sandwich is strength-sized",
  `0.5 (E_f E_c G_c)^(1/3) = ${(sWrinkle / 1e6).toFixed(0)} MPa against the ${(K.sigmaAllowPa / 1e6).toFixed(0)} MPa `
  + `laminate allowable — HexWeb guide via wingbox.js, not a number chosen here. If the core were `
  + `weaker this would bind first and the sandwich would stop being worth building`);

/* ── 4. ONE SET OF MATERIAL PROPERTIES, NOT TWO ─────────────────────── */
check(core.rho === 48 && core.Ec === 1.38e8 && core.Gc === 2.5e7,
  "the core comes from wingbox.js's table rather than being restated here",
  `Nomex-48: rho ${core.rho} kg/m3, Ec ${(core.Ec / 1e6).toFixed(0)} MPa, Gc ${(core.Gc / 1e6).toFixed(0)} MPa `
  + `(W direction, the weaker one Hexcel's own worked example uses) — this codebase has been bitten `
  + `repeatedly by one quantity living in two places`);

/* ── 5. THE DEFAULT IS THE ONE THAT SHIPS, AND IT IS MONOLITHIC ─────── */
check(rows.every(r => r.ship.construction === "monolithic"),
  "the shipped default is monolithic, held deliberately",
  "switching it moves the benchmark mean 11.4% -> 12.4% and Quad-E structures +0.4% -> -3.7%, "
  + "against a published structures figure NASA state OMITS the boom mounting entirely. Neither "
  + "number settles it, so the choice stays explicit rather than becoming an unreviewed default");

console.log("");
console.log("  THE OPEN DECISION, STATED SO IT CANNOT BE LOST:");
console.log("    A monolithic boom on the multicopter carries 62% more material than");
console.log("    strength needs, and on the side-by-side 73%, purely to stop a thin shell");
console.log("    buckling. That is not how such a structure is built. Switching to");
console.log("    sandwich is better physics and worse agreement, because two of the three");
console.log("    benchmark vehicles are already light in structures and the third's");
console.log("    published figure is missing this very component. Resolving it needs a");
console.log("    structures datum that includes boom mounting — which is exactly what");
console.log("    NASA say they do not have.");

console.log("");
if (fails) { console.log(`BOOM CONSTRUCTION GATE FAILED: ${fails}`); process.exit(1); }
console.log("BOOM CONSTRUCTION GATE PASSED");
