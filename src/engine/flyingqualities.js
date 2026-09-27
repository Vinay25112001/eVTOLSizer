/* =====================================================================
   FLYING-QUALITIES LEVELS — Phase D: the tool's modes against MIL-F-8785C
   =====================================================================
   wingmodes.js gives the classical decoupled modes of a winged layout:
   phugoid, short period, Dutch roll, roll subsidence, and a spiral it
   WITHHOLDS. MIL-F-8785C (5 Nov 1980) states, for each, the boundary that
   separates Level 1 (satisfactory), Level 2 (adequate) and Level 3
   (controllable). This module places each computed mode on those tables and
   reports the level with the table row it came from. Every number below was
   read from the standard's rendered page - the scan's OCR is rough - and
   the page is cited; the research note STABILITY-LEVELS.md holds the same
   tables with the reading notes.

   CATEGORY B ONLY. A winged eVTOL in cruise is a Category B flight phase
   (nonterminal, gradual manoeuvring). Category A (air combat, terrain
   following) and C (fixed-wing take-off and landing) do not describe what
   this tool sizes; their tables carry class-dependent frequency floors that
   the figures draw but do not print, so they are not encoded, and asking for
   them refuses.

   WHAT A LEVEL MEANS HERE. wingmodes.js says its modes are "UNVALIDATED AND
   UNVALIDATABLE": no eVTOL publishes modal data. A level is therefore a
   statement about where the classical approximation lands on the standard's
   tables, not about an aircraft. It is carried with that caveat, and the
   propulsion-airframe coupling the modes omit is named again.

   NOT LEVELLED, and said so:
     - the spiral: wingmodes withholds it (no Cl_beta), so no level is
       assigned, not Level 3 by default;
     - the Dutch-roll |phi/beta| increment (Table VI note): |phi/beta| is
       not computed, so the plain minima are used and that is stated;
     - Category A and C;
     - ADS-33E-PRF for the rotor-borne layouts: its hover requirements are
       bandwidth and phase delay of the closed-loop attitude response, which
       bare-airframe derivatives cannot give. Rotor-borne layouts refuse.
   ===================================================================== */

/* MIL-F-8785C, Category B, read from the rendered pages. */
export const MIL_F_8785C = Object.freeze({
  standard: "MIL-F-8785C, Flying Qualities of Piloted Airplanes, 5 November 1980",
  category: "B",
  phugoid: {                                   // 3.2.1.2, p. 12
    src: "3.2.1.2 Phugoid stability, p. 12",
    level1: { zetaMin: 0.04 }, level2: { zetaMin: 0 }, level3: { T2min_s: 55 },
  },
  shortPeriodFrequency: {                      // Figure 2, p. 15: omega_sp^2 / (n/alpha), rad^2/s^2 per g/rad
    src: "3.2.2.1.1 and Figure 2 (Category B), p. 15; boundaries are the printed line values, straight-line extensions outside the range shown",
    level1: [0.085, 3.6], level2: [0.038, 10.0], level3: [0.038, null],
  },
  shortPeriodDamping: {                        // Table IV, p. 13, Category B column
    src: "3.2.2.1.2 Table IV, p. 13, Category B",
    level1: [0.30, 2.00], level2: [0.20, 2.00], level3: [0.15, null],
    note: "the Level 3 minimum may be reduced above 20,000 ft with approval; not applied",
  },
  dutchRoll: {                                 // Table VI, p. 22, Category B row
    src: "3.3.1.1 Table VI, p. 22, Category B, all classes",
    level1: { zetaMin: 0.08, zetaWnMin: 0.15, wnMin: 0.4 },
    level2: { zetaMin: 0.02, zetaWnMin: 0.05, wnMin: 0.4 },
    level3: { zetaMin: 0,    zetaWnMin: null, wnMin: 0.4 },
    note: "when omega_nd^2 |phi/beta| > 20 the zeta*omega minimum rises (0.014/0.009/0.005 per unit over 20); |phi/beta| is not computed, so the plain minima are applied and this is stated",
  },
  rollMode: {                                  // Table VII, p. 23, Category B row
    src: "3.3.1.2 Table VII, p. 23, Category B, all classes: maximum roll-mode time constant, s",
    level1: 1.4, level2: 3.0, level3: 10,
  },
  spiral: {                                    // Table VIII, p. 23, Category B row
    src: "3.3.1.3 Table VIII, p. 23, Category B: minimum time to double amplitude, s",
    level1: 20, level2: 8, level3: 4,
  },
});

