/* =====================================================================
   TRANSPORT SIZING — a jet airliner from payload, range and runways
   =====================================================================
   Two layers, as in eVTOL_Sizing_Research/classes/transport/METHODS.md §0:

   1. Matching (Loftin, NASA RP-1060 ch.3, in the SI form of Scholz's
      lecture notes ch.5; every equation read from the rendered page):
        landing   m_ML/S = k_L σ CLmax,L s_LFL,  k_L = 0.107 kg/m³   (5.5)
                  m_MTO/S = (m_ML/S)/(m_ML/m_MTO)                     (5.6)
        take-off  (T/mg)/(m/S) = k_TO/(s_TOFL σ CLmax,TO), 2.34 m³/kg (5.10)
                  k_L and k_TO are inputs, not constants: Loftin fitted them
                  to airliners, and the business-jet class carries its own
                  pair (classes/business-jet/METHODS.md §8.4). σ is the
                  density ratio of the field elevation and day the published
                  field lengths belong to, not 1.
        2nd seg.  T/mg = nE/(nE−1) (1/E + sin γ), γ from 14 CFR 25.121(b) (5.14)
        missed    same × m_ML/m_MTO, γ from 25.121(d), gear down        (5.24)
        cruise    T/mg = 1/((T_CR/T_TO) E),  T_CR/T_TO from BPR       (5.27, 5.29)
        polars    CD = CD0 + ΔCD_flap + ΔCD_gear + CL²/(πAe),
                  ΔCD_flap = 0.05 CL − 0.055 (CL ≥ 1.1), gear 0.015,
                  CL = CLmax/1.44 at V2 and CLmax/1.69 on approach   (5.19-5.21b)
      Wing loading is the landing limit (the highest allowed); thrust is the
      largest of the four requirements.

   2. Closure: FLOPS component weights (flops-weights.js) at the current
      gross weight, and mission fuel from segment fractions (Scholz Table
      5.9, jet transport) with a Breguet cruise (5.53, 5.55), plus 14 CFR
      121.639 reserves: fly to an alternate, then 45 minutes at normal cruise
      consumption. Gross weight is iterated until fuel available equals fuel
      required (the FLOPS closure, TM-2017-219627 p.8).

   Cruise lift-to-drag comes from the aircraft's own wetted area:
   CD0 = c_f,eq · S_wet/S (Scholz 5.37: c_f = 0.003), e = 0.85
   (dragMethod "equivalent-cf"), or from the FLOPS drag build-up on the
   same FLOPS geometry (dragMethod "flops", flops-aero.js), which the
   segment mission then evaluates at each Mach and height.
   ===================================================================== */

import { TRANSPORT_DEFAULTS } from "./defaults.js";
import { flopsWeights, flopsGeometry } from "./flops-weights.js";
import { makeJetISA } from "./atmosphere.js";
import { flyMission, RESERVE_POLICIES } from "./mission.js";
import { deckShape } from "./engine-deck.js";
import { takeoffThrustToWeight, takeoffFieldLength } from "./takeoff.js";
import { landingWingLoading, landingFieldLength } from "./landing.js";
import { ENGINE_LOCATIONS, engineSplit, tailAreas, aftNacelleDeltaCd, TAIL_VOLUME } from "./layout.js";
import { makeFlopsPolar, flopsComponents } from "./flops-aero.js";

const G = 9.80665, LB = 0.45359237, FT = 0.3048, NM = 1852, LBF = 4.4482216, PSF = 47.880259;
const GRAD_2ND = { 2: 0.024, 3: 0.027, 4: 0.030 };      // 14 CFR 25.121(b)(1)
const GRAD_MISSED = { 2: 0.021, 3: 0.024, 4: 0.027 };   // 14 CFR 25.121(d)
const FRACTIONS = { start: 0.99, taxi: 0.99, takeoff: 0.995, climb: 0.98, descent: 0.99, landing: 0.992 }; // Scholz Table 5.9
const isa = makeJetISA(0);
const TOL_LB = 0.5;

const flapDrag = (cl) => (cl >= 1.1 ? 0.05 * cl - 0.055 : 0);

