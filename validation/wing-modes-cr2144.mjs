/* =====================================================================
   WING-BORNE MODES vs NASA CR-2144 — the approximations measured on real transports
   =====================================================================
   engine/wingmodes.js computes the classical decoupled modes of the sized
   eVTOL. No eVTOL publishes modal data, so the METHOD is checked here on
   the four transports of NASA CR-2144 (Heffley & Jewell 1972: Boeing 747,
   Lockheed Jetstar, Convair 880M, Lockheed C-5A; 36 flight conditions),
   whose manufacturers supplied both the dimensional derivatives and the
   modes. The report's derivatives are fed through the SAME formulas the
   engine uses (exported as MODE_FORMULAS) and compared with the report's
   printed denominator factors. Only the formula is under test; the
   geometry-to-derivative step is not, because the report prints
   derivatives, not tail areas (CR-2144-VALIDATION.md section 3).

   Sections
     1. transcription identities the pages must satisfy
     2. the report's own characteristic quartics (Appendix C) evaluated from
        the transcription reproduce the printed factors
     3. the engine's formulas against the printed factors — the measured
        errors, each bounded from the measurement and each bound proven to
        fail under a mutant
     4. the numbers the engine STATES about itself equal the live measurement
     5. the bare-airframe 747 placed on MIL-F-8785C Category B at its ten
        conditions, as a tripwire on the level logic

   MUTANTS, ten, each caught by a named check: SP omega^2 with + M_alpha;
   SP zeta without M_alpha_dot; roll tau = +1/Lp; Dutch-roll wn from Nr;
   phugoid wn without the sqrt(2); the stated SP MAE raised to 5 %; the
   Dutch-roll damping bound loosened to 5 %; the damping reported instead
   of withheld; a transcription cell changed (747 F/C 3 Mq); the level
   logic levelling the Dutch roll from frequency alone.

   43 checks. What the 747 shows on the Category B tables, bare airframe
   and SAS off: short period Level 1 at all ten conditions; roll Level 1
   at sea level and 20 kft, Level 2 at 40 kft; Dutch roll below Level 1
   at nine of ten and Level 3 at two of the three 40 kft conditions (the
   report carries the yaw SAS, p. 215); phugoid mixed Level 1 and 2.

   Run: node validation/wing-modes-cr2144.mjs
   ===================================================================== */
import { CR2144_AIRCRAFT, CR2144_SOURCE } from "../src/data/cr2144/index.js";
import { MODE_FORMULAS, CR2144_VALIDATION, wingModes } from "../src/engine/wingmodes.js";
import { flyingQualities } from "../src/engine/flyingqualities.js";
import { G0 } from "../src/engine/constants.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};
const FT = 0.3048;            // unit factor, ft -> m
const G_FPS2 = G0 / FT;       // the report's tables are in ft/s^2; one gravity, converted
const mae = (e) => e.reduce((a, b) => a + Math.abs(b), 0) / e.length;
const maxAbs = (e) => Math.max(...e.map(Math.abs));
const pct = (a, b) => 100 * (a / b - 1);
const f1 = (x) => x.toFixed(1);

console.log("WING-BORNE MODES vs NASA CR-2144 GATE");
console.log(bar);
console.log(`${CR2144_SOURCE.report}: ${CR2144_AIRCRAFT.map((a) => a.name).join(", ")}; `
  + `${CR2144_AIRCRAFT.reduce((n, a) => n + a.fc.length, 0)} flight conditions`);

/* rows: one per flight condition, with the derivatives as numbers */
const rows = [];
for (const A of CR2144_AIRCRAFT) A.fc.forEach((f, i) => {
  const L = {}, Y = {};
  for (const k in A.long) if (Array.isArray(A.long[k])) L[k] = A.long[k][i];
  for (const k in A.lat) if (Array.isArray(A.lat[k])) Y[k] = A.lat[k][i];
  rows.push({ A, i, f, L, Y, U: f.U_fps,
              ph: { zeta: A.longModes.phZeta[i], wn: A.longModes.phWn[i] },
              sp: { zeta: A.longModes.spZeta[i], wn: A.longModes.spWn[i] },
              spiral: A.latModes.spiralInvT[i], roll: A.latModes.rollInvT[i],
              dr: { zeta: A.latModes.drZeta[i], wn: A.latModes.drWn[i] },
              nAlpha: A.longHQ.nAlpha_gPerRad[i] });
});
check(rows.length === 36, "36 flight conditions: 747 ×10, Jetstar ×10, 880M ×7, C-5A ×9", `${rows.length}`);

