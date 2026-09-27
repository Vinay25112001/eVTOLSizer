/* ═══════════════════════════════════════════════════════════════════════
   TYRE STOWAGE GATE — G7
   ═══════════════════════════════════════════════════════════════════════
   The T&RA growth and clearance rules are closed-form and quoted verbatim
   in the corpus, so the gate is transcription: every formula is recomputed
   here by hand, in separate arithmetic, on a tyre read off the printed page
   (16x4.4 4-ply, Goodyear 2018 p. 9; 20x4.4R12, p. 11), and the module
   must agree to rounding. Then the properties the rules imply: the envelope
   exceeds the tyre, the radial clearance is below the bias one on the same
   grown envelope (the page's own note), the clearance rises with speed,
   every one of the 294 rows resolves with a bias/radial rule matching its
   table, and on the sized aircraft the bay follows the selected tyre and the
   wheel count, and refuses with the selector's own reason when there is no
   tyre. The bay LENGTH is asserted unevaluated, because the oleo length is
   not computed anywhere in this tool.

   MUTANTS, ten, every one caught by a named check: width growth 1.4; G_H
   sign flipped; the bias C_R without its 0.4; a radial grown a second time;
   the radial C_W floor dropped; R_x built on the width; the (45) divisor
   halved; the speed exponent 3.0; the leg's bay width ignoring the wheel
   count; the radial C_R on D_G instead of D_G - D.

   THE TABLE BEHIND IT. tools/extract-tyres.py now emits aspect, rimWidthIn,
   rimDiaIn and radial, corroborates every trailing column POSITIONALLY
   against the PDF, and refuses on definitional invariants (aspect identity
   |(D_O - D)/2W - AR| <= 0.10 against an innocent 0.047 and a defect of
   0.8; SLR over the OD radius >= 0.65 against an innocent floor of 0.74 and
   a defect of 0.49). Four column-mapping mutants on the extractor, four
   refused; the first, any-value-on-the-row check let all four through.

   Run: node validation/stowage.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as E from "../src/classes/aircraft/engine.js";
import { gearOf } from "../src/classes/aircraft/gear.js";
import { TYRES } from "../src/data/tyres.js";
import { grownEnvelope, clearances, radiiOfGyration, stowageOf } from "../src/engine/gear/stowage.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
console.log(bar); console.log("TYRE STOWAGE GATE — G7"); console.log(bar);

/* ── 1. TRANSCRIPTION, on a row read off the printed page ────────────── */
console.log("\n1. Bias rule on 16x4.4 4-ply (p. 9): W 4.45, D 8, D_O 16, AR 0.901, 210 mph");
const t164 = TYRES.find((t) => t.size === "16x4.4" && t.ply === 4 && t.speedMph === 210);
check(t164 && t164.widthMaxIn === 4.45 && t164.rimDiaIn === 8 && t164.odMaxIn === 16 && t164.aspect === 0.901 && !t164.radial,
  "the table row carries the page's values", t164 ? JSON.stringify([t164.widthMaxIn, t164.rimDiaIn, t164.odMaxIn, t164.aspect]) : "row missing");
{
  // by hand, in different arithmetic from the module
  const H = (16 - 8) * 0.5, GH = 1.115 - 0.075 * 0.901, WG = 4.45 * 1.04, DG = 8 + GH * H * 2;
  const CR = 0.4 + WG * (17.02 + 2.61 * Math.exp(3.348 * Math.log(2.1))) * 1e-3;
  const CW = 0.23 + 0.019 * WG;
  const env = grownEnvelope(t164), cl = clearances(env, { speedMph: 210, rimWidthIn: t164.rimWidthIn });
  check(near(env.W_G, WG) && near(env.D_G, DG) && near(env.G_H, GH),
    "(32)-(35): W_G, D_G and G_H reproduce the hand values", `W_G ${env.W_G.toFixed(4)} D_G ${env.D_G.toFixed(4)} G_H ${env.G_H.toFixed(5)}`);
  check(near(cl.C_R, CR) && near(cl.C_W, CW) && near(cl.R_x, DG / 2 + CR) && near(cl.W_x, WG / 2 + CW) && near(cl.S_x, (CR + CW) / 2),
    "(36)-(38): C_R, C_W, R_x, W_x, S_x reproduce the hand values",
    `C_R ${cl.C_R.toFixed(4)} C_W ${cl.C_W.toFixed(4)} R_x ${cl.R_x.toFixed(3)} W_x ${cl.W_x.toFixed(3)} S_x ${cl.S_x.toFixed(3)} in`);
  const k = radiiOfGyration(t164);
  check(near(k.kTyreIn, (16 + 15.5) / 5.12) && near(k.kWheelIn, 0.4 * 8),
    "(45)-(46): k_tyre 6.152 in and k_wheel 3.20 in", `k_tyre ${k.kTyreIn.toFixed(3)} k_wheel ${k.kWheelIn.toFixed(2)} in`);
}

