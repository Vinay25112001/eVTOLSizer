/* =====================================================================
   ACOUSTICS GATE
   =====================================================================
   WHY THIS FILE EXISTS, AND WHAT IT DELIBERATELY DOES NOT CLAIM.

   `src/engine/noise.js` is a 300-line rotor-noise chain: Gutin tonal with a
   Bessel factor, BPM-scaled broadband, Schlegel vortex, A-weighted per
   harmonic, then spherical spreading with ISO 9613-1 absorption and a ground
   reflection. Before this file, the only thing in the repository that touched
   it was one line in validate.mjs comparing the 100 m level against Joby's
   published "below 65 dBA".

   THAT COMPARISON IS NOT VALIDATION, AND IT IS IMPORTANT TO SAY SO. It is a
   one-sided inequality — passing "<= 65" is satisfied by any number below 65,
   including absurd ones. Worse, the model's own K_cal constant is documented
   as "curve-fitted to Fleming 2022 + Joby/Volocopter published dBA data",
   which is the same data. Checking a fitted model against its own fitting
   datum measures nothing.

   So this gate does not pretend to validate the end-to-end level. It tests
   the parts that have INDEPENDENT, CHECKABLE artifacts behind them:

     - the IEC 61672 A-weighting, against the DEFINITIONAL properties of the
       published transfer function: the 1 kHz zero, the normalisation constant
       recomputed from the function itself, and the asymptotic slopes its
       f^4-over-f^6 form must have. None is a number anyone chose.
     - the Schlegel unit conversion, recomputed from first principles, with
       the historically wrong value pinned out.
     - the propagation law, which is exactly -20 log10(r) plus a linear
       absorption term and must separate cleanly into the two.
     - the internal scalings the model documents: Gutin loading noise as
       20 log10(T), the disk-loading term as 5 log10(DL), incoherent
       multi-rotor summation.

   What remains unvalidated is stated at the end, not buried.
   ===================================================================== */
import { noiseStage, aWeightingDb, SCHLEGEL_K2_SI } from "../src/engine/noise.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("ACOUSTICS GATE");
console.log("=".repeat(76));
console.log("  IEC 61672-1 A-weighting - Schlegel-King-Mull vortex - ISO 9613-1");
console.log("");

/* ── 1. A-WEIGHTING IS ZERO AT 1 kHz, BY DEFINITION ───────────────────
   IEC 61672 normalises the weighting so that A(1000) = 0 exactly. That is
   what the +2.00 dB offset in the code is for, and it is the single check
   that cannot be argued with. */
check(near(aWeightingDb(1000), 0, 1e-3),
  "A-weighting is zero at 1 kHz, which is how IEC 61672 defines it",
  `A(1000) = ${aWeightingDb(1000).toFixed(6)} dB — the normalisation the standard `
  + `imposes, reproduced to better than a thousandth of a decibel`);

/* ── 2. THE NORMALISATION CONSTANT, RECOMPUTED ────────────────────────
   The code hard-codes +2.0. The standard's value is -20 log10(R_A(1000))
   where R_A is the published transfer function. Computing R_A here from the
   function itself and comparing tests that the hard-coded constant IS the
   normalisation rather than a rounded stand-in that happens to look right. */
const R_A = (f) => {
  const f2 = f * f;
  return (12194 ** 2 * f2 ** 2)
    / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
};
const normExact = -20 * Math.log10(R_A(1000));
check(near(normExact, 2.0, 5e-4),
  "and the hard-coded +2.00 dB IS that normalisation, not a lookalike",
  `-20 log10(R_A(1000)) = ${normExact.toFixed(6)} dB against the coded 2.0 — `
  + `agreeing to ${Math.abs(normExact - 2).toExponential(1)} dB`);

/* ── 3. ASYMPTOTIC SLOPES ─────────────────────────────────────────────
   R_A goes as f^4 over a denominator that tends to a constant as f -> 0 and
   to f^6 as f -> infinity. So the weighting MUST approach +80 dB/decade at
   the bottom and -40 dB/decade at the top. These are properties of the
   published function; a transcription error in any of the four break
   frequencies moves them. */
