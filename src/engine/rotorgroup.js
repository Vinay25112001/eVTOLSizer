/* =====================================================================
   ROTOR GROUP — blades + hub and hinge
   =====================================================================
   The largest remaining METHOD mismatch in this engine. Everything else in the
   structure group had migrated to the rotorcraft community's own equations
   (wing AFDD93, fuselage AFDD84, drive system AFDD00, nacelle AFDD82) while
   the rotor group was still:

       rotors = nRotors * 2.0 kg/m^2 * diskArea          // [CAL], no source

   A single invented constant per square metre of disk. It cannot respond to
   blade count, chord, tip speed or flap frequency — none of which it takes as
   inputs — even though the rotor group is 25-36% of structural weight on
   NASA's reference vehicles.

   ── THE EQUATIONS, FROM THE PRIMARY SOURCE ───────────────────────────
   Johnson, NDARC Theory, NASA TP-20250010468 section 29-2 "Rotor Group",
   recovered in raw reading order (the -layout extraction scatters every
   exponent away from its base — the same failure mode that blocked AFDD84 for
   months, and the same fix):

     AFDD82
       w_blade = 0.02606  N_rotor N_blade^0.6592 R^1.3371 c^0.9959
                          Vtip^0.6682 nu_blade^2.5279
       w_hub   = 0.003722 N_rotor N_blade^0.2807 R^1.5377 Vtip^0.4290
                          nu_hub^2.1414 (W_blade/N_rotor)^0.5505
       "Based on 37 aircraft, the average error of the blade equation is 7.7%.
        Based on 35 aircraft, ... the hub equation is 10.2%."

     AFDD00
       w_blade = 0.0024419 f_tilt N_rotor N_blade^0.53479 R^1.74231 c^0.77291
                           Vtip^0.87562 nu_blade^2.51048
       w_hub   = 0.0061182 N_rotor N_blade^0.20373 R^0.60406 Vtip^0.52803
                           nu_hub^1.00218 (W_blade/N_rotor)^0.87127
       "f_tilt = 1.17940 for tilting rotors; 1.0 otherwise. Based on 51
        aircraft, ... the blade equation is 7.9% ... the hub equation is 12.2%."

   Units, NDARC table 29-3: R and c in ft, Vtip in ft/sec, nu in per-rev,
   weights in lb.

   NDARC also notes: "If the weight is evaluated separately for each rotor,
   then N_rotor = 1 should be used in the equations." This module evaluates the
   whole set at once, so N_rotor is the real count — matching how the equation
   was fitted.

   ── CHORD COMES FROM SOLIDITY, WHICH IS PUBLISHED ────────────────────
   `c` is not usually a design input here, but thrust-weighted solidity is, and
   NASA publishes it for every reference vehicle. For a rectangular blade
       sigma = N_blade c / (pi R)   =>   c = sigma pi R / N_blade
   so the chord is derived rather than assumed whenever solidity is known.

   ── TWO INPUTS ARE NOT PUBLISHED, AND THAT IS THE HONEST LIMITATION ──
   * N_blade — NASA's Table 12 does not give blade count for the concept
     vehicles. Default 3.
   * nu (flap natural frequency, per rev) — not published per vehicle either.
     Default 1.25, from Johnson & Silva 2022: "design CT/sigma = 0.10 and flap
     frequency of 1.25/rev (typical of hingeless helicopter rotors)", in the
     same paper's rotor-weight trade study. That is the right authors and the
     right vehicle class, but it is a TRADE-STUDY value, not a per-vehicle one.

   **nu enters at the 2.51 power, so this is the most sensitive input in the
   module**: 1.05 vs 1.25 changes blade weight by a factor of 1.55. Any use of
   this model must report the nu it assumed. That sensitivity is precisely why
   the equation is not simply "better" than the [CAL] constant it replaces —
   it is better *if* nu is known, and worse if it is guessed. The component
   harness (validation/components.mjs) measures both against NASA's published
   rotor group weights rather than assuming.

   ── THE [CAL] MODEL IS RETAINED, DELIBERATELY ────────────────────────
   `rotorMassModel: "diskArea"` keeps the old constant. It is the honest
   fallback when blade count and flap frequency are unknown, and keeping it
   selectable is what makes the comparison auditable instead of a claim.
   ===================================================================== */

const LB = 2.20462;
const FT = 3.28084;

