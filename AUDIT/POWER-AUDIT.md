# POWER CONSISTENCY AUDIT (Phase 6 / Phase 25)

Commit `3a7a5a4`. This document answers one question: **does every quantity named "power" mean
the same thing, and does each mean what its label claims?**

## The power ladder as implemented

| quantity | file:line | physical station | divided by |
|---|---|---|---|
| ideal induced power | (implicit) | rotor disk | — |
| `Phov` | `engine.js:1017` | **rotor shaft** | `etaHov` (a figure of merit) |
| `Pcl`, `Pcr`, `Pdc`, `Pres` | `engine.js:1078-1105` | **DC bus** | `etaSys` (full chain incl. propeller) |
| `PmotInstalledKW` | `weights.js:394` | **motor shaft** | — (correctly a shaft rating) |
| `PpeakKW`, `P_mot_nom_kW`, `P_mot_oei_kW` | `engine.js:3570` and near | motor shaft | — |
| `PmotKW`, `Torque`, `MotMass` | `engine.js:2194-2198` | **legacy model** | `1.15` then `/5.0 kW/kg` |

**The defect is that two adjacent stations are displayed as if they were one.**
`src/App.jsx:522, 1548` show `SR.Phov` as "Hover Power (kW)" beside `Pcr`, which *is* a bus
power — two numbers on one screen on opposite sides of the electrical chain (**F-13**).
`src/engine/profile.js:31` states "Segment powers, all in kW at the DC bus" and then takes
`r.Phov` (`:45`).

Lead-verified default values: `Phov` 596.81 kW (shaft), `Pcr` 232.96 kW (bus), `Pcl` 355.44 kW
(bus), `Pres` 142.09 kW (bus), `PmotInstalledKW` 73.72 kW (shaft, per motor).

## Cross-engine power consistency (Phase 25)

| pair | agree? |
|---|---|
| sizing `Phov` vs the `Phov` used for battery power sizing (`WP`) | same variable — but a shaft power against an electrical limit (**F-13**) |
| sizing `Pcr` vs the constraint diagram's cruise power | **NO** — the diagram's design point is 5.013 kg/kW against `MTOW/Phov` = 4.645, **−7.4 %** (**F-G10**) |
| sizing `Phov` vs the `ConvergenceTab` T/W table | **NO** — 489.2 kW against 596.81, **−18.0 %**, because T/W is applied twice (**F-G03**) |
| sizing `Phov` vs the Weather tab | **NO** — 532.24 against 596.81, **−10.82 %**, download omitted (**F-11**, lead-verified) |
| sizing `Phov` vs `ConvergenceTab.jsx:203` | **NO** — **+32.1 %** (**F-18**) |
| installed motor power vs the displayed motor power | **NO** — 129.3 kW installed against 100.3 displayed, **−22.4 %** (**F-25**) |
| `TW_cruise` vs the `Pcr` it inverts | **NO** on wingless layouts — **−5.3 %** (**F-E12**) |
| certification climb gradient's available power | `etaSys` multiplied into a shaft power — **5.3 points** understated (**F-E05**) |

**Verdict: FAILED on cross-engine power consistency.** The sizing loop is internally coherent;
six separate display and analysis paths disagree with it, by between 5 % and 32 %.

## What passed

- `E = P·t/3600` at all 14 sites; no kW/W or Wh/J confusion.
- No efficiency inverted, duplicated, or applied to power *and* energy (one exception, F-E05).
- Installed-power conditions use the correct `(T/W)^1.5` exponent (`sizing-conditions.js:166-232`).
- The motor *mass* path uses shaft power correctly and is not affected by F-13.
- `Etot/PackkWh` identically equals `1 - socMin`, so the SoC window is applied exactly once.
