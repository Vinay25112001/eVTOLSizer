/* =====================================================================
   FLOPS DRAG BUILD-UP — the EDET-based polar FLOPS computes internally
   =====================================================================
   A port of NASA Aviary's FLOPS-based computed aerodynamics (commit
   e12742d, aviary/subsystems/aerodynamics/flops_based/, Apache License
   2.0, Copyright 2023 United States Government as represented by the NASA
   Administrator). Aviary reimplements FLOPS AERO; the FLOPS aerodynamic
   manual is not public, so Aviary's Python is the reference, checked
   against polars printed by FLOPS itself for three aircraft
   (validation/transport-aero.mjs; METHODS.md §3.3 in
   eVTOL_Sizing_Research/classes/transport/).

     CD  = FCDSUB · (FCDI · CDI + FCD0 · CD0)                (drag.py)
     CDI = ΔCDP (lift-dependent pressure) + CDi (induced)
     CD0 = CDF (skin friction and form) + CDC (compressibility)

   design point   FLOPS MDESN/CLDESN (premission_aero.py):
                    CL_des = (0.029 + 0.1843 AR) cos Λ (1 + CAM/10)/√AR
                    M_des  = √(1 + table(CL_des, (t/c)^⅔)) + 0.32(1 − cos Λ) + 0.144/AR
   skin friction  Sommer & Short T′ with the Kármán–Schoenherr law, as in
                  FLOPS AERSCL (skin_friction.py); FLOPS iterates, Aviary
                  uses Newton; here the FLOPS fixed-point form is iterated
                  to 1e-13.
   form factors   bodies: a FLOPS polynomial in fineness (Aviary: "origin
                  not clear"), 1 at fineness ≥ 20; surfaces: polynomials in
                  t/c blended by the airfoil technology factor AITEK
                  (1 conventional, 2 advanced) (skin_friction_drag.py).
   laminar flow   percent of chord, FLOPS polynomial, Blasius 1.328/√Re.
   compressibility FLOPS tables PCW, BSUB (ΔM ≤ 0.05) and PCAR, BSUP, WFI
                  (ΔM > 0.05) (compressibility_drag.py).
   pressure drag  the Delta-Method tables (Feagin & Morrison, NASA
                  CR-151971) indexed by A = AR (t/c)^⅓, ΔM and ΔCL
                  (lift_dependent_drag.py).
   induced        CL²/(π AR e); FLOPS input E ≤ 0.3 is added to e₀,
                  otherwise multiplies it (induced_drag.py).

   Table look-ups use OpenMDAO's 'lagrange2' (second-order Lagrange on the
   interval containing the point and the next two grid points, extrapolating
   past the ends) and 'slinear' for the design-Mach tables, as Aviary does.

   Units as FLOPS: ft, ft², lbf/ft², °R. The polar takes pressure and
   temperature, so it can be evaluated anywhere in the mission.
   ===================================================================== */

import { FLOPS_AERO_TABLES as TB } from "./flops-aero-tables.js";

const DEG = 57.2958;                     // FLOPS's degrees per radian
const P_SL_PSF = 14.6959 * 144;          // skin_friction.py
const CONLOG = 2.302585;                 // ln 10
/* FLOPS adds 6 % of the skin-friction drag for excrescences and cannot be
   told otherwise from its input file; Aviary's preprocessor applies the
   same fixed value for FLOPS aerodynamics (aviary/utils/preprocessors.py). */
export const FLOPS_EXCRESCENCE = 0.06;

/* ── interpolation ───────────────────────────────────────────────── */

/* Interval index as OpenMDAO brackets it: grid[i] < x ≤ grid[i+1]
   (at a grid point the stencil choice does not change a quadratic's value);
   0 below the table, n−1 above it. */
function bracket(grid, x) {
  const n = grid.length;
  if (x < grid[0]) return 0;
  if (x > grid[n - 1]) return n - 1;
  let i = 0;
  while (i < n - 2 && x > grid[i + 1]) i++;
  return i;
}

