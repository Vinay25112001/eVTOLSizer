/* =====================================================================
   FLY · YOURSELF — a point-mass flight model made from the sizing
   =====================================================================
   The aeroplane the class sized, flown by hand from its cruise point:
   throttle, pitch (as a load-factor demand) and bank. Pure: no three.js,
   no React. Every quantity of the aeroplane is the class's own; what
   this file adds is listed in FREE_FLIGHT_SOURCES with where it comes
   from, and the tab prints that list.

   EQUATIONS. GASP (NASA CR-152303, vol. 6, subroutine DERIV, eq.
   VI.1.105) integrates a point mass in the vertical plane, "ignoring the
   rigid body pitch dynamics":
       dV/dt   = (g/W) [T cos(a - phiT) - D - W sin(gam)]
       V dgam/dt = (g/W) [T sin(a - phiT) + L - W cos(gam)]
   With the thrust along the path (a - phiT = 0, as in Airbus "Getting to
   grips with aircraft performance" 2002, climb: T = D + W sin(gam)) and
   the lift tilted by the bank angle phi, its vertical-plane part is
   L cos(phi) and its horizontal part L sin(phi) turns the path:
       dV/dt   = (T - D)/m - g sin(gam)
       dgam/dt = (g/V) (n cos(phi) - cos(gam))            n = L/W
       dpsi/dt = g n sin(phi) / (V cos(gam))
   In a level turn these give n = 1/cos(phi) (Airbus 2002 p. 69, Fig.
   C18) and dpsi/dt = g tan(phi)/V (NASA TP-2015-218751, NDARC Theory,
   p. 82); validation/aircraft-free-flight.mjs flies that turn and checks
   both. GASP limits the motion by maximum load factor, maximum lift
   coefficient and minimum (zero) load factor; so does this model.

   WHAT IT DOES NOT MODEL: pitch, roll and yaw dynamics (the attitude
   drawn is the flight path), the angle of attack, sideslip, the stall's
   break and wing drop (the lift stops at CLmax), the take-off and the
   landing (the flight starts in the air; reaching the ground ends it).
   ===================================================================== */
import { polarCurve } from "../engine.js";
import { transportPolarCurve } from "../../transport/size.js";
import { deckShape, DECK_ROWS } from "../../transport/engine-deck.js";
import { makeJetISA, TROPOPAUSE_M } from "../../transport/atmosphere.js";
import { makeISA } from "../../../engine/atmosphere.js";
import { pistonPowerRatio, RHO_SL_SLUG, KT_FPS } from "../../trainer/performance.js";
import { POWER_LAPSE, powerLapse, psfcSI } from "../../turboprop/size.js";
import { limitManoeuvreN } from "../flight-envelope.js";
import { missionProfileOf } from "./mission-profile.js";

const G = 9.80665, FT = 0.3048, KT = 1852 / 3600, LB = 0.45359237, LBF = 4.4482216152605;
const D2R = Math.PI / 180;
/* ICAO Doc 7488: the troposphere ends at 11 km; the isothermal layer above
   it ends at 20 km. The atmosphere each class sizes with stops being ISA
   there, so the flight stops there too. */
const ISA_ISOTHERMAL_TOP_M = 20000;
const PISTON_LAPSE_TOP_FT = 24000;    // where the trainer's Loftin Fig. 6.28 lapse ends (pistonPowerRatio is NaN from here)

/* ── what this file adds, and where each piece comes from ───────────── */

/* Clean maximum lift coefficient. The trainer's is the Cessna 172S's,
   from its stall speed; the others take the middle of the clean range
   Scholz gives for their kind of aeroplane, and say so. */
