/* =====================================================================
   TRAINER SIZING — a light piston aeroplane from its requirements
   =====================================================================
   Two entry points:

   analyzeTrainer(p)  An aircraft that exists: gross weight, wing area, span
                      and engine power are given. Returns its component
                      weights, empty weight and range. This is how the method
                      is checked against real aircraft.

   sizeTrainer(p)     A new aircraft from requirements, following Loftin's
                      matching procedure (NASA RP-1060 Fig. 6.1) and GASP's
                      closure (NASA CR-152303 Vol I Fig I.1.2):
                        1. the stall speed sets the wing loading;
                        2. cruise speed at the cruise power setting, and the
                           sea-level climb rate, each set a power; the larger
                           governs;
                        3. component weights (GASP), fuel for the mission
                           (Breguet) and the payload are summed, and the gross
                           weight is iterated until it stops moving.

   Empty weight follows the certification convention of the validation
   aircraft: it INCLUDES unusable fuel and full oil (FAA TCDS 3A12, 172S:
   "The certificated empty weight ... must include unusable fuel of 18
   pounds ... and full oil of 15.0 pounds").
   ===================================================================== */

import { TRAINER_DEFAULTS } from "./defaults.js";
import * as W from "./weights.js";
import * as P from "./performance.js";

const RESERVE_TOL_LB = 0.01;

function geometry(p, grossLb, wingAreaFt2, spanFt) {
  const taper = p.taper;
  const rootChord = 2 * wingAreaFt2 / (spanFt * (1 + taper));
  const mac = (2 / 3) * rootChord * (1 + taper + taper * taper) / (1 + taper);
  /* Tails from GASP volume coefficients, conventional tail (Vol II
     Eq II.1.24-30, S_AH = 0): V_H = 0.85 L_F w²/(S c̄) + 0.43, C_H2 = 0.271;
     V_V = 0.336 L_F h²/(S b) + 0.07, C_V2 = 1.862. */
  const L = p.fuselageLengthFt, w = p.fuselageWidthFt, h = p.fuselageDepthFt;
  const vH = 0.85 * L * w * w / (wingAreaFt2 * mac) + 0.43;
  const vV = 0.336 * L * h * h / (wingAreaFt2 * spanFt) + 0.07;
  const cH2 = 0.271, cV2 = 1.862;
  const htArea = Math.min(vH * wingAreaFt2 * cH2, wingAreaFt2 / 2);
  const vtArea = vV * wingAreaFt2 * cV2;
  const ht = { area: htArea, span: Math.sqrt(htArea * p.htAR), taper: p.tailTaper, tc: p.tailTc, arm: mac / cH2 };
  const vt = { area: vtArea, span: Math.sqrt(vtArea * p.vtAR), taper: p.tailTaper, tc: p.tailTc, arm: spanFt / cV2 };
  const wetted = W.fuselageWettedArea({ lengthFt: L, widthFt: w, depthFt: h });
  return { wingAreaFt2, spanFt, AR: spanFt * spanFt / wingAreaFt2, rootChord, mac,
           wingLoading: grossLb / wingAreaFt2, ht, vt, vH, vV, fuselageWettedFt2: wetted };
}

/* Component weights for a given aircraft. `fuelLb` is the design fuel that
   sizes the fuel system and sits in the wing. */
