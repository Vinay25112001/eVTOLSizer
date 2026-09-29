# GEOMETRY / DIAGRAM AUDIT (Phase 11)

Commit `3a7a5a4`. Every drawn coordinate was traced to its numerical source and then asserted
numerically. Nothing was eyeballed. The project's own standing rule is the standard applied:
*a drawing shows computed quantities and sourced conventions and nothing else.*

## Numerical assertions — results

### Lateral symmetry — PASS everywhere

| test | result |
|---|---|
| General arrangement: every paired y (wing root/tip, HT, nacelles, propellers), four classes | max \|left.y + right.y\| = **0.000e+0** (built by sign flip) |
| eVTOL 3D rotors (12) | Σy = **−1.78e-15 m** |
| eVTOL triangle mesh, 8,556 vertices | worst mirror distance **9.891e-5 m** = 6.0e-5 of the 1.65 m fuselage diameter, at the superellipse top/bottom vertex — a `Math.sign(cos a)` float artefact in `src/engine/mesh.js:41-43`. PASS |
| Drone `FrameDiagram` `motorXY` (`x = C + r·sin a`) | odd in a → exact |

### Local cross-section symmetry — PASS

`sectionStringerPoints` (`src/classes/aircraft/geometry.js:379-407`): every stringer has an
exact mirror. Σy = **2.64e-16** (transport, n=52), **−1.64e-15** (turboprop, n=38),
**1.39e-17** (trainer, n=17 — odd, one stringer on the keel).
max \|(y/a)² + (z/b)² − 1\| = **2.2e-16**. **The odd-count defect fixed in `9dfc88c` is
genuinely fixed.**

### Longitudinal profile (upsweep) — PASS on sign and closure; shape defect stands

These three are distinct and are reported separately, as Phase 11 requires. Upsweep is
**correctly asymmetric** and must not be confused with the two symmetries above.

Transport: crown falls H/2 = 1.984 m → 0.389 H = 1.544 m (drop 0.440 m); keel rises −1.984 m →
0.122 H = 0.484 m (rise 1.500 m); net upsweep 1.060 m. **Crown sits above keel on every class**
(transport 0.389 > 0.122, turboprop 0.389 > 0.243, bizjet/trainer 0.22 > 0.05), so the drawn
tip face is not inverted — the `46c7a1d` fix holds.

The **shape** defect is unchanged and was carried into this audit as established context: the
tail-cone control points `crownControlX 0.40` / `keelControlX 0.45`
(`src/classes/aircraft/geometry.js:140`) and `tailLen = min(0.26 L, 3.0 D)` (`:745`) are
**shared, unsourced constants used identically by all four classes**, and a fit against the
A320's digitised contour leaves the crown nearly right (rms 0.0178 → 0.0169 H) and the **keel
wrong by 2.8×** (rms 0.1435 → 0.0515 H; fitted cone 0.374 L, control 0.67). See **F-G15** for
the four drawings this reaches.

### One vertical datum — PASS with three cross-view exceptions

z = 0 on the fuselage centreline, used consistently by plan (`pY`), side (`sZ`), front (`fZ`),
`FuselageProfile` (`cz`), `FuselageSection` (`cy`) and `StationDiagram` (`cz`). Ground line
`sZ(zBot)` = `fZ(zBot)` identically. Vertical CG correctly converted
(`cgZ = zBot + gear.verticalCg.eM`). Exceptions: **F-G05** (nacelle/propeller z), **F-G08a**
(T-tail `htZ`), **F-G08b** (fin root z).

### Station positions — drawing vs model

