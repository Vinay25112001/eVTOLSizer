/* =====================================================================
   TURBOPROP SIZING — a regional turboprop from payload, range and runways
   =====================================================================
   The jet transport's two layers (../transport/size.js), on power instead
   of thrust. eVTOL_Sizing_Research/classes/transport/METHODS.md §9.

   1. Matching, Scholz & Nita 2008 (every equation read from the rendered
      page; SI, W/kg and kg/m², all referred to take-off):
        landing   m_MTO/S = k_L σ CLmax,L s_LFL / (m_ML/m_MTO), k_L 0.137   (p.8)
        speeds    V_APP = k_APP √s_LFL, k_APP 1.64; V_S,L = V_APP/1.3;
                  V_S,TO = V_S,L √(CLmax,L/CLmax,TO); V2 = 1.2 V_S,TO     (p.7, 10-11)
        take-off  P/m = (m/S) k_TO (V2/√2) g / (s_TOFL σ CLmax,TO η_TO), k_TO 2.25 (p.9-10)
        2nd seg.  P/m = nE/(nE−1) (1/E + sin γ) V2 g / η_CL, γ from 14 CFR 25.121(b) (p.12)
        missed    P/m = nE/(nE−1) (1/E + sin γ) V_APP g / η_CL × m_ML/m_MTO, 25.121(d) (p.13)
        polars    E = CL/(CD_P + CL²/(πAe)), CD_P = 0.05 CL − 0.035 (+0.015 gear
                  on the missed approach), e 0.7, CL = CLmax,TO/1.2², CLmax,L/1.3²
        cruise    m/S = CL M² (1.4/2) p(H)/g,  P/m = M a(H) g / ((P_CR/P_TO) E η_CR),
                  E = 2 Emax/(CLmd/CL + CL/CLmd), CLmd = πAe/(2 Emax),
                  Emax = k_E √(A/(S_wet/S)), k_E 11.22, P/P0 = A M^m σ^n  (p.13-15)
      The paper gives the cruise altitude as an output ("determined from the
      design point", p.18). Here it is the altitude, up to the ceiling, at
      which cruise needs the least power; at the paper's ATR 72 wing loading
      that gives its cruise CL 0.503 and E 12.49 (validation/turboprop.mjs).
      Power is the largest of the four requirements.

   2. Closure: FLOPS airframe and systems (../transport/flops-weights.js)
      with a shaft-power propulsion group (propulsion.js), and mission fuel
      from Roskam's turboprop segment fractions (as quoted by Nita 2008
      Table 3.5) with propeller Breguet cruise and loiter (Scholz & Nita
      p.16; Nita eq 3.7.5-3.7.13): trip, then climb, alternate, 45 minutes
      and descent (14 CFR 121.639). Gross weight is iterated until fuel
      available equals fuel required (FLOPS, TM-2017-219627 p.8).
   ===================================================================== */

import { TURBOPROP_DEFAULTS } from "./defaults.js";
import { turbopropGroup, PROPELLER_TYPES } from "./propulsion.js";
import { flopsWeights } from "../transport/flops-weights.js";
import { makeISA } from "../../engine/atmosphere.js";

const G = 9.80665, LB = 0.45359237, FT = 0.3048, NM = 1852, HP = 745.69987;
const K_L = 0.137, K_TO = 2.25, K_APP = 1.64, K_E = 11.22;
const GRAD_2ND = { 2: 0.024, 3: 0.027, 4: 0.030 };      // 14 CFR 25.121(b)(1)
const GRAD_MISSED = { 2: 0.021, 3: 0.024, 4: 0.027 };   // 14 CFR 25.121(d)
/* Nita 2008 Table 3.5 "based on Roskam I 1997". */
const FRACTIONS = Object.freeze({ start: 0.990, taxi: 0.995, takeoff: 0.995, climb: 0.985, descent: 0.985, landing: 0.995 });
/* Scholz & Nita Table 1, P/P0 = A M^m σ^n. */
export const POWER_LAPSE = Object.freeze({
  average:   { A: 1.371, m: 0.273, n: 0.885 },
  schaufele: { A: 1.036, m: 0.101, n: 0.851 },
  loftin:    { A: 1.089, m: 0.091, n: 0.924 },
});
const isa = makeISA(0);
const RHO0 = isa(0).rho;
const TOL_LB = 0.5;

