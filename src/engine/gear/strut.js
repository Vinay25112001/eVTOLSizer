/* =====================================================================
   G5 — OLEO STROKE, AND THE TYRE EFFICIENCY THE TEXTBOOKS ASSERT
   =====================================================================
   The energy a landing gear must absorb, and the stroke it needs to
   absorb it. LANDING-GEAR.md section 1.4.

   THE EFFICIENCY DEFINITION IS THE REGULATION'S, NOT A TEXTBOOK'S.
   MIL-L-8552C section 3.5.2 states it outright:

     "Percent EFF = 100 x A / (L_m x S_m)  where A = Energy absorbed by
      the shock absorber during its stroke ... obtained by integration of
      the area under the curve of landing gear load versus landing gear
      stroke. L_m = Maximum load ... S_m = Maximum stroke"

   and sets the floor: not less than 75 percent for a variable orifice,
   as low as 60 percent for a constant one.

   THE ENERGY BALANCE, section 1.4b, eq. (22):

     1/2 (W/g) V^2 + (1 - L) W (S + d_t) = N W (eta_s S + eta_t d_t)

   solved for the stroke, eq. (23):

     S = [ V^2/(2g) + (1 - L) d_t - eta_t N d_t ] / ( eta_s N - (1 - L) )

   ── THE GAP THIS MODULE CLOSES ───────────────────────────────────────

   LANDING-GEAR.md section 5 gap 1 records eta_t, the TYRE energy
   efficiency, as NOT VERIFIED: "The value 0.47 that every textbook
   quotes was not found in any primary I opened." It offers two ways out
   — fit it to the validation aircraft, or "integrate the TN 4110 static
   force-deflection curve to derive eta_t honestly".

   This module does the second, and it needs no new source, because
   MIL-L-8552C's definition above is already the ratio of the area under
   a force-deflection curve to the rectangle around it. Applied to a
   TYRE rather than to a strut, with NACA TN 4110's measured curve:

     eq. (24) of TN 4110, the continuous form, page 18:

       F_z / [(p + 0.08 p_r) w sqrt(w d)]
                  = 2.4 [ x - Cz ( 1 - exp( -0.6 x / Cz ) ) ],   x = d/w

     with Cz = 0.02 for type I tyres and 0.03 for types III and VII.

   Integrating that against MIL-L-8552C's definition is closed form:

     eta_t(X) = [ X^2/2 - Cz X + (Cz^2/0.6)(1 - exp(-0.6X/Cz)) ]
                / ( X g(X) ),     g(x) = x - Cz(1 - exp(-0.6x/Cz))

   AND THE ANSWER IS NOT A CONSTANT. eta_t rises with deflection, from
   about 0.445 at a tenth of a section width to exactly 0.5 in the limit
   where the curve becomes a straight line through the origin. The
   textbook 0.47 is this function at x = 0.407 — squarely in the
   practical range. So the number everyone quotes is not wrong; it is a
   single sample of a curve, reported as though it were a property of
   tyres in general. This module computes the curve per tyre, from that
   tyre's own tabulated geometry, and quotes nothing.

   A WARNING ABOUT HOW THIS WAS READ. The first attempt took the relation
   from the PDF's text layer, which OCRs equation (23) as
   "0.96(6/w) + 0.216(8/w)2" — a quadratic, with coefficients that belong
   to a different equation elsewhere on the page. Rendering page 18 as an
   image shows the real form, which is linear in x with an exponential
   offset. The derivation was rebuilt from the rendered page. The text
   layer of a 1957 scan is a lead; the page is the evidence.
   ===================================================================== */

/* MIL-L-8552C section 3.5.2, the two floors it states. */
export const ETA_OLEO = Object.freeze({
  variableOrifice: 0.75,
  fixedOrifice: 0.60,
  src: "MIL-L-8552C section 3.5.2: not less than 75 percent for a variable "
     + "orifice, as low as 60 percent where a constant orifice is used",
});

/* NACA TN 4110 p.18. Type I is the old smooth-contour tyre and does not
   appear in the shipped data book; every size there is type III, VII or
   a later radial. Radials post-date the 1957 report, so they inherit the
   type VII value and this module says so rather than inventing one. */
export const TN4110_CZ = Object.freeze({
  typeI: 0.02,
  typeIII_VII: 0.03,
  src: "NACA TN 4110 eq. (23)/(24) p.18: Cz = 0.02 for type I tyres, "
     + "0.03 for types III and VII",
  radialNote: "radial (type VIII) tyres post-date TN 4110 and are taken at the "
            + "type VII value; the report offers no radial figure",
});

