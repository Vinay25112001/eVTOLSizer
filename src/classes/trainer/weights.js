/* =====================================================================
   TRAINER COMPONENT WEIGHTS — GASP (NASA CR-152303 Vol V) and friends
   =====================================================================
   Pounds, feet, knots and horsepower throughout, as the sources are.
   Every equation below was read from the rendered page of the report and
   compared with NASA's open-source GASP-based mass code in OpenMDAO Aviary
   (Apache-2.0). The log of that check, with page numbers, is
   eVTOL_Sizing_Research/classes/ga-trainer/VERIFIED_EQUATIONS.md.

   Three equations are printed wrongly in the report, and this file follows
   Aviary (whose tests compare against the original GASP program):
   - V.1.69, wing non-optimum material factor: printed 1 − 2.5/√(B/cos Λ),
     computed 1 + 2.5/√(B/cos Λ).
   - V.1.63, horizontal-tail load parameter: the report omits the fuselage
     length. Without it a Cessna 150 tail weighs 7.5 lb; with it, 39 lb.
   - V.1.74, fuselage: the report puts (ΔP+1)^0.2 and U_LF^0.3 in the
     denominator. Aviary's GASP-derived test (18,763 lb) is reproduced only
     with them in the numerator; the printed form gives about 8,000 lb.

   `log` in GASP is the common logarithm (Aviary: np.log10).
   ===================================================================== */

const log10 = Math.log10;

/* ── LOADS AND DESIGN SPEEDS ───────────────────────────────────────────
   GASP V.1.30-V.1.43 as Aviary implements them (design_load.py), for the
   Part 23 categories. These are the pre-Amendment-64 FAR 23 formulas
   (23.335 design speeds, 23.337 manoeuvring, 23.341 gust), which is what
   GASP and the validation aircraft were built to. */
export const MANOEUVRE_LIMIT = { normal: 3.8, utility: 4.4, acrobatic: 6.0 };
const VC_COEF = { normal: 33.0, utility: 33.0, acrobatic: 36.0 };
const VC_SLOPE = { normal: 0.055, utility: 0.055, acrobatic: 0.0925 };
const VD_COEF = { normal: 1.4, utility: 1.5, acrobatic: 1.55 };
const VD_SLOPE = { normal: 0.000625, utility: 0.001875, acrobatic: 0.0025 };
/* Aviary pins the gust density ratio at 0.682 for these categories whenever
   the cruise altitude is at or below 22,500 ft (its computed value there is
   0.608, then bounded below by 0.682). */
const GUST_DENSITY_RATIO = 0.682;
const RHO_SL_SLUG = 0.0023769;

/* Helmbold lift-curve slope, per radian (Aviary design_load.py). */
export function liftCurveSlope(AR, sweepQuarterRad = 0, mach = 0) {
  const c = Math.cos(sweepQuarterRad);
  return Math.PI * AR / (1 + Math.sqrt(1 + (AR / (2 * c)) ** 2 * (1 - (mach * c) ** 2)));
}

export function designLoads({ category = "normal", wingLoading, maxStructSpeedKt, meanChordFt, AR }) {
  const cat = MANOEUVRE_LIMIT[category] ? category : null;
  if (!cat) throw new Error(`Unknown certification category "${category}"`);
  const over20 = wingLoading > 20;
  const vcCoef = VC_COEF[cat] - (over20 ? VC_SLOPE[cat] * (wingLoading - 20) : 0);
  const vcMin = Math.min(vcCoef * Math.sqrt(wingLoading), 0.9 * maxStructSpeedKt);
  const vdCoef = VD_COEF[cat] - (over20 ? VD_SLOPE[cat] * (wingLoading - 20) : 0);
  const vdMin = Math.max(vdCoef * vcMin, maxStructSpeedKt);
  const a = liftCurveSlope(AR);
  const mu = 2 * wingLoading / (GUST_DENSITY_RATIO * RHO_SL_SLUG * meanChordFt * a * 32.2);
  const kg = 0.88 * mu / (5.3 + mu);
  const nGustCruise = 1 + kg * 50 * vcMin * a / (498 * wingLoading);
  const nGustDive = 1 + kg * 25 * vdMin * a / (498 * wingLoading);
  const nGust = Math.max(nGustCruise, nGustDive);
  const nManoeuvre = MANOEUVRE_LIMIT[cat];
  const ultimate = 1.5 * Math.max(nManoeuvre, nGust);
  return { vcKt: vcMin, vdKt: vdMin, nManoeuvre, nGust, ultimate,
           governing: nGust > nManoeuvre ? "gust" : "manoeuvre", liftCurveSlope: a };
}

/* Dynamic pressure at 1.15 × VD, lb/ft² (Aviary control.py: (1.15 VD)²/391). */
export const diveDynamicPressure = (vdKt) => (1.15 * vdKt) ** 2 / 391;

/* ── WING (V.1.67-72) ──────────────────────────────────────────────────
   Implicit in the wing weight (F_OO uses W_G − 0.8 W_W), solved by
   fixed-point iteration; it contracts strongly (exponent 0.757 on a term
   the wing is a small part of). High-lift devices are not modelled here
   (GASP computes them in subroutine FLAPS, not documented in Vol V), so
   `highLiftLb` is an input. */