| station | drawn | model | delta |
|---|---|---|---|
| **Wing root LE, transport** | **14.449 m** | `balance.xWingRootLE` **11.683 m** | **+2.766 m = 7.3 % L = 66.0 % MAC** |
| — bizjet / turboprop / trainer | 6.707 / 10.323 / 2.153 | 7.644 / 10.694 / 3.816 | **−0.937 (−41.0 %) / −0.370 (−15.1 %) / −1.662 (−110.7 %)** |
| MAC tick vs drawn wing LE at y_MAC, transport | tick 15.398; drawn LE 17.184 | — | **−1.786 m = −42.6 % MAC** |
| Local chord at y_MAC vs the MAC label | 4.5139 m drawn | 4.1904 m labelled | **+7.7 %** |
| Nose / main gear station | 4.2967 / 17.8917 | `xCg ∓ A/B` identical | **0** |
| Wheelbase dimension | 13.5950 | `gear.geometry.wheelbase` 13.5950 | **0** |
| CG fwd/aft in % MAC | 15.572 / 17.404 → 4.1 / 47.9 % | recomputed 4.1 / 47.9 % | **0** (internally consistent) |
| `x_wing` marker, fuselage-load diagram | 16.865 | `xLemac + 0.35 mac` = 16.865; peak \|M\| at 16.865 | **0** |
| Front / rear spar, transport | 0.10 c / 0.60 c | `box.geometry`, sourced | **0** |
| Fuselage L/W/H, nose, tail, closure — GA vs `fuselage-structure` vs `balance` | 38.0238 / 3.75818 / 3.96874 / 5.32333 / 9.88619 / keel 0.122 / crown 0.389 | identical in all three | **PASS to 1e-15** |

**The wing-station row is the audit's most serious geometry finding** (F-G01), and it was
verified independently by the lead.

### Scale — PASS in 8 of 10 SVGs

1 SVG unit = 1 m in **both** x and z in `GeneralArrangement` (`pX/pY/sX/sZ/fY/fZ`),
`FuselageProfile`, `FuselageSection`, `StationDiagram`, `BoxSection`, `StructuralPlanform`,
the `WingAeroTab` planform and the `NoiseTab` contour (0.38 px/m both), all with the default
`preserveAspectRatio`. Exceptions: `CrossSectionPreview`'s airfoil (**1.556× vertical
exaggeration**) and its planform panel (**fixed pixels**) — F-G12.

### V-n diagram — PASS

(v_A/v_S1)² = **2.5000** = `manoeuvreN` — the corner closes exactly on all three classes.
(v_H/v_S1neg)² = **1.0000**. Gust-line slopes dn/dV at V_B, V_C, V_D are in the ratio
**1 : 1.0000 : 0.5000**, exactly as the post-1996 rule requires and as the module's header claims.

---

## Findings

### F-G01 — The general arrangement draws the wing at an unsized convention while the computed station exists, and hangs the MAC, CG envelope and every %-MAC figure off the computed one — HIGH — **VERIFIED BY THE LEAD**

`src/classes/aircraft/geometry.js:747-748`:
```js
const wingRootLE = drawn(type === "trainer" ? 0.26 * L : 0.38 * L,
                         "wing longitudinal position needs a balance model (audit Gap 6)");
```
**The balance model is built.** `src/classes/aircraft/balance.js:204,207` computes `xLemac` and
`xWingRootLE` from Scholz (10.24), under the comment *"The root leading edge, which is what a
drawing needs."*

`GeneralArrangement.jsx:317-319` draws the wing polygon from the 0.38 L convention, while
`:374-381` draws the MAC bar and LE tick at `cg.lemac`, and `:387-389, 463-469` draw the CG
envelope and take-off CG symbol on that same computed datum. So the drawing mixes the two.

Lead-verified magnitudes (via `designAircraft` → `generalArrangement` / `balanceOf`):

| class | L (m) | drawn LE | computed LE | delta (m) | % of MAC |
|---|---|---|---|---|---|
| transport | 38.024 | 14.449 | 11.683 | **+2.766** | **+66.0 %** |
| bizjet | 17.651 | 6.707 | 7.644 | −0.937 | −41.0 % |
| turboprop | 27.167 | 10.323 | 10.694 | −0.370 | −15.1 % |
| trainer | 8.281 | 2.153 | 3.816 | **−1.662** | **−110.7 %** |

