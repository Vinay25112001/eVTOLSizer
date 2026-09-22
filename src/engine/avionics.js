/* =====================================================================
   AVIONICS, SENSORS AND FLIGHT-CONTROL ELECTRONICS
   =====================================================================
   WHY THIS EXISTS

   Avionics was `avionicsKg: 45` — a flat constant with no architecture. It did
   not know whether the aircraft was piloted or autonomous, how many flight
   computers it carried, or that SC-VTOL Category Enhanced demands redundancy
   that Category Basic does not. Two aircraft with completely different system
   architectures got the same 45 kg.

   ── WHY REDUNDANCY IS THE DRIVER ─────────────────────────────────────

   A full-authority fly-by-wire eVTOL has no mechanical reversion. The flight
   control system IS the aircraft's controllability, which is why SC-VTOL's
   handling-qualities compliance route (MHQRM, see engine/cg.js) assumes the
   FCS is working. That makes the FCS a catastrophic-failure item, and
   catastrophic items are dispatched with redundancy, not with reliability
   alone. Redundancy is therefore the single largest driver of avionics mass on
   this class of aircraft — far more than the choice of any individual box.

   SC-VTOL splits the fleet:
     Category Basic     — may permit a controlled emergency landing after a
                          critical failure
     Category Enhanced  — must have continued safe flight and landing, i.e. no
                          single failure may prevent it
   so Enhanced drives higher lane counts on the flight-critical chain.

   ── HOW THIS IS BUILT ────────────────────────────────────────────────

   As a component list with per-unit masses and an explicit lane count per
   item, rather than one lumped number. Masses are representative installed
   weights for civil equipment in this class [LAY] — this is an architecture
   model, and its value is that changing the ARCHITECTURE changes the mass. A
   lane count is a design decision the tool can now expose; a flat 45 kg hid it.

   Sensor set reflects what a VTOL actually needs beyond a fixed-wing fit:
   radar altimeter for the vertical segment, and air data that stays valid
   through transition where a conventional pitot-static system does not.
   ===================================================================== */

/* Per-unit installed masses, kg. [LAY] representative civil equipment. */
export const AVIONICS_ITEMS = [
  /* flightCritical: sized by category redundancy. */
  { key: "fcc",       name: "Flight control computer",      kg: 3.2, flightCritical: true,
    note: "DAL-A, no mechanical reversion" },
  { key: "ahrs",      name: "AHRS / inertial reference",    kg: 1.8, flightCritical: true },
  { key: "adc",       name: "Air data computer",            kg: 1.4, flightCritical: true },
  { key: "adProbe",   name: "Air data probe (heated)",      kg: 0.9, flightCritical: true,
    note: "must stay valid through transition" },
  { key: "actCtrl",   name: "Actuator control electronics", kg: 2.1, flightCritical: true },
  { key: "pdu",       name: "Avionics power distribution",  kg: 2.6, flightCritical: true },
  /* Fixed-count items. */
  { key: "gnss",      name: "GNSS receiver (multi-const.)", kg: 1.1, count: 2 },
  { key: "radalt",    name: "Radar altimeter",              kg: 1.6, count: 2,
    note: "vertical segment — not optional on a VTOL" },
  { key: "display",   name: "Cockpit display unit",         kg: 4.5, count: 2, pilotedOnly: true },
  { key: "controls",  name: "Inceptors / control loading",  kg: 6.0, count: 1, pilotedOnly: true },
  { key: "comm",      name: "VHF comm transceiver",         kg: 2.2, count: 2 },
  { key: "xpdr",      name: "Transponder / ADS-B out",      kg: 1.7, count: 1 },
  { key: "nav",       name: "Nav receiver",                 kg: 2.0, count: 1 },
  { key: "datalink",  name: "C2 datalink",                  kg: 3.4, count: 2, autonomousOnly: true,
    note: "command and control link — autonomous only" },
  { key: "daa",       name: "Detect-and-avoid sensor suite", kg: 5.5, count: 1, autonomousOnly: true },
  { key: "recorder",  name: "Flight data recorder",         kg: 4.0, count: 1 },
  { key: "wiring",    name: "Harness and racking",          kg: 0,   count: 1, wiringFrac: 0.35,
    note: "fraction of the rest — dominant on distributed architectures" },
];

export const AVIONICS_CONSTANTS = {
  lanesEnhanced: 3,   // [LAY] triplex on the flight-critical chain
  lanesBasic:    2,   // [LAY] duplex where a controlled landing is permitted
  wiringFrac:    0.35,
};

/**
 * @param p parameter set — vtolCategory ("enhanced"|"basic"), crewed (bool)
 */
export function avionics(p, K = AVIONICS_CONSTANTS) {
  const enhanced   = (p.vtolCategory ?? "enhanced") !== "basic";
  const piloted    = p.crewed !== false;
  const lanes      = p.fcsLanes ?? (enhanced ? K.lanesEnhanced : K.lanesBasic);

  const items = [];
  let core = 0;
  for (const it of AVIONICS_ITEMS) {
    if (it.wiringFrac) continue;
    if (it.pilotedOnly && !piloted) continue;
    if (it.autonomousOnly && piloted) continue;
    const n = it.flightCritical ? lanes : (it.count ?? 1);
    const m = it.kg * n;
    core += m;
    items.push({ ...it, units: n, massKg: +m.toFixed(2) });
  }
  const wiring = core * K.wiringFrac;
  const mass   = core + wiring;
  items.push({ key: "wiring", name: "Harness and racking", units: 1,
               massKg: +wiring.toFixed(2), note: "fraction of the rest" });

  return {
    mass, core, wiring, lanes, enhanced, piloted,
    category: enhanced ? "Enhanced" : "Basic",
    architecture: `${piloted ? "piloted" : "autonomous"}, ${lanes}-lane flight-critical chain`,
    items,
    basis: "component list with SC-VTOL category-driven redundancy on the "
         + "flight-critical chain; per-unit masses are representative [LAY]",
  };
}