/* Weights of the three stencil points for 'lagrange2'. */
function lagrangeWeights(grid, x) {
  let i = Math.min(bracket(grid, x), grid.length - 3);
  const [g0, g1, g2] = [grid[i], grid[i + 1], grid[i + 2]];
  const x1 = x - g0, x2 = x - g1, x3 = x - g2;
  const c12 = g0 - g1, c13 = g0 - g2, c23 = g1 - g2;
  return { i, w: [x2 * x3 / (c12 * c13), -x1 * x3 / (c12 * c23), x1 * x2 / (c13 * c23)] };
}

export function lagrange1(grid, values, x) {
  const { i, w } = lagrangeWeights(grid, x);
  return w[0] * values[i] + w[1] * values[i + 1] + w[2] * values[i + 2];
}

export function lagrange2(table, x, y) {
  const r = lagrangeWeights(table.rows, x), c = lagrangeWeights(table.cols, y);
  let s = 0;
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) s += r.w[a] * c.w[b] * table.values[r.i + a][c.i + b];
  return s;
}

/* OpenMDAO 'slinear' with extrapolation: linear on the bracketing (or end)
   interval in each dimension. */
function slinearWeights(grid, x) {
  const i = Math.min(bracket(grid, x), grid.length - 2);
  const t = (x - grid[i]) / (grid[i + 1] - grid[i]);
  return { i, w: [1 - t, t] };
}

export function slinear2(table, x, y) {
  const r = slinearWeights(table.rows, x), c = slinearWeights(table.cols, y);
  let s = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) s += r.w[a] * c.w[b] * table.values[r.i + a][c.i + b];
  return s;
}

/* ── design point (MDESN, CLDESN) ────────────────────────────────── */

export function flopsDesignPoint({ aspectRatio: AR, tc, sweepDeg, camber = 0, maxMach, airfoilTech = 1 }) {
  let clDesign;
  if (tc > 0.065) {
    clDesign = (0.029 + 0.1843 * AR) * Math.cos(sweepDeg / DEG) * (1 + camber / 10) / Math.sqrt(AR);
  } else {
    const far = AR * tc ** (1 / 3);
    clDesign = -0.06416 + 0.530389 * far - 0.214493 * far ** 2 + 0.0376684 * far ** 3;
  }
  let m2d;
  if (tc > 0.065 || maxMach < 1) {
    const tc23 = tc ** (2 / 3);
    const ans = slinear2(TB.CMDES, clDesign, tc23) * (2 - airfoilTech)
              + slinear2(TB.AMDES, clDesign, tc23) * (airfoilTech - 1);
    m2d = Math.sqrt(ans + 1);
  } else {
    m2d = slinear2(TB.HSMDES, clDesign, tc);
  }
  const machDesign = m2d + 0.32 * (1 - Math.cos(sweepDeg / DEG)) + 0.144 / AR;
  return { clDesign, machDesign };
}

/* ── skin friction (AERSCL) ──────────────────────────────────────── */

/* Turbulent flat-plate cf and Reynolds number at Mach M, pressure pPsf,
   temperature tR (°R), for a reference length lengthFt. */
export function skinFriction(M, pPsf, tR, lengthFt) {
  const kelvin = tR / 1.8;
  const RE = 1.479301e9 * (pPsf / P_SL_PSF) * (kelvin + 110.4) / kelvin ** 2;   // per ft per unit Mach
  const Re = RE * M * lengthFt;
  const suth = tR + 198.72;
  const comb = 4.593153e-6 * 0.8 * suth / (RE * M * tR ** 1.5);
  const taw = (1 + 0.176 * M * M) * tR;            // adiabatic wall, recovery 0.88
  let tw = taw;
  let cf = (0.242 / (Math.log(Re * 0.0015) / CONLOG)) ** 2;
  let wtr = 1;
  for (let it = 0; it < 500; it++) {
    wtr = 1 + 0.45 * (tw / tR - 1) + 0.035 * M * M;
    const cfl = cf / (1 + 3.59 * Math.sqrt(cf) * wtr);
    const twNew = 0.5 * (taw / (1 + comb * tw ** 3 / cfl) + tw);
    const rp = Re * (wtr * tR + 198.72) / (suth * wtr ** 2.5);
    const cfNew = (0.242 * CONLOG / Math.log(rp * cf)) ** 2;
    const done = Math.abs(twNew - tw) < 1e-13 * tw && Math.abs(cfNew - cf) < 1e-13 * cf;
    tw = twNew; cf = cfNew;
    if (done) break;
  }
  wtr = 1 + 0.45 * (tw / tR - 1) + 0.035 * M * M;
  return { cf: cf / wtr, Re, wallTempR: tw };
}

