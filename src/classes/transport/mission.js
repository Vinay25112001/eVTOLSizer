/* =====================================================================
   TRANSPORT MISSION — taxi, take-off, climb, cruise, descent, reserves
   =====================================================================
   A segment-by-segment mission for jet transports and business jets,
   replacing a single Breguet cruise when the class asks for it.
   Sources (eVTOL_Sizing_Research/datasets/mission-methods/METHODS-INDEX.md):

   climb, descent  energy-state marching, Drela, TASOPT 2.00 §A.2.15
                   (read from the rendered pages):
                     dR = (dh + d(V²)/2g) / (F/W − CD/CL)          (A.413, cos γ ≈ 1)
                     d ln W = −(F/W) (TSFC/V) dR                    (A.414)
                   Climb at a fraction of maximum thrust, descent at idle
                   thrust with idle fuel flow. Thrust and TSFC vary with
                   Mach and height as NASA Aviary's FLOPS deck does
                   (engine-deck.js), scaled by the engine's static thrust
                   and cruise TSFC.
   speed schedule  250 KCAS below 10,000 ft (14 CFR 91.117(a)), then a
                   constant CAS to the crossover height and constant Mach
                   above it; the reverse in descent.
   cruise          constant altitude and Mach, Breguet with the L/D at the
                   mean cruise weight (as Loftin, RP-1060 p.152).
   taxi, take-off  fuel flow at idle for the taxi time; take-off fuel as a
                   fraction of gross weight (inputs).
   reserves        named policies, each a sequence of the same segments:
     us-domestic   14 CFR 121.639: to the alternate, then 45 minutes at
                   normal cruise consumption.
     us-flag       14 CFR 121.645(b): 10 % of the trip time at cruise
                   consumption, to the alternate, then 30 minutes holding at
                   1,500 ft.
     easa          EASA AMC/GM Part-CAT: 5 % of trip fuel as contingency,
                   to the alternate, then 30 minutes holding at 1,500 ft.
     nbaa          business-jet convention, known only from secondary
                   sources (no NBAA publication obtained): flown here as to a
                   200 nm alternate, then 30 minutes holding at 5,000 ft.
   The alternate leg climbs to `alternateAltFt`, cruises and descends.
   Holding is at the minimum-drag lift coefficient.
   drag            a parabolic polar CD0 + k CL², or any polar a.cd(M, CL, h)
                   (the FLOPS build-up, flops-aero.js), which then varies
                   with Mach and height along the mission.

   SI throughout: kg, m, s, N. TSFC is given in lb/(lbf·h) = kg/(kg·h);
   times g it is the same number in N/(N·h).
   ===================================================================== */

import { makeJetISA } from "./atmosphere.js";
import { deckShape } from "./engine-deck.js";

const G = 9.80665, FT = 0.3048, NM = 1852, KT = 0.514444;
const isa = makeJetISA(0);
const A0 = isa(0).a, P0 = isa(0).P;

export const RESERVE_POLICIES = Object.freeze(["us-domestic", "us-flag", "easa", "nbaa"]);

/* Calibrated airspeed (m/s) → Mach at pressure p (subsonic, compressible). */
export function casToMach(casMs, p) {
  const qc = P0 * ((1 + 0.2 * (casMs / A0) ** 2) ** 3.5 - 1);
  return Math.sqrt(5 * ((qc / p + 1) ** (2 / 7) - 1));
}

/* Mach of the climb or descent schedule at height hM (metres). */
function scheduleMach(hM, s) {
  const p = isa(hM).P;
  const cas = hM < 10000 * FT ? Math.min(250 * KT, s.casKt * KT) : s.casKt * KT;
  return Math.min(casToMach(cas, p), s.mach);
}

function aero(a, W, hM, M) {
  const atm = isa(hM), V = M * atm.a, q = 0.5 * atm.rho * V * V;
  const CL = W / (q * a.S);
  const CD = a.cd ? a.cd(M, CL, hM) : a.cd0 + a.k * CL * CL;
  return { V, q, CL, CD, D: q * a.S * CD, atm };
}

