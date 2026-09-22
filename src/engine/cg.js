/* =====================================================================
   LONGITUDINAL CG STATIONS AND THE STATIC-MARGIN CRITERION
   =====================================================================
   WHAT WAS WRONG

   The inherited CG calculation was:

     const xCGfus = fL*0.42;
     const Wfusc=Wempty*0.35, Wwingc=Wempty*0.18, Wmotc=Wempty*0.22,
           Wavc=Wempty*0.04,  Wothc=Wempty*0.21;
     xCGempty = (Wfusc*xCGfus + Wwingc*xCGwing + Wmotc*xCGfus
                 + Wavc*xCGavc + Wothc*xCGfus)/Wempty;

   Three separate defects:

   1. FUSELAGE, MOTORS AND "OTHER" — 78% of empty weight — were all placed at
      the SAME station, 0.42*fL. So xCGempty was 0.42*fL plus a small wing
      correction, essentially regardless of the aircraft. The CG could not
      respond to configuration.

   2. THE MOTORS WERE AT THE FUSELAGE CENTROID. On a distributed-propulsion
      eVTOL the motors sit on booms fore and aft of the airframe. Roskam and
      Torenbeek, via Scholz "Aircraft Design" ch.10 (HAW Hamburg), state the
      rule plainly:
        "The center of gravity of engines, nose and main landing gear occurs
         at the point where they are mounted on the aircraft."
      Not at a fuselage fraction. Motors, inverters, rotors and booms are now
      placed at the rotor stations.

   3. THE MASS SPLIT 35/18/22/4/21 WAS INVENTED and contradicted the engine's
      own weight buildup. componentWeights() already returns thirteen real
      Raymer component masses; the CG code ignored them and used made-up
      fractions. A THIRD breakdown (ewFracs) drove the displayed weight chart.
      Three mutually inconsistent mass sets in one engine. The CG now uses the
      actual buildup groups whenever the buildup model is active.

   WHAT IS SOURCED VS ASSUMED — every station is tagged:
     [SRC] traceable to a published rule
     [LAY] layout assumption, exposed as a parameter so it can be overridden

   Systems and equipment at 40-50% of fuselage length is [SRC] Scholz ch.10:
     "The center of gravity of the systems and equipment can be determined at
      40% to 50% of the length of the fuselage."
   Wing structural CG at 40% MAC is [SRC] Raymer ch.15.
   ===================================================================== */

/* Station of each mass group, as a fraction of fuselage length, unless the
   group is located geometrically (wing, tail, propulsion). */
export const CG_STATIONS = {
  fuselage:       { frac: 0.45, src: "SRC", note: "structure centroid, Roskam/Torenbeek band 0.40-0.50 fL" },
  gear:           { frac: 0.52, src: "LAY", note: "nose+main weighted; main gear sits just aft of the aft CG limit" },
  flightControls: { frac: 0.45, src: "SRC", note: "systems 40-50% fL (Scholz ch.10)" },
  electrical:     { frac: 0.45, src: "SRC", note: "systems 40-50% fL (Scholz ch.10)" },
  ecs:            { frac: 0.45, src: "SRC", note: "systems 40-50% fL (Scholz ch.10)" },
  avionics:       { frac: 0.15, src: "LAY", note: "forward instrument bay" },
  furnishings:    { frac: 0.40, src: "LAY", note: "cabin centroid, co-located with payload" },
  vtail:          { frac: 0.90, src: "LAY", note: "tail surface centroid; consistent with the 0.88 fL tail AC used for lv" },
};

/* Rotor longitudinal stations. The fore/aft SPAN is not a new invention: it is
   boomLengthFracFusLen = 0.70, the constant weights.js already uses to size
   boom mass. Using one constant for both boom mass and boom geometry removes a
   latent inconsistency rather than adding a free parameter. */
