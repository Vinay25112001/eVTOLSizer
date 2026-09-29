# SKIPPED / DISABLED / NON-DETECTING TESTS — second-order audit

Everything that is present but does not actually assert, plus the GREEN-gate forensics.
Every item below was verified by direct file read in this session.

---

## 1. Registered harnesses that CANNOT FAIL

| File | Registered? | `process.exit` | `throw` | `check(` | Consequence |
|---|---|---|---|---|---|
| **`validation/components.mjs`** | **YES** | **0** | **0** | **0** | Verified by direct count. `report.mjs:48` calls it *"the only harness that can separate a bad model from a bad loop"*. It scores rotor/systems/drive/motor/nacelle weight models against NASA Table 12 and **prints the result with `console.log`**. A regression making every component model wildly wrong would print worse percentages and the gate would still exit 0. It counts toward "all green". |

Six further zero-exit files are data/reporting modules, not gate entries, and their lack of an exit
path is benign: `calibrate.mjs`, `sensitivity.mjs`, `identity-sweep.js`, `nasa-table3.js`,
`nasa-vehicles.js`, `reference-aircraft.js`.

## 2. Harnesses that are GREEN BY DEFAULT, not green by passing

| File:line | Mechanism |
|---|---|
| `validation/vsp-run.mjs:109` | `process.exit(0)` when `OPENVSP_EXE` is not found — which its own header says is the normal state ("OpenVSP is not a dependency of this project"). In ordinary CI **not one assertion executes**. |
| `validation/vspaero.mjs:92` | Same. |
| `validation/citations.mjs:191-194` | Prints `PASS (LIMITED)` and exits 0 when the external corpus is absent. Even when present, an "UNCONFIRMED" citation never fails — only entries on a hand-maintained `FABRICATED` denylist do (`:246-256`). |
| `validation/aircraft-classes.mjs:211,213` | The "change fence" prints `SKIP` and runs no check when there is no git history **or when `HEAD` is `master`** — i.e. inert on the very branch it claims to guard. |

## 3. Tools that exist and are never run

| File | Status |
|---|---|
| **`validation/sensitivity.mjs`** | On disk, **in NEITHER runner**. Phase 17 (SENSITIVITY / MONOTONICITY AUDIT) requires a sensitivity report; the tool for it exists and is never executed. |
| **`validation/ui-audit.mjs`** | On disk, **in NEITHER runner**. Phase 26 is the UI / ENGINEERING TRUTH AUDIT. |
| `validation/calibrate.mjs` | On disk, in neither runner. |

## 4. Hollow and tautological assertions

| File:line | Assertion | Verdict |
|---|---|---|
| `validation/battery-binding.mjs:118` | `check(true, "the reserve's effect on the binding constraint is measured", …)` | **Unconditionally true** regardless of what the surrounding logic computed. Verified. |
| `validation/economics.mjs:112-116` | `const a = seatCount(pay), b = seatCount(pay); if (a !== b) disagree++;` | **Cannot ever fire** — same pure function, same input. Verified. |
| `validation/vertical-cg.mjs:152` | `l.eM < l.zCgM + 1e9` | Slack so large the comparison cannot fail. |
| `validation/drone-avionics.mjs:218-222` | `const c = cands.find(x => x.massNote); return !c || (…)` | Passes vacuously if no catalogue entry has `massNote` — can go silently inert on a data change. |
| `validation/drone-trade.mjs:129,137` | `front.length === 1 || …` | Vacuous-pass guards (honestly labelled). |

Three further `check(true, …)` instances (`gear-geometry.mjs:250`, `general-arrangement.mjs:163`,
`vertical-cg.mjs:114`) are legitimate "N/A for this class" skip markers, not disguised checks.

## 5. GREEN GATE FORENSICS

**Reconstructed from `package.json` and `validation/report.mjs`.**

- `npm test` — **114 invocations, `&&`-chained, FAIL-FAST.** A failure at position *N* prevents every
  later harness from running.
- `npm run report` — executes its own hard-coded `HARNESSES` array (**69** entries) via
  `execFileSync` in try/catch. **Not** fail-fast.
- `npm run report:check` — regenerates the report and byte-compares against `VALIDATION.md`.

**Runner mismatch, computed by diffing the two lists:**
- **45 harnesses run in `npm test` but appear in neither `report.mjs` nor `VALIDATION.md`.**
- **1 harness — `general-arrangement.mjs` — is in `HARNESSES` but is not invoked by `npm test` at all.**
- **4 files on disk are in neither runner** (`calibrate`, `sensitivity`, `ui-audit`, plus the
  `report.mjs` orchestrator itself).

**The fail-fast landmine.** `validation/fuselage-pressure.mjs:219`:

```js
check(readFileSync("../eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt", "utf8")
        .includes("multiplied by a factor of 1.33"), …)
```

A bare CWD-relative path resolving **outside the repository**, with **no `existsSync` guard and no
try/catch** (verified: the file contains neither). The corpus is **not git-tracked** — `git ls-files`
returns 0 matches. This harness sits at **position 60 of 114** in the fail-fast chain, *ahead of*
`nasa-configs.mjs` (98, "THE PRIMARY VALIDATION"), `validate.mjs` (110, the accuracy gate),
`render-freeze.mjs` (111), `paper-claims.mjs` (112) and `release.mjs` (114). On any checkout without
that sibling directory — **including GitHub Actions, whose workflow checks out only this repo** —
it throws `ENOENT` and **54 downstream harnesses never run.** By contrast `citations.mjs` and
`load-factor-source.mjs` reference the same corpus and guard it with `existsSync`.

**`report:check` cannot detect a stale commit or a dirty tree.** `report.mjs:553-554`:

```js
.replace(/"commit":"[0-9a-f]{7,40}"/g, '"commit":"<sha>"')
.replace(/"dirty":(?:true|false)/g, '"dirty":<dirty>')
```

The commit SHA and the dirty flag are normalised to placeholders *before* the byte comparison.
`CHECK_EXIT=0` is therefore **not** provenance assurance. (Numeric harness output is still compared
verbatim, so this does not by itself hide a physics regression.)

**Adjustable accuracy thresholds in the same file as the physics they gate:**

| File:line | Threshold | Tolerated error |
|---|---|---|
| `validation/validate.mjs:565-566` | `GATE_MAE = 40`, `BASELINE_MAE = 37.4` | **40 % mean absolute error** against real aircraft |
| `validation/nasa-configs.mjs:609-614` | `MEAN_MAX = 14.6  // measured 14.5 - RAISED from 12.1`, `WORST_MAX = 50.0` | **50 % worst single metric** |

`nasa-configs.mjs`'s own comment narrates the ratchet moving twice in one day: *"a ratchet moved
twice is a ratchet nobody is holding."* Nothing in the gate prevents a commit from widening these
in the same diff as a regression; the only defence is a commit-message convention.

**Environment switches CI does not set:** `EVTOL_STRICT`, `EVTOL_TW_DERIVED`,
`EVTOL_PRICE_TRANSIENT`. Without `EVTOL_STRICT`, `validate.mjs:321-323` excludes metrics whose
`conventionExplained` is true *before* computing the mean checked against `GATE_MAE`.

### VERDICT: **FALSE-SAFETY GATE**

A major physics error can survive while the gate stays GREEN, by three independent mechanisms:
1. `components.mjs` — the harness designed to isolate model-level defects **has no failure path at all**.
2. The two external-referent accuracy gates tolerate **40 % mean** and **50 % worst-case** error,
   with thresholds editable in the same commit as the regression.
3. `vsp-run.mjs` and `vspaero.mjs` pass without executing a single assertion in ordinary CI.
