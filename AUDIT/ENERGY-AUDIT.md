# ENERGY AUDIT (Phase 6)

Commit `3a7a5a4`. Mission energy ledger, efficiency-chain trace, and the reserve-definition audit.

## Mission energy ledger — eVTOL default, registry path

Lead-verified from the live engine.

| segment | power (kW) | energy (kWh) | share of total | energy source | notes |
|---|---|---|---|---|---|
| vertical take-off | `Phov` 596.81 | `Eto` **4.973** | 3.0 % | battery | `hoverTimeTakeoffS` × `missionHops` |
| climb | `Pcl` 355.44 | `Ecl` **19.139** | 11.6 % | battery | `(W/etaSys)(RoC + Vcl/LDcl)` |
| cruise | `Pcr` 232.96 | `Ecr` **76.417** | 46.4 % | battery | `(W/etaSys)(V/LDcruise)` |
| descent | `PdcRaw` 8.26 | `Edc` **0.331** | 0.2 % | battery | regeneration credit **refused** at the design point (`Math.max(0,…)`, `:1103`) |
| landing | `Phov` 596.81 | `Eld` **4.973** | 3.0 % | battery | |
| **reserve** | `Pres` 142.09 | `Eres` **59.016** | **35.8 %** | battery | `max(20 min at V_be, 10 % of mission)` |
| **total** | | **`Etot` 164.85** | 100 % | | |

**Closure: 4.973 + 19.139 + 76.417 + 0.331 + 4.973 + 59.016 = 164.849 kWh against `Etot`
164.85 — PASS.** An independent agent check found the mission-only sum closes to **−7.1e−15 kWh**.

Pack quantities: `PackUsablekWh` **164.85** (= `Etot` identically), `PackkWh` **203.519**
(usable fraction 0.8100), `PackInstalledkWh` **204.883**. `Etot/PackkWh ≡ 1 − socMin` holds
identically, so the SoC window and `etaBat` are **not** double-applied. The +0.67 % gap between
`PackkWh` and `PackInstalledkWh` is **UNVERIFIED** (U-03).

Independent closed-form re-derivations at the converged design (agent, own Python):
cruise `W·R_cr/(eta·L/D)` = 14.4692 kWh against 14.472 (**−0.019 %**); reserve
`W·V_res·t/(eta·L/D)` = 47.3537 against 47.363 (**−0.020 %**). **PASS.**

Range budget closes exactly: climb 11.256 + descent 8.970 + cruise 18.671 + reserve 61.104 =
**100.001 km** = requested.

## `E = P × t` — unit consistency

**PASS at all 14 sites.** Every segment energy is formed as `P·t/3600` with `P` in kW and `t` in
seconds; no site uses kW·s raw. `sedCell·3600` is used correctly where J/kg is needed
(`src/engine.js:499`); `psfcSI = lb/hp·h × 0.4536/(745.7×3600)` and `tsfc/3600` are both
dimensionally exact. No Wh/J confusion found anywhere.

## Efficiency chain

The chain **as implemented** is: `battery → (etaBat, vertical energy only) → [NOTHING] → rotor
(FM)` in hover, and `battery → (etaSys, one lumped number) → airframe` in forward flight.

