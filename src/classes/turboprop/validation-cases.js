/* =====================================================================
   TURBOPROP VALIDATION CASES — one list, read by the gate and the screen
   =====================================================================
   REAL     published aircraft, analysed at their certified gross weight,
            wing area and take-off power. Weights and power are the
            manufacturer's (ATR factsheets 2020, De Havilland Dash 8-400
            specification sheet and airport planning manual) and the
            engine type-certificate data sheets (EASA IM.E.041, IM.E.049).
   SIZING   the ATR 72 sized from the requirement Scholz & Nita 2008 used
            for their redesign (715 nm, 6,460 kg, 1,290 m / 1,067 m).
   Bands were set after the measurement of 2026-09-17 (FLOPS with the APU
   and container items switched to the aircraft, Breguet fuel): regression
   bands, not accuracy claims.
   ===================================================================== */

const KG = 0.45359237, FT2 = 0.09290304, HP = 745.69987, M = 0.3048;

export const ATR72 = Object.freeze({
  mtowKg: 22800, oewKg: 13010, wingAreaM2: 61, powerKw: 2051, fuelKg: 5000, maxPax: 72, rangeMaxPaxNm: 758,
  source: "ATR 72-600 factsheet (2020): MTOW 22,800 kg, OEW (tech. spec.) 13,010 kg, wing 61 m², 5,000 kg fuel, 72 seats, 758 nm with maximum passengers; EASA TCDS IM.E.041: PW127M 2,051 kW maximum take-off",
});

export const ATR72_INPUTS = Object.freeze({
  grossLb: 22800 / KG, wingAreaFt2: 61 / FT2, shpEach: 2051e3 / HP, fuelCapacityLb: 5000 / KG,
});

export const ATR42_INPUTS = Object.freeze({
  grossLb: 18600 / KG, wingAreaFt2: 54.5 / FT2, shpEach: 2400, fuelCapacityLb: 4500 / KG,
  passengers: 48, cargo: 0, designRange: 703, landingToTakeoffMass: 18300 / 18600,
  wingAspectRatio: 24.57 ** 2 / 54.5, fuselageLength: 22.67 / M,
  passengerCompartmentLength: 54.4 * 48 / 70,
  mainGearOleoIn: 0.75 * 22.67 / M, noseGearOleoIn: 0.7 * 0.75 * 22.67 / M,
});

export const Q400_INPUTS = Object.freeze({
  grossLb: 29574 / KG, wingAreaFt2: 63.1 / FT2, shpEach: 3781e3 / HP, fuelCapacityLb: 5318 / KG,
  engineSpecificWeight: (716.9 / KG) / (3781e3 / HP),
  apuMassLb: 139,
  passengers: 82, massPerPassenger: 225 * 0.8, baggagePerPassenger: 225 * 0.2, cargo: 0, designRange: 862,
  cruiseMach: 0.598, maxMach: 0.598, landingToTakeoffMass: 28123 / 29574,
  wingAspectRatio: 28.42 ** 2 / 63.1, propellerDiameterFt: 13.5, propellerRpm: 1020,
  fuselageLength: 31.04 / M, passengerCompartmentLength: 18.80 / M,
  mainGearOleoIn: 0.75 * 31.04 / M, noseGearOleoIn: 0.7 * 0.75 * 31.04 / M,
});