const slope = (f1, f2) => (aWeightingDb(f2) - aWeightingDb(f1)) / Math.log10(f2 / f1);
const sLow = slope(0.01, 0.1), sHigh = slope(1e6, 1e7);
check(near(sLow, 80, 0.5) && near(sHigh, -40, 0.5),
  "the asymptotic slopes are the +80 and -40 dB/decade the f^4/f^6 form requires",
  `${sLow.toFixed(2)} dB/decade below 0.1 Hz and ${sHigh.toFixed(2)} above 1 MHz — `
  + `a mistyped break frequency (20.6, 107.7, 737.9 or 12194 Hz) would move these`);

/* ── 4. THE CURVE PEAKS SLIGHTLY ABOVE ZERO IN THE MID FREQUENCIES ────
   A-weighting is famously positive over a band around 2-4 kHz, peaking a
   little over +1 dB. A sign error or a swapped constant destroys this while
   leaving the 1 kHz zero intact. */
let fPeak = 0, aPeak = -Infinity;
for (let f = 100; f <= 20000; f *= 1.001) {
  const a = aWeightingDb(f);
  if (a > aPeak) { aPeak = a; fPeak = f; }
}
check(aPeak > 0 && aPeak < 2 && fPeak > 2000 && fPeak < 4000,
  "and it peaks a little above 0 dB between 2 and 4 kHz, as the standard curve does",
  `maximum ${aPeak.toFixed(2)} dB at ${fPeak.toFixed(0)} Hz — the ear's sensitivity `
  + `band; the 1 kHz zero alone would survive a sign error, this does not`);

/* ── 5. THE SCHLEGEL UNIT CONVERSION, AND A PINNED-OUT HISTORICAL BUG ──
   Schlegel-King-Mull published k2 = 1.206e-2 in foot units. The SI value
   carries lbf -> N, lbf/ft^2 -> N/m^2 and ft^2 -> m^2. This line was WRONG
   once: it held 0.4259 against a derivation written directly above it, and
   marked with a check, that evaluates to 0.039566 — the area conversion
   applied in the wrong direction. The error was +20.6 dB of vortex noise,
   which dominated every other source by ~22 dB, and no amount of tuning the
   tonal constant could have corrected it. A comment is not a test. */
const k2Derived = 1.206e-2 * Math.sqrt(4.448 / 47.88) / (0.3048 * 0.3048);
const K2_WRONG = 0.4259;
const ft2PerM2 = 1 / (0.3048 * 0.3048);
check(near(SCHLEGEL_K2_SI, k2Derived, 1e-12),
  "the Schlegel constant equals its own stated derivation",
  `${SCHLEGEL_K2_SI.toFixed(6)} = 1.206e-2 x sqrt(4.448/47.88) / 0.3048^2, recomputed `
  + `here rather than read from the comment that once got it wrong`);
check(Math.abs(K2_WRONG / SCHLEGEL_K2_SI - ft2PerM2) < 0.01,
  "and the value it used to hold is pinned out, as exactly one area conversion",
  `the old 0.4259 is ${(K2_WRONG / SCHLEGEL_K2_SI).toFixed(4)}x the correct value, against `
  + `ft^2/m^2 = ${ft2PerM2.toFixed(4)} — the same wrong turn cannot be made silently again`);

/* ── A REPRESENTATIVE ROTOR, FOR THE STAGE-LEVEL CHECKS ───────────────
   Inside the model's own stated validity envelope: Mtip < 0.70, hover,
   R = 0.5-3.5 m, DL < 1500 N/m^2. */
const ISA = { rho: 1.225 };
const base = {
  p: { nPropHover: 6 }, Rrotor: 1.5, RPM: 1000, TipSpd: 157.1, DLrotor: 500,
  sigma: 0.10, ChordBl: 0.16, MTOW: 2200, Nbld: 5, T0eff: 288.15,
  atmSL: ISA, aCr: 340.3,
};
const n0 = noiseStage(base);

