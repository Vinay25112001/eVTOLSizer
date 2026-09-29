# REGULATORY / SAFETY AUDIT (Phase 22)

Commit `3a7a5a4`. **A vendored primary corpus exists and was used.** `validation/citations.mjs:44`
points at `../eVTOL_Sizing_Research/extracted`, which holds 56 files including
`SC-VTOL-02_issue2.txt`, MOC-1/2/4 and `AC-21.17-4_2025-07-18.txt`, plus 210 files under
`classes/transport/extracted/` including verbatim eCFR text for ~100 Part 25 sections. Most
citations are therefore **verifiable against the document**, and UNVERIFIED is used only where the
document genuinely is not held (CS-25, CS-27, CS-36, ICAO Annex 14/16, RTCA DO-311A, Part 27,
Part 36, the powered-lift SFAR, 91.151).

This is worth stating plainly: **the repository made its own regulatory claims auditable**, which
is unusual and is the reason this section can reach verdicts rather than shrug.

---

## CRITICAL

### F-R01 — The only safety-performance certification clause the eVTOL engine evaluates returns PASS for an undefined aircraft — CRITICAL — **VERIFIED BY THE LEAD**

`src/engine/certification-climb.js:110-111, 158-159`:
```js
const W = Math.max(1, (g.MTOW_kg ?? 0) * (g.g0 ?? 9.80665));
const V = Math.max(1e-6, p.vCruise ?? 0);
...
const gradient = (pAvailKW * 1000 * eta) / (W * V) - 1 / LD;
pass: gradient >= CLIMB_GRADIENT_MIN
```

The guards convert a missing or zero mass into a **1 N** aircraft and a missing or zero cruise
speed into a **1 µm/s** aircraft, and then certify it. Lead-measured
(`nUnits: 12`, `pMotInstalledKW: 73.72`, `LD: 9.77`, `etaSys: 0.8`, Category Enhanced):

| input | `gradientPct` | required | `pass` |
|---|---|---|---|
| nominal | 25.383 | 2.5 | TRUE (correct) |
| `MTOW_kg = 0` | **968,252.451** | 2.5 | **TRUE** |
| `MTOW_kg` undefined | **968,252.451** | 2.5 | **TRUE** |
| `vCruise = 0` | **2,386,407,993.713** | 2.5 | **TRUE** |
| `vCruise` undefined | **2,386,407,993.713** | 2.5 | **TRUE** |
| both zero | **6.49e13** | 2.5 | **TRUE** |

*(The delegated auditor reported 1,182,079.317 for the `MTOW_kg = 0` case; the difference from my
968,252.451 is input shape — its `nUnits`/`pMotInstalledKW` differed from mine. The mechanism,
the sign and the verdict are identical, and both reproduce `pass: true`.)*

**Why this is the audit's one CRITICAL finding.** It changes an engineering *conclusion*, not a
number: a degenerate aircraft receives a green MOC VTOL.2120 finding on the single
safety-performance clause the eVTOL path checks. Unlike **F-01** (the runaway MTOW seed), there is
**no banner** — the row reports a clean PASS. And a zero or missing mass is genuinely reachable:
F-01, F-12, F-22 and F-R14 all document upstream paths that yield one.

The fix shape already exists in the same repository, three files away:
`src/classes/aircraft/fuselage-pressure-shell.js:164` refuses with **"Not evaluated is not zero."**

### F-R02 — The declared evaluation condition is never applied — CRITICAL — **VERIFIED BY THE LEAD**

`CLIMB_GRADIENT_ALT_M = 305` is declared at `:97` and appears exactly **twice** in the file: at
its declaration and inside the printed `basis` string at `:173`
(*"…at 305 m above the take-off surface…"*). It is **never used in the computation**.
`g.rhoAtCondition`, documented as an input at `:105`, appears **once** — in the JSDoc comment —
and is never read. Lead-verified by occurrence count and by reading the whole computation, which
is `gradient = (pAvailKW·1000·eta)/(W·V) − 1/LD` with no density and no altitude term.

