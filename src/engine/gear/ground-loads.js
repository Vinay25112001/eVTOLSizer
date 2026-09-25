/* =====================================================================
   G2 — STATIC AND BRAKED GROUND REACTIONS
   =====================================================================
   The loads a tyre must be rated for. Everything here is closed form and
   every equation is a regulation or plain statics on the gear geometry.

   THE GEOMETRY, and the symbols are the regulation's own, so that the
   formula below can be read against 14 CFR 25.493(e) without translating:

     A = horizontal distance from the CG to the NOSE wheel
     B = horizontal distance from the CG to the line joining the centres
         of the MAIN wheels
     E = vertical height of the CG above the ground, 1.0 g static
     A + B = the wheelbase

   Note which way round A and B are: A is the NOSE arm, and it multiplies
   in the load that transfers ONTO the nose under braking. Getting them
   the wrong way round still produces plausible numbers, which is why the
   gate checks the static split against measured aircraft rather than
   against itself.

   STATIC SPLIT — statics on that geometry, no source needed beyond it:

     V_N,static = W B / (A + B)          the nose carries the SHORT arm
     V_M,static = W A / (A + B)          both main gears together

   That is the whole reason a nose gear carries so little: B is small
   because the CG sits just ahead of the main gear. LANDING-GEAR.md
   section 3.4 measures 4.6-12.7 % on flown aircraft (its SUMMARY table
   in section 3.7 says 5.6 %, dropping the 777-200 aft-CG row that sets
   the minimum; the data table is the authority). The ADP-style "90/10
   rule of thumb" is a restatement of a typical outcome, not a method, and
   it is not used here.

   BRAKED NOSE REACTION — prescribed, not derived.
   [SRC] 14 CFR 25.493(e), transcribed from the Federal Register equation
   image (eq-25.493e-VN.png in the corpus, read directly):

       V_N = (W_T / (A + B)) * [ B + f u A E / (A + B + u E) ]

   with, from the same paragraph:
     W_T = design takeoff weight
     u   = coefficient of friction, 0.80
     f   = dynamic response factor, "2.0 is to be used unless a lower
           factor is substantiated"

   and f itself defined there as (eq-25.493e-f.png, also read directly):

       f = 1 + exp( -pi z / sqrt(1 - z^2) )

   where z is the effective critical damping ratio of the rigid-body
   pitching mode. NOTE THE CONSISTENCY CHECK, worth keeping: at z = 0 that
   expression gives exactly 2, so the rule's blanket 2.0 IS the undamped
   case, and any substantiated value is necessarily lower. The function
   below is exposed so that relationship can be exercised rather than
   asserted.

   [SRC] 14 CFR 25.493(d) fixes the condition the formula applies to: the
   aeroplane "at design takeoff weight with the nose and main gears in
   contact with the ground, and with a steady-state vertical load factor
   of 1.0", i.e. this is a load-transfer case, not an impact case.

   WHAT THIS MODULE DOES NOT DO. The other ground cases (25.479 level
   landing, 25.481 tail-down, 25.483 one-gear, 25.485 side load, 25.489
   ground handling, 25.495 turning, 25.499 nose-wheel yaw, 25.503
   pivoting, 25.507 reversed braking, 25.509 towing, 25.511 deflated
   tyre, 25.519 jacking) set DESIGN loads for the structure but do not
   set the tyre rating or the gear geometry. They are named in
   LANDING-GEAR.md section 1.2 and belong to a structural pass, not here.
   ===================================================================== */

export const BRAKING = Object.freeze({
  frictionCoefficient: 0.8,   // [SRC] 14 CFR 25.493(e), "u = 0.80"
  dynamicResponseFactor: 2.0, // [SRC] 14 CFR 25.493(e), the undamped value
});

/* The rule's own definition of f. At zero damping this returns 2, which is
   the value 25.493(e) directs be used absent substantiation. */
export function dynamicResponseFactor(dampingRatio = 0) {
  const z = Number(dampingRatio);
  if (!(z >= 0) || z >= 1) return BRAKING.dynamicResponseFactor;
  return 1 + Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
}

