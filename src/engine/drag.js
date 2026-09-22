import { resolveConfiguration } from "./configuration.js";

/* =====================================================================
   DRAG MODEL
   Rotorcraft parasite drag terms. Pure.
   ===================================================================== */

/* ═══════════════════════════════════════════════════════════════════════
   ROTORCRAFT PARASITE DRAG TERMS  —  missing from the original buildup
   ═══════════════════════════════════════════════════════════════════════
   The inherited model used a fixed-wing (Raymer) buildup only: wing, fuselage,
   tails, nacelles, gear, misc. For a rotor-borne aircraft that omits the terms
   that dominate rotorcraft parasite drag. Measured against NDARC's own
   calibration D/q = k(W_MTO/1000)^(2/3), the inherited model produced k = 0.96
   for both Joby and Archer — cleaner than a turboprop aeroplane (k = 1.4),
   which is not credible for a 12-rotor aircraft with booms and exposed hubs.

   NDARC drag form (Johnson, NASA TP-20220000355, sections 8-11 and 12-10):
       D = q·A·CD_hub + q·S_pylon·CD_pylon + q·A_blade·CD_blade + …
   with hub drag referenced to ROTOR DISK AREA and stopped-blade drag to
   geometric blade area A_blade = sigma·A.

   COEFFICIENT PROVENANCE
   [EQ]  landing gear — Raymer Table 12.6, already cited elsewhere in this file:
         fixed 0.015, retractable/folded 0.003, fully faired 0.001.
   [CAL] hub drag — NDARC leaves CD_hub as a user input. Measured hub drag
         coefficients are 0.5–0.76 on projected hub FRONTAL area (Churchill,
         "Parasite-Drag Measurements of Five Helicopter Rotor Hubs",
         NASA/NTRS 19980228291). Converting frontal→disk area needs a hub
         frontal area this tool does not model, so instead the disk-referenced
         default is set so hub drag lands at the published SHARE of parasite
         drag: 25–30% of vehicle parasite drag for single-main-rotor
         helicopters (Penn State Rotary Wing Aerodynamics; ~30–50% including
         swashplate). Calibrated to a published share — NOT a measured value.
   [CAL] stopped-blade drag — NDARC form, coefficient not published; a stopped
         blade aligned with the flow is close to a thin plate at low incidence.
   ═══════════════════════════════════════════════════════════════════════ */
export const DRAG_CONSTANTS = {
  gearCD0:   { fixed: 0.015, retractable: 0.003, faired: 0.001 },  // [EQ] Raymer T12.6
  CD_hub:    0.0040,   // [CAL] per rotor, referenced to DISK area
  CD_blade:  0.0090,   // [CAL] stopped blades, referenced to blade area sigma*A
  miscCD0:   0.002,    // gaps, protuberances (unchanged from original)
};

/* Extra parasite drag, expressed as a CD0 increment on WING reference area so
   it can be added straight to the existing Raymer buildup. */
export function rotorcraftDragCD0(p, Swing, K = DRAG_CONSTANTS) {
  const N = Math.max(1, p.nPropHover);
  const A = Math.PI * Math.pow(p.propDiam / 2, 2);        // disk area per rotor
  /* Design rotor solidity. WAS a hardcoded 0.10 here AND a second hardcoded
     0.10 in engine.js's chord/noise calculation — two copies of one design
     quantity, the same duplication defect that `cruiseThrustUnits` had. It is
     now a real parameter, and engine/rotorgroup.js needs it too (it derives
     blade chord from sigma). Default 0.10 preserves the previous behaviour. */
  const sigma = p.solidity ?? 0.10;                        // design solidity used throughout
  const gearType = p.gearType || "fixed";                  // eVTOL default: fixed/skid gear
  const gear = (K.gearCD0[gearType] ?? K.gearCD0.fixed);

  /* CONFIGURATION CONSISTENCY — NDARC section 12-10 is explicit that these
     terms must match the configuration: "a rotor with a spinner (such as on a
     tiltrotor aircraft) would likely not have hub drag". Applying hub and
     stopped-blade drag to every layout indiscriminately over-predicted a clean
     tiltrotor by 120% while under-predicting a lift+cruise.
       hubsExposed      false for spinnered tiltrotor nacelles (default true)
       nRotorsStopped   how many rotors STOP in cruise and sit in the flow.
                        Tiltrotor: 0 (all tilt and keep turning).
                        Lift+cruise: the lift rotors only, pusher excluded. */
  /* Layout resolved in ONE place — see engine/configuration.js. */
  const cfg = resolveConfiguration(p, N);
  const hubsExposed = cfg.hubsExposed;
  const nStopped = cfg.nStopped;

  /* Hub drag belongs to rotors whose hubs are EXPOSED in cruise — i.e. the
     stopped lift rotors. A tilting rotor is a thrusting propeller in cruise,
     behind a spinner; NDARC 12-10, quoted above, is explicit that "a rotor with
     a spinner would likely not have hub drag". This previously charged all N
     rotors, so Archer Midnight (12 rotors, only 6 of which stop) paid double
     the hub drag it should — driving its cruise L/D down to 8.0 against a
     published 14, and its pack energy up by ~80%. */
  /* ── DRAG AREAS (m^2), NOT WING-REFERENCED COEFFICIENTS ──────────────
     These are dimensional drag areas. Hub drag is referenced to DISK area and
     stopped-blade drag to blade area sigma*A — both already correct per NDARC
     12-10 and 12-9. What was wrong is that they were divided by Swing before
     being returned, which made every rotorcraft drag term require a wing.

     LANDING GEAR HAS NO REFERENCE AREA. NDARC Theory Table 8-2 lists the gear
     drag contribution with NO reference area at all — it is a D/q input, full
     stop. We inherited Raymer Table 12.6 coefficients (fixed 0.015 /
     retractable 0.003 / faired 0.001) which ARE wing-referenced, so converting
     them to an area needs a wing. That is a genuine reference-class mismatch
     between our source and NDARC's method.
     RESOLVED HONESTLY, NOT GUESSED: where a wing exists the Raymer
     coefficient is used exactly as before (gear area = CD0_gear * Swing, so
     winged results are unchanged to the last bit). Where there is NO wing the
     Raymer number cannot be converted, so gear drag falls back to a fraction
     of the fuselage drag area and is FLAGGED as unsourced rather than silently
     invented. A proper wingless gear D/q needs a rotorcraft gear source. */
  const hubArea     = cfg.nHubsExposed * A * K.CD_hub;
  const stoppedArea = nStopped * (sigma * A) * K.CD_blade;
  const hasWing     = Swing > 0 && isFinite(Swing);
  const gearArea    = hasWing ? gear * Swing : null;
  const miscArea    = hasWing ? K.miscCD0 * Swing : null;
  return {
    /* Dimensional areas, m^2 — the NDARC primitive */
    hubArea, stoppedArea, gearArea, miscArea,
    gearReferenced: hasWing ? "Raymer T12.6 coefficient x wing area" : "UNSOURCED for wingless",
    /* Legacy wing-referenced coefficients, kept so winged behaviour is
       bit-identical and callers can migrate one at a time. Null without a wing,
       which is the point: a coefficient with no reference area is meaningless. */
    gear: hasWing ? gear : null,
    hub: hasWing ? hubArea / Swing : null,
    stopped: hasWing ? stoppedArea / Swing : null,
    misc: hasWing ? K.miscCD0 : null,
    total: hasWing ? gear + hubArea / Swing + stoppedArea / Swing + K.miscCD0 : null,
  };
}
