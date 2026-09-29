# CHANGE CONTROL — PASS B (Phase 32)

Every engineering change made during remediation, recorded with the fields Phase 32 requires:
BEFORE · AFTER · WHY · FORMULA · SOURCE · EXPECTED EFFECT · ACTUAL EFFECT · REGRESSION RESULT.

No equation, empirical constant, tolerance or convergence rule is changed silently. Where a change
is deliberately **not** made, that is recorded too, with the reason.

---

## CHG-001 — The MOC VTOL.2120 climb check refuses a degenerate aircraft instead of certifying one

**Closes:** F-R01 (CRITICAL)
**Files:** `src/engine/certification-climb.js`
**Baseline:** `3a7a5a4`

### BEFORE

```js
const W = Math.max(1, (g.MTOW_kg ?? 0) * (g.g0 ?? 9.80665));
const V = Math.max(1e-6, p.vCruise ?? 0);
const eta = Math.max(1e-6, p.etaSys ?? 0.8);
```

Measured, at the app's own unit count and per-unit rating (`nUnits: 12`,
`pMotInstalledKW: 73.72`, `LD: 9.77`, `etaSys: 0.8`, Category Enhanced):

| input | `gradientPct` | required | `pass` |
|---|---|---|---|
| `MTOW_kg = 0` | 968,252.451 | 2.5 | **TRUE** |
| `MTOW_kg` undefined | 968,252.451 | 2.5 | **TRUE** |
| `vCruise = 0` | 2,386,407,993.713 | 2.5 | **TRUE** |
| both zero | 6.49e13 | 2.5 | **TRUE** |

### AFTER

The floors are removed and replaced by an explicit validity gate that returns
`applicable: false, gradientPct: null, pass: null` and a basis naming the missing quantity.

### WHY

The floors did not guard the arithmetic, they **fabricated an aircraft**: a missing or zero mass
became a 1 N machine and a missing or zero cruise speed a 1 µm/s one, and the clause then certified
it. This is the only safety-performance clause the eVTOL path evaluates; it is reported as a
certification finding; and unlike the sizing loop's runaway — which `App.jsx:2347` banners in red —
a PASS here carried no warning at all. Several upstream paths can deliver a zero or absent mass
(F-01, F-12, F-22, F-R14, F-R18), so the case is reachable rather than theoretical.

`pass` is **`null`, not `false`**, because `false` is a finding about an aircraft and there is no
aircraft.

### FORMULA

Unchanged: `gradient = (P_avail · eta)/(W · V) − 1/(L/D)`, compared against
`CLIMB_GRADIENT_MIN = 0.025`. **No equation was modified.** Only the domain on which it is
evaluated changed, from "everything, with degenerate inputs floored" to "finite, positive inputs".

### SOURCE

MOC-2 SC-VTOL Issue 3 (22 Dec 2022), MOC VTOL.2120 — verified verbatim against the vendored corpus
at `../eVTOL_Sizing_Research/extracted`. The refusal idiom is the repository's own:
`src/classes/aircraft/fuselage-pressure-shell.js:164`, **"Not evaluated is not zero."**

### EXPECTED EFFECT

Zero change to any valid design — each floor could only ever bind on an input that is already
non-finite or non-positive. Degenerate inputs move from `pass: true` to `pass: null`.

### ACTUAL EFFECT

Measured by importing the pre-change module (`git show HEAD:…`) alongside the new one:

| case | before | after | |
|---|---|---|---|
| enhanced | 25.383 / true | 25.383 / true | **IDENTICAL** |
| basic | 28.621 / true | 28.621 / true | **IDENTICAL** |
| wingless | null / null | null / null | **IDENTICAL** |
| `LD = 0` | null / null | null / null | **IDENTICAL** |
| single cruise prop | −10.235 / false | −10.235 / false | **IDENTICAL** |
| two cruise props | −6.997 / false | −6.997 / false | **IDENTICAL** |
| `MTOW_kg = 0` | 968,252.451 / **true** | null / **null** | intended |
| `vCruise = 0` | 2,386,407,993.713 / **true** | null / **null** | intended |

### REGRESSION RESULT

Golden master, 277 cases: **no numeric field moved**; the only difference was the prose field
changed by CHG-002. After re-recording: *"PASS — every value bit-identical; full headroom to the
threshold"*, on both the direct and `--via-registry` runs.

---

## CHG-002 — The climb check's basis states the condition it actually computed

**Closes:** F-R02 (CRITICAL)
**Files:** `src/engine/certification-climb.js`, `src/engine.js` (check string),
`src/lib/provenance.js` (`certClimbGradientPct` source text)

### BEFORE

Basis string: *"…, at 305 m above the take-off surface, cruise configuration, …"*
UI check value (`engine.js:2983`): `` `${certClimbOut.gradientPct}% at 305 m, CFP: …` ``
Provenance `src`: described the rule's condition as though it were the one applied.

`CLIMB_GRADIENT_ALT_M` appeared in the module **exactly twice** — its declaration at `:97` and that
sentence at `:173` — and **never in the arithmetic**. `rhoAtCondition` was documented as an input
at `:105` and **never read**; `engine.js:2606` has never passed it.

### AFTER

The basis names the condition that was computed and cites the rule's condition **explicitly as the
one it was not computed at**; a new `conditionApplied: "converged cruise condition"` field carries
the same fact for consumers that render no prose; the UI check string says
*"at the converged cruise condition"*; the provenance entry states the gap with a ⚠ marker; the
dead `rhoAtCondition` is removed from the JSDoc with a note saying why.

### WHY

A stated evaluation condition that the arithmetic does not implement is a false claim about a
certification quantity. It is the same defect family as F-06 and F-07, in the one place where it
carries regulatory weight.

### FORMULA

**Unchanged.** No number moved.

### SOURCE

MOC VTOL.2120(a) and (b), verified verbatim against the vendored corpus. (b) additionally requires
Category Basic at ISA SL, equally unapplied, and the basis now says so.

### EXPECTED EFFECT

Prose and one new field only. No numeric change.

### ACTUAL EFFECT

Golden master: **115 of 277 cases differ, in exactly one field, `certClimbBasis`**. Snapshot diff:
115 insertions, 115 deletions, and the only key touched is `certClimbBasis`. **No numeric output
moved** — confirmed by the golden master reporting every value bit-identical after re-record.

### REGRESSION RESULT

See CHG-001. `render-freeze` PASS. All cheap gates PASS.

### WHAT THIS CHANGE DELIBERATELY DOES **NOT** DO

**It does not evaluate the gradient at 305 m.** Doing so requires the lift-to-drag and the speed
**at that condition**, not the converged cruise ones, and ISA SL for Category Basic — a re-derivation
of the polar at a second condition, which is an engineering change with its own validation and its
own effect on a reported certification number. Per Phase 34, inventing that would be manufacturing
certainty. The gap is therefore **left open and stated**, in the basis string, in the new field, in
the provenance entry and in `AUDIT/REGULATORY-AUDIT.md`, and is carried forward as a HIGH item for
a holder decision rather than closed silently.

---

## CHG-003 — A harness that catches both, and is proved not to be hollow

**Files:** `validation/certification-climb.mjs` (new), `package.json`, `validation/report.mjs`

