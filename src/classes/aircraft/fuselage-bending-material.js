/* =====================================================================
   ADDED BENDING MATERIAL  —  Phase E, package F3
   =====================================================================
   F1 bent the fuselage and gave M(x). F2 pressurized it and gave the
   shell's own inertia I_hshell and axial pressure stress. This module
   asks the question the two were built for: where the shell alone is
   not stiff enough for the bending moment, how much material must be
   ADDED, top and bottom, to hold the axial stress to an allowable - and
   what that material weighs.

   WHAT IS SOURCED - MIT TASOPT 2.00 (Drela), Appendix A

     (A.84)  E_bend eps_x = E_bend (eps_bend + eps_press) <= sigma_bend
     (A.85)  r_E [ M(x) h / (I_hshell + r_E I_hbend) + dp R/(2 t_shell) ] <= sigma_bend
     (A.86)  h_fuse = R + dR/2  = R here (circular)
     (A.87)  I_hbend(x) = max( M(x) h / sigma_Mh - I_hshell / r_E , 0 )
     (A.88)  sigma_Mh = sigma_bend - r_E dp R / (2 t_shell)
     (A.89)  A_hbend(x) = I_hbend / h^2   [ = A2 (x_shell2 - x)^2 + A1 (x_tail - x) + A0 ]
     (A.90)-(A.92)  A2, A1, A0 from the smeared loads of (A.79)
     (A.93)-(A.94)  x_f, x_b: the wing box ends
     (A.95)-(A.96)  V_front, V_back = integral of A_hbend from the box to x_hbend
     (A.97)  V_centre = 1/2 [A(x_b) + A(x_f)] c_o w_bar   - LINEAR over the box
     (A.98)-(A.100)  V, W_hbend = rho_bend g V, at x_wing

   The source's remark, kept: "If this quadratic has no real solution,
   then the inequality holds for M_h(x) = 0 everywhere, and no added
   bending material is needed."

   TWO ROUTES AGAIN, AND THE SAME DEMAND

   STATIONED: (A.87) evaluated at every station on F1's REAL moment
   diagram - both sides of the wing, the front computed rather than
   mirrored. SMEARED: (A.89)-(A.92) in closed form from the same
   smeared loads F1 already reports. F1 also reports the smeared moment
   at every station, so under matched assumptions the stationed formula
   fed the smeared moment must reproduce the closed form EXACTLY, and
   the gate demands that. Their VOLUMES are compared too, and there the
   stationed route integrates numerically, so that check is a bound
   from the trapezoid rule's own error, not an identity - and it is
   labelled as such.

   WHAT IS CHOSEN, AND SAID

   - sigma_bend. TASOPT states it only for the CFRP D8.5 (N3-D8 Table
     12, 49.5 ksi, "unnotched compression ... 2.0 factor of safety").
     Nothing states it for aluminium. A bending cap has one side in
     COMPRESSION, and TASOPT's own justification is a compression
     allowable, so the material's compression yield F_cy is used, at
     F1's ULTIMATE load factor. That is conservative for the tension
     cap and says nothing about crippling or panel buckling, which is
     F5. `opts.sigmaBendPa` overrides it.
   - r_E = 1: skin and added material the same alloy unless told.
   - dp is F2's input, with F2's rule: no dp, no shell, no F3. The
     pressure term in (A.88) is not small - it eats into the allowable
     before any bending is carried.

   WHERE THE PEAK STANDS, AND WHY THAT IS NOT A FINDING

   TASOPT matches the front and back M(x) at x_wing, the spar-box AXIS
   at the wing's AREA CENTROID, (A.136)-(A.137). On a swept wing that
   point is aft of the centreline box: the source says so ("the wing
   box location xwbox will be centered somewhat ahead of xwing"), and
   (A.93)-(A.94) start the front and back integrals at the ROOT box
   faces, x_wbox -/+ half the root box width, with the front limit
   mirrored about x_wing. So the peak is legitimately aft of the root
   rear spar by Delta x_wing less the axis-to-rear-spar part of the
   root chord, and the box bridges the difference with a pitch moment.

   The first version of this module compared x_wing against the ROOT
   box and reported the peak as "outside the wing box". That was a
   datum error, not a structural finding, and it is withdrawn: the
   module now reports x_wbox against the box (where it must lie), the
   sweep offset, and the stand-off as the geometry it is.
   ===================================================================== */
import { fuselageLoads } from "./fuselage-structure-loads.js";
import { fuselagePressureShell } from "./fuselage-pressure-shell.js";
import { balanceOf } from "./balance.js";
import { G0 } from "../../engine/constants.js";

