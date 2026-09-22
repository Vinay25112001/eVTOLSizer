/* =====================================================================
   HOVER HANDLING QUALITIES — an ANALYSIS LAYER over the sizing loop
   =====================================================================
   This sits above the engine, not inside it, for the same reason
   constraints.js and uncertainty.js do: it needs the GEOMETRY, and the
   geometry is built from the sized result. Putting it in engine.js would
   be a circular import, and it changes no sized number.

   The chain is: sized weight groups + drawn bodies -> inertia tensor ->
   reduced first-order hover dynamics -> control power, damping, rates.

   WHAT THIS IS AND IS NOT, because the distinction is the whole point:

   IS:  an estimate of hover control power, damping and achievable steady
        rates, from NASA's own reduced conceptual-design formulation.
   NOT: bandwidth, phase delay, pilot-induced oscillation, transition, or
        anything requiring a control law. NASA needed FlightCODE and
        CONDUIT for those, and their reduced model - the one implemented
        here - explicitly discards rotor speed dynamics.

   AND NOT A CERTIFICATION CHECK. ADS-33E-PRF thresholds are a military
   standard. DOT/FAA/TC-23/59 (2024), the FAA's own handling qualities
   guide for powered-lift VTOL, states plainly: "There are required
   thresholds in ADS-33E-PRF for these parameters, but they are not
   requirements in civil certification", and that the handling-qualities
   Levels are "not part of the civilian certification process". The civil
   route is pilot-rated test elements and validated piloted simulation.
   Anything reported here is an ENGINEERING REFERENCE, and says so.
   ===================================================================== */
import { aircraftGeometry } from "./geometry.js";
import { inertiaTensor } from "./inertia.js";
import { hoverDynamics } from "./hoverdynamics.js";

/* [SRC] Malpica/Suh/Silva VFS Forum 80 (2024) Table 2 give a disturbance
   rejection bandwidth constraint of 1.0 rad/s for their hexacopter control
   law optimisation. It is the one quantitative handling-qualities figure
   this project has actually read from a source, and it is a CONTROL LAW
   target, not a bare-airframe property - so it is reported for context and
   nothing is gated on it. */
export const NASA_DRB_TARGET_RADS = 1.0;

export function hoverQualities(p = {}, SR = {}) {
  let g;
  try { g = aircraftGeometry(p, SR); }
  catch { return { applicable: false, note: "geometry unavailable" }; }

  const cgX = Number(SR.xCGtotal ?? SR.xCG) || 0;
  const stationOf = {};
  for (const i of (SR.cgItemised || [])) stationOf[i.group] = i.station;

  /* Battery and payload are not in the weight-group buildup; both ride in
     the cabin, which the CG model puts at the CG. Placing them there means
     they add mass without adding inertia - understating it - so this is
     flagged in the return rather than hidden. */
  const extra = [
    { mass: Number(SR.Wbat) || 0, x: cgX, y: 0, z: 0, label: "battery" },
    { mass: Number(p.payload) || 0, x: cgX, y: 0, z: 0, label: "payload" },
  ];
  const inertia = inertiaTensor(SR.weightGroupsRaw || {}, g.bodies,
                                { x: cgX, y: 0, z: 0 }, extra, stationOf, 0);

  /* EVERY lifting rotor works in hover. `stopped` means "stops in CRUISE",
     which is a different question - filtering on it silently excluded the
     whole lift+cruise layout from this analysis. Only the cruise propulsor
     is excluded, because it points the wrong way. */
  const rotors = g.bodies.filter(b => b.kind === "rotor");
  const R0 = rotors[0];
  const discArea = rotors.reduce((a, r) => a + Math.PI * (r.radius || 0) ** 2, 0);
  const mass = Number(SR.MTOW) || 0;
  const DL = discArea > 0 ? (mass * 9.80665) / discArea : 0;

  const dyn = hoverDynamics({
    rotors, mass, cgX, inertia, DL, rho: 1.225,
    thrustMargin: Math.max(0, (Number(p.twRatio) || 1.3) - 1),
  });

  return {
    applicable: dyn.applicable === true,
    inertia, dynamics: dyn,
    nLiftRotors: rotors.length,
    diskLoading_Nm2: +DL.toFixed(1),
    massInCabinAtCG: +(extra.reduce((a, e) => a + e.mass, 0)).toFixed(1),
    caveats: [
      "reduced first-order model: control power, damping and steady rates only",
      "no bandwidth, no phase delay, no PIO - those need a control law",
      "yaw damping Nr not modelled (rotor torque-speed slope and motor dynamics)",
      "battery and payload placed AT the CG, so their contribution to inertia is "
        + "zero and the tensor is an UNDER-estimate",
      "ADS-33 thresholds are military and explicitly NOT civil certification "
        + "requirements (DOT/FAA/TC-23/59, 2024)",
    ],
  };
}
