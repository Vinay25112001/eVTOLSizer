/* ═══════════════════════════════════════════════════════════════════════
   VERIFICATION TRACEABILITY MATRIX
   ═══════════════════════════════════════════════════════════════════════
   Every engine input and output, classified by how much it can be trusted.
   This exists so the honest answer to "is this number real?" is a lookup,
   not an opinion.

   STATUS LEVELS  (deliberately strict — "it looks plausible" is not a level)

     validated   Output compared NUMERICALLY against published data for a real
                 or reference aircraft, with the error recorded.
     sourced     The method or constant traces to a citable reference, but the
                 OUTPUT has never been compared against a real aircraft.
     calibrated  Fitted to reference data. Not a prediction. States its own
                 fit set and residuals.
     derived     Standard algebra on validated/sourced quantities; inherits
                 their confidence, adds no new assumption.
     unverified  Displayed by the app but never checked against anything.
                 May be right. Nobody has demonstrated it.

   The gap between "sourced" and "validated" is the important one. A formula
   taken from Raymer is sourced; it becomes validated only when its output is
   compared with a real aircraft and the error is written down.
   ═══════════════════════════════════════════════════════════════════════ */

export const INPUTS = {
  // ── mission ──
  payload:        { status:"unverified", note:"user requirement, not a modelling assumption" },
  range:          { status:"sourced", src:"Cruise range BEFORE the reserve allowance. DEFAULT 100 km — Archer Midnight's published range, matching the reference aircraft this configuration is anchored to (12 rotors, 150 mph). Sizes to 4,032 kg against Archer's published 3,175 kg: the model's known over-prediction, left visible. Earlier defaults: 190 km was UNSOURCED and DID NOT CONVERGE (5,825 kg); 65 km was chosen against an MCTOM of 3,175 kg that SC-VTOL Issue 2 has since superseded with 5,700 kg" },
  vCruise:        { status:"unverified", note:"user requirement" },
  cruiseAlt:      { status:"unverified", note:"user requirement" },
  hoverHeight:    { status:"unverified", note:"drives hover TIME as h/0.5 m/s — an assumed 0.5 m/s vertical rate, unsourced" },
  reserveMinutes: { status:"sourced", src:"Energy reserve held at the end of the mission. DEFAULT 20 min. CURRENT ON BOTH SIDES OF THE ATLANTIC: the FAA powered-lift SFAR (Integration of Powered-Lift, final rule Oct 2024, operations/training final April 2025) requires 20 minutes reserve for VFR and 30 for IFR — reduced from the 30/45 of the 2023 proposal — and permits powered-lift to use HELICOPTER VFR/IFR minima where the aircraft can perform a vertical landing at any point on the route. EASA SC-VTOL VTOL.2430(b)(4) requires a sufficient reserve but states NO number (MOC SC-VTOL Issue 2 p.5 refers only to 'the sufficient reserve accepted for compliance with VTOL.2430(b)(4)'); 14 CFR 91.151(b) gives 20 min VFR for rotorcraft. The 20 min DEFAULT is NASA's sizing convention, Johnson & Silva 2022: 'reserve minimum of 10% of mission or 20-min flight at best-endurance speed (Vbe)'. Set 30 for an IFR mission" },
  fieldElev:      { status:"sourced",    src:"NASA sizes UAM concepts at 5,000 ft — Johnson & Silva 2022 Table 2" },
  deltaISA:       { status:"sourced",    src:"ICAO Doc 7488; NASA sizing day is ISA+20" },

  // ── aerodynamics ──
  LD:             { status:"derived",    note:"now a TARGET only — sizing uses computed LDact since the loop was closed" },
  AR:             { status:"unverified", note:"default 9; no sourced eVTOL range checked" },
  eOsw:           { status:"unverified", note:"default 0.85; Oswald efficiency not checked against any reference" },
  clDesign:       { status:"unverified", note:"SUPERSEDED and removed from the panel 2026-08-26 — measurably INERT under the current wing model, which sizes from W/S and DERIVES cruise CL. Retained only for the legacy wingSizedBy:'cl' path and as an airfoil-selector fallback" },
  wingLoadingNm2: { status:"calibrated", src:"THE wing design variable (Raymer ch.5 constraint diagram). Default 1450 N/m2 is the midpoint of Joby S4 1524 and Archer Midnight 1371, both back-computed from published span and MTOW at the baseline AR of 9 — so it is a fit over two aircraft, not a published constant" },
  rotorborneLoD:  { status:"calibrated", src:"Effective lift-to-drag L/De = W*Vbr/P for a ROTOR-BORNE aircraft, from NASA published reference vehicles (TM-20210017971 Table 12): quadrotor-electric 5.80, side-by-side-electric 7.20, lift+cruise-electric 8.50, tiltwing 8.72. Default 5.80. CALIBRATED, NOT PREDICTED - it does not respond to rotor design because nothing in it models rotor design. The predictive route is NDARC rotor forward-flight power Pi+Po+Pp, whose profile term needs the advance-ratio function F_P (Theory 12-5.1.2). F_P IS NOT IMPLEMENTED AND NOT GUESSED: its closed form renders as unrecoverable glyphs in both pdftotext modes of TP-20220000355, the same blocker that has kept the AFDD84 fuselage equation out of this engine" },
  clCruiseMax:    { status:"unverified", note:"[LAY] 0.90 cruise-CL ceiling. NOT inert, but CONDITIONAL: it binds only when the aircraft is slow for its wing loading. At the default (CL_cruise 0.58) the W/S constraint governs and this does nothing; at 45 m/s cruise it takes over completely and drives wing area" },
  priceTransientIntoMass:{ status:"unverified", note:"opt in to sizing motor MASS on the OEI transient. DEFAULT FALSE — REFUTED BY VALIDATION: it takes buildup MAE from 55% to 179% and makes three of four published, flying aircraft fail to close. The suspect term is dividing a seconds-long transient by a minutes-scale datasheet peak ratio" },
  sizeMotorsOnSustainedOnly:{ status:"derived", note:"superseded name; the sustained-only rule is now the default" },
  motorMassModel: { status:"calibrated", src:"WHICH MOTOR POPULATION the mass regression is fitted to — a reference-class choice, the fourth time reference class has been the actual defect in this engine. 'emraxTorque' (DEFAULT) = W_kg = 0.5591*tau_Nm^0.6266 fitted to the four EMRAX axial-flux entries in src/Components.jsx (2024 datasheets), residuals -3.1/+9.3/-5.6/0.0%, worst 9.3% over n=4 — modern eVTOL traction motors. 'nasaTorque' = NASA/TM-20210017971 6.1.2.2, W_lb = 0.5663*tau_ftlb^0.8207 x tech factor 1.322, fitted to the 2021 NDARC database — correct for NASA reference vehicles, ~2x heavy for a modern eVTOL (cross-checked against EMRAX at 1.07-1.61x). 'specificPower' = the legacy [CAL] 5.0 kW/kg constant, which cannot distinguish a slow lift rotor from a fast cruise prop. MEASURED: under nasaTorque the app default does not close at any rotor count or tip speed, because it asks 1646 N-m per motor — 3x the largest production motor in our own database" },
  motorGearRatio: { status:"derived", note:"1 = direct drive, the engine default and what NASA used for the tiltwing ('all proprotors ... directly driven ... without cross shafting'). NASA's quadrotor and side-by-side DO carry drive systems (397 lb / 255 lb) so they are geared. Gearing is NO LONGER A FREE LUNCH: raising this ratio cuts motor torque and therefore motor mass, and now also buys a real gearbox from engine/drivesystem.js — before that module existed the gearbox weighed nothing and every geared design scored better than it can be built. Motor speeds recovered by inverting NASA's own motor regression against NASA's own motor-group weights imply ratios of 10.9-15.7 (quadrotor) and 12.1-16.1 (side-by-side), i.e. ~4,300-6,300 rpm motors against 350-400 rpm rotors — which is why our direct-drive motors came out 4-15x NASA's published motor group" },
  flightControlsModel: { status:"sourced", src:"Flight controls group. FRACTION is the DEFAULT and that is a MEASURED choice, not an omission: against NASA Table 12s published flight-controls line for all 8 variants the fraction scores MAE 30.4% while NDARC AFDD82 section 29-8 scores 421.5%. AFDDs N_rotor^1.3855 term describes mechanical control runs from a cockpit to every rotor; a distributed-electric fly-by-wire aircraft has wires, so importing the equation would replace a modestly-high fraction with a several-times-high regression. AFDD is retained as a selectable comparator. NDARC itself supplies the escape hatch: it designates each rotor fixed pitch (NO CONTROL WEIGHT), swashplate, or collective only - and this engines default rotorControl is rpm, i.e. fixed pitch" },
  conversionControlsFrac: { status:"calibrated", src:"Additional flight-controls fraction for TILTING configurations, on top of the base. NDARC counts conversion (rotor tilt) flight controls as its own category. DEFAULT 0. NASAs tiltwing implies 1.24% additional on airframe weight - but that is n=1, so it is documented and NOT shipped as a default" },
  rotorMassModel: { status:"sourced", src:"Rotor group — blades plus hub and hinge. 'afdd00' DEFAULT = NDARC TP-20250010468 29-2 AFDD00 (51 aircraft, blade 7.9% / hub 12.2% mean error); 'afdd82' = same section (37/35 aircraft, 7.7% / 10.2%); 'diskArea' = the legacy [CAL] 2.0 kg/m2 constant. THE COMPARISON IS MEASURED, NOT ASSERTED: against NASA Table 12's published rotor group weights for all EIGHT variants, the [CAL] constant scores mean absolute error 249% (range +38% to +463%) while AFDD scores 25-31% — see validation/components.mjs. The constant took no account of blade count, chord, tip speed or flap frequency. AFDD82 scores marginally better than AFDD00 on this 8-aircraft set; AFDD00 is still the default because it is the larger and newer fit, and choosing the better-scoring one would be fitting to the sample" },
  solidity: { status:"derived", note:"Design rotor solidity, default 0.10. WAS HARDCODED 0.10 in two separate places (engine/drag.js stopped-blade drag, and engine.js chord/noise) — the duplication defect this codebase keeps hitting. Now one parameter read by drag, noise and the rotor group; the rotor group derives blade chord from it (c = sigma*pi*R/N_blade) and falls back to the [CAL] disk-area model rather than inventing a chord when it is absent" },
  rotorFlapFreq: { status:"calibrated", src:"Blade flap natural frequency, per rev. DEFAULT 1.10 (hingeless class). NOT published for the NASA reference vehicles, and NDARC states no typical value — so this is [CAL], and it enters the blade equation at the 2.51 power, making it the most sensitive input in the rotor model. Measured MAE against Table 12 (AFDD82, 3 blades): nu 1.03 -> 25.5%, nu 1.10 -> 29.1%, nu 1.25 -> 64.4%. 1.03 scores best and is deliberately NOT the default, because picking it would be fitting an unpublished parameter to the benchmark" },
  rotorTechFactor: { status:"derived", note:"technology factor on the rotor group, default 1.0 — no credit claimed" },
  nacelleAirInductionFrac: { status:"sourced", src:"f_airind in NDARC AFDD82 (TP-20250010468 29-6). NDARC's turboshaft-typical value is 0.3 (range 0.1-0.6); DEFAULT HERE IS 0, and that is physics rather than a guess — the air induction group is the intake ducting feeding combustion air to a gas turbine, and an all-electric aircraft has neither. Setting it to 0 also removes the (1 - f_airind) discount from the engine-support term" },
  nacellePylonFrac: { status:"derived", note:"f_pylon in NDARC AFDD82: pylon support as a fraction of MTOW. DEFAULT 0 to avoid DOUBLE-COUNTING — NDARC's pylon support is the structure carrying the propulsor away from the airframe, which in this engine is engine/booms.js (sized from rotor thrust and arm). Exposed for layouts with a genuine pylon distinct from a boom, such as a tilting nacelle" },
  nacelleWettedAreaM2: { status:"unverified", note:"S_nac for the AFDD82 cowling term. NO DEFAULT: cowling is returned as zero unless supplied, and that omission is reported rather than estimated. NASA/TM-20210017971 6.1.2.2 publishes motor diameter and length regressions that would give it, but the coefficients do not survive extraction — both -layout and raw reading order render them as run-together digits ('= 0.81810.3094'), and the two readings disagree: read as INCHES the diameter and length equations agree on the same motor torque to 4% (459 vs 478 ft-lb), read as the FEET the text states they disagree by 14x. A recovered unit is not a source" },
  nacelleTechFactor: { status:"derived", note:"technology factor on the nacelle group, default 1.0 — no credit claimed" },
  designCTsigma: { status:"sourced", src:"OPTIONAL OVERRIDE of the design hover blade loading CT/sigma. When omitted the engine now picks the value published for THIS configuration (see the output of the same name); it is no longer a single mean of NASA's four published UAM concept vehicles (Quad-E 0.0759, SbS-E 0.0839, L+C-E 0.0603, TR6-E 0.0973 for the tiltrotor, TW-TE 0.1126 kept separately for the tiltwing), recovered from Table 12's published solidity, disk loading and tip speed. NOTE ON THE SOURCE SET: NASA's four Table 12 concept vehicles are NOT all battery-electric — the tiltwing TW-TE is TURBOELECTRIC and a side-by-side variant is hybrid. Only the all-electric columns are used as SIZING cases (see validation/nasa-configs.mjs, which scores Quad-E, SbS-E and L+C-E only). Blade loading is borrowed across power-train types deliberately and it is legitimate to do so: CT/sigma is set by blade stall margin and control authority, not by whether the shaft power comes from a battery or a turbogenerator. Borrowing across CONFIGURATIONS is not legitimate, which is why the tiltrotor no longer carries the tiltwing's value. It is a DESIGN CHOICE, not a physical constant — lower buys manoeuvre and one-rotor-out margin at the cost of blade area and weight. SOLIDITY IS DERIVED FROM IT rather than fixed, because NASA scale solidity with disk loading by a factor of five (0.055 to 0.267) while holding blade loading nearly constant" },
  downloadFraction: { status:"sourced", src:"Hover download — thrust lost to the rotor wake striking the airframe. Hover thrust = W/(1-k), NDARC TP-20220000355 sec.8-11. NOW CONFIGURATION-AWARE: tiltrotor uses the XV-15 MEASURED 14.69% (NATO RTO-MP-AVT-111, same layout with rotors directly over the wing); tilt+lift hybrids scale that by the tilting-rotor fraction, a geometric argument about how much rotor thrust overflies wing area; lift+cruise and both rotor-borne layouts remain ZERO with the gap flagged in the checks, because no published figure exists for boom-mounted fore/aft rotors. Zero is NOT a neutral default — it asserts that no wing sits in the wake, which is false for a tiltrotor — so it is now used only where the layout genuinely lacks a published value" },
  missionHops: { status:"sourced", src:"Number of takeoff-cruise-landing hops the sizing mission flies on ONE charge. DEFAULT 1 (unchanged behaviour). NASA's six-passenger UAM sizing mission is TWO, stated independently by two NASA sources: Johnson & Silva 2022 sec.5 'two 37.5-nm flights (total 75-nm range without recharging or refueling), with a 20 min reserve', and Exploration of Design Drivers for the RVLT Lift+Cruise Reference Aircraft 'two hops of 37.5 nautical miles each into a 10 knot headwind ... The aircraft does not charge when on the ground after completing the first 37.5 nmi hop'. Multiplies hover, climb and descent segments; total cruise DISTANCE is unchanged and merely split across the hops" },
  reserveAtCruiseSpeed: { status:"sourced", src:"Reserve flown at cruise speed rather than the 0.76*Vcruise best-endurance default. DEFAULT false. The UAM 75 nm sizing mission specifies a CRUISE reserve — NASA/TM-20230018312: '75 nmi with a 20-min cruise reserve range'; RVLT Lift+Cruise design-drivers paper: 'A 20-minute cruise reserve is the final segment of the mission'. The best-endurance form belongs to Johnson & Silva's SEPARATE initial air-taxi mission ('20-min flight at best-endurance speed'). Reserve power goes as V/(L/D), so the two are not interchangeable" },
  hoverTimeTakeoffS: { status:"sourced", src:"Seconds at hover power per takeoff. DEFAULT 120 s from Johnson & Silva's initial air-taxi mission ('2-min hover OGE for takeoff'). ⚠ THE 75 nm UAM SIZING MISSION IS DIFFERENT: TM-20210017971 Table 1 shows 6,000 -> 6,050 ft vertical transitions at +/-100 ft/min, i.e. 30 s, plus 15 s ground segments at 10% power. That table is column-shredded in extraction so 30 s is a READING, not a quotation, but it is self-consistent (50 ft at 100 ft/min = 30 s). Benchmark sensitivity is reported in validation/nasa-configs.mjs rather than tuned away" },
  hoverTimeLandingS: { status:"sourced", src:"Seconds at hover power per landing — see hoverTimeTakeoffS" },
  driveSystemModel: { status:"sourced", src:"'afdd00' (DEFAULT) = NDARC TP-20250010468 29-7.4 AFDD00, 8.6% mean error over 52 aircraft. 'afdd83' = the older model from the same section, 7.7% over 30 aircraft. AFDD00 is preferred as the larger and more recent fit, and it is also the tighter of the two against NASA's published electric drive systems (implied technology factor 0.97-1.00 per drive train vs AFDD83's 0.89-1.05)" },
  driveTechFactor: { status:"calibrated", src:"DEFAULT 1.0 — NO credit applied. The technology factor implied by NASA's own published drive-system weights under the per-drive-train reading is 0.97-1.04 over n=2, i.e. indistinguishable from unity, so there is nothing to claim. Kept as an explicit knob rather than baked in. Same discipline as structTechFactor, whose fitted 1.414 was measured and deliberately not shipped" },
  driveRotorShaftFrac: { status:"sourced", src:"f_rs, the rotor-shaft share of the gear box + rotor shaft weight. NDARC TP-20250010468 29-7.4: 'Typically f_rs = 0.13 (range 0.06 to 0.20)'. Splits the total for reporting; does not change it" },
  driveFQpct: { status:"derived", note:"AFDD83 only — f_Q, the second rotor's torque limit as a percentage of the total drive-system torque limit. NDARC: 'typically fP = fQ = 60% for twin main-rotors (tandem, coaxial, and tiltrotor); for a single main-rotor and tail-rotor, fQ = 3%'. Defaults to 100 here because each independent electric drive train carries its own rotor's full torque and shares with nothing — the parameter is describing an interconnection that this architecture does not have, which is part of why AFDD00 (which has no fQ term) is the default model" },
  motorPeakToContinuous:{ status:"sourced", src:"1.693, the mean of the EMRAX axial-flux family in this repo's own component database (188/228/268/348: 1.67/1.65/1.75/1.70). H3X HPDM-250 excluded at 1.25 as a different technology level" },
  installationMargin:{ status:"unverified", note:"[LAY] margin on installed motor power, default 1.00 so it changes nothing until someone justifies a value" },
  legacyMotorSizing:{ status:"derived", note:"escape hatch to the superseded (Phov x 1.15)/N motor sizing" },
  taper:          { status:"unverified", note:"default 0.45" },
  tc:             { status:"unverified", note:"default 0.15" },
  customAirfoil:  { status:"sourced",    src:"user-supplied XFoil/UIUC polar; fit is least-squares parabolic" },

  // ── propulsion ──
  nPropHover:     { status:"unverified", note:"configuration choice" },
  propDiam:       { status:"unverified", note:"default 3.0 m; drives disk loading, which IS now checked against published bands" },
  twRatio:        { status:"sourced", src:"INSTALLED HOVER THRUST-TO-WEIGHT, and NASA's own name for it is the HOVER LOAD FACTOR n_z. DEFAULT 1.30. The registry's old note (\"NASA Table 4 gives OEI 1.4-3.8 ... NOT yet reconciled\") compared two currencies: Table 4 publishes POWER ratios for a seconds-long TRANSIENT, this is a sustained THRUST ratio. THE SOURCE THAT SETTLES IT is Hartman, Altamirano & Suh, \"Flight Dynamics and Control Analysis for Motor Sizing and Failure Accommodation for a Lift+Cruise eVTOL Near Hover\", VFS 81st Annual Forum 2025. They size an NDARC lift+cruise against exactly this quantity: \"an additional sizing condition ... required the vehicle to sustain a specified load factor along the body z-axis (n_z) while hovering at 6,000 ft ISA\", sweeping n_z from 1.00 g to 1.77 g, 1.77 being \"the largest load factor for which the sizing task converged\". So the PUBLISHED DESIGN RANGE IS 1.00-1.77 and 1.30 sits inside it. THEIR FLOOR IS 1.35: at the 1.00 g baseline \"the operating torque required to hover exceeds the continuous operation rated torque ... this design would not be acceptable\", and hovering inside the continuous torque range \"was satisfied by the 1.35 g design variant\", so \"design variants below 1.35 g load factor could be eliminated from further consideration\". THIS ALSO EXPLAINS THE MOTOR+DRIVE BENCHMARK: NASA/TM-20210017971 Table 12 publishes weight statements for designs at about n_z = 1.00 - the point their own flight-dynamics work rejects - so scoring a 1.30 g design against them measures a DESIGN-POINT difference, not model error. Measured: raising the default to 1.35 takes the NASA benchmark from 13 of 21 metrics within +/-5% down to 8 and motor+drive from +33% to +44%, which is the comparison drifting further from a 1.00 g aircraft rather than the model getting worse. Deriving n_z per configuration from N/(N-1) was tried and separately REFUTED (see note 20). The 1.35 floor is carried as an advisory check rather than as the default" },
  etaHov:         { status:"sourced",    src:"figure of merit; NASA L+C installed power implies FM 0.72 (matched to 0.4%)" },
  etaSys:         { status:"sourced",    src:"must be the FULL chain incl. propeller (~0.76); label corrected" },
  rateOfClimb:    { status:"unverified" },
  climbAngle:     { status:"unverified" },
  descentAngle:   { status:"unverified", note:"approach angle, an OPERATIONAL choice (procedure and terrain), not an aerodynamic output. THE ENGINE NEVER READ IT until 2026-08-26 — desAng was always atan(1/LD), so the slider was measurably inert. Now an override: unset falls back to the converged glide angle, so closed-loop behaviour is the default. THE 6 DEG DEFAULT IS SOURCED, but not for this purpose: Johnson & Silva 2022 (NASA concept vehicles) state “The approach profile has a 6-degree descent angle, flown at Vy, 120 m above ground level at the center microphone” \u2014 that is the FAR Part 36 Appendix H helicopter NOISE CERTIFICATION trajectory, flown over microphones, not a sizing mission profile. No corpus source specifies a sizing descent angle. Measured cost of the choice: moving from 6 deg to the glide fallback changes MTOW by 0.0-0.8% across the six layouts, so the DEFAULT carries almost no risk; the 14% swing in validation/unverified-leverage.mjs is the span across 3-9 deg, which is an operational choice between real procedures rather than modelling error" },
  climbLDPenalty: { status:"unverified", note:"SUPERSEDED 2026-08-26 for the default path. Climb and descent L/D are now evaluated on the SAME drag polar as cruise at their own airspeeds (CL = W cos(gamma)/(qS), CD = CD0 + CL^2/(pi AR e), density at mid-climb altitude). The flat 13% derate made climb L/D independent of climb SPEED, which made climb ENERGY exactly independent of rate of climb — a cancellation that is an artefact, not physics. Retained for the legacy paths via p.flatClimbPenalty and useTargetLD" },
  flatClimbPenalty:{ status:"derived", note:"escape hatch to the superseded flat climb derate" },
  regenDescent:   { status:"unverified", note:"opt in to crediting regenerated descent energy. Default false — see regenCredited" },
  solver:         { status:"derived", note:"'fixed-point' forces the legacy pure successive substitution; default is the hybrid" },
  solverSwitchFrac:{ status:"sourced", src:"0.05 — Ugwueze et al.'s observed switch point, the residual falling inside 5% of the sized mass. TUNED AND MEASURED here: 0.05 with a stall limit of 1 gives 384 total iterations against 584 for pure fixed-point over six cases with ZERO disagreements; switching on an ITERATION COUNT instead was tried and is strictly worse" },
  solverStallLimit:{ status:"derived", note:"secant steps allowed to fail to improve the residual before reverting permanently. 1 — the discrete feedback in the buildup model makes a second chance counter-productive (measured: 2 caused two cases to stop converging entirely)" },
  mtowCertLimitKg:{ status:"sourced", src:"SC-VTOL 5,700 kg category limit" },
  gearType:       { status:"sourced",    src:"Raymer Table 12.6: fixed 0.015 / retractable 0.003 / faired 0.001" },
  hubsExposed:    { status:"sourced",    src:"NDARC 12-10: spinnered tiltrotors carry no hub drag" },
  nRotorsStopped: { status:"sourced",    src:"NDARC 12-9 stoppable rotor: blade drag on geometric blade area" },

  // ── battery ──
  sedCell:        { status:"sourced",    src:"CELL level. NASA sizes on 400 Wh/kg PACK installed+usable — different quantity" },
  etaBat:         { status:"validated", src:"Battery efficiency, DEFAULT 0.90. NOT a round-trip efficiency and not an assumption — both were true of the earlier entry, which was tagged unverified with no note at all. NDARC Theory sec.28 defines it on the DISCHARGE PATH only: \"E_batt = E_comp + P_loss, and the battery efficiency is eta_batt = E_comp/E_batt\" — useful energy delivered over energy drawn. An aircraft never charges in flight, so charge-side losses are irrelevant to sizing. THE VALUE IS NASA'S OWN AND IS VALIDATED, not merely published: NASA/RVLT \"Exploration of Design Drivers for the RVLT Lift+Cruise Reference Aircraft\" (corpus S3270) states \"the default value for the battery efficiency term in RST is 90%\", and in that same study the RST model carrying this 90% reproduced the full physics-based NDARC sizing to 0.1% on gross weight (8820 vs 8810 lb) — with the paper noting battery high-power efficiency was \"the only RST input available to tune the model\" and that adjusting it \"was not necessary\". Corroborated as a range by corpus S1482 (Li-ion charge/discharge 90-95%). MECHANISM, and the reason for its SCOPE: internal resistance causes a voltage drop at high discharge rate, so more current — and more energy — is needed for the same power (Johnson & Silva 2022 sec.4.1 and Antcliff 2019: \"internal resistance reduces battery efficiency at high discharge rates\"). It is therefore applied to VERTICAL FLIGHT ONLY, per S3270: \"the battery efficiency term is not applied during forward or edgewise flight segments in RST\". This engine formerly applied it to the WHOLE mission, inflating required energy by 11.1% where the sourced convention charges 0.72%. Measured justification on this aircraft: hover 3.83C vs cruise 1.38C. See etaBatEffective for the value the sizing actually used, and etaBatScope to restore the old form" },
  socMin:         { status:"unverified", note:"used with THREE different conventions in the code — see known issues" },
  cRateDerate:    { status:"unverified", note:"8% SED derate; no source" },
  spBattery:      { status:"unverified", note:"battery specific power kW/kg; drives the power-limited branch of Wbat" },

  // ── weights / structure ──
  ewf:            { status:"validated",  src:"NASA L+C 0.656 published weight statement; Archer 0.653, Joby 0.510 implied. Inert under buildup model" },
  weightModel:    { status:"validated",  src:"buildup 47.3% pooled MAE vs 72.1% for the ewf fraction, over the current 4-aircraft / 11-metric set. The pooled figure is misleading — it averages span at 2.6% against pack energies the mission-convention bracket shows are convention artefacts — but the ORDERING has held at every re-measurement" },
  structTechFactor:{status:"calibrated", src:"1.001 — i.e. essentially NO fudge. It was 1.409 while the wing used Raymer's light-GA regression; swapping to NDARC AFDD93 collapsed it to ~1.0, and that collapse is the evidence the swap was right. propTechFactor (1.000) was split out from it so structure and propulsion are no longer scaled together. DO NOT re-fit after every physics change — the 3-4 aircraft set is under-determined and the factors never converged" },
  fusLen:         { status:"unverified", note:"does not scale with MTOW — both reference aircraft fail the fus/span check" },
  fusDiam:        { status:"unverified" },

  // ── V-tail ──
  vtGamma:        { status:"sourced",    src:"Ruscheweyh / Raymer §6.3 cos^2/sin^2 decomposition" },
  vtCh: { status:"unverified", src:"Horizontal tail volume coefficient. STILL UNVERIFIED, but now for a known reason. NASA's own OpenVSP geometry gives Vh 0.775 (RAVEN 0.851, SWFT 0.699) against this 0.45. That measurement was adopted and then REVERTED: a tail volume coefficient trades area against arm, so it only transfers between aircraft of similar proportion, and RAVEN/SWFT are a research-aircraft family at fuselage/span 0.74 while air taxis sit at 0.54 (Joby S4 0.538, ours 0.540). Imposing their volume on our arm demanded a V-tail of 81.6% of wing area; NASA's own aircraft carry 36-39%. See validation/tail-geometry.mjs and note 29" },
  vtCv: { status:"unverified", src:"Vertical tail volume coefficient. STILL UNVERIFIED, same reason as vtCh: NASA's measured Vv is 0.0582 (RAVEN 0.0574, SWFT 0.0589) against this 0.032, but their proportions differ too much for the coefficient to transfer. What IS validated is the resulting tail AREA FRACTION, which is arm-free: sizing the V-tail at its own optimal dihedral puts it at 37.1% of wing area against NASA's built 36.4-39.4%, reached independently" },
  vtAR:           { status:"unverified" },

  // ── numerics ──
  convTolExp:     { status:"derived",    note:"solver tolerance, not physics" },
  sizingRelaxation:{status:"sourced",    src:"NDARC Theory (NASA TP-20220000355) §5-2.1: a direct iteration x_{n+1}=G(x_n) has |G'|>1 for many practical problems, and NDARC relaxes W_MTO accordingly. DEFAULT 1.0 = full step = prior behaviour. MEASURED NEGATIVE: no lambda recovers convergence for the fraction model above ewf ~0.455 (no root exists there), and it strictly slows the buildup model. Kept as a recorded negative result so it is not retried" },
  useTargetLD:    { status:"derived",    note:"escape hatch to the legacy behaviour" },
  powertrain:     { status:"sourced", src:"User choice. \"battery\" (default, every earlier result) or \"turboelectric\": NASA's turboshaft-generator architecture with a battery for the engine-out landing only (Silva et al. 2018; NASA/TM-20210017971), modelled in engine/turboelectric.js" },
  rotorInterleave: { status:"calibrated", src:"Whether the multicopter's rotors are VERTICALLY STAGGERED, allowing adjacent discs to overlap in plan. [CAL] on ONE aircraft: Volocopter publish the VoloCity rotor rim diameter both including (11.3 m) and excluding (9.3 m) the rotors, which fixes the rotor centre circle at 4.50 m radius - eighteen 2.3 m discs 1.563 m apart, overlapping 32%, and their photographs show the nacelles alternating between two heights. The strict non-overlap floor demands a 16.21 m aircraft and so FORBIDS a certified design. INPUT, not an output: it was filed under OUTPUTS, where no run could ever emit it (found 2026-09-16 when the provenance report became a gate). The default is no longer false: engine/coaxial.js interleavedFor() interleaves an EVEN multicopter count above INTERLEAVE_MIN_ROTORS = 8, a [LAY] crossover between two measured endpoints (NASA's quadrotor does not interleave; VoloCity and EHang 216 do). An explicit flag wins" },
};

