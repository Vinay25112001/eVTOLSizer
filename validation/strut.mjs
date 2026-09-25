/* =====================================================================
   STRUT GATE — G5, and the constant nobody could source
   =====================================================================
   LANDING-GEAR.md section 5 gap 1: "eta_tyre ... The value 0.47 that
   every textbook quotes was not found in any primary I opened." The note
   offers two exits — fit it to the validation aircraft, or "integrate
   the TN 4110 static force-deflection curve to derive eta_t honestly".

   The module takes the second, and this gate's job is to prove the
   derivation rather than to admire it. There are three separate things
   to be right about and they are checked apart:

   THE INTEGRATION. A closed form that has never been integrated
   numerically is an assertion. It is checked against Simpson's rule on
   the same integrand, to a tolerance no algebra slip would survive.

   THE LIMITS. As the deflection grows the exponential offset vanishes
   and TN 4110's curve becomes a straight line through the origin, whose
   area ratio is exactly one half. eta_t must approach 0.5 and must never
   exceed it. That is analytic and cannot be argued with.

   WHERE THE TEXTBOOK NUMBER COMES FROM. The derived curve passes through
   0.47 at a deflection ratio of 0.407, which is squarely in the
   practical range. This is checked not to validate the textbook but to
   record what it actually is: one sample of a curve, quoted as though it
   were a property of tyres in general.

   WHAT THIS GATE CANNOT DO. There is no published oleo stroke in this
   corpus to check the stroke against, so the stroke is checked
   ALGEBRAICALLY — eq. (23) must collapse to eq. (24) when L = 1, which
   is two independent routes through the same energy balance — and the
   module is checked to REFUSE when the balance has no solution. It does
   not claim a validated stroke, because nothing here would validate one.
   ===================================================================== */
import { TYRES } from "../src/data/tyres.js";
import { G0 } from "../src/engine/constants.js";
import {
  tyreEfficiency, tyreEfficiencyFor, tyreDeflectionRatio, tn4110Force,
  strokeFromEnergy, reserveEnergyRatio, ETA_OLEO, TN4110_CZ,
} from "../src/engine/gear/strut.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};

console.log("STRUT GATE");
console.log("=".repeat(78));

/* ── 1. THE INTEGRATION, AGAINST AN INDEPENDENT ONE ──────────────────*/
console.log("\n1. The closed form is the integral it claims to be");
{
  /* Simpson on TN 4110's own force function, which the module also
     exports, so the two routes share nothing but the integrand. */
  const simpson = (X, cz, n = 20000) => {
    const h = X / n;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      s += w * tn4110Force(i * h, cz);
    }
    return (s * h) / 3;
  };
  let worst = 0, at = null;
  for (const X of [0.05, 0.1, 0.227, 0.3, 0.407, 0.5, 0.8, 1.5]) {
    const cz = TN4110_CZ.typeIII_VII;
    const numeric = simpson(X, cz) / (X * tn4110Force(X, cz));
    const d = Math.abs(numeric - tyreEfficiency(X, cz));
    if (d > worst) { worst = d; at = X; }
  }
  check(worst < 1e-9,
    "eta_t's closed form matches Simpson's rule on the same curve",
    `worst disagreement ${worst.toExponential(2)} at delta/w = ${at} — `
    + `eight sample ratios from 0.05 to 1.5`);
}

/* ── 2. THE LIMITS, WHICH ARE ANALYTIC ───────────────────────────────*/
console.log("\n2. The limits");
{
  const far = tyreEfficiency(500);
  check(Math.abs(far - 0.5) < 1e-3,
    "eta_t approaches exactly one half as the curve straightens",
    `${far.toFixed(6)} at delta/w = 500 — a line through the origin encloses `
    + `half its rectangle, and TN 4110's offset vanishes`);

  const samples = [0.05, 0.1, 0.2, 0.4, 0.8, 2, 10, 100];
  check(samples.every((X) => tyreEfficiency(X) < 0.5),
    "and never exceeds one half, at any deflection",
    "the curve is convex, so its area can only approach the triangle from below");

  /* BOTH limits are one half, which is not obvious and was got wrong on
     the first pass — this check was originally written as "eta_t rises
     monotonically" and failed, correctly, on clean code.

     TN 4110's curve is linear through the origin at BOTH ends. For large
     x the offset Cz becomes negligible and the slope is 2.4. For small x
     the exponential expands, 1 - exp(-0.6x/Cz) -> 0.6x/Cz, and the whole
     bracket collapses to 0.4x, giving a slope of 0.96. A straight line
     through the origin encloses exactly half its rectangle either way.
     So eta_t leaves 0.5, dips, and returns to it. */
  const tiny = tyreEfficiency(1e-6);
  check(Math.abs(tiny - 0.5) < 1e-4,
    "and approaches one half at the OTHER limit too, as the deflection vanishes",
    `${tiny.toFixed(6)} at delta/w = 1e-6 — the exponential expands to a line `
    + `of slope 0.96 through the origin, so this limit is one half as well`);

  /* Therefore it has an interior minimum, and where it is matters: it is
     what makes eta_t weakly bounded rather than free. */
  let min = { X: null, eta: Infinity };
  for (let X = 0.001; X < 2; X += 0.0005) {
    const e = tyreEfficiency(X);
    if (e < min.eta) min = { X, eta: e };
  }
  check(Math.abs(min.eta - 0.4451) < 1e-3 && Math.abs(min.X - 0.092) < 0.005,
    "so eta_t has an interior minimum, and it is shallow",
    `${min.eta.toFixed(5)} at delta/w = ${min.X.toFixed(4)} — eta_t is confined `
    + `to [0.445, 0.5] for every possible deflection, which is why the textbook's `
    + `single 0.47 is not badly wrong, only unexplained`);
}

