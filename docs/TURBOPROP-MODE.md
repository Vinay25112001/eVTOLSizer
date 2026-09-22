# Turboprop transport sizing

Status: **preview.** A twin-turboprop regional airliner (ATR 72, Dash 8-400
class) can be sized and analysed in aircraft mode (`?mode=aircraft&type=turboprop`; formerly `?class=turboprop`, also linked from the
••• menu of the eVTOL sizer). It is a separate workspace with its own inputs;
the eVTOL sizer and the jet transport are unchanged.

## What it computes

- **Size from requirements.** Payload, design range, cruise Mach and the
  take-off and landing field lengths give the wing area, take-off shaft power
  per engine, take-off mass, operating empty mass, mission fuel and the
  cruise altitude.
- **Analyse an existing aircraft.** Take-off mass, wing area, power per
  engine and fuel capacity give the mass statement and the range at that mass.

## Method

The research is in `eVTOL_Sizing_Research/classes/transport/METHODS.md` §9.
Every equation below was read from the rendered page.

### 1. Matching (Scholz & Nita 2008, "Preliminary Sizing of Large Propeller Driven Aeroplanes")

The jet method on power instead of thrust, with factors refitted to
turboprops. SI units; power per unit take-off mass in W/kg.

| Requirement | Equation | Sets |
|---|---|---|
| Landing | m_MTO/S = 0.137 · σ · CLmax,L · s_LFL / (m_ML/m_MTO) | wing loading |
| Speeds | V_APP = 1.64 √s_LFL; V_S,L = V_APP/1.3; V_S,TO = V_S,L √(CLmax,L/CLmax,TO); V2 = 1.2 V_S,TO | |
| Take-off | P/m = (m/S) · 2.25 · (V2/√2) · g / (s_TOFL · σ · CLmax,TO · η_TO) | power |
| Second segment | P/m = n/(n−1) · (1/E + γ) · V2 · g / η_CL, γ from 14 CFR 25.121(b) | power |
| Missed approach | P/m = n/(n−1) · (1/E + γ) · V_APP · g / η_CL · m_ML/m_MTO, γ from 25.121(d) | power |
| Cruise | P/m = M · a(H) · g / ((P/P0) · E · η_CR), with m/S = CL · M² · 0.7 · p(H)/g | power, cruise altitude |

Climb polars: CD = 0.05·CL − 0.035 (+0.015 gear on the missed approach) +
CL²/(πA·0.7), at CL = CLmax,TO/1.2² and CLmax,L/1.3². Cruise: Emax = 11.22
√(A/(S_wet/S)), with S_wet from the FLOPS geometry, and E = 2 Emax/(CLmd/CL +
CL/CLmd). Power lapse: P/P0 = A M^m σ^n (Table 1; the "average" row is the
paper's recommendation).

The paper reports the cruise altitude as an output. Here it is the altitude
(up to the ceiling input) at which cruise needs the least power. At the
paper's ATR 72 wing loading, its altitude of 3,888 m needs within 0.3% of
that least power, and the lift equation there gives its CL of 0.503.

Propeller efficiencies are inputs (take-off 0.64, climb 0.73, cruise 0.86,
from the paper's ATR 72 example). The paper reads them from a chart (its
Fig. 7). That chart is not an actuator-disk curve and was not digitised.

### 2. Masses

- **Airframe, systems and operating items:** FLOPS (NASA/TM-2017-219627),
  the same port as the jet class.
  - FLOPS's thrust-based small items (engine controls, starter, oil,
    unusable fuel) take an equivalent static thrust of 3.5 lbf per shp. That
    is the ratio in NASA's FLOPS model of the ATR 42 (Antcliff et al. 2016).
  - The APU is an input: ATR has none as standard; the Dash 8-400 manual lists
    63 kg.
  - Cargo containers are off: both types load baggage in bulk.
- **Engines:** dry mass = lb per shp × take-off shp (GASP, NASA CR-152303
  Vol V, V.1.4). The default 0.386 lb/shp is the PW127M's 481.7 kg at
  2,051 kW (EASA TCDS IM.E.041). GASP's own default is 0.5.