42 checks in four sections: refusal of twelve degenerate input shapes (asserting `pass === null`,
not merely "not true"); that a refusal **names** the missing quantity; that the basis may not claim
an unapplied condition; and four regression pins on the valid-design arithmetic.

**The pins are measured, not predicted.** The first value written by hand was a guess (27.694 for
Category Basic) and the harness rejected it; the measured value is 28.621. That is recorded in the
harness comment, because it is the argument for pinning a measurement rather than an expectation.

**Mutation evidence.** Run against the original, defective module the harness fails **26 checks**
— so it is not a check that cannot fail, which is the failure mode this repository has hit before
and which `AUDIT/VALIDATION.md` documents.

**Registered in both runners**, closing F-31 for this harness: `npm test` (now 112 distinct
harnesses) and `validation/report.mjs` `HARNESSES` (now 68). A harness in only one runner was itself
a finding.
---

## CHG-004 — Round 1 stops publishing an out-of-category seed, and says when the answer is only a seed

**Closes:** F-01 (HIGH)
**Files:** `src/engine.js`, `validation/round1-seed.mjs` (new), `validation/report.mjs`,
`package.json`, `validation/golden-master.snapshot.json`
**Baseline:** `5206672`

### THE REGISTER'S OWN FIX IS A NO-OP, AND THAT IS THE FIRST FINDING OF THIS CHANGE

`FINDINGS.md` F-01 and `FINAL-VERDICT.md` §394 both prescribe *"move `:504` above `:503`"*.
Applied literally, the guard then reads `MTOW1` — the **previous, in-range** iterate — passes,
and `MTOW1=mn` publishes the runaway anyway. Measured on the registry entry path, against the
pre-fix module and against that exact mutation:

| input | pre-fix | register's fix (moved) | this change |
|---|---|---|---|
| `sedCell=1` Wh/kg | 142,042.75 | **142,042.75** | **2,177** |
| `range=5000` km | 16,256.18 | **16,256.18** | **2,177** |
| `sedCell=1e-9` | 1.40e14 | **1.40e14** | **2,177** |
| `itersR1` (those cases) | 1 | 2 | 1 |

The proposal moves only the iteration count. It is retained as mutant `m2_moved` in the
harness's mutation set so it cannot be reintroduced as a fix.

### BEFORE

```js
  let MTOW1=2177,Wempty1,Wbat1,itersR1=0;
  for(let i=0;i<5000;i++){
    ...
    if(Math.abs(mn-MTOW1)<tolFor(MTOW1)){MTOW1=mn;break;}
    MTOW1=mn;             // published here
    if(MTOW1>5700)break;  // and only examined here
  }
```

### AFTER

```js
    if(Math.abs(mn-MTOW1)<tolFor(MTOW1)){MTOW1=mn;r1Converged=true;break;}
    if(mn>5700){r1CeilingHit=true;break;}
    if(mn<p.payload){r1FloorHit=true;break;}
    MTOW1=mn;
```

plus `r1Converged`, `r1CeilingHit`, `r1FloorHit` and `mtowFromR1Seed` on the returned object.

### WHY

**A guard must see the value it is guarding.** The test has to read `mn`, the candidate, before
it becomes the answer.

**SOURCE — the convention is the tree's own, not an invention.** Round 2 already does exactly
this at its `mtowCeiling` guard (`src/engine.js`), and states the reason: *"keep the last
in-range iterate rather than an out-of-range one"*. This change makes Round 1 consistent with
its sibling loop.

**The bound is two-sided because a one-sided one is not a bound.** `mn > 5700` never rejects a
negative mass, and these iterates go negative: `range = -4938.9 km` runs
`2177 → -12,813.92 → 78,556.43`. Guarding only the ceiling preserves **-12,813.92 kg** as "the
last in-range iterate", and an aircraft weighing less than nothing reaches `componentWeights`,
which throws on a NaN `nzUltimate`. Round 2's comment states its bound as `[payload, ceiling]`
but its code tests only the upper half — **registered as N-01 below rather than changed here.**

**`isFinite` is deliberately NOT tested in Round 1**, unlike Round 2. Every route that would
make `mn` non-finite (`sedCell`/`LD`/`etaSys` = 0) throws earlier in `componentWeights`, so the
condition is unreachable, and a guard that cannot fail is not a guard.

**A converged Round 1 is still not an answer.** `vCruise=0` publishes 1,241.58 kg through a
different door entirely: Round 1 genuinely converges — its recurrence contains no `vCruise` at
all — `MTOW` is seeded from `MTOW1`, and Round 2 breaks on its first pass without ever writing
`MTOW`. No guard ordering reaches that case, and 1,241.58 kg is *plausible* for this class,
which is what makes it the dangerous one. `r2Diverged` says the design did not close; it does
not say the number never came from the coupled loop. `mtowFromR1Seed` says that.

### EXPECTED EFFECT

No converged design moves. Non-converged designs stop publishing out-of-category masses. Four
additive fields appear on the result.

### ACTUAL EFFECT

| case | MTOW before | MTOW after | flags after |
|---|---|---|---|
| default | 2,772.06 | **2,772.06** | `r1Converged`, `r2Converged`, `mtowFromR1Seed:false` |
| `sedCell=1` | 142,042.75 | 2,177 | `r1CeilingHit`, `mtowFromR1Seed` |
| `range=5000` | 16,256.18 | 2,177 | `r1CeilingHit`, `mtowFromR1Seed` |
| `sedCell=1e-9` | 1.40e14 | 2,177 | `r1CeilingHit`, `mtowFromR1Seed` |
| `vCruise=0` | 1,241.58 | 1,241.58 | `r1Converged` **and** `mtowFromR1Seed` |
| `range=-5000` | 78,556.43 | 1,988.34 | `r1FloorHit` |

### REGRESSION RESULT

**Golden master, 277 cases, re-recorded.** `git diff --numstat` on the snapshot: **654
insertions, 2 deletions**, fully accounted for as 163 × 4 new fields (652) plus the two modified
lines. Every changed line enumerated:

- added: `r1Converged` ×163, `r1CeilingHit` ×163, `r1FloorHit` ×163, `mtowFromR1Seed` ×163
- changed: `itersR2` on **`sweep-75`** (10→11) and **`sweep-109`** (2→3) — both
  `_diverged: true, ceiling: true`, pinning **no numeric answer**. They still diverge and still
  hit the ceiling; they take one more pass because Round 2 now starts from a sane seed.
- removed: none. Mojibake introduced: **0**.

**No MTOW, mass, power or energy value moved in any case.** Re-run after recording:
`PASS — every value bit-identical; full headroom to the threshold`, and
`--via-registry`: `PASS — registry path bit-identical (Object.is) to the direct engine call`.

**New harness `validation/round1-seed.mjs` — 40 checks, 0 failed.** Registered in **both**
runners (`npm test`, and `report.mjs` `HARNESSES` 68 → 69), closing F-31 for this harness.

**Mutation evidence — 5 mutants, 5 killed:**

