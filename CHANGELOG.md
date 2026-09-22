# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

**Version 0.y.z means results can still change between releases.** Semantic
Versioning reserves 0.y.z for initial development, and this tool is in it: the
sizing engine is corrected often, and a correction moves numbers. Every
release lists the corrections that moved results, and a saved design file
tells you when a newer engine gives a different answer for it.

**What counts as the public interface** (what a MAJOR version will protect
once 1.0.0 is released):

- the design-file format (`format: "evtol-sizer-design"`, `formatVersion`);
- the names and meanings of the result outputs registered in
  `src/lib/provenance.js`;
- the verification gates run by `npm test`.

The version is set in one place, `package.json`, and shown in the app, the
reports and saved design files from the build stamp. While a release is being
prepared it carries a `-dev` suffix; `CITATION.cff` names the last released
version. `validation/release.mjs` checks that these agree.

## [Unreleased]

### Added
- Design files: every input, the custom airfoil, an input hash, the engine
  build stamp and the full result fingerprint. Designs can be downloaded and
  opened as `.evtol.json` files without an account. Reopening a design re-runs
  it and reports whether today's engine gives the same result.
- Warnings and limitations on every result, following NASA-STD-7009B
  §4.3.8 ([M&S 32]–[M&S 34]): failed criteria, model omissions, domain
  excursions, execution errors, setup issues and measured shortfalls, each
  with its impact, plus an uncertainty statement for every output. Shown in
  the app and at the front of the PDF report.
- Validation and verification domains ([M&S 26]): the envelope of the
  aircraft the tool has been compared against and the input ranges its
  identity checks cover, generated from the harnesses.
- The engine now reports `twinKappa`, the side-by-side rotor-overlap factor it
  applies to hover power.
- Gates: `aircraft-classes`, `trainer`, `transport`, `transport-mission`, `transport-aero`, `bizjet`, `aircraft-engine`, `studio-render`, `turboprop`, `design-file`, `total-range`, `validation-domain`, `result-warnings`, `release`, `api`, `cpacs-export`, `turboelectric`;
  `provenance-report` now fails on unclassified outputs.
- A Node API (`import { size } from "evtol-sizer"`) and an `evtol-size`
  command for scripts and other languages, documented in docs/API.md. Every
  result comes with its warnings and domain placard.
- CPACS 3.5.1 export (rotorcraft mass statement, reference values, global
  figures; no geometry) validated against the official schema, and a
  requirements-traceability CSV with one row per check and the sources each
  check cites. 35 of the 43 checks on the default design cite no source in
  their result; the export says so rather than inventing one.
- A turboelectric powertrain (Battery-electric / Turboelectric toggle): a
  turboshaft-generator carries every mission segment with zero net battery
  flow, and the pack is sized for a 2-minute engine-out hover at no more than
  14C, as in NASA's turboelectric reference concepts. Engine: NDARC's simple
  referred-parameter model (power lapses as δ√θ, constant sfc) with NASA's
  UAM engine table. Compared with NASA's turboelectric lift+cruise (Silva et
  al. 2018): gross weight -19% (its battery sibling is -24%), fuel carried
  -6%, fuel burn -10%, turboshaft power -8%. Validated on that one aircraft
  only; every other turboelectric design is placarded outside the validated
  domain. The Cost tab says it does not price fuel.
- **A dual sizing engine.** An **eVTOL | AIRCRAFT** switch beside the title
  changes the whole tool between the eVTOL sizer (unchanged) and an aircraft
  studio with its own engine (`src/classes/aircraft/`), inputs and 15 tabs for
  piston trainers, turboprop airliners, business jets and jet airliners:
  matching chart, segment mission, weights, drag polar, propulsion,
  payload-range, carpet trade studies, sensitivity, one requirement sized
  across every type, a reality check against 969 manufacturer- and
  regulator-sourced aircraft, live validation, and design files. Each mode
  keeps its design while the other is shown. The old one-page class
  workspaces are replaced; their `?class=` links open the studio.
