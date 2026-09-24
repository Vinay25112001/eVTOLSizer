/* =====================================================================
   THE ROTOR-DIAMETER SOLVE REPORTS WHETHER IT CLOSED
   =====================================================================
   solveRotorDiameter iterates rotor diameter against MTOW so the design
   holds the disk loading its configuration specifies. It has returned a
   `converged` flag and an explanatory `note` since it was written. Every
   caller read `.propDiam` and dropped the rest - App.jsx's configuration
   switcher and ten harnesses in this directory - so a diameter that never
   settled was written into the design and went on to set disk loading,
   hover power, battery mass and MTOW with nothing anywhere saying it was
   provisional. The note even read "last value returned and flagged"; it
   was returned, and it was not flagged, because nothing read the flag.

   WHY THE SOLVE CANNOT ALWAYS CONVERGE, which is the part that decides
   what this gate is allowed to assert. rotorDiameterFor ends

       return +(2 * R).toFixed(3)

   so every diameter it can return lies on a 1 mm lattice, while the
   solver accepts at |Dn - D| < 1e-4 m, a TENTH of that spacing. Meeting
   it needs the same lattice point twice; any two distinct values differ
   by at least ten times the tolerance. Designs whose fixed point falls
   between two lattice points therefore cycle forever. Measured: more
   iterations do not help (40, 200 and 1000 fail identically) and the
   damping is not the cause (the same designs fail undamped).

   SO "DID NOT CONVERGE" IS NOT ONE OUTCOME, AND THIS GATE'S JOB IS TO
   KEEP THE TWO APART.

     - A cycle no wider than the 1 mm the rule can express means the
       design IS settled, to the finest diameter the rule has, and only
       the certificate is missing.
     - A cycle WIDER than that is a real oscillation. One sampled design
       cycles 18 lattice points, 13.8 mm, with MTOW swinging 2730 <-> 2762
       kg - the disk loading it flies is not the one it asked for.

   Collapsing those into one message would be true and useless: alarming
   for the first, routine for the second. `settled` separates them and
   the note says which.

   WHAT THIS GATE DELIBERATELY DOES NOT DO. It does not assert WHICH
   designs fail to converge, because that depends on DEFAULT_PARAMS,
   which is pinned by content hash elsewhere and will move. It asserts
   the REPORTING is self-consistent for whatever the sweep finds, and it
   positive-controls itself: if the sweep ever contains no converged case
   or no non-converged case, the gate FAILS rather than passing with
   nothing to check. A check that cannot fail is not a check.
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
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

const LATTICE_MM = 1;   // rotorDiameterFor rounds to 3 dp of a metre

console.log("ROTOR DIAMETER SOLVE GATE");
console.log("=".repeat(78));

/* ── 1. THE LATTICE IS REAL ───────────────────────────────────────────
   The whole analysis above rests on rotorDiameterFor quantising to 1 mm.
   Assert it directly: if someone changes that rounding, this gate's
   reasoning is stale and must be re-derived, not quietly carried over. */
{
  const k = Object.keys(CFG.CONFIGURATIONS)[0];
  const N = CFG.CONFIG_DEFAULTS[k].nRotors;
  let offLattice = 0, n = 0;
  for (let m = 800; m <= 4000; m += 7) {
    const D = CFG.rotorDiameterFor(k, m, N);
    if (D == null) continue;
    n++;
    if (Math.abs(D * 1000 - Math.round(D * 1000)) > 1e-9) offLattice++;
  }
  check(n > 100 && offLattice === 0,
    `rotorDiameterFor returns values on a ${LATTICE_MM} mm lattice`,
    `${n} masses sampled, ${offLattice} off-lattice`);
}

/* ── 2. SWEEP, AND REPORT WHAT CAME BACK ──────────────────────────── */
console.log("");
console.log("  layout          payload  converged  settled   gap(mm)   D (m)");

const results = [];
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  /* 800 is in this grid on purpose: it is the payload at which tiltrotor
     produces a 0.719 mm cycle, the SETTLED regime. Without it the sweep
     finds only large oscillations and half the reporting below is never
     exercised - the gate would pass while proving nothing about the branch
     a user is most likely to meet. */
  for (const payload of [300, 600, 800, 1000]) {
    const p0 = { ...B, payload, configType:k, nPropHover:d.nRotors,
      vCruise:d.vCruise_ms ?? B.vCruise, tipSpeed:d.tipSpeed_ms ?? B.tipSpeed,
      LD:d.LD_target ?? B.LD, etaHov:d.etaHov ?? B.etaHov,
      ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
    const r = CFG.solveRotorDiameter(k, p0, runSizing, { seedMTOW: payload * 8 });
    if (!r) continue;
    results.push({ k, payload, r });
    console.log("  " + k.padEnd(15) + String(payload).padStart(7)
      + String(r.converged).padStart(11) + String(r.settled).padStart(9)
      + (r.gapMm == null ? "—" : r.gapMm.toFixed(3)).padStart(10)
      + String(r.propDiam ?? "—").padStart(9));
  }
}

console.log("");

/* ── 3. POSITIVE CONTROL — the sweep must exercise BOTH outcomes ───── */
const converged = results.filter((x) => x.r.converged === true);
const notConv   = results.filter((x) => x.r.converged !== true);
check(converged.length > 0, "the sweep contains at least one CONVERGED solve",
  `${converged.length} of ${results.length}`);