/* =====================================================================
   BLADE LOADING — the check this engine did not make
   =====================================================================
   Solidity was a FIXED 0.10 for every design, independent of disk loading.
   That is not a modelling simplification, it produces IMPOSSIBLE AIRCRAFT:

       CT/sigma = DL / (rho Vtip^2 sigma)

   so holding sigma fixed while disk loading rises drives blade loading
   straight through stall. Measured on this tool's own configurations at a
   fixed sigma = 0.10:

       multicopter   DL  3.1 lb/ft2   CT/sigma 0.043   over-solid, heavy blades
       lift+cruise   DL 13.1          CT/sigma 0.182   PAST HOVER STALL (0.14)
       tiltrotor     DL 12.4          CT/sigma 0.172   PAST HOVER STALL

   A rotor at CT/sigma 0.18 cannot produce the thrust the rest of the model
   assumes it produces. Every winged configuration was in that state.

   ── NASA SCALE SOLIDITY WITH DISK LOADING; SO SHOULD WE ──────────────
   From their published Table 12 (solidity, disk loading and tip speed are all
   given, so CT/sigma is recoverable):

       Quad-E   sigma 0.0550  DL  3.00   ->  CT/sigma 0.0759
       SbS-E    sigma 0.0580  DL  3.50   ->           0.0839
       L+C-E    sigma 0.2670  DL 13.1    ->           0.0603
       TW-TE    sigma 0.2470  DL 20.0    ->           0.1126

   Solidity moves by a factor of FIVE across that set — 0.055 to 0.267 — while
   blade loading stays in a narrow band. Blade loading is the design constant;
   solidity is the consequence. This engine had it exactly backwards.

   The project already quoted the governing statement and never acted on it —
   engine/wing.js carries Johnson & Silva 2022 sec.6.3: "The design hover
   CT/sigma must be low enough and the wing area large enough that transition
   from rotor-borne to wing-borne flight is possible over a reasonable speed
   range."

   [CAL] DESIGN_CT_SIGMA default 0.083 is the mean of those four NASA vehicles
   (range 0.060-0.113, n=4). It is a DESIGN CHOICE, not a physical constant:
   lower buys manoeuvre and one-rotor-out margin at the cost of blade area and
   weight. Override with p.designCTsigma.

   THE MEAN IS THE WRONG STATISTIC, AND USING IT WAS A DEFECT.
   A single 0.083 applied to every layout forced solidity ~87% high on a
   collective-control tiltrotor, which drove blade weight, which drove the
   sizing loop into divergence: Joby S4 and Vertical VX4 -- both published,
   FLYING aircraft -- ran away to ~19,000 kg. Real aircraft do not have that
   problem, so the model did.

   The 0.060-0.113 spread is not scatter to be averaged away. It is EXPLAINED,
   and Johnson & Silva 2022 sec.6.3 explain it, for rotor speed control with
   fixed collective:
     "the rotor CT/sigma increases with speed initially and then decreases.
      The increase in CT/sigma might be limited by maximum blade loading,
      perhaps requiring a SMALLER DESIGN CT/sigma AT HOVER (hence larger blade
      area)."
   A fixed-pitch, rpm-controlled rotor must hold back blade loading in hover
   because it has no collective with which to shed it as speed builds. A
   variable-pitch rotor does not. NASA's own vehicles land exactly where that
   reasoning puts them -- the RPM-controlled lift+cruise is the LOWEST of the
   four at 0.0603, the collective tiltwing the HIGHEST at 0.1126.

   So the design blade loading is taken PER CONFIGURATION from the closest
   published NASA vehicle rather than from a mean across all of them. Each
   value below is [SRC], recovered as CT/sigma = DL/(rho Vtip^2 sigma) from the
   disk loading, tip speed and thrust-weighted solidity that Table 12 publishes
   for that vehicle. Recovering solidity from these therefore reproduces NASA's
   OWN published solidity for all four vehicles, not just one. */
export const DESIGN_CT_SIGMA = 0.083;   // legacy mean; retained for callers that pass no configuration