function resolve(p) {
  const q = { ...TRANSPORT_DEFAULTS, ...(p || {}) };
  for (const [k, v] of Object.entries(TRANSPORT_DEFAULTS))
    if (typeof v === "number" && !Number.isFinite(Number(q[k])))
      throw new Error(`Transport input "${k}" must be a finite number (got ${q[k]})`);
  if (!(q.numEngines >= 2 && q.numEngines <= 4)) throw new Error("A transport here has 2 to 4 engines");
  if (!["loftin", "regulatory", "mission"].includes(q.fuelMethod)) throw new Error(`Unknown fuel method "${q.fuelMethod}"`);
  if (!RESERVE_POLICIES.includes(q.reservePolicy)) throw new Error(`Unknown reserve policy "${q.reservePolicy}"`);
  if (!ENGINE_LOCATIONS.includes(q.engineLocation)) throw new Error(`Unknown engine location "${q.engineLocation}"`);
  if (q.engineLocation === "wing+tail" && q.numEngines !== 3) throw new Error("A wing+tail layout has three engines");
  if (q.engineLocation === "fuselage-3" && q.numEngines !== 3) throw new Error("A fuselage-3 layout has three engines");
  if (!["ratio", "volume"].includes(q.tailSizing)) throw new Error(`Unknown tail sizing "${q.tailSizing}"`);
  if (!TAIL_VOLUME[q.tailCategory]) throw new Error(`Unknown tail category "${q.tailCategory}"`);
  if (typeof q.tTail !== "boolean") throw new Error("tTail must be true or false");
  if (!["equivalent-cf", "flops"].includes(q.dragMethod)) throw new Error(`Unknown drag method "${q.dragMethod}"`);
  if (!["input", "far25"].includes(q.loadFactorMethod)) throw new Error(`Unknown load factor method "${q.loadFactorMethod}"`);
  if (!["scholz", "deck"].includes(q.thrustLapseMethod)) throw new Error(`Unknown thrust lapse method "${q.thrustLapseMethod}"`);
  if (typeof q.fuelVolumeConstraint !== "boolean") throw new Error("fuelVolumeConstraint must be true or false");
  if (!["loftin", "far25"].includes(q.takeoffMethod)) throw new Error(`Unknown take-off method "${q.takeoffMethod}"`);
  if (!["cruise-altitude", "explicit", "off"].includes(q.icaRequirement)) throw new Error(`Unknown initial-cruise-altitude requirement "${q.icaRequirement}"`);
  return q;
}

/* Air density ratio σ at the field: the pressure altitude's density with an
   ISA temperature offset, over sea-level ISA. Scholz (5.5) and (5.10) carry
   σ explicitly; it was held at 1 here, which is only right for a field at
   sea level on a standard day. Every published field length states the
   altitude and day it belongs to, so both are inputs. R cancels. */
export function fieldSigma(elevationFt, deltaIsaC) {
  const atm = isa(elevationFt * FT), sl = isa(0);
  return (atm.P / (atm.T + deltaIsaC)) / (sl.P / sl.T);
}

/* Ultimate load factor. 14 CFR 25.337(b) sets the positive limit manoeuvring
   load factor as n = 2.1 + 24000/(W + 10000), W in lb, bounded to 2.5 ≤ n ≤
   3.8; the ultimate factor is 1.5 n (25.303). The limit is 2.5 — and the
   ultimate 3.75, FLOPS's default — only above about 50,000 lb, so a fixed
   3.75 understates the structure of anything lighter: a 30,800 lb business
   jet is 4.03. "input" keeps whatever the input says. */
export function ultimateLoadFactorOf(p, grossLb) {
  if (p.loadFactorMethod !== "far25") return p.ultimateLoadFactor;
  return 1.5 * Math.min(3.8, Math.max(2.5, 2.1 + 24000 / (grossLb + 10000)));
}

/* Thrust-to-weight needed to hold a required initial cruise altitude.

   Every study process in the public record sizes to this and the tool did
   not: SUGAR carries "ROC at ICA (fpm): 300" (NASA/CR-2011-216847 Table 5.3,
   p.46) and reports a thrust ICAC and a buffet ICAC (Table 6.2, p.104);
   Douglas sized engines to a 31,000 ft initial cruise altitude and Lockheed
   required a minimum of 30,000 ft; Airbus defines the maximum recommended
   altitude as the lowest of the certified, maximum-cruise-thrust, 1.3 g
   buffet and 300 fpm climb ceilings (Getting to Grips with Aircraft
   Performance pp.138, 145, 155). The tool's cruise line asks only that
   thrust equal drag, with no residual climb, which is a zero-rate ceiling.

   At the required altitude and cruise Mach, for wing loading wsKgM2:
     T/W (static) = (CD/CL + ROC/V) / lapse(M, h)
   the ROC term being the specific excess power the rule asks to be left.

   The buffet half of the check is not here. No verified public CL_buffet(M)
   correlation was found: FLOPS's BUFFET table is a candidate only once its
   reference CL and unit construct are settled, and the Airbus FCOM chart is
   an image. Rather than invent one, buffet is left to the user as an
   explicit CL limit (`buffetClLimit`, 0 = not checked) applied as
   1.3 × CL(1 g) ≤ CL_buffet, which is the form the rule takes. */
export function icaRequiredAltFt(p) {
  if (p.icaRequirement === "off") return 0;
  return p.icaRequirement === "explicit" ? p.initialCruiseAltReqFt : p.cruiseAltFt;
}

