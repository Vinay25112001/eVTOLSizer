/* NASA concept vehicles used as sizing cases, as DATA.
   Moved verbatim out of validation/nasa-configs.mjs (2026-09-16), which is a
   script: importing it re-runs the whole benchmark. The validation-domain
   generator and the provenance-drift gate need the vehicles without that. */

import { runSizing } from "../src/engine.js";
import { rotorGroup, flapFreqFor } from "../src/engine/rotorgroup.js";
import { twRatioFor } from "../src/engine/configuration.js";

const LB = 2.20462, FT = 3.28084, KT = 0.514444;

/* [CAL] Battery-to-shaft powertrain efficiency for NASA's all-electric
   concept vehicles. Recovered independently from Quad-E and SbS-E, which BOTH
   solve to 0.845 — see the long note at `etaSys` below for why that agreement
   is the evidence, and why this must not be quietly re-tuned. */
export const POWERTRAIN_ETA = 0.845;

/* NASA/TM-20210017971 Table 12. Only the ALL-ELECTRIC columns are usable as
   sizing cases — the turboshaft and turboelectric variants burn fuel, which
   this engine does not model. */
export const NASA_VEHICLES = [
  {
    key: "Quad-E", fusDq_ft2: 1.4, fusLenM: 7.73,  /* [INF] from published fuselage D/q at CD 0.0045, see paramsFor */ label: "NASA quadrotor, all-electric",
    configType: "multicopter", wingBorne: false,
    nRotors: 4, radius_ft: 13.1, DL_lbft2: 3.00, solidity: 0.0550,
    tipSpeed_fts: 550, FM: 0.700, Dq_ft2: 12.9, LoDe: 5.80,
    vCruise_kt: 98,                      // middle row — flagged, see header
    /* Recovered from NASA's own motor regression against NASA's own motor
       group weight — 10.9 (controllers outside the engine line) to 15.7
       (inside). The midpoint is used; drive-system mass moves 5.8% across the
       whole 4,000-7,000 rpm range, so the choice is not load-bearing. */
    gearRatio: 13.3,
    published: { DGW_lb: 6480, empty_lb: 5270, pack_lb: 2040,
                 structures_lb: 1640, rotor_lb: 628, propulsion_lb: 2670,
                 drive_lb: 397, systems_lb: 536, capacity_MJ: 1330 , fc_lb: 108,
                 mrp_hp_lifter: 168, nLift: 4, wpp_lb_hp: 14.0 },
  },
  {
    key: "SbS-E", fusDq_ft2: 1.6, fusLenM: 8.52,  /* [INF] from published fuselage D/q at CD 0.0045, see paramsFor */ label: "NASA side-by-side helicopter, all-electric",
    configType: "sideBySide", wingBorne: false,   // NOT a multicopter — see configuration.js
    nRotors: 2, radius_ft: 14.9, DL_lbft2: 3.50, solidity: 0.0580,
    tipSpeed_fts: 550, FM: 0.680, Dq_ft2: 7.50, LoDe: 7.20,
    vCruise_kt: 98,
    gearRatio: 14.1,                     // 12.1-16.1 by the same recovery
    published: { DGW_lb: 4900, empty_lb: 3690, pack_lb: 1290,
                 structures_lb: 1240, rotor_lb: 345, propulsion_lb: 1690,
                 drive_lb: 255, systems_lb: 507, capacity_MJ: 846 , fc_lb: 93,
                 mrp_hp_lifter: 214, nLift: 2, wpp_lb_hp: 12.6 },
  },
  {
    key: "L+C-E", fusDq_ft2: 1.7, fusLenM: 8.91,  /* [INF] from published fuselage D/q at CD 0.0045, see paramsFor */ label: "NASA lift+cruise, all-electric",
    configType: "liftcruise", wingBorne: true,
    nRotors: 8, radius_ft: 5.00, DL_lbft2: 13.1, solidity: 0.267,
    tipSpeed_fts: 585, FM: 0.740, Dq_ft2: 16.9, LoDe: 8.50,
    vCruise_kt: 112,
    /* NOT RECOVERABLE, so not invented. The motor-group residual for this
       vehicle mixes 8 lift motors with 1 cruise motor and cannot be split, and
       its 358 lb drive system covers both while the cruise prop's speed is
       unpublished — the lift drive train alone saturates near 316 lb at any
       plausible ratio. Left at direct drive, which also matters least here:
       its lift rotors already turn at 1,117 rpm against the quadrotor's 401,
       so the direct-drive torque penalty is far smaller. The drive-system row
       will therefore read as an explicit shortfall rather than a hidden one.

       AND GEARING IT WOULD MASK THE REAL DEFECT, WHICH WAS MEASURED HERE:
       our installed power per lift motor is 287.3 kW against NASA's published
       139 hp (103.7 kW) MRP — **2.77x** — where Quad-E and SbS-E come out at
       0.83x and 1.14x. Normalised for the 29% MTOW overshoot it is still ~2.1x.
       So the lift+cruise error is a HOVER-POWER problem, not a drive-train one.
       A ratio-3 sweep pulls MTOW to -6.2% and empty to -7.1% while motDrv stays
       +83% and driveSys +44%: the headline improves and the components do not,
       which is the "matching for the wrong reason" trap this project has been
       caught by before. Ratio 1 is kept deliberately so the +230% motDrv row
       stays visible and keeps pointing at the power model. Fix the power, then
       revisit the ratio. */
    /* UPDATED 2026-08-30. The note above was written when the L+C energy was
       41% low; direct drive was kept so that the resulting +230% motDrv row
       stayed visible instead of being masked. That reason has expired — the
       energy is now right — and NASA's lift+cruise IS geared: its 358 lb
       drive system is a published fact, so direct drive models the wrong
       architecture.

       The ratio is NOT recovered from this vehicle's own motor group (which
       cannot be split between 8 lift motors and 1 cruise motor). It comes from
       the MOTOR SPEED CLASS established on the other two vehicles — 4,380-6,296
       rpm for Quad-E and 4,274-5,668 rpm for SbS-E, and NASA state "consistent
       technology assumptions were made to size the vehicles". Against this
       aircraft's 1,117 rpm lift rotor that is a ratio of 3.85 to 5.64; the low
       end is used. Independent of the mass, so it is not fitted to it. */
    gearRatio: 3.85,
    published: { DGW_lb: 8210, empty_lb: 7000, pack_lb: 2200,
                 structures_lb: 2580, rotor_lb: 948, propulsion_lb: 3190,
                 drive_lb: 358, systems_lb: 540, capacity_MJ: 1440 , fc_lb: 152,
                 mrp_hp_lifter: 139, nLift: 8, wpp_lb_hp: 7.4 },
  },
];

