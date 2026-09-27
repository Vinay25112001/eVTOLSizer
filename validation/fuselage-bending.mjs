/* ═══════════════════════════════════════════════════════════════════════
   FUSELAGE BENDING MATERIAL GATE — Phase E / F3
   ═══════════════════════════════════════════════════════════════════════
   F3 is a chain: F1's moment into F2's shell into (A.87). Each link has
   its own gate; this one checks the JOINTS and the algebra of (A.84)-
   (A.100), and it does so by identity wherever an identity exists:

     - (A.87) fed F1's SMEARED moment must equal (A.89)-(A.92) in closed
       form at every station, to rounding - same model, two derivations;
     - (A.96), the closed-form back volume, must equal Simpson on (A.89)
       to rounding - it is a quadratic, Simpson is exact on quadratics,
       so a wrong /3 or /2 in the transcription cannot hide;
     - where material is added, the stress with it must equal sigma_bend
       EXACTLY - that is what "sized to the allowable" means;
     - where none is added, the shell-only stress must be at or below it;
     - the chain refuses without dp, using F2's own reason, and refuses
       without a load factor, using F1's.

   And the two things F3 exposes are asserted as findings, not hidden:
   the peak moment stands OUTSIDE the wing box on the transport, and the
   stationed volume is NOT the smeared one and is not compared to it.

   The harness dp is 59,300 Pa, the same round number fuselage-pressure.mjs
   uses, and for the same reason: it exercises the code and is not a
   sourced value for any aeroplane.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as E from "../src/classes/aircraft/engine.js";
import { fuselageLoads } from "../src/classes/aircraft/fuselage-structure-loads.js";
import { fuselagePressureShell } from "../src/classes/aircraft/fuselage-pressure-shell.js";
import { fuselageBendingMaterial, addedInertiaM4, tasoptA89 } from "../src/classes/aircraft/fuselage-bending-material.js";
import { G0 } from "../src/engine/constants.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
console.log(bar); console.log("FUSELAGE BENDING MATERIAL GATE — F3"); console.log(bar);

const DP = 59300;
const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const SIZED = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const M = Object.fromEntries(TYPES.map((t) => [t, fuselageBendingMaterial(SIZED[t], { deltaPPa: DP })]));
const WITH = TYPES.filter((t) => M[t]?.evaluated);
const EXACT = 1e-12;

/* ── 1. THE CHAIN REFUSES FOR THE RIGHT REASONS ─────────────────────── */
console.log("\n1. The chain refuses honestly, with the upstream module's own reason");
check(WITH.length === 3 && !WITH.includes("trainer"), "the three Part 25 classes evaluate; the trainer does not", WITH.join(", "));
{
  const tr = M.trainer, f1 = fuselageLoads(SIZED.trainer);
  check(tr.evaluated === false && tr.why === f1.reason, "trainer: refused with F1's reason (no load factor)", tr.why.slice(0, 80) + "…");
  for (const t of WITH) {
    /* A module that THROWS without dp has not refused - it has crashed the
       caller. The mutant that removed the refusal did exactly that, and it
       took the whole gate down with it rather than failing this check. So
       the call is guarded, and an exception is a failure here, with the
       message as the detail. */
    let noDp;
    try { noDp = fuselageBendingMaterial(SIZED[t]); }
    catch (e) { noDp = { evaluated: undefined, why: undefined, threw: e.message }; }
    const f2 = fuselagePressureShell(SIZED[t]);
    if (noDp.threw) { check(false, `${t}: refused without dp, carrying F2's reason, with no material fields`, `THREW: ${noDp.threw}`); continue; }
    /* crash-safe: a mutant that lets the chain EVALUATE without dp leaves
       `why` undefined, and this check must FAIL then, not throw */
    check(noDp.evaluated === false && (noDp.why ?? "").includes(f2.why) && noDp.scenarios === undefined,
      `${t}: refused without dp, carrying F2's reason, with no material fields`,
      noDp.why ? noDp.why.slice(0, 80) + "…" : `EVALUATED WITHOUT dp: ${noDp.scenarios?.length ?? "?"} scenario(s)`);
  }
  const src = readFileSync("src/classes/aircraft/fuselage-bending-material.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(!/deltaPPa\s*(\?\?|\|\|)\s*\d/.test(src) && !/sigmaBendPa\)\s*\?\?\s*\d/.test(src),
    "no dp or allowable is defaulted to a literal in the module's code", "source scan, comments excluded");
}

