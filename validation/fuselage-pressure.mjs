/* ═══════════════════════════════════════════════════════════════════════
   FUSELAGE PRESSURE SHELL GATE — Phase E / F2
   ═══════════════════════════════════════════════════════════════════════
   WHAT THIS GATE IS FOR

   F2 is four short equations and one input nobody can source. The risk
   is not arithmetic; it is that the input gets defaulted, the allowable
   gets chosen quietly, or the 1.33 gets written a second time. So the
   checks are about PROVENANCE and IDENTITY, not tolerance:

     - dp absent → reported not evaluated, never zero, never guessed;
     - the source's algebra holds EXACTLY (t·sigma = dp·R; hoop = 2 axial
       with no stringers, 2(1+f) with them; everything linear in dp);
     - the skin mass recomputed here from (A.11), (A.18)-(A.22) matches
       the module's to floating point — different code, same equations;
     - the skin is LIGHTER than FLOPS's whole fuselage, an independent
       method that knows nothing of dp;
     - the 1.33 is READ from fuselage-structure.js, and this module's
       source text contains no such literal;
     - a change of material or of dp MOVES the answer.

   THE HARNESS'S OWN dp. 59,300 Pa (about 8.6 psi) is this file's test
   input. It is NOT a sourced value for any aeroplane and is not asserted
   to be one; it is a round number in the right decade, chosen so the
   checks below exercise the code. Nothing in src/ carries it.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as E from "../src/classes/aircraft/engine.js";
import { fuselageStructure } from "../src/classes/aircraft/fuselage-structure.js";
import { MATERIALS, MIN_GAUGE_BY_CLASS } from "../src/classes/aircraft/wing-structure.js";
import {
  fuselagePressureShell, noseCapAreaM2, bulkheadAreaM2, skinVolumeM3,
} from "../src/classes/aircraft/fuselage-pressure-shell.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
console.log(bar);
console.log("FUSELAGE PRESSURE SHELL GATE — F2");
console.log(bar);

const DP = 59300;                                  // the harness's input, see header
const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const SIZED = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const P = Object.fromEntries(TYPES.map((t) => [t, fuselagePressureShell(SIZED[t], { deltaPPa: DP })]));
const WITH = TYPES.filter((t) => P[t]?.applies && P[t].evaluated);

/* ── 1. dp IS AN INPUT, AND ITS ABSENCE IS REPORTED, NOT FILLED ─────── */
console.log("\n1. dp is a direct input with no default, and absence is said out loud");
for (const t of TYPES) {
  const p0 = fuselagePressureShell(SIZED[t]);
  if (!p0.applies) {
    check(p0.evaluated === false && p0.why === fuselageStructure(SIZED[t]).pressure.why,
      `${t}: unpressurized, declines with the shell module's OWN reason`, p0.why.slice(0, 90) + "…");
  } else {
    /* The detail string must not be able to throw, or a mutant that makes
       the module EVALUATE without dp crashes the gate instead of failing
       this check - which is exactly what the first version did. */
    check(p0.evaluated === false && /NOT defaulted/.test(p0.why ?? "") && /deltaPPa/.test(p0.why ?? "")
          && p0.skin === undefined && p0.cases === undefined,
      `${t}: without dp the sizing is NOT EVALUATED and carries no thickness at all`,
      p0.why ? p0.why.slice(0, 96) + "…"
             : `EVALUATED WITHOUT dp: t_skin ${p0.skin ? (p0.skin.tSkinM * 1e3).toFixed(3) + " mm" : "?"}`);
  }
}
check(WITH.length === 3 && !WITH.includes("trainer"),
  "exactly the three Part 25 classes are sized; the trainer is not",
  `sized: ${WITH.join(", ")}`);
{
  const src = readFileSync("src/classes/aircraft/fuselage-pressure-shell.js", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(!/deltaPPa\s*(\?\?|\|\|)\s*\d/.test(code) && !/deltaPPa\)\s*\?\?\s*\d/.test(code),
    "the module's code never falls back from a missing dp to a number",
    "no `deltaPPa ?? <literal>` or `|| <literal>` in the source");
  check(!/\b1\.33\b/.test(code) && !/\b1\.67\b/.test(code),
    "the 25.365(d) factor is not written in this module — it is read from fuselage-structure.js",
    "no literal 1.33 or 1.67 in the code (comments excluded)");
}
for (const t of WITH) {
  check(P[t].burstFactor === fuselageStructure(SIZED[t]).pressure.burstFactor,
    `${t}: the burst factor used equals the one the shell module declares`,
    `burstFactor ${P[t].burstFactor}`);
}

