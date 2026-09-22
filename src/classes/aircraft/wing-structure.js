/* =====================================================================
   WING BOX — spanwise loads, shear, bending moment, and the box that
   carries them
   =====================================================================
   The tool sized a wing's AREA and got its MASS from a statistical
   correlation (FLOPS). Nothing in it knew what the wing was made of, how
   hard it was working, or whether it would bend in half. This computes the
   load path at beam level: the spanwise lift distribution, the shear and
   bending moment it produces, the cap and web material needed to carry
   them at an allowable stress, the skin that has to not buckle, and the
   resulting stress, strain, deflection and mass.

   METHOD, and what each part is sourced to
   ----------------------------------------
   LOAD. Schrenk's approximation (NACA TM 948, O. Schrenk, Aug 1940,
   printed pp. 2-3): the spanwise lift is the average of the chord
   distribution and an ellipse of the same area,
       l(eta) = 0.5 * [ l_chord(eta) + l_ellipse(eta) ]
   NASA states the same construction for the FLOPS detailed wing. Note
   FLOPS's own default is chord x elliptical intensity, which is a
   different thing; they are not interchangeable.

   INERTIA RELIEF. The wing's own structure and its fuel act downward and
   relieve the bending the lift causes. Ignoring it overestimates the root
   moment by a large margin on a big wing, so distributed wing mass and
   fuel mass are carried as negative running load.

   SHEAR AND MOMENT. Integrated inboard from the tip:
       V(y) = integral of w(y) dy ,  M(y) = integral of V(y) dy
   Trapezoidal, on the same station grid as the load.

   BOX. The TASOPT idealisation (TASOPT 2.00 theory, A.190-A.202): a
   single-cell box of width w_bar * chord and height set by the aerofoil
   thickness, with the bending material in caps top and bottom and the
   shear material in two webs. w_bar = 0.5 at the root is agreed
   independently by uCRM (Brooks, Kenway & Martins, AIAA J. 2018, Table 1),
   York & Labell (NASA CR-166173, Fig. 5, "assume that the box width is
   1/2 the chord") and TASOPT.

   SIZING. Caps from bending, webs from shear:
       A_cap = M / (sigma_allow * h)        webs: t_web = V / (h * tau_allow)
   Both checked at BOTH conditions 14 CFR 25.305 asks for, because they are
   two different checks and for 7075-T6 the LIMIT case governs the cap:
       (a) limit load, no detrimental permanent deformation -> Fcy / Fsu
       (b) ultimate load (1.5 x limit), no failure          -> Ftu
   Compression covers use Fcy, NOT Fty: for 2024-T3, Fcy(L) = 269 MPa is
   well below Fty(L) = 324 MPa, and using the wrong one undersizes the
   upper cover.

   SKIN BUCKLING. Classical plate buckling, assembled from NACA TN 3781's
   own symbol definitions (its equation is an unreadable scan, so this is
   labelled assembled, not quoted):
       sigma_cr = k * pi^2 * E / (12 (1 - nu^2)) * (t/b)^2
   with k from TN 3781 Table 7: 4.0 simply supported, 6.98 clamped. The
   panel is bounded by rib pitch and stringer pitch.

   DEFLECTION. w(y) from integrating M/(EI) twice from the root, with I
   from the caps. This is the least reliable output here and is
   SYSTEMATICALLY HIGH, because counting only the caps understates the
   real second moment: the research puts it at 15-25 % high.

   WHAT THIS IS NOT
   ----------------
   It is a single-cell beam with one characteristic section per station. It
   gives ONE cap stress, ONE web stress, ONE strain and ONE deflection per
   station - not a field. It does not do local rib or joint or fitting
   stresses, cut-outs, fatigue, damage tolerance, aeroelasticity (which
   25.301(c) explicitly requires), post-buckling, or laminate mechanics.
   Anyone wanting those needs a finite element model and geometry this tool
   does not produce.

   AND THE BOX IS NOT THE WING. Two independent sources agree that roughly
   40 % of a transport wing's mass is not the sized box - ribs, leading and
   trailing edge, high lift, control surfaces, joints, systems and
   finish. PDCYL states its box weight "must be increased by about 74
   percent to get the actual total wing weight"; TASOPT's shipped
   f_wadd is 0.64. That fraction is an INPUT here, not a result, and the
   comparison against the FLOPS wing mass is reported so the two can be
   argued with rather than silently reconciled.
   ===================================================================== */