/* ── 1. TRANSCRIPTION IDENTITIES ────────────────────────────────────── */
console.log("\n1. Identities the pages must satisfy");
const yvErr = rows.map((r) => pct(r.Y.Yb / r.U, r.Y.Yv));
check(maxAbs(yvErr) < 1.2, "Y_v = Y_beta / U_0 at every condition (lateral table vs mass table)", `max ${f1(maxAbs(yvErr))} %`);
const B747 = CR2144_AIRCRAFT.find((a) => a.name === "Boeing 747");
const perErr = B747.latHQ.drPeriod_s.map((T, i) => {
  const z = B747.latModes.drZeta[i], w = B747.latModes.drWn[i];
  return pct(2 * Math.PI / (w * Math.sqrt(1 - z * z)), T);
});
check(maxAbs(perErr) < 0.6, "747 Dutch-roll period on p. 241 equals 2 pi / (w sqrt(1 - z^2)) from p. 235", `max ${f1(maxAbs(perErr))} %`);
const tucks = rows.filter((r) => r.ph.zeta == null);
check(tucks.length === 3 && tucks.every((r) => r.A.longModes.phRealRoots?.[r.f.n]?.length === 2),
  "three conditions print real phugoid roots (tuck) and carry both roots: Jetstar F/C 7, 10; C-5A F/C 7",
  tucks.map((r) => `${r.A.name} F/C ${r.f.n}`).join("; "));
check(CR2144_AIRCRAFT.every((A) => [A.geometry, A.long, A.longModes, A.longHQ, A.lat, A.latModes].every((b) => Number.isInteger(b.page))),
  "every transcribed block carries the printed page it was read from", "");

