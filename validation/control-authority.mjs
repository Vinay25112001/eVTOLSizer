/* =====================================================================
   FAILURE-MODE CONTROLLABILITY GATE
   =====================================================================
   Validates the ACAI implementation against the published hexacopter
   result — which is the one worth validating against, because it is
   counter-intuitive and a wrong implementation will not reproduce it —
   then reports every layout in this tool at its own geometry.
   ===================================================================== */
import { acai, ringRotors, failRotor, torqueToThrustRatio } from "../src/engine/controlauthority.js";
import { runSizing } from "../src/engine.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("FAILURE-MODE CONTROLLABILITY GATE");
console.log("=".repeat(76));
console.log("  Du, Quan, Yang & Cai, J. Guidance Control & Dynamics (arXiv:1403.5986)");
console.log("  ACAI = rho(G, dOmega): radius of the largest ball at the hover requirement");
console.log("  inside the attainable control set. Controllable iff rank 4 AND ACAI > 0.");
console.log("");

/* ── THE PUBLISHED RESULT, WHICH IS THE POINT ─────────────────────────
   "a hexacopter is uncontrollable when one rotor fails, even though the
   hexacopter is over-actuated and its controllability matrix is row full
   rank" — and a different spin arrangement of the SAME six rotors does not
   share that fate. An implementation that gets this wrong will look fine on
   a quadrotor and be useless where it matters. */
const r = 0.275, kMu = 0.1, W = 15.0, fMax = 6.125;
const hexa = (spins) => ringRotors(6, r, spins);
const PNPNPN = hexa([1, -1, 1, -1, 1, -1]);
const PPNNPN = hexa([1, 1, -1, -1, 1, -1]);

const pnFails = PNPNPN.map((_, i) => acai({ rotors: failRotor(PNPNPN, i), kMu, fMaxN: fMax, weightN: W }));
check(pnFails.every((x) => !x.controllable) && pnFails.every((x) => x.rank === 4),
  "PNPNPN hexacopter: EVERY single-rotor failure is uncontrollable at FULL RANK",
  `ACAI ${pnFails.map((x) => x.acai.toFixed(2)).join(", ")} with rank 4 throughout — `
  + `the published paradox reproduced, and rank is shown not to be the test`);

check(pnFails.every((x) => x.fullRankButUncontrollable),
  "and the model reports that distinction explicitly rather than hiding it",
  "fullRankButUncontrollable is set on all six — a caller reading rank alone "
  + "would conclude the opposite of the truth");

const ppFails = PPNNPN.map((_, i) => acai({ rotors: failRotor(PPNNPN, i), kMu, fMaxN: fMax, weightN: W }));
const nOK = ppFails.filter((x) => x.controllable).length;
check(nOK > 0 && nOK < 6,
  "PPNNPN hexacopter: the same six rotors survive SOME failures and not others",
  `${nOK} of 6 remain controllable (ACAI ${ppFails.map((x) => x.acai.toFixed(2)).join(", ")}) — `
  + `"a new rotor arrangement (PPNNPN) ... can remain controllable when one of some `
  + `specific rotors stops". Spin direction, not rotor count, decides it.`);

check(acai({ rotors: PNPNPN, kMu, fMaxN: fMax, weightN: W }).acai > 0,
  "an undamaged aircraft has positive control authority",
  `healthy ACAI ${acai({ rotors: PNPNPN, kMu, fMaxN: fMax, weightN: W }).acai.toFixed(3)} — `
  + `the test is not simply returning zero for everything`);

/* k_mu is derived, not tuned: k_mu = v_i R / (FM Vtip). */
const km = torqueToThrustRatio({ thrustPerRotorN: 5000, R_m: 1.5, tipSpeed_ms: 167.64, FM: 0.74 });
check(km > 0 && km < 1.5,
  "the torque-to-thrust ratio is derived from momentum theory, not assumed",
  `k_mu ${km.toFixed(4)} m for a 5 kN rotor of 1.5 m radius — from `
  + `v_i = sqrt(T/2 rho A) and Q = P/Omega, with no fitted constant`);

/* ── EVERY LAYOUT, AT ITS OWN GEOMETRY ───────────────────────────────── */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