function icaThrustToWeight(p, wsKgM2, polar, swetOverS) {
  const reqFt = icaRequiredAltFt(p);
  const hM = reqFt * FT, M = p.cruiseMach;
  const atm = isa(hM);
  const q = 0.5 * 1.4 * atm.P * M ** 2;
  const cl = wsKgM2 * G / q;                       // at maximum take-off mass
  const V = M * atm.a;
  const cd = polar
    ? polar(M, cl, hM)
    : p.cfEquivalent * swetOverS + aftNacelleDeltaCd(p.engineLocation, M)
      + cl * cl / (Math.PI * p.wingAspectRatio * p.oswaldCruise);
  const rocMs = p.icaResidualRocFpm * FT / 60;
  const lapse = p.thrustLapseMethod === "deck"
    ? deckShape(M, reqFt).maxThrustRatio * p.cruiseRatingFraction
    : cruiseThrustRatio(p.bypassRatio, reqFt);
  return { tw: (cd / cl + rocMs / V) / lapse, cl, cd, lapse, V, clBuffetMargin: cl * 1.3 };
}

export function matching(p) {
  const nE = p.numEngines;
  const sigma = fieldSigma(p.fieldElevationFt, p.fieldDeltaIsaC);
  /* The landing line. Loftin's fitted line, or the wing loading that
     actually makes the required field length when 25.125 is computed
     (landing.js). The computed route removes k_L from this constraint
     entirely, which is what lets CLmax be a physical lift coefficient
     rather than half of a fitted pair. */
  const wsLanding = p.landingMethod === "far25"
    ? landingWingLoading(p, p.landingFieldLengthM)
    : p.kLanding * sigma * p.clMaxLanding * p.landingFieldLengthM;               // kg/m² at MLW
  const wsTakeoff = wsLanding / p.landingToTakeoffMass;                            // kg/m² at MTOW
  /* Take-off thrust: Loftin's statistical line, or the thrust that actually
     makes the required field length when the run is integrated under
     14 CFR 25.109(a) and 25.113(a) (takeoff.js). */
  const twTakeoff = p.takeoffMethod === "far25"
    ? takeoffThrustToWeight(p, wsTakeoff, p.takeoffFieldLengthM)
    : wsTakeoff * p.kTakeoff / (p.takeoffFieldLengthM * sigma * p.clMaxTakeoff);
  const A = p.wingAspectRatio;
  const cl2 = p.clMaxTakeoff / 1.44;
  const e2 = cl2 / (p.cd0Clean + flapDrag(cl2) + cl2 * cl2 / (Math.PI * A * p.oswaldFlaps));
  const twSecond = (nE / (nE - 1)) * (1 / e2 + GRAD_2ND[nE]);
  const clMa = p.clMaxLanding / 1.69;
  const eMa = clMa / (p.cd0Clean + flapDrag(clMa) + 0.015 + clMa * clMa / (Math.PI * A * p.oswaldFlaps));
  const twMissed = (nE / (nE - 1)) * (1 / eMa + GRAD_MISSED[nE]) * p.landingToTakeoffMass;
  return { wsLanding, wsTakeoff, twTakeoff, twSecond, twMissed, e2, eMa, cl2, clMa, sigma,
           takeoffMethod: p.takeoffMethod };
}

/* The FLOPS drag build-up for the sized geometry (FLOPS geometry of
   flops-weights.js), as a function CD(M, CL, h m), plus the aft-nacelle
   increment of the chosen engine location. Null for "equivalent-cf". */
function dragPolar(p, sized) {
  if (p.dragMethod !== "flops") return null;
  const a = sized.flopsInputs, wet = sized.w.detail.wetted;
  const refDiam = (a.fuselageWidth + a.fuselageHeight) / 2;
  const components = flopsComponents({ wingArea: a.wingArea, wingAspectRatio: a.wingAspectRatio, wingTc: a.wingTc,
    htArea: a.htArea, htAspectRatio: a.htAspectRatio, htTc: a.htTc,
    vtArea: a.vtArea, vtAspectRatio: a.vtAspectRatio, vtTc: a.vtTc, numVerticalTails: a.numVerticalTails,
    fuselageLength: a.fuselageLength, fuselageRefDiameter: refDiam,
    nacelleLength: a.nacelleLength, nacelleDiameter: a.nacelleDiameter, numEngines: a.numEngines, wetted: wet });
  const polar = makeFlopsPolar({ wingArea: a.wingArea, aspectRatio: a.wingAspectRatio, taper: a.wingTaper,
    sweepDeg: a.wingSweep, tc: a.wingTc, camber: p.wingCamber, spanEfficiency: p.spanEfficiencyFlops,
    airfoilTech: p.airfoilTech, maxMach: p.maxMach,
    fuselageCrossSection: Math.PI * refDiam * refDiam / 4, fuselageLengthToDiameter: a.fuselageLength / refDiam,
    fuselageDiameterToSpan: refDiam / a.wingSpan, components });
  const at = (hM) => { const atm = isa(hM); return [atm.P / PSF, atm.T * 1.8]; };
  const cd = (M, CL, hM) => polar.cd(M, CL, ...at(hM)) + aftNacelleDeltaCd(p.engineLocation, M);
  cd.breakdown = (M, CL, hM) => polar.evaluate(M, CL, ...at(hM));
  cd.design = polar.design;
  return cd;
}

