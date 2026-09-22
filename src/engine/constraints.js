/* =====================================================================
   CONSTRAINT DIAGRAM — power loading against wing loading
   =====================================================================
   The standard first step of conceptual design, and the one thing this engine
   did not have. Wing loading was an INPUT (1371 N/m2 from Archer, 1524 from
   Joby) with no derivation behind it. Here it becomes a RESULT: the largest
   W/S the performance constraints permit, with the published values demoted to
   a CHECK on the answer rather than the source of it.

   ── AXES: POWER LOADING, NOT THRUST-TO-WEIGHT ────────────────────────────
   [SRC] "Contributions to Conceptual Design of Electric and Hybrid-electric
   Aircraft" (corpus S1482) sec.3.2.3.4, citing Torenbeek (2013), Roskam (1985)
   and de Vries, Brown & Vos (2018):

     "for HEDP aircraft, the use of power-loading (W/P) on the y-axis is better
      for some reasons. First, there are propellers installed, so power loading
      is more suitable for the case. Secondly, the power produced by the
      propulsive elements is required to size the components of the powertrain,
      and not thrust. Finally, when selecting the optimum design, it is
      convenient to select the powertrain that has to produce the least amount
      of power (which is directly related to energy consumption), not thrust."

   Every one of those three reasons applies here exactly: this aircraft has
   propellers, its powertrain is sized on power, and its battery is sized on
   energy. So the y-axis is W/P in N/W (equivalently kg/kW x 9.81).

   ── WHERE THE DESIGN POINT GOES ──────────────────────────────────────────
   Same source: "the optimal design point is chosen for: 1. the highest possible
   wing loading, i.e., smallest wing, and 2. ... highest possible power loading,
   i.e., smallest engine."
   Mind the sign convention: HIGH power loading means a SMALL powerplant, so
   the feasible region is BELOW every power-loading curve and LEFT of the stall
   limit, and the design point sits at its top-right corner.

   ── THE CONSTRAINT THAT MAKES THIS AN eVTOL DIAGRAM ──────────────────────
   HOVER IS INDEPENDENT OF WING LOADING. It plots as a HORIZONTAL CEILING, and
   for every eVTOL in this project it is the binding constraint. A fixed-wing
   constraint diagram — which is what a Raymer-based tool draws — has no such
   line, so it lets the design walk to a power loading no VTOL can achieve.
   That single missing line is the clearest statement of why a conventional
   conceptual-design tool sizes an eVTOL badly.

   ROTOR-BORNE LAYOUTS GET NO WING CONSTRAINTS AT ALL — a multicopter has a
   hover ceiling and nothing else, and that is the honest answer rather than a
   gap: its design space is one-dimensional.
   ===================================================================== */

import { makeISA } from "./atmosphere.js";

/** Dynamic pressure. */
const qOf = (rho, V) => 0.5 * rho * V * V;

/* ── THE CONSTRAINTS ────────────────────────────────────────────────────
   Each returns W/P in N/W at a given W/S in N/m2, or null where it does not
   apply. Standard forms, Raymer ch.5 / Roskam: power required per unit weight
   is V/eta times the sum of the drag-to-weight terms, and W/P is its inverse. */

/** Level flight at V: parasite + induced. [EQ] Raymer ch.5 */
export function cruiseConstraint(WS, { rho, V, CD0, AR, e, eta }) {
  const q = qOf(rho, V);
  if (!(q > 0 && WS > 0)) return null;
  const PoverW = (V / eta) * (q * CD0 / WS + WS / (q * Math.PI * AR * e));
  return PoverW > 0 ? 1 / PoverW : null;
}

/** Climb at gradient gamma (radians) — cruise plus the potential-energy term. */
export function climbConstraint(WS, { rho, V, CD0, AR, e, eta, gammaRad }) {
  const q = qOf(rho, V);
  if (!(q > 0 && WS > 0)) return null;
  const PoverW = (V / eta) * (Math.sin(gammaRad) + q * CD0 / WS + WS / (q * Math.PI * AR * e));
  return PoverW > 0 ? 1 / PoverW : null;
}