/* ── 2. (A.87) ON THE SMEARED MOMENT EQUALS (A.89)-(A.92) EXACTLY ──── */
console.log("\n2. The stationed formula on the smeared moment reproduces the closed form to rounding");
for (const t of WITH) {
  const m = M[t], f1 = fuselageLoads(SIZED[t], { deltaPPa: DP });
  const sc = m.scenarios.find((s) => s.id === m.governing), f1sc = f1.scenarios.find((s) => s.id === sc.id);
  const G = f1.geometry;
  let worst = 0, n = 0;
  for (const s of sc.stations) {
    if (s.x < G.xWing || s.x > G.shellAftX) continue;
    const c = tasoptA89({ x: s.x, nFactor: sc.nFactor, distributedWeightN: f1sc.smearedBasis.distributedWeightN,
      lShell: G.lShell, xShell2: G.shellAftX, tailWeightN: G.tailMassKg * G0, tailAeroN: sc.tailAeroN, xTail: G.xTail,
      hM: m.input.hM, sigmaMhPa: m.input.sigmaMhPa, iShellM4: m.input.iShellM4, rE: m.input.rE }).A;
    const d = Math.abs(s.aHbendSmearedM2 - c) / Math.max(Math.abs(c), 1e-15);
    if (c > 1e-12) { worst = Math.max(worst, d); n++; }
    else if (s.aHbendSmearedM2 !== 0) { worst = Math.max(worst, 1); n++; }
  }
  check((n === 0 || worst < EXACT), `${t}: A_hbend(smeared M) = closed form at every rear station`,
    n ? `${n} stations with material, worst relative ${worst.toExponential(2)}` : "no material anywhere on this class — nothing to compare, and both routes agree on zero");
  check(Math.abs(sc.volume.smearedBackM3 - sc.volume.closedBackM3) <= EXACT * Math.max(sc.volume.closedBackM3, 1e-9),
    `${t}: Simpson on (A.89) equals (A.96) in closed form`,
    `${(sc.volume.smearedBackM3 * 1e3).toFixed(6)} L against ${(sc.volume.closedBackM3 * 1e3).toFixed(6)} L`);
}

/* ── 3. SIZED TO THE ALLOWABLE MEANS EQUAL TO IT ─────────────────────── */
console.log("\n3. Where material is added the stress equals sigma_bend exactly; where not, the shell is within it");
for (const t of WITH) {
  const m = M[t], sc = m.scenarios.find((s) => s.id === m.governing);
  const added = sc.stations.filter((s) => s.iHbendM4 > 0), bare = sc.stations.filter((s) => s.iHbendM4 === 0);
  const worstAdded = added.reduce((w, s) => Math.max(w, Math.abs(s.sigmaWithAddedPa - m.input.sigmaBendPa)), 0);
  check(added.length === 0 || worstAdded < 1e-6 * m.input.sigmaBendPa,
    `${t}: every station with added material sits exactly at sigma_bend`,
    added.length ? `${added.length} stations, worst |Δσ| ${worstAdded.toExponential(2)} Pa` : "no station needs material");
  check(bare.every((s) => s.sigmaShellOnlyPa <= m.input.sigmaBendPa * (1 + 1e-12)),
    `${t}: every station without added material is within the allowable on the shell alone`,
    `${bare.length} bare stations, worst ${(Math.max(...bare.map((s) => s.sigmaShellOnlyPa)) / 1e6).toFixed(1)} MPa of ${(m.input.sigmaBendPa / 1e6).toFixed(0)}`);
  check(sc.needed === (added.length > 0) && (sc.needed ? sc.peak !== null : sc.peak === null),
    `${t}: "needed" and "peak" agree with the stations`, `needed ${sc.needed}, peak ${sc.peak ? sc.peak.xM.toFixed(2) + " m" : "null"}`);
  for (const s of sc.stations) {
    const I = addedInertiaM4({ momentNm: s.momentNm, hM: m.input.hM, sigmaMhPa: m.input.sigmaMhPa, iShellM4: m.input.iShellM4, rE: m.input.rE });
    if (Math.abs(I - s.iHbendM4) > 1e-15 * Math.max(I, 1)) { check(false, `${t}: (A.87) recomputed differs at x = ${s.x}`, ""); break; }
  }
}

