# Validation Report — eVTOL Conceptual Sizing Tool

**Generated 2026-09-23 17:12 UTC from commit `901718f` (WORKING TREE DIRTY — this report does not describe a committed state).**

This document is produced by `validation/report.mjs`, which runs every
harness and captures what each one printed. It is not written by hand. If
the code changes and this file is not regenerated, the commit hash above
will not match `git rev-parse --short HEAD` and the report is stale.

Structure and terminology follow **NASA-STD-7009B, Standard for Models and Simulations, w/Change 1, 5 March 2024**, sections 4.3.8 and Appendix E.

---

## 1. Purpose and permissible uses

**Purpose.** Conceptual-stage sizing of electric vertical-take-off-and-landing
aircraft: given a mission and a configuration, close the weight, energy and
power loop and report the resulting vehicle with its geometry.

**Permissible uses.** Trade studies, configuration comparison, sensitivity and
feasibility screening at the conceptual stage, and teaching. Results are
appropriate as an input to a decision about which configurations deserve
further analysis.

**Uses NOT permitted by the evidence in this report.** Certification credit;
structural sizing; performance guarantees; any use where the absolute value of
a mass or an energy is relied upon without the error bands in section 6. The
models are empirical weight correlations fitted largely to conventional
rotorcraft, and section 4 measures what that costs on eVTOL configurations.

**Why no weight-prediction tool can ever carry certification credit for
weight — this is a property of the regulation, not of this tool.** CS 27.29
requires that empty weight and the corresponding centre of gravity be
determined by WEIGHING the rotorcraft, with fixed ballast, unusable fuel and
full operating fluids, in a condition that is well defined and repeatable.
CS 27.25 then builds every weight limit on that measured empty weight. The
compliance evidence is a set of scales. No prediction — this tool's, NDARC's,
or a manufacturer's — substitutes for it, and a tool that implied otherwise
would be misrepresenting the certification basis rather than merely being
inaccurate.

That is what makes "is it accurate enough to certify?" the wrong question.
The right one is whether it is accurate enough for the DESIGN DECISION it
informs — which configurations deserve further analysis — and that is what
section 4 measures and section 6 bands.

---

## 2. Referents and their pedigree

**This is the most important section for a reader deciding how much to trust
the numbers, and it is deliberately placed before the results.**

| referent | what it actually is | pedigree |
|---|---|---|
| NASA UAM concept vehicles (NASA/TM-20210017971 Table 12) | published weight statements for eight concept variants | **Model output, not measured hardware.** These statements are themselves NDARC results. Agreement with them demonstrates that this tool reproduces the reference method; it does not demonstrate agreement with a real aircraft. |
| Joby S4, Archer Midnight and other commercial types | manufacturer-published MTOW, span, pack energy, range | **Brochure figures, not certified weight statements.** Quoted under unstated mission conventions, which is why the harness brackets mission convention explicitly rather than scoring a single number. |
| NASA OpenVSP models (RAVEN, SWFT) | published geometry files | Measured directly from the distributed `.vsp3` files. The strongest pedigree of the three, and it constrains shape rather than mass. |

**Consequence, stated plainly: no referent available to this project is a
Real World System in the sense NASA-STD-7009B means — an aircraft that was
built, flown and weighed. That caps the Validation factor in section 7 at
level 2 permanently, regardless of any further work on the code.**

---

## 3. Verification

61 harnesses, all gated in `npm test` and run in CI on every push.

| harness | what it proves | result |
|---|---|---|
| `scope-check.mjs` | Every referenced identifier is imported, declared or a runtime global, and no component calls a React hook below an early return. Both catch silent breakage that a browser would only reveal on the code path a user happens to take, and that a bundler cannot see: a build resolves no free variables and counts no hooks. The hook rule was added after a conditional hook stopped a tab loading entirely while the production build and every other gate passed -- React requires the same number of hooks on every render, so a hook below an early return is called or skipped as that return's condition flips, and the component renders perfectly right up until it does. One pre-existing instance was found and fixed when the rule was introduced. | pass |
| `tab-registry.mjs` | Every UI tab is reachable, labelled, and has a render branch. Added after five of nine diagrams in a sister project turned out to be unreachable behind a tab bar. | pass |
| `units.mjs` | One unit table, applied in one place, with every factor checked against the DEFINITION of the unit rather than against another factor. A converter is the easiest place in a tool like this to be confidently wrong: the number changes, the label changes, and nothing looks broken. The pound, foot, inch and nautical mile are all DEFINED in SI terms - 0.45359237 kg, 0.3048 m, 25.4 mm, 1852 m - so every conversion closes to machine precision and is checked to 1e-12; a tolerance of about a percent would hide a transposed digit. Each pair must round-trip, k(a->b) * k(b->a) = 1, which a reciprocal used the wrong way round cannot survive, and the prefix pairs that deliberately do not round-trip - kN to lbf returns to N, since the imperial side has no kilo-prefix in use - must differ from unity by an exact power of ten rather than by anything else. Conversion runs in ONE place, the Kpi component both studios render their headline numbers through, rather than at the 97 call sites that would each be a chance to attach the wrong factor to a number. It converts in BOTH directions because this interface already mixes systems: the aircraft studio publishes wing loading in lb/ft2, speeds in knots and range in nautical miles because its sources are imperial, so a switch that only went SI to imperial would leave a sheet half in each. The failure mode is deliberate and checked: an unknown unit, a non-numeric placeholder or a unit already in the requested system passes through untouched, because a value that does not convert is a small annoyance while one converted wrongly and labelled as correct is the defect this tool exists to prevent. Finally the gate walks the studios and requires every literal unit string they display to be either in the table or listed in NO_CONVERT with a stated reason - which is how a label padded to " kg" was found silently declining to convert. | pass |
| `identities.mjs` | Relations the engine must satisfy BY DEFINITION -- unit closure, energy identities, mass sums -- hold to 0.2%. These are not accuracy tests; a failure means the code contradicts itself. | pass |
| `golden-master.mjs` | Byte-level regression over stored cases spanning all six configurations. Proves a refactor changed no number. | pass |
| `components.mjs` | Each weight model scored ALONE at published inputs with no sizing loop around it. This is the only harness that can separate a bad model from a bad loop. | pass |
| `database-report.mjs` | The aircraft database agrees with the values the engine uses, and the gaps are counted rather than felt. | pass |
| `analysis-layers.mjs` | The constraint diagram, uncertainty, exploration and mission layers report on the loop without changing it. | pass |
| `vsp-models.mjs` | Published NASA OpenVSP geometry is reproduced to tolerance when the tool is asked to replicate it. | pass |
| `geometry-export.mjs` | No rotor overlaps another; every body is structurally connected; the exported .vsp3 matches what the viewer draws. | pass |
| `fuselage-outline.mjs` | One fuselage outline, drawn the same way by every view that draws it, and an asymmetry that is defended rather than removed. Three views each wrote the body curve out by hand -- the general arrangement, the structural profile and the station diagram -- and the copies drifted: the general arrangement closed its tail cone on +0.14H to +0.02H while the other two closed on +0.22H to +0.05H, so the same aeroplane had two different upsweeps depending on which tab was open, and its nose began 6 percent of fuselage height BELOW the centreline while the other two mirrored theirs. No harness named any of the three files, which is how it survived. The tail-cone asymmetry itself is correct and the gate protects it: an aft fuselage rises toward the tail to buy rotation clearance, so the keel must travel further than the crown falls, the tip face must sit wholly above the centreline, and the crown must not be inverted -- reversing the upsweep would still close the shape and still look like an aeroplane at a glance. Everything with no physical reason to be asymmetric is required to mirror exactly: the nose in side view, and both halves in plan, where every port ordinate must be the exact negative of its starboard twin. The provenance is the second half. Torenbeek (1982, section 3.5.1, pp. 93-94) publishes nose fineness 1.5 to 2.0 and tail-cone length 2.5 to 3 times the cylindrical diameter, so the gate tests the ratio the drawing ACTUALLY ENDS UP WITH against those ranges rather than the cap in the code, and records the measured answer: on every class the length fraction binds and the result falls BELOW both ranges -- transport 1.34 and 2.49, bizjet 1.07 and 1.99, turboprop 1.27 and 2.36, trainer 0.85 and 1.57 -- so the fineness caps are inert and these lengths stay declared conventions carrying no dimension line. The upsweep MAGNITUDE is not sourced at all and the gate requires it to stay that way, because the sources that discuss upsweep do not share a datum: Torenbeek and Raymer measure it on the fuselage CENTRELINE, Raymer's 25 degrees is a LOWER-SURFACE figure for rear-loading freighters only, his 10 to 12 degrees is a contour deviation from the freestream, and Kroo measures the centre of cross-sectional area at 75 percent of cone length, so a number borrowed from any of them would be measured from the wrong line. This project's own research note already ruled on it -- CABIN-LAYOUT.md section 5, "Tail-cone upsweep angle. Not sourced anywhere ... Do not invent one" -- and ESDU 80006, the dedicated primary item, is paywalled and is named as what would replace the convention. | pass |
| `nasa-configs.mjs` | THE PRIMARY VALIDATION. Sizes each NASA concept vehicle from its own published parameters and scores ten weight-statement groups against Table 12. | pass |
| `validate.mjs` | Scores against brochure-grade figures for real commercial aircraft (Joby, Archer and others), with mission-convention bracketing. | pass |
| `tab-visibility.mjs` | Configuration-dependent tabs are hidden rather than showing NaN. A tool that prints NaN where a number belongs has told the user something false. | pass |
| `vsp-run.mjs` | Every configuration's exported AngelScript is EXECUTED by OpenVSP and must build a model. A generator that is never run is not validated by any amount of reading. | pass |
| `vspaero.mjs` | A vortex-lattice polar is solved on the exported model. CDi/CL^2 constant across the polar, span efficiency and lift-curve slope against finite-wing theory. | pass |
| `rotorcraft-tail.mjs` | NDARC 14-1 rotor-referenced tail volume reproduces the stabiliser measured off NASA's own three-view to 0.21%. | pass |
| `drive-failure.mjs` | NDARC 17-4 transmission sizing after a motor loss on a cross-shafted layout — the failure case the rotor-loss test cannot represent. | pass |
| `autorotation.mjs` | Fradenburgh's autorotative index, validated by placing a Bo-105-class helicopter inside the published 15-30 band, plus whether the manoeuvre can be entered at all. | pass |
| `whirl-flutter.mjs` | Margin against Acree's published XV-15 boundary at the same wing thickness. No boundary is computed for our aircraft and no curve is fitted through two points. | pass |
| `load-cases.mjs` | SC-VTOL gust set and the CS-23.341 alleviation factor, with the SI form checked against the regulation's own imperial 498 constant. | pass |
| `reg-applicability.mjs` | Whether the certification document GOVERNS the design at all is decided before any of its thresholds are evaluated, because a rule from a document that does not apply has no verdict to give. The Regulatory tab used to render SC-VTOL-02's own applicability limit -- VTOL.2005(a), MCTOM 5 700 kg -- as an ordinary compliance row with a PASS/FAIL badge beside the others, so a design this engine produces by moving the Payload slider to its own maximum, 11 132 kg or twice the limit, was reported as one FAIL with nine PASS beside it, including VTOL.2215 on an aircraft VTOL.2215 does not govern. Nothing that checks thresholds can catch that: every threshold was evaluated correctly. The gate holds the five applicability gates of VTOL.2000 and VTOL.2005, and distinguishes two kinds of undecided that must not be merged -- a seat count nobody typed, which one keystroke closes, from VTOL.2000(d)'s VNO limit, which NOTHING closes because this engine computes no VNO, VNE or VH. Merging them made the incompleteness flag permanent, and a warning that is always on stops being read; so the applicability test here is honestly reported as never complete, only never contradicted. The EASA and FAA gates are held as DIFFERENT limits rather than one number in two units -- 5 700 kg against 12 500 lb = 5 669.905 kg, and nine seats against six -- so a 5 685 kg eight-seater is shown inside EASA scope and outside FAA scope, the same 30 kg trap that drone-regulatory.js refuses at 52 g. It also refuses the shape of a second defect found alongside: every rule's value must MOVE across a thirteen-design sweep, which withdrew a dive-speed row that compared VD to p.vCruise while the engine defines VD as exactly 1.25 x vCruise -- 1.250000 for every design ever sized, a check that could not fail. load-factor-source.mjs refuses that class for load factors by scanning for numeric literals, and could not see this one because it was a ratio of a quantity to itself. Finally it SERVER-RENDERS the panel at four scope states, which nothing else in this repo does: tab-render.mjs covers src/tabs/, and this panel lives in src/panels/, the same blind spot in which a conditional hook once stopped a tab loading entirely while the production build and every other gate passed. | pass |
| `blade-twist.mjs` | Ideal twist through the derived collective; the curve must pass through Beta34, which is the same quantity OpenVSP samples at 0.75 R. | pass |
| `control-authority.mjs` | Du et al. ACAI. Validated by reproducing the published hexacopter paradox: uncontrollable after one rotor failure AT FULL RANK. | pass |
| `hover-dynamics.mjs` | Hover damping and control power, with configuration rankings tested against a 50% perturbation of the assumed coefficients. | pass |
| `render-freeze.mjs` | Every 3D view is byte-compared with a committed reference, so a geometry change cannot pass unnoticed. | pass |
| `design-file.mjs` | A saved design reopens to the same result on every layout, compared by the golden master's own rule; an engine change is reported, platform noise is not. The per-design form of EASA CM-S-014's continuity-of-results check. | pass |
| `validation-domain.mjs` | The validation and verification domains the app placards against are regenerated from the harnesses and must match the committed file ([M&S 26]). | pass |
| `result-warnings.mjs` | Every result carries the [M&S 32] warnings a-h with their impact and an [M&S 33] uncertainty statement, in the app and in the report. | pass |
| `provenance-report.mjs` | Every output any layout emits is classified; unregistered, orphaned or duplicate registry keys fail. | pass |
| `api.mjs` | The Node API and the evtol-size command return the app's own results, with warnings, and every export is documented. | pass |
| `turboelectric.mjs` | The turboelectric powertrain against NASA's turboelectric lift+cruise (Silva et al. 2018 Table 3): fuel, fuel burn and turboshaft power within 15%, gross weight no worse than the battery sibling; mass closure with fuel on every layout. | pass |
| `cpacs-export.mjs` | Every layout's CPACS export validates against the CPACS 3.5.1 schema and its mass statement equals the engine's; the traceability CSV has one row per check. | pass |
| `release.mjs` | One version in package.json, a Keep a Changelog history, and a CITATION.cff that names the last release. | pass |
| `aircraft-classes.mjs` | The class registry is the one dispatch point, an unknown class is an error, and the eVTOL engine, defaults and golden snapshot are fenced off from class work. | pass |
| `trainer.mjs` | Piston trainer: GASP weights reproduce NASA Aviary's tests; Cessna 172S and two other trainers against published empty weights; a C172S sized from its own requirements. | pass |
| `transport.mjs` | Jet transport: the FLOPS weight port reproduces NASA's FLOPS output for a 737-800 model on all 35 weights; A320 and 737-800 against published data. | pass |
| `transport-mission.mjs` | Jet segment mission, engine-deck shape, engine location, tail volume and the jet atmosphere do what their sources say. | pass |
| `transport-aero.mjs` | The FLOPS drag build-up reproduces Aviary's aerodynamics tests and drag polars printed by FLOPS for three transports, by Aviary's own measure. | pass |
| `bizjet.mjs` | Business jet: the jet method with business-jet inputs; Citation Latitude, Citation Longitude and Pilatus PC-24 against published operating weights and ranges. | pass |
| `aircraft-engine.mjs` | The aircraft engine: one result for every fixed-wing type equal to the class's own numbers, and matching charts, payload-range, polars, trades, type comparison and reference aircraft consistent with the sizing. | pass |
| `turboprop.mjs` | Turboprop: Scholz & Nita's ATR 72 design point, Hamilton Standard propeller weights, and three regional turboprops against published empty weights. | pass |
| `paper-claims.mjs` | Every numeric claim in paper/ is re-derived from the harnesses. The paper argues that published figures drift from code; this is what stops its own doing so. | pass |
| `vtol-autopilot.mjs` | A hybrid VTOL exported as an ArduPilot QuadPlane and a PX4 VTOL, and the parameters its SIZE puts out of reach. This is driven from the aircraft engine rather than the drone engine for a reason the gate checks first: every VTOL parameter of consequence is an airspeed - the transition speed, the fixed-wing floor, the stall speed, the cruise trim - and the drone engine sizes multirotors from thrust-stand data with no wing, no stall and no cruise, so a wingless configuration is refused outright rather than exported with invented numbers. The headline finding is that the autopilots' VTOL parameters are scoped to small UAVs while this engine sizes aircraft: PX4 publishes VT_ARSP_TRANS, the airspeed at which it switches to fixed wing, with a range of 0 to 30 m/s, and every aircraft here stalls above that, so the parameter is refused with the number that did not fit rather than clamped - a clamped value would load cleanly and describe a different aircraft. ArduPilot's battery compensation is published 6 to 53 V against packs near 800 V and is refused the same way. ArduPilot's own guidance can also contradict itself at this size: AIRSPEED_MAX is documented as BOTH slightly less than level flight speed at THR_MAX AND at least 50 percent above AIRSPEED_MIN, which a design whose dive speed is under 1.8x its stall speed cannot satisfy, so the exporter emits the value the aircraft gives and names the gap in m/s and what the documentation says it costs. Transition DURATION is refused on both sides because PX4's VT_F_TRANS_DUR is the whole front transition while ArduPilot's Q_TRANSITION_MS is only the tail after minimum airspeed, and the back transition is refused because a deceleration in m/s^2 and a duration in seconds are different physical quantities. Configurations map by MECHANISM: lift+cruise is a Standard VTOL and a tiltrotor is a Tiltrotor, while the two hybrid layouts that tilt some rotors and stop the others have no generic PX4 airframe at all and are refused rather than approximated with a neighbour. | pass |
| `drone-frames.mjs` | Multirotor frame geometry generated from ArduPilot's own AP_MotorsMatrix.cpp: motor numbers are output channels and not the motor-test order, every motor states a rotation, CW and CCW counts balance, ordinary coaxial pairs counter-rotate and corotating frames genuinely corotate. | pass |
| `drone-components.mjs` | Every catalogue part traces to a datasheet URL, and no motor is modelled on a resistance whose winding convention the vendor never stated -- an ambiguity worth a factor of three in copper loss. How many motors qualify is reported as a finding about the industry, not asserted as a target. | pass |
| `drone-rotor.mjs` | Rotor thrust and power against 4,145 measured UIUC wind-tunnel rows by leave-one-out cross-validation, with the full per-propeller error distribution rather than a mean. Also that the module refuses to extrapolate beyond measured RPM, and that figure of merit is only judged against a literature bound inside the Reynolds range that bound was stated for. | pass |
| `drone-motor.mjs` | Electrical demand of a shaft operating point from published Kv, Kt, I0 and Rm with no fitted parameter, scored against 419 measured KDE rows. Scores only what the tables can contradict: eta_motor is NOT measured on any production thrust stand, so the motor/ESC split is the model's own output and quoting its mean would be the model describing itself. The falsifiable tests are that predicted motor power never exceeds the measured DC bus power, that rpm/Kv never exceeds the pack voltage, and that the residual charged to the ESC rises with duty as diode freewheeling requires. The model IS falsified on 4 of 419 rows, three of them one motor at high throttle; the gate pins that set and its margin rather than averaging it away. Also that 21 of 24 catalogue motors are refused outright because the vendor states no resistance convention or no no-load current. | pass |
| `drone-esc.mjs` | The ESC layer, which carries a MEASURED TABLE and not a model, and this gate re-derives both rejections from the data every run rather than trusting a comment. Dai's series-resistance ESC model (T-Mech 2019) requires one constant R_e; solved on every row it drifts 5.3x with duty, the same sign on all four motors independently. The diode-freewheeling two-term form fits a forward drop of 4.2, 3.2, -0.3 and -2.8 V across the four motors, half of them negative, so it is not reading diode physics either. The residual is not noise: the printing resolution is at most 6 percent of the loss. Also that the residual is named a JOINT residual because it contains ESC loss AND motor-model error inseparably, that its band is carried rather than a median alone (up to 22 points p10-p90), that a constant efficiency would be 17 percent wrong at low duty, and that 9 of 10 catalogue ESCs do not state their rectification mode so the table is flagged rather than silently applied. | pass |
| `drone-battery.mjs` | Pack energy, and the two ways published battery data misleads. Energy is capacity times the MEAN DISCHARGE voltage, but vendors sometimes print the CHARGED voltage in the same field: four of five DJI packs have Ah x V equal to their published Wh to the digit, while the TB60 is 14.4 percent out because its 52.8 V is 4.40 V per cell, which DJI's own Mavic 3 page separately names as a charging voltage limit. The published energy recovers 3.85 V per cell, the nominal every other pack uses. The module reads published Wh, derives one only when the voltage field is inside the nominal band, and refuses outright otherwise. The second gap is an omission: no manufacturer page in this survey states a discharge cut-off, so usable fraction is a REQUIRED argument with no default and the gate checks it still throws without one. Also that hover and cruise endurance are kept apart, and that the tempting claim - that basis explains the low power cluster - is refuted by the sample, since the cruise-basis Phantom 4 Pro V2 sits inside the hover cluster and the two low aircraft are simply the largest. | pass |
| `drone-sizing.mjs` | The closure that turns the measured blocks into an aircraft, by SELECTING real parts rather than correlating. It states its own limitation first and checks it: the loop is NOT validated against any published aircraft, because no aircraft exists whose components are all in the measured databases - NASA GAMMA publishes a measured inertia tensor and runs the modelled KDE4213-XF but turns an APC 15x5.5 that UIUC never tested, the Alta X publishes the best endurance sweep in the survey on 33 inch rotors against a measured span of 2.2 to 21.0 inches, and six of seven surveyed aircraft do not state their rotor count. What IS checked: the mass, thrust and energy identities close; every link refuses rather than extrapolating and names which link and why; payload, altitude and mission length move the answer in the directions physics fixes; and the computed specific power lands inside the 86.9 to 132.9 W/kg band seven real aircraft exhibit, which is a bracket and not a validation. Also that all five declared inputs throw when omitted, structure mass among them, because only one vehicle in the survey publishes an empty weight and it bundles motors, ESCs, propellers and avionics together. | pass |
| `drone-trade.mjs` | The trade study, built so that the Pareto front is a fact and the ranking is an opinion. The front is checked exhaustively against the dominance definition in BOTH directions - nothing on it is dominated, everything off it is dominated by something - and it is recomputed under wildly different weightings and required to come back identical, because a front that shifted with preference would not be a front. The ranking is required to carry its normalisation, its caveat, and a sensitivity analysis showing how far each weight can move before the winner changes; weighting mass against endurance must select different designs, or the sensitivity is not doing anything. Also that a degenerate objective contributes zero rather than dividing by a zero span, that every rejected candidate keeps its reason, and that COST is absent because the catalogue holds no prices. | pass |
| `drone-airframe.mjs` | Airframe geometry for the 3D view, where the load-bearing quantity is arm length. The tempting formula uses 2*pi/N for the angular spacing, which is correct only for an evenly spaced ring: 10 of 25 ArduPilot frames are not evenly spaced, and on those the even-ring formula returns a radius smaller than the discs need, so the view would draw overlapping propellers and call the number a clearance. The gate verifies no two discs overlap at the computed radius across every frame, that a 5 percent shorter arm DOES overlap so the bound is genuinely minimal, and that the declared tip gap is actually delivered. It also covers coaxial frames - every OCTAQUAD and DODECAHEXA stacks two motors per arm - which are positioned in z rather than spread around the ring, have disc area counted per ARM rather than per motor, and carry an explicit warning that their thrust is not supported by the measured data, since UIUC measured isolated rotors and the lower disc works in the upper wake. Finally that the view rotation preserves length, without which an orthographic view could not be measured off. | pass |
| `drone-dynamics.mjs` | A 6-DOF multirotor simulation, and the reason it does not replace the controllability test it appears to supersede. Equations of motion from Bauersfeld and Scaramuzza Eqs. 1-3, control allocation from the same Du et al. effectiveness matrix ACAI uses, and controller gains transcribed from a shipped ArduPilot frame parameter file. Inertia is DERIVED from the sized design and labelled so, because no commercial multirotor in the survey publishes a tensor; motor time constant and airframe drag coefficient are declared, the latter because the literature archive states in writing that no usable value exists. Since there is no measured trajectory to score against, the gate checks what must hold of any rigid body: free fall is exactly g, angular momentum is conserved to 1e-13 under zero torque, the quaternion stays normalised, RK4 converges at fourth order (measured ratio 16.1 against a predicted 16), and the intermediate-axis instability appears with the perturbation growing 625x about the middle axis and not at all about the other two, which is the sharpest available test that the omega-cross-J-omega coupling is right. Then the part that is evidence rather than arithmetic: with one rotor dead, a sweep of 400 moment directions through the allocator reproduces ACAI exactly - the quadrotor blocks all 400 directions, the octorotor blocks none, and the PNPNPN hexacopter blocks exactly half while ACAI returns exactly zero, sitting on the controllability boundary. That is why the hexacopter flies every simulated scenario while remaining uncontrollable: a simulation samples only the directions its scenario demands. | pass |
| `drone-risk.mjs` | The uncertainty statement, and the guard that keeps it from quietly growing. An exceedance curve looks like a confidence interval on the whole answer and a severity column looks like a scored assessment; neither is true here. The curve is order statistics of 3,621 leave-one-out predictions over the measured propeller database, so the gate requires it to be monotone, to start at essentially 100 percent and reach zero, to contain no distribution parameter anywhere, and to score only INTERPOLATED predictions - scoring the extrapolation the rotor module refuses to perform would flatter it. It covers the ROTOR layer only, and the register must lead with the fact that no whole-vehicle band exists because no aircraft has all its components in the measured databases. No entry may carry a likelihood, probability or score, since NASA publishes no five-by-five matrix and NASA/SP-20240014019 p. 74 states the qualitative form can no longer be considered valid; severity is three words used only for ordering. The register must also RESPOND to the design - a coaxial frame raises the coaxial finding and a planar one does not, a quadrotor raises the rotor-loss finding with its structural reason and an octorotor does not - and a voltage-field defect is graded by magnitude, since a charge limit in the nominal field is a different defect from a nominal printed coarser than its own energy figure implies. | pass |
| `drone-avionics.mjs` | ESC and radio-link selection, both on published data only. The radio is the sharper case: Friis is not in doubt but EIRP is, because a vendor publishes max TX power without saying whether it is CONDUCTED at the connector or RADIATED by the antenna, and the two differ by the antenna gain - 5 dB is a factor of 1.8 in range. ONE of fifteen surveyed radios states which it means, and says so by giving the conversion formula and quoting the FCC EIRP ceiling separately. So range is COMPUTED for that one and BRACKETED for the rest, and the gate checks the bracket width is exactly the antenna gain expressed as range. Four products whose figure coincides with a regulatory limit expressed in radiated power are recorded as HINTS and never promoted to statements. Free space is treated as a CEILING rather than a prediction: it cannot model ground reflection, Fresnel obstruction or fade margin, so the gate uses it to FALSIFY - every published range is checked against its own ceiling, since a claim above free space would be provably impossible, and none of the seven checkable claims is. Bands are kept as regulatory variants rather than averaged, after a dual-band product would otherwise have reported 1650 MHz, a frequency it never transmits on; sensitivity published per packet rate is kept as a set, since range and latency trade on the same hardware. On the ESC side, an unpublished rating is never treated as headroom - including a part whose model name contains 45A while its page says only 45A designed - and 6 of 8 ESCs quoting a burst current state no duration for it. | pass |
| `drone-autopilot.mjs` | What a sizing run may tell a flight controller, and what it must refuse to say. A parameter file is the only artefact this tool produces that an aircraft then flies on, so the gate is built around the refusals. The central one: this run computes a hover thrust fraction and ArduPilot has a parameter called MOT_THST_HOVER, but ArduPilot's own setup page says to set it to "0.25 or below the expected actual hover thrust percentage (lower is safe)" and let MOT_HOVER_LEARN find the real value, so the computed figure is emitted as a comment and never as that parameter. PX4's MPC_THR_HOVER is the SAME physical quantity with the OPPOSITE official advice - it seeds the hover-thrust estimator and the land detector - so it IS emitted, and the gate requires both directions of that asymmetry. A second refusal follows from it: thrust fraction is not control-signal fraction except when PX4's published model rel_thrust = factor * rel_signal^2 + (1 - factor) * rel_signal has factor 0, so THR_MDL_FAC is left at its default rather than translated from ArduPilot's MOT_THST_EXPO, an equivalence that exists only in ArduPilot source. Pack endpoints come from the selected cell's own datasheet rather than the 4.2/3.3 V LiPo rule, because the studio's default cell is Li-ion NMC whose published floor is 2.5 V; the gate also checks that the LiPo rule still reproduces ArduPilot's shipped Hexsoon-edu450.param exactly at 3S. The published propeller-size tables are interpolated between knots and CLAMPED outside them, never extended. Power-module calibration and rate-loop gains are refused as not being sizing outputs, and PX4 layouts with no generic airframe are refused rather than approximated with a neighbour. | pass |
| `drone-obstacles.mjs` | Things to fly into, and the exact limit of what a strike may claim. Contact is the one part of an impact this tool can state precisely, so it is stated precisely and nothing beyond it is offered. The envelope is the ROTOR DISC, spanM/2, not the hub: a multirotor strikes things with its propeller tips, and a centre-point test reports a clean pass for a flight that took the blades off -- the gate flies a track 200 mm outside a wall and requires the hub test to miss while the disc test strikes. Contact is found by a SIGNED DISTANCE and a bisection rather than a per-sample boolean, because the trace is sampled every 20 ms and at 10 m/s the aircraft moves 200 mm between samples, so a boolean test reports the strike up to a fifth of a metre late and can pass through a thin wall entirely; the gate requires the located contact to be finer than a twentieth of that sample travel, and it lands exact. Every distance checked is a length someone can measure off the scene: zero on a face, positive by the gap outside, negative by the depth inside, the true corner distance on a diagonal, and for a tree the minimum of trunk and canopy so the trunk governs below the crown. WHAT IS NOT MODELLED IS ASSERTED SO IT CANNOT QUIETLY APPEAR: a strike ENDS the flight, with no bounce, no tumble and no broken arm, because structureMassKg is a declared scalar carrying no material or geometry, nothing in the component survey publishes a propeller's impact strength, and no source here gives a restitution coefficient against concrete or foliage. Each contact carries that sentence with it, and the gate fails if any post-impact quantity is ever attached. This is the same rule simulate() already applies at the ground, where it breaks the integration on the zero crossing and reports crashed rather than modelling the landing. | pass |
| `drone-flight-energy.mjs` | The flight integrates STATE OF CHARGE and ends when the declared usable energy is gone, the way it already ends on ground contact -- so what limits a long flight is the pack, not a duration cap someone chose. The claim this gate defends is that no new physics was added to do it: the per-timestep chain is the one sizing.js walks for the hover point, and two exact identities pin it. Evaluated at sizing.hover.thrustPerRotorN it reproduces sizing.hover.busPowerW TO THE BIT, along with the same rpm, shaft power and per-rotor bus power, so a second power model cannot grow here unnoticed; and over a window where thrust is held steady the accumulated energy equals P*t to 1e-13, so the figure is an integral of that chain rather than a fresh estimate of endurance. Turning the energy model off leaves the trajectory byte-identical, which is what lets every other drone harness keep its meaning. What the gate deliberately does NOT assert is that a simulated hover empties the pack at enduranceMin(): it does not, because enduranceMin divides energy by a STEADY hover power while the simulation closes no position loop, so the aircraft drifts, leans, and spreads its per-rotor thrusts -- and power being convex in thrust, a spread costs more than a uniform thrust of the same mean. Measured on the reference hexacopter: steady at 451.6 W for the first 290 s, rising past 537 W, emptying at 29.0 min against the idealised 31.5. The gate pins that as a direction rather than a tuned number, requiring the drifted flight to cost MORE and never less. The one data gap is bounded rather than filled: a rotor below the propeller's measured thrust floor has no rpm the measured curve can name and rotor.js refuses to extrapolate, so -- shaft power being monotonic in thrust across the whole measured range -- such a sample contributes its floor value to an upper BOUND and nothing to the figure, leaving the true energy in a stated interval that the gate requires to stay under 1 % wide. With one rotor of a hexacopter dead that is 16.6 % of rotor samples and 0.53 % of the energy, because the allocator idles the rotor opposite the failure. A thrust above the measured ceiling cannot be bounded from inside the data and invalidates the figure instead of biasing it low. Nothing here invents a discharge curve, an internal resistance, a voltage sag, a Peukert exponent or a temperature derating -- battery.js states that no surveyed pack publishes any of them and that modelling them would mean inventing the curve -- so the state of charge is an energy fraction of the DECLARED usable energy at the pack's published nominal voltage, and it carries the same four assumptions enduranceMin() already carries wherever it is shown. There is no low-battery threshold, reserve or failsafe either: autopilot.js refuses PX4's SoC thresholds because guessing them would set a failsafe the user believes was computed, and the flight here ends at the usableFraction the user declared and at no other point. | pass |
| `drone-flight-worker.mjs` | The 6-DOF integration runs in a worker rather than in the Flight panel's render body, and this proves that moving it changed nothing: the run computed across the message boundary is compared to the run computed inline and must be identical BYTE FOR BYTE -- every sample, every per-rotor thrust, every reported flag -- on a scenario with a stepped altitude, a rate-approached altitude, a held tilt, an initial roll upset and a dead rotor, so the comparison runs through the allocator's degraded path and the contact logic rather than a hover where every sample is the same number. A tolerance would be the wrong instrument here: relocating a computation must not perturb it at all. The boundary itself is checked, because it is what makes the equivalence possible: a scenario is a TARGET FUNCTION and postMessage carries data, so the panel sends the arguments makeScenario takes and the worker rebuilds the scenario -- and the gate asserts that a built scenario genuinely CANNOT be structured-cloned, so that if it ever can the rebuild is removed deliberately instead of being carried forward unexamined. The worker must also survive a half-typed scenario, since one worker serves the panel's whole lifetime and an escaping throw would take every later flight with it: an over-cap scenario comes back as makeScenario's own message and the worker still answers afterwards. The duration cap was 120 s only because the integration blocked the browser -- measured at 2.4 ms per second of flight, 4.5 ms with a rotor dead -- and a full-length 250 s flight is required to cross the boundary whole, all 12,501 samples of it. Finally the cap is held to being what it is, a compute budget and not a physical limit: the integrator carries no state of charge, which is why a scenario outrunning the design's computed endurance is REPORTED by the panel rather than refused here. | pass |
| `drone-regulatory.mjs` | Mass thresholds carry the document and clause that set them, and the confusions found in the primary texts are refused: 25 kg is not 55 lb (52 g apart, both strict, so a 25.000 kg design fails both), 250 g is not 0.55 lb, and the US 0.55 lb rule gates REGISTRATION for RECREATIONAL flight only. Also that mass alone is not always the trigger, and that the tool's sizing envelope is a separate question from the law. | pass |

---

## 4. Validation — every published comparison

Each vehicle is sized from **its own published parameters**, then ten groups
of its published weight statement are scored. Nothing is tuned per vehicle.

**PASS: 39 published comparisons, mean 14.5%, worst -46.7%**

### NASA quadrotor, all-electric

`multicopter, 4 rotors, R=13.1 ft`

| group | published | this tool | error |
|---|---|---|---|
| MTOW | 2939.3 kg | 2931.9 kg | -0.3% ✓ |
| empty | 2390.4 kg | 2387.6 kg | -0.1% ✓ |
| pack | 925.3 kg | 924.0 kg | -0.1% ✓ |
| struct | 743.9 kg | 805.3 kg | +8.3% |
| rotor | 284.9 kg | 243.6 kg | -14.5% |
| motDrv | 285.8 kg | 291.1 kg | +1.9% ✓ |
| driveSys | 180.1 kg | 176.4 kg | -2.0% ✓ |
| systems | 243.1 kg | 239.9 kg | -1.3% ✓ |
| fltCtrl | 49.0 kg | 50.2 kg | +2.5% ✓ |
| energy | 369.4 kWh | 369.6 kWh | 0.0% ✓ |

### NASA side-by-side helicopter, all-electric

`sideBySide, 2 rotors, R=14.9 ft`

| group | published | this tool | error |
|---|---|---|---|
| MTOW | 2222.6 kg | 1967.5 kg | -11.5% |
| empty | 1673.8 kg | 1423.2 kg | -15.0% |
| pack | 585.1 kg | 505.3 kg | -13.6% |
| struct | 562.5 kg | 437.3 kg | -22.3% |
| rotor | 156.5 kg | 177.5 kg | +13.4% |
| motDrv | 181.4 kg | 175.6 kg | -3.2% ✓ |
| driveSys | 115.7 kg | 108.1 kg | -6.6% |
| systems | 230.0 kg | 221.0 kg | -3.9% ✓ |
| fltCtrl | 42.2 kg | 36.6 kg | -13.3% |
| energy | 235.0 kWh | 202.1 kWh | -14.0% |

