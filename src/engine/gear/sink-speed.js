/* =====================================================================
   G1 — DESIGN SINK SPEED AND THE GEAR LOAD FACTOR
   =====================================================================
   The landing gear is sized by a descent velocity the regulation
   prescribes, not by the flight load factor this tool already carries.

   ⚠ THE TRAP THIS MODULE EXISTS TO AVOID. The engine already computes a
   14 CFR 25.337(b) manoeuvring load factor, and it is the wrong number
   for a gear. 25.337(b) is the positive limit MANOEUVRING factor
   (2.1 + 24000/(W+10000), floored at 2.5, capped at 3.8). The gear
   reaction comes from the landing energy balance below. LANDING-GEAR.md
   section 1.1 states it outright: "Do not reuse the 25.337 number for the
   gear." Nothing here reads it.

   PART 25 — a TWO-POINT envelope, not a single case.
   [SRC] 14 CFR 25.473(a): "(2) With a limit descent velocity of 10 fps at
   the design landing weight ... (3) With a limit descent velocity of
   6 fps at the design take-off weight". So the sizing cases are
   (10 fps, MLW) and (6 fps, MTOW) and BOTH must be evaluated — a gear
   sized only at MLW can be undersized at MTOW and vice versa, because
   the weight and the velocity move in opposite directions.

   [SRC] 14 CFR 25.473(b): "Airplane lift, not exceeding airplane weight,
   may be assumed", so the lift fraction is 1.0 — the wing may be assumed
   to carry the whole weight during the impact.

   [SRC] 14 CFR 25.723(b): reserve energy is "a descent velocity of
   12 f.p.s. at design landing weight", which must not FAIL, as distinct
   from the 10 fps case which must not exceed limit load.

   PART 23 (the trainer class).
   [SRC] 14 CFR 23.473(d), 2011 edition: V = 4.4 (W/S)^(1/4) fps, "except
   that this velocity need not be more than 10 feet per second and may not
   be less than seven feet per second" — so it is CLIPPED at both ends,
   and the clip is the rule's own wording, not a convenience.

   [SRC] 14 CFR 23.473(e): "Wing lift not exceeding two-thirds of the
   weight of the airplane may be assumed" — 2/3, not 1.0. A Part 23 gear
   therefore absorbs more of the aeroplane's weight than a Part 25 one at
   the same sink speed.

   [SRC] 14 CFR 23.473(g): "No inertia load factor used for design
   purposes may be less than 2.67, nor may the limit ground reaction load
   factor be less than 2.0 at design maximum weight."

   [SRC] 14 CFR 23.727(a): reserve drop height is 1.44x that of 23.725,
   i.e. a 1.2x factor on sink speed (since energy goes as V^2) — the same
   ratio in effect as Part 25's 12/10.

   WHAT IS NOT HERE, AND WHY. Part 25 prescribes NO gear reaction load
   factor N. It prescribes a sink speed and requires a drop test
   (25.723). N is therefore a DESIGN CHOICE in this method, not a rule,
   and it is an input with a per-class default rather than a constant
   invented here. LANDING-GEAR.md section 5 gap 10 says exactly this.
   ===================================================================== */

const FPS_PER_MS = 3.280839895;

/* Part 25 sink speeds. Each is a regulation figure, not a convention. */
export const PART25_SINK = Object.freeze({
  landingFps: 10,   // [SRC] 14 CFR 25.473(a)(2), at MLW
  takeoffFps: 6,    // [SRC] 14 CFR 25.473(a)(3), at MTOW
  reserveFps: 12,   // [SRC] 14 CFR 25.723(b), at MLW, must not fail
  liftFraction: 1.0,        // [SRC] 14 CFR 25.473(b)
  frictionMax: 0.8,         // [SRC] 14 CFR 25.473(e), "need not be more than 0.8"
});

