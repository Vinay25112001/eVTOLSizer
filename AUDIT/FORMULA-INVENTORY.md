# FORMULA INVENTORY (Phase 0 / Phase 2)

Commit `3a7a5a4`. Every engineering formula located during PASS A, with a unique ID, its location,
its verdict, and a pointer to the document holding the full entry (equation as coded, variable
units, source, limitations).

**Counting.** 147 distinct engineering formulas were located and given a verdict. The per-domain
tables are in the domain documents; this file is the index and the census. Formulas are counted
once per implementation site, so a relation implemented twice (viscosity, hover power, the
atmosphere) counts once per copy — that is the point of the duplicate column.

## Census

| domain | formulas | PASS | FAIL | WARNING | UNVERIFIED | document |
|---|---|---|---|---|---|---|
| atmosphere / units | 19 | 15 | 3 | 1 | 0 | `ATMOSPHERE-AUDIT.md`, `UNITS.md` |
| aerodynamics | 33 | 22 | 6 | 4 | 1 | `AERO-AUDIT.md` |
| propulsion / power | 23 | 18 | 3 | 0 | 2 | `PROPULSION-AUDIT.md`, `POWER-AUDIT.md` |
| energy / battery | 12 | 10 | 1 | 0 | 1 | `ENERGY-AUDIT.md` |
| mass / weights | 19 | 17 | 1 | 0 | 1 | `MASS-CLOSURE.md` |
| mission | 11 | 8 | 2 | 1 | 0 | `MISSION-AUDIT.md` |
| geometry | 18 | 13 | 4 | 1 | 0 | `GEOMETRY-AUDIT.md` |
| loads / envelope / structure | 12 | 10 | 2 | 0 | 0 | `GEOMETRY-AUDIT.md`, `SIZING-LOOPS.md` |
| **total** | **147** | **113** | **22** | **7** | **5** | |

**113 of 147 formulas PASS** on mathematical expression, variable definition, units, sign
convention, reference conditions and efficiency direction. No formula was marked "probably
correct"; every one carries a definite verdict, as Phase 2 requires.

## Independently recomputed (Phase 3)

Formulas verified by a **separate implementation** that shares no code with the application:

| # | formula | route | agreement |
|---|---|---|---|
| 1 | ISA T, P, rho, a at 9 altitudes | `AUDIT/reference/evtol_reference.py` | **0.00 %** |
| 2 | the ISA constant triple | `P0/(R T0)` = 1.225000; `sqrt(gamma R T0)` = 340.2940 vs NDARC's 340.294 | exact |
| 3 | Sutherland viscosity at T0 | `AUDIT/reference/visc.py` | 1.789380e-5 vs the shipped 1.47e-5 — **F-04** |
| 4 | hover momentum theory, two independent routes | per-rotor vs disk-loading form | **2.22e-16** |
| 5 | hover power with download | 596.75 kW vs the engine's 596.810 | 0.01 % |
| 6 | cruise power `W V/(LD eta)` | 233.0 vs 232.96 kW | 0.02 % |
| 7 | wing area from W/S, span, MAC | reference vs engine | within print rounding |
| 8 | energy closure | 164.849 vs 164.85 kWh | closes |
| 9 | mass closure | 2772.07 vs 2772.06 kg | closes |
| 10 | NDARC AFDD93 wing | agent Python from the published form | **0.001 %** |
| 11 | NDARC AFDD84 fuselage | agent Python | exact on the code's input; shows the F-08 delta |
| 12 | FLOPS simple wing Eq 2-8 | agent Python | **2e-6** |
| 13 | FLOPS fuselage Eq 45 | agent Python | exact |
| 14 | EMRAX motor torque fit | agent Python | exact |
| 15 | NASA Table 12 electrical+ECS calibration | agent Python from `nasa-vehicles.js` | reproduces the shipped 1.96 % |
| 16 | drone figure of merit `sqrt(2/pi) CT^1.5/CP` | agent re-derivation | exact |
| 17 | vertical-climb power ratio | solved from `v_i^2 + Vz v_i - v_h^2 = 0` | exact |
| 18 | FLOPS Reynolds per ft per Mach | derived as `rho a/mu ~ p(T+110.4)/T^2` | **-1.3e-4 %** |
| 19 | Yang coaxial kappa | agent | reproduces 1.2808 / 1.1359 |
| 20 | drawn vs computed wing station, 4 classes | lead probe via `designAircraft` | **F-G01**, up to 110.7 % of MAC |

## Duplicated implementations

Phase 20's question. Each row is one engineering concept implemented more than once:

| concept | copies | mathematically identical? | authoritative | can they drift? |
|---|---|---|---|---|
| ISA atmosphere | **5** (`engine/atmosphere.js`, `transport/atmosphere.js`, `drone/sizing.js`, `transport/landing.js`, `flight-envelope.js`) plus 2 in `report.js` and 1 dead in `App.jsx` | **No** — the two in `report.js` disagree with the engine and with each other | `engine/atmosphere.js` | **already drifted — F-07** |
| hover power | **5** | **No** | `engine.js:1017` | **already drifted, -11 % to +32 % — F-11, F-18** |
| Oswald efficiency | **3** | **No** — 0.828 vs 0.85 vs 0.85 | `wing.js` | **already drifted — F-23** |
| CLmax | **4** conventions | **No** | none declared | **already drifted — F-24** |
| viscosity | **3** sites, 2 values | **No** | `noise.js`/`report.js` hold the correct value | **already drifted — F-04** |
| fuselage wetted area | **2** paths | **No** — correction applied twice in one | `constants.js` function | **already drifted — F-08** |
| Pa -> lbf/ft^2 | **3** values | **No** | `flight-envelope.js:60` (most precise) | **already drifted — F-36** |
| cruise Mach | **2** | **No** at deltaISA != 0 | `engine.js:1641` | **already drifted — F-29** |
| wing root LE station | **2** (drawn convention vs computed) | **No** | `balance.js:207` | **already drifted — F-G01** |
| motor power / torque / mass | **2** (legacy vs installed) | **No** | `weights.js` + `motormass.js` | **already drifted, -22 % to -51 % — F-25** |
| kg -> lb, kW -> hp, kt -> m/s | 2-4 spellings each | yes to <=1.2e-4 % | `src/lib/units.js` (exact) | benign |
| gravity SI, R_GAS, T0, P0, LAPSE, rho_MSL | many copies | **yes** | `engine/constants.js` | **gated** by `validation/constants.mjs` for g and R_GAS only |

**The pattern is unambiguous: every duplicated quantity that is NOT gated has drifted, and every
one that is gated has not.** That is the strongest single argument in this audit for extending
`validation/constants.mjs`.

## Configuration-specific vs shared

Shared by every class: `engine/constants.js`, `engine/atmosphere.js` (troposphere),
`lib/units.js`, `lib/provenance.js`, `fuselageWettedArea`, and
`FUSELAGE_CONVENTION` — **including the unsourced tail-cone control points used identically by all
four aircraft classes** (F-G15).

Per class: the sizing loop, defaults, input list, validation aircraft, and the weight method
(NDARC AFDD for eVTOL, GASP for trainer, FLOPS for the three jets and the turboprop).

`bizjet` shares `sizeTransport` entirely, so every transport finding applies to it.
