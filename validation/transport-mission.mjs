/* =====================================================================
   TRANSPORT MISSION AND LAYOUT GATE
   =====================================================================
   The segment mission (mission.js), the engine-deck shape
   (engine-deck.js) and engine location / tail volume (layout.js) do what
   their sources say. Accuracy against real aircraft is measured in
   eVTOL_Sizing_Research/datasets/validation-runs/, not claimed here.
   ===================================================================== */

import { flyMission, casToMach, transition, RESERVE_POLICIES } from "../src/classes/transport/mission.js";
import { deckShape, DECK_ROWS } from "../src/classes/transport/engine-deck.js";
import { engineSplit, tailAreas, aftNacelleDeltaCd, TAIL_VOLUME } from "../src/classes/transport/layout.js";
import { sizeTransport, analyzeTransport } from "../src/classes/transport/size.js";
import { flopsWeights } from "../src/classes/transport/flops-weights.js";
import { makeISA } from "../src/engine/atmosphere.js";
import { makeJetISA } from "../src/classes/transport/atmosphere.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => Math.abs(a / b - 1);
const G = 9.80665, LBF = 4.4482216, KT = 0.514444;
const isa = makeISA(0);

console.log("TRANSPORT MISSION AND LAYOUT GATE");
console.log("=".repeat(72));

console.log("\n1. Engine deck shape (NASA Aviary turbofan_28k)");
check("every deck row is reproduced exactly at its own Mach and altitude",
      DECK_ROWS.every(([M, h, f, t, fi, ff]) => {
        const s = deckShape(M, h);
        return Math.abs(s.maxThrustRatio - f) < 1e-12 && Math.abs(s.tsfcRatio - t) < 1e-12
            && Math.abs(s.idleThrustRatio - fi) < 1e-12 && Math.abs(s.idleFuelPerLbf - ff) < 1e-12;
      }), `${DECK_ROWS.length} rows`);
check("sea-level static thrust ratio is 1 and the TSFC reference is M 0.8, 35,000 ft",
      deckShape(0, 0).maxThrustRatio === 1 && deckShape(0.8, 35000).tsfcRatio === 1);
check("maximum thrust falls with altitude at M 0.8", deckShape(0.8, 30000).maxThrustRatio > deckShape(0.8, 39000).maxThrustRatio);
check("between deck altitudes the shape is interpolated linearly",
      Math.abs(deckShape(0.8, 36000).maxThrustRatio - (0.5 * deckShape(0.8, 35000).maxThrustRatio + 0.5 * deckShape(0.8, 37000).maxThrustRatio)) < 1e-12);

console.log("\n2. Mission");
{
  /* ICAO Doc 7488: isothermal above 11,000 m, pressure continuous. */
  const jet = makeJetISA(0);
  const t = jet(10999.999), s = jet(11000.001), u = jet(12497), hot = makeJetISA(15)(12497);
  check("jet ISA: the engine's ISA to 11 km, then 216.65 K, pressure continuous, exponential decay",
        Math.abs(u.T - 216.65) < 1e-9 && rel(s.P, t.P) < 1e-6
        && rel(u.P, isa(11000).P * Math.exp(-9.81 * 1497 / (287 * 216.65))) < 1e-12
        && [0, 3000, 10999].every((h) => JSON.stringify(jet(h)) === JSON.stringify(isa(h))),
        `41,000 ft: ${u.T.toFixed(2)} K, ${u.P.toFixed(0)} Pa`);
  check("ISA deviation above the tropopause shifts temperature only", Math.abs(hot.T - 231.65) < 1e-9 && hot.P === u.P);
}
check("CAS equals true speed at sea level (250 kt → M 0.378)", rel(casToMach(250 * KT, isa(0).P), 250 * KT / isa(0).a) < 1e-9);
{
  /* Round trip against the inverse written independently: Mach → CAS. */
  const machToCas = (M, p) => { const P0 = isa(0).P, qc = p * ((1 + 0.2 * M * M) ** 3.5 - 1);
    return isa(0).a * Math.sqrt(5 * ((qc / P0 + 1) ** (2 / 7) - 1)); };
  const ok = [[0.5, 10000], [0.767, 30000], [0.85, 39000]].every(([M, h]) => {
    const p = isa(h * 0.3048).P; return Math.abs(casToMach(machToCas(M, p), p) - M) < 1e-9; });
  check("CAS → Mach inverts Mach → CAS (M 0.5-0.85, 10,000-39,000 ft)", ok,
        `290 kt CAS at 30,000 ft = M ${casToMach(290 * KT, isa(30000 * 0.3048).P).toFixed(3)}`);
}
const a = { S: 124.6, cd0: 0.018, k: 1 / (Math.PI * 9.45 * 0.85) };
const e = { F0: 2 * 27300 * LBF, tsfcCruise: 0.56, climbThrottle: 0.95 };
const m = { rangeNm: 2000, cruiseAltFt: 35000, cruiseMach: 0.785, climbCasKt: 290, descentCasKt: 290, taxiMin: 10,
            takeoffFuelFraction: 0.004, reserve: "us-domestic", alternateNm: 200, alternateAltFt: 25000, alternateMach: 0.7 };
