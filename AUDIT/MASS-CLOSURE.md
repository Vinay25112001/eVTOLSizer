# MASS / WEIGHT CLOSURE AUDIT (Phase 5)

Commit `3a7a5a4`. **Headline: the closure identity is exact in every class**, and every unit
conversion in every empirical weight equation is correct. The one hard defect is an *input* to
the fuselage equation, not a conversion — Raymer's fineness correction is applied twice (F-08).

## Closure residuals

| class | identity as coded | residual measured | verdict |
|---|---|---|---|
| eVTOL, all 6 layouts | `mn = payload + Wempty + Wbat` (`src/engine.js:1445`), asserted as `massBalanceGapKg` at `:4032` | **0.00 kg** on all six. Lead-verified at the default: 1588.99 + 728.08 + 455 = **2772.07** vs `MTOW` **2772.06** (0.01 kg, the 2-dp rounding of the reported parts). Tolerance 2.8e−5 kg | **PASS** |
| eVTOL turboelectric | `+ WfuelOut` | **0.00 kg** (liftcruise: 2505.3 = 455 + 1884.6 + 114.2 + 51.5) | **PASS** |
| eVTOL, **independent route** | `inertiaTensor` mass sum over the same groups plus battery and payload as point masses (`src/engine/inertia.js:104-161` via `hoverqualities.js:55-60`) | `massAccounted` = MTOW to **0.1 kg** on all six, `unplaced: []` | **PASS** |
| trainer | `next = emptyLb + payloadLb + fuel.usableLb` | **0.000000 lb**; `Σgroups − emptyLb = 0.00000000` | **PASS** |
| transport | `next = zeroFuel + fuelRequired` | trace residual **0.432 lb** = 0.00025 % MTOW | **PASS** |
| bizjet | same path | **0.489 lb** = 0.0018 % MTOW | **PASS** |
| turboprop | `turboprop/size.js:216` | < 0.5 lb | **PASS** |
| drone | `m = fixed + packs·packMass` | exact by construction | **PASS** |

**Caveat on the FLOPS classes:** the *returned* `zeroFuel + fuel − gross` is identically zero and
therefore proves nothing — the loop assigns `gross = next` at the break and returns weights
computed at the pre-update gross. The honest residual is the trace value above.

## eVTOL mass ledger — `componentWeights()`, `src/engine/weights.js:202-754`

All 17 lines are inside `Wempty`. Battery and payload are outside it. Equations are imperial
internally, converted at `:203` (`LB 2.20462, FT2 10.7639, FT 3.28084, PSF 0.0208854`).

| line | formula as coded | file:line | original units | source cited | overlap risk |
|---|---|---|---|---|---|
| wing | AFDD93 `5.66411 f_LGloc (W_SD f_L/1000 cosΛ)^.847 n_z^.39579 S^.21754 A^.50016 ((1+λ)/τ)^.09359` ×0.85 | `:246-258` | lb, ft² | NDARC TP-20220000355 §29-1.2 | — |
| fuselage | AFDD84 `25.41 f_LGloc f_LGret f_ramp (W/1000)^.4879 (n_z W_SD/1000)^.2075 S_body^.1676 l^.1512` ×0.90 | `:320-359` | lb, ft², ft | NASA/TP-20250010468 §29-4 | **F-08: `S_body` wrong** |
| vtail | `0.036 S AR^0.25 ×0.82×1000/9.80665` per panel | `src/engine.js:1206-1211, 1953, 2022` | ambiguous | "simplified Raymer eq 15.26" — **misattributed (U-06)** | — |
| gear | CS-27 drop-test energy → strut + tyre + wheel/brake | `src/engine/landinggear.js:168-246` | SI | CS-27.725/727, MOC-4 VTOL.2235; Goodyear Databook 6-2018 | **F-M02** |
| booms | statics: bending + buckling sizing of a CFRP tube + attach | `src/engine/booms.js`, called `weights.js:582-595` | SI | own statics; CFRP properties `[SRC]` | carries rotor support (deliberate) |
| nacelle | AFDD82 engine support `0.0412(1−f_air) w_eng/n^1.1433 n^1.3762` | `src/engine/nacelle.js:91-121` | lb, ft² | NDARC §29-6 | fed **unscaled** `motors` (`weights.js:734` before `tfp` at `:740`) |
| motors | `n · 0.5591 τ^0.6266`, τ = P/ω | `src/engine/motormass.js:66-74` | SI | **[CAL]** fit to 4 EMRAX entries — not published | — |
| inverters | `n · P_mot / 20 kW/kg` | `weights.js:504` | SI | **[CAL]**, no source | vs `electrical` |
| rotors | AFDD82 blade + hub, split stopped/free, ×χ_blade 0.916 ×χ_hub 0.759 | `src/engine/rotorgroup.js:438-459` | lb, ft, ft/s | NDARC §29-2 + NASA deck TECH factors | support excluded → booms/nacelle (documented) |
| cruisePropulsion | `P_cr·share/0.80/5.0 + /20.0 + 2.0 kg/m²·A_disk` | `weights.js:636-643` | SI | **[CAL]** | pusher motor **not** in `motors` ✓ |
| driveSys | AFDD00 `95.7634 n^.38553 P_hp^.78137 rpm_e^.09899 / rpm_r^.80686` | `src/engine/drivesystem.js:93-143` | hp, rpm, lb | NDARC §29-7.4 | **0 at default** (direct drive) |
| flightControls | `0.025 × (MTOW − W_bat)` | `src/engine/flightcontrols.js:146-152` | SI | **[CAL]** n=8 vs NASA/TM-20210017971 Table 12 | basis verified correct |
| electrical | `0.0131 × MTOW` | `weights.js:693` | SI | **[CAL]** backed out of Table 12 | BMS overlap **declared** at `:652-655` |
| ecs | `0.0065 × MTOW` | `weights.js:694` | SI | **[CAL]**, split `[LAY]` | — |
| packSystems | BTMS + BMS + mounts + containment | `src/engine/battery-thermal.js:169-234` | SI | mixed `[SRC]/[CAL]/[LAY]` | **F-M04** + F-M03 boundary |
| avionics | component list × lane count | `src/engine/avionics.js:42-106` | SI kg | `[LAY]` units, architecture per SC-VTOL; corroborated vs FLOPS Eq 108 within 4 % | — |
| furnishings | `15 kg × round(payload/90)` | `weights.js:658, 699-700` | SI | 10.43 `[SRC]` NASA Silva 2024 (23 lb/seat) + 4.57 `[LAY]` | no source for the `/90` seat count |
| *(turboelectric only)* turboshaft + generator + fuelTank | `src/engine/turboelectric.js` | `src/engine.js:1396-1414` | SI | — | **no unusable fuel, no oil** (F-M07) |

