# BENCHMARKS (Phase 13 / Phase 24)

Commit `3a7a5a4`. What the tool already validates against, what that validation does and does not
establish, and the frozen reference cases.

## Existing benchmark suite

The repository ships a benchmark set and does **not** select only flattering aircraft. Verified
present: NASA UAM concept vehicles (`validation/nasa-configs.mjs`, `nasa-vehicles.js`) scoring
Quad-E, SbS-E and L+C-E only — deliberately excluding the turboelectric tiltwing and hybrid
side-by-side, because they are not battery-electric; a VoloCity check
(`validation/volocity.mjs`); the 737-800 class (`transport/validation-cases.js`); an ATR-72 class
turboprop; a business jet; a C172-class trainer; and a drone truthset with measured motor data
(`src/data/drone-motor-truthset.js`).

**Distinguishing the kinds of validation, as Phase 13 requires:**

| kind | what the repo has |
|---|---|
| physical validation | mass and energy closure (exact); momentum theory (verified three ways); ISA (exact to 0.00 %) |
| trend validation | `validation/sensitivity.mjs`; the monotonicity results in this audit |
| order-of-magnitude | the NASA concept-vehicle comparisons |
| empirical correlation | AFDD/FLOPS/GASP weight regressions, each with its published fit set and mean error recorded in `provenance.js` |
| conceptual sizing comparison | the fleet MAE (~9 %) reported in `VALIDATION.md` |

The distinction is drawn honestly in the code: `provenance.js` reserves `validated` for outputs
**compared numerically against published data with the error recorded**, and the repo's own
`VALIDATION.md` states the headline MAE rather than a pass/fail.

## What the existing benchmarks cannot establish

This is the audit's substantive point about the suite, and it is the repository's own argument,
extended:

`validation/constants.mjs`'s header states it plainly — *"Every harness here scores the engine's
OUTPUT against a reference. A constant that is wrong by 0.035 % moves every output by 0.035 %,
which is a hundred times below the tolerance of the loosest comparison in this repository and two
hundred times below the tool's own ~9 % mean absolute error. Nothing that grades a number against
a published number can resolve it."*

That argument applies directly to this audit's findings:

| finding | size | detectable by output-vs-reference scoring at ~9 % MAE? |
|---|---|---|
| F-04 viscosity | Cf -3 %, CD0 -1.5 % | **No** |
| F-08 fuselage area squared | MTOW +1.35 to +1.61 % | **No** |
| F-09 fixed-gear default | MTOW -11.58 % | **Marginally** — and it would look like a *better* fit, because the tool over-predicts |
| F-10 CDi constant | 0 % at any single point | **No** — it is invisible at a point and only shows in a sweep |
| F-06/F-07 report atmosphere | 5-18 % | **No** — nothing scores the report |
| F-G01 wing station | 66 % of MAC | **No** — nothing compares the drawn station to the computed one |
| F-G02 flat T/W chart | -27 % | **No** — nothing scores a chart series |

**Seven of the audit's HIGH findings are structurally invisible to the existing suite**, not
because the suite is weak but because it is the wrong instrument for this class of defect. The
instruments that *would* catch them are the ones the repo has already invented and applied
narrowly: a one-value-per-constant gate (currently 2 constants), a relation check ("check the
relation, not the digits"), and a drawn-vs-computed comparison (currently none).

## Frozen reference cases (Phase 24)

Machine-readable versions are in `AUDIT/data/reference-cases.json`. **These freeze the CURRENT
behaviour at `3a7a5a4` as a change-detection baseline; they are explicitly NOT a statement that
the values are correct** — F-04, F-08, F-09 and F-10 are all live in them. Phase 24's own warning
applies: do not freeze incorrect values as if they were right. The purpose here is to make PASS B's
changes measurable.

| case | class | MTOW | OEW | payload | energy/fuel | key power | L/D | wing area |
|---|---|---|---|---|---|---|---|---|
| CASE-EVTOL-001 | evtol, hybrid, defaults | 2772.06 kg | 1588.99 kg | 455 kg | 164.85 kWh (pack 203.519) | Phov 596.81 kW | 9.77 | 19.83 m^2 |
| CASE-EVTOL-002 | evtol, retractable gear | 2450.99 kg | — | 455 kg | — | — | 11.99 | — |
| CASE-TRAINER-001 | trainer, defaults | 2605.42 lb | 1540.05 lb | 800 lb | 265.37 lb usable | — | — | — |
| CASE-TRANSPORT-001 | transport, defaults | 173,724.41 lb | 96,083 lb | 36,477 lb | 41,164.34 lb | — | 18.175 | 1407.09 ft^2 |
| CASE-BIZJET-001 | bizjet, defaults | 27,664 lb | 19,221 lb | 800 lb | 7,643 lb | — | — | — |
| CASE-TURBOPROP-001 | turboprop, defaults | 55,990 lb | 34,522 lb | 14,242 lb | 7,226 lb | — | — | — |
| CASE-DRONE-001 | drone, defaults | 4.0910 kg | — | declared | — | — | — | — |

Convergence metadata for the two loops traced in detail: eVTOL 33-50 passes to a residual below
2.09e-5 kg; transport 38 passes to 0.4317 lb against a 0.5 lb tolerance, observed contraction
0.744/iteration.

## Recommended additions for PASS B

1. **A drawn-vs-computed gate.** Assert that every drawn station equals the computed station it
   represents, per class. This single check would have caught F-G01 and F-G05.
2. **Extend `validation/constants.mjs` from 2 constants to all 8**, and add a **relation** check
   for viscosity via Sutherland at T0 — the instrument the file already uses for `R_GAS`.
3. **A sweep-based information check**: assert that `CDi` *varies* across a payload sweep. F-10 is
   invisible at a point and obvious in a sweep.
4. **Score the exported report**, not just the engine. F-06 and F-07 live entirely in an artifact
   no harness reads.
5. **Assert that every chart series responds to its own swept variable.** F-G02 is a one-line test.
