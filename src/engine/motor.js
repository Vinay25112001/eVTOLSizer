/* =====================================================================
   MOTOR TRANSIENT POWER SIZING
   =====================================================================
   The inherited engine sized peak motor power as 1.15 x 1.50 = 1.725 x hover
   power per rotor, with no source, and then "verified" OEI by checking that
   each surviving motor could carry P_hover/(N-1) — for six rotors that is only
   1.2 x hover power. Both numbers treat a motor failure as a STEADY thrust-
   sharing problem.

   It is not. When a motor fails, the remaining motors must reject the
   resulting attitude disturbance, and the transient power demand is far above
   the new steady hover share. NASA measured this for several UAM concept
   vehicles with a distributed propulsion and flight control architecture sized
   to the EASA SC-VTOL-01 requirement of no more than 1e-9 catastrophic
   failures per flight hour.

   Johnson & Silva, The Aeronautical Journal 126(1295), 2022, Table 4
   "Required motor power transient capability, P/Phover":

                                     Quadrotor  Hexacopter  Hexacopter  Octocopter
       control                       collective collective  RPM         RPM
       [84] disturbance rejection (OEI)  2.1       1.4        3.8         3.8
       [84] discrete gust                1.75      2.5        2.5          -
       [84] continuous turbulence        2.6       2.5        2.5          -
       [85] disturbance rejection        1.35      1.45       1.45         -
       [85] one-engine inoperative       1.4       2.0        2.9          -

   The paper's stated findings, which is why control scheme matters more than
   rotor count here:
     - "rpm control results in higher power transients at each motor, compared
        to collective control"
     - "removing interconnecting shafts results in higher power transients"
     - "increasing the number of rotors has a small increase in power
        transients"

   AND NASA'S OWN CAVEAT, which must travel with these numbers:
     "Sizing criteria for power plant components are not currently available
      for multirotor aircraft; therefore, early stability and control
      simulations are required to characterise power transients to feed design
      sizing for both normal and emergency flight conditions."

   So this is the best published guidance, not a certification standard. It
   replaces an unsourced 1.725 with a sourced 2.5-3.8 and makes the governing
   criterion visible.
   ===================================================================== */

/* Every criterion from Table 4, kept individually so the UI can show WHICH one
   governs rather than only the maximum. null = not reported for that column. */
export const MOTOR_TRANSIENT_TABLE = {
  "quad/collective": { label: "Quadrotor, collective",
    oeiDisturbance: 2.1,  discreteGust: 1.75, continuousTurbulence: 2.6,
    disturbance85:  1.35, oei85: 1.4 },
  "hex/collective":  { label: "Hexacopter, collective",
    oeiDisturbance: 1.4,  discreteGust: 2.5,  continuousTurbulence: 2.5,
    disturbance85:  1.45, oei85: 2.0 },
  "hex/rpm":         { label: "Hexacopter, RPM control",
    oeiDisturbance: 3.8,  discreteGust: 2.5,  continuousTurbulence: 2.5,
    disturbance85:  1.45, oei85: 2.9 },
  "oct/rpm":         { label: "Octocopter, RPM control",
    oeiDisturbance: 3.8,  discreteGust: null, continuousTurbulence: null,
    disturbance85:  null, oei85: null },
};

/* ── ROTOR CONTROL IS A PROPERTY OF THE LAYOUT, NOT A GLOBAL DEFAULT ─────
   This module used to hard-default every aircraft to "rpm" on the grounds that
   it is the conservative column. Conservative is the right tie-breaker where
   nothing is published -- but Johnson & Silva 2022 publish the control scheme
   PER CONCEPT VEHICLE, so for several layouts nothing had to be assumed:

     lift+cruise  "The vast majority of lift+cruise aircraft being proposed
                   have fixed rotor pitch and use variable rpm for control."
                  and sec.6.3: "This design has rigid rotors for hover and low
                   speed lift, using fixed pitch and rotor speed control."
     tiltwing     "Collective control is used, with hover tip speed of
                   550 ft/sec and cruise tip speed of 300 ft/sec."
     quadrotor    "both collective and rotor speed control were considered"
                  -- genuinely undetermined, so the conservative column stands.

   Defaulting a tiltrotor to rpm charged it the 3.8x OEI column when the
   published aircraft it represents (Joby S4: 5-bladed composite VARIABLE-PITCH
   proprotors) is a collective machine at 2.5x. That is not conservatism, it is
   the wrong row of the table. p.rotorControl still overrides. */