function weights(p, grossLb, geo, hp, fuelLb) {
  const pol = P.polar(p);
  const loads = W.designLoads({ category: p.category, wingLoading: geo.wingLoading,
                                maxStructSpeedKt: p.vnoKt, meanChordFt: geo.mac, AR: geo.AR });
  const U = loads.ultimate, vd = loads.vdKt;
  const wing = W.wingWeight({ grossLb, ultimate: U, spanFt: geo.spanFt, taper: p.taper, tcRoot: p.tcRoot,
                              strutFraction: p.strutFraction, gearOnWing: false, skWW: p.skWW,
                              highLiftLb: p.highLiftLb });
  const tails = W.tailWeights({ grossLb, vdKt: vd, fuselageLengthFt: p.fuselageLengthFt, wingSpanFt: geo.spanFt,
                                ht: geo.ht, vt: geo.vt, skY: p.skY, skZ: p.skZ });
  /* W_X, "fuselage and contents": gross less the wing and what the wing
     carries (Aviary FuelSysAndFullFuselageMass). Fuel is in the wing; the
     engine and gear are on the fuselage. */
  const contents = grossLb - wing.wingLb - fuelLb;
  const fuselage = W.fuselageWeight({ contentsLb: contents, wettedFt2: geo.fuselageWettedFt2,
                                      widthFt: p.fuselageWidthFt, lengthFt: p.fuselageLengthFt,
                                      vdKt: vd, ultimate: U, skB: p.skB });
  const gear = W.landingGearWeight({ grossLb, skLG: p.skLG });
  const engine = W.pistonEngineWeight({ hp, specificLbHp: p.engineLbPerHp });
  const engineSection = p.engineSectionFrac * engine;
  const cruiseMach = P.machOf(p.cruiseKt, p.cruiseAltFt);
  const propeller = W.propellerWeight({ diameterFt: p.propDiameterIn / 12, blades: p.propBlades,
                                        activityFactor: p.propActivityFactor, rpm: p.propRpm, shp: hp,
                                        mach: cruiseMach, kind: p.propKind });
  const fuelSystem = W.fuelSystemWeight({ fuelLb, fuelDensityLbGal: p.fuelDensityLbGal, skFS: p.skFS });
  const controls = W.flightControlsWeight({ wingAreaFt2: geo.wingAreaFt2, grossLb, ultimate: U, vdKt: vd,
                                            skFW: p.skFW, skCC: p.skCC });
  const equipment = W.fixedEquipment({ grossLb, pax: p.pax, fuselageLengthFt: p.fuselageLengthFt,
                                       wingSpanFt: geo.spanFt, fuselageWidthFt: p.fuselageWidthFt,
                                       fixedGear: p.fixedGear,
                                       controlsLb: controls.totalLb, gearLb: gear,
                                       cwInstruments: p.cwInstruments, cwHydControls: p.cwHydControls,
                                       cwHydGear: 0, cwAirCond: p.cwAirCond });
  const groups = {
    wing: wing.wingLb, horizontalTail: tails.horizontalLb, verticalTail: tails.verticalLb,
    fuselage, landingGear: gear,
    engine, engineSection, propeller, fuelSystem,
    flightControls: controls.totalLb, equipment: equipment.totalLb,
    unusableFuel: p.unusableFuelLb, oil: p.oilLb,
  };
  const emptyLb = Object.values(groups).reduce((a, b) => a + b, 0);
  const alt = { fuselageFLOPS: W.fuselageWeightFLOPS({ wettedFt2: geo.fuselageWettedFt2, ultimate: U,
                grossLb, cruiseQ: P.dynamicPressure(p.cruiseKt, p.cruiseAltFt) }) };
  return { groups, emptyLb, loads, equipment, wing, controls, alt, pol };
}

function missionFuel(p, grossLb, geo, hp) {
  const pol = P.polar(p);
  const climbPol = P.polar({ ...p, e: p.eClimb });
  /* Climb to cruise altitude at rated power: time from Loftin (6.15) at the
     mid altitude, fuel at the cruise sfc (Table 6.III gives cruise values
     only; this is stated in the result). */
  const midAlt = p.cruiseAltFt / 2;
  const midHp = hp * P.pistonPowerRatio(midAlt);
  const roc = P.rateOfClimb({ weightLb: grossLb, wingLoading: geo.wingLoading, hp: midHp,
                              altFt: midAlt, pol: climbPol, eta: p.etaClimb });
  const climbMin = roc > 0 ? p.cruiseAltFt / roc : Infinity;
  const climbLb = p.sfc * midHp * climbMin / 60;
  const allowanceLb = p.allowanceGal * p.fuelDensityLbGal;
  const cruiseStart = grossLb - allowanceLb - climbLb;
  const cr = P.levelFlight({ weightLb: cruiseStart, wingAreaFt2: geo.wingAreaFt2, vKt: p.cruiseKt,
                             altFt: p.cruiseAltFt, pol, eta: p.etaCruise });
  const cruiseLb = P.breguetFuel({ rangeNm: p.rangeNm, startWeightLb: cruiseStart,
                                   eta: p.etaCruise, sfc: p.sfc, LD: cr.LD });
  const reserveLb = p.sfc * cr.shaftHp * p.reserveMin / 60;
  const usableLb = allowanceLb + climbLb + cruiseLb + reserveLb;
  return { usableLb, allowanceLb, climbLb, climbMin, cruiseLb, reserveLb, cruise: cr, rocMidFpm: roc };
}

function resolve(p) {
  const q = { ...TRAINER_DEFAULTS, ...(p || {}) };
  for (const [k, v] of Object.entries(TRAINER_DEFAULTS))
    if (typeof v === "number" && !Number.isFinite(Number(q[k])))
      throw new Error(`Trainer input "${k}" must be a finite number (got ${q[k]})`);
  return q;
}

/* Range (nm) taking off at grossLb with fuelLb usable fuel, by the same
   mission (allowance, climb, Breguet cruise, reserve) as the sizing. */
export function trainerRangeAt(result, grossLb, fuelLb) {
  const p = result.inputs, geo = result.geometry, hp = result.hp;
  if (!(fuelLb > 0) || !(grossLb > 0)) return 0;
  const need = (R) => missionFuel({ ...p, rangeNm: R }, grossLb, geo, hp).usableLb;
  if (need(0) >= fuelLb) return 0;
  let lo = 0, hi = 5000;
  for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (need(mid) < fuelLb) lo = mid; else hi = mid; }
  return lo;
}

