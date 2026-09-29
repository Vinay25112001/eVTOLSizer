# AERODYNAMIC AUDIT (Phase 7)

Commit `3a7a5a4`. The full aerodynamic chain for the eVTOL / fixed-wing path.

> **Operating-point note.** The delegated aero auditor worked on a different entry path (MTOW
> 4032 kg, S 28.84 m²) from the registry path the UI uses (MTOW **2772.06 kg**, S **19.83 m²**) —
> see **F-19**. Its *ratios and mechanisms* were checked and stand; its *absolute* D/q values do
> not describe the shipped default. Lead-verified numbers are marked.

## Formula inventory

| id | file:line | equation as coded | source cited | verdict |
|---|---|---|---|---|
| A1 | `engine.js:799, 1644` | `q = 0.5 rhoCr vCruise²` | — | **PASS** |
| A2 | `engine.js:892, 1651` | `CL = W/(q·Swing)` | — | **PASS** algebraically; **F-10** on information content |
| A3 | — | `D = q S CD` | — | **NOT FORMED.** Drag force never appears; every power term is `W/(L/D)`. Equivalent in level flight, but **there is no dimensional cross-check of the polar anywhere in the tree** |
| A4 | `engine.js:894, 1734` | `LD = CL/(CD0 + CDi)` | — | **PASS** |
| A5 | `engine.js:825, 826, 1703, 1704, 2053` | `0.455/log10(Re)^2.58/(1+0.144 M²)^0.65` | "Schlichting … Kármán-Schlichting" | **PASS** — Prandtl–Schlichting with Raymer Eq 12.27's compressibility term, transcribed exactly. JS `**` binds tighter than `/`, so this is not a precedence bug. **Value wrong via F-04** |
| A6 | `engine.js:827, 1709`; `control-surfaces.js:139` | `(1+(0.6/0.30)tc + 100 tc⁴)·1.05` | "Raymer Eq 12.35" | **WARNING — F-A11**: mis-cited and truncated |
| A7 | `engine.js:828, 1710` | `1 + 60/lf³ + lf/400` | **uncited in code** | **PASS** — Raymer Eq 12.31 exactly |
| A8 | `engine.js:874, 1713` | nacelle `Cfw·1.30·Swn` | uncited | **WARNING — F-A13**: 1.30 is Raymer's *Q*; the nacelle form factor (1+0.35/f, Eq 12.32) is omitted |
| A9 | `engine.js:809, 1663` | `Sww = 2 S (1 + 0.25 tc(1 + taper·0.25))` | uncited | **FAIL-lite — F-A10**: gross not exposed area; `(1+λ/4)` is not Raymer's form |
| A10 | `constants.js:105-114` | Raymer `piDL(1−2/lf)^(2/3)(1+1/lf²)` above lf 2.5; exact prolate spheroid below | Raymer + closed-form geometry | **PASS** — the spheroid branch → 4πb² at a=b, verified |
| A11 | `weights.js:274-275` | `fuselageWettedArea(L,D) × (1−2/lamF)^(2/3) × (1+1/lamF²)` | comment claims one-area consistency | **FAIL — F-08**, lead-verified: applies A10's own correction a second time |
| A12 | `control-surfaces.js:160-162` | `Sh = Ch S MAC/lv`, `Sv = Cv S b/lv` | volume coefficients | **WARNING — F-A12**: correct algebra on the *required* area, not the *built* V-tail |
| A13 | `drag.js:98-102` | `hubArea = n·A·0.0040`, `stoppedArea = n·sigma A·0.0090`, `gearArea = CD0g·S`, `miscArea = 0.002·S` | `[CAL]`/`[CAL]`/Raymer T12.6/unsourced | **PASS** dimensionally; **FAIL on the gear default — F-09** |
| A14 | `engine.js:878, 1724` | `fDq = wing+fus+tail+nac+rotor…`; `CD0 = fDq/S` | NDARC §8 quoted | **PASS on the bookkeeping** — the loop (`:878`), the report (`:1724`) and `dragComp` (`:2486-2492`) sum the **identical nine terms**, verified term by term, no double count and no term lost. Set incomplete (F-A10/A12/A13) |
| A15 | `engine.js:893, 1728` | `CDi = CL²/(pi·AR·eOswUsed)` | Raymer §12.6 | **PASS** — full span throughout |
| A16 | `wing.js:49-62` | Howe `e = 1/[(1+0.12M⁶)(1 + (0.142 + f(λ)A(10 t/c)^0.33)/cos²Φ₂₅ + 0.1(3Nₑ+1)/(4+A)^0.8)]` | Howe 2000 6.14a via Scholz 13.26-27, quoted verbatim | **PASS** transcription (term-for-term); **FAIL on domain enforcement and the rival fallbacks — F-23** |
| A17 | `engine.js:805-807, 1650-1655` | `b = sqrt(AR·S)`, `Cr = 2S/(b(1+λ))`, `MAC = (2/3)Cr(1+λ+λ²)/(1+λ)`, `Ymac = (b/6)(1+2λ)/(1+λ)` | derived | **PASS** — MAC formula exact; `Ymac` is the standard **full-span** form |
| A18 | `engine.js:819, 1187, 1655` | `Xac = Cr − MAC + 0.25 MAC` | uncited | **PASS, conditionally** — valid only for a straight-trailing-edge wing, which the code's own sweep definition enforces. Undocumented coupling: on an unswept-quarter-chord wing `Xac` would be wrong by 31 % MAC |
| A19 | `engine.js:1656` | `sweep = atan((Cr−Ct)/(b/2))` | "semi-span in denominator" | **PASS** (this is LE sweep) |
| A20 | `engine.js:808, 826, 1657, 1698, 2052` | `Re = rho V L/muCr` | — | **FAIL — F-04** |
| A21 | `atmosphere.js:30` | `MU0·(T/T0)^0.75` | uncited exponent | **FAIL — F-04** |
| A23 | `engine.js:792, 1801` | `CLa = 2pi·AR/(2 + sqrt(AR²+4))` | "Raymer Eq 12.6" | **PASS** — Helmbold; 5.0402/rad at AR 9. No beta/sweep correction (~2 % at M 0.2) |
| A24 | `engine.js:1765` | `dw = 2 CLaW/(pi AR)` | Anderson 5.39 | **PASS** |
| A25 | `engine.js:2259` | `Vstall = sqrt(2 WL/(rhoCr·selAF.CLmax))` | — | **FAIL — F-24** |
| A26 | `engine.js:2290-2297` | `nPos = min(0.5 rho v²(p.clMaxWing ?? 1.5)/WL, nManPos)` | — | **FAIL — F-24**: inconsistent with A25 |
| A27 | `engine.js:1054-1063, 1078, 1102` | `CL = W cos gamma/(qS)`, `CD = CD0 + CL²/(pi AR e)`, `P = (W/eta)(RoC + V/(L/D))` | Raymer polar | **PASS** — physically right (T = D + W sin gamma); CD0 frozen at cruise Re/M, stated at `:1046-1048` |
| A28 | `engine.js:902` | `LDcruise_i = useTargetLD ? p.LD : LDact_i` | — | **PASS for sizing** — the computed polar drives Pcr/Pres/Pcl. **FAIL for the trade charts — F-25** |
| A31 | `flops-aero.js:142-155` | Sommer & Short T′ + Kármán–Schoenherr, fixed point to 1e-13 | Aviary `skin_friction.py` | **PASS** — a different (not Prandtl–Schlichting) law, self-consistently ported; excrescence +6 % applied **once** |
| A32 | `flops-aero.js:260-274` | `cdi = CL²/(pi AR e)`, `e = e0 + E` if E ≤ 0.3 else `e0·E` | FLOPS/Aviary `induced_drag.py` | **PASS with caveat** — the default E = 1.35 gives e > 1. That is **not** an Oswald factor and must never be compared with `wing.js`'s 0.83; it is legal only because Delta-Method pressure drag is added separately. Does not touch the eVTOL polar |
| A33 | `high-lift.js:370-505` | Datcom flap/slat ΔCLmax | Datcom/Scholz | **NOT WIRED** — `:571` says so itself; **the eVTOL path has no high-lift increment at all** |

