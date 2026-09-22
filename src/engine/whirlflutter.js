/* =====================================================================
   WHIRL FLUTTER — the constraint NASA names on this very layout
   =====================================================================
   A proprotor on a flexible wing can drive a coupled wing/rotor whirl mode
   unstable. It is not an exotic case: it is the constraint that sets
   tiltrotor wing thickness, and NASA applied it to the side-by-side.

   Johnson & Silva, The Aeronautical Journal (NTRS 20210026170), on how the
   side-by-side concept vehicle was sized:

     "the side-by-side aircraft was modeled with a tiltrotor wing for the
      rotor support beam, using the jump takeoff sizing and preventing the
      whirl-flutter constraint from becoming active."

   So the cross-bar is not a boom in NASA's model — it is a tiltrotor wing,
   sized so whirl flutter does not bind.

   ── THE PUBLISHED DATA POINT, AND WHY IT IS THE RIGHT ONE ─────────────
   Acree, C.W., Peyran, R.J. & Johnson, W., "Rotor Design for Whirl Flutter:
   An Examination of Options for Improving Tiltrotor Aeroelastic Stability
   Margins", American Helicopter Society 55th Annual Forum, 1999
   (rotorcraft.arc.nasa.gov). They took one aircraft and changed only its
   wing thickness:

     "A baseline analytical model similar to the XV-15 (23% thick wing) was
      established, and then a 15% thick wing design was developed."
     "The new wing has the same geometry as the XV-15 wing, but with a
      thickness-to-chord ratio (t/c) of 15% ... instead of 23%."
     "The aeroelastic instability speed is reduced from 335 knots
      (antisymmetric beam mode) for the XV-15 with 23% t/c wing to 275 knots
      (antisymmetric beam mode) for the XV-15 with the conceptual 15% t/c
      wing."
     "The 15% t/c wing structure is sized based on static strength (2g jump
      take-off and 4g pull-up) and static divergence (529 knots at sea-level
      standard conditions)."

   That last line is the one worth reading twice: the thin wing was sized to
   be strong enough and to resist static divergence to 529 knots, and it
   still fluttered at 275. Strength does not buy flutter margin.

   THIS TOOL'S DEFAULT t/c IS 0.15 — exactly Acree's thin-wing case, the one
   that lost 60 knots.

   ── WHAT IS COMPUTED, AND WHAT IS DELIBERATELY NOT ────────────────────
   A whirl-flutter BOUNDARY needs a coupled rotor/wing aeroelastic
   eigenanalysis. Acree used CAMRAD II with NASTRAN stick models. This tool
   has no such solver and will not pretend to: no boundary speed is computed
   for our aircraft, and no correlation is fitted through Acree's two points,
   which would be inventing a law from two samples of one airframe.

   What IS computed is the MARGIN QUESTION, which does not need the solver:
   an eVTOL cruising at 100-130 kt is asking a different question of its wing
   than a tiltrotor cruising at 300. The check reports cruise speed against
   the published boundary for a same-t/c aircraft of similar class, and says
   plainly that the boundary belongs to the XV-15, not to us.
   ===================================================================== */

const KT_PER_MS = 1.943844;

/** Acree et al., AHS 55th Forum 1999 — one airframe, two wing thicknesses. */
export const XV15_WHIRL = {
  thick: { tc: 0.23, boundaryKt: 335 },
  thin:  { tc: 0.15, boundaryKt: 275 },
  staticDivergenceKt: 529,      // what the thin wing WAS sized to, and still fluttered at 275
  mode: "antisymmetric beam",
  src: "Acree, Peyran & Johnson, AHS 55th Annual Forum 1999, "
     + "'Rotor Design for Whirl Flutter'",
};

/**
 * Does whirl flutter apply to this layout? It needs a rotor TURNING in
 * cruise on a flexible spanwise structure. A rotor that stops is not a
 * whirl mode, and a rotor on the fuselage centreline has no wing to couple
 * with.
 */
