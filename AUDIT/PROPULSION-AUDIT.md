# PROPULSION AUDIT (Phase 8)

Commit `3a7a5a4`. Every propulsion architecture audited independently: electric rotor/propeller,
turboelectric, piston, turboprop and turbofan.

## The central check: is hover momentum theory correct? — PASS

This was checked hardest, because it is the one relation the whole eVTOL result rests on.

`src/engine.js:1017`:
`Phov = kCoax·kTwin·(T_hov/etaHov)·sqrt(DL/(2·rhoHov))/1000`, with
`T_hov = W/(1−kDL)` (`:946,949`) and `DL = T_hov/(pi(D/2)²·nPropHover)` (`:974`).

**Lead-verified, independently.** `AUDIT/reference/evtol_reference.py` implements two separate
routes from first principles:
- `hover_power_momentum`: per-rotor thrust with **per-rotor** disk area,
  `P = n·(T/n)^1.5/sqrt(2 rho A_one)/FM`
- `hover_power_disk_loading`: the app's form, `(T/FM)·sqrt(DL/(2 rho))` with total thrust over
  total area

**The two agree to 2.22e-16.** So the app's disk-loading form *is* actuator-disk momentum theory
rewritten, not a different model — and critically, **the classic error of pairing total thrust
with a single rotor's area is not present anywhere**. That error would inflate the default case
by `sqrt(12)` = 3.464×.

An independent agent reached the same conclusion by a third route: a per-rotor sum of
`T_r·v_ir` equals the closed form exactly (774.72 kW both ways on its operating point), against
2683.7 kW for the mistaken form.

`FM` divides, so a lower figure of merit costs more power — **direction correct**.

Lead-verified numerically at the default: reference momentum theory with download gives
**596.75 kW** against the engine's **596.810 kW** (0.01 %); without download, **532.19 kW**,
which is exactly what the Weather tab computes (F-11).

## `P = T·V` in hover — PASS

**No such expression exists anywhere**, including the mission profile and the SoC trace. Hover is
always momentum theory; `profile.js:45` takes `r.Phov`; `phV[0] = 0.5` at `engine.js:2376` is a
*speed* trace only. This was the specific trap Phase 8 asks about and the code does not fall into it.

## Formula inventory

