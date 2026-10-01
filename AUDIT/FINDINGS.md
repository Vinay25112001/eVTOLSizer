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
