/* =====================================================================
   SIZING — the closure, by SELECTING real parts rather than correlating
   =====================================================================
   This is where the four measured blocks become an aircraft. Given a
   mission and a set of real components, it solves the fixed point every
   aircraft sizing problem has:

       MTOM = payload + structure + propulsion(MTOM) + battery(MTOM)

   and the loop closes because every term on the right is either a
   published mass or a computed consequence of one.

   ── WHY THIS IS A DIFFERENT PROBLEM FROM THE AIRCRAFT SIDE ───────────
   At airliner scale, component masses are ESTIMATED from correlations
   fitted to historical fleets, and the error floor is the correlation's.
   At drone scale nothing is estimated: a real motor, a real propeller, a
   real ESC and a real pack are SELECTED, each with a published mass and a
   measured performance curve. Drone sizing is a selection problem, not a
   regression problem — which is the only reason a tight accuracy target
   is reachable here at all.

   It also means the loop can FAIL HONESTLY in ways a correlation cannot.
   A correlation always returns a number. A selection returns "no
   propeller in the measured database can make that thrust", which is a
   true and useful answer.

   ── THE CHAIN, AND WHERE EACH LINK'S EVIDENCE COMES FROM ─────────────
     thrust required   MTOM * g / N                        definition
     -> rpm            rotor.js, measured UIUC curve       4,145 rows
     -> shaft power    rotor.js, measured C_P              same
     -> motor demand   motor.js, published Kv/Kt/I0/Rm     419 KDE rows
     -> bus power      esc.js, measured joint residual     one ESC
     -> energy         battery.js, published Wh            vendor pages
     -> pack count     ceil(energy / pack energy)          arithmetic
     -> MTOM           sum of published masses             vendor pages

   Every link refuses rather than extrapolating, so a converged result
   means every link was inside the data that supports it. `warnings`
   carries anything that was not.

   ── THE ONE MASS NOBODY PUBLISHES ────────────────────────────────────
   Structure. Not one manufacturer in the vehicle survey publishes a
   frame mass, and only one publishes an empty weight at all (Freefly's
   Alta X, 10.4 kg — which still bundles motors, ESCs, propellers and
   avionics together and so cannot be decomposed). One data point is not
   a correlation.

   So `structureMassKg` is a REQUIRED declared input with no default, the
   same treatment `usableFraction` gets in the battery layer and figure of
   merit gets in the rotor layer. A structure fraction invented here would
   silently set the answer: structure is the second largest mass in the
   vehicle, so a wrong guess moves MTOM more than any component choice the
   tool is supposedly making.

   That is a real limitation of the published art, and the tool states it
   rather than papering over it with a fitted fraction.

   ── CONVERGENCE ──────────────────────────────────────────────────────
   Fixed-point iteration on MTOM. It is damped, and it reports which of
   the three outcomes occurred rather than returning the last iterate of a
   runaway — a lesson this repository already learned on the eVTOL side,
   where a non-converged multicopter returned a plausible-looking number
   with `r2Converged` quietly false.

     "converged"     successive iterates within tolerance
     "diverged"      mass growing without bound — battery mass is rising
                     faster than the thrust it buys, so no fixed point
                     exists for this combination
     "infeasible"    a link in the chain refused: the propeller cannot
                     make the thrust, the pack cannot drive the motor,
                     or a published limit is exceeded
   ===================================================================== */
import { staticThrustN, staticShaftPowerW, rpmForThrust, figureOfMerit, discLoading, RHO_SEA_LEVEL }
  from "./rotor.js";
import { motorConstants, motorPointFromShaftPower, limitStatus } from "./motor.js";
import { escPoint, escLimitStatus } from "./esc.js";
import { packEnergyWh, usableEnergyWh, enduranceMin, dischargeLimitStatus, normalisePack }
  from "./battery.js";

export const G = 9.80665;

/* ISA density at altitude. Used only when a caller gives an altitude
   instead of a density; the troposphere form, stated rather than buried. */
export function isaDensity(altitudeM = 0) {
  if (altitudeM < 0) throw new Error(`sizing: altitude must be >= 0, got ${altitudeM}`);
  const T0 = 288.15, L = 0.0065, R = 287.058, g = 9.80665, p0 = 101325;
  const T = T0 - L * altitudeM;
  const p = p0 * Math.pow(T / T0, g / (L * R));
  return p / (R * T);
}