const FF = [4.34255, -1.14281, 0.171203, -0.0138334, 0.621712e-3, 0.137442e-6,
            -0.145532e-4, 2.94206, 7.16974, 48.8876, -1403.02, 8598.76, -15834.3, 4.275];

/* Form factor of a component: fineness > 0.5 is a body (length/diameter),
   otherwise a lifting surface (t/c). Written exactly as FLOPS has it,
   including the order of the last two body terms (Aviary's note). */
export function formFactor(fineness, airfoilTech) {
  if (fineness > 0.5) {
    if (fineness >= 20) return 1;
    const f = fineness;
    return FF[0] + f * (FF[1] + f * (FF[2] + f * (FF[3] + f * (FF[4] + f * (FF[5] * f + FF[6])))));
  }
  const f = fineness;
  const ff1 = 1 + f * (FF[7] + f * (FF[8] + f * (FF[9] + f * (FF[10] + f * (FF[11] + f * FF[12])))));
  const ff2 = 1 + f * FF[13];
  return ff1 * (2 - airfoilTech) + ff2 * (airfoilTech - 1);
}

const laminarFactor = (pct) => pct * (0.0064164 + pct * (0.48087e-4 - 0.12234e-6 * pct));

/* Skin-friction drag coefficient from each component's turbulent cf and
   Reynolds number (skin_friction_drag.py). comps: [{ wetted, fineness,
   laminarUpper, laminarLower }] with laminar flow in percent of chord. */
export function skinFrictionDragFrom(comps, cf, Re, wingArea, airfoilTech, excrescence) {
  let s = 0;
  comps.forEach((c, j) => {
    if (!(c.wetted > 0)) return;
    const lam = laminarFactor(c.laminarUpper ?? 0) + laminarFactor(c.laminarLower ?? 0);
    const cfj = cf[j] - 0.5 * (cf[j] - 1.328 / Math.sqrt(Re[j])) * lam;
    s += c.wetted * cfj * formFactor(c.fineness, airfoilTech);
  });
  return s / wingArea * (1 + excrescence);
}

/* ── the polar ───────────────────────────────────────────────────── */

/* g: {
     wingArea, aspectRatio, taper, sweepDeg, tc, camber, spanEfficiency,
     spanEfficiencyReduction, airfoilTech, maxMach, excrescence (fraction, default 0.06),
     baseArea, fuselageCrossSection, fuselageLengthToDiameter, fuselageDiameterToSpan,
     components: [{ name, wetted, length, fineness, laminarUpper, laminarLower }],
     factors: { fcdi, fcd0, fcdsub, fcdsup }   (FLOPS FCDI, FCDO, FCDSUB, FCDSUP) } */