/* ── 4. THE PRESSURE TERM EATS THE ALLOWABLE, (A.88) ─────────────────── */
console.log("\n4. (A.88): sigma_Mh = sigma_bend − pressure axial, and pressure moves the material");
for (const t of WITH) {
  const m = M[t], f2 = fuselagePressureShell(SIZED[t], { deltaPPa: DP });
  check(Math.abs(m.input.sigmaMhPa - (m.input.sigmaBendPa - m.input.rE * f2.stress.sigmaXPa)) < EXACT * m.input.sigmaBendPa
        && m.input.pressureAxialPa === m.input.rE * f2.stress.sigmaXPa && m.input.iShellM4 === f2.skin.iShellM4,
    `${t}: sigma_Mh is the allowable less F2's own axial pressure stress; I_hshell is F2's`,
    `${(m.input.sigmaBendPa / 1e6).toFixed(0)} − ${(m.input.pressureAxialPa / 1e6).toFixed(1)} = ${(m.input.sigmaMhPa / 1e6).toFixed(1)} MPa`);
}
{
  const t = "transport", a = M[t], hi = fuselageBendingMaterial(SIZED[t], { deltaPPa: 3 * DP });
  const ga = a.scenarios.find((s) => s.id === a.governing), gh = hi.scenarios.find((s) => s.id === hi.governing);
  check(hi.input.sigmaMhPa < a.input.sigmaMhPa && gh.massKg > ga.massKg,
    "tripling dp lowers sigma_Mh and demands more bending material", `${ga.massKg.toFixed(2)} → ${gh.massKg.toFixed(2)} kg`);
  const low = fuselageBendingMaterial(SIZED[t], { deltaPPa: DP, sigmaBendPa: 150e6 });
  const gl = low.scenarios.find((s) => s.id === low.governing);
  check(gl.massKg > ga.massKg && low.input.sigmaBendBasis.startsWith("supplied"),
    "a lower supplied allowable demands more material, and the basis says it was supplied", `${ga.massKg.toFixed(2)} → ${gl.massKg.toFixed(2)} kg`);
  const impossible = fuselageBendingMaterial(SIZED[t], { deltaPPa: DP, sigmaBendPa: 10e6 });
  check(impossible.evaluated === false && /exceeds the bending/.test(impossible.why ?? ""),
    "an allowable below the pressure stress alone is refused, not sized to a negative",
    impossible.why ? impossible.why.slice(0, 80) + "…"
                   : `EVALUATED with sigma_Mh = ${(impossible.input?.sigmaMhPa / 1e6).toFixed(1)} MPa — the pressure term was ignored`);
  const withTail = fuselageBendingMaterial(SIZED[t], { deltaPPa: DP, clHMax: 0.8 });
  const gt = withTail.scenarios.find((s) => s.id === withTail.governing);
  check(gt.massKg > 5 * ga.massKg && !withTail.caveats.some((c) => /TAIL AIRLOAD IS NOT/.test(c))
        && a.caveats.some((c) => /TAIL AIRLOAD IS NOT/.test(c)),
    "F1's tail airload flows through: with CL_hmax the material grows many-fold and the caveat is withdrawn",
    `${ga.massKg.toFixed(1)} kg → ${gt.massKg.toFixed(1)} kg`);
}

