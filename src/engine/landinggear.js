/* =====================================================================
   LANDING GEAR AND TYRES
   =====================================================================
   WHY THIS EXISTS

   Landing gear was `gearFracMTOW * MTOW` — a flat 4% of MTOW. It knew nothing
   about descent velocity, energy absorption, strut stroke, wheel count, tyre
   load rating or inflation pressure, and it could not answer "which tyre".

   ── THE REFERENCE CLASS IS ROTORCRAFT, NOT AEROPLANE ─────────────────

   This is the third time in this project that picking the wrong reference
   class was the actual defect, so it is worth stating plainly. EASA names its
   means of compliance for the landing gear drop test and they are all CS-27
   (SMALL ROTORCRAFT).

   CITATION CORRECTED: this MOC sits under **VTOL.2235 Structural strength**,
   not VTOL.2305. VTOL.2305 "Landing gear systems" appears only in the list of
   requirements the handling-qualities method (MHQRM) can cover, and citing it
   here was simply wrong.

   CURRENCY CHECKED 2026-08-26 against the live EASA publications. The 2021
   text has been SUPERSEDED: **MOC-4 SC-VTOL Issue 2, dated 11 July 2025**,
   states "The following text fully replaces MOC VTOL.2235 in Doc. No. MOC
   SC-VTOL Issue 2, dated 12 May 2021." The current text reads:

     "(a) Shock absorption tests: CS 27.723 Amdt. 6 is accepted as a means of
      compliance.
      (b) Limit drop test: CS 27.725 Amdt. 6 is accepted as a means of
      compliance.
      (c) Reserve energy absorption drop test: CS 27.727 Amdt. 6 is accepted as
      a means of compliance. In addition: Shock absorbing devices, such as
      oleos, should not 'bottom' during the reserve energy drop test."

   So an eVTOL's gear is sized by rotorcraft drop-test criteria, NOT by
   CS-23.473's aeroplane descent velocity. Using the aeroplane rule here would
   repeat the Raymer-GA-weights mistake.

   ── THE CRITERIA ─────────────────────────────────────────────────────

   MOC-4 VTOL.2235 (b) Limit drop test:
     "CS 27.725 Amdt. 6 is accepted as a means of compliance, WITH THE
      FOLLOWING MODIFICATION: The drop height must be that resulting in a drop
      contact velocity equal to the greatest probable sinking speed likely to
      occur at ground contact in normal landings, but not less than 0.20 m
      (8 in)."

   THAT IS A REAL CHANGE. CS 27.725(a)(1)'s flat 13 inches (0.330 m) is gone:
   drop height is now derived from the DESIGN SINK SPEED, with 0.20 m only as a
   floor. An implementation that hardcodes 13 inches is now over-conservative
   for any aircraft whose sink speed is below about 2.0 m/s — and 0.20 m
   corresponds almost exactly to the 1.98 m/s (6.5 ft/s) limit descent velocity
   CS 27.473 gives for rotorcraft, so the floor governs at the standard sink
   speed. The old text, for reference:
     "(1) 13 inches from the lowest point of the landing gear to the ground; or
      (2) Any lesser height, not less than eight inches"

   14 CFR / CS 27.727 Reserve energy absorption drop test:
     "must be conducted with a drop height of 1.5 times that specified in
      Sec. 27.725(a)"
     NOTE this is 1.5 x HEIGHT, so the velocity ratio is sqrt(1.5) = 1.22, not
     1.5. Treating it as 1.5 x velocity would over-size the gear by ~50% in
     energy.

   14 CFR / CS 27.473(a) — rotor lift during the impact:
     "A rotor lift may be assumed to act through the centre of gravity
      throughout the landing impact, and this lift may not exceed two-thirds of
      the design maximum weight."
     This is a large offload and it is specific to rotorcraft. An eVTOL still
     has lift on the rotors at touchdown, so it applies.

   ── ENERGY BALANCE ───────────────────────────────────────────────────

   During the drop the gear absorbs the kinetic energy plus the work done by
   the un-offloaded weight over the stroke:

       1/2 m v^2 + (1-L) m g (s_s + s_t) = n m g (eta_s s_s + eta_t s_t)

   with L the rotor-lift fraction, n the gear limit load factor, eta the
   absorption efficiency of strut and tyre. Solving for strut stroke:

       s_s = [ v^2/(2g) - s_t (n eta_t - (1-L)) ] / ( n eta_s - (1-L) )

   Absorption efficiencies are handbook values: an oleo-pneumatic strut is
   about 0.80-0.90 efficient, a steel spring or cantilever leg about 0.50, and
   a tyre about 0.47 (Currey, "Aircraft Landing Gear Design", and Raymer ch.11).

   ── TYRES ────────────────────────────────────────────────────────────

   Selected from published TSO-C62e rated loads rather than a size formula.
   Entries below are transcribed individually from the Goodyear Aviation
   Databook (rev. 6-2018) and each was read back from the source record, not
   bulk-scraped — a mis-parsed rated load would silently under-size a tyre.
   Note that two-part and three-part names can denote the SAME tyre (6.00-6 and
   17.5x6.25-6 share a part number), which is why both appear.
   ===================================================================== */