/* Inputs a caller MUST declare, with what is known about each. Exposed so
   a UI can render them as declared inputs with their provenance rather
   than as anonymous form fields. */
export const DECLARED_INPUTS = Object.freeze([
  Object.freeze({
    key: "structureMassKg", required: true, units: "kg",
    what: "Frame, arms, landing gear, wiring and fasteners — everything that is not payload, propulsion or battery.",
    whyDeclared: "No manufacturer in the vehicle survey publishes a frame mass. "
      + "Freefly publishes an empty weight of 10.4 kg for the Alta X, but it bundles "
      + "motors, ESCs, propellers and avionics with the structure and cannot be "
      + "decomposed. One data point is not a correlation.",
    reference: "Alta X empty 10.4 kg at 34.9 kg MTOM (Freefly brochure) — the only "
      + "published empty weight in the survey, and not a frame mass.",
  }),
  Object.freeze({
    key: "usableFraction", required: true, units: "-",
    what: "Fraction of pack energy actually available before the discharge cut-off.",
    whyDeclared: "No manufacturer page in the survey states a cut-off criterion.",
    reference: "Dai et al. T-Mech 2019 Eq. (38) uses 0.85; Bauersfeld & Scaramuzza "
      + "define end of discharge as 3.5 V/cell, which is a different kind of criterion.",
  }),
  Object.freeze({
    key: "avionicsMassKg", required: true, units: "kg",
    what: "Flight controller, receiver, GNSS, telemetry, cabling.",
    whyDeclared: "Selectable from the catalogue, but the set of items carried is a "
      + "design choice, not a published quantity.",
    reference: "Pixhawk 6X module 23 g + standard baseboard 51 g = 74 g, before "
      + "GNSS, radio and wiring (Holybro technical specification).",
  }),
  Object.freeze({
    key: "avionicsPowerW", required: true, units: "W",
    what: "Continuous electrical draw of everything that is not propulsion.",
    whyDeclared: "Depends on payload and radio duty, neither of which is a property "
      + "of the airframe.",
    reference: "Dai et al. T-Mech 2019 assume I_other ~ 0.5 A 'if there is only a "
      + "flight controller on the multicopter'.",
  }),
  Object.freeze({
    key: "thrustToWeightRequired", required: true, units: "-",
    what: "Total available static thrust divided by weight, at full throttle.",
    whyDeclared: "A handling-qualities and mission choice, not a physical constant.",
    reference: "Dai et al. define the inverse, the thrust ratio zeta = T_hover/T_max, "
      + "and state 'zeta = 0.5 is selected for common multicopters' — i.e. T/W = 2. "
      + "The Alta X payload table spans T/W 1.9 to 3.5.",
  }),
]);

function requireDeclared(d) {
  const missing = DECLARED_INPUTS.filter((x) => x.required && !(d?.[x.key] > 0 || d?.[x.key] === 0))
    .map((x) => x.key);
  if (missing.length)
    throw new Error(`sizing: these inputs must be declared explicitly, with no default — `
      + `${missing.join(", ")}. See DECLARED_INPUTS for why each one cannot be assumed.`);
  if (!(d.usableFraction > 0 && d.usableFraction <= 1))
    throw new Error("sizing: usableFraction must be in (0, 1]");
  if (!(d.thrustToWeightRequired >= 1))
    throw new Error("sizing: thrustToWeightRequired must be at least 1 — below that it cannot hover");
}

/* Mass of one propulsion unit: motor + propeller + ESC, all published.
   A propeller with no published mass makes the whole build unmassable,
   which is reported rather than filled in with a typical value. */
