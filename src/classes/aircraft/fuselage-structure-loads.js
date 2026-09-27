/* =====================================================================
   FUSELAGE SHEAR FORCE AND BENDING MOMENT  —  Phase E, package F1
   =====================================================================
   `fuselage-structure.js` puts the SHELL inside the drawn body: frames,
   stringers, the pressure-shell boundary, the floor. This module puts
   the LOADS along it. They are deliberately separate files: one is
   geometry, the other is statics, and only the second one needs a load
   case.

   WHAT IS SOURCED, AND WHERE FROM

   MIT TASOPT 2.00 (Drela), Appendix A, "Fuselage Bending Loads". The
   same document this codebase already cites for Bredt-Batho torsion in
   the wing box (A.202), so it is established here as a primary, and its
   fuselage equations extract as text rather than needing a render.

     (A.70)  W_tail = W_htail + W_vtail + W_cone [+W_apu +W_eng]
     (A.71)  x_tail = the mass centroid of that lump
     (A.72)  L_hmax = q_NE S_h CL_hmax
     (A.74)  (M_h)_aero = r_Mh L_hmax (x_tail - x)          , x > x_wing
                          r_Mh L_hmax (x + x_tail - 2 x_wing), x < x_wing
     (A.77)  r_Mh ~= 0.4
     (A.79)  M_h(x) = N (sum W)/(2 l_shell) (x_shell2 - x)^2
                      + (N W_tail + r_Mh L_h) (x_tail - x)
     (A.80)-(A.83)  two load scenarios: max load factor at V_NE, and the
                    emergency landing impact with L_h = 0

   THE ONE REAL DECISION IN THIS FILE, AND WHY IT IS NOT TASOPT'S

   (A.79) assumes every fuselage weight is "uniformly distributed over
   the fuselage shell length l_shell". TASOPT assumes that because it has
   nothing better: it is sizing a fuselage it has not yet stationed.

   THIS TOOL HAS SOMETHING BETTER. `balance.js` has placed every mass
   item longitudinally since B2, with a recorded reason for each station,
   and `vertical-cg.js` has given each one a height. So the distributed
   term does not have to be smeared - it can be integrated over the
   stations the tool already owns.

   But NOT every item. balance.js gives each mass ONE station because a
   balance diagram needs only a centroid, and for bending that is right
   for a piece of equipment and wrong for the structure: it puts the
   whole shell at 0.4 L, beside the wing box, where it bends nothing.
   So the items (A.79) names as distributed - shell, lining, floor,
   seats, payload - are spread, and equipment keeps its station. The
   split is TASOPT's own list, set out at DISTRIBUTED_OVER_SHELL below.

   That leaves two independent routes to the same bending moment, and
   THAT IS THE POINT OF THIS MODULE'S GATE:

     STATIONED  the real stations, as a cantilever off the wing box -
                aft-end-inwards behind the wing, nose-outwards ahead of
                it, so the front fuselage is computed rather than
                mirrored.
     SMEARED    TASOPT (A.79) in closed form, fed the item list the
                source names and nothing else.

   Fed the SAME assumption - the named items uniform over l_shell, the
   tail lumped at x_tail - the stationed route must reproduce the closed
   form EXACTLY, and it does: the worst relative difference across the
   rear fuselage of three classes is 3e-16. That is what validates the
   load assembly, and it is a real check because the arithmetic is
   different: one sums spans and point arms station by station, the
   other evaluates a quadratic.

   Fed the REAL stations the two must NOT agree, and the residual is a
   result rather than an error. It runs +0.0 to +11.5 % across the three
   classes, and it is POSITIVE because the stationed route carries what
   (A.79) omits - the systems group, the crew and containerised cargo,
   2.2 to 4.9 tonnes of it, none of which appears in (A.79)'s
   distributed term.

   GETTING THAT SIGN RIGHT TOOK THREE CORRECTIONS, all of which the
   equivalence test caught and none of which any other check here would
   have: quadrature across a point load, quadrature across the shell
   boundary, and feeding the closed form items the source excludes. The
   first version reported the stationed route 38 % BELOW (A.79) and every
   part of that gap was a defect on this side of the comparison.

   WHAT IS NOT EVALUATED, AND SAYS SO

   The tail AIRLOAD term needs CL_hmax, and TASOPT states no value for
   it - the text says only "some assumed max-achievable lift
   coefficient". The corpus has 2-D section clmax for symmetric NACA
   sections, and using a 2-D clmax as a 3-D surface CL is the exact
   error this project already measured once on the high-lift work, where
   the 3-D case came out 42 % high. So CL_hmax is a declared input with
   NO DEFAULT. Without it the tail term is reported as not evaluated and
   the weight terms stand on their own. Not evaluated is not zero.

   The emergency-landing scenario (A.82) needs N_land. 14 CFR 25.561's
   inertia forces are NOT in this corpus - only cross-references to them
   from 25.785 - so that factor is a declared input too, with no
   default, and the scenario is skipped when it is absent.

   Neither omission is a load factor hiding in a class file: both are
   named so the load-factor source gate's scan sees them.

   W_cone IS MISSING FROM THE LUMP. (A.70) sums a separate tailcone
   weight into W_tail. This tool reports one "Fuselage" mass and does
   not split a cone out of it, so the lump here is the tails plus the
   APU plus aft-mounted engines, and the cone's share stays in the
   distributed term. That makes x_tail slightly further aft and W_tail
   slightly light. It is recorded in the caveats, not corrected.
   ===================================================================== */
