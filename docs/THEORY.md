# eVTOL Sizer — Theory Manual

This manual describes the calculation the sizing engine performs and where each
model comes from. It is written from the code. Every statement carries a
`file:line` reference so it can be checked against the source. Where a code
comment disagrees with the code, this manual describes the code and says that
the comment disagrees.

Related documents:

- [USER-GUIDE.md](USER-GUIDE.md) explains how to use the tool.
- [API.md](API.md) explains how to call the engine from a script.
- [VALIDATION.md](../VALIDATION.md) gives the accuracy of the results. This
  manual quotes no accuracy figures. For any question of how well a model
  agrees with an aircraft, see VALIDATION.md.

**Conventions**

- *References.* A reference such as `src/engine.js:891` points at the line
  that implements the statement. A range such as `:1017-1020` covers a block.
- *Units.* The engine works in SI unless a module says otherwise: kg, N, m,
  s, W or kW, kWh, Pa. The regression weight equations are evaluated in
  imperial units inside their functions and converted back
  (`src/engine/weights.js:39-40`, `src/engine/rotorgroup.js:38-39`).
- *Tags.* Source comments tag constants:
  - `[SRC]`: taken from a cited document.
  - `[LAY]`: a layout or engineering assumption.
  - `[CAL]`: calibrated to data.
  - `[EQ]` and `[FRAC]`: a published equation and a published mass fraction
    (`src/engine/weights.js:32-37`).

  This manual keeps the tags wherever it quotes a constant.
- *Gravity.* `G0 = 9.81` m/s² is the shared constant
  (`src/engine/constants.js:6`). Several functions use 9.80665 instead:
  - the disk-loading diameter (`src/engine.js:471-472`);
  - the ACAI weight (`src/engine.js:2358`);
  - `rotorDiameterFor` (`src/engine/configuration.js:805`);
  - booms (`src/engine/booms.js:217`).

  The two values differ by 0.03%.

---

## 1. Scope and structure of the calculation

### 1.1 What the engine is

`runSizingCore(p)` is a pure function of a parameter object `p`
(`src/engine.js:1-5`, `:139`). It has no DOM access and no I/O. It returns
one result object, `R` (`src/engine.js:3354-3716`).

The public entry point is `runSizing(p)` (`src/engine.js:3722`), which works
as follows:

- If `p.autoPositionWing !== true`, it returns `runSizingCore(p)` directly
  (`:3723`).
- If the configuration has no wing, it runs the core once and passes the
  result through `sanitiseWingless`, which replaces non-finite numbers with
  `null` down to depth 2 (`:3729-3730`, `:3752-3763`). The sanitiser is
  therefore applied only on the `autoPositionWing` path. A wingless design run
  with `autoPositionWing:false` is returned unsanitised. The sanitiser's
  header comment does not mention this condition (`:3747-3750`).
- Otherwise it calls `solveWingPosition(p, runSizingCore)`
  (`src/engine/wingPosition.js:54`), which runs the core repeatedly
  (section 9.4).

### 1.2 How the app and the API transform inputs first

The app and the Node API do not pass their raw state to the engine.

- `size()` in `src/api.js:58-73`:
  1. resolves the inputs over `DEFAULT_PARAMS` (`resolveInputs`,
     `src/lib/designfile.js:98-105`);
  2. passes them through `engineInputs` (`src/lib/designfile.js:80-94`);
  3. attaches warnings (`resultWarnings`, section 12).
- The app calls `runSizing(engineInputs(...))` (`src/App.jsx:573`).

`engineInputs` folds the reserve into the range:

```
Vres_          = 0.76 * vCruise
reserveDistKm_ = reserveDistanceKm (default 60)        if reserveBasis == "distance"
               = Vres_ * (reserveMinutes || 20) * 60 / 1000   otherwise
range (to engine) = range (mission, excl. reserve) + reserveDistKm_
```

(`src/lib/designfile.js:82-93`). The engine then subtracts its own reserve
distance from `p.range` to recover the cruise leg (section 3.4). The two
reserve distances agree under the defaults. The code uses different forms in
two places:

- **Reserve speed.** `engineInputs` always uses 0.76·Vcruise. The engine uses
  1.0·Vcruise when `p.reserveAtCruiseSpeed === true` (`src/engine.js:308`).
- **Zero reserve.** `engineInputs` uses `reserveMinutes || 20`, which turns a
  zero into 20. The engine uses `?? 20` (`src/engine.js:296`) and has a
  comment explaining why `||` is wrong there (`:292-295`).

### 1.3 Order of the calculation inside `runSizingCore`

1. **Mission basis.** `applyMissionBasis(p0)` fills the following fields
   from a named basis, only where `p` leaves them `undefined`
   (`src/engine.js:143`, `src/engine/mission.js:87-96`):
   - `sizingDay`
   - `headwindMS`
   - hover times
   - `reserveMinutes`
   - `reservePctMission`

   Because `resolveInputs` always supplies `reserveMinutes` from
   `DEFAULT_PARAMS` (`src/lib/defaults.js:93`), a basis cannot change the
   reserve time for designs that come through the app or the API.
2. **Sizing day.** `applySizingDay(pM)` sets field elevation, cruise
   altitude and ISA deviation from a named day (`src/engine.js:144`,
   `src/engine/atmosphere.js:61-70`).
3. **Configuration.** `resolveConfiguration(p, p.nPropHover)` is evaluated
   once (`src/engine.js:146`; section 4.1). `hasWing` comes from the
   configuration's capabilities (`:153`).
4. **Atmosphere.** Section 2 (`src/engine.js:227-232`).
5. **Round 1.** A closed-form fraction estimate seeds the take-off mass
   (section 7.1).
6. **Round 2.** The coupled sizing loop (section 7) iterates the following
   to closure on MTOW:
   - aerodynamics;
   - hover, climb, cruise, descent and reserve power;
   - mission energy;
   - empty weight;
   - battery;
   - pack systems.
7. **Post-loop analyses.** These read the converged design:
   - wing geometry, drag and airfoil;
   - stability and tail;
   - propulsion and rotor;
   - battery architecture and thermal;
   - performance and the V-n diagram;
   - payload-range, time histories and sweeps;
   - load cases and the wing box;
   - OEI controllability (`src/engine.js:1460-2415`).
8. **Checks.** Section 12 (`src/engine.js:2417-3238`).
9. **Analysis pipeline.** Currently only the acoustics stage runs through
   `runPipeline` (`src/engine.js:3243-3245`, `src/engine/pipeline.js:25-27`).
   A failing stage is recorded in `_stageErrors` and does not abort the run
   (`src/engine/pipeline.js:35-43`).
10. **OEI thrust block** and the drag and disk-loading cross-checks
    (`src/engine.js:3257-3349`), then the return object.

`p.propDiam` is required. The engine throws a `TypeError` when it is missing
or not positive (`src/engine.js:463-469`).

---

## 2. Atmosphere

Source: `src/engine/atmosphere.js`. Constants: `src/engine/constants.js:6-13`.

| symbol | value | meaning |
|---|---|---|
| T0 | 288.15 K | sea-level temperature |
| L | 0.0065 K/m | lapse rate |
| R | 287 J/(kg·K) | gas constant |
| γ | 1.4 | ratio of specific heats |
| P0 | 101325 Pa | sea-level pressure |
| μ0 | 1.47e-5 Pa·s | reference viscosity |

`makeISA(ΔISA)` returns a function of geometric height h, in metres, with h
floored at 0 (`src/engine/atmosphere.js:19-27`):

```
T_std(h) = T0 − L·h
P(h)     = P0 · (T_std/T0)^(g/(L·R))        independent of ΔISA
T(h)     = T_std(h) + ΔISA
ρ(h)     = P / (R·T)
a(h)     = sqrt(γ·R·T)
```

A hot day therefore lowers density through the gas law at the actual
temperature, while the pressure profile is unchanged. The comment cites ICAO
Doc 7488 for the standard atmosphere (`:18`).

Viscosity follows a power law, `μ(T) = μ0·(T/T0)^0.75` (`:30`).

`atmosphereSet(p)` evaluates three points (`:73-83`):

- **cruise:** `isa(p.cruiseAlt)`. `cruiseAlt` is read as height above mean
  sea level.
- **hover:** `isa(fieldElev + hoverHeight)`, with `hoverHeight` defaulting to
  15.24 m. The hover point is above the vertiport.
- **field:** `isa(fieldElev)`.

**Named sizing days** (`:46-56`) are:

- `nasa-uam`: 1524 m field and cruise altitude, ISA+20. Cited to
  Johnson & Silva, Aeronautical Journal 126(1295) 2022, section 5, which
  states that all segments are flown at 5,000 ft and ISA+20 °C.
- `nasa-sl`: sea level, ISA+20 (the same paper's second sizing mission).
- `sl-isa`: sea level, ISA+0. Labelled "not a sizing condition".

`applySizingDay` overrides `fieldElev`, `deltaISA` and, where the day
defines one, `cruiseAlt` (`:61-70`).

The engine uses these atmosphere values:

- `ρ_cr`, `a_cr` and `T_cr` at cruise.
- `ρ_hov` at hover.
- `μ_cr = μ(T_cr)` (`src/engine.js:230-232`).
- `ρ` at mid-climb altitude for the climb and descent polars (section 4.3).
  This density is taken at `(hoverHeight + cruiseAlt)/2` without the field
  elevation (`src/engine.js:926-927`).

---

## 3. Mission and energy

### 3.1 Segments

The mission is charged as six segments (`src/engine.js:1006-1012`,
`:2092-2095`):

1. take-off hover;
2. climb;
3. cruise;
4. descent;
5. landing hover;
6. reserve.

Each segment has a power P_i in kW and a time t_i in s. Its energy is
`E_i = P_i·t_i/3600` in kWh (`:1009-1012`).

### 3.2 Times and distances

**Hover.** The take-off and landing hover times are
`hoverTimeTakeoffS` and `hoverTimeLandingS`, each defaulting to
`HOVER_S_DEFAULT = 30` s (`src/engine.js:52`, `:1006-1008`).

- The comment at `:45-51` cites NASA/TM-20210017971 Table 1 for 30 s
  vertical transitions on the 75 nm UAM sizing mission. `mission.js` records
  that the 30 s value is a reading of a column-shredded table, not a
  quotation (`src/engine/mission.js:39-52`).
- **Code/comment disagreement:** the comment block inside the loop at
  `src/engine.js:981-990` still argues for 120 s from Johnson & Silva
  section 5. The code uses 30 s.

**Climb** (`src/engine.js:234`, `:368-369`):

```
Vcl         = rateOfClimb / sin(climbAngle)
climbHeight = max(0, cruiseAlt − fieldElev − hoverHeight)
ClimbR      = climbHeight / tan(climbAngle)
```

The climb height is measured above the field, not above sea level
(`:350-367`).

**Descent angle** (`src/engine.js:265-267`, re-derived each iteration at
`:938-940`):

- `p.descentAngle`, if it is given and positive;
- otherwise `atan(1/(L/D))`, the glide angle. The seed uses `p.LD`; each
  iteration then uses the L/D computed in that iteration (`LDcruise_i`).

The descent is flown at cruise speed, and the rate follows from the angle
(`:287-288`, `:941-942`):

```
Vdc     = vCruise
RoD     = Vdc · sin(desAng)
DescR   = climbHeight / tan(desAng)
```

The comment cites Hartman, Foster & Hartman, AIAA-2023-0548
(NTRS 20220017406), for flying the en-route descent at cruise speed
(`:276-286`). The descent angle is taken from the cruise L/D rather than from
the descent L/D, deliberately, to avoid an inner fixed point (`:943-947`).

**Mission hops.** `missionHops = max(1, round(p.missionHops ?? 1))`
(`src/engine.js:425`). Take-off hover, climb, descent and landing hover are
each charged `missionHops` times. Cruise distance is not multiplied: the
total cruise distance is split between the hops (`:1003-1008`). The comment
cites Johnson & Silva 2022 sec. 5 and the RVLT Lift+Cruise design-drivers
paper for the two-hop NASA mission (`:410-424`).

**Cruise distance** (`src/engine.js:426`, `:950`):

```
CruiseRange = p.range·1000 − missionHops·(ClimbR + DescR) − reserveDistM
```

`p.range` includes the reserve distance (section 1.2), so subtracting
`reserveDistM` recovers the cruise leg. The check "Cruise range > 0 km"
reports this quantity (`:2491`).

### 3.3 Headwind

Power is set by airspeed and distance by ground speed. With
`vWind = max(0, headwindMS)` (`src/engine.js:999-1002`):

```
gs_cr = max(1, vCruise − vWind)
gs_cl = max(1, Vcl − vWind)
gs_dc = max(1, Vdc − vWind)

t_to  = hoverTimeTakeoffS · hops
t_cl  = hops · ClimbR / gs_cl
t_cr  = max(0, CruiseRange / gs_cr)
t_dc  = hops · DescR / gs_dc
t_ld  = hoverTimeLandingS · hops
t_res = reserve time (not affected by wind)
```

(`:1006-1008`). The comment quotes NASA's UAM design mission as "75 nm range
(with 10 kt headwind)" (`:995-998`). The certification mission basis sets
`headwindMS = 5.144` m/s (`src/engine/mission.js:38`).

### 3.4 Reserve

**Reserve speed.** `Vres = 0.76·vCruise`, or `1.0·vCruise` when
`p.reserveAtCruiseSpeed === true` (`src/engine.js:308`). The comment ties
0.76·V to the best-endurance reserve of Johnson & Silva's initial air-taxi
mission. It ties the cruise-speed reserve to the 75 nm UAM mission, citing
NASA/TM-20230018312 p.214 and the RVLT design-drivers paper (`:297-307`).

**Reserve basis** (`src/engine.js:342-348`):

- `reserveBasis = "time"` (the default): `reserveMinutes = p.reserveMinutes
  ?? 20`.
- `reserveBasis = "distance"`: `reserveMinutes =
  reserveDistanceKm·1000/Vres/60`.

In both cases `t_res = 60·reserveMinutes` and `reserveDistM = Vres·t_res`.

**Reserve energy.** The reserve is the larger of two criteria
(`src/engine.js:1013-1020`):

```
E_mission = E_to + E_cl + E_cr + E_dc + E_ld
E_res     = max( P_res·t_res/3600 ,  reservePctMission · E_mission )   reservePctMission default 0.10
E_tot     = E_mission + E_res
```

The comment cites NASA's rule "reserve minimum of 10% of mission or 20-min
flight at best-endurance speed" (Johnson & Silva 2022) (`:325-329`,
`:1013-1016`). The marketing basis sets `reserveMinutes = 0` and
`reservePctMission = 0` (`src/engine/mission.js:64-80`).