export function makeFlopsPolar(g) {
  const need = ["wingArea", "aspectRatio", "taper", "sweepDeg", "tc"];
  for (const k of need) if (!(Number.isFinite(g[k]))) throw new Error(`FLOPS polar needs ${k}`);
  if (!Array.isArray(g.components) || g.components.length === 0) throw new Error("FLOPS polar needs components");
  const AR = g.aspectRatio, tc = g.tc, cam = g.camber ?? 0, sw = g.sweepDeg, tr = g.taper;
  const aitek = g.airfoilTech ?? 1;
  const design = g.design ?? flopsDesignPoint({ aspectRatio: AR, tc, sweepDeg: sw, camber: cam,
                                                 maxMach: g.maxMach ?? 0.8, airfoilTech: aitek });
  const f = { fcdi: 1, fcd0: 1, fcdsub: 1, fcdsup: 1, ...(g.factors || {}) };
  const excr = g.excrescence ?? FLOPS_EXCRESCENCE;
  const comps = g.components.map((c) => ({ ...c, ff: formFactor(c.fineness, aitek) }));
  const A = AR * tc ** (1 / 3);

  function skinFrictionDrag(M, pPsf, tR) {
    const sf = comps.map((c) => skinFriction(M, pPsf, tR, c.length));
    return skinFrictionDragFrom(comps, sf.map((x) => x.cf), sf.map((x) => x.Re), g.wingArea, aitek, excr);
  }

  function compressibilityDrag(M) {
    const dM = M - design.machDesign;
    const fus = g.fuselageCrossSection ?? 0;
    const sos = 1 + (g.baseArea ?? 0) / (fus || 1);
    const bodyScale = fus > 0 ? fus / g.wingArea / g.fuselageLengthToDiameter ** 2 : 0;
    const wingScale = tc ** (5 / 3) * (1 + 0.1 * cam);
    if (dM <= 0.05) {
      const cd1 = Math.max(0, lagrange2(TB.PCW, dM, tc ** (2 / 3)));
      const cd2 = fus > 0 ? Math.max(0, lagrange2(TB.BSUB, M, sos)) : 0;
      return cd1 * wingScale + cd2 * bodyScale;
    }
    const art = AR * Math.tan(sw / DEG) + (1 - tr) / (1 + tr);
    let cd = Math.max(0, lagrange2(TB.PCAR, dM, art)) * wingScale;
    if (fus > 0) {
      cd += Math.max(0, lagrange2(TB.BSUP, M, sos)) * bodyScale;
      if (M >= 1) {
        const trw = tr === 1 ? 0.5 : tr;
        cd += lagrange2(TB.WFI, M, g.fuselageDiameterToSpan) / (1 - trw) / Math.cos(sw / DEG);
      }
    }
    return cd;
  }

  function pressureDrag(M, CL) {
    const x = M - design.machDesign, y = CL - design.clDesign;
    const edge = (a1, a2, t1, t2) => {
      const f1 = lagrange2(t1, x, y), f2 = lagrange2(t2, x, y);
      return 2 * f1 * f2 / ((A - a1) * f1 - (A - a2) * f2);
    };
    const inner = (as, ts) => lagrange1(as, ts.map((t) => lagrange2(t, x, y)), A);
    let fcdp;
    if (x <= 0.075) {
      if (A < 0.5) fcdp = edge(0.5, 1, TB.AR05, TB.AR1);
      else if (A < 6) fcdp = inner([0.5, 1, 2, 4, 6], [TB.AR05, TB.AR1, TB.AR2, TB.AR4, TB.AR6]);
      else fcdp = edge(4, 6, TB.AR4, TB.AR6);
    } else if (A < 0.7) fcdp = edge(0.7, 0.8, TB.ARS07, TB.ARS08);
    else if (A <= 1.4) fcdp = inner([0.7, 0.8, 1.0, 1.2, 1.4], [TB.ARS07, TB.ARS08, TB.ARS10, TB.ARS12, TB.ARS14]);
    else if (A <= 2.0) fcdp = inner([1.2, 1.4, 1.6, 1.8, 2.0], [TB.ARS12, TB.ARS14, TB.ARS16, TB.ARS18, TB.ARS20]);
    else fcdp = edge(1.8, 2.0, TB.ARS18, TB.ARS20);
    return Math.max(0, fcdp * (1 + cam / 10) * A / AR);
  }

  function inducedDrag(M, CL) {
    const e0 = g.spanEfficiencyReduction ? 1 + 0.1 * AR * (0.4226 * Math.sqrt(AR) - 0.35 * tr - 0.143) : 1;
    const E = g.spanEfficiency ?? 1;
    const e = E <= 0.3 ? e0 + E : e0 * E;
    let cdi = CL * CL / (Math.PI * AR * e);
    if (sw < 0) {                                  // forward sweep (Warner Robins factor)
      const th = (1 - tr) / (1 + tr) / AR;
      const tsw = Math.tan(sw / DEG);
      const cosa = 1 / Math.sqrt(1 + (tsw - 3 * th) ** 2);
      const cosb = 1 / Math.sqrt(1 + (tsw + th) ** 2);
      const cayt = 0.5 * ((1.1 - 0.11 / (1.1 - M * cosa)) / (1.1 - 0.11 / (1.1 - M * cosb)) - 1) ** 2;
      cdi += cayt * CL * CL;
    }
    return cdi;
  }

  /* Zero-lift terms depend only on the flight condition: cache the last one. */
  let lastKey = null, lastCd0 = null;
  function zeroLift(M, pPsf, tR) {
    const key = `${M}|${pPsf}|${tR}`;
    if (key !== lastKey) {
      const cdf = skinFrictionDrag(M, pPsf, tR), cdc = compressibilityDrag(M);
      lastCd0 = { cdf, cdc, cd0: cdf + cdc };
      lastKey = key;
    }
    return lastCd0;
  }

  /* Drag coefficient at Mach M, lift coefficient CL, static pressure pPsf
     (lbf/ft²) and temperature tR (°R). */
  function evaluate(M, CL, pPsf, tR) {
    const z = zeroLift(M, pPsf, tR);
    const cdp = pressureDrag(M, CL), cdi = inducedDrag(M, CL);
    const cdiTotal = cdp + cdi;
    const scale = M >= 1 ? f.fcdsup : f.fcdsub;
    const cd = scale * (f.fcdi * cdiTotal + f.fcd0 * z.cd0);
    return { cd, cd0: z.cd0, cdi: cdiTotal, skinFriction: z.cdf, compressibility: z.cdc,
             pressure: cdp, induced: cdi };
  }

  return { evaluate, cd: (M, CL, pPsf, tR) => evaluate(M, CL, pPsf, tR).cd, design, A,
           components: comps.map(({ name, wetted, length, fineness, ff }) => ({ name, wetted, length, fineness, formFactor: ff })) };
}