const W = 79000 * G;
const r = flyMission(a, e, m, W);
check("taxi fuel = idle fuel flow × taxi time", rel(r.segments.taxi, deckShape(0, 0).idleFuelPerLbf * e.F0 * 10 / 60) < 1e-12);
check("take-off fuel = fraction × gross weight", rel(r.segments.takeoff, 0.004 * W) < 1e-12);
check("climb + cruise + descent distances = the stage length",
      rel(r.distances.climb + r.distances.cruise + r.distances.descent, 2000) < 1e-6);
check("trip = taxi + take-off + climb + cruise + descent",
      rel(r.trip, r.segments.taxi + r.segments.takeoff + r.segments.climb + r.segments.cruise + r.segments.descent) < 1e-12);
check("total = trip + contingency + alternate + final reserve",
      rel(r.total, r.trip + r.segments.contingency + r.segments.alternate + r.segments.final) < 1e-12);
check("the climb reaches the cruise altitude", Math.abs(r.topOfClimbFt - 35000) < 1e-6 && !r.ceilingLimited);
check("more range burns more fuel", flyMission(a, e, { ...m, rangeNm: 3000 }, W).trip > r.trip);
{
  const easa = flyMission(a, e, { ...m, reserve: "easa" }, W);
  check("EASA contingency is 5% of trip fuel after take-off", rel(easa.segments.contingency, 0.05 * (easa.trip - easa.segments.taxi)) < 1e-12);
  const flag = flyMission(a, e, { ...m, reserve: "us-flag" }, W);
  check("121.645 flag contingency is positive and grows with trip time",
        flag.segments.contingency > 0 && flyMission(a, e, { ...m, reserve: "us-flag", rangeNm: 4000 }, W).segments.contingency > flag.segments.contingency);
  check("121.639 domestic has no contingency", r.segments.contingency === 0);
  {
    /* EASA final reserve by hand: 30 min at 1,500 ft at the minimum-drag CL, endurance Breguet. */
    const Wr = easa.landingWeightN - easa.segments.contingency - easa.segments.alternate;
    const CL = Math.sqrt(a.cd0 / a.k), E = CL / (2 * a.cd0), h = 1500 * 0.3048;
    const M = Math.sqrt(2 * Wr / (isa(h).rho * a.S * CL)) / isa(h).a;
    const tsfc = 0.56 * deckShape(M, 1500).tsfcRatio / 3600;
    check("the EASA final reserve is 30 minutes holding at 1,500 ft", rel(easa.segments.final, Wr * (1 - Math.exp(-1800 * tsfc / E))) < 1e-9);
  }
  check("taxi fuel is burned before brake release (a longer taxi leaves a lighter aircraft to climb)",
        flyMission(a, e, { ...m, taxiMin: 60 }, W).segments.climb < flyMission(a, e, { ...m, taxiMin: 0 }, W).segments.climb);
  check("every reserve policy flies the alternate", RESERVE_POLICIES.every(p => flyMission(a, e, { ...m, reserve: p }, W).segments.alternate > 0));
  let threw = false; try { flyMission(a, e, { ...m, reserve: "none" }, W); } catch { threw = true; }
  check("an unknown reserve policy is refused", threw);
}
{
  const weak = transition(a, { ...e, F0: e.F0 * 0.05 }, W, 0, 35000 * 0.3048, { casKt: 290, mach: 0.785 }, { dir: 1 });
  check("a climb without enough thrust stops at a ceiling and says so", weak.ceiling && weak.hEnd < 35000 * 0.3048);
  const up = transition(a, e, W, 0, 10000 * 0.3048, { casKt: 250, mach: 0.785 }, { dir: 1 });
  check("climb burns fuel and covers ground", up.fuel > 0 && up.R > 0 && up.W < W);
  const slow = transition(a, e, W, 0, 9500 * 0.3048, { casKt: 250, mach: 0.785 }, { dir: 1 });
  const fast = transition(a, e, W, 0, 9500 * 0.3048, { casKt: 340, mach: 0.785 }, { dir: 1 });
  check("below 10,000 ft the climb is flown at 250 kt CAS whatever the schedule says (14 CFR 91.117(a))",
        fast.R === slow.R && fast.fuel === slow.fuel);
  /* One 500 ft step by hand: dR = (dh + ΔV²/2g)/(F/W − CD/CL). */
  const one = transition(a, e, W, 0, 500 * 0.3048, { casKt: 250, mach: 0.785 }, { dir: 1 });
  {
    const h1 = 500 * 0.3048, hm = h1 / 2;
    const M0 = casToMach(250 * KT, isa(0).P), M1 = casToMach(250 * KT, isa(h1).P), Mm = (M0 + M1) / 2;
    const V0 = M0 * isa(0).a, V1 = M1 * isa(h1).a, Vm = Mm * isa(hm).a;
    const q = 0.5 * isa(hm).rho * Vm * Vm, CL = W / (q * a.S), CD = a.cd0 + a.k * CL * CL;
    const F = 0.95 * deckShape(Mm, hm / 0.3048).maxThrustRatio * e.F0;
    const dR = (h1 + (V1 * V1 - V0 * V0) / (2 * G)) / (F / W - CD / CL);
    check("a climb step follows TASOPT A.413 including the kinetic-energy term", rel(one.R, dR) < 1e-12,
          `${one.R.toFixed(1)} m vs ${dR.toFixed(1)} m`);
  }
}

