/* =====================================================================
   CONTROL-SURFACE EFFECTIVENESS AND TAIL SECTION THICKNESS
   =====================================================================
   Three numbers in the V-tail block were hardcoded with no registry entry
   and no source: the panel taper, the ruddervator chord fraction, and the
   section thickness. Two of the three a document can settle, and this gate
   holds them to their sources. The third (taper) cannot be settled by
   anything in the corpus and is now merely VISIBLE, which is the honest
   outcome and is asserted here too so it cannot quietly acquire a fake
   pedigree later.

   IT ALSO GUARDS A DIMENSIONAL FIX. The engine used to convert a required
   tail LIFT COEFFICIENT straight into degrees, as though a delta-CL were an
   angle. Turning one into the other needs the lift-curve slope and the
   control effectiveness, delta = dCL/(CL_alpha*tau); the slope was already
   computed and simply never used here. The checks below pin the corrected
   chain, because a dimensional error that once passed will pass again.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { tauEffectiveness, tauEffectivenessNASA, tailThickness,
         requiredChordFraction, TAIL_TC_MIN, TAIL_TC_MAX,
         TAIL_TC_WING_FRACTION, RUDDERVATOR_CHORD_FRAC_MIN,
         RUDDERVATOR_CHORD_FRAC_MAX, ELEVATOR_DEFLECTION_MAX_DEG,
         tailParasiteAreas }
  from "../src/engine/control-surfaces.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("CONTROL-SURFACE GATE");
console.log("=".repeat(78));

/* ── 1. tau IS EXACT AT BOTH LIMITS ──────────────────────────────────────
   These two are the cheap check that catches an inverted chord convention,
   which is the easy mistake here: writing theta_f = arccos(2*(1-cf/c)-1)
   instead of arccos(2*cf/c-1) gives a curve that looks plausible in the
   middle and is exactly backwards at the ends. */
console.log("\n1. Thin-airfoil effectiveness, exact at both ends:\n");
check(tauEffectiveness(0) === 0,
  "tau(0) = 0 — no surface, no authority", `${tauEffectiveness(0)}`);
check(Math.abs(tauEffectiveness(1) - 1) < 1e-12,
  "tau(1) = 1 — an all-moving surface is the whole tail", `${tauEffectiveness(1)}`);
let mono = true;
for (let x = 0.02; x < 0.98; x += 0.02)
  if (tauEffectiveness(x + 0.02) <= tauEffectiveness(x)) mono = false;
check(mono, "tau rises monotonically with chord fraction",
  "so the bisection for the required chord is well posed");

/* ── 2. TWO INDEPENDENT SOURCES AGREE WHERE IT MATTERS ────────────────── */
console.log("\n2. Analytic form vs the independent NASA quartic:\n");
console.log("   cf/c   Olson/Torenbeek   NASA CR-186872    diff");
let worstBand = 0;
for (const x of [0.20, 0.25, 0.30, 0.35, 0.40]) {
  const a = tauEffectiveness(x), b = tauEffectivenessNASA(x), d = Math.abs(a - b);
  worstBand = Math.max(worstBand, d);
  console.log("   " + x.toFixed(2) + "        " + a.toFixed(4) + "           "
    + b.toFixed(4) + "       " + d.toFixed(4));
}
check(worstBand < 0.02,
  "the two agree across the working chord band 0.20-0.40",
  `worst ${worstBand.toFixed(4)} — a transcription error in either form would show here`);
check(Math.abs(tauEffectiveness(0.30) - tauEffectivenessNASA(0.30)) < 0.002,
  "and agree to better than 0.002 at the shipped 0.30",
  `${Math.abs(tauEffectiveness(0.30) - tauEffectivenessNASA(0.30)).toFixed(4)}`);
check(Math.abs(tauEffectivenessNASA(1) - 1) > 0.01,
  "the quartic does NOT satisfy the analytic limit, which is why it is the comparator",
  `tau_NASA(1) = ${tauEffectivenessNASA(1).toFixed(4)}, not 1 — it is a fit to a digitised figure`);

