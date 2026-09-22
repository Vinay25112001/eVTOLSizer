/* =====================================================================
   MISSION BASIS
   =====================================================================
   WHY THIS EXISTS

   The tool sizes to NASA's UAM sizing mission — 2x2-min hover OGE, 20-min
   reserve, 10 kt headwind, 5,000 ft / ISA+20. That is the right basis for a
   design that has to certify, and it is fully sourced (see engine/loadcases.js
   and engine/atmosphere.js).

   It is NOT the basis manufacturers quote range against. We measured this
   rather than assuming it: the published pack/range pairs for Joby, Archer and
   VX4 imply 1.9-2.7x better energy intensity per km than NASA's fully
   documented NDARC design, and the mission-convention bracket in validate.mjs
   showed Joby's and Archer's published packs sit between our no-reserve and
   full-reserve numbers. Their figures correspond to roughly a HALF reserve on a
   sea-level standard day.

   So a single headline number is misleading whichever basis it uses. Quote the
   certification number and a design team calls the tool pessimistic; quote the
   marketing number and it cannot be certified against. Quoting BOTH is more
   credible than either, and it is the honest answer:

       "3,100 kg on the marketing basis, 4,050 kg on the certification basis"

   tells a design team exactly what it needs to know, and no manufacturer
   brochure does that.

   NOTHING HERE IS NEW PHYSICS. Every field is an existing parameter; this only
   names two coherent SETS of them so a user cannot accidentally mix a hot-and-
   high day with a zero-reserve marketing range and believe the result.
   ===================================================================== */

export const MISSION_BASES = {
  certification: {
    label: "Certification basis — NASA UAM sizing mission",
    sizingDay: "nasa-uam",       // 5,000 ft / ISA+20, all segments
    headwindMS: 5.144,           // 10 kt
    /* ── 30 s, FROM THE MISSION THIS BASIS IS NAMED AFTER ──────────────
       This read 120 s, citing Johnson & Silva section 5. That is their INITIAL
       AIR-TAXI mission ("2-min hover OGE for takeoff") — a DIFFERENT mission
       from the 75 nm UAM sizing mission this basis is named for.
       NASA/TM-20210017971 Table 1 gives the sizing mission's own segments:
       6,000 -> 6,050 ft vertical transitions at +/-100 ft/min with a Time row
       reading 15 / ... / 30 / 30 / 15 / 1200 s. So the vertical transitions
       are 30 s (50 ft at 100 ft/min is 30 s, self-consistent), the 15 s
       segments are ground time at 10% power, and the 1200 s is the 20-min
       reserve — which independently confirms the reserve convention below.
       The table is column-shredded in extraction, so 30 s is a careful READING
       rather than a quotation, and it is the reading validation/nasa-configs
       has ALREADY been using (it passes 30 explicitly). The app default was
       the only place still on 120 s.
       MEASURED, on Archer's own mission: 120 s gives MTOW +27% against the
       published 3,175 kg; 30 s gives -4%. Hover was costing 66 kWh out of a
       336 kWh pack — 46% of Archer's entire battery. */
    hoverTimeTakeoffS: 30,       // [SRC] TM-20210017971 Table 1 vertical transition
    hoverTimeLandingS: 30,
    reserveMinutes: 20,          // 14 CFR 91.151 VFR; Table 1's 1200 s segment agrees
    reservePctMission: 0.10,     // NASA: reserve is the LARGER of the two
    src: "NASA/TM-20210017971 Table 1 (75 nm UAM sizing mission segments); "
       + "MOC SC-VTOL for the day and gusts",
    note: "what the aircraft must actually be able to do",
  },
  marketing: {
    label: "Marketing basis — how brochure range figures are quoted",
    sizingDay: "sl-isa",         // sea level, ISA+0
    headwindMS: 0,
    hoverTimeTakeoffS: 30,
    hoverTimeLandingS: 30,
    reserveMinutes: 0,
    /* The 10%-of-mission floor is part of NASA's reserve RULE ("minimum of 10%
       of mission or 20-min flight"), so it is a certification criterion. Left
       at zero here or the marketing basis silently carries a 10% reserve it is
       not supposed to have. */
    reservePctMission: 0,
    src: "inferred from published pack/range pairs — see the mission-convention "
       + "bracket in validation/validate.mjs",
    note: "NOT a certification basis; use only to compare against brochure "
        + "numbers on equal terms",
  },
};

/**
 * Apply a named mission basis. Explicit user values always win, so a basis is
 * a starting point rather than a lock.
 */
export function applyMissionBasis(p) {
  const b = MISSION_BASES[p.missionBasis];
  if (!b) return p;
  const out = { ...p };
  for (const k of ["sizingDay", "headwindMS", "hoverTimeTakeoffS",
                   "hoverTimeLandingS", "reserveMinutes", "reservePctMission"]) {
    if (p[k] === undefined) out[k] = b[k];
  }
  return out;
}

