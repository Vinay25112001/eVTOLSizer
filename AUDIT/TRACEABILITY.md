# REQUIREMENTS TRACEABILITY (Phase 15)

Commit `3a7a5a4`. The chain Phase 15 requires, traced backwards for the headline output, with the
breaks named.

## MTOW — the full chain

```
USER REQUIREMENT      payload 455 kg, range 100 km, vCruise 67 m/s, cruiseAlt 1000 m
      |               src/lib/defaults.js  DEFAULT_PARAMS
      v
ENTRY ADAPTER         engineInputs()  src/lib/designfile.js:98-105
      |               folds reserve distance in: range 100 -> 161.104 km
      |               *** BREAK: src/App.jsx:1649 bypasses this (F-19) ***
      v
DESIGN VARIABLES      wingLoadingNm2 1371, AR 9, nPropHover 12, propDiam 2.37,
      |               etaHov 0.740, etaSys 0.80, twRatio 1.30
      v
ATMOSPHERE            atmosphereSet()  src/engine/atmosphere.js:73
      |               rho_cr 1.111643, a_cr 336.434, rho_hov 1.22321   [ISA exact, P-01]
      |               *** BREAK: muCr from a kinematic MU0 (F-04) ***
      v
AERODYNAMICS          S = max(W/(W/S), W/(q CLmax_cr))   engine/wing.js:161
      |               CL = W/(qS) = 0.549481            *** BREAK: weight cancels (F-10) ***
      |               CD0 = 0.043324  *** BREAK: 34.6 % is an unstated fixed-gear default (F-09) ***
      |               LDact = 9.77
      v
POWER MODEL           Phov 596.81 kW  [momentum theory, verified P-03]
      |               *** BREAK: a shaft power consumed as electrical (F-13) ***
      |               Pcr 232.96, Pcl 355.44, Pres 142.09 kW  [bus]
      v
MISSION ENERGY        Eto 4.973 + Ecl 19.139 + Ecr 76.417 + Edc 0.331 + Eld 4.973
      |               + Eres 59.016 = Etot 164.85 kWh   [closes, P-06]
      v
BATTERY               PackkWh 203.519, Wbat 728.08 kg   [Etot/PackkWh = 1-socMin exactly]
      v
MASS CLOSURE          Wempty 1588.99 + Wbat 728.08 + payload 455 = 2772.07
      |               vs MTOW 2772.06                   [closes, P-05]
      |               *** BREAK: fuselage area correction squared (F-08) ***
      v
NUMERICAL RESULT      MTOW = 2772.06 kg
      |               *** BREAK: on a first-pass failure this is the L1 seed (F-01) ***
      v
GRAPH / DIAGRAM       ConvergenceTab: MTOW history last = 2772.1  OK
      |               T/W chart: 2016.8 flat            *** BREAK (F-G02) ***
      |               tolerance table: 2033.21          *** BREAK (F-G03) ***
      |               general arrangement wing station  *** BREAK: 66 % of MAC (F-G01) ***
      v
VALIDATION            validated status; nasa-configs.mjs scores Quad-E, SbS-E, L+C-E
      |               *** BREAK: identities.mjs cannot see F-04 (F-05) ***
      v
USER DISPLAY          App.jsx:1260 "MTOW" tile, colour-coded; StatusBar; PDF report
                      *** BREAK: the report's atmosphere and Re (F-06, F-07) ***
```

## Verdict per link

| link | traceable? |
|---|---|
| requirement -> design variable | **YES**, with F-19 (two entry paths) |
| design variable -> equation | **YES** — every equation has a file:line and most have a citation |
| equation -> implementation | **YES** for the sizing path; **NO** for six display paths (F-11, F-18, F-25, F-G02, F-G03, F-G06) |
| implementation -> numerical result | **YES** — mass and energy both close exactly |
| numerical result -> graph/diagram | **PARTIAL** — 4 of the audited charts and 1 of the drawings show a different aircraft |
| numerical result -> validation | **PARTIAL** — 16 of 467 outputs are `validated`; one net is blind to F-04 |
| everything -> user display | **PARTIAL** — the exported report contains two atmospheres and a self-contradicting Reynolds equation |

## No mystery numbers

Every value on the headline path was traced to an origin. The tool's provenance registry made this
materially easier than it would be in comparable code: 467 of 467 outputs carry a status, and an
unregistered key renders as "unregistered" rather than silently.

**The traceability failure in this codebase is not missing lineage — it is lineage that forks.**
A quantity is computed correctly once, then recomputed elsewhere for display from a different
basis, and both are shown. That is the through-line of F-06, F-07, F-11, F-18, F-19, F-23, F-24,
F-25, F-36, F-G01, F-G02, F-G03 and F-G10.
