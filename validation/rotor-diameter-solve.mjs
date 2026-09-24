/* =====================================================================
   THE ROTOR-DIAMETER SOLVE CLOSES, AND ITS ANSWER IS CHECKED BY RESIDUAL
   =====================================================================
   solveRotorDiameter iterates rotor diameter against MTOW so a design holds
   the disk loading its configuration specifies. It could not converge on a
   minority of designs, and the reason was structural rather than a bad
   tolerance value: the loop called rotorDiameterFor, which ends
   `+(2 * R).toFixed(3)`, so every value it could return lay on a 1 mm
   lattice - while the test accepted at 1e-4 m, a TENTH of that spacing.
   A quantised state on a bounded trajectory is a finite-state machine whose
   orbit is eventually periodic (Butterweck, Ritzerfeld & Werter, EUT Report
   88-E-205, sec. IV.A), and a period of two or more holds successive iterates
   at least one quantum apart forever. The test was unsatisfiable by
   construction, and the cap was reached every time.

   The fix is structural - the loop iterates on rotorDiameterExact and rounds
   once, at the return - with a relative tolerance in place of an absolute
   metre figure, per NDARC's scaled-per-element form. Full reasoning and
   citations are in solveRotorDiameter's header.

   WHAT THIS GATE CHECKS, AND WHY IT IS BUILT THIS WAY.

   It does not take the solver's word for anything. `converged` is a claim the
   solver makes about itself; a flag can be wrong while the number is right,
   or right while the number is stale. So the central check RE-EVALUATES the
   residual at the returned diameter - runs the sizing again, recomputes the
   diameter that mass implies, and requires the two to agree. That is the
   success criterion the literature actually endorses (KINSOL: "Only the first
   condition (small residual) is considered a successful completion"), and it
   would catch a solver that reported convergence it had not achieved.

   It also pins the STRUCTURAL property directly, because that is the thing
   that regresses silently: an exact fixed point of a continuous map lands
   off the millimetre lattice, so if someone puts rotorDiameterFor back inside
   the loop the converged diameters become lattice values and section 4 fails.
   Asserting "the bug is fixed" is worth little; asserting "the loop is not
   using the quantised map" is what keeps it fixed.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};

/* This gate's own base, not DEFAULT_PARAMS, so the sweep does not move when
   the app's defaults do. Same shape the neighbouring harnesses use. */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

const LATTICE = 1e-3;          // metres; rotorDiameterFor rounds to 3 dp
const onLattice = (D) => Math.abs(D * 1000 - Math.round(D * 1000)) < 1e-9;

console.log("ROTOR DIAMETER SOLVE GATE");
console.log("=".repeat(78));

/* ── 1. THE TWO DIAMETER FUNCTIONS DIFFER IN EXACTLY ONE WAY ──────────
   rotorDiameterFor is the DISPLAY path and must keep quantising;
   rotorDiameterExact is the ITERATION path and must not. If these ever
   become the same function the structural fix is gone. */
{
  const k = Object.keys(CFG.CONFIGURATIONS)[0];
  const N = CFG.CONFIG_DEFAULTS[k].nRotors;
  let roundedOff = 0, exactOn = 0, disagree = 0, n = 0;
  for (let m = 800; m <= 4000; m += 7) {
    const Dr = CFG.rotorDiameterFor(k, m, N);
    const De = CFG.rotorDiameterExact(k, m, N);
    if (Dr == null || De == null) continue;
    n++;
    if (!onLattice(Dr)) roundedOff++;
    if (onLattice(De)) exactOn++;
    if (Math.abs(Dr - De) > LATTICE / 2 + 1e-12) disagree++;
  }
  check(n > 100 && roundedOff === 0,
    "rotorDiameterFor quantises to the 1 mm lattice (the display path)",
    `${n} masses, ${roundedOff} off-lattice`);
  check(exactOn <= 1,
    "rotorDiameterExact does NOT quantise (the iteration path)",
    `${exactOn} of ${n} landed on the lattice by coincidence`);
  check(disagree === 0,
    "the two agree to within half a quantum, so only precision differs",
    `${disagree} disagreed by more than ${LATTICE / 2} m`);
}

/* ── 2. SWEEP ─────────────────────────────────────────────────────── */
console.log("");
console.log("  layout          payload  status          iters  retreat   gap(mm)     D (m)");

