# REGISTER RECONSTRUCTION — old against new, change by change

**Status** AUTHORITATIVE. Generated with the rebuilt register.
**Preserved original** `FORMULA-REGISTER-PRE-RECONSTRUCTION.md`

The reconstruction rule forbids patching the old rows. The register was rebuilt
from source evidence; this file is the audit trail between the two.

## Headline

| | old | new |
|---|---|---|
| rows with an output unit | 190 (14.8 %) | **363 (28.2 %)** |
| of the old 190, defensible | **129 (10.0 %)** | — |
| declared AMBIGUOUS rather than guessed | 0 | **135** |
| dimensional conflicts recorded | 0 | **6** |
| input-variable units | 908 / 5,055 (18.0 %) | **1048 / 3934 (26.6 %)** |
| truncated cells | 152 at the cap, 73 cut | **0** |

The old and new coverage figures are **not comparable**. 61 of the old 190 were
wrong (F-38). The comparable prior figure is 129.

## Every changed classification

| kind | rows |
|---|---|
| unchanged | 980 |
| **RETRACTED** — had a unit, now UNKNOWN or AMBIGUOUS | **51** |
| **CORRECTED** — had a unit, now a DIFFERENT unit | **32** |
| **GAINED** — had no unit, now derived | **225** |
| total changed | 308 |

### RETRACTED (51)

| ID | was | now | unit verification |
|---|---|---|---|
| FORMULA-AERO-024 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-040 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-041 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-093 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-111 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-181 | `W*h` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-AERO-187 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-190 | `W` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-AERO-216 | `K` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-AERO-226 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-232 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-AERO-290 | `1 (dimensionless)` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-BATTERY-023 | `N` | `UNKNOWN` | UNRESOLVED |
| FORMULA-GEOM-088 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-MISC-019 | `K` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-MISSION-035 | `m` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-MISSION-049 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-MISSION-053 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-MISSION-075 | `N` | `UNKNOWN` | CONFLICT |
| FORMULA-PROP-004 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-PROP-046 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-PROP-061 | `m` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-PROP-120 | `lb` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-PROP-130 | `m` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-PROP-144 | `kg` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-PROP-145 | `kg` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-REG-020 | `W` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-061 | `min` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-SIZING-120 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-203 | `m^2` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-240 | `%` | `UNKNOWN` | CONFLICT |
| FORMULA-SIZING-357 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-358 | `rad` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-378 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-381 | `kW` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-431 | `W` | `UNKNOWN` | UNRESOLVED |
| FORMULA-SIZING-432 | `W` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STAB-029 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STAB-053 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STAB-082 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STAB-101 | `kg` | `UNKNOWN` | CONFLICT |
| FORMULA-STAB-135 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STRUCT-031 | `kg/m^3` | `UNKNOWN` | CONFLICT |
| FORMULA-STRUCT-033 | `kg` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-STRUCT-170 | `1 (dimensionless)` | `UNKNOWN` | UNRESOLVED |
| FORMULA-STRUCT-186 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-WEIGHT-040 | `min` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-WEIGHT-121 | `kg` | `UNKNOWN` | AMBIGUOUS |
| FORMULA-WEIGHT-164 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-WEIGHT-205 | `m` | `UNKNOWN` | UNRESOLVED |
| FORMULA-WEIGHT-249 | `lb` | `UNKNOWN` | CONFLICT |

### CORRECTED (32)

