/* =====================================================================
   VALIDATION REPORT GENERATOR
   =====================================================================
   Emits VALIDATION.md.

   WHY THIS IS A PROGRAM AND NOT A DOCUMENT

   A hand-written validation report drifts from the code the moment either
   one changes, and a stale validation report is worse than none because it
   is confidently wrong. Every number below is captured from a harness run
   at generation time, in this process, and the git commit is stamped into
   the output. If the code changes and the report is not regenerated, the
   commit hash in the header says so.

   The judgement paragraphs -- the eleven NASA-STD-7009B factor levels --
   are authored, because they are judgements. Each one cites evidence
   measured in the same run. They live in ASSESSMENT below so a reader can
   see the claim and the justification in one place, and so that changing a
   claimed level is a reviewable diff.

   STRUCTURE follows NASA-STD-7009B (Standard for Models and Simulations,
   w/Change 1, 5 March 2024) section 4.3.8 and Appendix E -- not anything
   invented here. See research note 24. Section 4.3.8 requires: the best
   estimate, a statement of uncertainty, the capability and results
   assessments, explicit caveats, and the risks of acceptance. [M&S 32]
   requires explicit warnings for unachieved acceptance criteria and
   outstanding defects, which is why this report is REQUIRED to contain a
   section listing what is still wrong.

   Run: node validation/report.mjs
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { OUTPUTS } from "../src/lib/provenance.js";

const STD = "NASA-STD-7009B, Standard for Models and Simulations, w/Change 1, 5 March 2024";

/* The harnesses, in the order `npm test` runs them, each with what it
   PROVES rather than what it is called. */