export function wingWeight({ grossLb, ultimate, spanFt, taper, tcRoot, cosHalfChordSweep = 1,
                             strutFraction = 0, gearOnWing = false, skWW = 133.4,
                             enginePositionFactor = 1.0, highLiftLb = 0 }) {
  /* V.1.69 is printed as 1 − 2.5/√(B/cos). Aviary (fixed.py) computes
     1 + 2.5/√(B/cos), which its GASP-derived test requires (material factor
     1.2213 for a 117.8 ft wing) and which brings the 737-200 wing of
     Fig V.1.14 within about 2% of GASP's own prediction; the printed sign
     under-predicts it by 40%. Third misprint in Vol V. */
  const skNO = 1 + 2.5 / Math.sqrt(spanFt / cosHalfChordSweep);
  const skSTR = 1 - strutFraction ** 2;
  const skGEAR = gearOnWing ? 1.0 : 0.95;
  const shape = 1e-5 * skWW * skNO * enginePositionFactor * skGEAR * spanFt ** 1.049
              * (1 + taper) ** 0.4 / (tcRoot ** 0.4 * cosHalfChordSweep ** 1.535);
  /* W_W1 is the whole wing including high-lift devices, as in Aviary's
     implicit solve (its residual compares the total, flaps included, with
     the equation). Excluding the flaps from W_W1 is 1% heavy on Aviary's
     GASP-derived test case. */
  let w = 0.1 * grossLb, iters = 0;
  for (; iters < 100; iters++) {
    const next = shape * (skSTR * ultimate * (grossLb - 0.8 * w)) ** 0.757 + highLiftLb;
    if (Math.abs(next - w) < 1e-9) { w = next; break; }
    w = next;
  }
  return { wingLb: w, wingBoxLb: w - highLiftLb, highLiftLb, iterations: iters, skNO };
}

/* ── TAILS (V.1.60-66, V.1.63 corrected) ───────────────────────────── */
export const tailRootChord = (areaFt2, spanFt, taper) => 2 * areaFt2 / (spanFt * (1 + taper));

function horizontalLoad({ grossLb, skY, fuselageLengthFt, spanHT, taperHT, skTL = 1 }) {
  return 1e-6 * grossLb * skY * fuselageLengthFt * spanHT * skTL * (1 + 2 * taperHT) / (1 + taperHT);
}

export function tailWeights({ grossLb, vdKt, fuselageLengthFt, wingSpanFt,
                              ht, vt, skY, skZ, skTL = 1, htOnVtFraction = 0 }) {
  const FH = horizontalLoad({ grossLb, skY, fuselageLengthFt, spanHT: ht.span, taperHT: ht.taper, skTL });
  const crH = tailRootChord(ht.area, ht.span, ht.taper);
  const kH = FH * ht.area * log10(vdKt) / (100 * ht.arm * ht.tc * crH);
  const FV = 0.5e-6 * grossLb * skZ * (fuselageLengthFt + wingSpanFt) * vt.span
           * (1 + 2 * vt.taper) / (1 + vt.taper);
  const crV = tailRootChord(vt.area, vt.span, vt.taper);
  const kV = (FV + htOnVtFraction * FH / 2) * vt.area * log10(vdKt) / (100 * vt.arm * vt.tc * crV);
  return { horizontalLb: 350 * kH ** 0.54, verticalLb: 380 * kV ** 0.54 };
}

/* ── FUSELAGE (V.1.73-74, V.1.74 corrected) ────────────────────────── */
export function fuselageWeight({ contentsLb, wettedFt2, widthFt, lengthFt, vdKt,
                                 pressureDiffPsi = 0, ultimate, skB = 136, pylonFt = 0 }) {
  const k = (1e-4 * contentsLb) ** 0.7 * (1e-3 * wettedFt2) * widthFt
          * (lengthFt + pylonFt) ** 0.5 * log10(vdKt)
          * (pressureDiffPsi + 1) ** 0.2 * ultimate ** 0.3;
  return skB * k ** 0.508;
}

/* FLOPS (NASA/TM-2017-219627) Eq 61 and Eq 57, PDF-checked in session 1:
   wetted area of a fuselage from length and average diameter. */
export function fuselageWettedArea({ lengthFt, widthFt, depthFt }) {
  const dav = (widthFt + depthFt) / 2;
  return Math.PI * (lengthFt / dav - 1.7) * dav ** 2;
}

/* FLOPS Eq 60, the general-aviation fuselage, as a second opinion only. */
export function fuselageWeightFLOPS({ wettedFt2, ultimate, grossLb, cruiseQ }) {
  return 0.052 * wettedFt2 ** 1.086 * (ultimate * grossLb) ** 0.177 * cruiseQ ** 0.241;
}

/* ── LANDING GEAR (V.1.57) ─────────────────────────────────────────── */
export const landingGearWeight = ({ grossLb, skLG }) => skLG * grossLb;