/* ── WHERE THE FORE/AFT ROTORS GO — DERIVED, NOT A FRACTION ───────────
   These were fixed fractions of fuselage length, 0.10 and 0.80, tagged
   [LAY]. Being fractions, they scaled with the body: growing the fuselage
   moved the rotors with it and NOTHING about the geometry changed. The aft
   disc overlapped the tail by 1.66 m before and after.

   The stations are now placed by what the rotors and the tail require:

     x_aft = x_tailLE - R          the aft disc just clears the tail
     x_fwd = x_aft - 1.05 D        the two discs do not overlap

   and the forward disc then leads the nose by 0.806 fL - 2.05 D, which is
   RAVEN's measured 0.0744 fL exactly when D sits at the derived limit of
   0.4293 fL. Three conditions, one placement, no free parameter.

   THIS FEEDS THE MASS MODEL, which is the point. booms.js sizes the boom
   bending moment on armFwd = |xWing - xRotFwd| and armAft = |xRotAft -
   xWing|, so a rotor that moves changes the structure that carries it and
   the loop converges on the aircraft that is actually drawn.

   The old fractions remain as the fallback for anything that cannot supply
   a rotor diameter. */
export const ROTOR_STATIONS = { fwd: 0.10, aft: 0.80 };   // fallback  [LAY]
export const ROTOR_FIT = { tailLEoverFL: 0.806, tipClear: 1.05 };

/** Fore/aft lift-rotor stations for a given rotor on a given body. */
export function rotorStationsFor(fL, D, tipClear = ROTOR_FIT.tipClear) {
  if (!(fL > 0 && D > 0)) return null;
  const R = D / 2;
  const xAft = ROTOR_FIT.tailLEoverFL * fL - R;
  const xFwd = xAft - tipClear * D;
  return { fwd: xFwd, aft: xAft,
           noseOverhangOverFL: (R - xFwd) / fL };
}

/**
 * Longitudinal CG from real component masses at real stations.
 *
 * @param p      parameter set
 * @param geom   { fL, MAC, wingLEfrac, MTOW, Wempty, Wbat }
 * @param groups componentWeights().groups, or null for the fraction model
 */
