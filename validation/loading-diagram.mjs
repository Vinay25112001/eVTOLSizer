/* =====================================================================
   LOADING DIAGRAM GATE — B3 of BALANCE-AND-TAIL.md section 4.2
   =====================================================================
   The module under test turns a continuum cabin into a cabin with seats,
   holds and tanks, then loads it by GASP's rules and Scholz's orders.
   This gate asks three different kinds of question, and it is worth
   saying which is which, because they carry different weight:

   EXTERNAL REPRODUCTION — a published number this code did not produce.
   Scholz's seats-abreast correlation must return the 4 that Nita's ATR 72
   study published for 70 passengers. The seat pitches must be the Aviary
   deck's own defaults. The CG limits must be the L-1011's and the Cessna
   172S's as the research note converted them. None of these come from
   this codebase and none can be made to agree by adjusting it.

   ALGEBRAIC FALSIFICATION — a property that must hold for any correct
   implementation and fails loudly for a wrong one. A moment sum cannot
   depend on the ORDER the masses are added in, so all six of Scholz's
   loading sequences must arrive at the same gram and the same millimetre.
   Simpson's rule must be EXACT on the tank integrand, because that
   integrand is a cubic and Simpson integrates cubics exactly — so the
   tank station is not an approximation and an analytic case proves it.
   The design condition must weigh exactly MTOW.

   REFUSALS — the module must decline to answer where it has nothing to
   answer with, and say why. No baggage means no maximum-baggage
   condition, not a maximum-baggage condition that reports the empty
   aeroplane. Unsourced spars must be declared on the three classes whose
   spars are unsourced and not on the one whose are measured.

   WHAT THIS GATE DELIBERATELY DOES NOT ASSERT. It does not claim the
   envelope matches a certificated one. It does not: the transport and
   turboprop load OUTSIDE the L-1011 envelope under GASP's own rules, and
   that is checked as a reported finding rather than hidden. The cause is
   a criterion mismatch — balance.js places the wing to put the OPERATING
   EMPTY CG on target, while GASP places it to put the FORWARD LOADED CG
   on the forward limit — and closing it is B2's and B5's work. A gate
   that asserted agreement here would be asserting something no source
   claims and this code does not do.
   ===================================================================== */
import * as E from "../src/classes/aircraft/engine.js";
import { balanceOf } from "../src/classes/aircraft/balance.js";
import {
  SEAT_PITCH_M, seatsAbreast, ABREAST_FLOOR, HOLD, GASP_FIGURES,
  CG_LIMITS_BY_CLASS, fuelTanks, cargoHolds, seatGrid,
} from "../src/classes/aircraft/loading-diagram.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const pct = (x) => `${(100 * x).toFixed(1)} %`;
const IN = 0.0254;

const TYPES = ["transport", "bizjet", "turboprop", "trainer"];
const RES = Object.fromEntries(TYPES.map((t) => [t, E.designAircraft({ type: t })]));
const BAL = Object.fromEntries(TYPES.map((t) => [t, balanceOf(RES[t])]));
const LD = Object.fromEntries(TYPES.map((t) => [t, BAL[t].loadingDiagram]));

console.log("LOADING DIAGRAM GATE");
console.log("=".repeat(78));

/* ── 1. THE SOURCED CONSTANTS, AGAINST THEIR SOURCES ──────────────────
   CABIN-LAYOUT.md section 2.1. If any of these drifts, every station
   downstream of it drifts silently, so they are pinned to the digit. */
console.log("\n1. The sourced constants");
{
  check(near(SEAT_PITCH_M.economy, 32 * IN, 1e-12)
     && near(SEAT_PITCH_M.business, 39 * IN, 1e-12)
     && near(SEAT_PITCH_M.first, 61 * IN, 1e-12),
    "seat pitch is the Aviary deck's own defaults, to the inch",
    `economy ${(SEAT_PITCH_M.economy / IN).toFixed(0)} in, business ${(SEAT_PITCH_M.business / IN).toFixed(0)} in, `
    + `first ${(SEAT_PITCH_M.first / IN).toFixed(0)} in — Aviary variable_meta_data.py SEAT_PITCH_*; `
    + "Airbus AC A320 2-4-1 p.3 confirms economy independently");

  check(HOLD.baggageDensityKgM3 === 170 && HOLD.cargoDensityKgM3 === 160,
    "baggage and cargo densities are Torenbeek's, as Scholz reproduces them",
    "170 and 160 kg/m^3 — Scholz Ch.6 p.6-10, attributing [TORENBEEK 88]");

  check(HOLD.kHoldLength >= 0.35 && HOLD.kHoldLength <= 0.55,
    "the hold-length fraction is inside Scholz's own band",
    `k_CARGO = ${HOLD.kHoldLength} against eq. (6.4)'s "between 0.35 and 0.55"`);

  check(GASP_FIGURES.minFuelTurbineFracOfWingCapacity === 0.20
     && GASP_FIGURES.paxMassExtremesLb === 170 && GASP_FIGURES.paxMassDesignLb === 200,
    "GASP's own figures are carried verbatim, for reporting beside this tool's",
    "20 % of wing capacity for minimum fuel (V.1.3.6); 170 lb per passenger for the extremes and 200 lb for "
    + "the design case (section 2.1(b) UWPAX row)");
}

/* ── 2. EXTERNAL REPRODUCTION: Scholz eq. (6.1) against Nita ──────────
   CABIN-LAYOUT.md section 1.1 confirms the radical NUMERICALLY, because
   pdftotext drops the radical sign and `0.45 * nPAX` also "reads" as an
   equation. Nita's ATR 72 study states 70 passengers and then publishes
   the answer: "The result is 3.76, which means a number of 4 passengers
   per row". This check is that published answer, not this code's. */
