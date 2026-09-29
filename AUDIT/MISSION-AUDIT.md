# MISSION AUDIT (Phase 9)

Commit `3a7a5a4`.

## eVTOL mission — PASS on internal consistency

| check | result |
|---|---|
| segment energies sum to the total | 4.973 + 19.139 + 76.417 + 0.331 + 4.973 + 59.016 = **164.849** vs `Etot` **164.85** — lead-verified |
| mission-only sum vs `Etot - Eres` | gap **-7.1e-15 kWh** |
| every segment reproduces `P·t/3600` | max gap 4.0e-3 kWh, all print rounding |
| reserve applied exactly once | `Eres = max(time-based 47.363, 10 % of mission 3.597)` -> the time criterion binds |
| range budget closes | climb 11.256 + descent 8.970 + cruise 18.671 + reserve 61.104 = **100.001 km** = requested |
| independent closed-form cruise energy | `W·R_cr/(eta·L/D)` = 14.4692 vs 14.472 kWh (**-0.019 %**) |
| independent closed-form reserve energy | `W·V_res·t/(eta·L/D)` = 47.3537 vs 47.363 kWh (**-0.020 %**) |
| simplified (Round-1 Breguet) vs integrated | `Wbat` 276.86 vs 373.25 kg (**-25.8 %**); MTOW seed -40.1 %. **L1 is explicitly only a seed**, so this is documentation, not a defect |

**No transition segment exists in the energy accounting** — `configuration.js` sets
`rotorLiftShare: () => 1, wingLiftShare: 1` for every winged layout, and
`src/engine/aeropropulsive.js` has no production consumer (**F-A17**). For a vehicle class whose
defining feature is the transition, that is a declared modelling gap rather than an arithmetic
error, but it belongs in any statement of what the tool does and does not cover.

## Transport mission — PASS on bookkeeping

Segment fuel sums, reserve components and distances, across four reserve policies:

| policy | trip (lb) | reserve (lb) | total (lb) | sum of segments | gap | sum of distances vs requested 2960 nmi |
|---|---|---|---|---|---|---|
| us-domestic | 34,807.1 | 6,357.3 | 41,164.3 | 41,164.3 | -7.3e-12 | 186.3 + 2639.3 + 134.4 = **2960.0** |
| us-flag | 35,182.0 | 7,695.1 | 42,877.1 | 42,877.1 | +7.3e-12 | **2960.0** |
| easa | 34,783.4 | 6,272.6 | 41,055.9 | 41,055.9 | 0 | **2960.0** |
| nbaa | 34,477.0 | 5,150.5 | 39,627.5 | 39,627.5 | 0 | **2960.0** |

Reserve components appear **exactly once** per policy. Mass-in/mass-out:
`grossN - sum(segment fuel) = landingWeightN` to 1.9 N.

## Simplified vs integrated — the largest single spread in the audit

Same requirement, three shipped fuel methods, **all reporting `converged: true`**:

| method | gross (lb) | fuel (lb) | S (ft^2) | cruise L/D | delta fuel vs integrated | delta gross |
|---|---|---|---|---|---|---|
| `mission` (integrated, segment by segment) | 173,724 | 41,164 | 1407 | 18.175 | — | — |
| `loftin` (single Breguet) | 169,039 | 37,882 | 1369 | 18.082 | **-7.97 %** | **-2.70 %** |
| `regulatory` (Scholz fraction chain) | 197,947 | 57,482 | 1603 | 18.606 | **+39.64 %** | **+13.94 %** |

**A 24,223 lb (13.9 %) MTOW spread between two selectable, equally "converged" methods.** The
cause is traceable: the fraction chain charges ~9.5 % of gross for non-cruise phases where the
integrated mission's taxi + take-off + climb + descent is 5,882 lb = **3.4 %** — a 2.8x
over-charge (`size.js:298-301`, `mission.js:205-224`). Phase 9 asks specifically whether the
range/energy formulas disagree with the mission simulation; **they do, by 40 % on fuel**, and
nothing in the UI tells the user which method is authoritative.

## Findings

| id | finding | severity |
|---|---|---|
| **F-03** | `reserveMin` completely inert under the default `mission` method — lead-verified, 0 -> 600 min changes nothing. | HIGH |
| **F-21** | `flyMission` lets the aircraft burn through its own structure: landing weight **132,509 lb below ZFW** at extreme range, with `cruiseLD` and `cruiseCL` reported for an aircraft weighing 0.05 lb. The `need(R)` bisection is evaluated on this regime and, because fuel saturates at ramp weight, can never leave its bracket. | MEDIUM |
| **F-M-01** | The three fuel methods disagree by 13.9 % on MTOW with no statement of which is authoritative. | MEDIUM |
| **F-12b** | `mission.js:189-191`: the **alternate** leg computes cruise distance from a descent at `up.W`, then recomputes the descent from `cr.W` and **never re-closes** — unlike the main mission, which iterates at `:215-222`. A permanent offset, and an inconsistent treatment of the same coupling in one file. | MEDIUM |
| **F-12c** | Fixed-iteration and unflagged loops in the mission: `cruiseLeg` does exactly 4 mean-weight passes with no residual (`:105-109`); the descent seed is an unsourced `climb.W x 0.9` (`:213`); the cruise/descent closure gives up after 20 passes **with no flag** (`:215-222`); `minDragCL` searches a fixed `[0.1, 1.5]` and silently clamps (`:122-129`); `dt = |dh|/5` floors descent at a bare 5 m/s (`:91`). | LOW |
| **U-05** | SoC is clamped `max(0, 1 - energyWh/usableWh)` (`drone/dynamics.js:874, 993`), which would **hide** a final-step overshoot; no `soc > 1` assertion exists. Whether an overshoot occurs is unverified. | UNVERIFIED |
