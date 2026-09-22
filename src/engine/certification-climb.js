/* =====================================================================
   CERTIFICATION CLIMB GRADIENT — THE CATEGORY AS A SIZING CONSTRAINT
   =====================================================================
   WHY THIS EXISTS

   SC-VTOL splits the fleet into Category Basic and Category Enhanced, and the
   tool already knew it: engine/avionics.js sizes the flight-critical chain
   with three redundancy lanes under Enhanced and two under Basic, which is
   worth about 2% of gross weight. But the category was only ever an AVIONICS
   input. The regulation makes it a PERFORMANCE requirement, and that is the
   part nothing here computed.

   MOC-2 SC-VTOL Issue 3 (22 Dec 2022), MOC VTOL.2120 "Climb requirements",
   read from the corpus and quoted exactly:

     "(a) For Category Enhanced, the climb gradient without ground effect, at
      305 m (1 000 ft) above the take-off surface, should be at least 2.5 %,
      for each combination of weight and CG, altitude, and temperature for
      which take-off data are to be determined, and for the duration of the
      flight: following a critical failure for performance (CFP) and with the
      remaining lift/thrust engines at maximum continuous power, if approved,
      or at take-off power for aircraft for which certification for use of
      take-off power is requested; and with the landing gear retracted (if
      applicable) and the aircraft in cruise configuration; and at the speed
      selected by the applicant."

     "(b) For Category Basic, the climb gradient without ground effect, at
      305 m (1 000 ft) above the take-off surface, should be at least 2.5 %,
      for each combination of weight and CG, in nominal conditions (no failure
      conditions), at ISA SL and for the duration of the flight."

   SAME GRADIENT, DIFFERENT AIRCRAFT. Enhanced must make 2.5% one unit down,
   across the whole envelope. Basic must make it with everything running, at
   sea level. That is the sharpest statement in the regulation of what the
   category actually costs, and it is computable from quantities the sizing
   loop already produces: gross weight, cruise speed, the converged lift-to-
   drag ratio, installed power per unit and the unit count.

   ── WHAT THIS IS NOT ─────────────────────────────────────────────────
   It is not a compliance finding. It is one point check of one MOC clause on
   a converged conceptual design, at the applicant-selected speed this tool
   takes to be cruise speed. The regulation asks for the gradient at EVERY
   combination of weight, CG, altitude and temperature; this evaluates the
   design point. A real showing sweeps the envelope with flight-test data.
   The output says so.

   ── WHY THE GRADIENTS LOOK LARGE ─────────────────────────────────────
   A transport aeroplane makes 2-5% after an engine failure because its
   engines are sized by CRUISE. An eVTOL's motors are sized by HOVER, so in
   wing-borne cruise they carry enormous excess: a hover-sized tiltrotor comes
   out above 20% one unit down. That is a real property of the configuration,
   not an error, and it is the reason this clause is easy for tilting layouts
   and unreachable for a single-pusher lift+cruise.

   The caveat: this takes the per-unit CONTINUOUS rating the engine derives
   (cruiseUnitRatingKW) as maximum continuous power. For a separate pusher
   that is its own cruise rating and is right. For tilting rotors it is the
   lift motor rating, which is set by a two-minute hover peak -- a motor may
   not hold that continuously without exceeding thermal limits the tool does
   not model. Where the margin is large the conclusion is insensitive to it;
   where a layout sits near 2.5% it is not, and the number should be read as
   optimistic.

   ── THE CRITICAL FAILURE FOR PERFORMANCE ─────────────────────────────
   "Critical" means the worst single failure, and which failure that is
   depends on the layout — which is the whole reason this belongs in a tool
   that knows the configuration:

     tilting layouts (tiltrotor, hybrid, hybrid pusher): every rotor makes
       cruise thrust, so losing one leaves (N-1)/N of the installed power.
     lift+cruise: the lift rotors are stopped in cruise and a SEPARATE
       propulsor does the work. The critical failure for performance is that
       propulsor, and on a single-pusher aircraft it takes ALL cruise thrust
       with it, so no wing-borne gradient survives it.

       WHAT THAT DOES AND DOES NOT MEAN. engine.js's own cruise-thrust-loss
       check already argues, correctly, that losing a centreline pusher is
       RECOVERABLE on a layout whose lift rotors stop and can restart: the
       aircraft decelerates and reverts to rotor-borne flight, which is the
       mode it takes off and lands in anyway. This output does not contradict
       that and does not call the aircraft unsafe. It says something narrower
       and still worth knowing: the 2.5% gradient of MOC VTOL.2120(a) is
       specified "in cruise configuration", and a machine that has reverted to
       rotor-borne flight is not in cruise configuration, so the clause is not
       satisfied by that recovery. An applicant would have to argue a
       different critical failure, or show the gradient another way. The tool
       reports the arithmetic and names the argument rather than settling it.
     rotor-borne (multicopter, side-by-side): no wing, so there is no
       lift-to-drag climb gradient in the fixed-wing sense. Reported as not
       applicable rather than as a number, in the same spirit as the tail
       outputs being absent rather than zero on a wingless layout.
   ===================================================================== */

