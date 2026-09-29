# FINAL VERDICT — Independent Verification & Validation, PASS A

**System:** eVTOL Sizer Live — eVTOL / aircraft / drone conceptual sizing platform
**Commit:** `3a7a5a4`, branch `shared-auth`, working tree clean at audit start
**Auditor:** lead independent V&V, with seven delegated domain auditors, all findings re-checked
**Status:** **PASS A complete.** No engineering code was modified. Remediation not authorised.

Status vocabulary, per Phase 33: **VERIFIED** · **PARTIALLY VERIFIED** · **UNVERIFIED** · **FAILED**.
No generic score is given. Phase 28 is observed: the words "validated", "production-ready" and
"NASA-level" are not used as conclusions anywhere in this document.

---

## 1. SYSTEM OVERVIEW — VERIFIED

464 tracked files; `src` 84,909 LOC (184 `.js`, 75 `.jsx`); `validation` 29,146 LOC across 116
harnesses. Three independent engines behind one shell (`src/classes/Root.jsx`): the eVTOL sizer
(`src/engine.js`, 4,105 LOC), a fixed-wing studio dispatching through `src/classes/registry.js` to
five registered classes (evtol, trainer, transport, bizjet, turboprop — `bizjet` reuses
`sizeTransport`), and a drone studio outside that registry. Method lineage is real and cited: NDARC
AFDD for eVTOL weights, GASP for the trainer, FLOPS/Aviary for the three jets and the turboprop,
Loftin matching, NASA UAM sizing missions. 467 engine outputs and 89 inputs carry a provenance
classification. Full map in `ARCHITECTURE.md`.

## 2. WHAT WAS AUDITED — VERIFIED

All 35 phases of the brief were executed for PASS A. Covered: the unit system and every conversion
factor; five atmosphere implementations; the full aerodynamic chain; propulsion and the efficiency
chain; mass closure in all six eVTOL layouts and four other classes; mission energy; 18 iterative
loops; geometry and every drawing; every chart; state contamination; regulatory checks against a
vendored primary corpus; ~60 adversarial input cases; numerical precision across 269 rounding sites;
provenance; and the integrity of the existing 116-harness suite.

**Not covered, and stated as such:** the React/UI layer under live interaction (no browser pass);
the 3D/VSP export geometry beyond its provenance annotations; the economics and community modules
beyond chart arithmetic; and the drone flight simulator's dynamics beyond its energy and SoC
bookkeeping.

## 3. FORMULAS VERIFIED — VERIFIED