const HARNESSES = [
  ["scope-check.mjs",     "Every referenced identifier is imported, declared or a runtime global, and no component calls a React hook below an early return. Both catch silent breakage that a browser would only reveal on the code path a user happens to take, and that a bundler cannot see: a build resolves no free variables and counts no hooks. The hook rule was added after a conditional hook stopped a tab loading entirely while the production build and every other gate passed -- React requires the same number of hooks on every render, so a hook below an early return is called or skipped as that return's condition flips, and the component renders perfectly right up until it does. One pre-existing instance was found and fixed when the rule was introduced."],
  ["tab-registry.mjs",    "Every UI tab is reachable, labelled, and has a render branch. Added after five of nine diagrams in a sister project turned out to be unreachable behind a tab bar."],
  ["units.mjs",           "One unit table, applied in one place, with every factor checked against the DEFINITION of the unit rather than against another factor. A converter is the easiest place in a tool like this to be confidently wrong: the number changes, the label changes, and nothing looks broken. The pound, foot, inch and nautical mile are all DEFINED in SI terms - 0.45359237 kg, 0.3048 m, 25.4 mm, 1852 m - so every conversion closes to machine precision and is checked to 1e-12; a tolerance of about a percent would hide a transposed digit. Each pair must round-trip, k(a->b) * k(b->a) = 1, which a reciprocal used the wrong way round cannot survive, and the prefix pairs that deliberately do not round-trip - kN to lbf returns to N, since the imperial side has no kilo-prefix in use - must differ from unity by an exact power of ten rather than by anything else. Conversion runs in ONE place, the Kpi component both studios render their headline numbers through, rather than at the 97 call sites that would each be a chance to attach the wrong factor to a number. It converts in BOTH directions because this interface already mixes systems: the aircraft studio publishes wing loading in lb/ft2, speeds in knots and range in nautical miles because its sources are imperial, so a switch that only went SI to imperial would leave a sheet half in each. The failure mode is deliberate and checked: an unknown unit, a non-numeric placeholder or a unit already in the requested system passes through untouched, because a value that does not convert is a small annoyance while one converted wrongly and labelled as correct is the defect this tool exists to prevent. Finally the gate walks the studios and requires every literal unit string they display to be either in the table or listed in NO_CONVERT with a stated reason - which is how a label padded to \" kg\" was found silently declining to convert."],
  ["identities.mjs",      "Relations the engine must satisfy BY DEFINITION -- unit closure, energy identities, mass sums -- hold to 0.2%. These are not accuracy tests; a failure means the code contradicts itself."],
  ["golden-master.mjs",   "Byte-level regression over stored cases spanning all six configurations. Proves a refactor changed no number."],
  ["components.mjs",      "Each weight model scored ALONE at published inputs with no sizing loop around it. This is the only harness that can separate a bad model from a bad loop."],
  ["database-report.mjs", "The aircraft database agrees with the values the engine uses, and the gaps are counted rather than felt."],
  ["analysis-layers.mjs", "The constraint diagram, uncertainty, exploration and mission layers report on the loop without changing it."],
  ["vsp-models.mjs",      "Published NASA OpenVSP geometry is reproduced to tolerance when the tool is asked to replicate it."],
  ["geometry-export.mjs", "No rotor overlaps another; every body is structurally connected; the exported .vsp3 matches what the viewer draws."],
  ["fuselage-outline.mjs", "One fuselage outline, drawn the same way by every view that draws it, and an asymmetry that is defended rather than removed. Three views each wrote the body curve out by hand -- the general arrangement, the structural profile and the station diagram -- and the copies drifted: the general arrangement closed its tail cone on +0.14H to +0.02H while the other two closed on +0.22H to +0.05H, so the same aeroplane had two different upsweeps depending on which tab was open, and its nose began 6 percent of fuselage height BELOW the centreline while the other two mirrored theirs. No harness named any of the three files, which is how it survived. The tail-cone asymmetry itself is correct and the gate protects it: an aft fuselage rises toward the tail to buy rotation clearance, so the keel must travel further than the crown falls, the tip face must sit wholly above the centreline, and the crown must not be inverted -- reversing the upsweep would still close the shape and still look like an aeroplane at a glance. Everything with no physical reason to be asymmetric is required to mirror exactly: the nose in side view, and both halves in plan, where every port ordinate must be the exact negative of its starboard twin. The provenance is the second half. Torenbeek (1982, section 3.5.1, pp. 93-94) publishes nose fineness 1.5 to 2.0 and tail-cone length 2.5 to 3 times the cylindrical diameter, so the gate tests the ratio the drawing ACTUALLY ENDS UP WITH against those ranges rather than the cap in the code, and records the measured answer: on every class the length fraction binds and the result falls BELOW both ranges -- transport 1.34 and 2.49, bizjet 1.07 and 1.99, turboprop 1.27 and 2.36, trainer 0.85 and 1.57 -- so the fineness caps are inert and these lengths stay declared conventions carrying no dimension line. The upsweep MAGNITUDE is not sourced at all and the gate requires it to stay that way, because the sources that discuss upsweep do not share a datum: Torenbeek and Raymer measure it on the fuselage CENTRELINE, Raymer's 25 degrees is a LOWER-SURFACE figure for rear-loading freighters only, his 10 to 12 degrees is a contour deviation from the freestream, and Kroo measures the centre of cross-sectional area at 75 percent of cone length, so a number borrowed from any of them would be measured from the wrong line. This project's own research note already ruled on it -- CABIN-LAYOUT.md section 5, \"Tail-cone upsweep angle. Not sourced anywhere ... Do not invent one\" -- and ESDU 80006, the dedicated primary item, is paywalled and is named as what would replace the convention."],
  ["nasa-configs.mjs",    "THE PRIMARY VALIDATION. Sizes each NASA concept vehicle from its own published parameters and scores ten weight-statement groups against Table 12."],
  ["validate.mjs",        "Scores against brochure-grade figures for real commercial aircraft (Joby, Archer and others), with mission-convention bracketing."],
  /* ── ADDED AFTER THIS LIST WAS FOUND STALE ──────────────────────────
     A credibility report that omits a third of the evidence understates the
     verification factor it is scoring. These harnesses existed and ran in
     CI; the report simply had not been told about them, which is the same
     class of drift the paper is written against. */
  ["tab-visibility.mjs",  "Configuration-dependent tabs are hidden rather than showing NaN. A tool that prints NaN where a number belongs has told the user something false."],
  ["vsp-run.mjs",         "Every configuration's exported AngelScript is EXECUTED by OpenVSP and must build a model. A generator that is never run is not validated by any amount of reading."],
  ["vspaero.mjs",         "A vortex-lattice polar is solved on the exported model. CDi/CL^2 constant across the polar, span efficiency and lift-curve slope against finite-wing theory."],
  ["rotorcraft-tail.mjs", "NDARC 14-1 rotor-referenced tail volume reproduces the stabiliser measured off NASA's own three-view to 0.21%."],
  ["drive-failure.mjs",   "NDARC 17-4 transmission sizing after a motor loss on a cross-shafted layout — the failure case the rotor-loss test cannot represent."],
  ["autorotation.mjs",    "Fradenburgh's autorotative index, validated by placing a Bo-105-class helicopter inside the published 15-30 band, plus whether the manoeuvre can be entered at all."],
  ["whirl-flutter.mjs",   "Margin against Acree's published XV-15 boundary at the same wing thickness. No boundary is computed for our aircraft and no curve is fitted through two points."],
  ["load-cases.mjs",      "SC-VTOL gust set and the CS-23.341 alleviation factor, with the SI form checked against the regulation's own imperial 498 constant."],
  ["reg-applicability.mjs", "Whether the certification document GOVERNS the design at all is decided before any of its thresholds are evaluated, because a rule from a document that does not apply has no verdict to give. The Regulatory tab used to render SC-VTOL-02's own applicability limit -- VTOL.2005(a), MCTOM 5 700 kg -- as an ordinary compliance row with a PASS/FAIL badge beside the others, so a design this engine produces by moving the Payload slider to its own maximum, 11 132 kg or twice the limit, was reported as one FAIL with nine PASS beside it, including VTOL.2215 on an aircraft VTOL.2215 does not govern. Nothing that checks thresholds can catch that: every threshold was evaluated correctly. The gate holds the five applicability gates of VTOL.2000 and VTOL.2005, and distinguishes two kinds of undecided that must not be merged -- a seat count nobody typed, which one keystroke closes, from VTOL.2000(d)'s VNO limit, which NOTHING closes because this engine computes no VNO, VNE or VH. Merging them made the incompleteness flag permanent, and a warning that is always on stops being read; so the applicability test here is honestly reported as never complete, only never contradicted. The EASA and FAA gates are held as DIFFERENT limits rather than one number in two units -- 5 700 kg against 12 500 lb = 5 669.905 kg, and nine seats against six -- so a 5 685 kg eight-seater is shown inside EASA scope and outside FAA scope, the same 30 kg trap that drone-regulatory.js refuses at 52 g. It also refuses the shape of a second defect found alongside: every rule's value must MOVE across a thirteen-design sweep, which withdrew a dive-speed row that compared VD to p.vCruise while the engine defines VD as exactly 1.25 x vCruise -- 1.250000 for every design ever sized, a check that could not fail. load-factor-source.mjs refuses that class for load factors by scanning for numeric literals, and could not see this one because it was a ratio of a quantity to itself. Finally it SERVER-RENDERS the panel at four scope states, which nothing else in this repo does: tab-render.mjs covers src/tabs/, and this panel lives in src/panels/, the same blind spot in which a conditional hook once stopped a tab loading entirely while the production build and every other gate passed."],
  ["blade-twist.mjs",     "Ideal twist through the derived collective; the curve must pass through Beta34, which is the same quantity OpenVSP samples at 0.75 R."],
  ["control-authority.mjs", "Du et al. ACAI. Validated by reproducing the published hexacopter paradox: uncontrollable after one rotor failure AT FULL RANK."],
  ["hover-dynamics.mjs",  "Hover damping and control power, with configuration rankings tested against a 50% perturbation of the assumed coefficients."],
  ["render-freeze.mjs",   "Every 3D view is byte-compared with a committed reference, so a geometry change cannot pass unnoticed."],
  /* Added 2026-09-16: reproducibility, domains, warnings, provenance, release. */
  ["design-file.mjs",     "A saved design reopens to the same result on every layout, compared by the golden master's own rule; an engine change is reported, platform noise is not. The per-design form of EASA CM-S-014's continuity-of-results check."],
  ["validation-domain.mjs", "The validation and verification domains the app placards against are regenerated from the harnesses and must match the committed file ([M&S 26])."],
  ["result-warnings.mjs", "Every result carries the [M&S 32] warnings a-h with their impact and an [M&S 33] uncertainty statement, in the app and in the report."],
  ["provenance-report.mjs", "Every output any layout emits is classified; unregistered, orphaned or duplicate registry keys fail."],
  ["api.mjs",             "The Node API and the evtol-size command return the app's own results, with warnings, and every export is documented."],
  ["turboelectric.mjs",   "The turboelectric powertrain against NASA's turboelectric lift+cruise (Silva et al. 2018 Table 3): fuel, fuel burn and turboshaft power within 15%, gross weight no worse than the battery sibling; mass closure with fuel on every layout."],
  ["cpacs-export.mjs",    "Every layout's CPACS export validates against the CPACS 3.5.1 schema and its mass statement equals the engine's; the traceability CSV has one row per check."],
  ["release.mjs",         "One version in package.json, a Keep a Changelog history, and a CITATION.cff that names the last release."],
  ["aircraft-classes.mjs", "The class registry is the one dispatch point, an unknown class is an error, and the eVTOL engine, defaults and golden snapshot are fenced off from class work."],
  ["trainer.mjs",         "Piston trainer: GASP weights reproduce NASA Aviary's tests; Cessna 172S and two other trainers against published empty weights; a C172S sized from its own requirements."],
  ["transport.mjs",       "Jet transport: the FLOPS weight port reproduces NASA's FLOPS output for a 737-800 model on all 35 weights; A320 and 737-800 against published data."],
  ["transport-mission.mjs", "Jet segment mission, engine-deck shape, engine location, tail volume and the jet atmosphere do what their sources say."],
  ["transport-aero.mjs",  "The FLOPS drag build-up reproduces Aviary's aerodynamics tests and drag polars printed by FLOPS for three transports, by Aviary's own measure."],
  ["bizjet.mjs",          "Business jet: the jet method with business-jet inputs; Citation Latitude, Citation Longitude and Pilatus PC-24 against published operating weights and ranges."],
  ["aircraft-engine.mjs", "The aircraft engine: one result for every fixed-wing type equal to the class's own numbers, and matching charts, payload-range, polars, trades, type comparison and reference aircraft consistent with the sizing."],
  ["turboprop.mjs",       "Turboprop: Scholz & Nita's ATR 72 design point, Hamilton Standard propeller weights, and three regional turboprops against published empty weights."],
  ["paper-claims.mjs",    "Every numeric claim in paper/ is re-derived from the harnesses. The paper argues that published figures drift from code; this is what stops its own doing so."],
  /* ── DRONE ENGINE, added with it ─────────────────────────────────────
     Listed here on the same reasoning the note above this list already
     records: these run in CI, and a report that omits them understates the
     evidence it is scoring. Adding them with the engine rather than after
     someone notices. */
  ["vtol-autopilot.mjs", "A hybrid VTOL exported as an ArduPilot QuadPlane and a PX4 VTOL, and the parameters its SIZE puts out of reach. This is driven from the aircraft engine rather than the drone engine for a reason the gate checks first: every VTOL parameter of consequence is an airspeed - the transition speed, the fixed-wing floor, the stall speed, the cruise trim - and the drone engine sizes multirotors from thrust-stand data with no wing, no stall and no cruise, so a wingless configuration is refused outright rather than exported with invented numbers. The headline finding is that the autopilots' VTOL parameters are scoped to small UAVs while this engine sizes aircraft: PX4 publishes VT_ARSP_TRANS, the airspeed at which it switches to fixed wing, with a range of 0 to 30 m/s, and every aircraft here stalls above that, so the parameter is refused with the number that did not fit rather than clamped - a clamped value would load cleanly and describe a different aircraft. ArduPilot's battery compensation is published 6 to 53 V against packs near 800 V and is refused the same way. ArduPilot's own guidance can also contradict itself at this size: AIRSPEED_MAX is documented as BOTH slightly less than level flight speed at THR_MAX AND at least 50 percent above AIRSPEED_MIN, which a design whose dive speed is under 1.8x its stall speed cannot satisfy, so the exporter emits the value the aircraft gives and names the gap in m/s and what the documentation says it costs. Transition DURATION is refused on both sides because PX4's VT_F_TRANS_DUR is the whole front transition while ArduPilot's Q_TRANSITION_MS is only the tail after minimum airspeed, and the back transition is refused because a deceleration in m/s^2 and a duration in seconds are different physical quantities. Configurations map by MECHANISM: lift+cruise is a Standard VTOL and a tiltrotor is a Tiltrotor, while the two hybrid layouts that tilt some rotors and stop the others have no generic PX4 airframe at all and are refused rather than approximated with a neighbour."],
  ["drone-frames.mjs",    "Multirotor frame geometry generated from ArduPilot's own AP_MotorsMatrix.cpp: motor numbers are output channels and not the motor-test order, every motor states a rotation, CW and CCW counts balance, ordinary coaxial pairs counter-rotate and corotating frames genuinely corotate."],
  ["drone-components.mjs", "Every catalogue part traces to a datasheet URL, and no motor is modelled on a resistance whose winding convention the vendor never stated -- an ambiguity worth a factor of three in copper loss. How many motors qualify is reported as a finding about the industry, not asserted as a target."],
  ["drone-rotor.mjs",     "Rotor thrust and power against 4,145 measured UIUC wind-tunnel rows by leave-one-out cross-validation, with the full per-propeller error distribution rather than a mean. Also that the module refuses to extrapolate beyond measured RPM, and that figure of merit is only judged against a literature bound inside the Reynolds range that bound was stated for."],
  ["drone-motor.mjs",     "Electrical demand of a shaft operating point from published Kv, Kt, I0 and Rm with no fitted parameter, scored against 419 measured KDE rows. Scores only what the tables can contradict: eta_motor is NOT measured on any production thrust stand, so the motor/ESC split is the model's own output and quoting its mean would be the model describing itself. The falsifiable tests are that predicted motor power never exceeds the measured DC bus power, that rpm/Kv never exceeds the pack voltage, and that the residual charged to the ESC rises with duty as diode freewheeling requires. The model IS falsified on 4 of 419 rows, three of them one motor at high throttle; the gate pins that set and its margin rather than averaging it away. Also that 21 of 24 catalogue motors are refused outright because the vendor states no resistance convention or no no-load current."],
  ["drone-esc.mjs",       "The ESC layer, which carries a MEASURED TABLE and not a model, and this gate re-derives both rejections from the data every run rather than trusting a comment. Dai's series-resistance ESC model (T-Mech 2019) requires one constant R_e; solved on every row it drifts 5.3x with duty, the same sign on all four motors independently. The diode-freewheeling two-term form fits a forward drop of 4.2, 3.2, -0.3 and -2.8 V across the four motors, half of them negative, so it is not reading diode physics either. The residual is not noise: the printing resolution is at most 6 percent of the loss. Also that the residual is named a JOINT residual because it contains ESC loss AND motor-model error inseparably, that its band is carried rather than a median alone (up to 22 points p10-p90), that a constant efficiency would be 17 percent wrong at low duty, and that 9 of 10 catalogue ESCs do not state their rectification mode so the table is flagged rather than silently applied."],
  ["drone-battery.mjs",   "Pack energy, and the two ways published battery data misleads. Energy is capacity times the MEAN DISCHARGE voltage, but vendors sometimes print the CHARGED voltage in the same field: four of five DJI packs have Ah x V equal to their published Wh to the digit, while the TB60 is 14.4 percent out because its 52.8 V is 4.40 V per cell, which DJI's own Mavic 3 page separately names as a charging voltage limit. The published energy recovers 3.85 V per cell, the nominal every other pack uses. The module reads published Wh, derives one only when the voltage field is inside the nominal band, and refuses outright otherwise. The second gap is an omission: no manufacturer page in this survey states a discharge cut-off, so usable fraction is a REQUIRED argument with no default and the gate checks it still throws without one. Also that hover and cruise endurance are kept apart, and that the tempting claim - that basis explains the low power cluster - is refuted by the sample, since the cruise-basis Phantom 4 Pro V2 sits inside the hover cluster and the two low aircraft are simply the largest."],
  ["drone-sizing.mjs",    "The closure that turns the measured blocks into an aircraft, by SELECTING real parts rather than correlating. It states its own limitation first and checks it: the loop is NOT validated against any published aircraft, because no aircraft exists whose components are all in the measured databases - NASA GAMMA publishes a measured inertia tensor and runs the modelled KDE4213-XF but turns an APC 15x5.5 that UIUC never tested, the Alta X publishes the best endurance sweep in the survey on 33 inch rotors against a measured span of 2.2 to 21.0 inches, and six of seven surveyed aircraft do not state their rotor count. What IS checked: the mass, thrust and energy identities close; every link refuses rather than extrapolating and names which link and why; payload, altitude and mission length move the answer in the directions physics fixes; and the computed specific power lands inside the 86.9 to 132.9 W/kg band seven real aircraft exhibit, which is a bracket and not a validation. Also that all five declared inputs throw when omitted, structure mass among them, because only one vehicle in the survey publishes an empty weight and it bundles motors, ESCs, propellers and avionics together."],
  ["drone-trade.mjs",     "The trade study, built so that the Pareto front is a fact and the ranking is an opinion. The front is checked exhaustively against the dominance definition in BOTH directions - nothing on it is dominated, everything off it is dominated by something - and it is recomputed under wildly different weightings and required to come back identical, because a front that shifted with preference would not be a front. The ranking is required to carry its normalisation, its caveat, and a sensitivity analysis showing how far each weight can move before the winner changes; weighting mass against endurance must select different designs, or the sensitivity is not doing anything. Also that a degenerate objective contributes zero rather than dividing by a zero span, that every rejected candidate keeps its reason, and that COST is absent because the catalogue holds no prices."],
  ["drone-airframe.mjs",  "Airframe geometry for the 3D view, where the load-bearing quantity is arm length. The tempting formula uses 2*pi/N for the angular spacing, which is correct only for an evenly spaced ring: 10 of 25 ArduPilot frames are not evenly spaced, and on those the even-ring formula returns a radius smaller than the discs need, so the view would draw overlapping propellers and call the number a clearance. The gate verifies no two discs overlap at the computed radius across every frame, that a 5 percent shorter arm DOES overlap so the bound is genuinely minimal, and that the declared tip gap is actually delivered. It also covers coaxial frames - every OCTAQUAD and DODECAHEXA stacks two motors per arm - which are positioned in z rather than spread around the ring, have disc area counted per ARM rather than per motor, and carry an explicit warning that their thrust is not supported by the measured data, since UIUC measured isolated rotors and the lower disc works in the upper wake. Finally that the view rotation preserves length, without which an orthographic view could not be measured off."],
  ["drone-dynamics.mjs",  "A 6-DOF multirotor simulation, and the reason it does not replace the controllability test it appears to supersede. Equations of motion from Bauersfeld and Scaramuzza Eqs. 1-3, control allocation from the same Du et al. effectiveness matrix ACAI uses, and controller gains transcribed from a shipped ArduPilot frame parameter file. Inertia is DERIVED from the sized design and labelled so, because no commercial multirotor in the survey publishes a tensor; motor time constant and airframe drag coefficient are declared, the latter because the literature archive states in writing that no usable value exists. Since there is no measured trajectory to score against, the gate checks what must hold of any rigid body: free fall is exactly g, angular momentum is conserved to 1e-13 under zero torque, the quaternion stays normalised, RK4 converges at fourth order (measured ratio 16.1 against a predicted 16), and the intermediate-axis instability appears with the perturbation growing 625x about the middle axis and not at all about the other two, which is the sharpest available test that the omega-cross-J-omega coupling is right. Then the part that is evidence rather than arithmetic: with one rotor dead, a sweep of 400 moment directions through the allocator reproduces ACAI exactly - the quadrotor blocks all 400 directions, the octorotor blocks none, and the PNPNPN hexacopter blocks exactly half while ACAI returns exactly zero, sitting on the controllability boundary. That is why the hexacopter flies every simulated scenario while remaining uncontrollable: a simulation samples only the directions its scenario demands."],
  ["drone-playback.mjs", "The flight view looked like the aircraft was rolling unevenly and wiggling rather than flying steadily, and every physics gate passed because the physics was never wrong: a commanded-level hover holds attitude, thrust and position to within 1e-11 degrees, 1e-12 newtons and 1e-13 metres over thirty seconds, on both the quad and the hexa. The judder was in the playback. The animation advanced WHOLE trace samples and drew the nearest one raw; under 240 s the trace is 50 Hz, a display is typically 60 Hz, and 50 and 60 do not divide, so replaying that loop at 60 Hz and counting samples advanced per frame gives 0,1,1,1,1,0,1,1,1,1,1,0 -- one frozen frame in every six, for ever. It reads worst in ROLL because attitude moves most per sample, and a flight past 240 s decimates toward 5 Hz where a frame advances only once in twelve. Nothing that checks the trajectory could catch it, because the trajectory was correct at every sample: the defect lived BETWEEN the samples, in how they were drawn. The fix carries the sub-sample remainder to the renderer, which interpolates between sample i and sample i+1; measured on a 15 degree roll pulse this cuts the largest per-frame attitude step from 1.4634 to 0.2439 degrees, exactly the six times the cadence predicts. The gate holds the bound that makes it defensible -- across 2,400 interpolated poses not one falls outside the segment joining its two computed states, so the aircraft is never drawn anywhere the integrator did not pass through -- and it holds the split in the source: every NUMBER on the panel still reads the computed sample while only the drawn geometry reads the interpolated pose, and paused, scrubbed or on the last sample no interpolation happens at all. Angles take the shortest path, so a yaw crossing the +/-180 wrap interpolates through 180 rather than through zero, which a naive lerp would spin the long way round by 358 degrees in a single sample. Finally it refuses the quiet kind of wrong: the file used to claim that EVERY FRAME of the animation is a state the integrator produced, that claim is now false, and the gate fails if it is left standing rather than narrowed to what still holds. Two further defects found in the same view are held here too. A FLIGHT NOW ENDS RATHER THAN LOOPING: the index used to advance with (k + 1) % trace.length and nothing ever set playing false, so playback ran for ever and at the seam the aircraft teleported from wherever the flight finished back to the origin while the trail collapsed from full to empty -- measured on the roll pulse that jump is 24.91 m against a largest genuine step of 0.112 m, 223 times larger. Interpolation cannot soften it, because at the last sample there is no i+1 to interpolate toward. An endless loop also implies a steady state this aircraft does not have: in Stabilize there is no outer velocity loop, so a flight that ends translating is still translating, and looping showed that motion restarting rather than continuing. The loop now owns its index in a ref, because a first attempt raised the end-of-flight flag from inside a setI updater and an updater must be pure -- React calls it twice under StrictMode -- and the gate checks that every external seek writes the ref too, or the scrubber would appear to be ignored. THE ADDRESS BAR IS READ, NEVER MAINTAINED: Root and both studios used to replaceState their mode and tabs into the URL, so a refresh reopened whatever you were last looking at instead of the eVTOL overview, and returning to eVTOL could leave a stale ?mode= behind. The canonical address is now the bare one and nothing writes to it; the single remaining write CLEARS the routing params rather than setting them. Links are still read exactly as before, which is what aircraft-classes.mjs pins, so an address someone types or is sent still opens the right studio -- it is consumed rather than kept. The initial search is captured at module load because the studios are lazy and mount after Root clears the bar; a live read would find the params already gone and a deep link would lose its tab. The gate refuses a dormant syncUrl helper as well as an active one, since a writer left in place is a writer somebody re-enables."],
  ["drone-risk.mjs",      "The uncertainty statement, and the guard that keeps it from quietly growing. An exceedance curve looks like a confidence interval on the whole answer and a severity column looks like a scored assessment; neither is true here. The curve is order statistics of 3,621 leave-one-out predictions over the measured propeller database, so the gate requires it to be monotone, to start at essentially 100 percent and reach zero, to contain no distribution parameter anywhere, and to score only INTERPOLATED predictions - scoring the extrapolation the rotor module refuses to perform would flatter it. It covers the ROTOR layer only, and the register must lead with the fact that no whole-vehicle band exists because no aircraft has all its components in the measured databases. No entry may carry a likelihood, probability or score, since NASA publishes no five-by-five matrix and NASA/SP-20240014019 p. 74 states the qualitative form can no longer be considered valid; severity is three words used only for ordering. The register must also RESPOND to the design - a coaxial frame raises the coaxial finding and a planar one does not, a quadrotor raises the rotor-loss finding with its structural reason and an octorotor does not - and a voltage-field defect is graded by magnitude, since a charge limit in the nominal field is a different defect from a nominal printed coarser than its own energy figure implies."],
  ["drone-avionics.mjs",  "ESC and radio-link selection, both on published data only. The radio is the sharper case: Friis is not in doubt but EIRP is, because a vendor publishes max TX power without saying whether it is CONDUCTED at the connector or RADIATED by the antenna, and the two differ by the antenna gain - 5 dB is a factor of 1.8 in range. ONE of fifteen surveyed radios states which it means, and says so by giving the conversion formula and quoting the FCC EIRP ceiling separately. So range is COMPUTED for that one and BRACKETED for the rest, and the gate checks the bracket width is exactly the antenna gain expressed as range. Four products whose figure coincides with a regulatory limit expressed in radiated power are recorded as HINTS and never promoted to statements. Free space is treated as a CEILING rather than a prediction: it cannot model ground reflection, Fresnel obstruction or fade margin, so the gate uses it to FALSIFY - every published range is checked against its own ceiling, since a claim above free space would be provably impossible, and none of the seven checkable claims is. Bands are kept as regulatory variants rather than averaged, after a dual-band product would otherwise have reported 1650 MHz, a frequency it never transmits on; sensitivity published per packet rate is kept as a set, since range and latency trade on the same hardware. On the ESC side, an unpublished rating is never treated as headroom - including a part whose model name contains 45A while its page says only 45A designed - and 6 of 8 ESCs quoting a burst current state no duration for it."],
  ["drone-autopilot.mjs", "What a sizing run may tell a flight controller, and what it must refuse to say. A parameter file is the only artefact this tool produces that an aircraft then flies on, so the gate is built around the refusals. The central one: this run computes a hover thrust fraction and ArduPilot has a parameter called MOT_THST_HOVER, but ArduPilot's own setup page says to set it to \"0.25 or below the expected actual hover thrust percentage (lower is safe)\" and let MOT_HOVER_LEARN find the real value, so the computed figure is emitted as a comment and never as that parameter. PX4's MPC_THR_HOVER is the SAME physical quantity with the OPPOSITE official advice - it seeds the hover-thrust estimator and the land detector - so it IS emitted, and the gate requires both directions of that asymmetry. A second refusal follows from it: thrust fraction is not control-signal fraction except when PX4's published model rel_thrust = factor * rel_signal^2 + (1 - factor) * rel_signal has factor 0, so THR_MDL_FAC is left at its default rather than translated from ArduPilot's MOT_THST_EXPO, an equivalence that exists only in ArduPilot source. Pack endpoints come from the selected cell's own datasheet rather than the 4.2/3.3 V LiPo rule, because the studio's default cell is Li-ion NMC whose published floor is 2.5 V; the gate also checks that the LiPo rule still reproduces ArduPilot's shipped Hexsoon-edu450.param exactly at 3S. The published propeller-size tables are interpolated between knots and CLAMPED outside them, never extended. Power-module calibration and rate-loop gains are refused as not being sizing outputs, and PX4 layouts with no generic airframe are refused rather than approximated with a neighbour."],
  ["drone-obstacles.mjs", "Things to fly into, and the exact limit of what a strike may claim. Contact is the one part of an impact this tool can state precisely, so it is stated precisely and nothing beyond it is offered. The envelope is the ROTOR DISC, spanM/2, not the hub: a multirotor strikes things with its propeller tips, and a centre-point test reports a clean pass for a flight that took the blades off -- the gate flies a track 200 mm outside a wall and requires the hub test to miss while the disc test strikes. Contact is found by a SIGNED DISTANCE and a bisection rather than a per-sample boolean, because the trace is sampled every 20 ms and at 10 m/s the aircraft moves 200 mm between samples, so a boolean test reports the strike up to a fifth of a metre late and can pass through a thin wall entirely; the gate requires the located contact to be finer than a twentieth of that sample travel, and it lands exact. Every distance checked is a length someone can measure off the scene: zero on a face, positive by the gap outside, negative by the depth inside, the true corner distance on a diagonal, and for a tree the minimum of trunk and canopy so the trunk governs below the crown. WHAT IS NOT MODELLED IS ASSERTED SO IT CANNOT QUIETLY APPEAR: a strike ENDS the flight, with no bounce, no tumble and no broken arm, because structureMassKg is a declared scalar carrying no material or geometry, nothing in the component survey publishes a propeller's impact strength, and no source here gives a restitution coefficient against concrete or foliage. Each contact carries that sentence with it, and the gate fails if any post-impact quantity is ever attached. This is the same rule simulate() already applies at the ground, where it breaks the integration on the zero crossing and reports crashed rather than modelling the landing."],
  ["drone-flight-energy.mjs", "The flight integrates STATE OF CHARGE and ends when the declared usable energy is gone, the way it already ends on ground contact -- so what limits a long flight is the pack, not a duration cap someone chose. The claim this gate defends is that no new physics was added to do it: the per-timestep chain is the one sizing.js walks for the hover point, and two exact identities pin it. Evaluated at sizing.hover.thrustPerRotorN it reproduces sizing.hover.busPowerW TO THE BIT, along with the same rpm, shaft power and per-rotor bus power, so a second power model cannot grow here unnoticed; and over a window where thrust is held steady the accumulated energy equals P*t to 1e-13, so the figure is an integral of that chain rather than a fresh estimate of endurance. Turning the energy model off leaves the trajectory byte-identical, which is what lets every other drone harness keep its meaning. What the gate deliberately does NOT assert is that a simulated hover empties the pack at enduranceMin(): it does not, because enduranceMin divides energy by a STEADY hover power while the simulation closes no position loop, so the aircraft drifts, leans, and spreads its per-rotor thrusts -- and power being convex in thrust, a spread costs more than a uniform thrust of the same mean. Measured on the reference hexacopter: steady at 451.6 W for the first 290 s, rising past 537 W, emptying at 29.0 min against the idealised 31.5. The gate pins that as a direction rather than a tuned number, requiring the drifted flight to cost MORE and never less. The one data gap is bounded rather than filled: a rotor below the propeller's measured thrust floor has no rpm the measured curve can name and rotor.js refuses to extrapolate, so -- shaft power being monotonic in thrust across the whole measured range -- such a sample contributes its floor value to an upper BOUND and nothing to the figure, leaving the true energy in a stated interval that the gate requires to stay under 1 % wide. With one rotor of a hexacopter dead that is 16.6 % of rotor samples and 0.53 % of the energy, because the allocator idles the rotor opposite the failure. A thrust above the measured ceiling cannot be bounded from inside the data and invalidates the figure instead of biasing it low. Nothing here invents a discharge curve, an internal resistance, a voltage sag, a Peukert exponent or a temperature derating -- battery.js states that no surveyed pack publishes any of them and that modelling them would mean inventing the curve -- so the state of charge is an energy fraction of the DECLARED usable energy at the pack's published nominal voltage, and it carries the same four assumptions enduranceMin() already carries wherever it is shown. There is no low-battery threshold, reserve or failsafe either: autopilot.js refuses PX4's SoC thresholds because guessing them would set a failsafe the user believes was computed, and the flight here ends at the usableFraction the user declared and at no other point."],
  ["drone-flight-worker.mjs", "The 6-DOF integration runs in a worker rather than in the Flight panel's render body, and this proves that moving it changed nothing: the run computed across the message boundary is compared to the run computed inline and must be identical BYTE FOR BYTE -- every sample, every per-rotor thrust, every reported flag -- on a scenario with a stepped altitude, a rate-approached altitude, a held tilt, an initial roll upset and a dead rotor, so the comparison runs through the allocator's degraded path and the contact logic rather than a hover where every sample is the same number. A tolerance would be the wrong instrument here: relocating a computation must not perturb it at all. The boundary itself is checked, because it is what makes the equivalence possible: a scenario is a TARGET FUNCTION and postMessage carries data, so the panel sends the arguments makeScenario takes and the worker rebuilds the scenario -- and the gate asserts that a built scenario genuinely CANNOT be structured-cloned, so that if it ever can the rebuild is removed deliberately instead of being carried forward unexamined. The worker must also survive a half-typed scenario, since one worker serves the panel's whole lifetime and an escaping throw would take every later flight with it: an over-cap scenario comes back as makeScenario's own message and the worker still answers afterwards. The duration cap was 120 s only because the integration blocked the browser -- measured at 2.4 ms per second of flight, 4.5 ms with a rotor dead -- and a full-length 250 s flight is required to cross the boundary whole, all 12,501 samples of it. Finally the cap is held to being what it is, a compute budget and not a physical limit: the integrator carries no state of charge, which is why a scenario outrunning the design's computed endurance is REPORTED by the panel rather than refused here."],
  ["drone-regulatory.mjs", "Mass thresholds carry the document and clause that set them, and the confusions found in the primary texts are refused: 25 kg is not 55 lb (52 g apart, both strict, so a 25.000 kg design fails both), 250 g is not 0.55 lb, and the US 0.55 lb rule gates REGISTRATION for RECREATIONAL flight only. Also that mass alone is not always the trigger, and that the tool's sizing envelope is a separate question from the law."],
];

