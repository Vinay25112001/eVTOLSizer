/* =====================================================================
   CLASSIFY — what a take-off mass means, legally and to this tool
   =====================================================================
   Two questions that are routinely conflated and are not the same:

     1. WHAT RULES APPLY at this mass, and under whose law.
     2. WHETHER THIS TOOL CAN SIZE IT from measured data.

   They have different answers and different failure modes, so they are
   answered separately and neither is allowed to imply the other.

   ── ON THE LEGAL SIDE ────────────────────────────────────────────────
   This module never returns a single class name. The sourced rules do not
   support one:

     - 25 kg and 55 lb are DIFFERENT LIMITS, 52 g apart, and both are
       strict. A 25.000 kg design is outside the open category in Europe
       AND outside Part 107 in the United States.
     - "Nano" has no legal basis in any jurisdiction that could be
       sourced. "Micro" and "medium" DO -- Australia's CASR 101.022 and
       Canada's CARs 900.01 -- but with different numbers from each other
       and from NATO doctrine, where MICRO is under 2 kg against
       Australia's 250 g.
     - Mass alone is frequently not the trigger. Europe registers on an
       80 J impact-energy branch and on carrying a personal-data sensor at
       ANY mass; the United States' 0.55 lb exemption is a REGISTRATION
       relief available only to recreational flight and evaporates the
       moment the same aircraft is flown commercially.

   So the result carries the thresholds crossed, per jurisdiction, with
   the clause that sets each one -- and an explicit list of what could not
   be decided from a mass. An honest "this depends on something you have
   not told me" is the correct output, not a guess.

   ── ON THE SIZING SIDE ───────────────────────────────────────────────
   The envelope is set by the measured propeller data, not by law, and it
   happens to run out near the same place: the largest measured propeller
   is 21 in, so a quadcopter tops out near 12 kg and an octocopter near
   25 kg on measured data. Above that, sizing would need rotors of 34 in
   at 25 kg and 67 in at 100 kg, for which no measured low-Reynolds data
   is held. Those are reported as OUT OF ENVELOPE with what they would
   require, rather than sized on an extrapolation.

   There is a real gap between the two engines and it is stated rather
   than hidden: this engine is validated on measured data to about 25 kg,
   the eVTOL engine's correlations are fitted from 620 kg up, and nothing
   validates 25-620 kg.
   ===================================================================== */
import { THRESHOLDS, NON_MASS_TRIGGERS, US_PART107_CEILING_KG, EU_OPEN_CEILING_KG } from "../../data/drone-regulatory.js";

/* The measured-data envelope. Both numbers are computed in
   eVTOL_Sizing_Research/datasets/drone (coverage analysis) from the
   largest measured propeller at a thrust-to-weight ratio of 2, which is
   the design margin stated there rather than assumed here. */
export const ENVELOPE = Object.freeze({
  twr: 2.0,
  largestMeasuredPropIn: 21,
  maxMassKg: Object.freeze({ 3: 9.2, 4: 12.3, 6: 18.5, 8: 24.7, 12: 37.0, 16: 49.3 }),
  evtolEngineFloorKg: 620,      // lowest MTOW in the eVTOL validation set
  evtolEngineCeilingKg: 3724,
});

/* Rotor diameter a heavier multirotor would need, scaled at CONSTANT DISC
   LOADING from the largest measured propeller. That is the gentlest
   possible scaling and therefore a LOWER bound on the size required — the
   real answer is larger, because disc loading normally falls as machines
   grow. Returned so an out-of-envelope answer can say what it would take
   rather than only that it cannot. */
const DISC_LOADING_NM2 = 213.0;               // largest measured prop at its top measured RPM
const G = 9.80665;
export function requiredRotorDiameterIn(massKg, rotors, twr = ENVELOPE.twr) {
  const thrustPerRotorN = massKg * G * twr / rotors;
  const areaM2 = thrustPerRotorN / DISC_LOADING_NM2;
  return Math.sqrt(4 * areaM2 / Math.PI) / 0.0254;
}

/* Every threshold at or below this mass, i.e. the ones it has crossed,
   grouped by jurisdiction. A threshold is "crossed" when the aircraft is
   at or above it — the rules are written as "X g or more" / "less than Y",
   so the boundary itself matters and strict comparisons are used. */