| ID | was | now | unit verification |
|---|---|---|---|
| FORMULA-AERO-073 | `ft` | `1/ft` | DECLARED |
| FORMULA-AERO-135 | `1 (dimensionless)` | `1/rad` | DECLARED |
| FORMULA-AERO-180 | `m` | `km` | DECLARED |
| FORMULA-AERO-206 | `N` | `N/m` | DECLARED |
| FORMULA-GEOM-004 | `N` | `N*m` | DECLARED |
| FORMULA-PROP-098 | `m` | `1 (dimensionless)` | DERIVED |
| FORMULA-PROP-141 | `m` | `kW` | DERIVED |
| FORMULA-PROP-180 | `hp` | `lb/hp` | DECLARED |
| FORMULA-REG-016 | `rad` | `rad/s` | DECLARED |
| FORMULA-REG-027 | `K` | `1/rad` | DERIVED |
| FORMULA-REG-044 | `Pa` | `Pa*s` | DECLARED |
| FORMULA-REG-052 | `m` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-062 | `m` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-064 | `m` | `km` | DECLARED |
| FORMULA-SIZING-042 | `m` | `kg` | DERIVED |
| FORMULA-SIZING-119 | `kg` | `kg/(N*s)` | DECLARED |
| FORMULA-SIZING-152 | `m` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-172 | `1 (dimensionless)` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-263 | `kW` | `kW/kg` | DECLARED |
| FORMULA-SIZING-311 | `rad` | `1/rad` | DECLARED |
| FORMULA-SIZING-361 | `deg` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-371 | `N` | `N/kW` | DECLARED |
| FORMULA-SIZING-389 | `W*h` | `kW*h` | DECLARED |
| FORMULA-SIZING-391 | `W*h` | `kW*h` | DECLARED |
| FORMULA-SIZING-448 | `m` | `km` | DECLARED |
| FORMULA-SIZING-459 | `m` | `rad` | DERIVED |
| FORMULA-STAB-125 | `m` | `rad` | DERIVED |
| FORMULA-STRUCT-003 | `m` | `sqrt(m^2)` | DERIVED |
| FORMULA-STRUCT-013 | `ft^2` | `lb/ft^2` | DECLARED |
| FORMULA-STRUCT-220 | `N` | `N/m^2` | DECLARED |
| FORMULA-WEIGHT-179 | `m` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-180 | `m` | `1/sqrt(1 (dimensionless))` | DERIVED |

### GAINED (225)

