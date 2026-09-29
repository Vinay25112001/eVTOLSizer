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