- **An input deck for the aircraft studio** (`src/classes/aircraft/input-deck.js`,
  `InputPanel.jsx`), replacing the single long column of inputs. Each type
  gets its own deck: the requirements that size the aircraft are pulled into
  a key-requirements box at the top, the rest are grouped into named pages
  (including a flight profile page) reached by chips, and inputs that only
  apply to a chosen method appear only when that method is chosen. Every row
  carries its provenance status, a unit, arrow-key stepping, an out-of-range
  border and a reset dot, with search across the whole deck and a reset-all.
- A business-jet class (`src/classes/bizjet/`): the jet method with
  business-jet inputs (Citation Latitude defaults, aft engines, T-tail,
  executive seats, part-full published missions, NBAA-style reserves).
  Basic operating weight: Latitude +4.1 %, Longitude −7.4 %, PC-24 +15.3 %.
- A take-off-mass error band on every aircraft result, from the measured
  error of its method on real aircraft.
- Jet transport, opt-in options:
  - a segment mission: taxi, take-off, climb and descent integrated as in
    TASOPT 2.00 A.2.15, Breguet cruise, NASA Aviary's FLOPS engine-deck
    shape, and reserve policies from 14 CFR 121.639 and 121.645, EASA
    Part-CAT and an NBAA convention;
  - engine location: wing, aft fuselage and two three-engine layouts;
  - tail sizing from Scholz 2021 tail volume coefficients;
  - a FLOPS component drag build-up (`dragMethod: "flops"`), ported from
    NASA Aviary. It reproduces Aviary's aerodynamics unit tests to 1e-6.
    It also reproduces drag polars printed by FLOPS for three transports,
    within Aviary's own tolerance: norm error 0.3-0.5 % over the first 134
    points, with the worst single point at 2 %. FLOPS's fixed 6 %
    excrescence drag is included. The mission evaluates this polar at every
    Mach and height;
  - the transport class gets a standard atmosphere with the isothermal
    layer above 11 km. The eVTOL engine's ISA has none, which no eVTOL
    needs.

  Found while porting: Aviary's forward-sweep induced-drag term converts
  sweep with the wrong factor (degrees × 180/π). Its unit test encodes the
  slip; the port uses radians.
- Turboprop: an optional systems-and-equipment factor (FLOPS per-item mass
  scalers); 0.858, fitted on the ATR 42, gives ATR 72 +9.7 % and Dash 8-400
  −2.3 %. Off (1) by default.
- Jet transport: a wing composite fraction (FLOPS FCOMP), off by default.
- A turboprop transport class (`src/classes/turboprop/`, `?class=turboprop`):
  a regional turboprop sized on power from payload, range and runway lengths
  (Scholz & Nita 2008), with FLOPS airframe masses, a GASP engine and engine
  section, Hamilton Standard propellers (NASA CR-114399) and propeller Breguet
  fuel. The matching reproduces Scholz & Nita's ATR 72 design point; the
  propeller equation reproduces CR-114399's own weights to 3%. Operating empty
  mass ATR 72-600 +14.8%, ATR 42-600 +4.4%, Dash 8-400 +2.0% (FLOPS runs heavy
  on turboprops, as NASA found; no calibration applied). Block fuel against the
  factsheets -15% to +38%. ATR 72 sized from its requirement: +11% take-off
  mass. The FLOPS port gains optional turboprop, APU-mass and cargo-container
  inputs; the jet class's outputs are byte-identical.
- A jet transport class (`src/classes/transport/`, `?class=transport`): a
  twin-engine airliner sized from payload, range, cruise Mach and runway
  lengths (Loftin, NASA RP-1060, in Scholz's SI form; 14 CFR 25.121 climb
  gradients), with FLOPS weights ported from NASA's Aviary. The port
  reproduces NASA's FLOPS output for a 737-800 model to 0.1% on all 35
  weights. A320 operating empty weight +0.4%, A320 range -3.6%; a 737-800
  sized from Boeing's runway charts: take-off weight +1.7%, wing +2.3%,
  thrust +9.1%. Two fuel methods (Loftin; generic fractions with 14 CFR
  121.639 reserves, which is about 20% heavy). The trainer and transport
  pages share one workspace kit (`src/classes/ui-kit.jsx`) and link to each
  other.
