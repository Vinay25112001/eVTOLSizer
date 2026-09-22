/* =====================================================================
   AIRFOIL SELECTION — what section this wing needs, and which published
   ones meet it
   =====================================================================
   The wing was described by area, aspect ratio, sweep, taper and a
   thickness ratio, plus a FLOPS "airfoil technology" scalar running 1 to 2
   that fed a drag build-up. Nothing connected that scalar to a real
   section, so a user could ask for 13 % thickness at M 0.85 and the tool
   would size it without ever saying that no published section does that.

   THE EQUATION. Mason, Configuration Aerodynamics, Ch. 7, printed p. 7-18,
   Eq. (7-4) — the same relation appears as Eq. 3-1 in Grasmeyer's Virginia
   Tech thesis, p. 15:

       M_dd = A/cos(L) - (t/c)/cos^2(L) - c_l/(10 cos^3(L))

   with L the quarter-chord sweep and A a technology factor: 0.87 for a
   conventional section, 0.95 for a supercritical one. Mason gives two
   independent calibrations on p. 7-19 — A = 0.89 reproduces the 747-100's
   flight-test wave drag, A = 0.955 the 777's.

   NOTE, because it is easy to get wrong and this project got it wrong
   first: the thickness term is NOT divided by ten. A form written
   "M_dd + (t/c)/10 + C_L/10 = K/cos L" under-weights thickness tenfold.
   Only the lift term carries the ten.

   HOW IT IS USED HERE. Two separate questions, answered separately.

   1. WHAT TECHNOLOGY DOES THIS WING NEED? Rearranging for A at the design
      point, with the wing required to reach its own cruise Mach plus a
      margin, gives the technology factor the section must have. Comparing
      that against 0.87 and 0.95 says plainly whether a conventional
      section will do, whether it needs to be supercritical, or whether it
      is beyond both — which is a real answer, not a ranking.

   2. WHICH PUBLISHED SECTIONS MEET IT? The dataset carries a measured
      two-dimensional M_dd for fifteen sections. A swept wing sees the
      component of the flow normal to the quarter chord, so the section
      must survive M cos(L), and it is compared against that with the same
      margin. Sections are then ordered by how close they sit to the wing's
      own thickness and design lift coefficient, because a section that
      clears the Mach requirement but is three points thinner than the wing
      is not a drop-in.

   THE MARGIN is 0.02 to 0.03, taken from the one case in the dataset where
   a published section M_dd and a real cruise Mach meet: the CitationJet's
   HSNLF(1)-0213 has M_dd 0.72 against a cruise Mach of 0.70.

   WHAT THIS CANNOT DO. It cannot compute a polar, so it cannot tell you
   the drag of a section it recommends; the tool's drag still comes from
   the FLOPS build-up. No supercritical section in the dataset has a
   published pitching moment, so a section choice cannot yet be carried
   into tail sizing or trim drag. And which section a given real aircraft
   actually flies is proprietary for most modern transports — the dataset
   deliberately carries no such mapping rather than carrying a secondary
   one that would then be quoted as if it were sourced.
   ===================================================================== */

import { AIRFOILS } from "./airfoil-data.js";

export { AIRFOILS };

/* Technology factors. Mason Ch. 7 p. 7-18 for the two classes, p. 7-19 for
   the two aircraft calibrations. */
export const TECH = Object.freeze({
  conventional: { A: 0.87, label: "conventional" },
  supercritical: { A: 0.95, label: "supercritical" },
  calibrations: [
    { A: 0.89, label: "747-100, from flight-test wave drag (Mason p. 7-19)" },
    { A: 0.955, label: "777, from flight-test wave drag (Mason p. 7-19)" },
  ],
});

export const DESIGN_MARGIN = 0.025;   // 0.02-0.03; see the header

const rad = (d) => (d * Math.PI) / 180;

/* Mason Eq. (7-4), forwards: the wing's drag-divergence Mach number. */
export function dragDivergenceMach({ techFactor, tc, sweepDeg, cl }) {
  const c = Math.cos(rad(sweepDeg));
  return techFactor / c - tc / (c * c) - cl / (10 * c * c * c);
}

/* The same relation solved for the technology factor a wing needs to reach
   a required M_dd. */
export function requiredTechFactor({ mDdRequired, tc, sweepDeg, cl }) {
  const c = Math.cos(rad(sweepDeg));
  return c * (mDdRequired + tc / (c * c) + cl / (10 * c * c * c));
}

/* Map the tool's existing FLOPS airfoil-technology scalar (1 conventional
   to 2 supercritical) onto A, so the two descriptions cannot disagree. */
export const techFactorFromFlops = (airfoilTech) => {
  const t = Math.min(2, Math.max(1, Number(airfoilTech) || 1));
  return TECH.conventional.A + (t - 1) * (TECH.supercritical.A - TECH.conventional.A);
};

/* The design-point lift coefficient the section works at. Uses the cruise
   CL the sizing already computed where it exists. */
function designCl(result) {
  const cl = result?.cruise?.cl;
  return Number.isFinite(cl) && cl > 0 ? cl : null;
}

/* ── the answer ────────────────────────────────────────────────────────
   Returns the technology verdict, and the published sections that meet the
   requirement, best fit first. */
