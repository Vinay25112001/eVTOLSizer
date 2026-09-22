/* =====================================================================
   AIRCRAFT DESIGN ENGINE — one engine over every fixed-wing class
   =====================================================================
   The eVTOL sizer has its own engine (src/engine.js), which this file never
   imports. Aircraft mode runs this one. It does not re-derive any physics:
   each aircraft type's sizing loop stays in its own class folder, where its
   gate validates it. What this engine adds is the layer a designer works
   in, the same for every type:

     designAircraft     size from requirements, or analyse a given aircraft,
                        and return one common result (SI units)
     constraintDiagram  the matching chart the sizing point came from
     payloadRange       the payload-range diagram of the result
     polarCurve         CD against CL at the cruise condition
     sensitivityCases   one-at-a-time ±5 % input perturbations
     tradeGrid          a two-input grid for carpet plots
     compareTypes       one requirement, every type that could meet it
     realityCheck       the nearest real aircraft from the reference table,
                        and where the design sits among them
     methodAccuracy     the measured error of the method for this type

   Class-specific code branches on the type here and only here (the
   aircraft-classes gate forbids it outside src/classes/).
   ===================================================================== */

import { sizeTrainer, analyzeTrainer, trainerRangeAt } from "../trainer/size.js";
import * as TP from "../trainer/performance.js";
import { TRAINER_DEFAULTS, TRAINER_INPUTS } from "../trainer/defaults.js";
import { sizeTurboprop, analyzeTurboprop, turbopropRangeAt, cruise as tpCruise } from "../turboprop/size.js";
import { TURBOPROP_DEFAULTS, TURBOPROP_INPUTS } from "../turboprop/defaults.js";
import { sizeTransport, analyzeTransport, transportRangeAt, transportPolarCurve, cruiseThrustRatio } from "../transport/size.js";
import { TRANSPORT_DEFAULTS, TRANSPORT_INPUTS } from "../transport/defaults.js";
import { BIZJET_DEFAULTS, BIZJET_ALL_INPUTS } from "../bizjet/defaults.js";
import { makeJetISA } from "../transport/atmosphere.js";
import { trainerWarnings, measuredEmptyWeightErrors } from "../trainer/warnings.js";
import { turbopropWarnings, measuredTurbopropChecks } from "../turboprop/warnings.js";
import { transportWarnings, measuredTransportChecks } from "../transport/warnings.js";
import { bizjetWarnings, measuredBizjetChecks } from "../bizjet/warnings.js";

const LB = 0.45359237, FT = 0.3048, FT2 = 0.09290304, G = 9.80665, HP = 745.69987, LBF = 4.4482216, KT = 0.514444;
const isa = makeJetISA(0);

/* ── the types ───────────────────────────────────────────────────────── */

export const AIRCRAFT_TYPES = Object.freeze({
  trainer: {
    id: "trainer", label: "Piston trainer", short: "Trainer", power: "power",
    blurb: "Single piston engine, 2-4 seats. Loftin matching, GASP weights, Hamilton Standard propeller.",
    inputs: TRAINER_INPUTS, defaults: TRAINER_DEFAULTS, categories: ["trainer", "ga-piston"],
    analysisInputs: {
      grossLb: { value: 2550, unit: "lb", min: 1000, max: 6000, label: "Gross weight" },
      wingAreaFt2: { value: 174, unit: "ft²", min: 80, max: 400, label: "Wing area" },
      spanFt: { value: 36.1, unit: "ft", min: 20, max: 60, label: "Wing span" },
      hp: { value: 180, unit: "hp", min: 80, max: 450, label: "Rated power" },
    },
  },
  turboprop: {
    id: "turboprop", label: "Turboprop airliner", short: "Turboprop", power: "power",
    blurb: "Twin turboprop, 30-90 seats. Scholz & Nita matching, FLOPS airframe, GASP engine, Hamilton Standard propellers.",
    inputs: TURBOPROP_INPUTS, defaults: TURBOPROP_DEFAULTS, categories: ["turboprop"],
    analysisInputs: {
      grossLb: { value: 22800 / LB, unit: "lb", min: 10000, max: 90000, label: "Gross weight" },
      wingAreaFt2: { value: 61 / FT2, unit: "ft²", min: 200, max: 1500, label: "Wing area" },
      shpEach: { value: 2051e3 / HP, unit: "shp", min: 500, max: 8000, label: "Take-off power per engine" },
      fuelCapacityLb: { value: 5000 / LB, unit: "lb", min: 1000, max: 30000, label: "Fuel capacity" },
    },
  },
  bizjet: {
    id: "bizjet", label: "Business jet", short: "Business jet", power: "thrust",
    blurb: "Twin aft-engine jet, T-tail, 6-19 seats, NBAA-style reserves. The jet-transport method with business-jet inputs.",
    inputs: BIZJET_ALL_INPUTS, defaults: BIZJET_DEFAULTS, categories: ["business-jet"],
    analysisInputs: {
      grossLb: { value: BIZJET_DEFAULTS.analysisGrossLb, unit: "lb", min: 5000, max: 110000, label: "Gross weight" },
      wingAreaFt2: { value: BIZJET_DEFAULTS.analysisWingAreaFt2, unit: "ft²", min: 150, max: 1500, label: "Wing area" },
      thrustEachLbf: { value: BIZJET_DEFAULTS.analysisThrustLbf, unit: "lbf", min: 1500, max: 20000, label: "Thrust per engine" },
      fuelCapacityLb: { value: BIZJET_DEFAULTS.analysisFuelLb, unit: "lb", min: 1000, max: 50000, label: "Fuel capacity" },
    },
  },
  transport: {
    id: "transport", label: "Jet airliner", short: "Jet airliner", power: "thrust",
    blurb: "Twin to four jet engines, 70-500 seats. Loftin matching, FLOPS weights, segment mission, optional FLOPS drag build-up.",
    inputs: TRANSPORT_INPUTS, defaults: TRANSPORT_DEFAULTS, categories: ["narrowbody", "widebody", "regional-jet"],
    analysisInputs: {
      grossLb: { value: 174200, unit: "lb", min: 40000, max: 1300000, label: "Gross weight" },
      wingAreaFt2: { value: 1341, unit: "ft²", min: 500, max: 10000, label: "Wing area" },
      thrustEachLbf: { value: 27301, unit: "lbf", min: 5000, max: 120000, label: "Thrust per engine" },
      fuelCapacityLb: { value: 46063, unit: "lb", min: 5000, max: 500000, label: "Fuel capacity" },
    },
  },
});
export const TYPE_IDS = Object.freeze(Object.keys(AIRCRAFT_TYPES));