/* ── the authored judgements ────────────────────────────────────────────
   7009B scores eleven factors 0-4 across two assessments. The standard is
   explicit that the factors are "nearly orthogonal" and that combining
   them "is not intended and should be avoided in all labeling approaches"
   -- so there is deliberately NO overall score here. A single credibility
   number would violate the standard this report is written to.

   `ceiling` records where a level is capped by the available EVIDENCE
   rather than by the state of the code, so a reader can tell the two
   apart. */
const CAPABILITY = [
  { factor: "M&S Data Pedigree", level: 2,
    why: "Every one of the engine's outputs carries a machine-readable provenance tag with its citation, and CI fails if an output is emitted untagged, so traceability to formal documentation is enforced rather than asserted. Uncertainty in all tagged inputs is at least estimated, because the band width is derived from the tag class. Level 3 requires ALL data traced to a sufficiently representative referent; inputs tagged [LAY] are by definition assumptions with no referent, so 3 is unavailable while any remain." },
  { factor: "M&S Verification", level: 2,
    why: "Documented practices are applied to all features and run in CI on every push: twenty-one harnesses run on every push, including an identity suite that checks relations the engine must satisfy by definition, a golden master over 277 cases spanning all six configurations, a scope check, tab-reachability and tab-visibility gates, geometry and export gates, per-model component tests, byte-compared 3D renders, EXECUTION of every exported model by OpenVSP, and seven physics harnesses each validated by reproducing a published result rather than by self-consistency. Level 3 requires rigorous end-to-end verification with ALL important errors satisfying requirements; the open defects listed in section 8 are not yet closed, so it is not claimed." },
  { factor: "M&S Validation", level: 2,
    ceiling: true,
    why: "Key outputs compare favorably with a sufficiently similar referent system: ten weight-statement groups across three NASA concept vehicles, plus brochure figures for commercial aircraft. LEVEL 2 IS THE HONEST MAXIMUM AVAILABLE TO THIS PROJECT AND NO CODE CHANGE CAN RAISE IT. Level 3 requires data from the Real World System -- a physical aircraft built, flown and weighed. NASA's concept-vehicle weight statements are NDARC output, i.e. another model's results, and manufacturer figures are brochure claims rather than certified weight statements. Until someone weighs a real eVTOL and publishes the statement, no referent exists that could support level 3." },
  { factor: "M&S Development Technical Review", level: 0,
    why: "Insufficient evidence. There has been no peer review of any kind: not independent, not formal internal, not informal internal. Level 1 requires a favorable informal internal peer review, and a developer reviewing their own work is not a peer review under any reading of the standard. This is the lowest score in this assessment and it is accurate." },
  { factor: "M&S Development Process/Product Management", level: 2,
    why: "Formal processes are applied: the source is under version control, every gate runs in CI on every push, changes carry their rationale in the commit message, and the research that justifies each method is written down before the method is built. Level 3 requires controlled processes with compliance measured, which would mean a defined and audited process baseline rather than a convention followed by one developer." },
];

