# Validation Programme — every formula cited, every subsystem checked

**Started 2026-09-10. This is a programme, not a task.** The request was to
validate every configuration's physics, every sizing loop and every formula
against published sources — stability (static, dynamic, longitudinal,
lateral, gust), battery, wing, tail, landing gear, fuselage, propeller, and
rotor-count sensitivity — to the standard a manufacturer applies before
committing tooling. This document is the honest baseline, the framework, and
the order of work. Nothing in it is a promise that the work is done.

---

## 1. Where the tool stands today (measured, `node validation/provenance-report.mjs`)

| | count | share |
|---|---|---|
| engine outputs emitted | 409 | |
| registered in provenance | 379 | 93% |
| **validated** — compared numerically to a published aircraft | **14** | **3%** |
| calibrated | 6 | 2% |
| sourced — traced to a citation, not numerically checked | 125 | 33% |
| derived — arithmetic on other outputs | 166 | 44% |
| **unverified** | **68** | **18%** |
| **unregistered** — nobody has classified them | **31** | |
| inputs unverified | 28 of 80 | 35% |

**135 `[SRC]` tags across 16,857 lines in 30 engine modules.** That is one
citation per 125 lines. The number that matters for the manufacturer's
question is the first bold one: **3% of what the tool emits has ever been
checked against a real aircraft.**

### The 68 unverified outputs, by subsystem

| subsystem | unverified outputs | count |
|---|---|---|
| **Tail sizing** | Svt_total, Svt_panel, Sh_req, Sv_req, pitch_ratio, yaw_ratio, delta_rv_deg, delta_yaw_rv_deg, Wvt_total, bvt_panel, sweep_vt, vtGamma_opt, governs_pitch, ruddervator_combined_auth, Sh_eff, Sv_eff, Cr_vt, Ct_vt, MAC_vt, Srv, CD0vt, lv, tailWingRatio | **23** |
| **Battery pack** | Nseries, Npar, Ncells, PackV, PackAh, CrateHov, CrateCr, Pheat, SEDpack, PheatCruise, bmsMassKg, packContainmentKg, regenCredited | **13** |
| **Propeller / motor** | RPM, ChordBl, BladeAR, Torque, MotMass, PmotKW, Nbld, tipDeflectionOK, nPropHover, propDiam | **10** |
| **Stability** | smMin, smMax, targetSM, xRotFwd, xRotAft, wingLEfrac | 6 |
| **V-n envelope** | Vstall, VA, VD, vnData | 4 |
| Mission | rpData, ferryRange, maxPayloadRp, cruiseDutyFrac | 4 |
| Acoustics | dBA_500m, bpfHarmonics, noise_sensitivity | 3 |
| Other | aileronAreaM2, etaH, fusSpanRatio, checks, feasible | 5 |

The three biggest clusters are three of the subsystems named in the request.

---

## 2. The framework: NASA-STD-7009B

The standard for exactly this question is **NASA-STD-7009B, Standard for
Models and Simulations** (on disk as `7009B.txt`). Its capability assessment
has five factors, verbatim from §4:

> "The five factors are: M&S Data Pedigree, M&S Verification, M&S
> Validation, M&S Development Technical Review, and M&S Development
> Process/Product Management"

Mapped onto this repository:

| 7009B factor | what it means here | current state |
|---|---|---|
| **Data pedigree** | every constant traces to a primary source, with the source's own stated uncertainty | 135 `[SRC]` tags; 68 outputs and 28 inputs without one |
| **Verification** | the code computes what the cited formula says (the golden master, the components harness, the identities gate) | 42 gates; `components.mjs` tests models at published inputs; `citations.mjs` checks every regulatory paragraph against the corpus |
| **Validation** | the model's outputs agree with real aircraft | 14 outputs, NASA Table 12 (39 comparisons, 14.5% mean), commercial (11 metrics, 14.0%) |
| **Technical review** | an independent reader has checked the method against the literature | the research-before-engineering rule; paper reviewers; this document |
| **Process management** | changes are traceable, tests run before deploy, results reproduce | 125 commits, gated deploy, `paper-claims.mjs` |

The programme below is organised so that each item moves a row of the
provenance census from *unverified* to *sourced*, and where a published
aircraft exists, to *validated*.

---

## 3. What was found on the first day, and fixed

Working the request end to end for one day produced these. Each is a
commit; each is gated.

1. **The cabin was decoupled from its payload** — `fusLen` and `payload`
   were independent sliders. On the multicopter that was a 25% MTOW lever
   with nothing behind it: a 2.43 m body carrying five occupants, and no
   objection. Fixed with a floor-area constraint; occupant mass from
   NASA/20180006683 (*"6 occupants at 1200 lb total"*); floor area from
   nine cabins (eight from Yang et al. 2024 Table 4, one CAD-measured).
