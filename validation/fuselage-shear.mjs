/* ═══════════════════════════════════════════════════════════════════════
   FUSELAGE SHEAR FLOW GATE — Phase E / F4
   ═══════════════════════════════════════════════════════════════════════
   F4 is a DERIVATION, not a citation (FUSELAGE-STRUCTURE.md §2.1), so the
   gate is the two properties the research says come free of any source and
   are falsifiable on their own:

     1. the resultant of q round the section equals the applied shear, in
        magnitude and direction, at every boom count;
     2. for a load through the centre of the symmetric ring the closing
        constant is zero, and the discretised q converges on the thin-ring
        closed form q = (S_y / pi R) cos(theta), which is independent of the
        discretisation.

   Plus the joints: the booms reproduce F2's I_hshell exactly; an offset load
   satisfies moment equilibrium; the stress uses t_skin, not the stringer-
   credited t_shell; the peak sits where F1 puts it; the chain refuses without
   dp with F2's own reason; and the caveats name torsion, combination and
   cutouts as absent.

   MUTANTS, nine, every one caught by a named check: the boom jump's sign
   flipped (resultant, convergence, offset moment); boom area from a fixed
   count (the (A.13) identity); booms on the vertical axis (closing constant,
   straddling panel); the closing constant dropped (offset moment); stress on
   t_shell (the stringer-credit check); the along-fuselage flow on 2 pi R
   (the station identity); inertia with R for y (resultant, identity,
   convergence); the peak station taken as the first (F1's station); the
   straddling panel's mid-angle off by a panel (second-order convergence).

   The harness dp is 59,300 Pa, the same round number the F2 and F3 gates
   use, and for the same reason: it exercises the code and is not a sourced
   value for any aeroplane.
   ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as E from "../src/classes/aircraft/engine.js";
import { fuselageLoads } from "../src/classes/aircraft/fuselage-structure-loads.js";
import { fuselagePressureShell } from "../src/classes/aircraft/fuselage-pressure-shell.js";
import { fuselageShearFlow, boomShearFlow, thinRingShearFlow } from "../src/classes/aircraft/fuselage-shear-flow.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
console.log(bar); console.log("FUSELAGE SHEAR FLOW GATE — F4"); console.log(bar);

const DP = 59300;
const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const SIZED = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const F = Object.fromEntries(TYPES.map((t) => [t, fuselageShearFlow(SIZED[t], { deltaPPa: DP })]));
const WITH = TYPES.filter((t) => F[t]?.evaluated);
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

/* ── 1. THE DERIVATION'S OWN CHECKS, ON A UNIT RING ─────────────────── */
console.log("\n1. Statics on a unit ring: resultant, closing constant, convergence");
const UNIT = { shearN: 100000, radiusM: 1.8, tShellM: 0.0015 };
{
  const ns = [4, 8, 16, 32, 64, 128, 256];
  const res = ns.map((n) => boomShearFlow({ ...UNIT, nBooms: n }));
  const worstFy = Math.max(...res.map((r) => rel(r.resultant.fyN, UNIT.shearN)));
  const worstFx = Math.max(...res.map((r) => Math.abs(r.resultant.fxN) / UNIT.shearN));
  check(worstFy < 1e-9 && worstFx < 1e-9,
    "the resultant of q equals the applied shear at every boom count, 4 to 256",
    `worst |Fy/S_y - 1| ${worstFy.toExponential(1)}, worst |Fx/S_y| ${worstFx.toExponential(1)}`);
  const worstQ0 = Math.max(...res.map((r) => Math.abs(r.closingConstantNPerM) / r.thinRingQMaxNPerM));
  check(worstQ0 < 1e-9,
    "for a load through the centre the closing constant is zero at every boom count",
    `worst |q0| / q_max ${worstQ0.toExponential(1)}`);
  const worstI = Math.max(...res.map((r) => rel(r.inertiaM4, r.ringInertiaM4)));
  check(worstI < 1e-12,
    "the equal booms reproduce the ring inertia pi R^3 t_shell exactly, (A.13), for every n >= 4",
    `worst relative error ${worstI.toExponential(1)}`);
  /* Convergence to the closed form. The panel flow is a stratum average of
     cos(theta), so its error against the mid-panel value is second order in
     the panel angle: quartering from n to 2n. Gate the ORDER as well as the
     size, because a first-order error (a boom placed at the wrong end of its
     panel) still shrinks. */
  const errs = res.map((r) => Math.max(...r.panels.map((p) => Math.abs(p.qNPerM - p.thinRingNPerM))) / r.thinRingQMaxNPerM);
  const ratios = errs.slice(1).map((e, i) => errs[i] / e);
  const orderTwo = ratios.slice(2).every((q) => q > 3.5 && q < 4.5);        // from n = 32 on
  check(errs[errs.length - 1] < 1e-4 && orderTwo,
    "the discretised flow converges on q = (S_y / pi R) cos(theta) at second order in the panel angle",
    `max |q - q_ring| / q_max: ${ns.map((n, i) => `n=${n} ${errs[i].toExponential(2)}`).join(", ")}; ratios ${ratios.map((r) => r.toFixed(2)).join(" ")}`);
  const r32 = res[3];
  const peakPanel = r32.panels.reduce((a, p) => (Math.abs(p.qNPerM) > Math.abs(a.qNPerM) ? p : a));
  check(Math.abs(Math.cos(peakPanel.thetaMidRad)) > 0.99 && rel(r32.qMaxNPerM, r32.thinRingQMaxNPerM) < 5e-3,
    "the flow peaks on the neutral axis, at S_y / (pi R) to the panel's resolution",
    `n=32 peak at theta ${(peakPanel.thetaMidRad * 180 / Math.PI).toFixed(1)} deg, q_max ${r32.qMaxNPerM.toFixed(1)} vs ${r32.thinRingQMaxNPerM.toFixed(1)} N/m`);
  const top = r32.panels[r32.nBooms - 1];
  check(Math.abs(top.qNPerM) < 1e-9 * r32.qMaxNPerM,
    "the panel straddling the top carries zero flow, which is what lets the cut sit there",
    `|q_top| / q_max ${(Math.abs(top.qNPerM) / r32.qMaxNPerM).toExponential(1)}`);
}