- A piston trainer class (`src/classes/trainer/`): a light single-engine
  aeroplane sized from its stall speed, climb rate, cruise speed and range
  (Loftin, NASA RP-1060) with GASP component weights (NASA CR-152303),
  Hamilton Standard propeller weights (NASA CR-114289) and FAR 23 design
  loads. Every input states whether its default is sourced, derived or
  assumed. Empty weight from gross weight, wing and engine: Cessna 172S
  -5.8%, 1976 Skyhawk +4.8%, Cherokee 180 +6.5%. A C172S sized from its own
  requirements: gross +2.2%, wing area +2.2%, empty -7.4%, power -11.9%,
  fuel -16.6%. Three equations are misprinted in GASP Vol V (V.1.63, V.1.69,
  V.1.74); the code follows NASA's Aviary, whose tests it reproduces. It has
  its own workspace at `?class=trainer` (also in the ••• menu): size from
  requirements or analyse an existing aircraft, every input marked sourced,
  derived or assumed, with warnings and a live validation table. The eVTOL
  sizer is unchanged; the page picks a workspace from the address, and an
  unknown class shows an error rather than opening the eVTOL sizer.
- An aircraft-class registry (`src/classes/registry.js`), the groundwork for
  trainer and transport sizing. eVTOL is its only class so far and sizes
  exactly as before: the golden master runs through the registry too, and a
  new gate pins the eVTOL defaults and keeps class code out of the eVTOL
  engine.
- This changelog and a single version number.
- Manuals: `docs/USER-GUIDE.md` (what each tab does and how to read a
  result) and `docs/THEORY.md` (every model the engine uses, its source and
  where it is in the code). The release gate checks both exist, that the
  README links them and that the guide's tab table matches the app.
- `docs/CONVENTIONAL-MODE.md`: the design for a fixed-wing trainer mode and
  the evidence it needs before it is built. No trainer sizing is in the app.

### Changed
- **One thrust lapse, not two.** The matching chart took cruise thrust from
  Scholz's bypass-ratio correlation (0.233 of static thrust at 35,000 ft)
  while the mission took it from the NASA Aviary FLOPS deck (0.186 there) —
  a 25 % disagreement inside a single sizing run. Boeing describes taking
  take-off, cruise and idle thrust from one scaled deck, so the deck is now
  the default for both (`thrustLapseMethod: "deck"`), and the matching chart
  uses the lapse the sizing used rather than recomputing its own. The
  correlation is kept as an option because it carries bypass ratio
  explicitly. The cruise thrust-to-weight line rises from 0.229 to 0.288 on
  the default 737-800, which take-off still governs, so that aircraft does
  not move. Measured on the 160 airliners that closed under both, the error
  is identical (8.7 %), and eight further aircraft — five 737 variants and
  three 727s — now close where they previously ran away.
- **The aircraft must be able to reach the altitude it cruises at.** The
  initial-cruise-altitude requirement is now on by default and tied to the
  cruise altitude (`icaRequirement: "cruise-altitude"`), with the 300 ft/min
  residual climb the studies use. Every public study process applies this
  check and the tool did not, so a design could be sized that could not
  reach its own cruise altitude. Measured over the 168-aircraft dataset it
  improves the tool whichever take-off method is used: with the statistical
  line the take-off-mass error goes from a mean of −0.7 % and 9.2 % absolute
  to −0.0 % and 8.8 %, and the number of aircraft sized within 5 % rises
  from 73 to 87. The quoted method accuracy follows.