export function typeOf(id) {
  const t = Object.prototype.hasOwnProperty.call(AIRCRAFT_TYPES, id) ? AIRCRAFT_TYPES[id] : null;
  if (!t) throw new Error(`Unknown aircraft type "${id}". Known: ${TYPE_IDS.join(", ")}.`);
  return t;
}

const jetParams = (id, params) => (id === "bizjet" ? { ...BIZJET_DEFAULTS, ...params } : params);
const stripBizjetExtras = (p) => {
  const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...rest } = p;
  return rest;
};

function runClass(id, mode, params) {
  if (id === "trainer") return mode === "analyse" ? analyzeTrainer(params) : sizeTrainer(params);
  if (id === "turboprop") return mode === "analyse" ? analyzeTurboprop(params) : sizeTurboprop(params);
  const p = stripBizjetExtras(jetParams(id, params));
  return mode === "analyse" ? analyzeTransport(p) : sizeTransport(p);
}

/* ── common result ───────────────────────────────────────────────────── */

const kg = (lb) => (Number.isFinite(lb) ? lb * LB : NaN);
const sumObj = (o) => Object.values(o || {}).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
const group = (name, items, labels = {}) => ({
  name, kg: kg(sumObj(items)),
  items: Object.entries(items || {}).map(([k, v]) => ({ key: k, name: labels[k] ?? k, kg: kg(v) })),
});

const TRAINER_LABELS = { wing: "Wing", horizontalTail: "Horizontal tail", verticalTail: "Vertical tail", fuselage: "Fuselage",
  landingGear: "Landing gear", engine: "Engine", engineSection: "Engine section", propeller: "Propeller",
  fuelSystem: "Fuel system", flightControls: "Flight controls", equipment: "Fixed equipment",
  unusableFuel: "Unusable fuel", oil: "Oil" };
const FLOPS_LABELS = { wing: "Wing", horizontalTail: "Horizontal tail", verticalTail: "Vertical tail", fuselage: "Fuselage",
  mainGear: "Main gear", noseGear: "Nose gear", nacelles: "Nacelles", paint: "Paint", engines: "Engines",
  thrustReversers: "Thrust reversers", miscellaneous: "Engine controls and starters", fuelSystem: "Fuel system",
  surfaceControls: "Surface controls", apu: "APU", instruments: "Instruments", hydraulics: "Hydraulics",
  electrical: "Electrical", avionics: "Avionics", furnishings: "Furnishings", airConditioning: "Air conditioning",
  antiIcing: "Anti-icing", flightCrew: "Flight crew", cabinCrew: "Cabin crew", unusableFuel: "Unusable fuel",
  oil: "Engine oil", passengerService: "Passenger service", cargoContainers: "Cargo containers",
  propellers: "Propellers", engineSection: "Engine section", gearbox: "Gearbox" };