**147 distinct engineering formulas** located and given a definite verdict; **113 PASS** on
mathematical expression, variable definition, units, sign convention, reference conditions and
efficiency direction. No formula is recorded as "probably correct". **20 quantities were
independently recomputed** by an implementation sharing no code with the application
(`AUDIT/reference/`), including: the ISA at nine altitudes (**0.00 %**), the ISA constant triple
(ρ₀ = 1.225000, a₀ = 340.2940 against NDARC's published 340.294), hover momentum theory by two
independent routes (**agreement 2.22e-16**), cruise power (0.02 %), mass closure, energy closure,
NDARC AFDD93 wing (**0.001 %**) and FLOPS wing Eq 2-8 (**2e-6**). Inventory in
`FORMULA-INVENTORY.md`.

## 4. FORMULAS NOT VERIFIED — PARTIALLY VERIFIED

22 FAIL, 7 WARNING, 5 UNVERIFIED. The unverified five are: the V-tail weight formula, misattributed
to Raymer 15.26 (**U-06**, which the project already records as unverified); the turboelectric
referred-power lapse (**U-02**); `aeropropulsive.js`'s `phugoidWithThrust`, which has no call site
to pin its argument's meaning (**F-A17**); the ICAO Annex 14 code table (document not held); and
whether `etaHov` is intended as a figure of merit or a lumped efficiency (**U-01**) — the single
question whose answer would move a MEDIUM finding to HIGH or to PASS.

## 5. UNIT CONSISTENCY — PARTIALLY VERIFIED

**Arithmetic: PASS.** No conversion factor in the tree is wrong by more than **0.081 %**, and that
worst case is the sole exception (F-37); all others are ≤1.2e-4 %. No Raymer/FLOPS/GASP equation is
fed metres or kilograms anywhere — the imperial↔SI boundary is clean in every module. No
degree/radian error at any trigonometric call site. No display-unit value re-enters a calculation.

**Architecture: FAILED.** There is no single canonical internal unit system: the eVTOL engine and
drone are SI, the transport/turboprop/trainer/aircraft classes are **imperial internally**, and
display carries **two mutually unaware toggles** — `src/App.jsx` never references `useUnitSystem`
and emits a unit string (`"kts"`) that `src/lib/units.js` does not know. Defensible as a choice;
undocumented as an architecture.

**One unit defect is material: F-04.** `MU0 = 1.47e-5`, labelled "dynamic viscosity, Pa·s", is the
**kinematic** value (matching it to 0.64 %, and 17.8 % below the dynamic value), feeding a
dynamic-viscosity power law. Every Reynolds number in the tree is **21.7 % high** and Cf is
**2.9–3.1 % low**. The correct value sits in the same tree, under the same label, in two other files.

## 6. SIZING LOOP VERIFICATION — PARTIALLY VERIFIED

18 loops documented. **Every stopping test is on the residual, not the delta — PASS.** Convergence
is **independent of the initial guess** (the eVTOL seed driven 589.67 → 5944.13 kg returns the same
answer every time; every solver setting returns the same answer) — PASS. The lagged `*Prev`
variables are **measured converged out** on every path that reports convergence (0.00e+0 spread
across six layouts) — PASS. MTOW is **self-consistent at convergence** — PASS.

**FAILED on three counts:** convergence can be an artefact of a clamp in four places, each
demonstrated by materially different inputs giving bit-identical results (**F-12**); the transport's
state vector is `(gross, wsUsed)` and only `gross` is tested (**F-20**); and the Round-1 guard is
placed **after** the assignment it protects, so on a first-pass failure the published MTOW is the
seed — **142,042.75 kg for a five-seat air taxi, 12.5× the tool's own ceiling** (**F-01**). F-01 is
mitigated by an explicit, well-written non-convergence banner, which is why it is HIGH and not
CRITICAL.

## 7. MASS CLOSURE — VERIFIED

**Exact in every class.** eVTOL: 1588.99 + 728.08 + 455 = **2772.07** against MTOW **2772.06**
(0.01 kg, the rounding of the reported parts), and 0.00 kg on all six layouts. An **independent
route** (the inertia-tensor mass sum) closes to 0.1 kg with `unplaced: []`. Trainer 0.000000 lb;
transport 0.432 lb; bizjet 0.489 lb; turboprop < 0.5 lb; drone exact by construction.

**No double counting** — motor, battery, propeller, rotor support, payload-in-empty and every
structural fraction's reference mass were each specifically cleared with evidence, including by
reproducing the NASA Table 12 calibration and showing that MTOW is the *tighter* basis where the
code uses it. One defect: **F-08**, Raymer's fineness correction applied twice, so the weight path
sees a fuselage **24.9 % smaller** than the drag path (**62.8 %** on a stubby pod, wrecking the
spheroid branch written to protect exactly that case), worth **+1.35 % to +1.61 % of MTOW**.

## 8. ENERGY CLOSURE — VERIFIED

Segments sum to **164.849 kWh** against `Etot` **164.85**; the mission-only sum closes to
**−7.1e−15 kWh**. `E = P·t/3600` is dimensionally correct at **all 14 sites**; no Wh/J or kW/W
confusion anywhere. `Etot/PackkWh ≡ 1 − socMin` identically, so the SoC window and `etaBat` are
applied exactly once. **Reserve is never compounded** — a `Math.max` of the two NASA criteria, not
a sum, and exactly once per policy across four transport reserve policies. Independent closed-form
re-derivations of cruise and reserve energy agree to **0.02 %**.

## 9. POWER CONSISTENCY — FAILED

The sizing loop is internally coherent. **Six separate display and analysis paths disagree with
it**, by between 5 % and 32 %: the Weather tab (−10.82 %, lead-verified, under a comment claiming
"matches runSizing exactly"), the T/W trade sweep (−10.8 %), `ConvergenceTab` (+32.1 % in one place,
−18.0 % in another where T/W is applied twice), the displayed motor power (−22.4 %) and mass
(**51 % of the one inside MTOW**), the constraint diagram (−7.4 %), and `TW_cruise` on wingless
layouts (−5.3 %). Additionally **F-13**: `Phov` is a rotor *shaft* power consumed as battery/bus
power in five places, with no motor, inverter or bus efficiency anywhere in the hover chain — the
boundary question is **U-01**.

## 10. AERODYNAMIC VERIFICATION — PARTIALLY VERIFIED

`q`, `L`, `D`, `L/D`, Prandtl–Schlichting Cf (Raymer 12.27 transcribed exactly), the fuselage form
factor (Raymer 12.31 exactly), MAC and Ymac, Helmbold `CLa`, and `CDi = CL²/(πARe)` all **PASS**,
full span throughout — **no semi-span misuse found anywhere**. The nine CD0 terms are summed
identically in the loop, the report and `dragComp`.

**Two findings change conclusions.** **F-09**: landing-gear drag defaults to *fixed* (0.015) while
the comment beside it says retractable — **34.6 % of CD0tot**, and switching gives L/D +22.7 % and
**MTOW −11.58 %**, from a parameter the user cannot see. **F-10**: cruise CL and induced drag are
**constant by construction** — `CLcruise` 0.549481 and `CDi` 0.0129001 identical to six significant
figures across **MTOW 1601 → 11002 kg**, so the loop's induced-drag feedback carries no design
information. The module's header claims this defect was fixed; it was relocated.

Further: wing wetted area is gross not exposed; the wing/tail form factor cites the wrong Raymer
equation and drops its Mach/sweep bracket; tail drag is charged on the required not the built area
and a second, more careful tail drag is computed and discarded; booms are absent entirely; **three**
Oswald efficiencies and **four** CLmax conventions are live at once; and the eVTOL path has no
high-lift model and no modelled transition or lift sharing.

## 11. PROPULSION VERIFICATION — VERIFIED (physics) / FAILED (boundaries)

**Hover momentum theory is correct**, and this was checked hardest: two independent routes agree to
**2.22e-16**, per-rotor thrust is paired with per-rotor area, and the classic √N error — which would
inflate the default case by 3.464× — **is not present anywhere**. **No `P = T·V` in hover** exists
anywhere, including the mission profile and the SoC trace. Coaxial and twin interference, blade
loading, tip Mach, the vertical-climb power ratio, the `(T/W)^1.5` installed-power exponent, BEM,
autorotative index, and every fixed-wing SFC path all **PASS**.

Failures are at the boundaries, not the physics: **F-13** (shaft power as electrical), **F-P07**
(OEI power scaled linearly where momentum theory requires T^1.5 — the exact exponent error the
neighbouring module warns about in its own comment), **F-P04** (`vi_ind` +9.7 % from installed
thrust without download), **F-25** (a legacy reporting model).

## 12. MISSION VERIFICATION — PARTIALLY VERIFIED

eVTOL segment bookkeeping, energy sums, range budget (closes to 100.001 km) and reserve-once all
**PASS**. Transport segment fuel, reserve components and distances close exactly across four
policies.

**FAILED on method agreement:** three shipped fuel methods, all reporting `converged: true`, give a
**13.94 % MTOW spread** (24,223 lb) and a **39.64 % fuel spread**, with no statement of which is
authoritative. **F-03**: `reserveMin` is completely inert under the default method — 0 → 600 minutes
changes the design by 0.00 %. **F-21**: `flyMission` lets the aircraft burn through its own
structure, reporting `cruiseLD` and `cruiseCL` for an aircraft weighing 0.05 lb.

## 13. GEOMETRY VERIFICATION — PARTIALLY VERIFIED

**Lateral symmetry PASS everywhere** (0.000e+0 in every 2-D drawing; worst 9.9e-5 m in an
8,556-vertex mesh, a float artefact). **Local cross-section symmetry PASS** (Σy ≤ 1.6e-15, exact
mirrors at odd *and* even stringer counts). **Longitudinal upsweep PASS** on sign and closure —
crown above keel on all four classes. These three were kept strictly distinct, as the brief requires.
One vertical datum, uniform scale in 8 of 10 SVGs, and the V-n corner closing at exactly 2.5000 with
gust slopes in the exact 1 : 1 : 0.5 ratio. Gear stations, wheelbase, spar stations, `x_wing` and
the fuselage dimensions are **exact to 0**.

**FAILED on the wing.** **F-G01**: the general arrangement draws the wing at an unsourced `0.38·L`
convention under a comment saying a balance model is needed — while `balance.js` computes
`xWingRootLE` from Scholz (10.24) under the comment *"the root leading edge, which is what a drawing
needs"* — and the MAC bar, CG envelope and every %-MAC figure are drawn off the **computed** datum.
Lead-verified: transport **+2.766 m = 66.0 % of MAC**; **trainer −110.7 % of MAC, i.e. the MAC bar
lies entirely aft of the drawn trailing edge**; and the Balance tab and General Arrangement show the
same wing 2.766 m apart. Also **F-G05**: the drawn turboprop propeller clearance is **2.84×** the
clearance on which the 25.925(a) compliance verdict rests.

## 14. GRAPH VERIFICATION — FAILED

Most charts check out and several were independently recomputed. But: **F-G02**, the T/W trade chart
**never uses the variable it sweeps** — one distinct value (2016.8 kg) across all nine T/W points,
plotted under a caption asserting a `T/W^1.5` trend, **−27.25 %** below the converged MTOW.
**F-G03**, two `ConvergenceTab` tables contradict the same tab's own KPI by −26.65 % and −18.0 %.
**F-G06**, `WingAeroTab` plots a 2-D aerofoil polar on aircraft axes, with max L/D **158.34** and
`SR.LDact` **9.77** drawn on the same axis, and the series is **byte-identical** when CD0 moves
−5.9 %. Plus a legend mapping 7 colours over 9 slices where the largest slice is one that misses
out, ~13 reference lines that cannot render, and an axis label wrong for two of three series.

**Memoisation is clean** — the frozen series are frozen in the engine, not by stale caching.

## 15. BENCHMARK RESULTS — PARTIALLY VERIFIED

The suite does not select only flattering aircraft, and it reports errors rather than verdicts:
transport MTOW 173,724 lb against a published 174,200 (**−0.3 %**), OEW +5.2 % inside a declared
10 % band; fleet MAE ~9 %; NASA concept vehicles scored for the three battery-electric variants
only, with the exclusion reasoned. Frozen reference cases are in `AUDIT/data/reference-cases.json`,
**explicitly as change detection and not as an assertion of correctness** — F-04, F-08, F-09 and
F-10 are live in every one of them.

## 16. REGULATORY CHECKS — FAILED

This section carries the audit's only CRITICAL findings, and it is also where the repository's own
groundwork paid off: a **vendored primary corpus** made most citations checkable against the
document.

**F-R01 (CRITICAL):** the only safety-performance clause the eVTOL engine evaluates returns **PASS
for an undefined aircraft** — 968,252 % gradient at `MTOW_kg = 0`, 2.39e9 % at `vCruise = 0`, both
`pass: TRUE`, with no banner. **F-R02 (CRITICAL):** the declared 305 m / ISA-SL evaluation condition
is **never applied**, so the printed basis line is false for every run.

Also: rows that **cannot fail** (a quantity against its own floor; a ratio that is 1 by
construction — including on a statically unstable aircraft); a citation to a document that **does
not exist**, invisible to the citation gate by spelling, carried as `status:"sourced"` on a safety
margin; seat gates that **count crew as passengers** and so strip a valid design of its entire
regulatory table; four false CRITICAL non-compliances on wingless layouts, printing "SM = 0.0 % MAC"
for an aircraft with no MAC; a **percentage compliance score under a regulator's name** aggregating
verified rules, tool rules and tautologies; and a rounding path in which **`-0 >= 0` is `true`**, so
a negative OEI margin is badged PASS.

**The prose does not overreach** — the disclaimers are explicit, repeated and strong, and
`src/classes/aircraft/compliance.js` models the right shape exactly, with a three-state
PASS/FAIL/**NOT EVALUATED** vocabulary. The overreach is structural.

## 17. SOURCE QUALITY — VERIFIED

Genuinely high, and unusual. 467 outputs and 89 inputs classified into five strictly-defined
statuses; `validated` reserved for an output compared numerically against published data with the
error recorded (16 outputs). Primary sources vendored and cited to page and equation. Several
entries are candid in a way that is rare: `range` records that the model over-predicts Archer
Midnight by 27 % and leaves it visible; `priceTransientIntoMass` records an option **refuted by
validation** and ships it off; `nacelleWettedAreaM2` records that a NASA regression's coefficients
do not survive PDF extraction and refuses to guess, with the line **"A recovered unit is not a
source."**

Two edge defects: the ledger **silently drops** the one output whose status is `assumed` (466 of
467, bar reading 100 %) — and that output is a regulatory load factor its own note calls "an
APPLICANT PROPOSAL with no source" (**F-30**); and the citations gate cannot see a
non-recursive-root documentation directory, **including this `AUDIT/` tree** (**F-32**).

## 18. REMAINING ASSUMPTIONS — PARTIALLY VERIFIED

Fully catalogued in `ASSUMPTIONS.md`. The material ones not exposed to the user: the **fixed-gear
default** (11.58 % of MTOW, the largest single unstated assumption); `reservePctMission` 0.10 outside
its basis; `clMaxWing` 1.5; a resurrected flat `cRateDerate` 0.08; the 0.85 Oswald fallback; the
0.10 nacelle-area fraction; `miscCD0` 0.002; the 0.88 tail-AC "proxy" in five places; `etaH` 0.9 in
two; the shared unsourced tail-cone control points; the `0.38·L` drawn wing station; the inline pack
cell architecture; and the fabricated `0.3` range-sensitivity factor. Five assumptions' **stated
derivations do not produce the shipped value**, of which `etaSys = 0.80` is the most consequential —
it is the single largest efficiency in the model, uncited, and its own comment's arithmetic gives
0.865.

## 19. REMAINING UNCERTAINTIES — UNVERIFIED

Six recorded, with the reason each could not be closed: `etaHov`'s intended meaning (U-01, a
question for the code owner); the turboelectric referred-lapse convention (U-02, text not vendored);
the `PackInstalledkWh` +0.67 % gap (U-03, mechanism not traced); whether paint is implicitly in the
AFDD/GASP fits (U-04); whether drone SoC can overshoot 1 behind its clamp (U-05); and the V-tail
weight formula's true provenance (U-06, already on the project's own unverified list). The UI layer
under live interaction is a seventh, larger gap.

## 20. CRITICAL FINDINGS — 2

**F-R01**, **F-R02**. Both in the certification path, both lead-verified, both detailed in §16 and
`REGULATORY-AUDIT.md`.

## 21. HIGH FINDINGS — 29

F-01 to F-11 (runaway seed published as MTOW; trainer negative fuel with `converged:true`; inert
transport reserve; the viscosity defect and both nets' blindness to it; the report's
self-contradicting Reynolds equation and its two atmospheres; the doubled fuselage correction; the
fixed-gear default; constant-by-construction induced drag; the Weather tab's hover power);
F-G01 to F-G06 (the drawn wing station; the flat T/W chart; the contradicting convergence tables;
the invented cross-section; the 2.84× propeller clearance; the 2-D polar on aircraft axes);
F-R03 to F-R15 (superseded limits; tool rules under regulatory citations; a nonexistent document;
checks that cannot fail; false wingless non-compliances; the compliance percentage; the seat gate;
the 60.8 % MAC report inconsistency).

## 22. MEDIUM FINDINGS — 49

Enumerated in `FINDINGS.md` and the domain documents. The clusters: clamp-driven convergence; the
shaft-versus-bus power boundary; duplicated hover power, Oswald and CLmax; silently accepted
illegal inputs; the landing-field bisection that converges on a violated requirement; rounding
reused in regulatory decisions; unbounded runtime; and the two-entry-path divergence (F-19).

## 23. LOW FINDINGS — 36

Enumerated in `FINDINGS.md`. Includes the fabricated Breguet-labelled sensitivity, the headwind
computed with no aircraft heading, the provenance ledger's dropped status, the two-runner harness
asymmetry, the citations gate's blind directory, three Pa→psf values, `32.2` as imperial gravity
with the gate allowlisting it, and displayed precision up to 185,000× the stated band.

## 24. UNVERIFIED ITEMS — 6

§19.

## 25. TEST COVERAGE — PARTIALLY VERIFIED

116 harnesses; 111 run by `npm test`, 67 executed by the generated report, the full gate ~22 minutes.
The suite is generated not hand-written, records its commit, and refuses to describe a dirty tree.
**But seven of this audit's HIGH findings are structurally invisible to it** — not because the
harnesses are weak but because output-versus-reference scoring at ~9 % MAE cannot resolve a defect
that moves every output by a small common factor, which is precisely the argument
`validation/constants.mjs`'s own header makes. Nothing in the suite reaches the exported report, the
charts, or the drawings. One harness demonstrably **passes for the wrong reason** (F-05).

## 26. REGRESSION STATUS — VERIFIED (baseline established)

No regression was introduced: **no engineering code was modified.** Working tree contains only the
new `AUDIT/` tree. Ten frozen reference cases with full expected outputs and convergence metadata
are in `AUDIT/data/reference-cases.json`, and `AUDIT/reference/` holds a self-testing independent
implementation, so PASS B's changes will be measurable. Cross-class state contamination was tested
and is **clean** (0 differing leaves out of 6,993 numeric leaves compared).

## 27. ENGINEERING READINESS ASSESSMENT

Stated per the brief's terms, and only where criteria were actually established.

**What this system demonstrably does well.** Its physics core is sound where it matters most. Mass
closes exactly in every class, by two independent routes. Energy closes exactly. The ISA is exact.
Hover momentum theory is correct, and the single most common way to get it wrong is not present.
Every stopping test is on a residual; convergence is independent of the initial guess; no cross-class
state leaks; rounding does not enter the convergence core; no unit conversion is materially wrong;
and no double counting survives scrutiny in the mass ledger. The provenance system is better than
most production aerospace code, and `src/classes/drone/` is exemplary — it refuses bad input by
name and refuses to extrapolate measured data.

**What is not ready.** Two certification conclusions can be wrong in the unsafe direction (§16).
Input validation is absent in the eVTOL and trainer classes, so illegal inputs return converged,
plausible, unflagged numbers — in one case an illegal input yields a *more optimistic* aircraft. And
an unstated default the user cannot see moves MTOW by 11.6 %.

**The single most important structural finding.** The defect that recurs, across every domain, is
**the duplicated quantity**. The project knows this — gravity, `R_GAS`, solidity, blade count and
the fuselage keel were each caught this way before this audit. This audit adds twelve more, and the
pattern is unambiguous: **every duplicated quantity that is not gated has drifted, and every one
that is gated has not.** The corollary is that most of these findings live in the *display* of a
correct calculation, not in the calculation: the sizing loop uses the converged L/D, the right hover
power and the right wetted area, while the report, the trade charts, the Weather tab, the motor
readout and the general arrangement do not. For a tool whose stated thesis is traceability, that is
the most consequential pattern in this report — a reviewer reading the exported PDF is shown numbers
the engine did not use.

**What that implies for remediation.** Almost every finding has a correct implementation **elsewhere
in this same codebase**: `propDiam`'s named refusal, the transport's `stopReason`, the drone's input
guards, `"Not evaluated is not zero."`, `compliance.js`'s three-state vocabulary, `weightGroupsRaw`
shipped beside its rounded twin, and `constants.mjs`'s own "check the relation, not the digits". The
remediation does not require new engineering judgement so much as the consistent application of
standards this project has already set for itself and applied narrowly.

---

## PASS A stop, per Phase 35

| | count |
|---|---|
| formulas found | 147 |
| independently verified | 113 PASS, of which 20 by a separate implementation |
| unverified | 5 formulas, 6 open questions |
| with unit issues | 4 (F-04, F-36, F-37, plus the architectural finding) |
| with source issues | 17 (5 whose stated derivation fails, 12 stale or wrong citations) |
| with duplicate implementations | 12 concepts, **all 12 drifted** |
| sizing loops | 18 |
| convergence issues | 7 (4 clamp artefacts, 1 untested state variable, 1 unbounded seed, 1 undisclosed tolerance error) |
| geometry issues | 15 |
| graph issues | 9 |
| benchmark cases frozen | 10 |
| **CRITICAL findings** | **2** |
| HIGH findings | 29 |
| MEDIUM findings | 49 |
| LOW findings | 36 |
| unresolved questions | 6 |

**PASS A is complete and PASS B has not begun. No engineering code was modified. Awaiting
authorisation to begin remediation**, which the brief directs should start with CRITICAL, add tests,
re-run the full audit, and only then proceed to HIGH.

Recommended remediation order, with reasons:
1. **F-R01, F-R02** — CRITICAL, and both are small, local changes to one file.
2. **F-01** — DONE in PASS B as CHG-004, and **not** as prescribed here: moving the guard above
   the assignment is a measured no-op (it then reads the previous iterate and publishes the
   runaway one pass later). The guard must read the CANDIDATE, the bound must be two-sided, and
   the `vCruise = 0` row needs a flag rather than a bound because Round 1 converges there.
3. **F-04 + F-05** — fix the constant *and* the gate that cannot see it, together; a fix without the
   gate invites the same drift back.
4. **F-02, F-R18** — input validation in the eVTOL and trainer classes, copying the drone's pattern.
5. **F-09** — decide the gear default explicitly and expose it; it is worth 11.6 % of MTOW.
6. **F-08** — one line, but it needs a `structTechFactor` refit decision, which is a holder call.
7. **F-G01, F-G02** — the drawn wing station and the flat chart; both are cheap and both are visible
   to every user.
8. **F-03, F-10** — an inert control and an uninformative feedback path; both are modelling decisions
   rather than typos, so both need a holder call before code changes.