/* Average of the start- and end-of-cruise L/D (Loftin p.152). */
function averageCruise(p, swetOverS, wsKgM2, endFraction, polar) {
  const a = cruisePolar(p, swetOverS, wsKgM2, 1, polar);
  const b = cruisePolar(p, swetOverS, wsKgM2, endFraction, polar);
  return { ...a, clEnd: b.cl, Estart: a.E, Eend: b.E, E: (a.E + b.E) / 2 };
}

function cruisePolar(p, swetOverS, wsKgM2, weightFrac = 1, polar = null) {
  const hM = p.cruiseAltFt * FT, M = p.cruiseMach;
  const atm = isa(hM);
  const q = 0.5 * 1.4 * atm.P * M ** 2;
  const cl = wsKgM2 * weightFrac * G / q;
  const V = M * atm.a;
  if (polar) {
    /* Best L/D at cruise Mach and height: CL on a 0.01 grid, then refined. */
    let clMd = 0.1, eMax = 0;
    const scan = (from, to, step) => {
      for (let c = from; c <= to + 1e-9; c += step) {
        const e = c / polar(M, c, hM);
        if (e > eMax) { eMax = e; clMd = c; }
      }
    };
    scan(0.1, 1.2, 0.01);
    scan(clMd - 0.01, clMd + 0.01, 0.0005);
    const cd = polar(M, cl, hM);
    const breakdown = polar.breakdown(M, cl, hM);
    const cd0 = breakdown.cd0 + aftNacelleDeltaCd(p.engineLocation, M);    // skin friction, form, compressibility
    return { cl, cd0, cd, E: cl / cd, eMax, clMd, V, q, dragMethod: "flops", breakdown, design: polar.design };
  }
  const cd0 = p.cfEquivalent * swetOverS + aftNacelleDeltaCd(p.engineLocation, M);
  const k = 1 / (Math.PI * p.wingAspectRatio * p.oswaldCruise);
  const cd = cd0 + k * cl * cl;
  const eMax = 0.5 / Math.sqrt(cd0 * k);
  return { cl, cd0, cd, E: cl / cd, eMax, clMd: Math.sqrt(cd0 / k), V, q, dragMethod: "equivalent-cf" };
}

/* Scholz (5.29), cruise altitude in ft. */
export const cruiseThrustRatio = (bpr, hFt) => (3.962e-7 * bpr - 1.210e-5) * hFt - 0.0248 * bpr + 0.7125;

/* Thrust available in cruise, as a fraction of sea-level static thrust.

   Two sources disagree by 25 % at the default cruise condition, and the
   sizing used to take one for the matching chart and the other for the
   mission in the same run: Scholz's correlation (5.29) gives 0.233 at
   35,000 ft for a bypass ratio of 5.1, the NASA Aviary FLOPS deck 0.186.
   Boeing's own process takes take-off, cruise and idle thrust from one
   scaled deck (NASA/CR-2011-216847 p.46, p.98, Fig 6.1), so "deck" is the
   consistent choice and the one to prefer where the deck applies; "scholz"
   is kept because the correlation carries bypass ratio explicitly and the
   deck is one engine's shape.

   The rating fraction is what a cruise rating gives against the deck's
   maximum. No public rating split was found, so it is an input and defaults
   to 1, which makes the constraint "maximum thrust available covers cruise
   drag" rather than a rated-thrust line. */
function cruiseLapse(p) {
  if (p.thrustLapseMethod === "deck")
    return deckShape(p.cruiseMach, p.cruiseAltFt).maxThrustRatio * p.cruiseRatingFraction;
  return cruiseThrustRatio(p.bypassRatio, p.cruiseAltFt);
}

/* Loftin, RP-1060 pp.152-153: Wf/Wg = 1 − exp(−(R + ΔR_reserve)/B),
   B = V (L/D)/c (Eq 3.13-3.14), no allowance for start-up, taxi or climb. */
function loftinFuelFraction(p, E, Vms) {
  const breguet = E * Vms * 3600 / p.tsfcCruise;                  // m
  const cruise = Math.exp(-((p.designRange + p.reserveIncrementNm) * NM) / breguet);
  return { Mff: cruise, cruise, nonCruise: 1, method: "loftin", breguetKm: breguet / 1000,
           rangeCredit: p.reserveIncrementNm };
}

/* The segment mission (mission.js) for an aircraft of wing area Sft2,
   thrust per engine, wetted-area ratio and weight grossLb; fuel in lb. */
