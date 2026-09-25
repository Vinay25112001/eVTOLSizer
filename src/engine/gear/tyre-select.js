/* =====================================================================
   G4 — TYRE SELECTION TO 14 CFR 25.733
   =====================================================================
   Pick the smallest tyre in the data book that satisfies every load rule
   the regulation imposes, for a given wheel arrangement.

   THE RULE IS THE ALGORITHM. 25.733 does not say "pick a tyre that can
   carry the load"; it says three separate things, and they do not reduce
   to one.

   [SRC] 14 CFR 25.733(a)(1) — main tyres, single wheel per axle: the
   rating must not be exceeded by "the loads on the main wheel tire,
   corresponding to the most critical combination of airplane weight (up
   to maximum weight) and center of gravity position".

   [SRC] 14 CFR 25.733(c)(1) — main tyres, MORE THAN ONE wheel per axle
   (dual, dual-tandem): the same loads "when multiplied by a factor of
   1.07". THE 1.07 IS NOT OPTIONAL AND IT IS NOT A SAFETY MARGIN SOMEBODY
   CHOSE. It is the regulation's allowance for unequal load sharing
   between the tyres on one axle, and it applies per axle, so it turns on
   wheels-per-axle and not on the total main-wheel count.

   [SRC] 14 CFR 25.733(b) — nose tyres, THREE conditions:
     (b)(1) static at max ramp weight       -> load <= 1.0 x rating
     (b)(2) 1.0 g down + 0.31 g fwd at MLW  -> load <= 1.5 x rating
     (b)(3) 1.0 g down + 0.20 g fwd at MRW  -> load <= 1.5 x rating
   The 1.5 on the two decelerating cases is the rule's, and it is why a
   nose tyre is not simply sized on its worst load: the worst load is
   allowed to exceed the rating, by a stated factor.

   [SRC] 14 CFR 25.733(a) also requires "a speed rating ... that is not
   exceeded under critical conditions". Checked when a lift-off speed is
   supplied, reported as unchecked when it is not — never silently passed.

   INFLATION PRESSURE. Goodyear data book introduction: for loads less
   than the maximum, the inflation pressure may be reduced proportionately.
   So the operating pressure is the rated inflation scaled by the load
   ratio, not the rated inflation itself. That matters because the
   pavement code below is decided by pressure.

   [SRC] FAA AC 150/5335-5C section 4.6.4, Table 4-2 — the pavement
   tyre-pressure code, which is the ONE pavement constraint a conceptual
   tool can enforce exactly:
       W  no pressure limit
       X  <= 254 psi
       Y  <= 181 psi
       Z  <=  73 psi

   WHAT THIS DELIBERATELY DOES NOT CLAIM. No ACN and no ACR. AC
   150/5335-5D section 3.1 makes the method Layered Elastic Analysis in
   FAA software (ICAO-ACR 1.3 / FAARFIELD 2.0), and the manufacturer
   publishes the official value. LANDING-GEAR.md section 5 gap 7 is
   explicit: "Do not promise a computed ACN." This module returns the
   pressure code, which is exact, and nothing that looks like an ACN.

   GA AND TRAINER AIRCRAFT ARE NOT LOAD-DRIVEN. LANDING-GEAR.md section 5
   gap 6, measured: the Cessna 172 main tyre runs at 69 % of its rating at
   42 psi. The binding criteria for light aircraft are flotation on
   unpaved ground and standardisation on a few sizes, not 23.733, and no
   primary flotation criterion for light aircraft could be obtained. So
   for that class this module sizes by a maximum allowable inflation
   pressure supplied by the caller, and says so in the result rather than
   reporting a load-driven answer it does not believe.
   ===================================================================== */

import { TYRES, TYRE_SOURCE } from "../../data/tyres.js";

export const MULTI_WHEEL_FACTOR = 1.07;   // [SRC] 14 CFR 25.733(c)(1)

/* [SRC] FAA AC 150/5335-5C Table 4-2. Ordered strongest constraint last so
   the first match is the least restrictive code the pressure qualifies for. */
export const PAVEMENT_CODES = Object.freeze([
  { code: "Z", maxPsi: 73,  label: "Low" },
  { code: "Y", maxPsi: 181, label: "Medium" },
  { code: "X", maxPsi: 254, label: "High" },
  { code: "W", maxPsi: Infinity, label: "Unlimited" },
]);

export function pavementCode(psi) {
  const p = Number(psi);
  if (!(p > 0)) return { code: null, why: "no inflation pressure" };
  const hit = PAVEMENT_CODES.find((c) => p <= c.maxPsi);
  return { code: hit.code, label: hit.label, maxPsi: hit.maxPsi, psi: p,
           src: "FAA AC 150/5335-5C Table 4-2" };
}