export const ROTOR_CONTROL_BY_CONFIG = {
  liftcruise:   { v: "rpm",        src: "[SRC] J&S 2022: fixed pitch, rotor speed control" },
  tiltrotor:    { v: "collective", src: "[SRC] J&S 2022 tiltwing: collective control; Joby S4 variable-pitch" },
  multicopter:  { v: "rpm",        src: "[LAY] J&S considered both; conservative column" },
  sideBySide:   { v: "rpm",        src: "[LAY] not published; conservative column" },
  /* MIXED, and now sourced rather than assumed. Archer Midnight carries SIX
     5-bladed VARIABLE-PITCH tilt-propellers on the wing leading edge and SIX
     2-bladed FIXED-PITCH lift-only propellers on the trailing edge. So half the
     rotors are collective-controlled and half are rpm-controlled, and NASA's
     Table 4 has no column for that. The conservative column still governs, but
     the check reports the BRACKET because the true requirement provably lies
     between the two published columns. */
  hybrid:       { v: "rpm", mixed: true,
                  src: "[SRC] Archer Midnight: 6 variable-pitch tilt props (collective) + 6 fixed-pitch lift props (rpm) — MIXED, no published column; conservative column used" },
  hybridPusher: { v: "rpm", mixed: true,
                  src: "[LAY] mixed tilt+lift by analogy with Archer; conservative column used" },
};

export function rotorControlFor(configKey, explicit) {
  if (explicit === "collective" || explicit === "rpm")
    return { value: explicit, basis: "explicit input" };
  const e = ROTOR_CONTROL_BY_CONFIG[configKey];
  return e ? { value: e.v, basis: e.src }
           : { value: "rpm", basis: "[LAY] unknown configuration; conservative column" };
}

/* -- DOES TABLE 4 DESCRIBE THIS AIRCRAFT AT ALL? -------------------------
   Every column in Table 4 is a MULTICOPTER WITH INDEPENDENT ROTORS - quadrotor,
   hexacopter, octocopter - and Johnson & Silva state the dependence explicitly:

     "removing interconnecting shafts results in higher power transients"

   So the table's numbers are for the UN-SHAFTED case, and applying them to a
   cross-shafted aircraft charges it for a failure mode it does not have: on an
   interconnected drive a motor failure does not cost a rotor, the shaft keeps
   both turning, and the disturbance to be rejected is a different and smaller
   event that the paper does not quantify.

   THE ENGINE ALREADY KNEW THIS AND THE TWO HALVES DISAGREED. configuration.js
   exempts the side-by-side from the N/(N-1) OEI thrust margin, citing exactly
   this: "NASA's side-by-side carries an INTERCONNECT SHAFT ... so a motor
   failure does not cost a rotor." Meanwhile this module was charging that same
   aircraft the un-shafted hexacopter RPM column at 3.8x - and a two-rotor
   aircraft scored on a SIX-rotor column at that. Two files, one aircraft,
   opposite assumptions.

   Read from configuration.js rather than restated here, so the fact has ONE
   home. Duplicating a constant across two modules is the defect this codebase
   keeps rediscovering. */
import { CONFIG_DEFAULTS } from "./configuration.js";

export function rotorInterconnectFor(configKey, explicit) {
  if (explicit === true || explicit === false)
    return { interconnected: explicit, basis: "explicit input" };
  const d = CONFIG_DEFAULTS[configKey];
  if (d && d.oeiThrustShare === false)
    return { interconnected: true,
      basis: "[SRC] this layout carries an interconnect shaft (see CONFIG_DEFAULTS "
           + "oeiThrustShare), so a motor failure does not cost a rotor" };
  return { interconnected: false, basis: "independent rotors" };
}

