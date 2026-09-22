/* =====================================================================
   NASA CONCEPT-VEHICLE WEIGHT-GROUP BENCHMARK
   =====================================================================
   Source: Johnson W. & Silva C., "NASA concept vehicles and the engineering of
   advanced air mobility aircraft", The Aeronautical Journal 126(1295), 2022,
   Table 3 "Characteristics of UAM concept vehicles".

   WHY THIS FILE EXISTS

   Validating only against MTOW hides where the error lives. Three different
   wrong group breakdowns can produce the same MTOW. Table 3 publishes the
   group split for every concept vehicle, which turns one benchmark number into
   four per aircraft — and it immediately showed that our systems group is
   right while structure and propulsion are 43% and 30% light.

   All weights are as published, in lb. Battery is INSIDE empty weight for the
   electric variants, so "systems" here is the remainder:
       systems = empty - structure - propulsion - battery
   which per the paper covers systems, vibration control and contingency.

   Only the ELECTRIC variants are listed: the turboshaft/turbo-electric columns
   carry engines and fuel systems this tool does not model, so their group
   splits are not comparable.
   ===================================================================== */

const LB = 0.453592;
const kg = (lb) => lb * LB;

export const NASA_TABLE3 = [
  { id: "quadrotor-e",   name: "NASA Quadrotor (electric)",       nRotors: 4,
    DGW: kg(7221), empty: kg(6012), structure: kg(1853), propulsion: kg(1375), battery: kg(1742) },
  { id: "sidebyside-e",  name: "NASA Side-by-Side (electric)",    nRotors: 2,
    DGW: kg(5547), empty: kg(4338), structure: kg(1533), propulsion: kg(813),  battery: kg(1150) },
  { id: "qsmr-e",        name: "NASA Single Main Rotor (electric)", nRotors: 1,
    DGW: kg(5980), empty: kg(4770), structure: kg(1616), propulsion: kg(804),  battery: kg(1502) },
  { id: "liftcruise-e",  name: "NASA Lift+Cruise (electric)",     nRotors: 8,
    DGW: kg(9482), empty: kg(8274), structure: kg(2973), propulsion: kg(1866), battery: kg(2058) },
].map((a) => ({
  ...a,
  systems: a.empty - a.structure - a.propulsion - a.battery,
  fracStructure:  a.structure  / a.DGW,
  fracPropulsion: a.propulsion / a.DGW,
  fracBattery:    a.battery    / a.DGW,
  fracEmpty:      a.empty      / a.DGW,
}));

/* Observed bands across the four electric concepts — the yardstick a new
   design should be judged against, rather than a single aircraft. */
export const NASA_GROUP_BANDS = (() => {
  const f = (k) => NASA_TABLE3.map((a) => a[k]);
  const band = (k) => ({ min: Math.min(...f(k)), max: Math.max(...f(k)),
                         mean: f(k).reduce((x, y) => x + y, 0) / f(k).length });
  return { structure: band("fracStructure"), propulsion: band("fracPropulsion"),
           battery: band("fracBattery"), empty: band("fracEmpty") };
})();
