/* =====================================================================
   WHOLE-VEHICLE MULTIROTOR TRUTH SET - published, with two audits
   =====================================================================
   GENERATED FILE. Do not hand-edit. Regenerate with
   eVTOL_Sizing_Research/datasets/drone/gen_vehicles.py.

   These are the aircraft a sizing loop is ultimately answerable to.
   Every figure is read off a manufacturer page or brochure fetched into
   the literature archive; nothing is recalled. A field the vendor does
   not publish is null, and null means the vendor does not publish it.

   ── AUDIT 1: THE VOLTAGE FIELD IS NOT ALWAYS THE NOMINAL ───────────
   Energy is capacity times the MEAN DISCHARGE voltage. Vendors
   sometimes print the CHARGED voltage in the same field, and the two
   differ by about 14 % on a LiPo. Every pack here is therefore checked:
   does Ah x V_printed reproduce the published Wh?

     NO dji-tb60                +14.37 %   4.40 V/cell printed
     OK dji-tb65                 -0.00 %   3.73 V/cell printed
     OK dji-mavic3               +0.00 %   3.85 V/cell printed
     OK dji-p4p-v2               +0.03 %   3.80 V/cell printed
     OK dji-wb37                 +0.01 %   3.80 V/cell printed
     OK autel-abx41d             +0.00 %   3.69 V/cell printed
     freefly-alta-x-pack    no published Wh - Ah x V is DERIVED

   DJI TB60 Intelligent Flight Battery: printed 52.8 V on
   12S is 4.40 V/cell - LiHV charged (4.35 V/cell).
   Ah x V gives 313.4 Wh against a published
   274 Wh, an over-prediction of 14.4 %. The
   published energy over the published capacity implies
   46.17 V (3.85 V/cell), which IS the
   nominal every other pack in this survey uses.

   READ THE PUBLISHED Wh. Where Ah x V disagrees with it, the voltage
   field is the fault, not the energy figure.

   ── AUDIT 2: HOVER AND CRUISE ENDURANCE ARE DIFFERENT QUANTITIES ───
   Implied power is the pack energy divided by the published endurance.
   It uses the FULL pack, which no vendor here states a usable fraction
   for, so it is an UPPER BOUND: an aircraft that cannot drain its pack
   to zero draws less than this.

   vehicle                     basis     W/kg
   Matrice 300 RTK            cruise     94.9
   Matrice 350 RTK            cruise     88.8
   Phantom 4 Pro V2           cruise    129.7
   EVO Max 4T V2               hover    132.9
   Mavic 3                     hover    129.1
   Mavic 3E                    hover    132.9
   Alta X                   unstated     86.9

   The three hover-basis aircraft cluster tightly at 129-133 W/kg. The
   two lowest figures belong to aircraft publishing no hover time at
   all, and a 'max flight time' with no hover figure beside it is a
   cruise-basis number - a multirotor spends less power in cruise than
   in hover, so pooling the two compares different quantities and
   flatters whichever model is scored against the mixture.

   BUT THE BASIS IS NOT THE WHOLE STORY, and the sample says so itself.
   The Phantom 4 Pro V2 is also cruise-basis and lands at 129.7 W/kg,
   inside the hover cluster. What the two low aircraft share with each
   other and not with it is SIZE: they are 6.3-6.5 kg on large, lightly
   loaded discs, where the others are 0.9-1.7 kg. Basis and disc loading
   are therefore CONFOUNDED here, and this sample cannot separate them.

   That is a reason to keep the sets apart rather than to rank them, and
   a reason not to read the 129-133 cluster as a law. Only vehicles with
   a PUBLISHED hover time may enter a hover-endurance gate - not because
   the others are wrong, but because what they measured is not stated.

   7 vehicles, 7 packs. Survey 2026-09-21. Generated 2026-09-21
   ===================================================================== */