export const DESIGN_CT_SIGMA_BY_CONFIG = {
  multicopter:  { v: 0.0759, src: "[SRC] NASA Table 12 Quad-E: DL 3.00, Vtip 550, sigma 0.0550" },
  sideBySide:   { v: 0.0839, src: "[SRC] NASA Table 12 SbS-E: DL 3.50, Vtip 550, sigma 0.0580" },
  liftcruise:   { v: 0.0603, src: "[SRC] NASA Table 12 L+C-E: DL 13.1, Vtip 585, sigma 0.267 (fixed-pitch, rpm control)" },
  /* WAS 0.1126 — WHICH IS THE TILTWING'S VALUE, NOT A TILTROTOR'S. Yanev &
     Staack (Aerospace 2026, 13, 566) Table 2 publishes both, and their TW-TE
     entry recomputes to 0.1126 — identical to what sat here, confirming this
     row was carrying a tiltWING datum under a tiltROTOR label. The same table
     gives the actual tiltrotors: TR-E 0.0969 and TR6-E 0.0973 (recomputed from
     their own DL, tip speed and solidity via CT/sigma = DL/(rho Vtip^2 sigma),
     which reproduces every published value in the table to 3 decimals).
     TR6-E is a SIX-ROTOR tiltrotor, which is this configuration exactly (Joby
     S4), so it is the right row. Independent corroboration of the three rows
     that were already right: their Quad-TS 0.0748 vs our 0.0759, SbS-E 0.0838
     vs 0.0839. */
  tiltrotor:    { v: 0.0973, src: "[SRC] Yanev & Staack, Aerospace 2026 13(566) Table 2, TR6-E (six-rotor tiltrotor): DL 767 N/m2, Vtip 168 m/s, sigma 0.228" },
  tiltwing:     { v: 0.1126, src: "[SRC] NASA Table 12 TW-TE / Yanev & Staack TR: DL 20.0 lb/ft2, Vtip 550 ft/s, sigma 0.247 (collective control) — a TILTWING, kept as its own datum" },
};

/* Mixed tilt+lift layouts carry both rotor kinds. Blend the two bracketing
   published values by the fraction of rotors that tilt -- the same geometric
   argument used for hover download in configuration.js. [LAY] the blend; the
   two endpoints it interpolates between are [SRC]. */
export function designCTsigmaFor(configKey, nTilting = 0, nRotors = 0) {
  const direct = DESIGN_CT_SIGMA_BY_CONFIG[configKey];
  if (direct) return { value: direct.v, basis: direct.src };
  const lc = DESIGN_CT_SIGMA_BY_CONFIG.liftcruise.v;
  const tw = DESIGN_CT_SIGMA_BY_CONFIG.tiltrotor.v;
  const f  = (nRotors > 0) ? Math.min(1, Math.max(0, nTilting / nRotors)) : 0;
  return {
    value: lc + f * (tw - lc),
    basis: `[LAY] ${(f * 100).toFixed(0)}% tilting: blended L+C ${lc} - tiltwing ${tw} (both [SRC] NASA Table 12)`,
  };
}

/** Blade loading CT/sigma actually achieved. DL in N/m^2, Vtip in m/s. */
export const bladeLoading = (DL_Nm2, vTip_ms, sigma, rho = 1.225) =>
  (sigma > 0 && vTip_ms > 0)
    ? DL_Nm2 / (rho * vTip_ms * vTip_ms * sigma) : NaN;

/** Solidity required to hold a design blade loading at a given disk loading.
    UNCLAMPED — the physically required value, which may be unbuildable. */
export const designSolidityRaw = (DL_Nm2, vTip_ms, ctSigma = DESIGN_CT_SIGMA, rho = 1.225) =>
  (vTip_ms > 0 && ctSigma > 0) ? DL_Nm2 / (rho * vTip_ms * vTip_ms * ctSigma) : NaN;

/* Buildable bounds. 0.40 is well beyond anything published — NASA's highest of
   the four Table 12 vehicles is 0.267 — so hitting it means the design is NOT
   buildable, not that it is merely aggressive. */
export const SOLIDITY_MAX = 0.40;
export const SOLIDITY_MIN = 0.02;

/** Clamped to what can actually be built. THE CLAMP MUST NOT BE SILENT:
    blade loading is computed from the CLAMPED solidity, so a design that
    needed sigma > 0.40 would report a healthy CT/sigma and pass the hover-stall
    check on a rotor the model could not build. Vertical VX4 did exactly that —
    sigma pinned at 0.400, CT/sigma reported 0.063, check PASSED. Callers must
    compare against designSolidityRaw and flag the difference. */
export const designSolidity = (DL_Nm2, vTip_ms, ctSigma = DESIGN_CT_SIGMA, rho = 1.225) => {
  const raw = designSolidityRaw(DL_Nm2, vTip_ms, ctSigma, rho);
  return isFinite(raw) ? Math.min(SOLIDITY_MAX, Math.max(SOLIDITY_MIN, raw)) : 0.10;
};