| mutant | what it is | result |
|---|---|---|
| `m1_prefix` | the code as it shipped | KILLED, 9 failed |
| `m2_moved` | **the register's own prescription** | KILLED, 9 failed |
| `m3_ceilonly` | right subject, one-sided | KILLED, 3 failed |
| `m4_flooronly` | floor without ceiling | KILLED, 7 failed |
| `m5_seedconst` | `mtowFromR1Seed` hard-coded false | KILLED, 2 failed |

The harness also rejected its own first draft: over the original six cases `mtowFromR1Seed` was
identical to `r2Diverged` on every one, so the check requiring them to differ **failed**. The
distinguishing case (`range = 240 km`, inside the UI slider's own 50–250, where Round 2 writes
`MTOW` 65 times and then runs out of iterations) was added rather than the check deleted.

### DELIBERATELY NOT DONE

`MTOW` is **not** made `null` when the loop never produced one, though that is the F-R01
precedent. It would ripple into `App.jsx:1260` colour-coding, the saved-report naming at
`:1382`, and every downstream `.toFixed` consumer. Recorded as a holder decision, not taken
silently.

---

## NEW FINDINGS RAISED BY THIS CHANGE

### N-01 — Round 2's comment states a bound its code does not enforce — MEDIUM — VERIFIED

`src/engine.js` (Round 2 ceiling guard) reads:

> *"So the search is CONFINED to [payload, ceiling]. Stepping out of that range is not a bigger
> aeroplane, it is proof that no root exists inside the category"*

The code below it tests `!isFinite(next) || next > mtowCeiling` and **nothing else**. There is no
`next < p.payload` test anywhere in the loop. Verified by grep over the whole loop body. Same
species as F-R02 (a constant named in a basis string and absent from the arithmetic), which
PASS B has already closed once.

### N-02 — Round 2 converges on a physically impossible design and reports `r2Converged: true` — MEDIUM — VERIFIED

With `range = -4938.9 km` the battery mass fraction `bf` is negative, so the design carries a
**negative battery**. Round 2 converges on it: `MTOW = 1,988.34`, `itersR2` finite,
`r2Converged: true`, `r2Diverged: false`, no flag of any kind. This is the eVTOL analogue of
**F-02** (the trainer loop converging to negative fuel with `converged: true`) and was previously
masked: before CHG-003 the Round 1 runaway tripped the ceiling first and the case surfaced as a
flagged 78,556.43 kg instead. Trigger requires an illegal negative input — the UI slider is
`min={50} max={250}` km — so it is reachable only by a harness or an API caller, the same class
the existing negative-span comment already describes.

### N-03 — The golden master drops every numeric field on a diverged case — MEDIUM — VERIFIED

114 of 277 snapshot cases are `_diverged` and retain only
`_diverged, itersR2, ceiling, configType, weightModel`. **Not one pins `MTOW`.** F-01 lives
entirely in diverged cases, so the regression net had a hole exactly the shape of the defect:
this change was snapshot-neutral for MTOW not because it was safe but because the snapshot
cannot see there. That is why `round1-seed.mjs` exists and why it carries its own pins.
---

## CHG-005 — The viscosity constant was the wrong quantity, and the gate that could not see it

**Closes:** F-04 (HIGH), F-05 (HIGH), and N-04 as a side effect
**Files:** `src/engine/constants.js`, `validation/constants.mjs`, `validation/identities.mjs`,
`validation/golden-master.snapshot.json`, `paper/VFS-Forum-83-abstract.md`
**Baseline:** `4bf3aef`

F-04 and F-05 are one change because they are one defect. A wrong constant survived because the
only harness that touched it held its own copy of the same wrong value.

### BEFORE

```js
export const MU0     = 1.47e-5;   // reference dynamic viscosity, Pa*s
```

### THE VALUE IS NOT DYNAMIC VISCOSITY — INDEPENDENT DERIVATION

`AUDIT/reference/visc.py`, which shares no code with the application, run this session:

| quantity | value |
|---|---|
| Sutherland `mu(288.15 K)` (White 3e eq. 1-36) | **1.789380e-5 Pa·s** |
| ICAO Doc 7488 tabulated dynamic viscosity | 1.7894e-5 Pa·s |
| kinematic `nu = mu/rho` | 1.460719e-5 m²/s |
| shipped `MU0` | 1.47e-5 — **17.8 % BELOW dynamic**, **0.64 % from kinematic** |

**The law it feeds is a dynamic-viscosity law, so the formula was right and only the coefficient
was wrong.** Over 288.15 → 216.65 K, `atmosphere.js`'s `(T/T0)^0.75` gives 0.80743 against
Sutherland's 0.79447 — 1.6 % apart. The true KINEMATIC ratio over the same interval is 2.67431,
off by 3.3×. A kinematic coefficient cannot be what this law transports.

### AFTER

`MU0 = 1.789e-5`, which agrees with Sutherland to 0.02 % and is the value the tree **already
carried under the same label** at `engine/noise.js:197` and `export/report.js:396`. Three sites and
two numbers become three sites and one number.

### F-05 — WHY NO GATE COULD SEE IT

1. `validation/identities.mjs` **hardcoded its own `MU0 = 1.47e-5`** and re-derived Reynolds number
   with it, then compared that to the engine's Re, which the engine had computed from ITS copy of
   the same wrong number. **The constant sat on both sides of its own identity.** The algebra closed
   to 1e-9 over a 21.7 % error in every Reynolds number in the tree, and the identity's own unit
   annotation read `(Pa·s)` — dynamic — while the value was kinematic.
2. `validation/constants.mjs` banded only gravity and `R_GAS`.

**Fix — two instruments, two jobs.** `identities.mjs` now IMPORTS the constants: it tests ALGEBRA,
and cannot do that while silently disagreeing with the engine about what a constant is.
`constants.mjs` pins the CONSTANT by physics, the same "check the relation, not the digits"
instrument already applied to `R_GAS`:

- `MU0` equals Sutherland at `T0` (±0.5 %)
- **`MU0` is NOT the kinematic viscosity** — the check with teeth. 1.47e-5 is within 0.64 % of
  `nu`, so any "is it about right" band near dynamic would have passed the wrong quantity.
  A gate that cannot tell `mu` from `nu` is not gating `mu`.
- `atmosphere.js` transports it with a dynamic-viscosity temperature law — this fails if anyone
  "fixes" the units by swapping the law instead of the constant.

### MUTATION EVIDENCE — 5 mutants, 5 killed

| mutant | result |
|---|---|
| `MU0` back to **1.47e-5**, the value that shipped for the project's whole history | **KILLED** |
| `MU0` = 1.460719e-5 (exactly kinematic) | KILLED |
| `MU0` = 1.843e-5 (a 3 % drift) | KILLED |
| the transport law swapped to a kinematic exponent instead of fixing the constant | KILLED |
| the private hardcoded copy put back into `identities.mjs` | KILLED |

The first is the point: **the gate now catches the exact value it was blind to.**

### ACTUAL EFFECT — enumerated, not summarised

Golden master, 277 cases: **183 changed, 94 bit-identical.**

| prediction | result |
|---|---|
| `Re_` must DECREASE | **113 cases, all down, 0 violations** |
| `CD0tot` must increase | 112 up, **1 down** |
| `MTOW` must increase | 106 up, **1 down** |

MTOW change: min −0.013 %, **median +1.129 %**, max +14.692 %.

