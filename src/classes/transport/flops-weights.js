/* =====================================================================
   TRANSPORT WEIGHTS — FLOPS, as NASA's Aviary implements it
   =====================================================================
   The FLOPS transport weight build-up (Wells, Horvath & McCullers,
   NASA/TM-2017-219627), ported from the FLOPS-based mass and geometry code
   of NASA's OpenMDAO Aviary (Apache License 2.0, Copyright 2023 United
   States Government as represented by the NASA Administrator; commit
   e12742d, aviary/subsystems/mass/flops_based and
   geometry/flops_based). Aviary is used rather than the TM because the TM
   is misprinted in several places (Eq 4, 10, 31, 116-118, 162;
   eVTOL_Sizing_Research/classes/transport/METHODS.md §5.9) and Aviary was
   validated against FLOPS output. validation/transport.mjs checks this port
   against the FLOPS values in Aviary's large_single_aisle_2 data.

   Pounds, feet, feet², degrees. Conventional tube-and-wing transports only:
   no blended wing body, no canard, no fins, no alternate (§7) equations,
   no detailed wing. Turbofan engines, or a turboprop group supplied by the
   turboprop class (a.turboprop).
   ===================================================================== */

const DEG = Math.PI / 180;

/* distributed_prop.py */
export const engineCountFactor = (n) => (n > 4 ? 4 + 2 * Math.atan((n - 4) / 3) : n);
export const nacelleCountFactor = (n) => n + (n % 2) * 0.5;
const nacelleDiamFactor = (d, n) => (n > 4 ? 0.5 * d * Math.sqrt(n) : d);

/* ── GEOMETRY (geometry/flops_based) ─────────────────────────────────── */
export function flopsGeometry(a) {
  const refDiam = (a.fuselageWidth + a.fuselageHeight) / 2;
  const XDX = refDiam;
  const xmult = (tc) => 0.387 * tc + 2.0;
  const htSpan = Math.sqrt(a.htAspectRatio * a.htArea);
  const crthtb = htSpan > 0
    ? 2 * a.htArea / (htSpan * (1 + a.htTaper)) + ((htSpan / 2 - XDX / 4) / (htSpan / 2)) * (1 - a.htTaper) + a.htTaper
    : 0;
  const croot = 2 * (a.wingArea - (a.glove ?? 0)) / ((1 + a.wingTaper) * a.wingSpan);
  const crotm = ((a.wingSpan / 2 - XDX / 2) / (a.wingSpan / 2)) * (1 - a.wingTaper) + a.wingTaper;
  const crootb = croot * crotm;
  const vtSpan = Math.sqrt(a.vtArea * a.vtAspectRatio);
  const crotvt = vtSpan > 0 ? 2 * a.vtArea / (vtSpan * (1 + a.vtTaper)) : 1;
  const fusAdj = (c, tc) => 0.6730 * c * (tc * c);
  const wingWet = xmult(a.wingTc) * (a.wingArea - (XDX / 2) * (croot + crootb));
  const htWet = xmult(a.htTc) * a.htArea
              * (1 - (0.185 + a.numFuselageEngines * 0.063) * (1 - (a.htOnVtFraction ?? 0)));
  const vtWet = xmult(a.vtTc) * a.vtArea;
  const fusWet = Math.PI * refDiam ** 2 * (a.fuselageLength / refDiam - 1.7)
               - 2 * fusAdj(crootb, a.wingTc)
               - 2 * fusAdj(crthtb, a.htTc) * (1 - (a.htOnVtFraction ?? 0))
               - fusAdj(crotvt, a.vtTc);
  const nacWet = 2.8 * a.nacelleDiameter * a.nacelleLength;
  const wetted = { wing: wingWet, horizontalTail: htWet, verticalTail: vtWet, fuselage: fusWet,
                   nacelles: nacWet * a.numEngines };
  return { refDiam, wetted, totalWetted: Object.values(wetted).reduce((s, v) => s + v, 0),
           fuselagePlanform: a.fuselageLength * a.fuselageWidth };
}