/* Part 23 sink speed law and its floors. */
export const PART23_SINK = Object.freeze({
  coeff: 4.4, exponent: 0.25,   // [SRC] 14 CFR 23.473(d): V = 4.4 (W/S)^(1/4)
  minFps: 7, maxFps: 10,        // [SRC] 14 CFR 23.473(d), both clips are the rule's
  liftFraction: 2 / 3,          // [SRC] 14 CFR 23.473(e)
  inertiaFactorMin: 2.67,       // [SRC] 14 CFR 23.473(g)
  groundFactorMin: 2.0,         // [SRC] 14 CFR 23.473(g)
  reserveEnergyFactor: 1.44,    // [SRC] 14 CFR 23.727(a), on DROP HEIGHT
});

/* Which rule a class certifies to. The trainer is the Part 23 aeroplane in
   this tool; the transport, business jet and turboprop are Part 25. */
export function certificationBasis(type) {
  return type === "trainer" ? "part23" : "part25";
}

/* Part 23 design sink speed from wing loading, in lb/ft^2.
   Returns the clipped value AND whether a clip bound, because "the clip
   bound" is the difference between a sourced law and a sourced limit, and
   the drawing rule this project follows wants that distinction visible. */
export function part23SinkFps(wingLoadingPsf) {
  const ws = Number(wingLoadingPsf);
  if (!(ws > 0)) {
    return { fps: PART23_SINK.maxFps, clipped: "invalid",
             why: "no wing loading supplied; the rule's upper clip is used" };
  }
  const raw = PART23_SINK.coeff * Math.pow(ws, PART23_SINK.exponent);
  if (raw < PART23_SINK.minFps) {
    return { fps: PART23_SINK.minFps, raw, clipped: "low",
             why: "4.4 (W/S)^0.25 falls below the 7 fps floor of 23.473(d)" };
  }
  if (raw > PART23_SINK.maxFps) {
    return { fps: PART23_SINK.maxFps, raw, clipped: "high",
             why: "4.4 (W/S)^0.25 exceeds the 10 fps ceiling of 23.473(d)" };
  }
  return { fps: raw, raw, clipped: null,
           why: "4.4 (W/S)^0.25 lies inside the 7-10 fps band of 23.473(d)" };
}

/* The sizing cases for a class. Part 25 returns TWO, because the rule
   gives two and neither is dominant a priori. */
export function sinkCases({ type, mtowKg, mlwKg, wingLoadingPsf }) {
  const basis = certificationBasis(type);
  if (basis === "part25") {
    return {
      basis,
      liftFraction: PART25_SINK.liftFraction,
      cases: [
        { label: "landing", vFps: PART25_SINK.landingFps, massKg: mlwKg,
          src: "14 CFR 25.473(a)(2)" },
        { label: "take-off", vFps: PART25_SINK.takeoffFps, massKg: mtowKg,
          src: "14 CFR 25.473(a)(3)" },
      ],
      reserve: { label: "reserve energy", vFps: PART25_SINK.reserveFps,
                 massKg: mlwKg, src: "14 CFR 25.723(b)", mustNotFail: true },
    };
  }
  const v = part23SinkFps(wingLoadingPsf);
  return {
    basis,
    liftFraction: PART23_SINK.liftFraction,
    sinkNote: v.why,
    cases: [
      { label: "landing", vFps: v.fps, massKg: mtowKg, src: "14 CFR 23.473(d)",
        clipped: v.clipped },
    ],
    /* Energy goes as V^2, so a 1.44x drop HEIGHT is a 1.2x sink speed. */
    reserve: { label: "reserve energy", vFps: v.fps * Math.sqrt(PART23_SINK.reserveEnergyFactor),
               massKg: mtowKg, src: "14 CFR 23.727(a)", mustNotFail: true },
    floors: { inertia: PART23_SINK.inertiaFactorMin,
              ground: PART23_SINK.groundFactorMin, src: "14 CFR 23.473(g)" },
  };
}

export const fpsToMs = (fps) => fps / FPS_PER_MS;
export const msToFps = (ms) => ms * FPS_PER_MS;
