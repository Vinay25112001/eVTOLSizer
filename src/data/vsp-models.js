/* =====================================================================
   NASA OPEN-SOURCE OpenVSP eVTOL MODELS
   =====================================================================
   Geometry read directly out of the released .vsp3 files — not retyped from a
   paper, not approximated. Every number below was extracted programmatically
   from the XML and converted to SI, so the model IS the source.

   THE THREE MODELS, and what they are:

     raven  NASA Open eVTOL "RAVEN" v01_003 (released 19 May 2026). Six rotors:
            FOUR TILT (wingtip pair + forward sponson pair) and TWO LIFT-ONLY
            (aft sponson pair). The model's own notes say so: "Tilting rotors
            can be quickly switched between vertical and forward orientation
            using Model > Variable Presets > Flight Mode settings", and the file
            carries hinges for props 1-4 only. A small piloted-scale vehicle.
     swft   NASA "RAVEN SWFT" public release. The SAME 4-tilt + 2-lift
            architecture at 3.1x the rotor diameter and 3.4x the wing span — a
            large tiltrotor-class aircraft.
     bd6    Bede BD-6 v03_004. A conventional single-prop light aircraft, and
            NOT an eVTOL. It is here because it is the DONOR AIRFRAME: its
            fuselage is 177.280 in, and RAVEN's is 14.7733 ft — the same 4.50 m
            body to five significant figures. It is kept as the fixed-wing
            control case, never as an eVTOL configuration.

   ── UNITS: RESOLVED BY PHYSICS, NOT BY THE FILE ────────────────────────
   The .vsp3 files each declare SEVERAL LenUnit parms belonging to different
   sub-containers (mass properties, VSPAERO, …), and they disagree — RAVEN's
   vehicle block ends on IN while its geometry is plainly FT. Taking the wrong
   one scales an aircraft by 12x, so the unit was determined from the geometry
   itself and cross-checked three ways:

     1. THE TIRES ARE LABELLED. Both BD-6 and RAVEN carry a Gear geom with
        `DiameterIn` = 12 in main / 8 in nose — the parm name states inches, and
        those are light-aircraft tires. An aircraft with 0.30 m tires is a small
        one, which rules out reading RAVEN's 14.773 as metres (a 14.8 m fuselage
        on 12-inch wheels is not an aeroplane).
     2. BD-6 IS A KNOWN AIRCRAFT. At INCHES its span is 6.71 m and its fuselage
        4.50 m, which is the real Bede BD-6. At feet it would span 80 m.
     3. THE GLB MESHES AGREE. Each .glb bounding box matches its .vsp3 numbers
        with no conversion, and RAVEN's Z extent of 26.960 is exactly
        2 x (10.38 + 6.2/2) — tip-prop to tip-prop. The meshes therefore confirm
        the geometry but not the unit, which is why 1 and 2 decide it.

   So: bd6 = INCHES, raven = FEET, swft = FEET. Everything below is METRES.

   ── WHAT THIS IS FOR ───────────────────────────────────────────────────
   Two things, and they are different:
     - REPLICATE. `paramsFromModel()` turns a model into engine inputs so the
       tool sizes THAT aircraft, with its rotor count, diameter, solidity,
       blade count, wing and fuselage taken from the file.
     - CHECK. Because the geometry is published, anything the engine DERIVES
       from it (disk loading, wing loading, blade chord) can be scored against
       the model instead of asserted. See validation/vsp-models.mjs.
   ===================================================================== */