/* ── 5. THE BOX DATUM IS THE SOURCE'S, AND THE ONE FINDING IS STATED ──
   The first version of this gate asserted that F1's peak stood "outside
   the wing box". That compared x_wing, a station on the MAC, with the
   box at the ROOT; TASOPT's own text puts x_wing aft of the centreline
   box on a swept wing. The check that survives is the one that could
   have caught the error: the box AXIS at the centreline must lie inside
   the centreline box on every class, the stand-off must be the sweep
   geometry exactly, and the withdrawn narrative must be gone. */
console.log("\n5. The box datum is TASOPT's, and what F3 exposes is reported as a finding");
for (const t of WITH) {
  const m = M[t], ws = fuselageLoads(SIZED[t]).geometry.wingStation;
  check(m.wingBox.known && m.wingBox.axisInsideBox === true
        && Math.abs(m.wingBox.xWboxM - 0.5 * (m.wingBox.xbM + m.wingBox.xfM)) < 1e-9,
    `${t}: the spar-box axis at the centreline lies inside, and on the midline of, the root box`,
    `x_wbox ${m.wingBox.xWboxM.toFixed(3)} m in [${m.wingBox.xbM.toFixed(3)}, ${m.wingBox.xfM.toFixed(3)}] m`);
  check(Math.abs(m.wingBox.peakAftOfRearSparM - (m.wingBox.xWingM - m.wingBox.xfM)) < 1e-12
        && Math.abs(m.wingBox.sweepOffsetM - ws.dxWing) < 1e-12 && Math.abs(m.wingBox.xWingM - ws.xWing) < 1e-12,
    `${t}: the stand-off and sweep offset reported are F1's own numbers`,
    `x_wing ${m.wingBox.xWingM.toFixed(3)} m stands ${m.wingBox.peakAftOfRearSparM >= 0 ? "" : "-"}${Math.abs(m.wingBox.peakAftOfRearSparM).toFixed(3)} m `
    + `${m.wingBox.peakAftOfRearSparM >= 0 ? "aft of" : "ahead of"} the root rear spar; Delta x_wing ${m.wingBox.sweepOffsetM.toFixed(3)} m`);
  check(!m.caveats.some((c) => /NOT IN THE WING BOX|B2\/B5|carries the main gear/.test(c))
        && m.caveats.some((c) => /AFT OF THE ROOT REAR SPAR ON A SWEPT WING/.test(c)),
    `${t}: the withdrawn "outside the box" narrative is gone and the source's construction is stated`,
    `${m.caveats.length} caveats`);
}
{
  const m = M.transport;
  check(m.wingBox.peakAftOfRearSparM > 1 && m.wingBox.sweepOffsetM > m.wingBox.peakAftOfRearSparM,
    "transport: on the swept wing the peak stands more than a metre aft of the root rear spar, less than the sweep offset",
    `stand-off ${m.wingBox.peakAftOfRearSparM.toFixed(3)} m, Delta x_wing ${m.wingBox.sweepOffsetM.toFixed(3)} m`);
  const sc = m.scenarios.find((s) => s.id === m.governing);
  check(sc.volume.backM3 > 0 && sc.volume.closedBackM3 > 0 && Math.abs(sc.volume.backM3 / sc.volume.closedBackM3 - 1) > 0.5,
    "transport: the stationed volume is a different model from the smeared one and is not forced to agree",
    `stationed ${(sc.volume.backM3 * 1e3).toFixed(2)} L against smeared ${(sc.volume.closedBackM3 * 1e3).toFixed(2)} L`);
}
for (const t of WITH) {
  const m = M[t], sc = m.scenarios.find((s) => s.id === m.governing);
  check(m.budget.fits && m.budget.skinPlusAddedKg < m.budget.flopsFuselageKg && m.budget.fractionOfFlops > 0.05,
    `${t}: skin + added material is lighter than FLOPS's whole fuselage`,
    `${m.budget.skinKg.toFixed(0)} + ${m.budget.addedKg.toFixed(1)} = ${m.budget.skinPlusAddedKg.toFixed(0)} kg of ${m.budget.flopsFuselageKg.toFixed(0)} (${(100 * m.budget.fractionOfFlops).toFixed(1)} %)`);
  check(Math.abs(sc.volume.totalM3 - (sc.volume.frontM3 + sc.volume.centreM3 + sc.volume.backM3)) < 1e-18
        && Math.abs(sc.massKg - m.input.rE * sc.volume.totalM3 * fuselagePressureShell(SIZED[t], { deltaPPa: DP }).material.rho) < 1e-9,
    `${t}: (A.98)-(A.99): V = front + centre + back, W = rho V`, `${(sc.volume.totalM3 * 1e3).toFixed(3)} L, ${sc.massKg.toFixed(3)} kg`);
  check(sc.volume.frontM3 >= 0 && sc.volume.centreM3 >= 0 && sc.volume.backM3 >= 0 && sc.volume.closedBackM3 >= 0,
    `${t}: no volume is negative`, "the A(x_f) ≤ 0 rule holds");
}
{
  /* (A.97), THE LINEAR BRIDGE ACROSS THE BOX, IS ZERO AT THE HARNESS dp on
     every class - the material never reaches the spars - so a mutant that
     dropped V_centre from the total SURVIVED the identity check above.
     An identity on a term that is always zero tests nothing. So a
     severity is found at which the bridge is non-zero (tail airload on,
     allowable lowered, in steps), and the identity is asserted THERE. */
  const t = "transport";
  const severities = [
    { clHMax: 0.8 }, { clHMax: 0.8, sigmaBendPa: 150e6 }, { clHMax: 0.8, sigmaBendPa: 100e6 },
    { clHMax: 1.2, sigmaBendPa: 80e6 }, { clHMax: 1.2, sigmaBendPa: 60e6 },
  ];
  let hit = null;
  for (const sev of severities) {
    const r = fuselageBendingMaterial(SIZED[t], { deltaPPa: DP, ...sev });
    const g = r.evaluated ? r.scenarios.find((s) => s.id === r.governing) : null;
    if (g && g.volume.centreM3 > 0) { hit = { sev, g }; break; }
  }
  check(hit !== null, "a severity exists at which added material spans the wing box, so (A.97) is non-zero",
    hit ? `${JSON.stringify(hit.sev)}: centre ${(hit.g.volume.centreM3 * 1e3).toFixed(3)} L` : "none of five severities reached the spars");
  if (hit) {
    const v = hit.g.volume;
    check(Math.abs(v.totalM3 - (v.frontM3 + v.centreM3 + v.backM3)) < 1e-18 && v.centreM3 > 0.01 * v.totalM3,
      "and there the total includes the bridge: V = front + centre + back with centre a real share",
      `front ${(v.frontM3 * 1e3).toFixed(3)} + centre ${(v.centreM3 * 1e3).toFixed(3)} + back ${(v.backM3 * 1e3).toFixed(3)} = ${(v.totalM3 * 1e3).toFixed(3)} L`);
  }
}

/* ── 6. PROVENANCE ───────────────────────────────────────────────────── */
console.log("\n6. Provenance");
for (const t of WITH) {
  const m = M[t];
  check(/A\.84/.test(m.sources.bending) && /A\.100/.test(m.sources.bending) && /F1/.test(m.sources.moment) && /F2/.test(m.sources.shell),
    `${t}: cites TASOPT by equation and names its two upstream modules`, m.sources.bending.slice(0, 70) + "…");
  check(m.caveats.some((c) => /ALLOWABLE IS A CHOICE/.test(c)) && m.caveats.some((c) => /VERTICAL-AXIS/.test(c)) && m.caveats.some((c) => /TRAPEZOIDAL/.test(c)),
    `${t}: the allowable choice, the unbuilt vertical axis and the quadrature are all declared`, `${m.caveats.length} caveats`);
}

console.log(`\n${bar}`); console.log(`FUSELAGE BENDING MATERIAL GATE: ${passes} passed, ${fails} failed`); console.log(bar);
process.exit(fails > 0 ? 1 : 0);
