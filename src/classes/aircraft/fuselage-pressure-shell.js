/* =====================================================================
   THE PRESSURE SHELL  —  Phase E, package F2
   =====================================================================
   `fuselage-structure.js` draws the shell and says which classes are
   pressurized. `fuselage-structure-loads.js` (F1) bends it. This module
   PRESSURIZES it: the skin thickness the cabin pressure demands, the
   two membrane stresses it produces, and the skin mass that thickness
   implies - which is the one number here that can be checked against
   something the tool already computes by an unrelated method.

   WHAT IS SOURCED

   MIT TASOPT 2.00 (Drela), Appendix A, in the circular limit the tool
   draws (w_db = 0, dR = 0, so theta_db = 0):

     (A.11)  A_skin   = 2 pi R t_skin
     (A.13)  I_hshell = pi R^3 t_shell
     (A.7)   t_shell  = t_skin (1 + r_E f_string rho_skin/rho_bend)
     (A.14)  sigma_x     = dp R / (2 t_shell)      axial, stringers share it
     (A.15)  sigma_theta = dp R / t_skin           hoop, frames do NOT share it
     (A.16)  t_skin   = dp R / sigma_skin          hoop governs, so it sizes
     (A.18)  S_nose ~= 2 pi R^2 [1/3 + 2/3 (l_nose/R)^(8/5)]^(5/8)   Cantrell
     (A.19)  S_bulk ~= 2 pi R^2
     (A.20)-(A.22), (A.28)  W_skin = rho g (A_skin l_shell + S_nose t + S_bulk t)

   14 CFR 25.365, verbatim in the research extract
   eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt:
     (a) "... pressure differential loads from zero up to the maximum
         relief valve setting"
     (d) "... the maximum relief valve setting multiplied by a factor of
         1.33 for airplanes to be approved for operation to 45,000 feet
         ... omitting other loads."
   The 1.33 is READ from fuselage-structure.js's `pressure.burstFactor`,
   where it already lives, not written again here.

   WHAT dp IS, AND WHY IT HAS NO DEFAULT

   dp is the maximum relief-valve differential - 25.365(a)'s own words.
   It is a REQUIREMENT: it follows from the cabin altitude the aeroplane
   is certificated to, which is a choice nobody has made in this tool.
   The holder's decision (2026-09-27) is that it is a DIRECT INPUT,
   `opts.deltaPPa`, with no default, and that it is not to be derived
   from a cabin altitude here. Absent, the sizing is reported NOT
   EVALUATED with the reason, exactly as F1 treats CL_hmax. Not
   evaluated is not zero, and a skin sized for zero would be no skin.

   WHAT IS NOT IN THE CORPUS, AND HOW EACH GAP IS HANDLED

   - sigma_skin. TASOPT calls it an allowable and states a value only in
     the N3-D8 report's Table 12, for a CFRP D8.5 with a factor of two
     on compression-after-impact. Nothing states it for aluminium. So
     the allowable comes from the material table the wing box already
     uses, and the CHOICE of which strength is the allowable is made
     twice, both sourced to the load they belong to: the relief-valve dp
     of 25.365(a) is checked against tension YIELD, and the 1.33 dp of
     25.365(d) against tension ULTIMATE. Whichever demands the thicker
     skin governs, and the result says which.
   - f_string, f_frame, f_fadd. TASOPT calls them empirical and
     calibrates them to the 737-800; the deck is not vendored. f_string
     is `opts.stringerFraction` with no default; absent, the stringers
     are NOT credited (t_shell = t_skin), which overstates sigma_x and
     understates I_hshell, and the result says so. The three together
     are not needed for anything here except to compare with FLOPS -
     and that comparison is turned round: FLOPS's fuselage weight
     divided by the skin weight is the value of (1 + f_string + f_frame
     + f_fadd) this aeroplane IMPLIES, reported as a finding.
   - Minimum gauge. Pressure alone does NOT size a transport skin: at
     a 737-class dp and radius, (A.16) asks for well under a millimetre
     of 2024-T3, and nobody builds that. The wing box already carries a
     declared, class-by-class minimum gauge and says it is an
     assumption; it is reused here, one home, and the result says
     whether pressure or gauge governs. On a transport it will be gauge.

   THE CROSS-CHECK

   FLOPS (NASA/TM-2017-219627 Eq 56) gives this tool's "Fuselage" mass
   from the fuselage's length and diameter and nothing else - an
   empirical regression on real aeroplanes that knows nothing about dp.
   TASOPT's skin weight is mechanics: thickness times area times
   density. They are independent, and the skin is a PART of the
   fuselage, so W_skin < W_FLOPS is a real one-sided check that the
   thickness is not absurd, and W_FLOPS / W_skin is the implied
   structure-to-skin ratio.
   ===================================================================== */