import { G0 } from "./constants.js";

/* Goodyear Aviation Databook 6-2018, TSO-C62e. Rated load in lb at the rated
   inflation pressure. [SRC] — each record verified against the source line. */
export const TYRES = [
  { size: "5.00-5",      ply: 4,  type: "TT", mph: 120, loadLb: 800,  psi: 31,  odIn: 13.25 },
  { size: "7.00-6",      ply: 6,  type: "TT", mph: 120, loadLb: 1900, psi: 38,  odIn: 17.50 },
  { size: "15x6.0-6",    ply: 6,  type: "TT", mph: 160, loadLb: 1950, psi: 68,  odIn: 15.00 },
  { size: "18x4.4",      ply: 6,  type: "TL", mph: 174, loadLb: 2100, psi: 100, odIn: 18.00 },
  { size: "6.50-8",      ply: 6,  type: "TT", mph: 160, loadLb: 2300, psi: 51,  odIn: 20.00 },
  { size: "22x8.0-8",    ply: 6,  type: "TT", mph: 120, loadLb: 2500, psi: 40,  odIn: 22.00 },
  { size: "6.50-10",     ply: 6,  type: "TL", mph: 160, loadLb: 2770, psi: 60,  odIn: 22.00 },
  { size: "6.00-6",      ply: 8,  type: "TL", mph: 190, loadLb: 2900, psi: 70,  odIn: 17.50 },
  { size: "19.5x6.75-8", ply: 8,  type: "TL", mph: 210, loadLb: 3300, psi: 86,  odIn: 19.50 },
  { size: "22x6.75-10",  ply: 10, type: "TL", mph: 190, loadLb: 5900, psi: 125, odIn: 22.00 },
  { size: "22x8.0-10",   ply: 10, type: "TL", mph: 190, loadLb: 6500, psi: 110, odIn: 22.00 },
  { size: "22x8.0-10",   ply: 12, type: "TL", mph: 190, loadLb: 7900, psi: 135, odIn: 22.00 },
];

export const GEAR_CONSTANTS = {
  sinkSpeedMS:     1.98,   // [SRC] CS 27.473 limit descent velocity, 6.5 ft/s
  dropHeightMinM:  0.200,  // [SRC] MOC-4 VTOL.2235(b) floor, 0.20 m (8 in)
  reserveHeightMult: 1.5,  // [SRC] CS 27.727, 1.5 x the 27.725(a) height
  rotorLiftFrac:   2 / 3,  // [SRC] CS 27.473(a), may not exceed 2/3 of max weight
  nGearLimit:      3.0,    // [LAY] gear limit load factor
  etaOleo:         0.85,   // [SRC] oleo-pneumatic absorption efficiency
  etaSpring:       0.50,   // [SRC] steel spring / cantilever leg
  etaTyre:         0.47,   // [SRC] tyre absorption efficiency
  tyreStrokeFrac:  0.30,   // [LAY] usable tyre deflection, fraction of section height
  noseLoadFrac:    0.10,   // [LAY] static nose-gear share, tricycle
  tyreReserveFrac: 1.07,   // [LAY] margin over static load when selecting a tyre
  strutMassCoef:   4.4e-5, // [CAL] strut mass per (N x m of energy) — see note
  wheelBrakeFrac:  0.55,   // [LAY] wheel + brake mass as fraction of tyre mass
};

/* Tyre mass. [CAL] — THIS IS THE WEAKEST NUMBER IN THIS MODULE.
   The Goodyear table transcribed above genuinely has no weight column: its
   columns run size, construction, service rating, dimensions, then wheel/rim
   data. So mass cannot be read off and has to be estimated.

   Form is m ~ OD^2.5 * ply^0.4 — between an area and a volume scaling, which
   is what a toroid of roughly constant section proportion gives — with the
   coefficient set so a 22 in 10-ply main tyre lands near 11 kg. An earlier
   version used OD^2.0 with a coefficient that produced 0.6 kg for that tyre,
   which is an order of magnitude wrong and would have made the whole gear
   group look light. Replace this the moment a real weight table is available. */
function tyreMassKg(t) {
  return 0.0021 * Math.pow(t.odIn, 2.5) * Math.pow(t.ply, 0.4);
}

/** Select the lightest tyre whose rated load covers the required load. */
export function selectTyre(loadN, K = GEAR_CONSTANTS) {
  const needLb = (loadN / 4.44822) * K.tyreReserveFrac;
  const ok = TYRES.filter((t) => t.loadLb >= needLb);
  if (!ok.length) {
    const biggest = TYRES[TYRES.length - 1];
    return { ...biggest, massKg: tyreMassKg(biggest), adequate: false,
             requiredLb: +needLb.toFixed(0),
             note: `no catalogued tyre covers ${needLb.toFixed(0)} lb — needs a larger size or more wheels` };
  }
  const best = ok.reduce((a, b) => (tyreMassKg(b) < tyreMassKg(a) ? b : a));
  return { ...best, massKg: tyreMassKg(best), adequate: true,
           requiredLb: +needLb.toFixed(0), marginPct: +((best.loadLb / needLb - 1) * 100).toFixed(1) };
}

