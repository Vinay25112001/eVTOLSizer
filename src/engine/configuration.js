import { requiredTWForControllableOEI, torqueToThrustRatio } from "./controlauthority.js";
import { ringRadiusFor } from "./coaxial.js";
/* =====================================================================
   AIRCRAFT CONFIGURATION — ONE PLACE
   =====================================================================
   WHY THIS EXISTS

   Three modules independently inferred what kind of aircraft this is, from the
   same two loose parameters:

       drag.js     nStopped = p.nRotorsStopped ?? (rotorsStopInCruise===false ? 0 : N)
       weights.js  nStopped0 = ... same expression ...
       booms.js    nStopped = ... same expression again ...

   Duplicated inference is how a model ends up incoherent: change one and you
   get booms for rotors that do not stop, or a cruise propulsor on an aircraft
   whose rotors never stopped in the first place. Nothing enforced agreement.

   Worse, the DEFAULT was implicit. With `nRotorsStopped` unset, every rotor was
   treated as stopped with its hub exposed in cruise — which IS a lift+cruise
   layout, and a legitimate one, but a user setting `nPropHover: 6` had no way
   to know they had also chosen six dead rotors in the cruise flow plus a
   separate pusher. Measured, that assumption is worth a factor of four in MTOW
   at high payload (k 3.35 and divergence, against k 2.24 and 4,190 kg when the
   rotors tilt instead). An assumption that large must be visible.

   ── WHAT THE CONFIGURATION DECIDES ───────────────────────────────────

   Four things follow from the layout, and they must follow TOGETHER:

     stopped rotors   dead rotors in the cruise flow -> blade drag
     exposed hubs     hub drag (NDARC: a rotor behind a spinner has none)
     cruise propulsor a separate thrust unit for cruise, and its mass
     lift booms       structure carrying rotors away from the airframe

   A tiltrotor has none of them: its rotors ARE the cruise propulsors, they sit
   on the wing and tail, and they are behind spinners. A lift+cruise has all
   four. A multicopter has no wing-borne cruise at all, so it keeps its rotors
   turning and carries booms but no separate propulsor.

   Explicit `nRotorsStopped` / `hubsExposed` still override, because the
   reference aircraft set them from published configuration data.
   ===================================================================== */

export const CONFIGURATIONS = {
  liftcruise: {
    label: "Lift + cruise — lift rotors stop, separate cruise propulsor",
    stoppedFrac: 1.0, hubsExposed: true, hasCruiseProp: true, hasBooms: true,
    note: "NASA UAM Lift+Cruise, Beta ALIA, Archer Midnight are this family",
  },
  hybrid: {
    label: "Hybrid tilt + lift — some rotors tilt for cruise, the rest stop",
    stoppedFrac: 0.5, hubsExposed: true, hasCruiseProp: false, hasBooms: true,
    note: "the TILTING rotors provide cruise thrust, so there is NO separate "
        + "pusher — Archer Midnight (6 tilt + 6 lift-only) is exactly this. "
        + "Set nRotorsStopped to fix the lift-only count if it is not half.",
  },
  hybridPusher: {
    label: "Hybrid tilt + lift + pusher — tip rotors tilt, boom rotors stop, "
         + "pusher runs in cruise",
    stoppedFrac: 2 / 3, hubsExposed: true, hasCruiseProp: true, hasBooms: true,
    note: "hover on all rotors; in cruise the tip rotors tilt to 0 deg and run "
        + "as tractors ALONGSIDE the pusher, while the boom rotors stop. "
        + "Cruise thrust is SHARED between the tilting rotors and the pusher, "
        + "so the pusher is sized for its share, not for all of it.",
  },
  tiltrotor: {
    label: "Tiltrotor / tiltwing — rotors tilt, none stop",
    stoppedFrac: 0, hubsExposed: false, hasCruiseProp: false, hasBooms: false,
    note: "rotors are the cruise propulsors, wing/tail mounted, behind spinners "
        + "— Joby S4, Vertical VX4",
  },
  multicopter: {
    label: "Multicopter — rotor-borne throughout, no wing-borne cruise",
    stoppedFrac: 0, hubsExposed: true, hasCruiseProp: false, hasBooms: true,
    note: "rotors keep turning in forward flight, each on its own arm",
  },
  /* SIDE-BY-SIDE IS NOT A MULTICOPTER, and treating it as one was wrong.
     It was mapped to `multicopter` in the NASA benchmark purely because that
     was the only wingless slot available — the exact "reuse the nearest
     configuration" shortcut this engine is supposed to have stopped making.
     Two large rotors on pylons either side of the fuselage is a distinct
     layout: NDARC gives it its own twin-rotor induced-power treatment
     (Theory 12-5.1.3, v_i = kappa_twin*T/(2*A_e*V) with A_e = A(1+l/2R)^2 and
     a hover projected area A_p = (2-m)A from the overlap fraction m), and its
     rotors are carried on substantial pylons at a long arm, not on light arms.
     NOTE the same section's escape clause, which is why no interference factor
     is applied here yet: "If there is no overlap (l > 2R), it is assumed that
     there is no performance impact of interference between the rotors."
     WHETHER THEY OVERLAP IS STATED — JUST NOT IN TABLE 12. This comment used
     to end "whether its rotors overlap is not stated in Table 12, so
     kappa_twin is NOT applied and that is recorded as a gap rather than
     guessed". The gap was in the reading, not in the literature. Two NASA
     papers say it outright, and both call it the defining feature:

       Silva, Johnson, Antcliff & Patterson, AIAA 2018-3847, sec. B:
         "The most noteworthy attribute of the aircraft is its overlapping and
          intermeshing pair of main rotors, which act as a single lifting and
          thrusting actuator in forward flight, with a much larger effective
          span than either rotor in isolation."

       Johnson & Silva, The Aeronautical Journal (NTRS 20210026170), sec. 3:
         "main rotors that intentionally interact as they physically overlap
          and intermesh", and of their Figure 9, "the influence of overlap
          (wing span = 1.0D = rotor diameter means the rotor disks are
          tangent) on rotor efficiency".

     SO THE ESCAPE CLAUSE DOES NOT COVER NASA'S AIRCRAFT. l > 2R is false for
     it, kappa_twin genuinely applies to the reference vehicle, and this tool
     does not apply it. That is now a KNOWN gap rather than an unknown one,
     which is a different and more actionable thing.

     WHAT THIS TOOL DRAWS AND WEIGHS is tangency, span = 1.0 D — NASA's own
     published datum and exactly the l = 2R boundary, so the no-interference
     assumption is self-consistent with the layout it actually builds. It is
     an UPPER bound on the reference separation: neither paper publishes the
     concept vehicle's span/D, so going further would be inventing the
     overlap. See engine/booms.js, where the same tangency rule sets the mass. */
  sideBySide: {
    label: "Side-by-side helicopter — two large rotors on pylons",
    stoppedFrac: 0, hubsExposed: true, hasCruiseProp: false, hasBooms: true,
    note: "rotor-borne throughout; rotors carried outboard on pylons. Twin-rotor "
        + "interference (NDARC 12-5.1.3) applies only if the disks overlap",
  },
};

/**
 * Resolve the layout into the flags every other module needs.
 * @param p parameter set
 * @param nRotors total hover rotors
 */