console.log("\n2. Seats abreast reproduces a published application of the correlation");
{
  const raw70 = 0.45 * Math.sqrt(70);
  check(near(raw70, 3.7650, 5e-5) && seatsAbreast(70) === 4,
    "Scholz eq. (6.1) returns Nita's published 3.76 and rounds to her 4 abreast",
    `0.45*sqrt(70) = ${raw70.toFixed(4)} -> ${seatsAbreast(70)} abreast, against "The result is 3.76, which `
    + "means a number of 4 passengers per row\" — HAW-Nita-2008 ATR 72 design studies, eq. (4.1.1)");

  /* THE RADICAL IS THE POINT. Without it the same call returns 32
     abreast for the ATR 72, so this check is what stops a silent
     re-reading of the mangled PDF text from passing. */
  check(Math.round(0.45 * 70) !== seatsAbreast(70),
    "the correlation uses the square root, not the linear form the PDF text extracts as",
    `0.45*70 = ${(0.45 * 70).toFixed(1)} abreast would be the linear reading; the radical gives `
    + `${seatsAbreast(70)}, and only the radical reproduces Nita`);

  /* The note's own tabulated values, which are a second independent
     statement of the same equation inside the research. */
  const tab = [[96, 4.4], [150, 5.5], [180, 6.0], [300, 7.8], [440, 9.4]];
  check(tab.every(([n, v]) => near(0.45 * Math.sqrt(n), v, 0.05)),
    "the correlation reproduces every value the research note tabulates for it",
    tab.map(([n, v]) => `${n}->${(0.45 * Math.sqrt(n)).toFixed(1)}/${v}`).join(", "));

  check(seatsAbreast(4) === ABREAST_FLOOR && 0.45 * Math.sqrt(4) < ABREAST_FLOOR,
    "the correlation is floored rather than believed where it returns less than a pair of seats",
    `0.45*sqrt(4) = ${(0.45 * Math.sqrt(4)).toFixed(2)} on a four-occupant cabin, raised to the declared `
    + `floor of ${ABREAST_FLOOR}: Scholz calls eq. (6.1) an initial guess and fits it to airliners`);
}

/* ── 3. THE CG LIMITS ARE THE TWO PUBLISHED ENVELOPES ─────────────────
   BALANCE-AND-TAIL.md section 5 gap 5: "Only DC-9-80 (via CR-166138) and
   L-1011 (via CR-172278) give %MAC ranges." So there are exactly two,
   and the numbers must be theirs. */
console.log("\n3. The CG limits are the published envelopes, and say whose they are");
{
  const t = CG_LIMITS_BY_CLASS.transport, tr = CG_LIMITS_BY_CLASS.trainer;
  check(near(t.fwd, 0.12, 1e-12) && near(t.aft, 0.35, 1e-12) && /L-1011/.test(t.from),
    "the transport limits are the L-1011's 12 % to 35 % MAC, attributed",
    `${pct(t.fwd)} to ${pct(t.aft)} — ${t.from}`);

  /* Converted in section 3.2 from TCDS 3A12: MAC 58.8 in, MAC leading
     edge 25.9 in aft of datum, forward limit 35.0 in, aft limit 47.3 in.
     Recomputed here from those four raw numbers, so the conversion is
     checked and not just the result. */
  const fwd = (35.0 - 25.9) / 58.8, aft = (47.3 - 25.9) / 58.8;
  check(near(tr.fwd, fwd, 5e-4) && near(tr.aft, aft, 5e-4) && /172S|3A12/.test(tr.from),
    "the trainer limits recompute from the Cessna 172S TCDS's own inches",
    `(35.0-25.9)/58.8 = ${pct(fwd)} and (47.3-25.9)/58.8 = ${pct(aft)} against the module's `
    + `${pct(tr.fwd)} and ${pct(tr.aft)} — FAA TCDS 3A12`);

  check(TYPES.every((k) => /CR-172278|3A12/.test(CG_LIMITS_BY_CLASS[k].from))
     && /no business jet envelope is published/.test(CG_LIMITS_BY_CLASS.bizjet.from)
     && /no turboprop envelope is published/.test(CG_LIMITS_BY_CLASS.turboprop.from),
    "the two classes borrowing another aircraft's envelope say that they are borrowing it",
    "the bizjet and turboprop carry the L-1011 limits and declare that no envelope for their own class is "
    + "published in per cent MAC");
}

/* ── 4. ALGEBRAIC FALSIFICATION: the moment sum cannot know the order ──
   Scholz's whole point in listing six sequences is that the PATH differs.
   The END cannot: a sum of masses times stations is commutative. If two
   orders disagree on the final CG, the accumulator is wrong. */
console.log("\n4. All six of Scholz's loading orders arrive at the same aeroplane");
{
  for (const type of TYPES) {
    const L = LD[type];
    const byDir = {};
    for (const p of L.paths) (byDir[p.direction] ??= []).push(p.path[p.path.length - 1]);
    const dirs = Object.entries(byDir);
    /* To ROUND-OFF, not to the bit: adding 34 masses in six different
       orders is six different floating-point summations, and IEEE
       addition is not associative. The transport's totals differ by a few
       ulp of 78 800 kg, which is about 1e-10 kg, and a string comparison
       at nine decimals called that a failure. The physical claim is that
       the orders agree to far better than any quantity here is known to,
       so the tolerances are micrograms and nanometres. */
    const spread = (ends, key) => Math.max(...ends.map((q) => q[key])) - Math.min(...ends.map((q) => q[key]));
    const ok = dirs.every(([, ends]) => ends.length === 6
      && spread(ends, "x") < 1e-9 && spread(ends, "massKg") < 1e-6);
    check(ok, `${type}: six orders, one destination`,
      dirs.map(([d, ends]) => `${d}: ${ends.length} orders -> ${ends[0].massKg.toFixed(1)} kg at `
        + `${ends[0].x.toFixed(4)} m, spreading ${(1e9 * spread(ends, "x")).toFixed(2)} nm and `
        + `${(1e9 * spread(ends, "massKg")).toFixed(2)} ug`).join("; "));
  }

  /* And the paths must actually DIFFER on the way, or the six orders are
     being computed but not distinguished — which would make the check
     above pass for the wrong reason. */
  const L = LD.transport;
  const sigs = new Set(L.paths.map((p) => p.path.map((q) => q.x.toFixed(6)).join(",")));
  check(sigs.size === L.paths.length,
    "the twelve paths are twelve distinct curves, not one curve computed twelve times",
    `${sigs.size} distinct traces from ${L.paths.length} paths — if these collapsed, the check above would `
    + "pass vacuously");

  check(L.paths.every((p) => p.path.every((q, i, a) => i === 0 || q.massKg >= a[i - 1].massKg - 1e-9)),
    "mass only ever increases along a loading path",
    `${L.paths.length} paths, ${L.paths.reduce((t, p) => t + p.path.length, 0)} points`);
}