/* ── 2. THE REPORT'S OWN QUARTICS REPRODUCE ITS FACTORS ─────────────── */
console.log("\n2. Appendix C quartics from the transcription vs the printed factors");
function polyRoots(c) {   // Durand-Kerner, monic, highest power first
  const n = c.length - 1, a = c.map((x) => x / c[0]);
  let z = Array.from({ length: n }, (_, k) => ({ re: 0.9 * Math.cos(2 * Math.PI * k / n + 0.4), im: 0.9 * Math.sin(2 * Math.PI * k / n + 0.4) }));
  const mul = (p, q) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
  const sub = (p, q) => ({ re: p.re - q.re, im: p.im - q.im });
  const div = (p, q) => { const d = q.re * q.re + q.im * q.im; return { re: (p.re * q.re + p.im * q.im) / d, im: (p.im * q.re - p.re * q.im) / d }; };
  const pv = (x) => { let r = { re: 1, im: 0 }; for (let i = 1; i <= n; i++) r = { re: r.re * x.re - r.im * x.im + a[i], im: r.re * x.im + r.im * x.re }; return r; };
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) { let den = { re: 1, im: 0 }; for (let j = 0; j < n; j++) if (j !== i) den = mul(den, sub(z[i], z[j])); const s = div(pv(z[i]), den); z[i] = sub(z[i], s); moved = Math.max(moved, Math.hypot(s.re, s.im)); }
    if (moved < 1e-14) break;
  }
  const pairs = [], reals = [], used = new Set();
  z.forEach((r, i) => {
    if (used.has(i)) return;
    if (Math.abs(r.im) > 1e-9) { const j = z.findIndex((q, k) => k !== i && !used.has(k) && Math.abs(q.re - r.re) < 1e-7 && Math.abs(q.im + r.im) < 1e-7); if (j >= 0) { used.add(i); used.add(j); const wn = Math.hypot(r.re, r.im); pairs.push({ zeta: -r.re / wn, wn }); return; } }
    used.add(i); reals.push(-r.re);
  });
  pairs.sort((p, q) => p.wn - q.wn); reals.sort((p, q) => Math.abs(p) - Math.abs(q));
  return { pairs, reals };
}
/* Appendix C, p. C-1/C-2: longitudinal denominator, theta0 = alpha0 (level flight) */
function longQuartic(r, g = G_FPS2, gravitySign = +1) {
  const { L, f } = r, th = f.alpha_deg * Math.PI / 180, VT = r.U, U0 = VT * Math.cos(th), W0 = VT * Math.sin(th);
  const Ma = U0 * L.Mw, Xa = U0 * L.Xw, Mad = U0 * L.Mwd, Zwd = L.Zwd, gs = gravitySign * g;
  const A = 1 - Zwd;
  const B = -(L.Mq + L.Xu) * (1 - Zwd) - L.Zw - Mad;
  const C = L.Mq * L.Zw - Ma + L.Xu * (L.Mq * (1 - Zwd) + L.Zw + Mad) - L.Xw * L.Zu + W0 * (L.Mwd * L.Zu + L.Mu * (1 - Zwd)) + gs * L.Mwd * Math.sin(th);
  const D = -L.Xu * (L.Mq * L.Zw - Ma) - L.Mu * Xa + L.Mq * L.Xw * L.Zu + gs * (L.Mwd * L.Zu + L.Mu * (1 - Zwd)) * Math.cos(th) + W0 * (L.Mw * L.Zu - L.Mu * L.Zw) + gs * (L.Mw - L.Mwd * L.Xu) * Math.sin(th);
  const E = gs * (L.Mw * L.Zu - L.Mu * L.Zw) * Math.cos(th) + gs * (L.Mu * L.Xw - L.Mw * L.Xu) * Math.sin(th);
  return polyRoots([A, B, C, D, E]);
}
/* Appendix C, p. C-4: lateral denominator */
function latQuartic(r, g = G_FPS2) {
  const { Y, f } = r, th = f.alpha_deg * Math.PI / 180, VT = r.U, U0 = VT * Math.cos(th), W0 = VT * Math.sin(th);
  const b = -(Y.Yv + Y.Lp + Y.Nr);
  const c = (U0 / VT) * Y.Nb + Y.Lp * (Y.Yv + Y.Nr) - Y.Np * Y.Lr + Y.Yv * Y.Nr - (W0 / VT) * Y.Lb;
  const d = (U0 / VT) * (Y.Np * Y.Lb - Y.Lp * Y.Nb) + Y.Yv * (Y.Np * Y.Lr - Y.Lp * Y.Nr) - (g / VT) * (Y.Lb * Math.cos(th) + Y.Nb * Math.sin(th)) + (W0 / VT) * (Y.Lb * Y.Nr - Y.Nb * Y.Lr);
  const e = (g / VT) * ((Y.Lb * Y.Nr - Y.Nb * Y.Lr) * Math.cos(th) - (Y.Np * Y.Lb - Y.Lp * Y.Nb) * Math.sin(th));
  return polyRoots([1, b, c, d, e]);
}
const q = rows.map((r) => ({ r, lo: longQuartic(r), la: latQuartic(r) }));
const spQ = q.map(({ r, lo }) => { const sp = lo.pairs[lo.pairs.length - 1]; return [pct(sp.wn, r.sp.wn), pct(sp.zeta, r.sp.zeta)]; });
check(maxAbs(spQ.map((x) => x[0])) < 3.5 && maxAbs(spQ.map((x) => x[1])) < 3.5,
  "short period: quartic roots match the printed factors at all 36 conditions (omega and zeta within 3.5 %)",
  `max ${f1(maxAbs(spQ.map((x) => x[0])))} % / ${f1(maxAbs(spQ.map((x) => x[1])))} %`);
