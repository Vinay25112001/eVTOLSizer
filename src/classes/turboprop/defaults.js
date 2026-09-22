/* =====================================================================
   TURBOPROP INPUT SET — a twin-turboprop regional airliner
   =====================================================================
   Sized by payload, range, cruise Mach and field lengths, as the jet
   transport is, but on power rather than thrust (Scholz & Nita 2008).
   Defaults describe the ATR 72-600 and its redesign requirement in Scholz
   & Nita. Status as for the other classes:
     sourced  printed in the cited document
     derived  computed from sourced numbers (working in `source`)
     assumed  a stated judgement with no free source
   Documents: eVTOL_Sizing_Research/classes/transport/sources/ (and its
   turboprop/ folder); METHODS.md §9.
   ===================================================================== */

const SN = "Scholz & Nita 2008, Preliminary Sizing of Large Propeller Driven Aeroplanes";
const NITA = "Nita 2008, Aircraft Design Studies Based on ATR 72 (HAW Hamburg)";
const FACT = "ATR 72-600 factsheet (ATR, 2020)";
const PW = "EASA TCDS IM.E.041 (PW100 series), Issue 7";
const ANT = "Antcliff et al., AIAA 2016-1028 (NASA ATR 42-500 FLOPS model)";
const SCHOLZ = "Scholz, Aircraft Design lecture notes ch.5 (HAW Hamburg)";
const LB = 0.45359237, FT = 0.3048;
const r2 = (x) => Math.round(x * 100) / 100;