/* Pick the closest published column for this configuration. */
export function motorTransientRequirement(p) {
  const control = rotorControlFor(p.configType, p.rotorControl).value;
  const n = p.nPropHover || 6;
  let family = n <= 4 ? "quad" : n <= 6 ? "hex" : "oct";
  let key = `${family}/${control}`;
  // Table 4 has no quad/rpm or oct/collective column — fall back to the nearest
  // reported configuration and say so rather than silently interpolating.
  let substituted = null;
  if (!MOTOR_TRANSIENT_TABLE[key]) {
    const fallback = control === "rpm" ? "hex/rpm" : "hex/collective";
    substituted = `no published column for ${family}/${control}; using ${MOTOR_TRANSIENT_TABLE[fallback].label}`;
    key = fallback;
  }
  const row = MOTOR_TRANSIENT_TABLE[key];

  // The governing requirement is the largest criterion reported for the column.
  const criteria = [
    ["OEI disturbance rejection [84]", row.oeiDisturbance],
    ["discrete gust [84]",             row.discreteGust],
    ["continuous turbulence [84]",     row.continuousTurbulence],
    ["disturbance rejection [85]",     row.disturbance85],
    ["one-engine inoperative [85]",    row.oei85],
  ].filter(([, v]) => v != null);
  const governing = criteria.reduce((a, b) => (b[1] > a[1] ? b : a));

  /* For a MIXED-control layout the answer is bracketed, not single-valued:
     the collective column is the floor, the rpm column the ceiling. Report
     both so the reader can see that the gap is in the published criteria, not
     in their design. */
  const entry = ROTOR_CONTROL_BY_CONFIG[p.configType];
  const isMixed = !!(entry && entry.mixed) && p.rotorControl == null;
  const otherKey = `${family}/${control === "rpm" ? "collective" : "rpm"}`;
  const otherRow = MOTOR_TRANSIENT_TABLE[otherKey] || MOTOR_TRANSIENT_TABLE["hex/collective"];
  const otherCriteria = [otherRow.oeiDisturbance, otherRow.discreteGust,
    otherRow.continuousTurbulence, otherRow.disturbance85, otherRow.oei85].filter(v => v != null);
  const otherGoverning = otherCriteria.length ? Math.max(...otherCriteria) : null;

  const ic = rotorInterconnectFor(p.configType, p.rotorInterconnect);

  /* -- IS THE REQUIREMENT A NUMBER, OR A RANGE? --------------------------
     Two distinct situations make the published criterion INDETERMINATE for
     this aircraft, and neither is a shortfall in the design:

       MIXED CONTROL   the layout has variable-pitch AND fixed-pitch rotors
                       (Archer: 6 tilt + 6 lift). Table 4 has no such column,
                       so the true value lies between the two published ones.
       INTERCONNECTED  every Table 4 column is un-shafted, and the paper says
                       shafts LOWER transients. The published value is then an
                       UPPER BOUND on this aircraft, not its requirement.

     `determinate` distinguishes "the design cannot do this" from "nobody has
     published what this design must do". Scoring the second as a failure is
     how a tool blames a user for a gap in the literature. */
  const determinate = !isMixed && !ic.interconnected;
  const floor = isMixed && otherGoverning != null
    ? Math.min(otherGoverning, governing[1])
    : (ic.interconnected ? null : null);
  const ceiling = isMixed && otherGoverning != null
    ? Math.max(otherGoverning, governing[1])
    : (ic.interconnected ? governing[1] : null);

  return {
    column: row.label, control, key,
    controlBasis: rotorControlFor(p.configType, p.rotorControl).basis,
    mixed: isMixed,
    interconnected: ic.interconnected,
    interconnectBasis: ic.basis,
    determinate,
    indeterminateReason: determinate ? null
      : (isMixed
          ? "mixed control - the layout has both variable-pitch and fixed-pitch "
            + "rotors and Table 4 publishes no column for that, so the requirement "
            + "is bracketed between the two published columns"
          : "interconnected drive - every Table 4 column is for INDEPENDENT rotors, "
            + "and the paper states that removing interconnecting shafts RAISES "
            + "transients, so the published figure is an upper bound here, not a "
            + "requirement. A motor failure on a shafted drive does not cost a rotor"),
    factorFloor: floor,
    factorCeiling: ceiling,
    factor: governing[1],          // required peak motor power / hover power per motor
    governedBy: governing[0],
    criteria: Object.fromEntries(criteria),
    substituted,
    /* Rotor count actually asked for versus the column supplied. A 2-rotor
       aircraft scored on a hexacopter column is a fact the reader should see. */
    nRotors: n, columnFamily: family,
  };
}