const results = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  for (const payload of [300, 600, 1000, 1800]) {
    const d = CFG.CONFIG_DEFAULTS[k];
    const p0 = { ...B, payload, configType:k, nPropHover:d.nRotors,
      vCruise:d.vCruise_ms ?? B.vCruise, tipSpeed:d.tipSpeed_ms ?? B.tipSpeed,
      LD:d.LD_target ?? B.LD, etaHov:d.etaHov ?? B.etaHov,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
    const r = CFG.solveRotorDiameter(k, p0, runSizing, { seedMTOW: payload * 8 });
    if (!r) continue;
    results.push({ k, payload, p0, r });
    console.log("  " + k.padEnd(15) + String(payload).padStart(7)
      + "  " + String(r.status).padEnd(16) + String(r.iters).padStart(4)
      + String(r.retreats).padStart(8)
      + (r.gapMm == null ? "—" : r.gapMm.toFixed(4)).padStart(11)
      + String(r.propDiam ?? "—").padStart(10));
  }
}
console.log("");

const converged = results.filter((x) => x.r.status === "converged");

/* ── 3. THE RESIDUAL, RE-EVALUATED — the check that does the work ──── */
{
  const bad = [];
  for (const { k, payload, p0, r } of converged) {
    const d = CFG.CONFIG_DEFAULTS[k];
    const R = runSizing({ ...p0, configType:k, nPropHover:d.nRotors, propDiam:r.propDiam });
    if (R?.r2Diverged === true) { bad.push(`${k}/${payload}: converged on a DIVERGED sizing`); continue; }
    const m = Number(R?.MTOW);
    if (!isFinite(m) || m <= 0) { bad.push(`${k}/${payload}: no mass at the returned diameter`); continue; }
    const Dn = CFG.rotorDiameterExact(k, m, d.nRotors);
    const rel = Math.abs(Dn - r.propDiam) / Math.abs(Dn);
    /* The returned value is rounded to 4 dp for storage, so allow that
       rounding on top of the solver's own tolerance - and nothing else. */
    const allow = r.relTol + (5e-5 / Math.abs(Dn));
    if (!(rel <= allow))
      bad.push(`${k}/${payload}: residual ${(rel * 100).toFixed(4)}% > ${(allow * 100).toFixed(4)}%`);
  }
  check(bad.length === 0,
    "every converged diameter still satisfies its residual when re-evaluated",
    bad.length ? bad.join("; ") : `${converged.length} design(s) re-sized and checked`);
}

/* ── 4. THE STRUCTURAL PROPERTY — the loop is not using the rounded map ──
   An exact fixed point of a continuous map has no reason to sit on the
   millimetre lattice. If rotorDiameterFor goes back inside the loop, EVERY
   converged diameter becomes a lattice value. That is the regression this
   guards, and it is an all-or-nothing one.

   THE THRESHOLD WAS WRONG AND THIS IS WHY IT MOVED. It allowed at most ONE
   coincidence, but the returned diameter is stored rounded to 4 dp, so a
   value lands exactly on the millimetre lattice whenever its fourth decimal
   is zero — probability ~1/10, independently, per design. Over this grid of
   ~23 converged designs the EXPECTED number of coincidences is therefore
   ~2.3, with a standard deviation of ~1.4. A bound of 1 sits BELOW the mean:
   it had roughly a 70% chance of failing on any change that moved the
   diameters at all, and it passed at the previous commit by luck rather than
   by structure. It duly fired on a battery change that has nothing to do with
   the rotor solver — 5 of 23, all five being 4-dp values ending in zero
   (5.1930, 2.6440, 3.3350, 11.9580, 16.0950).

   The bound is now set by the FAILURE MODE instead of by taste. The
   regression puts 100% on the lattice; chance puts ~10% there. Half is ~6 sd
   above the chance mean and far below the regression, so it separates the two
   cleanly and cannot be tripped by a design shift. It is NOT vacuous: the
   mutation "put rotorDiameterFor back inside the loop" still fails it, which
   is checked directly below rather than asserted. */
{
  const latticed = converged.filter((x) => onLattice(x.r.propDiam));
  const bound = Math.floor(converged.length / 2);
  check(converged.length >= 6 && latticed.length <= bound,
    "converged diameters are NOT on the 1 mm lattice (the map is continuous)",
    `${latticed.length} of ${converged.length} on-lattice, bound ${bound}`
      + ` (chance expectation ~${(converged.length/10).toFixed(1)} from 4-dp storage;`
      + ` the regression this guards puts ALL ${converged.length} on the lattice)`
      + (latticed.length ? ` — ${latticed.map((x) => x.k + "/" + x.payload).join(", ")}` : ""));

  /* THE GUARD, GUARDED. Quantise every converged diameter — exactly what
     using the rounded map inside the loop would do — and confirm the check
     above would reject it. Without this, loosening the bound could have made
     the check unable to fail, which is the failure mode this repo has already
     been bitten by once. */
  const quantised = converged.map((x) => Math.round(x.r.propDiam * 1000) / 1000);
  const allOnLattice = quantised.filter(onLattice).length;
  check(allOnLattice > bound,
    "the lattice check would still REJECT the rounded map",
    `quantising all ${converged.length} diameters gives ${allOnLattice} on-lattice, above the bound of ${bound}`);
}