const G0 = 9.80665;
const inBand = (x, [lo, hi]) => x >= lo && (hi == null || x <= hi);

/** The best level whose test passes, 1..3, or null for worse than Level 3. */
const firstLevel = (tests) => { for (let L = 1; L <= 3; L++) if (tests[L - 1]()) return L; return null; };

export function phugoidLevel(zeta, wn) {
  const T = MIL_F_8785C.phugoid;
  if (!Number.isFinite(zeta)) return { level: null, why: "no phugoid damping" };
  const T2 = zeta < 0 && wn > 0 ? Math.log(2) / (-zeta * wn) : null;   // time to double, s
  const level = firstLevel([() => zeta >= T.level1.zetaMin, () => zeta >= T.level2.zetaMin, () => T2 != null && T2 >= T.level3.T2min_s]);
  return { level, zeta, timeToDouble_s: T2, rule: `zeta >= ${T.level1.zetaMin} / >= ${T.level2.zetaMin} / T2 >= ${T.level3.T2min_s} s`, src: T.src };
}

export function shortPeriodFrequencyLevel(wn, nAlpha) {
  const T = MIL_F_8785C.shortPeriodFrequency;
  if (!(wn > 0) || !(nAlpha > 0)) return { level: null, why: "short period needs omega_sp > 0 and n/alpha > 0" };
  const cap = wn * wn / nAlpha;
  const level = firstLevel([() => inBand(cap, T.level1), () => inBand(cap, T.level2), () => inBand(cap, T.level3)]);
  return { level, omegaSq_over_nAlpha: cap, wn, nAlpha, rule: `${T.level1[0]}-${T.level1[1]} / ${T.level2[0]}-${T.level2[1]} / >= ${T.level3[0]}`, src: T.src };
}

export function shortPeriodDampingLevel(zeta) {
  const T = MIL_F_8785C.shortPeriodDamping;
  if (!Number.isFinite(zeta)) return { level: null, why: "no short-period damping" };
  const level = firstLevel([() => inBand(zeta, T.level1), () => inBand(zeta, T.level2), () => inBand(zeta, T.level3)]);
  return { level, zeta, rule: `${T.level1[0]}-${T.level1[1]} / ${T.level2[0]}-${T.level2[1]} / >= ${T.level3[0]}`, src: T.src, note: T.note };
}

export function dutchRollLevel(zeta, wn) {
  const T = MIL_F_8785C.dutchRoll;
  if (zeta == null && wn > 0) {
    return { level: null, notLevelled: true, wn,
             why: "Dutch-roll damping withheld upstream: wingmodes measured its fin-only damping formula against NASA CR-2144's "
                + "four transports and it misses by more than a factor of two; Table VI needs zeta, so no level is assigned "
                + "rather than one from frequency alone",
             src: T.src, table: T };
  }
  if (!Number.isFinite(zeta) || !(wn > 0)) return { level: null, why: "no Dutch-roll frequency and damping" };
  const meets = (r) => zeta >= r.zetaMin && (r.zetaWnMin == null || zeta * wn >= r.zetaWnMin) && wn >= r.wnMin;
  const level = firstLevel([() => meets(T.level1), () => meets(T.level2), () => meets(T.level3)]);
  const bindingOf = (r) => zeta < r.zetaMin ? "zeta" : (r.zetaWnMin != null && zeta * wn < r.zetaWnMin) ? "zeta*omega" : wn < r.wnMin ? "omega" : null;
  const next = level === 1 ? null : level === 2 ? T.level1 : level === 3 ? T.level2 : T.level3;
  return { level, zeta, wn, zetaWn: zeta * wn, bindingForNextLevel: next ? bindingOf(next) : null,
           rule: `zeta >= ${T.level1.zetaMin}, zeta*omega >= ${T.level1.zetaWnMin}, omega >= ${T.level1.wnMin} for Level 1; ${T.level2.zetaMin}/${T.level2.zetaWnMin}/${T.level2.wnMin} for 2; ${T.level3.zetaMin}/-/${T.level3.wnMin} for 3`,
           src: T.src, note: T.note };
}

