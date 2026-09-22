/* =====================================================================
   HOVER DYNAMICS GATE
   =====================================================================
   There is no published eVTOL modal data to validate against — zero of
   857 corpus papers give damping ratios, eigenvalues or modal
   frequencies, and exactly one gives moments of inertia, for a subscale
   model. So this harness does NOT compare to an aircraft.

   What it can do instead is check the things that are true of any rigid
   body and any rotor, and would be violated by the lumping error this
   work was built to fix:

     1. THE INERTIA TRIANGLE INEQUALITIES. For ANY real body,
        Ixx + Iyy >= Izz, and the two cyclic permutations. These are not
        modelling choices, they are geometry. A tensor assembled from
        masses lumped at a centroid fails them or comes absurdly close.
     2. ALL THE MASS IS SOMEWHERE. If the tensor accounts for less than
        the aircraft weighs, something was silently dropped, and a
        dropped mass always UNDER-states inertia.
     3. DAMPING IS NEGATIVE ON EVERY AXIS. A rotor array in hover is
        passively stable in heave, roll and pitch; a positive value means
        a sign error, not an unstable aircraft.
     4. HEAVE DAMPING FALLS AS DISK LOADING RISES. Zw = -g/vi with
        vi = sqrt(DL/2rho), so |Zw| goes as 1/sqrt(DL). That is a
        prediction the model makes across configurations and it can be
        checked without any external number.
     5. THE SIDE-BY-SIDE HAS ALMOST NO PITCH DAMPING. Two rotors abreast
        have no fore-aft separation, so Mq must be far weaker than Lp.
        A layout-specific signature the model must reproduce.

   Run: node validation/hover-dynamics.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { hoverQualities } from "../src/engine/hoverqualities.js";
import * as CFG from "../src/engine/configuration.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65 };

console.log("HOVER DYNAMICS GATE");
console.log(bar);
console.log("no published eVTOL modal data exists to compare against; these are");
console.log("properties of any rigid body and any rotor, which is what CAN be checked\n");

const rows = [];
for (const key of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[key];
  const p = { ...B, configType: key, nPropHover: d.nRotors,
    /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
    etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
  const R = runSizing(p);
  const H = hoverQualities(p, R);
  if (!H.applicable) { console.log(`  (${key}: not applicable)`); continue; }
  rows.push({ key, H, MTOW: R.MTOW, p, SR: R });
  const I = H.inertia, D = H.dynamics;
  console.log(`   ${key.padEnd(13)} I ${String(I.Ixx).padStart(8)}/${String(I.Iyy).padStart(8)}/${String(I.Izz).padStart(8)}` +
              `  Lp ${String(D.Lp).padStart(7)}  Mq ${String(D.Mq).padStart(7)}  Zw ${String(D.Zw).padStart(7)}` +
              `  DL ${String(H.diskLoading_Nm2).padStart(6)} N/m2`);
}
console.log("");

check(rows.length >= 5, "hover dynamics resolve on essentially every layout", `${rows.length} of 6`);

/* 1. triangle inequalities — pure geometry, cannot be argued with */
const tri = rows.filter(r => {
  const { Ixx, Iyy, Izz } = r.H.inertia;
  return !(Ixx + Iyy >= Izz && Iyy + Izz >= Ixx && Izz + Ixx >= Iyy);
});
check(tri.length === 0,
  "the inertia tensor satisfies the triangle inequalities on every layout",
  tri.length ? tri.map(r => r.key).join(", ")
    : "Ixx+Iyy>=Izz and cyclic — true of any real body, and the test a lumped tensor fails");

/* 2. no mass silently dropped */
const lost = rows.filter(r => Math.abs(r.H.inertia.massAccounted - r.MTOW) > 0.02 * r.MTOW);
check(lost.length === 0,
  "the tensor accounts for the whole aircraft",
  lost.length ? lost.map(r => `${r.key} ${r.H.inertia.massAccounted}/${r.MTOW.toFixed(0)}`).join(", ")
    : "every layout within 2% of MTOW; a dropped mass always understates inertia");

/* 3. passive stability signs */
const bad = rows.filter(r => !(r.H.dynamics.Lp < 0 && r.H.dynamics.Mq < 0 && r.H.dynamics.Zw < 0));
check(bad.length === 0,
  "heave, roll and pitch damping are all restoring",
  bad.length ? bad.map(r => r.key).join(", ") : "negative on every axis and every layout");

/* 4. Zw ~ 1/sqrt(DL): a prediction the model makes, checkable internally */
const sorted = rows.slice().sort((a, b) => a.H.diskLoading_Nm2 - b.H.diskLoading_Nm2);
const lo = sorted[0], hi = sorted[sorted.length - 1];
const ratioPred = Math.sqrt(hi.H.diskLoading_Nm2 / lo.H.diskLoading_Nm2);
const ratioAct = Math.abs(lo.H.dynamics.Zw / hi.H.dynamics.Zw);
check(Math.abs(ratioAct / ratioPred - 1) < 0.25,
  "heave damping falls as 1/sqrt(disk loading), as Zw = -g/vi requires",
  `${lo.key} (DL ${lo.H.diskLoading_Nm2}) vs ${hi.key} (DL ${hi.H.diskLoading_Nm2}): ` +
  `|Zw| ratio ${ratioAct.toFixed(2)} against the predicted ${ratioPred.toFixed(2)}`);