/* Climb (dir +1) or descent (dir −1) between heights, marching in steps. */
export function transition(a, e, W0, h0, h1, sched, { dir, stepFt = 500 }) {
  let W = W0, R = 0, t = 0, fuel = 0, h = h0, ceiling = false;
  const dhs = stepFt * FT;
  while (dir > 0 ? h < h1 - 1e-6 : h > h1 + 1e-6) {
    const hn = dir > 0 ? Math.min(h + dhs, h1) : Math.max(h - dhs, h1);
    const hm = 0.5 * (h + hn);
    const M0 = scheduleMach(h, sched), M1 = scheduleMach(hn, sched), Mm = 0.5 * (M0 + M1);
    const V0 = M0 * isa(h).a, V1 = M1 * isa(hn).a;
    const ar = aero(a, W, hm, Mm);
    const sh = deckShape(Mm, hm / FT);
    const F = dir > 0 ? e.climbThrottle * sh.maxThrustRatio * e.F0 : sh.idleThrustRatio * e.F0;
    const excess = F / W - ar.CD / ar.CL;
    const dE = (hn - h) + (V1 * V1 - V0 * V0) / (2 * G);
    if (dir > 0 && excess <= 1e-4) { ceiling = true; break; }        // cannot climb further
    let dR = dE / excess;
    if (!(dR > 0)) dR = 0;                                             // descent steeper than idle glide: no distance credit
    const dt = dR > 0 ? dR / ar.V : Math.abs(hn - h) / 5;             // floor: 300 m/min when no distance is made
    const ff = dir > 0
      ? F * (e.tsfcCruise * sh.tsfcRatio) / 3600                       // N/s of fuel weight
      : sh.idleFuelPerLbf * e.F0 / 3600;
    const dW = ff * dt;
    W -= dW; fuel += dW; R += dR; t += dt; h = hn;
  }
  return { W, R, t, fuel, hEnd: h, ceiling };
}

function cruiseLeg(a, e, W0, hM, M, distM) {
  const tsfc = e.tsfcCruise * deckShape(M, hM / FT).tsfcRatio / 3600;   // 1/s
  const V = M * isa(hM).a;
  let E = aero(a, W0, hM, M), W1 = W0;
  for (let i = 0; i < 4; i++) {                                          // L/D at the mean weight
    const Em = aero(a, 0.5 * (W0 + W1), hM, M);
    W1 = W0 * Math.exp(-distM * tsfc / (V * (Em.CL / Em.CD)));
    E = Em;
  }
  return { W: W1, fuel: W0 - W1, t: distM / V, R: distM, E: E.CL / E.CD, CL: E.CL, V };
}

/* Lift coefficient of minimum drag at weight W and height hM: exact for a
   parabolic polar, a golden-section search on CD/CL otherwise. */
function minDragCL(a, W, hM) {
  if (!a.cd) return Math.sqrt(a.cd0 / a.k);
  const atm = isa(hM);
  const ratio = (CL) => {
    const M = Math.sqrt(2 * W / (atm.rho * a.S * CL)) / atm.a;
    return a.cd(M, CL, hM) / CL;
  };
  let lo = 0.1, hi = 1.5;
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - r * (hi - lo), x2 = lo + r * (hi - lo), f1 = ratio(x1), f2 = ratio(x2);
  for (let i = 0; i < 40; i++) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - r * (hi - lo); f1 = ratio(x1); }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + r * (hi - lo); f2 = ratio(x2); }
  }
  return 0.5 * (lo + hi);
}