/* ── 5. THE FUEL FILL DIRECTION MUST MATTER, AND MUST STOP MATTERING ──
   Two opposite predictions from one model, which is what makes this a
   test rather than an observation: with the tanks part full the fill
   ORDER moves the final CG, and with them brim full it cannot, because
   there is then only one possible distribution. The trainer's mission
   fuel equals its capacity, so it is the brim-full case. */
console.log("\n5. Partial tanks make the fill order matter; full tanks cannot");
{
  const spread = (type) => {
    const L = LD[type];
    const f = L.paths.find((p) => p.direction === "filled from the front").path.at(-1);
    const a = L.paths.find((p) => p.direction === "filled from the back").path.at(-1);
    return { mm: 1e3 * (a.x - f.x), frac: RES[type].fuelKg / RES[type].fuelCapacityKg };
  };
  const tr = spread("trainer"), tp = spread("transport");
  check(tr.frac > 0.999 && Math.abs(tr.mm) < 1e-6,
    "the trainer's tanks are brim full, so the two fill directions cannot differ",
    `mission fuel is ${(100 * tr.frac).toFixed(1)} % of capacity; fill-direction spread `
    + `${tr.mm.toFixed(6)} mm`);
  check(tp.frac < 0.999 && Math.abs(tp.mm) > 1,
    "the transport's tanks are part full, so the fill direction moves the centre of gravity",
    `mission fuel is ${(100 * tp.frac).toFixed(1)} % of capacity; fill-direction spread `
    + `${tp.mm.toFixed(1)} mm`);
}

/* ── 6. THE TANK STATION IS EXACT, NOT APPROXIMATE ────────────────────
   The volume-weighted centroid integrand is (x_LE(y) + m*c(y)) * c(y)^2
   with x_LE linear in y and c linear in y — a CUBIC. Simpson's rule is
   exact for cubics, so the module's tank station carries no quadrature
   error at all. That is a strong claim and it is checked against an
   analytic case rather than asserted: an untapered, unswept wing must
   put its tank centroid exactly at ((front+rear)/2)*chord aft of the
   root leading edge, and a tapered swept one must match a closed-form
   integration done independently here. */
console.log("\n6. The tank centroid is exact, checked against closed form");
{
  /* (a) untapered, unswept: the answer is obvious and must be hit exactly. */
  const flat = fuelTanks({
    type: "transport", xWingRootLE: 10, rootChord: 4, tipChord: 4, span: 20,
    tanLeSweep: 0, fuselageWidthM: 4, wingFuelKg: 1000, fuselageFuelKg: 0,
  });
  const expectFlat = 10 + ((0.10 + 0.60) / 2) * 4;
  check(near(flat.wholeTankX, expectFlat, 1e-12),
    "an untapered unswept box puts its tank centroid exactly at the mid-spar chord station",
    `${flat.wholeTankX.toFixed(12)} m against the exact ${expectFlat} m`);

  /* (b) tapered and swept, integrated independently by fine Simpson on a
     different subdivision. Agreement to 1e-10 on a cubic integrand is
     the exactness claim, not a tolerance. */
  const g = { xRootLE: 7.5, rootChord: 6.0, tipChord: 1.5, semiSpan: 17.0, tanLeSweep: Math.tan(0.5),
              front: 0.10, rear: 0.60 };
  const mid = (g.front + g.rear) / 2;
  const c = (y) => g.rootChord + (g.tipChord - g.rootChord) * (y / g.semiSpan);
  const le = (y) => g.xRootLE + y * g.tanLeSweep;
  let num = 0, den = 0, N = 4000, h = g.semiSpan / N;
  for (let i = 0; i < N; i++) {
    const y0 = i * h, y1 = (i + 1) * h, ym = (y0 + y1) / 2;
    const F = (y) => (le(y) + mid * c(y)) * c(y) ** 2, G = (y) => c(y) ** 2;
    num += (h / 6) * (F(y0) + 4 * F(ym) + F(y1));
    den += (h / 6) * (G(y0) + 4 * G(ym) + G(y1));
  }
  const reference = num / den;
  const swept = fuelTanks({
    type: "transport", xWingRootLE: g.xRootLE, rootChord: g.rootChord, tipChord: g.tipChord,
    span: 2 * g.semiSpan, tanLeSweep: g.tanLeSweep, fuselageWidthM: 3.8,
    wingFuelKg: 20000, fuselageFuelKg: 0,
  });
  check(near(swept.wholeTankX, reference, 1e-10),
    "a tapered swept box matches a 4000-panel independent integration to 1e-10",
    `module ${swept.wholeTankX.toFixed(12)} m, reference ${reference.toFixed(12)} m, difference `
    + `${Math.abs(swept.wholeTankX - reference).toExponential(2)} m — Simpson is exact on this cubic, so `
    + "the tank station carries no quadrature error");

  /* (c) the three-tank split must reproduce the one-tank centroid when
     every tank is full, or the split is not a bookkeeping device but a
     change of answer. */
  check(TYPES.every((t) => Math.abs(LD[t].fuel.splitSensitivityM) < 1e-9),
    "the three-tank split reproduces the single-tank centroid when the tanks are full, on every class",
    TYPES.map((t) => `${t} ${(1e6 * LD[t].fuel.splitSensitivityM).toFixed(2)} um`).join(", ")
    + " — so the convention orders the partial fills and changes nothing else");
}

/* ── 7. SWEEP MUST SPREAD THE TANKS, AND ZERO SWEEP MUST NOT ──────────
   A physical prediction with a sign: on a swept wing the outboard tank
   lies AFT of the inboard one, by yMac-like geometry; on an unswept wing
   the three stations collapse toward one another. The turboprop's wing
   is unswept in the deck, the transport's is at 25 degrees. */