export function resolveConfiguration(p, nRotors) {
  const key = CONFIGURATIONS[p.configType] ? p.configType : "liftcruise";
  const c   = CONFIGURATIONS[key];
  const N   = Math.max(0, nRotors ?? p.nPropHover ?? 0);

  /* Explicit overrides win — the reference aircraft carry published values. */
  let nStopped = p.nRotorsStopped != null
    ? Math.max(0, Math.min(N, p.nRotorsStopped))
    : (p.rotorsStopInCruise === false ? 0 : Math.round(c.stoppedFrac * N));

  /* ── THE AFT BOOM STATION HAS NO HINGE, SO IT CANNOT TILT ─────────────
     RAVEN's tree is explicit: Props 1-4 hang off a hinge, Prop5 and Prop6 do
     not. The aft sponson rotors are STRUCTURALLY fixed — there is no pivot to
     turn them about — and this is architecture, not a preference.

     A layout with fore/aft boom stations therefore has AT LEAST half its
     rotors fixed. Asking for fewer (nRotorsStopped = 2 of 12) does not produce
     an aircraft with ten tilting rotors; it produces four rotors drawn with
     hinges that the airframe does not have, and it charged AFDD00's f_tilt
     blade factor for them. The request is clamped to what the layout can
     carry, and `stoppedClampedByLayout` records that it happened rather than
     silently disagreeing with the user's input. */
  const aftStationFixed = !!(c.hasBooms && c.stoppedFrac > 0);
  const minFixed = aftStationFixed ? Math.floor(N / 2) : 0;
  const stoppedRequested = nStopped;
  if (nStopped < minFixed) nStopped = minFixed;

  /* ── SOMETHING MUST STILL PUSH THE AIRCRAFT FORWARD ───────────────────
     A layout with no separate pusher gets ALL its cruise thrust from the
     tilting rotors. Stopping every rotor therefore leaves nothing to fly
     with — and the tool used to accept it: at 12 of 12 stopped it reported
     cruiseThrustUnits = 1, having floored the count at one, and called the
     design FEASIBLE. It had invented a propulsor. Worse, 10 of 12 stopped —
     two tilting rotors, an aircraft that can actually fly — came back
     infeasible, so the two answers were the wrong way round.

     At least one MIRRORED PAIR must tilt, because a single tilting rotor
     would be asymmetric in thrust. */
  const needsTiltForCruise = !c.hasCruiseProp && p.hasPusher !== true;
  const maxStopped = needsTiltForCruise ? Math.max(0, N - 2) : N;
  if (nStopped > maxStopped) nStopped = maxStopped;

  /* ── A ROTOR THAT CANNOT TILT HAS NOTHING TO DO IN CRUISE BUT STOP ────
     A lift+cruise carries FIXED vertical lift rotors and a separate pusher —
     Beta ALIA-250 is exactly this. Its capabilities say rotorsTilt: false, so
     there is no mechanism to point a lift rotor forward. A rotor left turning
     would produce no useful thrust and pure drag, which is not a design
     choice anyone makes.

     The count was still adjustable, and the range came out [2..4] on a
     four-rotor lift+cruise — offering "2 stopped, 2 turning uselessly" as a
     configuration. Where nothing tilts, ALL the lift rotors stop, and the
     slider has nothing to offer. */
  const capsHere = capabilitiesFor(key, N) || {};
  const nothingTilts = capsHere.rotorsTilt === false;
  const stoppedFixedByLayout = nothingTilts && c.stoppedFrac > 0;
  if (stoppedFixedByLayout) nStopped = N;

  const hubsExposed = p.hubsExposed != null ? !!p.hubsExposed : c.hubsExposed;

  /* HUB DRAG COUNT — exposed is not the same as stopped.
     A hub is in the flow whenever it is not behind a spinner, whether the
     rotor is turning or not; what STOPPING adds is fixed blade area. Tying hub
     drag to nStopped was wrong for a multicopter, whose rotors all turn in
     forward flight with every hub exposed, and it made a multicopter come out
     aerodynamically identical to a tiltrotor. NDARC 12-10 is about the spinner,
     not about rotation. */
  const nHubsExposed = hubsExposed
    ? (c.stoppedFrac > 0 ? nStopped : N)   // L+C: only the stopped ones; else all
    : 0;

  return {
    key, label: c.label, note: c.note,
    nRotors: N, nStopped, hubsExposed, nHubsExposed,
    stoppedRequested,
    stoppedClampedByLayout: nStopped !== stoppedRequested,
    stoppedMin: stoppedFixedByLayout ? N : minFixed,
    stoppedMax: stoppedFixedByLayout ? N : maxStopped,
    stoppedFixedByLayout,
    /* A separate cruise propulsor exists only when NOTHING else can provide
       cruise thrust. Deriving it from `nStopped > 0` alone was wrong for the
       hybrid layout: a tilt+lift aircraft has stopped rotors AND tilting ones,
       and the tilting rotors ARE its cruise propulsion. That error charged
       Archer Midnight 69.6 kg for a pusher it does not have. */
    hasCruiseProp: p.hasPusher != null ? !!p.hasPusher
                 : (c.hasCruiseProp && nStopped > 0),
    /* Rotors that keep turning in cruise: the tilting ones. They are thrust
       units alongside any pusher, which is why the pusher is not sized for the
       whole cruise power. */
    nTilting: Math.max(0, N - nStopped),
    /* ── BOOM COUNT FOLLOWS THE ROTOR ARRANGEMENT ──────────────────────
       This was a fixed 2 for every winged layout, decided in capabilitiesFor()
       from the TOTAL rotor count — where the stopped/tilting split is not yet
       known, so it could not have followed the arrangement even in principle.

       EVERY REFERENCE AIRCRAFT PUTS TWO ROTORS ON A BOOM, one forward, one aft:
         BETA ALIA-250    4 lift rotors on 2 booms
         NASA RAVEN       2 sponsons, each a tilting rotor forward and a
                          lift rotor aft
         Archer Midnight  12 rotors on 6 booms
       It is also the picture engine/booms.js already sizes, bending each boom
       about armFwd = |xWing - xRotFwd| and armAft = |xRotAft - xWing| — two
       stations, one boom.

       A fixed 2 reproduces all three only while four rotors ride booms. At
       twelve it asks two booms to carry ten, so the airframe drawn and the
       booms weighed were different structures. Booms come in mirrored pairs,
       hence even. The wingtip pair is used only at the small counts where both
       references have it; Archer, at twelve, has none. */
    boomCount: (() => {
      const capC = CONFIG_CAPABILITIES[key] || {};
      const coaxHere = String(p?.rotorArrangement ?? "coplanar") === "coaxial"
        && capC.supportsCoaxial === true && N >= 2 && N % 2 === 0;
      /* The capability table, not CONFIGURATIONS — `c` above is labels and
         stopped fractions; booms live in CONFIG_CAPABILITIES. */
      const cap = CONFIG_CAPABILITIES[key] || CONFIG_CAPABILITIES.liftcruise;
      if (!cap.boomsFromRotors) {
        const base = cap.boomCount ? cap.boomCount(N) : 2;
        /* COAXIAL HALVES THE ARMS. N contra-rotating rotors sit on N/2
           stations, which is the whole structural point of the arrangement:
           [SRC] Yang et al. Aerospace 2024 11:200 sec.1 - "the coplanar
           configuration has more booms for rotor support when compared to
           coaxial rotor designs, its structural weight and form drag are
           expected to be larger". */
        return coaxHere ? Math.max(1, Math.round(base / 2)) : base;
      }
      const nTilt = Math.max(0, N - nStopped);
      const nTip  = (nTilt >= 2 && (nStopped + nTilt - 2) <= 4) ? 2 : 0;
      const onBooms = nStopped + Math.max(0, nTilt - nTip);
      return onBooms > 0 ? Math.max(2, 2 * Math.ceil(onBooms / 4)) : 0;
    })(),
    /* ── WHO ACTUALLY CARRIES CRUISE THRUST ────────────────────────────
       ONE definition, because two modules were each deriving their own and
       both were wrong. `sizing-conditions.js` and `weights.js` both used
       `nCruiseUnits = 1 + nTilting`, which assumes a pusher ALWAYS exists (the
       +1) and then divides cruise power by it to get a per-LIFT-MOTOR rating.

       MEASURED CONSEQUENCE on NASA's lift+cruise: nTilting = 0, so the divisor
       was 1 and EVERY ONE of the 8 stopped lift motors was rated for the
       pusher's entire 287 kW — while weights.js separately sized the pusher
       for the same power. Installed power per lift motor came out 2.77x NASA's
       published 139 hp MRP, against 0.83x and 1.14x for the quadrotor and
       side-by-side. A rotor that is STOPPED in cruise draws no cruise power.

       It was wrong in the other direction too: a 6-rotor tiltrotor has no
       pusher, so its cruise power divides by 6, not by 7.

       Correct: the units producing cruise thrust are the TILTING rotors plus
       a pusher if one exists. Each carries an equal share unless overridden. */
    /* NOT floored at 1. The floor fabricated a propulsor on a layout that had
       none left, and a design with no cruise thrust must fail, not divide its
       cruise power by an imaginary unit. The clamp above keeps a pair tilting
       on layouts that need it, so this can only reach 0 if a configuration
       genuinely has no cruise propulsor — which is a result worth surfacing. */
    cruiseThrustUnits: Math.max(0, N - nStopped) +
      ((p.hasPusher != null ? !!p.hasPusher : (c.hasCruiseProp && nStopped > 0)) ? 1 : 0),
    /* Booms come from the LAYOUT, not from whether rotors stop — a multicopter
       carries its rotors on arms and stops none of them. But an EXPLICIT
       nRotorsStopped:0 on a lift+cruise means no lift rotors stop, hence no
       lift booms; without this guard Joby (which sets nRotorsStopped:0) picked
       up booms for all six rotors from the default layout and went +48.9% on
       MTOW. A layout whose stopped fraction is zero by DESIGN (multicopter)
       still has booms; one that merely has zero stopped rotors does not. */
    hasBooms: c.hasBooms && (c.stoppedFrac === 0 || nStopped > 0),
    explicitOverride: p.nRotorsStopped != null || p.hubsExposed != null,
    capabilities: capabilitiesFor(key, N),
  };
}

