/* =====================================================================
   FLIGHT ENVELOPE — the V-n diagram, the gust envelope, and which governs
   =====================================================================
   The tool took ONE number from the flight envelope: the limit manoeuvre
   load factor of 14 CFR 25.337(b). The wing box was sized from it and
   nothing else, so a governing gust case would have passed unnoticed.

   THE RESEARCH CORRECTED THE PREMISE I STARTED FROM, and the correction is
   the most useful thing in this module. I expected the gust case to exceed
   the manoeuvre case on a large transport. It is the other way round, and
   the margin WIDENS with size: Δn_gust falls as 1/(W/S) while 25.337(b) is
   pinned at 2.5 above 14,000 lb. Worked in
   eVTOL_Sizing_Research/classes/cross-class/FLIGHT-ENVELOPE.md section 4:

       737-400   W/S 145 lb/ft²   n_man 2.50   n_gust 1.71   ratio 0.68
       CRM widebody  158.8        2.50         1.58          0.63
       ATR 72-600     77.2        2.50         2.14          0.86
       PC-24          56.3        2.94         2.49          0.85

   The crossover is near 50 lb/ft². So the single 2.5 g is NOT producing a
   wrong transport wing box. What was missing is four of the five boundaries
   of the manoeuvre diagram, the whole of the second diagram, and the low
   wing-loading classes where the gust case really does close in.

   THE GUST METHOD, and its honest status. 25.341(a) requires a dynamic
   analysis with a tuned 1-cos gust swept over gradient distances; no
   conceptual shortcut is sanctioned anywhere — the research grepped all 37
   pages of AMC 25.341 for "simplified" and "preliminary" and found nothing.
   What this module computes is the Pratt-Walker closed form (NACA Report
   1206 — NOT TN 4332, which is a missile-loads paper) evaluated at the
   CURRENT rule's gust velocities:

       mu   = 2w / (rho * c * a * g)
       K_g  = 0.88 mu / (5.3 + mu)                    25.335(d), fig ER09FE96.017
       U_ds = U_ref * F_g * (H/350)^(1/6)             25.341(a)(4)
       dn   = K_g * U_ds * V_e * a / (498 w)

   with H* = min(12.5 c̄, 350 ft). THAT LAST STEP IS A BRIDGE, NOT A
   REGULATION: K_g was derived at H = 12.5 chords (TR 1206 p. 3) and FAA
   AC 25.341-1 section 6.2.1.3 identifies 12.5 c̄ as the gradient distance of
   interest, but no document joins them. It is labelled an estimate wherever
   it is shown.

   DO NOT USE THE OLD 66/50/25 ft/s VALUES here. They are the pre-1996 rule
   and they are 25-30 % more severe at altitude. The tool's own Part 23
   trainer path (src/classes/trainer/weights.js designLoads) legitimately
   uses them — that is a different regulation — and its numbers must not be
   borrowed into this one.

   WHAT THIS DELIBERATELY DOES NOT DO. It does not evaluate 25.341(b)
   continuous turbulence: the PSD method needs a transfer function from a
   dynamic analysis, and there is no sanctioned closed form. It does not
   compute V_C or V_D, which 25.335 leaves to the applicant and which no
   transport TCDS publishes — they are inputs with their regulatory minima
   checked. It computes no rolling, yawing or unsymmetrical case.
   ===================================================================== */

const KT = 0.514444;                 // m/s per knot
const FT = 0.3048;
const LB_FT2_PER_PA = 0.020885434;   // lb/ft² per N/m²
const RHO0_SLUG = 0.0023769;         // slug/ft³, ISA sea level
const G_FT = 32.174;

/* Level flight. Named rather than written as a bare 1 wherever a drawing
   needs it, so the V-n views carry no numeric load factor of their own —
   validation/load-factor-source.mjs fences every load-factor literal to the
   module that owns the regulation, and a chart is not an owner. */
export const LEVEL_FLIGHT_N = 1;

/* 14 CFR 25.343(b)(1)(i), verbatim: "A maneuvering load factor of + 2.25".
   It applies to the zero-fuel-and-oil-in-the-wing condition and ONLY where
   a structural reserve fuel condition has been selected under 25.343(a),
   so it is a relaxation an applicant elects rather than a design case.
   1.5 is the factor of safety of 25.303.

   It lives here, with the other Part 25 load factors, because the wing box
   is not an owner: validation/load-factor-source.mjs fences every load
   factor to the module that owns its regulation, and it caught this one
   written as a literal in wing-structure.js. */
