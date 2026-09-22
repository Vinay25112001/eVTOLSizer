/* =====================================================================
   MULTI-SEGMENT MISSION PROFILE
   =====================================================================
   The mission is currently a FIXED segment set (takeoff hover, climb, cruise,
   descent, landing hover, reserve) with a hops multiplier. A user cannot say
   "climb to 3,000 ft, cruise 40 km, hold 5 minutes, divert 20 km, land".

   -- WHAT THIS DOES, AND THE LINE IT DOES NOT CROSS -----------------------
   It evaluates an ARBITRARY PROFILE AGAINST AN ALREADY-SIZED AIRCRAFT. It does
   NOT resize. That is a deliberate limit, not an unfinished edge:

     - The sizing loop closes weight against the DESIGN mission. Feeding it a
       different profile changes the aircraft, and then the profile is being
       flown by a vehicle that no longer matches the one on screen.
     - The question a mission editor is actually asked is "CAN THIS AIRCRAFT
       FLY THAT?" - a range and endurance question about a FIXED design, which
       is exactly what this answers.

   So the golden master is untouched: no sized result changes, and the returned
   object says plainly whether the profile fits inside the usable pack. To size
   FOR a profile, change the design mission and re-run the loop.

   -- WHERE THE POWERS COME FROM ------------------------------------------
   Every segment power is taken from the CONVERGED RESULT (Phov, Pcl, Pcr,
   Pres), never recomputed here. A second implementation of hover power in a
   second file is how two numbers in one tool start disagreeing, and this
   codebase has already been bitten by exactly that duplication - solidity was
   hardcoded 0.10 in two separate places. The only thing this module decides is
   HOW LONG each power is applied for.

   Segment powers, all in kW at the DC bus, as the loop computed them:
     hover    Phov   OGE hover at MTOW, with download and figure of merit
     climb    Pcl    at the design rate of climb
     cruise   Pcr    at design cruise speed and altitude
     loiter   Pres   best-endurance power, the same one the reserve uses
     descent  Pdc    normally zero or negative, and FLOORED AT ZERO below:
                     this engine does not model regeneration, and crediting
                     energy back would be inventing a capability it lacks.
     ground   0.10 x Phov  [SRC] NASA/TM-20210017971 Table 1 ground segments
                           are flown at 10% power.
   ===================================================================== */

/** Segment kinds and how each takes its power from a converged result. */
export const SEGMENT_KINDS = {
  hover:   { label: "Hover",         power: (r) => r.Phov, basis: "Phov - OGE hover at MTOW" },
  climb:   { label: "Climb",         power: (r) => r.Pcl,  basis: "Pcl  - at design rate of climb" },
  cruise:  { label: "Cruise",        power: (r) => r.Pcr,  basis: "Pcr  - design speed and altitude" },
  loiter:  { label: "Loiter / hold", power: (r) => r.Pres, basis: "Pres - best-endurance power" },
  divert:  { label: "Divert",        power: (r) => r.Pcr,  basis: "Pcr  - flown as cruise" },
  descent: { label: "Descent",       power: (r) => Math.max(0, r.Pdc ?? 0),
             basis: "max(0, Pdc) - no regeneration credit is taken" },
  ground:  { label: "Ground",        power: (r) => 0.10 * r.Phov,
             basis: "10% of Phov [SRC] TM-20210017971 Table 1 ground segments" },
};

/** Segments that may be given a DISTANCE instead of a duration. */
const DISTANCE_KINDS = new Set(["cruise", "divert"]);

/* -- OFF-DESIGN CRUISE SPEED ----------------------------------------------
   A mission editor is useless if every cruise leg has to be flown at the
   design speed, but Pcr is only valid AT that speed. So a segment carrying its
   own speed gets its power from the CONVERGED DRAG POLAR:

       P(V) = V * [ q S CD0 + W^2 / (q S pi AR e) ] / eta

   using the aircraft the loop actually produced - its CD0tot, its wing area,
   its weight. This is NOT a second physics model in the sense the header warns
   about: it is the same polar evaluated at a different speed, and it is
   VERIFIED rather than trusted. At the design speed it must return Pcr, and
   validation/analysis-layers.mjs gates exactly that. Measured on the app
   default: 242.2 kW from the polar against Pcr 242.2 kW, -0.03%.

   Off-design is only offered for WINGED cruise. A rotor-borne aircraft has no
   polar of this form, so it keeps Pcr and the segment reports that its speed
   was ignored rather than silently returning a wrong number. */