const phQ = q.filter(({ r, lo }) => r.ph.zeta != null && lo.pairs.length === 2).map(({ r, lo }) => [pct(lo.pairs[0].wn, r.ph.wn), pct(lo.pairs[0].zeta, r.ph.zeta)]);
check(phQ.length === 33 && maxAbs(phQ.map((x) => x[0])) < 4.5 && maxAbs(phQ.map((x) => x[1])) < 20,
  "phugoid: 33 oscillatory conditions, omega within 4.5 %, zeta within 20 % (three-figure X_u sets zeta)",
  `n ${phQ.length}, max ${f1(maxAbs(phQ.map((x) => x[0])))} % / ${f1(maxAbs(phQ.map((x) => x[1])))} %`);
const tuckQ = q.filter(({ r }) => r.ph.zeta == null);
check(tuckQ.every(({ lo }) => lo.pairs.length === 1 && lo.reals.length === 2),
  "the three tuck conditions come out of the quartic as two real roots, as printed", "");
const drQ = q.map(({ r, la }) => [pct(la.pairs[0].wn, r.dr.wn), pct(la.pairs[0].zeta, r.dr.zeta)]);
check(q.every(({ la }) => la.pairs.length === 1 && la.reals.length === 2) && maxAbs(drQ.map((x) => x[0])) < 1.0 && maxAbs(drQ.map((x) => x[1])) < 7,
  "Dutch roll: one pair and two real roots everywhere; omega within 1 %, zeta within 7 %",
  `max ${f1(maxAbs(drQ.map((x) => x[0])))} % / ${f1(maxAbs(drQ.map((x) => x[1])))} %`);
const rollQ = q.map(({ r, la }) => pct(la.reals[1], r.roll));
check(maxAbs(rollQ) < 1.0, "roll mode: quartic root within 1 % of the printed 1/T_R at all 36 conditions (the check that caught Jetstar F/C 10)", `max ${f1(maxAbs(rollQ))} %`);
const spiralAbs = q.map(({ r, la }) => Math.abs(la.reals[0] - r.spiral));
check(maxAbs(spiralAbs) < 0.002, "spiral: quartic root within 0.002 1/s of the printed value (rounding of a root near zero)", `max ${maxAbs(spiralAbs).toFixed(5)} 1/s`);
/* tripwire: the polynomial is sensitive — flip the sign of gravity and the phugoid is lost */
const wrongG = rows.filter((r) => r.ph.zeta != null).map((r) => { const lo = longQuartic(r, G_FPS2, -1); return lo.pairs.length === 2 ? pct(lo.pairs[0].wn, r.ph.wn) : 999; });
check(maxAbs(wrongG) > 20, "tripwire: the gravity term reversed in Appendix C's D and E coefficients breaks the phugoid match", `max ${f1(maxAbs(wrongG))} %`);

/* ── 3. THE ENGINE'S FORMULAS AGAINST THE PRINTED FACTORS ───────────── */
console.log("\n3. The engine's mode formulas fed the report's derivatives (MAE = mean |error|, n = 36 unless stated)");
const F = MODE_FORMULAS;
const sp = rows.map((r) => { const m = F.shortPeriod({ Malpha: r.U * r.L.Mw, Mq: r.L.Mq, Madot: r.U * r.L.Mwd, ZaU: r.L.Zw }); return [pct(m.wn, r.sp.wn), pct(m.zeta, r.sp.zeta)]; });
const spW = sp.map((x) => x[0]), spZ = sp.map((x) => x[1]);
check(mae(spW) < 1.5 && maxAbs(spW) < 4, "short-period omega_n (2-DOF): MAE under 1.5 %, max under 4 %", `MAE ${f1(mae(spW))} %, max ${f1(maxAbs(spW))} %`);
check(mae(spZ) < 1.5 && maxAbs(spZ) < 6, "short-period zeta (2-DOF with M_alpha_dot): MAE under 1.5 %, max under 6 %", `MAE ${f1(mae(spZ))} %, max ${f1(maxAbs(spZ))} %`);
const spNoMad = rows.map((r) => { const m = F.shortPeriod({ Malpha: r.U * r.L.Mw, Mq: r.L.Mq, Madot: 0, ZaU: r.L.Zw }); return pct(m.zeta, r.sp.zeta); });
check(mae(spNoMad) > 5, "tripwire: dropping M_alpha_dot from the damping is visible (MAE over 5 %)", `MAE ${f1(mae(spNoMad))} %`);
const roll = rows.map((r) => pct(1 / F.rollSubsidence({ Lp: r.Y.Lp }).tau, r.roll));
check(mae(roll) < 12 && maxAbs(roll) < 26 && roll.filter((e) => e < 0).length >= 30,
  "roll 1/T_R = -L_p: MAE under 12 %, max under 26 %, and biased LOW at 30+ of 36 conditions", `MAE ${f1(mae(roll))} %, max ${f1(maxAbs(roll))} %, low at ${roll.filter((e) => e < 0).length}`);
