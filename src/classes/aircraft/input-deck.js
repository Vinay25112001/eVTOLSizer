/* =====================================================================
   INPUT DECK — how each aircraft type's inputs are laid out
   =====================================================================
   A type has 50-70 inputs. Shown as one column they are a wall; a
   designer reads them the way a preliminary-design input deck is written:
   the requirements first, then one discipline at a time, and only the
   inputs the chosen methods actually use.

     key     the handful of requirements that define the aircraft, always
             visible above the pages
     pages   one discipline each, split into small groups
     when    an input that only a method option uses is shown only when
             that option is chosen (the value is kept, not reset)

   Every input of a type appears exactly once (validation/aircraft-engine.mjs);
   anything a class adds later and this file does not name lands on an
   "Other" page rather than disappearing.
   ===================================================================== */

const isMission = (p) => p.fuelMethod === "mission";
const isLoftin = (p) => p.fuelMethod === "loftin";
const notLoftin = (p) => p.fuelMethod !== "loftin";
const isFlops = (p) => p.dragMethod === "flops";
const isCf = (p) => p.dragMethod !== "flops";
const byRatio = (p) => p.tailSizing !== "volume";
const byVolume = (p) => p.tailSizing === "volume";
const isFar25 = (p) => p.takeoffMethod === "far25";
const hasIca = (p) => p.icaRequirement !== "off";

const JET_WHEN = {
  reservePolicy: isMission, climbCasKt: isMission, descentCasKt: isMission, climbThrottle: isMission,
  taxiMin: isMission, takeoffFuelFraction: isMission, alternateAltFt: isMission, alternateMach: isMission,
  reserveIncrementNm: isLoftin, alternateNm: notLoftin, reserveMin: (p) => p.fuelMethod === "regulatory",
  airfoilTech: isFlops, wingCamber: isFlops, spanEfficiencyFlops: isFlops,
  cfEquivalent: isCf, oswaldCruise: isCf,
  htAreaRatio: byRatio, vtAreaRatio: byRatio, tailCategory: byVolume, tTail: byVolume,
  vrOverVs: isFar25, vlofOverVs: isFar25, v2OverVs: isFar25, clGroundRoll: isFar25,
  muRolling: isFar25, muBraking: isFar25, rotationTimeS: isFar25, recognitionTimeS: isFar25,
  brakeTransitionS: isFar25, brakedWeightFraction: isFar25,
  cruiseRatingFraction: (p) => p.thrustLapseMethod === "deck", fuselageFuelLb: (p) => p.fuelVolumeConstraint === true,
  icaResidualRocFpm: hasIca, buffetClLimit: hasIca,
  initialCruiseAltReqFt: (p) => p.icaRequirement === "explicit",
};

