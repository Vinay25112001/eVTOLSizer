/* ═══════════════════════════════════════════════════════════════════════
   FUSELAGE SHEAR FLOW — Phase E / F4: the transverse shear around the section
   ═══════════════════════════════════════════════════════════════════════
   F1 gives the transverse shear S_y(x) along the fuselage and F2 gives the
   shell that carries it: a ring of radius R and thickness t_shell. This module
   distributes S_y around that ring as a shear flow q(θ), gives the peak skin
   shear stress it implies, and margins it against the material's ultimate
   shear.

   ── THIS IS A DERIVATION, NOT A CITATION ──────────────────────────────
   The research (FUSELAGE-STRUCTURE.md §2) found no vendored primary for the
   boom-idealisation shear flow: TASOPT is a beam model, PDCYL has no shear
   flow, and the textbooks that carry it (Bruhn, Niu, Megson) are in copyright
   and not held. NACA TN 3200 was fetched and rejected — it is a cutout method.
   So the result is DERIVED here in the open from axial equilibrium, the way
   the corpus says to do it, and it is gated on two properties that need no
   source because they are consequences of the same statics:

     1. the resultant of q around the section equals the applied shear, in
        magnitude and direction;
     2. for a section symmetric about the load axis the closing constant is
        zero, and as the boom count grows the discretised q must reproduce
        the thin-ring closed form, which is independent of the discretisation.

   ── THE DERIVATION ────────────────────────────────────────────────────
   Take a skin element between arc positions s and s + ds, of thickness t,
   carrying the bending stress σ = M y / I. Axial equilibrium of the element
   over a length dx, with dM/dx = S_y, gives

       ∂q/∂s = − t y S_y / I .                                            (1)

   Lump the skin into n booms of area B_r at heights y_r (the boom
   idealisation: booms carry bending, panels carry shear). Then (1) becomes a
   JUMP in q across each boom,

       Δq_r = − (S_y / I) B_r y_r ,                                       (2)

   and the flow in the panel after boom r is the running sum from a cut,
   plus one constant q₀ that closes the section. q₀ comes from moment
   equilibrium about any point: the moment of the panel flows must equal
   the moment of the applied shear about that point,

       Σ_r q_r · 2A_r = S_y · e ,                                          (3)

   where 2A_r is twice the area swept from the centre by panel r and e is the
   load line's offset from the centre. For a load through the centre of a
   symmetric section, e = 0, and with the cut placed on the axis of symmetry
   (where q is zero by antisymmetry) q₀ vanishes.

   That the resultant of q is S_y follows from (1) by parts:
   ∫ q dy = ∫ q (dy/ds) ds = − ∫ y (∂q/∂s) ds = (S_y / I) ∫ y² t ds = S_y.
   The harness checks it numerically at every boom count rather than
   trusting the algebra.

   ── THE RING, AND WHY THE BOOMS ARE PLACED WHERE THEY ARE ─────────────
   F2's shell is TASOPT's: I_hshell = π R³ t_shell (A.13), uniform t_shell
   round the section. The boom idealisation that reproduces that inertia
   EXACTLY is n equal booms B = 2π R t_shell / n on the circle, because
   Σ B y_r² = B R² Σ sin² θ_r = B R² n/2 = π R³ t_shell for any n ≥ 3 with
   the booms equally spaced. The harness asserts that identity.

   The booms sit at θ_r = π/2 + π(2r + 1)/n, measured from the starboard
   horizontal, so that NO boom sits on the vertical axis and one panel
   straddles the top. That panel is the cut: by antisymmetry its flow is
   zero for a vertical load through the centre, so the running sum starts
   at zero there and the closing constant the harness reports is the one
   statics demands, not one the discretisation manufactured.

   The thin-ring closed form the discretisation must approach as n → ∞ is

       q(θ) = (S_y / π R) cos θ ,                                          (4)

   zero on the load axis (top and bottom) and largest at the neutral axis.
   It is (1) integrated on a continuous ring with I = π R³ t: the t cancels,
   which is why the peak flow depends on R alone and the peak STRESS is
   q_max / t_skin — the skin, not the stringer-credited t_shell, carries the
   shear (TASOPT credits stringers to the axial path only, (A.7)).

   ── WHAT IS NOT DONE, SAID HERE ───────────────────────────────────────
   - Torsion is not in this. Drela (A.202) sources the torsional case; it is
     a separate load and a separate flow, and it is not summed here.
   - Shear is not combined with the axial and hoop stresses of F2/F3. Each
     is margined alone against its own allowable; no interaction criterion
     is applied because none is sourced.
   - The section is F2's equivalent-area circle of an elliptical shell,
     with the same caveat F2 carries.
   - No cutouts. Doors and windows change the flow locally (NACA TN 3200);
     the uncut solution here is what such a method would perturb.
   ═══════════════════════════════════════════════════════════════════════ */
