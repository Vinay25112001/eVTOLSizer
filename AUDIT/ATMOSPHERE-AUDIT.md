# ATMOSPHERE AUDIT (Phase 10)

Commit `3a7a5a4`. Every ISA implementation in the tree was located, written out as coded, and
compared against an independent reference recomputed from the ISA definition
(`AUDIT/reference/evtol_reference.py`, `isa()`), at 0, 500, 1000, 1524, 3000, 5000, 8000,
10000 and 11000 m.

## Independent reference values

Recomputed from the definition with g = 9.80665, R = 287.05287, T0 = 288.15, P0 = 101325,
L = 0.0065, gamma = 1.4:

| h (m) | T (K) | P (Pa) | rho (kg/m³) | a (m/s) |
|---|---|---|---|---|
| 0 | 288.1500 | 101325.000 | 1.225000 | 340.2940 |
| 500 | 284.9000 | 95460.835 | 1.167269 | 338.3695 |
| 1000 | 281.6500 | 89874.563 | 1.111643 | 336.4340 |
| 1524 | 278.2440 | 84307.265 | 1.055546 | 334.3935 |
| 3000 | 268.6500 | 70108.526 | 0.909122 | 328.5779 |
| 5000 | 255.6500 | 54019.888 | 0.736116 | 320.5294 |
| 8000 | 236.1500 | 35599.785 | 0.525167 | 308.0626 |
| 10000 | 223.1500 | 26436.243 | 0.412706 | 299.4632 |
| 11000 | 216.6500 | 22632.040 | 0.363918 | 295.0695 |

Self-consistency of the constant set, verified: `P0/(R·T0) = 1.225000` exactly, and
`sqrt(gamma·R·T0) = 340.2940` m/s against NDARC's independently published `cs0 = 340.294`.
The constant set is correct and mutually consistent — which is what makes `MU0` (below) the
single broken value in the file.

## Implementation-by-implementation results

| implementation | equation as coded | max error vs reference, 0–10 km | deltaISA handling | verdict |
|---|---|---|---|---|
| **`src/engine/atmosphere.js:19-27` `makeISA`** | `T_std=T0−Lh`; `P=P0(T_std/T0)^(g/LR)`; `T=T_std+Δ`; `rho=P/RT`; `a=sqrt(γRT)` | **0.00 % on T, P, rho and a at all nine altitudes** | **CORRECT** — density recomputed from the gas law at ACTUAL temperature, not scaled | **PASS** below 11 km |
| same, above 11 km | no tropopause | at 12,496 m: T −4.49 %, rho +4.13 % | — | **WARNING** (F-A05) |
| `src/classes/transport/atmosphere.js:20-29` `makeJetISA` | troposphere delegates to `makeISA(Δ)`; above: `P=P₁₁exp(−g(h−11000)/(R·216.65))`, `T=216.65+Δ`, `rho=P/RT` | **0.00 %** at every point including 11 km and 12,496 m; joins continuously at 11 km | correct | **PASS** |
| `src/classes/drone/sizing.js:84-90` `isaDensity` | own copy of the barometric form, same constants | **0.00 %** at all nine altitudes | **no deltaISA parameter at all** — standard day only | **PASS** as written; WARNING for the missing capability |
| `src/classes/trainer/performance.js:24` `densityRatio` | `isa(altFt·FT).rho / isa(0).rho` | **0.00 %** | inherits `makeISA(0)`; Δ hard-wired to 0 at `:21` | **PASS** |
| `src/classes/aircraft/flight-envelope.js:344-349` | `sigma=(1−2.25577e-5h)^4.25588`; strat. `0.297076·exp(−(h−11000)/6341.62)`; `theta=1−2.25577e-5h` | **≤1.3e-4 %** | none — correct, since a V-n envelope is in EAS | **PASS** |
| `src/classes/transport/size.js:47-50` `fieldSigma` | `(P/(T+Δ))/(P_sl/T_sl)`, R cancels | `fieldSigma(0,20)=0.9350965` vs exact 0.9350965 → **0.00 %** | **correct** (gas law at actual T) | **PASS** |
| `src/classes/transport/takeoff.js:239-240` | `rho=P/(R(T+Δ))`, `a₀=sqrt(1.4R(T+Δ))` | exact | **correct** | **PASS** |
| `src/classes/transport/landing.js:90-98,114` | own ISA copy including an 11 km branch; `rho=P/(R(T+Δ))` | ≤8.8e-5 % (hard-coded 22632.06) | **correct** | **PASS** |
| `src/App.jsx:727-733` (weather panel) | `rho=P_measured/(R·T_measured)`; `rho_ISA_elev=1.225(T/T0)^4.25588` | the gas-law rho is correct; `rho_ISA_elev` is exact at Δ=0 and **is never read** | — | **WARNING** (F-28) |
| **`src/export/report.js:167-173, 213`** | `T=288.15−0.0065h`; `rho=1.225(T/T0)^4.25588`; `a=sqrt(1.4R·T)` — **deltaISA absent** | exact at Δ=0; **+7.10 % on rho, −3.37 % on a at Δ=+20** | **ignores deltaISA entirely** | **FAIL** (F-07) |
| **`src/export/report.js:391-397`** | `T0eff=288.15+Δ`; `T=T0eff−Lh`; **`rho=1.225(T/T0eff)^4.25588`** | T correct; **rho +5.84 % at Δ=+15, +7.79 % at Δ=+20** (1000 m) | **rho is SCALED, not recomputed** | **FAIL** (F-07) |