/** Sustained turn at load factor n — induced term scales with n^2. */
export function turnConstraint(WS, { rho, V, CD0, AR, e, eta, n }) {
  const q = qOf(rho, V);
  if (!(q > 0 && WS > 0)) return null;
  const PoverW = (V / eta) * (q * CD0 / WS + n * n * WS / (q * Math.PI * AR * e));
  return PoverW > 0 ? 1 / PoverW : null;
}

/** Stall — a VERTICAL line, the maximum wing loading, independent of power. */
export function stallWingLoading({ rho, Vstall, CLmax }) {
  return (Vstall > 0 && CLmax > 0) ? 0.5 * rho * Vstall * Vstall * CLmax : null;
}

/**
 * THE NON-CIRCULAR HALF. Given the wing loading the design actually uses, the
 * speed at which the wing alone can carry the aircraft:
 *     V = sqrt( 2 (W/S) / (rho CLmax) )
 * Below it the lift rotors must still be carrying part of the weight, so this
 * is the earliest the aircraft can complete transition. Reported over a CLmax
 * RANGE rather than one value, because no eVTOL CLmax is published — the range
 * is the honest output.
 */
export function impliedTransitionSpeed(WS, { rho, clMaxLow = 1.2, clMaxHigh = 1.8 }) {
  if (!(WS > 0 && rho > 0)) return null;
  const v = (cl) => Math.sqrt(2 * WS / (rho * cl));
  return {
    /* High CLmax gives the LOW speed, so the bounds swap. */
    fastMS: v(clMaxLow), slowMS: v(clMaxHigh),
    clMaxLow, clMaxHigh,
    note: "speed at which the wing alone carries the aircraft, i.e. the earliest "
        + "the lift rotors may stop. Reported as a range because no eVTOL CLmax "
        + "is published; a plain flapped wing sits near the middle.",
  };
}

/** HOVER — a HORIZONTAL line. Momentum theory with figure of merit and the
    download penalty, exactly as the sizing loop computes it, so the diagram
    and the loop cannot disagree.
    P/W = (1/FM) sqrt( DL / (2 rho) ) / (1-k)^1.5, with the download raising
    both the thrust and, through it, the disk loading. */
export function hoverConstraint({ rhoHover, diskLoadingNm2, FM, downloadFrac = 0 }) {
  const k = Math.min(0.4, Math.max(0, downloadFrac));
  if (!(diskLoadingNm2 > 0 && rhoHover > 0 && FM > 0)) return null;
  const DL = diskLoadingNm2 / Math.pow(1 - k, 1);      // thrust-based disk loading
  const PoverW = (1 / FM) * Math.sqrt(DL / (2 * rhoHover)) / Math.pow(1 - k, 1.5);
  return PoverW > 0 ? 1 / PoverW : null;
}

/**
 * Build the full diagram.
 * @returns {{curves, stallWS, designPoint, binding, note}}
 *   curves      one entry per constraint, each a list of {WS, WP} (hover and
 *               stall are flat/vertical and marked as such)
 *   designPoint the largest W/S and the largest W/P that satisfy everything
 *   binding     which constraint sets the design power loading
 */