### 3.5 Mission bases

`MISSION_BASES` names two coherent parameter sets
(`src/engine/mission.js:34-81`):

- **certification:**
  - NASA UAM day;
  - 10 kt headwind;
  - 30 s hovers;
  - 20 min reserve;
  - 10% floor.

  Source string: NASA/TM-20210017971 Table 1.
- **marketing:**
  - sea-level ISA day;
  - no headwind;
  - 30 s hovers;
  - no reserve.

  Source string: "inferred from published pack/range pairs".

`REFERENCE_MISSIONS` lists per-layout missions that the UI offers and never
applies automatically (`:133-187`).

---

## 4. Power

### 4.1 Configuration flags used by the power model

`resolveConfiguration` (`src/engine/configuration.js:132-299`) turns
`configType` and the rotor count N into the flags the power model uses:

| flag | how it is set | lines |
|---|---|---|
| `nStopped` | `p.nRotorsStopped` if given, else `round(stoppedFrac·N)`; clamped by the rules below | `:138-188` |
| `nTilting` | `N − nStopped` | `:221` |
| `hasCruiseProp` | `p.hasPusher` if given, else the layout has a pusher and `nStopped > 0` | `:216-217` |
| `cruiseThrustUnits` | tilting rotors, plus 1 if there is a pusher (not floored at 1) | `:286-287` |
| `nHubsExposed` | hubs in the cruise flow | `:199-201` |
| `hasBooms` | the layout has booms and either `stoppedFrac === 0` or `nStopped > 0` | `:295` |
| `boomCount` | one boom pair per four boom-mounted rotors, or the layout's own rule | `:241-262` |

`nStopped` is clamped by three rules:

- Layouts with booms and `stoppedFrac > 0` have at least `floor(N/2)` fixed
  rotors (`:154-157`).
- Layouts without a pusher keep at least two rotors tilting (`:170-172`).
- Layouts whose rotors cannot tilt stop all of them (`:185-188`).

The `stoppedFrac` values are (`:45-125`):

| layout | stoppedFrac |
|---|---|
| lift+cruise | 1 |
| hybrid | 0.5 |
| hybridPusher | 2/3 |
| tiltrotor | 0 |
| multicopter | 0 |
| sideBySide | 0 |

Per-layout defaults come from `CONFIG_DEFAULTS`
(`src/engine/configuration.js:644-745`):

- rotor count;
- disk loading `DL_lbft2`;
- cruise speed;
- `LD_target`;
- `etaHov`;
- tip speed;
- `oeiThrustShare`;
- for some layouts, `ewf` and wing loading.

The multicopter, side-by-side and lift+cruise disk loading and L/D are cited
to NASA/TM-20210017971 Table 12. The tiltrotor is cited to Joby S4. Archer
Midnight supplies the hybrid's rotor count only. The hybridPusher entry is
`[LAY]`.

### 4.2 Hover

**Download.** The download fraction k is (`src/engine.js:820-821`):

```
k = clamp(p.downloadFraction ?? downloadFractionFor(layout, nTilting, N), 0, 0.4)
```

`downloadFractionFor` returns the following values
(`src/engine/configuration.js:767-784`):

- 0.1469 for the tiltrotor, cited as XV-15 measured download (NATO
  RTO-MP-AVT-111).
- 0.1469 × (nTilting/N) for the two hybrids. The scaling is `[LAY]`
  geometric.
- 0 for lift+cruise, multicopter and side-by-side. These are marked `[GAP]`.

Hover thrust is then (`src/engine.js:823`):

```
T_hov = W / (1 − k)          W = MTOW·g
```

The comment cites NDARC (NASA TP-20220000355) section 8-11 for DL/T = k and
T = W/(1−k) (`:785-787`). Hover is flown at T/W = 1. The installed thrust
ratio `twRatio` is not applied to steady hover (`:777-779`); it enters motor
sizing instead (section 6.4).

**Disk loading** (`src/engine.js:848`):

```
DL = T_hov / (N · π·(D/2)²)          N/m²
```

**Rotor diameter** D is `p.propDiam` unless `p.rotorSizing === "diskLoading"`
and a target disk loading exists (`src/engine.js:447-449`). In that mode D is
moved each iteration towards

```
D_target = 2·sqrt( MTOW·9.80665 / (N·π·DL_target) )     DL_target from lb/ft² via /0.0208854
D ← D + λ·(D_target − D)          λ = clamp(p.rotorSizingRelax ?? 0.5, 0.05, 1)
```

(`src/engine.js:471-472`, `:840-846`). The default is `"fixedDiameter"`
(`src/lib/defaults.js:159`).

**Solidity.** When `p.solidity` is not given, solidity is derived from a
design blade loading (`src/engine.js:856-861`,
`src/engine/rotorgroup.js:185-209`):

```
σ_raw = DL / (ρ_hov · V_tip² · (C_T/σ)_design)
σ     = clamp(σ_raw, 0.02, 0.40)
```

- The tip speed defaults to 167.64 m/s (`src/engine.js:856`).
- `(C_T/σ)_design` is taken per configuration from `designCTsigmaFor`
  (`src/engine/rotorgroup.js:149-182`):
  - multicopter 0.0759, side-by-side 0.0839 and lift+cruise 0.0603, each
    `[SRC]` NASA Table 12;
  - tiltrotor 0.0973, `[SRC]` Yanev & Staack, Aerospace 2026 13(566)
    Table 2, TR6-E;
  - for the two hybrids, a `[LAY]` blend between the lift+cruise and
    tiltrotor values by the tilting fraction.
- **Code/comment disagreement:** the hybrid basis string calls the upper
  endpoint "tiltwing" (`:180`), but the value used is the tiltrotor row
  (`:176`).
- The unclamped requirement is kept for the buildability check (section 12).

**Hover power** (`src/engine.js:891`):

```
P_hov = κ_coax · κ_twin · (T_hov / η_hov) · sqrt( DL / (2·ρ_hov) ) / 1000      kW
```

- `η_hov` is `p.etaHov`. The comment describes it as absorbing non-uniform
  inflow, swirl and figure-of-merit deviation (`:895`). The defaults set
  0.740 for the hybrid (`src/lib/defaults.js:166`); per-layout values are in
  `CONFIG_DEFAULTS`.
- The density is the hover density at the vertiport, not a fixed 1.225
  (`src/engine.js:891-894`).
- **Coaxial factor** κ_coax (`src/engine.js:868-869`,
  `src/engine/coaxial.js:34-40`) is applied only when all three hold:
  - `rotorArrangement === "coaxial"`;
  - the layout supports coaxial rotors;
  - N is even (`src/engine.js:611-613`).

  With a = T_lower/T_upper (default 0.80, `coaxial.js:45`):

  ```
  κ_coax = [1 + (a/2)·(sqrt(1 + 4a(1+a)²) − 1)] / (1 + a^1.5)       κ = 1 when a = 0
  ```

  The factor is cited to Yang et al., "Sizing of Multicopter Air Taxis",
  Aerospace 2024, 11, 200, Eq. 39. The file records that the equation is
  implemented rather than the paper's prose figure (`coaxial.js:16-28`).
- **Twin-rotor factor** κ_twin applies to the side-by-side only
  (`src/engine.js:889-890`). It is cited to NDARC 12-5.1.3
  (`coaxial.js:111-172`):

  ```
  m      = [2·acos(x) − x·sqrt(4 − 4x²)] / π        x = l/D (lens area of two discs)
  κ_twin = sqrt( 2 / (2 − m) )                      = 1 when x ≥ 1
  ```

  The hub separation `l/D = 0.84` was measured off AIAA 2018-3847 Fig. 4
  (`coaxial.js:140-156`). The factor applies in hover only. The forward-flight
  overlap benefit is not applied, because the side-by-side cruise efficiency
  already comes from NASA's published L/De (`src/engine.js:883-888`).
- **Code/comment disagreement:** `configuration.js:87-89` says "no
  interference factor is applied here yet", and `:108-111` says "this tool
  does not apply it". The engine applies κ_twin.

**Other hover-derived outputs** (`src/engine.js:1871-1875`):

- `DLrotor = T_installed/(N·A)`, the disk loading at installed thrust
  T/W·W;
- `DL_hover`, the disk loading at hover thrust;
- `PLrotor = (T_hov/N)/(P_hov/N)`, the power loading;
- `vi_ind`, the induced velocity at installed per-rotor thrust.

The comment at `:1861-1870` explains why the two disk loadings are kept
separate.

### 4.3 Climb

```
P_cl = (W / η_sys) · (RoC + Vcl / (L/D)_cl) / 1000       kW
```

(`src/engine.js:952`). `η_sys = p.etaSys` is used for climb on all layouts,
including rotor-borne ones.

`(L/D)_cl` is recomputed each iteration on the wing drag polar at the climb
speed, unless `p.useTargetLD === true` (`src/engine.js:898-951`):

```
q   = ½·ρ_mid·V²
C_L = W·cos(γ) / (q·S_w)
C_D = C_D0 + C_L² / (π·AR·e)
L/D = C_L / C_D
```

(`:928-934`).

- `ρ_mid` is the density at mid-climb height (`:926-927`).
- `C_D0` is carried over from the cruise evaluation (`:920-922`).
- Without a wing, or with `q ≤ 0`, the function returns the cruise L/D
  (`:930`).
- `p.flatClimbPenalty === true` restores
  `(L/D)_cl = (L/D)_cr·(1 − climbLDPenalty)`, with a default penalty of 0.13
  (`:935-937`). The seed value uses the same form with `p.LD` (`:246`).

### 4.4 Cruise

**Wing-borne L/D** (`src/engine.js:766-768`):

```
C_L,cr = W / (q_cr·S_w)
C_Di   = C_L,cr² / (π·AR·e)
(L/D)  = C_L,cr / (C_D0 + C_Di)
```

`C_D0 = (D/q)/S_w` is the summed drag area over the wing area (section 9.2).
`e` is `p.eOsw`.