| ID | was | now | unit verification |
|---|---|---|---|
| FORMULA-AERO-003 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-AERO-005 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-AERO-007 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-008 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-009 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-026 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-AERO-052 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-056 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-AERO-058 | `UNKNOWN` | `lbf/ft^2` | DECLARED |
| FORMULA-AERO-071 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-084 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-092 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-AERO-108 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-113 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-114 | `UNKNOWN` | `1/sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-AERO-115 | `UNKNOWN` | `1/sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-AERO-127 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-AERO-141 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-AERO-146 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-160 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-161 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-162 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-164 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-178 | `UNKNOWN` | `km/(m/s)` | DERIVED |
| FORMULA-AERO-179 | `UNKNOWN` | `m/s` | DECLARED |
| FORMULA-AERO-183 | `UNKNOWN` | `1 (dimensionless)` | CONFLICT |
| FORMULA-AERO-186 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-276 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-AERO-293 | `UNKNOWN` | `s` | DECLARED |
| FORMULA-AERO-294 | `UNKNOWN` | `s` | DECLARED |
| FORMULA-ATM-015 | `UNKNOWN` | `kg/kg` | DERIVED |
| FORMULA-BATTERY-006 | `UNKNOWN` | `%` | DECLARED |
| FORMULA-BATTERY-014 | `UNKNOWN` | `kg/kW*W` | DERIVED |
| FORMULA-BATTERY-015 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-BATTERY-021 | `UNKNOWN` | `sqrt(m^2)` | DERIVED |
| FORMULA-GEOM-074 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-GEOM-077 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-GEOM-084 | `UNKNOWN` | `m/s` | DECLARED |
| FORMULA-GEOM-150 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-GEOM-152 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-014 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-015 | `UNKNOWN` | `Hz` | DECLARED |
| FORMULA-MISC-036 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-MISC-037 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-MISC-038 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-MISC-049 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-MISC-057 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-058 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-060 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-061 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-062 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-MISC-063 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-MISC-064 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-MISC-074 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISC-089 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-017 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-031 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-046 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-066 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-082 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-084 | `UNKNOWN` | `N` | DERIVED |
| FORMULA-MISSION-086 | `UNKNOWN` | `N` | DERIVED |
| FORMULA-MISSION-137 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-138 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-MISSION-158 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-PROP-011 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-PROP-015 | `UNKNOWN` | `km` | DECLARED |
| FORMULA-PROP-025 | `UNKNOWN` | `sqrt(1/1 (dimensionless))` | DERIVED |
| FORMULA-PROP-038 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-PROP-073 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-PROP-078 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-PROP-079 | `UNKNOWN` | `lb*1/1 (dimensionless)` | DERIVED |
| FORMULA-PROP-084 | `UNKNOWN` | `ft^3*kg/m^3` | DERIVED |
| FORMULA-PROP-086 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-PROP-093 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-PROP-100 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-PROP-101 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-PROP-107 | `UNKNOWN` | `sqrt(1/1 (dimensionless))` | DERIVED |
| FORMULA-PROP-114 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-PROP-117 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-PROP-118 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-PROP-124 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-PROP-137 | `UNKNOWN` | `rad/s` | DERIVED |
| FORMULA-PROP-169 | `UNKNOWN` | `kg/m^2*m^2` | DERIVED |
| FORMULA-PROP-172 | `UNKNOWN` | `kg/m^2*m^2` | DERIVED |
| FORMULA-PROP-194 | `UNKNOWN` | `kW*h` | DERIVED |
| FORMULA-PROP-195 | `UNKNOWN` | `kW*h` | DERIVED |
| FORMULA-REG-009 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-014 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-022 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-REG-024 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-025 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-026 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-REG-034 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-036 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-037 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-039 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-040 | `UNKNOWN` | `1/rad*rad/s` | DERIVED |
| FORMULA-REG-043 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-046 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-047 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-048 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-054 | `UNKNOWN` | `m` | DERIVED |
| FORMULA-REG-055 | `UNKNOWN` | `Hz` | DECLARED |
| FORMULA-REG-061 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-063 | `UNKNOWN` | `Hz` | DERIVED |
| FORMULA-REG-066 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-068 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-REG-070 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-013 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-026 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-027 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-035 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-041 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-069 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-SIZING-074 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-SIZING-078 | `UNKNOWN` | `1/lb` | DERIVED |
| FORMULA-SIZING-091 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-108 | `UNKNOWN` | `1/sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-SIZING-110 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-112 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-121 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-123 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-137 | `UNKNOWN` | `ft^3` | DECLARED |
| FORMULA-SIZING-139 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-SIZING-145 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-157 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-167 | `UNKNOWN` | `m/s` | DERIVED |
| FORMULA-SIZING-168 | `UNKNOWN` | `m/s` | DERIVED |
| FORMULA-SIZING-173 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-181 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-SIZING-195 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-197 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-212 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-220 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-222 | `UNKNOWN` | `m/s` | DERIVED |
| FORMULA-SIZING-223 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-243 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-SIZING-247 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-SIZING-256 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-276 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-286 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-SIZING-292 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-293 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-312 | `UNKNOWN` | `m` | DECLARED |
| FORMULA-SIZING-313 | `UNKNOWN` | `m` | DERIVED |
| FORMULA-SIZING-318 | `UNKNOWN` | `m` | DERIVED |
| FORMULA-SIZING-327 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-328 | `UNKNOWN` | `m^2` | DERIVED |
| FORMULA-SIZING-330 | `UNKNOWN` | `m^2` | DERIVED |
| FORMULA-SIZING-336 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-SIZING-339 | `UNKNOWN` | `m^2*1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-344 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-SIZING-349 | `UNKNOWN` | `sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-SIZING-352 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-355 | `UNKNOWN` | `m` | DERIVED |
| FORMULA-SIZING-370 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-442 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-444 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-451 | `UNKNOWN` | `kW` | DERIVED |
| FORMULA-SIZING-454 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-SIZING-477 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-SIZING-478 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-006 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-007 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-008 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-009 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-010 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-011 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-014 | `UNKNOWN` | `L^2` | DECLARED |
| FORMULA-STAB-024 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-031 | `UNKNOWN` | `1/Hz` | DERIVED |
| FORMULA-STAB-049 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-STAB-050 | `UNKNOWN` | `rad` | DERIVED |
| FORMULA-STAB-054 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-072 | `UNKNOWN` | `m/s` | DERIVED |
| FORMULA-STAB-078 | `UNKNOWN` | `deg` | DECLARED |
| FORMULA-STAB-079 | `UNKNOWN` | `deg` | DECLARED |
| FORMULA-STAB-080 | `UNKNOWN` | `deg` | DECLARED |
| FORMULA-STAB-086 | `UNKNOWN` | `m/s` | DECLARED |
| FORMULA-STAB-087 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-088 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-091 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-093 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-094 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-095 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-096 | `UNKNOWN` | `rad` | DECLARED |
| FORMULA-STAB-099 | `UNKNOWN` | `m/s` | DERIVED |
| FORMULA-STAB-124 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-133 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STAB-153 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STRUCT-001 | `UNKNOWN` | `ft` | DERIVED |
| FORMULA-STRUCT-004 | `UNKNOWN` | `ft` | DERIVED |
| FORMULA-STRUCT-007 | `UNKNOWN` | `1/lb` | DERIVED |
| FORMULA-STRUCT-029 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-STRUCT-035 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STRUCT-044 | `UNKNOWN` | `kt` | DERIVED |
| FORMULA-STRUCT-049 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STRUCT-050 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-STRUCT-080 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-STRUCT-103 | `UNKNOWN` | `m^2` | DECLARED |
| FORMULA-STRUCT-108 | `UNKNOWN` | `deg` | DECLARED |
| FORMULA-STRUCT-126 | `UNKNOWN` | `ft^2` | DERIVED |
| FORMULA-STRUCT-130 | `UNKNOWN` | `sqrt(m^2)` | DERIVED |
| FORMULA-STRUCT-155 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-015 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-WEIGHT-017 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-018 | `UNKNOWN` | `sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-WEIGHT-020 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-021 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-022 | `UNKNOWN` | `sqrt(1 (dimensionless))/sqrt(1 (dimensionless))` | DERIVED |
| FORMULA-WEIGHT-038 | `UNKNOWN` | `sqrt(Pa/(kg/m^3))` | DERIVED |
| FORMULA-WEIGHT-042 | `UNKNOWN` | `W` | DERIVED |
| FORMULA-WEIGHT-054 | `UNKNOWN` | `deg` | DECLARED |
| FORMULA-WEIGHT-106 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-WEIGHT-107 | `UNKNOWN` | `kg` | DERIVED |
| FORMULA-WEIGHT-127 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-131 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-WEIGHT-143 | `UNKNOWN` | `ft/ft*ft^2` | DERIVED |
| FORMULA-WEIGHT-151 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-WEIGHT-152 | `UNKNOWN` | `lb` | DERIVED |
| FORMULA-WEIGHT-157 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-159 | `UNKNOWN` | `1 (dimensionless)` | DECLARED |
| FORMULA-WEIGHT-178 | `UNKNOWN` | `1 (dimensionless)` | DERIVED |
| FORMULA-WEIGHT-279 | `UNKNOWN` | `1/1 (dimensionless)` | DERIVED |