/* ── 2. THE SOURCE'S ALGEBRA HOLDS EXACTLY ──────────────────────────── */
console.log("\n2. TASOPT (A.14)-(A.16) hold to floating point");
const EXACT = 1e-12;
for (const t of WITH) {
  const p = P[t], R = p.geometry.radiusM;
  for (const c of p.cases) {
    const lhs = c.tSkinM * c.allowablePa, rhs = c.dpPa * R;
    check(Math.abs(lhs - rhs) < EXACT * rhs,
      `${t}: ${c.id} — t_skin · sigma_allow = dp · R, (A.16)`,
      `${(c.tSkinM * 1e3).toFixed(4)} mm × ${(c.allowablePa / 1e6).toFixed(0)} MPa against `
      + `${(c.dpPa / 1e3).toFixed(1)} kPa × ${R.toFixed(3)} m`);
  }
  check(Math.abs(p.stress.hoopOverAxial - 2) < EXACT,
    `${t}: hoop is EXACTLY twice axial with stringers uncredited, (A.14)/(A.15)`,
    `ratio ${p.stress.hoopOverAxial.toFixed(15)}`);
  const f = 0.35, ps = fuselagePressureShell(SIZED[t], { deltaPPa: DP, stringerFraction: f });
  check(Math.abs(ps.stress.hoopOverAxial - 2 * (1 + f)) < EXACT && ps.input.stringersCredited,
    `${t}: with f_string the ratio is exactly 2(1 + f_string), (A.7) into (A.14)`,
    `ratio ${ps.stress.hoopOverAxial.toFixed(12)} against ${2 * (1 + f)}`);
  check(Math.abs(ps.skin.iShellM4 / p.skin.iShellM4 - (1 + f)) < EXACT
        && Math.abs(ps.skin.tSkinM - p.skin.tSkinM) < EXACT,
    `${t}: stringers scale I_hshell by (1 + f_string) and leave t_skin alone, (A.13)`,
    `I ratio ${(ps.skin.iShellM4 / p.skin.iShellM4).toFixed(12)}`);
  const p2 = fuselagePressureShell(SIZED[t], { deltaPPa: 2 * DP });
  check(Math.abs(p2.skin.tPressureM / p.skin.tPressureM - 2) < EXACT
        && Math.abs(p2.stress.sigmaThetaPa / p.stress.sigmaThetaPa - 2) < EXACT,
    `${t}: doubling dp doubles the pressure thickness and the hoop stress, exactly`,
    `t ratio ${(p2.skin.tPressureM / p.skin.tPressureM).toFixed(12)}`);
}

/* ── 3. THE SKIN MASS, RECOMPUTED HERE FROM THE EQUATIONS ───────────── */
console.log("\n3. Skin mass recomputed from (A.11), (A.18)-(A.22), (A.28) matches the module");
for (const t of WITH) {
  const p = P[t], g = p.geometry, R = g.radiusM, tS = p.skin.tSkinM;
  const cyl = 2 * Math.PI * R * tS * g.shellLengthM;
  const nose = 2 * Math.PI * R * R * (1 / 3 + (2 / 3) * (g.noseLengthM / R) ** 1.6) ** 0.625 * tS;
  const bulk = 2 * Math.PI * R * R * tS;
  const mass = p.material.rho * (cyl + nose + bulk);
  check(Math.abs(mass - p.skinMass.builtKg) < 1e-9 * mass,
    `${t}: skin mass from the equations equals the module's`,
    `${mass.toFixed(3)} kg (cyl ${cyl.toFixed(4)}, nose ${nose.toFixed(4)}, bulk ${bulk.toFixed(4)} m³ × ρ)`);
  /* the helpers must agree with the same arithmetic, and the nose cap must be
     larger than a flat disc and smaller than a hemisphere of the same radius —
     the two bounds Cantrell's approximation has to respect */
  const disc = Math.PI * R * R, hemi = 2 * Math.PI * R * R;
  const cap = noseCapAreaM2(R, g.noseLengthM);
  check(cap > disc && (g.noseLengthM <= R ? cap <= hemi + 1e-9 : cap > hemi),
    `${t}: the Cantrell nose cap lies between a disc and a hemisphere when l_nose ≤ R, above it otherwise`,
    `cap ${cap.toFixed(3)} m², disc ${disc.toFixed(3)}, hemisphere ${hemi.toFixed(3)}, l_nose/R ${(g.noseLengthM / R).toFixed(2)}`);
  check(Math.abs(bulkheadAreaM2(R) - hemi) < 1e-12 && Math.abs(skinVolumeM3({ R, lShell: g.shellLengthM, lNose: g.noseLengthM, tSkin: tS }).total - (cyl + nose + bulk)) < 1e-12,
    `${t}: the exported helpers are the same equations`, "bulkhead = hemisphere; volume = cyl + nose + bulk");
}