**Rotor-borne L/D.** Without a wing, `(L/D) = rotorborneLoD`, taken as
`p.rotorborneLoD ?? CONFIG_DEFAULTS[layout].LD_target ?? 5.80`
(`src/engine.js:204-205`, `:768`). This is the effective L/De = W·V/P that
NASA publishes per vehicle in NASA/TM-20210017971 Table 12, and the comment
labels it `[CAL]` (`:176-203`). NDARC's advance-ratio profile-power function
F_P is not implemented (`:182-186`).

**Target L/D.** `p.LD` is used for sizing only when `p.useTargetLD === true`
(`:776`). Otherwise `p.LD` is used only for the Round 1 seed, the descent-angle
seed and some checks and sweeps.

**Cruise power** (`src/engine.js:957-958`):

```
η_cr = η_sys                              if the aircraft has a wing
     = p.powertrainEta ?? 0.845           rotor-borne (battery-to-shaft only)  [CAL]
P_cr = (W / η_cr) · (V_cruise / (L/D)) / 1000
```

The comment explains the split. On a wingless aircraft, L/De already contains
the propulsive efficiency, so dividing by the full-chain `η_sys` would count
it twice. The 0.845 value is recorded as recovered from Quad-E and SbS-E
(`:207-222`).

**Reserve power** uses the same efficiency split
(`src/engine.js:979`):

```
P_res = (W / η_cr) · (V_res / (L/D)) / 1000
```

### 4.5 Descent

```
P_dc,raw = (W / η_sys) · (−RoD + Vdc / (L/D)_dc) / 1000
P_dc     = P_dc,raw                 if p.regenDescent === true
         = max(0, P_dc,raw)         otherwise (default)
```

(`src/engine.js:976-978`).

- `(L/D)_dc` comes from the same polar at `Vdc` and angle `−desAng`
  (`:948`).
- A negative raw descent power is not credited by default, because
  regeneration is not standard sizing practice (`:959-975`).
- The available regeneration power is reported as `regenAvailableKW`
  (`:978`, `:3638`).

### 4.6 Tip speed, RPM and blade geometry (post-loop)

The following are computed after the loop (`src/engine.js:1886-1904`):

```
V_tip  = p.tipSpeed ?? 167.64           (550 ft/s)
RPM    = V_tip / R · 60/(2π)
N_bld  = max(2, round(p.nBlades ?? 3))
chord  = σ·π·R / N_bld
M_tip  = V_tip / a_cr                   (checked against 0.70)
```

The tip-speed default is cited to Johnson & Silva 2022 Table 3
(`:1876-1885`).

**Display-only motor values.** The post-loop values `PmotKW = 1.15·P_hov/N`
and `MotMass = PmotKW/5` (`:1912-1916`) are display values. They are not the
masses the loop sized. The component build-up uses the installed rating from
section 6.4.

---

## 5. Battery sizing

### 5.1 Specific-energy conventions

Inside the loop (`src/engine.js:1120-1123`):

```
packUsable = (p.sedBasis === "packUsable")
sed_eff    = sedCell                        if packUsable
           = sedCell · (1 − cRateDerate)    otherwise      (cRateDerate default 0.08)
socFloor   = 0 if packUsable, else p.socMin
```

`sedBasis:"packUsable"` declares that the entered specific energy is already
net usable pack energy, as NASA quotes it (Johnson & Silva 2022 section 4.1).
It suppresses all three deratings: C-rate, the state-of-charge window and
pack efficiency (`:1107-1119`).

The loop reads `p.socMin` and `p.etaBat` without fallbacks (`:1123`,
`:1175`). Their defaults come from `DEFAULT_PARAMS`:

- `socMin = 0.19`;
- `etaBat = 0.90`;
- `sedCell = 300` Wh/kg (`src/lib/defaults.js:184`).

The usable fraction is `1 − socMin`, which is the depth of discharge. The
source cited is Antcliff 2019 and Johnson & Silva 2022, "discharge to
15%-20% capacity" (`src/engine.js:91-95`).

### 5.2 Battery efficiency, scoped to vertical flight

**Scoping.** By default (`etaBatScope` not `"mission"`), the battery
efficiency is charged only against the hover segments
(`src/engine.js:1175-1188`):

```
η_raw   = 1 if packUsable, else p.etaBat
E_vert  = E_to + E_ld            (etaBatScope "mission": E_vert = E_tot)
E_req   = (E_tot − E_vert) + E_vert / η_raw
η_B     = E_tot / E_req          (the single effective efficiency)
```

The comment cites "Exploration of Design Drivers for the RVLT Lift+Cruise
Reference Aircraft" (corpus S3270). That paper states that NASA's Rotorcraft
Sizing Tool applies the battery efficiency term only in high-power vertical
flight states (`:1129-1142`). The climb segment is a forward climb and is not
included in `E_vert` (`:1177-1179`).

**`batteryConvention()`** (`src/engine.js:102-121`) carries the same
convention for the payload-range and sweep code:

```
usableFrac     = 1 − socFloor
energyFromMass = kg · sed_eff · η_eff · usableFrac / 1000
massFromEnergy = kWh · 1000 / (sed_eff · η_eff · usableFrac)
```

### 5.3 Energy and power constraints

```
W_E = E_tot · 1000 / ((1 − socFloor) · sed_eff · η_B)          kg     (energy)
SP  = p.spBattery ?? sed_eff · maxCRate / 1000                 kW/kg  (maxCRate default 4.0)
W_P = P_hov / max(0.05, SP)                                    kg     (power)
W_bat = max(W_E, W_P)
```

(`src/engine.js:1192`, `:1206-1209`).

- The specific power is derived from the specific energy and a sustainable
  discharge rate, so the energy side and the power side use the same
  discharge regime (`:1193-1205`).
- `packSizedBy` reports which constraint governed (`:3400`).
- `battPowerLimited` reports whether the power constraint governed
  (`:3503`).

### 5.4 Pack systems inside the loop

Pack-systems mass is computed in each iteration and fed into the next
iteration's empty weight as `packSystems`. The pack systems are:

- the battery thermal management system (BTMS);
- the battery management system (BMS);
- mounts;
- thermal-runaway protection.

The pack architecture is continuous in the loop (`src/engine.js:1241-1262`):

```
V_cell = 3.6 V,  Ah_cell = 5.0,  V_pack = 800 V
N_s    = round(800/3.6)
N_p    = max(1, (E_pk·1000/800)/5)          continuous (no ceil) inside the loop
R_int  = 0.030 · N_s / N_p
Q_hov  = (P_hov·1000 / (N_s·V_cell))² · R_int
Q_cr   = (P_cr ·1000 / (N_s·V_cell))² · R_int      (0 for turboelectric)
```

- `E_pk` is `E_tot` for a battery aircraft, or the emergency pack capacity
  for a turboelectric one (`:1253`).
- The continuous `N_p` avoids a limit cycle that the rounding caused
  (`:1244-1249`).
- `batteryThermal` (section 11.2) returns the systems mass. The mass is
  stored as `packSysPrev`, together with `WbatPrev`, for the next pass
  (`:1257-1261`).

### 5.5 Post-loop pack figures

The post-loop pack figures use integer parallel strings and the sizing
convention (`src/engine.js:1921-1968`):

```
N_p       = ceil(E_arch·1000/800/5)
PackkWh   = W_bat · sed_eff · η_B / 1000          total
PackUsable= PackkWh · (1 − socFloor)              spendable
PackInst  = W_bat · sed_eff / 1000                nameplate at derated SED
C_hov     = (P_hov·1000/V_pack)/Ah_pack           (0 for turboelectric)
C_cr      = (P_cr ·1000/V_pack)/Ah_pack
```

The comment at `:1927-1945` records why `PackkWh` must use the same
convention as the sizing.

---

## 6. Weights

### 6.1 Two empty-weight models

`p.weightModel` selects the empty-weight model (`src/engine.js:1021-1104`).

**`"fraction"`** is the engine's default when the field is absent:
`W_empty = ewf·MTOW`, with `ewf = p.ewf ?? 0.50` (`:169`, `:1102`). The
battery is not in this fraction. It is sized separately as `W_bat`.

**`"buildup"`** is the `DEFAULT_PARAMS` default
(`src/lib/defaults.js:210`). It runs `componentWeights(p, g)` each iteration
(`src/engine.js:1064-1071`), with:

- the current MTOW;
- the current wing geometry;
- the V-tail or conventional-tail mass for this iteration (`:1041-1054`);
- `P_hov`, `P_cr` and `T_hov`;
- the previous pack-systems and battery masses;
- the ultimate load factor from the load cases (section 6.3).

**Fallback.** If the build-up total is non-finite, not positive, or at least
MTOW, the loop uses `ewf·MTOW` for that iteration instead. The loop also:

- counts the fallbacks;
- records whether the final iteration fell back.

The outputs `weightBuildupUsed`, `weightBuildupFellBackAtConvergence` and
`weightBuildupFallbacks` report this (`src/engine.js:1087-1098`,
`:3665-3670`).

`CONFIG_DEFAULTS` carries per-layout `ewf` values
(`src/engine/configuration.js:677`, `:696`, `:718`). The engine's fraction
path reads `p.ewf`, not those values (`src/engine.js:169`).

### 6.2 Component groups (`src/engine/weights.js`)

`componentWeights` (`src/engine/weights.js:202-749`) returns `groups`,
`total` and the group sums. Structure groups are multiplied by
`structTechFactor` and propulsion groups by `propTechFactor`. Systems groups,
avionics, furnishings and pack systems are not factored (`:714-738`). The
code values are:

- `structTechFactor = 1.001`;
- `propTechFactor = 1.000` (`:169`, `:172`).

**Code/comment disagreement:** the comment above `structTechFactor` still
says "Adopted value 1.179, fitted 2026-08-24" (`:158-164`). The code carries
1.001.

The following table lists every group, its model and its source. The code
evaluates the regressions in imperial units (lb, ft, ft², lb/ft²) and
converts the results back.

| group | model | source cited in code | lines |
|---|---|---|---|
| wing | AFDD93. The equation is given below the table. It is zero when there is no wing. The result is multiplied by `compositeWing` = 0.85. | NDARC TP-20220000355 §29-1.2; Silva et al. 2018 for its use on the UAM Lift+Cruise; Raymer §15.2 for the composite credit | `:211-258`, `:48` |
| fuselage | AFDD84 by default, or Raymer Eq. 15.48 when `p.fuselageModel === "raymer"`. The equation is given below the table. | NDARC TP-20250010468 §29-4 (AFDD84); Johnson, Silva & Solis 2018 Table 6 for NASA's own fuselage factors | `:260-359` |
| tail | V-tail or conventional tail, Raymer-derived per-surface form. Zero when there is no wing. | "simplified Raymer eq 15.26" | `:364`; `src/engine.js:1041-1054`, `:1727` |
| landing gear | `landingGear()`, drop-test energy sizing (section 6.5) | see `src/engine/landinggear.js:10-70` | `:370-371` |
| motors | `N × motorMass(P_inst)`. `P_inst` is the installed continuous rating from `propulsionSizingConditions` (section 6.4), or `1.15·P_hov/N` when `p.legacyMotorSizing`. The motor mass models are listed below the table. | see `src/engine/motormass.js` | `:383-449` |
| inverters | `N·P_inst/20` kg (20 kW/kg) | `[CAL]` | `:504`, `:134` |
| rotors | `rotorGroup()`: AFDD00 by default, or AFDD82, or the `[CAL]` 2.0 kg/m² disk-area model. The equations are given below the table. | NDARC TP-20250010468 §29-2 | `:530-564`; `src/engine/rotorgroup.js:261-348` |
| cruise propulsion | Only for a layout with a pusher. The rating is `P_cr·share/dutyLimit`, with share `1/cruiseThrustUnits` and duty limit 0.80 `[LAY]`. Mass is rating/5.0 (motor) + rating/20 (inverter) + 2.0 kg/m² × propeller disc area. | NASA Table 3 (Johnson & Silva 2022) for the extra cruise motor | `:592-639` |
| drive system | `driveSystem()`, AFDD00 gear box and rotor shaft per drive train, zero at `motorGearRatio = 1` (direct drive, the default). The equation is given below the table. | NDARC TP-20250010468 §29-7.4 | `:499-503`; `src/engine/drivesystem.js:93-152` |
| booms | `boomStructure()`, statics (section 6.6) | Silva et al. AIAA 2018-3847 for the missing boom mass; Timoshenko & Gere for shell buckling | `:577-590` |
| nacelle | `nacelleGroup()`. The engine-support term is always computed; the cowling term only when `p.nacelleWettedAreaM2` is set; pylon and air-induction terms default to zero. The support equation is given below the table. | NDARC TP-20250010468 §29-6, AFDD82 | `:729-730`; `src/engine/nacelle.js:89-117` |
| flight controls | Default: `0.025 × airframe mass`, with airframe mass = MTOW − previous battery mass, plus an optional conversion term. `flightControlsModel:"afdd"` selects the AFDD82 forms. | NASA Table 12 for the airframe base (`[CAL]`); NDARC TP-20250010468 §29-8 for the AFDD forms | `:681-687`; `src/engine/flightcontrols.js:102-155` |
| electrical | 0.0131·MTOW | `[CAL]` against NASA/TM-20210017971 Table 12; the electrical/ECS split is `[LAY]` | `:103`, `:688` |
| ECS | 0.0065·MTOW | same as electrical | `:104`, `:689` |
| avionics | `avionics()`, a component list whose flight-critical items are multiplied by a lane count, plus 35% for wiring. The detail is given below the table. | per-unit masses `[LAY]` | `:692-693`; `src/engine/avionics.js:79-107` |
| furnishings | (10.43 + 4.57) kg per seat, seats = `max(1, round(payload/90))` | 10.43 kg: NASA Silva 2024 "4 seats at 23 lb each"; 4.57 kg: `[LAY]` | `:653`, `:694-695`, `:120-122` |
| pack systems | from the previous iteration (section 5.4) | see `src/engine/battery-thermal.js` | `:651` |