On the transport the MAC bar sits **1.786 m (42.6 % of MAC) forward** of the drawn wing leading
edge at its own spanwise station. **On the trainer the MAC bar lies entirely aft of the drawn
trailing edge.** Second consequence: `BalanceViews.jsx:112` draws the MAC rectangle at
`bal.xLemac`, so the Balance tab and the General Arrangement show the same aeroplane's wing
**2.766 m apart**.

This is precisely the "same aeroplane drawn two ways" failure that `geometry.js:87-97` and
`:750-757` were hoisted to prevent. No gate compares the two: `xWingRootLE` appears in
`validation/` only in `loading-diagram.mjs` fixtures.

**Why HIGH and not CRITICAL:** the drawing is downstream of sizing, so no sized number moves.
But the drawing is internally inconsistent, and the CG envelope — the thing a reader most needs
to trust — is annotated against a wing drawn somewhere else.

### F-G02 — The T/W trade chart never uses the variable it sweeps — HIGH — **VERIFIED BY THE LEAD**

`src/engine.js:2442-2464`. `tw` appears in the `.map(tw => {…})` signature and then **only in
the returned object** at `:2463`; the loop body computes `DLtw` and `Phov_tw` from `W` alone,
under explicit `// T/W=1.0` comments at `:2446-2447`.

Lead-verified: **one distinct `R2` value, 2016.8 kg, across all nine T/W points** (1.00 → 1.50).
`ConvergenceTab.jsx:163-226` plots that flat series captioned *"Round 2 scales as T/W^1.5 —
higher thrust margin → higher hover power → heavier battery → higher MTOW"*, with a reference
line at the current T/W and constant ΔM / Δ% table columns. At the design T/W = 1.30 the chart
says 2016.8 kg against the converged **2772.06 kg** = **−27.25 %**.

The `twRatio` slider *does* move real numbers elsewhere
(`src/engine/sizing-conditions.js:200`), which is what makes the flat chart look like a result.

### F-G03 — Two ConvergenceTab tables contradict the same tab's own KPI, and one applies T/W twice — HIGH — AGENT-REPORTED

(i) `src/engine.js:2404-2436` `tolSweepData` is a simplified re-solve seeded at a literal
`m1 = 2177` (`:2409`). It converges to **2033.21 kg** at 1e−10 against the KPI's **2772.06 kg**
on the same screen — **−26.65 % (−738.9 kg)**.
(ii) `ConvergenceTab.jsx:203-204`: `phov2 = W2*d.tw/etaHov * sqrt(DL2/(2*1.225))`, where `DL2`
**already contains** `d.tw`. The engine's own form (`:2417`) has no `tw` in the numerator. Ratio
on identical W and DL = **exactly 1.3000**. Displayed **489.2 kW** against `SR.Phov` **596.81 kW**
= **−18.0 %**. It also hard-codes rho = 1.225 where the engine uses `rhoHov`.

### F-G04 — `CrossSectionPreview` draws a fuselage the model does not contain and prints its invented numbers as dimensions — HIGH — AGENT-REPORTED

`src/panels/CrossSectionPreview.jsx:15-21` is a hard-coded five-station table. Against the
engine's own lofted body (`src/engine/geometry.js:558-600`, RAVEN `swft_fuselage`, used by the
3D view and the VSP export):

| t | preview w × h | engine w × h | Δw | Δh |
|---|---|---|---|---|
| 0.15 | 0.990 × 0.799 | 1.115 × 1.244 | −11.2 % | −35.8 % |
| 0.30 | 1.420 × 1.225 | 1.124 × 1.900 | +26.3 % | −35.5 % |
| 0.38 | 1.650 × 1.452 | 1.124 × 1.867 | **+46.8 %** | −22.2 % |
| 0.70 | 1.188 × 0.871 | 0.681 × 1.067 | **+74.4 %** | −18.3 % |

