/* =====================================================================
   WING-BORNE DYNAMIC MODES — phugoid, short period, dutch roll, spiral
   =====================================================================
   READ THIS BEFORE TRUSTING ANY NUMBER OUT OF THIS FILE.

   NOTHING HERE IS VALIDATED ON AN eVTOL, AND NOTHING HERE CAN BE. A survey of 857
   eVTOL-relevant papers found ZERO publishing modal data, damping ratios
   or eigenvalues for any eVTOL, and exactly one publishing moments of
   inertia — for a subscale model. There is no aircraft to compare these
   against. Every output of this module is tagged `unverified` and that is
   not a temporary state pending work; it is the state of the published
   record.

   THE METHOD, HOWEVER, IS MEASURED. NASA CR-2144 (Heffley & Jewell 1972,
   vendored in the research corpus) prints the manufacturers' dimensional
   derivatives AND the resulting modes for the Boeing 747, Lockheed Jetstar,
   Convair 880M and Lockheed C-5A at 36 flight conditions. The formulas
   below (exported as MODE_FORMULAS) fed those derivatives reproduce the
   printed short period within 1 % on average, the roll mode 9 % low, the
   fin-only Dutch-roll frequency 17 % low, the Lanchester phugoid to an
   order of magnitude, and the fin-only Dutch-roll DAMPING not at all
   (wrong by more than a factor of two) — so that one is WITHHELD, the way
   the spiral already was, for the same missing physics (L_beta). The
   numbers are in CR2144_VALIDATION and validation/wing-modes-cr2144.mjs
   asserts they equal the live measurement. The geometry-to-derivative
   step (the [LAY] constants) is NOT measured: the report prints
   derivatives, not tail areas.
   It was built because it was asked for, after that was said twice.

   THE METHOD is the classical linearised small-perturbation treatment,
   as in Etkin & Reid, "Dynamics of Flight: Stability and Control", and
   Roskam, "Airplane Flight Dynamics and Automatic Flight Controls" —
   both cited across 15 papers each in this project's own corpus. The
   modal approximations below are the standard decoupled forms, not
   eigenvalues of the full A matrix: at conceptual level the inputs do not
   justify the extra machinery, and the approximations are what the texts
   themselves present for design use.

   WHAT THE APPROXIMATIONS ASSUME, since they are not universal:
     - small perturbations about steady level flight
     - longitudinal and lateral motion decoupled
     - the phugoid and short period well separated in frequency
     - constant density, no compressibility, no propulsion coupling
   A distributed-electric aircraft violates the last one: its propulsion
   is on the wing and in the wake, and thrust responds to speed. That is
   not modelled, and on a lift+cruise it is not a small effect.
   ===================================================================== */

const G = 9.80665;

/* =====================================================================
   THE MODE FORMULAS, AS PURE FUNCTIONS OF DIMENSIONAL DERIVATIVES.
   wingModes() below builds the derivatives from the sized geometry and
   calls these; validation/wing-modes-cr2144.mjs feeds them the derivatives
   NASA CR-2144 prints for four transports and compares with the modes the
   same report prints. Same code path, so what the harness measures is what
   the eVTOL gets. Units: 1/s and rad/s throughout (U in m/s with G, or in
   ft/s with G converted — the frequencies are the same).
   ===================================================================== */
export const MODE_FORMULAS = {
  /* 2-DOF short period: M_alpha (1/s^2), M_q, M_alpha_dot, Z_alpha/U (1/s) */
  shortPeriod({ Malpha, Mq, Madot, ZaU }) {
    const wn2 = Mq * ZaU - Malpha;
    const wn = wn2 > 0 ? Math.sqrt(wn2) : null;
    return { wn, zeta: wn ? -(Mq + Madot + ZaU) / (2 * wn) : null };
  },
  /* fin-only Dutch roll: N_beta (1/s^2), N_r, Y_v = Y_beta/U (1/s). The frequency
     is reported with its measured bias; the damping FORMULA is returned for the
     harness to measure and is NOT reported by wingModes() — see CR2144_VALIDATION. */
  dutchRollFinOnly({ Nbeta, Nr, Yv }) {
    const wn = Nbeta > 0 ? Math.sqrt(Nbeta) : null;
    return { wn, zetaFormula: wn ? -(Nr + Yv) / (2 * wn) : null };
  },
  /* roll subsidence: L_p (1/s) */
  rollSubsidence({ Lp }) {
    return { tau: Lp !== 0 ? -1 / Lp : null };
  },
  /* Lanchester phugoid: U (m/s), L/D; g in m/s^2 */
  phugoidLanchester({ U, LD, g = G }) {
    const wn = (Math.SQRT2 * g) / U;
    return { wn, zeta: LD > 0 ? 1 / (Math.SQRT2 * LD) : null };
  },
};