export const OUTPUTS = {
  /* 31 outputs the census reported as unclassified, 2026-09-10. All derived
     geometry or solver state; none is a new physical claim. */
  Cr_: { status:"derived", note:"wing root chord from area, span and taper" },
  Ct_: { status:"derived", note:"wing tip chord = taper x root" },
  MAC: { status:"derived", note:"mean aerodynamic chord, 2/3 Cr (1+t+t^2)/(1+t)" },
  convEps: { status:"derived", note:"the user-set 10^convTolExp; the applied threshold is tol = 0.01 W eps" },
  tailType: { status:"derived", note:"which tail the rest of the engine sees, vtail or conventional" },
  tailWeightConventional: { status:"derived", note:"conventional-tail weight for comparison when a V-tail is chosen" },
  rotorFitMaxDoverFL: { status:"derived", note:"largest rotor-diameter-to-fuselage-length the array can pack" },
  rotorFitDoverFL: { status:"derived", note:"actual D/fusLen" },
  rotorFitLengthNeededM: { status:"derived", note:"fuselage length the rotor array needs" },
  fusLenGrownForRotors: { status:"derived", note:"true when the body was lengthened to fit its rotors" },
  oeiRotorLossApplies: { status:"derived", note:"whether one-rotor-out thrust loss is modelled for this drive architecture" },
  oeiBasis: { status:"derived", note:"which OEI rule sized T/W: continuous-torque floor or power factor" },
  oeiControllability: { status:"derived", note:"ACAI result for the failed-rotor case" },
  finArea: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finSpan: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finRootChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finTipChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finMAC: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finSweep: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  finAR: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabArea: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabSpan: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabRootChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabTipChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabMAC: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabSweep: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  stabAR: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  ventralArea: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  ventralSpan: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  ventralRootChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  ventralTipChord: { status:"derived", note:"conventional-tail panel geometry from the volume-coefficient sizing; unverified against a published tail" },
  // ── VALIDATED against published aircraft ──
  MTOW:        { status:"validated", src:"Scored against published take-off mass by validation/nasa-configs.mjs, validation/validate.mjs and (turboelectric) validation/turboelectric.mjs. The current per-aircraft errors are generated into src/lib/validation-domain.js and shown with every result; they are not written here, because a number copied into a note goes stale (this note said NASA L+C -50.3% and Joby +11.4% long after both had moved). VX4 is unscored on mass because its MTOW is not published" },
  PackUsablekWh:{ status:"derived", note:"the part of the pack the mission may actually spend = PackkWh x (1 - socMin), or the whole pack under sedBasis packUsable where the SoC window is already inside the input. THREE energies are now named separately because conflating them caused a real defect: PackkWh (total across the SoC range), PackUsablekWh (spendable), PackInstalledkWh (nameplate before pack efficiency)" },
  PackInstalledkWh:{ status:"derived", note:"nameplate energy at the derated specific energy, before pack efficiency" },
  PackkWh:     { status:"validated", src:"scored, but read the MISSION-CONVENTION BRACKET first: Joby's 165 kWh and Archer's 142 kWh both fall INSIDE our no-reserve-to-20-min-reserve range, so those errors are a reserve convention, not a model error. VX4's 160 kWh falls OUTSIDE — it cannot fly its own published range even at zero reserve" },
  Phov:        { status:"validated", src:"NASA L+C installed lift power 1,127 kW vs actuator disk at FM 0.72 = 1,124 kW (0.4%)" },
  LDact:       { status:"validated", src:"NASA L+C computed 9.98 vs implied ~9.3 from published L/De 7.9" },
  ewfImplied:  { status:"validated", src:"NASA published weight statement 0.6556" },
  DL_lbft2:    { status:"validated", src:"vs NASA L+C 15.1, tiltwing 20, helicopters 5-15, tiltrotors 15-25" },
  kNDARC:      { status:"validated", src:"NDARC D/q = k(W/1000)^(2/3); k = 1.4/1.6/2.5/9 reference bands" },

  // ── SOURCED: method cited, output never compared to a real aircraft ──
  rhoCr:       { status:"sourced", src:"ICAO Doc 7488 standard atmosphere" },
  rhoHov:      { status:"sourced", src:"ICAO Doc 7488" },
  aCr:         { status:"sourced", src:"ICAO Doc 7488" },
  CD0gear:     { status:"sourced", src:"Raymer Table 12.6" },
  CD0hub:      { status:"sourced", src:"NDARC 12-10 form; coefficient calibrated to the 25-30% parasite share (Churchill NTRS 19980228291, Penn State RWA)" },
  CD0blade:    { status:"sourced", src:"NDARC 12-9 form; coefficient NOT sourced" },
  CD0tot:      { status:"sourced", src:"Raymer component buildup + rotorcraft terms; aggregate checked via kNDARC" },
  Wempty: { status:"validated", src:"Empty weight. VALIDATED: scored against Table 12 empty weight for the three all-electric vehicles (metric 'empty') at +4.8% / +0.6% / -2.6%, all three inside +/-5%. NASA's empty weight INCLUDES the battery and ours excludes it, so the comparison adds Wbat back - proved from the table's own identity, empty + crew/fluids + payload = DGW to the pound" },
  weightGroups:{ status:"sourced", src:"as above; only ~63% of the sum is geometry/power driven" },
  tres:        { status:"sourced", src:"14 CFR 91.151(b) — 20 min VFR for rotorcraft; FAA powered-lift SFAR for powered-lift. EASA SC-VTOL VTOL.2430(b)(4) requires a sufficient reserve and states no number" },
  oeiSurvivable:{status:"sourced", src:"CS-VTOL AMC 27.65 method; thresholds not validated against a real OEI case" },
  OEI_margin_pct:{status:"sourced", src:"(N-1)/N x T/W; arithmetic verified by hand" },
  selAF:       { status:"sourced", src:"UIUC ADB / Abbott & von Doenhoff tables; SELECTION RULE is unvalidated" },
  Swing:       { status:"derived", note:"lift equation at cruise; standard" },
  bWing: { status:"validated", src:"Wing span. VALIDATED: scored against published span for Joby S4 and Archer Midnight in validation/validate.mjs, and isolated from the mass model by re-running the wing at the PUBLISHED MTOW - 2.6% mean over two aircraft on that isolated test" },
  Etot: { status:"validated", src:"Mission energy. VALIDATED: scored against Table 12 installed battery capacity (capacity_MJ) for the three all-electric vehicles (metric 'energy') at +4.7% / -2.2% / -11.3%" },

  // ── UNVERIFIED: shown in the UI, never checked against anything ──
  SM:          { status:"sourced", src:"SM=(x_np-x_cg)/MAC. NP carries the CL_ah/CL_aw ratio (VT AOE3134 / Raymer §16); CG is now from the component buildup at sourced stations. Reported as a BARE-AIRFRAME property — it is not the certification gate for an augmented eVTOL, see smCriterion. Still optimistic: the fuselage term CM_af is omitted" },
  SM_vt:       { status:"sourced", note:"same correction applied; still rests on uncited CG station fractions and omits the fuselage term" },
  xNP:         { status:"sourced", src:"standard tail-volume form with slope ratio; FUSELAGE TERM CM_af STILL OMITTED and is destabilising, so this remains optimistic" },
  tailSlopeRatio:{ status:"sourced", src:"Raymer Eq.12.6 applied to both surfaces" },
  wingLEfrac:  { status:"unverified", note:"inherited 0.2589 was evidently reverse-engineered to yield ~15% SM — the solver reproduces 0.259 for a 15% target. Now a parameter" },
  wingLEfracForTargetSM:{ status:"derived", note:"wing station that achieves targetSM; turns stability into a design outcome instead of a fixed constant" },
  wingAutoPositioned:{ status:"sourced", src:"Standard conceptual-design practice (Raymer §16, Roskam): the wing is POSITIONED to place the CG a chosen fraction of MAC ahead of the neutral point, rather than frozen. Solved by a root find on the true outer function g(frac)=SM(full sizing at frac)-targetSM — iterating the cheap in-sizing scan was tried and two-cycles, because that scan's slope is a partial derivative taken at fixed MTOW" },
  wingPosConverged:{ status:"derived", note:"true only when the returned geometry actually carries targetSM; asserted by the identity suite (negative control: breaking the rebuild fails 8/8 points)" },
  wingPosUnreachable:{ status:"derived", note:"SM is NOT monotonic in wing station — moving the wing aft carries the CG aft but shortens the tail arm, so SM peaks then falls. Some targets have no solution; reported with the best attainable margin instead of a false answer" },
  wingPosBestSM:{ status:"derived", note:"maximum static margin attainable at this geometry over the scanned station range" },
  wingPosBestFrac:{ status:"derived", note:"the station at which that maximum occurs — reported instead of returning a closest-non-solution when the target is unreachable" },
  wingPosBracketed:{ status:"derived", note:"true when a sign change in g(frac)=SM(frac)-targetSM was bracketed. For DIVERGENT designs SM(station) is discontinuous — the sizing loop lands on a different branch either side — so a bracket does not by itself prove a root exists; wingPosReason distinguishes the two" },
  wingPosEvals:{ status:"derived", note:"full sizings spent, typically 4. Counted independently of the result cache: an earlier version guarded the loop on cache MISSES, so oscillating between two already-evaluated stations never incremented it and the solver spun forever — a hung tab in a browser" },
  wingPosHistory:{ status:"derived", note:"the solve trace, bounded to 64 entries for the same reason" },
  wingPosTargetSM:{ status:"derived", note:"echo of targetSM, so a result carries the target it was solved against" },
  wingPosSMError:{ status:"derived", note:"achieved SM minus target; measured 0.00-0.09 percentage points. Null when unconverged rather than reporting a misleading zero" },
  wingPosReason:{ status:"derived", note:"distinguishes target-above-attainable from a discontinuous SM curve (sizing loop landing on a different branch either side of the crossing)" },
  xCGtotal:    { status:"sourced", src:"mass-weighted mean of the Raymer buildup component masses at documented stations (engine/cg.js). Systems at 40-50% fL and 'engines at the point where they are mounted' are Roskam/Torenbeek via Scholz ch.10; wing CG at 40% MAC is Raymer ch.15. Propulsion now sits at the rotor stations, not the fuselage centroid" },
  xCGempty:    { status:"sourced", src:"same buildup-based station model; replaces the invented 35/18/22/4/21 split that contradicted the engine's own weight buildup" },
  cgItemised:  { status:"derived", note:"per-group mass and station, so the CG is auditable line by line" },
  xRotCentroid:{ status:"derived", note:"rotor array midpoint; fore/aft span equals boomLengthFracFusLen (0.70), the constant weights.js already uses for boom mass" },
  hoverLoadedRotorRatio:{ status:"derived", note:"thrust split forced by CG offset from the rotor-array centroid; previously undetectable because the motors were placed at the CG by construction" },
  smCriterion: { status:"sourced", src:"EASA MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2135: the VTOL method 'is different from CS-23 and CS-27, since in those certification specifications, the HQ of an aircraft are suitably assessed on the addition of the compliance to static or dynamic stability requirements'. Compliance is by MHQRM (ADS-33E HQR). NASA practice matches — Johnson & Silva 2022 §6.7 uses SIMPLI-FLYD/CONDUIT to disturbance-rejection bandwidth, not static margin" },
  /* xCGempty and xACwing were re-declared here as bare "unverified" stubs,
     silently overriding the sourced entries above and below. A duplicate key
     in an object literal is not an error in JS — the last one wins — so the
     registry was reporting a worse status than the model deserved and nothing
     complained. provenance-report.mjs now parses this file and fails on it. */
  Svt_total:   { status:"unverified", note:"V-tail sizing chain never compared to a real V-tail" },
  Svt_panel:   { status:"unverified" }, Sh_req:{ status:"unverified" }, Sv_req:{ status:"unverified" },
  pitch_ratio: { status:"unverified" }, yaw_ratio:{ status:"unverified" },
  delta_rv_deg:{ status:"unverified" }, delta_yaw_rv_deg:{ status:"unverified" },
  Wvt_total:   { status:"unverified" }, bvt_panel:{ status:"unverified" }, sweep_vt:{ status:"unverified" },
  Nseries:     { status:"unverified", note:"pack architecture assumes 3.6 V / 5.0 Ah / 800 V bus, all hardcoded" },
  Npar:        { status:"unverified" }, Ncells:{ status:"unverified" }, PackV:{ status:"unverified" },
  PackAh:      { status:"unverified" }, CrateHov:{ status:"unverified" }, CrateCr:{ status:"unverified" },
  Pheat:       { status:"unverified", note:"0.030 ohm per cell assumed" },
  SEDpack:     { status:"unverified" },
  Vstall:      { status:"unverified" }, VA:{ status:"unverified", note:"capped at VC; a feasibility check then FAILS whenever the cap binds" },
  VD:          { status:"unverified", note:"1.25 x VC assumed" }, vnData:{ status:"unverified", note:"manoeuvre boundary only, capped at this design's manoeuvre limits (vnBasis.capPos/capNeg). The gust lines travel in vnBasis.gustLines" },
  vnBasis: { status:"sourced", src:"[SRC] EASA MOC SC-VTOL Issue 2, 12 May 2021, MOC VTOL.2200(f): 'The positive load factor is not less than 2.0 and the negative limit manoeuvring load factor is not less than -0.5.' The caps are the design's own proposal (3.5/-1.5 when unset, no source) floored at those minima. Gust lines: MOC VTOL.2215(f) 9.14/15.24/20.12 m/s. This entry USED to say VTOL.2215 carries no gust velocity; it does, verbatim, and engine/loadcases.js had quoted it all along" },
  TipSpd:      { status:"sourced", src:"now a parameter; default 550 ft/s = 167.6 m/s (NASA lift+cruise). Joby measured 145 m/s" },
  RPM:         { status:"unverified", note:"follows from the fixed tip speed" },
  ChordBl:     { status:"unverified", note:"solidity hardcoded 0.10 then back-computed — circular; BEM tab disagrees" },
  BladeAR:     { status:"unverified" }, Torque:{ status:"unverified" },
  MotMass:     { status:"unverified", note:"P/5.0 kW/kg; not fed back into empty weight in the fraction model" },
  PmotKW:      { status:"unverified", note:"1.15 x hover margin, unsourced" },
  PpeakKW:     { status:"sourced", src:"NASA Table 4 transient capability, selected by rotor count and control scheme; governing criterion reported. Was an unsourced 1.725x hover" },
  motorTransientFactor:{ status:"sourced", src:"Johnson & Silva 2022 Table 4; NASA notes multirotor powerplant sizing criteria do not yet exist" },
  dBA_100m:    { status:"validated", src:"64 dBA against the NASA-measured Joby upper bound of 65 dBA at 100 m (AIAA 2022-3036 / NTRS 20220006729) — 1 dB margin, scored as a BOUND because the published figure is 'below 65' and scoring it as an equality would reward sitting on the limit. Was +12.6 dB before the vortex-constant fix (a ft^2/m^2 conversion applied in the wrong direction, worth 20.6 dB)" },
  dBA_1m:      { status:"sourced", note:"1 m reference is inside the rotor near field — a normalisation, not a physical observer position" },
  dBA_150m:    { status:"sourced", note:"hover only; drives the EASA 65 dBA verdict. Anchored by the validated 100 m point but not itself measured" },
  dBA_500m:    { status:"unverified", note:"HOVER noise propagated. NASA's 45.2 dBA at 500 m is CRUISE overflight — the engine has no cruise acoustics, so these are not the same quantity" },
  BPF:         { status:"sourced", note:"blade passage frequency now follows real tip speed and blade count" },
  dist_65dBA:  { status:"sourced" }, OASPL_total_1m:{ status:"sourced" },
  bpfHarmonics:{ status:"unverified" }, noise_sensitivity:{ status:"unverified" },
  noiseComponents:{ status:"sourced", note:"tonal/broadband/vortex split — added to expose which term dominates" },
  rpData:      { status:"unverified" }, ferryRange:{ status:"unverified" }, maxPayloadRp:{ status:"unverified" },
  checks:      { status:"unverified", note:"several thresholds are still hardcoded without citation (n=3.5, Mtip 0.70, tail/wing area 25-50%, fus/span 0.50-0.72). The SM band is now augmentation-dependent and sourced" },
  feasible:    { status:"unverified", note:"an AND over the real CHECKS only — advisories and known omissions are excluded, because they are disclosures about the MODEL, not verdicts on the design" },
  checksPassed:{ status:"derived", note:"passing real checks. Excludes kind:'omission' and kind:'advisory'" },
  checksTotal: { status:"derived", note:"real checks only" },
  omissions:   { status:"derived", note:"physics deliberately NOT modelled — fuselage pitch moment CM_af, hover download. These can never pass, so counting them as failures meant the shipped default could never show a clean board, which trains people to ignore red. Both bias the design OPTIMISTIC and stay visible" },
  checksNotApplicable:{ status:"derived", note:"criteria scoped OUT by configuration. A check written for a winged aircraft is not a FAILURE on a rotorcraft, it is inapplicable - static margin in %MAC on an aircraft with no MAC, V-tail authority where NDARC gives nTail=0, wing tip deflection with no wing. Returned separately so nothing is silently dropped. NDARC does this structurally: a configuration with nWing=0 never builds the wing component, so its criteria never exist" },
  advisories:  { status:"derived", note:"criteria that are not verdicts. Fus/Span: the 0.50-0.72 band is uncited and NASA's own L+C scores 0.462. Motor OEI peak: the requirement is sourced but the available-peak side applies a minutes-scale datasheet ratio to a seconds-scale event" },

  /* ══════════════════════════════════════════════════════════════════
     MISSION AND ENERGY CHAIN
     Phase powers and times. Phov is validated; the forward-flight powers
     rest on the computed L/D and have never been compared to a real
     aircraft. The energies are P x t — arithmetic on those powers.
     ══════════════════════════════════════════════════════════════════ */
  MTOW1:       { status:"derived", note:"first-round MTOW before the battery/empty-weight loop re-converges; an intermediate, not a design point" },
  Wbat: { status:"validated", src:"Battery mass. VALIDATED: scored against NASA/TM-20210017971 Table 12 pack weight for all three all-electric concept vehicles (validation/nasa-configs.mjs, metric 'pack') at +4.5% / -1.8% / -11.1%, two of three inside +/-5%" },
  Pcl:         { status:"sourced", src:"P = D·V/eta with drag from the converged polar, plus the weight-rate term. Re-derived from the converged L/D each iteration since the loop was closed — the climbLDPenalty derate itself is UNSOURCED" },
  Pcr:         { status:"sourced", src:"P = W·V/((L/D)·etaSys) on the converged LDact, which IS validated for the NASA case" },
  Pdc:         { status:"sourced", src:"same form as climb, with the descent angle re-derived from the converged L/D" },
  Pres:        { status:"sourced", src:"reserve flown at 0.76·Vcruise as a best-endurance proxy for an electric aircraft; the 0.76 factor is NOT sourced" },
  tto:         { status:"sourced", src:"120 s hover OGE for takeoff — Johnson & Silva 2022 §5 UAM primary sizing mission. Was 30.5 s (an assumed 0.5 m/s vertical transit), i.e. 3.9x short" },
  tld:         { status:"sourced", src:"120 s hover OGE for landing — same source" },
  tcl:         { status:"derived", note:"climb distance / ground speed; ground speed carries the headwind" },
  tcr:         { status:"derived", note:"cruise distance / ground speed" },
  tdc:         { status:"derived", note:"descent distance / ground speed" },
  Tend:        { status:"derived", note:"sum of the phase times; the mission-profile x-axis" },
  Eto:         { status:"derived" }, Ecl:{ status:"derived" }, Ecr:{ status:"derived" },
  Edc:         { status:"derived" }, Eld:{ status:"derived" },
  Eres:        { status:"sourced", src:"the LARGER of the 20-min time criterion and 10% of mission energy — Johnson & Silva 2022 §5 states the reserve as a minimum of the two; only the time form existed before" },
  missionRange:{ status:"derived", note:"p.range MINUS the reserve distance. p.range is mission+reserve, so changing reserveMinutes alone silently reallocates distance to cruise" },
  reserveDistKm:{ status:"derived", note:"0.76·Vcruise x reserve time" },
  totalRange:  { status:"derived", note:"the range actually flown = mission + reserve" },

  /* ══════════════════════════════════════════════════════════════════
     WING SIZING AND PLANFORM  (engine/wing.js)
     Wing loading is the design variable now, not an asserted cruise CL.
     The design W/S is CALIBRATED on two published spans, so it is a fit
     rather than a prediction — but span re-run at the published MTOW then
     reproduces those aircraft to +2.5% / -2.8%, which is the real test.
     ══════════════════════════════════════════════════════════════════ */
  WL:          { status:"calibrated", src:"design wing loading anchored on Joby S4 1524 N/m2 and Archer Midnight 1371 N/m2, both from published span and MTOW. A fit over 2 aircraft" },
  wingLoadingNm2:{ status:"calibrated", note:"same quantity as WL; kept because panels read it by this name" },
  wingLoading_kgm2:{ status:"calibrated", note:"WL/g — the form published sources quote (Joby ~155, Archer ~140 kg/m2)" },
  wingAreaDriver:{ status:"derived", note:"which of the two constraints binds. S = max(W/(W/S), W/(q·CLmax_cruise)) — Raymer ch.5 constraint diagram" },
  CLcruise:    { status:"sourced", src:"DERIVED from the wing the aircraft has, not asserted: CL = W/(qS). Corroborated once — Joby comes out 0.326 against 0.34 computed independently from its published span — but it is not in the scored validation set" },
  Ymac:        { status:"derived" }, Xac:{ status:"derived" }, sweep:{ status:"derived" },
  Re_:         { status:"derived", note:"Reynolds number at MAC; feeds the airfoil CDmin interpolation" },
  Mach:        { status:"derived" },
  afScored:    { status:"derived", note:"the airfoil scoring table. The RULE is unvalidated (see selAF); this exposes how each candidate scored so the choice is auditable" },
  CDi:         { status:"derived", note:"CL^2/(pi·AR·e) on the DERIVED cruise CL. It was previously identical for every design in a sweep, because the wing had been sized to force CL constant" },
  CDtot:       { status:"derived" },

  /* ══════════════════════════════════════════════════════════════════
     BATTERY BASIS AND THE POWER BRANCH
     ══════════════════════════════════════════════════════════════════ */
  sedBasis:    { status:"derived", note:"declares whether sedCell is cell-level (three deratings apply) or already net pack-usable. No new physics — it stops a published pack figure being double-derated" },
  sedEffUsable:{ status:"derived", note:"the specific energy that actually sizes the pack after the active deratings" },
  battSpecPowerKWkg:{ status:"sourced", src:"SP = SED_eff x C_max / 1000. Was a bare `spBattery || 1.0` inlined in four places with no default, documentation or source — and it can become the BINDING constraint" },
  maxCRate:    { status:"sourced", src:"hover discharge runs 3-5C; 4.0 default. The same regime cRateDerate models on the energy side, so both sides of the battery model are now consistent" },
  battPowerLimited:{ status:"derived", note:"true when W_P >= W_E. The power branch grows linearly in Phov while Phov grows as W^1.5 — this is how the weight-growth runaway starts" },
  WE_kg:       { status:"derived", note:"energy-limited battery mass" },
  WP_kg:       { status:"derived", note:"power-limited battery mass" },

  /* ══════════════════════════════════════════════════════════════════
     MISSION BASIS AND SIZING DAY  (engine/mission.js, engine/atmosphere.js)
     No new physics — coherent SETS of existing parameters, so a hot-and-
     high day cannot be mixed with a zero-reserve marketing range.
     ══════════════════════════════════════════════════════════════════ */
  missionBasis:{ status:"sourced", src:"certification set = Johnson & Silva 2022 §5 UAM primary sizing mission. Marketing set is INFERRED from published pack/range pairs via the mission-convention bracket in validate.mjs, and is labelled in code as not a certification basis" },
  missionBasisLabel:{ status:"derived" },
  headwindMS:  { status:"sourced", src:"NASA UAM design mission: 'carrying six passengers over a 75 nm range (with 10 kt headwind)'. Power is set by airspeed and distance by ground speed, so it is a ~14% cruise-energy penalty at 83 kt" },
  reserveMinutesUsed:{ status:"sourced", src:"14 CFR 91.151(b) (rotorcraft) / FAA powered-lift SFAR. EASA SC-VTOL VTOL.2430(b)(4) requires a sufficient reserve but states NO number (MOC SC-VTOL Issue 2 p.5 refers only to 'the sufficient reserve accepted for compliance with VTOL.2430(b)(4)'); 14 CFR 91.151(b) gives 20 min VFR for rotorcraft. Reported separately because reserveMinutes:0 is a legitimate input that a `|| 20` default used to silently overwrite" },
  sizingDay:   { status:"sourced", src:"nasa-uam = 5,000 ft AND ISA+20 applied to field and cruise — 'All the segments are flown at atmospheric conditions of 5,000-ft altitude and ISA+20C' (Johnson & Silva 2022 §5)" },
  sizingDayLabel:{ status:"derived" },
  fieldElevM:  { status:"sourced", src:"the resolved field elevation after the sizing day is applied; hover power is computed at this density, not at a hardcoded 1.225" },
  deltaISA_used:{ status:"sourced", src:"ICAO Doc 7488. Density comes from the gas law at actual temperature, so ISA deviation genuinely changes hover power — it previously did not" },

  /* ══════════════════════════════════════════════════════════════════
     CRUISE DUTY AND CRUISE-SIDE REDUNDANCY
     The engine sized motors on a ~2 min hover peak and never asked what
     they must hold for the whole cruise leg, nor what a failure costs in
     cruise. Both thresholds are engineering judgement, not regulation.
     ══════════════════════════════════════════════════════════════════ */
  nCruiseUnits:{ status:"derived", note:"tilting rotors plus any pusher — the units actually producing cruise thrust" },
  cruiseDutyFrac:{ status:"unverified", note:"cruise share per unit against its hover rating. An electric motor's CONTINUOUS rating is well below peak (thermal, not torque), but the 80% threshold the check uses is UNCITED" },
  cruiseThrustLossPerFailurePct:{ status:"derived", note:"1/N of cruise thrust. On a wing-tip rotor the asymmetry also acts at the largest possible arm, which this scalar does not capture" },

  /* ══════════════════════════════════════════════════════════════════
     CONFIGURATION  (engine/configuration.js)
     One resolver. drag.js, weights.js and booms.js had each inferred the
     layout independently from the same loose parameters.
     ══════════════════════════════════════════════════════════════════ */
  configType:  { status:"derived", note:"the resolved layout key; falls back to liftcruise when unset" },
  configLabel: { status:"derived" }, configNote:{ status:"derived" },
  nRotorsStoppedResolved:{ status:"sourced", src:"NDARC 12-9 stoppable rotor — stopped blades carry drag on geometric blade area" },
  hubsExposedResolved:{ status:"sourced", src:"NDARC 12-10: 'a rotor with a spinner (such as on a tiltrotor aircraft) would likely not have hub drag'" },
  hasCruisePropResolved:{ status:"sourced", src:"a separate propulsor exists only when nothing else provides cruise thrust. Deriving it from nStopped>0 charged Archer Midnight 69.6 kg for a pusher it does not have" },
  hasBoomsResolved:{ status:"derived", note:"booms follow the LAYOUT, not the stopped count — a multicopter carries booms and stops nothing, while an explicit nRotorsStopped:0 on a lift+cruise means no lift booms" },
  configExplicitOverride:{ status:"derived", note:"true when the caller set nRotorsStopped/hubsExposed directly, as every reference aircraft does" },

  /* ══════════════════════════════════════════════════════════════════
     AVIONICS  (engine/avionics.js)
     The ARCHITECTURE is sourced — SC-VTOL category drives the lane count
     on the flight-critical chain. The per-unit MASSES are not, and the
     total has never been compared with a published avionics weight.
     ══════════════════════════════════════════════════════════════════ */
  avionicsMassKg:{ status:"sourced", src:"Replaced a flat 45 kg with a component buildup: redundancy from the SC-VTOL Basic/Enhanced split, per-unit masses [LAY] representative civil equipment, plus 35% harness and racking. THE SUM IS NOW CORROBORATED, which it previously was not. FLOPS (The Flight Optimization System Weights Estimation Method, Eq. 108) gives WAVONC = 15.8 * DESRNG^0.1 * NFLCR^0.7 * FPAREA^0.43 lb; at NASA's quadrotor design point (75 nmi, 1 flight crew, 7.2 x 1.65 m fuselage = 128 ft^2 planform) that is 196 lb = 88.9 kg against this model's 92.5 kg — agreement within 4%, from a completely independent regression. So the avionics group is NOT the source of the systems-group over-prediction, which was the working hypothesis until it was tested" },
  avionicsLanes:{ status:"sourced", src:"SC-VTOL: Enhanced must have continued safe flight and landing, so no single failure may prevent it -> triplex; Basic may permit a controlled emergency landing -> duplex" },
  avionicsCategory:{ status:"sourced", src:"SC-VTOL category Basic vs Enhanced" },
  avionicsArchitecture:{ status:"derived" },
  avionicsItems:{ status:"derived", note:"the component list with lane counts, so changing the architecture visibly changes the mass" },

  /* ══════════════════════════════════════════════════════════════════
     BATTERY THERMAL, BMS AND PACK INSTALLATION  (engine/battery-thermal.js)
     Pheat was computed and nothing rejected it or weighed the system that
     would. The retention loads here are REGULATORY; the runaway masses are
     not — the MOC gives no number, only a direction.
     ══════════════════════════════════════════════════════════════════ */
  PheatCruise: { status:"unverified", note:"same 0.030 ohm/cell internal resistance as Pheat — assumed, not sourced. It is in WATTS: ~108 kW at hover is 12.8% of hover power, which is correct and not a unit error" },
  btmsMassKg:  { status:"sourced", src:"published eVTOL liquid-cooling studies: system mass under 20% of pack, with specific designs at 46 kg (holding the pack below 49.5 C) and 65-80 kg for tighter control. AIAA J. Aircraft 10.2514/1.C037404 is the authority and is paywalled — the BAND is what is encoded, not the paper" },
  btmsFracPack:{ status:"sourced", src:"the under-20%-of-pack bound above, enforced so the model cannot silently produce an absurd cooling system" },
  btmsCapped:  { status:"derived", note:"true when that bound binds" },
  btmsRejectKW:{ status:"sourced", src:"sized on the SUSTAINED cruise case, not the hover peak — hover is hotter but short enough that pack thermal mass absorbs much of it, and sizing on 108 kW would give a system never used at capacity" },
  bmsMassKg:   { status:"unverified", note:"no published BMS mass basis was located. It also overlaps the 3%-of-MTOW electrical group; the double-count is left in deliberately and flagged in code, because over-counting a few kg of electronics is the safer error" },
  packMountMassKg:{ status:"sourced", src:"MOC SC-VTOL VTOL.2325(a)(4) ultimate inertial load factors, sized as a sandwich TRAY in bending. The pure-tension idealisation gave 0.5 kg to restrain a 1358 kg pack at 20 g — an idealised load path is always far lighter than real structure" },
  packContainmentKg:{ status:"unverified", note:"[LAY] fractions of pack mass: 0.030 non-propagation, 0.060 containment. MOC-3 VTOL.2440 gives NO mass figure, so only the ORDERING and magnitude are encoded — and a first implementation inverted even that" },
  packSystemsMassKg:{ status:"derived", note:"BTMS + BMS + tray + containment. Must be INSIDE the sizing loop: at a 12% closure margin a post-loop correction understates MTOW by hundreds of kg" },
  packSystemsFracPack:{ status:"derived" },
  cellDTHoverK:{ status:"sourced", src:"lumped-mass transient dT/dt = (Qgen - Qrej)/(m·cp); Li-ion cp 1000-1100 J/(kg K), 1050 used" },
  cellPeakC:   { status:"sourced", src:"the same integration from ambient" },
  cellWithinMax:{ status:"sourced", src:"Li-ion maximum threshold ~55 C for this duty" },
  cellWithinOptimal:{ status:"sourced", src:"Li-ion optimal band 25-45 C" },
  cruiseThermalBalanced:{ status:"derived", note:"reject capacity against cruise generation" },
  packLocation:{ status:"derived" },
  packLocationLabel:{ status:"derived" },
  packLoadFactors:{ status:"sourced", src:"MOC SC-VTOL VTOL.2325(a)(4), quoted verbatim: in cabin Up 4g / Fwd 16g / Side 8g / Down 20g / Aft 1.5g; above or adjacent an occupied compartment 1.5/12/6/12/1.5; other areas 1.5/4/2/4/1.5 — a factor of FIVE in mount loads purely from where the pack sits" },
  packLoadFactorGoverning:{ status:"derived", note:"the largest factor for the chosen location" },

  /* ══════════════════════════════════════════════════════════════════
     LANDING GEAR AND TYRES  (engine/landinggear.js)
     Sized by ROTORCRAFT drop tests, not aeroplane descent velocity — the
     third time reference class turned out to be the actual defect. The
     drop-height criterion here was SUPERSEDED in July 2025, and the stale
     citation had been over-sizing the gear by 55%.
     ══════════════════════════════════════════════════════════════════ */
  gearMassKg:  { status:"calibrated", src:"strutMassCoef is [CAL], set so the group lands in Roskam Part V's 4-6% light-aircraft band. CAVEAT CARRIED IN CODE: an eVTOL may legitimately sit BELOW that band — it touches down vertically at low speed with up to two-thirds of weight still on the rotors, where an aeroplane arrives at 60+ kt with all of it" },
  gearMassFracMTOW:{ status:"calibrated", note:"the fit target itself, so it is not independent evidence" },
  gearStrokeMm:{ status:"sourced", src:"energy balance 1/2 m v^2 + (1-L) m g (s_s+s_t) = n m g (eta_s s_s + eta_t s_t); efficiencies oleo 0.85 / spring 0.50 / tyre 0.47 (Currey; Raymer ch.11). Stroke is MASS-INDEPENDENT for a given load factor, which is a useful sanity check" },
  gearDropVLimitMs:{ status:"sourced", src:"MOC-4 SC-VTOL VTOL.2235(b), 11 July 2025: CS 27.725 Amdt 6 accepted with the modification that drop height must give the greatest probable sinking speed in NORMAL landings, 'but not less than 0.20 m (8 in)'. CS 27.725(a)(1)'s flat 13 in is GONE" },
  gearDropVReserveMs:{ status:"sourced", src:"CS 27.727 reserve-energy drop is 1.5x the HEIGHT, so the velocity ratio is sqrt(1.5) = 1.22, NOT 1.5 — treating it as 1.5x velocity over-sizes the gear ~50% in energy" },
  gearBottomsOut:{ status:"sourced", src:"MOC VTOL.2235 is explicit: 'Shock absorbing devices, such as oleos, should not bottom during the reserve energy drop test'" },
  tyreMain:    { status:"sourced", src:"Goodyear Aviation Databook 6-2018 (TSO-C62e), 12 entries transcribed line by line — the table is column-shredded and a bulk regex produces junk sizes" },
  tyreMainRatedLb:{ status:"sourced", src:"the same databook" },
  tyreMainRequiredLb:{ status:"derived", note:"static wheel load with the tricycle nose fraction" },
  tyreMainMarginPct:{ status:"derived", note:"surfaces a KNOWN GAP: the transcribed table has nothing between 3,300 and 5,900 lb rated, so a 3,586 lb requirement jumps to the 5,900 lb tyre at 64.5% margin" },
  tyreMainAdequate:{ status:"derived" },
  tyreNose:    { status:"sourced", src:"the same databook" },

  /* ══════════════════════════════════════════════════════════════════
     STRUCTURAL LOAD CASES  (engine/loadcases.js)
     SC-VTOL, not CS-23 — using aeroplane gust numbers here would be the
     same reference-class error as Raymer's GA weight equations.
     ══════════════════════════════════════════════════════════════════ */
  nLimit:      { status:"sourced", src:"worst of manoeuvre and the SC-VTOL gust set. MOC VTOL.2200(f): limit manoeuvring factors 'should be defined based on the maximum capability of the aircraft, taking into account the flight control system', positive 'not less than 2.0'. The 3.5 default is inherited GA practice, kept only so existing designs are unchanged" },
  nUltimate:   { status:"sourced", src:"1.5 x limit, stated identically by both authorities: AC 21.17-4 App.A PL.2230(b) and SC-VTOL-02 VTOL.2230(a)(2)" },
  nLimitNeg:   { status:"assumed", src:"MOC VTOL.2200(f) floors the negative limit manoeuvring load factor at -0.5; the -1.5 carried here is an APPLICANT PROPOSAL with no source, exactly as regdb.js says. loadCases() had computed it since it was written and engine.js never exported it, so the V-n table, the V-n figure and the regulation tracker each carried their own copy" },
  weightsNzUltimate:{ status:"sourced", src:"the ultimate load factor the AFDD93 wing and AFDD84 fuselage equations were evaluated at, handed to them from the load cases inside the sizing loop. NDARC Theory: nzult 'is specified, in particular for use in the component weight estimates'. Was a hardcoded 5.25 until 2026-09-16; null under the fraction weight model, which sizes no structure to any load factor" },
  loadFactorBasis:{ status:"derived", note:"wing-borne or thrust-borne. A wingless layout has no gust case — its limit factor is MOC VTOL.2200(f) maximum capability floored at 2.0 — and reporting null for it left four consumers writing their own 3.5" },
  loadFactorSource:{ status:"derived", note:"the paragraph that produced the number, carried with it so a display cannot cite one authority while showing another's value" },
  loadGoverningCase:{ status:"derived", note:"a full-authority FBW eVTOL sitting near the 2.0 floor is GUST-sized, and its spar cap is 23% smaller than the inherited 3.5g assumption produced" },
  gustGoverns: { status:"derived" },
  gustCases:   { status:"sourced", src:"MOC SC-VTOL VTOL.2215(f): 9.14 m/s (30 ft/s) up to VD; 15.24 m/s (50 ft/s) up to VH or VNE; 20.12 m/s (66 ft/s) up to VB for Category Enhanced" },
  gustAlleviationKg:{ status:"sourced", src:"standard sharp-edged-gust alleviation Kg = 0.88 mu/(5.3+mu). Essential — a lightly loaded wing is accelerated by the gust before penetrating it and never sees the full increment. The MOC's (1-cos) shape implies a dynamic analysis, out of scope at conceptual level" },
  massRatioMu: { status:"sourced", src:"mu = 2(W/S)/(rho c_bar a g)" },

  /* ══════════════════════════════════════════════════════════════════
     WING BOX — DETAIL DESIGN, NOT THE MASS MODEL  (engine/wingbox.js)
     AFDD93 in weights.js supplies the wing MASS: a regression over 25
     aircraft, 3.4% quoted error, and what validation is calibrated on.
     This supplies the DESIGN — gauges, margins, buckling mode, deflection
     — none of which a regression can produce. The gap is reported, not hidden.
     ══════════════════════════════════════════════════════════════════ */
  wingBoxMassKg:{ status:"sourced", src:"Schrenk spanwise loading (NACA TM-948, 1940), two-cap bending idealisation, Bredt-Batho torsion, ribs at panel-AR ~1, plus NDARC 29-1.2 secondary structure. NOT used for mass — it reads ~30% below AFDD93, which is what an idealised single-load-case model should do against a regression fitted to real aircraft" },
  wingBoxPrimaryKg:{ status:"sourced", src:"the torque box alone — caps, webs, skin, ribs" },
  wingBoxFPrim:{ status:"sourced", src:"NDARC 29-1.2 f_prim = 1 - f_fair - f_flap - f_fit. It comes out 0.608, squarely inside the expected 55-70% band, which independently validates the primary/secondary split" },
  wingBoxVsCorrelationPct:{ status:"derived", note:"the gap against AFDD93, reported so it cannot be forgotten. The remaining cause is ONE LOAD CASE — the box is sized for symmetric manoeuvre and gust only, not rolling pull-out, landing or ground handling" },
  rootBendingKNm:{ status:"sourced", src:"tip-to-root integration of the Schrenk load. A spurious /2 once made bending and shear both 2x light — load(y) is already a per-unit-span intensity" },
  rootShearKN: { status:"sourced", src:"the same integration" },
  rootCapAreaMm2:{ status:"sourced", src:"sized on a 350 MPa COMPRESSION allowable for UD carbon after fibre microbuckling, BVID and hot/wet knockdowns. Sizing caps on the ~1.5 GPa tension value is a classic way to produce an impossibly light wing" },
  rootWebThkMm:{ status:"sourced", src:"Bredt-Batho shear flow" },
  rootSkinThkMm:{ status:"sourced", src:"minimum gauge governs — torsion alone demands 0.100 mm against the 0.8 mm carried" },
  rootEI_MNm2: { status:"derived" }, rootStressMPa:{ status:"derived" }, rootStrainMicro:{ status:"derived" },
  msStress:    { status:"derived", note:"zero BY CONSTRUCTION at the root — the cap is sized so stress equals the allowable, so this reads 0% and the check must tolerate -0.5%. A check that can never pass is noise" },
  msStrain:    { status:"derived", note:"reported alongside stress because composite primary structure is often strain-critical; showing only one hides the governing case" },
  structGoverning:{ status:"derived", note:"which of stress and strain binds" },
  skinConstruction:{ status:"derived" },
  skinAllowableMPa:{ status:"sourced", src:"Hexcel HexWeb Honeycomb Sandwich Design Technology. A 0.8 mm monolithic skin over a 0.69 m panel buckles at 0.34 MPa against a 350 MPa cap allowable — structurally useless in compression, which is exactly why real wings use stringers or sandwich skins" },
  governingSkinMode:{ status:"sourced", src:"Hexcel, four modes with the lowest governing: overall panel buckling; wrinkling 0.5(Gc Ec Ef)^(1/3); intracell 2 Ef (tf/s)^2; shear crimping P_b = t_c Gc b. Hexcel's own worked example takes Gc as the WEAKER W direction (25 MPa for HRH-10 at 48 kg/m3), not L (40) — using L would be 60% optimistic" },
  tipDeflectionMm:{ status:"derived", note:"double integration of M/(EI) from the root" },
  tipDeflectionPct:{ status:"derived" },
  tipDeflectionOK:{ status:"unverified", note:"the 15%-of-semi-span limit is [LAY]; no certification or industry figure was located for it" },
  nRibs:       { status:"sourced", src:"rib pitch from panel aspect ratio ~1 (AeroToolbox)" },
  ribPitchMm:  { status:"sourced", src:"the same rule" },
  aileronAreaM2:{ status:"unverified", note:"falls out of the NDARC control-surface fraction; it is NOT sized for roll authority. The one-sided gust that would size it is reported and deliberately not summed into root bending" },

  /* ══════════════════════════════════════════════════════════════════
     WEIGHT CLOSURE
     'It converged' and 'it has margin' are different statements. The
     reciprocal of this margin is the growth factor, and it explains more
     about a design's behaviour than MTOW does.
     ══════════════════════════════════════════════════════════════════ */
  closureMargin:{ status:"derived", note:"1 - (Wempty+Wbat)/MTOW, which at closure equals the payload fraction. Its reciprocal is the growth factor: at a 12% margin one extra kg of fixed mass costs about 8 kg of MTOW" },
  closureFrac: { status:"derived", note:"must stay below 1. As it approaches 1 the sizing loop runs away and a small extra energy demand produces an unbounded MTOW" },
  payloadFrac: { status:"derived", note:"directly comparable to published aircraft: Joby 18.8%, VX4 16.1%, Beta 18.9%, Archer 14.3%, NASA L+C 12.6%" },

  /* ══════════════════════════════════════════════════════════════════
     STABILITY, CG AND ROTOR STATIONS  (engine/cg.js)
     ══════════════════════════════════════════════════════════════════ */
  CLaW:        { status:"sourced", src:"Raymer Eq.12.6 finite-wing lift-curve slope" },
  CLaH:        { status:"sourced", src:"the same relation at the tail's aspect ratio. Its RATIO to CLaW was missing from the neutral point entirely, overstating the tail term ~67% in the stabilising direction" },
  downwashGrad:{ status:"sourced", src:"de/da = 2·CL_aw/(pi·AR), the standard low-order estimate" },
  etaH:        { status:"unverified", note:"tail dynamic-pressure ratio hardcoded at 0.9; no source checked, and it is not exposed as a parameter" },
  xACwing:     { status:"derived", note:"wing station plus quarter-MAC — pure geometry on registered inputs" },
  cgBasis:     { status:"sourced", src:"Scholz 'Aircraft Design' ch.10 (HAW Hamburg, after Roskam/Torenbeek): engines and gear at their mounting points, systems at 40-50% of fuselage length; wing CG at 40% MAC is Raymer ch.15" },
  cgStations:  { status:"sourced", src:"the same, with every station tagged [SRC] or [LAY] individually. Replaced an invented 35/18/22/4/21 split that put 78% of empty weight at one station and contradicted the engine's own weight buildup" },
  xRotFwd:     { status:"unverified", note:"[LAY] rotor array at 0.10 fL, not measured against any real layout. Sweeping the fuselage station across its own sourced band moves SM by 2.8 points, so these placements matter" },
  xRotAft:     { status:"unverified", note:"[LAY] 0.80 fL — array span 0.70 fL, the same constant weights.js uses for boom mass" },
  hoverFwdThrustShare:{ status:"derived", note:"moment balance T_fwd/T = (x_aft - xCG)/(x_aft - x_fwd). Undetectable before, because placing the motors at the CG made the aircraft trimmed in hover by construction" },
  cgWithinRotorArray:{ status:"derived" },
  smCriterionLabel:{ status:"sourced", src:"see smCriterion" },
  smBasis:     { status:"sourced", src:"EASA MOC SC-VTOL VTOL.2135 — compliance is by the Modified Handling Qualities Rating Method (ADS-33E), not by a static-stability requirement" },
  smGovernedBy:{ status:"derived" },
  smMin:       { status:"unverified", note:"the fbw -10% floor is labelled ENGINEERING GUIDANCE in the code, not a regulatory limit. Do not let it harden into one" },
  smMax:       { status:"unverified", note:"25% upper band, uncited" },
  smAdvisory:  { status:"derived", note:"true for the fbw band, which is why that band is reported rather than gated" },
  targetSM:    { status:"unverified", note:"a design choice (0.15), not a requirement" },
  wingStationSM:{ status:"derived", note:"the SM the solved wing station actually delivers; asserted by identity #33, whose negative control fails 8/8 points when the rebuild is broken" },
  weightBreakBasis:{ status:"derived", note:"names which mass set the chart is drawing, after three mutually inconsistent mass sets once coexisted in one engine" },

  /* ══════════════════════════════════════════════════════════════════
     ROTOR GEOMETRY AND DISK LOADING
     There are TWO disk loadings and they are not interchangeable.
     Published figures are quoted at design gross weight, so they compare
     with the HOVER value, never with the installed-thrust one.
     ══════════════════════════════════════════════════════════════════ */
  Drotor:      { status:"derived" },
  DLrotor:     { status:"derived", note:"INSTALLED-thrust disk loading, inflated by T/W. Comparing it against published data overstates by the whole T/W ratio — 30% at the default, and doing so once produced a confident wrong conclusion" },
  DL_installed_lbft2:{ status:"derived", note:"DLrotor in lb/ft2, kept separate from the validated hover figure precisely so the two cannot be confused again" },
  DL_hover_Nm2:{ status:"derived", note:"hover equilibrium disk loading in SI" },
  dlVerdict:   { status:"derived", note:"band classifier on the VALIDATED hover figure, against NASA concept, helicopter and tiltrotor practice" },
  PLrotor:     { status:"derived", note:"power loading — hover thrust over hover power. It was previously pairing installed thrust with hover power" },
  TipMach:     { status:"derived" },
  Nbld:        { status:"unverified", note:"default 3, chosen to match the BEM tab rather than from a source. Joby measures 5 blades at 145 m/s tip speed" },
  Dq_m2:       { status:"derived", note:"equivalent flat-plate area, CD0 x S" },
  dragAreas:   { status:"sourced", src:"Component drag AREAS in m2 - the NDARC primitive. Johnson, NDARC Theory (NASA TP-20220000355) section 8: 'A fixed drag can be specified as a drag area D/q ... IF NO REFERENCE AREA IS INDICATED, THEN THE INPUT IS ONLY DRAG AREA D/q'. There is no global wing-referenced CD0 anywhere in the method; CD is a per-component non-dimensionalisation (Table 8-2: fuselage -> wetted area, hub -> disk area, wing -> planform, LANDING GEAR -> none at all). Carrying the dimensional area is what lets a WINGLESS configuration express drag" },
  Dq_ft2:      { status:"derived" },
  kVerdict:    { status:"derived", note:"band classifier on the validated kNDARC" },
  downloadFraction:{ status:"sourced", src:"XV-15 measured hover download 14.69% of thrust (NATO RTO-MP-AVT-111). DEFAULT 0 — no published value exists for lift+cruise with boom-mounted rotors, and 0.10 made the NASA case run away to 18,692 kg. Surfaced as a failing check rather than modelled silently" },

  /* ══════════════════════════════════════════════════════════════════
     MOTOR TRANSIENT AND ENGINE-OUT  (engine/motor.js)
     A motor failure is a transient control-authority problem, not steady
     thrust sharing. Both inherited numbers treated it as the latter.
     ══════════════════════════════════════════════════════════════════ */
  PmotInstalledKW:{ status:"sourced", src:"Installed CONTINUOUS shaft rating per lift motor, sized as the MAXIMUM over a set of design conditions — NDARC 3-1.1: 'Drive system torque limit: maximum torque from designated conditions and missions'. Replaced an unsourced (Phov x 1.15)/N. At the app default the governing condition is VERTICAL CLIMB at 1.144x hover, so the inherited 1.15 turns out to have been very close — but it is now derived and responds to rate of climb, rotor count and disk loading instead of being a constant" },
  PmotLegacyKW:{ status:"derived", note:"the superseded (Phov x 1.15)/N figure, reported alongside so the change is auditable rather than silent" },
  motorSizedBy:{ status:"derived", note:"which design condition governs the motor. Sustained conditions set the MASS (specific power is a thermal, continuous figure); transient conditions are checked against peak capability, not priced into mass — see the check and engine/sizing-conditions.js for why that gap is surfaced rather than guessed" },
  motorSizingConditions:{ status:"sourced", src:"the condition set from NDARC 3-1.1 ('takeoff (hover or specified vertical rate of climb), one-engine inoperative, cruise or dash'), each evaluated per motor: hover OGE, hover at installed T/W (P proportional to T^1.5), axial-climb momentum theory, NASA Table 4 OEI transient, and cruise share" },
  motorSizingRatioVsHover:{ status:"derived", note:"installed continuous rating as a multiple of hover power per motor. Rises with rotor count because more, smaller rotors have a lower induced velocity and therefore a larger relative vertical-climb increment — measured 1.110 at N=4 to 1.194 at N=10" },
  motorTransientGovernedBy:{ status:"sourced", src:"Johnson & Silva 2022 Table 4 — which criterion binds: OEI disturbance rejection, discrete gust or continuous turbulence" },
  motorTransientColumn:{ status:"sourced", src:"the Table 4 column selected by rotor count and control scheme" },
  motorTransientCriteria:{ status:"sourced", src:"the full Table 4 row set, carried so the selection is auditable. NASA's caveat travels with it: 'Sizing criteria for power plant components are not currently available for multirotor aircraft'" },
  motorTransientSubstituted:{ status:"derived", note:"true when no column exists for this rotor count and the nearest was used" },
  rotorControl:{ status:"sourced", src:"NASA: 'rpm control results in higher power transients at each motor, compared to collective control'. rpm is the default because fixed-pitch is common AND conservative" },
  PpeakLegacyKW:{ status:"derived", note:"the superseded 1.15 x 1.50 = 1.725x hover figure, kept for comparison. The default 6-rotor rpm case needs 583 kW/motor against that method's 265 kW — a 2.2x under-sizing" },
  oeiMotorOK:  { status:"sourced", src:"tested against the NASA Table 4 transient requirement rather than the steady share P_hov/(N-1), which for six rotors is only 1.2x hover" },
  oeiTransientOK:{ status:"derived" },
  boomCount:{ status:"sourced", src:"Number of lift booms. WAS A FIXED 2 for every winged layout, and it was decided in capabilitiesFor() from the TOTAL rotor count — before the stopped/tilting split is known, so it could not follow the arrangement even in principle. EVERY REFERENCE AIRCRAFT PUTS TWO ROTORS ON A BOOM, one at a forward station and one aft: BETA ALIA-250 four lift rotors on two booms; NASA RAVEN two sponsons each carrying a tilting rotor forward and a lift rotor aft; Archer Midnight twelve rotors on SIX booms. It is also the picture engine/booms.js already sizes, bending each boom about armFwd = |xWing - xRotFwd| and armAft = |xRotAft - xWing|. A fixed 2 reproduces all three only while four rotors ride booms; at twelve it asked two booms to carry ten, so the airframe drawn and the booms weighed were different structures. Now resolved from the arrangement (two rotors per boom, mirrored pairs, hence even) in resolveConfiguration where the split is known. MEASURED: total boom MASS is unchanged (77.0 kg on the app default) because it scales with total thrust rather than with the number of tubes — what changes is the wall, 11.91 mm to 3.97 mm, i.e. six correct tubes instead of two overloaded ones. Both benchmarks unmoved. Radial layouts keep their own rule (multicopter one arm per rotor); a tiltrotor keeps 0, its rotors being wing- and tail-mounted" },
  indeterminates:{ status:"derived", note:"checks whose criterion is UNPUBLISHED for this layout rather than unmet by it — kept apart from advisories so a UI never renders 'the literature has no column for your aircraft' beside 'your aircraft fails'" },
  motorTransientDeterminate:{ status:"sourced", src:"whether NASA Table 4 describes this aircraft at all. False for MIXED control (variable-pitch and fixed-pitch rotors on one airframe — no published column) and for an INTERCONNECTED drive (every Table 4 column is a multicopter with independent rotors, and Johnson & Silva 2022 state that 'removing interconnecting shafts results in higher power transients', so the published figure is an upper bound there, not a requirement)" },
  motorTransientInterconnected:{ status:"sourced", src:"read from CONFIG_DEFAULTS oeiThrustShare, which already records the interconnect shaft for the side-by-side; motor.js and configuration.js previously held OPPOSITE assumptions about the same aircraft" },
  motorTransientIndeterminateReason:{ status:"derived" },
  motorTransientFactorFloor:{ status:"sourced", src:"most favourable published Table 4 column for a bracketed (mixed-control) layout — the honest test, since missing even the floor is a real deficiency" },
  motorTransientFactorCeiling:{ status:"sourced", src:"least favourable published Table 4 column; for an interconnected drive this is an UPPER BOUND on the requirement rather than the requirement" },
  etaBatEffective:{ status:"derived", note:"etaBat after NASA's vertical-flight scoping — the value the sizing actually used" },
  EvertKWh:{ status:"derived", note:"mission energy spent in vertical flight, the part the battery-efficiency term applies to" },
  etaBatScope:{ status:"sourced", src:"'verticalOnly' (DEFAULT) applies the battery efficiency term only to hover/vertical segments, per NASA RST (corpus S3270); 'mission' restores this engine's former whole-mission form for comparison" },
  P_mot_nom_kW:{ status:"derived" }, P_mot_oei_kW:{ status:"derived" },
  T_each_oei_N:{ status:"derived" }, T_avail_oei_N:{ status:"derived" },

  /* ══════════════════════════════════════════════════════════════════
     V-TAIL CHAIN — unverified together
     Sizing runs from volume coefficients never checked against an eVTOL,
     and no output in this chain has been compared with a real V-tail.
     ══════════════════════════════════════════════════════════════════ */
  vtGamma_opt: { status:"unverified" }, governs_pitch:{ status:"unverified" },
  ruddervator_combined_auth:{ status:"unverified" },
  Sh_eff:      { status:"unverified" }, Sv_eff:{ status:"unverified" },
  Cr_vt:       { status:"unverified" }, Ct_vt:{ status:"unverified" }, MAC_vt:{ status:"unverified" },
  Srv:         { status:"unverified" }, CD0vt:{ status:"unverified" },
  lv:          { status:"unverified", note:"tail arm from the wing AC to 0.88 fL — the 0.88 is uncited. Sh = 0.18·Swing feeds the baseline NP while this block sizes tail area independently from volume coefficients" },

  /* ══════════════════════════════════════════════════════════════════
     ACOUSTICS — the rest of the distance set
     Anchored by the validated 100 m point. The propagation is sourced,
     but no other distance has been compared with measured data.
     ══════════════════════════════════════════════════════════════════ */
  dBA_25m:     { status:"sourced", src:"ISO 9613 propagation from the same source term as the validated 100 m point" },
  dBA_50m:     { status:"sourced", src:"as above" },
  dBA_300m:    { status:"sourced", src:"as above" },
  dist_55dBA:  { status:"sourced", src:"contour distance from the same propagation model" },
  dist_70dBA:  { status:"sourced", src:"as above" }, dist_75dBA:{ status:"sourced", src:"as above" },
  noise_validity:{ status:"derived", note:"flags where the model is being read outside the regime it was built for — a hover source term, a near-field 1 m normalisation, and no cruise acoustics at all" },

  /* ══════════════════════════════════════════════════════════════════
     PROPORTIONS AND SOLVER STATE
     ══════════════════════════════════════════════════════════════════ */
  fusSpanRatio:{ status:"unverified", note:"checked against a hardcoded 0.50-0.72 band with no citation. It is still a real design flag — as MTOW and span grow the fuselage becomes short relative to span" },
  tailWingRatio:{ status:"unverified", note:"25-50% band, also uncited" },
  Trotor:      { status:"derived" }, TW_hover:{ status:"derived" }, TW_cruise:{ status:"derived" },
  solverMethod:{ status:"sourced", src:"fixed-point until the residual is inside 5% of current mass, then SECANT (Newton-Raphson with the derivative taken from the two previous iterates), with bracketed bisection as the fallback. Ugwueze et al., Aerospace 2023, 10, 311: the stable phase 'brought the residual error down to 5% of the final-sized mass' within about five iterations, and 'within this narrowed range, the NR method was guaranteed to converge'. NDARC 5-2.2 likewise evaluates f' by numerical perturbation" },
  solverPhaseFinal:{ status:"derived", note:"which method actually closed the design. 'secant stalled on discrete feedback' means the residual stopped improving and the solver reverted — see solverSecantSteps" },
  solverSecantSteps:{ status:"derived", note:"MEASURED: the secant is worth ~11x on the SMOOTH fraction model (125 iterations to 11) and only ~6% on the buildup model, because buildup's residual is NOT smooth — tyre selection, airfoil selection and the motor transient column are all discrete lookups in the feedback path, and a difference quotient taken across a step is meaningless" },
  solverBisectSteps:{ status:"derived", note:"bisection is the guaranteed fallback, used only when a bracket exists and the secant step leaves it" },
  solverBracketed:{ status:"derived", note:"true once two consecutive residuals straddled zero" },
  noSolutionBelowCertLimit:{ status:"sourced", src:"f(MTOW) > 0 at the category weight limit means no design in [payload, limit] closes. Ugwueze et al. give exactly this use for bracketing — ruling out a bad parameter set against 'a regulatory limit such as the maximum mass for the aircraft category'. REPORTED, not used to stop: a design above 5,700 kg is still legitimate to size, it is simply not SC-VTOL" },
  mtowCertLimitKg:{ status:"sourced", src:"SC-VTOL category weight limit, 5,700 kg" },
  PdcRawKW:    { status:"derived", note:"descent power BEFORE the zero floor. Negative means the aircraft has more L/D than the descent angle needs and would accelerate unless energy is removed" },
  regenAvailableKW:{ status:"derived", note:"the magnitude of that negative power — what regeneration could recover in principle" },
  regenCredited:{ status:"unverified", note:"DEFAULT FALSE. The credit was previously taken SILENTLY: a negative Pdc summed straight into Etot as a -3.1 kWh reduction in mission energy, making the battery smaller. Recovering it needs the motors driven as generators, it is not standard sizing practice, and the recovery efficiency is not etaSys — so crediting it is an optimistic bias in the one direction this tool must not lean" },
  itersR1:     { status:"derived", note:"solver state, not physics" },
  itersR2:     { status:"derived", note:"hitting the 200-iteration cap sets r2Diverged; the loop previously reported the last iterate as if it had converged" },
  tol:         { status:"derived" },
  r2Converged: { status:"derived", note:"convergence is NOT feasibility — a converged design can still sit at a 3% closure margin" },
  r2Diverged:  { status:"derived", note:"THE flag to read before trusting any other number in the result. A diverged run still returns a full result object, and every value in it is the last iterate of a runaway" },
  vtolCategory: { status:"sourced", src:"SC-VTOL certification category, 'enhanced' or 'basic'. SC-VTOL-02 Issue 2: Category Enhanced is 'capable of continued safe flight and landing'; Basic may permit a controlled emergency landing. It is a SIZING LEVER worth ~2% of MTOW through avionics redundancy lanes (engine/avionics.js, triplex vs duplex) and it sets the climb requirement below. Defaulted to enhanced" },
  certClimbCategory: { status:"derived", note:"echo of vtolCategory at the climb condition" },
  certClimbGradientPct: { status:"sourced", src:"MOC-2 SC-VTOL Issue 3 (22 Dec 2022) MOC VTOL.2120: climb gradient without ground effect at 305 m above the take-off surface, at least 2.5%. Enhanced (a) following a critical failure for performance with remaining lift/thrust engines at maximum continuous power, in cruise configuration, gear retracted, at the applicant-selected speed; Basic (b) in nominal conditions at ISA SL. ONE POINT on the design condition, not an envelope showing, and computed at the per-unit continuous rating the engine derives" },
  certClimbRequiredPct: { status:"sourced", src:"2.5%, MOC VTOL.2120(a) and (b) — the same figure for both categories" },
  certClimbPass: { status:"derived", note:"gradient >= 2.5% at the condition. NOT a compliance finding" },
  certClimbCFP: { status:"derived", note:"which failure is critical for performance, from the configuration: one lift/thrust unit where the rotors tilt, the cruise propulsor where cruise thrust is separate, absent on rotor-borne layouts" },
  certClimbBasis: { status:"derived" },
  certClimbNote: { status:"derived", note:"set when a single cruise propulsor is itself the critical failure" },
  certClimbUnitsAvailable: { status:"derived" },
  descentAngleUsedDeg: { status:"unverified", note:"The descent gradient actually flown. NO SOURCE GIVES A MISSION DESCENT GRADIENT: the SFAR is silent, EASA MOC-2 leaves the glide path to the applicant, and the ICAO Annex 14 Vol II / FAA EB-105 / EASA PTS-VPT-DSN approach slopes are OBSTACLE-LIMITATION SURFACES, which ICAO Table 4-1 explicitly notes are 'minimum design slope angles and not operational slopes'. With no input the engine uses the aircraft's own glide angle atan(1/LD), which is per-layout and is NDARC's own principle (best descent angle = max V/P). The former 6 deg default came from FAR Part 36 Appendix H via Johnson & Silva 2022, where it is the NOISE CERTIFICATION approach trajectory" },
  descentSpeedMS: { status:"sourced", src:"Descent is flown at cruise speed. Hartman, Foster & Hartman, AIAA-2023-0548 (NTRS 20220017406): 'a nominal descent at cruise speed to 500 ft, transition to a low-speed descent to 100 ft, a deceleration to hover at 100 ft, and finally a vertical descent to the surface'. Previously this was RoC/sin(angle) — the CLIMB rate divided by the descent angle, which no source pairs and which gave every layout the identical 48.6 m/s" },
  descentRateMS: { status:"derived", note:"V_descent x sin(gamma). A consequence of speed and gradient, not an input. The 100 ft/min in the same AIAA paper is the VERTICAL take-off and landing rate, not the en-route descent rate" },
  massBalanceGapKg: { status:"derived", note:"(payload + Wempty + Wbat) - MTOW. Zero on a converged design, because the loop exits with MTOW set to that sum. On a design that did NOT close it is the final residual: the reported MTOW is the iterate the weight buildup was evaluated at, and the weights themselves add up to the NEXT iterate. Measured range on diverged runs 595 kg to 4,622 kg, up to 33% of the reported MTOW. Read it with r2Diverged: a non-zero gap is not a bookkeeping error, it is the non-convergence itself, made visible so that adding up the weight table does not silently disagree with the headline number" },

  /* ══════════════════════════════════════════════════════════════════
     DERIVED DISPLAY SETS
     Re-presentations of quantities registered above. They add no new
     assumption; their provenance is that of their sources.
     ══════════════════════════════════════════════════════════════════ */
  ctSigma: { status:"sourced", src:"Blade loading CT/sigma = DL/(rho*Vtip^2*sigma) — the check that decides whether a rotor can produce the thrust the rest of the model assumes. Above ~0.14 the blade is stalled in hover; 0.12 is the working limit once manoeuvre and one-rotor-out margin are wanted. THIS WAS NOT COMPUTED AT ALL until 2026-08-31, while solidity was fixed at 0.10 regardless of disk loading — which put EVERY winged configuration at CT/sigma 0.167-0.182, i.e. past hover stall, producing aircraft whose rotors cannot lift them. NASA design their UAM concept vehicles between 0.060 and 0.113, recoverable from the published solidity, disk loading and tip speed in Table 12" },
  solidityUsed: { status:"derived", note:"Rotor solidity actually used. DERIVED from the design blade loading unless p.solidity is given: sigma = DL/(rho*Vtip^2*CTsigma). NASA scale solidity with disk loading — 0.055 at DL 3.0 up to 0.267 at DL 13.1, a factor of five — while holding blade loading in a narrow band. Blade loading is the design constant and solidity is the consequence; this engine previously had it backwards with a fixed 0.10. The derivation reproduces NASA's published values closely: side-by-side 0.058 vs their 0.058, quadrotor 0.051 vs 0.055" },
  fusLen: { status:"sourced", src:"EFFECTIVE fuselage length, derived from PAYLOAD: l_fus = l_ref * (payload/453)^(1/3), anchored on Joby S4 — 24 ft (7.32 m) long at 1,000 lb (453 kg) payload, five seats. Geometric similarity for a cabin whose dimensions grow together. SCALING ON MTOW WAS TRIED AND REJECTED: it is unstable (a longer fuselage is a heavier fuselage is a heavier aircraft — the multicopter ran 5,213 to 10,436 kg) and unphysical (an eVTOL that grows because its BATTERY grew does not need a longer cabin; the pack goes in the floor and the wing). The feasibility check's own wording, 'fusLen does not scale with MTOW', framed the defect wrongly. Payload is an INPUT, so there is no feedback. Applied to LENGTH only — fuselage diameter is seats-abreast" },
  weightBuildupFellBackAtConvergence: { status:"derived", note:"true when the CONVERGED iteration could not use the component buildup and fell back to the ewf fraction. Distinct from weightBuildupFallbacks, which counts fallbacks at ANY iteration including early ones where the loop is still far from the answer — an early fallback says nothing about the final design and previously raised a false alarm on NASA's lift+cruise" },
  weightBuildupFallbackMTOW: { status:"derived", note:"MTOW at the final iteration, so a reported fallback total can be compared against the weight it was actually judged against rather than against the converged MTOW" },
  motorTorqueNm: { status:"derived", note:"shaft torque per motor at the installed rating, P/(omega*gearRatio). It is what the motor MASS model actually keys on, so it is reported — a design can look ordinary in kW and be far outside the fitted population in N-m" },
  motorModelExtrapolated: { status:"derived", note:"true when required torque exceeds 546 N-m, the largest of the four EMRAX points the mass curve is fitted to (76-546 N-m). Joby's DIRECT-DRIVE tiltrotor needs 1,952 N-m — 3.6x beyond the data — because a 1,100 rpm rotor turns modest power into large torque. Beyond the range the curve is evaluated AT its largest fitted point and the remaining power added at the family's specific power, so the hand-off is CONTINUOUS: a hard switch made Archer oscillate across the boundary and stop converging at a healthy 16.5% margin" },
  reserveBasisUsed: { status:"sourced", src:"Which quantity drove the reserve — 'time' (default) or 'distance'. THE REGULATION IS WRITTEN IN TIME: FAA powered-lift SFAR (Integration of Powered-Lift, final rule Oct 2024, operations Apr 2025) requires 20 min VFR / 30 min IFR, reduced from 30/45 in the 2023 proposal, and permits powered-lift to use HELICOPTER minima where the aircraft can land vertically at any point on the route; EASA SC-VTOL VTOL.2430(b)(4) requires a sufficient reserve but states NO number (MOC SC-VTOL Issue 2 p.5 refers only to 'the sufficient reserve accepted for compliance with VTOL.2430(b)(4)'); 14 CFR 91.151(b) gives 20 min VFR for rotorcraft. Distance is therefore normally a CONSEQUENCE. A distance basis is offered because a DIVERSION to an alternate vertiport is a range requirement, not a duration — it simply inverts t = d/Vres before the energy model runs, so both bases reach identical physics" },
  reserveDistanceKmUsed: { status:"derived", note:"reserve distance actually flown, Vres x reserve time. Subtracted from the total range inside the engine to recover the true cruise leg, so folding it into range at the caller does NOT double-count it" },
  reserveSpeedMS: { status:"sourced", src:"Speed the reserve is flown at. 0.76 x Vcruise (best endurance) by default — Johnson & Silva's initial air-taxi mission specifies '20-min flight at best-endurance speed (Vbe)'. The 75 nm UAM sizing mission instead specifies a CRUISE reserve (NASA/TM-20230018312 '75 nmi with a 20-min cruise reserve range'), selected with reserveAtCruiseSpeed, and it matters because reserve power goes as V/(L/D)" },
  solidityBasis: { status:"derived", note:"whether solidity came from an explicit input or was derived from the design blade loading" },
  fusLenInput: { status:"derived", note:"fuselage length as SUPPLIED — read as the length at the REFERENCE payload (Joby S4, 453 kg), not as the final geometry" },
  fusLenScaled: { status:"derived", note:"true when fuselage length was derived from payload rather than pinned. p.fuselageSizing:'fixed' pins it" },
  propDiamInput: { status:"derived", note:"the rotor diameter as SUPPLIED (the slider). Kept separate from the effective diameter so a derived value can never be mistaken for the input that produced it" },
  rotorSizedToDiskLoading: { status:"derived", note:"true when the rotor diameter was DERIVED from the configuration's disk loading at the converged weight rather than pinned. Holding diameter fixed while MTOW moves lets disk loading run away — selecting the tiltrotor layout in the UI reached 42 lb/ft2 against a 12.4 target, clamped solidity, and stopped converging. Disk loading is the published design parameter per layout; diameter is its consequence, exactly as solidity is the consequence of design blade loading" },
  mtomLimitKg: { status:"sourced", src:"Maximum certificated take-off mass applied as a DESIGN CONSTRAINT. Default 3,175 kg (7,000 lb) — EASA SC-VTOL-01, which applies to a person-carrying VTOL aircraft in the small category with a passenger seating configuration of 9 or less. Overridable via p.mtomLimitKg or p.certBasis because it is a certification basis, not physics: NASA's own all-electric lift+cruise concept is published at 3,724 kg and sits ABOVE the small-category ceiling, so a hardcoded limit would declare NASA's reference vehicle invalid" },
  mtomMarginKg: { status:"derived", note:"certification limit minus MTOW. Negative means the design is out of category and needs a shorter mission, less payload, or a different certification basis" },
  withinMTOM: { status:"derived", note:"whether the converged MTOW is at or under the certification limit" },
  mtowCeilingKg: { status:"derived", note:"NUMERICAL runaway guard, deliberately looser than the design constraint (2x the certification limit). The two answer different questions: the constraint says the design is out of category, the guard says the iteration is no longer meaningful. Aborting exactly at the constraint would prevent the tool from reporting HOW FAR out of category a design is" },
  mtowCeilingHit: { status:"derived", note:"true when the mass iteration left [payload, ceiling]. Per Ugwueze et al. 2023 a bracketed search proves non-closure inside a regulatory bound rather than climbing to a meaningless number — this engine previously reported 19,718 kg for a four-passenger air taxi" },
  designCTsigma: { status:"sourced", src:"Design hover blade loading actually applied, taken PER CONFIGURATION from the closest published NASA vehicle rather than from a mean across all of them: multicopter 0.0759 (Quad-E), side-by-side 0.0839 (SbS-E), lift+cruise 0.0603 (L+C-E), tiltrotor 0.0973 (TR6-E, Yanev & Staack Aerospace 2026 13(566) Table 2 — a six-rotor ALL-ELECTRIC tiltrotor, which is this configuration exactly), tiltwing 0.1126 (TW-TE), each recovered as DL/(rho*Vtip^2*sigma) from Table 12. Mixed tilt+lift layouts blend the L+C and tiltwing endpoints by tilting-rotor fraction [LAY]. A SINGLE MEAN WAS A DEFECT: 0.083 applied to a collective-control tiltrotor forced solidity ~87% high, drove blade weight and diverged the loop on Joby S4 and Vertical VX4 — both published, flying aircraft. The 0.060-0.113 spread is explained, not scatter: Johnson & Silva 2022 sec.6.3 note that rotor-speed control with fixed collective may require 'a smaller design CT/sigma at hover (hence larger blade area)', and NASA's rpm-controlled lift+cruise is indeed the lowest of the four while the collective tiltwing is the highest" },
  boomDetail: { status:"derived", note:"Boom geometry and the criterion that actually set the wall. Booms are sized from STATICS (cantilever carrying rotor thrust at an arm), not from a regression — NDARC has no analogue: its rotor support is W_supt = X(f_supt*W_MTO + U_supt), where f_supt is a user INPUT, so NDARC parameterises the ignorance rather than predicting it, and NASA state outright that 'the mounting of rotor support booms to the wing has not been accounted for'. Wall thickness is the worst of bending stress, SHELL BUCKLING (classical Timoshenko sigma_cr = E*t/(r*sqrt(3(1-nu^2))) with a [LAY] knockdown) and a [LAY] minimum gauge — sizing on stress alone gave a 0.25 mm wall on a 158 mm radius tube, which would buckle at ~34 MPa against the 350 MPa allowable being checked. `wallDriver` names which criterion won, so an implausible boom can be diagnosed rather than guessed at" },
  flightControlsDetail: { status:"derived", note:"which flight-controls model ran and what base it scaled on. The BASE is the finding: measured against NASA Table 12, the fraction on MTOW scatters 1.67-2.68% because MTOW carries the battery while control hardware does not; on airframe weight (MTOW minus energy storage) six vehicles spanning turboshaft and electric collapse onto 2.40-2.71%, mean 2.518%, against the 2.5% already in use" },
  rotorGroupDetail: { status:"derived", note:"which rotor weight model actually ran, the blade chord it derived from solidity, and the blade/hub split. Exposed because the model choice moves the structure group by an order of magnitude in accuracy (249% -> 25-31% MAE) and must therefore be auditable from the result rather than inferred from the inputs" },
  driveSystem: { status:"sourced", src:"Gear box + rotor shaft, NDARC AFDD00 (Johnson, NASA TP-20250010468 section 29-7.4): w_gbrs = 95.7634 N_rotor^0.38553 P_DSlimit^0.78137 W_eng^0.09899 / W_rotor^0.80686, hp and rpm in, lb out; NDARC quotes 8.6% mean error over 52 aircraft. Applied PER DRIVE TRAIN (N_rotor=1) rather than once with N_rotor=N, because the fitted population is helicopters with ONE interconnected transmission and a distributed-electric eVTOL has N independent single-stage reductions — a reference-class distinction that was tested, not assumed: against NASA's own published drive-system weights (TM-20210017971 Table 12) the per-train reading lands within 0.2-3.8% at NO technology factor, while the whole-aircraft reading needs a 0.80-0.89 fudge. ZERO under direct drive (gearRatio 1), which is the engine default — a direct-drive machine has no gear train. NOT modelled: the cruise propulsor (sized by specific power, so it has no shaft speed to gear), AFDD82 drive shafts and rotor brake (cross-shafting items an independent-drive-train layout does not carry), and the f_rs=0.13 rotor shaft at ratio 1 (absorbed by the [CAL] rotor mass constant)" },
  rotorArrangement: { status:"sourced", src:"Rotor arrangement, coplanar or coaxial (contra-rotating pairs). [SRC] Yang et al., Aerospace 2024 11:200 sec.1: these are the two arrangements the UAM multicopter field actually uses, and single-seat multicopters are 'dominated by coaxial'. Coplanar is the default; coaxial is offered only where the layout supports it and the rotor count is even" },
  powertrain: { status:"derived", src:"Echo of the powertrain input: \"battery\" (the pack flies the mission) or \"turboelectric\" (turboshaft-generator, pack for the engine-out landing only)" },
  fuelMassKg: { status:"validated", src:"Turboelectric powertrain, engine/turboelectric.js. Fuel carried at take-off = mission burn + reserve, sfc x shaft energy x 1.05 (NDARC simple referred model, TP-20220000355 s21; Johnson, Silva & Solis 2018 p.5). Compared with Silva et al. 2018 Table 3 L+C TE fuel tank capacity (176 lb) by validation/turboelectric.mjs. 0 for a battery aircraft" },
  fuelBurnKg: { status:"validated", src:"Turboelectric powertrain, engine/turboelectric.js. Mission fuel, excluding the reserve. Compared with Silva et al. 2018 Table 3 L+C TE fuel burn (129 lb) by validation/turboelectric.mjs" },
  fuelReserveKg: { status:"derived", src:"Turboelectric powertrain, engine/turboelectric.js. Fuel for the reserve segment, carried and not burned" },
  fuelEnergyBurnMJ: { status:"derived", src:"fuelBurnKg x 42.8 MJ/kg (Jet A lower heating value, NDARC Table 16-1)" },
  turboshaftRatedKW: { status:"derived", src:"Turboelectric powertrain, engine/turboelectric.js. Sea-level static rating: the larger of (lift motors + cruise motor, installed) and (climb/cruise demand), through generator 0.95 and gearbox 0.98 efficiencies, divided by delta*sqrt(theta) at that condition" },
  turboshaftHoverAvailKW: { status:"sourced", src:"Turboelectric powertrain, engine/turboelectric.js. Rating x delta*sqrt(theta) at the hover condition; NASA flat-rates at its 6,000 ft sizing condition. validation/turboelectric.mjs compares it with 1152 hp, which is READ as the turboshaft from Silva et al. 2018 Table 3 (deliverable power; an inference from installed = turboshaft + generator + motors)" },
  turboshaftMassKg: { status:"sourced", src:"Turboelectric powertrain, engine/turboelectric.js. Specific weight from Johnson, Silva & Solis 2018 Table 4 (100/200/750/4000 hp: 0.70/0.50/0.23/0.14 lb/hp), log-interpolated [LAY]" },
  turboshaftSfcKgPerKWh: { status:"sourced", src:"Turboelectric powertrain, engine/turboelectric.js. MCP SLS sfc from Johnson, Silva & Solis 2018 Table 4 (0.70/0.54/0.48/0.35 lb/hp-hr), log-interpolated [LAY]; constant with power setting (simple referred model)" },
  turboshaftOutsideTable: { status:"derived", src:"True when the rating is outside the 100-4000 hp span of the engine table and the end row is used" },
  generatorRatedKW: { status:"derived", src:"Turboelectric powertrain, engine/turboelectric.js. Carries the installed motor power with zero net battery flow" },
  generatorMassKg: { status:"sourced", src:"Turboelectric powertrain, engine/turboelectric.js. 0.15 lb/hp, Johnson, Silva & Solis 2018 p.5 and Table 11 (tiltwing generator); a technology assumption at a larger size than most designs" },
  fuelTankMassKg: { status:"sourced", src:"Turboelectric powertrain, engine/turboelectric.js. 0.19 x fuel carried, Johnson, Silva & Solis 2018 Table 10 (67/350 lb and 69/364 lb)" },
  emergencyPackKWh: { status:"derived", src:"Turboelectric powertrain, engine/turboelectric.js. Energy drawn by a 2-min hover (NASA/TM-20210017971 s3); the pack is also held to 14C (Johnson & Silva 2022; Silva et al. 2018 p.13)" },
  packSizedBy: { status:"derived", src:"What set the pack mass: mission energy or hover power (battery), or the emergency power or energy (turboelectric)" },
  twinKappa: { status:"sourced", src:"Twin-rotor overlap factor on hover induced power, sqrt(2/(2-m)) with m the overlapped fraction of one disc. [SRC] NDARC Theory TP-20220000355 sec.12-5.1.3, implemented in engine/coaxial.js; hub spacing measured off NASA's side-by-side three-view. Exactly 1 for every other layout (the lens area vanishes at l >= 2R). Reported since 2026-09-16; validation/identities.mjs pins it to the formula" },
  coaxKappa: { status:"sourced", src:"Induced-power interference factor of a contra-rotating pair relative to two isolated rotors. [SRC] Yang et al. Eq. 39, implemented in engine/coaxial.js. 1.000 for coplanar. At the default thrust ratio 0.80 it is 1.136; at equal thrust 1.281, which matches Yang's stated 28% worst case to 0.1 points and the classical coaxial figure in Leishman. NOTE: Yang's PROSE also claims 27% at a thrust ratio of 0.8, which the paper's own equation does not reproduce (13.6%). The equation is implemented, not the sentence - see research note 28" },
  coaxThrustRatio: { status:"sourced", src:"Thrust of the lower rotor of a contra-rotating pair as a fraction of the upper. [SRC] Yang et al. sec.3 citing Li et al. AIAA 2023-1011: 0.80 is typical. Null for coplanar. Equal thrust (1.0) is the worst case and costs 28% induced power" },
  nRotorStations: { status:"derived", src:"Number of plan positions carrying the rotors: equal to the rotor count for coplanar, half of it for coaxial, since contra-rotating rotors share a station. Sets the non-overlap ring radius and the boom count, which is where the coaxial arrangement pays for its induced-power penalty" },
  weightGroupsRaw: { status:"validated", src:"Component masses before the NDARC group roll-up. VALIDATED at group level against NASA/TM-20210017971 Table 12 for the three all-electric vehicles: structures, rotor, motor+drive, drive system, systems and flight controls (validation/nasa-configs.mjs). Boundaries follow NDARC fig. 8-3a and are NOT assumed - validation/components.mjs establishes them by measurement, including that the published systems group EXCLUDES flight controls because the alternative reading implies a negative electrical group" },
  groupSums:   { status:"derived", note:"structure / propulsion / systems roll-up, benchmarked against the NASA Table 3 bands — structure 25.7-31.4%, propulsion 13.4-19.7%, empty 78.2-87.3% of MTOW. Validating on MTOW alone hides where the error lives: three wrong group splits give the same MTOW" },
  weightBreak: { status:"derived" }, dragComp:{ status:"derived" }, tPhases:{ status:"derived" },
  polarData:   { status:"derived" }, powerSteps:{ status:"derived" }, socSteps:{ status:"derived" },
  velSteps:    { status:"derived" }, energySteps:{ status:"derived" }, convData:{ status:"derived" },
  twSweepData: { status:"derived" }, tolSweepData:{ status:"derived" },
  rpFerryPoint:{ status:"derived", note:"zero-payload point of the payload-range diagram" },

  /* ══════════════════════════════════════════════════════════════════
     INPUT ECHOES
     Returned so panels read the value the engine actually sized with,
     rather than re-reading params. Provenance is the input's.
     ══════════════════════════════════════════════════════════════════ */
  weightBuildupUsed:{ status:"derived", note:"did the component buildup actually produce the empty weight, or did the guard substitute the ewf fraction? The guard was SILENT, and silent substitution is how a tool lies: both wingless benchmark cases reported weightModel:'buildup' while returning Wempty = 0.5 x MTOW to the last decimal. Heavier motors then failed to move MTOW at all, which is impossible, and was the tell" },
  weightBuildupFallbacks:{ status:"derived", note:"iterations on which the buildup was discarded. Non-zero means the reported empty weight is NOT a component buildup" },
  weightBuildupLastTotal:{ status:"derived", note:"the buildup total that triggered the last fallback. Null means it was non-finite rather than merely too heavy — which is what a NaN in the wing geometry produced for wingless configurations" },
  weightModel: { status:"validated", src:"echo of the input. Measured over the current 4-aircraft reference set: buildup 47.3% pooled MAE against 72.1% for the ewf fraction. The pooled figure is misleading (see the per-metric-class split) but the ORDERING has held at every measurement" },
  nPropHover:  { status:"unverified", note:"echo of the input; a configuration choice" },
  propDiam:    { status:"unverified", note:"echo of the input. Measured NOT to be a lever: 3.0 -> 4.0 m drops hover power 25% and moves MTOW ~0%, because hover is only ~23% of mission energy and bigger rotors add rotor mass and drag that eat the saving" },
};