export function componentCG(p, geom, groups) {
  const { fL, MAC, wingLEfrac, MTOW, Wempty, Wbat } = geom;
  const S = CG_STATIONS;

  /* ONLY WHERE THE LAYOUT ACTUALLY HAS A FORE/AFT BOOM ARRAY. The placement
     is derived from a boom carrying one rotor ahead of the wing and one
     behind it, clearing a tail. A tiltrotor puts every rotor ON the wing and
     a multicopter has no tail at all, so the derivation says nothing about
     them — applying it anyway drove tiltrotor discs through the V-tail and a
     hybrid rotor through the wing, which the geometry gate caught. Those
     layouts keep the measured fractions. */
  /* ── DERIVED STATIONS ARE AVAILABLE BUT NOT YET THE DEFAULT ──────────
     rotorStationsFor() places the array from the rotor and the tail, and on
     the lift+cruise it works: the aft disc goes from overlapping the tail by
     1.66 m to CLEARING it by 0.091 m, and the rotor row drops from 1.34 m
     above the wing to 0.44 m.

     It is not switched on by default because it does not yet hold across the
     other layouts. Moving the forward station aft to make room at the tail
     walks it into the WING: on the six-rotor hybrid the forward disc lands at
     x 0.83-3.20 against a wing chord of 1.87-5.74, and the clearance logic
     lifts the hub above the wing without satisfying the collision check,
     which bounds a rotor by its full radius in every axis. That is a second
     problem needing its own measurement, not a patch on this one.

     Shipping the half that is verified and holding the half that is not is
     the honest split. Set p.rotorStationsDerived to opt in. */
  const capsCG = p.__caps ?? null;
  const foreAftArray = !!(p.hasBoomsResolved ?? capsCG?.hasBooms) && !!(capsCG?.hasWing)
                       && (capsCG?.nTail ?? 0) > 0;
  const derived = (p.rotorStationsDerived === true && foreAftArray)
    ? rotorStationsFor(fL, Number(p.propDiam) || 0, 1 + (p.rotorTipClearFrac ?? 0.05))
    : null;
  const xRotFwd = p.rotorFwdFrac != null ? fL * p.rotorFwdFrac
    : (derived ? derived.fwd : fL * ROTOR_STATIONS.fwd);
  const xRotAft = p.rotorAftFrac != null ? fL * p.rotorAftFrac
    : (derived ? derived.aft : fL * ROTOR_STATIONS.aft);
  /* Equal rotor count fore and aft, so the array geometric centroid is the
     midpoint. This is the station the propulsion group is mounted at. */
  const xRotCentroid = 0.5 * (xRotFwd + xRotAft);

  const xWing = fL * wingLEfrac + 0.40 * MAC;      // [SRC] Raymer ch.15
  const xBat  = fL * (p.batStationFrac ?? 0.38);   // [LAY]
  const xPay  = fL * (p.payStationFrac ?? 0.40);   // [LAY]

  /* Station for every buildup group. Propulsion goes to the rotor stations —
     this is the correction that matters most. */
  const stationOf = {
    wing:           xWing,
    fuselage:       fL * S.fuselage.frac,
    vtail:          fL * S.vtail.frac,
    gear:           fL * S.gear.frac,
    motors:         xRotCentroid,
    inverters:      xRotCentroid,
    rotors:         xRotCentroid,
    booms:          xRotCentroid,
    cruisePropulsion: fL * 0.92,   // pusher at the tail cone [LAY]
    flightControls: fL * S.flightControls.frac,
    electrical:     fL * S.electrical.frac,
    ecs:            fL * S.ecs.frac,
    avionics:       fL * S.avionics.frac,
    furnishings:    fL * S.furnishings.frac,
  };

  let xCGempty, itemised = null, basis;
  if (groups && Object.keys(groups).length) {
    /* Buildup model — use the masses that actually sized the aircraft. */
    let m = 0, mx = 0;
    itemised = [];
    for (const [k, w] of Object.entries(groups)) {
      const x = stationOf[k];
      if (x == null || !isFinite(w) || w <= 0) continue;
      m += w; mx += w * x;
      itemised.push({ group: k, mass: +w.toFixed(1), station: +x.toFixed(3),
                      moment: +(w * x).toFixed(1) });
    }
    xCGempty = m > 0 ? mx / m : fL * 0.45;
    /* The buildup total can differ slightly from the Wempty the loop converged
       on (guard clamp). Nothing is rescaled — the CG is a mass-weighted mean,
       so it is insensitive to a uniform scale factor on all groups. */
    basis = "component buildup";
  } else {
    /* Fraction model — no component masses exist. Fall back to a documented
       split, but one consistent with the buildup group proportions rather than
       the old invented 35/18/22/4/21. */
    const F = { fuselage: 0.28, wing: 0.18, propulsion: 0.22, gear: 0.04,
                systems: 0.15, avionics: 0.04, furnishings: 0.05, vtail: 0.04 };
    const denom = Object.values(F).reduce((a, b) => a + b, 0);
    xCGempty = (
      F.fuselage    * fL * S.fuselage.frac +
      F.wing        * xWing +
      F.propulsion  * xRotCentroid +
      F.gear        * fL * S.gear.frac +
      F.systems     * fL * S.electrical.frac +
      F.avionics    * fL * S.avionics.frac +
      F.furnishings * fL * S.furnishings.frac +
      F.vtail       * fL * S.vtail.frac
    ) / denom;
    basis = "fraction model";
  }

  const xCGtotal = (Wempty * xCGempty + Wbat * xBat + p.payload * xPay) / MTOW;

  /* ── HOVER TRIM ────────────────────────────────────────────────────────
     A two-station rotor array can only hover in trim if its thrust centroid
     is at the CG. Moment balance about the CG:
         T_fwd*(xCG - x_fwd) = T_aft*(x_aft - xCG)
     so the forward pair must carry
         T_fwd/T_total = (x_aft - xCG)/(x_aft - x_fwd)
     A CG away from the array midpoint forces a thrust split, and the loaded
     pair needs proportionally more installed thrust. The old code hid this
     entirely by placing the motors at the CG by construction. */
  const span = xRotAft - xRotFwd;
  const fwdShare = span > 1e-6 ? (xRotAft - xCGtotal) / span : 0.5;
  const loadedShare = Math.max(fwdShare, 1 - fwdShare);
  /* Per-rotor thrust on the loaded side, relative to an even split. */
  const loadedRotorRatio = 2 * loadedShare;

  return {
    xCGempty, xCGtotal, xRotFwd, xRotAft, xRotCentroid,
    xWing, xBat, xPay, stationOf, itemised, basis,
    hoverFwdThrustShare: fwdShare,
    hoverLoadedRotorRatio: loadedRotorRatio,
    cgWithinRotorArray: xCGtotal > xRotFwd && xCGtotal < xRotAft,
  };
}