/* What these formulas measure against NASA CR-2144 (Heffley & Jewell 1972):
   the manufacturers' dimensional derivatives of the Boeing 747, Lockheed
   Jetstar, Convair 880M and Lockheed C-5A at 36 flight conditions, fed
   through MODE_FORMULAS, against the modes the same report prints. The
   harness asserts every number here equals its live measurement, so this
   block cannot drift from the data. MAE = mean absolute relative error.
   Reading notes and pages: research corpus, classes/cross-class/CR-2144-VALIDATION.md. */
export const CR2144_VALIDATION = {
  source: "NASA CR-2144", n: 36,
  shortPeriod: { wnMAE_pct: 0.8, wnMax_pct: 2.8, zetaMAE_pct: 0.7, zetaMax_pct: 5, verdict: "validated" },
  rollMode: { MAE_pct: 9.1, max_pct: 24, bias: "low", verdict: "usable; the bias is reported" },
  dutchRollWn: { MAE_pct: 16.9, max_pct: 44, bias: "low",
                 note: "the roll-coupling term (needs L_beta, not computed here) brings it to MAE 4.8 %" },
  dutchRollZeta: { withheld: true, MAE_pct_over: 60,
                   why: "the fin-only damping formula misses the reference by more than 60 % on average (measured: over 100 %); "
                      + "the missing physics is L_beta, the same term that withholds the spiral" },
  phugoid: { wnMAE_pct_belowM07: 30.3, zetaMAE_pct_belowM07: 37.8, lanchesterHighAt: 23, of: 23,
             note: "order of magnitude only; Lanchester OVER-predicts the frequency at every subsonic condition (constant-C_L Z_u "
                 + "is too strong for a real transport); M_u/Z_u compressibility and tuck above M 0.75 are not representable" },
};
const DR_ZETA_WITHHELD = "WITHHELD: " + CR2144_VALIDATION.dutchRollZeta.why + " (NASA CR-2144, 36 conditions)";

/* [LAY] Standard rules of thumb where the engine has no better value.
   Each is a textbook typical, not a measurement, and each is tagged. */
const LAY = {
  dEpsilonDalpha: 0.35,   // downwash gradient at the tail, typical mid-range
  dSigmaDbeta:    0.10,   // sidewash at the fin
  etaV:           0.95,   // fin dynamic pressure ratio
  ClrOverCL:      0.25,   // Cl_r ~ CL/4
};

/**
 * @param SR  sized result (needs Swing, bWing, MAC, CLaW, CLaH, LDact,
 *            rhoCr, SM, lv, lh, Sv_eff, Sh_eff, etaH, MTOW, sweep, taper)
 * @param inertia { Ixx, Iyy, Izz } from engine/inertia.js
 * @param p   params (vCruise, taper, tc)
 */