**Both violations explained; neither is a physics failure.**

- **`sweep-160`, CD0tot −0.194 %.** Same airfoil. MTOW rose 7425.91 → 8516.95 (+14.7 %) and
  `Swing` 50.22 → 57.6. CD0tot is a COEFFICIENT on wing area; drag AREA = CD0tot × Swing went
  **2.0374 → 2.3323, +14.5 %**. Parasite drag rose exactly as predicted; only the reference area
  grew faster. The prediction was naive, not the code.
- **`sweep-227`, MTOW −0.013 %.** CD0tot rose as predicted, but `selAF` CHANGED — the Re-dependent
  airfoil selector picked a different section whose benefit just offsets the drag rise. −0.34 kg
  on 2,643 kg.

**Discrete consequences, all traced:**
- `selAF` changed on **77** cases — the airfoil selector is Re-dependent. Of these, **zero** have
  CD0tot down, and the only CD0-down case has the SAME airfoil: the two mechanisms do not overlap.
- `tyreMain` changed on 4 cases (heavier design selects a larger tyre).
- `kVerdict` drag-class label moved on 7 cases, always toward draggier.
- **`_diverged` flipped on 3 cases**: `sweep-43` (10,656 kg) and `sweep-105` (10,978 kg) converged
  before and now hit the ceiling; `sweep-133` went the other way. All three sit within ~5 % of the
  ~11,400 kg ceiling, so a +1 % weight correction tips a marginal design over.

**The rotor-borne configurations do not move at all.** Every multicopter and side-by-side binding
value is unchanged (0.236, 0.547, 0.755, 1.059, 1.433, 0.329) because they carry no Re-dependent
wing drag. That is the cleanest available control on the change's reach.

### ACCURACY MOVED, AND ONE HEADLINE GOT WORSE — STATED, NOT HIDDEN

| metric | before | after |
|---|---|---|
| NASA weight-group mean (`nasa-configs.mjs`, "THE PRIMARY VALIDATION") | 10.4 % | **10.2 %** |
| fleet MAE, ewf-fraction (`validate.mjs`) | 26.0 % | **25.7 %** |
| **fleet MAE, component buildup** | **9.7 %** | **10.4 %** — WORSE by 0.7 points |

Correcting a demonstrably wrong physical constant made the headline buildup accuracy slightly
worse. The tool was partly calibrated around the wrong viscosity, and removing a real 21.7 %
Reynolds error exposes that other unverified factors were absorbing it. This project has been here
before: the landing-line work raised headline MAE 8.9 → 9.6 % ON PURPOSE, because the better score
had come from a CLmax that was not a lift coefficient. **Accuracy bought with a wrong physical
quantity is not accuracy.**

**No threshold was touched.** `GATE_MAE = 40` and `MEAN_MAX = 14.6` are unchanged and both pass.

### N-04 CLOSED AS A SIDE EFFECT

`export/report.js` printed the `Re_w` equation with its denominator from `muCrd` (built from
1.789e-5) and its ANSWER as `SR.Re_` (computed by the engine from 1.47e-5) — the displayed
arithmetic did not produce the displayed result, off by exactly 1.789/1.47 = 1.2170. With the
engine on the same constant, that equation now closes.

### NEW FINDING RAISED

**N-05 — `MEAN_MAX = 14.6 // measured 14.5` is stale by ~4 points.** The pre-F-04 measured mean was
**10.4 %**, not 14.5 %. The comment records a value the harness has not produced for some time, so
the "PRIMARY VALIDATION" gate carries roughly four points of unearned slack. Not changed here:
tightening an accuracy gate is a holder decision, and doing it inside a physics commit is exactly
the ratchet movement the file's own comment warns about.
---

## CHG-006 — A negative mission is refused instead of sized

**Closes:** F-02 (HIGH)
**Files:** `src/classes/trainer/size.js`, `validation/trainer-domain.mjs` (new),
`validation/report.mjs`, `package.json`, `VALIDATION.md`
**Baseline:** `5dceb3c`

### BEFORE

`resolve()` checked finiteness and nothing else, so the loop accepted negative inputs, converged
on them, and published the result with `converged: true`, `stopReason: null` and no flag:

| input | converged | gross (lb) | usable fuel (lb) | cruise (lb) | reserve (lb) |
|---|---|---|---|---|---|
| default | true | 2605.4 | 265.37 | 204.42 | 38.23 |
| `rangeNm: -518` | **true** | 1804.1 | **−108.86** | **−153.63** | 26.46 |
| `reserveMin: -1000` | **true** | 1358.9 | **−320.28** | 106.49 | **−442.64** |
| `allowanceGal: -10` | true | 2426.1 | 181.99 | 192.65 | 36.01 |

All four reproduced exactly. These are genuine fixed points — the residual really is under the
0.01 lb tolerance — so the loop was right and the physics was not. A gross weight of
*empty + payload MINUS 108.86 lb of fuel* was reported as a converged design, and unlike the
eVTOL path, which banners a diverged run in red, nothing here said anything at all.

### AFTER

`resolve()` refuses a NEGATIVE value for any quantity whose schema declares `min >= 0`, naming
the input, the offending value and the declared range, as Phase 18 requires.

### WHY ONLY THE SIGN, AND NOT THE WHOLE DECLARED RANGE

**The first version of this fix enforced the entire `min..max` range, and it was wrong.**
It broke `validation/trainer.mjs:99`, which deliberately asks for a **5,000 nm** mission against a
declared maximum of 1,200 and requires it to come back `converged: false` **with a `stopReason`**.

That harness encodes a distinction the whole-range check flattened:

- a **negative** range or reserve is not a mission at all → refuse it
- a **large but meaningful** request is a real question with a real answer → size it and report
  reasoned non-convergence, which this loop already does via `TRAINER_MAX_GROSS_LB`

`TRAINER_INPUTS.max` is a slider bound, not a statement about where the model is valid. A 50 nm
mission and a 91 minute reserve are answerable questions. `min >= 0` is the schema's own statement
that a quantity cannot go below zero, and that is the only part enforced. No number was chosen and
no rule invented.

**Correction to the record:** an earlier note in this session described `rangeNm = 99` and
`reserveMin = 91` as part of F-02. They are not. They are legitimate queries, and both still
converge. The defect was the sign, not the range.

### THE GUARD DELIBERATELY NOT ADDED

No result-level "fuel must be positive" check exists, and section 4 of the harness is the evidence
rather than an assertion. With negatives refused, a search over every declared extreme, 100× each
maximum, the degenerate zeros, and 6,000 random points across both the legal interior and a
stretched non-negative space produced **1,974 converged designs and ZERO with negative fuel,
negative empty weight, or a gross weight below empty**. The single flagged case was `sfc = 0`
giving a cruise fuel of 0.00 lb — a zero-consumption engine burning no fuel, degenerate but
consistent, and not negative.

A guard for a condition that cannot occur could not fail, and a guard that cannot fail is not a
guard. The search is run instead, so if a future change makes such a design reachable the harness
fails and says the guard is now needed. (Same reasoning as CHG-004's omission of `isFinite` in
Round 1.)

### REGRESSION RESULT