export const VSP_MODELS = {
  raven: {
    file: "RAVEN_v01_003_Release.vsp3", modelUnit: "FT",
    fuselageLen_m: 4.5029,
    wing: { span_m: 6.089, area_m2: 4.895, AR: 7.5742, chord_m: 0.8039, tc: 0.1561, sweep_deg: 0.0, dihedral_deg: 0.0, taper: 1.0, twist_deg: 2.9 },
    tails: [
      { name: "Vertical Tail", span_m: 0.9627, area_m2: 0.8392, AR: 1.1043 },
      { name: "Dorsal Fin", span_m: 0.6429, area_m2: 1.1691, AR: 0.3535 },
      { name: "Ventral Fin", span_m: 1.0415, area_m2: 0.2533, AR: 4.2818 },
      { name: "Stabilator", span_m: 1.6949, area_m2: 1.09, AR: 2.6355 },
      { name: "Strakes", span_m: 1.0419, area_m2: 0.1569, AR: 6.9153 },
    ],
    rotors: [
      { name: "Prop1", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: true, x_m: 1.8175, y_m: -3.1638, z_m: 1.5229 },
      { name: "Prop4", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: true, x_m: 1.8175, y_m: 3.1638, z_m: 1.5229 },
      { name: "Prop2", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: true, x_m: 0.6529, y_m: -1.3106, z_m: 1.2587 },
      { name: "Prop5", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: false, x_m: 3.0304, y_m: -1.3106, z_m: 1.2575 },
      { name: "Prop3", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: true, x_m: 0.6529, y_m: 1.3106, z_m: 1.2587 },
      { name: "Prop6", D_m: 1.8898, blades: 3, solidity: 0.132, tilts: false, x_m: 3.0304, y_m: 1.3106, z_m: 1.2575 },
    ],
  },
  swft: {
    file: "RAVEN SWFT VSP Public Release.vsp3", modelUnit: "FT",
    fuselageLen_m: 15.6566,
    wing: { span_m: 20.8971, area_m2: 58.1211, AR: 7.5134, chord_m: 2.7813, tc: 0.1561, sweep_deg: 0.0, dihedral_deg: 0.0, taper: 1.0, twist_deg: 0.0 },
    tails: [
      { name: "Horizontal Stabilator", span_m: 5.2578, area_m2: 11.707, AR: 2.3614 },
      { name: "Vertical Stabilizer", span_m: 3.224, area_m2: 9.4244, AR: 1.1029 },
      { name: "Main Gear Struts", span_m: 5.1816, area_m2: 3.7161, AR: 4.5101 },
    ],
    rotors: [
      { name: "L Inboard Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: true, x_m: 1.5956, y_m: -4.5022, z_m: 2.5598 },
      { name: "R Inboard Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: true, x_m: 1.5956, y_m: 4.5022, z_m: 2.5598 },
      { name: "L Hover Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: false, x_m: 9.529, y_m: -4.5022, z_m: 2.7869 },
      { name: "R Hover Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: false, x_m: 9.529, y_m: 4.5022, z_m: 2.7869 },
      { name: "L Outboard Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: true, x_m: 5.3559, y_m: -10.889, z_m: 3.6764 },
      { name: "R Outboard Proprotor", D_m: 5.9436, blades: 3, solidity: 0.1696, tilts: true, x_m: 5.3559, y_m: 10.889, z_m: 3.6764 },
    ],
  },
  bd6: {
    file: "BD-6_v03_004.vsp3", modelUnit: "IN",
    fuselageLen_m: 4.5029,
    wing: { span_m: 6.7097, area_m2: 5.3855, AR: 8.3263, chord_m: 0.7434, tc: 0.1561, sweep_deg: 0.0, dihedral_deg: 0.0, taper: 0.7744, twist_deg: 3.11 },
    tails: [
      { name: "Stabilator", span_m: 1.6949, area_m2: 1.09, AR: 2.6355 },
      { name: "Strakes", span_m: 1.0419, area_m2: 0.1569, AR: 6.9153 },
      { name: "Vertical Tail", span_m: 0.9627, area_m2: 0.8392, AR: 1.1043 },
      { name: "Dorsal Fin", span_m: 0.6429, area_m2: 1.1691, AR: 0.3535 },
      { name: "Ventral Fin", span_m: 1.0415, area_m2: 0.2533, AR: 4.2818 },
    ],
    rotors: [
      { name: "Prop", D_m: 1.2954, blades: 3, solidity: 0.1696, tilts: false, x_m: 0.2127, y_m: 0.0, z_m: 0.4821 },
    ],
  },};

/* Human-facing metadata, kept apart from the extracted geometry so it is
   obvious which numbers came out of the file and which are description. */
export const VSP_META = {
  raven: { label: "NASA RAVEN v01_003",
    subtitle: "6 rotors — 4 tilt + 2 lift-only, piloted scale",
    configType: "hybrid", isEVTOL: true,
    src: "NASA Open eVTOL RAVEN, released 19 May 2026. Work of the U.S. "
       + "Government, not subject to copyright protection in the United States." },
  swft:  { label: "NASA RAVEN SWFT",
    subtitle: "6 proprotors — 4 tilt + 2 lift-only, large tiltrotor class",
    configType: "hybrid", isEVTOL: true,
    src: "NASA RAVEN SWFT VSP public release (090225)." },
  bd6:   { label: "Bede BD-6 (donor airframe)",
    subtitle: "conventional single-prop light aircraft — NOT an eVTOL",
    configType: null, isEVTOL: false,
    src: "BD-6 v03_004. Included because RAVEN is built on this fuselage: "
       + "177.280 in and 14.7733 ft are the same 4.50 m body." },
};

const PI = Math.PI;

/** Rotors that carry the aircraft in hover — all of them, tilting or not. */
export function liftRotors(m) { return m.rotors; }
/** Rotors that tilt to provide cruise thrust. */
export function tiltingRotors(m) { return m.rotors.filter(r => r.tilts); }
/** Rotors that stop in cruise and are dead drag. */
export function liftOnlyRotors(m) { return m.rotors.filter(r => !r.tilts); }

/** Total hover disk area, m². */
export function diskArea(m) {
  return m.rotors.reduce((s, r) => s + PI * (r.D_m / 2) ** 2, 0);
}

/** Largest |y| of any rotor centre — the rotor-array half-width. */
export function rotorHalfSpan(m) {
  return m.rotors.reduce((s, r) => Math.max(s, Math.abs(r.y_m)), 0);
}

/**
 * DERIVED GEOMETRY THE ENGINE CAN BE SCORED AGAINST.
 * Disk and wing loading need a weight, which the model does NOT publish — so
 * they are returned as functions of MTOW rather than baked in at an assumed
 * one. Inventing a gross weight to quote a disk loading would be exactly the
 * kind of unsourced number this project refuses.
 */
export function derived(m) {
  const A = diskArea(m);
  const nTilt = tiltingRotors(m).length;
  return {
    nRotors: m.rotors.length, nTilting: nTilt, nLiftOnly: m.rotors.length - nTilt,
    diskArea_m2: +A.toFixed(4),
    rotorDiam_m: m.rotors[0]?.D_m ?? null,
    blades: m.rotors[0]?.blades ?? null,
    solidity: m.rotors[0]?.solidity ?? null,
    /* Blade chord implied by the model's own solidity and blade count:
       sigma = N_b c / (pi R)  =>  c = sigma pi R / N_b. A published solidity
       AND a published diameter over-determine the chord, so this is a real
       cross-check on the rotor model rather than another input. */
    bladeChord_m: m.rotors[0]
      ? +(m.rotors[0].solidity * PI * (m.rotors[0].D_m / 2) / m.rotors[0].blades).toFixed(4)
      : null,
    rotorHalfSpan_m: +rotorHalfSpan(m).toFixed(4),
    wingSpan_m: m.wing.span_m, wingArea_m2: m.wing.area_m2, wingAR: m.wing.AR,
    fuselageLen_m: m.fuselageLen_m,
    /* Rotors sit OUTBOARD of the wingtip on both eVTOL models — an arrangement
       the boom model has to respect, so it is reported rather than assumed. */
    rotorsOutboardOfTip: rotorHalfSpan(m) > m.wing.span_m / 2,
    diskLoadingAt: (MTOW_kg) => (MTOW_kg * 9.80665) / A,
    wingLoadingAt: (MTOW_kg) => (MTOW_kg * 9.80665) / m.wing.area_m2,
  };
}

/* =====================================================================
   REPLICATE — turn a published model into engine inputs
   =====================================================================
   Only the parameters the model ACTUALLY FIXES are set. Everything that
   depends on gross weight is deliberately left alone, because the .vsp3 files
   publish geometry and nothing else: there is no mass, no power, no mission in
   them. Inventing a gross weight so a disk loading could be quoted would be
   the same unsourced-number defect this project keeps removing.

   THE ONE THAT LOOKS MISSING AND IS NOT: `wingLoadingNm2`. The engine derives
   wing AREA from W/S and MTOW, and MTOW is the loop's own answer — so a fixed
   published area cannot be imposed as an input without circularity. Instead
   `wingLoadingForMTOW()` below converts the model's real area into the W/S that
   reproduces it AT A STATED WEIGHT, and `compareToModel()` scores the geometry
   the loop actually produced against the file. That keeps the published area a
   CHECK on the result rather than a disguised input.
*/
export function paramsFromModel(key, base = {}) {
  const m = VSP_MODELS[key], meta = VSP_META[key];
  if (!m || !meta) return null;
  const d = derived(m);
  if (!meta.isEVTOL) return null;      // BD-6 is a fixed-wing control case
  return {
    ...base,
    configType: meta.configType,
    /* Rotor set, exactly as modelled. */
    nPropHover: d.nRotors,
    propDiam:   d.rotorDiam_m,
    solidity:   d.solidity,
    nBlades:    d.blades,
    /* Lift-only rotors stop in cruise and drag; the model says which ones do
       by which ones carry a tilt hinge. */
    nRotorsStopped: d.nLiftOnly,
    /* Wing shape — the weight-independent half. */
    AR:    m.wing.AR,
    taper: m.wing.taper,
    tc:    m.wing.tc,
    /* Fuselage length is PUBLISHED, so it must not be re-estimated. The engine
       otherwise scales it as fusLen * (payload/453)^(1/3) from a Joby anchor,
       which overrode the model outright — measured at -23.8% on RAVEN and
       +38.4% on SWFT before this flag was set. A scaling law is for when the
       length is unknown; here it is a fact in the file. */
    fusLen: m.fuselageLen_m,
    fuselageSizing: "fixed",
    /* The published diameter must survive: the disk-loading rotor sizer would
       otherwise recompute it and the replication would stop being one. */
    rotorSizing: "fixedDiameter",
    vspModel: key,
  };
}

/**
 * THE MISSION THE WING IMPLIES — the non-circular inverse, and a real check on
 * whether a mission is compatible with the airframe being replicated.
 *
 * A published wing area fixes W/S once a weight is chosen, and W/S with a
 * cruise-CL ceiling fixes a MINIMUM CRUISE SPEED:
 *     CL = (W/S) / (0.5 rho V^2) <= CLmax,cruise   =>   V >= sqrt(2(W/S)/(rho CLmax))
 * Fly slower than this and the wing cannot be the published one: the engine's
 * CL ceiling takes over and grows the wing, which is exactly what happened on
 * the first replication run — RAVEN was flown at 60 m/s, needed 64, and came
 * out 14% large in area. That is the engine behaving correctly and the MISSION
 * being wrong for the airframe, so it is surfaced rather than worked around.
 */
export function minCruiseSpeedFor(key, MTOW_kg, clCruiseMax = 0.90, rho = 1.112) {
  const WS = wingLoadingForMTOW(key, MTOW_kg);
  return WS ? Math.sqrt(2 * WS / (rho * clCruiseMax)) : null;
}

/** W/S that reproduces the model's published wing area at a stated MTOW. */
export function wingLoadingForMTOW(key, MTOW_kg) {
  const m = VSP_MODELS[key];
  return m ? (MTOW_kg * 9.80665) / m.wing.area_m2 : null;
}

/**
 * SCORE THE SIZED AIRCRAFT AGAINST THE PUBLISHED MODEL.
 * Geometry only — the files contain nothing else to score against, and saying
 * so is more useful than padding the table with quantities neither side has.
 */
export function compareToModel(key, R) {
  const m = VSP_MODELS[key];
  if (!m || !R) return null;
  const d = derived(m);
  const rows = [
    ["Rotor diameter", "m", d.rotorDiam_m, R.propDiam],
    ["Rotor count", "", d.nRotors, R.nPropHover ?? null],
    ["Disk area", "m²", d.diskArea_m2,
      R.propDiam && R.nPropHover ? Math.PI * (R.propDiam / 2) ** 2 * R.nPropHover : null],
    ["Wing span", "m", d.wingSpan_m, R.bWing ?? null],
    ["Wing area", "m²", d.wingArea_m2, R.Swing ?? null],
    /* AR is recomputed from the span and area the engine actually produced,
       not read back from the input, so it tests the wing model rather than
       echoing a parameter. */
    ["Wing aspect ratio", "", d.wingAR,
      (R.bWing > 0 && R.Swing > 0) ? (R.bWing * R.bWing) / R.Swing : null],
    ["Fuselage length", "m", d.fuselageLen_m, R.fusLenEff ?? R.fusLen ?? null],
    /* THE OVER-DETERMINED ONE, and therefore the most interesting. The model
       publishes diameter, blade count AND solidity, so its blade chord is fixed
       three ways over; the engine derives its own from the same relation. If
       these disagree the rotor model and the file disagree about the blade. */
    ["Blade chord", "m", d.bladeChord_m, R.ChordBl ?? null],
  ];
  return {
    model: key, label: VSP_META[key].label,
    rows: rows.map(([k, u, pub, got]) => ({
      key: k, unit: u, published: pub, engine: got,
      errPct: (got != null && pub) ? +(100 * (got - pub) / pub).toFixed(1) : null,
    })),
    note: "The .vsp3 files publish GEOMETRY only — no mass, power or mission — "
        + "so only geometry is scored. Wing area is a CHECK here, never an input.",
  };
}