console.log("\n3. Mission inside the jet sizing loop");
{
  const s = sizeTransport({ fuelMethod: "mission" });
  check("the mission method converges for the 737-800 defaults", s.converged, `${s.iterations} iterations`);
  check("gross = zero-fuel + mission fuel (with reserves)", Math.abs(s.grossLb - s.zeroFuelLb - s.fuel.mission.totalLb) < 1);
  const an = analyzeTransport({ fuelMethod: "mission", grossLb: 174200, wingAreaFt2: 1341, thrustEachLbf: 27301, fuelCapacityLb: 46063 });
  check("analysis range: the mission at that range needs the fuel on board",
        rel(an.fuel.mission.totalLb, an.fuelAvailableLb) < 1e-3, `${an.rangeNm.toFixed(0)} nm`);
  let threw = false; try { sizeTransport({ reservePolicy: "x" }); } catch { threw = true; }
  check("an unknown reserve policy is refused by the class", threw);
}

console.log("\n4. Engine location and tail volume");
check("engine splits: wing 2/0, aft 0/2, wing+tail 2/1, fuselage-3 0/3",
      JSON.stringify([engineSplit("wing", 2), engineSplit("aft-fuselage", 2), engineSplit("wing+tail", 3), engineSplit("fuselage-3", 3)])
      === JSON.stringify([{ onWing: 2, onFuselage: 0 }, { onWing: 0, onFuselage: 2 }, { onWing: 2, onFuselage: 1 }, { onWing: 0, onFuselage: 3 }]));
check("aft nacelle drag 0.0021 below M 0.76 and 0.0007 at M 0.82 (NASA TN D-3781); none for wing engines",
      aftNacelleDeltaCd("aft-fuselage", 0.7) === 0.0021 && aftNacelleDeltaCd("aft-fuselage", 0.82) === 0.0007
      && Math.abs(aftNacelleDeltaCd("aft-fuselage", 0.79) - 0.0014) < 1e-12 && aftNacelleDeltaCd("wing", 0.7) === 0);
{
  const t = tailAreas({ wingArea: 1341, span: 112.57, taper: 0.237, fuselageLength: 124.75, fuselageLengthM: 38.02,
                        location: "wing", category: "jet-transport", tTail: false });
  check("C_H = S_H l_H/(S c_MAC) and C_V = S_V l_V/(S b) give back 0.991 and 0.0793 (Scholz 2021 Eq 1, Table 2)",
        rel(t.htArea * t.lH / (1341 * t.cMac), 0.991) < 1e-12 && rel(t.vtArea * t.lV / (1341 * 112.57), 0.0793) < 1e-12);
  check("wing-engine lever arm l_H/l_F = −0.00064 l_F + 0.502 (Eq 3)", rel(t.lH / 124.75, -0.00064 * 38.02 + 0.502) < 1e-12);
  const tt = tailAreas({ wingArea: 1341, span: 112.57, taper: 0.237, fuselageLength: 124.75, fuselageLengthM: 38.02,
                         location: "aft-fuselage", category: "jet-transport", tTail: true });
  check("rear engines use Eq 4 lever arms, and a T-tail takes 4% off the coefficients",
        rel(tt.lV / 124.75, -0.00018 * 38.02 + 0.366) < 1e-12 && rel(tt.CH, 0.96 * 0.991) < 1e-12);
  check("rear engines need larger tails (shorter lever arms)", tt.vtArea / 0.96 > t.vtArea && tt.htArea / 0.96 > t.htArea);
  check("business-jet coefficients are 0.694 / 0.0722", TAIL_VOLUME["business-jet"].CH === 0.694 && TAIL_VOLUME["business-jet"].CV === 0.0722);
}
{
  const base = sizeTransport({});
  const aft = sizeTransport({ engineLocation: "aft-fuselage" });
  check("aft engines lose the wing relief (FLOPS Eq 38) and add fuselage weight (Eq 56)",
        aft.weights.structure.wing > base.weights.structure.wing && aft.weights.structure.fuselage > base.weights.structure.fuselage);
  const f0 = flopsWeights(FLOPS_737());
  check("FLOPS fuselage factor is (1 + 0.05 NEF) at a fixed gross weight",
        rel(flopsWeights({ ...FLOPS_737(), numWingEngines: 0, numFuselageEngines: 2 }).structure.fuselage / f0.structure.fuselage, 1.10) < 1e-12);
  let threw = false; try { sizeTransport({ engineLocation: "wing+tail" }); } catch { threw = true; }
  check("a wing+tail layout needs three engines", threw);
  threw = false; try { sizeTransport({ engineLocation: "pod" }); } catch { threw = true; }
  check("an unknown engine location is refused", threw);
  check("three-engine layouts size", sizeTransport({ numEngines: 3, engineLocation: "fuselage-3", tTail: true }).converged
        && sizeTransport({ numEngines: 3, engineLocation: "wing+tail" }).converged);
}

