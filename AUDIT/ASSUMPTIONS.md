# ASSUMPTION AUDIT (Phase 16)

Commit `3a7a5a4`. Every number that materially affects sizing must have an origin. The tool
already maintains such a register (`src/lib/provenance.js`, 467 outputs / 89 inputs), so this
document records what that register **misses** or **misstates**.

## Assumptions not exposed to the user

| assumption | file:line | value | effect | verdict |
|---|---|---|---|---|
| **landing-gear type** | `src/engine/drag.js:56` | `p.gearType \|\| "fixed"` -> CD0 0.015 | **34.6 % of CD0tot; MTOW -11.58 % if switched** | **F-09** — not in `DEFAULT_PARAMS`, not on any panel, and the code's own comment says it should be the other value |
| `reservePctMission` | `src/engine.js:1175` | `?? 0.10` | does not bind at defaults | **F-33** — a NASA convention active outside the basis that documents it |
| `clMaxWing` | `src/engine.js:2294` | `?? 1.5` | V-n boundary misses n=1 at stall by 1.3 % | **F-24** |
| `cRateDerate` in the trade sweeps | `src/engine.js:2431, 2456` | `?? 0.08` | resurrects a flat derate `defaults.js:112-118` deliberately deleted as unsourced | **F-18** |
| Oswald fallback | `src/engine.js:741`, `constraints.js:138` | `0.85` | 3.3 % on e for the constraint diagram | **F-23** |
| nacelle area fraction | `src/engine.js:824` | `0.10` of disk area | ~2 % of D/q | **F-A13**, bare assertion |
| `miscCD0` | `src/engine/drag.js:102` | `0.002·S` | 5.8 % of CD0, rising to 8.8 % if F-09 is fixed | **F-A14**, a fixed CD0 where Raymer uses a fraction |
| tail-AC station | `src/engine.js:820` and 4 more | `0.88` | called a "proxy", appears five times | unsourced |
| tail dynamic-pressure ratio | `src/engine.js:1803, 2062` | `etaH = 0.9` | two copies, no source | unsourced |
| fuselage tail-cone control points | `src/classes/aircraft/geometry.js:140` | `crownControlX 0.40`, `keelControlX 0.45` | keel rms wrong by **2.8x** against the A320 | **F-G15**, shared by all four classes, unsourced |
| wing station for drawing | `src/classes/aircraft/geometry.js:747` | `0.38·L` (0.26·L trainer) | **66 % of MAC** on the transport | **F-G01**, while the computed value exists |
| pack cell architecture | `src/engine.js:2204-2207` | `Vcell 3.6`, `Ahcell 5.0`, `Vpack 800` | `Rint` and `Pheat` ~23 % high | **F-E10**, inline, no citation |
| `range_delta_pct` factor | `src/App.jsx:754` | `0.3` | fabricates a displayed range sensitivity | **F-26** |

## Assumptions whose stated derivation does not produce the shipped value

| assumption | stated basis | what the basis gives | shipped | verdict |
|---|---|---|---|---|
| `etaSys` | "modern PMSM motors + inverter ~93 % x 93 %" (`defaults.js:211`) | 0.865 | **0.80** | **F-E11** — and the symbol must also include the propeller. The single largest efficiency in the model, uncited, with a self-contradicting derivation |
| gear strut `[CAL]` coefficient | "recovers Roskam's 4-6 % of MTOW" (`landinggear.js:214-219`) | 4-6 % | measured **2.44-2.98 %** (default), 3.56-4.02 % (relief-free) | **F-M02** |
| wing/tail form factor | "Raymer Eq 12.35" | Eq 12.35 is not that equation; Eq 12.30 includes a Mach/sweep bracket | bracket replaced by `1.05` | **F-A11** |
| V-tail weight | "simplified Raymer eq 15.26" | Raymer 15.26 is an eight-term imperial regression | an area-density form | **U-06** (the project already records this as unverified) |
| `MU0` | "reference dynamic viscosity, Pa*s" | 1.7894e-5 | **1.47e-5**, the kinematic value | **F-04** |

## Magic-number sweep

Phase 16 asks specifically about 0.5, 0.52, 0.63, 0.765, 0.9, 1.1, 1.2 and similar. Every such
literal encountered in the sizing path was traced. Results:

**Correctly sourced and supported:** the Prandtl-Schlichting coefficients `0.455 / 2.58 / 0.144 /
0.65` (Raymer 12.27); the fuselage form factor's `60 / 400` (Raymer 12.31); gear CD0
`0.015 / 0.003 / 0.001` (Raymer T12.6); every Howe coefficient in `wing.js:49-62`; the Breguet
`375` (= 550x3600/5280); the ISA constants; `0.916` and `0.759` rotor technology factors (NASA's
own deck values); `0.84` landing-weight fraction (FLOPS's DLW); `0.05087` trainer gear fraction
(literally 117 lb / 2300 lb from GASP Fig V.1.5).

**Honestly self-declared with a tag:** `CD_hub 0.0040`, `CD_blade 0.0090`, `POWERTRAIN_ETA_ROTORBORNE
0.845`, `motorSpecPower 5.0 kW/kg`, `inverterSpecPower 20.0 kW/kg`, `cruiseDutyLimit 0.80`,
`fusPrismatic 0.60`, `K_SECTION_POLAR 0.010`, `CL_CRUISE_MAX 0.90`, `electricalFrac 0.0131`,
`ecsAntiIceFrac 0.0065`, `flightControlsFrac 0.025` — all carry `[CAL]` or `[LAY]` and most carry
the fit set and residuals.

**Unsourced and material** — the list in the two tables above. Of these, **F-09 (the fixed-gear
default) is the only one measured to move MTOW by more than 10 %**, and it is the one the user
cannot see or change from any panel.

## The tool's own honesty instruments

Worth recording, because they are unusual and they work: `validation/unverified-leverage.mjs` and
`unverified-triage.mjs` rank unverified inputs **by their leverage on MTOW**, which is how
`eOsw` (7.0 %) and `rotorborneLoD` were promoted from flat inputs to computed or calibrated
quantities. The provenance notes for `priceTransientIntoMass` and `nacelleWettedAreaM2` record
options that were **refuted by validation** and a regression whose coefficients **do not survive
extraction** — and refuse to ship either. That is the standard the assumptions above fall short of.