/* ── UI SURFACE ───────────────────────────────────────────────────────
   Moved out of validation/ so the APP can read it, not just the test run.
   The point of this registry was always to answer "is this number real?"
   as a lookup rather than an opinion — and the person who most needs that
   answer is the engineer reading the number, not the test harness. */

export const STATUS_META = {
  validated:  { rank: 5, label: "Validated",  short: "VAL",
                blurb: "Compared numerically against published aircraft data" },
  sourced:    { rank: 4, label: "Sourced",    short: "SRC",
                blurb: "Method or constant traces to a citable reference; output never compared to a real aircraft" },
  derived:    { rank: 3, label: "Derived",    short: "DRV",
                blurb: "Standard algebra on validated or sourced quantities; adds no new assumption" },
  calibrated: { rank: 2, label: "Calibrated", short: "CAL",
                blurb: "Fitted to reference data. Not a prediction" },
  unverified: { rank: 1, label: "Unverified", short: "UNV",
                blurb: "Displayed but never checked against anything. May be right; nobody has shown it" },
};

/* ── THE STATUS DEPENDS ON THE POWERTRAIN ─────────────────────────────
   "Validated" means compared with published aircraft OF THAT KIND. The pack
   and mission-energy outputs were scored on battery aircraft; on a
   turboelectric design the pack is an emergency pack that has not been
   scored, and the mission energy comes from the generator. Conversely, the
   fuel outputs were scored on a turboelectric aircraft and are simply zero
   on a battery one. A badge that ignored this would put a VAL chip on a
   number nobody has compared. */