## Conflicts recorded by the reconstruction

| ID | file:line | inside | conflict |
|---|---|---|---|
| FORMULA-AERO-183 | `src/engine/profile.js:194` | (module) | dimensional conflict: kW*h - 1 (dimensionless) |
| FORMULA-MISSION-075 | `src/classes/transport/mission.js:223` | (module) | F-38 hand verdict: this unit was read from the name and is WRONG; the equation computes `kg` |
| FORMULA-SIZING-240 | `src/engine.js:1216` | runSizingCore | F-38 hand verdict: this unit was read from the name and is WRONG; the equation computes `kW*h` |
| FORMULA-STAB-101 | `src/engine/autorotation.js:76` | rotorInertia | F-38 hand verdict: this unit was read from the name and is WRONG; the equation computes `kg*m^2` |
| FORMULA-STRUCT-031 | `src/classes/aircraft/flight-envelope.js:223` | flightEnvelope | F-38 hand verdict: this unit was read from the name and is WRONG; the equation computes `slug/ft^3` |
| FORMULA-WEIGHT-249 | `src/engine/weights.js:246` | componentWeights | the name says `lb`, the expression computes `1 (dimensionless)` |

**No conflict here is a demonstrated repository defect.** Four successive triage
rounds reduced the reported conflicts 13 -> 12 -> 8 -> 4 -> 1, and every removal
was a defect in the analyser rather than in the code (N-16). Each remaining entry
must survive that triage before it is treated as a finding about the repository.

## What this reconstruction does NOT establish

The dimensional-corruption test stands at **1 caught of 8 injected errors** (N-18).
Of the relations the analyser can fully dimension none contradicts itself, and it
can fully dimension too few of them for that to certify the tree. **Nothing here
supports a claim that the repository is dimensionally consistent.**

