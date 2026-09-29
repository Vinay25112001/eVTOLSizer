# NUMERICAL PRECISION / STABILITY AUDIT (Phase 21)

Commit `3a7a5a4`. Phase 21's governing rule: **never use rounded UI values as calculation inputs.**

## The scale of the rounding

`src/engine.js` contains **269** `toFixed` sites, **260** of them inside the single results-object
literal at `:3661-4058` (259 distinct keys). **Every scalar output of the eVTOL engine is rounded,
and there is no unrounded channel.** By contrast `src/classes/aircraft/engine.js`,
`transport/size.js`, `trainer/size.js` and `turboprop/size.js` contain **zero** `toFixed`.

## Structural PASS — rounding does not enter the convergence core

This is the most important result in this section and it is a good one. The physics modules —
`engine/weights.js:207-693`, `engine/loadcases.js:216-220`, `engine/wingbox.js:172`,
`engine/landinggear.js:185-239` — are called at `engine.js:1221, 1438, 2255, 2521` with **object
literals built from the loop's unrounded locals**, not from the results object. So the MTOW fixed
point, the mass closure and the energy closure are all computed at full precision, and the rounding
is applied only on the way out.

Two further deliberate, correct uses, worth crediting: `engine.js:1846`
`wingLEfracForTargetSM` rounds to 4 dp **because the scan grid is 0.0005**, so the rounding
corrects float drift rather than introducing it; and `engine.js:3736-3742` exports the lossy
rounded `weightBreak` series **beside** the unrounded `weightGroupsRaw`, with the reason written
down — the pattern the rest of the object does not follow.

## Where rounded values ARE reused

| rounded field | at | dp | consumer doing arithmetic | injected error |
|---|---|---|---|---|
| `xNP`, `xCGtotal` | `:3847` | 3 | `CertificationTab.jsx:53` `cgRange = abs(xNP - xCGtotal)/MAC`; `StabilityTab.jsx:170`; `VTailTab.jsx:461`; `report.js:610` | the difference is 0.202 m; +/-1e-3 m gives **0.495 %** against 1.33e-4 on each input — **amplification 37.1x** (measured 36.7-42.6x over 11 cases) |
| `xCGempty` | `:3847` | 3 | `StabilityTab.jsx:235` `abs(xCGtotal - xCGempty)` | difference 0.118 m, **amplification 60.1x**, then displayed to 1 mm |
| **combined** | | | | **the app displays two different static margins for one design, differing by up to 0.069 percentage points of MAC.** The gate is 5-25 % MAC, so at a band edge **the colour is set by the third decimal of a rounded station** |
| `SM` | `:3830` | 4 | **`engine/wingPosition.js:80` — the wing-position root-finder's own objective** | the objective is a staircase quantised at 1e-4; `dSM/dfrac ~ 5.43` gives 1.84e-5 in frac = **0.16 mm of wing station**. `smTol = 1e-3` is 10x the quantum, so detection is safe. **PASS, narrowly** |
| `MTOW`, `Drotor`, `TipSpd` | `:3662,3848,3849` | 2,3,1 | `engine/configuration.js:1163-1168` — the OEI-controllability T/W fixed point | 2.4e-6 to 2.5e-4 relative, all >=20x inside that loop's `tol = 5e-3`. **PASS** |
| `MTOW` | `:3662` | 2 | `data/vsp-models.js:388-412` damped fixed point, `relTol 1e-4` | the threshold `1e-4*M` falls **below** the 0.005 kg quantum whenever M < 50 kg, so the test is below its own objective's resolution there |
| `Phov`...`Pres`, `Swing`, `CD0tot` | `:3663,3686,3688` | 2, 2, 7 | `engine/profile.js:45-85` re-derives mission energy and off-design cruise power | <=6e-5 relative on energy; `Swing` dominates at 3.4e-4 |
| `Eto`...`Eres` | `:3685` | 3 | `BatteryTab.jsx:64` cumulative; `report.js:522-527` | worst case +/-3.0e-3 kWh, **printed to 4 dp — 30x finer than the accumulated error, and the fourth decimal is structurally always 0** |
| `Etot`, `PackkWh` | `:3685,3853` | 3 | the reserve margin `(1 - Etot/PackkWh)` at 9 sites | amplification 5.3x |
| `MTOW` | `:3662` | 2 | **`engine/uncertainty.js:139-148`, `explore.js:99,208`, `SensPanel.jsx:36` — sensitivity and optimiser DIFFERENCES** | +/-0.01 kg noise floor. Measured tail: `vtTaper half = 0.0300 kg`, so **33 % of the smallest reported sensitivity contribution is rounding — the ranking's tail is noise** |
| **`OEI_margin_pct`** | `:4047` | **2** | **`RegTrackerPanel.jsx:27,58` — compared to 0 in a PASS/FAIL badge**, itself re-rounded to 1 dp | **REUSED IN A REGULATORY DECISION.** Lead-verified: `+(-0.04).toFixed(2) -> -0.04`, then `+(-0.04).toFixed(1) -> -0` (negative zero), and **`-0 >= 0` is `true` in JavaScript** — so any true margin in the band **(-0.045 %, 0)** is badged **PASS**. Confirmed boundary: -0.049 % -> -0.1 -> FAIL; -0.04 % -> -0 -> **PASS** |
| **`Wbat/MTOW`** | `RegTrackerPanel.jsx:46` | **1** | compared to the 55 % battery-fraction threshold | a true 55.04 % rounds to 55.0 and **passes** |
| **`mtow.toFixed(1)`** | `regdb.js:408` | 1 | **displayed beside** an MCTOM scope verdict computed on the **unrounded** value | a 5,700.04 kg design **displays "5700.0 kg" and is judged OUT OF SCOPE** |
| **`maxPayloadAtMTOM`** | `certification.js:153` | **0** | **the rounded value IS the answer** to "how much can it carry inside the category?" | returns `{payloadKg: 864, mtowKg: 5689.57}`, but re-sizing at 864 kg gives **MTOW 5,694.49 kg** — the reported pair is not a design; and `toFixed(0)` can round **up to 0.5 kg past the last feasible payload, i.e. across the certification limit the function exists to respect** |
| `Cr_`, `MAC`, `Wempty` | `:3686,3687,3662` | 3,3,2 | `export/report.js:282-447` | rounding contributes **0.06 %** of the 60.8 % MAC error at **F-R15** — the stale constant is the defect, not the rounding |
| 18 fields | — | 2-4 | `export/vsp3.js:38-58` via `Number(SR.X) \|\| <literal>` | **F-R27** |
| ~84 further keys | `:3661-4058` | 0-7 | formatted only | **PASS on reuse**; several fail on significant figures |
| ~100 keys | `:3661-4058` | — | not referenced outside `engine.js` | unconsumed |