function unitMass(sel) {
  const warn = [];
  const motorG = sel.motor?.mass_g_with_cables ?? sel.motor?.mass_g ?? null;
  if (sel.motor?.mass_g_with_cables == null && sel.motor?.mass_g != null)
    warn.push(`${sel.motor.model}: mass is the bare motor; the vendor also publishes a `
      + `with-cables figure for some motors and it is 20-30 % higher`);
  const propG = sel.propellerMassG ?? null;
  if (propG == null) warn.push("propeller mass is not published in the measured database "
    + "(UIUC records geometry and performance, not mass) — declare propellerMassG");
  let escG = sel.esc?.mass_g ?? null;
  if (escG && typeof escG === "object") {
    const vals = Object.values(escG).filter((v) => typeof v === "number");
    escG = vals.length ? Math.min(...vals) : null;
    warn.push(`${sel.esc.model}: the vendor publishes more than one mass for this part; `
      + `the lightest (${escG} g) is used and the spread is ${Math.max(...Object.values(sel.esc.mass_g))} g`);
  }
  return {
    motorKg: motorG == null ? null : motorG / 1000,
    propellerKg: propG == null ? null : propG / 1000,
    escKg: escG == null ? null : escG / 1000,
    totalKg: [motorG, propG, escG].some((x) => x == null) ? null
      : (motorG + propG + escG) / 1000,
    warnings: warn,
  };
}

/* One evaluation of the chain at a given all-up mass. No iteration here —
   this is the function the fixed point is taken of, and it is exported so
   a caller can plot it. */
export function evaluateAtMass(massKg, sel, declared, opts = {}) {
  const rho = opts.rho ?? (opts.altitudeM != null ? isaDensity(opts.altitudeM) : RHO_SEA_LEVEL);
  const N = sel.rotors;
  const warnings = [];
  const thrustPerRotorN = massKg * G / N;

  const r = rpmForThrust(sel.propeller, thrustPerRotorN, rho);
  if (r.rpm == null) {
    return {
      feasible: false, reason: "propeller cannot make the required thrust",
      detail: `${sel.propeller.id} needs ${thrustPerRotorN.toFixed(2)} N per rotor; its `
        + `measured range delivers ${r.measuredThrustRangeN[0].toFixed(2)}-`
        + `${r.measuredThrustRangeN[1].toFixed(2)} N between ${r.measuredRpmRange[0]} and `
        + `${r.measuredRpmRange[1]} rpm. Extrapolating a measured curve is refused.`,
      thrustPerRotorN, rho,
    };
  }

  const shaft = staticShaftPowerW(sel.propeller, r.rpm, rho);
  if (shaft.mode?.startsWith("clamped"))
    warnings.push(`propeller power is CLAMPED at the edge of its measured range`);

  const mc = motorConstants(sel.motor);
  const mp = motorPointFromShaftPower(mc, { shaftPowerW: shaft.powerW, rpm: r.rpm });
  const ml = limitStatus(mc, mp);
  if (ml.current.within === false)
    warnings.push(`${sel.motor.model}: ${mp.currentA.toFixed(1)} A exceeds the published `
      + `${ml.current.max} A continuous rating`);

  const packV = sel.packVoltageV;
  const e = escPoint(mp, { packVoltageV: packV, escEntry: sel.esc });
  warnings.push(...e.warnings);
  if (!e.feasible) {
    return {
      feasible: false, reason: "pack cannot drive the motor at this operating point",
      detail: e.warnings[0], thrustPerRotorN, rpm: r.rpm, rho,
    };
  }

  const busPowerW = N * e.busPowerW + declared.avionicsPowerW;
  const busPowerW_p90 = N * e.busPowerW_p90 + declared.avionicsPowerW;
  const busPowerW_p10 = N * e.busPowerW_p10 + declared.avionicsPowerW;

  return {
    feasible: true, rho, thrustPerRotorN,
    rpm: r.rpm, rotorMode: r.mode,
    shaftPowerW: shaft.powerW,
    figureOfMerit: figureOfMerit(sel.propeller, r.rpm).fm,
    discLoadingNM2: discLoading(sel.propeller, r.rpm, rho).discLoadingNM2,
    motor: mp, motorLimits: ml,
    esc: e, escLimits: escLimitStatus(sel.esc, e, { cells: sel.packCells }),
    busPowerW, busPowerW_p10, busPowerW_p90,
    specificPowerWPerKg: busPowerW / massKg,
    warnings,
  };
}

/* Available static thrust at the propeller's maximum measured RPM —
   the ceiling the thrust-to-weight check is made against. It is a
   MEASURED ceiling, not a motor rating, and whichever of the two binds
   first is reported. */