/* Holding for `minutes` at hFt, minimum-drag lift coefficient. */
function hold(a, e, W0, hFt, minutes) {
  const hM = hFt * FT, atm = isa(hM);
  const CL = minDragCL(a, W0, hM);
  const V = Math.sqrt(2 * W0 / (atm.rho * a.S * CL));
  const M = V / atm.a;
  const tsfc = e.tsfcCruise * deckShape(M, hFt).tsfcRatio / 3600;
  const E = CL / (a.cd ? a.cd(M, CL, hM) : a.cd0 + a.k * CL * CL);
  const W1 = W0 * Math.exp(-(minutes * 60) * tsfc / E);                 // endurance Breguet
  return { W: W1, fuel: W0 - W1, t: minutes * 60, M };
}

/* Fuel flow (N/s) in cruise at weight W. */
function cruiseFuelFlow(a, e, W, hM, M) {
  const ar = aero(a, W, hM, M);
  return ar.D * e.tsfcCruise * deckShape(M, hM / FT).tsfcRatio / 3600;
}

/* The approach and hold that open the NBAA IFR reserve profile, as five
   Textron/Cessna flight planning guides print it verbatim (CJ3 2006 PDF
   p.21, CJ4 2012 p.21, M2 2017 p.27, Longitude 2019 p.23, Citation X
   viewer p.25; classes/business-jet/METHODS.md §8.5):

     a 5 minute approach at sea level
     climb to 5,000 feet
     a 5 minute hold at 5,000 feet
     climb to cruise altitude for the diversion to the alternate airport
     cruise at long range cruise power
     descend to sea level
     land with 30 minutes of holding fuel at 5,000 feet

   Only the diversion and the final 30 minutes were flown before; the
   approach and the hold at 5,000 ft were missing, and the diversion climb
   started at sea level rather than from the 5,000 ft the aircraft is
   already at. The alternate distance stays a parameter — the guides
   tabulate 100, 200 and 300 nm, and Textron quotes 100 nm for the M2 and
   CJ3 and 200 nm for the Latitude. The fuel-flow condition of the sea-level
   approach (gear and flap setting) is not stated in the guides, so it is
   flown clean at the minimum-drag speed, like the holds. */
const NBAA_HOLD_FT = 5000;
function nbaaMissedApproach(a, e, m, W0) {
  const approach = hold(a, e, W0, 0, 5);
  const up = transition(a, e, approach.W, 0, NBAA_HOLD_FT * FT,
                        { casKt: m.climbCasKt, mach: m.alternateMach }, { dir: 1 });
  const held = hold(a, e, up.W, NBAA_HOLD_FT, 5);
  return { W: held.W, fuel: W0 - held.W };
}

/* To an alternate: climb, cruise, descend (distance covers climb and descent).
   h0 is the height the diversion starts from, which is not sea level when a
   missed approach has already been flown. */
function alternateLeg(a, e, W0, m, h0 = 0) {
  const hTop = m.alternateAltFt * FT;
  const sched = { casKt: m.climbCasKt, mach: m.alternateMach };
  const up = transition(a, e, W0, h0, hTop, sched, { dir: 1 });
  const top = up.hEnd;
  let down = transition(a, e, up.W, top, 0, { casKt: m.descentCasKt, mach: m.alternateMach }, { dir: -1 });
  const cruiseDist = Math.max(0, m.alternateNm * NM - up.R - down.R);
  const cr = cruiseLeg(a, e, up.W, top, m.alternateMach, cruiseDist);
  down = transition(a, e, cr.W, top, 0, { casKt: m.descentCasKt, mach: m.alternateMach }, { dir: -1 });
  return { W: down.W, fuel: W0 - down.W, t: up.t + cr.t + down.t, R: up.R + cr.R + down.R };
}

/* The whole mission. grossN is the ramp weight (N), as FLOPS's gross weight
   is (TM-2017-219627 p.8); taxi fuel is burned from it before brake release.
   A stage shorter than climb plus descent has no cruise and flies the full
   climb and descent anyway (reported distances then exceed the stage).
     a  { S (m²), cd0, k } or { S, cd(M, CL, h m) }
     e  { F0 (N, all engines, sea-level static), tsfcCruise (lb/lbf/h), climbThrottle }
     m  { rangeNm, cruiseAltFt, cruiseMach, climbCasKt, descentCasKt, taxiMin,
          takeoffFuelFraction, reserve, alternateNm, alternateAltFt, alternateMach } */