/* ── FLAP FREQUENCY IS A PROPERTY OF THE ROTOR TYPE, AND IT IS PUBLISHED ──
   This defaulted to a bare 1.10 with no source — a number sitting between the
   two real ones and matching neither. nu enters the AFDD blade equation at the
   2.53 power, so it is the single most sensitive input in the rotor group, and
   getting it wrong by rotor TYPE is what made the lift+cruise rotor group come
   out 51% light while every helicopter-like vehicle sat inside 20%.

   NASA publish both values, for these very concept vehicles — "Concept
   Vehicles for VTOL Air Taxi Operations", Table 8 discussion:

     "Flapping (flap frequency 1.03/rev, 4% hinge offset) and hingeless
      (flap frequency 1.25/rev) rotors are considered."

   And Johnson & Silva 2022 state which type each vehicle uses:
     quadrotor    "using FLAPPING rotors and collective control"      -> 1.03
     lift+cruise  "This design has RIGID rotors for hover and low speed
                   lift" / "These HINGELESS, fixed-pitch rotors"      -> 1.25
   They also state the consequence, which is exactly the error signature seen
   here: "The hingeless or rigid rotor generates higher blade and hub loads,
   which implies HIGHER ROTOR WEIGHT and vibration-control weight."

   THIS IS NOT A FIT. Assigning nu by published rotor type takes the rotor
   group from 24.7% MAE (best achievable with ANY single uniform nu) to 17.2%
   across NASA's eight variants, and it does so from a sourced physical
   property rather than by tuning a sensitive exponent to the answer.

   A rotor that STOPS in cruise has to survive edgewise flow as a cantilever
   with large hub moments, so it must be rigid — that is why NASA's lift+cruise
   is hingeless. The default therefore keys on whether the layout stops rotors.
   [LAY] for layouts NASA did not publish a type for. Override p.rotorFlapFreq. */
export const ROTOR_FLAP_FREQ = {
  flapping:  { nu: 1.03, src: "[SRC] NASA Concept Vehicles for VTOL Air Taxi Ops: flapping, 4% hinge offset" },
  hingeless: { nu: 1.25, src: "[SRC] NASA Concept Vehicles for VTOL Air Taxi Ops: hingeless/rigid" },
};

export function flapFreqFor(p) {
  const key = p?.configType;
  const stops = (p?.nRotorsStopped ?? 0) > 0
    || key === "liftcruise" || key === "hybrid" || key === "hybridPusher";
  return stops ? ROTOR_FLAP_FREQ.hingeless.nu : ROTOR_FLAP_FREQ.flapping.nu;
}

export function flapFreqBasis(p) {
  if (p?.rotorFlapFreq != null) return "explicit input";
  const nu = flapFreqFor(p);
  return nu === ROTOR_FLAP_FREQ.hingeless.nu
    ? `hingeless/rigid — this layout stops rotors in cruise, so the blade must survive edgewise flow as a cantilever. ${ROTOR_FLAP_FREQ.hingeless.src}`
    : `flapping/articulated. ${ROTOR_FLAP_FREQ.flapping.src}`;
}

/* [SRC] NDARC TP-20250010468 29-2. All imperial in, lb out. */
export const afdd82Blade = (nRotor, nBlade, R_ft, c_ft, vTip_fts, nu) =>
  0.02606 * nRotor * Math.pow(nBlade, 0.6592) * Math.pow(R_ft, 1.3371) *
  Math.pow(c_ft, 0.9959) * Math.pow(vTip_fts, 0.6682) * Math.pow(nu, 2.5279);

export const afdd82Hub = (nRotor, nBlade, R_ft, vTip_fts, nu, wBlade_lb) =>
  0.003722 * nRotor * Math.pow(nBlade, 0.2807) * Math.pow(R_ft, 1.5377) *
  Math.pow(vTip_fts, 0.4290) * Math.pow(nu, 2.1414) *
  Math.pow(Math.max(1e-9, wBlade_lb / nRotor), 0.5505);

export const afdd00Blade = (nRotor, nBlade, R_ft, c_ft, vTip_fts, nu, fTilt = 1.0) =>
  0.0024419 * fTilt * nRotor * Math.pow(nBlade, 0.53479) * Math.pow(R_ft, 1.74231) *
  Math.pow(c_ft, 0.77291) * Math.pow(vTip_fts, 0.87562) * Math.pow(nu, 2.51048);

export const afdd00Hub = (nRotor, nBlade, R_ft, vTip_fts, nu, wBlade_lb) =>
  0.0061182 * nRotor * Math.pow(nBlade, 0.20373) * Math.pow(R_ft, 0.60406) *
  Math.pow(vTip_fts, 0.52803) * Math.pow(nu, 1.00218) *
  Math.pow(Math.max(1e-9, wBlade_lb / nRotor), 0.87127);