export function cruisePowerAt(r, V, opts = {}) {
  const S   = r.Swing, W = (r.MTOW ?? 0) * 9.80665;
  const rho = opts.rho ?? null, AR = opts.AR ?? null, e = opts.eOsw ?? null;
  const eta = opts.etaSys ?? null, CD0 = r.CD0tot;
  if (!(S > 0 && W > 0 && rho > 0 && AR > 0 && e > 0 && eta > 0 && CD0 > 0 && V > 0))
    return null;
  const q = 0.5 * rho * V * V;
  const D = q * S * CD0 + W * W / (q * S * Math.PI * AR * e);
  return D * V / (eta * 1000);
}

/**
 * Evaluate a profile against a converged sizing result.
 *
 * @param r        the object returned by runSizing
 * @param segments [{kind, seconds?, distanceKm?, speedMS?, label?}]
 * @param opts     {reserveFraction} - fraction of the USABLE pack held back and
 *                 not offered to the profile. DEFAULTS TO 0, and deliberately:
 *                 the profile is expected to carry its own reserve segment,
 *                 because burying a hidden reserve inside a user-built mission
 *                 is how a profile silently stops meaning what it says.
 */
export function evaluateProfile(r, segments, opts = {}) {
  const reserveFraction = opts.reserveFraction ?? 0;
  if (!r || !isFinite(r.PackUsablekWh))
    return { error: "needs a converged sizing result carrying PackUsablekWh" };
  if (!Array.isArray(segments) || !segments.length)
    return { error: "needs at least one segment" };

  const vCruise = opts.vCruise ?? r.vCruise ?? null;
  const rows = [];
  let cum = 0, cumTime = 0, cumDist = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const kind = SEGMENT_KINDS[s.kind];
    if (!kind) { rows.push({ index: i, kind: s.kind, error: "unknown segment kind" }); continue; }

    /* Off-design speed on a cruise-type segment re-evaluates the polar; every
       other kind keeps the loop's own power. */
    let P = kind.power(r), offDesign = false, speedIgnored = false;
    if (DISTANCE_KINDS.has(s.kind) && s.speedMS != null && vCruise != null
        && Math.abs(s.speedMS - vCruise) > 1e-9) {
      const alt = cruisePowerAt(r, s.speedMS, opts.polar ?? {});
      if (alt != null && isFinite(alt) && alt > 0) { P = alt; offDesign = true; }
      else speedIgnored = true;      // no polar available - say so, do not fake it
    }
    /* Duration: explicit seconds win; otherwise distance over speed, for the
       distance-capable kinds only. A distance on a HOVER segment is meaningless
       and is reported as an error rather than quietly treated as zero. */
    let seconds = s.seconds ?? null, distanceKm = s.distanceKm ?? null;
    let groundSpeedMS = null;
    const speed = s.speedMS ?? vCruise;
    if (seconds == null && distanceKm != null) {
      if (!DISTANCE_KINDS.has(s.kind)) {
        rows.push({ index: i, kind: s.kind,
          error: "a distance is meaningless for a " + s.kind + " segment - give seconds" });
        continue;
      }
      if (!(speed > 0)) {
        rows.push({ index: i, kind: s.kind, error: "no speed available to convert distance" });
        continue;
      }
      /* HEADWIND CHANGES GROUND SPEED, NOT POWER. The aeroplane still flies at
         its airspeed and still needs the power that airspeed costs; the wind
         only means the ground goes by more slowly, so the leg takes longer and
         therefore burns more energy. A negative value is a tailwind and is
         allowed. Ground speed is floored just above zero so a headwind at or
         beyond the airspeed reports as an error rather than dividing by zero
         or, worse, returning a negative time. */
      const gs = speed - (s.headwindMS ?? 0);
      if (!(gs > 0.1)) {
        rows.push({ index: i, kind: s.kind,
          error: "headwind " + (s.headwindMS ?? 0) + " m/s is at or above the "
               + "airspeed " + speed + " m/s - the aircraft makes no progress" });
        continue;
      }
      groundSpeedMS = gs;
      seconds = distanceKm * 1000 / gs;
    }
    if (seconds == null || !(seconds >= 0)) {
      rows.push({ index: i, kind: s.kind, error: "needs seconds or distanceKm" });
      continue;
    }
    if (distanceKm == null && DISTANCE_KINDS.has(s.kind) && speed > 0) {
      groundSpeedMS = speed - (s.headwindMS ?? 0);
      distanceKm = Math.max(0, groundSpeedMS) * seconds / 1000;
    }

    const kWh = P * seconds / 3600;
    cum += kWh; cumTime += seconds; cumDist += distanceKm ?? 0;
    rows.push({
      index: i, kind: s.kind, label: s.label ?? kind.label,
      powerKW: P, offDesign, speedIgnored,
      basis: offDesign ? "converged drag polar at " + s.speedMS.toFixed(1) + " m/s"
           : speedIgnored ? kind.basis + " - SPEED IGNORED, no polar data supplied"
           : kind.basis,
      seconds, minutes: seconds / 60, distanceKm,
      airspeedMS: DISTANCE_KINDS.has(s.kind) ? speed : null,
      groundSpeedMS, headwindMS: s.headwindMS ?? 0,
      energyKWh: kWh, cumulativeKWh: cum,
    });
  }

  const usable    = r.PackUsablekWh;
  const available = usable * (1 - reserveFraction);
  const total     = cum;
  const errors    = rows.filter((x) => x.error);

  /* WHERE the pack runs out, if it does - reported as a segment and a time.
     "It does not make it" is far less useful to a designer than "it runs dry
     14 minutes in, a third of the way through the divert". */
  let ranDryAt = null;
  if (total > available) {
    let acc = 0;
    for (const x of rows) {
      if (x.error) continue;
      if (acc + x.energyKWh > available) {
        const frac = x.energyKWh > 0 ? (available - acc) / x.energyKWh : 0;
        ranDryAt = {
          index: x.index, kind: x.kind, label: x.label,
          fractionThroughSegment: frac,
          atSeconds: rows.filter((y) => y.index < x.index)
                         .reduce((s2, y) => s2 + (y.seconds ?? 0), 0) + frac * x.seconds,
        };
        break;
      }
      acc += x.energyKWh;
    }
  }

  return {
    segments: rows,
    totalEnergyKWh: total, totalSeconds: cumTime, totalMinutes: cumTime / 60,
    totalDistanceKm: cumDist,
    packUsableKWh: usable, availableKWh: available, reserveFraction,
    marginKWh: available - total,
    marginPct: available > 0 ? 100 * (available - total) / available : null,
    feasible: errors.length === 0 && total <= available,
    ranDryAt, errors,
    note:
      "This flies the ALREADY-SIZED aircraft through the profile - it does NOT "
      + "resize. Segment powers are read from the converged result and never "
      + "recomputed, so this cannot disagree with the sizing loop. Descent takes "
      + "no regeneration credit. To size FOR a profile, change the design "
      + "mission and re-run the loop.",
  };
}

