/* =====================================================================
   eVTOL AIRCRAFT DATABASE
   =====================================================================
   Every aircraft this project has data for, in one place, mapped onto the six
   configurations the engine can size, with the source of each figure attached.

   WHY THIS EXISTS. The data was scattered across three places that did not
   agree: `validation/reference-aircraft.js` (5 aircraft, deeply vetted, used
   for accuracy scoring), `CONFIG_REFERENCE` in engine/configuration.js (one
   reference per layout, used for the mission-envelope check), and the research
   corpus (4,038 works). Nothing enumerated the design space, so questions like
   "which configurations actually get built?" or "is our multicopter mission
   realistic?" could not be answered without re-reading papers.

   PROVENANCE RULES, same as the rest of the project:
     [SRC] published figure, source named
     [LAY] an assumption, labelled as one
     [GAP] not published — recorded as null, NEVER guessed
   A null here means "nobody published it", not "zero". Do not fill nulls in
   from memory; find a source or leave it.

   PRIMARY SOURCE for the survey block below:
     "Aerial e-mobility perspective: Anticipated designs and operational
      capabilities", corpus S0106/S0123 sec.4.1-4.13. One paper covering
      thirteen aircraft with the SAME fields, which is what makes them
      comparable. Its manufacturer figures are used for layout, propeller
      count, passengers, piloting, speed and range.
     CAUTION: that paper's reference numbering is demonstrably broken — entry
     4.9 (VX4) cites [323], which in its own reference list is a hydrogen
     fuel-cell paper. So it is used for DESCRIPTIONS, and anything load-bearing
     is corroborated independently (see `corroboration` fields).

   The five aircraft carried in validation/reference-aircraft.js are the
   vetted set used for ACCURACY SCORING and carry more fields (mass, energy,
   geometry). They are cross-referenced here by `validationId` rather than
   duplicated, so there is one place to change a number.
   ===================================================================== */

/** The six layouts the engine can size, plus the ones it cannot. */
export const LAYOUT_CLASSES = {
  multicopter:  "Rotor-borne, no wing; all rotors fixed and lifting",
  sideBySide:   "Rotor-borne, two large rotors side by side",
  liftcruise:   "Separate lift rotors (stop in cruise) plus a distinct cruise propulsor",
  tiltrotor:    "All rotors tilt; fixed wing",
  hybrid:       "Partial tilt — some rotors tilt for cruise, the rest stop",
  hybridPusher: "Partial tilt plus a separate pusher",
  UNSUPPORTED:  "Layout outside the engine's six — recorded so the gap is visible",
};

/* ── THE AIRCRAFT ───────────────────────────────────────────────────────
   `layout` is the engine configuration this aircraft maps to. Where the
   mapping is a judgement rather than a restatement, `layoutNote` says why. */
