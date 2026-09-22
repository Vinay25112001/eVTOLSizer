/* =====================================================================
   ROTOR SPIN ARRANGEMENT — the design variable, and what it can buy
   =====================================================================
   The controllability gate established that spin order decides fault
   tolerance and that nothing in this tool set it. This one measures what
   setting it is worth, and finds that the answer depends on a quantity
   the engine sizes for a different reason entirely.

   THE SEARCH SPACE IS PHYSICAL, NOT COMBINATORIAL. In nominal hover every
   rotor carries the same thrust, so reaction torques sum to k_mu*sum(w_i);
   yaw trim with nothing failed requires equal clockwise and anticlockwise
   counts. Odd rotor counts cannot satisfy that at equal thrust at all.
   Mirroring every rotor is the same aircraft seen from below, so w[0] is
   fixed. That leaves C(m-1, m/2-1) arrangements: 10 for a hexacopter, 462
   for a twelve, enumerated exhaustively rather than sampled.

   WHAT THE MEASUREMENT SHOWS. Spin arrangement is necessary and not
   sufficient. Below a threshold in INSTALLED THRUST MARGIN no arrangement
   survives any failure, and above it the best arrangement survives many —
   so the two design variables are coupled, and this engine currently sizes
   T/W from thrust replacement alone with no knowledge of the coupling.
   ===================================================================== */
import { bestSpinArrangement, balancedSpins } from "../src/engine/controlauthority.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};
const sgn = (a) => a.map((x) => (x > 0 ? "P" : "N")).join("");

console.log("ROTOR SPIN ARRANGEMENT GATE");
console.log("=".repeat(78));

/* ── 1. reproduce the published hexacopter pair ─────────────────────── */
const pub = bestSpinArrangement({ m: 6, r: 0.275, kMu: 0.1, weightN: 15.0, fMaxN: 6.125 });
console.log("\nDu, Quan & Cai's published hexacopter (their own parameters):\n");
console.log("   default  " + sgn(pub.default.spins) + "  survives " + pub.default.survivable + " of 6");
console.log("   best     " + sgn(pub.best.spins) + "  survives " + pub.best.survivable + " of 6");
check(pub.default.survivable === 0 && pub.best.survivable === 4,
  "the search reproduces the published pair",
  "PNPNPN loses control on every single failure; the best arrangement survives four "
  + "of six. The engine's previous default WAS PNPNPN, because that is what "
  + "ringRotors returns when no spins are supplied.");

/* ── 2. odd rotor counts cannot be yaw-trimmed at equal thrust ───────── */
const odd = bestSpinArrangement({ m: 5, r: 3, kMu: 0.08, weightN: 27000, fMaxN: 6480 });
check(balancedSpins(5).length === 0 && !!odd.reason,
  "an odd rotor count is reported as unbalanced rather than silently mis-sized",
  odd.reason);

/* ── 3. the coupling: spin arrangement needs thrust margin to work ───── */
console.log("\nBest-arrangement survivable failures vs installed thrust margin");
console.log("(ring layout, 27 kN, k_mu 0.08 — the design chart this produces)\n");
console.log("   T/W     m=4      m=6      m=8      m=12");
const grid = {};
for (const tw of [1.2, 1.4, 1.6, 2.0, 2.4, 3.0]) {
  const row = [4, 6, 8, 12].map((m) => {
    const R = bestSpinArrangement({ m, r: 3.0, kMu: 0.08, weightN: 27000, fMaxN: 27000 * tw / m });
    const v = R.best?.survivable ?? 0;
    /* tw.toFixed(1), not tw: template interpolation of the NUMBER 3.0 yields
       "3", so a key written "4@3.0" would never be found. */
    grid[m + "@" + tw.toFixed(1)] = v;
    return `${v}/${m}`;
  });
  console.log("   " + tw.toFixed(1) + "   " + row.map((s) => s.padEnd(9)).join(""));
}

check(grid["4@3.0"] === 0,
  "a quadrotor survives no single-rotor failure at ANY thrust margin",
  "0 of 4 up to T/W 3.0. Three surviving inputs cannot span four axes while "
  + "balancing reaction torque, so yaw cannot be trimmed. This is a property of the "
  + "configuration and no amount of installed thrust changes it — which is why the "
  + "engine reports it as advisory rather than as something to size away.");

check(grid["12@1.4"] === 12 && grid["8@1.4"] === 8,
  "eight and twelve rotors survive every failure at a modest margin",
  "all failures controllable at T/W 1.4, against 0 at 1.2 — the threshold sits "
  + "between the two, close to where this engine already sizes.");

check(grid["6@1.2"] === 0 && grid["6@2.0"] > 0,
  "a hexacopter needs substantially more than thrust replacement",
  "0 of 6 at T/W 1.2 and 4 of 6 at 2.0, against the N/(N-1) = 1.2 that merely "
  + "replaces the lost rotor's thrust. Thrust replacement and control recovery are "
  + "different requirements and the second is the larger one.");

console.log("\n   THE COUPLING THIS EXPOSES. twRatioFor sizes installed thrust from");
console.log("   NASA's OEI power-factor band, which is a THRUST-replacement argument.");
console.log("   Controllable one-rotor-out is a MOMENT requirement and needs more.");
console.log("   The two are not currently connected in the sizing loop; this gate");
console.log("   measures the gap rather than closing it, because closing it would");
console.log("   change every aircraft this tool has produced.");

console.log("");
console.log(fails.length ? `SPIN ARRANGEMENT GATE FAILED: ${fails.length} check(s)`
                         : "SPIN ARRANGEMENT GATE PASSED");
process.exit(fails.length ? 1 : 0);
