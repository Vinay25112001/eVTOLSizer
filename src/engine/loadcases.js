/* =====================================================================
   STRUCTURAL LOAD CASES
   =====================================================================
   WHY THIS EXISTS

   engine/wingbox.js sized the wing for ONE condition: a symmetric manoeuvre at
   an assumed ultimate load factor of 5.25 (1.5 x 3.5g). A real wing is sized by
   the WORST of several cases, and for an aircraft with low wing loading the
   gust case routinely exceeds the manoeuvre case — which is exactly the regime
   an eVTOL sits in. Sizing on manoeuvre alone is therefore not conservative,
   it is simply wrong for this class.

   ── THE CRITERIA ARE PUBLISHED, AND THEY ARE eVTOL-SPECIFIC ──────────

   EASA MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2215 "Flight Load
   Conditions", paragraph (f) Gust Conditions, verbatim:

     "The aircraft should be designed to withstand, at each critical airspeed up
      to VD, including hovering, the loads resulting from vertical and
      horizontal gusts of 9.14 metres per second (30 ft/s)."

     "The aircraft should be designed to withstand, at each critical airspeed up
      to VH or VNE, whichever is lower, including hovering, the loads resulting
      from vertical and horizontal gusts of 15.24 metres per second (50 ft/s)."

     "For Category Enhanced, the aircraft should be designed to withstand, at
      each critical airspeed up to VB including hovering, the loads resulting
      from vertical and horizontal rough air gusts of 20.12 m/s (66 ft/s)"

     "The aircraft should be designed to withstand 100% of the vertical gust
      condition of (1) acting on one side of the aircraft."

   and the gust shape for wing structures is the tuned (1-cos) discrete gust:

     "U = Ude/2 (1 - cos(2*pi*s / (25 C_bar)))"   s = distance penetrated,
                                                  C_bar = mean geometric chord

   NOTE this is the SC-VTOL set, NOT CS-23's. Using CS-23 numbers here would be
   the same reference-class mistake that put Raymer's GA weight equations into
   an eVTOL.

   ── HOW THE LOAD FACTOR IS OBTAINED ──────────────────────────────────

   The MOC's (1-cos) shape implies a dynamic response analysis, which is beyond
   conceptual sizing. The standard conceptual approximation is the sharp-edged
   gust with an alleviation factor, which is the form CS-23.341 and FAR 23.341
   use and which is calibrated to give comparable answers:

       delta_n = K_g * U_de * V * a * rho_0 / (2 * (W/S))
       K_g     = 0.88 mu / (5.3 + mu)          gust alleviation factor
       mu      = 2 (W/S) / (rho * c_bar * a * g)   aircraft mass ratio

   K_g is the crucial term: a light aircraft is accelerated by the gust before
   it fully penetrates it, so it never sees the full sharp-edged increment.
   Omitting K_g over-predicts the gust factor badly at low wing loading.

   The ASYMMETRIC case ("100% on one side") does not raise wing ROOT BENDING
   above the symmetric case — the loaded semi-span sees the same intensity — but
   it does size roll control and the wing/fuselage attachment. It is reported
   for that reason rather than folded into the bending case, which would be
   double-counting.
   ===================================================================== */

import { G0 } from "./constants.js";

/* SC-VTOL VTOL.2215(f) derived gust velocities, m/s EAS. */
export const SC_VTOL_GUSTS = [
  { label: "30 ft/s at VD",             Ude: 9.14,  speedKey: "VD",
    src: "MOC SC-VTOL VTOL.2215(f)(1)" },
  { label: "50 ft/s at VH/VNE",         Ude: 15.24, speedKey: "VH",
    src: "MOC SC-VTOL VTOL.2215(f)(2)" },
  { label: "66 ft/s at VB (Enhanced)",  Ude: 20.12, speedKey: "VB",
    src: "MOC SC-VTOL VTOL.2215(f)(3), Category Enhanced only" },
];

/**
 * Governing structural load factor across manoeuvre and gust cases.
 *
 * @param p  parameter set
 * @param g  { MTOW, Swing, MAC, rho, rho0, CLaW, vCruise, CLmax }
 */
/* ── MOC SC-VTOL VTOL.2200(f), AS A FUNCTION SO IT HAS ONE HOME ───────
   The floor and the "maximum capability" rule were previously written into
   loadCases() alone, which only runs for a WING. Rotor-borne layouts got no
   load cases at all, and every other structural module that needed a load
   factor hard-coded its own — booms.js carried 5.25 (1.5 x 3.5g) with no
   source, for aircraft whose rotors cannot produce 3.5 g of thrust.

   The MOC's own words, quoted in loadCases below: the limit manoeuvring load
   factors are "defined based on the MAXIMUM CAPABILITY OF THE AIRCRAFT,
   taking into account the flight control system", with the positive factor
   "not less than 2.0".

   For a THRUST-BORNE load path the maximum capability is not a category
   table, it is the installed thrust-to-weight: a boom cannot be handed more
   rotor thrust than the rotors are able to make. At the app default T/W of
   1.30 the 2.0 floor governs and is the conservative answer. */