const C172S = Object.freeze({ weightLb: 2550, vsKcas: 53, wingAreaFt2: 174 });
const CL_C172S = 2 * C172S.weightLb / (RHO_SL_SLUG * (C172S.vsKcas * KT_FPS) ** 2 * C172S.wingAreaFt2);
const SCHOLZ = "Scholz, HAW Aircraft Design ch. 5, Table 5.1 (based on Roskam I), clean configuration";
export const CLEAN_CLMAX = Object.freeze({
  trainer: { value: CL_C172S, range: [1.3, 1.9], prov: "sourced",
    source: `Cessna 172S POH Fig. 5-3 (p. 5-12): stall at ${C172S.vsKcas} KCAS, ${C172S.weightLb.toLocaleString("en-US")} lb, flaps up, wings level, power off; wing area ${C172S.wingAreaFt2} ft² (POH). CL = 2W/(ρ₀V²S). ${SCHOLZ} gives 1.3–1.9 for a single-engine propeller aeroplane.` },
  turboprop: { value: 1.5, range: [1.2, 1.8], prov: "assumed", source: `${SCHOLZ}: twin-engine propeller 1.2–1.8; the middle is taken.` },
  bizjet: { value: 1.6, range: [1.4, 1.8], prov: "assumed", source: `${SCHOLZ}: business jet 1.4–1.8; the middle is taken.` },
  transport: { value: 1.5, range: [1.2, 1.8], prov: "assumed", source: `${SCHOLZ}: jet transport 1.2–1.8; the middle is taken.` },
});
export const C172S_STALL_KCAS = Object.freeze({ 0: 53, 30: 57, 45: 63, 60: 75 });   // the same figure, flaps up

/* Roll rate: the Level 1 minimum of MIL-F-8785C for Flight Phase
   Category B (climb, cruise, loiter, descent), as an average rate. The
   class is assigned from the specification's descriptions (sec. 1.3):
   Class I small light aeroplanes and primary trainers, Class II medium
   weight transports, Class III large heavy transports. */
export const ROLL = Object.freeze({
  trainer:   { milClass: "I",    deg: 60, s: 1.7, table: "Table IXa" },
  turboprop: { milClass: "II-L", deg: 45, s: 1.9, table: "Table IXa" },
  bizjet:    { milClass: "II-L", deg: 45, s: 1.9, table: "Table IXa" },
  transport: { milClass: "III",  deg: 30, s: 2.0, table: "Table IXf, speed range M" },
});

/* Drawn: conventions of this simulator, not of any aeroplane. */
export const DRAWN = Object.freeze({
  stickLagS: 0.5,        // the load factor follows the stick with this first-order lag
  bankLimitDeg: 75,      // the simulator stops the roll here
  pathLimitDeg: 60,      // and the flight path angle here (GASP limits pitch too)
  slowFraction: 0.35,    // below this share of the 1 g stall speed the flight stops
  dtS: 1 / 120,          // integration step
});

const JETS = new Set(["bizjet", "transport"]);

/* ── the model of one sized aeroplane ───────────────────────────────── */

const segKg = (result, re) => (result.mission ?? []).filter((s) => !s.reserve && re.test(s.name || "")).reduce((a, s) => a + s.kg, 0);