export const TURBOPROP_REAL_CASES = Object.freeze([
  { id: "atr72-oew", name: "ATR 72-600 operating empty weight", unit: "kg", actual: 13010, band: 0.18,
    source: ATR72.source, inputs: ATR72_INPUTS, pick: (r) => r.operatingEmptyLb * KG },
  { id: "atr42-oew", name: "ATR 42-600 operating empty weight", unit: "kg", actual: 11550, band: 0.08,
    source: "ATR 42-600 factsheet (2020): MTOW 18,600 kg, OEW (tech. spec.) 11,550 kg, wing 54.5 m², span 24.57 m, length 22.67 m, 48 seats, 2,400 shp (one engine), 4,500 kg fuel",
    inputs: ATR42_INPUTS, pick: (r) => r.operatingEmptyLb * KG },
  { id: "q400-oew", name: "Dash 8-400 operating empty weight", unit: "kg", actual: 17885, band: 0.05,
    source: "De Havilland Dash 8-400 specification sheet (2026): MTOW 29,574 kg, typical OEW 17,885 kg, 82 seats, 5,318 kg fuel, 360 kt at 25,000 ft; EASA TCDS IM.A.191: wing 63.1 m²; airport planning manual p.5: span 28.42 m, fuselage 31.04 m, cabin 18.80 m; EASA TCDS IM.E.049: PW150A 716.9 kg, 3,781 kW",
    inputs: Q400_INPUTS, pick: (r) => r.operatingEmptyLb * KG },
]);

export const ATR72_SIZING_TARGETS = Object.freeze([
  { label: "Maximum take-off mass", actual: 22800, unit: "kg", band: 0.15, pick: (s) => s.grossLb * KG },
  { label: "Wing area", actual: 61, unit: "m²", band: 0.15, pick: (s) => s.wingAreaFt2 * FT2 },
  { label: "Take-off power per engine", actual: 2051, unit: "kW", band: 0.15, pick: (s) => s.powerKwEach },
  { label: "Operating empty mass", actual: 13010, unit: "kg", band: 0.25, pick: (s) => s.operatingEmptyLb * KG },
]);

export const TURBOPROP_VALIDATED_DOMAIN = Object.freeze({
  grossKg: [18600, 29574], passengers: [48, 82], rangeNm: [700, 900],
  note: "Three twin-turboprop regional airliners (ATR 42-600, ATR 72-600, Dash 8-400) of 18.6-29.6 t",
});

/* Block fuel from the factsheets, against the model's trip fuel at the
   aircraft's own Breguet factor, landing at in-service OEW + maximum payload
   (the weights are not the ones being tested here). */
export const TURBOPROP_BLOCK_FUEL = Object.freeze([
  { id: "atr72-200", name: "ATR 72-600 block fuel, 200 nm", actual: 638, rangeNm: 200, landingKg: 13450 + 7550, inputs: ATR72_INPUTS, band: 0.15,
    source: "ATR 72-600 factsheet (2020): 200 nm block fuel 638 kg; typical in-service OEW 13,450 kg, maximum payload 7,550 kg" },
  { id: "atr72-300", name: "ATR 72-600 block fuel, 300 nm", actual: 879, rangeNm: 300, landingKg: 13450 + 7550, inputs: ATR72_INPUTS, band: 0.15,
    source: "ATR 72-600 factsheet (2020): 300 nm block fuel 879 kg" },
  { id: "atr42-200", name: "ATR 42-600 block fuel, 200 nm", actual: 584, rangeNm: 200, landingKg: 11700 + 5300, inputs: ATR42_INPUTS, band: 0.20,
    source: "ATR 42-600 factsheet (2020): 200 nm block fuel 584 kg; typical in-service OEW 11,700 kg, maximum payload 5,300 kg" },
  { id: "atr42-300", name: "ATR 42-600 block fuel, 300 nm", actual: 802, rangeNm: 300, landingKg: 11700 + 5300, inputs: ATR42_INPUTS, band: 0.20,
    source: "ATR 42-600 factsheet (2020): 300 nm block fuel 802 kg" },
  { id: "q400-200", name: "Dash 8-400 trip fuel, 200 nm", actual: 696, rangeNm: 200, landingKg: 17885 + 82 * 102, inputs: Q400_INPUTS, band: 0.20,
    source: "Dash 8-400 specification sheet (2026): 200 nm trip fuel 696 kg; typical OEW 17,885 kg, 82 passengers at 102 kg" },
  { id: "q400-500", name: "Dash 8-400 trip fuel, 500 nm", actual: 1478, rangeNm: 500, landingKg: 17885 + 82 * 102, inputs: Q400_INPUTS, band: 0.45,
    source: "Dash 8-400 specification sheet (2026): 500 nm trip fuel 1,478 kg" },
]);