**The section aspect is inverted**: drawn w/h = 1.136 (wider than deep) against the model's
0.591 (deeper than wide) — a factor of **1.92**. `src/engine/cabin.js:57-66` documents the
reference cabin as 1.5 W × 1.9 H, so the engine is right and the drawing is wrong. `:90-95`
print `cs.h` and `cs.w` **as dimension labels**. `:7-10` also fall back to literals
`1.94 / 0.87 / 12.67 / 9.57` when `SR` is absent — a plausible aeroplane with no model behind it.

### F-G05 — The front view adds a dihedral term the side view and the compliance model omit, so the drawn propeller clearance is 2.84× the certified one — HIGH — AGENT-REPORTED

`GeneralArrangement.jsx:524` (`fZ(n.z + eta·semi·tan(dih))`) and `:528` (propellers);
`geometry.js:791` sets nacelle z = `−max(nD·0.30, 0.25)`, independent of wing station and
dihedral, and the side view (`:433,437`) uses that raw z.

Transport side −0.6472 m vs front −0.1244 m → **Δ 0.523 m = 13.2 % of H**. Turboprop
**Δ 0.425 m = 14.2 % of H**.

Turboprop propeller: `gear-geometry.js:186-188` computes the 25.925(a) clearance as **0.2312 m**
(`requiredM` 0.1778, verdict *"compliant, margin 0.053 m"*). The front view draws the same disc
**0.6564 m** above the ground — **2.84×** the clearance the compliance verdict rests on. A
reader scaling the drawing infers a 0.479 m margin instead of 0.053 m.

### F-G06 — The WingAeroTab charts plot a 2-D aerofoil polar on aircraft axes, do not respond to the design, and carry the aircraft's L/D as a reference line on the same axis — HIGH — AGENT-REPORTED

`src/engine.js:2367-2371`: `CL = 0.40 + 2π(1+0.77 t/c)·α`, `CD = selAF.CDmin + k(CL−CL_cruise)²`,
consumed by `WingAeroTab.jsx:162-199`.

- Max plotted **L/D = 158.34** (α = 1.75°), with `ReferenceLine y={SR.LDact}` = **9.77** drawn on
  the same axis — **16.2× apart**, two different quantities on one scale.
- **Frozen**: `CD0tot` moves 0.043324 → 0.040773 (−5.9 %, payload 455 → 600 kg) and `polarData`
  is byte-identical (CD 0.0183, L/D 61.98 at α = 6°).
- Lift-curve slope drawn **7.008 /rad**; the finite wing at AR 9, e 0.8 is **5.351 /rad** →
  **1.310× too steep**.
- `CL(α=0) = 0.40` is a literal, identical for every airfoil.

### F-G07 — About thirteen `ReferenceLine`s are placed by x on Recharts *category* axes and cannot render — MEDIUM — AGENT-REPORTED, not render-verified

`PerformanceTab.jsx:39` uses `<XAxis dataKey="v">` with no `type="number"`, then `:49-52` place
lines at `x={SR.Vstall}` 40.28, `x={SR.VA}` 67, `x={params.vCruise}` 67, `x={SR.VD}` 83.75 —
none of which is in the category set (nearest categories 40.6, 67.1, 67.1, 84.3).
`MonteCarloTab.jsx:190,223,244,258,278,292` likewise against 40 bin centres. A band scale
returns `undefined` outside its domain, so the marker is dropped silently.
**The audited components get this right** (`EnvelopeViews.jsx:77` and `BalanceViews.jsx:56` both
pass `type="number"`), which is what makes this a defect rather than a misreading.

### F-G08 — Three smaller datum and label defects in the general arrangement — MEDIUM — AGENT-REPORTED

