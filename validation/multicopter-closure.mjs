/* =====================================================================
   MULTICOPTER CLOSURE GATE
   =====================================================================
   WHY THIS FILE EXISTS.

   Multicopters with ten or more rotors did not converge. They returned a
   full result object with r2Converged false — a number that is the last
   iterate of a runaway, which provenance.js already calls "THE flag to read
   before trusting any other number in the result".

   IT WAS NEVER A SOLVER PROBLEM, and proving that is what made it fixable.
   engine.js already distinguishes the two failures — "a REPELLING fixed
   point (|G'| > 1) and a fixed point that DOES NOT EXIST are different
   failures ... No solver can find a solution that is not there" — and this
   was the second kind. Measured, at fixed disk loading:

     d(log m_boom) / d(log MTOW) = 1.50, at N = 4, 8 and 16 alike

   which is exactly what the cantilever gives: m ~ n_z T L^2 / (r sigma) with
   T ~ MTOW, arm L ~ D ~ sqrt(MTOW) and radius r ~ D ~ sqrt(MTOW), so
   m ~ MTOW * MTOW / sqrt(MTOW). The boom MASS FRACTION therefore rises as
   sqrt(MTOW) without bound — 23% at 2 t and 65% at 16 t on a 16-rotor ring —
   and above some size MTOW = payload + Wempty(MTOW) + Wbat(MTOW) has no root.

   WHAT FIXED IT was not a solver change but the geometry: above eight rotors
   a strict non-overlapping coplanar ring is not an architecture anyone
   builds. VoloCity puts eighteen 2.3 m discs 1.563 m apart (0.679 D, 32%
   overlap) with nacelles at two alternating heights; EHang 216 carries
   sixteen the same way. Interleaving halves the arm. It does NOT change the
   1.50 exponent, so it buys headroom rather than removing the problem, and
   the envelope below is therefore finite and is stated rather than implied.

   THE ROOT CAUSE IS STILL OPEN and is the one VALIDATION.md already names:
   the boom is idealised as a FREE CANTILEVER where a real high-count
   multicopter uses a braced rim. A closed rim carries these loads far more
   efficiently than N independent arms, which is why VoloCity eighteen rotors
   do not cost it a quarter of its mass in booms. Modelling that needs a
   ring-under-out-of-plane-load source this project does not hold, so it is
   recorded, not guessed.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { interleavedFor } from "../src/engine/coaxial.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("MULTICOPTER CLOSURE GATE");
console.log("=".repeat(76));

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

const run = (n) => {
  const p0 = { ...B, configType:"multicopter", nPropHover:n };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter("multicopter", p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const g = aircraftGeometry(p, S);
  return { S, g, p, boomFrac: (S.weightGroupsRaw?.booms ?? 0) / S.MTOW,
           il: interleavedFor("multicopter", n, p) };
};

const COUNTS = [4, 6, 8, 10, 12, 14, 16];
const rows = COUNTS.map(n => ({ n, ...run(n) }));

console.log("");
console.log("   N    MTOW kg   boom%   interleaved   collisions   converged");
for (const r of rows)
  console.log(`  ${String(r.n).padStart(2)}${r.S.MTOW.toFixed(0).padStart(11)}`
    + `${(100 * r.boomFrac).toFixed(1).padStart(8)}${String(r.il).padStart(14)}`
    + `${String((r.g.collisions || []).length).padStart(13)}`
    + `${(r.S.r2Converged ? "yes" : "NO").padStart(12)}`);
console.log("");

check(rows.every(r => r.S.r2Converged),
  "every even multicopter from 4 to 16 rotors closes",
  rows.filter(r => !r.S.r2Converged).map(r => `N=${r.n}`).join(", ")
    || "N = 4, 6, 8, 10, 12, 14, 16 all converge — 10, 12, 14 and 16 did not before");

check(rows.every(r => (r.g.collisions || []).length === 0),
  "and none of them draws a rotor through another",
  rows.filter(r => (r.g.collisions || []).length).map(r => `N=${r.n}`).join(", ")
    || "zero collisions throughout, including the interleaved rings whose discs "
     + "overlap in plan and clear by height");

/* The drawing and the mass model must use the same arm. They did not:
   booms.js read rotorInterleave and geometry.js never did, so switching it on
   weighed a short arm and drew a long one. */
const armGap = rows.map(r => {
  const rot = r.g.bodies.filter(b => b.kind === "rotor");
  const drawn = Math.max(...rot.map(b => Math.hypot(b.x - (r.p.fusLen ?? 5.87) * 0.5, b.y)));
  const weighed = r.S.boomDetail?.armM ?? 0;
  return { n: r.n, drawn, weighed, rel: Math.abs(drawn - weighed) / Math.max(1e-6, weighed) };
});
check(armGap.every(a => a.rel < 0.05),
  "the arm the tool DRAWS is the arm it WEIGHS, at every rotor count",
  armGap.filter(a => a.rel >= 0.05).map(a => `N=${a.n} ${a.drawn.toFixed(2)}/${a.weighed.toFixed(2)}`).join(", ")
    || "agree within 5% throughout — interleaving is now read from one place, coaxial.js, "
     + "by the geometry, the mass model and the collision test alike");

check(!interleavedFor("multicopter", 4) && !interleavedFor("multicopter", 8)
      && interleavedFor("multicopter", 10) && !interleavedFor("multicopter", 11),
  "interleaving applies above eight rotors and only at EVEN counts",
  "N=4 false, N=8 false, N=10 true, N=11 false — a quadrotor demonstrably does not "
  + "interleave (NASA, 1.37 D), and an odd ring cannot alternate two heights without "
  + "leaving one neighbouring pair on the same level");

/* The envelope is finite and saying where it ends is the point. */
const beyond = [18, 20].map(n => ({ n, ...run(n) }));
check(beyond.some(r => !r.S.r2Converged),
  "and the envelope ENDS — this is headroom, not a cure",
  beyond.map(r => `N=${r.n} ${r.S.MTOW.toFixed(0)} kg boom ${(100 * r.boomFrac).toFixed(0)}% `
    + `${r.S.r2Converged ? "converges" : "does NOT converge"}`).join("; ")
  + " — interleaving halves the arm but leaves the MTOW^1.50 boom exponent intact, so "
  + "closure runs out again. A run that does not close sets r2Diverged, which the UI "
  + "banners and every consumer checks, so the failure is loud rather than silent");

console.log("");
console.log("  WHAT IS STILL OPEN:");
console.log("    The boom is a FREE CANTILEVER. A real high-count multicopter uses a");
console.log("    braced rim — VoloCity eighteen rotors do not cost it a quarter of its");
console.log("    mass in arms. Until a ring-under-out-of-plane-load model with a source");
console.log("    behind it replaces the cantilever, the MTOW^1.50 exponent stands and");
console.log("    the envelope above is where it stands.");

console.log("");
if (fails) { console.log(`MULTICOPTER CLOSURE GATE FAILED: ${fails}`); process.exit(1); }
console.log("MULTICOPTER CLOSURE GATE PASSED");
