# SIZING-LOOP AUDIT (Phase 4)

Commit `3a7a5a4`. **18 iterative loops** found across the five registered classes plus the drone.
Each is documented below with the attributes Phase 4 requires. Convergence tables and the
stress matrix follow.

## Loop inventory

| id | loop | file:line | state | initial guess | criterion | limit | damping | failure behaviour |
|---|---|---|---|---|---|---|---|---|
| L1 | eVTOL Round-1 seed | `src/engine.js:495-505` | `MTOW1` | **hard-coded 2177 kg** | residual, `\|mn−MTOW1\| < tolFor` | 5000 | none | `if(MTOW1>5700)break` **placed after the assignment** → iterate unbounded (**F-01**) |
| L2 | eVTOL master MTOW | `src/engine.js:793-1634` | `MTOW`; lagged `packSysPrev`, `WbatPrev` | `MTOW1` from L1 | **residual** `\|mn−MTOW\| < 0.01·max(1,\|MTOW\|)·10^convTolExp` | 600 | relax 1.0, then secant, then bisection | ceiling 11,400 kg; `r2Diverged` flag; **MTOW keeps its previous value, which is the seed on pass 1** |
| L3 | wing-station root find | `src/engine/wingPosition.js:54-207` | `wingLEfrac` | `0.2589` | **residual** `\|g\| ≤ 1e-3` on static margin | 45 evals / 60 iters | secant → 13-pt sweep → bracketed bisection | **explicit** `wingPosConverged:false` + `wingPosReason`, falls back to `baseFrac` |
| L4 | transport gross closure | `src/classes/transport/size.js:375-426` | **`(gross, wsUsed)` — two variables** | `3.5 × payloadLb` | `\|next−gross\| < 0.5 lb` — **on `gross` only** (**F-20**) | 300 | 0.5 on both | `stopReason` set; runaway > 2e6 lb |
| L5 | transport cruise/descent closure | `src/classes/transport/mission.js:215-222` | `descent.R` | `climb.W × 0.9` (unsourced) | `\|ΔR\| < 0.01 m` | 20 | none | **no flag if unsettled** |
| L6 | `cruiseLeg` mean weight | `src/classes/transport/mission.js:105-109` | mean W | — | **none — fixed 4 passes** | 4 | — | none |
| L7 | `transition()` energy march | `src/classes/transport/mission.js:78-97` | h, W, R | — | ceiling break `excess ≤ 1e-4` | 500 ft steps | — | `W -= dW` **with no floor** (**F-21**) |
| L8 | `minDragCL` golden section | `src/classes/transport/mission.js:122-129` | CL | fixed bracket **[0.1, 1.5]** | 40 iterations, returns bracket midpoint | 40 | — | **silently clamps** if CL_md lies outside |
| L9 | range bisections | `src/classes/transport/size.js:468-472, 523-525` | R | `hi` = 12,000 / 16,000 nmi | 40 halvings, **no residual check** | 40 | — | **returns the cap as a range** |
| L10 | turboprop gross closure | `src/classes/turboprop/size.js:210-226` | `gross` | `3 × payloadLb` | `\|next−gross\| < 0.5 lb` | 300 | 0.5 | runaway > 1e6 lb |
| L11 | turboprop cruise-altitude search | `src/classes/turboprop/size.js:105-117` | alt | 100 m grid | golden section, 40 steps | 40 | — | guarded `return r.pm <= best.pm ? r : best` |
| L12 | trainer gross closure | `src/classes/trainer/size.js:187-213` | `gross` | `2·payloadLb + 1000` | `\|next−gross\| < 0.01 lb` | 200 | 0.7 | `TRAINER_MAX_GROSS_LB` guard — **but see F-02** |
| L13 | `trainerRangeAt` bisection | `src/classes/trainer/size.js:137-140` | R | `lo=0, hi=5000` nmi | 40 halvings | 40 | — | cap returned silently |
| L14 | drone MTOM fixed point | `src/classes/drone/sizing.js:310-353` | `m` | airframe with no battery (deliberate, `:290-306`) | **residual** `\|mNew−m\| < 1e-4 kg` | 200 | 0.5 | **explicit `status:"infeasible"` + `reason`**; `diverged` if > 1e5; **two-cycle-on-pack-boundary detection** (`:343-351`); **re-evaluates the chain AT the converged mass** (`:331`) |
| L15 | balanced-field V1 + T/W bisection | `src/classes/transport/takeoff.js:265-280, 303-307` | V1, T/W | bracketed | — | — | — | out-of-bracket handled explicitly; **`takeoffThrustToWeight` returns `NaN`** when unattainable (`:302`) |
| L16 | landing ground-roll integration | `src/classes/transport/landing.js:160-171` | v, s | — | `dt = 0.01 s` | `guard < 200000` | — | **silent truncation at 2000 s** |
| L17 | `landingWingLoading` bisection | `src/classes/transport/landing.js:191-195` | W/S | `lo=50, hi=1200` kg/m² | 60 halvings | 60 | — | **returns the bracket end with no flag** (**F-15**) |
| L18 | drone flight SoC integration | `src/classes/drone/dynamics.js:779-880` | `energyWh`, `soc` | — | ends when `energyWh ≥ usableWh` | — | — | `soc = max(0, 1 − energyWh/usableWh)`; stays in [0,1] but the clamp hides a final-step overshoot (**U-05**) |

