/* =====================================================================
   TRANSPORT GATE — the jet-transport class, checked four ways
   =====================================================================
   1. IMPLEMENTATION. The FLOPS weight port gives, component by component,
      the weights NASA's FLOPS computed for the 737-800 model in Aviary's
      large_single_aisle_2 data (inputs and outputs copied below). Tolerance
      0.1%: the reference values are printed to four or five figures.
   2. IDENTITIES. Matching and closure do what they say.
   3. VALIDATION. Published aircraft (see validation-cases.js), and a
      737-800 sized from its own requirements. Bands were set after the first
      measurement; the errors are printed every run.
   4. INPUTS. Every input states its source status.
   ===================================================================== */

import { flopsWeights } from "../src/classes/transport/flops-weights.js";
import { sizeTransport, analyzeTransport, matching, cruiseThrustRatio } from "../src/classes/transport/size.js";
import { TRANSPORT_INPUTS, TRANSPORT_DEFAULTS } from "../src/classes/transport/defaults.js";
import { TRANSPORT_REAL_CASES, B738_SIZING_TARGETS } from "../src/classes/transport/validation-cases.js";
import { classOf, sizeDesign } from "../src/classes/registry.js";
import { transportWarnings } from "../src/classes/transport/warnings.js";
import { takeoffFieldLength, takeoffThrustToWeight } from "../src/classes/transport/takeoff.js";
import { deckShape } from "../src/classes/transport/engine-deck.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const pct = (a, b) => `${((a / b - 1) * 100).toFixed(2)}%`;

console.log("TRANSPORT GATE");
console.log("=".repeat(72));

/* ── 1. implementation: Aviary large_single_aisle_2 (FLOPS) ─────────── */
console.log("\n1. FLOPS port against FLOPS output (Aviary large_single_aisle_2, a 737-800 model)");
const LSA2 = {
  grossWeight: 174200, maxMach: 0.82, designRange: 2960, landingToTakeoffRatio: 0.84, emptyMarginFraction: 0.00514,
  passengers: 162, firstClass: 12, businessClass: 0, economyClass: 150, flightCrew: 2, flightAttendants: 5, galleyCrew: 1,
  massPerPassenger: 165, baggagePerPassenger: 35, cargo: 4077, fuelCapacity: 46063, fuelDensity: 6.7, fuelTanks: 7,
  fuselageLength: 124.75, fuselageWidth: 12.33, fuselageHeight: 13.0208, passengerCompartmentLength: 98.5, militaryCargoFloor: false,
  htArea: 407.335370699457, htAspectRatio: 5.444, htTaper: 0.3008, htTc: 0.1195, htOnVtFraction: 0,
  vtArea: 284.499779284585, vtAspectRatio: 2.2262, vtTaper: 0.21082082638898, vtTc: 0.137459440381375, numVerticalTails: 1,
  wingArea: 1341, wingAspectRatio: 9.45, wingSpan: 112.57, wingSweep: 25.03, wingTaper: 0.237343146184852, wingTc: 0.131732727515702,
  ultimateLoadFactor: 3.75, strutBracing: 0, aeroelasticTailoring: 0, compositeFraction: 0, varSweep: 0, wingLoadFraction: 1,
  controlSurfaceAreaRatio: 0.333, mainGearOleoIn: 84, noseGearOleoIn: 58.8, nacelleDiameter: 7, nacelleLength: 11.65,
  paintPerArea: 0.07, engineRefMass: 8071.35, engineRefThrust: 27301, engineSlsThrust: 27301, engineMassExponent: 1.15,
  numEngines: 2, numWingEngines: 2, numFuselageEngines: 0, hydraulicPressure: 3000,
};
const LSA2_WETTED_OVERRIDE = { wing: 2423.02, horizontalTail: 707.706, verticalTail: 589.35, fuselage: 4142.317 };
const LSA2_OUT = {
  wing: 15288, horizontalTail: 1931.8, verticalTail: 1035.6, fuselage: 16790, gear: 7148.277290864326,
  nacelles: 2 * 806.0988, paint: 582.3, engines: 16143, thrustReversers: 1856.4, miscellaneous: 550.4,
  fuelSystem: 682.7, surfaceControls: 1835.0, apu: 1014.0, instruments: 484.0, hydraulics: 1075.3,
  electrical: 1935.6, avionics: 1339.4, furnishings: 14690, airConditioning: 1603.75, antiIcing: 195.93,
  flightCrew: 450, cabinCrew: 975, unusableFuel: 497.7, oil: 125.42, passengerService: 2787.30285438,
  cargoContainers: 1925, structure: 44389, propulsion: 19232, systems: 24174, margin: 451.3, empty: 88246,
  operatingItems: 6760.42285438, operatingEmpty: 95007, payload: 36477, zeroFuel: 131484,
};
{
  const r = flopsWeights(LSA2, LSA2_WETTED_OVERRIDE);
  const got = { ...r.structure, gear: r.structure.mainGear + r.structure.noseGear, ...r.propulsion,
                ...r.systems, ...r.operating, ...r.totals };
  const bad = Object.entries(LSA2_OUT).filter(([k, v]) => !(rel(got[k], v) <= 1e-3));
  const worst = Object.entries(LSA2_OUT).map(([k, v]) => [k, rel(got[k], v)]).sort((a, b) => b[1] - a[1])[0];
  check(`all ${Object.keys(LSA2_OUT).length} FLOPS weights reproduced within 0.1%`, bad.length === 0,
        bad.length ? bad.map(([k, v]) => `${k} ${got[k]?.toFixed(1)} vs ${v}`).join("; ")
                   : `worst ${worst[0]} ${(worst[1] * 100).toFixed(3)}%`);
  check("wing bending material factor is FLOPS's 8.8294 (Eq 10 as Aviary computes it)",
        Math.abs(r.detail.bendingMaterialFactor - 8.8294) < 1e-3, r.detail.bendingMaterialFactor.toFixed(4));
  check("landing weight is 0.84 × gross (146,328 lb)", Math.abs(r.detail.landingWeight - 146328) < 1);
  check("nacelle wetted area is FLOPS's 228.34 ft² each (2.8 D L)", Math.abs(r.detail.wetted.nacelles / 2 - 228.34) < 0.01);
  const noLanding = flopsWeights({ ...LSA2, landingToTakeoffRatio: undefined });
  check("without a landing ratio, FLOPS Eq 65 is used: 1 − 4e-5 × range",
        Math.abs(noLanding.detail.landingWeight - 174200 * (1 - 4e-5 * 2960)) < 1e-6);
}