/* ── 4. LIGHTER THAN THE WHOLE FUSELAGE — the independent method ─────── */
console.log("\n4. The skin is lighter than FLOPS's fuselage, and the implied ratio is reported");
for (const t of WITH) {
  const cc = P[t].crossCheck;
  check(cc.available && cc.skinIsLighter && cc.skinFraction > 0.05 && cc.skinFraction < 0.6,
    `${t}: W_skin < W_fuselage(FLOPS Eq 56), and is a material fraction of it`,
    `skin ${cc.skinMassKg.toFixed(0)} kg of ${cc.fuselageItemKg.toFixed(0)} kg (${(100 * cc.skinFraction).toFixed(1)} %); `
    + `implied (1+f_string+f_frame+f_fadd) = ${cc.impliedStructureToSkin.toFixed(2)}`);
  check(Math.abs(cc.impliedStructureToSkin * cc.skinMassKg - cc.fuselageItemKg) < 1e-9 * cc.fuselageItemKg,
    `${t}: the implied ratio is literally FLOPS / skin, not a tuned number`, "identity holds");
}

/* ── 5. WHAT GOVERNS, AND WHY ────────────────────────────────────────── */
console.log("\n5. Gauge governs at this dp, is said to, and comes from the wing box's one home");
for (const t of WITH) {
  const p = P[t], gauge = MIN_GAUGE_BY_CLASS[t];
  check(p.skin.tPressureM < gauge.thicknessM && p.governing === "gauge" && /GAUGE governs/.test(p.governingNote)
        && p.skin.tSkinM === gauge.thicknessM && p.minGauge.thicknessM === gauge.thicknessM,
    `${t}: pressure asks for less than the class gauge, so gauge governs and the note says so`,
    `pressure ${(p.skin.tPressureM * 1e3).toFixed(3)} mm, gauge ${(gauge.thicknessM * 1e3).toFixed(2)} mm — ${gauge.note}`);
  check(p.skinMass.gaugePenaltyKg > 0
        && Math.abs(p.skinMass.builtKg - p.skinMass.pressureOnlyKg - p.skinMass.gaugePenaltyKg) < 1e-9,
    `${t}: the cost of the gauge floor is reported as mass`,
    `+${p.skinMass.gaugePenaltyKg.toFixed(0)} kg over a pressure-only skin of ${p.skinMass.pressureOnlyKg.toFixed(0)} kg`);
  /* and the governing logic must be live: push dp until pressure wins */
  const big = fuselagePressureShell(SIZED[t], { deltaPPa: 12 * DP });
  check(big.governing !== "gauge" && big.skin.tSkinM > gauge.thicknessM && /Pressure governs/.test(big.governingNote),
    `${t}: at a dp large enough, pressure takes over and the note flips`,
    `at ${(12 * DP / 1e3).toFixed(0)} kPa: ${big.governing}, t ${(big.skin.tSkinM * 1e3).toFixed(2)} mm`);
  const rel = p.cases.find((c) => c.id === "relief"), burst = p.cases.find((c) => c.id === "burst");
  check(rel.allowablePa === p.material.fty && burst.allowablePa === p.material.ftu && burst.dpPa === p.burstFactor * DP,
    `${t}: relief is checked at yield, the 1.33 case at ultimate, each against the load it belongs to`,
    `Fty ${(p.material.fty / 1e6).toFixed(0)} MPa, Ftu ${(p.material.ftu / 1e6).toFixed(0)} MPa`);
}