- **Engine sections (nacelle, pylon):** 0.338 × engine (GASP V.1.56).
- **Propellers:** Hamilton Standard's equation, NASA CR-114399 Table II,
  types 1–5. The default is type 5, fibreglass reversing.
- **No thrust reversers.**

### 3. Fuel and closure

- **Default method, "breguet":** cruise, then an 87 nm alternate, then a
  45-minute hold (14 CFR 121.639).
  - Each segment uses the propeller Breguet equations, B = E·η/(SFC·g).
  - There is no allowance for start, taxi or climb.
- **Alternative, "roskam":** the same, plus Roskam's turboprop segment
  fractions as quoted by Nita (2008, Table 3.5). These put about three times
  the manufacturer's block fuel on a 200 nm stage, and the page says so when
  the method is selected.
- **Closure:** gross mass is iterated until fuel available equals fuel
  required.

## Validation (validation/turboprop.mjs, printed every run)

- **Implementation.** The matching reproduces Scholz & Nita's ATR 72 values:
  - climb CL 1.46 and 1.48; climb L/D 12.28 and 10.79;
  - wing loading 373.7 kg/m² (to 0.3%); take-off power 179.8 W/kg (to 0.8%);
  - Emax 15.74 and cruise L/D 12.49.

  The propeller equation reproduces CR-114399's own class V weights to 3%:
  DHC-7, 1500 HP, HP 137, Twin Otter.
- **Published aircraft,** analysed at their certified mass, wing and power:

  | Check | Error |
  |---|---|
  | ATR 72-600 operating empty mass | +14.8% |
  | ATR 42-600 operating empty mass | +4.4% |
  | Dash 8-400 operating empty mass | +2.0% |
  | ATR 72 block fuel, 200 nm / 300 nm | −4.6% / +4.6% |
  | ATR 42 block fuel, 200 nm / 300 nm | −14.9% / −6.3% |
  | Dash 8-400 trip fuel, 200 nm / 500 nm | +14.3% / +37.6% |

- **ATR 72 sized from the Scholz & Nita requirement** (715 nm, 6,460 kg,
  1,290 m take-off, 1,067 m landing): take-off mass +11.4%, wing +11.6%,
  power +12.1%, operating empty mass +20.3%.
- **Mutation testing:** the gate catches all 11 deliberate code faults.

Bands were set after the measurement. They are regression bands, not
accuracy claims.

## Known limits

- **FLOPS was fitted to jet transports** and puts turboprops heavy.
  - NASA saw the same on the ATR 42 (Antcliff et al. 2016) and calibrated
    FLOPS to it. No calibration is applied here.
  - Most of the excess is in FLOPS's systems, furnishings and operating
    items.
  - The only public real-turboprop group weight statement found (Convair
    CV600, NASA CR-152364) gives no geometry to test against.
- **The Dash 8-400's fuel is overestimated.** It flies faster and higher than
  the ATR, and the generic 0.5 lb/hp/h consumption and the lapse fit do not
  describe the PW150A.
- **The ATR 72 example appears to use a lapse row other than "average".**
  Its cruise matches the Schaufele row; the "average" row needs about 10%
  less cruise power.
- **Inputs marked assumed:** sweep, taper, thickness, tail areas, blade
  activity factor, fuel tanks, empty margin, APU mass.
- **Not modelled:** propeller maps, hot or high take-off, climb as flown,
  drag build-up, fuselage sizing, balance, noise, cost.

## Sources

Held in `eVTOL_Sizing_Research/classes/transport/sources/` and its
`turboprop/` folder:

- **Method papers:** Scholz & Nita 2008 (paper and presentation); Nita 2008
  (HAW Hamburg project); Scholz, *Aircraft Design* notes ch.5 and ch.10.
- **Manufacturer and type data:** ATR 72-600 and 42-600 factsheets (2020);
  De Havilland Dash 8-400 specification sheet (2026) and airport planning
  manual; EASA TCDS A.084, IM.A.191, IM.E.041, IM.E.049, P.002.
- **NASA reports:** TM-2017-219627 (FLOPS); CR-152303 Vol V (GASP);
  CR-114399 (propellers); CR-152364 (CV600).
- **Other studies:** Antcliff et al. AIAA 2016-1028; Pham et al. 2023.
- **Code:** NASA Aviary (Apache-2.0).