**Wing (AFDD93).** The equation, with lb, ft² and lb/ft² inside:

```
w_wing = 5.66411·f_LGloc·[W_SD·f_L/(1000·cosΛ)]^0.847·n_z^0.39579·S_w^0.21754·A^0.50016
         ·((1+λ)/τ)^0.09359·(1 − b_fold)^−0.14356
```

- `f_LGloc` is 1.7247 when the gear is on the wing, else 1.
- `f_L` is `p.wingLiftFactor` (default 1).
- `n_z` is the ultimate load factor from the load cases.
- The wing is zero when there is no wing because AFDD93 depends on gross
  weight even at S_w = 0 (`:253-258`).

**Fuselage (AFDD84).** The default equation:

```
w_basic = 25.41·f_LGloc·f_LGret·f_ramp·(W_MTO/1000)^0.4879·(n_z·W_SD/1000)^0.2075·S_body^0.1676·l^0.1512
W_fus   = w_basic · χ_basic · (1 + χ_cw·f_cw) + increment
```

- `χ_basic` defaults to 0.90 (`compositeFuselage`).
- `χ_cw` defaults to 1 and `f_cw` to 0; both are optional inputs.

The wetted area `S_body` is computed as
`fuselageWettedArea(L, D) · (1 − 2/λ)^(2/3) · (1 + 1/λ²)` with
λ = max(2, L/D) (`:274-275`). **Code/comment disagreement:**

- `fuselageWettedArea` already applies Raymer's fineness correction above
  fineness 2.5 (`src/engine/constants.js:41-50`).
- The code multiplies by the same correction a second time.
- The adjacent comments ("ONE WETTED AREA, NOT TWO", `:262-273`) say the
  weight model uses the same area as the drag model. The drag model applies
  the correction once (`src/engine.js:698`).

**Motor mass models** (`src/engine/motormass.js:43-77`). The torque at the
motor is `τ = P/(ω·gearRatio)`, with `ω = V_tip/R` (`:433-435`). The model is
chosen with `p.motorMassModel`:

- `emraxTorque` (default): `W = 0.5591·τ^0.6266` kg, a `[CAL]` fit to four
  EMRAX entries. Above τ = 546 N·m, the curve is evaluated at 546 N·m and the
  extra power is charged at 5.0 kW/kg. This keeps the hand-off continuous.
- `nasaTorque`: `W_lb = 1.322·0.5663·τ_ftlb^0.8207`, cited to
  NASA/TM-20210017971 §6.1.2.2.
- `torqueDensity`: `τ/49` N·m/kg, cited to Joby.
- `specificPower`: `P/5.0`.

**Rotors.** The AFDD00 equations, with ft, ft/s and lb:

```
w_blade = 0.0024419·f_tilt·N_rotor·N_blade^0.53479·R^1.74231·c^0.77291·V_tip^0.87562·ν^2.51048
w_hub   = 0.0061182·N_rotor·N_blade^0.20373·R^0.60406·V_tip^0.52803·ν^1.00218·(w_blade/N_rotor)^0.87127
```

- The chord comes from solidity: `c = σ·π·R/N_blade`
  (`src/engine/rotorgroup.js:321-322`).
- **Stopped and free rotors are priced separately.** The code exploits the
  fact that the equations are linear in `N_rotor` (`weights.js:520-563`):
  - Stopped rotors use `ν = 1.25` (hingeless).
  - Free rotors use `ν = 1.03` (flapping). Both values are cited to NASA's
    "Concept Vehicles for VTOL Air Taxi Operations"
    (`rotorgroup.js:241-244`).
  - `f_tilt = 1.1794` applies only to free rotors on a layout whose rotors
    physically tilt (`weights.js:547-556`).
- **Code/comment disagreement:** the comment at `rotorgroup.js:307-316`
  still describes a 1.10/rev default. The code uses the per-type values
  above.

**Drive system (AFDD00).** Per drive train, with hp and rpm:

```
w_gbrs = 95.7634·N_rotor^0.38553·P^0.78137·rpm_eng^0.09899 / rpm_rotor^0.80686
```

`N_rotor = 1` per train. The mass is N × the per-train value.

**Drive failure.** For a cross-shafted layout (`oeiThrustShare: false`),
`driveFailure()` computes a post-failure drive limit
`P_DSlimit = max(P/N, 0.60·P)`. This limit is reported and deliberately not
charged as mass (`weights.js:474-503`, `src/engine/drivefailure.js:78-113`).

**Nacelle support.** The engine-support term (AFDD82):

```
W_supt = 0.0412·(1 − f_airind)·(W_eng/N_eng)^1.1433·N_eng^1.3762
```

The count is the lift motors only (`weights.js:721-728`).

**Avionics.** The `avionics()` function (`src/engine/avionics.js:79-107`):

- Flight-critical items are multiplied by a lane count: 3 in Category
  Enhanced, 2 in Category Basic, or `p.fcsLanes`.
- Some items are included only for piloted aircraft and some only for
  autonomous ones.
- Wiring adds 35% of the rest.

**Group sums** (`weights.js:744-748`):

- `structure` sums wing, fuselage, tail, gear, booms and nacelle.
- `propulsion` sums motors, inverters, rotors, cruise propulsion and drive
  system.
- `systems` sums flight controls, electrical, ECS, avionics, furnishings and
  pack systems.

For turboelectric designs, the engine adds the turboshaft, generator and
tank to `propulsion` (`src/engine.js:1231`).

### 6.3 Load factors used by the weights

`componentWeights` requires `g.nzUltimate` and throws if it is missing
(`src/engine/weights.js:204-206`). The engine supplies it each iteration
from (`src/engine.js:1060-1063`):

```
airframeLoadFactors(p, hasWing ? loadCases(p, {MTOW, Swing, MAC, rho: ρ_cr, rho0: 1.225, CLaW, vCruise}) : null).nUltimate
```

The same ultimate factor enters the AFDD93 wing and the AFDD84 fuselage
equations (section 10). The booms do not read it:

- `boomStructure` uses `p.nzUltimate ?? 1.5·thrustBorneLimitFactor(p)`
  (`src/engine/booms.js:213`).
- `thrustBorneLimitFactor(p) = max(2.0, max(1, twRatio))`, with `twRatio`
  taken as 1.3 when absent (`src/engine/loadcases.js:139-142`).

The load factor passed to the weights is reported as `weightsNzUltimate`.
It is null when the final iteration fell back to the fraction model
(`src/engine.js:3471-3472`).

### 6.4 Installed motor rating — the sizing conditions

`propulsionSizingConditions`
(`src/engine/sizing-conditions.js:157-393`) builds per-motor shaft powers
for five conditions. P_h is `P_hov/N`.

| key | kW per motor | duty | lines |
|---|---|---|---|
| hover | P_h | sustained | `:165-167` |
| twInstalled | P_h·(T/W)^1.5, with T/W = max(1, twRatio) | sustained | `:198-203` |
| vertClimb | P_h·[Vz/(2v_h) + sqrt((Vz/(2v_h))² + 1)], with v_h = sqrt((W/N)/(2ρ_hov·A)) | sustained | `:212-222` |
| oeiTransient | P_h·(NASA Table 4 factor) | transient | `:230-235` |
| cruise | P_cr·(1 − pusher share)/nTilting, and 0 when nothing tilts | sustained | `:254-266` |

`W` here is MTOW·9.81 (`src/engine/weights.js:392`).

**Continuous-equivalent conversion.** Each condition is converted to a
continuous-equivalent rating (`sizing-conditions.js:318`):

- sustained conditions: kW;
- transient conditions: kW / 2.00. The seconds-scale burst ratio of 2.00
  is cited to NASA/TM-20210017971 §6.1.

**Rating.** The installed continuous rating is the worst sustained condition
× `installationMargin` (default 1). When `p.priceTransientIntoMass === true`,
it is the maximum over all conditions instead (`:345-350`).

**Capability check.** The check uses:

- `availablePeakKW = rating × 2.00`;
- `requiredPeakKW = max(worst transient, rating)`;
- `peakAdequate` with a 1e-9 relative tolerance (`:361-386`).

**Code/comment disagreement:** the comment at `:293-301` says the transient
is priced into the rating at the minutes-scale peak ratio 1.693.

- The code divides by the burst ratio (`:318`).
- The code uses transients for the rating only under
  `priceTransientIntoMass` (`:345-347`).
- `MOTOR_PEAK_TO_CONTINUOUS` (1.693) is computed and returned
  (`:270`, `:355`), but it enters no rating.

**Table 4 factor.** `motorTransientRequirement(p)`
(`src/engine/motor.js:146-233`) chooses the column as follows:

- **Rotor count.** The column family is quad for N ≤ 4, hex for N ≤ 6 and
  oct otherwise.
- **Control scheme.** It comes from `ROTOR_CONTROL_BY_CONFIG`, unless
  `p.rotorControl` is given (`:83-99`).
- **Missing columns.** A combination with no published column falls back to
  the hex column for the same control scheme (`:154-158`).
- **Governing value.** The factor is the largest criterion in the chosen
  column (`:162-169`). The table is cited to Johnson & Silva, The
  Aeronautical Journal 126(1295), 2022, Table 4 (`:17-26`).
- **Mixed control.** The hybrid layouts are marked mixed control. The
  requirement is reported as a bracket between the two columns and
  `determinate = false` (`:171-205`).
- **Interconnected drive.** A layout with `oeiThrustShare: false` is marked
  interconnected, and the published figure is reported as an upper bound.

### 6.5 Landing gear

`landingGear(p, {MTOW})` (`src/engine/landinggear.js:168-244`) sizes the
gear from drop-test energy absorption. The module quotes EASA's MOC-4
SC-VTOL Issue 2 (11 July 2025) for the acceptable means of compliance
(`:22-37`).

**Drop heights** (`:178-183`):

```
h_limit   = p.dropHeightM ?? max(0.20 m, v_sink²/(2g))        v_sink default 1.98 m/s
h_reserve = 1.5 · h_limit
v_limit   = sqrt(2g·h_limit),   v_reserve = sqrt(2g·h_reserve)
```

**Strut stroke.** The stroke comes from the energy balance
`½mv² + (1−L)mg(s_s+s_t) = n·mg(η_s·s_s + η_t·s_t)` (`:72-82`):

```
s_s = [v²/(2g) − s_t·(n·η_t − (1−L))] / (n·η_s − (1−L))      (floored at 0.02 m, denominator ≥ 0.1)
```

The inputs are:

- rotor lift fraction L = 2/3;
- n = 3.0 `[LAY]`;
- η_oleo = 0.85 or η_spring = 0.50;
- η_tyre = 0.47;
- tyre stroke `s_t = 0.30 × OD × 0.30` (`:197-202`, `:117-131`).

The reserve stroke scales with the drop-height ratio. The fitted stroke is
the reserve stroke × `strutStrokeMargin` (default 1.05). `bottomsOut` is
`strokeFitted < strokeReserve` (`:206-208`), so it is false whenever the
margin is at least 1.

**Tyres and mass.**