import { balanceOf } from "./balance.js";
import { fuselageStructure } from "./fuselage-structure.js";
import { generalArrangement, macOf, sweepAtChordFractionRad } from "./geometry.js";
import { SPARS_BY_CLASS } from "./wing-structure.js";
import { flightEnvelope } from "./flight-envelope.js";
import { G0, RHO_MSL } from "../../engine/constants.js";

/* ── x_wing: WHERE THE TWO CANTILEVERS MEET ─────────────────────────
   TASOPT App. A, p.19 (extracted text lines 594-601): "The horizontal-
   axis moment Mh(x) distributions on the front and back bending
   fuselage are assumed to match at location xwing ... Theoretically
   this is the wing's net lift-weight centroid ... For simplicity it
   will be approximated as the wing's area centroid. Note that for a
   swept wing the wing box location xwbox will be centered somewhat
   ahead of xwing, but it will then also impart a pitch-axis moment at
   its location, so that the front and back Mh(x) distributions must
   still match at xwing."

   And how that centroid is placed, (A.136)-(A.137) with Figure A.6:
   the area centroid is taken ON THE SPAR-BOX AXIS, a straight line at
   chord fraction xi_ax with sweep Lambda; x_wbox is that axis at the
   centreline and Delta x_wing is the axis's aft offset at the spanwise
   area centroid, so x_wing = x_wbox + Delta x_wing. TASOPT.jl (commit
   884389c, example/defaults/default_input.toml line 231 and
   default_regional.toml line 220) sets "spar_box_x_c = 0.40 # spar box
   axis x/c location" for its own box, which is 0.50 c wide; Figure A.10
   draws the box centred on that axis.

   THIS TOOL HAS ITS OWN BOX. `SPARS_BY_CLASS` places the front and rear
   spars as chord fractions - the same box the loading diagram draws and
   F3 bridges - so the axis is the midline of THAT box, not TASOPT's
   value, and its `sourced` flag travels with the station. On the
   transport the spars are measured off a published cutaway; the other
   two Part 25 classes say NOT SOURCED and the caveat repeats it. For a
   straight-tapered planform the spanwise area centroid is the MAC
   station, so the closed form is x_wing = x_LEMAC + xi_ax * MAC; the
   gate rebuilds it from (A.136)'s integral instead and demands they
   agree exactly.

   WHAT THIS REPLACED, AND WHY THE EARLIER FINDING WAS WRONG. F1 first
   used balance.js's wing-group CG (GASP's CPMRGN offset aft of the
   LEMAC), and F3 then reported the peak as standing outside the wing
   box. That compared a station on the MAC against the box at the ROOT:
   on a swept wing the axis at the centroid IS aft of the root rear
   spar, by Delta x_wing less the axis-to-rear-spar part of the root
   chord, and the source says so in the sentence quoted above. On the
   transport the two definitions happen to coincide because the box
   midline and GASP's wing-CG fraction are the same number; that is a
   coincidence of two conventions, reported by the gate, not asserted. */