(a) **T-tail height datum mixed.** `geometry.js:767` `htZ = vtHeight·0.92`, measured from z = 0,
while `vt.height` is measured from z = H/2. The tailplane is drawn **1.510 m below the fin tip
(33.6 % of fin height)** on the bizjet and **1.849 m (42.3 %)** on the turboprop, in both side
and front views. The stated intent ("92 % up the fin") requires `H/2 + 0.92·vtHeight`.
(b) **Fin root / overall height.** `GeneralArrangement.jsx:197-201` starts the fin at `sZ(H/2)`,
but the crown at `vtRootLE` has already dropped to 1.9616 m (transport) — a 0.0228 m gap, making
the dimensioned overall height **13.0774 m** instead of 13.0546 m (+0.17 %).
(c) **Front vs plan wing root y**: plan `W/2·0.98` = 1.8415 m, front `W·0.45` = 1.6912 m —
**0.150 m apart for the same root rib**. Front-view tip dihedral rise is taken over the full
semi-span rather than from the root station (1.5375 m instead of 1.3764 m, +0.161 m).

### F-G09 — The WingAeroTab planform draws the LE at the quarter-chord sweep and labels the c/4 line with a value it does not have — MEDIUM — AGENT-REPORTED

`WingAeroTab.jsx:216`: `yTip = yRoot + (b/2)·tan(SR.sweep)`, where `SR.sweep` is Λ_c/4. True
Λ_LE at AR 9, λ 0.4499 is **11.901°**; drawn **9.570°** (−19.6 %). The dashed quarter-chord line
(`:223, 245-246`) then runs at an actual **7.207°** while `:263` labels it **"Λ¼ = 9.57°"** — a
**2.363° (24.7 %)** disagreement between a dimension label and the line it annotates. This is
exactly the defect `geometry.js:55-69` (`leSweepRad`) was hoisted to fix for the aircraft
classes; the eVTOL planform never adopted it. MAC and Ymac are correct (`SR.MAC` 1.555 vs
trapezoid 1.5552; `SR.Ymac` 2.917 vs 2.9176).

### F-G10 — The constraint diagram's design point is not the aircraft that was sized — MEDIUM — AGENT-REPORTED

`ConstraintDiagramTab.jsx:25` feeds `diskLoadingNm2 = SR.DL_lbft2/0.0208854` = **554.3 N/m²**,
but the rotor's installed disc loading is **667.6 N/m²** — **+20.4 %**. The marked design point
is **5.013 kg/kW** (⇒ 552.9 kW) against the sized `MTOW/Phov` = **4.645 kg/kW** (596.81 kW), so
the diagram understates the installed powerplant by **7.4 %**. On x, the `ReferenceDot` sits at
the stall limit 1401.5 N/m² while the design's `wingLoadingNm2` is 1371 (+2.2 %). The hover
curve is otherwise correct and binding, and the design point is below every curve. See also
**F-23** (the same chart runs on e = 0.85 while sizing runs on 0.828).

### F-G05b — The noise contour map's rotors are a fabricated ring, under a caption saying "Distances to scale" — MEDIUM — AGENT-REPORTED

`src/tabs/NoiseTab.jsx:208-213` places all rotors on a circle of radius `SR.bWing/4` at
`i·2π/N − π/2`. The model's own rotor stations are `|y| ∈ {1.336, 4.008, 6.680} m` at
`x ∈ {0.861, 6.890} m`. Drawn ring radius **3.340 m for all twelve**: the outboard rotor is
drawn 3.340 m (50 %) inboard of its computed station, and the real 6.03 m fore-and-aft spread is
replaced by a ±3.34 m ring. The contour rings themselves come from `SR.dist_*dBA` and are correct.

### F-G11 — Residual bars are one iteration out and the converging residual is never drawn — LOW — AGENT-REPORTED
`src/engine.js:2395-2399`: `residual[i]` is `MTOW[i+1] − MTOW[i]` (verified: `residual[0]` =
296.179 = `MTOW[1] − MTOW[0]` = 296.200), plotted at `x = iter`, so each bar is attributed to the
iteration before the change it measures. The last entry is `null`, so the bar that actually
satisfies the tolerance is absent. The caption is nonetheless satisfied by the penultimate bar
(min drawn log₁₀ = −4.6299 < log₁₀(tol) = −4.5572).