/* =====================================================================
   CONFIGURATION CAPABILITIES — what the configuration DECIDES
   =====================================================================
   The flags above describe the ROTORS. This describes the AIRCRAFT: whether it
   has a wing at all, what the geometry and drag reference is, how stability is
   judged, and which failure criteria apply. Selecting a configuration should
   reconfigure the model, not just relabel it.

   THIS IS NOT AN INVENTED PATTERN. NDARC implements exactly it — NASA
   TP-20220000355 Vol 2, Chapter 2 "Input Based on Configuration":

     "This capability has been implemented for rotorcraft, helicopter, tandem,
      coaxial, tiltrotor, compound, multicopter, and airplane configurations.
      There is common input for all configurations, and special input for each."

   and its per-configuration input sets nRotor / nWing / nTail, the lift share
   fDGW, the control count, the trim method, the flight-control models, the
   geometry length-scale reference (KIND_Lscale) and the tail-volume reference
   (KIND_TailVol). Crucially the baseline for ALL configurations is nWing=0 — a
   wing is ADDED by the configurations that have one. This engine has the
   inverse assumption baked in and that is what these fields exist to unwind.

   MAPPING TO NDARC, stated because it is not one-to-one. Our families are eVTOL
   layouts; NDARC's are rotorcraft families:
     multicopter   -> NDARC multicopter (2-7) exactly
     tiltrotor     -> NDARC tiltrotor    (2-5) exactly
     liftcruise    -> nearest is NDARC compound (2-6): rotor + wing + separate
                      auxiliary thrust
     hybrid,
     hybridPusher  -> also nearest compound; NDARC has no distinct slot, and VFS
                      say the same of their own taxonomy ("lacks specificity for
                      emerging hybrid configurations")

   DELIBERATELY NOT COPIED: NDARC's drive-system parameters (ngearbox,
   ndriveshaft, fTorque, fPower). They are sourced and recorded in the research
   notes, but this engine models direct-drive electric propulsion with no
   gearbox or shafting, so importing them would be importing numbers we do not
   use into a model that cannot spend them.

   STATUS: DECLARATIVE ONLY at present. Nothing in the sizing loop consumes
   these yet, so behaviour is unchanged and the golden master must not move.
   They are the foundation for making the wing optional.
   ===================================================================== */