console.log("\n7. Sweep spreads the tanks aft; zero sweep collapses them");
{
  const tx = (type) => LD[type].fuel.tanks.map((k) => k.x);
  const [tc, ti, to] = tx("transport");
  check(to > ti && ti > tc,
    "the transport's tanks step aft from centre to outboard, as a 25-degree sweep demands",
    `centre ${tc.toFixed(2)} m, inboard ${ti.toFixed(2)} m, outboard ${to.toFixed(2)} m — `
    + `outboard is ${(to - tc).toFixed(2)} m aft of centre`);

  const [pc, , po] = tx("turboprop");
  check(Math.abs(po - pc) < 0.2,
    "the unswept turboprop's tank stations sit within 0.2 m of one another",
    `centre ${pc.toFixed(2)} m, outboard ${po.toFixed(2)} m, spread ${Math.abs(po - pc).toFixed(3)} m — `
    + "an unswept box has nowhere to step to, and taper alone moves it only slightly forward");

  /* SWEEP AND TAPER BOTH MOVE THE OUTBOARD TANK, IN OPPOSITE DIRECTIONS,
     and an earlier version of this check missed that: it asked for the
     spread to collapse to near zero when the sweep term was switched off,
     and on a taper-0.23 wing the unswept spread is -1.07 m, not 0.
     Taper alone carries the outboard tank FORWARD, because the mid-spar
     point of a shrinking chord sits closer to the leading edge. So the
     clean prediction is not about magnitude but about the DERIVATIVE:
     hold one planform and raise the sweep, and the spread must increase,
     every time, with taper's contribution constant throughout. */
  const base = { type: "transport", xWingRootLE: 11.7, rootChord: 6.0, tipChord: 1.4, span: 35.2,
                 fuselageWidthM: 3.8, wingFuelKg: 20000, fuselageFuelKg: 0 };
  const spreadAt = (deg) => {
    const k = fuelTanks({ ...base, tanLeSweep: Math.tan((deg * Math.PI) / 180) }).tanks;
    return k[2].x - k[0].x;
  };
  const sweeps = [0, 5, 10, 15, 20, 25, 30, 35];
  const vals = sweeps.map(spreadAt);
  const monotone = vals.every((v, i) => i === 0 || v > vals[i - 1]);
  check(monotone && vals[0] < 0 && vals.at(-1) > 0,
    "raising the sweep on one fixed planform moves the outboard tank aft every time, and taper alone moves it forward",
    `${sweeps.map((d, i) => `${d}deg ${vals[i].toFixed(2)}`).join(", ")} m — monotone in sweep, and the `
    + "unswept value is NEGATIVE because a shrinking chord carries its own mid-spar point forward");

  /* And the sweep contribution must be the geometric one: the tank
     centroids are separated in y by a known amount, so raising sweep by
     dLambda must move the spread by (dy)*d(tan Lambda) and nothing else. */
  const dSpread = spreadAt(30) - spreadAt(0);
  const dTan = Math.tan((30 * Math.PI) / 180);
  const dyEff = dSpread / dTan;
  check(dyEff > 0 && dyEff < 35.2 / 2,
    "the sweep contribution is a lever arm in y, and that arm lies inside the semi-span",
    `d(spread)/d(tan sweep) = ${dyEff.toFixed(2)} m, which is the y separation of the outboard and centre tank `
    + `centroids, inside the ${(35.2 / 2).toFixed(2)} m semi-span as it must be`);
}

/* ── 8. THE MASSES MUST CLOSE ON THE AEROPLANE THE TOOL SIZED ─────────
   This is what caught the empty-weight margin. The design load condition
   is every seat that is paid for, every hold loaded and the mission fuel
   aboard, so it must weigh MTOW — to the gram, on every class. */
console.log("\n8. The loading closes on the sized aeroplane");
{
  for (const type of TYPES) {
    const d = LD[type].gasp.conditions.find((c) => c.id === "V.1.3.5");
    check(near(d.massKg, RES[type].mtowKg, 1e-6 * RES[type].mtowKg),
      `${type}: the design load condition weighs exactly MTOW`,
      `${d.massKg.toFixed(3)} kg against ${RES[type].mtowKg.toFixed(3)} kg, difference `
      + `${(d.massKg - RES[type].mtowKg).toExponential(2)} kg`);
  }

  check(TYPES.every((t) => LD[t].payload.closes),
    "the payload build-up reproduces the sized payload on all four classes",
    TYPES.map((t) => `${t} ${LD[t].payload.builtKg.toFixed(1)}/${LD[t].payload.sizedKg.toFixed(1)}`).join(", ")
    + " — passengers carried times mass per passenger, plus baggage, plus cargo");

  /* THE MOMENT SUM MUST NOW COVER THE WHOLE OPERATING EMPTY WEIGHT. It
     did not: the transport's FLOPS empty-weight margin is a scalar with
     no component behind it, so 207 kg had no station and the sum was
     0.475 % short. The residual item closes it. */
  for (const type of TYPES) {
    const b = BAL[type];
    const sumM = b.items.reduce((t, i) => t + i.kg, 0);
    const sumMx = b.items.reduce((t, i) => t + i.kg * i.x, 0);
    check(near(sumM, RES[type].oewKg, 1e-6 * RES[type].oewKg) && near(sumMx / sumM, b.oew.xM, 1e-9),
      `${type}: the moment sum covers the reported operating empty weight, not just the itemised part`,
      `${sumM.toFixed(2)} kg of a reported ${RES[type].oewKg.toFixed(2)} kg`
      + (b.items.some((i) => i.residual)
        ? `, including a ${b.items.find((i) => i.residual).kg.toFixed(1)} kg unitemised residual`
        : ", with nothing unitemised"));
  }

  /* And the residual must be CG-NEUTRAL, which is the whole reason it is
     allowed to be placed by assumption: the wing placement still lands
     the operating empty CG exactly on its target. */
  check(TYPES.every((t) => near(BAL[t].oew.pctMac, BAL[t].targetCgPctMac, 1e-9)),
    "adding the unitemised residual moves the operating empty centre of gravity by exactly nothing",
    TYPES.map((t) => `${t} ${(100 * BAL[t].oew.pctMac).toFixed(6)} %`).join(", ")
    + " against a 25.000000 % target — a mass placed at a mean cannot move that mean");

  check(BAL.transport.items.some((i) => i.residual) && !BAL.turboprop.items.some((i) => i.residual),
    "the residual appears only where the weight model actually leaves one",
    "the transport deck carries emptyMarginFraction 0.00514; the turboprop, bizjet and trainer carry none, "
    + "and get no residual item rather than a zero-mass one");
}