/* =====================================================================
   REFERENCE MISSION BY CONFIGURATION
   =====================================================================
   A multicopter is not a lift+cruise with the wing removed, and it must not
   inherit a lift+cruise mission. Ours defaulted every configuration to 455 kg
   over 190 km — a winged-aircraft mission — which is why a multicopter had to
   be handed NASA's 400 Wh/kg pack before it would close at all. Real
   multicopters carry two people a very short distance.

   EVERY FIGURE BELOW IS PUBLISHED. Nothing is interpolated or rounded to look
   tidy, and where a source does not publish a quantity it is left null rather
   than guessed.

     EHang EH216-S     2 passengers, 220 kg payload, 35 km range, 100 km/h
                       cruise, 21 min flight time, 16 propellers.
                       evtol.news/ehang-216. The only certified passenger
                       multicopter, so the strongest available reference for
                       this configuration. MTOW, empty weight and battery
                       capacity are NOT published.
     NASA quadrotor    single passenger, 250 lb (113.4 kg) payload, 50 nm
       (1-pax)         (92.6 km) range, 6.5 ft rotor radius, electric.
                       Johnson & Silva 2018, concept vehicle 1.
     NASA quadrotor    six passengers, 1200 lb (544.3 kg), 75 nm (138.9 km).
       (6-pax)         TM-20210017971 Table 12, Quad-E column.
     NASA side-by-side six passengers, 1200 lb, 75 nm. Same table, SbS-E.
     winged            455 kg / 190 km — the project's own design point, which
                       is a Joby/Archer-class mission and belongs to winged
                       configurations only.

   NOTE THE SPREAD, because it is the point: a certified multicopter flies
   35 km with 220 kg; NASA's six-passenger quadrotor concept flies 139 km with
   544 kg and comes out at 2939 kg. Both are "multicopters". Which reference is
   right depends on what the user is designing, so these are OFFERED, never
   silently applied.
   ===================================================================== */
export const REFERENCE_MISSIONS = {
  multicopter: {
    label: "EHang EH216-S — 2 pax, 35 km",
    payload: 220, range: 35, vCruise: 100 / 3.6, nPropHover: 16,
    src: "evtol.news/ehang-216 — certified 2-passenger multicopter. MTOW, empty and battery capacity not published",
    /* NO ROTOR DIAMETER IS PUBLISHED for the EH216, so none is supplied — the
       aircraft keeps whatever diameter is already set. That is the honest
       behaviour, but it means this reference does NOT fully define a design
       the way the NASA ones do. Use multicopterNASA when you want a
       documentation-grade multicopter case. */
    note: "short-range urban hop, not an air-taxi mission. Rotor diameter is "
        + "NOT published — set it yourself; the default may be unrealistic",
  },
  multicopterNASA: {
    label: "NASA single-passenger quadrotor — 1 pax, 92.6 km",
    payload: 113.4, range: 92.6, vCruise: null, nPropHover: 4, propDiam: 2 * 6.5 / 3.28084,
    src: "Johnson & Silva 2018, concept vehicle 1: \"A single-passenger (250-lb payload), 50-nm range quadrotor with electric propulsion\"",
  },
  sideBySide: {
    label: "NASA side-by-side — 6 pax, 138.9 km",
    payload: 544.3, range: 138.9, vCruise: 98 * 0.514444, nPropHover: 2,
    /* GEOMETRY IS PART OF THE MISSION, and leaving it out made this reference
       unusable. Applying payload+range+nPropHover alone left rotor diameter at
       the winged default of 4.2 m — two 4.2 m rotors carrying six passengers,
       which DIVERGES (18,997 kg). A reference mission that cannot be flown is
       worse than none, because the failure looks like an engine defect.
       All four figures are from the same Table 12 SbS-E column. */
    propDiam: 2 * 14.9 / 3.28084,        // rotor radius 14.9 ft -> 9.08 m
    tipSpeed: 550 / 3.28084,             // 550 ft/s
    etaHov: 0.680,                       // published hover figure of merit
    src: "TM-20210017971 Table 12, SbS-E column (radius 14.9 ft, tip 550 ft/s, "
       + "FM 0.680, Vbr 98 kt); payload from Johnson & Silva 2018 (1200 lb, 6 pax)",
    note: "converges at ~2,250 kg against NASA's published 2,223 kg",
  },
  winged: {
    label: "Air-taxi mission — 455 kg, 190 km",
    payload: 455, range: 190, vCruise: 67,
    src: "this project's design point; Joby/Archer class",
    note: "applies to liftcruise, hybrid, hybridPusher and tiltrotor",
  },
};

/** Suggested reference mission for a configuration. Never auto-applied. */
export function referenceMissionFor(configType) {
  /* The NASA quadrotor, NOT the EHang, is offered for multicopter — because it
     is COMPLETE. EHang publishes no rotor diameter, so applying it leaves the
     diameter at whatever was there before, and the one-click button then
     produces a design that is geometrically impossible: 16 rotors of 4.2 m
     need a 10.8 m boom ring by non-overlap alone, which came out as booms at
     61% of MTOW. The NASA case publishes its diameter and lands at 5.0%.
     EHang stays in REFERENCE_MISSIONS for anyone who sets a diameter first. */
  if (configType === "multicopter") return REFERENCE_MISSIONS.multicopterNASA;
  if (configType === "sideBySide")  return REFERENCE_MISSIONS.sideBySide;
  return REFERENCE_MISSIONS.winged;
}