const drW = rows.map((r) => pct(F.dutchRollFinOnly({ Nbeta: r.Y.Nb, Nr: r.Y.Nr, Yv: r.Y.Yv }).wn, r.dr.wn));
const drLow = drW.filter((e) => e < 0).length;
check(mae(drW) > 12 && mae(drW) < 22 && drLow >= 33,
  "Dutch-roll omega_n fin-only (sqrt N_beta): low at 33+ of 36 conditions, MAE between 12 and 22 % — the bias the engine states", `MAE ${f1(mae(drW))} %, max ${f1(maxAbs(drW))} %, low at ${drLow}`);
const drWc = rows.map((r) => pct(Math.sqrt(r.Y.Nb + r.Y.Yv * r.Y.Nr - r.Y.Lb * r.Y.Np / r.Y.Lp), r.dr.wn));
check(mae(drWc) < 6, "with the roll-coupling term (needs L_beta) the Dutch-roll omega_n MAE falls under 6 % — the term the engine cannot compute", `MAE ${f1(mae(drWc))} %, max ${f1(maxAbs(drWc))} %`);
const drZ = rows.map((r) => pct(F.dutchRollFinOnly({ Nbeta: r.Y.Nb, Nr: r.Y.Nr, Yv: r.Y.Yv }).zetaFormula, r.dr.zeta));
check(mae(drZ) > 60, "Dutch-roll zeta by the fin-only formula misses the reference by more than 60 % on average — why the engine WITHHOLDS it", `MAE ${f1(mae(drZ))} %, max ${f1(maxAbs(drZ))} %`);
const sub = rows.filter((r) => r.ph.zeta != null && r.f.M < 0.7);
const phW = sub.map((r) => pct(F.phugoidLanchester({ U: r.U * FT, LD: 2 * G_FPS2 / (-r.L.Xu * r.U) }).wn, r.ph.wn));
const phZ = sub.map((r) => pct(F.phugoidLanchester({ U: r.U * FT, LD: 2 * G_FPS2 / (-r.L.Xu * r.U) }).zeta, r.ph.zeta));
check(sub.length === 23 && mae(phW) > 15 && mae(phW) < 45, "phugoid omega_n (Lanchester) below M 0.7: an order of magnitude only, MAE between 15 and 45 %", `n ${sub.length}, MAE ${f1(mae(phW))} %`);
check(mae(phZ) > 20 && mae(phZ) < 55, "phugoid zeta 1/(sqrt2 L/D), L/D from X_u, below M 0.7: MAE between 20 and 55 %", `MAE ${f1(mae(phZ))} %`);
const phHigh = phW.filter((e) => e > 0).length;
check(phHigh >= 20, "Lanchester OVER-predicts the phugoid frequency at 20+ of the 23 subsonic conditions (constant-C_L Z_u is too strong for a real transport)", `high at ${phHigh} of ${phW.length}`);