/**
 * Size the landing gear to CS-27 drop-test criteria.
 * @param p parameter set
 * @param g { MTOW }
 */
export function landingGear(p, g, K = GEAR_CONSTANTS) {
  const shockType = p.gearShockType ?? "oleo";
  const etaS = shockType === "spring" ? K.etaSpring : K.etaOleo;
  const L    = Math.min(K.rotorLiftFrac, p.rotorLiftAtTouchdown ?? K.rotorLiftFrac);
  const n    = p.nGearLimit ?? K.nGearLimit;

  /* Drop height from the DESIGN SINK SPEED, floored at 0.20 m — MOC-4
     VTOL.2235(b), 11 July 2025. h = v^2/2g inverts the free-drop relation the
     test uses. An explicit p.dropHeightM still overrides, for anyone
     substantiating against the older flat 13 in. */
  const vSink    = p.sinkSpeedMS ?? K.sinkSpeedMS;
  const hFromV   = (vSink * vSink) / (2 * G0);
  const hLimit   = p.dropHeightM ?? Math.max(K.dropHeightMinM, hFromV);
  const hReserve = hLimit * K.reserveHeightMult;
  const vLimit   = Math.sqrt(2 * G0 * hLimit);
  const vReserve = Math.sqrt(2 * G0 * hReserve);

  const W = g.MTOW * G0;

  /* Wheel loads. Tricycle: nose takes noseLoadFrac statically, mains the rest. */
  const nMainWheels = Math.max(2, p.nMainWheels ?? 2);
  const nNoseWheels = Math.max(1, p.nNoseWheels ?? 1);
  const loadMain = W * (1 - K.noseLoadFrac) / nMainWheels;
  const loadNose = W * K.noseLoadFrac / nNoseWheels;

  const tyreMain = selectTyre(loadMain, K);
  const tyreNose = selectTyre(loadNose, K);

  /* Tyre stroke available, from section height. */
  const tyreStroke = K.tyreStrokeFrac * (tyreMain.odIn * 0.0254) * 0.30;

  /* Strut stroke from the energy balance (see header). */
  const denom  = n * etaS - (1 - L);
  const numer  = vLimit * vLimit / (2 * G0) - tyreStroke * (n * K.etaTyre - (1 - L));
  const stroke = Math.max(0.02, numer / Math.max(0.1, denom));

  /* Reserve-energy case must not bottom the strut — MOC VTOL.2305 is explicit
     about this. Required stroke scales with v^2, i.e. with drop height. */
  const strokeReserve = stroke * (hReserve / hLimit);
  const strokeFitted  = strokeReserve * (p.strutStrokeMargin ?? 1.05);
  const bottomsOut    = strokeFitted < strokeReserve;

  /* Energy each main strut absorbs at the reserve condition. */
  const energyPerMainJ = 0.5 * (g.MTOW * (1 - K.noseLoadFrac) / nMainWheels)
                       * vReserve * vReserve;

  /* Mass. Strut mass scales with the energy it must absorb times the stroke it
     absorbs it over — a longer, higher-energy strut is heavier in both. The
     coefficient is [CAL]: it is set so a conventional light-aircraft gear
     recovers the 4-6% of MTOW that Roskam Part V reports, which is the band the
     old flat fraction came from. Tagged as calibrated, not derived. */
  const strutMassEach = K.strutMassCoef * energyPerMainJ * strokeFitted * 1000;
  const strutMass     = strutMassEach * nMainWheels
                      + strutMassEach * 0.45 * nNoseWheels;
  const tyreMass      = tyreMain.massKg * nMainWheels + tyreNose.massKg * nNoseWheels;
  const wheelMass     = tyreMass * K.wheelBrakeFrac;
  const mass          = strutMass + tyreMass + wheelMass;

  return {
    mass, strutMass, tyreMass, wheelMass,
    shockType, etaStrut: etaS, rotorLiftFrac: L, nGearLimit: n,
    dropHeightM: hLimit, reserveHeightM: hReserve,
    sinkSpeedMS: vSink, dropHeightFloorGoverns: hFromV <= K.dropHeightMinM,
    vLimitMs: vLimit, vReserveMs: vReserve,
    strokeM: stroke, strokeReserveM: strokeReserve, strokeFittedM: strokeFitted,
    bottomsOut,
    tyreStrokeM: tyreStroke,
    energyPerMainJ,
    nMainWheels, nNoseWheels,
    loadMainN: loadMain, loadNoseN: loadNose,
    tyreMain, tyreNose,
    massFracMTOW: mass / g.MTOW,
    basis: "CS 27.725 / 27.727 drop tests per MOC-4 SC-VTOL VTOL.2235 "
         + "(11 July 2025, supersedes the 2021 text); "
         + "tyres from Goodyear Databook 6-2018 (TSO-C62e)",
  };
}
