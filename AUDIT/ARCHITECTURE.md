# ARCHITECTURE — as built, at commit `3a7a5a4`

Read-only discovery output (Phase 0). Every statement here was read from the code, not
inferred from naming. Where the code's own documentation and the code disagree, the code wins
and the disagreement is recorded as a finding in `FINDINGS.md`.

## Scale

| | count |
|---|---|
| tracked files | 464 |
| `src` | 84,909 LOC — 184 `.js`, 75 `.jsx` |
| `validation` | 29,146 LOC — 116 `.mjs` harnesses |
| `docs`, `paper`, `tools`, `exports` | 11 / 2 / 8 / 8 files |
| engine outputs classified in the provenance registry | 467 outputs, 89 inputs |

Largest modules: `src/data/drone-components.js` 4,562 · **`src/engine.js` 4,105** ·
`src/engine/geometry.js` 2,587 · **`src/App.jsx` 2,518** · `src/data/drone-propellers.js` 2,156 ·
`src/AuthSystem.jsx` 1,820 · `src/classes/drone/FlightPanel.jsx` 1,604.

`src/engine.js` and `src/App.jsx` together are 8 % of the tree and carry most of the findings.

## Top-level shape: three engines behind one shell

`src/main.jsx` → `src/classes/Root.jsx`, which selects one of **three design modes**, each with
its own engine, inputs and tabs:

| mode | component | engine | notes |
|---|---|---|---|
| `evtol` | `src/App.jsx` | `src/engine.js` `runSizing` | the original sizer |
| `aircraft` | `src/classes/aircraft/AircraftStudio.jsx` (lazy) | per-class, via `src/classes/registry.js` | fixed-wing types |
| `drone` | `src/classes/drone/DroneStudio.jsx` (lazy) | `src/classes/drone/sizing.js` | a separate mode because the eVTOL mass correlations are fitted from 620 kg up and a 2 kg quadcopter sits orders of magnitude below them |

**All three studios stay mounted simultaneously** once visited — `Root.jsx` switches with
`display: none`/`contents` rather than unmounting, so "switching back finds each design exactly
as it was left." This is deliberate and documented, and it is the state-contamination vector
Phase 19 targets. The engine layer was tested clean (`STATE-CONSISTENCY.md`, P-09); the React
layer is **UNVERIFIED** and needs a browser pass.

`AuthSessionProvider` and `UnitSystemProvider` wrap all three, so one session is one fact
rather than three copies.

## Configuration flow: the class registry

`src/classes/registry.js` is the single dispatch point. Five registered classes:

| id | label | defaults | sizing function | method lineage as cited |
|---|---|---|---|---|
| `evtol` | eVTOL | `DEFAULT_PARAMS` | `runSizing` | NASA UAM sizing mission; NDARC AFDD weights |
| `trainer` | Trainer (piston) | `TRAINER_DEFAULTS` | `sizeTrainer` | Loftin NASA RP-1060 matching; GASP NASA CR-152303 weights |
| `transport` | Transport (jet airliner) | `TRANSPORT_DEFAULTS` | `sizeTransport` | Loftin matching + fuel fraction; FLOPS NASA TM-2017-219627 via Aviary |
| `bizjet` | Business jet | `BIZJET_DEFAULTS` | **`sizeTransport`** | the jet-transport method with business-jet inputs |
| `turboprop` | Transport (turboprop) | `TURBOPROP_DEFAULTS` | `sizeTurboprop` | Scholz & Nita (2008) power matching; FLOPS airframe + GASP/Hamilton Standard propulsion |

Design properties of the registry, verified:
- one dispatch point, `sizeDesign({aircraftClass, params})` → `c.size(c.prepare(params))`;
- an unknown class **throws**, never silently falls back to eVTOL (`classOf`), and the router
  renders an explicit `UnknownClass` page;
- the eVTOL entry is a thin adapter: its defaults **are** `DEFAULT_PARAMS` and its sizing
  function **is** `runSizing`, so adding classes cannot move an eVTOL number.

Two structural notes for the audit:
1. **`bizjet` shares `sizeTransport`.** Any transport finding (F-03, F-15, F-20, F-21) applies
   to the business jet as well, and the bizjet `prepare` strips four `analysis*` keys.