function normalize(id, mode, r) {
  const p = r.inputs;
  const base = { type: id, mode, raw: r, converged: mode === "analyse" ? true : r.converged,
                 stopReason: r.stopReason ?? null, iterations: r.iterations ?? 0, warnings: [] };
  if (id === "trainer") {
    const g = r.geometry;
    const payloadLb = mode === "analyse" ? (p.pax + 1) * p.massPerOccupantLb : r.payloadLb;
    return { ...base,
      mtowKg: kg(r.grossLb), emptyKg: kg(r.emptyLb), oewKg: kg(r.emptyLb), payloadKg: kg(payloadLb),
      fuelKg: kg(r.fuelLb), fuelCapacityKg: kg(r.fuelLb), zfwKg: kg(r.emptyLb + payloadLb),
      wingAreaM2: g.wingAreaFt2 * FT2, spanM: g.spanFt * FT, aspectRatio: g.AR,
      wingLoadingKgM2: kg(r.grossLb) / (g.wingAreaFt2 * FT2),
      propulsion: { kind: "power", engines: 1, perEngine: r.hp * HP / 1000, unit: "kW", perEngineImperial: r.hp, unitImperial: "hp",
                    toWeight: r.hp * HP / kg(r.grossLb), toWeightUnit: "W/kg", governedBy: r.powerGovernedBy ?? "given" },
      cruise: { mach: TP.machOf(p.cruiseKt, p.cruiseAltFt), speedKt: p.cruiseKt, altFt: p.cruiseAltFt,
                LD: (r.fuel?.cruise ?? r.cruise).LD, LDmax: TP.polar(p).LDmax, cl: (r.fuel?.cruise ?? r.cruise).CL },
      rangeNm: mode === "analyse" ? null : p.rangeNm, designRangeNm: p.rangeNm,
      weightGroups: [group("Empty weight (GASP)", r.groups, TRAINER_LABELS)],
      mission: r.fuel ? [
        { name: "Start, taxi, take-off allowance", kg: kg(r.fuel.allowanceLb) },
        { name: "Climb", kg: kg(r.fuel.climbLb), minutes: r.fuel.climbMin },
        { name: "Cruise", kg: kg(r.fuel.cruiseLb), nm: p.rangeNm },
        { name: `Reserve (${p.reserveMin} min)`, kg: kg(r.fuel.reserveLb), minutes: p.reserveMin, reserve: true },
      ] : [],
    };
  }
  if (id === "turboprop") {
    const w = r.weights, t = w.totals, grp = r.propulsion;
    const S = mode === "analyse" ? p.wingAreaFt2 : r.wingAreaFt2;
    const shp = mode === "analyse" ? p.shpEach : r.shpEach;
    const f = r.fuel;
    /* Split the class's own fuel figure in the proportion the fractions give. */
    const fuelTotKg = kg(mode === "analyse" ? r.grossLb * (1 - f.Mff) : r.fuelLb);
    const tripShare = (1 - f.trip) / (1 - f.Mff);
    const tripKg = fuelTotKg * tripShare, resKg = fuelTotKg * (1 - tripShare);
    return { ...base,
      mtowKg: kg(r.grossLb), emptyKg: kg(t.empty), oewKg: kg(t.operatingEmpty), payloadKg: kg(t.payload),
      fuelKg: kg(mode === "analyse" ? r.fuelAvailableLb : r.fuelLb),
      fuelCapacityKg: kg(mode === "analyse" ? p.fuelCapacityLb : r.fuelCapacityLb), zfwKg: kg(t.zeroFuel),
      wingAreaM2: S * FT2, spanM: Math.sqrt(p.wingAspectRatio * S) * FT, aspectRatio: p.wingAspectRatio,
      wingLoadingKgM2: kg(r.grossLb) / (S * FT2),
      propulsion: { kind: "power", engines: p.numEngines, perEngine: shp * HP / 1000, unit: "kW", perEngineImperial: shp, unitImperial: "shp",
                    toWeight: r.powerToMass, toWeightUnit: "W/kg", governedBy: r.powerGovernedBy ?? "given",
                    group: grp },
      cruise: { mach: p.cruiseMach, speedKt: r.cruise.V / KT, altFt: r.cruise.altFt, LD: r.cruise.E, LDmax: r.cruise.eMax, cl: r.cruise.cl },
      rangeNm: mode === "analyse" ? r.rangeNm : p.designRange, designRangeNm: p.designRange,
      weightGroups: [group("Structure (FLOPS)", w.structure, FLOPS_LABELS), group("Propulsion (GASP / Hamilton Standard)", w.propulsion, FLOPS_LABELS),
                     group("Systems and equipment (FLOPS)", w.systems, FLOPS_LABELS), group("Operating items (FLOPS)", w.operating, FLOPS_LABELS)],
      mission: [
        { name: `Trip (${f.method === "roskam" ? "Roskam fractions + " : ""}Breguet cruise ${p.designRange} nm)`, kg: tripKg, nm: p.designRange },
        { name: `Reserves (${p.alternateNm} nm alternate, ${p.reserveMin} min hold)`, kg: resKg, reserve: true },
      ],
    };
  }
  /* jets */
  const w = r.weights, t = w.totals;
  const S = mode === "analyse" ? p.wingAreaFt2 : r.wingAreaFt2;
  const T = mode === "analyse" ? p.thrustEachLbf : r.thrustEachLbf;
  const mis = r.fuel?.mission;
  const LBtoKg = (v) => kg(v);
  const segs = mis ? Object.entries(mis.segmentsLb).filter(([, v]) => v > 0).map(([k, v]) => ({
    name: { taxi: "Taxi out", takeoff: "Take-off", climb: "Climb", cruise: "Cruise", descent: "Descent",
            contingency: "Contingency", alternate: "To alternate", final: "Final reserve / hold" }[k] ?? k,
    kg: LBtoKg(v), reserve: ["contingency", "alternate", "final"].includes(k),
    minutes: mis.times?.[k], nm: mis.distances?.[k] })) : [];
  if (!mis && r.fuel) {
    const trip = r.fuel.trip ?? r.fuel.cruise;
    const res = r.fuelRequiredLb ?? r.fuelLb;
    segs.push({ name: `Mission fuel (${r.fuel.method} method)`, kg: kg(res ?? 0) });
    if (trip && r.fuel.method === "regulatory") segs.push({ name: "of which reserves (alternate, 45 min)", kg: kg(r.grossLb * trip * (1 - r.fuel.reserve)), reserve: true });
  }
  return { ...base,
    mtowKg: kg(r.grossLb), emptyKg: kg(t.empty), oewKg: kg(t.operatingEmpty), payloadKg: kg(t.payload),
    fuelKg: kg(mode === "analyse" ? (r.fuelRequiredLb ?? r.fuelAvailableLb) : r.fuelLb),
    fuelCapacityKg: kg(mode === "analyse" ? p.fuelCapacityLb : r.fuelCapacityLb), zfwKg: kg(t.zeroFuel),
    /* Structural weight limits, as a fraction of the take-off weight. They
       bound the payload-range diagram: the maximum payload is MZFW − OEW,
       not the design payload, and the landing weight has to fit under MLW. */
    mzfwKg: kg(r.grossLb * p.mzfwRatio), mlwKg: kg(r.grossLb * p.landingToTakeoffMass),
    wingAreaM2: S * FT2, spanM: Math.sqrt(p.wingAspectRatio * S) * FT, aspectRatio: p.wingAspectRatio,
    wingLoadingKgM2: kg(r.grossLb) / (S * FT2),
    propulsion: { kind: "thrust", engines: p.numEngines, perEngine: T * LBF / 1000, unit: "kN", perEngineImperial: T, unitImperial: "lbf",
                  toWeight: (T * p.numEngines) / r.grossLb, toWeightUnit: "T/W", governedBy: r.thrustGovernedBy ?? "given" },
    cruise: { mach: p.cruiseMach, speedKt: r.cruise.V / KT, altFt: p.cruiseAltFt, LD: r.cruise.E, LDmax: r.cruise.eMax,
              cl: r.cruise.cl, dragMethod: r.cruise.dragMethod, breakdown: r.cruise.breakdown },
    rangeNm: mode === "analyse" ? r.rangeNm : p.designRange, designRangeNm: p.designRange,
    weightGroups: [group("Structure (FLOPS)", w.structure, FLOPS_LABELS), group("Propulsion (FLOPS)", w.propulsion, FLOPS_LABELS),
                   group("Systems and equipment (FLOPS)", w.systems, FLOPS_LABELS), group("Operating items (FLOPS)", w.operating, FLOPS_LABELS)],
    mission: segs,
    missionTimes: mis?.times, topOfClimbFt: mis?.topOfClimbFt,
  };
}