export function wingReactionStation({ bal, ga, type }) {
  const spars = SPARS_BY_CLASS[type] ?? SPARS_BY_CLASS.transport;
  const boxAxisChordFrac = 0.5 * (spars.front + spars.rear);
  const m = macOf({ area: ga.wing.area, span: ga.wing.span, taper: ga.wing.taper, sweepC4Deg: ga.wing.sweepDeg });
  const axisSweepRad = sweepAtChordFractionRad(ga.wing.sweepDeg, m.ar, ga.wing.taper, boxAxisChordFrac);
  /* (A.137) x_wbox: the axis at the centreline. This planform's root
     chord is at the centreline (no constant-chord centre box, TASOPT's
     eta_o = 0), so the axis starts at the root leading edge. */
  const xWbox = bal.xWingRootLE + boxAxisChordFrac * m.rootChord;
  /* (A.136) Delta x_wing = (2/S) Int c (y - y_o) tan(Lambda) dy, y_o = 0:
     the axis offset at the spanwise area centroid. For a trapezoid that
     centroid is y_MAC = (b/6)(1 + 2 lambda)/(1 + lambda). */
  const yCentroidM = m.yMac;
  const dxWing = yCentroidM * Math.tan(axisSweepRad);
  const xWing = xWbox + dxWing;
  return {
    xWing, xWbox, dxWing, boxAxisChordFrac, yCentroidM,
    axisSweepDeg: (axisSweepRad * 180) / Math.PI,
    boxAxisSourced: spars.sourced === true, boxAxisSource: spars.source,
    /* the two stations this replaced or was mistaken for, for the record */
    xWingCgM: bal.xWingCg, xAcWingM: bal.neutralPoint?.xAcWing ?? null,
    basis: "TASOPT (A.136)-(A.137) with Figure A.6: the spar-box axis at the wing's area centroid; the axis is "
         + "the midline of SPARS_BY_CLASS's box for this class",
  };
}

const KT = 0.514444;                 // m/s per knot

/* TASOPT (A.77). The inertial-relief factor: an impulsive tail load also
   angularly accelerates the aeroplane, and the resulting distributed
   inertia relieves part of the tail's static bending. 0.4 is the value
   the source states for the horizontal axis, and (A.76) gives the
   relation it comes from in terms of the fuselage and wing inertias -
   which this tool does not have, so the stated value is used and the
   relation is not reproduced. r_Mv is not used here: this module is the
   horizontal axis only. */
export const R_MH = 0.4;
export const R_MH_SOURCE =
  "MIT TASOPT 2.00 (Drela) Technical Description, Appendix A eq. (A.77), rMh ~= 0.4, the "
  + "inertial-relief factor for an impulsive horizontal-tail load evaluated just aft of the wing box";

/* The station grid. 161 points puts a node every ~0.25 m on a transport
   and makes the trapezoidal sum exact for the uniform-load case the gate
   compares against a closed form: under a uniform load the shear is
   linear, and the trapezoid rule is exact on a linear integrand. */
export const N_GRID = 161;

/* Which balance items are lumped into the tail, TASOPT (A.70). Engines
   are included only when they are NOT on the wing - balance.js puts
   aft-fuselage engines at 0.84 L with the fuselage group, and those DO
   load the aft fuselage. Wing-mounted engines travel with the wing and
   never appear in the fuselage item list at all. */
const TAIL_LUMP_NAMES = new Set([
  "Horizontal tail", "Vertical tail", "APU",
  "Engines", "Thrust reversers", "Engine controls and starters", "Fuel system", "Nacelles",
]);

/* WHICH ITEMS ARE GENUINELY DISTRIBUTED, and why this list is not a
   matter of taste.

   balance.js gives every mass item ONE station, because a balance
   diagram only needs a centroid. For bending that is fine for a piece
   of equipment and WRONG for the structure: it puts the whole fuselage
   shell - the single largest fuselage-group mass - at 0.4 L, a point a
   metre or two from the wing box, where it generates almost no bending
   moment. Smearing it over the shell, as TASOPT does, is better physics
   for that item, and the first version of this module was worse than
   TASOPT on exactly that point.

   So the item set is split, and the split follows the source's own
   list rather than intuition. (A.79)'s distributed term is
   W_pay + W_padd + W_shell + W_window + W_insul + W_floor + W_seat -
   structure, lining, floor and seats, all of which really do run the
   length of the cabin. Everything else in TASOPT is either W_fix (nose,
   excluded), W_tail (lumped at x_tail) or W_hpesys (a separate term
   that does not appear in A.79 at all), and all three stay as point
   loads at the stations balance.js computed.

   An item this tool reports but the list does not name stays a POINT
   LOAD at its own station and is listed in the result, so a new weight
   group cannot silently join the smear. */
const DISTRIBUTED_OVER_SHELL = new Set([
  "Fuselage",            // W_shell + W_window + W_floor: the shell itself
  "Paint",               // rides on the shell, so it is distributed with it
  "Furnishings",         // W_seat + W_padd
  "Passenger service",   // W_padd, galleys and linings along the cabin
  "Insulation",          // W_insul, if the weight model reports it separately
]);