- Tyres are the lightest Goodyear TSO-C62e entry that carries 1.07× the
  static wheel load (`:100-115`, `:149-161`).
- Tyre mass is `[CAL] 0.0021·OD^2.5·ply^0.4` (`:144-146`).
- Strut mass is `[CAL] 4.4e-5 × energy × stroke × 1000` per main strut,
  with nose struts at 0.45 of a main strut (`:219-221`).
- Wheels and brakes are 0.55 of tyre mass (`:223`).

**Code/comment disagreement:** a comment at `:204-205` names a paragraph that
the module header (`:17-20`) says was cited wrongly.

### 6.6 Booms

`boomStructure(p, {MTOW, nRotors, Thov})`
(`src/engine/booms.js:162-406`) returns zero when the layout has no booms.
Otherwise it proceeds as follows.

**Thrust per boom.**

```
T_boom = T_hov · (n_boom_rotors/N) / n_booms
```

The boom rotors are the stopped rotors, or all rotors on a layout with
`stoppedFrac = 0` (`:169`, `:217-219`).

**Arm.** The arm is the RMS of the forward and aft arms from the wing station
to the rotor stations, with the rotor stations at 0.10 and 0.80 of fuselage
length by default (`:227-235`).

When there is one boom per rotor (N ≥ 2), the arm is floored at the ring
radius (`:291-294`, `src/engine/coaxial.js:102-109`):

```
a ≥ spacing·2R / (2·sin(π/N))
```

The spacing comes from `hubSpacingFor` (`coaxial.js:331-338`):

- 1.37 D for multicopters with N ≤ 4, cited to AIAA 2018-3847;
- 0.84 D for the side-by-side;
- 1.05 D otherwise.

Interleaved rings (even multicopters with N > 8) use 0.679 D instead
(`coaxial.js:99`, `:314-328`).

**Code/comment disagreement:** the comments at `booms.js:270-283` and
`configuration.js:113-117` describe the side-by-side as sized at tangency
(span = 1.0 D). The code passes the 0.84 spacing, which places the hubs
0.84 D apart, so the discs overlap.

**Tube wall** (`:311-316`):

```
M     = n_z · T_boom · arm
t_str = M / (π·r²·σ_allow)                          σ_allow = 350 MPa
t_bkl = sqrt( M / (π·r·k_d·0.6053·E) )              k_d = 0.5 [LAY], E = 135 GPa
t     = max(t_str, t_bkl, 1 mm)
```

The tube radius is `r = max(0.04, 0.075·R_rotor)` (`:297`).

**Mass** (`:391-396`):

```
per boom   = ρ_CFRP·2π·r·t·arm
tubes      = per boom · n_booms
attachment = 0.35 · tubes      [LAY]
```

A sandwich construction option exists (`:364-389`).

---

## 7. The sizing loop and solver

### 7.1 Round 1

Round 1 finds the fixed point of
`MTOW = payload + ewf·MTOW + bf·MTOW` (`src/engine.js:398-408`), starting from
2177 kg:

```
bf = g·range·1000 / (LD·η_sys·sedCell·3600)
```

- Round 1 stops at the tolerance below, or after 5000 iterations.
- It also stops if MTOW exceeds 5700 kg. This limit is a literal and does not
  come from the certification limit.

### 7.2 Round 2 and the closure residual

Each pass of the loop (`src/engine.js:677-1453`, at most 600 passes)
computes the aerodynamics, powers, energies, empty weight, battery and pack
systems at the current iterate. It then forms the closure mass:

```
m_n = payload + W_empty + W_bat (+ fuel, turboelectric)          (:1263)
f   = m_n − MTOW
```

The history of MTOW, energy and residual is stored for the convergence
chart (`:1265-1266`, `:2113-2117`).

### 7.3 Tolerance

The tolerance is scaled to gross weight (`src/engine.js:394-395`):

```
ε   = 10^(p.convTolExp ?? −6)
tol = 0.01 · max(1, |MTOW|) · ε          (MTOW in kg)
```

The loop is converged when `|m_n − MTOW| < tol` (`:1267`). The comment quotes
NDARC TP-20220000355 §5-1.2, "0.01·W·ε for gross weight"
(`:372-387`). The `??` operator keeps an exponent of 0 legal (`:388-393`).

### 7.4 Hybrid solver

The comment cites Ugwueze, Statheros, Horri, Bromfield & Simo, "An Efficient
and Robust Sizing Method for eVTOL Aircraft Configurations in Conceptual
Design", Aerospace 2023, 10, 311 (`:1343-1373`). The update works as follows
(`src/engine.js:1374-1452`).

**Bracket.** A bracket `[brLo, brHi]` is recorded whenever two consecutive
residuals change sign (`:1377-1379`).

**Fixed-point step.**

```
next = (1 − λ)·MTOW + λ·m_n        λ = clamp(p.sizingRelaxation ?? 1.0, 0.05, 1)
```

(`:1391-1392`). The comment records that relaxation on MTOW was measured and
did not help, and cites NDARC TP-20220000355 §5-2.1 for the relaxed
iteration form (`:1294-1341`).

**Switch to secant.** The secant form is used only when all of the following
hold (`:1402-1404`):

- `|f| ≤ solverSwitchFrac·MTOW` (default 0.05);
- a previous iterate exists;
- `p.solver !== "fixed-point"`;
- the secant has not been disabled.

The secant step is:

```
cand = MTOW − f·(MTOW − x_prev)/(f − f_prev)
```

The step is accepted if the candidate is finite, lies in (0, 20000) and lies
inside the bracket when one exists. Otherwise the solver takes the bracket
midpoint (bisection) if a bracket exists, or the fixed-point step if not
(`:1405-1415`).

**Stall guard.** If `|f|` does not decrease across a secant step,
`secantStalls` increments. At `p.solverStallLimit ?? 1` stalls, the secant is
disabled for the rest of the run. The comment attributes this to discrete
feedback in the build-up, such as tyre tables and airfoil selection
(`:1416-1430`).

**Reported state.** The run reports:

- `solverMethod`;
- `solverPhaseFinal`;
- the numbers of secant and bisection steps;
- `solverBracketed` (`:3574-3576`).

### 7.5 Ceiling guard and divergence reporting

**Category limit.**

```
mtomLimit = mtomLimitFor(p)      p.mtomLimitKg, or a named p.certBasis, or MTOM_SMALL_CATEGORY_KG = 5700
```

(`src/engine.js:649`, `src/engine/certification.js:44`, `:64-68`).

**Ceiling.**

```
mtowCeiling = max(1, p.mtowCeilingKg ?? (finite(mtomLimit) ? 2·mtomLimit : 20000))
```

(`src/engine.js:656-657`).

**Guards.** The loop stops with `r2Diverged = mtowCeilingHit = true` when
either:

- the closure mass `m_n` is non-finite or above the ceiling (`:1293`); or
- the next step is non-finite or above the ceiling (`:1450`).

**Non-convergence.** If the loop ends without meeting the tolerance,
`r2Diverged = true` (`:1458`).

**Certification limit.** `noSolutionBelowCertLimit` is set when
`MTOW ≥ certLimit` and `f > 0`. `certLimit` is `p.mtowCertLimitKg ?? 5700`
(`:665`, `:1389`). It is reported and does not stop the loop.

**Mass balance gap.** `massBalanceGapKg = payload + W_empty + W_bat + fuel −
MTOW` is reported. It is non-zero on a design that did not close
(`:3672-3690`).

**Code/comment disagreements about the category limit:**

- Several engine comments still give the small-category limit as 3,175 kg
  under SC-VTOL-01 (`src/engine.js:647-648`, `:1281-1291`, `:2419-2425`).
- The provenance entry for `mtomLimitKg` says the same
  (`src/lib/provenance.js`, `mtomLimitKg`).
- The comment at `:1335-1338` calls 5,700 kg an aeroplane-category boundary
  rather than the SC-VTOL limit.
- The code default is 5700 kg, and `certification.js:10-24` records the
  correction to SC-VTOL-02 Issue 2.
- The ceiling check's text reads "2x the SC-VTOL ceiling" (`:2487`), which
  is consistent with the code.

### 7.6 Other iterations around the core

- **Wing position.** `solveWingPosition` (section 9.4).
- **Rotor diameter.** `solveRotorDiameter`
  (`src/engine/configuration.js:837-864`) solves for the diameter that holds
  the configuration's disk loading at the converged MTOW. It uses
  under-relaxation 0.7 and a tolerance of 1e-4 m.
- **Controllable margin.** `solveControllableTW` (`:1000`) solves for the
  thrust margin that gives controllable one-rotor-out flight.
- **Inverse problems.** `maxRangeAtMTOM` and `maxPayloadAtMTOM` bisect on
  range or payload against the category limit
  (`src/engine/certification.js:85-155`).

---

## 8. Turboelectric powertrain

Source: `src/engine/turboelectric.js`. Engine use: `src/engine.js:1211-1233`.

**Architecture.** A turboshaft drives a generator that supplies the motors,
with zero net battery flow. The battery is sized only for an engine-out
landing. The module quotes:

- Johnson, Silva & Solis, AHS 2018 (NTRS 20180003381), p.7;
- NASA/TM-20210017971 §3;
- Johnson & Silva 2022 p.68;
- Silva et al., AIAA ATIO 2018 (`:10-21`).

**Engine model.** The engine follows the simple referred-parameter form of
NDARC TP-20220000355 §21 (`:23-32`):

```
δ√θ = (P/101325)·sqrt(T/288.15)                                    (:118-120)
```

**Per-pass sizing.** `sizeTurboelectric(seg, bat, o, cond)` (`:127-159`)
computes:

```
hoverKW     = max(P_hov, installedHoverKW)
cruiseKW    = max(P_cl, P_cr, installedCruiseKW)
generatorKW = max(hoverKW, cruiseKW)
η           = η_gen·η_gb = 0.95 · 0.98
ratedKW     = max( hoverKW/(η·δ√θ_hov) , cruiseKW/(η·δ√θ_cr) )      sea-level static rating
engineKg    = (lb/hp)(rated) · rated         table interpolated in log(hp) [LAY]
generatorKg = 0.150 lb/hp · generatorKW
fuelBurnKg  = sfc · E_mission · (1/η) · 1.05
fuelResKg   = sfc · E_res     · (1/η) · 1.05
fuelKg      = fuelBurnKg + fuelResKg
tankKg      = 0.19 · fuelKg
E_emerg     = P_hov · 120 / 3600
W_P         = (P_hov/14) · 1000 / sed_eff
W_E         = E_emerg · 1000 / ((1 − socFloor)·sed_eff·η_bat)
batteryKg   = max(W_P, W_E)
```

- **Engine table.** Specific weight and sfc come from
  `TURBOSHAFT_TABLE`: 100, 200, 750 and 4000 hp, from Johnson, Silva & Solis
  2018 Table 4 (`:57-62`). Outside 100–4000 hp the end row is used and
  `clamped` is set (`:91-108`).
- **Other constants.** The efficiencies, generator specific weight, 5% fuel
  flow factor, 0.19 tank fraction, 120 s emergency hover and 14 C emergency
  rate are each tagged with their source (`:64-88`).

**Inputs from the engine** (`src/engine.js:1216-1224`):

```
installedHoverKW  = PmotInstalledKW·nPropHover + cruiseRatingKW
installedCruiseKW = cruiseRatingKW
lapseHover        = δ√θ at the hover point
lapseCruise       = δ√θ at cruise
```

Both installed powers are 0 under the fraction model, which builds no motor
rating.

**Effect on the loop** (`src/engine.js:1225-1232`, `:1263`):

- the pack mass is replaced by `batteryKg`;
- the engine, generator and tank masses are added to `W_empty` and to the
  `propulsion` group sum;
- the fuel is added to the closure mass.

**Pack architecture.** The pack systems use the emergency pack capacity and
zero cruise heat (`:1253-1256`).

**Payload-range.** The payload-range curve holds hover and reserve fuel and
scales cruise range with the remaining fuel (`:2042-2051`).

**Reported omissions.** Two model omissions are reported as `omission`
checks (`src/engine.js:3191-3192`; `turboelectric.js:28-32`):

- sfc is constant with power setting;
- √θ gives more power on a hot day, where a real turboshaft gives less.

A table-range advisory is also reported (`:3193-3195`).

---

## 9. Wing, tail, stability and static margin

### 9.1 Wing sizing

`wingArea(p, W, q)` (`src/engine/wing.js:86-108`):

