# EDGE-CASE / ADVERSARIAL TESTING (Phase 18)

Commit `3a7a5a4`. Entry point `sizeDesign({aircraftClass, params})` unless noted, i.e. the path the
UI uses. Classification, as Phase 18 requires: the application must **reject invalid cases, explain
why, and never silently produce plausible nonsense.**

Classes: **REFUSED+EXPL** / **REFUSED SILENTLY** / **NaN or Inf** / **PLAUSIBLE-NONPHYSICAL** /
**THREW** / **HANG**.

## eVTOL matrix

| case | observed | class |
|---|---|---|
| baseline | MTOW 2772.06, converged, gap 0 | ok |
| **payload = 0** | `TypeError: Cannot read properties of null (reading 'toFixed')` at **`engine.js:3236`** — inside a cabin **check's display string**, *after* the sizing loop converged | **THREW**, uncaught, internal message (**F-R16**) |
| payload = 1e6 kg | MTOW 1.002e6, Wbat 3.699e6 (3.7x MTOW), **massBalanceGapKg 4.199e6 = 419 % of MTOW**, diverged | PLAUSIBLE-NONPHYSICAL (flagged) |
| payload = -500 / NaN / Infinity | `Error: componentWeights: g.nzUltimate is required (got NaN)` | **THREW** with a diagnostic naming the **wrong quantity** |
| range = 0 | MTOW 1988.34, **converged** | **PLAUSIBLE-NONPHYSICAL** — zero cruise, no flag (**F-14**) |
| **range = -100 km** | **bit-identical to range = 0**, converged, gap 0 | **silently clamped** (**F-14**) |
| range = 1e6 km | MTOW 2.909e6, Wbat 2.987e9, diverged | PLAUSIBLE-NONPHYSICAL |
| reserveMinutes = 0 | MTOW 2172.50, converged | ok |
| **reserveMinutes = -30** | **identical to 0** | **silently clamped** (**F-16**) |
| reserveMinutes = 1e5 | MTOW 8.90e5, diverged | PLAUSIBLE-NONPHYSICAL |
| sedCell = 0 (winged) | THREW `g.nzUltimate ... (got NaN)` | THREW |
| sedCell = 1e6 Wh/kg | MTOW 1306.21, Wbat **0.12 kg**, converged | PLAUSIBLE-NONPHYSICAL (accepted) |
| **sedCell = -300** | MTOW 11,175.64, **Wbat +96,620 kg**, gap 91,908, diverged | **a negative specific energy is not refused** |
| socMin = 1 | **MTOW 1597.20 (finite, plausible)** with **Wbat = Infinity** | **Inf beside a plausible MTOW** |
| **socMin = 1.5 (illegal, > 1)** | **MTOW 1862.73, converged, gap 0, Wbat 274 kg** — *smaller* than the legitimate socMin = 0 case (508 kg) | **PLAUSIBLE-NONPHYSICAL, fully converged, monotonicity INVERTED: an illegal input yields a more optimistic aircraft** |
| socMin = -0.2 | MTOW 2088.70, converged | PLAUSIBLE-NONPHYSICAL |
| **propDiam = 0 / -2 / missing** | `runSizing: propDiam (rotor diameter, m) is required and must be a positive number — received 0` | **REFUSED + EXPLANATION — the model to copy** |
| propDiam = 500 m | MTOW 1597.2, LDact 0, diverged | PLAUSIBLE-NONPHYSICAL |
| nPropHover = 1 | MTOW 7076.21, OEI -35 %, diverged; `N_oei_ = max(2,n)` silently treats a single-rotor aircraft as a twin | PLAUSIBLE-NONPHYSICAL |
| nPropHover = 0 | MTOW 1597.2, **Wbat = Infinity** | NaN/Inf |
| **nPropHover = 400** | **no return in 500 s.** Measured 32 -> 0.57 s, 48 -> 3.6 s, 64 -> 14.9 s, 96 -> **105 s**; scaling ~O(n^4.8), extrapolated ~47 h. Iterations stay 24-48, so the cost is per-rotor | **HANG, unbounded** (**F-R24**) |
| nPropHover = -4 | MTOW finite, Wbat/gap = **NaN** | NaN |
| wingLoadingNm2 = 0 | **Swing 1.566e10 m^2**, MAC 43,718 m, diverged | PLAUSIBLE-NONPHYSICAL |
| **wingLoadingNm2 = -1371** | **identical to 0** | **silently clamped** |
| **cruiseAlt = -500 m** | **identical to 0** | **silently clamped** (`Math.max(0,h)`) |
| cruiseAlt = 30,000 m | Swing 773.78, TipMach 0.866, diverged | PLAUSIBLE-NONPHYSICAL |
| vCruise = 0 | MTOW 1241.58 finite, **Swing 1.218e10**, Wbat NaN | NaN + nonphysical |
| vCruise = -67 | MTOW 1015.49, Wbat NaN | NaN |
| vCruise = NaN / AR = 0 / etaSys = 0 | THREW `g.nzUltimate ... (got NaN)` | THREW |
| etaHov = 0 | **Wbat = Infinity** | NaN/Inf |
| tipSpeed = 0 | MTOW 2945.02, **converged**, TipMach 0 | PLAUSIBLE-NONPHYSICAL |
| tipSpeed = 1e4 m/s | MTOW 2333.43, **converged, TipMach 29.7** | PLAUSIBLE-NONPHYSICAL |
| **twRatio = 0** (cannot hover) | **MTOW 2562.58, converged, gap 0**; identical to twRatio = 0.5 | **T/W is inert below ~1** |
| **headwind >= vCruise** | 66, 67 and **100 m/s** all give the identical MTOW 7196.76 | **silently clamped** (`gsCr = max(1,...)`, **F-12**) |
| multicopter (wingless) | MTOW 2876.50, converged; **`Swing = 0` while MAC/SM_vt are `null`** | inconsistent zero-vs-null |
| **multicopter + sedCell = 0** | **`MTOW = null, Wempty = null, Wbat = null, massBalanceGapKg = null`**; only `r2Diverged` survives | **`sanitiseWingless` MASKS a genuine numerical failure** (**F-R14**) |
| convTolExp = 0 | MTOW **2746.74** vs the tight 2772.06 (**-0.91 %**), `r2Converged = true`, 6 iterations | **F-R19** |
| **`{}` empty object** | `runSizing: propDiam ... received undefined` | **REFUSED + EXPLANATION** |
| **unknown `aircraftClass`** | `Unknown aircraft class "nope". Known classes: ...` | **REFUSED + EXPLANATION** |
| **unknown / typo param key** | **silently ignored**, baseline answer returned | **REFUSED SILENTLY — there is no input schema in any class** |

