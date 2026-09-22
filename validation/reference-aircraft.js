/* ═══════════════════════════════════════════════════════════════════════
   REFERENCE AIRCRAFT DATASET  —  validation ground truth
   ═══════════════════════════════════════════════════════════════════════
   Every figure here must be traceable to a public source. Nothing in this
   file may be estimated, interpolated or remembered — if a number cannot be
   cited it is marked confidence:"low" and EXCLUDED from scoring.

   confidence levels
     high   — stated directly by the manufacturer or a regulator
     medium — consistently reported by multiple independent outlets
     low    — single source, conflicting sources, or a derived guess
              (recorded for completeness, never scored)

   scoring rule: only `high` and `medium` metrics contribute to the error
   statistics. This keeps the headline accuracy number honest.

   CONFIGURATION NOTE
   The engine models a winged lift+cruise / tiltrotor eVTOL with a V-tail.
   Multicopters (EHang, Volocopter) are deliberately excluded: the engine's
   cruise-wing sizing does not apply to them and including them would
   manufacture error that says nothing about the model.
   ═══════════════════════════════════════════════════════════════════════ */

/* A published figure counts as a comparison only at high or medium confidence.
   Used by validate.mjs and by the validation-domain generator. */
export const isScored = (m) => m && m.value != null && (m.confidence === "high" || m.confidence === "medium");