function missionFuel(p, grossLb, Sft2, thrustEachLbf, swetOverS, rangeNm = p.designRange, polar = null) {
  const a = polar ? { S: Sft2 * FT * FT, cd: polar }
    : { S: Sft2 * FT * FT, cd0: p.cfEquivalent * swetOverS + aftNacelleDeltaCd(p.engineLocation, p.cruiseMach),
        k: 1 / (Math.PI * p.wingAspectRatio * p.oswaldCruise) };
  const e = { F0: thrustEachLbf * p.numEngines * LBF, tsfcCruise: p.tsfcCruise, climbThrottle: p.climbThrottle };
  const m = { rangeNm, cruiseAltFt: p.cruiseAltFt, cruiseMach: p.cruiseMach, climbCasKt: p.climbCasKt,
              descentCasKt: p.descentCasKt, taxiMin: p.taxiMin, takeoffFuelFraction: p.takeoffFuelFraction,
              reserve: p.reservePolicy, alternateNm: p.alternateNm, alternateAltFt: p.alternateAltFt,
              alternateMach: p.alternateMach };
  const r = flyMission(a, e, m, grossLb * LB * G);
  const toLb = (n) => n / G / LB;
  return { ...r, totalLb: toLb(r.total), tripLb: toLb(r.trip), reserveLb: toLb(r.reserve),
           segmentsLb: Object.fromEntries(Object.entries(r.segments).map(([k, v]) => [k, toLb(v)])) };
}

function missionFuelFraction(p, E, Vms) {
  if (p.fuelMethod === "loftin") return loftinFuelFraction(p, E, Vms);
  if (p.fuelMethod === "mission") return null;
  if (p.fuelMethod !== "regulatory") throw new Error(`Unknown fuel method "${p.fuelMethod}"`);
  /* TSFC in lb/(lbf·h) is, in SI, tsfc/(3600 g) kg/(N·s), so the range
     factor E·V/(SFC·g) of (5.53) is E·V·3600/tsfc metres. */
  const cSI = p.tsfcCruise / (3600 * G);                          // kg/(N·s)
  const breguet = E * Vms / (cSI * G);                            // m  (5.53)
  const cruise = Math.exp(-(p.designRange * NM) / breguet);       // (5.55)
  const alternate = Math.exp(-(p.alternateNm * NM) / breguet);
  const hold = Math.exp(-(p.reserveMin * 60) * cSI * G / E);      // endurance Breguet at cruise consumption
  const f = FRACTIONS;
  const trip = f.start * f.taxi * f.takeoff * f.climb * cruise * f.descent;
  const reserve = f.climb * alternate * f.descent * hold;         // missed approach, alternate, 45 min
  const Mff = trip * reserve * f.landing;
  return { Mff, trip, reserve, cruise, alternate, hold, nonCruise: Mff / cruise, method: "regulatory",
           breguetKm: breguet / 1000, rangeCredit: 0 };
}

/* The wing area whose tanks hold `fuelLb`, less any fuselage tankage.

   Wing volume is (2/3)·S²·tc·K/span with span = √(A·S), so it goes as S^1.5
   and the area needed follows in closed form. FLOPS and Aviary carry this as
   a constraint (excess fuel capacity ≥ 0), and Boeing's process sizes to a
   fuel capacity requirement; here it was only a warning, so the tool would
   report an aircraft whose tanks do not hold its own mission. */
function wingAreaForFuel(p, fuelLb) {
  const K = 1 - p.wingTaper / (1 + p.wingTaper) ** 2;
  const C = (2 / 3) * p.wingTc * K / Math.sqrt(p.wingAspectRatio)
          * 7.48052 * p.fuelDensity * p.wingFuelFraction;
  const need = Math.max(0, fuelLb - p.fuselageFuelLb);
  return need > 0 && C > 0 ? (need / C) ** (2 / 3) : 0;
}

