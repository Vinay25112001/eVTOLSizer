/* Moved verbatim out of App.jsx so the design-file module and the Node
   gates can import the defaults without a JSX loader. App.jsx re-exports
   it, so existing imports keep working. */

/* ═══════════════════════════════════════════════════════════════════════
   DEFAULT DESIGN — ONE SOURCE OF TRUTH
   ═══════════════════════════════════════════════════════════════════════
   This literal was previously inline in useState, and the "Reset to defaults"
   button carried its OWN hand-maintained copy. The two had drifted badly: the
   reset copy was missing weightModel, autoPositionWing, targetSM, configType,
   nRotorsStopped, descentAngle, deltaISA and cRateDerate.

   That was not cosmetic. Because setParams there REPLACES rather than merges,
   pressing "Reset to defaults" silently dropped weightModel:"buildup" — so the
   app fell back to the ewf-fraction model at ewf 0.50, which on this mission is
   PAST THE DIVERGENCE CLIFF and reports a ~19,000 kg runaway. It also dropped
   the hybrid configuration back to lift+cruise and turned off wing
   auto-positioning. One button quietly produced a different, non-converging
   aircraft and nothing said so.

   Exported and used by BOTH the initial state and the reset button, so they
   cannot drift again.
   ═══════════════════════════════════════════════════════════════════════ */