`validation/trainer-domain.mjs` — **19 checks**, registered in BOTH runners
(`npm test`, and `report.mjs` HARNESSES **69 → 70**, verified by name-list diff +1/−0).

**Mutation evidence — 5 mutants, 5 killed:**

| mutant | result |
|---|---|
| the guard removed entirely | KILLED, 6 checks |
| only values below −1000 refused, so −1 and −10 slip through | KILLED, 6 |
| a refusal message that explains nothing | KILLED, 1 |
| **the whole declared range policed — the over-reach this fix was corrected from** | **KILLED, 4** |
| silently CLAMP to the bound instead of refusing | KILLED, 6 |

**A mutant proved one of this harness's own checks was hollow.** The explanation check originally
asked whether the refusal for `rangeNm` contained the string `"rangeNm"` — but the message's own
worked example cites `rangeNm = -518`, so the substring was present whether or not the message
named the offending input, and `m3_generic_message` survived. It now uses `allowanceGal`, whose
name appears nowhere in the boilerplate, and requires the name to LEAD the message. The check also
caught its own search being under-powered (117 converged of 3,150); the sampling was strengthened
rather than the threshold lowered.

**No numeric output moved.** The default design is pinned unchanged at gross 2605.4 lb, usable fuel
265.37, cruise 204.42, reserve 38.23, `converged: true`, `stopReason: null`.

Gate: **`TEST_EXIT=0 REPORT_EXIT=0 CHECK_EXIT=0`**, 2,695 checks, 0 failures, 70/70 harnesses.

### RELATED, NOT FIXED

**N-02** is the eVTOL analogue of this defect and remains open: Round 2 converges on a design with
a NEGATIVE battery mass and reports `r2Converged: true`. It surfaced during CHG-004 and is
registered there. Whether to apply the same sign discipline to the eVTOL inputs is a holder call,
because `DEFAULT_PARAMS` carries no equivalent published min/max schema to enforce.

---

## CHG-007 — The sign discipline of CHG-006, in every class that publishes a schema

**Closes:** N-06 (HIGH, raised by this pass while reproducing F-03)
**Files:** `src/classes/aircraft/domain.js` (new), `src/classes/trainer/size.js`,
`src/classes/transport/size.js`, `src/classes/turboprop/size.js`,
`validation/aircraft-domain.mjs` (new), `validation/report.mjs`, `package.json`, `VALIDATION.md`
**Baseline:** `d928971`

### N-06 — THE DEFECT CHG-006 FIXED IN ONE CLASS STOOD IN ALL THE OTHERS

CHG-006 refused a negative mission in `src/classes/trainer/size.js` and nowhere else. The defect
was never trainer-specific. Found while reproducing F-03: `reserveMin = -45` on a transport under
the `regulatory` fuel method took **3,473 kg off the aeroplane** as a fuel credit
(86,127.9 → 82,654.4 kg), and `transport/defaults.js:41` declares `min: 0` for that very input.

### BEFORE

Every input each schema declares non-negative, set to `-1`, one at a time:

| class | declares `min >= 0` | accepted `-1` | of which `converged:true` | design moved |
|---|---|---|---|---|
| transport | 84 | 83 | 59 | 38 |
| bizjet | 85 | 84 | 57 | 29 |
| turboprop | 54 | 53 | 27 | 26 |

The single refusal in each class was `numEngines`, caught by a rule about engine counts rather
than about signs. The extremes:

| input | class | gross weight | against baseline |
|---|---|---|---|
| `tsfcCruise = -1` | transport | 54,340.0 lb | −68.7 % |
| `emptyMarginFraction = -1` | transport | 65,362.0 lb | −62.4 % |
| `emptyMarginFraction = -1` | bizjet | 4,499.1 lb | −83.7 % |
| `emptyMarginFraction = -1` | turboprop | 19,622.1 lb | −65.0 % |
| `systemsFactor = -1` | turboprop | 25,272.9 lb | −54.9 % |

An engine that burns negative fuel and a structure that weighs less than nothing are fixed points
the loops are happy to find, and 143 runs across the three classes reported `converged: true` on
one.

### AFTER

All **223** non-negative inputs across the three schemas refuse a negative value, naming the
input, the offending value and the declared range. Measured after: `accepted -1` is **0 of 84**,
**0 of 85** and **0 of 54**.

### WHY THE RULE MOVED TO ONE FILE

Writing the same rule a fourth time would have been the duplication defect this codebase already
condemns in `rotorcraftDragCD0` ("two copies of one design quantity"). The rule now lives once, in
`src/classes/aircraft/domain.js`, and the trainer was moved onto it: `refuseNegativeInputs(label,
defaults, schema, q, evidence)` writes the sentence, each class supplies its own measured account
of what accepting the value used to produce. **The trainer's refusal text is unchanged**, which
matters because `validation/trainer-domain.mjs` pins it — that harness still passes its 19 checks
untouched.

`max` is still not enforced, for the reason CHG-006 records: it is a slider bound, not a statement
about where the model is valid. 20,000 nm from a transport and 9,000 nm from a turboprop are
answered with `converged:false` and "gross weight ran away", not refused.

### THE DISCRIMINATOR: THE SCHEMA DECIDES, NOT THE SIGN

Two transport inputs declare a NEGATIVE minimum — `fieldElevationFt` (−1,500 ft, for aerodromes
below sea level; Bar Yehuda is at −1,266 ft) and `fieldDeltaIsaC` (−30 C). Both must still size,
and both do. A guard that simply banned negative numbers would pass sections 1 and 2 of the new
harness and fail section 3; mutant `m3_ban_the_sign_not_the_schema` does exactly that and is
killed there and only there.

### THE BUSINESS JET, AND A CYCLE THAT CANNOT BE IMPORTED AWAY

The business jet is flown by `sizeTransport` from both entry paths, so `TRANSPORT_INPUTS` governs
it. That is sound only while the two schemas agree about which quantities may go below zero:
measured, they **agree on the sign of all 100 keys they share**, and the harness asserts it rather
than trusting it. `bizjet/defaults.js` imports `transport/defaults.js`, so the reverse import would
be a cycle; the one bizjet-only key, `passengersCarried`, is therefore guarded explicitly in
`transport/size.js` with the reason written beside it.

### MUTATION EVIDENCE — 9 mutants, 9 killed

`m1` min strictly positive · `m2` let −1 through · `m3` ban the sign, ignore the schema ·
`m4` drop the input's name from the refusal · `m5` no transport guard · `m6` no turboprop guard ·
`m7` no `passengersCarried` guard · `m8` refuse zero as well · `m9` police the whole declared
range (the CHG-006 over-reach). Each was applied, run and restored byte-for-byte.

### NUMBERS MOVED: NONE

This change refuses inputs; it computes nothing. All three baseline designs are pinned unchanged
to 0.05 lb — transport 173,724.4 lb, bizjet 27,663.7 lb, turboprop 55,990.5 lb — and the golden
master does not move.

### NEW FINDINGS RAISED

**N-07 — the registered description of `trainer-domain.mjs` described the REJECTED fix — LOW,
CLOSED HERE.** `validation/report.mjs`, and therefore the published `VALIDATION.md` row, stated
that the harness "requires each to be refused below its minimum **and above its maximum**". That
is the whole-range version CHG-006 tried, measured as wrong and deliberately backed out; the
shipped harness pins the opposite in its section 2. Corrected in this change, since it is the same
registry entry being edited.