export function analyzeTrainer(input) {
  const p = resolve(input);
  const { grossLb, wingAreaFt2, spanFt, hp } = p;
  for (const [k, v] of Object.entries({ grossLb, wingAreaFt2, spanFt, hp }))
    if (!(v > 0)) throw new Error(`analyzeTrainer needs ${k} > 0`);
  const geo = geometry({ ...p, taper: p.taper }, grossLb, wingAreaFt2, spanFt);
  const fuelLb = p.usableFuelLb ?? missionFuel(p, grossLb, geo, hp).usableLb;
  const wt = weights(p, grossLb, geo, hp, fuelLb);
  const pol = P.polar(p);
  const allowanceLb = p.allowanceGal * p.fuelDensityLbGal;
  const cr = P.levelFlight({ weightLb: grossLb, wingAreaFt2, vKt: p.cruiseKt, altFt: p.cruiseAltFt, pol, eta: p.etaCruise });
  return {
    mode: "analysis", grossLb, hp, fuelLb, geometry: geo, ...wt,
    usefulLoadLb: grossLb - wt.emptyLb,
    cruise: cr, cruisePowerFrac: cr.shaftHp / hp,
    stallKt: P.stallSpeedKt({ wingLoading: geo.wingLoading, clMax: p.clMaxLanding }),
    rocSeaLevelFpm: P.rateOfClimb({ weightLb: grossLb, wingLoading: geo.wingLoading, hp, altFt: 0,
                                    pol: P.polar({ ...p, e: p.eClimb }), eta: p.etaClimb }),
    inputs: p, allowanceLb,
  };
}

export function sizeTrainer(input) {
  const p = resolve(input);
  const wingLoading = P.stallWingLoading({ vsKt: p.stallKt, clMax: p.clMaxLanding });
  const payloadLb = (p.pax + 1) * p.massPerOccupantLb;
  let gross = 2 * payloadLb + 1000, last = null, iters = 0, converged = false, stopReason = "iteration limit";
  const history = [];
  for (; iters < 200; iters++) {
    const S = gross / wingLoading;
    const b = Math.sqrt(p.AR * S);
    const geo = geometry(p, gross, S, b);
    const pol = P.polar(p);
    const cr = P.levelFlight({ weightLb: gross, wingAreaFt2: S, vKt: p.cruiseKt, altFt: p.cruiseAltFt,
                               pol, eta: p.etaCruise });
    /* "75% power" is 75% of RATED power (the POH's 75% at 8,500 ft is
       135 hp of a 180 hp engine); the altitude lapse only limits whether
       that setting is available there, which is checked below. */
    const hpCruise = cr.shaftHp / p.cruisePowerFrac;
    const hpClimb = P.climbPowerRequired({ weightLb: gross, wingLoading, rocFpm: p.rocFpm, altFt: 0,
                                           pol: P.polar({ ...p, e: p.eClimb }), eta: p.etaClimb });
    const hp = Math.max(hpCruise, hpClimb);
    const fuel = missionFuel(p, gross, geo, hp);
    const wt = weights(p, gross, geo, hp, fuel.usableLb);
    const next = wt.emptyLb + payloadLb + fuel.usableLb;
    history.push(next);
    last = { S, b, geo, hp, hpCruise, hpClimb, fuel, wt };
    if (!Number.isFinite(next) || next > W.TRAINER_MAX_GROSS_LB) {
      stopReason = `gross weight grew past ${W.TRAINER_MAX_GROSS_LB} lb, the upper limit of this class's equipment equations`;
      break;
    }
    if (Math.abs(next - gross) < RESERVE_TOL_LB) { gross = next; converged = true; stopReason = null; break; }
    gross = gross + 0.7 * (next - gross);
  }
  const { geo, hp, hpCruise, hpClimb, fuel, wt } = last;
  const lapse = P.pistonPowerRatio(p.cruiseAltFt);
  return {
    cruisePowerAvailable: lapse >= p.cruisePowerFrac, cruiseAltitudePowerRatio: lapse,
    mode: "sizing", converged, stopReason, iterations: iters + 1, toleranceLb: RESERVE_TOL_LB,
    grossLb: gross, emptyLb: wt.emptyLb, payloadLb, fuelLb: fuel.usableLb,
    wingAreaFt2: geo.wingAreaFt2, spanFt: geo.spanFt, wingLoading, hp,
    powerGovernedBy: hpCruise >= hpClimb ? "cruise" : "climb", hpCruise, hpClimb,
    geometry: geo, ...wt, fuel, inputs: p,
  };
}