export const CONFIG_CAPABILITIES = {
  sideBySide: {
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? two large rotors either side; a coaxial pair is a different aircraft.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: false,
    /* Does a rotor PHYSICALLY TILT? a helicopter rotor; nothing tilts.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: false,
    hasWing: false, nTail: 0, rotorLiftShare: (N) => 1 / Math.max(1, N),
    wingLiftShare: 0,
    lengthScaleRef: "rotorRadius", dragRef: "dragArea", tailVolumeRef: null,
    hasFixedWingControls: false, spinnerDrag: false,
    stabilityMethod: "hoverTrim",
    failureCriteria: ["rotorOut", "autorotationIndex"],
    /* TWO pylons, one per rotor — not one arm per rotor as on a multicopter. */
    boomCount: () => 2,
    ndarc: "12-5.1.3 twin rotors; no Ch.2 configuration entry of its own",
  },
  multicopter: {
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? rotors come in contra-rotating pairs on half as many arms - EHang 184, SkyDrive SD-03 and Moog SureFly are all built this way.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: true,
    /* Does a rotor PHYSICALLY TILT? rotors spin throughout; nothing tilts.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: false,
    /* NDARC 2-7. nTail=0 — "a) Components: nTail=0 (no tail)". Each rotor
       carries an equal share of design gross weight: fDGW = 1/nRotor. */
    hasWing: false, nTail: 0, rotorLiftShare: (N) => 1 / Math.max(1, N),
    wingLiftShare: 0,
    lengthScaleRef: "rotorRadius",
    dragRef: "dragArea",          // no wing to reference a CD0 against
    tailVolumeRef: null,
    hasFixedWingControls: false,  // NDARC MODEL_FWfc=0 for rotorcraft
    spinnerDrag: false,           // NDARC 2-7: CD_spin=0
    stabilityMethod: "hoverTrim",
    /* A wingless multirotor cannot glide, and NASA's own quadrotors score an
       autorotation index of 0.95-1.69 against the ~3 sec that NDARC Theory says
       "gives good autorotation characteristics for small helicopters"
       (TM-20210017971 Table 12). Its failure tolerance therefore rests on
       propulsion redundancy, not on trading height for time. */
    failureCriteria: ["rotorOut", "autorotationIndex"],
    /* ONE ARM PER ROTOR. This is the defect the NASA benchmark exposed:
       boomCount was a hardcoded 2 in WEIGHT_CONSTANTS, so a FOUR-rotor
       quadrotor was given two booms. Its structure came out 62.6% below NASA's
       published figure and this is part of why. [LAY] but it is the standard
       multicopter layout — NDARC 2-7 places each rotor at its own azimuth
       (ang_multicopter) and gives ngearbox = nRotor. */
    boomCount: (N) => Math.max(1, N),
    ndarc: "2-7 Multicopter",
  },
  tiltrotor: {
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? a coaxial proprotor tilting as a unit is not a layout in this population.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: false,
    /* Does a rotor PHYSICALLY TILT? the whole point of the layout.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: true,
    /* NDARC 2-5. Wing carries the aircraft in cruise; rotors tilt. */
    hasWing: true, nTail: 2, rotorLiftShare: () => 1, wingLiftShare: 1,
    lengthScaleRef: "wingSpan",
    dragRef: "wingArea",
    tailVolumeRef: "wing",
    hasFixedWingControls: true,
    spinnerDrag: true,            // NDARC 12-10: spinnered tiltrotor, no hub drag
    stabilityMethod: "staticMargin",
    failureCriteria: ["oei", "cruiseThrustLoss"],
    boomCount: () => 0,       // rotors on wing and tail, no lift booms
    ndarc: "2-5 Tiltrotor",
  },
  liftcruise: {
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? lift rotors stop and feather; stacking them buys nothing.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: false,
    /* Does a rotor PHYSICALLY TILT? lift rotors STOP and a separate pusher cruises; nothing tilts.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: false,
    hasWing: true, nTail: 2, rotorLiftShare: () => 1, wingLiftShare: 1,
    lengthScaleRef: "wingSpan", dragRef: "wingArea", tailVolumeRef: "wing",
    hasFixedWingControls: true, spinnerDrag: false,
    stabilityMethod: "staticMargin",
    failureCriteria: ["oei", "cruiseThrustLoss"],
    boomsFromRotors: true,   // two rotors per boom — see resolveConfiguration
    ndarc: "nearest 2-6 Compound",
  },
  hybrid: {
    /* ── TAIL TYPE — SET BY WHAT THE REFERENCE AIRCRAFT ACTUALLY HAS ──
       This layout IS RAVEN's, and neither RAVEN has a V-tail: both carry a
       vertical fin plus an all-moving stabilator (see RAVEN_TAIL_CONVENTIONAL
       in geometry.js). So this configuration is sized and drawn with one.

       IT IS NOT THE DEFAULT EVERYWHERE, and the benchmark says why. Joby S4,
       Archer Midnight and Beta ALIA — the aircraft the other layouts are
       scored against — all fly V-tails. Making conventional the global
       default moved the industrial component-buildup MAE from 13.4% to 14.7%,
       because it contradicts the reference aircraft. RAVEN is the outlier
       among eVTOLs here, not the rule, and the tail follows the referent
       rather than a preference. */
    tailType: "conventional",
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? not seen in the field on this layout.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: false,
    /* Does a rotor PHYSICALLY TILT? the forward rotors tilt; the aft lift rotors stop.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: true,
    hasWing: true, nTail: 2, rotorLiftShare: () => 1, wingLiftShare: 1,
    lengthScaleRef: "wingSpan", dragRef: "wingArea", tailVolumeRef: "wing",
    hasFixedWingControls: true, spinnerDrag: false,
    stabilityMethod: "staticMargin",
    failureCriteria: ["oei", "cruiseThrustLoss"],
    boomsFromRotors: true,   // two rotors per boom — see resolveConfiguration
    ndarc: "nearest 2-6 Compound; no exact NDARC or VFS slot",
  },
  hybridPusher: {
    /* Can this layout be built with COAXIAL (contra-rotating) rotor
       pairs? not seen in the field on this layout.
       [SRC] Yang et al., Aerospace 2024 11:200 sec.1: coplanar and
       coaxial are the two arrangements in the UAM multicopter field,
       and single-seat multicopters are "dominated by coaxial". */
    supportsCoaxial: false,
    /* Does a rotor PHYSICALLY TILT? the tip rotors tilt; the boom lift rotors stop.
       Feeds AFDD00's f_tilt = 1.1794 blade factor, which NDARC defines
       "for tilting rotors; 1.0 otherwise". This used to be inferred as
       nTilting = N - nStopped, i.e. "any rotor that does not stop in
       cruise" - which made every multicopter and side-by-side rotor a
       tilting rotor and put a 17.9% tiltrotor penalty on a helicopter. */
    rotorsTilt: true,
    hasWing: true, nTail: 2, rotorLiftShare: () => 1, wingLiftShare: 1,
    lengthScaleRef: "wingSpan", dragRef: "wingArea", tailVolumeRef: "wing",
    hasFixedWingControls: true, spinnerDrag: false,
    stabilityMethod: "staticMargin",
    failureCriteria: ["oei", "cruiseThrustLoss"],
    boomsFromRotors: true,   // two rotors per boom — see resolveConfiguration
    ndarc: "nearest 2-6 Compound; no exact NDARC or VFS slot",
  },
};

/** Capability record for a configuration key, with the rotor count resolved. */
/* =====================================================================
   CONFIGURATION DESIGN DEFAULTS — a layout implies a rotor count and a
   disk-loading class, not just a label
   =====================================================================
   THE DEFECT THIS FIXES

   Selecting a configuration changed `configType` and NOTHING ELSE. Rotor
   count and rotor diameter stayed at whatever the previous layout used, so
   the dropdown produced designs that contradict themselves:

     "side-by-side helicopter" with SIX rotors   (it has two, by definition)
     "multicopter" at 48 lb/ft^2 disk loading    (they live at 2-5)
     both of which then failed to converge, at ~19,000 kg and 2.3% payload.

   A configuration is a design decision that carries its own defining
   parameters. NDARC treats it that way — its per-configuration input chapter
   sets nRotor for each layout — and NASA's Table 12 publishes disk loading as
   a design INPUT per vehicle, not as an output to be read off afterwards.

   ── EVERY NUMBER HERE IS SOURCED, OR SAYS IT IS NOT ──────────────────
   Disk loading is the right parameter to carry (rather than a rotor
   diameter), because it is what NASA publishes and it is independent of
   aircraft size: the diameter follows from DL and MTOW via
       R = sqrt( W / (N * pi * DL) )
   which is how `rotorDiameterFor` below derives it.
   ===================================================================== */
/* ── CRUISE SPEED IS A CONFIGURATION PROPERTY TOO ────────────────────────
   CONFIG_DEFAULTS carried rotor count and disk loading but NOT cruise speed,
   so selecting "multicopter" kept whatever speed a winged design was using.
   The app default is 67 m/s = 130 kt. NASA design their ROTOR-BORNE concepts
   at 98 kt, and Johnson & Silva 2022 sec.6.3 say why: for these rotors
   "at sufficiently high speeds (here above 90 knots), blade stall encompasses
   most of the rotor". A multicopter at 130 kt is past its edgewise limit, and
   the sizing loop was being asked to close a design that cannot fly.
   Measured: giving each layout its published speed moved the side-by-side from
   NON-CONVERGENT to converging, and the lift+cruise from 4,396 to 3,548 kg. */
/* ── THE REFERENCE AIRCRAFT EACH LAYOUT IS ACTUALLY BUILT AROUND ─────────
   Sizing every configuration for the same 5-seat, 455 kg, 65 km mission was a
   METHOD ERROR, and it produced a 5,751 kg "multicopter". No multicopter is
   built for that mission. Real ones, from the corpus (Aerial e-mobility
   perspective, S0106 sec.4.1-4.2, with manufacturer figures):

     EHang EH216-S    16 props (8 coaxial pairs), 2 passengers, autonomous,
                      MTOW 620 kg, range 30 km, 130 km/h
     Volocopter       18 rotors, 2 passengers, MTOW 900 kg, payload 200 kg,
       VoloCity       OWE 700 kg, range 35 km, 110 km/h

   A multicopter is a 600-900 kg two-seater flying 30-35 km, not a 3-tonne
   five-seater flying 65 km. Given VoloCity's OWN mission this engine returns
   672 kg (published 900, -25%) and given EH216-S's it returns 746 kg
   (published 620, +20%) — it brackets them. The physics was never the problem;
   the mission was.

   These are REPORTED, not imposed. The dropdown does not overwrite the user's
   payload and range, because comparing layouts requires flying the SAME
   mission across all of them. What the engine does instead is say when the
   requested mission is far outside what the reference aircraft for that layout
   actually does. */