function weightsAt(p, grossLb, match, overrides = {}) {
  const Sm2 = (grossLb * LB) / match.wsTakeoff;
  const S = Sm2 / (FT * FT);
  const span = Math.sqrt(p.wingAspectRatio * S);
  const thrustEach = overrides.thrustEach ?? match.twDesign * grossLb / p.numEngines;
  const scale = Math.sqrt(thrustEach / p.engineRefThrust);        // FLOPS Eq 70-71: nacelle ∝ √thrust
  const split = engineSplit(p.engineLocation, p.numEngines);
  const tails = p.tailSizing === "volume"
    ? tailAreas({ wingArea: S, span, taper: p.wingTaper, fuselageLength: p.fuselageLength,
                  fuselageLengthM: p.fuselageLength * FT, location: p.engineLocation,
                  category: p.tailCategory, tTail: p.tTail })
    : { htArea: p.htAreaRatio * S, vtArea: p.vtAreaRatio * S };
  const wingVol = (2 / 3) * S * S * p.wingTc * (1 - p.wingTaper / (1 + p.wingTaper) ** 2) / span;   // ft³
  const fuelCapacity = overrides.fuelCapacity
    ?? wingVol * 7.48052 * p.fuelDensity * p.wingFuelFraction + p.fuselageFuelLb;
  const a = {
    grossWeight: grossLb, maxMach: p.maxMach, designRange: p.designRange,
    landingToTakeoffRatio: p.landingToTakeoffMass, emptyMarginFraction: p.emptyMarginFraction,
    passengers: p.firstClass + p.businessClass + p.economyClass, passengersCarried: p.passengersCarried,
    firstClass: p.firstClass, businessClass: p.businessClass, economyClass: p.economyClass,
    flightCrew: p.flightCrew, flightAttendants: p.flightAttendants, galleyCrew: p.galleyCrew,
    massPerPassenger: p.massPerPassenger, baggagePerPassenger: p.baggagePerPassenger, cargo: p.cargo,
    fuelCapacity, fuelDensity: p.fuelDensity, fuelTanks: p.fuelTanks,
    fuselageLength: p.fuselageLength, fuselageWidth: p.fuselageWidth, fuselageHeight: p.fuselageHeight,
    passengerCompartmentLength: p.passengerCompartmentLength, militaryCargoFloor: false,
    htArea: tails.htArea, htAspectRatio: 5.444, htTaper: 0.3008, htTc: 0.1195, htOnVtFraction: 0,
    vtArea: tails.vtArea, vtAspectRatio: 2.2262, vtTaper: 0.2108, vtTc: 0.1375, numVerticalTails: 1,
    wingArea: S, wingAspectRatio: p.wingAspectRatio, wingSpan: span, wingSweep: p.wingSweep,
    wingTaper: p.wingTaper, wingTc: p.wingTc,
    ultimateLoadFactor: ultimateLoadFactorOf(p, grossLb), strutBracing: 0, aeroelasticTailoring: 0,
    compositeFraction: p.wingCompositeFraction, varSweep: 0, wingLoadFraction: 1, controlSurfaceAreaRatio: 0.333,
    mainGearOleoIn: p.mainGearOleoIn, noseGearOleoIn: p.noseGearOleoIn,
    nacelleDiameter: p.nacelleRefDiameter * scale, nacelleLength: p.nacelleRefLength * scale,
    paintPerArea: p.paintPerArea,
    engineRefMass: p.engineRefMass, engineRefThrust: p.engineRefThrust, engineSlsThrust: thrustEach,
    engineMassExponent: p.engineMassExponent,
    numEngines: p.numEngines, numWingEngines: split.onWing, numFuselageEngines: split.onFuselage,
    hydraulicPressure: p.hydraulicPressure,
  };
  const w = flopsWeights(a);
  return { w, S, span, thrustEach, fuelCapacity, flopsInputs: a, tails };
}