| # | quantity | as coded | file:line | verdict |
|---|---|---|---|---|
| 1 | hover thrust | `T_hov = W/(1−kDL)`, kDL = 0.1469·nTilt/N | `engine.js:946,949` | **PASS** (NDARC 8-11 form) |
| 2 | disk loading | `DL = T_hov/(pi(D/2)²·n)` | `engine.js:974` | **PASS** — total thrust over **total** area |
| 3 | hover power | momentum theory + FM + kCoax + kTwin | `engine.js:1017` | **PASS on the physics**; F-13 on the electrical boundary |
| 4 | ideal induced power identity | — | — | **PASS** — three independent routes agree |
| 5 | induced velocity | `v_i = sqrt(T_rotor/(2 rho A))` with `T_rotor = MTOW·g·(T/W)/N` | `engine.js:2135,2157` | **FAIL (F-P04)** — uses *installed* thrust and omits download: 19.92 vs 18.15 m/s, **+9.7 %** |
| 6 | tip speed / Mach / RPM | `Mtip = Vtip/a_SL`; `TipMach = Vtip/a_cr`; `RPM = Vtip/R·60/2pi` | `engine.js:2168-2171` | **PASS** |
| 7 | blade loading | `CT/sigma = DL/(rho Vtip² sigma)` | `rotorgroup.js:285` | **PASS** |
| 8 | climb / cruise / reserve power | `(W/eta)(RoC + V/LD)/1000` | `engine.js:1078,1084,1105` | **PASS** dimensionally |
| 9 | coaxial interference kappa | Yang Eq. 39 | `coaxial.js:35-40` | **PASS** — reproduces 1.2808 at a=1, 1.1359 at a=0.8 |
| 10 | twin overlap kappa | `sqrt(2/(2−m))`, lens area | `coaxial.js:160-174` | **PASS**, → 1.0 at l ≥ 2R |
| 11 | vertical-climb power ratio | `Vz/(2v_h) + sqrt((Vz/2v_h)² + 1)` | `sizing-conditions.js:213-220` | **PASS** — this *is* (Vz+v_i)/v_h, verified from `v_i² + Vz v_i − v_h² = 0`. `v_h` uses W not `T_hov` (−3.7 %, F-P14) |
| 12 | installed-power conditions | hover; `×(T/W)^1.5`; vertical climb; `×transientFactor` | `sizing-conditions.js:166-232` | **PASS** — exponent 1.5 correct |
| 13 | heave damping | `v_i = sqrt(DL/2rho)`, `dT/dw = T/v_i`, `Z_w = −g/v_i` | `hoverdynamics.js:82-93` | **PASS** |
| 14 | autorotative index | `AI = ½IΩ²/(W·DL)` with unit conversions | `autorotation.js:104-110` | **PASS** |
| 15 | blade BEM | `lambda = sqrt(CT/2)`, `Cl_bar = 6 CT/sigma`, `theta75 = phi + Cl_bar/2pi` | `blade.js:49-54` | **PASS** |
| 16 | drone figure of merit | `FM = sqrt(2/pi)·CT^1.5/CP` | `drone/rotor.js:59,110` | **PASS** — `sqrt(2/pi)` re-derived independently |
| 17 | drone motor | `I = tau/Kt + I0`, `V = omega/(Kv·2pi/60) + IR`, `P_e = VI`, closes to `closureW` | `drone/motor.js:180-205` | **PASS** — physical, not a constant |
| 18 | drone ESC | `busPowerW = P_elec/eta_joint`, p10/p90 correctly crossed | `drone/esc.js` | **PASS** |
| 19 | motor mass | `tau = P·1000/(omega·g)`; EMRAX `0.5591 tau^0.6266` with a linear hand-off at 546 N·m | `motormass.js:60-89` | **PASS** |
| 20 | gearbox | AFDD00 per drive train, hp/rpm/lb | `drivesystem.js:99-101,141-145` | **PASS**, 0 at ratio 1 |
| 21 | turboshaft | `rated = max(hover,cruise)/(eta_gen·eta_gb·delta sqrt(theta))`; `fuel = sfc·E/(eta)·1.05` | `turboelectric.js:130-147` | **PASS** on directions; inherits F-13 on the input; **U-02** on the lapse convention |
| 22 | piston / turboprop Breguet | `375(eta/c)(L/D)ln(W0/W1)` sm, lb/hp·h; `B = E·eta/(c·g)` m | `trainer/performance.js:86-93`; `turboprop/size.js:137-141` | **PASS** — 375 = 550·3600/5280 |
| 23 | jet fuel flow / Breguet | `ff = F·tsfc·deckRatio/3600`; `W1 = W0 exp(−R·tsfc/(V·L/D))` | `transport/mission.js:92-93,102-107` | **PASS** |

## Thrust / shaft / useful / electrical power — is each named quantity that quantity?

This is Phase 8's sharpest question and it produces the domain's main finding.

| quantity | what the name implies | what the code computes | verdict |
|---|---|---|---|
| `Phov` | hover power | rotor **shaft** power (÷ FM only) | consumed as **electrical** in five places → **F-13** |
| `Pcr`, `Pcl`, `Pres`, `Pdc` | segment powers | **bus** power (÷ `etaSys`, the full chain) | **PASS** |
| `PmotInstalledKW` | installed motor rating | **shaft** power (`sizeCond.installedKW`) | **PASS** — correct, and correctly used for motor mass |
| `PmotKW`, `Torque`, `MotMass` | the design's motor | a **legacy model**: `Protor·1.15`, `/5.0 kW/kg` | **F-25** — reported 100.3 kW/motor against 129.3 installed (−22.4 %); MotMass 241 kg against the EMRAX fit's 473 kg, i.e. **the displayed motor mass is 51 % of the one inside MTOW** |
| `P_mot_oei` | one-engine-out per-motor power | `Phov/(N−1)` — **linear in thrust share** | **F-P07** — for *independent* rotors it must go as T^1.5 |

## Findings

