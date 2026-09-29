# PHASE-0 ANALYSES — P00-018, P00-019, P00-020

These three requirements ask for analyses, not documentation. Each below was run over the source
and produces named sites. Each states what it **cannot** see, because a scan reporting zero is
only meaningful if the reader knows what it was able to detect.

Scope for all three: the 132 engineering modules — `src/engine/**`, `src/classes/**` and
`src/engine.js`, `.js` only. `.jsx` files are excluded because those *are* the interface; the
question in each case is whether ENGINEERING code has the defect.

---

## P00-018 — calculations depending on UI state

**What it detects.** An engineering module reaching for browser or component state:
`window`, `document`, `localStorage`, `sessionStorage`, `navigator`, or a React hook
(`useState`, `useEffect`, `useMemo`, `useRef`, `useContext`). Those are the mechanisms by which a
computed result could differ between two sessions given identical inputs.

**What it cannot detect.** A value passed IN from UI state as an ordinary argument. Every
engineering function takes its parameters from the panel, and that is the design rather than a
defect; the defect would be reading UI state directly.

**Result: 11 sites in 2 modules. No module under `src/engine/**` reads UI state at all.**

| module | sites | what it is | verdict |
|---|---|---|---|
| `src/classes/route.js` | 4 | `window.location.search`, `window.history.replaceState` | **Not a calculation.** URL routing. No engineering quantity depends on it. |
| `src/classes/drone/design-state.js` | 7 | `useState(DESIGN_DEFAULTS)` and five `useMemo` blocks computing `built`, `mission`, `declared`, `selection`, `result` | **A real coupling.** The drone's sized result is produced inside React memoisation. |

**The finding is the second row.** The drone computation functions themselves are pure;
`design-state.js` is the adapter that calls them. But the results a user sees are the output of
five `useMemo` blocks, so their freshness depends on those dependency arrays being right. That is
checkable and is not checked — no harness asserts that a changed input invalidates the memo.

This is **not** a claim that a stale result is currently displayed. It is a statement that
nothing prevents one, and that the eVTOL and aircraft paths do not share this exposure.

> **First scan reported 23 sites and was wrong.** Nearly all were the words "window" and
> "document" inside prose strings — a warning message about a flight envelope, a note about a
> window belt in a fuselage. Strings are now blanked before scanning. A scan that counts English
> text as a UI dependency would have put a false finding on the record.

---

## P00-019 — calculations using display units rather than canonical internal units

`ARCHITECTURE.md` records that this tree has **no single canonical unit system**: each class is a
self-contained port of a published method and carries that method's units. So the question is not
"is SI used" — it is **does one function hold both regimes at once**, which is where a conversion
gets forgotten. F-04 (viscosity), F-36 (Pa→lbf/ft²) and F-37 (`32.2` as gravity) are all that
shape.

**Method.** Split each module into functions; count identifiers carrying imperial unit suffixes
(`Lb`, `Ft`, `Ft2`, `Kt`, `Nmi`, `Psf`, `Psi`, `Hp`) against SI ones (`Kg`, `_m`, `_m2`, `Ms`,
`KW`, `KWh`, `Nm`, `Pa`, `Km`). Report functions holding both.

**Result: 56 functions mix imperial and SI naming inside one body.**

| file | function | imperial | SI | examples |
|---|---|---|---|---|
| `src/engine.js` | `OEI_margin` | 4 | 63 | `loadLb`, `requiredLb` \| `Dq_m2`, `EvertKWh`, `PdcRawKW` |
| `src/classes/aircraft/input-deck.js` | `jetDeck` | 23 | 3 | `alternateAltFt`, `climbCasKt` \| `alternateNm`, `rangeNm` |
| `src/classes/aircraft/engine.js` | `normalize` | 15 | 10 | `allowanceLb`, `altFt` \| `emptyKg`, `fuelCapacityKg` |
| `src/classes/aircraft/engine.js` | `LBtoKg` | 10 | 12 | `fuelAvailableLb` \| `emptyKg` |
| `src/classes/trainer/size.js` | `missionFuel` | 15 | 1 | `allowanceLb`, `climbLb` \| `rangeNm` |
| `src/classes/transport/size.js` | `payloadLb` | 15 | 1 | `emptyLb`, `fuelLb` \| `breguetKm` |
| `src/classes/aircraft/flight-envelope.js` | `v` | 14 | 1 | `altFt`, `cBarFt`, `hStarFt` \| `weightKg` |