const jetDeck = (seatKeys, extraMission = []) => ({
  key: [...seatKeys, "designRange", "cruiseMach", "cruiseAltFt", "takeoffFieldLengthM", "landingFieldLengthM", "numEngines", "engineLocation"],
  pages: [
    { id: "mission", label: "Mission", groups: [
      { title: "Payload", keys: [...extraMission, "massPerPassenger", "baggagePerPassenger", "cargo"] },
      { title: "Cruise", keys: ["maxMach"] },
      { title: "Fuel method and reserves", keys: ["fuelMethod", "reservePolicy", "alternateNm", "alternateAltFt", "alternateMach", "reserveMin", "reserveIncrementNm"] },
    ] },
    { id: "profile", label: "Flight profile", groups: [
      { title: "Ground and take-off", keys: ["taxiMin", "takeoffFuelFraction"] },
      { title: "Climb and descent schedule", keys: ["climbCasKt", "descentCasKt", "climbThrottle"] },
    ] },
    { id: "field", label: "Field & climb", groups: [
      { title: "High lift", keys: ["clMaxTakeoff", "clMaxLanding"] },
      { title: "Take-off method", keys: ["takeoffMethod"] },
      { title: "Landing method", keys: ["landingMethod"] },
      { title: "Field condition", keys: ["fieldElevationFt", "fieldDeltaIsaC"] },
      { title: "Initial cruise altitude", keys: ["icaRequirement", "initialCruiseAltReqFt", "icaResidualRocFpm", "buffetClLimit"] },
      { title: "Loftin constants", keys: ["kLanding", "kTakeoff"] },
      { title: "Weights", keys: ["landingToTakeoffMass", "mzfwRatio"] },
    ] },
    { id: "landingrun", label: "Landing run", groups: [
      { title: "Touchdown", keys: ["vTouchdownOverVref", "landingSpoilers"] },
      { title: "Deceleration", keys: ["landingMuBraking", "landingFreeRollS"] },
    ] },
    { id: "takeoff", label: "Take-off run", groups: [
      { title: "Speed schedule (fractions of the stall speed)", keys: ["vrOverVs", "vlofOverVs", "v2OverVs"] },
      { title: "Ground", keys: ["clGroundRoll", "muRolling", "muBraking", "brakedWeightFraction"] },
      { title: "Times", keys: ["rotationTimeS", "recognitionTimeS", "brakeTransitionS"] },
    ] },
    { id: "wing", label: "Wing & tail", groups: [
      { title: "Wing planform", keys: ["wingAspectRatio", "wingSweep", "wingTaper", "wingTc"] },
      { title: "Wing structure and fuel", keys: ["wingCompositeFraction", "wingFuelFraction"] },
      { title: "Empennage", keys: ["tailSizing", "tailCategory", "tTail", "htAreaRatio", "vtAreaRatio"] },
    ] },
    { id: "aero", label: "Aerodynamics", groups: [
      { title: "Cruise drag", keys: ["dragMethod", "cfEquivalent", "oswaldCruise", "airfoilTech", "wingCamber", "spanEfficiencyFlops"] },
      { title: "Low speed (climb checks)", keys: ["cd0Clean", "oswaldFlaps"] },
    ] },
    { id: "propulsion", label: "Propulsion", groups: [
      { title: "Engine cycle", keys: ["tsfcCruise", "bypassRatio", "thrustLapseMethod", "cruiseRatingFraction"] },
      { title: "Fuel volume", keys: ["fuelVolumeConstraint", "fuselageFuelLb"] },
      { title: "Reference engine", keys: ["engineRefThrust", "engineRefMass", "engineMassExponent", "nacelleRefDiameter", "nacelleRefLength"] },
      { title: "Fuel", keys: ["fuelDensity", "fuelTanks"] },
    ] },
    { id: "fuselage", label: "Fuselage & cabin", groups: [
      { title: "Fuselage", keys: ["fuselageLength", "fuselageWidth", "fuselageHeight", "passengerCompartmentLength"] },
      { title: "Crew", keys: ["flightCrew", "flightAttendants", "galleyCrew"] },
    ] },
    { id: "structure", label: "Structure & systems", groups: [
      { title: "Loads", keys: ["loadFactorMethod", "ultimateLoadFactor"] },
      { title: "Landing gear", keys: ["mainGearOleoIn", "noseGearOleoIn"] },
      { title: "Systems and margins", keys: ["hydraulicPressure", "paintPerArea", "emptyMarginFraction"] },
    ] },
  ],
  when: JET_WHEN,
});