- **Take-off field length from the run itself** (`takeoffMethod: "far25"`,
  off by default), computing the distances 14 CFR 25.109(a) and 25.113(a)
  define by integrating the equations of motion along the runway, and
  finding the balanced V1 at which the accelerate-stop and take-off
  distances are equal. Thrust falls with speed along the roll, from the
  engine deck, instead of being held at its static value. The regulation
  text is held verbatim in the research tree.

  Two parts of 25.109 were missing from the first version of this and have
  been added, which removed most of a systematic bias. The rejected take-off
  does not begin decelerating at V1: (a)(1)(ii) has the aeroplane accelerate
  on to "the highest speed reached during the rejected takeoff" while the
  engines spool down and the brakes build, and (a)(1)(iii) stops it from
  *that* speed — the two seconds of (a)(1)(iv) are a separate margin, not
  that interval. And (b)(2)(ii) asks for "the distribution of the normal
  load between braked and unbraked wheels": the nose gear carries part of
  the weight and has no brakes, so only part of the normal force retards the
  aeroplane. Modelling both took the field-length bias from −7.8 % to
  −2.7 %, and the 737-800 from −6.3 % to −1.7 %.

  On field length it is much the better model. Against the 23 dataset
  aircraft that publish a field length with a take-off mass, wing area,
  thrust and engine count, each given its own class's high-lift values: mean
  −2.7 % and a mean absolute error of 11.6 %, against Loftin's +21.3 % and
  22.6 %. On the 737-800 it gives 2,157 m against a published 2,195 m, a
  balanced V1 of 142 kt, and sizing that aircraft it gives thrust +2.3 % and
  take-off mass −0.7 %, where Loftin gives +7.8 % and +0.5 %.

  It is still not the default. Over the whole dataset, both with the
  cruise-altitude requirement on, it gives a mean take-off-mass error of
  −3.6 % and 8.3 % absolute against the statistical line's −0.0 % and
  8.8 %, and puts 84 aircraft inside 5 % against 87. The absolute error is
  the better of the two and the bias is the worse.

  The residual bias is concentrated in the three- and four-engine
  widebodies, and the reason is worth stating: Loftin's take-off line
  carries no engine count at all, while losing one of four engines costs far
  less than losing one of two, so this method asks a quad for about 30 %
  less thrust to make the same balanced field. That is correct, and it means
  the take-off run does not size those aeroplanes — whatever does is not yet
  modelled. Prefer this method when the engine count or the configuration is
  unusual, precisely because the statistical line cannot see either. All
  four runs of the comparison are recorded in the research tree.
- **An initial-cruise-altitude requirement** (`initialCruiseAltReqFt`, 0 =
  not checked), with the residual rate of climb the studies use — SUGAR's
  "ROC at ICA (fpm): 300". Every public study process sizes to this and the
  tool did not: its cruise line asks only that thrust equal drag, which is a
  zero-rate ceiling, so an aircraft could be sized that cannot reach the
  altitude it is said to cruise at. Douglas sized engines to a 31,000 ft
  initial cruise altitude, Lockheed required 30,000 ft, and Airbus defines
  the maximum recommended altitude as the lowest of the certified,
  maximum-cruise-thrust, 1.3 g buffet and 300 ft/min ceilings. On the default
  737-800 the requirement at its own 35,000 ft cruise altitude is T/W 0.323
  against a cruise line of 0.288, still under the 0.336 take-off line, so
  that aircraft does not move; ask for 39,000 ft and the requirement governs
  the engine, taking thrust from 29,433 to 35,554 lbf. It is drawn as a
  fifth line on the matching chart.
- **A buffet check, on the user's own limit** (`buffetClLimit`, 0 = not
  checked). The 1.3 g margin is applied as stated, but no verified public
  buffet-lift-coefficient correlation was found — FLOPS's BUFFET table needs
  its reference CL and unit construct settled, and the Airbus chart is an
  image — so nothing is assumed. With no limit entered the result says the
  check is not made rather than implying it passed.