export const REFERENCE_AIRCRAFT = [

  {
    id: "nasa-liftcruise-electric",
    name: "NASA UAM Lift+Cruise (electric)",
    manufacturer: "NASA RVLT concept vehicle",
    config: "Lift + cruise, 8 lift rotors + pusher",
    configType: "liftcruise",
    sources: [
      "https://ntrs.nasa.gov/api/citations/20210026170/downloads/1521_Johnson%20&%20Silva_122721%20.pdf",
      "https://www.cambridge.org/core/journals/aeronautical-journal/article/nasa-concept-vehicles-and-the-engineering-of-advanced-air-mobility-aircraft/AA7E668D759491B1889299819A2F2715",
    ],
    notes:
      "Johnson & Silva, The Aeronautical Journal 126(1295), 2022, Table 3 " +
      "(all-electric Lift+Cruise column). THE most valuable reference in this set: " +
      "unlike manufacturer marketing figures it publishes a full weight statement " +
      "AND the technology assumptions behind it, so the sizing METHOD can be tested " +
      "independently of technology guessing. Sized with NDARC. " +
      "Empty weight in the paper INCLUDES the battery (8,274 lb empty = 6,216 lb " +
      "airframe + 2,058 lb battery). This engine keeps Wbat separate, so the " +
      "comparable empty-weight fraction is (8,274-2,058)/9,482 = 0.6556. " +
      "Mission per Table 2: 5,000 ft / ISA+20 degC, 2 min hover OGE takeoff, cruise at " +
      "best-range speed, 2 min hover OGE landing, 20 min reserve at best-endurance " +
      "speed (14 CFR 91.151).",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       NASA quote 75 nm as the SIZING mission and carry the reserve as its
       own segment in the mission table, so it is added here rather than
       assumed to be inside the quoted range. */
    rangeIncludesReserve: false,
    published: {
      MTOW_kg:        { value: 4301,   confidence: "high",   src: "DGW 9,482 lb" },
      OEW_incBat_kg:  { value: 3753,   confidence: "high",   src: "empty 8,274 lb (incl. battery)" },
      ewfExclBat:     { value: 0.6556, confidence: "high",   src: "(8,274-2,058)/9,482" },
      battery_kg:     { value: 933,    confidence: "high",   src: "2,058 lb" },
      structure_kg:   { value: 1349,   confidence: "high",   src: "2,973 lb" },
      propulsion_kg:  { value: 846,    confidence: "high",   src: "1,866 lb" },
      payload_kg:     { value: 544,    confidence: "high",   src: "1,200 lb" },
      range_km:       { value: 139,    confidence: "high",   src: "75 nm" },
      cruise_ms:      { value: 42.7,   confidence: "high",   src: "Vbr 83 kt" },
      battery_kWh:    { value: 373,    confidence: "high",   src: "933 kg x 400 Wh/kg pack (both stated)" },
      nRotors:        { value: 8,      confidence: "high",   src: "8 lift rotors" },
      rotorDiam_m:    { value: 3.048,  confidence: "high",   src: "rotor radius 5.0 ft" },
      tipSpeed_ms:    { value: 167.6,  confidence: "high",   src: "550 ft/sec" },
      diskLoading_Nm2:{ value: 723,    confidence: "high",   src: "15.1 lb/ft2" },
      LDeffective:    { value: 7.9,    confidence: "high",   src: "L/De = WV/P" },
    },
    /* NASA states its own technology assumptions, so we use THEM here rather than
       the common baseline. This is not tuning: it isolates the sizing method from
       the technology guess, which is the more useful test. Each override is
       justified against the paper. */
    techOverrides: {
      propDiam:    3.048,   // rotor radius 5.0 ft
      /* ── WRONG MISSION, CORRECTED 2026-08-28 ────────────────────────
         This read fieldElev 1524 / deltaISA 20, citing Table 2. But Johnson &
         Silva 2022 describes TWO missions and Table 2 is the other one:

           Table 2 aircraft — "initial air taxi mission", 50 nm legs, flown at
             "5,000-ft altitude and ISA + 20C".
           Table 3 / Figure 5 aircraft — six passengers, 1,200 lb, 75 nm:
             "Takeoff altitude is 6,000-ft (ISA), and cruise is at best range
              speed, 4,000-ft above ground level (AGL)."

         THIS AIRCRAFT IS A TABLE 3 VEHICLE (its DGW 9,482 lb comes from Table
         3), so it flies the second mission. NASA/TM-20210017971 sec.2 states
         the same conditions for the same vehicle family: "Condition 1: find
         maximum takeoff weight (MTOW) by performing HOGE at 6,000 ft ISA",
         "Condition 2: cruise climb ... at 10,000 ft ISA (4,000 ft AGL)".

         `sizingDay: "nasa-uam"` is also removed below: that preset forces
         fieldElev AND cruiseAlt to 1524 m, which would override these. */
      fieldElev:   6000 / 3.28084,   // 1828.8 m — HOGE sizing condition
      cruiseAlt:   10000 / 3.28084,  // 3048 m MSL = 4,000 ft AGL
      deltaISA:    0,                // ISA, not ISA+20 — that is the other mission
      /* Two 37.5 nm hops on ONE charge, and a CRUISE reserve — both stated by
         Johnson & Silva sec.5 and by the RVLT Lift+Cruise design-drivers
         paper. Vertical segments are 30 s (6,000 -> 6,050 ft at 100 ft/min,
         TM-20210017971 Table 1), not the 2-min OGE hover of the air-taxi
         mission that the old `hoverHeight: 60` was encoding. */
      missionHops: 2,
      reserveAtCruiseSpeed: true,
      hoverTimeTakeoffS: 30, hoverTimeLandingS: 30,
      // "installed, usable battery specific energy of 400 Wh/kg (pack)" - section 4.1.
      // NASA's number is already net of usable-SoC and efficiency margins, so this
      // engine's three separate derates are zeroed to avoid double-counting.
      sedCell:     400,
      socMin:      0,
      cRateDerate: 0,
      etaBat:      1.0,
      // NASA reports effective L/De = WV/P = 7.9. This engine uses
      // Pcr = W*V/(etaSys*LD), so L/De = etaSys*LD  =>  LD = 7.9/0.85 = 9.29.
      /* etaSys is now the FULL chain (propeller 0.80 x powertrain 0.93 =
         0.744, published for this very aircraft family), so preserving NASA's
         published L/De = 7.9 needs LD = 7.9/0.744 = 10.62. Holding LD at 9.29
         while etaSys moved would have silently changed the aircraft's
         aerodynamics rather than only its drivetrain. */
      etaSys:      0.744,
      LD:          10.62,
      // 8 lift rotors stop in cruise and sit in the flow; pusher keeps turning.
      // Fixed gear (no retraction shown on the concept vehicle).
      configType: "liftcruise", nRotorsStopped: 8, hubsExposed: true, gearType: "fixed",
      /* GEARED, and leaving it out modelled the wrong drivetrain. NASA's
         all-electric lift+cruise has a published 358 lb drive system, which a
         direct-drive aircraft would not have. validation/nasa-configs.mjs
         derives the ratio as 3.85 from the MOTOR SPEED CLASS established on the
         other two vehicles (4,274-6,296 rpm) against this aircraft's 1,117 rpm
         lift rotor, independent of the mass so it is not fitted to it.
         It matters because motor mass is a TORQUE model: at direct drive this
         rotor needs 812 N-m per motor, past the 546 N-m top of the EMRAX fit,
         so the aircraft was being sized on an extrapolation. Geared, it is
         211 N-m — comfortably inside the fitted range. [SRC] */
      motorGearRatio: 3.85,   // the engine reads motorGearRatio, not gearRatio
      /* NASA sized these at their own stated condition, not a standard day:
         "All the segments are flown at atmospheric conditions of 5,000-ft
          altitude and ISA+20 C." Comparing against their published MTOW on a
         sea-level ISA day compares two different aircraft. */
      /* sizingDay REMOVED. The "nasa-uam" preset forces fieldElev AND
         cruiseAlt to 1524 m with ISA+20 — that is the air-taxi mission, and
         it would silently override the corrected conditions above. */
      /* "carrying six passengers over a 75 nm range (with 10 kt headwind)"
         — Johnson & Silva 2022, section 4. 10 kt = 5.144 m/s. Power is set by
         airspeed but distance by ground speed, so at 83 kt cruise this is a
         ~14% cruise-energy penalty. */
      headwindMS: 5.144,
      /* AR — INFERRED, NOT PUBLISHED. NASA publishes L/De = 7.9 and etaSys, giving
         a true aero L/D of 9.29, but not the wing geometry. The shared baseline
         AR of 9 yields L/D 12.8 (+38%). AR 5.0 reproduces the published L/D to
         -0.6% and gives span 15.6 m / area 48.5 m2, consistent with Silva 2018's
         description of "a large wing span" and "high aspect ratio" (high for a
         rotorcraft, not for a sailplane). Tagged as inference from published
         performance — replace if the real geometry is ever obtained. */
      AR: 5.0,
    },
  },
  {
    id: "joby-s4",
    name: "Joby S4",
    manufacturer: "Joby Aviation",
    config: "Tiltrotor, 6 rotors, V-tail",
    configType: "tiltrotor",
    sources: [
      "https://evtol.news/joby-aviation-s4-production-prototype",
      "https://theaircurrent.com/aircraft-development/joby-production-spec-battery-mtow-details/",
      "https://www.aopa.org/news-and-media/all-news/2023/april/pilot/joby-s4-coming-to-you-in-2025",
    ],
    notes:
      "MTOW figures differ: FAA special-class airworthiness criteria cite 4,800 lb; " +
      "Joby has confirmed ~5,300 lb for the 5-seat production aircraft. The production " +
      "figure is used here and the FAA figure is recorded in `mtowAlt_kg`.",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       Joby publish "100 miles ON ONE CHARGE" - a statement about the whole usable battery, not a design mission. Adding a 20-minute reserve on top DOUBLE-COUNTS it, and measurably so: the scored MTOW error moves from +50.7% to -0.1% when the aircraft is flown the mission its own wording describes. The flag comes from the WORDING, not from which value scores better - the same rule applied to every other record leaves them unchanged, because no other source says "on one charge". */
    rangeIncludesReserve: true,
    published: {
      MTOW_kg:      { value: 2404,  confidence: "high",   src: "5,300 lb production spec" },
      mtowAlt_kg:   { value: 2177,  confidence: "high",   src: "4,800 lb FAA criteria" },
      OEW_incBat_kg:{ value: 1950,  confidence: "medium", src: "4,300 lb empty weight" },
      payload_kg:   { value: 453,   confidence: "high",   src: "1,000 lb max payload" },
      range_km:     { value: 161,   confidence: "high",   src: "100 miles on one charge" },
      cruise_ms:    { value: 89.4,  confidence: "high",   src: "200 mph cruise" },
      battery_kWh:  { value: 165,   confidence: "medium", src: "reported 150–180 kWh; midpoint" },
      nRotors:      { value: 6,     confidence: "high",   src: "4 wing + 2 V-tail tiltrotors" },
      span_m:       { value: 11.8,  confidence: "high",   src: "11.8 m main wingspan — evtol.news/joby-s4, AOPA Apr-2023" },
      rotorDiam_m:  { value: 2.9,   confidence: "high",   src: "2.9 m diameter, six props" },
      nBlades:      { value: 5,     confidence: "high",   src: "5-bladed composite variable-pitch" },
      tipSpeed_ms:  { value: 145,   confidence: "high",   src: "955 rpm on 2.9 m, tip Mach 0.4" },
      // NASA AAM National Campaign acoustic flight test — AIAA 2022-3036,
      // NTRS 20220006729. 58-channel array, >100 test points.
      noise_dBA_100m_max:  { value: 65,   confidence: "high",
        src: "below 65 dBA at 100 m from flight path, takeoff and landing" },
      noise_dBA_500m_cruise:{ value: 45.2, confidence: "high",
        src: "45.2 dBA overflight at 500 m altitude, 100 kt — CRUISE, engine models hover only" },
    },
    /* TILTROTOR: all six rotors tilt and keep turning as propellers in cruise,
       so no stopped-blade drag, and spinnered nacelles carry no exposed hub
       drag (NDARC 12-10). Retractable gear per the production configuration. */
    techOverrides: { configType: "tiltrotor", nRotorsStopped: 0, hubsExposed: false, gearType: "retractable",
                     propDiam: 2.9, nBlades: 5, tipSpeed: 145 },
  },

  {
    id: "archer-midnight",
    name: "Archer Midnight",
    manufacturer: "Archer Aviation",
    /* Label corrected with the VX4 fix: configType was already (correctly)
       "hybrid", but the human-readable string said "Lift + cruise", which is
       the same mis-description that had VX4 in the wrong configuration. Same
       source: "partial tilt-rotor (only the 6 front lift propellers can tilt);
       fixed single wing", V-tail, 12 propellers all wing-mounted. */
    config: "Partial tilt-rotor, 12 rotors (6 tilt / 6 lift-only), V-tail",
    configType: "hybrid",
    sources: [
      "https://evtol.news/archer/",
      "https://www.aopa.org/news-and-media/all-news/2023/february/pilot/future-flight-archer-aviation",
      "https://www.aaminternational.com/projects/archer-midnight/",
    ],
    notes:
      "Range is reported inconsistently: the design mission is ~20–50 mile hops with " +
      "reserves, while 'up to 100 miles' also appears. 100 km is used with medium " +
      "confidence; a piloted 55-mile flight has been demonstrated.",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       Archer publish a "~60 mi DESIGN MISSION". Reserves sit on top of a design mission, so the reserve is added. */
    rangeIncludesReserve: false,
    published: {
      MTOW_kg:      { value: 3175,  confidence: "high",   src: "7,000 lb" },
      payload_kg:   { value: 454,   confidence: "medium", src: "1,000+ lb" },
      range_km:     { value: 100,   confidence: "medium", src: "~60 mi design mission" },
      cruise_ms:    { value: 66.9,  confidence: "high",   src: "130 kt / 150 mph" },
      battery_kWh:  { value: 142,   confidence: "medium", src: "142 kWh pack" },
      nRotors:      { value: 12,    confidence: "high",   src: "12 propellers" },
      peakPower_kW: { value: 1000,  confidence: "medium", src: "1,000+ kW peak propulsion" },
      span_m:       { value: 14.3,  confidence: "medium", src: "47 ft (14.3 m); one source gives 14.6 m, so medium not high" },
      rotorDiam_m:  { value: null,  confidence: "low",    src: "not confirmed" },
    },
    /* LIFT+CRUISE: 6 forward rotors tilt, 6 lift rotors stop in cruise.
       Fixed gear. Hubs exposed on the stopped lift rotors. */
    techOverrides: { configType: "hybrid", nRotorsStopped: 6, hubsExposed: true, gearType: "fixed" },
  },

    {
    id: "volocopter-volocity",
    name: "Volocopter VoloCity",
    manufacturer: "Volocopter",
    /* THE ONLY PURE MULTICOPTER IN THIS SET, and it is here to answer one
       question the winged aircraft cannot: does the frame of a high-rotor-count
       coplanar multicopter behave the way this tool models it?

       It is also the extreme case of the arrangement - 18 rotors, no wing, no
       tail, control by differential rotor speed alone - so anything the boom
       and arm models get wrong shows up here first and largest. */
    config: "Coplanar multicopter, 18 fixed-pitch rotors on a ring, no wing",
    configType: "multicopter",
    sources: [
      "https://evtol.news/volocopter-volocity/",
      "Yang, Y. et al., Sizing of Multicopter Air Taxis, Aerospace 2024, 11, 200",
      "https://assets.ctfassets.net/vnrac6vfvrab/126QfcvwGXCr1P3wDWEvVZ/5edbda0a012c43d7cbd8116740f63145/241023_SpecSheet_VoloCity.pdf",
    ],
    notes:
      "Range 35 km is a short design mission, not a hop-limited figure, and the pack is " +
      "swappable in ~5 min. Payload 200 kg is two occupants. Rotor rim geometry is " +
      "published TWICE - 11.3 m including rotors and 9.3 m excluding them - which is what " +
      "makes the frame testable rather than inferred: the rotor centre circle is 4.50 m " +
      "radius, so adjacent 2.3 m discs sit 1.563 m apart and OVERLAP by 32% in plan. " +
      "The manufacturer's own photographs show the motor nacelles alternating between two " +
      "heights around the ring, which is how that overlap is possible. This tool's " +
      "non-overlap rule (1.05 R / sin(pi/N)) demands a 16.21 m aircraft and forbids the " +
      "real one. See research note 28.",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       AMBIGUOUS. "35 km range" says nothing about reserves, and a swappable-pack air taxi may well quote usable range. Left null - reserve is added, which is the conservative reading, and the ambiguity is reported rather than resolved by preference. */
    rangeIncludesReserve: null,
    published: {
      MTOW_kg:      { value: 900,   confidence: "high",   src: "900 kg MTOW" },
      payload_kg:   { value: 200,   confidence: "high",   src: "200 kg max payload, two occupants" },
      range_km:     { value: 35,    confidence: "high",   src: "35 km range" },
      cruise_ms:    { value: 27.8,  confidence: "high",   src: "100 km/h max cruise" },
      battery_kWh:  { value: null,  confidence: "low",    src: "9 exchangeable Li-ion packs, capacity not published" },
      nRotors:      { value: 18,    confidence: "high",   src: "18 fixed-pitch rotors, 18 motors" },
      peakPower_kW: { value: null,  confidence: "low",    src: "not published" },
      /* NO WING. span_m in this schema means WING span, and scoring a rotor
         rim against it produced a -100% "wing span" error on an aircraft that
         has no wing - which says nothing about the tool. The rim is recorded
         under its own keys below. */
      span_m:       { value: null,  confidence: "low",    src: "no wing - this is a pure multicopter" },
      rotorSpan_m:  { value: 11.3,  confidence: "high",   src: "rotor rim diameter INCLUDING rotors, 11.3 m (37 ft)" },
      rotorDiam_m:  { value: 2.3,   confidence: "high",   src: "single rotor 2.3 m (7 ft 6 in)" },
      fusLen_m:     { value: 3.9,   confidence: "medium", src: "Yang Table 4, photogrammetric" },
      fusWidth_m:   { value: 1.6,   confidence: "medium", src: "Yang Table 4, photogrammetric" },
      rotorRingDiam_m: { value: 9.3, confidence: "high",  src: "rotor rim diameter EXCLUDING rotors, 9.3 m (30 ft 6 in)" },
    },
    /* rotorInterleave is a STATEMENT OF FACT about this aircraft, not a
       tuning knob: the published rim geometry puts its eighteen 2.3 m discs
       1.563 m apart - overlapping 32% - and the manufacturer's photographs
       show the nacelles alternating between two heights. Sizing it with the
       strict non-overlap floor models an aircraft Volocopter did not build. */
    techOverrides: { configType: "multicopter", gearType: "fixed", rotorInterleave: true },
  },

  {
    id: "beta-alia-250",
    name: "BETA ALIA-250",
    manufacturer: "BETA Technologies",
    config: "Lift + cruise, 4 lift rotors + 1 pusher, V-tail",
    configType: "liftcruise",
    sources: [
      "https://evtol.news/beta-technologies-alia/",
      "https://beta.team/aircraft",
    ],
    notes:
      "Closest published match to the geometry this engine assumes (4 lift props, " +
      "pusher, high wing, V-tail). CAUTION: the widely quoted 250 nm range belongs to " +
      "the conventional-takeoff CX300 variant, not the VTOL variant — VTOL range is " +
      "materially lower and is NOT scored here. RE-CHECKED 2026-08-25 and the " +
      "data is still not clean enough to score: evtol.news lists gross weight " +
      "7,000 lb (3,175 kg) against the 6,250 lb (2,835 kg) held here — a 12% " +
      "conflict — and quotes range as '250 miles (500 km)', which is internally " +
      "wrong (250 mi = 402 km). Two independent defects in one spec table, so " +
      "the mission stays unconfirmed rather than guessed.",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       range unconfirmed; the aircraft is skipped anyway. */
    rangeIncludesReserve: null,
    published: {
      MTOW_kg:      { value: 2835,  confidence: "high",   src: "6,250 lb" },
      payload_kg:   { value: 635,   confidence: "medium", src: "1,400 lb cargo / 6 occupants" },
      range_km:     { value: null,  confidence: "low",    src: "VTOL-variant range unconfirmed" },
      cruise_ms:    { value: null,  confidence: "low",    src: "not confirmed for VTOL variant" },
      battery_kWh:  { value: 325,   confidence: "medium", src: "325 kWh pack" },
      nRotors:      { value: 4,     confidence: "high",   src: "4 VTOL props + 1 pusher" },
      span_m:       { value: 15.24, confidence: "high",   src: "50 ft wingspan" },
      rotorDiam_m:  { value: null,  confidence: "low",    src: "not confirmed" },
    },
  },

  {
    id: "vertical-vx4",
    name: "Vertical Aerospace VX4",
    manufacturer: "Vertical Aerospace",
    /* ── LAYOUT CORRECTED 2026-08-31, AND IT WAS NOT A COSMETIC FIX ───────
       This read "Lift + cruise, 8 rotors" / configType "liftcruise". That is
       wrong, and it was costing the model dearly: as a lift+cruise the engine
       stopped ALL EIGHT rotors in cruise and gave the aircraft a PUSHER
       PROPELLER IT DOES NOT HAVE. Eight stopped rotors at the clamped solidity
       of 0.40 produced roughly twice Joby's parasite drag (CD0 0.044 vs 0.019),
       which is most of why VX4 scored +171% on pack energy.

       The VX4 is a PARTIAL TILT-ROTOR: four front propellers tilt and provide
       cruise thrust; four rear propellers are lift-only and stow in cruise.
       That is the same family as Archer Midnight (6 tilt / 6 lift), which this
       file already maps to "hybrid" — and CONFIGURATIONS.hybrid is defined with
       hasCruiseProp:false precisely because "the TILTING rotors provide cruise
       thrust, so there is NO separate pusher".

       Three independent sources agree on the arrangement:
         - "partial tilt-rotor (only the 4 front lift propellers can tilt);
            fixed single wing", V-tail, 8 propellers, all wing-mounted
           — Aerial e-mobility perspective (corpus S0106/S0123) sec.4.9
         - "four tilting propellers at the front for forward flight and four
            rear propellers dedicated to vertical lift"; in transition "the
            rear propellers were stowed" — New Atlas / Royal Aeronautical
            Society / AAM International coverage of the VX4 prototype
         - evtol.news lists "8 propellers (each REAR VTOL propeller is
            considered one propeller)", which only parses if front and rear are
            different kinds of propeller.
       The corpus paper's own reference [323] is mis-numbered (it points at a
       hydrogen fuel-cell paper), so it is used for its description only and
       the arrangement rests on the corroborating sources above. */
    config: "Partial tilt-rotor, 8 rotors (4 tilt / 4 lift-only), V-tail",
    configType: "hybrid",
    sources: [
      "https://evtol.news/vertical-aerospace-VA-1X",
      "https://vertical-aerospace.com/wp-content/uploads/2024/07/Vertical-Aerospace-Unveils-Advanced-VX4-Prototype.pdf",
      "https://newatlas.com/aircraft/vertical-aerospace-vx4-tilt-rotor-evtol-second-prototype/",
      "https://www.aerosociety.com/news/hands-on-flying-the-vx4-evtol/",
      "https://www.aaminternational.com/projects/vertical-vx4/",
    ],
    /* gearType RETRACTABLE, and it is worth 30% of this aircraft's drag.
       It was unset, so it fell through to the FIXED default: CD0gear 0.0150
       against 0.0030 retracted, on a total CD0 of 0.0402. Joby was explicitly
       set retractable and VX4 was not, which made a like-for-like comparison
       between two similar aircraft anything but.
       [SRC] "The VX4 features RETRACTABLE tricycle-wheeled landing gear"
       (evtol.news / Vertical Aerospace prototype coverage); skids and flotation
       gear are offered as customer options. */
    techOverrides: { configType: "hybrid", nRotorsStopped: 4, hubsExposed: true,
                     gearType: "retractable" },
    notes:
      "LAYOUT now pinned: partial tilt-rotor, 4 tilting front + 4 lift-only rear, " +
      "no pusher (was wrongly modelled as a lift+cruise with 8 stopped rotors AND " +
      "a pusher). MTOW still could not be confirmed from a primary source, so MTOW " +
      "remains unscored; payload is inferred from 4 pax + pilot. Rotor diameter is " +
      "still unpublished — a targeted search returned battery (160 kWh) and span " +
      "(15 m) but no diameter or MTOW. Those two should be pinned down before this " +
      "aircraft carries weight in the headline error.",
    /* DOES THE PUBLISHED RANGE ALREADY INCLUDE RESERVES?
       AMBIGUOUS. "161 km" with no qualifier. Reserve added, ambiguity reported. */
    rangeIncludesReserve: null,
    published: {
      MTOW_kg:      { value: null,  confidence: "low",    src: "unconfirmed" },
      payload_kg:   { value: 450,   confidence: "high",   src: "\"Payload: 450 kg (992 lb)\" — evtol.news/vertical-aerospace-VA-1X" },
      range_km:     { value: 161,   confidence: "medium", src: "161 km" },
      cruise_ms:    { value: 66.9,  confidence: "medium", src: "241 km/h" },
      battery_kWh:  { value: 160,   confidence: "medium", src: "160 kWh" },
      nRotors:      { value: 8,     confidence: "high",   src: "8 electric motors" },
      span_m:       { value: 15.0,  confidence: "high",   src: "\"Wing span: 15 meters (49 feet, 2 inches)\" — evtol.news/vertical-aerospace-VA-1X" },
      rotorDiam_m:  { value: null,  confidence: "low",    src: "not confirmed" },
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   COMMON TECHNOLOGY BASELINE
   ═══════════════════════════════════════════════════════════════════════
   One technology set is applied to EVERY aircraft. This is the whole point:
   if each aircraft were given its own tuned efficiencies and empty-weight
   fraction, the suite would be curve-fitting, not validating, and the error
   figures would be meaningless.

   Anything genuinely aircraft-specific (rotor count, mission) comes from the
   dataset above. Anything representing "2025 state of the art" lives here.
   ═══════════════════════════════════════════════════════════════════════ */
/* ── configType, PROMOTED OUT OF techOverrides ────────────────────────────
   NASA, Joby and Archer already carried a configType inside `techOverrides`,
   so those three were always sized in the right configuration. BETA ALIA-250
   and Vertical VX4 did NOT, and silently fell through resolveConfiguration's
   "liftcruise" default -- which happens to be right for both, but only by
   accident. Stating it on every aircraft makes the configuration an explicit,
   reviewable property rather than a default nobody chose. */
export const TECH_BASELINE = {
  sedCell:        300,   // Wh/kg cell level — Joby/Archer class claims for 2025
  /* DISCHARGE-path efficiency, not round-trip (NDARC Theory sec.28:
     eta_batt = E_comp/E_batt) — an aircraft never charges in flight. NASA's RST
     default, applied to VERTICAL FLIGHT ONLY; see note 18. */
  etaBat:         0.90,
  etaHov:         0.72,  // hover figure of merit, optimised eVTOL rotor
  /* ── etaSys WAS SET TO THE SUPERSEDED DEFINITION ──────────────────────
     This read 0.85, commented "motor + inverter drivetrain chain". But that
     is not what the engine means by etaSys, and both the engine's own
     provenance entry and its UI slider say so explicitly:
         "must be the FULL chain incl. propeller (~0.76)"
         "FULL chain incl. propeller: eta_prop x eta_motor x eta_inv ~ 0.76"
     So this baseline was passing a motor+inverter figure into a parameter
     that the engine applies as the whole chain — omitting propeller
     efficiency entirely and under-predicting cruise power by ~1/0.87.

     0.744 is NASA's published chain for a winged eVTOL: cruise propeller
     efficiency 0.80 x powertrain efficiency 0.93 (Exploration of Design
     Drivers for the RVLT Lift+Cruise Reference Aircraft, Table 1). It agrees
     with the engine's own stated ~0.76 to within 2%.

     ⚠ THIS MAKES THE HEADLINE NUMBERS WORSE, and it is still correct.
     Every industrial aircraft here already OVER-predicts pack energy, so
     raising cruise power raises it further. The error was being masked by a
     parameter that was wrong in the flattering direction. Recorded rather
     than reverted — see the note in validate.mjs. */
  etaSys:         0.744, // FULL chain: eta_prop 0.80 x eta_powertrain 0.93
  socMin:         0.20,  // usable-SoC floor
  cRateDerate:    0.08,  // SED derate at hover C-rate
  ewf:            0.50,  // empty-weight fraction — the dominant assumption
  LD:             14,    // cruise L/D target
  AR:             9,
  eOsw:           0.85,
  clDesign:       0.55,
  taper:          0.45,
  tc:             0.15,
  /* SUPERSEDED AS A FLAT VALUE — validate.mjs now derives this per aircraft
     from its own rotor count via twRatioFor(), because NASA publish the OEI
     margin as a POWER factor of 1.3-1.8 that falls with rotor count. Kept as
     the fallback for anything that does not override it. */
  twRatio:        1.30,
  propDiam:       3.0,   // ASSUMPTION — no published rotor diameters confirmed
  cruiseAlt:      1000,
  hoverHeight:    15.24,
  reserveMinutes: 20,    // FAA powered-lift SFAR VFR minimum; NASA sizing convention
  rateOfClimb:    5.08,
  climbAngle:     5,
  descentAngle:   6,
  climbLDPenalty: 0.13,
  deltaISA:       0,
  convTolExp:     -6,
  fusLen:         7.2,
  fusDiam:        1.65,
  vtGamma:        45,
  vtCh:           0.45,
  vtCv:           0.032,
  vtAR:           2.5,
};