export const WHIRL_APPLIES = {
  /* Proprotors on a wing, turning in cruise — the classic case. */
  tiltrotor:    { applies: true,  why: "proprotors on a wing, turning in cruise" },
  hybrid:       { applies: true,  why: "tip proprotors tilt and keep turning in cruise" },
  hybridPusher: { applies: true,  why: "tip proprotors tilt and keep turning in cruise" },
  /* NASA modelled the cross-bar AS a tiltrotor wing and sized it so the
     whirl-flutter constraint did not become active. */
  sideBySide:   { applies: true,  why: "rotors turning on a spanwise support beam, "
                                     + "which NASA modelled as a tiltrotor wing "
                                     + "specifically to keep whirl flutter inactive" },
  /* Lift rotors STOP in cruise, and a stopped rotor has no whirl mode. The
     cruise propulsor is on the fuselage centreline, not on a wing. */
  liftcruise:   { applies: false, why: "lift rotors stop in cruise and the pusher is "
                                     + "on the centreline — no turning rotor on a wing" },
  /* No wing at all, and no cruise regime to reach a boundary in. */
  multicopter:  { applies: false, why: "rotor-borne with no wing for a rotor to "
                                     + "couple with" },
};

/**
 * Whirl-flutter margin check.
 * @param o.configType  layout key
 * @param o.tc          wing thickness-to-chord actually used
 * @param o.vCruise_ms  cruise speed
 * @param o.rootEI      wing root bending stiffness from engine/wingbox.js, N-m^2
 *                      (reported, not used to compute a boundary)
 */
export function whirlFlutterCheck(o = {}) {
  const app = WHIRL_APPLIES[o.configType];
  if (!app) return null;
  if (!app.applies) {
    return { applies: false, why: app.why, src: XV15_WHIRL.src };
  }

  const tc = Number(o.tc);
  const vKt = Number(o.vCruise_ms) * KT_PER_MS;

  /* The reference boundary is chosen by which of Acree's two wings ours
     resembles, and NEVER interpolated between them: two points on one
     airframe are not a curve. A wing thinner than his thin one gets the thin
     boundary and an explicit warning, because the honest statement is "at
     least this bad", not a number off the end of a fitted line. */
  const nearThick = isFinite(tc) && tc >= XV15_WHIRL.thick.tc;
  const ref = nearThick ? XV15_WHIRL.thick : XV15_WHIRL.thin;
  const thinnerThanRef = isFinite(tc) && tc < XV15_WHIRL.thin.tc;

  const marginRatio = isFinite(vKt) && vKt > 0 ? ref.boundaryKt / vKt : null;

  return {
    applies: true, why: app.why,
    tc: isFinite(tc) ? +tc.toFixed(3) : null,
    vCruiseKt: isFinite(vKt) ? +vKt.toFixed(1) : null,
    referenceBoundaryKt: ref.boundaryKt,
    referenceTc: ref.tc,
    thinnerThanReference: thinnerThanRef,
    marginRatio: marginRatio == null ? null : +marginRatio.toFixed(2),
    rootEI_Nm2: isFinite(Number(o.rootEI)) ? +Number(o.rootEI).toFixed(0) : null,
    verdict: marginRatio == null ? "cruise speed unknown"
      : marginRatio >= 2 ? "cruise sits far below the reference boundary"
      : marginRatio >= 1.3 ? "cruise approaches the reference boundary"
      : "cruise is AT OR ABOVE the reference boundary — this needs a real "
        + "aeroelastic analysis before the design is believed",
    caveat: "the boundary quoted is the XV-15's, not this aircraft's. No "
          + "coupled rotor/wing eigenanalysis exists in this tool, and none is "
          + "faked: Acree used CAMRAD II with NASTRAN stick models. Nor is a "
          + "curve fitted through his two points — two samples of one airframe "
          + "are not a law.",
    src: XV15_WHIRL.src,
  };
}