```
S_ws  = W / (W/S)_design           (W/S)_design = p.wingLoadingNm2 ?? 1450  [CAL]
S_cl  = W / (q·C_L,cr,max)         C_L,cr,max = p.clCruiseMax ?? 0.90       [LAY]
S_w   = max(S_ws, S_cl)
```

The comment cites Raymer ch. 5 for the constraint-diagram approach and
Johnson & Silva 2022 §6.3 (`:39-64`). `p.wingSizedBy === "cl"` restores the
legacy form `S = W/(q·clDesign)` (`:90-93`). The app default wing loading is
1371 N/m² for the hybrid (`src/lib/defaults.js:113`).

**Geometry** (`src/engine.js:1467-1476`):

```
b    = sqrt(AR·S)
C_r  = 2S/(b(1+λ)),  C_t = λ·C_r
MAC  = (2/3)·C_r·(1+λ+λ²)/(1+λ)
Y_mac= (b/6)(1+2λ)/(1+λ)
X_ac = C_r − MAC + 0.25·MAC
Λ_LE = atan((C_r − C_t)/(b/2))
```

The airfoil is selected by `selectAirfoil(p, Re, C_L)`
(`src/engine.js:1479`, `src/engine/airfoils.js`).

**Fuselage length.** The fuselage length used by drag, weights and the
tail arm is not the input `fusLen` unless `p.fuselageSizing === "fixed"`:

```
L_fus = fusLen · (payload / 453)^(1/3)
```

(`src/engine.js:529-533`). The 453 kg reference is cited as Joby S4's
1,000 lb payload at 7.32 m length (`:500-505`). The comment records that
scaling on MTOW was tried and rejected as unstable (`:488-499`).

On winged layouts with a tail, the body is then lengthened if needed so the
fore/aft rotor array fits (`:568-581`):

```
L_fus ≥ D / [(0.806 + 0.0744) / (1 + 1.05)]
```

- 0.0744 is a nose overhang ratio `[SRC]` from SWFT.
- 0.806 is the engine's own tail station.
- 1.05 is `1 + rotorTipClearFrac`.

The fuselage diameter used for areas is `sqrt(width·height)` when
`fusHeight` is given (`:525-527`, `src/engine/cabin.js:152-156`).

### 9.2 Drag build-up

**Drag areas.** Inside the loop the drag is summed as dimensional drag areas
in m². C_D0 is formed by dividing the total once by the wing area
(`src/engine.js:694-759`). The comment cites NDARC TP-20220000355 section 8
for drag area as the primitive (`:705-733`).

```
Re        = ρ·V·MAC/μ
C_f       = 0.455 / (log10 Re)^2.58 / (1 + 0.144·M²)^0.65
FF_wing   = (1 + (0.6/0.30)·t/c + 100·(t/c)⁴)·1.05          (Raymer Eq. 12.35)
FF_fus    = 1 + 60/λ_f³ + λ_f/400
S_wet,w   = 2S(1 + 0.25·t/c·(1 + 0.25λ))
S_wet,f   = fuselageWettedArea(L, D_eq)
S_wet,ht  = 2S·0.18,  S_wet,vt = 2S·0.12      (fixed fractions of wing area)
S_wet,nac = N·0.10·πR²
D/q       = C_f,w·FF_w·S_wet,w + C_f,f·FF_f·S_wet,f + C_f,w·1.05·(S_ht+S_vt)
          + C_f,w·1.30·S_nac + (hub + stopped-blade + gear + misc areas)
```

- Flow is assumed fully turbulent (`:1498-1501`).
- The tail wetted areas are not the sized tail (`:1491-1492`).
- The fuselage wetted area uses the fineness-corrected Raymer form above
  fineness 2.5 and a prolate spheroid below it
  (`src/engine/constants.js:41-50`).
- For a non-circular body, `D_eq = sqrt(width·height)` is used for areas
  (`src/engine.js:525-527`).

**Rotorcraft terms** (`src/engine/drag.js:47-115`):

```
hub      = nHubsExposed · A · 0.0040                [CAL]
stopped  = nStopped · σ·A · 0.0090                  [CAL]
gear     = C_D0,gear · S_w     (fixed 0.015, retractable 0.003, faired 0.001; Raymer Table 12.6)
misc     = 0.002 · S_w
```

- The gear type defaults to `"fixed"` (`drag.js:56`).
- Without a wing, the gear and misc areas are `null`, and the engine sums
  them as zero (`src/engine.js:750-751`).
- **Code/comment disagreements:**
  - `drag.js:92-97` says wingless gear drag falls back to a fraction of
    fuselage drag. The code does not do this.
  - `src/engine.js:1513-1515` describes eVTOLs as using 0.003 retractable
    gear. The default gear type is fixed.

**Cross-check.** An NDARC-style coefficient,
`k = (D/q)_ft² / (W_klb)^(2/3)`, is reported with a verdict band
(`src/engine.js:3341-3349`).

### 9.3 Tail sizing

**Tail arm.** `l_v = 0.88·L_fus − x_ac,wing` (`src/engine.js:1658`).

**Required areas** (`:1660-1661`):

```
S_h,req = C_h·S·MAC / l_v
S_v,req = C_v·S·b / l_v
```

The volume coefficients default to C_h = 0.45 and C_v = 0.032
(`src/lib/defaults.js:308-309`).

**V-tail** (`src/engine.js:1682-1706`):

```
Γ_opt   = atan( sqrt(S_v,req/S_h,req) )
S_panel = max( S_h,req/(2cos²Γ) , S_v,req/(2sin²Γ) )
S_vt    = 2·S_panel
```

Γ is `Γ_opt` unless `p.autoVtGamma === false` (`:1698-1699`). The comment
cites Ruscheweyh / Raymer §6.3 (`:1663-1678`).

**Conventional tail.** Used when `tailType` is `"conventional"`, as for the
hybrid (`src/engine/configuration.js:469`):

- the stabilator carries S_h,req;
- the fin carries S_v,req, minus an optional ventral share;
- the aspect ratios are 2.50 and 1.103, `[SRC]` RAVEN
  (`src/engine.js:1751-1800`).

**Tail mass.** Each surface is `0.036·S·AR^0.25·0.82·1000/9.81` kg
(`:1727`, `:1796`).

**Effective areas and authority** (`:1810-1813`):

- `S_h,eff` and `S_v,eff` are the areas each surface actually provides.
- `pitch_ratio = S_h,eff/S_h,req` and `yaw_ratio = S_v,eff/S_v,req`.
- The pitch and yaw authority checks read these ratios.

**Ruddervator deflection.** The ruddervator deflection output uses the input
`vtGamma` (`:1844`), not the Γ used for sizing.

### 9.4 Neutral point, static margin and wing position

**Neutral point** (`src/engine.js:676`, `:1557-1609`):

```
C_Lα,w   = 2π·AR / (2 + sqrt(AR² + 4))                       (Raymer Eq. 12.6)
C_Lα,h   = same form with the tail AR
dε/dα    = 2·C_Lα,w/(π·AR)
S_h      = 0.18·S_w,   η_h = 0.9,   l_h = 0.88·L − x_ac,w
V_fus    = prism·(π/4)·D_eq²·L        prism = clamp(p.fusPrismatic ?? 0.60, 0.3, 1)  [LAY]
Cmα,fus  = 2·V_fus/(S_w·MAC)          (destabilising)
Δx_NP    = −Cmα,fus·MAC/C_Lα,w
x_NP     = x_ac,w + (S_h/S_w)(C_Lα,h/C_Lα,w)·η_h·(1 − dε/dα)·l_h + Δx_NP
SM       = (x_NP − x_CG)/MAC
```

The fuselage term is cited to Caughey, Cornell M&AE 5070, Eq. (2.33)
(`:1575-1599`).

**The V-tail estimate.** A second estimate uses S_h,eff, η = 0.90 and l_v,
and includes the same fuselage term (`:1837-1838`):

```
SM_vt = (x_NP,vt − x_CG)/MAC
```

The static-margin check reads `SM_vt` (`:2505`).

**CG.** `componentCG` (`src/engine/cg.js:106`) places each build-up group at
a station:

- **Fractions of fuselage length** (`CG_STATIONS`, `cg.js:49-58`, tagged
  `SRC` or `LAY`), used for the fuselage, gear, systems, avionics,
  furnishings and tail.
- **Wing:** at 40% MAC, cited to Raymer ch. 15 (`cg.js:147`).
- **Propulsion:** at the rotor stations, 0.10 and 0.80 fL by default
  (`cg.js:86`, `:138-141`). Derived stations are used only with
  `p.rotorStationsDerived` (`:135-137`).
- **Battery:** at 0.38 fL `[LAY]`.
- **Payload:** at 0.40 fL `[LAY]`.

The total CG is
`x_CG = (W_e·x_e + W_bat·x_bat + payload·x_pay)/MTOW` (`cg.js:207`).

**Hover trim.** The hover-trim share is
`fwdShare = (x_aft − x_CG)/(x_aft − x_fwd)`. The loaded-rotor ratio is
`2·max(share, 1 − share)` (`cg.js:219-222`).

**In-sizing scan.** `smAtWingStation` scans the wing station from 0.05 to
0.70 in steps of 0.0005 with the mass fixed. It reports
`wingLEfracForTargetSM` if the target margin is met within 0.01
(`src/engine.js:1622-1640`). **Code/comment disagreement:** this scan omits
Δx_NP (`:1627`), although the comment at `:1832-1836` says the fuselage term
applies to both neutral-point estimates.

**Outer wing-position solve.** `solveWingPosition`
(`src/engine/wingPosition.js:54-208`) root-finds
`g(frac) = R.SM − targetSM` with full sizings. It uses:

- a secant phase seeded by the scan;
- then a 13-point sign-change sweep over [0.06, 0.65] with bisection;
- a tolerance of 1e-3;
- at most 45 evaluations.

If the target cannot be reached, it returns the design at the input station
with `wingPosUnreachable`. It solves on `R.SM`, the baseline estimate
(`wingPosition.js:81`), while the check uses `SM_vt`.

**Criterion.** `staticMarginCriterion(p)` (`src/engine/cg.js:275-308`) sets
the band by `p.stabAugmentation`:

| augmentation | band |
|---|---|
| `none` | 5–25% |
| `sas` | 0–25% |
| `fbw` (default) | −10–25%, flagged advisory; the basis text refers to MOC SC-VTOL Issue 2 handling-qualities compliance |

The check label appends "— advisory" for `fbw`. The check object carries no
`kind`, however, so it counts towards `feasible` (`src/engine.js:2504-2506`,
`:3532`).

---

## 10. Loads and V-n

Source: `src/engine/loadcases.js`.

**Manoeuvre limits** (`:98-132`):

- The floors are `SC_VTOL_N_LIMIT_FLOOR = 2.0` and
  `SC_VTOL_N_NEG_FLOOR = −0.5`.
- The default proposal is +3.5 / −1.5, which the code says has no source of
  its own.
- `manoeuvreLimits(p)` returns the user proposal (`nLimitManoeuvre`,
  `nLimitManoeuvreNeg`) floored at those values.

The floors are quoted from EASA MOC SC-VTOL Issue 2 in the module comments
(`:82-101`).

**Gust cases** (`loadCases(p, g)`, `:215-287`):

```
W/S  = MTOW·g / max(0.5, S_w)
μ    = 2(W/S)/(ρ·c̄·a·g)
K_g  = 0.88·μ/(5.3 + μ)
Δn   = K_g·U_de·V·a·ρ0/(2·W/S)            ρ0 = 1.225
V_H  = V_cruise,  V_D = 1.25·V_H,  V_B = 0.85·V_H       [LAY]
```

- The gust velocities are 9.14 m/s at V_D, 15.24 m/s at V_H and, for
  Category Enhanced only, 20.12 m/s at V_B. They are quoted from MOC SC-VTOL
  Issue 2 (`:15-31`, `:67-74`).
- Each gust gives `n = 1 ± Δn`.
- The limit factor is `n_limit = max(n_man, max gust n)`.
- The ultimate factor is `n_ult = 1.5·n_limit` (`:156`, `:263-267`).
- The sharp-edged gust with alleviation is described as the standard
  conceptual approximation to the MOC's (1−cos) gust (`:44-55`).

**Winged and wingless layouts.**

- `airframeLoadFactors(p, lc)` returns the wing-borne result when load cases
  exist (`:178-213`).
