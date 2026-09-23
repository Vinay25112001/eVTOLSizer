# Group-Level Agreement Conceals Component-Level Error in eVTOL Weight Prediction

### Evidence from a continuously validated open conceptual sizing tool

**Vinay Kumar Reddy Sirigireddy**, Wright State University, Dayton, Ohio, USA — sirigireddy.vinaykumarreddy@wright.edu

*Abstract submitted to the Aircraft Design technical committee, VFS Forum 83,
Phoenix, Arizona, 11–13 May 2027.*

> **Draft status.** Every number in this abstract is produced by the harnesses in
> the accompanying repository and reproduced in its generated validation report.
> None is quoted from memory or from a prior draft. Figures marked *[figure]* are
> to be generated from the same harness runs before submission.

---

## 1. Background and motivation

Conceptual sizing of electric VTOL aircraft rests on empirical weight models
fitted to a population — conventional helicopters and tiltrotors — that does not
contain the aircraft being sized. The standard practice for demonstrating that
such a tool works is to size a published reference vehicle and compare a handful
of top-level quantities: gross weight, empty weight, battery mass, installed
energy. Agreement at that level is then reported as validation.

This paper argues, with measurements, that **agreement at that level is weak
evidence, and can be actively misleading**, because the aggregate groups against
which it is scored are sums of component predictions whose errors cancel. A tool
can reproduce a published structures weight to within one percent while its
rotor-group prediction is wrong by nearly half, and nothing in the conventional
presentation would reveal it.

The evidence comes from an open, browser-based conceptual sizing tool for eVTOL
aircraft, built on NDARC/AFDD weight models, which sizes six configurations —
multicopter, side-by-side, lift+cruise, tiltrotor, and two hybrid layouts — and
is validated against the published weight statements of NASA's UAM concept
vehicles (NASA/TM-20210017971, Table 12) and against manufacturer figures for
commercial types.

## 2. The principal result

Three NASA all-electric concept vehicles are sized from their own published
parameters, with no per-vehicle tuning, and **ten groups** of each published
weight statement are scored — rather than the three or four usually reported.
39 published comparisons result, with a mean absolute error of 14.5%.

Those comparisons are not scored against a single self-chosen tolerance. Each
group is compared against **AFDD's own published error for that group on the
conventional rotorcraft the equations were regressed on** (NDARC Theory Manual,
Table 27-21 and §27-13): 5.3% for the parametric total, 6.1% for the structural
group, 8.6% for the rotor group, 10.9% for propulsion, 8.7% for flight
controls. Seven of the twenty-one groups that have such a reference are at or
better than the method achieves in its own population, and the mean
out-of-population degradation is **×2.1**. That number is the useful one: these
correlations transfer to eVTOLs far better than might be feared — **except in
one place.**

The finding is what happens to one vehicle when the reporting granularity
changes. For the NASA lift+cruise all-electric concept:

| group scored | published | predicted | error | AFDD's own in-population error |
|---|---|---|---|---|
| **structures (aggregate, as usually reported)** | 1170.3 kg | 866.9 kg | **−25.9%** | 6.1% |
| ↳ rotor group (a component of the above) | 430.0 kg | 229.4 kg | **−46.7%** | 8.6% |
| ↳ remaining structural groups (implied) | 740.3 kg | 637.5 kg | **−13.9%** | — |

**This row read −0.7% two revisions ago, and nothing in the structures model
has changed since.** The rotor group has sat at −46.7% throughout. What moved,
twice, were groups the structures total does not even contain:

| revision | what was corrected | structures total | implied remainder |
|---|---|---|---|
| as first measured | — | **−0.7%** | +25.9% |
| propulsion margin removed | installed motor rating set by a flat 1.30 thrust margin (1.482 in power) against the 1.45 / 1.10 / 1.00 NASA publish per vehicle | **−9.8%** | +11.6% |
| boom load factor corrected | booms sized at an ultimate 5.25 (1.5 × 3.5 g) against MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2200(f), which requires the limit manoeuvring load factors to "be defined based on the maximum capability of the aircraft" with "the positive load factor … not less than 2.0" — 3.00 for rotors that produce 1.3 g. The paragraph is in the *Means of Compliance*; VTOL.2200 of the Special Condition itself (SC-VTOL-02 Issue 2, 10 June 2024) runs only to (e) | −19.9% | −4.4% |
| fuselage audit | one wetted area where the weight and drag models had used two (37.3 vs 26.1 m²); NASA's own fuselage factors in NDARC §29-4's structure, χ_basic 0.76 and an additive crashworthiness term χ_cw 0.90 · f_cw, with f_cw 15% on the quadrotor and 6% otherwise; and six published drag areas scored for the first time | **−25.8%** | **−13.7%** |

Each correction removed a load the aircraft cannot generate. Each made the
headline worse. Together they show that the original −0.7% — a figure an order
of magnitude inside AFDD's own 6.1% in-population error, and by any
conventional reading a validation success — was manufactured by two unrelated
over-weight errors in groups nobody was scoring.

**What is left is not yet a clean diagnosis, and the paper says so.** After
the propulsion and boom corrections the remaining structural groups sat at
−4.4%, inside AFDD's own error, and this section briefly read that the
lift+cruise had one bad group. The fuselage audit that followed — one wetted
area in place of two, NASA's own fuselage factors, and drag areas scored
against the published values — moved the remainder to −13.7%. The rotor group
is still the largest single error in the benchmark at −46.7%, but the
remaining structures are now also under-predicted, and the fuselage drag rows
that were scored for the first time show the Raymer buildup implying a drag
coefficient on wetted area of 0.0036–0.0042 against the 0.0045 NASA assume.
Each correction has made the aggregate worse and the picture more honest;
none of them has yet made it complete.

**The general claim.** An aggregate can sit inside the source method's
in-population accuracy while a component beneath it is wrong by half, and it
can do so because of errors in groups the aggregate does not contain. Nothing
in a conventionally reported weight statement would reveal this; only scoring
every group, and only re-scoring after each unrelated correction, did. The
authors did not go looking for it — it appeared twice, from two independent
fixes, and is reported because the alternative was to keep a better-looking
number that was better for the wrong reason.

### 2.1 The same concealment in a different place: a constraint that never binds

The claim above is about aggregation across *components*. The same mechanism
operates across *branches*, and a second measurement in this tool shows it.

Battery mass is sized as the heavier of two requirements — energy for the
mission, and power to hover: `W_battery = max(W_E, W_P)`. Reporting that a tool
applies "dual energy and power constraints" says nothing about which of them
ever governs. Measured across all six configurations at the reference mission,
**energy binds on every one**, with W_P/W_E between 0.236 and 0.793. The `max`
never selects W_P, so no weight difference at that mission is attributable to
the power constraint, however prominently the dual formulation is described.

The constraint is not inert everywhere — but locating where it governs takes two
mission variables, not one:

| configuration | W_P/W_E at 161 km | crossover range | W_P/W_E at 10 km |
|---|---|---|---|
| lift+cruise | 0.748 | 114.6 km | 1.486 |
| hybrid (tilt+lift) | 0.793 | 122.3 km | 1.440 |
| hybrid pusher | 0.729 | 110.5 km | 1.324 |
| tiltrotor | 0.761 | 114.3 km | 1.111 |
| side-by-side | 0.329 | none in 2–161 km | 0.756 |
| multicopter | 0.236 | none in 2–161 km | 0.548 |

Crossovers are located by bisection to 0.5 km. A coarse sweep over a fixed list
of ranges returned 90–120 km for these — the lower bracket of each containing
interval rather than the crossing — and that error survived into a circulated
draft before bisection removed it.