/* ── 2. identities ──────────────────────────────────────────────────── */
console.log("\n2. Identities");
{
  const m = matching(TRANSPORT_DEFAULTS);
  /* The landing constraint is computed from 25.125 now, not fitted, so the
     Loftin identity is checked on the path that still uses it. The formula
     is unchanged and still locked; what changed is which line ships. */
  const mLoftin = matching({ ...TRANSPORT_DEFAULTS, landingMethod: "loftin", clMaxLanding: 3.0 });
  check("the Loftin landing line, where selected, is still 0.107 × CLmax,L × s_LFL (Scholz 5.5)",
        Math.abs(mLoftin.wsLanding - 0.107 * 3.0 * 1650) < 1e-9);
  /* And the shipped line is the computed one, which must NOT equal it. */
  check("the shipped landing line is the 25.125 computation, not the fitted one",
        TRANSPORT_DEFAULTS.landingMethod === "far25"
        && Math.abs(m.wsLanding - mLoftin.wsLanding) / mLoftin.wsLanding > 0.02,
        `25.125 gives ${m.wsLanding.toFixed(1)} kg/m² at MLW against Loftin's ${mLoftin.wsLanding.toFixed(1)}`);
  check("take-off T/W is (m/S) × 2.34 / (s_TOFL × CLmax,TO) (Scholz 5.10)",
        Math.abs(m.twTakeoff - m.wsTakeoff * 2.34 / (2195 * 2.0)) < 1e-12);
  check("second-segment T/W uses the 25.121(b) gradient for twins, 2.4%",
        Math.abs(m.twSecond - 2 * (1 / m.e2 + 0.024)) < 1e-12);
  check("flap drag at CL 1.3 / 1.5 / 1.7 is Loftin's 0.01 / 0.02 / 0.03 (Scholz 5.21b)", (() => {
    const f = (cl) => 0.05 * cl - 0.055;
    return [[1.3, 0.01], [1.5, 0.02], [1.7, 0.03]].every(([c, v]) => Math.abs(f(c) - v) < 1e-12);
  })());
  check("thrust lapse, Scholz 5.28 (per km) and 5.29 (per ft) agree",
        Math.abs(cruiseThrustRatio(5, 35000) - ((0.0013 * 5 - 0.0397) * (35000 * 0.3048 / 1000) - 0.0248 * 5 + 0.7125)) < 2e-4);
  const s = sizeTransport({});
  check("the default transport converges", s.converged, `${s.iterations} iterations`);
  check("gross = zero-fuel + mission fuel", Math.abs(s.grossLb - (s.zeroFuelLb + s.fuelLb)) < 1, `${s.grossLb.toFixed(1)}`);
  check("wing area sits on the landing limit (to the closure tolerance)",
        rel(s.grossLb * 0.45359237 / (s.wingAreaFt2 * 0.09290304), s.wingLoadingKgM2) < 1e-5);
  check("thrust meets every requirement", s.thrustToWeight >= Math.max(s.constraints.twTakeoff, s.constraints.twSecond,
        s.constraints.twMissed, s.constraints.twCruise) - 1e-12, s.thrustGovernedBy);
  check("sizeDesign dispatches the transport class", classOf("transport").size === sizeTransport
        && Math.abs(sizeDesign({ aircraftClass: "transport", params: {} }).grossLb - s.grossLb) < 1e-9);
  check("more range needs a heavier aircraft", sizeTransport({ designRange: 3500 }).grossLb > s.grossLb);
  {
    const lof = sizeTransport({ fuelMethod: "loftin" });
    const noRes = sizeTransport({ fuelMethod: "loftin", reserveIncrementNm: 0 });
    const f = lof.fuel, expected = 1 - Math.exp(-((2960 + 500) * 1852) / (f.breguetKm * 1000));
    check("Loftin fuel fraction is 1 − exp(−(R + ΔR_reserve)/B) with the 500 nm increment",
          Math.abs(lof.fuelLb / lof.grossLb - expected) < 1e-5, `${(lof.fuelLb / lof.grossLb).toFixed(5)} vs ${expected.toFixed(5)}`);
    check("the reserve increment carries fuel (none gives a lighter aircraft)", noRes.fuelLb < lof.fuelLb && noRes.grossLb < lof.grossLb);
  }
  check("the regulatory fuel method carries more fuel than Loftin's", sizeTransport({ fuelMethod: "regulatory" }).grossLb > s.grossLb);
  let threw = false; try { sizeTransport({ fuelMethod: "guess" }); } catch { threw = true; }
  check("an unknown fuel method is refused", threw);
  threw = false; try { sizeTransport({ numEngines: 1 }); } catch { threw = true; }
  check("a single-engine transport is refused (the OEI rules need two or more)", threw);
  const far = sizeTransport({ designRange: 30000 });
  check("an impossible mission (30,000 nm) is reported as not converged, with a reason",
        far.converged === false && typeof far.stopReason === "string");
}