export function freeFlightModel(result, opts = {}) {
  const type = result?.type;
  if (!result || !CLEAN_CLMAX[type]) return { ok: false, refusal: "Free flight is built for the trainer, turboprop, business jet and jet airliner." };
  if (!(result.mtowKg > 0) || !(result.wingAreaM2 > 0) || !(result.cruise?.speedKt > 0) || !Number.isFinite(result.cruise?.altFt))
    return { ok: false, refusal: "This result has no cruise point or no wing to fly from." };
  const raw = result.raw, p = raw.inputs;
  const jet = JETS.has(type);
  const atmF = jet ? makeJetISA(0) : makeISA(0);
  const RHO0 = atmF(0).rho;

  /* Drag: the class's own polar. The trainer's and turboprop's are
     parabolas (engine.js polarCurve says so), read back from that curve;
     the jets' is asked for at each Mach, height and CL. */
  let cd, dragNote;
  if (jet) {
    cd = (CL, M, hM) => transportPolarCurve(raw, M, hM / FT, [CL])[0].cd;
    dragNote = p.dragMethod === "flops"
      ? "the class's FLOPS build-up at each Mach, height and CL, compressibility included"
      : "the class's equivalent-skin-friction polar at each Mach and CL; this drag method has no compressibility drag rise";
  } else {
    const pts = polarCurve(result).points;
    const cd0 = pts[0].cd, at1 = pts.find((x) => Math.abs(x.cl - 1) < 1e-9);
    const k = at1.cd - cd0;
    cd = (CL) => cd0 + k * CL * CL;
    dragNote = `the class's parabolic polar, CD = ${cd0.toFixed(4)} + ${k.toFixed(4)} CL² (no Mach effect)`;
  }

  /* Thrust and fuel: the class's own engine model, at throttle tau. */
  let propulsion, ceiling, deck = null, machTop = Infinity, engineNote, fuelNote;
  if (jet) {
    const F0 = (raw.thrustEachLbf ?? p.thrustEachLbf) * p.numEngines * LBF;
    propulsion = (tau, V, M, hM) => {
      const sh = deckShape(M, hM / FT);
      const T = F0 * (sh.idleThrustRatio + tau * (sh.maxThrustRatio - sh.idleThrustRatio));
      const flowN = Math.max(T * p.tsfcCruise * sh.tsfcRatio, sh.idleFuelPerLbf * F0) / 3600;
      return { T, fuelKgS: flowN / G };
    };
    /* The deck's own edges: its lookup holds the last row beyond them. */
    deck = { topFt: Math.max(...DECK_ROWS.map((r) => r[1])), topMach: Math.max(...DECK_ROWS.map((r) => r[0])) };
    /* Above the deck's top height the lookup holds its last row and the tab
       says so. Past its top Mach the flight stops: the class's drag has no
       transonic rise there (equivalent skin friction has none at all). */
    machTop = deck.topMach;
    ceiling = { ft: ISA_ISOTHERMAL_TOP_M / FT, why: "the top of ISA's isothermal layer, 20 km, where the class's atmosphere stops being ISA" };
    engineNote = `the class's engine deck (max and idle ratings at each Mach and height), ${Math.round(F0 / 1000)} kN sea-level static in all; throttle goes from idle to maximum`;
    fuelNote = `TSFC ${p.tsfcCruise} lb/lbf/h times the deck's ratio, times thrust, as the class's mission does; never less than the deck's idle flow`;
  } else {
    const P0 = result.propulsion.perEngine * 1000 * result.propulsion.engines;    // W, rated
    const eta = p.etaCruise, psfc = psfcSI(type === "trainer" ? p.sfc : p.sfcCruise);
    const lapse = type === "trainer"
      ? (M, hM) => pistonPowerRatio(Math.min(hM / FT, PISTON_LAPSE_TOP_FT * (1 - 1e-9)))
      : (M, hM, sigma) => powerLapse(POWER_LAPSE[p.powerLapse], M, sigma);
    propulsion = (tau, V, M, hM, sigma) => {
      const P = tau * P0 * lapse(M, hM, sigma);
      return { T: eta * P / V, fuelKgS: psfc * P, P };
    };
    ceiling = type === "trainer"
      ? { ft: PISTON_LAPSE_TOP_FT, why: "24,000 ft, where the class's piston power lapse (Loftin Fig. 6.28) ends" }
      : { ft: TROPOPAUSE_M / FT, why: "the tropopause, 11 km, where the class's atmosphere (the ISA troposphere) ends" };
    engineNote = type === "trainer"
      ? `${Math.round(P0 / 1000)} kW rated, falling with height by Loftin Fig. 6.28 (the class's lapse, which ends at 24,000 ft); thrust = ηP/V with η ${eta}, the class's cruise value`
      : `${Math.round(P0 / 1000)} kW rated in all, times the class's power lapse P/P₀ = A·M^m·σ^n (Scholz & Nita 2008 Table 1, "${p.powerLapse}"); thrust = ηP/V with η ${eta}. The fit falls toward zero as Mach falls, so near the stall it understates the power`;
    fuelNote = `the class's constant power-specific fuel consumption, ${type === "trainer" ? p.sfc : p.sfcCruise} lb/hp/h, times shaft power`;
  }

  const cl = CLEAN_CLMAX[type];
  const clMax = Number.isFinite(opts.clMax) && cl.prov === "assumed" ? Math.min(cl.range[1], Math.max(cl.range[0], opts.clMax)) : cl.value;
  const mtowLb = result.mtowKg / LB;
  const nLimit = type === "trainer" && raw.loads?.nManoeuvre > 0 ? raw.loads.nManoeuvre : limitManoeuvreN(mtowLb);
  const roll = ROLL[type];

  /* The start: the cruise point the sizing flew, at the mass it had there. */
  const prof = missionProfileOf(result);
  const startFt = prof.ok && Number.isFinite(prof.cruiseFt) ? prof.cruiseFt : result.cruise.altFt;
  const startV = Math.abs(startFt - result.cruise.altFt) < 1 || !Number.isFinite(result.cruise.mach)
    ? result.cruise.speedKt * KT : result.cruise.mach * atmF(startFt * FT).a;
  const preCruiseKg = segKg(result, /^(Taxi|Take-off$|Climb$)|allowance/i);
  /* The reserve the warning watches: the class's own list, unless that list
     is the design mission's (an analysed turboprop). Its reserves belong to
     the design mission's landing; the class keeps a reserve as a fraction
     of landing weight, so this aeroplane's is another number, which the
     class reports only inside its range. */
  const reserveKg = result.missionIsDesign === true ? null
    : (result.mission ?? []).filter((s) => s.reserve).reduce((a, s) => a + s.kg, 0);

  return {
    ok: true, type, jet, atm: atmF, RHO0, cd, propulsion,
    S: result.wingAreaM2, clMax, clMaxInfo: cl, nLimit, rollRate: roll.deg / roll.s * D2R, roll,
    ceiling, deck, machTop,
    maxMach: jet || type === "turboprop" ? p.maxMach : null,
    maxAltFt: type === "turboprop" ? p.maxAltitudeFt : null,
    vdKt: type === "trainer" ? raw.loads?.vdKt ?? null : null,
    m0: result.mtowKg - preCruiseKg, fuel0: result.fuelKg - preCruiseKg, preCruiseKg, reserveKg,
    startFt, startV, notes: { drag: dragNote, engine: engineNote, fuel: fuelNote },
  };
}

