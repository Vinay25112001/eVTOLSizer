/* =====================================================================
   GATE FOR THE ANALYSIS LAYERS
   =====================================================================
   constraints.js / uncertainty.js / explore.js / profile.js are ANALYSIS
   layers: they run the existing sizing loop and report on it. The golden
   master already proves they change no sized result. What it cannot prove is
   that they are INTERNALLY CONSISTENT with the loop they wrap, and that is
   what this file gates.

   Four properties, each of which has ALREADY caught a real defect:

   1. PROFILE SELF-CONSISTENCY. The default profile must reproduce the loop's
      own Etot to within 0.01%. This caught a 12% error: the cruise segment had
      been given the full range, but climb and descent cover ground distance
      too, so the loop cruises 79 km of a 100 km trip.
   2. CONSTRAINT DIAGRAM REPRODUCES REAL AIRCRAFT. The derived maximum wing
      loading must land between Archer (1371) and Joby (1524). This caught a
      3x error from using the cruise CL ceiling as if it were CLmax.
   3. UNCERTAINTY RESPECTS PHYSICS. No excursion may leave a bounded quantity
      outside its physical range. This caught a battery perturbed to 112.5%
      round-trip efficiency, which was the single largest contributor to the
      reported error bar.
   4. EVERY CONFIGURATION STILL CLOSES. compareConfigurations sizes all six on
      one mission; a layout that stops converging is a regression whoever
      caused it.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { evaluateProfile, defaultProfile, cruisePowerAt } from "../src/engine/profile.js";
import { makeISA } from "../src/engine/atmosphere.js";
import { constraintDiagram } from "../src/engine/constraints.js";
import { uncertaintyBand, PHYSICAL_BOUNDS } from "../src/engine/uncertainty.js";
import { compareConfigurations } from "../src/engine/explore.js";
import * as cfg from "../src/engine/configuration.js";

const P = { payload:455, range:100, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.90, clDesign:0.55, nPropHover:12, propDiam:2.37, twRatio:1.3, convTolExp:-6,
  etaHov:0.740, tipSpeed:167.64, etaSys:0.80, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.90, socMin:0.19,
  ewf:0.50, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, configType:"hybrid",
  fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5,
  hoverTimeTakeoffS:30, hoverTimeLandingS:30 };

const size = (x) => runSizing({ ...x, range: x.range + 0.76 * x.vCruise * 20 * 60 / 1000 });
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("ANALYSIS-LAYER GATE");
console.log("");
const R = size(P);

/* ── 1. profile self-consistency ─────────────────────────────────────── */
const prof = evaluateProfile(R, defaultProfile(R, P), { vCruise: P.vCruise });
const dEnergy = Math.abs(prof.totalEnergyKWh - R.Etot) / R.Etot;
check(dEnergy < 1e-4, "default profile reproduces the loop energy",
  "Etot " + R.Etot.toFixed(2) + " vs profile " + prof.totalEnergyKWh.toFixed(2)
  + " kWh (" + (100 * dEnergy).toFixed(4) + "%)");

/* A profile the pack cannot fly must be REPORTED as infeasible, not silently
   returned with a negative margin nobody reads. */
const tooFar = evaluateProfile(R, [{ kind:"cruise", distanceKm: 500 }], { vCruise: P.vCruise });
check(tooFar.feasible === false && tooFar.ranDryAt != null,
  "an over-long profile is reported infeasible and located",
  tooFar.ranDryAt ? "runs dry " + (tooFar.ranDryAt.atSeconds/60).toFixed(1) + " min in" : "NOT located");

/* A distance on a hover segment is meaningless and must be an error. */
const badSeg = evaluateProfile(R, [{ kind:"hover", distanceKm: 10 }], { vCruise: P.vCruise });
check(badSeg.errors.length === 1 && badSeg.feasible === false,
  "a distance on a hover segment is rejected, not treated as zero");

/* The off-design polar MUST return Pcr at the design speed, or every custom
   cruise leg in the mission editor is quietly wrong. */
const rhoCr = makeISA(P.deltaISA ?? 0)(P.cruiseAlt).rho;
const Pdesign = cruisePowerAt(R, P.vCruise,
  { rho: rhoCr, AR: P.AR, eOsw: P.eOsw, etaSys: P.etaSys });
check(Pdesign != null && Math.abs(Pdesign - R.Pcr) / R.Pcr < 0.01,
  "the off-design polar reproduces Pcr at the design speed",
  Pdesign != null ? Pdesign.toFixed(1) + " vs " + R.Pcr.toFixed(1) + " kW ("
    + (100 * (Pdesign - R.Pcr) / R.Pcr).toFixed(2) + "%)" : "no polar");