export const SC_VTOL_N_LIMIT_FLOOR = 2.0;
/* The negative counterpart, same sentence of MOC VTOL.2200(f): "the negative
   limit manoeuvring load factor is not less than -0.5". */
export const SC_VTOL_N_NEG_FLOOR = -0.5;

/* The APPLICANT'S PROPOSAL, used when the user sets none. MOC VTOL.2200(f)
   Note: "An absolute maximum positive and negative limit manoeuvring load
   factor may be proposed for acceptance by EASA". 3.5 / -1.5 have no source
   of their own; they are kept so existing designs are unchanged, and they
   live here and nowhere else. */
export const PROPOSED_N_LIMIT_MANOEUVRE = 3.5;
export const PROPOSED_N_LIMIT_MANOEUVRE_NEG = -1.5;

/* The range the sidebar lets a user PROPOSE. The inner ends are the MOC
   VTOL.2200(f) floors, so the UI cannot ask for a value manoeuvreLimits()
   would silently raise. The outer ends have NO SOURCE: nothing in SC-VTOL,
   its MOC or AC 21.17-4 caps a proposal, so they are an input range wide
   enough for any conceptual design, not a requirement. */
export const N_LIMIT_MANOEUVRE_INPUT_RANGE = {
  pos: { min: SC_VTOL_N_LIMIT_FLOOR, max: 6.0 },
  neg: { min: -3.0, max: SC_VTOL_N_NEG_FLOOR },
};

/**
 * Limit MANOEUVRING load factors for a wing-borne design: the user's (or the
 * default) proposal, floored per MOC VTOL.2200(f). This is the cap of the
 * drawn manoeuvre envelope and the n in VA = VS sqrt(n). It is NOT the
 * governing structural factor - that is the worse of this and the gusts.
 */
export function manoeuvreLimits(p) {
  return {
    pos: Math.max(SC_VTOL_N_LIMIT_FLOOR, p?.nLimitManoeuvre ?? PROPOSED_N_LIMIT_MANOEUVRE),
    neg: Math.min(SC_VTOL_N_NEG_FLOOR, p?.nLimitManoeuvreNeg ?? PROPOSED_N_LIMIT_MANOEUVRE_NEG),
  };
}

/**
 * Limit manoeuvring load factor for a THRUST-BORNE load path, per MOC
 * SC-VTOL VTOL.2200(f). Capability is the installed thrust-to-weight,
 * floored at the MOC's 2.0.
 */
export function thrustBorneLimitFactor(p) {
  const capability = Math.max(1, Number(p?.twRatio) || 1.3);
  return Math.max(SC_VTOL_N_LIMIT_FLOOR, capability);
}

/* ── THE FACTOR OF SAFETY, WITH ITS TWO AUTHORITIES ───────────────────
   Both frameworks state it identically and neither leaves it to the
   applicant's judgement:

     AC 21.17-4 App.A PL.2230(b): "The ultimate loads, which are equal to
       the limit loads multiplied by a 1.5 factor of safety unless
       otherwise specified elsewhere in these airworthiness criteria."
     SC-VTOL-02 VTOL.2230(a)(2): "the ultimate loads, which are equal to
       the limit loads multiplied by a 1.5 factor of safety, unless
       otherwise provided."

   It is named here rather than written as a bare 1.5 in four files. */
export const ULTIMATE_FACTOR_OF_SAFETY = 1.5;

/**
 * Airframe limit and ultimate load factors for ANY layout.
 *
 * WHY THIS EXISTS. loadCases() needs a wing — its gust increment is
 * Kg*Ude*V*a/(2*W/S), undefined at W/S = 0 — so engine.js ran it only for
 * winged layouts and reported nLimit/nUltimate as null for multicopter and
 * sideBySide. Every consumer that wanted a load factor therefore wrote its
 * own: the certification tab carried 3.5, the report exporter carried 3.5
 * twice, the regulation tracker carried 3.5, weights.js carries 5.25. Five
 * copies of a number the engine is supposed to own.
 *
 * A thrust-borne airframe still has a limit load factor. It is not a wing
 * gust case, it is MOC SC-VTOL VTOL.2200(f)'s "maximum capability of the
 * aircraft" floored at 2.0 — which is exactly what booms.js already sizes
 * to. This function returns one answer for every layout and says which of
 * the two paths produced it.
 *
 * @param p   parameter set
 * @param lc  the loadCases() result for a winged layout, or null
 */