export const EVTOL_AIRCRAFT = [
  {
    id: "ehang-eh216s", name: "EH216-S", manufacturer: "EHang Holdings", country: "China",
    layout: "multicopter",
    description: "multirotor; 16 propellers as 8 coaxial pairs on 8 foldable arms, no tail",
    rotors: { total: 16, tilting: 0, coaxialPairs: 8, blades: null },
    pax: 2, piloting: "autonomous",
    cruise_ms: 36.1, cruise_src: "[SRC] 130 km/h maximum design speed",
    range_km: 30, range_src: "[SRC] 30 km maximum range",
    MTOW_kg: 620, MTOW_src: "[SRC] survey sec.4.1 remark (3), refs [254-256]",
    payload_kg: null, empty_kg: null, battery_kWh: null, span_m: null, length_m: null,
    certification: "CAAC standard Airworthiness Certificate, 31 Dec 2023 — first pilotless "
                 + "passenger-carrying UAM eVTOL to be type certified [SRC]",
    note: "The smallest and lightest certified passenger eVTOL. Its 620 kg MTOW is the "
        + "strongest single argument that a multicopter is a 2-seat, short-range machine.",
  },
  {
    id: "volocopter-volocity", name: "VoloCity", manufacturer: "Volocopter GmbH", country: "Germany",
    layout: "multicopter",
    description: "multirotor; 18 rotors — 12 on a rim above the cabin, 6 on connecting arms",
    rotors: { total: 18, tilting: 0, blades: null },
    pax: 2, piloting: "autonomous (initially piloted)",
    cruise_ms: 30.6, cruise_src: "[SRC] 110 km/h maximum airspeed",
    range_km: 35, range_src: "[SRC] 35 km",
    MTOW_kg: 900, MTOW_src: "[SRC] survey sec.4.2 remark (4)",
    payload_kg: 200, payload_src: "[SRC] remark (5) maximum payload",
    empty_kg: 700, empty_src: "[SRC] remark (6) operating weight empty",
    battery_kWh: null, span_m: null, length_m: null,
    certification: null,
    note: "THE BEST-DOCUMENTED MULTICOPTER: MTOW, payload AND empty weight all published, "
        + "and they close (700 + 200 = 900). Used as CONFIG_REFERENCE.multicopter. "
        + "Nine batteries; 5-minute battery swap.",
  },
  {
    id: "lilium-jet", name: "Lilium Jet", manufacturer: "Lilium GmbH", country: "Germany",
    layout: "UNSUPPORTED",
    layoutNote: "Tilt-wing AND tilt-canard with 30 DUCTED electric fans. The engine has no "
              + "ducted-fan or tandem-tilt-surface model, so sizing it would be a category "
              + "error. Recorded to keep the gap visible.",
    description: "tilt-wing and tilt-canard; 30 ducted fans in main wing and canard; front canard, no fin",
    rotors: { total: 30, tilting: 30, ducted: true, blades: null },
    pax: 6, piloting: "onboard pilot",
    cruise_ms: 68.9, cruise_src: "[SRC] 248 km/h cruising",
    range_km: 175, range_src: "[SRC] 175 km maximum",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "volocopter-voloregion", name: "VoloRegion", manufacturer: "Volocopter GmbH", country: "Germany",
    layout: "liftcruise",
    layoutNote: "Survey calls it 'separate thrust and lift sources' — that is the lift+cruise "
              + "definition. Thrust comes from 2 ducted fans rather than an open pusher.",
    description: "fixed tandem wing, tailless; 6 lift rotors plus 2 side ducted fans for thrust",
    rotors: { total: 6, tilting: 0, cruiseUnits: 2, blades: null },
    pax: 4, piloting: "autonomous",
    cruise_ms: 50.0, cruise_src: "[SRC] 180 km/h cruise (250 km/h max)",
    range_km: 100, range_src: "[SRC] as much as 100 km",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "airbus-cityairbus-nextgen", name: "CityAirbus NextGen", manufacturer: "Airbus", country: "France",
    layout: "liftcruise",
    layoutNote: "Fixed (non-tilting) rotors and a fixed wing — lift and cruise are separate. "
              + "[GAP] the survey does not say how cruise thrust is produced.",
    description: "fixed rotors, fixed wing, V-tail; 8 propellers",
    rotors: { total: 8, tilting: 0, blades: null },
    pax: 4, piloting: "autonomous (initially piloted)",
    cruise_ms: 33.3, cruise_src: "[SRC] 120 km/h cruise",
    range_km: 80, range_src: "[SRC] 80 km operational range",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "boeing-pav", name: "Passenger Air Vehicle (PAV)", manufacturer: "Boeing", country: "USA",
    layout: "liftcruise",
    description: "fixed single wing, twin tail; 9 propellers including a rear pusher",
    rotors: { total: 8, tilting: 0, cruiseUnits: 1, blades: null },
    pax: 4, paxNote: "survey gives '2 or 4'",
    piloting: "autonomous",
    cruise_ms: null, cruise_src: "[GAP] survey states speed unknown",
    range_km: 80, range_src: "[SRC] up to 80 km (50 miles)",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "hyundai-sa2", name: "S-A2", manufacturer: "Hyundai Motor Group (Supernal)", country: "South Korea",
    layout: "tiltrotor",
    description: "full tilt-rotor — all rotors tilt; fixed wing, V-tail; 8 propellers",
    rotors: { total: 8, tilting: 8, blades: null },
    pax: 4, piloting: "onboard pilot",
    cruise_ms: 53.6, cruise_src: "[SRC] 193 km/h (120 mph) cruise",
    range_km: 64, range_src: "[SRC] 64 km (40 mile) trips; true maximum not published [GAP]",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "joby-s4", name: "Joby S4", manufacturer: "Joby Aviation", country: "USA",
    layout: "tiltrotor",
    validationId: "joby-s4",
    description: "full tilt-rotor; fixed single wing, V-tail; 6 five-bladed variable-pitch proprotors",
    rotors: { total: 6, tilting: 6, blades: 5, pitch: "variable" },
    rotors_src: "[SRC] 5-bladed composite variable-pitch; 4 on the wing, 2 on the V-tail",
    pax: 4, piloting: "onboard pilot",
    cruise_ms: 89.4, cruise_src: "[SRC] 200 mph",
    range_km: 161, range_src: "[SRC] 100 miles on one charge",
    /* TWO FIGURES EXIST AND THE PUBLIC RECORD DOES NOT RECONCILE THEM.
       The FAA's own certification document is the harder source and it is
       the LOWER number: "The Joby Model JAS4-1 (Model JAS4-1) powered-lift
       has a maximum gross takeoff weight of 4,800 lbs. and is capable of
       carrying a pilot and four passengers" -- Airworthiness Criteria for
       the Joby Model JAS4-1 Powered-Lift, 89 FR 17230, 8 March 2024, read
       2026-09-06. The 5,300 lb figure is widely reported as a production
       spec but could NOT be verified against a primary source: Joby's own
       site publishes no takeoff weight. Kept as the scored value because
       the benchmark compares against reported production aircraft, but the
       certification-basis figure is recorded so a reader can choose. */
    MTOW_kg: 2404, MTOW_src: "[SRC] 5,300 lb reported production spec — UNVERIFIED against any primary source. The FAA certification basis states 4,800 lb (2,177 kg): 89 FR 17230, 8 Mar 2024",
    MTOW_certBasis_kg: 2177, MTOW_certBasis_src: "[SRC] 'maximum gross takeoff weight of 4,800 lbs' — Airworthiness Criteria: Special Class Airworthiness Criteria for the Joby Aero, Inc. Model JAS4-1 Powered-Lift, 89 FR 17230, 8 March 2024",
    payload_kg: 453, payload_src: "[SRC] 1,000 lb max payload",
    empty_kg: 1950, empty_src: "[SRC] 4,300 lb empty (INCLUDES battery)",
    battery_kWh: 165, battery_src: "[SRC] reported 150-180 kWh, midpoint",
    span_m: 11.8, span_src: "[SRC] 11.8 m — evtol.news, AOPA Apr-2023",
    length_m: 7.32, length_src: "[SRC] 24 ft overall length",
    rotorDiam_m: 2.9, rotorDiam_src: "[SRC] 2.9 m diameter, six props",
    certification: "FAA type certification in progress",
    note: "THE MOST COMPLETE PUBLIC DATA SET of any eVTOL, which is why it anchors the "
        + "fuselage-length model and CONFIG_REFERENCE.tiltrotor. Its weight model closes "
        + "to 0.2% at its own design point.",
  },
  {
    id: "vertical-vx4", name: "VX4", manufacturer: "Vertical Aerospace", country: "UK",
    layout: "hybrid",
    validationId: "vertical-vx4",
    description: "partial tilt-rotor — 4 front props tilt, 4 rear props lift only and stow in cruise; "
               + "fixed single wing, V-tail",
    rotors: { total: 8, tilting: 4, stopping: 4, blades: null },
    corroboration: "[SRC] survey sec.4.9 'only the 4 front lift propellers can tilt'; New Atlas / "
                 + "Royal Aeronautical Society / AAM International 'four tilting propellers at the "
                 + "front ... four rear propellers dedicated to vertical lift', rear props 'stowed' "
                 + "in transition; evtol.news lists '8 propellers (each REAR VTOL propeller is "
                 + "considered one propeller)', which only parses if front and rear differ",
    pax: 4, piloting: "onboard pilot",
    cruise_ms: 66.9, cruise_src: "[SRC] 241 km/h (150 mph)",
    range_km: 161, range_src: "[SRC] up to 161 km (100 miles)",
    MTOW_kg: null, MTOW_src: "[GAP] not confirmed from a primary source",
    payload_kg: 450, payload_src: "[SRC] 450 kg (992 lb) — evtol.news",
    empty_kg: null, battery_kWh: 160, battery_src: "[SRC] 160 kWh",
    span_m: 15.0, span_src: "[SRC] 15 m wing span",
    length_m: null, rotorDiam_m: null,
    landingGear: "retractable tricycle",
    landingGear_src: "[SRC] Vertical publish retractable tricycle-wheeled gear; skids and "
                   + "flotation gear offered as customer options. This matters more than it "
                   + "reads: modelled as FIXED it carried CD0 0.0150 against 0.0030 retracted, "
                   + "30% of the aircraft's total drag, and its pack-energy error was +212%",
    certification: null,
    note: "WAS MIS-CLASSIFIED as a lift+cruise in this project until 2026-08-31. As a "
        + "lift+cruise the engine stopped all 8 rotors and gave it a pusher it does not "
        + "have, producing ~2x Joby's parasite drag.",
  },
  {
    id: "archer-midnight", name: "Midnight", manufacturer: "Archer Aviation", country: "USA",
    layout: "hybrid",
    validationId: "archer-midnight",
    description: "partial tilt-rotor — 6 five-bladed VARIABLE-PITCH tilt props on the wing leading "
               + "edge, 6 two-bladed FIXED-PITCH lift props on the trailing edge; V-tail",
    rotors: { total: 12, tilting: 6, stopping: 6, blades: "5 tilt / 2 lift",
              pitch: "variable (tilt) / fixed (lift)" },
    rotors_src: "[SRC] survey sec.4.10 'only the 6 front lift propellers can tilt'; tilt props are "
              + "5-bladed variable pitch, lift props 2-bladed fixed pitch, blades asymmetrically "
              + "spaced for noise. Archer has also flight-tested 3- and 4-bladed lift props",
    pax: 4, piloting: "onboard pilot",
    cruise_ms: 66.9, cruise_src: "[SRC] up to 241 km/h (150 mph)",
    range_km: 100, range_src: "[SRC] 161 km quoted, but the DESIGN mission is back-to-back "
                            + "32 km (20 mile) hops; 100 km carried at medium confidence",
    MTOW_kg: 3175, MTOW_src: "[SRC] 7,000 lb",
    payload_kg: 453, empty_kg: null, battery_kWh: 142,
    span_m: 14.3, span_src: "[SRC] 47 ft",
    length_m: null, rotorDiam_m: null, rotorDiam_src: "[GAP] not published",
    certification: "FAA proposed airworthiness criteria published Dec 2022",
    note: "MIXED CONTROL — half collective, half rpm — and NASA's Table 4 motor-transient "
        + "criteria have no column for that, which is why the OEI check reports a bracket.",
  },
  {
    id: "eve-air-mobility", name: "Eve", manufacturer: "Eve Air Mobility", country: "USA",
    layout: "liftcruise",
    description: "separate thrust and lift; fixed single wing, twin tail; 9 propellers "
               + "(8 lift + 1 pusher)",
    rotors: { total: 8, tilting: 0, cruiseUnits: 1, blades: null },
    pax: 4, paxNote: "survey gives 6 eventually, 4 at entry into service",
    piloting: "autonomous (piloted at EIS)",
    cruise_ms: null, cruise_src: "[GAP] survey states speed not known",
    range_km: 100, range_src: "[SRC] 100 km (60 miles)",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "jaunt-journey", name: "Journey", manufacturer: "Jaunt Air Mobility", country: "USA / Canada",
    layout: "UNSUPPORTED",
    layoutNote: "Slowed-rotor compound: ONE main rotor plus 4 propellers. The engine has no "
              + "slowed-rotor compound model — a single large rotor unloaded in cruise is a "
              + "different lift-sharing problem from anything in the six.",
    description: "one main rotor plus 4 propellers; fixed single wing; conventional tail",
    rotors: { total: 1, mainRotor: true, cruiseUnits: 4, blades: null },
    pax: 4, piloting: "onboard pilot",
    cruise_ms: 77.8, cruise_src: "[SRC] 280 km/h (175 mph), estimated",
    range_km: 155, range_src: "[SRC] 130-190 km estimated, midpoint",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
  },
  {
    id: "wisk-gen6", name: "Generation 6", manufacturer: "Wisk Aero", country: "USA",
    layout: "hybrid",
    description: "partial tilt-rotor — 6 front props tilt, 6 fixed; fixed single wing, "
               + "conventional tail",
    rotors: { total: 12, tilting: 6, stopping: 6, blades: null },
    pax: 4, piloting: "autonomous",
    cruise_ms: 59.2, cruise_src: "[SRC] 204-222 km/h (110-120 kt), midpoint",
    range_km: 144, range_src: "[SRC] 144 km (90 miles) WITH battery reserves",
    MTOW_kg: null, payload_kg: null, empty_kg: null, battery_kWh: null,
    span_m: null, length_m: null, certification: null,
    note: "One of the few range figures published as INCLUDING reserves, which is exactly "
        + "the mission-convention ambiguity that dominates this project's benchmark error.",
  },
  {
    id: "beta-alia250", name: "ALIA-250", manufacturer: "BETA Technologies", country: "USA",
    layout: "liftcruise",
    validationId: "beta-alia-250",
    description: "4 lift props that stop, plus 1 pusher; high fixed wing, V-tail",
    rotors: { total: 4, tilting: 0, stopping: 4, cruiseUnits: 1, blades: null },
    pax: 5, paxNote: "6 occupants or cargo",
    piloting: "onboard pilot",
    cruise_ms: null, cruise_src: "[GAP] VTOL-variant cruise unconfirmed — quoted figures "
                              + "belong to the conventional-takeoff CX300",
    range_km: null, range_src: "[GAP] same CX300 confusion; the widely quoted 250 nm is NOT "
                             + "the VTOL variant",
    MTOW_kg: 2835, MTOW_src: "[SRC] 6,250 lb (evtol.news lists 7,000 lb — a 12% conflict)",
    payload_kg: 635, payload_src: "[SRC] 1,400 lb cargo / 6 occupants",
    empty_kg: null, battery_kWh: 325, battery_src: "[SRC] 325 kWh pack",
    span_m: 15.24, span_src: "[SRC] 50 ft",
    length_m: null, rotorDiam_m: null,
    certification: null,
    note: "CONFIG_REFERENCE.liftcruise. Its spec table contains two independent defects — a "
        + "12% MTOW conflict between sources and a range quoted as '250 miles (500 km)', "
        + "which is internally wrong — so its mission stays unscored.",
  },
];