{
  /* Fuel volume as a constraint (FLOPS/Aviary excess fuel capacity ≥ 0).
     A 5,000 nm 737-800 does not hold its own fuel in its wing; turning the
     constraint on has to lower the wing loading below the landing limit
     until it does, and must leave an aircraft that already fits alone. */
  const near = sizeTransport({});
  const onNear = sizeTransport({ fuelVolumeConstraint: true });
  /* Not bit-identical: with the constraint on, the wing grows in the early
     iterations, when the guessed gross weight is far too low for the tanks,
     and relaxes back to the landing limit as the loop closes. The path
     differs, so the fixed point lands a fraction of the closure tolerance
     away. What matters is that the answer is the same aircraft. */
  check("the fuel-volume constraint leaves an aircraft whose tanks already hold the mission untouched",
        near.fuelFits && onNear.wingGrownForFuel === false
        && Math.abs(onNear.grossLb - near.grossLb) < near.toleranceLb
        && rel(onNear.wingAreaFt2, near.wingAreaFt2) < 1e-6
        && onNear.wingLoadingKgM2 === near.wingLoadingKgM2,
        `${(near.fuelCapacityLb - near.fuelLb).toFixed(0)} lb of spare capacity; `
        + `gross differs by ${Math.abs(onNear.grossLb - near.grossLb).toFixed(3)} lb against a ${near.toleranceLb} lb closure tolerance`);
  const off = sizeTransport({ designRange: 5000 });
  const on = sizeTransport({ designRange: 5000, fuelVolumeConstraint: true });
  check("a 5,000 nm stage does not fit in the wing of a 737-800 sized to the landing limit",
        off.converged && off.fuelFits === false,
        `needs ${off.fuelLb.toFixed(0)} lb, holds ${off.fuelCapacityLb.toFixed(0)} lb`);
  check("the constraint grows the wing until the fuel fits, and lowers the wing loading to do it",
        on.converged && on.fuelFits && on.wingGrownForFuel
        && on.wingAreaFt2 > off.wingAreaFt2 && on.wingLoadingKgM2 < off.wingLoadingKgM2
        && Math.abs(on.fuelCapacityLb - on.fuelLb) / on.fuelLb < 0.02,
        `wing ${(off.wingAreaFt2 * 0.0929).toFixed(1)} → ${(on.wingAreaFt2 * 0.0929).toFixed(1)} m², `
        + `W/S ${off.wingLoadingKgM2.toFixed(1)} → ${on.wingLoadingKgM2.toFixed(1)} kg/m², `
        + `capacity ${(on.fuelCapacityLb * 0.45359237).toFixed(0)} vs fuel ${(on.fuelLb * 0.45359237).toFixed(0)} kg`);
  check("growing the wing never raises the wing loading above the landing limit",
        on.wingLoadingKgM2 <= on.constraints.wsLandingLimit + 1e-9,
        `${on.wingLoadingKgM2.toFixed(1)} vs landing limit ${on.constraints.wsLandingLimit.toFixed(1)} kg/m²`);
}