/* Size (mode "size") or analyse (mode "analyse") an aircraft of type id.
   params are the type's inputs; for analysis they also carry the given
   aircraft (gross weight, wing area, thrust or power, fuel capacity). */
export function designAircraft({ type, mode = "size", params = {} }) {
  typeOf(type);
  const r = runClass(type, mode, params);
  return normalize(type, mode, r);
}

/* ── constraint diagram ──────────────────────────────────────────────── */

const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));

export function constraintDiagram(result) {
  const r = result.raw, p = r.inputs, type = result.type;
  if (result.mode !== "size") return null;
  if (type === "trainer") {
    const wsDesign = r.wingLoading;                                       // lb/ft²
    const xs = linspace(wsDesign * 0.4, wsDesign * 1.8, 40);
    const pol = TP.polar(p), polClimb = TP.polar({ ...p, e: p.eClimb });
    const W = r.grossLb;
    const climb = xs.map((ws) => [ws, TP.climbPowerRequired({ weightLb: W, wingLoading: ws, rocFpm: p.rocFpm, altFt: 0, pol: polClimb, eta: p.etaClimb }) / W]);
    const cruise = xs.map((ws) => [ws, TP.levelFlight({ weightLb: W, wingAreaFt2: W / ws, vKt: p.cruiseKt, altFt: p.cruiseAltFt, pol, eta: p.etaCruise }).shaftHp / p.cruisePowerFrac / W]);
    return { xLabel: "Wing loading W/S (lb/ft²)", yLabel: "Power loading P/W (hp/lb)",
             curves: [{ name: `Climb ${p.rocFpm} ft/min (Loftin 6.15)`, points: climb },
                      { name: `Cruise ${p.cruiseKt} kt at ${Math.round(p.cruisePowerFrac * 100)} % power`, points: cruise }],
             verticals: [{ name: `Stall ${p.stallKt} kt, CLmax ${p.clMaxLanding}`, x: wsDesign }],
             design: { x: wsDesign, y: r.hp / W }, feasible: "above the curves, left of the stall line" };
  }
  if (type === "turboprop") {
    const c = r.constraints, ws0 = c.wsTakeoff;
    const xs = linspace(ws0 * 0.4, ws0 * 1.6, 40);
    const takeoff = xs.map((ws) => [ws, c.pmTakeoff * ws / ws0]);
    const cr = xs.map((ws) => [ws, tpCruise(p, ws, r.cruise.swetOverS).pm]);
    return { xLabel: "Wing loading m/S (kg/m²)", yLabel: "Power-to-mass P/m (W/kg)",
             curves: [{ name: `Take-off ${p.takeoffFieldLengthM} m (Scholz & Nita)`, points: takeoff },
                      { name: "Cruise (best altitude)", points: cr },
                      { name: "Second segment, 14 CFR 25.121(b)", points: xs.map((x) => [x, c.pmSecond]) },
                      { name: "Missed approach, 14 CFR 25.121(d)", points: xs.map((x) => [x, c.pmMissed]) }],
             verticals: [{ name: `Landing ${p.landingFieldLengthM} m`, x: ws0 }],
             design: { x: ws0, y: r.powerToMass }, feasible: "above the curves, left of the landing line" };
  }
  const c = r.constraints, ws0 = c.wsTakeoff;
  const xs = linspace(ws0 * 0.4, ws0 * 1.6, 40);
  const hM = p.cruiseAltFt * FT, atm = isa(hM);
  const q = 0.5 * 1.4 * atm.P * p.cruiseMach ** 2;
  const cr = r.cruise;
  const cd0 = cr.cd0;
  const kEff = cr.dragMethod === "flops" ? (cr.cd - cr.cd0) / (cr.cl * cr.cl) : 1 / (Math.PI * p.wingAspectRatio * p.oswaldCruise);
  /* The lapse the sizing actually used, not a second opinion: the class
     returns it, and recomputing it here is how the chart and the sizing
     came to disagree in the first place. */
  const lapse = Number.isFinite(c.cruiseThrustRatio) ? c.cruiseThrustRatio
              : cruiseThrustRatio(p.bypassRatio, p.cruiseAltFt);
  const cruiseCurve = xs.map((ws) => { const wsN = ws * G; return [ws, (q * cd0 / wsN + wsN * kEff / q) / lapse]; });
  return { xLabel: "Wing loading m/S (kg/m²)", yLabel: "Thrust-to-weight T/W",
           curves: [{ name: `Take-off ${p.takeoffFieldLengthM} m (Loftin)`, points: xs.map((ws) => [ws, c.twTakeoff * ws / ws0]) },
                    { name: `Cruise M ${p.cruiseMach} at ${p.cruiseAltFt} ft${cr.dragMethod === "flops" ? " (FLOPS drag, local fit)" : ""}`, points: cruiseCurve },
                    { name: "Second segment, 14 CFR 25.121(b)", points: xs.map((x) => [x, c.twSecond]) },
                    { name: "Missed approach, 14 CFR 25.121(d)", points: xs.map((x) => [x, c.twMissed]) },
                    /* The initial-cruise-altitude line, when one is required: the
                       same form as the cruise line but at the required altitude
                       and with the residual rate of climb left over. */
                    ...(c.icaAltFt && c.ica ? [{
                      name: `Initial cruise altitude ${c.icaAltFt.toLocaleString("en-US")} ft at ${p.icaResidualRocFpm} ft/min`,
                      points: (() => {
                        const hI = c.icaAltFt * FT, aI = isa(hI);
                        const qI = 0.5 * 1.4 * aI.P * p.cruiseMach ** 2, VI = p.cruiseMach * aI.a;
                        const roc = p.icaResidualRocFpm * FT / 60;
                        return xs.map((ws) => {
                          const cl = ws * G / qI;
                          const cd = cd0 + kEff * cl * cl;
                          return [ws, (cd / cl + roc / VI) / c.ica.lapse];
                        });
                      })(),
                    }] : [])],
           verticals: [{ name: `Landing ${p.landingFieldLengthM} m`, x: ws0 }],
           design: { x: ws0, y: r.thrustToWeight }, feasible: "above the curves, left of the landing line" };
}

