/* ═══════════════════════════════════════════════════════════════════════
   eVTOL SIZING ENGINE — sizing core
   ═══════════════════════════════════════════════════════════════════════
   Pure function: no DOM, no React, no I/O. Deterministic given p.
   Physical models live in sibling modules under engine/ so each can be read,
   tested and replaced on its own:
       engine/constants.js    physical constants
       engine/atmosphere.js   ISA with temperature deviation
       engine/airfoils.js     section library + selection rule
       engine/drag.js         rotorcraft parasite drag terms
       engine/weights.js      component weight buildup
       engine/noise.js        rotor acoustics
       engine/pipeline.js     stage runner for the analysis phase
   Original provenance: port of eVTOL_Full_Analysis_v2.m (MATLAB).
   ═══════════════════════════════════════════════════════════════════════ */

import { G0 as g0, RHO_MSL as rhoMSL, T0, LAPSE as L, R_GAS as Rgas,
         GAMMA as GAM, MU0 as mu0, P0, fuselageWettedArea } from "./engine/constants.js";
import { cabinAdequacy, OCCUPANT_MASS_KG, CABIN_FLOOR_PER_OCCUPANT_M2,
         equivalentDiameter } from "./engine/cabin.js";
import { atmosphereSet, viscosity, applySizingDay, SIZING_DAYS } from "./engine/atmosphere.js";
import { selectAirfoil } from "./engine/airfoils.js";
import { rotorcraftDragCD0, DRAG_CONSTANTS } from "./engine/drag.js";
import { componentWeights, WEIGHT_CONSTANTS } from "./engine/weights.js";
import { componentCG, staticMarginCriterion, CG_STATIONS, ROTOR_STATIONS, STABILITY_AUGMENTATION } from "./engine/cg.js";
import { solveWingPosition, WING_FRAC_MIN, WING_FRAC_MAX } from "./engine/wingPosition.js";
import { wingArea, WING_LOADING_DEFAULT_NM2, CL_CRUISE_MAX_DEFAULT } from "./engine/wing.js";
import { wingBox, WINGBOX_MATERIALS, WINGBOX_CONSTANTS } from "./engine/wingbox.js";
import { loadCases, SC_VTOL_GUSTS, airframeLoadFactors, manoeuvreLimits, thrustBorneLimitFactor,
         SC_VTOL_N_LIMIT_FLOOR, SC_VTOL_N_NEG_FLOOR } from "./engine/loadcases.js";
import { batteryThermal, PACK_LOAD_FACTORS, THERMAL_CONSTANTS } from "./engine/battery-thermal.js";
import { sizeTurboelectric, referredLapse, TURBOELECTRIC_DEFAULTS } from "./engine/turboelectric.js";
import { resolveConfiguration, CONFIGURATIONS, downloadFractionFor, downloadBasisFor, CONFIG_REFERENCE, CONFIG_DEFAULTS, capabilitiesFor } from "./engine/configuration.js";
import { coaxialInterference, COAX_THRUST_RATIO_DEFAULT, rotorStations, coaxialCountValid, twinRotorInterference, hubSpacingFor, ringRadiusFor } from "./engine/coaxial.js";
import { acai, ringRotors, failRotor, torqueToThrustRatio } from "./engine/controlauthority.js";
import { rotorcraftTailArea, ROTORCRAFT_BODY_LEN_OVER_R as SBS_BODY_LEN_OVER_R,
         SBS_TAIL_ARM_OVER_R } from "./engine/rotorcrafttail.js";
import { designSolidity, designSolidityRaw, SOLIDITY_MAX, bladeLoading, DESIGN_CT_SIGMA, designCTsigmaFor } from "./engine/rotorgroup.js";
/* The certification basis is a DESIGN CONSTRAINT, not an afterthought check.
   See engine/certification.js — and note it is a parameter, because NASA's own
   lift+cruise concept (3,724 kg) sits above the SC-VTOL small-category ceiling. */
import { MTOM_SMALL_CATEGORY_KG, mtomLimitFor } from "./engine/certification.js";
export { MTOM_SMALL_CATEGORY_KG, mtomLimitFor };

/* [SRC] NASA/TM-20210017971 Table 1: the 75 nm UAM sizing mission's vertical
   transitions are 6,000 -> 6,050 ft at +/-100 ft/min = 30 s, NOT the 2 min of
   Johnson & Silva's separate INITIAL AIR-TAXI mission. Using 120 s cost 66 kWh
   out of a 336 kWh pack and put the default design +27% over the real aircraft
   it models; 30 s puts it at -4%. validation/nasa-configs.mjs has passed 30
   explicitly all along — the app default was the only place still on 120 s.
   See engine/mission.js for the full Table 1 reading. */
export const HOVER_S_DEFAULT = 30;

/* Low end of NASA's published cruise-L/D band for a winged eVTOL of the
   lift+cruise class. [SRC] corpus S3270 (NASA RVLT): NDARC solution 9.90,
   trade started from 9.5, ~10 described as what "a well-designed Lift+Cruise
   configuration could achieve". AERODYNAMIC L/D, not L/De. */
export const LD_CLASS_MIN = 9.5;

/* -- HOVER LOAD FACTOR: NASA's published floor and design range ----------
   `twRatio` is the installed hover thrust-to-weight, and NASA's own name for
   it is the HOVER LOAD FACTOR n_z. [SRC] Hartman, Altamirano & Suh, "Flight
   Dynamics and Control Analysis for Motor Sizing and Failure Accommodation for
   a Lift+Cruise eVTOL Near Hover", VFS 81st Annual Forum, 2025 — they size an
   NDARC lift+cruise against exactly this, sweeping n_z from 1.00 g to 1.77 g,
   1.77 being "the largest load factor for which the sizing task converged".

   THE FLOOR IS THEIR FINDING, NOT AN ASSUMPTION. At the 1.00 g baseline "the
   operating torque required to hover exceeds the continuous operation rated
   torque ... this design would not be acceptable without modification", and
   hovering inside the continuous torque range "was satisfied by the 1.35 g
   design variant", so "design variants below 1.35 g load factor could be
   eliminated from further consideration". */
export const NZ_HOVER_MIN   = 1.35;   // [SRC] VFS 2025 — continuous-torque floor
export const NZ_HOVER_MAX   = 1.77;   // [SRC] VFS 2025 — largest that converged

/* =====================================================================
   ONE BATTERY CONVENTION
   =====================================================================
   `socMin` was being used with THREE different meanings in this file, and the
   provenance registry had flagged it ("used with THREE different conventions
   in the code") without it being resolved:

     1 - socMin            usable = 0.8100   main sizing
     1 / (1 + socMin)      usable = 0.8403   ferry range, payload-range curve
     1 - socMin/(1+socMin) usable = 0.8403   the SoC trace and the SoC check

   A 3.75% spread on one input, and the check that polices the design was the
   LENIENT one - it allowed a design the sizing would not.

   THE SOURCE SETTLES IT. Antcliff 2019, and Johnson & Silva 2022 in the same
   words: "discharge to 15%-20% capacity", which Antcliff annotates
   "(depth-of-discharge 0.80-0.85)". The usable fraction IS the depth of
   discharge, so with socMin as the residual floor the usable fraction is
   1 - socMin. THE MAIN SIZING WAS ALREADY RIGHT; the secondary paths were not.

   Everything now goes through this one helper, which also carries the two
   other conventions that had drifted in those paths: `sedBasis:"packUsable"`
   (which suppresses all three deratings) was honoured by the sizing loop but
   IGNORED by the payload-range and sweep code, and the battery-efficiency term
   is applied to vertical flight only (see the sizing loop and note 18). */
export function batteryConvention(p, { Etot, Evert } = {}) {
  const packUsable = p.sedBasis === "packUsable";
  const sedEff   = packUsable ? p.sedCell : p.sedCell * (1 - (p.cRateDerate ?? 0.08));
  const socFloor = packUsable ? 0 : (p.socMin ?? 0);
  const etaRaw   = packUsable ? 1 : (p.etaBat ?? 1);
  /* Vertical-flight scoping, same rule as the sizing loop. With no segment
     split supplied, fall back to the raw value rather than silently assuming
     the whole mission is forward flight. */
  const etaEff = (Etot > 0 && Evert != null)
    ? Etot / ((Etot - Evert) + Evert / Math.max(1e-6, etaRaw))
    : etaRaw;
  const usableFrac = 1 - socFloor;          // = depth of discharge [SRC]
  return {
    packUsable, sedEff, socFloor, usableFrac, etaRaw, etaEff,
    /* kWh a given battery mass can actually deliver to the mission. */
    energyFromMass: (kg) => kg * sedEff * etaEff * usableFrac / 1000,
    /* battery mass needed to deliver a given mission energy. */
    massFromEnergy: (kWh) => kWh * 1000 / Math.max(1e-9, sedEff * etaEff * usableFrac),
  };
}
export { maxRangeAtMTOM, maxPayloadAtMTOM, MTOM_LIMITS } from "./engine/certification.js";
import { applyMissionBasis, MISSION_BASES } from "./engine/mission.js";
import { motorTransientRequirement } from "./engine/motor.js";
import { runPipeline } from "./engine/pipeline.js";
import { noiseStage } from "./engine/noise.js";
import { certificationClimb } from "./engine/certification-climb.js";
export { rotorcraftDragCD0, DRAG_CONSTANTS, componentWeights, WEIGHT_CONSTANTS };
export { componentCG, staticMarginCriterion, CG_STATIONS, ROTOR_STATIONS, STABILITY_AUGMENTATION };
export { solveWingPosition, WING_FRAC_MIN, WING_FRAC_MAX };
export { wingArea, WING_LOADING_DEFAULT_NM2, CL_CRUISE_MAX_DEFAULT };
export { wingBox, WINGBOX_MATERIALS, WINGBOX_CONSTANTS };
export { loadCases, SC_VTOL_GUSTS, airframeLoadFactors };
export { batteryThermal, PACK_LOAD_FACTORS, THERMAL_CONSTANTS };
export { resolveConfiguration, CONFIGURATIONS };
export { applyMissionBasis, MISSION_BASES };
export { applySizingDay, SIZING_DAYS };

