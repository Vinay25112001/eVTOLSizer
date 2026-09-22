/* =====================================================================
   BUSINESS-JET INPUT SET — a mid-size twin with aft engines
   =====================================================================
   The business jet is flown by the jet-transport method (FLOPS weights,
   Loftin matching, segment mission) with its own inputs: aft-fuselage
   engines, a T-tail, Scholz 2021 business-jet tail volumes, NBAA-style
   reserves, executive seats, and a published mission that carries fewer
   passengers than there are seats. Defaults describe a Cessna Citation
   Latitude (Model 680A). Status as for the other classes:
     sourced  printed in the cited document
     derived  computed from sourced numbers (working in `source`)
     assumed  a stated judgement with no free source
   Data: eVTOL_Sizing_Research/datasets/business-jet/aircraft.csv (primary
   rows) and datasets/engines/. Method notes:
   eVTOL_Sizing_Research/classes/business-jet/METHODS.md.
   ===================================================================== */

import { TRANSPORT_INPUTS } from "../transport/defaults.js";

const LAT = "Cessna Citation Latitude product card and EASA TCDS IM.A.033 (Model 680A), datasets/business-jet/aircraft.csv row CESS-LAT";
const TCDS_ENG = "EASA TCDS IM.E.051 (PW306 series): PW306D1 26.27 kN, dry mass 524.4 kg";
const FLEET = "datasets/business-jet/aircraft.csv, primary rows";
const FT = 0.3048, KG = 0.45359237;

const over = (k, v) => ({ ...TRANSPORT_INPUTS[k], ...v });