{
  /* Initial cruise altitude with a residual rate of climb (SUGAR Table 5.3
     "ROC at ICA (fpm): 300"). The tool's cruise line is a zero-rate ceiling,
     so without this an aircraft can be sized that cannot reach the altitude
     it is said to cruise at. */
  const base = sizeTransport({});
  const off = sizeTransport({ icaRequirement: "off" });
  check("the requirement is on by default, and tied to the aircraft's own cruise altitude",
        TRANSPORT_DEFAULTS.icaRequirement === "cruise-altitude"
        && base.constraints.icaAltFt === TRANSPORT_DEFAULTS.cruiseAltFt
        && off.constraints.twIca === 0,
        `default requirement ${base.constraints.icaAltFt} ft, cruise altitude ${TRANSPORT_DEFAULTS.cruiseAltFt} ft`);
  check("turning it off drops the line entirely",
        off.constraints.twIca === 0 && off.thrustGovernedBy !== "initial cruise altitude");
  /* The audit's 0.3227 was computed on the Loftin landing line, so it is
     cross-checked against that configuration — a reference value has to be
     evaluated at the conditions it was produced under. The shipped line
     sizes a slightly larger wing, whose lower wing loading needs slightly
     less thrust at altitude, and that is checked separately below. */
  const at35Loftin = sizeTransport({ icaRequirement: "explicit", initialCruiseAltReqFt: 35000,
                                     landingMethod: "loftin", clMaxLanding: 3.0 });
  check("at the cruise altitude the requirement is the cruise line plus the residual climb",
        at35Loftin.constraints.twIca > at35Loftin.constraints.twCruise
        && Math.abs(at35Loftin.constraints.twIca - 0.3227) < 0.002,
        `T/W ${at35Loftin.constraints.twIca.toFixed(4)} against the cruise line's `
        + `${at35Loftin.constraints.twCruise.toFixed(4)}; the industry audit computes 0.3227 for this aircraft`);
  const at35 = sizeTransport({ icaRequirement: "explicit", initialCruiseAltReqFt: 35000 });
  check("on the shipped 25.125 line the bigger wing needs slightly less thrust at altitude",
        at35.constraints.twIca > at35.constraints.twCruise
        && at35.constraints.twIca < at35Loftin.constraints.twIca
        && at35.wingAreaFt2 > at35Loftin.wingAreaFt2,
        `T/W ${at35.constraints.twIca.toFixed(4)} on a ${(at35.wingAreaFt2 * 0.09290304).toFixed(1)} m² wing, `
        + `against ${at35Loftin.constraints.twIca.toFixed(4)} on ${(at35Loftin.wingAreaFt2 * 0.09290304).toFixed(1)} m²`);
  /* Not bit-identical, for the same reason as the fuel-volume constraint:
     the line can bind in the early iterations, before the weight settles, so
     the loop takes a different path to the same fixed point. */
  check("a requirement the take-off line already covers does not change the aircraft",
        at35.constraints.twIca < at35.constraints.twTakeoff
        && at35.thrustGovernedBy === "take-off"
        && rel(at35.thrustEachLbf, base.thrustEachLbf) < 1e-6
        && Math.abs(at35.grossLb - base.grossLb) < base.toleranceLb,
        `thrust differs by ${(at35.thrustEachLbf - base.thrustEachLbf).toFixed(4)} lbf`);
  const at39 = sizeTransport({ icaRequirement: "explicit", initialCruiseAltReqFt: 39000 });
  check("a higher initial cruise altitude governs the engine and grows it",
        at39.thrustGovernedBy === "initial cruise altitude"
        && at39.thrustEachLbf > base.thrustEachLbf * 1.15 && at39.grossLb > base.grossLb,
        `thrust ${base.thrustEachLbf.toFixed(0)} → ${at39.thrustEachLbf.toFixed(0)} lbf, `
        + `MTOW ${(base.grossLb * 0.45359237).toFixed(0)} → ${(at39.grossLb * 0.45359237).toFixed(0)} kg`);
  const noRoc = sizeTransport({ icaRequirement: "explicit", initialCruiseAltReqFt: 39000, icaResidualRocFpm: 0 });
  check("the residual rate of climb is what makes it bite",
        noRoc.constraints.twIca < at39.constraints.twIca,
        `300 ft/min: ${at39.constraints.twIca.toFixed(4)}, 0 ft/min: ${noRoc.constraints.twIca.toFixed(4)}`);
  /* Buffet is the user's number: no public correlation was found, so the
     check exists but never fires on an assumed value. */
  const noLimit = transportWarnings(at35).filter((w) => w.category === "omission" && /buffet/i.test(w.text));
  const tight = transportWarnings(sizeTransport({ buffetClLimit: 0.55 }))
    .filter((w) => /Buffet/.test(w.text) && w.level === "caution");
  check("with no buffet limit entered the omission is stated and nothing is assumed",
        noLimit.length === 1 && /no verified public buffet/.test(noLimit[0].text));
  check("a buffet limit the design breaches is reported against the 1.3 g margin", tight.length === 1,
        tight[0]?.text?.slice(0, 96));
}