export const TURBOPROP_INPUTS = Object.freeze({
  /* Mission */
  passengers:      { value: 70, unit: "", min: 10, max: 120, section: "Mission", label: "Passengers", status: "sourced", source: `${NITA} p.47 (70 seats); ${FACT}: 72 seats` },
  massPerPassenger:{ value: 165, unit: "lb", min: 150, max: 230, section: "Mission", label: "Mass per passenger", status: "sourced", source: "FLOPS, NASA/TM-2017-219627 Eq 128 default" },
  baggagePerPassenger: { value: 35, unit: "lb", min: 0, max: 60, section: "Mission", label: "Baggage per passenger", status: "sourced", source: "FLOPS Eq 129-130: 35 lb up to 900 nm" },
  cargo:           { value: 242, unit: "lb", min: 0, max: 20000, section: "Mission", label: "Cargo", status: "derived", source: `Makes the payload ${SN}'s 6,460 kg: 6,460 kg = 14,242 lb, less 70 × 200 lb` },
  designRange:     { value: 715, unit: "nm", min: 100, max: 3000, section: "Mission", label: "Design range", status: "sourced", source: `${SN} p.17 (ATR 72 redesign requirement); ${FACT}: 758 nm with maximum passengers` },
  cruiseMach:      { value: 0.41, unit: "", min: 0.25, max: 0.65, section: "Mission", label: "Cruise Mach number", status: "sourced", source: `${SN} p.16` },
  maxAltitudeFt:   { value: 25000, unit: "ft", min: 5000, max: 35000, section: "Mission", label: "Highest cruise altitude", status: "sourced", source: "EASA TCDS A.084 (ATR 72) §11: maximum operating altitude 7,620 m (25,000 ft)" },
  maxMach:         { value: 0.44, unit: "", min: 0.3, max: 0.7, section: "Mission", label: "Maximum operating Mach (FLOPS VMAX)", status: "derived", source: `${FACT}: maximum cruise 275 KTAS at the optimum level; at FL170 (ISA) that is Mach 0.44. The TCDS refers airspeed limits to the flight manual` },
  fuelMethod:      { value: "breguet", unit: "", options: ["breguet", "roskam"], section: "Mission", label: "Mission fuel method", status: "sourced", source: "breguet: propeller Breguet cruise, alternate and hold with no taxi or climb allowance (Scholz 5.54-5.55; Loftin RP-1060 p.152 treatment). roskam: adds Roskam's turboprop segment fractions as quoted by Nita 2008 Table 3.5" },
  alternateNm:     { value: 87, unit: "nm", min: 0, max: 300, section: "Mission", label: "Distance to alternate", status: "sourced", source: `${ANT}: 87 nm alternate for the ATR 42 study. ${SN} p.16: shorter than the 200 nm usual for jets; ${NITA} used 200 nm` },
  reserveMin:      { value: 45, unit: "min", min: 0, max: 90, section: "Mission", label: "Final reserve at cruise consumption", status: "sourced", source: '14 CFR 121.639(c): "to fly for 45 minutes at normal cruising fuel consumption"; Scholz & Nita p.16: "Reserve loiter time is 45 minutes"' },

  /* Field and climb requirements */
  landingFieldLengthM: { value: 1067, unit: "m", min: 600, max: 2500, section: "Requirements", label: "Landing field length", status: "sourced", source: `${SN} p.16` },
  takeoffFieldLengthM: { value: 1290, unit: "m", min: 600, max: 2500, section: "Requirements", label: "Take-off field length", status: "sourced", source: `${SN} p.16; ${FACT}: 1,279 m at MTOW, ISA, sea level` },
  landingToTakeoffMass: { value: 0.98, unit: "", min: 0.85, max: 1.0, section: "Requirements", label: "Maximum landing / take-off mass", status: "derived", source: `EASA TCDS A.084 / ${FACT}: 22,350 / 22,800 kg = 0.980. ${SN} p.9: 0.95-1.00, 0.97 on average` },
  clMaxLanding:    { value: 2.5, unit: "", min: 1.6, max: 3.2, section: "Requirements", label: "CLmax, landing", status: "sourced", source: `${SN} Table 2; ${SCHOLZ} Table 5.1: 1.6-2.5 for twin propeller aircraft` },
  clMaxTakeoff:    { value: 2.1, unit: "", min: 1.4, max: 2.6, section: "Requirements", label: "CLmax, take-off", status: "sourced", source: `${SN} Table 2; ${SCHOLZ} Table 5.1: 1.4-2.0` },
  numEngines:      { value: 2, unit: "", min: 2, max: 4, section: "Requirements", label: "Engines (on the wing)", status: "sourced", source: FACT },

  /* Wing */
  wingAspectRatio: { value: 12, unit: "", min: 7, max: 16, section: "Wing", label: "Aspect ratio", status: "sourced", source: `${NITA} p.66: 27.32²/62.237 = 11.99 ≈ 12; ${FACT}: 27.05² / 61 = 12.0` },
  wingSweep:       { value: 0, unit: "deg", min: 0, max: 20, section: "Wing", label: "Quarter-chord sweep", status: "assumed", source: "Straight wing, as NASA Aviary's GASP turboprop model (sweep 0); ATR's sweep is not in the fetched documents" },
  wingTaper:       { value: 0.52, unit: "", min: 0.2, max: 1, section: "Wing", label: "Taper ratio", status: "assumed", source: "NASA Aviary large_turboprop_freighter_GASP deck (a C-130-like aircraft); no ATR value in the fetched documents" },
  wingTc:          { value: 0.15, unit: "", min: 0.1, max: 0.2, section: "Wing", label: "Thickness ratio (mean)", status: "assumed", source: "Mean of the Aviary turboprop deck's 0.18 root and 0.12 tip" },
  wingFuelFraction:{ value: 0.584, unit: "", min: 0.2, max: 0.95, section: "Wing", label: "Wing volume usable for fuel", status: "derived", source: `Makes the wing hold ATR's 5,000 kg usable fuel (EASA TCDS A.084) at 61 m², A 12, t/c 0.15, taper 0.52 with FLOPS Eq 133` },
  htAreaRatio:     { value: 0.2, unit: "", min: 0.1, max: 0.4, section: "Wing", label: "Horizontal tail / wing area", status: "assumed", source: "No ATR or Dash 8 tail area in the fetched documents" },
  vtAreaRatio:     { value: 0.2, unit: "", min: 0.1, max: 0.4, section: "Wing", label: "Vertical tail / wing area", status: "assumed", source: "No ATR or Dash 8 tail area in the fetched documents" },

  /* Aerodynamics */
  oswaldCruise:    { value: 0.85, unit: "", min: 0.6, max: 0.95, section: "Aerodynamics", label: "Oswald factor, cruise", status: "derived", source: `${SN} Table 2: CL 0.503, E 12.49 against Emax 15.74 at A 12 give e 0.85` },
  /* Propulsion */
  sfcCruise:       { value: 0.5, unit: "lb/hp/h", min: 0.35, max: 0.8, section: "Propulsion", label: "Cruise power-specific fuel consumption", status: "sourced", source: `${SCHOLZ} Table 5.8 (after Raymer): turboprop cruise 0.5 lb/hp/h. ${NITA} p.46 reads 0.44 from a PW120 chart at 20,000 ft` },
  etaTakeoff:      { value: 0.64, unit: "", min: 0.4, max: 0.9, section: "Propulsion", label: "Propeller efficiency, take-off", status: "sourced", source: `${SN} Table 2 (read there from their Fig. 7); ${NITA} p.41: 0.645` },
  etaClimb:        { value: 0.73, unit: "", min: 0.5, max: 0.9, section: "Propulsion", label: "Propeller efficiency, climb segments", status: "sourced", source: `${SN} Table 2; ${NITA} p.41` },
  etaCruise:       { value: 0.86, unit: "", min: 0.6, max: 0.92, section: "Propulsion", label: "Propeller efficiency, cruise", status: "sourced", source: `${SN} Table 2; ${SCHOLZ} Table 5.8 gives 0.8` },
  powerLapse:      { value: "average", unit: "", options: ["average", "schaufele", "loftin"], section: "Propulsion", label: "Shaft-power lapse with altitude", status: "sourced", source: `${SN} Table 1, P/P0 = A M^m σ^n: "average" is the recommended fit (1.371, 0.273, 0.885); Schaufele (1.036, 0.101, 0.851) and Loftin (1.089, 0.091, 0.924) are rows of the same table` },
  engineSpecificWeight: { value: 0.386, unit: "lb/shp", min: 0.2, max: 0.7, section: "Propulsion", label: "Engine dry weight per take-off shp", status: "derived", source: `${PW} p.9-10: PW127M 481.7 kg dry, 2,051 kW maximum take-off = 1,062 lb / 2,750 shp. GASP (NASA CR-152303 Vol V, V.1.3) default 0.5 lb/hp` },
  engineSectionFactor: { value: 0.338, unit: "", min: 0, max: 0.8, section: "Propulsion", label: "Engine section (nacelle, pylon) / engine weight", status: "sourced", source: 'GASP, NASA CR-152303 Vol V, V.1.56: "SK_PES is input as .338, typically"' },
  propellerType:   { value: 5, unit: "", options: [1, 2, 3, 4, 5], section: "Propulsion", label: "Propeller type (CR-114399 Table II)", status: "sourced", source: "NASA CR-114399 Table II: type (5), fibreglass, double-acting, feathering, reversing, is the 1980-technology class V propeller; the 568F has composite blades" },
  propellerBlades: { value: 6, unit: "", min: 2, max: 8, section: "Propulsion", label: "Propeller blades", status: "sourced", source: `${FACT}: 568F, 6 blades, 3.93 m` },
  propellerDiameterFt: { value: 12.9, unit: "ft", min: 6, max: 20, section: "Propulsion", label: "Propeller diameter", status: "sourced", source: `${FACT}: 3.93 m (12.9 ft)` },
  activityFactor:  { value: 120, unit: "", min: 80, max: 200, section: "Propulsion", label: "Blade activity factor", status: "assumed", source: "Not published for the 568F. NASA CR-114399 Table III lists 110-133 for 1970 transport propellers (DHC-7 116)" },
  propellerRpm:    { value: 1212, unit: "rpm", min: 800, max: 3000, section: "Propulsion", label: "Propeller take-off rpm", status: "sourced", source: `${PW} p.13: PW127 maximum output shaft speed 1,212 rpm` },
  thrustPerShp:    { value: 3.5, unit: "lbf/shp", min: 2, max: 5, section: "Propulsion", label: "Static thrust per shp (for FLOPS's thrust-based items)", status: "derived", source: `${ANT} Table 4: FLOPS model thrust 8,400 lb per 2,400 shp engine` },
  nacelleDiameterFt: { value: 3.3, unit: "ft", min: 2, max: 6, section: "Propulsion", label: "Nacelle diameter", status: "sourced", source: `${ANT} p.6 (ATR 42-class 2,400 shp engine)` },
  nacelleLengthFt: { value: 7.0, unit: "ft", min: 3, max: 15, section: "Propulsion", label: "Nacelle (pod) length", status: "sourced", source: `${ANT} Table 3` },
  fuelDensity:     { value: 6.7, unit: "lb/US gal", min: 6.0, max: 7.0, section: "Propulsion", label: "Fuel density", status: "sourced", source: "Boeing D6-58325-6 p.27 convention (6,875 US gal = 46,063 lb); as the jet class" },
  fuelTanks:       { value: 2, unit: "", min: 1, max: 10, section: "Propulsion", label: "Fuel tanks", status: "assumed", source: "One integral tank per wing" },

  /* Fuselage */
  fuselageLength:  { value: r2(27.166 / FT), unit: "ft", min: 40, max: 150, section: "Fuselage", label: "Fuselage length", status: "derived", source: `${FACT} p.1: overall length 27.166 m (the fuselage length is not dimensioned)` },
  fuselageWidth:   { value: r2(1.06 * 2.57 / FT), unit: "ft", min: 6, max: 14, section: "Fuselage", label: "Fuselage width", status: "derived", source: `FLOPS Eq 210 (WF = 1.06 × cabin width) on the 2.57 m cabin width of ${FACT} p.1` },
  fuselageHeight:  { value: r2(1.06 * 2.57 / FT + 0.9), unit: "ft", min: 6, max: 15, section: "Fuselage", label: "Fuselage depth", status: "derived", source: "FLOPS Eq 213: DF = WF + 0.9 ft" },
  passengerCompartmentLength: { value: 54.4, unit: "ft", min: 15, max: 120, section: "Fuselage", label: "Passenger compartment length", status: "derived", source: "FLOPS Eq 201-205: 18 rows × 29 in (factsheet layout) = 43.5 ft, + 2 × 3 ft galley and lavatory, + 1.66 doors × 2.96 ft" },

  /* Crew and structure */
  flightCrew:      { value: 2, unit: "", min: 2, max: 3, section: "Crew and structure", label: "Flight crew", status: "sourced", source: "EASA TCDS A.084" },
  flightAttendants:{ value: 2, unit: "", min: 0, max: 6, section: "Crew and structure", label: "Flight attendants", status: "sourced", source: "FLOPS Eq 116 as NASA Aviary applies it: 70 // 40 + 1 = 2 (the TM's ceiling form gives 3; METHODS.md §5.9)" },
  galleyCrew:      { value: 0, unit: "", min: 0, max: 3, section: "Crew and structure", label: "Galley crew", status: "sourced", source: "FLOPS Eq 117: none below 151 passengers" },
  ultimateLoadFactor: { value: 3.75, unit: "g", min: 3.75, max: 6, section: "Crew and structure", label: "Ultimate load factor", status: "sourced", source: "14 CFR 25.337(b): 2.1 + 24,000/(W + 10,000) = 2.50 at 50,265 lb, × 1.5" },
  mainGearOleoIn:  { value: r2(0.75 * 27.166 / FT), unit: "in", min: 20, max: 120, section: "Crew and structure", label: "Main gear oleo length", status: "derived", source: "FLOPS Eq 66 as NASA Aviary geometry/flops_based/landing_gear.py applies it without wing-mounted gear: 0.75 × fuselage length" },
  noseGearOleoIn:  { value: r2(0.7 * 0.75 * 27.166 / FT), unit: "in", min: 10, max: 100, section: "Crew and structure", label: "Nose gear oleo length", status: "derived", source: "FLOPS Eq 67: 0.7 × main gear" },
  emptyMarginFraction: { value: 0, unit: "", min: 0, max: 0.1, section: "Crew and structure", label: "Empty-weight margin", status: "assumed", source: "None" },
  paintPerArea:    { value: 0.07, unit: "lb/ft²", min: 0, max: 0.2, section: "Crew and structure", label: "Paint per wetted area", status: "sourced", source: "NASA Aviary large_single_aisle_2 FLOPS deck; as the jet class" },
  apuMassLb:       { value: 0, unit: "lb", min: 0, max: 1500, section: "Crew and structure", label: "APU mass (0 = none)", status: "assumed", source: "The ATR 72 has no APU as standard (it uses a propeller brake, \"hotel mode\"); stated only in secondary sources, not in the fetched ATR documents. The Dash 8-400 airport planning manual p.3 lists a 139 lb (63 kg) APU. FLOPS Eq 101 would give about 650 lb" },
  cargoContainers: { value: false, unit: "", section: "Crew and structure", label: "Containerised cargo (FLOPS Eq 125-126)", status: "derived", source: "Off: bulk-loaded baggage compartments, as drawn in the ATR 72-600 factsheet layout and the Dash 8-400 airport planning manual" },
  systemsFactor:   { value: 1, unit: "", min: 0.5, max: 1.3, section: "Crew and structure", label: "Systems and equipment factor (1 = FLOPS)", status: "derived", source: "Optional calibration, off at 1. FLOPS runs heavy on turboprops (fixed equipment +39 % against Pham's ATR 42 GASP split; Antcliff 2016 found the same). 0.858 makes the ATR 42-600 operating empty mass exact and then gives ATR 72-600 +9.7 % and Dash 8-400 -2.3 % (validation/turboprop.mjs). A fit on one aircraft, not a method" },
  hydraulicPressure: { value: 3000, unit: "psi", min: 1000, max: 5000, section: "Crew and structure", label: "Hydraulic pressure", status: "sourced", source: "FLOPS Eq 104 default" },
});

export const TURBOPROP_DEFAULTS = Object.freeze(
  Object.fromEntries(Object.entries(TURBOPROP_INPUTS).map(([k, v]) => [k, v.value])));

export const UNITS = Object.freeze({ LB, FT });
