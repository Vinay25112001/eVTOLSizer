# UNITS — forensic unit-system audit (Phase 1)

Commit `3a7a5a4`. Method: every conversion factor in the tree was located and compared against
its exact SI definition; every atmosphere and dynamic-pressure formula was dimensionally
analysed; the display path was traced to check whether a converted value can re-enter a
calculation.

## Verdict summary

| question | verdict |
|---|---|
| Is there a single canonical internal unit system? | **FAIL** — there are four regimes (see below) |
| Are the conversion factors themselves accurate? | **PASS** — worst error 0.081 %, all others ≤ 1.2e-4 % |
| Is the imperial↔SI boundary clean inside each module? | **PASS** — no Raymer/FLOPS/GASP equation is fed metres or kilograms anywhere |
| Does any display-unit value re-enter a calculation? | **PASS** — none found |
| Any degree/radian confusion? | **PASS** — none found |
| Any percentage/fraction confusion? | **PASS** — none in the atmosphere or unit paths |
| Is any physical constant written twice with different values? | **FAIL** — viscosity (21.7 % apart), Pa→psf (three values), imperial g (0.081 %) |
| Is a dimensionally wrong formula producing a plausible number? | **FAIL** — `MU0` (F-04), report density (F-07) |

## 1. The four unit regimes

`src/lib/units.js:1-32` claims that "all three studios read one table." They do not.

| regime | internal units | evidence |
|---|---|---|
| eVTOL engine (`src/engine.js`, `src/engine/*`) | strict SI | `src/engine/constants.js:43-77` |
| Drone class | strict SI | `src/classes/drone/sizing.js:80-90`, `rotor.js:47-58` |
| transport / turboprop / trainer / aircraft classes | **imperial internally** — lb, ft, ft², kt, °R, lb/US gal — converted at module boundaries | `src/classes/transport/size.js:49`, `src/classes/trainer/performance.js:4,17-20`, `src/classes/transport/flops-aero.js:135` (`tR` in °R) |
| display | **two mutually unaware toggles** | `src/lib/units.js` + `src/lib/unit-system.jsx` (used by `src/classes/ui-kit.jsx:14`, `AircraftStudio.jsx:21`) **vs** `src/App.jsx:172` `useImperial` with its own factor table at `:420-443` |

`src/App.jsx` contains **no** reference to `useUnitSystem`, `convertDisplay` or
`convertLabelled` (verified by grep). The eVTOL studio's toggle and the global
`UnitSystemProvider` are separate state, separate factors, and even separate unit strings:
`src/App.jsx:423` emits `"kts"`, which `src/lib/units.js` does not know, so
`isKnownUnit("kts") === false`.

Choosing imperial internally for the FLOPS/GASP classes is defensible — those methods are
published in imperial and converting the equations would be a larger risk than converting at
the boundary. The finding is the **absence of a documented statement** that this is the
architecture, and the two independent display toggles.

## 2. Canonical constants as shipped

| symbol | value | file | status |
|---|---|---|---|
| `G0` | 9.80665 m/s² | `src/engine/constants.js:43` | exact by definition; cited to NACA TR-824, NDARC, Loftin, Airbus |
| `R_GAS` | 287.05287 J/(kg·K) | `:74` | **derived**, not looked up: `P0/(rho0 T0)`; confirmed independently by NDARC's published `cs0 = 340.294` |
| `T0` | 288.15 K | `:45` | ISA |
| `P0` | 101325 Pa | `:77` | ISA |
| `LAPSE` | 0.0065 K/m | `:46` | ISA |
| `GAMMA` | 1.4 | `:75` | — |
| `RHO_MSL` | 1.225 kg/m³ | `:44` | ISA; consistent with the three above |
| **`MU0`** | **1.47e-5** labelled "dynamic viscosity, Pa·s" | `:76` | **FAIL — this is the kinematic value (F-04)** |

Independently verified (`AUDIT/reference/evtol_reference.py`):
`P0/(R_GAS·T0) = 1.225000` exactly, and `sqrt(GAMMA·R_GAS·T0) = 340.2940` m/s, matching NDARC's
published sea-level speed of sound to four decimals. **The ISA triple is self-consistent and
correct.** That makes `MU0` the sole broken constant in the file.

## 3. Conversion-factor table

Exact references: ft 0.3048 · in 0.0254 · lb 0.45359237 · nmi 1852 · lbf 4.4482216152605 ·
hp 745.6998715822702 · ft² 0.09290304 · oz 28.349523125 · US gal 3.785411784e-3 ·
kt 0.5144444… · g_imperial 32.17404856.