/* ── forces, rates and one step ─────────────────────────────────────── */

export function forces(model, st, tau) {
  const atm = model.atm(st.h);
  const q = 0.5 * atm.rho * st.V * st.V, M = st.V / atm.a, sigma = atm.rho / model.RHO0;
  const W = st.m * G;
  const nStall = q * model.S * model.clMax / W;
  const nEff = Math.max(0, Math.min(st.n, nStall));
  const CL = nEff * W / (q * model.S);
  const CD = model.cd(CL, M, st.h);
  const D = q * model.S * CD;
  const pr = st.fuel > 0 ? model.propulsion(tau, st.V, M, st.h, sigma) : { T: 0, fuelKgS: 0 };
  return { atm, q, M, sigma, W, nStall, nEff, CL, CD, D, T: pr.T, fuelKgS: pr.fuelKgS };
}

function rates(model, st, tau) {
  const f = forces(model, st, tau);
  const cg = Math.cos(st.gam);
  return {
    f,
    V: (f.T - f.D) / st.m - G * Math.sin(st.gam),
    gam: (G / st.V) * (f.nEff * Math.cos(st.phi) - cg),
    psi: G * f.nEff * Math.sin(st.phi) / (st.V * cg),
    h: st.V * Math.sin(st.gam),
    x: st.V * cg * Math.cos(st.psi),
    z: st.V * cg * Math.sin(st.psi),
    fuel: -f.fuelKgS,
  };
}

function advance(st, r, dt) {
  const fuel = Math.max(0, st.fuel + r.fuel * dt);
  return { ...st, V: st.V + r.V * dt, gam: st.gam + r.gam * dt, psi: st.psi + r.psi * dt, h: st.h + r.h * dt,
           x: st.x + r.x * dt, z: st.z + r.z * dt, fuel, m: st.m - (st.fuel - fuel) };
}

/* The load factor the stick asks for. Centred, it holds the flight path
   (n = cos(gam)/cos(phi)); full back asks for the limit load factor;
   full forward for zero, GASP's minimum. */
export function demandedN(model, st, stick) {
  const hold = Math.min(model.nLimit, Math.cos(st.gam) / Math.max(1e-6, Math.cos(st.phi)));
  return stick >= 0 ? hold + stick * (model.nLimit - hold) : hold * (1 + stick);
}