const RESULTS = [
  { factor: "M&S Use Assessment", level: 1,
    why: "The M&S type, application domain and purpose match the proposed use -- conceptual sizing of electric VTOL aircraft -- and the inclusions, exclusions and assumptions are documented and acceptable for it. Level 1 is where a model sits when it has no prior use history, which is the case: this tool has not previously been used for a design decision by anyone." },
  { factor: "M&S Input Pedigree", level: 2,
    why: "Input data are formally traceable through the same provenance registry as the outputs, with estimated uncertainties. Level 3 requires all input data traced to a sufficient referent with acceptable accuracy, precision and uncertainty; the [LAY] inputs are not." },
  { factor: "M&S Uncertainty Characterization", level: 2,
    why: "Sources of uncertainty are identified, expressed quantitatively, classified by provenance class, and propagated to an MTOW band with the dominant contributors ranked. Level 3 requires propagation of ALL known uncertainty; items tagged [GAP] are excluded from the propagation and reported separately, which is exactly the level-2 wording." },
  { factor: "M&S Results Robustness", level: 3,
    why: "Sensitivities are known for many parameters including many of the key ones, by measurement: every sidebar input is perturbed and the full sizing loop re-run, and every provenance-tagged input is perturbed and ranked by its contribution to the band. Level 4 requires most parameters and most key sensitivities; the screen is one-at-a-time and therefore blind to interactions, which it states in its own output, so 4 is not claimed." },
  { factor: "M&S Use/Analysis Technical Review", level: 0,
    why: "Insufficient evidence, for the same reason as the development review factor. No results produced by this tool have been reviewed by anyone other than its author." },
  { factor: "M&S Use Process/Product Management", level: 2,
    why: "Formal processes are applied: results are reproducible from a stamped commit, the harnesses that produced them run in CI, and this report is generated from those runs rather than written by hand." },
];