/* ── 2. AN OFFSET LOAD: the closing constant does the work ───────────── */
console.log("\n2. A load off the centre: moment equilibrium, resultant unchanged");
{
  const e = 0.4;
  const off = boomShearFlow({ ...UNIT, nBooms: 64, eccentricityM: e });
  const on = boomShearFlow({ ...UNIT, nBooms: 64 });
  const n = off.nBooms, R = UNIT.radiusM;
  const x = off.boomThetaRad.map((t) => R * Math.cos(t)), y = off.boomThetaRad.map((t) => R * Math.sin(t));
  let moment = 0;
  for (let r = 0; r < n; r++) { const b = (r + 1) % n; moment += off.panels[r].qNPerM * (x[r] * y[b] - x[b] * y[r]); }
  check(rel(moment, UNIT.shearN * e) < 1e-9 && rel(off.resultant.fyN, UNIT.shearN) < 1e-9,
    "with the load 0.4 m off the centre the flows' moment equals S_y e and the resultant is still S_y",
    `moment ${moment.toFixed(3)} vs ${(UNIT.shearN * e).toFixed(3)} N m; q0 ${off.closingConstantNPerM.toFixed(2)} N/m`);
  const shift = off.panels.every((p, r) => Math.abs((p.qNPerM - on.panels[r].qNPerM) - off.closingConstantNPerM) < 1e-9);
  check(shift && Math.abs(off.closingConstantNPerM) > 0,
    "the offset adds one constant flow round the ring and changes nothing else",
    `q0 = ${off.closingConstantNPerM.toFixed(2)} N/m on every panel`);
}