export const CONFIG_REFERENCE = {
  multicopter:  { aircraft: "Volocopter VoloCity", nRotors: 18, payload_kg: 200,
                  range_km: 35, vCruise_ms: 30.6, MTOW_kg: 900, pax: 2,
                  src: "[SRC] 18 rotors, MTOW 900 kg, payload 200 kg, OWE 700 kg, range 35 km, 110 km/h. Cross-check EHang EH216-S: 16 props, MTOW 620 kg, 30 km, 130 km/h" },
  sideBySide:   { aircraft: "NASA SbS-E (concept)", nRotors: 2, payload_kg: 544,
                  range_km: 139, vCruise_ms: 50.4, MTOW_kg: 2223, pax: 6,
                  src: "[SRC] NASA Table 12 SbS-E — no side-by-side eVTOL has been built, so a documented concept is the honest anchor" },
  liftcruise:   { aircraft: "BETA ALIA-250", nRotors: 4, payload_kg: 635,
                  range_km: null, vCruise_ms: 57.6, MTOW_kg: 2835, pax: 6,
                  src: "[SRC] 4 VTOL props + 1 pusher, MTOW 6,250 lb, payload 1,400 lb, span 50 ft. Range/cruise [LAY] from NASA L+C-E — BETA's VTOL-variant figures are unconfirmed (quoted numbers belong to the CX300)" },
  tiltrotor:    { aircraft: "Joby S4", nRotors: 6, payload_kg: 453,
                  range_km: 161, vCruise_ms: 89.4, MTOW_kg: 2404, pax: 5,
                  src: "[SRC] 6 tiltrotors of 2.9 m, MTOW 5,300 lb, payload 1,000 lb, 100 mi at 200 mph" },
  hybrid:       { aircraft: "Archer Midnight", nRotors: 12, payload_kg: 453,
                  range_km: 100, vCruise_ms: 67.0, MTOW_kg: 3175, pax: 5,
                  src: "[SRC] 12 propellers (6 tilt / 6 lift), MTOW 7,000 lb, 150 mph. Range [LAY] medium confidence — design mission is 20-50 mile hops" },
  hybridPusher: { aircraft: null, nRotors: 6, payload_kg: null, range_km: null,
                  vCruise_ms: 67.0, MTOW_kg: null, pax: null,
                  src: "[GAP] no published aircraft of this exact layout" },
};

/* ── EFFECTIVE L/D IS PUBLISHED PER VEHICLE, AND IT IS NOT 14 ────────────
   The app carried a single LD target of 14 — a clean-wing aeroplane number —
   and applied it to every layout, including rotor-borne ones with no wing at
   all. It is used as the cruise target and by the "AR vs LD compatible" check,
   which then failed a tiltrotor for producing 9.1 against an aspiration no
   eVTOL of any layout achieves.
   NASA publish effective L/D (L/De, which charges the rotor download and hub
   drag) for their concept vehicles in Table 12: Quad-E 5.80, SbS-E 7.20,
   L+C-E 8.50. Those are [SRC]. The three tilting layouts have no published
   L/De, so they borrow the lift+cruise figure as the nearest published winged
   neighbour [LAY] — the same treatment Archer's disk loading gets. */
/* ── HOVER FIGURE OF MERIT AND TIP SPEED ARE PUBLISHED PER VEHICLE TOO ───
   Both were universal in the app — FM 0.70 and 550 ft/s for every layout —
   while NASA Table 12 gives them per vehicle:
       Quad-E  FM 0.700, tip 550 ft/s
       SbS-E   FM 0.680, tip 550 ft/s
       L+C-E   FM 0.740, tip 585 ft/s
   FM is not a technology constant. A large, lightly-loaded rotor turning
   slowly hovers at a different efficiency from eight small stiff ones, and
   NASA's own numbers span 0.680-0.740 across three vehicles built to the same
   technology assumptions. [SRC] for those three.
   The three TILTING layouts have no published FM in Table 12's electric
   columns, so they borrow the lift+cruise 0.740 as the nearest published
   winged neighbour and are flagged [LAY] — the same treatment Archer's disk
   loading and the tilting layouts' L/D target already get. Tip speed for them
   stays at 550 ft/s, which is what NASA use for every vehicle except the
   lift+cruise. */
/* ── WING LOADING IS PUBLISHED PER AIRCRAFT, AND WAS BEING AVERAGED AWAY ──
   The app carried a single W/S of 1450 N/m2, and its own comment said what
   that number is: "the midpoint of Joby 1524 and Archer 1371". Two SOURCED
   aircraft averaged into one figure that describes neither. Now each layout
   takes its own reference: tiltrotor 1524 [SRC Joby S4], hybrid 1371 [SRC
   Archer Midnight]. Lift+cruise and hybrid-pusher keep 1450 [LAY] — BETA's
   wing area is not published and no lift+cruise W/S was found. Wingless
   layouts carry none, because the engine zeroes Swing and bWing for them.

   ── INSTALLED THRUST MARGIN DEPENDS ON THE ROTOR COUNT, BY ARITHMETIC ─────
   `oeiThrustShare` marks a layout whose rotors are INDEPENDENT, so losing one
   loses its thrust. To keep hovering on N-1 of N rotors the installed margin
   must be at least N/(N-1):
       2 rotors 2.00 · 4 rotors 1.33 · 6 rotors 1.20 · 8 rotors 1.14 ·
       12 rotors 1.09
   This is arithmetic, not an assumption, and it is genuinely configuration-
   dependent — which is the whole argument for distributed propulsion.
   THE SIDE-BY-SIDE IS EXEMPT and is flagged false: NASA's side-by-side carries
   an INTERCONNECT SHAFT (Johnson & Silva describe it as a "connect shaft
   between rotors"), so a motor failure does not cost a rotor and the N/(N-1)
   share does not apply. Applying it would demand T/W 2.00, which drives a
   runaway — the model would be describing an aircraft nobody builds. */