| efficiency | value | defined at | applied at | applied to | direction correct? |
|---|---|---|---|---|---|
| `etaHov` (figure of merit) | 0.740 | `defaults.js:210` | `engine.js:1017` (÷); passed as `FM:` at `:2647` | hover **rotor shaft** power | Yes (÷) |
| `etaBat` | 0.90 | `defaults.js:235` | `engine.js:1334-1346` → `WE` (`:1373`), `PackkWh` (`:2244`) | **energy only**, and only `Eto + Eld` (RST scoping, sourced) | Yes |
| `etaSys` | 0.80 | `defaults.js:211` | `:1078, 1084, 1102, 1105, 2137, 499`; `constraints.js:62,70,78`; `profile.js:84` (all ÷); **`certification-climb.js:159` (×)** | forward-flight power, battery→propeller | ÷ correct; **× at `certification-climb.js:159` is on the wrong side (F-E05)** |
| `etaRotorborne` | 0.845 `[CAL]` | `engine.js:318` | `:1083-1084, 1105` (÷), wingless layouts only | battery→**shaft** | Yes — but never applied in hover on the same aircraft (F-13) |
| **motor efficiency** | **absent** | — | — | — | **OMITTED in hover** |
| **inverter efficiency** | **absent** (mass only, `weights.js:134, 504`) | — | — | — | **OMITTED in hover** |
| **bus / distribution** | **absent** | — | — | — | Omitted |
| Peukert derate | 0.0707 at 4.33 C | `engine.js:167, 1358-1371` | `sedEff` (`:1371`) | specific energy | Yes, ×(1−d) |
| `kCoax` | 1.0 (hybrid); 1.2808 at a=1 | `coaxial.js:35` | `engine.js:1017` (×) | hover induced power | Yes |
| `kTwin` | 1.0 (hybrid); 1.014–1.025 sideBySide | `coaxial.js:172` | `engine.js:1017` (×) | hover induced power | Yes |
| `cruiseDutyLimit` | 0.80 `[LAY]` | `weights.js:636` | `Pcruise_rating` | pusher motor rating | Yes, but on a **bus** power (F-E06) |
| `etaGenerator` | 0.95 `[SRC]` | `turboelectric.js:70` | `:132-138` (÷) | TE rating and fuel | Yes |
| `etaGearbox` | 0.98 `[SRC]` | `turboelectric.js:74` | `:132-138` (÷) | TE rating and fuel | Yes |
| `fuelFlowFactor` | 1.05 `[SRC]` | `turboelectric.js:85` | `:139-140` (×) | fuel burn | Yes |
| drone `etaMotor` | computed from Kv/Kt/I0/Rm | `drone/motor.js:205` | per operating point | — | Yes |
| drone `etaJoint` (ESC+motor) | measured band, p10/median/p90 | `drone/esc.js` | `busPowerW = P_elec/eta` (÷) | — | Yes |

**No efficiency is duplicated, and none is applied to power *and* again to energy** — energy is
always `P·t/3600` on an already-divided power. **PASS on the two questions Phase 6 asks most
directly.** The defects are *omission* in hover (F-13) and *one inverted application* (F-E05).

## Reserve definition — PASS, no compounding

`src/engine.js:1169-1177`:
```js
Eld=Phov*tld/3600; Eres=Pres*tres/3600;
const Emission=Eto+Ecl+Ecr+Edc+Eld;
const EresPct=(p.reservePctMission??0.10)*Emission;
Eres=Math.max(Eres,EresPct);
Etot=Emission+Eres;
```
The two criteria are a **maximum, never a sum** — lead-verified. This matches the cited NASA rule
("reserve minimum of 10 % of mission **or** 20-min flight at best-endurance speed"). Phase 6's
specific warning — that "20 %" and "45 minutes at cruise power" must not be accidentally
compounded — is **satisfied**.

At the defaults the time-based criterion binds: `Emission` 105.833 kWh → `EresPct` 10.583 kWh
against `Eres` 59.016 kWh. The reserve is flown at the best-endurance speed `0.76·V_cruise`
unless `reserveAtCruiseSpeed` is set, and both conventions are sourced in
`src/lib/provenance.js`.

Minor: the `?? 0.10` fallback applies even when no mission basis is selected, so a NASA
convention is silently active outside the basis that documents it (**F-33**). It does not bind
at the defaults.

**Transport reserve — PASS on bookkeeping, FAIL on the control.** Reserve components appear
**exactly once** per policy across four policies (us-domestic, us-flag, easa, nbaa), with segment
sums closing to ±7.3e−12 lb and distance sums hitting the requested 2960 nmi exactly. But
`reserveMin` is **completely inert** under the default `mission` fuel method — lead-verified,
0 → 600 minutes changes the design by 0.00 % (**F-03**).

## Findings