function resolve(p) {
  const q = { ...TURBOPROP_DEFAULTS, ...(p || {}) };
  for (const [k, v] of Object.entries(TURBOPROP_DEFAULTS))
    if (typeof v === "number" && !Number.isFinite(Number(q[k])))
      throw new Error(`Turboprop input "${k}" must be a finite number (got ${q[k]})`);
  if (!(q.numEngines >= 2 && q.numEngines <= 4) || !Number.isInteger(q.numEngines))
    throw new Error("A turboprop transport here has 2, 3 or 4 engines (the climb rules are for multi-engine aircraft)");
  if (!POWER_LAPSE[q.powerLapse]) throw new Error(`Unknown power lapse "${q.powerLapse}"`);
  q.propellerType = Number(q.propellerType);
  if (typeof q.cargoContainers !== "boolean") throw new Error("Turboprop input \"cargoContainers\" must be true or false");
  if (!PROPELLER_TYPES[q.propellerType]) throw new Error(`Unknown propeller type "${q.propellerType}"`);
  return q;
}

const climbPolar = (cl, A, gear) => cl / (0.05 * cl - 0.035 + gear + cl * cl / (Math.PI * A * 0.7));

export function matching(p) {
  const nE = p.numEngines, sigma = 1;
  const wsLanding = K_L * sigma * p.clMaxLanding * p.landingFieldLengthM;        // kg/m² at MLW
  const wsTakeoff = wsLanding / p.landingToTakeoffMass;
  const vApp = K_APP * Math.sqrt(p.landingFieldLengthM);
  const vStallL = vApp / 1.3;
  const vStallTO = vStallL * Math.sqrt(p.clMaxLanding / p.clMaxTakeoff);
  const v2 = 1.2 * vStallTO;
  const pmTakeoff = wsTakeoff * K_TO * (v2 / Math.SQRT2) * G
                  / (p.takeoffFieldLengthM * sigma * p.clMaxTakeoff * p.etaTakeoff);
  const cl2 = p.clMaxTakeoff / 1.2 ** 2;
  const e2 = climbPolar(cl2, p.wingAspectRatio, 0);
  const pmSecond = (nE / (nE - 1)) * (1 / e2 + GRAD_2ND[nE]) * v2 * G / p.etaClimb;
  const clMa = p.clMaxLanding / 1.3 ** 2;
  const eMa = climbPolar(clMa, p.wingAspectRatio, 0.015);
  const pmMissed = (nE / (nE - 1)) * (1 / eMa + GRAD_MISSED[nE]) * vApp * G / p.etaClimb * p.landingToTakeoffMass;
  return { wsLanding, wsTakeoff, vApp, v2, pmTakeoff, pmSecond, pmMissed, e2, eMa, cl2, clMa };
}

export const powerLapse = (row, mach, sigma) => row.A * mach ** row.m * sigma ** row.n;

/* Cruise at the altitude needing the least power, at wing loading wsKgM2. */
export function cruise(p, wsKgM2, swetOverS) {
  const A = p.wingAspectRatio, M = p.cruiseMach, row = POWER_LAPSE[p.powerLapse];
  const eMax = K_E * Math.sqrt(A / swetOverS);
  const clMd = Math.PI * A * p.oswaldCruise / (2 * eMax);
  const at = (h) => {
    const atm = isa(h), sigma = atm.rho / RHO0;
    const cl = wsKgM2 * G / (0.7 * atm.P * M * M);
    const E = 2 * eMax / (clMd / cl + cl / clMd);
    const lapse = powerLapse(row, M, sigma);
    return { altM: h, cl, E, eMax, clMd, sigma, lapse, V: M * atm.a, pm: M * atm.a * G / (lapse * E * p.etaCruise) };
  };
  const top = p.maxAltitudeFt * FT;
  let best = at(0);
  for (let h = 100; h <= top + 1e-9; h += 100) { const c = at(h); if (c.pm < best.pm) best = c; }
  /* refine within ±100 m by golden section */
  let lo = Math.max(0, best.altM - 100), hi = Math.min(top, best.altM + 100);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const a = hi - phi * (hi - lo), b = lo + phi * (hi - lo);
    if (at(a).pm < at(b).pm) hi = b; else lo = a;
  }
  const r = at((lo + hi) / 2);
  return r.pm <= best.pm ? r : best;
}

