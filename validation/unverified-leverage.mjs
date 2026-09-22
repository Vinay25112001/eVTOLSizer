/* =====================================================================
   LEVERAGE OF THE UNVERIFIED INPUTS
   =====================================================================
   provenance.js marks 28 inputs `unverified`. Some of those are user
   requirements and carry no obligation -- a payload is chosen, not
   derived. The rest are modelling assumptions with no source behind
   them, and they are not equally important: an unsourced number that
   moves MTOW by 0.1% is a documentation gap, and one that moves it by
   20% is a physics gap wearing the same label.

   This gate measures which is which, so that sourcing effort goes where
   the answer actually moves. It perturbs each unsourced assumption by a
   defensible amount, one at a time, and reports the induced change in
   MTOW across all six configurations.

   It asserts nothing about the VALUES. It asserts that the leverage is
   known, so that "unverified" can be ranked rather than merely counted.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
  vtGamma:45, vtAR:2.5 };

/* Perturbations are chosen to be PLAUSIBLE ALTERNATIVES a reviewer might
   propose, not arbitrary percentages: the span each quantity could
   defensibly take if the missing source turned out to disagree.

   TWO DIFFERENT NUMBERS COME OUT OF THIS AND THE FIRST VERSION CONFLATED
   THEM. A wide swing across the range can mean either of two things:

     DEFAULT RISK -- the shipped default is unsourced and a different one
       would move the answer. This is a defect.
     DESIGN SENSITIVITY -- the quantity is a real operational choice and
       the design genuinely responds to it. This is the tool working.

   descentAngle showed why the distinction matters: it swings MTOW 14%
   across 3-9 deg, which looked like the second-worst defect in the tool.
   But moving its DEFAULT from 6 deg to the principled glide-angle fallback
   changes MTOW by 0.0-0.8%. The 14% is a pilot choosing an approach
   procedure, not a modelling error. A `fallback` entry below, where one
   exists, gives the alternative the engine would use on its own, and the
   gate reports that separately. */
const PROBES = [
  ["AR",            "wing aspect ratio",            [7, 12]],
  ["eOsw",          "Oswald efficiency",            [0.75, 0.92]],
  ["taper",         "wing taper ratio",             [0.35, 0.60]],
  ["tc",            "thickness/chord",              [0.12, 0.18]],
  ["hoverHeight",   "hover height (sets hover time)",[10.0, 30.5]],
  ["rateOfClimb",   "rate of climb m/s",            [3.5, 7.6]],
  ["climbAngle",    "climb angle deg",              [4, 9]],
  ["descentAngle",  "descent angle deg",            [3, 9], 0],   // 0 => glide fallback
  ["cRateDerate",   "C-rate SED derate",            [0.0, 0.15]],
  ["fusDiam",       "fuselage diameter m",          [1.5, 1.9]],
  ["vtCh",          "horiz tail volume coeff",      [0.35, 0.70]],
  ["vtCv",          "vert tail volume coeff",       [0.020, 0.058]],
  ["vtAR",          "tail aspect ratio",            [2.0, 3.5]],
];

const build = (k, over = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
    tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD,
    etaHov:d.etaHov ?? B.etaHov, ...over };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

const LAYOUTS = Object.keys(CFG.CONFIGURATIONS);
const base = {};
for (const k of LAYOUTS) {
  const S = runSizing(build(k));
  if (S && S.MTOW > 0) base[k] = S.MTOW;
}

console.log("LEVERAGE OF THE UNVERIFIED INPUTS");
console.log("=".repeat(78));
console.log("\nMTOW swing over a defensible alternative range, worst layout:\n");
console.log("   input           description                       low      high   swing %  worst layout");

const scored = [];
for (const [key, desc, [lo, hi], fallback] of PROBES) {
  let worst = 0, worstK = "-", loM = NaN, hiM = NaN;
  for (const k of LAYOUTS) {
    if (!base[k]) continue;
    const a = runSizing(build(k, { [key]: lo }));
    const b = runSizing(build(k, { [key]: hi }));
    if (!a?.MTOW || !b?.MTOW) continue;
    const swing = 100 * Math.abs(b.MTOW - a.MTOW) / base[k];
    if (swing > worst) { worst = swing; worstK = k; loM = a.MTOW; hiM = b.MTOW; }
  }
  /* If the engine has a principled fallback, measure the DEFAULT's own risk
     separately from the range sensitivity. */
  let defRisk = null;
  if (fallback !== undefined) {
    let d = 0;
    for (const k of LAYOUTS) {
      if (!base[k]) continue;
      const f = runSizing(build(k, { [key]: fallback }));
      if (!f?.MTOW) continue;
      d = Math.max(d, 100 * Math.abs(base[k] - f.MTOW) / base[k]);
    }
    defRisk = d;
  }
  scored.push({ key, desc, worst, worstK, defRisk });
  console.log("   %s %s %s %s %s  %s",
    key.padEnd(15), desc.padEnd(32),
    (Number.isFinite(loM) ? Math.round(loM) : "-").toString().padStart(8),
    (Number.isFinite(hiM) ? Math.round(hiM) : "-").toString().padStart(9),
    worst.toFixed(1).padStart(8), worstK);
}