/* ── 3. WHERE THE TEXTBOOK'S 0.47 ACTUALLY COMES FROM ────────────────*/
console.log("\n3. The number the textbooks quote");
{
  const at = tyreEfficiency(0.407);
  check(Math.abs(at - 0.47) < 5e-4,
    "the derived curve passes through 0.47 at a deflection ratio of 0.407",
    `${at.toFixed(4)} — the quoted constant is one sample of this curve, `
    + `not a property of tyres; section 5 gap 1 recorded it as NOT VERIFIED`);

  /* Every tyre in the shipped book, from its own tabulated geometry. */
  const etas = TYRES.map((t) => tyreEfficiencyFor(t)).filter((e) => e.resolved);
  const lo = Math.min(...etas.map((e) => e.eta));
  const hi = Math.max(...etas.map((e) => e.eta));
  check(etas.length > 250 && lo > 0.40 && hi < 0.50,
    "and every tyre in the data book lands in a narrow band around it",
    `${etas.length} rows, eta_t from ${lo.toFixed(4)} to ${hi.toFixed(4)} — `
    + `computed per tyre from its own deflection, with no constant quoted`);
}

/* ── 3b. A DEFECT IN THE SOURCE, RECORDED RATHER THAN SMOOTHED ───────
   Deriving eta_t per tyre means reading `slrIn`, and that field is NOT
   one the generator cross-checks: tools/extract-tyres.py verifies ply
   rating, rated load, rated inflation, maximum braking load and maximum
   bottoming load between its two independent extractions, and nothing
   else. Radii and diameters ride along unverified.

   Sweeping the whole book for physically implausible deflection found
   exactly one row, and the data book's own text is the evidence it is
   wrong rather than merely odd:

     25.5x8.0-14  16PR   ... 6.84   12.6   9.40 ...
     25.5x8.0-14  20PR   ... 6.84  10.94   9.40 ...
     25.5x8.0R14  20PR   ... 7.11  10.94  11.35 ...

   Identical column positions, so nothing is misaligned. A 16-ply tyre
   cannot have a loaded radius 1.66 in LARGER than the 20-ply version of
   itself; its siblings agree with each other and not with it. The
   implied deflection is 0.15 in where every other tyre in the book
   deflects 0.85 in or more.

   This is pinned rather than excused. The count is asserted, so a SECOND
   bad row breaks the gate instead of hiding behind the first, and the
   ground line — which reads the same field — inherits a check it did not
   have. */
{
  const ratios = TYRES.map((t) => ({ t, X: tyreDeflectionRatio(t) }))
                      .filter((r) => r.X != null);
  const odd = ratios.filter((r) => r.X < 0.10);
  check(odd.length === 1 && odd[0].t.size === "25.5x8.0-14" && odd[0].t.ply === 16,
    "exactly one data-book row carries an implausible loaded radius, and it is the known one",
    odd.length
      ? odd.map((o) => `${o.t.size} ${o.t.ply}PR: slr ${o.t.slrIn} in against `
          + `${o.t.odMaxIn} in OD, deflection `
          + `${(o.t.odMaxIn / 2 - o.t.slrIn).toFixed(3)} in, delta/w ${o.X.toFixed(4)}`).join("; ")
      : "none found — if the generator now verifies the radius columns, drop this check");

  check(ratios.filter((r) => r.X > 0.45).length === 0,
    "and none runs implausibly soft at the other end",
    `highest deflection ratio ${Math.max(...ratios.map((r) => r.X)).toFixed(4)}`);
}

/* ── 4. THE SOURCED CONSTANTS, TO THE DIGIT ──────────────────────────*/
console.log("\n4. The constants that came from documents");
{
  check(ETA_OLEO.variableOrifice === 0.75 && ETA_OLEO.fixedOrifice === 0.60,
    "the oleo efficiencies are MIL-L-8552C section 3.5.2's two floors",
    ETA_OLEO.src);
  check(TN4110_CZ.typeI === 0.02 && TN4110_CZ.typeIII_VII === 0.03,
    "and Cz is TN 4110's, for both tyre families it distinguishes",
    TN4110_CZ.src);
  check(/radial/.test(TN4110_CZ.radialNote),
    "radials are declared as inheriting the type VII value, not silently assumed",
    TN4110_CZ.radialNote);
}