import { fuselageLoads } from "./fuselage-structure-loads.js";
import { fuselagePressureShell } from "./fuselage-pressure-shell.js";

export const DEFAULT_BOOMS = 32;

/** The continuous thin-ring closed form (4); theta from the starboard horizontal. */
export function thinRingShearFlow({ shearN, radiusM, thetaRad }) {
  return (shearN / (Math.PI * radiusM)) * Math.cos(thetaRad);
}

/**
 * Boom-idealised shear flow round a ring of n equal booms.
 * @returns panels (flow after each boom), the resultant of those flows, the
 *          closing constant, and the inertia the booms carry.
 */
export function boomShearFlow({ shearN, radiusM, tShellM, nBooms = DEFAULT_BOOMS, eccentricityM = 0 }) {
  const n = Math.max(3, Math.floor(nBooms)), R = radiusM;
  const B = (2 * Math.PI * R * tShellM) / n;
  const theta = Array.from({ length: n }, (_, r) => Math.PI / 2 + (Math.PI * (2 * r + 1)) / n);
  const y = theta.map((t) => R * Math.sin(t)), x = theta.map((t) => R * Math.cos(t));
  const I = y.reduce((s, yr) => s + B * yr * yr, 0);                           // Σ B y²

  /* (2): the jump at each boom; the open flow is the running sum starting in
     the cut panel (panel n-1, straddling the top), which carries zero. */
  const dq = y.map((yr) => -(shearN / I) * B * yr);
  const qOpen = new Array(n).fill(0);
  let run = 0;
  for (let r = 0; r < n - 1; r++) { run += dq[r]; qOpen[r] = run; }
  qOpen[n - 1] = 0;

  /* (3): twice the swept area of each panel about the centre, then the
     closing constant from moment equilibrium about the centre. */
  const twoA = theta.map((_, r) => {
    const a = r, b = (r + 1) % n;
    return x[a] * y[b] - x[b] * y[a];                                          // 2 × triangle (centre, a, b)
  });
  const twoAtotal = twoA.reduce((s, v) => s + v, 0);
  const momentOpen = qOpen.reduce((s, q, r) => s + q * twoA[r], 0);
  const q0 = (shearN * eccentricityM - momentOpen) / twoAtotal;
  const q = qOpen.map((v) => v + q0);

  /* The resultant: each panel's force is its flow times its chord vector. */
  let fx = 0, fy = 0;
  for (let r = 0; r < n; r++) {
    const a = r, b = (r + 1) % n;
    fx += q[r] * (x[b] - x[a]);
    fy += q[r] * (y[b] - y[a]);
  }
  const panels = theta.map((_, r) => {
    const a = r, b = (r + 1) % n;
    let mid = (theta[a] + theta[b]) / 2;
    if (b === 0) mid = theta[a] + Math.PI / n;                                 // the straddling panel
    return { panel: r, thetaMidRad: mid, qNPerM: q[r], thinRingNPerM: thinRingShearFlow({ shearN, radiusM: R, thetaRad: mid }) };
  });
  const qMax = panels.reduce((m, p) => Math.max(m, Math.abs(p.qNPerM)), 0);
  return {
    nBooms: n, boomAreaM2: B, boomThetaRad: theta, inertiaM4: I,
    ringInertiaM4: Math.PI * R ** 3 * tShellM,
    panels, closingConstantNPerM: q0, resultant: { fxN: fx, fyN: fy },
    qMaxNPerM: qMax,
    thinRingQMaxNPerM: Math.abs(shearN) / (Math.PI * R),
  };
}

