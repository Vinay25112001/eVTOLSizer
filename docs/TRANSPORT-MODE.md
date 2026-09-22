# Transport aircraft sizing

Status: **preview.** A twin-engine jet airliner can be sized and analysed in
aircraft mode (`?mode=aircraft&type=transport`; [AIRCRAFT-MODE.md](AIRCRAFT-MODE.md)).
Business jets use this method with their own inputs (same document).
Turboprops have their own class: [TURBOPROP-MODE.md](TURBOPROP-MODE.md).

## What it computes

Two jobs:

- **Size from requirements.** Payload, design range, cruise Mach and
  altitude, and the take-off and landing field lengths give the wing area,
  thrust per engine, take-off weight, operating empty weight and mission
  fuel.
- **Analyse an existing aircraft.** Gross weight, wing area, thrust and fuel
  capacity give the FLOPS weight statement and the range that aircraft can
  fly at that weight.

## Method

### 1. Matching

This is Loftin's method (NASA RP-1060, chapter 3) in the SI form of Scholz's
Aircraft Design notes, chapter 5. Each equation was read from the rendered
page.

| Requirement | Equation | Sets |
|---|---|---|
| Landing | m_ML/S = 0.107 · σ · CLmax,L · s_LFL (Scholz 5.5), then ÷ m_ML/m_MTO (5.6) | wing loading (the landing limit is used) |
| Take-off | (T/mg)/(m/S) = 2.34 / (s_TOFL · σ · CLmax,TO) (5.10) | thrust |
| Second segment | T/mg = n/(n−1) · (1/E + γ), γ = 2.4 / 2.7 / 3.0 % for 2 / 3 / 4 engines (14 CFR 25.121(b)) | thrust |
| Missed approach | as above × m_ML/m_MTO, γ = 2.1 / 2.4 / 2.7 % (25.121(d)), gear down | thrust |
| Cruise | T/mg = 1/((T_CR/T_TO) · E), T_CR/T_TO from the bypass ratio (5.29) | thrust |

The climb checks use Loftin's polars: CD0 = 0.02, e = 0.7, flap drag
0.05·CL − 0.055 (5.21b), gear 0.015, CL = CLmax/1.44 at V2 and /1.69 on
approach.

Cruise drag comes from the aircraft's own wetted area: CD0 = 0.003 · S_wet/S,
and e = 0.85.

### 2. Weights

The weights use the FLOPS transport build-up (NASA/TM-2017-219627), ported
from NASA's Aviary code (Apache-2.0). The TM is misprinted in several places,
and Aviary was validated against FLOPS output.

**The port reproduces NASA's FLOPS output for a 737-800 model to within 0.1 %
on every one of 35 weights** (Aviary `large_single_aisle_2` data;
`validation/transport.mjs`).

### 3. Mission fuel and closure

Gross weight is iterated until fuel available equals fuel required, as FLOPS
does. There are two fuel methods:

- **loftin**: Wf/W = 1 − exp(−(R + ΔR)/B), with B = V·(L/D)/c at
  the average of start- and end-of-cruise L/D (RP-1060 pp.152-153).
  - There is no taxi or climb allowance.
  - Reserves are a 500 nm range increment. Loftin suggests "400 to 600
    miles".
- **regulatory**: Scholz Table 5.9 segment fractions (after Roskam), with
  14 CFR 121.639 reserves: an alternate, then 45 minutes at cruise
  consumption. This sizes the 737-800 about 20 % heavy, so the generic
  fractions are too heavy for this aircraft.
- **mission** (default since 2026-09-17): the flight is flown segment by segment.
  With the CFM56-7B27's compiled cruise TSFC (0.60 lb/lbf/h at M 0.80,
  35,000 ft; secondary) it sizes the 737-800 at +0.5 % take-off weight and
  gives the A320 range −0.4 %. Measured on 168 airliners it is the most
  accurate method (MAE 8.8 %).
  - Taxi at idle fuel flow, then take-off fuel as a fraction of gross weight.
  - Climb and descent are integrated in energy steps (Drela, TASOPT 2.00
    A.2.15). They follow 250 kt below 10,000 ft, then a CAS/Mach schedule.
  - Cruise is Breguet at the mean cruise weight.
  - Thrust and TSFC vary with Mach and height, following the shape of NASA
    Aviary's FLOPS turbofan deck.
  - Reserve policies:
    - `us-domestic`: 14 CFR 121.639
    - `us-flag`: 121.645(b)
    - `easa`: AMC/GM Part-CAT
    - `nbaa`: a business-jet convention known only from secondary sources
  - Holding is flown at the minimum-drag lift coefficient.

### 4. Cruise drag

- **equivalent-cf** (default): CD0 = c_f,eq · S_wet/S with c_f,eq = 0.003,
  and induced drag CL²/(πAe) with e = 0.85 (Scholz ch.5, after Loftin).
