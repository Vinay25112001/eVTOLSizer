/* =====================================================================
   TRANSPORT VALIDATION CASES — one list, read by the gate and the screen
   =====================================================================
   Three kinds of check, kept apart because they prove different things:

   FLOPS_LSA2   NASA's FLOPS run for a 737-800 model (Aviary
                large_single_aisle_2 data, Apache-2.0): the port must give
                the same component weights. Implementation, not accuracy.
   REAL         published aircraft. Weights of the 737-800 are Boeing's
                (primary); the A320's empty weight and wing come from the
                Jenkinson companion tables (secondary, "from manufacturers
                sources").
   SIZING       a 737-800 sized from its own requirements. Many of its
                inputs (CLmax, tail ratios, geometry) come from the same
                FLOPS model, so this is a consistency check, not an
                independent prediction.
   Bands were set after the first measurement (2026-09-17): regression
   bands, not accuracy claims.
   ===================================================================== */

const KG = 0.45359237, FT2 = 0.09290304, LBF = 4.44822;

export const B738_ACAPS = Object.freeze({
  mtowLb: 174200, mlwLb: 146300, mzfwLb: 138300, oewLb: 91300, wingAreaFt2: 1341,
  thrustEachLbf: 27300, fuelCapacityLb: 46063,
  source: "Boeing D6-58325-6 p.27 (weights, OEW, fuel), §3.3.95 (CFM56-7B27 at 27,300 lb); wing area 124.6 m² (Jenkinson) = the FLOPS model's 1,341 ft²",
});

export const A320_INPUTS = Object.freeze({
  grossLb: 73500 / KG, wingAreaFt2: 122.4 / FT2, thrustEachLbf: 111.2e3 / LBF, fuelCapacityLb: 23860 * 0.785 / KG,
  wingAspectRatio: 33.91 ** 2 / 122.4,
  fuselageLength: 37.57 / 0.3048, fuselageWidth: 3.95 / 0.3048, fuselageHeight: 4.14 / 0.3048,
  passengerCompartmentLength: (37.57 / 0.3048) * 98.5 / 124.75,
  firstClass: 12, economyClass: 138, designRange: 2700,
  tsfcCruise: 0.596, bypassRatio: 6.0,   // CFM56-5A1 at M 0.80, 35,000 ft (Jenkinson Data B; the -5A3 is not listed)
});

export const TRANSPORT_REAL_CASES = Object.freeze([
  { id: "a320-oew", name: "Airbus A320-200 operating empty weight", unit: "kg", actual: 41310, band: 0.08,
    source: "Jenkinson Table 1 (secondary): OEW 41,310 kg at MTOW 73,500 kg, 122.4 m², span 33.91 m, CFM56-5A3 111.2 kN, 150 two-class seats; fuselage 37.57 × 3.95 × 4.14 m from Airbus AC A320 (primary). Seat split and cabin length assumed",
    inputs: A320_INPUTS, pick: (r) => r.operatingEmptyLb * KG },
  { id: "a320-range", name: "Airbus A320-200 range at MTOW", unit: "nm", actual: 2700, band: 0.10,
    source: "Jenkinson Table 1 (secondary): design range 2,700 nm",
    inputs: A320_INPUTS, pick: (r) => r.rangeNm },
  { id: "b738-oew", name: "Boeing 737-800 operating empty weight", unit: "lb", actual: 91300, band: 0.08,
    source: `${B738_ACAPS.source}. Boeing's OEW is a "baseline mixed class configuration"; the FLOPS model's cabin is 12 first + 150 economy`,
    inputs: { grossLb: 174200, wingAreaFt2: 1341, thrustEachLbf: 27301, fuelCapacityLb: 46063 },
    pick: (r) => r.operatingEmptyLb },
]);

export const B738_SIZING_TARGETS = Object.freeze([
  { key: "grossLb", label: "Maximum take-off weight", actual: 174200, unit: "lb", band: 0.05 },
  { key: "wingAreaFt2", label: "Wing area", actual: 1341, unit: "ft²", band: 0.05 },
  { key: "thrustEachLbf", label: "Thrust per engine", actual: 27300, unit: "lbf", band: 0.12 },
  { key: "operatingEmptyLb", label: "Operating empty weight", actual: 91300, unit: "lb", band: 0.10 },
  { key: "fuelCapacityLb", label: "Fuel capacity", actual: 46063, unit: "lb", band: 0.08 },
]);

export const TRANSPORT_VALIDATED_DOMAIN = Object.freeze({
  grossLb: [162000, 175000], passengers: [150, 162], rangeNm: [2700, 2960],
  note: "Two single-aisle twinjets (737-800, A320-200) of 162,000-175,000 lb",
});