2. **Raymer's wetted-area equation was evaluated where it is undefined** —
   below fineness 2.0 its `(1−2/λ)^⅔` term is a fractional power of a
   negative, i.e. `NaN`; at fineness 2.18 it under-counts wetted area by
   **3.7×**. The in-loop path used the safe helper; the post-loop path did
   not. A gate now fails any open-coded occurrence.
3. **The rotor disc was drawn below the cabin roof** on every rotor-borne
   layout (arm plane at 0.34·width; body half-height is 0.5·width). Fixing
   it moved a published physics result: side-by-side M_q −0.49→−0.41,
   L_p −5.75→−5.40. The paper-claims gate caught it.
4. **No gust envelope exists**, and none can be cited. MOC VTOL.2215 is
   manoeuvre-based (pull-up/pushover at V_D, "suddenly" = 0.2 s) with no
   discrete gust velocity; MOC VTOL.2135 states *"The exact values of the
   gusts are currently not defined for each AD level."* The V-n caps 3.5 /
   −1.5 had no source; the certified **minima** are +2.0 / −0.5 (MOC
   VTOL.2200(f), verbatim). Now cited, the caps labelled unsourced, the
   gust absence reported on the output rather than filled with a CS-23
   proxy.
   **CORRECTED 2026-09-16: the premise of this item was wrong.** MOC
   SC-VTOL Issue 2, VTOL.2215(f), gives discrete gust velocities of 9.14,
   15.24 and (Category Enhanced) 20.12 m/s; the "currently not defined"
   sentence is MOC VTOL.2135, the handling-qualities MOC. `loadcases.js` had
   sized the wing to those gusts all along. Since `14b8ead` the V-n tab and
   the report draw them, and since `f794522` the manoeuvre caps are sidebar
   inputs floored at +2.0 / −0.5.
5. **Yang et al. 2024 was on disk the whole time** (`Multi_1.txt`) while
   MDPI refused every fetch. Its Table 4 caveat is itself a finding:
   *"dimensions for existing models are inferred from images using a scale
   method"* — the fineness range this tool has cited since August rests on
   image estimates.

---

## 4. The programme, in order

Ordered by (a) size of the unverified cluster, (b) whether a primary source
is already on disk, (c) whether a published aircraft exists to validate
against. Each phase ends with a gate.

### Phase A — Tail sizing (23 unverified; the largest cluster)

*Sources on disk:* NDARC Theory §10 (tail geometry), Malpica/Suh/Silva
handling qualities, RAVEN `.vsp3` (measured tail), Joby S4 (89 FR 17230).
*Method to cite:* volume-coefficient sizing — Raymer Ch. 6 Table 6.4 for
V_HT, V_VT by class; NDARC's own tail model. *Validate against:* Joby S4
V-tail (published span), NASA L+C reference vehicle tail (`.vsp3`).
*Rotor-borne layouts:* no tail; the gate must assert the outputs are
absent, not zero.

### Phase B — Battery pack (13 unverified)