/* ── 9. GASP'S RULES MUST SELECT WHAT THEY SAY THEY SELECT ────────────
   "All seats forward of FCGLIM are [filled] by passengers." So no seat
   aft of FCGLIM may appear in the forward condition, and every seat
   forward of it must. A rule that loaded the whole cabin would still
   produce a plausible CG, so this checks the SELECTION, not the answer. */
console.log("\n9. The forward and aft conditions select by the limit they name");
{
  for (const type of ["transport", "turboprop"]) {
    const L = LD[type];
    const fwdCond = L.gasp.conditions.find((c) => c.id === "V.1.3.3");
    const aftCond = L.gasp.conditions.find((c) => c.id === "V.1.3.4");
    const fwdSeats = L.seats.rows.filter((r) => r.x <= L.gasp.fcglim).reduce((t, r) => t + r.seats, 0);
    const aftSeats = L.seats.rows.filter((r) => r.x >= L.gasp.acglim).reduce((t, r) => t + r.seats, 0);
    check(fwdCond.nPaxLoaded === fwdSeats && aftCond.nPaxLoaded === aftSeats
       && fwdSeats > 0 && aftSeats > 0 && fwdSeats < L.seats.nPax && aftSeats < L.seats.nPax,
      `${type}: each condition loads exactly the seats on its own side of the limit`,
      `forward loads ${fwdCond.nPaxLoaded} of ${L.seats.nPax} seats (those at or forward of `
      + `${L.gasp.fcglim.toFixed(2)} m), aft loads ${aftCond.nPaxLoaded} (those at or aft of `
      + `${L.gasp.acglim.toFixed(2)} m) — a partial cabin both times, not the whole one`);
  }

  /* Minimum fuel must be 20 % of capacity and must be LESS than the
     mission fuel, or the condition is not the light-fuel case it claims. */
  for (const type of TYPES) {
    const L = LD[type];
    check(near(L.gasp.minFuelKg, 0.20 * RES[type].fuelCapacityKg, 1e-9),
      `${type}: minimum fuel for weight and balance is GASP's 20 % of capacity`,
      `${L.gasp.minFuelKg.toFixed(1)} kg of a ${RES[type].fuelCapacityKg.toFixed(1)} kg capacity`);
  }
}

/* ── 10. THE ENVELOPES MUST BOUND WHAT THEY CLAIM TO BOUND ────────────
   Two envelopes are reported and they answer different questions, so the
   narrower one must lie inside the wider one and the wider one must
   contain every point the module computed. */