2. **The drone is not in the registry.** It is a fourth path outside `sizeDesign`, so
   cross-class invariants enforced on the registry (`validation/aircraft-classes.mjs`) do not
   reach it.

## Data flow, eVTOL path

```
DEFAULT_PARAMS (src/lib/defaults.js)
      │
      ▼
engineInputs()  (src/lib/designfile.js:98-105)   ← "THE ONLY PLACE the total range is built";
      │                                            folds reserve distance into `range`
      │                                            (100 km → 161.104 km at defaults)
      ▼
runSizing(p)    (src/engine.js:4064)
      │  ├─ autoPositionWing ? solveWingPosition(p, runSizingCore)   (engine/wingPosition.js)
      │  └─ no wing ?         sanitiseWingless(runSizingCore(p))
      ▼
runSizingCore(p0)  (src/engine.js:240…)
      │  1. applyMissionBasis(p0)          engine/mission.js  — may set the sizing day
      │  2. applySizingDay(pM)             engine/atmosphere.js
      │  3. resolveConfiguration(p, n)     engine/configuration.js — layout resolved ONCE
      │  4. atmosphereSet(p)               engine/atmosphere.js — cruise / hover / field
      │  5. Round 1 seed loop              engine.js:495-505      (→ F-01)
      │  6. Round 2 master MTOW loop       engine.js:793-1634
      │       per iteration: wing sizing → drag build-up → L/D →
      │       segment powers → segment energies → battery →
      │       component weights → residual → fixed-point / secant / bisection
      │  7. post-loop reporting, charts, checks, provenance tagging
      ▼
SR (result object, ~467 registered outputs)
      │
      ├─ src/App.jsx  useMemo(:576) → tabs, tiles, charts, StatusBar
      ├─ src/export/report.js  generateReport(p, SR, …)   ← receives RAW p (→ F-06, F-07)
      └─ src/export/{vsp3,vspscript,cpacs,autopilot-*}.js
```

**The entry-path split (F-19).** `src/App.jsx:581` and `:843` go through `engineInputs`;
`src/App.jsx:1649` (`solveRotorDiameter`, the configuration dropdown) passes **raw UI params**.
The two paths size different aircraft — 2772.06 kg vs 2073.36 kg on the same defaults.

## Calculation flow inside the master loop

Order matters and is fixed. Per iteration, at the current `MTOW`:

1. **Atmosphere** — frozen before the loop; `muCr = viscosity(Tcr)` (→ F-04).
2. **Wing** — `S = max(W/(W/S)_design, W/(q·CL_cruise_max))` (`engine/wing.js:161`), then
   `b = sqrt(AR·S)`, `Cr`, `Ct`, MAC, `Ymac`, `Xac`, LE sweep. `CL = W/(q S)` (→ F-10).
3. **Drag build-up** — nine terms summed identically in the loop (`:878`), the report (`:1724`)
   and `dragComp` (`:2486`): wing, fuselage, tail, nacelle, rotor hub, stopped blade, landing
   gear (→ F-09), misc, plus induced. Booms absent (F-13 in `AERO-AUDIT.md`).
4. **L/D** — `LDact = CL/(CD0+CDi)`; `LDcruise_i = useTargetLD ? p.LD : LDact_i` (`:902`) — the
   loop uses the **computed** value; several charts do not (F-25).
5. **Segment powers** — hover by momentum theory (`:1017`), climb/cruise/descent/reserve as
   `(W/eta)(RoC + V/(L/D))` (`:1078-1105`).
6. **Segment energies** — `E = P·t/3600` (`:1166-1169`); reserve `max(time, 10 % of mission)`
   (`:1176`).
7. **Battery** — `WE` from energy, `WP` from power, `Wbat = max(WE, WP)` (`:1389-1390`).
8. **Weights** — `componentWeights()` (`engine/weights.js:202-754`), 17 groups, all inside
   `Wempty`; lagged `packSysPrev` / `WbatPrev` feed the next pass.
9. **Residual** — `mn = payload + Wempty + Wbat (+ Wfuel)`; converged when
   `|mn − MTOW| < 0.01·max(1,|MTOW|)·10^convTolExp`.
10. **Update** — relaxed fixed point → secant → bisection, with an 11,400 kg ceiling.

## Shared vs configuration-specific