/* ── 2. constraint diagram reproduces the published aircraft ──────────── */
const CD = constraintDiagram(P, { hasWing:true, CD0:R.CD0tot,
  diskLoadingNm2: R.DL_lbft2 / 0.0208854, downloadFrac: 0.0735 });
/* THIS GATE USED TO READ: "derived wing loading lands between Archer 1371 and
   Joby 1524". It could never fail. CLmax 1.5 and the 41 m/s transition speed
   were RECOVERED by inverting those two loadings, so 0.5*rho*41^2*1.5 is a
   fixed constant being tested against the interval it was built from. Same
   defect this project removed from the motor-peak check and the SoC check.

   Replaced by the two things that CAN fail: the diagram must declare that its
   wing limit is a fit, and the non-circular inverse must be physically sane. */
check(CD.wingLimitIsAFit === true,
  "the constraint diagram declares its wing limit to be a fit, not a derivation");

const IT = CD.impliedTransition;
check(IT != null && IT.slowMS > 25 && IT.fastMS < 70,
  "implied transition speed for the design wing loading is physically sane",
  IT ? "W/S " + P.wingLoadingNm2 + " N/m2 -> " + IT.slowMS.toFixed(1) + "-"
       + IT.fastMS.toFixed(1) + " m/s (CLmax " + IT.clMaxHigh + "-" + IT.clMaxLow + ")"
     : "not reported");

/* And it must actually RESPOND to wing loading — a constant would pass the
   bounds check above while telling the user nothing. */
const ITlow = constraintDiagram({ ...P, wingLoadingNm2: 800 }, { hasWing:true,
  CD0:R.CD0tot, diskLoadingNm2: R.DL_lbft2/0.0208854 }).impliedTransition;
check(ITlow != null && ITlow.slowMS < IT.slowMS - 1,
  "implied transition speed falls with wing loading, as sqrt(W/S) must",
  "1371 -> " + IT.slowMS.toFixed(1) + " m/s vs 800 -> " + ITlow.slowMS.toFixed(1) + " m/s");
check(CD.binding === "hover",
  "hover is the binding constraint for a winged eVTOL",
  "binding " + CD.binding);
/* A rotor-borne layout must return NO wing constraints rather than nonsense. */
const CDrb = constraintDiagram(P, { hasWing:false, diskLoadingNm2: R.DL_lbft2/0.0208854 });
check(CDrb.stallWS == null && CDrb.curves.every(c => c.key === "hover"),
  "a rotor-borne layout gets the hover line alone, not a fabricated wing limit");

/* ── 3. uncertainty respects physical bounds ──────────────────────────── */
const U = uncertaintyBand(size, P);
const violations = U.contributions.filter((c) => {
  const b = PHYSICAL_BOUNDS[c.key]; if (!b) return false;
  return c.atPlusInput > b[1] + 1e-12 || c.atMinusInput < b[0] - 1e-12;
});
check(violations.length === 0,
  "no perturbation leaves a bounded quantity outside its physical range",
  violations.length ? violations.map(v => v.key).join(", ") : U.inputsPerturbed + " inputs perturbed");
check(U.inputsSkipped.requirements.length > 0,
  "user requirements are excluded from the error bar",
  "excluded " + U.inputsSkipped.requirements.length);
check(U.rssUp > 0 && U.rssDown > 0 && U.rssUp !== U.rssDown,
  "the band is asymmetric, as a clamped sizing loop must be",
  "-" + U.rssDown.toFixed(0) + " / +" + U.rssUp.toFixed(0) + " kg");

/* ── 4. every configuration still closes ──────────────────────────────── */
const C = compareConfigurations(size, P, cfg);
const notClosing = C.rows.filter(r => !r.converged).map(r => r.key);
check(notClosing.length === 0, "all six configurations close on one mission",
  notClosing.length ? "NOT closing: " + notClosing.join(", ")
                    : C.rows.map(r => r.key + " " + r.MTOW_kg.toFixed(0)).join(", "));