function runSizingCore(p0) {
  /* Resolve the named sizing day (hot-and-high) before anything reads the
     atmosphere — a VTOL is sized by this condition. See engine/atmosphere.js. */
  /* Mission basis first (it may set the sizing day), then resolve the day. */
  const pM = applyMissionBasis(p0);
  const p = applySizingDay(pM);
  /* Layout resolved once, up front — every module reads the same answer. */
  const cfgOut = resolveConfiguration(p, p.nPropHover);
  /* ── DOES THIS AIRCRAFT HAVE A WING? ─────────────────────────────────
     NDARC's baseline for EVERY configuration is nWing=0; a wing is ADDED by
     the configurations that have one (TP-20220000355 Vol 2, Ch.2). This engine
     had the inverse assumption welded in — `wingArea()` was called
     unconditionally, so selecting "multicopter" still produced a 35.5 m2 wing
     with a 17.9 m span and an L/D of 11.6, for an aircraft that has no wing. */
  const hasWing = cfgOut.capabilities.hasWing !== false;
  /* Design hover blade loading for THIS layout, from the closest published
     NASA vehicle. A single mean across all of them forced solidity ~87% high
     on a collective tiltrotor and diverged the loop; see engine/rotorgroup.js. */
  const ctSigmaDesign = designCTsigmaFor(cfgOut.key, cfgOut.nTilting, cfgOut.nRotors);
  /* ── ewf MUST HAVE A VALUE EVEN UNDER THE BUILDUP MODEL ──────────────
     `ewf` is inert under weightModel:"buildup" — the slider is documented as
     ignored, and it is. But it is NOT unused: round one seeds MTOW with
     `Wempty1 = p.ewf * MTOW1`, and the buildup guard falls back to
     `p.ewf * MTOW` if componentWeights ever returns something non-finite.
     So omitting it does not give you the buildup model, it gives you
     `undefined * MTOW` = NaN on the first iteration and a fully NaN result
     that reports itself as "diverged".
     That is a trap for any caller that reasonably assumes an inert input can
     be left out — it cost a whole benchmark run. 0.50 is the App default and
     is only ever a seed under buildup. */
  const ewf = p.ewf ?? 0.50;
  /* Round-or-null. A wingless aircraft has no CL, no CD0, no wing loading —
     null is the truthful value and every consumer must handle it, rather than
     a zero that reads like a measurement. It also stops NaN being RECORDED as
     a result: 13 golden cases were storing the string "NaN" for LDact and
     CD0tot on divergent designs, which this turns into an explicit null. */
  const rn=(x,d)=>(x==null||!isFinite(x))?null:+x.toFixed(d);
  /* ── ROTOR-BORNE CRUISE EFFICIENCY [CAL] ─────────────────────────────
     A wingless aircraft cruises rotor-borne, so W/(L/D) does not describe it.
     The correct model is rotor forward-flight power, Pi + Po + Pp, where the
     profile term needs NDARC's advance-ratio function F_P (Theory 12-5.1.2,
     CP_o = (sigma/8) cd_mean F_P).

     F_P IS NOT IMPLEMENTED AND IS NOT GUESSED. Its closed form is rendered as
     unrecoverable glyphs in both `pdftotext -layout` and plain extraction of
     TP-20220000355 — the same failure that has kept the AFDD84 fuselage
     equation out of this engine. Guessing it would be inventing physics.

     INSTEAD, and labelled honestly: NASA publish the EFFECTIVE lift-to-drag
     ratio L/De = W*Vbr/P for each reference vehicle (TM-20210017971 Table 12):
     quadrotor-electric 5.80, side-by-side-electric 7.20, lift+cruise-electric
     8.50, tiltwing 8.72. So the wingless cruise efficiency here is CALIBRATED
     to published vehicles, NOT predicted. It will not respond to rotor design,
     because nothing in it models rotor design. Surfaced as a check, and the
     route to making it predictive is a clean copy of F_P.

     ── ONE VALUE WAS APPLIED TO EVERY WINGLESS LAYOUT, AND THAT IS WRONG.
     The comment above lists NASA's published L/De PER VEHICLE and then the
     code used the quadrotor's 5.80 for all of them. The side-by-side was
     therefore flying with a quadrotor's cruise efficiency when NASA publish
     7.20 for it — 24% better, and the difference between two genuinely
     different rotor arrangements. Same defect class as the flap frequency and
     the cruise speed: a per-configuration published value collapsed to a
     constant. Now taken from CONFIG_DEFAULTS.LD_target, which carries Table
     12's own figure for each layout. */
  const rotorborneLoD = p.rotorborneLoD
    ?? CONFIG_DEFAULTS[cfgOut.key]?.LD_target ?? 5.80;   // [SRC] NASA Table 12 per vehicle

  /* ── etaSys MEANS TWO DIFFERENT THINGS, AND ONLY ONE OF THEM APPLIES HERE ──
     Cruise power is `Pcr = (W/eta) * (V/LD)`. On a WINGED aircraft LD is an
     AERODYNAMIC lift-to-drag and eta must be the FULL chain including the
     propeller (~0.744-0.80). On a WINGLESS one LD is NASA's EFFECTIVE
     L/De = W*Vbr/P, which ALREADY contains the propulsive term — so dividing
     by a full-chain efficiency counts propulsive efficiency TWICE.
     validation/nasa-configs.mjs states this explicitly and says an earlier
     revision of that file "got that wrong in both directions — 0.80 for all
     three (double-counting on the wingless ones)". It was fixed there and
     never here: the app has been running 0.80 against an effective L/De.
     The rotor-borne path now uses the BATTERY-TO-SHAFT powertrain efficiency,
     which is what L/De does not already contain. [CAL] 0.845, recovered
     independently from Quad-E and SbS-E, which both solve to the same value —
     that agreement is the evidence. */
  const POWERTRAIN_ETA_ROTORBORNE = 0.845;
  const etaRotorborne = p.powertrainEta ?? POWERTRAIN_ETA_ROTORBORNE;
  const deltaT=p.deltaISA||0;      // ISA temperature deviation, K
  const T0eff=T0+deltaT;           // retained: referenced by the acoustics model below

  /* Atmosphere — see engine/atmosphere.js for the corrected ISA derivation. */
  const atm=atmosphereSet(p);
  const isa=atm.isa, fieldElev=atm.fieldElev;
  const atmCr=atm.cruise, atmHov=atm.hover, atmSL=atm.field;
  const Tcr=atmCr.T, rhoCr=atmCr.rho, aCr=atmCr.a;
  const rhoHov=atmHov.rho;
  const muCr=viscosity(Tcr);
  const RoC=p.rateOfClimb,clAng=p.climbAngle;
  const Vcl=RoC/Math.sin(clAng*Math.PI/180);
  // Climb L/D derating: induced drag increases at climb AoA (user-adjustable, default 13%)
  /* ── CLIMB / DESCENT AERODYNAMICS — CLOSED AGAINST THE COMPUTED L/D ──────
     These were computed ONCE from the p.LD slider and never revisited, so the
     slider still drove climb power, descent power, the descent ANGLE (and hence
     descent ground distance and therefore cruise distance). Measured: moving
     the slider 8 -> 20 swung climb energy 35.4 -> 18.8 kWh and MTOW 3999 -> 3397 kg
     (15%), while the model's own LDact barely moved (10.71 -> 10.26). That is the
     same defect already fixed for CRUISE — sizing driven by an input the
     aerodynamics contradicts — left behind in the other segments.
     They are seeded from p.LD and then re-derived each iteration from the
     converged L/D. Set p.useTargetLD to keep the legacy slider behaviour. */
  let LDcl=p.LD*(1-(p.climbLDPenalty ?? 0.13));
  let LDdc=LDcl;      // descent L/D — re-derived on the polar at descent speed
  let PdcRawOut=0, regenCreditKW=0;
  /* DESCENT ANGLE — user override, else the unpowered-glide angle from the
     converged L/D. `p.descentAngle` existed as a slider and the engine NEVER
     READ IT: desAng was always atan(1/LD). Measured with
     validation/sensitivity.mjs, moving that slider changed nothing anywhere in
     the result. A control that cannot change the design must not sit on the
     design panel.
     It is a real design variable, so it is wired rather than deleted: approach
     angle is chosen by procedure and terrain. With it unset the closed-loop
     behaviour is unchanged, so the default aircraft does not move.
     AN EARLIER VERSION OF THIS COMMENT CLAIMED a powered approach is "normally
     STEEPER than best glide". Measured against each layout's converged L/D, the
     6 deg default is steeper on three and SHALLOWER on three -- tiltrotor 6.97,
     side-by-side 7.91, multicopter 9.78 deg -- so the claim is not general and
     is withdrawn. The 6 deg figure itself comes from FAR Part 36 Appendix H via
     Johnson & Silva 2022, where it is the NOISE CERTIFICATION approach
     trajectory; no corpus source gives a sizing-mission descent angle. */
  let desAng=(p.descentAngle!=null&&p.descentAngle>0)
    ? p.descentAngle
    : Math.atan(1/p.LD)*180/Math.PI;
  /* ── DESCENT IS FLOWN AT CRUISE SPEED, AND THE RATE FOLLOWS FROM IT ────
     This was `Vdc = RoC / sin(desAng)` — the CLIMB rate divided by the descent
     angle. Two things were wrong with it. It reused the climb rate as a
     descent rate, which no source pairs, and because both RoC and desAng are
     layout-independent inputs it gave EVERY configuration the identical
     descent speed: 48.6 m/s for a 89 m/s tiltrotor and for a 50 m/s
     multicopter alike, 96% of the multicopter's own cruise speed.

     NASA flies the en-route descent at cruise speed. Hartman, Foster &
     Hartman, AIAA-2023-0548 (NTRS 20220017406), describing the UAM profile:
       "a nominal descent at cruise speed to 500 ft, transition to a
        'low-speed' descent to 100 ft, a deceleration to hover at 100 ft, and
        finally a vertical descent to the surface"
     So the speed is the aircraft's own, the descent RATE is a consequence
     (V sin(gamma)), and the kinematics differ per layout because cruise speed
     does. The same paper's 100 ft/min belongs to the VERTICAL take-off and
     landing segments — "vertically ascend and descend at 100 ft/min during
     vertical take-off and landing operations" — and is NOT the en-route
     descent rate; reading it as one would give a 33-minute descent. */
  let Vdc=p.vCruise;
  let RoD=Vdc*Math.sin(desAng*Math.PI/180);   // descent rate, derived
  // Reserve: time-based — FAA powered-lift SFAR 20 min VFR (see the citation
  // block below; EASA VTOL.2430(b)(4) requires a reserve but states no number)
  // Vres = 0.76×Vcruise (best-endurance speed for electric)
  /* ?? not || — a reserve of ZERO is a legitimate input (the marketing mission
     basis sets exactly that), and `0 || 20` silently returns 20. This made the
     marketing basis quietly fly a full 20-minute reserve. Same trap below for
     climbLDPenalty, where 0 means "no derating". */
  const reserveMinutesInput = p.reserveMinutes ?? 20;
  /* ── RESERVE SPEED IS MISSION-DEFINED, NOT UNIVERSAL ──────────────────
     0.76*Vcruise is best-endurance, which is what Johnson & Silva's INITIAL
     AIR TAXI mission specifies: "20-min flight at best-endurance speed (Vbe)".
     But the six-passenger 75 nm UAM sizing mission — the one NASA's Table 12
     vehicles are sized to — specifies a CRUISE reserve, twice and explicitly:
       NASA/TM-20230018312 p.214: "75 nmi with a 20-min cruise reserve range"
       Exploration of Design Drivers for the RVLT Lift+Cruise Reference
       Aircraft: "A 20-minute cruise reserve is the final segment"
     Flying the reserve at 0.76 V understates it, because reserve power goes as
     V/(L/D). Default is unchanged (best endurance); set reserveAtCruiseSpeed
     for the UAM mission. */
  const Vres=(p.reserveAtCruiseSpeed===true?1.0:0.76)*p.vCruise;

  /* ── RESERVE CAN BE SET BY TIME OR BY DIVERSION DISTANCE ──────────────
     THE REGULATION IS WRITTEN IN TIME, and that stays the default:
       FAA powered-lift SFAR (Integration of Powered-Lift, final rule Oct 2024;
         operations final Apr 2025): 20 min VFR, 30 min IFR. It also lets
         powered-lift use HELICOPTER minima where the aircraft can land
         vertically at any point on the route.
       EASA states the REQUIREMENT but never a number: SC-VTOL VTOL.2430(b)(4).
         MOC SC-VTOL Issue 2 p.5 speaks only of "the sufficient reserve
         accepted for compliance with VTOL.2430(b)(4)" — an accepted-means
         matter, left to the applicant. No minute value appears anywhere in
         SC-VTOL or its MOCs. (This block previously cited a paragraph number
         that appears in NO primary document — see validation/citations.mjs,
         which now fails the build on any such reference.)
       14 CFR 91.151(b) gives 20 min VFR for ROTORCRAFT (airplanes get 30/45).
       The 20 min this engine defaults to is NASA's sizing convention, and it
         is the source of the max(time, 10%) rule below — Johnson & Silva
         2022: "reserve minimum of 10% of mission or 20-min flight at
         best-endurance speed (Vbe)".
       NASA add a second criterion — the reserve is the LARGER of the time-based
         one and 10% of mission energy — which is applied further down.
     Distance is therefore a CONSEQUENCE of time and reserve speed, which is why
     the reserve range has always been a derived read-out rather than an input.

     BUT A DIVERSION IS A DISTANCE. "Reach the alternate vertiport" is a
     range requirement, not a duration, and a designer siting vertiports thinks
     in kilometres. Neither basis is more correct than the other — they answer
     different questions — so BOTH are offered and the one in use is reported.
       reserveBasis "time"     : minutes given, distance derived  [regulatory]
       reserveBasis "distance" : km to alternate given, time derived
     Time is still what the energy model consumes; a distance basis simply
     inverts t = d / Vres before anything else happens, so the two paths are
     the same physics reached from opposite ends. */
  const reserveBasis = p.reserveBasis === "distance" ? "distance" : "time";
  const reserveMinutes = (reserveBasis === "distance" && Vres > 0
                          && (p.reserveDistanceKm ?? 0) >= 0)
    ? (p.reserveDistanceKm ?? 0) * 1000 / Vres / 60
    : reserveMinutesInput;
  const tres_s=reserveMinutes*60;                      // reserve time in seconds
  const reserveDistM=Vres*tres_s;                      // distance flown during reserve (for range budget)
  const hvtol=p.hoverHeight;
  /* ── CLIMB HEIGHT IS ABOVE THE FIELD, NOT ABOVE THE SEA ───────────────
     `cruiseAlt` is MSL — engine/atmosphere.js reads it as `isa(p.cruiseAlt)`
     while hover density comes from `isa(fieldElev + hoverHeight)`. The climb
     geometry here disagreed with that: it computed the climb from
     `cruiseAlt - hoverHeight`, i.e. from SEA LEVEL, ignoring the field
     elevation entirely.

     With the default fieldElev = 0 the two readings coincide, which is why
     this survived. It surfaces the moment a real vertiport altitude is used:
     NASA's UAM sizing mission takes off from a 6,000 ft field and cruises at
     10,000 ft MSL — 4,000 ft AGL — but the engine climbed the full 10,000 ft.
     At a 5 deg climb angle that is 34.7 km of climb instead of 13.9 km, and
     with two hops it consumed 127 km of a 139 km mission: the lift+cruise
     was spending 154 kWh on climb and 13 kWh on cruise, which is not the
     mission NASA describes ("cruise altitude of 4000 ft above ground level").

     Clamped at zero so a cruise altitude below the field cannot produce a
     negative climb distance. */
  const climbHeight=Math.max(0,p.cruiseAlt-fieldElev-hvtol);
  const ClimbR=climbHeight/Math.tan(clAng*Math.PI/180);
  let DescR=climbHeight/Math.tan(desAng*Math.PI/180);

  /* ── CONVERGENCE TOLERANCE, SCALED TO GROSS WEIGHT ──────────────────
     NDARC Theory Manual (Johnson, NASA/TP-20220000355) §5-1.2, verbatim:

       "The tolerance is 0.1*P*eps for engine power and drive system limit;
        0.01*W*eps for gross weight, maximum takeoff weight, fuel weight,
        jet thrust, and design rotor thrust; and 0.1*L*eps for rotor radius."

     §5-1.1: "Single values are specified for the task and then scaled for
     each element tested or perturbed. The scaling is based on a reference
     weight W (design gross weight ...)".

     This was an ABSOLUTE threshold in kilograms, so the same exponent asked
     1.8e-10 of a 5,700 kg aircraft and 5e-10 of a 2,000 kg one — the test got
     harder as the aircraft got heavier. At the default it demanded agreement
     to one MILLIGRAM, which the heavier rotor-borne layouts never reached, so
     the tool told the user their converging design had failed to converge. */
  /* `??`, NOT `||`. With `||` a convTolExp of 0 — a legitimate exponent,
     tolerance 0.01*W — is falsy and silently becomes the -6 default, i.e. a
     threshold a million times tighter than the caller asked for. The UI slider
     spans -10..-1 so no user can reach it, but a harness or an API caller can,
     and the same trap was already fixed once on p.spBattery (see the comment
     at the specific-power guard below). */
  const convEps = Math.pow(10, p.convTolExp ?? -6);
  const tolFor = (W) => 0.01 * Math.max(1, Math.abs(W)) * convEps;

  /* Round 1 */
  let MTOW1=2177,Wempty1,Wbat1,itersR1=0;
  for(let i=0;i<5000;i++){
    itersR1=i+1;
    Wempty1=ewf*MTOW1;
    const bf=(g0*p.range*1000)/(p.LD*p.etaSys*p.sedCell*3600);
    Wbat1=bf*MTOW1;
    const mn=p.payload+Wempty1+Wbat1;
    if(Math.abs(mn-MTOW1)<tolFor(MTOW1)){MTOW1=mn;break;}
    MTOW1=mn;
    if(MTOW1>5700)break;
  }

  /* ── HOW MANY HOPS THE SIZING MISSION FLIES ───────────────────────────
     The engine charged ONE takeoff, ONE climb, ONE descent and ONE landing.
     NASA's six-passenger UAM sizing mission is TWO HOPS, and two independent
     NASA sources say so:
       Johnson & Silva 2022 sec.5: "two 37.5-nm flights (total 75-nm range
         without recharging or refueling), with a 20 min reserve"
       Exploration of Design Drivers for the RVLT Lift+Cruise Reference
         Aircraft: "two hops of 37.5 nautical miles each into a 10 knot
         headwind ... The aircraft does not charge when on the ground after
         completing the first 37.5 nmi hop."
     So the aircraft pays for FOUR hover segments, two climbs and two descents
     on one battery charge — not two hover segments, one climb, one descent.
     Total cruise DISTANCE is unchanged; it is split across the hops, and each
     hop costs its own climb and descent.
     Default 1 leaves every existing design exactly where it was. */
  const missionHops=Math.max(1,Math.round(p.missionHops??1));
  let CruiseRange=p.range*1000-missionHops*(ClimbR+DescR)-reserveDistM;  // actual cruise distance

  /* Round 2 — coupled MTOW+Energy  (T/W ratio applied to hover thrust) */
  const TW = p.twRatio ?? 1.0;
  let MTOW=MTOW1;
  let Phov,Pcl,Pcr,Pdc,Pres,tto,tcl,tcr,tdc,tld,tres;
  let Eto,Ecl,Ecr,Edc,Eld,Eres,Etot,Wempty,Wbat;
  let weightGroups=null;   // populated when weightModel==='buildup'
  let DL_hover_out=0, T_hov_out=0;   // hover-equilibrium values escaping the loop
  let kDLout=0;                      // effective hover download actually applied
  /* ── ROTOR DIAMETER IS A CONSEQUENCE OF DISK LOADING, NOT A CONSTANT ──
     Disk loading is what CONFIG_DEFAULTS actually publishes per layout (NASA
     Table 12, Joby, Archer). Diameter follows from it and the weight:
         D = 2*sqrt(W / (N * pi * DL))
     Holding the DIAMETER fixed while MTOW moves lets disk loading run away.
     That is not hypothetical: selecting "tiltrotor" in the UI set a diameter
     from a GUESSED 3,175 kg, the design then converged toward 9,165 kg, and
     the disk loading ended at 42 lb/ft2 against a 12.4 target — past the
     25 lb/ft2 check, past hover stall, solidity clamped, loop non-convergent.
     The same "X is a consequence" fix already applied to solidity.
     p.rotorSizing:"fixedDiameter" pins the diameter instead (the slider). */
  const dlTargetLbFt2 = p.diskLoadingLbFt2 ?? CONFIG_DEFAULTS[cfgOut.key]?.DL_lbft2 ?? null;
  const sizeRotorToDL = p.rotorSizing === "diskLoading" && dlTargetLbFt2 > 0
                        && (p.nPropHover ?? 0) > 0;
  /* ROTOR DIAMETER IS A REQUIRED INPUT, AND OMITTING IT USED TO CRASH.
     propDiamEff is only re-derived inside the disk-loading solve; on any path
     that does not run it, an absent p.propDiam stayed undefined and surfaced
     ~2000 lines later as "Cannot read properties of undefined (reading
     'toFixed')" from a check's display string. Not reachable from the web app,
     where the field always holds a value, but it is the whole API surface for
     the validation harnesses and for anyone driving the engine directly.

     This does NOT invent a diameter. Choosing one silently would be worse than
     failing: the rotor is the single input the disk loading, the hover power
     and half the weight model hang off. It fails with the name of what is
     missing, which is what the caller needs. configuration.solveRotorDiameter
     is the supported way to obtain one. */
  if (!(Number.isFinite(p.propDiam) && p.propDiam > 0)) {
    throw new TypeError(
      "runSizing: propDiam (rotor diameter, m) is required and must be a positive "
      + `number — received ${JSON.stringify(p.propDiam)}. Use `
      + "configuration.solveRotorDiameter(configType, params, runSizing) to solve "
      + "it with MTOW, or pass a diameter directly.");
  }
  let propDiamEff = p.propDiam;
  const diamForWeight = (W_kg) => 2 * Math.sqrt(
    (W_kg * 9.80665) / (p.nPropHover * Math.PI * (dlTargetLbFt2 / 0.0208854)));
  /* ── FUSELAGE LENGTH SCALES WITH THE AIRCRAFT ─────────────────────────
     fusLen was a fixed slider value, so a design that grew from 3,000 to
     5,000 kg kept a 7.2 m fuselage and the Fus/Span ratio drifted out of band
     — the check said so in its own text: "fusLen does not scale with MTOW".

     NDARC sec.10-1 gives two routes. The layout route,
         l_fus = l_nose + (x_max - x_min) + l_aft
     is the physically right one, but it is CIRCULAR here: this engine places
     the wing at a FRACTION of fusLen and derives the tail arm from it, so
     fusLen cannot be computed from stations that are themselves defined by
     fusLen. NDARC's other route is weight-based:
         S_wet = k_wet (W_D/1000)^(2/3)
     At a fixed fineness ratio S_wet scales as l^2, so l scales as W^(1/3) —
     geometric similarity, and NDARC's own weight scaling.

     BUT SCALING ON MTOW IS WRONG, AND MEASURING IT PROVED IT. Tried first:
     l_fus = l_ref (MTOW/MTOW_ref)^(1/3). It is UNSTABLE and it is unphysical.
       - Unstable: fuselage weight already grows with wetted area, so a longer
         fuselage is a heavier fuselage is a heavier aircraft is a longer
         fuselage. The multicopter went 5,213 -> 10,436 kg and the side-by-side
         4,318 -> 10,994 kg. A positive feedback loop, straight away.
       - Unphysical: CABIN LENGTH IS SET BY SEATS. An eVTOL that grows because
         its BATTERY grew does not need a longer cabin — the pack goes in the
         floor and the wing. Weight is not the driver.
     So the check's own wording, "fusLen does not scale with MTOW", framed the
     defect wrongly and this took it at face value before measuring.

     THE DRIVER IS PAYLOAD. l_fus = l_ref (payload/payload_ref)^(1/3), the
     geometric-similarity form for a cabin whose dimensions grow together.
     ANCHOR [SRC]: Joby S4, 24 ft (7.32 m) long, 1,000 lb (453 kg) payload,
     five seats. Payload is an INPUT, not a loop variable, so there is no
     feedback and no runaway — which is the point.

     Applied to LENGTH only: fuselage DIAMETER is seats-abreast and stays where
     the user puts it. p.fuselageSizing:"fixed" pins the length.

     CONSEQUENCE, and it is a real result rather than a defect: Fus/Span still
     drifts, because SPAN grows with MTOW while the cabin does not. That ratio
     moving is what SHOULD happen to a heavier aircraft carrying the same five
     people. Joby measures 7.32/11.8 = 0.62. */
  /* ── A NON-CIRCULAR SECTION NEEDS AN EQUIVALENT DIAMETER ───────────
     A capsule cabin is TALLER THAN IT IS WIDE — the supplied two-seat
     reference is 1.5 m across and 1.9 m tall — and one diameter cannot
     carry both. Modelled as a circle of D = width the frontal area is 21%
     low; as a circle of D = height, 27% high. sqrt(W*H) reproduces the
     ellipse exactly.

     AREA terms take fusDiamArea. Terms that mean a real physical width —
     the cabin floor, rotor clearance — keep p.fusDiam. Conflating those is
     how a single-diameter model goes wrong to begin with.

     fusHeight defaults to fusDiam, so a circular body is unchanged. */
  const fusDiamArea = (Number(p.fusHeight) > 0 && Number(p.fusDiam) > 0)
    ? equivalentDiameter(p.fusDiam, p.fusHeight)
    : (Number(p.fusDiam) || 0);

  const FUS_REF_PAYLOAD_KG = 453;   // [SRC] Joby S4, 1,000 lb payload, 7.32 m long
  const scaleFusLen = p.fuselageSizing !== "fixed" && (p.payload ?? 0) > 0;
  let fusLenEff = scaleFusLen
    ? p.fusLen * Math.cbrt(p.payload / FUS_REF_PAYLOAD_KG)
    : p.fusLen;

  /* ── THE AIRFRAME MUST BE LONG ENOUGH FOR ITS OWN ROTOR ARRAY ─────────
     A fore/aft rotor array on a winged layout has to satisfy three things at
     once, and each is measured rather than chosen:

       1. the forward disc may lead the nose by at most RAVEN's overhang
              x_fwd - R >= -0.0744 fL
          [SRC] SWFT's forward proprotor disc leads its nose by 1.165 m on a
          15.6566 m fuselage.
       2. the aft disc must clear the tail leading edge
              x_aft + R <= 0.806 fL
          the tail station this engine's own stability solution produces.
       3. the two discs must not overlap fore and aft
              x_aft - x_fwd >= 1.05 D          (rotorTipClearFrac)

     Add them and the fuselage cancels out into a single bound:

              2R + 1.05 D <= 0.880 fL   ->   D / fL <= 0.4293

     AND THE MEASUREMENT AGREES INDEPENDENTLY. RAVEN SWFT runs D/fL = 0.3796
     and v01_003 runs 0.4197 — both just inside a limit derived from geometry
     that never looked at them. Two routes to the same number is what makes
     this a constraint rather than a preference.

     THE ROTOR IS NOT SHRUNK TO MEET IT. Diameter comes from the disk loading
     the configuration publishes, which is [SRC] from NASA Table 12; capping D
     on the lift+cruise would drive disk loading from 13.1 to 29 lb/ft2, past
     anything any eVTOL flies. The fuselage is the quantity with room to move
     — it is already derived, from payload^(1/3) — so the AIRFRAME grows to
     carry the array it was given. That is the direction a designer would go,
     and it leaves every sourced number intact.

     Rotor-borne layouts are excluded: they have no tail and no fore/aft
     array, and neither RAVEN is one, so nothing here can adjudicate them. */
  const ROTOR_FIT = {
    noseOverhangOverFL: 0.0744,   // [SRC] SWFT 1.165 m / 15.6566 m
    tailLEoverFL:       0.806,    // this engine's own tail station
    tipClear:           1 + (p.rotorTipClearFrac ?? 0.05),
  };
  const fitCaps = capabilitiesFor(p?.configType);
  const arrayIsForeAft = !!(fitCaps?.hasWing) && (fitCaps?.nTail ?? 0) > 0;
  const maxDoverFL = (ROTOR_FIT.tailLEoverFL + ROTOR_FIT.noseOverhangOverFL)
                   / (1 + ROTOR_FIT.tipClear);
  let fusLenForRotors = 0, fusLenGrownForRotors = false;
  if (arrayIsForeAft && Number.isFinite(p.propDiam) && p.propDiam > 0) {
    fusLenForRotors = p.propDiam / maxDoverFL;
    if (fusLenForRotors > fusLenEff) { fusLenEff = fusLenForRotors; fusLenGrownForRotors = true; }
  }
  /* ── WHY THE SIDE-BY-SIDE'S BODY IS *NOT* GROWN TO 2.87 R HERE ─────────
     The rule above grows the body so a FORE-AFT rotor array fits along it.
     A side-by-side's rotors are lateral, so it never fires, and the layout
     keeps fineness x diameter = 7.21 m against a 4.47 m rotor radius —
     1.61 R, rotors at mid-length, 0.80 R of body behind them. That is the
     real reason this configuration has no tail: an airframe with nowhere to
     put one, not a modelling choice.

     NASA's is 2.87 R long with a 1.87 R tail arm (measured, see
     engine/rotorcrafttail.js). GROWING OURS TO MATCH WAS TRIED AND BACKED
     OUT, because the fuselage weight model charges a FULL-DIAMETER body for
     the whole length and a tail boom is not that — it is a slender tapering
     tube. Measured consequence of growing it: MTOW -3.5% -> +13.4% against
     NASA's published 4900 lb, benchmark mean 8.7% -> 11.5%, and SbS-E fell
     out of every within-AFDD group but flight controls.

     So the blocker is named rather than papered over: this needs the tail
     boom charged as a boom (engine/booms.js already sizes exactly this kind
     of tube from shell buckling and minimum gauge) with the fuselage weight
     driven by CABIN length. Until then, extending the body would trade a
     missing tail for a 13% mass error, and sizing a tail on the short arm
     the aircraft does have gives S_h = 5.4 m^2 on a 2-tonne helicopter —
     NDARC's own formula, correctly reporting that a stub arm needs an absurd
     surface. Neither is shippable, and neither is invented. */
  /* COAXIAL ARRANGEMENT. Opt-in and only where the layout supports it: a
     contra-rotating pair needs an even rotor count, and only the rotor-borne
     layouts carry pairs. Coplanar stays the default everywhere, so no existing
     result moves - NASA's quadrotor is coplanar. */
  const cfgCaps0 = capabilitiesFor(p?.configType);
  const isCoaxial = String(p?.rotorArrangement ?? "coplanar") === "coaxial"
    && cfgCaps0?.supportsCoaxial === true
    && coaxialCountValid(p?.nPropHover);
  const nRotorStations = rotorStations(p?.nPropHover, isCoaxial ? "coaxial" : "coplanar");
  let kCoax = 1;
  let kTwin = 1;   // NDARC 12-5.1.3 twin-rotor overlap, side-by-side only
  /* ── POWERTRAIN ─────────────────────────────────────────────────────
     "battery" (default): the pack flies the mission — every existing result.
     "turboelectric": a turboshaft-generator carries every segment with zero
     net battery flow and the pack is sized for an engine-out landing only;
     see engine/turboelectric.js for the model and its sources. */
  const isTE = p?.powertrain === "turboelectric";
  let teOut = null, WfuelOut = 0, EpackSizeOut = 0;
  let solidityEff=p.solidity??0.10;  // derived from design blade loading, see below
  let solidityReqOut=p.solidity??0.10;   // unclamped requirement, for the buildability check
  let spBattery=0, WE_out=0, WP_out=0;   // battery sizing values escaping the loop
  let sedEffOut=0, packUsableOut=false;
  let etaBatEffOut=1, EvertOut=0;
  let groupSumsOut=null, gearOut=null, avOut=null, sizeCondOut=null, PmotInstalledOut=null, nzWeightsOut=null;
  let cruiseRatingKWOut=0, motorTauOut=0, motorExtrapOut=false;
  let driveOut=null;   // engine/drivesystem.js detail — null under the ewf model
  let rotorOut=null;   // engine/rotorgroup.js detail — which rotor model ran, and its chord
  let fcOut=null;      // engine/flightcontrols.js detail — model and base used
  let boomOut=null;    // engine/booms.js detail — arm, radius, wall, attachment split
  let dragAreasOut=null;
  let buildupFallbacks=0, lastFallbackTotal=null, lastIterFellBack=false, lastIterMTOW=null;
  /* Pack-systems mass feeds the NEXT iteration — it depends on pack size, which
     depends on the weight it is part of. Converges with the outer loop. */
  let packSysPrev=0;
  /* Previous iteration battery mass, used the same way packSysPrev is: the
     flight-controls group scales with AIRFRAME weight (MTOW minus energy
     storage), not with MTOW, so it needs Wbat and Wbat is not known until
     later in the same pass. Converges with the outer loop. */
  let WbatPrev=0;
  const mtowH=[MTOW1],energyH=[],residualH=[];
  let itersR2=0, r2Converged=false, r2Diverged=false;
  /* [SRC] EASA SC-VTOL-01 small-category applicability: MCTOM 3,175 kg
     (7,000 lb) and 9 passengers or fewer. */
  const mtomLimit   = mtomLimitFor(p);
  /* The NUMERICAL runaway guard is deliberately looser than the DESIGN
     constraint. They answer different questions: the constraint says "this is
     out of category", the guard says "this iteration is no longer meaningful".
     Aborting the solver exactly at the constraint would stop it from ever
     reporting HOW FAR out of category a design is, which is the number a
     designer needs in order to decide what to change. */
  const mtowCeiling = Math.max(1, p.mtowCeilingKg ??
                        (isFinite(mtomLimit) ? 2 * mtomLimit : 20000));
  let mtowCeilingHit = false;
  /* ── SOLVER STATE — see the hybrid block at the foot of this loop ──── */
  let xPrev=null, fPrev=null;                 // previous iterate and residual
  let brLo=null, brHi=null;                   // bracket, once a sign change is seen
  let solverPhase="fixed-point", secantSteps=0, bisectSteps=0;
  let secantStalls=0, secantDisabled=false;
  let noSolutionBelowCertLimit=false;
  const certLimit=p.mtowCertLimitKg??5700;
  /* 600, not 200. At eps=1e-10 the slowest contracting layout needs ~480
     iterations to satisfy 0.01*W*eps; at 200 it was cut off mid-descent and
     reported as divergent. Marginal cost is 0.016 ms per iteration against
     ~11.6 ms fixed per run. Runaway is caught by the MTOW ceiling below, which
     the two genuinely divergent cases trip at iterations 20 and 14, so this
     does not give a diverging design more room to run. */
  /* Finite-wing lift-curve slope, Raymer Eq.12.6 (~4.9/rad at AR=8). Hoisted
     here from the stability block because the sizing loop now needs it: the
     SC-VTOL gust increment is proportional to it, and that increment sets the
     ultimate load factor the weight model sizes the structure to. */
  const CLaW=2*Math.PI*p.AR/(2+Math.sqrt(p.AR**2+4));
  for(let o=0;o<600;o++){
    itersR2=o+1;
    const W=MTOW*g0;
    // ── AERODYNAMIC L/D for current MTOW — computed inside loop so Pcr/Pres ──
    // use the physically correct drag, not just the user-input p.LD.
    // p.LD is a TARGET / sanity check; LDact_i is what the wing actually produces.
    const qCr_i=0.5*rhoCr*p.vCruise**2;
    const Swing_i=hasWing?wingArea(p,W,qCr_i).Swing:0;
    /* With Swing_i = 0 these are 0/0. Cr_i comes out NaN, MAC_i follows, and
       the NaN propagates into componentWeights — where it silently tripped the
       buildup guard and substituted the ewf fraction, on every iteration, while
       still reporting weightModel:"buildup". Zeroed explicitly instead. */
    const bW_i=hasWing?Math.sqrt(p.AR*Swing_i):0;
    const Cr_i=hasWing?2*Swing_i/(bW_i*(1+p.taper)):0;
    const MAC_i=hasWing?(2/3)*Cr_i*(1+p.taper+p.taper**2)/(1+p.taper):0;
    const Re_i=rhoCr*p.vCruise*MAC_i/muCr;
    const Sww_i=2*Swing_i*(1+0.25*p.tc*(1+p.taper*0.25));
    const fL_i=fusLenEff,fD_i=fusDiamArea,lf_i=fL_i/fD_i;
    /* Same helper as the weight model -- Raymer above fineness 2.5, geometric
       spheroid below, where Raymer collapses to zero. A pod's drag had been
       computed on that collapsed area. */
    const Swf_i=fuselageWettedArea(fL_i,fD_i);
    const Swhs_i=2*Swing_i*0.18,Swvs_i=2*Swing_i*0.12;
    const Swn_i=p.nPropHover*0.10*Math.PI*Math.pow(propDiamEff/2,2);
    const Cfw_i=0.455/Math.log10(Re_i)**2.58/(1+0.144*(p.vCruise/aCr)**2)**0.65;
    const Cff_i=0.455/Math.log10(rhoCr*p.vCruise*fL_i/muCr)**2.58/(1+0.144*(p.vCruise/aCr)**2)**0.65;
    const FFw_i=(1+(0.6/0.30)*p.tc+100*p.tc**4)*1.05;
    const FFf_i=1+60/lf_i**3+lf_i/400;
    /* ── DRAG AREA IS THE PRIMITIVE, CD0 IS A PRESENTATION ───────────────
       Each term below is a component DRAG AREA in m^2 — a skin-friction
       coefficient times a form factor times that component's WETTED area. The
       code previously divided each one by Swing as it went, which made a wing
       area mandatory to express drag at all, and is the single reason the whole
       aerodynamic chain cannot describe a wingless aircraft.

       NDARC does not work that way. Johnson, NDARC Theory (NASA TP-20220000355)
       section 8, verbatim:

         "Each component can contribute drag to the aircraft. A fixed drag can
          be specified as a drag area D/q; or the drag can be scaled, specified
          as a drag coefficient CD based on an appropriate area S ... For fixed
          drag, the coefficient is CD = (D/q)/S ... IF NO REFERENCE AREA IS
          INDICATED, THEN THE INPUT IS ONLY DRAG AREA D/q."

       and at aircraft level, "the drag can be estimated based on the gross
       weight, D/q = k(W_MTO/1000)^(2/3)" — the correlation already implemented
       here as kNDARC. So the dimensional drag area is the model, and CD0 is a
       non-dimensionalisation chosen per component against whatever reference
       area suits it (NDARC Table 8-2: fuselage -> fuselage WETTED area, rotor
       hub -> rotor DISK area, wing -> planform, landing gear -> no reference
       area at all, D/q only).

       Summing the areas first and dividing ONCE is algebraically identical, so
       nothing moves today — the golden master must not budge. What it buys is
       that fDq_i is now meaningful without a wing, which is the prerequisite
       for every wingless configuration.

       KNOWN DIVERGENCE, recorded not fixed: rotorcraftDragCD0() still returns
       wing-referenced coefficients, and our landing-gear term is referenced to
       Swing where NDARC gives gear no reference area. Both belong to the next
       increment. */
    const extra_i=rotorcraftDragCD0({...p,solidity:solidityEff,propDiam:propDiamEff,fusLen:fusLenEff},Swing_i);
    /* NO WING, NO WING TERM. Sww_i is not a number without a wing, so this
       product poisoned the sum below and dragAreas.total came out null on
       every rotor-borne layout -- which is why the reported total D/q read
       0.00 for the quadrotor and side-by-side. The comment further down says
       "fDq_i is now meaningful without a wing"; it was not, until this. The
       reported `wing` entry stays null (the honest value); the SUM uses 0. */
    const fDqWing_i =(Swing_i>0 && isFinite(Swing_i)) ? Cfw_i*FFw_i*Sww_i : 0;   // wing, m^2
    const fDqFus_i  =Cff_i*FFf_i*Swf_i;               // fuselage
    const fDqTail_i =Cfw_i*1.05*(Swhs_i+Swvs_i);      // horizontal + vertical tail
    const fDqNac_i  =Cfw_i*1.30*Swn_i;                // nacelles
    /* Dimensional areas straight from drag.js — no wing round-trip. */
    const fDqRotor_i=(extra_i.hubArea||0)+(extra_i.stoppedArea||0)
                    +(extra_i.gearArea||0)+(extra_i.miscArea||0);
    const fDq_i = fDqWing_i+fDqFus_i+fDqTail_i+fDqNac_i+fDqRotor_i;   // total D/q, m^2
    /* CD0 needs a reference area. With no wing there is none, and NDARC says
       so outright — "if no reference area is indicated, then the input is only
       drag area D/q". Null is the honest value; fDq_i carries the physics. */
    const CD0_i = hasWing ? fDq_i/Swing_i : null;
    dragAreasOut={ wing:(Swing_i>0 && isFinite(Swing_i)) ? +fDqWing_i.toFixed(4) : null, fuselage:+fDqFus_i.toFixed(4),
      tail:+fDqTail_i.toFixed(4), nacelles:+fDqNac_i.toFixed(4),
      rotorAndGear:+fDqRotor_i.toFixed(4), total:+fDq_i.toFixed(4) };
    /* Cruise CL is DERIVED from the wing the aircraft actually has, not asserted.
       Using p.clDesign here was circular: the wing was sized to make CL equal
       clDesign, so CDi was constant for every design. */
    /* Wing-borne: CL derived from the wing the aircraft has, induced drag from
       it, and L/D from the polar. Wingless: none of these three quantities
       exist, and the cruise efficiency is the calibrated rotor-borne value. */
    const CLcr_i=hasWing?W/(qCr_i*Swing_i):null;
    const CDi_i =hasWing?CLcr_i**2/(Math.PI*p.AR*p.eOsw):null;
    const LDact_i=hasWing?CLcr_i/(CD0_i+CDi_i):rotorborneLoD;
    /* CLOSE THE LOOP.
       LDact_i used to be computed here and then thrown away: cruise and reserve
       power were sized on the p.LD SLIDER instead. That made MTOW a restatement
       of an input the model's own aerodynamics contradicted — MTOW swung 80%
       (2133->3842 kg) across the slider range while LDact moved the other way.
       p.LD is now a TARGET shown for comparison; the physics drives the sizing.
       Set p.useTargetLD = true to restore the legacy behaviour. */
    const LDcruise_i = (p.useTargetLD===true) ? p.LD : LDact_i;
    // ── HOVER POWER at T/W=1.0 (steady hover equilibrium) ─────────────────
    // T/W ratio is a structural margin for climb/OEI — NOT applied to steady hover.
    // In hover: each rotor supports W/N (not W*TW/N). Motors sized for TW but fly at W.
    /* ── HOVER DOWNLOAD ────────────────────────────────────────────────
       The rotor wake impinges on the wing and fuselage in hover, producing a
       download the rotors must ALSO lift. The engine previously assumed thrust
       exactly equals weight, which under-predicts hover thrust and power.

       NDARC (NASA TP-20220000355, section 8-11) defines the download fraction
       as DL/T = k = (D/q)_V / A_ref, taking the wake dynamic pressure as
       q = 0.5*rho*(2*v_h)^2 = T/A_ref. Hover thrust is therefore W/(1-k).

       SOURCING: measured XV-15 tiltrotor download is 14.69% of rotor thrust,
       with 10-15% typical for tiltrotor layouts where the wing sits directly
       in the wake (NATO RTO-MP-AVT-111, "The XV-15 Tiltrotor Download
       Reduction"). A lift+cruise with boom-mounted rotors outboard of the
       wing should be LOWER, but no published value for that layout was found,
       so the default is the conservative bottom of the measured band rather
       than an invented number for this configuration. Override per design
       with p.downloadFraction; 0 restores the old no-download behaviour. */
    /* DEFAULT 0 — one honest reason remains, and one has EXPIRED.

       STILL VALID: the measured 14.69% is an XV-15 TILTROTOR with the wing
       squarely in the rotor wake. On a lift+cruise with rotors on booms fore
       and aft of the wing, far less wing area sits in the wake, so the true
       value is lower — but no published figure exists for that layout, and
       inventing one is exactly what this model should not do.

       EXPIRED (re-tested 2026-08-25): the second reason used to be that
       switching it on at 0.10 made the NASA case run away to 18,692 kg. That
       was a SYMPTOM of the wing-sizing and drag defects since corrected, not a
       property of the download. Re-measured on the current default:
           k=0.00  MTOW 3136 kg, margin 14.5%
           k=0.10  MTOW 3600 kg, margin 12.6%   closes
           k=0.1469 MTOW 4015 kg, margin 11.3%  closes  (XV-15 measured)
           k=0.20  MTOW 5195 kg, margin  8.8%   closes
       The loop now absorbs it. So the only thing blocking a non-zero default is
       the missing published value for this configuration, not stability.

       Set p.downloadFraction explicitly (0.10-0.15 for tiltrotor layouts, less
       for boom-mounted lift+cruise). The omission is surfaced in the checks. */
    /* Configuration-aware default — see DOWNLOAD_FRACTION in
       engine/configuration.js. An explicit p.downloadFraction still wins. */
    const kDL=Math.min(0.4,Math.max(0,p.downloadFraction
              ?? downloadFractionFor(cfgOut.key,cfgOut.nTilting,cfgOut.nRotors)));
    kDLout=kDL;   // exported so the CHECK reports what was APPLIED, not the raw input
    const T_hov=W/(1-kDL);                    // rotors lift weight PLUS download
    /* Re-derive the diameter at the CURRENT weight so disk loading holds at its
       configuration target instead of drifting with MTOW.

       UNDER-RELAXED, AND IT HAS TO BE. Chasing the target diameter at full step
       every iteration is its own feedback loop: D goes as sqrt(MTOW) and rotor
       mass as roughly R^1.3, so a heavier iterate buys a bigger rotor which is
       heavier again. A low-disk-loading multicopter with eighteen large rotors
       is the worst case and it DIVERGED — 3,394 kg and non-convergent, where
       the same design with the diameter iterated gently outside the loop closes
       at 2,553 kg. Half-step damping fixes it and changes nothing that already
       converged, because the fixed point is identical either way: only the path
       to it is damped.
       NOTE this is NOT the relaxation the mass-iteration note refutes further
       down. That is relaxation on MTOW itself, which was measured and does not
       help. This is relaxation on a DERIVED GEOMETRY feeding back into mass —
       a different loop with a different remedy. */
    if (sizeRotorToDL) {
      const dTarget = diamForWeight(MTOW);
      const lam = Math.min(1, Math.max(0.05, p.rotorSizingRelax ?? 0.5));
      propDiamEff = isFinite(propDiamEff) && propDiamEff > 0
        ? propDiamEff + lam * (dTarget - propDiamEff)
        : dTarget;
    }

    const DL=T_hov/(Math.PI*Math.pow(propDiamEff/2,2)*p.nPropHover);
    DL_hover_out=DL; T_hov_out=T_hov;
    /* ── SOLIDITY IS A CONSEQUENCE OF BLADE LOADING, NOT A CONSTANT ─────
       Derived here because it needs the current disk loading, which needs the
       current MTOW iterate — so it converges with the loop like everything
       else. An explicit p.solidity still wins, for anyone matching a known
       rotor. See engine/rotorgroup.js for why a fixed 0.10 put every winged
       configuration past hover stall. */
    solidityEff = p.solidity ?? designSolidity(DL, p.tipSpeed ?? 167.64,
                                p.designCTsigma ?? ctSigmaDesign.value, rhoHov);
    /* What the design ACTUALLY needed, before the buildability clamp. */
    solidityReqOut = p.solidity != null ? p.solidity
      : designSolidityRaw(DL, p.tipSpeed ?? 167.64,
                          p.designCTsigma ?? ctSigmaDesign.value, rhoHov);
    /* COAXIAL INTERFERENCE. This expression is momentum-theory induced power
       over etaHov, so a contra-rotating pair's interference multiplies it
       directly. [SRC] Yang Eq. 39 via engine/coaxial.js, which records why the
       equation is trusted over the paper's own prose. Coplanar returns 1.0, so
       nothing changes for the five other layouts or for NASA's quadrotor,
       which is coplanar. */
    kCoax = isCoaxial
      ? coaxialInterference(p.coaxThrustRatio ?? COAX_THRUST_RATIO_DEFAULT) : 1;
    /* ── TWIN SIDE-BY-SIDE OVERLAP, NDARC 12-5.1.3 ─────────────────────
       An overlapping pair projects A_p = (2-m)A, not 2A, so its induced
       velocity is higher and hover induced power is multiplied by
       sqrt(2/(2-m)). This tool applied nothing, on a recorded belief that
       whether NASA's rotors overlap was unpublished. Both NASA papers name
       the overlap as the aircraft's defining feature; only the NUMBER is
       unpublished, and that is measured off their three-view.

       It returns EXACTLY 1.0 for every non-overlapping layout, because the
       lens area vanishes at l >= 2R — NDARC's own escape clause, falling out
       of the geometry rather than being special-cased. So nothing changes for
       the other five configurations.

       HOVER ONLY, DELIBERATELY. NDARC also gives A_e = A(1+l/2R)^2 for
       forward flight, where overlap is a BENEFIT — the pair acts as one
       large-span actuator. This engine takes the side-by-side's cruise
       efficiency from NASA's published L/De = 7.20, which is a measurement OF
       that benefit on the real aircraft. Applying the cruise term as well
       would count it twice. */
    kTwin = cfgOut.key === "sideBySide"
      ? twinRotorInterference(hubSpacingFor(cfgOut.key)) : 1;
    Phov=kCoax*kTwin*(T_hov/p.etaHov)*Math.sqrt(DL/(2*rhoHov))/1000;  // hover density at the
    // vertiport, not a fixed 1.225. The MATLAB source hardcoded Density_MSL, which made
    // hover power insensitive to field elevation and ISA deviation — the two conditions
    // that size a VTOL. At sea level / ISA+0 the difference is <0.1%.
    // η_hov absorbs: non-uniform inflow, swirl losses, figure-of-merit deviation from ideal
    /* Re-derive climb/descent aerodynamics from the L/D this iteration actually
       produces, so no mission segment is driven by the slider. */
    if(p.useTargetLD!==true){
      /* ── CLIMB AND DESCENT L/D AT THEIR OWN AIRSPEEDS ─────────────────
         WAS  LDcl = LD_cruise * (1 - climbLDPenalty)  with a flat 13% derate
         and no source. That made climb aerodynamics independent of CLIMB
         SPEED, which is why the rate-of-climb slider moved almost nothing:
         climbing to a fixed altitude at a fixed angle, the Vcl in the power
         term and the Vcl in the time term cancel EXACTLY when L/D is held
         constant, so climb ENERGY came out independent of rate of climb.
         That cancellation is an artefact of the flat derate, not physics.

         A wing does not have one L/D. It has a drag polar, and the aircraft
         sits at a different point on it at every speed:
             CL = W cos(gamma) / (q S)      q = 1/2 rho V^2
             CD = CD0 + CL^2 / (pi AR e)
             L/D = CL / CD
         which is the same polar already used for cruise, evaluated at the
         climb and descent airspeeds instead of the cruise one. cos(gamma) is
         the component of weight normal to the flight path — small at these
         angles but free to include.

         Density is taken at the MID-CLIMB altitude rather than at cruise: the
         segment spans vertiport to cruise altitude, so neither end is
         representative. CD0 is carried over from the cruise evaluation — its
         Reynolds and Mach dependence over this speed range is second order
         next to the induced-drag term that actually drives the difference.

         `climbLDPenalty` is retained ONLY for the legacy path (useTargetLD) and
         for anyone who wants the old behaviour back via p.flatClimbPenalty. */
      const hMid   = Math.max(0,(hvtol+p.cruiseAlt)/2);
      const rhoMid = atm.isa(hMid).rho;
      const polarLD = (V,gammaDeg) => {
        const q  = 0.5*rhoMid*V*V;
        if(!(q>0)||!(Swing_i>0)) return LDcruise_i;
        const CL = W*Math.cos(gammaDeg*Math.PI/180)/(q*Swing_i);
        const CD = CD0_i + CL*CL/(Math.PI*p.AR*p.eOsw);
        return CD>0 ? CL/CD : LDcruise_i;
      };
      LDcl = p.flatClimbPenalty===true
        ? LDcruise_i*(1-(p.climbLDPenalty ?? 0.13))
        : polarLD(Vcl,clAng);
      desAng = (p.descentAngle!=null&&p.descentAngle>0)
        ? p.descentAngle
        : Math.atan(1/LDcruise_i)*180/Math.PI;
      Vdc    = p.vCruise;                            // AIAA-2023-0548, see above
      RoD    = Vdc*Math.sin(desAng*Math.PI/180);     // rate is the consequence
      /* Descent uses its OWN speed on the same polar. The descent ANGLE is
         still derived from the CRUISE L/D rather than from LDdc, deliberately:
         desAng -> Vdc -> LDdc -> desAng is a fixed point, and adding an inner
         iteration here to chase a second-order angle change is not worth the
         convergence risk. Documented rather than hidden. */
      LDdc = p.flatClimbPenalty===true ? LDcl : polarLD(Vdc,-desAng);
      DescR  = climbHeight/Math.tan(desAng*Math.PI/180);   // above the FIELD — see above
      CruiseRange = p.range*1000-missionHops*(ClimbR+DescR)-reserveDistM;
    }
    Pcl=(W/p.etaSys)*(RoC+Vcl/LDcl)/1000;
    /* Wing-borne: aerodynamic L/D, so eta is the FULL chain incl. propeller.
       Rotor-borne: NASA's EFFECTIVE L/De already contains the propulsive term,
       so eta here is battery-to-shaft only. Using etaSys on both double-counts
       propulsive efficiency on the wingless layouts — see the note above. */
    const etaCr_i = hasWing ? p.etaSys : etaRotorborne;
    Pcr=(W/etaCr_i)*(p.vCruise/LDcruise_i)/1000;   // uses the COMPUTED L/D (see above)
    /* ── DESCENT POWER, AND THE SILENT REGENERATION CREDIT ──────────────
       Pdc = (W/eta)(-RoC + Vdc/LDdc) goes NEGATIVE whenever the aircraft's
       glide angle is shallower than the descent angle flown — i.e. it has more
       lift-to-drag than the descent needs, so it would accelerate unless drag
       is added or energy is taken out. At the default that is -57 kW, and it
       was being summed straight into Etot as a -3.1 kWh CREDIT against the
       mission. Nothing said so.

       Recovering that energy means driving the motors as generators from
       windmilling rotors. It is physically possible and some eVTOL concepts
       claim it, but it is NOT standard in sizing practice, the recovery
       efficiency is not the propulsive efficiency, and crediting it makes the
       battery smaller — an OPTIMISTIC bias in the one direction this tool
       must not lean. Default is therefore NO credit: descent power floors at
       zero, and the aircraft is assumed to dissipate the excess. Opt in with
       p.regenDescent = true, and note that etaSys is then the wrong efficiency
       to apply. */
    const PdcRaw=(W/p.etaSys)*(-RoD+Vdc/LDdc)/1000;   // RoD, not the climb rate
    Pdc = p.regenDescent===true ? PdcRaw : Math.max(0,PdcRaw);
    PdcRawOut=PdcRaw; regenCreditKW=Math.max(0,-PdcRaw);
    Pres=(W/etaCr_i)*(Vres/LDcruise_i)/1000;       // same eta split as cruise above
    // Takeoff/landing hover times — matches MATLAB: Vertical_Takeoff/Landing_Time = hvtol/0.5
    /* ── HOVER ALLOWANCE ────────────────────────────────────────────────
       Was hoverHeight/0.5 — a vertical transit at 0.5 m/s, giving 30.5 s at the
       default height. That is not what a sizing mission charges for. The NASA
       UAM primary sizing mission (Johnson & Silva, Aeronautical Journal 126(1295)
       2022, section 5) specifies:
         "(1) 2-min hover out-of-ground-effect (OGE) for takeoff; (2) fly 50 nm
          at best-range speed; (3) 2-min hover OGE for landing"
       i.e. 120 s each, covering the vertical transit PLUS vertiport manoeuvring,
       hold and positioning. At 30.5 s the model charged 3.9x too little hover,
       and hover is the highest-power segment in the mission. */
    /* ── HEADWIND ────────────────────────────────────────────────────────
       Power is set by AIRSPEED, distance is covered at GROUND SPEED. A headwind
       stretches every forward-flight segment in time without reducing its
       power, so the energy penalty is the ratio V_air/V_ground. This was
       missing entirely. NASA's UAM design mission specifies it:
         "carrying six passengers over a 75 nm range (with 10 kt headwind), and
          20 min cruise reserve"
       At 83 kt cruise a 10 kt headwind is a ~14% cruise-energy penalty. */
    /* ── THE CLIMB AND DESCENT GROUND SPEEDS ARE HORIZONTAL COMPONENTS ──
       The principle above is right and was applied to the wrong number.
       Vcl and Vdc are AIRSPEEDS ALONG THE FLIGHT PATH — Vcl is defined as
       RoC/sin(gamma), which is the speed of an aircraft moving up the
       slope. The distance ClimbR is HORIZONTAL. Dividing the one by the
       other treated the along-path speed as though it were the ground
       speed, which made every climb and descent 1/cos(gamma) too quick:
       0.38% on the 5 degree climb and 0.60% on the descent.

       The ground speed of a climbing aircraft is the horizontal
       component of its airspeed, less the headwind.

       THE TEST THAT SHOWS IT IS RIGHT is that the climb time now reduces
       to the textbook result. With no wind,

         tcl = ClimbR / (Vcl cos g)
             = (h / tan g) / (Vcl cos g)
             = h / (Vcl sin g)
             = h / RoC

       time to climb is height over rate of climb, which is what it
       should always have been. Cruise is level, so cos(0) = 1 and the
       cruise ground speed is unchanged.

       WHAT THIS DOES NOT FIX, and it is a separate question: under a
       headwind this model still defines the climb by the still-air
       ground distance ClimbR, so the aircraft takes longer to cover it
       and therefore climbs past the altitude it was aiming at. Making
       the climb terminate on HEIGHT instead would change ClimbR, and so
       change CruiseRange and the range accounting. That is a larger
       change than this one and is not made here. */
    const vWind=Math.max(0,p.headwindMS??0);
    const gsCr=Math.max(1,p.vCruise-vWind);
    const gsCl=Math.max(1,Vcl*Math.cos(clAng*Math.PI/180)-vWind);
    const gsDc=Math.max(1,Vdc*Math.cos(desAng*Math.PI/180)-vWind);
    /* Every per-hop segment is charged `missionHops` times — see the note at
       the CruiseRange definition. Cruise is NOT multiplied: the total cruise
       distance is fixed and merely split between the hops. */
    tto=(p.hoverTimeTakeoffS??HOVER_S_DEFAULT)*missionHops; tcl=missionHops*ClimbR/gsCl;
    tcr=Math.max(0,CruiseRange/gsCr);
    tdc=missionHops*DescR/gsDc; tld=(p.hoverTimeLandingS??HOVER_S_DEFAULT)*missionHops; tres=tres_s;
    Eto=Phov*tto/3600;  // matches MATLAB: E_to = P_hover * Vertical_Takeoff_Time / 3600
    Ecl=Pcl*tcl/3600; Ecr=Pcr*tcr/3600;
    Edc=Pdc*tdc/3600;
    Eld=Phov*tld/3600; Eres=Pres*tres/3600;
    /* NASA's reserve is a MINIMUM of two criteria, not just the time-based one:
       "(4) fuel/energy reserve minimum of 10% of mission or 20-min flight at
        best-endurance speed (V_be)". Only the 20-min form was modelled, so a
       long mission could be under-reserved. Take the larger. */
    const Emission=Eto+Ecl+Ecr+Edc+Eld;
    const EresPct=(p.reservePctMission??0.10)*Emission;
    Eres=Math.max(Eres,EresPct);
    Etot=Emission+Eres;
    /* ── EMPTY WEIGHT ───────────────────────────────────────────────────
       'fraction' (default, legacy): Wempty = ewf · MTOW — ewf is an input,
                  so MTOW is largely a restatement of that guess.
       'buildup':  geometry-driven component sum, converging with the loop.
       Both are kept so the two can be compared side by side in validation. */
    if(p.weightModel==="buildup"){
      // Geometry this iteration — reuse the values already computed for drag
      const Ct_i=Cr_i*p.taper;
      const sweepLE_i=hasWing?Math.atan((Cr_i-Ct_i)/(bW_i/2))*180/Math.PI:0;
      const Xac_i=Cr_i-MAC_i+0.25*MAC_i;
      const xACwing_i=fusLenEff*(p.wingLEfrac??0.2589)+Xac_i;
      const lv_i=Math.max(0.5,fusLenEff*0.88-xACwing_i);
      // V-tail panel area at this MTOW (same relations used after the loop)
      const gam_i=p.vtGamma*Math.PI/180;
      const cos2_i=Math.max(1e-3,Math.cos(gam_i)**2), sin2_i=Math.max(1e-3,Math.sin(gam_i)**2);
      /* No wing to reference a tail volume to, and NDARC 2-7 gives a
         multicopter nTail=0 outright. */
      const Shr_i=hasWing?p.vtCh*Swing_i*MAC_i/lv_i:0;
      const Svr_i=hasWing?p.vtCv*Swing_i*bW_i/lv_i:0;
      const Svtp_i=Math.max(Shr_i/(2*cos2_i),Svr_i/(2*sin2_i));
      /* TAIL WEIGHT MUST FOLLOW THE TAIL THAT IS ACTUALLY BUILT. This is the
         weight the sizing loop converges on, so if it kept costing a V-tail
         while the aircraft carried a fin and a stabilator, MTOW would settle
         on a tail the tool does not draw. Same Raymer form, applied per
         surface at its own aspect ratio. */
      const convTail_i = (p.tailType ?? cfgOut?.capabilities?.tailType ?? "vee") === "conventional";
      const ARfin_i = p.finAR ?? 1.103, ARstab_i = p.stabAR ?? 2.50;
      const vFrac_i = p.ventralOverFin ?? (0.2533 / 0.8392);
      const wS_i = (S, AR) => 0.036 * S * Math.pow(AR, 0.25) * 0.82 * 1000 / 9.81;
      const Sven_i = Svr_i * (vFrac_i / (1 + vFrac_i));
      const Wvt_i = convTail_i
        ? wS_i(Svr_i - Sven_i, ARfin_i) + wS_i(Shr_i, ARstab_i)
          + wS_i(Sven_i, p.ventralAR ?? 4.282)
        : 2*(0.036*Svtp_i*Math.pow(p.vtAR,0.25)*0.82*1000/9.81);
      /* THE WEIGHT MODEL SIZES TO THIS AIRCRAFT'S OWN LOAD CASES. Evaluated per
         iteration at the current MTOW and wing, so the gust case - which
         depends on wing loading - converges with the design rather than being
         read off a constant. At convergence this is the same call as the
         post-loop lcase below; validation/load-factor-source.mjs checks that. */
      const alf_i=airframeLoadFactors(p, hasWing
        ? loadCases(p,{MTOW, Swing:Swing_i, MAC:MAC_i, rho:rhoCr, rho0:1.225,
                       CLaW, vCruise:p.vCruise})
        : null);
      const cw=componentWeights({...p,solidity:solidityEff,propDiam:propDiamEff,fusLen:fusLenEff,fusDiam:fusDiamArea},{
        MTOW, Swing:Swing_i, bWing:bW_i, MAC:MAC_i, sweepLE_deg:sweepLE_i,
        nzUltimate:alf_i.nUltimate,
        lv:lv_i, Wvt:Wvt_i, rhoCr, vCruise:p.vCruise,
        Phov, nRotors:p.nPropHover, Pcr, Thov:T_hov, packSystems:packSysPrev,
        WbatPrev,
        rhoHov, hasWing,
      });
      sizeCondOut=cw.sizingConditions; nzWeightsOut=cw.nzUltimateUsed; PmotInstalledOut=cw.PmotInstalledKW; cruiseRatingKWOut=cw.cruiseRatingKW ?? 0; motorTauOut=cw.motorTorqueNm ?? 0; motorExtrapOut=!!cw.motorModelExtrapolated;
      /* ── THE GUARD MUST NOT BE SILENT ────────────────────────────────
         This falls back to the ewf fraction whenever the buildup returns
         something non-finite or heavier than the aircraft. That protection is
         right — a bad buildup should not poison convergence — but it was
         SILENT, and silent substitution is how a tool lies.

         Caught by the NASA benchmark: both wingless cases reported
         `weightModel: "buildup"` while returning Wempty = 0.5 x MTOW to the
         last decimal, i.e. the fraction model. Heavier motors then changed the
         propulsion group and did not move MTOW at all, which is impossible and
         was the tell. The buildup was being computed, discarded, and reported.

         Now counted and flagged. A design that ends on the fallback is a design
         whose component buildup does not close, and the user must be told. */
      const cwOK = isFinite(cw.total) && cw.total>0 && cw.total<MTOW;
      /* Track the LAST iteration separately from the COUNT. A fallback early in
         the march is normal — the loop starts from a guess, and a buildup that
         exceeds a small starting MTOW says nothing about the converged design.
         Reporting `weightBuildupUsed:false` for that raised a false alarm on
         NASA's lift+cruise, and the message compounded it by printing the
         early-iteration total (785.9 kg) against the FINAL MTOW (3,565 kg),
         which reads as a collapse and is really two different iterations.
         What matters is whether the CONVERGED iteration used the buildup. */
      if(!cwOK){ buildupFallbacks++; lastFallbackTotal=cw.total; }
      lastIterFellBack = !cwOK; lastIterMTOW = MTOW;
      Wempty = cwOK ? cw.total : ewf*MTOW;
      weightGroups=cw.groups; groupSumsOut=cw.groupSums; gearOut=cw.gearDetail; avOut=cw.avionicsDetail;
      driveOut=cw.driveDetail; rotorOut=cw.rotorDetail; fcOut=cw.fcDetail; boomOut=cw.boomDetail;
    } else {
      Wempty=ewf*MTOW;
      weightGroups=null;
    }
    // Battery C-rate derating: SED drops at high discharge rates (hover peaks 3–5C)
    // Approximate: SED_eff = sedCell × (1 - cRateDerate); default 8% for ~3-4C hover
    /* ── SPECIFIC-ENERGY BASIS ──────────────────────────────────────────
       `sedCell` is a CELL-level number, and three deratings are stacked on it
       (C-rate, usable-SoC window, pack efficiency) to reach usable pack energy.
       Published eVTOL figures are often quoted the other way. NASA states
       theirs as already-net: "an installed, usable battery specific energy of
       400 Wh/kg (pack)" and "values for pack, not cell" (Johnson & Silva 2022
       section 4.1). Entering that number with the cell-level deratings active
       would double-count them — 400 would become 268 Wh/kg usable.
       `sedBasis:"packUsable"` says the figure is ALREADY net and suppresses
       all three, so the number the user typed is the number that sizes the
       pack. Default stays "cell" so existing designs are unchanged.
       (The NASA reference entry achieves the same thing explicitly by setting
       cRateDerate 0, socMin 0, etaBat 1.0 — this just makes it declarable.) */
    const packUsable=p.sedBasis==="packUsable";
    const sedEff=packUsable?p.sedCell:p.sedCell*(1-(p.cRateDerate??0.08));
    sedEffOut=sedEff; packUsableOut=packUsable;
    const socFloor=packUsable?0:p.socMin;
    /* ── BATTERY EFFICIENCY APPLIES TO VERTICAL FLIGHT, NOT THE WHOLE
           MISSION ────────────────────────────────────────────────────────
       This engine divided the ENTIRE mission energy by etaBat. NASA does not,
       and the reason is physical rather than conventional.

       [SRC] "Exploration of Design Drivers for the RVLT Lift+Cruise Reference
       Aircraft" (corpus S3270), describing the battery model in NASA's own
       Rotorcraft Sizing Tool:

         "A final parameter included in the battery model is a battery
          efficiency term that is applied during a HIGH-POWER DEMAND STATE.
          Under a high-power demand, such as a vertical flight state (hover or
          vertical climb/descent), the voltage drop is more significant,
          requiring greater current to maintain a fixed power level. This
          increase in current, and therefore energy usage, during vertical
          flight segments is accounted for by the battery efficiency term. The
          battery efficiency term is NOT APPLIED during forward or edgewise
          flight segments in RST. The default value for the battery efficiency
          term in RST is 90%."

       The mechanism is internal resistance, and both NASA reference-vehicle
       papers state it the same way -- Johnson & Silva 2022 sec.4.1 and Antcliff
       2019: "Internal resistance reduces battery efficiency AT HIGH DISCHARGE
       RATES." It is a RATE-dependent loss, so charging it against cruise, which
       is not a high-rate state, is not conservatism but a category error.

       MEASURED ON THIS AIRCRAFT, which is what justifies importing NASA's
       scoping rather than merely copying it: hover runs 3.83C and cruise 1.38C
       -- a 2.8x difference in discharge rate. Johnson & Silva add that cell
       currents "must be limited to 2-3C for good battery life", so hover sits
       above that band and cruise well below it. One flat penalty across both is
       the wrong shape.

       COST OF THE OLD FORM: it charged +11.1% on mission energy where the
       sourced convention charges +0.72%, i.e. it inflated the pack by about
       10%.

       WHY NOT MODEL IT PROPERLY FROM THE EQUIVALENT CIRCUIT? Because that is
       what NDARC does (Theory sec.28: "E_batt = E_comp + P_loss, and the
       battery efficiency is eta_batt = E_comp/E_batt", solved from internal
       resistance and discharge current against its Table 28-1 open-circuit
       voltage curve) and it needs cell IR data this engine does not carry.
       Deriving it would mean inventing that data. The binary form is NASA's own
       simplification and it is VALIDATED, not merely assumed: in S3270 the RST
       model using this 90% reproduced the full NDARC sizing to 0.1% on gross
       weight (8820 lb vs 8810 lb), and the paper notes battery high-power
       efficiency was "the only RST input available to tune the model" and that
       no tuning was needed.

       `etaBatScope:"mission"` restores the old whole-mission form for
       comparison. */
    const etaBatRaw=packUsable?1:p.etaBat;
    const vertOnly=(p.etaBatScope??"verticalOnly")!=="mission";
    /* Vertical-flight energy: the hover segments. The climb segment is a
       FORWARD climb at climbAngle, not a vertical one, so it is not included --
       if a vertical-climb segment is ever added it belongs here. */
    const Evert=vertOnly?(Eto+Eld):Etot;
    EvertOut=Evert;
    /* One effective efficiency, so every downstream battery convention stays
       consistent with the one that sized the pack. Splitting the division
       across call sites is how this file previously ended up with four
       different battery conventions. */
    const Ereq=(Etot-Evert)+Evert/Math.max(1e-6,etaBatRaw);
    const etaB=Ereq>0?Etot/Ereq:etaBatRaw;
    etaBatEffOut=etaB;
    // Dual-constraint battery sizing — matches MATLAB: Wbattery = max(W_E, W_P)
    // W_E: energy limit  — exact (1-SoCmin) form, not (1+SoCmin) approximation
    // W_P: power limit   — W_P = P_hover / SP_battery
    const WE=Etot*1000/((1-socFloor)*sedEff*etaB); WE_out=WE;
    /* ── BATTERY SPECIFIC POWER ─────────────────────────────────────────
       Was a bare `p.spBattery || 1.0` inlined in four places: no default, no
       documentation, no constants entry, no source — yet it can become the
       BINDING constraint and then drives a weight-growth runaway, because
       P_hover grows as W^1.5 while W_P grows linearly in P_hover.

       Specific power is not a free constant. It is set by the chemistry's
       specific energy and the discharge rate it can sustain:
           SP [kW/kg] = SED [Wh/kg] x C_max [1/h] / 1000
       Hover on an eVTOL runs about 3-5C, which is the same discharge regime
       cRateDerate already models on the energy side — so deriving SP this way
       makes the two sides of the battery model consistent instead of letting
       one be a magic number. */
    const maxCRate=p.maxCRate??4.0;                     // hover discharge, 3-5C
    spBattery=p.spBattery??(sedEff*maxCRate/1000);      // kW/kg
    const WP=Phov/Math.max(0.05,spBattery); WP_out=WP;
    Wbat=Math.max(WE,WP);
    EpackSizeOut=Etot;
    if(isTE){
      /* The generator supplies what the pack would have: the motors' draw is
         the same, only its source changes. The pack is resized to the
         engine-out emergency, and the engine, generator and fuel tank join
         the empty mass; the fuel carried joins the take-off mass below. */
      teOut=sizeTurboelectric({Phov,Pcl,Pcr,Pdc,Pres,Emission,Eres},
                              {sedEff,socFloor,etaB:etaBatRaw},{},
        /* Conversion runs the lifters and the pusher together ("operating the
           pusher for X-force is a desirable trade" in transition, Silva et al.
           2018 p.13), and NASA's turboshaft rating equals the sum of the motor
           ratings (Table 3: 1152 hp against 8 x 88 + 446 = 1150). */
        { installedHoverKW:(PmotInstalledOut??0)*(p.nPropHover??0)+(cruiseRatingKWOut??0),
          installedCruiseKW:cruiseRatingKWOut??0,
          lapseHover:referredLapse(atmHov), lapseCruise:referredLapse(atmCr) });
      Wbat=teOut.batteryKg;
      EpackSizeOut=teOut.emergencyEnergyKWh;
      const teKg=teOut.engineKg+teOut.generatorKg+teOut.tankKg;
      Wempty+=teKg;
      if(weightGroups) weightGroups={...weightGroups,
        turboshaft:teOut.engineKg,generator:teOut.generatorKg,fuelTank:teOut.tankKg};
      if(groupSumsOut) groupSumsOut={...groupSumsOut,propulsion:groupSumsOut.propulsion+teKg};
      WfuelOut=teOut.fuelKg;
    }
    /* ── PACK SYSTEMS, INSIDE THE LOOP ──────────────────────────────────
       BTMS + BMS + tray + containment is ~6% of pack mass, and at a 13.5%
       closure margin that is not a rounding error: adding it as a post-loop
       correction would understate MTOW by hundreds of kg. The pack
       architecture depends only on Etot, which is known here, so the whole
       chain closes inside the iteration. Uses this pass's value for the NEXT
       pass, which converges with the outer loop like every other coupling. */
    {
      const Vc_=3.6, Ah_=5.0, Vp_=800;
      const Ns_=Math.round(Vp_/Vc_);
      /* CONTINUOUS, deliberately — no Math.ceil here. The post-loop pack
         architecture rounds Np to whole cells, but rounding inside the loop
         makes R_int jump discretely, which makes pack-systems mass jump, which
         made the sizing loop limit-cycle between two states and never meet
         tolerance. Same discrete-feedback trap as the wing positioner. The
         integer count is recovered after convergence for reporting. */
      /* The pack's architecture follows what the pack is sized for: the
         mission (battery) or the emergency landing (turboelectric), in which
         case it carries no current in cruise. */
      const Epk_=isTE?teOut.batteryCapacityKWh:Etot;
      const Np_=Math.max(1,(Epk_*1000/Vp_)/Ah_);
      const PV_=Ns_*Vc_, Ri_=0.030*Ns_/Np_;
      const Qh_=(Phov*1000/PV_)**2*Ri_, Qc_=isTE?0:(Pcr*1000/PV_)**2*Ri_;
      const bt_=batteryThermal(p,{Wbat,PackkWh:Epk_,Pheat:Qh_,PheatCruise:Qc_,
        Nseries:Ns_,Ncells:Ns_*Np_,
        tHoverS:(p.hoverTimeTakeoffS??HOVER_S_DEFAULT)+(p.hoverTimeLandingS??HOVER_S_DEFAULT)});
      packSysPrev=isFinite(bt_.mass)&&bt_.mass>0?bt_.mass:0;
      WbatPrev=isFinite(Wbat)&&Wbat>0?Wbat:0;
    }
    const mn=p.payload+Wempty+Wbat+(isTE?WfuelOut:0);
    const residual=Math.abs(mn-MTOW);
    energyH.push(+Etot.toFixed(3)); mtowH.push(+mn.toFixed(2));
    residualH.push(residual);
    if(residual<tolFor(MTOW)){MTOW=mn;r2Converged=true;break;}
    /* DIVERGENCE GUARD — the weight-growth spiral.
       If empty-weight fraction plus battery fraction approach 1, MTOW runs away
       and every downstream number becomes Infinity/NaN, which then renders as
       garbage across the whole UI. A sizing tool must say "this design does not
       close" rather than quietly emit Infinity. Keep the last finite MTOW so
       callers still have something to display alongside the flag. */
    /* ── THE CEILING MUST MEAN SOMETHING ──────────────────────────────
       This was a bare 20,000 kg, and that is how the tool came to print
       "19,718 kg" for a FOUR-PASSENGER URBAN AIR TAXI. Twenty tonnes is
       roughly a Chinook. It is not a number any reader should ever be shown
       for this class of aircraft, and a guard set out there lets the spiral
       grind through a dozen meaningless iterations before admitting defeat.

       The class HAS a defined ceiling. EASA SC-VTOL-01 applies to a
       person-carrying VTOL aircraft in the SMALL CATEGORY: a passenger seating
       configuration of 9 or fewer and a maximum certificated take-off mass of
       3,175 kg (7,000 lb) or less. [SRC] For scale, the heaviest all-electric
       vehicle in NASA's published UAM concept set is the lift+cruise at
       ~4,300 kg. [SRC NASA/TM-20210017971 Table 12]

       So the guard trips at TWICE the certification ceiling. A design past
       6,350 kg is not merely a heavy eVTOL — it has left the regulatory
       category it was being sized for, and every further iterate is noise.
       Raise p.mtowCeilingKg deliberately to size something outside the class;
       it is a parameter, not a wall. */
    if(!isFinite(mn)||mn>mtowCeiling){ r2Diverged=true; mtowCeilingHit=true; break; }
    /* ── RELAXATION ON THE MASS ITERATION ────────────────────────────────
       This loop is a plain successive substitution, MTOW_{n+1} = G(MTOW_n),
       taken at full step. NDARC's own solution procedure does NOT do that.
       Johnson, NDARC Theory (NASA TP-20220000355) section 5-2.1, verbatim:

         "A direct iteration is simply x_{n+1} = G(x_n), but |G'| > 1 for many
          practical problems. A relaxed iteration uses F = (1-lambda)x + lambda*G:
              x_{n+1} = (1-lambda) x_n + lambda G(x_n)
          ... so a value of lambda can be found to ensure convergence for any
          finite G'."

       NDARC applies relaxation to W_MTO specifically, and runs two nested
       successive-substitution loops (outer on performance: engine power or
       rotor radius; inner on parameters: W_D, W_MTO, P_DSlimit, energy
       capacity, T_design).

       DEFAULT IS 1.0 — full step, i.e. exactly the previous behaviour, so the
       golden master is untouched.

       MEASURED RESULT, 2026-08-26 — RELAXATION DOES NOT HELP HERE. DO NOT
       RETRY IT. Swept lambda = 1.0 / 0.5 / 0.25 / 0.1 against the fraction
       model at ewf 0.46 / 0.48 / 0.50 / 0.55 / 0.60. NOTHING converged at any
       lambda; smaller lambda only slows the climb (ewf 0.50: 19,092 kg in 75
       iterations at lambda 1, 6,702 kg still rising at the 200-iteration cap
       at lambda 0.1). On the DEFAULT buildup model it is strictly harmful —
       98 iterations at lambda 1, 199 at 0.5, and it fails to converge at 0.25.

       The reason matters, because it is the whole answer to "why does fraction
       blow up": a REPELLING fixed point (|G'| > 1) and a fixed point that DOES
       NOT EXIST are different failures. Relaxation fixes only the first.
       Above ewf ~0.455 on this mission there is no root at all —
       MTOW(1-ewf) = payload + Wbat(MTOW) has no crossing, because Wbat grows
       with mission energy faster than (1-ewf)*MTOW grows. No solver can find a
       solution that is not there.

       WHAT WOULD ACTUALLY IMPROVE THIS is bracketing, not relaxation. Ugwueze
       et al., Aerospace 2023, 10, 311 (doi 10.3390/aerospace10030311) note the
       bisection method "can quickly rule out a bad set of initial design
       parameters because a solution would conform to the desired bounds, for
       example, sizing an aircraft within the bounds of a regulatory limit such
       as the maximum mass for the aircraft category". This engine already has
       exactly that bound. (That bound is SC-VTOL-01's 3,175 kg MCTOM; an
       earlier version of this note called it "the SC-VTOL 5,700 kg check",
       which was wrong on both counts — 5,700 kg is the CS-23 aeroplane
       boundary, not SC-VTOL, and SC-VTOL small category is 3,175 kg.)
       A bracketed search over [payload, ceiling] PROVES non-closure and says so,
       instead of spending 200 iterations climbing to a number that means
       nothing. IMPLEMENTED BELOW as the fixed-point -> secant hybrid. */

    /* ══ HYBRID SOLVER — fixed-point, then secant, bisection as the net ══
       Ugwueze, Statheros, Horri, Bromfield & Simo, "An Efficient and Robust
       Sizing Method for eVTOL Aircraft Configurations in Conceptual Design",
       Aerospace 2023, 10, 311. They name this exact problem — "the airframe
       mass models can only estimate a component mass when supplied with the
       total mass of the aircraft ... the implicit problem of a circular
       dependency" — and compare bisection, fixed-point and Newton-Raphson on
       it. Their conclusion, and the design used here:

         - fixed-point and bisection are STABLE but slow; NR is fast but
           "highly sensitive to the initial guess ... a poorly defined starting
           point could lead to divergence and oscillations";
         - so run a stable method first, then switch: "within the first five
           iterations, the bisection and fixed-point methods brought the
           residual error down to 5% of the final-sized mass. Within this
           narrowed range, the NR method was guaranteed to converge";
         - the hybrids are "over 70% improvement in compute time".

       PHASE 1 is the existing fixed-point step, kept because it is what makes
       a poor starting guess safe. PHASE 2 is the secant form of NR — NDARC
       does the same thing, evaluating f' "by numerical perturbation" rather
       than analytically (Theory 5-2.2), and here the two previous iterates
       supply that difference for free, so the derivative costs no extra
       sizing evaluation at all.

       BISECTION IS THE GUARANTEED FALLBACK, not the primary method: it is used
       only when a bracket exists AND the secant step leaves it or goes
       non-finite. That is the same shape as engine/wingPosition.js, which had
       to learn this lesson separately when plain fixed-point two-cycled.

       f(MTOW) = G(MTOW) - MTOW, where G is one pass of the whole sizing. */
    const fCur=mn-MTOW;

    /* Maintain a bracket whenever consecutive residuals straddle zero. */
    if(fPrev!=null && isFinite(fPrev) && isFinite(fCur) && fPrev*fCur<0){
      brLo=Math.min(xPrev,MTOW); brHi=Math.max(xPrev,MTOW);
    }

    /* NON-CLOSURE WITHIN THE CERTIFIABLE RANGE. f > 0 means "the aircraft must
       be heavier than this". If that is still true at the category weight
       limit, no design in [payload, limit] closes — which is a far more useful
       statement than an 18,000 kg number, and it is exactly the use Ugwueze et
       al. give for bracketing: ruling out a bad parameter set against "a
       regulatory limit such as the maximum mass for the aircraft category".
       Reported, NOT used to stop: designs above 5,700 kg are still legitimate
       to size, they simply are not SC-VTOL. */
    if(MTOW>=certLimit && fCur>0) noSolutionBelowCertLimit=true;

    const relax=Math.min(1,Math.max(0.05,p.sizingRelaxation??1.0));
    const fixedPointNext=()=>(1-relax)*MTOW+relax*mn;

    let next;
    /* SWITCH-POINT: only once the residual is inside 5% of current mass. The
       paper OBSERVES that the stable phase reaches 5% within about five
       iterations; it does not switch ON the iteration count. Forcing the switch
       at iteration 5 regardless was tried here and it is strictly worse —
       the default design went from converging in 94 iterations to not
       converging at all, because a secant slope taken while still far from the
       root is meaningless. Switch on the residual, never on the counter. */
    const withinSwitch=Math.abs(fCur)<=(p.solverSwitchFrac??0.05)*Math.max(1,MTOW);
    const useHybrid=p.solver!=="fixed-point" && !secantDisabled;
    if(useHybrid && withinSwitch && xPrev!=null && isFinite(fPrev) && fPrev!==fCur){
      const denom=fCur-fPrev;
      const step=fCur*(MTOW-xPrev)/denom;
      const cand=MTOW-step;
      const inBracket=(brLo==null)||(cand>brLo&&cand<brHi);
      if(isFinite(cand)&&cand>0&&cand<20000&&inBracket){
        next=cand; solverPhase="secant"; secantSteps++;
      }else if(brLo!=null){
        next=0.5*(brLo+brHi); solverPhase="bisection"; bisectSteps++;
      }else{
        next=fixedPointNext();
      }
      /* STALL GUARD — AND THE REASON IT IS NEEDED, which is specific to this
         engine. A secant/Newton step assumes f is smooth. The buildup model's
         f is NOT: the feedback path contains DISCRETE component selection —
         the landing-gear tyre is chosen from a rated-load table, the airfoil
         from a section list, the motor transient column from a rotor-count
         bracket. Each of those makes f a step function of MTOW, and a
         difference quotient taken across a step is garbage.
         This is the FOURTH discrete-feedback problem in this project (the pack
         Math.ceil limit cycle, the wing positioner two-cycling, the cached
         evals counter). The lesson has been learned three times: when an
         iteration misbehaves here, look for a rounding or a table lookup in
         the feedback path before blaming the step size.
         So: if the residual grows across secant steps, stop using them. */
      if(Math.abs(fCur)>=Math.abs(fPrev)) secantStalls++; else secantStalls=0;
      if(secantStalls>=(p.solverStallLimit??1)){ secantDisabled=true; solverPhase="fixed-point (secant stalled on discrete feedback)"; }
    }else{
      next=fixedPointNext();
    }

    /* ── BOUND THE SEARCH, WHICH IS THE WHOLE POINT OF BRACKETING ──────
       The divergence guard above tests the CLOSURE ESTIMATE `mn`, never the
       STEP. So the iterate itself could walk far past the ceiling before the
       guard noticed, and the run then reported that iterate — which is how a
       four-passenger air taxi came back as 10,710 kg (and, on the old 20,000 kg
       guard, as 19,718 kg).

       Ugwueze et al. 2023 name the remedy in the sentence already quoted
       above: bisection "can quickly rule out a bad set of initial design
       parameters ... for example, sizing an aircraft within the bounds of a
       regulatory limit such as the maximum mass for the aircraft category".
       So the search is CONFINED to [payload, ceiling]. Stepping out of that
       range is not a bigger aeroplane, it is proof that no root exists inside
       the category — report that, and keep the last in-range iterate rather
       than an out-of-range one. */
    if(!isFinite(next)||next>mtowCeiling){ r2Diverged=true; mtowCeilingHit=true; break; }
    xPrev=MTOW; fPrev=fCur;
    MTOW=next;
  }
  /* If the loop ran out of iterations without meeting tolerance, the design did
     not close. Reporting the last iterate as though it were a converged answer
     is how a sizing tool produces confident nonsense — an 18,000 kg "result"
     that is really a runaway weight spiral. Flag it. */
  if(!r2Converged) r2Diverged=true;

  const Mach=p.vCruise/aCr;

  /* Wing */
  const Lreq=MTOW*g0, qCr=0.5*rhoCr*p.vCruise**2;
  /* A wingless configuration has no wing geometry to report. Zeros rather than
     NaNs, so the UI and the checks have something defined to read, and so that
     "no wing" is visibly different from "wing of unknown size". */
  const wingSize=hasWing?wingArea(p,Lreq,qCr):{Swing:0,driver:"no wing — rotor-borne configuration",S_ws:0,S_cl:0};
  const Swing=wingSize.Swing;
  const WL=hasWing?Lreq/Swing:0, bWing=hasWing?Math.sqrt(p.AR*Swing):0;
  const CLcruise=hasWing?Lreq/(qCr*Swing):null;
  const Cr_=2*Swing/(bWing*(1+p.taper)),Ct_=Cr_*p.taper;
  const MAC=(2/3)*Cr_*(1+p.taper+p.taper**2)/(1+p.taper);
  const Ymac=(bWing/6)*(1+2*p.taper)/(1+p.taper);
  const Xac=Cr_-MAC+0.25*MAC;
  const sweep=Math.atan((Cr_-Ct_)/(bWing/2))*180/Math.PI;  // LE sweep: semi-span in denominator
  const Re_=rhoCr*p.vCruise*MAC/muCr;

  /* Airfoil selection — table and scoring rule live in engine/airfoils.js */
  const {afScored,selAF}=selectAirfoil(p,Re_,CLcruise);

  /* Drag (Raymer) */
  const Sww=2*Swing*(1+0.25*p.tc*(1+p.taper*0.25));
  const fL=fusLenEff,fD=fusDiamArea;
  const lambda_f=fL/fD;  // fineness ratio
  /* THE SAME HELPER THE LOOP USES. This open-coded Raymer Eq 12.31, whose
     (1 - 2/lambda) term is negative below fineness 2.0 and returns NaN from
     Math.pow at a fractional exponent -- so CD0f below went NaN on any winged
     body that blunt. constants.js switches to a spheroid under fineness 2.5
     for exactly that reason and line 627 already called it; this did not. */
  const Swf=fuselageWettedArea(fL,fD);
  // Tail wetted areas: fixed fractions of wing area (conceptual estimate only)
  // NOT dynamically sized — real tail sizing uses volume coefficients and moment arm
  const Swhs=2*Swing*0.18, Swvs=2*Swing*0.12;
  // Nacelle wetted area: proportional to rotor radius² (not fixed arbitrary constants)
  // S_wet_nac ≈ N_rot × K_nac × π × R² where K_nac≈0.10 (nacelle/fairing ≈ 10% of disk area)
  const Swn=p.nPropHover * 0.10 * Math.PI * Math.pow(propDiamEff/2, 2);
  const Refus=rhoCr*p.vCruise*fL/muCr;
  // Schlichting turbulent flat-plate Cf with Karman-Schlichting compressibility correction
  // ASSUMPTION: fully turbulent flow everywhere — laminar regions neglected (conservative;
  // real eVTOL wings may have 20-40% laminar run → actual Cf could be 10-20% lower)
  // Component-specific roughness effects neglected (same Cf formula for all surfaces)
  const Cfw=0.455/Math.log10(Re_)**2.58/(1+0.144*Mach**2)**0.65;
  const Cff=0.455/Math.log10(Refus)**2.58/(1+0.144*Mach**2)**0.65;
  // Wing form factor — Raymer §12.5: FF = (1 + 0.6/(x/c)*t/c + 100*(t/c)⁴) × 1.05
  // x/c = chordwise position of max thickness ≈ 0.30 (NACA 4-digit series default)
  // NOTE: fully turbulent assumption — laminar flow effects neglected (conservative)
  const xc_maxthick = 0.30;   // position of max thickness; 0.30 for NACA 4-digit, ~0.40 for 6-series
  const FFw=(1+(0.6/xc_maxthick)*p.tc+100*p.tc**4)*1.05;  // Raymer Eq 12.35
  const FFf=1+60/(fL/fD)**3+(fL/fD)/400;
  const CD0w=Cfw*FFw*Sww/Swing,CD0f=Cff*FFf*Swf/Swing;
  const CD0h=Cfw*1.05*Swhs/Swing,CD0v=Cfw*1.05*Swvs/Swing;
  const CD0n=Cfw*1.30*Swn/Swing;
  // Landing gear drag: eVTOL with retractable/folding gear uses CD0g ≈ 0.003
  // Raymer Table 12.6: fixed gear = 0.015; retractable = 0.003; fully faired = 0.001
  // Winged lift+cruise eVTOL (Joby, Archer) use folding/retractable gear → 0.003
  const dragExtra=rotorcraftDragCD0({...p,solidity:solidityEff,propDiam:propDiamEff,fusLen:fusLenEff},Swing);   // same helper the loop uses
  const CD0g=dragExtra.gear;      // Raymer Table 12.6, by gear type
  const CD0hub=dragExtra.hub;     // NDARC hub drag, referenced to disk area
  const CD0blade=dragExtra.stopped;// NDARC stopped-blade drag
  const CD0m=dragExtra.misc;
  /* Every CD0 term above is null without a wing to reference it to. The drag
     itself is not null — it lives in dragAreas as a dimensional D/q. */
  const CD0tot=hasWing?(CD0w+CD0f+CD0h+CD0v+CD0n+CD0g+CD0hub+CD0blade+CD0m):null;
  // Induced drag — Oswald efficiency method (Raymer §12.6)
  // NOTE: rotor-wing aerodynamic interference not modelled (can add 5-15% to CDi for eVTOL)
  // Non-planar lift effects (winglets, distributed lift) also neglected
  const CDi=hasWing?CLcruise**2/(Math.PI*p.AR*p.eOsw):null;
  const CDtot=hasWing?CD0tot+CDi:null;
  /* Wing-borne aircraft: L/D from the polar. Rotor-borne: the CALIBRATED
     effective L/De — see the note at rotorborneLoD. It is deliberately the same
     value the loop sized with, so the reported figure and the sizing figure
     cannot drift apart. */
  const LDact=hasWing?CLcruise/CDtot:rotorborneLoD;

  /* Stability — corrected per Raymer §12 & §16 */
  // CG positions: wing structural CG at 40% MAC (Raymer §15), not at AC (25% MAC)
  // Avionics CG scales with fusLen (18% ≈ forward instrument bay), not hardcoded 0.8 m
  /* ── WING LONGITUDINAL POSITION ──────────────────────────────────────────
     Was a bare 0.2589 x fuselage length, appearing twice with no explanation.
     In real aircraft design this is not a constant — the wing is POSITIONED to
     put the CG at the intended fraction of MAC ahead of the neutral point.
     Freezing it means static margin is whatever falls out, rather than a
     design outcome. It is now a parameter (default unchanged so existing
     designs are unaffected), and the engine also solves for the position that
     would achieve p.targetSM — see wingLEfracForTargetSM below. */
  const wingLEfrac=p.wingLEfrac??0.2589;
  /* CG from real component masses at real stations — see engine/cg.js.
     Replaces the old block, which put fuselage + motors + "other" (78% of
     empty weight) all at the single station 0.42*fL, and invented a mass split
     that contradicted the engine's own Raymer weight buildup. */
  const cg=componentCG({...p,__caps:cfgOut?.capabilities,hasBoomsResolved:cfgOut?.hasBooms},{fL,MAC,wingLEfrac,MTOW,Wempty,Wbat:Wbat+WfuelOut},weightGroups);
  const xCGempty=cg.xCGempty, xCGtotal=cg.xCGtotal;
  const xCGwing=cg.xWing, xCGbat=cg.xBat, xCGpay=cg.xPay;
  const xACwing=fL*wingLEfrac+Xac;
  // FIX 1.5: tail moment arm = tail AC to wing AC, not fuselage tip to wing AC
  // Tail AC is at ~88% fusLen (same reference used for V-tail arm lv below)
  const lh=fL*0.88-xACwing;           // FIX 1.5: was fL-xACwing (too long by ~0.12*fL)
  const Sh=Swing*0.18;
  // FIX 1.1: CLa finite-wing — Raymer Eq. 12.6 (subsonic, sweep≈0)
  // Old formula 2π(1+0.77·t/c) is a 2D thickness correction, not finite-wing slope
  // CLaW (Raymer Eq.12.6) is defined once, above the sizing loop, which needs it too.
  // FIX 1.2: downwash gradient — use correct CLaW in dε/dα = 2·CLα/(π·AR)
  // (Anderson Eq.5.39 for elliptic wing; CLaW now the correct finite-wing value)
  const dw=2*CLaW/(Math.PI*p.AR);
  /* ── NEUTRAL POINT ───────────────────────────────────────────────────────
     Standard form (e.g. Virginia Tech AOE3134 vehicle pitch stability notes;
     Raymer §16):
         x_np = x_ac_w + eta_h (S_h/S_w) (CL_ah/CL_aw) (1 - de/da) l_h
     The engine previously omitted the LIFT-CURVE-SLOPE RATIO CL_ah/CL_aw,
     implicitly treating a low-aspect-ratio tail as if it were as effective per
     unit area as the wing. At the defaults (wing AR 9, V-tail AR 2.5) that
     ratio is 0.60, so the tail contribution was overstated by ~67% — and in
     the STABILISING direction, i.e. reported static margin was optimistic.

     NOW MODELLED — slender-body (Munk) theory. Caughey, "Introduction to
     Aircraft Stability and Control", Cornell M&AE 5070, Eq. (2.33):

         Cm_alpha,fuse = 2 * V / (S * MAC)      per radian

     where V is the volume of the EQUIVALENT fuselage — the body with the same
     planform but circular cross-sections. The derivation (Eq. 2.30-2.32) is
     that slender-body theory puts positive lift on the forward fuselage and
     negative lift aft, summing to ZERO net lift but a pure couple, so the
     moment is independent of reference point. Caughey states the sign
     explicitly: "Note that this is always positive - i.e., destabilizing."

     Converting a moment slope to a neutral-point shift: SM = -Cm_alpha/CL_alpha
     and SM = (xNP - xCG)/MAC, so a destabilising Cm_alpha moves the neutral
     point FORWARD by

         dxNP = -Cm_alpha,fuse * MAC / CL_alpha,wing

     [LAY] the equivalent volume. The engine carries only fuselage length and
     diameter, so V = prismatic * (pi/4) * d^2 * L with prismatic = 0.60 for a
     streamlined body — a shape assumption, not a sourced value, and it is the
     only invented number here. It is deliberately on the LOW side: a smaller
     volume gives a smaller destabilising term, so the static margin stays
     conservative in the direction the check used to warn about. Override with
     p.fusPrismatic, or supply p.fusVolumeM3 directly. */
  const CLaH=2*Math.PI*p.vtAR/(2+Math.sqrt(p.vtAR**2+4));   // tail slope, same Raymer Eq.12.6
  const tailSlopeRatio=CLaH/CLaW;
  const etaH=0.9;                                           // tail dynamic-pressure ratio
  const fusPrism=Math.min(1,Math.max(0.3,p.fusPrismatic??0.60));
  const fusVol=Math.max(0,p.fusVolumeM3
    ?? fusPrism*(Math.PI/4)*Math.pow(fusDiamArea??0,2)*(fusLenEff??0));
  const CmaFus=(Swing>0&&MAC>0)?2*fusVol/(Swing*MAC):0;     // per rad, POSITIVE = destabilising
  const dxNPfus=(CLaW>0)?-CmaFus*MAC/CLaW:0;                // metres, NEGATIVE = forward
  const xNP=xACwing+(Sh/Swing)*tailSlopeRatio*etaH*(1-dw)*lh+dxNPfus;
  const SM=(xNP-xCGtotal)/MAC;

  /* ── WING PLACEMENT AS A DESIGN OUTCOME ──────────────────────────────────
     Standard practice is to position the wing so the CG sits a chosen fraction
     of MAC ahead of the neutral point, rather than to accept whatever margin a
     fixed wing station happens to produce. This re-evaluates the CG/NP chain
     as a function of wing leading-edge station and reports the station that
     would deliver p.targetSM (default 15% MAC, mid-band of the 5-25% check).

     Everything upstream of the wing station — wing area, MAC, weights — is
     unchanged by moving the wing, so only the CG and NP need re-evaluating.
     Scanned rather than bisected because SM need not be monotonic in station:
     moving the wing aft carries the CG aft AND shortens the tail arm. */
  const smAtWingStation=(frac)=>{
    const xACw=fL*frac+Xac;
    const cg_=componentCG({...p,__caps:cfgOut?.capabilities,hasBoomsResolved:cfgOut?.hasBooms},{fL,MAC,wingLEfrac:frac,MTOW,Wempty,Wbat:Wbat+WfuelOut},weightGroups);
    const xCGt=cg_.xCGtotal;
    const lh_=fL*0.88-xACw;
    const xnp=xACw+(Sh/Swing)*tailSlopeRatio*etaH*(1-dw)*lh_;
    return {sm:(xnp-xCGt)/MAC, xCG:xCGt, xNP:xnp, lh:lh_};
  };
  const targetSM=p.targetSM??0.15;
  let wingLEfracForTargetSM=null, bestErr=Infinity;
  for(let f=0.05;f<=0.70;f+=0.0005){
    const r=smAtWingStation(f);
    if(r.lh<=0.2) continue;                       // tail arm must stay physical
    const e=Math.abs(r.sm-targetSM);
    if(e<bestErr){bestErr=e; wingLEfracForTargetSM=+f.toFixed(4);}
  }
  if(bestErr>0.01) wingLEfracForTargetSM=null;    // target unreachable at this geometry
  const wingStationSM=wingLEfracForTargetSM!=null
    ? +smAtWingStation(wingLEfracForTargetSM).sm.toFixed(4) : null;

  /* ══════════════════════════════════════════════════
     V-TAIL SIZING  (Ruscheweyh / Raymer method)
     Each panel set at dihedral angle Γ from horizontal.
     Two panels replace H-stab + V-stab.
     Longitudinal (pitch) control  →  ruddervators act as elevator
     Lateral     (yaw)   control  →  ruddervators act as rudder
     ══════════════════════════════════════════════════ */
  const vtGamma_deg=p.vtGamma;                         // dihedral angle (°)
  const vtGamma=vtGamma_deg*Math.PI/180;               // radians

  // Equivalent H-tail and V-tail areas needed (from conventional sizing via Cv, Ch)
  const Ch=p.vtCh;      // horizontal tail volume coefficient (typical 0.35–0.50)
  const Cv=p.vtCv;      // vertical   tail volume coefficient (typical 0.04–0.06)
  // lv: tail moment arm = (tail AC pos.) − (wing AC pos.)
  // Tail AC ≈ fuselage tail − 0.25×MAC_vt; use 0.88×fL as tail-AC proxy
  // (accounts for tail root chord = ~12% fL, V-tail positioned at fuselage end)
  const lv=fL*0.88-xACwing;  // tail moment arm (corrected for tail panel chord offset)
  const bv_est=bWing;   // reference span for Cv
  const Sh_req=Ch*Swing*MAC/lv;                    // required H-tail area (m²)
  const Sv_req=Cv*Swing*bv_est/lv;                 // required V-tail area (m²)

  // ── Correct V-tail aerodynamics (Ruscheweyh / Raymer §6.3) ──────────────
  // A V-tail panel inclined at dihedral Γ generates a force NORMAL to its surface.
  // With TWO panels (left + right), combined pitch and yaw stiffness:
  //   Pitch: 2 × S_panel × cos²Γ × lv = Sh_req × lv  → S_panel = Sh_req / (2·cos²Γ)
  //   Yaw:   2 × S_panel × sin²Γ × lv = Sv_req × lv  → S_panel = Sv_req / (2·sin²Γ)
  //
  // Panel sizing: size to the harder constraint at the chosen Γ:
  //   S_panel = max(Sh_req/(2cos²Γ), Sv_req/(2sin²Γ))
  //   Svt_total = 2 × S_panel = max(Sh_req/cos²Γ, Sv_req/sin²Γ)
  //
  // Sh_eff (total pitch-effective area from both panels) = 2 × S_panel × cos²Γ
  // Sv_eff (total yaw-effective  area from both panels) = 2 × S_panel × sin²Γ
  //
  // Minimum-area optimal angle: Sh_req/(2cos²Γ) = Sv_req/(2sin²Γ)
  //   → tan²Γ = Sv_req/Sh_req  → Γ_opt = arctan(√(Sv_req/Sh_req))
  // ─────────────────────────────────────────────────────────────────────
  // Optimal dihedral — minimises total panel area. Sv_req and Sh_req are the
  // CONVENTIONAL equivalent areas from Cv and Ch, which do not depend on the
  // dihedral, so this is well defined and not circular.
  const vtGamma_opt_deg=Math.atan(Math.sqrt(Sv_req/Sh_req))*180/Math.PI;

  /* ── SIZE THE TAIL AT THE ANGLE WE DRAW IT ─────────────────────────────
     This optimum was computed, reported, and used ONLY by the geometry
     module to draw the tail - the sizing kept the user's 45 deg. So the tool
     sized one V-tail and drew a different one, and every tail mass and area
     it reported belonged to neither picture.

     Using it in both places is free and is worth more than free: it drops the
     V-tail from 46.1% to 36.9% of wing area, which lands on NASA's own built
     aircraft - RAVEN 39.4%, SWFT 36.4% - arrived at independently, since the
     angle comes from OUR Cv/Ch and theirs came from a tape measure. MTOW
     falls slightly (2837 -> 2816 kg) because the tail is smaller.

     `autoVtGamma:false` restores the fixed angle for anyone who wants to
     impose one. */
  const gammaUsed = (p.autoVtGamma === false || !isFinite(vtGamma_opt_deg))
    ? vtGamma : vtGamma_opt_deg * Math.PI / 180;
  const cos2=Math.cos(gammaUsed)**2, sin2=Math.sin(gammaUsed)**2;

  // Required panel area at the chosen Γ — divide by 2 (both panels share the load)
  const Svt_panel_pitch=Sh_req/(2*cos2);   // one panel needed to satisfy pitch
  const Svt_panel_yaw  =Sv_req/(2*sin2);   // one panel needed to satisfy yaw
  const Svt_panel=Math.max(Svt_panel_pitch, Svt_panel_yaw); // governing constraint
  const Svt_total=2*Svt_panel;             // both panels combined

  // Actual combined effectiveness from both panels
  const Sh_eff_vee=2*Svt_panel*cos2;   // total pitch-effective area
  const Sv_eff_vee=2*Svt_panel*sin2;   // total yaw-effective  area


  // Panel geometry (Raymer): assume AR_vt = 2.5, taper 0.4, NACA 0009
  const AR_vt=p.vtAR;
  const taper_vt=0.4;
  const bvt_panel=Math.sqrt(AR_vt*Svt_panel);               // panel span
  const Cr_vt=2*Svt_panel/(bvt_panel*(1+taper_vt));
  const Ct_vt=Cr_vt*taper_vt;
  const MAC_vt=(2/3)*Cr_vt*(1+taper_vt+taper_vt**2)/(1+taper_vt);
  const sweep_vt=Math.atan((Cr_vt-Ct_vt)/(bvt_panel/2))*180/Math.PI;  // LE sweep: semi-span

  // Ruddervator sizing: control surface = 25–35% of panel chord
  const ruddervator_chord_frac=0.30;
  const Srv=ruddervator_chord_frac*Svt_panel;   // ruddervator area per panel

  // Tail weight estimate (Roskam UAV method, % of empty weight)
  const Wvt_panel=0.036*Svt_panel*Math.pow(AR_vt,0.25)*0.82*1000/9.81; // simplified Raymer eq 15.26
  const Wvt_total=2*Wvt_panel;

  /* ══ CONVENTIONAL TAIL — RAVEN'S OWN ARRANGEMENT ═══════════════════════
     NEITHER RAVEN HAS A V-TAIL. Both carry a vertical fin and an all-moving
     stabilator (plus a ventral fin on v01_003), and this engine already has
     everything needed to size them: Sh_req and Sv_req above ARE the areas a
     conventional tail needs, and the V-tail block exists only to fold them
     onto two panels.

     THE TOTAL AREA IS UNCHANGED, which is why this is not a re-sizing. At the
     optimal dihedral tan^2(gamma) = Sv_req/Sh_req, so

         Svt_total = Sh_req/cos^2 = Sh_req (Sh_req+Sv_req)/Sh_req = Sh_req + Sv_req

     exactly. The V-tail spends the same area; it just spends it on surfaces
     that are each only partly effective in each axis. Splitting them makes
     BOTH fully effective, so pitch_ratio and yaw_ratio become 1.000 and the
     max() penalty — where the governing constraint over-sizes the other axis
     — disappears.

     Aspect ratios and stations are RAVEN's, measured on both vehicles and
     agreeing to 0.1% on fin AR and 0.4% on stabilator station. The AREAS stay
     this aircraft's own; using RAVEN's percentages would draw NASA's tail. */
  const tailConventional = (p.tailType ?? cfgOut?.capabilities?.tailType ?? "vee") === "conventional";
  const AR_fin = p.finAR ?? 1.103;      // [SRC] RAVEN both vehicles
  const AR_stab = p.stabAR ?? 2.50;     // [SRC] RAVEN mean of 2.361 / 2.635
  /* ── NO VENTRAL FIN BY DEFAULT, AND THE EVIDENCE SAYS WHY ────────────
     ONLY ONE OF THE TWO RAVENS HAS ONE. v01_003 carries a Ventral Fin (and a
     Dorsal Fin and Strakes); SWFT carries a Vertical Stabilizer and a
     Horizontal Stabilator and nothing else. Every other constant taken from
     these aircraft rests on the two of them AGREEING — fin aspect ratio to
     0.1%, stabilator station to 0.4%, sponson lateral station to 0.1%. The
     ventral fin has no such agreement, and this file does not adopt a station
     or a shape that only one vehicle supports.

     It also failed a physical test when it was drawn: at the span its aspect
     ratio implies it reached 0.54 m BELOW the wheels, and had to be clamped
     against the ground to be drawable at all. A surface that only fits after
     being cut down was never sized by anything.

     So the yaw area goes where SWFT puts it — entirely on the fin. Setting
     p.ventralOverFin restores it for anyone substantiating against v01_003. */
  const ventralFrac = p.ventralOverFin ?? 0;   // v01_003 only: 0.2533/0.8392

  /* Fin carries the yaw area; the ventral fin is part of it, not extra, so
     the FIN proper is reduced by the ventral share rather than the aircraft
     growing a surface it was not sized for. */
  const Sv_fin_total = Sv_req;
  const Sv_ventral = Sv_fin_total * (ventralFrac / (1 + ventralFrac));
  const Sv_fin = Sv_fin_total - Sv_ventral;
  const Sh_stab = Sh_req;

  const panelGeom = (S, AR, tap) => {
    const b = Math.sqrt(Math.max(1e-9, AR * S));
    const cr = 2 * S / (b * (1 + tap));
    const ct = cr * tap;
    return { S, AR, b, cr, ct,
      mac: (2 / 3) * cr * (1 + tap + tap * tap) / (1 + tap),
      sweep: Math.atan((cr - ct) / (b / 2)) * 180 / Math.PI };
  };
  /* A fin is a HALF surface — its span is its height, so AR = b^2/S applies
     to the single panel. The stabilator is a full-span surface like a wing. */
  const finG = panelGeom(Sv_fin, AR_fin, taper_vt);
  const stabG = panelGeom(Sh_stab, AR_stab, taper_vt);
  const ventG = panelGeom(Sv_ventral, p.ventralAR ?? 4.282, taper_vt);

  /* Same Raymer form the V-tail used, applied to each surface at its own
     aspect ratio, so the comparison is like for like. */
  const wSurf = (S, AR) => 0.036 * S * Math.pow(AR, 0.25) * 0.82 * 1000 / 9.81;
  const Wfin = wSurf(Sv_fin, AR_fin);
  const Wstab = wSurf(Sh_stab, AR_stab);
  const Wventral = wSurf(Sv_ventral, p.ventralAR ?? 4.282);
  const Wtail_conv = Wfin + Wstab + Wventral;

  /* ── WHICH TAIL THE REST OF THE ENGINE SEES ────────────────────────────
     A conventional tail's surfaces are each FULLY effective in their own
     axis, so the effective areas are the required ones and both ratios are
     exactly 1. The V-tail's are not: whichever constraint governs forces the
     other axis oversize, which is the max() above. Everything downstream —
     neutral point, static margin, the wing-borne modes in wingmodes.js — is
     written against Sh_eff and Sv_eff, so selecting here is all that is
     needed and no consumer has to know which tail it is looking at. */
  const Sh_eff = tailConventional ? Sh_stab : Sh_eff_vee;
  const Sv_eff = tailConventional ? Sv_fin_total : Sv_eff_vee;
  const pitch_ratio = Sh_eff / Sh_req;
  const yaw_ratio   = Sv_eff / Sv_req;

  /* On a V-tail this is the ruddervator's combined pitch+yaw load factor. On
     a conventional tail the elevator and rudder are separate surfaces and do
     not share authority, so it is exactly sqrt(2) and carries no information;
     it is still reported so the two tails can be compared on one axis. */
  const ruddervator_combined_auth=Math.sqrt(pitch_ratio**2+yaw_ratio**2);

  // Drag contribution of V-tail (Raymer component buildup)
  const Swvt=2*Svt_panel*(1+0.25*0.09*(1+taper_vt*0.25)); // wetted area (NACA 0009 → tc=0.09)
  const Revt=rhoCr*p.vCruise*MAC_vt/muCr;
  const Cfvt=0.455/Math.log10(Revt)**2.58/(1+0.144*Mach**2)**0.65;
  const FFvt=(1+0.6/0.3*0.09+100*0.09**4)*1.05;
  const CD0vt=Cfvt*FFvt*Swvt/Swing;

  // Updated NP with correct V-tail pitch contribution (cos²Γ component)
  const eta_vt=0.90;
  // NP shift: only the pitch-effective component (Sh_eff = S_panel·cos²Γ) moves NP aft
  /* Same lift-curve-slope ratio correction as the baseline NP above. */
  /* The fuselage destabilising term applies to BOTH neutral-point estimates —
     it is a property of the airframe, not of which tail model is being used.
     Adding it only to the baseline xNP left the two disagreeing by ~15 points
     of MAC, with the feasibility check reading one number and the results panel
     the other. Same dxNPfus as above; see the Munk derivation there. */
  const xNP_vt=xACwing+(Sh_eff/Swing)*tailSlopeRatio*eta_vt*(1-dw)*lv+dxNPfus;
  const SM_vt=(xNP_vt-xCGtotal)/MAC;

  // Ruddervator symmetric (elevator) deflection for pitch trim at cruise
  // δ_e_equiv = δ_rv × cos(Γ)  → δ_rv = δ_e_equiv / cos(Γ)
  const CM_ac=selAF.CM;
  const delta_e_equiv=-(CM_ac*Swing*MAC)/(eta_vt*Sh_eff*lv);   // equivalent elevator rad
  const delta_rv_rad=delta_e_equiv/Math.cos(vtGamma);           // ruddervator deflection rad
  const delta_rv_deg=delta_rv_rad*180/Math.PI;

  // Ruddervator differential (rudder) deflection for yaw trim (β=2° sideslip estimate)
  const CY_beta=-0.30;  // typical side-force derivative
  const beta_trim=2*Math.PI/180;
  const delta_yaw_rv_deg=(CY_beta*beta_trim*Swing)/(2*Sv_eff/lv)*180/Math.PI*(-1);

  /* Propulsion */
  const Ttot=MTOW*g0*TW,Trotor=Ttot/p.nPropHover,Protor_W=Phov*1000/p.nPropHover;
  const TW_hover=TW;
  const TW_cruise=(Pcr*p.etaSys*1000)/(p.vCruise*MTOW*g0);
  // Rotor geometry: use user-set propDiam directly — Drotor IS propDiam.
  // Previously Adisk was back-computed from T³/(2ρP²) which is circular and gave a
  // different (larger) diameter than the slider. propDiam drives DL and Phov; Drotor = propDiam.
  const Rrotor=propDiamEff/2, Drotor=propDiamEff;
  const Adisk=Math.PI*Rrotor**2;
  /* ── TWO DISK LOADINGS, kept distinct ────────────────────────────────────
     They are NOT interchangeable and conflating them was an error:
       DL_hover     = T_hover/(N·A)      thrust to hold the aircraft up.
                      This is what published figures mean. NASA's 15.1 lb/ft²
                      for the lift+cruise concept is at design gross weight.
       DLrotor      = T_installed/(N·A)  = DL_hover × (T/W). The disk loading
                      at the INSTALLED thrust the motors are sized for.
     Comparing DLrotor against a published hover figure overstates it by the
     whole T/W ratio — 30% at the default 1.3. Power loading likewise must pair
     hover thrust with hover power, not installed thrust with hover power. */
  const DLrotor=Trotor/Adisk;                      // installed-thrust disk loading
  const DL_hover=DL_hover_out||(MTOW*g0/Adisk/p.nPropHover);
  const PLrotor=(T_hov_out/p.nPropHover)/(Protor_W/1000);   // N per kW, both at hover
  const aMSL_=Math.sqrt(GAM*Rgas*T0eff);                      // sound speed at actual SL temp (ISA deviation corrected)
  const vi_ind=Math.sqrt(Trotor/(2*rhoHov*Adisk));            // induced velocity uses actual hover density
  /* ── TIP SPEED — now a design variable, was hardcoded at Mtip 0.58 ──────
     Tip speed is the strongest single lever on rotor noise (tonal roughly
     Vtip^2-3, BPM broadband Vtip^5), and quiet eVTOL designs choose it
     deliberately. Hardcoding Mtip 0.58 (~197 m/s) both removed the designer's
     main noise lever and sat well above real practice:
        NASA UAM concepts    450 ft/s = 137.2 m/s (quadrotor, side-by-side)
                             550 ft/s = 167.6 m/s (lift+cruise, tiltwing)
                             — Johnson & Silva 2022, Table 3
        Joby S4 (measured)   955 rpm on 2.9 m props, tip Mach 0.4 = 145 m/s
     Default is NASA's lift+cruise value. Override with p.tipSpeed (m/s). */
  const TipSpd=p.tipSpeed??167.64;                            // 550 ft/s, NASA lift+cruise
  const Mtip_design=TipSpd/aMSL_;
  const TipMach=TipSpd/aCr;                                   // Mach at cruise altitude (for compressibility check)
  const RPM=TipSpd/Rrotor*60/(2*Math.PI);                    // RPM from correct Omega=Vtip/R

  // ── FIX: sigma hardcoded 0.10 → computed from actual blade geometry ──
  // Global solidity: sigma = B*c/(pi*R) where c = chord, B = blade count
  // Using p.propDiam from user slider; Nbld = 3 (structural default, matches BEM tab)
  /* Blade count — was hardcoded 3. It sets blade passage frequency and, through
     it, where the A-weighting curve bites. Real eVTOL practice runs higher:
     Joby uses 5-bladed high-solidity props specifically to allow lower tip
     speed (Joby/NASA acoustic design papers). Override with p.nBlades. */
  const Nbld=Math.max(2,Math.round(p.nBlades??3));
  /* Design solidity is now a parameter shared with engine/drag.js and
     engine/rotorgroup.js — it was hardcoded 0.10 in two separate places. */
  const solidityDesign=solidityEff;
  const ChordBl=(solidityDesign*Math.PI*Rrotor/Nbld);   // chord from design solidity
  const sigma=Nbld*ChordBl/(Math.PI*Rrotor);   // back-computed (= 0.10, now explicit)
  const BladeAR=Rrotor/ChordBl;
  /* ── MOTOR POWER SIZING ────────────────────────────────────────────────
     Continuous rating keeps the inherited 1.15x margin on hover power (still
     unsourced — flagged in the traceability matrix).
     PEAK is now sized to the published transient requirement instead of an
     invented 1.5x on top of that. See engine/motor.js for NASA Table 4 and
     the caveat that ships with it. */
  const motorReq=motorTransientRequirement(p);
  const PmotKW=Protor_W/1000*1.15;
  const PhovPerRotorKW=Protor_W/1000;
  const PpeakKW=PhovPerRotorKW*motorReq.factor;
  const PpeakLegacyKW=PmotKW*1.50;      // what the old model would have given
  const Torque=PmotKW*1000/(RPM*Math.PI/30),MotMass=PmotKW/5.0;

  /* Battery */
  /* Turboelectric: the pack is sized for the emergency, so its architecture
     and specific energy follow that capacity, not the mission energy. */
  const EpackArch=isTE?teOut.batteryCapacityKWh:Etot;
  const SEDpack=EpackArch*1000/Wbat,Vcell=3.6,Ahcell=5.0,Vpack=800;
  const Nseries=Math.round(Vpack/Vcell),PackAhReq=EpackArch*1000/Vpack;
  const Npar=Math.ceil(PackAhReq/Ahcell),PackV=Nseries*Vcell,PackAh=Npar*Ahcell;
  const Ncells=Nseries*Npar;
  // FIX: PackkWh from Wbat (ground truth), not integer cell count
  /* ── PACK ENERGY MUST USE THE SAME CONVENTION THAT SIZED THE PACK ────
       WAS  PackkWh = Wbat * p.sedCell * p.etaBat / 1000
       which applies etaBat and the RAW sedCell, while the sizing loop applies
       cRateDerate, the usable-SoC window AND etaBat — or, under
       sedBasis:"packUsable", suppresses all three. So this was a FOURTH battery
       convention in an engine already flagged for using socMin three different
       ways, and the two disagreed by exactly etaBat.

       The visible damage: on a wingless run with sedBasis "packUsable" the
       sizing produced a 746 kg pack holding 298.5 kWh usable, and this line
       reported 268.6 kWh — 10% low. That made "Pack >= Mission E" fail
       (268.6 >= 298.5 is false) and dragged final SoC to -11.1%. TWO of the
       multicopter's three check failures were this one line.

       PackkWh is now the USABLE energy on the sizing's own terms, so
       "Pack >= Mission E" is a true statement about the design rather than a
       comparison between two different definitions. Nameplate energy is
       reported separately as PackInstalledkWh — they are different quantities
       and conflating them is what caused this. */
  const sedEffPack = sedEffOut ?? p.sedCell;
  const socFloorPack = packUsableOut ? 0 : p.socMin;
  /* The EFFECTIVE efficiency the sizing actually used, not the raw input --
     reporting the raw one here would reintroduce the convention mismatch this
     block was written to remove. */
  const etaBPack = packUsableOut ? 1 : etaBatEffOut;
  /* THREE DIFFERENT ENERGIES, NAMED SEPARATELY. Conflating them is what caused
     the original defect, and my own first fix conflated two of them the other
     way round, which made the SoC check tautological.
       PackkWh        TOTAL energy at the derated specific energy — spans the
                      whole state-of-charge range. This is what a residual-SoC
                      question is asked against.
       PackUsablekWh  the part the mission may actually spend, i.e. total minus
                      the reserved SoC window. This is what "does the pack cover
                      the mission" is asked against.
       PackInstalledkWh  nameplate at the derated SED before pack efficiency. */
  const PackkWh = Wbat*sedEffPack*etaBPack/1000;                 // TOTAL
  const PackUsablekWh = PackkWh*(1-socFloorPack);                // spendable
  const PackInstalledkWh = Wbat*sedEffPack/1000;                 // nameplate
  /* Turboelectric: zero net battery flow in hover and cruise, which is how
     NASA reports it ("Hover C-rate 0.0", TM-20210017971 Table 12). */
  const CrateHov=isTE?0:(Phov*1000/PackV)/PackAh,CrateCr=isTE?0:(Pcr*1000/PackV)/PackAh;
  const Rint=0.030*Nseries/Npar,Pheat=(Phov*1000/PackV)**2*Rint;
  /* Cruise ohmic heat — the SUSTAINED case, which is what sizes the cooling
     loop. Hover is hotter but short enough that pack thermal mass absorbs much
     of it; cruise runs for the whole leg. */
  const PheatCruise=(Pcr*1000/PackV)**2*Rint;
  const btms=batteryThermal(p,{Wbat,PackkWh,Pheat,PheatCruise,Nseries,Ncells,
    tHoverS:(p.hoverTimeTakeoffS??HOVER_S_DEFAULT)+(p.hoverTimeLandingS??HOVER_S_DEFAULT)});

  /* Performance */
  const Vstall=Math.sqrt(2*WL/(rhoCr*selAF.CLmax));
  /* The manoeuvre limit this design is flown to - the same number the load
     cases and the drawn envelope use. VA was `Vstall*sqrt(3.5)`, a seventh
     copy of the proposal, so a user who set the SC-VTOL 2.0 floor still got a
     manoeuvre speed for 3.5 g. A thrust-borne layout's limit is its installed
     capability, floored (Vstall is zero there, so VA is too). */
  const nManPos=hasWing?manoeuvreLimits(p).pos:thrustBorneLimitFactor(p);
  const nManNeg=manoeuvreLimits(p).neg;
  const VA=Math.min(Vstall*Math.sqrt(nManPos),p.vCruise); // VA = VS sqrt(n), capped at VC
  const VD=p.vCruise*1.25;
  /* ── LIMIT LOAD FACTORS: MINIMA ARE CERTIFIED, THE CAPS ARE A PROPOSAL ──
     EASA MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2200(f), verbatim:
       "The positive load factor is not less than 2.0 and the negative limit
        manoeuvring load factor is not less than -0.5."
     and its Note: "An absolute maximum positive and negative limit
     manoeuvring load factor may be proposed for acceptance by EASA".
     The envelope is capped at THIS design's manoeuvre limits (loadcases.js
     manoeuvreLimits: the user's proposal, 3.5 / -1.5 when unset, floored at
     the MOC's minima). The caps used to be local literals 3.5 / -1.5 that no
     setting could move.

     THE GUST ENVELOPE IS CITABLE, AND THIS COMMENT USED TO SAY IT WAS NOT.
     It read "MOC VTOL.2215 ... carries no discrete gust velocity", and drew
     none on that basis. False: MOC SC-VTOL Issue 2, MOC VTOL.2215(f), gives
     9.14 m/s (30 ft/s) up to VD, 15.24 m/s (50 ft/s) up to VH/VNE and, for
     Category Enhanced, 20.12 m/s (66 ft/s) up to VB - quoted verbatim in
     engine/loadcases.js, which has used them to size the wing all along.
     (MOC VTOL.2135's "exact values of the gusts are currently not defined" is
     the HANDLING-QUALITIES MOC, a different question.) The gust lines are
     attached to vnBasis below, once the load cases exist. */
  const NZ_LIMIT_POS_MIN = SC_VTOL_N_LIMIT_FLOOR, NZ_LIMIT_NEG_MIN = SC_VTOL_N_NEG_FLOOR;
  const vnData=Array.from({length:60},(_,i)=>{
    const v=VD*1.1*i/59;
    /* The manoeuvre boundary is set by CL_MAX, not by the cruise design CL.
       Using clDesign (0.55) here understated the envelope by ~3x. */
    const CLmax=p.clMaxWing??1.5;
    return {v:+v.toFixed(1),nPos:+Math.min(0.5*rhoCr*v**2*CLmax/WL,nManPos).toFixed(3),
      nNeg:+Math.max(-0.5*rhoCr*v**2*0.8*CLmax/WL,nManNeg).toFixed(3)};
  });
  const vnBasis = {
    limitPosMin: NZ_LIMIT_POS_MIN, limitNegMin: NZ_LIMIT_NEG_MIN,
    capPos: nManPos, capNeg: nManNeg,
    capsMeetMinima: nManPos >= NZ_LIMIT_POS_MIN && nManNeg <= NZ_LIMIT_NEG_MIN,
    /* Filled in after the load cases are evaluated, further down. */
    gustEnvelope: null, gustBasis: null, gustLines: [],
  };

  /* Range-payload */
  const Efl_design=Etot-Eto-Eld;
  // ── PAYLOAD-RANGE CURVE (3-segment eVTOL model) ──────────────────────────
  // Segment A: max payload → design point (reduce payload, can't add battery yet — MTOW limited)
  // Segment B: design → ferry range (reduce payload, add battery weight to freed mass)
  // Segment C: payload=0 (ferry) — flat at max range
  // For fixed-MTOW eVTOL: all freed payload weight → battery (same MTOW)
  /* ONE CONVENTION. This block previously built its own: it applied
     (1 + socMin) as an energy multiplier instead of (1 - socMin) as a usable
     fraction, ignored `sedBasis:"packUsable"` entirely, and used the raw
     battery efficiency where the sizing uses the vertically-scoped one. See
     batteryConvention() for the source that settles the socMin form. */
  const BATT = batteryConvention(p, { Etot, Evert: EvertOut });
  /* The hover phases are VERTICAL flight, so they are charged the raw battery
     efficiency rather than the mission-blended one — that is the whole point of
     the scoping, and it is the one place the raw value is correct. */
  const minBatKg  = (Eto+Eld)*1000
    / Math.max(1e-9, BATT.sedEff*BATT.etaRaw*BATT.usableFrac);
  /* TURBOELECTRIC: the fuel tank is sized to the design fuel (engine/
     turboelectric.js), so a lighter payload cannot buy range — the tank is
     already full — and a heavier one displaces fuel. Hover and reserve fuel
     are held; what is left scales the cruise, as the battery curve does. */
  const teFuelHoverKg = isTE ? teOut.fuelBurnKg*(Eto+Eld)/Math.max(1e-9,Etot-Eres) : 0;
  const teFuelFlightKg = isTE ? teOut.fuelBurnKg-teFuelHoverKg : 0;
  const teRange = (pay)=>{
    const fuel=Math.min(teOut.fuelKg, teOut.fuelKg-Math.max(0,pay-p.payload));
    return +Math.max(0,((fuel-teOut.fuelReserveKg-teFuelHoverKg)/Math.max(1e-9,teFuelFlightKg))*p.range).toFixed(1);
  };
  const maxPayload= isTE
    ? Math.max(0, p.payload + teOut.fuelKg - teOut.fuelReserveKg - teFuelHoverKg)
    : Math.max(0, MTOW-Wempty-minBatKg);  // hard upper limit on payload
  const ferryRange= isTE ? teRange(0) : (()=>{
    const WbFerry=MTOW-Wempty;  // all weight = battery when payload=0
    const EavFerry=BATT.energyFromMass(WbFerry);
    return +Math.max(0,((EavFerry-Eto-Eld)/Efl_design)*p.range).toFixed(1);
  })();
  /* 1 point per kg, low→high so the AreaChart tooltip resolves correctly by index.
     ROBUSTNESS: maxPayload can come back non-finite or enormous when the sizing
     loop diverges (extreme slider values, or a parameter sweep that walks the
     design out of the feasible region). Array.from({length: …}) then throws a
     RangeError and takes the whole render down. Clamp to a sane sample count —
     10,000 kg of payload is far beyond any SC-VTOL / powered-lift aircraft. */
  const rpPoints=Math.min(10001,Math.max(1,
    (isFinite(maxPayload)&&maxPayload>0)?Math.ceil(maxPayload)+1:1));
  const rpData=Array.from({length:rpPoints},(_,i)=>{
    const pay=i;
    if(isTE){
      const seg=Math.abs(pay-p.payload)<1?"design":pay>p.payload?"A":"B";
      return{payload:pay,range:teRange(pay),segment:seg};
    }
    const Wavail=Math.max(0,MTOW-Wempty-pay);
    if(Wavail<minBatKg) return{payload:pay,range:0,segment:"A"};
    const Eavail=BATT.energyFromMass(Wavail);
    const r=+Math.max(0,((Eavail-Eto-Eld)/Efl_design)*p.range).toFixed(1);
    const seg=Math.abs(pay-p.payload)<1?"design":pay>p.payload?"A":"B";
    return{payload:pay,range:r,segment:seg};
  }); // low(0kg)→high(maxKg), matches x-axis left→right
  const rpFerryPoint={payload:0,range:ferryRange,segment:"ferry"};

  /* Aerodynamic polar — uses fitted kPolar for custom airfoils, Oswald for library */
  const k_polar=selAF.kPolar || 1/(Math.PI*p.AR*p.eOsw);
  const polarData=Array.from({length:81},(_,i)=>{
    const alpha=-4+i*0.25,CL=0.40+2*Math.PI*(1+0.77*selAF.tc)*alpha*Math.PI/180;
    const CD=selAF.CDmin+k_polar*(CL-CLcruise)**2;
    return{alpha:+alpha.toFixed(2),CL:+CL.toFixed(4),CD:+CD.toFixed(5),LD:+(CL/CD).toFixed(2)};
  });

  /* Time-power-velocity-SoC profiles */
  const tPhases=[0,tto,tto+tcl,tto+tcl+tcr,tto+tcl+tcr+tdc,tto+tcl+tcr+tdc+tld,tto+tcl+tcr+tdc+tld+tres];
  const Tend=tPhases[6],phPow=[Phov,Pcl,Pcr,Pdc,Phov,Pres];
  const phV=[0.5,Vcl,p.vCruise,Vdc,0.5,Vres];
  const Ecum_ph=[0,Eto,Eto+Ecl,Eto+Ecl+Ecr,Eto+Ecl+Ecr+Edc,Eto+Ecl+Ecr+Edc+Eld,Etot];
  const N=200,powerSteps=[],socSteps=[],velSteps=[],energySteps=[];
  for(let i=0;i<=N;i++){
    const t=Tend*i/N;
    let ph=5; for(let j=0;j<6;j++)if(t>=tPhases[j]&&t<tPhases[j+1]){ph=j;break;}
    const Ec=Ecum_ph[ph]+phPow[ph]*((t-tPhases[ph])/3600);
    /* socMin IS the residual floor — see batteryConvention(). This read
       socMin/(1+socMin), a third convention, and drew the SoC trace bottoming
       out 3 points above where the sizing actually allows. */
    const socFloor=BATT.socFloor;
    const soc=Math.max(socFloor,(1-Ec/PackkWh))*100;
    powerSteps.push({t:+t.toFixed(0),P:+phPow[ph].toFixed(1),ph:["TO","Climb","Cruise","Desc","Land","Res"][ph]});
    socSteps.push({t:+t.toFixed(0),SoC:+soc.toFixed(2)});
    velSteps.push({t:+t.toFixed(0),V:+phV[ph].toFixed(1)});
    energySteps.push({t:+t.toFixed(0),E:+Ec.toFixed(3),P:+phPow[ph].toFixed(1),ph:["TO","Climb","Cruise","Desc","Land","Res"][ph]});
  }

  /* Convergence chart data — includes per-iteration residual for log plot */
  const convData=mtowH.map((m,i)=>({
    iter:i, MTOW:+m.toFixed(1), Energy:energyH[i]||null,
    residual: residualH[i]!=null ? residualH[i] : null,
    logResidual: (residualH[i]!=null && residualH[i]>0) ? +Math.log10(residualH[i]).toFixed(4) : null,
  }));

  /* Tolerance sweep — how many R1 and R2 iterations does each tol need?
     Uses the same weight-scaled criterion as the solver it is describing;
     testing an absolute threshold here would plot a different solver. */
  const tolSweepData=[-1,-2,-3,-4,-5,-6,-7,-8,-9,-10].map(exp=>{
    const epsS=Math.pow(10,exp);
    const tolAt=(W)=>0.01*Math.max(1,Math.abs(W))*epsS;
    let m1=2177,n1=0;
    for(let i=0;i<5000;i++){
      n1=i+1;
      const bf=(g0*p.range*1000)/(p.LD*p.etaSys*p.sedCell*3600);
      const mn=p.payload+ewf*m1+bf*m1;
      if(Math.abs(mn-m1)<tolAt(m1)){m1=mn;break;}
      m1=mn; if(m1>5700)break;
    }
    let m2=m1,n2=0;
    for(let o=0;o<600;o++){
      n2=o+1;
      const W2=m2*g0;
      const DL2=(W2*TW)/(Math.PI*Math.pow(propDiamEff/2,2)*p.nPropHover);
      const Ph2=(W2/p.etaHov)*Math.sqrt(DL2/(2*rhoHov))/1000;
      const Pc2=(W2/p.etaSys)*(RoC+Vcl/LDcl)/1000;
      const Pcr2=(W2/p.etaSys)*(p.vCruise/p.LD)/1000;
      const Pd2_raw=(W2/p.etaSys)*(-RoC+Vdc/LDcl)/1000;
      const Pd2=Pd2_raw;
      const Pr2=(W2/p.etaSys)*(Vres/p.LD)/1000;
      const Et2=Ph2*(hvtol/0.5)/3600+Pc2*tcl/3600+Pcr2*tcr/3600+Pd2*tdc/3600+Ph2*tld/3600+Pr2*tres_s/3600;
      /* Same convention as the design point, including the vertical-flight
         scoping — this sweep recomputes its own energy, so it must recompute
         its own vertical share too rather than borrow the design point's. */
      const B2=batteryConvention(p,{Etot:Et2,Evert:Ph2*(hvtol/0.5)/3600+Ph2*tld/3600});
      const WE2=B2.massFromEnergy(Et2);
      const WP2=Ph2/Math.max(0.05,p.spBattery??(p.sedCell*(1-(p.cRateDerate??0.08))*(p.maxCRate??4.0)/1000));
      const Wb2=Math.max(WE2,WP2);
      const mn=p.payload+ewf*m2+Wb2;
      if(Math.abs(mn-m2)<tolAt(m2)){m2=mn;break;}
      m2=mn;
    }
    return{exp,tol:`1e${exp}`,tolVal:tolAt(m2),R1iters:n1,R2iters:n2,totalIters:n1+n2,R2MTOW:+m2.toFixed(2)};
  });

  /* T/W trade sweep */
  const twSweepData=[1.0,1.05,1.1,1.15,1.2,1.25,1.3,1.4,1.5].map(tw=>{
    let m=MTOW1;
    for(let i=0;i<60;i++){
      const W=m*g0;
      const DLtw=(W)/(Math.PI*Math.pow(propDiamEff/2,2)*p.nPropHover);  // T/W=1.0
      const Phov_tw=(W/p.etaHov)*Math.sqrt(DLtw/(2*rhoHov))/1000;               // T/W=1.0
      const Pcl_tw=(W/p.etaSys)*(RoC+Vcl/LDcl)/1000;
      const Pcr_tw=(W/p.etaSys)*(p.vCruise/p.LD)/1000;
      const Pdc_tw_raw=(W/p.etaSys)*(-RoC+Vdc/LDcl)/1000;
      const Pdc_tw=Pdc_tw_raw;
      const Pres_tw=(W/p.etaSys)*(Vres/p.LD)/1000;
      const Etot_tw=Phov_tw*(hvtol/0.5)/3600+Pcl_tw*tcl/3600+Pcr_tw*tcr/3600+Pdc_tw*tdc/3600+Phov_tw*tld/3600+Pres_tw*tres_s/3600;
      const Btw=batteryConvention(p,{Etot:Etot_tw,
        Evert:Phov_tw*(hvtol/0.5)/3600+Phov_tw*tld/3600});
      const WE_tw=Btw.massFromEnergy(Etot_tw);
      const WP_tw=Phov_tw/Math.max(0.05,p.spBattery??(p.sedCell*(1-(p.cRateDerate??0.08))*(p.maxCRate??4.0)/1000));
      const Wbat_tw=Math.max(WE_tw,WP_tw);
      const mn=p.payload+ewf*m+Wbat_tw;
      if(Math.abs(mn-m)<1e-4){m=mn;break;}
      m=mn;
    }
    return{tw:+tw.toFixed(2),R1:+MTOW1.toFixed(1),R2:+m.toFixed(1)};
  });

  /* Weight breakdown (Roskam) */
  /* Weight breakdown. Was a THIRD mass split (ewFracs), inconsistent with both
     the CG calculation and the Raymer buildup that actually sized the aircraft
     — so the displayed chart did not match the masses driving MTOW. When the
     buildup is active the real component masses are shown. */
  const EW_LABEL={wing:"Wing Struct",fuselage:"Fuselage",vtail:"Tail Surf",booms:"Booms",
    gear:"LG",motors:"Motors",inverters:"Inverters",rotors:"Rotors",avionics:"Avionics",
    driveSys:"Drive Sys",nacelle:"Nacelle",
    ecs:"ECS",electrical:"Elec Sys",flightControls:"Flt Controls",furnishings:"Furnish"};
  const ewFracs=[0.18,0.28,0.05,0.04,0.04,0.22,0.04,0.02,0.08,0.05];
  const ewNames=["Wing Struct","Fuselage","Tail Surf","Booms","LG","Propulsion","Avionics","ECS","Elec Sys","Furnish"];
  const weightBreak=weightGroups
    ? Object.entries(weightGroups)
        .filter(([,v])=>isFinite(v)&&v>0)
        .map(([k,v])=>({name:EW_LABEL[k]||k,val:+v.toFixed(1)}))
        .sort((a,b)=>b.val-a.val)
    : ewNames.map((wn,i)=>({name:wn,val:+(ewFracs[i]*Wempty).toFixed(1)}));
  const weightBreakBasis=weightGroups?"Raymer component buildup":"Roskam empty-weight fractions";

  /* Drag pie */
  const dragComp=[
    {name:"Wing",val:rn(CD0w,5)},{name:"Fuselage",val:rn(CD0f,5)},
    {name:"H-Stab",val:rn(CD0h,5)},{name:"V-Stab",val:rn(CD0v,5)},
    {name:"Nacelles",val:rn(CD0n,5)},{name:"Rotor Hubs",val:rn(CD0hub,5)},
    {name:"Stopped Blades",val:rn(CD0blade,5)},
    {name:"Land.Gear",val:rn(CD0g,5)},{name:"Misc",val:rn(CD0m,5)},
  ].filter(d=>d.val>0);

  /* ── WING BOX — DETAIL STRUCTURAL DESIGN ──────────────────────────────
     Reported, NOT used for mass. The two serve different purposes and it is
     worth being explicit about which is which:
       AFDD93 (weights.js) gives the MASS. It is a regression over 25 aircraft
         with 3.4% quoted error, and it is what the validation is calibrated on.
       wingbox.js gives the DESIGN. Spar cap areas, web and skin gauges, rib
         pitch, EI, stress, strain, margins, buckling modes and tip deflection —
         none of which a regression can produce at all.
     Cross-checked they agree to about 30%, with the physics model lower, which
     is what an idealised single-load-case model should do against a regression
     fitted to real aircraft. Until it closes further the correlation keeps the
     mass and the box supplies the detail. The gap is reported, not hidden. */
  /* Load cases first — the wing is sized by the WORST of manoeuvre and the
     SC-VTOL gust set, not by an assumed 5.25 ultimate. See engine/loadcases.js. */
  /* Both of these are WING structural analyses and both are meaningless without
     a wing: the SC-VTOL gust increment is Kg*Ude*V*a/(2*W/S) — undefined at
     W/S = 0 — and the box is a spar/rib/skin sizing for a structure that does
     not exist. Returning NaN-filled objects corrupted groupSums downstream, so
     they are skipped outright and reported as null.
     A rotorcraft airframe still has gust and manoeuvre load cases, but they act
     on the ROTORS and the airframe, not on a wing, and that model is not in
     this engine. Recorded as a gap rather than faked. */
  const lcase = hasWing
    ? loadCases(p, { MTOW, Swing, MAC, rho: rhoCr, rho0: 1.225,
                     CLaW, vCruise: p.vCruise, CLmax: selAF.CLmax })
    : null;
  const wbox = hasWing
    ? wingBox(p, { MTOW, Swing, bWing, nz: lcase.nUltimate })
    : null;

  /* A WINGLESS AIRCRAFT STILL HAS A LIMIT LOAD FACTOR. lcase is null above
     for multicopter and sideBySide because the wing gust case is undefined
     without a wing — but nLimit/nUltimate were then reported as null, and
     every consumer that needed them supplied its own constant instead. This
     resolves one answer for all six layouts and records which path gave it. */
  const alf = airframeLoadFactors(p, lcase);

  /* The gust lines of the V-n diagram, from the SAME load cases that size the
     wing and now the fuselage. Each runs from (0, 1) to (V, 1 +/- dn). */
  vnBasis.gustEnvelope = lcase ? "MOC SC-VTOL VTOL.2215(f)" : "none";
  vnBasis.gustBasis = lcase
    ? "MOC SC-VTOL Issue 2, MOC VTOL.2215(f): 9.14 m/s (30 ft/s) up to VD; "
      + "15.24 m/s (50 ft/s) up to VH/VNE; 20.12 m/s (66 ft/s) up to VB for "
      + "Category Enhanced. Sharp-edged gust with alleviation factor Kg "
      + "(engine/loadcases.js)."
    : "No wing, so no wing gust case: the airframe limit factor is the "
      + "thrust-borne MOC VTOL.2200(f) factor instead.";
  vnBasis.gustLines = lcase
    ? lcase.gusts.map(g => ({ label: g.label, Ude: g.Ude, V: +g.V.toFixed(2),
        nPos: +g.nLimit.toFixed(3), nNeg: +g.nLimitNeg.toFixed(3) }))
    : [];

  /* ── WEIGHT-CLOSURE MARGIN ────────────────────────────────────────────
     MTOW = payload + Wempty + Wbat closes only while (Wempty+Wbat)/MTOW < 1.
     As that sum approaches 1 the loop runs away: a small extra energy demand
     produces an unbounded MTOW. The tool must show how close to that cliff a
     design sits, because "it converged" and "it has margin" are not the same
     statement — at 105 s hover the default sits at 92.8% and still converges. */
  const closureFrac=(Wempty+Wbat+WfuelOut)/MTOW;        // must stay below 1
  const payloadFrac=p.payload/MTOW;
  const closureMargin=1-closureFrac;           // = payload fraction at closure

  /* Feasibility */
  /* Cruise duty and redundancy — see the checks below. */
  const nCruiseUnitsOut=(cfgOut.hasCruiseProp?1:0)+(cfgOut.nTilting??0);

  /* ── CRUISE DUTY IS AGAINST THE MOTOR'S RATING, NOT AGAINST HOVER ────
     This divided cruise power per unit by HOVER power per rotor, which was
     right when hover was the only thing that sized a motor. It is not any
     more: engine/sizing-conditions.js sizes the installed CONTINUOUS rating as
     the maximum over the sustained design conditions, and at the default that
     is VERTICAL CLIMB, not hover.

     Using hover as the denominator therefore overstates the duty by the ratio
     between the two. It showed up starkly on a multicopter — cruise read "105%
     of hover rating" and failed, when cruise is 68.5 kW against an installed
     92.3 kW rating, i.e. 74%, comfortably inside the limit. The design was
     fine; the yardstick was stale.

     Falls back to hover per rotor when no installed rating is available (the
     ewf-fraction model does not build one), so behaviour there is unchanged. */
  const motorRatingKW = PmotInstalledOut ?? (Phov/Math.max(1,p.nPropHover));
  /* ── COMPARE THE CRUISE UNIT AGAINST ITS OWN RATING ──────────────────
     This divided cruise power by `motorRatingKW`, the LIFT motor's rating. On
     a layout whose cruise thrust comes from a DEDICATED PUSHER those are two
     different machines: the lift motors are rated by hover, the pusher by
     cruise. Comparing one against the other measured nothing.
     Where the cruise units ARE the lift motors (tilting rotors) the lift
     rating is the right denominator and the original question is real — a
     motor sized by a two-minute hover peak may not hold cruise for 23 minutes.
     Where there is a separate pusher, its own rating is the denominator. */
  const cruiseUnitRatingKW = (cfgOut.hasCruiseProp && (cfgOut.nTilting ?? 0) === 0
                              && cruiseRatingKWOut > 0)
    ? cruiseRatingKWOut : motorRatingKW;

  /* ── MOC VTOL.2120: THE CERTIFICATION CATEGORY AS A PERFORMANCE RULE ──
     The category already changed the aircraft through avionics redundancy
     lanes (engine/avionics.js), worth ~2% of gross weight. It also sets a
     CLIMB GRADIENT, and that was not computed anywhere: Enhanced must make
     2.5% at 305 m following a critical failure for performance, Basic must
     make the same 2.5% with everything running at ISA SL. Same number, very
     different aircraft. See engine/certification-climb.js for the quoted
     clause and for what this check does not claim.

     POWER IS THE CONTINUOUS RATING, NOT THE INSTALLED HOVER RATING. The
     clause says "with the remaining lift/thrust engines at maximum
     continuous power". Sizing this on PmotInstalledKW -- which is set by a
     two-minute hover peak and is far larger -- gave gradients of 19 to 31%
     after an engine failure, which is not an aeroplane. cruiseUnitRatingKW
     is the rating the engine already derives per configuration: a separate
     pusher's own cruise rating where there is one, the lift motor rating
     where the tilting rotors ARE the cruise units. */
  const certClimbOut = certificationClimb(p, {
    MTOW_kg: MTOW, LD: LDact, g0,
    hasWing,
    nUnits: p.nPropHover,
    pMotInstalledKW: cruiseUnitRatingKW,
    separateCruiseProp: !!cfgOut.hasCruiseProp,
    nCruiseProps: nCruiseUnitsOut,
  });
  const cruiseDutyFrac=nCruiseUnitsOut>0
    ? (Pcr/nCruiseUnitsOut)/Math.max(1e-6,cruiseUnitRatingKW)
    : 0;
  const smCrit=staticMarginCriterion(p);
  /* Blade loading, from the converged hover disk loading. Defined here so the
     feasibility checks below can read it — DL_hover further down is a later
     re-derivation for the display block. */
  const ctSigmaOut = bladeLoading(DL_hover_out, p.tipSpeed ?? 167.64, solidityEff, rhoHov);
  /* ── CAN IT STILL BE FLOWN AFTER A ROTOR FAILS, NOT MERELY HELD UP ──
     The OEI rows further down are a THRUST question. Du, Quan, Yang & Cai
     (JGCD, arXiv:1403.5986) pose the controllability one: after a rotor
     fails, can the survivors still produce the four-axis set — thrust, roll,
     pitch, yaw — needed to hold attitude WHILE carrying the weight? Their
     ACAI is the signed distance from the hover demand to the boundary of the
     attainable control set; positive is controllable, negative means the
     demand lies outside anything the remaining rotors can produce.

     engine/controlauthority.js implemented this faithfully and NOTHING IN THE
     SIZING PATH EVER CALLED IT — it was imported by its own test alone. So a
     design could pass every OEI check while no rotor failure left a flyable
     aircraft. It runs here, ahead of the feasibility list that reports it.

     The three OEI quantities below are re-derived rather than shared, because
     the OEI block sits several hundred lines further down and moving it would
     disturb a lot of settled code for no gain. They are the same expressions. */
  const acaiN_ = Math.max(2, p.nPropHover);
  const acaiW_ = MTOW * 9.80665;
  const acaiFmax_ = acaiW_ * TW / acaiN_;
  let acaiOut = null;
  if (CONFIG_DEFAULTS[cfgOut.key]?.oeiThrustShare !== false && acaiN_ >= 4 && Rrotor > 0) {
    const ring_ = ringRadiusFor(acaiN_, Rrotor, { interleaved: false });
    const kMu_ = torqueToThrustRatio({
      thrustPerRotorN: acaiW_ / acaiN_, R_m: Rrotor,
      tipSpeed_ms: TipSpd, FM: p.etaHov ?? 0.7, rho: rhoHov });
    /* Alternating spin is what ringRotors assumes by default. Spin ORDER
       decides fault tolerance; code can set it (below) but no control in the
       app does, so an app design is the DEFAULT arrangement reported as such,
       not the best available one. */
    /* SPIN ORDER IS A DESIGN VARIABLE. It was previously the default
       argument of ringRotors, which for a hexacopter is exactly PNPNPN — the
       member of Du, Quan & Cai's published pair that loses control on every
       failure. It is now an input: pass p.rotorSpins as an array of +1/-1 to
       size a specific arrangement. engine/controlauthority.js exports
       bestSpinArrangement() to find the best one for a given rotor count and
       thrust margin; that search is a post-convergence design study and is
       deliberately NOT run inside the sizing loop, which the rotor-diameter
       solver calls repeatedly. */
    const spins_ = Array.isArray(p.rotorSpins) && p.rotorSpins.length === acaiN_
      ? p.rotorSpins : undefined;
    const base_ = ringRotors(acaiN_, ring_, spins_);
    let surv_ = 0, worst_ = Infinity, lim_ = null;
    for (let i = 0; i < acaiN_; i++) {
      const r_ = acai({ rotors: failRotor(base_, i), fMaxN: acaiFmax_,
                        weightN: acaiW_, kMu: kMu_ });
      if (!r_ || !Number.isFinite(r_.acai)) continue;
      /* `controllable` is the module's own verdict: rank 4 AND strictly
         positive. `acai > 0` alone would accept a full-rank case sitting on
         the boundary at machine epsilon, which is exactly the PNPNPN failure
         mode its header warns about — four of six failures were once reported
         controllable on a residue of order 1e-16. */
      if (r_.controllable) surv_++;
      if (r_.acai < worst_) { worst_ = r_.acai; lim_ = r_.limiting || null; }
    }
    acaiOut = {
      survivable: surv_, of: acaiN_,
      worstACAI: Number.isFinite(worst_) ? +worst_.toFixed(1) : null,
      limitingAxis: lim_,
      spins: spins_ ? "as supplied" : "default alternating",
      basis: "Du, Quan, Yang & Cai ACAI (JGCD arXiv:1403.5986), evaluated at the "
           + (spins_
               ? "spin arrangement supplied in p.rotorSpins."
               : "DEFAULT alternating spin arrangement, which for six rotors is "
                 + "exactly the PNPNPN member of the published pair and loses control "
                 + "on every single failure. Pass p.rotorSpins to size a chosen "
                 + "arrangement, and see bestSpinArrangement() in "
                 + "engine/controlauthority.js for the best available at this rotor "
                 + "count and thrust margin.")
           + " Controllable one-rotor-out also needs more installed thrust than the "
           + "N/(N-1) that replaces the lost rotor: measured on a ring layout, eight "
           + "and twelve rotors survive every failure at T/W 1.4, six reaches 4 of 6 "
           + "only at 2.0, and four survives none at any margin up to 3.0 because "
           + "three inputs cannot span four axes.",
    };
  }

  const checks=[
    /* ── THE CERTIFICATION BASIS, NOT A ROUND NUMBER ──────────────────
       This read "MTOW < 5700 kg" with no source anywhere in the file. 5,700 kg
       is the CS-23 aeroplane boundary; it is not the rule this aircraft class
       is certified under. EASA SC-VTOL-01 applies to a person-carrying VTOL in
       the SMALL CATEGORY — 9 passengers or fewer and a maximum certificated
       take-off mass of 3,175 kg (7,000 lb) or less. That is the number a
       4-passenger urban air taxi is actually designed against, and Joby (2,404
       kg) and Archer (3,175 kg exactly) both sit at or under it. */
    {label:`MTOW within certification limit (${isFinite(mtomLimit)?mtomLimit.toFixed(0)+" kg":"none"})`,
     ok:MTOW<=mtomLimit,
     val:isFinite(mtomLimit)
       ? `${MTOW.toFixed(0)} kg vs ${mtomLimit.toFixed(0)} kg MCTOM `
         + `[SRC EASA SC-VTOL-02 Issue 2, VTOL.2005(a), <=9 pax] — margin ${(mtomLimit-MTOW).toFixed(0)} kg`
         + (MTOW>mtomLimit
             ? `. OVER BY ${(MTOW-mtomLimit).toFixed(0)} kg (${((MTOW/mtomLimit-1)*100).toFixed(0)}%): `
               + `this mission does not fit the category — shorten the range, cut payload, `
               + `or size against a different basis`
             : "")
       : `${MTOW.toFixed(0)} kg, no certification limit set (research study)`},
    /* ── IS THIS MISSION EVEN THIS LAYOUT'S JOB? ───────────────────────
       Sizing every configuration for one mission produced a 5,751 kg
       "multicopter" — a class whose real members (Volocopter VoloCity 900 kg,
       EHang EH216-S 620 kg) are two-seaters flying 30-35 km. The engine was
       not wrong; it was answering a question nobody asks.
       Given VoloCity's own mission it returns 672 kg against a published 900,
       and given EH216-S's it returns 746 against 620 — it brackets them.
       So the mission is NOT overwritten (comparing layouts needs a common
       mission) but a mission far outside the reference envelope is reported,
       because that is what makes the resulting mass interpretable. */
    ...(() => {
      const R = CONFIG_REFERENCE[cfgOut.key];
      if (!R || !R.aircraft) return [];
      /* Only EXCEEDING the reference is flagged. Flying a layout SHORTER or
         lighter than its reference aircraft is not an excursion — it just
         sizes a smaller aeroplane, and the models stay in the range they were
         validated over. Asking for more than any built example of the layout
         has ever done is the direction that invalidates the answer. */
      const parts = [], far = [], under = [];
      if (R.payload_kg) {
        const f = p.payload / R.payload_kg;
        parts.push(`payload ${p.payload.toFixed(0)} vs ${R.payload_kg} kg`);
        if (f > 1.5) far.push(`payload ${f.toFixed(1)}x`);
        else if (f < 0.5) under.push("payload");
      }
      if (R.range_km) {
        /* p.range arrives with the reserve allowance already folded in by the
           caller, but a published range is quoted WITHOUT it. Back it out with
           the same convention App.jsx uses, or the comparison is between two
           different quantities. */
        const vRes = (p.reserveAtCruiseSpeed === true ? 1.0 : 0.76) * (p.vCruise ?? 0);
        const resKm = vRes * (p.reserveMinutes ?? 0) * 60 / 1000;
        const cruiseKm = Math.max(0, (p.range ?? 0) - resKm);
        const f = cruiseKm / R.range_km;
        parts.push(`range ${cruiseKm.toFixed(0)} vs ${R.range_km} km (both excl. reserve)`);
        if (f > 1.5) far.push(`range ${f.toFixed(1)}x`);
        else if (f < 0.5) under.push("range");
      }
      return [{ label: `Mission matches the reference aircraft (${R.aircraft})`,
        kind: "advisory", ok: far.length === 0,
        val: parts.join(", ")
          + (far.length
              ? ` — ${far.join(" and ")} the reference. No built aircraft of this layout does that, so the mass below is an EXCURSION, not a design`
              : under.length
                ? ` — well under the reference on ${under.join(" and ")}; a smaller aircraft of the same layout, which is fine`
                : " — inside the reference envelope") }];
    })(),
    {label:"Sizing loop stayed inside the design space",
     ok:!mtowCeilingHit,
     val:mtowCeilingHit
       ? `ABORTED: MTOW passed ${mtowCeiling.toFixed(0)} kg (2x the SC-VTOL ceiling). `
         + `The weight spiral did not close — the reported mass is the last iterate `
         + `before the guard tripped, NOT a design.`
       : `peak ${MTOW.toFixed(0)} kg, ceiling ${mtowCeiling.toFixed(0)} kg`},
    {label:"Cruise range > 0 km",ok:CruiseRange>0,val:`${(CruiseRange/1000).toFixed(1)} km cruise | mission ${+(p.range-reserveDistM/1000).toFixed(1)} km + res ${+(reserveDistM/1000).toFixed(1)} km`},
    /* USABLE energy, not total — the reserved SoC window is not available to
       the mission, and comparing total against mission silently spends it. */
    isTE
      ? {label:"Usable pack ≥ 2-min engine-out hover",ok:PackUsablekWh>=EpackSizeOut-1e-6,
         val:`${PackUsablekWh.toFixed(2)} ≥ ${EpackSizeOut.toFixed(2)} kWh usable; the turboshaft-generator flies the mission (${Etot.toFixed(1)} kWh electrical). Pack sized by ${teOut.batterySizedBy} at ${TURBOELECTRIC_DEFAULTS.emergencyCRate}C [SRC NASA/TM-20210017971 §3; Johnson & Silva 2022]`}
      : {label:"Usable pack ≥ Mission E",ok:PackUsablekWh>=Etot-1e-6,
     val:`${PackUsablekWh.toFixed(2)} ≥ ${Etot.toFixed(2)} kWh usable (total ${PackkWh.toFixed(2)} kWh)`},
    /* Static margin is a BARE-AIRFRAME property, not the certification gate for
       an augmented eVTOL. EASA MOC SC-VTOL Issue 2 shows compliance by MHQRM
       (ADS-33E handling-qualities ratings) and says outright that its method
       differs from CS-23/CS-27 precisely because those rest on static or
       dynamic stability requirements. See engine/cg.js. */
    {label:`SM ${(smCrit.smMin*100).toFixed(0)}–${(smCrit.smMax*100).toFixed(0)}% MAC (${smCrit.label})${smCrit.advisory?" — advisory":""}`,
     ok:SM_vt>=smCrit.smMin&&SM_vt<=smCrit.smMax,
     val:`${(SM_vt*100).toFixed(1)}% | governed by: ${smCrit.governingCriterion}`},
    /* Hover trim: the rotor array thrust centroid must sit at the CG, or the
       loaded rotor pair needs extra installed thrust. The old code could not
       detect this because it placed the motors at the CG by construction. */
    {label:"Hover trim: CG inside rotor array",ok:cg.cgWithinRotorArray,
     val:`xCG ${cg.xCGtotal.toFixed(2)} m in [${cg.xRotFwd.toFixed(2)}, ${cg.xRotAft.toFixed(2)}] m`},
    {label:"Hover thrust split within T/W",ok:TW>=cg.hoverLoadedRotorRatio,
     val:`loaded pair ${(cg.hoverLoadedRotorRatio).toFixed(2)}× even split (fwd ${(cg.hoverFwdThrustShare*100).toFixed(0)}%), T/W ${TW.toFixed(2)}`},
    {label:"Tip Mach < 0.70",ok:TipMach<0.70,val:`M${TipMach.toFixed(3)}`},
    /* Distance to the weight-growth cliff. Below ~10% the design is in the
       steep part of the curve and small assumption changes move MTOW hugely. */
    {label:`Cell peak < ${THERMAL_CONSTANTS.tCellMaxC}°C`,ok:btms.withinMax,
     val:`${btms.tPeakC.toFixed(1)}°C after ${(btms.dTHoverK).toFixed(1)} K hover rise${btms.withinOpt?"":" — above the 45°C optimal band"}`},
    {label:"Cruise thermally balanced",ok:btms.cruiseBalanced,
     val:`reject ${(btms.QrejectW/1000).toFixed(1)} kW vs ${(btms.QcruiseW/1000).toFixed(1)} kW cruise generation`},
    /* ── SUSTAINED CRUISE DUTY ──────────────────────────────────────────
       Motors are sized by the HOVER peak, which lasts about two minutes. In
       cruise the units that keep thrusting must hold their share for the whole
       leg — tens of minutes. An electric motor's CONTINUOUS rating is well
       below its short-term peak (thermal, not torque, is the limit), so a
       layout with few cruise units can be legal on peak power and still
       overheat in the cruise it was designed for. Nothing checked this before:
       the engine sized on hover and never looked at duty cycle.
       80% of the hover rating is the working ceiling used here [LAY]. */
    {label:"Cruise duty < 80% of continuous rating",
     ok:cruiseDutyFrac<=0.80,
     val:`${(cruiseDutyFrac*100).toFixed(0)}% of the ${cruiseUnitRatingKW.toFixed(0)} kW continuous rating of the `
       +`${(cfgOut.hasCruiseProp && (cfgOut.nTilting ?? 0) === 0) ? "PUSHER" : "lift motor"}, `
       +`held for ${(tcr/60).toFixed(0)} min across ${nCruiseUnitsOut} cruise unit(s)`},
    /* ── MOTOR PEAK CAPABILITY vs THE OEI TRANSIENT ──────────────────────
       The motor is MASS-sized by the worst SUSTAINED condition, because
       specific power is a thermal (continuous) figure. But it must also be
       CAPABLE of the NASA Table 4 disturbance-rejection transient after a
       motor failure. Those are different questions and only the first was ever
       asked: the engine reported a required peak on one tab and weighed a
       motor for a different number on another.
       This check asks the second question. The capability figure is the sized
       continuous rating times the SECONDS-scale burst ratio (2.00, NASA/TM-
       20210017971 citing the EMRAX manual), not the minutes-scale datasheet
       peak (1.693) — the transient lasts seconds, so that is the ratio that
       applies to it.
       A FAILURE HERE IS A REAL DEFICIENCY, not a modelling artefact: it means
       this rotor count and control scheme cannot reject an engine-out
       disturbance on the installed power. The fixes are real design moves —
       more installed power, collective instead of RPM control (Table 4 drops
       3.8 to 2.5), or more rotors. The mass cost of closing it is NOT invented
       here; see engine/sizing-conditions.js for why. */
    ...(sizeCondOut?[{
      label:"Motor peak capability ≥ OEI transient requirement",
      /* BOTH SIDES ARE NOW SOURCED. The requirement is NASA Table 4 on the
         column for THIS layout — and the control scheme is itself published
         per concept vehicle rather than defaulted to the harshest column
         (see engine/motor.js). The capability is NASA/TM-20210017971 sec.6.1,
         "upwards of 200% MCP for 'a few seconds'", the right currency for a
         seconds-long disturbance-rejection event; it replaces the minutes-
         scale datasheet ratio this check used to apply, which compared two
         different questions and overstated the shortfall.
         Still ADVISORY, and NASA's own caveat is why: "Sizing criteria for
         power plant components are not currently available for multirotor
         aircraft." NASA meet this same case in the tiltwing study — a failure
         needing 205% MCP — and keep the baseline motors "without increasing
         motor power". Sizing mass to close it was tried here and validation
         refuted it. Reported as a design finding, not a verdict. */
      /* -- ADVISORY, OR INDETERMINATE? ---------------------------------
         These are different statements and were being conflated. "advisory"
         says the design misses a criterion that real aircraft also miss.
         "indeterminate" says NOBODY HAS PUBLISHED what this design must do -
         because Table 4 has no column for a mixed-control layout, and none of
         its columns describes an interconnected drive at all. Reporting the
         second as a shortfall blames the user for a gap in the literature.
         See engine/motor.js `determinate`. */
      kind: motorReq.determinate ? "advisory" : "indeterminate",
      /* When the requirement is a bracket, the honest test is the FLOOR - the
         most favourable published column. Missing even that is a real
         deficiency whatever the indeterminacy; clearing it means the design
         cannot be shown to be short. Where there is no published floor at all
         (an interconnected drive) it cannot be shown short either way. */
      ok: motorReq.determinate ? sizeCondOut.peakAdequate
        : (motorReq.factorFloor != null
            ? sizeCondOut.availablePeakKW >= motorReq.factorFloor
                * (sizeCondOut.requiredPeakKW / (motorReq.factor || 1)) * (1 - 1e-9)
            : true),
      val:(()=>{
        const hovPerMotor = sizeCondOut.requiredPeakKW / (motorReq.factor || 1);
        const avail = sizeCondOut.availablePeakKW;
        const base = `needs ${sizeCondOut.requiredPeakKW.toFixed(0)} kW/motor `
          + `(${motorReq.factor}× hover, ${motorReq.governedBy}); delivers `
          + `${avail.toFixed(0)} kW (${sizeCondOut.installedKW.toFixed(0)} kW cont `
          + `× ${sizeCondOut.burstToContinuous} seconds-scale burst)`;
        if (motorReq.interconnected) {
          return `delivers ${avail.toFixed(0)} kW/motor `
            + `(${sizeCondOut.installedKW.toFixed(0)} kW cont × `
            + `${sizeCondOut.burstToContinuous} seconds-scale burst). `
            + `NOT SCORED — TABLE 4 DOES NOT DESCRIBE THIS AIRCRAFT. Every column in `
            + `it is a multicopter with INDEPENDENT rotors, and Johnson & Silva state `
            + `that "removing interconnecting shafts results in higher power `
            + `transients". This layout has an interconnect shaft, so a motor failure `
            + `does not cost a rotor and the published ${motorReq.factor}× figure `
            + `(${sizeCondOut.requiredPeakKW.toFixed(0)} kW) is an UPPER BOUND on the `
            + `requirement, not the requirement. `
            /* Name the column ACTUALLY used, not the family looked up before
               substitution - a two-rotor aircraft was being scored on
               "Hexacopter, RPM control" and an earlier draft of this sentence
               said "four-rotor", describing the pre-substitution family. */
            + `The column used is "${motorReq.column}", against this layout's `
            + `${motorReq.nRotors} rotors. `
            + `The same interconnect is already why configuration.js exempts this `
            + `layout from the N/(N−1) OEI thrust margin — the two were previously `
            + `contradicting each other about the same aircraft.`;
        }
        if (motorReq.mixed && motorReq.factorFloor != null) {
          const lo = motorReq.factorFloor * hovPerMotor, hi = motorReq.factorCeiling * hovPerMotor;
          return base
            + `. MIXED CONTROL — this layout has variable-pitch tilt rotors AND `
            + `fixed-pitch lift rotors, so NASA Table 4 has no column for it: the `
            + `requirement is bracketed ${lo.toFixed(0)}–${hi.toFixed(0)} kW `
            + `(${motorReq.factorFloor}×–${motorReq.factorCeiling}× hover) and the `
            + `conservative end is reported above. `
            + (avail >= lo
                ? `The motor MEETS the collective-control floor and misses the rpm ceiling.`
                : `The motor misses even the collective floor.`)
            + ` INDETERMINATE, NOT SHORT: the gap is in the published criteria, not in `
            + `this design. Resolving it needs the stability-and-control simulation NASA `
            + `say is required — they state sizing criteria "are not currently available `
            + `for multirotor aircraft". Sizing motors TO the conservative end was `
            + `measured and it makes every reference aircraft heavier than the real one `
            + `(industrial MAE 42.9% -> 67.1%), so flying hardware does not meet it `
            + `either.`;
        }
        /* The sustained multiple is COMPUTED, not asserted. This sentence used
           to read "never exceeds ~1.2× hover", which went stale when the
           installed-T/W condition became a sustained rating: it is now 1.48–
           1.54× at the reference layouts. A hardcoded number inside an
           explanation is a fact that stops being checked. */
        const sustMult = sizeCondOut.hoverPerMotorKW > 0
          ? sizeCondOut.installedKW / sizeCondOut.hoverPerMotorKW : null;
        return base + (sizeCondOut.peakAdequate ? ""
          : ` — SHORT BY ${sizeCondOut.peakShortfallPct}%. STRUCTURAL, not a design error: `
          + `the motor is rated by the worst SUSTAINED condition`
          + (sustMult ? ` (${sustMult.toFixed(2)}× hover here)` : "")
          + `, so its seconds-scale burst reaches `
          + (sustMult ? `${(sustMult * sizeCondOut.burstToContinuous).toFixed(2)}×` : "~2.4×")
          + ` against a requirement of ${motorReq.factor}×. `
          + `This layout has independent, ${motorReq.control === "rpm" ? "fixed-pitch " : ""}`
          + `rotors and no interconnect, so Table 4's column DOES describe it and the `
          + `shortfall is real. Sizing to the criterion instead was measured and takes the `
          + `industrial benchmark from 42.9% to 67.1% — real certified aircraft do not `
          + `carry motors this large. NASA state the criteria "are not currently `
          + `available for multirotor aircraft".`);
      })()},
    ]:[]),
    /* Losing one cruise unit costs 1/N of cruise thrust, and on a wing-tip
       rotor it also applies that asymmetry at the largest possible arm.

       ONLY MEANINGFUL FOR WING-BORNE CRUISE, so it is scoped with the other
       wing-only criteria below. On a rotor-borne aircraft the rotors ARE the
       cruise propulsion, so this counted a rotor failure a SECOND time — the
       OEI transient check already covers it — and a side-by-side, which has
       exactly two rotors, could never pass a 40% threshold however it was
       designed. A check a layout cannot pass by construction is measuring the
       check, not the design.
       Note nTilting is NOT the right test: it is defined as (N - nStopped), so
       a wingless rotorcraft that stops nothing reports every rotor as tilting. */
    /* ── A ROTOR-BORNE FALLBACK CHANGES WHAT THIS FAILURE MEANS ────────
       A single centreline pusher loses 100% of cruise thrust when it fails, and
       the check read that as unsurvivable. It is not, for a layout whose LIFT
       ROTORS STOP AND CAN RESTART: the aircraft decelerates and reverts to
       rotor-borne flight, which is the mode it takes off and lands in anyway.
       Nor is there any asymmetry to reject — the pusher is on the centreline,
       which is the case the check's own comment says it is worried about
       ("on a wing-tip rotor it also applies that asymmetry at the largest
       possible arm").
       So the threshold applies where cruise thrust is DISTRIBUTED and its loss
       is asymmetric; where a rotor-borne fallback exists the loss is reported
       instead of failed. It is still shown, because reverting to rotor-borne
       mid-cruise is a real event with a real energy cost. */
    ...(() => {
      const frac = 1 / Math.max(1, nCruiseUnitsOut);
      const rotorFallback = (cfgOut.nStopped ?? 0) > 0;
      const asymmetric = nCruiseUnitsOut > 1;
      return [{ label:"Cruise thrust loss per failure < 40%",
        ok: frac < 0.40 || (rotorFallback && !asymmetric),
        val:`${nCruiseUnitsOut} cruise unit(s) -> ${(frac*100).toFixed(0)}% lost per failure`
          + (frac >= 0.40 && rotorFallback && !asymmetric
              ? ` — recoverable: ${cfgOut.nStopped} lift rotor(s) restart and the aircraft `
                + `reverts to rotor-borne flight, and a centreline pusher leaves no asymmetry`
              : "") }];
    })(),
    /* Scoped: absent on rotor-borne layouts rather than reported as zero,
       because MOC VTOL.2120 is a wing-borne gradient. */
    ...(certClimbOut.applicable ? [{
      label:`Climb gradient >= 2.5% (MOC VTOL.2120, Category ${certClimbOut.category})`,
      ok: certClimbOut.pass,
      val:`${certClimbOut.gradientPct}% at 305 m, CFP: ${certClimbOut.cfp}`
        + (certClimbOut.note ? " — single cruise propulsor, see certClimbNote" : "") }] : []),
    {label:"Main tyre rated load adequate",ok:gearOut?gearOut.tyreMain.adequate:true,
     val:gearOut?`${gearOut.tyreMain.size} rated ${gearOut.tyreMain.loadLb} lb vs ${gearOut.tyreMain.requiredLb} lb required`:"n/a (fraction model)"},
    {label:"Strut clears reserve-energy drop",ok:gearOut?!gearOut.bottomsOut:true,
     val:gearOut?`${(gearOut.strokeFittedM*1000).toFixed(0)} mm fitted vs ${(gearOut.strokeReserveM*1000).toFixed(0)} mm needed (CS 27.727, no bottoming)`:"n/a"},
    ...(wbox?[{label:"Wing tip deflection < 15% semi-span",ok:wbox.tipDeflectionOK,
     val:`${(wbox.tipDeflectionFrac*100).toFixed(1)}% (${(wbox.tipDeflectionM*1000).toFixed(0)} mm at ultimate)`}]:[]),
    /* Tolerance, not >= 0. The spar cap is sized so root stress EQUALS the
       allowable, which makes msStress exactly zero by construction — and
       floating-point rounding then renders it as "-0%" and fails the check
       every single run. A check that can never pass is noise, and noise is how
       real failures get ignored. -0.5% is well inside the rounding band and far
       below anything that would matter structurally. */
    ...(wbox?[{label:"Structural margin of safety >= 0",ok:Math.min(wbox.msStress,wbox.msStrain)>=-0.005,
     val:`stress ${(wbox.msStress*100).toFixed(0)}% / strain ${(wbox.msStrain*100).toFixed(0)}% — ${wbox.governingCriterion} governs`}]:[]),
    {label:"Weight-closure margin > 10%",ok:closureMargin>0.10,
     val:`${(closureMargin*100).toFixed(1)}% (empty ${(Wempty/MTOW*100).toFixed(1)}% + batt ${(Wbat/MTOW*100).toFixed(1)}% of MTOW)`},
    {label:"Battery Frac < 55%",ok:Wbat/MTOW<0.55,val:`${(Wbat/MTOW*100).toFixed(1)}%`},
    /* ── BLADE LOADING — THE ROTOR CHECK THIS ENGINE NEVER MADE ────────
       CT/sigma decides whether the rotor can actually produce the thrust the
       rest of the model assumes. Above ~0.14 the blade is stalled in hover and
       the design does not exist; 0.12 is the usual working limit once
       manoeuvre and one-rotor-out margin are wanted. NASA design their UAM
       concept vehicles between 0.060 and 0.113 (Table 12, recoverable from
       their published solidity, disk loading and tip speed). */
    {label:"Blade loading CT/σ < 0.12",
     ok:isFinite(ctSigmaOut)&&ctSigmaOut<0.12,
     val:`${isFinite(ctSigmaOut)?ctSigmaOut.toFixed(3):"n/a"} at σ=${solidityEff.toFixed(3)}, DL ${(DL_hover_out*0.0208854).toFixed(1)} lb/ft² `
       +`(NASA UAM concepts 0.060–0.113; 0.14 is hover stall)`},
    /* ── THE SOLIDITY CLAMP MUST NOT BE SILENT ────────────────────────────
       Blade loading above is computed from the CLAMPED solidity. So a design
       that physically required sigma > 0.40 gets clamped, then reports a
       healthy CT/sigma against the clamped value and PASSES the hover-stall
       check — on a rotor the model just declared unbuildable.
       Vertical VX4 did exactly this: sigma pinned at 0.400, CT/sigma reported
       0.063, check PASSED. NASA's highest published solidity across the four
       Table 12 vehicles is 0.267, so 0.40 is not "aggressive", it is off the
       end of the published world. Report the requirement, not the clamp. */
    /* ── CAN IT BE FLOWN AFTER A ROTOR FAILS, NOT JUST HELD UP ──────────
       The OEI rows above are thrust. This is the moment question, from
       engine/controlauthority.js — which the sizing path never called until
       now, so a design could pass every OEI check while no rotor failure left
       a flyable aircraft. Reported rather than hard-failed, because a zero
       here has two very different causes and only one is a defect: a
       quadrotor cannot hold yaw after any single failure at ANY spin
       arrangement, whereas a hexacopter's answer depends on a spin order this
       tool does not yet let anyone set. */
    ...(acaiOut ? [{
      label:"Controllable after a single rotor failure",
      ok: acaiOut.survivable > 0,
      /* ADVISORY, and the reason is in the val text: a zero here has two causes
         and only one is a defect in the aircraft. Hard-failing every rotor-borne
         design on an unmade spin-arrangement decision would be the same mistake
         as the inapplicable OEI verdict this engine already documents. */
      kind: "advisory",
      val: acaiOut.survivable > 0
        ? `${acaiOut.survivable} of ${acaiOut.of} single-rotor failures leave a `
          + `controllable aircraft (worst ACAI ${acaiOut.worstACAI})`
        : `NONE of ${acaiOut.of} single-rotor failures leaves a controllable `
          + `aircraft at the default alternating spin arrangement `
          + `(worst ACAI ${acaiOut.worstACAI}${acaiOut.limitingAxis ? ", limited in " + acaiOut.limitingAxis : ""}). `
          + (acaiOut.of <= 4
              ? "With four rotors this is a property of the configuration, not of the "
                + "design: removing one leaves three inputs for four axes and yaw cannot "
                + "be trimmed. Category Enhanced continued safe flight and landing is not "
                + "available on this layout without a different control strategy."
              : "Spin ORDER decides this and is not a design variable here — Du, Quan & Cai's "
                + "published hexacopter pair has one arrangement losing control on any failure "
                + "and another surviving four of six, at identical geometry and thrust. "
                + "This is the default arrangement, not the best one."),
    }] : []),
    {label:"Rotor solidity within buildable bound",
     ok:!(solidityReqOut>SOLIDITY_MAX+1e-9),
     val:solidityReqOut>SOLIDITY_MAX+1e-9
       ? `design needs σ=${solidityReqOut.toFixed(3)} but is CLAMPED to ${SOLIDITY_MAX} `
         + `— blade loading above is reported against the clamp, not the requirement `
         + `(NASA's highest published is 0.267)`
       : `σ=${solidityEff.toFixed(3)} required, within the ${SOLIDITY_MAX} bound`},
    /* ── BOOM MASS SANITY ────────────────────────────────────────────────
       Booms are sized from statics, so they report honestly what the GEOMETRY
       demands — and that makes them a good detector of an implausible layout.
       On NASA's reference vehicles they land at 2-5% of MTOW. A number far
       above that means the rotor arrangement itself is not buildable, not that
       the structure is heavy: sixteen 4.2 m rotors need a 10.8 m boom ring by
       non-overlap alone, which drove booms to 61% of MTOW on a 628 kg
       aircraft. Surfaced as a check because the cause is an INPUT (usually an
       unset rotor diameter), and the user is the only one who can fix it. */
    ...(weightGroups?.booms>0?[{label:"Boom mass < 15% of MTOW",
      ok:weightGroups.booms/MTOW<0.15,
      val:`${(100*weightGroups.booms/MTOW).toFixed(1)}% on ${boomOut?.nBooms??"?"} booms, `
        + `arm ${(boomOut?.armM??0).toFixed(2)} m`
        + (boomOut?.wallDriver?` (wall set by ${boomOut.wallDriver})`:"")
        + (weightGroups.booms/MTOW>=0.15
           ? " — check rotor diameter and count: the arm may be forced by rotor non-overlap"
           : "")}]:[]),
    /* ── FINAL STATE OF CHARGE — AND THE DOUBLE-COUNT IT USED TO DO ──────
       This asks whether energy is left in the pack at the end of the mission.
       The answer depends entirely on which energy the pack is quoted in, and
       the check was written for one convention only.

       Under sedBasis "packUsable" the SoC window is ALREADY inside the input:
       the sizing sets socFloor = 0 precisely because the user's figure is net
       usable energy. PackkWh is then, by construction, exactly the mission
       energy — so residual SoC of the usable window is 0% and comparing it
       against socMin applies the same reserve TWICE. That is what made a
       perfectly reasonable multicopter read "-11.1% (floor 16.0%)".

       So the criterion is now convention-aware: with a cell-level figure the
       SoC window is a real remaining margin and is checked; with a pack-usable
       figure the equivalent statement is "usable energy covers the mission",
       which is the Pack check immediately above, and this one reports rather
       than judges. */
    ...(isTE
      ? [{label:"Residual SoC", kind:"advisory", ok:true,
          val:`not applicable — turboelectric: the pack carries no mission energy (zero net flow) and is sized for the engine-out landing`}]
      : packUsableOut
      ? [{label:"Residual SoC", kind:"advisory", ok:true,
          val:`0% by construction — under sedBasis "packUsable" the SoC window is already inside the input figure, so there is no separate reserve to report. Coverage is the usable-pack check above`}]
      /* IT WAS MORE LENIENT THAN THE SIZING, AND THEN IT TURNED OUT NOT TO BE
         A CHECK AT ALL.

         Its floor was socMin/(1+socMin) = 16.0% against the 19% the sizing
         reserves, so it could pass a design the sizing itself would reject.
         Fixing the convention to the sourced one (depth-of-discharge
         0.80-0.85) exposed the real problem: with one convention on both
         sides the relation is TRUE BY CONSTRUCTION. The pack is sized as
         W_E = E_tot/((1-socMin)·SED·eta), so residual SoC is exactly socMin
         whenever energy governs, and strictly above it when battery POWER
         governs instead. It can never fall below.

         MEASURED, not argued: over 343 converged designs spanning specific
         energy 150-400 Wh/kg, socMin 0.05-0.45, range 40-260 km, four
         configurations and three specific-power settings, it failed ZERO times
         and the residual never left 9.3e-6 of the floor.

         This codebase has removed a check for exactly this before — "Motor
         peak >= factor x hover", whose own comment admitted it was "true by
         construction once sized to it" — and learned the same lesson on the
         structural margin-of-safety check. A check that cannot fail inflates
         the pass count and teaches people to trust a green board.

         So it is now REPORTED, and the relationship is gated where it belongs:
         as an identity in validation/identities.mjs, which will fail if the
         sizing and the reported SoC ever stop agreeing. */
      : [{label:"Residual SoC at mission end", kind:"advisory", ok:true,
          val:`${((1-Etot/PackkWh)*100).toFixed(1)}% — equals the socMin floor of `
            + `${(BATT.socFloor*100).toFixed(1)}% BY CONSTRUCTION when energy governs, `
            + `and exceeds it when battery power governs. Depth of discharge `
            + `${(BATT.usableFrac*100).toFixed(0)}% [SRC Antcliff 2019: "discharge to `
            + `15-20% capacity (depth-of-discharge 0.80-0.85)"]. Not a test — the `
            + `relation is gated as an identity; mission coverage is the Pack check above`}]),
    /* -- CRUISE L/D: SOURCED, AND NO LONGER A FEASIBILITY GATE ---------
       This read `{label:"Actual L/D > 10", ok: LDact>10}`: a bare threshold
       with no citation, no configuration dependence, and it gated `feasible`.

       IT WOULD HAVE REJECTED NASA'S OWN REFERENCE AIRCRAFT. "Exploration of
       Design Drivers for the RVLT Lift+Cruise Reference Aircraft" (corpus
       S3270) reports the NDARC solution for that vehicle at a cruise
       lift-to-drag ratio of 9.90, runs its step-by-step trade from 9.5, and
       says of the round number itself:

         "the NDARC aerodynamic inputs were adjusted ... to achieve a target L/D
          of APPROXIMATELY 10, WHICH IT IS ASSUMED THAT A WELL-DESIGNED
          Lift+Cruise configuration COULD ACHIEVE"

       So 10 is an ASPIRATION for a well-designed aircraft, not a floor below
       which a design is invalid, and NASA's own baseline sits under it. The
       published band for this class is 9.5-10.0; the check now uses the LOW
       end, which is the only end readable as a limit.

       IT IS THE SAME QUANTITY AS LDact. S3270 lists "cruise efficiency" and
       "powertrain efficiency" as SEPARATE RST inputs alongside this L/D, so no
       propulsive term is folded in. (Table 12's L/De = WV/P is a different and
       lower quantity - 8.50 for this same vehicle - and must not be compared
       against it. Confusing the two is exactly the error that put a propeller
       term on top of an already-effective L/De once before in this engine.)

       AND IT IS NOW ADVISORY. Falling short of the L/D a class achieves is a
       design-quality signal, not a physical or regulatory violation: NASA ran
       the study at 9.9. Gating `feasible` on an aerodynamic aspiration is what
       made this fail three of six layouts the moment the aircraft got lighter.
       It can still fail, which is the point - a design at 6 is genuinely wrong. */
    /* -- HOVER LOAD FACTOR AGAINST NASA'S PUBLISHED RANGE ---------------
       ADVISORY, and the reason it is not a gate is worth stating: NASA's own
       published weight statements (TM-20210017971 Table 12) are for designs at
       about n_z = 1.00 — the point THIS paper rejects — so a hard floor of 1.35
       would fail the very aircraft the benchmark scores against. Measured:
       moving the default from 1.30 to 1.35 takes that benchmark from 13 of 21
       metrics within +/-5% down to 8. The floor is real guidance and the
       benchmark is a different design point; both are reported rather than one
       being quietly resolved in favour of the other. */
    /* ── THE DESCENT MUST BE FLYABLE, AND NOTHING WAS CHECKING IT ───────
       Vdc = RoC/sin(descent angle) derives the descent SPEED from a rate and
       an angle, so it is whatever the arithmetic returns. At 3 degrees that is
       97 m/s, faster than any layout here cruises; at 15 degrees it is 19.6
       m/s, below stall. The slider offers 2 to 15 degrees and no part of the
       engine compared the result against the envelope it had already computed.
       Bounded below by Vstall — a wing cannot descend slower than it can fly —
       and above by VD, the dive speed the V-n diagram is drawn to. */
    ...(hasWing && Vstall > 0 && VD > 0 ? [{
      label: "Descent speed inside the flight envelope",
      kind: "advisory",
      ok: Vdc >= Vstall - 1e-6 && Vdc <= VD + 1e-6,
      val: (() => {
        const loDeg = Math.asin(Math.min(1, RoC / VD)) * 180 / Math.PI;
        const hiDeg = Math.asin(Math.min(1, RoC / Vstall)) * 180 / Math.PI;
        const window = `a ${RoC.toFixed(2)} m/s rate is flyable between `
          + `${loDeg.toFixed(2)}\u00b0 and ${hiDeg.toFixed(2)}\u00b0 on this aircraft`;
        if (Vdc > VD)
          return `${Vdc.toFixed(1)} m/s at ${desAng.toFixed(1)}\u00b0 exceeds VD = `
            + `${VD.toFixed(1)} m/s (1.25 Vc). The descent is shallow enough that holding `
            + `${RoC.toFixed(2)} m/s down demands a speed past the dive limit \u2014 ${window}.`;
        if (Vdc < Vstall)
          return `${Vdc.toFixed(1)} m/s at ${desAng.toFixed(1)}\u00b0 is below Vstall = `
            + `${Vstall.toFixed(1)} m/s. The descent is steep enough that the aircraft would `
            + `have to fly slower than it can \u2014 ${window}.`;
        return `${Vdc.toFixed(1)} m/s at ${desAng.toFixed(1)}\u00b0, between Vstall `
          + `${Vstall.toFixed(1)} and VD ${VD.toFixed(1)} m/s \u2014 ${window}.`;
      })(),
    }] : []),
    /* ── THE CABIN HAS TO HOLD THE PEOPLE ─────────────────────────
       fusLen and payload were independent sliders. On the multicopter, the
       one layout whose fuselage is not floored by its rotor array, that let
       the body shrink to a two-seat pod while still carrying five occupants'
       mass — and MTOW fell 25% with nothing objecting. The floor area a
       payload needs is the missing constraint. See engine/cabin.js. */
    (() => {
      const ca = cabinAdequacy({ fusLen: fusLenEff, fusDiam: p.fusDiam,
                                 payload: p.payload,
                                 /* nSeats is the UI-facing certification input
                                    (lib/defaults.js); nOccupants stays the
                                    engine-internal name it has always had.
                                    Both default to absent, so the payload
                                    derivation below is unchanged. */
                                 nOccupants: p.nOccupants ?? p.nSeats });
      /* THE ENTERED LENGTH IS NOT THE LENGTH USED. fusLen is multiplied by
         cbrt(payload/453) above, so the slider is honoured only near Joby's
         453 kg payload; at a two-occupant payload an entered 2.2 m becomes
         1.62 m. Nothing in the UI says so, and this is the one output that
         reports cabin geometry, so it says so here. */
      const scaled = Math.abs(fusLenEff - (Number(p.fusLen) || 0)) > 0.02 * Math.max(1e-9, Number(p.fusLen) || 0);
      const scaleNote = scaled
        ? " [body length " + fusLenEff.toFixed(2) + " m, not the " + Number(p.fusLen).toFixed(2)
          + " m entered — fusLen is scaled by (payload/453 kg)^(1/3)]"
        : "";
      return {
        label: "Cabin holds its occupants (" + ca.occupants.toFixed(1) + " at "
             + OCCUPANT_MASS_KG.toFixed(1) + " kg)",
        ok: ca.ok,
        val: ca.ok
          ? ca.providedM2.toFixed(2) + " m² of gross cabin plan for "
            + ca.requiredM2.toFixed(2) + " m² required, "
            + ca.perOccupantM2.toFixed(2) + " m² each" + scaleNote
          : ca.providedM2.toFixed(2) + " m² provided against "
            + ca.requiredM2.toFixed(2) + " m² required — short by "
            + ca.shortfallM2.toFixed(2) + " m². At this width the body must be at "
            + "least " + ca.minFuselageLenM.toFixed(2) + " m, or the payload must drop to "
            + (ca.providedM2 / CABIN_FLOOR_PER_OCCUPANT_M2 * OCCUPANT_MASS_KG).toFixed(0)
            + " kg. Basis is 1.65 m² per occupant from ONE measured two-seat cabin" + scaleNote,
      };
    })(),
    {label:"Hover load factor n_z >= "+NZ_HOVER_MIN+" (continuous motor torque)",
     kind:"advisory", ok:(p.twRatio??0)>=NZ_HOVER_MIN-1e-9,
     val:`n_z = ${(p.twRatio??0).toFixed(2)} g — NASA sweep 1.00–1.77 g, and below `
       + `1.35 g "the operating torque required to hover exceeds the continuous `
       + `operation rated torque ... this design would not be acceptable" `
       + `[SRC VFS 2025, Hartman/Altamirano/Suh]. `
       + ((p.twRatio??0) > NZ_HOVER_MAX
          ? `Above 1.77 g, the largest for which NASA's sizing task converged.`
          : `Installed power scales as n_z^1.5, so this is ${Math.pow(p.twRatio??1,1.5).toFixed(3)}x hover power.`)},
    {label:"Cruise L/D >= "+LD_CLASS_MIN+" (NASA lift+cruise class)",
     kind:"advisory", ok:LDact>=LD_CLASS_MIN,
     val:LDact.toFixed(2)+" — NASA's RVLT lift+cruise reference sits at 9.90 "
       +"(NDARC solution) across a published 9.5–10.0 band, with ~10 stated as "
       +"what \"a well-designed Lift+Cruise configuration could achieve\" "
       +"[SRC S3270]. Aerodynamic L/D, not L/De."},
    {label:"V-tail pitch auth.",ok:pitch_ratio>=1.0,val:`${(pitch_ratio*100).toFixed(0)}%`},
    {label:"V-tail yaw auth.",ok:yaw_ratio>=1.0,val:`${(yaw_ratio*100).toFixed(0)}%`},
    {label:"Mach < 0.45",ok:Mach<0.45,val:`M${Mach.toFixed(3)}`},
    /* ── TAIL AREA, AND THE FUSELAGE LENGTH THAT WOULD FIX IT ──────────
       An oversized tail is almost always a SHORT FUSELAGE problem, and this
       check used to report the symptom without the cause. The engine derives
       the tail arm from the body, lv = 0.88 x fusLen - xACwing, and the tail
       volume relations then give the area:
           S_panel = max( Ch S MAC / (lv cos^2 g), Cv S b / (lv sin^2 g) ) / 2
       Area therefore goes as 1/lv: a big wing on a short body demands an
       impossible tail. Inverting for the arm that brings the ratio into band,
       and then for the body that provides it, turns "116%" into a number the
       user can act on. It is a REPORT, not a feedback loop — nothing is resized
       from it, so it cannot drive the fuselage runaway that scaling length on
       MTOW was measured to cause (see the fusLen provenance entry). */
    (() => {
      const ratio = Svt_total / Swing;
      const ok = ratio >= 0.20 && ratio <= 0.55;
      let advice = "";
      if (!ok && ratio > 0.55 && hasWing) {
        const gam = (p.vtGamma ?? 45) * Math.PI / 180;
        const c2 = Math.max(1e-3, Math.cos(gam) ** 2), s2 = Math.max(1e-3, Math.sin(gam) ** 2);
        /* Svt_total/Swing = max(Ch·MAC/(lv·c2), Cv·b/(lv·s2)); solve for lv. */
        const lvReq = Math.max((p.vtCh ?? 0.45) * MAC / c2,
                               (p.vtCv ?? 0.032) * bWing / s2) / 0.50;
        const fLReq = (lvReq + xACwing) / 0.88;
        if (isFinite(fLReq) && fLReq > p.fusLen)
          advice = ` — the tail is large because the ARM is short: lv = ${lv.toFixed(2)} m. `
                 + `A ${fLReq.toFixed(1)} m fuselage (against ${Number(p.fusLen).toFixed(1)} m) `
                 + `would bring the tail to 50% of wing area. Fuselage length is sized by `
                 + `PAYLOAD here, not gross weight — scaling it on MTOW was tried and is `
                 + `unstable, so this is reported rather than applied.`;
      }
      return { label: "Tail/Wing area 25–50%", ok,
               val: `${(ratio * 100).toFixed(1)}%${advice}` };
    })(),
    /* ── FUSELAGE / SPAN PROPORTION — ADVISORY, NOT A GATE ──────────────
       The 0.50-0.72 band has NO citation, and it is contradicted by the
       published aircraft this tool validates against. Measured at the shared
       7.2 m baseline fuselage:
           Joby S4          span 11.8 m -> 0.610  pass
           Archer Midnight  span 14.3 m -> 0.503  pass
           VX4              span 15.0 m -> 0.480  FAIL
           NASA UAM L+C     span 15.6 m -> 0.462  FAIL
       Two of four fail, including NASA's own fully documented concept vehicle.
       A band that rejects the reference design is not a feasibility criterion.

       THE ROOT CAUSE IS NOT THE BAND, IT IS `fusLen`: it is a fixed input that
       does not scale with the aircraft, so as MTOW and span grow the ratio
       falls by construction. A heavier six-seat aircraft would have a LONGER
       cabin. The real fix is to size the fuselage from the cabin it must
       contain — occupants, seating arrangement, rows — as ICAS 2024 paper 0557
       does. Until then this is reported as a PROPORTION ADVISORY.

       Deliberately NOT fixed by raising the design wing loading to shrink the
       span: W/S is CALIBRATED to Joby and Archer, and tuning a sourced constant
       to satisfy an uncited check would be exactly backwards. */
    /* ── BAND REPLACED WITH MEASURED AIRCRAFT ─────────────────────────
       The old band was 0.50-0.72 and its own text admitted it was uncited AND
       that NASA's own L+C scores 0.462, i.e. the reference vehicle failed it.
       A criterion that its own comment says is unsourced and that the
       benchmark aircraft fails is not a criterion.
       Two measured points now bound it: NASA L+C-E 0.462, and Joby S4 at
       7.32 m over an 11.8 m span = 0.62 [SRC 24 ft length, published span].
       Band widened to 0.40-0.75 to contain both with margin, and labelled for
       what it is.
       AND THE RATIO IS SUPPOSED TO DRIFT: span scales with MTOW, cabin length
       scales with PAYLOAD (see the fuselage note above). A heavier aircraft
       carrying the same five people SHOULD get a smaller ratio. Reading that
       drift as a fuselage defect is what sent this down the wrong path once
       already. */
    {label:"Fus/Span proportion 0.40–0.75",kind:"advisory",
     ok:(fL/bWing)>=0.40&&(fL/bWing)<=0.75,
     val:`${(fL/bWing).toFixed(3)} — measured band: NASA L+C-E 0.462, Joby S4 0.62. `
       +`Expect this to FALL as MTOW grows: span scales with weight, cabin with payload`},
    {label:`Hover T/W ≥ ${TW.toFixed(2)}`,ok:TW>=1.0,val:`${TW.toFixed(2)} (Phov = ${Phov.toFixed(1)} kW)`},
    // Cross-parameter feasibility checks
    {label:"AR vs LD compatible",ok:LDact>=(p.LD*0.70),val:`Act L/D ${LDact.toFixed(1)} vs target ${p.LD} (min 70%)`},
    /* ── A CHECK A LAYOUT CAN NEVER PASS IS A BUG IN THE CHECK ──────────
       "even and >= 4" failed the SIDE-BY-SIDE for having 2 rotors — which is
       what a side-by-side IS. The two requirements are not the same thing:
       EVEN is about yaw-torque balance and applies to everything; >= 4 is
       about generating pitch and roll from DIFFERENTIAL THRUST, which only
       matters where the rotors are the attitude control. A side-by-side
       balances torque with two counter-rotating rotors and controls attitude
       with cyclic, exactly as a helicopter does. So the floor comes from the
       configuration's own definition rather than a universal 4. */
    ...(() => {
      const nDef = CONFIG_DEFAULTS[cfgOut.key]?.nRotors ?? 4;
      const floor = Math.min(4, nDef);
      const even = p.nPropHover % 2 === 0;
      return [{ label: `Rotors: even & ≥ ${floor}`,
        ok: p.nPropHover >= floor && even,
        val: `${p.nPropHover} rotors — even balances yaw torque`
          + (floor >= 4
              ? "; ≥4 needed because this layout controls attitude by differential thrust"
              : `; this layout is defined with ${nDef}, so no differential-thrust floor applies`) }];
    })(),
    /* ── DO THE ROTORS PHYSICALLY FIT? ───────────────────────────────────
       NOTHING CHECKED THIS. A user could specify six 4.2 m rotors on an 18.6 m
       wing — 26.5 m of rotor in 18.6 m of span — and the engine would size it
       happily, because rotor diameter and count are inputs while span is a
       result. Found while resizing the default after AFDD84.

       WINGED: rotors mount on the wing and on fore/aft booms, so they sit in
       ROWS. A layout with booms has two rows (fore and aft of the wing, at
       ROTOR_STATIONS 0.10/0.80 fL); a tiltrotor puts them all on the wing and
       tail in one row. Required span is (rotors per row) x D x (1 + clearance).
       Tip clearance 5% [LAY] — real designs use more, so this is permissive.

       WINGLESS: there is no span to fit into. The governing constraint is the
       VERTIPORT PAD, and that is how the published frameworks do it — ICAS 2024
       paper 0557 sizes the rotors the other way round: "The VTOL propellers are
       sized to fit the maximum possible diameter within a given landing pad
       area in order to keep the disk loading and consequently the hovering
       power low." We do not have a sourced pad dimension, so the array
       footprint is REPORTED and only checked when p.padSizeM is supplied —
       an unsourced default pad would be an invented constraint. */
    ...(() => {
      const D = propDiamEff, clear = 1 + (p.rotorTipClearFrac ?? 0.05);
      if (hasWing) {
        /* ROW COUNT VALIDATED AGAINST A REAL AIRCRAFT, and the first version
           was wrong. Treating a tiltrotor as one row FAILED JOBY S4 — six
           2.9 m rotors would need 18.3 m against its published 11.8 m span —
           and Joby demonstrably flies. The reason is that a tiltrotor with an
           empennage does not put every rotor on the wing: Joby carries four on
           the wing and two on the V-tail. So any layout with booms OR a tail
           distributes over two rows. At two rows Joby needs 9.1 m of 11.8 m
           and passes, which is the check agreeing with reality rather than
           with my first guess. [LAY] — the row assignment is a layout model,
           not a sourced one. */
        const rows = (cfgOut.hasBooms || (cfgOut.capabilities?.nTail ?? 0) > 0) ? 2 : 1;
        const perRow = Math.ceil(p.nPropHover / rows);
        /* ── DISKS MAY OVERHANG THE WINGTIP, AND ON REAL AIRCRAFT THEY DO ──
           This required perRow*D of span, i.e. every disk wholly inboard of the
           tip. That is not how these aircraft are built. The outboard rotor
           CENTRES sit at the tips and the disks overhang, so what has to fit
           between the outermost centres is the (perRow-1) GAPS, each one rotor
           diameter plus clearance:

               b >= (perRow - 1) * D * clear

           Checked against the two published aircraft with a confirmed span AND
           rotor count. Joby S4: 6 rotors, 2 rows -> 3 per row, 2.9 m disks,
           needs (3-1)*2.9*1.05 = 6.1 m against an 11.8 m span. Archer Midnight:
           12 rotors -> 6 per row on a 14.3 m span allows D up to 2.72 m, and
           the disk loading its class implies gives ~2.4 m. Both pass with
           margin, and the OLD form failed the engine's own default 12-rotor
           hybrid (needed 14.9 m of a 13.6 m span) for a layout Archer flies.

           [LAY] still — the row assignment and the tip-mounted-centre
           idealisation are both layout models, not sourced geometry. What is
           sourced is that the old form contradicted flying hardware. */
        const gaps = Math.max(0, perRow - 1);
        const need = gaps * D * clear;
        const overhang = perRow > 1 ? D : 0;   // total width = span + one diameter
        return [{ label:"Rotors fit within the span", ok: need <= bWing + 1e-9,
          val:`${perRow} rotor(s) per row x ${D.toFixed(2)} m: ${gaps} gap(s) need ${need.toFixed(1)} m, span is ${bWing.toFixed(1)} m`
            + ` (${rows} row${rows>1?"s":""}${cfgOut.hasBooms?", fore/aft on booms":rows>1?", wing and tail":", all on the wing"}`
            + `; outboard disks overhang the tip, total width about ${(bWing+overhang).toFixed(1)} m)` }];
      }
      /* Wingless: report the footprint of the rotor array. */
      const perSide = Math.ceil(Math.sqrt(p.nPropHover));
      const span = perSide * D * clear;
      const pad = p.padSizeM;
      return [{ label: pad ? "Rotor array fits the landing pad" : "Rotor array footprint",
        kind: pad ? undefined : "advisory", ok: pad ? span <= pad : true,
        val:`about ${span.toFixed(1)} m across for ${p.nPropHover} x ${D.toFixed(2)} m rotors`
          + (pad ? ` vs a ${pad} m pad` : " — no pad size given, so not checked. ICAS 2024 sizes rotors TO the pad") }];
    })(),
    // Disk loading against published VTOL practice — see the band table above
    /* REMOVED: `Motor peak >= factor x hover`. It compared PpeakKW against
       PhovPerRotorKW*motorReq.factor — but PpeakKW IS that product (line ~909),
       so it read "610 kW vs 610 kW req" and could never fail. The code comment
       beside oeiTransientOK admitted it: "true by construction once sized to
       it". This project already learned the mirror of this lesson on the
       structural margin check — a check that can never pass is noise, and a
       check that can never FAIL is the same noise. Worse, it sat directly
       beside the real one, which says the motor is 96% SHORT of the same
       requirement, so the two contradicted each other on screen.
       The real question — can the motor the weight model actually paid for
       deliver that peak? — is asked by "Motor peak capability >= OEI transient
       requirement" above. PpeakKW remains reported as the REQUIREMENT. */
    /* ── KNOWN OMISSIONS, NOT FAILURES ──────────────────────────────────
       These two can NEVER pass at the default: they mark physics that is
       deliberately not modelled. Rendering them as failed CHECKS meant the
       shipped default could never show a clean board, which trains people to
       ignore the red — exactly the failure mode the checks exist to prevent.
       They are tagged `kind:"omission"` so the UI can list them as
       disclosures, and they are excluded from `feasible` and from the n/m
       count. They are NOT deleted: both bias the design optimistic and must
       stay visible. */
    /* No longer an omission. Kept as a reported line because the magnitude is
       exactly what the old warning was guessing at, and now it can be read. */
    /* WING-BORNE ONLY, AND ON EVERYTHING ELSE IT USED TO SAY "NaN". A neutral
       point and a mean aerodynamic chord exist because a WING does. On the
       multicopter and the side-by-side, MAC is NaN, and this line rendered
       literally "moves NP forward NaN m = NaN% MAC" wherever it was shown —
       the Stability and Certification tabs both display it. Munk's result about
       the fuselage is still true and Cm_alpha,fus is still computed; "how far
       it shifts the neutral point" is simply not a question a rotor-borne
       aircraft has, and answering it with NaN told the user something false. */
    (Number.isFinite(MAC) && MAC > 0
      ? {label:"Fuselage pitch moment in NP",ok:true,
         val:`modelled — Cm_alpha,fus = +${CmaFus.toFixed(3)}/rad (destabilising), `
           +`moves NP forward ${Math.abs(dxNPfus).toFixed(3)} m = ${(Math.abs(dxNPfus)/MAC*100).toFixed(1)}% MAC `
           +`[SRC Munk slender-body, Caughey M&AE 5070 Eq. 2.33; equivalent volume ${fusVol.toFixed(1)} m³ [LAY]]`}
      : {label:"Fuselage pitch moment in NP",ok:true,
         val:`not applicable — this layout is rotor-borne, so it has no wing, no mean `
           +`aerodynamic chord and no neutral point for a fuselage moment to shift. `
           +`Cm_alpha,fus = +${CmaFus.toFixed(3)}/rad is still computed and still `
           +`destabilising [SRC Munk slender-body, Caughey M&AE 5070 Eq. 2.33; `
           +`equivalent volume ${fusVol.toFixed(1)} m³ [LAY]]`}),
    /* ── THE CHECK MUST REPORT WHAT THE ENGINE DID, NOT WHAT WAS TYPED ──
       This read p.downloadFraction — the RAW INPUT — and so announced
       "NOT modelled" on every run where the user had not typed a value, even
       though the engine had already applied a configuration-aware default via
       downloadFractionFor(). The default hybrid genuinely flies with 7.3%
       download and the panel said it was ignoring it. A check that contradicts
       the calculation it is checking is worse than no check. */
    ...(isTE ? [
      {label:"Turboshaft part-power fuel flow and hot-day power",kind:"omission",ok:false,
       val:`NOT modelled — NDARC's simple referred model (TP-20220000355 §21): power lapses as δ√θ, but fuel flow is sfc × power at every setting, and √θ gives MORE power on a hot day. A real turboshaft burns more per kW at part power (cruise fuel here is LOW) and loses power when hot (hot-day ratings here are LOW). Engine rating set by ${teOut.ratingSetBy}`},
      {label:"Turboshaft size inside NASA's engine table (100–4000 hp)",kind:"advisory",
       ok:!teOut.tech.clamped,
       val:`${teOut.tech.hp.toFixed(0)} hp rated; ${teOut.tech.lbPerHp.toFixed(3)} lb/hp and ${teOut.tech.sfcLbPerHpHr.toFixed(3)} lb/hp-hr from Johnson, Silva & Solis 2018 Table 4, interpolated in log(power) [LAY]${teOut.tech.clamped?" — OUTSIDE the table; the end row is used":""}`},
    ] : []),
    {label:"Hover download",kind:"omission",ok:kDLout>0,
     val:kDLout>0
       ? `modelled at ${(kDLout*100).toFixed(1)}% of thrust`
         + (p.downloadFraction!=null ? " (explicit input)"
            : ` — ${downloadBasisFor(cfgOut.key,cfgOut.nTilting,cfgOut.nRotors)}`)
       : `NOT modelled for this layout — no published figure exists for `
         + `${cfgOut.label.split(" —")[0]}. XV-15 measured 14.7% on a tiltrotor; `
         + `set downloadFraction to impose one. Biases hover power LOW`},
    {label:"Sizing loop converged",ok:!r2Diverged,
     val:r2Diverged?`did NOT close after ${itersR2} iters — result unreliable`:`${itersR2} iters`},
    {label:"Disk loading ≤ 25 lb/ft²",ok:DL_hover_out*0.020885<=25,
     val:`${(DL_hover_out*0.020885).toFixed(1)} lb/ft² hover (NASA L+C 15.1, tiltwing 20)`},
  ];

  /* ── CHECKS ARE SCOPED BY CONFIGURATION ──────────────────────────────
     A criterion written for a winged aircraft is not a failure on a rotorcraft,
     it is INAPPLICABLE. Running the full winged board against a multicopter
     produced ten "failures" that were all category errors: static margin in
     %MAC on an aircraft with no MAC, V-tail authority on an aircraft NDARC
     gives nTail=0, wing tip deflection with no wing, tail/wing area ratio,
     AR-vs-L/D, and an L/D floor written for wing-borne cruise.

     This is the same distinction already drawn for omissions and advisories:
     the board should say what it cannot judge rather than judging it wrongly.
     Scoped-out checks are returned separately as `checksNotApplicable` so they
     stay visible and nothing is silently dropped.

     NDARC does this structurally rather than by filtering — a configuration
     with nWing=0 never builds the wing component, so its criteria never exist.
     Filtering is the pragmatic equivalent inside a single-path engine. */
  const WING_ONLY_CHECKS=[
    "Wing tip deflection","Structural margin of safety","Tail/Wing area",
    "AR vs LD compatible","V-tail pitch auth.","V-tail yaw auth.",
    "Cruise L/D",
    "Hover load factor",
    "Cruise thrust loss per failure",
    "Fus/Span","SM ",
  ];
  const isWingOnly=(c)=>WING_ONLY_CHECKS.some(t=>c.label.startsWith(t)||c.label.includes(t));
  const checksScoped = hasWing ? checks : checks.filter(c=>!isWingOnly(c));
  const checksNA     = hasWing ? [] : checks.filter(isWingOnly)
                        .map(c=>({...c,notApplicable:"no wing — criterion is wing-borne"}));

  /* ── ANALYSIS PIPELINE ────────────────────────────────────────────────
     Everything downstream of convergence runs as ordered, named stages.
     See engine/pipeline.js for the contract and the migration status. */
  const analysis = runPipeline([noiseStage], {
    p, Rrotor, RPM, TipSpd, DLrotor, sigma, ChordBl, MTOW, Nbld, T0eff, atmSL, aCr,
  });


  /* ══════════════════════════════════════════════════════════════
     ONE-ENGINE-INOPERATIVE (OEI) — CS-VTOL AMC 27.65 / FAA AC 21.17-4
     Computed here (single source of truth) because three separate UI
     panels previously each re-derived it and could disagree.
     Motors are sized for the installed T/W, so each unit's design
     thrust is MTOW·g·(T/W)/N. After one failure the remaining (N−1)
     units must still support MTOW·g, and each must stay inside its
     peak electrical rating.
     ══════════════════════════════════════════════════════════════ */
  const N_oei_        = Math.max(2, p.nPropHover);
  const W_oei_        = MTOW*g0;
  const T_each_oei    = W_oei_*TW/N_oei_;             // per-motor design thrust (N)
  const T_avail_oei   = (N_oei_-1)*T_each_oei;        // thrust with one unit failed (N)
  const OEI_margin    = (T_avail_oei-W_oei_)/W_oei_*100;   // % margin over hover weight
  const P_mot_nom_oei = Phov/N_oei_;                  // nominal power per motor (kW)
  const P_mot_oei     = Phov/(N_oei_-1);              // per-motor power after failure (kW)
  /* Steady check: can the surviving motors carry the new hover share?
     This is necessary but NOT sufficient — for 6 rotors it is only N/(N-1)=1.2x
     hover power, while NASA measured 2.9-3.8x transient demand during the
     failure itself. Both are reported so the difference is visible. */
  const oeiMotorOK       = P_mot_oei<=PpeakKW;                  // steady share within peak
  const P_mot_transient  = PhovPerRotorKW*motorReq.factor;      // required transient capability
  const oeiTransientOK   = PpeakKW>=P_mot_transient-1e-9;       // true by construction once sized to it
  /* ── A LAYOUT WITH AN INTERCONNECT SHAFT DOES NOT LOSE A ROTOR ────────
     Everything above models ONE ROTOR STOPPING, which is the right failure
     for independent distributed propulsion and the wrong one for a
     cross-shafted aircraft. configuration.js already marks that with
     `oeiThrustShare: false` and cites the interconnect shaft, and
     oeiThrustMarginFor already returns null for it — but this verdict was
     computed anyway, so the side-by-side reported OEI_margin -35% and
     oeiSurvivable FALSE.

     That is the tool answering a question the layout does not ask. -35% is
     just (1/2)(T/W) - 1 with the rotor-loss share applied to two rotors; on
     an aircraft where the shaft keeps both rotors turning through a motor
     failure, the binding condition is POWER on the surviving motors, not
     thrust on the surviving rotors. This engine does not model that
     condition, so the honest output is "not applicable", not "false".

     Reporting a red verdict from an inapplicable test is worse than
     reporting nothing: it invites a fix to a defect that is not there, and
     the real gap — no drive-system failure case — stays hidden. */
  const oeiRotorLossApplies = CONFIG_DEFAULTS[cfgOut.key]?.oeiThrustShare !== false;
  const oeiSurvivable    = oeiRotorLossApplies ? (OEI_margin>0 && oeiMotorOK) : null;
  const oeiBasis = oeiRotorLossApplies
    ? `one of ${N_oei_} independent rotors stops; the rest must hold hover`
    : "NOT APPLICABLE — this layout carries an interconnect shaft, so a motor "
      + "failure does not cost a rotor. The binding case is drive-system power "
      + "after a motor loss, which this engine does not yet model.";

  /* ══════════════════════════════════════════════════════════════════════
     NDARC PARASITE-DRAG CROSS-CHECK
     ══════════════════════════════════════════════════════════════════════
     The rotorcraft community sizes parasite drag as D/q = k(W_MTO/1000)^(2/3)
     with k in ft^2/klb^(2/3). Published reference values (Johnson, NDARC
     theory manual NASA TP-20220000355, section 8-11):
        k = 1.4  turboprop aeroplane
        k = 1.6  current tiltrotor
        k = 2.5  current low-drag helicopter
        k = 9.0  older helicopter
     A winged lift+cruise eVTOL carries exposed hubs, booms and usually fixed
     gear, so it should sit at or above the tiltrotor value. Reporting k lets
     any reviewer check this design against an accepted industry yardstick in
     one number, instead of trusting an opaque CD0 sum.  ══ */
  /* ══════════════════════════════════════════════════════════════════════
     DISK LOADING vs THE PUBLISHED eVTOL DESIGN SPACE
     ══════════════════════════════════════════════════════════════════════
     Hover power goes as sqrt(DL), so disk loading is the single strongest
     lever on installed power — and it is easy to drift out of the credible
     range without noticing, because rotor diameter and count are inputs while
     MTOW is a result.
     Published reference points, lb/ft^2:
       NASA UAM concept vehicles (Johnson & Silva 2022, Table 3)
           quadrotor 3.0-3.5 | side-by-side 4-5 | lift+cruise 11.6-15.1
           tiltwing 20
       conventional helicopters   5-15
       conventional tiltrotors   15-25
     Above ~25 lb/ft^2 an aircraft is outside all of them, and the downwash
     becomes a vertiport safety problem in its own right.  ══ */
  const DL_lbft2 = DL_hover*0.020885;          // hover — comparable to published data
  const DL_installed_lbft2 = DLrotor*0.020885;  // at installed thrust
  const dlVerdict= DL_lbft2 < 5  ? "very low — multicopter class, large rotors"
                 : DL_lbft2 < 15 ? "helicopter / NASA lift+cruise class"
                 : DL_lbft2 < 20 ? "high — NASA tiltwing class"
                 : DL_lbft2 < 25 ? "conventional tiltrotor class, near the limit"
                 :                 "ABOVE published VTOL practice — rotors too small for this MTOW";

  /* THE PRIMITIVE, NOT THE PRESENTATION. CD0tot is null without a wing (line
     ~1370), so CD0tot*Swing reported a total drag area of 0.00 for every
     rotor-borne layout -- while dragAreas.total, the dimensional sum the loop
     actually uses, was correct all along. The comment at the drag buildup
     says "DRAG AREA IS THE PRIMITIVE, CD0 IS A PRESENTATION"; this line was
     still reading the presentation. */
  const Dq_m2   = Number.isFinite(dragAreasOut?.total) ? dragAreasOut.total : (CD0tot*Swing || 0);
  const Dq_ft2  = Dq_m2*10.7639;
  const Wklb    = MTOW*2.20462/1000;
  const kNDARC  = Wklb>0 ? Dq_ft2/Math.pow(Wklb,2/3) : 0;
  const kVerdict= kNDARC<1.4 ? "below turboprop — implausibly clean for a rotor aircraft"
                : kNDARC<1.6 ? "turboprop class — clean, check hubs/booms are counted"
                : kNDARC<2.5 ? "tiltrotor class — plausible for a winged eVTOL"
                : kNDARC<9.0 ? "helicopter class — draggy but within experience"
                :              "worse than an old helicopter — check inputs";

  const fusSpanRatio=hasWing?+(fL/bWing).toFixed(3):null;
  const tailWingRatio=+(Svt_total/Swing).toFixed(4);

  return {
    MTOW:+MTOW.toFixed(2),MTOW1:+MTOW1.toFixed(2),Wempty:+Wempty.toFixed(2),Wbat:+Wbat.toFixed(2),
    Phov:+Phov.toFixed(2),Pcl:+Pcl.toFixed(2),Pcr:+Pcr.toFixed(2),Pdc:+Pdc.toFixed(2),Pres:+Pres.toFixed(2),
    tto:+tto.toFixed(1),tcl:+tcl.toFixed(1),tcr:+tcr.toFixed(1),tdc:+tdc.toFixed(1),tld:+tld.toFixed(1),tres:+tres.toFixed(1),
    Tend:+Tend.toFixed(1),
    /* THE MISSION AS A PATH, not just as durations and powers.
       Every one of these is already computed above and was simply not
       reaching the result. Anything that draws the mission needs them,
       and a second module that re-derived them from cruiseAlt and the
       angles would be the two-implementations failure profile.js:23-30
       warns about: the drawing and the sizing would drift apart and
       both would look right.

       hoverClimbRateMS IS THE ONE THAT MATTERS. The 200-sample trace
       below uses a bare 0.5 m/s for the vertical legs, but the sizing
       has not charged energy at that rate since tto became the sourced
       30 s (see the note at the tto assignment). The rate the aircraft
       ACTUALLY flies is the hover height divided by that time, and a
       drawing that used 0.5 would show an aircraft reaching hover
       height at a moment its own energy budget disagrees with. */
    climbHeightM:+climbHeight.toFixed(2),climbRunM:+ClimbR.toFixed(1),
    descentRunM:+DescR.toFixed(1),cruiseRunM:+CruiseRange.toFixed(1),
    climbSpeedMS:+Vcl.toFixed(2),climbRateMS:+RoC.toFixed(3),
    hoverClimbRateMS:+(hvtol/(p.hoverTimeTakeoffS??HOVER_S_DEFAULT)).toFixed(4),
    Eto:+Eto.toFixed(3),Ecl:+Ecl.toFixed(3),Ecr:+Ecr.toFixed(3),Edc:+Edc.toFixed(3),Eld:+Eld.toFixed(3),Eres:+Eres.toFixed(3),Etot:+Etot.toFixed(3),
    Swing:rn(Swing,2),WL:rn(WL,1),bWing:rn(bWing,2),Cr_:rn(Cr_,3),Ct_:rn(Ct_,3),
    MAC:+MAC.toFixed(3),Ymac:+Ymac.toFixed(3),Xac:+Xac.toFixed(3),sweep:+sweep.toFixed(2),Re_:+Re_.toFixed(0),Mach:+Mach.toFixed(4),
    selAF,afScored,LDact:rn(LDact,2),CD0tot:rn(CD0tot,7),CDi:rn(CDi,7),CDtot:rn(CDtot,7),
    // Wing sizing (engine/wing.js) — CL is now derived, not asserted
    CLcruise:rn(CLcruise,6), wingLoadingNm2:rn(WL,1),
    wingLoading_kgm2:rn(WL/9.80665,1), wingAreaDriver:wingSize.driver,
    groupSums:groupSumsOut,
    /* Drive-system detail (null under the ewf weight model). Carries the gear
       ratio actually used, the resulting motor rpm, and the gearbox/rotor-shaft
       split — so a geared design can be audited rather than just totalled. */
    driveSystem:driveOut,
    /* Which rotor weight model ran, the chord it derived from solidity, and the
       blade/hub split. Exposed because the model choice materially changes the
       structure group and must be auditable. */
    rotorGroupDetail:rotorOut,
    /* COAXIAL ARRANGEMENT — emitted so the trade is visible rather than
       buried: kappa is the induced-power interference of a contra-rotating
       pair, stations is how many arms carry the rotors. */
    rotorArrangement: isCoaxial ? "coaxial" : "coplanar",
    coaxKappa: +kCoax.toFixed(4),
    /* NDARC 12-5.1.3 twin-rotor overlap factor on hover induced power: 1 for
       every layout but the side-by-side. It was applied and never reported,
       so no independent check could reproduce side-by-side hover power. */
    twinKappa: +kTwin.toFixed(6),
    /* ── POWERTRAIN (engine/turboelectric.js) ─────────────────────────
       Battery aircraft report 0 fuel and null for the turboshaft items. */
    powertrain: isTE ? "turboelectric" : "battery",
    fuelMassKg: isTE ? +teOut.fuelKg.toFixed(2) : 0,
    fuelBurnKg: isTE ? +teOut.fuelBurnKg.toFixed(2) : 0,
    fuelReserveKg: isTE ? +teOut.fuelReserveKg.toFixed(2) : 0,
    fuelEnergyBurnMJ: isTE ? +(teOut.fuelBurnKg*42.8).toFixed(1) : 0,
    turboshaftRatedKW: isTE ? +teOut.ratedKW.toFixed(1) : null,
    turboshaftHoverAvailKW: isTE ? +(teOut.ratedKW*referredLapse(atmHov)).toFixed(1) : null,
    turboshaftMassKg: isTE ? +teOut.engineKg.toFixed(2) : null,
    turboshaftSfcKgPerKWh: isTE ? +teOut.tech.sfcKgPerKWh.toFixed(4) : null,
    turboshaftOutsideTable: isTE ? teOut.tech.clamped : null,
    generatorRatedKW: isTE ? +teOut.generatorKW.toFixed(1) : null,
    generatorMassKg: isTE ? +teOut.generatorKg.toFixed(2) : null,
    fuelTankMassKg: isTE ? +teOut.tankKg.toFixed(2) : null,
    emergencyPackKWh: isTE ? +teOut.emergencyEnergyKWh.toFixed(3) : null,
    packSizedBy: isTE ? `emergency ${teOut.batterySizedBy}` : (WE_out>=WP_out ? "mission energy" : "hover power"),
    coaxThrustRatio: isCoaxial ? (p.coaxThrustRatio ?? COAX_THRUST_RATIO_DEFAULT) : null,
    nRotorStations,
    /* Flight controls: which model ran and what base it scaled on. Exposed
       because the base (airframe vs MTOW) is the whole finding there. */
    flightControlsDetail:fcOut,
    /* Boom geometry and mass split. Exposed because the boom model is sized
       from statics on three [LAY] geometric assumptions, so the arm and
       radius it actually used must be visible to be challenged. */
    boomDetail:boomOut,
    /* RAW component masses, unrounded and unlabelled (null under the ewf model).
       `weightBreak` is the display form: relabelled, rounded and sorted, which
       makes it lossy for analysis. Benchmarks need to re-roll components onto
       whatever group boundary the reference document uses — NDARC's weight
       statement puts the rotor group under STRUCTURE and the battery under
       PROPULSION, neither of which matches our internal groupSums split. */
    weightGroupsRaw:weightGroups,
    sedBasis:p.sedBasis??"cell", sedEffUsable:+((packUsableOut?1:1)*0+sedEffOut).toFixed(1),
    missionBasis:p0.missionBasis??null,
    missionBasisLabel:MISSION_BASES[p0.missionBasis]?.label??"custom (parameters as given)",
    headwindMS:p.headwindMS??0, reserveMinutesUsed:+reserveMinutes.toFixed(2),
    reserveBasisUsed:reserveBasis, reserveDistanceKmUsed:+(reserveDistM/1000).toFixed(2),
    reserveSpeedMS:+Vres.toFixed(2),
    sizingDay:p.sizingDay??null, sizingDayLabel:SIZING_DAYS[p.sizingDay]?.label??"custom (fieldElev/deltaISA as given)",
    fieldElevM:fieldElev, deltaISA_used:p.deltaISA||0,
    nCruiseUnits:nCruiseUnitsOut, cruiseDutyFrac:+cruiseDutyFrac.toFixed(3),
    cruiseThrustLossPerFailurePct:nCruiseUnitsOut?+(100/nCruiseUnitsOut).toFixed(0):null,
    // Configuration (engine/configuration.js) — one place, explicit
    configType:cfgOut.key, configLabel:cfgOut.label, configNote:cfgOut.note,
    nRotorsStoppedResolved:cfgOut.nStopped, hubsExposedResolved:cfgOut.hubsExposed,
    hasCruisePropResolved:cfgOut.hasCruiseProp, hasBoomsResolved:cfgOut.hasBooms,
    configExplicitOverride:cfgOut.explicitOverride,
    // Avionics architecture (engine/avionics.js)
    avionicsMassKg:avOut?+avOut.mass.toFixed(1):null,
    avionicsLanes:avOut?avOut.lanes:null,
    avionicsCategory:avOut?avOut.category:null,
    avionicsArchitecture:avOut?avOut.architecture:null,
    avionicsItems:avOut?avOut.items:null,
    // Battery thermal / BMS / installation (engine/battery-thermal.js)
    PheatCruise:+PheatCruise.toFixed(1),
    btmsMassKg:+btms.btms.toFixed(1), bmsMassKg:+btms.bms.toFixed(1),
    packMountMassKg:+btms.mounts.toFixed(1), packContainmentKg:+btms.containment.toFixed(1),
    packSystemsMassKg:+btms.mass.toFixed(1),
    packSystemsFracPack:+(btms.massFracPack*100).toFixed(1),
    btmsRejectKW:+(btms.QrejectW/1000).toFixed(1), btmsFracPack:+(btms.btmsFracPack*100).toFixed(1),
    btmsCapped:btms.btmsCapped,
    cellDTHoverK:+btms.dTHoverK.toFixed(1), cellPeakC:+btms.tPeakC.toFixed(1),
    cellWithinMax:btms.withinMax, cellWithinOptimal:btms.withinOpt,
    cruiseThermalBalanced:btms.cruiseBalanced,
    packLocation:btms.packLocation, packLocationLabel:btms.locationLabel,
    packLoadFactorGoverning:btms.nGoverning, packLoadFactors:btms.loadFactors,
    // Landing gear (engine/landinggear.js) — CS 27.725/727 per MOC VTOL.2305
    gearMassKg:gearOut?+gearOut.mass.toFixed(1):null,
    gearMassFracMTOW:gearOut?+(gearOut.massFracMTOW*100).toFixed(2):null,
    gearStrokeMm:gearOut?+(gearOut.strokeFittedM*1000).toFixed(0):null,
    gearDropVLimitMs:gearOut?+gearOut.vLimitMs.toFixed(2):null,
    gearDropVReserveMs:gearOut?+gearOut.vReserveMs.toFixed(2):null,
    gearBottomsOut:gearOut?gearOut.bottomsOut:null,
    tyreMain:gearOut?`${gearOut.tyreMain.size} ${gearOut.tyreMain.ply}-ply ${gearOut.tyreMain.type} @ ${gearOut.tyreMain.psi} psi`:null,
    tyreMainRatedLb:gearOut?gearOut.tyreMain.loadLb:null,
    tyreMainRequiredLb:gearOut?gearOut.tyreMain.requiredLb:null,
    tyreMainMarginPct:gearOut?gearOut.tyreMain.marginPct:null,
    tyreMainAdequate:gearOut?gearOut.tyreMain.adequate:null,
    tyreNose:gearOut?`${gearOut.tyreNose.size} ${gearOut.tyreNose.ply}-ply`:null,
    // Structural load cases (engine/loadcases.js) — SC-VTOL VTOL.2215(f)
    nLimit:+alf.nLimit.toFixed(3), nUltimate:+alf.nUltimate.toFixed(3),
    nLimitNeg:+alf.nLimitNeg.toFixed(3),
    /* Null unless the buildup actually produced the final weights: when the
       last iteration fell back to the ewf fraction, no structure was sized to
       any load factor, and reporting the one handed to the buildup would say
       otherwise (golden case sweep-178 did exactly that). */
    weightsNzUltimate:(nzWeightsOut==null || p.weightModel!=="buildup" || lastIterFellBack)
      ? null : +nzWeightsOut.toFixed(3),
    loadFactorBasis:alf.basis, loadFactorSource:alf.source,
    loadGoverningCase:alf.governingCase, gustGoverns:lcase?lcase.gustGoverns:null,
    gustAlleviationKg:lcase?+lcase.gustAlleviation.toFixed(4):null,
    massRatioMu:lcase?+lcase.massRatio.toFixed(2):null,
    gustCases:lcase?lcase.gusts.map(x=>({label:x.label,V:+x.V.toFixed(1),
      deltaN:+x.deltaN.toFixed(3),nLimit:+x.nLimit.toFixed(3)})):null,
    // Wing box detail design (engine/wingbox.js) — design, not mass
    wingBoxMassKg: (wbox?+wbox.mass.toFixed(1):null), wingBoxPrimaryKg: (wbox?+wbox.boxMass.toFixed(1):null),
    wingBoxFPrim: (wbox?+wbox.fPrim.toFixed(3):null),
    wingBoxVsCorrelationPct: (wbox && weightGroups?.wing)
      ? +((wbox.mass/weightGroups.wing-1)*100).toFixed(1) : null,
    rootBendingKNm: (wbox?+(wbox.rootBendingNm/1000).toFixed(1):null),
    rootShearKN: (wbox?+(wbox.rootShearN/1000).toFixed(1):null),
    rootCapAreaMm2: (wbox?+(wbox.rootCapArea*1e6).toFixed(0):null),
    rootWebThkMm: (wbox?+(wbox.rootWebThk*1000).toFixed(2):null),
    rootSkinThkMm: (wbox?+(wbox.rootSkinThk*1000).toFixed(2):null),
    rootEI_MNm2: (wbox?+(wbox.rootEI/1e6).toFixed(2):null),
    rootStressMPa: (wbox?+(wbox.rootStressPa/1e6).toFixed(1):null),
    rootStrainMicro: (wbox?+(wbox.rootStrain*1e6).toFixed(0):null),
    msStress: (wbox?+wbox.msStress.toFixed(3):null), msStrain: (wbox?+wbox.msStrain.toFixed(3):null),
    structGoverning: (wbox?wbox.governingCriterion:null),
    skinConstruction: (wbox?wbox.skinConstruction:null), governingSkinMode: (wbox?wbox.governingSkinMode:null),
    skinAllowableMPa: (wbox?+(wbox.rootSkinBucklingPa/1e6).toFixed(1):null),
    tipDeflectionMm: (wbox?+(wbox.tipDeflectionM*1000).toFixed(0):null),
    tipDeflectionPct: (wbox?+(wbox.tipDeflectionFrac*100).toFixed(1):null),
    tipDeflectionOK: (wbox?wbox.tipDeflectionOK:null),
    nRibs: (wbox?wbox.nRibs:null), ribPitchMm: (wbox?+(wbox.ribPitch*1000).toFixed(0):null),
    aileronAreaM2: (wbox?+wbox.aileronAreaM2.toFixed(2):null),
    closureMargin:+closureMargin.toFixed(4), closureFrac:+closureFrac.toFixed(4), payloadFrac:+payloadFrac.toFixed(4),
    battSpecPowerKWkg:+spBattery.toFixed(3), maxCRate:p.maxCRate??4.0,
    battPowerLimited:WP_out>=WE_out, WE_kg:+WE_out.toFixed(1), WP_kg:+WP_out.toFixed(1),
    SM:+SM.toFixed(4), CLaW:+CLaW.toFixed(4), CLaH:+CLaH.toFixed(4),
    // CG model (engine/cg.js)
    cgBasis:cg.basis, cgItemised:cg.itemised, cgStations:cg.stationOf,
    xRotFwd:+cg.xRotFwd.toFixed(3), xRotAft:+cg.xRotAft.toFixed(3),
    xRotCentroid:+cg.xRotCentroid.toFixed(3),
    hoverFwdThrustShare:+cg.hoverFwdThrustShare.toFixed(4),
    hoverLoadedRotorRatio:+cg.hoverLoadedRotorRatio.toFixed(4),
    cgWithinRotorArray:cg.cgWithinRotorArray,
    // Static-margin criterion (augmentation-dependent)
    smCriterion:smCrit.key, smCriterionLabel:smCrit.label,
    smMin:smCrit.smMin, smMax:smCrit.smMax, smAdvisory:smCrit.advisory,
    smBasis:smCrit.basis, smGovernedBy:smCrit.governingCriterion,
    weightBreakBasis,
    tailSlopeRatio:+tailSlopeRatio.toFixed(4), wingLEfrac:+wingLEfrac.toFixed(4),
    targetSM, wingLEfracForTargetSM, wingStationSM,
    downwashGrad:+dw.toFixed(4), etaH,xCGtotal:+xCGtotal.toFixed(3),xNP:+xNP.toFixed(3),xCGempty:+xCGempty.toFixed(3),xACwing:+xACwing.toFixed(3),
    Drotor:+Drotor.toFixed(3),DLrotor:+DLrotor.toFixed(1),PLrotor:+PLrotor.toFixed(1),
    TipSpd:+TipSpd.toFixed(1),TipMach:+TipMach.toFixed(4),RPM:+RPM.toFixed(0),
    ChordBl:+ChordBl.toFixed(4),BladeAR:+BladeAR.toFixed(2),Nbld,PmotKW:+PmotKW.toFixed(2),
    PpeakKW:+PpeakKW.toFixed(2),Torque:+Torque.toFixed(1),MotMass:+MotMass.toFixed(2),
    SEDpack:+SEDpack.toFixed(1),Nseries,Npar,Ncells,PackV:+PackV.toFixed(0),PackAh:+PackAh.toFixed(1),
    PackkWh:+PackkWh.toFixed(3), PackUsablekWh:+PackUsablekWh.toFixed(3),
    PackInstalledkWh:+PackInstalledkWh.toFixed(3),CrateHov:+CrateHov.toFixed(2),CrateCr:+CrateCr.toFixed(2),Pheat:+Pheat.toFixed(1),
    Vstall:+Vstall.toFixed(2),VA:+VA.toFixed(2),VD:+VD.toFixed(2),
    vnData,rpData,rpFerryPoint,ferryRange:+ferryRange.toFixed(1),maxPayloadRp:+maxPayload.toFixed(0),polarData,powerSteps,socSteps,velSteps,energySteps,convData,twSweepData,tolSweepData,weightBreak,dragComp,tPhases,
    /* `feasible` and the pass count consider real CHECKS only. Omissions are
       disclosures about the model, not verdicts on the design. */
    checks:checksScoped,
    feasible:checksScoped.filter(chk=>!chk.kind).every(chk=>chk.ok),
    checksPassed:checksScoped.filter(chk=>!chk.kind&&chk.ok).length,
    checksTotal:checksScoped.filter(chk=>!chk.kind).length,
    omissions:checksScoped.filter(chk=>chk.kind==="omission"),
    advisories:checksScoped.filter(chk=>chk.kind==="advisory"),
    /* Criteria that are UNPUBLISHED for this layout rather than unmet by it.
       Kept in their own bucket so a UI never renders "the literature has no
       column for your aircraft" in the same list as "your aircraft fails". */
    indeterminates:checksScoped.filter(chk=>chk.kind==="indeterminate"),
    checksNotApplicable:checksNA,
    missionRange:+(p.range-reserveDistM/1000).toFixed(1), reserveDistKm:+(reserveDistM/1000).toFixed(1), totalRange:+p.range.toFixed(1),
    Trotor:+Trotor.toFixed(1),TW_hover:+TW_hover.toFixed(3),TW_cruise:+TW_cruise.toFixed(3),
    vnBasis,
    itersR1,itersR2,r2Converged,r2Diverged,
    /* the threshold as APPLIED, so the convergence plot's reference line sits
       where the test really was rather than at the raw exponent */
    tol:tolFor(MTOW), convEps,
    /* The certification basis, carried as data so the UI and the report can
       state WHICH limit was applied instead of implying a universal one. */
    /* Emitted so the boom count is auditable next to the boom mass it sized —
       the two disagreeing is exactly the defect this value was fixed for. */
    boomCount: boomOut?.nBooms ?? 0,
    motorTorqueNm:+motorTauOut.toFixed(1), motorModelExtrapolated:motorExtrapOut,
    /* Whether NASA Table 4 describes this aircraft at all. Carried as data so
       the UI can say "unpublished for this layout" instead of "short". */
    /* Battery efficiency AS APPLIED. etaBat is the raw input; etaBatEffective
       is what the sizing used once NASA's vertical-flight scoping is applied,
       and the two differ by roughly 10% on a normal mission. Reported so the
       difference is visible rather than buried. */
    etaBatEffective:+etaBatEffOut.toFixed(4),
    EvertKWh:+EvertOut.toFixed(3),
    etaBatScope:(p.etaBatScope??"verticalOnly"),
    motorTransientDeterminate: motorReq.determinate,
    motorTransientInterconnected: motorReq.interconnected,
    motorTransientIndeterminateReason: motorReq.indeterminateReason,
    motorTransientFactorFloor: motorReq.factorFloor,
    motorTransientFactorCeiling: motorReq.factorCeiling,
    mtomLimitKg: isFinite(mtomLimit)?+mtomLimit.toFixed(0):null,
    mtomMarginKg: isFinite(mtomLimit)?+(mtomLimit-MTOW).toFixed(0):null,
    withinMTOM: isFinite(mtomLimit)?MTOW<=mtomLimit:true,
    mtowCeilingKg:+mtowCeiling.toFixed(0), mtowCeilingHit,
    /* Solver diagnostics — which method actually closed the design */
    solverMethod:p.solver==="fixed-point"?"fixed-point":"fixed-point → secant (bisection fallback)",
    solverPhaseFinal:solverPhase, solverSecantSteps:secantSteps,
    solverBisectSteps:bisectSteps, solverBracketed:brLo!=null,
    noSolutionBelowCertLimit, mtowCertLimitKg:certLimit,
    vtGamma_opt:+vtGamma_opt_deg.toFixed(1),Svt_total:+Svt_total.toFixed(3),Svt_panel:+Svt_panel.toFixed(3),governs_pitch:Svt_panel_pitch>=Svt_panel_yaw,ruddervator_combined_auth:+ruddervator_combined_auth.toFixed(3),delta_yaw_rv_deg:+delta_yaw_rv_deg.toFixed(2),
    Sh_req:+Sh_req.toFixed(3),Sv_req:+Sv_req.toFixed(3),Sh_eff:+Sh_eff.toFixed(3),Sv_eff:+Sv_eff.toFixed(3),
    /* ── CONVENTIONAL TAIL, RAVEN'S ARRANGEMENT ────────────────────────
       Reported whichever tail is built, so the two can always be compared,
       with `tailType` saying which one the aircraft actually carries. */
    tailType: tailConventional ? "conventional" : "vee",
    finArea:+finG.S.toFixed(3), finSpan:+finG.b.toFixed(3),
    finRootChord:+finG.cr.toFixed(3), finTipChord:+finG.ct.toFixed(3),
    finMAC:+finG.mac.toFixed(3), finSweep:+finG.sweep.toFixed(2), finAR:+AR_fin.toFixed(3),
    stabArea:+stabG.S.toFixed(3), stabSpan:+stabG.b.toFixed(3),
    stabRootChord:+stabG.cr.toFixed(3), stabTipChord:+stabG.ct.toFixed(3),
    stabMAC:+stabG.mac.toFixed(3), stabSweep:+stabG.sweep.toFixed(2), stabAR:+AR_stab.toFixed(3),
    ventralArea:+ventG.S.toFixed(3), ventralSpan:+ventG.b.toFixed(3),
    ventralRootChord:+ventG.cr.toFixed(3), ventralTipChord:+ventG.ct.toFixed(3),
    tailWeightConventional:+Wtail_conv.toFixed(1),
    pitch_ratio:+pitch_ratio.toFixed(3),yaw_ratio:+yaw_ratio.toFixed(3),
    bvt_panel:+bvt_panel.toFixed(3),Cr_vt:+Cr_vt.toFixed(3),Ct_vt:+Ct_vt.toFixed(3),MAC_vt:+MAC_vt.toFixed(3),
    sweep_vt:+sweep_vt.toFixed(2),Srv:+Srv.toFixed(3),Wvt_total:+Wvt_total.toFixed(1),
    CD0vt:+CD0vt.toFixed(6),SM_vt:+SM_vt.toFixed(4),delta_rv_deg:+delta_rv_deg.toFixed(2),
    lv:+lv.toFixed(3),
    fusSpanRatio,tailWingRatio,
    // NDARC parasite-drag cross-check
    /* 4 dp, not 2. At multicopter disk loadings (~2.6 lb/ft2) two decimals is
       only 3 significant figures, a 0.2% quantisation that sits exactly on the
       identity tolerance and failed it. Presentation rounding belongs in the
       display layer (lib/format sig3), not in the engine's own outputs. */
    DL_lbft2:+DL_lbft2.toFixed(4), DL_installed_lbft2:+DL_installed_lbft2.toFixed(4),
    /* Blade loading and the solidity that produced it — the rotor design point. */
    ctSigma:isFinite(ctSigmaOut)?+ctSigmaOut.toFixed(4):null,
    solidityUsed:+solidityEff.toFixed(4),
    solidityBasis:p.solidity!=null?"explicit input"
      :(p.designCTsigma!=null?`derived from design CT/σ ${p.designCTsigma} (user input)`
        :`derived from design CT/σ ${ctSigmaDesign.value.toFixed(4)} — ${ctSigmaDesign.basis}`),
    designCTsigma:+(p.designCTsigma ?? ctSigmaDesign.value).toFixed(4),
    /* The download fraction the loop APPLIED (kDLout), not the raw input with a
       0.10 fallback. That fallback was reported for every run without an
       explicit value, although the loop had used downloadFractionFor() — 0 for
       lift+cruise, 7.3% for the default hybrid, 14.69% for a tiltrotor. Found
       when validation/identities.mjs was first run on every layout. */
    DL_hover_Nm2:+DL_hover.toFixed(1), dlVerdict, downloadFraction:+kDLout.toFixed(4),
    Dq_m2:+Dq_m2.toFixed(3), Dq_ft2:+Dq_ft2.toFixed(2), kNDARC:+kNDARC.toFixed(2), kVerdict,
    /* Component drag AREAS in m^2 — the NDARC primitive (Theory section 8).
       Reported so the drag buildup is auditable without a wing reference, and
       so a wingless configuration has something to report at all. */
    dragAreas:dragAreasOut,
    CD0hub:rn(CD0hub,5), CD0blade:rn(CD0blade,5), CD0gear:rn(CD0g,5),
    // Analysis-pipeline outputs (acoustics, and future stages)
    ...analysis,
    /* Propulsion sizing conditions (engine/sizing-conditions.js) — installed
       power is the MAXIMUM over a set of design conditions, per NDARC 3-1.1,
       rather than a fixed multiple of hover power. */
    PmotInstalledKW: PmotInstalledOut!=null?+PmotInstalledOut.toFixed(2):null,
    PmotLegacyKW: sizeCondOut?+sizeCondOut.legacyKW.toFixed(2):null,
    motorSizedBy: sizeCondOut?sizeCondOut.governing.label:null,
    motorSizingConditions: sizeCondOut?sizeCondOut.conditions.map(c=>({
      key:c.key, label:c.label, kW:+c.kW.toFixed(2), duty:c.duty, basis:c.basis,
    })):null,
    motorSizingRatioVsHover: sizeCondOut&&sizeCondOut.hoverPerMotorKW>0
      ? +(sizeCondOut.installedKW/sizeCondOut.hoverPerMotorKW).toFixed(3) : null,
    /* Descent regeneration — reported so the convention is visible, not silent */
    PdcRawKW:+PdcRawOut.toFixed(2), regenAvailableKW:+regenCreditKW.toFixed(2),
    /* What the descent ACTUALLY flew. The angle is a user input when given and
       the aircraft's own glide angle when not, so with the default unset it
       differs per layout — 5.1 deg on the tiltrotor to 9.8 deg on the
       multicopter — and a reader cannot tell which without these. */
    /* MOC VTOL.2120 — the category's own climb requirement. Reported whole
       because the category, the critical failure and the caveat matter as
       much as the number. */
    certClimbCategory: certClimbOut.category,
    certClimbGradientPct: certClimbOut.gradientPct,
    certClimbRequiredPct: certClimbOut.requiredPct,
    certClimbPass: certClimbOut.pass,
    certClimbCFP: certClimbOut.cfp,
    certClimbBasis: certClimbOut.basis,
    certClimbNote: certClimbOut.note || null,
    certClimbUnitsAvailable: certClimbOut.unitsAvailable,
    vtolCategory: p.vtolCategory ?? "enhanced",
    descentAngleUsedDeg:+desAng.toFixed(2), descentSpeedMS:+Vdc.toFixed(2),
    descentRateMS:+RoD.toFixed(3),
    regenCredited:p.regenDescent===true,
    // Empty-weight model outputs
    weightModel:p.weightModel||"fraction", weightGroups,
    /* Did the component buildup actually produce the empty weight, or did the
       guard substitute the ewf fraction? Reported because the difference is
       the whole meaning of `weightModel`. */
    /* TRUE when the CONVERGED design is a component buildup. Early-iteration
       fallbacks are reported separately below rather than condemning the run. */
    weightBuildupUsed: (p.weightModel==="buildup") && !lastIterFellBack,
    weightBuildupFellBackAtConvergence: lastIterFellBack,
    weightBuildupFallbackMTOW: lastIterMTOW!=null?+lastIterMTOW.toFixed(1):null,
    weightBuildupFallbacks: buildupFallbacks,
    weightBuildupLastTotal: lastFallbackTotal!=null&&isFinite(lastFallbackTotal)
      ? +lastFallbackTotal.toFixed(1) : null,
    ewfImplied:+(Wempty/MTOW).toFixed(4),
    /* ── DO THE REPORTED PARTS ADD UP TO THE REPORTED WHOLE? ──────────
       They do on a converged design, exactly: the loop exits with
       MTOW = payload + Wempty + Wbat, so the closure identity holds to the
       last bit and only the ITERATE the weights were evaluated at differs,
       by less than the convergence tolerance.

       They do NOT on a design that failed to close. The ceiling guard breaks
       while MTOW still holds the iterate the weights were built at, and the
       sum of those weights is the NEXT iterate — so the gap is exactly the
       final residual, and it is large because that is what non-convergence
       MEANS. Measured on six runs: 595 kg to 4,622 kg, up to 33% of the
       reported MTOW.

       Before this, nothing said so. The identities gate asserts weight
       closure but skips every diverged design (`if (R.r2Diverged) continue`),
       which is precisely the set where it fails. Emitting the gap makes the
       discrepancy a number a reader can see and a gate can check, instead of
       something you find by adding up the weight table by hand. */
    massBalanceGapKg:+((p.payload+Wempty+Wbat+WfuelOut)-MTOW).toFixed(2),
    // Configuration echo — UI panels read these off SR rather than params
    nPropHover:p.nPropHover, propDiam:+propDiamEff.toFixed(3),
    fusLen:+fusLenEff.toFixed(3), fusLenInput:p.fusLen, fusLenScaled:scaleFusLen,
    /* Rotor-array fit, reported whether or not it bound anything. */
    rotorFitMaxDoverFL:+maxDoverFL.toFixed(4),
    rotorFitDoverFL: Number.isFinite(p.propDiam) && fusLenEff>0
      ? +(p.propDiam/fusLenEff).toFixed(4) : null,
    rotorFitLengthNeededM:+fusLenForRotors.toFixed(3),
    fusLenGrownForRotors,
    propDiamInput:p.propDiam, rotorSizedToDiskLoading:sizeRotorToDL,
    // Atmosphere — returned so panels use the SAME density the engine sized with
    rhoCr:+rhoCr.toFixed(5), rhoHov:+rhoHov.toFixed(5), aCr:+aCr.toFixed(2),
    // OEI outputs (single source of truth — see block above)
    oeiSurvivable, oeiMotorOK, oeiRotorLossApplies, oeiBasis,
    OEI_margin_pct:+OEI_margin.toFixed(2),
    oeiControllability: acaiOut,
    P_mot_nom_kW:+P_mot_nom_oei.toFixed(2),
    // Motor transient sizing (NASA Table 4)
    motorTransientFactor:motorReq.factor, motorTransientGovernedBy:motorReq.governedBy,
    motorTransientColumn:motorReq.column, motorTransientCriteria:motorReq.criteria,
    motorTransientSubstituted:motorReq.substituted, rotorControl:motorReq.control,
    PpeakLegacyKW:+PpeakLegacyKW.toFixed(2), oeiTransientOK,
    P_mot_oei_kW:+P_mot_oei.toFixed(2),
    T_each_oei_N:+T_each_oei.toFixed(1),
    T_avail_oei_N:+T_avail_oei.toFixed(1),
  };
}