export function constraintDiagram(p, opts = {}) {
  const hasWing = opts.hasWing !== false;
  const ISA     = makeISA(p.deltaISA ?? 0);
  const rho     = ISA(p.cruiseAlt ?? 1000).rho;
  const rhoHov  = ISA((p.fieldElev ?? 0) + (p.hoverHeight ?? 0)).rho;
  const V       = p.vCruise ?? 67;
  const eta     = p.etaSys ?? 0.744;
  const AR      = p.AR ?? 9;
  const e       = p.eOsw ?? 0.85;
  const CD0     = opts.CD0 ?? 0.030;          // from the converged drag build-up
  /* ── THE WING LIMIT IS TRANSITION, NOT RUNWAY STALL ──────────────────
     A first attempt used p.clCruiseMax (0.90) and a transition speed guessed
     at 0.45*Vcruise. That returned a maximum wing loading of 455 N/m2 against
     the 1371-1524 the published aircraft actually fly — wrong by a factor of
     three, because BOTH inputs were wrong for this constraint.

     clCruiseMax is a CRUISE lift-coefficient ceiling; the wing limit needs
     CL_MAX WITH HIGH LIFT, which for a simple flapped wing is ~1.5 [LAY].
     And a VTOL has no runway stall requirement at all — what actually bounds
     its wing loading is that the wing must carry the aircraft at TRANSITION,
     before the lift rotors stop. That is why eVTOL wing loadings are high:
     they never have to fly slowly.

     RECOVERED BY INVERSION -- AND THAT MAKES IT A FIT, NOT A DERIVATION.
     Solving W/S = 0.5 rho V^2 CLmax for the published loadings at CLmax 1.5:
         Joby   1524 N/m2 -> 42.7 m/s (83 kt)
         Archer 1371 N/m2 -> 40.5 m/s (79 kt)
     Both are ordinary eVTOL transition speeds, so the pair (CLmax 1.5, ~41 m/s)
     is at least CONSISTENT with real aircraft rather than invented.

     BE HONEST ABOUT WHAT THIS IS. Because both inputs were recovered FROM the
     published wing loadings, feeding them back in returns a number between those
     same loadings BY CONSTRUCTION. It is a two-aircraft fit wearing the clothes
     of a derivation, and an earlier gate in validation/analysis-layers.mjs
     "checked" that the result landed between 1371 and 1524 -- a fixed constant
     tested against the interval it was built from, which could never fail. That
     is the same defect this project has now removed twice elsewhere.

     A corpus search found NO published eVTOL transition speed and no
     eVTOL-specific CLmax to break the circularity with, so THE CIRCULARITY IS
     NOT BROKEN and wing loading REMAINS AN INPUT. What is genuinely available
     is the inverse statement, which is not circular and is what
     `impliedTransitionSpeed` below reports: for the wing loading the user
     actually chose, how fast must the aircraft be before the wing alone can
     carry it -- i.e. before the lift rotors may stop. That turns W/S from an
     unexplained slider into a number with a stated physical consequence.

     The POWER-LOADING constraints in this diagram are NOT affected by any of
     this: cruise, climb and turn come from the converged drag polar and hover
     from momentum theory. Only the wing limit is a fit. */
  const CLmax   = p.clMaxTransition ?? 1.5;              // [LAY] simple flapped wing
  const Vstall  = p.vStall ?? p.vTransition ?? 41.0;     // [LAY] 80 kt, recovered above

  const WSmax = hasWing ? stallWingLoading({ rho, Vstall, CLmax }) : null;
  const hoverWP = hoverConstraint({
    rhoHover: rhoHov,
    diskLoadingNm2: opts.diskLoadingNm2 ?? 0,
    FM: p.etaHov ?? 0.72,
    downloadFrac: opts.downloadFrac ?? 0,
  });

  const lo = 200, hi = Math.max(400, (WSmax ?? 2500) * 1.25), N = 60;
  const grid = Array.from({ length: N + 1 }, (_, i) => lo + (hi - lo) * i / N);

  const curves = [];
  if (hasWing) {
    curves.push({
      key: "cruise", label: `Cruise at ${V.toFixed(0)} m/s`, kind: "power",
      basis: "[EQ] Raymer ch.5 level-flight power required",
      points: grid.map(WS => ({ WS, WP: cruiseConstraint(WS, { rho, V, CD0, AR, e, eta }) })),
    });
    const gam = Math.atan((p.rateOfClimb ?? 5.08) / Math.max(1, V));
    curves.push({
      key: "climb", label: `Climb ${(p.rateOfClimb ?? 5.08).toFixed(1)} m/s`, kind: "power",
      basis: "[EQ] Raymer ch.5 climb power required",
      points: grid.map(WS => ({ WS, WP: climbConstraint(WS, { rho, V, CD0, AR, e, eta, gammaRad: gam }) })),
    });
    const n = p.turnLoadFactor ?? 1.3;
    curves.push({
      key: "turn", label: `Sustained turn n=${n}`, kind: "power",
      basis: "[LAY] load factor; the equation is Raymer ch.5 with n^2 on induced",
      points: grid.map(WS => ({ WS, WP: turnConstraint(WS, { rho, V, CD0, AR, e, eta, n }) })),
    });
  }
  if (hoverWP != null) {
    curves.push({
      key: "hover", label: "Hover OGE", kind: "power-flat",
      basis: "[SRC] momentum theory with figure of merit and download — the "
           + "constraint a fixed-wing diagram does not have, and normally the "
           + "binding one for an eVTOL",
      points: grid.map(WS => ({ WS, WP: hoverWP })),
    });
  }

  /* Feasible W/P at a given W/S is the SMALLEST of the power curves (a small
     W/P means a big powerplant, and every constraint must be met). */
  const wpAt = (WS) => {
    const vals = curves.map(c => c.points.find(pt => pt.WS === WS)?.WP)
                       .filter(v => v != null && isFinite(v));
    return vals.length ? Math.min(...vals) : null;
  };

  /* Design point: largest W/S allowed by stall, then the W/P available there.
     Highest W/S = smallest wing; the W/P that follows is the smallest
     powerplant that still meets every constraint at that wing loading. */
  const WSdesign = hasWing ? (WSmax ?? null) : null;
  const WPdesign = hasWing ? wpAt(grid.reduce((a, b) =>
                      Math.abs(b - (WSdesign ?? hi)) < Math.abs(a - (WSdesign ?? hi)) ? b : a))
                   : hoverWP;

  let binding = null;
  if (WPdesign != null) {
    const at = WSdesign ?? grid[0];
    let best = Infinity;
    for (const c of curves) {
      const v = c.points.reduce((acc, pt) =>
        Math.abs(pt.WS - at) < Math.abs(acc.WS - at) ? pt : acc, c.points[0]);
      if (v?.WP != null && v.WP < best) { best = v.WP; binding = c.key; }
    }
  }

  /* For the wing loading the DESIGN uses, not the one this diagram derives. */
  const implied = hasWing && p.wingLoadingNm2 > 0
    ? impliedTransitionSpeed(p.wingLoadingNm2, { rho })
    : null;

  return {
    axes: { x: "wing loading W/S, N/m^2", y: "power loading W/P, N/W" },
    hasWing, curves, stallWS: WSmax,
    wingLimitIsAFit: true,
    wingLimitBasis: "CLmax 1.5 and ~41 m/s were RECOVERED by inverting the "
      + "published wing loadings of Joby (1524) and Archer (1371), so this line "
      + "reproduces them by construction. It is a two-aircraft fit, not a "
      + "derivation. The power-loading curves are unaffected — they come from "
      + "the converged drag polar and momentum theory.",
    impliedTransition: implied,
    designPoint: (WSdesign != null || WPdesign != null)
      ? { WS: WSdesign, WP: WPdesign, WP_kgPerKW: WPdesign != null ? WPdesign * 1000 / 9.80665 : null }
      : null,
    binding,
    note: hasWing
      ? "Feasible region is BELOW every power curve and LEFT of the stall line; "
        + "the design point is its top-right corner — smallest wing, smallest powerplant."
      : "Rotor-borne: no wing constraints exist, so the design space is the hover "
        + "line alone. That is the honest answer, not a missing feature.",
  };
}