**L3 and L14 are the best-behaved loops in the tree.** Both test a true residual, both fail
explicitly with a named reason, both treat an infeasible state as data rather than as a number.

## Convergence tables

### eVTOL default, registry path (`engineInputs(DEFAULT_PARAMS)`)

Converged MTOW **2772.06 kg**, `Etot` 164.85 kWh, `Phov` 596.81 kW, `LDact` 9.77.
Tolerance `tolFor(MTOW) = 0.01·MTOW·10^convTolExp`.

The agent-produced trace below was taken on the **direct** `runSizing(DEFAULT_PARAMS)` path
(converging to 2073.36 kg — see **F-19**), so the iterate values are from that path. The
*shape* is what matters and is reported as observed:

| it | MTOW iterate (kg) | residual (kg) | `Etot` (kWh) |
|---|---|---|---|
| 0 | 1241.6 (= L1 seed) | 2.772e+2 | 57.239 |
| 1 | 1518.8 | 1.934e+2 | 65.119 |
| 2 | 1712.2 | 1.242e+2 | 71.222 |
| 3 | 1836.3 | 8.060e+1 | 75.193 |
| 4 | 1916.9 | **6.616e−1** | 82.251 |
| 5 | 2066.7 | **6.614e+0** ← the secant step made the residual 10× worse | 82.651 |
| 6 | 2074.6 | 7.461e+0 | 82.591 |
| 7 | 2073.3 | 4.486e+0 | 82.812 |
| 8–15 | 2077.8 → 2086.0 | 2.96 → 1.55e−1 | 82.96 → 83.222 |
| 20 | 2086.4 | 1.893e−2 | 83.235 |
| 32 | 2086.4 | 1.210e−4 | 83.237 |

Note the non-monotone residual at iteration 5: the hybrid's first secant step increased the
residual by an order of magnitude before recovering. The loop is robust to it, but the residual
history is not monotone and the convergence chart mis-pairs it (**F-G11**).

### Transport default

Converged **173,724.41 lb** in 38 passes; observed contraction 0.744/iteration.

| it | gross (lb) | next (lb) | residual (lb) |
|---|---|---|---|
| 0 | 127,669.50 (= 3.5·payload) | 152,549.91 | 24,880.41 |
| 4 | 160,554.98 | 167,578.88 | 7,023.90 |
| 8 | 169,883.45 | 171,892.58 | 2,009.14 |
| 14 | 173,068.19 | 173,397.42 | 329.23 |
| 20 | 173,608.59 | 173,666.87 | 58.28 |
| 28 | 173,713.28 | 173,719.08 | 5.79 |
| 37 | 173,723.98 | 173,724.41 | 0.4317 < 0.5 |