export const DEFAULT_PARAMS = {
    // ── Mission ──────────────────────────────────────────────────────────
    /* ── THE DEFAULT MISSION WAS NOT AN URBAN MISSION ────────────────────
       range was 190 km, provenance status "unverified" — no source anywhere.
       It is longer than every real aircraft in this class (Archer Midnight
       100 km, Joby S4 161 km) and, with the 20-min reserve folded in, the
       engine sized a 251 km mission. THE DEFAULT DESIGN DID NOT CONVERGE: it
       ran to 5,825 kg with a 2,645 kg battery — 45% of MTOW — for a 5-seat
       urban air taxi. That is the first thing a user saw on opening the tool,
       and it is why the numbers looked wrong.

       NOW 139 km = 75 nm, the published UAM reference sizing mission, stated
       by two NASA sources: Johnson & Silva 2022 sec.5 "two 37.5-nm flights
       (total 75-nm range without recharging or refueling), with a 20 min
       reserve", and the RVLT Lift+Cruise design-drivers paper. It is the same
       mission validation/nasa-configs.mjs already benchmarks against. [SRC]

       NOW 65 km, AND THE REASON IS THE CERTIFICATION BASIS.
       SC-VTOL-01 caps this category at 3,175 kg MCTOM. Sized against that
       constraint the tool reports a maximum range of ~82 km at 455 kg payload
       — and Archer Midnight's published design mission is "~20-50 mile hops
       with reserves" (32-80 km), for an aircraft quoted at
       3,175 kg, exactly the ceiling. Constraining to the category independently
       reproduces the design point of the aircraft built to that category. [SRC]

       The NASA 75-nm (139 km) reference mission is still the right benchmark
       for NASA's OWN vehicles and validation/nasa-configs.mjs flies it — but it
       sizes to 4,868 kg here, which is OUT of the small category. NASA's own
       all-electric lift+cruise is published at 3,724 kg and is likewise outside
       SC-VTOL. Those are US research concepts, not EASA certification targets.
       A DEFAULT MUST BE A VALID DESIGN OF ITS CATEGORY, so the default is the
       urban mission, not the research mission.

       missionHops stays 1: NASA's two-hop form does not close on this
       technology set, which is a reportable finding, not something to hide
       behind a default.

       CONSISTENCY FIX: DEFAULT_PARAMS said hybrid with nPropHover 6, while
       CONFIG_DEFAULTS.hybrid says 12 (Archer Midnight, [SRC]). So the tool
       opened on one aircraft and touching the configuration dropdown — even
       re-selecting the SAME configuration — silently produced a different,
       heavier one (3,099 -> 3,419 kg, in category -> out of category). The two
       tables now agree: 12 rotors, 67 m/s, and the diameter Archer's own disk
       loading implies.
       UPDATED AGAIN once the certification limit was corrected. 65 km was
       chosen partly because it was the range at which Archer's geometry fitted
       an MCTOM of 3,175 kg — and that ceiling was WRONG. SC-VTOL Issue 2
       (Oct 2024) raises MCTOM to 5,700 kg, so that justification expired.
       The default is now Archer Midnight's OWN published range, 100 km, which
       makes the whole default self-consistent with its reference aircraft:
       Archer's rotor count (12), Archer's cruise speed (67 m/s = 150 mph) and
       Archer's range. Result 4,032 kg against Archer's published 3,175 kg —
       the model's known ~27% over-prediction, left VISIBLE rather than hidden
       by picking a flattering range. 1,668 kg of MCTOM margin, converges.

       An earlier revision used 65 km, chosen as the range at which Archer's
       geometry fitted an MCTOM of 3,175 kg. That ceiling was superseded, so
       that reasoning is recorded only to explain why it is gone. */
    payload:455,range:100,vCruise:67,cruiseAlt:1000,hoverHeight:15.24,
    /* SEAT COUNT IS A CERTIFICATION-BASIS DISCRIMINATOR, NOT A DERIVED
       QUANTITY. SC-VTOL-02 VTOL.2005(a) applies only to "a passenger
       seating configuration of 9 or less"; FAA AC 21.17-4 PL.2000(a) says
       six or less; and VTOL.2250(f) changes the bird-strike objective at
       seven or more. None of those is inferable from payload, because to
       this engine an occupant and a sack of cargo are the same kilogrammes.

       DEFAULTED TO null ON PURPOSE, and it is the reason nothing about
       this change moves a sized result. engine.js passes
       `nOccupants: p.nOccupants ?? p.nSeats` into cabinAdequacy(), which
       falls back to occupantsFromPayload() for any value that is not a
       positive finite number. null takes that fallback, so every existing
       design keeps the fractional occupancy it had (455 kg -> 5.0155) and
       the golden master is byte-identical. State a seat count and the
       cabin check honours the integer instead -- and the regulatory panel
       can complete its applicability test, which it cannot do otherwise. */
    nSeats:null,
    /* Reserve is set by TIME by default, because that is how the rule is
       written: FAA powered-lift SFAR (final rule Oct 2024, operations Apr 2025)
       20 min VFR / 30 min IFR — reduced from 30/45 in the 2023 proposal — and
       14 CFR 91.151(b) agrees at 20 min VFR for rotorcraft. EASA SC-VTOL
       VTOL.2430(b)(4) requires a "sufficient reserve" and gives NO number.
       The 20 min default is NASA's sizing convention (Johnson & Silva 2022,
       "10% of mission or 20-min flight at best-endurance speed"). Switch
       reserveBasis to "distance" to drive it as a diversion to an alternate
       vertiport instead; the engine inverts t = d/Vres and the physics is the
       same from either end. */
    reserveMinutes:20, reserveBasis:"time", reserveDistanceKm:60,
    // ── Aerodynamics (calibrated vs Joby S4 / Archer Midnight / NASA NDARC) ──
    LD:8.50,AR:9,eOsw:0.85,taper:0.45,tc:0.15,   // L/De [SRC NASA L+C-E]; see CONFIG_DEFAULTS.LD_target

    /* WING SIZING — W/S is the design variable (Raymer ch.5 constraint
       diagram) and cruise CL is DERIVED from the wing the aircraft ends up
       with. clDesign is retained ONLY for the legacy wingSizedBy:"cl" path and
       as an airfoil-selector fallback; it is deliberately NOT on the panel
       because it is measurably inert under the current wing model. */
    /* W/S stays at the SOURCED 1450 — the midpoint of Joby 1524 and Archer
       1371. Raising it to 1650 was tried, purely because it shrinks the span
       and clears the Fus/Span proportion check. That is backwards: W/S is
       calibrated to published aircraft, the Fus/Span band is uncited, and
       NASA's own L+C fails that band too. The check was made advisory instead
       — see engine.js. Do not tune a sourced constant to green an unsourced
       criterion. */
    /* 1371 = Archer Midnight [SRC], because the default CONFIG is hybrid and
       DEFAULT_PARAMS must match CONFIG_DEFAULTS for it. The old 1450 was the
       MIDPOINT of Joby 1524 and Archer 1371 — a number describing neither
       aircraft. Each layout now carries its own; see CONFIG_DEFAULTS. */
    wingLoadingNm2:1371, clCruiseMax:0.90, clDesign:0.55,
    // ── Propulsion ───────────────────────────────────────────────────────
    /* ROTOR AND FUSELAGE RESIZED 2026-08-26, after AFDD84 replaced the light-GA
       fuselage regression and pushed MTOW to 6047 kg — past the SC-VTOL 5,700 kg
       limit, with disk loading at 29.2 lb/ft2 and the tail 62% of wing area.
       Four checks failed and all four were the same root cause: the aircraft got
       heavier and its rotors were now too small for it.
         propDiam 3.0 -> 4.2 m   disk loading 29.2 -> 13.9 lb/ft2, inside the
                                 NASA lift+cruise band, and 4.4 dB quieter
                                 (65.2 -> 60.9 dBA at 100 m)
         fusLen   7.2 -> 8.6 m   tail/wing 62% -> 49%, back inside 25-50%.
                                 SOURCED, not tuned: NASA publish vehicle length
                                 28.0 ft (8.53 m) for the tiltwing and 32.9 ft
                                 (10.03 m) for the lift+cruise, at 3062 and 3715
                                 kg — a 7.2 m fuselage on a 5,000+ kg aircraft
                                 was never credible (TM-20210017971 Table 11).
       Tip speed deliberately LEFT at the sourced 167.64 m/s. Raising it to
       200 m/s buys 0.5 points of closure margin and costs 5 dB, taking noise to
       65.7 dBA at 100 m — above the 65 dBA bound Joby measures below. Not worth
       it, and not a trade to make silently.
       GEOMETRIC GAP, FLAGGED NOT FIXED: six 4.2 m rotors need ~26.5 m of span if
       co-planar and the wing is 18.6 m. They fit only because this layout
       staggers them fore/aft on booms. NOTHING IN THE ENGINE CHECKS ROTOR FIT —
       a user can specify rotors that cannot physically be mounted. */
    /* 1.30 thrust = a 1.482 POWER factor, inside NASA's published 1.3-1.8 band
       (corpus S3270). Sourced once converted; see configuration.js. */
    nPropHover:12,propDiam:2.37,twRatio:1.3,convTolExp:-6,
    /* ── DEFAULTED BACK TO A PINNED DIAMETER, AND HERE IS WHY ─────────────
       "diskLoading" derives the rotor diameter from the configuration's disk
       loading at the converged weight. It was added to stop disk loading
       drifting when the dropdown set a diameter from a GUESSED MTOW. Measured
       across all six layouts it gives results IDENTICAL to a pinned diameter
       on five of them (lift+cruise 3037, hybrid 2786, hybridPusher 3069,
       tiltrotor 3515, side-by-side 2550 — same to the kilogram) and DIVERGES
       the multicopter, even at Volocopter's own 200 kg / 35 km mission where a
       pinned diameter closes at 623 kg.
       That is an instability, not a physical result: with eighteen rotors the
       rotor AND boom groups both scale with radius, radius scales with the
       square root of weight, and the derivative of that feedback exceeds one.
       Under-relaxing the update did not fix it — there is no fixed point, not
       a hard-to-reach one.
       The problem it was added for has since been fixed properly (the hover
       time, the configuration defaults), so the tiltrotor now closes at 3,515
       kg with a pinned diameter too. A mode that helps nothing and breaks one
       layout should not be the default. Still available: pass
       rotorSizing:"diskLoading" deliberately. */
    rotorSizing:"fixedDiameter",
    /* MUST MATCH CONFIG_DEFAULTS FOR THE DEFAULT CONFIGURATION (hybrid), or
       the tool opens on one aircraft and the dropdown produces another — the
       same inconsistency that had nPropHover at 6 here and 12 there.
       0.740 is NASA's lift+cruise figure of merit, borrowed for the tilting
       layouts as the nearest published winged neighbour [LAY]; Table 12's own
       three span 0.680-0.740, so FM is NOT a technology constant. */
    etaHov:0.740, tipSpeed:167.64,   // [SRC/LAY] see CONFIG_DEFAULTS
    etaSys:0.80,          // drivetrain η — modern PMSM motors + inverter ~93%×93% (was 0.765)
    rateOfClimb:5.08,climbAngle:5,
    /* UNSET BY DEFAULT, so the engine uses each layout's OWN glide angle —
       5.1 deg on the tiltrotor, 9.8 deg on the multicopter — which is
       NDARC's principle (best descent angle = max V/P) and is per-layout
       because L/D is. The 6 deg that used to sit here is the FAR Part 36
       Appendix H NOISE CERTIFICATION approach trajectory (via Johnson &
       Silva 2022), not a mission gradient, and no source gives one: the
       SFAR is silent, MOC-2 leaves the glide path to the applicant, and
       the ICAO/FAA/EASA vertiport slopes are obstacle surfaces that ICAO
       Table 4-1 calls 'not operational slopes'. Set the slider to fly a
       specific procedural gradient instead. */
    descentAngle:null,
    climbLDPenalty:0.13,   // fractional L/D derating during climb (induced drag increase)
    deltaISA:0,            // ISA deviation °C: 0=standard day, 15=hot day
    cRateDerate:0.08,      // battery SED derate for C-rate: 8% default (~3-4C hover)
    // ── Battery (2025 state-of-art; Joby claims ~300 Wh/kg cell-level) ──
    sedCell:300,etaBat:0.90,socMin:0.19,
    /* ── Weights ──────────────────────────────────────────────────────────
       ewf was 0.50 with an unsourced note claiming Joby 0.43 / Archer 0.45.
       Every figure that can actually be sourced is far higher:
         NASA UAM Lift+Cruise (electric)  0.656  published weight statement
                                                 (Johnson & Silva 2022, Table 3)
         Archer Midnight                  0.653  implied by published 7,000 lb MTOW
         Joby S4                          0.510  implied by published 5,300 lb MTOW
       0.60 is the middle of that evidence -- but the DEFAULT MISSION DOES NOT
       CLOSE THERE. Measured: at 190 km / 455 kg / 300 Wh/kg cell the loop
       converges at ewf 0.56 (MTOW 4,199 kg) and diverges at 0.58 and above.
       So this design point only exists because ewf is optimistic.
       Held at 0.50 to keep the baseline design usable; raise it only together
       with range (120 km closes at 0.60) or battery specific energy.
       Battery is NOT in this fraction -- it is sized separately as Wbat. */
    ewf:0.50,
    /* Default switched to "buildup" on 2026-08-24: validated against 3 published
       aircraft it scores 23.7% MAE vs 36.7% for the ewf-fraction model. The ewf
       slider is ignored while this is active; flip back in the sidebar under
       Structure if you need the legacy behaviour. */
    /* SC-VTOL certification category. It is a SIZING LEVER, not a label:
       Enhanced carries triplex flight-critical avionics against Basic's
       duplex (~2% of MTOW, engine/avionics.js) and must make the MOC
       VTOL.2120 climb gradient one unit down rather than all-operating.
       It was already honoured by the engine and reachable from nowhere. */
    vtolCategory:"enhanced",
    weightModel:"buildup",
    /* Wing position is a DESIGN OUTCOME, not a frozen constant: the wing is
       placed to achieve targetSM. See engine/wingPosition.js. */
    autoPositionWing:true, targetSM:0.15,
    /* ── CONFIGURATION ────────────────────────────────────────────────
       HYBRID tilt + lift: half the rotors tilt and provide cruise thrust,
       half are lift-only and stop. This is the Archer Midnight layout.
       It matters more than any other single input — measured at this mission:
         liftcruise   4054 kg  11.2% payload   (6 dead rotors + a pusher)
         hybrid       2937 kg  15.5%           <- this design
         tiltrotor    2428 kg  18.7%
       The previous implicit default was `liftcruise`, which is the heaviest
       aircraft in the design space and was never a deliberate choice. */
    /* ── CONFIGURATION ────────────────────────────────────────────────
       HYBRID tilt + lift, no pusher:
         4 TILT rotors  — 90 deg in hover, 0 deg in cruise, active throughout
         2 BOOM rotors  — lift only, stop in cruise (exposed hubs, blade drag)
       Chosen over 4-stop/2-tilt+pusher after the duty-cycle and engine-out
       checks: that layout ran its tip motors at 95% of hover rating for 27
       minutes of cruise and lost 50% of cruise thrust per failure. Converting
       rotors from stopping to tilting is the only change that improves mass
       AND safety together — it removes dead mass, a boom, hub drag and blade
       drag while ADDING a cruise thrust unit.
         4 stop + 2 tilt, no pusher   3167 kg  14.4%  duty 95%  loss 50%
         2 stop + 4 tilt, no pusher   2759 kg  16.5%  duty 50%  loss 25%  <- this
    */
    configType:"hybrid", nRotorsStopped:2,
    /* COLLECTIVE (variable-pitch) rotor control, and this is a REAL design
       decision the tool now forces rather than a preference. Motors are sized
       to be CAPABLE of the NASA Table 4 engine-out disturbance transient. With
       RPM control that requirement is 3.8x hover power per motor and THIS
       AIRCRAFT DOES NOT CLOSE — it runs away past 17,000 kg. With collective
       it is 2.5x and it closes at ~3,850 kg with propulsion at 12.1% of MTOW.
       NASA say the same thing directly (Johnson & Silva 2022, quoted in
       engine/motor.js): "rpm control results in higher power transients at
       each motor, compared to collective control".
       Set rotorControl:"rpm" to see the design fail to close — that is the
       tool working, not a bug. */
    /* RPM control kept as the default: NASA state it gives the HIGHER power
       transients, so it is the conservative assumption, and fixed-pitch is
       common on eVTOL lift rotors. Switching this to "collective" was tried as
       a way to make the OEI advisory clear — but since motor MASS is no longer
       sized on the transient (validation refuted that), the control scheme
       must not be changed just to green an advisory. */
    rotorControl:"rpm",
    // ── Geometry (Lf/b target 0.55–0.70; fL=7.2 gives 0.564 with 12.77 m span) ──
    fusLen:8.6,fusDiam:1.65,
    // ── V-tail (NASA NDARC UAM values for FBW lift+cruise eVTOL) ──────────
    vtGamma:45,
    /* ── TAIL VOLUME COEFFICIENTS — MEASURED, AND DELIBERATELY NOT USED ──
       These were briefly changed to NASA's measured values and CHANGED BACK.
       The measurement is real and is kept in validation/tail-geometry.mjs;
       what was wrong was transplanting it.

       NASA's own OpenVSP geometry gives Vh 0.775 and Vv 0.0582 (RAVEN 0.851
       / 0.0574, SWFT 0.699 / 0.0589) against our 0.45 and 0.032. But a tail
       volume coefficient is only transferable between aircraft of similar
       PROPORTION, because V = S_t l / (S_w b) trades area against arm:

         fuselage / span    NASA RAVEN 0.740   SWFT 0.749
                            Joby S4    0.538   ours 0.540

       RAVEN and SWFT are a small research-aircraft family with a long body
       and a short span. Air taxis are the other shape, and ours already
       matches Joby to 0.4%. Imposing NASA's tail VOLUME on our ARM demanded
       a V-tail of 81.6% of wing area - no aircraft has that. NASA's own
       aircraft carry 36-39%.

       So the defaults stay, and stay tagged unverified. What the measurement
       bought is knowing WHY they cannot be improved that way, which is worth
       more than a number that makes one check pass. */
    /* ── (superseded block below kept for its measurement record) ────────
       These were 0.45 and 0.032, carrying comments that claimed an "FBW
       eVTOL target" and "NASA" values with no citation. The provenance
       registry flagged both as unverified and said so plainly: "comment
       claims NASA NDARC values but no citation was verified".

       They are now measured from NASA's OWN published OpenVSP geometry,
       which this repo has shipped since the RAVEN work and never used for
       validation. Absolute surface positions resolved through the parent
       chain (the raw X is parent-relative, which is why the stabilator
       first appeared to sit AHEAD of the wing):

         Vh = Sh lh / (S MAC)      Vv = Sv lv / (S b)
         RAVEN  Vh 0.851   Vv 0.0574
         SWFT   Vh 0.699   Vv 0.0589
         mean   Vh 0.775   Vv 0.0582

       The old defaults were 42% and 45% LOW against those - and 0.45 was
       below the range the engine's own comment called typical (0.04-0.06
       for Cv). Effect of the correction: V-tail mass roughly doubles
       (33.5 -> 61.0 kg on the lift+cruise) and MTOW rises 2.4-3.6% across
       the winged layouts.

       CAVEAT, because it matters: RAVEN and SWFT are RELATED aircraft
       (SWFT is a RAVEN variant, both descend from the BD-6 airframe), so
       their 2.5% agreement on Vv is weaker evidence than two independent
       designs would be. Two related aircraft is what exists. */
    vtCh:0.45,
    vtCv:0.032,
    vtAR:2.5,
};
