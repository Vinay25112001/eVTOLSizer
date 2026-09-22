/* =====================================================================
   BUSINESS-JET VALIDATION CASES — published aircraft
   =====================================================================
   The three "tier A" business jets of
   eVTOL_Sizing_Research/classes/business-jet/METHODS.md §4: basic operating
   weight, wing area, thrust, fuel and a range with a stated payload are
   all published by the manufacturer or the regulator
   (datasets/business-jet/aircraft.csv, primary rows).

   Definition traps, stated rather than hidden:
   - BOW is the manufacturer's; Cessna does not state its crew content,
     Pilatus includes one pilot. The model's operating empty weight
     includes its flight crew, so the crew count is set to match.
   - The ranges are "theoretical" NBAA IFR ranges. NBAA's own definition
     is not public; the alternate distance each manufacturer uses is set
     per case where the document states it (Pilatus 100 nm) and left at
     200 nm otherwise.
   - No manufacturer publishes cruise TSFC; the values are secondary
     compilations for the same engine family, or assumed where none exists.
   ===================================================================== */

const KG = 0.45359237, FT = 0.3048, M2 = FT * FT, LBF = 4.4482216;

const aircraft = ({ mtow, wing, span, length, cabin, thrustKN, fuel, seats, carried, mach, alt, tsfc, bpr, crew = 2, alternateNm = 200, engineKg }) => ({
  grossLb: mtow / KG, wingAreaFt2: wing / M2, thrustEachLbf: thrustKN * 1e3 / LBF, fuelCapacityLb: fuel / KG,
  wingAspectRatio: span * span / wing, fuselageLength: length / FT * 0.93, fuselageWidth: (cabin + 0.24) / FT,
  firstClass: seats, passengersCarried: carried, cruiseMach: mach, cruiseAltFt: alt, tsfcCruise: tsfc, bypassRatio: bpr,
  flightCrew: crew, alternateNm, engineRefThrust: thrustKN * 1e3 / LBF, ...(engineKg ? { engineRefMass: engineKg / KG } : {}),
});

export const LATITUDE = aircraft({ mtow: 13971, wing: 50.4, span: 22.04, length: 18.98, cabin: 1.96, thrustKN: 26.28, fuel: 5168.2,
  seats: 9, carried: 4, mach: 0.78, alt: 43000, tsfc: 0.70, bpr: 4.5, engineKg: 524.4 });
export const LONGITUDE = aircraft({ mtow: 17917, wing: 49.91, span: 21.0, length: 22.3, cabin: 1.96, thrustKN: 34.1, fuel: 6580.95,
  seats: 12, carried: 4, mach: 0.80, alt: 43000, tsfc: 0.70, bpr: 4.2 });
/* PC-24 cabin width is not in the fetched documents (assumed 1.7 m); FJ44-4
   cruise TSFC and bypass ratio are not published, so the FJ44-1A's
   compiled values (0.75, 3.28; secondary) stand in. */
export const PC24 = aircraft({ mtow: 8500, wing: 30.91, span: 17.0, length: 16.8, cabin: 1.7, thrustKN: 15.21, fuel: 2705,
  seats: 6, carried: 6, mach: 0.72, alt: 45000, tsfc: 0.75, bpr: 3.28, crew: 1, alternateNm: 100, engineKg: 304 });

export const BIZJET_REAL_CASES = Object.freeze([
  { id: "lat-bow", name: "Citation Latitude basic operating weight", unit: "kg", actual: 8462, band: 0.15, inputs: LATITUDE,
    pick: (r) => r.operatingEmptyLb * KG,
    source: "Cessna Citation Latitude product card: BOW 8,462 kg (crew content not stated); EASA TCDS IM.A.033" },
  { id: "lat-range", name: "Citation Latitude range, 4 passengers", unit: "nm", actual: 2700, band: 0.25, inputs: LATITUDE,
    pick: (r) => r.rangeNm,
    source: "Cessna product card: 2,700 nm, 4 pax, high-speed cruise, NBAA IFR reserves" },
  { id: "lon-bow", name: "Citation Longitude basic operating weight", unit: "kg", actual: 10705, band: 0.15, inputs: LONGITUDE,
    pick: (r) => r.operatingEmptyLb * KG,
    source: "Cessna Citation Longitude product card: BOW 10,705 kg; HTF7700L 34.1 kN" },
  { id: "lon-range", name: "Citation Longitude range, 4 passengers", unit: "nm", actual: 3500, band: 0.25, inputs: LONGITUDE,
    pick: (r) => r.rangeNm,
    source: "Cessna product card: 3,500 nm, 4 pax, M 0.80, NBAA IFR reserves. HTF7700L cruise TSFC not published; 0.70 assumed" },
  { id: "pc24-bow", name: "Pilatus PC-24 basic operating weight (one pilot)", unit: "kg", actual: 5243, band: 0.18, inputs: PC24,
    pick: (r) => r.operatingEmptyLb * KG,
    source: "Pilatus PC-24 fact sheet: BOW 5,243 kg, executive 6-seat, including one pilot; FJ44-4A-QPM 15.21 kN, 304 kg (EASA TCDS IM.E.016)" },
  { id: "pc24-range", name: "Pilatus PC-24 range, 544 kg payload", unit: "nm", actual: 2000, band: 0.35, inputs: PC24,
    pick: (r) => r.rangeNm,
    source: "Pilatus: 2,000 nm with 6 passengers (544 kg), NBAA IFR, 100 nm alternate, LRC + 30 min. FJ44 cruise TSFC from the FJ44-1A (secondary)" },
]);

export const BIZJET_VALIDATED_DOMAIN = Object.freeze({
  mtowKg: [8500, 17917], seats: [6, 12], rangeNm: [2000, 3500], cruiseMach: [0.72, 0.80],
  note: "Three twin aft-engine business jets of 8,500-17,900 kg (Pilatus PC-24, Citation Latitude, Citation Longitude)",
});