export function flyMission(a, e, m, grossN) {
  if (!RESERVE_POLICIES.includes(m.reserve)) throw new Error(`Unknown reserve policy "${m.reserve}"`);
  const taxi = deckShape(0, 0).idleFuelPerLbf * e.F0 * (m.taxiMin / 60);   // N
  const W0 = grossN - taxi;
  const takeoff = m.takeoffFuelFraction * grossN;
  let W = W0 - takeoff;
  const hCr = m.cruiseAltFt * FT;
  const climb = transition(a, e, W, 0, hCr, { casKt: m.climbCasKt, mach: m.cruiseMach }, { dir: 1 });
  const hTop = climb.hEnd;
  /* Descent distance depends on the end-of-cruise weight: two passes. */
  let descent = transition(a, e, climb.W * 0.9, hTop, 0, { casKt: m.descentCasKt, mach: m.cruiseMach }, { dir: -1 });
  let cruise;
  for (let i = 0; i < 20; i++) {
    const dist = Math.max(0, m.rangeNm * NM - climb.R - descent.R);
    cruise = cruiseLeg(a, e, climb.W, hTop, m.cruiseMach, dist);
    const next = transition(a, e, cruise.W, hTop, 0, { casKt: m.descentCasKt, mach: m.cruiseMach }, { dir: -1 });
    const settled = Math.abs(next.R - descent.R) < 0.01;
    descent = next;
    if (settled) break;
  }
  const tripTime = climb.t + cruise.t + descent.t;
  const trip = taxi + takeoff + climb.fuel + cruise.fuel + descent.fuel;
  W = descent.W;

  /* Reserves, from the landing weight at destination. */
  const r = { contingency: 0, missedApproach: 0, alternate: 0, final: 0 };
  if (m.reserve === "us-flag") {
    r.contingency = cruiseFuelFlow(a, e, W, hTop, m.cruiseMach) * 0.10 * tripTime;
  } else if (m.reserve === "easa") {
    r.contingency = 0.05 * (trip - taxi);
  }
  let Wr = W - r.contingency;
  if (m.reserve === "nbaa") {
    const ma = nbaaMissedApproach(a, e, m, Wr);
    r.missedApproach = ma.fuel; Wr = ma.W;
  }
  const alt = alternateLeg(a, e, Wr, m, m.reserve === "nbaa" ? NBAA_HOLD_FT * FT : 0);
  r.alternate = alt.fuel; Wr = alt.W;
  if (m.reserve === "us-domestic") {
    r.final = cruiseFuelFlow(a, e, Wr, hTop, m.cruiseMach) * 45 * 60;
  } else if (m.reserve === "nbaa") {
    r.final = hold(a, e, Wr, NBAA_HOLD_FT, 30).fuel;
  } else {
    r.final = hold(a, e, Wr, 1500, 30).fuel;
  }
  const reserve = r.contingency + r.missedApproach + r.alternate + r.final;
  return {
    total: trip + reserve, trip, reserve, block: trip,
    segments: { taxi, takeoff, climb: climb.fuel, cruise: cruise.fuel, descent: descent.fuel, ...r },
    distances: { climb: climb.R / NM, cruise: cruise.R / NM, descent: descent.R / NM },
    times: { climb: climb.t / 60, cruise: cruise.t / 60, descent: descent.t / 60, trip: tripTime / 60 },
    topOfClimbFt: hTop / FT, ceilingLimited: climb.ceiling, cruiseLD: cruise.E, cruiseCL: cruise.CL,
    landingWeightN: W,
  };
}

/* Trip fuel only (no reserves) for a stage length, from weight grossN. */
export function tripFuelFor(a, e, m, grossN, rangeNm) {
  return flyMission(a, e, { ...m, rangeNm }, grossN).trip;
}