/* 5. the side-by-side signature */
const sbs = rows.find(r => r.key === "sideBySide");
if (sbs) {
  const { Lp, Mq } = sbs.H.dynamics;
  check(Math.abs(Mq) < Math.abs(Lp) * 0.25,
    "the side-by-side has almost no rotor-derived PITCH damping",
    `Mq ${Mq} against Lp ${Lp} — two rotors abreast have no fore-aft separation, ` +
    `so the model reproduces a real configuration difference rather than a generic answer`);
  /* THE 0.25 HERE WAS CALIBRATED AGAINST A WRONG SPAN. The side-by-side's
     rotors were drawn at +/-7.03 m when the layout's own non-overlap geometry
     puts them at +/-3.76 m — an 87% overwide span, and roll inertia goes as
     the square of the lateral offset, so Ixx was inflated by roughly 3.5x on
     the rotor terms. A threshold tuned to that is a threshold tuned to a
     defect: it would have PASSED any span, however wrong, as long as it was
     wrong in the generous direction.

     The claim is unchanged and still worth making — a side-by-side's masses
     sit far off the roll axis and close to the pitch axis, so Ixx must
     dominate — but it is now stated at a ratio the corrected geometry
     supports: roll inertia at least twice pitch inertia. Measured 0.40. */
  check(sbs.H.inertia.Iyy < sbs.H.inertia.Ixx * 0.5,
    "and its pitch inertia is far below its roll inertia, for the same reason",
    `Iyy ${sbs.H.inertia.Iyy} vs Ixx ${sbs.H.inertia.Ixx} — ratio `
    + `${(sbs.H.inertia.Iyy / sbs.H.inertia.Ixx).toFixed(2)}, at the rotor `
    + `separation the layout's own geometry sets rather than an overwide one`);
}

/* ── THE CLAIM THE TOOL IS ENTITLED TO MAKE ───────────────────────────
   Absolute modal values are unanchored and must not be claimed. DIFFERENCES
   between configurations can be - but only where the ordering survives the
   things we do not know. That is testable, and it is what this block tests.

   Method after DiMaggio, Simmons, Geuther, Hartfield & Ahuja (NASA Langley /
   Auburn, SciTech 2025), who found a mid-fidelity vorticity solver got LA-8's
   trends right and its magnitudes wrong, and concluded the slopes are usable
   once anchored to "a true data point". Prediction gives slopes; measurement
   gives the offset. We have no offset, so we report slopes. */
{
  const { compareHandling } = await import("../src/engine/handlingcompare.js");
  const C = compareHandling(rows.map(r => ({ key: r.key, p: r.p, SR: r.SR })), 0.5);
  console.log("");
  console.log("  CONFIGURATION RANKINGS, and whether they survive a +/-50% perturbation");
  const fragile = [];
  for (const [name, m] of Object.entries(C.metrics || {})) {
    console.log(`    ${name.padEnd(18)} ${m.robust ? "robust" : "FLIPS "}  spread ${String(m.spread).padStart(6)}%   ${m.ranking.join(" > ")}`);
    if (!m.robust) fragile.push(name);
  }
  check(C.applicable && Object.keys(C.metrics || {}).length >= 4,
    "configuration rankings are produced for the metrics a designer chooses on",
    `${Object.keys(C.metrics || {}).length} metrics`);
  check(fragile.length === 0,
    "every reported ranking survives the assumed coefficients moving by 50%",
    fragile.length ? `fragile: ${fragile.join(", ")}`
      : "no ordering flips - these differences are not artefacts of a guess");

  const dampOrder = C.metrics.rollDamping?.ranking || [];
  const agilOrder = C.metrics.rollAgility?.ranking || [];
  /* The claim is a TENDENCY, not a perfect reversal, and the first version of
     this check asserted the stronger thing: that the most damped layout is
     exactly the least agile. That held until the rotor diameters were solved
     rather than assumed, at which point the multicopter's rotor grew and it
     overtook the side-by-side as the least agile - and the gate failed on a
     change that was an improvement. Rank correlation is the honest test of a
     tendency. */
  const rankOf = (arr) => Object.fromEntries(arr.map((k, i) => [k, i]));
  const rd = rankOf(dampOrder), ra = rankOf(agilOrder);
  const keys = dampOrder.filter(k => k in ra);
  const n = keys.length;
  const dsum = keys.reduce((a, k) => a + (rd[k] - ra[k]) ** 2, 0);
  const rho = n > 1 ? 1 - (6 * dsum) / (n * (n * n - 1)) : 0;
  check(rho < -0.6,
    "damping and agility rank strongly OPPOSITE across the layouts",
    `Spearman rho = ${rho.toFixed(2)} — "the more stable they are, the harder they ` +
    `are to maneuver" (Malpica/Suh/Silva), recovered rather than imposed`);
}