/* ── 4. WHAT THE ENGINE STATES EQUALS THE MEASUREMENT ───────────────── */
console.log("\n4. The numbers engine/wingmodes.js states about itself are these numbers");
const V = CR2144_VALIDATION;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
check(V.source === CR2144_SOURCE.report && V.n === 36, "the engine names NASA CR-2144 and 36 conditions", `${V.source}, n ${V.n}`);
check(near(V.shortPeriod.wnMAE_pct, mae(spW), 0.3) && near(V.shortPeriod.zetaMAE_pct, mae(spZ), 0.3), "stated short-period MAEs equal the live measurement within 0.3 points", `${V.shortPeriod.wnMAE_pct} / ${V.shortPeriod.zetaMAE_pct} vs ${f1(mae(spW))} / ${f1(mae(spZ))}`);
check(near(V.rollMode.MAE_pct, mae(roll), 0.5) && V.rollMode.bias === "low", "stated roll-mode MAE and bias equal the live measurement", `${V.rollMode.MAE_pct} vs ${f1(mae(roll))}`);
check(near(V.dutchRollWn.MAE_pct, mae(drW), 0.5) && V.dutchRollWn.bias === "low", "stated Dutch-roll frequency MAE and bias equal the live measurement", `${V.dutchRollWn.MAE_pct} vs ${f1(mae(drW))}`);
check(V.dutchRollZeta.withheld === true && V.dutchRollZeta.MAE_pct_over >= 60 && mae(drZ) > V.dutchRollZeta.MAE_pct_over, "the engine states the Dutch-roll damping is withheld and why, with a bound the measurement exceeds", `> ${V.dutchRollZeta.MAE_pct_over} vs ${f1(mae(drZ))}`);
check(near(V.phugoid.wnMAE_pct_belowM07, mae(phW), 1) && near(V.phugoid.zetaMAE_pct_belowM07, mae(phZ), 1), "stated phugoid MAEs (M < 0.7) equal the live measurement within a point", `${V.phugoid.wnMAE_pct_belowM07} / ${V.phugoid.zetaMAE_pct_belowM07} vs ${f1(mae(phW))} / ${f1(mae(phZ))}`);
check(V.phugoid.lanchesterHighAt === phHigh && V.phugoid.of === phW.length, "the stated count of conditions where Lanchester over-predicts equals the live count", `${V.phugoid.lanchesterHighAt} of ${V.phugoid.of} vs ${phHigh} of ${phW.length}`);

/* ── 5. THE BARE 747 ON MIL-F-8785C CATEGORY B ──────────────────────── */
console.log("\n5. The bare-airframe 747 (SAS off) on the Category B tables, ten conditions");
const lv747 = B747.fc.map((f, i) => {
  const M = { applicable: true, nAlpha_gPerRad: B747.longHQ.nAlpha_gPerRad[i],
              phugoid: { zeta: B747.longModes.phZeta[i], wn: B747.longModes.phWn[i] },
              shortPeriod: { zeta: B747.longModes.spZeta[i], wn: B747.longModes.spWn[i] },
              dutchRoll: { zeta: B747.latModes.drZeta[i], wn: B747.latModes.drWn[i] },
              rollSubsidence: { tau_s: 1 / B747.latModes.rollInvT[i] },
              spiral: { parameter: null }, caveat: "CR-2144 printed factors" };
  return { fc: f.n, q: flyingQualities(M) };
});
check(lv747.every(({ q }) => q.modes.shortPeriodFrequency.level === 1 && q.modes.shortPeriodDamping.level === 1),
  "short period Level 1 at all ten conditions (omega^2/(n/alpha) 0.085-3.6, zeta 0.30-2.0)",
  lv747.map(({ fc, q }) => `${fc}:${(q.modes.shortPeriodFrequency.level)}/${q.modes.shortPeriodDamping.level}`).join(" "));
const rollLv = lv747.map(({ q }) => q.modes.rollMode.level);
check(rollLv.slice(0, 7).every((l) => l === 1) && rollLv.slice(7).every((l) => l === 2),
  "roll mode: Level 1 at the seven sea-level and 20 kft conditions, Level 2 at the three 40 kft conditions (tau_R 1.8-2.2 s against 1.4 s)",
  lv747.map(({ fc, q }) => `${fc}:${q.modes.rollMode.tau_s.toFixed(2)}s L${q.modes.rollMode.level}`).join(" "));