{
  /* FLOPS FCOMP (TM-2017-219627 Eq 33, 35, 36): the wing only. */
  const base = flopsWeights(FLOPS_737()), comp = flopsWeights({ ...FLOPS_737(), compositeFraction: 1 });
  const d = base.detail, c = comp.detail;
  /* Bending is ×0.6 before FLOPS Eq 38 redistributes it, so it drops by a little less. */
  const bend = c.bendingMass / d.bendingMass;
  check("wing composite fraction: shear and control ×0.83, miscellaneous ×0.7, bending about ×0.6, no other group",
        bend > 0.6 && bend < 0.65 && Math.abs(c.shearControlMass / d.shearControlMass - 0.83) < 1e-12
        && Math.abs(c.miscWingMass / d.miscWingMass - 0.7) < 1e-12 && comp.structure.fuselage === base.structure.fuselage
        && comp.structure.horizontalTail === base.structure.horizontalTail,
        `wing ${base.structure.wing.toFixed(0)} → ${comp.structure.wing.toFixed(0)} lb`);
  check("the sizer passes the wing composite fraction to FLOPS",
        sizeTransport({ wingCompositeFraction: 0.5 }).geometryInputs.compositeFraction === 0.5
        && sizeTransport({}).geometryInputs.compositeFraction === 0);
}

/* FLOPS inputs of NASA Aviary large_single_aisle_2 (rounded), for fixed-weight comparisons. */
function FLOPS_737() {
  return { grossWeight: 174200, maxMach: 0.82, designRange: 2960, landingToTakeoffRatio: 0.84, emptyMarginFraction: 0,
    passengers: 162, firstClass: 12, businessClass: 0, economyClass: 150, flightCrew: 2, flightAttendants: 5, galleyCrew: 1,
    massPerPassenger: 165, baggagePerPassenger: 35, cargo: 4077, fuelCapacity: 46063, fuelDensity: 6.7, fuelTanks: 7,
    fuselageLength: 124.75, fuselageWidth: 12.33, fuselageHeight: 13.02, passengerCompartmentLength: 98.5, militaryCargoFloor: false,
    htArea: 407, htAspectRatio: 5.444, htTaper: 0.3, htTc: 0.12, htOnVtFraction: 0,
    vtArea: 284, vtAspectRatio: 2.23, vtTaper: 0.21, vtTc: 0.137, numVerticalTails: 1,
    wingArea: 1341, wingAspectRatio: 9.45, wingSpan: 112.57, wingSweep: 25, wingTaper: 0.237, wingTc: 0.13,
    ultimateLoadFactor: 3.75, strutBracing: 0, aeroelasticTailoring: 0, compositeFraction: 0, varSweep: 0, wingLoadFraction: 1,
    controlSurfaceAreaRatio: 0.333, mainGearOleoIn: 84, noseGearOleoIn: 58.8, nacelleDiameter: 7, nacelleLength: 11.65,
    paintPerArea: 0.07, engineRefMass: 8071, engineRefThrust: 27301, engineSlsThrust: 27301, engineMassExponent: 1.15,
    numEngines: 2, numWingEngines: 2, numFuselageEngines: 0, hydraulicPressure: 3000 };
}

console.log("");
console.log(fail ? `TRANSPORT MISSION GATE FAILED: ${fail} check(s)` : `TRANSPORT MISSION GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