/** The engine's own fixed mission, expressed as a profile - so the editor opens
    on the mission the tool already flies and a user edits from a known-good
    starting point rather than a blank page. */
export function defaultProfile(r, p) {          // eslint-disable-line no-unused-vars
  /* EVERY duration is RECOVERED from the loop as E/P. Nothing here is assumed,
     and that is what makes this a self-consistency check rather than a
     decorative default: summed, these segments must reproduce Etot exactly.

     A FIRST VERSION GAVE THE CRUISE SEGMENT distanceKm = p.range AND CAME OUT
     12% HIGH. The mistake is worth keeping written down, because it is a
     mission-accounting error and not a coding one: THE CRUISE LEG IS NOT THE
     RANGE. Climb and descent cover ground distance too, so at the app default
     the loop cruises 79 km of a 100 km trip and the other 21 km are flown
     during climb and descent. Sizing a cruise segment on the full range
     double-counts that distance and charges cruise power for it. */
  const seg = (P, E) => (P > 0 && E > 0 ? 3600 * E / P : 0);
  return [
    { kind: "hover",   seconds: seg(r?.Phov, r?.Eto), label: "Takeoff hover" },
    { kind: "climb",   seconds: seg(r?.Pcl,  r?.Ecl) },
    { kind: "cruise",  seconds: seg(r?.Pcr,  r?.Ecr) },
    { kind: "descent", seconds: seg(Math.max(0, r?.Pdc ?? 0), r?.Edc) },
    { kind: "hover",   seconds: seg(r?.Phov, r?.Eld), label: "Landing hover" },
    { kind: "loiter",  seconds: seg(r?.Pres, r?.Eres), label: "Reserve" },
  ];
}