/* TN 4110's dimensionless force function, eq. (24). */
export function tn4110Force(x, cz = TN4110_CZ.typeIII_VII) {
  if (!(x > 0)) return 0;
  return 2.4 * (x - cz * (1 - Math.exp((-0.6 * x) / cz)));
}

/* ── eta_t, MIL-L-8552C's definition applied to TN 4110's curve ───────
   Closed form. `X` is the deflection ratio delta/w at which the tyre is
   being worked. Checked against Simpson's rule in the gate, because a
   closed form that has never been integrated numerically is an
   assertion, not a result. */
export function tyreEfficiency(X, cz = TN4110_CZ.typeIII_VII) {
  if (!(X > 0)) return null;
  const area = (X * X) / 2 - cz * X
             + ((cz * cz) / 0.6) * (1 - Math.exp((-0.6 * X) / cz));
  const rect = X * (X - cz * (1 - Math.exp((-0.6 * X) / cz)));
  if (!(rect > 0)) return null;
  return area / rect;
}

/* The deflection ratio a tabulated tyre runs at, from its own geometry.
   The data book's header states the relation: deflection = od/2 - slr.
   Width is the tabulated maximum section width. */
export function tyreDeflectionRatio(tyre) {
  if (!tyre || !(tyre.widthMaxIn > 0)) return null;
  const deflectionIn = tyre.odMaxIn / 2 - tyre.slrIn;
  if (!(deflectionIn > 0)) return null;
  return deflectionIn / tyre.widthMaxIn;
}

/* eta_t for a specific tyre, with the reasoning attached. */
export function tyreEfficiencyFor(tyre) {
  const X = tyreDeflectionRatio(tyre);
  if (X == null) return { resolved: false, why: "the tyre row carries no usable width or radius" };
  const radial = /R/.test(tyre.size || "");
  const cz = TN4110_CZ.typeIII_VII;
  const eta = tyreEfficiency(X, cz);
  return {
    resolved: true,
    eta, deflectionRatio: X, cz, radial,
    deflectionIn: tyre.odMaxIn / 2 - tyre.slrIn,
    src: "NACA TN 4110 eq. (24) integrated against MIL-L-8552C section "
       + "3.5.2's efficiency definition",
    note: radial ? TN4110_CZ.radialNote : null,
  };
}

/* ── STROKE, eq. (23) ─────────────────────────────────────────────────
   `V` sink speed (m/s), `L` lift fraction, `N` gear reaction factor,
   `etaS` strut efficiency, `etaT` tyre efficiency, `deltaT` tyre
   deflection (m), `g` gravity supplied by the caller so this module
   keeps no constant of its own. */
export function strokeFromEnergy({ V, L = 1.0, N, etaS, etaT, deltaT, g }) {
  if (!(V > 0) || !(N > 0) || !(etaS > 0) || !(g > 0)) {
    return { resolved: false, why: "stroke needs a sink speed, a reaction factor, "
                                 + "a strut efficiency and gravity" };
  }
  const denom = etaS * N - (1 - L);
  if (!(denom > 0)) {
    return { resolved: false, denom,
             why: "the strut cannot absorb the energy: eta_s N does not exceed "
                + "the unbalanced weight fraction (1 - L)" };
  }
  const S = ((V * V) / (2 * g) + (1 - L) * deltaT - etaT * N * deltaT) / denom;
  return {
    resolved: true, strokeM: S, denom,
    /* With L = 1 the balance collapses to eq. (24); reported so the two
       forms can be checked against each other rather than trusted. */
    collapsedForm: L === 1 ? (V * V) / (2 * g * etaS * N) - (etaT / etaS) * deltaT : null,
    src: "LANDING-GEAR.md section 1.4b eq. (23), from the energy balance (22)",
  };
}

/* ── RESERVE ENERGY, 14 CFR 25.723(b) ─────────────────────────────────
   The reserve-energy condition is the same drop at 12 ft/s rather than
   10, and the gear must not bottom. Energy goes as V^2, so the reserve
   case carries (12/10)^2 = 1.44 times the design energy — the ratio is
   derived from the two speeds rather than written in as a constant, so
   that changing either speed cannot leave a stale 1.44 behind. */
export function reserveEnergyRatio(designFps, reserveFps) {
  if (!(designFps > 0) || !(reserveFps > 0)) return null;
  return (reserveFps / designFps) ** 2;
}