### NASA lift+cruise, all-electric

`liftcruise, 8 rotors, R=5 ft`

| group | published | this tool | error |
|---|---|---|---|
| MTOW | 3724.0 kg | 2836.2 kg | -23.8% |
| empty | 3175.2 kg | 2291.8 kg | -27.8% |
| pack | 997.9 kg | 683.6 kg | -31.5% |
| struct | 1170.3 kg | 867.4 kg | -25.9% |
| rotor | 430.0 kg | 229.4 kg | -46.7% |
| motDrv | 449.1 kg | 365.4 kg | -18.6% |
| driveSys | 162.4 kg | 104.5 kg | -35.7% |
| systems | 244.9 kg | 238.1 kg | -2.8% ✓ |
| fltCtrl | 68.9 kg | 53.8 kg | -21.9% |
| energy | 400.0 kWh | 273.5 kWh | -31.6% |

**How to read a large error.** `struct` aggregates several groups, so a good
`struct` number can hide offsetting component errors — that is exactly what
happened before the rotor group was scored separately, where a −46.7% rotor
error was cancelling inside a −0.7% structures total. Component-level results
in `components.mjs` measure each model alone, with no sizing loop around it,
and are the right place to attribute a group error to a model.

### Commercial aircraft, brochure-grade

```
Scored metrics : 11
Mean abs error : 27.6%   (ewf-fraction model)
Mean abs error : 13.8%   (component buildup)
Worst          : MTOW -52.7%
```

The two mean errors are the same aircraft scored two ways — the fraction-based
empty-weight model and the component buildup — reported side by side so the
cost of the simpler method is visible rather than assumed.

---

## 5. Provenance of every output

Every value the engine emits carries a machine-readable status. CI fails if an
output is emitted without one.

| status | count | share |
|---|---|---|
| derived | 220 | 49% |
| sourced | 138 | 31% |
| unverified | 70 | 16% |
| validated | 16 | 4% |
| calibrated | 5 | 1% |
| assumed | 1 | 0% |

**`validated` means one thing only: the value has been numerically compared
to a published figure and the error is recorded.** 16 of 450 outputs
(4%) meet that bar:

`DL_lbft2`, `Etot`, `LDact`, `MTOW`, `PackkWh`, `Phov`, `Wbat`, `Wempty`, `bWing`, `dBA_100m`, `ewfImplied`, `fuelBurnKg`, `fuelMassKg`, `kNDARC`, `weightGroupsRaw`, `weightModel`

The remaining outputs are derived from validated quantities, sourced from
literature, calibrated, or assumed — the table above says which. A reader
should treat an output's status as the first thing to check before relying
on it, and the low validated share as the honest state of the art here
rather than an oversight: most conceptual-sizing outputs have no published
counterpart to compare against at all.

---

## 6. Uncertainty and sensitivity

Method: non-intrusive forward propagation by one-at-a-time perturbation of
every provenance-tagged input, re-running the full sizing loop each time, with
band widths taken from the provenance class rather than chosen per input. The
ranking of contributors is therefore sourced from the same registry CI
enforces, and an input cannot quietly acquire a narrow band.

This is the same family of method NASA applies to NDARC itself (Khurana,
Russell & Scott, *Uncertainty Quantification of a Rotorcraft Conceptual Sizing
Toolsuite*): forward propagation, Latin hypercube sampling, global sensitivity
attribution. That paper also reports a result worth repeating here — NDARC's
deterministic baseline did not coincide with the mean of its Monte Carlo
ensemble. **A single-point answer from this tool is exposed to the same effect,
so the band should be read alongside the point, not instead of it.**

**Stated limitation, per [M&S 33]:** the screen is one-at-a-time and is
therefore blind to interactions between inputs. Where inputs interact, the
true band is wider than the reported one. The Design Space layer samples
jointly and is the right tool for that question.

---

## 7. Credibility assessment (NASA-STD-7009B Appendix E)

Scored 0–4 on the standard's own scale, where **0 means "insufficient
evidence" and is a legitimate, reportable outcome.** The standard "levies no
requirements with respect to what levels to achieve … merely that the levels
be determined and reported" (§4.3.6).

**There is deliberately no overall score.** The standard states that the
factors are nearly orthogonal and that combining them "is not intended and
should be avoided in all labeling approaches". Any single credibility number
would violate the standard this report is written to.

### 7.1 Capability assessment (outcome of development)

| factor | level | justification |
|---|---|---|
| M&S Data Pedigree | **2** | Every one of the engine's outputs carries a machine-readable provenance tag with its citation, and CI fails if an output is emitted untagged, so traceability to formal documentation is enforced rather than asserted. Uncertainty in all tagged inputs is at least estimated, because the band width is derived from the tag class. Level 3 requires ALL data traced to a sufficiently representative referent; inputs tagged [LAY] are by definition assumptions with no referent, so 3 is unavailable while any remain. |
| M&S Verification | **2** | Documented practices are applied to all features and run in CI on every push: twenty-one harnesses run on every push, including an identity suite that checks relations the engine must satisfy by definition, a golden master over 277 cases spanning all six configurations, a scope check, tab-reachability and tab-visibility gates, geometry and export gates, per-model component tests, byte-compared 3D renders, EXECUTION of every exported model by OpenVSP, and seven physics harnesses each validated by reproducing a published result rather than by self-consistency. Level 3 requires rigorous end-to-end verification with ALL important errors satisfying requirements; the open defects listed in section 8 are not yet closed, so it is not claimed. |
| M&S Validation | **2** (capped by evidence) | Key outputs compare favorably with a sufficiently similar referent system: ten weight-statement groups across three NASA concept vehicles, plus brochure figures for commercial aircraft. LEVEL 2 IS THE HONEST MAXIMUM AVAILABLE TO THIS PROJECT AND NO CODE CHANGE CAN RAISE IT. Level 3 requires data from the Real World System -- a physical aircraft built, flown and weighed. NASA's concept-vehicle weight statements are NDARC output, i.e. another model's results, and manufacturer figures are brochure claims rather than certified weight statements. Until someone weighs a real eVTOL and publishes the statement, no referent exists that could support level 3. |
| M&S Development Technical Review | **0** | Insufficient evidence. There has been no peer review of any kind: not independent, not formal internal, not informal internal. Level 1 requires a favorable informal internal peer review, and a developer reviewing their own work is not a peer review under any reading of the standard. This is the lowest score in this assessment and it is accurate. |
| M&S Development Process/Product Management | **2** | Formal processes are applied: the source is under version control, every gate runs in CI on every push, changes carry their rationale in the commit message, and the research that justifies each method is written down before the method is built. Level 3 requires controlled processes with compliance measured, which would mean a defined and audited process baseline rather than a convention followed by one developer. |

### 7.2 Results assessment (outcome of use)

| factor | level | justification |
|---|---|---|
| M&S Use Assessment | **1** | The M&S type, application domain and purpose match the proposed use -- conceptual sizing of electric VTOL aircraft -- and the inclusions, exclusions and assumptions are documented and acceptable for it. Level 1 is where a model sits when it has no prior use history, which is the case: this tool has not previously been used for a design decision by anyone. |
| M&S Input Pedigree | **2** | Input data are formally traceable through the same provenance registry as the outputs, with estimated uncertainties. Level 3 requires all input data traced to a sufficient referent with acceptable accuracy, precision and uncertainty; the [LAY] inputs are not. |
| M&S Uncertainty Characterization | **2** | Sources of uncertainty are identified, expressed quantitatively, classified by provenance class, and propagated to an MTOW band with the dominant contributors ranked. Level 3 requires propagation of ALL known uncertainty; items tagged [GAP] are excluded from the propagation and reported separately, which is exactly the level-2 wording. |
| M&S Results Robustness | **3** | Sensitivities are known for many parameters including many of the key ones, by measurement: every sidebar input is perturbed and the full sizing loop re-run, and every provenance-tagged input is perturbed and ranked by its contribution to the band. Level 4 requires most parameters and most key sensitivities; the screen is one-at-a-time and therefore blind to interactions, which it states in its own output, so 4 is not claimed. |
| M&S Use/Analysis Technical Review | **0** | Insufficient evidence, for the same reason as the development review factor. No results produced by this tool have been reviewed by anyone other than its author. |
| M&S Use Process/Product Management | **2** | Formal processes are applied: results are reproducible from a stamped commit, the harnesses that produced them run in CI, and this report is generated from those runs rather than written by hand. |

### 7.3 The two zeros

Both technical-review factors are **0**. No part of this work — not the
methods, not the code, not the results — has been reviewed by anyone other
than its author. Under 7009B even level 1 requires a favorable *informal
internal* peer review, and self-review does not qualify.

This is reported first among the weaknesses because it is the one a reader
cannot verify for themselves from the repository, and because it is the
weakness that no further engineering can remove.

---

## 8. Caveats, limits and open defects

Required by [M&S 32]: explicit warnings for unachieved acceptance criteria,
violated assumptions, violated limits and outstanding defects. **A validation
report without this section is not compliant with the standard it cites.**

### 8.1 Metrics outside ±5% (generated from this run)

| vehicle | group | published | this tool | error |
|---|---|---|---|---|
| NASA lift+cruise, all-electric | rotor | 430.0 kg | 229.4 kg | **-46.7%** |
| NASA lift+cruise, all-electric | driveSys | 162.4 kg | 104.5 kg | **-35.7%** |
| NASA lift+cruise, all-electric | energy | 400.0 kWh | 273.5 kWh | **-31.6%** |
| NASA lift+cruise, all-electric | pack | 997.9 kg | 683.6 kg | **-31.5%** |
| NASA lift+cruise, all-electric | empty | 3175.2 kg | 2291.8 kg | **-27.8%** |
| NASA lift+cruise, all-electric | struct | 1170.3 kg | 867.4 kg | **-25.9%** |
| NASA lift+cruise, all-electric | MTOW | 3724.0 kg | 2836.2 kg | **-23.8%** |
| NASA side-by-side helicopter, all-electric | struct | 562.5 kg | 437.3 kg | **-22.3%** |
| NASA lift+cruise, all-electric | fltCtrl | 68.9 kg | 53.8 kg | **-21.9%** |
| NASA lift+cruise, all-electric | motDrv | 449.1 kg | 365.4 kg | **-18.6%** |
| NASA side-by-side helicopter, all-electric | empty | 1673.8 kg | 1423.2 kg | **-15.0%** |
| NASA quadrotor, all-electric | rotor | 284.9 kg | 243.6 kg | **-14.5%** |
| NASA side-by-side helicopter, all-electric | energy | 235.0 kWh | 202.1 kWh | **-14.0%** |
| NASA side-by-side helicopter, all-electric | pack | 585.1 kg | 505.3 kg | **-13.6%** |
| NASA side-by-side helicopter, all-electric | rotor | 156.5 kg | 177.5 kg | **+13.4%** |
| NASA side-by-side helicopter, all-electric | fltCtrl | 42.2 kg | 36.6 kg | **-13.3%** |
| NASA side-by-side helicopter, all-electric | MTOW | 2222.6 kg | 1967.5 kg | **-11.5%** |
| NASA quadrotor, all-electric | struct | 743.9 kg | 805.3 kg | **+8.3%** |
| NASA side-by-side helicopter, all-electric | driveSys | 115.7 kg | 108.1 kg | **-6.6%** |

### 8.2 Known limitations of the models

- **The weight models are empirical correlations fitted mostly to
  conventional rotorcraft, and eVTOLs are out of that population.** This is
  measured rather than asserted: `components.mjs` scores each model against
  its own fitting population and against eVTOLs separately, and the
  degradation is reported. Where a rotor group misses badly, that is the
  reason, and it is a property of the published method, not a coding error.
- **Mission convention moves the answer more than most modelling choices.**
  Published range and pack figures are quoted under conventions that are
  usually unstated. The harness brackets the convention rather than scoring
  one interpretation, and an aircraft whose brochure triple cannot close
  under ANY convention is reported as such instead of being fitted.
- **One-at-a-time uncertainty is blind to interactions** (section 6).
- **Geometry is conceptual.** The shapes are sized from the design
  variables and checked for overlap, connectivity and agreement with
  published NASA models. They are not structurally analysed, and the booms in
  particular are idealised as free cantilevers where a real airframe is a
  braced frame — an open question recorded in the research notes, not a
  settled model.
- **The aerodynamics are only partly computed.** A vortex-lattice polar is
  now solved on the exported model (`vspaero.mjs`), giving lift-curve slope,
  span efficiency and induced drag for the LIFTING SURFACES. It is inviscid:
  it does not give viscous drag, separation or stall, the fuselage is
  deliberately excluded and its drag stays with NDARC drag areas, and
  cruise L/D remains a design input constrained by class-level bounds rather
  than a computed result. The solver found a real defect on its first clean
  run — every exported wing had an aspect ratio 65% below the sized value —
  which is the argument for having it, and also a reminder that it is new.
- **Failure analyses are hover-linearised and steady.** Controllability
  (ACAI), drive-system redistribution and autorotation are all evaluated
  about a trimmed hover. None models the transient DURING the failure, and
  NASA measured 2.9-3.8x hover power demand in that transient against the
  steady share these compute. Steady capability is necessary, not sufficient.
- **Named gaps that are open by choice, not oversight.** NDARC's twin-rotor
  interference is computed but its WEIGHT consequence is not charged,
  because the only published drive weight contradicts it. The side-by-side
  carries no tail, because fitting one needs a boom the fuselage weight model
  would over-charge. Rotor spin order decides fault tolerance; the engine
  accepts one and can search for the best, but no control in the app sets
  it. Each is recorded where it bites, with its measurement.

### 8.3 What "±5%" means here

The ±5% figure used throughout is an **acceptance criterion applied to
comparisons against published data**, adopted as a standing project rule. It
is not a claim that any individual answer is accurate to 5%. The count of
metrics meeting it, and the errors of those that do not, are both reported
above; neither is summarised into a pass.

---

## 9. Risks of accepting these results

Required by [M&S 49].

1. **No independent review.** The dominant risk. Every method choice,
   every boundary between weight groups and every acceptance threshold was
   set by one person. The harnesses check internal consistency and agreement
   with published data; they cannot catch a mistake shared between the model
   and the person checking it.
2. **Validating against another model's output.** Agreement with the NASA
   concept vehicles shows this tool reproduces NDARC's answers. If NDARC is
   wrong for a configuration, this tool will be wrong the same way and the
   benchmark will report agreement.
3. **Out-of-population extrapolation.** A user can size a vehicle far from
   anything in the validation set. The tool reports when a model is
   extrapolating, but the error in that regime is unmeasured.
4. **Brochure referents may be inconsistent.** Manufacturer figures are not
   audited and may not describe one self-consistent aircraft; the harness
   tests this and reports when a published triple cannot close.

---

## Appendix A — verbatim harness output

Everything below is captured from the run that produced this document.

<details><summary><code>scope-check.mjs</code> — exit 0, 2517 ms</summary>

```
══════════════════════════════════════════════════════════════════════════
SCOPE CHECK — 229 file(s) parsed
══════════════════════════════════════════════════════════════════════════
PASS — every referenced identifier is imported, declared or a runtime global,
       and no component calls a hook below an early return.
```

</details>

<details><summary><code>tab-registry.mjs</code> — exit 0, 183 ms</summary>

```
TAB REGISTRY GATE
  PASS  no two tabs share a label   29 distinct labels, and no icon column to disagree with them
  PASS  every group's tooltip has the key it is actually bound to   5 groups, 5 keys
  PASS  one subject lives in one group   Certification+Reg Tracker in Compliance, Mission+Mission Builder in Design, Monte Carlo+Uncertainty in Trades
  PASS  every tab belongs to a group (is reachable)   29 tabs across 5 groups
  PASS  every tab has a render branch in App.jsx   no blank panels
  PASS  no group references a tab index that does not exist   all indices in range
  PASS  no tab appears in two groups
  PASS  no preventDefault inside a React passive-event prop (wheel / touch)   wheel and touch gestures that must not scroll the page are bound natively

TAB REGISTRY GATE PASSED
```

</details>

<details><summary><code>units.mjs</code> — exit 0, 172 ms</summary>

```
UNITS GATE
==============================================================================

-- each factor against the definition of the unit --
  PASS  kg -> lb is exact
          2.2046226218487757 against 2.2046226218487757 — the pound is DEFINED as 0.45359237 kg
  PASS  m -> ft is exact
          3.280839895013123 against 3.280839895013123 — the foot is DEFINED as 0.3048 m
  PASS  mm -> in is exact
          0.03937007874015748 against 0.03937007874015748 — the inch is DEFINED as 25.4 mm
  PASS  km -> nm is exact
          0.5399568034557235 against 0.5399568034557235 — the nautical mile is DEFINED as 1852 m
  PASS  m² -> ft² is exact
          10.763910416709722 against 10.763910416709722 — area follows the foot, squared
  PASS  m/s -> kt is exact
          1.9438444924406046 against 1.9438444924406046 — a knot is one nautical mile per hour
  PASS  1000.00 kg displays as 2204.62 lb
          2204.62 lb (exact 2204.62262)
  PASS  and a whole number stays whole rather than growing decimals
          2205 lb
  PASS  100.0 m displays as 328.1 ft
          328.1 ft

-- every pair round-trips, which a flipped reciprocal cannot --
  PASS  every counterpart is itself a unit in the table
          no dangling counterparts
  PASS  k(a->b) * k(b->a) = 1 for every true inverse pair
          a flipped reciprocal cannot survive this
  PASS  and every prefix pair differs from unity by an exact power of ten
          kN->lbf, kN·m->lbf·ft, MN·m->lbf·ft, W->hp
  PASS  every unit declares which system it belongs to
          all declared

-- both directions, because this interface already mixes them --
  PASS  an IMPERIAL source quantity converts when SI is asked for
          120.5 kt -> 62.0 m/s — the aircraft studio publishes speeds in knots
  PASS  and is left exactly alone when it is already in the asked-for system

-- what it does when it does not know --
  PASS  a non-numeric placeholder is never converted
          an em dash stays an em dash
  PASS  an UNKNOWN unit passes through with its label intact
          a value that fails to convert is a small annoyance; one converted with the wrong factor and labelled as correct is the thing to avoid
  PASS  a grouped number keeps its separator
          78,797 kg -> 173,718 lb
  PASS  and the original number of decimals is preserved
          3.00 m -> 9.84 ft

-- every unit the studios display is accounted for --
  PASS  all 36 literal unit strings are in the table or declared not-converted
          32 convertible, 27 deliberately not
  PASS  and every not-converted unit says WHY, so it reads as a decision
          not an omission nobody noticed
  PASS  no unit is both convertible and not-converted
          disjoint

-- no headline figure sits above a sub-line in the other system --
  PASS  every quantity in a Kpi sub-line converts with the toggle, or is exempt with a reason
          2 named exemptions — load factor in g, not grams — converting it to ounces would be nonsense; the English preposition in `the N in "stratum"`, not inches
  PASS  and the component they use converts through the same table as Kpi
          Q takes an already-formatted value and a named unit, so the author's decimals survive

UNITS GATE PASSED (24 checks)
```

</details>

<details><summary><code>identities.mjs</code> — exit 0, 3579 ms</summary>

```
════════════════════════════════════════════════════════════════════════════
IDENTITY & UNITS CHECK — 42 relations over 119 design points
════════════════════════════════════════════════════════════════════════════
 ok   direct drive charges no gearbox     63 pts
 ok   drive system = NDARC AFDD00         63 pts
 ok   gearbox + rotor shaft = drive system  63 pts
 ok   wing lift equation                  51 pts
 ok   cruise CL within ceiling            63 pts
 ok   span from aspect ratio              63 pts
 ok   root chord (trapezoid)              51 pts
 ok   tip chord = λ·Cr                    63 pts
 ok   mean aerodynamic chord              51 pts
 ok   wing loading                        51 pts
 ok   cruise Mach                         63 pts
 ok   wing Reynolds number                51 pts
 ok   induced drag coefficient            63 pts
 ok   total drag = CD0 + CDi              63 pts
 ok   L/D from coefficients               51 pts
 ok   disk loading (hover)                63 pts
 ok   reported download is the applied download  63 pts
 ok   disk loading (installed)            63 pts
 ok   momentum-theory hover power         63 pts
 ok   twin-rotor overlap factor           63 pts
 ok   rotor RPM from tip speed            63 pts
 ok   blade passage frequency             63 pts
 ok   motor shaft torque                  63 pts
 ok   stall speed                         63 pts
 ok   neutral point (with slope ratio + fuselage)  51 pts
 ok   tail/wing lift-slope ratio          63 pts
 ok   static margin definition            51 pts
 ok   wing AC from wing station           51 pts
 ok   auto-positioned wing hits target SM  63 pts
 ok   weight closure                      63 pts
 ok   takeoff energy                      63 pts
 ok   cruise energy                       63 pts
 ok   total mission energy                63 pts
 ok   pack energy from battery mass       63 pts
 ok   residual SoC equals the socMin floor when energy governs  63 pts
 ok   usable pack energy                  63 pts
 ok   hover T/W equals installed T/W      63 pts
 ok   OEI thrust available                63 pts
 ok   NDARC drag-area parameter k         63 pts
 ok   DL unit conversion (hover)          63 pts
 ok   DL unit conversion (installed)      63 pts
 ok   reported mass-balance gap is zero   63 pts
════════════════════════════════════════════════════════════════════════════
 ok   diverged: gap = unmet residual      56 pts   (designs that do not close, checked rather than skipped)
        worst 0.0600 kg of 0.06 kg allowed (100% of the rounding bound), on MTOW 3167 kg
════════════════════════════════════════════════════════════════════════════
PASS — all 43 relations hold to 0.2%.
```

</details>

<details><summary><code>golden-master.mjs</code> — exit 0, 4274 ms</summary>

```
════════════════════════════════════════════════════════════════════════
GOLDEN MASTER — 277 cases, 277 in snapshot
════════════════════════════════════════════════════════════════════════
PASS — no output moved by more than 1e-6 relative.
       every value bit-identical; full headroom to the threshold
```

</details>

<details><summary><code>components.mjs</code> — exit 0, 116 ms</summary>

```
==============================================================================
COMPONENT-LEVEL VALIDATION — each model alone, at NASA's published inputs
no sizing loop, no convergence, no feedback: a component cannot hide
behind another one here
==============================================================================

── ROTOR GROUP  (NASA Table 12 "Rotor group weight", 8 variants)
   nu (flap frequency) and blade count are NOT published per vehicle,
   so both are SWEPT and the range reported rather than chosen.

   model                        SMR-TS Quad-TS  Quad-E  SbS-TS   SbS-E   L+C-E  L+C-TE   TW-TE   MAE
   [CAL] 2.0 kg/m2 disk         +38.0% +436.2% +462.7% +189.6% +231.3% +117.2% +142.5% +375.6%  249.1%
   AFDD82 3 blades nu=1.03      +21.3%  -15.6%   -8.6%  +19.8%  +20.2%  -51.4%  -51.0%  -16.3%  25.5%
   AFDD82 3 blades nu=1.1       +46.8%   +1.7%  +10.6%  +44.3%  +45.4%  -42.1%  -41.5%   -0.3%  29.1%
   AFDD82 3 blades nu=1.25     +113.5%  +46.5%  +60.6% +107.8% +111.4%  -18.3%  -17.3%  +40.3%  64.4%
   AFDD00 3 blades nu=1.03      +14.8%  -25.8%  -14.5%   +4.0%  +13.4%  -68.4%  -65.5%  -40.2%  30.8%
   AFDD00 3 blades nu=1.1       +37.8%  -11.1%   +2.6%  +24.7%  +36.1%  -62.3%  -58.8%  -28.6%  32.7%
   AFDD00 3 blades nu=1.25      +96.8%  +26.4%  +46.3%  +77.4%  +94.2%  -46.7%  -41.6%   +0.8%  53.8%
   AFDD82 3 bl nu BY TYPE       +21.3%  -15.6%   -8.6%  +19.8%  +20.2%  -18.3%  -17.3%  -16.3%  17.2%
   AFDD00 3 bl nu BY TYPE       +14.8%  -25.8%  -14.5%   +4.0%  +13.4%  -46.7%  -41.6%  -40.2%  25.1%

   best over the swept grid: AFDD82, 2 blades, nu=1.03 -> MAE 24.7%
   (BOUND for a single UNIFORM nu. A best-fit uniform nu would be a fit;
    nu BY PUBLISHED ROTOR TYPE is not — NASA give 1.03 flapping /
    1.25 hingeless AND say which vehicle uses which.)

── SYSTEMS GROUP  (NASA Table 12 "Systems and equipment weight")
   boundaries: avionics + electrical + ECS + furnishings.
   EXCLUDES battery packaging (propulsion group) and flight controls (tested above).
   vehicle     published       ours   err(A)    err(B)
   A = systems EXCLUDES flight controls (CORRECT — B implies a negative electrical group)
   Quad-E          243.1      240.1    -1.2%    +18.9%
   SbS-E           230.0      226.1    -1.7%    +16.6%
   L+C-E           244.9      255.5    +4.3%    +32.5%

   THE FINDING SURVIVES THE SOURCE HUNT, but the suspect list is smaller.
   Avionics is CLEARED (FLOPS agrees within 4%). Furnishings now has a sourced
   seat term (NASA, 23 lb/seat). The residual sits in ELECTRICAL and
   ENVIRONMENTAL, modelled as flat fractions of MTOW (3.0% and 1.5%) for which
   no eVTOL-relevant published model was found — FLOPS' two electrical
   equations disagree by 3.5x on this class because both are fitted to
   conventional aircraft.
   The boundary ambiguity is real and is reported as a RANGE rather than
   resolved by choosing the flattering reading.

── DRIVE SYSTEM  (NASA Table 12 "Drive system weight")
   vehicle     published  AFDD00/train    error
   Quad-E        180.1 kg       176.7 kg    -1.9%
   SbS-E         115.7 kg       117.6 kg    +1.7%
   L+C-E         162.4 kg       130.5 kg   -19.6%

── MOTOR GROUP  (NASA Table 12 "Motor weight", 3 electric variants)
   at NASA's published power per motor and rotor speed; gear ratios are
   NASA's own, recovered by inverting their motor-group weights.

   vehicle   published    emraxTorque     nasaTorque  torqueDensity  specificPower
   Quad-E       106 kg    66kg -37.1%    90kg -14.9%    18kg -82.7%    100kg -5.2%
   SbS-E         66 kg    40kg -38.5%    58kg -11.7%    13kg -81.0%     64kg -2.9%
   L+C-E        287 kg   135kg -52.9%   184kg -35.9%    38kg -86.9%   166kg -42.1%

   emraxTorque      MAE 42.8%   <- DEFAULT
   nasaTorque       MAE 20.8%
   torqueDensity    MAE 83.5%
   specificPower    MAE 16.8%

   motor torque demanded at NASA's own design points:
     Quad-E 224 N·m · SbS-E 307 N·m · L+C-E 230 N·m
   (the EMRAX fit runs to 546 N·m; beyond it the model adds
    power at the family's specific power rather than extrapolating.)

── INSTALLED MOTOR MARGIN  (recovered from NASA's own DL, FM and DGW)
   vehicle   hover kW/rotor  NASA kW/motor  NASA factor    ours   over by
   Quad-E              87.9          125.3        1.425   1.482     1.04x
   SbS-E              147.8          159.6        1.080   1.482     1.37x
   L+C-E              113.8          103.7        0.911   1.482     1.63x
     Quad-E   rotor-borne, 4 INDEPENDENT rotors — must hover on N-1
     SbS-E    INTERCONNECTED — a motor failure costs no rotor
     L+C-E    WING-BORNE — the wing unloads the rotors; NASA keep baseline motors

   NASA's margin is CONFIGURATION-DEPENDENT (1.425 / 1.080 / 0.911) and this
   engine applies a uniform 1.482 — which is the motor+drive error, and it
   tracks: +8.7% / +35.2% / +33.3%. NASA say so themselves (corpus S3270):
   "This power factor is a FUNCTION OF THE AIRCRAFT CONFIGURATION".

   RESOLVED — AND IT IS NOT A MODEL ERROR. The quantity being compared is
   NASA's own HOVER LOAD FACTOR n_z, and Hartman, Altamirano & Suh (VFS 81st
   Forum, 2025) size this exact lift+cruise against it, sweeping n_z from
   1.00 g to 1.77 g. Their finding about the baseline is decisive:
     "the operating torque required to hover EXCEEDS the continuous operation
      rated torque ... this design would NOT BE ACCEPTABLE without
      modification"  — satisfied only "by the 1.35 g design variant", so
     "design variants below 1.35 g load factor could be eliminated".

   Table 12's weight statements are designs at about n_z = 1.00 — the point
   NASA's own flight-dynamics work REJECTS. This engine sizes at n_z = 1.30,
   just under their 1.35 floor, so the motor+drive gap measures a DESIGN
   POINT DIFFERENCE, not model error: n_z^1.5 gives 1.482x against 1.000x.
   Measured confirmation: moving the default to 1.35 makes the comparison
   WORSE (13 of 21 within +/-5% -> 8, motor+drive +33% -> +44%), which is the
   benchmark drifting further from a 1.00 g aircraft, not the model decaying.
   Separately, deriving n_z per configuration from N/(N-1) was refuted
   (1.54 / 1.00 / 1.22 against 1.425 / 1.080 / 0.911) — see note 20.

── NACELLE GROUP  (no published line in Table 12 — magnitude check only)
   built to test the claim that a missing nacelle group explained a
   ~290 kg lift+cruise structures gap:

   Quad-E     motors  106 kg over  4 -> nacelle   13.1 kg
   SbS-E      motors   66 kg over  2 -> nacelle    6.5 kg
   L+C-E      motors  287 kg over  8 -> nacelle   48.3 kg
   -> the group is tens of kg, not hundreds. The 290 kg inference was wrong.

==============================================================================
Component accuracy is NOT the same as loop accuracy. A component that
scores well here can still produce a bad aircraft if it is fed the wrong
inputs by the loop -- and a component that scores badly here is a defect
regardless of what the loop happens to converge to.
==============================================================================

── FLIGHT CONTROLS  (NASA Table 12 "Flight controls weight", 8 variants)
   vehicle   published  % of MTOW   FRAC 2.5%      err     AFDD82       err
   SMR-TS       40.4 kg      2.37%      42.6 kg    +5.5%     26.6 kg    -34.2%
   Quad-TS      41.3 kg      2.43%      42.4 kg    +2.7%    181.0 kg   +338.6%
   Quad-E       49.0 kg      1.67%      73.5 kg   +50.0%    225.5 kg   +360.4%
   SbS-TS       42.2 kg      2.68%      39.3 kg    -6.7%     67.2 kg    +59.4%
   SbS-E        42.2 kg      1.90%      55.6 kg   +31.7%     77.2 kg    +83.0%
   L+C-E        68.9 kg      1.85%      93.1 kg   +35.0%    647.7 kg   +839.5%
   L+C-TE       50.3 kg      1.36%      92.9 kg   +84.5%    647.1 kg  +1185.3%
   TW-TE       104.8 kg      3.42%      76.7 kg   -26.8%    599.3 kg   +472.0%

   [FRAC] 2.5% of MTOW   MAE 30.4%
   AFDD82 §29-8          MAE 421.5%

   THE FLAGGED "MISMATCH" RESOLVES THE OTHER WAY. AFDD's N_rotor^1.3855
   term describes mechanical control runs from a cockpit to every rotor;
   a distributed-electric aircraft with fly-by-wire has wires. Importing
   the equation would replace a fraction that is modestly high with a
   regression that is several times high. The [FRAC] model is KEPT.
   Published spread is 1.36%-3.42% of MTOW, and the top of it is the
   TILTWING — NDARC counts "conversion (rotor tilt) flight controls" as
   its own category, which is real configuration dependence.
```

</details>

<details><summary><code>database-report.mjs</code> — exit 0, 93 ms</summary>

```
======================================================================================
eVTOL AIRCRAFT DATABASE
======================================================================================

14 aircraft, 3 NASA concept vehicles (the only ones with a full published weight statement)

── BY LAYOUT ────────────────────────────────────────────────────────────────────────
   multicopter    2  EH216-S, VoloCity
                     Rotor-borne, no wing; all rotors fixed and lifting
   sideBySide     0  —
   liftcruise     5  VoloRegion, CityAirbus NextGen, Passenger Air Vehicle (PAV), Eve, ALIA-250
                     Separate lift rotors (stop in cruise) plus a distinct cruise propulsor
   tiltrotor      2  S-A2, Joby S4
                     All rotors tilt; fixed wing
   hybrid         3  VX4, Midnight, Generation 6
                     Partial tilt — some rotors tilt for cruise, the rest stop
   hybridPusher   0  —
   UNSUPPORTED    2  Lilium Jet, Journey
                     Layout outside the engine's six — recorded so the gap is visible

── DATA COVERAGE — how much of the field is actually published ───────────────────────
   MTOW_kg        ███████·············  36%  (5/14)
   payload_kg     ███████·············  36%  (5/14)
   empty_kg       ███·················  14%  (2/14)
   battery_kWh    ██████··············  29%  (4/14)
   span_m         ██████··············  29%  (4/14)
   length_m       █···················   7%  (1/14)
   rotorDiam_m    █···················   7%  (1/14)
   cruise_ms      ████████████████····  79%  (11/14)
   range_km       ███████████████████·  93%  (13/14)

   THIS IS THE HEADLINE FINDING, and it is why every accuracy claim in this
   project rests on NASA's concept vehicles rather than on flying hardware:
   MTOW is published for well under half the fleet, and EMPTY WEIGHT for
   almost none. No manufacturer publishes a weight statement. A sizing method
   cannot be validated against numbers that do not exist.

── PER-AIRCRAFT ─────────────────────────────────────────────────────────────────────
   aircraft               layout         rotors    MTOW    pay    kWh   span   range   cruise
   EH216-S                multicopter        16     620      —      —      —      30     36.1
   VoloCity               multicopter        18     900    200      —      —      35     30.6
   Lilium Jet             UNSUPPORTED    30/30t       —      —      —      —     175     68.9
   VoloRegion             liftcruise          6       —      —      —      —     100       50
   CityAirbus NextGen     liftcruise          8       —      —      —      —      80     33.3
   Passenger Air Vehicle  liftcruise          8       —      —      —      —      80        —
   S-A2                   tiltrotor        8/8t       —      —      —      —      64     53.6
   Joby S4                tiltrotor        6/6t    2404    453    165   11.8     161     89.4
   VX4                    hybrid           8/4t       —    450    160     15     161     66.9
   Midnight               hybrid          12/6t    3175    453    142   14.3     100     66.9
   Eve                    liftcruise          8       —      —      —      —     100        —
   Journey                UNSUPPORTED         1       —      —      —      —     155     77.8
   Generation 6           hybrid          12/6t       —      —      —      —     144     59.2
   ALIA-250               liftcruise          4    2835    635    325  15.24       —        —

── WHICH LAYOUTS THE INDUSTRY ACTUALLY BUILDS ────────────────────────────────────────
   liftcruise    ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇    5
   hybrid        ▇▇▇▇▇▇▇▇▇          3
   multicopter   ▇▇▇▇▇▇             2
   tiltrotor     ▇▇▇▇▇▇             2

   OUTSIDE THE ENGINE'S SIX (2): Lilium Jet, Journey
     Lilium Jet: Tilt-wing AND tilt-canard with 30 DUCTED electric fans. The engine has no ducted-fan or tandem-tilt-surface model, so sizing it would be a category error. Recorded to keep the gap visible.
     Journey: Slowed-rotor compound: ONE main rotor plus 4 propellers. The engine has no slowed-rotor compound model — a single large rotor unloaded in cruise is a different lift-sharing problem from anything in the six.

── DATABASE vs THE VALUES THE ENGINE USES ────────────────────────────────────────────
   multicopter   VoloCity                    agrees
   sideBySide    Side-by-side, all-electric  agrees  (concept — no aircraft of this layout has been built)
   liftcruise    ALIA-250                    agrees
   tiltrotor     Joby S4                     agrees
   hybrid        Midnight                    agrees
   hybridPusher  CONFIG_REFERENCE: none — [GAP] no published aircraft of this exact layout

   No drift: every CONFIG_REFERENCE value is backed by a database entry.

======================================================================================
PUBLISHED-DATA SELF-CONSISTENCY  (can the pack/range/payload triple close at all?)
======================================================================================
   airframe floor 1120 kg [SRC Joby, 11.8 m span, 5 seats] · usable 199 Wh/kg · L/D x eta 7.98
   Joby S4                pack  165 kWh ·  161 km · MTOW floor  2403 kg · cruise needs  132 kWh  -> consistent, 33 kWh left for hover/climb/reserve
   VX4                    pack  160 kWh ·  161 km · MTOW floor  2375 kg · cruise needs  131 kWh  -> consistent, 29 kWh left for hover/climb/reserve
   Midnight               pack  142 kWh ·  100 km · MTOW floor  2288 kg · cruise needs   78 kWh  -> consistent, 64 kWh left for hover/climb/reserve

   VX4 PASSES THIS TEST, so its +212% pack-energy error is OURS, not the
   brochure's. Diagnosed: the empty-weight FRACTION is right (46.8% against the
   47.0% its own numbers imply) and the whole gap is energy — this engine's
   L/D x eta is 7.98 where VX4's published pack/range pair implies 9.47, about
   19% better. Stopped-rotor drag is NOT the cause: hub + blade is 0.0070 of a
   0.0402 CD0, only 17%. The residual is the shared TECH_BASELINE efficiency
   set (eta_prop 0.80 x eta_powertrain 0.93) applied to an aircraft whose own
   published figures imply better technology.

======================================================================================
NASA CONCEPT VEHICLES — the only full weight statements in the field
======================================================================================
   vehicle                        layout         MTOW  empty   kWh          rotorType    nu
   Quadrotor, all-electric        multicopter    2939   2390   369           flapping  1.03
   Side-by-side, all-electric     sideBySide     2223   1674   235           flapping  1.03
   Lift+cruise, all-electric      liftcruise     3724   3175   400    hingeless/rigid  1.25
======================================================================================
```