## Other classes

| case | observed | class |
|---|---|---|
| trainer `rangeNm = -518` | gross 1804.1 lb, **usable fuel -108.86 lb**, `converged:true`, `stopReason:null` | **NEGATIVE FUEL, fully converged, no flag** (**F-02**, lead-verified) |
| trainer `reserveMin = -1000` | usable fuel **-320.28 lb**, reserve **-442.64 lb**, `converged:true` | same |
| transport `economyClass = -50` | **grossLb = -12,330.5 (NEGATIVE MASS)**, `converged:false`, but `stopReason` reads *"gross weight ran away"* | **NEGATIVE MASS with the wrong diagnosis** (**F-R25**) |
| transport `numEngines` 0 or 1 | `A transport here has 2 to 4 engines` | **REFUSED + EXPLANATION** |
| transport range 1e5 nmi, Mach 2.5, `clMaxTakeoff` 0, runway 300 m | `converged:false` + `stopReason:"gross weight ran away (no aircraft closes these requirements)"` | **PASS — the transport class refuses properly** |
| transport `reserveMin` 0 / 45 / 600 / -45 | **all bit-identical** | **the control is inert** (**F-03**, lead-verified) |
| transport landing field 20,000 m | `converged:true`, requirement **missed by 16,561 m**, no flag | **F-15** |
| `takeoffThrustToWeight(p, 600, 400)` | **NaN**, no reason | **REFUSED SILENTLY** |
| `flightEnvelope(result)` with S = 0 | **`null`**, no reason — while the Part 23 case one line below returns a full `{unavailable, why}` | **REFUSED SILENTLY** |
| **`certificationClimb` MTOW = 0** | **gradient 968,252 %, `pass: TRUE`** | **F-R01, CRITICAL**, lead-verified |
| **`certificationClimb` vCruise = 0** | **gradient 2.39e9 %, `pass: TRUE`** | **F-R01, CRITICAL**, lead-verified |
| `certificationClimb` LD = NaN, hasWing = true | `applicable:false` with basis *"this layout is rotor-borne"* | **the wrong explanation for a numerical failure** |
| `loadCases` MTOW = 0 | `nLimit = NaN` but `governingCase = "symmetric manoeuvre 3.5g"` | **NaN labelled as a clean case** |
| drone: payload < 0, endurance <= 0, usableFraction outside (0,1], altitude < 0, rotors < 3, any of 5 declared inputs missing | **THROWS, by name, with the reason** | **REFUSED + EXPLANATION on every case** |

## Verdict

| Phase 18 requirement | verdict |
|---|---|
| reject invalid cases | **FAIL** for the eVTOL and trainer classes; **PASS** for the drone; **mostly PASS** for the transport |
| explain why | **PASS where a refusal exists** — `propDiam`, `numEngines`, `aircraftClass` and the whole drone module refuse by name with the received value. **FAIL** for the silent refusals (NaN, `null`, clamped bounds) |
| never silently produce plausible nonsense | **FAIL** — 14 distinct cases produce a converged, unflagged, plausible-looking number for an input that is physically impossible |
| no negative mass or energy | **FAIL** — trainer negative fuel with `converged:true`; transport negative gross mass |
| no SoC outside 0-1 | **PASS** in the result (SoC is an input); but `socMin = 1.5` is **accepted** and inverts the battery-mass monotonicity |
| no MTOW <= payload | **PASS** directly; but `payload = 1e6` gives a mass-closure gap of **419 % of MTOW**, which is the same pathology one level down |

**The single clearest observation.** The repository already contains, in three places, exactly the
refusal discipline the rest of it lacks: the `propDiam` guard, the transport's `numEngines` and
`stopReason` behaviour, and the whole of `src/classes/drone/sizing.js`, which **refuses all five of
its declared inputs by name** and refuses to extrapolate a measured propeller curve. Applying that
one pattern to `runSizingCore` and `sizeTrainer` would close most of this matrix.