MOC VTOL.2120(b) additionally requires Category Basic **at ISA SL**, which is not enforced either.
The gradient is evaluated at whatever converged cruise condition the design happens to have, so
**the stated basis line is false for every run**. For a design cruising at 2,000 m the density
ratio is 0.822, so the L/D and hence the `1/LD` term differ from the 305 m condition the output
claims.

This is the same class as F-06 and F-07 — a stated basis that the arithmetic does not implement —
but in a certification context, which is why it is CRITICAL rather than HIGH.

---

## HIGH

| id | finding | status |
|---|---|---|
| **F-R03** | `src/tabs/CertificationTab.jsx:339-356` — two rows at severity `critical` check **superseded or nonexistent** EASA limits, while `regdb.js:60,128` displays *"Thresholds read from the documents: 2026-09-15"*. The certification tab's rows were never brought into line with `regdb.js`. | AGENT-REPORTED |
| **F-R04** | Seven thresholds that the app's own `regdb.js` **declares to be tool rules** are presented under regulatory citations in `CertificationTab.jsx`, **four of them at severity `critical`**. | AGENT-REPORTED |
| **F-R05** | `src/engine.js:3556-3557` and `src/lib/provenance.js:187` carry `CS-VTOL AMC 27.65 / FAA AC 21.17-4` for the OEI margin, and provenance records `oeiSurvivable` as `status:"sourced"`. **There is no document called "CS-VTOL"**; AMC 27.65 belongs to CS-27, which is not held; and `regdb.js:86-92` already states that no SC-VTOL paragraph gives an OEI thrust margin. `validation/citations.mjs:105-113` matches only `VTOL.NNNN` and `PL.NNNN`, so this spelling is **never checked** — the identical hole the gate's own comment documents for the `§2540` spelling. **A `sourced` provenance tag on an unsourced safety margin.** | AGENT-REPORTED |
| **F-R06** | `CertificationTab.jsx:117, 379` — FAA-S1 and EASA-S1 (`n_pos >= 2.0`, severity **critical**) **cannot fail**, because `loadcases.js:129,141` floor `nLimit` at 2.0. Measured: wingless layouts return exactly 2.0, winged 3.5. The check tests a quantity against its own floor. The file's comments congratulate themselves on removing "a constant against a constant"; the replacement is a floored quantity against its floor. | AGENT-REPORTED |
| **F-R07** | `CertificationTab.jsx:539-559` — EASA-T1/T2 (V-tail pitch and yaw authority ≥ 100 %, severity **critical**) **cannot fail**: measured `pitch_ratio` and `yaw_ratio` = **exactly 1** across ten parameter variations including a 4.5× change in tail volume coefficient, and including `autoPositionWing:false`, which yields **`SM_vt = −0.2266`, a statically unstable aeroplane**. The tail is sized *to* the requirement, so the ratio is 1 by construction. **Two CRITICAL certification rows report 100 % PASS on an unstable aircraft.** | AGENT-REPORTED |
| **F-R08** | `src/classes/aircraft/flight-envelope.js:303,305` — two 25.335 checks that cannot fail, plus a governing-case output that is a constant. | AGENT-REPORTED |
| **F-R09** | `src/panels/RegTrackerPanel.jsx:22-28,352,371-383` — the OEI thrust-margin row is a pure function of two inputs, is **identical for all six layouts**, and shows PASS where the engine itself declares the test inapplicable. | AGENT-REPORTED |
| **F-R10** | `RegTrackerPanel.jsx:352` — a group-level PASS badge headed **"EASA SC-VTOL"** with `ALL PASS`/`✗ N FAIL` aggregates rows of which **5 of 7 are `basis:"tool"`**, in a panel titled *"**Regulatory** Compliance Tracker"*. The per-row "tool rule" label is correct and good; the aggregate badge and the title erase it. Also `regdb.js:132-141`'s MCTOM ≤ 5,700 kg row carries a PASS/FAIL badge but is **structurally incapable of showing FAIL**, because `applies=false` hides the whole table above 5,700 kg — while the panel's own comment claims the mass limit "is no longer rendered as though it were" a compliance row. | AGENT-REPORTED |
| **F-R11** | `CertificationTab.jsx:53,298,440,463,468,542,553` — wingless layouts get **four false CRITICAL non-compliances** from `null`-vs-number comparisons. Measured on `multicopter`/`sideBySide`: `SM_vt`, `MAC`, `fusSpanRatio`, `pitch_ratio`, `yaw_ratio` are all `null` (correctly, via `sanitiseWingless`), and the tab then computes `(null*100).toFixed(1)` and **prints "SM = 0.0 % MAC" for an aircraft that has no MAC**, with `null >= 0.05 → false` failing FAA-P3, EASA-P1, EASA-T1, EASA-T2 (all critical) and EASA-P3. `cgRange` evaluates to `Infinity`. **The engine already ships the mechanism this needs** — `engine.js:3540-3545` `WING_ONLY_CHECKS`/`checksNA` with `notApplicable:"no wing — criterion is wing-borne"` — and the tab does not use it. | AGENT-REPORTED |
| **F-R12** | `CertificationTab.jsx:576-618,699-716` — a **percentage "compliance score" per regulator**, in a conic-gradient dial reading `"{pct}%"` beside the heading "FAA AC 21.17-4", over a rule set of incommensurable status: of 15 FAA rows, ≥5 are tool rules or invented thresholds and ≥2 cannot fail. **The hedges are present and strong** (*"Results are conceptual-phase guidance only"*; *"not a substitute for formal compliance documentation … requires full qualification testing, G-1/G-2 issue papers, and regulatory authority approval"*). The overreach is not the prose — it is that a **single number labelled with a regulator's name** aggregates verified rules, unsourced tool rules and tautologies. `src/classes/aircraft/compliance.js:210-227` shows the right shape: three states including **NOT EVALUATED**, and the sentence *"A PASS means a conceptual sizing model … puts the quantity on the compliant side of a number."* | AGENT-REPORTED |
| **F-R13** | `src/lib/regdb.js:397,444` — the VTOL.2005(a) and PL.2000(a) seat gates **count the wrong people**. Both paragraphs limit the "**passenger** seating configuration" (9 / 6, both verified verbatim against the held corpus); the gate note says *"Occupants including crew, as entered."* Measured: `nSeats = 10` (9 passengers + 1 pilot) → the gate is OUT, `applies = false`, and the panel renders *"The 10 rules below are withdrawn, not failed"* plus "SC-VTOL-02 ISSUE 2 DOES NOT APPLY TO THIS DESIGN". **A design squarely inside the small category loses its entire regulatory table.** Same off-by-crew on the FAA's 6. | AGENT-REPORTED |
| **F-R15** | `src/export/report.js:282,289,437,444,447,449` — the exported report is internally inconsistent by **60.8 % MAC**: it re-derives the wing aerodynamic centre and empty CG from a hard-coded `0.2589` wing station and raw `p.fusLen`, while the engine uses the solved `wingLEfrac` and scaled `fusLenEff`. Measured: report `x_AC,wing = 2.989 m` vs engine **3.807 m**; `x_CG,empty = 3.377` vs **3.663**. **Recomputing SM from the report's own printed table gives 27.5 % against the 15.0 % printed two lines above.** Same family as F-G01. | AGENT-REPORTED |