/* ── run the harnesses and capture what they actually printed ──────────── */
function run(file) {
  const t0 = Date.now();
  try {
    const out = execFileSync(process.execPath, [`validation/${file}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { file, out, code: 0, ms: Date.now() - t0 };
  } catch (e) {
    return { file, out: (e.stdout || "") + (e.stderr || ""), code: e.status ?? 1, ms: Date.now() - t0 };
  }
}

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
  catch { return null; }
}

console.log("Running the harnesses...");
const runs = HARNESSES.map(([file, proves]) => {
  const r = run(file);
  console.log(`  ${r.code === 0 ? "ok  " : "FAIL"} ${file.padEnd(22)} ${String(r.ms).padStart(6)} ms`);
  return { ...r, proves };
});
const failed = runs.filter(r => r.code !== 0);

/* ── parse the primary validation into a table ─────────────────────────── */
const nasa = runs.find(r => r.file === "nasa-configs.mjs").out;
const vehicles = [];
for (const line of nasa.split(/\r?\n/)) {
  let m = line.match(/^──\s+(.+?)\s{2,}\[(.+)\]\s*$/);
  if (m) { vehicles.push({ name: m[1].trim(), cfg: m[2].trim(), rows: [] }); continue; }
  m = line.match(/^\s{3}(\w+)\s+([\d.]+)\s+(kg|kWh)\s+([\d.]+)\s+(kg|kWh)\s+([+-][\d.]+)%/);
  if (m && vehicles.length) vehicles.at(-1).rows.push({ k: m[1], want: m[2], unit: m[3], got: m[4], err: +m[6] });
}
const nasaSummary = (nasa.match(/^PASS: .*$/m) || [""])[0];

/* ── provenance census ─────────────────────────────────────────────────── */
const prov = {};
for (const k of Object.keys(OUTPUTS)) {
  const s = OUTPUTS[k]?.status || "untagged";
  prov[s] = (prov[s] || 0) + 1;
}
const provTotal = Object.values(prov).reduce((a, b) => a + b, 0);
const validatedKeys = Object.keys(OUTPUTS).filter(k => OUTPUTS[k]?.status === "validated").sort();

const grab = (file, re) => { const m = runs.find(r => r.file === file)?.out.match(re); return m ? m[0].trim() : null; };

/* ── compose ───────────────────────────────────────────────────────────── */
const L = [];
const p = (...s) => L.push(...s);
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty  = git(["status", "--porcelain"]);
const stamp  = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const lvl = a => a.map(f =>
  `| ${f.factor} | **${f.level}**${f.ceiling ? " (capped by evidence)" : ""} | ${f.why} |`).join("\n");

p(`# Validation Report — eVTOL Conceptual Sizing Tool`, ``,
  `**Generated ${stamp} from commit \`${commit || "unknown"}\`${dirty ? " (WORKING TREE DIRTY — this report does not describe a committed state)" : ""}.**`, ``,
  `This document is produced by \`validation/report.mjs\`, which runs every`,
  `harness and captures what each one printed. It is not written by hand. If`,
  `the code changes and this file is not regenerated, the commit hash above`,
  `will not match \`git rev-parse --short HEAD\` and the report is stale.`, ``,
  `Structure and terminology follow **${STD}**, sections 4.3.8 and Appendix E.`, ``,
  `---`, ``,
  `## 1. Purpose and permissible uses`, ``,
  `**Purpose.** Conceptual-stage sizing of electric vertical-take-off-and-landing`,
  `aircraft: given a mission and a configuration, close the weight, energy and`,
  `power loop and report the resulting vehicle with its geometry.`, ``,
  `**Permissible uses.** Trade studies, configuration comparison, sensitivity and`,
  `feasibility screening at the conceptual stage, and teaching. Results are`,
  `appropriate as an input to a decision about which configurations deserve`,
  `further analysis.`, ``,
  `**Uses NOT permitted by the evidence in this report.** Certification credit;`,
  `structural sizing; performance guarantees; any use where the absolute value of`,
  `a mass or an energy is relied upon without the error bands in section 6. The`,
  `models are empirical weight correlations fitted largely to conventional`,
  `rotorcraft, and section 4 measures what that costs on eVTOL configurations.`, ``,
  `**Why no weight-prediction tool can ever carry certification credit for`,
  `weight — this is a property of the regulation, not of this tool.** CS 27.29`,
  `requires that empty weight and the corresponding centre of gravity be`,
  `determined by WEIGHING the rotorcraft, with fixed ballast, unusable fuel and`,
  `full operating fluids, in a condition that is well defined and repeatable.`,
  `CS 27.25 then builds every weight limit on that measured empty weight. The`,
  `compliance evidence is a set of scales. No prediction — this tool's, NDARC's,`,
  `or a manufacturer's — substitutes for it, and a tool that implied otherwise`,
  `would be misrepresenting the certification basis rather than merely being`,
  `inaccurate.`, ``,
  `That is what makes "is it accurate enough to certify?" the wrong question.`,
  `The right one is whether it is accurate enough for the DESIGN DECISION it`,
  `informs — which configurations deserve further analysis — and that is what`,
  `section 4 measures and section 6 bands.`, ``,
  `---`, ``,
  `## 2. Referents and their pedigree`, ``,
  `**This is the most important section for a reader deciding how much to trust`,
  `the numbers, and it is deliberately placed before the results.**`, ``,
  `| referent | what it actually is | pedigree |`,
  `|---|---|---|`,
  `| NASA UAM concept vehicles (NASA/TM-20210017971 Table 12) | published weight statements for eight concept variants | **Model output, not measured hardware.** These statements are themselves NDARC results. Agreement with them demonstrates that this tool reproduces the reference method; it does not demonstrate agreement with a real aircraft. |`,
  `| Joby S4, Archer Midnight and other commercial types | manufacturer-published MTOW, span, pack energy, range | **Brochure figures, not certified weight statements.** Quoted under unstated mission conventions, which is why the harness brackets mission convention explicitly rather than scoring a single number. |`,
  `| NASA OpenVSP models (RAVEN, SWFT) | published geometry files | Measured directly from the distributed \`.vsp3\` files. The strongest pedigree of the three, and it constrains shape rather than mass. |`, ``,
  `**Consequence, stated plainly: no referent available to this project is a`,
  `Real World System in the sense NASA-STD-7009B means — an aircraft that was`,
  `built, flown and weighed. That caps the Validation factor in section 7 at`,
  `level 2 permanently, regardless of any further work on the code.**`, ``,
  `---`, ``,
  `## 3. Verification`, ``,
  `${runs.length} harnesses, all gated in \`npm test\` and run in CI on every push.`, ``,
  `| harness | what it proves | result |`,
  `|---|---|---|`);
for (const r of runs) p(`| \`${r.file}\` | ${r.proves} | ${r.code === 0 ? "pass" : "**FAIL**"} |`);

p(``, `---`, ``,
  `## 4. Validation — every published comparison`, ``,
  `Each vehicle is sized from **its own published parameters**, then ten groups`,
  `of its published weight statement are scored. Nothing is tuned per vehicle.`, ``,
  nasaSummary ? `**${nasaSummary}**` : `**The primary validation harness did not report a summary — see section 8.**`, ``);
for (const v of vehicles) {
  p(`### ${v.name}`, ``, `\`${v.cfg}\``, ``,
    `| group | published | this tool | error |`, `|---|---|---|---|`);
  for (const r of v.rows)
    p(`| ${r.k} | ${r.want} ${r.unit} | ${r.got} ${r.unit} | ${r.err > 0 ? "+" : ""}${r.err.toFixed(1)}%${Math.abs(r.err) <= 5 ? " ✓" : ""} |`);
  p(``);
}
p(`**How to read a large error.** \`struct\` aggregates several groups, so a good`,
  `\`struct\` number can hide offsetting component errors — that is exactly what`,
  `happened before the rotor group was scored separately, where a −46.7% rotor`,
  `error was cancelling inside a −0.7% structures total. Component-level results`,
  `in \`components.mjs\` measure each model alone, with no sizing loop around it,`,
  `and are the right place to attribute a group error to a model.`, ``,
  `### Commercial aircraft, brochure-grade`, ``,
  `\`\`\``,
  (grab("validate.mjs", /Scored metrics[\s\S]*?Worst\s+:.*/m) || "(no summary parsed)"),
  `\`\`\``, ``,
  `The two mean errors are the same aircraft scored two ways — the fraction-based`,
  `empty-weight model and the component buildup — reported side by side so the`,
  `cost of the simpler method is visible rather than assumed.`, ``,
  `---`, ``,
  `## 5. Provenance of every output`, ``,
  `Every value the engine emits carries a machine-readable status. CI fails if an`,
  `output is emitted without one.`, ``,
  `| status | count | share |`, `|---|---|---|`);
for (const [k, v] of Object.entries(prov).sort((a, b) => b[1] - a[1]))
  p(`| ${k} | ${v} | ${(100 * v / provTotal).toFixed(0)}% |`);
p(``,
  `**\`validated\` means one thing only: the value has been numerically compared`,
  `to a published figure and the error is recorded.** ${validatedKeys.length} of ${provTotal} outputs`,
  `(${(100 * validatedKeys.length / provTotal).toFixed(0)}%) meet that bar:`, ``,
  validatedKeys.map(k => `\`${k}\``).join(", "), ``,
  `The remaining outputs are derived from validated quantities, sourced from`,
  `literature, calibrated, or assumed — the table above says which. A reader`,
  `should treat an output's status as the first thing to check before relying`,
  `on it, and the low validated share as the honest state of the art here`,
  `rather than an oversight: most conceptual-sizing outputs have no published`,
  `counterpart to compare against at all.`, ``);

p(`---`, ``,
  `## 6. Uncertainty and sensitivity`, ``,
  `Method: non-intrusive forward propagation by one-at-a-time perturbation of`,
  `every provenance-tagged input, re-running the full sizing loop each time, with`,
  `band widths taken from the provenance class rather than chosen per input. The`,
  `ranking of contributors is therefore sourced from the same registry CI`,
  `enforces, and an input cannot quietly acquire a narrow band.`, ``,
  `This is the same family of method NASA applies to NDARC itself (Khurana,`,
  `Russell & Scott, *Uncertainty Quantification of a Rotorcraft Conceptual Sizing`,
  `Toolsuite*): forward propagation, Latin hypercube sampling, global sensitivity`,
  `attribution. That paper also reports a result worth repeating here — NDARC's`,
  `deterministic baseline did not coincide with the mean of its Monte Carlo`,
  `ensemble. **A single-point answer from this tool is exposed to the same effect,`,
  `so the band should be read alongside the point, not instead of it.**`, ``,
  `**Stated limitation, per [M&S 33]:** the screen is one-at-a-time and is`,
  `therefore blind to interactions between inputs. Where inputs interact, the`,
  `true band is wider than the reported one. The Design Space layer samples`,
  `jointly and is the right tool for that question.`, ``,
  `---`, ``,
  `## 7. Credibility assessment (NASA-STD-7009B Appendix E)`, ``,
  `Scored 0–4 on the standard's own scale, where **0 means "insufficient`,
  `evidence" and is a legitimate, reportable outcome.** The standard "levies no`,
  `requirements with respect to what levels to achieve … merely that the levels`,
  `be determined and reported" (§4.3.6).`, ``,
  `**There is deliberately no overall score.** The standard states that the`,
  `factors are nearly orthogonal and that combining them "is not intended and`,
  `should be avoided in all labeling approaches". Any single credibility number`,
  `would violate the standard this report is written to.`, ``,
  `### 7.1 Capability assessment (outcome of development)`, ``,
  `| factor | level | justification |`, `|---|---|---|`, lvl(CAPABILITY), ``,
  `### 7.2 Results assessment (outcome of use)`, ``,
  `| factor | level | justification |`, `|---|---|---|`, lvl(RESULTS), ``,
  `### 7.3 The two zeros`, ``,
  `Both technical-review factors are **0**. No part of this work — not the`,
  `methods, not the code, not the results — has been reviewed by anyone other`,
  `than its author. Under 7009B even level 1 requires a favorable *informal`,
  `internal* peer review, and self-review does not qualify.`, ``,
  `This is reported first among the weaknesses because it is the one a reader`,
  `cannot verify for themselves from the repository, and because it is the`,
  `weakness that no further engineering can remove.`, ``);

/* Section 8 is REQUIRED by [M&S 32]. The list of out-of-tolerance metrics is
   generated from the same run as section 4, so it cannot fall out of step
   with the results it qualifies. */
const outOfTol = [];
for (const v of vehicles) for (const r of v.rows)
  if (Math.abs(r.err) > 5) outOfTol.push({ v: v.name, ...r });
outOfTol.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));

p(`---`, ``,
  `## 8. Caveats, limits and open defects`, ``,
  `Required by [M&S 32]: explicit warnings for unachieved acceptance criteria,`,
  `violated assumptions, violated limits and outstanding defects. **A validation`,
  `report without this section is not compliant with the standard it cites.**`, ``,
  `### 8.1 Metrics outside ±5% (generated from this run)`, ``);
if (!outOfTol.length) p(`None.`, ``);
else {
  p(`| vehicle | group | published | this tool | error |`, `|---|---|---|---|---|`);
  for (const r of outOfTol)
    p(`| ${r.v} | ${r.k} | ${r.want} ${r.unit} | ${r.got} ${r.unit} | **${r.err > 0 ? "+" : ""}${r.err.toFixed(1)}%** |`);
  p(``);
}
p(`### 8.2 Known limitations of the models`, ``,
  `- **The weight models are empirical correlations fitted mostly to`,
  `  conventional rotorcraft, and eVTOLs are out of that population.** This is`,
  `  measured rather than asserted: \`components.mjs\` scores each model against`,
  `  its own fitting population and against eVTOLs separately, and the`,
  `  degradation is reported. Where a rotor group misses badly, that is the`,
  `  reason, and it is a property of the published method, not a coding error.`,
  `- **Mission convention moves the answer more than most modelling choices.**`,
  `  Published range and pack figures are quoted under conventions that are`,
  `  usually unstated. The harness brackets the convention rather than scoring`,
  `  one interpretation, and an aircraft whose brochure triple cannot close`,
  `  under ANY convention is reported as such instead of being fitted.`,
  `- **One-at-a-time uncertainty is blind to interactions** (section 6).`,
  `- **Geometry is conceptual.** The shapes are sized from the design`,
  `  variables and checked for overlap, connectivity and agreement with`,
  `  published NASA models. They are not structurally analysed, and the booms in`,
  `  particular are idealised as free cantilevers where a real airframe is a`,
  `  braced frame — an open question recorded in the research notes, not a`,
  `  settled model.`,
  `- **The aerodynamics are only partly computed.** A vortex-lattice polar is`,
  `  now solved on the exported model (\`vspaero.mjs\`), giving lift-curve slope,`,
  `  span efficiency and induced drag for the LIFTING SURFACES. It is inviscid:`,
  `  it does not give viscous drag, separation or stall, the fuselage is`,
  `  deliberately excluded and its drag stays with NDARC drag areas, and`,
  `  cruise L/D remains a design input constrained by class-level bounds rather`,
  `  than a computed result. The solver found a real defect on its first clean`,
  `  run — every exported wing had an aspect ratio 65% below the sized value —`,
  `  which is the argument for having it, and also a reminder that it is new.`,
  `- **Failure analyses are hover-linearised and steady.** Controllability`,
  `  (ACAI), drive-system redistribution and autorotation are all evaluated`,
  `  about a trimmed hover. None models the transient DURING the failure, and`,
  `  NASA measured 2.9-3.8x hover power demand in that transient against the`,
  `  steady share these compute. Steady capability is necessary, not sufficient.`,
  `- **Named gaps that are open by choice, not oversight.** NDARC's twin-rotor`,
  `  interference is computed but its WEIGHT consequence is not charged,`,
  `  because the only published drive weight contradicts it. The side-by-side`,
  `  carries no tail, because fitting one needs a boom the fuselage weight model`,
  `  would over-charge. Rotor spin order decides fault tolerance; the engine`,
  `  accepts one and can search for the best, but no control in the app sets`,
  `  it. Each is recorded where it bites, with its measurement.`, ``,
  `### 8.3 What "±5%" means here`, ``,
  `The ±5% figure used throughout is an **acceptance criterion applied to`,
  `comparisons against published data**, adopted as a standing project rule. It`,
  `is not a claim that any individual answer is accurate to 5%. The count of`,
  `metrics meeting it, and the errors of those that do not, are both reported`,
  `above; neither is summarised into a pass.`, ``);

p(`---`, ``,
  `## 9. Risks of accepting these results`, ``,
  `Required by [M&S 49].`, ``,
  `1. **No independent review.** The dominant risk. Every method choice,`,
  `   every boundary between weight groups and every acceptance threshold was`,
  `   set by one person. The harnesses check internal consistency and agreement`,
  `   with published data; they cannot catch a mistake shared between the model`,
  `   and the person checking it.`,
  `2. **Validating against another model's output.** Agreement with the NASA`,
  `   concept vehicles shows this tool reproduces NDARC's answers. If NDARC is`,
  `   wrong for a configuration, this tool will be wrong the same way and the`,
  `   benchmark will report agreement.`,
  `3. **Out-of-population extrapolation.** A user can size a vehicle far from`,
  `   anything in the validation set. The tool reports when a model is`,
  `   extrapolating, but the error in that regime is unmeasured.`,
  `4. **Brochure referents may be inconsistent.** Manufacturer figures are not`,
  `   audited and may not describe one self-consistent aircraft; the harness`,
  `   tests this and reports when a published triple cannot close.`, ``,
  `---`, ``,
  `## Appendix A — verbatim harness output`, ``,
  `Everything below is captured from the run that produced this document.`, ``);
for (const r of runs)
  p(`<details><summary><code>${r.file}</code> — exit ${r.code}, ${r.ms} ms</summary>`, ``,
    "```", r.out.replace(/\r/g, "").trimEnd(), "```", ``, `</details>`, ``);

/* `--check` regenerates the report and compares it with the committed copy, so
   a code change that alters the results cannot be merged while VALIDATION.md
   still describes the old ones. The generated-at line and every measured
   duration are normalised out first, since those legitimately differ between
   two runs of identical code.

   THE COMMIT HASH AND DIRTY FLAG MUST BE NORMALISED FOR THE SAME REASON, and
   until they were, this check could never pass on a clean checkout — which is
   the only thing CI ever runs. api.mjs reports the build's provenance, so the
   report embeds the working copy's HEAD in two places:

       "commit":"<sha>","dirty":<bool>        the API version record
       evtol-size v0.2.0-dev (commit <sha>)   the CLI --version line

   The report is necessarily generated BEFORE the commit that contains it, so a
   committed VALIDATION.md carries its PARENT's hash. Re-running the check after
   that commit regenerates the file with HEAD's hash instead, and the two can
   never agree: a file cannot contain the hash of the commit that contains it.
   Verified against history — the embedded hash was the parent's on every one of
   the last eight commits that touched VALIDATION.md, so report:check had failed
   on a clean tree for its entire existence while passing locally in the dirty
   window between `npm run report` and `git commit`. That is why a report
   believed to be green kept blocking deploy.yml.

   Normalising these does not weaken the gate: the provenance line is about
   WHICH build produced the report, never about what the harnesses computed,
   and every result in the report is still compared verbatim. */
/* THE CHANGE FENCE IS ABOUT GIT TOPOLOGY, NOT ABOUT RESULTS, so it is
   normalised for the same reason the commit hash is. aircraft-classes.mjs
   prints one of three different lines depending on where it is run: "on
   master", "no git history or no master branch here", or a PASS/FAIL naming
   the current branch. A CI runner checks out ONE branch and has no `master`,
   so it always takes the second; a report generated on master always carries
   the first. The two can never agree, and report:check compares the file
   byte for byte, so this alone kept the gate red on the runner while passing
   locally - the same class of failure the commit-hash note above describes,
   and it cost a green build to find because the check said only "STALE".
   What the fence GUARDS is unaffected: it still runs, and still fails a
   branch that moved the engine or the snapshot. Only its report line is
   collapsed, because which branch produced the report is not a result. */
/* WHICH PYTHON, NOT WHETHER PYTHON. The CPACS schema check reports the
   interpreter it found, and that is "python" on Windows and "python3" on the
   Linux runner. The check PASSES on both -- the line records the name of the
   binary, so comparing it byte for byte asks the runner to have been
   installed the same way as the machine that wrote the report. */
const NORM = t => t
  .replace(/^(\s*PASS\s+a Python with lxml is available to validate against the schema\s+—\s+)\S+\s*$/gm,
           "$1<python>")
  .replace(/^\s*SKIP\s+change fence —.*$/gm, "  SKIP  change fence <branch-dependent>")
  .replace(/^\s*(?:PASS|FAIL)\s+on "[^"]*": eVTOL engine, defaults and golden snapshot unchanged since master.*$/gm,
           "  SKIP  change fence <branch-dependent>")
  .replace(/^\*\*Generated .*$/m, "**Generated <stamp>**")
  .replace(/\d+(\.\d+)?\s?ms\b/g, "<t> ms")
  .replace(/"commit":"[0-9a-f]{7,40}"/g, '"commit":"<sha>"')
  .replace(/"dirty":(?:true|false)/g, '"dirty":<dirty>')
  .replace(/commit [0-9a-f]{7,40}(, uncommitted changes)?/g, "commit <sha>")
  .replace(/\r/g, "");