export const BIZJET_INPUTS = Object.freeze({
  /* Mission */
  firstClass:      over("firstClass", { value: 9, max: 19, label: "Executive seats (installed)", status: "sourced", source: `${LAT}: 9 passengers maximum. Counted as FLOPS first-class seats (furnishings 112 lb and service 5.2 lb each, NASA/TM-2017-219627 Eq 110, 124)` }),
  businessClass:   over("businessClass", { value: 0, status: "assumed", source: "Executive seats are entered above" }),
  economyClass:    over("economyClass", { value: 0, status: "assumed", source: "Executive seats are entered above" }),
  passengersCarried: { value: 4, unit: "", min: 0, max: 19, section: "Mission", label: "Passengers on the design mission", status: "sourced", source: `${LAT}: range quoted with 4 passengers. Business-jet ranges are published part-full; the seats above still set the furnishings` },
  massPerPassenger: over("massPerPassenger", { value: 200, status: "sourced", source: "Embraer Praetor 500 brochure: range with \"4 pax at 200 lb each\" (datasets/business-jet, row EMB-PR500); taken as passenger and baggage together" }),
  baggagePerPassenger: over("baggagePerPassenger", { value: 0, status: "sourced", source: "Included in the 200 lb per passenger above" }),
  cargo:           over("cargo", { value: 0, max: 5000, status: "assumed", source: "No cargo on the published range mission" }),
  designRange:     over("designRange", { value: 2700, min: 500, max: 8000, status: "sourced", source: `${LAT}: 2,700 nm with 4 passengers, high-speed cruise, NBAA IFR reserves, standard day, zero wind` }),
  cruiseMach:      over("cruiseMach", { value: 0.78, min: 0.5, max: 0.92, status: "derived", source: `${LAT}: maximum cruise 446 kt; at 43,000 ft ISA (speed of sound 573.6 kt) that is M 0.78` }),
  cruiseAltFt:     over("cruiseAltFt", { value: 43000, max: 51000, status: "assumed", source: `Two thousand feet below the 45,000 ft ceiling (${LAT})` }),
  maxMach:         over("maxMach", { value: 0.80, max: 0.95, status: "assumed", source: "Latitude MMO not in the fetched documents; mid-size jets in the dataset list 0.80-0.83" }),
  fuelMethod:      over("fuelMethod", { value: "mission" }),
  reservePolicy:   over("reservePolicy", { value: "nbaa", status: "sourced", source: "The OEM ranges are quoted with NBAA IFR reserves. The nbaa policy flies a 200 nm alternate (Embraer Praetor 500 brochure: \"NBAA IFR reserves with 200 nm alternate\") and a 30-minute hold; see classes/business-jet/METHODS.md for the definition's sources" }),
  climbCasKt:      over("climbCasKt", { value: 250, status: "assumed", source: "Business jets commonly climb near 250 kt CAS; no public schedule for the Latitude" }),
  descentCasKt:    over("descentCasKt", { value: 250, status: "assumed", source: "As the climb" }),
  taxiMin:         over("taxiMin", { value: 10.06 }),
  alternateAltFt:  over("alternateAltFt", { value: 25000 }),
  alternateMach:   over("alternateMach", { value: 0.65 }),
  alternateNm:     over("alternateNm", { value: 200, status: "sourced", source: "Embraer Praetor 500 brochure: NBAA IFR reserves with a 200 nm alternate" }),

  /* Requirements */
  landingFieldLengthM: over("landingFieldLengthM", { value: 1362, min: 600, max: 2500, status: "derived", source: `Citation Latitude: unfactored landing distance 817 m at MLW, divided by 0.6 (14 CFR 121.195(b)), giving a factored landing field length of 1,362 m. The earlier fleet mean (Challenger 350, Praetor 500, Learjet 75) is not used: those three publish landing distance at a "typical" weight, not MLW, so they cannot be read through the Loftin relation (METHODS.md §8.3)` }),
  takeoffFieldLengthM: over("takeoffFieldLengthM", { value: 1091, min: 600, max: 3000, status: "sourced", source: `${LAT}: take-off distance at MTOW, sea level, ISA` }),
  landingToTakeoffMass: over("landingToTakeoffMass", { value: 0.895, status: "derived", source: `${LAT}: MLW 12,507 / MTOW 13,971 kg` }),
  mzfwRatio:       over("mzfwRatio", { value: 0.6957, status: "sourced", source: `EASA TCDS IM.A.033, Model 680A: MZFW 9,720 / MTOW 13,971 kg. Business jets sit well below the airliner ratio, and the heavier and longer-ranged they are the lower it goes: across the 55 primary rows of ${FLEET} the ratio runs from 0.56 (Falcon 7X, Global 7500, G650ER) through 0.68 at the median to 0.85 (very light jets)` }),
  clMaxLanding:    over("clMaxLanding", { value: 2.17, min: 1.4, max: 3.0, status: "derived", source: `Citation Latitude, from its published approach speed: VREF 108 kt at 27,508 lb (NTSB ERA19FA248) gives a Loftin-equivalent CLmax,L of 2.17. By category (METHODS.md §8.4): Part 23 unslatted light jets 1.80 ± 0.07, Part 25 unslatted mid-size 2.1 ± 0.1, PC-24 2.2, slatted high-sweep 1.76 (Citation X, n = 1). The earlier 2.4 was back-fitted through k_L = 0.107 to two types whose landing distance is not at MLW` }),
  clMaxTakeoff:    over("clMaxTakeoff", { value: 1.7, min: 1.2, max: 2.4, status: "derived", source: "Part 25 unslatted mid-size, from published V2 where it exists (METHODS.md §8.4): CL_TO,Lof 1.55 ± 0.04 for Part 23 light jets, 1.7 for mid-size. Paired with k_TO = 2.64 below; the previous 1.6 was a ratio assumption with no measurement behind it" }),
  /* THE BUSINESS JET KEEPS LOFTIN'S LINE, and on purpose. The transport
     class now computes its landing constraint from 25.125, but that method
     carries one fitted number - the braking coefficient - and it was
     calibrated on 168 AIRLINERS. Applied unchanged to this class it puts
     the Citation Latitude's wing loading at 395 kg/m2 against a published
     277, a 42 % error, because it credits a light jet with an airliner's
     reversers, spoilers and brakes. The coefficient that would reproduce
     the Latitude is 0.319 against the airliners' 0.50 - a real, physical,
     class-sized difference, not noise.

     Meanwhile this class already has BETTER evidence for its own line than
     the physics model carries: k_L = 0.091 is fitted on the eight business
     jets whose landing distance is published at maximum landing weight, and
     CLmax,L = 2.17 comes from the Latitude's own published approach speed.
     A correlation calibrated on the right class beats a physical model
     whose one free parameter was calibrated on the wrong one.

     To move this class to far25, calibrate landingMuBraking over those same
     eight aircraft rather than adopting the airliner value; 0.319 from the
     Latitude alone is where to start, not where to finish. */
  landingMethod:   over("landingMethod", { value: "loftin", status: "derived", source: "The 25.125 computation's braking coefficient is calibrated on 168 airliners and is wrong for this class by 42 % on the Citation Latitude (it wants 0.319, not the airliners' 0.50). This class's own Route-A line is fitted on eight business jets with landing distances published at MLW, which is better evidence. METHODS.md §8.4" }),
  kLanding:        over("kLanding", { value: 0.091, status: "derived", source: `Business-jet recalibration of Loftin's landing constant over the eight types whose landing distance is published at MLW (M2 0.0883, CJ3 0.0811, CJ4 0.0897, Latitude 0.0838, Longitude 0.0949, Citation X 0.0972, Phenom 300 0.0998, PC-24 0.0930): k_L = 0.091 ± 0.006 kg/m³, against Loftin's airliner 0.107. METHODS.md §8.4 Route A; ${FLEET}` }),
  kTakeoff:        over("kTakeoff", { value: 2.64, status: "derived", source: "Business-jet recalibration of Loftin's take-off constant over the five types with published V2 (M2 2.54, CJ3 2.63, CJ4 2.62, Longitude 2.67, Citation X 2.73): k_TO = 2.64 ± 0.07 m³/kg, against Loftin's airliner 2.34. METHODS.md §8.4" }),
  engineLocation:  over("engineLocation", { value: "aft-fuselage", status: "sourced", source: `${LAT}: two engines on the rear fuselage (FLOPS NEF = 2)` }),
  numEngines:      over("numEngines", { value: 2, max: 3, label: "Engines" }),
  tailSizing:      over("tailSizing", { value: "volume" }),
  tailCategory:    over("tailCategory", { value: "business-jet", status: "sourced", source: "Scholz 2021 (INCAS 13(3)) Table 2: business jets C_H 0.694, C_V 0.0722" }),
  tTail:           over("tTail", { value: true, status: "sourced", source: "The Citation Latitude has a T-tail; Scholz 2021 p.155 allows 4 % smaller T-tail volumes" }),

  /* Wing */
  wingAspectRatio: over("wingAspectRatio", { value: 9.64, status: "derived", source: `${LAT}: span 22.04 m squared over area 50.4 m²` }),
  wingSweep:       over("wingSweep", { value: 16, status: "assumed", source: "Not in the fetched documents; mid-size business jets have 13-30° quarter-chord sweep" }),
  wingTaper:       over("wingTaper", { value: 0.30, status: "assumed", source: "Not in the fetched documents" }),
  wingTc:          over("wingTc", { value: 0.12, status: "assumed", source: "Not in the fetched documents" }),
  wingFuelFraction: over("wingFuelFraction", { value: 0.95, status: "assumed", source: "The Latitude's 5,168 kg of fuel (TCDS) is more than a wing of this size holds at the airliner fraction; business jets also carry fuel in the fuselage, which the FLOPS volume estimate leaves out" }),
  wingCompositeFraction: over("wingCompositeFraction", { value: 0 }),
  htAreaRatio:     over("htAreaRatio", {}),
  vtAreaRatio:     over("vtAreaRatio", {}),

  /* Aerodynamics */
  dragMethod:      over("dragMethod", {}),
  airfoilTech:     over("airfoilTech", { value: 1.5, status: "assumed", source: "Between conventional (1) and supercritical (2); no source for the Latitude" }),
  wingCamber:      over("wingCamber", { value: 0, status: "assumed", source: "FLOPS default" }),
  spanEfficiencyFlops: over("spanEfficiencyFlops", { value: 1, status: "sourced", source: "FLOPS default E = 1" }),
  cfEquivalent:    over("cfEquivalent", { status: "assumed", source: "The jet-transport value (Scholz ch.5, 0.003); no business-jet figure in the fetched sources" }),
  oswaldCruise:    over("oswaldCruise", {}),
  oswaldFlaps:     over("oswaldFlaps", {}),
  cd0Clean:        over("cd0Clean", {}),

  /* Propulsion */
  tsfcCruise:      over("tsfcCruise", { value: 0.70, status: "derived", source: "PW306A at M 0.80, 40,000 ft: 0.70 (Jenkinson Data B and the Hammami database, secondary; datasets/engines/cruise-tsfc/FINDINGS.md). The D1 is not listed" }),
  bypassRatio:     over("bypassRatio", { value: 4.5, status: "derived", source: "PW305B / PW306A: 4.5 (same compilations)" }),
  engineRefThrust: over("engineRefThrust", { value: Math.round(26.27e3 / 4.4482216), min: 1500, max: 20000, status: "sourced", source: TCDS_ENG }),
  engineRefMass:   over("engineRefMass", { value: Math.round(524.4 / KG), min: 200, max: 3000, status: "sourced", source: TCDS_ENG }),
  nacelleRefDiameter: over("nacelleRefDiameter", { value: 4.0, min: 2, max: 8, status: "assumed", source: "Not in the fetched documents" }),
  nacelleRefLength: over("nacelleRefLength", { value: 9.0, min: 4, max: 15, status: "assumed", source: "Not in the fetched documents" }),
  fuelDensity:     over("fuelDensity", {}),
  fuelTanks:       over("fuelTanks", { value: 3, status: "assumed", source: "Two wing tanks and a fuselage tank" }),

  /* Fuselage */
  fuselageLength:  over("fuselageLength", { value: +(18.98 / FT * 0.93).toFixed(2), min: 30, max: 110, status: "derived", source: `${LAT}: overall length 18.98 m × 0.93, the body-to-overall ratio used in the dataset runs` }),
  fuselageWidth:   over("fuselageWidth", { value: +(2.2 / FT).toFixed(2), min: 4, max: 12, status: "derived", source: `${LAT}: cabin width 1.96 m plus 0.12 m of wall each side (assumed)` }),
  fuselageHeight:  over("fuselageHeight", { value: +(2.3 / FT).toFixed(2), min: 4, max: 12, status: "assumed", source: "Cabin height 1.83 m class plus structure; not in the fetched documents" }),
  passengerCompartmentLength: over("passengerCompartmentLength", { value: 21.6, min: 8, max: 60, status: "assumed", source: "Mid-size cabins are about 20-25 ft long; not in the fetched documents" }),

  /* Crew and structure */
  flightCrew:      over("flightCrew", { value: 2, status: "sourced", source: `${LAT}: range quoted with 2 crew` }),
  flightAttendants: over("flightAttendants", { value: 0, status: "assumed", source: "None on a mid-size jet" }),
  galleyCrew:      over("galleyCrew", { value: 0, status: "assumed", source: "None" }),
  ultimateLoadFactor: over("ultimateLoadFactor", {}),
  loadFactorMethod: over("loadFactorMethod", { value: "far25", status: "sourced", source: "14 CFR 25.337(b) is a function of weight, and business jets are light enough for it to bind: the Citation Latitude's 30,801 lb design gross weight gives a limit factor of 2.69 and an ultimate of 4.03, not the 3.75 that FLOPS defaults to for airliners. Airliners keep \"input\", where the two agree" }),
  mainGearOleoIn:  over("mainGearOleoIn", { value: 40, status: "assumed", source: "Scaled from the 737-800's 84 in by landing weight" }),
  noseGearOleoIn:  over("noseGearOleoIn", { value: 28, status: "assumed", source: "As the main gear" }),
  emptyMarginFraction: over("emptyMarginFraction", { value: 0, status: "assumed", source: "No margin" }),
  paintPerArea:    over("paintPerArea", {}),
  hydraulicPressure: over("hydraulicPressure", {}),
});

/* Every jet-transport input, with the business-jet values where given. */
const merged = { ...TRANSPORT_INPUTS, ...BIZJET_INPUTS };
export const BIZJET_ALL_INPUTS = Object.freeze(merged);

export const BIZJET_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.value])),
  /* The Latitude as an existing aircraft, for the analysis job. */
  analysisGrossLb: Math.round(13971 / KG),
  analysisWingAreaFt2: +(50.4 / (FT * FT)).toFixed(1),
  analysisThrustLbf: Math.round(26.27e3 / 4.4482216),
  analysisFuelLb: Math.round(5168.2 / KG),
});