**Closure at the reported solution: `ZFW + fuel − gross = 0.00000 lb` — PASS.**

## Direct answers to the Phase 4 questions

**Is the stopping test on the delta or the residual?** **Residual, everywhere** — verified at
`engine.js:502, 1448`; `wingPosition.js:128, 162`; `transport/size.js:424`;
`turboprop/size.js:224`; `trainer/size.js:211`; `drone/sizing.js:325`; `mission.js:219`.
**PASS**, with two qualifications: the transport's state vector is `(gross, wsUsed)` and only
`gross` is tested (**F-20**); and the eVTOL residual is computed with lagged `packSysPrev` /
`WbatPrev`, so it is the residual of a lagged map — measured as converged out (below).

**Can convergence be an artefact of a clamp?** **Yes, FAIL** — four places, each demonstrated by
materially different inputs giving bit-identical results. See **F-12**.

**Can it converge to negative or zero mass/energy?** eVTOL is **protected**
(`Wbat = max(WE, WP)` with `WP > 0`; `Wempty` guarded by `cwOK = isFinite && >0 && <MTOW` at
`:1244`). **Trainer FAILS with `converged: true`** (**F-02**). Transport and turboprop produce
negative fuel and negative gross weight but always with `converged: false` (**F-22**).

**Is convergence dependent on the initial guess?** **PASS.** Driving the eVTOL L1 seed from
589.67 to 5944.13 kg (via `LD` 4→40 and `ewf` 0.2→0.8) returns the same MTOW every time, in
26–40 passes. `solver`, `sizingRelaxation` 0.05–1.0, `solverSwitchFrac` 0.001–0.5,
`solverStallLimit` 1/99 and `convTolExp` −3…−10 all return the same answer. Drone likewise
(damping 0.05 / 0.5 / 1.0 → 4.0910 kg in 188 / 15 / 2 iterations).

**Are coupled variables updated consistently, or is a stale value read?** The lags are
`packSysPrev` and `WbatPrev` (`engine.js:755-760, 1225-1226, 1441-1442`), `endFrac`
(`transport/size.js:384`) and the alternate leg's descent distance (`mission.js:189-191`).
Measured across all six eVTOL layouts, comparing pure fixed-point against the hybrid and against
forced-secant:

| config | fixed-point | hybrid (default) | pure secant | spread |
|---|---|---|---|---|
| hybrid | 2073.3600 | 2073.3600 | 2073.3600 | **0.00e+0** |
| hybridPusher | 2133.5700 | 2133.5700 | 2133.5700 | **0.00e+0** |
| tiltrotor | 2022.7300 | 2022.7300 | 2022.7300 | **0.00e+0** |
| multicopter | 1832.2900 | 1832.2900 | 1832.2900 | **0.00e+0** |
| liftcruise | 2912.4300 | 2912.4300 | 2875.7400 (`conv:false`) | 3.67e+1 |
| sideBySide | 1535.0300 | 1535.0300 | 1533.1700 (`conv:false`) | 1.86e+0 |

**The lag is converged out on every path that reports convergence — PASS.** The two spreads
belong to forced-secant runs that both report `r2Converged: false`. The **alternate-leg lag
(`mission.js:189-191`) is never converged out** — a permanent offset, unlike the main mission
which iterates at `:215-222`. Inconsistent treatment of the same coupling in one file.