import { fuselageStructure } from "./fuselage-structure.js";
import { MATERIALS, MIN_GAUGE_BY_CLASS } from "./wing-structure.js";
import { generalArrangement } from "./geometry.js";
import { G0 } from "../../engine/constants.js";

const finite = (x) => (Number.isFinite(x) ? x : null);
export const PA_PER_PSI = 6894.757;  // unit conversion; one home, the tab imports it

/* TASOPT (A.18), Cantrell's approximation for the surface area of the
   ellipsoidal nose cap, in the circular limit. Exported so the gate can
   recompute the skin weight from the equations independently. */
export function noseCapAreaM2(R, lNose) {
  return 2 * Math.PI * R * R * (1 / 3 + (2 / 3) * (lNose / R) ** (8 / 5)) ** (5 / 8);
}

/* TASOPT (A.19), the spherical rear bulkhead, circular limit. */
export function bulkheadAreaM2(R) {
  return 2 * Math.PI * R * R;
}

/* The skin volume the shell needs at one thickness, (A.20)-(A.22). */
export function skinVolumeM3({ R, lShell, lNose, tSkin }) {
  const cyl = 2 * Math.PI * R * tSkin * lShell;        // (A.11) x (A.20)
  const nose = noseCapAreaM2(R, lNose) * tSkin;        // (A.21)
  const bulk = bulkheadAreaM2(R) * tSkin;              // (A.22)
  return { cyl, nose, bulk, total: cyl + nose + bulk };
}