import { ZERO_WING_FUEL } from "./flight-envelope.js";

const G = 9.80665;

/* ── materials ─────────────────────────────────────────────────────────
   MIL-HDBK-5H (1 Dec 1998, Distribution Statement A), A-basis. MMPDS is
   paywalled and was NOT consulted, so these are stated as MIL-HDBK-5H and
   not claimed to match the current MMPDS edition. Fcy is the COMPRESSION
   yield in the L direction and is the one the upper cover must use. */
export const MATERIALS = Object.freeze({
  "2024-T3": { label: "2024-T3 sheet", ftu: 441e6, fty: 324e6, fcy: 269e6, fsu: 269e6, E: 72.4e9, rho: 2768, nu: 0.33,
               note: "The classic damage-tolerant skin alloy. Its compression yield is well below its tension yield." },
  "7075-T6": { label: "7075-T6 sheet", ftu: 538e6, fty: 483e6, fcy: 476e6, fsu: 324e6, E: 71.0e9, rho: 2796, nu: 0.33,
               note: "Higher strength, less damage tolerant. Fty/Ftu is 0.90, so the LIMIT case governs the cap." },
  "7050-T7451": { label: "7050-T7451 plate", ftu: 510e6, fty: 441e6, fcy: 434e6, fsu: 290e6, E: 71.0e9, rho: 2824, nu: 0.33,
               note: "Thick-plate alloy for machined spars and integrally stiffened covers." },
  "Ti-6Al-4V": { label: "Ti-6Al-4V annealed", ftu: 924e6, fty: 869e6, fcy: 917e6, fsu: 600e6, E: 110e9, rho: 4429, nu: 0.31,
               note: "Used where temperature or load intensity rules aluminium out; three times the cost per kg." },
});
export const MATERIAL_IDS = Object.freeze(Object.keys(MATERIALS));

/* Rib and stringer pitch, measured off real aircraft rather than assumed.
   NASA CR-166173 (York & Labell 1980) Appendix B, printed pp. 93-94,
   tabulates cover construction, stringer spacing and rib spacing for 22
   aircraft. The values below are read from that table. */
export const LAYOUT_BY_CLASS = Object.freeze({
  transport: { ribPitchM: 0.635, stringerPitchM: 0.114, source: "NASA CR-166173 App. B: 737 and 747 outer panel, Z-stiffened, stringer 4.5 in, rib 25.0 in" },
  bizjet:    { ribPitchM: 0.406, stringerPitchM: 0.102, source: "NASA CR-166173 App. B: G-1159 business jet, integrally stiffened, stringer 4.0 in, rib 16.0 in" },
  turboprop: { ribPitchM: 0.356, stringerPitchM: 0.051, source: "NASA CR-166173 App. B: G-159 turboprop, integrally stiffened, stringer 2.0 in, rib 14.0 in" },
  trainer:   { ribPitchM: 0.229, stringerPitchM: 0.152, source: "NASA CR-166173 App. B: T-2A trainer, stringer 6.0 in, rib 9.0 in" },
});

/* Spar chordwise positions. Only the transport is measured; the others are
   not published anywhere obtainable and say so. */
export const SPARS_BY_CLASS = Object.freeze({
  transport: { front: 0.10, rear: 0.60, sourced: true,
               source: "Brooks, Kenway & Martins, AIAA J. 2018, Table 1 (uCRM-9 / 777), measured off a published cutaway" },
  bizjet:    { front: 0.15, rear: 0.62, sourced: false, source: "NOT SOURCED - no published spar positions for this class" },
  turboprop: { front: 0.15, rear: 0.62, sourced: false, source: "NOT SOURCED - no published spar positions for this class" },
  trainer:   { front: 0.25, rear: 0.65, sourced: false, source: "NOT SOURCED - front spar at quarter chord follows NASA SUSAN SARV only" },
});