The second variable is the reserve, and it changes the answer qualitatively. A
fixed 20-minute reserve is a large constant floor under mission energy: as range
falls, E_total does not fall towards zero but towards the reserve. At a 10 km
mission the two rotor-borne layouts are energy-governed at a 20-minute reserve
(0.548 and 0.756) and **power-governed at five minutes** (1.061 and 1.437). So
"this configuration is never power-limited" is a statement about the assumed
reserve, not about the configuration — and it is true or false depending on a
parameter that is often not reported at all.

This is the paper's general claim in a second setting. An aggregate can conceal a
component; a `max` can conceal a branch that never fires; and in both cases the
conventional reporting granularity — a group total, a named formulation — does
the concealing. The remedy is the same: score the thing beneath, and report which
branch bound and under what assumption.

*[figure: W_P/W_E against range for six configurations, with the unity line and
the reserve sensitivity as an inset]*

**This is not an artefact of the sizing loop.** The same rotor model, evaluated
alone at the published rotor radius, tip speed, blade count and design thrust,
with no sizing iteration around it, predicts the same −46.7%. Loop-level and
component-level agree to better than 0.1 percentage points, which establishes
that the error belongs to the published weight equation operating outside its
fitting population, not to the tool's convergence. Across all eight NASA concept
variants the same rotor model scores a mean absolute error of 25.1%, and the best
model found in a systematic sweep of blade counts and flap frequencies still
scores 24.7% — so this is a property of the state of the art in rotor-group
weight prediction for eVTOL rotors, not a defect peculiar to one implementation.

*[figure: per-group error, three vehicles, ten groups, with the aggregate
structures bar overlaid on its components — the visual statement of the paper]*

## 3. How the result was made findable

The finding above was invisible in this same tool until the rotor group was
scored separately, and it is worth stating why it became visible, because the
mechanism generalises.

**Component-level testing separated from loop-level testing.** A harness
evaluates each weight model alone, at published inputs, with no sizing loop
around it. This is the only construction that can distinguish a bad model from a
bad convergence, and it is what allowed the −46.7% to be attributed to the
equation rather than to the tool.

**Machine-readable provenance on every output.** All 450 registered engine
outputs carry a status — validated, sourced, calibrated, derived, or assumed —
with its citation, and continuous integration fails if any output is emitted
without one. `validated` has a single meaning: the value has been numerically
compared to a published figure and the error recorded. Sixteen outputs meet that
bar. Publishing that number honestly, rather than the more flattering count of
outputs that are *traceable*, is what motivated scoring more groups in the first
place.

**A validation report generated from the harnesses, not written.** The accuracy
figures quoted in this abstract are emitted by a program that runs all eleven
verification harnesses, captures what each printed, and stamps the source-control
commit into the document. Continuous integration regenerates it and fails the
build if the committed report no longer matches what the code produces. A
published accuracy claim in this project therefore cannot drift away from the
code that is supposed to produce it — the failure mode in which a table typed
once remains in a paper while the software moves on.

The verification suite comprises eleven gated harnesses: unresolved-identifier
detection, engine identities that must hold by definition, a 277-case golden
master spanning all six configurations at both the baseline rotor count and
each layout's own, per-model component tests, database
consistency, analysis-layer separation, geometry and export gates including
structural connectivity and rotor-overlap checks, replication of published NASA
OpenVSP geometry, and the two accuracy benchmarks.

## 4. Credibility assessed against NASA-STD-7009B, including the zeros

The tool is assessed against **NASA-STD-7009B, *Standard for Models and
Simulations***, whose governing position is that a model is not required to reach
any particular level, "merely that the levels be determined and reported." Eleven
factors are scored 0–4 across the capability and results assessments. Consistent
with the standard's statement that the factors are nearly orthogonal and must not
be combined, **no overall credibility score is formed.**

Two results are worth reporting to this committee because they are the kind
usually omitted:

**Both technical-review factors score 0, "insufficient evidence."** No part of
the work has been reviewed by anyone other than its author. Level 1 requires a
favorable *informal internal* peer review, which self-review is not. This
submission is the first step in changing that, and the assessment says so.