export const CONFIG_DEFAULTS = {
  /* [SRC] NASA/TM-20210017971 Table 12, Quad-E column. */
  multicopter:  { nRotors: 4,  DL_lbft2: 3.00, vCruise_ms: 50.4, LD_target: 5.80,
                  etaHov: 0.700, tipSpeed_ms: 167.64, oeiThrustShare: true,
                  /* [SRC] A MULTICOPTER FUSELAGE IS A POD, NOT A TUBE.
                     Every configuration in this tool used one universal 7.2 m
                     x 1.65 m fuselage — fineness 4.4 — which is a fixed-wing
                     body, and on a multicopter it drew as an aeroplane with
                     spars pushed through it. Yang et al., Aerospace 2024,
                     11, 200, Table 4 gives measured fuselage dimensions for
                     EIGHT real UAM multicopters: VoloCity 3.9x1.6, VC200
                     2.9x1.4, eHANG 216 2.3x1.4, Voyager X2 3.7x1.5, SD-03
                     3.2x0.9, eHANG 184 2.0x1.0, Gelisim Tusi 2.0x0.8, PAV-X
                     1.1x0.8. Fineness ratio 1.38 to 3.56, MEAN 2.26 — 4.4 is
                     outside that range entirely.
                     WHY THE MAXIMUM AND NOT THE MEAN. The mean of that set is
                     2.26, but every vehicle in it is a 1-2 seater and this
                     tool's default payload is ~6 passengers. Fuselage fineness
                     generally RISES with size, because extra rows lengthen a
                     cabin of fixed cross-section, so extrapolating a small-
                     cabin mean downward onto a larger aircraft would be
                     fitting, not sourcing. What the data supports without
                     extrapolation is a BOUND: no published UAM multicopter is
                     more slender than 3.56, and ours was 4.36. Capping at the
                     observed maximum is the smallest change the evidence
                     actually justifies, and it leaves the width free to carry
                     the cabin the payload needs.
                     A multicopter never flies fast enough for fuselage
                     fineness to pay, and a long tail cone buys nothing when
                     there is no tail on the end of it. */
                  /* EMPTY-WEIGHT FRACTION, EX-BATTERY, for the fraction model.
                     One 0.50 served all six layouts. NASA/TM-20210017971 Table
                     12, (empty - pack)/DGW: Quad-E 3230/6480 = 0.498. [SRC] */
                  ewf: 0.498,
                  fusFineness: 3.56,
                  /* SECTION ASPECT, height / width. A passenger multicopter's
                     body is a capsule -- a cabin with a rotor deck over it, no
                     wing to carry and no tail cone to taper into -- and it is
                     TALLER THAN IT IS WIDE, which a single diameter cannot
                     express. Modelled as a circle of D = width the frontal
                     area is 21% low; sqrt(W*H) reproduces the true ellipse.
                     Only this layout gets a section: the winged bodies have an
                     aerodynamic shape whose aspect this project has not
                     sourced, and inventing one would be a guess. */
                  fusHeightRatio: 1.9 / 1.5,
                  src: "NASA Table 12 Quad-E: 4 rotors, disk loading 3.00 lb/ft², 98 kt cruise; "
                     + "fuselage fineness capped at 3.56, the MAXIMUM of 8 published UAM multicopters "
                     + "(range 1.38-3.56, mean 2.26; ours was 4.36, outside the range), "
                     + "Yang et al. Aerospace 2024 11:200 Table 4" },
  /* [SRC] Table 12, SbS-E column. Two rotors is definitional. */
  sideBySide:   { nRotors: 2,  DL_lbft2: 3.50, vCruise_ms: 50.4, LD_target: 7.20,
                  /* [SRC] Table 12 SbS-E: (3690-1290)/4900 = 0.490 ex-battery */
                  ewf: 0.490,
                  etaHov: 0.680, tipSpeed_ms: 167.64, oeiThrustShare: false,
                  src: "NASA Table 12 SbS-E: 2 rotors, disk loading 3.50 lb/ft², 98 kt cruise" },
  /* ── ANCHORED TO A FLYING AIRCRAFT, NOT A PAPER ONE ───────────────────
     This was NASA's L+C-E concept (8 lift rotors). BETA Technologies' ALIA-250
     is a real lift+cruise that has flown, and its layout is exactly what this
     configuration models — lift props that stop, plus a separate pusher.
     [SRC] "4 VTOL props + 1 pusher" and a 50 ft (15.24 m) span, both held at
     high confidence in validation/reference-aircraft.js; MTOW 6,250 lb
     (2,835 kg), inside the SC-VTOL small category.
     [LAY] disk loading and cruise speed are NOT BETA's. Its rotor diameter is
     unpublished and its VTOL-variant cruise speed is unconfirmed (the widely
     quoted figures belong to the conventional-takeoff CX300), so both are
     carried from NASA's documented L+C class — the same honest treatment the
     hybrid entry gives Archer. Sanity check on the borrowed disk loading: at
     13.1 lb/ft² BETA's four rotors come out 3.76 m, and 3 gaps x 3.76 x 1.05
     = 11.8 m inside a 15.24 m span, so the two published figures are at least
     mutually consistent. NASA's 8-rotor L+C-E remains the benchmark vehicle in
     validation/nasa-configs.mjs, which passes its own rotor count explicitly. */
  liftcruise:   { nRotors: 4,
                  /* [SRC] Table 12 L+C-E: (7000-2200)/8210 = 0.585 ex-battery. 17% above the
                     old universal 0.50 — a wing, tail and cruise propulsor are structure. */
                  ewf: 0.585,  DL_lbft2: 13.1, vCruise_ms: 57.6, LD_target: 8.50,
                  etaHov: 0.740, tipSpeed_ms: 178.31, wingLoadingNm2: 1450, oeiThrustShare: true,
                  src: "BETA ALIA-250: 4 VTOL props + 1 pusher [SRC]; disk loading and "
                     + "cruise speed [LAY], carried from NASA Table 12 L+C-E (13.1 lb/ft², "
                     + "112 kt) because BETA's rotor diameter is unpublished and its "
                     + "VTOL-variant cruise speed is unconfirmed" },
  /* [SRC] Joby S4, both figures published and held at high confidence in
     validation/reference-aircraft.js: 6 rotors of 2.9 m at 2,404 kg MTOW
     gives 12.4 lb/ft². */
  tiltrotor:    { nRotors: 6,  DL_lbft2: 12.4, vCruise_ms: 89.4, LD_target: 8.50,
                  etaHov: 0.740, tipSpeed_ms: 167.64, wingLoadingNm2: 1524, oeiThrustShare: true,
                  src: "Joby S4: 6 tiltrotors of 2.9 m at 2,404 kg → 12.4 lb/ft², 200 mph cruise" },
  /* [SRC] rotor COUNT only — Archer Midnight, 12 propellers, high confidence.
     [LAY] its rotor diameter is NOT published (reference-aircraft.js records
     it as null/low confidence), so the disk loading is carried over from the
     tiltrotor class as the nearest published neighbour and flagged. */
  hybrid:       { nRotors: 12, DL_lbft2: 12.4, vCruise_ms: 67.0, LD_target: 8.50,
                  etaHov: 0.740, tipSpeed_ms: 167.64, wingLoadingNm2: 1371, oeiThrustShare: true,
                  src: "Archer Midnight: 12 propellers and 150 mph cruise [SRC]; disk "
                     + "loading [LAY], borrowed from the tiltrotor class — Archer's rotor "
                     + "diameter is unpublished" },
  /* [LAY] no published aircraft of this exact layout. Sits between the
     lift+cruise and tiltrotor classes and is labelled as an assumption. */
  hybridPusher: { nRotors: 6,  DL_lbft2: 12.0, vCruise_ms: 67.0, LD_target: 8.50,
                  etaHov: 0.740, tipSpeed_ms: 167.64, wingLoadingNm2: 1450, oeiThrustShare: true,
                  src: "[LAY] no published example of tilt+lift+pusher; between the "
                     + "lift+cruise (13.1) and tiltrotor (12.4) classes" },
};

/* ── HOVER DOWNLOAD, PER LAYOUT ───────────────────────────────────────
   Download was defaulted to ZERO for every configuration, with the honest
   reasoning that no published figure exists for a lift+cruise. That reasoning
   is right for a lift+cruise and WRONG for a tiltrotor: zero is not a neutral
   default, it asserts that no wing sits in the rotor wake, and on a tiltrotor
   the wing sits squarely in it. Where the layout matches a measured aircraft,
   the measurement should be used.

   [SRC] XV-15 measured download is 14.69% of rotor thrust, 10-15% typical for
   tiltrotor layouts (NATO RTO-MP-AVT-111, "The XV-15 Tiltrotor Download
   Reduction"). NDARC TP-20220000355 sec.8-11 defines hover thrust as W/(1-k).

   For the tilt+lift hybrids only the TILTING rotors sit over the wing, so the
   measured value is scaled by the tilting fraction — a geometric argument
   about how much rotor thrust passes over wing area, not a new constant.

   Left at ZERO, with the gap still flagged in the checks: lift+cruise (rotors
   on booms fore and aft, far less wing in the wake, and no published figure)
   and both rotor-borne layouts (no wing at all — the residual download is
   fuselage and boom blockage only, also unpublished). */
export const DOWNLOAD_FRACTION = {
  tiltrotor:    { k: 0.1469, src: "[SRC] XV-15 measured 14.69% — same layout, rotors over the wing" },
  hybrid:       { k: null,   scaleByTilting: 0.1469,
                  src: "[SRC] XV-15 14.69% scaled by the tilting-rotor fraction — only those rotors overfly the wing" },
  hybridPusher: { k: null,   scaleByTilting: 0.1469, src: "as hybrid" },
  liftcruise:   { k: 0,      src: "[GAP] no published figure for boom-mounted fore/aft rotors; zero is optimistic and the check says so" },
  multicopter:  { k: 0,      src: "[GAP] no wing in the wake; residual fuselage/boom blockage unpublished" },
  sideBySide:   { k: 0,      src: "[GAP] as multicopter" },
};