export function airfoilAdvice(result, opts = {}) {
  const p = result?.raw?.inputs ?? {};
  const type = result?.type;
  const tc = p.wingTc;
  const sweepDeg = p.wingSweep ?? 0;
  const mach = result?.cruise?.mach ?? p.cruiseMach;
  const cl = designCl(result);
  const margin = opts.margin ?? DESIGN_MARGIN;

  if (![tc, sweepDeg, mach].every(Number.isFinite) || cl === null) {
    return { unavailable: true,
      reason: "This type does not report a cruise Mach number, a wing thickness ratio and a cruise lift "
            + "coefficient together, and the drag-divergence relation needs all three." };
  }

  const mDdRequired = mach + margin;
  /* Feasibility is judged on reaching the cruise Mach itself. The design
     margin is a separate question - how much is in hand - and folding it
     into the verdict would declare real aeroplanes impossible: the 737-800
     cruises at M 0.785 on 13 % thickness and 25 degrees of sweep, which
     needs A just under the supercritical 0.95 with very little to spare. */
  const needA = requiredTechFactor({ mDdRequired: mach, tc, sweepDeg, cl });
  const needAWithMargin = requiredTechFactor({ mDdRequired, tc, sweepDeg, cl });
  const haveA = techFactorFromFlops(p.airfoilTech ?? 1);
  const achieved = dragDivergenceMach({ techFactor: haveA, tc, sweepDeg, cl });

  const marginInHand = achieved - mach;
  const verdict =
    needA <= TECH.conventional.A
      ? { level: "conventional", text: "A conventional section reaches this cruise Mach." }
  : needA <= TECH.supercritical.A
      ? { level: "supercritical", text: "This cruise Mach needs a supercritical section; a conventional one will not reach it." }
      : { level: "beyond", text: "This cruise Mach is beyond even a supercritical section at this sweep and thickness. "
                               + "Thin the wing, sweep it more, or slow it down." };
  verdict.margin = marginInHand >= margin
    ? `Drag-divergence margin in hand: ${marginInHand.toFixed(3)} Mach, at or above the ${margin} the design convention asks for.`
    : `Drag-divergence margin in hand is only ${marginInHand.toFixed(3)} Mach against the ${margin} the design convention asks for, `
      + "so this wing is working close to its divergence boundary.";

  /* Sections that survive the normal-component Mach, with the same margin. */
  const mNormal = mach * Math.cos(rad(sweepDeg));
  const candidates = AIRFOILS
    .filter((a) => Number.isFinite(a.mDd))
    .filter((a) => !type || a.suits.length === 0 || a.suits.includes(type))
    .map((a) => ({
      ...a,
      meets: a.mDd >= mNormal + margin,
      machMargin: a.mDd - mNormal,
      tcGap: Number.isFinite(a.tc) ? a.tc - tc : null,
      clGap: Number.isFinite(a.clDesign) ? a.clDesign - cl : null,
      /* Closeness of fit: a section that clears the Mach requirement but is
         far from the wing's own thickness or design lift is not a drop-in. */
      fit: (Number.isFinite(a.tc) ? Math.abs(a.tc - tc) / Math.max(tc, 1e-6) : 1)
         + (Number.isFinite(a.clDesign) ? Math.abs(a.clDesign - cl) / Math.max(cl, 1e-6) : 1),
    }))
    .sort((x, y) => (y.meets - x.meets) || (x.fit - y.fit));

  const met = candidates.filter((c) => c.meets);
  /* The most efficient option is the one with the most Mach margin in hand
     at a thickness no less than the wing's - thinner buys margin but costs
     structural weight, and FLOPS wing bending goes as (t/c) to the minus
     one exactly (TM-2017-219627 Eqs. 10, 23, 33), so the trade is real. */
  const best = met.filter((c) => Number.isFinite(c.tc) && c.tc >= tc * 0.98)
                  .sort((x, y) => y.machMargin - x.machMargin)[0]
            ?? met[0] ?? null;

  /* Below about M 0.5 no published low-speed section carries a measured
     drag-divergence Mach because divergence is not what sizes it. Saying
     "0 sections meet it" would be a false negative. */
  const divergenceRelevant = mach >= 0.5;

  return {
    divergenceRelevant,
    design: { mach, tc, sweepDeg, cl, margin, mDdRequired, mNormal },
    technology: {
      required: needA, requiredWithMargin: needAWithMargin, have: haveA, achievedMdd: achieved,
      marginInHand,
      shortfall: mDdRequired - achieved,
      verdict, calibrations: TECH.calibrations,
      flopsScalar: p.airfoilTech ?? 1,
    },
    candidates: divergenceRelevant ? candidates.slice(0, 10) : [],
    met: met.length,
    best: divergenceRelevant ? best : null,
    note: divergenceRelevant ? null
      : `At M ${mach} drag divergence does not size this wing, so no section is ranked against it. `
      + "The sections suited to this class are chosen on maximum lift, thickness for structure, and "
      + "behaviour at the stall, none of which this dataset carries a complete polar for.",
    caveats: [
      "The relation is Mason Eq. (7-4); the thickness term is not divided by ten, which is a common slip.",
      "A recommendation here is about drag divergence only. It carries no polar, so it cannot tell you the "
      + "drag of the section it names; the tool's drag still comes from the FLOPS build-up.",
      "No supercritical section in the dataset has a published pitching moment, so a section choice cannot "
      + "yet be carried into tail sizing or trim drag.",
      "Which section a real aircraft flies is proprietary for most modern transports. The dataset carries no "
      + "aircraft-to-section mapping rather than carrying a secondary one that would be read as sourced.",
    ],
  };
}