| id | finding | severity | status |
|---|---|---|---|
| **F-13** | `Phov` is a shaft power consumed as battery/bus power. Full detail in `ENERGY-AUDIT.md`. Boundary question **U-01**. | MEDIUM | AGENT-REPORTED |
| **F-P07** | `engine.js:3570` `P_mot_oei = Phov/(N−1)` on the case `:3600` describes as "one of N **independent** rotors stops; the rest must hold hover". Losing a rotor loses its disk area, so momentum theory gives `Phov·sqrt(N)/(N−1)^1.5`, i.e. `(N/(N−1))^1.5 × Phov/N`, not linear. The comment at `:3572-3573` states the linear form explicitly ("for 6 rotors it is only N/(N−1)=1.2x" — should be 1.2^1.5 = 1.315). **Understated −2.8 % (N=18), −4.3 % (N=12), −8.7 % (N=6), −13.4 % (N=4)**, feeding the `oeiMotorOK` verdict. **This is the exact exponent error `sizing-conditions.js:170-173` warns about in its own comment.** Note `drivefailure.js:87` uses the same `P/(n−1)` and there it is **correct**, because a cross-shafted drive keeps every rotor turning. | MEDIUM | AGENT-REPORTED |
| **F-P04** | `vi_ind` (`engine.js:2157`) is not the hover induced velocity it is labelled as: it uses *installed* thrust and omits download — **19.922 vs 18.153 m/s, +9.7 %**. The comment flags the density and not the thrust. Same omission in `DLrotor` (`:2153`) and `Ttot` (`:2135`), so the "installed thrust" family drops the `1/(1−kDL)` = 1.0793 the hover family carries, and the two disk loadings are not related by T/W as `:2144-2152` states. | MEDIUM | AGENT-REPORTED |
| **F-25** | `PmotKW`, `Torque` and `MotMass` are a legacy reporting model contradicting the masses that drive MTOW (see the table above). The 5.0 kW/kg constant is itself `[CAL]` with no published basis, and `weights.js:397-401` records that it was removed *from the weight model* for exactly this reason; it survives in the reporting path. | MEDIUM | AGENT-REPORTED |
| **F-18** | Five mutually inconsistent hover-power expressions, two physically malformed — including `engine.js:2418-2420`, where `DL2 = W2·TW/A` but thrust `= W2` (**mismatched thrust and disk loading**), and `ConvergenceTab.jsx:203`, which is **+32.1 %** against the "Hover Power" tile on the same design. | MEDIUM | AGENT-REPORTED (F-11 is the lead-verified subset) |
| **F-P14** | `v_h` in the vertical-climb sizing condition (`sizing-conditions.js:213`) uses `g.W/N`, not `T_hov/N`: 17.48 vs 18.15 m/s (−3.7 %). Immaterial today because `twInstalled` governs the sustained rating, but it is the same `T_hov`/`W` inconsistency as F-P04. | LOW | AGENT-REPORTED |
| **F-A17** | `src/engine/aeropropulsive.js` has **no production consumer** (grep: only itself, a comment in `wingmodes.js:164`, and `validation/wing-modes.mjs`). So slipstream blowing, the 11 % rotor-airframe thrust loss and `dT/dV` reach no sized result; **wing/rotor lift sharing is not modelled** (`configuration.js` sets `rotorLiftShare: () => 1, wingLiftShare: 1` for every winged layout) and **the mission has no transition segment** in the energy accounting. `phugoidWithThrust` would over-predict added damping ~6× if fed installed hover thrust, but there is no call site to pin the argument's meaning. | LOW / UNVERIFIED | AGENT-REPORTED |
| **U-02** | `turboelectric.js:118-119` referred lapse makes turboshaft power **rise 3.6 %** on ISA+20, so the hot-and-high day sizes the generator *smaller*. | UNVERIFIED | AGENT-REPORTED |

## Architecture-by-architecture verdicts

| architecture | verdict |
|---|---|
| electric rotor / propeller (eVTOL) | momentum theory **PASS**; electrical boundary **F-13**; OEI exponent **F-P07** |
| turboelectric | directions **PASS**; rating inherits F-13; lapse convention **U-02**; no unusable fuel or oil (F-M07) |
| piston (trainer) | Breguet and GASP propulsion **PASS**; the 375 constant verified as 550·3600/5280 |
| turboprop | Hamilton Standard propeller and `psfcSI` **PASS**; cruise-altitude search guarded |
| turbofan (transport/bizjet) | fuel flow and Breguet **PASS**; engine mass `refMass·(T/T_ref)^1.15` **PASS** |
| drone electric | **the strongest chain in the repo** — measured UIUC C_T/C_P with a refusal to extrapolate, a physical Kv/Kt/I0/Rm motor model with a closure residual, measured ESC joint efficiency with p10/p90 correctly crossed |