/* ── 3. TAIL THICKNESS IS COMPUTED FROM THE WING, NOT ASSUMED ─────────── */
console.log("\n3. Tail section thickness follows the wing, inside its published band:\n");
console.log("   wing t/c   tail t/c   rule");
for (const w of [0.10, 0.12, 0.15, 0.18, 0.21]) {
  const t = tailThickness(w);
  const raw = TAIL_TC_WING_FRACTION * w;
  console.log("   " + w.toFixed(2).padStart(7) + t.toFixed(4).padStart(11) + "   "
    + (Math.abs(t - raw) < 1e-12 ? "0.90 x wing" : (t === TAIL_TC_MAX ? "capped at band max" : "raised to band min")));
}
check(TAIL_TC_MIN === 0.09 && TAIL_TC_MAX === 0.12,
  "the band is Scholz's published 9%-12%", `${TAIL_TC_MIN}-${TAIL_TC_MAX}`);
check(Math.abs(tailThickness(0.12) - 0.108) < 1e-9,
  "inside the band the rule is 0.90 x wing t/c", "wing 0.12 -> tail 0.108");
check(tailThickness(0.15) === TAIL_TC_MAX,
  "at this tool's default wing t/c the band caps it",
  `wing 0.15 -> 0.135 raw -> ${TAIL_TC_MAX} — i.e. NACA 0012, NOT the 0.09 that was hardcoded`);
check(tailThickness(0.05) === TAIL_TC_MIN && tailThickness(0.30) === TAIL_TC_MAX,
  "the band binds in both directions");

/* ── 4. THE DIMENSIONAL FIX, PINNED ──────────────────────────────────────
   A required lift increment becomes an angle only through CL_alpha*tau. If
   that divisor is ever dropped again the deflection stops responding to the
   chord fraction at all, which is exactly what the old code did. */
console.log("\n4. A deflection is a lift requirement divided by slope and effectiveness:\n");
const dCL = 0.10, CLa = 3.0;
const dSmall = dCL / (CLa * tauEffectiveness(0.25));
const dLarge = dCL / (CLa * tauEffectiveness(0.40));
console.log(`   same dCL=${dCL} at 25% chord -> ${(dSmall*180/Math.PI).toFixed(2)}deg,`
  + ` at 40% chord -> ${(dLarge*180/Math.PI).toFixed(2)}deg`);
check(dLarge < dSmall,
  "a BIGGER control surface needs a SMALLER deflection",
  "the old code had no tau at all, so chord fraction changed nothing");
check(Math.abs(dCL / (CLa * tauEffectiveness(0.30)) * 180 / Math.PI - 2.8909) < 0.01,
  "the conversion reproduces a hand calculation",
  "dCL 0.10 / (3.0 * 0.6607) = 0.05046 rad = 2.891 deg");

/* ── 5. THE REQUIRED-CHORD SOLVER ──────────────────────────────────────── */
console.log("\n5. Smallest chord that trims inside the published limit:\n");
const easy = requiredChordFraction({ dCLreq: 0.02, CLalpha: 3.0, gamma: 0 });
const hard = requiredChordFraction({ dCLreq: 0.55, CLalpha: 3.0, gamma: 0 });
const impossible = requiredChordFraction({ dCLreq: 5.0, CLalpha: 3.0, gamma: 0 });
console.log(`   easy dCL 0.02 -> ${easy}   hard dCL 0.55 -> ${hard}   impossible dCL 5.0 -> ${impossible}`);
check(easy === RUDDERVATOR_CHORD_FRAC_MIN,
  "an easy requirement returns the smallest published chord", `${easy}`);
check(impossible === null,
  "an impossible requirement returns null rather than a number",
  "so the caller SAYS the surface cannot trim it instead of reporting a deflection it cannot reach");
check(hard !== null && hard > RUDDERVATOR_CHORD_FRAC_MIN && hard <= RUDDERVATOR_CHORD_FRAC_MAX,
  "a demanding one lands inside the published band", `${hard}`);