export const VEHICLES_META = Object.freeze({
  title: "Whole-vehicle multirotor truth set - published specifications",
  surveyDate: "2026-09-21",
  provenanceRule: "Every numeric field traces to a manufacturer page or paper fetched into the archive at C:\\Users\\w451vxs\\Archives\\drone-literature-20260921\\propulsion-data\\vehicles\\ and recorded in VEHICLES.md with its HTTP status and byte count. A field absent from the source is null, and null means 'the manufacturer does not publish this', not 'we did not look'. Anything computed rather than read is named in a *_derived field and never written into a published field.",
  enduranceBasisRule: "Hover endurance and cruise/'max flight' endurance are DIFFERENT QUANTITIES and must never be pooled. Implied hover power clusters at 129-133 W/kg for the small quads and 89-95 W/kg for the M300/M350 - and those two are precisely the ones publishing no hover figure at all, so their 'max flight time' is a cruise-basis number. Only vehicles with a PUBLISHED hover time may enter a hover-endurance gate.",
  voltageFieldRule: "The voltage a manufacturer prints beside a capacity is not always the one that multiplies it to give the published energy. DJI's Mavic 3 page prints BOTH 'Voltage 15.4 V' (3.85 V/cell on 4S) and 'Charging Voltage Limit 17.6 V' (4.40 V/cell). The TB60 prints 'Voltage 52.8 V', which on 12S is 4.40 V/cell - the charging limit in the nominal field. Its published 274 Wh over 5.935 Ah gives 46.17 V, i.e. 3.85 V/cell, matching every other DJI pack. Read the published Wh; where Ah x V disagrees with it, the voltage field is the fault.",
  tolerancePct: 2,
  nominalPerCellBand: Object.freeze([3.6, 3.95]),
});