export const ZERO_WING_FUEL = Object.freeze({
  limitN: 2.25,
  ultimateN: 2.25 * 1.5,
  source: "14 CFR 25.343(b)(1)(i), with the 1.5 factor of safety of 25.303",
});

/* 25.341(a)(5)(i): 56.0 ft/s EAS at sea level, reduced linearly to 44.0 at
   15,000 ft and further to 20.86 at 60,000 ft. The reductions are
   PERMISSIONS ("may be reduced", three times) — only the sea-level 56.0 is
   mandatory — so taking them is an election, and the module says so. */
export function uRefFtS(altFt) {
  const h = Math.max(0, altFt);
  if (h <= 15000) return 56.0 + (44.0 - 56.0) * (h / 15000);
  if (h <= 60000) return 44.0 + (20.86 - 44.0) * ((h - 15000) / 45000);
  return 20.86;
}

/* 25.341(a)(6): F_g = 0.5(F_gz + F_gm), increased linearly from the sea
   level value to 1.0 at the maximum operating altitude of 25.1527. */
export function flightProfileAlleviation({ zMoFt, mlwKg, mzfwKg, mtowKg, altFt }) {
  const fgz = 1 - zMoFt / 250000;
  const r1 = mlwKg / mtowKg, r2 = mzfwKg / mtowKg;
  const fgm = Math.sqrt(r2 * Math.tan((Math.PI * r1) / 4));
  const fgSl = 0.5 * (fgz + fgm);
  const f = Math.min(1, Math.max(0, altFt / Math.max(zMoFt, 1)));
  return { fg: fgSl + (1 - fgSl) * f, fgSeaLevel: fgSl, fgz, fgm, r1, r2 };
}

/* 25.337(b), already used by the sizing loop; repeated here so the diagram
   is self-contained and cannot drift from it. */
export function limitManoeuvreN(mtowLb) {
  return Math.min(3.8, Math.max(2.5, 2.1 + 24000 / (mtowLb + 10000)));
}

/* Compressible lift-curve slope, per radian. 25.335(d) asks for the
   AIRPLANE normal-force slope; this is the WING's, which is the usual
   conceptual substitution and runs a little low — a lower slope gives a
   lower gust increment, so the substitution is NOT conservative and is
   flagged in the result. */
export function liftCurveSlope({ ar, mach, sweepC4Deg }) {
  const beta2 = Math.max(1e-6, 1 - mach * mach);
  const tanL = Math.tan((sweepC4Deg * Math.PI) / 180);
  return (2 * Math.PI * ar) / (2 + Math.sqrt(4 + (ar * ar * (1 + tanL * tanL)) / beta2));
}

/* The Pratt-Walker gust increment, in the regulation's own units. */
export function gustIncrement({ kg, uDsFtS, veKt, aPerRad, wLbFt2 }) {
  return (kg * uDsFtS * veKt * aPerRad) / (498 * wLbFt2);
}

/* The classes this rule applies to. The trainer is certificated under
   Part 23 and already has its own envelope in src/classes/trainer/weights.js
   `designLoads()`, on the Part 23 gust velocities. Running Part 25's numbers
   on it would be a category error in both directions — a different n_lim
   formula and gust velocities 25-30 % apart at altitude — so this refuses
   rather than producing a plausible wrong answer. */
const PART_25 = new Set(["transport", "bizjet", "turboprop"]);

