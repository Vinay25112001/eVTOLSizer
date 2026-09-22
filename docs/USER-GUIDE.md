# eVTOL Sizer — User Guide

This guide covers using the tool: what to enter, how to read the results, and
how to keep and share a design. For the methods behind the numbers, read the
theory manual ([THEORY.md](THEORY.md)). For how far the numbers can be
trusted, read [VALIDATION.md](../VALIDATION.md). To call the engine from a
script, see [API.md](API.md).

## 1. What the tool does, and what it is for

It sizes a vertical-lift aircraft for a mission you specify. It finds the
take-off mass at which the aircraft can carry its payload over the mission,
then reports its geometry, power, energy, weights, stability, loads, noise
and cost. It is a conceptual-design and teaching tool: NASA's software
classification calls this kind of tool Class E. Do not use its results for
decisions about an aircraft that will be built without further analysis.
Every result carries warnings that say so where it matters (section 4).

## 2. First run

The app opens on a design, not an empty form: a tilt-plus-lift hybrid with
twelve rotors, sized for Archer Midnight's published payload, range and
cruise speed. Change anything and the aircraft is re-sized as you type. The
bar at the bottom shows whether the sizing converged, the take-off mass,
closure margin, growth factor, payload fraction, and how many feasibility
checks pass.

The tabs are in five groups, in the order the work is usually done:

| Group | Shortcut | Tabs |
|---|---|---|
| **Design** | Ctrl+D | Overview, Mission, Mission Builder, Weather & Atmos, Wing & Aero, Propulsion, Battery, V-Tail |
| **Physics** | Ctrl+P | Convergence, Performance, Stability, W&B Envelope, V-n Diagram, Constraint Diagram, BEM Rotor |
| **Trades** | Ctrl+A | Design Space, Compare Layouts, Monte Carlo, Uncertainty, Cost |
| **Compliance** | Ctrl+Q | Certification, Noise, Reg Tracker |
| **Tools** | Ctrl+B | Components, Designs & References, NASA VSP Models, OpenVSP, Collaboration, AI Assistant |

Some tabs are hidden on layouts they do not apply to (a wingless multicopter
has no wing tab). The left and right arrow keys move between tabs in a group.

## 3. Entering a design

The left sidebar holds the inputs, in collapsible sections.

- **Aircraft configuration.**
  - *Powertrain:*
    - **Battery-electric:** the battery flies the mission.
    - **Turboelectric:** a turboshaft drives a generator that flies the mission. The battery is kept only for a landing after an engine failure. The turboelectric model has been compared with one published aircraft, so most turboelectric designs are flagged as outside the validated range.
  - *Layout:* multicopter, side-by-side, lift+cruise, tiltrotor, or one of two tilt-plus-lift hybrids. Picking a layout also applies that layout's rotor count, rotor diameter and other defaults. "Hybrid" here describes the rotor layout, not the powertrain.
- **Mission requirements.**
  - Payload, mission range (not counting the reserve) and cruise speed and altitude.
  - The energy reserve, set either by time or by distance.
- **Aerodynamics, propulsion, battery, structure and tail.** These are technology and design choices. Each slider's note says where its default comes from.

Undo and redo are Ctrl+Z and Ctrl+Y; **••• → Reset to defaults** returns to
the opening design.

## 4. Reading the results

**Provenance chips.** Most results carry a three-letter chip. Hover over it
to see the source.

| Chip | Meaning |
|---|---|
| **VAL** | validated: compared with published aircraft of this kind, with the error recorded |
| **SRC** | sourced: the method or value comes from a citable reference, but the result has never been compared with an aircraft |
| **DRV** | derived: calculated from other results, with no new assumption |
| **CAL** | calibrated: fitted to data; not a prediction |
| **UNV** | unverified: shown, but never checked against anything |

A chip depends on the powertrain: a battery mass validated on battery
aircraft is not validated on a turboelectric one.

**Warnings and limitations.** The line above the results summarises the
warnings the NASA models-and-simulations standard (NASA-STD-7009B)
requires. Open it to see every warning, grouped a to h, each with its
impact:

- (a) criteria not met
- (b) modelling omissions that affect this design
- (c) inputs or results outside the range the tool has been checked over
- (d) execution problems, such as a design that did not converge
- (e) whether the tool suits the intended use
- (f) problems with an opened design file
- (g) waivers
- (h) known errors measured on aircraft of this layout

The panel also says how uncertain the take-off mass is, and how that was
estimated.