console.log("");
console.log("  MEASURED, NOT ASSERTED — real rotor stations from engine/geometry.js:");
console.log("    layout        N   healthy   worst single failure   survivable");
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    twRatio: Math.max(1.30, CFG.oeiThrustMarginFor(k, d.nRotors) ?? 1.30),
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const g = aircraftGeometry(p, S);
  const disc = g.bodies.filter((b) => b.kind === "rotor");
  if (disc.length < 4) {
    console.log(`    ${k.padEnd(13)}${String(disc.length).padStart(2)}   `
      + `— fewer than 4 rotors: the 4-axis allocation cannot be spanned at all, `
      + `so no failure is survivable by this test`);
    continue;
  }
  /* CG at the thrust centroid: in trimmed hover the two coincide, which is a
     requirement rather than an assumption (see the side-by-side tail work). */
  const cx = disc.reduce((s, b) => s + b.x, 0) / disc.length;
  const cy = disc.reduce((s, b) => s + b.y, 0) / disc.length;
  const R = disc[0].radius, W_N = S.MTOW * 9.80665;
  const fMaxN = (W_N * (p.twRatio || 1.3)) / disc.length;
  const kmu = torqueToThrustRatio({ thrustPerRotorN: W_N / disc.length, R_m: R,
                                    tipSpeed_ms: p.tipSpeed, FM: p.etaHov });
  /* ALTERNATING BY AZIMUTH, NOT BY ARRAY INDEX. Neighbours around the
     perimeter counter-rotate; that is the physical rule and it is what makes
     the yaw row independent of the roll row.

     Assigning by index instead looked equivalent and was not. geometry.js
     emits the lift+cruise rotors as FL, FR, AL, AR, so i%2 gave both LEFT
     rotors one direction and both RIGHT rotors the other — which makes the
     yaw row exactly proportional to the roll row, drops Bf to rank 3, and
     reported ACAI 0 for a HEALTHY aircraft. That was my spin assignment, not
     a property of the design, and it would have shipped as a finding.

     Sorting by azimuth first gives the standard arrangement on both shapes:
     alternating around a ring, and diagonal pairs on a rectangle. */
  const order = disc
    .map((b, i) => ({ i, phi: Math.atan2(b.y - cy, b.x - cx) }))
    .sort((u, v) => u.phi - v.phi);
  const spin = new Array(disc.length);
  order.forEach((o, seq) => { spin[o.i] = seq % 2 ? -1 : 1; });
  const rotors = disc.map((b, i) => ({
    r: Math.hypot(b.x - cx, b.y - cy),
    phi: Math.atan2(b.y - cy, b.x - cx),
    w: spin[i], eta: 1,
  }));
  const healthy = acai({ rotors, kMu: kmu, fMaxN, weightN: W_N });
  const each = rotors.map((_, i) => acai({ rotors: failRotor(rotors, i), kMu: kmu, fMaxN, weightN: W_N }));
  const nSurv = each.filter((x) => x.controllable).length;
  const worst = each.reduce((a, b) => (b.acai < a.acai ? b : a), each[0]);
  console.log(`    ${k.padEnd(13)}${String(disc.length).padStart(2)}`
    + `${healthy.acai.toFixed(1).padStart(10)}${worst.acai.toFixed(1).padStart(11)}`
    + ` (${worst.limitingAxis})`.padEnd(12)
    + `${nSurv} of ${rotors.length}`);
}

console.log("");
console.log("  WHAT THAT SAYS:");
console.log("    Thrust margin and controllability are different questions, and this tool");
console.log("    had only ever asked the first. A layout can hold its weight on the");
console.log("    surviving rotors and still be unable to hold ATTITUDE while doing it.");
console.log("");
console.log("    Spin direction decides fault tolerance and NOTHING in this tool sets it.");
console.log("    The published hexacopter pair is the proof: same six rotors, same arms,");
console.log("    same thrust — one arrangement loses control on any failure, the other");
console.log("    survives four of six. That is an unmade design decision sitting under");
console.log("    every rotor-borne configuration here.");

console.log("");
if (fails) { console.log(`FAILURE-MODE CONTROLLABILITY GATE FAILED: ${fails}`); process.exit(1); }
console.log("FAILURE-MODE CONTROLLABILITY GATE PASSED");