/* ── WEIGHT BUILD-UP ───────────────────────────────────────────────── */
export function flopsWeights(a, geoOverride = null) {
  const geo = flopsGeometry(a);
  const wetted = { ...geo.wetted, ...(geoOverride || {}) };
  const totalWetted = Object.values(wetted).reduce((s, v) => s + v, 0);
  const GW = a.grossWeight;
  const nEng = a.numEngines, nWingEng = a.numWingEngines, nFusEng = a.numFuselageEngines;
  const fnEng = engineCountFactor(nEng);
  const thrust = a.engineSlsThrust;                  // per engine, lbf
  const totalThrust = thrust * nEng;
  const thrustFactor = totalThrust / fnEng;
  const planform = a.fuselagePlanform ?? geo.fuselagePlanform;
  const refDiam = geo.refDiam;
  const Mmax = a.maxMach;

  /* Wing, simple method (wing_simple.py, wing_common.py) */
  const C4 = 1 - 0.5 * a.aeroelasticTailoring;
  const C6 = 0.5 * a.aeroelasticTailoring - 0.16 * a.strutBracing;
  const caya = a.wingAspectRatio <= 5 ? 0 : a.wingAspectRatio - 5;
  const tlam = Math.tan(a.wingSweep * DEG) - 2 * (1 - a.wingTaper) / (a.wingAspectRatio * (1 + a.wingTaper));
  const slam = tlam / Math.sqrt(1 + tlam * tlam);
  const cayl = (1 - slam * slam) * (1 + C6 * slam * slam + 0.03 * caya * C4 * slam);
  const ems = 1 - 0.25 * a.strutBracing;
  const bt = 0.215 * (0.37 + 0.7 * a.wingTaper) * (a.wingSpan ** 2 / a.wingArea) ** ems / (cayl * a.wingTc);
  const caye = 1 - 0.03 * nWingEng;
  const ctrlArea = a.controlSurfaceAreaRatio * a.wingArea;
  const W2 = 0.68 * (1 - 0.17 * a.compositeFraction) * ctrlArea ** 0.34 * GW ** 0.60;
  const W3 = 0.035 * (1 - 0.3 * a.compositeFraction) * a.wingArea ** 1.5;
  const vfact = 1 + a.varSweep * (0.96 / Math.cos(a.wingSweep * DEG) - 1);
  const W1NIR = 8.80 * bt * (1 + Math.sqrt(6.25 / a.wingSpan)) * a.ultimateLoadFactor * a.wingSpan
              * (1 - 0.4 * a.compositeFraction) * (1 - 0.1 * a.aeroelasticTailoring)
              * 1.0 * vfact * a.wingLoadFraction * 1e-6;
  const W1 = (GW * caye * W1NIR + W2 + W3) / (1 + W1NIR) - W2 - W3;
  const wing = W1 + W2 + W3;

  const ht = 0.53 * a.htArea * GW ** 0.20 * (a.htTaper + 0.5);
  const vt = 0.32 * GW ** 0.30 * (a.vtTaper + 0.5) * a.vtArea ** 0.85 * a.numVerticalTails ** 0.7;
  const fuselage = 1.35 * (refDiam * a.fuselageLength) ** 1.28 * (1 + 0.05 * engineCountFactor(nFusEng))
                 * (a.militaryCargoFloor ? 1.38 : 1.0);
  const landingWeight = GW * (a.landingToTakeoffRatio ?? (1 - 4e-5 * a.designRange));
  const mainGear = 0.0117 * landingWeight ** 0.95 * a.mainGearOleoIn ** 0.43;
  const noseGear = 0.048 * landingWeight ** 0.67 * a.noseGearOleoIn ** 0.43;
  /* A turboprop (a.turboprop, per engine, from ../turboprop/propulsion.js)
     replaces the thrust-rated engine, nacelle and reverser equations; the
     rest of FLOPS is unchanged and reads `thrust` as the equivalent static
     thrust the caller supplies. */
  const tp = a.turboprop ?? null;
  const nacelle = tp ? tp.sectionEach
    : 0.25 * (nacelleCountFactor(nEng) / nEng) * a.nacelleDiameter * a.nacelleLength * thrust ** 0.36;
  const paint = totalWetted * a.paintPerArea;
  const structure = { wing, horizontalTail: ht, verticalTail: vt, fuselage, mainGear, noseGear,
                      nacelles: nacelle * nEng, paint };

  /* Propulsion */
  const engineEach = tp ? tp.engineEach : a.engineRefMass * (thrust / a.engineRefThrust) ** a.engineMassExponent;
  const engines = engineEach * nEng;
  const reversers = tp ? 0 : 0.034 * thrust * nacelleCountFactor(nEng);
  const controls = 0.26 * fnEng * Math.sqrt(thrustFactor);
  const starter = 11.0 * fnEng * Mmax ** 0.32 * nacelleDiamFactor(a.nacelleDiameter, nEng) ** 1.6;
  const fuelSystem = 1.07 * a.fuelCapacity ** 0.58 * fnEng ** 0.43 * Mmax ** 0.34;
  const propulsion = tp
    ? { engines, propellers: tp.propellerEach * nEng, miscellaneous: controls + starter, fuelSystem }
    : { engines, thrustReversers: reversers, miscellaneous: controls + starter, fuelSystem };

  /* Systems and equipment */
  const surfaceControls = 1.1 * Mmax ** 0.52 * ctrlArea ** 0.6 * GW ** 0.32;
  /* a.apuMass (lb), when given, replaces Eq 101: 0 for an aircraft without an APU. */
  const apu = a.apuMass ?? (54 * planform ** 0.3 + 5.4 * a.passengers ** 0.9);
  const instruments = 0.48 * planform ** 0.57 * Mmax ** 0.5
                    * (10 + 2.5 * a.flightCrew + engineCountFactor(nWingEng) + 1.5 * engineCountFactor(nFusEng));
  const hydraulics = a.hydraulicPressure <= 0 ? 0
    : 0.57 * (planform + 0.27 * a.wingArea)
      * (1 + 0.03 * engineCountFactor(nWingEng) + 0.05 * engineCountFactor(nFusEng))
      * (3000 / a.hydraulicPressure) ** 0.35 * (1 + 0.04 * a.varSweep) * Mmax ** 0.33;
  const electrical = 92 * a.fuselageLength ** 0.4 * a.fuselageWidth ** 0.14 * fnEng ** 0.69
                   * (1 + 0.044 * a.flightCrew + 0.0015 * a.passengers);
  const avionics = 15.8 * a.designRange ** 0.1 * a.flightCrew ** 0.7 * planform ** 0.43;
  const furnishings = 127 * a.flightCrew + 112 * a.firstClass + 78 * a.businessClass + 44 * a.economyClass
                    + 2.6 * a.passengerCompartmentLength * (a.fuselageWidth + a.fuselageHeight);
  const airConditioning = (3.2 * (planform * a.fuselageHeight) ** 0.6 + 9 * a.passengers ** 0.83) * Mmax
                        + 0.075 * avionics;
  const antiIcing = a.wingSpan / Math.cos(a.wingSweep * DEG)
                  + 3.8 * nacelleDiamFactor(a.nacelleDiameter, nEng) * fnEng + 1.5 * a.fuselageWidth;
  const systems = { surfaceControls, apu, instruments, hydraulics, electrical, avionics, furnishings,
                    airConditioning, antiIcing };
  /* An optional factor on every systems item, as FLOPS's per-item mass
     scalers allow (Aviary *.MASS_SCALER). Absent means 1: no change. */
  if (a.systemsFactor != null && a.systemsFactor !== 1)
    for (const k of Object.keys(systems)) systems[k] *= a.systemsFactor;

  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const structureTotal = sum(structure), propulsionTotal = sum(propulsion), systemsTotal = sum(systems);
  const margin = (structureTotal + propulsionTotal + systemsTotal) * a.emptyMarginFraction;
  const empty = structureTotal + propulsionTotal + systemsTotal + margin;

  /* Operating items */
  const flightCrewMass = a.flightCrew * 225;
  const cabinCrewMass = a.flightAttendants * 155 + a.galleyCrew * 200;
  const unusableFuel = (11.5 * fnEng * thrustFactor ** 0.2 + 0.07 * a.wingArea
                        + 1.6 * a.fuelTanks * a.fuelCapacity ** 0.28) * (a.fuelDensity / 6.7);
  const oil = 0.082 * fnEng * thrustFactor ** 0.65;
  const passengerService = (5.164 * a.firstClass + 3.846 * a.businessClass + 2.529 * a.economyClass)
                         * (a.designRange / Mmax) ** 0.225;
  /* Seats set the furnishings and services; passengersCarried (optional,
     default every seat) sets the payload, for aircraft whose published
     mission flies part-full, as business-jet ranges do. */
  const carried = a.passengersCarried ?? a.passengers;
  const passengersMass = carried * a.massPerPassenger;
  const baggage = carried * a.baggagePerPassenger;
  const cargo = a.cargo;
  /* a.cargoContainers === false: bulk-loaded holds, no Eq 125-126 containers. */
  const containers = a.cargoContainers === false ? 0 : Math.floor((cargo + baggage) / 950 + 0.99) * 175;
  const operating = { flightCrew: flightCrewMass, cabinCrew: cabinCrewMass, unusableFuel, oil,
                      passengerService, cargoContainers: containers };
  const operatingTotal = sum(operating);
  const operatingEmpty = empty + operatingTotal;
  const payload = passengersMass + baggage + cargo;
  const zeroFuel = operatingEmpty + payload;

  return {
    structure, propulsion, systems, operating,
    totals: { structure: structureTotal, propulsion: propulsionTotal, systems: systemsTotal,
              margin, empty, operatingItems: operatingTotal, operatingEmpty, payload, zeroFuel,
              fuelAvailable: GW - zeroFuel, landingWeight },
    detail: { bendingMaterialFactor: bt, bendingMass: W1, shearControlMass: W2, miscWingMass: W3,
              engineEach, landingWeight, wetted, totalWetted, refDiam },
  };
}