if (hard != null) {
  const achieved = 0.55 / (3.0 * tauEffectiveness(hard)) * 180 / Math.PI;
  check(Math.abs(achieved - ELEVATOR_DEFLECTION_MAX_DEG) < 0.05,
    "and it lands exactly ON the published limit, not near it",
    `${achieved.toFixed(3)}deg vs published limit ${ELEVATOR_DEFLECTION_MAX_DEG}deg`);
}

/* ── 6. THE ENGINE USES IT, AND THE CHORD FRACTION IS CLAMPED ─────────── */
const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5, weightModel:"buildup",
  fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032, vtGamma:45, vtAR:2.5 };
const build = (k, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD, etaHov:d.etaHov ?? B.etaHov, ...over };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};
const WINGED = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor"];
console.log("\n6. As the engine runs it:\n");
console.log("   layout          t/c    taper   cf/c    tau    delta_rv  required");
const rows = WINGED.map((k) => ({ k, r: runSizing(build(k)) }));
for (const { k, r } of rows)
  console.log("   " + k.padEnd(14) + (r.vtTC ?? NaN).toFixed(4).padStart(7)
    + (r.vtTaper ?? NaN).toFixed(2).padStart(8) + (r.rvChordFrac ?? NaN).toFixed(2).padStart(7)
    + (r.tauRuddervator ?? NaN).toFixed(4).padStart(8)
    + (r.delta_rv_deg ?? NaN).toFixed(2).padStart(9)
    + String(r.rvChordRequired).padStart(10));

check(rows.every(({ r }) => r.vtTC === tailThickness(0.15)),
  "every layout uses the COMPUTED tail thickness, not a literal",
  `all ${TAIL_TC_MAX} at wing t/c 0.15`);
check(rows.every(({ r }) => Math.abs(r.tauRuddervator - tauEffectiveness(r.rvChordFrac)) < 1e-3),
  "the tau the engine applied matches the sourced formula at its own chord fraction");
const clampLo = runSizing(build("liftcruise", { vtRuddervatorChordFrac: 0.05 }));
const clampHi = runSizing(build("liftcruise", { vtRuddervatorChordFrac: 0.95 }));
check(clampLo.rvChordFrac === RUDDERVATOR_CHORD_FRAC_MIN
   && clampHi.rvChordFrac === RUDDERVATOR_CHORD_FRAC_MAX,
  "the chord fraction is clamped to its own published band",
  `0.05 -> ${clampLo.rvChordFrac}, 0.95 -> ${clampHi.rvChordFrac}; the input cannot leave its source`);

/* Chord fraction must actually move the deflection — the property the old
   code lacked, since it had no tau. */
const thin = runSizing(build("liftcruise", { vtRuddervatorChordFrac: 0.25 }));
const fat  = runSizing(build("liftcruise", { vtRuddervatorChordFrac: 0.40 }));
check(Math.abs(fat.delta_rv_deg) < Math.abs(thin.delta_rv_deg),
  "a wider ruddervator trims at a smaller deflection IN THE ENGINE",
  `25% -> ${Math.abs(thin.delta_rv_deg).toFixed(2)}deg, 40% -> ${Math.abs(fat.delta_rv_deg).toFixed(2)}deg`);

/* ── 7. THE TAPER IS VISIBLE, AND HONESTLY UNSOURCED ─────────────────── */
console.log("\n7. The one of the three no document settles:\n");
check(DEFAULT_PARAMS.vtTaper === 0.40,
  "vtTaper is a registered input carrying its inherited value",
  "hardcoded before, so nothing could see or sweep it");
const t30 = runSizing(build("liftcruise", { vtTaper: 0.30 }));
check(Math.abs(t30.MAC_vt - rows[0].r.MAC_vt) > 1e-4,
  "and it now actually moves the planform when swept",
  `taper 0.40 -> MAC_vt ${rows[0].r.MAC_vt}, taper 0.30 -> ${t30.MAC_vt}`);
check(DEFAULT_PARAMS.vtRuddervatorChordFrac === 0.30,
  "vtRuddervatorChordFrac is a registered input inside its published band");