/* ── 6. MATERIAL AND dp MOVE THE ANSWER ─────────────────────────────── */
console.log("\n6. The inputs are connected");
{
  const t = "transport", a = P[t];
  /* WHICH CASE GOVERNS DEPENDS ON THE MATERIAL, and the first version of
     this check assumed it did not. 2024-T3 has Ftu/Fty = 1.36, above the
     1.33 of 25.365(d), so the relief-valve case at YIELD asks for the
     thicker skin. Ti-6Al-4V has Ftu/Fty = 1.06, below it, so the burst
     case at ULTIMATE governs instead. The switch is the two-case logic
     being live, and it is what is pinned: the thickness must be the
     larger of the two cases, and the governing case must differ between
     the two alloys for exactly the reason above. */
  const ti = fuselagePressureShell(SIZED[t], { deltaPPa: DP, material: "Ti-6Al-4V" });
  const govOf = (p) => p.cases.reduce((x, c) => (c.tSkinM > x.tSkinM ? c : x)).id;
  const expected = (p) => (p.material.ftu / p.material.fty > p.burstFactor ? "relief" : "burst");
  check(ti.material.id === "Ti-6Al-4V" && ti.skin.tPressureM < a.skin.tPressureM
        && Math.abs(ti.skin.tPressureM - Math.max(...ti.cases.map((c) => c.tSkinM))) < 1e-15
        && govOf(a) === "relief" && govOf(ti) === "burst"
        && govOf(a) === expected(a) && govOf(ti) === expected(ti),
    "a stronger material thins the pressure skin, and the governing case switches with Ftu/Fty against 1.33",
    `2024-T3 Ftu/Fty ${(a.material.ftu / a.material.fty).toFixed(3)} → ${govOf(a)} governs; `
    + `Ti-6Al-4V ${(ti.material.ftu / ti.material.fty).toFixed(3)} → ${govOf(ti)} governs; `
    + `${(a.skin.tPressureM * 1e3).toFixed(3)} → ${(ti.skin.tPressureM * 1e3).toFixed(3)} mm`);
  const bad = fuselagePressureShell(SIZED[t], { deltaPPa: DP, material: "unobtainium" });
  check(bad.material.id === "2024-T3", "an unknown material falls back to 2024-T3, the wing box's default",
    bad.material.label);
  const zero = fuselagePressureShell(SIZED[t], { deltaPPa: 0 });
  check(zero.evaluated === false, "dp = 0 is treated as not supplied, not as a zero-thickness skin", zero.why.slice(0, 60) + "…");
}

/* ── 7. PROVENANCE ───────────────────────────────────────────────────── */
console.log("\n7. Every number names its document");
for (const t of WITH) {
  const p = P[t];
  check(/A\.16/.test(p.sources.shell) && /A\.28/.test(p.sources.shell), `${t}: TASOPT cited by equation`, p.sources.shell.slice(0, 80) + "…");
  check(/25\.365\(a\)/.test(p.sources.regulation) && /14CFR_25\.365\.txt/.test(p.sources.regulation),
    `${t}: 25.365 cited to the verbatim extract`, p.sources.regulation.slice(0, 80) + "…");
  check(/Eq 56/.test(p.sources.crossCheck), `${t}: the cross-check names FLOPS Eq 56`, p.sources.crossCheck.slice(0, 80) + "…");
  check(p.caveats.some((c) => /dp IS THE INPUT/.test(c)) && p.caveats.some((c) => /ALLOWABLE IS A CHOICE/.test(c))
        && p.caveats.some((c) => /STRINGERS ARE NOT CREDITED/.test(c)) && p.caveats.some((c) => /ELLIPSE/.test(c)),
    `${t}: the four honest limits are in the caveats a reader sees`, `${p.caveats.length} caveats`);
}
check(readFileSync("../eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt", "utf8")
        .includes("multiplied by a factor of 1.33"),
  "the regulation extract the module cites really says 1.33", "14CFR_25.365.txt paragraph (d)");

console.log(`\n${bar}`);
console.log(`FUSELAGE PRESSURE SHELL GATE: ${passes} passed, ${fails} failed`);
console.log(bar);
process.exit(fails > 0 ? 1 : 0);