/** Download fraction for a layout, scaled by tilting fraction where relevant. */
export function downloadFractionFor(key, nTilting, nRotors) {
  const d = DOWNLOAD_FRACTION[key];
  if (!d) return 0;
  if (d.k != null) return d.k;
  const frac = nRotors > 0 ? Math.max(0, Math.min(1, nTilting / nRotors)) : 0;
  return +(d.scaleByTilting * frac).toFixed(4);
}

/** Where that download number came from, so the CHECK can say it out loud
    instead of reporting "NOT modelled" whenever the user typed nothing. */
export function downloadBasisFor(key, nTilting, nRotors) {
  const d = DOWNLOAD_FRACTION[key];
  if (!d) return "no entry for this configuration";
  if (d.k != null) return d.src || "configuration default";
  const frac = nRotors > 0 ? Math.max(0, Math.min(1, nTilting / nRotors)) : 0;
  return `XV-15's measured 14.69% scaled by the tilting-rotor fraction `
       + `${nTilting}/${nRotors} = ${(frac * 100).toFixed(0)}% [LAY geometric argument]`;
}

/**
 * Rotor diameter that achieves a configuration's design disk loading at a
 * given weight. DL = W/(N*pi*R^2)  =>  R = sqrt(W/(N*pi*DL)).
 * @param {string} key configuration
 * @param {number} MTOW_kg
 * @param {number} [nRotors] override the configuration's default count
 * @returns {number|null} rotor DIAMETER in metres
 */
export function rotorDiameterFor(key, MTOW_kg, nRotors) {
  const d = CONFIG_DEFAULTS[key];
  if (!d || !(MTOW_kg > 0)) return null;
  const N = Math.max(1, nRotors ?? d.nRotors);
  const DL_Nm2 = d.DL_lbft2 / 0.0208854;          // lb/ft² -> N/m²
  const R = Math.sqrt((MTOW_kg * 9.80665) / (N * Math.PI * DL_Nm2));
  return +(2 * R).toFixed(3);
}

/* ── ROTOR DIAMETER MUST BE SOLVED, NOT EVALUATED ONCE ─────────────────
   `rotorDiameterFor` is a real calculation - R = sqrt(W / (N pi DL)), the
   disk area momentum theory demands for a target disk loading. The problem
   was never the formula. It was the W.

   Every caller evaluated it at a HARDCODED 3175 kg placeholder, because MTOW
   is not known before sizing. The aircraft then converged to somewhere between
   1987 and 3514 kg and kept the rotor sized for a different one, so the disk
   loading the design actually flew at drifted off its target by:

     liftcruise -17.6%   hybrid -20.9%   hybridPusher -18.9%
     tiltrotor  -22.4%   multicopter +6.5%   sideBySide -35.0%

   A 35% disk-loading error is not a detail: hover power goes as sqrt(DL), the
   rotor group weight goes as R^1.74 in AFDD, and the whole layout is drawn to
   that radius. The tool was sizing one aircraft and drawing another.

   Rotor diameter and MTOW are mutually dependent, so the honest answer is a
   fixed point. It converges in a handful of iterations on all six layouts and
   drives the disk-loading error to 0.0%.

   @param runSizingFn  passed in to avoid a circular import; engine.js imports
                       this module, so this module cannot import engine.js. */
export function solveRotorDiameter(key, baseParams, runSizingFn, opts = {}) {
  const d = CONFIG_DEFAULTS[key];
  const N = Math.max(1, baseParams?.nPropHover ?? d?.nRotors ?? 4);
  if (!d || typeof runSizingFn !== "function") return null;
  const maxIter = opts.maxIter ?? 40, tol = opts.tol ?? 1e-4;

  /* Seed from the payload rather than a fixed 3175 kg, so the first guess at
     least scales with the aircraft being asked for. */
  let mtow = Number(opts.seedMTOW) || Math.max(200, (Number(baseParams.payload) || 400) * 6);
  let D = rotorDiameterFor(key, mtow, N);
  let R = null, converged = false;

  for (let i = 0; i < maxIter; i++) {
    R = runSizingFn({ ...baseParams, configType: key, nPropHover: N, propDiam: D });
    const m = Number(R?.MTOW);
    if (!isFinite(m) || m <= 0) break;
    const Dn = rotorDiameterFor(key, m, N);
    if (!isFinite(Dn) || Dn <= 0) break;
    if (Math.abs(Dn - D) < tol) { D = Dn; converged = true; break; }
    /* under-relax: the map is contractive here, but damping costs one extra
       iteration and removes any chance of a limit cycle */
    D = D + 0.7 * (Dn - D);
  }
  return { propDiam: D == null ? null : +D.toFixed(4), converged, MTOW: R?.MTOW ?? null,
    note: converged
      ? `rotor diameter solved with MTOW to hold DL ${d.DL_lbft2} lb/ft^2`
      : `rotor diameter did NOT converge; last value returned and flagged` };
}

export function capabilitiesFor(key, nRotors) {
  const c = CONFIG_CAPABILITIES[key] || CONFIG_CAPABILITIES.liftcruise;
  return {
    ...c,
    rotorLiftShare: c.rotorLiftShare(nRotors),
    boomCount: c.boomCount ? c.boomCount(nRotors) : 2,
  };
}

/** Minimum installed thrust-to-weight so the aircraft still hovers with one
    rotor out. Arithmetic: N/(N-1) for independent rotors. Cross-shafted
    layouts are exempt — a motor failure there does not cost a rotor. */
/* -- THE OEI MARGIN IS A POWER FACTOR, AND THAT IS THE RECONCILIATION ----
   `twRatio` is a THRUST ratio. The provenance registry recorded it as
   unverified with the note "NASA Table 4 gives OEI 1.4-3.8 and gust 1.75-2.5 x
   hover — NOT yet reconciled". It could not be reconciled because those are
   POWER ratios and this is a thrust ratio: two different currencies, the same
   class of mistake as several already found in this engine.

   THE RIGHT SOURCE IS NOT TABLE 4. Table 4 is a seconds-long TRANSIENT
   (disturbance rejection, gust) — a different question from the SUSTAINED
   installed margin, and the engine already separates the two as `oeiTransient`
   and `twInstalled`. The sustained margin is published in NASA's own sizing
   tool description, corpus S3270:

     "A power factor input is also utilized to account for a failure scenario
      that requires an increase in power output. This power factor is a FUNCTION
      OF THE AIRCRAFT CONFIGURATION; INCREASING THE NUMBER OF PROPELLERS/ROTORS
      REDUCES THE POWER FACTOR REQUIRED because the impact of a failed rotor
      (and the shutting down of its matching pair as appropriate) is decreased.
      POWER FACTORS TYPICALLY RANGE FROM 1.3 TO 1.8."

   CONVERTING SETTLES IT. Momentum theory at fixed disk area and density gives
   P proportional to T^1.5 — the relation the twInstalled sizing condition
   already uses — so the engine's long-standing default of twRatio 1.30 is a
   power factor of 1.30^1.5 = 1.482, SQUARELY INSIDE NASA'S 1.3-1.8 BAND. The
   value was defensible all along; nobody had converted the units.

   CONFIGURATION DEPENDENCE, per the same quotation: the pure thrust-replacement
   arithmetic N/(N-1) gives a power factor of (N/(N-1))^1.5, which falls with
   rotor count exactly as NASA describe. It drops BELOW their 1.3 floor at eight
   rotors and above, so the floor is applied — a failed rotor must be replaced
   AND the aircraft must still manoeuvre, which pure thrust replacement does not
   buy. 1.8 caps the other end. */
