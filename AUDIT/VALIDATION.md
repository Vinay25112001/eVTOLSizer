# VALIDATION-SUITE INTEGRITY

Commit `3a7a5a4`. This document audits **the existing validation suite itself** — Phase 13's
requirement that validation not be misleading, and Phase 28's that no false confidence be claimed.
It is not the tool's own generated `VALIDATION.md` at the repository root, which is machine-written
by `validation/report.mjs`.

## Scale and structure

| | count |
|---|---|
| harness files on disk (`validation/*.mjs`) | **116** |
| invoked by `npm test` | **111** |
| executed by `validation/report.mjs` (`HARNESSES`, curated) | **67** |
| in neither | **4** — `calibrate`, `report`, `sensitivity`, `ui-audit` (the first three are tools, not checks) |
| in the report list but **not** in `npm test` | **1** — `general-arrangement.mjs` |

Lead-verified that `validation/report.mjs:193` **does execute** its list (`runs = HARNESSES.map(...)`),
so `general-arrangement.mjs` does run under the full gate (`npm test` + `npm run report` +
`report:check`). **There is no coverage hole** — but the registration is asymmetric and nothing
enforces that a new harness reach both runners (**F-31**).

`npm test` is a single `&&` chain, so the first failure stops every later harness. That is a
deliberate fail-fast choice, not a defect, but it means a report of "N passed" after a failure is
not a statement about the remaining harnesses.

## What the suite does well

- **It is generated, not hand-written.** `validation/report.mjs` runs every harness and captures
  what each printed, and the output records the commit hash and refuses to describe an
  uncommitted tree ("WORKING TREE DIRTY — this report does not describe a committed state").
- **It scores against published data and reports the error**, not a pass/fail — the fleet MAE
  (~9 %) is stated rather than hidden.
- **It does not select only flattering aircraft.** `nasa-configs.mjs` deliberately scores only the
  three battery-electric NASA concept vehicles and excludes the turboelectric tiltwing, with the
  reason recorded.
- **`validation/identities.mjs` is a genuine independent-recomputation path** — 42 definitional
  relations, each re-derived from a cited source and run over ~100 randomised design points across
  all six layouts, precisely so a relation cannot pass by luck at one operating condition. The
  header records that extending the sweep to every layout immediately found three real defects.
- **`validation/constants.mjs` is an unusually sophisticated instrument.** Its header contains the
  single best piece of reasoning in the repository: that no harness scoring output against a
  reference can detect a constant wrong by 0.035 %, because that is a hundred times below the
  loosest tolerance in the repo, so the only way to see it is to read the source and require one
  value everywhere. It also distinguishes a *band* check from a *relation* check and argues that
  the relation check is the sharper instrument — "where a constant is pinned by other constants,
  check the relation, not the digits."
- **`unverified-leverage.mjs` / `unverified-triage.mjs`** rank unverified inputs by their leverage
  on MTOW, which is how `eOsw` and `rotorborneLoD` were promoted out of being flat guesses.

## Where the suite is blind, and why

### F-05 — Both nets miss the viscosity defect — HIGH — VERIFIED

1. `validation/identities.mjs:30` **hardcodes** `MU0 = 1.47e-5`, then re-derives Reynolds at `:167`
   with that same constant. The identity `Re == rho V c / mu` tests the **algebra** and is
   structurally incapable of testing the **constant**, because the constant appears on both sides.
   The harness's own unit annotation at `:164` declares `(Pa·s)` — dynamic — so its dimensional
   comment contradicts its value, and nothing compares the two.
2. `validation/constants.mjs` bands only **two** constants (`BANDS`, `:141-151`: gravity SI and
   imperial, and `R_GAS`), despite a header describing tree-wide one-value-per-constant
   enforcement. Viscosity, `rho_MSL`, `T0`, `LAPSE`, `P0`, `GAMMA` and every unit factor are
   **ungated**.

The remedy already exists in the file's own vocabulary: viscosity **is** pinned by a relation —
Sutherland's law at T0 — exactly as `R_GAS` is pinned by `P0/(rho0 T0)`.

### F-37 — An allowlist excuses the line it describes — LOW

`validation/constants.mjs:158` allowlists `src/classes/trainer/weights.js`'s `32.2` for imperial
gravity by (file, value). The gate is therefore blind to that value **by construction**, and the
value propagates into the gust mass ratio, `Kg`, `nGust` and the ultimate load factor.

### F-M03 — Two harnesses score the same published figure on two different group boundaries — MEDIUM

`validation/components.mjs:253-254` states its NASA `systems_lb` comparison **excludes** battery
packaging and flight controls; `validation/nasa-configs.mjs:277-278` **includes** both. At the
hybrid default the extra terms are 124.6 kg against a ~243 kg published total — a **+51 %
inflation** of that comparison. No effect on MTOW; it corrupts the instrument used to judge the
systems groups.

### The structural gap: seven HIGH findings are invisible to output scoring

| finding | size | visible to a ~9 % MAE comparison? |
|---|---|---|
| F-04 viscosity | Cf -3 % | No |
| F-08 fuselage area squared | MTOW +1.35 to +1.61 % | No |
| F-10 CDi constant by construction | 0 % at any single point | **No — invisible at a point, obvious in a sweep** |
| F-06 / F-07 report atmosphere and Reynolds | 5-18 % | No — nothing scores the exported report |
| F-G01 drawn wing station | 66 % of MAC | No — nothing compares drawn to computed |
| F-G02 flat T/W chart | -27 % | No — nothing scores a chart series |
| F-11 / F-18 hover power in five places | -11 % to +32 % | No — only the engine's own value is scored |

This is not a weakness of the harnesses; it is the limit `constants.mjs` itself identifies. The
missing instruments are all of the kind the repo has already invented and applied narrowly.

## Recommended additions (PASS B)

1. Extend `constants.mjs` from **2 constants to all 8**, and add a Sutherland **relation** check
   for viscosity. Closes F-04 permanently and removes the allowlist need for F-37.
2. Stop harnesses hardcoding constants: `identities.mjs` should **import** from
   `src/engine/constants.js` so a wrong constant cannot be reproduced on both sides. (This makes
   the identity weaker as an algebra check and stronger as a system check — the band/relation gate
   is the right home for the value.)
3. A **drawn-vs-computed** gate, per class. One check closes F-G01 and F-G05.
4. A **sweep information** check: assert `CDi` varies across a payload sweep (F-10).
5. Assert every chart series responds to its own swept variable (F-G02, one line).
6. Score the **exported report** (F-06, F-07).
7. Require a new harness to appear in both runners (F-31).
8. Reconcile the two `systems_lb` boundaries (F-M03).

## Verdict

| question | verdict |
|---|---|
| Is the existing validation misleading? | **No.** It states its method, reports errors rather than verdicts, records its own limits, and refuses to describe a dirty tree. The `validated` status has a strict, correct definition and is used for 16 of 467 outputs. |
| Is it sufficient to support the claims made? | **Partially.** It supports the fleet-accuracy claim. It cannot see defects that move every output by a small common factor, and it does not reach the report, the charts or the drawings at all. |
| Does any harness pass for the wrong reason? | **Yes, one, demonstrably** — the Reynolds identity (F-05). One further instrument is mis-calibrated (F-M03) and one allowlist self-neutralises (F-37). |