scored.sort((a, b) => b.worst - a.worst);
console.log("\nRANKED — where sourcing effort actually buys accuracy:\n");
scored.forEach((s, i) => console.log("   " + String(i + 1).padStart(2) + ". "
  + s.key.padEnd(15) + " range " + s.worst.toFixed(1).padStart(5) + "%"
  + (s.defRisk === null ? "" : "   default risk " + s.defRisk.toFixed(1) + "%")
  + "   " + s.desc));

const material = scored.filter(s => s.worst >= 5);
const cleared  = scored.filter(s => s.defRisk !== null && s.defRisk < 5);
const risky    = scored.filter(s => s.defRisk !== null && s.defRisk >= 5);
console.log("");
console.log("   " + material.length + " of " + scored.length +
  " move MTOW by >=5% across their plausible range.");
for (const c of cleared)
  console.log("   " + c.key + " swings " + c.worst.toFixed(1) +
    "% across its range but its DEFAULT costs only " + c.defRisk.toFixed(1) +
    "% against the engine's own fallback — design sensitivity, not a defect.");
if (risky.length)
  console.log("   " + risky.map(r => r.key).join(", ") +
    " carry real default risk against their fallback.");
console.log("   The remainder have no principled fallback to compare against, so their");
console.log("   range swing is an UPPER BOUND on default risk, not a measurement of it.");


/* =====================================================================
   THE TOP-RANKED ASSUMPTION, LOOKED AT DIRECTLY
   =====================================================================
   cRateDerate leads the ranking above, and its provenance entry reads
   "8% SED derate; no source". The engine applies it as a flat haircut:
       SED_eff = SED_cell x (1 - cRateDerate)
   with the code comment justifying the value as "default 8% for ~3-4C
   hover". That justification is a claim about the operating point, so
   the operating point is measurable -- and it is not one point.
   ===================================================================== */
console.log("\n" + "=".repeat(78));
console.log("C-RATE ACTUALLY DEMANDED vs THE RATE THE DERATE ASSUMES\n");
console.log("   layout          P_hover kW   nameplate kWh   C_hover   C_cruise");
const cr = [];
for (const k of LAYOUTS) {
  const S = runSizing(build(k));
  if (!S || !(S.CrateHov > 0)) continue;
  cr.push({ k, c: S.CrateHov });
  console.log("   " + k.padEnd(14)
    + S.Phov.toFixed(1).padStart(11)
    + (S.PackInstalledkWh ?? 0).toFixed(1).padStart(16)
    + S.CrateHov.toFixed(2).padStart(10)
    + S.CrateCr.toFixed(2).padStart(11));
}
const cs = cr.map(r => r.c);
const lo = Math.min(...cs), hi = Math.max(...cs);
console.log("\n   demanded hover C-rate spans " + lo.toFixed(2) + "C to " + hi.toFixed(2)
  + "C, a factor of " + (hi / lo).toFixed(1));
console.log("   one flat 8% derate is applied to all of them");

check(hi / lo > 2,
  "the flat SED derate is applied across a C-rate spread it does not resolve",
  "the derate is justified in code as 'for ~3-4C hover'; the layouts demand "
  + lo.toFixed(2) + "C to " + hi.toFixed(2) + "C, so the lowest-rate layout is "
  + "penalised at a rate it never reaches. NOT changed here: no citable "
  + "capacity-vs-C-rate curve was found in the corpus, and removing the derate "
  + "outright degrades the commercial benchmark from 14.0% to 15.1%, which means "
  + "it is currently masking an under-prediction elsewhere. Sourcing the curve is "
  + "the open item; the leverage above says it is worth 55% of multicopter MTOW.");

/* What the corpus DOES establish about C-rate, recorded so the next
   person does not re-derive it:
     Antcliff 2019  -- "Current delivery limits for cells are specified as
       a C-rate (capacity/hr)": a DELIVERY LIMIT to be checked.
     Johnson & Silva 2022 -- "Internal resistance reduces battery efficiency
       at high discharge rates, so typical Li-ion battery discharge
       characteristics are used to calculate the efficiency": NASA carries
       the high-rate penalty in EFFICIENCY, which this engine also does
       through etaBat, applied to vertical flight only.
     NASA S3270 -- "the discharge rate as a function of the battery capacity
       (C-rate) for each mission segment is never an active sizing
       constraint, even in vertical flight."
   The delivery-limit check exists: CertificationTab tests C_hover <= 5.0C.
   What is unsourced is the SEPARATE energy haircut. */

console.log("");
console.log(fails.length ? `LEVERAGE GATE FAILED: ${fails.length} check(s)`
                        : "LEVERAGE GATE PASSED");
process.exit(fails.length ? 1 : 0);