/* `let`, because --check may drop tool-gated sections from it below. The file
   WRITTEN by a normal run is always the full report; only the comparison
   copy is ever reduced. */
let body = L.join("\n") + "\n";

/* A HARNESS THAT CANNOT RUN HERE IS NOT A HARNESS THAT DISAGREES.

   vsp-run.mjs and vspaero.mjs EXECUTE OpenVSP, which is deliberately not a
   dependency of this project: both print "SKIPPED — no vspscript.exe found"
   and pass when it is absent. So a report generated on a machine that HAS
   OpenVSP records six configurations built and a VSPAERO polar solved, and a
   CI runner that does not have it records the skip instead. Those two files
   differ by 2,274 lines and no amount of re-running makes them converge --
   report:check was asking the runner to reproduce a tool it does not have.

   Regenerating the report without OpenVSP would fix the check by DELETING the
   evidence: the committed report is the stronger record precisely because the
   models really were built. So the sections a harness SKIPPED FOR A MISSING
   TOOL *in this environment* are excluded from the comparison on both sides,
   by name, and the check says which and why. Everything else is still
   compared verbatim, and on a machine that has OpenVSP nothing is excluded at
   all -- the full report is still verified where it is generated.

   The exclusion is driven by THIS BUILD's output, never by the committed
   file, so a committed report cannot suppress its own comparison. */
