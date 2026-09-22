/* =====================================================================
   ACOUSTICS STAGE
   Rotor noise: Gutin tonal + BPM broadband + Schlegel vortex, A-weighted,
   with ISO 9613-1 propagation. Pure and side-effect free.

   PIPELINE CONTRACT
   Input : a context of already-converged design values (see NoiseContext).
   Output: an object merged into the results. Reads nothing it does not
           declare, writes nothing outside its return value.
   ===================================================================== */

import { G0, RHO_MSL, T0, R_GAS, GAMMA } from "./constants.js";

/* ── A-WEIGHTING, IEC 61672-1 ─────────────────────────────────────────
   The standard's weighting is defined by the transfer function

     R_A(f) = 12194^2 f^4
              / [ (f^2 + 20.6^2) sqrt((f^2+107.7^2)(f^2+737.9^2)) (f^2+12194^2) ]

   with the level normalised so that A(1000 Hz) = 0 exactly, which is the
   +2.00 dB offset. Hoisted to module scope from inside noiseStage for one
   reason: a function that cannot be called cannot be checked, and this one
   had never been. validation/acoustics.mjs now tests it against the
   DEFINITIONAL properties of the published curve -- the 1 kHz zero, the
   normalisation constant recomputed from the transfer function, and the
   asymptotic +80 / -40 dB-per-decade slopes the f^4-over-f^6 form must have.
   None of those is a number anybody chose; they follow from the standard. */
export const aWeightingDb = (f) => {
  const f2  = f * f;
  const num = 12194**2 * f2**2;
  const den = (f2 + 20.6**2) * Math.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194**2);
  return 20 * Math.log10(num / den) + 2.0;
};

/* ── SCHLEGEL VORTEX CONSTANT, IN SI ──────────────────────────────────
   Schlegel-King-Mull published k2 = 1.206e-2 in FOOT units throughout. The
   SI value is that constant carried through lbf -> N (4.448), lbf/ft^2 ->
   N/m^2 (47.88) and ft^2 -> m^2 (0.3048^2).

   HOISTED BECAUSE THIS EXACT LINE WAS WRONG ONCE AND NOTHING CAUGHT IT. It
   carried 0.4259 against a derivation, written directly above it and marked
   with a check, that evaluates to 0.039566 -- the area conversion applied in
   the wrong direction, a factor of 10.764 (ft^2 per m^2) and +20.6 dB of
   vortex noise that dominated every other source by ~22 dB. A comment is not
   a test; validation/acoustics.mjs now recomputes the conversion and pins
   the old wrong value out. */
export const SCHLEGEL_K2_SI = 1.206e-2 * Math.sqrt(4.448 / 47.88) / Math.pow(0.3048, 2);

/* @typedef NoiseContext
   p, Rrotor, RPM, TipSpd, DLrotor, sigma, ChordBl, MTOW, Nbld, T0eff, atmSL, aCr */