## MEDIUM / LOW

Recorded compactly; each carries file:line and a measurement in the source report.

| id | finding |
|---|---|
| F-R14 | `sanitiseWingless` **masks genuine numerical failures — confirmed measurement**. It converts non-finite numbers to `null` for wingless layouts, so a real NaN (e.g. `sedCell:0`) becomes an absent quantity rather than a visible failure. The winged path correctly keeps NaN visible, which is what makes the wingless path a masking risk rather than a design choice. |
| F-R16 | `engine.js:3236` — **a converged design is destroyed by a display string on a plausible input**: `payload = 0` (a ferry flight) throws `TypeError: Cannot read properties of null (reading 'toFixed')` from inside a *check's* `val` text, **after the sizing loop has converged**. A display concern must not be able to abort a calculation. |
| F-R17 | `loadcases.js:266,281,229-231` — `nLimit = NaN` is labelled as a clean manoeuvre case, and V_H is taken as cruise speed. |
| F-R18 | **No input validation at `runSizingCore`.** `range = −100`, `reserveMinutes = −30`, `cruiseAlt = −500`, `wingLoadingNm2 = −1371` each return **bit-identical results to the zero case**, converged, with `massBalanceGapKg = 0`. `socMin = 1.5` (a 150 % SoC floor) **converges** to MTOW 1,862.73 kg with a battery **46 % smaller** than the legitimate `socMin = 0` case, because the `1 − socMin` divisor goes negative — **an illegal input yields a more optimistic aircraft**. `sedCell = −300` returns `Wbat = +96,621 kg`. `tipSpeed = 1e4` converges with `TipMach = 29.7`. Unknown keys are silently ignored in every class. The correct pattern is three lines away: the `propDiam` guard refuses **by name** with the received value. |
| F-R19 | Convergence is declared at a user-set tolerance with no statement of the resulting error. `convTolExp = 0` gives MTOW 2,746.74 vs the tight 2,772.06 (**−0.91 %**) with `r2Converged = true`; the UI-reachable worst case is −0.26 %. MTOW is displayed to 0.1 kg while the applied threshold can be 2.76 kg. |
| F-R20 | `certification.js:125,153` — `maxRangeAtMTOM`/`maxPayloadAtMTOM` return a rounded answer and a **mismatched mass**: `{payloadKg: 864, mtowKg: 5689.57}`, but re-sizing at 864 kg gives **5,694.49 kg**. `+lo.toFixed(0)` can round **past the certification limit the function exists to respect**. |
| F-R21 | `compliance.js:146,156` — two regulatory rows **vanish silently**, against the module's own stated invariant that "every other row is reported NOT EVALUATED rather than silently omitted". For turboprops the landing-mass check against MLW **never appears and is never listed**. (Units on that row are correct — **PASS on units**.) |
| F-R22 | `compliance.js:68,78-80` — the ICAO aerodrome reference code is derived from the **requirement**, not the aeroplane, under a `source` string asserting the opposite. The achieved balanced field length is available and unused. Annex 14 Table 1-1 is not held ⇒ the table values are **UNVERIFIED**. |
| F-R23 | `engine.js:3555,3598` — `N_oei_ = Math.max(2, p.nPropHover)` silently evaluates a 1-rotor (and 0-rotor) aircraft as a twin; and the engine's deliberate `null` for cross-shafted layouts is rendered as a **red warning** (`sideBySide` shows "⚠ Check"), which the engine's own comment at `:3585-3589` says is "worse than reporting nothing". |
| F-R24 | **Unbounded runtime on `nPropHover`**: 32 → 0.57 s, 64 → 14.9 s, 96 → **105 s**, 400 → no return in 500 s. Scaling ≈ O(n^4.8); `itersR2` stays 24–48, so the cost is per-rotor, not the solver. The UI slider caps at 10, so this is reachable only via the API, a URL parameter or a design-file import — with no guard and no timeout. |
| F-R25 | `transport/size.js:367-368` — negative masses returned (`economyClass = −50` → `grossLb = −12,330.5`). `converged:false` is set, but `stopReason` reads *"gross weight ran away"*, which is the **wrong diagnosis**. To the class's credit, every genuinely infeasible case returns that explicit `stopReason` rather than a number — **the transport class refuses properly and the eVTOL engine does not.** |
| F-R26 | Three silent refusals: `takeoffThrustToWeight` returns **`NaN`** with no reason; `flightEnvelope` returns **`null`** where it returns a full `{unavailable, why}` object one line below for the Part 23 case; `landingWingLoading` returns a bracket end with no marker distinguishing a solved root from a clamped bound (F-15). |
| F-R27 | `export/vsp3.js:38-58` — **18 `\|\|` fallbacks fabricate a design record**. A `multicopter` (no wing, no V-tail) emits a provenance block reading `Wing: b=12.67 m S=17.83 m² … SM: 22.0% MAC … V-tail: bvt=3.77 m`. The geometry omits them correctly, so only the annotation lies — but the annotation is the design record a CAD user reads, and **22.0 % MAC is a plausible static margin for an aircraft that has no MAC**. `??` instead of `\|\|` is the fix. |
| F-R28 | `export/cpacs.js:29` — a non-finite mass is written as `<mass>0</mass>`, so a consumer cannot distinguish "weighs nothing" from "could not be computed". `:72` in the same file shows the right behaviour. |
| F-R29 | `wing-structure.js:386-387` — a **1 Pa floor on an applied stress** inflates a margin of safety to **+4.4e8** at any station the module could not evaluate: unevaluated reads as infinitely safe. Only `root.marginUlt` is surfaced, which limits the blast radius. |
| F-R32 | `regdb.js:80-83` — the negative-load-factor sign convention is an **interpretation presented as the rule's own words**. The test is `n_neg <= -0.5` (engineering-correct in context), but the quoted words are "not less than −0.5", whose plain arithmetic reading is the opposite. `loadcases.js:184` names it correctly as "a FLOOR in magnitude"; `regdb.js` asserts the literal text beside the inverted test without flagging the inversion. **WARNING, not FAIL.** |
| F-R33 | `CertificationTab.jsx:16,79` — the anti-pattern `regdb.js` was written to stop, in miniature: `MTOW_lb = MTOW_kg * 2.20462` and `limit: "≤ 12,500 lb (5,670 kg)"` — the **rounded kilogramme** that `regdb.js:246-260` bans by name because "rounding one to the other designs straight into the gap". The true value is 5,669.905 kg; the printed 5,670 is 0.095 kg the wrong side. |
| F-R34 | `CertificationTab.jsx:209,522` — two rows test the same reserve quantity with **different tolerances** (an undocumented 1-percentage-point slack), so they can disagree inside that band. |
| F-R35 | `drone/classify.js:84` — uniform `>=` against thresholds of mixed polarity: the quoted clauses read "0.55 pounds **or less**", so exactly 249.4758 g reports as having crossed a threshold it is within. Zero-width in practice; noted because the same file's header makes boundary strictness its central point. `ceilingStatus` uses strict `<` correctly. |
| F-R37 | Self-documented tautologies exported as verdicts: `engine.js:3601` `oeiTransientOK` with the comment "**true by construction once sized to it**"; EASA-S2 `n_ult/n_pos >= 1.5` whose own comment admits "the ratio is definitional in the engine"; FAA-S2 measured equal in every case and better described as a **regression guard** than a design check. Plus dead arithmetic at `flight-envelope.js:341`, a missing `mlwKg > mtowKg` guard where `tan(π·R1/4)` diverges, an undisclosed lift-slope inconsistency at `:202-209`, and six bisections running 28–60 iterations on brackets that converge in 9–20. |