/* =====================================================================
   THE STATIC-MARGIN CRITERION
   =====================================================================
   The app checked "SM 5-25% MAC" for every aircraft. That band comes from
   unaugmented certification practice, and it is the WRONG criterion for a
   fly-by-wire eVTOL.

   EASA MOC SC-VTOL Issue 2 (12 May 2021) is explicit that the VTOL method
   deliberately departs from the static-stability route, in MOC VTOL.2135:

     "This method is different from CS-23 and CS-27, since in those
      certification specifications, the HQ of an aircraft are suitably assessed
      on the addition of the compliance to static or dynamic stability
      requirements along with other requirements for controllability and
      average piloting skills."

   The accepted means of compliance is instead the Modified Handling Qualities
   Rating Method (MHQRM), an accepted MoC for VTOL.2135 that "can also be used
   to assess compliance, fully or in part, with ... VTOL.2145 Flying
   qualities". It assigns a minimum Handling Qualities Rating (Satisfactory /
   Adequate / Controllable) per flight condition, derived from ADS-33E Mission
   Task Elements and weighted by failure-condition probability from the FHA.

   The phrase "static stability" does not appear anywhere in that document as a
   requirement.

   NASA practice for these aircraft matches. Johnson and Silva, The
   Aeronautical Journal 126(1295), 2022, section 6.7: bare-airframe models from
   SIMPLI-FLYD, control laws synthesised in CONDUIT against disturbance
   rejection bandwidth, robust stability margin, eigenvalue damping and
   crossover frequency, to "Level 1 handling qualities specifications". Static
   margin is not among the criteria.

   SO WHAT SHOULD A SIZING TOOL REPORT?

   Static margin remains a real and useful BARE-AIRFRAME property: it drives
   trim drag, tail load, and how much authority the FCS must supply. It is just
   not a pass/fail certification gate for an augmented aircraft. The criterion
   is therefore made augmentation-dependent, and the tool states plainly that
   for the augmented cases the binding requirement is a handling-qualities
   analysis this class of tool cannot perform.
   ===================================================================== */
export const STABILITY_AUGMENTATION = {
  none: {
    label: "Unaugmented",
    smMin: 0.05, smMax: 0.25, advisory: false,
    basis: "CS-23/CS-27 heritage: the airframe itself must be statically stable.",
  },
  sas: {
    label: "Stability augmentation (SAS, limited authority)",
    smMin: 0.00, smMax: 0.25, advisory: false,
    basis: "Limited-authority augmentation: the bare airframe must not be divergent, "
         + "because reversion to direct law has to remain flyable.",
  },
  fbw: {
    label: "Full-authority fly-by-wire",
    smMin: -0.10, smMax: 0.25, advisory: true,
    basis: "SC-VTOL compliance is by MHQRM (ADS-33E handling qualities ratings), "
         + "not static stability — MOC SC-VTOL Issue 2, MOC VTOL.2135. Relaxed or "
         + "negative bare-airframe static margin is normal for full-authority FBW. "
         + "The -10% floor is engineering guidance, NOT a regulatory limit.",
  },
};

export function staticMarginCriterion(p) {
  const key = STABILITY_AUGMENTATION[p.stabAugmentation] ? p.stabAugmentation : "fbw";
  const c = STABILITY_AUGMENTATION[key];
  return {
    key, ...c,
    /* What actually governs, so the UI never implies the SM check is the
       certification gate when it is not. */
    governingCriterion: c.advisory
      ? "Handling qualities (MHQRM / ADS-33E HQR) — requires flight-dynamics analysis outside conceptual sizing"
      : "Static longitudinal stability",
  };
}