/* ── 5. THE STROKE, CHECKED ALGEBRAICALLY ────────────────────────────*/
console.log("\n5. The stroke: two routes through one energy balance");
{
  const tyre = TYRES.find((t) => t.size === "H44.5x16.5-21");
  const e = tyreEfficiencyFor(tyre);
  const deltaT = e.deflectionIn * 0.0254;
  const FPS = 0.3048;

  const r = strokeFromEnergy({ V: 10 * FPS, L: 1.0, N: 2.0,
    etaS: ETA_OLEO.variableOrifice, etaT: e.eta, deltaT, g: G0 });
  check(r.resolved && Math.abs(r.strokeM - r.collapsedForm) < 1e-12,
    "eq. (23) collapses to eq. (24) exactly when the lift fraction is one",
    `${(r.strokeM * 39.3701).toFixed(2)} in both ways — the general form and `
    + `the familiar one are the same algebra, and disagreeing would mean a slip`);

  /* Energy goes as V squared, so doubling the sink speed quadruples the
     energy term. Checked on the term rather than the whole stroke,
     because the tyre term does not scale with speed. */
  const fast = strokeFromEnergy({ V: 20 * FPS, L: 1.0, N: 2.0,
    etaS: ETA_OLEO.variableOrifice, etaT: e.eta, deltaT, g: G0 });
  const term = (s, V) => s.strokeM + (e.eta / ETA_OLEO.variableOrifice) * deltaT;
  check(Math.abs(term(fast) / term(r) - 4) < 1e-9,
    "and the velocity term scales as V squared, as an energy must",
    `doubling the sink speed multiplies it by ${(term(fast) / term(r)).toFixed(6)}`);

  check(reserveEnergyRatio(10, 12) === 1.44,
    "the 25.723(b) reserve ratio is derived from the two speeds, not written in",
    "(12/10)^2 = 1.44 — changing either speed cannot leave a stale constant behind");
  /* Checked at a SECOND speed pair, because a function that returns a
     hard-coded 1.44 passes the first check and fails this one. */
  check(Math.abs(reserveEnergyRatio(6, 9) - 2.25) < 1e-12
     && Math.abs(reserveEnergyRatio(8, 8) - 1) < 1e-12,
    "and at other speed pairs, so a returned constant cannot masquerade as the formula",
    "(9/6)^2 = 2.25, and equal speeds give exactly 1");

  /* THE SCALE FACTOR IS INVISIBLE TO eta_t, because eta_t is a ratio and
     2.4 cancels top and bottom. Nothing above could catch it being
     wrong, so the force function is checked directly against eq. (23),
     the linear form, which holds once x is well clear of Cz. */
  const cz = TN4110_CZ.typeIII_VII;
  const xs = [0.6, 1.0, 1.5];
  check(xs.every((x) => Math.abs(tn4110Force(x, cz) - 2.4 * (x - cz)) < 1e-6),
    "the force function reduces to eq. (23)'s linear form once the exponential dies",
    `2.4[(d/w) - Cz] reproduced at d/w = ${xs.join(", ")} — this is the only `
    + `check that constrains the 2.4, because eta_t is a ratio and the factor `
    + `cancels out of it entirely`);

  /* AND THEY ARE NOT THE SAME EQUATION. The report gives (23) "for ease
     of calculation" and (24) "to obtain a single continuous equation
     form"; they are two fits to the same data, not an identity. The
     first version of the check above asserted agreement to 1e-6 at
     d/w = 0.2 and failed on clean code, which is how the difference got
     noticed. It is 0.3 % there, and that is worth knowing before anyone
     uses (23) near the origin. */
  const near = Math.abs(tn4110Force(0.2, cz) - 2.4 * (0.2 - cz)) / (2.4 * (0.2 - cz));
  check(near > 1e-3 && near < 1e-2,
    "but near the origin the two published forms differ, and by a knowable amount",
    `${(near * 100).toFixed(2)} % apart at d/w = 0.2 — TN 4110 restricts (23) to `
    + `d/w >= (10/3)Cz and offers (24) as the continuous form; this module uses (24)`);
}

/* ── 6. WHAT IT REFUSES ──────────────────────────────────────────────*/
console.log("\n6. Refusals");
{
  /* If eta_s N cannot exceed the unbalanced weight fraction there is no
     stroke that absorbs the energy, and the honest answer is to say so
     rather than return a negative or infinite one. */
  const bad = strokeFromEnergy({ V: 3, L: 0, N: 0.1, etaS: 0.75, etaT: 0.46,
    deltaT: 0.1, g: G0 });
  check(bad.resolved === false && /cannot absorb/.test(bad.why),
    "a strut that cannot absorb the energy is declined, not given a number",
    bad.why);

  const nog = strokeFromEnergy({ V: 3, L: 1, N: 2, etaS: 0.75, etaT: 0.46, deltaT: 0.1 });
  check(nog.resolved === false,
    "and gravity is required rather than defaulted, so no constant hides here");

  check(tyreEfficiency(0) === null && tyreEfficiency(-1) === null,
    "a non-positive deflection has no efficiency and returns null");
}

console.log("\n" + "=".repeat(78));
console.log(`${passes} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