/* Static split. `weight` is any consistent force unit; the return is in
   the same unit. `noseArmA` and `mainArmB` are A and B above. */
export function staticReactions({ weight, noseArmA, mainArmB }) {
  const A = Number(noseArmA), B = Number(mainArmB), W = Number(weight);
  const wb = A + B;
  if (!(wb > 0) || !(W > 0) || !(A >= 0) || !(B >= 0)) {
    return { resolved: false,
             why: "a static split needs a positive wheelbase and weight, with "
                + "the CG between the gears" };
  }
  const nose = (W * B) / wb;
  const main = (W * A) / wb;
  return {
    resolved: true, wheelbase: wb,
    noseLoad: nose, mainLoadTotal: main,
    noseFraction: nose / W,
    src: "statics on the 14 CFR 25.493 geometry",
  };
}

/* Braked nose reaction, 14 CFR 25.493(e), verbatim in form. */
export function brakedNoseReaction({
  takeoffWeight, noseArmA, mainArmB, cgHeightE,
  friction = BRAKING.frictionCoefficient,
  f = BRAKING.dynamicResponseFactor,
}) {
  const A = Number(noseArmA), B = Number(mainArmB), E = Number(cgHeightE);
  const W = Number(takeoffWeight), u = Number(friction);
  const wb = A + B;
  if (!(wb > 0) || !(W > 0) || !(E > 0)) {
    return { resolved: false,
             why: "25.493(e) needs a wheelbase, a take-off weight and a CG "
                + "height above the ground" };
  }
  const vN = (W / wb) * (B + (f * u * A * E) / (wb + u * E));
  const stat = (W * B) / wb;
  return {
    resolved: true, load: vN,
    staticLoad: stat,
    transferRatio: stat > 0 ? vN / stat : null,
    f, friction: u,
    src: "14 CFR 25.493(e)",
  };
}

/* The three nose-tyre conditions 25.733(b) rates against. The two
   decelerating cases are given as a g-load forward at the CG rather than
   through 25.493(e)'s f, so they are computed on their own terms:
   a forward inertia force n_x W at height E, reacted as a couple over the
   wheelbase, added to the static reaction at the relevant weight.

   [SRC] 14 CFR 25.733(b)(1) static at MRW; (b)(2) 1.0 g down + 0.31 g
   forward at MLW; (b)(3) 1.0 g down + 0.20 g forward at MRW. */
export const NOSE_TYRE_CASES = Object.freeze([
  { label: "static",      nx: 0,    weight: "ramp",    limitFactor: 1.0,
    src: "14 CFR 25.733(b)(1)" },
  { label: "0.31 g fwd",  nx: 0.31, weight: "landing", limitFactor: 1.5,
    src: "14 CFR 25.733(b)(2)" },
  { label: "0.20 g fwd",  nx: 0.20, weight: "ramp",    limitFactor: 1.5,
    src: "14 CFR 25.733(b)(3)" },
]);

export function noseTyreLoads({ rampWeight, landingWeight, noseArmA, mainArmB, cgHeightE }) {
  const A = Number(noseArmA), B = Number(mainArmB), E = Number(cgHeightE);
  const wb = A + B;
  if (!(wb > 0) || !(E >= 0)) {
    return { resolved: false, why: "needs a wheelbase and a CG height" };
  }
  const W = { ramp: Number(rampWeight), landing: Number(landingWeight) };
  const out = NOSE_TYRE_CASES.map((c) => {
    const w = W[c.weight];
    if (!(w > 0)) return { ...c, resolved: false, why: `no ${c.weight} weight supplied` };
    /* Forward inertia n_x W acting at height E pitches the aeroplane onto
       the nose: the couple n_x W E is reacted over the wheelbase. */
    const load = (w * B) / wb + (c.nx * w * E) / wb;
    return { ...c, resolved: true, load, weightUsed: w,
             /* what the tyre's RATING must cover for this case */
             requiredRating: load / c.limitFactor };
  });
  return { resolved: true, cases: out };
}
