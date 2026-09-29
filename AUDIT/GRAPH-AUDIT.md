# GRAPH / CHART AUDIT (Phase 12)

Commit `3a7a5a4`. Every chart in the tree: x variable, y variable, units, the state it reads, and
an independent recomputation of at least two plotted points. Perturbation-tested for staleness.

## Chart inventory and spot-checks

| chart | x | y | units | state read | spot-check: plotted vs recomputed |
|---|---|---|---|---|---|
| `EnvelopeViews` V-n | EAS | n | kt, - | `flightEnvelope(result)` | corner (251.45, 2.5): (v_A/v_S1)^2 = **2.5000** exactly. Gust at V_C 1.6049 vs recomputed 1.6049. **PASS** |
| `StructureViews` ShearMoment (4 panels) | y (m) | kN/m, kN, MN·m, kN·m | ok | `wingBox(result)` | responds to design; stations move on range x1.3. **PASS** |
| `StructureViews` FuselageLoadDiagram | x (m) | kN, MN·m | ok | `fuselageLoads` | peak abs(M) at x = **16.865** = `x_wing` **16.865**, delta 0.000. **PASS** |
| `StructureViews` StressMargin | y (m) | MPa | ok | `box.stations` | Ftu/Fcy from `box.material`. **PASS** |
| `BalanceViews` LoadingDiagram | mass (kg) | % MAC | ok | `bal.envelope.loading` | fwd/aft at ZFW 4.14 / 47.87 %; recomputed (x-xLemac)/mac = 4.14 / 47.87. **PASS** |
| `ConstraintDiagramTab` | W/S N/m^2 | kg/kW | ok | `constraintDiagram(params,{CD0,DL,download})` | design point 5.013 kg/kW is on the binding hover curve and below cruise 15.805 / climb 7.977 / turn 13.088 — **but 4.645 kg/kW for the sized aircraft. F-G10** |
| `ConvergenceTab` MTOW history | iteration | kg | kg | `SR.convData` | last = 2772.1 = `SR.MTOW` 2772.06. **PASS** |
| `ConvergenceTab` Energy history | iteration | kWh | ok | `SR.convData` | last = 164.85 = `SR.Etot`. **PASS** |
| `ConvergenceTab` residual bars | iteration | log10 abs(dW0) kg | ok | `SR.convData` | min drawn -4.6299 < log10(tol) -4.5572, but **off by one iteration and the converging bar is null. F-G11** |
| **`ConvergenceTab` T/W vs MTOW** | T/W | kg | ok | `SR.twSweepData` | **2016.8 kg at every T/W from 1.00 to 1.50**; converged MTOW at T/W 1.30 is **2772.06** -> **-27.25 %**. **F-G02, lead-verified** |
| `ConvergenceTab` tolerance table | 1e-1 … 1e-10 | kg | ok | `SR.tolSweepData` | converges to **2033.21** against the same tab's KPI **2772.06** -> **-26.65 %**. **F-G03** |
| `ConvergenceTab` T/W table, P_hov column | - | kW | ok | recomputed in the tab | **489.2 kW** against `SR.Phov` **596.81** (-18.0 %); the tab's formula is exactly **1.3000x** the engine's on identical W and DL, i.e. T/W applied twice. **F-G03** |
| `MissionTab` Power / Energy / SoC / Velocity | t (s) | kW, kWh, %, m/s | ok | `SR.powerSteps` etc. | max P 596.8 = `SR.Phov`; final E 164.85 = `SR.Etot`. **PASS** |
| `MissionTab` phase bars | phase | "% of max" | - | SR phase scalars | sum E 164.849 vs 164.85; sum t 2779.2 vs `Tend` 2779.1 — values correct, but **the axis label is wrong for 2 of 3 series. F-G08b** |
| `PerformanceTab` V-n | v | n | kt | `SR.vnData` | correctly frozen against MTOW (V-n at fixed W/S is weight-independent) and moves with `wingLoadingNm2`/`vCruise`. **PASS on data**; **4 ReferenceLines cannot render. F-G07** |
| `PerformanceTab` payload-range | payload (kg) | range (km) | ok | `SR.rpData` | 1,139 points, responds. **PASS** |
| **`WingAeroTab` Drag Polar / Lift Curve / L/D** | CD, alpha, alpha | CL, CL, L/D | - | `SR.polarData` | **max plotted L/D 158.34 with `SR.LDact` 9.77 drawn as a reference line on the same axis (16.2x)**; series **byte-identical** when CD0tot moves -5.9 %; lift slope 7.008/rad vs 5.351/rad; `CL(0)` hard-coded 0.40. **F-G06** |
| `CostTab` pie / drivers / profit-vs-LF | - / % / LF % | $ | ok | tab-local economics | slices sum to `totalCost_per_flight`. **PASS** |
| `CostTab` battery degradation | cycles | SoH % | ok | tab-local `1-0.20(c/c_ref)^0.8` | SoH(c_ref) = 80.0 % = the reference line by construction. **PASS**; y-domain floor 50 unreachable (model floors at 60) |
| `MonteCarloTab` 6 histograms / CDF | binned value | count, % | ok | `mcResults` | bin arithmetic correct; **>=9 ReferenceLines cannot render. F-G07** |
| `NoiseTab` SPL vs distance | r (m) | dBA | ok | `SR.dBA_*m` | r = 5, 10 omit the +2.5 dB ground term and r >= 25 include it — **consistent with the declared model** (`NoiseTab.jsx:341`). **PASS** |
| `NoiseTab` BPF spectrum | Hz | dBA @150 m | ok | `SR.bpfHarmonics` | responds. **PASS** |
| `NoiseTab` contour map | m | m | m | `SR.dist_*dBA` | rings correct; **rotor positions fabricated under a caption saying "Distances to scale". F-G05b** |
| `panels/charts` PhaseDurationPie | - | s | s | SR phase times | sum = 2779.2 = `Tend`. **PASS** |
| `panels/charts` MTOWPie | - | kg | ok | `Wempty + Wbat + payload` | 2772.07 vs MTOW 2772.06 (rounding). **PASS** |
| **`panels/charts` DragPie** | - | CD0 | - | `SR.dragComp` | centre total 0.04333 = `CD0tot` 0.043324 — **but 7 colours over 9 slices, and the largest slice (Landing Gear, 34.6 %) is one of the two that miss out. F-G08c** |
| `StabilityTab` CG bar / weight bars / CG travel / SM | - | m, kg, m, % | ok | SR | `pct = (x/fusLen)*82+10` matches the 10-92 % body; no clamping triggered. **PASS** |
| `aircraft/charts.jsx` ConstraintChart / PayloadRange / Polar / HBar / ReferenceScatter / LineFamily | per caller | per caller | ok | passed-in data | `ReferenceScatter`'s log-x is justified (MTOW spans decades); `logTicks` can return a 2-tick set on narrow ranges (cosmetic). **PASS** |