**The validation factor scores 2, and 2 is a ceiling set by the available
evidence rather than by the software.** Level 3 requires comparison against a
Real World System — an aircraft that was built, flown and weighed. The NASA
concept-vehicle weight statements this tool is validated against are themselves
NDARC output; manufacturer figures are brochure claims rather than certified
weight statements. **Agreement with the NASA vehicles demonstrates that this tool
reproduces the reference method. It does not demonstrate agreement with an
aircraft, and no further work on the code can make it do so.** The distinction is
stated before any result is presented, because a reader who conflates the two
will over-trust every number that follows — including the ones that agree.

This bears directly on the principal result. If the reference weight statements
are model output, then a component-level disagreement of −46.7% is a disagreement
between two implementations of related empirical methods, and the question of
which is closer to a real rotor is open. That is a stronger reason to report
component granularity, not a weaker one.

## 5. Expected key conclusions

1. **Weight-statement validation should be reported at the granularity at which
   the models operate.** Aggregate-group agreement is a weaker claim than it
   appears, and the paper will quantify how much weaker across all eight NASA
   concept variants rather than the three sized here.
2. **A stated formulation is not evidence that the formulation acts.** A dual
   energy/power battery constraint whose power branch is never observed to be
   selected has not been shown to do anything, and a weight difference credited
   to it is caused by something else. Which branch binds, and under which
   mission and reserve assumptions, is a reportable result rather than a
   modelling detail.
3. **Rotor-group weight prediction is the dominant open problem for lift+cruise
   eVTOL sizing**, at 25.1% mean absolute error across the concept-vehicle set
   for the best available published formulation. This is a call for a better
   correlation, supported by measurement of how the existing ones fail and on
   which configurations.
4. **The errors are configuration-dependent in a structured way**, not random:
   the same model that misses lift+cruise rotors by −46.7% is within ×1.7 of
   AFDD's own in-population error on the quadrotor (−14.5% against 8.6%). The
   paper will characterise the dependence.
5. **A group that agrees for the wrong reason is worse than one that
   disagrees.** Decomposing group error into *equation error at the published
   rotor* and *sizing divergence* found that this tool's quadrotor rotor group
   had been scoring +0.1% — apparently its best result — only because AFDD00's
   tilting-rotor factor of 1.1794 was being applied to a quadrotor, whose
   rotors do not tilt. The factor was reached through a variable that meant
   "does not stop in cruise". Removing it moved that group to −14.5%, its
   honest value, and *improved* the benchmark mean from 9.4% to 8.5%. A flat
   tolerance cannot find this class of defect, because the defective number
   passes it.
6. **Continuous, machine-generated validation reporting is practical for a small
   tool** and removes an entire class of published-accuracy drift.
7. **A conceptual tool should claim the differences it can defend, not the
   magnitudes it cannot.** The same principle that makes the weight result
   reportable — anchor the absolutes to published data, then argue about the
   structure — applies wherever no anchor exists at all, and the paper will
   state it as a method rather than leave it implicit. See §6.

## 6. Where no anchor exists: claim the ordering, not the number

The weight results above work because an anchor exists: NASA publishes the
weight statements, so absolute error is measurable and a claim about structure
(aggregate versus component) can be made on top of it. **Much of conceptual
eVTOL design has no such anchor**, and the paper will argue that this changes
what may be claimed rather than whether work may be done.

The case in point is flight dynamics, which the tool also computes. A survey of
857 eVTOL-relevant papers found **zero** publishing modal data, damping ratios
or eigenvalues, and exactly one publishing moments of inertia — for a subscale
model. There is nothing to compare an absolute value against.

That this is a property of the problem and not of effort is best shown by
someone else's result. DiMaggio, Simmons, Geuther, Hartfield and Ahuja
(SciTech 2025) ran a mid-fidelity surface-vorticity solver against NASA LA-8
wind-tunnel data and reported that *"mid-transition results were not as close
in magnitude, but the trends exhibited reasonable agreement"*, concluding that
**if a true data point is known, the prediction can be offset against it and
the slopes used**. Prediction gives slopes; measurement gives the offset. A
tool with no offset available should report slopes.