{
  /* Take-off field length from the run itself (14 CFR 25.109(a), 25.113(a))
     rather than Loftin's statistical line. Off by default: it is the better
     field-length model of the two but it underpredicts by about 8 %, which
     biases the sized aircraft light. */
  check("the statistical take-off line is still the default", TRANSPORT_DEFAULTS.takeoffMethod === "loftin");
  const b = takeoffFieldLength(TRANSPORT_DEFAULTS, 634.2, 2 * 27300 / 174200);
  check("the 737-800's published field length is reproduced within 3 %",
        Math.abs(b.fieldLengthM / 2195 - 1) < 0.03,
        `${b.fieldLengthM.toFixed(0)} m vs 2,195 m published (${((b.fieldLengthM / 2195 - 1) * 100).toFixed(1)} %); `
        + `Loftin on the same aircraft is +7.9 %`);
  /* 25.109(a)(1)(ii) has the aeroplane accelerate past V1 to "the highest
     speed reached during the rejected takeoff", and (a)(1)(iii) stops it
     from that speed. Stopping from V1 instead was worth about 5 points of
     field length: the 737-800 read -6.3 % before this was modelled. */
  check("the rejected take-off reaches a speed above V1, and stops from there",
        b.vMaxRto > b.v1 * 1.005 && b.vMaxRto <= b.vr * 1.02,
        `V1 ${(b.v1 / 0.514444).toFixed(1)} kt, highest speed reached `
        + `${(b.vMaxRto / 0.514444).toFixed(1)} kt`);
  check("a longer interval to full braking makes the field longer, and none makes it shorter",
        takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakeTransitionS: 3 }, 634.2, 2 * 27300 / 174200).fieldLengthM
          > b.fieldLengthM
        && takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakeTransitionS: 0 }, 634.2, 2 * 27300 / 174200).fieldLengthM
          < b.fieldLengthM,
        `0 s: ${takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakeTransitionS: 0 }, 634.2, 2 * 27300 / 174200).fieldLengthM.toFixed(0)} m, `
        + `2 s: ${b.fieldLengthM.toFixed(0)} m, `
        + `3 s: ${takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakeTransitionS: 3 }, 634.2, 2 * 27300 / 174200).fieldLengthM.toFixed(0)} m`);
  /* 25.109(b)(2)(ii): the normal load is shared between braked and unbraked
     wheels, and only the braked share retards the aeroplane. */
  check("only the braked wheels retard it, so an all-braked aeroplane stops shorter",
        takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakedWeightFraction: 1 }, 634.2, 2 * 27300 / 174200).fieldLengthM
          < b.fieldLengthM,
        `0.92 of the load braked: ${b.fieldLengthM.toFixed(0)} m, all of it: `
        + `${takeoffFieldLength({ ...TRANSPORT_DEFAULTS, brakedWeightFraction: 1 }, 634.2, 2 * 27300 / 174200).fieldLengthM.toFixed(0)} m`);
  check("the take-off line falls with engine count, which the statistical line cannot see",
        takeoffThrustToWeight({ ...TRANSPORT_DEFAULTS, numEngines: 4 }, 700, 2500)
          < takeoffThrustToWeight({ ...TRANSPORT_DEFAULTS, numEngines: 2 }, 700, 2500) * 0.85,
        `T/W for a 2,500 m field at W/S 700: twin `
        + `${takeoffThrustToWeight({ ...TRANSPORT_DEFAULTS, numEngines: 2 }, 700, 2500).toFixed(3)}, quad `
        + `${takeoffThrustToWeight({ ...TRANSPORT_DEFAULTS, numEngines: 4 }, 700, 2500).toFixed(3)}; `
        + "Loftin gives the same number for both");
  check("the field length is balanced: accelerate-stop equals the take-off distance at the chosen V1",
        b.balanced && Math.abs(b.accelStopM - b.takeoffOeiM) / b.fieldLengthM < 0.01,
        `accelerate-stop ${b.accelStopM.toFixed(0)} m, take-off distance ${b.takeoffOeiM.toFixed(0)} m, `
        + `V1 ${(b.v1 / 0.514444).toFixed(1)} kt`);
  check("V1 lies between the stall speed and the rotation speed, as 25.107(e)(1)(i) requires",
        b.v1 <= b.vr + 1e-9 && b.v1 > b.vs, `V1 ${(b.v1 / 0.514444).toFixed(1)} kt, `
        + `VR ${(b.vr / 0.514444).toFixed(1)} kt, VS ${(b.vs / 0.514444).toFixed(1)} kt`);
  check("VEF is below V1 by the speed gained in the recognition interval (25.107(a)(2))",
        b.vef < b.v1 && b.vef > 0.9 * b.v1,
        `VEF ${(b.vef / 0.514444).toFixed(1)} kt against V1 ${(b.v1 / 0.514444).toFixed(1)} kt`);
  check("a longer runway needs less thrust, and a shorter one more",
        takeoffThrustToWeight(TRANSPORT_DEFAULTS, 634.2, 3000) < takeoffThrustToWeight(TRANSPORT_DEFAULTS, 634.2, 2195)
        && takeoffThrustToWeight(TRANSPORT_DEFAULTS, 634.2, 1600) > takeoffThrustToWeight(TRANSPORT_DEFAULTS, 634.2, 2195));
  {
    const tw = takeoffThrustToWeight(TRANSPORT_DEFAULTS, 630.5, 2195);
    check("solving for the thrust that makes a field length inverts the field-length calculation",
          Math.abs(takeoffFieldLength(TRANSPORT_DEFAULTS, 630.5, tw).fieldLengthM - 2195) < 1,
          `T/W ${tw.toFixed(4)} gives ${takeoffFieldLength(TRANSPORT_DEFAULTS, 630.5, tw).fieldLengthM.toFixed(1)} m`);
  }
  check("thrust falls with speed along the run, so the method is not a static-thrust one",
        deckShape(0.2, 0).maxThrustRatio < deckShape(0, 0).maxThrustRatio,
        `deck gives ${deckShape(0.2, 0).maxThrustRatio.toFixed(3)} of static thrust at M 0.2`);
  const far = sizeTransport({ takeoffMethod: "far25" });
  check("sizing with it gives a thrust closer to the real engine than the statistical line does",
        Math.abs(far.thrustEachLbf / 27301 - 1) < Math.abs(sizeTransport({}).thrustEachLbf / 27301 - 1),
        `far25 ${((far.thrustEachLbf / 27301 - 1) * 100).toFixed(1)} % against loftin `
        + `${((sizeTransport({}).thrustEachLbf / 27301 - 1) * 100).toFixed(1)} %`);
  /* And the measured cost of that, which is why it is not the default. */
  check("but it sizes the fleet lighter, which is the recorded reason it is opt-in",
        far.grossLb < sizeTransport({}).grossLb,
        "over the 168-aircraft dataset, both with the cruise-altitude requirement on, the take-off-mass "
        + "error is -0.0 % (MAE 8.8 %, 87 within 5 %) on the statistical line against -3.6 % (MAE 8.3 %, "
        + "84 within 5 %) here; run_default-2026-09-17f_loftinICA.txt against run_takeoffFar25-ICA-2026-09-17.txt");
}