/* ── NASA CONCEPT VEHICLES ──────────────────────────────────────────────
   Paper designs, not aircraft — but they are the ONLY vehicles in this field
   with a full published weight statement, which is why every accuracy claim in
   this project rests on them rather than on the aircraft above.
   [SRC] NASA/TM-20210017971 Table 12; Johnson & Silva, The Aeronautical
   Journal 126(1295), 2022. */
export const NASA_CONCEPT_VEHICLES = [
  { id: "nasa-quad-e",  name: "Quadrotor, all-electric",   layout: "multicopter",
    rotors: { total: 4, tilting: 0 }, rotorType: "flapping", flapFreq: 1.03,
    MTOW_kg: 2939, empty_kg: 2390, payload_kg: 544, battery_kWh: 369,
    diskLoading_lbft2: 3.00, solidity: 0.0550, tipSpeed_fts: 550, LoDe: 5.80,
    cruise_kt: 98, range_nm: 75 },
  { id: "nasa-sbs-e",   name: "Side-by-side, all-electric", layout: "sideBySide",
    rotors: { total: 2, tilting: 0 }, rotorType: "flapping", flapFreq: 1.03,
    MTOW_kg: 2223, empty_kg: 1674, payload_kg: 544, battery_kWh: 235,
    diskLoading_lbft2: 3.50, solidity: 0.0580, tipSpeed_fts: 550, LoDe: 7.20,
    cruise_kt: 98, range_nm: 75 },
  { id: "nasa-lc-e",    name: "Lift+cruise, all-electric",  layout: "liftcruise",
    rotors: { total: 8, tilting: 0, stopping: 8, cruiseUnits: 1 },
    rotorType: "hingeless/rigid", flapFreq: 1.25,
    MTOW_kg: 3724, empty_kg: 3175, payload_kg: 544, battery_kWh: 400,
    diskLoading_lbft2: 13.1, solidity: 0.267, tipSpeed_fts: 585, LoDe: 8.50,
    cruise_kt: 112, range_nm: 75,
    note: "Rotors are RIGID and fixed-pitch because they STOP in cruise — the reason its "
        + "flap frequency is 1.25 and not 1.03, worth 33 points of rotor-group error" },
];