export const OEI_POWER_FACTOR_MIN = 1.3;   // [SRC] S3270
export const OEI_POWER_FACTOR_MAX = 1.8;   // [SRC] S3270

/** NASA's OEI power factor for this layout, clamped to the published band. */
export function oeiPowerFactorFor(key, nRotors) {
  const d = CONFIG_DEFAULTS[key];
  const N = Math.max(1, nRotors ?? d?.nRotors ?? 0);
  /* An interconnected drive does not lose a rotor when a motor fails, so pure
     thrust replacement does not apply and the published floor governs. */
  const raw = (d && d.oeiThrustShare === false) || N < 2
    ? OEI_POWER_FACTOR_MIN
    : Math.pow(N / (N - 1), 1.5);
  return +Math.min(OEI_POWER_FACTOR_MAX,
           Math.max(OEI_POWER_FACTOR_MIN, raw)).toFixed(3);
}

/** [SRC] VFS 2025, Hartman/Altamirano/Suh: below n_z = 1.35 g "the operating
    torque required to hover exceeds the continuous operation rated torque ...
    this design would not be acceptable". A motor-torque limit, so unlike the
    OEI factor it does NOT relax as rotor count rises. */
export const NZ_CONTINUOUS_TORQUE_MIN = 1.35;

/** The margin expressed as the THRUST ratio the sizing condition wants, which
    is the hover load factor n_z.

    TWO PUBLISHED CRITERIA BOUND THIS AND BOTH ARE NECESSARY. The OEI factor
    above is a failure-replacement argument and falls with rotor count: 1.334 at
    four rotors, 1.191 at twelve. The continuous-torque floor is a motor limit
    and does not fall at all, because every rotor still has to hover on
    continuous torque. From five rotors upward N/(N-1) drops below 1.35 and the
    torque criterion binds.

    The engine previously applied only the first, then reported the second as a
    failing check on every layout — a check flagging something the sizing had
    the information to prevent.

    THE TWO ARE COMPATIBLE. n_z = 1.35 is a power factor of 1.568, inside NASA's
    published 1.3-1.8 band; taking the maximum stops the design sitting on the
    bottom edge of that band rather than leaving it. Measured cost is 0.6% to
    7.1% of MTOW, and neither benchmark moves, because both set T/W per vehicle
    from published values rather than from this function. */
export function twRatioFor(key, nRotors) {
  const oei = Math.pow(oeiPowerFactorFor(key, nRotors), 2 / 3);
  return +Math.max(NZ_CONTINUOUS_TORQUE_MIN, oei).toFixed(3);
}

/** Which of the two criteria decided the value, for reporting. */
export function twRatioBasis(key, nRotors) {
  const oei = Math.pow(oeiPowerFactorFor(key, nRotors), 2 / 3);
  return oei >= NZ_CONTINUOUS_TORQUE_MIN
    ? { binding: "oei", oei: +oei.toFixed(3), torqueFloor: NZ_CONTINUOUS_TORQUE_MIN }
    : { binding: "continuous-torque", oei: +oei.toFixed(3),
        torqueFloor: NZ_CONTINUOUS_TORQUE_MIN };
}

export function oeiThrustMarginFor(key, nRotors) {
  const d = CONFIG_DEFAULTS[key];
  const N = Math.max(1, nRotors ?? d?.nRotors ?? 0);
  if (!d || d.oeiThrustShare === false || N < 2) return null;
  return +(N / (N - 1)).toFixed(3);
}

/* =====================================================================
   SIZING THE THRUST MARGIN FOR CONTROLLABLE ONE-ROTOR-OUT
   =====================================================================
   twRatioFor answers "how much thrust replaces the failed rotor's lift",
   from NASA's published OEI power-factor band. That is a THRUST question.
   Holding attitude after the failure is a MOMENT question and needs more,
   because the survivors must trim the asymmetry as well as carry the
   weight — see validation/spin-arrangement.mjs for the measured gap.

   This solves for the margin that buys it. Like solveRotorDiameter, it
   iterates around runSizing rather than living inside it: the required
   margin depends on the converged ring radius, torque-to-thrust ratio and
   weight, and those depend on the margin. Same fixed point, same pattern.

   IT DOES NOT ALWAYS CONVERGE TO A NUMBER, AND THAT IS THE RESULT. A
   four-rotor aircraft cannot be made controllable after a single failure
   at any margin, so this returns `attainable: false` with the reason
   rather than climbing towards an asymptote. Sizing heavier would spend
   weight and buy nothing.

   MEASURED COST at the reference mission, against the thrust-replacement
   margin the engine ships:
       12 rotors   1.191 -> 1.201   MTOW +0.4%    12 of 12 failures
        6 rotors   1.200 -> 1.501   MTOW +13-15%   2 of 6
        4 rotors   no solution at any margin
   Rotor count, not thrust margin, is the dominant fault-tolerance
   variable, and twelve rotors is qualitatively different from six.
   ===================================================================== */
export function solveControllableTW(key, baseParams, runSizingFn, opts = {}) {
  const d = CONFIG_DEFAULTS[key];
  const N = Math.max(1, baseParams?.nPropHover ?? d?.nRotors ?? 4);
  if (!d || typeof runSizingFn !== "function") return null;
  if (d.oeiThrustShare === false)
    return { attainable: false, reason: "interconnect shaft — a motor failure does not cost a rotor, "
           + "so the rotor-loss controllability case does not apply to this layout" };

  const maxIter = opts.maxIter ?? 6, tol = opts.tol ?? 5e-3;
  let tw = twRatioFor(key, N), spins, last = null, converged = false;

  for (let i = 0; i < maxIter; i++) {
    const R = runSizingFn({ ...baseParams, configType: key, nPropHover: N,
                            twRatio: tw, ...(spins ? { rotorSpins: spins } : {}) });
    /* The engine exports Drotor, not Rrotor — an earlier version of this
       function gated on R.Rrotor, which is undefined, so it broke out on the
       first iteration and silently returned the thrust-replacement margin
       marked "not converged". */
    const Rrot = (Number(R?.Drotor) || 0) / 2;
    if (!R || !(R.MTOW > 0) || !(Rrot > 0)) break;
    last = R;
    const W = R.MTOW * 9.80665;
    const ring = ringRadiusFor(N, Rrot, { interleaved: false });
    const kMu = torqueToThrustRatio({ thrustPerRotorN: W / N, R_m: Rrot,
                                      tipSpeed_ms: R.TipSpd, FM: baseParams.etaHov ?? 0.7 });
    const need = requiredTWForControllableOEI({ m: N, r: ring, kMu, weightN: W,
                                                target: opts.target ?? "any",
                                                max: opts.max ?? 3.0 });
    if (!need.twRequired)
      return { attainable: false, reason: need.reason, atMTOW: R.MTOW,
               twTried: tw, bestAtCeiling: need.bestAtCeiling };
    spins = need.spins;
    if (Math.abs(need.twRequired - tw) <= tol) { tw = need.twRequired; converged = true; break; }
    tw = need.twRequired;
  }

  /* BOTH CONSTRAINTS ARE NECESSARY, so the sizing margin is the larger. The
     controllability search can return a value BELOW the continuous-torque
     floor — the twelve-rotor hybrid asks only 1.201 — and shipping that would
     satisfy the moment requirement by violating the motor-torque one the
     baseline exists to meet. Where the floor already covers controllability,
     the correct report is that it costs nothing, not that it saves weight. */
  const floorTW = twRatioFor(key, N);
  const binding = tw > floorTW ? "controllability" : "continuous-torque";
  return { attainable: true, converged, twRatio: +Math.max(tw, floorTW).toFixed(3),
           twControllability: +tw.toFixed(3), twThrustReplacement: floorTW,
           binding, rotorSpins: spins, MTOW: last?.MTOW,
           freeAtFloor: tw <= floorTW };
}