**This is a risk inventory, not a defect list.** A function named `LBtoKg` is *supposed* to hold
both. `OEI_margin` holding 63 SI names and 4 imperial ones is the shape worth reading first:
the minority regime is where an unconverted value hides. No claim is made that any of the 56 is
currently wrong — that is Phase 1's job, and this is its work list.

---

## P00-020 — dimensionless variables that may be dimensionful, and the reverse

Four tests, each a real defect class.

### (a) Trigonometry applied to a degree-named value without conversion — **0 sites**

Every `Math.sin/cos/tan` call on a `*Deg` variable in the tree carries a conversion.

> **First scan reported 10 and every one was correct.** The check looked only for `PI` or `180`
> on the line, and the tree converts with a named constant: `Math.cos(yawDeg * DEG)`. Naming the
> constants fixed it. A second defect in the same check — a heredoc turning `\b` into a literal
> backspace byte — had silently disabled the alternation, so the corrected pattern never matched
> until the bytes were removed.

### (b) Percent and fraction built inconsistently — **0 real sites** (2 candidates, both explained)

| site | why it is not a defect |
|---|---|
| `src/classes/drone/battery.js:235` | `out.errorPct = null` — an assignment of null, not a computation |
| `src/classes/trainer/weights.js:157` | `marginPct = 0` — a default parameter in a destructuring signature |

### (c) A percent and a fraction combined in one expression — **0 real sites** (1 candidate)

`src/engine.js:3864` — `tipDeflectionPct: (wbox.tipDeflectionFrac * 100)`. This is the correct
conversion from fraction to percent, which is what the test was looking for and the one shape it
cannot distinguish from the error.

### (d) One identifier, two reciprocal meanings — **4 definitions, 1 reciprocal** → N-13

The three tests above found nothing. Scanning instead for *the same constant name carrying
different values across modules* found this:

| file | value | meaning | used as |
|---|---|---|---|
| `src/classes/drone/geometry3d.js:55` | `Math.PI / 180` ≈ 0.017453 | radians per degree | `yawDeg * DEG` ✔ |
| `src/classes/transport/flops-weights.js:21` | `Math.PI / 180` | radians per degree | `wingSweep * DEG` ✔ |
| `src/classes/transport/high-lift.js:93` | `Math.PI / 180` | radians per degree | `sweepC4Deg * DEG` ✔ |
| **`src/classes/transport/flops-aero.js:47`** | **`57.2958`** | **degrees per radian** | `sweepDeg / DEG` ✔ |

**Every file is internally correct.** `flops-aero.js` divides where the others multiply, so no
number in the tool is currently wrong, and nothing here should be changed to "fix" a working
calculation.

**The finding is the collision.** `DEG` means one thing in three modules and its reciprocal in a
fourth, and **two of the four live in the same directory** (`src/classes/transport/`). Moving a
line between `flops-aero.js` and `flops-weights.js` — sibling files implementing one published
method — silently changes the answer by a factor of 3,283. That is the exact shape of the gravity
defect recorded in `src/engine/constants.js`, whose header says the split "ran INSIDE a single
class".

`validation/constants.mjs` exists to prevent precisely this and **does not cover `DEG`**: it
tracks physical constants by value against an allowlist (G, speed of sound, viscosity, `R_GAS`),
not identifier collisions. Recorded as **N-13**, raised not fixed: the remedy is a gate change,
and choosing between renaming the odd one out and extending the constants gate is an engineering
decision.

---

## P00-017 — assumptions not exposed to the user

An assumption is **exposed** when the person running the tool can see and change it: it has
a control on a panel, or it is a key of `DEFAULT_PARAMS`, which the panels bind to and the
design file round-trips. It is **hidden** when it is a tagged value baked into a module with
no such control.