## Significant figures beyond model fidelity

| displayed quantity | precision shown | the model's own stated band | ratio |
|---|---|---|---|
| `dBA_hover` | 0.1 dBA, against a hard 65 dBA green/red badge | the same tab's disclaimer states **"+/-5 dB accuracy"** | the verdict is undetermined across a 60-70 dBA band and is rendered as a binary |
| `Vstall`, `VA`, `VD` | 0.1 m/s | all three tagged `unverified` in `provenance.js` (+/-25 %) | ~1,000-2,000x finer than the band |
| `Pheat`, `PheatCruise` | 0.1 W | `unverified` | **185,001x** and **43,389x** the band |
| `MTOW` | 0.01 kg | the repo's own `VALIDATION.md` +/-44.3 % envelope; live `uncertaintyBand` **+/-226.4 kg (+/-10.9 %)** | **6 significant figures on a number known to about 2** |
| mission energies | 4 dp | stored at 3 dp | the fourth decimal is structurally always 0 |

`VALIDATION.md:426-431` already states that +/-5 % *"is not a claim that any individual answer is
accurate to 5 %"*. The display contradicts the document.

## Convergence tolerance and the reported error

`engine.js:491-492` `tol = 0.01*max(1,abs(W))*10^convTolExp` is correctly **scale-relative** —
**PASS**, and better than an absolute tolerance. But no statement of the resulting error accompanies
the answer. Measured against the tight value 2,772.06 kg: `convTolExp = 0` gives **2,746.74 kg
(-0.91 %)** with `r2Converged = true` after 6 iterations; the loosest the UI slider allows (`-1`)
gives -0.26 %. So MTOW is displayed to 0.1 kg while the applied threshold can be 2.76 kg.

Six bisection loops run 28-60 iterations on brackets that converge in 9-20 (`certification.js:118`,
`landing.js:191`, `takeoff.js:277`) — harmless, but it means an iteration count is not evidence of
a tight answer.

## Verdict

| question | verdict |
|---|---|
| does a rounded value enter the convergence core? | **NO — PASS**, and the code is deliberate about it |
| does a rounded value enter any solver? | **YES**, three of them; all three are measured and all three are safely inside their own tolerances (**PASS, narrowly**) |
| does a rounded value enter a REGULATORY decision? | **YES — FAIL.** Three cases, one of which turns a negative margin into a PASS through JavaScript negative zero |
| does cancellation of rounded values amplify error? | **YES — FAIL.** 37x and 60x on two CG differences, producing two different static margins for one design |
| are displayed significant figures supportable? | **NO — FAIL.** Up to 185,000x the model's own stated uncertainty band |
| is the convergence tolerance sound? | **PASS** on form (scale-relative); **FAIL** on disclosure (the resulting error is never stated) |