### Measured ledger, kg, app defaults (payload 455 kg, 12 rotors) — AGENT-REPORTED

| group | multicopter | sideBySide | liftcruise | tiltrotor | hybrid | hybridPusher |
|---|---|---|---|---|---|---|
| wing | 0.0 | 0.0 | 392.6 | 198.7 | 235.4 | 243.8 |
| fuselage | 232.2 | 185.8 | 355.0 | 227.5 | 254.2 | 260.1 |
| vtail | 0.0 | 0.0 | 59.7 | 21.8 | 21.3 | 29.3 |
| gear | 73.1 | 56.1 | 109.3 | 60.5 | 71.5 | 73.0 |
| booms | 49.8 | 16.8 | 186.2 | 0.0 | 61.6 | 63.3 |
| nacelle | 61.5 | 44.2 | 97.4 | 59.1 | 64.2 | 66.5 |
| motors | 325.9 | 244.0 | 487.1 | 314.5 | 338.1 | 348.7 |
| inverters | 41.7 | 26.3 | 81.1 | 39.4 | 44.2 | 46.5 |
| rotors | 132.7 | 81.1 | 426.3 | 96.5 | 151.9 | 156.7 |
| cruisePropulsion | 0.0 | 0.0 | 131.7 | 0.0 | 0.0 | 19.5 |
| driveSys | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| flightControls | 43.1 | 35.2 | 81.0 | 44.9 | 51.1 | 52.9 |
| electrical | 37.7 | 27.3 | 58.7 | 31.0 | 36.3 | 37.5 |
| ecs | 18.7 | 13.6 | 29.1 | 15.4 | 18.0 | 18.6 |
| packSystems | 86.1 | 56.8 | 122.8 | 65.5 | 73.5 | 76.3 |
| avionics | 92.5 | 92.5 | 92.5 | 92.5 | 92.5 | 92.5 |
| furnishings | 75.0 | 75.0 | 75.0 | 75.0 | 75.0 | 75.0 |
| **OEW** | **1269.9** | **954.6** | **2785.4** | **1342.2** | **1589.0** | **1660.0** |
| battery | 1151.6 | 677.9 | 1240.5 | 566.2 | 728.1 | 749.6 |
| payload | 455 | 455 | 455 | 455 | 455 | 455 |
| **MTOW** | **2876.5** | **2087.4** | **4480.9** | **2363.3** | **2772.1** | **2864.6** |

The `hybrid` column (2772.1 kg) matches the lead's independently obtained 2772.06 kg.

## FLOPS classes — summary