const finite = (x) => (Number.isFinite(x) ? x : null);

/* ─────────────────────────────────────────────────────────────────────
   EXACT STATICS ON SPANS AND POINTS — why there is no quadrature here

   The first version of this module sampled the load onto the station
   grid as an intensity and integrated it trapezoidally, the way
   wing-structure.js integrates a lift distribution. That is right for a
   lift curve, which is smooth. It is WRONG for this load set, which is
   a sum of step functions and point loads, and the equivalence test
   against TASOPT (A.79) is what exposed it:

     - a point load makes the shear discontinuous, and the trapezoid
       across the step counts half of it: a constant n·dx/2 error in
       the moment at every station inboard of the load;
     - the distributed load ENDS at the shell bulkhead, and the cell
       straddling that end leaks w·dx/2 of load past it, which shows up
       as a constant shear excess and therefore an error growing
       LINEARLY with distance from the bulkhead.

   The second of those was 4.5 kN on the transport and left a 1.0-1.4 %
   floor in the comparison that looked like acceptable quadrature error
   and was not: it was load in the wrong place. Both vanish if the
   statics are done in closed form, which for piecewise-constant spans
   and point loads is elementary. So they are.
   ───────────────────────────────────────────────────────────────────── */

/* Shear and moment at x from everything AFT of it. */
function aftOf(x, spans, points) {
  let v = 0, m = 0;
  for (const s of spans) {
    const a = Math.max(x, s.x1), b = s.x2;
    if (b <= a) continue;
    v += s.wN * (b - a);
    m += (s.wN * ((b - x) ** 2 - (a - x) ** 2)) / 2;
  }
  for (const p of points) if (p.x > x) { v += p.n; m += p.n * (p.x - x); }
  return { v, m };
}

/* And from everything FORWARD of it. */
function fwdOf(x, spans, points) {
  let v = 0, m = 0;
  for (const s of spans) {
    const a = s.x1, b = Math.min(x, s.x2);
    if (b <= a) continue;
    v += s.wN * (b - a);
    m += (s.wN * ((x - a) ** 2 - (x - b) ** 2)) / 2;
  }
  for (const p of points) if (p.x < x) { v += p.n; m += p.n * (x - p.x); }
  return { v, m };
}

/* A grid over [0, L] that lands exactly on the stations the closed form
   is anchored to. Without this the comparison against (A.79) would be
   measuring grid alignment rather than arithmetic. */
export function loadGrid(L, mustHit = []) {
  const set = new Set([0, L]);
  for (let i = 0; i < N_GRID; i++) set.add((i / (N_GRID - 1)) * L);
  for (const x of mustHit) if (Number.isFinite(x) && x > 0 && x < L) set.add(x);
  return [...set].sort((a, b) => a - b);
}

/* A total weight spread uniformly over [x1, x2] as one span carrying an
   intensity in N/m. The span is an exact object, not a sampled array:
   that is the whole point of the note above. */
export function uniformSpan(x1, x2, totalN) {
  const len = x2 - x1;
  return len > 0 ? [{ x1, x2, wN: totalN / len }] : [];
}

/* ─────────────────────────────────────────────────────────────────────
   THE STATIONED ROUTE. Shear and moment from a load set, as a
   cantilever off the wing box in both directions.

   Sign convention: loads are given DOWNWARD-POSITIVE in newtons, which
   is the sense a weight acts in and the sense (A.79) is written in, so
   a positive bending moment here means the same thing TASOPT's does -
   the aft fuselage hanging off the wing box, tension on the top.
   ───────────────────────────────────────────────────────────────────── */
export function shearAndMoment({ grid, spans, points, xWing }) {
  const aft = grid.map((x) => aftOf(x, spans, points));
  const fwd = grid.map((x) => fwdOf(x, spans, points));
  const shearAft = aft.map((r) => r.v), momentAft = aft.map((r) => r.m);
  const shearFwd = fwd.map((r) => r.v), momentFwd = fwd.map((r) => r.m);

  /* Each side is a cantilever off the wing box, so each side's own
     integration is used up to x_wing and the other side's beyond it.
     This is where the stationed route stops reflecting and starts using
     what the tool actually knows about the front fuselage. */
  /* Both sides are kept on every station, not just the one the figure
     plots. The switched value is what a diagram wants; the pair is what
     lets a check ask whether the beam carries the whole load, which at
     the nose is a question only the aft side can answer. */
  const stations = grid.map((x, i) => ({
    x,
    fromAft: x >= xWing,
    shearN: x >= xWing ? shearAft[i] : shearFwd[i],
    momentNm: x >= xWing ? momentAft[i] : momentFwd[i],
    shearAftN: shearAft[i], shearFwdN: shearFwd[i],
    momentAftNm: momentAft[i], momentFwdNm: momentFwd[i],
  }));

  return { stations, shearAft, momentAft, shearFwd, momentFwd };
}