export function rollModeLevel(tau_s) {
  const T = MIL_F_8785C.rollMode;
  if (!(tau_s > 0)) return { level: null, why: "no roll-mode time constant (roll subsidence not stable or not computed)" };
  const level = firstLevel([() => tau_s <= T.level1, () => tau_s <= T.level2, () => tau_s <= T.level3]);
  return { level, tau_s, rule: `tau_R <= ${T.level1} / ${T.level2} / ${T.level3} s`, src: T.src };
}

/**
 * @param M  a wingModes() result
 * @param opts.category  only "B" is encoded
 */
export function flyingQualities(M, opts = {}) {
  const category = opts.category ?? "B";
  if (category !== "B") {
    return { applicable: false, category,
             why: `Category ${category} is not encoded: its short-period figures carry class-dependent frequency floors the standard draws but does not print; see STABILITY-LEVELS.md section 1` };
  }
  if (!M || M.applicable === false) {
    return { applicable: false, category, why: M?.note ?? "no wing-borne modes: a rotor-borne layout has no fixed-wing modes to level, and ADS-33E-PRF's hover requirements are bandwidth and phase delay, which bare-airframe derivatives cannot give" };
  }
  const modes = {
    phugoid: phugoidLevel(M.phugoid?.zeta, M.phugoid?.wn),
    shortPeriodFrequency: shortPeriodFrequencyLevel(M.shortPeriod?.wn, M.nAlpha_gPerRad),
    shortPeriodDamping: shortPeriodDampingLevel(M.shortPeriod?.zeta),
    dutchRoll: dutchRollLevel(M.dutchRoll?.zeta, M.dutchRoll?.wn),
    rollMode: rollModeLevel(M.rollSubsidence?.tau_s),
    spiral: { level: null, notLevelled: true,
              why: "wingmodes withholds the spiral (Cl_beta is not computed), so no level is assigned rather than Level 3 by default",
              src: MIL_F_8785C.spiral.src, table: MIL_F_8785C.spiral },
  };
  const levelled = Object.entries(modes).filter(([, r]) => !r.notLevelled && r.why == null);
  const worst = levelled.reduce((w, [k, r]) => {
    const lv = r.level ?? 4;
    return lv > w.value ? { value: lv, level: r.level, mode: k } : w;
  }, { value: 0, level: null, mode: null });
  return {
    applicable: true, category, standard: MIL_F_8785C.standard,
    modes,
    worst: { level: worst.level, mode: worst.mode, worseThanLevel3: worst.level == null && worst.mode != null },
    notLevelled: ["spiral (withheld upstream)",
                  ...(modes.dutchRoll.notLevelled ? ["Dutch-roll damping (withheld upstream: fin-only formula measured wrong on NASA CR-2144)"] : []),
                  "Dutch-roll |phi/beta| increment (not computed)", "Category A and C tables", "ADS-33E-PRF for rotor-borne layouts"],
    caveat: "A level is where the classical decoupled approximation lands on the standard's tables, not a statement about an aircraft: "
          + (M.caveat ?? "the modes are unvalidated") + " Propulsion-airframe coupling is not modelled.",
  };
}