/* ── 8. THE SIZED TAIL REACHES THE DRAG TOTAL ────────────────────────────
   This is the property that was absent. Both drag build-ups took tail wetted
   area as a fixed fraction of WING area and applied a bare 1.05 form factor
   with no thickness term, so the entire tail-sizing chain changed the drawn
   aircraft and the weights and changed the drag by nothing at all. The test
   is behavioural rather than structural: double the tail volume coefficients
   and the aircraft must get heavier. Before the fix this moved MTOW by
   0.00%. */
console.log("\n8. Tail size now reaches the drag total:\n");
console.log("   layout          MTOW   CD0tot    2x tail volume -> dMTOW");
let minMove = Infinity;
for (const k of WINGED) {
  const a = runSizing(build(k));
  const b = runSizing(build(k, { vtCh: 0.90, vtCv: 0.064 }));
  const d = (b.MTOW - a.MTOW) / a.MTOW * 100;
  minMove = Math.min(minMove, d);
  console.log("   " + k.padEnd(14) + (a.MTOW ?? NaN).toFixed(0).padStart(7)
    + (a.CD0tot ?? NaN).toFixed(5).padStart(10) + (d >= 0 ? "+" : "") + d.toFixed(2).padStart(12) + "%");
}
check(minMove > 1.0,
  "doubling the tail volume coefficients makes the aircraft heavier",
  `smallest move ${minMove.toFixed(2)}% — it was 0.00% when the tail drag used a fixed fraction of wing area`);

/* THE ABOVE IS NOT ENOUGH ON ITS OWN, and a mutant proved it: a bigger tail
   is also a HEAVIER tail, so MTOW moves through the weight path even when the
   drag path is still decoupled. Reverting the in-loop copy to the fixed
   fraction left that check green. What isolates the drag path is the tail
   drag AREA THE SIZING LOOP ITSELF USED, which the engine now reports. */
console.log("\n   isolating the DRAG path — tail area used by the sizing loop:\n");
console.log("   layout          fDqTail   2x volume   ratio   resolved");
let minRatio = Infinity, allResolved = true;
for (const k of WINGED) {
  const a = runSizing(build(k));
  const b = runSizing(build(k, { vtCh: 0.90, vtCv: 0.064 }));
  const ratio = b.fDqTailSizing / a.fDqTailSizing;
  minRatio = Math.min(minRatio, ratio);
  allResolved = allResolved && a.tailDragResolved === true;
  console.log("   " + k.padEnd(14) + (a.fDqTailSizing ?? NaN).toFixed(4).padStart(8)
    + (b.fDqTailSizing ?? NaN).toFixed(4).padStart(11) + ratio.toFixed(3).padStart(9)
    + String(a.tailDragResolved).padStart(10));
}
check(minRatio > 1.5,
  "the SIZING LOOP's own tail drag responds to the tail volume coefficients",
  `smallest ratio ${minRatio.toFixed(3)} — this is the check that a fixed wing fraction fails`);
check(allResolved,
  "and it resolved from the real geometry on every winged layout",
  "resolved:false would mean it fell back to the fixed fraction");

/* And it must respond to the tail THICKNESS, which reaches it only through
   the sourced wing-to-tail rule. A mutant that pinned the drag-side t/c back
   at the old 0.09 survived until this check existed. */
const thinTail = runSizing(build("liftcruise", { tc: 0.10 }));   // -> tail t/c 0.090
const thickTail = runSizing(build("liftcruise", { tc: 0.15 }));  // -> tail t/c 0.120
/* NOT a bare "drag went up" check, for the same reason as above: a thicker
   WING makes a heavier aircraft and therefore a bigger tail, so the tail drag
   rises even when its thickness is pinned — a mutant that froze the drag-side
   t/c at the old 0.09 survived exactly that test. What isolates thickness is
   the FORM FACTOR the drag used, which depends on t/c and nothing else. */