| | transport (737-800 class) | bizjet | turboprop (ATR-72 class) |
|---|---|---|---|
| structure | 44,888 | 8,514 | 18,269 |
| propulsion | 19,727 | 3,763 | 3,947 |
| systems | 24,240 | 5,925 | 10,299 |
| margin | 457 | **0** | **0** |
| empty | 89,311 | 18,202 | 32,515 |
| operating items | 6,772 | 1,019 | 2,007 |
| **OEW** | **96,083** | **19,221** | **34,522** |
| payload | 36,477 | 800 | 14,242 |
| zero-fuel | 132,560 | 20,021 | 48,764 |
| fuel required | 41,164 | 7,643 | 7,226 |
| **MTOW** | **173,724** | **27,664** | **55,990** |

Accuracy context: transport MTOW 173,724 lb against a published 174,200 (**−0.3 %**); OEW 96,083
against 91,300 (**+5.2 %**, inside the declared 10 % band at
`src/classes/transport/validation-cases.js:55`).

## Independent re-implementations (Phase 5 task 5) — AGENT-REPORTED

Each recomputed in Python from the published form, not by calling the app:

| # | equation | reference result | code | agreement |
|---|---|---|---|---|
| 1 | NDARC AFDD93 wing at the converged hybrid state | 235.447 kg | 235.4439 kg | **0.001 %** |
| 2 | NDARC AFDD84 fuselage with the code's `S_body` 25.20 m² | 254.192 kg | 254.188 kg | reproduces the code exactly |
| 2b | the same with the **correct** single-corrected `S_body` 33.54 m² | **266.675 kg** | — | shows the **+12.48 kg** the double correction costs (F-08) |
| 3 | FLOPS simple wing (Eq 2-8) at the converged transport state | 15,629.700 lb | 15,629.673 lb | **2e−6** |
| 4 | EMRAX motor fit, τ = 521.11 N·m | 338.140 kg | 338.133 kg | PASS. The **NASA** regression on the same τ gives 1.59× heavier — the reference-class spread on the largest single mass in the aircraft |
| 5 | FLOPS fuselage Eq 45 | 16,790.2 lb | 16,790.229 lb | PASS |
| 6 | NASA Table 12 electrical+ECS calibration, reproduced from `validation/nasa-vehicles.js` | 2.06 / 2.14 / 1.68 %, mean **1.958 %** | shipped `0.0131 + 0.0065 = 1.96 %` | PASS, and shows MTOW is the **tighter** basis |

## Unit audit of every empirical weight equation

**No Raymer/FLOPS/GASP equation is fed metres or kilograms anywhere.** Verified conversion by
conversion for: AFDD93 wing, AFDD84 fuselage, Raymer 15.48 (opt-in), AFDD82 rotor blade+hub,
AFDD82 engine support, AFDD00 gearbox, AFDD82 flight controls, the NASA motor torque regression,
GASP V.1.57-1.80 (all trainer lines), FLOPS Eq 2-8/45/48-49/70-75/99-130, and the Hamilton
Standard propeller. The imperial↔SI boundary is clean in every module.

Two equations are dimensionally inconsistent **by construction** because their coefficients were
calibrated in mixed units: the landing-gear strut `[CAL]` (`kg = 4.4e-5·J·m·1000`) and the V-tail
area-density form. Neither is a conversion bug; both are recorded as F-M02 and U-06.

## Findings