*Sources on disk:* NDARC battery model (TP-20220000355 §, and Johnson &
Silva 2022 *"Internal resistance reduces battery efficiency at high
discharge rates"*), Antcliff 2019 (*"Current delivery limits for cells are
specified as a C-rate"*), NASA S3270 (*"C-rate never an active sizing
constraint, even in vertical flight"*). *Open item already recorded:*
`cRateDerate` is a flat 8% across a 1.17–3.92 C spread and carries 55%
leverage on multicopter MTOW; no citable capacity-vs-C-rate curve is in
the corpus. **That curve is the single highest-leverage missing source in
the tool.** *Validate against:* Joby S4 pack (published), Table 12 pack
energies (already scored: +212% on VX4 flagged as ours).

### Phase C — Propeller / rotor (10 unverified) and rotor-count sensitivity

*Sources on disk:* NDARC rotor performance, CAMRAD II, NASA multicopter
wind-tunnel data (`multicopter.txt`, Russell et al.), Yang 2024 (boom mass
= 4.8·m_r coplanar, 9.6·m_r coaxial). *The rotor-count question* ("2, 3, 4,
5, 6, 32 … what changes"): a sweep harness exists for geometry only
(`geometry-export.mjs`, 4/6/8). The physics sweep — MTOW, disk loading,
rotor diameter, boom mass, hover power, OEI margin, ACAI controllability,
noise — against N is **not built** and is the deliverable of this phase.
Every factor that moves with N is already computed somewhere in the
engine; the harness has to hold them side by side and cite what drives
each.

### Phase D — Stability: static, dynamic, longitudinal, lateral

*What exists:* static margin, neutral point, C_m_α, C_l_β, phugoid and
short-period estimates for winged layouts; hover dynamics (L_p, M_q, Z_w)
for all six, ranked against Malpica/Suh/Silva. *What is missing:* Dutch
roll, spiral and roll modes (one mention each, no computation); no
lateral-directional derivative set; no ADS-33 / MIL-F-8785 level
classification of the modes; nothing for the **transition corridor**
(already a known open item). *Sources on disk:* Malpica (526 KB),
DOT/FAA/TC-23/59 (332 KB), NDARC. *Not on disk:* MIL-F-8785C, ADS-33E-PRF
level boundaries — must be fetched; DTIC was down 2026-09-10.
*Per-configuration:* the winged layouts and the rotor-borne layouts have
different physics here and the gate must not score a multicopter on a
fixed-wing mode.

### Phase E — Gust

> **Status 2026-09-16:** the premise below is superseded — an eVTOL gust
> specification exists (MOC VTOL.2215(f); see the correction to §3 item 4),
> and the sharp-edged gust with the alleviation factor K_g is implemented
> in `engine/loadcases.js` and gated by `npm run loadfactor`. What remains
> open is the (1−cos) dynamic response the MOC's gust shape implies and the
> manoeuvre case described below; the text is kept as it was planned.

There is no eVTOL gust specification (§3, item 4). The honest deliverable
is not a gust line but a **manoeuvre-based load case per MOC VTOL.2215**:
symmetric pull-up and pushover at V_D, 0.2 s input, evaluated per layout,
with the resulting load factor compared against the applicant's proposed
cap. That is what the regulation actually asks for, and it is computable
from the hover-dynamics derivatives the tool already has.

### Phase F — Landing gear, fuselage, wing

*Landing gear:* `landinggear.js` has 8 `[SRC]` tags (CS-27 drop test).
Missing: skid gear as a type at all — every layout draws wheeled tricycle
gear. *Fuselage:* the payload^⅓ scaling law is anchored on Joby S4 alone
and is contradicted by the nine-cabin population (predicts 5.40 m where
EHang 216 measures 2.3 m); needs replacing with the floor-area model, which
is its own commit. *Wing:* wing loading is per-aircraft (Joby 1524, Archer
1371); `wingbox.js` has 6 `[SRC]`; the sizing-conditions harness covers it.
Lowest priority of the six because it is the best-sourced already.

### Phase G — The formula registry

The request was "cite each and every formula." The only way to make that
checkable is a **registry**: a gate that walks every arithmetic expression
in `src/engine/` that assigns a physical quantity and demands a `[SRC]` or
`[LAY]` tag within N lines, failing on any bare number. That is the
7009B *data pedigree* factor made mechanical. It will fail on first run —
that is its purpose — and the count it reports is the programme's
progress metric.

---

## 5. What this cannot honestly promise

- **Validation needs published aircraft.** There are three all-electric
  vehicles in NASA Table 12 and a handful of certification-basis documents
  (Joby's 89 FR 17230). Most subsystems have no public number to validate
  against; the best achievable state for those is *sourced*, not
  *validated*, and the census will say so.
- **Some sources are not reachable from this machine.** MIL-F-8785C and
  ADS-33E-PRF are on DTIC, which was down; ANSUR II likewise. MDPI blocks
  all automated fetches. Web search is budget-limited per session.
- **The tool is conceptual-design fidelity.** NDARC-class methods carry
  5–10% error on the aircraft they were fitted to (AFDD, 42 helicopters)
  and this tool sits at 14.5% on eVTOLs that are outside that population.
  A manufacturer's "every millimetre" review is a preliminary-design
  activity with CFD, FEA and test behind it. This tool's job is to be
  *honest* about which of its numbers are which — and the provenance census
  is that honesty, in a form a reviewer can run.

---

## 6. Sources on disk (offline-citable)

| file | document |
|---|---|
| `ndarc*.txt` | NASA/TP-20220000355 Vol. 1, NDARC Theory (2022); TP-20250010468 (2025) |
| `tp2025.txt` | NASA/TP-20250006187, Impact of Technology and Mission Variations |
| `malpica.txt` | Handling Qualities of Multirotor RPM-Controlled eVTOL (Malpica, Suh, Silva) |
| `faa_hq_vtol.txt` | DOT/FAA/TC-23/59, VTOL handling qualities |
| `moc.txt`, `m137443.txt`, `m142242.txt`, `moc5.txt` | EASA MOC SC-VTOL, publications 1–5 |
| `joby*.txt` | 89 FR 17230, Joby JAS4-1 airworthiness criteria |
| `7009B.txt` | NASA-STD-7009B, Models and Simulations |
| `Multi_1.txt`, `Multi_2.txt` | Yang et al., Aerospace 2024 11:200 (Table 4 cabins) |
| `multicopter.txt` | Russell et al., NASA multicopter wind-tunnel and hover tests |
| `20180003381.txt`, `20180006683.txt` | NASA concept vehicles (Johnson, Silva, Solis; Silva et al.) |
| `camrad2017.txt`, `felker.txt`, `sarojini.txt`, `ndarc_uq.txt` | rotor aeromechanics, tiltrotor download, MDO, NDARC uncertainty |