**N-08 — `validation/trainer-domain.mjs`'s own header is stale — LOW, RAISED NOT FIXED.** It
describes "3,000 random unbounded non-negative points" and "exactly one flagged case -- sfc = 0
giving a cruise fuel of 0.00 lb". The harness runs 150 declared extremes plus 3,000 interior plus
3,000 stretched points (6,150 tried, as it prints), and its check requires **zero** flagged cases
and passes. Not fixed here deliberately: it is CHG-006's evidence file, and editing it inside
CHG-007 would blur which change is answerable for that harness. One-line correction, holder's call.

**N-09 — a zero-payload business jet returns a gross weight of 0 lb — LOW, RAISED.** With
`passengersCarried: 0` and the bizjet default cargo of 0 lb, the loop runs away and returns
`grossLb: 0` with `converged: false` and a stopReason. That is the honest F-R01 behaviour rather
than the F-02 one — nothing is certified — and it is measured **identical at `d928971` and with
this guard in place**, so the guard does not cause it. Pinned by the new harness so it cannot
quietly become a published zero-weight design.

---

## CHG-008 — The final reserve is as long as the input says

**Closes:** F-03 (HIGH)
**Files:** `src/classes/transport/mission.js`, `src/classes/transport/size.js`,
`src/classes/transport/defaults.js`, `src/classes/bizjet/defaults.js`,
`src/classes/aircraft/input-deck.js`, `validation/transport-mission.mjs`, `VALIDATION.md`
**Baseline:** `d053dcc`

### BEFORE

`mission.js` hardcoded the final-reserve duration in all three of its branches — `45` for
`us-domestic`, `30` for `nbaa`, `30` for everything else — and `size.js:277-280` built the mission
object without `reserveMin` at all. Sizing a transport at each policy, the input moved nothing:

| policy | `reserveMin` 30 | 45 | 90 | 600 |
|---|---|---|---|---|
| us-domestic | 173,724 | 173,724 | 173,724 | 173,724 |
| us-flag | 176,256 | 176,256 | 176,256 | 176,256 |
| easa | 173,564 | 173,564 | 173,564 | 173,564 |
| nbaa | 171,493 | 171,493 | 171,493 | 171,493 |

A 0 → 600 minute swing moved the design by **0.00 %** under every policy, while `alternateNm` did
work, which is what made the inertia hard to notice.

### THE REGISTER'S FRAMING WAS WRONG, AND THE MEASUREMENT WAS RIGHT

F-03 quoted the codebase against itself — *"A control that cannot change the design must not sit on
the design panel"* (`engine.js:350`). Reproducing it showed that the control **was not on the
panel**: `input-deck.js:33` read `reserveMin: (p) => p.fuelMethod === "regulatory"`, so the jet
decks showed it only under the one method where it already worked, and the default is `mission`.
The finding measured the engine and not the deck.

That is worth stating plainly, because the deck's gating is how the defect survived: the finding's
own words were satisfied by HIDING the control rather than by connecting it. The turboprop deck
(`when: {}`) shows `reserveMin` unconditionally and honours it at `turboprop/size.js:141`, so only
the jets were affected. **Holder's decision: honour the input.** FINDINGS.md now carries this
correction beside F-03, as F-01 carries its own.

### AFTER

`reserveMin` is the final-reserve duration in all three branches. A caller that passes none flies
its policy's own regulatory figure, now declared once in `FINAL_RESERVE_MIN`:

| policy | minutes | source |
|---|---|---|
| us-domestic | 45 | 14 CFR 121.639(c), at normal cruising fuel consumption |
| us-flag | 30 | 14 CFR 121.645(b), hold at 1,500 ft |
| easa | 30 | EASA AMC/GM Part-CAT, hold at 1,500 ft |
| nbaa | 30 | 30 min hold at 5,000 ft (secondary sources only) |

The fallback is what keeps every existing caller unmoved — `validation/transport-mission.mjs` and
`transport-aero.mjs` build their own mission objects and pass no duration — and it is asserted
policy by policy rather than assumed. `m.reserveMin == null` is tested rather than
`Number.isFinite(Number(...))`, because `Number(null)` is 0 and a caller that passes null means
"not given", not "no reserve". That was a real failing check before it was a comment.

`reserveMin` is now shown on the jet decks under **both** methods that fly it, and still hidden
under `loftin`, which carries its reserves as a range increment through `reserveIncrementNm`. Its
label drops "at cruise consumption", which was only ever true of the `us-domestic` branch; the
turboprop keeps that label because its reserve really is a cruise-consumption loiter.

### THE BUSINESS JET WAS FLYING THE WRONG REGULATION, INVISIBLY

`BIZJET_DEFAULTS` selects `reservePolicy: "nbaa"` — whose final reserve is a 30-minute hold, per
its own sourced note — while inheriting the transport schema's `reserveMin: 45`, which is
14 CFR 121.639(c) for a domestic airliner. The contradiction could not show while the input was
inert. Honouring it moved the business jet from 27,663.7 to **27,953.8 lb (+1.05 %)**, which is the
defect surfacing, not the fix causing one. `BIZJET_DEFAULTS.reserveMin` is now **30**, with the
NBAA source, and the sized business jet is back to **27,663.7 lb exactly**.

### NUMBERS MOVED

**The transport default does not move.** Its policy is `us-domestic` and its `reserveMin` is 45, so
45 → 45: 173,724.4 lb before and after, and naming `reserveMin: 45` explicitly reproduces it. The
business jet does not move either, once its default is corrected to the figure its own policy is
defined by. What moves is every run that sets a non-default `reserveMin` or a non-default policy —
which is the entire point, and which moved 0.00 % before.

### EVIDENCE — 26 new checks, 9 mutants, 9 killed

`validation/transport-mission.mjs` goes from 44 to **70 checks**: the input governs in all four
policies, zero minutes burns no reserve fuel, a longer reserve leaves the TRIP fuel bit-identical
while raising the total, each policy's omitted-duration fallback equals its explicit one, the
design now moves monotonically over 0 → 600 minutes, and the deck shows the control under both
methods that fly it. Mutants: hardcode each of the three branches back (3), drop the pass-through
from `size.js`, change the us-domestic fallback to 30, remove the fallback entirely, restore the
`Number(null)` bug, put the business jet back to 45 minutes, and hide the control under `mission`
again. All killed.

---

## CHG-009 — The landing gear is a choice the user makes, and it defaults to what the source says

**Closes:** F-09 (HIGH)
**Files:** `src/lib/defaults.js`, `src/App.jsx`, `src/lib/provenance.js`,
`validation/gear-drag.mjs` (new), `validation/report.mjs`, `package.json`, `VALIDATION.md`
**Baseline:** `32d8822`

### BEFORE

`DEFAULT_PARAMS` had no `gearType`. `engine/drag.js:56` reads `p.gearType || "fixed"`, so every run
landed on FIXED gear at CD0 0.015 — the largest single parasite-drag term — while `engine.js`
states the opposite a few lines away: *"eVTOL with retractable/folding gear uses CD0g ≈ 0.003 …
Winged lift+cruise eVTOL (Joby, Archer) use folding/retractable gear → 0.003"*.