console.log("\n2. Radial rule on 20x4.4R12 (p. 11): grown OD 20.40, grown W 4.65, D 12, A 3.50, 255 mph");
const t204 = TYRES.find((t) => t.size === "20x4.4R12");
check(t204 && t204.radial && t204.odMaxIn === 20.4 && t204.widthMaxIn === 4.65 && t204.rimDiaIn === 12 && t204.rimWidthIn === 3.5 && t204.aspect == null,
  "the radial row carries the page's values and no aspect ratio", t204 ? JSON.stringify([t204.odMaxIn, t204.widthMaxIn, t204.rimDiaIn, t204.rimWidthIn, t204.aspect]) : "row missing");
{
  const CR = 0.15 + 0.029 * Math.sqrt((20.4 - 12) * (4.65 - 3.5) * (255 / 20.4));
  const CW = Math.max(0.1, 0.0465);
  const env = grownEnvelope(t204), cl = clearances(env, { speedMph: 255, rimWidthIn: 3.5 });
  check(env.radial && env.D_G === 20.4 && env.W_G === 4.65 && env.G_H === null,
    "a radial's envelope is the table's grown values, with no growth applied again", env.basis);
  check(near(cl.C_R, CR) && near(cl.C_W, CW) && cl.C_W === 0.10,
    "(39)-(41): C_R reproduces the hand value and C_W sits on its 0.10 floor", `C_R ${cl.C_R.toFixed(4)} C_W ${cl.C_W.toFixed(3)} in`);
  const asBias = clearances({ ...env, radial: false }, { speedMph: 255 });
  check(cl.C_R < asBias.C_R && cl.C_W < asBias.C_W,
    "the page's note holds: the radial-only envelope needs less clearance than the bias rule on the same grown tyre",
    `radial C_R ${cl.C_R.toFixed(3)} vs bias ${asBias.C_R.toFixed(3)}; C_W ${cl.C_W.toFixed(3)} vs ${asBias.C_W.toFixed(3)}`);
  const k = radiiOfGyration(t204);
  check(k.kTyreIn === null && k.kTyreNote && near(k.kWheelIn, 4.8), "(45) is null for a radial, which prints no minimum OD, and says so", k.kTyreNote);
}

/* ── 3. PROPERTIES ───────────────────────────────────────────────────── */
console.log("\n3. Properties the rules imply, over the whole table");
{
  const env = grownEnvelope(t164);
  const speeds = [120, 160, 190, 210, 225, 255];
  const crs = speeds.map((s) => clearances(env, { speedMph: s }).C_R);
  check(crs.every((c, i) => i === 0 || c > crs[i - 1]), "(36): radial clearance rises with speed", speeds.map((s, i) => `${s} mph ${crs[i].toFixed(3)}`).join(", "));
  let bad = [], ruleMismatch = 0, worstGH = [Infinity, -Infinity];
  for (const t of TYRES) {
    const env = grownEnvelope(t);
    if (!env.resolved) { bad.push([t.part, env.why]); continue; }
    const cl = clearances(env, { speedMph: t.speedMph, rimWidthIn: t.rimWidthIn });
    if (!cl.resolved) { bad.push([t.part, cl.why]); continue; }
    if (!(cl.R_x > t.odMaxIn / 2 && cl.W_x > t.widthMaxIn / 2 && env.D_G >= t.odMaxIn - 1e-12 && env.W_G >= t.widthMaxIn - 1e-12)) bad.push([t.part, "envelope does not exceed the tyre"]);
    if ((cl.rule.includes("radial")) !== !!t.radial) ruleMismatch++;
    if (!t.radial) { worstGH[0] = Math.min(worstGH[0], env.G_H); worstGH[1] = Math.max(worstGH[1], env.G_H); }
  }
  check(bad.length === 0 && ruleMismatch === 0, `all ${TYRES.length} rows resolve, the envelope exceeds the tyre, and the rule follows the table`,
    bad.length ? bad.slice(0, 3).map((b) => b.join(": ")).join("; ") : `bias G_H spans ${worstGH[0].toFixed(3)}-${worstGH[1].toFixed(3)}`);
  check(worstGH[0] > 1.0 && worstGH[1] < 1.115, "the bias section-height growth factor stays between 1 and 1.115 for every printed aspect ratio", `${worstGH[0].toFixed(3)}-${worstGH[1].toFixed(3)}`);
}

