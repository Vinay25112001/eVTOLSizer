/* =====================================================================
   MISSION PATH — where the aircraft is, at a time the caller chooses
   =====================================================================
   The sizing already produces the mission as DURATIONS, POWERS and
   ENERGIES. What it has never produced is a POSITION, which is the one
   thing a drawing of the mission needs. This module adds it, and adds
   nothing else.

   THE RULE IT OBEYS, the same one profile.js states: every power here
   is TAKEN FROM THE CONVERGED RESULT and never recomputed. A second
   implementation of hover power in a second file is how two numbers in
   one tool start disagreeing.

   POSITION IS INTERPOLATED BETWEEN THE SIZING'S OWN ENDPOINTS, not
   integrated from rates. Each phase has a known start, a known end and
   a known duration, all of them already computed:

     climbRunM, cruiseRunM, descentRunM   ground distance per phase
     climbHeightM, hoverHeight, cruiseAlt heights
     tPhases                              the boundaries in seconds

   so the position at any t is a linear walk between two numbers the
   sizing produced. Integrating rateOfClimb over the climb instead would
   be a SECOND path to the same answer, and the two would part company
   the first time a rounding or a convergence detail changed. Here the
   rates are not inputs to the path at all — they are CHECKS on it, and
   validation/mission-path.mjs holds them to it.

   NO CLOCK. `t` is an argument. The caller decides what time it is,
   exactly as scene3d.js takes `spinDeg` rather than reading a clock, so
   that a frame at a declared time is reproducible and can be frozen by
   a render gate.

   THE RESERVE IS NOT FLOWN. tPhases puts the reserve AFTER the landing,
   which is an energy-accounting order, not a flight order: the reserve
   is energy held back at the end of the mission, and the aircraft it is
   held for is on the ground. Drawing it as flight would show an
   aircraft taking off again after it had landed. So the reserve returns
   `flown: false` and the position stays where the landing put it, while
   the energy and the state of charge carry on being reported — which is
   what a reserve actually is.

   THE CRUISE LEG IS NOT THE RANGE, and this is the accounting trap
   profile.js records. The reserve's distance is charged against the
   range, so the ground track actually flown is

     climbRunM + cruiseRunM + descentRunM

   and the range is that plus the reserve allowance that is never flown.
   Both closures are gated, so neither can drift.

   WHAT THIS MODULE REFUSES TO PRODUCE is listed in NOT_MODELLED at the
   bottom, with the citation for each. A view built on this should print
   that list rather than drawing a plausible version of it.
   ===================================================================== */

export const PHASES = Object.freeze(["TO", "Climb", "Cruise", "Desc", "Land", "Res"]);

export const PHASE_LABEL = Object.freeze({
  TO: "Vertical take-off", Climb: "Climb", Cruise: "Cruise",
  Desc: "Descent", Land: "Vertical landing", Res: "Reserve",
});

/* Each phase's ground distance and the height it ends at. The vertical
   legs cover no ground: a vertical transition is vertical. */
function legs(r, p) {
  const hoverH = Number(p.hoverHeight) || 0;
  const cruiseAGL = hoverH + (Number(r.climbHeightM) || 0);
  return [
    { ph: "TO",     runM: 0,                        fromM: 0,         toM: hoverH,    flown: true },
    { ph: "Climb",  runM: Number(r.climbRunM) || 0, fromM: hoverH,    toM: cruiseAGL, flown: true },
    { ph: "Cruise", runM: Number(r.cruiseRunM) || 0, fromM: cruiseAGL, toM: cruiseAGL, flown: true },
    { ph: "Desc",   runM: Number(r.descentRunM) || 0, fromM: cruiseAGL, toM: hoverH,  flown: true },
    { ph: "Land",   runM: 0,                        fromM: hoverH,    toM: 0,         flown: true },
    { ph: "Res",    runM: 0,                        fromM: 0,         toM: 0,         flown: false },
  ];
}

/* The power each phase draws, taken from the result. Landing hovers at
   the same power take-off does — the sizing charges Phov for both. */
function phasePowerKW(r) {
  return [r.Phov, r.Pcl, r.Pcr, r.Pdc, r.Phov, r.Pres].map((x) => Number(x) || 0);
}

/* The airspeed each phase is flown at. The vertical legs are flown at
   the rate the sizing's own take-off time implies, NOT at the bare
   0.5 m/s literal the 200-sample trace uses: hoverHeight / tto is
   NASA's 100 ft/min, and it is the rate that makes the aircraft reach
   hover height at the moment it was charged energy to. */