### F-G12 — `CrossSectionPreview`'s other two panels are not to scale and do not respond to the design — LOW — AGENT-REPORTED
`:55` `toSVG(x,y) = (PAD + x·180, H2/2 + y·80·3.5)`: x 180 px/chord, y **280 px/chord** →
**1.556× vertical exaggeration**, so t/c 0.15 is drawn as an apparent 0.2333 while `:108` labels
it "t/c = 0.15". That line also renders `NACA ${round(tc*100)}` = **"NACA 15"**, which is not a
NACA designation, for whatever airfoil is selected (the real one is NACA 65-415). `:62-68` draw
the planform at fixed pixels, so **changing the span changes only the text label**.

### F-G13 — `BoxSection`'s dashed "aerofoil thickness envelope" is 60 % of the chord it represents — LOW — AGENT-REPORTED
`StructureViews.jsx:192-193` uses width `w·1.20` where `w` is the **box** width. With
`boxWidthRatio = 0.50` the chord is 2.00× the box width, so the drawn envelope spans **60.0 % of
the true chord** (3.607 m against 6.012 m at the root). Its depth is exactly `t/c·chord`
(ratio 1.000). It carries no dimension and is labelled "for context".

### F-G14 — The drone 3D view calls an oblique projection orthographic — LOW — AGENT-REPORTED
`src/classes/drone/geometry3d.js:199-201`: `sy = cy + scale·(r.z·0.85 − r.x·0.5)`. The `−0.5·r.x`
term leaks the depth axis into the screen vertical, making this a parallel **oblique**
projection. At the default view the apparent screen length of a unit body length is x 0.934,
y 0.961, **z 0.425** — a vertical length reads 44 % of a horizontal one. `Drone3D.jsx:34,46,330`
claim *"orthographic, so a span still reads off the grid"*. Counting grid squares does work (the
grid goes through the same map), but a **vertical** dimension cannot be read off it.

### F-G15 — `fuselageSideOutline` ignores the per-class closure for its control points — MEDIUM — established context
`geometry.js:265` binds `C = FUSELAGE_CONVENTION` unconditionally, so the `closure` argument sets
only the two tip z values while `crownControlX 0.40` / `keelControlX 0.45` and
`tailLen = min(0.26 L, 3.0 D)` stay shared and unsourced. The four drawings this reaches:
`GeneralArrangement` side view (`:173-174`), `FuselageProfile` (`FuselageViews.jsx:61-62`),
`StationDiagram` (`BalanceViews.jsx:98-99`), and — through `fuselageOutlinePoints` — the
**tail-strike search** in `gear-geometry.js:170-181`, which reports a 6.208° rotation angle and a
strike point at (30.534, −1.859) for the transport off that same keel. **The keel shape defect
therefore propagates into a compliance number, not just a picture.**

---

## What passed, and deserves saying

- `FuselageViews` `FuselageProfile` and `FuselageSection`: outline, frames, heavy frames,
  bulkheads, floor, ellipse semi-axes, stringers, floor half-width and the 25.365(e)(2) vent
  square — **all exact** against `fuselage-structure.js`.
- `StructureViews` `FuselageLoadDiagram`: peak \|M\| falls at `x_wing` **exactly** (16.865 m,
  Δ = 0.000).
- `BalanceViews` `LoadingDiagram`: fwd/aft at ZFW 4.14 / 47.87 % MAC, recomputed identically.
- Control surfaces: `surfacePanelPlan` / `trailingEdgeRun` panel maths matches `halfPlanform`
  exactly, drawn from the 747's measured stations.
- Gear: nose/main stations, wheelbase and the tyre static loaded radius are **exact to 0** —
  the `ddfbd96` work holds.
- `drone/FrameDiagram`: motor azimuth, rotation and numbering from ArduPilot
  `AP_MotorsMatrix.cpp`, with ARM/DISC/HUB declared as drawing constants and a caption reading
  "Not to scale". **Exemplary** — this is the standard the other diagrams should meet.
- **Memoisation is clean**: every `useMemo` keys on `[result]` or `[SR, params]`. The frozen
  chart series (F-G02, F-G06) are frozen **in the engine**, not by stale caching — so this is not
  a React staleness problem.