/* ── 4. ON THE SIZED AIRCRAFT ────────────────────────────────────────── */
console.log("\n4. On the sized aircraft: the bay follows the selected tyre and the wheel count");
const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
for (const type of TYPES) {
  const g = gearOf(E.designAircraft({ type }));
  if (!g.resolved) { check(g.stowage === undefined || g.stowage?.main?.resolved === false, `${type}: no gear, no stowage`, g.why); continue; }
  const st = g.stowage;
  const m = g.tyres.main;
  if (!m.resolved) { check(st.main.resolved === false && st.main.why === m.why, `${type}: no main tyre -> stowage refuses with the selector's reason`, m.why); continue; }
  const own = stowageOf(m);
  check(st.main.resolved && st.main.tyre.part === m.tyre.part && near(st.main.perTyre.bayHalfHeightIn, own.perTyre.bayHalfHeightIn),
    `${type}: main stowage is built on the selected main tyre ${m.tyre.size}`,
    `bay per tyre ${(2 * st.main.perTyre.bayHalfHeightIn).toFixed(1)} x ${(2 * st.main.perTyre.bayHalfWidthIn).toFixed(1)} in, per leg ${st.main.perLeg.tyres} tyre(s) ${st.main.perLeg.bayWidthIn.toFixed(1)} in wide, ${st.main.perLeg.crossSectionM2.toFixed(3)} m2`);
  check(st.main.perLeg.tyres === g.tyres.wheelsPerAxle && near(st.main.perLeg.bayWidthIn, g.tyres.wheelsPerAxle * 2 * st.main.clearance.W_x),
    `${type}: the leg's bay width is the wheel count times the per-tyre width`, `${g.tyres.wheelsPerAxle} x ${(2 * st.main.clearance.W_x).toFixed(2)} in`);
  check(st.main.bayLength.evaluated === false && st.main.speed.basis.includes("rated"),
    `${type}: the bay length is left unevaluated and the speed basis is the tyre's rating`, st.main.bayLength.why);
  if (g.tyres.nose.resolved) check(st.nose.resolved && st.nose.tyre.part === g.tyres.nose.tyre.part, `${type}: nose stowage follows the nose tyre ${g.tyres.nose.tyre.size}`, `${(2 * st.nose.perTyre.bayHalfHeightIn).toFixed(1)} x ${(2 * st.nose.perTyre.bayHalfWidthIn).toFixed(1)} in per tyre`);
}

/* ── 5. THE ABSENCES ARE NAMED ───────────────────────────────────────── */
console.log("\n5. What is not computed is said");
{
  const src = readFileSync(new URL("../src/engine/gear/stowage.js", import.meta.url), "utf8");
  check(/25\.733\(d\)/.test(src) && /Goodyear/.test(src) && !/Bruhn|Roskam|Currey/.test(src),
    "the module cites 25.733(d) and the Goodyear data book pages, and no textbook", "");
  const st = stowageOf({ resolved: true, tyre: t164, wheelsPerAxle: 2 });
  check(st.caveats.some((c) => c.includes("strut length")) && st.caveats.some((c) => c.includes("25.729")) && st.inertia.src.includes("p. 20"),
    "bay length, retraction loads and the inertia basis are each named", `${st.caveats.length} caveats`);
  const none = stowageOf({ resolved: false, why: "nothing fits" });
  check(none.resolved === false && none.why === "nothing fits", "no tyre -> refusal carrying the selector's reason", none.why);
}

console.log(`\n${bar}\nTYRE STOWAGE GATE: ${passes} passed, ${fails} failed\n${bar}`);
process.exit(fails ? 1 : 0);