**Is MTOW self-consistent at convergence?** **PASS.** eVTOL
`MTOW − payload − Wempty − Wbat = 0.0000 kg` against a tolerance of 2.09e−5; transport
`zeroFuel + fuel − gross = 0.00000 lb` against 0.5 lb. Two caveats: `engine.js:1448` sets
`MTOW = mn` while everything else was evaluated at the previous iterate (≤ 2.09e−5 kg), and the
transport's reported wing loading and wing area disagree by up to 0.45 % (**F-20**).

**One caveat on the FLOPS classes' reported residual:** the returned
`zeroFuel + fuel − gross` is **identically zero and therefore proves nothing** — the loop assigns
`gross = next` at the break and returns weights computed at the *pre-update* gross. The honest
residual is the trace value (0.432 lb transport, 0.489 lb bizjet).

## Robustness matrix

`✓` correct · `FLAG` wrong but explicitly flagged · **`SILENT`** plausible nonsense, no flag ·
`THROW` exception.

| stress | eVTOL | transport | turboprop | trainer | drone |
|---|---|---|---|---|---|
| zero payload | THROW (unnamed) | FLAG | FLAG | ✓ | ✓ |
| negative payload | THROW (unnamed) | — | — | — | **THROW, named** ✓ |
| very high payload | FLAG ceiling | FLAG runaway | ✓ | THROW, named ✓ | ✓ `infeasible` |
| zero range | **SILENT** | **SILENT** | **SILENT** | **SILENT** | n/a |
| negative range | **SILENT** | FLAG | FLAG | **SILENT, negative fuel** | n/a |
| very high range | FLAG ceiling | FLAG, landing W below ZFW | FLAG | FLAG | n/a |
| zero reserve | ✓ | **INERT** (F-03) | ✓ | ✓ | n/a |
| very large reserve | FLAG ceiling | **INERT** | FLAG | ✓ | n/a |
| negative reserve | **SILENT** (F-16) | **INERT** | **SILENT** | **SILENT, negative fuel** | n/a |
| extreme low battery SED / sfc | FLAG **142,043 kg** (F-01) | FLAG | FLAG | — | n/a |
| extreme high battery SED | ✓ | ✓ | ✓ | — | n/a |
| SED = 0 / negative | THROW / **SILENT** (power floor) | — | — | — | n/a |
| high altitude | FLAG | FLAG | ✓ | FLAG ✓ | ✓ `meetsMission:false` |
| very low speed | **SILENT / NaN published** (F-11 loops) | FLAG | FLAG | FLAG | n/a |
| very high speed | FLAG | ✓ | ✓ | FLAG | n/a |
| headwind ≥ cruise speed | **SILENT, identical result** (F-12) | n/a | n/a | n/a | n/a |
| `socMin = 1` / `cRateDerate = 1` | **`Wbat = Infinity` published** | n/a | n/a | n/a | n/a |
| unreachable landing field | n/a | **SILENT, missed by 16,561 m** (F-15) | n/a | n/a | n/a |
| bad declared input | — | — | — | — | **THROW, named, all 5** ✓ |

**Silent nonsense in 11 of the tested cells.** Explicit, named refusals: **the drone
throughout** — `payloadKg >= 0`, `endurance > 0`, `usableFraction ∈ (0,1]`, `altitude >= 0`,
`rotors >= 3`, all five declared inputs, plus a refusal to extrapolate a measured propeller
curve. That module is the reference standard the other four should be measured against.

## Ranked fix order for PASS B

1. **F-01** — one line: move `engine.js:504` above `:503`, or clamp `MTOW1` before L2.
2. **F-02** — trainer input validation and a sign guard on fuel.
3. **F-03** — thread `reserveMin` into `flyMission`, or remove the control.
4. **F-14 / F-16** — range checks on `range`, `reserveMinutes`, `payload`, `vCruise`, `sedCell`.
5. **F-15** — flag the landing-bisection clamp.
6. **F-12** — positivity guards on `Ereq`/`sedEff`; refuse `headwind ≥ vCruise` as `profile.js` already does.
7. **F-20** — add `wsUsed` to the transport stopping test.