/* Wing station is a design variable, not a constant — see engine/wingPosition.js
   for why this needs an outer root find rather than iterating the in-sizing
   scan. Opt-in: with autoPositionWing off, runSizing IS runSizingCore. */
export function runSizing(p) {
  if (p?.autoPositionWing !== true) return runSizingCore(p);
  /* Never solve for a wing station on an aircraft with no wing. The positioner
     root-finds on static margin, and static margin is measured in fractions of
     MAC — a quantity a rotor-borne aircraft does not possess. NDARC makes the
     same distinction structurally: the tail-volume and length-scale references
     are wing-based only for configurations that have a wing. */
  const cfg = resolveConfiguration(p, p?.nPropHover);
  if (cfg.capabilities.hasWing === false) return sanitiseWingless(runSizingCore(p));
  return solveWingPosition(p, runSizingCore);
}

/* =====================================================================
   WINGLESS RESULT SANITISER
   =====================================================================
   Roughly forty outputs describe a wing or an empennage — mean aerodynamic
   chord, neutral point, static margin, V-tail areas and ruddervator authority,
   airfoil section drag. On a rotor-borne configuration those quantities do not
   exist, and the arithmetic that produces them yields NaN.

   NaN is the wrong value to publish. It renders as "NaN" in the UI, it
   poisons any sum it enters (groupSums.structure was going NaN this way), and
   it is indistinguishable from a genuine numerical failure. **null** says the
   right thing: this aircraft has no such quantity.

   APPLIED ONLY WHEN THERE IS NO WING, DELIBERATELY. A NaN on a winged aircraft
   is a BUG and must stay visible — the golden master caught 13 winged cases
   recording the string "NaN" for LDact and CD0tot, which is exactly the kind of
   thing a blanket sanitiser would have hidden for ever.
   ===================================================================== */
function sanitiseWingless(R) {
  if (!R || typeof R !== "object") return R;
  const clean = (o, depth) => {
    if (depth > 2 || o == null || typeof o !== "object") return o;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number" && !isFinite(v)) o[k] = null;
      else if (v && typeof v === "object" && !Array.isArray(v)) clean(v, depth + 1);
    }
    return o;
  };
  return clean(R, 0);
}