const drLevels = lv747.map(({ q }) => q.modes.dutchRoll.level);
check(drLevels.filter((l) => l === 1).length === 1 && drLevels[3] === 1 && drLevels.slice(7, 9).every((l) => l === 3),
  "Dutch roll, bare airframe SAS off: below Level 1 at nine of ten conditions (Level 1 only at M .65 sea level), Level 3 at two of the three 40 kft conditions; the report carries the yaw SAS on p. 215",
  drLevels.join(","));
const phLevels = lv747.map(({ q }) => q.modes.phugoid.level);
check(phLevels.filter((l) => l === 1).length >= 4 && phLevels.filter((l) => l === 2).length >= 4, "phugoid: mixed Level 1 and Level 2 across the ten conditions (zeta 0.023-0.32 against 0.04)", phLevels.join(","));

/* ── 6. THE ENGINE'S OWN OUTPUT CARRIES THE WITHHOLDING ──────────────── */
console.log("\n6. The sized eVTOL's modes carry the measured statement");
const { runSizing } = await import("../src/engine.js");
const { hoverQualities } = await import("../src/engine/hoverqualities.js");
const CFG = await import("../src/engine/configuration.js");
/* the same base case validation/flying-qualities.mjs uses, so the two harnesses look at one aircraft */
const BASE = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24, reserveMinutes:20, LD:8.5, AR:9,
  eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371, clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3,
  convTolExp:-6, etaHov:0.74, tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5, weightModel:"buildup",
  autoPositionWing:true, targetSM:0.15, fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const caseFor = (key) => { const d = CFG.CONFIG_DEFAULTS[key]; return { ...BASE, configType: key, nPropHover: d.nRotors,
  propDiam: (CFG.solveRotorDiameter(key, { ...BASE, configType: key, nPropHover: d.nRotors }, runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
  vCruise: d.vCruise_ms ?? BASE.vCruise, LD: d.LD_target ?? BASE.LD, etaHov: d.etaHov ?? BASE.etaHov, tipSpeed: d.tipSpeed_ms ?? BASE.tipSpeed,
  ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) }; };
for (const key of ["liftcruise", "hybrid", "tiltrotor"]) {
  const p = caseFor(key); const R = runSizing(p); const M = wingModes(R, hoverQualities(p, R).inertia || {}, p);
  check(M.applicable && M.dutchRoll.zeta === null && typeof M.dutchRoll.withheld === "string" && /CR-2144/.test(M.dutchRoll.withheld) && M.dutchRoll.wn > 0,
    `${key}: Dutch-roll damping is null with a withholding note naming CR-2144; the frequency is still given`, `wn ${M.dutchRoll.wn}`);
  check(M.validation === CR2144_VALIDATION && /CR-2144/.test(M.caveat) && /distributed-electric/i.test(M.caveat) && /WITHHELD/.test(M.caveat),
    `${key}: the result carries CR2144_VALIDATION and a caveat that names CR-2144, the withholding, and propulsion coupling`, "");
  const fq = flyingQualities(M);
  check(fq.modes.dutchRoll.level === null && fq.modes.dutchRoll.notLevelled === true && fq.worst.mode !== "dutchRoll"
        && fq.notLevelled.some((s) => /Dutch-roll damping/.test(s)),
    `${key}: flying qualities do not level the Dutch roll, list it as not levelled, and never make it the worst mode`, `worst ${fq.worst.mode} L${fq.worst.level}`);
}
check(/CR-2144/.test(flyingQualities({ applicable: true, dutchRoll: { zeta: null, wn: 1.5 } }).modes.dutchRoll.why),
  "a null damping with a frequency is refused with the CR-2144 reason, not levelled from frequency alone", "");

console.log("\n" + bar);
if (fails.length) { console.log(`WING-BORNE MODES vs CR-2144 GATE FAILED: ${fails.length} check(s)`); fails.forEach((f) => console.log("   - " + f)); process.exit(1); }
console.log("WING-BORNE MODES vs CR-2144 GATE PASSED");