export function fuselageShearFlow(result, opts = {}) {
  const nBooms = opts.nBooms ?? DEFAULT_BOOMS;
  const shell = fuselagePressureShell(result, opts);
  const type = shell?.type ?? result?.type ?? null;
  if (!shell || shell.evaluated === false) {
    return { type, label: shell?.label ?? null, evaluated: false,
             reason: shell?.reason ?? shell?.why ?? "the pressure shell did not evaluate, so there is no t_shell to distribute the shear over",
             upstream: "fuselagePressureShell" };
  }
  const loads = fuselageLoads(result, opts);
  if (!loads || loads.unavailable) {
    return { type, label: loads?.label ?? shell.label, evaluated: false,
             reason: loads?.reason ?? loads?.why ?? "the fuselage loads did not evaluate", upstream: "fuselageLoads" };
  }
  const R = shell.geometry.radiusM;
  const { tSkinM, tShellM } = shell.skin;
  const mat = shell.material;

  const scenarios = loads.scenarios.map((sc) => {
    const peak = sc.stations.reduce((a, s) => (Math.abs(s.shearN) > Math.abs(a.shearN) ? s : a));
    const ring = boomShearFlow({ shearN: peak.shearN, radiusM: R, tShellM, nBooms });
    const tauMaxPa = ring.qMaxNPerM / tSkinM;
    const along = sc.stations.map((s) => {
      const qMax = Math.abs(s.shearN) / (Math.PI * R);                        // (4) at the neutral axis
      return { x: s.x, shearN: s.shearN, qMaxNPerM: qMax, tauMaxPa: qMax / tSkinM };
    });
    return {
      id: sc.id, label: sc.label, nFactor: sc.nFactor,
      peakShearN: peak.shearN, peakShearXM: peak.x,
      ring, qMaxNPerM: ring.qMaxNPerM, tauMaxPa,
      marginShearUltimate: mat.fsu / tauMaxPa - 1,
      along,
    };
  });
  const governing = scenarios.reduce((a, c) => (c.tauMaxPa > a.tauMaxPa ? c : a));

  return {
    type, label: loads.label, evaluated: true,
    basis: "DERIVED, NOT CITED",
    derivation: "Axial equilibrium of a skin element carrying M y / I with dM/dx = S_y gives dq/ds = -t y S_y / I; "
              + "lumped into n equal booms B = 2 pi R t_shell / n on the ring, the jump at boom r is "
              + "dq_r = -(S_y / I) B y_r, the open flow is the running sum from a panel on the axis of symmetry, "
              + "and the closing constant comes from moment equilibrium about the centre. Gated on the resultant "
              + "equalling S_y and on convergence to q = (S_y / pi R) cos(theta). No textbook was opened for it "
              + "and none is cited.",
    section: { radiusM: R, tSkinM, tShellM, nBooms, material: { id: mat.id, fsuPa: mat.fsu },
               boomAreaM2: (2 * Math.PI * R * tShellM) / nBooms },
    scenarios, governing: governing.id,
    peak: { scenario: governing.id, xM: governing.peakShearXM, shearN: governing.peakShearN,
            qMaxNPerM: governing.qMaxNPerM, tauMaxPa: governing.tauMaxPa,
            marginShearUltimate: governing.marginShearUltimate },
    caveats: [
      "Torsion is not included: Drela (A.202) sources it as a separate flow and it is not summed here.",
      "Shear is margined alone against F_su; it is not combined with F2's hoop and axial or F3's bending stress, "
      + "because no interaction criterion is sourced.",
      "The section is F2's equivalent-area circle of the elliptical shell, with F2's caveat.",
      "The skin thickness that carries the shear is t_skin; t_shell credits stringers to the axial path only "
      + "(TASOPT (A.7)) and is used for the boom areas, not for the stress.",
      "No cutouts: doors and windows perturb this flow locally (NACA TN 3200) and are out of scope.",
      "The shear allowable F_su is the wing box's material table, the same choice F2 makes for its allowables.",
    ],
    sources: {
      shearFlow: "derived in this module's header from axial equilibrium; research note "
               + "eVTOL_Sizing_Research/classes/cross-class/FUSELAGE-STRUCTURE.md section 2.1",
      shell: shell.sources ?? "MIT TASOPT 2.00 (Drela) Appendix A, (A.7), (A.13)",
      loads: loads.sources,
    },
  };
}
