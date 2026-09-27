/* =====================================================================
   THE LANDING GEAR, FOR ONE AEROPLANE
   =====================================================================
   G1 through G6 were built as independent engine modules with their own
   gate, and until now NOTHING IN THE APP CALLED ANY OF THEM. The tyre
   rule, the ground loads, the sink speeds, the strut and the geometry
   were all reachable only from `validation/`. The plan lists two Phase A
   figures — a tyre selection table and a pavement summary — that were
   never built, so a package marked done was invisible to anyone using
   the tool.

   This module is the one place that drives the chain end to end for a
   sized aeroplane, so the views have a single object to render and the
   engine keeps its own shape.

   THE ORDER IS FORCED BY WHAT DEPENDS ON WHAT:

     balance     gear stations A and B          (already there, since B2)
     vertical-cg E, the CG height               (needs the ground line)
     gear-geom   wheelbase, turnover, tip-back  (needs E)
     sink-speed  the design sink cases          (independent)
     ground-loads static and braked reactions   (needs A, B, E)
     tyre-select the tyre, from those loads     (needs the loads)
     strut       stroke, and eta_t from the tyre (needs the tyre)

   Note the last link: eta_t is derived from the SELECTED tyre's own
   tabulated geometry, so the strut cannot be sized before the tyre is
   chosen. That is the right order physically and it is why the whole
   thing has to be one function rather than six independent calls.

   THE TWO A/B CONVENTIONS AGREE, AND THAT IS WHY THIS WORKS
   `gear/ground-loads.js` takes A as the arm from the CG to the NOSE
   wheel and B as the arm to the MAIN wheels, which is 14 CFR 25.493(e)'s
   own labelling. `gear-geometry.js` maps NACA SR-63's l2 and l1 onto the
   same two arms. So A and B pass between them untranslated.

   An earlier comment in gear-geometry.js claimed these two were "the
   opposite way round". THAT WAS WRONG, and it contradicted itself in the
   same sentence. It is corrected there. The check that matters — that A
   is the long arm, so the two have not been swapped — is real and stays,
   because swapping them still produces entirely plausible numbers.
   ===================================================================== */
import {
  generalArrangement, val, MAIN_WHEELS_PER_AXLE, TRAINER_MAX_PSI,
} from "./geometry.js";
import { balanceOf } from "./balance.js";
import { loadedVerticalCg } from "./vertical-cg.js";
import { gearGeometry } from "./gear-geometry.js";
import { sinkCases, certificationBasis } from "../../engine/gear/sink-speed.js";
import { staticReactions, noseTyreLoads } from "../../engine/gear/ground-loads.js";
import {
  selectMainTyre, selectNoseTyre, selectLightAircraftTyre, pavementCode,
} from "../../engine/gear/tyre-select.js";
import {
  tyreEfficiencyFor, strokeFromEnergy, reserveEnergyRatio, ETA_OLEO,
} from "../../engine/gear/strut.js";
import { stowageOf } from "../../engine/gear/stowage.js";
import { pavementOf } from "../../engine/gear/pavement.js";
import { G0 } from "../../engine/constants.js";

const LB_PER_KG = 2.20462262;
const KGM2_TO_PSF = 0.204816;
const FPS_TO_MS = 0.3048;

/* Part 25 prescribes a sink speed and a drop test, NOT a gear reaction
   factor. LANDING-GEAR.md section 2 is explicit that N is a designer's
   choice validated by test, "typical transports 2.0-3.0 (NOT VERIFIED
   for Part 25)". It is exposed as an input with a declared default, and
   the result says it is a choice rather than a requirement. */
export const GEAR_REACTION_FACTOR = Object.freeze({
  value: 2.0,
  why: "14 CFR 25 prescribes a sink speed and a drop test, not a reaction "
     + "factor. 2.0 is the low end of the 2.0-3.0 band the research note "
     + "records as typical and NOT VERIFIED; it is a declared choice.",
});