function phaseSpeedMS(r, p) {
  const vert = Number(r.hoverClimbRateMS) || 0;
  return [vert, Number(r.climbSpeedMS) || 0, Number(p.vCruise) || 0,
          Number(r.descentSpeedMS) || 0, vert, 0.76 * (Number(p.vCruise) || 0)];
}

export function phaseIndexAt(tPhases, t) {
  for (let j = 0; j < 6; j++) if (t >= tPhases[j] && t < tPhases[j + 1]) return j;
  return t < tPhases[0] ? 0 : 5;
}

/* The state at one instant. Returns null rather than guessing if the
   result has no mission in it — a caller drawing a failed sizing should
   draw nothing, not an aircraft at the origin. */
export function missionPathAt(r, p, t) {
  const tPhases = r?.tPhases;
  if (!Array.isArray(tPhases) || tPhases.length < 7) return null;

  const Tend = tPhases[6];
  const tc = Math.max(0, Math.min(Number(t) || 0, Tend));
  const j = phaseIndexAt(tPhases, tc);
  const L = legs(r, p), leg = L[j];

  const t0 = tPhases[j], t1 = tPhases[j + 1];
  const span = t1 - t0;
  /* A zero-length phase is a real case — no reserve, or a cruise
     altitude at hover height — and it must not divide by zero. */
  const f = span > 0 ? (tc - t0) / span : 1;

  const groundBefore = L.slice(0, j).reduce((s, x) => s + x.runM, 0);

  return {
    t: tc,
    phase: leg.ph,
    label: PHASE_LABEL[leg.ph],
    phaseIndex: j,
    fractionThroughPhase: f,
    flown: leg.flown,
    altitudeAglM: leg.fromM + (leg.toM - leg.fromM) * f,
    altitudeMslM: (Number(p.fieldElev) || 0) + leg.fromM + (leg.toM - leg.fromM) * f,
    groundM: groundBefore + leg.runM * f,
    speedMS: phaseSpeedMS(r, p)[j],
    powerKW: phasePowerKW(r)[j],
  };
}

export function missionPathSamples(r, p, n = 200) {
  const tPhases = r?.tPhases;
  if (!Array.isArray(tPhases) || tPhases.length < 7) return [];
  const Tend = tPhases[6];
  const out = [];
  for (let i = 0; i <= n; i++) out.push(missionPathAt(r, p, Tend * i / n));
  return out;
}

/* The ground track actually flown, and the range it is charged against.
   Kept here rather than in the view so that the gate and the drawing
   read the same number. */
export function groundTrackM(r) {
  return (Number(r.climbRunM) || 0) + (Number(r.cruiseRunM) || 0) + (Number(r.descentRunM) || 0);
}

/* WHAT A MISSION VIEW MAY NOT DRAW, and why. Each entry names where the
   refusal is already recorded in this codebase, so a view can print the
   citation rather than paraphrasing it. */
export const NOT_MODELLED = Object.freeze([
  { what: "The transition between hover and wing-borne flight",
    why: "No published eVTOL transition speed and no eVTOL-specific CLmax were found, so the circularity was never broken and the only transition quantity the tool has is a SPEED RANGE, not a trajectory",
    where: "src/engine/constraints.js — impliedTransitionSpeed, and the note above it" },
  { what: "How long a transition takes",
    why: "The autopilot exporter refuses to emit one, in those words: the value would be invented",
    where: "src/export/autopilot-vtol.js — the Q_TRANSITION_MS refusal" },
  { what: "Any engine-failure transient or recovery path",
    why: "One-engine-inoperative is a STEADY-STATE point check — thrust margin and Phov/(N-1). The code notes that for six rotors the steady check is only 1.2x hover power while NASA measured 2.9-3.8x during the failure itself, so a recovery drawn here would assert the thing the tool says it cannot compute",
    where: "src/engine.js — the OEI block and its note" },
  { what: "Aircraft attitude at any point in the mission",
    why: "Nothing computes an attitude for the eVTOL. The 6-DOF integrator in the drone studio is a multirotor in hover and has no wing, no stall and no cruise",
    where: "src/classes/drone/dynamics.js — the header, and src/export/autopilot-vtol.js" },
  { what: "Acceleration between phases",
    why: "The mission model is piecewise constant: speed steps at each boundary. Easing the steps would be animation, not physics",
    where: "src/engine.js — the phase velocity array" },
  { what: "Wind, gusts, ground effect and the vertiport environment",
    why: "Not modelled. A headwind exists in the sizing as a scalar that separates airspeed from ground speed, and nothing more",
    where: "src/engine.js — the ground-speed block" },
]);