- **Fuel volume can be a constraint instead of a warning** (`fuelVolumeConstraint`,
  off by default). FLOPS and Aviary carry excess fuel capacity as a sizing
  constraint and Boeing's process sizes to a fuel capacity requirement; here
  the tool would report an aircraft whose tanks did not hold its own mission
  and merely say so. With the constraint on, the wing grows — the wing
  loading drops below the landing limit, which is allowed, because that line
  is an upper bound — until capacity meets the fuel required. A 737-800
  stretched to a 5,000 nm design range needs 33,316 kg of fuel and holds
  30,627 kg; with the constraint on it closes at a 168.4 m² wing (from
  160.8 m²) with capacity exactly meeting the requirement, and a slightly
  lower take-off mass, because the aircraft that closes is not the same one.
  Fuel carried outside the wing is a separate input (`fuselageFuelLb`).
- **The wing composite fraction is calibrated and its trap is documented.**
  FLOPS's FCOMP is a utilisation level, not a mass fraction, so a 787 wing
  is not "0.5" because the aircraft is 50 % composite by structural weight;
  NASA applies 1 for "maximum use of composites". Measured on the four A350
  rows of the dataset, which have a carbon-fibre wing: +20.0 % take-off mass
  at 0, +14.6 % at 0.5, +9.7 % at 1. It stays 0 by default, because every
  other airliner in the set has a metal wing and applying it to them makes
  them worse. FLOPS has no composite term outside the wing, so a composite
  fuselage and tail are still modelled as metal.
- **Payload-range respects the structural limits.** The maximum payload was
  the design payload, because "a conceptual model has no MZFW". A maximum
  zero-fuel mass is now an input (`mzfwRatio`, 0.7939 for the 737-800 from
  its airport-planning document; 0.6957 for the Citation Latitude from its
  type certificate), and the maximum payload is MZFW − OEW. For the
  737-800 that is 19,045 kg against a design payload of 16,546 kg, so the
  diagram gains a proper structural corner and a separate, marked design
  point. Each corner's landing weight is checked against the maximum
  landing mass. Where the entered ratio and the sized take-off mass
  disagree — the business jet, whose take-off mass sizes 14 % light — the
  diagram says so and falls back to the design payload rather than drawing
  an aircraft that cannot carry its own mission.
- **Business-jet results move.** An audit of the field-length method against
  published business-jet performance (research notes
  `classes/business-jet/METHODS.md` §8) found the class was reading airliner
  constants and a fleet-average landing distance that was not referenced to
  maximum landing weight. The class now carries:
  - its own Loftin constants, recalibrated on the eight types whose landing
    distance is published at MLW: k_L 0.091 kg/m³ (airliners 0.107) and
    k_TO 2.64 m³/kg (airliners 2.34);
  - CLmax values measured from published approach speeds rather than
    back-fitted: landing 2.17 for the Citation Latitude (Part 23 light jets
    1.80, Part 25 mid-size 2.1, slatted high-sweep 1.76), take-off 1.7;
  - the Latitude's own landing field length, 817 m at MLW ÷ 0.6 = 1,362 m.

  The sized wing loading goes from +41 % against the published value to
  +8 %, which is what the recalibration predicts (301.2 kg/m²); the wing
  area error goes from −30 % to −21 %, the rest being weight-method error.
  The wing loading is now a gated check.
- **Ultimate load factor follows 14 CFR 25.337(b)** for business jets:
  n = 2.1 + 24,000/(W + 10,000), bounded to 2.5–3.8, times 1.5. It is a
  function of weight, and only reaches the 2.5 floor — FLOPS's fixed 3.75 —
  above about 50,000 lb. The Citation Latitude is 4.03, not 3.75, which
  raises its basic operating weight by 0.3 %. Airliners are unaffected and
  keep the entered value (`loadFactorMethod: "input"`).
- **The NBAA IFR reserve now flies the profile the manufacturers print.**
  Five Textron/Cessna flight planning guides give it verbatim: a 5-minute
  approach at sea level, climb to 5,000 ft, a 5-minute hold at 5,000 ft,
  then the diversion and 30 minutes of holding fuel at 5,000 ft. The
  approach and the 5,000 ft hold were missing, and the diversion climbed
  from sea level instead of from the 5,000 ft the aircraft is already at.
  The Citation Latitude's range falls from +12.0 % to +10.0 % against the
  published figure and the Longitude's from +22.2 % to +20.9 %.