export function wingModes(SR = {}, inertia = {}, p = {}) {
  const S = Number(SR.Swing) || 0;
  const b = Number(SR.bWing) || 0;
  const c = Number(SR.MAC) || 0;
  const U = Number(p.vCruise ?? SR.vCruise) || 0;
  const rho = Number(SR.rhoCr) || 1.225;
  const m = Number(SR.MTOW) || 0;
  const Iyy = Number(inertia.Iyy) || 0;
  const Ixx = Number(inertia.Ixx) || 0;
  const Izz = Number(inertia.Izz) || 0;
  const LD = Number(SR.LDact) || 0;
  const SM = Number(SR.SM) || 0;
  const CLaW = Number(SR.CLaW) || 0;
  const CLaH = Number(SR.CLaH) || CLaW;
  const etaH = Number(SR.etaH) || 0.9;
  const lh = Number(SR.lh) || 0;
  const lv = Number(SR.lv) || 0;
  const ShE = Number(SR.Sh_eff) || 0;
  const SvE = Number(SR.Sv_eff) || 0;
  const lam = Number(p.taper) || 0.45;

  if (!(S > 0 && b > 0 && c > 0 && U > 0 && m > 0 && Iyy > 0 && Ixx > 0 && Izz > 0)) {
    return { applicable: false, note: "wing-borne modes need a wing, a cruise speed and an inertia tensor" };
  }

  const q = 0.5 * rho * U * U;          // dynamic pressure
  const CL = (m * G) / (q * S);         // trim lift coefficient
  const CD = LD > 0 ? CL / LD : 0;

  /* ── PHUGOID (Lanchester). The classical result: it depends on almost
     nothing but speed and lift-to-drag, which is why it is the one mode a
     conceptual tool can state with a straight face. */
  const phF = MODE_FORMULAS.phugoidLanchester({ U, LD });
  const wnPh = phF.wn;
  const zPhClassic = phF.zeta;
  const TPh = (2 * Math.PI) / wnPh;

  /* PROPULSION-AIRFRAME COUPLING, the one term that changes a mode here.
     The Lanchester result assumes CONSTANT THRUST. An electric aircraft is
     power-limited, so at constant shaft power T ~ P/(V+v_i) and
     dT/dV = -T/(V+v_i). Thrust falling with speed is an extra X_u, and X_u
     is exactly what damps the phugoid - so the classical value UNDERSTATES
     the damping of a distributed-electric aircraft. See engine/aeropropulsive.js
     for why this is the only coupling term taken analytically: the rest is
     identified from wind-tunnel experiment in the literature, not predicted. */
  const Tcr = Number(SR.Tcruise ?? (LD > 0 ? (m * G) / LD : 0)) || 0;
  const viCr = Number(SR.viHover) || 0;
  const dTdV = Tcr > 0 ? -Tcr / (U + viCr) : 0;
  const dZeta = Tcr > 0 ? (-(dTdV / m)) / (2 * wnPh) : 0;
  const zPh = zPhClassic == null ? null : zPhClassic + dZeta;

  /* ── SHORT PERIOD, 2-DOF approximation ───────────────────────────────
     Cm_alpha from the static margin the engine already solves for:
     SM = -Cm_alpha / CL_alpha, so Cm_alpha = -SM * CL_alpha. */
  const VH = c > 0 && S > 0 ? (ShE * lh) / (S * c) : 0;      // horiz tail volume
  const CmA = -SM * CLaW;
  const CmQ = -2 * etaH * CLaH * VH * (lh / c);
  const CmAdot = CmQ * LAY.dEpsilonDalpha;
  const CZa = -(CLaW + CD);

  const Malpha = (CmA * q * S * c) / Iyy;
  const Mq = (CmQ * (c / (2 * U)) * q * S * c) / Iyy;
  const Madot = (CmAdot * (c / (2 * U)) * q * S * c) / Iyy;
  const Zalpha = (CZa * q * S) / m;
  const ZaU = Zalpha / U;

  const spF = MODE_FORMULAS.shortPeriod({ Malpha, Mq, Madot, ZaU });
  const wnSp = spF.wn;
  const zSp = spF.zeta;

  /* ── DUTCH ROLL ──────────────────────────────────────────────────────
     Fin contribution only. A V-tail's yaw-effective area is what the
     engine already computes as Sv_eff, so this reads the surface the tool
     actually sized rather than assuming a conventional fin. */
  const Vv = b > 0 && S > 0 ? (SvE * lv) / (S * b) : 0;
  const CnB = CLaH * LAY.etaV * Vv * (1 + LAY.dSigmaDbeta);
  const CnR = -2 * CLaH * LAY.etaV * Vv * (lv / b);
  const CyB = -CLaH * LAY.etaV * (SvE / S);

  const Nbeta = (CnB * q * S * b) / Izz;
  const Nr = (CnR * (b / (2 * U)) * q * S * b) / Izz;
  const Ybeta = (CyB * q * S) / m;

  const drF = MODE_FORMULAS.dutchRollFinOnly({ Nbeta, Nr, Yv: Ybeta / U });
  const wnDr = drF.wn;
  const zFinOnly = drF.zetaFormula;   // measured wrong against NASA CR-2144 (see CR2144_VALIDATION); NOT reported

  /* ── ROLL SUBSIDENCE ─────────────────────────────────────────────────
     Cl_p from the standard strip result for a tapered wing. */
  const ClP = -((CLaW + CD) / 12) * ((1 + 3 * lam) / (1 + lam));
  const Lp = (ClP * (b / (2 * U)) * q * S * b) / Ixx;
  const tauRoll = MODE_FORMULAS.rollSubsidence({ Lp }).tau;

  /* ── SPIRAL: Cl_beta IS THE PROBLEM, AND NO VERDICT IS ISSUED BECAUSE OF IT.
     A first version used Cl_beta = -0.0005*sweep - 0.05, which is an
     invention, and it duly reported every layout as spirally divergent.
     Roll-due-to-sideslip is dominated by dihedral, wing vertical position
     and fin height above the CG; this tool's wings carry ZERO dihedral, and
     the fin contribution depends on a V-tail centre of pressure it does not
     compute. So the parameter is reported with its terms exposed and the
     stable/unstable call is explicitly NOT made. A sign produced by a made-up
     coefficient is worse than no sign. */
  const ClB = null;
  const ClR = LAY.ClrOverCL * CL;
  const spiralParam = null;

  const dp = (x, n = 4) => (x == null || !isFinite(x) ? null : +x.toFixed(n));
  return {
    applicable: true,
    trim: { CL: dp(CL, 4), CD: dp(CD, 5), q_Pa: dp(q, 1), U_ms: dp(U, 2) },
    /* n/alpha = CL_alpha q S / W, g per rad: the normal-acceleration sensitivity
       MIL-F-8785C Figures 1-3 plot the short-period frequency against. */
    nAlpha_gPerRad: dp(CLaW * q * S / (m * G), 3),
    phugoid:     { wn: dp(wnPh), zeta: dp(zPh), period_s: dp(TPh, 2),
                   zetaClassic: dp(zPhClassic), zetaFromThrustLapse: dp(dZeta),
                   dTdV_NsPerM: dp(dTdV, 1),
                   stable: zPh != null && zPh > 0,
                   note: "zeta includes the constant-shaft-power thrust lapse; the "
                       + "classical Lanchester value assumes constant thrust and is "
                       + "given separately as zetaClassic" },
    shortPeriod: { wn: dp(wnSp), zeta: dp(zSp),
                   period_s: wnSp ? dp((2 * Math.PI) / wnSp, 2) : null,
                   stable: wnSp != null && zSp != null && zSp > 0 },
    dutchRoll:   { wn: dp(wnDr), zeta: null, withheld: DR_ZETA_WITHHELD,
                   wnBias: "fin-only sqrt(N_beta) reads " + CR2144_VALIDATION.dutchRollWn.MAE_pct
                         + " % low on average against NASA CR-2144's four transports; the roll-coupling term needs L_beta",
                   period_s: wnDr ? dp((2 * Math.PI) / wnDr, 2) : null,
                   stable: null },
    rollSubsidence: { Lp: dp(Lp), tau_s: dp(tauRoll, 3), stable: Lp < 0 },
    spiral: { parameter: null, stable: null, ClR: dp(ClR), CnR: dp(CnR), CnB: dp(CnB),
              note: "NOT DETERMINED. Stability needs Cl_beta*Cn_r - Cn_beta*Cl_r, and "
                  + "Cl_beta is dominated by dihedral (zero on these wings), wing vertical "
                  + "position and fin height above the CG - none of which this tool computes. "
                  + "The other three terms are given; the verdict is withheld rather than "
                  + "manufactured from an assumed Cl_beta" },
    derivatives: { CmA: dp(CmA), CmQ: dp(CmQ), CnB: dp(CnB), CnR: dp(CnR),
                   ClP: dp(ClP), CyB: dp(CyB), VH: dp(VH), Vv: dp(Vv, 5), ClB: null },
    assumptions: LAY,
    validation: CR2144_VALIDATION,
    caveat: "MEASURED ON NASA CR-2144, NOT ON ANY eVTOL (none publishes modal data; 0 of 857 corpus papers). "
          + "Fed the manufacturers' derivatives of four transports at 36 conditions, the short-period formula "
          + "reproduces the printed modes within 1 % on average, the roll mode reads 9 % low, the fin-only Dutch-roll "
          + "frequency 17 % low, the Lanchester phugoid is an order of magnitude only, and the fin-only Dutch-roll damping "
          + "is wrong by more than a factor of two and is WITHHELD. Classical decoupled approximations; the geometry-to-derivative "
          + "step is untested. Propulsion-airframe coupling is NOT modelled and is not small on a distributed-electric wing.",
  };
}