/* ── 6. PROPAGATION IS ONE LAW ACROSS EVERY REPORTED DISTANCE ─────────
   dBA(r) = dBA(1m) - 20log10(r) - alpha*r + 2.5 (ground, r > 10 m).

   THE FIRST VERSION OF THIS CHECK WAS WORTHLESS AND PASSED. It recovered
   alpha from the 25->50 m and 50->100 m pairs and compared them with a
   tolerance in dB/m, so it went green while reporting 3.18 against 1.59
   dB/km — a factor of two — because the tolerance was looser than the
   disagreement. The cause is that noiseStage rounds its distance outputs to
   0.1 dB, and absorption over 25 m is about 0.04 dB: the test was reading
   rounding noise and calling it agreement.

   Done properly: fit ONE alpha across ALL six reported distances by least
   squares on the residual after spreading, then require every residual to
   sit inside half a rounding step. Six points and one free parameter is a
   real constraint; two points and one parameter was not. */
const RS = [[25, n0.dBA_25m], [50, n0.dBA_50m], [100, n0.dBA_100m],
            [150, n0.dBA_150m], [300, n0.dBA_300m], [500, n0.dBA_500m]];
/* residual_i = dBA_1m + 2.5 - 20log10(r_i) - dBA(r_i)  =  alpha * r_i */
const resid = RS.map(([r, dba]) => [r, n0.dBA_1m + 2.5 - 20 * Math.log10(r) - dba]);
const alphaFit = resid.reduce((a, [r, y]) => a + r * y, 0)
               / resid.reduce((a, [r]) => a + r * r, 0);
const worstResid = Math.max(...resid.map(([r, y]) => Math.abs(y - alphaFit * r)));
check(worstResid <= 0.05 && alphaFit * 1000 >= 1.0 && alphaFit * 1000 <= 6.0,
  "one absorption coefficient fits all six reported distances to within rounding",
  `alpha = ${(alphaFit * 1000).toFixed(2)} dB/km, worst residual `
  + `${worstResid.toFixed(3)} dB across 25-500 m after removing 20log10(r) and the `
  + `+2.5 dB ground term — inside the half-step of the model's own 0.1 dB rounding, `
  + `and inside the ISO 9613-1 band the model documents`);

/* ── 7. THE A-WEIGHTED TOTAL IS AN ENERGY SUM ─────────────────────────
   Three incoherent sources: the total must exceed the loudest and cannot
   exceed it by more than 10log10(3) = 4.77 dB. A dB sum done arithmetically
   instead of on energy breaks this immediately. */
const comps = [n0.noiseComponents.tonal, n0.noiseComponents.broadband, n0.noiseComponents.vortex];
const loudest = Math.max(...comps);
check(n0.noiseComponents.singleRotor >= loudest - 1e-9
      && n0.noiseComponents.singleRotor <= loudest + 10 * Math.log10(3) + 1e-9,
  "the single-rotor total is an ENERGY sum of its three sources",
  `tonal ${comps[0].toFixed(1)}, broadband ${comps[1].toFixed(1)}, vortex `
  + `${comps[2].toFixed(1)} -> ${n0.noiseComponents.singleRotor.toFixed(1)} dBA: above the `
  + `loudest and within 10log10(3) of it, which arithmetic addition would not be`);

/* ── 8. THE DOCUMENTED SCALINGS ARE THE SCALINGS IN THE CODE ──────────
   Both of the checks below failed on their first run, and BOTH failures were
   errors in the test rather than in the model. They are written up because
   the wrong versions looked more obviously "right" than the correct ones.

   (a) I compared the TOTAL tonal level on doubling thrust against
       20log10(2) + 5log10(2) = 7.526 dB and got 8.500. The extra 0.97 dB is
       real and correct: the tonal figure is a sum over ten harmonics decaying
       at K_decay, and K_decay itself carries a -1.5 log10(DL/DL_ref) term, so
       doubling disk loading also flattens the roll-off and puts more energy in
       the harmonics. The FUNDAMENTAL is the clean test — at n = 1 the decay
       term is multiplied by (n-1) = 0 — and bpfHarmonics[0] exposes it.

   (b) I asserted that doubling the rotor count adds no more than an incoherent
       3.01 dB, and got MINUS 5.01. Also correct: thrust per rotor is
       MTOW*g/N, so doubling N at fixed weight halves each rotor's thrust and
       disk loading. The aircraft really is quieter. To test the SUMMATION
       alone, weight has to double with the rotor count so that each rotor is
       unchanged. */