## Staleness / responsiveness test

Nine inputs perturbed, each series checked for movement:

| series | responds? | verdict |
|---|---|---|
| `polarData` | **frozen** under payload, range, propDiam, nPropHover, twRatio | **F-G06** |
| `vnData` | frozen under those five, moves under `wingLoadingNm2` and `vCruise` | **correct** — a V-n diagram at fixed W/S is weight-independent |
| `twSweepData` | **frozen against its own x variable** | **F-G02** |
| everything else | responds | PASS |

**Memoisation is clean.** Every `useMemo` keys on `[result]` or `[SR, params]`; the two frozen
series are frozen **in the engine**, not by React caching. So this is not a staleness bug in the
UI layer — it is a modelling defect in the series generator.

## Phase 12 checklist, answered

| question | verdict |
|---|---|
| x-axis variable correct | **PASS** except F-G02 (the x variable is unused) |
| y-axis variable correct | **PASS** except F-G06 (2-D polar on aircraft axes) |
| units correct | **PASS** throughout; no silent unit change found |
| values come from current model state | **PASS** — no stale cache; two series stale at source |
| axis transformations correct | **PASS** |
| interpolation honest | **PASS** |
| labels correspond to variables | **FAIL** — F-G08b (axis label wrong for 2 of 3 series), F-G09 (dimension label 24.7 % off the line it annotates) |
| legend corresponds to series | **FAIL** — F-G08c (7 colours, 9 slices) |
| log scales justified | **PASS** — the only log axis spans decades of MTOW |
| plotted data and table data agree | **FAIL** — F-G03 (two tables contradict the same tab's KPI by -26.65 % and -18.0 %) |
| physical constraints independently tested | **PASS** for the V-n corner and gust slopes, the constraint-diagram binding curve, and the fuselage load peak; **FAIL** for the constraint diagram's design point (F-G10) |
