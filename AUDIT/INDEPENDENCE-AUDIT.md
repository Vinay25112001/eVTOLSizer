# INDEPENDENCE AUDIT — second-order audit

Every verification that claims to be independent, traced to what it actually compares against.
**Rule applied: if reference code, golden values, constants, helpers, conversions, source data,
lookup tables or solvers are shared with production, the verification is NOT independent.**

---

## 1. Ground truth that is the application's own output

| Artifact | Independence | Evidence |
|---|---|---|
| `validation/golden-master.snapshot.json` (277 cases × ~30 fields) | **NOT INDEPENDENT** | Written only by `golden-master.mjs --record`, where the recorded value is `fingerprint(run(c.p))` and `run = runSizing` — the production engine. Regression protection only; **zero power against a defect already present when the snapshot was taken.** |
| `AUDIT/data/reference-cases.json` (9 cases, ~50 fields) | **NOT INDEPENDENT** | Its own header, verbatim: *"Frozen at commit 3a7a5a4 as a CHANGE-DETECTION baseline only. These are NOT asserted to be correct: findings F-04, F-08, F-09 and F-10 are live in every one of them."* Imported by **no** code — `grep -rn "reference-cases"` over `src/**` and `validation/**` returns zero. |
| `AUDIT/reference/compare.py` `APP` dict | **NOT INDEPENDENT** | Docstring: *"App values were extracted by running the engine; they are pasted in as data."* Its `MTOW=2772.06` is the same application-run number that also appears as `CASE-EVTOL-001.expected.MTOW_kg`. |

## 2. The one genuinely independent artifact

`AUDIT/reference/evtol_reference.py` — docstring states it *"deliberately shares NO code with the
application"* and derives from first principles (NACA TR-824 gravity, White's *Viscous Fluid Flow*
Sutherland's law, Raymer eq. 12.27 skin friction, ICAO Doc 7488 atmosphere).
**INDEPENDENT-CALCULATION.** It is a Python audit script and is **not part of `npm test`.**

## 3. The NASA referents are simulation output, not measured hardware

`validation/report.mjs` §2 states it in the product's own words:

> *"NASA UAM concept vehicles (NASA/TM-20210017971 Table 12) | published weight statements…
> **Model output, not measured hardware.** These statements are themselves NDARC results.
> Agreement with them demonstrates that this tool reproduces the reference method; it does not
> demonstrate agreement with a real aircraft."*

So `nasa-vehicles.js`, `nasa-table3.js` and `nasa-configs.mjs` — including the harness
`report.mjs` calls **"THE PRIMARY VALIDATION"** — compare one sizing code against another sizing
code. Classification: **SIMULATION**, published by NASA.

**The only weighed-hardware referent in the entire validation suite** is the EASA type-certificate
dry mass for the E-811 motor (`report.mjs:276`). Classification: **EASA**.

## 4. Fitted constants presented as reference data

| Value | File:line | Reality |
|---|---|---|
| `POWERTRAIN_ETA = 0.845` | `validation/nasa-vehicles.js:16` | **MANUAL-CALCULATION** — recovered by solving for the value that reproduces NASA's published battery capacity. Tagged `[CAL]` by the file itself. Not a NASA-published number. |
| `gearRatio = 3.85` | `validation/nasa-vehicles.js:94` | **MANUAL-CALCULATION** — inferred from the motor-speed class of two *other* vehicles. |

## 5. Checks that compare production against itself

| Check | File:line | Why it is not independent |
|---|---|---|
| Tail-area inversion | `validation/rotorcraft-tail.mjs:23-30` | Inverts `rotorcraftTailArea()`'s own formula and compares to `ROTORCRAFT_TAIL_VOLUME.sideBySide.Vh` — the very constant that formula consumes. Round-trip algebra, blind to `Vh` being wrong. (The file's other check, `:37-40`, IS independent — pixel-measured off a NASA drawing.) |
| CPACS mass statement | `validation/cpacs-export.mjs:86-93` | Parses the XML just generated from the same `R` object used to write it. Tests transcription, not physics. |
| API equivalence | `validation/api.mjs:40-43` | `api.size(c).result` vs `runSizing(...)` — both call the same `runSizing`. Tests wrapper plumbing. |
| Re identity | `validation/identities.mjs:30,167` | **Hardcodes `MU0 = 1.47e-5`** and re-derives Re with that same constant, so the constant sits on both sides of the identity. This is exactly why F-04 survived every gate — see F-05. |
| Seat-count agreement | `validation/economics.mjs:112-116` | `const a = seatCount(pay), b = seatCount(pay); if (a !== b) disagree++;` — the same pure function on the same input. **This branch can never fire.** Verified directly. |

## 6. Counts

| | |
|---|---|
| Ground-truth artifacts traced | 3 application-derived, 1 independent, 1 EASA-measured |
| Ground-truth values with NO independent provenance | `golden-master.snapshot.json` (all), `AUDIT/data/reference-cases.json` (all), `compare.py` `APP` dict, `POWERTRAIN_ETA`, `gearRatio 3.85`, `sedCell 300`, `propDiam 3.0`, `twRatio 1.30`, and every `confidence:"low"` field |
| Engine outputs compared numerically against published aircraft data | **16 of 471 (3 %)** — measured by the provenance gate itself |
| Self-referential checks identified | 5 |

**Textbook citations are unverifiable from this repository.** Roskam, Torenbeek and Howe are cited
with page/section precision but are **not vendored anywhere** in the corpus (copyrighted). NASA
TM/TP/CR and AIAA citations are largely backed by vendored PDFs.