export const INPUT_DECKS = Object.freeze({
  transport: jetDeck(["firstClass", "businessClass", "economyClass"]),
  bizjet: jetDeck(["firstClass", "passengersCarried"], ["businessClass", "economyClass"]),
  turboprop: {
    key: ["passengers", "designRange", "cruiseMach", "maxAltitudeFt", "takeoffFieldLengthM", "landingFieldLengthM", "numEngines"],
    pages: [
      { id: "mission", label: "Mission", groups: [
        { title: "Payload", keys: ["massPerPassenger", "baggagePerPassenger", "cargo"] },
        { title: "Cruise", keys: ["maxMach"] },
        { title: "Fuel method and reserves", keys: ["fuelMethod", "alternateNm", "reserveMin"] },
      ] },
      { id: "field", label: "Field & climb", groups: [
        { title: "High lift", keys: ["clMaxTakeoff", "clMaxLanding"] },
        { title: "Weights", keys: ["landingToTakeoffMass"] },
      ] },
      { id: "wing", label: "Wing & tail", groups: [
        { title: "Wing", keys: ["wingAspectRatio", "wingSweep", "wingTaper", "wingTc", "wingFuelFraction"] },
        { title: "Empennage", keys: ["htAreaRatio", "vtAreaRatio"] },
      ] },
      { id: "aero", label: "Aerodynamics", groups: [
        { title: "Cruise", keys: ["oswaldCruise"] },
      ] },
      { id: "propulsion", label: "Propulsion", groups: [
        { title: "Engine", keys: ["sfcCruise", "powerLapse", "engineSpecificWeight", "engineSectionFactor", "nacelleDiameterFt", "nacelleLengthFt"] },
        { title: "Propeller", keys: ["propellerType", "propellerBlades", "propellerDiameterFt", "activityFactor", "propellerRpm", "thrustPerShp"] },
        { title: "Propeller efficiency", keys: ["etaTakeoff", "etaClimb", "etaCruise"] },
        { title: "Fuel", keys: ["fuelDensity", "fuelTanks"] },
      ] },
      { id: "fuselage", label: "Fuselage & cabin", groups: [
        { title: "Fuselage", keys: ["fuselageLength", "fuselageWidth", "fuselageHeight", "passengerCompartmentLength"] },
        { title: "Crew", keys: ["flightCrew", "flightAttendants", "galleyCrew"] },
      ] },
      { id: "structure", label: "Structure & systems", groups: [
        { title: "Loads and gear", keys: ["ultimateLoadFactor", "mainGearOleoIn", "noseGearOleoIn"] },
        { title: "Systems", keys: ["apuMassLb", "cargoContainers", "hydraulicPressure", "paintPerArea"] },
        { title: "Calibration and margins", keys: ["systemsFactor", "emptyMarginFraction"] },
      ] },
    ],
    when: {},
  },
  trainer: {
    key: ["pax", "rangeNm", "cruiseKt", "cruiseAltFt", "stallKt", "rocFpm", "category"],
    pages: [
      { id: "mission", label: "Mission", groups: [
        { title: "Payload", keys: ["massPerOccupantLb"] },
        { title: "Cruise and reserve", keys: ["cruisePowerFrac", "reserveMin", "allowanceGal"] },
        { title: "Structural speed", keys: ["vnoKt"] },
      ] },
      { id: "wing", label: "Wing & tail", groups: [
        { title: "Wing", keys: ["AR", "taper", "tcRoot", "strutFraction", "clMaxLanding"] },
        { title: "Tails", keys: ["htAR", "vtAR", "tailTaper", "tailTc"] },
      ] },
      { id: "aero", label: "Aerodynamics", groups: [
        { title: "Drag", keys: ["CD0", "e", "eClimb"] },
        { title: "Propeller efficiency", keys: ["etaCruise", "etaClimb"] },
      ] },
      { id: "propulsion", label: "Propulsion", groups: [
        { title: "Engine", keys: ["sfc", "engineLbPerHp", "engineSectionFrac", "oilLb"] },
        { title: "Propeller", keys: ["propKind", "propDiameterIn", "propBlades", "propActivityFactor", "propRpm"] },
        { title: "Fuel", keys: ["fuelDensityLbGal", "unusableFuelLb"] },
      ] },
      { id: "fuselage", label: "Fuselage", groups: [
        { title: "Fuselage", keys: ["fuselageLengthFt", "fuselageWidthFt", "fuselageDepthFt"] },
      ] },
      { id: "structure", label: "Weight factors", groups: [
        { title: "Structure (GASP trend factors)", keys: ["skWW", "skB", "skY", "skZ", "skLG", "fixedGear"] },
        { title: "Systems (GASP)", keys: ["skFW", "skCC", "skFS", "cwInstruments", "cwHydControls", "cwAirCond", "highLiftLb"] },
      ] },
    ],
    when: {},
  },
});

/* The deck for a type and an input set: every key placed once, with
   unplaced inputs collected on an "Other" page. */
export function deckFor(type, inputs) {
  const d = INPUT_DECKS[type];
  const placed = new Set([...d.key, ...d.pages.flatMap((p) => p.groups.flatMap((g) => g.keys))]);
  const rest = Object.keys(inputs).filter((k) => !placed.has(k));
  const pages = rest.length ? [...d.pages, { id: "other", label: "Other", groups: [{ title: "Other inputs", keys: rest }] }] : d.pages;
  return { key: d.key.filter((k) => k in inputs), pages: pages.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, keys: g.keys.filter((k) => k in inputs) })) })),
           when: d.when };
}

export const applies = (deck, key, params) => (deck.when[key] ? deck.when[key](params) : true);
