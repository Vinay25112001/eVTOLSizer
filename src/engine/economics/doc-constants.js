/* =====================================================================
   DIRECT OPERATING COST — THE CONSTANTS, AND WHERE EACH ONE COMES FROM
   =====================================================================
   WHY THIS FILE EXISTS. The DOC model lived entirely inside CostTab.jsx: a
   React component held two dozen economic constants as bare literals, and a
   green "DOC v3 Formula Sources" panel underneath told the reader what those
   constants were. The two drifted, because nothing made them the same thing:

     - the panel said maintenance was (2.0 + 0.18dN + 2.0h) x $150/FH;
       the code computed (0.6 + 0.08dN + 0.4h) x $75/h + $75/FH. Every
       coefficient and the rate were wrong on screen.
     - the panel said energy used eta_discharge x eta_charger; the code had
       deliberately removed the discharge term months earlier to stop
       double-counting a loss the sizing engine already applies.

   Now the panel RENDERS FROM THIS TABLE. A constant and its description
   cannot disagree, because they are the same object.

   ── THE HONEST PART ───────────────────────────────────────────────────
   The engine classifies every output validated / sourced / calibrated /
   derived / unverified, and 3% of its outputs have ever been compared to a
   real aircraft. NONE of the economics was in that matrix at all: the whole
   model sat in the view layer, outside the provenance census, outside the
   golden master, and outside all 42 gates but the one that checks the tab
   renders. So each constant below carries its own status, and the four that
   have no source say so in the field a reader actually sees.

   Several attributions in the old header did not survive checking:
     - "Booz Allen / NASA AAM Cost Model 2021" COULD NOT BE FOUND TO EXIST.
       Not in the 4,038-work research corpus, not on the web. The real
       artefact is the NASA/Booz Allen UAM Market Study (NASA/CR-2019-220217,
       2018/2019). Three constants were attributed to the phantom document.
     - ATA iSpec 2200 is a maintenance DOCUMENTATION standard. It specifies
       how manuals are structured, not what maintenance costs. No formula in
       this model came from it.
     - GAMA's General Aviation Statistical Databook publishes shipments and
       billings. It does not publish hull insurance rates.
     - ICAO Doc 9502 and Vascik (MIT, 2020) were cited for the vertiport fee,
       which is the literal number 35.
   Those citations are removed rather than reassigned. An unsourced constant
   labelled unsourced is honest; an unsourced constant wearing someone else's
   name is not.

   NOT VALIDATED, AND IT CANNOT BE. A cost per flight has no published
   aircraft to check it against the way a rotor group weight does. The best
   available status here is `sourced`, and the next real step is NDARC
   Chapter 6 (NASA/TP-20250010468 sections 6-2 and 6-3), which is already in
   the research corpus and publishes its own residuals -- a price CER within
   20% for 96% of 128 rotorcraft. That is a separate commit.
   ===================================================================== */

import { OCCUPANT_MASS_KG } from "../cabin.js";

/** status values, narrower than the engine's because nothing here is validated */
export const COST_STATUS = {
  sourced: "traced to a citable document",
  calibrated: "fitted or chosen to match a published result",
  unsourced: "NO SOURCE — a working assumption, nothing more",
};

/**
 * Every constant the DOC model uses, with its provenance.
 * `text` is what the on-screen formula panel prints, so the panel cannot
 * describe a number the code does not use.
 */