console.log("\n10. The envelopes bound every point, and nest correctly");
{
  for (const type of TYPES) {
    const L = LD[type];
    const all = [...L.paths.flatMap((p) => p.path), ...L.boarding.frontWindowFirst,
                 ...L.boarding.rearWindowFirst,
                 ...L.gasp.conditions.filter((c) => c.available)].filter((q) => Number.isFinite(q.pctMac));
    const contained = all.every((q) => q.pctMac >= L.envelope.fwdPctMac - 1e-12
                                    && q.pctMac <= L.envelope.aftPctMac + 1e-12);
    const nested = L.boardingEnvelope.fwdPctMac >= L.envelope.fwdPctMac - 1e-12
                && L.boardingEnvelope.aftPctMac <= L.envelope.aftPctMac + 1e-12;
    check(contained && nested,
      `${type}: the full envelope contains all ${all.length} points and the boarding envelope nests inside it`,
      `full ${pct(L.envelope.fwdPctMac)}..${pct(L.envelope.aftPctMac)}, boarding `
      + `${pct(L.boardingEnvelope.fwdPctMac)}..${pct(L.boardingEnvelope.aftPctMac)}`);
  }

  /* ── DISCRETE AGAINST CONTINUUM, WITH THE SIGN PREDICTED BOTH WAYS ──
     The comparison has to be like for like, which two earlier versions of
     this check got wrong in two different ways. The TASOPT sweep is
     PASSENGERS ONLY AT ZERO FUEL by its own construction, so it must be
     compared against B3's passengers-only lobes, not against the full
     boarding envelope that also carries cargo and fuel.

     And the sign is NOT always the same, which is the interesting part.
     TASOPT's form is

         x_pay = x_cabin + l_cabin*(xi_pay - 1/2)*(1 - r_pay)

     in which r_pay does two jobs at once: it is how much payload is
     aboard AND, through the (1 - r_pay) factor, how long the lever is.
     The two are only the same thing in a cabin whose every seat is sold.

       EVERY SEAT FILLED -> the continuum is WIDER. At r_pay = 1 the
       centroid is pinned to x_cabin, so the extremes can only come from
       part-loads whose centroid runs out to the bulkheads, and a bulkhead
       is not a seat. Real rows are strictly inside that.

       MORE SEATS THAN PASSENGERS -> the continuum is NARROWER, and too
       narrow. Four passengers in a nine-seat cabin can sit in the front
       two rows: a FULL passenger load at the LONGEST lever. The continuum
       cannot represent that at all, because asking for the long lever
       forces r_pay down and throws away the mass.

     So the prediction is a sign that flips on `nCarried === nPax`, and
     both branches are asserted. A check that only knew one sign would
     have called the business jet a bug. */
  for (const type of TYPES) {
    const L = LD[type];
    const lobes = [...L.boarding.frontWindowFirst, ...L.boarding.rearWindowFirst]
      .filter((q) => Number.isFinite(q.pctMac));
    const lo = Math.min(...lobes.map((q) => q.pctMac)), hi = Math.max(...lobes.map((q) => q.pctMac));
    const disc = 100 * (hi - lo), cont = BAL[type].envelope.rangePctMac;
    const fullySeated = L.seats.nCarried === L.seats.nPax;
    check(fullySeated ? disc < cont : disc > cont,
      `${type}: the discrete cabin is ${fullySeated ? "narrower" : "wider"} than the continuum, as a `
      + `${fullySeated ? "fully seated" : "part-seated"} cabin requires`,
      `${disc.toFixed(1)} % MAC from ${pct(lo)} to ${pct(hi)}, against the continuum's ${cont.toFixed(1)} % `
      + `from ${pct(BAL[type].envelope.fwd.pctMac)} to ${pct(BAL[type].envelope.aft.pctMac)}; `
      + `${L.seats.nCarried} of ${L.seats.nPax} seats sold. `
      + (fullySeated
        ? `${(cont - disc).toFixed(1)} points of the continuum's range was payload at a bulkhead no seat occupies`
        : `the continuum understates by ${(disc - cont).toFixed(1)} points, because a full passenger load at the `
          + "forward rows is a loading its r_pay cannot express"));
  }

  /* THE TWO BOARDING BRANCHES MUST OCCUPY DIFFERENT SEATS, and the
     cleanest way to prove it is where they must NOT. Scholz's branches
     choose seats out of the whole cabin, so with four passengers in nine
     seats the front branch fills the front rows and the rear branch the
     BACK rows — different seats, therefore different final centres of
     gravity. Fill every seat and the two branches must converge on the
     same point, because a moment sum cannot depend on boarding order.

     This is the check that catches selecting a block of seats first and
     then merely re-sorting it: that version loads the SAME four seats
     both ways, so its lobes converge on the business jet too. The range
     comparison below does not catch it — both readings pass it — so
     without this check the surplus-seat model is untested. */
  {
    const endOf = (L, k) => L.boarding[k].at(-1);
    const bj = LD.bizjet, tp = LD.transport;
    const gapMac = (L) => Math.abs(endOf(L, "frontWindowFirst").x - endOf(L, "rearWindowFirst").x)
                        / BAL[L === bj ? "bizjet" : "transport"].mac;
    const bjGap = gapMac(bj), tpGap = gapMac(tp);
    /* Scale-free: a per-cent of MAC, not a distance, so the threshold
       does not quietly depend on how big the aeroplane is. The separation
       is 6.8 % MAC against an exact zero, so 1 % is a wide margin either
       side and the check is not a coin flip. */
    check(bjGap > 0.01 && tpGap === 0,
      "the two boarding branches occupy different seats when seats outnumber passengers, and the same seats when they do not",
      `business jet, ${bj.seats.nCarried} of ${bj.seats.nPax} seats sold: the branches end ${pct(bjGap)} MAC `
      + "apart, because one fills the front rows and the other the back. Transport, "
      + `${tp.seats.nCarried} of ${tp.seats.nPax} sold: exactly ${tpGap} apart, because with every seat filled `
      + "there is only one loading and boarding order cannot matter");
  }

  /* THE FLIP MUST BE CAUSED BY THE SEAT SURPLUS, not merely correlated
     with the business jet being a business jet. The mutation has to keep
     a VALID aeroplane: raising `passengersCarried` to 9 loads nine people
     against a payload the tool sized for four, which is a different (and
     broken) aircraft, and proves nothing. Removing the five empty seats
     instead leaves the payload, the mass and the mission untouched — the
     same four passengers, in a cabin with nowhere else to sit. */
  {
    const r = E.designAircraft({ type: "bizjet" });
    const trimmed = balanceOf({ ...r, raw: { ...r.raw, inputs: { ...r.raw.inputs, firstClass: 4 } } });
    const T = trimmed.loadingDiagram;
    const lobesOf = (L) => {
      const q = [...L.boarding.frontWindowFirst, ...L.boarding.rearWindowFirst]
        .filter((z) => Number.isFinite(z.pctMac)).map((z) => z.pctMac);
      return 100 * (Math.max(...q) - Math.min(...q));
    };
    const surplus = lobesOf(LD.bizjet), exact = lobesOf(T);
    const cont = BAL.bizjet.envelope.rangePctMac;
    check(T.seats.nPax === 4 && T.seats.nCarried === 4 && T.payload.closes
       && surplus > cont && exact < cont && exact < surplus,
      "taking the five empty seats out of the same business jet flips the sign back",
      `nine seats / four sold: ${surplus.toFixed(1)} % against a ${cont.toFixed(1)} % continuum. Four seats / `
      + `four sold, same payload (${T.payload.builtKg.toFixed(0)} kg, still closing): ${exact.toFixed(1)} %, `
      + "now narrower than the continuum. The seat surplus is the cause, not the class");
  }
}

/* ── 11. DELXCG, THE THING THE DOWNSTREAM PACKAGES ASKED FOR ──────────
   BALANCE-AND-TAIL.md line 264: "DELXCG - the required CG travel in MAC
   fractions - is the input to tail sizing". It must be the gap between
   the two GASP conditions, in MAC fractions, and it must be positive. */
console.log("\n11. DELXCG is computed and is the gap between the two GASP conditions");
{
  for (const type of TYPES) {
    const L = LD[type], g = L.gasp.conditions;
    const f = g.find((c) => c.id === "V.1.3.3"), a = g.find((c) => c.id === "V.1.3.4");
    check(L.cgTravel.delxcg > 0 && near(L.cgTravel.delxcg, (a.x - f.x) / BAL[type].mac, 1e-12),
      `${type}: DELXCG is (aft loaded CG - forward loaded CG) / MAC`,
      `${pct(L.cgTravel.delxcg)} MAC from ${f.x.toFixed(3)} m and ${a.x.toFixed(3)} m over a `
      + `${BAL[type].mac.toFixed(3)} m chord`);
  }

  /* The wing-shift figure must point the way that closes the gap: if the
     forward loaded CG is FORWARD of FCGLIM, the wing must move AFT. */
  for (const type of ["transport", "turboprop"]) {
    const L = LD[type];
    const f = L.gasp.conditions.find((c) => c.id === "V.1.3.3");
    check(f.x < L.gasp.fcglim && L.cgTravel.wingShiftForFwdLimitM > 0,
      `${type}: the forward loading sits ahead of FCGLIM, and the wing shift points aft`,
      `loaded ${f.x.toFixed(2)} m against FCGLIM ${L.gasp.fcglim.toFixed(2)} m, so ELWING must move `
      + `+${L.cgTravel.wingShiftForFwdLimitM.toFixed(2)} m — GASP's "ELWING = ELCGD(2) + (CPMRGN + .25 `
      + "- XCGFWD)*CBARW\"");
  }
}