/* ── FLIGHT CONTROLS (V.1.76-79) ───────────────────────────────────────
   W_SCX is the TOTAL flight-controls group; the cockpit controls are a part
   of it (V-1.41: "The difference between these two weights is considered the
   fixed wing surface control portion"). */
export function flightControlsWeight({ wingAreaFt2, grossLb, ultimate, vdKt, skFW, skCC }) {
  const total = skFW * wingAreaFt2 ** 0.317 * (1e-3 * grossLb) ** 0.602
              * ultimate ** 0.525 * diveDynamicPressure(vdKt) ** 0.345;
  const cockpit = skCC * (1e-3 * grossLb) ** 0.41;
  return { totalLb: total, cockpitLb: cockpit, surfaceLb: total - cockpit };
}

/* ── FUEL SYSTEM (V.1.80; Aviary fuel.py) ──────────────────────────── */
export const fuelSystemWeight = ({ fuelLb, fuelDensityLbGal, skFS, marginPct = 0 }) =>
  (6.687 / fuelDensityLbGal) * skFS * fuelLb * (1 + marginPct / 100);

/* ── PROPULSION ────────────────────────────────────────────────────────
   Piston engine, V.1.3-V.1.4: W = SW_SLS × HP, SW_SLS = 1.5 lb/hp for a
   naturally aspirated engine. Engine section structure, V.1.56:
   W_PES = SK_PES × W_EP, "SK_PES is input as .338, typically".
   Propeller: Hamilton Standard generalized GA propeller weight, NASA
   CR-114289 (1971) Table V, p.58 (GASP V.1.8 has the same structure but
   does not print its constants). */
export const pistonEngineWeight = ({ hp, specificLbHp = 1.5 }) => specificLbHp * hp;

export const PROPELLER_CLASS = {
  fixed:          { kw: 170, note: "All fixed-pitch props" },
  constantSpeed:  { kw: 180, note: "McCauley non-counterweighted, non-feathering, constant speed" },
};

export function propellerWeight({ diameterFt, blades, activityFactor, rpm, shp, mach, kind = "fixed" }) {
  const c = PROPELLER_CLASS[kind];
  if (!c) throw new Error(`Unknown propeller kind "${kind}"`);
  return c.kw * ((diameterFt / 10) ** 2 * (blades / 4) ** 0.7 * (activityFactor / 100) ** 0.75
         * (rpm * diameterFt / 20000) ** 0.5 * (shp / (10 * diameterFt ** 2)) ** 0.12 * (mach + 1) ** 0.5);
}

/* ── FIXED EQUIPMENT ───────────────────────────────────────────────────
   GASP's own equipment routine (WFIXEU, 1980) is not documented in
   CR-152303. These are the general-aviation branches of Aviary's
   GASP-based equipment code (non-smooth path; Aviary's smooth furnishings
   path has a defect, see VERIFIED_EQUATIONS.md). For one to twelve
   passengers. */
export const TRAINER_MAX_GROSS_LB = 10000;   // the furnishings branch used here stops at 10,000 lb

export function fixedEquipment({ grossLb, pax, fuselageLengthFt, wingSpanFt, fuselageWidthFt = 0, fixedGear,
                                 controlsLb, gearLb, cwInstruments, cwHydControls, cwHydGear,
                                 cwAirCond = 1.0, pressureDiffPsi = 0, engines = 1 }) {
  if (pax > 12) throw new Error("The trainer equipment branches cover up to 12 passengers");
  const electrical = 0.03217 * grossLb - 20.0;
  let avionics = 27.0;
  if (grossLb >= 3000) avionics = 65.0;
  if (grossLb >= 5500) avionics = 113.0;
  if (grossLb >= 7500) avionics = 163.0;
  if (grossLb >= 11000) avionics = 340.0;
  /* Above 10,000 lb Aviary switches to an airliner furnishings model; that
     is outside this class, so the value is undefined and the sizing loop
     stops with a reason rather than sizing something else. */
  const furnishings = grossLb <= TRAINER_MAX_GROSS_LB ? 0.065 * grossLb - 59.0 : NaN;
  /* air_conditioning.py: 5 lb up to 3,500 lb, then
     CW(6)(1.5 + ΔP)(0.358 L w²)^0.5 with CW(6) default 1.0. */
  const airConditioning = grossLb <= 3500 ? 5.0
    : cwAirCond * (1.5 + pressureDiffPsi) * Math.sqrt(0.358 * fuselageLengthFt * fuselageWidthFt ** 2);
  const pilots = pax > 9 ? 2 : 1;
  const instruments = cwInstruments * grossLb ** 0.386 * engines ** 0.687 * pilots ** 0.31
                    * fuselageLengthFt ** 0.05 * wingSpanFt ** 0.696;
  const hydraulics = cwHydControls * controlsLb + (fixedGear ? 0 : cwHydGear * gearLb);
  const oxygen = pax < 9 ? (grossLb > 3000 ? 3.0 : 0.0) : 10.0;
  const parts = { electrical, avionics, furnishings, airConditioning, instruments, hydraulics, oxygen };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { ...parts, totalLb: total };
}