export const VEHICLE_BATTERIES = Object.freeze([
  Object.freeze({
    id: "dji-tb60", manufacturer: "DJI", model: "TB60 Intelligent Flight Battery",
    usedOn: "Matrice 300 RTK",
    capacityMah: 5935, voltagePrintedV: 52.8,
    voltagePrintedLabel: "Voltage",
    chargingVoltageLimitV: null,
    peakVoltageV: null,
    energyWhPublished: 274,
    chemistry: "LiPo 12S", cellsSeries: 12,
    massG: 1350, packsPerAircraft: 2,
    audit: Object.freeze({
      ahTimesVprintedWh: 313.368,
      errorPct: 14.3679,
      consistent: false,
      perCellPrintedV: 4.4,
      impliedNominalV: 46.1668,
      perCellImpliedV: 3.8472,
      printedFieldLooksLike: "LiHV charged (4.35 V/cell)",
    }),
    voltageFieldIsNominal: false,
    voltageFieldFinding: "52.8 V on 12S is 4.40 V/cell, which is DJI's own charging voltage limit per cell (the Mavic 3 page prints 'Charging Voltage Limit 17.6 V' = 4.40 V/cell on 4S), not a nominal. Capacity x this voltage gives 313.4 Wh against the published 274 Wh, an over-prediction of 14.4 %. The published energy over the published capacity gives 46.17 V = 3.85 V/cell, which is the nominal every other DJI pack in this survey uses.",
    energyWhNote: null,
    sourceUrl: "https://www.dji.com/support/product/matrice-300", archivedAs: "dji_matrice_300_rtk_support.specs.txt",
  }),
  Object.freeze({
    id: "dji-tb65", manufacturer: "DJI", model: "TB65 Intelligent Flight Battery",
    usedOn: "Matrice 350 RTK",
    capacityMah: 5880, voltagePrintedV: 44.76,
    voltagePrintedLabel: "Voltage",
    chargingVoltageLimitV: null,
    peakVoltageV: null,
    energyWhPublished: 263.2,
    chemistry: "Li-ion", cellsSeries: 12,
    massG: 1350, packsPerAircraft: 2,
    audit: Object.freeze({
      ahTimesVprintedWh: 263.1888,
      errorPct: -0.0043,
      consistent: true,
      perCellPrintedV: 3.73,
      impliedNominalV: 44.7619,
      perCellImpliedV: 3.7302,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: null,
    energyWhNote: null,
    sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs", archivedAs: "dji_matrice_350_rtk_specs.specs.txt",
  }),
  Object.freeze({
    id: "dji-mavic3", manufacturer: "DJI", model: "Mavic 3 Series Intelligent Flight Battery",
    usedOn: "Mavic 3, Mavic 3 Enterprise",
    capacityMah: 5000, voltagePrintedV: 15.4,
    voltagePrintedLabel: "Voltage",
    chargingVoltageLimitV: 17.6,
    peakVoltageV: null,
    energyWhPublished: 77,
    chemistry: "LiCoO2 4S", cellsSeries: 4,
    massG: 335.5, packsPerAircraft: 1,
    audit: Object.freeze({
      ahTimesVprintedWh: 77,
      errorPct: 0,
      consistent: true,
      perCellPrintedV: 3.85,
      impliedNominalV: 15.4,
      perCellImpliedV: 3.85,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: "This page is the one that makes the TB60 diagnosable: it prints the nominal and the charging limit as SEPARATE fields, 15.4 V and 17.6 V, i.e. 3.85 and 4.40 V/cell.",
    energyWhNote: null,
    sourceUrl: "https://www.dji.com/support/product/mavic-3", archivedAs: "dji_mavic3_support.specs.txt",
  }),
  Object.freeze({
    id: "dji-p4p-v2", manufacturer: "DJI", model: "Phantom 4 Pro V2 Intelligent Flight Battery",
    usedOn: "Phantom 4 Pro V2",
    capacityMah: 5870, voltagePrintedV: 15.2,
    voltagePrintedLabel: "Voltage",
    chargingVoltageLimitV: null,
    peakVoltageV: null,
    energyWhPublished: 89.2,
    chemistry: "LiPo 4S", cellsSeries: 4,
    massG: 468, packsPerAircraft: 1,
    audit: Object.freeze({
      ahTimesVprintedWh: 89.224,
      errorPct: 0.0269,
      consistent: true,
      perCellPrintedV: 3.8,
      impliedNominalV: 15.1959,
      perCellImpliedV: 3.799,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: null,
    energyWhNote: null,
    sourceUrl: "https://www.dji.com/support/product/phantom-4-pro-v2", archivedAs: "dji_phantom4prov2_support.specs.txt",
  }),
  Object.freeze({
    id: "dji-wb37", manufacturer: "DJI", model: "WB37 Intelligent Battery",
    usedOn: "Matrice 300/350 remote controller",
    capacityMah: 4920, voltagePrintedV: 7.6,
    voltagePrintedLabel: "Voltage",
    chargingVoltageLimitV: null,
    peakVoltageV: null,
    energyWhPublished: 37.39,
    chemistry: "LiCoO2", cellsSeries: 2,
    massG: null, packsPerAircraft: null,
    audit: Object.freeze({
      ahTimesVprintedWh: 37.392,
      errorPct: 0.0053,
      consistent: true,
      perCellPrintedV: 3.8,
      impliedNominalV: 7.5996,
      perCellImpliedV: 3.7998,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: null,
    energyWhNote: null,
    sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs", archivedAs: "dji_matrice_350_rtk_specs.specs.txt",
  }),
  Object.freeze({
    id: "autel-abx41d", manufacturer: "Autel Robotics", model: "ABX41-D",
    usedOn: "EVO Max 4T V2",
    capacityMah: 9248, voltagePrintedV: 14.76,
    voltagePrintedLabel: "DC 14.76 V",
    chargingVoltageLimitV: null,
    peakVoltageV: null,
    energyWhPublished: 136.5,
    chemistry: "Li-Po 4S", cellsSeries: 4,
    massG: 530, packsPerAircraft: 1,
    audit: Object.freeze({
      ahTimesVprintedWh: 136.5005,
      errorPct: 0.0004,
      consistent: true,
      perCellPrintedV: 3.69,
      impliedNominalV: 14.7599,
      perCellImpliedV: 3.69,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: null,
    energyWhNote: null,
    sourceUrl: "https://www.autelrobotics.com/productdetail/evo-max-4t/", archivedAs: "autel_evo_max_4t.text.txt",
  }),
  Object.freeze({
    id: "freefly-alta-x-pack", manufacturer: "Freefly Systems", model: "Alta X flight pack (2 x 16 Ah, 12S)",
    usedOn: "Alta X",
    capacityMah: 16000, voltagePrintedV: 44.4,
    voltagePrintedLabel: "NOMINAL BATTERY VOLTAGE",
    chargingVoltageLimitV: null,
    peakVoltageV: 50.4,
    energyWhPublished: null,
    chemistry: "LiPo 12S", cellsSeries: 12,
    massG: null, packsPerAircraft: 2,
    audit: Object.freeze({
      ahTimesVprintedWh: 710.4,
      errorPct: null,
      consistent: null,
      perCellPrintedV: 3.7,
      impliedNominalV: null,
      perCellImpliedV: null,
      printedFieldLooksLike: "nominal",
    }),
    voltageFieldIsNominal: true,
    voltageFieldFinding: null,
    energyWhNote: "Freefly publishes no energy figure. 44.4 V on 12S is 3.70 V/cell (the LiPo nominal) and the separately printed peak 50.4 V is 4.20 V/cell, so the nominal field IS a nominal and Ah x V is the right arithmetic here - but the result is DERIVED and must be labelled so.",
    sourceUrl: "http://freefly-prod.s3.amazonaws.com/support/alta-x-brochure.pdf", archivedAs: "freefly_alta_x_brochure.txt",
  }),
]);

export const VEHICLES = Object.freeze([
  Object.freeze({
    id: "dji-mavic-3", manufacturer: "DJI", model: "Mavic 3",
    rotors: null, rotorsNote: "NOT STATED on the page. Not recorded by inference.",
    takeoffMassG: 895,
    takeoffMassWording: "Takeoff Weight: Mavic 3: 895 g",
    mtowG: null, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "dji-mavic3", packs: 1,
    packEnergyWh: 77, packEnergyIsDerived: false,
    hoverTimeMin: 40,
    hoverTimeWording: "Max Hovering Time (no wind) 40 minutes *",
    maxFlightTimeMin: 46,
    maxFlightTimeWording: null,
    enduranceBasis: "hover",
    enduranceUsedMin: 40,
    impliedPowerW: 115.5,
    impliedPowerWPerKg: 129.0503,
    motorKv: null, propeller: null,
    sourceUrl: "https://www.dji.com/support/product/mavic-3",
  }),
  Object.freeze({
    id: "dji-mavic-3e", manufacturer: "DJI", model: "Mavic 3E",
    rotors: null, rotorsNote: null,
    takeoffMassG: 915,
    takeoffMassWording: "Weight (with propellers, without accessories): DJI Mavic 3E: 915 g; note 1 states this includes the battery, propellers and a microSD card",
    mtowG: 1050, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "dji-mavic3", packs: 1,
    packEnergyWh: 77, packEnergyIsDerived: false,
    hoverTimeMin: 38,
    hoverTimeWording: "Max Hovering Time (no wind) 38 minutes - the hover line carries no footnote marker",
    maxFlightTimeMin: 45,
    maxFlightTimeWording: null,
    enduranceBasis: "hover",
    enduranceUsedMin: 38,
    impliedPowerW: 121.5789,
    impliedPowerWPerKg: 132.8732,
    motorKv: null, propeller: null,
    sourceUrl: "https://enterprise.dji.com/mavic-3-enterprise/specs",
  }),
  Object.freeze({
    id: "autel-evo-max-4t", manufacturer: "Autel Robotics", model: "EVO Max 4T V2",
    rotors: null, rotorsNote: null,
    takeoffMassG: 1665,
    takeoffMassWording: "EVO Max 4T V2 Weight 1665 g (smart battery, gimbal and propellers included)",
    mtowG: 1999, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "autel-abx41d", packs: 1,
    packEnergyWh: 136.5, packEnergyIsDerived: false,
    hoverTimeMin: 37,
    hoverTimeWording: "Max Hover Time* 37 minutes - separately footnoted",
    maxFlightTimeMin: 42,
    maxFlightTimeWording: null,
    enduranceBasis: "hover",
    enduranceUsedMin: 37,
    impliedPowerW: 221.3514,
    impliedPowerWPerKg: 132.9438,
    motorKv: null, propeller: null,
    sourceUrl: "https://www.autelrobotics.com/productdetail/evo-max-4t/",
  }),
  Object.freeze({
    id: "dji-matrice-300-rtk", manufacturer: "DJI", model: "Matrice 300 RTK",
    rotors: null, rotorsNote: null,
    takeoffMassG: 6300,
    takeoffMassWording: "Approx. 6.3 kg with two TB60 batteries, single downward gimbal",
    mtowG: 9000, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "dji-tb60", packs: 2,
    packEnergyWh: 548, packEnergyIsDerived: false,
    hoverTimeMin: null,
    hoverTimeWording: "NOT PUBLISHED",
    maxFlightTimeMin: 55,
    maxFlightTimeWording: "Max Flight Time '55 min' - no footnote, no qualifier, no test condition anywhere on the page",
    enduranceBasis: "cruise",
    enduranceUsedMin: 55,
    impliedPowerW: 597.8182,
    impliedPowerWPerKg: 94.8918,
    motorKv: null, propeller: null,
    sourceUrl: "https://www.dji.com/support/product/matrice-300",
  }),
  Object.freeze({
    id: "dji-matrice-350-rtk", manufacturer: "DJI", model: "Matrice 350 RTK",
    rotors: null, rotorsNote: null,
    takeoffMassG: 6470,
    takeoffMassWording: "Approx. 6.47 kg with two TB65 batteries, single downward gimbal",
    mtowG: 9200, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "dji-tb65", packs: 2,
    packEnergyWh: 526.4, packEnergyIsDerived: false,
    hoverTimeMin: null,
    hoverTimeWording: "NOT PUBLISHED",
    maxFlightTimeMin: 55,
    maxFlightTimeWording: null,
    enduranceBasis: "cruise",
    enduranceUsedMin: 55,
    impliedPowerW: 574.2545,
    impliedPowerWPerKg: 88.7565,
    motorKv: null, propeller: null,
    sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs",
  }),
  Object.freeze({
    id: "dji-phantom-4-pro-v2", manufacturer: "DJI", model: "Phantom 4 Pro V2",
    rotors: null, rotorsNote: null,
    takeoffMassG: 1375,
    takeoffMassWording: "Weight (Battery & Propellers Included) 1375 g",
    mtowG: null, emptyMassG: null,
    maxPayloadG: null,
    batteryId: "dji-p4p-v2", packs: 1,
    packEnergyWh: 89.2, packEnergyIsDerived: false,
    hoverTimeMin: null,
    hoverTimeWording: "NOT PUBLISHED",
    maxFlightTimeMin: 30,
    maxFlightTimeWording: "Approx. 30 minutes - no footnote, no qualifier",
    enduranceBasis: "cruise",
    enduranceUsedMin: 30,
    impliedPowerW: 178.4,
    impliedPowerWPerKg: 129.7455,
    motorKv: null, propeller: null,
    sourceUrl: "https://www.dji.com/support/product/phantom-4-pro-v2",
  }),
  Object.freeze({
    id: "freefly-alta-x", manufacturer: "Freefly Systems", model: "Alta X",
    rotors: 4, rotorsNote: "NUMBER OF MOTORS 4",
    takeoffMassG: 19630,
    takeoffMassWording: "payload table ready-to-fly total at zero payload 43.28 lb (DERIVED 19.63 kg)",
    mtowG: 34900, emptyMassG: 10400,
    maxPayloadG: 15900,
    batteryId: "freefly-alta-x-pack", packs: 2,
    packEnergyWh: 1420.8, packEnergyIsDerived: true,
    hoverTimeMin: null,
    hoverTimeWording: "The brochure does not say whether its flight-time table is hover or cruise, and states no battery cut-off criterion.",
    maxFlightTimeMin: 50,
    maxFlightTimeWording: null,
    enduranceBasis: "unstated",
    enduranceUsedMin: 50,
    impliedPowerW: 1704.96,
    impliedPowerWPerKg: 86.8548,
    payloadSweep: Object.freeze([
      Object.freeze({ payloadKg: 0, totalLb: 43.28, flightTimeMin: 50, thrustToWeight: 3.5 }),
      Object.freeze({ payloadKg: 2.3, totalLb: 48.28, flightTimeMin: 41.7, thrustToWeight: 3.1 }),
      Object.freeze({ payloadKg: 4.5, totalLb: 53.28, flightTimeMin: 33.3, thrustToWeight: 2.8 }),
      Object.freeze({ payloadKg: 6.8, totalLb: 58.28, flightTimeMin: 26.6, thrustToWeight: 2.6 }),
      Object.freeze({ payloadKg: 9.1, totalLb: 63.28, flightTimeMin: 22, thrustToWeight: 2.4 }),
      Object.freeze({ payloadKg: 11.3, totalLb: 68.28, flightTimeMin: 18, thrustToWeight: 2.2 }),
      Object.freeze({ payloadKg: 13.6, totalLb: 73.28, flightTimeMin: 12.5, thrustToWeight: 2 }),
      Object.freeze({ payloadKg: 15.9, totalLb: 78.28, flightTimeMin: 10.75, thrustToWeight: 1.9 }),
    ]),
    payloadSweepConditions: "BATTERIES: 2 x 16AH, ALTITUDE: SEA LEVEL",
    motorKv: 115, propeller: "Folding 840 x 230 mm (33 x 9 in)",
    sourceUrl: "http://freefly-prod.s3.amazonaws.com/support/alta-x-brochure.pdf",
  }),
]);

/* Vehicles whose HOVER time the manufacturer actually publishes. These
   are the only ones a hover-endurance gate may score against. */
export const HOVER_BASIS_VEHICLES = Object.freeze(
  VEHICLES.filter((v) => v.enduranceBasis === "hover"));

/* Vehicles quoting only a 'max flight time'. Kept, because their absence
   of a hover figure is itself the datum. */
export const CRUISE_BASIS_VEHICLES = Object.freeze(
  VEHICLES.filter((v) => v.enduranceBasis === "cruise"));

/* Packs whose printed voltage does not reproduce their printed energy. */
export const VOLTAGE_FIELD_ANOMALIES = Object.freeze(
  VEHICLE_BATTERIES.filter((b) => b.audit.consistent === false));

export function findVehicle(id) { return VEHICLES.find((v) => v.id === id) ?? null; }
export function findVehicleBattery(id) { return VEHICLE_BATTERIES.find((b) => b.id === id) ?? null; }