## The Phase 7 questions, answered directly

**Is any efficiency or factor applied twice?** **Not in the CD0 build-up.** Each component
carries exactly one multiplier beyond its form factor — wing 1.05, tail 1.05, fuselage none,
nacelle 1.30 — and `miscCD0` is a separate flat allowance; no interference factor sits on top of
a form factor that already contains one. **But yes in the wetted-area chain**: `weights.js:274`
applies Raymer's fineness correction on top of a function that already contains it (**F-08**,
lead-verified).

**Do the component areas sum correctly?** **Yes** — the loop, the report and `dragComp` sum the
identical nine terms, verified term by term, no double count and no term lost between them. **But
the set is incomplete and partly wrong-area**: booms absent (**F-A13b**), wing gross rather than
exposed so the wing/fuselage junction is counted twice (**F-A10**), tail charged on the required
rather than the built area (**F-A12**).

**Is semi-span used where full span belongs?** **No — none found.** AR is the input; `b = sqrt(AR·S)`
is full span; `Ymac` uses the full-span form correctly; `Sv_req = Cv·S·b/lv` correctly uses full
span; the only `b/2` is inside the sweep arctangent, where it belongs. One item left
**UNVERIFIED**: `CLaH` (`engine.js:1801`) uses `p.vtAR = 2.5`, the **per-panel** aspect ratio,
while `Sh_eff`/`Sv_eff` (`:1919-1920`) are **two-panel** totals — defensible for dihedralled
panels, but mixing panel and total quantities in one neutral-point term is undocumented.