- Otherwise it returns the thrust-borne result:
  `n_limit = max(2.0, max(1, twRatio))` and `n_ult = 1.5·n_limit`.
- In the engine the load cases run only for winged layouts, with cruise
  density and the airfoil's `CLmax` (`src/engine.js:2234-2237`).
- The wing box is evaluated at `lcase.nUltimate`. It is reported and not
  used for mass (`:2212-2223`, `:2238-2240`).

**V-n diagram** (`src/engine.js:1977-2022`):

```
V_stall = sqrt(2·W/S / (ρ_cr·C_Lmax,airfoil))
V_A     = min(V_stall·sqrt(n_man,pos), V_cruise)
V_D     = 1.25·V_cruise
n_pos(v)= min(½ρ_cr v²·C_Lmax,wing / (W/S), n_man,pos)        C_Lmax,wing = p.clMaxWing ?? 1.5
n_neg(v)= max(−½ρ_cr v²·0.8·C_Lmax,wing / (W/S), n_man,neg)
```

- The envelope has 60 points up to 1.1·V_D.
- The stall speed uses the selected airfoil's `CLmax`. The envelope uses
  `p.clMaxWing`.
- For rotor-borne layouts, `n_man,pos` is `thrustBorneLimitFactor(p)`
  (`:1983`).
- The gust lines come from the same load cases (`:2251-2262`).

**Reported values.** `nLimit`, `nUltimate` and `nLimitNeg` are reported for
every layout from `airframeLoadFactors` (`:2247`, `:3465-3466`).

---

## 11. Other analyses

### 11.1 Acoustics

`noiseStage(ctx)` (`src/engine/noise.js:51`) is a hover-only rotor noise
model. The flag `hover_ok` is fixed true, with the comment "cruise noise not
implemented" (`:105`). The model combines:

- a Gutin tonal model with directivity and a compressibility correction;
- a BPM-scaled broadband term;
- a Schlegel vortex term;
- IEC 61672-1 A-weighting;
- simplified ISO 9613-1 absorption.

The header lists its references (`:1-10`, `:56-77`).

**Calibration.** The tonal calibration is
`K_cal = K_base + 5·log10(DL/500) + 8·(M_tip/0.58 − 1) − 1.5·(B − 6)`, with
`K_base = p.noiseKcalBase ?? 12.0` dB. The comment says this is
"curve-fitted to Fleming 2022 + Joby/Volocopter published dBA data"
(`:123-135`).

**Summation and propagation.**

- The rotors are summed incoherently as `+10·log10(N)`, with an interaction
  term `−1 − 0.15·max(0, N − 6)` dB (`:259-261`).
- Propagation subtracts spherical spreading and
  `α = 1.5 + 0.5·log10(3.5·BPF/100)` dB/km, and adds 2.5 dB of ground
  reflection beyond 10 m (`:262-282`).
- Levels at fixed distances and contour distances are returned (`:283-307`).

**Other details.**

- Thrust per rotor is taken at T/W = 1 (`:91`).
- The validity flags are M_tip < 0.70, `DLrotor` < 1500 N/m² and
  0.5 ≤ R ≤ 3.5 m (`:101-106`).

### 11.2 Battery thermal, BMS and installation

`batteryThermal(p, g)` (`src/engine/battery-thermal.js:160-251`) computes
the following.

**Heat rejection and BTMS mass** (`:169-173`):

```
Q_rej = max(Q_cr, 0.55·Q_hov)
m_BTMS = min(0.45 kg/kW · Q_rej, 0.20·m_pack)
```

**Hover temperature rise** (`:178-181`):

```
ΔT_hov = max(0, Q_hov − Q_rej)·t_hov/(m_pack·1050)
T_peak = 35 °C + ΔT_hov
```

The peak is checked against 55 °C, with 45 °C as the top of the optimal
band.

**BMS** (`:192`):

```
m_BMS = 0.015·m_pack + 0.055·N_s
```

**Pack tray.** The tray is sized in bending (`:203-220`):

- the load factor is the largest of the pack-location load factors quoted
  from MOC SC-VTOL Issue 2 (`:116-123`);
- `M = 0.048·w·L²`;
- face thickness `t_f = max(0.5 mm, M/(σ·h))`.

**Thermal-runaway protection** (`:227-229`):

- 0.030·m_pack for the non-propagation strategy (the default);
- 0.060·m_pack for the containment strategy.

Both fractions are `[LAY]`.

**Cruise thermal balance.** `cruiseBalanced` is `Q_rej ≥ Q_cr` (`:186`).
Because `Q_rej = max(Q_cr, …)`, this is always true, so the check "Cruise
thermally balanced" (`src/engine.js:2519-2520`) cannot fail. The comment at
`battery-thermal.js:183-185` describes it as a test that can fail.

The header records that the pack-location choice is dormant for packs below
about 929 kg, because minimum gauge governs there (`:51-73`).

### 11.3 Autorotation

`autorotativeIndex` (`src/engine/autorotation.js:87`) computes Fradenburgh's
index, cited as Fradenburgh, JAHS 29(3) 1984, with population bands from
Scaramuzzino et al.:

```
AI = (I_R·Ω²/2) / (W·DL)       ft³/lb
I_R = N·m_blade·R²/3            (hub omitted, so I_R is a lower bound)
Ω = V_tip/R
```

(`:73-76`, `:87-127`).

`canAutorotate` returns false for fixed-pitch layouts (multicopter,
lift+cruise), true for the side-by-side, and `null` for layouts with no
reference vehicle (`:130-158`).

The module is exercised by `validation/autorotation.mjs`. No call to it
exists in `src/engine.js` or the app sources. The header says the index is a
flare index and not a landing simulation (`:55-59`).

### 11.4 Drive-system failure

`driveFailure` (`src/engine/drivefailure.js:78-113`) applies to
cross-shafted layouts. It computes:

```
per-survivor power = P/(N − 1)
interconnect power = f_P·P          f_P = 0.60 (NDARC 29-7.4)
P_DSlimit          = max(P/N, f_P·P)
```

It is called from the weight build-up. The result is attached to the
drive-system detail and not charged as mass (section 6.2). The OEI thrust
verdict in the engine is `null` for interconnected layouts, with a basis
string saying the drive-system case is not yet modelled there
(`src/engine.js:3290-3296`). The module header says the steady share is
necessary but not sufficient, and that the interconnect shaft weight is not
added (`drivefailure.js:50-64`).

### 11.5 Control authority

`acai` (`src/engine/controlauthority.js:124`) implements the Available
Control Authority Index of Du, Quan, Yang & Cai (JGCD, arXiv:1403.5986)
exactly for the zonotope attainable set (`:11-70`).

**Evaluation in the engine** (`src/engine.js:2357-2415`):

- **When it runs.** Only for layouts with `oeiThrustShare !== false` and
  N ≥ 4.
- **Rotor geometry.** The rotors are placed on a ring of radius
  `ringRadiusFor(N, R)`, whatever the layout, with alternating spins unless
  `p.rotorSpins` is supplied.
- **Maximum thrust.** Per rotor, `W·T/W/N`.
- **Torque-to-thrust ratio.** `k_μ = v_i·R/(FM·V_tip)`
  (`controlauthority.js:82-89`).
- **Evaluation.** Each single-rotor failure is evaluated in turn.
- **Output.** The number of controllable failures and the worst ACAI are
  reported.

The check is advisory. **Code/comment disagreement:** the comments and the
check text at `src/engine.js:2738-2746` and `:2766-2769` say spin order is
not a design variable. The code accepts `p.rotorSpins` (`:2379-2380`).

The module states that the test is linearised about hover and says nothing
about the failure transient (`controlauthority.js:64-70`).

### 11.6 Whirl flutter

`whirlFlutterCheck` (`src/engine/whirlflutter.js:103`) makes no boundary
calculation for this aircraft. It compares cruise speed with one of two
published XV-15 boundaries: 335 kt at t/c 0.23 and 275 kt at t/c 0.15. These
are cited to Acree, Peyran & Johnson, AHS 55th Forum 1999 (`:61-69`). The
check chooses the boundary by t/c, never interpolating, and reports the
ratio of boundary to cruise speed (`:103-145`).

- Layout applicability is tabulated (`:76-96`).
- The module is exercised by `validation/whirl-flutter.mjs`. No call to it
  exists in `src/engine.js`.
- The header says a boundary would need a coupled aeroelastic solver, which
  the tool does not have (`:44-57`).

### 11.7 Economics

The direct-operating-cost constants are in
`src/engine/economics/doc-constants.js`. The model that uses them is in
`src/tabs/CostTab.jsx`.

- Each constant carries a status: `sourced`, `calibrated` or `unsourced`
  (`doc-constants.js:55-59`, `:66-242`).
- `unsourcedConstants()` lists the unsourced ones (`:261`).
- The header states that the cost model is not validated and cannot be
  validated against a published aircraft (`:44-49`).
- The user guide records that fuel is not priced.

### 11.8 Certification climb gradient

`certificationClimb` (`src/engine/certification-climb.js:107-178`) is called
by the engine with:

- `nUnits = nPropHover`;
- `pMotInstalledKW` = the cruise-unit continuous rating
  (`src/engine.js:2324-2331`).

The gradient is:

```
γ = P_avail·η_sys/(W·V_cruise) − 1/(L/D)          P_avail = units_available · P_unit
```

(`:157-159`). The required gradient is 2.5%.

- **Category Enhanced.** One unit is removed. If the aircraft has a separate
  cruise propulsor, that propulsor is the unit removed.
- **Category Basic.** All units are counted.
- **Wingless layouts.** The check is not applicable.

The module states that this is one point at the design condition, not an
envelope showing (`:39-46`).

For the tilting layouts, the header says "every rotor makes cruise thrust"
(`:69-70`). The unit count passed in is `nPropHover`, which on a hybrid
includes the rotors that `resolveConfiguration` stops in cruise.

---

## 12. Checks, warnings and provenance

### 12.1 `R.checks`

The engine builds `checks` as an array of objects
`{label, ok, val, kind?}` (`src/engine.js:2417-3209`). The `kind` field
classifies each check:

| kind | meaning | counted in `feasible` and pass/total |
|---|---|---|
| *(none)* | a hard check: a criterion the design must meet | yes |
| `advisory` | a criterion from the literature that real aircraft may also miss | no |
| `omission` | physics deliberately not modelled for this design; `ok` states whether it is modelled | no |
| `indeterminate` | the published criterion does not describe this design (used by the motor-transient check) | no |

The result fields are computed as follows (`src/engine.js:3531-3541`):

```
feasible      = every check with no kind has ok === true
checksPassed  = count of kind-less checks with ok
checksTotal   = count of kind-less checks
omissions, advisories, indeterminates = the checks of each kind
```

The comments at `:3153-3161` and `:2569-2576` explain the `kind`
distinction.

**Scoping.** Checks are scoped by configuration. Without a wing, any check
whose label starts with or contains one of the `WING_ONLY_CHECKS` strings is
removed from `checks`. It is returned in `checksNotApplicable` with a
`notApplicable` reason (`:3227-3238`). The list includes:

- wing tip deflection;
- structural margin;
- tail/wing area;
- AR vs L/D;
- V-tail authority;
- cruise L/D;
- hover load factor;
- cruise thrust loss;
- Fus/Span;
- static margin.

**The checks by kind.** Hard checks (no `kind`):

- MTOW within the category limit (`:2426-2436`);
- sizing loop inside the ceiling (`:2484-2490`);
- cruise range > 0 (`:2491`);
- usable pack ≥ mission energy, or, for turboelectric designs, ≥ the
  emergency energy (`:2494-2498`);
- static margin band (`:2504-2506`);
- CG inside the rotor array and hover thrust split within T/W
  (`:2510-2513`);
- tip Mach < 0.70 (`:2514`);
- cell peak temperature and cruise thermal balance (`:2517-2520`);
- cruise duty < 80% of the continuous rating (`:2530-2534`);
- cruise thrust loss per failure < 40% (`:2682-2693`);
- climb gradient, where applicable (`:2696-2700`);
- tyre and strut (`:2701-2704`);
- wing tip deflection and structural margin (`:2705-2714`);
- weight-closure margin > 10% and battery fraction < 55%
  (`:2715-2717`);
- blade loading C_T/σ < 0.12 (`:2725-2728`);
- solidity within 0.40 (`:2771-2777`);
- boom mass < 15% (`:2787-2794`);
- cabin area (`:2926-2954`);
- V-tail authority and Mach < 0.45 (`:2970-2972`);
- tail/wing area band (`:2985-3005`). The label reads "25–50%", but the
  code tests 0.20–0.55 (`:2987`, `:3003`);