export function sizeTransport(input) {
  const p = resolve(input);
  const match = matching(p);
  const payloadLb = (p.passengersCarried ?? (p.firstClass + p.businessClass + p.economyClass)) * (p.massPerPassenger + p.baggagePerPassenger) + p.cargo;
  let gross = 3.5 * payloadLb, last = null, converged = false, stopReason = "iteration limit", iters = 0;
  const trace = [];            // gross weight and residual at every iteration
  /* Wing loading in use. The landing line is the highest allowed, so it is
     where sizing starts; the fuel-volume constraint can only lower it, which
     grows the wing. A lower wing loading also relaxes the take-off thrust
     line, which is proportional to it (Scholz 5.10). */
  let wsUsed = match.wsTakeoff, fuelGrown = false;
  for (; iters < 300; iters++) {
    /* Identical object when the wing has not been grown: scaling the take-off
       line by wsUsed/wsTakeoff is not exactly 1 in floating point, and a
       one-ulp change here walks through the whole closure. */
    const m = wsUsed === match.wsTakeoff ? match
            : { ...match, wsTakeoff: wsUsed, twTakeoff: match.twTakeoff * (wsUsed / match.wsTakeoff) };
    /* Cruise thrust depends on the wetted area, which depends on the size. */
    const probe = weightsAt(p, gross, { ...m, twDesign: Math.max(m.twTakeoff, m.twSecond, m.twMissed) });
    const swetOverS = probe.w.detail.totalWetted / probe.S;
    const endFrac = last ? last.sized.w.totals.zeroFuel / gross : 0.75;
    const cr = averageCruise(p, swetOverS, wsUsed, endFrac, dragPolar(p, probe));
    const lapse = cruiseLapse(p);
    const twCruise = 1 / (lapse * cr.Estart);
    /* Initial cruise altitude with a residual rate of climb, when asked for. */
    const ica = icaRequiredAltFt(p) > 0
      ? icaThrustToWeight(p, wsUsed, dragPolar(p, probe), swetOverS) : null;
    const twIca = ica ? ica.tw : 0;
    const twDesign = Math.max(m.twTakeoff, m.twSecond, m.twMissed, twCruise, twIca);
    const governs = [["take-off", m.twTakeoff], ["second segment", m.twSecond],
                     ["missed approach", m.twMissed], ["cruise", twCruise],
                     ["initial cruise altitude", twIca]].sort((x, y) => y[1] - x[1])[0][0];
    const sized = weightsAt(p, gross, { ...m, twDesign });
    let fuel = missionFuelFraction(p, cr.E, cr.V);
    let fuelRequired;
    if (p.fuelMethod === "mission") {
      const mis = missionFuel(p, gross, sized.S, sized.thrustEach, swetOverS, p.designRange, dragPolar(p, sized));
      fuel = { method: "mission", mission: mis, Mff: 1 - mis.totalLb / gross,
               breguetKm: cr.E * cr.V * 3600 / p.tsfcCruise / 1000 };
      fuelRequired = mis.totalLb;
    } else fuelRequired = gross * (1 - fuel.Mff);
    /* Grow the wing until its tanks hold the mission, if asked to. */
    if (p.fuelVolumeConstraint && Number.isFinite(fuelRequired) && fuelRequired > 0) {
      const sNeed = wingAreaForFuel(p, fuelRequired);
      const wsFuel = sNeed > 0 ? (gross * LB) / (sNeed * FT * FT) : Infinity;
      const wsWant = Math.min(match.wsTakeoff, wsFuel);
      if (wsWant >= match.wsTakeoff) {
        /* The constraint is slack: the landing limit is the answer, and it is
           taken exactly so that an aircraft which never needed a bigger wing
           is bit-identical to one sized without the constraint at all. */
        wsUsed = match.wsTakeoff;
      } else if (Math.abs(wsWant - wsUsed) > 1e-12 * match.wsTakeoff) {
        wsUsed += 0.5 * (wsWant - wsUsed);                    // damped, as the gross weight loop is
      }
      fuelGrown = wsUsed < match.wsTakeoff * (1 - 1e-9);
    }
    const next = sized.w.totals.zeroFuel + fuelRequired;
    last = { sized, cr, twCruise, twIca, ica, twDesign, governs, fuel, fuelRequired, lapse, swetOverS, wsUsed, fuelGrown };
    if (!Number.isFinite(next) || next > 2e6) { stopReason = "gross weight ran away (no aircraft closes these requirements)"; break; }
    trace.push({ i: iters, grossLb: gross, nextLb: next, residualLb: next - gross });
    if (Math.abs(next - gross) < TOL_LB) { gross = next; converged = true; stopReason = null; break; }
    gross += 0.5 * (next - gross);                      // damped successive substitution
  }
  const { sized, cr, twCruise, twIca, ica, twDesign, governs, fuel, fuelRequired, lapse, swetOverS, fuelGrown: grown } = last;
  const t = sized.w.totals;
  return {
    mode: "sizing", converged, stopReason, iterations: iters + 1, toleranceLb: TOL_LB,
    /* The closure history. The map is gross -> zero-fuel(gross) + fuel(gross); the
       0.5 damping halves each step, so the residual contracts geometrically and the
       ratio below is the observed contraction per iteration. */
    convergence: { trace, contraction: trace.length > 6
      ? Math.pow(Math.abs(trace[trace.length - 2].residualLb / trace[2].residualLb), 1 / (trace.length - 4))
      : NaN },
    grossLb: gross, emptyLb: t.empty, operatingEmptyLb: t.operatingEmpty, zeroFuelLb: t.zeroFuel,
    payloadLb, fuelLb: fuelRequired, fuelCapacityLb: sized.fuelCapacity,
    fuelFits: sized.fuelCapacity >= fuelRequired,
    wingAreaFt2: sized.S, spanFt: sized.span, thrustEachLbf: sized.thrustEach, tails: sized.tails,
    wingLoadingKgM2: last.wsUsed, thrustToWeight: twDesign, thrustGovernedBy: governs,
    wingGrownForFuel: !!grown,
    constraints: { ...match, wsTakeoff: last.wsUsed, twTakeoff: match.twTakeoff * last.wsUsed / match.wsTakeoff,
                   wsLandingLimit: match.wsTakeoff, twCruise, cruiseThrustRatio: lapse,
                   twIca, icaAltFt: icaRequiredAltFt(p) || null, ica },
    cruise: { ...cr, swetOverS }, fuel, weights: sized.w, inputs: p, geometryInputs: sized.flopsInputs,
  };
}