export function thresholdsFor(massKg, { includeProposed = false } = {}) {
  const live = THRESHOLDS.filter((t) =>
    includeProposed || /force/i.test(t.status ?? "") || /doctrine|model/i.test(t.jurisdiction));
  const crossed = live.filter((t) => massKg >= t.kg);
  const next = live.filter((t) => massKg < t.kg).sort((a, b) => a.kg - b.kg)[0] ?? null;
  const byJurisdiction = {};
  for (const t of crossed) (byJurisdiction[t.jurisdiction] ??= []).push(t);
  return { crossed, next, byJurisdiction };
}

/* The two ceilings that matter most, answered exactly rather than
   approximately, because they differ by 52 g and both are strict. */
export function ceilingStatus(massKg) {
  return {
    usPart107: {
      limitKg: US_PART107_CEILING_KG, statedAs: "55 lb",
      within: massKg < US_PART107_CEILING_KG,
      note: massKg >= US_PART107_CEILING_KG
        ? "Above Part 107 entirely. Not waivable — 14 CFR 107.205 enumerates the waivable sections and 107.3 is not among them. The routes are a 49 USC 44807 exemption, or airworthiness certification under 14 CFR 21.17(b) or 21.25."
        : null,
    },
    euOpen: {
      limitKg: EU_OPEN_CEILING_KG, statedAs: "25 kg",
      within: massKg < EU_OPEN_CEILING_KG,
      note: massKg >= EU_OPEN_CEILING_KG
        ? "Above the open category. The SPECIFIC category has no upper mass limit, so this is an operational-authorisation question rather than a hard ceiling."
        : null,
    },
    /* The 52 g band where the two disagree — narrow, real, and easy to
       design straight into by rounding one limit to the other. */
    betweenTheTwoCeilings: massKg >= US_PART107_CEILING_KG && massKg < EU_OPEN_CEILING_KG,
  };
}

/* Can this tool size it from measured data? */
export function sizingEnvelope(massKg, rotors = 4) {
  const max = ENVELOPE.maxMassKg[rotors];
  if (max === undefined)
    return { supported: false, reason: `no coverage figure computed for ${rotors} rotors`,
             rotorsWithCoverage: Object.keys(ENVELOPE.maxMassKg).map(Number) };
  if (massKg <= max)
    return { supported: true, maxMassKg: max, rotors,
             basis: "measured propeller data at a thrust-to-weight ratio of 2" };
  const needIn = requiredRotorDiameterIn(massKg, rotors);
  const inGap = massKg > max && massKg < ENVELOPE.evtolEngineFloorKg;
  return {
    supported: false, maxMassKg: max, rotors,
    requiredRotorDiameterIn: needIn,
    largestMeasuredPropIn: ENVELOPE.largestMeasuredPropIn,
    reason: `a ${rotors}-rotor vehicle of ${massKg} kg needs about ${needIn.toFixed(0)} in rotors, ` +
            `against a largest measured propeller of ${ENVELOPE.largestMeasuredPropIn} in`,
    gap: inGap
      ? `${max} kg to ${ENVELOPE.evtolEngineFloorKg} kg is validated by neither engine: above this ` +
        `engine's measured propeller data and below the eVTOL engine's fitted range ` +
        `(${ENVELOPE.evtolEngineFloorKg}-${ENVELOPE.evtolEngineCeilingKg} kg).`
      : null,
    evtolEngineApplies: massKg >= ENVELOPE.evtolEngineFloorKg,
  };
}

/* The whole picture for a mass, legal and practical, with what a mass
   cannot settle listed rather than silently resolved. */
export function classify(massKg, { rotors = 4, includeProposed = false } = {}) {
  if (!Number.isFinite(massKg) || massKg <= 0)
    throw new Error(`classify: take-off mass must be positive, got ${massKg}`);
  return {
    massKg,
    ...thresholdsFor(massKg, { includeProposed }),
    ceilings: ceilingStatus(massKg),
    sizing: sizingEnvelope(massKg, rotors),
    undecidable: NON_MASS_TRIGGERS,
  };
}