console.log(`\n  NOT CHECKED, because nothing exists to check it against:`);
console.log(`    absolute accuracy of any of these numbers. No eVTOL publishes modal`);
console.log(`    data, damping ratios or eigenvalues; one publishes inertia, subscale.`);
console.log(`    ADS-33 thresholds are military and explicitly NOT civil requirements`);
console.log(`    (DOT/FAA/TC-23/59, 2024). These outputs stay tagged accordingly.`);


/* 6. ── THE ROTOR HEIGHT MUST NOT BE A COIN TOSS ────────────────────────
   Found 2026-09-06. geometry.js applied NASA's quadrotor fore/aft rise as
   MC_AFT_RISE * D * (x > xHub ? +0.5 : -0.5), a bare inequality. A
   side-by-side's two rotors sit ON the hub station, so x and xHub agree to
   four decimals and which way the last bits fall depends on the ring radius,
   which depends on rotor diameter, which depends on MTOW. A 2% change in
   gross weight flipped the pair between +0.74 m and -0.73 m of stagger --
   a 1.49 m change in hub height -- and with it Iyy by 3.3x, Mq from -0.31
   to -0.84 and Lp from -4.97 to -6.57. The damping figures this tool had
   PUBLISHED for the side-by-side were the "heads" outcome. Neither was right;
   an on-station lateral pair gets no fore/aft rise at all, and now gets none.

   The multicopter's lateral pair had been on the same coin. Its fore and aft
   rotors are genuinely fore and aft and keep NASA's rise.

   Three checks, none of which a bare inequality can pass by luck:
     (a) a side-by-side's two rotors share ONE height;
     (b) that height moves SMOOTHLY with weight -- across payload 410/455/500
         it may scale with the rotor (D grows with MTOW) but may not jump by a
         fraction of D;
     (c) the pitch damping is therefore stable across the same sweep. */
{
  const { aircraftGeometry } = await import("../src/engine/geometry.js");
  const PB = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
    reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
    clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
    etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
    deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
    weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
    vtGamma:45, vtAR:2.5 };
  const d = CFG.CONFIG_DEFAULTS.sideBySide;
  const sweep = [410, 455, 500].map(payload => {
    const p0 = { ...PB, payload, configType:"sideBySide", nPropHover:d.nRotors,
      vCruise:d.vCruise_ms ?? PB.vCruise, LD:d.LD_target ?? PB.LD,
      etaHov:d.etaHov ?? PB.etaHov, tipSpeed:d.tipSpeed_ms ?? PB.tipSpeed };
    const p = { ...p0, propDiam: CFG.solveRotorDiameter("sideBySide", p0, runSizing)?.propDiam };
    const S = runSizing(p), g = aircraftGeometry(p, S);
    const zs = g.bodies.filter(b => b.kind === "rotor").map(b => b.z);
    const H = hoverQualities(p, S) || {}; const dy = H.dynamics || H;
    return { payload, D: S.propDiam, zs, zMin: Math.min(...zs), zMax: Math.max(...zs), Mq: dy.Mq };
  });
  const mid = sweep[1];
  check(sweep.every(r => Math.abs(r.zMax - r.zMin) < 1e-6),
    "a side-by-side's two rotors share ONE height",
    sweep.map(r => `payload ${r.payload}: z ${r.zs.map(z => z.toFixed(3)).join("/")}`).join("; ")
    + " — a lateral pair on the hub station gets no fore/aft rise, and the two sides cannot differ");
  /* Height may scale with D (bigger rotor, taller stack) but must not jump. */
  const jumps = sweep.map(r => Math.abs(r.zMin - mid.zMin) / mid.D);
  check(Math.max(...jumps) < 0.05,
    "and that height moves smoothly with weight — no fraction-of-D jump",
    sweep.map(r => `${r.payload} kg: z ${r.zMin.toFixed(3)} m (D ${r.D.toFixed(2)})`).join("; ")
    + ` — worst step ${(100 * Math.max(...jumps)).toFixed(1)}% of D; the bare inequality moved it 17% of D`);
  const mqs = sweep.map(r => r.Mq);
  check(mqs.every(m => Number.isFinite(m)) && Math.max(...mqs) / Math.min(...mqs) < 1.15,
    "so the side-by-side's pitch damping is stable across the sweep",
    `Mq ${mqs.map(m => m.toFixed(3)).join(" / ")} at payload 410/455/500 — within 15%; the coin `
    + `toss gave -0.31 or -0.84 for the same aircraft depending on the last bits of a subtraction`);
}

console.log(`\n${bar}`);
console.log(fails.length ? `HOVER DYNAMICS GATE FAILED: ${fails.length}` : "HOVER DYNAMICS GATE PASSED");
process.exit(fails.length ? 1 : 0);