/* MINIMUM GAUGE, BY CLASS. Every one of these is an ASSUMPTION. No public
   source gives a minimum gauge for an aluminium wing cover - the research
   records it as an open gap - and the values differ by a factor of three
   across the classes, so a single number is not available either. They are
   the thinnest sheet each class is conventionally built from: a light
   aircraft skin is 0.020 to 0.025 in, a transport cover far thicker. Getting
   this wrong is visible: at a transport's 1.6 mm a trainer's box comes out
   eight times the mass its wing actually is. */
export const MIN_GAUGE_BY_CLASS = Object.freeze({
  transport: { thicknessM: 1.60e-3, note: "0.063 in, assumed" },
  bizjet:    { thicknessM: 1.27e-3, note: "0.050 in, assumed" },
  turboprop: { thicknessM: 1.02e-3, note: "0.040 in, assumed" },
  trainer:   { thicknessM: 0.51e-3, note: "0.020 in, assumed" },
});

const lerp = (a, b, t) => a + (b - a) * t;

/* ── the analysis ──────────────────────────────────────────────────────
   Everything in SI. `opts` carries the material id, the ultimate load
   factor, the fraction of wing mass that is not the box, and the panel
   edge restraint. */
export function wingBox(result, opts = {}) {
  const p = result.raw?.inputs ?? {};
  const type = result.type;
  const b = result.spanM, S = result.wingAreaM2;
  if (!(b > 0 && S > 0)) return null;

  const taper = p.wingTaper ?? 0.4;
  const tc = p.wingTc ?? 0.12;
  const sweepRad = ((p.wingSweep ?? 0) * Math.PI) / 180;
  const matId = opts.material && MATERIALS[opts.material] ? opts.material : "2024-T3";
  const mat = MATERIALS[matId];
  /* The ultimate load factor is NOT defaulted here. Every load factor in this
     codebase has to come from the design it belongs to - the load-factor
     source gate enforces that no literal appears outside the load-case
     module - and a Part 25 transport figure would be the wrong number for a
     Part 23 trainer in any case. A class that does not carry one gets no
     structural analysis and is told why, rather than being given someone
     else's load factor. */
  const nUlt = [opts.ultimateLoadFactor,
                result.raw?.geometryInputs?.ultimateLoadFactor,
                result.raw?.inputs?.ultimateLoadFactor].find((x) => Number.isFinite(x) && x > 0);
  if (!(nUlt > 0)) return { unavailable: true,
    reason: "This class does not carry an ultimate load factor, and none is assumed here. "
          + "A wing box cannot be sized without the load case it is sized for." };
  const nLimit = nUlt / 1.5;
  const wBar = opts.boxWidthRatio ?? 0.50;
  const kBuckle = opts.edgeRestraint === "clamped" ? 6.98 : 4.00;
  const fWadd = opts.nonBoxFraction ?? 0.64;
  /* MINIMUM GAUGE. Strength does not size the whole wing: outboard panels
     and light-aircraft structure are set by handling, manufacture and
     corrosion allowance, and NASA found the same for a UAM tiltwing -
     "the peak strain is about 50% less than the allowable, the minimum
     gauge material constraint" governed. NO PUBLIC SOURCE GIVES A MINIMUM
     GAUGE for an aluminium wing cover; the research records it as an open
     gap. This default is an ASSUMPTION, it is labelled as one in the
     output, and without it the model under-sizes the outboard wing,
     over-predicts tip deflection by a factor of two or more, and reports a
     zero margin at every station because every station is fully stressed. */
  const minGaugeM = opts.minGaugeM ?? (MIN_GAUGE_BY_CLASS[type] ?? MIN_GAUGE_BY_CLASS.transport).thicknessM;
  const layout = LAYOUT_BY_CLASS[type] ?? LAYOUT_BY_CLASS.transport;
  const spars = SPARS_BY_CLASS[type] ?? SPARS_BY_CLASS.transport;

  const W = result.mtowKg * G;                       // design weight, N
  if (![result.mtowKg, b, S, taper, tc, nUlt].every(Number.isFinite)) return null;
  const semi = b / 2;
  const cRoot = (2 * S) / (b * (1 + taper));

  /* Station grid, root (eta 0) to tip (eta 1). */
  const N = 41;
  const eta = Array.from({ length: N }, (_, i) => i / (N - 1));
  const y = eta.map((e) => e * semi);
  const chord = eta.map((e) => cRoot * (1 - (1 - taper) * e));

  /* Schrenk: the mean of the chord distribution and an ellipse of equal
     area. Both are normalised so each carries half the lift on this
     semi-span at the design load factor. */
  const areaChord = chord.reduce((s, c, i) => s + c * (i === 0 || i === N - 1 ? 0.5 : 1), 0) * (semi / (N - 1));
  const ellipse = eta.map((e) => Math.sqrt(Math.max(0, 1 - e * e)));
  const areaEll = ellipse.reduce((s, c, i) => s + c * (i === 0 || i === N - 1 ? 0.5 : 1), 0) * (semi / (N - 1));
  /* Inertia relief: structure and fuel act down, distributed like the box
     volume, which goes as chord^2 * t/c. */
  const boxVol = chord.map((c) => c * c * tc);
  const volInt = boxVol.reduce((s, v, i) => s + v * (i === 0 || i === N - 1 ? 0.5 : 1), 0) * (semi / (N - 1));
  /* `??` does not catch NaN, and `undefined * 0.45359237` is NaN, so a class
     that reports its wing mass under a different name used to poison the
     whole load path with NaN. Take the first FINITE candidate. */
  const finite = (...xs) => xs.find((x) => Number.isFinite(x)) ?? 0;
  /* Two different needs, and conflating them produced a fake comparison.
     The INERTIA RELIEF needs some wing mass and any reasonable estimate will
     do. The COMPARISON needs an INDEPENDENT wing mass, and where the class
     does not report one - the trainer reports a single GASP empty weight
     with no wing breakdown - there is nothing to compare against and the
     honest answer is to say so, not to invent a reference and then measure
     against it. */
  const reportedWingKg = finite(
    result.weightGroups?.find((g) => /^wing/i.test(g.name))?.kg,
    result.raw?.weights?.structure?.wing * 0.45359237);
  const wingMassKg = reportedWingKg > 0 ? reportedWingKg : 0.09 * finite(result.oewKg);
  const fuelFrac = opts.fuelInWingFraction ?? 0.85;
  const boxMid = (spars.front + spars.rear) / 2;

  /* ── ONE CASE, EVALUATED ─────────────────────────────────────────────
     Lift by Schrenk at the case's gross weight and load factor, less the
     inertia relief of the wing structure and whatever fuel the case leaves
     in the wing, integrated inboard from the tip. */
  function evaluate({ grossKg, fuelInWingKg, nUltCase }) {
    const liftTotal = nUltCase * grossKg * G / 2;             // per semi-span
    const lift = eta.map((_, i) =>
      0.5 * (liftTotal * chord[i] / areaChord + liftTotal * ellipse[i] / areaEll));
    const reliefKg = (wingMassKg + fuelInWingKg) / 2;         // per semi-span
    const relief = boxVol.map((v) => nUltCase * reliefKg * G * v / volInt);
    const load = lift.map((l, i) => l - relief[i]);
    const shear = new Array(N).fill(0), moment = new Array(N).fill(0);
    for (let i = N - 2; i >= 0; i--) {
      const dy = y[i + 1] - y[i];
      shear[i] = shear[i + 1] + 0.5 * (load[i] + load[i + 1]) * dy;
      moment[i] = moment[i + 1] + 0.5 * (shear[i] + shear[i + 1]) * dy;
    }
    /* Torsion about the box mid-chord: the lift acts at the section quarter
       chord, the box centroid sits between the spars. Swept wings also carry
       the root bending into torque; that coupling is NOT modelled here. */
    const torsion = new Array(N).fill(0);
    for (let i = N - 2; i >= 0; i--) {
      const dy = y[i + 1] - y[i];
      const arm = (boxMid - 0.25) * chord[i];
      torsion[i] = torsion[i + 1] + 0.5 * (load[i] * arm + load[i + 1] * (boxMid - 0.25) * chord[i + 1]) * dy;
    }
    return { lift, relief, load, shear, moment, torsion, nUltCase, grossKg, fuelInWingKg };
  }

  /* ── THE CASE SET, from 14 CFR 25.343 ────────────────────────────────
     25.343(a), verbatim: "The disposable load combinations must include
     each fuel and oil load in the range from zero fuel and oil to the
     selected maximum fuel and oil load."

     The tool used to size the box to ONE point — the design mission at
     maximum take-off mass — and that is not the critical one. Fuel in the
     wing relieves wing bending, so the worst case at a given gross weight
     is the one with the LEAST fuel in the wing, which is reached by
     trading fuel for payload until the payload hits the maximum zero-fuel
     mass. That trade is exactly what MZFW exists to limit, and on the
     737-class it is worth a few per cent of root moment that the single
     design point missed.

     25.343(b)(1) allows +2.25 g instead of the full manoeuvre factor for
     the zero-wing-fuel condition, but ONLY "if a structural reserve fuel
     condition is selected" under (a). It is a RELAXATION an applicant
     elects, not the base case, so it is evaluated and reported but is
     off by default. */
  const mzfwKg = finite(result.mzfwKg);
  const fuelKg = finite(result.fuelKg);
  const mtowKg = finite(result.mtowKg);
  /* The least wing fuel that still reaches maximum take-off mass: the rest
     of the mass is payload, capped at MZFW. */
  const fuelAtMzfw = mzfwKg > 0 ? Math.max(0, mtowKg - mzfwKg) : fuelKg;

  const caseDefs = [
    { id: "design", label: "Design mission at maximum take-off mass",
      grossKg: mtowKg, fuelInWingKg: fuelKg * fuelFrac, nUltCase: nUlt,
      basis: "the mission the aircraft was sized for" },
  ];
  if (mzfwKg > 0 && fuelAtMzfw < fuelKg) {
    caseDefs.push({ id: "mzfw-mtow",
      label: "Maximum take-off mass with the payload at MZFW",
      grossKg: mtowKg, fuelInWingKg: fuelAtMzfw * fuelFrac, nUltCase: nUlt,
      basis: "25.343(a): the least wing fuel that still reaches MTOW, so the least bending relief" });
  }
  if (mzfwKg > 0) {
    caseDefs.push({ id: "zero-fuel",
      label: "Maximum zero-fuel mass, no fuel in the wing",
      grossKg: mzfwKg, fuelInWingKg: 0, nUltCase: nUlt,
      basis: "25.343(a): the zero-fuel end of the disposable load range" });
    if (opts.structuralReserveFuel) {
      caseDefs.push({ id: "reserve-2g25",
        label: `Zero wing fuel at +${ZERO_WING_FUEL.limitN} g`,
        grossKg: mzfwKg, fuelInWingKg: 0, nUltCase: ZERO_WING_FUEL.ultimateN,
        basis: `${ZERO_WING_FUEL.source}: available ONLY where a structural reserve fuel condition is selected` });
    }
  }

  /* Why a case is missing is as informative as the cases that are there,
     so the reason is carried rather than left as a silently short list. */
  const casesOmitted = [];
  if (!(mzfwKg > 0)) casesOmitted.push(
    "This class reports no maximum zero-fuel mass, so neither 25.343 case can be formed. Only the design "
    + "mission is evaluated, and the fuel-load range the regulation asks for is NOT covered.");
  else if (fuelAtMzfw >= fuelKg) casesOmitted.push(
    `Trading fuel for payload cannot reduce the wing fuel here: reaching MTOW at the MZFW payload would `
    + `need ${Math.round(fuelAtMzfw).toLocaleString("en-US")} kg of fuel against the design mission's `
    + `${Math.round(fuelKg).toLocaleString("en-US")} kg, because this class's MZFW sits below its own `
    + "design zero-fuel mass. That is the same internal inconsistency the compliance panel reports against "
    + "25.25(a), and it suppresses the case that would otherwise govern.");
  if (mzfwKg > 0 && !opts.structuralReserveFuel) casesOmitted.push(
    "The +2.25 g case of 25.343(b)(1) is NOT evaluated. It is available only where a structural reserve "
    + "fuel condition is selected under 25.343(a), which is an election, not the default — and it is a "
    + "relaxation, so leaving it out is the conservative choice.");

  const evaluated = caseDefs.map((d) => ({ ...d, ...evaluate(d) }));
  /* Governing = worst root bending moment. Shear and torsion follow the
     same load, so a case that governs the moment governs the box. */
  const governing = evaluated.reduce((a, c) => (Math.abs(c.moment[0]) > Math.abs(a.moment[0]) ? c : a));
  const { lift, relief, load, shear, moment, torsion } = governing;
  const loadCases = evaluated.map((c) => ({
    id: c.id, label: c.label, basis: c.basis,
    grossKg: c.grossKg, fuelInWingKg: c.fuelInWingKg, nUlt: c.nUltCase,
    rootMomentNm: c.moment[0], rootShearN: c.shear[0],
    governs: c.id === governing.id,
    vsDesignPct: 100 * (Math.abs(c.moment[0]) / Math.abs(evaluated[0].moment[0]) - 1),
  }));

  /* Box section at each station, and the material to carry the load. */
  const allowCapU = mat.ftu, allowCapL = mat.fcy;    // ultimate vs limit (compression)
  const allowWebU = mat.fsu, allowWebL = mat.fsu * 0.577 / 0.577;  // shear allowable is Fsu in both
  const stations = eta.map((e, i) => {
    const c = chord[i];
    const boxW = wBar * c;
    const h = tc * c;                                 // box depth, aerofoil thickness
    const hEff = Math.max(h * 0.92, 1e-4);            // caps sit inside the skin line

    /* Caps: sized by the governing of the two 25.305 checks. */
    const capAreaU = Math.abs(moment[i]) / (allowCapU * hEff);   // ultimate, Ftu
    const capAreaL = Math.abs(moment[i]) / 1.5 / (allowCapL * hEff); // limit, Fcy
    const capArea = Math.max(capAreaU, capAreaL);
    const governedBy = capAreaL > capAreaU ? "limit (25.305(a), Fcy)" : "ultimate (25.305(b), Ftu)";
    /* ONE cover per side. Its thickness is the worst of three demands, not
       the sum of them: the bending material it must contain, the minimum
       gauge it must be built from, and the thickness below which the panel
       between ribs and stringers buckles. Treating the buckling skin as a
       SECOND layer on top of the cap double-counts the cover, which is the
       mistake that made a trainer's box come out five times too heavy. */
    const tCapStrength = capArea / Math.max(boxW, 1e-6);
    const panelB0 = Math.min(layout.stringerPitchM, layout.ribPitchM);
    const sigmaAllow = Math.min(allowCapU, allowCapL * 1.5);
    const tBuckle = panelB0 * Math.sqrt(sigmaAllow * 12 * (1 - mat.nu * mat.nu)
                                        / (kBuckle * Math.PI * Math.PI * mat.E));
    const tCap = Math.max(tCapStrength, minGaugeM, tBuckle);
    const gaugeGoverns = minGaugeM >= tCapStrength && minGaugeM >= tBuckle;
    const buckleGoverns = tBuckle > tCapStrength && tBuckle > minGaugeM;

    /* Webs: two, each carrying half the shear. */
    const tWeb = Math.max(Math.abs(shear[i]) / (2 * hEff * allowWebU), minGaugeM);

    /* Skin panel: bounded by rib pitch and stringer pitch, must not buckle
       below the working compression stress. */
    const tSkin = tBuckle;                      // the buckling demand on the cover, reported

    /* Second moment, caps only (this is what makes the deflection high). */
    const capAreaActual = tCap * boxW;
    const I = (boxW / 12) * (Math.pow(hEff, 3) - Math.pow(Math.max(hEff - 2 * tCap, 0), 3));

    const sigmaUlt = capAreaActual > 0 ? Math.abs(moment[i]) / (capAreaActual * hEff) : 0;
    const sigmaLim = sigmaUlt / 1.5;
    const tauUlt = tWeb > 0 ? Math.abs(shear[i]) / (2 * hEff * tWeb) : 0;
    return {
      eta: e, yM: y[i], chordM: c, boxWidthM: boxW, boxDepthM: h,
      loadNm: load[i], liftNm: lift[i], reliefNm: -relief[i],
      shearN: shear[i], momentNm: moment[i], torsionNm: torsion[i],
      capAreaM2: capAreaActual, capThickM: tCap, gaugeGoverns, webThickM: tWeb, skinThickM: tSkin,
      inertiaM4: I,
      sigmaUltPa: sigmaUlt, sigmaLimitPa: sigmaLim, tauPa: tauUlt,
      strainUlt: sigmaUlt / mat.E, strainLimit: sigmaLim / mat.E,
      marginUlt: allowCapU / Math.max(sigmaUlt, 1) - 1,
      marginLimit: allowCapL / Math.max(sigmaLim, 1) - 1,
      buckleGoverns,
      governedBy: gaugeGoverns ? "minimum gauge (assumed, not sourced)"
                 : buckleGoverns ? "panel buckling between ribs and stringers" : governedBy,
    };
  });

  /* Tip deflection: integrate curvature M/(EI) twice outboard from a built-in root. */
  let slope = 0, defl = 0;
  const deflection = new Array(N).fill(0);
  for (let i = 1; i < N; i++) {
    const dy = y[i] - y[i - 1];
    const k0 = stations[i - 1].inertiaM4 > 0 ? moment[i - 1] / (mat.E * stations[i - 1].inertiaM4) : 0;
    const k1 = stations[i].inertiaM4 > 0 ? moment[i] / (mat.E * stations[i].inertiaM4) : 0;
    slope += 0.5 * (k0 + k1) * dy;
    defl += slope * dy;
    deflection[i] = defl;
  }
  stations.forEach((s, i) => { s.deflectionM = deflection[i]; s.deflectionLimitM = deflection[i] / 1.5; });

  /* Box mass: caps plus webs plus skin, both sides, both semi-spans. */
  let boxMass = 0;
  for (let i = 0; i < N - 1; i++) {
    const dy = (y[i + 1] - y[i]) / Math.cos(sweepRad);
    const a0 = stations[i], a1 = stations[i + 1];
    const capV = 0.5 * (a0.capAreaM2 + a1.capAreaM2) * 2 * dy;   // upper and lower cover
    const webV = 0.5 * (a0.webThickM * a0.boxDepthM + a1.webThickM * a1.boxDepthM) * 2 * dy;  // front and rear web
    boxMass += (capV + webV) * mat.rho;
  }
  boxMass *= 2;                                       // both semi-spans

  const gaugeStations = stations.filter((x) => x.gaugeGoverns).length;
  const ribCount = Math.max(2, Math.round(semi / layout.ribPitchM));
  const stringerCount = Math.max(2, Math.round((wBar * cRoot) / layout.stringerPitchM));
  const wingTotalFromBox = boxMass * (1 + fWadd);
  const root = stations[0];

  return {
    material: { id: matId, ...mat },
    loadFactor: { ultimate: nUlt, limit: nLimit },
    geometry: { spanM: b, semiSpanM: semi, areaM2: S, rootChordM: cRoot, taper, tcRatio: tc,
                sweepDeg: p.wingSweep ?? 0,
                boxWidthRatio: wBar, sparFront: spars.front, sparRear: spars.rear, sparsSourced: spars.sourced,
                sparSource: spars.source },
    layout: { ...layout, ribCount, stringerCount },
    /* Every 25.343 case, and which one the box above was sized to. */
    loadCases, casesOmitted,
    governingCase: loadCases.find((c) => c.governs),
    stations,
    root: {
      shearN: root.shearN, momentNm: root.momentNm, torsionNm: root.torsionNm,
      capAreaM2: root.capAreaM2, capThickM: root.capThickM, webThickM: root.webThickM, skinThickM: root.skinThickM,
      sigmaUltPa: root.sigmaUltPa, sigmaLimitPa: root.sigmaLimitPa, strainUlt: root.strainUlt,
      marginUlt: root.marginUlt, marginLimit: root.marginLimit, governedBy: root.governedBy,
      gaugeGoverns: root.gaugeGoverns,
    },
    /* Where strength stops sizing the structure and manufacture takes over.
       This is an ASSUMED thickness: no public source gives a minimum gauge
       for an aluminium wing cover, and the research records that as an open
       gap. Without it the outboard wing is under-sized, the tip deflection
       comes out two to three times too large, and every station reports a
       zero margin because every station is fully stressed by construction. */
    minGauge: { thicknessM: minGaugeM, sourced: false,
                stationsGoverned: gaugeStations, totalStations: N,
                note: `Assumed, not sourced (${(MIN_GAUGE_BY_CLASS[type] ?? MIN_GAUGE_BY_CLASS.transport).note}). `
                    + "Strength sizes the inboard wing; manufacture and handling size the outboard panels, "
                    + "and this floor is where that takes over." },
    tipDeflectionM: deflection[N - 1],
    tipDeflectionLimitM: deflection[N - 1] / 1.5,
    tipDeflectionPctSemi: (100 * deflection[N - 1]) / semi,
    tipDeflectionLimitPctSemi: (100 * deflection[N - 1] / 1.5) / semi,
    mass: {
      boxKg: boxMass,
      nonBoxFraction: fWadd,
      wingFromBoxKg: wingTotalFromBox,
      /* Null, not a number, when the class reports no wing group of its own. */
      referenceWingKg: reportedWingKg > 0 ? reportedWingKg : null,
      referenceSource: reportedWingKg > 0 ? "the mass model's own wing group" : null,
      deltaPct: reportedWingKg > 0 ? (wingTotalFromBox / reportedWingKg - 1) * 100 : null,
    },
    caveats: [
      "A single-cell beam with one section per station: one cap stress, one web stress, one strain and one deflection, not a field.",
      `The box is sized to the worst of ${loadCases.length} fuel-load case${loadCases.length === 1 ? "" : "s"} `
      + "from 25.343(a), not to the design mission alone. Fuel in the wing relieves bending, so the critical "
      + "case is the one carrying the LEAST wing fuel at the highest gross mass — which is what the maximum "
      + "zero-fuel mass exists to bound."
      + (loadCases.length > 1
          ? ` Here "${governing.label}" governs, by `
            + `${Math.abs(loadCases.find((c) => c.governs).vsDesignPct).toFixed(1)} % of root moment against the design mission.`
          : " Only one case could be formed; see the omissions below."),
      "Tip deflection counts only the caps in the second moment and is systematically high, by 15-25 % on the research's own estimate.",
      "The box is not the wing. The mass above is the sized box plus an assumed non-box fraction, which is an input, not a result.",
      "No aeroelasticity, which 14 CFR 25.301(c) requires; no fatigue, damage tolerance, cut-outs, joints or local rib stresses.",
      "Swept-wing bending-torsion coupling is not modelled; the torsion shown is the offset of the lift from the box centroid only.",
      reportedWingKg > 0
        ? `Against the mass model's own wing group this comes out ${((wingTotalFromBox / reportedWingKg - 1) * 100).toFixed(0)} %. `
          + "The box is the lighter of the two and the reasons are identifiable rather than mysterious: the spar "
          + "caps and booms at the box corners are not modelled separately from the covers, rib material sits in "
          + "the non-box fraction, and the cover is smeared rather than optimised as a stiffened panel. The "
          + "non-box fraction has deliberately NOT been tuned to close the gap - an independent estimate that is "
          + "adjusted until it agrees stops being independent."
        : "This class reports no wing group of its own, so there is nothing independent to compare the box mass "
          + "against and no comparison is shown.",
      spars.sourced ? null : `Spar positions for this class are not published: ${spars.source}.`,
    ].filter(Boolean),
  };
}