/* ── 3. validation ──────────────────────────────────────────────────── */
console.log("\n3. Validation");
for (const c of TRANSPORT_REAL_CASES) {
  const v = c.pick(analyzeTransport(c.inputs));
  check(`${c.name} within ±${c.band * 100}%`, rel(v, c.actual) <= c.band,
        `${v.toFixed(0)} vs ${c.actual} ${c.unit} (${pct(v, c.actual)}); ${c.source}`);
}
{
  const r = analyzeTransport({ grossLb: 174200, wingAreaFt2: 1341, thrustEachLbf: 27301, fuelCapacityLb: 46063 });
  console.log(`       737-800 at 174,200 lb with the FLOPS model's weights: range ${r.rangeNm.toFixed(0)} nm`
            + ` (FLOPS design range 2,960; Boeing payload-range chart §3.2.13 ≈ 2,600-2,700 nm at this zero-fuel weight with 200 nm alternate and typical reserves, read from the chart)`);
  const s = sizeTransport({});
  console.log("       737-800 sized from its own requirements (many inputs from the same FLOPS model):");
  check("737-800 sizing converges", s.converged);
  for (const t of B738_SIZING_TARGETS)
    check(`737-800 sizing: ${t.label.toLowerCase()} within ±${t.band * 100}%`, rel(s[t.key], t.actual) <= t.band,
          `${s[t.key].toFixed(0)} vs ${t.actual} ${t.unit} (${pct(s[t.key], t.actual)})`);
  console.log(`       thrust set by ${s.thrustGovernedBy}; cruise L/D ${s.cruise.Estart.toFixed(2)} → ${s.cruise.Eend.toFixed(2)}, S_wet/S ${s.cruise.swetOverS.toFixed(2)}`);
  const reg = sizeTransport({ fuelMethod: "regulatory" });
  console.log(`       with Scholz/Roskam segment fractions and 14 CFR 121.639 reserves instead: ${reg.grossLb.toFixed(0)} lb (${pct(reg.grossLb, 174200)}) — the generic fractions are heavy for this aircraft`);
}

/* ── 4. inputs ──────────────────────────────────────────────────────── */
console.log("\n4. Input provenance");
const bad = Object.entries(TRANSPORT_INPUTS).filter(([, v]) =>
  !["sourced", "derived", "assumed"].includes(v.status) || !v.source || !v.label || !v.section);
check("every transport input has a status, a source, a label and a section", bad.length === 0, bad.map(([k]) => k).join(", "));
const assumed = Object.entries(TRANSPORT_INPUTS).filter(([, v]) => v.status === "assumed").map(([k]) => k);
console.log(`       assumed (no free source): ${assumed.join(", ")}`);

console.log("");
console.log(fail ? `TRANSPORT GATE FAILED: ${fail} check(s)` : `TRANSPORT GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
