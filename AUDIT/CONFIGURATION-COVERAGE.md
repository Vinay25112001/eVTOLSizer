# CONFIGURATION COVERAGE — second-order audit

Every configuration the repository actually supports, enumerated from source, with coverage
determined by reading `validation/**` and the golden-master snapshot. **Shared code is not
treated as evidence of coverage.**

All snapshot statistics below were re-derived directly from
`validation/golden-master.snapshot.json` in this session, not taken from any prior document.

---

## 1. Configuration axes found in source (11 axes, ~50 switchable values)

| Axis | Values | Defined at |
|---|---|---|
| Design mode | `evtol`, `aircraft`, `drone` | `src/classes/aircraft/DesignModeSwitch.jsx:36-38` |
| eVTOL layout (`configType`) | `liftcruise`, `hybrid`, `hybridPusher`, `tiltrotor`, `multicopter`, `sideBySide` | `src/engine/configuration.js:45-125`; per-config numerics `:652-756` |
| Aircraft class | `evtol`, `trainer`, `transport`, `bizjet`, `turboprop` | `src/classes/registry.js:41-94` |
| Drone frame class | `QUAD, HEXA, OCTA, OCTAQUAD, Y6, TRI, DODECAHEXA, DECA` | `src/classes/drone/autopilot.js:123-126` |
| Drone frame type | 14 enum symbols | `src/classes/drone/autopilot.js:130-134` |
| Powertrain | `battery`, `turboelectric` | `src/App.jsx:1601-1608`; `src/engine/turboelectric.js` |
| Mission basis | `certification`, `marketing` | `src/engine/mission.js:34-81` |
| Reference mission | `multicopter, multicopterNASA, sideBySide, winged` | `src/engine/mission.js:133-171` |
| Weight model | `fraction`, `buildup` | `src/lib/defaults.js:261` |
| VTOL category | `enhanced`, `basic` | `src/engine/avionics.js:77,80` |
| Landing gear | `fixed`, `retractable`, `faired` | `src/engine/drag.js:39,56-57` |

---

## 2. Golden-master snapshot composition — MEASURED

277 cases, **114 diverged (41.2 %)**. `configType` distribution, counted directly:

| configType | cases |
|---|---|
| hybridPusher | 55 |
| liftcruise | 53 |
| multicopter | 46 |
| sideBySide | 45 |
| hybrid | 42 |
| tiltrotor | 36 |

**The snapshot exercises the eVTOL engine path and nothing else.** Substring search over the
whole JSON returns **false** for `trainer`, `transport`, `bizjet`, `drone`, `QUAD`, `HEXA`.
Weight models: `fraction` 146 (55 diverged), `buildup` 131 (59 diverged).

`missionBasisLabel` distribution: **163 × `"custom (parameters as given)"`, 114 × absent**
(the diverged cases drop it). **No snapshot case exercises either named mission basis.**

---

## 3. CONFIGURATIONS WITH MISSING COVERAGE

1. **Drone `TRI`** — `autopilot.js:124`. Enum entry only. `grep` for a `TRI` entry in
   `src/data/drone-frames.js` `FRAMES` returns **0**. No data, no harness, no snapshot.
2. **Drone `Y6`** — `autopilot.js:124`. Same: **0** `FRAMES` entries, no harness.
3. **`missionBasis: "certification"`** — `mission.js:35`. This is the PRIMARY sizing basis, and
   **the string `missionBasis` occurs exactly ONCE in the whole of `validation/`**
   (`total-range.mjs:50`), where it sets `"marketing"`. The certification basis is never set by
   name by any harness, and no golden case carries it.
4. **Aircraft classes and all drone frame classes are absent from the regression snapshot.**
   trainer / transport / bizjet / turboprop each have only a small dispatch-identity harness
   (e.g. `trainer.mjs:92-93`). There is no equivalent of the 277-case sweep that protects the
   eVTOL layouts. `golden-master.mjs:75-85` documents that exact class of gap being found and
   closed *for the eVTOL layouts*; it was never closed for the other four classes or for drones.