- hover T/W ≥ 1 (`:3045`);
- AR vs L/D (`:3047`);
- rotor count even (`:3057-3067`);
- rotor fit within the span, or the pad when `p.padSizeM` is given
  (`:3088-3139`);
- fuselage pitch moment, which is always `ok` (`:3172-3182`);
- loop converged (`:3205-3206`);
- disk loading ≤ 25 lb/ft² (`:3207-3208`).

Advisory checks:

- mission against the reference aircraft (`:2447-2483`);
- controllable after a single rotor failure (`:2747-2770`);
- residual state of charge, reported and not tested (`:2812-2850`);
- descent speed inside the envelope (`:2899-2919`);
- hover load factor ≥ 1.35 (`:2955-2963`). The 1.35 and 1.77 bounds are
  cited to Hartman, Altamirano & Suh, VFS 81st Forum 2025 (`:60-75`).
- cruise L/D ≥ 9.5 (`:2964-2969`). The bound is cited to corpus S3270
  (`:54-58`).
- Fus/Span band (`:3041-3044`);
- wingless rotor-array footprint (`:3135-3136`);
- the turboshaft table range (`:3193-3195`).

The motor peak capability check is `advisory` when the Table 4 requirement is
determinate and `indeterminate` otherwise (`:2553-2656`).

Omission checks:

- hover download (`:3197-3204`);
- the turboshaft part-power and hot-day omission (`:3191-3192`).

**Code/comment disagreements in the check list:**

- The descent-speed check's comment (`:2891-2898`) describes the old descent
  speed form `RoC/sin(angle)`.
- The flyable-angle window in the same check's text is computed from the
  climb rate `RoC`, not the descent rate `RoD` (`:2904-2907`).
- The comment above the cruise-duty check says "80% of the hover rating"
  (`:2529`). The check compares against the continuous rating.

### 12.2 Warnings — `src/lib/warnings.js`

`resultWarnings({params, R, continuity})`
(`src/lib/warnings.js:44-125`) turns a result into items
`{cat, severity, text, impact}`. The categories a–h follow NASA-STD-7009B
[M&S 32] §4.3.8.1 (`:4-10`, `:29-38`):

- **d (execution).**
  - No result: error.
  - `r2Diverged`: error, with the ceiling flag if it was hit.
  - Pipeline stage errors: error.
  - `|massBalanceGapKg|` > 0.5: warning.
  - Build-up fallback: warning (`:50-64`).
- **a and b (from `R.checks`).**
  - Failed kind-less check: error, category a.
  - Failed advisory: warning, category a.
  - Failed omission or indeterminate check: warning, category b
    (`:66-75`).

  Checks in `checksNotApplicable` are not read.
- **c (domain).** One item per excursion from `assessDomain`: a warning for
  the validation domain, info for the verification domain (`:79-83`).
- **e.** A standing statement of the tool's class and intended use
  (`:86-88`).
- **f (setup).** Design-file continuity: checksum mismatch, legacy record,
  or changed results (`:91-101`).
- **g (waivers).** None; a standing statement (`:104`).
- **h (known errors).** One item for each validation case of the same layout
  and powertrain whose recorded take-off-mass error exceeds 5%, plus a
  standing statement that no independent review has been done
  (`:107-120`).

`uncertaintyStatement(key)` (`:139-176`) implements [M&S 33] and [M&S 34].
For MTOW it builds a quantitative statement from the generated validation
data. For every other output it states, by provenance status, that no
quantitative estimate is available.

### 12.3 Domain — `src/lib/domain.js`

`assessDomain(params, R)` (`src/lib/domain.js:36-85`) implements
NASA-STD-7009B [M&S 26]. The domains are generated into
`src/lib/validation-domain.js` by `validation/validation-domain.mjs`
(`:5-8`).

- **Validation domain.**
  - The layout is outside the domain if no aircraft of that layout and
    powertrain has been compared (`:45-51`).
  - Payload, range, cruise speed and MTOW are each compared with the
    per-powertrain envelope box (`:52-56`).
- **Verification domain.**
  - The layout is outside the domain if the identity checks do not run it.
  - The inputs are compared, after `engineInputs`, with the sweep bounds
    (`:59-69`).

Each excursion records the type of limit, the side and the extent in percent
(`:27-33`). The consequence text for the outside case states that the error
is unknown (`:78-83`).

### 12.4 Provenance — `src/lib/provenance.js`

`INPUTS` and `OUTPUTS` classify engine inputs and outputs by status
(`src/lib/provenance.js:26`, `:124`). The statuses are defined at `:8-19`
and rendered through `STATUS_META` (`:672-691`):

| status | chip | meaning |
|---|---|---|
| validated | VAL | the output was compared numerically with published data, with the error recorded |
| sourced | SRC | the method or constant traces to a citable reference, but the output has never been compared |
| derived | DRV | algebra on validated or sourced quantities, with no new assumption |
| calibrated | CAL | fitted to reference data, so not a prediction |
| unverified | UNV | displayed, but never checked |

**Powertrain overrides.** `POWERTRAIN_OVERRIDES` changes the status by
powertrain (`:693-704`):

- On a turboelectric design, `Wbat` is not validated and `PackkWh` and
  `Etot` are derived.
- On a battery design, the fuel outputs are derived zeros.

**Lookup and ledger.**

- `provenanceOf(key, powertrain)` merges the override into the base entry
  (`:706-712`).
- `provenanceLedger()` counts the outputs by status (`:714-721`).

---

## 13. Known limitations stated by the code

Each item below is a limitation that the code or its comments state. Where
this manual observed a limitation directly in the code, the item says so.

**Aerodynamics and power**

1. **Rotor-borne cruise.** Rotor-borne cruise efficiency is calibrated to
   NASA's published L/De per vehicle, not predicted. It does not respond to
   rotor design, and NDARC's profile-power function F_P is not implemented
   (`src/engine.js:176-203`).
2. **Hover download.** Download is zero for lift+cruise, multicopter and
   side-by-side, because no published value exists. This biases hover power
   low, and the omission check reports it
   (`src/engine/configuration.js:763-775`; `src/engine.js:3197-3204`).
3. **Side-by-side overlap.** The side-by-side overlap factor is applied in
   hover only. The forward-flight overlap benefit is assumed to be inside
   NASA's published L/De (`src/engine.js:883-888`). The hub spacing is a
   pixel measurement off a figure (`src/engine/coaxial.js:151-155`).
4. **Descent angle.** The descent angle comes from the cruise L/D, not the
   descent L/D. The climb polar reuses the cruise C_D0 (`src/engine.js:920-922`,
   `:943-947`).
5. **Drag assumptions.**
   - Flow is fully turbulent, and laminar regions are neglected
     (`src/engine.js:1499-1501`).
   - Rotor–wing interference on induced drag is not modelled (`:1525-1526`).
   - Tail wetted areas are fixed fractions of wing area (`:1491-1492`).
6. **Drag referencing.**
   - `rotorcraftDragCD0` still returns wing-referenced coefficients, and
     landing-gear drag is referenced to wing area (`src/engine.js:734-737`).
   - Without a wing, gear drag is unsourced and enters as zero
     (`src/engine/drag.js:92-106`; this manual's reading of
     `src/engine.js:750-751`).
7. **Battery efficiency.** Battery efficiency is NASA's binary
   vertical-flight scoping, not an equivalent-circuit model, because cell
   internal-resistance data is not carried (`src/engine.js:1161-1172`).
8. **Acoustics.** The acoustics are hover-only (`src/engine/noise.js:105`).

**Propulsion and powertrain**

9. **OEI transient.** The Table 4 OEI transient is not priced into motor
   mass by default. NASA's caveat that sizing criteria for multirotor power
   plants do not yet exist travels with the check
   (`src/engine/sizing-conditions.js:328-344`; `src/engine/motor.js:36-40`).
10. **Interconnected layouts.** The engine does not model the binding
    drive-system power case after a motor failure (`src/engine.js:3294-3296`).
    The transmission mass is not sized to the failure case, and the
    interconnect shaft weight is not added
    (`src/engine/weights.js:480-498`; `src/engine/drivefailure.js:59-64`).
11. **Turboshaft.** Part-power fuel flow and hot-day power lapse are not
    modelled (`src/engine/turboelectric.js:28-32`). The turboshaft table
    interpolation is a trend, not a model of any engine (`:47-50`). The
    generator specific weight is the only published figure and comes from a
    larger size (`:71-77`).
12. **Drive-system coverage.** The drive-system mass does not cover the
    cruise propulsor, drive shafts or rotor brake. The rotor shaft at
    direct drive is absorbed by the rotor constant
    (`src/engine/drivesystem.js:69-86`).
13. **Rotor group inputs.** Blade count and flap frequency are not published
    for the reference vehicles, and the flap frequency enters at about the
    2.5 power (`src/engine/rotorgroup.js:52-67`).
14. **Motor mass fit.** The motor mass is extrapolated above 546 N·m
    (`src/engine/motormass.js:57-74`).

**Weights and structure**

15. **Technology factor.** `structTechFactor` is a single calibrated level
    shift, which may absorb errors in groups still on light-aircraft
    fractions (`src/engine/weights.js:148-168`).
16. **Unsourced fractions.** The electrical/ECS split is `[LAY]`, and the
    BMS may double-count part of the electrical group
    (`src/engine/weights.js:98-102`, `:647-650`).
17. **Unmodelled nacelle and fuselage items.** The pusher's own nacelle is
    not modelled (`src/engine/weights.js:721-728`). The side-by-side body is
    not lengthened to carry a tail, pending a boom-style tail model
    (`src/engine.js:582-605`).
18. **Wingless load cases.** No gust or manoeuvre case acts on the rotors and
    airframe of a wingless aircraft beyond the thrust-borne limit factor
    (`src/engine.js:2231-2233`).
19. **Boom load cases.** Landing loads, gust loads on the boom and rotor as a
    body, and the one-rotor-out thrust surge are not covered by the boom
    load case (`src/engine/booms.js:204-211`).
20. **Wing box.** The wing box is a detail design that is reported and not
    used for mass (`src/engine.js:2212-2223`).
21. **Landing gear.** Tyre mass is the module's weakest number
    (`src/engine/landinggear.js:133-143`), and the strut mass coefficient is
    `[CAL]` (`:214-218`). This manual also observes that `bottomsOut` cannot
    be true at the default stroke margin (`:206-208`).
22. **Pack installation and thermal runaway.** The pack-location mass
    decision is dormant in practice. The thermal-runaway mass fractions have
    no published data (`src/engine/battery-thermal.js:51-73`, `:141-151`).
23. **Avionics.** The per-unit avionics masses are representative `[LAY]`
    values (`src/engine/avionics.js:42`).
24. **Cabin area.** The cabin-area basis is one measured two-seat cabin
    (`src/engine.js:2952`).
25. **High-count multicopters.** Non-convergence of high-count multicopters
    was recorded as a separate, pre-existing defect
    (`src/engine/coaxial.js:263-270`).

**Stability, control and certification**

26. **Static margin.** For augmented aircraft, static margin is not the
    binding requirement; the binding requirement is a handling-qualities
    analysis that the tool cannot perform (`src/engine/cg.js:270-274`,
    `:297-307`).
27. **Target margin.** The target static margin may be unreachable, because
    SM is not monotonic in wing station (`src/engine/wingPosition.js:40-45`).
28. **Controllability.** The ACAI test is linearised about hover and says
    nothing about the failure transient
    (`src/engine/controlauthority.js:64-70`).
29. **Whirl flutter.** No whirl-flutter boundary is computed for the design
    (`src/engine/whirlflutter.js:44-57`).
30. **Autorotation.** The autorotative index is a flare index, not a landing
    simulation. Whether a tilting layout can autorotate is left open
    (`src/engine/autorotation.js:55-59`, `:130-158`).
31. **Climb gradient.** The certification climb gradient is one design point,
    not an envelope, and may be optimistic for tilting rotors rated by
    hover (`src/engine/certification-climb.js:39-62`).

**Economics and scope**

32. **Economics.** The cost model is not validated
    (`src/engine/economics/doc-constants.js:44-49`).
33. **Loop structure.** The convergence core has not yet been migrated to the
    stage pipeline (`src/engine/pipeline.js:16-27`).
