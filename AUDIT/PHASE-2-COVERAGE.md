# PHASE 2 — FORMULA FORENSIC AUDIT: what the existing audit actually reaches

**Status** OPENING MEASUREMENT ONLY. Phase 2 has 112 requirements and **0 COMPLETE**.
This document does not audit a single formula. It measures the size and the shape of the gap,
so that the phase's own first requirement — *"Audit EVERY engineering equation"*, with
*"Do NOT audit only major formulas"* immediately after it — is worked against a number rather
than an impression.

---

## 1. Why this measurement exists

`PHASE-BY-PHASE-STATUS.md` has carried this note against Phase 2:

> the phase says 'Do NOT audit only major formulas'; coverage is exactly the major ones.

That was an assertion. It is now measured, and it is **correct**.

## 2. Method

Every `file.js:line` citation in every `AUDIT/*.md` document (excluding the register itself,
which is an inventory and not a claim of audit) was collected, with `a–b` ranges expanded.
Each of the register's **2,429** implementation sites was then tested for a citation at its own
line, and at small tolerances either side, because prose cites a formula's neighbourhood as
often as its exact line.

**Tooling** `scratchpad/p2_coverage.mjs`. It does not call the engine. Register columns are
split on `|`, which is safe **only** for the fields before `equation as coded` — equations
legitimately contain `||`, and a census that reads past that column is corrupt (the mistake is
recorded in N-21). `ID`, `file`, `function` and `line` are fields 2–5, and nothing later is read.

## 3. Result

3,990 distinct `file:line` citations exist across the audit prose. Against 2,429 register sites:

| tolerance | sites cited | share |
|---|---|---|
| exact line | **504** | **20.7 %** |
| ±3 lines | **669** | **27.5 %** |
| ±10 lines | **912** | **37.5 %** |

**This is an UPPER BOUND on Phase 2 coverage, not a measure of it.** Being mentioned in an audit
document is necessary for having been audited, not sufficient — many citations are incidental,
made while documenting something else, and none of them answers Phase 2's twenty questions.
The honest reading is therefore: **even counting any mention anywhere as coverage, three
quarters of the register has never been reached.**

## 4. The shape of the gap, by register domain (±3 lines)

| domain | cited | sites | share |
|---|---|---|---|
| BATTERY | 18 | 28 | **64.3 %** |
| ATM | 8 | 15 | **53.3 %** |
| MISSION | 84 | 166 | **50.6 %** |
| PROP | 90 | 195 | **46.2 %** |
| SIZING | 195 | 483 | **40.4 %** |
| WEIGHT | 82 | 289 | 28.4 % |
| MISC | 24 | 91 | 26.4 % |
| AERO | 73 | 294 | 24.8 % |
| STAB | 32 | 173 | 18.5 % |
| REG | 9 | 81 | **11.1 %** |
| STRUCT | 23 | 227 | **10.1 %** |
| GEOM | 31 | 387 | **8.0 %** |

**The distribution is the finding.** Coverage tracks how headline a domain is, not how much of
the engine it is. The five best-covered domains are the classical sizing physics — battery,
atmosphere, mission, propulsion, sizing. The four worst are **geometry (387 sites, 8.0 %),
structures (227, 10.1 %), regulatory (81, 11.1 %) and stability (173, 18.5 %)**, which together
are **868 sites — 35.7 % of the register — at 11.0 % coverage**. GEOM alone is the second
largest domain in the engine and the least reached.

This is precisely the failure mode P02-002 names, and it is now quantified.

## 5. What this does NOT license

- It does not mark any requirement COMPLETE. All 112 Phase-2 requirements remain as they were.
- It does not say the 27.5 % is correct, only that it was looked at. Phase 2's twenty questions
  (P02-087…P02-106) have not been answered for **any** formula in a structured, per-formula form.
- It is not a substitute for the per-formula ledger Phase 2 requires. P02-107…P02-111 demand a
  verdict of PASS / FAIL / WARNING / UNVERIFIED per formula, and P02-112 forbids
  *"probably correct"*.

## 6. The dependency that caps this phase

**P02-089 asks "Are units correct?" for every equation. Units resolve for 363 of 1,288 retained
relations — 28.2 %** (Phase 0/1; the register's own measured figure). The lever that would raise
it is source-side naming, which is a **production change and is not authorised** (N-18).

So for roughly seven relations in ten, P02-089 can only be answered **UNVERIFIED**, and that is
the audit's own instruction where evidence is unavailable — never a guess. Phase 2 can therefore
be executed honestly and to completion **as a record**, while a large fraction of its verdicts
are UNVERIFIED for a cause that is documented rather than unknown. Any future report of Phase 2
must state that share rather than let it read as a pass rate.

## 7. Next, in order

1. Build the per-formula Phase-2 ledger over all 1,288 retained relations × the 20 questions,
   populating first what is **mechanically determinable** from evidence already held:
   Q9 duplication (the register's C7 class, 422 sites), Q3 units (the units column),
   Q10 coefficient sourcing (the `source` column), Q20 zero/negative/NaN guards (source scan).
2. Then work the 82 named physics domains (P02-004…P02-085) in register order, **worst-covered
   domain first** — GEOM, STRUCT, REG, STAB — because that is where the phase's own prohibition
   has been violated, and because the best-covered domains already have prose to build on.
3. ~~Gate it, as Phase 0 and Phase 1 were gated.~~ **DONE the same day (N-24):**
   `validation/phase2-ledger.mjs`, **20 checks, 16 of 16 mutants killed**, wired into `npm test`
   after `formula-register.mjs`. Without it the ledger would have scored NO REGRESSION TEST, the
   verdict 11 of Phase 0's requirements already carry. The gate reads the **committed** ledger and
   **re-derives** from the register rather than regenerating the artefact it compares against,
   which is the N-19 trap, and it strips CR **first**, which is the F-40 trap. **Gating answers
   none of the twenty questions** — it only stops the answers already recorded from drifting away
   from the code.