/* ── payload-range ───────────────────────────────────────────────────── */

function rangeAt(result, grossLb, fuelLb) {
  const r = result.raw;
  if (result.type === "trainer") return trainerRangeAt(r, grossLb, fuelLb);
  if (result.type === "turboprop") return turbopropRangeAt(r, grossLb, fuelLb);
  return transportRangeAt(r, grossLb, fuelLb);
}

/* Payload against range, from the result's own weights and fuel method.
   The maximum payload is the structural one, MZFW − OEW, where the type has
   a maximum zero-fuel weight; the design payload is marked separately,
   because it is usually well below the structural limit (the 737-800 flies
   a design payload 22 % under its MZFW limit). Types without an MZFW fall
   back to the design payload. Fuel is limited by the tanks; reserves as in
   the sizing. Where a maximum landing weight is known, each corner is
   checked against it. */
export function payloadRange(result) {
  const LBk = 1 / LB;
  const mtow = result.mtowKg * LBk, oew = result.oewKg * LBk;
  const plDesign = result.payloadKg * LBk;
  const mzfw = result.mzfwKg > 0 ? result.mzfwKg * LBk : 0;
  const mlw = result.mlwKg > 0 ? result.mlwKg * LBk : 0;
  const eps = 1e-6 * mtow;
  /* The structural payload limit. MZFW is entered as a fraction of the
     take-off weight, which is the form the manufacturers publish it in, but
     that makes it only as good as the sized take-off weight: if the loop
     sizes MTOW low, the implied MZFW can come out under the design payload,
     which is not a real aircraft. Say so rather than draw it. */
  const plStruct = mzfw > 0 ? Math.max(0, mzfw - oew) : 0;
  const mzfwBelowDesign = mzfw > 0 && plStruct < plDesign - eps;
  const plMax = mzfw > 0 && !mzfwBelowDesign ? plStruct : plDesign;
  const cap = (result.fuelCapacityKg > 0 ? result.fuelCapacityKg : result.fuelKg) * LBk;
  const pts = [{ label: "Maximum payload", rangeNm: 0, payloadKg: plMax * LB }];
  const fuelA = Math.min(cap, mtow - oew - plMax);
  if (fuelA > 0) pts.push({ label: "Maximum payload at MTOW", rangeNm: rangeAt(result, mtow, fuelA), payloadKg: plMax * LB, fuelKg: fuelA * LB });
  /* The design mission, which sits inside the structural corner whenever the
     aircraft is not loaded to its maximum zero-fuel weight. This is the point
     the aircraft was sized at, so it should fall on the design range. */
  if (plDesign < plMax - eps) {
    const fuelD = Math.min(cap, mtow - oew - plDesign);
    if (fuelD > 0) pts.push({ label: "Design payload at MTOW", rangeNm: rangeAt(result, mtow, fuelD), payloadKg: plDesign * LB, fuelKg: fuelD * LB, design: true });
  }
  if (cap < mtow - oew) {
    const plB = mtow - oew - cap;
    if (plB < plMax - eps) pts.push({ label: "Full tanks at MTOW", rangeNm: rangeAt(result, mtow, cap), payloadKg: plB * LB, fuelKg: cap * LB });
    pts.push({ label: "Ferry (no payload, full tanks)", rangeNm: rangeAt(result, oew + cap, cap), payloadKg: 0, fuelKg: cap * LB });
  } else {
    pts.push({ label: "MTOW, no payload", rangeNm: rangeAt(result, mtow, mtow - oew), payloadKg: 0, fuelKg: (mtow - oew) * LB });
  }
  /* Landing weight at each corner: take-off weight less the trip fuel. The
     reserves are still on board at landing, so only the trip is burned.
     14 CFR 25.473 and the type's own limit make this a real constraint on
     short stages at heavy payload, where the aircraft can be over MLW at
     the destination without ever exceeding MTOW. */
  const mission = result.raw?.fuel?.mission;
  const reserveKg = mission?.total > 0 ? result.fuelKg * (mission.reserve / mission.total) : 0;
  if (mlw > 0 && reserveKg > 0) for (const pt of pts) {
    if (!(pt.fuelKg > 0)) continue;
    const landingKg = result.oewKg + pt.payloadKg + Math.min(pt.fuelKg, reserveKg);
    pt.landingKg = landingKg;
    pt.overMlw = landingKg > result.mlwKg * (1 + 1e-9);
  }
  const note = mzfwBelowDesign
    ? `The entered maximum zero-fuel mass (${Math.round(result.mzfwKg).toLocaleString("en-US")} kg) leaves only ${Math.round(plStruct * LB).toLocaleString("en-US")} kg of payload over this aircraft's operating empty mass, which is less than its own design payload of ${Math.round(result.payloadKg).toLocaleString("en-US")} kg. That is a disagreement between the sized take-off mass and the entered ratio, not a real limit, so the design payload is used as the maximum here. Ranges include the same reserves as the sizing.`
    : mzfw > 0
    ? `Maximum payload is the structural limit, MZFW − OEW = ${Math.round(plMax * LB).toLocaleString("en-US")} kg; the design payload is ${Math.round(result.payloadKg).toLocaleString("en-US")} kg. Ranges include the same reserves as the sizing.`
    : "Maximum payload is taken as the design payload (this type has no maximum zero-fuel weight); ranges include the same reserves as the sizing.";
  return { points: pts, fuelCapacityKg: cap * LB, designRangeNm: result.designRangeNm, designPayloadKg: result.payloadKg,
           maxPayloadKg: plMax * LB, mzfwKg: result.mzfwKg, mlwKg: result.mlwKg, mzfwBelowDesign, note };
}