</details>

<details><summary><code>analysis-layers.mjs</code> — exit 0, 14663 ms</summary>

```
ANALYSIS-LAYER GATE

  PASS  default profile reproduces the loop energy   Etot 151.68 vs profile 151.68 kWh (0.0013%)
  PASS  an over-long profile is reported infeasible and located   runs dry 42.3 min in
  PASS  a distance on a hover segment is rejected, not treated as zero
  PASS  the off-design polar reproduces Pcr at the design speed   214.9 vs 214.9 kW (-0.01%)
  PASS  the constraint diagram declares its wing limit to be a fit, not a derivation
  PASS  implied transition speed for the design wing loading is physically sane   W/S 1371 N/m2 -> 37.0-45.3 m/s (CLmax 1.8-1.2)
  PASS  implied transition speed falls with wing loading, as sqrt(W/S) must   1371 -> 37.0 m/s vs 800 -> 28.3 m/s
  PASS  hover is the binding constraint for a winged eVTOL   binding hover
  PASS  a rotor-borne layout gets the hover line alone, not a fabricated wing limit
  PASS  no perturbation leaves a bounded quantity outside its physical range   24 inputs perturbed
  PASS  user requirements are excluded from the error bar   excluded 7
  PASS  the band is asymmetric, as a clamped sizing loop must be   -217 / +357 kg
  PASS  all six configurations close on one mission   liftcruise 2759, hybrid 2554, hybridPusher 2681, tiltrotor 2948, multicopter 3061, sideBySide 1974
  PASS  an interconnected layout is not scored on Table 4's un-shafted columns   sideBySide kind=indeterminate
  PASS  mixed control reports as indeterminate, not as a shortfall   hybrid kind=indeterminate ok=true
  PASS  a pure rpm, independent-rotor layout still reports the real shortfall   liftcruise ok=false
  PASS  the multicopter still reports the real shortfall
  PASS  advisories and omissions are not counted as hard failures   4 of 6 layouts feasible
  PASS  battery efficiency is applied to vertical flight only, not the whole mission   etaBat 0.90 -> effective 0.9936 (vertical 8.8 of 151.7 kWh)
  PASS  the superseded whole-mission form is still selectable and still heavier   mission-scope MTOW 2813 vs vertical-scope 2556 kg
  PASS  sedBasis packUsable suppresses the battery efficiency term   effective 1
  PASS  hover is the high-discharge-rate state that justifies the scoping   hover 3.48C vs cruise 1.42C

  NOTE - items reported across most layouts (a mission or model
  property, not a per-layout one):
    [advisory] Controllable after a single rotor failure  4/6
    [advisory] Hover load factor n_z >= 1.35 (continuous motor torque)  4/6

ANALYSIS-LAYER GATE PASSED
```

</details>

<details><summary><code>vsp-models.mjs</code> — exit 0, 2242 ms</summary>

```
NASA OpenVSP MODEL REPLICATION GATE
  PASS  the BD-6 donor airframe is refused as an eVTOL configuration
  PASS  raven: 6 rotors read as 4 tilt + 2 lift-only from the hinge set   4T + 2L
  PASS  raven: rotors sit outboard of the wingtip, as modelled   rotor half-span 3.1638 m vs wing half-span 3.045 m
  PASS  swft: 6 rotors read as 4 tilt + 2 lift-only from the hinge set   4T + 2L
  PASS  swft: rotors sit outboard of the wingtip, as modelled   rotor half-span 10.889 m vs wing half-span 10.449 m

── NASA RAVEN v01_003
   gross weight 984 kg and cruise 64.0 m/s are RESULTS — the .vsp3 publishes no mass, power or mission
     Rotor diameter        1.8898      1.890       0%
     Rotor count                6      6.000       0%
     Disk area            16.8296     16.833       0%
     Wing span              6.089      6.090       0%
     Wing area              4.895      4.900     0.1%
     Wing aspect ratio     7.5742      7.569    -0.1%
     Fuselage length       4.5029      4.503       0%
     Blade chord           0.1306      0.131       0%
  PASS  raven: every published geometry reproduced within 1%   worst 0.1% on Wing area
── NASA RAVEN SWFT
   gross weight 7001 kg and cruise 60.0 m/s are RESULTS — the .vsp3 publishes no mass, power or mission
     Rotor diameter        5.9436      5.944       0%
     Rotor count                6      6.000       0%
     Disk area           166.4716    166.494       0%
     Wing span            20.8971     20.900       0%
     Wing area            58.1211     58.140       0%
     Wing aspect ratio     7.5134      7.513       0%
     Fuselage length      15.6566     15.657       0%
     Blade chord           0.5278      0.528       0%
  PASS  swft: every published geometry reproduced within 1%   worst 0.0% on 

VSP GATE PASSED
```

</details>

<details><summary><code>geometry-export.mjs</code> — exit 0, 70909 ms</summary>

```
GEOMETRY & EXPORT GATE
  PASS  no rotor overlaps another, across every layout and rotor count   tightest 1.050 x (disc sum) on multicopter n=6
  PASS  every body is structurally connected back to the fuselage   no floating parts in any layout, in HELICOPTER mode and in AIRPLANE mode — the installation stays attached through the conversion, not just as authored
  PASS  no part passes through another, in any layout   clean across every configuration
  PASS  the drawn boom count matches the one the boom mass was sized on   agreed on every layout
  PASS  every exported rotor sits where the 3D view puts it   worst deviation 0.0e+0 m
  PASS  geom names use <Name>, which is what OpenVSP reads   550 named, 0 legacy
  PASS  the exported XML is balanced   130 geoms
  PASS  no interference in any configuration as the app builds it   all six clean at their own design points
  PASS  every configuration is left/right symmetric   all six mirrored
  PASS  the V-tail root sits on the upper body, never under it   above the centreline in every layout
  PASS  every configuration draws exactly the rotors it was sized with   counts match in all six
  PASS  nothing floats at the app's own design points   all six fully connected
  PASS  every wing-mounted strut foot lies between the LOCAL leading and trailing edges   sweep and taper respected on every layout
  PASS  every pivot and nacelle is measured at its OWN span station, on every surface   wing, stabilator and V-tail all held to their local leading edge and local chord — the check above did this for the wing alone, and the V-tail defect walked through the gap
  PASS  the inboard/outboard flap gap is centred on the boom station   gap 0.386..0.473 centre 0.4295 vs boom 0.431 (difference 0.0015 of half span)
  PASS  wing control surfaces are ordered and do not overlap   0.1058-0.386, 0.473-0.6963, 0.7003-1
  PASS  the aileron runs out to the wing tip   ends at eta 1
  PASS  every control surface chord is a sane fraction of the local chord   Flap inboard 24.0%, Flap outboard 24.0%, Aileron 45.0%
  PASS  every winged layout carries flaps and an aileron on each side, symmetrically   each kind present both sides on every winged layout; counts differ by layout because surfaces are cut around every boom, as RAVEN cuts its flap
  PASS  the exported .vsp3 carries every control surface as an SS_Control   6 against RAVEN's 4 (flaps + aileron + rudder); more when a layout's booms cut a surface into segments
  PASS  every control surface lies inside RAVEN's measured span envelope   6 surfaces, all within eta 0.0343..1 — cut around this layout's booms, never reaching past the span RAVEN gave them
  PASS  controls are exported once and mirrored, never duplicated per side   no left-hand duplicates in the file
  PASS  no rotor disc passes through the surface carrying it   every hub stands off its structure by the part stack
  PASS  coaxial layouts: N rotors on N/2 arms, pairs stacked, stations clear   pairs stacked and separated, stations clear, booms halved, interference charged
  PASS  every layout converges to the disk loading its configuration specifies   rotor diameter is SOLVED with MTOW, not evaluated at a placeholder mass
  PASS  every configuration carries the landing gear it was charged for   gear drawn on all six, at the tyre size and stroke the CS-27 drop test selected
  PASS  the main gear lies aft of the CG on every layout   from the moment balance, not a chosen station — an aircraft with its mains forward of the CG sits on its tail
  PASS  every wheel stands on one ground plane   all wheel bottoms coplanar in all six
  PASS  nothing but the wheels reaches the ground plane   no fin, boom or body below the wheels on any layout — the aircraft stands on its undercarriage
  PASS  every pylon starts exactly at the rotor it carries   endpoints checked, not bounding boxes — a cross-wired member has the same box as a correct one and passes every extent test
  PASS  every tilting part lies on its hinge axis — no member spans a gap the reference does not have   nacelle, hub, spacer, motor and disc all share the pivot's span station, as RAVEN's Tip Nacelle does at Y_Rel_Location 0.0000
  PASS  the drawn rotor arm is the arm the mass model charged for   every rotor-borne layout draws the support arm it was weighed with, within the 5% clearance margin the drawing adds so discs do not graze

  MEASURED, NOT ASSERTED — gear mass centroid vs the 0.52 fL cg.js assumes [LAY]:
    liftcruise     0.408 fL   -11.2 points of fL from the assumption
    hybrid         0.384 fL   -13.6 points of fL from the assumption
    hybridPusher   0.393 fL   -12.7 points of fL from the assumption
    tiltrotor      0.383 fL   -13.7 points of fL from the assumption
    multicopter    0.385 fL   -13.5 points of fL from the assumption
    sideBySide     0.374 fL   -14.6 points of fL from the assumption
  The placement that satisfies the moment balance puts the gear FORWARD of where
  the CG model carries it, by 0.146 fL at worst (sideBySide). One of the two is wrong.
  PASS  every tilting rotor carries a pivot, not just an angle   each one knows the hinge it converts about
  PASS  every tilt pivot lies on the structure carrying its rotor   wing rotors pivot on the wing plane, boom and tail rotors on theirs — RAVEN's own hinges sit -0.015 D and +0.001 D off the wing, on the sponson
  PASS  the hub SWINGS between helicopter and airplane mode   the hub stands off the pivot and travels an arc, rather than the disc spinning in place
  PASS  the sized V-tail area lands near the one equivalent to RAVEN SWFT's tail   worst liftcruise at 0.83x of RAVEN's 0.3636 Sw — sized from static margin and yaw authority, which never see RAVEN
  PASS  and the solved dihedral lands near RAVEN's equivalent 41.9 deg   solver picks 38 deg against 41.9 — two routes to the same tail

GEOMETRY & EXPORT GATE PASSED
```

</details>

<details><summary><code>fuselage-outline.mjs</code> — exit 0, 178 ms</summary>

```
FUSELAGE OUTLINE GATE
==============================================================================

-- the nose is symmetric about the centreline --
  PASS  the nose tip sits exactly on the centreline
          z = 0 m
  PASS  the nose control points mirror in z at the same station
          upper (1.578, 2.005) against lower (1.578, -2.005)
  PASS  the nose meets the barrel at equal and opposite z
          +2.005 against -2.005 m

-- the tail cone is upswept, and upswept the right way --
  PASS  the keel rises further than the crown falls -- this IS the upsweep
          keel +2.205 m against crown -1.123 m (1.96x)
  PASS  the whole tip face sits above the centreline
          crown +0.882 m, keel +0.201 m
  PASS  the tip face is not inverted -- the crown stays above the keel
          0.882 m over 0.201 m
  PASS  the crown descends over the tail cone rather than staying level
          1.123 m, 28% of H -- an earlier comment claimed it stayed level while the code dropped it 36% of H
  PASS  the tip face comes from the declared convention, not a literal
          0.22 / 0.05 of H

-- the plan view is symmetric about the centreline --
  PASS  every port ordinate is the exact negative of its starboard twin
          8 points a side
  PASS  and sits at the same station as its twin
          port and starboard share every x

-- nose and tail-cone fineness are Torenbeek's --
  PASS  nose fineness sits inside the published range
          1.8 in 1.5-2 -- "a frequently used value for the length/diameter ratio is 1.5 to 2.0"
  PASS  tail-cone fineness sits inside the published range
          3 in 2.5-3 -- the tail "is usually 2.5 to 3 times the diameter of the cylindrical section"
  PASS  the citation names the author and the section, not just a number
          Torenbeek 1982, §3.5.1, pp. 93-94

-- the upsweep is still carried as an unsourced convention --
  PASS  the closure convention carries NO citation, because none exists
          CABIN-LAYOUT.md section 5: "Tail-cone upsweep angle. Not sourced anywhere. ... Do not invent one."
  PASS  geometry.js records the ruling and names the item that would replace it
          ESDU 80006, "Drag increment due to rear fuselage upsweep" -- paywalled

-- every view that draws the body calls the shared outline --
  PASS  GeneralArrangement.jsx builds its side view from the shared outline
  PASS  GeneralArrangement.jsx builds its plan view from the shared outline
  PASS  GeneralArrangement.jsx carries no hand-written fuselage path literal
  PASS  FuselageViews.jsx builds its side view from the shared outline
  PASS  FuselageViews.jsx carries no hand-written fuselage path literal
  PASS  BalanceViews.jsx builds its side view from the shared outline
  PASS  BalanceViews.jsx carries no hand-written fuselage path literal

-- provenance follows the fineness the drawing ends up with --
  PASS  transport: the nose is marked sourced exactly when its fineness is inside the range
          fineness 1.34 against published 1.5-2 -- outside, marked convention
  PASS  transport: the nose is never marked sized -- no loop produces it
  PASS  transport: the nose names Torenbeek either way, as the range it met or missed
  PASS  transport: the tail cone is marked sourced exactly when its fineness is inside the range
          fineness 2.49 against published 2.5-3 -- outside, marked convention
  PASS  transport: the tail cone is never marked sized -- no loop produces it
  PASS  transport: the tail cone names Torenbeek either way, as the range it met or missed
  PASS  bizjet: the nose is marked sourced exactly when its fineness is inside the range
          fineness 1.07 against published 1.5-2 -- outside, marked convention
  PASS  bizjet: the nose is never marked sized -- no loop produces it
  PASS  bizjet: the nose names Torenbeek either way, as the range it met or missed
  PASS  bizjet: the tail cone is marked sourced exactly when its fineness is inside the range
          fineness 1.99 against published 2.5-3 -- outside, marked convention
  PASS  bizjet: the tail cone is never marked sized -- no loop produces it
  PASS  bizjet: the tail cone names Torenbeek either way, as the range it met or missed
  PASS  turboprop: the nose is marked sourced exactly when its fineness is inside the range
          fineness 1.27 against published 1.5-2 -- outside, marked convention
  PASS  turboprop: the nose is never marked sized -- no loop produces it
  PASS  turboprop: the nose names Torenbeek either way, as the range it met or missed
  PASS  turboprop: the tail cone is marked sourced exactly when its fineness is inside the range
          fineness 2.36 against published 2.5-3 -- outside, marked convention
  PASS  turboprop: the tail cone is never marked sized -- no loop produces it
  PASS  turboprop: the tail cone names Torenbeek either way, as the range it met or missed
  PASS  trainer: the nose is marked sourced exactly when its fineness is inside the range
          fineness 0.85 against published 1.5-2 -- outside, marked convention
  PASS  trainer: the nose is never marked sized -- no loop produces it
  PASS  trainer: the nose names Torenbeek either way, as the range it met or missed
  PASS  trainer: the tail cone is marked sourced exactly when its fineness is inside the range
          fineness 1.57 against published 2.5-3 -- outside, marked convention
  PASS  trainer: the tail cone is never marked sized -- no loop produces it
  PASS  trainer: the tail cone names Torenbeek either way, as the range it met or missed
  PASS  no class currently draws a cone inside Torenbeek's ranges -- the caps are inert
          transport nose 1.34, transport tail cone 2.49, bizjet nose 1.07, bizjet tail cone 1.99, turboprop nose 1.27, turboprop tail cone 2.36, trainer nose 0.85, trainer tail cone 1.57

-- body coordinates reach the sheet unchanged --
  PASS  the path opens on a move and closes on Z
          M 0 0 Q 1.5779999999999998 2.005 5.26 2.005  ...  Z
  PASS  every segment of the side outline survives formatting
          4 quadratics, 3 lines, 1 move, 1 close
  PASS  the caller's own mappers are the only thing applied
          x doubled reaches 75.14

FUSELAGE OUTLINE GATE PASSED (50 checks)
```

</details>

<details><summary><code>nasa-configs.mjs</code> — exit 0, 235 ms</summary>

```
======================================================================================
PER-CONFIGURATION BENCHMARK — NASA reference vehicles, own parameters plugged in
source: NASA/TM-20210017971 Table 12 · mission 75 nm, 1200 lb payload, 400 Wh/kg pack
======================================================================================

── NASA quadrotor, all-electric   [multicopter, 4 rotors, R=13.1 ft]
   converged: yes
   drive: AFDD00 per drive train x4, 401 rotor rpm -> 5332 motor rpm
   quantity        published      engine        error
   MTOW             2939.3 kg    2931.9 kg     -0.3%   vs AFDD 5.3%  WITHIN
   empty            2390.4 kg    2387.6 kg     -0.1%   vs AFDD 5.3%  WITHIN
   pack              925.3 kg     924.0 kg     -0.1%    (no AFDD reference)
   struct            743.9 kg     805.3 kg     +8.3%   vs AFDD 6.1%  x1.4
   rotor             284.9 kg     243.6 kg    -14.5%   vs AFDD 8.6%  x1.7
   motDrv            285.8 kg     291.1 kg     +1.9%   vs AFDD 10.9%  WITHIN
   driveSys          180.1 kg     176.4 kg     -2.0%   vs AFDD 8.6%  WITHIN
   systems           243.1 kg     239.9 kg     -1.3%    (no AFDD reference)
   fltCtrl            49.0 kg      50.2 kg     +2.5%   vs AFDD 8.7%  WITHIN
   energy            369.4 kWh     369.6 kWh     +0.0%    (no AFDD reference)
   liftPower         125.3 kW      125.0 kW      -0.3%    (no AFDD reference)
   fusDq               1.4 ft2       1.3 ft2     -8.2%    (no AFDD reference)
   totalDq            12.9 ft2       9.9 ft2    -23.2%    (no AFDD reference)

── NASA side-by-side helicopter, all-electric   [sideBySide, 2 rotors, R=14.9 ft]
   converged: yes
   drive: AFDD00 per drive train x2, 352 rotor rpm -> 4970 motor rpm
   quantity        published      engine        error
   MTOW             2222.6 kg    1967.5 kg    -11.5%   vs AFDD 5.3%  x2.2
   empty            1673.8 kg    1423.2 kg    -15.0%   vs AFDD 5.3%  x2.8
   pack              585.1 kg     505.3 kg    -13.6%    (no AFDD reference)
   struct            562.5 kg     437.3 kg    -22.3%   vs AFDD 6.1%  x3.6
   rotor             156.5 kg     177.5 kg    +13.4%   vs AFDD 8.6%  x1.6
   motDrv            181.4 kg     175.6 kg     -3.2%   vs AFDD 10.9%  WITHIN
   driveSys          115.7 kg     108.1 kg     -6.6%   vs AFDD 8.6%  WITHIN
   systems           230.0 kg     221.0 kg     -3.9%    (no AFDD reference)
   fltCtrl            42.2 kg      36.6 kg    -13.3%   vs AFDD 8.7%  x1.5
   energy            235.0 kWh     202.1 kWh    -14.0%    (no AFDD reference)
   liftPower         159.6 kW      143.2 kW     -10.3%    (no AFDD reference)
   fusDq               1.6 ft2       1.3 ft2    -19.7%    (no AFDD reference)
   totalDq             7.5 ft2       6.9 ft2     -8.4%    (no AFDD reference)

── NASA lift+cruise, all-electric   [liftcruise, 8 rotors, R=5 ft]
   converged: yes
   drive: AFDD00 per drive train x8, 1117 rotor rpm -> 4301 motor rpm
   quantity        published      engine        error
   MTOW             3724.0 kg    2836.2 kg    -23.8%   vs AFDD 5.3%  x4.5
   empty            3175.2 kg    2291.8 kg    -27.8%   vs AFDD 5.3%  x5.2
   pack              997.9 kg     683.6 kg    -31.5%    (no AFDD reference)
   struct           1170.3 kg     867.4 kg    -25.9%   vs AFDD 6.1%  x4.2
   rotor             430.0 kg     229.4 kg    -46.7%   vs AFDD 8.6%  x5.4
   motDrv            449.1 kg     365.4 kg    -18.6%   vs AFDD 10.9%  x1.7
   driveSys          162.4 kg     104.5 kg    -35.7%   vs AFDD 8.6%  x4.1
   systems           244.9 kg     238.1 kg     -2.8%    (no AFDD reference)
   fltCtrl            68.9 kg      53.8 kg    -21.9%   vs AFDD 8.7%  x2.5
   energy            400.0 kWh     273.5 kWh    -31.6%    (no AFDD reference)
   liftPower         103.7 kW       78.0 kW     -24.8%    (no AFDD reference)
   fusDq               1.7 ft2       1.3 ft2    -25.9%    (no AFDD reference)
   totalDq            16.9 ft2      11.9 ft2    -29.5%    (no AFDD reference)

======================================================================================
ROTOR GROUP - equation error vs sizing divergence
======================================================================================
   Quad-E   equation at PUBLISHED rotor -14.5%   loop -14.5%   sizing divergence 0.0 pts
            engine rotorGroupDetail: {"mass":243.62608687735533,"bladeKg":153.26215464628038,"hubKg":90.36393223107494,"model":"afdd00","chord_m":0.22997337134305504,"nBlades":3,"flapFreq":1.03,"fTilt":1,"note":"AFDD00 blades+hub, 3 blades, chord 0.230 m, nu=1.03 per rev"}
            blade chord: published 0.230 m vs loop 0.230 m  (-0%)   nu 1.03  blades 3
   SbS-E    equation at PUBLISHED rotor +13.4%   loop +13.4%   sizing divergence 0.0 pts
            engine rotorGroupDetail: {"mass":177.4881775318167,"bladeKg":110.37501944648983,"hubKg":67.11315808532686,"model":"afdd00","chord_m":0.27584037129030975,"nBlades":3,"flapFreq":1.03,"fTilt":1,"note":"AFDD00 blades+hub, 3 blades, chord 0.276 m, nu=1.03 per rev"}
            blade chord: published 0.276 m vs loop 0.276 m  (-0%)   nu 1.03  blades 3
   L+C-E    equation at PUBLISHED rotor -46.7%   loop -46.7%   sizing divergence 0.0 pts
            engine rotorGroupDetail: {"mass":229.39505065183377,"bladeKg":158.19761657612668,"hubKg":71.19743407570711,"model":"afdd00","chord_m":0.42611304752668766,"nBlades":3,"flapFreq":1.25,"fTilt":1,"note":"AFDD00 blades+hub, 3 blades, chord 0.426 m, nu=1.25 per rev"}
            blade chord: published 0.426 m vs loop 0.426 m  (-0%)   nu 1.25  blades 3

   Equation error is the published method out of population and is the
   paper's subject. Sizing divergence is this tool choosing a different
   rotor from the published one, which is what a SIZING tool does.
   Neither is gated: both are reported, which is the point.
Metrics scored: 39   mean |error|: 14.5%
Against AFDD's own in-population error: 7 of 21 groups are AT OR BETTER than the method achieves on the rotorcraft it was fitted to
Mean out-of-population degradation: x2.1  (how much worse these equations are on an eVTOL than on a helicopter)
  within AFDD: Quad-E/MTOW, Quad-E/empty, Quad-E/motDrv, Quad-E/driveSys, Quad-E/fltCtrl, SbS-E/motDrv, SbS-E/driveSys
Worst: L+C-E/rotor at -46.7% (AFDD in-population 8.6%, x5.4)
  [for comparison, under the retired flat rule: 12 of 39 within +/-5%]
======================================================================================

PASS: 39 published comparisons, mean 14.5%, worst -46.7%
      7 of 21 referenced groups at or better than AFDD's own in-population error
      12 of 39 within a flat +/-5% (retired criterion, kept for continuity)
```

</details>

<details><summary><code>validate.mjs</code> — exit 0, 979 ms</summary>

```
══════════════════════════════════════════════════════════════════════════════
eVTOL SIZER — VALIDATION AGAINST PUBLISHED AIRCRAFT DATA
══════════════════════════════════════════════════════════════════════════════
One shared technology baseline is applied to every aircraft.
Only high/medium-confidence published figures are scored.

── NASA UAM Lift+Cruise (electric)   [Lift + cruise, 8 lift rotors + pusher]
   using the source's own stated technology assumptions
   metric        published  |  ewf-fraction        err  |   buildup        err
   MTOW             4301 kg |   2032.34 kg    -52.7%  |  3160.33 kg    -26.5%
   Pack energy       373 kWh|    188.87 kWh   -49.4%  |   281.73 kWh   -24.5%
   EWF            0.6556    |       0.5       -23.7%  |    0.605        -7.7%
   mission bracket: 196-282 kWh (no reserve, favourable day -> full 20-min reserve, sizing day) vs published 373 kWh  OUTSIDE - not reconcilable with any reserve convention
   buildup predicts EWF = 0.605   (published MTOW needs 0.6544)
   implied EWF to hit published MTOW: 0.6544   [baseline assumes 0.5]
   L/D input 10.62 vs engine-computed 8.4   ·  Etot 188.867 kWh  ·  Phov 357.87 kW
   feasibility FAILS: Cruise duty < 80% of continuous rating | Climb gradient >= 2.5% (MOC VTOL.2120, Category enhanced) | Controllable after a single rotor failure | Hover load factor n_z >= 1.35 (continuous motor torque) | Cruise L/D >= 9.5 (NASA lift+cruise class) | Hover download

── Joby S4   [Tiltrotor, 6 rotors, V-tail]
   using the source's own stated technology assumptions
   metric        published  |  ewf-fraction        err  |   buildup        err
   MTOW             2404 kg |   1899.86 kg      -21%  |  2358.49 kg     -1.9%
   Pack energy       165 kWh|     136.1 kWh   -17.5%  |   160.46 kWh    -2.8%
   Wing span        11.8 m  |     10.76 m      -8.8%  |    11.98 m      +1.5%
   wing model alone (span at the PUBLISHED MTOW): 12.1 m vs 11.8 m  ->  2.5%   [isolates engine/wing.js from the mass model]
   mission bracket: 187-160 kWh (no reserve, favourable day -> full 20-min reserve, sizing day) vs published 165 kWh  OUTSIDE - not reconcilable with any reserve convention
   acoustics @100 m: 54 dBA vs published max 65 dBA  PASS  (margin 11 dB)
   buildup predicts EWF = 0.5592   (published MTOW needs 0.5638)
   implied EWF to hit published MTOW: 0.5638   [baseline assumes 0.5]
   L/D input 14 vs engine-computed 10.94   ·  Etot 108.879 kWh  ·  Phov 455.44 kW
   feasibility FAILS: SM -10–25% MAC (Full-authority fly-by-wire) — advisory | Controllable after a single rotor failure | Hover load factor n_z >= 1.35 (continuous motor torque)

── Archer Midnight   [Partial tilt-rotor, 12 rotors (6 tilt / 6 lift-only), V-tail]
   using the source's own stated technology assumptions
   metric        published  |  ewf-fraction        err  |   buildup        err
   MTOW             3175 kg |   2371.89 kg    -25.3%  |   2883.6 kg     -9.2%
   Pack energy       142 kWh|    201.13 kWh   +41.6%  |   232.19 kWh   +63.5%
   Wing span        14.3 m  |     12.02 m     -15.9%  |    13.25 m      -7.3%
   wing model alone (span at the PUBLISHED MTOW): 13.9 m vs 14.3 m  ->  -2.8%   [isolates engine/wing.js from the mass model]
   mission bracket: 134-232 kWh (no reserve, favourable day -> full 20-min reserve, sizing day) vs published 142 kWh  INSIDE - explained by reserve convention, not a model error
   buildup predicts EWF = 0.5493   (published MTOW needs 0.5702)
   implied EWF to hit published MTOW: 0.5702   [baseline assumes 0.5]
   L/D input 14 vs engine-computed 9.01   ·  Etot 160.903 kWh  ·  Phov 383.69 kW
   feasibility FAILS: SM -10–25% MAC (Full-authority fly-by-wire) — advisory | Cruise duty < 80% of continuous rating | Hover load factor n_z >= 1.35 (continuous motor torque) | Cruise L/D >= 9.5 (NASA lift+cruise class) | AR vs LD compatible | Rotors fit within the span

── Volocopter VoloCity   [Coplanar multicopter, 18 fixed-pitch rotors on a ring, no wing]
   using the source's own stated technology assumptions
   metric        published  |  ewf-fraction        err  |   buildup        err
   MTOW              900 kg |     598.4 kg    -33.5%  |   933.56 kg     +3.7%
   buildup predicts EWF = 0.6184   (published MTOW needs 0.6105)
   implied EWF to hit published MTOW: 0.6105   [baseline assumes 0.5]
   L/D input 14 vs engine-computed 5.8   ·  Etot 21.817 kWh  ·  Phov 46.18 kW
   feasibility FAILS: Hover trim: CG inside rotor array | Hover thrust split within T/W | Hover download

── BETA ALIA-250
   SKIPPED: mission incomplete (payload / range / cruise not confirmed)

── Vertical Aerospace VX4   [Partial tilt-rotor, 8 rotors (4 tilt / 4 lift-only), V-tail]
   using the source's own stated technology assumptions
   metric        published  |  ewf-fraction        err  |   buildup        err
   Pack energy       160 kWh|    220.23 kWh   +37.6%  |   250.98 kWh   +56.9%
   Wing span          15 m  |     12.35 m     -17.7%  |    13.47 m     -10.2%
   mission bracket: 180-251 kWh (no reserve, favourable day -> full 20-min reserve, sizing day) vs published 160 kWh  OUTSIDE - not reconcilable with any reserve convention
   buildup predicts EWF = 0.5422
   implied EWF to hit published MTOW: n/a (no MTOW)   [baseline assumes 0.5]
   L/D input 14 vs engine-computed 12.25   ·  Etot 176.182 kWh  ·  Phov 509.85 kW
   feasibility FAILS: Mission matches the reference aircraft (Archer Midnight) | SM -10–25% MAC (Full-authority fly-by-wire) — advisory | Controllable after a single rotor failure | Hover load factor n_z >= 1.35 (continuous motor torque)

══════════════════════════════════════════════════════════════════════════════

ACCURACY BY CONFIGURATION — component buildup

  configuration   aircraft scored                      metrics   MAE
  liftcruise      NASA UAM Lift+Cruise (electric)          3   19.6%
  hybrid          Archer Midnight, Vertical Aerospace      4   20.9%
  hybridPusher    (no commercial aircraft published)         0     --
  tiltrotor       Joby S4                                  3   2.1%
  multicopter     Volocopter VoloCity                      1   3.7%
  sideBySide      (no commercial aircraft published)         0     --

  4 of 6 configurations have ANY commercial aircraft to score against.
  best tiltrotor at 2.1%, worst hybrid at 20.9% — a factor of 10.1. A pooled mean describes neither.
ACCURACY BY METRIC CLASS — component buildup

  Geometry (span)      3 metric(s)   MAE 6.3%
  Mass (MTOW, EWF)     5 metric(s)   MAE 9.8%
  Energy (pack)        3 metric(s)   MAE 28.1%

  NOTE: span from a full run confounds the wing model with the mass
  model — a 20% MTOW error is ~10% of span on its own. The per-aircraft
  "wing model alone" lines above isolate engine/wing.js at the published
  MTOW, and those are the real test of the wing.
  Wing model alone: MAE 2.6% over 2 aircraft.

EXCLUDED as mission-convention artefacts (NOT model error, NOT in the gate):
   Archer Midnight Pack energy: buildup +63.5% vs published 142 kWh — but the mission-convention bracket is 134-232 kWh (+/-5% tol), which reaches the published value, so this measures a mission difference, not the model
   Re-run with EVTOL_STRICT=1 to score them anyway and see the unadjusted number.

Scored metrics : 11
Mean abs error : 27.6%   (ewf-fraction model)
Mean abs error : 13.8%   (component buildup)
Worst          : MTOW -52.7%
══════════════════════════════════════════════════════════════════════════════

PASS: within the 40% gate
```

</details>

<details><summary><code>tab-visibility.mjs</code> — exit 0, 1373 ms</summary>

```
TAB VISIBILITY GATE
==============================================================================
a hidden tab is not a tidiness choice — it is the alternative to
printing NaN where a number belongs

   liftcruise     wing true  tail 2  tab 7 reads "V-Tail"  hidden: none
   hybrid         wing true  tail 2  tab 7 reads "Fin & Stabilator"  hidden: none
   hybridPusher   wing true  tail 2  tab 7 reads "V-Tail"  hidden: none
   tiltrotor      wing true  tail 2  tab 7 reads "V-Tail"  hidden: none
   multicopter    wing false tail 0  tab 7 reads "Tail"  hidden: 2, 18, 7
   sideBySide     wing false tail 0  tab 7 reads "Tail"  hidden: 2, 18, 7

  PASS  no visible tab depends on a quantity that is NaN   every field behind every shown tab is finite on all six layouts
  PASS  every hidden tab is hidden because its physics is absent   nothing is hidden that still has a number — the rule follows the layout, not a hand-written list
  PASS  the tail tab is named after the tail the layout has   liftcruise="V-Tail", hybrid="Fin & Stabilator", hybridPusher="V-Tail", tiltrotor="V-Tail"
  PASS  no configuration hides everything   every layout has tabs to show

==============================================================================
TAB VISIBILITY GATE PASSED
```

</details>

<details><summary><code>vsp-run.mjs</code> — exit 0, 73915 ms</summary>

```
OPENVSP SCRIPT-RUN GATE
========================================================================
  6 scripts written to C:\Users\w451vxs\AppData\Local\Temp\evtol-vsp-run
  OpenVSP: C:\Users\w451vxs\Downloads\eVTOL\OpenVSP-3.51.3-win64-Python3.13\OpenVSP-3.51.3-win64\vspscript.exe

  PASS  liftcruise  — OpenVSP built it and wrote liftcruise.vsp3
  PASS  hybrid  — OpenVSP built it and wrote hybrid.vsp3
  PASS  hybridPusher  — OpenVSP built it and wrote hybridPusher.vsp3
  PASS  tiltrotor  — OpenVSP built it and wrote tiltrotor.vsp3
  PASS  multicopter  — OpenVSP built it and wrote multicopter.vsp3
  PASS  sideBySide  — OpenVSP built it and wrote sideBySide.vsp3

OPENVSP SCRIPT-RUN GATE PASSED — every configuration builds in OpenVSP
```

</details>

<details><summary><code>vspaero.mjs</code> — exit 0, 14108 ms</summary>

```
VSPAERO GATE — vortex-lattice polar on the exported model
============================================================================
  OpenVSP: C:\Users\w451vxs\Downloads\eVTOL\OpenVSP-3.51.3-win64-Python3.13\OpenVSP-3.51.3-win64\vspscript.exe
  liftcruise: Sref 18.70 m2, b 12.97 m, AR 8.996

  PASS  VSPAERO returns a converged polar on the exported model   6 alpha points solved

    alpha      CL        CDi       CDtot     CDi/CL^2
        0    0.2591    0.00233    0.00965     0.0347
        2    0.4482    0.00675    0.01487     0.0336
        4    0.6372    0.01378    0.02310     0.0339
        6    0.8259    0.02343    0.03434     0.0343
        8    1.0185    0.03645    0.04931     0.0351
        8    1.0185    0.03645    0.04931     0.0351

  PASS  induced drag is positive at every alpha   the mixed thin/thick solve gave NEGATIVE CDi at four of five alphas, which is impossible and is why the fuselage is excluded — see tools/vspaero-polar.vspscript
  PASS  CDi/CL^2 is constant across the polar — the signature of a converged solve   0.0347, 0.0336, 0.0339, 0.0343, 0.0351, 0.0351, spread 4.5% — induced drag follows CL^2 as it must, which a diverging solve does not do
    span efficiency e:  VSPAERO 1.027   engine assumes 0.85
  PASS  the computed span efficiency is physical   e = 1/(pi AR CDi/CL^2) = 1.027 at AR 9.00 — an inviscid VLM should land near the ideal 1.0, and above it would mean the solve is wrong
    lift slope:  VSPAERO 5.44 /rad   Helmbold 5.04 /rad
  PASS  and the lift-curve slope agrees with finite-wing theory   5.44 against Helmbold's 5.04 /rad at AR 9.00, 8% apart — the tail also lifts on the wing's reference area, so the solver reading above theory is expected
  PASS  the wing makes lift at ZERO incidence — the exported camber is real   CL(0) = 0.2591 on a NACA 65(2)-415 section. Before the airfoil fix this exporter wrote Camber 0 and this number would have been ~0: the defect is now visible to a solver, not just to a reader of the file

  WHAT THIS SETTLES:
    The exported model is not merely well-formed, it is AERODYNAMICALLY
    solvable, and the section this tool sized shows up as lift at zero
    incidence in an independent solver. The engine's assumed Oswald
    efficiency can now be compared with a computed one rather than
    carried on faith.

VSPAERO GATE PASSED
```