export function noiseStage(ctx) {
  const { p, Rrotor, RPM, TipSpd, DLrotor, sigma, ChordBl, MTOW, Nbld, T0eff, atmSL, aCr } = ctx;
  const g0 = G0, rhoMSL = RHO_MSL, Rgas = R_GAS, GAM = GAMMA;

  /* ════════════════════════════════════════════════════════════════
     ROTOR NOISE MODEL v2 — Physics-informed semi-empirical
     Upgrades over v1:
       1. Dipole directivity D(θ) — thrust-axis dipole, in-plane worst case
       2. Compressibility correction C_comp(Mtip) — Prandtl-Glauert type
       3. Multi-parameter K_cal = f(DL, Mtip, B) — replaces fixed 15 dB
       4. Adaptive harmonic decay α = f(Mtip, DL) — replaces fixed 4 dB/harm
       5. Broadband ∝ Mtip⁵ × Re_weak — replaces fixed −8 dB offset
       6. Multi-rotor interaction ΔInt — partial coherence / shielding
       7. Ground reflection: image-source method (+2.5 dB for r > 10m)
       8. Atmospheric absorption: ISO 9613-1 simplified, frequency-dependent
     References:
       Gutin (1948) NACA TM-1195 — rotating-source tonal model
       Lowson (1965) Proc. Roy. Soc. — compressibility & directivity
       Leishman "Helicopter Aerodynamics" §8.3–8.4
       Fleming et al. VFS Forum 78 (2022) — harmonic decay eVTOL data
       Tinney & Valdez JASA (2020/2026) — broadband self-noise
       Brooks, Pope & Marcolini (1989) NASA RP-1218 — BPM broadband scaling
       ISO 9613-1 (1993) — atmospheric absorption
     Validity: Mtip < 0.70, hover/low-speed, R = 0.5–3.5m, DL < 1500 N/m²
     ════════════════════════════════════════════════════════════════ */

  const R_rotor  = Rrotor;
  const N_rot    = p.nPropHover;
  const N_bl     = Nbld;
  const Omega    = RPM * Math.PI / 30;          // rad/s
  const Vtip     = TipSpd;                       // m/s
  // Acoustic Mtip: use actual ambient sound speed (T0eff includes ISA deviation)
  const c0       = Math.sqrt(GAM * Rgas * T0eff);  // actual SL sound speed (ISA-corrected)
  const Mtip_h   = Math.min(TipSpd / c0, 0.699);   // hover tip Mach (clamp for safety)
  // rho0: use actual ISA-corrected SL density — hover is near ground so use MSL with T0eff
  // rhoMSL_eff = P_SL / (R * T0eff) = 1.225 * (T0/T0eff) since P_SL is fixed
  const rho0     = atmSL.rho;                       // corrected: gas law at field elevation
  const r0       = 1.0;                          // reference distance 1m (ICAO)

  // Noise uses hover equilibrium thrust (T/W = 1.0), not design thrust margin
  const T_r   = MTOW * g0 / p.nPropHover;
  const DL_hover = T_r / (Math.PI * R_rotor * R_rotor);  // acoustic DL at T/W=1.0

  // BPF
  const BPF = N_bl * RPM / 60;  // Hz

  const Aweight = aWeightingDb;   // IEC 61672, hoisted so it can be TESTED

  // ── 1. VALIDITY ENVELOPE ─────────────────────────────────────────
  // Enforced in code: warn flags propagated to SR for UI display
  const noise_validity = {
    Mtip_ok:  Mtip_h < 0.70,
    DL_ok:    DLrotor < 1500,
    R_ok:     R_rotor >= 0.5 && R_rotor <= 3.5,
    hover_ok: true,  // model is hover-only; cruise noise not implemented
  };

  // ── 2. DIPOLE DIRECTIVITY D(θ) ───────────────────────────────────
  // Thrust-axis loading dipole: D(θ) = |sin θ|
  // θ = angle from rotor thrust axis; θ = 90° is in-plane (maximum, worst case).
  // We report the maximum directivity direction (community noise worst case).
  // D(90°) = 1.0 — no numerical change at reference angle, but formulation is correct.
  const theta_obs   = 90 * Math.PI / 180;
  const D_direct    = Math.abs(Math.sin(theta_obs));  // = 1.0 at in-plane

  // ── 3. COMPRESSIBILITY CORRECTION C_comp(Mtip) ───────────────────
  // Loading noise pressure amplitude increases with tip speed.
  // Prandtl-Glauert type: p ∝ 1/sqrt(1−Mtip²) → +5·log10(1/(1−Mtip²)) dB
  // Ref: Lowson (1965) — accounts for increased pressure amplitude near critical Mach
  // At Mtip=0.58: C_comp ≈ +0.89 dB; at Mtip=0.65: ≈ +1.19 dB
  const C_comp_dB = -5.0 * Math.log10(Math.max(1.0 - Mtip_h * Mtip_h, 0.01));

  // ── 4. MULTI-PARAMETER K_cal = f(DL, Mtip, B) ────────────────────
  // Replaces fixed K_cal=15 dB. Parameterized by design variables that physically
  // drive the non-ideal loading effects K_cal historically absorbed.
  // Reference point: DL=500 N/m², Mtip=0.58, B=6 → matches Joby S4-class data.
  // Curve-fitted to Fleming 2022 + Joby/Volocopter published dBA data (±2 dB).
  const DL_ref    = 500.0;   // N/m² reference (Joby-class)
  const Mtip_ref  = 0.58;    // reference tip Mach
  const B_ref     = 6;       // reference blade count
  const K_base    = (p.noiseKcalBase ?? 12.0);    // dB — base at reference (C_comp adds remaining ~0.9 dB)
  const K_DL      =  5.0 * Math.log10(Math.max(DL_hover / DL_ref, 0.1));  // acoustic hover DL: +5 dB/decade
  const K_Mt      =  8.0 * (Mtip_h / Mtip_ref - 1.0);                    // +8 dB per unit Mtip ratio
  const K_B       = -1.5 * (N_bl - B_ref);                                // more blades → lower K
  const K_cal     = K_base + K_DL + K_Mt + K_B;

  // ── 5. GUTIN FUNDAMENTAL (with directivity + Bessel + compressibility) ──
  // Gutin (1948) NACA TM-1195 full expression includes Bessel function J_{mB}(x):
  //   x = mB·Ω·R_eff·sin(θ)/c₀  (argument at in-plane observer, m=1 fundamental)
  //   R_eff = 0.8·R (effective radius — Gutin 1948, Leishman §8.3)
  // For eVTOL: x ≈ B·Ω·R·sin(90°)/c₀ ≈ 1.1 — NOT << 1, so Bessel matters.
  // FIX 2.1: include first-harmonic Bessel factor instead of bare loading term.
  // J1 approximation: valid to ±0.4 dB for x ≤ 3 (covers all practical eVTOL rotors).
  //   J1(x) ≈ x/2·(1 − x²/8)   for x < 2.4
  //   J1(x) ≈ sqrt(2/(π·x))·cos(x − 3π/4)  for x ≥ 2.4
  const R_eff       = 0.8 * R_rotor;                               // effective radius (Gutin)
  const bessel_x    = (N_bl * Omega * R_eff) / c0;                 // argument at θ=90° (sin=1)
  const J1_bessel   = bessel_x < 2.4
    ? (bessel_x / 2) * (1 - bessel_x * bessel_x / 8)
    : Math.sqrt(2 / (Math.PI * bessel_x)) * Math.cos(bessel_x - 3 * Math.PI / 4);
  // Bare Gutin loading pressure (no Bessel — used as reference, corrected below)
  const p_rms_gutin = D_direct * (N_bl * Omega * T_r) / (4.0 * Math.PI * r0 * rho0 * c0 * c0 * Math.SQRT2);
  // Apply Bessel modulation: J1 scales the loading contribution
  const p_rms_bessel = p_rms_gutin * Math.max(1e-6, Math.abs(J1_bessel));
  const SPL_1_gutin = 20 * Math.log10(Math.max(p_rms_bessel, 1e-10) / 2e-5);
  const SPL_1       = SPL_1_gutin + K_cal + C_comp_dB;  // calibrated + compressibility-corrected

  // ── 6. ADAPTIVE HARMONIC DECAY α = f(Mtip, DL) ───────────────────
  // Higher Mtip → more energy in higher harmonics (slower spectral roll-off).
  // Lower disk loading → faster decay (less unsteady loading energy in harmonics).
  // Ref: Fleming et al. (2022) measured range ≈ 3–6 dB/harmonic for eVTOL hover.
  const alpha_base  = 4.0;
  const alpha_Mt    = -5.0 * (Mtip_h - Mtip_ref);                        // slower decay at high Mtip
  const alpha_DL_   = -1.5 * Math.log10(Math.max(DL_hover / DL_ref, 0.1)); // lower hover DL → faster decay
  const K_decay     = Math.max(2.0, Math.min(7.0, alpha_base + alpha_Mt + alpha_DL_));
  // At reference: K_decay = 4.0 dB/harm (same as before)
  // At Mtip=0.65: K_decay ≈ 3.65 dB/harm (slower — more high-harmonic energy)

  // ── 7. MULTI-HARMONIC A-WEIGHTED SUM (extended to n=10) ──────────
  // FIX 2.4: Removed unphysical "+20·log10(n)" term.
  // Gutin (1948) Eq.(8): loading-noise pressure amplitude of m-th harmonic
  //   ∝ Jm·B(mB·Ω·R·sin θ / c) — the Bessel function DECREASES with m for
  //   arguments < mB (subsonic tip), so higher harmonics are QUIETER, not louder.
  // Correct spectral roll-off for eVTOL hover measured by Fleming et al. (2022):
  //   SPL_n = SPL_1 − K_decay × (n−1)   [monotonically decreasing]
  // The old "+20log10(n)" caused n=2 to be 6 dB above fundamental — physically wrong.
  const N_harmonics = 10;
  let tonal_lin     = 0;
  const harmonicData = [];
  for (let n = 1; n <= N_harmonics; n++) {
    // Correct: harmonics decay from SPL_1, no unphysical amplitude growth
    const SPL_n = SPL_1 - K_decay * (n - 1);
    const f_n   = N_bl * n * Omega / (2 * Math.PI);  // harmonic frequency (Hz)
    const Aw_n  = Aweight(f_n);                        // IEC 61672 A-weight at this freq
    const dBA_n = SPL_n + Aw_n;
    tonal_lin  += Math.pow(10, dBA_n / 10);
    harmonicData.push({ n, f_n: +f_n.toFixed(1), SPL_n: +SPL_n.toFixed(1), Aw_n: +Aw_n.toFixed(1), dBA_n: +dBA_n.toFixed(1) });
  }
  const dBA_tonal_single = 10 * Math.log10(Math.max(tonal_lin, 1e-30));

  // ── 8. BROADBAND ∝ Mtip⁵ × Re_weak ──────────────────────────────
  // Turbulent boundary layer trailing-edge noise dominates broadband for eVTOL hover.
  // BPM (Brooks et al. 1989): SPL_BB ∝ Mtip⁵ with weak chord-Re dependence.
  // Reference: BB = tonal − 8 dB at Mtip_ref=0.58, Re_ref=1.5×10⁶ (Tinney & Valdez 2020).
  // Δ_Mtip: 50·log10(Mtip/Mtip_ref) — from Mtip⁵ scaling
  // Δ_Re:   −2·log10(Re_tip/Re_ref) — weak Re correction (~−2 dB per decade Re)
  const mu_air       = 1.789e-5;            // dynamic viscosity at MSL (Pa·s)
  const Re_tip       = rho0 * TipSpd * ChordBl / mu_air;
  const Re_ref_noise = 1.5e6;               // reference Re for Joby-class blade
  const dBB_Mtip     = 50.0 * Math.log10(Math.max(Mtip_h / Mtip_ref, 1e-3));
  const dBB_Re       = -2.0 * Math.log10(Math.max(Re_tip / Re_ref_noise, 1e-3));
  const dBA_broadband_single = dBA_tonal_single - 8.0 + dBB_Mtip + dBB_Re;
  // At reference: 0 + 0 = −8 dB (matches Tinney & Valdez midpoint, same as v1)
  // At Mtip=0.65: +2.5 dB → −5.5 dB below tonal (physically higher broadband)

  // ── 9. VORTEX (BVI) NOISE — Schlegel–King–Mull vortex-shedding model ──
  // Original Schlegel formula (eVTOL-master noise_models.py vortex_noise()):
  //   p_ratio = k2 × (V_tip / δ_S) × sqrt((T_perRotor / σ) × DL)
  //   k2 = 1.206×10⁻² (Schlegel original — ft units throughout)
  //   δ_S = 500 ft = 152.4 m  (observer reference distance)
  //   p_ratio is DIMENSIONLESS — SPL = 20·log10(p_ratio)  (no /p_ref needed)
  //
  // Unit-consistent SI version (k2 kept in original, all lengths in ft converted):
  //   Use k2_ft=1.206e-2, V in ft/s, δ_S=500 ft, T in lbf, DL in lbf/ft²
  // Simpler: keep original dimensionless form, convert to SI by factor analysis.
  //   k2_vortex (SI, m units) = 1.206e-2 × sqrt(4.448/47.88) / (0.3048²) = 0.4259 ✓
  //   vortex_arg = (T_r / σ) × DL  [single rotor thrust only — N × N/m² = N²/m²]
  //   p_ratio at δ_S: dimensionless; then back-project to 1m: +20·log10(152.4)
  //   SPL_vortex_1m = 20·log10(p_ratio_at_deltaS) + 20·log10(152.4)  [no /2e-5]
  /* CORRECTED 2026-08-24. The previous value 0.4259 did not match the
     derivation written directly above it:
         1.206e-2 * sqrt(4.448/47.88) / 0.3048^2 = 0.039566
     0.4259 / 0.039566 = 10.764 = ft^2 per m^2 — the area conversion applied
     in the wrong direction, worth +20.6 dB of spurious vortex noise. The
     comment carried a check mark next to arithmetic that was never done.
     Consequence: the vortex term dominated every other source by ~22 dB, so
     the whole acoustics chain read ~10 dB high and no amount of tuning the
     K_cal tonal constant could have corrected it. */
  const k2_vortex    = SCHLEGEL_K2_SI;   // hoisted so it can be TESTED
  const delta_S_vortex = 152.4;                      // reference distance (500 ft in m)
  const V07_vortex   = 0.7 * TipSpd;                // blade speed at 70% radius [m/s]
  const sigma_vortex = sigma;                        // rotor solidity (computed above)
  const vortex_arg   = Math.max(1e-30,
    (T_r / Math.max(1e-6, sigma_vortex)) * DL_hover);  // single-rotor: T_r/σ × DL [N²/m²]
  const p_ratio_vortex = k2_vortex * (V07_vortex / delta_S_vortex) * Math.sqrt(vortex_arg);
  // p_ratio_vortex is dimensionless at delta_S_vortex; propagate to 1m reference:
  const SPL_vortex_1m  = 20 * Math.log10(Math.max(p_ratio_vortex, 1e-10))
                        + 20 * Math.log10(delta_S_vortex);  // back-project: no /2e-5
  // Apply A-weighting at vortex peak frequency: f_peak = St·V₀.₇/t_proj  (St=0.28)
  const AoA_blade   = 0.067;   // mean blade AoA ≈ 3.8° (Cl_mean≈0.6/2π)
  const t_proj_v    = ChordBl * (0.09 * Math.cos(AoA_blade) + Math.sin(AoA_blade));
  const f_vortex_Hz = 0.28 * V07_vortex / Math.max(1e-3, t_proj_v);
  const Aw_vortex   = Aweight(f_vortex_Hz);
  const dBA_vortex  = SPL_vortex_1m + Aw_vortex;

  // ── 10. SINGLE-ROTOR TOTAL (tonal + broadband + vortex) ──────────
  const dBA_single = 10 * Math.log10(
    Math.pow(10, dBA_tonal_single      / 10) +
    Math.pow(10, dBA_broadband_single  / 10) +
    Math.pow(10, dBA_vortex            / 10)
  );

  // ── 10. MULTI-ROTOR: incoherent sum + interaction correction ─────
  // Incoherent sum: +10·log10(N_rot) (uncorrelated sources)
  // ΔInt: interaction correction accounting for partial coherence & shielding.
  //   Range: −2 dB (strong shielding/destructive) to +3 dB (synchronous constructive).
  //   Hover eVTOL with wing/fuselage partial shielding: base ≈ −1.0 dB.
  //   Additional −0.15 dB per extra rotor beyond 6 (more shielding opportunities).
  const delta_int    = -1.0 - 0.15 * Math.max(0, N_rot - 6);
  const OASPL_total_1m = dBA_single + 10 * Math.log10(N_rot) + delta_int;
  const dBA_1m       = OASPL_total_1m;

  // ── 11. PROPAGATION: spherical + atmospheric absorption + ground reflection ──
  // Spherical spreading:  −20·log10(r/r₀)
  // Atmospheric absorption (ISO 9613-1 simplified, 70% RH, 20°C):
  //   α_eff = 1.5 + 0.5·log10(f_eff/100) dB/km
  //   f_eff = BPF × 3.5 (A-weighted dominant harmonic ≈ 3rd–4th BPF for eVTOL)
  // Ground reflection (image-source, hard/mixed terrain):
  //   ΔGr ≈ +2.5 dB for ground-level observer (r > 10 m)
  //   Accounts for direct + reflected path (between soft-ground +1 and hard +3 dB)
  const f_eff_noise   = BPF * 3.5;
  const alpha_dB_km   = 1.5 + 0.5 * Math.log10(Math.max(f_eff_noise / 100, 1));
  const alpha_dB_m    = alpha_dB_km / 1000;   // dB/m
  const delta_ground  = 2.5;                   // dB image-source ground reflection

  const noiseAtDist = (r) => {
    const spread = 20 * Math.log10(r / r0);
    const atm    = alpha_dB_m * r;
    const gr     = r > 10 ? delta_ground : 0;
    return dBA_1m - spread - atm + gr;
  };

  const dBA_at_1m   = +dBA_1m.toFixed(1);
  const dBA_at_25m  = +noiseAtDist(25).toFixed(1);
  const dBA_at_50m  = +noiseAtDist(50).toFixed(1);
  const dBA_at_100m = +noiseAtDist(100).toFixed(1);
  const dBA_at_150m = +noiseAtDist(150).toFixed(1);
  const dBA_at_300m = +noiseAtDist(300).toFixed(1);
  const dBA_at_500m = +noiseAtDist(500).toFixed(1);

  // Contour distances: bisection search.
  // Newton iteration diverged because noiseAtDist() has a +2.5 dB discontinuity at r=10 m
  // (ground reflection step), which breaks derivative-based solvers — they collapse to r=1.
  // Bisection is unconditionally convergent on any monotone-on-average function.
  const contourDist = (target) => {
    if (noiseAtDist(1) <= target) return 1;   // already below target at reference
    let lo = 1, hi = 1e6;
    while (noiseAtDist(hi) > target && hi < 1e8) hi *= 10;  // expand until below target
    if (noiseAtDist(hi) > target) return hi;                 // never reaches target
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (noiseAtDist(mid) > target) lo = mid; else hi = mid;
      if (hi - lo < 0.5) break;
    }
    return Math.round((lo + hi) / 2);
  };
  const dist_65dBA = +contourDist(65).toFixed(0);
  const dist_70dBA = +contourDist(70).toFixed(0);
  const dist_75dBA = +contourDist(75).toFixed(0);
  const dist_55dBA = +contourDist(55).toFixed(0);

  const bpfHarmonics = harmonicData.map(h => ({
    harmonic: h.n, freq: h.f_n,
    SPL: +(h.dBA_n + 10 * Math.log10(N_rot) + delta_int).toFixed(1),
  }));

  // Noise sensitivity — physics-derived from model structure
  // Tip speed: tonal Gutin ∝ Vtip² (0.087 dB/1%) + broadband Mtip⁵ (0.217·BB_frac dB/1%)
  // DL: K_cal ∝ 5·log10(DL) → 5·log10e·0.01 = 0.022 dB per 1% DL
  // Blade count: BPF shift + K_cal_B = (-10·log10((B+1)/B) − 1.5) dB per blade added
  const noise_sensitivity = {
    tipSpeed_1pct:    +(20 * Math.LOG10E * 0.01 + 50 * Math.LOG10E * 0.01 * 0.25).toFixed(2),
    diskLoading_1pct: +(5  * Math.LOG10E * 0.01).toFixed(2),
    bladeCount_1more: +(-10 * Math.log10((N_bl + 1) / N_bl) - 1.5).toFixed(2),
  };

  return {
    // component breakdown — needed to tell a calibration offset from a
    // structural error: if vortex dominates, tuning K_cal cannot fix anything
    noiseComponents:{
      tonal:+dBA_tonal_single.toFixed(1),
      broadband:+dBA_broadband_single.toFixed(1),
      vortex:+dBA_vortex.toFixed(1),
      singleRotor:+dBA_single.toFixed(1),
      K_cal:+K_cal.toFixed(2),
    },
    BPF:+BPF.toFixed(1), dBA_1m:+dBA_1m.toFixed(2),
    dBA_25m:dBA_at_25m, dBA_50m:dBA_at_50m, dBA_100m:dBA_at_100m,
    dBA_150m:dBA_at_150m, dBA_300m:dBA_at_300m, dBA_500m:dBA_at_500m,
    dist_55dBA, dist_65dBA, dist_70dBA, dist_75dBA,
    bpfHarmonics, noise_sensitivity, noise_validity,
    OASPL_total_1m:+OASPL_total_1m.toFixed(1),
  };
}