| file:line | factor as written | exact | rel. error | verdict |
|---|---|---|---|---|
| `src/lib/units.js:39-97` | the whole table (0.45359237, 0.3048, 25.4, 1.852, 1852/3600, 4.4482216152605, 0.09290304, 6.894757293168361, 745.6998715822702, 28.349523125) | — | **0 (exact)** | PASS |
| `src/classes/transport/size.js:49` | `LBF = 4.4482216` | 4.4482216152605 | −3.4e-7 % | PASS |
| `src/classes/transport/size.js:49` | `PSF = 47.880259` | 47.88025898 | +4.1e-8 % | PASS |
| `src/classes/transport/validation-cases.js:21` | `LBF = 4.44822` | — | −3.6e-5 % | PASS |
| `src/engine/landinggear.js:150` | `/ 4.44822` | — | −3.6e-5 % | PASS |
| `src/classes/aircraft/flight-envelope.js:60` | `LB_FT2_PER_PA = 0.020885434` | 0.02088543423 | −1.1e-6 % | PASS |
| `src/engine/weights.js:203`, `configuration.js:828`, `engine.js:569,3011`, `ConstraintDiagramTab.jsx:25` | `0.0208854` | — | −1.6e-4 % | PASS |
| `src/App.jsx:428`, `src/export/report.js:24`, `src/engine.js:3514,3515,3634,3635` | `0.020885` | — | **−2.1e-3 %** | **WARNING → F-36** |
| `src/engine/weights.js:203`, `drivesystem.js:90`, `flightcontrols.js:74`, `gear/pavement.js:47`, `motormass.js:32`, `nacelle.js:77`, `rotorgroup.js:106`, `src/App.jsx:421`, `src/tabs/CertificationTab.jsx:16` | `LB = 2.20462` | 2.2046226218 | −1.2e-4 % | PASS |
| `src/classes/aircraft/gear.js:61`, `geometry.js:34` | `2.20462262` | — | −8.4e-8 % | PASS |
| `src/engine/autorotation.js:62` | `2.2046226218` | — | −2.2e-9 % | PASS |
| `validation/nasa-table3.js:26`, `src/App.jsx:427` | `0.453592` | 0.45359237 | −8.2e-5 % | PASS |
| `src/engine/flightcontrols.js:75`, `rotorgroup.js:107`, `weights.js:203`, `src/App.jsx:426` | `FT = 3.28084` | 3.280839895 | +3.2e-6 % | PASS |
| `src/engine/gear/sink-speed.js:57`, `autorotation.js:62` | `3.280839895` | — | −4e-10 % | PASS |
| `src/engine/nacelle.js:78`, `weights.js:203`, `engine.js:3649`, `App.jsx:425` | `10.7639` | 10.76391042 | −9.7e-5 % | PASS |
| `src/classes/aircraft/control-surfaces.js:84`, `engine.js:40`, `flight-envelope.js:58`, `fuselage-structure-loads.js:181`, `transport/mission.js:48` | `KT = 0.514444` | 0.5144444444 | −8.6e-5 % | PASS |
| `src/engine/whirlflutter.js:58` | `KT_PER_MS = 1.943844` | 1.9438444924 | −2.5e-5 % | PASS |
| `src/App.jsx:423` | `1.94384` | — | −2.3e-4 % | PASS |
| `src/classes/trainer/performance.js:18` | `KT_FPS = 1.6878099` | 1.6878098571 | +2.5e-6 % | PASS |
| `src/classes/trainer/performance.js:19` | `NM_PER_SM = 1/1.1507794` | 1609.344/1852 | +4.2e-6 % | PASS |
| `src/classes/aircraft/engine.js:40`, `turboprop/size.js:40`, `turboprop/validation-cases.js:16` | `HP = 745.69987` | 745.6998715823 | −2.1e-7 % | PASS |
| `src/App.jsx:424`, `src/export/report.js:20` | `1.34102` (kW→hp) | 1.341022090 | −1.6e-4 % | PASS |
| `src/App.jsx:422`, `src/export/report.js:729,955` | `0.539957` (km→nmi) | 0.5399568035 | +3.6e-5 % | PASS |
| `src/Components.jsx:252` | `39.3701` | 39.37007874 | +5.4e-5 % | PASS |
| `src/classes/aircraft/flight-envelope.js:62`, `validation/constants.mjs:98` | `G_FT = 32.17405` | 32.17404856 | +4.5e-6 % | PASS |
| **`src/classes/trainer/weights.js:56`** | **`32.2` used as imperial g** | 32.17404856 | **+0.081 %** | **WARNING → F-37** |
| `src/classes/trainer/weights.js:39`, `flight-envelope.js:61` | `RHO_SL_SLUG = 0.0023769` | 1.225/515.3788184 | +3.2e-4 % | PASS |
| `src/engine/noise.js:47`, `validation/acoustics.mjs:111` | `4.448`, `47.88` inside `SCHLEGEL_K2_SI` | — | −5.0e-3 %, −5.4e-4 % | PASS |
| `src/classes/transport/flops-aero.js:47` | `DEG = 57.2958` (FLOPS's own) | 57.29577951 | +3.6e-7 % | PASS |
| `src/classes/transport/size.js:335`, `turboprop/size.js:168` | `7.48052` US gal/ft³ | 7.480519481 | +6.9e-6 % | PASS |
| `src/classes/aircraft/flight-envelope.js:346-348` | `2.25577e-5`, `4.25588`, `0.297076`, `6341.62` (ISA-derived) | — | ≤1.3e-4 % | PASS |
| `src/classes/transport/landing.js:97` | `22632.06` (P at 11 km) | 22632.0401 | +8.8e-5 % | PASS |

**No conversion factor in the tree is wrong by more than 0.081 %**, and that single case is
F-37. The unit arithmetic is sound; the failures are in *duplication discipline* and in the
atmosphere.

## 4. Duplicate-constant audit

| quantity | copies | agree? |
|---|---|---|
| g, SI | `src/engine/constants.js:43` = 9.80665 plus ~40 inline sites, all 9.80665 | **AGREE** |
| g, imperial | `flight-envelope.js:62` 32.17405; `validation/constants.mjs:98` 32.17405; **`trainer/weights.js:56` 32.2** | **DISAGREE 0.081 %** — and `validation/constants.mjs:158` explicitly allowlists it (F-37) |
| `R_GAS` | `constants.js:74` plus ~15 inline copies, all 287.05287 | **AGREE** |
| `T0`, `P0`, `LAPSE` | `constants.js` plus 9 / 4 / 6 inline copies | **AGREE** |
| `rho_MSL` | `constants.js:44` plus ~20 inline copies, all 1.225 | **AGREE** |
| gamma | `constants.js:75` 1.4; `transport/size.js:133,210` and `aircraft/engine.js:272,294` write `0.5*1.4`; `turboprop/size.js:100` writes `0.7` (= gamma/2) | numerically AGREE, spelling diverges |
| **viscosity** | **`constants.js:76` 1.47e-5** vs **`noise.js:197` 1.789e-5** vs **`report.js:396` 1.789e-5** vs **`validation/identities.mjs:30` 1.47e-5** | **DISAGREE by 21.7 % (F-04)** |
| Pa→lbf/ft² | three values: `0.020885434`, `0.0208854`, `0.020885` | **DISAGREE**, spread 2.1e-3 % (F-36) |
| kg→lb | `2.20462` (9 sites) / `2.20462262` (2) / `2.2046226218` (1) | DISAGREE ≤1.2e-4 % |
| kW→hp | `units.js:86` exact; `App.jsx:424`, `report.js:20` `1.34102` | DISAGREE 1.6e-4 % |
| **cruise density** | engine (gas law) vs `report.js:169,213` (no ΔISA) vs `report.js:395` (ΔISA as a *scaling*) | **DISAGREE up to 7.8 % (F-07)** |

`validation/constants.mjs:141-151` bands **only** gravity (SI + imperial) and `R_GAS`.
Viscosity, `rho_MSL`, `T0`, `LAPSE`, `P0`, gamma and every unit factor are **ungated**.

## 5. Dimensional analysis

All **PASS** except where noted. Verified formula by formula:

- `src/engine/atmosphere.js:23,25` — `P0(T/T0)^(G0/(L·R))`: exponent
  `(m/s²)/((K/m)(J/kg·K))` is dimensionless ✓; `rho = P/RT` ✓; `a = sqrt(gamma R T)` = √(J/kg)
  = m/s ✓.
- `src/classes/transport/atmosphere.js:26` — `exp(−g(h−h11)/(R·T))`: dimensionless ✓.
- `src/classes/transport/mission.js:57-58` `casToMach` — the exact St-Venant/Rayleigh subsonic
  CAS relation with gamma = 1.4 (0.2 = (γ−1)/2, 3.5 = γ/(γ−1), 2/7 = (γ−1)/γ, 5 = 2/(γ−1)),
  referenced against `isa(0)`, which is what CAS is defined against ✓.
- `src/classes/transport/size.js:133,210`, `src/classes/aircraft/engine.js:272,294` —
  `q = 0.5·1.4·P·M²` = (γ/2)pM², Pa ✓.
- `src/classes/turboprop/size.js:100` — `CL = (W/S)g/(0.7 P M²)` dimensionless ✓.
- `src/classes/transport/flops-aero.js:135-137` — `kelvin = tR/1.8` ✓; Sutherland 110.4 K /
  198.72 °R consistent ✓; `RE = 1.479301e9(p/p_sl)(T+110.4)/T²` per ft per unit Mach —
  independently derived as ρa/μ ∝ p(T+110.4)/T², exact value 7,100,725 against the coded
  7,100,716, −1.3e-4 % ✓.
- `src/classes/trainer/performance.js:46` — `q = 0.5 ρ[slug/ft³](V_kt·1.6878)²` = lbf/ft² ✓.
- `src/classes/aircraft/flight-envelope.js:224`, `src/engine/loadcases.js:223` —
  `mu = 2(W/S)/(rho c a g)`: denominator ρ·g·c = lbf/ft² (resp. Pa) → dimensionless ✓.
- `src/classes/aircraft/fuselage-structure-loads.js:426`, `loadcases.js:218` —
  `q_ne = 0.5 rho_MSL (V_D·KT)²` at **sea-level** density: correct, because V_D is an EAS. This
  is a correct-looking hard-code, not a duplicate defect ✓.
- `src/classes/drone/rotor.js:50,58,69` — `T = C_T rho n² D⁴` → N ✓; `P = C_P rho n³ D⁵` → W ✓;
  `FM = sqrt(2/pi)·C_T^1.5/C_P` re-derived independently from `P_ideal = T^1.5/sqrt(2 rho A)` ✓.
- `src/engine.js:826` — `0.455/log10(Re)^2.58/(1+0.144 M²)^0.65`: JS `**` binds tighter than
  `/`, so this is Raymer's form and **not** a precedence bug ✓. The *value* is wrong via F-04.
- `src/engine/noise.js:198` — `Re_tip = rho V_tip c/mu` dimensionally ✓, but mu = 1.789e-5 here
  against 1.47e-5 in the engine, so the two Reynolds numbers differ by 21.7 %; worth −0.17 dB
  on `dBB_Re` (`:202`). LOW.
- **`src/export/report.js:169, 395` — FAIL.** The form `rho_SL(T/T0)^(g/LR−1)` is dimensionally
  valid and is the correct ISA density ratio **only when T is the standard temperature at that
  geopotential height**. Feeding it a ΔISA-shifted temperature is a dimensionally plausible
  number computed from the wrong physical relation. Per the audit's own rule, this is a FAIL.
  See F-07.
- **`src/engine/atmosphere.js:30` — FAIL.** `MU0·(T/T0)^0.75` is a dynamic-viscosity power law
  carrying a kinematic coefficient. See F-04.

## 6. Degree/radian and percentage/fraction

**PASS on both.** Every `Math.sin/cos/tan` call site inspected either converts explicitly
(`·Math.PI/180`, or `·DEG` with `DEG = Math.PI/180` at `flops-weights.js:21`, `high-lift.js:93`,
`geometry3d.js:55`, or `/DEG` with `DEG = 57.2958` at `flops-aero.js:47`) or takes a `*Rad`
argument. No percentage/fraction confusion found in the atmosphere or unit paths;
`trainer/weights.js:158` `marginPct/100` and `certification-climb.js:163` `·100` are both correct.

## 7. Display → calculation

**PASS.** `convertDisplay` and `convertLabelled` (`src/lib/units.js:148-207`) are string→string
and one-way; `src/App.jsx`'s `U` object and `convertCheckVal` (`:448-464`) are render-time only.
No path was found where a converted display value re-enters a computation.

**Related but separate concern (Phase 21):** the engine's result object rounds many values with
`+x.toFixed(n)` (e.g. `src/engine.js:3687` for `MAC`, `Xac`, `Re_`, `Mach`). Whether any
consumer reads a *rounded* field back into a calculation is assessed in
`NUMERICAL-STABILITY.md`.

## 8. Unresolved ambiguities

1. Whether the imperial-internal choice for the FLOPS/GASP classes is intended as architecture
   or is incidental. It is defensible; it is undocumented.
2. Whether the two display toggles are intended to be independent (per-studio preference) or are
   an accident of the studios being added later. `src/lib/units.js`'s header implies the latter.
3. `src/engine/turboelectric.js:118-119`'s referred lapse — dimensionally consistent, convention
   unverifiable from this repo (U-02).