/* ── 5. the OEI transient is scored on layouts Table 4 actually describes ── */
const oei = (r) => (r.checks || []).find(c => c.label?.startsWith("Motor peak capability"));
const byKey = {};
for (const key of Object.keys(cfg.CONFIGURATIONS)) {
  const d = cfg.CONFIG_DEFAULTS[key]; if (!d) continue;
  const pp = { ...P, configType: key, nPropHover: d.nRotors,
    /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (cfg.solveRotorDiameter(key, { ...P, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? cfg.rotorDiameterFor(key, 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? P.vCruise, LD: d.LD_target ?? P.LD,
    etaHov: d.etaHov ?? P.etaHov, tipSpeed: d.tipSpeed_ms ?? P.tipSpeed,
    twRatio: Math.max(1.30, cfg.oeiThrustMarginFor(key, d.nRotors) ?? 1.30),
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
  delete pp.nRotorsStopped;
  byKey[key] = size(pp);
}

/* An interconnected drive must NOT be scored against Table 4 at all: every
   column in it is a multicopter with independent rotors. configuration.js
   already exempts this layout from the N/(N-1) thrust margin for the same
   reason, and the two files used to contradict each other. */
check(oei(byKey.sideBySide)?.kind === "indeterminate",
  "an interconnected layout is not scored on Table 4's un-shafted columns",
  "sideBySide kind=" + oei(byKey.sideBySide)?.kind);

/* Mixed control is a gap in the published criteria, not a deficiency in the
   design - so long as the design clears the most favourable published column. */
check(oei(byKey.hybrid)?.kind === "indeterminate" && oei(byKey.hybrid)?.ok === true,
  "mixed control reports as indeterminate, not as a shortfall",
  "hybrid kind=" + oei(byKey.hybrid)?.kind + " ok=" + oei(byKey.hybrid)?.ok);

/* AND THE OTHER HALF, which matters just as much: a check that can never fail
   is noise. Table 4's columns DO describe an independent, fixed-pitch,
   rpm-controlled rotor set, so those layouts must still report the shortfall. */
check(oei(byKey.liftcruise)?.ok === false && oei(byKey.liftcruise)?.kind === "advisory",
  "a pure rpm, independent-rotor layout still reports the real shortfall",
  "liftcruise ok=" + oei(byKey.liftcruise)?.ok);
check(oei(byKey.multicopter)?.ok === false,
  "the multicopter still reports the real shortfall");

/* The advisory must not be counted as a feasibility failure anywhere. */
const miscounted = C.rows.filter(r => r.failedChecks.some(l =>
  l.startsWith("Motor peak capability") || l === "Hover download"));
check(miscounted.length === 0,
  "advisories and omissions are not counted as hard failures",
  miscounted.length ? miscounted.map(r => r.key).join(", ")
    : C.rows.filter(r => r.feasible).length + " of 6 layouts feasible");

/* ── 6. battery efficiency is scoped to vertical flight, per NASA RST ────── */
const Rv = size(P);
const Evert = Rv.Eto + Rv.Eld;
const expected = Rv.Etot / ((Rv.Etot - Evert) + Evert / P.etaBat);
check(Math.abs(Rv.etaBatEffective - expected) / expected < 1e-3,
  "battery efficiency is applied to vertical flight only, not the whole mission",
  "etaBat 0.90 -> effective " + Rv.etaBatEffective.toFixed(4)
  + " (vertical " + Evert.toFixed(1) + " of " + Rv.Etot.toFixed(1) + " kWh)");

/* The old whole-mission form must still be reachable, and must still differ -
   if these two ever agree the scoping has silently stopped applying. */
const Rm = size({ ...P, etaBatScope: "mission" });
check(Rm.MTOW > Rv.MTOW * 1.02,
  "the superseded whole-mission form is still selectable and still heavier",
  "mission-scope MTOW " + Rm.MTOW.toFixed(0) + " vs vertical-scope " + Rv.MTOW.toFixed(0) + " kg");

/* A pack-usable specific energy suppresses the term entirely, exactly as the
   NASA reference cases do. This is what kept those cases bit-identical. */
const Rp = size({ ...P, sedBasis: "packUsable", sedCell: 400 });
check(Math.abs(Rp.etaBatEffective - 1) < 1e-9,
  "sedBasis packUsable suppresses the battery efficiency term",
  "effective " + Rp.etaBatEffective);

/* Hover must actually be the high-rate state the sourced scoping assumes. If a
   design ever cruises harder than it hovers, the scoping is wrong FOR THAT
   DESIGN and the reader should be told rather than inheriting NASA's case. */
check(Rv.CrateHov > Rv.CrateCr,
  "hover is the high-discharge-rate state that justifies the scoping",
  "hover " + Rv.CrateHov + "C vs cruise " + Rv.CrateCr + "C");

console.log("");
if (C.sharedFailures.length) {
  console.log("  NOTE - items reported across most layouts (a mission or model");
  console.log("  property, not a per-layout one):");
  for (const f of C.sharedFailures)
    console.log("    " + (f.hard ? "[hard] " : "[advisory] ") + f.label
      + "  " + f.layouts + "/" + f.of);
  console.log("");
}
console.log(fails.length ? "ANALYSIS-LAYER GATE FAILED: " + fails.length + " check(s)"
                         : "ANALYSIS-LAYER GATE PASSED");
process.exit(fails.length ? 1 : 0);