/* ── 5. NOTHING STALLS ────────────────────────────────────────────────
   This is the fix's actual claim, and it is deliberately NOT "every design
   closes". Some designs in this grid have no fixed point at all, and that is
   a fact about the aircraft rather than the solver: scanning 85 diameters
   from 4 m to 25 m, multicopter at payload 1000 gets no closer than a 3.6%
   residual and at 1800 no closer than 34.7%, against the 0.1% asked for.
   There is no rotor that closes those designs, so "does not close" is the
   correct answer and a gate demanding otherwise would be demanding a lie.

   What the structural fix DID remove is stalling: a design sitting in a
   feasible region, oscillating, running out of iterations because the
   tolerance was finer than the map's own resolution. Six of thirty sampled
   designs did that before. None may now.

   The two outcomes are different problems and the status column says which:
   "stalled" is a design the tool cannot pin down; "inner-diverged" is one
   whose sizing loop could not be kept in its domain. */
{
  const stalled = results.filter((x) => x.r.status === "stalled");
  check(stalled.length === 0, "no design STALLS (the quantisation failure mode is gone)",
    stalled.length
      ? stalled.map((x) => `${x.k}/${x.payload} still moving ${x.r.gapMm} mm after ${x.r.iters}`).join("; ")
      : `${results.length} designs, none stalled`);

  /* Positive control: this gate must not pass because everything failed. */
  check(converged.length >= results.length / 2,
    "most of the sweep actually closes, so the checks above have subjects",
    `${converged.length} of ${results.length} converged`);
}

/* ── 6. A DIVERGED INNER SOLVE IS NEVER CONSUMED AS A MASS ────────────
   The out-of-domain path must be EXERCISED, or the retreat logic is
   untested. Two designs in this grid reach it: the seed for multicopter at
   1800 lies outside the domain, and sideBySide at 1000 walks through a
   transient divergence. If a future engine change stops producing either,
   this fails rather than passing silently - widen the grid, do not delete
   the check. */
{
  const retreated = results.filter((x) => x.r.retreats > 0);
  check(retreated.length > 0,
    "the out-of-domain retreat path is exercised by the sweep",
    retreated.length
      ? retreated.map((x) => `${x.k}/${x.payload} retreated ${x.r.retreats}x and ${x.r.status}`).join("; ")
      : "no design hit a diverged inner solve, so the retreat logic is untested");

  const consumed = converged.filter((x) => x.r.MTOW != null && !(x.r.MTOW > 0));
  check(consumed.length === 0, "no converged solve carries a non-positive mass",
    consumed.length ? consumed.map((x) => x.k).join(", ") : `${converged.length} checked`);
}

/* ── 7. THE REPORT IS SELF-CONSISTENT ─────────────────────────────── */
{
  const bad = [];
  for (const { k, payload, r } of results) {
    const w = (m) => bad.push(`${k}/${payload}: ${m}`);
    if (typeof r.converged !== "boolean") w("converged is not a boolean");
    if (r.converged !== (r.status === "converged")) w("converged disagrees with status");
    if (typeof r.note !== "string" || r.note.length < 20) w("note is missing or trivial");
    if (!(r.propDiam > 0)) w("no diameter returned");
    if (!(r.relTol > 0)) w("no tolerance reported");
    if (r.status === "converged" && !/lb\/ft\^2/.test(r.note)) w("converged note names no disk loading");
    if (r.status === "stalled" && !Number.isFinite(r.gapMm))
      w("stalled but reports no measured gap, so the amplitude is undecidable");
  }
  check(bad.length === 0, "every solve returns a consistent report",
    bad.length ? bad.join("; ") : `${results.length} results`);
}

console.log("");
console.log("=".repeat(78));
if (fails.length) {
  console.log(`ROTOR DIAMETER SOLVE GATE FAILED — ${fails.length} check(s)`);
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(`ROTOR DIAMETER SOLVE GATE PASSED (${results.length} designs: `
  + `${converged.length} closed with residuals re-evaluated, `
  + `${results.length - converged.length} reported as not closing, 0 stalled)`);