/* ── aerodynamics ────────────────────────────────────────────────────── */

export function polarCurve(result) {
  const r = result.raw, p = r.inputs;
  const cls = Array.from({ length: 29 }, (_, i) => 0.05 * i);
  if (result.type === "trainer") {
    const pol = TP.polar(p);
    return { mach: result.cruise.mach, altFt: p.cruiseAltFt, points: cls.map((cl) => ({ cl, cd: pol.CD(cl) })), method: "parabolic, CD0 + CL²/(πAe)" };
  }
  if (result.type === "turboprop") {
    const k = 1 / (Math.PI * p.wingAspectRatio * p.oswaldCruise);
    const cd0 = (r.cruise.clMd ** 2) * k;
    return { mach: p.cruiseMach, altFt: r.cruise.altFt, points: cls.map((cl) => ({ cl, cd: cd0 + k * cl * cl })), method: "parabolic, Scholz k_E L/D_max" };
  }
  return { mach: p.cruiseMach, altFt: p.cruiseAltFt, points: transportPolarCurve(r, p.cruiseMach, p.cruiseAltFt, cls),
           method: p.dragMethod === "flops" ? "FLOPS build-up (skin friction, compressibility, Delta-Method)" : "equivalent skin friction, CD0 + CL²/(πAe)" };
}

/* ── trades ──────────────────────────────────────────────────────────── */

/* Numeric inputs that can be perturbed. */
export function numericInputs(type) {
  return Object.entries(typeOf(type).inputs).filter(([, s]) => typeof s.value === "number" && Number.isFinite(s.min) && s.value !== 0);
}

/* One case per numeric input: value × (1 + step). The caller runs them
   (in chunks, so a slow method does not freeze the page). */
export function sensitivityCases(type, params, step = 0.05) {
  return numericInputs(type).map(([k, s]) => {
    const v = params[k] ?? s.value;
    const nv = Number.isInteger(s.value) && Math.abs(v) < 20 ? v + 1 : v * (1 + step);
    return { key: k, label: s.label, unit: s.unit, from: v, to: nv, params: { ...params, [k]: nv } };
  });
}

