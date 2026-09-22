# Trainer aircraft sizing

Status: **preview.** A light, single-engine piston trainer can be sized and
analysed in aircraft mode (`?mode=aircraft&type=trainer`; formerly `?class=trainer`, also linked from the ••• menu of the eVTOL
sizer). It is a separate workspace with its own inputs; the eVTOL sizer is
unchanged. Transport aircraft are not built yet.

## Why it was deferred, and what changed

An earlier version of this document (2026-09-16) recommended not building a
trainer mode. At that point only one published number could check it (the
Cessna 172S empty weight), and the only weight method with a general-aviation
branch in hand, FLOPS, gives a C172 an electrical system of about 433 lb and
furnishings of about 405 lb.

A wider search of free sources changed that:

- **GASP** (NASA CR-152303, 1978, volumes I–VI) is a general-aviation
  synthesis program. Its weight volume publishes calibration factors for
  small aircraft (Cessna 150, 172, 182, 210, Piper Arrow) for the wing,
  tails, fuselage, gear, flight controls and fuel system.
- NASA's open-source **Aviary** (Apache-2.0) implements GASP's weight
  equations, including general-aviation equipment branches. Its tests come
  from the original GASP program.
- **Loftin, NASA RP-1060** chapter 6 gives the sizing procedure for
  propeller-driven light aircraft, and its Table 5.I publishes gross and
  empty weights for more trainers.
- **Hamilton Standard, NASA CR-114289** gives a general-aviation propeller
  weight equation and checks it against real propellers.

That is enough to check the method against three aircraft, not one.

## What it computes

Two jobs:

- **Size from requirements.**
  - The stall speed sets the wing loading.
  - The cruise speed at the cruise power setting, and the sea-level climb
    rate, each set an engine power; the larger governs.
  - Component weights, mission fuel and payload are summed, and the gross
    weight is iterated until it moves less than 0.01 lb.
  - If the weight runs away past 10,000 lb (the end of the equipment
    equations), the loop stops and says so.
- **Analyse an existing aircraft.** Given gross weight, wing area, span,
  power and usable fuel, it predicts the component and empty weights, stall
  speed, climb rate and cruise power.

| Part | Method |
|---|---|
| Wing loading | Stall: W/S = ½ρV²C_Lmax |
| Power | Level-flight drag power at cruise; climb from Loftin (6.15) with e = η = 0.7 (p.347) |
| Power at altitude | Loftin Fig 6.28 (unsupercharged), read from the figure |
| Fuel | Start/taxi/take-off allowance (C172S POH: 1.4 gal); climb at the mid altitude; Breguet cruise (Loftin 6.40); reserve at cruise power |
| Wing, tails, fuselage, gear, controls, fuel system | GASP Vol V, with small-aircraft calibration factors |
| Engine, engine section | GASP V.1.3–4 (1.5 lb/hp), V.1.56 (0.338) |
| Propeller | Hamilton Standard, CR-114289 Table V |
| Fixed equipment | GASP general-aviation branches as implemented in Aviary |
| Tail areas | GASP Vol II tail-volume coefficients |
| Design speeds and loads | FAR 23 (pre-Amendment 64) as GASP computes them: V_C, V_D, 3.8 / 4.4 / 6.0 g, 23.341 gust |

Empty weight follows the certification convention of the validation aircraft:
it includes unusable fuel and full oil (FAA TCDS 3A12 says so for the 172S).

## Three misprints in GASP

The weight volume is printed wrongly in three places. The code follows
Aviary, whose GASP-derived tests it reproduces to 0.01%:

| Equation | Printed | Used | Evidence |
|---|---|---|---|
| V.1.69 wing material factor | 1 − 2.5/√(b/cos Λ) | **1 + 2.5/√(b/cos Λ)** | Aviary test 15,830 lb; with the printed sign a 737-200 wing is 40% light |
| V.1.74 fuselage | (ΔP+1)^0.2 U_LF^0.3 divide | **multiply** | Aviary test 18,763 lb; printed form ≈ 8,000 lb |
| V.1.63 horizontal-tail load | no fuselage length | **× fuselage length** | Aviary; a Cessna 150 tail is 7.5 lb without it, 39 lb with it |

The full check of every equation, with page numbers, is in the research
library: `eVTOL_Sizing_Research/classes/ga-trainer/VERIFIED_EQUATIONS.md`.

## Inputs

About fifty inputs, grouped as Mission, Requirements, Wing, Aerodynamics,
Propulsion, Fuselage, Tails and Weight factors. Each is marked:

- **S** sourced: the number is printed in the cited document;
- **D** derived: computed from sourced numbers;
- **A** assumed: no free document gives it; the value is a stated judgement.

Eleven inputs are assumed, for example wing taper, strut station and
fuselage width. The trainer gate prints how far each moves a C172S empty
weight across its range. The strut station and the fuselage width matter
most, about ±9% each.

## Validation

Empty weight predicted from each aircraft's published gross weight, wing and
engine:

| Aircraft | Published | Source |
|---|---|---|
| Cessna 172S | 1,663 lb | POH; TCDS 3A12 |
| Cessna Skyhawk (1976) | 1,350 lb | Loftin Table 5.I |
| Piper Cherokee 180 | 1,386 lb | Loftin Table 5.I |

The errors are computed live in the app and printed by
`validation/trainer.mjs`. At the time of writing they are −5.8%, +4.8% and
+6.5% (mean 5.7%).

A Cessna 172S sized from its own POH requirements came out:

| Quantity | Error |
|---|---|
| Gross weight | +2.2% |
| Wing area | +2.2% |
| Empty weight | −7.4% |
| Power | −11.9% |
| Usable fuel | −16.6% |

The power and fuel shortfall says the drag model (a single C_D0 of 0.0296,
Loftin's class II average) is more optimistic than the real aircraft.

The bands in the gate were set after the first measurement. They are
regression bands, not accuracy claims. The validated domain is three
four-seat, fixed-gear piston aeroplanes of 2,300–2,550 lb; the app flags a
design outside it.

## Not yet

- Electric trainers (Velis Electro: 600 kg MTOW, 428 kg design empty, 9.51 m²,
  2 × 11.0 kWh; EASA TCDS A.573 and POH). The pack mass is not published.
- Take-off and landing distances (Loftin gives these only as faired figures).
- A drag build-up (GASP Vol III has one; not yet implemented).
- Retractable gear, twins, turbines, pressurisation, balance.
- Saving trainer designs to design files and the gallery.
- Transport aircraft. The method is identified: Loftin's matching chart,
  fuel fraction and the FLOPS transport weights, closed on fuel. See
  `eVTOL_Sizing_Research/classes/transport/METHODS.md`.

No code from GPL-, LGPL- or AGPL-licensed tools (FAST-OAD, SUAVE, RCAIDE) is
used. Aviary (Apache-2.0) was read as the reference implementation of GASP.