---

## The pattern

Phase 22 asks the tool never to imply certification when it performs a conceptual check. **The
prose does not overreach** — the disclaimers are explicit, repeated and strong, and
`src/classes/aircraft/compliance.js` models the right shape exactly, with a three-state
PASS/FAIL/**NOT EVALUATED** vocabulary and the sentence *"A PASS means a conceptual sizing model
puts the quantity on the compliant side of a number."*

The overreach is **structural**, in four forms:
1. **A single percentage** under a regulator's name aggregating verified rules, unsourced tool
   rules and tautologies (F-R12), with a group PASS badge that erases the per-row "tool rule"
   label (F-R10).
2. **Checks that cannot fail** — a quantity against its own floor (F-R06), a ratio that is 1 by
   construction (F-R07, on an unstable aircraft), and several self-declared tautologies (F-R37).
3. **A stated basis the computation does not implement** (F-R02), and a citation to a document
   that does not exist, invisible to the citation gate by spelling (F-R05).
4. **Degenerate inputs certified** rather than refused (F-R01), where the same repository already
   contains the sentence *"Not evaluated is not zero."*

Every one of these has a correct implementation somewhere else in the same codebase. That is the
most useful thing this section can report: the remediation does not require new judgement, only
the consistent application of the project's own existing standard.