/* ── 12. REFUSALS AND DECLARED CONVENTIONS ───────────────────────────
   The module must decline where it has nothing, and must name every
   convention it stands on. A silent convention is the failure mode this
   whole project is built against. */
console.log("\n12. What the module refuses, and what it declares");
{
  for (const type of ["bizjet", "trainer"]) {
    const c = LD[type].gasp.conditions.find((q) => q.id === "V.1.3.7");
    check(!c.available && /no baggage or cargo mass/.test(c.why),
      `${type}: the maximum-baggage condition is refused, with a reason, rather than reporting the empty aeroplane`,
      c.why);
  }
  for (const type of ["transport", "turboprop"]) {
    const c = LD[type].gasp.conditions.find((q) => q.id === "V.1.3.7");
    check(c.available && c.massKg > RES[type].oewKg,
      `${type}: the maximum-baggage condition is evaluated, because there is baggage to load`,
      `${c.massKg.toFixed(0)} kg against an operating empty ${RES[type].oewKg.toFixed(0)} kg`);
  }

  /* The unsourced spars must be declared on exactly the three classes
     whose spars wing-structure.js declares unsourced. */
  const warns = (t) => LD[t].caveats.some((c) => /spars on this class are not sourced/.test(c));
  check(!warns("transport") && warns("bizjet") && warns("turboprop") && warns("trainer"),
    "the unsourced-spar warning fires on exactly the three classes whose spars are not sourced",
    "the transport's are measured off the uCRM-9 (Brooks, Kenway & Martins 2018, Table 1); the other three "
    + "are declared assumptions in wing-structure.js and the warning is inherited rather than dropped");

  check(TYPES.every((t) => LD[t].caveats.some((c) => /begin "1\. pilot"/.test(c))),
    "the dropped pilot step is declared on every class, not silently skipped",
    "GASP's rules each begin \"1. pilot\" and the crew is already inside the operating empty weight on three "
    + "of four classes; the step is named as deliberately not repeated");

  check(TYPES.every((t) => LD[t].caveats.some((c) => /rules are GASP's; the masses are this tool's/.test(c))),
    "the substitution of this tool's passenger mass for GASP's 170 lb is stated on every class",
    "GASP's own figures stay in GASP_FIGURES for reporting; the loading uses the FLOPS inputs the aeroplane "
    + "was sized with, and says so");

  check(TYPES.every((t) => LD[t].caveats.some((c) => /three-tank split is a convention/.test(c))),
    "the tank split declares itself a convention and quotes what it is worth",
    "each class reports the millimetres between the split centroid and the single-tank centroid");

  /* THE EXCEEDANCE IS REPORTED AS A CRITERION MISMATCH, NAMED. This is
     the finding B3 exists to produce, and if it ever stops being said
     out loud the numbers become misleading. */
  for (const type of ["transport", "turboprop"]) {
    const c = LD[type].caveats.find((q) => /CRITERION MISMATCH/.test(q));
    check(!!c && /DELXCG/.test(c) && /B2 and B5/.test(c),
      `${type}: loading outside the published envelope is reported as a criterion mismatch, with the remedy named`,
      "the caveat states the forward and aft figures, the wing shift, DELXCG, and that moving the wing on "
      + "GASP's criterion is B2's and B5's work rather than this module's");
  }
  for (const type of ["bizjet", "trainer"]) {
    check(!LD[type].caveats.some((q) => /CRITERION MISMATCH/.test(q)),
      `${type}: no mismatch is claimed where the loading does comply`,
      LD[type].gasp.conditions.filter((c) => c.verdict).map((c) => `${c.id} ${c.verdict}`).join(", "));
  }
}