export function fuselagePressureShell(result, opts = {}) {
  const ga = generalArrangement(result);
  if (!ga) return null;
  const fs = fuselageStructure(result, opts);
  if (!fs) return null;
  const type = fs.type;

  /* An unpressurized class has no pressure shell to size. This is the
     same decision fuselage-structure.js makes, read from its output so
     the two cannot disagree. */
  if (!fs.pressure.applies) {
    return { type, label: fs.label, applies: false, evaluated: false,
      why: fs.pressure.why };
  }

  const matId = opts.material && MATERIALS[opts.material] ? opts.material : "2024-T3";
  const mat = MATERIALS[matId];
  const gauge = MIN_GAUGE_BY_CLASS[type] ?? MIN_GAUGE_BY_CLASS.transport;

  /* Geometry, all from the shell module. TASOPT's section is circular;
     the tool's is an ellipse W x H, and the equivalent-area circle is
     what fuselage-structure.js already uses for its own bending
     inertia, so the same radius is used here and the departure is
     reported rather than hidden. */
  const R = fs.shell.equivDiaM / 2;
  const lShell = fs.pressure.shellLengthM;
  const lNose = fs.shell.noseLengthM;
  const ellipticity = fs.shell.heightM / fs.shell.widthM;
  const burstFactor = fs.pressure.burstFactor;

  const deltaPPa = finite(opts.deltaPPa);
  const base = {
    type, label: fs.label, applies: true,
    geometry: { radiusM: R, shellLengthM: lShell, noseLengthM: lNose,
                widthM: fs.shell.widthM, heightM: fs.shell.heightM, ellipticity,
                shellFwdX: fs.pressure.fwdX, shellAftX: fs.pressure.aftX },
    material: { id: matId, ...mat },
    minGauge: { thicknessM: gauge.thicknessM, source: gauge.source ?? gauge.note ?? "wing-structure.js MIN_GAUGE_BY_CLASS, an assumption" },
    burstFactor,
    sources: {
      shell: "MIT TASOPT 2.00 (Drela) Appendix A, eqs. (A.7), (A.11), (A.13)-(A.16), (A.18)-(A.22), (A.28), "
           + "circular limit. Research note FUSELAGE-STRUCTURE.md section 1.1.",
      regulation: "14 CFR 25.365(a) and (d), verbatim in "
                + "eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt; the (d) factor is read from "
                + "fuselage-structure.js pressure.burstFactor and is not written here.",
      allowables: `${mat.label}: wing-structure.js MATERIALS, the same table the wing box is sized from.`,
      crossCheck: "FLOPS NASA/TM-2017-219627 Eq 56, as computed in transport/flops-weights.js - the tool's own "
                + "\"Fuselage\" mass item, a regression on length and diameter that knows nothing of dp.",
    },
  };

  if (deltaPPa === null || !(deltaPPa > 0)) {
    return { ...base, evaluated: false,
      why: "dp, the maximum relief-valve pressure differential, is not supplied and is NOT defaulted. It is a "
         + "requirement - it follows from the cabin altitude the aeroplane is certificated to - and this tool "
         + "sets no cabin altitude anywhere. The holder's decision is that it is a direct input: supply "
         + "opts.deltaPPa in pascals. Not evaluated is not zero." };
  }

  /* ── stringers, if credited ─────────────────────────────────────── */
  const fString = finite(opts.stringerFraction);
  const rE = 1, rhoRatio = 1;                       // same alloy for skin and stringer unless told otherwise
  const shellFactor = fString !== null && fString >= 0 ? 1 + rE * fString * rhoRatio : 1;   // (A.7)

  /* ── the two sizing cases, each against the strength its load belongs to ── */
  const cases = [
    { id: "relief", label: "Relief-valve differential, 25.365(a)", dpPa: deltaPPa,
      allowablePa: mat.fty, allowable: "tension yield Fty",
      why: "25.365(a) is the operating load, met from zero up to the relief-valve setting on every flight, so "
         + "it is held below yield." },
    { id: "burst", label: `${burstFactor} x differential, 25.365(d)`, dpPa: burstFactor * deltaPPa,
      allowablePa: mat.ftu, allowable: "tension ultimate Ftu",
      why: "25.365(d) is a strength case the shell must withstand \"omitting other loads\", so it is held below "
         + "ultimate." },
  ].map((c) => ({ ...c, tSkinM: (c.dpPa * R) / c.allowablePa }));         // (A.16)

  const pressureGoverning = cases.reduce((a, c) => (c.tSkinM > a.tSkinM ? c : a));
  const tPressureM = pressureGoverning.tSkinM;
  const gaugeGoverns = gauge.thicknessM > tPressureM;
  const tSkinM = Math.max(tPressureM, gauge.thicknessM);
  const tShellM = tSkinM * shellFactor;                                        // (A.7)

  /* ── stresses on the skin as built, at the relief-valve dp ─────────── */
  const sigmaThetaPa = (deltaPPa * R) / tSkinM;                                // (A.15)
  const sigmaXPa = (deltaPPa * R) / (2 * tShellM);                             // (A.14)
  const sigmaThetaBurstPa = (burstFactor * deltaPPa * R) / tSkinM;

  /* ── section properties for F3 ─────────────────────────────────────── */
  const aSkinM2 = 2 * Math.PI * R * tSkinM;                                    // (A.11)
  const iShellM4 = Math.PI * R ** 3 * tShellM;                                 // (A.13)

  /* ── skin mass, (A.28), at the thickness actually built AND at the
        pressure-only thickness, so the cost of the gauge floor is visible ── */
  const volBuilt = skinVolumeM3({ R, lShell, lNose, tSkin: tSkinM });
  const volPressure = skinVolumeM3({ R, lShell, lNose, tSkin: tPressureM });
  const skinMassKg = mat.rho * volBuilt.total;
  const skinMassPressureOnlyKg = mat.rho * volPressure.total;

  /* ── the cross-check against FLOPS ─────────────────────────────────── */
  let fuselageItemKg = null;
  for (const g of result.weightGroups ?? []) for (const it of g.items ?? []) {
    if (it.name === "Fuselage" && it.kg > 0) fuselageItemKg = it.kg;
  }
  const crossCheck = fuselageItemKg !== null
    ? { available: true, fuselageItemKg, skinMassKg,
        skinFraction: skinMassKg / fuselageItemKg,
        impliedStructureToSkin: fuselageItemKg / skinMassKg,
        skinIsLighter: skinMassKg < fuselageItemKg,
        reading: "FLOPS's fuselage mass divided by the skin mass is the (1 + f_string + f_frame + f_fadd) of "
               + "TASOPT (A.32) that this aeroplane implies. TASOPT calibrates those fractions to the 737-800 "
               + "and the deck is not in the corpus, so the number is reported, not compared." }
    : { available: false, why: "the weight model reports no \"Fuselage\" item to compare against" };

  return {
    ...base,
    evaluated: true,
    input: { deltaPPa, deltaPPsi: deltaPPa / PA_PER_PSI,
             stringerFraction: fString, stringersCredited: shellFactor > 1 },
    cases,
    governing: gaugeGoverns ? "gauge" : pressureGoverning.id,
    governingNote: gaugeGoverns
      ? `Pressure asks for ${(tPressureM * 1e3).toFixed(2)} mm (${pressureGoverning.label}); the class's minimum `
        + `gauge of ${(gauge.thicknessM * 1e3).toFixed(2)} mm is thicker, so GAUGE governs. That gauge is an `
        + "assumption, declared as one in wing-structure.js, and this result inherits it."
      : `Pressure governs: ${pressureGoverning.label} asks for ${(tPressureM * 1e3).toFixed(2)} mm, above the `
        + `class's minimum gauge of ${(gauge.thicknessM * 1e3).toFixed(2)} mm.`,
    skin: { tPressureM, tSkinM, tShellM, shellFactor, aSkinM2, iShellM4 },
    stress: {
      sigmaThetaPa, sigmaXPa, sigmaThetaBurstPa,
      hoopOverAxial: sigmaThetaPa / sigmaXPa,
      marginYield: mat.fty / sigmaThetaPa - 1,
      marginUltimateBurst: mat.ftu / sigmaThetaBurstPa - 1,
      note: "Hoop is exactly twice axial when the stringers are not credited, (A.14)/(A.15); crediting them "
          + "lowers axial only, because TASOPT's frames carry no hoop load.",
    },
    skinMass: { builtKg: skinMassKg, pressureOnlyKg: skinMassPressureOnlyKg,
                volumes: volBuilt, gaugePenaltyKg: skinMassKg - skinMassPressureOnlyKg },
    crossCheck,
    caveats: [
      "dp IS THE INPUT. Nothing here derives it, checks it against an altitude, or defaults it. A wrong dp gives "
      + "a wrong skin with every check below passing.",
      `THE SECTION IS AN ELLIPSE, ${fs.shell.widthM.toFixed(2)} x ${fs.shell.heightM.toFixed(2)} m (H/W `
      + `${ellipticity.toFixed(3)}); TASOPT's is a circle. The equivalent-area radius is used, as the shell module `
      + "already does for bending. A true ellipse carries higher hoop stress where it is flatter, and nothing "
      + "here corrects for that.",
      "THE ALLOWABLE IS A CHOICE, NOT TASOPT'S. The source states sigma_skin only for a CFRP D8.5. Here the "
      + `relief-valve load is held below tension yield and the ${burstFactor} x load below tension ultimate, each stated. `
      + "No fatigue, no damage tolerance, no knock-down for rivet rows: a real 737 skin is sized by those, "
      + "which is why gauge governs.",
      ...(shellFactor > 1 ? [] : ["STRINGERS ARE NOT CREDITED. TASOPT's f_string is empirical and not in the "
        + "corpus; with no opts.stringerFraction t_shell = t_skin, so sigma_x is overstated and I_hshell "
        + "understated. F3 will feel this."]),
      "THE MINIMUM GAUGE IS AN ASSUMPTION. It is the wing box's, reused so there is one home for it; the "
      + "research records no public source for a fuselage minimum gauge either.",
      "No bending is combined with pressure here. 25.365(a) says \"combined with the flight loads\"; that "
      + "combination is TASOPT (A.84)-(A.85) and is F3's job, which F1's moment and this module's t_shell and "
      + "I_hshell feed.",
    ],
  };
}