/* ⚠ WHAT 25.733 IS, AND WHAT IT IS NOT.

   The rule is a CONSTRAINT, not an optimiser. It says a rating "may not be
   exceeded" by the listed loads. It does not say which of the many tyres
   that satisfy it to fit, and real selection turns on things no sizing tool
   holds: speed rating against the actual V_LOF, retraction envelope, wheel
   and rim commonality with other types in the fleet, brake energy, and the
   operator's own margin policy.

   This was worth getting wrong once to learn. Checked against the 737-8,
   "smallest tyre that satisfies the rule" picks the 46x17.0R20 at 0.8 %
   margin, while Boeing fits the H44.5x16.5R21 at 5.7 %. BOTH COMPLY. The
   research note's worked example shows 45 613 lb <= 48 400 lb, which
   establishes that Boeing's tyre satisfies the rule -- not that the rule
   selects it. Those are different claims and only the first is provable.

   So this module exposes two things and keeps them distinct:
     verifyTyre()  the regulation: does THIS tyre comply? Provable.
     select*()     a tool convention: the lightest complying tyre, offered
                   as a starting point and labelled as a convention.
   A caller who has a tyre in mind should verify it rather than accept the
   suggestion. */

/* Tyres are emitted sorted by rated load, so the first satisfying row IS
   the smallest. Kept as an assertion rather than a comment because the
   search depends on it. */
const ASCENDING = TYRES.every((t, i) => i === 0 || TYRES[i - 1].loadLb <= t.loadLb);

/* THE REGULATION. Does a given tyre comply with every rule that applies to
   it? `demands` is [{ label, requiredRatingLb, src }], already divided by
   the tyre count and already divided by each rule's own limit factor. */
export function verifyTyre(tyre, demands, { liftOffMph = null } = {}) {
  if (!tyre) return { complies: false, why: "no tyre given" };
  const checks = (demands || []).map((d) => ({
    ...d,
    ratedLb: tyre.loadLb,
    marginLb: tyre.loadLb - d.requiredRatingLb,
    utilisation: d.requiredRatingLb / tyre.loadLb,
    ok: d.requiredRatingLb <= tyre.loadLb,
  }));
  const speed = liftOffMph == null
    ? { ok: null, why: "no lift-off speed supplied, so 25.733(a) speed rating is UNCHECKED" }
    : { ok: tyre.speedMph >= liftOffMph, ratedMph: tyre.speedMph, needMph: liftOffMph,
        src: "14 CFR 25.733(a)" };
  const worst = checks.length
    ? checks.reduce((a, b) => (b.utilisation > a.utilisation ? b : a)) : null;
  return {
    complies: checks.every((c) => c.ok) && speed.ok !== false,
    checks, speed, binding: worst,
    marginPct: worst ? 100 * (1 - worst.utilisation) : null,
  };
}

/* Smallest tyre meeting every predicate. `need` is in POUNDS. */
function smallestTyre(needLb, { maxPsi = Infinity, minSpeedMph = 0 } = {}) {
  if (!ASCENDING) {
    /* Defensive: if the generated file is ever re-sorted, fall back to a
       full scan by rated load rather than returning a wrong "smallest". */
    const ok = TYRES.filter((t) => t.loadLb >= needLb && t.psi <= maxPsi
                                && t.speedMph >= minSpeedMph);
    return ok.length ? ok.reduce((a, b) => (b.loadLb < a.loadLb ? b : a)) : null;
  }
  return TYRES.find((t) => t.loadLb >= needLb && t.psi <= maxPsi
                        && t.speedMph >= minSpeedMph) || null;
}

/* Operating pressure for a tyre carrying less than its rating. */
function operatingPsi(tyre, actualLoadLb) {
  const ratio = Math.min(1, actualLoadLb / tyre.loadLb);
  return { psi: tyre.psi * ratio, ratio,
           src: "Goodyear data book: inflation may be reduced proportionately "
              + "for loads below the maximum" };
}

/* ── main wheels ──────────────────────────────────────────────────────
   `mainLoadTotalLb` is the load on ALL main gears together, at the most
   critical weight and CG. */