/** MOC VTOL.2120 — the gradient both categories must make. */
export const CLIMB_GRADIENT_MIN = 0.025;           // 2.5%
/** "at 305 m (1 000 ft) above the take-off surface" */
export const CLIMB_GRADIENT_ALT_M = 305;

/**
 * Climb gradient at the MOC VTOL.2120 condition.
 *
 * @param p  parameter set — vtolCategory, vCruise, etaSys
 * @param g  converged geometry/state:
 *           { MTOW_kg, LD, nUnits, pMotInstalledKW, hasWing, separateCruiseProp,
 *             nCruiseProps, rhoAtCondition, g0 }
 */
export function certificationClimb(p = {}, g = {}) {
  const enhanced = (p.vtolCategory ?? "enhanced") !== "basic";
  const category = enhanced ? "enhanced" : "basic";
  const W = Math.max(1, (g.MTOW_kg ?? 0) * (g.g0 ?? 9.80665));
  const V = Math.max(1e-6, p.vCruise ?? 0);
  const LD = g.LD ?? 0;
  const eta = Math.max(1e-6, p.etaSys ?? 0.8);

  /* A wingless aircraft has no L/D climb gradient of this kind. Absent, not
     zero — the same rule the tail outputs follow. */
  if (!g.hasWing || !(LD > 0)) {
    return {
      category, applicable: false, gradientPct: null,
      requiredPct: CLIMB_GRADIENT_MIN * 100, pass: null,
      basis: "not applicable — MOC VTOL.2120 is a wing-borne climb gradient; "
           + "this layout is rotor-borne and has no cruise lift-to-drag",
      unitsTotal: g.nUnits ?? 0, unitsAvailable: null, cfp: null,
    };
  }

  const nUnits = Math.max(1, g.nUnits ?? 1);
  const perUnitKW = Math.max(0, g.pMotInstalledKW ?? 0);

  /* Which unit is the critical failure for performance, and what is left. */
  let unitsAvailable, cfp, note = "";
  if (!enhanced) {
    unitsAvailable = nUnits;
    cfp = "none — Category Basic is evaluated in nominal conditions, ISA SL";
  } else if (g.separateCruiseProp) {
    const nCruise = Math.max(1, g.nCruiseProps ?? 1);
    unitsAvailable = nCruise - 1;
    cfp = `cruise propulsor (${nCruise} fitted)`;
    if (unitsAvailable <= 0)
      note = "A SINGLE cruise propulsor is itself the critical failure for "
           + "performance: losing it removes all cruise thrust and no "
           + "wing-borne gradient survives it, however much lift power is "
           + "installed, because those rotors are stopped. This is NOT a "
           + "finding that the aircraft is unsafe — the engine's own "
           + "cruise-thrust-loss check holds that a centreline pusher loss is "
           + "recoverable by restarting the lift rotors and reverting to "
           + "rotor-borne flight. It is a finding that MOC VTOL.2120(a), "
           + "which asks for the gradient IN CRUISE CONFIGURATION, is not met "
           + "by that recovery. A second cruise thrust path, or a different "
           + "critical failure argued to the authority, would be the routes.";
  } else {
    unitsAvailable = nUnits - 1;
    cfp = `one lift/thrust unit of ${nUnits}`;
  }

  /* Level-flight shaft power at this speed is W·V/((L/D)·eta); anything above
     it climbs. gamma = P_avail·eta/(W·V) - 1/(L/D). */
  const pAvailKW = Math.max(0, unitsAvailable) * perUnitKW;
  const gradient = (pAvailKW * 1000 * eta) / (W * V) - 1 / LD;

  return {
    category, applicable: true,
    gradientPct: +(gradient * 100).toFixed(3),
    requiredPct: CLIMB_GRADIENT_MIN * 100,
    pass: gradient >= CLIMB_GRADIENT_MIN,
    unitsTotal: nUnits,
    unitsAvailable: Math.max(0, unitsAvailable),
    cfp,
    basis: (enhanced
      ? "MOC VTOL.2120(a) — Category Enhanced, following a critical failure "
        + "for performance, remaining units at maximum continuous power"
      : "MOC VTOL.2120(b) — Category Basic, nominal conditions, ISA SL")
      + `, at ${CLIMB_GRADIENT_ALT_M} m above the take-off surface, cruise `
      + "configuration, at the applicant-selected speed (taken here as cruise "
      + "speed). ONE POINT ON THE DESIGN CONDITION, not an envelope showing.",
    note,
  };
}