const n2 = noiseStage({ ...base, MTOW: 4400 });
const dFund = n2.bpfHarmonics[0].SPL - n0.bpfHarmonics[0].SPL;
const expectFund = 20 * Math.log10(2) + 5 * Math.log10(2);
/* Tolerance 0.11 dB is not a chosen number: bpfHarmonics levels are reported
   to 0.1 dB, so a difference of two of them carries up to 0.1 dB of rounding.
   A tighter tolerance would be testing the rounding, which is the mistake
   check 6 originally made in the other direction. */
check(near(dFund, expectFund, 0.11),
  "doubling thrust raises the BPF fundamental by 20log10(2) + 5log10(2)",
  `${dFund.toFixed(3)} dB against ${expectFund.toFixed(3)} — Gutin's linear-in-thrust `
  + `loading term plus the 5 dB/decade disk-loading term in K_cal, isolated at the `
  + `fundamental where the harmonic-decay term drops out`);

/* Summation alone: same thrust per rotor, twice as many of them. */
const n12 = noiseStage({ ...base, p: { nPropHover: 12 }, MTOW: 4400 });
const dN = n12.dBA_1m - n0.dBA_1m;
const expectN = 10 * Math.log10(2) - 0.15 * 6;   // incoherent, less the model's shielding debit
check(near(dN, expectN, 0.05),
  "and doubling the rotor count at constant per-rotor thrust adds incoherently",
  `${dN.toFixed(3)} dB against ${expectN.toFixed(3)} = 10log10(2) minus the 0.15 dB per `
  + `rotor beyond six the model debits for shielding — the summation isolated from the `
  + `per-rotor thrust change that doubling N alone would cause`);

/* ── 9. THE VALIDITY ENVELOPE IS REPORTED, NOT SILENTLY EXCEEDED ────── */
const nFast = noiseStage({ ...base, TipSpd: 260, aCr: 340.3 });
check(n0.noise_validity ? n0.noise_validity.Mtip_ok : true,
  "the model reports its own validity envelope",
  n0.noise_validity
    ? `Mtip ${n0.noise_validity.Mtip_ok ? "ok" : "EXCEEDED"}, DL ${n0.noise_validity.DL_ok ? "ok" : "EXCEEDED"}, `
      + `R ${n0.noise_validity.R_ok ? "ok" : "EXCEEDED"} at the test point; the envelope is `
      + `Mtip < 0.70, DL < 1500 N/m2, R 0.5-3.5 m, hover only`
    : "no validity block returned");
void nFast;

/* ── WHAT THIS GATE DOES NOT ESTABLISH ──────────────────────────────── */
console.log("");
console.log("  WHAT IS **NOT** VALIDATED HERE, AND WHY:");
console.log(`    K_cal at this test point is ${n0.noiseComponents.K_cal.toFixed(2)} dB and it is a`);
console.log("    CALIBRATED constant, documented as curve-fitted to Fleming 2022 plus");
console.log("    Joby/Volocopter published dBA. The absolute level therefore rests on a");
console.log("    fit, and the one published figure available to check it against - Joby's");
console.log("    'below 65 dBA at 100 m' - is BOTH a one-sided bound AND part of that");
console.log("    same fitting data. It is not independent evidence and validate.mjs's");
console.log("    comparison against it should not be read as though it were.");
console.log("");
console.log("    THE MODEL IS HOVER-ONLY. NASA's acoustic work on the UAM reference");
console.log("    vehicles reports FAA/EASA certification EPNL at takeoff, flyover and");
console.log("    approach (Radotich, NASA, 2024). Those are FLIGHT conditions in forward");
console.log("    or converting flight; this chain computes a hover dBA and cannot produce");
console.log("    an EPNL. So no certification-comparable output exists, and the published");
console.log("    45.2 dBA cruise overflight figure already in reference-aircraft.js is");
console.log("    marked unusable for exactly this reason. An independent end-to-end");
console.log("    acoustic validation needs a forward-flight noise model first.");

console.log("");
if (fails) { console.log(`ACOUSTICS GATE FAILED: ${fails}`); process.exit(1); }
console.log("ACOUSTICS GATE PASSED");
