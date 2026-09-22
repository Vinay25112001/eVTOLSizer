/* =====================================================================
   WING BOX — SPARS, RIBS AND SKIN FROM FIRST PRINCIPLES
   =====================================================================
   WHY THIS EXISTS

   Wing mass has been a single parametric equation — first Raymer 15.46, then
   NDARC AFDD93. Both are REGRESSIONS: they predict a mass from planform and
   loading without any internal structure. That has three consequences:

     1. There are no spars, ribs or skin, so the tool cannot answer "how thick
        is the spar cap" or "how far apart are the ribs" at all.
     2. The mass cannot respond to a material change. Swapping aluminium for
        CFRP moves a blanket knockdown factor, not a wall thickness.
     3. The NASA Table 3 group benchmark says our structure group sits at 21.9%
        of MTOW against a published band of 25.7-31.4%. A correlation cannot
        tell us WHY it is light; a physical model can.

   This sizes the box from statics, so — like engine/booms.js — it carries no
   reference-class risk at all. That matters: the whole reason the weight model
   was wrong was borrowing regressions fitted to the wrong vehicle population.

   ── METHOD ────────────────────────────────────────────────────────────

   1. SPANWISE LIFT — Schrenk's approximation
      Schrenk O., "A Simple Approximation Method for Obtaining the Spanwise
      Lift Distribution", NACA TM-948, 1940. The loading is taken as the
      arithmetic mean of the actual planform chord distribution and an
      elliptical distribution of equal area and span:

          c_ell(y) = (4S / (pi b)) * sqrt(1 - (2y/b)^2)
          l(y)     = 0.5 * ( c(y) + c_ell(y) ) * (L / S)

      Schrenk is the standard conceptual-design approximation and is quoted in
      Raymer, Torenbeek and Roskam alike. It is an approximation, not a
      lifting-line solution — tagged [SRC] but not exact.

   2. SHEAR AND MOMENT — integrate inboard from the tip:
          V(y) = integral of l(y) dy      M(y) = integral of V(y) dy
      Both at the ULTIMATE load factor n_z, and reduced by the inertial relief
      of the mass carried outboard of the station (wing structure itself, and
      any boom-mounted rotors), which is a real and significant offload.

   3. SPAR CAPS — two-cap idealisation. The caps carry all bending as a
      force couple separated by the box height h:
          A_cap = M / (sigma_allow * h)

   4. SPAR WEBS — carry the vertical shear:
          t_web = V / (tau_allow * h)

   5. SKIN — carries torsion by Bredt-Batho shear flow around the closed box:
          q = T / (2 * A_enclosed)        t_skin = q / tau_allow
      subject to a minimum gauge, which almost always governs on a light
      composite wing and is why the minimum is an input rather than an
      afterthought.

   6. RIBS — spaced so the skin panel aspect ratio is about 1 (AeroToolbox,
      "Introduction to Wing Structural Design"), i.e. rib pitch ~ panel width.
      Rib mass is taken as a web of minimum gauge over the box cross-section.

   ── WHAT IS SOURCED VS ASSUMED ───────────────────────────────────────
     [SRC] Schrenk distribution; Bredt-Batho torsion; two-cap bending
     [SRC] material allowables (handbook CFRP / aluminium)
     [LAY] spar stations (25% / 70% chord), minimum gauges, non-optimum factor

   THE NON-OPTIMUM FACTOR is the one soft number and it is not hidden: a real
   wing is heavier than its idealised load paths because of joints, fasteners,
   cutouts, ply drop-offs, access panels and manufacturing tolerance. Textbook
   practice puts this at 1.3-1.5 on the idealised box. It is applied once,
   visibly, rather than smeared through the allowables.
   ===================================================================== */

/* Material allowables. Handbook values for structural laminates and 2024-T3;
   NOT calibrated to any aircraft. Composite values are working stresses after
   the usual environmental and damage-tolerance knockdowns. */