**Independent L/D recompute.** The agent's own Python build-up of the nine terms reproduced the
code's CD0 at its operating point and confirmed the ratios: correcting `MU0` alone moves L/D by
about −1 %, and fixing the gear default moves it by **+22.7 %** (lead-verified: 9.77 → 11.99).

## Findings

| id | finding | severity | status |
|---|---|---|---|
| **F-09** | Landing-gear CD0 defaults to **fixed** (0.015) while the comment beside it says retractable (0.003). Lead-verified: **34.6 % of `CD0tot`**, the largest single term; switching gives L/D +22.7 % and **MTOW −11.58 %**. | HIGH | **VERIFIED** |
| **F-10** | **Cruise CL and induced drag are constant by construction.** `CL_cruise ≡ min((W/S)_design/q, CL_cruise_max)` — the weight cancels. Lead-verified: `CLcruise` 0.549481 and `CDi` 0.0129001 **identical to six significant figures across MTOW 1601 → 11002 kg**. `wing.js:120-127` claims to have fixed this defect; it relocated it from `clDesign` to `wingLoadingNm2`. | HIGH | **VERIFIED** |
| **F-04** | `MU0` kinematic-for-dynamic. Reach within the aero path: `Re_i → Cfw_i` → wing/tail/nacelle drag areas; `Refus → Cff` → fuselage; `Re_ → selectAirfoil`; `Revt → CD0vt`. Re +21.7 %, Cf −2.9 to −3.2 %. Net effect on the polar is **diluted** because a large share of the default D/q carries no Cf at all (gear + misc + hub + blade), so fixing F-09 roughly **doubles** the `MU0` sensitivity. Below ~7e6 the 21.7 % error **can change the selected airfoil**, hence `selAF.CLmax` → `Vstall` → `VA` → load cases → wing mass. | HIGH as a defect, MEDIUM in effect | **VERIFIED** |
| **F-A10** | Wing wetted area uses **gross** S, not Raymer's exposed area, double-counting the wing/fuselage junction (~11.4 % over-count on the agent's operating point); the `(1+λ/4)` factor is not in Raymer's form and is uncited. Direction is conservative, but it is an unsourced deviation presented as Raymer. | MEDIUM | AGENT-REPORTED |
| **F-A11** | Wing/tail form factor replaces Raymer's Mach-and-sweep bracket with a constant and cites the wrong equation. Raymer's wing/tail FF is **Eq 12.30** and includes `1.34 M^0.18 (cos Λ_m)^0.28`; "Eq 12.35" is not it. The omitted bracket evaluates to **1.000** at the default M 0.199, so the coded 1.05 is benign *only at this Mach*: the bracket is 0.765 at M 0.05 and 1.157 at M 0.5. No Mach dependence and no domain note. | MEDIUM | AGENT-REPORTED |
| **F-A12** | Tail drag is charged on the **required** area, not the V-tail the aircraft is given (9.164 vs 11.378 m² at the default Γ 45°, because Γ_opt is 38.0° so the `max()` over-size is live) — **~19.5 % understated**. Separately `CD0vt` (`:2059`), computed on the real panel with the real tail t/c, is **absent from `CD0tot`** — two tail drag numbers, the careful one discarded. | MEDIUM | AGENT-REPORTED |
| **F-A13b** | **Booms are entirely absent from the drag build-up** (6 booms for the default 12-rotor hybrid). The agent estimates ~4–5 % of D/q and **explicitly flags this as an order-of-magnitude bound, not a measurement**. The only catch-all is `miscCD0 = 0.002·S`, whose comment says "gaps, protuberances". | MEDIUM | AGENT-REPORTED |
| **F-23** | Three Oswald efficiencies live at once: `wing.js` computes **0.82779**; `engine.js:741` falls back to a bare **0.85**; `constraints.js:138` uses `p.eOsw ?? 0.85` and `ConstraintDiagramTab.jsx` never passes `e` — so the constraint diagram, whose purpose is to justify the wing loading, runs on 0.85 while sizing runs on 0.828. `oswaldEfficiency` returns `inDomain` and `:741` **discards it**, despite the header claiming "OUT OF DOMAIN IS REPORTED, NOT EXTRAPOLATED". `sweep25Deg` is not passed although the engine holds Λ₂₅ = 7.206°. | MEDIUM | AGENT-REPORTED |
| **F-24** | **Four CLmax conventions for one wing.** `selAF.CLmax` 1.52 in `Vstall` — a 2-D **section** value used as a wing value, with no AR/sweep/Re/carryover correction, evaluated at `rhoCr` rather than sea level (a certification stall speed is quoted at sea level); `p.clMaxWing ?? 1.5` in the V-n manoeuvre boundary, which yields **n = 0.9868 at the aircraft's own stall speed** where it must be exactly 1.000; plus `clMaxTransition` 1.5 and a 1.2–1.8 range in `constraints.js`. A conventional 3-D factor of 0.90 would raise `Vstall` 5.4 %; 0.85 raises it 8.5 %. `VA = Vstall·sqrt(n)` feeds the manoeuvre load cases, so design q may be **11–18 % low**. The negative-side `0.8·CLmax` is unsourced. | MEDIUM | AGENT-REPORTED |
| **F-A13** | Nacelle drag: `Swn = n·0.10·pi(D/2)²` with **no source** for the 0.10 area fraction, and a flat 1.30 (Raymer's *Q*) with Raymer's nacelle form factor omitted, so FF·Q ≈ 1.30 where it should be ≈1.4–1.6. ~2.1 % of D/q → ±0.5 % on CD0. | LOW | AGENT-REPORTED |
| **F-A14** | `miscCD0 = 0.002` is a **fixed CD0**, whereas Raymer's leakage-and-protuberance allowance is a *fraction* of the subtotal — so the allowance grows in share exactly as the aircraft gets cleaner (5.8 % of CD0 at the default; 8.8 % with F-09 fixed). | LOW | AGENT-REPORTED |
| **F-A17** | Lift sharing and transition are not modelled (see `PROPULSION-AUDIT.md`); high-lift is not wired into the eVTOL path. `constraints.js:96 impliedTransitionSpeed` is a report over a CLmax range whose sibling constants the file's own comment calls *"a two-aircraft fit wearing the clothes of a derivation"*, stating that the circularity is **not broken** — honest, but it means the wing-loading constraint is an input dressed as an output. | LOW | AGENT-REPORTED |

## Magic numbers in the aero path

**Correctly sourced and supported:** Cf `0.455/2.58/0.144/0.65` (Raymer 12.27); fuselage FF
`60/400` (Raymer 12.31, uncited in code but correct); gear `0.015/0.003/0.001` (Raymer T12.6);
every Howe coefficient in `wing.js:49-62`.

**Honestly self-declared:** `CD_hub 0.0040`, `CD_blade 0.0090` (`[CAL]`), `fusPrismatic 0.60`
(`[LAY]`), `K_SECTION_POLAR 0.010` (`[LAY]`), `CL_CRUISE_MAX 0.90` (`[LAY]`).

**Unsourced or mis-sourced:** the `1.05` wing/tail interference factor, cited as Raymer 12.35
which is not that equation (F-A11); `1.30` nacelle with the form factor omitted and no citation
(F-A13); `0.10` nacelle-area fraction, bare assertion; `0.002` miscCD0, "unchanged from original"
(F-A14); `(1+λ/4)` in the wetted-area formula (F-A10); the `0.75` viscosity exponent (F-04);
`0.88` tail-AC station, called a "proxy", appearing five times; `etaH = 0.9` tail dynamic-pressure
ratio, two copies, no source; `0.85` Oswald fallback, two copies in a subsystem written to
eliminate it (F-23); and four CLmax conventions (F-24).