</details>

<details><summary><code>rotorcraft-tail.mjs</code> — exit 0, 68 ms</summary>

```
ROTORCRAFT TAIL GATE
========================================================================
  NDARC Theory NASA/TP-20220000355 sec. 14-1:  V = S l / (R A)

  PASS  inverting the formula returns the V it was built from   V 0.0586 — S = V R A / l and V = S l / R A are the same statement
  PASS  and the area matches the stabiliser measured off the drawing   2.037 m2 against 2.032 m2 from span 2.66 m x chord 0.76 m — closes to 0.21%
  PASS  the stabiliser has a stabiliser's aspect ratio   AR 3.49 — between a stub and a sailplane, as a tail surface is
  PASS  halving the tail arm doubles the required area   2.04 -> 4.07 m2 — inverse in l, so a stub boom asks for an absurd surface instead of quietly under-sizing one
  PASS  area scales as R^2 when the aircraft is scaled   doubling R and the arm gives x4.00 area — S ~ R A / l ~ R^2
  PASS  a multicopter is given no tail   NASA's quadrotor three-view (AIAA 2018-3847 Fig. 1) shows none, so the model offers none rather than inventing one
  PASS  the measured tail arm fits within the measured body length   arm 1.864 R inside a 2.87 R body — the two were measured independently off the same figure and agree

ROTORCRAFT TAIL GATE PASSED
```

</details>

<details><summary><code>drive-failure.mjs</code> — exit 0, 74 ms</summary>

```
DRIVE-SYSTEM FAILURE GATE
========================================================================
  NDARC TP-20220000355 17-4: PreqPG/Omega <= (1+eps) PDSlimit/Omega_prim
  NDARC 29-7.4: fP = fQ = 60% for twin main-rotors

  PASS  the surviving motors carry the WHOLE hover demand   236.97 kW on 1 of 2 motors — a shaft keeps both rotors turning, so the load redistributes instead of a rotor stopping
  PASS  and the installed motor covers it on this design   236.97 kW against a 450.25 kW peak rating, +90% — the rotor-loss test reported -35% for this same aircraft, which was the wrong failure mode, not a worse answer
  PASS  the transmission is sized by the failure, not by hover   PDSlimit 142.18 kW against a 118.48 kW hover share, x1.2 — fP = 0.6 of the drive limit passes to the second rotor
  PASS  and it is expressed as the torque limit NDARC says it really is   3791.2 N-m at the hover rotor speed — "The limit is properly a torque limit, QDSlimit = PDSlimit/Omega_ref"
  PASS  a single-motor group has no redistribution case   returns null rather than dividing by zero survivors
  PASS  many motors make a motor loss cheap, which is the case for distribution   21.54 kW/motor at 12 motors against 236.97 at 2

  MEASURED, NOT ASSERTED — why the weight is not charged:
    NASA SbS-E publishes a 255 lb drive system, and per-train hover
    sizing reproduces it to a few percent. Sizing to PDSlimit instead
    takes SbS-E/driveSys to +54.7% and the benchmark mean 8.7% -> 10.0%.
    So their published weight does not contain an OEI-sized
    interconnect. The demand is real and reported; the weight stays on
    the sizing that matches the data.

DRIVE-SYSTEM FAILURE GATE PASSED
```

</details>

<details><summary><code>autorotation.mjs</code> — exit 0, 3025 ms</summary>

```
AUTOROTATION GATE
==========================================================================
  Fradenburgh, JAHS 29(3) 1984:  AI = (I_R Omega^2 / 2) / (W DL)  [ft^3/lb]
  Population 5-40; >30 single-engine only; <15 large helicopters

  PASS  a Bo-105-class helicopter lands between the two published lines   AI 18.37 ft^3/lb, inside 15 < AI < 30 — the paper's own baseline is a "medium weight twin-engine helicopter" and it excluded <15 and >30 as unlike it
  PASS  and its disk loading lands in the band the same source quotes   6.49 lb/ft^2 against "modern turbine-powered helicopters have a disk loading in the range of 3 lbs/ft^2 to 8 lbs/ft^2"
  PASS  doubling gross weight quarters the index   21.38 -> 5.35 — W appears once directly and once through DL, so the index falls as W^2. "As gross weight is increased, the value of the index decreases rapidly."
  PASS  doubling tip speed quadruples it   21.38 -> 85.53 — energy goes as Omega^2, which is the whole point of storing it in the rotor
  PASS  blade inertia is the uniform-rod result, hub excluded   I = m R^2 / 3, and omitting the hub makes I_R a lower bound, so the index errs conservative rather than flattering
  PASS  fixed-pitch RPM-controlled layouts report that it CANNOT be entered   AIAA 2018-3847: "these are fixed-pitch hingeless rotors with RPM control" — no collective to drop, so no index can rescue it
  PASS  and a layout with no reference vehicle reports UNKNOWN, not false   an open design decision is not the same thing as a fixed-pitch rotor, and reporting it as one would be an invention

  MEASURED, NOT ASSERTED — every layout at its design point:
    layout          N   D (m)     AI   entry        verdict
    liftcruise     4    3.71   6.35   NO       low — large-helicopter end of the band
    hybrid        12    2.10   4.04   unknown  BELOW every helicopter in the published population
    hybridPusher   6    3.07   5.32   unknown  low — large-helicopter end of the band
    tiltrotor      6    3.03   2.71   unknown  BELOW every helicopter in the published population
    multicopter    4    9.04  29.11   NO       within the helicopter population
    sideBySide     2    8.62  21.75   yes      within the helicopter population

  WHAT THAT SAYS:
    Only the side-by-side both CAN enter autorotation and carries enough
    rotor energy to flare. The multicopter stores the most energy of any
    layout here and cannot use a joule of it: fixed pitch. Three layouts
    sit below EVERY helicopter in the published population, which is what
    high disk loading does to a rotor's stored energy — the reason the
    tiltrotor class is not credited with autorotation in service either.

    NASA's own constraint shows the bind: rotor inertia is what makes
    autorotation survivable, and it is the thing they had to LIMIT to keep
    RPM control responsive (10 ft diameter cap). A design cannot quietly
    have both.

AUTOROTATION GATE PASSED
```

</details>

<details><summary><code>whirl-flutter.mjs</code> — exit 0, 3091 ms</summary>

```
WHIRL-FLUTTER GATE
==========================================================================
  Acree, Peyran & Johnson, AHS 55th Forum 1999 — one airframe, two wings:
    XV-15  23% t/c -> 335 kt      15% t/c -> 275 kt   (antisymmetric beam)
    the 15% wing was sized to 529 kt static divergence and still fluttered at 275

  PASS  the published thick-to-thin penalty is carried exactly   335 - 275 = 60 kt for a t/c change of 0.23 -> 0.15, same aircraft otherwise
  PASS  and static divergence is nowhere near the flutter boundary   529 kt divergence against a 275 kt flutter boundary — strength and stiffness sized for divergence do not buy flutter margin, which is the whole lesson
  PASS  a layout whose rotors STOP in cruise is not whirl-flutter critical   a stopped rotor has no whirl mode, and the pusher is on the centreline with no wing to couple with
  PASS  but a rotor-borne layout is judged on whether it has a spanwise structure   multicopter no; side-by-side YES — NASA "modeled [it] with a tiltrotor wing for the rotor support beam ... preventing the whirl-flutter constraint from becoming active"
  PASS  a wing is compared with whichever published wing it resembles   t/c 0.15 -> 275 kt, t/c 0.25 -> 335 kt; never a value between them, because two points on one airframe are not a curve
  PASS  and a wing thinner than the thin reference is flagged, not extrapolated   t/c 0.10 keeps the 275 kt reference and sets thinnerThanReference — the honest statement is "at least this bad", not a number off the end of a fitted line

  MEASURED, NOT ASSERTED — every layout at its design point:
    layout         applies  t/c    Vcr(kt)  ref(kt)  margin  verdict
    liftcruise       no                                    lift rotors stop in cruise and the pusher is on the centreline — no turning rotor on a wing
    hybrid          yes   0.15    130.2      275    2.11  cruise sits far below the reference boundary
    hybridPusher    yes   0.15    130.2      275    2.11  cruise sits far below the reference boundary
    tiltrotor       yes   0.15    173.8      275    1.58  cruise approaches the reference boundary
    multicopter      no                                    rotor-borne with no wing for a rotor to couple with
    sideBySide      yes   0.15       98      275    2.81  cruise sits far below the reference boundary

  WHAT THAT SAYS:
    Margins run 1.58 to 2.81, so these aircraft cruise at 36-63% of the
    speed at which a thin-wing XV-15 flutters. Whirl flutter is a HIGH-SPEED
    tiltrotor constraint and these are 98-174 kt aircraft, which is why NASA
    could size the side-by-side beam and keep the constraint inactive rather
    than design around it.

    THE TILTROTOR IS THE TIGHT ONE, at 1.58. It is the fastest layout here
    and the one whose rotors are proprotors on a wing — the exact case the
    XV-15 study is about. A 1.58 margin against another aircraft's boundary
    is not a clearance; it is the point at which a real analysis is owed.

    That is a margin argument, not an analysis. The boundary quoted belongs
    to the XV-15. No coupled rotor/wing eigenanalysis exists in this tool,
    and Acree needed CAMRAD II with NASTRAN stick models to get one.

WHIRL-FLUTTER GATE PASSED
```

</details>

<details><summary><code>load-cases.mjs</code> — exit 0, 2815 ms</summary>

```
STRUCTURAL LOAD CASE GATE
==========================================================================
  SC-VTOL VTOL.2215(f) gusts; CS-23.341 / FAR 23.341 alleviation factor

  PASS  the three SC-VTOL derived gust velocities round-trip to the regulation's own numbers   9.14 / 15.24 / 20.12 m/s = 30 / 50 / 66 ft/s, against VTOL.2215(f)'s 30 / 50 / 66 ft/s
  PASS  the SI gust increment agrees with CS-23.341's imperial 498 form   SI 1.6295 against imperial 1.6312 — 0.11% apart, and the two share no constant: one carries rho0/2, the other carries 498
  PASS  K_g approaches 0.88 for a very heavy aircraft and never exceeds it   K_g -> 0.88 as mu -> infinity — a heavy aircraft cannot be alleviated by more than the factor's own ceiling, so K_g is bounded above by construction
  PASS  and a LIGHTER aircraft is alleviated more   K_g 0.427 at mu=5 against 0.796 at mu=50 — the light aircraft is accelerated before the gust is fully developed, which is the whole reason the factor exists
  PASS  the 66 ft/s case is applied to Category Enhanced only   enhanced gets 3 gust cases, basic gets 2 — VTOL.2215(f)(3) is Enhanced only, and applying it to Basic would over-size every wing in that category
  PASS  at SC-VTOL's 2.0g manoeuvre floor the GUST case takes over the wing   n=2.0 -> gust — 66 ft/s at VB (Enhanced) (nLimit 2.81); n=3.5 -> symmetric manoeuvre 3.5g. The module's header claims exactly this and nothing tested it until now
  PASS  doubling wing loading reduces the gust increment   dn 1.805 -> 0.971 — a heavily loaded wing is thrown less by the same gust, which is why gust governs the LIGHT designs and manoeuvre governs the heavy ones

  MEASURED, NOT ASSERTED — every winged layout at its design point:
    layout        W/S(N/m2)    mu      K_g    dN worst  nLimit  governing
    liftcruise       1450    31.7   0.7539     1.581    3.50   symmetric manoeuvre 3.5g
    hybrid           1371    30.5   0.7497     1.934    3.50   symmetric manoeuvre 3.5g
    hybridPusher     1450    32.7   0.7571     1.847    3.50   symmetric manoeuvre 3.5g
    tiltrotor        1524    35.1   0.7645     2.368    3.50   symmetric manoeuvre 3.5g
    multicopter    — no wing, so no wing gust case
    sideBySide     — no wing, so no wing gust case

  WHAT THAT SAYS:
    At the 3.5g default every winged layout is manoeuvre-governed, with the
    worst gust adding 1.57-2.37g on its own. That is not comfortable margin:
    the tiltrotor's 66 ft/s case alone reaches 3.37g against a 3.5g limit.
    Drop the manoeuvre limit toward SC-VTOL's 2.0g floor — which is what a
    full-authority FBW eVTOL with envelope protection actually flies to —
    and the gust case governs the wing instead.

STRUCTURAL LOAD CASE GATE PASSED
```

</details>

<details><summary><code>reg-applicability.mjs</code> — exit 0, 2664 ms</summary>

```
════════════════════════════════════════════════════════════════════════════
REGULATORY APPLICABILITY GATE — does the document govern this aircraft?
════════════════════════════════════════════════════════════════════════════

1. AN OUT-OF-SCOPE DESIGN GETS NO VERDICTS
  PASS  the engine really does produce an out-of-scope design from one slider
        payload 900 kg (the slider maximum) → MTOW 11132.0 kg, 1.95x the 5700 kg MCTOM
  PASS  VTOL.2005(a) withdraws the document rather than failing a row
        applies=false; the MCTOM gate reports "out"
  PASS  a design inside every stated gate is in scope with nothing left to ask
        MTOW 2017.0 kg, 4 seats → applies=true, 0 fixable gate(s) outstanding
  PASS  but the applicability test is still not COMPLETE, and says so
        undecided: VTOL.2000(d) — no VNO in this engine
  PASS  an unstated seat count is NOT DECIDABLE, never a pass, and is fixable
        applies=true (nothing puts it out), seat gate="unknown", fixable=[VTOL.2005(a)]
  PASS  more than 9 seats leaves SC-VTOL's small category
        12 seats → applies=false

2. THE SPEED GATE DECIDES ONLY IN THE DIRECTION IT CAN
  PASS  and the speed gate is NOT offered as something the user can close
        no seat-count-style prompt for a quantity the engine cannot compute
  PASS  a cruise speed above 250 kt puts VNO above it, decisively
        300 kt EAS → "out" (VNO ≥ cruise speed, MOC VTOL.2200(c))
  PASS  a cruise speed BELOW 250 kt decides nothing, because VNO is not modelled
        120 kt EAS → "unknown", not "in": the paragraph limits VNO, not cruise
  PASS  and the engine genuinely has no VNO to test instead
        VNE/VNO/VH appear in engine.js only inside the quoted MOC VTOL.2215(f) text

3. EVERY RULE'S VALUE MUST MOVE — a constant is not a check
  PASS  EASA SC-VTOL / Positive limit load factor responds to the design
        2 distinct value(s) across 13 designs, e.g. 3.5, 2
  PASS  EASA SC-VTOL / Negative limit load factor responds to the design
        3 distinct value(s) across 13 designs, e.g. -1.5, -1, -0.8
  PASS  EASA SC-VTOL / OEI thrust margin responds to the design
        3 distinct value(s) across 13 designs, e.g. 19.2, -3.7, 13.7
  PASS  EASA SC-VTOL / Residual state of charge responds to the design
        2 distinct value(s) across 13 designs, e.g. 0.19, 0.1
  PASS  EASA SC-VTOL / Blade tip Mach responds to the design
        3 distinct value(s) across 13 designs, e.g. 0.4983, 0.654, 0.5102
  PASS  EASA SC-VTOL / Static margin, lower responds to the design
        10 distinct value(s) across 13 designs, e.g. 0.1288, 0.1524, 0.1279, 0.1657
  PASS  EASA SC-VTOL / Static margin, upper responds to the design
        10 distinct value(s) across 13 designs, e.g. 0.1288, 0.1524, 0.1279, 0.1657
  PASS  Category limits / Maximum certificated take-off mass responds to the design
        11 distinct value(s) across 13 designs, e.g. 2016.98, 1993.46, 1821.17, 1992.17
  PASS  Category limits / Battery mass fraction responds to the design
        10 distinct value(s) across 13 designs, e.g. 18.1, 16.5, 26.4, 18.7
  PASS  Category limits / Hover thrust-to-weight responds to the design
        2 distinct value(s) across 13 designs, e.g. 1.3, 1.05

4. THE DIVE-SPEED ROW IS GONE AND ITS MEASUREMENTS ARE RECORDED
  PASS  no rule evaluates VD_margin
        10 rules, none with param "VD_margin"
  PASS  and the panel carries no dead case for it
        no `case "VD_margin"` in RegTrackerPanel.jsx
  PASS  the tautology it rested on is still in the engine, so the note stays true
        engine.js still defines VD as exactly 1.25 x vCruise; the rule is withdrawn, not the definition
  PASS  the basis split is computed and reconciles
        10 rules = 3 regulation + 7 tool

5. EASA AND FAA DO NOT COVER THE SAME AIRCRAFT
  PASS  the FAA mass limit is derived from the pound, never a rounded kilogram
        12500 lb x 0.45359237 = 5669.904625 kg
  PASS  the two mass limits differ by a band a design can sit inside
        EASA 5700 kg vs FAA 5669.905 kg — a 30.1 kg band
  PASS  and so do the seat limits
        EASA 9 seats (VTOL.2005(a)), FAA 6 (PL.2000(a))
  PASS  a 5 685 kg eight-seater is inside EASA scope and outside FAA scope
        EASA applies=true; FAA gates out on Maximum weight at most 12 500 lb and Passenger seating of 6 or fewer

6. vtolCategory — every file the panel names must read it
  PASS  engine/avionics.js really reads vtolCategory
        claimed for VTOL.2005(b): Avionics redundancy lanes: triplex for Enhanced, duplex for …
  PASS  engine/certification-climb.js really reads vtolCategory
        claimed for VTOL.2120(b): Climb requirement is taken one unit down for Enhanced rather…
  PASS  engine/loadcases.js really reads vtolCategory
        claimed for MOC VTOL.2200(c): The VB gust case applies to Enhanced only…
  PASS  the category-conditioned requirements NOT modelled are named, not dropped
        4 listed: VTOL.2240, VTOL.2250(f), VTOL.2510(c), VTOL.2515
  PASS  and the category is a real sizing lever, not a label
        Basic 1972.3 kg vs Enhanced 2017.0 kg — 44.7 kg of avionics redundancy
  PASS  the compliance panel finally reads the category the engine already honoured
        RegTrackerPanel.jsx references vtolCategory

7. THE NEW INPUT MOVES NO SIZED RESULT UNTIL IT IS SET
  PASS  nSeats defaults to absent
        DEFAULT_PARAMS.nSeats = null
  PASS  null and absent size identically, so the golden master cannot move
        both 2016.980000 kg
  PASS  and a stated seat count still sizes
        4 seats → 2017.0 kg (cabin check honours the integer)

8. THE LANGUAGE-MODEL PROMPT
  PASS  the model is never asked to state its own training cutoff
        gpt-oss-20b answered '2021' once and 'September 2026' once; the cutoff is now a constant in lib/ai-model.js from the published model card
  PASS  and the documented cutoff travels with the answer
        RegTrackerPanel.jsx prints GROQ_MODEL_CUTOFF beside the report
  PASS  tool rules are no longer sent to the model to be 'matched'
        the old prompt sent all 11 rules and got MATCH for six that have no published counterpart
  PASS  only rules with a real paragraph are asked about
        the prompt filters on basis === "regulation"
  PASS  the FAA document is spelled AC 21.17-4, as the rest of the repo spells it
        no hyphenated 'AC 21-17-4' anywhere in the panel
  PASS  and no stale as-of date contradicts regdb.js's lastChecked
        no 'early 2025' in the prompt

9. SERVER-RENDER — nothing else in this repo renders this panel
  PASS  the panel renders at every scope state without throwing
        in scope, seats unstated, out of scope, and unsized
  PASS  an out-of-scope design is told the document does not apply
        MTOW 11132.0 kg → the notice is rendered
  PASS  and NOT ONE rule group is rendered for it
        0 of 2 rule groups in the markup
  PASS  no ALL PASS or FAIL verdict badge survives out of scope
        0 verdict badge(s) in the out-of-scope markup
  PASS  while an in-scope design still gets its verdict badges
        2 badge(s): ✗ 1 FAIL, ALL PASS
  PASS  an in-scope design gets its rule groups
        2 of 2 groups rendered
  PASS  an unstated seat count is shown as undecided, not passed
        the seat gate renders NOT DECIDABLE
  PASS  no NaN, undefined or Infinity reaches the screen (inScope)
        14271 chars of markup, clean
  PASS  no NaN, undefined or Infinity reaches the screen (noSeats)
        14862 chars of markup, clean
  PASS  no NaN, undefined or Infinity reaches the screen (outScope)
        9464 chars of markup, clean
  PASS  no NaN, undefined or Infinity reaches the screen (unsized)
        14281 chars of markup, clean

════════════════════════════════════════════════════════════════════════════
REGULATORY APPLICABILITY GATE PASSED
```

</details>

<details><summary><code>blade-twist.mjs</code> — exit 0, 3274 ms</summary>

```
BLADE TWIST GATE
==========================================================================
  Leishman, Principles of Helicopter Aerodynamics Ch. 3 — ideal twist:
    theta(r) (r/R) = constant,  anchored on Beta34 at 0.75 R

  PASS  the curve passes exactly through the collective at 0.75 R   theta(0.75) = 11.095 against Beta34 11.095 — OpenVSP's own default shows the same identity (curve 20.00 at 0.75 R, Beta34 20.00)
  PASS  theta(r) x (r/R) is constant along the blade — the ideal-twist condition   products 8.3212, 8.3213, 8.3210 — equal to 4 parts in 1e5, which is what gives uniform inflow and minimum induced power in hover
  PASS  and pitch falls monotonically outboard   41.6 -> 11.1 -> 8.3 deg — washout, not washin
  PASS  doubling the collective doubles the total twist   30 -> 60 deg — the distribution is anchored on the design point rather than being a shape chosen independently of it
  PASS  and the root singularity is present rather than papered over   ideal twist at 0.20 R for a 20 deg collective is 75 deg, against OpenVSP's default 46.75 — ideal twist IS impractical inboard, which is why real blades use a linear approximation, and the curve is written no further in than 0.20 R

  MEASURED, NOT ASSERTED — every layout at its design point:
    layout        Beta34   root(0.2R)   tip     total twist
    liftcruise     10.13        38.0     7.6          30.4 deg
    hybrid         11.64        43.7     8.7          34.9 deg
    hybridPusher   11.10        41.6     8.3          33.3 deg
    tiltrotor      12.96        48.6     9.7          38.9 deg
    multicopter     7.64        28.7     5.7          22.9 deg
    sideBySide      8.36        31.3     6.3          25.1 deg

  WHAT THAT SAYS:
    Total twist runs 22.8 to 39 deg, and it is a HOVER optimum by
    construction — the model is exported in helicopter mode, released at
    90 deg as RAVEN publishes its own, so the twist matches the attitude
    shown. A proprotor that must also work in high-speed axial flight wants
    considerably more, and choosing that compromise needs a cruise collective
    schedule this engine does not have. The export carries the optimum it can
    derive and says which one it is, rather than a compromise nobody computed.

    The root pitch is steep — 28.7 to 48.6 deg at 0.20 R. That is not an
    artefact: ideal twist is singular at the axis, which is exactly why real
    blades use a linear approximation to it. It is reported rather than
    clipped, because a clip would be a number nobody derived.

BLADE TWIST GATE PASSED
```

</details>

<details><summary><code>control-authority.mjs</code> — exit 0, 3556 ms</summary>

```
FAILURE-MODE CONTROLLABILITY GATE
============================================================================
  Du, Quan, Yang & Cai, J. Guidance Control & Dynamics (arXiv:1403.5986)
  ACAI = rho(G, dOmega): radius of the largest ball at the hover requirement
  inside the attainable control set. Controllable iff rank 4 AND ACAI > 0.

  PASS  PNPNPN hexacopter: EVERY single-rotor failure is uncontrollable at FULL RANK   ACAI 0.00, 0.00, 0.00, 0.00, 0.00, 0.00 with rank 4 throughout — the published paradox reproduced, and rank is shown not to be the test
  PASS  and the model reports that distinction explicitly rather than hiding it   fullRankButUncontrollable is set on all six — a caller reading rank alone would conclude the opposite of the truth
  PASS  PPNNPN hexacopter: the same six rotors survive SOME failures and not others   4 of 6 remain controllable (ACAI 0.73, 0.45, 0.45, 0.73, -0.21, -0.21) — "a new rotor arrangement (PPNNPN) ... can remain controllable when one of some specific rotors stops". Spin direction, not rotor count, decides it.
  PASS  an undamaged aircraft has positive control authority   healthy ACAI 1.486 — the test is not simply returning zero for everything
  PASS  the torque-to-thrust ratio is derived from momentum theory, not assumed   k_mu 0.2055 m for a 5 kN rotor of 1.5 m radius — from v_i = sqrt(T/2 rho A) and Q = P/Omega, with no fitted constant

  MEASURED, NOT ASSERTED — real rotor stations from engine/geometry.js:
    layout        N   healthy   worst single failure   survivable
    liftcruise    4    2010.2    -6036.7 (yaw)      0 of 4
    hybrid       12     973.3      212.6 (yaw)      12 of 12
    hybridPusher  6    1425.7    -2522.3 (yaw)      0 of 6
    tiltrotor     6    1440.4    -4826.0 (thrust)   0 of 6
    multicopter   4    3524.3   -10583.5 (yaw)      0 of 4
    sideBySide    2   — fewer than 4 rotors: the 4-axis allocation cannot be spanned at all, so no failure is survivable by this test

  WHAT THAT SAYS:
    Thrust margin and controllability are different questions, and this tool
    had only ever asked the first. A layout can hold its weight on the
    surviving rotors and still be unable to hold ATTITUDE while doing it.

    Spin direction decides fault tolerance and NOTHING in this tool sets it.
    The published hexacopter pair is the proof: same six rotors, same arms,
    same thrust — one arrangement loses control on any failure, the other
    survives four of six. That is an unmade design decision sitting under
    every rotor-borne configuration here.

FAILURE-MODE CONTROLLABILITY GATE PASSED
```

</details>

<details><summary><code>hover-dynamics.mjs</code> — exit 0, 2036 ms</summary>

```
HOVER DYNAMICS GATE
==============================================================================
no published eVTOL modal data exists to compare against; these are
properties of any rigid body and any rotor, which is what CAN be checked

   liftcruise    I  13335.2/ 13488.5/ 14693.1  Lp -0.9414  Mq  -1.091  Zw -0.6108  DL  631.6 N/m2
   hybrid        I  11506.8/  3837.6/ 12278.8  Lp -1.8825  Mq -1.6159  Zw -0.6083  DL  636.7 N/m2
   hybridPusher  I  15709.9/  6716.1/ 14576.6  Lp -1.7818  Mq -0.8595  Zw -0.6146  DL  623.7 N/m2
   tiltrotor     I  16127.5/  6327.3/ 14797.8  Lp -1.5784  Mq -0.8106  Zw -0.5886  DL  680.1 N/m2
   multicopter   I  27793.3/ 28830.3/ 49699.6  Lp -6.0763  Mq -5.9051  Zw -1.2807  DL  143.7 N/m2
   sideBySide    I   5415.2/    1904/  4310.7  Lp -5.3945  Mq -0.4224  Zw -1.1829  DL  168.4 N/m2

  PASS  hover dynamics resolve on essentially every layout   6 of 6
  PASS  the inertia tensor satisfies the triangle inequalities on every layout   Ixx+Iyy>=Izz and cyclic — true of any real body, and the test a lumped tensor fails
  PASS  the tensor accounts for the whole aircraft   every layout within 2% of MTOW; a dropped mass always understates inertia
  PASS  heave, roll and pitch damping are all restoring   negative on every axis and every layout
  PASS  heave damping falls as 1/sqrt(disk loading), as Zw = -g/vi requires   multicopter (DL 143.7) vs tiltrotor (DL 680.1): |Zw| ratio 2.18 against the predicted 2.18
  PASS  the side-by-side has almost no rotor-derived PITCH damping   Mq -0.4224 against Lp -5.3945 — two rotors abreast have no fore-aft separation, so the model reproduces a real configuration difference rather than a generic answer
  PASS  and its pitch inertia is far below its roll inertia, for the same reason   Iyy 1904 vs Ixx 5415.2 — ratio 0.35, at the rotor separation the layout's own geometry sets rather than an overwide one

  CONFIGURATION RANKINGS, and whether they survive a +/-50% perturbation
    rollDamping        robust  spread  545.5%   multicopter > sideBySide > hybrid > hybridPusher > tiltrotor > liftcruise
    pitchDamping       robust  spread   1298%   multicopter > hybrid > liftcruise > hybridPusher > tiltrotor > sideBySide
    heaveDamping       robust  spread  117.6%   multicopter > sideBySide > hybridPusher > liftcruise > hybrid > tiltrotor
    rollControlPower   robust  spread  130.9%   sideBySide > hybrid > hybridPusher > tiltrotor > liftcruise > multicopter
    rollAgility        robust  spread  549.4%   liftcruise > tiltrotor > hybrid > hybridPusher > sideBySide > multicopter
  PASS  configuration rankings are produced for the metrics a designer chooses on   5 metrics
  PASS  every reported ranking survives the assumed coefficients moving by 50%   no ordering flips - these differences are not artefacts of a guess
  PASS  damping and agility rank strongly OPPOSITE across the layouts   Spearman rho = -0.94 — "the more stable they are, the harder they are to maneuver" (Malpica/Suh/Silva), recovered rather than imposed

  NOT CHECKED, because nothing exists to check it against:
    absolute accuracy of any of these numbers. No eVTOL publishes modal
    data, damping ratios or eigenvalues; one publishes inertia, subscale.
    ADS-33 thresholds are military and explicitly NOT civil requirements
    (DOT/FAA/TC-23/59, 2024). These outputs stay tagged accordingly.
  PASS  a side-by-side's two rotors share ONE height   payload 410: z 2.550/2.550; payload 455: z 2.621/2.621; payload 500: z 2.704/2.704 — a lateral pair on the hub station gets no fore/aft rise, and the two sides cannot differ
  PASS  and that height moves smoothly with weight — no fraction-of-D jump   410 kg: z 2.550 m (D 8.17); 455 kg: z 2.621 m (D 8.51); 500 kg: z 2.704 m (D 8.90) — worst step 1.0% of D; the bare inequality moved it 17% of D
  PASS  so the side-by-side's pitch damping is stable across the sweep   Mq -0.427 / -0.422 / -0.414 at payload 410/455/500 — within 15%; the coin toss gave -0.31 or -0.84 for the same aircraft depending on the last bits of a subtraction

==============================================================================
HOVER DYNAMICS GATE PASSED
```

</details>

<details><summary><code>render-freeze.mjs</code> — exit 0, 9239 ms</summary>

```
RENDER FREEZE GATE
========================================================================
  same  multicopter-iso.png
  same  multicopter-top.png
  same  sideBySide-iso.png
  same  sideBySide-top.png
  same  liftcruise-iso.png
  same  liftcruise-top.png
  same  tiltrotor-iso.png
  same  tiltrotor-top.png
  same  hybrid-iso.png
  same  hybrid-top.png
  same  hybridPusher-iso.png
  same  hybridPusher-top.png
  same  multicopter-coaxial-iso.png
  same  multicopter-coaxial-top.png
  same  drone-quadX-iso.png
  same  drone-quadX-top.png
  same  drone-hexaX-iso.png
  same  drone-octaquad-iso.png
  same  drone-dodeca-iso.png
  same  drone-quadX-failed.png
  same  mission-liftcruise-whole.png
  same  mission-liftcruise-takeoff.png
  same  mission-liftcruise-climb.png
  same  mission-liftcruise-cruise.png
  same  mission-liftcruise-descent.png
  same  mission-multicopter-whole.png
  same  mission-tiltrotor-whole.png

PASS: all 27 views render exactly as committed
```

</details>

<details><summary><code>design-file.mjs</code> — exit 0, 3879 ms</summary>

```
════════════════════════════════════════════════════════════════════════
DESIGN FILE — reproducible saved designs
════════════════════════════════════════════════════════════════════════

1. A saved design reopens to the same result
  PASS  default: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  config liftcruise: identical after save → JSON → open  — 432 outputs compared, status identical
  PASS  config hybrid: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  config hybridPusher: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  config tiltrotor: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  config multicopter: identical after save → JSON → open  — 330 outputs compared, status identical
  PASS  config sideBySide: identical after save → JSON → open  — 330 outputs compared, status identical
  PASS  reserve by distance: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  manoeuvre load factor set: identical after save → JSON → open  — 431 outputs compared, status identical
  PASS  a record compares the whole fingerprint, not a handful of headline numbers  — smallest comparison 330 outputs
  PASS  stored MTOW is the engine's MTOW for the stored inputs (reserve transform included)  — 2462.93 vs 2462.93
  PASS  …and the transform matters (running the raw state gives a different aircraft)  — raw 2016.98 vs transformed 2462.93

2. Inputs a record lacks come from fixed defaults, never the session
  PASS  a legacy bare-params design resolves over DEFAULT_PARAMS
  PASS  …and is flagged legacy with the inputs it lacked listed  — 46 missing
  PASS  resolveInputs drops the embedded _design block and undefined values

3. The custom airfoil is saved and hashed
  PASS  changing only the custom airfoil changes the input hash  — 05e8264f2fd5ad vs 139774591b0964
  PASS  the custom airfoil survives the round trip
  PASS  changing one input changes the input hash
  PASS  key order does not change the hash (canonical JSON)

4. Continuity: a changed engine is reported, platform noise is not
  PASS  an internal engine default moving is reported as changed  — 196 outputs moved
  PASS  …with take-off mass listed first  — first: MTOW 2660.15 → 2784.43
  PASS  …and the message says the engine changed, not the inputs
  PASS  last-bit noise (3e-8 relative) is NOT reported
  PASS  a 2e-5 relative change IS reported
  PASS  an engine that throws is 'unchecked', not 'identical'

5. Stored forms and damaged files
  PASS  a legacy row is compared on the rounded numbers it kept  — status identical, compared 2
  PASS  …and says it kept too few to prove more
  PASS  a legacy row whose MTOW no longer matches is 'changed'
  PASS  a legacy row with no numbers is 'unchecked'
  PASS  params/results row form round-trips as a full record
  PASS  embedded form (gallery) round-trips as a full record
  PASS  embedded form keeps inputs at the top level for readers that pick fields out
  PASS  an input edited after saving fails the checksum
  PASS  …and the message says so
  PASS  a newer format version is refused with a reason
  PASS  non-JSON is refused
  PASS  JSON with no design inputs is refused

6. Engine build stamp
  PASS  outside a build the stamp says 'unbuilt' rather than inventing a commit
  PASS  __EVTOL_BUILD__ is read only in lib/designfile.js, and only under a typeof guard  — src/lib/designfile.js; 1 code line(s)
  PASS  vite.config.js defines __EVTOL_BUILD__ with version, commit and dirty flag

7. Every save and load path goes through the design file
  PASS  no setParams call merges a loaded object into the current state  — none
  PASS  every load handler in the Community tab opens through openDesignSafely  — 3/3
  PASS  leaderboard entries are fetched by share_id (the table has no params)
  PASS  the on-screen result is computed through engineInputs
  PASS  the shared-link loader and banner open through the design file
  PASS  openDesign REPLACES the state with the record's inputs
  PASS  Save and Ctrl+S both call saveToAccount
  PASS  'Design Saved' is only said after the write succeeded
  PASS  a failed save is shown as NOT SAVED
  PASS  saveDesign no longer swallows its error
  PASS  local history stores a design record and reports failure
  PASS  publishing a design stores a design record
  PASS  gallery writes store an embedded design record
  PASS  the golden master and the design file share one comparison rule

════════════════════════════════════════════════════════════════════════
DESIGN FILE: 54 passed, 0 failed
════════════════════════════════════════════════════════════════════════
```

</details>

<details><summary><code>validation-domain.mjs</code> — exit 0, 1590 ms</summary>

```
VALIDATION DOMAIN GATE
========================================================================
8 validated cases over 5 layout(s):
   multicopter   NASA quadrotor, all-electric  (MTOW 2939 kg, 544.3 kg, 138.9 km; MTOW error -0.3%)
   sideBySide    NASA side-by-side helicopter, all-electric  (MTOW 2223 kg, 544.3 kg, 138.9 km; MTOW error -11.5%)
   liftcruise    NASA lift+cruise, all-electric  (MTOW 3724 kg, 544.3 kg, 138.9 km; MTOW error -23.8%)
   liftcruise    NASA UAM Lift+Cruise (electric)  (MTOW 4301 kg, 544 kg, 139 km; MTOW error -26.5%)
   tiltrotor     Joby S4  (MTOW 2404 kg, 453 kg, 161 km; MTOW error -1.9%)
   hybrid        Archer Midnight  (MTOW 3175 kg, 454 kg, 100 km; MTOW error -9.2%)
   multicopter   Volocopter VoloCity  (MTOW 900 kg, 200 kg, 35 km; MTOW error 3.7%)
   liftcruise    NASA lift+cruise, turboelectric (Silva 2018)  (MTOW 2727 kg, 544.3 kg, 138.9 km; MTOW error -19.1%)
   Payload        200 - 544.3 kg
   Mission range  35 - 161 km
   Cruise speed   27.8 - 89.4 m/s
   Take-off mass  900 - 4301 kg
   layouts with NO validated case: hybridPusher
PASS  the app's domain file matches the harnesses
```