export function airframeLoadFactors(p, lc) {
  /* The NEGATIVE factor, which loadCases() has computed as
     nLimitManoeuvreNeg since it was written and engine.js never exported.
     report.js drew its V-n envelope to a literal -1.5 in two places for
     want of it. MOC VTOL.2200(f): "the negative limit manoeuvring load
     factor is not less than -0.5" — a FLOOR in magnitude, so the design
     value is the more negative of the proposal and that floor. */
  const nLimitNeg = manoeuvreLimits(p).neg;
  if (lc) {
    return {
      nLimit: lc.nLimit,
      nUltimate: lc.nUltimate,
      nLimitNeg: lc.nLimitManoeuvreNeg,
      nLimitManoeuvre: lc.nLimitManoeuvre,
      basis: "wing-borne",
      governingCase: lc.governingCase,
      source: "MOC SC-VTOL VTOL.2200(f) manoeuvre floor against VTOL.2215(f) "
            + "gusts, worst case governing; ultimate per VTOL.2230(a)(2)",
    };
  }
  const nLimit = thrustBorneLimitFactor(p);
  const capability = Math.max(1, Number(p?.twRatio) || 1.3);
  return {
    nLimit,
    nUltimate: ULTIMATE_FACTOR_OF_SAFETY * nLimit,
    nLimitNeg,
    nLimitManoeuvre: nLimit,
    basis: "thrust-borne",
    governingCase: nLimit > capability
      ? `SC-VTOL 2.0g floor (installed T/W ${capability.toFixed(2)} cannot reach it)`
      : `installed thrust-to-weight ${capability.toFixed(2)}`,
    source: "MOC SC-VTOL VTOL.2200(f) — limit manoeuvring load factor set by "
          + "maximum capability of the aircraft, not less than 2.0. No wing, "
          + "so VTOL.2215(f)'s wing gust cases do not apply",
  };
}

export function loadCases(p, g) {
  const WS   = (g.MTOW * G0) / Math.max(0.5, g.Swing);   // wing loading, N/m^2
  const rho  = g.rho ?? 1.225;
  const rho0 = g.rho0 ?? 1.225;                          // sea-level, for EAS
  const a    = g.CLaW ?? 5.0;                            // lift-curve slope, /rad
  const cBar = Math.max(0.1, g.MAC ?? 1.5);

  /* Aircraft mass ratio and gust alleviation factor. */
  const mu = 2 * WS / (rho * cBar * a * G0);
  const Kg = 0.88 * mu / (5.3 + mu);

  /* Design speeds. VH is taken as cruise (max continuous); VD and VB follow the
     usual conceptual relations to it. These are [LAY] proportions — the MOC
     defines the speeds by their own rules, which need a full flight envelope. */
  const VH = g.vCruise;
  const VD = VH * 1.25;
  const VB = VH * 0.85;
  const speeds = { VH, VD, VB };

  /* ── MANOEUVRE CASE ───────────────────────────────────────────────────
     The inherited value was 3.5g, which is GA practice (CS-23 normal category
     is 3.8). SC-VTOL sets it differently — MOC VTOL.2200(f):

       "The positive and negative limit manoeuvring load factors should be
        defined based on the MAXIMUM CAPABILITY OF THE AIRCRAFT, taking into
        account the flight control system (without failure cases) ... The
        positive load factor is not less than 2.0 and the negative limit
        manoeuvring load factor is not less than -0.5."

     So the floor is 2.0, and the actual value is set by what the FCS will
     permit, not by a category table. A full-authority FBW eVTOL with envelope
     protection is typically limited well below 3.5g — and at the 2.0 floor the
     GUST case governs the wing instead, which changes the structure.

     Kept at 3.5 by default so existing designs are unchanged, but the SC-VTOL
     floor is enforced and the value is now a visible parameter rather than a
     buried constant. */
  const { pos: nManLimit, neg: nManNeg } = manoeuvreLimits(p);

  /* Gust cases. */
  const gusts = SC_VTOL_GUSTS
    .filter((gc) => gc.speedKey !== "VB" || (p.vtolCategory ?? "enhanced") === "enhanced")
    .map((gc) => {
      const V  = speeds[gc.speedKey];
      const dn = Kg * gc.Ude * V * a * rho0 / (2 * WS);
      return { ...gc, V, deltaN: dn, nLimit: 1 + dn, nLimitNeg: 1 - dn };
    });

  const worstGust = gusts.reduce((x, y) => (y.nLimit > x.nLimit ? y : x), gusts[0]);
  const gustGoverns = worstGust.nLimit > nManLimit;

  const nLimit    = Math.max(nManLimit, worstGust.nLimit);
  const nUltimate = ULTIMATE_FACTOR_OF_SAFETY * nLimit;

  return {
    wingLoadingNm2: WS, massRatio: mu, gustAlleviation: Kg,
    speeds, gusts,
    nLimitManoeuvre: nManLimit, nLimitManoeuvreNeg: nManNeg,
    scVtolFloorApplied: (p.nLimitManoeuvre ?? PROPOSED_N_LIMIT_MANOEUVRE) < SC_VTOL_N_LIMIT_FLOOR,
    manoeuvreBasis: "MOC SC-VTOL VTOL.2200(f) — floor 2.0, actual value set by "
      + "FCS capability, not a category table",
    worstGust,
    governingCase: gustGoverns
      ? `gust — ${worstGust.label}`
      : `symmetric manoeuvre ${nManLimit}g`,
    gustGoverns,
    nLimit, nUltimate,
    /* The one-sided gust does not raise root bending above the symmetric case;
       it sizes roll control and the wing attachment. Reported, not summed. */
    asymmetricNote: "MOC VTOL.2215(f): 100% vertical gust on one side — sizes "
      + "roll authority and wing/fuselage attachment, not root bending",
  };
}