Two defects in one, needing different fixes: the value disagreed with the class's own sourced
comment, and nothing on the panel said a choice was being made at all.

| gearType | CD0gear | CD0tot | L/D | MTOW |
|---|---|---|---|---|
| fixed (the old default) | 0.015 | 0.043806 | 9.69 | 2795.68 kg |
| **retractable (now)** | 0.003 | 0.033421 | 11.86 | **2469.91 kg** |
| faired | 0.001 | 0.032360 | 12.14 | 2312.92 kg |

Gear was **34.2 %** of the old default's parasite drag. **Note the re-measurement**: F-09 was
raised before CHG-005, and its `CD0tot` figures moved with the viscosity constant. The register now
carries both, and one of them was quoted wrongly in a first draft of this record — the retractable
`CD0tot` is 0.033421, not the pre-CHG-005 0.032915.

### AFTER

`gearType` is an input, on the Aerodynamics panel, defaulting to `retractable`. `drag.js` keeps its
`|| "fixed"` fallback: for an unknown aircraft that is the conservative assumption and the right
answer, and the harness pins it so it cannot drift into the new default and silently give every
external caller 24 % less parasite drag. An unrecognised gear NAME still falls to fixed rather than
to the cheapest value.

### THE GAIN IS NET OF THE MECHANISM, AND THAT IS MEASURED

`weights.js:322` applies a 1.1437 factor to the **AFDD84 fuselage** weight when the gear retracts —
the airframe provisions the bay and its attachments, which is where NDARC books that cost, not in
the gear group. The first version of this harness tested the gear group and failed, correctly.

The prediction is sharp. AFDD84 scales fuselage mass as `Wdg^0.4879 × (Nz·WSD)^0.2075`, with `Nz`
and the fuselage geometry identical between the two runs because they are inputs. An aircraft
11.65 % lighter should therefore carry a fuselage **0.91745** of the fixed one's *without* the
factor, and **1.04929** with it. Measured: **1.04929**, an implied factor of **1.14370** against
the declared 1.1437.

So the retractable design's fuselage is **heavier in absolute terms — 268.30 kg against
255.69 kg — on an aircraft 325.8 kg lighter.** Nothing but the charged factor produces that
combination.

### NUMBERS MOVED

The default eVTOL is **2795.68 → 2469.91 kg, −11.65 %**, with L/D 9.69 → 11.86. This is a DEFAULT
moving, not the physics: asking for `gearType: "fixed"` reproduces the old aircraft to the last
kilogram, and the harness pins that. The golden master does not move, for a reason worth recording
separately — see N-10.

### WHAT THE GATE CAUGHT, AND WHY EACH PIN MOVED

The first full-gate run FAILED three harnesses. All three are the default aircraft moving, and
none was re-baselined without a reason:

**`round1-seed.mjs` — two failures, and the second is the interesting one.** The `MTOW` pin moved
2795.68 → 2469.91 kg, and the note beside it records why, as F-04's did. **`MTOW1` and `itersR1`
did not move**, which is what makes updating the pin safe rather than merely convenient: Round 1's
recurrence holds no drag term at all, so a purely parasite-drag change must leave them alone, and
it did.

The second failure was `mtowFromR1Seed is not a duplicate of r2Diverged` — an INDEPENDENCE check,
asserting the case set contains at least one case where the two flags differ. The separating case
was `range=240`, chosen because it was the only one a user could reach. The better aircraft simply
CLOSES that mission, so both flags went false together and the separation was lost. The case had
been silently relying on the fixed-gear default this change removes: written when `gearType` did
not exist, "range = 240" meant "240 km on a fixed-gear aircraft" without saying so. It is now
`{ range: 240, gearType: "fixed" }` — the aeroplane the case was always about, stated — and it
diverges exactly as before. Both controls are user-reachable, so the case keeps the property it was
chosen for. Separation on retractable gear needs 325 km or more, outside the slider, which would
have cost that property.

**`aircraft-classes.mjs`** — the `DEFAULT_PARAMS` content hash, which exists to make any change to
the defaults deliberate. Updated with its note, following the file's own convention.

**`render-freeze.mjs` — 7 of 27 views.** The harness says to look at the new render before
deciding, so it was looked at, and then measured rather than inferred from the picture. All seven
are MISSION-PROFILE views; no vehicle geometry view moved. The drawn descent is longer and
shallower, and that is the glide angle following L/D: `descentAngleUsedDeg` 5.890 → 4.820 and
`descentRunM` 9,542 → 11,682 m, against `arctan(1/9.69) = 5.894°` and `arctan(1/11.86) = 4.821°`.
The drawing is tracking the physics exactly. Re-recorded; exactly those seven files changed.

### EVIDENCE — 29 checks, 8 mutants, 8 killed

`validation/gear-drag.mjs`, registered in both runners. Mutants: remove the default entirely,
default to fixed, default to faired, change the fallback to retractable, let an unknown name take
the cheapest value, drift the Raymer coefficient, remove the fuselage retraction penalty, and
remove the control from the panel. All killed.

### NEW FINDING RAISED

**N-10 — the golden master's "app-default" case is not the app's default — MEDIUM, RAISED NOT
FIXED.** `validation/golden-master.mjs:49` defines its own `BASE` literal and names the first case
`app-default`. It is a hand-maintained copy that has drifted from `DEFAULT_PARAMS`: of
`DEFAULT_PARAMS`' 51 keys it shares 26, **19 are absent** (including `configType`, `weightModel`,
`rotorControl`, `wingLoadingNm2`, `vtolCategory` and now `gearType`) and **7 of the shared ones
disagree** — `range` 190 vs 100 km, `LD` 14 vs 8.5, `nPropHover` 6 vs 12, `propDiam` 3.0 vs 2.37 m,
`etaHov` 0.70 vs 0.74, `fusLen` 7.2 vs 8.6 m. Sized, `BASE` gives **4476.9 kg** against the real
default's **2469.9 kg**, an 81 % difference.

This is the exact defect `DEFAULT_PARAMS`' own header records for the "Reset to defaults" button —
a second hand-maintained copy of the defaults, drifted — reappearing in the regression harness. It
is also why this change moved no golden-master case.

**What it is NOT**: the suite is not blind to gear. `golden-master.mjs:131` assigns `gearType`
randomly across its 240 sweep cases, so all three values are exercised — those cases set the key
explicitly, which is why changing the DEFAULT correctly moves none of them. The defect is the
`app-default` case's name and drift, not gear coverage. Raised rather than fixed because pointing
the regression net at `DEFAULT_PARAMS` re-baselines the snapshot, which is its own change and its
own holder decision.

---

## CHG-010 — The two registered harnesses that could not report a regression

**AUTHORISED** by the holder as the first of four streams, in answer to the standing question
"are the verification-infrastructure defects in remit?".

### BEFORE

Two entries in `npm test` could not tell anyone that anything had broken, for opposite reasons.

`validation/components.mjs` held **516 lines, 0 `process.exit`, 0 `throw`, 0 `check(`**. It
printed component-level measurements against NASA/TM-20210017971 Table 12 and always succeeded.
It therefore counted toward a green run while providing none of the coverage its registration
implied.

