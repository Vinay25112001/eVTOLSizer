/* =====================================================================
   SLIDER SENSITIVITY AUDIT
   =====================================================================
   WHY THIS EXISTS

   A slider that changes nothing is worse than a missing slider. It tells the
   engineer they have explored a design space they have not touched, and it
   hides which knobs actually own the design. The user found this by hand: the
   L/D slider "is just sitting there" with no impact — correct, because the L/D
   loop was closed and p.LD became a TARGET, but the UI never said so.

   This perturbs every input the sidebar exposes, re-runs the full sizing, and
   reports how much of the output fingerprint moves. It is the empirical answer
   to "which of these are design parameters?" — measured, not asserted.

   Run: node validation/sensitivity.mjs
   ===================================================================== */
import { runSizing } from "../src/engine.js";

/* App.jsx defaults, with the reserve distance folded into range exactly the
   way App.jsx does it. Getting this wrong sizes a different aircraft — see
   the range-convention note in engine.js. */
const BASE = {
  payload:455, range:190, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:14, AR:9, eOsw:0.85, taper:0.45, tc:0.15,
  wingLoadingNm2:1450, clCruiseMax:0.90, clDesign:0.55,
  nPropHover:6, propDiam:3.0, twRatio:1.3, convTolExp:-6,
  etaHov:0.70, etaSys:0.80, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08,
  sedCell:300, etaBat:0.90, socMin:0.19, ewf:0.50,
  weightModel:"buildup", autoPositionWing:true, targetSM:0.15,
  configType:"hybrid", nRotorsStopped:2,
  fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5,
};
const withReserve = (p) => ({ ...p, range: p.range + 0.76 * p.vCruise * (p.reserveMinutes ?? 20) * 60 / 1000 });

/* Every slider in the sidebar, with a perturbation that stays inside its own
   documented range so we never test a design the UI cannot express. */
const SLIDERS = [
  ["payload",        500],   ["range",          210],
  ["reserveMinutes",  25],   ["vCruise",         74],
  ["cruiseAlt",     1500],   ["hoverHeight",     20],
  ["LD",              18],   ["AR",              10],
  ["eOsw",          0.90],   ["wingLoadingNm2",1650],
  ["clCruiseMax",   0.75],
  ["taper",         0.50],   ["tc",            0.17],
  ["nPropHover",       8],   ["propDiam",       3.4],
  ["twRatio",        1.4],   ["etaHov",        0.76],
  ["etaSys",        0.86],   ["rateOfClimb",   6.00],
  ["climbAngle",       7],   ["descentAngle",     8],
  ["deltaISA",        15],
  ["sedCell",        350],   ["etaBat",        0.94],
  ["socMin",        0.25],   ["cRateDerate",   0.12],
  ["vtGamma",         40],   ["vtCh",          0.50],
  ["vtCv",         0.040],   ["vtAR",           3.0],
  ["ewf",           0.44],   ["fusLen",         8.0],
  ["fusDiam",       1.80],
  ["nLimitManoeuvre", 2.0], ["nLimitManoeuvreNeg", -1.0],
];

/* Compare only NUMERIC leaves. Arrays of chart points are included — a slider
   that moves only a chart still moves the design's description. */
function leaves(obj, prefix = "", out = new Map(), depth = 0) {
  if (depth > 3 || obj == null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number" && isFinite(v)) out.set(key, v);
    else if (Array.isArray(v)) { if (v.length && typeof v[0] === "object") leaves(v[0], key + "[0]", out, depth + 1); }
    else if (typeof v === "object") leaves(v, key, out, depth + 1);
  }
  return out;
}

const base = runSizing(withReserve(BASE));
const baseLeaves = leaves(base);

const rows = [];
for (const [name, val] of SLIDERS) {
  let r;
  try { r = runSizing(withReserve({ ...BASE, [name]: val })); }
  catch (e) { rows.push({ name, val, err: e.message }); continue; }
  const L = leaves(r);
  let moved = 0;
  for (const [k, v] of L) {
    const b = baseLeaves.get(k);
    if (b === undefined) { moved++; continue; }
    const denom = Math.max(1e-9, Math.abs(b));
    if (Math.abs(v - b) / denom > 1e-6) moved++;
  }
  rows.push({
    name, val, moved, total: L.size,
    dMTOW: r.MTOW - base.MTOW,
    dPack: r.PackkWh - base.PackkWh,
    dLD:   r.LDact  - base.LDact,
  });
}

rows.sort((a, b) => Math.abs(b.dMTOW ?? 0) - Math.abs(a.dMTOW ?? 0));

const bar = "=".repeat(78);
console.log(bar);
console.log("SLIDER SENSITIVITY — does moving this control change the design?");
console.log(`baseline MTOW ${base.MTOW.toFixed(1)} kg · ${baseLeaves.size} numeric outputs`);
console.log(bar);
console.log("slider            perturbed to    dMTOW kg    dPack kWh   dL/D    outputs moved");
for (const r of rows) {
  if (r.err) { console.log(`${r.name.padEnd(17)} ${String(r.val).padStart(8)}   ERROR: ${r.err}`); continue; }
  const flag = r.moved === 0 ? "   <== INERT" : r.moved < 5 ? "   <-- cosmetic only" : "";
  console.log(
    `${r.name.padEnd(17)} ${String(r.val).padStart(8)}   ${r.dMTOW.toFixed(1).padStart(9)}   ${r.dPack.toFixed(1).padStart(9)}   ${r.dLD.toFixed(2).padStart(6)}   ${String(r.moved).padStart(4)}/${r.total}${flag}`
  );
}

const inert = rows.filter(r => !r.err && r.moved === 0);
const weak  = rows.filter(r => !r.err && r.moved > 0 && Math.abs(r.dMTOW) < 0.05);
console.log(`\n${bar}`);
console.log(`${inert.length} INERT slider(s) — nothing in the entire result changes:`);
console.log(inert.length ? "   " + inert.map(r => r.name).join(", ") : "   none");
console.log(`\n${weak.length} slider(s) that move something but NOT the aircraft (|dMTOW| < 50 g):`);
console.log(weak.length ? "   " + weak.map(r => r.name).join(", ") : "   none");
console.log(bar);