const TOOL_MISSING = /SKIPPED — no vspscript\.exe found/;
const SECTION = /<details><summary><code>([\w.@-]+)<\/code>[\s\S]*?<\/details>/g;

function toolGatedHere(text) {
  const names = new Set();
  for (const m of text.matchAll(SECTION)) if (TOOL_MISSING.test(m[0])) names.add(m[1]);
  return names;
}
const dropSections = (text, names) =>
  names.size === 0 ? text
    : text.replace(SECTION, (whole, name) =>
        names.has(name)
          ? `<details><summary><code>${name}</code></summary>\n<skipped: tool not available in this environment>\n</details>`
          : whole);

if (process.argv.includes("--check")) {
  let committed = null;
  try { committed = readFileSync("VALIDATION.md", "utf8"); } catch {}
  if (committed == null) {
    console.log("\nFAIL: VALIDATION.md does not exist. Run `npm run report`.");
    process.exit(1);
  }
  const gated = toolGatedHere(body);
  if (gated.size) {
    console.log(`\nNOTE: ${gated.size} harness section(s) not compared, because the tool they`);
    console.log("      execute is absent HERE and they skipped rather than ran:");
    for (const n of gated) console.log(`        ${n}  — needs OpenVSP (vspscript.exe)`);
    console.log("      Every other section is compared verbatim. On a machine with the");
    console.log("      tool installed, nothing is excluded.");
    committed = dropSections(committed, gated);
    body = dropSections(body, gated);
  }
  if (NORM(committed) !== NORM(body)) {
    console.log("\nFAIL: VALIDATION.md is STALE - the code no longer produces it.");
    console.log("      The committed report describes results this build does not");
    console.log("      reproduce. Run `npm run report` and commit the result.");

    /* SAY WHAT DIFFERS. This used to fail with the message above and nothing
       else, which is close to useless when the check passes on the machine
       that generated the report and fails on the runner: the one environment
       that can see the difference is the one that cannot be inspected. The
       lines are printed through JSON.stringify so whitespace, stray CR and
       non-ASCII show up as escapes rather than looking identical on screen. */
    const a = NORM(committed).split("\n"), b = NORM(body).split("\n");
    const cut = (s) => (s === undefined ? "(no such line)" : JSON.stringify(s.slice(0, 160)));
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
      if (a[i] === b[i]) continue;
      console.log(`\n      line ${i + 1}:`);
      console.log(`        committed: ${cut(a[i])}`);
      console.log(`        this build: ${cut(b[i])}`);
      shown++;
    }
    if (a.length !== b.length)
      console.log(`\n      line count: committed ${a.length}, this build ${b.length}`);
    console.log(`\n      ${a.reduce((n, l, i) => n + (l !== b[i] ? 1 : 0), 0)} differing line(s) in total.`);
    process.exit(1);
  }
  console.log("\nPASS: VALIDATION.md matches what the harnesses produce now");
  process.exit(failed.length ? 1 : 0);
}
writeFileSync("VALIDATION.md", body, "utf8");
const kb = (L.join("\n").length / 1024).toFixed(0);
console.log(`\nWrote VALIDATION.md (${kb} kB) from commit ${commit || "unknown"}${dirty ? " [DIRTY]" : ""}`);
console.log(`  ${vehicles.length} vehicles, ${vehicles.reduce((a, v) => a + v.rows.length, 0)} published comparisons parsed`);
console.log(`  ${outOfTol.length} metric(s) outside +/-5%, listed in section 8.1`);
console.log(`  provenance: ${validatedKeys.length} validated of ${provTotal}`);

if (!vehicles.length || !vehicles.every(v => v.rows.length)) {
  console.log(`\nFAIL: the validation table came out empty - the harness output format changed`);
  console.log(`      and the parser in report.mjs no longer matches it. The report would`);
  console.log(`      have been published with no results in section 4.`);
  process.exit(1);
}
if (failed.length) {
  console.log(`\nFAIL: ${failed.map(f => f.file).join(", ")} did not pass; the report describes a failing build`);
  process.exit(1);
}
console.log(`\nPASS: report generated, all ${runs.length} harnesses green`);