- **Outside the validated envelope:** the design is larger, smaller, faster
  or of a different kind than every aircraft the tool has been compared
  with. Its error there has not been measured.
- **Did not converge:** no aircraft closes the mission. The numbers on screen
  are the last iteration, not a solution; do not use them.

The **Uncertainty** tab computes an error band on demand. It moves each
input by an amount set by that input's provenance and re-sizes the aircraft.
**Monte Carlo** samples ranges you enter.

## 5. Keeping a design

- **SAVE** (or Ctrl+S) stores the design in your account (this needs sign-in
  and a configured database). If the save fails, a red **NOT SAVED** notice
  says so.
- **••• → Download design file** writes a `.evtol.json` file. No account is
  needed. The file records:
  - every input;
  - the custom airfoil, if any;
  - the engine version that produced the results;
  - the results themselves.
- **••• → Open design file…** loads such a file. It replaces your current
  inputs rather than mixing with them, and re-sizes the design. The notice
  then says one of:
  - **Reproduced:** today's engine gives the same result.
  - **DIFFERENT result:** the engine has changed since the file was saved.
    The inputs are exactly as saved; the list shows which outputs moved.
  - **Saved before design files recorded every input:** an older save.
    Inputs it lacks are taken from today's defaults, not from your screen.
  - **Checksum mismatch:** the file was edited or damaged after saving.
- **Design Version History**, in the **Designs & References** tab (Tools),
  keeps local versions in the browser and reopens them the same way. The
  same tab holds the reference-aircraft gallery and published
  configurations; **Collaboration** runs shared live sessions.

## 6. Exports

From **•••**:

- **Export CSV** (needs sign-in): a table of the inputs and main results.
- **PDF Report:** the design report. It opens with the warnings and
  limitations section.
- **Export CPACS 3.5 (.xml):** the mass statement and reference values in
  DLR's open aircraft-data format, checked against the CPACS schema. No
  geometry is included.
- **Export requirements traceability (.csv):** one row per feasibility check,
  with the sources the check cites. A check that cites none says so.

The **OpenVSP** tab exports geometry for NASA's OpenVSP.

## 7. Scripts and other tools

The same engine runs from Node.js and from the `evtol-size` command, with
the warnings attached to every result. See [API.md](API.md).

## 8. Aircraft mode: fixed-wing aircraft

The **eVTOL | AIRCRAFT** switch beside the title changes the whole tool to the
fixed-wing sizing engine: its own inputs, its own 15 tabs (matching chart,
mission, weights, aerodynamics, propulsion, payload-range, trade study,
sensitivity, type comparison, warnings, validation, reality check against 969
real aircraft, export) and its own design files. Switching back returns to
the eVTOL design exactly as it was. The ••• menu also opens aircraft mode on a
type. Details: [AIRCRAFT-MODE.md](AIRCRAFT-MODE.md).

A light piston trainer: pick **Trainer** in aircraft mode (or
`?mode=aircraft&type=trainer`). It has its own inputs (stall speed, climb rate, cruise, range) and
two jobs: size a new trainer, or analyse an existing one from its gross
weight, wing and engine. Each input is marked S (sourced), D (derived) or A
(assumed); hover the marker for its source. The page ends with a live
validation table. Method, sources and limits: [CONVENTIONAL-MODE.md](CONVENTIONAL-MODE.md).

A twin-engine jet airliner: **Jet airliner** in aircraft mode. A business jet:
**Business jet** (defaults: Citation Latitude; NBAA-style reserves). It sizes from payload,
range, cruise Mach and runway lengths, or analyses an existing aircraft from
its gross weight, wing area and thrust, and shows the full FLOPS weight
statement. Method, sources and limits: [TRANSPORT-MODE.md](TRANSPORT-MODE.md).

A twin-turboprop regional airliner (ATR 72 or Dash 8-400 class): **Turboprop**
in aircraft mode. It
sizes on shaft power rather than thrust, finds the cruise altitude, and shows
its checks against the ATR and Dash 8 factsheets. It runs heavy on these
aircraft (see the page's warnings). Method, sources and limits:
[TURBOPROP-MODE.md](TURBOPROP-MODE.md).
Older `?class=trainer`, `?class=transport` and `?class=turboprop` links still work and open aircraft mode on that type.

## 9. What this tool will not tell you

It does not certify anything and produces no compliance data. It has not been
reviewed by anyone independent of its author. It models battery-electric and
turboelectric powertrains only: no parallel hybrids and no pure turboshaft
drive. Its cost model does not price fuel. Each limitation also appears as a
warning where it applies.