/* Power-specific fuel consumption lb/(hp·h) → kg/(W·s). */
export const psfcSI = (lbPerHpH) => lbPerHpH * LB / (HP * 3600);

/* Two fuel methods:
     breguet  cruise, alternate and 45-minute hold by the propeller Breguet
              equations alone, with no allowance for start, taxi, take-off,
              climb or descent (Loftin's treatment, RP-1060 p.152, which the
              jet class validates). The ATR and Dash 8 factsheets' block fuel
              supports this: validation/turboprop.mjs.
     roskam   the same, with Roskam's turboprop segment fractions as quoted by
              Nita 2008 Table 3.5 (start, taxi, take-off, climb, descent,
              landing; climb and descent again around the alternate, Nita eq
              3.7.12). They charge about 5% of take-off mass to the phases
              outside cruise, three times the factsheets' block fuel. */
export const FUEL_METHODS = Object.freeze(["breguet", "roskam"]);

export function missionFuel(p, cr) {
  if (!FUEL_METHODS.includes(p.fuelMethod)) throw new Error(`Unknown fuel method "${p.fuelMethod}"`);
  const c = psfcSI(p.sfcCruise);
  const breguet = cr.E * p.etaCruise / (c * G);                 // m (Scholz 5.54)
  const cruiseFrac = Math.exp(-(p.designRange * NM) / breguet);
  const alternate = Math.exp(-(p.alternateNm * NM) / breguet);
  const loiter = Math.exp(-(p.reserveMin * 60) * cr.V / breguet);  // Nita eq 3.7.10: B_t = B_s / V_CR
  const f = p.fuelMethod === "roskam" ? FRACTIONS
    : { start: 1, taxi: 1, takeoff: 1, climb: 1, descent: 1, landing: 1 };
  const tripOther = f.start * f.taxi * f.takeoff * f.climb * f.descent;
  const trip = tripOther * cruiseFrac;
  const reserve = f.climb * alternate * loiter * f.descent;
  const Mff = trip * reserve * f.landing;
  return { method: p.fuelMethod, Mff, trip, tripOther, reserve, cruise: cruiseFrac, alternate, loiter,
           nonCruise: Mff / cruiseFrac, breguetKm: breguet / 1000, fractions: f, psfcSI: c };
}

/* Trip (block) fuel, lb, for a stage of rangeNm ending at landingLb. */
export function tripFuel(fuel, rangeNm, landingLb) {
  const frac = fuel.tripOther * fuel.fractions.landing * Math.exp(-(rangeNm * NM) / (fuel.breguetKm * 1000));
  return landingLb * (1 / frac - 1);
}