| id | finding | severity | status |
|---|---|---|---|
| **F-08** | Raymer's fineness correction applied **twice** to the fuselage wetted area. Lead-verified: 33.472 m² (drag) vs 25.132 m² (weight), **24.9 % smaller**; and **62.8 % smaller** on a stubby pod, wrecking the spheroid branch that exists to protect that regime. Comment above claims the modules "disagree on nothing." Worth **+1.35 % to +1.61 % of MTOW** on all six layouts. | HIGH | **VERIFIED** |
| **F-M02** | The landing-gear `[CAL]` coefficient does not reproduce its own stated calibration. `landinggear.js:129` `strutMassCoef: 4.4e-5` is justified at `:214-219` as recovering Roskam's 4–6 % of MTOW; measured, the app default gives **2.44–2.98 %** and the relief-free "conventional" case **3.56–4.02 %**, touching the band only at the lightest point. If the 5 % midpoint is right, gear goes 71.5 → 138.6 kg, **+2.42 % MTOW**. Mitigating: `provenance.js:432` does carry the caveat that an eVTOL may sit below the band. | MEDIUM | AGENT-REPORTED |
| **F-M03** | Two harnesses score the same published NASA `systems_lb` on two different group boundaries. `validation/components.mjs:253-254` states the comparison **excludes** battery packaging and flight controls; `validation/nasa-configs.mjs:277-278` **includes** both. At the hybrid default the extra terms are 51.1 + 73.5 = **124.6 kg against a ~243 kg published total — a +51 % inflation of that comparison.** No effect on MTOW; it corrupts the instrument used to judge the systems groups. | MEDIUM | AGENT-REPORTED |
| **F-M04** | Declared BMS / HV-distribution double count. `weights.js:652-655` states it outright; BMS = 23.1 kg against `electrical` 36.3 kg — upper bound on the overlap **23.1 kg = 0.83 % MTOW**. Declared and quantified, not hidden, but it is in the number. | LOW | AGENT-REPORTED |
| **F-34** | `weightBreakBasis` names the wrong method ("Raymer component buildup" for an NDARC/AFDD/GASP/CS-27 buildup). | LOW | AGENT-REPORTED |
| **F-M06** | The lagged `packSysPrev`/`WbatPrev` sit outside the convergence test. **Measured converged**: in-loop `packSystems` vs the post-loop recomputation differs by 0.03–0.42 kg (≤ 0.015 % MTOW), and `fcDetail.basisKg` equals `MTOW − Wbat` **exactly** on all six layouts. Converged in fact, unproven by the criterion. | LOW | AGENT-REPORTED |
| **F-M07 / U-04** | No paint / trapped-fluid line in the eVTOL ledger; **no unusable fuel or oil in the turboelectric path** (`engine.js:1396-1414` adds engine + generator + tank and nothing else). Paint is **UNVERIFIED** because AFDD/GASP regressions are fitted to as-built aircraft and may contain it implicitly; order 31 kg (1.1 % MTOW) if genuinely absent. | LOW / UNVERIFIED | AGENT-REPORTED |
| **F-35** | Unguarded negative-going GASP equipment terms (`trainer/weights.js:193, 202`). | LOW | AGENT-REPORTED |
| **F-M09** | bizjet passenger service charged on **installed** seats (9) while payload is charged on **carried** passengers (4) — 289.1 lb against 128.5 lb, **+0.58 % MTOW**. Deliberate and documented at `flops-weights.js:161-163`; furnishings-on-seats is FLOPS's own convention, service is the arguable one. | LOW / WARNING | AGENT-REPORTED |
| **O-01** | NASA deck rotor technology credits (`χ_blade 0.916`, `χ_hub 0.759`) are the **global default** for every design, not just the NASA harness. Leverage, setting both to 1.0: **+1.68 % to +3.89 % MTOW**. Fully declared and argued at `provenance.js:54-55`, so **not a defect** — but it is the largest single default credit in the ledger and it is a NASA-vehicle calibration. | observation | AGENT-REPORTED |

## Double counting — specifically cleared, with evidence

| checked | result |
|---|---|
| motor mass counted twice | **PASS** — `motors = nPropHover × one`; the pusher is separate in `cruisePropulsion`; `nPropHover` is the hover count and excludes the pusher |
| battery counted twice | **PASS** — outside `Wempty`, once in `mn`; `inertiaTensor` adds it as `extra` exactly once and `massAccounted` = MTOW |
| propeller counted twice | **PASS** — `rotors` (AFDD blade+hub) and `cruiseProp` are disjoint discs |
| rotor support counted twice | **PASS** — the AFDD rotor group here is blades+hub only; support lives in `booms.js` + nacelle pylon, and `nacellePylonFrac` defaults to **0** for exactly that reason |
| payload inside empty mass | **PASS** in every class. eVTOL `furnishings` are seats, not occupants. The FLOPS classes put crew **people** inside OEW, which is the correct FLOPS/airline convention, and the 127 lb/flight-crew in `furnishings` is the seat |
| structural fraction on the wrong reference mass | **PASS, verified by reproducing the calibration.** `flightControlsFrac` is on airframe (`MTOW − Wbat`, exact on all six layouts); `electricalFrac`/`ecsAntiIceFrac` are on MTOW, and re-basing on airframe gives a **26.3 % spread against 23.4 % on MTOW** — so MTOW is the tighter basis and the code is right to treat the two differently |
| gear fraction on the wrong weight | **PASS** — FLOPS uses `landingWeight = GW × 0.84` (FLOPS's DLW); the trainer's `skLG = 0.05087` is literally 117 lb / 2300 lb from GASP Fig V.1.5, a gross-weight basis, applied to gross |
| `gearFracMTOW: 0.040` | genuinely dead code, confirmed by grep; self-documented |
| the analysis structure modules | **PASS** — `classes/aircraft/wing-structure.js`, `fuselage-structure.js`, `fuselage-bending-material.js`, `engine/wingbox.js` are analysis layers only; **none feeds OEW**. `engine.js:2494-2505` states the wingbox is "Reported, NOT used for mass" |
