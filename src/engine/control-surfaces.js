/* =====================================================================
   CONTROL-SURFACE EFFECTIVENESS, AND TAIL SECTION THICKNESS
   =====================================================================
   Three numbers in the V-tail block used to be hardcoded with no registry
   entry and no source: the panel taper, the ruddervator chord fraction, and
   the section thickness. This module supplies the two that a SOURCE can
   actually settle, so they stop being assumptions.

   ── 1. FLAP/CONTROL-SURFACE EFFECTIVENESS tau(cf/c) ──────────────────

   A hinged control surface does not change lift as fast as an angle-of-
   attack change does. The ratio is tau (also written alpha_delta): the rate
   of change of zero-lift angle with surface deflection. It is what converts
   a REQUIRED LIFT INCREMENT into a DEFLECTION, and the engine previously had
   no tau at all -- it treated a required delta-CL as though it were already
   an angle in radians (see the deflection note in engine.js).

   [SRC] PRIMARY, ANALYTIC. Olson, E.D. (NASA Langley), "Semi-Empirical
   Prediction of Aircraft Low-Speed Aerodynamic Characteristics", AIAA/NASA
   2015 (NTRS 20150006019), eqs. (3) and (4), following Torenbeek,
   "Synthesis of Subsonic Airplane Design" (1982) Appendix G:

       "For a thin airfoil, alpha_delta is related to the flap geometry as
        follows:   alpha_delta = 1 - (theta_f - sin theta_f)/pi
        where   theta_f = cos^-1( 2 cf/c - 1 )"

   This is a closed form from thin-airfoil theory, not a fit, and it is exact
   at both ends: tau(0) = 0 (no surface, no authority) and tau(1) = 1 (an
   all-moving surface is as effective as the whole tail). Those two limits
   are the cheap check, and they are gated.

   [SRC] INDEPENDENT CROSS-CHECK, EMPIRICAL. NASA CR-186872 (Sandlin &
   Swanson, 1990), "Horizontal control surface sizing module", FORTRAN
   listing: "TAU IS DETERMINED FROM REFERENCE 3, CHAPTER 3, FIGURE 3.32 /
   THIS IS KNOWN AS THE ELEVATOR EFFECTIVNESS FACTOR", digitised from
   McCormick, B.W., "Aerodynamics, Aeronautics, and Flight Dynamics" (1979)
   fig. 3.32, as the quartic

       tau = 4.1065 x - 8.9175 x^2 + 9.7178 x^3 - 3.9307 x^4 ,  x = cf/c

   THE TWO AGREE TO 0.0008 AT cf/c = 0.30 and to better than 0.014 across
   0.20-0.40, which is the band a control surface actually lives in. They
   part company at the extremes -- the quartic returns 0.976 rather than 1
   at cf/c = 1, because it is a fit to a digitised figure and carries no
   analytic limit. So the ANALYTIC form is what the engine uses and the
   quartic is kept as a comparator, the same way AFDD82 is kept beside
   AFDD00 in the weights. A gate holds them together in the working band; if
   they ever diverge there, one of the two transcriptions is wrong.

   ── 2. TAIL SECTION THICKNESS ────────────────────────────────────────

   [SRC] Scholz, D., "Aircraft Design", HAW Hamburg (HOOU open courseware),
   ch.9 "Empennage General Design", citing Abbott & von Doenhoff 1959:

       "The horizontal tailplane should have a relative thickness that is
        approximately 10 % less than the relative thickness in the outer
        wing. Thus, a higher critical Mach number of the horizontal
        tailplane can be achieved and a loss of efficiency due to shock
        waves is prevented."

       "Symmetrical airfoils are chosen exclusively for vertical tailplanes.
        Symmetrical or virtually symmetrical airfoils with 9% to 12%
        relative thickness are chosen for horizontal tailplanes. For example
        NACA 0009 or NACA 0012 (Abbott 1959) can be chosen."

   So the tail thickness is a CALCULATION off the wing, bounded by a
   published band -- not a constant. The engine previously wrote 0.09 as a
   bare literal in the wetted-area expression, naming NACA 0009 in a comment,
   while the identical WING expression used the registered p.tc. At this
   tool's default wing t/c of 0.15 the rule returns 0.135, which the band
   caps at 0.12 -- i.e. NACA 0012, which is also the only symmetric section
   the engine's own airfoil catalogue actually carries. The old 0.09 was
   below the band's floor for this wing.
   ===================================================================== */