/* Mission is identical for all of them: six passengers, 1200 lb payload,
   75 nm. Johnson & Silva 2018: "A six-passenger (1200-lb payload) ...
   requirements are based on 14 CFR 91.151: 20 min" reserve. */
export const PAYLOAD_KG = 1200 / 2.20462;            // 544.3 kg
export const RANGE_KM   = 75 * 1.852;           // 138.9 km


export function paramsFor(v) {
  const p = {
    payload: PAYLOAD_KG,
    vCruise: v.vCruise_kt * KT,
    /* ── NASA'S OWN SIZING CONDITIONS, AND THEY ARE NOT SEA LEVEL ──────
       Corrected 2026-08-28. This harness ran at cruiseAlt 1000 m with no field
       elevation at all, which is nobody's mission. NASA/TM-20210017971 §2
       states the sizing conditions for these very vehicles in prose:

         "Condition 1: find maximum takeoff weight (MTOW) by performing HOGE
          at 6,000 ft ISA and 100% Maximum Rated Power (MRP)."
         "Condition 2: cruise climb at 500fpm at 10,000 ft ISA (4,000 ft AGL
          in the sizing mission), at 100% MRP and design gross weight."

       Table 12's own airspeed rows are labelled "at DGW 6kISA (KTAS)", which
       independently confirms the 6,000 ft basis. Table 1's mission segments
       give initial altitude 6,000 ft MSL and cruise 10,000 ft MSL. (That table
       is column-shredded in extraction, so only the prose is relied on here.)

       ⚠ AND IT IS A DIFFERENT MISSION FROM THE ONE IN THE OTHER PAPER.
       Johnson & Silva 2022 describes TWO: an "initial air taxi mission" flown
       at 5,000 ft / ISA+20 (their Table 2 aircraft), and the six-passenger
       1,200 lb 75 nm UAM sizing mission (their Table 3 / Figure 5 aircraft)
       with "Takeoff altitude ... 6,000-ft (ISA), and cruise ... 4,000-ft above
       ground level". The vehicles in Table 12 are the SECOND set. Applying the
       5,000 ft / ISA+20 condition to them — as validation/reference-aircraft.js
       still does for the NASA lift+cruise, citing Table 2 — is the wrong
       mission for that aircraft. Flagged, not silently changed here.

       Measured effect of the correction: Quad-E MTOW -3.7% -> -2.2%,
       SbS-E +1.0% -> +2.7%, L+C-E -19.9% -> -15.1%. */
    fieldElev: 6000 / FT,          // 1828.8 m — HOGE sizing condition
    cruiseAlt: 10000 / FT,         // 3048 m
    hoverHeight: 15.24, reserveMinutes: 20,
    /* ── THE MISSION IS TWO HOPS, WITH A HEADWIND, RESERVED AT CRUISE ──
       Corrected 2026-08-28 (session 3), after reading the two NASA sources
       that define this mission rather than inferring it:

         Johnson & Silva 2022 §5: "two 37.5-nm flights (total 75-nm range
           without recharging or refueling), with a 20 min reserve"
         Exploration of Design Drivers for the RVLT Lift+Cruise Reference
           Aircraft (NASA): "two hops of 37.5 nautical miles each into a
           10 knot headwind at a cruise altitude of 4000 ft above ground
           level (AGL). The aircraft does not charge when on the ground after
           completing the first 37.5 nmi hop. A 20-minute cruise reserve is
           the final segment of the mission."
         NASA/TM-20230018312: "75 nmi with a 20-min cruise reserve range"

       The harness was flying ONE hop, in still air, reserving at
       best-endurance speed. That is three separate understatements of the
       energy the aircraft actually has to carry, all in the same direction —
       which is why `pack` and `energy` were the two worst rows for every
       vehicle and worst of all for the energy-dominated lift+cruise. */
    missionHops: 2,                // 4 hover segments, 2 climbs, 2 descents
    headwindMS: 10 * KT,           // 5.14 m/s — stated in both sources
    reserveAtCruiseSpeed: true,    // "cruise reserve", not best-endurance
    /* ── VERTICAL SEGMENT TIME: 30 s, AND THE UNCERTAINTY IS STATED ───
       The engine defaults to 120 s, citing Johnson & Silva's "2-min hover
       OGE" — but that is the INITIAL AIR TAXI mission again, not this one.
       TM-20210017971 Table 1 "Mission Segments" gives this mission's profile:
       altitudes 6,000 -> 6,050 ft (a 50 ft vertical transition) at 100 and
       -100 ft/min, i.e. 30 s up and 30 s down, plus 15 s ground segments at
       10% power and a 1,200 s (20 min) reserve.

       ⚠ THAT TABLE IS COLUMN-SHREDDED in both -layout and raw extraction, so
       30 s is a READING, not a quoted figure. It is however self-consistent:
       50 ft at 100 ft/min is exactly 30 s, and both numbers are legible.

       SENSITIVITY, MEASURED AND REPORTED RATHER THAN TUNED AWAY — mean
       absolute error over MTOW/empty/pack/energy:
         30 s -> 8.1%   45 s -> 7.4%   60 s -> 10.1%   75 s -> 13.9%
       45 s scores marginally better overall but sends L+C MTOW to +12.7%.
       **30 s is kept because it is what the source supports.** Choosing 45 s
       for the better score would be fitting the benchmark, which is the thing
       this project has repeatedly refused to do. */
    hoverTimeTakeoffS: 30, hoverTimeLandingS: 30,
    /* Geometry straight from Table 12 — this is the point of the exercise. */
    nPropHover: v.nRotors,
    /* Thrust-weighted solidity, published per vehicle in Table 12. The rotor
       group model needs a blade chord and derives it from solidity
       (sigma = N_blade c / pi R); without it the model correctly refuses to
       invent a chord and falls back to the legacy [CAL] disk-area constant.
       This harness had the value in its vehicle records and was not passing
       it, so the AFDD rotor model was silently inert here. */
    solidity: v.solidity,
    propDiam: 2 * v.radius_ft / FT,
    tipSpeed: v.tipSpeed_fts / FT,        // the engine reads p.tipSpeed, not p.TipSpd
    ewf: 0.50,                            // inert under buildup, but seeds round 1
    socMin: 0.19, cRateDerate: 0.08, etaBat: 0.90,   // suppressed by sedBasis packUsable
    etaHov: v.FM,
    configType: v.configType,
    /* NASA's own battery basis: 400 Wh/kg installed usable pack. */
    /* NASA's 400 Wh/kg "installed usable pack" is DERIVED, and the derivation
       is published: Exploration of Design Drivers for the RVLT Lift+Cruise
       Reference Aircraft, Table 1 — cell specific energy 650 Wh/kg,
       state-of-charge range 80%, battery pack mass overhead 1.30.
           650 x 0.80 / 1.30 = 400.0 Wh/kg   exactly.
       So 400 is already net of usable-SoC and packaging, and `packUsable`
       (which zeroes socMin / cRateDerate / etaBat) is the right basis. This
       confirms a treatment that had been assumed rather than sourced. */
    sedCell: 400, sedBasis: "packUsable",
    /* ── ONE EFFICIENCY, BECAUSE L/De MEANS THE SAME THING FOR ALL THREE ──
       `Pcr = (W/etaSys) * (V/LD)`. Table 12 publishes **L/De = W*Vbr/P** for
       every vehicle in it — an EFFECTIVE ratio, already power over
       weight-times-speed, and defined identically for the quadrotor, the
       side-by-side and the lift+cruise. So `LD` is fed each vehicle's own
       L/De and `etaSys` carries only what L/De does NOT already contain: the
       battery-to-shaft POWERTRAIN. Putting a propeller efficiency in as well
       would count propulsive efficiency twice.

       Earlier revisions of this file got that wrong in both directions —
       0.80 for all three (double-counting on the wingless ones), then a
       wing-borne/rotor-borne split that fed the lift+cruise an aerodynamic
       L/D of 9.90 taken from a DIFFERENT VINTAGE of the aircraft (the
       8,810 lb RVLT design, scored against Table 12's 8,210 lb one). The
       uniform treatment removes both the double-count and the vintage mix.

       ── WHERE 0.845 COMES FROM: DERIVED, AND THE DERIVATION IS FALSIFIABLE ──
       [CAL] — no NASA document states the battery-to-shaft chain efficiency
       for these vehicles, so it is RECOVERED by asking what value reproduces
       their published battery capacity. That is calibration, and it is
       labelled as such. What makes it evidence rather than a fudge is that it
       was solved SEPARATELY for two independent vehicles:

           Quad-E  (4 rotors, DL 3.0 lb/ft2, L/De 5.80)  ->  0.845
           SbS-E   (2 rotors, DL 3.5 lb/ft2, L/De 7.20)  ->  0.845

       Two different configurations, rotor counts, disk loadings and cruise
       speeds landing on the same number to three decimals. A fitted constant
       absorbing unrelated modelling error would not do that; NASA stating
       "consistent technology assumptions were made to size the vehicles"
       predicts exactly that it should.

       It also decomposes. Solving the lift+cruise the same way gives 0.718,
       and 0.718 / 0.845 = 0.850 — a cruise propeller efficiency, against the
       0.80 NASA publishes for the RVLT lift+cruise. The residual difference
       is why the L+C is the least accurate of the three below.

       And it is physically sensible: NASA's own multirotor eVTOL work quotes
       "95% motor efficiency was a target efficiency" (Flight Dynamics
       Conceptual Design Exploration of Multirotor eVTOL), which with a ~97%
       inverter and ~96% distribution and BMS chain gives ~0.85.

       DO NOT quietly re-tune this to improve a score. If it moves, say so and
       show the two-vehicle agreement again — that agreement is the whole
       basis for trusting it. */
    etaSys: POWERTRAIN_ETA,
    /* Rotor-borne cruise efficiency, published per vehicle. */
    rotorborneLoD: v.LoDe,
    weightModel: "buildup",
    /* NASA's OWN motor regression, because these are NASA's OWN vehicles —
       matching the reference class is the point. The engine default is the
       EMRAX fit, which suits a modern eVTOL and is ~2x lighter at the same
       torque; using it here would be the wrong population. */
    motorMassModel: "nasaTorque",
    /* NASA's architecture, not ours — see the header. The engine's own default
       stays direct drive; this makes the BENCHMARK like-for-like. Gearing and
       gearbox mass move together (engine/drivesystem.js), so this is not a
       free ride: it buys lighter motors and pays for a drive system. */
    motorGearRatio: v.gearRatio ?? 1,
    LD: v.LoDe,
    /* FLAT 1.30 THRUST = a 1.482 POWER factor, inside NASA's published 1.3-1.8
       band (corpus S3270). Deriving it per configuration from N/(N-1) was TRIED
       AND REFUTED HERE: it took this benchmark from 13 of 21 metrics within
       +/-5% down to 6, because it makes the lift+cruise 8% too light and the
       quadrotor 6% too heavy. NASA state the factor is configuration-dependent
       but publish no formula, and N/(N-1) is not it. Set EVTOL_TW_DERIVED=1 to
       reproduce the refuted run; see configuration.js twRatioFor(). */
    /* ── NASA'S OWN INSTALLED MARGIN, WHICH IS NOT 1.30 AND IS NOT ONE
       NUMBER ──────────────────────────────────────────────────────────
       This harness imposed a flat twRatio 1.30 on all three vehicles. The
       engine turns that into a POWER factor of 1.30^1.5 = 1.482 (momentum
       theory, P proportional to T^1.5). NASA's own installed margins,
       computed from Table 12's published MRP per lifter against its published
       weight/lift-power, are 1.452, 1.101 and 1.002 -- they differ by 45%
       across three aircraft NASA sized with 'consistent technology
       assumptions'. NASA publish no formula for it, and this project already
       refuted N/(N-1) as a guess at one.

       MEASURED, and this is what identified it: our hover power per lift
       motor is +2.5% / +2.1% / +0.7% against NASA's published requirement.
       The hover physics was never the problem. Applying 1.482 where NASA
       applied 1.101 and 1.002 is the ENTIRE motDrv bias --
         installed power per motor  x1.046 / x1.375 / x1.490 of published MRP
         motDrv mass error           +5.9% / +36.8% / +33.3%
       a one-to-one correspondence.

       SO THE MARGIN IS TAKEN FROM TABLE 12, exactly as this harness already
       takes disk loading, figure of merit, tip speed, solidity, gear ratio,
       cruise speed, L/De and D/q from Table 12. An installed thrust margin is
       a DESIGN CHOICE, not physics -- there is no law that makes it 1.30 --
       so holding the tool to account for failing to guess NASA's arbitrary
       choice tests nothing. Handing it the published choice makes the motDrv
       row a real test of the MASS model at a known rating, which is the thing
       under examination.

       This is NOT fitted to the motor mass. It is fitted to the published
       POWER, and the mass then follows from the specific-power model. The
       installed power is scored as its own metric below so the input is
       visible and checked rather than silently assumed.

       The APP default stays 1.30: that is a design margin for a user, not a
       claim about NASA's aircraft -- the same split as rateOfClimb above. */
    twRatio: process.env.EVTOL_TW_DERIVED ? twRatioFor(v.configType, v.nRotors)
           : (v.published.wpp_lb_hp
               ? Math.pow((v.published.mrp_hp_lifter * v.published.nLift)
                          / (v.published.DGW_lb / v.published.wpp_lb_hp), 2 / 3)
               : 1.3),
    convTolExp: -6,
    /* ── 500 fpm, WHICH IS NASA'S NUMBER, NOT 1000 fpm WHICH WAS NOBODY'S ──
       This harness passed rateOfClimb 5.08 m/s (1000 fpm) — the APP's design
       default, inherited with no source — while NASA's own sizing condition for
       these very vehicles, quoted verbatim above, is:
         "Condition 2: cruise climb at 500fpm at 10,000 ft ISA ... at 100% MRP"
       500 fpm = 2.54 m/s. The engine sizes the motor on the worst SUSTAINED
       condition, and at 1000 fpm the VERTICAL-CLIMB condition governed every
       vehicle — a requirement NASA never imposed. That is the whole point of
       this harness: fly NASA's vehicles on NASA's assumptions.

       STILL CONSERVATIVE, deliberately. NASA's Condition 2 is a CRUISE climb
       (forward flight, with translational lift); the engine models a VERTICAL
       climb, which needs more power at the same rate. So this errs toward
       over-sizing the motor, not under.

       MEASURED: SbS-E motDrv +29.6% -> +15.1% and driveSys +23.8% -> +10.5%;
       SbS-E MTOW +5.1% -> +4.2% and Quad-E motDrv +8.2% -> -3.9%, both now
       inside 5%. Benchmark mean 13.6% -> 13.3%, within-5% count 4 -> 5.
       It makes the LIFT+CRUISE worse (motDrv -9.1% -> -14.0%), and that is
       kept: L+C is already the outlier at -17% MTOW and its defect is in the
       structure group, not the climb condition. Fixing the right thing is
       allowed to make a wrong thing look worse.
       The APP default stays 5.08 m/s — that is a design choice for a user, not
       a claim about NASA's aircraft. */
    rateOfClimb: 2.54, climbAngle: 5, descentAngle: 6, deltaISA: 0,
    /* ── THE FUSELAGE IS NOT ONE BODY SHARED BY THREE AIRCRAFT ─────────
       Every vehicle here got fusLen 7.2 / fusDiam 1.65 -- the app's fixed-wing
       default -- so the quadrotor, side-by-side and lift+cruise were weighed
       and drag-built with an identical fuselage. NASA's own primary source
       (Silva, Johnson, Antcliff & Patterson, AIAA 2018-3847, Table 3 and TM
       Table 12) publishes a DIFFERENT fuselage drag area for each:
           Quad-E 1.4   SbS-E 1.6   L+C-E 1.7   ft^2
       and their design assumption for a "well-designed and built low-drag
       fuselage" is a flat CD of 0.0045 on wetted area (Johnson, Silva & Solis
       2018, Table 8). Dividing gives the wetted area, and inverting Raymer's
       fineness form at the 1.65 m diameter gives a length:
           Quad-E 28.9 m2 -> 7.73 m   SbS-E 33.0 -> 8.52   L+C-E 35.1 -> 8.91
       [INF] -- two inferences (the 0.0045 is a stated design assumption from
       the earlier paper's vehicle set, and the diameter is held), and flagged
       as such. What is NOT inferred is the direction: NASA's six-passenger
       bodies are LONGER than 7.2 m, not pods. The same paper, p.4, says the
       1200 lb payload "results in a very different concept aircraft, with a
       large fuselage and very large rotors", and p.15 that "the fuselages ...
       do not appear to be wildly different from existing rotorcraft". The
       1-2 seat multicopter pod (Yang et al. 2024, fineness 1.4-3.6) is real
       and is what the APP applies when a user picks a multicopter; it is not
       what NASA's benchmark vehicle is, so it is not applied here. */
    /* THE INFERRED LENGTHS ARE RECORDED AND NOT APPLIED. Applying them was
       tried and measured. They barely move the fuselage drag row (1.29 ->
       1.31 ft^2 on the quadrotor: Raymer's skin friction falls with length
       as the wetted area rises, and the two nearly cancel), so the drag
       comparison gains almost nothing. And they have a side effect the
       source does not support: the lift+cruise boom arms are formed from
       fuselage-station FRACTIONS, so a 7.2 -> 8.91 m body lengthened its
       arms 2.80 -> 3.43 m and its booms 74 -> 112 kg, when NASA's L+C boom
       arm is a geometric fact of that aircraft, not a function of a length
       inferred from a drag coefficient. Two inferences deep with a knock-on
       into a different group is not a number to fly the benchmark on. The
       body stays at the app's 7.2 m, which NASA's own text places in the
       right class ("a large fuselage", "not wildly different from existing
       rotorcraft"); fusLenM on each record preserves the inference for the
       day a published dimension replaces it. */
    fusLen: 7.2, fusDiam: 1.65,
    /* NASA's fuselage technology factors, Johnson/Silva/Solis 2018 Table 6,
       in NDARC 29-4's own structure W = chi_basic w_basic (1 + chi_cw f_cw):
         chi_basic 0.76; chi_cw (crashworthiness) 0.90; f_cw 15% on the
       quadrotor, 6% otherwise; +25 lb (11.34 kg) fuselage increment on the
       quadrotor for its rotor-speed-control AEI solution (p.6). Net 0.863
       (quad) and 0.801 (others) against the app's single 0.90. A first
       version compounded these as 0.76 x 0.90 x 1.15; see weights.js for why
       that was wrong. The engine default stays Raymer's 0.90 for app users. */
    fuselageTechFactor: 0.76,
    fuselageCrashTech: 0.90,
    fuselageCrashFrac: v.configType === "multicopter" ? 0.15 : 0.06,
    fuselageIncrementKg: v.configType === "multicopter" ? 25 / LB : 0,
    /* WING AND EMPENNAGE PARAMETERS ARE ONLY SUPPLIED TO AIRCRAFT THAT HAVE
       THEM. Passing AR, taper, thickness, Oswald efficiency, wing loading,
       cruise-CL ceiling and four V-tail coefficients to a quadrotor was
       sloppy: harmless only because the engine now guards them, and it hid
       whether they were truly unused. A wingless case that silently depends on
       a wing parameter should fail loudly, not quietly inherit one. */
    ...(v.configType === "multicopter" || v.configType === "sideBySide" ? {} : {
      AR: 9, eOsw: 0.85, taper: 0.45, tc: 0.15,
      wingLoadingNm2: 1450, clCruiseMax: 0.90, clDesign: 0.55,
      vtGamma: 45, vtCh: 0.45, vtCv: 0.032, vtAR: 2.5,
      /* ── THIS VEHICLE'S OWN PUBLISHED L/De, NOT ANOTHER VINTAGE'S L/D ──
         `useTargetLD` forces the sizing loop onto `p.LD`, which paramsFor sets
         to this vehicle's Table 12 `LoDe` (8.50). That is the same quantity,
         from the same table, as the 5.80 and 7.20 the wingless vehicles use —
         so all three are treated identically.

         This previously forced L/D = 9.90 from the RVLT Lift+Cruise
         design-drivers paper. That number is real and correctly read, but it
         belongs to the **8,810 lb** RVLT design, and this harness scores
         against Table 12's **8,210 lb** vehicle. Mixing them is the vintage
         trap the header of this file warns about, and it cost +22.6% on MTOW.

         ⚠ SEPARATE FINDING, STILL OPEN: our drag model computes an
         aerodynamic L/D of ~11.5 for this aircraft. Against NDARC's published
         9.90 for the closely-related design that is ~16% optimistic — a real
         gap in engine/drag.js, now visible rather than buried in the energy
         error. It does not affect the numbers here because L/De is forced. */
      useTargetLD: true,
      autoPositionWing: true, targetSM: 0.15,
    }),
  };
  /* Reserve distance folded in the way App.jsx does — get this wrong and the
     aircraft flies a different mission. The factor MUST match the engine's
     reserve speed: the engine subtracts `Vres * t_reserve` from range to get
     the cruise leg, so folding in 0.76 V while the engine reserves at 1.00 V
     would silently shorten the cruise by the difference. */
  const vResFactor = p.reserveAtCruiseSpeed === true ? 1.0 : 0.76;
  p.range = RANGE_KM + vResFactor * p.vCruise * p.reserveMinutes * 60 / 1000;
  return p;
}