5. **Turboelectric on non-`liftcruise` layouts.** `turboelectric.mjs:49` validates turboelectric
   only against the liftcruise reference vehicle, while the UI permits it with all six layouts.
   `result-warnings.mjs:108` states this in the product itself: *"a turboelectric hybrid is
   outside the validated domain (only a turboelectric lift+cruise was compared)"*.
6. **Exact slider-boundary values are never tested.** Every sweep draws a random INTERIOR point
   via `lo + rnd()*(hi-lo)` (`identities.mjs:41,60`; `identity-sweep.js:26-31`). No harness pins
   the literal min or max of any slider. The audit prompt requires boundary coverage explicitly.
7. **Six drone frame-type strings present in real data are outside the `FRAME_TYPE` enum**
   (`PLUSREV, NYT_PLUS, NYT_X, X_COR, CW_X_COR, X/CW_X` in `src/data/drone-frames.js`), so
   autopilot-parameter export refuses them at `autopilot.js:295`. A deliberate refusal, recorded
   here because it is a real capability gap, not a silent one.

---

## 4. Code-path coverage

| Path | Evidence | Verdict |
|---|---|---|
| Normal sizing | golden-master `app-default`; most harnesses | COVERED |
| Alternate propulsion (turboelectric) | `turboelectric.mjs:49` | PARTIAL — liftcruise only |
| Alternate mission (`missionBasis`) | `total-range.mjs:50` (marketing only) | PARTIAL — certification NEVER named |
| Multi-hop mission | grep `multiHop`/`multi-hop` across `src/` + `validation/` → **0 matches** | FEATURE ABSENT |
| Invalid input — negative | `round1-seed.mjs` (`range: -5000`) | COVERED (added by F-01) |
| Invalid input — zero | `round1-seed.mjs` (`vCruise: 0`) | COVERED (added by F-01) |
| Convergence failure | `round1-seed.mjs` §2–5; `golden-master.mjs:157-164` | COVERED (added by F-01) |
| Boundary values | random interior sweeps only | **NOT COVERED** |
| Warning generation | `result-warnings.mjs` | COVERED |
| SI units | `units.mjs:41` | COVERED |
| Imperial units | `units.mjs:61,77` | COVERED |
| Unit round-trips | `units.mjs:71` | COVERED |
| CPACS export | `cpacs-export.mjs` (schema-validates vs vendored CPACS 3.5.1 XSD) | COVERED |
| VSP export | `vsp-models.mjs`, `vsp-run.mjs`, `vspaero.mjs` | COVERED |
| Report export | exercised via `load-factor-source.mjs`, `release.mjs` | COVERED |
| Design-file round trip | `design-file.mjs` | COVERED |
| Analysis layers | `analysis-layers.mjs` | COVERED |
| Sizing loop Round 1 | `round1-seed.mjs` | COVERED (added by F-01) |
| Sizing loop Round 2 | `round1-seed.mjs`; `golden-master.mjs:157` | COVERED |

---

## 5. State leakage

**No cross-configuration leakage found.** The only module-level mutable state in
`src/engine/**` and `src/classes/**` is five lazily-memoised `let` singletons
(`bizjet/warnings.js:14`, `trainer/warnings.js:16`, `transport/warnings.js:12`,
`turboprop/warnings.js:13`, `drone/risk.js:73`). Each caches a FIXED, class-invariant table that
does not depend on user parameters. `engine/pipeline.js:31` builds its accumulator
function-locally per call.

---

## 6. Counts

| | |
|---|---|
| Configuration axes | 11 |
| Distinct switchable values | ~50 |
| eVTOL layouts with a named harness | 6 / 6 |
| Aircraft classes with a named harness | 5 / 5 (dispatch-identity only) |
| Drone frame classes with a named harness | 6 / 8 (`TRI`, `Y6` have none) |
| Configurations present in the golden master | **6 of ~50** (eVTOL layouts only) |
| Configurations with NO coverage at all | **2** (`TRI`, `Y6`) + `missionBasis:"certification"` unnamed |