export function evaluateCase(type, params, mode = "size") {
  try {
    const r = designAircraft({ type, mode, params });
    return { ok: r.converged, mtowKg: r.mtowKg, oewKg: r.oewKg, fuelKg: r.fuelKg, wingAreaM2: r.wingAreaM2,
             perEngine: r.propulsion.perEngine, fuelFits: r.raw.fuelFits !== false };
  } catch (e) { return { ok: false, error: e.message }; }
}

export function tradeGrid(type, params, xKey, xs, yKey, ys) {
  return ys.map((y) => ({ y, row: xs.map((x) => ({ x, ...evaluateCase(type, { ...params, [xKey]: x, [yKey]: y }) })) }));
}

/* ── one requirement, every type ─────────────────────────────────────── */

/* The operating envelope each type has actually been built in, from the
   reference table (primary sources): seats, range and cruise speed. */
export function typeEnvelopes(reference) {
  const out = {};
  for (const id of TYPE_IDS) {
    const rows = reference.filter((r) => typeOf(id).categories.includes(r.category));
    const span = (k) => { const v = rows.map((r) => r[k]).filter(Number.isFinite); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
    const speed = rows.map((r) => r.cruise_speed_kt ?? (r.cruise_mach ? r.cruise_mach * 573 : null)).filter(Number.isFinite);
    out[id] = { n: rows.length, seats: span("pax_max") ?? span("pax_typical"), rangeNm: span("range_nm"),
                speedKt: speed.length ? [Math.min(...speed), Math.max(...speed)] : null };
  }
  return out;
}

/* Map a common requirement onto each type's inputs. */
export function requirementParams(type, req) {
  const machAt = (kt, altFt) => kt * KT / isa(altFt * FT).a;
  if (type === "trainer") return { pax: Math.max(0, req.seats - 1), rangeNm: req.rangeNm, cruiseKt: Math.min(req.cruiseKt, 200) };
  if (type === "turboprop") {
    const alt = 25000 * 0.9;
    return { passengers: req.seats, cargo: 0, designRange: req.rangeNm, cruiseMach: Math.min(0.7, machAt(req.cruiseKt, alt)),
             takeoffFieldLengthM: req.runwayM, landingFieldLengthM: req.runwayM * 0.85 };
  }
  if (type === "bizjet") {
    return { economyClass: req.seats, firstClass: 0, businessClass: 0, cargo: 0, designRange: req.rangeNm,
             cruiseMach: Math.min(0.9, Math.max(0.6, machAt(req.cruiseKt, 41000))),
             takeoffFieldLengthM: req.runwayM, landingFieldLengthM: req.runwayM * 0.7 };
  }
  return { economyClass: req.seats, firstClass: 0, businessClass: 0, designRange: req.rangeNm,
           cruiseMach: Math.min(0.86, Math.max(0.5, machAt(req.cruiseKt, 35000))),
           takeoffFieldLengthM: req.runwayM, landingFieldLengthM: req.runwayM * 0.75 };
}

export function compareTypes(req, reference) {
  const env = typeEnvelopes(reference);
  return TYPE_IDS.map((id) => {
    const e = env[id];
    const reasons = [];
    const outside = (range, v, what, unit) => {
      if (range && (v < range[0] * 0.8 || v > range[1] * 1.2))
        reasons.push(`${what} ${Math.round(v)}${unit} is outside the ${Math.round(range[0])}-${Math.round(range[1])}${unit} built in this type (${e.n} reference aircraft)`);
    };
    outside(e.seats, req.seats, "seats", "");
    outside(e.rangeNm, req.rangeNm, "range", " nm");
    outside(e.speedKt, req.cruiseKt, "cruise speed", " kt");
    const params = requirementParams(id, req);
    let r = null, error = null;
    try { r = designAircraft({ type: id, mode: "size", params }); } catch (x) { error = x.message; }
    if (r && !r.converged) error = r.stopReason;
    const fuelPerSeatNm = r ? r.fuelKg / Math.max(1, req.seats) / Math.max(1, req.rangeNm) : NaN;
    return { id, label: typeOf(id).label, inEnvelope: reasons.length === 0, reasons, error, result: r,
             mtowKg: r?.mtowKg, fuelKg: r?.fuelKg, fuelPerSeatNm, speedKt: r?.cruise.speedKt,
             blockHours: r ? req.rangeNm / Math.max(1, r.cruise.speedKt) : NaN, params };
  });
}

/* ── the real aircraft around a design ───────────────────────────────── */

export function realityCheck(result, reference, k = 8) {
  const t = typeOf(result.type);
  const rows = reference.filter((r) => t.categories.includes(r.category) && Number.isFinite(r.mtow_kg));
  const lg = (v) => Math.log(Math.max(v, 1));
  const dist = (r) => {
    let d = (lg(r.mtow_kg) - lg(result.mtowKg)) ** 2 * 2;
    if (Number.isFinite(r.range_nm) && Number.isFinite(result.designRangeNm)) d += (lg(r.range_nm) - lg(result.designRangeNm)) ** 2;
    if (Number.isFinite(r.wing_area_m2)) d += (lg(r.wing_area_m2) - lg(result.wingAreaM2)) ** 2 * 0.5;
    return d;
  };
  const near = rows.map((r) => ({ r, d: dist(r) })).sort((a, b) => a.d - b.d).slice(0, k).map(({ r }) => r);
  /* Statistical placement: OEW / MTOW and wing loading against the same type. */
  const oewFrac = rows.filter((r) => Number.isFinite(r.oew_kg)).map((r) => ({ mtow: r.mtow_kg, frac: r.oew_kg / r.mtow_kg, name: `${r.model} ${r.variant ?? ""}`.trim() }));
  const wsRows = rows.filter((r) => Number.isFinite(r.wing_area_m2)).map((r) => ({ mtow: r.mtow_kg, ws: r.mtow_kg / r.wing_area_m2, name: `${r.model} ${r.variant ?? ""}`.trim() }));
  const pct = (arr, v) => (arr.length ? arr.filter((x) => x <= v).length / arr.length : NaN);
  return {
    near, count: rows.length, oewFraction: oewFrac, wingLoading: wsRows,
    design: { mtow: result.mtowKg, frac: result.oewKg / result.mtowKg, ws: result.wingLoadingKgM2 },
    percentile: { oewFraction: pct(oewFrac.map((x) => x.frac), result.oewKg / result.mtowKg),
                  wingLoading: pct(wsRows.map((x) => x.ws), result.wingLoadingKgM2) },
  };
}

/* The method's measured accuracy for each type, as the gates and the
   dataset runs found it (eVTOL_Sizing_Research/datasets/validation-runs/). */
export const METHOD_ACCURACY = Object.freeze({
  trainer: { massErrorPct: 5.7, basis: "empty weight of 3 trainers", summary: "Empty weight from gross, wing and engine: Cessna 172S −5.8 %, Skyhawk (1976) +4.8 %, Cherokee 180 +6.5 %. A 172S sized from its own requirements: gross +2.2 %.",
             gate: "validation/trainer.mjs" },
  turboprop: { massErrorPct: 7.1, basis: "operating empty mass of 3 turboprops", summary: "Operating empty mass: ATR 72-600 +14.8 %, ATR 42-600 +4.4 %, Dash 8-400 +2.0 % (FLOPS runs heavy on turboprops; the optional systems factor 0.858 gives +9.7 %, 0 %, −2.3 %). ATR 72 sized from its requirement: take-off mass +11 %.",
               gate: "validation/turboprop.mjs" },
  bizjet: { massErrorPct: 9.2, basis: "basic operating weight of 3 business jets",
            summary: "Basic operating weight: Citation Latitude +4.4 %, Citation Longitude −7.2 %, Pilatus PC-24 +15.9 %. Range with the published payload: +12 %, +22 %, −31 %. Wing loading from the landing constraint, on the Latitude's own published approach speed and landing weight: +8 %.",
            gate: "validation/bizjet.mjs" },
  transport: { massErrorPct: 9.6, basis: "take-off mass of 168 airliners sized from their requirements", summary: "Against 168 airliners (mission fuel, each engine's cruise TSFC, real engine location): MTOW mean +1.0 %, mean absolute error 9.6 %, 85 within ±5 %. THIS ROSE FROM 8.8 % ON PURPOSE. The landing constraint used to be Loftin's fitted line, which scored 8.9 % here but only by carrying a CLmax of 3.0 that is not a lift coefficient — k_L and CLmax were a matched pair and the fitted product was what worked. The line is now computed from 14 CFR 25.125 (V_REF = 1.23 V_SR0, an energy air distance from the 50 ft screen, an integrated braked ground roll, the 121.195(b) 60 % despatch factor), CLmax is the physical 2.35, and the cost is 0.7 points of absolute error and one aircraft out of the ±5 % band. What it buys is that CLmax is now free: a high-lift module can feed a computed lift coefficient straight in, which was impossible while k_L held the other half of the pair. The braking coefficient 0.50 is the one number still fitted, calibrated on these 168 aircraft rather than on one. 737-800 sized: MTOW −0.3 %, wing +4.9 %.",
               gate: "validation/transport.mjs" },
});

/* ── warnings and validation, one shape for every type ───────────────── */

export function typeWarnings(result) {
  const r = result.raw;
  if (result.type === "trainer") return trainerWarnings(r);
  if (result.type === "turboprop") return turbopropWarnings(r);
  if (result.type === "bizjet") return bizjetWarnings(r);
  return transportWarnings(r);
}

/* Rows { group, name, unit, actual, predicted, errPct }. Computed on demand
   (each class caches its own). */
export function typeValidation(type) {
  if (type === "trainer")
    return measuredEmptyWeightErrors().map((r) => ({ group: "Empty weight from gross, wing and engine", name: r.name, unit: "lb",
                                                     actual: r.actual, predicted: r.predicted, errPct: r.errPct }));
  if (type === "turboprop") {
    const m = measuredTurbopropChecks();
    return [...m.real.map((r) => ({ group: "Published aircraft", ...r })),
            ...m.block.map((r) => ({ group: "Block fuel (factsheets)", ...r })),
            ...m.sizing.map((r) => ({ group: "ATR 72 sized from its requirement", name: r.label, unit: r.unit, actual: r.actual, predicted: r.predicted, errPct: r.errPct }))];
  }
  if (type === "bizjet") return measuredBizjetChecks();
  const m = measuredTransportChecks();
  return [...m.real.map((r) => ({ group: "Published aircraft", ...r })),
          ...m.sizing.map((r) => ({ group: "737-800 sized from its requirements", name: r.label, unit: r.unit, actual: r.actual, predicted: r.predicted, errPct: r.errPct }))];
}