/* ── WHAT THE DATABASE SAYS ─────────────────────────────────────────────
   Derived, not asserted, so it cannot drift from the data above. */
export function databaseSummary() {
  const byLayout = {};
  for (const a of EVTOL_AIRCRAFT) (byLayout[a.layout] ??= []).push(a.name);
  const fields = ["MTOW_kg", "payload_kg", "empty_kg", "battery_kWh", "span_m",
                  "length_m", "rotorDiam_m", "cruise_ms", "range_km"];
  const coverage = {};
  for (const f of fields) {
    const have = EVTOL_AIRCRAFT.filter(a => a[f] != null).length;
    coverage[f] = { have, of: EVTOL_AIRCRAFT.length,
                    pct: +(100 * have / EVTOL_AIRCRAFT.length).toFixed(0) };
  }
  return { count: EVTOL_AIRCRAFT.length, byLayout, coverage,
           withFullWeightStatement: NASA_CONCEPT_VEHICLES.length };
}

/** Aircraft the engine can size, i.e. excluding UNSUPPORTED layouts. */
export const sizableAircraft = () => EVTOL_AIRCRAFT.filter(a => a.layout !== "UNSUPPORTED");

/** Reference aircraft for a given engine configuration, best-documented first
    (an entry with a published MTOW outranks one without). */
export function referencesFor(layout) {
  return EVTOL_AIRCRAFT.filter(a => a.layout === layout)
    .sort((x, y) => (y.MTOW_kg != null) - (x.MTOW_kg != null));
}