/* ── 3. THE CHAIN ON SIZED AIRCRAFT ──────────────────────────────────── */
console.log("\n3. On the sized aircraft: refusal, joints, peak, stress");
check(WITH.length === 3 && !WITH.includes("trainer"), "the three Part 25 classes evaluate; the trainer does not", WITH.join(", "));
{
  let noDp; try { noDp = fuselageShearFlow(SIZED.transport); } catch (e) { noDp = { threw: e.message }; }
  const f2 = fuselagePressureShell(SIZED.transport);
  check(noDp && noDp.evaluated === false && !noDp.threw && noDp.upstream === "fuselagePressureShell" && f2.evaluated === false,
    "without dp the chain refuses, naming the pressure shell as the link that refused",
    noDp?.reason ? String(noDp.reason).slice(0, 110) : JSON.stringify(noDp).slice(0, 110));
}
for (const t of WITH) {
  const f = F[t], f1 = fuselageLoads(SIZED[t], { deltaPPa: DP }), f2 = fuselagePressureShell(SIZED[t], { deltaPPa: DP });
  const gov = f.scenarios.find((s) => s.id === f.governing);
  const sc1 = f1.scenarios.find((s) => s.id === gov.id);
  check(gov.peakShearXM === sc1.peakShearXM && gov.peakShearN === sc1.peakShearN,
    `${t}: the peak shear station is F1's own, scenario "${gov.id}"`,
    `x = ${gov.peakShearXM.toFixed(2)} m, S_y = ${gov.peakShearN.toFixed(0)} N`);
  check(f.section.radiusM === f2.geometry.radiusM && f.section.tShellM === f2.skin.tShellM && f.section.tSkinM === f2.skin.tSkinM,
    `${t}: the ring is F2's ring, radius and thicknesses by identity`,
    `R ${f.section.radiusM.toFixed(3)} m, t_skin ${(f.section.tSkinM * 1e3).toFixed(2)} mm`);
  const rf = gov.ring;
  check(rel(rf.resultant.fyN, gov.peakShearN) < 1e-9 && Math.abs(rf.closingConstantNPerM) < 1e-9 * rf.qMaxNPerM,
    `${t}: at the peak station the resultant is S_y and the closing constant is zero`,
    `Fy/S_y - 1 = ${rel(rf.resultant.fyN, gov.peakShearN).toExponential(1)}`);
  check(rel(gov.tauMaxPa, rf.qMaxNPerM / f.section.tSkinM) < 1e-12,
    `${t}: the peak stress is q_max over t_skin`,
    `tau_max ${(gov.tauMaxPa / 1e6).toFixed(2)} MPa, margin to F_su ${(100 * gov.marginShearUltimate).toFixed(0)}%`);
  const alongOk = gov.along.every((a, i) => rel(a.qMaxNPerM, Math.abs(sc1.stations[i].shearN) / (Math.PI * f.section.radiusM)) < 1e-12);
  check(alongOk, `${t}: along the fuselage q_max(x) = |S_y(x)| / (pi R) at every station`, `${gov.along.length} stations`);
}

/* ── 4. STRINGER CREDIT GOES TO THE BOOMS, NOT TO THE SHEAR STRESS ───── */
console.log("\n4. Crediting stringers changes the boom areas and nothing about the stress");
{
  const plain = fuselageShearFlow(SIZED.transport, { deltaPPa: DP });
  const cred = fuselageShearFlow(SIZED.transport, { deltaPPa: DP, stringerFraction: 0.35 });
  const g1 = plain.scenarios.find((s) => s.id === plain.governing), g2 = cred.scenarios.find((s) => s.id === cred.governing);
  check(cred.section.tShellM > plain.section.tShellM && cred.section.tSkinM === plain.section.tSkinM,
    "with stringers credited t_shell grows and t_skin does not",
    `t_shell ${(plain.section.tShellM * 1e3).toFixed(2)} -> ${(cred.section.tShellM * 1e3).toFixed(2)} mm`);
  check(rel(g2.tauMaxPa, g1.tauMaxPa) < 1e-9 && rel(g2.qMaxNPerM, g1.qMaxNPerM) < 1e-9,
    "the peak flow and the peak stress are unchanged: the t cancels in (S_y / pi R) and the skin carries the shear",
    `tau_max ${(g1.tauMaxPa / 1e6).toFixed(3)} MPa both ways`);
}

/* ── 5. WHAT THE MODULE SAYS IT DOES NOT DO ──────────────────────────── */
console.log("\n5. The absences are named");
{
  const f = F.transport;
  const named = ["Torsion", "not combined", "equivalent-area circle", "t_skin", "cutouts"].map((k) => f.caveats.some((c) => c.includes(k)));
  check(named.every(Boolean) && f.basis === "DERIVED, NOT CITED",
    "torsion, stress combination, the circular section, the skin thickness and cutouts are each named, and the basis says derived",
    f.caveats.length + " caveats");
  const src = readFileSync(new URL("../src/classes/aircraft/fuselage-shear-flow.js", import.meta.url), "utf8");
  check(!/Bruhn|Niu|Megson/.test(src.replace(/textbooks that carry it \(Bruhn, Niu, Megson\)/, "")),
    "no textbook is cited for the derivation",
    "Bruhn, Niu and Megson appear only in the sentence that says they were not opened");
}

console.log(`\n${bar}\nFUSELAGE SHEAR FLOW GATE: ${passes} passed, ${fails} failed\n${bar}`);
process.exit(fails ? 1 : 0);