function weightsAt(p, grossLb, wsKgM2, shpEach, fuelCapacityOverride) {
  const S = (grossLb * LB / wsKgM2) / (FT * FT);
  const span = Math.sqrt(p.wingAspectRatio * S);
  const group = turbopropGroup({
    shp: shpEach, specificWeight: p.engineSpecificWeight, sectionFactor: p.engineSectionFactor,
    propeller: { type: p.propellerType, diameterFt: p.propellerDiameterFt, blades: p.propellerBlades,
                 activityFactor: p.activityFactor, rpm: p.propellerRpm, mach: p.cruiseMach },
  });
  const thrust = p.thrustPerShp * shpEach;
  const wingVol = (2 / 3) * S * S * p.wingTc * (1 - p.wingTaper / (1 + p.wingTaper) ** 2) / span;   // ft³, FLOPS Eq 133
  const fuelCapacity = fuelCapacityOverride ?? wingVol * 7.48052 * p.fuelDensity * p.wingFuelFraction;
  const a = {
    grossWeight: grossLb, maxMach: p.maxMach, designRange: p.designRange,
    landingToTakeoffRatio: p.landingToTakeoffMass, emptyMarginFraction: p.emptyMarginFraction,
    passengers: p.passengers, firstClass: 0, businessClass: 0, economyClass: p.passengers,
    flightCrew: p.flightCrew, flightAttendants: p.flightAttendants, galleyCrew: p.galleyCrew,
    massPerPassenger: p.massPerPassenger, baggagePerPassenger: p.baggagePerPassenger, cargo: p.cargo,
    fuelCapacity, fuelDensity: p.fuelDensity, fuelTanks: p.fuelTanks,
    fuselageLength: p.fuselageLength, fuselageWidth: p.fuselageWidth, fuselageHeight: p.fuselageHeight,
    passengerCompartmentLength: p.passengerCompartmentLength, militaryCargoFloor: false,
    htArea: p.htAreaRatio * S, htAspectRatio: 5.444, htTaper: 0.3008, htTc: 0.1195, htOnVtFraction: 0,
    vtArea: p.vtAreaRatio * S, vtAspectRatio: 2.2262, vtTaper: 0.2108, vtTc: 0.1375, numVerticalTails: 1,
    wingArea: S, wingAspectRatio: p.wingAspectRatio, wingSpan: span, wingSweep: p.wingSweep,
    wingTaper: p.wingTaper, wingTc: p.wingTc,
    ultimateLoadFactor: p.ultimateLoadFactor, strutBracing: 0, aeroelasticTailoring: 0,
    compositeFraction: 0, varSweep: 0, wingLoadFraction: 1, controlSurfaceAreaRatio: 0.333,
    mainGearOleoIn: p.mainGearOleoIn, noseGearOleoIn: p.noseGearOleoIn,
    nacelleDiameter: p.nacelleDiameterFt, nacelleLength: p.nacelleLengthFt,
    paintPerArea: p.paintPerArea, engineSlsThrust: thrust,
    numEngines: p.numEngines, numWingEngines: p.numEngines, numFuselageEngines: 0,
    hydraulicPressure: p.hydraulicPressure, apuMass: p.apuMassLb, cargoContainers: p.cargoContainers === true,
    systemsFactor: p.systemsFactor,
    turboprop: { engineEach: group.engine, sectionEach: group.section, propellerEach: group.propeller },
  };
  const w = flopsWeights(a);
  return { w, S, span, shpEach, group, thrustEach: thrust, fuelCapacity };
}

const payloadOf = (p) => p.passengers * (p.massPerPassenger + p.baggagePerPassenger) + p.cargo;

