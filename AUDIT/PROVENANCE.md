# PROVENANCE / SOURCE INTEGRITY (Phase 23)

Commit `3a7a5a4`. This subsystem is the tool's stated thesis, and in the lead's assessment it is
the strongest non-drone part of the codebase. The findings are at its edges.

## The census

`src/lib/provenance.js` classifies every engine input and output. Lead-verified counts:

| | total | validated | sourced | derived | calibrated | unverified | **assumed** |
|---|---|---|---|---|---|---|---|
| OUTPUTS | **467** | 16 | 141 | 234 | 5 | 70 | **1** |
| INPUTS | **89** | 3 | 36 | 16 | 7 | 27 | 0 |

The five documented statuses are defined strictly, and the definitions are the right ones:
`validated` requires an output **compared numerically against published data with the error
recorded**; `sourced` means the method traces to a citable reference but the output has never been
compared to a real aircraft; `calibrated` means fitted, and states its own fit set and residuals;
`derived` is standard algebra adding no new assumption; `unverified` means displayed but never
checked. The header says plainly: *"The gap between 'sourced' and 'validated' is the important
one."*

The 16 `validated` outputs are MTOW, PackkWh, Phov, LDact, ewfImplied, DL_lbft2, kNDARC, Wempty,
bWing, Etot, dBA_100m, Wbat, fuelMassKg, fuelBurnKg, weightGroupsRaw and weightModel.

## Findings

### F-30 — The ledger silently drops any status outside its five-key list — LOW — VERIFIED

`provenanceLedger()` initialises a fixed five-key `counts` object and loops
`if (counts[e.status] != null) counts[e.status]++`, so an unrecognised status is **skipped**;
`total` is then summed **from `counts`**, not from `Object.keys(OUTPUTS).length`.

Measured: `OUTPUTS` holds **467** entries and the ledger reports **466**. The proportional bar
therefore reads **100 %** of its width and the omission is unobservable from the output.

The dropped entry is `nLimitNeg`, `status: "assumed"` — a sixth status absent from `STATUS_META`,
from `PROV_COLOR` (`src/ui/tokens.js:103`) and from the render order
(`src/ui/Provenance.jsx:89`). Its own note states that the -1.5 carried is *"an APPLICANT
PROPOSAL with no source"* against a MOC VTOL.2200(f) floor of -0.5.

**So the one output flagged as an assumption is the one the honesty summary cannot show, and it
is a regulatory load factor.** That is the precise shape of defect this audit's Phase 23 targets:
never present an assumption as anything else.

Related, LOW: `assumed` and `unregistered` both fall back to `SC.dim`, the same colour as
`unverified` — three distinct epistemic states rendered identically. Corrected during review:
`PROV_COLOR` **does** resolve correctly for the five known statuses (verified against `SC`); an
earlier probe of mine read the wrong module and I withdraw that claim.

### F-32 — The citations gate cannot see a new documentation directory — LOW — VERIFIED

`validation/citations.mjs:161`:
`DOC_FILES = [...docs(ROOT,false), ...docs(ROOT/docs,true), ...docs(ROOT/paper,true)]`, and
`docs(ROOT,false)` is **non-recursive** (`:154-159`). Only root-level `.md`, `docs/` and `paper/`
are scanned; `src/` and `validation/` are walked for code. Any other documentation directory —
**including this `AUDIT/` tree** — carries citations no gate reads, while the gate is fatal on bad
refs elsewhere, giving false assurance that every citation in the repo is checked.

### Stale comments — the recurring provenance failure

The documentation in this codebase is unusually good, which raises the cost of a comment that has
gone stale. Lead-verified instances where a comment asserts something the code below it does not do:

| file:line | the comment says | the code does |
|---|---|---|
| `src/engine/weights.js:262-270` | "the two modules now disagree on nothing" | they disagree by 24.9 % (**F-08**) |
| `src/engine.js:1714-1716` | eVTOLs "use folding/retractable gear -> 0.003" | defaults to fixed, 0.015 (**F-09**) |
| `src/App.jsx:738` | "matches runSizing exactly" | -10.82 % (**F-11**) |
| `src/App.jsx:741` | "baseline at rhoMSL=1.225" | the engine uses `rhoHov` (**F-11**) |
| `src/engine/wing.js:120-127` | claims the CDi-carries-no-information defect was fixed | it was relocated (**F-10**) |
| `src/engine/wing.js:43-45` | "OUT OF DOMAIN IS REPORTED, NOT EXTRAPOLATED" | `inDomain` is discarded (**F-23**) |
| `src/engine.js:2483` | "Raymer component buildup" | NDARC/AFDD/GASP/CS-27 (**F-34**) |
| `src/engine/constants.js:76` | "dynamic viscosity, Pa*s" | the kinematic value (**F-04**) |
| `src/classes/aircraft/geometry.js:747` | "needs a balance model" | the balance model exists (**F-G01**) |
| `src/tabs/ConvergenceTab.jsx` caption | "Round 2 scales as T/W^1.5" | the series is flat (**F-G02**) |
| `src/tabs/NoiseTab.jsx` caption | "Distances to scale" | rotors on a fabricated ring (**F-G05b**) |
| `src/classes/drone/Drone3D.jsx:34,46,330` | "orthographic" | oblique (**F-G14**)  |

### What the provenance system gets right

- Every one of 467 outputs is classified; an **unregistered** key renders as such rather than
  silently, which `src/ui/Provenance.jsx:38-42` argues for explicitly.
- Many entries are unusually candid: `range`'s note records that the model over-predicts Archer
  Midnight by 27 % and leaves it visible; `priceTransientIntoMass` records that the option is
  **refuted by validation** and ships off; `nacelleWettedAreaM2` records that a NASA regression's
  coefficients *do not survive PDF extraction* and refuses to guess, with the line
  **"A recovered unit is not a source"**.
- `conversionControlsFrac` documents an n=1 result and deliberately does **not** ship it as a default.
- `structTechFactor`'s fitted 1.414 was measured and deliberately not shipped.

That standard is the reason the stale comments above are worth listing individually: in a codebase
this well annotated, a reader has no reason to doubt a comment.