export function maxThrustPerRotorN(sel, rho) {
  const pts = sel.propeller.static;
  const maxRpm = pts[pts.length - 1][0];
  const t = staticThrustN(sel.propeller, maxRpm, rho);
  const shaft = staticShaftPowerW(sel.propeller, maxRpm, rho);
  const mc = motorConstants(sel.motor);
  const mp = motorPointFromShaftPower(mc, { shaftPowerW: shaft.powerW, rpm: maxRpm });
  const ml = limitStatus(mc, mp);
  return {
    thrustN: t.thrustN, atRpm: maxRpm,
    limitedBy: ml.current.within === false ? "motor continuous current rating"
      : "the propeller's maximum MEASURED rpm — not a physical ceiling, the edge of the data",
    motorCurrentA: mp.currentA, motorLimits: ml,
  };
}

/* THE CLOSURE. */
export function sizeDrone({ mission, selection, declared, options = {} }) {
  requireDeclared(declared);
  const { payloadKg, hoverEnduranceMin } = mission;
  if (!(payloadKg >= 0)) throw new Error(`sizing: payload must be >= 0, got ${payloadKg}`);
  if (!(hoverEnduranceMin > 0)) throw new Error(`sizing: endurance must be positive`);

  const rho = options.rho ?? (options.altitudeM != null ? isaDensity(options.altitudeM) : RHO_SEA_LEVEL);
  const N = selection.rotors;
  if (!(N >= 3)) throw new Error(`sizing: a multirotor needs at least 3 rotors, got ${N}`);

  const um = unitMass(selection);
  if (um.totalKg == null)
    return { status: "infeasible", reason: "a component mass is not published",
             detail: um.warnings.join("; "), massBreakdown: null };

  const pack = normalisePack(selection.battery);
  const pe = packEnergyWh(pack);
  if (pe.wh == null)
    return { status: "infeasible", reason: "pack energy is not established",
             detail: pe.warnings[0], massBreakdown: null };
  const packMassKg = (pack.massG ?? null) == null ? null : pack.massG / 1000;
  if (packMassKg == null)
    return { status: "infeasible", reason: "pack mass is not published",
             detail: `${pack.model} publishes no mass`, massBreakdown: null };

  const fixed = payloadKg + declared.structureMassKg + declared.avionicsMassKg + N * um.totalKg;

  const tol = options.toleranceKg ?? 1e-4;
  const maxIter = options.maxIterations ?? 200;
  const damping = options.damping ?? 0.5;
  const history = [];

  /* START FROM THE AIRFRAME WITH NO BATTERY.

     This used to start at `fixed + one pack`, which for any design that
     needs exactly one pack is ALREADY THE ANSWER — the first evaluation
     returned the same mass it was given, the loop stopped, and the
     convergence history had a single entry. That is not a converged
     fixed point, it is a fixed point that was assumed. It demonstrates
     nothing about whether the map contracts, and it made the studio's
     convergence plot a single dot.

     `fixed` is the unambiguous lower bound: the aircraft carrying no
     energy at all. It presumes nothing about the pack count, so the
     iteration has to actually find it, and the trajectory it traces is
     evidence rather than decoration. */
  let m = fixed;
  let last = null, status = "diverged", packs = 1;

  for (let i = 0; i < maxIter; i++) {
    const ev = evaluateAtMass(m, selection, declared, { rho });
    if (!ev.feasible) {
      return { status: "infeasible", reason: ev.reason, detail: ev.detail,
               iterations: i, history, evaluation: ev, massBreakdown: null };
    }
    /* Energy the mission needs, then how many whole packs that is. The
       ceiling is what makes this a step function rather than a smooth
       map, so the iteration can cycle between two pack counts — handled
       below by detecting the cycle instead of pretending it converged. */
    const needWh = ev.busPowerW * (hoverEnduranceMin / 60) / declared.usableFraction;
    packs = Math.max(1, Math.ceil(needWh / pe.wh));
    const mNew = fixed + packs * packMassKg;
    history.push({ iteration: i, massKg: m, busPowerW: ev.busPowerW, needWh, packs, massNextKg: mNew });

    if (Math.abs(mNew - m) < tol) {
      /* Re-evaluate AT the converged mass. `ev` was computed at the
         previous iterate, which differs from mNew by less than the
         tolerance but is not the same number — and reporting a hover
         state that belongs to a slightly different aircraft than the
         mass beside it is exactly the kind of quiet inconsistency the
         identity checks exist to catch. */
      m = mNew; last = evaluateAtMass(m, selection, declared, { rho });
      if (!last.feasible)
        return { status: "infeasible", reason: last.reason, detail: last.detail,
                 iterations: history.length, history, evaluation: last, massBreakdown: null };
      status = "converged"; break;
    }
    if (!Number.isFinite(mNew) || mNew > 1e5) { status = "diverged"; break; }
    /* A two-cycle between pack counts is a real outcome, not a failure to
       converge: the design sits exactly on a pack boundary. Report the
       heavier of the two, because that is the one that meets the mission. */
    if (history.length >= 4) {
      const h = history.slice(-4).map((x) => x.packs);
      if (h[0] === h[2] && h[1] === h[3] && h[0] !== h[1]) {
        packs = Math.max(h[0], h[1]);
        m = fixed + packs * packMassKg;
        last = evaluateAtMass(m, selection, declared, { rho });
        status = "converged-on-pack-boundary";
        break;
      }
    }
    m = m + damping * (mNew - m);
  }

  if (!last) {
    const ev = evaluateAtMass(m, selection, declared, { rho });
    if (!ev.feasible)
      return { status: "infeasible", reason: ev.reason, detail: ev.detail, history, massBreakdown: null };
    last = ev;
  }

  /* ── The mission is met only if all four of these hold ───────────── */
  const energy = usableEnergyWh(pack, { usableFraction: declared.usableFraction, packs });
  const end = enduranceMin({ usableWh: energy.usableWh, powerW: last.busPowerW });
  const endP10 = enduranceMin({ usableWh: energy.usableWh, powerW: last.busPowerW_p90 });
  const endP90 = enduranceMin({ usableWh: energy.usableWh, powerW: last.busPowerW_p10 });

  const maxT = maxThrustPerRotorN(selection, rho);
  const twAvailable = (maxT.thrustN * N) / (m * G);
  const packDischarge = dischargeLimitStatus(pack, last.esc.busCurrentA * N / packs);

  const checks = {
    enduranceMet: end.minutes >= hoverEnduranceMin,
    thrustToWeightMet: twAvailable >= declared.thrustToWeightRequired,
    motorWithinLimits: last.motorLimits.current.within !== false,
    escWithinLimits: last.escLimits.withinPublishedLimits !== false,
    packWithinLimits: packDischarge.within !== false,
  };
  const meetsMission = Object.values(checks).every((v) => v === true);

  return {
    status, meetsMission, checks,
    massKg: m,
    massBreakdown: Object.freeze({
      payloadKg, structureKg: declared.structureMassKg, avionicsKg: declared.avionicsMassKg,
      propulsionKg: N * um.totalKg, batteryKg: packs * packMassKg,
      perUnit: um, packs, packMassKg,
      payloadFraction: payloadKg / m, batteryFraction: (packs * packMassKg) / m,
      structureFraction: declared.structureMassKg / m,
    }),
    rho, rotors: N,
    hover: last,
    endurance: Object.freeze({
      minutes: end.minutes, minutesP10: endP10.minutes, minutesP90: endP90.minutes,
      requiredMin: hoverEnduranceMin, usableWh: energy.usableWh, totalWh: energy.totalWh,
      usableFraction: declared.usableFraction, assumes: end.assumes,
      band: "P10/P90 come from the ESC layer's measured joint-residual band, which is "
          + "the only uncertainty in this chain derived from measurement rather than declared",
    }),
    thrustToWeight: Object.freeze({
      available: twAvailable, required: declared.thrustToWeightRequired,
      maxThrustPerRotorN: maxT.thrustN, atRpm: maxT.atRpm, limitedBy: maxT.limitedBy,
      hoverThrottleFraction: last.thrustPerRotorN / maxT.thrustN,
    }),
    packDischarge,
    iterations: history.length, history,
    warnings: Object.freeze([...new Set([...um.warnings, ...(pe.warnings ?? []), ...last.warnings])]),
  };
}
