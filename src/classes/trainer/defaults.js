/* =====================================================================
   TRAINER INPUT SET — what a light piston trainer is sized from
   =====================================================================
   Not the eVTOL inputs with some removed: a trainer has no rotor, no hover
   and no battery (in this first version), and it is sized by its stall
   speed, climb rate, cruise speed and range instead.

   Each input carries its unit, range, section and a `status`:
     sourced   the default is a number printed in the cited document
     derived   computed from sourced numbers (the working is in `source`)
     assumed   no free source gives it; the value is a stated judgement and
               the validation report shows how much it matters
   Defaults describe a four-seat trainer of the Cessna 172S class.
   ===================================================================== */

const POH = "Cessna 172S Pilot's Operating Handbook (Rev. 4)";
const GASP5 = "GASP, NASA CR-152303 Vol V";
const LOFTIN = "Loftin, NASA RP-1060";

export const TRAINER_INPUTS = Object.freeze({
  /* Mission */
  pax:            { value: 3, unit: "", min: 0, max: 5, section: "Mission", label: "Passengers (besides the pilot)", status: "sourced", source: `${POH}: four seats` },
  massPerOccupantLb: { value: 200, unit: "lb", min: 150, max: 260, section: "Mission", label: "Mass per occupant, with baggage", status: "sourced", source: `${GASP5} Eq V.1.49: UW_PAX = 200 lb; Fig V.1.4: crew and baggage 200 lb` },
  rangeNm:        { value: 518, unit: "nm", min: 100, max: 1200, section: "Mission", label: "Design range", status: "sourced", source: `${POH} p.ii: 518 nm at 75% power, 8,500 ft` },
  reserveMin:     { value: 45, unit: "min", min: 0, max: 90, section: "Mission", label: "Reserve (at cruise power)", status: "sourced", source: `${POH} p.ii: 45 minutes reserve` },
  allowanceGal:   { value: 1.4, unit: "US gal", min: 0, max: 5, section: "Mission", label: "Start, taxi and take-off fuel", status: "sourced", source: `${POH} §5: "Add 1.4 gallons of fuel for engine start, taxi and takeoff allowance"` },
  cruiseKt:       { value: 124, unit: "kt", min: 60, max: 200, section: "Mission", label: "Cruise speed (true)", status: "sourced", source: `${POH} p.ii: 124 kt at 75% power, 8,500 ft` },
  cruiseAltFt:    { value: 8500, unit: "ft", min: 0, max: 16000, section: "Mission", label: "Cruise altitude", status: "sourced", source: `${POH} p.ii` },
  cruisePowerFrac:{ value: 0.75, unit: "", min: 0.4, max: 1.0, section: "Mission", label: "Cruise power / rated power", status: "sourced", source: `${POH} p.ii: 75% power` },

  /* Requirements */
  stallKt:        { value: 48, unit: "kt", min: 35, max: 70, section: "Requirements", label: "Stall speed, landing flaps", status: "sourced", source: `${POH} §5 Fig 5-3: 48 KCAS at 30° flaps, 2,550 lb, most rearward C.G.` },
  rocFpm:         { value: 730, unit: "ft/min", min: 300, max: 1500, section: "Requirements", label: "Rate of climb, sea level", status: "sourced", source: `${POH} p.ii: 730 fpm` },
  vnoKt:          { value: 126, unit: "kt", min: 80, max: 250, section: "Requirements", label: "Maximum structural cruising speed", status: "sourced", source: `${POH} §2 airspeed limitations: V_NO 126 KCAS / 129 KIAS` },
  category:       { value: "normal", unit: "", options: ["normal", "utility", "acrobatic"], section: "Requirements", label: "Certification category", status: "sourced", source: `${GASP5} Eq V.1.36: limit 3.8 / 4.4 / 6.0 g` },

  /* Wing */
  AR:             { value: 7.48, unit: "", min: 5, max: 12, section: "Wing", label: "Aspect ratio", status: "derived", source: `${POH} Fig 1-1: span 36 ft 1 in, area 174 ft²; 36.083²/174` },
  taper:          { value: 0.68, unit: "", min: 0.3, max: 1.0, section: "Wing", label: "Taper ratio (trapezoid equivalent)", status: "assumed", source: "Typical C172 value (constant-chord inboard panel); no free document states it" },
  tcRoot:         { value: 0.12, unit: "", min: 0.09, max: 0.18, section: "Wing", label: "Root thickness ratio", status: "assumed", source: "NACA 2412 section, typical published C172 value; not in the POH" },
  strutFraction:  { value: 0, unit: "", min: 0, max: 0.8, section: "Wing", label: "Strut station / semispan (0 = cantilever)", status: "assumed", source: `${GASP5} Eq V.1.72. The C172 is strut-braced but the attachment station is not in the POH; 0 is the conservative (heavier) choice` },
  clMaxLanding:   { value: 1.879, unit: "", min: 1.2, max: 2.6, section: "Wing", label: "CLmax, landing flaps", status: "derived", source: `${POH}: 48 KCAS at 30° flaps, 2,550 lb, 174 ft² gives 2W/(ρV²S) = 1.879. ${LOFTIN} pp.334-335 recommends 1.7 for the 1970s fleet` },

  /* Aerodynamics */
  CD0:            { value: 0.0296, unit: "", min: 0.018, max: 0.05, section: "Aerodynamics", label: "Zero-lift drag coefficient", status: "sourced", source: `${LOFTIN} Table 6.II: class II (fixed gear) average 0.0296` },
  e:              { value: 0.75, unit: "", min: 0.5, max: 0.95, section: "Aerodynamics", label: "Airplane efficiency factor, cruise", status: "sourced", source: `${LOFTIN} App. B: "An average value of the airplane efficiency factor of 0.75 was used for all the aircraft"` },
  eClimb:         { value: 0.70, unit: "", min: 0.5, max: 0.95, section: "Aerodynamics", label: "Airplane efficiency factor, climb", status: "sourced", source: `${LOFTIN} p.347: ε = 0.7 in the climb correlation` },
  etaCruise:      { value: 0.85, unit: "", min: 0.6, max: 0.9, section: "Aerodynamics", label: "Propeller efficiency, cruise", status: "sourced", source: `${LOFTIN} §6.9.3 (4): "A cruising value of η of 85 percent is representative of current designs"` },
  etaClimb:       { value: 0.70, unit: "", min: 0.5, max: 0.85, section: "Aerodynamics", label: "Propeller efficiency, climb", status: "sourced", source: `${LOFTIN} p.347: η = 0.7 in climb` },

  /* Propulsion */
  sfc:            { value: 0.43, unit: "lb/hp/h", min: 0.35, max: 0.6, section: "Propulsion", label: "Specific fuel consumption, cruise", status: "sourced", source: `${LOFTIN} Table 6.III (p.387): 180 hp engine 0.43; 150 hp 0.45; 115 hp 0.47` },
  engineLbPerHp:  { value: 1.5, unit: "lb/hp", min: 1.0, max: 2.5, section: "Propulsion", label: "Engine specific weight", status: "sourced", source: `${GASP5} Eq V.1.3 (unsupercharged); NASA CR-114289 Table IX: IO-520-D 454 lb / 300 hp = 1.51` },
  engineSectionFrac: { value: 0.338, unit: "", min: 0, max: 0.6, section: "Propulsion", label: "Engine section structure / engine", status: "sourced", source: `${GASP5} Eq V.1.56: "SK_PES is input as .338, typically"` },
  propDiameterIn: { value: 76, unit: "in", min: 50, max: 100, section: "Propulsion", label: "Propeller diameter", status: "sourced", source: `${POH} §1: 76 in, fixed pitch` },
  propBlades:     { value: 2, unit: "", min: 2, max: 4, section: "Propulsion", label: "Propeller blades", status: "sourced", source: `${POH} §1: McCauley 1A170E/JHA7660, two-blade` },
  propActivityFactor: { value: 77.5, unit: "", min: 60, max: 150, section: "Propulsion", label: "Blade activity factor", status: "sourced", source: "NASA CR-114289 Table III: fixed-pitch Cherokee propellers, A.F. 77.5" },
  propRpm:        { value: 2700, unit: "rpm", min: 2000, max: 3000, section: "Propulsion", label: "Propeller speed, take-off", status: "sourced", source: `${POH} §1: 180 BHP at 2700 RPM` },
  propKind:       { value: "fixed", unit: "", options: ["fixed", "constantSpeed"], section: "Propulsion", label: "Propeller type", status: "sourced", source: "NASA CR-114289 Table V classes" },
  fuelDensityLbGal: { value: 6.0, unit: "lb/US gal", min: 5.5, max: 7.0, section: "Propulsion", label: "Fuel density (avgas)", status: "sourced", source: `${GASP5} note to Eq V.1.82` },
  oilLb:          { value: 15.0, unit: "lb", min: 0, max: 40, section: "Propulsion", label: "Engine oil", status: "sourced", source: "FAA TCDS 3A12 (172S): certificated empty weight must include full oil of 15.0 lb" },
  unusableFuelLb: { value: 18.0, unit: "lb", min: 0, max: 60, section: "Propulsion", label: "Unusable fuel", status: "sourced", source: "FAA TCDS 3A12 (172S): certificated empty weight must include unusable fuel of 18 lb" },

  /* Fuselage and tails */
  fuselageLengthFt: { value: 27.17, unit: "ft", min: 15, max: 40, section: "Fuselage", label: "Fuselage length", status: "sourced", source: `${POH} Fig 1-1: 27 ft 2 in overall` },
  fuselageWidthFt:  { value: 3.7, unit: "ft", min: 2.5, max: 6, section: "Fuselage", label: "Fuselage width", status: "assumed", source: `Scaled from ${POH} Fig 1-1 front view, ±0.3 ft` },
  fuselageDepthFt:  { value: 4.5, unit: "ft", min: 3, max: 7, section: "Fuselage", label: "Fuselage depth", status: "assumed", source: `Scaled from ${POH} Fig 1-1 side view, ±0.3 ft` },
  htAR:           { value: 4.0, unit: "", min: 2.5, max: 7, section: "Tails", label: "Horizontal tail aspect ratio", status: "assumed", source: "Judgement; the C172S span is 11 ft 4 in (POH Fig 1-1) but its area is not published" },
  vtAR:           { value: 1.2, unit: "", min: 0.8, max: 2.5, section: "Tails", label: "Vertical tail aspect ratio", status: "assumed", source: "Judgement (FLOPS_GA.md §14 'typ')" },
  tailTaper:      { value: 0.8, unit: "", min: 0.3, max: 1.0, section: "Tails", label: "Tail taper ratio", status: "assumed", source: "Judgement" },
  tailTc:         { value: 0.09, unit: "", min: 0.06, max: 0.15, section: "Tails", label: "Tail thickness ratio", status: "assumed", source: "Judgement (FLOPS_GA.md §14 'typ' 0.09)" },

  /* Weight-trend factors, small-aircraft calibrations */
  skWW:           { value: 133.4, unit: "", min: 60, max: 250, section: "Weight factors", label: "Wing trend factor", status: "sourced", source: `${GASP5} Eq V.1.68 default (regression over 18 aircraft incl. C150, C172, Arrow, C182, C210)` },
  skB:            { value: 129.0, unit: "", min: 80, max: 200, section: "Weight factors", label: "Fuselage trend factor", status: "derived", source: `${GASP5} Fig V.1.16: mean of Cessna 150 (130.0) and Arrow (128.0)` },
  skY:            { value: 0.139, unit: "", min: 0.03, max: 0.4, section: "Weight factors", label: "Horizontal tail trend factor", status: "derived", source: `${GASP5} Fig V.1.13: mean of Cessna 150 (0.204) and Arrow (0.0747)` },
  skZ:            { value: 0.2235, unit: "", min: 0.05, max: 0.5, section: "Weight factors", label: "Vertical tail trend factor", status: "derived", source: `${GASP5} Fig V.1.13: mean of Cessna 150 (0.227) and Arrow (0.22)` },
  skLG:           { value: 0.05087, unit: "", min: 0.015, max: 0.08, section: "Weight factors", label: "Landing gear / gross weight", status: "sourced", source: `${GASP5} Fig V.1.5: Cessna 172, 117 lb at 2,300 lb` },
  skFW:           { value: 0.434, unit: "", min: 0.1, max: 0.8, section: "Weight factors", label: "Flight controls trend factor", status: "derived", source: `${GASP5} Fig V.1.17: mean of Cessna 150 (0.485) and Arrow (0.383)` },
  skCC:           { value: 12.5, unit: "", min: 2, max: 20, section: "Weight factors", label: "Cockpit controls trend factor", status: "derived", source: `${GASP5} Fig V.1.17: mean of Cessna 150 (11.5) and Arrow (13.5)` },
  skFS:           { value: 0.1285, unit: "", min: 0.02, max: 0.2, section: "Weight factors", label: "Fuel system trend factor", status: "derived", source: `${GASP5} Fig V.1.18: mean of Cessna 150 (0.119) and Arrow (0.138)` },
  cwInstruments:  { value: 0.0416, unit: "", min: 0, max: 0.1, section: "Weight factors", label: "Instruments coefficient CW(2)", status: "assumed", source: "Lowest published Aviary deck value (transport); no GA calibration exists. C150 actual instruments 5.8 lb (GASP Fig V.1.3)" },
  cwHydControls:  { value: 0.0, unit: "", min: 0, max: 0.2, section: "Weight factors", label: "Hydraulics per controls CW(3)", status: "assumed", source: "Aviary default 0; a trainer has hydraulic brakes only (C150 actual 3.3 lb, GASP Fig V.1.3)" },
  cwAirCond:      { value: 1.0, unit: "", min: 0, max: 3, section: "Weight factors", label: "Air conditioning coefficient CW(6), above 3,500 lb", status: "sourced", source: "Aviary metadata default for GASP INGASP.CW(6); up to 3,500 lb the weight is a flat 5 lb (air_conditioning.py)" },
  highLiftLb:     { value: 17.4, unit: "lb", min: 0, max: 80, section: "Weight factors", label: "High-lift devices", status: "sourced", source: `${GASP5} Fig V.1.14: Cessna 172, 17.4 lb` },
  fixedGear:      { value: true, unit: "", section: "Weight factors", label: "Fixed landing gear", status: "sourced", source: `${POH}: fixed tricycle gear` },
});

export const TRAINER_DEFAULTS = Object.freeze(
  Object.fromEntries(Object.entries(TRAINER_INPUTS).map(([k, v]) => [k, v.value])));