**Shared by every class:** `src/engine/constants.js`, `src/engine/atmosphere.js`,
`src/lib/units.js`, `src/lib/provenance.js`, `src/ui/*`, the `AUDIT`-relevant
`fuselageWettedArea`, and `src/classes/aircraft/geometry.js`'s `FUSELAGE_CONVENTION` —
**including the unsourced tail-cone constants shared identically by all four aircraft classes**
(see `GEOMETRY-AUDIT.md`).

**Per class:** sizing loop, defaults, input list, validation aircraft, weight method
(NDARC AFDD for eVTOL, GASP for trainer, FLOPS for the three jets/turboprop).

**Deliberately duplicated, with the duplicate unaware of the original:** the atmosphere
(five implementations), hover power (five expressions), Oswald efficiency (three), CLmax
(four), Pa→psf (three). See `FINDINGS.md` cross-cutting observation 1.

## Unit regimes — there is no single canonical system

| regime | internal units | evidence |
|---|---|---|
| eVTOL engine, drone | strict SI (kg, m, s, N, Pa, K) | `src/engine/constants.js:43-77`, `src/classes/drone/sizing.js:80-90` |
| transport / turboprop / trainer / aircraft classes | **imperial internally** (lb, ft, ft², kt, °R), converted at module boundaries | `src/classes/transport/size.js:49`, `src/classes/trainer/performance.js:4`, `src/classes/transport/flops-aero.js:135` |
| display | **two mutually unaware toggles** | `src/lib/unit-system.jsx` (studios) vs `src/App.jsx:172` `useImperial` with its own factor table at `:420-443` |

`src/App.jsx` never references `useUnitSystem`, `convertDisplay` or `convertLabelled`. The
imperial↔SI boundary *inside* each module is clean and every conversion factor is accurate
(P-13); the failure is architectural, not arithmetic. Detail in `UNITS.md`.

## Rendering flow

`src/App.jsx` (eVTOL) holds `params` in state, derives `SR` in a `useMemo` over
`useDeferredValue(params)` (`:576-585`), and passes `SR` down to ~25 tabs and panels. Charts
are built either inside `engine.js` (the `R2`/trade sweeps, `:2400-2470`) or in the tab from
`SR` fields. Provenance chips (`src/ui/Provenance.jsx`) look each displayed key up in
`src/lib/provenance.js` and render an "unregistered" state for keys not in the registry —
honest by design, with the ledger caveat at F-30.

## Validation flow

Three runners, not one:

| runner | what it runs |
|---|---|
| `npm test` | 111 harnesses, chained with `&&` — a chain, so the first failure stops the rest |
| `npm run report` → `validation/report.mjs` | executes a **curated list of 67** (`HARNESSES`, `:41`) and writes `VALIDATION.md` from what each printed |
| `npm run report:check` | verifies the generated report matches the committed one |

116 harness files exist. `validation/general-arrangement.mjs` is in the report list but **not**
in `npm test` (F-31); `calibrate`, `report`, `sensitivity` and `ui-audit` are in neither (the
first three are tools). Cheap gates that run in about a minute are listed in
`VALIDATION.md`; the full gate takes ~22 minutes.

`validation/constants.mjs` is the tree's one-value-per-constant gate and currently bands
**two** constants (F-05). `validation/identities.mjs` holds 42 definitional identities and is
the closest thing to an independent recomputation path already in the repo — with the
structural blindness recorded at F-05.

## Source / provenance flow

`src/lib/provenance.js` classifies every engine input and output into five documented statuses
(`validated`, `sourced`, `calibrated`, `derived`, `unverified`) with a `src` or `note` per
entry. Census at `3a7a5a4`: 467 outputs — 16 validated, 141 sourced, 234 derived, 5 calibrated,
70 unverified, **1 `assumed`** (an undocumented sixth status, F-30) — and 89 inputs.
`validation/provenance-report.mjs`, `provenance-drift.mjs`, `citations.mjs` (F-32),
`unverified-leverage.mjs` and `unverified-triage.mjs` police it.

This subsystem is the tool's stated thesis and is, in the lead's assessment, the strongest
non-drone part of the codebase. Its weaknesses are at the edges: one status outside the legend,
one directory outside the citation gate, and several comments that have gone stale against the
code beneath them.