const finite = (x) => (Number.isFinite(x) ? x : null);

/* (A.87)-(A.89) at one station, from a moment. Exported so the gate can
   feed it the smeared moment and compare with the closed form. */
export function addedInertiaM4({ momentNm, hM, sigmaMhPa, iShellM4, rE }) {
  return Math.max((Math.abs(momentNm) * hM) / sigmaMhPa - iShellM4 / rE, 0);
}

/* (A.89)-(A.92): the closed-form added area of the smeared model. */
export function tasoptA89({ x, nFactor, distributedWeightN, lShell, xShell2, tailWeightN, tailAeroN, xTail,
                            hM, sigmaMhPa, iShellM4, rE }) {
  const A2 = (nFactor * distributedWeightN) / (2 * lShell * hM * sigmaMhPa);      // (A.90)
  const A1 = (nFactor * tailWeightN + tailAeroN) / (hM * sigmaMhPa);              // (A.91)
  const A0 = -iShellM4 / (rE * hM * hM);                                          // (A.92)
  return { A: Math.max(A2 * (xShell2 - x) ** 2 + A1 * (xTail - x) + A0, 0), A2, A1, A0 };
}

/* Trapezoid over a grid between ANY two x's, with the end cells cut at
   the exact limits by linear interpolation. The first version snapped
   the limits to the nearest node; on a transport that moved each end by
   up to 0.12 m across a region where A(x) is at its largest, and the
   volume came out 9 % off a closed form it should have matched to four
   figures. End-snapping is not quadrature error, and it was the whole
   of the difference. */
function integrate(grid, y, xa, xb) {
  if (!(xb > xa)) return 0;
  const at = (x) => {
    if (x <= grid[0]) return y[0];
    if (x >= grid[grid.length - 1]) return y[y.length - 1];
    let i = 0;
    while (grid[i + 1] < x) i++;
    const f = (x - grid[i]) / (grid[i + 1] - grid[i]);
    return y[i] + f * (y[i + 1] - y[i]);
  };
  const xs = [xa, ...grid.filter((g) => g > xa && g < xb), xb];
  let v = 0;
  for (let i = 0; i < xs.length - 1; i++) v += 0.5 * (at(xs[i]) + at(xs[i + 1])) * (xs[i + 1] - xs[i]);
  return v;
}

/* Composite Simpson of a function between two limits. Exact for a
   quadratic, which is what (A.89) is between the box and x_hbend - so
   the integral of the closed-form area recovers (A.96) to rounding, and
   a wrong coefficient in that transcription cannot hide. */
function simpson(f, xa, xb, n = 64) {
  if (!(xb > xa)) return 0;
  const h = (xb - xa) / n;
  let s = f(xa) + f(xb);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(xa + i * h);
  return (s * h) / 3;
}