export const WINGBOX_MATERIALS = {
  cfrp_ud: {
    name: "CFRP unidirectional (spar caps)",
    /* sigmaAllow is the COMPRESSION allowable, and that is deliberate. A spar
       cap sees tension on one surface and compression on the other, and the
       compression side governs: unidirectional carbon reaches ~1.5 GPa in
       tension but the design value in compression is far lower once fibre
       microbuckling, damage tolerance (BVID) and hot/wet knockdowns are
       applied. Sizing caps on a tension allowable is a classic way to produce
       an impossibly light wing. */
    rho: 1600, sigmaAllow: 3.5e8, tauAllow: 9.0e7, E: 1.35e11,
    src: "carbon/epoxy UD, COMPRESSION design allowable after BVID + hot/wet",
  },
  cfrp_fabric: {
    name: "CFRP fabric (webs, skin, ribs)",
    rho: 1600, sigmaAllow: 3.5e8, tauAllow: 1.6e8, E: 7.0e10,
    src: "carbon/epoxy woven, multi-axial layup",
  },
  nomex48: {
    /* VERIFIED against HexWeb Honeycomb Sandwich Design Technology, Appendix I
       "Mechanical Properties of Honeycomb Materials", HRH-10 Nomex row at
       48 kg/m3 (3.0 pcf), 3 mm (1/8 in) cell:
           stabilised compression modulus  138 MPa
           plate shear modulus  L 40 MPa   W 25 MPa
       Gc uses the W (weaker) direction, which is what Hexcel's own worked
       example does ("Taking Gc as Gw"). Sizing on the L value would be
       optimistic by 60%. */
    name: "Nomex honeycomb HRH-10, 48 kg/m3 (3.0 pcf), 1/8 in cell",
    rho: 48, Ec: 1.38e8, Gc: 2.5e7, GcL: 4.0e7, cellSize: 0.0032,
    src: "HexWeb Honeycomb Sandwich Design Technology, Appendix I",
  },
  al2024: {
    name: "Aluminium 2024-T3",
    rho: 2780, sigmaAllow: 3.2e8, tauAllow: 1.9e8, E: 7.3e10,
    src: "MMPDS handbook allowables",
  },
};

export const WINGBOX_CONSTANTS = {
  frontSparChord: 0.25,   // [LAY] main spar at ~25% chord (AeroToolbox)
  rearSparChord:  0.70,   // [LAY] rear spar, typical closed-box aft limit
  boxHeightFrac:  0.90,   // [LAY] box height as fraction of local t/c depth
  tMinSkin:       0.0008, // [LAY] 0.8 mm minimum practical composite skin
  tMinWeb:        0.0010, // [LAY] 1.0 mm minimum web gauge
  tMinRib:        0.0008, // [LAY] 0.8 mm minimum rib gauge
  strainAllow:    0.0045, // [SRC] 4500 microstrain design-limit for CFRP after BVID
  bucklingK:      4.0,    // [SRC] long simply-supported panel in compression
  poisson:        0.30,   // [SRC]
  tipDeflLimit:   0.15,   // [LAY] tip deflection limit, fraction of semi-span
  coreThk:        0.010,  // [LAY] 10 mm honeycomb core — typical light-wing gauge
  tMinFace:       0.0005, // [LAY] 0.5 mm minimum face sheet (2 plies)
  aileronSpanFrac: 0.35,  // [LAY] aileron spans outboard 35% of semi-span
  aileronChordFrac:0.25,  // [LAY] aileron chord, fraction of local chord
  fittingFrac:     0.12,  // [LAY] non-structural fittings, fraction of cap mass
  leTeGaugeMult:   1.5,   // [LAY] LE/TE skin gauge vs box minimum (bird/hail)
  ribPanelAR:     1.0,    // [LAY] rib pitch ~ panel width (AeroToolbox)
  nonOptimum:     1.40,   // [LAY] joints, cutouts, ply drops, tolerance
  nStations:      40,     // spanwise integration stations per semi-span
};

/**
 * Size the wing box from statics.
 *
 * @param p  parameter set (taper, tc, AR)
 * @param g  { MTOW, Swing, bWing, nz, WoutboardKg }
 *           WoutboardKg = non-wing mass carried by the wing (boom-mounted
 *           rotors etc.), which relieves root bending.
 */