/* Published bounds, kept as named constants so a gate can assert them. */
export const TAIL_TC_MIN = 0.09;   // [SRC] Scholz ch.9, "9% to 12%"
export const TAIL_TC_MAX = 0.12;   // [SRC] Scholz ch.9, "9% to 12%"
export const TAIL_TC_WING_FRACTION = 0.90;  // [SRC] Scholz ch.9, "10 % less"

/* [SRC] Scholz ch.9 sec.9.5: control surfaces "have a chord which accounts
   for approximately 25% to 40% of the chord of the tail". */
export const RUDDERVATOR_CHORD_FRAC_MIN = 0.25;
export const RUDDERVATOR_CHORD_FRAC_MAX = 0.40;

/* [SRC] Scholz ch.9 sec.9.5: "Elevators are deflected downwards by a maximum
   of 15 to 25 deg and upwards by a maximum of 25 to 35 deg. Rudders are
   deflected by a maximum of 25 to 35 deg." The DOWNWARD elevator travel is
   the binding one and its published range STARTS at 15 deg, so 15 is the
   conservative end of a published band rather than a chosen number.

   NO "TRIM ALLOWANCE" FRACTION IS APPLIED, DELIBERATELY. A first draft of
   this module reserved two thirds of the travel for manoeuvre and checked
   trim against the remaining third. That fraction was invented here — no
   source in the corpus states how much of a control surface's travel steady
   trim may consume — and inventing it would have put an unsourced constant
   back in the very place that just had three removed. The check therefore
   uses the published limit itself, and the ENGINE REPORTS what fraction of
   it trim consumes, so a reader can apply their own margin knowingly. */
export const ELEVATOR_DEFLECTION_MAX_DEG = 15;

/* Thin-airfoil control-surface effectiveness. `cfc` is the surface chord as a
   fraction of the surface-plus-fixed chord. Exact at both limits. */
export function tauEffectiveness(cfc) {
  if (!(cfc > 0)) return 0;
  if (cfc >= 1) return 1;
  const thetaF = Math.acos(2 * cfc - 1);
  return 1 - (thetaF - Math.sin(thetaF)) / Math.PI;
}

/* The independent empirical comparator. Not used for sizing; gated against
   the analytic form so a transcription error in either one is caught. */
export function tauEffectivenessNASA(cfc) {
  const x = Math.min(1, Math.max(0, cfc));
  return 4.1065 * x - 8.9175 * x ** 2 + 9.7178 * x ** 3 - 3.9307 * x ** 4;
}

/* Tail section thickness from the wing's, per Scholz ch.9. */
export function tailThickness(wingTC) {
  if (!(wingTC > 0)) return TAIL_TC_MAX;
  return Math.min(TAIL_TC_MAX, Math.max(TAIL_TC_MIN, TAIL_TC_WING_FRACTION * wingTC));
}

/* The smallest control-surface chord fraction that trims the required lift
   increment within the deflection allowance, or null when even the largest
   published chord cannot do it -- in which case the caller must SAY the
   surface is too small rather than report a deflection it cannot reach.

   dCLreq  required tail lift-coefficient increment (dimensionless)
   CLalpha tail lift-curve slope, per radian
   gamma   dihedral, radians (0 for a conventional tail; a V-tail ruddervator
           must deflect further than the equivalent elevator by 1/cos gamma) */
export function requiredChordFraction({ dCLreq, CLalpha, gamma = 0,
    limitDeg = ELEVATOR_DEFLECTION_MAX_DEG }) {
  const need = Math.abs(dCLreq);
  if (!(need > 0) || !(CLalpha > 0)) return RUDDERVATOR_CHORD_FRAC_MIN;
  const allowRad = limitDeg * Math.PI / 180;
  const cosG = Math.max(1e-6, Math.cos(gamma));
  /* tau rises monotonically with cf/c, so the deflection falls monotonically
     and a bisection on the published band is exact to the tolerance. */
  const deflectionAt = (cfc) => need / (CLalpha * tauEffectiveness(cfc)) / cosG;
  if (deflectionAt(RUDDERVATOR_CHORD_FRAC_MAX) > allowRad) return null;
  let lo = RUDDERVATOR_CHORD_FRAC_MIN, hi = RUDDERVATOR_CHORD_FRAC_MAX;
  if (deflectionAt(lo) <= allowRad) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (deflectionAt(mid) > allowRad) lo = mid; else hi = mid;
  }
  return hi;
}