check(notConv.length > 0, "the sweep contains at least one NON-CONVERGED solve",
  notConv.length > 0
    ? `${notConv.length} of ${results.length} — the reporting below is exercised`
    : "nothing to check: every case converged, so this gate proves nothing. "
      + "Widen the sweep rather than deleting the check.");

/* BOTH REGIMES, not just one. The checks below branch on `settled`, so a
   sweep that produces only large oscillations leaves the settled branch -
   the one a user meets most often - completely untested while the gate
   still reports PASS. Requiring one of each is what stops that. */
const settledCases = notConv.filter((x) => x.r.settled === true);
const oscillating  = notConv.filter((x) => x.r.settled !== true);
check(settledCases.length > 0,
  "the sweep exercises the SETTLED regime (a cycle inside the lattice)",
  settledCases.length
    ? settledCases.map((x) => `${x.k}/${x.payload} ${x.r.gapMm} mm`).join(", ")
    : "no case cycles within 1 mm, so the settled branch below is never run. "
      + "Widen the sweep rather than deleting the check.");
check(oscillating.length > 0,
  "the sweep exercises the OSCILLATING regime (a cycle wider than the lattice)",
  oscillating.length
    ? oscillating.map((x) => `${x.k}/${x.payload} ${x.r.gapMm} mm`).join(", ")
    : "no case cycles wider than 1 mm, so the oscillating branch is never run. "
      + "Widen the sweep rather than deleting the check.");

/* ── 4. EVERY RESULT REPORTS ITSELF CONSISTENTLY ──────────────────── */
{
  const bad = [];
  for (const { k, payload, r } of results) {
    const w = (m) => bad.push(`${k}/${payload}: ${m}`);
    if (typeof r.converged !== "boolean") w("converged is not a boolean");
    if (typeof r.settled !== "boolean") w("settled is not a boolean");
    if (typeof r.note !== "string" || r.note.length < 20) w("note is missing or trivial");
    if (!(r.propDiam > 0)) w("no diameter returned");
    if (r.converged === true && r.settled !== true) w("converged but not settled");
    if (r.gapMm != null && !(r.gapMm >= 0)) w("gapMm is not a magnitude");
    /* A NON-CONVERGED SOLVE MUST CARRY ITS MEASURED GAP. Without it the
       two regimes cannot be told apart, and - found by mutation, not by
       reading - the checks below that branch on gapMm SKIP silently when
       it is absent, so deleting the field made this whole gate pass while
       testing nothing. Demand it here, where absence is a failure rather
       than a reason to move on. */
    if (r.converged !== true && !Number.isFinite(r.gapMm))
      w("non-converged but reports no measured gap, so the regime is undecidable");
  }
  check(bad.length === 0, "every solve returns a consistent convergence report",
    bad.length ? bad.join("; ") : `${results.length} results`);
}

/* ── 5. `settled` IS THE LATTICE TEST, NOT A SECOND OPINION ───────── */
{
  const bad = [];
  for (const { k, payload, r } of notConv) {
    if (r.gapMm == null) continue;
    const shouldBeSettled = r.gapMm <= LATTICE_MM;
    if (r.settled !== shouldBeSettled)
      bad.push(`${k}/${payload}: gap ${r.gapMm} mm but settled=${r.settled}`);
  }
  check(bad.length === 0,
    `settled is exactly "the cycle is no wider than ${LATTICE_MM} mm"`,
    bad.length ? bad.join("; ") : `${notConv.length} non-converged case(s) checked`);
}

/* ── 6. THE NOTE SAYS WHICH REGIME, IN WORDS ──────────────────────────
   The note is what the user reads. A settled note must not describe an
   oscillation, and an oscillating note must not claim the value sits
   inside the millimetre the rule expresses - that would tell someone a
   13.8 mm cycle was fine. */
{
  const bad = [];
  for (const { k, payload, r } of notConv) {
    const n = r.note.toLowerCase();
    if (r.settled) {
      if (!n.includes("settled to")) bad.push(`${k}/${payload}: settled note does not say so`);
      if (n.includes("did not settle")) bad.push(`${k}/${payload}: settled note claims it did not`);
    } else {
      if (!n.includes("did not settle")) bad.push(`${k}/${payload}: oscillating note does not say so`);
      if (n.includes("treat it as good")) bad.push(`${k}/${payload}: oscillating note calls it good`);
    }
    if (!n.includes("mm")) bad.push(`${k}/${payload}: note gives no magnitude`);
  }
  check(bad.length === 0, "the note distinguishes a settled cycle from a real oscillation",
    bad.length ? bad.join("; ") : `${notConv.length} note(s) read`);
}

/* ── 7. A CONVERGED SOLVE STILL SAYS WHAT IT HELD ─────────────────── */
{
  const bad = converged.filter(({ r }) => !/lb\/ft\^2/.test(r.note)).map((x) => x.k);
  check(bad.length === 0, "a converged solve names the disk loading it held",
    bad.length ? bad.join(", ") : `${converged.length} note(s)`);
}

console.log("");
console.log("=".repeat(78));
if (fails.length) {
  console.log(`ROTOR DIAMETER SOLVE GATE FAILED — ${fails.length} check(s)`);
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(`ROTOR DIAMETER SOLVE GATE PASSED (${results.length} solves, `
  + `${converged.length} converged, ${notConv.length} reported as not)`);