export function gearOf(result, opts = {}) {
  if (!result || !(result.mtowKg > 0)) {
    return { resolved: false, why: "no sized aeroplane" };
  }
  const type = result.type;
  const N = Number(opts.reactionFactor ?? GEAR_REACTION_FACTOR.value);

  const ga = generalArrangement(result);
  const balance = balanceOf(result);
  const fuselageHeightM = val(ga.fuselage.height);
  const vcg = loadedVerticalCg({ balance, ga, fuselageHeightM });
  const propDiameterM = ga.props && ga.props.length ? ga.props[0].d : 0;
  const geom = gearGeometry({ balance, ga, verticalCg: vcg, propDiameterM });

  /* ── G1, the sink cases. Independent of the geometry. ─────────────*/
  const sink = sinkCases({
    type, mtowKg: result.mtowKg,
    mlwKg: result.mlwKg || result.mtowKg,
    wingLoadingPsf: result.wingLoadingKgM2 * KGM2_TO_PSF,
  });
  const usedLandingWeight = result.mlwKg > 0;

  /* Everything below needs the wheelbase, and G6 declines for a class
     that reports one combined gear item. Decline with it rather than
     inventing a split. */
  if (!geom.resolved) {
    return {
      resolved: false, type, ga, balance, verticalCg: vcg, geometry: geom, sink,
      why: `the ground loads need a wheelbase: ${geom.why}`,
    };
  }

  const wLb = result.mtowKg * LB_PER_KG;
  const mlwLb = (result.mlwKg || result.mtowKg) * LB_PER_KG;

  /* ── G2, the reactions. A and B pass straight from G6. ───────────*/
  const statics = staticReactions({
    weight: wLb, noseArmA: geom.A, mainArmB: geom.B,
  });
  const noseCases = noseTyreLoads({
    rampWeight: wLb, landingWeight: mlwLb,
    noseArmA: geom.A, mainArmB: geom.B, cgHeightE: geom.E,
  });

  /* ── G4, the tyres. ───────────────────────────────────────────────*/
  const legs = 2;
  const wheelsPerAxle = MAIN_WHEELS_PER_AXLE[type] ?? 2;
  const mainLoadLb = statics.resolved ? statics.mainLoadTotal : wLb * 0.9;
  const main = type === "trainer"
    ? selectLightAircraftTyre({ loadPerTyreLb: mainLoadLb / (legs * wheelsPerAxle),
                                maxPsi: TRAINER_MAX_PSI })
    : selectMainTyre({ mainLoadTotalLb: mainLoadLb, legs, wheelsPerAxle });
  const nose = noseCases.resolved
    ? selectNoseTyre({ cases: noseCases.cases, tyres: 2 })
    : { resolved: false, why: noseCases.why };

  /* ── G5, the strut, on the tyre that was just chosen. ─────────────*/
  let strut = { resolved: false, why: "no main tyre was selected" };
  let eta = null;
  if (main.resolved) {
    eta = tyreEfficiencyFor(main.tyre);
    const design = sink.cases[0];
    if (eta.resolved && design) {
      const deltaT = eta.deflectionIn * 0.0254;
      const s = strokeFromEnergy({
        V: design.vFps * FPS_TO_MS, L: sink.liftFraction, N,
        etaS: ETA_OLEO.variableOrifice, etaT: eta.eta, deltaT, g: G0,
      });
      strut = s.resolved
        ? { ...s, etaT: eta.eta, etaS: ETA_OLEO.variableOrifice, N,
            deflectionM: deltaT, designCase: design,
            reserveRatio: sink.reserve
              ? reserveEnergyRatio(design.vFps, sink.reserve.vFps) : null }
        : s;
    }
  }

  const out = {
    resolved: true, type,
    ga, balance, verticalCg: vcg, geometry: geom,
    sink, basis: certificationBasis(type), usedLandingWeight,
    statics, noseCases,
    tyres: {
      main, nose, legs, wheelsPerAxle,
      mainPavement: main.resolved ? pavementCode(main.operatingPsi) : null,
      nosePavement: nose.resolved ? pavementCode(nose.operatingPsi) : null,
    },
    strut, tyreEfficiency: eta,
    /* G7: the 25.733(d) bay each selected tyre needs, on the T&RA rules. */
    stowage: { main: stowageOf(main, { tyresPerLeg: wheelsPerAxle }), nose: stowageOf(nose, { tyresPerLeg: 2 }) },
    reaction: { N, ...GEAR_REACTION_FACTOR, value: N },
  };
  /* G8: the tyre-pressure code, the load per leg, and an ACN ESTIMATE by (31). */
  out.pavement = pavementOf(out, result);
  return out;
}