export function flightEnvelope(result, opts = {}) {
  const p = result.raw?.inputs ?? {};
  const S = result.wingAreaM2, b = result.spanM;
  const mtow = result.mtowKg;
  if (!(S > 0 && b > 0 && mtow > 0)) return null;
  if (!PART_25.has(result.type)) {
    return { unavailable: true, part: 23,
      why: "This class is certificated under 14 CFR Part 23, not Part 25. Its flight envelope is already "
         + "computed by designLoads() in src/classes/trainer/weights.js, on the Part 23 gust velocities "
         + "(50/25 ft/s) and the Part 23 manoeuvre load factor. Part 25's 25.337(b) formula and its "
         + "25.341(a) gust velocities are a different regulation and must not be applied here — at altitude "
         + "the two gust models differ by a quarter." };
  }

  /* Weight for the envelope. 25.321(b) wants the corners swept; this does
     the design take-off weight and says so. */
  const wKgM2 = mtow / S;
  const wLbFt2 = wKgM2 * 9.80665 * LB_FT2_PER_PA;
  const sFt2 = S / (FT * FT);
  const cBarFt = (S / b) / FT;                       // mean GEOMETRIC chord, 25.335(d)
  const ar = (b * b) / S;
  /* The lift-curve slope belongs to the point the ENVELOPE is drawn at, not
     to the cruise point. Using the cruise Mach at a sea-level envelope
     applies a Prandtl-Glauert correction that does not belong there and
     understated the 737-class gust factor by about a tenth. Mach is
     resolved below, once V_C is known, so this is deferred. */

  /* C_N,max, not C_L,max: at the stall they differ by cos(alpha), and
     25.335(d)(1) says C_NAmax explicitly. */
  const clMax = opts.clMax ?? p.clMaxClean ?? 1.4;
  const cnFactor = opts.cnOverCl ?? 1.03;
  const cnMax = clMax * cnFactor;
  /* A first slope at low Mach, to get V_S1; the gust slope is recomputed at
     the envelope's own Mach once V_C is settled. */
  const aLowSpeed = liftCurveSlope({ ar, mach: 0.2, sweepC4Deg: p.wingSweep ?? 0 });
  /* The negative branch. This is the one number in the whole diagram with
     no source behind it. */
  const cnMinAbs = (opts.cnMinOverCnMax ?? 0.70) * cnMax;

  const vs1Kt = Math.sqrt((2 * mtow * 9.80665) / (1.225 * S * cnMax)) / KT;
  const vs1NegKt = Math.sqrt((2 * mtow * 9.80665) / (1.225 * S * cnMinAbs)) / KT;

  const nLim = limitManoeuvreN(mtow / 0.45359237);

  /* V_C and V_D are the applicant's. No transport TCDS publishes them — the
     research grepped every one in the corpus — so they are inputs, and the
     regulatory minima are CHECKED rather than used to manufacture a value. */
  const altFt = opts.altFt ?? 0;
  /* V_C IS AN INPUT OR IT IS A GUESS, and the difference must be visible.
     The fallback below is the maximum operating Mach flown at the envelope's
     altitude — which is what V_MO/M_MO usually tracks — and NOT the aircraft's
     cruise EAS: cruise EAS on a 737-class comes out near 250 kt against a
     real V_C of about 340, because cruise is flown well inside the envelope.
     Whichever route is taken, `vcIsAssumed` says so. */
  const aSoundKt = 661.4788 * Math.sqrt(tempRatio(altFt));
  /* The fallback is the REGULATORY MINIMUM, not a guess at the real V_C.
     25.335(a)(2): "V_C may not be less than V_B + 1.32 U_REF". V_B itself
     depends on V_C through 25.335(d)(1), so the pair is solved by a short
     fixed point. Using the maximum operating MACH here would be wrong
     physics — M_MO is the high-altitude limit and says nothing about a
     sea-level speed, where V_MO governs and the tool has no V_MO. */
  const uRefHere = uRefFtS(altFt);
  const aGuess = liftCurveSlope({ ar, mach: 0.3, sweepC4Deg: p.wingSweep ?? 0 });
  let vcFallbackKt = 1.5 * vs1Kt;
  for (let i = 0; i < 40; i++) {
    const muI = (2 * wLbFt2) / (RHO0_SLUG * densityRatio(altFt) * cBarFt * aGuess * G_FT);
    const kgI = (0.88 * muI) / (5.3 + muI);
    const vbI = vs1Kt * Math.sqrt(1 + (kgI * uRefHere * vcFallbackKt * aGuess) / (498 * wLbFt2));
    const next = Math.max(1.5 * vs1Kt, vbI + (1.32 * uRefHere) / 1.6878);
    if (Math.abs(next - vcFallbackKt) < 1e-6) { vcFallbackKt = next; break; }
    vcFallbackKt = next;
  }
  const vcKt = opts.vcKt ?? vcFallbackKt;
  const vcIsAssumed = opts.vcKt === undefined;
  const vdKt = opts.vdKt ?? vcKt / 0.8;              // 25.335(b): V_C <= 0.8 V_D
  const vdIsAssumed = opts.vdKt === undefined;

  /* Now the envelope's own Mach, and the slope that goes with it. */
  const envMach = (vcKt / Math.sqrt(densityRatio(altFt))) / aSoundKt;
  const aPerRad = liftCurveSlope({ ar, mach: Math.min(0.95, envMach), sweepC4Deg: p.wingSweep ?? 0 });
  const zMoFt = opts.zMoFt ?? p.cruiseAltFt ?? 35000;
  const fg = flightProfileAlleviation({ zMoFt, mlwKg: result.mlwKg ?? mtow * 0.85,
    mzfwKg: result.mzfwKg ?? mtow * 0.8, mtowKg: mtow, altFt });

  /* Pratt's mass ratio and alleviation factor, 25.335(d) fig ER09FE96.017. */
  const rho = RHO0_SLUG * densityRatio(altFt);
  const mu = (2 * wLbFt2) / (rho * cBarFt * aPerRad * G_FT);
  const kg = (0.88 * mu) / (5.3 + mu);

  /* The bridge: K_g was derived at H = 12.5 chords; the AC identifies the
     same distance; nothing joins them officially. */
  const hStarFt = Math.min(12.5 * cBarFt, 350);
  const hClipped = 12.5 * cBarFt > 350;
  const uRef = uRefFtS(altFt);
  const uDs = uRef * fg.fg * Math.pow(hStarFt / 350, 1 / 6);

  const dnAt = (veKt, half = false) =>
    gustIncrement({ kg, uDsFtS: half ? 0.5 * uDs : uDs, veKt, aPerRad, wLbFt2 });

  /* 25.335(d)(1): V_B >= V_S1 sqrt(1 + K_g U_ref V_C a / (498 w)). That is
     V_S1 sqrt(n_gust at V_C) exactly as V_A is V_S1 sqrt(n_man) — which
     makes V_B/V_A a pure indicator of which case governs, computable with
     no modelling at all. */
  const nGustVc = 1 + dnAt(vcKt);
  /* CAREFUL — TWO DIFFERENT GUST VELOCITIES, BY REGULATION.
     25.335(d)(1) builds V_B from the RAW reference gust velocity U_ref: it
     names "U_ref = the reference gust velocity ... from § 25.341(a)(5)(i)"
     and carries no F_g and no gradient-distance factor. The LOAD, by
     25.341(a)(4), uses U_ds = U_ref·F_g·(H/350)^(1/6), which here is
     appreciably smaller. So V_B's implied gust factor is NOT the one the
     wing is sized to, and V_B/V_A must be compared against the U_ref
     version or the two disagree for a reason that looks like a bug. */
  const nGustVcUref = 1 + gustIncrement({ kg, uDsFtS: uRef, veKt: vcKt, aPerRad, wLbFt2 });
  const vbMinKt = vs1Kt * Math.sqrt(nGustVcUref);
  const vbKt = Math.min(opts.vbKt ?? vbMinKt, vcKt);      // 25.335(d)(2)(ii)

  /* 25.335(c): V_A >= V_S1 sqrt(n), need not exceed V_C. */
  const vaKt = Math.min(vs1Kt * Math.sqrt(nLim), vcKt);
  const vhKt = vs1NegKt;                                   // inverted corner at n = -1

  /* ── the two diagrams ──────────────────────────────────────────────── */
  const manoeuvre = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const v = (vaKt * i) / N;
    manoeuvre.push({ v, nPos: (v / vs1Kt) ** 2, branch: "stall" });
  }
  for (let i = 1; i <= N; i++) manoeuvre.push({ v: vaKt + ((vdKt - vaKt) * i) / N, nPos: nLim, branch: "limit" });
  const negative = [];
  for (let i = 0; i <= N; i++) {
    const v = (vhKt * i) / N;
    negative.push({ v, nNeg: -((v / vs1NegKt) ** 2) });
  }
  for (let i = 1; i <= N; i++) negative.push({ v: vhKt + ((vcKt - vhKt) * i) / N, nNeg: -1 });
  for (let i = 1; i <= N; i++) {
    const v = vcKt + ((vdKt - vcKt) * i) / N;
    negative.push({ v, nNeg: -1 * ((vdKt - v) / Math.max(vdKt - vcKt, 1e-9)) });
  }

  /* The gust envelope: straight lines through (0,1) because dn is linear in
     V, with U_ref equal between V_B and V_C (25.341(a)(5)(i)) and halved at
     V_D (25.341(a)(5)(ii)). Under the CURRENT rule V_C is therefore always
     the critical gust speed; the pre-1996 rule's steeper 66 ft/s line at
     V_B is what most textbook diagrams still draw. */
  const gust = [
    { label: "V_B", v: vbKt, dn: dnAt(vbKt) },
    { label: "V_C", v: vcKt, dn: dnAt(vcKt) },
    { label: "V_D", v: vdKt, dn: dnAt(vdKt, true) },
  ].map((g) => ({ ...g, nPos: 1 + g.dn, nNeg: 1 - g.dn }));

  const nGustMax = Math.max(...gust.map((g) => g.nPos));
  const governing = nGustMax > nLim ? "gust" : "manoeuvre";

  /* 25.335(a)(2): "V_C may not be less than V_B + 1.32 U_REF". Read
     literally that adds ft/s to knots. The research found the converted
     reading is the pre-1996 "+43 knots" and that the literal reading fails
     a real certificated aeroplane (Citation M2) by 29 kt, so the conversion
     is applied and the trap is named. */
  const vcMin132 = vbKt + (1.32 * uRef) / 1.6878;

  return {
    weightKg: mtow, altFt, wingLoadingLbFt2: wLbFt2, meanGeometricChordFt: cBarFt,
    aPerRad, aIsWingOnly: true, cnMax, cnMinAbs, cnMinSourced: false,
    speeds: {
      vs1Kt, vs1NegKt, vaKt, vbKt, vbMinKt, vcKt, vdKt, vhKt,
      vcMin132, vcMeets132: vcKt >= vcMin132 - 0.5,
      vcIsAssumed, vdIsAssumed, aLowSpeed, envMach,
      vdMin125Vc: 1.25 * vcKt, vdMeets: vdKt >= vcKt / 0.8 - 0.5,
      vbOverVa: vbKt / vaKt,
    },
    manoeuvreN: nLim,
    gustModel: { mu, kg, uRefFtS: uRef, uDsFtS: uDs, hStarFt, hClipped, ...fg },
    gust, nGustMax, nGustVc, nGustVcUref,
    governing,
    margin: (nLim - nGustMax) / nLim,
    diagram: { manoeuvre, negative },
    caveats: [
      "The gust load factor is a Pratt-Walker closed form on the current rule's gust velocities. "
      + "25.341(a)(1) requires a dynamic analysis with a tuned 1-cos gust swept over gradient distances, "
      + "and no conceptual shortcut is sanctioned: AMC 25.341's 37 pages contain no \"simplified\" or "
      + "\"preliminary\" route. Treat this as screening, not compliance.",
      `The gradient distance is taken as H = min(12.5 c̄, 350 ft) = ${hStarFt.toFixed(0)} ft`
      + `${hClipped ? ", clipped at 350" : ""}. That join between K_g and the current U_ds(H) is an `
      + "engineering construction, not a regulation: K_g was derived at 12.5 chords and FAA AC 25.341-1 "
      + "names the same distance, but no document joins them.",
      "25.341(b) continuous turbulence is NOT evaluated. The PSD method needs a transfer function from a "
      + "dynamic analysis; there is no closed form a conceptual tool can honestly run.",
      "The lift-curve slope used is the WING's. 25.335(d) asks for the airplane's normal-force slope, which "
      + "is larger, so this understates the gust increment slightly — the substitution is not conservative.",
      `The negative stall branch uses |C_N,min| = ${(opts.cnMinOverCnMax ?? 0.70).toFixed(2)} C_N,max. `
      + "That ratio is ASSUMED: no source opened gives it, and it is the only unsourced number in the diagram.",
      "The altitude reductions of 25.341(a)(5)(i) are permissions, not requirements — only 56.0 ft/s at sea "
      + "level is mandatory. Taking them is an election, which this does.",
      "V_C and V_D are inputs with their 25.335 minima checked, not computed. No transport TCDS publishes "
      + "design speeds; the only complete published set in the corpus is the PC-24's.",
      "One weight, one altitude. 25.321(b) requires the envelope over the range of weights and altitudes.",
    ],
  };
}

/* ISA temperature ratio, for the speed of sound. */
function tempRatio(altFt) {
  const h = Math.max(0, altFt) * FT;
  return h < 11000 ? 1 - 2.25577e-5 * h * (1 / (1 - 0)) * 1 : 0.751865;
}

function densityRatio(altFt) {
  const h = Math.max(0, altFt) * FT;
  if (h < 11000) return Math.pow(1 - 2.25577e-5 * h, 4.25588);
  return 0.297076 * Math.exp(-(h - 11000) / 6341.62);
}