/* Components of a conventional jet transport, as Aviary's FLOPS geometry
   assembles them (characteristic_lengths.py; order wing, horizontal tail,
   vertical tail, fuselage, nacelles). Wetted areas in ft²: the vertical
   tail's is per tail (Aviary repeats it for each), the nacelles' is the
   total for all engines. */
export function flopsComponents({ wingArea, wingAspectRatio, wingTc, glove = 0,
  htArea, htAspectRatio, htTc, vtArea, vtAspectRatio, vtTc, numVerticalTails = 1,
  fuselageLength, fuselageRefDiameter, nacelleLength, nacelleDiameter, numEngines,
  wetted, laminar = {} }) {
  const lam = (k) => ({ laminarUpper: laminar[k]?.upper ?? 0, laminarLower: laminar[k]?.lower ?? 0 });
  const surf = (area, ar) => (ar > 0 ? Math.sqrt(area / ar) : 0);
  const out = [
    { name: "wing", wetted: wetted.wing, length: Math.sqrt((wingArea - glove) / wingAspectRatio), fineness: wingTc, ...lam("wing") },
  ];
  if (htArea > 0) out.push({ name: "horizontal tail", wetted: wetted.horizontalTail, length: surf(htArea, htAspectRatio), fineness: htTc, ...lam("horizontalTail") });
  for (let i = 0; i < numVerticalTails; i++)
    out.push({ name: "vertical tail", wetted: wetted.verticalTail, length: surf(vtArea, vtAspectRatio), fineness: vtTc, ...lam("verticalTail") });
  out.push({ name: "fuselage", wetted: wetted.fuselage, length: fuselageLength,
             fineness: fuselageLength / fuselageRefDiameter, ...lam("fuselage") });
  for (let i = 0; i < numEngines; i++)
    out.push({ name: "nacelle", wetted: wetted.nacelles / numEngines, length: nacelleLength,
               fineness: nacelleDiameter > 0 ? nacelleLength / nacelleDiameter : 1, ...lam("nacelles") });
  return out;
}