/* The throttle that holds level, unaccelerated flight at this state. */
export function trimThrottle(model, st) {
  const lvl = { ...st, gam: 0, phi: 0, n: 1 };
  const need = forces(model, lvl, 0).D;
  const T = (tau) => forces(model, lvl, tau).T;
  if (T(1) < need) return 1;
  if (T(0) >= need) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (T(mid) < need) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function initialState(model) {
  const st = { t: 0, x: 0, z: 0, h: model.startFt * FT, V: model.startV, gam: 0, psi: 0, phi: 0, n: 1,
               m: model.m0, fuel: model.fuel0, ended: null };
  const throttle = trimThrottle(model, st);
  /* Can full throttle hold the cruise point at all? The sized trainer
     cannot quite: its 75 % cruise power is not available at 8,500 ft by
     its own lapse (the sizing flags cruisePowerAvailable false). */
  const lvl = { ...st, throttle };
  const f = forces(model, lvl, 1);
  return { ...lvl, trimShort: f.T < f.D * (1 - 1e-9), trimNeedKN: f.D / 1000, trimHaveKN: f.T / 1000 };
}

/* One step of `dt` seconds. `input` = { stick -1..1, roll -1..1, throttle 0..1 }. */
export function step(model, st, input, dt = DRAWN.dtS) {
  if (st.ended) return st;
  const tau = Math.min(1, Math.max(0, input.throttle));
  const lim = DRAWN.bankLimitDeg * D2R;
  const phi = Math.max(-lim, Math.min(lim, st.phi + model.rollRate * Math.max(-1, Math.min(1, input.roll || 0)) * dt));
  const nCmd = demandedN(model, { ...st, phi }, Math.max(-1, Math.min(1, input.stick || 0)));
  const nStall = forces(model, st, tau).nStall;
  let n = st.n + (nCmd - st.n) * (1 - Math.exp(-dt / DRAWN.stickLagS));
  n = Math.max(0, Math.min(n, model.nLimit, nStall));
  const s0 = { ...st, phi, n, throttle: tau };
  const k1 = rates(model, s0, tau);
  const k2 = rates(model, advance(s0, k1, dt / 2), tau);
  const s1 = advance(s0, k2, dt);
  /* The tank runs dry inside this step: burn what is left, so the next
     step has no thrust (the midpoint already saw an empty tank). */
  if (st.fuel > 0 && st.fuel + k1.fuel * dt <= 0) { s1.m = st.m - st.fuel; s1.fuel = 0; }
  const pl = DRAWN.pathLimitDeg * D2R;
  s1.gam = Math.max(-pl, Math.min(pl, s1.gam));
  s1.psi = ((s1.psi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  s1.t = st.t + dt;
  s1.nCmd = nCmd;
  s1.stalled = nCmd > nStall * (1 + 1e-9);
  s1.ended = endOf(model, s1);
  return s1;
}

export const ENDINGS = Object.freeze({
  ground: "Reached the ground. This sizing has no landing model, so the flight ends here.",
  ceiling: "Above the height where the data this class sizes with ends, so the flight stops here.",
  mach: "Past the top Mach of the class's engine deck, where its drag has no transonic rise either, so the flight stops here.",
  numeric: "The numbers left the range this model can compute, so the flight stops here.",
  slow: "Too slow for this model: below about a third of the stall speed an aeroplane tail-slides or spins, which a point mass cannot show. The flight stops here.",
});

function endOf(model, st) {
  if (![st.h, st.V, st.gam, st.psi, st.m].every(Number.isFinite)) return "numeric";
  if (st.h <= 0) return "ground";
  const atm = model.atm(st.h);
  if (st.h / FT > model.ceiling.ft) return "ceiling";
  if (st.V / atm.a > model.machTop) return "mach";
  const vs1g = Math.sqrt(2 * st.m * G / (atm.rho * model.S * model.clMax));
  if (st.V < DRAWN.slowFraction * vs1g) return "slow";
  return null;
}

/* ── what the tab prints ────────────────────────────────────────────── */

export function readouts(model, st) {
  const f = forces(model, st, st.throttle);
  const vs1gEas = Math.sqrt(2 * st.m * G / (model.RHO0 * model.S * model.clMax));
  const easKt = st.V * Math.sqrt(f.sigma) / KT;
  const warnings = [];
  if (st.stalled || f.CL >= model.clMax * 0.999) warnings.push({ key: "stall", text: `Stall: the wing is at its clean CLmax ${model.clMax.toFixed(2)}; it gives no more lift, so the nose drops` });
  if ((st.nCmd ?? 0) > model.nLimit * 0.999) warnings.push({ key: "g", text: `At the limit load factor ${model.nLimit.toFixed(2)} g: the stick asks for more and gets no more` });
  if (model.vdKt && easKt > model.vdKt) warnings.push({ key: "speed", text: `Above the design dive speed V_D ${Math.round(model.vdKt)} kt EAS (the sizing's own loads)` });
  if (model.maxMach && f.M > model.maxMach) warnings.push({ key: "speed", text: `Above the maximum operating Mach ${model.maxMach}` });
  if (model.deck && (st.h / FT > model.deck.topFt || f.M > model.deck.topMach))
    warnings.push({ key: "deck", text: `Beyond the engine deck (${model.deck.topFt.toLocaleString("en-US")} ft, Mach ${model.deck.topMach}): thrust and fuel are held at its last row, as the class's own lookup does` });
  if (model.maxAltFt && st.h / FT > model.maxAltFt) warnings.push({ key: "alt", text: `Above the type's highest altitude, ${model.maxAltFt.toLocaleString("en-US")} ft` });
  if (st.fuel <= 0) warnings.push({ key: "fuel", text: "Fuel exhausted: the engines have stopped" });
  else if (model.reserveKg > 0 && st.fuel < model.reserveKg) warnings.push({ key: "reserve", text: "Into the reserve fuel the sizing booked" });
  return {
    tasKt: st.V / KT, easKt, mach: f.M, altFt: st.h / FT, vsFpm: st.V * Math.sin(st.gam) / FT * 60,
    headingDeg: st.psi / D2R, bankDeg: st.phi / D2R, pathDeg: st.gam / D2R, n: f.nEff, CL: f.CL,
    stallEasKt: vs1gEas / KT, thrustKN: f.T / 1000, dragKN: f.D / 1000, fuelKg: st.fuel, fuelKgH: f.fuelKgS * 3600,
    throttle: st.throttle, distanceNm: Math.hypot(st.x, st.z) / 1852, timeS: st.t, massKg: st.m, warnings,
  };
}

/* Every number this file adds, with its provenance, for the tab's table. */
export function freeFlightSources(model) {
  const r = model.roll, cl = model.clMaxInfo;
  return [
    { what: "Equations of motion", prov: "derived", text: "point mass: GASP (NASA CR-152303 vol. 6) eq. VI.1.105, thrust along the path, lift tilted by the bank angle; level turns reduce to n = 1/cos φ (Airbus 2002, Fig. C18) and turn rate g·tan φ/V (NDARC Theory, p. 82)" },
    { what: "Drag", prov: "sized", text: model.notes.drag },
    { what: "Thrust", prov: "sized", text: model.notes.engine },
    { what: "Fuel flow", prov: "sized", text: model.notes.fuel },
    { what: "Atmosphere", prov: "sourced", text: model.jet ? "ISA with the stratosphere, as the class sizes" : "ISA troposphere, as the class sizes" },
    { what: `Clean CLmax ${model.clMax.toFixed(2)}`, prov: cl.prov === "assumed" ? "assumed" : "sourced", text: cl.source },
    { what: `Limit load factor ${model.nLimit.toFixed(2)} g`, prov: "sized", text: model.type === "trainer" ? "the class's own manoeuvre load factor (its loads)" : "14 CFR 25.337(b) at this MTOW, as the class's loads use" },
    { what: `Roll rate ${(model.rollRate / D2R).toFixed(1)}°/s`, prov: "sourced", text: `MIL-F-8785C ${r.table}, Class ${r.milClass}, Level 1, Category B: ${r.deg}° in ${r.s} s, the slowest roll that meets Level 1. The class is assigned from the specification's descriptions (sec. 1.3)` },
    { what: "Start", prov: "sized", text: `the sized cruise point, ${Math.round(model.startFt).toLocaleString("en-US")} ft, at take-off mass less the fuel the class lists before cruise (${Math.round(model.preCruiseKg)} kg${model.preCruiseKg > 0 ? "" : ": this class does not list it separately, so it starts slightly heavy"}); throttle trimmed for level flight` },
    { what: "Reserve warning", prov: "sized", text: model.reserveKg > 0
        ? `when the fuel falls below the ${Math.round(model.reserveKg).toLocaleString("en-US")} kg of reserves the class's mission books`
        : model.reserveKg === null
          ? "none: this analysed list is the design mission's, whose reserves belong to its own landing weight; this aeroplane's reserve is inside the range the class reports"
          : "none: this class's analysis lists no fuel by segment" },
    { what: "Stick", prov: "drawn", text: `asks for a load factor: centred holds the flight path, full back the limit, full forward zero (GASP's limits); it follows with a ${DRAWN.stickLagS} s lag` },
    { what: "Stall", prov: "drawn", text: "the lift stops at CLmax; the break, the wing drop and the spin are not modelled" },
    { what: "Where it stops", prov: "drawn", text: `at the ground (no landing model); at ${model.ceiling.why}${Number.isFinite(model.machTop) ? `; past Mach ${model.machTop}, the top of the engine deck` : ""}; below ${DRAWN.slowFraction} of the 1 g stall speed, where a point mass no longer stands for an aeroplane` },
    { what: "Limits", prov: "drawn", text: `bank held to ±${DRAWN.bankLimitDeg}°, flight path to ±${DRAWN.pathLimitDeg}°; throttle acts at once; the attitude drawn is the flight path (no angle of attack)` },
  ];
}