| id | finding | severity | status |
|---|---|---|---|
| **F-13** | `Phov` is a rotor **shaft** power (÷ by a figure of merit only) but is consumed as battery/bus power in five places, including `Etot`, `WP = Phov/spBattery`, pack current, pack ohmic heat and the turboshaft rating. No motor, inverter or bus efficiency exists in the hover chain, although the engine's own `etaRotorborne = 0.845` proves it knows the factor exists and applies it to wingless *cruise*. Agent-estimated impact: hover electrical draw understated 6.5–15.6 %, `Pheat` +13 % to +34 %, `Etot` ~+1.1 %. **The boundary question — whether `etaHov` is intended as a pure FM or a lumped efficiency — is UNVERIFIED (U-01) and is the first thing to put to the code owner.** | MEDIUM | AGENT-REPORTED |
| **F-E05** | `etaSys` applied as a **multiplier** to a shaft power in the certification climb gradient. `certification-climb.js:113,159`: `gradient = (pAvailKW·1000·eta)/(W·V) − 1/LD`, where `pAvailKW` derives from `sizeCond.installedKW`, a **shaft** rating. `engine.js:1079-1084` requires `etaSys` to be the full chain *including* the propeller, so multiplying a shaft power by it charges the electrical losses twice. Impact: gradient 23.3 % vs 28.6 %, a **5.3-point understatement**. Both clear the MOC VTOL.2120 minimum, so the verdict is unchanged today; the number is wrong and would matter on a marginal design. | MEDIUM | AGENT-REPORTED |
| **F-E06** | Lift motors and the cruise motor are rated on **opposite sides** of the electrical chain with the same kW/kg constants. `weights.js:624,637-639` rates the pusher from `g.Pcr`, a **bus** power; `weights.js:394-449` rates the lift motors on **shaft** power. The same 5.0 kW/kg and 20 kW/kg are applied to two different physical quantities, so the pusher group is over-massed by ≈ 1/`etaSys` = 1.25× relative to the lift group's convention. | MEDIUM | AGENT-REPORTED |
| **F-E10** | The cell-count pack architecture is unsourced, hard-coded, and describes a pack 23 % smaller than the mass model's. `engine.js:2204-2207`: `Vcell=3.6, Ahcell=5.0, Vpack=800` inline with no citation; `EpackArch = Etot` is the **usable** energy while the mass model's `PackInstalledkWh` is the nameplate — a factor `1/(1−socMin)` = **1.23** apart. So `Rint` and `Pheat` are ~23 % high and `Ncells` is under-reported by the same factor into the thermal module. `engine.js:2208-2243` fixed exactly this class of defect for `PackkWh` and left the architecture behind. | MEDIUM | AGENT-REPORTED |
| **F-E11** | `etaSys = 0.80` is uncited and its own stated derivation does not produce it. `defaults.js:211` comments *"modern PMSM motors + inverter ~93 %×93 %"* — but 0.93×0.93 = **0.865**, and `engine.js:1079-1080` requires this symbol to include the **propeller**. So either the value implies a 0.925 propeller (high but possible) or the comment names the wrong chain. **This is the single largest efficiency in the model** (cruise is ~46 % of `Etot`) and it has no source and a self-contradicting derivation. By contrast `POWERTRAIN_ETA_ROTORBORNE = 0.845` is honestly tagged `[CAL]`. Verdict: **UNVERIFIED value, FAIL provenance.** | MEDIUM | AGENT-REPORTED |
| **F-E12** | `TW_cruise` (`engine.js:2137`) uses `etaSys` on layouts whose `Pcr` was formed with `etaRotorborne`, so it is off by 0.80/0.845 = **−5.3 %** on wingless layouts. | LOW | AGENT-REPORTED |
| **F-E13** | Avionics / hotel load is **absent** from the eVTOL mission energy (`engine/avionics.js` is mass-only; grep finds no power field). The drone path does it correctly and **refuses to run** without a declared `avionicsPowerW`. For a 5-seat aircraft with triplex flight-critical avionics this is 1–3 kWh over a ~45-minute mission — small, but it is a declared omission in one half of the codebase and an enforced input in the other. | LOW | AGENT-REPORTED |
| **F-33** | `reservePctMission` falls back to 0.10 outside the mission basis that documents it. Does not bind at defaults. | LOW | **VERIFIED** |
| **U-03** | `PackInstalledkWh` exceeds `PackkWh` by 0.67 % at the defaults; mechanism not traced. | UNVERIFIED | — |

## What passed

- **Energy closure exact** (164.849 vs 164.85; mission-only sum to −7.1e−15 kWh).
- **`E = P·t` dimensionally correct at all 14 sites**; no Wh/J or kW/W confusion anywhere.
- **Reserve never compounded** — a `max`, not a sum, in the eVTOL; exactly once per policy in the
  transport, across four policies.
- **SoC / usable-fraction algebra exact**: `Etot/PackkWh ≡ 1 − socMin`, so no double application
  of the SoC window or `etaBat`.
- **Peukert has the right sign and exponent**; `sedBasis: "packUsable"` correctly suppresses all
  three cell-level derates.
- **No efficiency inverted, duplicated, or applied to both power and energy** — with the single
  exception of F-E05.
- **Fixed-wing SFC paths** all check out: the Breguet 375 constant (= 550·3600/5280), `psfcSI`,
  `tsfc/3600`, and the referred-power lapse form.
- **The drone energy chain is complete and correctly directioned** — and is precisely the chain
  the eVTOL engine is missing in hover (F-13).