## The headline result

**The production atmosphere is exact.** `src/engine/atmosphere.js` `makeISA` reproduces the
ISA definition to 0.00 % on every quantity at every altitude tested, and — the part that
matters for a hot-and-high sizing tool — it handles a temperature deviation **correctly**, by
recomputing density from the gas law at the actual temperature rather than scaling a fixed
1.225 by a temperature ratio. Its own header (`:14-17`) explains why the scaling approach is
wrong and states that it was removed.

**The exported report then does the thing the engine's header says was removed** (F-07), in two
different ways, in two different blocks, so one PDF carries two cruise densities and two speeds
of sound. That is the atmosphere finding that matters.

## Findings in this domain

| id | finding | severity |
|---|---|---|
| **F-04** | `MU0 = 1.47e-5` is the kinematic viscosity used as dynamic; `viscosity(T) = MU0(T/T0)^0.75` is a dynamic-viscosity law. Every Re in the tree is 21.7 % high; Cf 2.9–3.1 % low. | HIGH |
| **F-05** | `validation/identities.mjs:30` hardcodes the same wrong `MU0`, so the Reynolds identity cannot fire; `validation/constants.mjs` bands only g and `R_GAS`. | HIGH |
| **F-06** | The report's printed Reynolds equation is **−17.86 % off its own printed answer at the defaults**, because the fraction uses 1.789e-5 and the answer uses the engine's 1.47e-5. | HIGH |
| **F-07** | Report block A ignores deltaISA; block B applies it by scaling. Two densities (+7.10 % / +7.79 % at Δ+20) and two speeds of sound in one document. | HIGH |
| **F-29** | `src/engine.js:739` computes Mach from standard temperature, ignoring deltaISA, while `:1641` uses the deviated speed of sound. +3.53 % on the `nasa-uam` day; numerically negligible today (Oswald's M⁶ term). | LOW |
| **F-A05** | `makeISA` has no tropopause (T −4.49 %, rho +4.13 % at 12,496 m) and `Math.max(0,h)` silently treats a below-sea-level field as sea level. All current `makeISA` consumers stay below 11 km, but `turboprop/size.js:52` takes a user `maxAltitudeFt` that would break above 36,089 ft. | LOW |
| **U-02** | `src/engine/turboelectric.js:118-119` referred lapse `(P/P0)sqrt(T/T0)` makes turboshaft power **rise 3.6 %** on ISA+20 at 6,000 ft, so the hot-and-high day sizes the generator *smaller* — opposite to the stated purpose of `SIZING_DAYS`. Dimensionally consistent; the NDARC referred-parameter text is not vendored here. | UNVERIFIED |
| **F-A08** | `src/classes/drone/sizing.js` `isaDensity` has no deltaISA parameter, so a drone sized in the same session at the same "hot and high" intent gets a standard-day density. | LOW |

## Sizing-day context, verified

`SIZING_DAYS` (`src/engine/atmosphere.js:46-56`) offers `nasa-uam` (1524 m / ISA+20),
`nasa-sl` (0 m / ISA+20) and `sl-isa` (explicitly labelled *"NOT a sizing condition"*).
`MISSION_BASES.certification` (`src/engine/mission.js:35`) sets `sizingDay: "nasa-uam"`.

**But `DEFAULT_PARAMS.missionBasis` is `undefined`**, and `applyMissionBasis` returns `p`
unchanged for an unknown basis, so the default run is sea level, ISA+0, cruise 1000 m — verified
by probe. Consequence for severity, stated plainly: the deltaISA-dependent defects above are
**zero at the defaults** and activate the moment a user selects the Certification basis or a
sizing day — that is, exactly when doing the sizing the tool is built for. F-06 is the
exception: it is wrong at the defaults.

Measured MTOW across the three days (registry path): no day 2772.06 kg · `nasa-uam` 2986.8 kg ·
`nasa-sl` 2917.9 kg. Hover density: 1.22321 · 0.98325 · 1.14379 kg/m³.