</details>

<details><summary><code>result-warnings.mjs</code> — exit 0, 2315 ms</summary>

```
════════════════════════════════════════════════════════════════════════
RESULT WARNINGS — NASA-STD-7009B [M&S 26], [M&S 32]-[M&S 34]
════════════════════════════════════════════════════════════════════════

1. Every warning names its category and states its impact
  PASS  every item has a known category, a severity, text and an impact; e and g always present
  PASS  all eight [M&S 32] categories a-h are defined

2. [M&S 26] domain placards
  PASS  default liftcruise: inside the verified domain; inside the validated one  — no excursions
  PASS  default hybrid: inside the verified domain; inside the validated one  — no excursions
  PASS  default hybridPusher: inside the verified domain; OUTSIDE the validated one  — validation:configType
  PASS  default tiltrotor: inside the verified domain; inside the validated one  — no excursions
  PASS  default multicopter: inside the verified domain; inside the validated one  — no excursions
  PASS  default sideBySide: inside the verified domain; inside the validated one  — no excursions
  PASS  a payload above the validated envelope is placarded with its extent  — 65.3% above 544.3 kg
  PASS  …and the consequence says the error there is unknown
  PASS  an input below the verified sweep is placarded as a verification excursion
  PASS  a turboelectric hybrid is outside the validated domain (only a turboelectric lift+cruise was compared)
  PASS  its measured shortfall is listed under outstanding defects
  PASS  the verified sweep covers every default input it names

3. [M&S 32] a, b, d fire from what the engine reports
  PASS  a diverged design raises an execution error saying not to use the numbers
  PASS  every failed hard check becomes an acceptance-criteria error  — 8 failed
  PASS  a failed analysis stage becomes an execution error
  PASS  no result at all is an execution error
  PASS  a modelling omission on this layout becomes an assumptions warning  — 1 omission check(s) failing on the side-by-side
  PASS  the default design raises no errors  — {"error":0,"warning":3,"info":3}
  PASS  a fraction-model run does not claim the build-up fell back

4. [M&S 32] f from the opened design's continuity check
  PASS  a changed result is a setup warning
  PASS  a failed checksum is a setup error
  PASS  a legacy design is a setup warning
  PASS  a reproduced design raises nothing

5. [M&S 32] h lists measured shortfalls on the same layout
  PASS  liftcruise: 2 measured take-off-mass shortfall(s) over 5% listed  — listed 2
  PASS  hybrid: 1 measured take-off-mass shortfall(s) over 5% listed  — listed 1
  PASS  hybridPusher: 0 measured take-off-mass shortfall(s) over 5% listed  — listed 0
  PASS  tiltrotor: 0 measured take-off-mass shortfall(s) over 5% listed  — listed 0
  PASS  multicopter: 0 measured take-off-mass shortfall(s) over 5% listed  — listed 0
  PASS  sideBySide: 1 measured take-off-mass shortfall(s) over 5% listed  — listed 1

6. [M&S 33]/[M&S 34] every output has an uncertainty statement
  PASS  every registered output gets a statement and a method
  PASS  outputs never compared with an aircraft say no estimate is available
  PASS  take-off mass states a measured error over the validated aircraft  — Measured against 7 published aircraft: mean absolute take-off-mass error 11.0%; 1 of them tilt+lift hybrid: -9.2%.
  PASS  a turboelectric design is judged only against turboelectric aircraft  — Measured against 1 published turboelectric aircraft: mean absolute take-off-mass error 19.1%; 1 of them lift+cruise: -19.1%.
  PASS  …and says so when no aircraft of the layout exists

7. Both the screen and the report carry the warnings
  PASS  App renders ResultWarnings
  PASS  the warnings are built from the same state the result was
  PASS  openedDesign is declared before the memo that reads it (no render-time TDZ)
  PASS  the report imports and places the warnings section
  PASS  the Uncertainty tab uses the screen's transform

════════════════════════════════════════════════════════════════════════
RESULT WARNINGS: 41 passed, 0 failed
```

</details>

<details><summary><code>provenance-report.mjs</code> — exit 0, 1373 ms</summary>

```
══════════════════════════════════════════════════════════════════════════
VERIFICATION COVERAGE
══════════════════════════════════════════════════════════════════════════

INPUTS — 82 registered
  validated     3    4%  █
  calibrated    8   10%  ████
  sourced      29   35%  ██████████████
  derived      14   17%  ███████
  unverified   28   34%  ██████████████

OUTPUTS — 450 registered
  validated    16    4%  █
  calibrated    5    1%  
  sourced     138   31%  ████████████
  derived     220   49%  ████████████████████
  unverified   70   16%  ██████

══════════════════════════════════════════════════════════════════════════
Engine emits 450 distinct keys over 16 runs (450 on the reference run); 450 are registered.
Every emitted output is classified.

Bottom line: 16 of 450 engine outputs (4%) have been
compared numerically against published aircraft data.

══════════════════════════════════════════════════════════════════════════
PROVENANCE GATE PASSED - every output any layout emits is classified.
```

</details>

<details><summary><code>api.mjs</code> — exit 0, 4243 ms</summary>

```
ENGINE API GATE
========================================================================
  PASS  the package imports by its own name  — evtol-sizer
  PASS  size() returns the app's result for the same inputs
  PASS  size() returns warnings and the domain with the numbers
  PASS  sizeMany() sizes each case
  PASS  a design that does not close reports converged: false
  PASS  records made through the API carry the package version  — {"version":"0.2.0-dev","commit":"901718f2b4fa","dirty":true,"builtAt":null,"mode":"node-api"}
  PASS  reopen() reproduces a record
  PASS  engineVersion() reports the package and format versions
  PASS  docs/API.md documents every export  — 19 exports
  PASS  evtol-size --version names the package version  — evtol-size v0.2.0-dev (commit 901718f2b4fa, uncommitted changes; API 1; design format 1)
  PASS  a clean design exits 0
  PASS  a design that does not close exits 1
  PASS  unreadable input exits 2
  PASS  an array gives one JSON line per case, each with its warnings
  PASS  --reopen reproduces a saved design file and exits 0  — identical: 0 of 431 stored outputs moved
  PASS  no app module imports src/api.js (it uses node:fs)
  PASS  package.json exports the API and the command

ENGINE API GATE PASSED (17 checks)
```

</details>

<details><summary><code>turboelectric.mjs</code> — exit 0, 2364 ms</summary>

```
════════════════════════════════════════════════════════════════════════════
TURBOELECTRIC POWERTRAIN
════════════════════════════════════════════════════════════════════════════

1. NASA lift+cruise, turboelectric (Silva et al. 2018 Table 3)

   quantity                   published     tool      error
   gross weight (lb)              6013     4863   -19.1%
   empty weight (lb)              4627     3333   -28.0%
   battery (lb)                    188      164   -12.8%
   fuel carried (lb)               176      166   -5.9%
   fuel burn (lb)                  129      117   -9.5%
   energy burn (MJ)               2510     2267   -9.7%
   turboshaft at 6k ft (hp)       1152     1061   -7.9%

   all-electric sibling (L+C-E) gross weight error: -23.8%
  PASS  the design converges
  PASS  gross-weight error no worse than the battery sibling's (+5 points)  — turboelectric -19.1% vs electric -23.8%
  PASS  fuel carried (lb) within 15%  — -5.9%
  PASS  fuel burn (lb) within 15%  — -9.5%
  PASS  energy burn (MJ) within 15%  — -9.7%
  PASS  turboshaft at 6k ft (hp) within 15%  — -7.9%
  PASS  hover and cruise C-rate are zero, as NASA reports

2. Identities on every layout (app defaults, turboelectric)

  PASS  every layout closes and satisfies the powertrain identities  — 18 design points

3. Model pieces

  PASS  the engine table is reproduced exactly at its rows
  PASS  outside the table the end row is used and flagged
  PASS  δ√θ is 1 at sea level ISA  — 1.000000
  PASS  δ√θ at 6,000 ft ISA is 0.785 (δ 0.8014, θ 0.9588)  — 0.7846
  PASS  a hot day raises √θ (δ unchanged at sea level)
  PASS  a battery aircraft reports no fuel and no turboshaft
  PASS  hot and high needs a bigger turboshaft (lapse is applied)  — 483.1 -> 815.7 kW
  PASS  a longer mission carries more fuel but not a bigger emergency pack in proportion  — fuel 38.4 -> 62.91 kg, pack 78.37 -> 83.91 kg
  PASS  payload-range: less payload buys no range (tank is full), more payload costs range

4. Badges and summaries follow the powertrain

  PASS  the pack and mission energy are not VAL on a turboelectric design
  PASS  the fuel outputs are not VAL on a battery design (they are zero)
  PASS  the take-off-mass card quotes the measured error for its own powertrain  — -19.1% on the one published turboelectric aircraft | ±11.0% mean error over 7 published aircraft
  PASS  the card no longer types its own accuracy figure
  PASS  every chip reads the powertrain of the design on screen
  PASS  the Cost tab says it does not price fuel
  PASS  the sidebar offers the powertrain

════════════════════════════════════════════════════════════════════════════
TURBOELECTRIC GATE PASSED (24 checks)
```

</details>

<details><summary><code>cpacs-export.mjs</code> — exit 0, 2157 ms</summary>

```
CPACS AND TRACEABILITY EXPORT GATE
========================================================================
  PASS  the vendored schema is the CPACS v3.5.1 release file  — 091e6dcf38c66e1e
  PASS  a Python with lxml is available to validate against the schema  — python
  PASS  liftcruise: valid CPACS 3.5.1
  PASS  hybrid: valid CPACS 3.5.1
  PASS  hybridPusher: valid CPACS 3.5.1
  PASS  tiltrotor: valid CPACS 3.5.1
  PASS  multicopter: valid CPACS 3.5.1
  PASS  sideBySide: valid CPACS 3.5.1
  PASS  …and the validator rejects a document missing a required mass
  PASS  liftcruise: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 3645.17, OEM 3190.18 + payload 455
  PASS  hybrid: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 2660.15, OEM 2205.15 + payload 455
  PASS  hybridPusher: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 2753.58, OEM 2298.57 + payload 455
  PASS  tiltrotor: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 2323.04, OEM 1868.04 + payload 455
  PASS  multicopter: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 2935.8, OEM 2480.8 + payload 455
  PASS  sideBySide: take-off mass, OEM + payload, and group sums all agree with the engine  — MTOM 2137.3, OEM 1682.3 + payload 455
  PASS  names are XML-escaped
  PASS  the header names the engine and the input hash
  PASS  a non-converged design is refused, not exported
  PASS  one traceability row per engine check  — 43
  PASS  met / not-met match the checks
  PASS  CSV quoting survives quotes, commas and newlines  — "CHK-001","A ""quoted"", label","criterion","NOT met","line1 line2 [SRC X, y]","[SRC X, y]"
  PASS  a check that cites nothing says so
  PASS  citations are extracted, not invented
  PASS  the app menu offers CPACS and traceability exports
  PASS  CI installs lxml before the gates run

EXPORT GATE PASSED (25 checks)
```

</details>

<details><summary><code>release.mjs</code> — exit 0, 142 ms</summary>

```
RELEASE GATE
========================================================================
  PASS  package.json version is Semantic Versioning 2.0.0  — 0.2.0-dev
  PASS  CHANGELOG.md has version sections  — Unreleased, 0.1.0
  PASS  every released section has an ISO date
  PASS  released sections are valid versions, newest first
  PASS  only Keep a Changelog change types are used  — Added, Changed, Fixed
  PASS  a -dev version is being prepared under [Unreleased] at the top
  PASS  the version being prepared is newer than the last release  — 0.2.0 vs 0.1.0
  PASS  CITATION.cff names the last released version  — 0.1.0
  PASS  …with that release's date  — 2026-09-01 vs 2026-09-01
  PASS  no source file hard-codes a version label
  PASS  the header, the report and screenshots show the build-stamp version
  PASS  the build stamp reads package.json
  PASS  user guide, theory manual, API reference and validation report exist
  PASS  the README links the user guide and the theory manual
  PASS  the user guide's tab table matches the tab registry  — 5 groups

RELEASE GATE PASSED (0.2.0-dev, in preparation)
```

</details>

<details><summary><code>aircraft-classes.mjs</code> — exit 0, 622 ms</summary>

```
AIRCRAFT-CLASS GATE
========================================================================
  PASS  the default class is eVTOL
  PASS  eVTOL sizes with the engine itself
  PASS  eVTOL defaults are DEFAULT_PARAMS itself
  PASS  eVTOL prepares inputs with engineInputs itself
  PASS  the registry and every entry are frozen
  PASS  class "evtol" is complete
  PASS  class "trainer" is complete
  PASS  class "transport" is complete
  PASS  class "bizjet" is complete
  PASS  class "turboprop" is complete
  PASS  eVTOL DEFAULT_PARAMS unchanged (content hash)  — now 062924df5fdaa0, pinned 062924df5fdaa0
  PASS  sizeDesign(eVTOL) equals the app's own call in every output  — 431 outputs
  PASS  an unknown class ("glider") is refused
  PASS  an unknown class ("") is refused
  PASS  an unknown class ("toString") is refused
  PASS  an unknown class ("__proto__") is refused
  PASS  an unknown class ("EVTOL") is refused
  PASS  sizeDesign refuses an unknown class instead of sizing an eVTOL
  PASS  an address with no ?class= opens the eVTOL sizer (every existing link)
  PASS  ?class=trainer opens the trainer
  PASS  an unknown ?class= is passed through to the error page, not turned into eVTOL
  PASS  the entry point mounts the class root, which renders <App /> unchanged in eVTOL mode
  PASS  an address with no mode opens eVTOL; ?mode=aircraft opens the aircraft studio
  PASS  older ?class= links open the studio on that type; an unknown class is an error, not eVTOL
  PASS  the eVTOL sizer reaches the aircraft engine only through the mode switch
  PASS  the eVTOL engine imports no class code
  PASS  only src/classes/ compares aircraftClass to a name
  SKIP  change fence — no git history or no master branch here

AIRCRAFT-CLASS GATE PASSED (27 checks)
```

</details>

<details><summary><code>trainer.mjs</code> — exit 0, 165 ms</summary>

```
TRAINER GATE
========================================================================

1. Implementation against NASA's own numbers
  PASS  fuselage (V.1.74, numerator form) reproduces Aviary's GASP case 18,763 lb  — 18762.3 lb
  PASS  wing (V.1.67-72, + sign in V.1.69) reproduces Aviary's GASP case 15,830 lb  — 15828.9 lb
  PASS  the material factor for that wing is Aviary's 1.2213063  — 1.2213063
  PASS  propeller (CR-114289 Table V) reproduces its Table III PA-28-235 calculation, 38.4 lb (±2%, Mach not given)  — 37.8 lb at sea-level Mach
  PASS  landing gear reproduces GASP Fig V.1.5, Cessna 172: 117 lb at 2,300 lb
  PASS  normal category: ultimate load factor is 1.5 × 3.8 when manoeuvre governs  — 5.699999999999999
  PASS  utility category: 1.5 × 4.4
  PASS  an unknown category is refused
  PASS  Loftin (6.20) is the maximum of the parabolic polar  — 11.224 vs 11.222
  PASS  Loftin Fig 6.28 power ratio falls with altitude and is 1 at sea level
  PASS  outside Fig 6.28 the power ratio is undefined, not extrapolated
  PASS  Breguet (6.40) fuel and range are inverses  — 499.99999999999983

2. Identities
  PASS  the default trainer converges  — 18 iterations
  PASS  gross = empty + payload + fuel  — 2605.3 vs 2605.3
  PASS  empty weight is the sum of its groups
  PASS  fuel = allowance + climb + cruise + reserve
  PASS  the wing area meets the stall requirement exactly
  PASS  sizeDesign dispatches the trainer class to its own loop
  PASS  more range needs a heavier aircraft
  PASS  more payload needs a heavier aircraft
  PASS  a non-numeric input is refused, not sized
  PASS  an impossible mission (5,000 nm) is reported as not converged, with a reason  — converged false, last gross 8263.8 lb
  PASS  a long but possible mission (1,200 nm) converges and closes  — 3697.9 lb

3. Validation against real trainers
  PASS  Cessna 172S: empty weight within ±12%  — 1567.3 lb vs 1663 (-5.8%); C172S POH: 2,550 lb, standard empty 1,663 lb, 174 ft², span 36 ft 1 in, 180 hp, 53 gal usable, length 27 ft 2 in. FAA TCDS 3A12: empty weight includes 18 lb unusable fuel and 15 lb oil
  PASS  Cessna Skyhawk (1976): empty weight within ±12%  — 1415.5 lb vs 1350 (4.8%); Loftin, NASA RP-1060 Table 5.I: 2,300 / 1,350 lb, b 35.0 ft, l 26.9 ft, S 175 ft², 150 hp O-320
  PASS  Piper Cherokee 180: empty weight within ±12%  — 1475.9 lb vs 1386 (6.5%); Loftin, NASA RP-1060 Table 5.I: 2,450 / 1,386 lb, b 32.0 ft, l 24.0 ft, S 170 ft², 180 hp O-360; rectangular wing
       mean absolute empty-weight error over 3 aircraft: 5.7%
       Loftin's empty weights do not say whether oil and unusable fuel are included; the C172S's do (TCDS 3A12).
       C172S sized from its own POH requirements (CLmax 1.879 derived from 48 KCAS at 2,550 lb, 174 ft²):
  PASS  C172S sizing converges
  PASS  C172S sizing: gross weight within ±5%  — 2605.4 vs 2550 (2.2%)
  PASS  C172S sizing: wing area within ±5%  — 177.8 vs 174 (2.2%)
  PASS  C172S sizing: empty weight within ±10%  — 1540 vs 1663 (-7.4%)
  PASS  C172S sizing: engine power within ±15%  — 158.6 vs 180 (-11.9%)
  PASS  C172S sizing: usable fuel within ±20%  — 265.4 vs 318 (-16.6%)
       power set by cruise (cruise 158.6 hp, climb 149.1 hp); Loftin Fig 6.28 gives 73.7% power available at 8,500 ft against the POH's 75% setting

4. Input provenance
  PASS  every trainer input has a status, a source, a label and a section
       assumed (no free source): taper, tcRoot, strutFraction, fuselageWidthFt, fuselageDepthFt, htAR, vtAR, tailTaper, tailTc, cwInstruments, cwHydControls
       C172S empty-weight change across each assumed input's full range:
         strutFraction      ±142.7 lb (9.1%)
         fuselageWidthFt    ±136.6 lb (8.7%)
         tcRoot             ±38.5 lb (2.5%)
         fuselageDepthFt    ±33.1 lb (2.1%)
         taper              ±27.9 lb (1.8%)
         tailTc             ±20.2 lb (1.3%)
         tailTaper          ±19 lb (1.2%)
         cwInstruments      ±17.3 lb (1.1%)
         htAR               ±17.1 lb (1.1%)
         vtAR               ±16.5 lb (1.1%)
         cwHydControls      ±9 lb (0.6%)
  PASS  the sensitivity survey covers every numeric assumed input

TRAINER GATE PASSED (34 checks)
```

</details>

<details><summary><code>transport.mjs</code> — exit 0, 1428 ms</summary>

```
TRANSPORT GATE
========================================================================

1. FLOPS port against FLOPS output (Aviary large_single_aisle_2, a 737-800 model)
  PASS  all 35 FLOPS weights reproduced within 0.1%  — worst instruments 0.079%
  PASS  wing bending material factor is FLOPS's 8.8294 (Eq 10 as Aviary computes it)  — 8.8291
  PASS  landing weight is 0.84 × gross (146,328 lb)
  PASS  nacelle wetted area is FLOPS's 228.34 ft² each (2.8 D L)
  PASS  without a landing ratio, FLOPS Eq 65 is used: 1 − 4e-5 × range

2. Identities
  PASS  the Loftin landing line, where selected, is still 0.107 × CLmax,L × s_LFL (Scholz 5.5)
  PASS  the shipped landing line is the 25.125 computation, not the fitted one  — 25.125 gives 506.4 kg/m² at MLW against Loftin's 529.6
  PASS  take-off T/W is (m/S) × 2.34 / (s_TOFL × CLmax,TO) (Scholz 5.10)
  PASS  second-segment T/W uses the 25.121(b) gradient for twins, 2.4%
  PASS  flap drag at CL 1.3 / 1.5 / 1.7 is Loftin's 0.01 / 0.02 / 0.03 (Scholz 5.21b)
  PASS  thrust lapse, Scholz 5.28 (per km) and 5.29 (per ft) agree
  PASS  the default transport converges  — 38 iterations
  PASS  gross = zero-fuel + mission fuel  — 173717.1
  PASS  wing area sits on the landing limit (to the closure tolerance)
  PASS  thrust meets every requirement  — take-off
  PASS  sizeDesign dispatches the transport class
  PASS  more range needs a heavier aircraft
  PASS  Loftin fuel fraction is 1 − exp(−(R + ΔR_reserve)/B) with the 500 nm increment  — 0.22408 vs 0.22409
  PASS  the reserve increment carries fuel (none gives a lighter aircraft)
  PASS  the regulatory fuel method carries more fuel than Loftin's
  PASS  an unknown fuel method is refused
  PASS  a single-engine transport is refused (the OEI rules need two or more)
  PASS  an impossible mission (30,000 nm) is reported as not converged, with a reason
  PASS  the fuel-volume constraint leaves an aircraft whose tanks already hold the mission untouched  — 8330 lb of spare capacity; gross differs by 0.001 lb against a 0.5 lb closure tolerance
  PASS  a 5,000 nm stage does not fit in the wing of a 737-800 sized to the landing limit  — needs 72578 lb, holds 71106 lb
  PASS  the constraint grows the wing until the fuel fits, and lowers the wing loading to do it  — wing 166.4 → 168.4 m², W/S 602.8 → 594.2 kg/m², capacity 32818 vs fuel 32818 kg
  PASS  growing the wing never raises the wing loading above the landing limit  — 594.2 vs landing limit 602.8 kg/m²
  PASS  the requirement is on by default, and tied to the aircraft's own cruise altitude  — default requirement 35000 ft, cruise altitude 35000 ft
  PASS  turning it off drops the line entirely
  PASS  at the cruise altitude the requirement is the cruise line plus the residual climb  — T/W 0.3227 against the cruise line's 0.2875; the industry audit computes 0.3227 for this aircraft
  PASS  on the shipped 25.125 line the bigger wing needs slightly less thrust at altitude  — T/W 0.3206 on a 130.7 m² wing, against 0.3227 on 126.0 m²
  PASS  a requirement the take-off line already covers does not change the aircraft  — thrust differs by 0.0000 lbf
  PASS  a higher initial cruise altitude governs the engine and grows it  — thrust 27909 → 35061 lbf, MTOW 78797 → 83357 kg
  PASS  the residual rate of climb is what makes it bite  — 300 ft/min: 0.3816, 0 ft/min: 0.3415
  PASS  with no buffet limit entered the omission is stated and nothing is assumed
  PASS  a buffet limit the design breaches is reported against the 1.3 g margin  — Buffet: at 35,000 ft and M 0.785 this wing flies at CL 0.575 at maximum take-off mass, so the 1.
  PASS  the statistical take-off line is still the default
  PASS  the 737-800's published field length is reproduced within 3 %  — 2157 m vs 2,195 m published (-1.7 %); Loftin on the same aircraft is +7.9 %
  PASS  the rejected take-off reaches a speed above V1, and stops from there  — V1 142.2 kt, highest speed reached 146.5 kt
  PASS  a longer interval to full braking makes the field longer, and none makes it shorter  — 0 s: 2087 m, 2 s: 2157 m, 3 s: 2195 m
  PASS  only the braked wheels retard it, so an all-braked aeroplane stops shorter  — 0.92 of the load braked: 2157 m, all of it: 2129 m
  PASS  the take-off line falls with engine count, which the statistical line cannot see  — T/W for a 2,500 m field at W/S 700: twin 0.304, quad 0.236; Loftin gives the same number for both
  PASS  the field length is balanced: accelerate-stop equals the take-off distance at the chosen V1  — accelerate-stop 2157 m, take-off distance 2157 m, V1 142.2 kt
  PASS  V1 lies between the stall speed and the rotation speed, as 25.107(e)(1)(i) requires  — V1 142.2 kt, VR 152.4 kt, VS 138.5 kt
  PASS  VEF is below V1 by the speed gained in the recognition interval (25.107(a)(2))  — VEF 140.2 kt against V1 142.2 kt
  PASS  a longer runway needs less thrust, and a shorter one more
  PASS  solving for the thrust that makes a field length inverts the field-length calculation  — T/W 0.3090 gives 2195.0 m
  PASS  thrust falls with speed along the run, so the method is not a static-thrust one  — deck gives 0.915 of static thrust at M 0.2
  PASS  sizing with it gives a thrust closer to the real engine than the statistical line does  — far25 1.7 % against loftin 2.2 %
  PASS  but it sizes the fleet lighter, which is the recorded reason it is opt-in  — over the 168-aircraft dataset, both with the cruise-altitude requirement on, the take-off-mass error is -0.0 % (MAE 8.8 %, 87 within 5 %) on the statistical line against -3.6 % (MAE 8.3 %, 84 within 5 %) here; run_default-2026-09-17f_loftinICA.txt against run_takeoffFar25-ICA-2026-09-17.txt

3. Validation
  PASS  Airbus A320-200 operating empty weight within ±8%  — 41489 vs 41310 kg (0.43%); Jenkinson Table 1 (secondary): OEW 41,310 kg at MTOW 73,500 kg, 122.4 m², span 33.91 m, CFM56-5A3 111.2 kN, 150 two-class seats; fuselage 37.57 × 3.95 × 4.14 m from Airbus AC A320 (primary). Seat split and cabin length assumed
  PASS  Airbus A320-200 range at MTOW within ±10%  — 2689 vs 2700 nm (-0.41%); Jenkinson Table 1 (secondary): design range 2,700 nm
  PASS  Boeing 737-800 operating empty weight within ±8%  — 94984 vs 91300 lb (4.04%); Boeing D6-58325-6 p.27 (weights, OEW, fuel), §3.3.95 (CFM56-7B27 at 27,300 lb); wing area 124.6 m² (Jenkinson) = the FLOPS model's 1,341 ft². Boeing's OEW is a "baseline mixed class configuration"; the FLOPS model's cabin is 12 first + 150 economy
       737-800 at 174,200 lb with the FLOPS model's weights: range 3103 nm (FLOPS design range 2,960; Boeing payload-range chart §3.2.13 ≈ 2,600-2,700 nm at this zero-fuel weight with 200 nm alternate and typical reserves, read from the chart)
       737-800 sized from its own requirements (many inputs from the same FLOPS model):
  PASS  737-800 sizing converges
  PASS  737-800 sizing: maximum take-off weight within ±5%  — 173717 vs 174200 lb (-0.28%)
  PASS  737-800 sizing: wing area within ±5%  — 1407 vs 1341 ft² (4.92%)
  PASS  737-800 sizing: thrust per engine within ±12%  — 27909 vs 27300 lbf (2.23%)
  PASS  737-800 sizing: operating empty weight within ±10%  — 96081 vs 91300 lb (5.24%)
  PASS  737-800 sizing: fuel capacity within ±8%  — 49489 vs 46063 lb (7.44%)
       thrust set by take-off; cruise L/D 18.84 → 17.52, S_wet/S 5.81
       with Scholz/Roskam segment fractions and 14 CFR 121.639 reserves instead: 197937 lb (13.63%) — the generic fractions are heavy for this aircraft

4. Input provenance
  PASS  every transport input has a status, a source, a label and a section
       assumed (no free source): cruiseAltFt, climbCasKt, descentCasKt, climbThrottle, alternateAltFt, alternateMach, vrOverVs, vlofOverVs, clGroundRoll, muBraking, brakeTransitionS, brakedWeightFraction, rotationTimeS, buffetClLimit, landingSpoilers, landingFreeRollS, vTouchdownOverVref, clMaxTakeoff, cruiseRatingFraction, fuselageFuelLb

TRANSPORT GATE PASSED (60 checks)
```

</details>

<details><summary><code>transport-mission.mjs</code> — exit 0, 307 ms</summary>

```
TRANSPORT MISSION AND LAYOUT GATE
========================================================================

1. Engine deck shape (NASA Aviary turbofan_28k)
  PASS  every deck row is reproduced exactly at its own Mach and altitude  — 101 rows
  PASS  sea-level static thrust ratio is 1 and the TSFC reference is M 0.8, 35,000 ft
  PASS  maximum thrust falls with altitude at M 0.8
  PASS  between deck altitudes the shape is interpolated linearly

2. Mission
  PASS  jet ISA: the engine's ISA to 11 km, then 216.65 K, pressure continuous, exponential decay  — 41,000 ft: 216.65 K, 17857 Pa
  PASS  ISA deviation above the tropopause shifts temperature only
  PASS  CAS equals true speed at sea level (250 kt → M 0.378)
  PASS  CAS → Mach inverts Mach → CAS (M 0.5-0.85, 10,000-39,000 ft)  — 290 kt CAS at 30,000 ft = M 0.767
  PASS  taxi fuel = idle fuel flow × taxi time
  PASS  take-off fuel = fraction × gross weight
  PASS  climb + cruise + descent distances = the stage length
  PASS  trip = taxi + take-off + climb + cruise + descent
  PASS  total = trip + contingency + alternate + final reserve
  PASS  the climb reaches the cruise altitude
  PASS  more range burns more fuel
  PASS  EASA contingency is 5% of trip fuel after take-off
  PASS  121.645 flag contingency is positive and grows with trip time
  PASS  121.639 domestic has no contingency
  PASS  the EASA final reserve is 30 minutes holding at 1,500 ft
  PASS  taxi fuel is burned before brake release (a longer taxi leaves a lighter aircraft to climb)
  PASS  every reserve policy flies the alternate
  PASS  an unknown reserve policy is refused
  PASS  a climb without enough thrust stops at a ceiling and says so
  PASS  climb burns fuel and covers ground
  PASS  below 10,000 ft the climb is flown at 250 kt CAS whatever the schedule says (14 CFR 91.117(a))
  PASS  a climb step follows TASOPT A.413 including the kinetic-energy term  — 868.2 m vs 868.2 m

3. Mission inside the jet sizing loop
  PASS  the mission method converges for the 737-800 defaults  — 38 iterations
  PASS  gross = zero-fuel + mission fuel (with reserves)
  PASS  analysis range: the mission at that range needs the fuel on board  — 3103 nm
  PASS  an unknown reserve policy is refused by the class

4. Engine location and tail volume
  PASS  engine splits: wing 2/0, aft 0/2, wing+tail 2/1, fuselage-3 0/3
  PASS  aft nacelle drag 0.0021 below M 0.76 and 0.0007 at M 0.82 (NASA TN D-3781); none for wing engines
  PASS  C_H = S_H l_H/(S c_MAC) and C_V = S_V l_V/(S b) give back 0.991 and 0.0793 (Scholz 2021 Eq 1, Table 2)
  PASS  wing-engine lever arm l_H/l_F = −0.00064 l_F + 0.502 (Eq 3)
  PASS  rear engines use Eq 4 lever arms, and a T-tail takes 4% off the coefficients
  PASS  rear engines need larger tails (shorter lever arms)
  PASS  business-jet coefficients are 0.694 / 0.0722
  PASS  aft engines lose the wing relief (FLOPS Eq 38) and add fuselage weight (Eq 56)
  PASS  FLOPS fuselage factor is (1 + 0.05 NEF) at a fixed gross weight
  PASS  a wing+tail layout needs three engines
  PASS  an unknown engine location is refused
  PASS  three-engine layouts size
  PASS  wing composite fraction: shear and control ×0.83, miscellaneous ×0.7, bending about ×0.6, no other group  — wing 15360 → 11227 lb
  PASS  the sizer passes the wing composite fraction to FLOPS

TRANSPORT MISSION GATE PASSED (44 checks)
```

</details>

<details><summary><code>transport-aero.mjs</code> — exit 0, 2705 ms</summary>

```
TRANSPORT DRAG BUILD-UP GATE
========================================================================

1. Tables and interpolation
  PASS  every table's FLOPS code is rows·1000 + columns  — 21 tables
  PASS  every grid is strictly ascending and every row is complete
  PASS  lagrange2 returns the table value at every grid point
  PASS  lagrange (second order) is exact for a quadratic, inside and beyond the grid

2. Design Mach and lift coefficient (test_premission_aero.py, FLOPS outputs)
  PASS  thin wing, M_max 1.2: M_des 0.753238, CL_des 0.909926  — 0.753238, 0.909926
  PASS  t/c 0.12, M_max 0.9 and 1.2: M_des 0.671145, CL_des 0.683002
  PASS  FLOPS design points within 0.001: LSA1 0.800/0.568, LSA2 0.799/0.523, N3CC 0.779/0.583  — 0.8002/0.5674, 0.7989/0.5227, 0.7788/0.5827

3. Skin friction (test_skinfriction_coef.py, test_skinfriction_drag.py)
  PASS  Sommer & Short T′ cf matches Aviary at 36 points to 1e-6  — worst 4.2e-7
  PASS  Reynolds number matches Aviary  — worst 2.5e-10
  PASS  skin-friction drag with laminar flow and 6 % excrescence: 14.91229, 15.01284  — 14.91229, 15.01284
  PASS  FLOPS excrescence allowance is 6 %
  PASS  body form factor is 1 from fineness 20, surface form factor rises with t/c

4. Pressure and compressibility drag (test_lift_dependent_drag.py, test_compressibility_drag.py)
  PASS  pressure drag, A outside the tables (edge interpolation)  — worst 1.9e-7
  PASS  pressure drag, A inside the tables (interpolation across A)  — worst 2.9e-7
  PASS  compressibility drag, M 0.2-1.1 through both table sets (within the 8-digit printout)  — worst |Δ| 4.9e-9
  PASS  wing compressibility scales with (1 + 0.1 · camber), below and above ΔM 0.05
  PASS  forward sweep adds the Warner Robins term (sweep in radians)  — M 0.85: 0.013344 (Aviary's degree slip gives 0.012448)
  PASS  DeYoung span-efficiency reduction: e = e₀(AR, λ) · E  — e₀ = 2.2736
  PASS  span efficiency input E ≤ 0.3 is an increment: E = 0.2 gives e = 1.2

5. Whole polar against FLOPS (test_computed_aero_group.py)
  PASS  large_single_aisle_1: 180 points, ‖Δ‖/‖FLOPS‖ ≤ 5 %; first 134 ≤ 0.4 %  — 0.92 %, 0.34 %; worst single point in the first 134 1.90 %
  PASS  advanced_single_aisle (N3CC): 165 points, ‖Δ‖/‖FLOPS‖ ≤ 5 %; first 134 ≤ 0.5 %  — 0.80 %, 0.47 %; worst single point in the first 134 2.00 %
  PASS  large_single_aisle_2: 165 points, ‖Δ‖/‖FLOPS‖ ≤ 5 %; first 134 ≤ 0.5 %  — 0.48 %, 0.48 %; worst single point in the first 134 1.43 %
  PASS  LSA1 characteristic lengths and fineness ratios match FLOPS's printout

6. The drag method in sizing and in the mission
  PASS  a polar given as CD(M, CL, h) flies the parabolic mission it describes, holding included  — hold fuel 778.341 vs 778.341 kg
  PASS  the mission evaluates the polar at each segment's own Mach
  PASS  FLOPS drag sizes the default aircraft; cruise CD is the build-up at the cruise CL  — L/D 16.92 (cf 18.18); CD0 0.02054, CDi 0.01206
  PASS  the aft-nacelle increment is added to the build-up
  PASS  the best L/D is the maximum of CL/CD at cruise Mach and height
  PASS  the segment mission flies the FLOPS polar  — mission cruise L/D 17.22
  PASS  analysis of an existing aircraft uses the drag method too  — 737-800 range 2886 nm (cf 3103 nm)
  PASS  the sized polar uses the span-efficiency input: CDi = CL²/(π A · 1.35)
  PASS  the polar is evaluated at the flight condition: thinner air, lower Reynolds number, more skin friction  — CDF 0.01846 at 25,000 ft, 0.01995 at 39,000 ft
  PASS  an unknown drag method is refused
  PASS  FLOPS drag inputs default to the 737-800 deck (AITEK 1.87, CAM 0.015, E 1.35)

TRANSPORT DRAG GATE PASSED (34 checks)
```

</details>

<details><summary><code>bizjet.mjs</code> — exit 0, 518 ms</summary>

