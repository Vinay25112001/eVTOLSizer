# STATE / CACHE / CONFIGURATION CROSS-CONTAMINATION (Phase 19)

Commit `3a7a5a4`.

## Engine layer — PASS, lead-verified

Method: ran `sizeDesign` for all five registered classes at their own defaults to obtain clean
baselines; then the round trip **evtol -> trainer -> transport -> bizjet -> turboprop -> evtol**;
then, for each class, a full round trip through every other class before re-running it. Every
numeric leaf of the result tree was compared (evtol **5,807** leaves, trainer 133, transport 435,
bizjet 454, turboprop 164).

| test | result |
|---|---|
| A -> B -> C -> D -> E -> A, compare A against a clean A | **IDENTICAL**, 0 differing leaves |
| every class after a full round trip through all classes | **IDENTICAL** for all five, 0 differing leaves |

## Mechanism check — why it passes

The only module-scope mutable state in `src/engine*`, `src/classes/*/*.js` and `src/lib/*.js`:

| file:line | declaration | nature |
|---|---|---|
| `src/classes/bizjet/warnings.js:14` | `let measured = null` | memoised, derived from constants |
| `src/classes/trainer/warnings.js:16` | `let measured = null` | same |
| `src/classes/transport/warnings.js:12` | `let measured = null` | same |
| `src/classes/turboprop/warnings.js:13` | `let measured = null` | same |
| `src/classes/drone/risk.js:73` | `let _loo = null` | memoised leave-one-out fit |
| `src/lib/designfile.js:49` | `let runtimeStamp = null` | a timestamp, not an engineering value |

No module-scope `Map` or object caches exist in the engine path. The sizing functions are pure
with respect to their inputs, which is what the round-trip result demonstrates empirically.

Architecturally this is enforced by design: `src/classes/registry.js` is the single dispatch
point, each class owns its defaults and sizing function, and the eVTOL entry's defaults **are**
`DEFAULT_PARAMS` and its sizing function **is** `runSizing`, so adding a class cannot move an
eVTOL number. `validation/aircraft-classes.mjs` enforces that no other code branches on the class
name.

## UI layer — UNVERIFIED

`src/classes/Root.jsx` keeps **all three studios mounted simultaneously** once visited, switching
with `display: none`/`contents` rather than unmounting, so that "switching back finds each design
exactly as it was left". That is deliberate and documented. It means UI-level state leakage cannot
be excluded by an engine-level test and would need a browser pass to settle.

Two mitigating observations from the geometry audit: **memoisation is clean** — every `useMemo`
keys on `[result]` or `[SR, params]`, and the chart series that do not respond to the design are
frozen **in the engine**, not by stale caching (F-G02, F-G06). So the staleness that does exist is
not a React caching problem.

One related finding is architectural rather than contamination: **two entry paths size different
aircraft** (`engineInputs` vs raw `runSizing`, **F-19**, lead-verified 2772.06 vs 2073.36 kg).
That is not state leaking between configurations, but it is the same family of defect — the same
inputs producing two answers depending on which route is taken.

## Verdict

| scope | verdict |
|---|---|
| cross-class contamination in the sizing engines | **PASS** (0 differing leaves out of 6,993 compared) |
| module-scope mutable state | **PASS** (six memoised caches, none carrying an engineering value across classes) |
| React / UI state, tab state, unit-toggle state | **UNVERIFIED** — requires a browser pass |
| same-input determinism across entry paths | **FAIL** — F-19 |