export const DOC_CONSTANTS = {
  daysPerYear: {
    value: 300, unit: "day/yr", status: "unsourced",
    source: "assumed operating days per year — not weather-adjusted. NASA/CR-2019-220217 models utilisation as 1,000-2,000 flight hours/yr instead, which is the sourced way to express this",
    text: "300 operating days/yr (assumed)",
  },
  chargerEtaBase: {
    value: 0.97, unit: "-", status: "unsourced",
    source: "charger round-trip efficiency at zero C-rate. Previously attributed to SAE ARP6504, which is not in the corpus and could not be checked",
    text: "eta_charger = 0.97 - 0.030*C_hover, floored at 0.85",
  },
  chargerEtaCrateSlope: {
    value: 0.030, unit: "1/C", status: "unsourced",
    source: "fall-off of charger efficiency with charge rate; same unchecked attribution as above",
    text: "",
  },
  chargerEtaFloor: {
    value: 0.85, unit: "-", status: "unsourced",
    source: "floor so the fit cannot run away at high C",
    text: "",
  },
  cellCostRefSED: {
    value: 300, unit: "Wh/kg", status: "sourced",
    source: "BNEF Electric Vehicle Outlook 2024 NMC reference point for the cell $/kWh input",
    text: "cell $/kWh scaled from a 300 Wh/kg reference",
  },
  cellCostSEDExponent: {
    value: 0.3, unit: "-", status: "calibrated",
    source: "learning-curve exponent on specific energy; a shape chosen to make cell cost rise with SED, not a published fit",
    text: "cell $/kWh x (300/SED)^0.3",
  },
  packOverheadPerKwh: {
    value: 55, unit: "$/kWh", status: "sourced",
    source: "Fraunhofer ISE 2023 pack cost study — BMS, thermal management, structure and wiring, largely independent of cell specific energy",
    text: "+ $55/kWh pack overhead (BMS, thermal, structure)",
  },
  certFactor: {
    value: 2.0, unit: "-", status: "unsourced",
    source: "aviation qualification premium on pack cost. Previously attributed to FAA AC 21.17-4, which is a type-certification procedure notice and says nothing about battery unit cost",
    text: "x2.0 aviation qualification premium (unsourced)",
  },
  batteryCyclesRated: {
    value: 900, unit: "cycle", status: "sourced",
    source: "Thornton 2019 rated cycle life at 50% depth of discharge",
    text: "N_eff = 900 x (0.50/DoD)^beta x (2.0/C)^0.45",
  },
  dodExponentShallow: {
    value: 0.5, unit: "-", status: "sourced",
    source: "Thornton 2019 — shallow discharge (DoD < 50%) extends life",
    text: "beta = 0.5 below 50% DoD, 0.6 above",
  },
  dodExponentDeep: {
    value: 0.6, unit: "-", status: "sourced",
    source: "Thornton 2019 — deep discharge accelerates SEI cracking",
    text: "",
  },
  cRateRefForCycleLife: {
    value: 2.0, unit: "C", status: "sourced",
    source: "Waldmann 2014 reference discharge rate for the cycle-life penalty",
    text: "",
  },
  cRatePenaltyExponent: {
    value: 0.45, unit: "-", status: "sourced",
    source: "Waldmann 2014 exponent on discharge rate",
    text: "",
  },
  scheduledMxAnnual: {
    value: 45000, unit: "$/yr", status: "unsourced",
    source: "annual scheduled-maintenance allowance. Previously attributed to a 'Booz Allen / NASA AAM Cost Model 2021' that could not be found to exist",
    text: "$45,000/yr scheduled (unsourced)",
  },
  mmhBase: {
    value: 0.6, unit: "MMH/FH", status: "sourced",
    source: "rotorcraft maintenance man-hours per flight hour, the low end of NASA/CR-2019-220217's 0.25-1.0 MMH/FH range for UAM",
    text: "MMH/FH = 0.6 + 0.08*(n_rotor - 4) + 0.4*hover_fraction",
  },
  mmhPerExtraMotor: {
    value: 0.08, unit: "MMH/FH per motor", status: "unsourced",
    source: "penalty per rotor above four; a modelling choice, no published basis",
    text: "",
  },
  mmhHoverPenalty: {
    value: 0.4, unit: "MMH/FH", status: "unsourced",
    source: "penalty scaled by the fraction of the flight spent in hover; a modelling choice",
    text: "",
  },
  labourRatePerHour: {
    value: 75, unit: "$/h", status: "unsourced",
    source: "maintenance labour rate. NASA/CR-2019-220217 gives a $60-100/h wrap rate, which this sits inside but was not taken from",
    text: "x $75/h labour + $75/FH parts",
  },
  partsCostPerFH: {
    value: 75, unit: "$/FH", status: "unsourced",
    source: "parts cost per flight hour; no published basis",
    text: "",
  },
  mtbfMotorHours: {
    value: 8000, unit: "h", status: "sourced",
    source: "Rolls-Royce electric-motor TBO target, 2022",
    text: "unscheduled = n_rotor*(1/8000 + 1/5000) events/FH x $1,200",
  },
  mtbfEscHours: {
    value: 5000, unit: "h", status: "sourced",
    source: "Siemens SP260D inverter data",
    text: "",
  },
  unscheduledRepairCost: {
    value: 1200, unit: "$/event", status: "unsourced",
    source: "average unscheduled repair. Previously attributed to the same phantom 2021 cost model",
    text: "",
  },
  motorTboHours: {
    value: 3000, unit: "h", status: "unsourced",
    source: "motor time between overhaul; no published basis and shorter than the 8,000 h MTBF above, which is why motor replacement and unscheduled maintenance are separate lines",
    text: "motor set replaced every 3,000 FH (unsourced)",
  },
  aircraftValuePerKgMTOW: {
    value: 800, unit: "$/kg", status: "unsourced",
    source: "hull value for the insurance line. NOTE: this gives about $1.9M for a 2,400 kg tiltrotor, against the $3M-$10M flyaway implied by Johnson & Silva 2022 section 6.10 size factors. NDARC section 6-2's Harris-Scully CER is the sourced replacement and is the next piece of work",
    text: "hull value = MTOW x $800/kg (unsourced, likely low)",
  },
  insuranceRateAnnual: {
    value: 0.10, unit: "1/yr", status: "unsourced",
    source: "annual hull premium as a fraction of value. Previously attributed to the GAMA Statistical Databook, which publishes shipments and billings, not insurance rates. NDARC section 6-3 uses K_ins = 0.0056 of aircraft cost for airline operations (Coy 2006) — an order of magnitude apart, and the gap is a real open question for a novel type",
    text: "insurance = 10%/yr of hull value (unsourced)",
  },
  vertiportFeePerFlight: {
    value: 35, unit: "$/flight", status: "unsourced",
    source: "landing and infrastructure fee. Previously carried ICAO Doc 9502 and Vascik (MIT 2020) attributions; neither supplies this number and no formula from either appears in the model",
    text: "$35/flight vertiport fee (unsourced)",
  },
  rpicSalaryAnnual: {
    value: 82000, unit: "$/yr", status: "sourced",
    source: "remote pilot in command salary, inside NASA/CR-2019-220217's $50-90k pilot range",
    text: "RPIC $82,000/yr",
  },
  dutyHoursPerDay: {
    value: 8, unit: "h/day", status: "unsourced",
    source: "duty hours per day used to turn an annual salary into a cost per hour",
    text: "over 8 duty hours/day",
  },
  turnaroundHours: {
    value: 0.25, unit: "h", status: "unsourced",
    source: "15-minute turnaround charged to the crew line. It does NOT feed utilisation: flights per day is an independent input, so a longer turnaround cannot currently reduce the number of flights an aircraft flies",
    text: "charged over flight time + 15 min turnaround",
  },
  certCostTotal: {
    value: 75_000_000, unit: "$", status: "sourced",
    source: "type certification for a novel powered-lift category; Joby's disclosed programme cost is of this order. Amortised over the fleet and life below",
    text: "$75M type cert amortised over 50 aircraft x 10 yr",
  },
  certFleetSize: {
    value: 50, unit: "aircraft", status: "unsourced",
    source: "fleet over which certification is amortised",
    text: "",
  },
  aircraftLifeYears: {
    value: 10, unit: "yr", status: "unsourced",
    source: "operating life for the certification amortisation. NASA/CR-2019-220217 models vehicle life as 12,000-15,000 flight hours instead",
    text: "",
  },
  farePerKm: {
    value: 4.50, unit: "$/km", status: "unsourced",
    source: "assumed fare. For scale, NASA/CR-2019-220217 gives $6.25/passenger-mile +/-50% near-term for a 5-seater, and Joby's S-4 projects $3.00/mile",
    text: "fare $4.50/km (assumed)",
  },
  loadFactor: {
    value: 0.78, unit: "-", status: "unsourced",
    source: "assumed seats filled. NASA/CR-2019-220217 sweeps 50-80%",
    text: "load factor 78% (assumed)",
  },
  helicopterCostPerKm: {
    value: 4.50, unit: "$/km", status: "unsourced",
    source: "the comparison benchmark. It is numerically identical to the assumed fare above, which is a coincidence of two unsourced numbers and not a finding — read the 'vs helicopter' figure with that in mind",
    text: "helicopter benchmark $4.50/km (unsourced)",
  },
};

/** the one occupant mass, from the engine, so seat counts cannot diverge */
export { OCCUPANT_MASS_KG };

/**
 * Seats a payload implies. FLOOR, not round: a payload that covers 5.6
 * occupants seats five, and rounding it to six sold a seat the aircraft
 * cannot carry. CostTab rounded and CertificationTab floored, both against a
 * hardcoded 90 kg rather than the engine's sourced 90.718 kg — so over a
 * 100-900 kg payload sweep the two tabs disagreed at 81 of 161 points, and
 * at 500 kg the cost model priced six seats while the certification checklist
 * certified five. `cost_per_seat_km` is divided by this number.
 */
export function seatCount(payloadKg) {
  return Math.max(1, Math.floor((payloadKg ?? 0) / OCCUPANT_MASS_KG));
}

/** every constant with no source, for the gate and the UI to report */
export function unsourcedConstants() {
  return Object.entries(DOC_CONSTANTS)
    .filter(([, c]) => c.status === "unsourced")
    .map(([k, c]) => ({ key: k, value: c.value, unit: c.unit, why: c.source }));
}