const ffExpected = (tc) => (1 + (0.6 / 0.30) * tc + 100 * tc ** 4) * 1.05;
check(Math.abs(thinTail.tailDragFF - ffExpected(tailThickness(0.10))) < 1e-5
   && Math.abs(thickTail.tailDragFF - ffExpected(tailThickness(0.15))) < 1e-5,
  "the drag's form factor is the Raymer FF at the COMPUTED tail thickness",
  `wing t/c 0.10 -> tail ${tailThickness(0.10).toFixed(3)}, FF ${thinTail.tailDragFF.toFixed(4)};`
  + ` wing t/c 0.15 -> tail ${tailThickness(0.15).toFixed(3)}, FF ${thickTail.tailDragFF.toFixed(4)}`);
check(thickTail.tailDragFF > thinTail.tailDragFF,
  "so a thicker tail section really does cost more drag",
  "and it moves because of THICKNESS, not because the aircraft grew");

/* The helper must REFUSE a degenerate arm rather than divide by it. */
const degenerate = tailParasiteAreas({ Swing: 20, MAC: 1.4, span: 13, lv: -2,
  Ch: 0.45, Cv: 0.032, tc: 0.12, taper: 0.4 });
const good = tailParasiteAreas({ Swing: 20, MAC: 1.4, span: 13, lv: 3.8,
  Ch: 0.45, Cv: 0.032, tc: 0.12, taper: 0.4 });
/* A CALLER THAT NEVER DECLARED A TAIL. Several harnesses build a bare
   parameter object with no vtCh/vtCv at all. While the tail drag was a fixed
   fraction of wing area that was harmless, because the coefficients reached
   nothing that mattered. Coupling the tail to drag made a missing coefficient
   fatal: Ch*S*MAC/lv went NaN, the mission energy followed, the battery mass
   collapsed to NaN and MTOW fell 40% — and the inertia gate caught it, because
   a NaN mass is skipped by the tensor and shows up as 10% of the aircraft
   going missing. Falling back is right here rather than substituting a default
   tail volume: a caller who did not declare a tail has not asked for one to be
   invented. */
const noTail = tailParasiteAreas({ Swing: 20, MAC: 1.4, span: 13, lv: 3.8,
  Ch: undefined, Cv: undefined, tc: 0.12, taper: 0.4 });
check(noTail.resolved === false
   && Number.isFinite(noTail.Swh) && Number.isFinite(noTail.Swv) && noTail.Swh > 0,
  "undeclared tail volume coefficients fall back FINITE, and say they did not resolve",
  "a missing coefficient used to reach the mission energy as NaN and take MTOW 40% with it");
const bareRun = runSizing({ ...build("liftcruise"), vtCh: undefined, vtCv: undefined });
check(Number.isFinite(bareRun.MTOW) && Number.isFinite(bareRun.Wbat) && bareRun.Wbat > 0,
  "and a whole sizing run with no declared tail still closes with a finite battery",
  `MTOW ${bareRun.MTOW?.toFixed(1)}, Wbat ${bareRun.Wbat?.toFixed(1)} — both NaN before this guard`);

check(degenerate.resolved === false && degenerate.Swh > 0,
  "a non-positive tail arm falls back and SAYS it did not resolve",
  "a drag model that silently returns infinity is worse than one that says it could not decide");
check(good.resolved === true && Math.abs(good.Sh - 0.45 * 20 * 1.4 / 3.8) < 1e-9,
  "a good arm gives the volume-coefficient area exactly",
  `Sh = Ch*S*MAC/lv = ${good.Sh.toFixed(4)} m2`);
check(good.FF > 1.25 && Math.abs(good.FF - (1 + 2 * 0.12 + 100 * 0.12 ** 4) * 1.05) < 1e-9,
  "and the Raymer form factor on the tail's own thickness, not a bare 1.05",
  `FF = ${good.FF.toFixed(4)} at t/c 0.12, against the 1.05 that carried no thickness at all`);

console.log("\n" + "=".repeat(78));
if (fails.length) {
  console.log(`CONTROL-SURFACE GATE FAILED — ${fails.length} check(s):`);
  for (const f of fails) console.log("   - " + f);
  process.exit(1);
}
console.log("CONTROL-SURFACE GATE PASSED");