export function fuselageBendingMaterial(result, opts = {}) {
  const loads = fuselageLoads(result, opts);
  if (!loads) return null;
  if (loads.unavailable) return { type: loads.type, label: loads.label, evaluated: false, why: loads.reason };
  const shell = fuselagePressureShell(result, opts);
  if (!shell) return null;
  if (!shell.applies) return { type: shell.type, label: shell.label, evaluated: false, why: shell.why };
  if (!shell.evaluated) {
    return { type: shell.type, label: shell.label, evaluated: false,
      why: "The added bending material needs the shell's own inertia and its pressure stress, and the shell is "
         + "not sized without dp. " + shell.why };
  }
  const bal = balanceOf(result, opts);
  const type = loads.type;

  const mat = shell.material;
  const rE = 1;
  const sigmaBendPa = finite(opts.sigmaBendPa) ?? mat.fcy;
  const sigmaBendBasis = finite(opts.sigmaBendPa) !== null
    ? "supplied as opts.sigmaBendPa"
    : `${mat.label} compression yield F_cy - a bending cap has one side in compression, and TASOPT's own `
      + "justification for sigma_bend (N3-D8 Table 12) is a compression allowable. Applied at the ultimate "
      + "load factor F1 uses.";
  const hM = shell.geometry.radiusM;                                                // (A.86), circular
  const pressureAxialPa = rE * shell.stress.sigmaXPa;                               // r_E dp R / (2 t_shell)
  const sigmaMhPa = sigmaBendPa - pressureAxialPa;                                  // (A.88)
  if (!(sigmaMhPa > 0)) {
    return { type, label: loads.label, evaluated: false,
      why: `The pressure axial stress alone (${(pressureAxialPa / 1e6).toFixed(1)} MPa) exceeds the bending `
         + `allowable (${(sigmaBendPa / 1e6).toFixed(1)} MPa); (A.88) leaves nothing for bending. Raise the `
         + "allowable, lower dp, or thicken the shell." };
  }
  const iShellM4 = shell.skin.iShellM4;

  /* ── the wing box, as the tool draws it, for (A.93)-(A.94), (A.97) ─── */
  const ld = bal.loadingDiagram;
  const xB = finite(ld?.boxFwd), xF = finite(ld?.boxAft);
  const boxKnown = xB !== null && xF !== null && xF > xB;
  const xWing = loads.geometry.xWing;

  /* ── every scenario F1 evaluated ───────────────────────────────────── */
  const scenarios = loads.scenarios.map((sc) => {
    const grid = sc.stations.map((s) => s.x);
    /* STATIONED, (A.87)-(A.89) on the real moment. */
    const stations = sc.stations.map((s) => {
      const I = addedInertiaM4({ momentNm: s.momentNm, hM, sigmaMhPa, iShellM4, rE });
      const Ism = addedInertiaM4({ momentNm: s.smearedMomentNm, hM, sigmaMhPa, iShellM4, rE });
      return { x: s.x, momentNm: s.momentNm, iHbendM4: I, aHbendM2: I / (hM * hM),
               aHbendSmearedM2: Ism / (hM * hM),
               /* the stress the shell alone would see, and what it sees with the added material */
               sigmaShellOnlyPa: pressureAxialPa + (Math.abs(s.momentNm) * hM) / iShellM4 * rE,
               sigmaWithAddedPa: pressureAxialPa + (Math.abs(s.momentNm) * hM) / (iShellM4 + rE * I) * rE };
    });
    /* SMEARED, (A.89)-(A.92) in closed form, from F1's own smeared basis. */
    const sb = sc.smearedBasis;
    const closed = grid.map((x) => tasoptA89({
      x, nFactor: sc.nFactor, distributedWeightN: sb.distributedWeightN, lShell: loads.geometry.lShell,
      xShell2: loads.geometry.shellAftX, tailWeightN: loads.geometry.tailMassKg * G0, tailAeroN: sc.tailAeroN,
      xTail: loads.geometry.xTail, hM, sigmaMhPa, iShellM4, rE,
    }));
    const coeffs = closed[0];

    /* x_hbend: where the added area returns to zero, aft of the box. On the
       stationed route it is the first station aft of the peak with A = 0;
       on the closed form it is the quadratic's root. */
    const aft = stations.filter((s) => s.x >= xWing);
    const firstZero = aft.find((s) => s.aHbendM2 <= 0);
    const xHbendStationed = firstZero ? firstZero.x : null;
    /* The closed form's x_hbend. The source: "If this quadratic has no real
       solution, then the inequality holds ... and no added bending material
       is needed." The first version of this module stopped there and got
       NEGATIVE volumes on two classes: the quadratic HAD real roots, both
       far aft of the fuselage, and integrating (A.96) out to one of them
       summed a region where A(x) is below zero everywhere. The rule that
       is actually needed is one step earlier: aft of the box, both terms
       of A(x) fall as x grows, so A is monotone decreasing there, and
       material exists only if A(x_f) > 0. Then x_hbend is the single
       downward crossing aft of x_f - the SMALLER root above x_f. If
       A(x_f) <= 0 there is no material and no integral, whatever the
       roots say. */
    const xf0 = boxKnown ? xF : xWing;
    const aAtXf = tasoptA89({
      x: xf0, nFactor: sc.nFactor, distributedWeightN: sb.distributedWeightN, lShell: loads.geometry.lShell,
      xShell2: loads.geometry.shellAftX, tailWeightN: loads.geometry.tailMassKg * G0, tailAeroN: sc.tailAeroN,
      xTail: loads.geometry.xTail, hM, sigmaMhPa, iShellM4, rE,
    }).A;
    let xHbendClosed = null;
    if (aAtXf > 0) {
      const { A2, A1, A0 } = coeffs, x2 = loads.geometry.shellAftX, xt = loads.geometry.xTail;
      /* A2 (x2-x)^2 + A1 (xt-x) + A0 = 0  ->  A2 x^2 - (2 A2 x2 + A1) x + (A2 x2^2 + A1 xt + A0) = 0 */
      const a = A2, b = -(2 * A2 * x2 + A1), c = A2 * x2 * x2 + A1 * xt + A0;
      const disc = b * b - 4 * a * c;
      if (a > 0 && disc >= 0) {
        const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
        xHbendClosed = [r1, r2].filter((r) => r > xf0).sort((p, q) => p - q)[0] ?? null;
      } else if (a === 0 && A1 > 0) {
        xHbendClosed = xt + A0 / A1;                       // linear case: no distributed term
      }
    }

    /* Volumes. Front and back are integrals of the real A over the grid,
       outside the box; the centre is (A.97)'s linear bridge across it. */
    const aS = stations.map((s) => s.aHbendM2);
    const xb = boxKnown ? xB : xWing, xf = boxKnown ? xF : xWing;
    const xEndAft = xHbendStationed ?? loads.geometry.fuselageLengthM;
    const atX = (x) => integrate(grid, aS, x, x + 1e-9) / 1e-9;   // A(x) by the same interpolation
    const vBack = integrate(grid, aS, xf, xEndAft);
    /* the front: the stationed route has a real forward diagram, so it is
       integrated from the nose to the front spar rather than mirrored */
    const vFront = integrate(grid, aS, grid[0], xb);
    const vCentre = boxKnown ? 0.5 * (atX(xb) + atX(xf)) * (xf - xb) : 0;                     // (A.97)
    const vTotal = vFront + vCentre + vBack;                                                  // (A.98)
    const massKg = mat.rho * vTotal;                                                          // (A.99) / g

    /* The closed form's own back volume, (A.96), and the SAME smeared
       area integrated numerically on the grid. Those two are the same
       model - so their difference is the trapezoid rule's error and
       nothing else, which is what lets the gate bound it from the rule
       rather than from a tolerance picked after the fact. The stationed
       volume above is a DIFFERENT model (the real moment) and is not
       compared to (A.96) at all. */
    let vClosedBack = 0, vSmearedBack = 0;
    if (xHbendClosed !== null) {
      const { A2, A1, A0 } = coeffs, x2 = loads.geometry.shellAftX, xt = loads.geometry.xTail, xh = xHbendClosed;
      vClosedBack = A2 / 3 * ((x2 - xf) ** 3 - (x2 - xh) ** 3) + A1 / 2 * ((xt - xf) ** 2 - (xt - xh) ** 2) + A0 * (xh - xf);
      const closedA = (x) => tasoptA89({
        x, nFactor: sc.nFactor, distributedWeightN: sb.distributedWeightN, lShell: loads.geometry.lShell,
        xShell2: loads.geometry.shellAftX, tailWeightN: loads.geometry.tailMassKg * G0, tailAeroN: sc.tailAeroN,
        xTail: loads.geometry.xTail, hM, sigmaMhPa, iShellM4, rE,
      }).A;
      vSmearedBack = simpson(closedA, xf, xh);
    }
    const needed = stations.some((s) => s.aHbendM2 > 0);
    const peak = needed ? stations.reduce((a, s) => (s.aHbendM2 > a.aHbendM2 ? s : a)) : null;

    return {
      id: sc.id, label: sc.label, nFactor: sc.nFactor, tailAeroN: sc.tailAeroN,
      stations, coeffs, needed,
      peak: peak === null ? null
        : { xM: peak.x, aHbendM2: peak.aHbendM2, iHbendM4: peak.iHbendM4,
            sigmaShellOnlyPa: peak.sigmaShellOnlyPa, sigmaWithAddedPa: peak.sigmaWithAddedPa },
      /* the worst shell-only stress is reported whether or not material is
         needed: it is the margin the shell has, or has not */
      worstShellOnly: stations.reduce((a, s) => (s.sigmaShellOnlyPa > a.sigmaShellOnlyPa ? s : a)),
      xHbend: { stationedM: xHbendStationed, closedM: xHbendClosed, closedAreaAtBoxM2: aAtXf },
      volume: { frontM3: vFront, centreM3: vCentre, backM3: vBack, totalM3: vTotal,
                closedBackM3: vClosedBack, smearedBackM3: vSmearedBack,
                box: { xbM: xb, xfM: xf, known: boxKnown } },
      massKg,
    };
  });

  const governing = scenarios.reduce((a, c) => (c.massKg > a.massKg ? c : a));

  /* ── the budget against FLOPS ───────────────────────────────────────── */
  const flopsKg = shell.crossCheck.available ? shell.crossCheck.fuselageItemKg : null;
  const budget = flopsKg !== null
    ? { flopsFuselageKg: flopsKg, skinKg: shell.skinMass.builtKg, addedKg: governing.massKg,
        skinPlusAddedKg: shell.skinMass.builtKg + governing.massKg,
        fractionOfFlops: (shell.skinMass.builtKg + governing.massKg) / flopsKg,
        fits: shell.skinMass.builtKg + governing.massKg < flopsKg,
        reading: "Skin plus added bending material is the part of the fuselage TASOPT sizes from mechanics; frames, "
               + "floor, doors, windows and fasteners are the rest. FLOPS's regression is the whole. The sum must "
               + "be smaller than the whole, and the remainder is what F5 and the unmodelled items must weigh." }
    : { available: false };

  return {
    type, label: loads.label, evaluated: true,
    input: { deltaPPa: shell.input.deltaPPa, sigmaBendPa, sigmaBendBasis, rE,
             pressureAxialPa, sigmaMhPa, hM, iShellM4, tShellM: shell.skin.tShellM,
             stringersCredited: shell.input.stringersCredited },
    wingBox: { xbM: boxKnown ? xB : null, xfM: boxKnown ? xF : null, known: boxKnown,
               xWingM: xWing,
               xWboxM: loads.geometry.wingStation?.xWbox ?? null,
               sweepOffsetM: loads.geometry.wingStation?.dxWing ?? null,
               /* the axis at the centreline has to lie inside the centreline box */
               axisInsideBox: boxKnown && Number.isFinite(loads.geometry.wingStation?.xWbox)
                 ? (loads.geometry.wingStation.xWbox >= xB && loads.geometry.wingStation.xWbox <= xF) : null,
               /* positive on a swept wing: x_wing aft of the ROOT rear spar, by (A.137)'s offset */
               peakAftOfRearSparM: boxKnown ? xWing - xF : null },
    scenarios, governing: governing.id,
    budget,
    sources: {
      bending: "MIT TASOPT 2.00 (Drela) Appendix A eqs. (A.84)-(A.100). FUSELAGE-STRUCTURE.md section 1.1.",
      moment: "fuselage-structure-loads.js (F1): the stationed M(x) and the smeared basis of (A.79).",
      shell: "fuselage-pressure-shell.js (F2): t_shell, I_hshell and the pressure axial stress of (A.14).",
      allowable: sigmaBendBasis,
    },
    caveats: [
      "THE ALLOWABLE IS A CHOICE. TASOPT states sigma_bend only for a CFRP D8.5. Compression yield of the skin "
      + "alloy is used here, at F1's ultimate load factor. No crippling, no panel buckling, no fatigue: those are "
      + "F5 and beyond, and a real cap is sized by them.",
      "THE PEAK STANDS AFT OF THE ROOT REAR SPAR ON A SWEPT WING, BY THE SOURCE'S OWN CONSTRUCTION. F1 matches its "
      + "cantilevers at TASOPT's x_wing, the spar-box axis at the wing's area centroid (A.136)-(A.137), and "
      + "(A.93)-(A.94) start the added-material integrals at the ROOT box faces; the sweep offset between the two "
      + "is carried by the box as a pitch moment. The bridge of (A.97) is drawn across the root box the tool "
      + "draws. An earlier version of this module reported that stand-off as the peak being \"outside the wing "
      + "box\"; that compared a MAC station with a root box and is withdrawn.",
      "THE FRONT FUSELAGE IS COMPUTED, NOT MIRRORED. TASOPT gets V_front by symmetry; the stationed route "
      + "integrates the forward diagram F1 actually has. The two differ ahead of the wing by design.",
      "VERTICAL-AXIS BENDING (A.101)-(A.110) IS NOT BUILT. It needs L_vmax = q_NE S_v CL_vmax, and CL_vmax is "
      + "unsourced for the same reason CL_hmax is. Nothing here sizes the fuselage sides.",
      "r_E = 1 and the added material is the skin alloy. TASOPT allows a different stringer material; none is "
      + "specified here.",
      "VOLUMES ARE TRAPEZOIDAL on F1's grid, exact for the stations and second-order for the integral. The "
      + "gate bounds the difference from (A.95)-(A.96) by the rule's own error, not by a tolerance chosen "
      + "after the fact.",
      ...(loads.tailAero.evaluated ? [] : ["THE TAIL AIRLOAD IS NOT IN M(x). F1 reports it not evaluated "
        + "without CL_hmax, so the added material here is for the WEIGHT terms alone. Supplying opts.clHMax "
        + "roughly doubles the transport's moment and the material with it."]),
    ],
  };
}