So the tool reports **rankings between configurations**, and reports whether
each ranking survives the assumed coefficients moving by 50%. All five
handling metrics examined are robust in that sense, with spreads of 117–1679% —
these are not marginal differences. Two results follow that no absolute value
was needed to obtain:

- a **side-by-side layout has almost no rotor-derived pitch damping**
  (M_q = −0.42 against L_p = −5.39), because two rotors abreast have no
  fore-aft separation. It falls out of the geometry; nothing was assumed.
- the damping and agility rankings are **strongly inverted** across the six
  layouts (Spearman ρ = −0.94), which is the stability-versus-manoeuvrability
  trade stated in the rotorcraft literature, recovered rather than imposed.

**A ranking that flips under a plausible perturbation was never a finding; it
was an artefact of a guess.** Testing for that is cheap, and it converts an
unvalidatable model into a defensible one without pretending the underlying
numbers are known.

## 7. Completion status

The Call for Papers weighs completion status, so it is stated precisely.

**Complete and reproducible now:** the sizing engine across six configurations;
the seventeen-harness verification suite, all gated in continuous integration; the
39 published comparisons reported in §2; component-level testing of every
weight model against all eight NASA concept variants; provenance registration of
all 450 outputs; the generated validation report with its staleness gate; and the
NASA-STD-7009B assessment; and the analysis layers of §6, including an
inertia tensor built from the drawn geometry, hover attitude dynamics after
Malpica et al., and the robustness testing that decides which comparisons may
be reported.

**To be completed before the final paper:** extension of the loop-level
comparison from three concept vehicles to all eight, including the tilt-wing and
turboelectric variants; the figures noted above; a quantified statement of how
much aggregate-level scoring flatters each vehicle, which is the paper's headline
number and currently exists for one vehicle only; and independent review, which
this submission is intended to begin.

**Availability.** The tool, all harnesses, the research notes underlying every
method choice, and the generated validation report are open and will be cited by
permanent link in the final paper, so that every number here can be re-derived by
a reader rather than taken on trust.

## References

1. NASA/TM-20210017971, *Concept Vehicles for VTOL Air Taxi Operations*, Table 12
   (published weight statements for eight UAM concept variants).
2. Johnson, W., and Silva, C., "NASA concept vehicles and the engineering of
   advanced air mobility aircraft," *The Aeronautical Journal*, 2022.
3. Johnson, W., *NDARC — NASA Design and Analysis of Rotorcraft*, NASA/TP-2015-218751.
4. AFDD weight model equations, §29-2 (rotor group), §29-6, §29-7.4, §29-8.
5. NASA-STD-7009B, *Standard for Models and Simulations*, w/Change 1, 5 March 2024.
6. Khurana, M., Russell, C., and Scott, R., *Uncertainty Quantification of a
   Rotorcraft Conceptual Sizing Toolsuite*, NASA Ames / US Army ADD.
7. Malpica, C., Suh, P., and Silva, C., "Flight Dynamics Conceptual Design
   Exploration of Multirotor eVTOL," VFS Forum 80, Montréal, 2024.
8. DiMaggio, G. A., Simmons, B. M., Geuther, S. C., Hartfield, R. J., and
   Ahuja, V., "Transition Aero-Propulsive Analysis of a Tilt-Wing eVTOL
   Aircraft Using a Surface-Vorticity Solver," AIAA SciTech, 2025.
9. Simmons, B. M., *Advances in Aero-Propulsive Modeling for Fixed-Wing and
   eVTOL Aircraft Using Experimental Data*, PhD dissertation, Virginia Tech, 2023.
10. DOT/FAA/TC-23/59, *Handling Qualities Test Guide for Powered Lift VTOL
    Capable Aircraft with Indirect Flight Controls*, March 2024.
