# FINDINGS — Independent Verification & Validation, PASS A

**Subject:** eVTOL Sizer Live — eVTOL / aircraft / drone conceptual sizing platform
**Commit audited:** `3a7a5a4`, branch `shared-auth`, working tree clean at audit start
**Scope:** 464 tracked files; `src` 84,909 LOC; `validation` 29,146 LOC (116 harnesses)
**Status:** PASS A (read-only forensic audit) complete for the domains listed in
[WHAT WAS AUDITED](#what-was-audited). **No engineering code was modified.**

---

## How to read this document

Every finding carries a **verification status**, because the audit's own rule is that a
claim is not evidence:

| status | meaning |
|---|---|
| **VERIFIED** | Reproduced by the lead auditor with independent recomputation against the live code at `3a7a5a4`. Both numbers are given. |
| **AGENT-REPORTED** | Found by a delegated domain auditor, evidence cited, **not** independently reproduced by the lead. Treat as a lead to confirm, not as a result. |
| **UNVERIFIED** | Insufficient evidence to conclude. Recorded so it is not lost. |
| **CORRECTED** | An agent claim the lead tested and found wrong or narrower than stated. The correction is given. |

Severity per the audit's Phase 27 scale: **CRITICAL** (changes engineering conclusions or
invalidates sizing) · **HIGH** (significant numerical/physical error) · **MEDIUM**
(meaningful but localized) · **LOW** (presentation/documentation/minor numerical).

### A methodological warning that affects every number in this audit

**The entry path changes the answer.** `runSizing(DEFAULT_PARAMS)` and
`runSizing(engineInputs(DEFAULT_PARAMS))` size different aircraft, because
`engineInputs()` (`src/lib/designfile.js:98-105`) folds the reserve distance into
`range` — the default 100 km becomes 161.104 km. The registry (`src/classes/registry.js`)
declares `prepare: engineInputs`, so **the UI path is the `engineInputs` path** and that
is the path used for every lead-verified number below.

Measured on the same defaults: `engineInputs` path → **MTOW 2772.06 kg**; direct
`runSizing` → **2073.36 kg**. Delegated auditors who called `runSizing` directly reported
absolute values from the second path (and one from a third), which is why several
agent-reported magnitudes below differ from the lead's. This is itself finding **F-19**.

---

## Summary counts

| | count |
|---|---|
| **CRITICAL** | **2** |
| HIGH | 29 |
| MEDIUM | 49 |
| LOW | 36 |
| UNVERIFIED | 6 |
| **total findings** | **122** |
| Explicit PASS results recorded | ~30 |
| Agent claims corrected or narrowed by the lead | 4 |

**Numbering.** `F-01`…`F-37` are in this document (the cross-cutting register). Domain findings
carry a domain letter and live in their own document, all indexed here:
`F-G*` geometry/charts → `GEOMETRY-AUDIT.md` · `F-R*` regulatory/edge/precision →
`REGULATORY-AUDIT.md`, `EDGE-CASES.md`, `NUMERICAL-STABILITY.md` · `F-A*` aero/atmosphere →
`AERO-AUDIT.md`, `ATMOSPHERE-AUDIT.md` · `F-M*` mass → `MASS-CLOSURE.md` · `F-E*` energy →
`ENERGY-AUDIT.md` · `F-P*` propulsion → `PROPULSION-AUDIT.md` · `U-*` unverified, below.

**Two CRITICAL findings were established, both in the certification path, both lead-verified.**
They are summarised immediately below and detailed in `REGULATORY-AUDIT.md`.

Two further candidates were **demoted on evidence**, and the reasoning is shown rather than the
severity inflated: the runaway-seed defect (**F-01**) is fully flagged to the user by an explicit
non-convergence banner, and the propulsion-boundary issue (**F-13**) turns on a
modelling-convention question the lead could not settle against a primary source (**U-01**).

---

# CRITICAL findings

## F-R01 — The only safety-performance certification clause the eVTOL engine evaluates returns PASS for an undefined aircraft — CRITICAL — **VERIFIED**

`src/engine/certification-climb.js:110-111`:
```js
const W = Math.max(1, (g.MTOW_kg ?? 0) * (g.g0 ?? 9.80665));
const V = Math.max(1e-6, p.vCruise ?? 0);
```
These guards turn a missing or zero mass into a **1 N** aircraft and a missing or zero cruise speed
into a **1 µm/s** aircraft, and the MOC VTOL.2120 gradient then certifies it. Lead-measured:

| input | `gradientPct` | required | `pass` |
|---|---|---|---|
| nominal | 25.383 | 2.5 | TRUE (correct) |
| `MTOW_kg = 0` | **968,252.451** | 2.5 | **TRUE** |
| `vCruise = 0` | **2,386,407,993.713** | 2.5 | **TRUE** |
| both zero | **6.49e13** | 2.5 | **TRUE** |

Unlike F-01 there is **no banner** — the row reports a clean PASS. A zero or missing mass is
reachable: F-01, F-12, F-22, F-R14 and F-R18 all document upstream paths that produce one. The fix
shape exists three files away: `fuselage-pressure-shell.js:164` refuses with
**"Not evaluated is not zero."**

## F-R02 — The declared evaluation condition is never applied — CRITICAL — **VERIFIED**

`CLIMB_GRADIENT_ALT_M = 305` appears exactly twice in the file: at its declaration (`:97`) and
inside the printed `basis` string (`:173`, *"…at 305 m above the take-off surface…"*). It is
**never used in the computation**. `g.rhoAtCondition`, documented as an input at `:105`, appears
**only in the JSDoc comment** and is never read. Lead-verified by occurrence count and by reading
the whole computation, which carries no density and no altitude term.

MOC VTOL.2120(b) additionally requires Category Basic at ISA SL, which is not enforced either. So
**the stated basis line is false for every run**: the gradient is evaluated at whatever converged
cruise condition the design happens to have. At 2,000 m the density ratio is 0.822, so the L/D and
hence the `1/LD` term differ from the condition the output claims.

This is the same family as F-06 and F-07 — a stated basis the arithmetic does not implement — but in
a certification context, which is what makes it CRITICAL rather than HIGH.

---

# HIGH findings

## F-01 — The Round-1 seed is published as MTOW when the main loop fails on its first pass — HIGH — VERIFIED

`src/engine.js:495-505`:

```js
let MTOW1=2177, ...
for(let i=0;i<5000;i++){
  ...
  const mn=p.payload+Wempty1+Wbat1;
  if(Math.abs(mn-MTOW1)<tolFor(MTOW1)){MTOW1=mn;break;}
  MTOW1=mn;             // assigned here
  if(MTOW1>5700)break;  // and only tested here
}
```

The runaway guard is **after** the assignment, so `MTOW1` on exit is unbounded. When the
master loop (L2) then breaks on its first pass (`:1474`), `MTOW` has never been written and
the returned `MTOW` **is that seed**.

Measured on the registry path:

| input | published `MTOW` (kg) | `MTOW1` | `itersR1` | `r2Converged` | `r2Diverged` |
|---|---|---|---|---|---|
| default | 2772.06 | 1597.20 | 50 | true | false |
| `sedCell: 1` Wh/kg | **142,042.75** | 142,042.75 | 1 | false | true |
| `range: 5000` km | **16,256.18** | 16,256.18 | 1 | false | true |
| `vCruise: 0` | **1,241.58** | 1,241.58 | 39 | false | true |

142,042.75 kg for a five-seat air taxi is **12.5× the tool's own 11,400 kg ceiling** and
24.9× the 5,700 kg certification MCTOM. This is the failure the ceiling block at
`:1455-1473` was written to stop; that block bounds iterates ≥ 2 only.

**Why HIGH and not CRITICAL.** The UI refuses to call it a result. `src/App.jsx:2347`
renders, in red, *"⚠ THIS DESIGN DID NOT CONVERGE — the numbers below are not a result"*
with an explanation of the likely cause, and `src/ui/StatusBar.jsx:69` gates on
`r2Converged !== false && !r2Diverged`. That is honest handling and it is credited.
The residual defect is real: the number is still published, still colour-coded as MTOW
(`App.jsx:1260`), still names a saved report (`:1382`), and the `vCruise: 0` case
(1,241.58 kg) is **plausible-looking**, which is the insidious one. **CORRECTED IN PASS B (CHG-004) — the fix recorded here was a no-op.**
Moving `:504` above `:503` makes the guard read `MTOW1`, the PREVIOUS, in-range iterate; it
passes, `MTOW1=mn` publishes the runaway anyway, and only `itersR1` moves (1 → 2). Measured:
all three runaway values above are published unchanged by that mutation. The guard must read
`mn`, the candidate, before it becomes the answer — which is what Round 2 already does at its
own ceiling guard. The bound must also be TWO-SIDED: `mn > 5700` never rejects a negative mass,
and `range = -4938.9 km` runs `2177 → -12,813.92 → 78,556.43`, so a ceiling-only guard keeps
-12,813.92 kg as "the last in-range iterate". And no guard ordering whatsoever reaches the
`vCruise = 0` row, because Round 1 CONVERGES there and the number arrives through `MTOW=MTOW1`
seeding instead — that row needs the `mtowFromR1Seed` flag, not a bound. See CHANGE-CONTROL.md
CHG-004, and findings N-01/N-02/N-03 raised by the remediation.

## F-02 — The trainer loop converges to a NEGATIVE fuel mass and reports `converged: true` — HIGH — VERIFIED

`src/classes/trainer/size.js:120-125, 207-212`; `src/classes/trainer/performance.js:86-90, 123`.

| input | `converged` | `stopReason` | gross (lb) | usable fuel (lb) | cruise (lb) | reserve (lb) |
|---|---|---|---|---|---|---|
| default | true | null | 2605.4 | 265.37 | 204.42 | 38.23 |
| `rangeNm: -518` | **true** | **null** | 1804.1 | **−108.86** | **−153.63** | 26.46 |
| `reserveMin: -1000` | **true** | **null** | 1358.9 | **−320.28** | 106.49 | **−442.64** |
| `allowanceGal: -10` | true | null | 2426.1 | 181.99 | 192.65 | 36.01 |

A design is published whose gross weight is `empty + payload − 108.86 lb of fuel`, with
`converged: true` and **no flag of any kind**. The fixed point is genuine and the residual
really is < 0.01 lb: the loop is right, the physics is not, and nothing refuses it.
`analyzeTrainer` validates `grossLb/wingAreaFt2/spanFt/hp > 0` (`:154-156`); `sizeTrainer`
validates nothing beyond finiteness. Unlike F-01 there is no banner.

Trigger requires an illegal negative input, which is why this is HIGH rather than CRITICAL —
but Phase 18 explicitly requires that negative input where illegal be rejected with an
explanation, so this is a Phase 18 **FAIL**.

## F-03 — `reserveMin` is completely inert under the default transport fuel method — HIGH — VERIFIED

`src/classes/transport/mission.js:242` hardcodes `45 * 60`; `:244, :246` hardcode `30`.
`src/classes/transport/size.js:277-280` passes `reserve`, `alternateNm`, `alternateAltFt`,
`alternateMach` to `flyMission` but **never `reserveMin`**.

| `reserveMin` | gross (lb), `fuelMethod: "mission"` (the default) | fuel (lb) | `converged` |
|---|---|---|---|
| 0 | 173,724.4 | 41,164.3 | true |
| 45 | 173,724.4 | 41,164.3 | true |
| 600 | 173,724.4 | 41,164.3 | true |
| −45 | 173,724.4 | 41,164.3 | true |

A 0 → 600 minute reserve swing moves the design by **0.00 %**. This is exactly the defect
class the codebase itself condemns at `src/engine.js:350`: *"A control that cannot change
the design must not sit on the design panel."* `alternateNm` does work, which makes the
inertia harder to notice. AGENT-REPORTED and not re-verified by the lead: that the
`regulatory` method does respond (0 → 600 min giving 189,880 → 356,251 lb) and grants a
fuel credit for negative reserve.

**REPRODUCED 2026-09-28, AND THE FRAMING ABOVE IS WRONG.** The inertia is real and reproduces
exactly — 0 → 600 minutes under `mission` moves the design by 0.00 % (78,800.1 kg throughout).
The agent-reported half is now lead-verified too: `regulatory` responds (86,127.9 → 161,592.7 kg
in kg terms) and a negative reserve does buy a fuel credit (−45 min → 82,654.4 kg, 3,473 kg
lighter than at 0). `loftin` is inert as well, by design, since it uses `reserveIncrementNm`.

But the charge quoted against it does not hold. `src/classes/aircraft/input-deck.js:33` shows
`reserveMin` on the jet decks **only when `fuelMethod === "regulatory"`** — the one method where
it works — and the default is `mission`, so the control is NOT on the design panel while it is
inert. This finding measured the engine and not the panel. The turboprop deck (`when: {}`) does
show `reserveMin` unconditionally, and the turboprop honours it at `turboprop/size.js:141`.

What survives is the narrower question the holder has now settled: whether `mission.js:242-246`'s
hardcoded 45 and 30 should read `reserveMin`, when those minutes are the named reserve POLICY's
own regulatory values (`us-domestic` → 14 CFR 121.639(c) 45 min; `nbaa` → 30 min hold). **Holder's
decision: honour `reserveMin` in the mission hold.**

The fuel credit for a negative reserve is a separate defect of the F-02 class and was raised as
**N-06** and closed by **CHG-007**, which refuses it in every class that publishes a schema.

## F-04 — Kinematic viscosity mislabelled and consumed as dynamic viscosity — HIGH — VERIFIED

`src/engine/constants.js:76` — `MU0 = 1.47e-5`, commented *"reference dynamic viscosity, Pa*s"*.

Independent check (Sutherland's law, White, *Viscous Fluid Flow* 3e eq. 1-36,
`mu = 1.458e-6 T^1.5/(T+110.4)`; `AUDIT/reference/visc.py`):

| quantity | value |
|---|---|
| mu(288.15 K), Sutherland | **1.789380e-5 Pa·s** |
| ISA tabulated dynamic viscosity (ICAO Doc 7488) | 1.7894e-5 Pa·s |
| kinematic nu = mu/rho | **1.460719e-5 m²/s** |
| `MU0` as shipped | 1.47e-5 — matches **kinematic to 0.64 %**, **17.8 % below dynamic** |

The law it feeds (`src/engine/atmosphere.js:30`, `viscosity(T) = MU0*(T/T0)^0.75`) is
unambiguously a **dynamic**-viscosity power law: over 288.15 → 216.65 K it gives 0.807
against Sutherland's 0.794 (1.6 % error), whereas the true kinematic ratio is 2.674 — off
by 3.3×. So the formula is right and the coefficient is the wrong quantity.

Consumed as dynamic viscosity in `Re = rho V L / mu` at `src/engine.js:808, 826, 1657,
1698, 2052`. **Every Reynolds number in the tree is 21.7 % high**, so Prandtl–Schlichting
`Cf = 0.455/log10(Re)^2.58/(1+0.144 M²)^0.65` is **2.9–3.1 % low**, understating parasite
drag. Re is also displayed to the user (`src/App.jsx:537`) and printed in the report
(`src/export/report.js:229`).

**The same tree holds the correct value under the same label**: `src/engine/noise.js:197`
and `src/export/report.js:396` both write `1.789e-5`. Three sites, two values. The fix is
therefore to raise `MU0`, not to harmonise the others downward.

## F-05 — Both validation nets are structurally blind to F-04 — HIGH — VERIFIED

1. `validation/identities.mjs:30` **hardcodes** `MU0 = 1.47e-5` and then re-derives Re at
   `:167` with that same constant. The identity `Re == rho V c / mu` tests the **algebra**
   but cannot test the **constant**, because the constant sits on both sides. The harness's
   own unit annotation at `:164` declares `(Pa·s)` — dynamic — so its dimensional comment
   contradicts its value, and nothing compares the two.
2. `validation/constants.mjs` bands only **two** constants (`BANDS`, `:141-151`: gravity and
   `R_GAS`) despite a header claiming tree-wide one-value-per-constant enforcement. `MU0`
   appears in no band and in no relation check.

`mu` **is** pinnable by relation — Sutherland at T0 — which is the same "check the relation,
not the digits" instrument the file already applies to `R_GAS`. The remediation route exists
and was deliberately not applied (PASS A).

## F-06 — The exported report's Reynolds equation contradicts its own printed answer — HIGH — VERIFIED

`src/export/report.js:542` renders
`Re_w = (rho_cr · V_cr · c̄)/mu_cr = <fraction> = SR.Re_`. The displayed fraction is built
from `rhoCrd` and `muCrd`, and `muCrd` derives from `muSLd = 1.789e-5` (`:396`) — the
**correct** dynamic viscosity. The displayed **answer** is `SR.Re_`, which the engine
computed with `MU0 = 1.47e-5`.

Measured at the app defaults (deltaISA 0): printed fraction **6,585,544** vs printed answer
**8,017,158** — the equation is **−17.86 % off its own stated result**. The ratio matches
1.47/1.789 = 0.8217 exactly, confirming the cause. My independent Sutherland value gives
6,588,547, agreeing with the report's own numerator/denominator to 0.05 %.

**This is active at the defaults, not latent.** A reader who does the arithmetic the report
shows gets a different number from the one the report states — in the artifact a user would
put in front of a reviewer, in a tool whose thesis is traceability.

## F-07 — The exported report holds two cruise densities and two speeds of sound — HIGH — VERIFIED

`deltaISA` occurs exactly twice in `src/export/report.js` (`:392-393`), so:

- **Block A** (`:167-173`, `:213`): `T = 288.15 − 0.0065 h`, `rho = 1.225 (T/T0)^4.25588`,
  `a = sqrt(1.4 R T)` — **`deltaISA` absent entirely**.
- **Block B** (`:391-397`): `T0eff = 288.15 + deltaISA`, then
  `rhoCrd = 1.225 (Tcrd/T0eff)^4.25588` — density obtained by **scaling** a fixed 1.225 by a
  temperature ratio against the deviated datum. This is precisely the method
  `src/engine/atmosphere.js:14-17` documents as removed and *"wrong in sign"*.

Measured against the engine's `atmosphereSet().cruise.rho`:

| deltaISA | engine | block A | block B |
|---|---|---|---|
| 0 | 1.11164 | 1.11164 (0.00 %) | 1.11164 (0.00 %) |
| 15 | 1.05543 | 1.11164 (**+5.33 %**) | 1.11705 (**+5.84 %**) |
| 20 | 1.03794 | 1.11164 (**+7.10 %**) | 1.11875 (**+7.79 %**) |

Speed of sound: block A (`:171`) omits deltaISA (**−2.56 %** at 15, **−3.37 %** at 20) while
`:543` uses the deviated `Tcrd`. One document, two values for each of two quantities.
`deltaISA` is an exposed slider (`src/lib/defaults.js:225`, *"0=standard day, 15=hot day"*),
so one control reaches this. Latent only at the default 0.

## F-08 — Raymer's fuselage fineness correction is applied TWICE in the weight path — HIGH — VERIFIED

`src/engine/constants.js:105-114` — `fuselageWettedArea(L,D)` **already returns**
`pi D L (1−2/lf)^(2/3) (1+1/lf²)` for lf > 2.5. `src/engine/weights.js:275-276` then applies
`* Math.pow(Math.max(1−2/lamF,0.05),2/3) * (1+1/(lamF*lamF))` — the same correction again.
The weight path carries the correction **squared**; the drag path
(`src/engine.js:814, 1671`) applies it once.

| body | drag path (correct) | weight path (doubled) | weight model sees |
|---|---|---|---|
| app default, L 8.6 m, D 1.65 m (lf 5.2121) | **33.472 m²** | **25.132 m²** | **24.9 % smaller** |
| VoloCity pod, 3.9 × 1.6 m (lf 2.4375) | **16.360 m²** | **6.082 m²** | **62.8 % smaller** |

The comment directly above (`weights.js:262-270`) states *"the two modules now disagree on
nothing."* They disagree by exactly that factor; the comment is false, with the sign merely
reversed from the defect it describes fixing.

**It is worse in the regime the code was specially written to protect.** Below lf 2.5
`fuselageWettedArea` returns the exact prolate-spheroid area, which needs no correction;
`weights.js` multiplies it by a Raymer factor clamped at `0.05^(2/3) = 0.1357`.
`constants.js:80-103` exists specifically to stop a stubby pod's wetted area collapsing to
~7 m²; this line reintroduces the collapse (bare cylinder 19.604 m² → 6.082 m²).

AGENT-REPORTED magnitude, not re-verified by the lead: fuselage mass 4.7–6.1 % light, worth
**+1.35 % to +1.61 % of MTOW** across all six eVTOL layouts (+28 to +61 kg), with the
caveat that `structTechFactor = 1.001` was fitted with the error present and would need a refit.

## F-09 — Landing-gear drag defaults to FIXED gear, contradicting the comment beside it — HIGH — VERIFIED

`DEFAULT_PARAMS` contains **no `gearType`** and `engineInputs()` does not supply one (both
`undefined`), so `src/engine/drag.js:56` `const gearType = p.gearType || "fixed"` selects
`gearCD0.fixed = 0.015` (`:39`). `src/engine.js:1714-1716` states the opposite: *"eVTOL with
retractable/folding gear uses CD0g ≈ 0.003 … Winged lift+cruise eVTOL (Joby, Archer) use
folding/retractable gear → 0.003."*

Measured on the live default: `CD0gear` **0.015** = **34.6 % of `CD0tot` (0.043324)**, the
largest single drag term. Setting `gearType: "retractable"`:

| | default (fixed) | retractable | change |
|---|---|---|---|
| `CD0tot` | 0.043324 | 0.032915 | −24.0 % |
| `LDact` | 9.77 | 11.99 | **+22.7 %** |
| `MTOW` | 2772.06 kg | 2450.99 kg | **−11.58 %** |

An unstated default the user never sees, which the code's own comment says should be the
other value, moves the headline output by 11.6 %.

**RE-MEASURED 2026-09-28, after CHG-005 moved the viscosity constant.** The finding stands and the
numbers shift slightly: the live default is now `CD0tot` 0.043806 with `CD0gear` 0.015 at **34.2 %**
of it, `LDact` 9.69 and MTOW **2,795.68 kg**. `retractable` gives 0.033421 / 11.86 /
**2,469.91 kg (−11.65 %)**, and `faired` gives 0.032360 / 12.14 / 2,312.92 kg (−17.3 %). The
retractable figure already pays for the mechanism: `src/engine/weights.js:322` applies a 1.1437
retraction weight factor whenever `gearType === "retractable"`. **Holder's decision: expose
`gearType` in `DEFAULT_PARAMS` and on the eVTOL panel, defaulting to `retractable`** — which
closes both halves, the value the source supports and the fact that the user never saw it.

## F-10 — Cruise CL and induced drag are constant by construction — HIGH — VERIFIED

`src/engine/wing.js:161-164` sizes `S = max(W/(W/S)_design, W/(q·CL_cruise_max))`;
`src/engine.js:892` then forms `CL = W/(q·S)`. Substituting,
**CL_cruise ≡ min((W/S)_design/q, CL_cruise_max)** — the weight cancels identically, so
`CDi = CL²/(pi·AR·e)` cannot depend on the aircraft.

Measured across payload 200 / 455 / 900 kg, i.e. **MTOW 1601.2 / 2772.1 / 11001.6 kg, a
6.9× range**:

| payload (kg) | MTOW (kg) | S (m²) | `CLcruise` | `CDi` | `LDact` |
|---|---|---|---|---|---|
| 200 | 1601.2 | 11.45 | **0.549481** | **0.0129001** | 8.39 |
| 455 | 2772.1 | 19.83 | **0.549481** | **0.0129001** | 9.77 |
| 900 | 11001.6 | 78.69 | **0.549481** | **0.0129001** | 11.88 |

Identical to six significant figures. `src/engine/wing.js:120-127` claims the move off
`clDesign` fixed exactly this defect (*"CDi … was the SAME NUMBER for every design in the
sweep … induced drag carried no information at all"*). It **relocated** the defect from
`clDesign` to `wingLoadingNm2`. L/D still varies, but only through CD0 — the sizing loop's
induced-drag feedback carries no design information at all.

## F-11 — The Weather tab duplicates hover power, omits terms, and asserts it matches — HIGH — VERIFIED

`src/App.jsx:738` comment: *"Hover power — matches runSizing exactly"*. It does not.

- Engine `src/engine.js:1017`: `Phov = kCoax*kTwin*(T_hov/etaHov)*sqrt(DL/(2*rhoHov))/1000`
- App copy `src/App.jsx:742`: `(W/etaHov)*sqrt(DL_W/(2*rho_actual))/1000` — **omits `kCoax`,
  `kTwin`, and uses `W` where the engine uses `T_hov` = W/(1−downloadFraction)**;
  `DL_actual` (`:741`) likewise uses `W`.

Measured at **identical density** on the app's own defaults (`configType hybrid`, download
0.0735): engine **596.810 kW** vs App formula **532.236 kW** = **−10.82 %**. That is exactly
the omitted download: (1/(1−0.0735))^1.5 = 1.1214 against an observed 1.1213 (kCoax = kTwin
= 1 for this layout, so download is the whole gap). My independent momentum-theory reference
gives 532.19 kW without download and 596.75 kW with it — confirming both sides.

Additionally `src/App.jsx:741` asserts `P_hov_ISA = SR.Phov; // baseline at rhoMSL=1.225`,
which is false: the engine evaluates at `rhoHov = isa(fieldElev + hoverHeight)`. Measured
claim error: defaults **0.15 %**, sizingDay `nasa-uam` **24.59 %**, `nasa-sl` **7.10 %**.

So `P_hov_delta_pct`, shown to the user as the weather effect on hover power, conflates
three unrelated errors and is not the weather effect. The comment's own "physics check"
(`P_hov_wx/P_hov_ISA = 1/sqrt(sigma)`) cannot hold given the above.

---

# MEDIUM findings

## F-12 — Convergence is an artefact of a clamp in at least four places — MEDIUM — AGENT-REPORTED, partly VERIFIED

Clamp census inside the eVTOL master loop (`src/engine.js:793-1634`): `:946, 968, 1052,
1103, 1104, 1156, 1157, 1158, 1159, 1164, 1176, 1189, 1192, 1197, 1345, 1356, 1389, 1390,
1435, 1559, 1572, 1583`. Four make the fixed point an artefact, each proved by materially
different inputs giving bit-identical results:

| clamp | line | evidence |
|---|---|---|
| `gsCr = max(1, vCruise − vWind)` | `:1157` | headwind 66, 67 and **100 m/s** all give MTOW 7196.76 kg — ground speed pinned at 1 m/s, so the result is independent of the headwind. `profile.js:145-153` refuses this case properly; the sizing loop does not. |
| `WP = Phov/max(0.05, spBattery)` | `:1389` | `spBattery: 0` and `cRateDerate: 1.5` (which makes `sedEff` negative, `:1367`) both give MTOW 4845.94 kg — two unrelated bad inputs collapse onto the 0.05 kW/kg floor. |
| `Wbat = max(WE, WP)` | `:1390` | when `WP` binds, the entire energy model (sedCell, socMin, etaBat, Etot) stops affecting battery mass. Legitimate physics, but "MTOW converged" then says nothing about mission energy. |
| `tcr = max(0, CruiseRange/gsCr)` | `:1164` | see F-14. |
| no positivity guard on `Ereq`/`sedEff` | `:1345, 1367, 1373` | `socMin: 1.0` and `cRateDerate: 1.0` both publish **`Wbat = Infinity`**; `cRateDerate: 1.5` and `sedCell: -300` give a negative `sedEff` and hence negative `WE`, silently masked by `max(WE,WP)`. |

Lead verified the mechanism at `:1389-1390` and `:1164` by reading the code; the bit-identical
input triples are AGENT-REPORTED.

## F-13 — `Phov` is a rotor SHAFT power consumed as battery/bus power — MEDIUM — AGENT-REPORTED / UNVERIFIED on the boundary question

`src/engine.js:1017` divides only by `etaHov`, which the codebase itself identifies as a
**figure of merit** (`src/lib/defaults.js:210`; passed as `FM:` at `src/engine.js:2647` and
`validation/control-authority.mjs:104`). FM is P_ideal/P_**shaft**. There is no motor,
inverter or bus efficiency anywhere in the eVTOL hover chain — inverters carry *mass* only
(`src/engine/weights.js:134, 504`). Yet the same `Phov` is consumed as an electrical
quantity at `src/engine.js:1166, 1169` (→ `Etot`, which `:2778` calls *"kWh electrical"*),
`:1389` (`WP = Phov/spBattery`, a pack power limit), `:2249` (a pack current), `:1437, 2250`
(pack ohmic heat), and `:1397` → `turboelectric.js:130-133` (generator rating).
`src/engine/profile.js:31` states *"Segment powers, all in kW at the DC bus"* and then takes
`r.Phov` (`:45`).

The engine's own `POWERTRAIN_ETA_ROTORBORNE = 0.845` (`src/engine.js:314-318`), described as
a battery-to-shaft efficiency, is applied to wingless **cruise** and not to **hover** on the
same aircraft — which is the internal inconsistency.

AGENT-REPORTED impact: hover electrical draw understated **6.5–15.6 %**; `Pheat` scales as
1/eta² so **+13 % to +34 %**; energy effect small (~+1.1 % on `Etot`). The agent's claim that
the battery constraint *flips* from energy-governed to power-governed is explicitly marked
UNVERIFIED by the agent, and the lead did not test it.

**Why this is MEDIUM and not CRITICAL.** Whether `etaHov` is intended as a pure aerodynamic
figure of merit or as a lumped battery-to-shaft efficiency is a **modelling-convention**
question. The value 0.740 is sourced to NASA's lift+cruise figure of merit, which supports
the agent's reading — but the lead could not settle from a primary source whether the
author intended the lumped meaning, and `etaSys = 0.80` covering the forward-flight chain
suggests the split may be deliberate. Recorded with the evidence; the boundary question is
**UNVERIFIED** and is the first thing to put to the code owner.

## F-14 — Negative and zero eVTOL range are accepted silently — MEDIUM — CORRECTED

`src/engine.js:1164` `tcr = Math.max(0, CruiseRange/gsCr)`.

**Agent claim:** range −50 to 65 km all give an identical MTOW of 1988.34 kg, i.e. a 115 km
inert band. **Lead correction:** on the registry path (`engineInputs`, which folds reserve
distance into `range`) the inert band is only **range ≤ 0**:

| range (km) | MTOW (kg) | `Etot` (kWh) | `tcr` (s) | `r2Converged` |
|---|---|---|---|---|
| −50 | 1988.34 | 66.515 | 0 | **true** |
| 0 | 1988.34 | 66.515 | 0 | **true** |
| 30 | 1996.87 | 74.192 | 147.3 | true |
| 65 | 2326.99 | 113.462 | 664.2 | true |
| 100 | 2772.06 | 164.85 | 1180.9 | true |

The agent bypassed `engineInputs`, which shifts the threshold to ~81 km. The finding stands
in narrowed form: **range ≤ 0 km is accepted, reports `r2Converged: true`, and produces a
"sized" aircraft that flies zero cruise.** Negative range is never refused anywhere.

## F-15 — A converged transport can silently miss its landing-field requirement — MEDIUM — AGENT-REPORTED

`src/classes/transport/landing.js:191-195` — the wing-loading bisection returns `lo = 50` or
`hi = 1200` kg/m² with no flag.

| required field (m) | returned W/S | field actually achieved (m) | residual |
|---|---|---|---|
| 100 | 50.000 (clamped) | 403.9 | **+304 m, unflagged** |
| 1000 | 261.667 | 1000.0 | 0 |
| 10,000 | 1200.000 (clamped) | 3438.7 | **−6561 m, unflagged** |

End to end: `{landingMethod:"far25", landingFieldLengthM:20000}` → `converged: true`,
`stopReason: null`, for an aircraft whose 25.125 landing distance is 3438.7 m — a converged
design violating its own input requirement by 16,561 m. Contrast
`src/classes/transport/takeoff.js:302`, which at least returns `NaN` and trips the runaway guard.

## F-16 — A negative eVTOL reserve is converted by a clamp into a positive reserve and a longer cruise — MEDIUM — AGENT-REPORTED

`src/engine.js:1176` `Eres = Math.max(Eres, EresPct)` with `EresPct = 0.10·Emission`
(`:1175`), while `reserveDistM = Vres·tres_s` (`:445`) goes negative and is **subtracted** at
`:523/:1076`, so `CruiseRange` grows. `reserveMinutes: -20` → `converged: true`, MTOW
3022.64 kg (+45.8 % on the agent's baseline), cruise 140.1 km for a 100 km mission, `Eres`
positive at 10 % of mission, and none of the three failed checks mentions the reserve.

## F-17 — The T/W trade chart is degenerate: `tw` is never used in its own loop body — MEDIUM — AGENT-REPORTED

`src/engine.js:2442-2463`: `[1.0…1.5].map(tw => {…})` — inside the body `DLtw` uses `(W)`
(comment: *"T/W=1.0"*), `Phov_tw` uses `DLtw`, `WP_tw` uses `Phov_tw`. `tw` appears **only**
in the returned object. All nine rows therefore return an identical `R2`.
`src/tabs/ConvergenceTab.jsx:156-182` plots it captioned *"Round 2 scales as T/W^1.5 — higher
thrust margin → higher hover power → heavier battery → higher MTOW"* and draws a reference
line at the current T/W. The caption asserts a trend the series cannot contain, and the line
is flat. The `twRatio` slider *does* move real numbers elsewhere
(`src/engine/sizing-conditions.js:200`), which makes the flat chart look like a result.

## F-18 — Five mutually inconsistent hover-power expressions, two physically malformed — MEDIUM — AGENT-REPORTED (F-11 is the lead-verified subset)

| site | expression | vs the authoritative value |
|---|---|---|
| `src/engine.js:1017` | authoritative | — |
| `src/engine.js:2447` | no download, no kCoax/kTwin | −10.8 % |
| `src/App.jsx:741` | same, at `rho_actual` | −10.8 % (lead-verified as F-11) |
| `src/engine.js:2418-2420` | `DL2 = W2·TW/A` but thrust `= W2` — **mismatched thrust and disk loading** | +1.7 % by coincidence |
| `src/tabs/ConvergenceTab.jsx:203` | momentum theory at installed thrust, hard-coded rho 1.225, no download | **+32.1 %** vs the "Hover Power" tile on the same design |

Both sweeps additionally take a regeneration credit the design point refuses, use `p.LD`
instead of the computed L/D, use `hvtol/0.5` for hover time, resurrect a flat
`p.cRateDerate ?? 0.08` that `src/lib/defaults.js:112-118` deliberately deleted as unsourced,
and call `batteryConvention` **without `Phov`** so that two different specific energies are
used inside one sweep.

## F-19 — Two entry paths size different aircraft — MEDIUM — VERIFIED

`engineInputs()` (`src/lib/designfile.js:98-105`) is documented as *"THE ONLY PLACE the total
range is built"* and folds the reserve distance into `range`. The registry declares
`prepare: engineInputs`, and `src/App.jsx:581, 843` use it. But `src/App.jsx:1649`
(`solveRotorDiameter`, driven by the configuration dropdown) passes **raw UI params**.

Lead-verified consequence: on the same defaults the two paths give **MTOW 2772.06 kg** vs
**2073.36 kg** — a 33.7 % difference. So changing the configuration dropdown solves a rotor
diameter for a mission 38 % short, and that diameter then drives DL, `Phov`, `Wbat` and MTOW.
This also explains why three delegated auditors reported three different "default" MTOWs.

## F-20 — The transport stopping test omits the second state variable — MEDIUM — AGENT-REPORTED

`src/classes/transport/size.js:424` tests `|next − gross|` only; `wsUsed` is stepped at `:416`
with its own 0.5 damping and **never tested**. Reporting compounds it: `wingAreaFt2` is built
from the pre-update `wsUsed` (`:379-380, 396`) while `wingLoadingKgM2` is the post-update
value (`:421, 441`). Disagreement 2.5e−4 % at the default, rising to **0.45 %** under
`fuelVolumeConstraint, wingFuelFraction: 0.03` — where `fuelFits: true` is also reported on a
non-converged runaway.

## F-21 — `flyMission` lets the aircraft burn through its own structure — MEDIUM — AGENT-REPORTED

`src/classes/transport/mission.js:96` (`W -= dW`, no floor), `:216`
(`max(0, range − climb.R − descent.R)`).

| requested range (nm) | landing weight (lb) | vs ZFW 132,560 lb |
|---|---|---|
| 3,000 | 615,300 N | ok |
| 12,000 | 286,788 N | **64,468 lb below ZFW** |
| 80,000 | 225 N | **132,509 lb below ZFW** |

The reported `cruiseLD` 11.73 and `cruiseCL` 0.268 belong to an aircraft weighing 0.05 lb.
In `analyzeTransport` the `need(R)` bisection (`src/classes/transport/size.js:467-471`) is
evaluated on this regime and, because total fuel saturates at ramp weight, can never leave
the bracket — it returns a range derived from impossible physics.

## F-22 — Every loop publishes its initial guess as the answer on a first-pass failure — MEDIUM — AGENT-REPORTED (eVTOL case lead-verified as F-01)

| class | seed | observed published value on a pass-1 failure |
|---|---|---|
| eVTOL | `2177` → L1 | 1241.58 kg (`vCruise:0`, `cruiseAlt:30000`, `reserveMinutes:10000`) |
| transport | `3.5 × payloadLb` | 127,669.5 lb |
| turboprop | `3 × payloadLb` | 42,726 lb |
| trainer | `2 × payloadLb + 1000` | 2600.0 lb |

All carry `converged: false` plus a `stopReason`, so a disciplined caller is safe — but
transport can publish a **negative gross weight** (`fuelMethod:"regulatory", reserveMin:-2000`
→ −5702.2 lb), and fraction-method fuel goes negative whenever `Mff > 1`.

## F-23 — Three Oswald efficiencies live at once, and the domain flag is discarded — MEDIUM — AGENT-REPORTED

`src/engine/wing.js:53-62` computes e = 0.82779 (transcription verified term-for-term against
the quoted Howe 2000 eq. 6.14a / Scholz 13.26-27). But `src/engine.js:741` falls back to a
bare **0.85**, and `src/engine/constraints.js:138` uses `p.eOsw ?? 0.85` while
`src/tabs/ConstraintDiagramTab.jsx:22-27` never passes `e` — so the constraint diagram, whose
entire purpose is to justify the wing loading, runs on 0.85 while sizing runs on 0.828.
`oswaldEfficiency` returns `{e, inDomain}` and `:741` takes `.e` and **discards `inDomain`**,
despite the header claiming *"OUT OF DOMAIN IS REPORTED, NOT EXTRAPOLATED."* `sweep25Deg` is
not passed although the engine holds Lambda_25 = 7.206°.

## F-24 — Four CLmax conventions for one wing; the V-n boundary misses n = 1 at stall — MEDIUM — AGENT-REPORTED

`selAF.CLmax` 1.52 in `Vstall` (`src/engine.js:2259` — a 2-D **section** value used as a wing
value, with no AR/sweep/Re correction, and evaluated at `rhoCr` not sea level);
`p.clMaxWing ?? 1.5` in the V-n manoeuvre boundary (`:2294`), which yields **n = 0.9868 at
the aircraft's own stall speed** where it must be exactly 1.000; plus `clMaxTransition` 1.5
and a 1.2–1.8 range in `constraints.js`. `VA = Vstall·sqrt(n)` (`:2267`) feeds the manoeuvre
load cases, so design q may be 11–18 % low. The eVTOL path has **no high-lift model at all**
(`src/classes/transport/high-lift.js:571` says so itself).

## F-25 — Trade charts and several reported quantities come from a legacy model — MEDIUM — AGENT-REPORTED

`src/engine.js:2422, 2425, 2449, 2452` compute power from `p.LD = 8.50` rather than the
converged L/D (~26 % low), use `hvtol/0.5` s of hover, and use the `ewf` fraction model
rather than the buildup default. Separately `src/engine.js:2194-2198` exports `PmotKW`,
`Torque` and `MotMass` from a legacy model: **reported 100.3 kW/motor vs 129.3 kW installed
(−22.4 %); 709 N·m vs 914 N·m; MotMass 241 kg vs the EMRAX fit's 473 kg — the displayed
motor mass is 51 % of the one inside MTOW.** Sizing itself is clean (`:902` uses `LDact_i`):
computed for sizing, legacy for the display.

---

# LOW findings

## F-26 — A fabricated sensitivity presented as a Breguet result — LOW — VERIFIED
`src/App.jsx:754` `const range_delta_pct = -P_hov_delta_pct*0.3; // approx`, under the
section comment *"Range impact (Breguet — higher density = less drag = more range)"*. It is
not Breguet and contains no range physics: it is the (already wrong, F-11) hover-power delta
times an unsourced **0.3**.

## F-27 — Headwind computed with no aircraft heading — LOW — AGENT-REPORTED
`src/App.jsx:758` takes `wind_ms · cos(wind_direction)`. Open-Meteo's `wind_direction_10m` is
the compass bearing the wind comes *from*; taking its cosine against nothing makes a
northerly a full headwind and a southerly a full tailwind **regardless of the direction of
flight**. Drives `Vg` and the displayed `range_wind_pct` (`:760-761`). Dimensionally fine,
physically meaningless. (Rated LOW because it affects one informational panel, not sizing.)

## F-28 — Weather tab internal inconsistencies — LOW — VERIFIED
`src/App.jsx:748` scales cruise power on the stated basis that the aircraft flies faster at
lower density (`v ∝ 1/sqrt(rho)`), while `:758` computes `Mach_wx` from the **unchanged**
speed — one scenario, two cruise speeds. `:729` uses the dry-air gas constant while relative
humidity is fetched and displayed beside it (`:725, 769`); moist air is ~1.5 % less dense at
30 °C, 100 % RH. `:731` computes `rho_ISA_elev` and **never reads it** (single occurrence) —
dead code carrying a third copy of the ISA density relation.

## F-29 — Two cruise Mach numbers in one engine run — LOW — VERIFIED
`src/engine.js:739` `machCr_` hardcodes GAMMA, R_GAS, T0 and LAPSE and **ignores `deltaISA`**;
`:1641` `Mach = vCruise/aCr` uses the deviated speed of sound. Measured: defaults **0.00 %**,
sizingDay `nasa-uam` **+3.53 %**, `nasa-sl` **+3.41 %**. Numerically negligible today
because `machCr_` reaches only the Oswald `(1+0.12 M⁶)` term (7.7e-6 at M 0.2). Recorded as
the duplicated-constant class the repo's own gate exists for, not as a present error.

## F-30 — The provenance ledger silently drops any status outside its five-key list — LOW — VERIFIED
`src/lib/provenance.js` `provenanceLedger()` initialises a fixed five-key `counts` object and
loops `if (counts[e.status] != null) counts[e.status]++`, so an unrecognised status is
**skipped**; `total` is then summed **from `counts`**, not from `Object.keys(OUTPUTS).length`.
Measured: `OUTPUTS` holds **467** entries, the ledger reports **466**, the bar reads 100 % of
its width, and the omission is unobservable from the output.

The dropped entry is `nLimitNeg`, `status: "assumed"` — a status absent from `STATUS_META`,
from `PROV_COLOR` (`src/ui/tokens.js:103`) and from the render order
(`src/ui/Provenance.jsx:89`). Its own note says the −1.5 carried is *"an APPLICANT PROPOSAL
with no source"* against a MOC VTOL.2200(f) floor of −0.5. **The one output flagged as an
assumption is the one the honesty summary cannot show** — and it is a regulatory load factor.
Also `assumed` and `unregistered` both fall back to `SC.dim`, the same colour as
`unverified`: three epistemic states, one colour.

## F-31 — Harness registration is asymmetric across two runners — LOW — VERIFIED
`npm test` invokes **111** harnesses; `validation/report.mjs` `HARNESSES` runs **67**; **116**
`.mjs` files exist. `validation/general-arrangement.mjs` is **absent from `npm test`** and
present only in the report list. Lead verified that `report.mjs:193` does execute its list,
so the harness does run under the full gate — **no coverage hole** — but a harness added to
neither list would run nowhere, and nothing enforces that a new harness reach both.

## F-32 — The citations gate cannot see a new documentation directory — LOW — VERIFIED
`validation/citations.mjs:161`:
`DOC_FILES = [...docs(ROOT,false), ...docs(ROOT/docs,true), ...docs(ROOT/paper,true)]`, and
`docs(ROOT,false)` is **non-recursive** (`:154-159`). Only root-level `.md`, `docs/` and
`paper/` are scanned. Any other documentation directory — **including this `AUDIT/` tree** —
carries citations no gate reads, while the gate is fatal on bad refs elsewhere, giving false
assurance that every citation in the repo is checked.

## F-33 — `reservePctMission` defaults to 0.10 outside the basis that documents it — LOW — VERIFIED
`src/engine.js:1175` `(p.reservePctMission ?? 0.10)`. The 10 % criterion is a NASA convention
belonging to `MISSION_BASES.certification` (`src/engine/mission.js:35`), but the fallback
applies even with no mission basis selected. It does not bind at defaults (Emission 105.833
kWh → 10.583 kWh against a time-based `Eres` of 59.016 kWh), so the effect today is nil.

## F-34 — `weightBreakBasis` names the wrong method — LOW — AGENT-REPORTED
`src/engine.js:2483` labels the buildup *"Raymer component buildup"*. The live buildup is
NDARC AFDD93 (wing), AFDD84 (fuselage), AFDD82 (rotors, nacelle), AFDD00 (drive), CS-27
drop-test (gear), a component list (avionics) and `[CAL]` fractions. Only the 0.85/0.90
composite credits and the opt-in `fuselageModel:"raymer"` are Raymer. Registered in
provenance as *"names which mass set the chart is drawing"*, so the label is load-bearing.

## F-35 — Unguarded negative-going GASP equipment terms — LOW — AGENT-REPORTED
`src/classes/trainer/weights.js:193` `electrical = 0.03217·W − 20` goes negative below 622 lb
gross; `:202` `furnishings = 0.065·W − 59` below 908 lb. No clamp, no domain check. Both
positive at the 2,605 lb default; a light-sport input would silently *reduce* empty weight.

## F-36 — Three values for the Pa → lbf/ft² conversion, and the round trip is not the identity — LOW — AGENT-REPORTED
`0.020885434`, `0.0208854` and `0.020885` all appear. `src/engine.js:569` converts one way
with `0.0208854` and `:3634-3635` back with `0.020885`; `:3514-3515` tests the 25 lb/ft²
limit with `0.020885` while `:3011` reports with `0.0208854`. Round-trip drift 1.9e-3 %. A
design sitting on the 25 lb/ft² boundary is judged by a factor different from the one that
printed the number.

## F-37 — `32.2` used as imperial gravity, and the gate allowlists it — LOW — AGENT-REPORTED
`src/classes/trainer/weights.js:56` uses `32.2` (+0.081 % vs 32.17405, which
`src/classes/aircraft/flight-envelope.js:62` and `validation/constants.mjs:98` both use), and
`validation/constants.mjs:158` **allowlists that exact file and value** — so the
one-value-per-constant gate is blind to it by construction. Propagates into the gust mass
ratio, `Kg`, `nGust` and the ultimate load factor.


## F-38 — the register's recorded output units are wrong in 61 of 190 cases — HIGH — VERIFIED
`AUDIT/FORMULA-REGISTER.md` recorded an output unit for 190 of the 1,288 retained relations.
Judging each against what its right-hand side computes gives **118 OK, 43 WRONG, 11 QUOTIENT
(X per Y recorded as X alone), 7 MAGNITUDE (kW as W, km as m), 5 per-radian awaiting a
convention ruling, 6 unsettleable from the line** — **61 of 190 (32.1 %) wrong as recorded.**

Six were checked against source and all six confirmed:

| ID | recorded | actually | evidence |
|---|---|---|---|
| FORMULA-WEIGHT-040 | `min` | `Pa` | `balance.js:358` `qMin = 0.5*RHO0*vMc²`, used at `:387` as `qMin*Cd*A` = a force |
| FORMULA-WEIGHT-121 | `kg` | dimensionless | `trainer/weights.js:57` — the FAR gust alleviation factor K_g, merely *named* `kg` |
| FORMULA-STRUCT-033 | `kg` | dimensionless | the same K_g at `flight-envelope.js:204` |
| FORMULA-AERO-073 | `ft` | `1/ft` | `flops-aero.js:136`, whose own comment says `// per ft per unit Mach` |
| FORMULA-STRUCT-031 | `kg/m^3` | `slug/ft^3` | `flight-envelope.js:61` `RHO0_SLUG = 0.0023769; // slug/ft³` |
| FORMULA-REG-044 | `Pa` | `Pa*s` | `noise.js:197`, whose own comment says `(Pa·s)` |

**Two causes, both mechanical.** The naming convention matched a bare SUFFIX, so every name
ending in a lowercase `m` became metres — `sigmaLim` (a stress), `tlam`/`slam` (sines), `gam`
(an angle), `tauNm` (a torque), `alpha_dB_km` (dB/km), `atm` (an object). The `m` group is 35
rows and about five are right. Separately, the comment reader took the FIRST unit token
anywhere in the comment, so a declared quotient lost its denominator (`// kW/kg` → `kW`,
`// rad/s` → `rad`, `// Pa·s` → `Pa`) and three inverted (`// per rad` → `rad`, `// per ft` →
`ft`, `// per radian` → dimensionless). Prose was mined too: `// T/W=1.0` produced watts.

**The 190 figure must not be carried forward as completion.** Only **129** of it is defensible.
Per-row verdicts with reasons are held with the reconstruction evidence.

---

## F-39 — the register truncates its own cells, so it cannot be re-derived from itself — MEDIUM — VERIFIED
Two independent truncations: the builder capped the variable list at six entries, and the
writer then cut the rendered cell at ~90 characters (and the equation at ~100).

**152 variable cells sit at the ceiling and 73 have their last token cut**, producing entries
like `cl=1 (dimensi` and a bare `UNKNOW`. The document therefore shows **4,989** variable slots
while stating **5,055**: 66 slots are not in the file at all. A checker reading the register
sees a truncated `UNKNOWN` as a unit string — the first pass of the verification tooling fell
for exactly that and reported 37 false unit assertions where there are 29.

The register's equation column is truncated for the same reason, and the Phase-0 gate grants a
prefix-match allowance to truncated rows to compensate. Removing the truncation removes the
need for that allowance and turns check #7 into an exact comparison.

## F-40 — `report:check` calls the CURRENT report STALE on Windows, because `NORM` strips CR after regexes whose `^\s*` can cross a CRLF boundary — MEDIUM — VERIFIED

**The committed `VALIDATION.md` is not stale.** Put through `report.mjs`'s own `NORM`, the
committed blob and a freshly generated report are **identical**. N-19 concluded the opposite and
left CHECK_EXIT=1 as an honest open item; **that conclusion was wrong** and N-20 records the
correction. The cause is line endings, not drifted results.

**Measured.** `git show HEAD:VALIDATION.md` is **LF** — 0 CR, 5,121 LF, 428,907 bytes. But
`core.autocrlf=true` is set in this clone and `.gitattributes` exempts only
`validation/schemas/**`, so the **working-tree** copy is **CRLF** — 5,121 CR, 5,121 LF,
434,028 bytes. `--check` reads the working tree (`readFileSync("VALIDATION.md")`,
`report.mjs:603`), so it reads the CRLF form while the repository stores LF.

**Mechanism.** In JavaScript a lone `\r` is a LineTerminator, so under `/m` the anchor `^`
matches at the position *between* `\r` and `\n`, and `\s` matches `\n`. `NORM`'s fence rule
(`report.mjs:554`)

    .replace(/^\s*SKIP\s+change fence —.*$/gm, "  SKIP  change fence <branch-dependent>")

therefore begins matching **inside** line 3087's CRLF pair, lets `\s*` swallow the `\n` and
line 3088's indent, and replaces that whole span — the line break included — with a literal
string. `NORM`'s final `.replace(/\r/g, "")` then deletes the surviving `\r`, fusing two
report lines into one:

    committed:  "  PASS  only src/classes/ compares aircraftClass to a name  SKIP  change fence <branch-dependent>"
    this build: "  PASS  only src/classes/ compares aircraftClass to a name"
                "  SKIP  change fence <branch-dependent>"

Every later line shifts by one, which is exactly the **2,033 differing lines** and the
`committed 5121 / this build 5122` line count the check reports. **One fused line, not a
results drift.**

**Controlled experiment.** Take the LF blob and change *only* the line endings — content
byte-identical once CR is stripped, asserted true. The verdict flips: `NORM(LF)` is 5,122
normalised lines, `NORM(CRLF)` is 5,121, first differing at line 3087, 2,034 lines different
(2,034 rather than the gate's 2,033 because this count iterates the longer file, including the
extra trailing line the gate's own `a.reduce` loop cannot reach — the two agree).

**Two of the four line-anchored rules cross the boundary; only one loses a line.** Both
`python-lxml` (`report.mjs:552`) and `fence-SKIP` (`:554`) match text beginning with `\n`.
`python-lxml` is harmless **by accident**: its replacement is `"$1<python>"` and the swallowed
`\n` falls inside capture group 1, so it is written straight back. `fence-SKIP`'s replacement is
a bare literal, so the break is discarded. `fence-PASS` (`:555`) does not match on this branch,
and `generated` (`:557`) has no leading `\s*`.

**The diagnostic built to catch this cannot see it.** `report.mjs:626-628` prints the differing
lines through `JSON.stringify`, with the stated intent that *"whitespace, stray CR and non-ASCII
show up as escapes rather than looking identical on screen"*. But the lines it prints come from
`NORM(...)`, which has already deleted every `\r`. The one artefact the printer was added to
reveal is removed before the printer runs — which is why four sessions of evidence recorded this
as staleness.

**Consequence.** `report:check` fails on any Windows checkout with `core.autocrlf=true`, and
passes in CI, where `verify.yml` runs `ubuntu-latest` and the file stays LF. This is the third
instance of the environment-dependent failure class the same comment block already documents
for the commit hash and for the change fence — and the first one that is not normalised away.
**Regenerating and committing does not durably fix it**: `npm run report` writes LF, so the
check goes green locally only until the next checkout restores CRLF.

**The shape, for the fourth time.** `^\s*` is a prefix test standing in for a grammatical one.
The register's suffix matching (F-38), the scanner's `rhs.startswith("(")` (N-17) and the gate
runner's ordering (N-19) were the first three; this is the fourth, and the `\s` character class
silently including the line terminators is what makes it invisible.

**Remediation (production change — NOT made here).** Move `.replace(/\r/g, "")` to the **head**
of `NORM`'s chain, or anchor the line rules with `^[ \t]*` instead of `^\s*`. Either kills the
class rather than this instance. `validation/report.mjs` is shipped tooling that CI executes, so
the change is outside this audit's authorisation and is recorded as a remediation item.

## F-41 — the Phase-2 coverage metric conflated two populations and then destroyed its own reproducibility — MEDIUM — VERIFIED (self-inflicted, same day)

Two defects in `PHASE-2-COVERAGE.md` as first committed at `c816e5e`. Both are in this audit's
own tooling, neither touches the repository, and both were found while trying to USE the document
to prioritise work — which is the only way this class of error surfaces.

**1. IT MEASURED ALL 2,429 SITES AND WAS READ AS THE LEDGER'S 1,288.** The figures 20.7 % and
27.5 % are correct for the population they describe: every implementation site in the register.
But the Phase-2 ledger's scope is the **1,288 retained engineering relations** (class C1), and the
document's per-domain table was used to set the order of work as though the two were the same
population. They are not, and for one domain the difference is enormous:

| domain | all sites | retained relations |
|---|---|---|
| **GEOM** | **387** | **24** |
| STRUCT | 227 | 131 |
| REG | 81 | 51 |
| SIZING | 483 | 319 |

GEOM's 387 is mostly class **C5 geometric construction — 369 sites**, which the classification
rule deliberately excluded from the engineering relations. So the conclusion drawn from the table,
that GEOM is "the second largest domain in the engine and the least reached" and should be worked
first, is **wrong within the ledger's scope**: GEOM is the third *smallest* retained domain.
Measured over the retained relations at ±3 lines, coverage is **REG 9.8 % (51), STRUCT 10.7 %
(131), GEOM 12.5 % (24), STAB 15.3 % (111)**, so the neglected domain that actually carries volume
is **STRUCT**, not GEOM. Restated over the right population, overall coverage is **306 of 1,288
(23.8 %) at the exact line and 396 (30.7 %) within ±3**, not 20.7 / 27.5 %.

**A domain's SITE count is not its RELATION count, and the register keeps them in two different
tables for exactly that reason.** Any figure taken from the register must say which of the two it
counts.

**2. WRITING THE LEDGER DESTROYED THE METRIC.** The measurement counts every `file.js:line`
citation in every `AUDIT/*.md` document and excluded `FORMULA-REGISTER*` as an inventory rather
than a finding. `PHASE-2-LEDGER.md` was not excluded, and it cites **all 1,288 retained relations
by file and line**. So from the moment the ledger existed, re-running the measurement reported
**100 % coverage of every retained relation in every domain**.

The committed figures were therefore **not reproducible from the tree that contains them** — the
F-39 shape, a document that cannot be re-derived from itself, reintroduced by the very pass that
closed F-39's truncation. It is worse than a stale number because the failure is silent and
flattering: the metric does not break, it reports success.

**The fix is a definition, not a patch.** The register and the ledger are both INVENTORIES of the
register, not audit findings about it, so both are excluded from the citation set, along with the
coverage document itself. `scratchpad/coverage_v2.mjs` does this and reproduces the original
all-sites figures exactly — 504 / 669 / 912 of 2,429 — which confirms the v1 numbers were right
when taken and that only their reproducibility was lost.

**Why it was not caught at the time.** The measurement was taken BEFORE the ledger existed, so it
was correct when written and self-contaminated a few minutes later by the next artefact in the
same pass. Nothing re-ran it, because it was prose rather than a gated quantity. **An ungated
measurement is a measurement that is true once** — which is the same argument that justified
gating the ledger in N-24, applied to a number that did not get a gate.

---
## F-42 — the Phase-2 ledger recorded six repository FAILs that are all the analyser, walking into this audit's own documented trap — MEDIUM — VERIFIED (self-inflicted, same day)

The ledger built at `c816e5e` maps the register's `unit verif = CONFLICT` to a Phase-2 verdict of
**FAIL** on question 3, "are units correct?". Six relations carry it. **All six are the analyser,
not the code. The correct count of Q3 FAILs is zero.**

`CHANGE-CONTROL.md` N-16 already records the rule this breaks: *every dimensional conflict across
four triage rounds (13 → 12 → 8 → 4 → 1) was the ANALYSER, not the code*, and *before calling any
conflict a repository defect, ask: did the analyser cause it?* The ledger asked nothing. It
promoted a recorded disagreement into an assertion that the repository is wrong, which is the one
thing this audit is not allowed to do without evidence.

**A `CONFLICT` IS NOT A DEFECT. IT IS AN UNRESOLVED RECORD.** The register's own provenance column
says so on five of the six: *"NAME vs HAND VERDICT ... neither is adopted"* and *"NAME vs ALGEBRA:
both are known and they disagree; neither is adopted"*. A field that explicitly adopts neither
reading cannot support a FAIL.

**All six, checked individually against the source:**

| relation | site | what the register recorded | what the code does |
|---|---|---|---|
| STRUCT-031 | `flight-envelope.js:223` | NAME vs HAND VERDICT | `RHO0_SLUG` is `0.0023769 slug/ft³` (declared at `:61`) times a dimensionless density ratio, so **slug/ft³**. The hand verdict is right and the name-derived label is wrong. |
| STAB-101 | `autorotation.js:76` | NAME vs HAND VERDICT | `(m·R·R)/3` is a moment of inertia, **kg·m²**. Correct. |
| SIZING-240 | `engine.js:1216` | NAME vs HAND VERDICT | a fraction of a mission energy, **kW·h**. Correct. |
| MISSION-075 | `mission.js:223` | NAME vs HAND VERDICT | a fuel mass, **kg**. Correct. |
| WEIGHT-249 | `weights.js:246` | NAME vs ALGEBRA | the recorded equation `5.66411 * fLGloc_w` is **truncated mid-expression**, so the "algebra" it was compared against is not the line. An extraction artefact, not a unit error. |
| AERO-183 | `profile.js:194` | *"two operands that must agree do not"* — `kW*h - 1 (dimensionless)` | **The only one that looked real, and it is not.** `acc` is `let acc = 0` at `:190` and `acc += x.energyKWh` at `:203`, so it is kW·h. `(available - acc)` is kW·h − kW·h. **The analyser took the unit from the literal `0` initialiser instead of the accumulation.** |

AERO-183 is the instructive one: its provenance is *not* the name-versus-verdict pattern, so it was
the single case that could have been a genuine subtraction across unit systems — the defect class
`validation/unit-system.mjs` check 2 exists to catch and measures at 0 across the tree. Reading
three lines of context dissolves it. **Five of the six were the naming heuristic; the sixth was the
initialiser heuristic. Six of six are the analyser.**

**Corrected Q3 tally: 363 PASS, 0 FAIL, 925 UNVERIFIED** — the six move from FAIL to UNVERIFIED,
which is what "neither is adopted" means. They are **not** moved to PASS: reading a right-hand side
by hand establishes what the expression computes, but the register declines to adopt it, and the
ledger must not adopt what its own source refuses to.

**The mapping is fixed in both places, because one of them is a gate.** `build_p2_ledger.mjs` no
longer emits FAIL for CONFLICT, and `validation/phase2-ledger.mjs`'s `wantUnits` is changed to
match — otherwise the gate would have enforced the defect. **FAIL is deliberately kept reachable**
for a dimensional error that is hand-verified in the code, so the fix narrows the mapping without
making the verdict unreachable; there is simply no relation that currently earns it.

**Why the gate did not catch this.** It checked that Q3 AGREES WITH the register, and it did agree —
faithfully reproducing a wrong interpretation. **A consistency gate cannot detect a wrong mapping,
only a drifting one**, which is the same limitation N-24 states in its "what is not checked"
section and is worth restating with a concrete instance behind it.

## F-43 — the register's `regression` column is blind to `await import()`, so 78 relations are recorded as ungated on no evidence — MEDIUM — VERIFIED

The register records, per relation, how many harnesses exercise it. **133 of 1,288 relations carry
`NONE`. 78 of those 133 are an artefact of how the column is computed, not a statement about the
tree.**

**The control makes the cause unambiguous.** Harnesses under `validation/` reach `src/` modules
131 ways statically and 27 ways through `await import(...)`; twelve modules are reached **only**
dynamically. Splitting the register on that one distinction:

| how a harness reaches the module | relations recording `NONE` |
|---|---|
| **only via `await import()`** | **78 of 78 — 100.0 %** |
| via a static `import` (control) | **0 of 1,155 — 0.0 %** |
| whole register | 133 of 1,288 — 10.3 % |

**100 % against 0 % on a single binary discriminator.** The column is derived from a static import
graph, and a dynamic import is not an edge in one. Nothing else needs to be posited.

**The twelve modules, and the 78 relations affected:** `flight-envelope.js` **32**,
`transport/high-lift.js` **17**, `transport/landing.js` **15**, `aircraft/airfoils.js` **7**,
`engine/aeropropulsive.js` **5**, `aircraft/compliance.js` **2**; the other six
(`risk.js`, `uncertainty.js`, `validation-residuals.js`, `drone/flight-worker.js`, `route.js`,
`engine/handlingcompare.js`) hold no retained relations, so they cost nothing here.

`flight-envelope.js` is the clearest case: `validation/aircraft-engine.mjs:721` reaches it with
`await import("../src/classes/aircraft/flight-envelope.js")`, and `validation/load-factor-source.mjs`
names the file explicitly, yet **all 32 of its relations record `NONE`.**

**WHAT THIS DOES AND DOES NOT ESTABLISH.** It establishes that `NONE` is **unreliable** for those
78 — it was recorded on the absence of a static edge, not on the absence of a test. It does **not**
establish that all 78 are covered: a harness importing a module proves the module is reached, not
that every relation inside it is asserted. **True coverage of the 78 lies somewhere above zero and
at or below 78, and fixing it requires per-relation analysis, not a global re-label.** Nothing is
re-graded here on the strength of an import edge alone; that would replace one unevidenced number
with another.

**What it corrects immediately** is a conclusion drawn from the column earlier the same day:
"51 of STRUCT's 131 relations have no regression harness, in two files". Of those 51, the 32 in
`flight-envelope.js` are exercised and only the **19 in `src/engine/gearlayout.js` are genuinely
unreferenced by any harness, static or dynamic**. The remaining **55** of the register's 133 `NONE`
rows sit in modules no harness reaches by either route, and those are the real gap.

**Why this matters beyond the number.** The five-column COMPLETE bar makes *regression protected*
one of five requirements, and **11 of Phase 0's 58 requirements score exactly `NO REGRESSION TEST`.**
A column that under-reports coverage therefore suppresses the audit's own completion figures, and it
does so **silently and pessimistically** — the mirror image of F-41, where an ungated metric failed
silently and flatteringly. Both are the same defect class: **a derived quantity whose derivation is
not stated alongside it cannot be trusted in either direction.**

**Remediation (audit tooling, not repository code).** The column must be recomputed with dynamic
imports treated as edges, and the recomputation must state that a module-level edge is not
relation-level coverage. `scratchpad/dyn_probe.mjs` holds the measurement. The register's
`regression` column is Phase-0 output, so correcting it reopens a Phase-0 quantity rather than a
Phase-2 one.
---

## F-44 — the gear module's returned `basis` string misattributes the main-gear station it did not use — LOW — VERIFIED

`gearlayout.js:201-207` returns `basis`, a provenance sentence emitted on every applicable call,
reading *"longitudinal and lateral stations measured from the RAVEN SWFT public release (nose
0.0824 fL, main 0.4114 fL, track/span 0.1903)"*. **The main station actually used is 0.4062 fL.**

`geometry.js:2438` passes `raven: RAVEN_GEAR`, and `RAVEN_GEAR.mainXoverFL` is **0.4062**
(`geometry.js:393`), documented there as the *mean* of v01_003 (0.4009) and SWFT (0.4114). So
0.4062 is not SWFT's number, and the sentence attributes it to SWFT. Measured: all six
configurations report `xMainRaven / fL = 0.4062` while the same call's `basis` says 0.4114
(`scratchpad/gear_probe2.mjs`).

That this is unpropagated drift rather than a typo is corroborated inside `RAVEN_GEAR` itself:
`wheelbaseOverFL = 0.3290` equals `0.4114 - 0.0824` exactly, while its own `mainXoverFL` implies
0.3238. The same stale 0.4114 also stands in the module header (l.37), in the in-line fallback
`?? 0.4114` (l.111), and in the measured-range claim at l.119-121.

**What this is not.** It is a provenance and documentation defect, **not a formula failure**.
STRUCT-199's expression `(R.mainXoverFL ?? 0.4114) * fL` is correct as written, and the live
coefficient 0.4062 is properly sourced with its spread recorded at `geometry.js:377-394`. The
register records STRUCT-199 `source = UNVERIFIED`, and **Q10 is therefore unchanged by this
finding** — the register is the authority for Q10 and was not edited. The fallback literal is
unreachable in production because `geometry.js` always supplies `RAVEN_GEAR`; what reaches the
user is a false sentence, not a wrong number.

---

## F-45 — `mainAftOfCG` is an algebraic identity of the formula that produces `xMain`, so it cannot fail — LOW — VERIFIED

The module header (l.47-48) presents *"The main gear must still come out aft of the CG, and that is
asserted"* as a check. `xMain` is defined by the moment balance at l.129, and substituting it gives

    x_main - x_cg = f (x_cg - x_nose) / (1 - f)

which is strictly positive for every `f` in the clamped range (0.01, 0.45) whenever the CG is aft of
the nose gear. Mutation over **1,845 cases**, `f` from 0.01 to 0.45 against `x_cg` from 0.10 to
0.90 fL: **false in 0**, with `min(x_main - x_cg) = 0.0015 m` (`scratchpad/gear_probe2.mjs`). It
falsifies only at `x_cg = 0.05 fL`, forward of the 0.0824 fL nose wheel, which is not a tricycle
layout.

**What this is not.** It is **not a failed engineering criterion**, and no configuration violates it:
the main gear genuinely is aft of the CG on every layout measured. The defect is that the flag
carries no information — it restates an identity as though it were a measurement, so it cannot
detect the condition it is named for. This is the N-16 / F-42 shape again: a check that passes for a
reason other than the one it advertises. **No ledger verdict changes from this finding.**

---

## F-46 — the gear mass centroid disagrees with `CG_STATIONS.gear` by 0.95-1.24 m, and nothing compares them — MEDIUM — VERIFIED

Three facts, separable and separately evidenced.

**(a) The disagreement, measured.** `xMassCentroidFrac` is **0.3759-0.4096 fL** across the six
configurations. `cg.js:51` carries `gear: { frac: 0.52, src: "LAY" }`, and cg.js's own itemisation
places the gear at station **4.479 m**. The gap is **0.951-1.241 m** on an 8.613 m fuselage.

**(b) There is no gate.** The header (l.67-71) states the value is *"returned for a gate to check,
not quietly reconciled"*. Verified: nothing imports `gearlayout.js` except `geometry.js:45`, by
either a static or a dynamic edge. No harness reaches it. The value is returned and nothing reads
it, so the disagreement the module was built to surface has never been surfaced.

**(c) The aircraft-level impact.** Computed from cg.js's *own* itemised masses rather than a
fraction quoted elsewhere in that file: the gear is **4.13-5.68 %** of itemised mass, so relocating
it from 0.52 fL to the measured centroid moves the total CG by **0.039-0.071 m, 0.46-0.82 % of fL**,
forward in every configuration (`scratchpad/gear_probe4.mjs`).

**What is not established: that the CG model is wrong.** Two parts of the tool disagree and either
could be the one in error. `0.52` is tagged `[LAY]`, a layout assumption; the centroid is a
consequence of the gear `landinggear.js` sizes, whose tyre mass is `[CAL]` and flagged *in that
module* as "the weakest number in this module". Deciding between them needs an independent gear-mass
source, which this audit did not obtain. Recorded as a disagreement of measured magnitude, not as a
defect in either module.

---

## F-47 — the turnover criterion is declined on a corpus claim that no longer holds, but the blocking quantity is a missing vertical CG — MEDIUM — VERIFIED

Four facts, separable and separately evidenced.

**(a) Source existence.** The header (l.29-32) states *"The corpus still has no tipback or turnover
criterion in any of its 879 extracted full texts"*. The corpus now carries a dedicated
`classes/cross-class/sources/gear/` tree holding **NACA-SR-63** (Wenzinger & Kantrowitz, *Notes on
Factors Affecting Geometrical Arrangement of Tricycle-Type Landing Gears*), which states the
turnover-triangle criterion — *"if this resultant vector intersects the ground ... outside the
triangle, then it will overturn"* — and **MIL-A-8863B §3.14.10.3**, tipback loads. Those sit
*outside* `extracted/`, so the sentence is literally true as scoped, and it is the scope that makes
it true. Inside `extracted/`, `classes/transport/extracted/NASA-TM-20240001480` (PEGASUS) treats
tipback and tipover as gear-placement constraints.

**(b) Relevance.** PEGASUS is a NASA account of this exact omission: gear on the fuselage, roll-over
angle left out of the constraint set, and *"the resulting tipover angle was violated and would
require moving the landing gear off the fuselage."* `gearlayout.js` mounts both legs on the
fuselage underside (`geometry.js:2441`) and asserts no turnover criterion. Two of the six
configurations — multicopter and sideBySide — fall back to the body-width track floor
(`trackFromSpan: false`), the narrowest track the module can produce.

**(c) The blocking quantity.** The criterion is **not computable in this tree as it stands**. It
needs the CG height, and `runSizing` exposes `xCGtotal` and `xCGempty` and **no vertical CG at
all**; `vertical-cg.js` exists only in the separate `src/classes/aircraft/` tree, of which
`gearlayout.js` is not part. The module's conclusion — assert no angle — therefore remains correct
today, for a reason it does not give.

**(d) What is not established: that any configuration overturns.** No turnover angle was computed,
because the input to compute it does not exist. No threshold is asserted either — the classical 63°
limit would be a number from memory, and a bound this audit cannot source is not a gate. This
finding records an unasserted criterion and a missing prerequisite, and says **nothing** about any
aircraft's ground stability.

**Remediation.** A vertical CG in the engine tree is the prerequisite; `src/classes/aircraft/vertical-cg.js`
is an existing referent. Until then the honest record is that the criterion is unevaluated, which is
what the ledger's UNVERIFIED already says.
---

## F-48 — the register records `source = UNVERIFIED` for all 13 F3 relations whose source is cited by equation number, and is now verified verbatim — MEDIUM — VERIFIED

`src/classes/aircraft/fuselage-bending-material.js` states its provenance in its own header —
*"WHAT IS SOURCED - MIT TASOPT 2.00 (Drela), Appendix A"* — and then names the equations it
implements, (A.84) through (A.100). The register nevertheless records **`source = UNVERIFIED` on
all 13 of its retained relations**, with `sourceLoc` pointing back at the module's own path rather
than at any document.

Those equations have now been checked against the corpus text, not against the module's
transcription of it (`datasets/mission-methods/extracted/MIT-Drela_TASOPT-2.00_Technical-Description.txt`):

| TASOPT | statement in the source | status |
|---|---|---|
| (A.14) | `sigma_x = (dp/2) R_fuse/t_shell` | verbatim |
| (A.15) | `sigma_theta = dp R_fuse/t_skin` | verbatim, with Drela's own reason for the two different thicknesses — *"the stringers share the axial loads, but the frames do not share the hoop loads"* |
| (A.79) | distributed term names exactly `W_pay+W_padd+W_shell+W_window+W_insul+W_floor+W_seat` | verbatim; the module's smeared set is the same seven |
| (A.87) | `I_hbend = max(M h/sigma_Mh - I_hshell/r_E, 0)` | verbatim |
| (A.88) | `sigma_Mh = sigma_bend - r_E (dp/2) R/t_shell` | verbatim |
| (A.89)-(A.92) | the quadratic and its three coefficients | verbatim |
| (A.96) | the closed-form back volume | verbatim |
| (A.97) | `V_c = 1/2[A(x_b)+A(x_f)] c_o wbar` | verbatim |

The module's quotation of Drela on `W_fix` — *"concentrated near the aircraft nose, and hence it
does not impose either a distributed load or a point load on the rear fuselage, and hence does not
appear in (A.79)"* — is also verbatim, and is what justifies excluding nose-stationed items from the
smear.

**Consequence for a number this audit reports.** Q10's UNVERIFIED count is the register's `source`
column by construction (the gate binds them with no escape clause), so **944 UNVERIFIED overstates
the real sourcing gap by at least these 13 rows.** This is the same class as F-41 and F-43: a
quantity the audit publishes, derived from an instrument that under-records.

**What this is not.** Not a repository defect — the module is sourced, and sourced correctly; it is
the *register* that does not say so. **Q10 is left UNVERIFIED on all 13 rows and the register is not
edited**, because the register is the authority the gate checks Q10 against, and editing it so that
it agrees with a conclusion drawn from it is the F-42 error. Correcting this needs an authorised
register change, recorded here so the cap is not mistaken for an absence of provenance.

---

## F-49 — `xb` and `xf` denote the opposite box faces from TASOPT's `x_b` and `x_f`, in a module that cites those equations by number — LOW — VERIFIED

In `fuselage-bending-material.js` (l.235) `xb` is the box FORWARD face and `xf` the box AFT face.
In TASOPT, (A.93)-(A.94) put `x_f = x_wing + dx_wing + c_o wbar/2` and
`x_b = x_wing - dx_wing + c_o wbar/2`: `x_b` is the real aft box face, and `x_f` is the FRONT face
*mirrored onto the aft side*, because Drela computes the front volume over the back by symmetry.
The two symbol sets are therefore transposed.

**The computation is correct.** `vClosedBack` (l.256) implements (A.96) with the module's `xf` —
the real aft face — which is exactly Drela's `x_b`, the correct lower limit; verified numerically
below. `vFront` integrates the real forward diagram from the nose rather than mirroring, which the
module states outright as a deliberate departure: F1 computes a genuine forward moment diagram, so
the symmetry assumption is not needed.

The hazard is traceability, in a module whose stated value is that its equations can be checked
against Drela by number: a reader comparing l.256 with (A.96) finds the symbol on the page and the
symbol in the code denoting opposite ends of the wing box. **No output is wrong and nothing is
re-graded.**
---

## F-50 — the knot conversion has two values in one codebase: the unit system's exact 1852/3600 and the class tree's truncated 0.514444 — LOW — VERIFIED

`src/lib/units.js` — the authoritative unit table — converts knots with `k: 1852 / 3600`, the
exact definition (0.5144444…). `src/lib/regdb.js` and `App.jsx` use the same exact form. But five
modules in the class tree each declare their own truncated copy, `KT = 0.514444`:

| file | line |
|---|---|
| `src/classes/aircraft/engine.js` | 40 |
| `src/classes/aircraft/flight-envelope.js` | 58 |
| `src/classes/aircraft/control-surfaces.js` | 84 |
| `src/classes/aircraft/fuselage-structure-loads.js` | 181 |
| `src/classes/transport/mission.js` | 48 |

The relative difference is **8.64e-7** on a speed. Because dynamic pressure goes as V², it reaches
**1.73e-6** on F1's `q_NE` (STRUCT-120) and the same on (A.72)'s `L_hmax`. Measured: recomputing
`q_NE` with the exact conversion gives a relative difference of 1.73e-6 against the module, and
recomputing it with the module's own constant gives **0.00e+0** — which isolates the deviation to
the constant and clears the equation.

**Severity rationale, and what this is not.** It is **immaterial to every engineering result
measured here**: 1.7e-6 is orders below any tolerance in the F1/F3 gates, and on the default
configurations `q_NE` does not reach a load at all, because `CL_hmax` has no default and the tail
airload is reported as not evaluated. It is recorded because a physical constant with two values in
one repository is a provenance defect regardless of magnitude, and because the copy that disagrees
with the authoritative unit table is the one in the engineering modules. **Not a defect in any F1
equation** — the equations verified exactly against their own constant.

**Not repaired.** Changing a shared constant is a production change and is not authorised in this
block. It is also the kind of change that belongs with the unit-register work rather than alongside
it. Recorded here so the measurement exists before anything is touched.
---

## F-51 — the 25.365(d) burst factor is applied as a sizing case while the module that owns it says it is "quoted, not applied", and nothing selects 1.33 from 1.67 — LOW — VERIFIED

14 CFR 25.365(d) is verbatim in the corpus
(`classes/transport/extracted/14CFR_25.365.txt`, line 10): the shell must withstand the relief-valve
differential *"multiplied by a factor of 1.33 for airplanes to be approved for operation to 45,000
feet **or by a factor of 1.67 for airplanes to be approved for operation above 45,000 feet**,
omitting other loads."* **The factor is a branch on the maximum operating altitude.**

`fuselage-structure.js:263` hardcodes `burstFactor: 1.33`, and its own `burstNote` (l.264) states:

> *"This tool has no maximum operating altitude and no relief-valve setting, so the factor is quoted,
> not applied"*

**It is applied.** `fuselage-pressure-shell.js:183` builds a sizing case at `burstFactor * deltaPPa`
and `l.187-192` lets it compete for the governing skin thickness. So two things hold at once:

1. **The note is stale and now false** — it describes behaviour the codebase no longer has, in the
   module that owns the constant. This is the F-44 shape: a statement about what the tool does that
   the tool contradicts.
2. **The branch is unguarded.** Nothing establishes that an aeroplane qualifies for 1.33 rather than
   1.67, because the selecting quantity — maximum operating altitude — does not exist anywhere in
   the tool. The note says so itself. The bizjet class cruises at **43,000 ft**, close enough to the
   threshold that real aircraft in the class certificate above it.

**Severity rationale — LOW, because it changes no output.** Measured on all three Part 25 classes at
dp = 59.3 kPa: **minimum gauge governs everywhere**, by a factor of 3 to 5.

| class | t built | t pressure demands | governing | burst case at 1.67 would need |
|---|---|---|---|---|
| transport | 1.600 mm | 0.3534 mm | gauge | 0.4336 mm — still below built |
| bizjet | 1.270 mm | 0.2059 mm | gauge | 0.2527 mm — still below built |
| turboprop | 1.020 mm | 0.2616 mm | gauge | 0.3210 mm — still below built |

So on every shipped configuration the 1.33-versus-1.67 choice **cannot change the skin thickness**:
the gauge floor is thicker than either. The defect is latent, and it becomes live only if a
configuration ever drives the pressure cases above the gauge floor.

**Not repaired.** Correcting the note, or gating the factor on a maximum operating altitude the tool
does not yet carry, are both production changes and are not authorised here. **Nothing is re-graded**
— no skin thickness, stress or mass in the audit record depends on the branch.
---

## F-52 — the torsion caveat cites the wing-box stiffness equation for the fuselage torsional case, and TASOPT's actual fuselage torsion shear flow is in the held corpus — LOW — VERIFIED

`fuselage-shear-flow.js` declines torsion twice, and both times names the same source:

> l.80: *"Torsion is not in this. Drela (A.202) sources the torsional case; it is a separate load and a separate flow, and it is not summed here."*
> l.206: *"Torsion is not included: Drela (A.202) sources it as a separate flow and it is not summed here."*

**(A.202) is not a fuselage relation.** Read verbatim in the corpus extract
(`datasets/mission-methods/extracted/MIT-Drela_TASOPT-2.00_Technical-Description.txt` l.2783) it is

```
G J_bar = 4 (w_bar - t_web)^2 (h_avg - t_cap)^2 / [ 2 r_h h_bar - t_cap ) / (G_web t_web) + 2 (w_bar - t_web) / (G_cap t_cap) ]
```

— the **torsional stiffness GJ of the wing or tail box**, chord-normalised, sitting under the heading
*"The areas and the bending and torsion inertias, all normalized by the normal chord"* (l.2730). It is
a stiffness of a different structure, not a shear flow of this one.

**The codebase itself identifies it correctly, twice, in other modules.**
`fuselage-structure-loads.js:13-14` calls TASOPT *"the same document this codebase already cites for
Bredt-Batho torsion in **the wing box** (A.202)"*, and `wing-structure.js:32` cites *"A.190-A.202"* for
the **wing box** idealisation. So the repository holds both readings of (A.202) at once, and the
fuselage module has the wrong one.

**TASOPT does give the fuselage torsion shear flow, and it is held.** At l.1192-1196 of the same
extract, driven by the vertical tail's torque:

```
(A.61)  L_vmax = q_NE S_v C_Lvmax
(A.62)  Q_v    = L_vmax b_v / 3 x (1 + 2 lambda_v) / (1 + lambda_v)
(A.63)  Q_v    = 2 A_cone tau_cone t_cone
```

(A.63) is the Bredt-Batho torsion-shell relation applied to the tail cone — precisely "the torsional
case" for a fuselage, and precisely what the caveat should point at. The corpus also carries
*"Figure A.3: Fuselage cross-section, shell/web junction tension flows, and torsion shear flow"* (l.727).

**Severity rationale — LOW, because it changes no number.** Torsion genuinely is not computed: the
module declines it, the decline is correct, and no output depends on which equation the decline
cites. This is the **F-44 shape** — a provenance string that misattributes — and, like **F-47**, a
capability declined against a corpus claim weaker than the corpus. Unlike F-47 there is no blocking
quantity: `Q_v` needs only `q_NE`, `S_v`, `C_Lvmax`, `b_v` and `lambda_v`, all of which the tool carries.

**Not repaired.** Correcting a citation is a production change and is not authorised here. **Nothing
is re-graded.**

---

## F-53 — the boom placement's stated reason, that no boom sits on the vertical axis, is false for every odd boom count, and the harness tests only even ones — LOW — VERIFIED

The module header gives the reason the booms sit where they do (l.62-67):

> *"The booms sit at theta_r = pi/2 + pi(2r + 1)/n, measured from the starboard horizontal, so that **NO boom sits on the vertical axis** and one panel straddles the top. That panel is the cut: by antisymmetry its flow is zero for a vertical load through the centre..."*

The research note repeats it (`FUSELAGE-STRUCTURE.md` section 2.1, build record).

**For every odd n, boom (n-1)/2 sits exactly on the vertical axis, at theta = 270 degrees.**
Setting pi/2 + pi(2r+1)/n = -pi/2 (mod 2 pi) gives 2r + 1 = n(2k - 1), which is solvable precisely
when n is odd. Measured:

| n | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 15 | 16 | 31 | 32 | 33 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| boom on the load axis | **yes, boom 1** | no | **yes, boom 2** | no | **yes, boom 3** | no | **yes, boom 4** | **yes, boom 7** | no | **yes, boom 15** | no | **yes, boom 16** |

n = 3 is reachable: `boomShearFlow` clamps at `Math.max(3, Math.floor(nBooms))`, so every input below 3
lands exactly there.

**The conclusion the false reason is invoked to secure nevertheless holds, and was verified rather
than assumed.** At n = 3, 5, 7, 9, 15, 17, 31, 33, 63 and 65 every gated property survives to machine
precision: resultant `|Fy/S_y - 1| <= 2.9e-16`, `|Fx|/S_y <= 3.0e-16`, closing constant
`|q0|/q_max <= 4.9e-16`, the (A.13) identity `<= 2.5e-16`, and the straddling panel's flow
`<= 4.7e-16` of q_max. The straddling panel's mid-angle is exactly 90.000000 degrees at every n,
odd or even.

**The property actually doing the work is not the stated one.** What the derivation needs is that the
boom SET be symmetric about the load axis, so that the discretised flow is antisymmetric and vanishes
in the panel straddling the top. Reflection theta -> pi - theta maps the set onto itself for **every**
n >= 3, whether or not a boom lies on the axis. A boom sitting at the bottom is harmless because the
true flow there is zero, so the jump it introduces is symmetric about the cut.

**Severity rationale — LOW: a documentation defect, not a computational one.** No shipped
configuration is affected — `DEFAULT_BOOMS` is 32 and the only production caller passes no override.
The cost is to the audit trail: a reader checking the derivation is handed a false reason for a
correct design choice. This is the **F-49 shape** — the computation is right and the stated
justification is not.

**Why it survived.** `validation/fuselage-shear.mjs` exercises n = 4, 8, 16, 32, 64, 128, 256 and 64
only. **No odd boom count is tested anywhere**, so the claim was never put in a position to fail.

**Not repaired.** Correcting the header sentence, or adding an odd-n case to the gate, are production
changes and are not authorised here. **Nothing is re-graded.**

---

## F-54 — the reported boom area and boom count are the unclamped input, not the ones the ring used, and nothing compares them — LOW — VERIFIED

`boomShearFlow` clamps the boom count before using it (l.106-107):

```js
const n = Math.max(3, Math.floor(nBooms)), R = radiusM;
const B = (2 * Math.PI * R * tShellM) / n;
```

`fuselageShearFlow` then reports the section with the **raw** value (l.199-200):

```js
section: { radiusM: R, tSkinM, tShellM, nBooms, material: {...},
           boomAreaM2: (2 * Math.PI * R * tShellM) / nBooms },
```

where `nBooms = opts.nBooms ?? DEFAULT_BOOMS` (l.155) is neither floored nor clamped. So
`section.boomAreaM2` and `section.nBooms` describe a ring that was not analysed. Measured on the
transport at dp = 59.3 kPa:

| `opts.nBooms` | `section.nBooms` | `ring.nBooms` | `section.boomAreaM2` | `ring.boomAreaM2` | disagreement |
|---|---|---|---|---|---|
| *(absent)* | 32 | 32 | 6.066458e-4 | 6.066458e-4 | **0.0e+0** |
| 32 | 32 | 32 | 6.066458e-4 | 6.066458e-4 | **0.0e+0** |
| 12.5 | 12.5 | 12 | 1.553013e-3 | 1.617722e-3 | **4.0 %** |
| 2 | 2 | 3 | 9.706333e-3 | 6.470889e-3 | **50 %** |
| 0 | 0 | 3 | **Infinity** | 6.470889e-3 | — |

**Nothing compares them.** `validation/fuselage-shear.mjs:133` checks `section.radiusM`,
`section.tShellM` and `section.tSkinM` against F2 by identity, and never reads
`section.boomAreaM2` or `section.nBooms` at all. This is the **F-46 shape**: one quantity computed
twice, by two expressions, with no gate holding them together.

**Severity rationale — LOW, and latent rather than live.** The sole production consumer is
`tabs.jsx:709`, which calls `fuselageShearFlow(result, { deltaPPa, material })` and passes no
`nBooms`. The default 32 is already an integer >= 3, so the clamp is the identity and the two
expressions agree exactly on every shipped configuration. The defect becomes live only if a caller
ever supplies a non-integer or sub-3 count. **No stress, margin or mass depends on it** — the
reported area is display-only and does not re-enter the calculation.

**Not repaired.** Dividing by the clamped `n`, or returning the ring's own `boomAreaM2`, are
production changes and are not authorised here. **Nothing is re-graded.**
---

## F-55 — the register records `source = UNVERIFIED` for all nine stowage relations whose T&RA coefficients are quoted verbatim from a vendored primary, and this is the third block in which that has happened — MEDIUM — VERIFIED

Every coefficient in `src/engine/gear/stowage.js` was checked this block against the Tire and Rim
Association rules as reprinted in the **Goodyear Aircraft Tire Data Book 2018**, which is vendored
whole at `classes/cross-class/sources/gear/Goodyear-databook-2018.{pdf,txt}` plus page images
`gy-page20.png`, `gy-page21.png`, `gy-page22.png`. Two were read verbatim out of the **text
extract**, not merely the research note:

> l.1692-1695: *"TIRE ASSEMBLIES  The approximate value for the radius of gyration for tire assemblies
> is calculated by the formula: Radius of gyration = Max O.D. + Min O.D. / 5.12"*
> l.1697-1699: *"WHEEL ASSEMBLIES  The approximate (+/- 20 %) value ... Radius of gyration (Incl.
> rotating brake parts) = 0.40 x \"D\" (\"D\" = rim ledge diameter)"*

matching `K_TYRE_DIVISOR = 5.12`, `K_WHEEL_FACTOR = 0.40` and `K_WHEEL_TOLERANCE = 0.20` exactly.
The growth and clearance coefficients (1.115, 0.075, 1.04, 17.02, 2.61, 3.348, 0.019, 0.23, 0.029,
0.15, 0.01, 0.10) sit on pp. 21-22, which the PDF carries as **images**, so they do not appear in the
text extract; they were verified against the T&RA reprint transcribed in
`LANDING-GEAR.md` §1.7a/§1.7b and, independently, by **recomputing every relation longhand from the
printed equations and comparing against the module across all 294 database rows at relative
error 0.0e+0** (267 bias, 27 radial).

**The register nevertheless records `source = UNVERIFIED` on all nine.**

**This is now a pattern, not an incident.** Counting only blocks completed so far:

| block | relations verified verbatim, register says UNVERIFIED | finding |
|---|---|---|
| `fuselage-bending-material.js` (F3) | 13 | F-48 |
| `fuselage-shear-flow.js` (F4) | 1 (STRUCT-098, (A.13)) | recorded in the ledger basis |
| `gear/stowage.js` (G7) | 9 | this finding |
| **total** | **23** | |

Twenty-three of the 944 relations the register calls source-UNVERIFIED have now been checked against
a held primary and **every one of them passed**. Nothing has yet been checked and found genuinely
unsourced. **So Q10's 944 UNVERIFIED (73.3 %) is not a measurement of the tool's sourcing — it is a
measurement of the register's recording**, and it overstates the real gap by an amount no one has
bounded. N-21 already flagged the 73.3 % as carried forward rather than derived from evidence.

**Q10 was left alone on all nine rows, and the register was not edited.** The gate binds Q10 to the
register's `source` column with no escape clause, and **editing the instrument so that it agrees
with a conclusion drawn from it is the F-42 error**. The correct output of an audit that finds its
own instrument under-recording is a finding, not a patch.

**Severity MEDIUM, and it is a measurement defect rather than an engineering one.** No shipped
number is wrong because of it. It is raised above LOW because the 73.3 % figure is one of the
headline statistics of the whole audit, it appears in the Phase 0, Phase 1 and Phase 2 status
records, and it is now known to be materially pessimistic.

**Not repaired.** A register pass is a change to `AUDIT/FORMULA-REGISTER.md`, which is not
authorised. **Nothing is re-graded.**


**AMENDED 2026-09-30, after the `flight-envelope.js` block.** That block verified a further **31**
relations against 14 CFR 25.331-25.349 — the regulation text where it is text, and the eCFR's
equation PNGs where it is not, via the transcriptions in `FLIGHT-ENVELOPE.md` §1 — and the register
records `source = UNVERIFIED` for **31 of its 32 rows**. The running tally is therefore
**13 (F3) + 1 (F4) + 9 (G7) + 31 (flight-envelope) = 54 relations checked against a held primary,
54 passed, 0 found genuinely unsourced.** That is 5.7 % of the 944 the register calls UNVERIFIED,
and the pass rate is still 100 %. Q10 was again left alone on every row.

**NOT AMENDED by the `fuselage-structure.js` block, 2026-09-30, and the reason is worth recording.**
That block audited 6 relations and added **no** relation to this tally, breaking a run of four. Five of
the six carry no coefficient of their own -- STRUCT-129 is a call, STRUCT-130 is the 4/pi of an
equal-area circle, STRUCT-131 is a subtraction of two stations, STRUCT-134 is a division, and
STRUCT-124's Ramanujan coefficients (3, 10, 4, 3) are **genuinely absent from the corpus**: a search
for Ramanujan, ellipse perimeter and ellipse circumference across the research tree returns nothing,
so `source = UNVERIFIED` is the CORRECT record there, not a pessimistic one. It was instead verified
without a source, against the exact perimeter computed two independent ways. The sixth, STRUCT-126, is
already recorded `DIRECTLY STATED`. **The tally therefore stands at 54 of 944, unchanged.** Do not pad
it with relations that do not fit the pattern -- the finding rests on a clean 54 checked, 54 passed.

**NOT AMENDED by the `gear/strut.js` block, 2026-10-01, for a different reason than last time.**
That block's eight relations split 5/3 on the register's `source` column, and NEITHER side adds to
this tally. The five carrying `DIRECTLY STATED` -- STRUCT-179, -180, -181, -182 and -188 -- were
checked against their primaries this block and the record is CORRECT, not pessimistic: NACA TN
4110's Cz = 0.02 for type I and 0.03 for types III and VII appears verbatim twice in the vendored
text, the coefficient 2.4 and the 0.6 exponent and the `(p + 0.08 p_r) w sqrt(wd)` denominator are
all legible in it, and the report states in words that eq. (24) is the *single continuous equation
form*, which is the form the module uses. 14 CFR 25.723(b)'s 12 f.p.s. is verbatim in the vendored
regulation. The three carrying `UNVERIFIED` -- STRUCT-184, -186 and -187 -- carry no coefficient of
their own: a subtraction of two tabulated lengths, and the denominator and quotient of eq. (23).
**The tally stands at 54 of 944, unchanged for the second block running.** A verified primary does
not enlarge this finding when the register already says the source is stated.

**AMENDED 2026-10-01, after the `gear/ground-loads.js` block: +1, the tally is now 55 of 944.**
That block audited three relations and **exactly one** fits this pattern. **STRUCT-160** carries
`source = UNVERIFIED` in the register, and its equation was verified **verbatim against the vendored
primary this block** — 14 CFR 25.493(e)'s `V_N` read directly from the Federal Register equation
image `eq-25.493e-VN.png`, reproduced term for term at relative **0.0e+0** over 2,000 cases, with
every symbol definition (`W_T`, `A`, `B`, `E`, μ = 0.80, `f`) confirmed word for word in the
vendored rule text. The register's record is pessimistic there, exactly as this finding describes.
**The other two do not qualify, and the reasons are recorded so the tally stays clean.**
**STRUCT-155** is already `DIRECTLY STATED` and the record is CORRECT, not pessimistic — f's
equation is likewise verbatim in `eq-25.493e-f.png`. **STRUCT-163** carries no coefficient of its
own: it is a sum of two moment terms, and the numbers the rule supplies (0.31, 0.20 and the 1.5
limit factors, all verified verbatim in 25.733(b)) live in the frozen `NOSE_TYRE_CASES` table at
l.138-145, which is not a C1 relation. **The tally is 55 checked, 55 passed, 0 found genuinely
unsourced.** Q10 was left alone on all three rows.

**AMENDED 2026-10-01 again, after the `gear/sink-speed.js` block: +1, the tally is now 56 of 944.**
**STRUCT-167** carries `source = UNVERIFIED` in the register and carries coefficients of its own —
4.4, the quarter-power exponent, and the 7 and 10 fps clips — every one of which was read verbatim
this block from the vendored 2011 CFR page text of **14 CFR 23.473(d)**: *"equal to 4.4 (W/S)1/4,
except that this velocity need not be more than 10 feet per second and may not be less than seven
feet per second."* It was then corroborated from a SECOND paragraph, 23.725(a)'s
h = 3.6 (W/S)^1/2, which the velocity law implies to within the regulation's own rounding.
**STRUCT-168 does not add**: its register `source` already reads DIRECTLY STATED, and the record is
correct — 23.727(a)'s 1.44 is likewise verbatim. **The tally is 56 checked, 56 passed, 0 found
genuinely unsourced.** Q10 was left alone on both rows.

**AMENDED 2026-10-01, after the `gear/tyre-select.js` block: +1, the tally is now 57 of 944.**
**STRUCT-191** carries `source = UNVERIFIED` in the register while the rule it implements is
verbatim in the vendored **Goodyear Aircraft Tire Data Book 2018** introduction — *"For loads less
than the maximum, the inflation pressure can be reduced proportionately"* — which the module also
quotes in its own `src:` string, and which this block checked against the vendored text rather than
against the quote. **STRUCT-189 does NOT add, and the reason is the one that applied to
STRUCT-124's Ramanujan coefficients in the `fuselage-structure.js` block:** it asserts that the
GENERATED tyre table is sorted by rated load, and no primary states the sort order of a generated
file. It was instead verified **without a source**, by recomputing the invariant over all 294 rows
(0 inversions) and by proving the two search paths it guards agree over 2,044 cases. `UNVERIFIED`
is the CORRECT record there, not a pessimistic one. **The tally is 57 checked, 57 passed, 0 found
genuinely unsourced.** Q10 was left alone on both rows.

**AMENDED 2026-10-01, after the `trainer/performance.js` block: +1, the tally is now 58 of 944.**
**FORMULA-AERO-055** carries `source = UNVERIFIED` in the register while its coefficient is
printed verbatim in the vendored primary: NASA RP-1060 p.343 gives
`(cL3/2/cD) max = 1.345 (A&) 3/4 / (cD,o) ll4`, and the module uses 1.345 identically. **The other
twelve relations in that file do not add.** Six already read `DIRECTLY STATED` and the record is
correct — AERO-057, MISSION-005, MISSION-006, MISC-032, MISC-034, MISC-036 and MISC-037, whose
33 000, 19, 375 and density-ratio forms were all confirmed this block. The remaining
`UNVERIFIED` rows carry **no coefficient of their own**: AERO-054 and AERO-056 are closed forms
*derived* from the primary's prose rather than printed by it, STRUCT-154 and MISC-031 are standard
definitions, and MISC-028 is a digitisation of a figure, whose breakpoints are a reading of a chart
and not a published constant. **The tally is 58 checked, 58 passed, 0 found genuinely unsourced.**
Q10 was left alone on all thirteen rows.

**AMENDED 2026-10-02, after the `engine/noise.js` block: +3, the tally is now 61 of 944.** Three
relations carry `source = UNVERIFIED` in the register while their coefficients are printed in a
held primary: **FORMULA-REG-014**, whose 12194, 20.6, 107.7 and 737.9 are the A-weighting constants
of Clarke 2021 equation (22); **FORMULA-REG-049**, the 0.7-radius station of Marte and Kurtz's
V₀.₇; and **FORMULA-REG-055**, the Strouhal number 0.28, printed in Marte and Kurtz Appendix C.
All three reproduce. **The tally is 61 checked, 61 passed.** For the first time the block also
found the REVERSE case, which this tally does not count: **FORMULA-REG-031 and FORMULA-REG-032 read
`DIRECTLY STATED` and are not what their source states** (F-88). Q10 was left alone on all
forty-two rows.
---

## F-56 — three unguarded degenerate paths in the stowage chain, each latent against the shipped tyre database — LOW — VERIFIED

`stowage.js` is among the better-guarded modules in the tree: `grownEnvelope` refuses a row whose
rim diameter, section width or outside diameter is missing, zero, negative or NaN (l.64-66);
`clearances` refuses a speed that is not positive with the `!(speedMph > 0)` idiom, which correctly
also rejects NaN and undefined (l.83); and the radial branch refuses a rim width that is missing,
zero, NaN or not below the grown width (l.87-89). All of that was executed and confirmed. Three
paths are nevertheless open.

**1. The radial clearance takes a square root the module does not guard, beside one it does.**
Line 90 evaluates `Math.sqrt(D_G - D)` and `Math.sqrt(W_G - rimWidthIn)`. The **second** argument
is guarded at l.87; the **first** is not. `grownEnvelope` requires D, W and D_O to be finite and
positive but never requires `D_O > D`, so a row with an outside diameter below its rim diameter is
accepted. Measured on a radial forced to `odMaxIn = 5` against `rimDiaIn = 12`:

```
grownEnvelope resolved? true    D_G = 5   D = 12   ->  D_G - D = -7
clearances    C_R = NaN   R_x = NaN
```

The NaN propagates unannounced into `bayHalfHeightIn`, `crossSectionIn2` and `crossSectionM2`.
On the bias path the same input gives no NaN but a **negative section height**, `H = -1`, and a
grown diameter of 2.909 in, again without refusal.

**2. `radiiOfGyration` guards one operand of a two-operand sum.** Line 104 is
`Number.isFinite(tyre.odMinIn) ? (tyre.odMaxIn + tyre.odMinIn) / K_TYRE_DIVISOR : null` — the test
is on `odMinIn`, the expression also reads `odMaxIn`. With `odMinIn` finite and `odMaxIn` absent
or NaN the result is `NaN` rather than the `null` the function uses everywhere else to mean
"not formable", and `kTyreNote` stays `null`, so the output asserts a number it does not have.

**3. `tyresPerLeg = 0` defeats the nullish coalesce.** Line 132 is
`tyresPerLeg ?? sel.wheelsPerAxle ?? sel.tyres ?? 1`, and `0` is not nullish, so it is kept:

| `tyresPerLeg` | `perLeg.tyres` | `bayWidthIn` | `crossSectionM2` |
|---|---|---|---|
| null / undefined | 2 | 11.607 | 0.11713 |
| 1 | 1 | 5.804 | 0.05856 |
| **0** | **0** | **0.000** | **0.00000** |
| **-3** | **-3** | **-17.411** | **-0.17569** |
| **2.5** | **2.5** | **14.509** | **0.14641** |

A negative tyre count yields a **negative bay width and a negative cross-sectional area**, and a
fractional count yields two and a half tyres, all reported as resolved.

**Severity rationale — LOW, because all three are latent against everything that ships.** Checked
across all **294 rows** of the generated tyre database:

| condition | rows | margin |
|---|---|---|
| `odMax <= rimDia` (would NaN the radial root) | **0** | smallest `odMax - rimDia` is **6.70 in** |
| `odMin` finite while `odMax` is not (would NaN k_tyre) | **0** | — |
| radial with `rimWidth >= W_G` | **0** of 27 | smallest `W_G - A` is **1.15 in** |
| `speedMph` missing or non-positive | **0** | — |

and `tyresPerLeg` reaches the module only from `gear.js:166`, which passes `wheelsPerAxle` from the
frozen table `MAIN_WHEELS_PER_AXLE = { transport: 2, bizjet: 2, turboprop: 2, trainer: 1 }` with a
`?? 2` fallback, or the literal `2` for the nose. The reachable set is `{1, 2}`.

These become live only if the database is regenerated from a different edition, if a caller supplies
its own tyre object — all four functions are exported — or if a wheel count is ever computed rather
than looked up.

**Not repaired.** Adding a `D_O > D` precondition, testing both operands of (45), and rejecting a
non-positive or non-integer tyre count are production changes and are not authorised here.
**Nothing is re-graded.**
---

## F-57 — the envelope declares one unsourced number and carries at least four; one of them can set V_C, and two are live on the turboprop — MEDIUM — VERIFIED

`flight-envelope.js` states in its returned caveats (l.327-328):


> *"The negative stall branch uses |C_N,min| = 0.70 C_N,max. That ratio is ASSUMED: no source opened
> gives it, and **it is the only unsourced number in the diagram**."*

The declaration of the 0.70 is exemplary. The claim that it is the only one is false. Reading the
module against 14 CFR 25.335 and 25.341, which are both vendored verbatim, four more numbers carry
no source, and the regulation supplies none of them:

| value | line | what it does | declared? |
|---|---|---|---|
| **1.5** | 201, 206 | a floor on V_C, `Math.max(1.5 * vs1Kt, ...)` | **no** |
| **1.03** | 168 | `cnOverCl`, the C_N/C_L ratio at the stall | **no** |
| **0.85** | 219 | MLW/MTOW when `result.mlwKg` is absent, feeding R_1 | **no** |
| **0.80** | 220 | MZFW/MTOW when `result.mzfwKg` is absent, feeding R_2 | **no** |

**25.335(a) contains no 1.5 V_S1 minimum.** Its three clauses are (a)(1) "sufficiently greater than
V_B", (a)(2) "V_C may not be less than V_B + 1.32 U_REF", and (a)(3) the Mach limit. The module's
own comment at l.193 says the fallback "is the REGULATORY MINIMUM, not a guess at the real V_C" —
but the expression it guards is a maximum of the regulatory minimum **and an unsourced floor**.

**The floor is not inert: it takes over at high wing loading.** Sweeping wing area on the transport:

| W/S lb/ft² | V_S1 kt | V_C kt | 1.5 V_S1 | what sets V_C |
|---|---|---|---|---|
| 61.7 | 112.45 | 215.23 | 168.67 | 25.335(a)(2) |
| 123.5 | 159.03 | 265.99 | 238.54 | 25.335(a)(2) |
| 176.4 | 190.07 | 296.85 | 285.11 | 25.335(a)(2) |
| **246.9** | **224.90** | **337.35** | **337.35** | **1.5 V_S1 — the unsourced floor** |

The three shipped classes sit at 61.5 to 123.5 lb/ft², where 25.335(a)(2) governs, so this is latent
on what ships. It becomes live above roughly 200 lb/ft².

**The 0.85 and 0.80 fallbacks are NOT latent — the turboprop uses both.** `designAircraft({type:"turboprop"})`
returns no `mlwKg` and no `mzfwKg`, so R_1 and R_2 fall to 0.85 and 0.80, and they feed
F_gm = √(R_2·tan(πR_1/4)), hence F_g, hence U_ds, hence the gust load factor. Measured:

| R_1 | R_2 | F_g | U_ds ft/s | n_gust | vs the default |
|---|---|---|---|---|---|
| **0.85** | **0.80** | 0.82707 | 37.4429 | **1.9405** | the shipped value |
| 0.95 | 0.90 | 0.88606 | 40.1132 | 2.0076 | +3.46 % |
| 0.97 | 0.92 | 0.89841 | 40.6725 | 2.0216 | +4.18 % |

The ATR 72-600, the very aircraft the module's header uses as its turboprop benchmark, publishes
MTOW 23,000 kg, MLW 22,350 kg and MZFW 21,000 kg, i.e. **R_1 = 0.9717 and R_2 = 0.9130**. At those
ratios n_gust is **2.0203 against the shipped 1.9405 — the defaults understate the gust load factor
by 4.11 %**, and the reported margin to the manoeuvre case falls from **22.4 % to 19.2 %**.

**The direction matters: the error is NOT conservative.** A lower R_1 and R_2 give a lower F_g, a
lower U_ds and a lower gust load. The module already flags one other non-conservative substitution
(the wing lift-curve slope in place of the airplane's) and this one is undeclared.

**Severity MEDIUM.** No wing box is resized by it — the manoeuvre case still governs all three
classes with 19 to 36 % margin, and 25.337(b) is what the sizing loop reads. It is above LOW because
a displayed engineering quantity is understated by ~4 % on a shipped class, from two numbers the
module states it does not have.

**Not repaired.** Sourcing the ratios, deriving MLW and MZFW for the turboprop, or removing the
1.5 V_S1 floor are production changes and are not authorised here. **Nothing is re-graded.**

---

## F-58 — the envelope validates its aircraft but not its options, and a NaN produces a definite "governing" verdict — LOW — VERIFIED

`flightEnvelope(result, opts)` guards the aircraft well. Wing area, span and MTOW are each
required finite and positive (l.142) and a Part 23 class is refused outright with its reason
(l.143-150). Tested: zero, negative and NaN wing area, span and MTOW all return `null`.

**`opts` receives no validation at all**, and two of its values put the whole diagram beyond the
reals while the result still reports a definite conclusion:

| opts | V_S1 | V_C | n_gust,max | `governing` |
|---|---|---|---|---|
| `clMax: 0` | **Infinity** | **Infinity** | **Infinity** | **"gust"** |
| `clMax: -1.4` | **NaN** | **NaN** | **NaN** | **"manoeuvre"** |
| `vcKt: -300` | 159.03 | **−300.00** | 0.5758 | "manoeuvre" |
| `vdKt: 0` | 159.03 | 261.21 | 1.6049 | "manoeuvre" |

The NaN row is the one that matters. `governing` is decided at l.289 by

```js
const governing = nGustMax > nLim ? "gust" : "manoeuvre";
```

and `NaN > nLim` is `false`, so a diagram in which **every** speed and load factor is NaN
reports that the manoeuvre case governs — the same string, and the same confidence, as a sound run.
Nothing in the returned object says the numbers are not real.

**A second unreported condition, in the V_C fixed point.** Lines 202-209 iterate V_B and V_C to a
tolerance of 1e-6 with a cap of 40, and **carry no convergence flag**: on exhausting the cap the loop
exits with its last iterate, indistinguishable from a converged one. The iteration itself is sound,
and this block proved it rather than assuming it — see the Q18 determinations: the map is a
**contraction with |f'(V_C*)| = 0.194 to 0.244**, and seeds from 0.01 V_S1 to 1000 V_S1 converge to
the same V_C within 5.7e-7 kt in **12 to 15 iterations of the 40 available**. So the cap has 2.7×
headroom on everything measured. The gap is that a future case which exhausted it would not say so.

**Severity rationale — LOW, because `opts` is not reachable from production.** Both callers,
`fuselage-structure-loads.js:420` and `tabs.jsx:211`, invoke `flightEnvelope(result)` with no
second argument. `clMax` then falls to `p.clMaxClean`, which comes from the frozen, sourced
aerofoil table in `airfoil-data.js` (values 1.39 to 1.77), or to the literal 1.4. The module is
nevertheless exported and its options are a public interface.

**Not repaired.** Validating `opts`, and reporting convergence, are production changes and are not
authorised here. **Nothing is re-graded.**

---

## F-59 — a registered relation contains arithmetic that cannot change its value — LOW — VERIFIED

`flight-envelope.js:341`, the ISA temperature ratio, is registered as FORMULA-STRUCT-046:

```js
return h < 11000 ? 1 - 2.25577e-5 * h * (1 / (1 - 0)) * 1 : 0.751865;
```

`(1 / (1 - 0))` is `1`, and multiplication by `1.0` is exact in IEEE 754, so
`* (1 / (1 - 0)) * 1` cannot change the result. Checked at 974 altitudes from 0 to 36,000 ft:
**bitwise identical** to `1 - 2.25577e-5 * h`, worst absolute difference exactly 0.

The value itself is correct: the ISA temperature ratio is θ = 1 − L·h/T_0 with L = 0.0065 K/m and
T_0 = 288.15 K, and 0.0065/288.15 = 2.25577e-5. The relation was independently checked against the
exact ISA closed form this block and agrees to **6.4e-8** below the tropopause.

**Why it is worth recording rather than ignoring.** The Phase 10 atmosphere audit already covers this
line (`ATMOSPHERE-AUDIT.md` row for `flight-envelope.js:344-349`, verdict **PASS** at ≤1.3e-4 %) —
but it transcribes the expression as `theta = 1 − 2.25577e-5 h`, silently normalising the dead
factor away. So the arithmetic is unremarked everywhere: the audit that looked at it did not see it,
and the register records the line verbatim without comment. Inert arithmetic in a sourced relation
invites a reader to hunt for a meaning that is not there — most likely a lapse-rate or
tropopause-ratio parameterisation that was removed without removing its skeleton.

This is the **F-45 shape**: a construct that carries no information, recorded because carrying no
information is itself the finding.

**Severity LOW, and it changes nothing.** No value, no unit, no verdict anywhere in the tool depends
on it.

**Not repaired.** Deleting the factor is a production change and is not authorised here.
**Nothing is re-graded.**
---

## F-60 — the nose and tail-cone lengths relabel themselves as Torenbeek-sourced on legal inputs, the promotion is tautological, and the check that guards it only ever samples four cases — MEDIUM — VERIFIED

The pressurized shell's two bulkhead stations are the general arrangement's nose and tail-cone
lengths. `fuselage-structure.js:154-157` declares what they are:

> *"Both of those lengths are drawing conventions in the general arrangement, so the two bulkhead
> stations are conventions too and are reported as such."*

`geometry.js` builds them as the smaller of a length fraction and a Torenbeek fineness cap:

```js
const noseLen = conePart(Math.min(0.14 * L, FUSELAGE_FINENESS.nose * D), FUSELAGE_FINENESS.noseRange, "nose");
const tailLen = conePart(Math.min(0.26 * L, FUSELAGE_FINENESS.tailCone * D), FUSELAGE_FINENESS.tailConeRange, "tail-cone");
```

and `conePart` marks the result `sourced` when the fineness it ends up with lands inside the
published range, `drawn` otherwise. The comment above it states, as measured fact:

> *"MEASURED, AND IT DOES NOT. On every class this tool sizes, the length fraction binds and the
> result falls BELOW both published ranges ... **So the 1.8 and 3.0 caps never bind and are inert**,
> and these lengths stay declared conventions carrying no dimension line."*

**That is true at the four class defaults and false across the declared input population.** Sweeping
the three fuselage inputs over the min/max each class publishes in its own `defaults.js`
(transport L 60-250 ft, W 8-22, H 8-25; turboprop 40-150, 6-14, 6-15; bizjet 30-110, 4-12, 4-12;
trainer 15-40, 2.5-6, 3-7), 7 points per axis, 343 cases per class, **1,372 cases**:

| class | nose cap binds | nose marked sourced | tail cap binds | tail marked sourced |
|---|---|---|---|---|
| transport | 55 | **106** | 70 | **122** |
| turboprop | 40 | **90** | 64 | **119** |
| bizjet | 34 | **56** | 55 | **91** |
| trainer | 2 | **8** | 4 | **14** |
| **total** | **131** | **260** | **193** | **346** |

So 260 of 1,372 nose lengths and 346 of 1,372 tail-cone lengths carry
`sourced: true` and a Torenbeek citation, not the convention the owning module describes. The
smallest legal input that flips the nose, per class:

| class | inputs | nose fineness | label |
|---|---|---|---|
| transport | L 85.78 ft, W 8, H 8 | 1.501 | `sourced: true` |
| turboprop | L 64.32 ft, W 6, H 6 | 1.501 | `sourced: true` |
| bizjet | L 42.86 ft, W 4, H 4 | 1.500 | `sourced: true` |
| trainer | L 32.21 ft, W 2.5, D 3 | 1.503 | `sourced: true` |

with the cite read straight off the object:
*"nose fineness 1.50 — inside the published 1.5–2, Torenbeek 1982, §3.5.1, pp. 93-94"*.

**The promotion is tautological whenever the cap is what binds.** The nose cap is 1.8 and the
published range is 1.5 to 2.0; the tail cap is 3.0 and the range is 2.5 to 3.0. When `Math.min`
picks the cap, the fineness is *exactly* the cap, so `within(fineness, range)` cannot fail. The
drawing then attributes the cone length to Torenbeek when the number came from the tool's own
ceiling. 129 of the 260 nose promotions and 166 of the 346 tail promotions arrive the legitimate way
(the length fraction binds and happens to land in range); the rest are the cap certifying itself.

**And at the tail the test sits ON a closed endpoint, so a last bit decides the label.** In 13 of the
transport cases the tail cap binds, yet the length is marked a convention, because

```
len = 3.0 * D = 9.44880000000000209      D = 3.14960000000000040
fineness = len / D = 3.00000000000000044   -> fineness <= 3.0 is FALSE by 4.441e-16
```

The message it then prints contradicts itself:
*"tail-cone fineness 3.00 is outside the published 2.5–3"*. Over 200,000 values of D,
`(3.0*D)/D > 3.0` in **13,321** of them — 6.7 % of the reals land on the wrong side of the
endpoint. The nose has margin (1.8 against an upper bound of 2.0) and never ties: 0 of 200,000.

**Why the shipped check does not catch it.** `validation/fuselage-outline.mjs` §7 asserts the
claim directly —

```js
const anyInside = measured.some(([, , , inside]) => inside);
check(!anyInside, "no class currently draws a cone inside Torenbeek's ranges -- the caps are inert", ...);
```

— but `measured` is built from `designAircraft({ type, mode: "size", params: {} })` for the four
classes and nothing else. Measured at those four points: nose fineness 1.34, 1.07, 1.27, 0.85 and
tail 2.49, 1.99, 2.36, 1.57, all outside, all marked conventions. The check is correct and passes
for the right reason at the only four points it looks at. Its own comment anticipates the wrong
trigger — *"If a future change makes a cone slender enough to land in range, this check fails and
the comment in geometry.js has to be re-measured"* — but no future change is needed. A user typing a
legal fuselage length does it today, and the check never sees it.

**What is NOT wrong.** The station VALUES are correct in every one of the 1,372 cases: longhand
`fwdX = noseL` and `aftX = L - tailL` reproduce FORMULA-STRUCT-131 exactly, 0 mismatches, and
`sized` is `false` on both lengths throughout — so `fuselage-structure.js`'s own
`boundariesSized: false` is right on every case, and its prose errs conservatively rather than
overclaiming. No length, area, count or pitch changes. What changes is the provenance a reader is
shown, on the one view whose governing rule (STRUCTURAL-LAYOUT.md §4.5) is that a line is either a
computed quantity or a sourced convention and *"a drawing that invents structure is worse than one
that shows less."*

**Severity MEDIUM.** Reachable from the published input ranges without any code change, on all four
classes; it mislabels the provenance of a drawn dimension, which is precisely the failure the
module's own rule exists to prevent; the guarding assertion is blind to it; and a production comment
states the opposite as a measured result. It is below HIGH because no engineering number moves.

**Not repaired.** Tightening `conePart` so a cap-bound length cannot certify itself, comparing the
fineness with a tolerance at the closed endpoint, and re-measuring the geometry.js comment are all
production changes and are not authorised here. **Nothing is re-graded.**

---

## F-61 — the trainer frame-pitch band is declared 10-23 in against the 10.0-22.75 in of the only held transcription — LOW — VERIFIED

`fuselage-structure.js:87-88` declares the light-aircraft frame pitch:

```js
trainer: { pitchM: 16.8 * IN, loM: 10 * IN, hiM: 23 * IN, sourced: true,
           source: "10-23 in, mean 16.8 in: FAA-H-8083-31B Fig. 1-88, measured over the frames of a light aircraft" },
```

The FAA handbook itself is not vendored. The only held transcription of that figure is
`eVTOL_Sizing_Research/classes/cross-class/STRUCTURAL-LAYOUT.md` §3.2, which records it as:

> **FAA-H-8083-31B Fig. 1-88, p. 1-38** | unidentified light twin, side view, 23 stations
> FS −97.0 … FS 273.52 | **10.0 – 22.75 in**, mean ≈ 16.8 in

The lower bound and the mean match exactly. **The upper bound does not: the code carries 23 in where
the transcription carries 22.75 in**, a 0.25 in (1.1 %) widening of the band, in the direction that
makes the acceptance test easier to pass. The transport band needs no such rounding and gets none:
the code's 20-21 in is exactly the two held primaries, NASA CR-2000-209337 (IAS) Fig. 5-4 p. 65 at
**20.0 in** and NASA CR-4734 (ATCAS) §5.1 p. 5-1 at **21 in nominal**, and §3.2 endorses the pair in
its own words — *"Two sources, two programmes, two materials, 20-21 in. That is a defensible
convention."*

**The widened bound is inert on everything the tool can be asked to draw.** `fp.hiM` is read in
three places: it decides `frames.inBand` (l.174), it is reported verbatim as `frames.bandHiM`
(l.173), and it is printed into the out-of-band caveat (l.315). Only the first has any
consequence; the other two are display. Over the 343 declared trainer cases the drawn pitch spans
**16.29 to 18.00 in**,
so it clears 22.75 in by 26 % and the two bounds cannot be distinguished by any legal input. The
band is genuinely capable of failing — it is not a bound that can never bite: at a shell length of
5 m the transport rounding puts the pitch at 19.685 in, outside its own 20-21 in band — but the
smallest transport shell in the declared population is 10.97 m, so the out-of-band caveat at
`l.313-317` is itself unreachable, 0 of 686 frame-drawing cases.

**Severity LOW.** No drawn pitch is affected, no verdict rests on it, and the direction of the
rounding is the only reason it is recorded at all: a threshold that does not match its cited source
is worth a line even when it is inert, because the next change to the pitch or the shell length is
what would make it matter.

**Not repaired.** Correcting `hiM` to 22.75 in is a production change and is not authorised here.
**Nothing is re-graded.**
---

## F-62 — the derived tyre-efficiency curve loses its own analytic bound at small deflection, and the check that pins the bound samples only where the arithmetic is well conditioned — LOW — VERIFIED

`strut.js` derives the tyre energy-absorption efficiency in closed form, integrating
NACA TN 4110's eq. (24) against MIL-L-8552C section 3.5.2's definition. The mathematics bounds the
result: both limits are one half and the interior is below it, so **eta_t lies in (0, 0.5) for every
positive deflection ratio**. The gate asserts exactly that:

```js
const samples = [0.05, 0.1, 0.2, 0.4, 0.8, 2, 10, 100];
check(samples.every((X) => tyreEfficiency(X) < 0.5),
  "and never exceeds one half, at any deflection", ...);
```

**The coded form does not satisfy that bound, and the eight samples are all in the range where it
does.** The numerator differences `X^2/2 - Cz X + (Cz^2/0.6)(1 - exp(-0.6X/Cz))` cancel to
leading order as X falls, and the subtraction is done in the order written:

| X | eta_t returned | analytic value |
|---|---|---|
| 1e-5 | 0.4999750058 | 0.4999750 |
| 1e-7 | 0.4999957748 | 0.5000000 |
| **1e-8** | **0.5008150516** | 0.5000000 |
| 1e-9 | 0.3778560326 | 0.5000000 |
| 1e-10 | **21.6719156376** | 0.5000000 |
| 1e-12 | **6206.7785989993** | 0.5000000 |
| 1e-13 | **-16590738.3175** | 0.5000000 |
| 1e-14 | **-1830576988.714** | 0.5000000 |

So the function returns a value above one half from X = 1e-8, exceeds the bound by four orders of
magnitude by 1e-12, and goes **negative** below 1e-13 — a negative energy-absorption efficiency.
The gate's lowest sample is 0.05, six orders of magnitude above where this starts.

**It is a conditioning defect, not an algebra defect.** Rewriting the same expression with
`-Math.expm1(-0.6 * X / cz)` in place of `1 - Math.exp(...)` holds the analytic value to
**4.4e-16 or better at every X tested from 1e-12 to 0.25**, and agrees with the shipped form to
0.0e+0 wherever the shipped form is sound. The closed form itself was independently confirmed this
block against 200-node Gauss-Legendre quadrature (relative 0.0e+0 to 1.6e-15) and a 200,000-step
Simpson rule (7.1e-15) at seven deflection ratios including the production median and the textbook
0.407, so the integral is right and only its evaluation is fragile.

**Severity LOW, because nothing production reaches it.** The two callers obtain X from the shipped
tyre table, where all 294 rows give X between **0.018750 and 0.378378**; the smallest is 2.0e6 times
larger than where the bound first breaks. `tyreEfficiency` is nevertheless exported and takes an
arbitrary deflection ratio.

**Not repaired.** Substituting `expm1` is a production change and is not authorised here.
**Nothing is re-graded.**

---

## F-63 — the stroke solver validates four of its seven inputs, and the three it does not include the two that can make the stroke negative while it still reports success — LOW — VERIFIED

`strokeFromEnergy({ V, L, N, etaS, etaT, deltaT, g })` solves LANDING-GEAR.md eq. (23). Four
inputs are guarded at l.143 and the denominator at l.148, and both guards work: zero, negative and
NaN values of V, N, eta_s and g are each refused with a reason, and `eta_s N = 1 - L` **exactly**
is refused rather than divided by, confirmed by execution.

**eta_t, delta_t and L are not validated at all**, and two of them put the result outside physics
while `resolved` stays true:

| input | value | result | `resolved` |
|---|---|---|---|
| `etaT` | NaN | `strokeM` = NaN | **true** |
| `etaT` | 5 (an efficiency above 1) | `strokeM` = -0.344884 m | **true** |
| `deltaT` | NaN | `strokeM` = NaN | **true** |
| `deltaT` | -0.1 m | `strokeM` = +0.376742 m | **true** |
| `L` | 5 | `strokeM` = -0.002426 m | **true** |

A NaN stroke reported as resolved is the F-58 shape: the caller is handed the same success flag a
sound run produces. A negative stroke is worse than NaN, because it is a number a consumer will
format and display.

**L is not held to the regulation's ceiling.** LANDING-GEAR.md records L as the lift-to-weight ratio,
**at most 1.0 for Part 25 per 25.473(b)** and at most 2/3 for Part 23 per 23.473(e), and 25.723(b)
itself says *"assuming airplane lift not greater than airplane weight"*. L = 5 passes, because the
only test applied to L is whether `etaS * N - (1 - L)` comes out positive, and an L above 1
makes that term larger rather than smaller. The signature's default is L = 1.0, which is the Part 25
value; measured, all three Part 25 classes run at exactly that (denominator 1.5 = 0.75 x 2), and the
trainer never reaches the strut at all, refusing earlier for want of a wheelbase. At L = 2/3 the same
case gives a stroke **39.66 % longer**, so a Part 23 class arriving on the default would be under-strutted.

**A smaller instance of the same shape next door.** `tn4110Force` guards with
`if (!(x > 0)) return 0;` and so returns a **force of zero for a NaN deflection** rather than
refusing; a zero force is a plausible number, and NaN would at least propagate. Its Cz argument is
unguarded too: Cz = 0 silently returns the un-offset line and a negative Cz returns a negative force
(-10.0137 at x = 0.25).

**Severity LOW, all latent.** `gear.js` supplies eta_t from `tyreEfficiencyFor`, which is
bounded in (0, 0.5) by the mathematics and measured at 0.448 to 0.469 over the whole tyre table;
eta_s from the frozen `ETA_OLEO.variableOrifice` = 0.75; delta_t from the tyre geometry; and L
by omission, taking the Part 25 default. Measured strokes on the three Part 25 classes are 255 to
283 mm, all positive. The module is exported and its options are a public interface.

**Not repaired.** Validating the remaining inputs, bounding L at 1.0 and refusing a NaN deflection
are production changes and are not authorised here. **Nothing is re-graded.**

---

## F-64 — one row of the shipped tyre table gives a deflection of 1.2 percent where the table's median is 17, the tool computes from it without comment, and a load window of 239 lb selects it — LOW — VERIFIED

The tyre deflection that feeds both the efficiency and the stroke is
`odMaxIn / 2 - slrIn` (FORMULA-STRUCT-184). For `25.5x8.0-14` 16 PR, part
`461B-3233-TL`, the shipped table gives odMaxIn 25.5 and slrIn **12.6**, so the deflection is
**0.15 in on a 12.75 in radius, 1.18 %**, and the deflection ratio is **0.018750** against a
median of **0.251613** across the 294 rows — a factor of 13.

**The transcription is faithful; the anomaly is in the primary.** Column 18 of the data book's table
is the Static Loaded Radius, and the two rows for this very size read:

| row | part | odMax | odMin | width | ... | **SLR** | flat radius |
|---|---|---|---|---|---|---|---|
| 16 PR | 461B-3233-TL | 25.5 | 24.8 | 8 | ... | **12.6** | 9.40 |
| 20 PR | 461B-3529-TL | 25.5 | 24.8 | 8 | ... | **10.94** | 9.40 |

and the radial of the same size also prints 10.94. Across the whole table `slrIn / (odMaxIn / 2)`
has a median of **0.8282**; this row is **0.9882**, the highest, and the next highest is 0.8983. The
internal ordering stays consistent, SLR above the flat-tyre radius, so nothing in the row
contradicts itself and no parser would reject it.

**It is reachable.** `smallestTyre` returns the first load-sorted row that satisfies the demand,
and this row is that row for a required rating from **13,701 to 13,939 lb** — a 239 lb window.
`selectMainTyre({ mainLoadTotalLb: 13701, legs: 1, wheelsPerAxle: 1 })` selects it, confirmed
by execution.

**What it then does.** Against the 20 PR row of the same size, at the same 10 ft/s design case:

| row | deflection ratio | eta_t | delta_t | stroke |
|---|---|---|---|---|
| 16 PR | 0.018750 | **0.468781** | 3.8 mm | **313.4 mm** |
| 20 PR | 0.226250 | 0.456230 | 46.0 mm | 287.8 mm |

So the anomalous row yields the **highest eta_t in the entire table from the smallest deflection in
it**, which is the opposite of the trend the module's own header explains, and a stroke **8.9 %
longer**. It is also the only row of 294 that falls below the efficiency curve's interior minimum at
X = 0.0918, i.e. the only one on the branch where eta_t *falls* as deflection grows.

**Severity LOW, and the direction is why.** The stroke comes out longer, not shorter, so the strut
is over-sized rather than under-sized and no margin is consumed. But eta_t is displayed on the gear
tab as a headline number, and nothing between the table and the display asks whether a tyre that
deflects 1.2 % of its radius at rated load is credible. There is no plausibility guard on any tyre
row anywhere in the tool, measured.

**Not repaired.** Correcting or flagging a data row, and adding a plausibility check, are production
changes and are not authorised here. **Nothing is re-graded.**

---

## F-65 — the ledger's own zero/negative/NaN scan is wrong in both directions, and one file receives both errors — MEDIUM — VERIFIED — AUDIT TOOL, NOT THE REPOSITORY

This is a defect in the Phase-2 instrument, not in the engine. It is recorded here because
**question 20's verdicts rest on it for all 1,288 relations**, and because N-16 requires asking
whether the analyser caused a result before believing it.

`scratchpad/build_p2_ledger.mjs` decides question 20 by searching a window of plus or minus 25
lines around each site for a guard, with this pattern:

```js
const GUARD = /Number\.isFinite|isNaN|Math\.max\s*\(\s*0|Math\.min|<=\s*0|<\s*0|>\s*0\s*\?|\|\|\s*0|\?\?\s*0|clamp|Math\.abs|EPS|guard/i;
```

and the asymmetry it implements is correct in principle: absence of a guard is evidence the case is
unhandled, so it yields WARNING, while presence proves nothing a scan can read, so it yields
UNVERIFIED.

**IT CANNOT SEE THIS REPOSITORY'S COMMONEST REFUSAL IDIOM.** The pattern has
`> 0 ?` — a ternary — but nothing matching `!(x > 0)`, which is how this tree refuses
non-positive input nearly everywhere. All eight guards in `gear/strut.js` are of that form and
the pattern matches **none** of them:

```
if (!(x > 0)) return 0;                                            no match
if (!(X > 0)) return null;                                         no match
if (!(rect > 0)) return null;                                      no match
if (!tyre or !(tyre.widthMaxIn > 0)) return null;                  no match
if (!(deflectionIn > 0)) return null;                              no match
if (!(V > 0) or !(N > 0) or !(etaS > 0) or !(g > 0)) {             no match
if (!(denom > 0)) {                                                no match
if (!(designFps > 0) or !(reserveFps > 0)) return null;            no match
```

Ledger-wide, **25 of the 250 question-20 WARNINGs the scanner itself produces (10.0 %)** sit in
windows that do contain such a refusal. **(Re-measured. An earlier wording said "25 of the 275
(9.1 %)", which mixed two populations: 275 is the LEDGER's current question-20 WARNING count after
earlier blocks' hand corrections, not the scanner's own denominator of 250. See the severity
reassessment below.)** Those rows assert *"no zero/negative/NaN guard within +/-25 lines of the site"* about code
that guards one line away. Examples: FORMULA-WEIGHT-001 and -002 at `balance.js:160-161`
(`if (!(L > 0 && S > 0 && b > 0)) return null;`), FORMULA-STRUCT-126 at
`fuselage-structure.js:126`, FORMULA-STRUCT-155 at `ground-loads.js:82`,
FORMULA-WEIGHT-231 at `cg.js:93`.

**AND IT MATCHES ENGLISH PROSE.** Three alternatives are bare words -- `EPS`, `clamp`,
`guard` -- applied case-insensitively to a window that includes comments. **30 question-20
UNVERIFIEDs were reached only through a match landing inside a comment, 27 of them carried by one of
those three bare words** (re-measured; this was first recorded as 18, which understated it), among them
FORMULA-SIZING-472 to -477, where `/EPS/i` matched the letters inside the ordinary English word
**"keeps"** in *"an aircraft where the shaft keeps both rotors turning"*, and FORMULA-WEIGHT-261 to
-264 on *"codebase keeps finding"*. FORMULA-SIZING-279 matched the word `guard` in a sentence
about a guard.

**THE TWO ERRORS MEET IN ONE FILE, WHICH IS THE CLEAREST DEMONSTRATION.** In
`gear/strut.js`, FORMULA-STRUCT-179, -184 and -188 were recorded WARNING because the pattern
could not see their guards, while FORMULA-STRUCT-186 and -187 were recorded UNVERIFIED because
`/EPS/i` matched *"ke**eps** no constant of its own"* in the comment above them. Same file, same
idiom, two different verdicts, neither arrived at for a reason about the code.

**What this does and does not mean.** It does not make the engine less safe and it moves no
engineering quantity; question 20 still carries **no PASS anywhere**, by construction. What it
damages is the WARNING side, which is the side that carries evidential weight: a WARNING asserts
that nothing guards the case, and for 25 relations that assertion is false. The 225 remaining
WARNINGs have no guard of either kind in the window, measured, and stand.

**This block's own eight rows are corrected from the source, by hand** -- WARNING where a hole was
hand-verified, UNVERIFIED where a guard is present and no hole was found, which is the phase's rule.
**The 47 affected rows elsewhere are NOT re-graded here** — 19 false WARNINGs and 28 comment-only
UNVERIFIEDs, this block's 8 having been corrected by hand: they belong to other relations and a
re-grade needs its own block and its own authorisation.

### F-65 severity, reassessed explicitly against the Phase 27 scale — RECLASSIFIED LOW to MEDIUM

**This reassessment was requested, and the magnitudes it rests on were re-measured from scratch
rather than carried forward.** The re-measurement reproduced the original scanner exactly — same
`GUARD` pattern, same ±25-line window, same register rows through `parseRegister()` — and then
classified every question-20 verdict. **It confirmed one of this finding's two figures, corrected
the other three, and found the damage larger than first recorded.** Those corrections are applied
above; they are listed together in *"Magnitudes corrected"* below.

**THE SCALE.** Per this document's own statement of the Phase 27 scale: **CRITICAL** changes
engineering conclusions or invalidates sizing · **HIGH** is a significant numerical or physical
error · **MEDIUM** is meaningful but localized · **LOW** is presentation, documentation or minor
numerical.

**AXIS 1 — EFFECT ON PRODUCTION ENGINEERING CALCULATIONS: NONE, AND THIS IS MEASURED.**
`build_p2_ledger.mjs` is audit tooling that exists only in a scratchpad. It is referenced nowhere
in `src/`, nowhere in `validation/`, and nowhere in `package.json` — checked. It does not run in
`npm test`, it does not ship, and by its own header it *"does NOT run the engine and does NOT
inspect the numerical output of any formula."* It reads source text and emits verdicts. **No sizing
quantity, no mass, no energy and no geometry depends on it in any way.** On this axis the finding
is not even LOW; it is zero. Nothing a user of the sizing tool experiences is affected, and no
engineering conclusion in this audit rests on a question-20 verdict.

**AXIS 2 — EFFECT ON CONFIDENCE IN THE PHASE-2 LEDGER: MATERIAL, AND BIDIRECTIONAL.**
Re-measured ledger-wide:

| measure | value |
|---|---|
| question-20 WARNINGs the scanner itself produces | **250** |
| of those, WARNINGs asserting "no guard" where the window holds `!(x > 0)` | **25 = 10.0 %** |
| question-20 UNVERIFIEDs the scanner produces | **1,038** |
| of those, reached ONLY by a match inside a comment | **30 = 2.9 %** |
| of those 30, carried by a bare word (`EPS`, `clamp`, `guard`) | **27** |
| relations whose question-20 verdict was not reached for a reason about the code | **55 of 1,288 = 4.27 %** |
| the same 55 as a share of all 25,760 determination cells | **0.214 %** |
| already corrected by hand in this block | **8** (6 WARNINGs, 2 UNVERIFIEDs) |
| **still outstanding elsewhere in the ledger** | **47** (19 WARNINGs, 28 UNVERIFIEDs) |

**THE RULING: MEDIUM, scoped as "MEDIUM for audit integrity, NONE for production engineering."**
Four reasons, in order of weight:

1. **"Meaningful but localized" is the precise fit.** It is meaningful because **10.0 % of
   question 20's positive assertions are false** — a WARNING asserts that nothing guards the case,
   and for 25 relations a guard sits one line away. It is localized because it touches one question
   of twenty, through one tool, with zero production reach.
2. **LOW's "documentation" means presentation of results; this is a defective measurement.** The
   Phase-2 ledger is not presentation — it is this audit's primary evidentiary record, and a
   question-20 WARNING is an assertion of fact about the code. An instrument that makes false
   factual assertions about a tenth of its own positive findings has not mis-formatted a result; it
   has mis-measured one. Within the audit, that is the analogue of a numerical error, scaled down
   by its localisation — which lands on MEDIUM, not LOW.
3. **Severity should track what a reader would wrongly conclude.** A reader of this ledger would
   wrongly conclude that 25 relations have no zero, negative or NaN protection, and might "repair"
   guards that already exist or distrust code that is sound. In the other direction, 30 rows record
   that *"a guard exists nearby"* on the strength of an English word in a comment, which is false
   reassurance. Both directions corrupt the product the ledger exists to provide.
4. **The measured reach grew on inspection.** The comment-only population was first recorded as 18
   and measures **30**. A defect whose magnitude increases when it is finally measured properly
   does not belong in the lowest bucket.

**THE CASE FOR RETAINING LOW, stated fairly, because it is not weak.** Zero production effect; only
**0.214 %** of determination cells; and question 20 **can never PASS by design**, so it is the
weakest-evidence column in the ledger and its WARNINGs were never load-bearing for any PASS claim.
On a scale whose every rung is worded in engineering terms, a defect with no engineering effect
arguably cannot exceed LOW. **This case is rejected on one point:** the scale's rungs are worded for
the engine because the audit did not anticipate auditing its own instrument, and reading "no
engineering effect" as "therefore minor" would make every possible defect in the audit tooling
unreportable above LOW — including one that silently invalidated a whole question. Severity must be
able to describe damage to the evidence as well as damage to the aeroplane.

**A GAP IN THE SCALE ITSELF, FOR THE HOLDER.** The Phase 27 scale has **no audit-integrity axis**.
F-65 is the first finding against the audit's own instrument, and it had to be forced onto a ladder
built for engineering defects. The MEDIUM above is therefore recorded **with its axis named** rather
than as a bare word. **Whether the scale should gain an explicit audit-integrity dimension is the
holder's call and is not decided here.**

**Magnitudes corrected in this finding by the re-measurement.** Recorded openly, because this
finding is itself about a mis-measurement and must not repeat the fault:

- **"25 of the 275 question-20 WARNINGs (9.1 %)" mixed two populations.** The numerator is the
  scanner's own output; **275 is the LEDGER's current question-20 WARNING count**, which differs
  because earlier blocks hand-corrected rows. Measured in one population: **25 of the scanner's 250
  WARNINGs = 10.0 %**. The ledger's current column is **275 WARNING / 1,013 UNVERIFIED**; the
  scanner's raw output is **250 / 1,038**. Both sum to 1,288.
- **"18 question-20 UNVERIFIEDs" understated the comment-only population.** Measured: **30**, of
  which **27** are carried by one of the three bare words. The 18 was not reproducible as any
  natural subset.
- **"The 220 remaining WARNINGs"** is **225** — the scanner's 250 less the 25 identified.
- **"The other 25 are NOT re-graded here"** should be **19**: of the 25 false WARNINGs, **6 are this
  block's own rows** (STRUCT-179, -180, -181, -182, -184, -188) and were corrected by hand here, as
  were 2 comment-only UNVERIFIEDs (STRUCT-186, -187). **47 affected rows remain outstanding
  elsewhere**, not 25.

**REMEDIATED BY F-67 (the question-20 integrity block).** The detector was rebuilt to read code
only and to recognise the negated refusal forms, and **31 WARNING cells carrying a false "no guard"
assertion were withdrawn to UNVERIFIED**, each inspected individually against the source, taking the
ledger to 244 W / 1,044 U and the global total to 2,670 of 25,760. **The 33 hand-audited WARNINGs
were left untouched**, and the comment-only UNVERIFIEDs were **not** flipped to WARNING, because that
would assert a hole from the absence of a detected guard. **The window-scope defect is NOT fixed and
is left open in F-67**; the magnitude quoted for it anywhere must be treated as unmeasured.

**Not repaired by THIS finding.** Widening the pattern to the negated idiom, requiring a code-shaped match, and
excluding comments are changes to the audit tooling, and re-deriving question 20 across 1,288
relations is a block of its own. **Nothing is re-graded outside this block's eight relations.**

---

## F-66 — the stroke relation cites the corpus subsection that quotes a primary, where the equation it uses is the one the corpus labels derived — LOW — VERIFIED

**EXACT PRODUCTION LOCATION.** Two sites in `src/engine/gear/strut.js`, both in the module that
computes the oleo stroke:

```
l.159  the `src:` string returned by `strokeFromEnergy`, in the resolved result object:
         src: "LANDING-GEAR.md section 1.4b eq. (23), from the energy balance (22)",
l.18   the module header comment, which introduces the same equation:
         THE ENERGY BALANCE, section 1.4b, eq. (22):
```

`l.5` of the same header cites *"LANDING-GEAR.md section 1.4"* — the parent section, with no
letter. **That one is correct and must not be "fixed".**

**STATED CITATION.** Section **1.4b**, for eq. (22) and eq. (23).

**CORRECT CITATION.** Section **1.4c**, *"Assembling the stroke equation"*. In
`../eVTOL_Sizing_Research/classes/cross-class/LANDING-GEAR.md`, measured: §1.4c opens at **l.443**
and carries **(22) at l.448**, **(23) at l.457** and **(24) at l.465**.

**PRIMARY AND CORPUS EVIDENCE.** The two subsections are different in kind, which is what makes the
slip worth recording:

- **§1.4b (l.396–442), *"The energy balance — stated by the FAA itself"*** quotes **FAA
  AC 25.723-1 §5 verbatim** — the free-drop heights and the effective-weight formula — and carries
  the numbered equations **(19)** h = 18.7 in at MLW and 6.7 in at MTOW, **(20)**
  W_e = W[h + (1 − L)d]/(h + d), and **(21)** the 27-inch reserve-energy height. **It contains
  neither (22) nor (23).**
- **§1.4c (from l.443)** derives (22), (23) and (24), and labels them in its own words:
  *"derived from (17)–(21); this is algebra on primary results, not a quoted equation"*.

So the cited subsection is the one that **quotes a primary**, while the equation actually
implemented lives in the subsection the corpus **explicitly marks as derived**.

**THE EQUATION ITSELF REMAINS CORRECT — MEASURED, NOT ASSUMED.** Recomputed longhand from the
corpus text over a swept legal population of **16,660 cases** (V 6–12 fps, L 0–1, N 1.5–3.5,
η_s 0.60–0.85, η_t 0.44–0.50, δ_t 0–0.15 m; 140 further combinations correctly refused for a
non-positive denominator):

| check | worst result |
|---|---|
| module stroke vs eq. (23) recomputed longhand | **0.00e+0** (exact) |
| eq. (22) energy-balance residual at the module's stroke, as a fraction of the kinetic term | **7.81e-15** |
| `collapsedForm` vs eq. (24) at L = 1 | **0.00e+0** (exact) |

The implementation matches the equation, and the equation satisfies the balance that the citation
names. **Nothing about the arithmetic is in question.**

**NUMERICAL EFFECT: NONE DEMONSTRATED.** No engineering quantity moves. The defect is in a string,
not in an expression; the string is never parsed, compared or computed with.

**REACHABILITY, MEASURED.** The mis-citation is live rather than dead, but bounded. Walking every
reachable value for the literal `1.4b`:

- **It is present** at `gear.strut.src` for all three tricycle classes through
  `gearOf(designAircraft({type}))`, on a resolved branch with real strokes — transport
  **0.2554 m**, bizjet **0.2834 m**, turboprop **0.2791 m**.
- **It does not escape** into the public API (`size()` for the same three types: 0 hits), into a
  **saved design record** (0 hits, and the literal is absent from the serialised JSON), or into the
  rendered gear tab, which displays the stroke, η strut and η tyre and cites MIL-L-8552C §3.5.2
  for the strut efficiency — correctly.

So the wrong citation is visible to an in-process consumer of `gearOf` and to anyone reading the
module, and is not visible to an end user of the application.

**WHY THIS IS A PROVENANCE AND TRACEABILITY DEFECT RATHER THAN A PHYSICS DEFECT.** The physics is
verified above. What fails is the audit trail. A provenance string exists so that a reader can go
from an implemented expression to the exact place its authority rests, and judge how strong that
authority is. This string sends the reader to the subsection that quotes the FAA verbatim, and
therefore **overstates the provenance class of the equation it labels**: it implies quoted-primary
support for algebra that the corpus itself declines to call a quoted equation. A reader who
followed the citation would find AC 25.723-1's effective-weight formula, not the stroke equation,
and would either conclude the tool had mis-derived the stroke from (20), or would record the
stroke as primary-sourced when the corpus marks it derived. Both are traceability failures, and
the second is the error F-42 names — a record asserting stronger support than exists.

**Severity LOW.** It is a documentation and traceability defect with no demonstrated numerical
effect, which is what the Phase 27 scale's LOW describes. It is not lower than LOW: the string is
reachable, it is wrong in a way that misdirects provenance rather than merely mis-spelling it, and
the audit's own rule is that a claim is not evidence.

**NOT REPAIRED. PASS A MODIFIES NO PRODUCTION CODE.** The correction is one character in each of
two places — `1.4b` to `1.4c` at l.159 and l.18 — and `src/engine/gear/strut.js` is production
code, so it is deliberately left untouched here and belongs to a remediation pass under its own
authorisation. **No file under `src/` was modified by this finding.**

---

## F-67 — question 20's mechanically-derived verdicts carried a false "no guard" assertion on 31 relations; the detector is corrected, the cells are withdrawn, and the window-scope defect is left open — MEDIUM — VERIFIED — AUDIT TOOL, NOT THE REPOSITORY

This is the F-65 remediation block. It is a defect in the Phase-2 instrument, not
in the engine, and **no production file is touched by it.**

**ROOT CAUSE.** `build_p2_ledger.mjs` decided question 20 by testing one
case-insensitive regex against the raw text of a fixed ±25-line window:

```js
const GUARD = /Number\.isFinite|isNaN|Math\.max\s*\(\s*0|Math\.min|<=\s*0|<\s*0|>\s*0\s*\?|\|\|\s*0|\?\?\s*0|clamp|Math\.abs|EPS|guard/i;
```

Three properties of that one line produced every error. It read **raw text, so
comments counted as protection**; three alternatives were **bare words**, so
English prose counted; and it contained **no negated form**, so this
repository's commonest refusal idiom `!(x > 0)` was invisible. The asymmetry it
implemented was correct in principle — absence of a guard is evidence, presence
proves nothing — but it mis-measured both sides of that asymmetry at once.

**WHAT THE BASELINE SHOWS, REPRODUCED EXACTLY BEFORE ANYTHING WAS CHANGED.** The
old mechanism was re-run verbatim — same regex, same window, same register site
mapping through `parseRegister()` — over all 1,288 relations:

| population | count |
|---|---|
| scanner WARNING | **250** |
| scanner UNVERIFIED | **1,038** |
| ledger WARNING before this block | **275** |
| ledger UNVERIFIED before this block | **1,013** |
| rows where ledger and scanner disagree | **29** |

**The 29 disagreements are all legitimate and were left alone.** Every one is a
`FORMULA-STRUCT-*` row in a file an audit block had already worked by hand —
`gearlayout.js`, `fuselage-shear-flow.js`, `stowage.js`, `flight-envelope.js`,
`fuselage-structure.js`, `gear/strut.js` — so each is a hole a person verified,
which is precisely what WARNING is reserved for. **This also settles the
denominator F-65 got wrong:** 275 is the ledger's column after those hand
corrections, 250 is the scanner's own output, and quoting a numerator from one
against a denominator from the other is what produced "25 of the 275 (9.1 %)".

**THE CORRECTED DETECTOR, AND WHAT IT DELIBERATELY DOES NOT DO.** Two defects are
fixed and nothing else: evidence is sought in **code only** - a character-level state machine
removes **comment text AND string and template literal contents**, keeping `${...}`
interpolations because those are code, and preserving every newline and column so a cited
evidence line still points at the real source line;
and the **negated refusal forms are recognised** — `!(x > 0)`, compound
`!(a > 0 && b > 0)`, mixed `!d || !(x > 0)`, and `!isFinite(...)`. `EPS` must be
an identifier at word boundaries, `clamp` must be a call. The contract is
unchanged and enforced in the suite: **evidence yields UNVERIFIED, never PASS**;
absence of evidence is a reason to read the source, not an engineering
conclusion; `?? 0` and `|| 0` are reported but **not credited**, because
substituting zero for an absent value does not protect against a supplied zero,
a negative or a NaN.

**THE DIRECTION OF CORRECTION IS ONE-WAY, AND THAT IS THE CENTRAL DESIGN
DECISION.** Under the asymmetry a WARNING asserts *"nothing guards this case"* —
a positive, load-bearing claim — while UNVERIFIED asserts nothing at all. So a
WARNING contradicted by real code may be withdrawn mechanically, because
withdrawing a false assertion is always safe. **An UNVERIFIED reached only
through a comment was NOT flipped to WARNING**, because doing so would assert a
hole from the absence of a detected guard, which is the old bug wearing a new
regex. Those cells are already the conservative verdict; what was wrong is the
rationale, and a rationale is a finding, not a cell edit.

**WHAT CHANGED: 31 question-20 cells, W → UNVERIFIED, each inspected
individually against the source.** No bulk conversion was performed. For every
one, the production source was read, the guarding line located by number, and the
coverage characterised:

- **19 rows where the guard constrains quantities the relation itself consumes** —
  for example `balance.js:152` `if (!(L > 0 && S > 0 && b > 0)) return null;`
  guarding the `L` used at l.160–161; `cg.js:91` `if (!(fL > 0 && D > 0))`
  guarding l.93; `ground-loads.js:81` `if (!(z >= 0) || z >= 1)` guarding the
  `sqrt(1 - z*z)` on the next line; `controlauthority.js:85`
  `if (![T, R, Vt, fm].every((x) => isFinite(x) && x > 0)) return null;`, which
  covers all four inputs for zero **and** non-finiteness; and `engine.js:1285`
  `const cwOK = isFinite(cw.total) && cw.total>0 && cw.total<MTOW;`, whose result
  is consumed directly by the relation at l.1296.
- **12 rows where a real guard sits in the window but governs other quantities.**
  UNVERIFIED is the verdict defined for exactly this case — *"a guard exists
  nearby but was not shown to cover this relation"* — so the cell is correct and
  the recorded reason now says which quantities the guard does and does not reach.

Each row's **basis was rewritten as well as its cell.** All 31 carried the
sentence *"20: no zero/negative/NaN guard within +/-25 lines of the site"*, which
is false on every one of them; leaving that string beside a corrected cell would
have moved the defect rather than repaired it. Each now names the rule, the line
number and what the guard covers.

**LEADS PRESERVED RATHER THAN DISCARDED.** Withdrawing a WARNING is not a claim
that an edge is handled. `engine.js:1691–1696` (SIZING-280…285) divides by
`bWing`, which is `0` whenever `hasWing` is false, so a non-finite wing geometry
is reachable in principle; the guard in that window governs the MTOW iterate at
l.1672, not these inputs. **That hole is NOT hand-verified here and is recorded
for a future block.** Two further rows are noted as cases where question 20 has
nothing to guard: `PROP-011` is a dimensionless constant (`2π/60`), and
`MISC-017` is a regular-expression test on a string.

**THREE POPULATIONS THAT MUST NOT BE CONFLATED.** A detector flagging a row is not the same thing
as the ledger having been wrong, and neither is the same as a verdict that survives inspection.
Stated separately, with the measured count of each:

| population | count | what it means |
|---|---|---|
| **mechanically suspect**: ledger WARNING where the corrected detector finds executable evidence | **64** | the DETECTOR disagrees with the cell. A candidate for inspection, and nothing more. |
| **false WARNINGs actually withdrawn** after per-row source inspection | **31** | the LEDGER was wrong here: it asserted no guard where one demonstrably executes. These are the only cells changed. |
| **WARNINGs retained because independent source inspection supports them** | **33** | the LEDGER is RIGHT here. A person had already read the source and hand-verified the hole, so the detector's disagreement is the detector's limitation - chiefly the window scope - not a ledger defect. |

**So the as-built scanner's error rate and the ledger's error rate are different numbers.** The
scanner's mechanical output disagrees with code on 64 WARNING rows; the ledger, which already
carried human corrections on top of that output, was wrong on **31**. Saying the scanner "was
wrong on 64 WARNING rows" would silently convict 33 verdicts that independent inspection upholds.

**WHAT WAS DELIBERATELY NOT CHANGED.**

| population | count | why |
|---|---|---|
| hand-audited WARNING rows the detector contradicts | **33** | a person verified the hole; the tool does not overrule them |
| UNVERIFIED rows whose only old evidence was a comment | **23** | UNVERIFIED already asserts nothing; the rationale was wrong, not the cell |
| UNVERIFIED rows where the new detector finds no evidence | **33** | flipping these to WARNING would assert a hole from absence |

**AN UNRESOLVED DEFECT, STATED RATHER THAN QUIETLY FIXED: THE ±25-LINE WINDOW IS
THE WRONG SCOPE.** A guard controlling a relation can sit outside the window, and
a guard inside the window can belong to an unrelated function. A first attempt at
re-scoping question 20 to the enclosing function produced **513 proposed changes**
and was **discarded as unsound**: sampling the source showed the scope finder
returned a two-line "function" for `polarCurve` (really l.381–395) and excluded
the live `eps` tolerance at `engine.js:346` from SIZING-032's scope, so its mass
of U→W flips were artefacts of the heuristic. **The magnitude of the scope defect
is therefore NOT reliably measured here, and no number for it should be quoted
from this block.** Measuring it needs a real AST-based scope, and re-scoping
question 20 would silently redefine every one of its 1,288 verdicts — a ruling for
the holder, not a side effect of a tool. **It is left open.**

**THE STRING-LITERAL FALSE POSITIVE IS FIXED, NOT MERELY DOCUMENTED.** An earlier version of
this detector removed comments but treated string contents as code, so guard-shaped text inside
a message string credited a guard that does not execute. The scrubber now removes literal text
as well, and the tests assert each case by name: `Number.isFinite(x)`, `!(x > 0)` and `EPS`
inside a string do **not** count, a template literal's text does **not** count, a `${...}`
interpolation **does**, and every executable counterpart still does.
**The fix does not move the adjudicated set: the 31 withdrawals are byte-identical before and
after it, and no cited evidence line number changed.** It does change the detector's own
distribution - 244 W / 1,044 U with comments-only scrubbing against **334 W / 954 U** with
literals scrubbed as well - because **90 relations had their only apparent evidence inside a
literal**. None of those are ledger changes, since this block only ever withdraws a WARNING.

**ONE REMAINING LIMIT.** One rule, `refusal-truthy-mix`, is **provably redundant**: its inner
expression is parenthesis-free by construction, so the token before `> 0` is always
an identifier, which `refusal-positivity` already matches. It can never be the sole
carrier of a verdict, is declared as subsumed, and is credited to nothing.

**MUTANT PROTECTION, AND IT LIVES IN THE REPOSITORY.** The suite is
`AUDIT/reference/q20/q20-tests.mjs`, **66 assertions, 0 failures, 0 dead rules**, run with
`node AUDIT/reference/q20/q20-tests.mjs`. Four layers: 29 fixtures covering every failure mode
named for this block, including the ones that must receive no evidence; a
necessity layer that deletes each rule in turn and requires some fixture's verdict
to move, with redundant rules declared in advance rather than discovered; a layer
that reproduces the F-65 bug itself and shows the old regex misclassifying all
five prose fixtures where the new detector does not, attributing each fix to
comment blanking (2) or to rule shape (3); and an asymmetry layer proving PASS is
unreachable for every fixture and for degenerate empty input.

**EFFECT ON THE LEDGER.** Question 20 goes **275 W / 1,013 U → 244 W / 1,044 U**,
and because a WARNING is a determination and UNVERIFIED is not, the global total
falls **2,701 → 2,670 of 25,760 (10.5 % → 10.4 %)**. The six untouched questions
are unchanged, question 20 still carries **no PASS anywhere**, and **no engineering
quantity moves** — the determination count falls because 31 false assertions were
withdrawn, which makes the ledger more honest and not less complete.

**THE EVIDENCE IS IN THE REPOSITORY, SO THIS FINDING OUTLIVES ANY SCRATCHPAD.** Five artefacts,
and deliberately only five - no probes, no discarded detector versions, no logs, no backups:

| path | what it is |
|---|---|
| `AUDIT/data/q20-baseline.tsv` | the as-built question-20 derivation for all **1,288** relations: site, window bounds, verdict, and the text the old regex matched |
| `AUDIT/data/q20-change-record.tsv` | the **31** withdrawals: relation, site, old, proposed and final verdict, the evidence line, and the human reason. Never machine-written |
| `AUDIT/reference/q20/q20-detector.mjs` | the detector **actually used** to generate the candidates |
| `AUDIT/reference/q20/q20-reproduce.mjs` | a deterministic generator: `--write` rebuilds the baseline, no flag verifies it and exits non-zero on drift |
| `AUDIT/reference/q20/q20-tests.mjs` | the detector's regression and mutation tests |

They live under `AUDIT/` rather than `validation/` on purpose: `report-manifest.mjs` enumerates
`validation/` and treats every `.mjs` there as a harness, so putting audit tooling in that directory
would make the manifest gate report it as an undescribed harness. **Nothing enumerates `AUDIT/`**, so
the test runner, the report manifest and the `constants.mjs` numeral scan are all untouched.
The verifier checks the record in **both directions**: every recorded row must have been WARNING in
the baseline, must be UNVERIFIED in the ledger now, and must still show executable evidence; and no
row outside the record may show that same shape. It also re-derives the baseline and compares it
byte-for-byte, so a change to the sources that would alter question 20 fails the check instead of
silently rewriting the evidence.

---

## F-68 — the gust mass ratio is built from the mean AERODYNAMIC chord where the primary, the regulation, the corpus recipe and the module's own header all specify the mean GEOMETRIC chord, and the error is non-conservative — HIGH — VERIFIED

**SEVERITY NORMALISED BY HOLDER RULING, 2026-10-02: MEDIUM → HIGH.** The grade is the only thing changed. Every measurement, source and rationale below stands as written, including the passages that record the earlier MEDIUM grade and its calibration anchors, which are kept as the history of the grading.

**EXACT PRODUCTION LOCATION.** `src/engine/loadcases.js:220`

```
  const cBar = Math.max(0.1, g.MAC ?? 1.5);
```

consumed one line later at **l.223** by `FORMULA-STRUCT-221`:

```
  const mu = 2 * WS / (rho * cBar * a * G0);
```

`g.MAC` is the mean **aerodynamic** chord. Both call sites pass it as such —
`engine.js:1259` and `engine.js:2558` supply `MAC`, computed at `engine.js:848`
and `l.1694` as `(2/3)·Cr·(1+λ+λ²)/(1+λ)`, which is the standard MAC of a
trapezoidal wing and is not the mean geometric chord.

**FOUR INDEPENDENT SOURCES SAY THE CHORD IS GEOMETRIC, AND ONE OF THEM IS THIS
FILE.**

1. **NACA TR 1206's own symbol list** (printed p. 2, vendored verbatim in
   `FLIGHT-ENVELOPE.md`): `c` = *"reference wing chord mean geometric chord,
   (Wing area / Wing span)"*.
2. **14 CFR 25.335(d)(1)**: *"c = mean geometric chord of the wing (feet)"*.
3. **The corpus's own implementation recipe** for this method, step 5:
   `cbar = S/b`.
4. **This module's own header**, which quotes the MOC gust shape with
   *"C_bar = mean geometric chord"* and then writes
   `mu = 2 (W/S) / (rho * c_bar * a * g)`. **The file states the correct
   definition and then codes a different quantity.**

**AND THE AUDITED SIBLING DOES IT CORRECTLY.** `flight-envelope.js:157`:

```
  const cBarFt = (S / b) / FT;                       // mean GEOMETRIC chord, 25.335(d)
```

and it exports the value as `meanGeometricChordFt`. The same primary equation is
implemented twice in this repository, once right and once wrong, and the register
already records the neighbouring `Kg` line as a **C7 duplicated implementation**.

**THE ERROR IS A CLOSED FORM, SO ITS BOUND IS EXACT.** For a trapezoidal wing
`S = b·Cr·(1+λ)/2`, so `MGC = S/b = Cr(1+λ)/2`, and

```
  MAC / MGC = (4/3) (1 + λ + λ²) / (1 + λ)²
```

verified against the geometry identities to the last bit at six taper ratios.
Over the declared taper range **0.2 to 0.8** this is **1.0041 to 1.1481**, and it
is **never below 1**, with equality only at λ = 1.

**THE DIRECTION IS NON-CONSERVATIVE.** `mu ∝ 1/c`, so an overstated chord
understates `mu`; `Kg = 0.88μ/(5.3+μ)` is strictly increasing in `μ`
(`dKg/dμ = 0.88·5.3/(5.3+μ)² > 0`); and `Δn ∝ Kg`. A larger chord therefore
**under-predicts the gust load factor**, which is the wrong way for a structural
sizing input.

**MEASURED ON THE REAL POPULATION, NOT ONLY SWEPT.** 1,620 designs sized through
the public API across the four winged layouts over the declared slider ranges
(taper 0.2–0.8, AR 4–16, cruise 30–120 m/s, altitude 200–3000 m, wing loading
700–2200 N/m²):

| quantity | measured |
|---|---|
| mass ratio `mu` spanned | **2.72 to 94.98** |
| cases where the GUST governs, not the manoeuvre | **512 of 1,620 — 31.6 %** |
| worst under-prediction of `nLimit` | **5.35 %** (4.9830 coded against 5.2647 corrected) |
| worst shortfall in `nUltimate`, the factor `wingBox` is sized to | **0.4363 g** |

**It is not latent.** In 31.6 % of the declared design space the gust case sets
the limit load factor, and `engine.js:2562` passes `nz: lcase.nUltimate`
straight into `wingBox`. A wider parameter sweep that is not restricted to sized
designs reaches **8.52 %** on `nLimit` (ultimate 12.3725 against 13.5253).

**WHAT IS NOT WRONG.** The equation form is right: a longhand reproduction of the
whole chain — `WS`, `mu`, `Kg`, the three gust cases and the maximum — agrees
with the shipped module at relative **0.0e+0** across 729 swept cases. The module
computes exactly what it documents. The defect is which quantity is bound to
`c`, which is why question 2, variable definition, is recorded **FAIL** on
STRUCT-221 while question 1 stands at PASS.

**NOT REPAIRED. PASS A MODIFIES NO PRODUCTION CODE.** The correct quantity is
already in scope at both call sites — `engine.js:1691` computes
`bWing = sqrt(p.AR*Swing)`, so `S/b` is one expression away — but
`src/engine/loadcases.js` is production code and is deliberately left untouched.
**No file under `src/` was modified by this finding.**

---

## F-69 — the gust increment pairs sea-level density with TRUE airspeed where the primary requires EQUIVALENT airspeed, overstating the gust by up to 16 % at altitude — MEDIUM — VERIFIED

**EXACT PRODUCTION LOCATION.** `src/engine/loadcases.js:259`, `FORMULA-STRUCT-225`:

```
  const dn = Kg * gc.Ude * V * a * rho0 / (2 * WS);
```

where `V` comes from `speeds[gc.speedKey]`, built at **l.229–231** from
`const VH = g.vCruise`, and `rho0` is `g.rho0 ?? 1.225` — sea level, as the
comment at l.218 says.

**WHAT THE PRIMARY REQUIRES.** NACA TR 1206 Eq (11), vendored verbatim:

```
            m ρ₀ S V_e U_de
  Δn_max = ───────────────── K_g
                 2W
```

with, from the symbol list, *"ρ₀ = air density at sea level"* and
*"V_e = equivalent airspeed, fps"*. The sea-level density is paired with
**equivalent** airspeed; that pairing is what makes the formula altitude-correct
without a density ratio.

**WHAT IS SUPPLIED INSTEAD.** `p.vCruise` is TRUE airspeed everywhere else in
this engine, which is the evidence that it is TAS here too:

- `engine.js:840` `const qCr_i = 0.5*rhoCr*p.vCruise**2` — dynamic pressure
  against the density **at altitude**, which is only correct for TAS;
- `engine.js:770` `machCr_ = p.vCruise/sqrt(1.4*287.05287*(288.15-0.0065*cruiseAlt))`
  — Mach from the speed of sound at altitude, again TAS;
- `engine.js:849` `Re_i = rhoCr*p.vCruise*MAC_i/muCr` — Reynolds number with the
  density at altitude.

**MEASURED MAGNITUDE.** `V_e = V_t·sqrt(ρ/ρ₀)`, so the correct product is
`V_t·sqrt(ρ₀ρ)` while the code forms `ρ₀·V_t`; the ratio is `sqrt(ρ₀/ρ)`:

| altitude | ρ (ISA) | V_e/V_t | Δn overstated by |
|---|---|---|---|
| 200 m | 1.20165 | 0.99042 | **0.97 %** |
| 1000 m | 1.11164 | 0.95261 | **4.97 %** |
| 2000 m | 1.00649 | 0.90644 | **10.32 %** |
| 3000 m | 0.90912 | 0.86148 | **16.08 %** |

**THE DIRECTION IS CONSERVATIVE**, which is why this is MEDIUM and not higher: it
over-predicts the gust. **It does not cancel F-68.** Correcting both together,
the net error on `nLimit` runs from **7.74 % non-conservative** (λ = 0.2, 200 m)
to **14.67 % conservative** (λ = 0.8, 3000 m) — the sign depends on taper and
altitude, so neither defect excuses the other.

**THE REGISTER ALREADY FLAGS THE AMBIGUITY** it does not resolve: the row records
`V=AMBIGUOUS` in its inputs and `unit verif: UNRESOLVED`. Question 5, reference
conditions, is therefore recorded **FAIL** on STRUCT-225 — the reference
condition for `V` is equivalent airspeed and true airspeed is supplied — while
question 1 stands at PASS, because the expression itself is Eq (11).

**NOT REPAIRED. No file under `src/` was modified by this finding.** The sibling
`flight-envelope.js` shows the intended discipline: its helper is
`gustIncrement({ kg, uDsFtS, veKt, aPerRad, wLbFt2 })` — the airspeed parameter
is **named** `veKt`, knots EAS.

---

## F-70 — the gust method is applied far outside the regime its primary validates, and the primary's own validity statement is not carried into the module — LOW — VERIFIED

**A PROVENANCE AND TRACEABILITY DEFECT, with no numerical effect of its own.**

`src/engine/loadcases.js` §"HOW THE LOAD FACTOR IS OBTAINED" cites the method as
*"the form CS-23.341 and FAR 23.341 use"*. Those are downstream users of the same
expression; the **primary is NACA TR 1206 (Pratt, 1954)**, which the module never
names. The corpus says of TR 1206's assumptions, in terms: *"this is the validity
statement the tool must repeat"*.

**WHAT THE PRIMARY STATES AND THE MODULE DOES NOT.** TR 1206, printed p. 3,
verbatim: the aeroplane is *"a rigid body"*, at *"constant"* forward speed, in
*"steady level flight prior to entry into the gust"*, *"can rise but cannot
pitch"*, with fuselage and tail lift increments *"negligible"*, in a gust
*"uniform across the wing span"*. Printed p. 2 adds that the pitch correction is
an empirical adjustment *"reasonable only for conventional aircraft having
satisfactory flying qualities"*, and p. 3 that *"the present method will not be
suitable for all airplane configurations. **Unusual airplanes will require
special analysis.**"*

**WHY IT MATTERS HERE RATHER THAN BEING A STYLE POINT.** The module applies this
method to an eVTOL — the configuration class the primary's caveat is aimed at —
and at mass ratios this audit measured down to **mu = 2.72** over 1,620 sized
designs. `Kg` is a **curve fit to a numerical solution**, and TR 1206 states its
accuracy as *"an error less than ±0.01"* in `Kg`. That is an absolute tolerance,
so its relative weight grows as `Kg` falls: at the low-`mu` end it is **4.0 % of
Kg**, against **1.2 %** at the high end. The module reports `gustAlleviation` and
a governing load factor with no statement of either limit, so a reader cannot
tell that the quoted fit tolerance alone is a four-percent uncertainty in the
regime this tool actually occupies.

The module is otherwise unusually candid — it declares the (1-cos) substitution,
the `[LAY]` speed proportions and the asymmetric-gust treatment. This finding is
the one gap in that record, and it is recorded as **LOW** because nothing
numerical moves: the omission affects how the output should be read, not what it
is. Questions 7 on STRUCT-221, STRUCT-224 and STRUCT-225 carry the WARNING.

**No file under `src/` was modified by this finding.**



















---

## F-71 — the nose tyre is sized from ONE weight-and-CG combination where 14 CFR 25.733(b) requires the most critical, and for two of the three classes the tyre it selects is under-rated for a loading state the engine itself enumerates — HIGH — VERIFIED

**SEVERITY NORMALISED BY HOLDER RULING, 2026-10-02: MEDIUM → HIGH.** The grade is the only thing changed. The **Severity** paragraph below, which graded this MEDIUM and flagged it as a HIGH candidate pending F-68's review, is kept as the history of the grading; that review has now happened and both are HIGH.

**All three of 25.733(b)'s cases are explicit that the load is the one "corresponding to the most
critical combination of airplane weight ... and center of gravity position"**, verified verbatim in
the vendored rule (`classes/transport/extracted/raw_25.733.html`). `tyre-select.js:12-15` quotes that
very sentence back. **The chain evaluates exactly one combination:** `gear-geometry.js:127` takes
`xCg = balance.takeoff?.xM`, a single station, and `gear.js:109` passes `result.mtowKg` as the ramp
weight.

**The engine already computes a CG envelope and the gear chain never consults it.** `balance.js:440`
returns `envelope.fwd` and `envelope.aft` from an 82-point zero-fuel loading sweep spanning
**43.73 % MAC** (transport), 5.29 % (bizjet) and **57.17 % MAC** (turboprop).

**Measured over that same sweep, each point at its own mass and its own CG — every one a state the
engine itself enumerates:**

| class | as shipped, binding | worst enumerated state | change | tyre selected | tyre needed | shipped tyre covers it |
|---|---|---|---|---|---|---|
| transport | static, **8,220.80 lb/tyre** | **9,753.09 lb/tyre** at 52,682.68 kg, CG 5.01 % MAC | **+18.64 %** | H22x8.25-10, rated 8,300 lb | 8.50-10, rated 9,900 lb | **NO — short by 1,453 lb** |
| turboprop | 0.31 g fwd, **3,032.92 lb/tyre** | **3,543.74 lb/tyre** at 19,050.63 kg, CG 0.44 % MAC | **+16.84 %** | 18x5.5, rated 3,050 lb | 14.5x5.5-6, rated 3,550 lb | **NO — short by 494 lb** |
| bizjet | static, 1,154.17 lb/tyre | 999.79 lb/tyre | −13.38 % | 5.00-4, rated 1,200 lb | — | yes |

**There is no margin to absorb it.** The shipped selections sit at **99.05 %** (transport) and
**99.44 %** (turboprop) of the chosen tyre's rated load, because `selectNoseTyre` picks the smallest
tyre that meets the requirement it is given. The direction is class-dependent — the bizjet's forward
CG point is light enough to offset the longer arm — so this is not a uniform conservatism.

**The same sentence's weight basis is also not met.** (b)(1) and (b)(3) say *maximum ramp weight*;
the tool passes MTOW. Measured from the engine's own taxi-out fuel, ramp weight is understated by
**0.16 %** (transport, 123.58 kg) and **0.24 %** (bizjet, 30.55 kg); the turboprop reports no taxi
segment at all. Small beside the CG term, and in the same non-conservative direction.

**A consumer documents a CG basis the chain never used.** `pavement.js:138` records its per-leg load
as *"static split at the aft CG, G2 (14 CFR 25.733(b)(1)), at the take-off mass"*. The take-off CG is
**not** the aft limit on any class (transport 28.80 % MAC against an aft limit of 47.87 %; turboprop
31.21 % against 56.65 %). Evaluated at the basis it claims, the main-leg load would be **6.49 %**
higher (transport) and **7.32 %** higher (turboprop). The tool prints 45.27 % of weight per leg for
the transport beside the ACAPs' published 46.7–47.2 %, and the shipped check
(`validation/pavement.mjs:108`) compares that figure only with the static split it came from, so the
disagreement with the published value is never tested.

**Severity.** Graded MEDIUM, and **flagged as a HIGH candidate for the same severity-normalisation
pass as F-68**: the reach is a non-conservative component rating rather than a presentation defect,
but the magnitude depends on an envelope the tool nowhere claims to sweep, and grading it above F-68
before F-68's own review would pre-empt that ruling. Calibration anchors: F-68 (MEDIUM, 5.35 %
non-conservative) and F-57 (MEDIUM, 4.11 %).

**Not repaired.** PASS A modifies no production code.

---

## F-72 — the turboprop runs 25.733(b)(2), a LANDING-weight case, at take-off weight, because `mlwKg` is never normalised for that class — and the flag that would disclose it is computed and read nowhere — MEDIUM — VERIFIED

**25.733(b)(2) fixes its case at maximum landing weight**, verified verbatim: *"the most critical
combination of airplane weight (up to maximum landing weight) ... combined with forces of 1.0g
downward and 0.31g forward"*. `gear.js:110` reads
`const mlwLb = (result.mlwKg || result.mtowKg) * LB_PER_KG;`.

**For the turboprop, `result.mlwKg` is `undefined`, so the `||` substitutes MTOW silently.**
Measured: the (b)(2) case runs at **55,990.48 lb, exactly the take-off weight**, while the transport
(145,928.51 lb) and bizjet (24,759.04 lb) run at their real landing weights.

**The cause is a normalisation gap, not a missing input.** `engine.js:212`, the jet-transport
return, emits `mlwKg: kg(r.grossLb * p.landingToTakeoffMass)`; `engine.js:169`, the turboprop return,
does not. **The turboprop class declares the input anyway** — `turboprop/defaults.js:41`,
`landingToTakeoffMass`, value **0.98**, min 0.85, max 1.0, in the user-facing *Requirements* section.
It is a live slider whose value never reaches this rule.

**It lands on the case that governs.** (b)(2) is the binding case for the turboprop at every ratio
tested, so the substitution moves the selected tyre's requirement directly:

| landingToTakeoffMass | MLW used (lb) | binding requirement (lb/tyre) | tyre selected | rated (lb) |
|---|---|---|---|---|
| **1.00 — what the tool does** | 55,990.48 | **3,032.92** | **18x5.5** | 3,050 |
| 0.98 — the class's own default | 54,870.67 | 2,972.27 | 18x5.5 | 3,050 |
| 0.95 | 53,190.95 | 2,881.28 | 14.5x5.5-6 | 2,890 |
| 0.90 | 50,391.43 | 2,729.63 | 26x10.5-6 | 2,765 |
| 0.85 — the input's own minimum | 47,591.90 | 2,577.99 | 26x10.5-6 | 2,765 |

**As shipped the error is +2.04 % on the binding requirement and the tyre does not change**; within
the input's own declared range it does change. The direction is **conservative** — it over-sizes —
which is why this is MEDIUM and not higher.

**The disclosure exists and is dead.** `gear.js:97` computes
`const usedLandingWeight = result.mlwKg > 0;` and `gear.js:157` returns it. A walk of every `.js` and
`.jsx` under `src/` finds **no other reference to it**: nothing reads it, no tab renders it, no
harness asserts it. The tool knows it substituted the wrong weight and tells no one.

**The shipped gate proves the direction and misses the instance.**
`validation/landing-gear.mjs:196-212` runs (b)(2) at MTOW against MLW on synthetic 777-200ER numbers
and asserts that the wrong weight over-sizes the nose tyre — the right check, on a fixture, while the
production path that actually does it goes untested. A check that demonstrates a failure mode in the
abstract is not a check that the failure mode is absent.

**AMENDED 2026-10-01, after the `gear/sink-speed.js` block: the same fallback reaches a SECOND
consumer, and the reach recorded above was therefore understated.** `gear.js:94` passes
`mlwKg: result.mlwKg || result.mtowKg` into `sinkCases` as well, so for the turboprop the
**14 CFR 25.473(a)(2) landing case — "a limit descent velocity of 10 fps at the design landing
weight" — is evaluated at MTOW**, measured: its landing case runs at 25,396.85 kg, identical to its
take-off case, where the transport and bizjet correctly use 66,192.06 kg and 11,230.51 kg. The
landing case GOVERNS the energy balance on all three classes by m·V² (transport 6.62e6 against
2.84e6; turboprop 2.54e6 against 9.14e5), so the substitution lands on the governing case again.
Direction CONSERVATIVE — a higher mass at the higher sink speed — and the magnitude follows the same
`landingToTakeoffMass` the class declares and does not use. **One defect, one line, two consumers:
the nose-tyre rating of 25.733(b)(2) and the landing-energy case of 25.473(a)(2).**

**Not repaired.** PASS A modifies no production code.

---

## F-73 — 25.493(e), the braked-roll case the module is built around, is computed by code that nothing in the application can reach, and the module does not say so — LOW — VERIFIED

`ground-loads.js` devotes its header, two `[SRC]` blocks and two vendored Federal Register equation
images to 14 CFR 25.493(d) and (e), and implements them correctly: `brakedNoseReaction` reproduces
the rule's `V_N` at **0.0e+0** and `dynamicResponseFactor` its `f` at **0.0e+0** (STRUCT-160,
STRUCT-155). **Neither is reachable from production.** Walking every `.js` and `.jsx` under `src/`:

| export | references in `src/` |
|---|---|
| `staticReactions` | `src/classes/aircraft/gear.js` |
| `noseTyreLoads` | `src/classes/aircraft/gear.js`, `src/engine/gear/tyre-select.js` |
| **`brakedNoseReaction`** | **none** |
| **`dynamicResponseFactor`** | **none** |

`gear.js:50` imports exactly `staticReactions` and `noseTyreLoads`. The only caller of either braked
function anywhere is `validation/landing-gear.mjs:259-275`. **No design, record or rendered tab
carries a 25.493(e) nose reaction.**

**That is defensible engineering and undeclared scope.** 25.733(b) is the correct rule for a tyre
*rating*, and 25.493(e) sets a nose-gear *structural design* load, which this tool does not size. But
the module's own "WHAT THIS MODULE DOES NOT DO" note lists only the **other** ground cases (25.479
through 25.519) as out of scope and says nothing about (d)/(e), so a reader of the header would
reasonably believe the braked case is part of the sizing. The gap is in the declaration, not the
mathematics.

**One omission in the quoted definition.** The rule defines ξ as *"the effective critical damping
ratio of the rigid body pitching mode **about the main landing gear effective ground contact
point**"*. The module's header carries the first half and drops the qualifier. Inert today — nothing
supplies ξ — but it is the qualifier that tells anyone substantiating a lower `f` which axis to
compute the mode about.

**Numerical effect: none demonstrated.** Both equations are correct; this finding is about reach and
declaration.

**Not repaired.** PASS A modifies no production code.

---

## F-74 — three functions in one file compute the same static split and guard it three different ways, and the least guarded of them is the one feeding the main-tyre selection — LOW — VERIFIED

Every hole below was executed, not inferred from the absence of a guard.

**1. The same expression, three guard sets.** `nose = (W*B)/wb` at l.95 and `stat = (W*B)/wb` at
l.120 are the same static split — the register records them as duplicate implementations of each
other in its C7 table (l.1796, l.1799). Their guards differ:

| function | guard | rejects a negative arm? | rejects a non-finite input? |
|---|---|---|---|
| `staticReactions` l.90 | `wb>0, W>0, A>=0, B>=0` | yes | partly |
| `brakedNoseReaction` l.114 | `wb>0, W>0, E>0` | **no** | **no** |
| `noseTyreLoads` l.150 | `wb>0, E>=0` | **no** | **no** |

**Measured consequences.** `brakedNoseReaction` with `mainArmB = -1` returns `resolved: true` with
`staticLoad = -111.111` — a negative static reaction — where `staticReactions` **refuses the same
geometry**. `noseTyreLoads` with the same geometry returns `resolved: true` and loads of
**-111.11, -38.00 and -66.67 lb**, and `selectNoseTyre` then returns a real tyre (5.00-5) on a binding
requirement of **-12.67 lb**.

**2. Neither `f` nor `friction` is guarded at all.** `brakedNoseReaction({ ..., f: NaN })` and
`({ ..., friction: NaN })` each return `resolved: true` with `load: NaN`. The l.114 guard inspects the
wheelbase, the weight and the CG height, and never the two coefficients the equation multiplies by.

**3. A positivity guard that `Infinity` satisfies.** `staticReactions({ weight: 1000,
noseArmA: Infinity, mainArmB: 1 })` passes `!(wb > 0)` — because `Infinity > 0` is true — and returns
`resolved: true` with `noseLoad: 0` and **`mainLoadTotal: NaN`**. `gear.js:124` reads exactly that
field and hands it to `selectMainTyre`.

**4. Every invalid damping ratio becomes 2.0.** `dynamicResponseFactor` returns the rule's blanket
2.0 for `NaN`, `Infinity`, `-0.5` and the string `"abc"` alike. For ξ ≥ 1 — overdamped, and
physically admissible — it returns the **undamped** 2.0 where the rule's own curve tends to 1. The
direction is conservative; the silence is not. This is the F-58 shape: a clean, plausible answer from
a nonsense input.

**All four are LATENT against the shipped classes**, which is why this is LOW: `B` is positive,
`A` finite and `E` positive on transport, bizjet and turboprop alike, and `f` and `friction` are
only ever the module's own frozen constants. Nothing here is reachable from the input surface today.

**Not repaired.** PASS A modifies no production code.

---

## F-75 — the committed Q20 regression pin tests a VERDICT where it should test a RATIONALE, so it forbids the hand-verified WARNING the ledger's own methodology requires — MEDIUM — VERIFIED — AUDIT TOOL, NOT THE REPOSITORY

**This block tripped the pin, and the pin is wrong rather than the block.** Reported by
`node AUDIT/reference/q20/q20-reproduce.mjs`, exit 1:

> `MISMATCH: FORMULA-STRUCT-155: the ledger now records UNVERIFIED`
> `MISMATCH: FORMULA-STRUCT-163: the ledger now records UNVERIFIED`

The message is the assertion's own claim, not the observed value. The assertion is
`q20-reproduce.mjs:171`, `chk(led.get(id) === "U", ...)`: **every one of the 31 rows the Q20
integrity block withdrew must, for ever, read UNVERIFIED in the ledger.**

**Why the pin exists, and why it is right to exist.** F-65 found the as-built Q20 scanner asserting
*"no zero/negative/NaN guard within ±25 lines"* on relations that plainly had one. `2082ef4`
withdrew 31 such false WARNINGs to UNVERIFIED and pinned them, so that a future regex could not
quietly re-assert the same false claim. That is a sound thing to protect.

**What it actually forbids.** The ledger's own section 2 states the Q20 rule: *"A guard that is
present and does not cover the case is the WARNING condition, not the UNVERIFIED one"*, and it
records three such cells on `gearlayout.js` as **hand-verified rather than scanned**. The withdrawal
basis written on these very rows says the same thing in words: *"The guard constrains quantities
this relation consumes, but full coverage is not demonstrated, which is what UNVERIFIED records."*
**UNVERIFIED was the honest record of a gap not yet measured — not a permanent verdict.** This block
measured it, by execution:

- **STRUCT-155** — `dynamicResponseFactor` returns the rule's 2.0 for `NaN`, `Infinity`, `-0.5` and
  the string `"abc"` alike; the guard at l.81 is present and maps invalid input to a plausible value
  instead of refusing.
- **STRUCT-163** — `noseTyreLoads` with a negative main arm returns `resolved: true` and loads of
  **-111.11, -38.00, -66.67 lb**, and `selectNoseTyre` then returns a real tyre on a binding
  requirement of **-12.67 lb**; the guard at l.150 checks the wheelbase and the sign of E, and
  nothing else.

Both are recorded WARNING with that evidence in the basis, which is what the methodology directs.
**The pin cannot tell a re-asserted regex claim from a hand-verified hole, because it compares the
cell's letter and never looks at its basis.** It therefore pins the one outcome a later engineering
block is supposed to be able to produce.

**This is the F-65 family again, one level up.** F-65 was an instrument that could not see a guard
idiom. F-67 corrected it. F-75 is the *regression guard built around that correction* over-reaching:
it protects the withdrawal by freezing the verdict rather than by requiring that any later WARNING
carry a hand-verified basis rather than a scanner's.

**Reach, measured.** 31 rows — the whole change record — are frozen against any future hand-verified
WARNING. Two of them are this block's. The remaining 29 sit in files no engineering block has
reached yet, so the same collision is waiting for each of them.

**Production effect: ZERO, measured.** `q20-reproduce.mjs` is not referenced in `package.json` or
`validation/harness-manifest.mjs`; it does not run in `npm test`, and the full regression is
unaffected. The scale used is the Phase 27 scale in this file's preamble, and as with F-65 the axes
are named separately: **MEDIUM for audit integrity, NONE for production engineering.**

**RESOLVED 2026-10-01 BY HOLDER RULING, and the pin is repaired.** The ruling: the change record
is historical evidence that those rows were correctly withdrawn from false mechanically-derived
WARNINGs at that checkpoint — **it is not a permanent prohibition against a later hand-verified
WARNING.** STRUCT-155 and STRUCT-163 keep their WARNINGs. The pin was to be repaired so that it
protects the original failure mode rather than freezing the verdict letter.

**What the repair is.** The policy now lives in one pure, testable place,
`q20-detector.mjs/recordRowStatus`, and the reproducer imports it. For each of the 31 recorded rows:

| ledger Q20 | verdict of the pin |
|---|---|
| **U** | always valid — the withdrawal stands, unexamined since |
| **W** | valid **only if** its Q20 basis records independent hand or source verification **and** does not re-assert the withdrawn mechanical claim |
| **P** | never valid — PASS is unreachable for Q20 by design |

The change record itself stays immutable `W → U → U` historical evidence and is still checked in
both directions: every recorded row must have been WARNING in the as-built baseline and must still
show executable evidence in its window, and no row outside the record may show that shape.
**A WARNING that re-asserts *"no zero/negative/NaN guard within ±25 lines"* FAILS — even when a
hand-verification marker sits beside it**, because on these 31 rows that claim is known false: the
guard is demonstrably present. That is the F-65 condition, and it is exactly what the pin is for.

**Honest limit, stated in the tooling rather than hidden.** A textual marker is a *person's
assertion*, not a proof; it has the same standing as the change record itself. What it buys is that
a tool sweeping the ledger cannot silently recreate the F-65 condition — to turn one of these rows
back to WARNING it must delete the mechanical rationale *and* write a claim of hand verification
that a reader can check against the cited behaviour.

**Proved, not asserted.** `q20-tests.mjs` gains layer E: an untouched UNVERIFIED row passes; a
hand-verified U→W evolution passes; the old mechanical basis fails; the same basis beside a
hand-verified marker fails; an unevidenced WARNING fails; PASS fails; and — reading the real ledger
and record — all 31 rows satisfy the policy as **29 unchanged UNVERIFIED + 2 hand-verified
WARNING**. Tests now **78 passed / 0 failed / 0 dead rules**. A scratch mutation suite
(`mutants_q20pin.mjs`, 8 mutants) drives the same cases through the real artefacts: **6 failure
modes caught, 2 POSITIVE CONTROLS accepted** — a legitimate U→W evolution and a W→U return — so the
pin is not merely refusing everything, and the ledger is restored byte-exactly after each.
`node AUDIT/reference/q20/q20-reproduce.mjs` now **exits 0** against the current ledger.

**Still ZERO production effect.** The tooling remains outside `npm test` and outside
`validation/`; no engine, harness or report behaviour changes.

---

## F-76 — the Part 23 reserve-energy sink speed is derived from the velocity clips of 23.473(d) where 23.727(a) refers to the drop height of 23.725 and its own clips — LOW — VERIFIED

**The rule's chain.** 14 CFR 23.727(a), verbatim from the vendored 2011 CFR page text: *"If
compliance with the reserve energy absorption requirement in § 23.723(b) is shown by free drop
tests, the drop height may not be less than **1.44 times that specified in § 23.725**."* And
23.725(a), verbatim: *"h (inches) = 3.6 (W/S)^1/2 ... However, the free drop height **may not be
less than 9.2 inches and need not be more than 18.7 inches**."*

**What the module does.** `sink-speed.js:135` computes the reserve as
`v.fps * Math.sqrt(PART23_SINK.reserveEnergyFactor)` — 1.44 applied to the height implied by
23.473(d)'s **clipped velocity**, not to 23.725's clipped **height**. The conversion itself is
exact: a free drop gives V² = 2gh, so a 1.44 factor on height is √1.44 = **1.2 on velocity, exactly
in floating point**, and the module reproduces both that form and the rule's own height chain at
**1.6e-16**. The defect is in which clip is used, not in the algebra.

**Why the two differ at all.** The regulation's printed figures are rounded. Deriving the height
from the velocity law gives h = 12·(4.4)²·(W/S)^½ / (2g) = **3.6104**(W/S)^½ against the rule's
printed **3.6**, and at the velocity clips h = **9.1378 in** (against 9.2) and **18.6486 in**
(against 18.7). So the two paragraphs are the same statement to about 0.3 %, and the rule's own
rounding is what separates them.

**Measured effect, and it is non-conservative:**

| case | module reserve | the rule's height chain | error |
|---|---|---|---|
| low clip, V = 7 fps | 8.4000 fps | 8.4285 fps | **−0.339 %** |
| high clip, V = 10 fps | 12.0000 fps | 12.0165 fps | **−0.138 %** |

**It bites only where a clip binds, and the high clip is REACHABLE.** Sweeping the trainer's own
declared input ranges — `stallKt` 35–70 and `clMaxLanding` 1.2–2.6 — wing loading spans
**7.79 to 31.17 psf**, and the 10 fps ceiling binds at **2 of 18** points. The as-designed trainer
sits at 14.66 psf with V = 8.609 fps, unclipped, 12.02 psf below the ceiling. Away from the clips
the module and the rule agree exactly, because unclipped the two laws coincide.

**Severity.** LOW: the magnitude is a tenth of a percent, it is confined to the clipped region, and
the reserve case is a *must-not-fail* check rather than a sizing load. Recorded because it is a
reference-condition deviation with a measured sign, not because it changes a number anyone reads.

**Not repaired.** PASS A modifies no production code.

---

## F-77 — the certification basis is an allow-list of one with a silent default, so any class that is not the trainer is assumed Part 25 — LOW — VERIFIED

`sink-speed.js:80-82`:

> `export function certificationBasis(type) {`
> `  return type === "trainer" ? "part23" : "part25";`
> `}`

**Measured:** `sinkCases({ type: "zzz", ... }).basis` returns **`"part25"`**, and the Part 25
branch is taken in full — two sizing cases at 10 and 6 fps, `liftFraction` **1.0**, and no
`floors` object at all.

**Why that matters if it ever fires.** The two bases are not small variations of each other. Part 23
assumes wing lift of **two-thirds** of the weight (23.473(e)) where Part 25 assumes **all** of it
(25.473(b)), so a Part 23 gear absorbs materially more of the aeroplane's weight at the same sink
speed; Part 23 also carries the 2.67 and 2.0 load-factor floors of 23.473(g), which the Part 25
branch does not return. A class silently routed to Part 25 would therefore be sized on the wrong
lift fraction and without its floors.

**LATENT, and it is latent by accident rather than by design.** All four classes that reach
`gearOf` today are routed correctly — trainer to Part 23, transport, bizjet and turboprop to
Part 25, measured — and `typeOf()` rejects an unknown class upstream before `sinkCases` is
reached. Nothing is mis-certified now.

**The shape is the one the project elsewhere rules out.** `registry.js`'s own header states the
principle for class dispatch: *"an unknown class is an error, never a silent fallback to eVTOL"*,
and `classOf` throws accordingly. This dispatch does the opposite: it defaults. A future Part 23
class — a second light aeroplane is the obvious one — would be assumed Part 25 with no error, no
warning and no `clipped`/`floors` evidence to make it visible.

**Not repaired.** PASS A modifies no production code.

---

## F-78 — the tyre search promises "the lightest complying tyre" and returns the one with the smallest RATED LOAD, which is a physically larger tyre at 81 % of demand levels and on every live nose selection — MEDIUM — VERIFIED

**SEVERITY NORMALISED BY HOLDER RULING, 2026-10-02: remains MEDIUM.** Reviewed in the same normalisation pass as F-68 and F-71, as its **Severity** paragraph asked, and left where it was. Nothing in the finding is changed.

**What the module promises.** `tyre-select.js`'s header is careful and explicit about the
distinction it draws, and this finding is about the second half of it:

> `verifyTyre()`  the regulation: does THIS tyre comply? Provable.
> `select*()`     a tool convention: **the lightest complying tyre**, offered as a starting point
> and labelled as a convention.

**What it does.** `smallestTyre` (l.140-150) returns the **first row of the table with
`loadLb >= need`**. The table is sorted by rated load — verified independently this block, 0
inversions over 294 rows — so that is the smallest *rated load*, not the smallest *tyre*.

**Those are not the same thing, and the table is where they part company.** Measured over the 294
rows, adjacent pairs invert on physical size constantly: **107 inversions in outside diameter, 109
in section width, 115 in od·width²**. The starkest adjacency: `17.00-16` (16,000 lb, OD **45.05
in**) is followed by `25.5x8.0-14` (16,200 lb, OD **25.5 in**) — a higher-rated tyre **19.55 inches
smaller in diameter**.

**Quantified over the whole demand range.** Sweeping demands from 500 to 70,000 lb in 25 lb steps,
2,781 levels in all: **2,264 of them — 81.4 % — have a complying tyre (rated at or above the
demand) that is physically smaller by od·width² than the one returned.** Worst case, at a 12,025 lb
demand, the returned `15.00-16` is **89.7 % larger by od·width²** than the complying
`22x6.6-10`.

**It is not theoretical: every live nose selection is affected.**

| class | demand (lb) | returned | a smaller complying tyre | smaller by |
|---|---|---|---|---|
| transport | 8,220.80 | H22x8.25-10 | 18x5.7-8 (8,600 lb) | **61.2 %** |
| turboprop | 3,032.92 | 18x5.5 | 16x4.4 (3,475 lb) | **46.5 %** |
| bizjet | 1,154.17 | 5.00-4 | 16x4.4 (1,700 lb) | 6.2 % |

**And the chosen tyre is not merely reported — it is consumed.** `gear.js:137` passes
`main.tyre` to `tyreEfficiencyFor`, so the tyre's tabulated geometry sets the strut's η_t and
deflection; `stowage.js:119` takes `sel.tyre` and grows it into the **bay envelope**. A tyre
chosen 45 inches in diameter where a complying 25.5 inch one exists propagates into the stowage
volume and the strut sizing, not just into a label.

**What this is NOT.** The returned tyre **complies** — it meets the rated-load rule, and
`verifyTyre()`, the half of the module that states the regulation, is unaffected and correct. The
module also disclaims the convention honestly: *"A caller who has a tyre in mind should verify it
rather than accept the suggestion."* So this is a wrong optimisation and an unsupported claim, not a
compliance or safety defect.

**Severity.** MEDIUM: it changes a selected component and two downstream geometries, which is more
than presentation, but the result stays compliant and the module labels the selection a convention.
**Flagged as a candidate for the same severity-normalisation pass as F-68 and F-71** if the holder
reads 61 % on a live bay envelope as significant rather than localized.

**Not repaired.** PASS A modifies no production code.

---

## F-79 — the operating inflation pressure is clamped above and not below, so a lightly or negatively loaded tyre is reported at an arbitrarily low or NEGATIVE pressure — LOW — VERIFIED

`operatingPsi` (l.155-156) computes
`ratio = Math.min(1, actualLoadLb / tyre.loadLb)` and returns `tyre.psi * ratio`.

**The source bounds it on one side only, and so does the code.** The vendored Goodyear Aircraft
Tire Data Book 2018 introduction says, verbatim: *"Loads shown are the recommended maximum for the
indicated inflation. **For loads less than the maximum, the inflation pressure can be reduced
proportionately.**"* That is a permission to reduce, with no lower bound stated — and a data book
introduction is not a licence to extrapolate the proportion to zero. The `Math.min(1, …)` cap
correctly stops the pressure exceeding the rated figure; nothing stops it falling to nonsense.

**Measured through the public selectors:**

| input | returned |
|---|---|
| total main load 1 lb | tyre `5.00-5`, rated 31 psi, **operating 0.01 psi** |
| total main load 100 lb | tyre `5.00-5`, **operating 0.97 psi** |
| nose case load 0 | tyre `5.00-5`, **operating 0.00 psi** |
| nose case load −100 | tyre `5.00-5`, **operating −1.94 psi** |

Each is returned with `resolved: true`. The negative figure is caught one step downstream —
`pavementCode(−1.94)` returns `{code: null, why: "no inflation pressure"}` — but it is caught
*after* being fabricated, not at its source, and the zero and near-zero pressures are not caught at
all: a 0.01 psi aircraft tyre is confidently assigned pavement code **Z, "Low"**.

**LATENT on everything that ships.** Across all six selections on the three resolved classes the
load ratio runs **0.8085 to 0.9905**, because the search returns the smallest tyre that meets the
demand and the result is therefore always close to fully loaded. No live design approaches the
region where this bites.

**Not repaired.** PASS A modifies no production code.

---

## F-80 — the main-tyre load falls back to the 90/10 rule of thumb that the module owning that quantity declares "not a method, and it is not used here" — LOW — VERIFIED

`gear.js:124`:

> `const mainLoadLb = statics.resolved ? statics.mainLoadTotal : wLb * 0.9;`

**The sibling module rules the fallback out in its own words.** `ground-loads.js`'s header, which
owns the static split this line falls back from, says verbatim:

> LANDING-GEAR.md section 3.4 measures 4.6-12.7 % on flown aircraft … **The ADP-style "90/10 rule of
> thumb" is a restatement of a typical outcome, not a method, and it is not used here.**

It is used here — as the **main-tyre sizing load**, which `selectMainTyre` turns into a selected
tyre, a pressure and a pavement code.

**The rule of thumb is also the wrong side of the measured answer.** The static split this line
replaces gives main-load fractions of **90.54 % (transport), 91.66 % (bizjet) and 91.19 %
(turboprop)** — every one *above* 0.9 — so the fallback would **under-state** the main load by
**0.54 % to 1.66 %**, in the non-conservative direction. LANDING-GEAR.md §3.4's measured band is
87.3–95.4 % of weight on the mains, so 0.9 sits inside the observed range: it is a plausible typical
outcome, which is precisely what the sibling module says disqualifies it as a method.

**Reachability: not observed.** `gear.js` returns early at l.102 when the geometry is unresolved,
so l.124 is reached only with a resolved geometry; `gearGeometry` resolves on the *presence* of two
gear items and never checks the sign of A or B, while `staticReactions` refuses on a negative arm —
so the fallback is the path taken when the CG falls outside the gear base. Sweeping 22 transport
inputs across their declared ranges, **242 sized designs, the geometry resolved and the static split
refused in 0 of them**, with A and B positive throughout. Measured, not proved: the sweep is
single-input and covers one class.

**And when forced, it changes nothing on the transport.** Driving the fallback value through
`selectMainTyre` directly returns the same tyre as the real split — `44.5x16.5-18`, rated
42,500 lb — because the 0.9 figure returns that tyre for any true fraction between **90.00 % and
91.40 %**, and the measured fraction is 90.54 %.

**LOW on all three counts:** not observed to be reachable, no output change when forced, and a
magnitude under 2 %. Recorded because a documented, deliberate exclusion is being contradicted one
file away, and a reader of `ground-loads.js` would reasonably believe the 90/10 rule appears
nowhere in the tool.

**Not repaired.** PASS A modifies no production code.

---

## F-81 — the trainer performance header mis-numbers the Loftin equation it implements and mis-states its own check value, while the constant itself is right — LOW — VERIFIED

`performance.js`'s header cites the climb parameter as:

> `(6.20) p.343  (CL^1.5/CD)max = 1.345 (A e)^0.75 / CD0^0.25, which is the maximum of the
> parabolic polar (checked by differentiation: (3π)^0.75/4 = 1.346)`

**Two things in that line are wrong, and the important one is not.**

**The constant is correct.** NASA RP-1060 p.343, read verbatim from the vendored page text, prints
`(cL3/2/cD) max = 1.345 (A&) 3/4 / (cD,o) ll4`. The module's **1.345 is the primary's own printed
value**, not an approximation the module chose.

**The equation number is off by one.** The primary prints that relation as **(6.21)** — the
surrounding text reads *"Equations (6.20) and (6.21) have been used to construct the chart presented
in figures 6.13"* — where the header cites **(6.20)**. The page, 343, is right.

**The parenthetical check value is wrong.** The exact closed form is
**(3π)^(3/4)/4 = 1.34475558**, not 1.346. The header's figure is out by **9.25e-4** relative, five
times the rounding the primary itself carries. The module's own constant is nearer the exact value
than the number the header offers as its verification of that constant.

**Consequence of the rounding, measured.** Because the module inherits the primary's 1.345, its
`climbParamMax` differs from a numerical maximisation of CL^1.5/CD over its *own* polar by
**1.818e-4 and by nothing else** — confirmed over 64 polars spanning CD0 0.018–0.040, AR 5–14 and
e 0.6–0.9. That is the primary's rounding, faithfully carried, and it is not a defect.

**What this finding is:** a provenance defect in a comment — a wrong equation number and a wrong
check value — in a module whose implementation is correct. Recorded because the parenthetical
presents itself as the *verification* of the constant, and it does not verify it.

**Separately, a header claim that CHECKS OUT and is recorded as such.** The same header says the
digitised Loftin figure 6.28 *"agrees with the widely used 1.132σ − 0.132 at every point"* with a
reading precision of *"about ±0.01"*. Measured across the figure's range, the worst absolute
difference is **0.00777** at 8,000 ft — inside the stated precision. The claim holds.

**Not repaired.** PASS A modifies no production code.

---

## F-82 — nothing in the trainer performance module guards anything, and several relations return Infinity, NaN or a physically impossible answer without refusing — LOW — VERIFIED

All thirteen registered relations in `performance.js` were driven by execution. **No function in
the file has a refusal protocol of any kind** — there is no `resolved` flag, no `why`, and no
input test anywhere. Measured:

| call | returns |
|---|---|
| `polar({CD0: 0, …})` | `LDmax` and `climbParamMax` both **Infinity** |
| `polar({CD0: −0.01, …})` | `LDmax` **NaN** |
| `polar({AR: 0, …})` / `({e: 0, …})` | `LDmax` **0** |
| `dynamicPressure(−100, 0)` | **33.86 lb/ft²** — a positive pressure from a negative speed |
| `stallSpeedKt({clMax: 0})` | **Infinity** |
| `stallWingLoading({vsKt: 0})` | **0** |
| `breguetFuel` at an arbitrarily long range | **2400.000 lb** of fuel from a 2400 lb aeroplane |
| `breguetRangeNm` with fuel = weight | **Infinity** |
| `breguetRangeNm` with fuel > weight | **NaN** |
| `rateOfClimb({weightLb: 0})` | **Infinity** |
| `levelFlight({vKt: 0})` | every returned quantity **Infinity or NaN** |
| `pistonPowerRatio(NaN)` | **NaN** |

**Two of these deserve naming separately.** `dynamicPressure` squares the airspeed, so a negative
speed yields a perfectly plausible positive dynamic pressure — the F-58 shape, a clean answer from
an impossible input. And `breguetFuel` will happily report that the aircraft burns its own entire
weight in fuel, because the exponential asymptotes to zero end weight and nothing bounds it.

**Against that, one boundary IS handled well, and deliberately.** `pistonPowerRatio` returns
**NaN above 24,000 ft** rather than extrapolating Loftin's figure 6.28 past its last breakpoint —
measured, 23,999 ft gives 0.400018 and 24,000 ft gives NaN — and the module says so in a comment,
*"outside the figure"*. That is a refusal, and it is the reason Q8 is recorded PASS on that
relation: an empirical curve that declines to be extrapolated.

**LATENT, and LOW on that basis.** This is a pure-formula library whose callers supply inputs from
the trainer class's validated sliders; nothing in the shipped input surface reaches any of the
degenerate values above. Recorded because the module is exported and reusable, and because a reader
would not guess from its interface that none of it refuses anything.

**Not repaired.** PASS A modifies no production code.


## F-83 — the payload search never tests the bottom of its own bracket, so when nothing closes it answers "0 kg" as though it had found it — LOW — VERIFIED

`maxPayloadAtMTOM` (`engine/certification.js:134-155`) answers *"given the category and the mission,
how much can it carry?"* by bisection on payload between `lo = 0` and the bound of FORMULA-REG-009
(l.145). **It tests the upper end and never the lower one.** When no payload in the bracket closes,
every probe moves `hi` down, and the function returns the untested `lo` as its answer, under the
same note a successful search prints. Measured by driving the real sizing loop through a counting
wrapper:

| case | returned | what is true |
|---|---|---|
| limit 500 kg | `payloadKg 0`, `mtowKg null`, *"bisection on payload, 10 sizing evaluations"* | a **1 kg** payload already sizes to **771.2 kg**; nothing closes |
| range 400 km, default 5,700 kg limit | `payloadKg 0`, same note | every evaluated payload is infeasible |
| payload `NaN` or `maxPayloadKg NaN` | `payloadKg 0`, *"… 0 sizing evaluations"* | `hi` is `NaN` and the loop never runs; one evaluation was made |
| limit 3,175 kg (SC-VTOL Issue 1) | 550 kg, *"10 sizing evaluations"* | correct answer; **11** evaluations were made |

**The sibling function in the same file gets both right.** `maxRangeAtMTOM` evaluates the bottom of
its bracket first (`feasible(1)`, l.104) and, when that fails, says so in words: *"no mission closes
inside the limit — the airframe alone exceeds it"*. Asked the same 500 kg question it returns that
sentence. It also starts its evaluation counter at 2, counting both bracket probes; the payload
function starts at 0 and omits the probe at `hi`, so its `iterations` and its note are one short
whenever the bisection runs.

**And the lower end is not a payload the engine can size at all.** A zero payload throws inside a
cabin display string after the loop converges — already recorded as **F-R16** — which `feasible()`
swallows as *infeasible*. So the value returned when nothing closes is the one point in the bracket
that is guaranteed not to be a design.

**The rest is sound, measured.** The bound reproduces longhand on ten inputs; the bisection closes a
910 kg bracket in exactly ⌈log₂ 910⌉ = 10 steps; and its premise holds, MTOW rising monotonically
in payload with **0 decreases over 91 sized points** (10 to 910 kg, 4.31 kg of MTOW per kg of
payload). At the default 5,700 kg limit the 455 kg design closes at the doubled bound, and the
function says so honestly — `bounded: true`, *"feasible at the 910 kg search bound"* — though that
early return carries no `mtowKg` where the range function's does. The rounding of the reported
payload past the last feasible value is **not** re-raised here: it is **F-R01p**, with the
measurement in NUMERICAL-STABILITY.md.

**LATENT, and LOW on that basis.** Both inverse functions are exported from `engine.js:219` and
consumed **nowhere** in `src/` or `validation/`. Recorded because the function is public API and
because a confident zero is the F-58 shape — an impossible answer reported as a measured one.

**Not repaired.** PASS A modifies no production code.


## F-84 — the missed-approach climb margin is inverted at the take-off mass while the requirement is stated at the landing mass, so the reported margin is λ times the true one — LOW — VERIFIED

`complianceMatrix` (`classes/aircraft/compliance.js:118`, FORMULA-REG-001) turns the matching chart's
required thrust-to-weight back into the climb gradient the design achieves:

    achieved = req + (T/W_design − T/W_req) · (nE − 1)/nE

That is the exact inverse of Scholz (5.14), and for the **second segment** it is right, measured to
2.2e-16 against the chart's own line on nine transport configurations and on the bizjet. **The same
expression is used for the missed approach, and there it is not the inverse of the line it reads.**
Scholz (5.22)-(5.24), vendored, states 25.121(d) at the **maximum landing mass** and converts it to
the take-off mass the matching chart works in:

    T_TO/(m_MTO g) = nE/(nE − 1) · (1/E + sin γ) · m_ML/m_MTO

and `transport/size.js:203` implements exactly that, with `landingToTakeoffMass` = λ. Solving it
for γ divides the surplus by λ; the relation does not. **The reported margin is therefore λ times
the true one, exactly**, on every design:

| class | λ | achieved, reported | achieved, true | margin understated |
|---|---|---|---|---|
| transport (2, 3 and 4 engines; all three fuel methods) | 0.84 | 7.79 % | 8.87 % | **16.00 %** |
| bizjet | 0.895 | 16.66 % | 18.36 % | **10.50 %** |

The verdict cannot flip. λ > 0 preserves the sign of the surplus, so a PASS stays a PASS and a FAIL
a FAIL; only the size of the margin is wrong, and it is wrong conservatively. The row's own note
already warns that a marginal FAIL on this line may not be real — that note is about the gear-down
drag increment, worth *"roughly 6 % of gradient"*, and this is a second, undeclared conservatism of
16 % on the transport stacked on top of it.

**Two smaller things in the same relation, measured.**

1. **The turboprop never reaches it.** Its matching chart computes both lines — in power-to-mass
   form, `pmSecond` and `pmMissed` (`turboprop/size.js:102,105`) — but `climb()` reads only
   `twSecond` and `twMissed`, so both rows are reported NOT EVALUATED under the detail *"The matching
   chart does not report this requirement for this class."* It does. Inverting the turboprop's own
   lines gives a second-segment gradient of **4.36 %** against 2.4 % and a missed approach of
   **3.58 %** against 2.1 %; the panel shows 0 passes and 10 rows not evaluated.
2. **The achieved figure is sin γ, printed as a gradient.** Scholz (5.17) substitutes the gradient
   for sin γ because the angle is small, which holds at the requirement (0.03 % at 2.4 %). The
   achieved values are larger: the bizjet's second segment prints **17.33 %**, whose tangent — the
   quantity 25.121 regulates — is **17.60 %**.

**Not re-raised:** the W-1a and W-1c weight rows that vanish instead of reading NOT EVALUATED are
**F-R21**. Measured this block, that defect is wider than recorded there: the transport also loses
W-1c under two of its three fuel methods (regulatory and loftin), because only the segment mission
returns a trip fuel for FORMULA-REG-002 to convert.

**Observed and NOT adjudicated here:** the default bizjet reports **W-1a FAIL** — operating empty mass plus
payload 9,081.2 kg against a maximum zero-fuel mass of 8,729.7 kg, 351.6 kg over. The compliance row is
doing its job; whether the sized empty mass or the 0.6957 ratio is at fault is a WEIGHT-domain question
and outside this block.

**LOW.** Display only: `tabs.jsx:1173` is the sole consumer, and the verdicts it shows are right.

**Not repaired.** PASS A modifies no production code.


## F-85 — both uncertainty methods accept a DIVERGED baseline, so the screen reports an error bar around a design that never closed — MEDIUM — VERIFIED

`uncertaintyBand` and `sampledBand` (`engine/uncertainty.js:109-112` and `:296-299`) start by sizing the
baseline, and refuse only if its objective is not a finite number:

    if (base0 == null || !isFinite(base0)) return { error: … };

**A non-converged sizing still returns a finite MTOW**, so it passes. Every *excursion* is then
filtered on `r2Diverged` (l.129, l.336) — the module knows the flag exists and uses it — but the
baseline those excursions are measured against is not. Measured on the screen's own path
(`runSizing(engineInputs(…))`, as `UncertaintyTab.jsx:28` calls it), varying only the rotor count
from the defaults:

| rotors | baseline | one-at-a-time screen | sampled, N = 10 |
|---|---|---|---|
| 4 | **diverged**, MTOW 10,982.78 kg | rss 0.0 %, 0 contributions — no error, no warning | p50 none, 0 of 10 converged |
| 6 | **diverged**, MTOW 9,838.53 kg | **rss 104.5 %**, *"dominated by propDiam, nPropHover"* | **p50 2,559 kg** (4 of 10 converged) |
| 8 | converged, 2,523.58 kg | rss 25.1 % | p50 2,538 kg |
| 12 (default) | converged, 2,469.91 kg | rss 10.5 % | p50 2,559 kg |

At six rotors the screen reports *"MTOW 9,839 kg, ±104.5 %"* and names the two inputs that dominate
it. The baseline is not a design. One of the two excursions that survive, `nPropHover` at **7.5**
rotors, closes at 2,811 kg — a converged neighbour 71 % lighter than a non-converged centre. The
sampled method is equally unguarded: its percentiles are positions among the draws that did
converge, reported as offsets from a base that did not.

**The fix is the module's own idiom.** It already filters every excursion on `r2Diverged`. Applying
that test to the baseline would return the existing `error` object. The research note the module
cites says the same of samples: *"Non-convergent samples must be counted and shown, never dropped"*
(UNCERTAINTY-AND-RISK.md §1.4). A non-convergent baseline is the extreme case of that rule.

**MEDIUM — meaningful but localized.** Reachable from a stock slider value on the shipped input
surface, and presented in the UI with no qualification. Localized: the band is displayed by
`UncertaintyTab.jsx` and consumed by nothing else (`App.jsx` imports `uncertaintyBand` and never
calls it), so no sizing number depends on it. FORMULA-REG-071, -072 and -078 carry it at Q5.

**Not repaired.** PASS A modifies no production code.

## F-86 — the one-at-a-time screen drops every input it finds inert without trace, counts only the movers as "perturbed", draws rotor counts the sampled method forbids, and divides a clamped excursion by its nominal band — LOW — VERIFIED

Four bookkeeping defects in `uncertaintyBand`, all measured at the defaults on the screen's own
sizing path. **None of them changes the RSS band at the defaults by more than 0.003 percentage
points**; each changes what the result says about itself.

1. **Inert inputs vanish.** 28 tagged, non-requirement inputs are perturbed and **22** contributions
   come back. The other six — `clCruiseMax`, `clDesign` and `climbLDPenalty` (all *unverified*, at
   ±25 %), `nRotorsStopped`, `vtGamma` and `vtRuddervatorChordFrac` — move MTOW by exactly 0.0000 kg
   at both ends, and l.142 drops them. They appear in no list: not in `contributions`, not in
   `inputsSkipped`, not in the note. A reader cannot tell an input that was tested and found inert
   from one that was never tested. Whether those six SHOULD be inert is a question about the
   engine, not this module, and is not adjudicated here.
2. **`inputsPerturbed` is the number that moved, not the number perturbed**: 22 against 28.
3. **Counts are drawn continuously.** `sampledBand` excludes `COUNT_KEYS` because *"a draw of 10.4
   rotors is not an aircraft"* (l.224). The one-at-a-time screen applies no such exclusion. At the
   default 12 rotors, ±25 % lands on 15 and 9 by luck; at **6** rotors it is **7.5 and 4.5**, and
   at 8 it is 10 and 6. `nRotorsStopped` is perturbed to 2.04 and 1.96.
4. **A clamped excursion is divided by the unclamped band.** The elasticity (l.151) is
   `(half / base0) / w`. Where a physical bound clamps the excursion, the input moves less than
   `w`. At `etaBat` **0.99** — the slider's own maximum — the high side is clamped to 0.995, a
   0.505 % move, and the governing excursion is that side. The reported elasticity, 0.0456, is
   **half** the 0.0902 that excursion implies.

Separately, in `sampledBand`, a `NaN` seed is coerced by `>>> 0` to 0 for **every** replicate. All
five then draw the identical stream (first draw 0.666967, five times) and the replicate spread is
exactly zero on p5, p50 and p95, where the default seed gives 160.9, 144.4 and 223.3 kg. The
stability check the replicates exist for becomes vacuous, while the result still reports
`seed: NaN`. This is unreachable: `sampledBand` has no UI caller.

**What was verified clean**, so the shape of this finding is clear. The generator matches an
independent BigInt reference over seven million draws, with 0 mismatches. It has the full 2³²
period by the Hull–Dobell conditions. The five replicate streams share no value in their first
200,000 draws each. The type-7 quantile is exact three independent ways. The band ends reproduce on
every input of both methods. Every Latin-hypercube column is one draw per stratum.

**LOW.** Presentation and bookkeeping on an advisory tab.

**Not repaired.** PASS A modifies no production code.


## F-87 — the Schlegel vortex-noise term is 18.6 to 22 dB below the method it cites, the in-code "correction" that put it there replaced the right constant with a wrong one, and the harness pins the right value out — HIGH — VERIFIED

**SEVERITY NORMALISED BY HOLDER RULING, 2026-10-02: remains HIGH, and the CRITICAL-candidate flag is REMOVED.** The passages below that describe the flag and set out the evidence on the CRITICAL question are kept as the record of why it was raised and how it was resolved; the recommendation recorded there, that HIGH stand, is the ruling. See also the domain-level conclusion that follows F-89.

**Severity by holder ruling, 2026-10-02: HIGH, and flagged as a CRITICAL candidate for the final
severity normalisation** if the defect proves to change a formal certification or release
conclusion rather than an advisory target. The evidence on that question is set out at the end.

**Primary.** Marte, J. E. and Kurtz, D. W., *A Review of Aerodynamic Noise From Propellers, Rotors,
and Lift Fans*, JPL Technical Report 32-1462 / NASA-CR-107568, 1 January 1970, NTRS 19700005920.
Vendored by holder ruling at `eVTOL_Sizing_Research/classes/cross-class/sources/acoustics/`, with a
manifest carrying the URL and SHA-256 `d0fbb51b…c12a7e`. Equations (1) and (3) and Appendix C were
read on rendered page images, because the OCR layer drops the exponent and the divisor of
equation (3).

**The primary's own worked example is the oracle.** Appendix C, section 2: a three-blade rotor,
T = 10,000 lb, R = 21.3 ft, 270 rpm, chord 1.0 ft. The primary computes V₀.₇ = 421 ft/s,
A_b = 64 ft² and **78.7 dB at 300 ft**.

| | level at 300 ft |
|---|---|
| the primary, printed | **78.7 dB** |
| reproduced longhand from its sea-level form, 10(2 log V₀.₇ + 2 log T − log A_b − 3.57) | 78.74 dB |
| reproduced from equation (3) with C_L = T / (½ρV₀.₇²A_b) = 0.7406 | 78.75 dB |
| **the shipped vortex term on the same rotor** (module output, and longhand from the code's own expression) | **60.13 dB** |
| the form the code cites, K₂ = 1.206e-2 with 1/ρ and the tip speed | 82.10 dB |

**The shipped term is 18.57 dB below the primary's example and 21.97 dB below the form it cites.**
The two reference forms differ by 3.4 dB because the cited constant assumes a mean lift
coefficient of 6C_T/σ where the primary's example uses 2T/(ρV₀.₇²A_b). That 3.4 dB is a difference
between two published readings. The 18.6 dB is not.

**Where the 21.97 dB comes from, factor by factor.** The cited constant is reproduced from the
primary: √(6.1e-27 / 1e-16 · 0.7⁶ · (6/0.4)²) · 300 ft = **1.2055e-2 s³/ft³**. It belongs to

    p = K₂ · V_tip / (ρ · d) · √(T/σ · T/A)

so it carries s³/ft³, the formula carries 1/ρ, and the speed is the TIP speed, the 0.7 being
already inside the constant. Its SI value is 1.206e-2 / 0.3048³ = **0.42589**.

| defect in `noise.js` | line | effect |
|---|---|---|
| the constant is 0.039566 where the SI value is 0.42589 (FORMULA-REG-015) | 47 | −20.64 dB |
| the expression has no 1/ρ (FORMULA-REG-051) | 235 | +1.77 dB at sea level |
| 0.7 is applied to the tip speed a second time (FORMULA-REG-049, -051) | 231, 235 | −3.10 dB |
| **sum** | | **−21.97 dB**, exactly the difference measured on the worked example |

The expression as coded is declared dimensionless and has units of N/(m·s). The conversion in
its comment — lbf → N, lbf/ft² → N/m², ft² → m² — follows from the units of neither form.

**The "correction" is the defect.** `noise.js:35-46` and `:220-228` record that the constant *"was
WRONG once"*, held **0.4259**, and was changed on 2026-08-24 to 0.039566 because the old value did
not match *"a derivation written directly above it"*. **0.4259 is the right SI value.** The
derivation it was changed to match is the one that is wrong. Before that change the vortex term
was 1.33 dB from the cited form (the missing 1/ρ and the extra 0.7 only).

**The harness enshrines it.** `validation/acoustics.mjs:111-121` "recomputes" the constant by
retyping the same expression, asserts the module equals it, and then **pins 0.4259 out** as
*"exactly one area conversion"* so that *"the same wrong turn cannot be made silently again"*. The
check passes because it compares the expression with itself. It is not independent evidence, and
it now blocks the correct value.

**Consequence, measured through the real engine on the screen's own sizing path.**

| configuration at its defaults | 150 m as shipped | per the primary's example | per the cited form |
|---|---|---|---|
| lift+cruise | 46.4 dBA | 61.7 | 65.0 |
| hybrid (the default) | 50.8 | **66.4** | **69.7** |
| hybrid pusher | 51.0 | 66.5 | 69.8 |
| tiltrotor | 50.5 | 67.2 | 70.5 |
| multicopter | 52.4 | 67.0 | 70.3 |
| side-by-side | 53.2 | 67.7 | 71.0 |

Over a sweep of the input sliders — six configurations, 2 to 12 rotors, 1 to 5 m diameter, 100 to
900 kg payload, ISA −15 to +30 °C — **1,017 designs converge. As shipped, 1,001 of them are at or
under 65 dBA at 150 m. With the vortex term per the primary's example 401 are, and with the cited
form 90 are: the verdict flips on 600 and on 911 designs.** The vortex term is already the largest
single-rotor source on 761 of the 1,017 as shipped, so the correction passes almost entirely into
the total: +2.5 to +19.5 dB (primary) and +4.3 to +22.8 dB (cited).

**Existing claims this contradicts, identified and NOT edited.**

- `AUDIT/UNITS.md:100` records `4.448` and `47.88` inside `SCHLEGEL_K2_SI` as **PASS**. That row
  checks the two numerals against their exact values, and on that it stands. It does not check
  whether those are the factors the conversion needs, and they are not.
- `src/lib/provenance.js:263` marks `dBA_100m` **"validated"**: *"64 dBA against the NASA-measured
  Joby upper bound of 65 dBA at 100 m … Was +12.6 dB before the vortex-constant fix (a ft^2/m^2
  conversion applied in the wrong direction, worth 20.6 dB)"*. The agreement it certifies was
  produced by the change this finding identifies as the error. The figure is also stale: the
  validation run now prints **54.1 dBA** for that aircraft, not 64.
- `src/lib/provenance.js:265` marks `dBA_150m` *"sourced … Anchored by the validated 100 m point"*,
  and `:268`, `:271` mark the contour, the total and the component split *"sourced"*.
- `docs/THEORY.md` §11.1 lists *"a Schlegel vortex term"*. `noise.js:206` titles it *"VORTEX (BVI)
  NOISE"*; Schlegel's vortex noise is the broadband shedding term, which the primary treats
  separately from blade-vortex interaction ("blade slap").

**What this finding does NOT establish, stated plainly.** It does not establish that the higher
number is the true noise of these aircraft. The only measurement in the repository is the
one-sided Joby bound, *"below 65 dBA at 100 m"*, and by the provenance record's own account the
method read 12.6 dB above that bound before the constant was changed. So Schlegel's 1966
helicopter correlation, applied faithfully, over-predicts the one eVTOL data point held. What is
established is narrower and is enough: the shipped term is not the method it names, the constant
is an undeclared calibration presented as a unit conversion, the harness that guards it compares
it with itself, and the status "validated" certifies that fit.

**On the CRITICAL question — evidence, and a recommendation.** The 65 dBA comparison is consumed
at `CertificationTab.jsx:233` and `:477` and printed by `export/report.js:665, 953, 1023`. Both tab
rows describe it as a *target*: *"EASA UAM community noise target … No specific FAA numeric limit
yet"* and *"(EASA UAM / FAA advisory target)"*. `validate.mjs:234-238` computes the 100 m bound
test and `:380-383` prints it; nothing else reads it, so it does not gate the exit code. The model
is hover-only and cannot produce a certification EPNL at all, which `acoustics.mjs` itself says.
**On this evidence the defect changes an advisory target on most reachable designs and no formal
certification or release conclusion, so HIGH is recommended to stand.** The flag remains for the
normalisation pass.

**Not repaired.** PASS A modifies no production code.

## F-88 — the tonal line labelled "Gutin" is not Gutin's equation, the compressibility term is half its own stated derivation, and the broadband term is defined off the tonal one — HIGH — VERIFIED

**SEVERITY NORMALISED BY HOLDER RULING, 2026-10-02: MEDIUM → HIGH.** The grade is the only thing changed. The closing paragraph below headed *MEDIUM, not HIGH, on the evidence held* is kept as the auditor's original reasoning; the holder has graded the formulation errors themselves as HIGH. See also the domain-level conclusion that follows F-89.

Flagged for the severity normalisation **together with F-87**, since both act on the same output.

**The primary.** Marte and Kurtz equation (1), read on the page image, gives Gutin's result as

    p_m = 169.3 · m·B·R·M_t / (S·A) · [ 0.76·P_h / M_t² − T·cos θ ] · J_mB(0.8·M_t·m·B·sin θ)

with θ measured from the forward axis. `noise.js:152` (FORMULA-REG-032), described as the *"bare
Gutin loading pressure"*, differs from it in four ways, each measured.

| | the primary | `noise.js` | effect |
|---|---|---|---|
| prefactor | m·B·Ω·T / (2√2·π·c·r), a pressure | B·Ω·T / (4π·r·ρ·c²·√2), units of **m/s** | **−58.4 dB** at sea level |
| Bessel order | **mB** | **1** (`:148-150`, REG-031) | 23.9 dB (3 blades), 41.6 dB (5 blades) |
| thrust directivity | cos θ — **zero in the rotor plane** | sin θ, evaluated in the rotor plane (`:113`, REG-022) | the term the code computes is the one that vanishes there |
| the power (torque) term | present, and the only one left in-plane | absent | |

The calibration constant `K_cal` then adds 12 to 15 dB. **Net, at the fundamental and 1 m:** on a
five-blade rotor at tip Mach 0.46 the shipped level is 98.35 dB against a Gutin maximum of 99.02
(at 106° from the axis); on the three-blade default-like rotor it is **94.09 dB against 108.53**
(at 113°), and 104.25 in-plane. The agreement on the first rotor is a coincidence of the
calibration point, not of the form: for +10 % tip speed at fixed thrust the shipped fundamental
rises 0.95 dB on that rotor where equation (1) rises 3.76 dB.

**The register records REG-031 and REG-032 as `DIRECTLY STATED`.** They are the first rows this
audit has found where the register *over*-records a source rather than under-recording one. Q10
is register-bound and was left as the register has it; editing the register to agree with a
conclusion drawn from it is the F-42 error.

**The compressibility term contradicts its own comment** (`:117-121`, REG-024). The comment states
p ∝ 1/√(1 − M²). In decibels that is −10·log(1 − M²). The code has −5. The comment's check values,
0.89 dB at Mach 0.58 and 1.19 at 0.65, reproduce the coded −5 and are half what the stated
proportionality gives. It is worth 0.54 to 0.64 dB on reachable designs.

**The calibration is never used where it was fitted.** `K_cal` and the decay slope are referenced
to a disk loading of 500 N/m², tip Mach 0.58 and **six blades**. Every one of 1,017 reachable
designs has **2, 3 or 4 blades** and a tip Mach of **0.47 to 0.51**, so the blade-count term always
extrapolates below its reference (+3.0 to +6.0 dB) and the Mach terms always sit below theirs.
The fit data — Fleming 2022 and published Joby and Volocopter levels — is not held, so none of
the coefficients can be checked, and the validity envelope the module enforces does not include
blade count at all.

**Broadband is tonal minus eight.** `:202` (REG-048) defines the broadband level as the tonal
level − 8 dB plus two corrections, so it inherits every tonal term: changing only the blade count
from 5 to 3, with chord, tip speed and thrust fixed, moves the broadband level by **−7.97 dB**,
exactly as the tonal level moves. And the primary calls vortex noise *"the dominant source of broad
band noise"*, so the model sums two terms — "BPM broadband" and "Schlegel vortex" — that stand for
the same source.

**What holds, measured.** An independent longhand chain reproduces the module on **4,320 contexts ×
9 outputs with 0 outside rounding**. The A-weighting matches its transfer function to 1.4e-4 dB,
checked against the vendored Clarke 2021 equation (22). The harmonic frequencies, the 2e-5 Pa
reference, the energy sums, the incoherent rotor sum and the spherical spreading are all exact.
The vortex peak-frequency rule is the primary's, verbatim.

**MEDIUM, not HIGH, on the evidence held.** The header calls the model *"semi-empirical"* and the
harness says in terms that the absolute level *"rests on a fit"*. What is established is that the
form is not the one named, that it is dimensionally inconsistent, and that its sensitivities
differ from the cited theory's. Without the fit data, no error in the calibrated level can be
established in either direction.

**Not repaired.** PASS A modifies no production code.

## F-89 — the tip-Mach validity flag can never be false, the Bessel approximation is 3.8 dB outside its stated ±0.4 dB with a 3.7 dB step, and several sentinels are reported as results — LOW — VERIFIED

All measured. **None is reachable from the input sliders**, which hold the tip speed at the
configuration default (tip Mach 0.47 to 0.51, Bessel argument 0.75 to 1.62). All are reachable
through the API or a design file, which accept `tipSpeed` and `nBlades`.

1. **`Mtip_ok` is a tautology** (`noise.js:84, 102`). The Mach number is clamped to 0.699 *"for
   safety"* and the flag then tests the clamped value against 0.70. It is true at a real tip Mach
   of 0.76 and of 0.97. Above the clamp the level stops rising and then falls as the tip speed
   rises: 107.06 dBA at Mach 0.699, 106.76 at 0.764, **100.02 at 0.970**. The harness computes that
   very case — `acoustics.mjs:219`, a tip speed of 260 m/s — and discards the result with `void`;
   its check 9 asserts only the in-envelope point.
2. **`DL_ok` reads a different disk loading from the one the model uses.** The flag tests the
   installed value; every acoustic term uses the hover value, 1.30 times smaller on every
   reachable design.
3. **The J₁ small-argument form** (`:143-150`) is described as *"valid to ±0.4 dB for x ≤ 3"*.
   Against an exact series it is −1.24 dB at x = 2.0 and **−3.78 dB at 2.399**, and the switch to
   the asymptotic form at 2.4 is a **3.70 dB step**: five blades at 203.9 and 204.3 m/s give tonal
   levels of **88.0 and 91.7 dBA**. Beside the true zero at 3.83 the asymptotic form is 35 dB out,
   and the 1e-6 floor that follows turns the zero itself into a 120 dB notch.
4. **The ground term is a step, so the contour is not unique** (`:279`). The +2.5 dB switches on
   at 10 m: 75.95 dBA at 10 m, 78.45 at 10.001 m. A target inside the step is crossed at 8.72,
   10.01 and 11.62 m, and the bisection returns 12 m.
5. **Sentinels returned as radii** (`:296-299`). A source already below the target at 1 m reports
   a contour of **1 m**; one that never reaches it reports the search bound, **100,000,000 m**. A
   NaN level also reports 1 m.
6. **Nothing refuses a degenerate input.** A zero solidity reports a vortex level of 135.9 dBA and
   a 65 dBA contour of 4,325 m; a rotor count of 0 reports NaN for every level beside a contour of
   1 m; a weight of −100 kg reports 65.86 dBA. In every one of those the validity flags all read
   true. The radius flag does turn false at zero radius, and the Mach flag at a NaN temperature.
7. **The interaction debit reverses the rotor sum** above 29 rotors (`:259`): −0.15 dB per rotor
   outruns 10·log N. The slider stops at 10.
8. **The exported report does not use the engine's propagation.** `export/report.js:857` redraws
   the level-against-distance curve from `dBA_1m` with a fixed 1.8 dB/km, against the engine's
   1.69 dB/km on the default design.
9. **`OASPL_total_1m` is an A-weighted level**, shown on the noise tab under that name in "dB".

**LOW** on reachability. Item 1 is the F-60 shape — a guard that cannot fail — and would be MEDIUM
if a slider exposed the tip speed.

**Not repaired.** PASS A modifies no production code.

## Domain-level audit conclusion — the acoustic subsystem (holder ruling, 2026-10-02)

**The present acoustic/noise subsystem (`src/engine/noise.js` and the outputs it feeds) is NOT
quantitatively validated for engineering decision use until PASS-B remediation and independent
revalidation.** F-87 and F-88 establish major formulation errors in two of its three source terms:
the vortex term is 18.6 to 22 dB below the method it cites, and the tonal term is not the equation
it names, is dimensionally inconsistent and carries a calibration never exercised where it was
fitted. The broadband term is defined as an offset from the tonal one and inherits its defects.

**What this covers.** Every level the stage returns — `dBA_1m` to `dBA_500m`, `OASPL_total_1m`,
the `dist_55/65/70/75dBA` contours, `noiseComponents`, `bpfHarmonics` amplitudes and
`noise_sensitivity` — and every consumer of them: the 65 dBA rows of `CertificationTab.jsx:233` and
`:477`, the noise tab, the noise section of `export/report.js`, and the 100 m bound test printed by
`validation/validate.mjs`. The `validated` and `sourced` statuses that `src/lib/provenance.js`
attaches to those outputs are contradicted by F-87 and are not relied on by this audit.

**What it does not cover.** The conclusion is confined to the acoustic subsystem. `noiseStage` runs
once on converged values and feeds nothing back into the sizing loop — Q17 is PASS on all 42 of its
relations — so no mass, power, energy or geometry result depends on it. **This conclusion is not a
statement about the rest of the sizing engine and must not be read as one.** The parts of the
stage that were verified exactly — the A-weighting, the harmonic frequencies, the reference
pressure, the energy and rotor sums, the spherical spreading and the vortex peak-frequency rule —
remain verified; they do not make the levels usable while the source terms are wrong.

**Not repaired.** PASS A modifies no production code.


## F-90 — the battery thermal stage's "cruise balanced" check cannot fail, its cap limits the cooling mass but not the cooling it credits, the cell-temperature check starts from a fixed 35 °C whatever the day, and pack systems are added on top of an installed-pack specific energy — LOW — VERIFIED

`src/engine/battery-thermal.js`, all eight registered relations, driven by execution. **The
arithmetic is right**: an independent longhand of the whole function reproduces it on 3,600
contexts × 9 outputs at 0.0e+0, the plate coefficient 0.048 is confirmed from Navier's series
(0.04789 at ν = 0.3), and the header's identity M = 0.048·n·m·g holds at 1.1e-16. What follows is
about what the stage reports and assumes, not about its sums.

1. **"Cruise thermally balanced" is a tautology.** `cruiseBalanced = Qreject >= Qcr` (l.186),
   where `Qreject = Math.max(Qcr, …)` (l.169). It is true by construction: 0 failures over 80
   synthetic heat combinations spanning nine decades, and **0 of 499** reachable designs. It is
   shown as a design check at `engine.js:2844`. The one input that makes it false is a NaN.
2. **The 20 % cap limits the mass and not the rejection.** When the cap binds (FORMULA-BATTERY-015)
   the BTMS mass is cut to 20 % of the pack, and the stage goes on crediting the full uncapped
   heat rejection in the temperature rise and in the check above. A 100 kg pack with 400 kW of
   hover heat is charged **20 kg** of cooling, credited **300 kW** of rejection, and 20 kg buys
   **44.4 kW** at the module's own 0.45 kg/kW. **Unreachable today**: the cap binds on 0 of 499
   designs, whose BTMS runs from 0.3 to 10.8 % of the pack.
3. **The cell-temperature check starts from 35 °C on every day.** `tAmbientC` is a constant; the
   ISA-deviation slider is not read. At +30 °C the field air is 45 °C at sea level. Of 475
   designs that converge there, **3** are reported within the 55 °C limit and exceed it from a
   45 °C start, and **412** are reported inside the 45 °C optimal band while starting at its edge
   with a positive rise. The default at +30 °C is reported at 39.8 °C.
4. **Pack systems are added on top of an installed-pack figure.** Under `sedBasis: "packUsable"`
   the engine describes the entered specific energy as NASA's *"installed, usable battery specific
   energy … (pack)"*, *"values for pack, not cell"*. The stage is still called and its mass still
   added: at 400 Wh/kg, **36.5 kg on a 250.34 kg pack (14.6 %)**; at the default cell basis,
   62.3 kg on 543.77 kg (11.5 %). **This is recorded as a lead and not adjudicated**: whether an
   installed-pack figure already contains BMS, cooling and containment is decided where the stage
   is called, in `engine.js`, which belongs to the SIZING domain.
5. **The pack is a slab for the tray and a cube for its surface** (FORMULA-BATTERY-025): 22.1 %
   apart for a 746 kg pack. The cube area is returned as `packFaceAreaM2` and consumed nowhere.
6. **Sentinels in place of refusals.** A pack mass of zero or below is replaced by 1 kg and
   returned 6.01 kg of pack systems; a NaN or negative hover heat becomes zero heat and a pass; a
   missing series count becomes 100; an unknown pack location or runaway strategy silently takes
   the lighter default while the result reports the string it was given; a negative hover time
   gives a negative temperature rise and a pass.

**Three things that were checked and are NOT defects.** The dormant location decision — every
location returns the same mounts below 929 kg — is declared in the header and reproduces exactly
(929, 1,549 and 4,647 kg). The BMS overlap with the electrical group is declared in
`weights.js:652-655` and already recorded as **F-M04**. And the header's *"108 kW"* of hover heat
is a figure from an earlier default; the present default generates 84.7 kW.

**Question 12 opens with this block, and it opens with a PASS.** The four masses the stage
returns are counted as mass only: they enter the empty weight through `weights.js:656, 741`, and
the pack energy is formed on the pack mass alone — 152.065 kWh / 543.77 kg = 279.65 Wh/kg, the
derated cell figure — with MTOW − payload − pack mass equal to the empty weight to 0.01 kg.

**LOW.** Items 1, 3 and 6 reach a displayed check and no mass; item 2 is unreachable; item 5
reaches nothing. Item 4 does reach MTOW and is left for its owning domain.

**Not repaired.** PASS A modifies no production code.


## F-91 — the drone pack audit is right on every published pack, and accepts a negative cell count, a negative current limit and a non-finite energy without refusing — LOW — VERIFIED

`src/classes/drone/battery.js`, all seven registered relations. **The module's central claim
holds, measured.** Its voltage-field audit was recomputed longhand from the published fields of
all 17 packs in the two data sets, 7 in the vehicle truth set and 10 in the component catalogue,
with **0 disagreements**. The header's DJI survey reproduces exactly. Four of the five DJI packs
agree with their published energy to under 0.05 Wh. The TB60 is 5.935 Ah × 52.8 V = 313.37 Wh
against a published 274 Wh, +14.37 %. 52.8 V across 12 cells is 4.40 V per cell, a charge limit,
and the published energy implies 46.17 V = 3.847 V per cell. The discharge limit uses the stated
current or the published C rating and never the catalogue's computed one. The data in `src/data`
agrees with the research-corpus survey it was generated from.

**What it does not refuse, measured on synthetic records.** No record in either data set
reaches any of these.

| input | returned |
|---|---|
| series cells −6 | −3.700 V per cell, reported without comment |
| series cells 6.5 | 3.415 V per cell |
| published energy 0, negative or NaN | treated as *not published*, and the energy is then DERIVED from the printed voltage without saying the published figure was invalid |
| published energy Infinity | used as published: pack energy Infinity |
| stated continuous current −100 A | a margin of **+110 %** |
| stated continuous current 0 A | a margin of −Infinity |
| demanded current −20 A | *within* the limit at a 120 % margin |
| capacity as the string "5000" | audited as if numeric |

**Checked and NOT a defect.** The 2 % consistency tolerance flags two catalogue cells whose
printed voltage is a genuine nominal (Molicel P42A −2.45 %, LG M50LT −2.68 %). The only consumer,
`risk.js:299-312`, deliberately grades a few per cent as a coarse nominal rather than a charge
limit, so no answer changes.

**LOW.** Latent: reached only by records outside the shipped data.

**Not repaired.** PASS A modifies no production code.

## F-92 — the whirl-flutter screen is called by nothing in the app although the Certification tab says it is computed, it measures its margin against cruise rather than the design envelope, and its verdict mislabels cruise below the boundary as at or above it — LOW — VERIFIED

`src/engine/whirlflutter.js`, the one registered relation, STAB-173 at l.122. **The arithmetic
and the citation hold, measured.** The margin ratio was recomputed independently for 3,519 cases,
with 0 disagreements. Every number the module quotes from Acree, Peyran & Johnson (AHS 55th Forum,
1999) was checked against the paper: 335 kt for the 23 % t/c XV-15 wing, 275 kt for the 15 % t/c
wing, 529 kt static divergence, and the quoted sentences, verbatim. Johnson & Silva's side-by-side
sentence was checked verbatim in the vendored copy.

**Four defects, measured.**

| defect | evidence |
|---|---|
| no production caller | `whirlFlutterCheck` is imported only by `validation/whirl-flutter.mjs`. Yet `src/tabs/CertificationTab.jsx` tells the user "Whirl flutter and wing modes are computed separately". No tab, panel or report shows a whirl-flutter result |
| the margin is against cruise | 14 CFR 23.2245(a) requires freedom from flutter "at all speeds within and sufficiently beyond the structural design envelope". A ratio to CRUISE speed overstates the margin by the dive-to-cruise ratio |
| the verdict mislabels the band below the boundary | from 211.54 to 274.99 kt of cruise (margin ratio from 1.30 down to 1.00, cruise BELOW the 275 kt boundary), the verdict reads "cruise is AT OR ABOVE the reference boundary" |
| the thin-wing warning never reaches the verdict | a wing thinner than t/c 0.15 sets `thinnerThanReference`. The verdict ignores it: t/c 0.08 at 60 m/s reads "cruise sits far below the reference boundary", against a boundary the module itself calls "at least this bad" |

**Not carried into the result.** Acree's boundaries are true airspeeds at sea-level standard
conditions, 457 rpm and limited-power trim. None of these conditions is reported.

**LOW.** No production path reaches the function. Its only consumer is a validation harness,
whose six shipped layouts give margins of 1.58 to 2.81, all outside the mislabelled band. The
consequence in the app is the Certification tab's claim, which leads a reader to believe that
whirl flutter is assessed somewhere.

**Not repaired.** PASS A modifies no production code.

## F-93 — the hover damping derivatives hold the induced velocity fixed, so heave, roll and pitch damping are 2.0 to 3.4 times what blade-element theory gives at the same rotor, and the harness checks the formula against itself — MEDIUM — VERIFIED

`src/engine/hoverdynamics.js`, l.81 and l.90-92 (STAB-164, 165, 166). **What holds.** The
module's arithmetic reproduces independently on all six shipped layouts. Its geometry is right:
roll and pitch arms are taken about the CG, and the rotor stations and the CG share the nose
datum. The quotations from Malpica, Suh & Silva (VFS Forum 80, 2024) were checked against the
paper and are accurate.

**The defect.** All three damping derivatives rest on one per-rotor thrust slope, dT/dw = T/v_i.
The header derives it from T = 2ρA v_i (v_i + w), differentiated with **v_i held fixed** while
the climb rate w changes. At fixed blade pitch and fixed rotor speed the induced velocity is not
fixed. Blade-element theory combined with momentum theory gives the quasi-steady slope as

  dT/dw = (T / v_i) · aσ / (16 λ_i + aσ),  λ_i = v_i / ΩR

This was derived independently and confirmed numerically to three decimals, both by
uniform-inflow and by 400-annulus blade-element integration. Measured at each layout's own
solidity and tip speed from the sizing result (a = 0.9 · 2π):

| layout | σ | λ_i | factor | code τ_heave / τ_roll | corrected | code steady roll rate | corrected |
|---|---|---|---|---|---|---|---|
| liftcruise | 0.262 | 0.089 | 0.510 | 1.61 / 1.20 s | 3.16 / 2.36 s | 90.1 °/s | 176.6 °/s |
| hybrid | 0.253 | 0.096 | 0.482 | 1.64 / 0.56 s | 3.41 / 1.15 s | 61.3 °/s | 127.1 °/s |
| hybridPusher | 0.263 | 0.095 | 0.494 | 1.63 / 0.60 s | 3.29 / 1.22 s | 57.0 °/s | 115.4 °/s |
| tiltrotor | 0.240 | 0.100 | 0.459 | 1.70 / 0.65 s | 3.71 / 1.41 s | 63.5 °/s | 138.2 °/s |
| multicopter | 0.055 | 0.046 | 0.299 | 0.78 / 0.16 s | 2.61 / 0.54 s | 17.1 °/s | 57.2 °/s |
| sideBySide | 0.058 | 0.050 | 0.294 | 0.85 / 0.18 s | 2.87 / 0.60 s | 41.8 °/s | 142.0 °/s |

The code overstates |Z_w|, |L_p| and |M_q| by **1.96× to 3.40×**. It understates every time
constant and every steady-state rate by the same factor. The factor's sensitivity to the lift
slope is small: 0.333 to 0.386 for a from 5.0 to 2π. **The quasi-steady slope is the correct
comparison** for what the module reports. Malpica et al. admit the reduced model only "for the
theoretical estimation of the steady state responses". They obtain their derivatives from a
reduced-order equivalent of their full flapping and dynamic-inflow model, not from momentum
theory. The header's "classical result" is therefore the module's own and is not in the primary
it cites.

**The check that cannot catch it.** `validation/hover-dynamics.mjs` check 4 asserts that heave
damping "falls as 1/sqrt(disk loading), as Zw = -g/vi requires". It tests the formula against
itself, and would pass with any constant factor in the slope.

**Reach.** No production code reaches the module. Within `src`, `hoverqualities.js` is imported only by
`handlingcompare.js`, and nothing in `src` imports that. Only validation harnesses call either, and
`StabilityTab.jsx` says so itself. The numbers are published in `VALIDATION.md`. **MEDIUM**: a physical error of 2 to
3.4× in the model, localized to a module the app does not yet show. Wiring it into the pipeline,
which `StabilityTab.jsx` names as the fix, would carry the error to the user unchanged.

**Not repaired.** PASS A modifies no production code.

## F-94 — hover qualities recomputes the disk loading without the hover download the engine applies, and hands the dynamics sea-level density whatever the hover condition — LOW — VERIFIED

`src/engine/hoverqualities.js`, l.70 (STAB-171) and l.75. The module re-derives two quantities the
sizing result already carries, and differs from both. Measured on the six shipped layouts, at the
default condition and at a 1,500 m field with ISA+20:

| quantity | module | engine | difference |
|---|---|---|---|
| disk loading | MTOW · g / disc area | hover thrust W / (1 − kDL) over the same area (`DL_hover_Nm2`) | lower by (1 − kDL): tiltrotor 0.853, hybrid 0.927, hybridPusher 0.951; equal where kDL = 0 |
| density | 1.225 kg/m³, a literal | `rhoHov`: 1.22321 at the default hover, 0.98563 hot-and-high | 24.3 % high hot-and-high |

The disk loading and density feed v_i = sqrt(DL / 2ρ) in `hoverdynamics.js`. On the tiltrotor
hot-and-high, v_i comes out about 17 % low, and every damping derivative of F-93 inherits that
error. The arithmetic itself is right: the geometry's rotor count and diameter match the sizing
result on all twelve cases.

**LOW.** The module is reached by no production code (F-93). The error is smaller than F-93's
and in the same direction on the damping.

**Not repaired.** PASS A modifies no production code.

## F-95 — the autorotative index is right against its primary, but grades multirotors against a single-rotor helicopter population, accepts a negative tip speed and a non-integer rotor count, and the harness narrative miscounts its own table — LOW — VERIFIED

`src/engine/autorotation.js`, STAB-101, 105 and 109. **The index holds, measured against the
primary.** Scaramuzzino et al. (ERF 2019) use the same thin-rod inertia, I_R = N_b m_b R²/3, and
tabulate 32 Bo-105 variants at AI 5 to 40, varying chord, radius, rotor speed and weight one at a
time. With a single constant anchored (blade mass per unit chord-radius) the module reproduces
**all 32 rows within 0.60 %**. An independent all-imperial recomputation (slug, ft, lbf) agrees
with the module's SI route on 576 of 576 cases. The quoted population sentences are verbatim in
the journal version (J. Aircraft 59(1), 2022).

**Defects.**

| item | measured |
|---|---|
| population applied out of class | the 5–40 ft³/lb band and its 15 and 30 lines are single-main-rotor helicopters; layouts of 2 to 12 rotors are graded against them with the same verdict words |
| negative tip speed | accepted; returns the index of the positive speed, because ω is squared |
| zero tip speed | returns a real index of 0, graded "BELOW every helicopter in the published population" |
| rotor count | 0, negative or NaN becomes 1 silently; 2.6 becomes 3 (index 196.79 against 21.87) |
| harness narrative | `validation/autorotation.mjs` prints, and `VALIDATION.md` publishes, "Three layouts sit below EVERY helicopter in the published population". The table directly above it shows one: tiltrotor 4.38. Hybrid 7.23 and hybridPusher 8.97 are inside the 5–40 band |
| harness Bo-105 | uses 2,400 kg where the paper's baseline is 2,200 kgf. It still lands inside the 15–30 lines it tests (18.37) |

**LOW.** The module is called only by its validation harness; no production path reaches it.

**Not repaired.** PASS A modifies no production code.

## F-96 — the flying-qualities levels match MIL-F-8785C exactly, but an aperiodically divergent phugoid can be graded Level 3 when it is worse, an unstable phugoid with no frequency is reported as the worst mode, and the "binding" label names one of several failing minima — LOW — VERIFIED

`src/engine/flyingqualities.js`, STAB-156, 158, 159 and 160. **The tables hold, measured against the
vendored standard.** The phugoid limits (3.2.1.2: ζ ≥ 0.04 / ζ ≥ 0 / T₂ ≥ 55 s), the Category B
Dutch-roll row of Table VI and the |φ/β| increments in its note were each read from MIL-F-8785C.
The module agrees with an oracle written from the standard's own words on 4,000 phugoid cases and
152,477 Dutch-roll grid points, with 0 disagreements.

**Defects.**

| item | measured |
|---|---|
| aperiodic phugoid | T₂ = ln 2 / (−ζω_n) is the envelope of an OSCILLATORY mode. For ζ < −1 the faster real root doubles sooner, and where that straddles 55 s the level flips the unsafe way: ζ −1.2 at 0.01 rad/s is graded **Level 3** (T₂ 57.8 s) and doubles in 37.2 s, worse than Level 3. Likewise ζ −1.05 at 0.0115 rad/s and ζ −2 at 0.006 rad/s |
| unstable phugoid, no ω_n | returns level null with no reason. `flyingQualities` then reports it as the worst mode, `worseThanLevel3: true`, where the truth is unknown |
| binding label | names the first failing minimum in a fixed order. 515 of 3,147 non-Level-1 grid points fail more than one |
| infinite ω | a Dutch roll at ω = Infinity is graded Level 1 |

**Not applied, and stated by the module.** The |φ/β| increment to the ζω minimum, so a mode where
ω²|φ/β| > 20 can be graded above its level. **Not applied, and not stated:** the 0.7 cap on
required ζ for Class III, which is conservative.

**Not examined here:** whether `wingmodes.js` can produce ζ < −1. That belongs to AERO.

**LOW.** Only validation harnesses call the module.

**Not repaired.** PASS A modifies no production code.

## F-97 — the control-authority index reproduces Du et al.'s tables wherever the hover point is attainable, but reports a different value from the paper's Theorem 3 when it is not, fails OPEN on a non-finite torque ratio, and the two production callers use different densities — LOW — VERIFIED

`src/engine/controlauthority.js`, nine relations (STAB-126 to 137). **What holds, against the
primary.** With Du, Quan, Yang & Cai's Table I parameters, the module reproduces their Table II
exactly: PNPNPN, ACAI 1.4861 intact and 0 on every single failure. It reproduces Table III on 5 of
7 rows. Every controllability verdict matches. An independent implementation of the paper's
eq. (14) agrees on all 68 cases where hover is attainable. Other relations checked:

- The torque-to-thrust ratio was recomputed from its three definitions.
- The spin-arrangement enumeration equals C(m−1, m/2−1) for every even m from 4 to 14.
- The T/W bisection's predicate was scanned and found monotone on five rings.

**Defects.**

| item | measured |
|---|---|
| value when hover is NOT attainable | Theorem 3 defines ACAI = sign(min d_j) · min\|d_j\|. The module keeps min d_j. They differ on 58 of 91 such cases, and on the paper's own Table III: PPNNPN with rotor 5 or 6 failed is printed as **0**, Theorem 3 gives 0, the module gives **−0.2133**. `engine.js` prints this value in a user-facing check: "worst ACAI −7302.4" (liftcruise), −1682, −1609.8, −7142.9. The verdict (sign) agrees with Theorem 3 on all 159 cases |
| fails open | k_mu NaN, undefined or Infinity, or one rotor with a NaN radius, returns `acai: null, controllable: true`. `engine.js` skips a non-finite ACAI. `RiskPanel.jsx` and `Drone3D.jsx` read `controllable` directly. `torqueToThrustRatio` produces such a k_mu from a density of 0 (Infinity), −1 or NaN (NaN), which its guard does not check |
| two densities | `engine.js` passes the hover density. `configuration.js`, which sizes the controllable-OEI T/W, passes none and gets 1.225. At 1,500 m ISA+20 their k_mu differ by 11.5 % |
| inputs outside the model | a figure of merit above 1 is accepted. η outside [0, 1] is accepted (η −1 reverses a rotor's thrust; η 1.5 is taken) |

**Observed in a consumer, carried as a lead for SIZING and not adjudicated here.** `engine.js`
l.2711 reads `r_.limiting`, but `acai()` returns `limitingAxis`. The engine's
`oeiControllability.limitingAxis` is therefore null on every shipped layout, and the check's
"limited in …" clause never prints.

**LOW.** On every shipped path the controllability verdict agrees with the source, and no shipped
path supplies a non-finite k_mu. The divergence from the cited definition is in the magnitude of
a negative index, which is displayed.

**Not repaired.** PASS A modifies no production code.

## F-98 — the flight-controls default reproduces its calibration exactly but on a basis that keeps the battery packaging the calibration removed, and the AFDD comparator that justified it keeps the one rotary-wing term NDARC's fixed-pitch rule removes — LOW — VERIFIED

`src/engine/flightcontrols.js`, STAB-140 to 155. The register files this module under STAB. Its
subject is the flight-controls group MASS.

**What holds.** Every AFDD82 coefficient and exponent was recomputed from NDARC TP-20250010468
§29-8 (vendored) over 3,240 evaluations, with 0 difference. The default fraction model's
calibration reproduces from NASA/TM-20210017971 Table 12 (vendored): flight controls over
(DGW − fuel-system weight) are 2.397, 2.461, 2.432, 2.710, 2.576 and 2.529 %, mean 2.518 %. At
convergence the group equals 0.025 (MTOW − W_bat) exactly on all six shipped layouts.

**Defects.**

| item | measured |
|---|---|
| basis | the calibration subtracted NASA's whole fuel-system line, battery plus packaging (Quad-E: 2,040 lb against 1,570 lb of battery). The engine subtracts only `WbatPrev`, so pack systems stay in the basis: +3.4 to +4.0 % flight controls (liftcruise 59.92 against 57.88 kg) |
| the comparator's rotary-wing term | NDARC: "the parametric method assumes the rotor flight controls are boosted", and per rotor a fixed-pitch rotor carries "no control weight". The module zeroes the boost and boosted terms for rpm rotors but keeps the non-boosted term. Its `afdd` result for an rpm aircraft is that term alone: 497.2 lb (Quad-E, published 108) and 1,428 lb (L+C-E, published 152). The header's "AFDD is the wrong reference class, by 4-5x" rests on it |
| fixed wing | only NDARC's stabilizer-only form, which NDARC reserves for helicopters, is coded. Full controls (0.91 W^0.6, 168 lb at 6,000 lb) are absent, and `weights.js` passes `sHt_m2: 0`, so the term is 0 on every layout |
| group definition | the `afdd` total omits NDARC's cockpit controls and AFCS |
| inputs | a negative fraction is accepted (−100 kg); nTilting above nRotors gives a 150 % tilting share; any model string other than exactly `"afdd"` silently selects the fraction model |

**LOW.** The production default is the fraction model, and its basis error is about 2 kg of
MTOW. The comparator is not the default and has no UI control.

**Not repaired.** PASS A modifies no production code.

## F-99 — the constraint diagram's hover ceiling counts the download twice inside the module, and the tab feeding it reads a field the result does not have, so the line the module calls normally binding is drawn up to 17 % optimistic on every layout with a download — MEDIUM — VERIFIED

`src/engine/constraints.js`, STAB-120 and 121, as called by `src/tabs/ConstraintDiagramTab.jsx`.
The cruise, climb and turn power loadings recompute exactly (72 cases), and the hover density
equals the engine's.

**The module's formula.** With T = W/(1 − k) on a fixed disc, momentum theory gives
P/W = (1/FM) √(DL_W / 2ρ) / (1 − k)^1.5. l.117 first converts the disk loading to thrust basis,
DL/(1 − k). l.118 then applies (1 − k)^1.5 as well, giving (1 − k)^−2:

- ×1.0827 at k = 0.147 on a weight-based input;
- ×1.1723 on a thrust-based input.

The download is counted twice.

**What the tab does to it.** `ConstraintDiagramTab.jsx` passes the engine's hover disk loading,
which is already thrust-based, and `downloadFrac: SR.downloadFrac`. The sizing result has no
such field (it is `downloadFraction`), so k arrives as 0 and the thrust factor 1/(1 − k) is lost
altogether. Measured against the engine's own hover power:

| layout | k | hover W/P drawn ÷ engine's |
|---|---|---|
| tiltrotor | 0.147 | **1.1722** |
| hybrid | 0.0735 | 1.0793 |
| hybridPusher | 0.049 | 1.0515 |
| sideBySide | 0 | 1.0193 (the engine's twin-rotor factor is absent) |
| liftcruise, multicopter | 0 | 1.0000 |

The drawn ceiling is too HIGH in W/P, meaning a smaller powerplant than the engine requires,
which is non-conservative. The module calls this the line that is "normally the binding one for
an eVTOL", and it sets the reported design point where it binds. The header's claim that it is
"exactly as the sizing loop computes it, so the diagram and the loop cannot disagree" is false.
(1 − k)·FM / √(DL_T / 2ρ) reproduces the engine to four decimals on five layouts.

**Smaller items.**

- The climb gradient is atan(RoC/V) where the definition gives arcsin: the climb term is 0.29 to
  1.40 % short of the stated rate.
- The wing limit uses cruise-altitude density for a transition that happens near the vertiport:
  10.2 % lower than at sea level. The module itself flags that limit as a two-aircraft fit.
- The design point is read at the nearest grid point: 1,389.8 for 1,401.5 N/m².
- An infinite P/W (η or AR of 0) is returned as a power loading of 0.

**MEDIUM.** A production tab displays a non-conservative design point, up to 17 %. The sizing
loop itself is unaffected.

**Not repaired.** PASS A modifies no production code.

## F-100 — the drone simulation's allocator agrees with ACAI on hover, but on an over-actuated airframe it scales down moment demands ACAI says are attainable, and counts them as allocation failures — LOW — VERIFIED

`src/classes/drone/dynamics.js`, `allocateDegraded` (STAB-019, STAB-021). The mixer comment says the
simulation and ACAI use "the SAME matrix … so the two analyses cannot silently disagree about what
the airframe can do".

**On hover they agree.** On Du et al.'s 14 hexacopter cases (both arrangements, intact and every
single failure) the allocator saturates exactly where ACAI is negative (PPNNPN, rotor 5 or 6
failed) and nowhere else. The moment-scale bisection is sound: the least-norm thrusts are affine in
the scale.

**Off hover they do not.** The allocator tests one allocation, the least-norm f = B(BᵀB)⁻¹u, and
not the set of allocations. Wrenches inside the ACAI ball are attainable by definition. Sampling
4,000 random directions at 0.95 of the ACAI radius:

| airframe | ACAI | scaled or dropped | worst moment scale |
|---|---|---|---|
| hexacopter PNPNPN | 1.4861 | 18.1 % | 0.858 |
| hexacopter PPNNPN | 1.1295 | 17.3 % | 0.705 |
| PPNNPN, rotor 2 failed | 0.451 | 6.3 % | 0.770 |
| octocopter | 1.4968 | 23.1 % | 0.853 |
| octocopter, rotor 1 failed | 1.0461 | 21.1 % | 0.598 |
| quadrotor (exactly actuated) | 0.7623 | 0 % | 1.000 |

`simulate` (l.823-828) counts each such case in `allocationFailed`, and can set
`fullRankButUnattainable`, on demands the airframe can meet.

**Also:** a NaN in the wrench is returned as NaN thrusts marked nominal and undegraded.

**LOW.** The error is pessimistic about authority. It is reached by the drone flight simulation,
and the controllability verdict ACAI reports is unaffected.

**Not repaired.** PASS A modifies no production code.

## F-101 — the drone simulation's body drag is applied component by component instead of along the velocity as its cited source writes it, which turns part of the drag into lift and makes forward-flight thrust and energy optimistic — MEDIUM — VERIFIED

`src/classes/drone/dynamics.js` l.611-612 (STAB-057).

**What holds.** The rest of the rigid-body equations are right, measured:

- A 10 s torque-free tumble conserves world angular momentum and rotational kinetic energy to
  1e-13.
- Hover is in exact equilibrium.
- The moments equal Du et al.'s effectiveness matrix to 7e-16 N·m.

**The defect.** Bauersfeld & Scaramuzza (RA-L 2022, Eq. 3), which the module quotes, write
f_body = −0.5 ρ c_body |A·v_rel| v_rel: a drag along the relative velocity, magnitude ∝ |v|². The
code applies −0.5 ρ c A |v_i| v_i to each body axis separately. That equals Eq. (3) only along a
body axis. Measured with the production `derivative`, a test quadrotor, c_body 1, A 0.03 m²:

| condition | drag ÷ Eq. (3) | angle off −v |
|---|---|---|
| along body x | 1.0000 | 0° |
| 45° in the horizontal plane | 0.7071 | 0° |
| 3-D diagonal | 0.5774 | 0° |
| forward, nose down 20° | 0.8907 | 12.45° |
| forward, nose down 30° | 0.7906 | 11.57° |

In forward flight the misdirected component acts as LIFT. Trimmed level flight solved with the
production equations, compared with the same trim under Eq. (3):

| speed | thrust ÷ Eq. (3) trim | ideal power (T^1.5) |
|---|---|---|
| 5 m/s | 0.9991 | 0.9986 |
| 10 m/s | 0.9866 | 0.9800 |
| 15 m/s | 0.9477 | 0.9225 |
| 20 m/s | 0.8909 | 0.8409 |

`simulate` integrates pack energy from those thrusts when energy is enabled (l.849-868), so
forward-flight energy is optimistic, by about 16 % in ideal power at 20 m/s on this airframe.

**MEDIUM.** The error is non-conservative and speed-dependent, and it is localized to the drone
flight simulation.

**Not repaired.** PASS A modifies no production code.

## F-102 — the drone simulation runs ArduPilot's published rate gains as if their output were newton-metres, which makes its rate loop 2.5 to over 100 times softer than ArduPilot's on the same airframe, and its angle limiter is not ArduPilot's sqrt controller — MEDIUM — VERIFIED

`src/classes/drone/dynamics.js`, `controllerStep` (STAB-053, STAB-056).

**What holds.** The gains are transcribed exactly from the ArduPilot release file the module names.
`Tools/Frame_params/Hexsoon-edu450.param` was fetched today, and its md5 equals the module's
record. The acceleration limit is in the right units. The lean-for-acceleration law is the exact
inverse of the tilt law, to 1e-14.

**The defect.** The rate PID's output is used as the MOMENT part of the wrench, in N·m. In ArduPilot
the same gains have units of s/rad and produce a NORMALISED mixer command:
`AC_AttitudeControl_Multi` passes `update_all(…)` to `_motors.set_roll()`, and
`AP_MotorsMatrix::normalise_rpy_factors` scales roll factors to ±0.5. One unit of command is
therefore about 0.5·f_max·Σ|y_i| N·m, and the module's loop is that factor softer than
ArduPilot's:

| airframe (quad X) | N·m per unit command | module softer by |
|---|---|---|
| 450-class, 0.225 m arm, 8 N motors | 2.55 | 2.5× |
| 1 m class, 30 N motors | 21.2 | 21× |
| 1.5 m heavy lift, 120 N motors | 127 | 127× |

The module says it answers "the SHAPE of a response — does the aircraft hold attitude … how fast
does it settle". That is the quantity this changes. Its "the controller is a published one" does
not hold in effect.

**The angle limiter.** ArduPilot's `sqrt_controller` is linear up to a/P² and then follows
√(2a(|e| − a/2P²)). The module takes min(P·e, √(2a|e|)), linear up to 2a/P². With the published
P = 11 and 700 deg/s², the module asks up to 1.154× ArduPilot's rate demand at 0.20 rad, and
1.026× at 1 rad.

**MEDIUM.** The defect is localized to the drone flight simulation and changes the response
character it exists to show.

**Not repaired.** PASS A modifies no production code.

## F-103 — the rotor hub-drag coefficient is NDARC's own "typical hub" value, not the calibration its comment describes, one value serves every layout where NASA's reference vehicles use two, and the term has large leverage on MTOW — LOW — VERIFIED

`src/engine/drag.js`, AERO-168 and AERO-170, reached by the sizing loop (`engine.js` l.903 and
l.1758). **The arithmetic and the forms hold.** Hub and stopped-blade drag areas recompute on all
six shipped layouts. Both forms are NDARC's as stated: hub drag on rotor disc area, and stopped-blade
drag on the geometric blade area σA (NDARC Theory TP-20250010468, vendored).

**What does not hold.**

| item | evidence |
|---|---|
| provenance of CD_hub = 0.004 | the comment says NDARC "leaves CD_hub as a user input" and that 0.004 was "calibrated to a published share", 25–30 % of parasite drag. NDARC states it: "CD = 0.004 for typical hubs, CD = 0.0024 for current low-drag hubs, and CD = 0.0015 for faired hubs". The measured hub share is 10.7 to 18.4 % on the three winged layouts with exposed hubs, 0 on the tiltrotor, and 77.6 and 86.8 % on the wingless ones. No shipped layout shows the stated share |
| one value for every layout | NASA/TM-20210017971 Table 12 prints "Rotor hubs cruise drag" for eight reference vehicles. On disc area they back out to **0.0050** (lift+cruise, tiltwing) and **0.0015** (quadrotors, side-by-sides, single main rotor). The code's lift+cruise hub drag is 0.80 of NASA's class value. Its multicopter and side-by-side hub drag is **2.7 times** NASA's |
| leverage | NDARC's weight-based typical-hub scaling equals the disc-area one only near 3.45 lb/ft². At the 12–13 lb/ft² of the lift+cruise, hybrid and hybrid-pusher it is 3.8 to 5.7 times larger, and re-sizing at it raises MTOW by 38.8 to 69.5 % (15.8 to 19.7 % at the low-drag scaling). At NASA's 0.0050 the lift+cruise grows 3.4 % |
| stopped-blade coefficient | 0.009 has no source, as the module says. It equals flat-plate friction on a clean aligned blade (0.0073 to 0.0113) |
| inputs | a negative solidity gives a negative drag area; a negative diameter is accepted; a NaN diameter gives a NaN total |

**Lead for SIZING, not adjudicated here.** On the multicopter and side-by-side, cutting hub drag
from 0.004 to 0.0015 changes the reported drag area from 0.914 to 0.418 m² and from 0.538 to
0.277 m², and changes MTOW and L/D by exactly zero. On wingless layouts the drag build-up does not
reach cruise performance.

**LOW.** For the lift+cruise class, the layouts where the term reaches MTOW, NASA's reference
models support the value used, within 20 %. The defects are the stated provenance, the missing
class distinction, and input handling.

**Not repaired.** PASS A modifies no production code.

## F-104 — the wing-position solver is sound on every case tried, but when its evaluation budget runs out it says the target margin is unattainable, and the design it falls back to is statically unstable — LOW — VERIFIED

`src/engine/wingPosition.js`, AERO-196 and AERO-197. This is the production default path:
`DEFAULT_PARAMS` ships `autoPositionWing: true`, target 0.15.

**The solver holds, measured against an independent root find.** On the UI default path, four
winged layouts and five target margins from 0.05 to 0.30, it converged on all 20 runs in 3 to 5
full sizings. Each run reached the single root located independently by scanning the un-wrapped
sizing at 119 stations and bisecting, within the 1e-3 tolerance every time. The secant form is
the textbook one, and its guards are in place: equal values, non-finite step, cycling, and two
independent ceilings.

**Defects, both latent at the default budget of 45 sizings.**

| item | measured |
|---|---|
| exhausted budget reported as physics | with `wingPosMaxEval: 1` the result says "target SM 15.0% exceeds the maximum attainable 14.…%". The "maximum" is the best of the two or three stations evaluated; the target is reached at station 0.343. The reason text cannot tell "ran out of evaluations" from "no such station" |
| the fallback design | when the solve does not converge the function returns the design at the base station 0.2589, "the design the caller actually asked for". On the default aircraft that design has a static margin of **−0.2667**. It is flagged `wingPosUnreachable`, but it is returned as a sized aircraft |
| quantised function | the sizing returns SM to 4 decimals, so the solver's tolerance cannot be tightened below about 5e-5 |
| inputs | a NaN target costs 16 sizings and returns the base design; a negative target is accepted |

**Observation, not a defect.** The header says static margin "peaks, then falls" with station.
On these four layouts it rises monotonically across the whole range (about −1.2 to +1.5).

**LOW.** No default-path run reaches either defect.

**Not repaired.** PASS A modifies no production code.

## F-105 — the airfoil library's "design lift coefficient" is 0.15 to 0.43 too high on 15 of 16 checkable sections, which changes the section the sizing selects on two of four winged layouts, and its Reynolds interpolation ignores the library's own test Reynolds numbers — LOW — VERIFIED

`src/engine/airfoils.js`, AERO-160 to 164, reached by the sizing loop (`engine.js` l.1701). The
interpolation and the scoring arithmetic recompute exactly (168 cases; 24 scores to 1e-16).

**The reference data the relations read**, checked against the vendored corpus
(`datasets/airfoils`: NACA TR-586 Table I, NACA TR-824 charts, NASA TN D-7428, TM X-72697):

| item | measured |
|---|---|
| `CLd`, "the centre of the laminar bucket" | 0.15 to 0.43 above the primary design or optimum c_l on 15 of 16 sections, mean +0.26. The 6-series designation fixes it: 63-215 is 0.2 and the library has 0.60; the −415 sections are 0.4 and the library has 0.58 to 0.62. TR-586 gives 0.14 / 0.32 / 0.22 for the 2412 / 4412 / 4415, where the library has 0.55 / 0.70 / 0.65 |
| effect on selection | with the primary values substituted in memory, the selected section changes on 2 of 4 winged layouts: lift+cruise 65(2)-415 → 65-415, tiltrotor 64A-212 → 65-415. Stall speed moves +0.40 and −1.02 m/s. **MTOW does not move** |
| `CLmax` | 0.02 to 0.36 below the primary on the ten sections checked, e.g. NACA 0012 1.30 against 1.66. The Reynolds bases differ, and the direction is conservative for stall |
| `CDmin_hi` | equal to the low-turbulence-tunnel reading on one section and 7 to 14 % below it on three |
| `CDmin_lo`, "Re ≈ 1e6" | sourced to Abbott & von Doenhoff, whose data span 3 to 9 million. No primary found: UNVERIFIED |
| Reynolds anchor | the "hi" value is placed at 7e6 for every section; the library's own `ReM` field puts it at 2.5 to 9 million. The FX 71-L-150 at its own test Reynolds number comes out 31.4 % above its tabulated value |
| invalid inputs | a NaN Reynolds number drops the drag criterion silently; a missing wing t/c makes every score NaN and returns the first section in the table |

**LOW.** The selection reaches stall speed, pitching moment and the displayed polar, and not the
drag build-up or MTOW.

**Not repaired.** PASS A modifies no production code.

## F-106 — the aero-propulsive module's thrust-speed derivative is evaluated with hover thrust at cruise speed, about 8 to 11 times too large as its only caller uses it, and its constant-power form is not the momentum-theory one — LOW — VERIFIED

`src/engine/aeropropulsive.js`, AERO-150 to 158. The module is reached only by
`validation/wing-modes.mjs`, and `phugoidWithThrust` has no caller at all. It says of itself that
it is "NOT a model of aero-propulsive coupling".

**What holds.** The slipstream dynamic-pressure ratio is the exact far-wake actuator-disc value
(to 9e-16). The phugoid correction reproduces the textbook constant-power damping
3 / (2√2 · L/D) exactly.

**Defects.**

| item | measured |
|---|---|
| cruise derivative from hover thrust | `aeroPropulsive` forms dT/dV = −T/(V + v_i) with `thrustTotal` ("total installed hover thrust") and `viHover`. Its caller passes the weight. The result is 7.98 to 10.73 times the cruise value: −357 N·s/m against −39 on a 25 kN, L/D 10, 60 m/s case |
| the constant-power form | momentum theory at constant ideal shaft power gives dT/dV = −T/(V + 3v), derived and confirmed numerically. The coded −T/(V + v_i) is 2.4 to 21 % larger in magnitude with the cruise induced velocity |
| slipstream is the far-wake value | a wing just behind a tractor propeller sees between the disc and far-wake values (1.053 against 1.108) in a contracted jet. The lift factor on top of it is an upper bound, which the module labels [LAY] |
| thrust loss on winged layouts | the 11 % rotor-airframe loss, measured on a small quadrotor in hover, is applied to every layout, wing-borne ones included |
| inputs | a negative density reports a lift "augmentation" of 0.951; a speed of 1e-6 m/s gives 1.6e14; a NaN thrust returns the classical damping labelled "with thrust" |

**LOW.** No production path reaches the module. The production phugoid correction lives in
`wingmodes.js` and is audited in its own block.

**Not repaired.** PASS A modifies no production code.

## F-107 — the drag-divergence check applies the Korn equation with the quarter-chord sweep where both of its sources use the half-chord sweep, which overstates the Mach margin by about 0.01 — LOW — VERIFIED

`src/classes/aircraft/airfoils.js`, AERO-001 to 009, shown in the aircraft studio's airfoil tab.

**The equation is right.** Mason's Eq. (7-4) was read from the rendered page, because the text
extraction loses the exponents: M_dd = κ_A/cos Λ − (t/c)/cos² Λ − c_l/(10 cos³ Λ). The module
reproduces it on 240 cases to 1e-16, and its inverse to 2e-16. The technology factors (0.87, 0.95)
and the two aircraft calibrations (0.89, 0.955) are Mason's.

**The sweep is not the sources' sweep.** The header says "with L the quarter-chord sweep". Mason
(printed p. 7-19) and Grasmeyer (sec. 3.3.3) both write that "the local t/c, c_l, and
**half-chord** sweep angle are specified for a number of spanwise strips". Measured on the
shipped defaults:

| type | sweep c/4 → c/2 | M_dd as computed → half-chord | margin in hand |
|---|---|---|---|
| transport | 25.03° → 21.89° | 0.7993 → 0.7877 | 0.0143 → **0.0027** |
| business jet | 16° → 13.00° | 0.7688 → 0.7615 | −0.0112 → −0.0185 |
| turboprop | 0° → −1.51° | 0.6729 → 0.6730 | not relevant at Mach 0.41 |

The difference, 0.007 to 0.012 Mach, is about half the 0.025 margin the module asks for. The
verdict level (conventional / supercritical / beyond) does not change on any default.

**Also recorded.**

- The candidate sections are ranked for fit on the streamwise thickness and lift, where the same
  sweep theory refers both to the normal section: 0.145 and 0.70 against 0.1317 and 0.575 on the
  transport.
- The 0.025 margin rests on one aircraft, as the module states.
- The linear map from the FLOPS technology scalar to A is the module's own.
- A sweep of 90° returns −2e47.

**LOW.** An advisory tab; no sizing quantity reads it.

**Not repaired.** PASS A modifies no production code.

## F-108 — the Oswald-efficiency fit is transcribed exactly, but its domain flag passes a 90° sweep and a negative engine count, the wing-area function returns 2.5e10 m² as a sized wing, and the tiltrotor's wing nacelles are not counted — LOW — VERIFIED

`src/engine/wing.js`, AERO-185 to 192, reached by the sizing loop.

**What holds.** Howe's Eq. 6.14a was read from the rendered page of Scholz Eq. 13.26 (vendored).
The module reproduces it on 2,880 cases with a difference of 0. The engine's e = 0.8278 on all
four winged layouts equals the independent value. The two wing-area constraints and the derived
cruise lift coefficient recompute on every layout, and the comment's Joby and Archer wing-loading
anchors reproduce (1,524 and 1,370 N/m²).

**Defects.**

| item | measured |
|---|---|
| domain flag | sweep 90° returns e = 1.9e-32 with `inDomain: true`. An engine count of −1 or −5 returns 0.855 or 0.985, also in domain. Outside A > 5 or M < 0.95 a number is still returned (0.844 at A = 4), flagged false |
| wing area on a degenerate input | zero dynamic pressure, or a zero or negative wing loading, is floored at 1e-6 and returns **2.5e10 m²** with an ordinary driver label. A NaN dynamic pressure returns NaN labelled "design wing loading". A zero legacy design CL returns Infinity |
| engines on the wing | N_e = 0 on every layout, the tiltrotor's wing-mounted nacelles included. At N_e = 2 the fit gives 0.778 against 0.828 (−6.0 %). The module's argument, that booms are not pods, does not address nacelles, and no held source settles it |
| applicability | Howe's fit is for conventional aeroplanes. It is applied to wings carrying booms and stopped rotors |
| the cruise-CL ceiling | 0.90, [LAY], governs on none of the four shipped layouts |

**LOW.** No shipped path reaches the degenerate inputs. The engine-count question is an
unresolved applicability note, not a demonstrated error.

**Not repaired.** PASS A modifies no production code.

## F-109 — the mission editor never applies its off-design cruise polar at default settings, so a leg flown faster than design is charged 14 to 49 % too little energy, and the engine's own design mission can be reported infeasible by rounding — MEDIUM — VERIFIED

`src/engine/profile.js`, AERO-173 to 184, as called by the mission editor (`src/App.jsx` l.685-701).

**The module's arithmetic holds.** The polar reproduces the loop's cruise power at the design
speed within 0.01 % on four layouts, when it is given the result's span efficiency. Every segment
energy, the headwind treatment and the run-dry point recompute. The default profile reproduces the
loop's total energy.

**Defect 1 — the polar is fed a field that no longer exists.** `App.jsx` passes
`eOsw: params.eOsw`. Since span efficiency became a computed result, `DEFAULT_PARAMS.eOsw` is
undefined, so `cruisePowerAt` returns null and the leg keeps the design cruise power, applied for
the time the new speed implies. The row's basis text says "SPEED IGNORED, no polar data supplied".
The validation harness passes its own `eOsw` and so does not see this. A 50 km leg, application
call against the polar with the result's e:

| layout | 0.7 V | 0.8 V | 0.9 V | 1.1 V | 1.2 V | 1.3 V |
|---|---|---|---|---|---|---|
| lift+cruise | +28.5 % | +23.8 % | +13.4 % | −13.9 % | −27.0 % | −38.5 % |
| hybrid | +55.0 % | +39.4 % | +19.7 % | −17.6 % | −32.4 % | −44.4 % |
| hybrid pusher | +48.6 % | +35.8 % | +18.3 % | −16.9 % | −31.3 % | −43.3 % |
| tiltrotor | +93.4 % | +58.6 % | +26.5 % | −20.8 % | −36.9 % | −49.2 % |

Above the design speed the error is non-conservative.

**Defect 2 — no tolerance on feasibility.** The design mission uses exactly the usable pack. Flown
through `evaluateProfile` on the default lift+cruise it exceeds the pack by 2.8e-14 kWh. It is
reported infeasible, "running dry" in the reserve at fraction 0.9999999999999997.

**Defect 3 — no stall check.** At 0.6 of the stall speed (C_L 4.0 to 4.3 against a maximum of about
1.5) the polar returns 137 to 170 kW as a cruise power.

**Also recorded.** Ground segments use 10 % of HOVER power; NASA/TM-20210017971 Table 1 says 10 % of
MAXIMUM power. A timed leg with a headwind above the airspeed reports a negative ground speed.

**MEDIUM.** A production feature returns segment energies wrong by tens of per cent in either
direction. The sizing loop is unaffected.

**Not repaired.** PASS A modifies no production code.

## F-110 — the high-lift module evaluates the flap effectiveness at a different chord ratio from the equation it cites and from its own research validation, and returns the sum DATCOM says cannot be added as the wing's maximum lift — LOW — VERIFIED

`src/classes/transport/high-lift.js`, AERO-125 to 147, shown in the aircraft studio's high-lift
tab and, as the module says, not wired into sizing.

**What holds.**

- The thin-aerofoil flap effectiveness matches a numerical Glauert integral to 1e-12.
- DATCOM's K_Λ and slat equation reproduce DATCOM's own sample problems (0.7315 against 0.730,
  0.2522 against 0.252).
- The flapped-area ratio matches numerical integration.
- Olson's Eqs. (6), (7), (10) and (16) are transcribed in form.
- The DATCOM sentences the module quotes are in the vendored text.

The module also documents most of its own weaknesses, per call.

**Defects not already stated by the module.**

| item | evidence |
|---|---|
| α′_δ is not the cited one | Olson: α′_δ is found "by replacing the original flap chord with the extended flap chord, c′_f ≡ c_f + Δ_f c". The research's validation script uses (c_f + Δc)/c′. The module uses c_f/c′: 0.571 against 0.814 at its default, and a zero-lift increment of 2.414 against 3.389 |
| the validation claim belongs to another formula | the header says the research "validated it against measured two-dimensional data … with nothing tuned". That validation used the literal definition with the flaps' own chord extensions (0.27, 0.33). The module's tables give 0.392 and 0.834 for the same flaps. As shipped it is −1.0 % and +6.0 % from the measured 4.85 and 5.50. The literal definition on the same tables would be +14.9 % and +41.6 %. The agreement is real, but it is not the validation described |
| the bound is returned as the answer | `dCLmaxWing` and `clMaxWing` carry the leading-edge plus trailing-edge sum, which DATCOM says "cannot, in general, be added" |
| inputs | k_s = 1.5 gives a section maximum of −2.3; a slat span ratio of 2 is accepted; a sweep beyond 90° gives NaN; an outer flap station inboard of the inner gives a negative increment |

**Not verified here.** The digitised η_δ and chord-extension tables (Olson Figs. 3 and 4), and
DATCOM Section 2.2.2's to-centreline construction of the flapped area (0.865 against 0.695).

**LOW.** An advisory comparison; no sizing quantity reads it.

**Not repaired.** PASS A modifies no production code.

## F-111 — the wing-box analysis cites the TASOPT box and leaves out TASOPT's sweep relations, so on a swept wing the bending moment is low by cos Λ and the cover thickness by cos² Λ — 10 % and 22 % on the default transport — MEDIUM — VERIFIED

`src/classes/aircraft/wing-structure.js`, AERO-010 to 052, shown in the aircraft studio's Structure
tab. Nothing else reads its results.

**What holds, recomputed independently.**

- Root shear matches a 20,001-station integration of the Schrenk loading.
- Root moment is within 0.12 % of it (the 41-station discretisation).
- The cap, web, buckling, stress and box-mass arithmetic recompute at the root on all three types
  that carry a load factor.
- 14 CFR 25.343(a) and the +2.25 of (b)(1) are quoted correctly.

**The defect.** The header sources the box to "the TASOPT idealisation (TASOPT 2.00 theory,
A.190–A.202)". TASOPT (vendored) defines that box in the plane normal to the swept spar:
y⊥ = y/cos Λ (A.162), c⊥ = c cos Λ (A.163), S⊥ = S (A.188), **M⊥ = M/cos Λ** (A.189). The module
uses the sweep only to lengthen the mass integration. The moment that sizes the covers is the
unswept M, and the box width is half the streamwise chord.

| type | sweep | moment low by | cover thickness low by | box mass low by |
|---|---|---|---|---|
| transport | 25.03° | 10.4 % | 21.8 % | 10.4 % |
| business jet | 16° | 4.0 % | 8.2 % | 4.0 % |
| turboprop | 0° | 0 | 0 | 0 |

The direction is non-conservative. The module's caveat mentions only the missing bending-torsion
coupling.

**Also recorded.**

- The elastic plate-buckling formula is entered at 403.5 MPa for 2024-T3, above that alloy's
  269 MPa compression yield, with no plasticity correction.
- The stress couple arm is the full depth: 1.1 to 2.0 % low.
- The header says webs are checked at limit and ultimate; `allowWebL` is `fsu * 0.577 / 0.577`
  and is never read. It would not govern for any listed material.
- `lerp` is defined and never called.
- An MZFW above MTOW produces a governing "zero-fuel" case above MTOW.
- A zero thickness ratio returns NaN throughout; a 90° sweep returns a 4e19 kg box.
- The module itself reports the 35 to 48 % shortfall against the FLOPS wing group, and that the
  minimum gauge and three of four spar layouts are unsourced.

**MEDIUM.** A production tab reports a swept wing's structural sizing 10 to 22 % light. No mass or
sizing quantity is taken from it.

**Not repaired.** PASS A modifies no production code.

## F-112 — the eVTOL wing-box check "margin of safety ≥ 0" cannot fail, the skin torque is one cell's instead of the accumulated torque, and the inertia relief the header describes is not applied — LOW — VERIFIED

`src/engine/wingbox.js`, AERO-203 to 250. The result is reported, not used for mass, and two
feasibility checks read it (`engine.js` l.3030 and l.3038).

**What holds, recomputed independently on the four winged layouts.**

- Root shear is within 0.02 % of a 200,000-station Schrenk integration.
- Every root quantity recomputes: the four sandwich instability modes, the skin's usable
  fraction, the cap area, stress and strain, and the seven mass terms.
- The wing-group composition is NDARC's (§29-1).

**Defects.**

| item | measured |
|---|---|
| a check that cannot fail | the caps are sized so the root stress equals the allowable. The stress margin is therefore 0 by construction, and the strain margin a fixed +73.6 % (σ_allow / E = 0.00259 against 0.0045). Over 216 designs spanning MTOW 0.8–12 t, AR 5–14, W/S 600–3,000, n_z 2.5–6, the lowest margin is −3.3e-16 and **0 fail** "Structural margin of safety ≥ 0" |
| skin torque | the torque used at each station is that station's own cell, not the sum outboard: 1,132 against 26,339 N·m at the lift+cruise root, a factor of 23.3. The accumulated torque needs 0.30–0.33 mm of skin and the 0.8 mm minimum gauge governs, so no shipped number changes |
| inertia relief | the header and the `WoutboardKg` parameter describe relief from the wing's own mass and from boom rotors. None is applied, and `WoutboardKg` is read nowhere. Conservative |
| root moment | 2.96 % above the fine integration on all four layouts, from the staggered rectangle rule. Conservative |
| inputs | a NaN or negative MTOW returns a margin of 3.5e14; a wing area of 0 is floored to 0.5 m² and returns a 1,120 kg box |

The module says its mass is about 30 % below the AFDD93 wing group. Measured: −30.3 to −35.9 %.

**LOW.** The design output does not feed mass or MTOW, and the two loading errors are either
conservative or below the gauge floor. The consequence is a displayed check that reads "pass"
whatever the design.

**Not repaired.** PASS A modifies no production code.

## F-113 — the wing-borne modes read a tail arm the sizing result does not carry, so the tail volume and pitch damping are zero and the published short-period damping is 28–31 % low — LOW — VERIFIED

`src/engine/wingmodes.js`, AERO-257 to 294. No production caller: `handlingcompare.js` imports
`wingModes` and never calls it. The module is reached by three validation harnesses, and what
they print is published in `VALIDATION.md`.

**What holds.**

- The short-period formula, fed the Boeing 747 derivatives of NASA CR-2144 Table IX-4 (p. 230)
  read here from the page image, gives 1.031 / 0.445 and 1.353 / 0.571 (ω_n / ζ) against the
  1.04 / 0.446 and 1.37 / 0.575 of Table IX-5 (p. 231).
- Every derivative rebuilds from the sized result on the four winged layouts.
- With the tail arm supplied, the 2-DOF short period is within 1.2 % of the exact 4-state
  eigenvalue.

**Defect.** `wingModes` reads `SR.lh`. The sizing result has no `lh`; the only arm it returns
is `lv`. `Number(undefined) || 0` makes the arm 0 silently.

| layout | V_H as called | with the arm | ζ_sp as called | with the arm | published level | with the arm |
|---|---|---|---|---|---|---|
| lift+cruise | 0 | 0.450 | 0.326 | 0.424 | 1 | 1 |
| hybrid | 0 | 0.450 | 0.278 | 0.404 | **2** | 1 |
| hybrid pusher | 0 | 0.450 | 0.270 | 0.392 | **2** | 1 |
| tiltrotor | 0 | 0.450 | 0.277 | 0.391 | **2** | 1 |

"With the arm" uses `lv` as the stand-in, the one arm the result carries. `VALIDATION.md`
prints "worst shortPeriodDamping L2" for the hybrid and the tiltrotor and lists three layouts
as below 0.3; none of that is a property of the aircraft, by the module's own formula.

Two further reads miss in the same way and happen to be harmless: `SR.Tcruise` (the fallback
m·g / (L/D) runs) and `SR.viHover` (0 is used; a hover induced velocity would have been the
wrong quantity in cruise, and 0 is within 2 % of the momentum-theory result).

**Also measured.** The Lanchester phugoid damping is 1.2 to 3.1 times the exact 4-state
value; the module says "order of magnitude only", and the thrust-lapse increment is added on
top and drives the "stable" flag.

**LOW.** No design output and no UI path. The error is in a published validation figure and
is in the pessimistic direction.

**Traceability.** Classical static stability spans STAB and AERO; AERO-272, 273, 274 and 282
are audited here, where the Register places them.

**Not repaired.** PASS A modifies no production code.

## F-114 — the FLOPS drag build-up is a faithful port; its input conventions and polynomial domains are unguarded, and the two selectable drag methods disagree by 7 % and 24 % in cruise L/D — LOW — VERIFIED

`src/classes/transport/flops-aero.js`, AERO-058 to 121. Reached from `classes/transport/size.js`
only when the drag method is "flops" (the default is "equivalent-cf"); offered on the transport
and the bizjet.

**What holds.** The file was read against NASA Aviary's Python, vendored in the corpus, and the
EXPECTED values of Aviary's own unit tests were transcribed into the probe and fed to the
production functions.

| Aviary test | points | worst relative difference |
|---|---|---|
| skin-friction coefficient | 36 | 4.2e-7 |
| Reynolds number, wall temperature | 9, 9 | 2.5e-10, 1e-11 |
| design Mach and CL | 4 | equal to six decimals |
| compressibility drag, M 0.2–1.1 | 20 | 1.5e-5 |
| pressure drag, edge and inner | 12 | 2.9e-7 |
| skin-friction drag with laminar flow | 2 | 1.9e-7 |

An independent bisection solve of the wall-temperature and Kármán–Schoenherr pair gives the
module's coefficient to eight decimals, and the result is 1.7–2.2 % below Raymer's flat-plate
relation at flight Reynolds numbers.

**Defects, all of domain and convention.**

| item | measured |
|---|---|
| span-efficiency input | FLOPS adds E to 1 at 0.3 or less and multiplies above. On the UI's continuous 0–2 control, 0.30 → e 1.30 and 0.31 → e 0.31: cruise L/D 16.80 and 10.76. E = 0 and E = 1 are the same aircraft |
| form factors | the surface sextic turns over outside the UI range (1.84 at t/c 0.30, −56.0 at 0.50); a body of fineness exactly 0.5 lands there; the zero-diameter nacelle fallback returns 3.36; a negative fineness returns −25,880 |
| guards | Mach 0, a zero length or a zero pressure returns NaN; AR 0 NaN; wing area 0 Infinity |
| two methods | cruise L/D 16.92 (FLOPS) against 18.17 (equivalent c_f) on the transport, 12.42 against 16.30 on the bizjet. The FLOPS polar is validated on three transports; the bizjet runs it on an assumed airfoil technology |

**Provenance (Q10, recorded separately).** The header names Aviary's Python as the reference.
For forward sweep the module does NOT follow it: `induced_drag.py` divides degrees by
`scipy.constants.degree`, its expected test values reproduce only with that slip, and the module
converts to radians. The module is right and the harness records it; the header does not.
Forward sweep is not reachable from the UI.

**LOW.** Opt-in method, values within the UI ranges are finite and match the reference, and
the one discontinuity is labelled.

**Not repaired.** PASS A modifies no production code.

## F-115 — the drone mass closure closes, but a run that exhausts its iterations is labelled "diverged" and returns a mass that is not a solution with the mission marked met — LOW — VERIFIED

`src/classes/drone/sizing.js`, WEIGHT-102, 105, 106, 107, 108.

**What holds.** The closure was summed independently from the published component masses:
0.5 + 1.2 + 0.25 + 4 × (230 + 28 + 73) g + 1 × 1.449 kg = 4.723000 kg, the module's value. The
breakdown sums to the reported mass, payload enters once, and on 147 converged designs of a
192-design sweep the returned mass is a fixed point of its own map.

**Defect.** The loop has three exits and the last is mislabelled. If the iteration budget ends
before successive masses agree, the status is "diverged" — which the header defines as "mass
growing without bound" — and the last damped iterate is returned:

| options | status | mass | packs | breakdown sum | meetsMission |
|---|---|---|---|---|---|
| default | converged | 4.7230 | 1 | 4.7230 | true |
| damping 0 | diverged | 3.2740 | 1 | 4.7230 | true |
| maxIterations 1 | diverged | 3.9985 | 1 | 4.7230 | true |
| tolerance 0 | diverged | 4.7230 | 1 | 4.7230 | true |

At damping 0 the reported mass contains no battery, and the endurance and thrust-to-weight
checks are evaluated at that mass.

Also accepted without a report: a pack mass of 0 g (only null is refused) and a non-integer
rotor count.

**LOW.** The UI passes no solver options and accepts only "converged" statuses, so none of this
is reachable from a shipped screen. It is reachable from the exported function.

**Not repaired.** PASS A modifies no production code.

## F-116 — the eVTOL CG closes and is computed correctly, but the hover thrust-split check rests on rotor stations that are the same two fuselage fractions on every layout — LOW — VERIFIED

`src/engine/cg.js`, WEIGHT-231 to 244.

**What holds, on six layouts through the UI default path.**

- The seventeen build-up groups sum to Wempty within 0.1 kg, and Wempty + battery + payload
  equals MTOW within 0.01 kg.
- An independent Σ(m·x) / Σm from the group masses and stations equals the module's empty and
  total CG within 1 mm.
- The hover moment balance closes to 4e-16.

**Defect.** The lift-rotor stations default to 10 % and 80 % of fuselage length for every
configuration. The module says so and marks "CG inside rotor array" advisory: over 48 designs
(payload and battery stations 0.2–0.8 fL, payload 100–800 kg) the CG runs 0.348–0.620 fL and
never leaves the array. But the same stations feed a second item that is NOT marked advisory:

| layout | rotor centroid used | where the rotors are | "loaded pair" ratio tested against T/W |
|---|---|---|---|
| lift+cruise | 4.01 m | on booms | 1.055 |
| tiltrotor | 3.88 m | on the wing, 3.56 m | 1.112 |
| multicopter | 3.88 m | around the body | 1.119 |
| side-by-side | 3.88 m | abreast, one station | 1.143 |

The motor, inverter, rotor, boom, nacelle and drive masses are placed at that same centroid.

**Smaller items.**

- One loading only: payload at a single station, so no forward or aft CG case exists.
- The total CG divides by MTOW, not by the masses summed, so it moves if the two ever differ
  (2.477 against 2.973 m when they differ by 20 %). They do not differ on shipped designs.
- An undefined payload returns NaN; a 6 m rotor on a 7 m body returns a station of −3.66 m.
- The header's "RAVEN's measured 0.0744 fL exactly" is 0.0741 at the stated 0.4293 fL.

**LOW.** The CG itself is right; the consequence is a displayed feasibility item whose input
the module already describes as a placeholder.

**Not repaired.** PASS A modifies no production code.

## F-117 — the eVTOL fuselage weight uses a body wetted area with the fineness correction applied twice, so the fuselage is 4.7–4.9 % light and MTOW 1.3–1.8 % light on every layout — MEDIUM — VERIFIED

`src/engine/weights.js`, WEIGHT-249 to 284. Inside the MTOW loop (`engine.js` l.1262).

**What holds.** The AFDD93 wing and AFDD84 body equations were read from rendered pages of
NDARC Theory (§29-1.2 and §29-4; the text layer loses the bases) and written out independently.
Coefficients, factors and every exponent match. The independent wing reproduces the module on
the four winged layouts to the leading-edge sweep term (1.19 %), and the independent body
reproduces the fuselage group to 0.1 kg on six layouts *when given the module's own area*.

**Defect.** `fuselageWettedArea()` returns Raymer's fineness-corrected area above fineness 2.5.
Line 275 multiplies it by the same correction again.

| layout | body | area once | area as used | fuselage as shipped | with the area once | MTOW effect |
|---|---|---|---|---|---|---|
| lift+cruise | 8.91 × 1.65 m | 35.07 m² | 26.64 m² | 305.5 kg | 320.0 kg | +52.6 kg (1.80 %) |
| hybrid | 8.61 × 1.65 | 33.54 | 25.20 | 268.3 | 281.5 | +40.7 (1.65 %) |
| hybrid pusher | 8.61 × 1.65 | 33.54 | 25.20 | 263.5 | 276.5 | +39.3 (1.63 %) |
| tiltrotor | 8.61 × 1.65 | 33.54 | 25.20 | 263.5 | 276.5 | +41.7 (1.73 %) |
| multicopter | 8.61 × 1.65 | 33.54 | 25.20 | 310.3 | 325.6 | +53.7 (1.49 %) |
| side-by-side | 8.61 × 1.65 | 33.54 | 25.20 | 202.0 | 211.9 | +26.1 (1.34 %) |

The MTOW column restores the shortfall through the production input `fuselageIncrementKg` and
re-sizes. On a stubby pod (3.9 × 1.6 m, the VoloCity body the area function was written for)
the area used is 6.08 against 16.36 m² and the fuselage is 15.3 % light.

The comment above the line says the change was made so that the weight and drag models "now
disagree on nothing". They disagree by this factor.

**Also recorded.**

- The legacy GA fuselage (opt-in): the coefficient and three exponents match NASA
  TM-2017-219627 Eq. 60; the tail-arm and fineness exponents are not in that equation and their
  source is not held — UNVERIFIED.
- AFDD84's two weights (maximum take-off, structural design) are both MTOW.
- The cruise propeller is priced by the 2.0 kg/m² constant the module measured 249 % out and
  replaced for the lift rotors.
- n_z is floored at 1 in the wing and not in the body; NaN and negative MTOW are not refused.

**MEDIUM.** A localized arithmetic defect that moves every shipped design's MTOW by 1.3–1.8 %,
in the light direction. Not HIGH: the size is within the 6.5 % scatter NDARC states for the
equation, and the structure technology factor was calibrated with the defect in place.

**Not repaired.** PASS A modifies no production code.

## F-118 — the trainer weight groups reproduce independently and land within 6.5 % of three published empty weights; two equations knowingly depart from the printed report, a third "misprint" the header claims is not on the page, and the equipment relations go negative below their range — LOW — VERIFIED

`src/classes/trainer/weights.js`, WEIGHT-113 to 156.

**What holds.** Every group was written out independently from the rendered pages of NASA
CR-152303 Vol V and from the vendored Aviary GASP code, and evaluated on four aircraft. All
thirteen groups equal the module's to 0.1 lb, the groups sum to the empty weight, and on the
sized default empty + payload + fuel equals gross to 1e-4 lb.

| aircraft | published empty | module | error |
|---|---|---|---|
| Cessna 172S | 1,663 lb | 1,567.3 | −5.8 % |
| Cessna Skyhawk (1976) | 1,350 | 1,415.5 | +4.8 % |
| Piper Cherokee 180 | 1,386 | 1,475.9 | +6.5 % |

**Provenance, read from the page.**

| equation | printed in the report | module | effect on the C172S |
|---|---|---|---|
| V.1.69, wing material factor | 1 − 2.5/√(B/cos Λ) | 1 **+** 2.5/√(B/cos Λ), following Aviary | wing 308.2 lb against 142.5 |
| V.1.63, tail load | no fuselage length | includes it, following Aviary | tail 48.5 lb against 8.2 |
| V.1.74, fuselage | (ΔP+1)^0.2 U_LF^0.3 on a continuation line, no fraction bar | a factor | — |

The first two departures are stated in the header and are supported by Aviary. The third is
the reverse: the header says the report "puts them in the denominator", and the page read here
does not. Module, page and Aviary agree; the header's statement is unsupported.

**Domain.** Electrical is negative below 622 lb and furnishings below 908 lb; the FLOPS wetted
area is negative below a fineness of 1.7; a span of 0, a dive speed below 1 kt, a wing loading
of 0 and an oversized trend factor return NaN or null with no refusal. Gear hydraulics are
zero for every aircraft because the caller passes a zero coefficient.

**LOW.** Nothing inside the validated envelope (2,300–2,550 lb, four seats) is affected.

**Not repaired.** PASS A modifies no production code.

## F-119 — the FLOPS weight port reproduces a second, independent FLOPS case to 0.03 %; it has only the simple wing, validates no input, and carries one dimensional oddity from its source — LOW — VERIFIED

`src/classes/transport/flops-weights.js`, WEIGHT-157 to 226 (blocks 55 and 56).

**What holds.** The production harness checks the port against Aviary's large_single_aisle_2.
This audit transcribed the *other* vendored FLOPS case, large_single_aisle_1, from Aviary's data
file and ran it through the production function, applying the case's per-item mass scalers.

- 26 of 27 comparable items agree within 0.03 %: both tails, fuselage, both gear legs, paint,
  the wing shear and miscellaneous terms, engines, controls and starter, fuel system, all nine
  systems items but one, crew, unusable fuel, oil, passenger service, containers and payload.
- The 27th, air conditioning, is 1.3 % low because FLOPS adds 7.5 % of the *scaled* avionics
  mass and the module has no scalers; with the scaler restored it is 1,601.9 against 1,602.
- The port's own wetted areas equal the FLOPS values (total 8,275.87 against 8,275.86 ft²).
- The LSA2 wing computed by hand: bending factor 8.8291 (FLOPS 8.8294), wing 15,287.9 lb
  (15,288).
- Structure + propulsion + systems + margin = empty, empty + operating items = OEW,
  OEW + payload = ZFW and gross − ZFW = fuel, to 0.1 lb on the transport, bizjet and turboprop.

**Limits.**

| item | measured |
|---|---|
| simple wing only | on LSA1, which FLOPS ran with its detailed wing, the bending factor is 10.08 against 11.59 and the bending mass 15 % low |
| no input validation | span 0, no engines or a negative gross weight return NaN; gross 0 returns a 1,597 lb wing; an 89° sweep a 168,915 lb wing; a composite fraction of 3 a 1,080 lb wing; an empty margin of −1 an empty weight of 0 |
| tail root chord | the horizontal-tail chord entering the fuselage cut-out is root chord **plus** a dimensionless factor, where the wing's is root chord **times** it. Aviary's source does the same. 9.4 ft² of 4,159 |
| containers | cargo + baggage of 1 lb needs no container (floor(x/950 + 0.99)); 10 lb needs one |

**LOW.** A faithful port; the limits are of scope and of guards.

**Not repaired.** PASS A modifies no production code.

## F-120 — the maximum zero-fuel mass is the sized take-off mass times an input ratio, so the default business jet fails the tool's own zero-fuel criterion by 351.6 kg and every short-range design does the same — MEDIUM — VERIFIED

Adjudication of the WEIGHT-owned lead "default bizjet OEW + payload > MZFW". The relation is
`mzfwKg = grossLb × mzfwRatio` (`classes/aircraft/engine.js` l.212); the masses it is compared
with are the FLOPS build-up audited in blocks 55 and 56.

**The figure, recomputed from the result masses at shipped defaults.**

| class | MTOW | OEW | payload | ZFW | MZFW (ratio) | MZFW − (OEW + payload) | compliance row W-1a |
|---|---|---|---|---|---|---|---|
| bizjet | 12,548.1 kg | 8,718.4 | 362.9 | 9,081.2 | 8,729.7 (0.6957) | **−351.6 kg** | FAIL |
| transport | 78,800.1 | 43,582.5 | 16,545.7 | 60,128.2 | 62,559.4 (0.7939) | +2,431.1 | PASS |
| turboprop, trainer | — | — | — | — | no MZFW input | — | no row |

OEW + payload equals the reported ZFW to 0.001 kg in every class: one definition throughout.
Fuel and reserves are in neither side.

**What MZFW is here.** Not a structural limit and not a constraint. It is the *sized* MTOW
multiplied by a ratio taken from a real aircraft (Latitude 9,720 / 13,971; 737-800 138,300 /
174,200 lb). Sizing does not read it; MTOW converges identically whatever the ratio. It reaches
two outputs: compliance row W-1a and the corner of the payload-range diagram.

**Why the default fails.** The ratio is the real Latitude's. The sized aircraft is not the
Latitude: MTOW is 10.2 % below 13,971 kg while OEW is 3.0 % above the published 8,462 kg, so
OEW / MTOW is 0.695 against the real 0.606 — as large as the MZFW ratio itself. With the real
MTOW and MZFW the same sized OEW would leave +638.8 kg.

**Reach.** OEW + payload falls more slowly than MTOW as range shortens, so a fixed ratio is
violated by every short-range design.

| population | designs | failing | worst |
|---|---|---|---|
| bizjet: passengers carried 1–9 × range 500–5,000 nm × three fuel methods | 72 | 44 | −1,926 kg |
| transport: economy seats 50–200 × range 300–6,000 nm × three fuel methods | 84 | 35 | −9,708 kg |

Bizjet, one input at a time: range 2,000 nm −832 kg, 1,000 nm −1,408 kg; range 3,500 nm +299 kg;
ratio 0.75 +330 kg. Transport at 1,500 nm: −3,292 kg.

**What the tool says.** Row W-1a reports FAIL with the margin. The payload-range diagram detects
the case, falls back to the design payload and states that it is "a disagreement between the
sized take-off mass and the entered ratio, not a real limit". The warnings list says nothing.

**MEDIUM.** A shipped default class fails a criterion of the tool's own compliance matrix, and
the criterion's verdict is decided by an input ratio rather than by the structure. Not HIGH:
MTOW, OEW and every sized quantity are unaffected, and the tool discloses the cause on the
payload-range screen.

**Leads this exposes, not adjudicated here (MISSION / SIZING).** The default bizjet carries
3,467 kg of mission fuel where the real aircraft's quoted mission needs about 5,146 kg (MTOW −
OEW − payload); the "regulatory" fuel method sizes it to 14,334 kg. A bizjet with zero
passengers carried does not converge (gross weight ran away) and is reported as not converged, with that reason.

**Not repaired.** PASS A modifies no production code.

## F-121 — the seat-by-seat loading diagram is arithmetically right, but its seats overflow the default transport cabin by 2.15 m and sit 1.40 m aft of the cabin centroid the balance module loads the payload at — LOW — VERIFIED

`src/classes/aircraft/loading-diagram.js`, WEIGHT-055 to 066; consumed by `balance.js`.

**What holds.**

- The wing-box tank centroids equal a 200,000-step quadrature to six decimals.
- 162 of 162 seats are placed, and the payload the diagram builds from its seats, baggage and
  cargo equals the sized payload on all four classes.
- Seats abreast matches the ATR 72 (4), A320 and 737-800 (6) and A330 (8).

**Defect.** The seat block is centred on the cabin centroid by length, premium rows forward.

| class | seated length / cabin | seat centroid − cabin centroid | take-off CG (payload at the cabin centroid) | analytic aft CG | seat-by-seat aft CG |
|---|---|---|---|---|---|
| transport | 24.97 / 22.81 m (+2.15) | +1.399 m (33.4 % MAC) | 28.80 % MAC | 47.87 % | 54.70 % |
| bizjet | 7.75 / 10.59 | −0.344 m (−15.1 %) | 25.41 | 26.00 | 30.11 |
| turboprop | 14.63 / 16.30 | −0.197 m (−8.0 %) | 31.21 | 56.65 | 49.75 |
| trainer | 1.63 / 5.47 | 0 | 19.41 | 40.09 | 28.41 |

So one result carries two payload stations. The take-off CG and the static margin of
`balance.js` use the cabin centroid and the analytic sweep; the diagram uses the seats. On the
transport the seat-by-seat aft limit is 6.8 % MAC behind the one the static margin is quoted
against. The module says where the two disagree "the disagreement is the finding"; it does not
quote the margin against the more aft of them.

**LOW.** A reporting inconsistency inside a module that feeds nothing back into sizing.

**Not repaired.** PASS A modifies no production code.

---

# Geometry and chart findings

Full detail, including every numerical assertion, is in `GEOMETRY-AUDIT.md`. Summarised here so
the register is complete.

| id | finding | severity | status |
|---|---|---|---|
| **F-G01** | The general arrangement draws the wing at an unsourced `0.38·L` convention (`geometry.js:747`) while `balance.js:207` computes `xWingRootLE` from Scholz (10.24) under the comment *"the root leading edge, which is what a drawing needs"* — and the MAC bar, CG envelope and every %-MAC figure are drawn off the **computed** datum. Lead-verified: transport **+2.766 m = 66.0 % of MAC**; trainer **−1.662 m = −110.7 % of MAC**, i.e. the MAC bar lies entirely aft of the drawn trailing edge. The Balance tab and the General Arrangement show the same wing 2.766 m apart. | HIGH | **VERIFIED** |
| **F-G02** | The T/W trade chart never uses the variable it sweeps: `tw` appears in the `.map(tw=>…)` signature and then only in the returned object (`engine.js:2442-2464`, with explicit `// T/W=1.0` comments in the body). Lead-verified: **one distinct value, 2016.8 kg, across all nine T/W points**, plotted under a caption asserting a `T/W^1.5` trend, and **−27.25 %** below the converged 2772.06 kg. | HIGH | **VERIFIED** |
| **F-G03** | Two `ConvergenceTab` tables contradict the same tab's KPI: `tolSweepData` converges to 2033.21 kg against 2772.06 (**−26.65 %**), and `ConvergenceTab.jsx:203` applies T/W **twice** (`DL2` already contains it), giving 489.2 kW against `SR.Phov` 596.81 (**−18.0 %**, ratio exactly 1.3000). | HIGH | AGENT-REPORTED |
| **F-G04** | `CrossSectionPreview` draws a hard-coded five-station fuselage and prints its invented numbers as dimension labels. The **section aspect is inverted** — drawn w/h 1.136 against the model's 0.591, a factor of **1.92** — and `cabin.js:57-66` confirms the engine is right. Also falls back to literals `1.94/0.87/12.67/9.57` with no model behind them. | HIGH | AGENT-REPORTED |
| **F-G05** | The front view adds a dihedral term the side view and the compliance model omit, so one nacelle is drawn at two heights (Δ 13.2 % of H) and **the drawn turboprop propeller clearance is 2.84× the certified one** (0.6564 m drawn against the 0.2312 m on which the 25.925(a) "margin 0.053 m" verdict rests). | HIGH | AGENT-REPORTED |
| **F-G06** | `WingAeroTab`'s polar, lift-curve and L/D charts plot a **2-D aerofoil** polar on aircraft axes: max plotted L/D **158.34** with `SR.LDact` **9.77** drawn as a reference line on the same axis (16.2× apart); the series is **byte-identical** when `CD0tot` moves −5.9 %; lift slope 7.008/rad against the finite wing's 5.351/rad; `CL(α=0)` a hard-coded 0.40. | HIGH | AGENT-REPORTED |
| **F-G07** | ~13 `ReferenceLine`s are placed by `x` on Recharts **category** axes (`PerformanceTab.jsx:39,49-52`; `MonteCarloTab.jsx:190…292`) and are silently dropped. The audited components do this correctly (`EnvelopeViews.jsx:77`, `BalanceViews.jsx:56` pass `type="number"`). | MEDIUM | AGENT-REPORTED |
| **F-G08** | Three datum/label defects: T-tail `htZ` measured from z = 0 while `vt.height` is from z = H/2 (tailplane drawn 33.6–42.3 % of fin height below the tip); fin root started at H/2 where the crown has already dropped (overall height +0.17 %); plan and front views disagree by 0.150 m on the same wing root rib. | MEDIUM | AGENT-REPORTED |
| **F-G09** | `WingAeroTab`'s planform draws the leading edge at the **quarter-chord** sweep (9.570° against a true Λ_LE of 11.901°) and then labels the dashed c/4 line — which runs at an actual 7.207° — as **"Λ¼ = 9.57°"**, a 24.7 % disagreement between a dimension label and the line it annotates. | MEDIUM | AGENT-REPORTED |
| **F-G10** | The constraint diagram's design point is not the sized aircraft: disc loading 554.3 N/m² against the installed 667.6 (**+20.4 %**), design point 5.013 kg/kW against `MTOW/Phov` 4.645 (**−7.4 %** on installed power), `ReferenceDot` at 1401.5 N/m² against the design's 1371. Compounded by F-23 (e = 0.85 on this chart vs 0.828 in sizing). | MEDIUM | AGENT-REPORTED |
| **F-G05b** | The noise contour map places all twelve rotors on a fabricated ring of radius `bWing/4` = 3.340 m, under a caption reading *"Distances to scale"*; the model's own stations are `|y| ∈ {1.336, 4.008, 6.680}` at `x ∈ {0.861, 6.890}`. The contour rings themselves are correct. | MEDIUM | AGENT-REPORTED |
| **F-G15** | `fuselageSideOutline` (`geometry.js:265`) binds `FUSELAGE_CONVENTION` unconditionally, so a per-class `closure` sets only the tip z values while the control points stay shared and unsourced. It reaches four drawings **and the tail-strike compliance search** (`gear-geometry.js:170-181`), so the known keel-shape defect propagates into a compliance number, not just a picture. | MEDIUM | established context |
| **F-G11** | Residual bars are attributed to the iteration before the change they measure, and the bar that actually satisfies the tolerance is `null` and never drawn. | LOW | AGENT-REPORTED |
| **F-G12** | `CrossSectionPreview`'s airfoil panel has a **1.556× vertical exaggeration** while labelling "t/c = 0.15", renders `"NACA 15"` (not a NACA designation) for whatever airfoil is selected, and draws the planform at fixed pixels so changing the span changes only the text. | LOW | AGENT-REPORTED |
| **F-G13** | `BoxSection`'s dashed "aerofoil thickness envelope" spans **60.0 % of the true chord** (3.607 m against 6.012 m at the root) because it scales the box width, not the chord. | LOW | AGENT-REPORTED |
| **F-G14** | The drone 3D view is a parallel **oblique** projection (`sy` carries a `−0.5·r.x` term) but is called orthographic in three comments and on screen; a vertical length reads 44 % of a horizontal one at the default view. | LOW | AGENT-REPORTED |

### Geometry PASS results

Lateral symmetry **PASS** everywhere (0.000e+0 in every 2-D drawing; worst 9.9e-5 m in the 8,556-vertex
eVTOL mesh, a float artefact). Local cross-section symmetry **PASS** (Σy ≤ 1.6e-15, exact mirrors at
odd *and* even stringer counts — the `9dfc88c` fix holds). Longitudinal upsweep **PASS** on sign and
closure: crown above keel on all four classes, so the `46c7a1d` inversion fix holds. One vertical
datum **PASS** with the three exceptions above. Uniform scale **PASS** in 8 of 10 SVGs. V-n diagram
**PASS**: the corner closes at (v_A/v_S1)² = 2.5000 exactly and the gust slopes are in the exact
1 : 1 : 0.5 ratio. Gear stations, wheelbase, spar stations, `x_wing` and the fuselage dimensions are
**exact to 0**. `drone/FrameDiagram` is exemplary — ArduPilot-sourced geometry, declared drawing
constants, and a caption that says "Not to scale". **Memoisation is clean**: the frozen chart series
are frozen in the engine, not by stale React caching.

# Regulatory, edge-case and precision findings

Full detail in `REGULATORY-AUDIT.md`, `EDGE-CASES.md` and `NUMERICAL-STABILITY.md`. The regulatory
work was done **against a vendored primary corpus** (`../eVTOL_Sizing_Research/extracted`, 56 files
including SC-VTOL-02 Issue 2, MOC-1/2/4 and AC 21.17-4, plus verbatim eCFR text for ~100 Part 25
sections), so most citations were checked against the document rather than assumed.

| id | finding | severity |
|---|---|---|
| **F-R01** | The MOC VTOL.2120 climb check returns **PASS for an undefined aircraft** (968,252 % gradient at `MTOW_kg = 0`). **VERIFIED.** | **CRITICAL** |
| **F-R02** | The declared 305 m / ISA-SL evaluation condition is **never applied**; the printed basis line is false for every run. **VERIFIED.** | **CRITICAL** |
| F-R03/R04 | Two rows at severity `critical` check **superseded or nonexistent** EASA limits; **seven** thresholds the app's own `regdb.js` declares to be *tool rules* are presented under regulatory citations, four at severity `critical`. | HIGH |
| F-R05 | `CS-VTOL AMC 27.65` — **no such document exists**; AMC 27.65 belongs to CS-27, not held. Carried as `status:"sourced"` on a safety margin, and **invisible to the citation gate** because the gate matches only `VTOL.NNNN`/`PL.NNNN`. | HIGH |
| F-R06/R07 | Certification rows that **cannot fail**: `n_pos >= 2.0` tests a quantity against its own floor; V-tail pitch/yaw authority is **exactly 1 by construction** across ten parameter variations — including a case with `SM_vt = −0.2266`, so **two CRITICAL rows report 100 % PASS on a statically unstable aircraft**. | HIGH |
| F-R11 | Wingless layouts get **four false CRITICAL non-compliances** from `null`-vs-number comparisons, and the tab **prints "SM = 0.0 % MAC" for an aircraft that has no MAC**. The engine already ships the `WING_ONLY_CHECKS`/`checksNA` scoping the tab does not use. | HIGH |
| F-R12 | A **percentage compliance score under a regulator's name**, aggregating verified rules, unsourced tool rules and tautologies. The prose disclaimers are explicit and strong; the overreach is the single number. | HIGH |
| F-R13 | The seat gates **count crew as passengers**, so a 9-passenger + 1-pilot design is ruled out of scope and **loses its entire regulatory table**. Both paragraphs verified verbatim against the held corpus. | HIGH |
| F-R15 | The exported report is internally inconsistent by **60.8 % MAC** on the wing aerodynamic centre; recomputing SM from the report's own printed table gives **27.5 % against the 15.0 % printed two lines above**. | HIGH |
| F-R18 | **No input validation at `runSizingCore`.** `socMin = 1.5` (an illegal 150 % SoC floor) **converges** to a battery **46 % smaller** than the legitimate case — an illegal input yields a *more optimistic* aircraft. `sedCell = −300` returns `Wbat = +96,621 kg`. | MEDIUM |
| F-R24 | **Unbounded runtime**: `nPropHover = 400` does not return in 500 s; scaling ≈ O(n^4.8), extrapolated ~47 h. Reachable via the API, a URL parameter or a design-file import. | MEDIUM |
| F-R01p | **Rounding reused in a regulatory decision.** `OEI_margin_pct` is rounded twice and compared to 0; lead-verified that `+(-0.04).toFixed(1)` is **negative zero** and **`-0 >= 0` is `true`** in JavaScript, so any true margin in **(−0.045 %, 0)** is badged **PASS**. Two further cases: a 55.04 % battery fraction rounds to 55.0 and passes; `maxPayloadAtMTOM` can round **past the certification limit it exists to respect**. | MEDIUM |
| F-R02p | **Cancellation of rounded stations amplifies error 37×–60×**, so the app displays **two different static margins for one design**, and at a 5–25 % MAC band edge the colour is set by the third decimal of a rounded station. | MEDIUM |
| F-R03p | Displayed precision up to **185,000× the model's own stated uncertainty band** (`Pheat` to 0.1 W on an `unverified` quantity; MTOW to 0.01 kg against a live ±226.4 kg band). `VALIDATION.md` already says ±5 % "is not a claim that any individual answer is accurate to 5 %"; the display contradicts the document. | LOW |

**Precision structural PASS, worth recording:** rounding does **not** enter the convergence core —
the physics modules are called with the loop's unrounded locals, and the three solvers that do read
rounded values were each measured and are safely inside their own tolerances.

# UNVERIFIED items

| id | item | why unresolved |
|---|---|---|
| U-01 | Whether `etaHov` is intended as a pure figure of merit or a lumped battery-to-shaft efficiency (F-13) | A modelling-intent question. Needs the code owner or a primary source; the evidence cuts both ways. |
| U-02 | `src/engine/turboelectric.js:118-119` referred lapse `(P/P0)·sqrt(T/T0)` makes turboshaft power **rise 3.6 %** on ISA+20 at 6,000 ft, so the hot-and-high day sizes the generator *smaller* — opposite to the purpose of `SIZING_DAYS` | The NDARC referred-parameter text is not vendored in this repo. Dimensionally consistent; convention unverifiable here. |
| U-03 | `PackInstalledkWh` (204.883) exceeds `PackkWh` (203.519) by 0.67 % at defaults | Mechanism not traced. |
| U-04 | Whether paint / trapped fluids are genuinely absent from the eVTOL ledger | AFDD/GASP regressions are fitted to as-built aircraft, so paint may be implicitly in the fit. Order 31 kg (1.1 % MTOW) if truly absent. |
| U-05 | Whether SoC can overshoot 1 in the drone integration | `src/classes/drone/dynamics.js:874, 993` clamp with `max(0,…)`, which would hide a final-step overshoot; no `soc > 1` assertion exists. |
| U-06 | V-tail weight formula `0.036·S·AR^0.25·0.82·1000/9.80665` labelled *"simplified Raymer eq 15.26"* | Cannot be that equation (Raymer 15.26 is an eight-term imperial regression). Worth 21–60 kg. **The project already records this as unverified** (`src/lib/provenance.js:231`). |

---

# What was verified and PASSED

These are recorded because an audit that lists only defects misrepresents the system.

| # | result | status |
|---|---|---|
| P-01 | **ISA implementation is exact.** `src/engine/atmosphere.js` `makeISA` reproduces the ISA definition to **0.00 %** on T, P, rho and a at 0/500/1000/1524/3000/5000/8000/10000 m, and correctly recomputes density from the gas law at **actual** temperature rather than scaling. `transport/atmosphere.js` adds a correct 11 km branch. | AGENT-REPORTED, consistent with the lead's own reference |
| P-02 | **The ISA constant triple is self-consistent.** `R_GAS = 287.05287` gives `P0/(R T0) = 1.225000` exactly and `sqrt(GAMMA R T0) = 340.2940`, matching NDARC's published sea-level speed of sound to four decimals. | VERIFIED (`AUDIT/reference/evtol_reference.py`) |
| P-03 | **The hover model is momentum theory, correctly implemented.** The app's disk-loading form `(T/FM)·sqrt(DL/(2 rho))` is algebraically identical to `T^1.5/(FM·sqrt(2 rho A))`; my two independent routes agree to **2.2e-16**. Per-rotor thrust is paired with per-rotor area — the classic `sqrt(N)` error (which would give 3.464× here) is **not** present anywhere. | VERIFIED |
| P-04 | **No `P = T·V` in hover** anywhere, including the mission profile and the SoC trace. | AGENT-REPORTED |
| P-05 | **Mass closure is exact in every class.** eVTOL `Wempty 1588.99 + Wbat 728.08 + payload 455 = 2772.07` vs `MTOW 2772.06` (0.01 kg, rounding). Trainer 0.000000 lb; transport 0.432 lb; bizjet 0.489 lb; turboprop < 0.5 lb; drone exact by construction. An independent route (`inertia.js` mass sum) also closes to 0.1 kg with `unplaced: []`. | VERIFIED (eVTOL) + AGENT-REPORTED (others) |
| P-06 | **Energy closure is exact.** Segments 4.973 + 19.139 + 76.417 + 0.331 + 4.973 + 59.016 = **164.849 kWh** vs `Etot` **164.85**. | VERIFIED |
| P-07 | **Reserve is never compounded.** `src/engine.js:1176` takes `Math.max(time-based, 10 %-of-mission)`, not the sum, matching the cited NASA rule. Reserve is 35.8 % of total energy at defaults. Transport reserve components appear exactly once per policy across four policies. | VERIFIED (eVTOL) + AGENT-REPORTED (transport) |
| P-08 | **Every energy is `P·t/3600`** across all 14 sites; no kW·s, no Wh/J confusion. `sedCell·3600`, `psfcSI` and `tsfc/3600` all dimensionally exact. | AGENT-REPORTED |
| P-09 | **No cross-class state contamination at the engine layer.** All five registered classes run, then the round trip evtol→trainer→transport→bizjet→turboprop→evtol, then a full round trip before re-running each class, comparing every numeric leaf (evtol 5,807 leaves; trainer 133; transport 435; bizjet 454; turboprop 164): **IDENTICAL in every case, 0 differing leaves.** Only module-scope mutable state in the engine path is five memoised `let measured = null` caches plus one `runtimeStamp`. | VERIFIED |
| P-10 | **Convergence is independent of the initial guess.** Driving the eVTOL L1 seed from 589.67 to 5944.13 kg gives the same answer every time; `solver`, `sizingRelaxation` 0.05–1.0, `solverSwitchFrac`, `solverStallLimit` and `convTolExp` −3…−10 all return the same MTOW. Drone likewise. | AGENT-REPORTED |
| P-11 | **Every stopping test is on the residual, not the delta** — `engine.js:502, 1448`; `wingPosition.js:128, 162`; `transport/size.js:424`; `turboprop/size.js:224`; `trainer/size.js:211`; `drone/sizing.js:325`; `mission.js:219`. (Qualified by F-20.) | AGENT-REPORTED |
| P-12 | **The lagged `*Prev` variables are converged out in fact.** Across all six eVTOL layouts, pure fixed-point, hybrid and forced-secant agree to **0.00e+0** on every path that reports convergence. | AGENT-REPORTED |
| P-13 | **No unit conversion factor in the tree is wrong by more than 0.081 %**, and that worst case is F-37. All others are ≤ 1.2e-4 %. No Raymer/FLOPS/GASP equation is fed metres or kilograms anywhere — the imperial↔SI boundary is clean in every module. No degree/radian error at any `Math.sin/cos/tan` site. No display-unit value re-enters a calculation. | AGENT-REPORTED |
| P-14 | **No double counting in the mass ledger.** Specifically cleared with evidence: motor mass (hover count excludes the pusher), battery (outside OEW, once in the residual), propeller, rotor support (booms/nacelle, with `nacellePylonFrac` defaulting to 0 for exactly that reason), payload-inside-empty (crew *people* in OEW is the correct FLOPS convention), and the structural-fraction reference masses — `flightControlsFrac` is on airframe (`MTOW − Wbat`, verified exactly) and `electricalFrac`/`ecsAntiIceFrac` on MTOW, which the agent showed by reproducing the NASA Table 12 calibration is the **tighter** basis. | AGENT-REPORTED |
| P-15 | **The drone module is the strongest code in the repo** and is the standard the other classes should be held to: measured UIUC rotor C_T/C_P with a refusal to extrapolate, a physical Kv/Kt/I0/Rm motor model with a closure residual, measured ESC joint efficiency with p10/p90 correctly crossed, and required declared inputs with **no defaults** — it refuses, by name, on all five. | AGENT-REPORTED |

---

# Cross-cutting observations

**1. The recurring defect in this codebase is the duplicated quantity, and the project knows it.**
Gravity, `R_GAS`, solidity, blade count, the fuselage keel and the fuselage wetted area have
each been found written twice. This audit adds: viscosity (F-04), cruise density and speed of
sound in the report (F-07), the fuselage fineness correction (F-08), hover power in five
places (F-18), Oswald efficiency in three (F-23), CLmax in four (F-24), the Pa→psf factor in
three (F-36), and two entry paths that size different aircraft (F-19). `validation/constants.mjs`
was built to catch exactly this class and currently guards **two** constants.

**2. Several defects are in the DISPLAY of a correct calculation, not the calculation.**
The sizing loop uses the converged L/D, the correct hover power, and the right wetted area for
drag; the trade charts, the exported report and the Weather tab do not. A reviewer reading the
PDF (F-06, F-07), the convergence tab (F-17, F-18) or the motor readout (F-25) is shown numbers
the engine did not use. For a tool whose stated thesis is traceability this is the most
consequential pattern in the audit.

**3. Input validation is the weakest subsystem, and the repo contains its own best answer.**
Negative range, negative reserve, `vCruise ≤ 0`, `sedCell ≤ 0`, `socMin = 1` and
`cRateDerate > 1` variously produce silent nonsense, `Infinity`, or a converged design with
negative fuel (F-02, F-12, F-14, F-16). `src/classes/drone/sizing.js` refuses all five of its
declared inputs by name with a reason (P-15). Applying that discipline to the other four
classes would close most of the MEDIUM findings at once.

**4. Where the code documents itself, the documentation is unusually good — and that raises the
cost of a stale comment.** `src/engine/constants.js`, `src/lib/provenance.js` (467 classified
outputs, 89 inputs) and `src/engine/atmosphere.js` are better annotated than most production
aerospace code. But F-08's comment claims an invariant the line below it breaks, F-09's comment
states the opposite of the default it guards, and F-11's comment asserts an equality that is
10.82 % out. In a codebase this well commented, a reader has no reason to doubt the comment.

---

# Files in this audit

| file | contents |
|---|---|
| `FINDINGS.md` | this document — the master finding register |
| `ARCHITECTURE.md` | module map, dependency/data/sizing/render/validation flows |
| `UNITS.md` | canonical units, conversion table, dimensional audit |
| `ATMOSPHERE-AUDIT.md` | every ISA implementation vs an independent reference |
| `MASS-CLOSURE.md` | full mass ledger per class, closure residuals |
| `ENERGY-AUDIT.md` | mission energy ledger, efficiency chain |
| `SIZING-LOOPS.md` | all 18 loops documented, convergence tables |
| `AERO-AUDIT.md` | aerodynamic formula inventory and drag build-up |
| `VALIDATION.md` | integrity of the existing 116-harness suite |
| `STATE-CONSISTENCY.md` | Phase 19 cross-contamination results |
| `PROVENANCE.md` | source integrity, the 467-output census |
| `FINAL-VERDICT.md` | the 27 required sections, evidence-based status per category |
| `reference/` | independent reference implementation (Python), self-testing |
| `data/` | machine-readable findings and benchmark cases |