`validation/fuselage-pressure.mjs:219` read the research corpus from **outside the repository**
with no guard:

```js
check(readFileSync("../eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt", "utf8")
        .includes("multiplied by a factor of 1.33"), ...)
```

`npm test` is a single `&&` chain and this harness sits at **position 63 of 117**, so on a
checkout without the corpus beside it the throw took the **54 harnesses downstream** with it.
The path was also resolved against the working directory rather than the file, so it depended on
where node was launched.

### AFTER

`components.mjs` carries **26 checks**. Every one pins a claim the file **already made in prose** —
that is the entire selection rule. The file narrates conclusions ("the group is tens of kg, not
hundreds"; "THE FLAGGED MISMATCH RESOLVES THE OTHER WAY"; "B implies a negative electrical
group"), and a conclusion kept beside the code that produced it drifts from it unless something
enforces the pair. No new physics is measured and no threshold is invented beyond the margin each
narrated claim already carries: where the claim is an order of magnitude, so is the bound.

`fuselage-pressure.mjs` now follows the policy `citations.mjs` had already set for this exact
situation — *"THE CORPUS IS OPTIONAL ... when absent the gate says so loudly and still enforces
the denylist, rather than passing in silence."* The corpus proves the REGULATION says 1.33; a new
check proves the CODE agrees with it, so the pair is only ever weakened by one link, never
silently. 71 → **72 checks**.

### WHY

A harness that cannot fail is worse than no harness: it consumes a slot in the runner, appears in
the report, and buys confidence it cannot supply. `MASTER-COMPLETENESS-REPORT.md` records 26 of
960 requirements as regression-protected, and a harness that cannot fail inflates even that.

**What is deliberately NOT asserted**: that the DEFAULT motor model scores best. It does not —
`emraxTorque` measures MAE **42.8 %** against `specificPower`'s **16.8 %** — and the file explains
why at length (the four are reference classes fitted to different populations; the motor+drive
gap is a design-point difference in the hover load factor, not model error). Pinning the
flattering thing would have been asserting an expectation instead of the data.

### EVIDENCE

| | |
|---|---|
| `components.mjs` | 26 checks, **11/11 mutants** |
| `fuselage-pressure.mjs` | 72 checks (was 71), **3/3 mutants** |
| full gate | `TEST_EXIT=0` `REPORT_EXIT=0` `CHECK_EXIT=0` |
| suite | 117 chained commands, 116 distinct harnesses, **2,811 PASS, 0 FAIL** |
| engine values moved | **none** — no `src/` file is touched by this change |

Each mutant names the check it must kill, so a mutant that merely turns a gate red without
killing its named check is reported as SURVIVED. **M5 earns its place**: it holds the calibrated
total at 0.0196 and changes only the 2:1 split, leaving the printed systems table bit-identical,
so only the ratio check can catch it. One mutant survived on its first run and **the mutant was
at fault, not the check** — 57.72 is the AFDD83 branch, not the default AFDD00 path the table's
own header names; retargeted to 95.7634 it kills.

### N-11 — the component harness's own narration had gone stale — LOW — RAISED AND CLOSED HERE

Found by the new checks **on their first run**, which is the argument for having written them.

The first version of the systems check restated the two constants the prose names — 3.0 % and
1.5 % of MTOW — and **failed**:

```
FAIL  electrical and ECS are the 3.0% and 1.5% of MTOW the text names
      — electricalFrac 0.0131, ecsAntiIceFrac 0.0065
```

**The code is right and deliberate.** `weights.js:103-104` record them as *"[CAL] 2/3 of the
1.96 % backed out of Table 12"* and *"[CAL] 1/3 — split [LAY], total is what is calibrated"*, and
the printed systems table is self-consistent with those values (Quad-E: 92.5 + 90 + 38.5 + 19.1 =
240.1 kg, the −1.2 % row). What was wrong is the **narration in `components.mjs`**, which still
quoted the pre-calibration figures in two places, including a "~89 kg" electrical figure that is
`electricalFrac × 2939.3 kg` at the old 3.0 %. Both sentences are corrected and say that they were.

The check was the wrong **shape** as well as stale. The constants are pinned by a declared
derivation, so it now asserts the calibrated **total** and the chosen **ratio** — which survive a
re-calibration and still die if one term moves without the other. Restating digits would have
passed for the wrong reason after any legitimate re-fit.

This is the third instance in this repository of the same pattern, and it is now the argument for
keeping records next to what they record: N-07 (a stale harness description), N-10 (a drifted
`BASE`), and now N-11.

---

## Summary of PASS B so far

| | |
|---|---|
| CRITICAL findings closed | **2 of 2** (F-R01, F-R02) |
| HIGH findings closed | **6** (F-01, F-04, F-05, F-02, F-03, F-09) + N-06, raised and closed in PASS B |
| engineering equations changed | **0** |
| numeric outputs moved | CHG-001..004 and CHG-007 moved **0**. CHG-005 moves numbers DELIBERATELY: 183 of 277 golden cases, median MTOW +1.13 %, every change class traced to the corrected constant |
| new harness checks | 42 + 40 + 3 + 19 + 35 + 26 + 29 + 27 = **221**, with 26-check, 5-, 5-, 5-, 9-, 9-, 8-, 11- and 3-mutant evidence |
| new findings raised BY remediation | **11** (N-01..N-11); N-04 closed by CHG-005, N-06 and N-07 by CHG-007, N-11 by CHG-010 |
| register prescriptions found to be wrong | **2** (F-01's one-liner is a measured no-op; F-03's "a control that cannot change the design must not sit on the design panel" is contradicted by `input-deck.js:33`, which shows `reserveMin` only under the one method that uses it) |
| gaps deliberately left open and stated | 2 (evaluation at 305 m / ISA SL; `MTOW = null` on a loop that never produced one) |

**The authorised order is complete.** F-01, F-02, F-03, F-04, F-05, F-09 and both CRITICALs are
closed, and N-06 was found and closed on the way. What is left is not a queue but a set of holder
decisions, listed in the park file. TWO HAVE SINCE BEEN ANSWERED: `AUDIT/` was committed
(`c3923ef`), and the verification-infrastructure defects were ruled IN REMIT, of which
CHG-010 closes the first two (`components.mjs` cannot fail, `fuselage-pressure.mjs` breaks a
clean checkout). Still open from that group: the blind freshness gate, `GATE_MAE = 40`, N-05;
whether N-02 gets the same sign discipline the classes now have, which needs a published schema
`DEFAULT_PARAMS` does not have; and N-08, N-09 and N-10 above.

The remaining register items are F-06 through F-08 and F-10 through F-37, none of which have been
authorised for remediation.

**F-09** — the holder's call is to EXPOSE `gearType` in `DEFAULT_PARAMS` and on the eVTOL panel,
defaulting to `retractable` per `engine.js:1714-1716` and Raymer T12.6. Re-measured after CHG-005:
the default (fixed, 0.015) gives CD0tot 0.043806 and MTOW 2,795.68 kg; retractable gives 0.032915
and **2,469.91 kg, −11.65 %**, already paying the 1.1437 retraction weight factor at
`weights.js:322`. The golden master re-baselines.
