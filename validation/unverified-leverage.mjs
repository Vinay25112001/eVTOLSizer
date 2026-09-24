/* =====================================================================
   LEVERAGE OF THE UNVERIFIED INPUTS
   =====================================================================
   INPUTS. THIS GATE DOES NOT COVER THE UNVERIFIED OUTPUTS, and the title
   used to be read as though it did: it sweeps inputs, and it covers 13 of
   the 27. The 70 unverified OUTPUTS are a larger group and are triaged by
   validation/unverified-triage.mjs instead, because sweeping an output is
   meaningless -- nothing downstream of the engine feeds back into MTOW, so
   an output's risk is its REACH, not its sensitivity.

   provenance.js marks 27 inputs `unverified`. Some of those are user
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
  deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
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
  /* cRateDerate LEFT THIS LIST — it is no longer an unverified input. It is
     computed from the demanded rate by Peukert [SRC] NDARC ch.26, and its
     replacement is gated by validation/peukert-derate.mjs. What remains
     sweepable is `peukertK`, and its range is not a judgement call: it is the
     published 1.01-1.05, so the sweep IS the source's own uncertainty. */
  ["peukertK",      "Peukert coefficient k",        [1.01, 1.05]],
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
   THIS SECTION'S OPEN ITEM IS NOW CLOSED, and the record of how is kept
   rather than deleted.

   cRateDerate USED TO LEAD THE RANKING ABOVE, with the provenance entry
   "8% SED derate; no source", applied as a flat haircut
       SED_eff = SED_cell x (1 - cRateDerate)
   justified in code as "default 8% for ~3-4C hover". That justification is
   a claim about the operating point, so the operating point was measured
   here -- and it was not one point but a factor-of-3.4 spread.

   THE CURVE WAS FOUND, in the corpus this harness said did not have one.
   It was in NDARC's own theory manual, which this engine already leans on:
   TP-2015-218751 ch.26:10652 gives the Peukert law and k = 1.01-1.05 for
   lithium-ion, and :10650 defines x as the C-rate on the usable-capacity
   basis. The earlier "not found" verdict was not wrong about the search; it
   was wrong about where to look -- the engine had already READ ch.26 and
   declined it (engine.js), because its EQUIVALENT-CIRCUIT half needs cell
   IR data this engine does not carry. That objection never applied to the
   CAPACITY half, which needs only k and a rate the engine already computes.

   The derate is now computed per design; validation/peukert-derate.mjs
   gates it. What is checked below is no longer "is the spread unresolved"
   but "is it RESOLVED" -- the same measurement, turned into a regression.
   ===================================================================== */
console.log("\n" + "=".repeat(78));
console.log("C-RATE DEMANDED, AND THE DERATE NOW MATCHED TO IT\n");
console.log("   layout          P_hover kW   nameplate kWh   C_hover   C_cruise   derate %");
const cr = [];
for (const k of LAYOUTS) {
  const S = runSizing(build(k));
  if (!S || !(S.CrateHov > 0)) continue;
  cr.push({ k, c: S.CrateHov, d: S.cRateDerate ?? 0 });
  console.log("   " + k.padEnd(14)
    + S.Phov.toFixed(1).padStart(11)
    + (S.PackInstalledkWh ?? 0).toFixed(1).padStart(16)
    + S.CrateHov.toFixed(2).padStart(10)
    + S.CrateCr.toFixed(2).padStart(11)
    + (100*(S.cRateDerate ?? 0)).toFixed(2).padStart(11));
}
const cs = cr.map(r => r.c);
const lo = Math.min(...cs), hi = Math.max(...cs);
console.log("\n   demanded hover C-rate spans " + lo.toFixed(2) + "C to " + hi.toFixed(2)
  + "C, a factor of " + (hi / lo).toFixed(1));
const ds = cr.map(r => r.d);
const dlo = Math.min(...ds), dhi = Math.max(...ds);
console.log("   the derate now spans " + (100*dlo).toFixed(2) + "% to "
  + (100*dhi).toFixed(2) + "% — it TRACKS the rate instead of ignoring it");

check(hi / lo > 2 && (dhi - dlo) > 0.02,
  "the derate resolves the C-rate spread it is applied across",
  "the layouts demand " + lo.toFixed(2) + "C to " + hi.toFixed(2) + "C (factor "
  + (hi/lo).toFixed(1) + "), and the derate answers with " + (100*dlo).toFixed(2)
  + "%-" + (100*dhi).toFixed(2) + "%. Under the old flat 8% the spread was ZERO "
  + "and the lowest-rate layout was penalised at a rate it never reaches.");

check(dhi <= 0.08 + 1e-9,
  "no layout is derated more than the flat 8% it replaced",
  "at the pessimistic end of NDARC's published k the worst case is "
  + (100*dhi).toFixed(2) + "%, so the old flat value was too harsh EVERYWHERE, "
  + "not merely mis-shaped. The multicopter at " + lo.toFixed(2) + "C was "
  + "over-penalised by roughly " + (0.08/Math.max(1e-9,dlo)).toFixed(0) + "x.");

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
   The SEPARATE energy haircut was the unsourced part, and it is now the
   Peukert capacity term from the same NDARC chapter. Note that the three
   sources above are all about the VOLTAGE/efficiency side, which is why
   they never settled it: they belong to etaBat, not to this. Reading them
   as candidates for the energy haircut would have been a category error --
   worth recording, because a SUAVE resistance law (R = R0(1+C*f)) turned up
   in the same search and is the same trap. */

console.log("");
console.log(fails.length ? `LEVERAGE GATE FAILED: ${fails.length} check(s)`
                        : "LEVERAGE GATE PASSED");
process.exit(fails.length ? 1 : 0);