```
BUSINESS-JET GATE
========================================================================

1. Method
  PASS  the registry sizes a business jet with the jet-transport loop and business-jet defaults  — MTOW 12544 kg, wing 41.7 m², 6894 lbf
  PASS  the payload is the carried passengers, not the seats
  PASS  no carried count means every seat: airliner weights unchanged
  PASS  carrying fewer passengers changes the payload and nothing else
  PASS  more installed seats mean more furnishings at the same carried load
  PASS  business-jet warnings state the NBAA and FLOPS limits

2. Published business jets
  PASS  Citation Latitude basic operating weight within ±15%  — 8838 vs 8462 kg (4.4%); Cessna Citation Latitude product card: BOW 8,462 kg (crew content not stated); EASA TCDS IM.A.033
  PASS  Citation Latitude range, 4 passengers within ±25%  — 2969 vs 2700 nm (10.0%); Cessna product card: 2,700 nm, 4 pax, high-speed cruise, NBAA IFR reserves
  PASS  Citation Longitude basic operating weight within ±15%  — 9931 vs 10705 kg (-7.2%); Cessna Citation Longitude product card: BOW 10,705 kg; HTF7700L 34.1 kN
  PASS  Citation Longitude range, 4 passengers within ±25%  — 4230 vs 3500 nm (20.9%); Cessna product card: 3,500 nm, 4 pax, M 0.80, NBAA IFR reserves. HTF7700L cruise TSFC not published; 0.70 assumed
  PASS  Pilatus PC-24 basic operating weight (one pilot) within ±18%  — 6077 vs 5243 kg (15.9%); Pilatus PC-24 fact sheet: BOW 5,243 kg, executive 6-seat, including one pilot; FJ44-4A-QPM 15.21 kN, 304 kg (EASA TCDS IM.E.016)
  PASS  Pilatus PC-24 range, 544 kg payload within ±35%  — 1324 vs 2000 nm (-33.8%); Pilatus: 2,000 nm with 6 passengers (544 kg), NBAA IFR, 100 nm alternate, LRC + 30 min. FJ44 cruise TSFC from the FJ44-1A (secondary)
       Citation Latitude sized from its requirements: MTOW 12544 kg (-10.2%), wing 41.7 m² (-17.2%), thrust 6894 lbf (16.7%), set by initial cruise altitude
  PASS  Citation Latitude wing loading from the landing constraint within ±15%  — 300.5 vs 277.2 kg/m² (8.4%); METHODS.md §8.4 Route A predicts 301.2 kg/m² (+9 %) with k_L 0.091 and CLmax,L 2.17

3. Input provenance
  PASS  every business-jet input has a status, a source, a label and a section
  PASS  every business-jet default is a value the sizer accepts
       assumed (no free source): businessClass, economyClass, cargo, cruiseAltFt, maxMach, climbCasKt, descentCasKt, alternateAltFt, alternateMach, wingSweep, wingTaper, wingTc, wingFuelFraction, airfoilTech, wingCamber, cfEquivalent, nacelleRefDiameter, nacelleRefLength, fuelTanks, fuselageHeight, passengerCompartmentLength, flightAttendants, galleyCrew, mainGearOleoIn, noseGearOleoIn, emptyMarginFraction

BUSINESS-JET GATE PASSED (15 checks)
```

</details>

<details><summary><code>aircraft-engine.mjs</code> — exit 0, 1618 ms</summary>

```
AIRCRAFT ENGINE GATE
========================================================================

1. The common result
  PASS  Piston trainer: sized and analysed results are the class's own  — MTOW 1182 kg, OEW 699 kg, wing 16.5 m²
  PASS  Piston trainer: zero-fuel + fuel = take-off mass, and the weight groups add to the empty mass
  PASS  Piston trainer: mission segments add to the mission fuel  — 120.4 vs 120.4 kg
  PASS  Turboprop airliner: sized and analysed results are the class's own  — MTOW 25397 kg, OEW 15659 kg, wing 68.1 m²
  PASS  Turboprop airliner: zero-fuel + fuel = take-off mass, and the weight groups add to the empty mass
  PASS  Turboprop airliner: mission segments add to the mission fuel  — 3278.2 vs 3278.2 kg
  PASS  Business jet: sized and analysed results are the class's own  — MTOW 12544 kg, OEW 8716 kg, wing 41.7 m²
  PASS  Business jet: zero-fuel + fuel = take-off mass, and the weight groups add to the empty mass
  PASS  Business jet: mission segments add to the mission fuel  — 3465.0 vs 3465.0 kg
  PASS  Jet airliner: sized and analysed results are the class's own  — MTOW 78797 kg, OEW 43581 kg, wing 130.7 m²
  PASS  Jet airliner: zero-fuel + fuel = take-off mass, and the weight groups add to the empty mass
  PASS  Jet airliner: mission segments add to the mission fuel  — 18669.6 vs 18669.6 kg
  PASS  an unknown aircraft type is refused

2. Matching chart
  PASS  Piston trainer: the design point meets every requirement drawn, and one of them binds  — closest curve 0.02 % from the design point
  PASS  Turboprop airliner: the design point meets every requirement drawn, and one of them binds  — closest curve 0.00 % from the design point
  PASS  Business jet: the design point meets every requirement drawn, and one of them binds  — closest curve 0.01 % from the design point
  PASS  Jet airliner: the design point meets every requirement drawn, and one of them binds  — closest curve 0.00 % from the design point
  PASS  take-off and cruise curves reproduce the class's own requirements at the design wing loading
  PASS  an analysis has no matching chart

3. Payload-range
  PASS  Piston trainer: the design payload at MTOW flies the design range  — 518.0 vs 518 nm (Maximum payload at MTOW)
  PASS  Piston trainer: the maximum payload is at least the design payload  — 363 vs 363 kg
  PASS  Piston trainer: range grows and payload falls along the diagram  — 0 nm/363 kg, 518 nm/363 kg, 622 nm/0 kg
  PASS  Turboprop airliner: the design payload at MTOW flies the design range  — 715.0 vs 715 nm (Maximum payload at MTOW)
  PASS  Turboprop airliner: the maximum payload is at least the design payload  — 6460 vs 6460 kg
  PASS  Turboprop airliner: range grows and payload falls along the diagram  — 0 nm/6460 kg, 715 nm/6460 kg, 1624 nm/3843 kg, 2023 nm/0 kg
  PASS  Business jet: the design payload at MTOW flies the design range  — 2700.0 vs 2700 nm (Maximum payload at MTOW)
  PASS  Business jet: the maximum payload is at least the design payload  — 363 vs 363 kg — MZFW ratio below the design payload, fell back to it
  PASS  Business jet: range grows and payload falls along the diagram  — 0 nm/363 kg, 2700 nm/363 kg, 3095 nm/0 kg
  PASS  Jet airliner: the design payload at MTOW flies the design range  — 2960.0 vs 2960 nm (Design payload at MTOW)
  PASS  Jet airliner: the maximum payload is at least the design payload  — 18975 vs 16546 kg
  PASS  Jet airliner: range grows and payload falls along the diagram  — 0 nm/18975 kg, 2428 nm/18975 kg, 2960 nm/16546 kg, 3818 nm/12767 kg, 4462 nm/0 kg

4. Polars and trades
  PASS  Piston trainer: the polar's best L/D matches the result's  — 12.19 vs 12.20 (grid 0.05 in CL); near-cruise CD 0.0366
  PASS  Turboprop airliner: the polar's best L/D matches the result's  — 16.43 vs 16.44 (grid 0.05 in CL); near-cruise CD 0.0360
  PASS  Business jet: the polar's best L/D matches the result's  — 19.44 vs 19.45 (grid 0.05 in CL); near-cruise CD 0.0249
  PASS  Jet airliner: the polar's best L/D matches the result's  — 19.03 vs 19.03 (grid 0.05 in CL); near-cruise CD 0.0317
  PASS  sensitivity: one case per numeric input, each changing only that input
  PASS  more design range gives a heavier airliner
  PASS  trade grid: rows by the second input, columns by the first, each point sized

5. Type comparison and reference aircraft
  PASS  the reference table holds only manufacturer or regulator values, each with its document  — 969 aircraft
  PASS  every type has an envelope from real aircraft  — trainer 36, turboprop 32, bizjet 70, transport 821
  PASS  70 seats, 800 nm, 300 kt: a turboprop is inside its envelope; a trainer is not  — turboprop MTOW 25905 kg; trainer: seats 70 is outside the 1-5 built in this type (36 reference aircraft)
  PASS  2 seats, 400 nm, 120 kt: below the airliner envelope, inside the trainer's
  PASS  the comparison sizes each type with its own method
  PASS  the reality check finds airliners near the default 737-800 class design  — A320 A320neo WV055 ACJ; A320 A320neo WV110 ACJ; 737 737-800BCF (converted freighter)
  PASS  the reality check compares against the same type only
  PASS  warnings and validation rows exist for every type
  PASS  the quoted mass-error bands equal the measured errors (trainer, turboprop, business jet)  — trainer 5.70 %, turboprop 7.08 %, bizjet 9.20 %

6. The studio
  PASS  every studio tab names a tab component that exists, with unique ids  — 22 tabs
  PASS  the input deck places every input of every type exactly once, and names only real inputs
  PASS  method-only inputs show for their method alone (Loftin increment, FLOPS drag inputs, tail ratios)
  PASS  no screen of the input deck shows more than 25 inputs at once  — largest 24
  PASS  the studio never imports the eVTOL engine


7. Uncertainty from the validation record
  PASS  the residual record is the whole validated fleet, one row per aircraft  — 168 aircraft
  PASS  the residuals are not Gaussian, which is why nothing is fitted to them  — 86 of 168 (51 %) within 5 %, against 35 % for a normal law with the same mean absolute error
  PASS  a design is given the band of its own stratum, not the fleet average  — 50 to 150 t, 2 engines (n=61) and 4-engine aircraft (n=32)
  PASS  a four-engine design is told its uncertainty is much wider than a twin's  — twin -13..7 %, four-engine -33..37 %
  PASS  the interval is an order statistic of real aircraft, so its ends are residuals that happened
  PASS  Piston trainer: three validation aircraft buy no interval, and it says so
  PASS  Turboprop airliner: three validation aircraft buy no interval, and it says so
  PASS  Business jet: three validation aircraft buy no interval, and it says so

8. Wing box structure
  PASS  shear and bending moment are zero at the tip and greatest at the root  — root 1065 kN, 8.31 MN.m
  PASS  both fall monotonically from root to tip, as a cantilever's must
  PASS  the Schrenk distribution integrates to the design lift on the semi-span  — 1449 kN against 1449 kN
  PASS  no station is stressed above the allowable it was sized against  — peak 404 MPa against Ftu 441 MPa
  PASS  a stronger alloy needs less cap material  — 2024-T3 9.4 mm, 7075-T6 7.1 mm
  PASS  a heavier load factor needs more
  PASS  the cover is counted once: box mass is the two covers and two webs, nothing more
  PASS  a mass comparison is only shown against a wing mass the model actually reports
  PASS  the classes that do report one get a signed comparison that has not been tuned to agree  — -35.1 % against the mass model's wing group; the non-box fraction is left at 0.64 rather than fitted
  PASS  every type either produces a finite analysis or says why it cannot
  PASS  a class with no ultimate load factor is refused rather than given a transport's  — the trainer carries no ultimate load factor and 3.75 is a Part 25 figure

9. Airfoil selection and risk
  PASS  Mason Eq. (7-4) reproduces the 747-100 and 777 calibrations  — 747 0.855 (cruises 0.84-0.85), 777 0.875 (cruises 0.84)
  PASS  thickness carries its full weight in the drag-divergence relation  — 8 % to 16 % thickness moves M_dd by 0.097; a /10 slip would give ~0.009
  PASS  the forward and inverse forms agree
  PASS  a real 737-class wing is called supercritical, not impossible  — needs A 0.927; margin in hand 0.014
  PASS  every section offered actually clears the swept-wing requirement
  PASS  a low-speed design is not told that zero sections suit it  — below M 0.5 drag divergence does not size the wing and no section is ranked against it
  PASS  no airfoil number is invented: a missing value stays null  — 53 sections, 15 with a measured M_dd
  PASS  the exceedance curve is drawn from the same aircraft as the interval  — 32 aircraft, "4-engine aircraft"
  PASS  exceedance falls as the threshold grows, and is a percentage
  PASS  a four-engine design is told it is in the method's weakest group
  PASS  no risk entry carries a likelihood score or a five-by-five cell
  PASS  a class validated on three aircraft is told so as a high risk, with no interval

10. Regulatory compliance
  PASS  the ICAO aerodrome reference code matches the real aircraft  — 737-class 4C, bizjet 2B, quad 4E
  PASS  three states, and an unevaluated requirement is never a pass  — 4 pass, 0 fail, 8 not evaluated
  PASS  every row names its verification method and product form
  PASS  every row cites a paragraph on both sides
  PASS  the panel refuses to call any of this a finding of compliance
  PASS  the amendment level is stated, because a regulation without one is a rumour
  PASS  the second-segment gradient uses the nE/(nE-1) factor of the requirement line  — 6.90 % at T/W 0.321 against a 0.231 line
  PASS  an internal weight inconsistency is reported as a failure, not smoothed over  — the business jet sizes light, so its ratio-derived MZFW sits below its own design payload
  PASS  rows the tool cannot feed are listed with a reason, not omitted  — V_MCG, the pressure-vessel factor and the exit/seat rule are named as not evaluated

11. Fuselage internal arrangement
  PASS  25.365(e)(2) reproduces its own arithmetic  — A_s 100 ft^2 -> P 0.040026, H_o 4.003 ft^2
  PASS  the 20 ft^2 cap in the rule is applied and reported  — A_s 400 ft^2 would give 35.2 ft^2, capped to 20
  PASS  no frame pitch is invented for the classes that have none  — bizjet and turboprop show the shell and leave the frames out
  PASS  a sourced frame pitch stays inside its sourced band  — transport 20.4 in in 20-21, trainer 16.3 in in 10-23
  PASS  the elliptical perimeter is right, checked against numerical integration  — worst relative error 4.1e-10 over 2:1 to circular
  PASS  the stringer count comes from the perimeter, not pi times a diameter  — here they agree to 0.06 %, but on a 2:1 section they differ by 9.0 %
  PASS  the skin panel is the two drawn pitches, and the panel count follows  — 519 x 233 mm, 2288 panels
  PASS  no attachment station claims to be sized  — 4 heavy frames, all declared conventions
  PASS  coincident attachment stations are one frame, not two  — 4 distinct stations on the business jet
  PASS  the unsourced members are listed with a reason instead of being drawn  — 10 features named and explained
  PASS  25.365 is not evaluated on a class with no pressurized compartment  — the trainer gets no pressure-vessel section rather than a silent pass

12. Balance, wing placement and the neutral point
  PASS  the mean aerodynamic chord matches the real aircraft  — 4.190 m against the 737-800's published 4.17 m — 0.5 %
  PASS  quarter-chord sweep is converted to leading-edge sweep, not passed through  — 25.03° at c/4 becomes 28.53° at the leading edge
  PASS  the wing placement hits the requested balance point exactly  — 15%→15.00%, 25%→25.00%, 35%→35.00%
  PASS  moving the balance point moves the wing, and aft CG means a wing further forward  — root LE 12.45 → 11.68 → 10.92 m as the target goes 15 → 35 % MAC
  PASS  the moment sum closes on the reported centre of gravity  — 27 masses, 43,374 kg
  PASS  the critical load fractions reproduce TASOPT's converged 737 case  — forward 0.45 against Drela's 0.47, aft 0.47 against 0.44 — a part-full cabin, which an empty-vs-full sweep misses entirely
  PASS  the static margin is reported as a bracket, and the slender-body bound is flagged as over-counted  — 14.2 % to -27.4 %; slender body returns 3.36× the 737 deck's calibrated C_MVf1
  PASS  the tail effectiveness carries the downwash and lands near TASOPT's own 737 value  — dCLh/dCL = 0.314 against 0.342 in runs/737/737.out
  PASS  engine-out yaw is evaluated on the multi-engine classes and refused on the single  — transport fin ×0.97 of requirement, turboprop ×0.90
  PASS  a propeller class gets its engine-out thrust from actuator-disc theory, not a missing field  — 31.0 kN from 2299 kW at V_MC
  PASS  the fin result declares that its speed basis makes it a minimum, not a size  — V_MC is taken at its regulatory ceiling, which is the least conservative end
  PASS  the engine-out control speed follows 25.149(c), not GASP's 1.2  — 1.13 V_SR — taking GASP's 1.2 would under-size the fin by 13 %
  PASS  the engine-out fin area reproduces the 737-class fin the area ratio gives  — required 26.9 m² against 27.7 m² fitted — -3.1 %

13. Flight envelope: V-n, gust, and which case governs
  PASS  the manoeuvre case governs on a transport, and by a wide margin  — n_gust 1.60 against n_man 2.50 at 123 lb/ft²
  PASS  the gust increment reproduces the research note's worked 737-400 case  — 1.75 against the note's 1.71 at V_C 340 kt
  PASS  the gust load factor rises as wing loading falls  — transport 1.60 at 123, bizjet 1.96 at 62 lb/ft²
  PASS  V_B/V_A agrees with the load factors it is built from, on the regulation's own velocity  — 0.859 against √(n_gust@U_ref)/√(n_man) = 0.859; the load uses U_ds and gives 1.60 instead of 1.84
  PASS  the gust envelope uses the current rule, so V_C is the critical gust speed  — V_B 1.50, V_C 1.60, V_D 1.38 — same U_ref B to C, halved at D
  PASS  the sea-level reference gust velocity is the mandatory 56.0 ft/s  — 56.0 at sea level, 44.0 at 15,000 ft, 20.86 at 60,000 ft
  PASS  the Part 23 class is refused a Part 25 envelope rather than given a plausible wrong one  — the trainer keeps its own Part 23 envelope in trainer/weights.js
  PASS  the manoeuvre diagram has all five boundaries and closes at V_D  — stall parabola, limit line, inverted parabola, −1 g plateau, and the V_C→V_D ramp to zero
  PASS  the gust method declares its bridge and its one unsourced number  — H = 12.5 c̄ is a construction, |C_N,min| is assumed, continuous turbulence is not evaluated

14. The landing line: CLmax is physical, and the Loftin pair is still a trap
  PASS  the landing constraint is computed from 25.125 by default, and CLmax is physical  — CLmax 2.35, the 737-800's own 1-g value from its published approach speed
  PASS  25.125 and 121.195 supply the speed factor, the screen height and the despatch factor  — V_REF >= 1.23 V_SR0, a 50 ft screen, and 60 % of the runway for despatch
  PASS  V_REF reproduces the 737-800's published approach speed  — 144 kt against the published 144 kt at maximum landing weight
  PASS  switching back to Loftin without moving k_L grows the wing, and the paired k_L restores it  — far25 130.7 m2; loftin at k_L 0.107 163.4; loftin at the paired 0.137 125.7
  PASS  both landing inputs still carry the pairing warning for anyone who switches back  — the trap is documented on both halves
  PASS  the landing braking coefficient is calibrated on the fleet and says so  — 0.50 on the fleet against 0.544 for the 737-800 alone

15. 25.343 fuel load cases on the wing box
  PASS  the MZFW-payload case is formed and governs over the design mission  — 8.307 against 8.095 MN·m, +2.6 % — and it carries 13,804 kg of wing fuel against the design mission's 15,869
  PASS  the governing case wins on less bending relief, not on more mass  — both at maximum take-off mass; only the wing fuel differs
  PASS  the box is sized to the governing case, not to the design mission  — root moment 8.307 MN·m
  PASS  the zero-wing-fuel case comes out lighter than the design mission, not heavier  — -6.5 % — the lost lift outweighs the lost inboard relief
  PASS  the +2.25 g case of 25.343(b)(1) is off by default and appears only when elected  — an election under 25.343(a), and a relaxation — leaving it out is the conservative choice
  PASS  a class that cannot form the 25.343 cases explains why instead of showing a short list  — turboprop reports no MZFW; the business jet's MZFW is below its own design zero-fuel mass

16. Control surfaces: the 25.415 ground gust, and what is refused
  PASS  25.415(b) reproduces its own arithmetic at 65 knots  — K 0.75, S 10 m², c 1 m → 5136.5 N·m
  PASS  the 1.25 and 1.6 factors compound to 2.0 and neither is silently dropped  — ×1.25 for limit control-system loads, ×1.6 for dynamic effects
  PASS  all six 25.415(c) hinge-moment factors are carried  — aileron 0.75 locked and 0.50 full throw; elevator ±0.75; rudder 0.75 both
  PASS  the aileron hinge moment is taken on one surface, not the published pair  — 7.84 m² for both → 3.92 m² per actuator
  PASS  the measured area spread is carried through to the actuator load  — aileron 3.5 to 5.8 kN·m about 4.4
  PASS  the roll criteria are the FAA's own numbers, with no military specification cited  — 25.149(h)(3) 20° in 5 s; AC 25-7D 30°→30° in 11 s at V2; 20°→20° in 8 s near V_DF
  PASS  roll capability is reported as unevaluated rather than estimated  — a time to bank from a fabricated effectiveness would be worse than none
  PASS  spoilers are refused with the regulation that forecloses them  — 25.459: their loads "must be determined from test data"
  PASS  no control surface is claimed to be sized  — size the tail, check the aileron and rudder, size nothing else

17. High lift: the section validates; the wing conversion is an extrapolation, and says so
  PASS  Olson Eqs. (3) and (4) reproduce their tabulated values  — c_f/c 0.30 gives theta_f 113.6 deg, alpha_delta 0.661
  PASS  DATCOM's sweep factor is its own closed form, and is 0.920 at zero sweep  — 0.920 / 0.868 / 0.780 at 0, 25 and 40 degrees
  PASS  DATCOM Eq. 6.1.4.3-b reproduces its own worked example  — 0.2522 against the printed 0.252 (whose own test value is 0.295, so DATCOM is 15 % low)
  PASS  the flapped fraction is an area extended to the centreline, not a span fraction  — 0.865 of the area against 0.64 of the span
  PASS  the section method reproduces NASA CR-2214's measured 2-D data within the research's band  — single-slotted +3.2 %, double-slotted -10.9 %, triple-slotted -9.6 %
  PASS  the wing level is decomposed by device, each through its own DATCOM equation  — trailing edge 0.960 (6.1.4.3-a) + leading edge 0.493 (6.1.4.3-b) = 1.453, an UPPER BOUND because DATCOM says the two cannot be added and gives no combination rule
  PASS  routing each device through its own equation beats the old combined route  — old route 3.34 (+42 %) against 2.75 (+17 %) now
  PASS  the wing-level result is recorded as STILL NOT closing on the real aircraft  — 2.75 against the 737-800's published 2.35, +17 % — reported beside the CLmax in use, not feeding it
  PASS  the module reports WHICH axes take the wing outside DATCOM's own database  — Figure 6.1.4.3-9's database is 35-60 deg sweep, A 2.9-8.0, taper 0.25-0.62, 1940s-50s NACA 6-series and circular-arc; a 737-800 at 25 deg, A 9.45, supercritical is outside it on 4 axes at once
  PASS  that database is sourced to the chart face and to Furlong & McHugh  — DATCOM 6.1.4.3 reference 1: "Tabulated data from 142 reports are presented in Reference 1"
  PASS  DATCOM's slat equation over-predicts the one measured 3-D slat increment, and that is recorded  — 0.875 against the EET model's measured 0.57 (+54 %) — DATCOM: the method "has not been substantiated beyond the test data that were used to formulate the method"
  PASS  TR 1339, the database DATCOM cites, reports that this correlation could not be found  — printed p. 1425, on the influence of sweep on the maximum-lift effectiveness of trailing-edge flaps; scope is partial-span split flaps at 60 deg on two aerofoil families, and the sweep effect is recorded as aerofoil-dependent — which a single-valued K_Lambda cannot express
  PASS  the non-additivity rule is carried from the SOURCE, not from DATCOM's restatement of it  — TR 1339 printed p. 1426 — the same finding DATCOM restates at 6.1.4.3-1
  PASS  K_Lambda's own ancestor is two-branched and its round-nose data stops near 45 degrees  — TR 1339 Figure 31, printed p. 1419: sharp-nosed wings RISE above 1.0 with sweep, round-nosed wings fall, and the round-nose zero-sweep denominator was estimated rather than measured
  PASS  the sweep FACTOR is not blamed at a transport's sweep, but is flagged beyond its data  — 25 deg is inside Figure 31's 15-45 deg round-nose data and is not flagged; 55 deg is
  PASS  the linear flapped-fraction form is flagged for the device class where TR 1339 shows it fails  — TR 1339 Figure 39: double-slotted is near-linear to 1.04 at 96 % span, split saturates at 0.39
  PASS  the Eq. (10) chord-referral contradiction is carried in the open, both values reported  — bare 1.280 against chord-referred 1.766; applying the referral takes the single-slotted CR-2214 case from +3.2 % to about +17 %, so the measurement contradicts it
  PASS  a leading-edge device replaces the section maximum lift rather than adding to it  — DATCOM: "Maximum lift increments of leading-edge and trailing-edge flaps cannot, in general, be added"
  PASS  the module declares that it is not wired into the sizing loop
AIRCRAFT ENGINE GATE PASSED (165 checks)
```

</details>

<details><summary><code>turboprop.mjs</code> — exit 0, 177 ms</summary>

```
TURBOPROP GATE
========================================================================

1. The published numbers the methods come from
  PASS  second-segment CL is CLmax,TO/1.2² = 1.46 (Scholz & Nita Table 2)  — 1.458
  PASS  missed-approach CL is CLmax,L/1.3² = 1.48 (Table 2)  — 1.479
  PASS  second-segment L/D is 12.28 at A 12 (Table 2)  — 12.306
  PASS  missed-approach L/D is 10.79 with 0.015 gear drag (Table 2)  — 10.807
  PASS  landing wing loading reproduces the ATR 72 design point, 373.7 kg/m² (Table 3)  — 372.9
  PASS  take-off power/mass at that wing loading reproduces 179.8 W/kg (Table 3) within 1%  — 181.1
  PASS  Emax is 15.74 (Table 2)  — 15.740
  PASS  at the paper's 3,888 m the lift equation gives its cruise CL 0.503 (Table 2) within 2%  — 0.497
  PASS  and L/D 12.49 (Table 2) within 1%  — 12.41
  PASS  the paper's altitude is within 0.3% of least cruise power (Schaufele lapse; the curve is flat)  — 180.3 vs 180.3 W/kg at 4141 m
  PASS  that cruise power/mass is the design point's 179.8 W/kg (Table 3) within 1%  — 180.3
       with the recommended "average" lapse: CL 0.492, L/D 12.33, 3805 m
       cruise power/mass there: 161.0 W/kg with the recommended "average" lapse, 180.3 with Schaufele's row; the paper's design point is 179.8 (the example appears to use a row other than the average)
  PASS  CR-114399 Table II reproduces the table's own class V weights within 3%  — DHC-7 342.7/344, 1500 HP 337.4/341, HP 137 155.7/156, Twin Otter 159.2/160
       DHC-7 actual propeller 377 lb (aluminium) / 320 lb (fibreglass): the equation gives 343 lb (-9.11% / 7.08%)

2. Identities
  PASS  landing wing loading is 0.137 × CLmax,L × s_LFL / (m_ML/m_MTO)
  PASS  V_APP = 1.64 √s_LFL and V2 = 1.2 × V_APP/1.3 × √(CLmax,L/CLmax,TO)
  PASS  second-segment power uses the 25.121(b) gradient for twins, 2.4%
  PASS  the power lapse is A M^m σ^n (equals A at M 1, σ 1)
  PASS  0.5 lb/hp/h is 0.0845 mg/(W·s) (Scholz Table 5.8 prints 0.085)  — 0.0845
  PASS  cruise fraction is exp(−R/B_s), B_s = E η/(SFC g) (Scholz 5.54-5.55)
  PASS  the Breguet method is cruise × alternate × hold, nothing else
  PASS  the 45-minute hold burns exp(−t V / B_s) (Nita eq 3.7.10, B_t = B_s / V)
  PASS  the Roskam method is Nita's product with start and taxi included
  PASS  the cruise altitude never exceeds the ceiling  — 1524 m
  PASS  no altitude below the ceiling needs less cruise power
  PASS  the default turboprop converges  — 27 iterations
  PASS  gross = zero-fuel + mission fuel  — 55991.9
  PASS  power meets every requirement  — take-off
  PASS  installed shp × engines = power/mass × gross  — to the closure tolerance
  PASS  engine = specific weight × shp and engine section = 0.338 × engine (GASP V.1.4, V.1.56)
  PASS  the propulsion group has propellers and no thrust reversers
  PASS  sizeDesign dispatches the turboprop class
  PASS  more range needs a heavier aircraft
  PASS  a lighter engine gives a lighter aircraft
  PASS  a longer take-off run needs less power
  PASS  the propeller type may arrive as text from the screen
  PASS  containerised cargo adds FLOPS's containers
  PASS  refused: {"cargoContainers":"0"}
  PASS  refused: {"numEngines":1}
  PASS  refused: {"numEngines":2.5}
  PASS  refused: {"powerLapse":"guess"}
  PASS  refused: {"propellerType":7}
  PASS  refused: {"sfcCruise":null}
  PASS  an impossible mission (20,000 nm) is reported as not converged, with a reason

3. Validation
  PASS  ATR 72-600 operating empty weight within ±18%  — 14935 vs 13010 kg (14.79%); ATR 72-600 factsheet (2020): MTOW 22,800 kg, OEW (tech. spec.) 13,010 kg, wing 61 m², 5,000 kg fuel, 72 seats, 758 nm with maximum passengers; EASA TCDS IM.E.041: PW127M 2,051 kW maximum take-off
  PASS  ATR 42-600 operating empty weight within ±8%  — 12063 vs 11550 kg (4.44%); ATR 42-600 factsheet (2020): MTOW 18,600 kg, OEW (tech. spec.) 11,550 kg, wing 54.5 m², span 24.57 m, length 22.67 m, 48 seats, 2,400 shp (one engine), 4,500 kg fuel
  PASS  Dash 8-400 operating empty weight within ±5%  — 18243 vs 17885 kg (2.00%); De Havilland Dash 8-400 specification sheet (2026): MTOW 29,574 kg, typical OEW 17,885 kg, 82 seats, 5,318 kg fuel, 360 kt at 25,000 ft; EASA TCDS IM.A.191: wing 63.1 m²; airport planning manual p.5: span 28.42 m, fuselage 31.04 m, cabin 18.80 m; EASA TCDS IM.E.049: PW150A 716.9 kg, 3,781 kW
  PASS  ATR 72-600 block fuel, 200 nm within ±15%  — 609 vs 638 kg (-4.61%); ATR 72-600 factsheet (2020): 200 nm block fuel 638 kg; typical in-service OEW 13,450 kg, maximum payload 7,550 kg
  PASS  ATR 72-600 block fuel, 300 nm within ±15%  — 919 vs 879 kg (4.60%); ATR 72-600 factsheet (2020): 300 nm block fuel 879 kg
  PASS  ATR 42-600 block fuel, 200 nm within ±20%  — 497 vs 584 kg (-14.86%); ATR 42-600 factsheet (2020): 200 nm block fuel 584 kg; typical in-service OEW 11,700 kg, maximum payload 5,300 kg
  PASS  ATR 42-600 block fuel, 300 nm within ±20%  — 751 vs 802 kg (-6.32%); ATR 42-600 factsheet (2020): 300 nm block fuel 802 kg
  PASS  Dash 8-400 trip fuel, 200 nm within ±20%  — 795 vs 696 kg (14.29%); Dash 8-400 specification sheet (2026): 200 nm trip fuel 696 kg; typical OEW 17,885 kg, 82 passengers at 102 kg
  PASS  Dash 8-400 trip fuel, 500 nm within ±45%  — 2034 vs 1478 kg (37.63%); Dash 8-400 specification sheet (2026): 500 nm trip fuel 1,478 kg
       with Roskam's segment fractions the ATR 72's 200 nm block fuel would be 1838 kg (188.01%)
       ATR 72 sized from the Scholz & Nita requirement (715 nm, 6,460 kg):
  PASS  ATR 72 sizing: maximum take-off mass within ±15%  — 25397 vs 22800 kg (11.39%)
  PASS  ATR 72 sizing: wing area within ±15%  — 68 vs 61 m² (11.65%)
  PASS  ATR 72 sizing: take-off power per engine within ±15%  — 2299 vs 2051 kW (12.10%)
  PASS  ATR 72 sizing: operating empty mass within ±25%  — 15659 vs 13010 kg (20.36%)
       power set by take-off; cruise 11386 ft, CL 0.471, L/D 12.87, S_wet/S 5.59
  PASS  systems factor 1 changes nothing
  PASS  the factor scales every systems item and nothing else
  PASS  fitted 0.858: ATR 42 within 0.5 %, then ATR 72 within +12 % and Dash 8-400 within 4 %  — ATR 42 -0.01%, ATR 72 9.73%, Q400 -2.32%

4. Input provenance
  PASS  every turboprop input has a status, a source, a label and a section
       assumed (no free source): wingSweep, wingTaper, wingTc, htAreaRatio, vtAreaRatio, activityFactor, fuelTanks, emptyMarginFraction, apuMassLb

TURBOPROP GATE PASSED (59 checks)
```

</details>

<details><summary><code>paper-claims.mjs</code> — exit 0, 28594 ms</summary>

```
PAPER CLAIM GATE
========================================================================
Checking 2 document(s): README.md, VFS-Forum-83-abstract.md

  ok   binding: lift+cruise ratio at 161 km 0.747
  ok   binding: multicopter ratio at 161 km 0.236
  ok   binding: hybrid ratio at 161 km  0.792
  ok   binding: lift+cruise crossover   114.6 km
  ok   binding: hybrid crossover        122.0 km
  ok   binding: hybrid pusher crossover 110.5 km
  ok   binding: tiltrotor crossover     114.3 km
  ok   binding: lift+cruise ratio at 10 km 1.485
  ok   binding: tiltrotor ratio at 10 km 1.110
  ok   binding: multicopter ratio at 10 km 0.548
  ok   binding: side-by-side ratio at 10 km 0.755
  ok   binding: multicopter at 5-min reserve 1.058
  ok   binding: side-by-side at 5-min reserve 1.433
  ok   side-by-side pitch damping Mq    −0.42
  ok   side-by-side roll damping Lp     −5.39
  ok   published comparisons            39
  ok   benchmark mean error             14.5%
  ok   L+C structures published         1170.3 kg
  ok   L+C structures predicted         867.4 kg
  ok   L+C structures error             −25.9%
  ok   L+C rotor published              430.0 kg
  ok   L+C rotor predicted              229.4 kg
  ok   L+C rotor error                  −46.7%
  ok   implied remainder published      740.3 kg
  ok   implied remainder predicted      638.0 kg
  ok   implied remainder error          −13.8%
  ok   quadrotor rotor error            −14.5%
  ok   rotor model MAE, 8 variants      25.1%
  ok   best rotor model in sweep        24.7%
  ok   registered outputs               450
  ok   validated outputs                16
  ok   golden master cases              277

PASS: all 32 numeric claims in paper/ are reproduced by the harnesses
```

</details>

<details><summary><code>vtol-autopilot.mjs</code> — exit 0, 1866 ms</summary>