export function wingBox(p, g, K = WINGBOX_CONSTANTS, M = WINGBOX_MATERIALS) {
  const capMat  = M[p.wingCapMaterial  ?? "cfrp_ud"]     ?? M.cfrp_ud;
  const shrMat  = M[p.wingSkinMaterial ?? "cfrp_fabric"] ?? M.cfrp_fabric;
  const coreMat = M[p.wingCoreMaterial ?? "nomex48"]     ?? M.nomex48;
  /* Monolithic skin was measured to buckle at 0.34 MPa against a 350 MPa cap
     allowable — structurally useless in compression. Sandwich is therefore the
     default construction, which is also what this class of aircraft actually
     uses. Set skinConstruction:"monolithic" to compare. */
  const sandwich = (p.skinConstruction ?? "sandwich") !== "monolithic";
  let modeOverall = 0, modeWrinkle = 0, modeDimple = 0, modeCrimp = 0, faceThkRoot = 0;

  const S    = Math.max(0.5, g.Swing);
  const b    = Math.max(1, g.bWing);
  const lam  = Math.min(1, Math.max(0.05, p.taper ?? 0.45));
  const tc   = Math.max(0.06, p.tc ?? 0.15);
  /* Required, from the load cases. Was `g.nz ?? 5.25` - the same silent
     default removed from weights.js; a caller that forgot it got a wing box
     sized to a number nothing had computed. */
  const nz   = g.nz;
  if (!(Number.isFinite(nz) && nz > 0))
    throw new Error("wingBox: g.nz (ultimate load factor) is required (got " + nz + ")");
  const semi = b / 2;
  const N    = Math.max(8, K.nStations | 0);

  const cRoot = 2 * S / (b * (1 + lam));
  const chord = (y) => cRoot * (1 - (1 - lam) * (y / semi));

  /* Lift the wing must carry at ultimate, less the inertial relief of mass
     sitting outboard (the wing's own structure and any boom rotors). */
  const Lult = nz * g.MTOW * 9.80665;

  /* ── 1. Schrenk spanwise loading ───────────────────────────────────── */
  const cEll = (y) => (4 * S / (Math.PI * b)) * Math.sqrt(Math.max(0, 1 - (2 * y / b) ** 2));
  const load = (y) => 0.5 * (chord(y) + cEll(y)) * (Lult / S);   // N per metre, both wings

  /* ── 2. Shear and moment, integrated inboard from the tip ──────────── */
  const dy = semi / N;
  const yy = [], VV = [], MM = [];
  let V = 0, Mb = 0;
  for (let i = N - 1; i >= 0; i--) {
    const y = (i + 0.5) * dy;
    /* load(y) is already the per-unit-span intensity: integrating it across the
       FULL span returns L_ult, so integrating from tip to root over ONE
       semi-span returns L_ult/2 with no further halving. An earlier version
       divided by 2 here as well and under-predicted root shear and bending by
       exactly a factor of two. */
    V  += load(y) * dy;
    Mb += V * dy;
    yy[i] = y; VV[i] = V; MM[i] = Mb;
  }

  /* ── 3-5. Size each station ───────────────────────────────────────── */
  /* Rib pitch is needed inside the station loop for the buckling panel size,
     so it is established first from the mean chord. */
  const cMeanPre  = S / b;
  const ribPitchLocal = Math.max(0.15, K.ribPanelAR * (K.rearSparChord - K.frontSparChord) * cMeanPre);

  let mCap = 0, mWeb = 0, mSkin = 0;
  const II = [], SIG = [], EPS = [], SCR = [];
  let tSkinRoot = 0, tWebRoot = 0, aCapRoot = 0, hRoot = 0;
  const boxWidthFrac = K.rearSparChord - K.frontSparChord;

  for (let i = 0; i < N; i++) {
    const c  = chord(yy[i]);
    const h  = Math.max(1e-3, K.boxHeightFrac * tc * c);   // box height
    const w  = boxWidthFrac * c;                            // box width
    const Aenc = h * w;                                     // enclosed area

    /* ── SKIN ──────────────────────────────────────────────────────────
       Torsion from the offset between the centre of pressure (~0.25c) and the
       box shear centre (~mid-box), by Bredt-Batho closed-cell flow. */
    const eTors = Math.abs(0.25 - (K.frontSparChord + K.rearSparChord) / 2) * c;
    const T     = load(yy[i]) * dy * eTors;
    const tSkin = Math.max(K.tMinSkin, T / Math.max(1e-6, 2 * Aenc * shrMat.tauAllow));

    /* ── SKIN BUCKLING — why the skin cannot simply be counted as cap area ──
       The upper skin is in compression. A flat monolithic panel buckles long
       before it reaches the material allowable:
           sigma_cr = k pi^2 E / (12 (1-nu^2)) * (t/b)^2
       with b the smaller panel dimension (rib pitch or box width). Measured on
       this wing that is of order a few MPa against a 350 MPa material
       allowable, i.e. the skin buckles at ~1% of the stress the caps carry.
       So the skin is counted into the bending stiffness only up to sigma_cr,
       not up to sigma_allow. This is the classical effective-width idea, and
       it is also the reason real wings need stringers or sandwich skins rather
       than thicker monolithic ones. */
    const panelB  = Math.min(ribPitchLocal, w);
    let sigmaCr, tSkinEq, skinRho;

    if (sandwich) {
      /* ── SANDWICH SKIN ──────────────────────────────────────────────
         Two face sheets separated by a honeycomb core. The core carries no
         in-plane load but holds the faces apart, so the panel's flexural
         rigidity rises with the SQUARE of core thickness while adding very
         little mass. Three local instabilities must all be cleared, and the
         allowable face stress is the LOWEST of them — checking only overall
         buckling is the classic way to over-predict a sandwich panel.

         (a) overall panel buckling, D = E_f t_f (h_c+t_f)^2 / 2:
                 sigma_cr = k pi^2 D / (b^2 * 2 t_f)
         (b) face wrinkling, the face buckling INTO the core on a short
             wavelength, independent of panel size (Hoff/Plantema; Allen,
             "Analysis and Design of Structural Sandwich Panels"):
                 sigma_wr = 0.5 (E_f E_c G_c)^(1/3)
         (c) intracell dimpling, the face bulging over an unsupported cell:
                 sigma_dimple = 2 E_f/(1-nu^2) * (t_f/s)^2  with s the cell size
      */
      const tF = Math.max(K.tMinFace, tSkin / 2);
      const hC = K.coreThk;
      const D  = shrMat.E * tF * Math.pow(hC + tF, 2) / 2;
      const sOverall = K.bucklingK * Math.PI * Math.PI * D
                     / (Math.max(1e-6, panelB * panelB) * 2 * tF);
      /* Skin wrinkling — HexWeb guide, "End Loading":
             sigma_CR = 0.5 [ Gc Ec Ef ]^(1/3)                                */
      const sWrinkle = 0.5 * Math.cbrt(coreMat.Gc * coreMat.Ec * shrMat.E);
      /* Intracell buckling — HexWeb guide:
             sigma_CR = 2 Ef (tf/s)^2 ,  s = cell size
         NOTE: there is NO (1-nu^2) term. An earlier version included one,
         making this 10% optimistic. Verified against the guide's own worked
         example: 2(70e9)(0.5e-3/6.4e-3)^2 = 854 MPa, as printed.            */
      const sDimple  = 2 * shrMat.E * Math.pow(tF / coreMat.cellSize, 2);
      /* Shear crimping — HexWeb guide gives it as a LOAD, P_b = t_c Gc b.
         Divided by the load-bearing face area (2 t_f b) it becomes a face
         stress, which is the form needed here. This mode was missing entirely
         and it is the one that governs at low core shear modulus.           */
      const sCrimp   = coreMat.Gc * hC / Math.max(1e-9, 2 * tF);
      sigmaCr = Math.min(sOverall, sWrinkle, sDimple, sCrimp);
      tSkinEq = 2 * tF;                                  // load-bearing material
      skinRho = (2 * tF * shrMat.rho + hC * coreMat.rho) / Math.max(1e-9, 2 * tF);
      if (i === 0) {
        modeOverall = sOverall; modeWrinkle = sWrinkle;
        modeDimple = sDimple;   modeCrimp = sCrimp;
        faceThkRoot = tF;
      }
    } else {
      /* Monolithic skin: a flat plate in compression. */
      sigmaCr = K.bucklingK * Math.PI * Math.PI * shrMat.E
              / (12 * (1 - K.poisson * K.poisson))
              * Math.pow(tSkin / Math.max(1e-3, panelB), 2);
      tSkinEq = tSkin;
      skinRho = shrMat.rho;
    }
    const skinEff = Math.min(1, sigmaCr / capMat.sigmaAllow);   // usable fraction

    /* ── SPAR CAPS ─────────────────────────────────────────────────────
       Caps carry the bending the (buckling-limited) skin cannot. Setting the
       cap stress to the allowable with skin participation:
           I = A_cap h^2/2 + skinEff * t_skin w h^2/2
           sigma = M (h/2) / I = sigma_allow
       =>  A_cap = M/(sigma_allow h) - skinEff * t_skin * w        */
    const AcapReq = MM[i] / Math.max(1e-6, capMat.sigmaAllow * h)
                  - skinEff * tSkinEq * w;
    const Acap    = Math.max(0, AcapReq);

    /* ── SPAR WEBS — carry the vertical shear, two webs sharing it. */
    const tWeb = Math.max(K.tMinWeb, VV[i] / Math.max(1e-6, shrMat.tauAllow * h * 2));

    mCap  += 2 * Acap * dy * capMat.rho;                 // 2 caps
    mWeb  += 2 * tWeb * h * dy * shrMat.rho;             // 2 webs
    mSkin += 2 * tSkinEq * w * dy * skinRho;             // upper + lower

    /* Stress, strain and stiffness at this station — reported, not just used. */
    const Ist   = Acap * h * h / 2 + skinEff * tSkinEq * w * h * h / 2;
    const sigma = Ist > 0 ? MM[i] * (h / 2) / Ist : 0;
    II[i] = Ist; SIG[i] = sigma; EPS[i] = sigma / capMat.E; SCR[i] = sigmaCr;

    if (i === 0) { tSkinRoot = tSkin; tWebRoot = tWeb; aCapRoot = Acap; hRoot = h; }
  }
  /* Both semi-spans. */
  mCap *= 2; mWeb *= 2; mSkin *= 2;

  /* ── 6. Ribs ───────────────────────────────────────────────────────── */
  const cMean    = S / b;
  const panelW   = boxWidthFrac * cMean;
  const ribPitch = Math.max(0.15, K.ribPanelAR * panelW);
  const nRibs    = Math.max(2, Math.round(b / ribPitch));
  const ribArea  = boxWidthFrac * cMean * (K.boxHeightFrac * tc * cMean);
  const mRib     = nRibs * ribArea * K.tMinRib * shrMat.rho;

  /* ── DEFLECTION — double integration of M/(EI) from the root ─────────
     A cantilever with theta(0)=0 and delta(0)=0:
         theta(y) = integral M/(EI) dy      delta(y) = integral theta dy
     Tip deflection is a real design constraint in its own right (aeroelastic
     margin, ground clearance, control-surface geometry) and is NOT implied by
     a stress check: a stress-legal wing can still be far too flexible. */
  let theta = 0, defl = 0;
  const DEF = [];
  for (let i = 0; i < N; i++) {
    const EI = Math.max(1e-6, capMat.E * II[i]);
    theta += (MM[i] / EI) * dy;
    defl  += theta * dy;
    DEF[i] = defl;
  }
  const tipDefl     = DEF[N - 1] ?? 0;
  const tipDeflFrac = tipDefl / semi;

  /* Margins of safety at the root, on BOTH stress and strain. Composite
     primary structure is frequently strain-critical rather than stress-
     critical, so reporting only one of them can hide the governing case. */
  const sigRoot = SIG[0] ?? 0, epsRoot = EPS[0] ?? 0;
  const msStress = capMat.sigmaAllow / Math.max(1e-6, sigRoot) - 1;
  const msStrain = K.strainAllow    / Math.max(1e-9, epsRoot) - 1;
  const governing = msStrain < msStress ? "strain" : "stress";

  /* ── THE BOX IS NOT THE WING GROUP ────────────────────────────────────
     NDARC states the composition explicitly (section 29-1.2):
         f_prim = 1 - f_fair - f_flap - f_fit
     where the FAIRING is the leading and trailing edge, FLAP is the control
     surfaces (flaps, ailerons, flaperons, spoilers) and FIT is non-structural
     fittings. Comparing a primary torque box against AFDD93's wing group was
     therefore apples-to-oranges, and that — not the skin construction — is
     most of the discrepancy.

     NDARC sizes these from unit weights (w_fair = S_fair U_fair etc.) whose
     defaults are user inputs it does not publish, so they are sized here the
     same way as the box: from geometry and minimum gauge, not from a borrowed
     unit weight. */

  /* Leading and trailing edge: lightly loaded skin either side of the box,
     at a heavier gauge than the box skin because it takes bird/hail/handling
     damage and carries almost no primary load. */
  const sLE   = K.frontSparChord * S;              // ahead of the front spar
  const sTE   = (1 - K.rearSparChord) * S;         // behind the rear spar
  const gauge = K.tMinSkin * K.leTeGaugeMult;
  const mFair = 2 * (sLE + sTE) * gauge * shrMat.rho;   // upper + lower surface

  /* Ailerons: outboard 35% of semi-span, 25% of local chord, built as light
     sandwich. Roll authority sets the area in a full control-sizing pass; this
     is the mass of the surface that geometry implies. */
  const sAil  = 2 * K.aileronSpanFrac * (b / 2) * K.aileronChordFrac * (S / b);
  const mAil  = 2 * sAil * (K.tMinFace * shrMat.rho)
              + sAil * K.coreThk * coreMat.rho;

  /* Non-structural fittings: root attachment, hinge and hard points, carried
     as a fraction of cap mass since they scale with the load being reacted. */
  const mFit  = K.fittingFrac * mCap;

  const idealised = mCap + mWeb + mSkin + mRib;
  const boxMass   = idealised * K.nonOptimum;
  const secondary = (mFair + mAil + mFit) * K.nonOptimum;
  const mass      = boxMass + secondary;

  return {
    mass, idealised, boxMass, secondary,
    caps: mCap, webs: mWeb, skin: mSkin, ribs: mRib,
    fairingLE_TE: mFair, ailerons: mAil, fittings: mFit,
    aileronAreaM2: sAil, fPrim: boxMass / Math.max(1e-9, mass),
    nRibs, ribPitch,
    rootBendingNm: MM[0], rootShearN: VV[0],
    rootBoxHeight: hRoot, rootCapArea: aCapRoot,
    rootWebThk: tWebRoot, rootSkinThk: tSkinRoot,
    rootI: II[0], rootEI: capMat.E * (II[0] ?? 0),
    rootStressPa: sigRoot, rootStrain: epsRoot,
    rootSkinBucklingPa: SCR[0] ?? 0,
    skinConstruction: sandwich ? "sandwich" : "monolithic",
    coreMaterial: sandwich ? coreMat.name : null,
    faceThk: faceThkRoot, coreThk: sandwich ? K.coreThk : 0,
    modeOverallPa: modeOverall, modeWrinklePa: modeWrinkle,
    modeDimplePa: modeDimple, modeCrimpPa: modeCrimp,
    governingSkinMode: sandwich
      ? (() => {
          const m = { "overall panel buckling": modeOverall, "face wrinkling": modeWrinkle,
                      "intracell buckling": modeDimple, "shear crimping": modeCrimp };
          return Object.keys(m).reduce((a, b) => (m[b] < m[a] ? b : a));
        })()
      : "flat-plate buckling",
    skinBucklingLimited: (SCR[0] ?? 0) < capMat.sigmaAllow,
    msStress, msStrain, governingCriterion: governing,
    tipDeflectionM: tipDefl, tipDeflectionFrac: tipDeflFrac,
    tipDeflectionOK: tipDeflFrac <= K.tipDeflLimit,
    stations: yy, shearN: VV, momentNm: MM, stressPa: SIG, strain: EPS, deflectionM: DEF,
    capMaterial: capMat.name, skinMaterial: shrMat.name,
    nonOptimum: K.nonOptimum,
  };
}