- **flops**: the FLOPS component build-up as NASA Aviary implements it
  (`flops-aero.js`). The terms are:
  - skin friction for each component, by the Sommer & Short T′ method at
    that component's Reynolds number;
  - FLOPS form factors, and laminar flow where it is specified;
  - 6 % excrescence drag, which FLOPS fixes;
  - compressibility drag from FLOPS's tables;
  - Delta-Method lift-dependent pressure drag (Feagin & Morrison, NASA
    CR-151971);
  - induced drag with FLOPS's span-efficiency input.

  The geometry is the one the FLOPS weights use. The drag is evaluated at
  every Mach and height the mission flies.

  **Check against FLOPS:** `validation/transport-aero.mjs` compares the
  build-up with drag polars printed by FLOPS for three transports, using
  Aviary's own measure (‖Δ‖/‖FLOPS‖):

  | Aircraft | All points | First 134 points |
  |---|---|---|
  | LSA1 | 0.9 % | 0.3 % |
  | N3CC | 0.8 % | 0.5 % |
  | LSA2 | 0.5 % | 0.5 % |

  The worst single points are off by up to 2 %.

  **Default aircraft:** on the default 737-800 inputs this drag gives cruise
  L/D 16.8, against 18.2 with the equivalent skin friction.

  **Why it is not the default:** measured against 142 airliners with the
  mission method, it raises the MTOW mean absolute error from 7.9 % to 12.4 %
  (both figures from that run, before the three-engine rows were added).
  Long-range aircraft come out 16 % heavy on average
  (eVTOL_Sizing_Research/datasets/validation-runs/PHASE2-RUNS-2026-09-17.md).

## Validation

Errors are computed live on the page and printed by the gate. At the time of
writing:

| Check | Error | Source |
|---|---|---|
| A320-200 operating empty weight | +0.4 % | Jenkinson (secondary); fuselage from Airbus AC |
| A320-200 range at MTOW | −3.6 % | Jenkinson |
| 737-800 operating empty weight, from the FLOPS model | +4.0 % | Boeing D6-58325-6 |
| 737-800 sized: take-off weight | +1.7 % | Boeing |
| 737-800 sized: wing area | +2.3 % | Boeing / Jenkinson |
| 737-800 sized: thrust per engine | +9.1 % | Boeing (CFM56-7B27 at 27,300 lb) |
| 737-800 sized: operating empty weight | +7.1 % | Boeing |
| 737-800 sized: fuel capacity | +3.5 % | Boeing |

The 737-800 requirements were read from Boeing's airport-planning charts:
- take-off field length 7,200 ft at 174,200 lb, sea level, standard day;
- landing field length 5,410 ft at 146,300 lb, flaps 40, dry.

**The 737-800 sizing is a consistency check, not an independent
prediction**: its CLmax values, tail ratios and geometry come from NASA's
FLOPS model of the same aircraft.

At the 737-800's weights, the model gives a range of 2,991 nm. The FLOPS
model's design range is 2,960 nm. Boeing's payload-range chart, with a
200 nm alternate and typical reserves, shows about 2,600–2,700 nm.

The bands in the gate were set after the first measurement. They are
regression bands, not accuracy claims.

## Options

- **Wing composite fraction** (FLOPS FCOMP, Eq 33, 35, 36): reduces the wing
  bending, shear/control and miscellaneous masses. FLOPS applies composites
  to the wing only; the 737-800 default is 0. Sources for real fractions:
  `eVTOL_Sizing_Research/classes/cross-class/COMPOSITES.md`.
- **Passengers carried** (optional): the payload flown when it is fewer than
  the seats, as for business jets. Absent means every seat.

## Not built yet

- Step cruise and cruise-climb.
- High-lift and landing-gear drag from the build-up: the matching still uses
  Loftin's flap and gear increments.
- Turboprops. The sources are in hand:
  - Scholz & Nita 2008 for matching (ATR 72 within 0.5 %);
  - the Hamilton Standard propeller weights in NASA CR-114399;
  - GASP Vol IV.
- Fuselage sizing from the cabin layout (FLOPS Appendix C).
- Balance and cost.
- Saving transport designs to design files.

## Sources

All are in `eVTOL_Sizing_Research/classes/transport/`:
- NASA/TM-2017-219627 (FLOPS weights);
- NASA RP-1060 (Loftin);
- Scholz, Aircraft Design notes ch.5 (HAW Hamburg, CC BY-NC-SA; equations
  cited, text not copied);
- 14 CFR 25 and 121 (eCFR);
- Boeing D6-58325-6;
- Airbus AC A320;
- EASA TCDS;
- Jenkinson companion tables;
- NASA OpenMDAO Aviary (Apache-2.0), including its `turbofan_24k_1` engine
  deck (cruise TSFC 0.65–0.68).