```
VTOL AUTOPILOT GATE
==============================================================================

  4 winged configurations sized: liftcruise 9256 kg / Vs 41 · tiltrotor 9884 kg / Vs 43 · hybrid 2555 kg / Vs 40 · hybridPusher 2640 kg / Vs 41

  A WING IS THE PRECONDITION
  PASS  a configuration with no wing is refused, not exported  — a multirotor has no transition to describe; the drone half exports those
  PASS  a run with no stall speed is refused  — every VTOL parameter of consequence is an airspeed
  PASS  all four winged configurations build  — liftcruise, tiltrotor, hybrid, hybridPusher

  THE AUTOPILOTS' VTOL PARAMETERS ARE SCOPED TO SMALL UAVs
  PASS  PX4's transition airspeed is REFUSED, with the number that did not fit  — VT_ARSP_TRANS is published 0-30 m/s; this aircraft transitions at 49.2 m/s
  PASS  and so is the blending airspeed, for the same published reason
  PASS  ArduPilot's battery compensation is REFUSED at these pack voltages  — 222 cells in series is about 799 V; the parameter stops at 53 V
  PASS  nothing emitted anywhere is outside its own published range  — a clamped value would load cleanly and describe a different aircraft
  PASS  the range check itself refuses below, above and non-finite  — FW_AIRSPD_TRIM has no published bound, so it is not invented one

  THE AIRSPEEDS, AND WHOSE RULE EACH FOLLOWS
  PASS  AIRSPEED_MIN is 20 % above the computed stall speed, ArduPilot's own rule  — 41.02 -> 49.22 m/s
  PASS  Q_ASSIST_SPEED is 3 m/s below it, as its own description instructs  — ArduPilot has no transition-airspeed parameter, so this must not be presented as one
  PASS  PX4's stall, minimum and trim airspeeds all come through  — these carry no published range, so the aircraft's own numbers survive
  PASS  the transition speed is derived from a PUBLISHED margin, and says so  — PX4 publishes no margin rule of its own; its default 10 m/s is an absolute unrelated to the aircraft

  WHERE ARDUPILOT'S GUIDANCE CONTRADICTS ITSELF
  PASS  a design that cannot satisfy both halves of AIRSPEED_MAX is detected  — liftcruise: dive speed is under 1.5x AIRSPEED_MIN
  PASS  the note names the gap in m/s rather than waving at it  — and names what the documentation says it costs
  PASS  the emitted value follows the aircraft, not the rule it cannot meet  — the dive speed is a computed property; the 50 % rule is guidance

  DIFFERENT QUANTITIES, NOT DIFFERENT NAMES
  PASS  neither transition DURATION is emitted, and the refusal says why they differ  — PX4's is the whole transition; ArduPilot's is only the tail after minimum airspeed
  PASS  the back transition is refused on BOTH sides, as different physical quantities  — a deceleration and a duration cannot be cross-converted
  PASS  mass goes to PX4 and is reported as a gap for ArduPilot  — 9256 kg has nowhere to go in ArduPilot
  PASS  the hover-throttle refusal is the same one the multirotor exporter makes

  CONFIGURATION, MAPPED BY MECHANISM
  PASS  lift+cruise is a Standard VTOL and a tiltrotor is a Tiltrotor  — VT_TYPE encodes whether the rotors stop or tilt, which is how the engine defines these too
  PASS  a configuration PX4's catalogue cannot express is refused, not approximated  — tilting SOME rotors while stopping the others is neither Tiltrotor nor Standard
  PASS  ArduPilot still expresses those layouts, because it composes  — Q_ENABLE plus a frame class is not a catalogue lookup
  PASS  Q_FRAME_CLASS follows the hover rotor count  — the same enumeration Copter's FRAME_CLASS uses
  PASS  Q_FRAME_TYPE is refused, because a layout is not a sizing output  — guessing X would silently set the mixer
  PASS  a tilting configuration refuses the tilt parameters and says why  — which OUTPUTS tilt is a bitmask of a wiring decision, and lift+cruise tilts nothing

  THE FILES
  PASS  the .param file is NAME,VALUE with exactly one comma and no spaces  — 6 parameter lines
  PASS  the .params file is TAB separated with five columns and a type
  PASS  every parameter name fits MAVLink's 16-character param_id limit
  PASS  both files carry the refusals, which is the half a user cannot get elsewhere
  PASS  the header states the scoping problem rather than burying it
  PASS  the .param file carries the Mission Planner workflow warning
==============================================================================
VTOL AUTOPILOT GATE PASSED (31 checks)
```

</details>

<details><summary><code>drone-frames.mjs</code> — exit 0, 97 ms</summary>

```
DRONE FRAME GATE
========================================================================
  PASS  frames are present  — 25 frames
  PASS  provenance names a file, a commit and a hash  — AP_MotorsMatrix.cpp @ 9b81dd194b50
  PASS  every motor states CW or CCW
  PASS  frames with no stated rotation are listed, not dropped silently  — QUAD/NYT_PLUS, QUAD/NYT_X
  PASS  CW and CCW counts balance on every frame  — 25 frames balanced
  PASS  motor numbers are contiguous 1..N
  PASS  testing orders are contiguous 1..N
  PASS  motor number and testing order are distinct sequences  — 17 of 25 frames differ — e.g. QUAD/PLUS outputs 1,2,3,4 vs test 2,4,1,3
  PASS  every arm angle is finite and within (-180, 180]
  PASS  motorCount matches the motors listed
  PASS  coaxial pairs counter-rotate on ordinary coaxial frames  — 8 coaxial frames checked
  PASS  corotating (_COR) frames really do corotate within each arm  — 2 frames: X_COR, CW_X_COR
========================================================================
DRONE FRAME GATE PASSED (12 checks)
```

</details>

<details><summary><code>drone-components.mjs</code> — exit 0, 110 ms</summary>

```
DRONE COMPONENT CATALOGUE GATE
========================================================================
  PASS  catalogue is populated  — 105 entries
  PASS  every entry names a source URL  — 105 entries, all sourced
  PASS  every source URL is http(s)
  PASS  every entry is identifiable  — 105 entries named
  PASS  declared entry count matches the data  — meta says 105, data has 105
  PASS  no numeric field is NaN or Infinity
  PASS  every motor carries a known resistance-convention classification
  PASS  a published resistance keeps the vendor's printed label
  PASS  no motor is modellable on an UNDECLARED resistance convention
  PASS  every modellable motor states its no-load reference voltage
  PASS  every modellable motor has the full Kv + R + I0 triple
  PASS  modellable flag and its stated reasons agree
  PASS  MODELLABLE_MOTORS is exactly the flagged subset
------------------------------------------------------------------------
  flight_controllers      11 entries
  bldc_motors             24 entries
  propellers              13 entries
  escs                    10 entries
  power_distribution       8 entries
  batteries               10 entries
  radio_links             15 entries
  airframe_materials      14 entries
------------------------------------------------------------------------
  motor resistance convention, as the vendor stated it:
    undeclared           18
    phaseToPhaseDelta    3
    phaseToPhase         3
  first-principles modellable from the datasheet alone: 3 of 24
    KDE Direct KDE4014XF-380
    KDE Direct KDE4213XF-360
    KDE Direct KDE10218XF-105
========================================================================
DRONE COMPONENT CATALOGUE GATE PASSED (13 checks)
```

</details>

<details><summary><code>drone-rotor.mjs</code> — exit 0, 155 ms</summary>

```
DRONE ROTOR GATE
==============================================================================
  PASS  propeller database is present  — 262 propellers, 4145 measured rows
  PASS  the truth set states its own measurement uncertainty  — thrust 0.504 %, power 0.24 % — finer than the 5 % gate it enforces
  PASS  propellers that could not be read are listed, not dropped silently  — 2: magf_10x6_static_pg0728.txt, mas_11x6_static_kt0696.txt
  PASS  every diameter is physical for a small UAS propeller (20 mm - 1 m)  — 262 checked, 7 labelled in mm
  PASS  median cross-validated C_T error is well inside the gate  — 0.44 % across 3621 held-out points — the gate is 5 %
  PASS  at least 95 % of propellers are within 5 % at every held-out point  — 254 of 262 (96.9 %); 8 exceed it, worst 6.53 %
  PASS  no propeller exceeds 10 % even under leave-one-out  — worst 6.53 % — leave-one-out doubles the interpolation gap, so operational error is strictly smaller than this
        the 8 above 5 %, which are reported rather than excluded:
          mi_4x2.7_static_0564rd             worst 6.53 %  (median 1.53 %, n=19)
          gwsdd_2.5x0.8_spec2_static_0465rd  worst -6.30 %  (median 0.95 %, n=23)
          union_u80_static_0481rd            worst -6.20 %  (median 1.13 %, n=14)
          cfnq_45t2_static_1321rd            worst -6.16 %  (median 0.91 %, n=15)
          vp_140x45_static_0590rd            worst -6.13 %  (median 0.73 %, n=18)
          kavfk_9x6_static_2592rd            worst 6.09 %  (median 1.32 %, n=14)
          da4052_9x2.85_static_1055rd        worst -5.90 %  (median 1.33 %, n=20)
          da4022_5x3.75_3b_static_0690md     worst 5.43 %  (median 1.97 %, n=21)
  PASS  figure of merit is physical for every measured point (0.15-0.95)  — 4145 points; FM 0.154-0.854, median 0.539
  PASS  within the micro-rotor scope (tip Re < 70k), FM respects the published ceiling  — 7 of 1764 points above FM 0.66 (Winslow's highest reported for tip Re < 70,000)
        above that scope (2381 points, tip Re >= 70k) FM reaches 0.854 on large APC propellers — outside the quoted bound's stated domain, so not asserted against it
  PASS  below the measured range is flagged, not silently estimated
  PASS  above the measured range is flagged, not silently estimated
  PASS  a measured RPM is reported as measured
  PASS  an impossible thrust request returns null with its measured range
  PASS  C_T rises with RPM on the great majority of propellers  — 257 of 262 (98 %) — the Reynolds lapse, which is why a constant C_T is not used
------------------------------------------------------------------------------
  a single constant C_T per propeller would drift a median 15.9 % across its own tested RPM range,
  exceeding 5 % on 249 of 262 propellers. Interpolating the measurements gives 0.44 %.
------------------------------------------------------------------------------
  worst 12 propellers by cross-validated C_T error (full distribution, not a mean):
  propeller                            n   med C_T  worst C_T  worst C_P
  mi_4x2.7_static_0564rd              19     1.53%      6.53%     -7.05%
  gwsdd_2.5x0.8_spec2_static_0465rd   23     0.95%     -6.30%    -10.41%
  union_u80_static_0481rd             14     1.13%     -6.20%      5.68%
  cfnq_45t2_static_1321rd             15     0.91%     -6.16%     15.94%
  vp_140x45_static_0590rd             18     0.73%     -6.13%     -3.67%
  kavfk_9x6_static_2592rd             14     1.32%      6.09%      5.81%
  da4052_9x2.85_static_1055rd         20     1.33%     -5.90%      4.57%
  da4022_5x3.75_3b_static_0690md      21     1.97%      5.43%      5.23%
  da4052_9x6.75_static_1041rd         17     0.77%     -4.76%     -4.15%
  apcsp_10x10_static_2665rd           14     1.42%      4.54%      5.27%
  da4002_9x4.76_static_1120ga         17     0.51%     -4.46%     -4.12%
  apcsp_10x7_static_2654rd            14     0.62%     -4.43%     -4.20%
------------------------------------------------------------------------------
  propellers by worst cross-validated C_T error:
         0-1 % : 67
         1-2 % : 89
         2-3 % : 54
         3-5 % : 44
        >= 5 % : 8
==============================================================================
DRONE ROTOR GATE PASSED (14 checks)
```

</details>

<details><summary><code>drone-motor.mjs</code> — exit 0, 105 ms</summary>

```
DRONE MOTOR GATE
==============================================================================
  PASS  measured truth set is present  — 419 rows across 4 motors
  PASS  every motor's workbook is hashed, so the rows can be re-derived  — 2814:ce07a6cc 4213:1b5c8341 6213:01ca344e 7215:1f8a99e1
  PASS  every motor's constants carry the URL they were transcribed from
  PASS  the rejected row is listed rather than silently dropped  — KDE4213XF-360 at throttle 0.75: tip Mach 4.09 — a typo in a vendor table
  PASS  the thrust column is NOT flagged as sea level  — measured at an implied 1.1170 kg/m^3, 9.7 % below ISA sea level
  PASS  KDE's stated test conditions are recorded as mutually inconsistent
------------------------------------------------------------------------------
  what the PRINTING RESOLUTION alone costs, before any model error:
    torque printed to 0.01 Nm  ->  eta_motor uncertain by
    median 0.02 %, p90 0.29 %, p99 1.67 %, worst 2.79 %
    rows above 1 %: 9   above 2 %: 4   above 5 %: 0
  PASS  the truth set's own resolution is finer than the 5 % target  — worst row 2.79 % — a tighter gate than this would be measuring the rounding
------------------------------------------------------------------------------
  vendor constant self-consistency — Kt = 9.5493/Kv and Km = Kt/sqrt(R).
  If a vendor's own printed triple satisfies these, the R it prints IS
  the R the standard model wants, and no convention conversion applies.
  motor               Kt d%    R d%
  KDE2814XF-515      -0.23%   0.35%
  KDE4213XF-360      -0.10%   0.19%
  KDE6213XF-185      -0.03%   0.10%
  KDE7215XF-135      -0.05%   0.08%
  PASS  published Kv, Kt, Km and Rm are mutually consistent on every motor  — worst deviation 0.35 % across 8 identities
  PASS  every truth-set motor states its resistance convention  — Rm (Phase to Phase Resistance Delta Wound)
  PASS  every truth-set motor's no-load current carries its reference voltage  — all at 10 V — the survey also found 18, 22 and 24 V in use
------------------------------------------------------------------------------
  why catalogue motors are held back from the loss model:
     18  resistance convention not stated by the vendor
      3  no no-load current
  PASS  the module accepts exactly the motors the catalogue marks modellable  — 3 of 24 motors — the rest are held back, not guessed at
  PASS  a motor with no stated convention is REFUSED, not silently modelled  — attempting to build constants from an undeclared entry throws
  PASS  every accepted motor builds constants with a real resistance and I0  — KDE4014XF-380, KDE4213XF-360, KDE10218XF-105
  PASS  the loss split closes: P_elec = P_mech + I^2R + I0*backEMF  — worst residual 0.089 % — the gap is Kt vs 9.5493/Kv rounding
  PASS  efficiency is an OUTPUT, never an input
  PASS  a non-physical operating point is refused rather than returned
------------------------------------------------------------------------------
  THE FALSIFIABLE TEST. The model's P_motor against the MEASURED bus power.
  Bus power is printed to the nearest watt, so a row is only counted as a
  real violation when it exceeds P_bus by more than that half-digit.
  motor               thr    rpm   P_motor   P_bus  over by
  KDE2814XF-515     0.875   7370     147.5     142    3.88%
  KDE2814XF-515     1.000   8090     190.6     185    3.02%
  KDE2814XF-515     0.625   5550      65.7      64    2.68%
  KDE6213XF-185     0.500   2720     245.6     245    0.23%
  PASS  every hard violation sits in a block already flagged by the VOLTAGE audit  — 3 of 4; two tests sharing no inputs point at the same block
------------------------------------------------------------------------------
  is POWER INPUT a third measurement, or V x AMPERAGE?
  motor             cells    n  busW/(V*A)
  KDE2814XF-515         4   21      1.0061
  KDE2814XF-515         6   14      0.9998
  KDE4213XF-360         4   14      0.9999
  KDE4213XF-360         6   42      0.9997
  ... 14 blocks in all
  PASS  POWER INPUT is derived from the voltage LABEL, not measured  — so a block with a wrong voltage label has a wrong power column too, invisibly
------------------------------------------------------------------------------
  KDE2814XF-515 4S — what each per-cell voltage in use would give:
    V/cell   packV  rows needing more V  rows over bus  worst ratio
      3.70    14.8                    4              3       1.0382
      4.20    16.8                    1              0       0.9146
      4.35    17.4                    0              0       0.8830
  PASS  the printed 3.70 V/cell is the LiPo NOMINAL, and it breaks physics  — 4 rows need more voltage than the pack, 3 exceed the bus power
  PASS  4.20 V/cell — the CHARGED voltage all 13 other blocks use — removes both  — 1 and 0; worst ratio falls 1.038 -> 0.915. A substitution taken from the data set, not fitted
  PASS  the model is NOT falsified once that block is set aside  — one KDE6213 row remains, 0.6 W on a 245 W row — inside twice the printing resolution
  PASS  nothing in the data was corrected to achieve that  — the true test voltage is stated nowhere on the sheet; the block is excluded, not rewritten
  PASS  no row was quietly excused by rounding  — every row over bus power is over it by more than the half-digit, so none is hidden
------------------------------------------------------------------------------
  the residual charged to the ESC, by duty band:
  duty            n  eta_motor   eta_esc
  0.00-0.35      51      85.0%     72.2%
  0.35-0.50      83      87.4%     79.8%
  0.50-0.65     102      89.1%     84.8%
  0.65-0.80     106      89.3%     85.3%
  0.80-1.20      77      89.8%     88.5%
  PASS  the residual is ORDERED by duty rather than arbitrary  — corr(duty, eta_esc) = 0.535 — a wrong motor model would leave an arbitrary residual. What SHAPE it has is a separate question the ESC gate answers, and neither a series resistance nor a diode-drop form survives there
  PASS  predicted motor efficiency stays physical on every row  — 65.2-93.4 %, median 89.0 %
  PASS  the ESC residual is never above unity except on the pinned rows
------------------------------------------------------------------------------
  pack-voltage label audit — rpm/Kv is a floor on supply voltage,
  and it uses only Kv and the measured RPM.
    KDE2814XF-515 4S: printed 14.8 V (3.7 V/cell) but 8090 rpm needs 15.71 V — 6.1 % short
  PASS  exactly one test block prints an impossible pack voltage  — 13 of 14 blocks print 4.20 V/cell (LiPo charged); this one prints 3.70 (nominal)
  PASS  the anomaly is reported, not corrected  — the true test voltage is not recoverable from the sheet, so no value is invented
  PASS  every other block's printed voltage clears the back-EMF floor  — 14 blocks checked
  PASS  an operating point inside the vendor's ratings is reported as such  — 7.9 A against a published 38 A continuous
  PASS  an operating point beyond the vendor's ratings is caught  — 94.7 A exceeds the published 38 A
  PASS  an unstated limit reads as unknown, never as unlimited
==============================================================================
DRONE MOTOR GATE PASSED (32 checks)
```

</details>

<details><summary><code>drone-esc.mjs</code> — exit 0, 108 ms</summary>

```
DRONE ESC GATE
==============================================================================
  PASS  the table is built from the measured rows, not a stored copy  — 397 rows used of 419
  PASS  the excluded rows are excluded for stated physical reasons  — 1 where the model already exceeds bus power, 21 in the block whose printed pack voltage is impossible
  PASS  no sample has an above-unity residual  — an ESC dissipates; it does not generate
------------------------------------------------------------------------------
  REJECTION 1 — Dai, Quan, Ren & Cai (T-Mech 2019) Eqs. (31)-(32):
    P_bus - P_motor = I_m^2 R_e, with R_e ONE CONSTANT per ESC.
  Solve for R_e on every row and see whether it is constant.
  duty band       n   R_e mean  I_m mean
  0.00-0.35      50     0.9430       5.5
  0.35-0.50      79     0.7316       9.8
  0.50-0.65      98     0.3443      17.3
  0.65-0.80     102     0.2043      27.2
  0.80-1.01      68     0.1764      26.1
  PASS  Dai's R_e is NOT constant on this data, so the series model is refused  — R_e drifts 5.3x from lowest to highest duty band; the model requires 1.0x
  PASS  the drift has the same sign on every motor independently  — 2814 3.3x, 4213 4.9x, 6213 5.4x, 7215 3.7x
------------------------------------------------------------------------------
  REJECTION 2 — P_bus - P_motor = I_m^2 R_e + (1-duty) V_f I_m.
  A silicon body diode drops ~0.7-1.0 V, a Schottky ~0.3-0.5 V.
  motor                  R_e      V_f
  KDE2814XF-515       0.1960    4.224
  KDE4213XF-360       0.1066    3.189
  KDE6213XF-185       0.1409   -0.261
  KDE7215XF-135       0.2443   -2.817
  PASS  the fitted diode drop is non-physical, so the two-term form is refused  — 4 of 4 motors fit V_f outside 0.2-1.5 V (4.2, 3.2, -0.3, -2.8 V) — including negative values, which are not diodes
  PASS  both rejections are recorded in the module with the number that rejected them
------------------------------------------------------------------------------
  PASS  the residual is real signal, not the printing resolution  — worst band: rounding is 6 % of the loss — so the models were rejected by data, not by noise
------------------------------------------------------------------------------
  the measured table, with the spread that forbids a single number:
  duty            n  motors   median     p10     p90   spread
  0.20-0.30      25       3    73.0%   61.9%   83.9%    22.0
  0.30-0.40      45       4    72.2%   63.1%   84.8%    21.6
  0.40-0.50      59       4    80.7%   69.0%   87.6%    18.6
  0.50-0.60      62       4    84.8%   79.0%   88.9%     9.9
  0.60-0.70      68       4    86.6%   76.7%   91.0%    14.3
  0.70-0.80      70       4    86.6%   75.3%   91.6%    16.3
  0.80-0.90      50       4    88.5%   80.9%   94.2%    13.3
  0.90-1.00      18       4    88.2%   84.2%   91.1%     6.9
  PASS  the residual rises with duty across the table  — 73 % at low duty to 88 % near full
  PASS  every band draws on more than one motor, so the spread is real disagreement
  PASS  the band is carried, not just the median  — widest band is 22 points p10-p90 — a single number there would be a fiction
  PASS  a fixed efficiency would be materially wrong, which is why a table exists  — a constant 84 % is 17 % off the measured median at its worst duty
------------------------------------------------------------------------------
  PASS  the module states the residual is NOT an ESC efficiency  — contains ESC loss AND motor-model error, inseparably — one measurement, two unknowns
  PASS  an out-of-range duty is flagged, never returned as an estimate
  PASS  a non-physical duty is refused rather than returned
  rectification mode across the catalogue: 1 synchronous, 0 diode, 9 not stated
  PASS  rectification mode is read only from an explicit statement  — BLHeli_32 and AM32 default to complementary PWM, but neither page states it and the setting is user-configurable — inferring it would be a guess dressed as a datum
  PASS  applying the table to an ESC of unstated mode always warns
  PASS  applying it to a synchronously rectified ESC warns about the direction
  PASS  a pack that cannot drive the point is reported infeasible, not clamped  — an ESC steps down, never up
  PASS  bus power exceeds motor power, and the band brackets it
  PASS  an unstated ESC rating reads as unknown, never as a pass
  PASS  an ESC rating that IS published is enforced
  PASS  the ESC under test is named, with its rectification setting  — KDE-UAS125UVC — one controller, one firmware, one set of conditions
==============================================================================
DRONE ESC GATE PASSED (23 checks)
```

</details>

<details><summary><code>drone-battery.mjs</code> — exit 0, 107 ms</summary>

```
DRONE BATTERY GATE
==============================================================================
  PASS  the whole-vehicle truth set is present  — 7 vehicles, 7 packs
  PASS  every vehicle and pack carries the URL it was read from
  PASS  a rotor count nobody publishes is null, not inferred  — 6 of 7 vehicles do not state how many rotors they have — recorded as null, never guessed
------------------------------------------------------------------------------
  does Ah x V_printed reproduce the published Wh?
  pack                         Ah*V   pub Wh      err   V/cell
  dji-tb60                    313.4      274    14.4%     4.40
  dji-tb65                    263.2    263.2    -0.0%     3.73
  dji-mavic3                   77.0       77     0.0%     3.85
  dji-p4p-v2                   89.2     89.2     0.0%     3.80
  dji-wb37                     37.4    37.39     0.0%     3.80
  autel-abx41d                136.5    136.5     0.0%     3.69
  freefly-alta-x-pack         710.4        -        -     3.70
  PASS  exactly one surveyed pack's printed voltage contradicts its energy  — dji-tb60 at 14.4 % — the other packs agree to the digit, so this is a defect and not a convention
  PASS  the anomaly is diagnosable from the SAME vendor's own other page  — TB60 prints 4.40 V/cell; the Mavic 3 page separately prints "Charging Voltage Limit 17.6 V" = 4.40 V/cell. Same number, named
  PASS  and the published energy recovers the nominal the other packs use  — 274 Wh over 5.935 Ah implies 3.85 V/cell, matching the Mavic 3's stated nominal 3.85 V/cell
  PASS  a per-cell voltage at or above the LiPo charged value is not a nominal  — the 3.6-3.95 V/cell band is what separates them
------------------------------------------------------------------------------
  PASS  published energy is used even when the printed voltage disagrees  — the energy figure is not the one at fault
  PASS  and the disagreement is reported rather than absorbed  — a caller is told the voltage field cannot be used for this pack
  PASS  a consistent pack produces no warning at all
  PASS  energy is DERIVED only when the voltage field looks like a nominal  — Freefly publishes no Wh but prints a genuine 3.70 V/cell nominal alongside a separate peak
  PASS  deriving from a charge-limit voltage is REFUSED, not attempted  — with no published Wh and 4.40 V/cell printed, the module returns null and says why
------------------------------------------------------------------------------
  PASS  usableFraction has NO default — the call throws without one  — no manufacturer in this survey publishes a cut-off, so there is no defensible default
  PASS  an out-of-range usable fraction is refused
  PASS  two cited criteria are offered, and they disagree in KIND  — Dai's 0.85 capacity fraction vs Bauersfeld's 3.5 V/cell — the latter carries no fraction because converting it needs a discharge curve nobody publishes
  PASS  usable energy scales with pack count and the declared fraction  — 2 x 274 Wh = 548 Wh, 465.8 Wh usable at 0.85
  PASS  endurance names every simplification it rests on  — 46.6 min at 600 W — constant power, fresh pack, room temperature, no rate derating
  PASS  an unpublished discharge limit reads as unknown, never as a pass
  PASS  a published discharge limit is enforced, and the C rate is reported
------------------------------------------------------------------------------
  PASS  every catalogue pack converts into the module's shape  — 10 of 10 — the catalogue is snake_case, the truth set camelCase, and reading the wrong field would silently report "not published"
  PASS  an unrecognised pack shape is refused rather than silently hollow
  PASS  the computed C rating is kept separate from a published one  — a computed rating must never become a vendor claim the vendor never made
------------------------------------------------------------------------------
  implied power at FULL pack — an upper bound, since no vendor
  here states a usable fraction:
  vehicle                      basis     W/kg
  Alta X                    unstated     86.9
  Matrice 350 RTK             cruise     88.8
  Matrice 300 RTK             cruise     94.9
  Mavic 3                      hover    129.1
  Phantom 4 Pro V2            cruise    129.7
  Mavic 3E                     hover    132.9
  EVO Max 4T V2                hover    132.9
  PASS  hover-basis vehicles are separated from cruise-basis ones  — 3 publish a hover time, 3 publish only a "max flight time", 1 states no basis at all
  PASS  every hover-basis vehicle quotes a hover time in its own words
  PASS  the hover-basis set is tight enough to be worth scoring against  — 129.1-132.9 W/kg across three aircraft from two manufacturers
  PASS  basis alone does NOT explain the low cluster, and the file says so  — the Phantom 4 Pro V2 is cruise-basis at 129.7 W/kg, inside the hover cluster — the two low aircraft are also the two LARGEST, so basis and disc loading are confounded in this sample
  PASS  no vehicle's pack energy was derived where the vendor published one
==============================================================================
DRONE BATTERY GATE PASSED (27 checks)
```

</details>

<details><summary><code>drone-sizing.mjs</code> — exit 0, 123 ms</summary>

```
DRONE SIZING GATE
==============================================================================
  PASS  no 15x5.5 propeller exists in the measured database  — so NASA's GAMMA octocopter — measured inertia, KDE4213-XF motors — cannot be reproduced
  PASS  the Alta X rotor is outside the measured diameter range  — measured span 2.2-21.0 in; the Alta X, which publishes the best endurance data in the survey, uses 33 in
  PASS  most surveyed aircraft do not state their rotor count  — so even a mass-only comparison lacks the rotor count it would need
------------------------------------------------------------------------------
  PASS  every declared input states why it cannot be defaulted  — structureMassKg, usableFraction, avionicsMassKg, avionicsPowerW, thrustToWeightRequired
  PASS  omitting ANY declared input is refused, not defaulted  — 5 of 5 — structure mass alone is the second largest mass in the vehicle, so a guessed fraction would silently set the answer
  PASS  structure mass is declared because nobody publishes one  — only the Alta X publishes an empty weight, and it bundles motors, ESCs, props and avionics
------------------------------------------------------------------------------
  PASS  a well-posed design converges  — converged in 15 iterations, MTOM 4.091 kg
  PASS  the mass identity closes: MTOM = payload + structure + avionics + propulsion + battery  — residual 0.0e+0 g
  PASS  the thrust identity closes: N rotors each lift MTOM*g/N
  PASS  the energy identity closes: packs cover the mission at the declared fraction  — 1 pack of 279 Wh gives 33.3 min against 15 required
  PASS  the endurance band is ordered and straddles the nominal  — 30.3 < 33.3 < 34.9 min, from the ESC layer's MEASURED joint-residual band — the only uncertainty here derived from measurement rather than declared
  PASS  hover throttle fraction agrees with the thrust ratio  — 33 % of the measured maximum
  PASS  the thrust ceiling says which limit binds  — the propeller's maximum MEASURED rpm — not a physical ceiling, the edg
------------------------------------------------------------------------------
  PASS  a payload beyond the propeller's measured thrust is REFUSED  — apce_14x7_static_1006od needs 103.32 N per rotor; its measured range delivers 0.39-30.54 N betwe
  PASS  the refusal quotes the measured range it would have had to leave
  PASS  a pack that cannot drive the motor is REFUSED, not clamped  — an ESC steps down, never up
  PASS  a rotor count below three is refused
  PASS  a propeller with no published mass makes the build unmassable, and says so  — UIUC records geometry and performance, not mass
------------------------------------------------------------------------------
  PASS  more payload gives more all-up mass, monotonically  — 3.79 -> 4.09 -> 4.39 -> 4.69 kg
  PASS  thinner air costs more power at the same mass  — 428 W -> 455 W -> 487 W at 0, 1500, 3000 m
  PASS  ISA density falls with altitude and starts at 1.225  — 1.2250 -> 0.9091 kg/m^3
  PASS  a longer mission buys STRICTLY more battery, across a pack boundary  — 1 pack / 1.45 kg for 15 min -> 3 packs / 4.35 kg for 45 min
------------------------------------------------------------------------------
  the seven surveyed aircraft span 86.9-132.9 W/kg at full pack.
  this design computes 104.5 W/kg at a disc loading of 101.0 N/m^2.
  PASS  the computed specific power lands inside the range real aircraft exhibit  — 104.5 W/kg inside 69.5-159.5. A BRACKET, not a validation: inside proves nothing, outside would prove something wrong
  PASS  figure of merit lands in the band measured for small rotors  — FM 0.796 — Bohorquez and Winslow measure roughly 0.37-0.66 on micro rotors, and this propeller is far larger than their Reynolds scope
------------------------------------------------------------------------------
  PASS  a pack assembled from cells multiplies series, parallel and energy correctly  — INR-21700-P42A 6S3P: 279.0 Wh, 21.6 V, 1449 g
  PASS  assembled energy comes from the cell's PUBLISHED Wh, not from Ah x V  — immune to the charged-voltage error by construction
  PASS  pack mass states that interconnect, BMS and case are excluded
  PASS  assembling from a cell with no established energy is refused
  PASS  a non-integer cell count is refused
------------------------------------------------------------------------------
  PASS  the loop reports HOW it ended, never just the last iterate  — "converged" — the eVTOL side learned this when a non-converged multicopter returned a plausible number with its convergence flag quietly false
  PASS  the iteration history is kept for inspection
==============================================================================
DRONE SIZING GATE PASSED (31 checks)
```

</details>

<details><summary><code>drone-trade.mjs</code> — exit 0, 1076 ms</summary>

```
DRONE TRADE GATE
==============================================================================
  4000 combinations evaluated, 637 met the mission
  PASS  the enumeration produces a candidate set  — 637 feasible designs
  PASS  every rejected candidate keeps its reason  — 3363 rejected across 5 distinct reasons — a study that silently drops candidates has a conclusion about its filter
  top rejection reasons:
     2170  propeller cannot make the required thrust
      524  mission not met: thrustToWeightMet
      373  pack cannot drive the motor at this operating point
      162  mission not met: thrustToWeightMet, packWithinLimits
  PASS  the study says whether it searched or sampled  — stopped at the 4000 candidate budget — the space is larger than this and the res
------------------------------------------------------------------------------
  PASS  nothing on the front is dominated by anything  — 18 of 637 designs are undominated
  PASS  everything OFF the front is dominated by something  — so a design can be discarded without taking a position on the weights
  PASS  the front is identical under every weighting — it takes no position  — weights are applied to the RANKING, never to the front
------------------------------------------------------------------------------
  PASS  the ranking orders the front by score
  PASS  the ranking carries its normalisation and its caveat
  PASS  the ranking reports how firm its winner is  — massKg:×0.05 enduranceMin:×0.05 thrustMargin:×0.05
  PASS  some weight can change the winner, so the sensitivity is real  — 3 of 3 objectives can flip it
  PASS  weighting mass against endurance selects different designs  — mass-first picks 2.79 kg / 21.1 min, endurance-first picks 3.83 kg / 46.9 min — the same trade, resolved two ways, which is why the front is shown first
  PASS  a ranking with no positive weight is refused
------------------------------------------------------------------------------
  PASS  an objective every candidate ties on contributes nothing, not NaN  — a zero-span axis cannot discriminate, and dividing by its span would be a divide by zero
  which objectives actually discriminate:
    massKg                      2.79 ..      3.83   yes
    enduranceMin               12.14 ..     46.94   yes
    thrustMargin                2.02 ..      7.54   yes
    hoverPowerW               234.97 ..    733.97   yes
    specificPowerWPerKg        83.84 ..    193.34   yes
  PASS  the study reports which objectives discriminate
  PASS  cost is NOT an objective  — the catalogue records no prices; an invented axis would dominate a study otherwise built on measurement
  PASS  every objective names where its number comes from  — massKg, enduranceMin, thrustMargin, hoverPowerW, specificPowerWPerKg
------------------------------------------------------------------------------
  PASS  every kept design carries the real parts it was built from  — a trade study over abstract points would not be checkable
  PASS  every kept design met its mission
  PASS  the chosen ESC is within its PUBLISHED rating on every design  — an ESC with no published rating is not silently accepted
------------------------------------------------------------------------------
  front spans 2.79-3.83 kg and 18.9-46.9 min
==============================================================================
DRONE TRADE GATE PASSED (19 checks)
```

</details>

<details><summary><code>drone-airframe.mjs</code> — exit 0, 109 ms</summary>

```
DRONE AIRFRAME GATE
==============================================================================
  PASS  the smallest gap on an even quad is 90 degrees
  PASS  the wrap at 360 is handled  — 350 to 10 is 20 degrees, not 340
  PASS  an uneven set reports its SMALLEST gap, not its average
------------------------------------------------------------------------------
  frame                   N   min gap  even 2pi/N   arm mm  even mm  verdict
  OCTAQUAD/PLUS           8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  OCTAQUAD/X              8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  OCTAQUAD/H              8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  OCTAQUAD/CW_X           8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  OCTAQUAD/BF_X           8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  OCTAQUAD/X_REV          8      90.0        45.0      277      511  even-ring would UNDER-size by -85 %
  PASS  some shipped frames are NOT evenly spaced, so 2pi/N is the wrong gap  — 10 of 25 frames have a smallest gap different from 360/N
------------------------------------------------------------------------------
  PASS  every frame in the database builds an airframe  — 25 frames
  PASS  no two discs overlap at the computed arm length, on any frame  — tightest pair is OCTA/PLUS at 35.6 mm of tip clearance
  PASS  the declared tip gap is actually delivered  — 10 % of a 14.0 in disc is 36 mm, and the tightest pair has 35.6 mm
  PASS  a 5 % shorter arm DOES overlap, so the minimum is genuinely minimal  — the bound is tight, not conservative padding
------------------------------------------------------------------------------
  PASS  coaxial frames are built, not refused  — 10 of 25 frames stack two motors per arm — every OCTAQUAD and DODECAHEXA
  PASS  a coaxial pair is separated in z, not spread around the ring  — eight motors on four arms, stacked
  PASS  disc area counts ARMS, not motors  — two stacked rotors sweep one disc of air — the reason a pair is not worth two isolated rotors
  PASS  every coaxial frame carries the warning that its thrust is unsupported  — UIUC measured isolated rotors; the lower disc works in the upper's wake and no correction exists here
  PASS  a non-coaxial frame carries no such warning
  PASS  tip gap must be declared, with no default  — tip clearance is a structural and acoustic choice; no vendor in the survey publishes theirs
  PASS  rotors sharing an azimuth are a coaxial arm, not an error  — two arms at 0 and 180, each carrying two stacked motors
  PASS  a frame with only ONE distinct azimuth is refused  — there is no ring to space, and dividing by the gap would be a divide by zero
------------------------------------------------------------------------------
  PASS  the rotation preserves length, so the view can be measured off  — worst deviation 2.2e-16 — an orthographic view is only measurable if this holds
  PASS  a projected disc is a closed path of finite points  — sampled rather than approximated by guessed ellipse parameters
  PASS  nothing projects to NaN
  PASS  depth sorting orders rotors back to front
------------------------------------------------------------------------------
  PASS  yaw balance is computed per frame and reported either way  — 25 of 25 frames have equal CW and CCW, so their hover reaction torques cancel
  PASS  an unbalanced frame says what that costs rather than being corrected
  PASS  every motor survives with its azimuth and spin unchanged from the flight code  — the view draws ArduPilot's table, not a redrawing of it
  PASS  x is forward and y is right, matching the azimuth convention  — azimuth is clockwise from the nose, so 0 is forward and +90 is right

  SOLIDS AT PUBLISHED DIMENSIONS
  PASS  a cell dimension string parses to its two published numbers  — 21.55 x 70.15 mm, as printed
  PASS  an unreadable or absent dimension is REFUSED, never defaulted  — a cell drawn at an assumed size would read as a measurement
  PASS  the cell layout uses the pack's own series and parallel counts  — 18 cells for a 6S3P pack
  PASS  cells are laid out symmetrically about the body centre  — the pack's centroid sits on the centre, not off to one side
  PASS  no layout is produced without both a pack and a published size
  PASS  a cylinder's ring measures its published diameter across  — a 21 mm radius ring is 42 mm across, so the solid is the published part
  PASS  the cylinder body extends UPWARD, against z-down  — z is down in the body frame, so a seated part rises to negative z
  PASS  the swept annulus is two rings in one path, so the hub shows through  — with fill-rule evenodd it is the area the blades sweep, not a filled disc
  PASS  shading changed no geometry: the disc is still the measured radius  — gradients and opacity move no vertex
==============================================================================
DRONE AIRFRAME GATE PASSED (33 checks)
```

</details>