/* ── 13. THE SEAT GRID AGAINST THE CABIN IT HAS TO FIT ───────────────*/
console.log("\n13. The seat grid, and where it does not fit");
{
  check(LD.bizjet.seats.nPax === 9 && LD.bizjet.seats.nCarried === 4,
    "seats installed and passengers carried are kept apart, which the business jet needs",
    `${LD.bizjet.seats.nPax} seats fitted, ${LD.bizjet.seats.nCarried} carried — conflating them built a `
    + "817 kg payload for an aeroplane sized to carry 363 kg");

  check(TYPES.every((t) => LD[t].seats.nCarried <= LD[t].seats.nPax),
    "no class carries more passengers than it has seats",
    TYPES.map((t) => `${t} ${LD[t].seats.nCarried}/${LD[t].seats.nPax}`).join(", "));

  /* Rows must be ordered, at the right pitch, and premium forward. Each
     row sits at the centre of its own pitch, so a gap WITHIN a class is
     that class's pitch and the single gap ACROSS the first/economy
     boundary is the mean of the two — 46.5 in where a 61 in row meets a
     32 in one, which is what a real cabin does. */
  const L = LD.transport;
  const gaps = L.seats.rows.slice(1).map((r, i) => ({ g: r.x - L.seats.rows[i].x,
                                                      same: r.cls === L.seats.rows[i].cls,
                                                      want: r.cls === L.seats.rows[i].cls
                                                        ? r.pitchM : (r.pitchM + L.seats.rows[i].pitchM) / 2 }));
  check(gaps.every((q) => q.g > 0 && near(q.g, q.want, 1e-9))
     && L.seats.rows[0].cls === "first" && L.seats.rows.at(-1).cls === "economy"
     && gaps.filter((q) => !q.same).length === 1,
    "the transport's rows run forward to aft at their own class pitch, premium forward",
    `${L.seats.rows.length} rows: ${L.seats.blocks.map((b) => `${b.nRows} ${b.cls} at `
      + `${(b.pitchM / IN).toFixed(0)} in, ${b.abreast} abreast`).join("; ")}. One class boundary, and its `
    + `gap is ${(gaps.find((q) => !q.same).g / IN).toFixed(1)} in, the mean of 61 and 32`);

  /* Premium abreast must be Aviary's, not economy's. Getting this wrong
     shortened the seat block by 1.6 m and hid most of the overflow. */
  check(L.seats.blocks.find((b) => b.cls === "first").abreast === 4
     && L.seats.blocks.find((b) => b.cls === "economy").abreast === 6,
    "first class is four abreast and economy six, per class rather than one figure for the cabin",
    `first ${L.seats.blocks.find((b) => b.cls === "first").abreast}, economy `
    + `${L.seats.blocks.find((b) => b.cls === "economy").abreast} — Aviary NUM_SEATS_ABREAST_FIRST 4 and `
    + `_ECONOMY 6, and eq. (6.1) independently gives ${seatsAbreast(L.seats.nPax)} for economy on `
    + `${L.seats.nPax} passengers`);

  /* THE SEATS DO NOT FIT AND THE MODULE SAYS SO. The pressure shell is
     placed from drawing conventions that fuselage-structure.js declares
     as such; the seat pitch is sourced. Where they disagree the module
     keeps the sourced quantity and reports the conflict. */
  check(!L.seats.fitsCabin && L.seats.overflowM > 0
     && L.caveats.some((c) => /seats need .* of cabin at the sourced pitch/.test(c)),
    "the transport's seats overrun the drawn pressure shell, and that is reported rather than absorbed",
    `${L.seats.seatedLengthM.toFixed(2)} m of seats in a ${L.seats.cabinLengthM.toFixed(2)} m shell, `
    + `${L.seats.overflowM.toFixed(2)} m over — the pitch is sourced and the bulkhead stations are declared `
    + "drawing conventions by the module that sets them");

  check(["bizjet", "turboprop", "trainer"].every((t) => LD[t].seats.fitsCabin),
    "the other three classes seat their passengers inside their own shells",
    ["bizjet", "turboprop", "trainer"].map((t) =>
      `${t} ${LD[t].seats.seatedLengthM.toFixed(1)}/${LD[t].seats.cabinLengthM.toFixed(1)} m`).join(", "));
}

/* ── 14. THE HOLDS ────────────────────────────────────────────────────*/
console.log("\n14. The holds fill the room the shell leaves, to Scholz's fraction");
{
  const h = cargoHolds({ shellFwd: 5, shellAft: 28, boxFwd: 12, boxAft: 15, fuselageLengthM: 38 });
  const total = h.holds.reduce((t, k) => t + k.lengthM, 0);
  check(h.available && near(total, HOLD.kHoldLength * 38, 1e-9) && h.holds.length === 2,
    "two holds, and their total length is k_CARGO times the fuselage length",
    `${total.toFixed(2)} m against ${HOLD.kHoldLength} x 38 = ${(HOLD.kHoldLength * 38).toFixed(2)} m, `
    + `split ${h.holds.map((k) => `${k.id} ${k.lengthM.toFixed(2)} m at ${k.x.toFixed(2)} m`).join(", ")}`);

  check(h.holds[0].x < 12 && h.holds[1].x > 15,
    "the forward hold sits forward of the wing box and the aft hold aft of it",
    `forward at ${h.holds[0].x.toFixed(2)} m against a box front at 12 m; aft at `
    + `${h.holds[1].x.toFixed(2)} m against a box rear at 15 m`);

  const none = cargoHolds({ shellFwd: 12, shellAft: 15, boxFwd: 12, boxAft: 15, fuselageLengthM: 38 });
  check(!none.available && /no hold/.test(none.why),
    "a wing box that fills the shell yields no hold, and says so",
    none.why);

  /* Baggage and cargo must actually be in the holds and split by length. */
  const L = LD.transport;
  const holdMass = L.holds.reduce((t, k) => t + k.massKg, 0);
  check(near(holdMass, L.payload.bagKgTotal + L.payload.cargoKg, 1e-9) && L.holds.length === 2,
    "all baggage and cargo is in the holds, split between them by hold length",
    `${holdMass.toFixed(1)} kg = ${L.payload.bagKgTotal.toFixed(1)} kg baggage + `
    + `${L.payload.cargoKg.toFixed(1)} kg cargo, as `
    + L.holds.map((k) => `${k.id} ${k.massKg.toFixed(0)} kg`).join(" + "));
}

/* ── 15. THE ANALYTIC SWEEP IS STILL THERE AND STILL VALIDATED ────────
   B3 is built BESIDE the TASOPT sweep, not in place of it, because that
   sweep's critical load fractions reproduce Drela's own converged 737 run
   and that is a real external agreement. If B3 ever quietly replaced it,
   this fires. */
console.log("\n15. The TASOPT analytic sweep survives untouched");
{
  const e = BAL.transport.envelope;
  check(Array.isArray(e.loading) && e.loading.length > 0
     && Math.abs(e.fwd.rPay - 0.47) < 0.10 && Math.abs(e.aft.rPay - 0.44) < 0.10,
    "the analytic sweep still reproduces TASOPT's converged 737 load fractions",
    `forward ${e.fwd.rPay.toFixed(2)} against Drela's 0.47, aft ${e.aft.rPay.toFixed(2)} against 0.44 — `
    + "B3 is built beside this, not over it");

  check(/CONTINUUM/.test(e.basis) && /unrestricted bound, not a loading/.test(e.basis),
    "the analytic sweep now declares what it is, so the two envelopes cannot be confused",
    e.basis);

  check(TYPES.every((t) => LD[t].available),
    "the loading diagram is produced for every aircraft class",
    TYPES.map((t) => `${t} ${LD[t].paths.length} paths, ${LD[t].gasp.conditions.filter((c) => c.available).length}`
      + " of 5 GASP conditions").join("; "));
}

console.log("");
console.log(fails.length ? `LOADING DIAGRAM GATE FAILED: ${fails.length} check(s)`
                         : `LOADING DIAGRAM GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