- **The measured accuracy figures were re-measured** after 20 three-engine
  aircraft (727, DC-10, MD-11) were added to the airliner dataset from the
  Boeing airport-planning charts. The airliner take-off-mass error is
  9.2 % over 168 aircraft, where it was 7.9 % over 140. The code did not
  get worse: the trijets are simply harder — the three-engine widebodies
  size to 16.9 % and the 747s to 22.6 % — and on the 160 aircraft common to
  both sets the error is 8.7 %, with the last step to 9.2 % coming from
  eight aircraft that now converge where they used to fail, one of them
  badly. The business-jet band is 9.2 %.
- **Jet transport results move:** the default fuel method is now the segment
  mission (was Loftin), with the CFM56-7B27's compiled cruise TSFC 0.60
  (was 0.66, tuned for Loftin). The 737-800 sized from its requirements goes
  from +1.7 % to +0.5 % take-off weight and from +9.1 % to +7.8 % thrust; the
  A320 range at MTOW from −3.6 % to −0.4 %. Choose `fuelMethod: "loftin"` and
  `tsfcCruise: 0.66` for the previous numbers.
- The tab-render gate renders every tab under both powertrains.
- The identity checks run on all six layouts and over the full slider ranges;
  they ran only on lift+cruise before.
- The package is named `evtol-sizer` (was `evtol-sizing-app`).
- The citation gate also scans the documents (`*.md`, `*.html`, `*.cff`).
- README rewritten: tool classification (NPR 7150.2D Class E), what the tool
  is not, and no claim that the MATLAB script it began from was validated.
- Two tabs are named for what they show: "Designs & References" (it holds
  the version history) and "Collaboration" (was "Design Archive").

### Fixed
- The matching chart held the air density ratio σ at 1, so a field length
  could only ever be a sea-level standard-day one, however the aircraft was
  meant to operate. Field elevation and the temperature above ISA are now
  inputs and σ is computed from them. Nothing moves at the default (sea
  level, standard day); a 737-800 required to make the same field lengths
  at Denver on an ISA+15 day sizes to a 28 % larger wing and 3.5 % more
  take-off mass. Enter 15 °C to size to the 86 °F day Boeing uses.
- The jet transport's limitations text said turboprops and a component drag
  build-up were not modelled — both have been for two releases — and quoted
  a thrust lapse of "about 0.32" for the engine deck with the direction of
  the disagreement backwards. The deck gives 0.186 at 35,000 ft and
  Scholz's correlation 0.233, so the correlation is 25 % above the deck,
  not below it. The text now states the measured pair, says which of the
  two each part of the sizing uses, and lists what is genuinely missing.
- Reopening a saved design merged it into the current session's inputs, so the
  same design could give different aircraft. It now replaces them.
- A failed save to the account reported "Design Saved".
- The result reported a hover download fraction of 0.10 whenever none was
  entered, although the layout default (0 to 14.69%) was the one applied.
  Result files change in that field only; no sizing result moved.
- Loading a leaderboard entry did nothing (its table has no inputs); it now
  opens the published design.
- The Uncertainty tab ignored the custom airfoil.
- A 0-minute reserve added 20 minutes of reserve distance to the range the
  engine was given, and the engine flew it as cruise: 100 km asked, 161 km
  flown on the default design. This was true of the main result, Monte Carlo,
  sensitivity, design space, layout comparison and the VSP-model replication,
  and the slider showed 20. The marketing mission basis had the opposite gap
  when the reserve was left unset. Every caller now builds the range in one
  place. Two smaller mismatches went with it: the sensitivity panel added the
  reserve at the unperturbed cruise speed when it perturbed cruise speed, and
  the VSP-model replication ignored a reserve given as a distance. Designs
  with a reserve above 0 minutes give the same main result as before.

## [0.1.0] - 2026-09-01

The version named in `CITATION.cff`. It was never tagged, so it identifies no
exact commit; changes up to it are in the git history.