<details><summary><code>drone-dynamics.mjs</code> — exit 0, 1779 ms</summary>

```
DRONE DYNAMICS GATE
==============================================================================
  PASS  the controller gains come from a published ArduPilot frame file  — ArduPilot Tools/Frame_params, Hexsoon EDU450, Copter 4.0.0, md5 0a1e07214c11…
  PASS  every unsourceable input must be declared, with no default  — motorTimeConstantS, bodyDragCoefficient, bodyReferenceAreaM2
  PASS  the inertia tensor is labelled a derivation, with its caveat  — no commercial multirotor in the survey publishes one to check it against
------------------------------------------------------------------------------
  PASS  the inertia tensor satisfies the triangle inequalities  — Ixx 0.0641, Iyy 0.0641, Izz 0.1266 kg m² — a planar multirotor should also have Izz largest, and it does
  PASS  with the rotors off, acceleration is exactly g  — 9.806650000 m/s² downward
  PASS  at thrust equal to weight, nothing accelerates  — collective balances gravity and the moments cancel, which is what a balanced spin set means
  PASS  angular momentum is conserved under zero torque  — drift 1.2e-13 % over 2 s of free rotation — this is what catches a sign error in omega x J omega
  PASS  the attitude quaternion stays normalised
------------------------------------------------------------------------------
  perturbation growth: about Imin 0.010, about Imid 6.250, about Imax 0.010 rad/s
  PASS  the intermediate axis is unstable and the other two are not  — the tennis-racket theorem falls out of omega x J omega — nothing in the code is told it
  PASS  halving the step reduces the error by about sixteen  — ratio 16.1 — fourth order predicts 16
------------------------------------------------------------------------------
  PASS  an undisturbed hover holds its altitude and attitude  — 2.000 m, max tilt 0.00°
  PASS  a 20 degree roll upset is recovered  — back inside 2° within 4 s, altitude held at 3.00 m
  PASS  a commanded 180 degree yaw is achieved  — 179.9° of 180 commanded
  PASS  an unattainable moment demand is SCALED, not clamped and not abandoned  — a rotor produces lift or nothing. ArduPilot scales a saturated demand and prioritises attitude over yaw; abandoning the axis is only correct when it is unattainable at ANY scale
  PASS  an axis unattainable at any scale IS dropped  — a quadrotor with a dead rotor cannot produce yaw at any magnitude — that is rank, not saturation
------------------------------------------------------------------------------
  ROTOR LOSS: two independent methods, no shared arithmetic.
  frame                   ACAI    sim, hover                sim, upset
  QUAD/X                 false     lost axes      lost axes, 181° tilt
  HEXA/X                 false          held                      held
  OCTA/PLUS               true          held                      held
  PASS  quadrotor: both methods say a rotor loss is unrecoverable  — ACAI uncontrollable, and the simulation loses yaw and drifts 175° — three inputs cannot span four axes at any thrust margin
  PASS  octorotor: both methods say a rotor loss is survivable  — ACAI controllable; the simulation keeps flying through a 20° upset with a rotor dead, bounded and holding altitude. It oscillates, because the gains are ArduPilot's for a quadrotor — that is tuning, not controllability
  PASS  hexacopter: ACAI finds it FULL RANK but uncontrollable  — Du et al.'s published counter-intuitive result, reproduced on a PNPNPN hexacopter
------------------------------------------------------------------------------
  attainable moment by DIRECTION, with one rotor dead (400 directions):
  frame          worst Nm   best Nm     blocked      ACAI
  QUAD/X           0.0000      0.00     400/400    -0.691
  HEXA/X           0.0000     13.19     200/400     0.000
  OCTA/PLUS        0.4435     19.53       0/400     0.922
  PASS  the direction sweep reproduces ACAI's verdict on all three frames  — an independent method - binary search through the allocator - agrees with the zonotope geometry
  PASS  the quadrotor can produce NO moment at all with a rotor dead  — 400 of 400 directions blocked, ACAI -0.691
  PASS  the hexacopter blocks HALF its directions and sits exactly on the boundary  — 200 of 400 directions unattainable and ACAI exactly 0.000000 — Du et al.'s PNPNPN case lies ON the controllability boundary
  PASS  and that is why a flying scenario does NOT disprove it  — the hexacopter flies every scenario here with a rotor dead while HALF of all moment directions are unattainable. A simulation samples only the directions its scenario happens to demand; ACAI bounds the whole attainable set. Passing a scenario is not controllability, which is why the simulation does not supersede the test

  SCENARIOS THE USER BUILDS
  PASS  a held tilt accelerates at g*tan(theta)  — 15° gives 2.628 m/s², unopposed by anything but drag
  PASS  every shipped preset builds, and its segments sum to its duration  — 7 presets, each editable from the panel
  PASS  segments are held in order, and the last one holds to the end  — a scrubber past the end must not fall off the last segment
  PASS  an altitude rate ramps, where a bare altitude steps  — descend at 1 m/s is a different command from go to 1 m
  PASS  a scenario that runs away says so, with the acceleration it implies  — the panel shows this instead of the view silently zooming out to fit 91.6 m
  PASS  a level scenario reports no drifting segment  — a roll upset is recovered from, not commanded, so nothing is held
  PASS  nonsense is refused with a reason, never silently accepted  — a duration of zero or a 75° tilt is a typo, not a flight
  PASS  the tilt cap is justified, not arbitrary  — past 60° the thrust vector is nearer horizontal than vertical
  PASS  a user-built scenario is indistinguishable to the integrator  — simulate takes it through the same path as a shipped scenario

-- Stabilize coasts; Loiter stops. The trajectory must show it --
  PASS  STABILIZE: levelling does NOT stop it -- no position loop is closed  — still 7.95 m/s six seconds after levelling, 73.1 m downrange
  PASS  a user-built scenario cannot ask for LOITER at all  — makeScenario refuses it rather than downgrading it to a coast
  PASS  and the withdrawal records what was measured, not just that it failed  — holds 27 s then diverges; stable only at k <= 0.1 of ArduPilot's gain, which cannot track
  PASS  a released stick in LOITER still diverges over 150 s, as recorded  — reaches 29° of tilt and 1.3 m/s from a standing hover on QUAD/X — an unstable cascade amplifying numerical noise, not a disturbance
  PASS  and it is quiet for long enough that a short test would pass  — under 0.01 m/s for the first 10 s, which is why the 14 s checks this replaces passed
  PASS  the braking numbers are ArduPilot's, not chosen here  — AC_Loiter.cpp non-Heli: brake 2.5 m/s^2 after 1 s, jerk 5 m/s^3
  PASS  and so are the velocity PID gains  — AC_PosControl.cpp Copter defaults: PSC_VELXY_P 2.0, I 1.0, D 0.25, PSC_POSXY_P 1.0
==============================================================================
DRONE DYNAMICS GATE PASSED (38 checks)
```

</details>

<details><summary><code>drone-risk.mjs</code> — exit 0, 181 ms</summary>

```
DRONE RISK GATE
==============================================================================
  PASS  the residual set is held-out predictions over the measured database  — 3621 leave-one-out points across 262 propellers
  PASS  only INTERPOLATED predictions are scored, never a clamped one  — 3621 scored against a ceiling of 3621 interior points — scoring the extrapolation the module refuses to perform would flatter it
------------------------------------------------------------------------------
  stratum: all 262 measured propellers
  n 3621, median -0.015 %, median |err| 0.412 %, p95 |err| 2.26 %, worst 6.5 %
     |err| >        P
      0.50 %   43.7 %
      1.00 %   21.3 %
      2.00 %    6.8 %
      3.00 %    2.5 %
      5.00 %    0.3 %
  PASS  the exceedance curve starts at essentially 100 % and falls to zero  — P(|err| > 0) = 99.8895 % — 4 of 3621 held-out points are reproduced exactly, so they do not exceed zero. P(|err| > 7.0 %) = 0
  PASS  the curve is monotone non-increasing, as a count of residuals must be
  PASS  no distribution parameter appears anywhere in the result  — the curve is counts of measured residuals — there is nothing to fit and nothing is fitted
  PASS  the curve is labelled as describing the ROTOR layer only
  PASS  a propeller with too few held-out points falls back to the whole database  — ance_8.5x6_static_2848cm has 14 points; a 95th percentile over that is an order statistic, not a percentile
  PASS  a propeller with enough points is scored on its own  — da4022_5x3.75_3b_static_0690md has 21 points
  PASS  the database-wide distribution is always reported alongside  — so a propeller worse than the database is visible: database median |err| 0.412 %, p95 2.26 %
------------------------------------------------------------------------------
  HIGH    The sizing loop has never been scored against a real drone
  HIGH    Structure mass is declared, and nothing publishes one
  HIGH    No single rotor loss is survivable on this frame
  MEDIUM  Usable pack fraction is declared, and the cited criteria disagree in kind
  MEDIUM  The motor/ESC split is the model's own output, not a measurement
  MEDIUM  This ESC does not state its rectification mode
  MEDIUM  This pack's printed nominal is coarser than its energy figure implies
  LOW     Cross-validated accuracy of the rotor layer
  PASS  the register leads with the absence of any whole-vehicle validation  — otherwise the exceedance curve would be left to imply a band that does not exist
  PASS  that entry names why no validation is possible
  PASS  every entry carries evidence and a consequence  — 8 entries
  PASS  no entry carries a likelihood, probability or score  — NASA publishes no five-by-five matrix, and NASA/SP-20240014019 p. 74 states the qualitative form can no longer be considered valid
  PASS  severity is one of three words, used only for ordering  — ordered high to low, and never multiplied by anything
------------------------------------------------------------------------------
  PASS  a coaxial frame raises the coaxial finding, and a planar one does not  — OCTAQUAD stacks two motors per arm; OCTA does not
  PASS  the quadrotor raises the rotor-loss finding with its structural reason  — no single rotor loss is survivable at any thrust margin
  PASS  the octorotor does NOT raise it  — ACAI finds every single failure survivable on this frame
  PASS  a consistent pack raises no voltage-field finding  — INR-21700-P45B reproduces its published Wh exactly
  PASS  a charge limit in the nominal field is raised as HIGH  — 4.20 V/cell in the nominal's place — the defect DJI's TB60 makes, at +14.4 %
  PASS  a merely coarse nominal is raised as MEDIUM, not HIGH  — the default Molicel P42A is -2.45 % out because its label is coarser than its energy figure implies; that is worth reporting but changes no answer
  PASS  the register differs across designs rather than being a fixed list  — 9 distinct findings across three designs, against 8 on any one — an entry that appears for every design is not a finding about the design
  PASS  the structure-mass finding quantifies its own consequence  — A 20 % error in the declared 0.60 kg moves all-up mass by about 0.12 kg before the loop re-close
  PASS  the usable-fraction finding quantifies endurance at both cited values  — Endurance scales directly with it: at 0.80 this design gives 31.3 min, at 0.90 35.2 min, against
==============================================================================
DRONE RISK GATE PASSED (23 checks)
```

</details>

<details><summary><code>drone-avionics.mjs</code> — exit 0, 121 ms</summary>

```
DRONE AVIONICS GATE
==============================================================================
  PASS  the free-space constant is derived, not remembered  — 32.4478 from 20 log10(4 pi / c) with c in km/s — the textbook 32.44 rounded
  PASS  FSPL doubles-distance at 6.02 dB, as an inverse-square law must  — 6.0206 dB per doubling
  PASS  dBm and mW round-trip  — 1000 mW = 30 dBm
  PASS  the range solution inverts the path-loss equation exactly  — 130.67 km at zero margin closes to the sensitivity
  PASS  a 20 log10(2) dB budget increase doubles the range exactly  — 6.0206 dB doubles it; a flat 6 dB gives 1.9953x
------------------------------------------------------------------------------
  15 radios: 1 state conducted vs EIRP, 4 carry only a hint, 2 publish no power, 7 publish no range
  PASS  almost no vendor states whether its power is conducted or radiated  — only RFDesign (RFD) RFD900x radio modem — and it says so by giving the conversion formula and quoting the FCC EIRP ceiling separately
  PASS  a regulatory coincidence is recorded as a HINT, never promoted to a statement  — 4 products whose figure coincides with a limit expressed in radiated power; a hint about what a vendor probably meant is not a statement
  PASS  EIRP is REFUSED where the convention is unstated  — a single range figure for an unstated radio would be a guess wearing a decimal point
  PASS  EIRP is refused for a CONDUCTED figure with no antenna gain published  — EIRP = conducted - cable loss + antenna gain, so the gain is not optional
  PASS  EIRP IS computed when the convention and the gain are both known  — 30 dBm conducted + 3 dBi = 33 dBm EIRP
  PASS  the bracket width is exactly the assumed antenna gain in range terms  — every bracket spans x1.2589 for 2 dBi — the cost of the missing statement
------------------------------------------------------------------------------
  every published range against its own free-space ceiling:
  radio                                stated   ceiling    ratio
  ExpressLRS (open-source project)      40 km    390 km    0.103
  Team BlackSheep (TBS) TBS CROSSFI     15 km   6129 km    0.002
  Holybro SiK Telemetry Radio V3, 1    0.5 km    464 km    0.001
  Holybro SiK Telemetry Radio V3, 5      1 km   1037 km    0.001
  Holybro SiK Telemetry Radio 1W (L     50 km   1466 km    0.034
  RFDesign (RFD) RFD900x radio mode     40 km    165 km    0.243
  RFDesign (RFD) RFD868x radio mode     40 km    173 km    0.231
  PASS  no vendor claims a range ABOVE its own free-space ceiling  — 7 claims checked, 0 impossible — a claim above free space would be provably false, and none is
  PASS  published ranges sit well BELOW the ceiling, so free space is not the binding constraint  — real links are dominated by ground reflection, obstruction and fade margin, none of which free space contains — so the ceiling rules radios OUT, it does not predict range
------------------------------------------------------------------------------
  PASS  two distinct bands in one string are kept apart, not averaged  — "2.4 GHz and 900 MHz simultaneously" gives 900 and 2400 — their midpoint, 1650 MHz, is a frequency this radio never transmits on
  PASS  a contiguous range still takes its midpoint  — 902-928 is one band, and 915 is inside it
  PASS  an unparseable band is kept visible rather than dropped
  PASS  sensitivity published per packet rate is kept as a set, not collapsed  — 5 products publish sensitivity per mode, up to 13 entries — range and latency trade on the SAME hardware, and averaging the modes would delete that
  PASS  the single figure used is the BEST published sensitivity, chosen explicitly  — never a mean of modes that trade against each other
------------------------------------------------------------------------------
  PASS  an ESC with no published continuous rating is EXCLUDED, not given headroom  — 1 such part — its model name contains "45A" while the page says only "45A designed", and the survey recorded null rather than assuming
  PASS  a demand beyond a published rating excludes that ESC  — 500 A exceeds every published rating in the catalogue
  PASS  a pack outside the published cell range excludes that ESC
  PASS  viable parts are ranked by mass, the one axis every vendor publishes
  PASS  an ESC publishing several masses uses the lightest and says so
  PASS  a burst current with no duration is detectable and counted  — 6 of 8 quote a burst current with no duration — a burst rating without a duration is a number, not a rating
  PASS  completeness is reported but never used to rank  — a well-documented part that cannot carry the current is still the wrong part
  PASS  a non-positive current demand is refused
==============================================================================
DRONE AVIONICS GATE PASSED (26 checks)
```

</details>

<details><summary><code>drone-autopilot.mjs</code> — exit 0, 176 ms</summary>

```
DRONE AUTOPILOT GATE
==============================================================================

  design: QUAD/X, 4 rotors, 14.0 in props, 3.98 kg, hover 32 % of max thrust, 34.6 min

  THE REFUSALS
  PASS  MOT_THST_HOVER is NOT emitted, and the refusal names the guidance  — a computed 32 % would overwrite the margin the documentation asks for
  PASS  MOT_HOVER_LEARN is emitted instead, set to learn and save
  PASS  the computed hover figure still reaches the user, as a comment  — it informs without commanding
  PASS  PX4 takes the opposite decision on the same quantity  — MPC_THR_HOVER seeds an estimator and the land detector, so PX4 wants the real number
  PASS  THR_MDL_FAC is refused, because the equivalence is read from source  — and leaving it at 0 is what keeps MPC_THR_HOVER a valid control-signal fraction
  PASS  the thrust-fraction / signal-fraction distinction is stated in the file
  PASS  no power-module calibration is emitted by either exporter  — they depend on the hardware someone soldered in, not on the airframe
  PASS  no rate-loop gain is emitted  — the shipped frame files carry measured tuning results, not geometry
  PASS  PX4's state-of-charge failsafes are refused, not converted  — they are fractions of remaining SoC, not volts or mAh
  PASS  ArduPilot's missing mass parameter is reported as a gap  — 3.98 kg has nowhere to go in ArduPilot; PX4 takes it directly in kg

  REPRODUCING ArduPilot's SHIPPED Hexsoon-edu450.param
  PASS  QUAD/X maps to the frame codes the shipped file publishes  — FRAME_CLASS,1 FRAME_TYPE,1
  PASS  the LiPo rule reproduces the shipped file's pack endpoints at 3S  — 4.2x3 = 12.6 V and 3.3x3 = 9.9 V, as published

  CHEMISTRY
  PASS  the studio's default cell is not the chemistry the guidance describes  — INR-21700-P42A is Li-ion NMC (cylindrical 21700)
  PASS  pack endpoints come from the cell's datasheet, not the LiPo rule  — 15 V from 2.5 V/cell, not 19.8 V from the LiPo rule
  PASS  the departure from the published guidance is stated, not silent
  PASS  PX4's 3.5 V dropoff advice is flagged as not applying to this cell
  PASS  the cell's empty voltage and the sized depth of discharge are not conflated  — BAT1_V_EMPTY is 2.5 V/cell while the 34.6 min endurance assumed only 85 % of the pack — PX4 will fly deeper than the endurance figure assumes
  PASS  a non-LiPo cell with no published endpoints is refused, not defaulted

  THE PUBLISHED PROPELLER-SIZE TABLES
  PASS  a diameter between two published knots interpolates  — 14 in sits between the 10 in and 20 in knots
  PASS  a diameter below the first knot CLAMPS and says so  — the ATC_ACC_* table starts at 10 in; the value is held, not extended
  PASS  no emitted acceleration limit ever exceeds the table's own maximum  — 47 convergent designs from 10.0 to 18.0 in; clamping cannot invent a limit larger than anything published
  PASS  a sub-10-inch design, where one converges, clamps at the published 10 in value  — no design below 10 in converges on measured data, so nothing is clamped in practice
  PASS  MOT_THST_EXPO rises with propeller diameter, as the table does
  PASS  the expo warning travels with the number  — an ESC with a built-in linearising curve needs 0 to 0.2, not the 0.65 default
  PASS  the rate filters are derived from INS_GYRO_FILTER, not invented

  PX4's CATALOGUE
  PASS  a layout with a published generic airframe gets SYS_AUTOSTART  — 4001, "Generic Quadcopter"
  PASS  a layout with no generic airframe is refused, not approximated  — QUAD/H is FRAME_CLASS 1 / FRAME_TYPE 3 in ArduPilot and has no generic PX4 entry
  PASS  ArduPilot still expresses the layout PX4 cannot  — two orthogonal parameters compose; one catalogue index does not

  FILE FORMATS
  PASS  the .param file is NAME,VALUE with exactly one comma and no spaces  — 18 parameter lines
  PASS  every parameter name fits MAVLink's 16-character param_id limit
  PASS  every emitted value is finite and plainly formatted  — no exponent notation, no trailing-zero noise
  PASS  a non-finite value is refused rather than written
  PASS  the .param file carries the Mission Planner workflow warning  — a generated file is never applied automatically
  PASS  the .params file uses TAB separation and five columns  — the QGC spec's columns are Vehicle-Id, Component-Id, Name, Value, Type
  PASS  the .params file carries the documented QGC header
  PASS  the two formats are not interchangeable, and are not treated as such  — comma for ArduPilot, tab for QGC; cross-compatibility is undocumented
  PASS  every PX4 parameter carries a MAV_PARAM_TYPE from the enum  — INT32 -> 6, REAL32 -> 9

  THE HOVER ENDURANCE TEST MISSION
  PASS  a mission without a declared home position is refused  — coordinates are not sizing outputs
  PASS  the loiter time is LESS than the computed endurance  — 1558 s hover against a computed 34.6 min, leaving 8.7 min unspent
  PASS  the reason is the MAVLink definition, not a round number  — NAV_LOITER_TIME's clock excludes the climb, so the full endurance would schedule a landing after empty
  PASS  the mission is takeoff, loiter, land, with the sourced command numbers
  PASS  the .waypoints file is QGC WPL 110 with 12 tab-separated columns  — 3 mission items
  PASS  only the first item carries the CURRENT WP flag
  PASS  latitude is in the latitude column, despite the official example  — mavlink.io's own example puts 8.548 in the LATITUDE column for Zurich, at 47.376 N; the header wins
  PASS  every waypoint row declares the relative-altitude frame
  PASS  the .plan file matches the documented top-level shape
  PASS  the .plan contains SimpleItem entries only  — the official document marks several complex-item fields "?" in its own table
  PASS  doJumpId is auto-numbered from 1, as the spec requires
  PASS  vehicleType and firmwareType come from the MAVLink enums  — MAV_TYPE_QUADROTOR = 2 for this 4-rotor design
  PASS  the planned home position is the declared one, in lat/lon/AMSL order

  PRECONDITIONS
  PASS  an unconverged sizing run cannot be exported  — there is nothing to say about an aircraft that does not close
  PASS  a missing frame is refused
==============================================================================
DRONE AUTOPILOT GATE PASSED (52 checks)
```

</details>

<details><summary><code>drone-obstacles.mjs</code> — exit 0, 109 ms</summary>

```
DRONE OBSTACLE GATE
==============================================================================

-- a box's signed distance is the distance to its surface --
  PASS  zero exactly on the face
          face at x = 8 for a 4 m box centred on 10
  PASS  positive outside, equal to the gap
          2 m clear of the face
  PASS  NEGATIVE inside, equal to the depth
          centre of a 4 m box is 2 m from every wall
  PASS  measured from the roof when above it
          roof at 6 m, point at 10 m
  PASS  diagonal past a corner is the true corner distance
          dx 3, dy 2 -> 3.6056 m, not the larger of the two

-- a tree is the union of trunk and canopy --
  PASS  inside the canopy is negative by its depth
          canopy centred at h - canopyR = 8 m
  PASS  outside the canopy is the gap to its surface
          3 m out, canopy radius 2 m
  PASS  low down it is the TRUNK that is near, not the canopy
          a union takes the min of its parts, so the trunk governs below the crown

-- the strike is placed exactly, at the rotor envelope --
  PASS  a flight into the hangar reports the hangar by name
          struck "hangar"
  PASS  contact is at the face MINUS the envelope, not at the face
          x = 18.5500 m against face 19 - 0.45 = 18.5500
  PASS  the reported speed is the speed at contact
          10.000 m/s
  PASS  and is far finer than the 20 ms sample spacing
          error 0.00e+0 m against 0.2 m travelled per sample

-- height decides it, as it must --
  PASS  a pass at 6 m clears the 2.5 m wall
          nothing struck
  PASS  the same track at 1.5 m strikes it
          at x = -16.950 m

-- the envelope is the propeller tips, not the hub --
  PASS  a graze the HUB clears is still a strike for the DISC
          200 mm outside the wall: centre-point test says clear, 0.45 m envelope says struck "low wall" — this is the blades-off case

-- an unobstructed hover never reports a strike --
  PASS  no spurious contact when nothing is near
  PASS  and none at all with an empty scene

-- the impact response obeys its own physics --
  PASS  e = 0 removes the normal velocity EXACTLY
          0.000000000000 m/s
  PASS  e = 1 reverses it EXACTLY, and no more
          -10.000000000000 m/s
  PASS  no restitution in [0,1] increases speed -- energy is never created
          checked e = 0, 0.1, 0.25, 0.5, 0.9, 1
  PASS  a SEPARATING contact is left alone, not reflected again
          reflecting it would inject energy and pin the aircraft to the surface
  PASS  at an impact the tangential part is scrubbed while the normal part reflects
          along the wall 6 x 0.25 = 1.5, into it 10 x 0.5 -> -5 m/s
  PASS  a pure SLIDE is untouched -- sliding friction is a force over time, not an impulse
          scrubbing it per step would erase the velocity in milliseconds

-- the surface normal is a unit vector everywhere --
  PASS  unit and correct on the -x face
          [-1.0000, 0.0000, 0.0000]
  PASS  unit and correct on the roof
          [0.0000, 0.0000, 1.0000]
  PASS  unit and correct on the vertical corner
          [-0.7071, -0.7071, 0.0000]
  PASS  and on a tree canopy, where an analytic normal must pick a branch
          |n| = 1.000000000

-- the coefficients are declared, and say so --
  PASS  restitution is marked declared and states why it cannot be sourced
          0.25 - — No source in this project gives a coefficient of restitution for a m...
  PASS  tangentialScrub is marked declared and states why it cannot be sourced
          0.5 - — Fraction of velocity ALONG the surface retained after contact. Frict...
  PASS  bladeBreakSpeedMps is marked declared and states why it cannot be sourced
          3 m/s — Closing speed above which the struck rotor is taken as destroyed. No...
  PASS  the default scene exercises every obstacle kind
          box, tree
  PASS  every object is named and has a real height, so a strike names something a person recognises

DRONE OBSTACLE GATE PASSED (32 checks)
```

</details>

<details><summary><code>drone-flight-energy.mjs</code> — exit 0, 8560 ms</summary>

```
DRONE FLIGHT ENERGY GATE
==============================================================================
------------------------------------------------------------------------------
  PASS  one rotor at the hover thrust reproduces the sizing hover's rpm  — 3905.1754763116624 rpm, both
  PASS  and its shaft power, to the bit  — 55.05593792345063 W, both
  PASS  and its per-rotor bus power, to the bit  — 73.9368126463225 W, both
  PASS  the whole aircraft at hover reproduces sizing.hover.busPowerW EXACTLY  — 451.62087587793496 W — N x bus + declared avionics, the sizing.js:222 convention
  PASS  no rotor sample was out of range or clamped at the hover point
------------------------------------------------------------------------------
  PASS  the aircraft held the hover thrust steady for this window  — 7.8240722583333335 N on every rotor, worst deviation 5.30e-13 relative
  PASS  energy accumulated over a steady window equals P*t to floating point  — 7.527014598 Wh vs 7.527014598 Wh, rel err 4.24e-14
------------------------------------------------------------------------------
  PASS  a run with no energy model reports energy: null, not a zero  — the loop did not compute it, so it does not claim it
  PASS  and no energy field appears anywhere in its trace
  PASS  the TRAJECTORY is identical with and without the energy model  — integrating state of charge does not perturb the flight it measures
------------------------------------------------------------------------------
  PASS  a flight long enough to empty the pack ends on the pack, not the clock  — empty at 29.05 min, of a 40 min scenario
  PASS  it stopped because the DECLARED usable energy was gone  — 237.16 Wh of 237.15 Wh usable
  PASS  state of charge reaches zero and never rises anywhere in the flight  — monotone non-increasing, by construction
  PASS  state of charge is a fraction of the DECLARED usable energy, not the pack  — at usableFraction 0.85 an empty flight leaves 15 % of published energy unreachable
------------------------------------------------------------------------------
  PASS  a drifting hover costs MORE than the idealised steady hover, never less  — 489.8 W mean vs 451.6 W steady; 29.05 min vs 31.51 min — no position loop, so nothing arrests the drift
  PASS  the peak draw is recorded, and exceeds the steady hover  — peak 568 W, 26.3 A at the pack
------------------------------------------------------------------------------
  PASS  the measured thrust range comes from the propeller, not a literal  — 0.386..30.543 N, floor costs 2.81 W at the bus
  PASS  a thrust below the measured floor is refused, not extrapolated
  PASS  a thrust above the measured ceiling is refused AND flagged as such  — it cannot be bounded from inside the data, so it invalidates the figure
  PASS  with a rotor dead, sub-floor samples occur and are COUNTED  — 5993 of 36006 rotor-samples (16.6 %) below 0.386 N
  PASS  their energy is carried as an upper BOUND, never added to the figure  — true energy lies in [17.734, 17.828] Wh
  PASS  and that bound is a small fraction of the figure, so the interval is tight  — 0.5266 % of the energy consumed
  PASS  a run with no out-of-ceiling sample reports the figure as available
------------------------------------------------------------------------------
  PASS  every run carries the four assumptions the endurance figure carries  — constant published voltage, fresh pack, room temperature, no Peukert
  PASS  the constant-voltage assumption is stated first and explains itself
  PASS  no Peukert derating is claimed, matching battery.js's refusal
  PASS  an undeclared usableFraction is refused rather than defaulted  — no manufacturer in the survey publishes a cut-off criterion
  PASS  an undeclared avionics draw is refused rather than defaulted  — it is a DECLARED_INPUTS entry, not a property of the airframe
------------------------------------------------------------------------------
  PASS  the energy model is structured-cloneable, because the flight runs in a worker  — propeller, motor constants, ESC entry and pack are all plain data
==============================================================================
DRONE FLIGHT ENERGY GATE PASSED (29 checks)
```

</details>

<details><summary><code>drone-flight-worker.mjs</code> — exit 0, 7369 ms</summary>

```
DRONE FLIGHT WORKER GATE
==============================================================================
  PASS  every value the panel sends survives structuredClone  — id, model, scenarioArgs, declared, failed, scenery, impact
  PASS  a BUILT scenario cannot cross the boundary, because it carries target()  — which is why the worker rebuilds it from the arguments rather than receiving it
  PASS  the worker registered a message handler on import
  PASS  the worker replies with the id it was given  — id 1
  PASS  the worker returns a run, not an error  — no error
  PASS  the trace has the same number of samples  — 419 vs 419
  PASS  the run computed through the worker is IDENTICAL to the inline run, byte for byte  — 226 kB of run, identical
  PASS  the run carries the duration the scenario asked for  — 15 s over 3 segments
  PASS  and the degraded allocator path was actually exercised  — motor 2 dead through the boundary as a Set again
  PASS  a SEGMENT over the cap replies with makeScenario's message  — segment 1: duration is capped at 2400 s
  PASS  a TOTAL over the cap replies with makeScenario's message  — the scenario runs 3600.0 s; the cap is 2400 s
  PASS  and the worker still answers after an invalid request  — one worker serves the panel's whole lifetime
  PASS  the cap admits a 250 s scenario at all  — cap is 2400 s, and was 120 s while this ran on the main thread
  PASS  a 250 s flight comes back whole — every sample, across the boundary  — 12501 samples (expected 12501), crashed false
  PASS  an energy model posted to the worker comes back as an integrated run  — 237.2 Wh consumed
  PASS  and the PACK ends the flight, not the duration cap  — empty at 29.05 min, inside a 40 min scenario — the cap is set above the pack on purpose
  PASS  a full-length flight's trace stays bounded despite its length  — 8716 samples over 1743 s — the recording interval stretches past 240 s so the trace cannot grow without limit
  PASS  the aircraft's own endurance is a computed quantity the panel can report against  — 31.5 min of hover computed, P10 28.8 / P90 33.3
  PASS  and the integrator carries no state of charge, so it cannot enforce it  — the run reports no energy consumed — that chain is battery.js, via the Endurance tab
==============================================================================
DRONE FLIGHT WORKER GATE PASSED (19 checks)
```

</details>

<details><summary><code>drone-regulatory.mjs</code> — exit 0, 103 ms</summary>

```
DRONE REGULATORY GATE
==============================================================================
  PASS  thresholds are present  — 43 across 12 jurisdictions
  PASS  every threshold names a document and a clause
  PASS  every threshold names a source URL
  PASS  every threshold says WHAT it gates  — registration, operation, certification and airworthiness are different things
  PASS  every threshold keeps the value in the unit the rule states  — so a converted figure is never mistaken for the legislated one
  PASS  55 lb converts to 24.947580 kg  — 24.947580 kg
  PASS  25 kg and 55 lb are DIFFERENT limits  — 52.4 g apart
  PASS  0.55 lb converts to 249.4758 g  — a 250.0 g aircraft is OVER the US line and ON the EU one
  PASS  a 25.000 kg design is outside Part 107 AND outside the EU open category  — both limits are strict, so the round number satisfies neither
  PASS  the 52 g band between the two ceilings is detected  — 24.96 kg: above 55 lb, below 25 kg — legal in Europe's open category, not under Part 107
  PASS  just under the US ceiling is inside both
  PASS  non-mass triggers are carried and explained  — 80 J impact energy; carries a personal-data sensor; 3 m characteristic dimension; 66 J impact energy; beyond visual line of sight; recreational vs commercial
  PASS  every non-mass trigger names its jurisdiction and what it gates
  PASS  a classification always reports what it could not decide from mass alone  — including the US recreational/commercial split, which decides whether the 0.55 lb relief exists at all
  PASS  words with no legal force are recorded as such  — nano, heavy-lift, tactical, mini
  PASS  "nano" is not presented as a regulatory class
  PASS  no threshold emits a bare class word without a jurisdiction
  PASS  NATO entries are marked as doctrine or standardization, not civil law  — 7 entries
  PASS  ICAO entries are marked non-binding model text  — 2 entries — ICAO's RPAS CONOPS classifies no aircraft by mass at all
  PASS  proposed rules are excluded from a default classification  — 2 proposed thresholds, opt-in only
  PASS  a 5 kg quadcopter is inside the measured-data envelope  — measured propeller data at a thrust-to-weight ratio of 2
  PASS  a 100 kg quadcopter is refused, with what it would require  — needs ~67 in rotors vs 21 in measured
  PASS  the gap between the two engines is stated, not hidden  — 25-620 kg is validated by neither engine
  PASS  above the eVTOL engine's floor the refusal names that engine instead
  PASS  more rotors raise the envelope, as thrust summing requires
  PASS  required rotor diameter grows with mass
------------------------------------------------------------------------------
  thresholds in force, by mass:
           0.1 kg         100 g  UK                                 operator registration (camera-carrying UAS in 
     0.2494758 kg   0.55 pounds  USA (FAA)                          registration only (exemption from aircraft reg
     0.2494758 kg   0.55 pounds  USA (FAA)                          operation over human beings (Category 1)
          0.25 kg         250 g  Australia                          statutory class 'micro RPA'; drives operating 
          0.25 kg  250 g (0.55 pounds)  Canada                             AIRCRAFT registration - applies to recreationa
          0.25 kg  250 g (0.55 pounds)  Canada                             statutory class boundary -> applicability of S
          0.25 kg         250 g  EU                                 product class marking C0; unlocks subcategory 
          0.25 kg         250 g  EU                                 UAS OPERATOR registration (not aircraft regist
          0.25 kg         250 g  EU / UK                            operation in subcategory A1 for privately buil
           0.9 kg         900 g  EU / UK                            product class marking C1 -> subcategory A1 ope
             1 kg          1 kg  UK                                 definition used for tethered-flight provisions
             2 kg          2 kg  Australia                          statutory class 'very small RPA'
             2 kg          2 kg  UK                                 operation in subcategory A2 with a non-class-m
             4 kg          4 kg  EU / UK                            product class marking C2 -> subcategory A2 ope
             7 kg          7 kg  Australia                          definition of 'model aircraft' when operated f
            10 kg         10 kg  EU / UK                            derogation from the 120 m height limit for unm
      24.94758 kg     55 pounds  USA (FAA)                          applicability of the whole of Part 107 - pilot
      24.94758 kg     55 pounds  USA (statute)                      statutory definition of 'small unmanned aircra
      24.94758 kg     55 pounds  USA (statute)                      definition of actively tethered UAS
      24.94758 kg     55 pounds  USA (statute)                      RECREATIONAL operation of unmanned aircraft at
            25 kg         25 kg  Australia                          statutory class 'small RPA' upper bound
            25 kg  25 kg (55 pounds)  Canada                             statutory class boundary between small and med
            25 kg         25 kg  EU                                 product class marking C5 / C6 -> SPECIFIC-cate
            25 kg         25 kg  EU / UK                            ceiling of the entire OPEN category; above it 
            25 kg         25 kg  EU / UK                            product class marking C3 -> subcategory A3 ope
            25 kg         25 kg  EU / UK                            product class marking C4 -> subcategory A3 ope
            25 kg         25 kg  EU / UK                            operation in subcategory A3 for privately buil
           150 kg        150 kg  Australia                          statutory classes 'medium RPA' and 'large RPA'
           150 kg        150 kg  Australia                          definition of 'model aircraft' (sport or recre
           150 kg  150 kg (331 pounds)  Canada                             statutory class 'medium RPA' - brings 25-150 k
           150 kg        150 kg  NATO (standardization agreement)   applicability of military airworthiness certif
------------------------------------------------------------------------------
  measured-data sizing envelope (thrust-to-weight 2):
      3 rotors  up to    9.2 kg
      4 rotors  up to   12.3 kg
      6 rotors  up to   18.5 kg
      8 rotors  up to   24.7 kg
     12 rotors  up to     37 kg
     16 rotors  up to   49.3 kg
    above that: 24.7 kg (8 rotors) to 620 kg is validated by neither engine.
==============================================================================
DRONE REGULATORY GATE PASSED (26 checks)
```

</details>