/* ─────────────────────────────────────────────────────────────────────
   THE SMEARED ROUTE. TASOPT (A.79), evaluated directly. Exported so the
   gate can call it on its own.
   ───────────────────────────────────────────────────────────────────── */
export function tasoptA79({ x, nFactor, distributedWeightN, lShell, xShell2, tailWeightN, tailAeroN, xTail }) {
  const quad = lShell > 0
    ? (nFactor * distributedWeightN * (xShell2 - x) ** 2) / (2 * lShell)
    : 0;
  const lin = (nFactor * tailWeightN + tailAeroN) * (xTail - x);
  return quad + lin;
}

/* ═════════════════════════════════════════════════════════════════════
   THE MODULE
   ═════════════════════════════════════════════════════════════════════ */
export function fuselageLoads(result, opts = {}) {
  const ga = generalArrangement(result);
  if (!ga) return null;
  const bal = balanceOf(result, opts);
  const fs = fuselageStructure(result, opts);
  if (!bal || !fs) return null;

  const type = bal.type;
  const L = bal.fuselageLengthM;
  if (!(L > 0)) return null;

  /* THE LOAD FACTOR IS NOT DEFAULTED, for the reason wing-structure.js
     gives at length: a Part 25 transport figure is the wrong number for
     a Part 23 trainer, and the load-factor source gate forbids a
     literal here in any case. A class that carries no load factor gets
     no load diagram and is told why. */
  const nUltLift = [opts.ultimateLoadFactor,
                    result.raw?.geometryInputs?.ultimateLoadFactor,
                    result.raw?.inputs?.ultimateLoadFactor].find((f) => Number.isFinite(f) && f > 0);
  if (!(nUltLift > 0)) {
    return { unavailable: true, type, label: ga.label,
      reason: "This class carries no ultimate load factor, and none is assumed here. A fuselage bending "
            + "moment is a load case before it is a structure." };
  }

  /* ── the shell extent, which is TASOPT's l_shell ─────────────────── */
  const shellFwdX = fs.shell.noseLengthM;
  const shellAftX = L - fs.shell.tailConeLengthM;
  const lShell = Math.max(0, shellAftX - shellFwdX);

  /* The wing reaction station, TASOPT's x_wing: the spar-box axis at the
     wing's area centroid, (A.136)-(A.137). See wingReactionStation. */
  const wingStation = wingReactionStation({ bal, ga, type });
  const xWing = wingStation.xWing;

  /* ── the lumped tail, (A.70) and (A.71) ──────────────────────────── */
  const fusItems = bal.items.filter((i) => i.group === "fuselage");
  const lumped = fusItems.filter((i) => TAIL_LUMP_NAMES.has(i.name));
  const spread = fusItems.filter((i) => !TAIL_LUMP_NAMES.has(i.name));
  const tailMassKg = lumped.reduce((t, i) => t + i.kg, 0);
  const xTail = tailMassKg > 0
    ? lumped.reduce((t, i) => t + i.kg * i.x, 0) / tailMassKg
    : shellAftX;

  /* ── payload ──────────────────────────────────────────────────────── */
  const payloadKg = finite(result.payloadKg) ?? 0;
  const cabinFwdX = bal.cabin.xM - bal.cabin.lengthM / 2;
  const cabinAftX = bal.cabin.xM + bal.cabin.lengthM / 2;

  /* ── the two scenarios, (A.80)-(A.83) ────────────────────────────── */
  const clHMax = finite(opts.clHMax);
  /* The design dive speed comes from the class's own flight envelope,
     which owns the 25.335 design speeds. Reading it through the module
     that computes it rather than off a raw input keeps V_D's own
     provenance - 25.335(b) V_C/0.8 when none is given - attached to it. */
  const env = flightEnvelope(result);
  const vdKt = finite(opts.vdKt) ?? finite(env?.speeds?.vdKt);
  const vdIsAssumed = opts.vdKt === undefined ? (env?.speeds?.vdIsAssumed ?? null) : false;
  const sHM2 = finite(ga.ht.area);
  /* q_NE at sea level, which is the severe end: the same V_D at altitude
     gives a lower dynamic pressure. RHO_MSL is imported, not written. */
  const qNe = vdKt !== null ? 0.5 * RHO_MSL * (vdKt * KT) ** 2 : null;

  const tailAero = (clHMax !== null && qNe !== null && sHM2 !== null && sHM2 > 0)
    ? { evaluated: true, lHMaxN: qNe * sHM2 * clHMax, qNePa: qNe, sHM2, clHMax, vdKt, vdIsAssumed,
        reliefFactor: R_MH, reliefSource: R_MH_SOURCE,
        appliedN: R_MH * qNe * sHM2 * clHMax,
        basis: "TASOPT (A.72) L_hmax = q_NE S_h CL_hmax, relieved by (A.77) r_Mh",
        vdNote: "q_NE is taken at the design dive speed V_D the flight envelope reports, which 25.335(b) "
              + "sets as V_C/0.8 when no V_D is given. It is a never-exceed dynamic pressure only in so "
              + "far as V_D is one."
              + (vdIsAssumed ? " AND ON THIS CLASS V_D IS ASSUMED, not given, so q_NE inherits that." : "") }
    : { evaluated: false, appliedN: 0,
        why: clHMax === null
          ? "CL_hmax is not supplied and is NOT defaulted. TASOPT (A.72) needs it and states no value - only "
            + "\"some assumed max-achievable lift coefficient\". The corpus holds 2-D section clmax for "
            + "symmetric NACA sections, and reading a 2-D clmax as a 3-D surface CL is the error this "
            + "project already measured at +42 % on the high-lift work. Supply opts.clHMax to evaluate it."
          : "The tail airload needs a design dive speed and a horizontal-tail area, and one of them is "
            + "missing on this class." };

  /* N_land. 14 CFR 25.561's inertia forces are not in this corpus, so
     there is no value to default to and the scenario is skipped rather
     than invented. Named nUltLand so the load-factor source gate's scan
     covers it: this module opts into that gate rather than dodging it. */
  const nUltLand = [opts.landingUltimateLoadFactor,
                    result.raw?.inputs?.landingUltimateLoadFactor].find((f) => Number.isFinite(f) && f > 0);

  const scenarios = [
    { id: "manoeuvre", label: "Maximum load factor at V_NE", nFactor: nUltLift,
      tailAeroN: tailAero.appliedN, basis: "TASOPT (A.80)/(A.81)",
      sourced: true },
  ];
  if (nUltLand > 0) {
    scenarios.push({ id: "landing", label: "Emergency landing impact", nFactor: nUltLand,
      tailAeroN: 0, basis: "TASOPT (A.82)/(A.83), L_h = 0", sourced: false,
      note: "The landing factor is a supplied input. 14 CFR 25.561's inertia forces are not held in this "
          + "corpus, so nothing here can confirm the value used." });
  }

  /* ── evaluate each scenario both ways ────────────────────────────── */
  const grid = loadGrid(L, [shellFwdX, shellAftX, xTail, xWing, cabinFwdX, cabinAftX]);

  const evaluated = scenarios.map((sc) => {
    const g = sc.nFactor * G0;

    /* STATIONED: the real stations. Spread items sit at their own x as
       point loads; payload is distributed over the cabin, which is the
       one distribution the tool genuinely knows. */
    const smearedItems = spread.filter((i) => DISTRIBUTED_OVER_SHELL.has(i.name) && i.x >= shellFwdX);
    const pointItems = spread.filter((i) => !smearedItems.includes(i));

    const points = [
      ...pointItems.map((i) => ({ x: i.x, n: i.kg * g, what: i.name })),
      { x: xTail, n: tailMassKg * g + sc.tailAeroN, what: "lumped tail (A.70) + airload" },
    ];
    const spans = [
      ...(payloadKg > 0 ? uniformSpan(cabinFwdX, cabinAftX, payloadKg * g) : []),
      ...uniformSpan(shellFwdX, shellAftX, smearedItems.reduce((t, i) => t + i.kg, 0) * g),
    ];
    const stationed = shearAndMoment({ grid, spans, points, xWing });

    /* SMEARED: TASOPT (A.79). The item set is the one the SOURCE names,
       not simply "everything left over", and getting that wrong is a
       mistake this module made first time round: fed all 18 spread
       items the closed form came out 38 % above the stationed route on a
       transport, and most of that gap was items TASOPT never intended
       to be in it.

       (A.79) sums W_pay + W_padd + W_shell + W_window + W_insul +
       W_floor + W_seat, and the text is explicit about what it leaves
       out: "the fixed weight Wfix is assumed to be concentrated near
       the aircraft nose, and hence it does not impose either a
       distributed load or a point load on the rear fuselage, and hence
       does not appear in (A.79)".

       So items stationed FORWARD OF THE FORWARD PRESSURE BULKHEAD are
       TASOPT's W_fix and are excluded from the smear. That is a
       geometric reading of "concentrated near the nose", it uses a
       station the tool already computes, and it is what makes the
       comparison a comparison rather than a strawman. Those items are
       listed in the result so the exclusion can be checked. */
    const nose = spread.filter((i) => i.x < shellFwdX);

    /* AND (A.79) OMITS THE SYSTEMS TOO. Its distributed term names
       W_pay, W_padd, W_shell, W_window, W_insul, W_floor and W_seat and
       stops there. TASOPT's hydraulic, pneumatic and electrical group
       W_hpesys is a separate weight at its own station and appears
       NOWHERE in (A.79); neither does crew or containerised cargo. So
       the faithful closed form is fed the named list only - which is
       exactly the set smeared over the shell above.

       That is what makes the two routes comparable AND makes their
       residual difference mean something: the stationed route carries
       the equipment, the crew and the cargo that (A.79) leaves out, at
       the stations balance.js computed for them. Where it comes out
       higher, that mass is the reason. */
    const distributedWeightN = (payloadKg + smearedItems.reduce((t, i) => t + i.kg, 0)) * G0;
    const omittedByA79 = pointItems.filter((i) => i.x >= shellFwdX);
    const smeared = grid.map((x) => tasoptA79({
      x, nFactor: sc.nFactor, distributedWeightN, lShell, xShell2: shellAftX,
      tailWeightN: tailMassKg * G0, tailAeroN: sc.tailAeroN, xTail,
    }));

    /* The comparison is made at the wing box, which is where the
       bending moment peaks and where the wing has to react it. */
    /* (A.79) IS A REAR-FUSELAGE FORMULA, so the comparison is made with
       the aft integration explicitly, not with the wing-box-switched
       value the figure plots. At x = x_wing those are the same thing;
       saying which one is meant keeps them the same thing if the switch
       ever moves. */
    const kWing = grid.reduce((best, x, i) => (Math.abs(x - xWing) < Math.abs(grid[best] - xWing) ? i : best), 0);
    const stationedAtWing = stationed.momentAft[kWing];
    const smearedAtWing = smeared[kWing];

    const peak = stationed.stations.reduce((a, s) => (Math.abs(s.momentNm) > Math.abs(a.momentNm) ? s : a));
    const peakShear = stationed.stations.reduce((a, s) => (Math.abs(s.shearN) > Math.abs(a.shearN) ? s : a));

    return {
      ...sc,
      stations: stationed.stations.map((s, i) => ({ ...s, smearedMomentNm: smeared[i] })),
      peakMomentNm: peak.momentNm, peakMomentXM: peak.x,
      peakShearN: peakShear.shearN, peakShearXM: peakShear.x,
      atWing: {
        xM: grid[kWing], stationedNm: stationedAtWing, smearedNm: smearedAtWing,
        ratio: smearedAtWing !== 0 ? stationedAtWing / smearedAtWing : null,
        deltaPct: smearedAtWing !== 0 ? 100 * (stationedAtWing / smearedAtWing - 1) : null,
      },
      stationedBasis: {
        smearedOverShell: smearedItems.map((i) => ({ name: i.name, kg: i.kg })),
        asPointLoads: pointItems.map((i) => ({ name: i.name, kg: i.kg, xM: i.x })),
        why: "The shell, its lining, floor and seats run the length of the cabin, so they are spread over it "
           + "even though balance.js gives each one station; equipment keeps its station. The split follows "
           + "TASOPT (A.79)'s own item list. An item the list does not name stays a point load.",
      },
      smearedBasis: {
        distributedWeightN,
        namedItems: smearedItems.map((i) => i.name),
        excludedAsNoseFixedWeight: nose.map((i) => ({ name: i.name, kg: i.kg, xM: i.x })),
        excludedWhy: "TASOPT (A.79): \"the fixed weight Wfix is assumed to be concentrated near the aircraft "
                   + "nose, and hence it does not impose either a distributed load or a point load on the rear "
                   + "fuselage, and hence does not appear in (A.79)\". Read here as: stationed forward of the "
                   + "forward pressure bulkhead.",
        omittedByA79: omittedByA79.map((i) => ({ name: i.name, kg: i.kg, xM: i.x })),
        omittedKg: omittedByA79.reduce((t, i) => t + i.kg, 0),
        omittedWhy: "(A.79)'s distributed term names W_pay, W_padd, W_shell, W_window, W_insul, W_floor and "
                  + "W_seat only. The systems group W_hpesys, the crew and containerised cargo are not in it. "
                  + "The stationed route carries them at their own stations, which is why it can come out "
                  + "above the closed form.",
      },
    };
  });

  /* The governing scenario is the one with the larger bending moment,
     which is TASOPT's own selection rule at (A.83): "the scenario which
     gives the larger added structural weight will be selected", and on
     a shell of fixed section the larger moment is the larger area. */
  const governing = evaluated.reduce((a, c) => (Math.abs(c.peakMomentNm) > Math.abs(a.peakMomentNm) ? c : a));

  return {
    type, label: ga.label,
    geometry: {
      fuselageLengthM: L, shellFwdX, shellAftX, lShell,
      xWing, xTail, tailMassKg,
      wingStation,
      cabinFwdX, cabinAftX, payloadKg,
      lumpedItems: lumped.map((i) => ({ name: i.name, kg: i.kg, xM: i.x })),
      spreadItemCount: spread.length,
    },
    loadFactor: { ultimateManoeuvre: nUltLift, ultimateLanding: nUltLand ?? null },
    tailAero,
    scenarios: evaluated,
    governing: governing.id,
    sources: {
      bending: "MIT TASOPT 2.00 (Drela) Appendix A, eqs. (A.70), (A.71), (A.72), (A.74), (A.77), (A.79), "
             + "(A.80)-(A.83). Research note: eVTOL_Sizing_Research/classes/cross-class/FUSELAGE-STRUCTURE.md "
             + "sections 1.1 and 4.",
      stations: "Every mass station is balance.js's, with its own recorded reason; this module adds none.",
      relief: R_MH_SOURCE,
    },
    caveats: [
      "THE TAILCONE IS NOT IN THE LUMP. TASOPT (A.70) sums a separate tailcone weight W_cone into W_tail and "
      + "(A.71) puts it at the mid-point of the cone. This tool reports one \"Fuselage\" mass and does not split "
      + "a cone out of it, so the cone's share stays in the distributed term instead. W_tail here is light and "
      + "x_tail is further aft than TASOPT's would be.",
      "X_WING IS THE SPAR-BOX AXIS AT THE WING'S AREA CENTROID, TASOPT (A.136)-(A.137): the source approximates "
      + "its \"net lift-weight centroid\" by the area centroid taken on the swept box axis, and states that on a "
      + "swept wing that point lies aft of the centreline box, which then carries the difference as a pitch "
      + "moment. The axis here is the midline of this tool's own spar box, "
      + `${(100 * wingStation.boxAxisChordFrac).toFixed(1)} % chord, where TASOPT.jl's decks use 40 %; `
      + `x_wbox ${wingStation.xWbox.toFixed(2)} m at the centreline, offset ${wingStation.dxWing.toFixed(2)} m aft `
      + "at the centroid. The lift centroid is not solved here and the fuel state is not in it.",
      ...(wingStation.boxAxisSourced ? [] : ["THE BOX AXIS IS NOT SOURCED ON THIS CLASS. x_wing is the midline of "
        + `a spar box whose positions are not published for this class (${wingStation.boxAxisSource}), so the `
        + "station inherits that gap."]),
      "The stationed route does not reflect about the wing. TASOPT gets the front fuselage by mirroring (A.79), "
      + "because it has no forward stations; this module integrates the forward stations it has. The two "
      + "therefore diverge ahead of the wing BY DESIGN, and only the aft comparison is meaningful.",
      "Every station is a convention inherited from balance.js, whose own caveat applies unchanged: all of them "
      + "except the wing's are one TASOPT deck's layout as fractions of fuselage length.",
      "No shell is SIZED here. F1 is the load; the pressure shell (F2) and the added bending material (F3) are "
      + "what turn a moment into a thickness, and each is its own module with its own gate.",
      ...(tailAero.evaluated ? [] : [`THE TAIL AIRLOAD IS NOT EVALUATED. ${tailAero.why}`]),
      ...(nUltLand > 0 ? [] : ["THE EMERGENCY LANDING SCENARIO IS NOT EVALUATED. 14 CFR 25.561's inertia "
        + "forces are not held in this corpus, so no landing load factor is defaulted. Supply "
        + "opts.landingUltimateLoadFactor to add the scenario. Not evaluated is not a pass."]),
    ],
  };
}