**What counts as an assumption:** a constant carrying the repository's own provenance tags —
`[LAY]` a layout choice, `[EST]` an estimate, `[CAL]` calibrated here. `[SRC]` is excluded: a
sourced value is a citation, not an assumption.

**Exposed surface measured:** 42 slider controls + 32 `DEFAULT_PARAMS` keys + 73 panel field
names = **83 distinct names the user can reach**.

**Result: 58 tagged assumptions in the engineering modules. 0 are exposed. 58 are hidden.**

| tag | meaning | hidden |
|---|---|---|
| `[LAY]` | a layout choice | 49 |
| `[CAL]` | calibrated in this repository | 9 |

### Where they are

| module | hidden assumptions |
|---|---|
| `src/engine/wingbox.js` | 15 |
| `src/engine/battery-thermal.js` | 12 |
| `src/engine/booms.js` | 6 |
| `src/engine/landinggear.js` | 6 |
| `src/engine/cg.js` | 4 |
| `src/engine/weights.js` | 4 |
| `src/engine.js` | 2 |
| `src/engine/avionics.js` | 2 |
| `src/engine/constraints.js` | 2 |
| `src/engine/drag.js` | 2 |
| `src/engine/coaxial.js` | 1 |
| `src/engine/constants.js` | 1 |
| `src/engine/sizing-conditions.js` | 1 |

### The ones that move the most mass

| tag | name | value | site |
|---|---|---|---|
| `[LAY]` | `CY_beta` | `-0.30` | `src/engine.js:2169` |
| `[LAY]` | `beta_trim` | `2*Math.PI/180` | `src/engine.js:2170` |
| `[LAY]` | `lanesEnhanced` | `3` | `src/engine/avionics.js:71` |
| `[LAY]` | `lanesBasic` | `2` | `src/engine/avionics.js:72` |
| `[LAY]` | `tAmbientC` | `35` | `src/engine/battery-thermal.js:129` |
| `[CAL]` | `btmsKgPerKW` | `0.45` | `src/engine/battery-thermal.js:130` |
| `[CAL]` | `bmsFracPack` | `0.015` | `src/engine/battery-thermal.js:132` |
| `[CAL]` | `bmsKgPerSeries` | `0.055` | `src/engine/battery-thermal.js:133` |
| `[LAY]` | `trayCoreThkM` | `0.050` | `src/engine/battery-thermal.js:136` |
| `[LAY]` | `trayMinFaceM` | `0.0005` | `src/engine/battery-thermal.js:138` |
| `[LAY]` | `packThicknessM` | `0.30` | `src/engine/battery-thermal.js:139` |
| `[LAY]` | `trayNonOptimum` | `1.35` | `src/engine/battery-thermal.js:140` |
| `[LAY]` | `containmentFracPack` | `0.060` | `src/engine/battery-thermal.js:150` |
| `[LAY]` | `nonPropagationFracPack` | `0.030` | `src/engine/battery-thermal.js:151` |
| `[LAY]` | `cellsPerModule` | `120` | `src/engine/battery-thermal.js:152` |
| `[LAY]` | `packDensityKgM3` | `2100` | `src/engine/battery-thermal.js:153` |

`battery-thermal.js` alone holds 12 hidden assumptions — ambient temperature 35 °C, pack
thickness 0.30 m, tray non-optimum factor 1.35, cells per module 120, pack density 2100
kg/m³ — none of which a user can see or vary. `wingbox.js` holds 15.

**Not a claim that any value is wrong.** Every one carries a tag saying what kind of number
it is, which is better than most codebases manage, and the tags are why this analysis was
possible at all. The finding is that **the tool's user cannot see any of them**: 83 names are
reachable and none of the 58 tagged assumptions is among them.

**Lower bound, not a total.** The scan reads tags written on the same line as the value. An
assumption tagged in a block comment above its constant, or embedded in an expression rather
than named, is not counted here — bare literals are P00-016's 392.