export function sizeTurboprop(input) {
  const p = resolve(input);
  const match = matching(p);
  const payloadLb = payloadOf(p);
  const ws = match.wsTakeoff;
  let gross = 3 * payloadLb, last = null, converged = false, stopReason = "iteration limit", iters = 0;
  for (; iters < 300; iters++) {
    /* The cruise requirement depends on the wetted area, which depends on size. */
    const pmClimb = Math.max(match.pmTakeoff, match.pmSecond, match.pmMissed);
    const probe = weightsAt(p, gross, ws, pmClimb * gross * LB / p.numEngines / HP);
    const swetOverS = probe.w.detail.totalWetted / probe.S;
    const cr = cruise(p, ws, swetOverS);
    const pm = Math.max(pmClimb, cr.pm);
    const governs = [["take-off", match.pmTakeoff], ["second segment", match.pmSecond],
                     ["missed approach", match.pmMissed], ["cruise", cr.pm]].sort((x, y) => y[1] - x[1])[0][0];
    const shpEach = pm * gross * LB / p.numEngines / HP;
    const sized = weightsAt(p, gross, ws, shpEach);
    const fuel = missionFuel(p, cr);
    const fuelRequired = gross * (1 - fuel.Mff);
    const next = sized.w.totals.zeroFuel + fuelRequired;
    last = { sized, cr, pm, governs, fuel, fuelRequired, swetOverS };
    if (!Number.isFinite(next) || next > 1e6) { stopReason = "gross weight ran away (no aircraft closes these requirements)"; break; }
    if (Math.abs(next - gross) < TOL_LB) { gross = next; converged = true; stopReason = null; break; }
    gross += 0.5 * (next - gross);
  }
  const { sized, cr, pm, governs, fuel, fuelRequired, swetOverS } = last;
  const t = sized.w.totals;
  return {
    mode: "sizing", converged, stopReason, iterations: iters + 1, toleranceLb: TOL_LB,
    grossLb: gross, emptyLb: t.empty, operatingEmptyLb: t.operatingEmpty, zeroFuelLb: t.zeroFuel,
    payloadLb, fuelLb: fuelRequired, fuelCapacityLb: sized.fuelCapacity,
    fuelFits: sized.fuelCapacity >= fuelRequired,
    wingAreaFt2: sized.S, spanFt: sized.span, shpEach: sized.shpEach, powerKwEach: sized.shpEach * HP / 1000,
    wingLoadingKgM2: ws, powerToMass: pm, powerGovernedBy: governs,
    constraints: { ...match, pmCruise: cr.pm },
    cruise: { ...cr, swetOverS, altFt: cr.altM / FT }, fuel, propulsion: sized.group,
    weights: sized.w, inputs: p,
  };
}

/* Range (nm) taking off at grossLb with fuelLb, by the result's fuel method. */
export function turbopropRangeAt(result, grossLb, fuelLb) {
  if (!(fuelLb > 0) || !(grossLb > 0)) return 0;
  const f = result.fuel;
  const cruiseNeeded = (1 - fuelLb / grossLb) / f.nonCruise;
  return cruiseNeeded < 1 ? Math.max(0, -Math.log(cruiseNeeded) * f.breguetKm * 1000 / NM) : 0;
}

/* An existing aircraft: gross weight, wing area and take-off shp per engine are given. */
export function analyzeTurboprop(input) {
  const p = resolve(input);
  const { grossLb, wingAreaFt2, shpEach } = p;
  for (const [k, v] of Object.entries({ grossLb, wingAreaFt2, shpEach }))
    if (!(v > 0)) throw new Error(`analyzeTurboprop needs ${k} > 0`);
  const ws = grossLb * LB / (wingAreaFt2 * FT * FT);
  const sized = weightsAt(p, grossLb, ws, shpEach, p.fuelCapacityLb);
  const swetOverS = sized.w.detail.totalWetted / sized.S;
  const cr = cruise(p, ws, swetOverS);
  const fuel = missionFuel(p, cr);
  const t = sized.w.totals;
  /* Range with the fuel this aircraft carries at this weight (capped by its tanks). */
  const fuelLb = Math.min(grossLb - t.zeroFuel, p.fuelCapacityLb ?? Infinity);
  const cruiseNeeded = ((grossLb - fuelLb) / grossLb) / fuel.nonCruise;
  const rangeNm = cruiseNeeded < 1 ? Math.max(0, -Math.log(cruiseNeeded) * fuel.breguetKm * 1000 / NM) : 0;
  const pmAvailable = shpEach * p.numEngines * HP / (grossLb * LB);
  return { mode: "analysis", grossLb, rangeNm, emptyLb: t.empty, operatingEmptyLb: t.operatingEmpty,
           zeroFuelLb: t.zeroFuel, payloadLb: t.payload, fuelAvailableLb: fuelLb,
           wingLoadingKgM2: ws, powerToMass: pmAvailable, cruisePowerMet: pmAvailable >= cr.pm,
           cruise: { ...cr, swetOverS, altFt: cr.altM / FT }, fuel, propulsion: sized.group,
           weights: sized.w, inputs: p };
}