/* ── TURBOELECTRIC SIZING CASES ─────────────────────────────────────────
   Kept apart from NASA_VEHICLES on purpose: validation/provenance-drift.mjs
   requires every vehicle in THAT list to be all-electric, because the
   battery harness has no fuel model. These are scored by
   validation/turboelectric.mjs, which runs the engine's turboelectric
   powertrain (src/engine/turboelectric.js).

   WHY SILVA 2018 AND NOT TM-20210017971's "UPDATED L+C TE". Table 12 of the
   TM cites its electric columns to Silva et al. 2018 [its ref. 3], and they
   equal Silva's Table 3 (L+C E: 8210 lb), which is the vehicle
   nasa-configs.mjs validates against. The TM's turboelectric column is an
   UPDATE with different assumptions ("drag coefficients for the rotor hubs
   and supports were doubled", M4SS weights, wire weights, motors rated at
   MCP, motor tech factor 1.33 — TM §7.1), so it is not the electric
   vehicle's sibling. Silva 2018's L+C TE is: same paper, same mission, same
   technology set as the validated L+C E.

   Silva, Johnson, Antcliff & Patterson, "VTOL Urban Air Mobility Concept
   Vehicles for Technology Development", AIAA ATIO 2018 (NTRS 20180006683),
   Table 3, "L+C TE" column, read from the PDF text:
     lifter DL 9.6 lb/ft2, radius 5.0 ft, solidity 0.196, hover tip speed
     546 ft/s, 8 lifters at 88 hp MRP, 1 cruiser at 446 hp, total deliverable
     power 1152 hp, total installed 3376 hp, weight/lift power 7.8 lb/hp,
     D/q 13.9 ft2 (fuselage 1.7), battery 160 MJ / 188 lb, fuel tank capacity
     176 lb, DGW 6013, empty 4627, structure 2112, rotor group 748,
     propulsion 1530, fuel system 298, drive 315, systems 522, flight
     controls 134, energy burn 2510 MJ, fuel burn 129 lb, L/De 7.2, hover FM
     0.70, Vbr 122 kt at DGW 6k ISA, hover and cruise C-rate 0.0.
   For the single-powerplant vehicles in the same table deliverable equals
   installed power; here 3376 - 1152 - (8 x 88 + 446) = 1074 hp, which is the
   generator (1152 x 0.95 x 0.98 = 1072). So 1152 hp is read as the
   turboshaft rating - an inference, stated as one. */
export const NASA_TE_VEHICLES = [
  {
    key: "L+C-TE", label: "NASA lift+cruise, turboelectric (Silva 2018)",
    configType: "liftcruise", wingBorne: true, powertrain: "turboelectric",
    nRotors: 8, radius_ft: 5.0, DL_lbft2: 9.6, solidity: 0.196,
    tipSpeed_fts: 546, FM: 0.70, Dq_ft2: 13.9, fusDq_ft2: 1.7, LoDe: 7.2,
    vCruise_kt: 122,
    gearRatio: 3.85,   // same motor speed class as L+C-E; see that record
    published: { DGW_lb: 6013, empty_lb: 4627, pack_lb: 188, pack_MJ: 160,
                 fuelCapacity_lb: 176, fuelBurn_lb: 129, energyBurn_MJ: 2510,
                 turboshaft_hp: 1152, cruiser_hp: 446,
                 structures_lb: 2112, rotor_lb: 748, propulsion_lb: 1530,
                 fuelSystem_lb: 298, drive_lb: 315, systems_lb: 522, fc_lb: 134,
                 mrp_hp_lifter: 88, nLift: 8, wpp_lb_hp: 7.8 },
  },
];
