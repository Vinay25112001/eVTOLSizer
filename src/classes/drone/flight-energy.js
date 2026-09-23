/* =====================================================================
   FLIGHT ENERGY — what the flight costs the pack, and what it cannot say
   =====================================================================
   The 6-DOF loop knows how much thrust each rotor is making at every
   instant. The sizing chain knows what a given thrust costs at the pack
   terminals. This module joins them, so a flight can run the pack down
   and END when the usable energy is gone, the way it already ends when
   the aircraft touches the ground.

   IT ADDS NO NEW PHYSICS AND NO NEW NUMBER. Every step of the chain is
   the one `sizing.js` already uses for the hover point, called with the
   same arguments in the same order:

     thrust per rotor  -> rpm, shaft power   rotor.js, measured UIUC curve
     -> motor demand                         motor.js, published Kv/Kt/I0/Rm
     -> bus power                            esc.js, measured joint residual
     -> pack power       N * bus + avionics   sizing.js:222 convention
     -> energy           integrated over t    this module

   The test of that claim is an identity, not an opinion: integrating a
   steady hover to empty must reproduce `enduranceMin()` to the minute,
   because it is the same power through the same pack. The gate checks it.

   ── WHAT THIS MUST NOT CLAIM, AND DOES NOT ─────────────────────────
   `battery.js` is explicit that the surveyed packs publish no
   rate-capacity curve, no temperature derating and no cycle life, and
   that "modelling any of it would mean inventing the curve". No pack in
   the survey publishes an internal resistance or a voltage-vs-state-of-
   charge curve either, and `usableFraction` exists as a REQUIRED
   declared input precisely because no vendor states a cut-off criterion.

   So the state of charge here is an ENERGY FRACTION of the declared
   usable energy, at the pack's published nominal voltage, and it carries
   exactly the four assumptions `enduranceMin().assumes` already carries.
   It is not a coulomb count, there is no sag, the bus voltage does not
   droop as the pack empties, and nothing is derated for rate or
   temperature. `ASSUMES` below is printed wherever the figure is shown.

   There is also no low-battery threshold, no reserve and no failsafe.
   `autopilot.js` refuses PX4's SoC thresholds on the grounds that
   "guessing them would set a failsafe the user believes was computed",
   and the same reasoning applies here: the flight ends when the DECLARED
   usable energy is exhausted, which is a boundary the user set, and at
   no other point.

   ── THE ONE REAL GAP, AND WHY IT IS A BOUND RATHER THAN A GUESS ────
   `rpmForThrust` refuses to extrapolate beyond the propeller's measured
   thrust range — inventing a coefficient is the one thing this tool must
   not do. The measured floor for a 14x7 at sea level is 0.386 N, and a
   rotor commanded below that has no rpm this data can name.

   That happens. In a healthy hover it never does: 0 of 18,006
   rotor-samples measured. With one rotor of a hexacopter dead it happens
   on about 20 % of the LIVE rotor samples, because the allocator idles
   the rotor opposite the failed one to keep the moments balanced.

   The gap is not filled. It is BOUNDED, which the measured data supports
   and an extrapolation would not: shaft power rises monotonically with
   thrust across the whole measured curve, so a rotor below the measured
   floor draws strictly LESS than the floor's own measured bus power.
   Every such sample adds its bound to `unaccountedMaxWh` and nothing to
   `energyWh`, so the true energy lies in
   `[energyWh, energyWh + unaccountedMaxWh]` and the interval is reported
   rather than being collapsed to a point. On the failure case above the
   bound is a fraction of a watt against a 452 W hover, so the interval
   is tight — but it is stated, and if a design ever made it wide the
   number would say so instead of looking exact.

   A thrust ABOVE the measured ceiling is a different matter: it cannot
   be bounded from below-the-data, so it is counted separately as
   `refusedSamples` and makes the whole figure unavailable. In practice
   the allocator cannot ask for it — `maxThrustPerRotorN` is derived from
   the propeller's own maximum measured rpm, so the ceiling the allocator
   enforces IS the measured ceiling — but a future component set could
   break that, and it would be caught rather than silently extrapolated.
   ===================================================================== */
import { rpmForThrust } from "./rotor.js";
import { motorConstants, motorPointFromShaftPower } from "./motor.js";
import { escPoint } from "./esc.js";
import { usableEnergyWh } from "./battery.js";

/* The same four the endurance figure carries, because this is the same
   pack model integrated over time rather than divided into a constant. */
export const ASSUMES = Object.freeze([
  "the pack's published nominal voltage, held constant — no pack in the survey publishes a voltage-vs-state-of-charge curve or an internal resistance, so there is no sag and no droop as it empties",
  "a fresh pack at its rated capacity",
  "room temperature",
  "no rate-capacity (Peukert) derating — no surveyed pack publishes the curve",
]);

/* State of charge is an energy fraction of the DECLARED usable energy,
   not of the pack's total. At usableFraction 0.85 an exhausted flight
   has 15 % of the pack's published energy still in it, unreachable by
   the cut-off the user declared. Stated so the two cannot be confused —
   `autopilot.js` makes the same distinction about BAT1_V_EMPTY. */
export const SOC_MEANING = Object.freeze({
  isFractionOf: "declared usable energy",
  isNotFractionOf: "the pack's published total energy",
  isCoulombCount: false,
});

/* Probe the propeller's own measured thrust range, and the bus power at
   its floor. Both come out of the measured data, not a parameter. */