export const POWERTRAIN_OVERRIDES = {
  turboelectric: {
    Wbat:    { status: "sourced", src: "Turboelectric: the pack is sized for a 2-min engine-out hover at no more than 14C (NASA/TM-20210017971 s3; Johnson & Silva 2022). Printed, but not gated, against Silva et al. 2018 Table 3 by validation/turboelectric.mjs" },
    PackkWh: { status: "derived", src: "Turboelectric: capacity of the emergency pack; NASA quotes it at cell-usable energy, not comparable one for one" },
    Etot:    { status: "derived", src: "Turboelectric: electrical energy the generator supplies to the motors; the compared quantity is fuel (fuelMassKg, fuelBurnKg)" },
  },
  battery: {
    fuelMassKg: { status: "derived", src: "Battery aircraft carry no fuel: 0 by definition" },
    fuelBurnKg: { status: "derived", src: "Battery aircraft burn no fuel: 0 by definition" },
  },
};

/** Provenance for one engine output key, or null when unregistered. */
export function provenanceOf(key, powertrain = "battery") {
  const base = OUTPUTS[key] || INPUTS[key];
  if (!base) return null;
  const e = { ...base, ...(POWERTRAIN_OVERRIDES[powertrain]?.[key] || {}) };
  return { key, ...e, powertrain, meta: STATUS_META[e.status] || STATUS_META.unverified };
}

/** Counts by status across every registered output — the design's honesty ledger. */
export function provenanceLedger() {
  const counts = { validated: 0, sourced: 0, derived: 0, calibrated: 0, unverified: 0 };
  for (const e of Object.values(OUTPUTS)) {
    if (counts[e.status] != null) counts[e.status]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}