/* An existing aircraft: gross weight, wing area and thrust are given. */
export function analyzeTransport(input) {
  const p = resolve(input);
  const { grossLb, wingAreaFt2, thrustEachLbf } = p;
  for (const [k, v] of Object.entries({ grossLb, wingAreaFt2, thrustEachLbf }))
    if (!(v > 0)) throw new Error(`analyzeTransport needs ${k} > 0`);
  const match = { ...matching(p), wsTakeoff: grossLb * LB / (wingAreaFt2 * FT * FT) };
  const sized = weightsAt(p, grossLb, match, { thrustEach: thrustEachLbf, fuelCapacity: p.fuelCapacityLb });
  const swetOverS = sized.w.detail.totalWetted / sized.S;
  const polar = dragPolar(p, sized);
  const t0 = sized.w.totals;
  const cr = averageCruise(p, swetOverS, match.wsTakeoff, t0.zeroFuel / grossLb, polar);
  const t = sized.w.totals;
  if (p.fuelMethod === "mission") {
    /* Range: the stage length whose mission fuel (with reserves) equals the
       fuel on board, capped by the tanks. Bisection. */
    const avail = Math.min(grossLb - t.zeroFuel, p.fuelCapacityLb ?? Infinity);
    const need = (R) => missionFuel(p, grossLb, sized.S, thrustEachLbf, swetOverS, R, polar).totalLb;
    let lo = 0, hi = 12000, rangeNm = 0;
    if (need(0) < avail) {
      for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (need(mid) < avail) lo = mid; else hi = mid; }
      rangeNm = lo;
    }
    const mis = missionFuel(p, grossLb, sized.S, thrustEachLbf, swetOverS, rangeNm, polar);
    return { mode: "analysis", grossLb, rangeNm, emptyLb: t.empty, operatingEmptyLb: t.operatingEmpty,
             zeroFuelLb: t.zeroFuel, payloadLb: t.payload, fuelAvailableLb: avail,
             fuelRequiredLb: mis.totalLb, cruise: { ...cr, swetOverS },
             fuel: { method: "mission", mission: mis, breguetKm: cr.E * cr.V * 3600 / p.tsfcCruise / 1000 },
             weights: sized.w, inputs: p, geometryInputs: sized.flopsInputs,
             wingAreaFt2, thrustEachLbf, fuelCapacityLb: p.fuelCapacityLb };
  }
  const fuel = missionFuelFraction(p, cr.E, cr.V);
  /* Range with the fuel this aircraft actually has at this weight: the
     cruise fraction that makes the mission fraction equal ZFW/GW, less any
     range the method books as reserve. */
  const nonCruise = fuel.nonCruise;
  const cruiseNeeded = (t.zeroFuel / grossLb) / nonCruise;
  const rangeNm = cruiseNeeded < 1 ? Math.max(0, -Math.log(cruiseNeeded) * fuel.breguetKm * 1000 / NM - fuel.rangeCredit) : 0;
  return { mode: "analysis", grossLb, rangeNm, nonCruiseFraction: nonCruise, emptyLb: t.empty, operatingEmptyLb: t.operatingEmpty,
           zeroFuelLb: t.zeroFuel, payloadLb: t.payload, fuelAvailableLb: grossLb - t.zeroFuel,
           fuelRequiredLb: grossLb * (1 - fuel.Mff), cruise: { ...cr, swetOverS }, fuel,
           weights: sized.w, inputs: p, geometryInputs: sized.flopsInputs,
           wingAreaFt2, thrustEachLbf, fuelCapacityLb: p.fuelCapacityLb };
}

/* The drag polar of a sized or analysed aircraft, as CD(M, CL, h m). */
function polarOf(result) {
  const p = result.inputs;
  if (p.dragMethod === "flops") return dragPolar(p, { flopsInputs: result.geometryInputs, w: result.weights });
  const cd0 = p.cfEquivalent * result.cruise.swetOverS;
  const k = 1 / (Math.PI * p.wingAspectRatio * p.oswaldCruise);
  return (M, CL) => cd0 + aftNacelleDeltaCd(p.engineLocation, M) + k * CL * CL;
}

/* CD against CL at Mach M and height hFt, for plotting. */
export function transportPolarCurve(result, M = result.inputs.cruiseMach, hFt = result.inputs.cruiseAltFt, cls = null) {
  const cd = polarOf(result);
  const list = cls ?? Array.from({ length: 29 }, (_, i) => 0.05 * i);
  return list.map((cl) => ({ cl, cd: cd(M, cl, hFt * FT) }));
}

/* Range (nm) of a sized or analysed aircraft taking off at grossLb with
   fuelLb on board, by the same fuel method and reserves as the result.
   Used for payload-range diagrams. */
export function transportRangeAt(result, grossLb, fuelLb) {
  const p = result.inputs;
  if (!(fuelLb > 0) || !(grossLb > 0)) return 0;
  const S = result.wingAreaFt2 ?? result.inputs.wingAreaFt2;
  const thrust = result.thrustEachLbf ?? result.inputs.thrustEachLbf;
  if (p.fuelMethod === "mission") {
    const polar = p.dragMethod === "flops" ? polarOf(result) : null;
    const need = (R) => missionFuel(p, grossLb, S, thrust, result.cruise.swetOverS, R, polar).totalLb;
    if (need(0) >= fuelLb) return 0;
    let lo = 0, hi = 16000;
    for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (need(mid) < fuelLb) lo = mid; else hi = mid; }
    return lo;
  }
  const f = result.fuel;
  const cruiseNeeded = (1 - fuelLb / grossLb) / f.nonCruise;
  return cruiseNeeded < 1 ? Math.max(0, -Math.log(cruiseNeeded) * f.breguetKm * 1000 / NM - f.rangeCredit) : 0;
}

export { flopsGeometry };