function measuredEnvelope(propeller, motor, escEntry, packVoltageV, rho) {
  /* rpmForThrust reports the range it refused against. */
  const below = rpmForThrust(propeller, 1e-9, rho);
  const range = below.measuredThrustRangeN
    ?? rpmForThrust(propeller, Number.MAX_SAFE_INTEGER, rho).measuredThrustRangeN;
  if (!range) throw new Error("flight-energy: the propeller reports no measured thrust range");
  const [floorN, ceilingN] = range;
  /* The floor's own bus power is the bound a sub-floor rotor cannot exceed. */
  const atFloor = rotorPoint(
    { propeller, motor, escEntry, packVoltageV, rho, measuredThrustRangeN: range },
    floorN);
  if (!atFloor.computable)
    throw new Error("flight-energy: the propeller's measured floor is not itself computable");
  return { floorN, ceilingN, floorBusPowerW: atFloor.busPowerW };
}

/* ── ONE ROTOR, ONE INSTANT ──────────────────────────────────────────
   Returns what the chain can say and, when it cannot, which side of the
   measured data the request fell on. `busPowerW` is PER ROTOR and
   excludes avionics, exactly as `escPoint` returns it. */
export function rotorPoint(em, thrustN) {
  if (!(thrustN > 0)) {
    /* Not a data gap. A rotor making no thrust is a rotor that is not
       being driven, which is the same statement the allocator makes when
       it sets eta = 0 for a failed motor. */
    return { computable: true, busPowerW: 0, idle: true };
  }
  const r = rpmForThrust(em.propeller, thrustN, em.rho);
  if (r.rpm == null) {
    const aboveCeiling = em.measuredThrustRangeN != null
      && thrustN > em.measuredThrustRangeN[1];
    return { computable: false, aboveCeiling, reason: r.reason,
             measuredThrustRangeN: r.measuredThrustRangeN };
  }
  const mp = motorPointFromShaftPower(em.motor, { shaftPowerW: r.powerW, rpm: r.rpm });
  const e = escPoint(mp, { packVoltageV: em.packVoltageV, escEntry: em.escEntry });
  return {
    computable: true,
    busPowerW: e.busPowerW,
    busPowerW_p10: e.busPowerW_p10, busPowerW_p90: e.busPowerW_p90,
    feasible: e.feasible,
    rotorMode: r.mode, lookupMode: e.lookupMode,
    rpm: r.rpm, shaftPowerW: r.powerW,
  };
}

/* ── THE WHOLE AIRCRAFT, ONE INSTANT ─────────────────────────────────
   `thrusts` is the per-rotor thrust the integrator is carrying, in the
   same order as `model.rotors`. The aggregation is sizing.js:222's:
   N rotors' bus power plus the declared avionics draw. */
export function packPoint(em, thrusts) {
  let packPowerW = em.avionicsPowerW;
  let p10 = em.avionicsPowerW, p90 = em.avionicsPowerW;
  let unaccountedMaxW = 0, subFloor = 0, refused = 0, clamped = 0, infeasible = 0;

  for (const T of thrusts) {
    const p = rotorPoint(em, T);
    if (!p.computable) {
      if (p.aboveCeiling) { refused++; continue; }
      /* Below the measured floor: bounded, not guessed. */
      subFloor++;
      unaccountedMaxW += em.floorBusPowerW;
      continue;
    }
    packPowerW += p.busPowerW;
    p10 += p.busPowerW_p10 ?? p.busPowerW;
    p90 += p.busPowerW_p90 ?? p.busPowerW;
    if (p.lookupMode?.startsWith("clamped") || p.rotorMode?.startsWith("clamped")) clamped++;
    if (p.feasible === false) infeasible++;
  }
  return { packPowerW, packPowerW_p10: p10, packPowerW_p90: p90,
           unaccountedMaxW, subFloor, refused, clamped, infeasible,
           packCurrentA: packPowerW / em.packVoltageV };
}

/* ── THE MODEL THE SIMULATION CARRIES ────────────────────────────────
   Plain and structured-cloneable, because the flight runs in a worker.
   `motorConstants` returns a frozen plain object and the propeller,
   ESC and pack records are plain data, so nothing here needs rebuilding
   on the far side of postMessage. */
export function buildEnergyModel({ selection, declared, sizing }) {
  if (!selection?.propeller || !selection?.motor || !selection?.esc)
    throw new Error("flight-energy: a propeller, motor and ESC must be selected");
  if (!(declared?.avionicsPowerW >= 0))
    throw new Error("flight-energy: avionicsPowerW must be declared — see DECLARED_INPUTS");
  if (!(selection.packVoltageV > 0))
    throw new Error("flight-energy: the pack reports no nominal voltage");

  const motor = motorConstants(selection.motor);
  const rho = sizing.rho;
  const packs = sizing.massBreakdown?.packs ?? 1;
  /* usableEnergyWh throws when usableFraction is absent, which is the
     behaviour we want: there is no defensible default. */
  const energy = usableEnergyWh(selection.battery,
    { usableFraction: declared.usableFraction, packs });

  const env = measuredEnvelope(selection.propeller, motor, selection.esc,
                               selection.packVoltageV, rho);

  return Object.freeze({
    propeller: selection.propeller,
    motor,
    escEntry: selection.esc,
    packVoltageV: selection.packVoltageV,
    avionicsPowerW: declared.avionicsPowerW,
    rho, packs,
    usableWh: energy.usableWh,
    totalWh: energy.totalWh,
    usableFraction: declared.usableFraction,
    measuredThrustRangeN: Object.freeze([env.floorN, env.ceilingN]),
    floorBusPowerW: env.floorBusPowerW,
    assumes: ASSUMES,
    socMeaning: SOC_MEANING,
  });
}
