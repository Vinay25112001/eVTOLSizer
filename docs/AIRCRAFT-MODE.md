# Aircraft mode: the fixed-wing sizing engine

The tool has two design modes. The **eVTOL | AIRCRAFT** switch next to the
title moves between them:

| Mode | What it sizes | Engine | Screen |
|---|---|---|---|
| **eVTOL** | the six eVTOL layouts | `src/engine.js` (unchanged) | the eVTOL sizer, 29 tabs |
| **Aircraft** | piston trainers, turboprop airliners, business jets, jet airliners | `src/classes/aircraft/engine.js` | the aircraft studio, 15 tabs |

**How the switch behaves**
- Switching does not reload the page.
- Each mode keeps its design while you are in the other one.
- The eVTOL sizer's numbers, inputs and tabs are the same as before. The gates check this:
  - the golden master;
  - the aircraft-class fence;
  - an import check that allows the eVTOL page only the switch itself.

**Addresses**
- `?mode=aircraft&type=transport`, `…&type=bizjet`, `…&type=turboprop` or `…&type=trainer` opens a type directly.
- Older `?class=trainer|transport|turboprop` links open the studio on that type.
- An unknown `?class=` shows an error page. It never opens the eVTOL sizer in its place.

## What the aircraft engine does

The engine does not duplicate any physics. Each type keeps its own validated sizing loop in its class folder:

| Type | Matching | Weights | Mission fuel | Gate |
|---|---|---|---|---|
| Piston trainer | Loftin (NASA RP-1060) | GASP (NASA CR-152303) | allowance, climb, Breguet, 45 min | `trainer.mjs` |
| Turboprop airliner | Scholz & Nita 2008 | FLOPS airframe + GASP engine + Hamilton Standard propellers | propeller Breguet with reserves | `turboprop.mjs` |
| Business jet | Loftin | FLOPS | segment mission with NBAA-style reserves | `bizjet.mjs` |
| Jet airliner | Loftin | FLOPS | segment mission (TASOPT A.2.15) with 14 CFR / EASA reserves | `transport.mjs`, `transport-mission.mjs`, `transport-aero.mjs` |

On top of those loops, the engine returns one result, in SI units, for every type. It then builds the same design views for all of them:

- **Matching chart:** every requirement drawn on wing loading against thrust-to-weight or power loading. The gate checks that the design point meets each curve and that one curve binds.
- **Mission:** fuel by segment, with reserves marked.
- **Weights:** every item of the class's weight method.
- **Aerodynamics:** the drag polar and L/D at the cruise point. For jets using `dragMethod: "flops"`, it also shows the FLOPS component drag build-up.
- **Payload-range:** built from the result's own fuel method and reserves.
  - The maximum-payload point at MTOW falls on the design range, to within 0.5 nm.
  - Maximum payload is taken to be the design payload, because a conceptual model has no MZFW.
- **Trade study:** a carpet over any two numeric inputs.
- **Sensitivity:** each numeric input moved by +5 %, one at a time. These cases run in chunks so the page stays responsive.
- **Compare types:** state one requirement (seats, range, cruise speed, runway) and every type is sized for it. Each result says whether real aircraft of that type have been built for it, using envelopes from the reference table.
- **Reality check:** the nearest real aircraft, plus where the design falls among its type on empty-mass fraction and wing loading.
- **Validation:** the class's published-aircraft checks, recomputed live.
- **Export:**
  - a design file (`.aircraft.json`), which reopens with today's engine;
  - a CSV of the results;
  - a print view.

**The error band on take-off mass.** The ± figure is the method's mean absolute error on real aircraft; it is not a statistical bound. The gate recomputes it from the validation rows:

| Type | Error band | Measured on |
|---|---|---|
| Trainer | 5.7 % | empty weight of 3 trainers |
| Turboprop | 7.1 % | operating empty mass of 3 aircraft |
| Business jet | 9.2 % | basic operating weight of 3 aircraft |
| Airliner | 8.8 % | take-off mass of 168 airliners sized from their own requirements |

## Reference aircraft

`src/classes/aircraft/reference-aircraft.js` holds 969 aircraft variants from the project's dataset library.

- Only values printed by the manufacturer or the regulator are kept.
- Each row names its source document and pages.
- The file is generated from `eVTOL_Sizing_Research/datasets/` and is not edited by hand.
- It loads only in aircraft mode.

## What makes this different

A survey of 17 conceptual design tools is in `eVTOL_Sizing_Research/classes/cross-class/TOOL-LANDSCAPE.md`. It includes FLOPS, GASP, Aviary, SUAVE/RCAIDE, FAST-OAD, OpenVSP, the Initiator, AAA, Piano and RDS. It found that none of them:

- runs in a browser;
- shows its validation error against real aircraft next to its results;
- sizes one requirement across aircraft classes;
- tracks where each input came from.

In addition, none of the open-source Python frameworks draws a thrust-to-weight/wing-loading constraint diagram.

Aircraft mode does all five, each covered by a gate.

## Business jets

The business jet uses the jet-airliner method with its own inputs (`src/classes/bizjet/`). The defaults are a Cessna Citation Latitude.

**How it differs from the airliner**
- Engines are on the aft fuselage, with a T-tail.
- Tail volumes use Scholz 2021's business-jet coefficients.
- Seats are counted as FLOPS first-class seats.
- Payload is the number of passengers the published range carries, which is fewer than the seats.

**Limits, stated in the app**
- NBAA IFR reserves have no public primary definition.
  - The `nbaa` policy flies the alternate distance set in the inputs, then a 30-minute hold.
  - Manufacturers quote 100 or 200 nm alternates.
- No free source gives cruise TSFC for any business-jet engine. The values are secondary compilations, or assumed.
- FLOPS was fitted on transports, from the T-39 Sabreliner to the 747. Its fit to business jets is measured here, not assumed.

**Validation (`validation/bizjet.mjs`)**

| Aircraft | Basic operating weight | Published range |
|---|---|---|
| Citation Latitude | +4.1 % | +12 % |
| Citation Longitude | −7.4 % | +22 % |
| Pilatus PC-24 | +15.3 % | −31 % |

The bands were set after this first measurement. Sources and method: `eVTOL_Sizing_Research/classes/business-jet/METHODS.md`.

## Files

| File | What it holds |
|---|---|
| `src/classes/Root.jsx` | the two modes |
| `src/classes/route.js` | addresses |
| `src/classes/aircraft/DesignModeSwitch.jsx` | the switch |
| `src/classes/aircraft/engine.js` | the engine |
| `src/classes/aircraft/AircraftStudio.jsx`, `tabs.jsx`, `charts.jsx` | the studio |
| `validation/aircraft-engine.mjs` | engine gate |
| `validation/studio-render.mjs` | every tab rendered for every type and both jobs |
| `validation/bizjet.mjs` | business-jet gate |
| `validation/aircraft-classes.mjs` | fence and addresses |