/* [SRC] f_tilt = 1.17940 for tilting rotors, 1.0 otherwise (NDARC 29-2). */
export const F_TILT = 1.17940;

/**
 * Rotor group mass (blades + hub and hinge), all rotors.
 *
 * @param {object} p reads `rotorMassModel` ("afdd00" default | "afdd82" |
 *   "diskArea"), `nBlades`, `rotorFlapFreq`, `solidity`, `rotorTechFactor`,
 *   `bladeChord_m`.
 * @param {object} g { nRotors, radius_m, tipSpeed_ms, diskArea_m2, isTilting }
 * @param {number} calKgPerM2 the legacy [CAL] disk-area constant.
 */
export function rotorGroup(p = {}, g = {}, calKgPerM2 = 2.0) {
  const model = p.rotorMassModel ?? "afdd00";
  const nRotor = Math.max(1, g.nRotors ?? 1);
  const R_m = Math.max(1e-6, g.radius_m ?? 0);
  const vTip = Math.max(1e-6, g.tipSpeed_ms ?? 0);
  const tf = Math.max(0, p.rotorTechFactor ?? 1.0);

  if (model === "diskArea") {
    const mass = tf * nRotor * calKgPerM2 * Math.max(0, g.diskArea_m2 ?? 0);
    return { mass, bladeKg: null, hubKg: null, model: "diskArea", chord_m: null,
      note: `[CAL] ${calKgPerM2} kg/m^2 of disk area — no blade count, chord, `
          + `tip speed or flap frequency dependence` };
  }

  const nBlade = Math.max(2, Math.round(p.nBlades ?? 3));
  /* [CAL] Flap natural frequency, per rev — the weakest input in this module,
     and it enters at the 2.51 power. NOT published for the NASA reference
     vehicles, and NDARC states no typical value.
     1.10 represents a HINGELESS rotor, the right class for small stiff eVTOL
     lift rotors. Articulated rotors sit near 1.02-1.04; Johnson & Silva quote
     1.25 as "typical of hingeless helicopter rotors", but for large helicopter
     blades in a trade study, not for these vehicles.
     MEASURED against NASA Table 12 (validation/components.mjs), AFDD82 3-blade:
        nu 1.03 -> MAE 25.5%    nu 1.10 -> 29.1%    nu 1.25 -> 64.4%
     1.03 scores best and is deliberately NOT chosen for that reason. */
  const nu = Math.max(1.0, p.rotorFlapFreq ?? flapFreqFor(p));
  /* Chord from solidity when available, else an explicit chord, else fall back
     to the [CAL] model rather than inventing a chord. */
  const sigma = p.solidity;
  const c_m = p.bladeChord_m != null ? p.bladeChord_m
            : (sigma > 0 ? sigma * Math.PI * R_m / nBlade : null);
  if (!(c_m > 0)) {
    const mass = tf * nRotor * calKgPerM2 * Math.max(0, g.diskArea_m2 ?? 0);
    return { mass, bladeKg: null, hubKg: null, model: "diskArea(fallback)", chord_m: null,
      note: "no solidity or chord supplied — AFDD needs a chord, so the [CAL] "
          + "disk-area model was used rather than assuming one" };
  }

  const R_ft = R_m * FT, c_ft = c_m * FT, vTip_fts = vTip * FT;
  const fTilt = g.isTilting ? F_TILT : 1.0;

  const wBlade = model === "afdd82"
    ? afdd82Blade(nRotor, nBlade, R_ft, c_ft, vTip_fts, nu)
    : afdd00Blade(nRotor, nBlade, R_ft, c_ft, vTip_fts, nu, fTilt);
  const wHub = model === "afdd82"
    ? afdd82Hub(nRotor, nBlade, R_ft, vTip_fts, nu, wBlade)
    : afdd00Hub(nRotor, nBlade, R_ft, vTip_fts, nu, wBlade);

  return {
    mass: tf * (wBlade + wHub) / LB,
    bladeKg: tf * wBlade / LB,
    hubKg: tf * wHub / LB,
    model, chord_m: c_m, nBlades: nBlade, flapFreq: nu, fTilt,
    note: `${model.toUpperCase()} blades+hub, ${nBlade} blades, chord `
        + `${c_m.toFixed(3)} m, nu=${nu} per rev`,
  };
}