export function selectMainTyre({
  mainLoadTotalLb, legs = 2, wheelsPerAxle = 2, liftOffMph = null, maxPsi = Infinity,
}) {
  const total = Number(mainLoadTotalLb);
  const n = legs * wheelsPerAxle;
  if (!(total > 0) || !(n > 0)) {
    return { resolved: false, why: "a main tyre needs a positive load and wheel count" };
  }
  const perTyre = total / n;
  const k = wheelsPerAxle > 1 ? MULTI_WHEEL_FACTOR : 1.0;
  const need = k * perTyre;
  const tyre = smallestTyre(need, { maxPsi, minSpeedMph: liftOffMph || 0 });
  if (!tyre) {
    return { resolved: false, needLb: need, legs, wheelsPerAxle,
             why: `no tyre in the data book is rated for ${Math.round(need)} lb`
                + (Number.isFinite(maxPsi) ? ` within ${maxPsi} psi` : "")
                + ". Increase the wheel count rather than accepting an overload." };
  }
  const op = operatingPsi(tyre, perTyre);
  return {
    resolved: true, tyre, legs, wheelsPerAxle, tyres: n,
    loadPerTyreLb: perTyre, multiWheelFactor: k, requiredRatingLb: need,
    marginLb: tyre.loadLb - need, utilisation: need / tyre.loadLb,
    operatingPsi: op.psi, ratedPsi: tyre.psi,
    pavement: pavementCode(op.psi),
    speedChecked: liftOffMph != null,
    src: k > 1 ? "14 CFR 25.733(c)(1)" : "14 CFR 25.733(a)(1)",
  };
}

/* ── nose wheels ──────────────────────────────────────────────────────
   `cases` is the array from groundLoads.noseTyreLoads(): each entry
   carries its own load and the limit factor its rule allows. */
export function selectNoseTyre({ cases, tyres = 2, liftOffMph = null, maxPsi = Infinity }) {
  const live = (cases || []).filter((c) => c.resolved);
  if (!live.length || !(tyres > 0)) {
    return { resolved: false, why: "a nose tyre needs at least one resolved load case" };
  }
  /* Each rule gives its own required rating; the binding one is the max.
     Doing it this way, rather than taking the largest LOAD, is the whole
     point: 25.733(b)(2) permits 1.5 x rating, so the largest load is not
     necessarily the largest requirement. */
  const demands = live.map((c) => ({
    label: c.label, src: c.src, loadLb: c.load / tyres,
    limitFactor: c.limitFactor,
    requiredRatingLb: c.load / tyres / c.limitFactor,
  }));
  const binding = demands.reduce((a, b) => (b.requiredRatingLb > a.requiredRatingLb ? b : a));
  const tyre = smallestTyre(binding.requiredRatingLb,
                            { maxPsi, minSpeedMph: liftOffMph || 0 });
  if (!tyre) {
    return { resolved: false, demands, binding,
             why: `no tyre in the data book is rated for `
                + `${Math.round(binding.requiredRatingLb)} lb` };
  }
  const staticCase = demands.find((d) => d.label === "static") || binding;
  const op = operatingPsi(tyre, staticCase.loadLb);
  return {
    resolved: true, tyre, tyres, demands, binding,
    marginLb: tyre.loadLb - binding.requiredRatingLb,
    utilisation: binding.requiredRatingLb / tyre.loadLb,
    operatingPsi: op.psi, ratedPsi: tyre.psi,
    pavement: pavementCode(op.psi),
    speedChecked: liftOffMph != null,
    src: "14 CFR 25.733(b)",
  };
}

/* ── light aircraft ───────────────────────────────────────────────────
   Sized by allowable inflation pressure, not by rated load. See the
   header: this is a DECLARED departure from the load-driven method,
   because no primary flotation criterion for light aircraft was
   obtainable and the measured evidence says the load rule does not bind. */
export function selectLightAircraftTyre({ loadPerTyreLb, maxPsi }) {
  const load = Number(loadPerTyreLb), cap = Number(maxPsi);
  if (!(load > 0) || !(cap > 0)) {
    return { resolved: false,
             why: "light-aircraft sizing needs a per-tyre load and a maximum "
                + "allowable inflation pressure" };
  }
  const tyre = smallestTyre(load, { maxPsi: cap });
  if (!tyre) {
    return { resolved: false,
             why: `no tyre carries ${Math.round(load)} lb at or below ${cap} psi` };
  }
  const op = operatingPsi(tyre, load);
  return {
    resolved: true, tyre, loadPerTyreLb: load,
    utilisation: load / tyre.loadLb,
    operatingPsi: op.psi, ratedPsi: tyre.psi,
    pavement: pavementCode(op.psi),
    sizedBy: "maximum inflation pressure",
    caveat: "Light-aircraft tyres are not load-driven: the measured Cessna 172 "
          + "main tyre runs at 69 % of its rating. No primary flotation "
          + "criterion for light aircraft was obtainable, so this selection is "
          + "bounded by pressure and is NOT a 23.733 load result.",
  };
}

export { TYRE_SOURCE };
