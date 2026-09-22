/* =====================================================================
   AIRFOIL LIBRARY AND SELECTION
   24 sections with Re-interpolated CDmin, plus the scoring/selection rule.
   ===================================================================== */

/* Sources: UIUC Airfoil Data Site (Selig et al.), Abbott & von Doenhoff
   'Theory of Wing Sections' (1959), Riegels 'Aerofoil Sections' (1961),
   NASA TN-D / TM / TP series. CDmin_lo is Re~1e6, CDmin_hi is Re~6-9e6. */
export const AIRFOILS = [
    // ── 4-digit NACA (general-purpose) ──────────────────────────────────
    {name:"NACA 2412", tc:0.120,CLmax:1.50,CLd:0.55,CDmin_lo:0.0078,CDmin_hi:0.0058,CM:-0.050,ReM:6.0,source:"Abbott & VD 1959",category:"4-digit"},
    {name:"NACA 4412", tc:0.120,CLmax:1.60,CLd:0.70,CDmin_lo:0.0085,CDmin_hi:0.0063,CM:-0.098,ReM:6.0,source:"Abbott & VD 1959",category:"4-digit"},
    {name:"NACA 4415", tc:0.150,CLmax:1.65,CLd:0.65,CDmin_lo:0.0090,CDmin_hi:0.0065,CM:-0.095,ReM:5.0,source:"Abbott & VD 1959",category:"4-digit"},
    {name:"NACA 2415", tc:0.150,CLmax:1.52,CLd:0.55,CDmin_lo:0.0080,CDmin_hi:0.0060,CM:-0.050,ReM:6.0,source:"Abbott & VD 1959",category:"4-digit"},
    // ── 5-digit NACA (high CLmax) ────────────────────────────────────────
    {name:"NACA 23012",tc:0.120,CLmax:1.60,CLd:0.55,CDmin_lo:0.0074,CDmin_hi:0.0055,CM:-0.013,ReM:6.0,source:"Abbott & VD 1959",category:"5-digit"},
    {name:"NACA 23015",tc:0.150,CLmax:1.60,CLd:0.60,CDmin_lo:0.0082,CDmin_hi:0.0060,CM:-0.010,ReM:6.0,source:"Abbott & VD 1959",category:"5-digit"},
    {name:"NACA 23018",tc:0.180,CLmax:1.58,CLd:0.60,CDmin_lo:0.0090,CDmin_hi:0.0068,CM:-0.008,ReM:5.0,source:"Abbott & VD 1959",category:"5-digit"},
    // ── NACA 6-series laminar (low CDmin at design CL) ───────────────────
    {name:"NACA 63-215",tc:0.150,CLmax:1.55,CLd:0.60,CDmin_lo:0.0065,CDmin_hi:0.0042,CM:-0.040,ReM:9.0,source:"UIUC ADB / Abbott 1959",category:"6-series"},
    {name:"NACA 63-415",tc:0.150,CLmax:1.60,CLd:0.62,CDmin_lo:0.0068,CDmin_hi:0.0044,CM:-0.065,ReM:9.0,source:"UIUC ADB / Abbott 1959",category:"6-series"},
    {name:"NACA 63A-412",tc:0.120,CLmax:1.52,CLd:0.58,CDmin_lo:0.0062,CDmin_hi:0.0040,CM:-0.045,ReM:8.0,source:"UIUC ADB",category:"6-series"},
    {name:"NACA 64-415",tc:0.150,CLmax:1.55,CLd:0.58,CDmin_lo:0.0060,CDmin_hi:0.0038,CM:-0.060,ReM:9.0,source:"Abbott & VD 1959",category:"6-series"},
    {name:"NACA 64A-212",tc:0.120,CLmax:1.45,CLd:0.50,CDmin_lo:0.0055,CDmin_hi:0.0036,CM:-0.035,ReM:9.0,source:"NASA TN-1428",category:"6-series"},
    {name:"NACA 65-415",tc:0.150,CLmax:1.52,CLd:0.58,CDmin_lo:0.0058,CDmin_hi:0.0037,CM:-0.055,ReM:9.0,source:"Abbott & VD 1959",category:"6-series"},
    {name:"NACA 65(2)-415",tc:0.150,CLmax:1.55,CLd:0.62,CDmin_lo:0.0057,CDmin_hi:0.0038,CM:-0.060,ReM:8.0,source:"UIUC ADB",category:"6-series"},
    // ── NASA General Aviation / high-lift ────────────────────────────────
    {name:"NASA GA(W)-1",tc:0.170,CLmax:1.80,CLd:0.70,CDmin_lo:0.0095,CDmin_hi:0.0070,CM:-0.120,ReM:4.0,source:"NASA TM-74097",category:"GA high-lift"},
    {name:"NASA GA(W)-2",tc:0.130,CLmax:1.70,CLd:0.65,CDmin_lo:0.0082,CDmin_hi:0.0060,CM:-0.090,ReM:5.0,source:"NASA TM-74097",category:"GA high-lift"},
    {name:"NASA LS(1)-0413",tc:0.130,CLmax:1.75,CLd:0.65,CDmin_lo:0.0085,CDmin_hi:0.0062,CM:-0.105,ReM:4.5,source:"NASA TP-1272",category:"GA high-lift"},
    // ── Wortmann FX (sailplane/UAM laminar) ──────────────────────────────
    {name:"Wortmann FX 63-137",tc:0.137,CLmax:1.80,CLd:0.85,CDmin_lo:0.0075,CDmin_hi:0.0052,CM:-0.128,ReM:3.0,source:"Riegels / UIUC ADB",category:"Wortmann"},
    {name:"Wortmann FX 71-L-150",tc:0.150,CLmax:1.78,CLd:0.90,CDmin_lo:0.0078,CDmin_hi:0.0055,CM:-0.135,ReM:2.5,source:"UIUC ADB",category:"Wortmann"},
    // ── Clark Y & RAF (classic) ───────────────────────────────────────────
    {name:"Clark Y",   tc:0.117,CLmax:1.47,CLd:0.58,CDmin_lo:0.0080,CDmin_hi:0.0059,CM:-0.080,ReM:5.0,source:"Riegels 1961",category:"Classic"},
    {name:"RAF 6",     tc:0.090,CLmax:1.20,CLd:0.40,CDmin_lo:0.0085,CDmin_hi:0.0062,CM:-0.060,ReM:5.0,source:"Riegels 1961",category:"Classic"},
    // ── eVTOL / composite purpose designed ───────────────────────────────
    {name:"NACA 63(3)-618",tc:0.180,CLmax:1.70,CLd:0.75,CDmin_lo:0.0070,CDmin_hi:0.0048,CM:-0.075,ReM:6.0,source:"Abbott & VD / UIUC",category:"6-series"},
    {name:"NACA 4418", tc:0.180,CLmax:1.72,CLd:0.72,CDmin_lo:0.0095,CDmin_hi:0.0072,CM:-0.096,ReM:4.5,source:"Abbott & VD 1959",category:"4-digit"},
    {name:"NACA 0012", tc:0.120,CLmax:1.30,CLd:0.00,CDmin_lo:0.0070,CDmin_hi:0.0052,CM: 0.000,ReM:6.0,source:"Abbott & VD 1959",category:"Symmetric"},
  ];

/* Re-dependent CDmin: interpolate between the low-Re and high-Re values using
   the wing's operating Reynolds number, clamped outside the fitted range. */
export function interpCDmin(af, ReMillions) {
  const t = Math.max(0, Math.min(1, (ReMillions - 1.0) / (7.0 - 1.0)));
  return af.CDmin_lo + t * (af.CDmin_hi - af.CDmin_lo);
}

/* Section drag at an operating lift coefficient, using the drag-bucket form
   Cd(CL) = CDmin + k_sec (CL - CLd)^2. CLd is the centre of the laminar bucket,
   so a section is penalised for operating AWAY from its design point — which is
   the whole reason a 6-series behaves differently from a 4-digit. k_sec = 0.010
   per unit CL^2 is a representative section value (Abbott & von Doenhoff drag
   polars); it is [LAY] and only affects RANKING, not the drag the engine uses. */
export const K_SECTION_POLAR = 0.010;

export function sectionCd(af, CDmin_eff, CLop, kSec = K_SECTION_POLAR) {
  const dCL = CLop - (af.CLd ?? 0);
  return CDmin_eff + kSec * dCL * dCL;
}

/* Score every candidate and return the winner.

   WHAT THIS USED TO DO, AND WHY IT WAS WRONG

   The previous rule put its LARGEST weight (0.30) on |af.ReM - ReM|, i.e. it
   preferred sections whose PUBLISHED TEST Reynolds number sat near the wing's
   operating Re. That is not a performance criterion: a section measured at
   Re 6e6 is neither better nor worse at our condition than one measured at
   9e6. What matters is its drag AT our Re, and interpCDmin already supplies
   that. So nearly a third of the score was being spent on an artefact of the
   test campaign rather than on the aircraft.

   It also scored CDmin — the bottom of the drag bucket — rather than the drag
   actually paid at the operating CL, and did not score CLmax at all, even
   though CLmax now sets the cruise-CL ceiling that sizes the wing.

   Finally it compared candidates against p.clDesign. Since wing area became
   constraint-driven (engine/wing.js) the cruise CL is DERIVED, not asserted,
   so clDesign was a stale input and the selector was matching sections to a
   number the aircraft no longer flies at.

   WHAT IT DOES NOW — four criteria, each one something the aircraft pays for:
     0.45  Cd at the OPERATING CL (drag bucket, not bucket floor)
     0.20  CLmax  (stall margin and the cruise-CL ceiling)
     0.20  t/c vs the structural thickness wanted (a thick section buys a
           lighter spar — see engine/wingbox.js, cap area goes as 1/h)
     0.15  |CM|   (trim drag and download on the tail)
   Re enters through interpCDmin, where it physically belongs. */
export function selectAirfoil(p, Re_, CLop_) {
  const ReM_ = Re_ / 1e6;
  const CLop = CLop_ ?? p.CLcruise ?? p.clDesign ?? 0.5;
  const interp_CDmin = (af) => interpCDmin(af, ReM_);
  const customAF = p.customAirfoil || null;
  const afAll = customAF
    ? [{ ...customAF, CDmin_lo: customAF.CDmin, CDmin_hi: customAF.CDmin, ReM: ReM_,
         source: "User / XFoil", category: "Custom" }, ...AIRFOILS]
    : AIRFOILS;

  const cdOp = afAll.map((a) => sectionCd(a, interp_CDmin(a), CLop));
  const cdMax = Math.max(...cdOp), cdMin = Math.min(...cdOp);
  const clMaxBest = Math.max(...afAll.map((a) => a.CLmax));

  const afScored = afAll.map((a, i) => {
    const CDmin_eff = interp_CDmin(a);
    const Cd_op = cdOp[i];
    const baseScore =
        0.45 * (cdMax > cdMin ? 1 - (Cd_op - cdMin) / (cdMax - cdMin) : 1)
      + 0.20 * (a.CLmax / clMaxBest)
      + 0.20 * (1 - Math.min(Math.abs(a.tc - p.tc) / Math.max(p.tc, 1e-3), 1))
      + 0.15 * (1 - Math.min(Math.abs(a.CM) / 0.12, 1));
    const score = a.category === "Custom" ? Math.min(1, baseScore + 0.10) : baseScore;
    return { ...a, CDmin: CDmin_eff, Cd_op: +Cd_op.toFixed(5), CLop: +CLop.toFixed(3), score };
  });
  const selAF = afScored.reduce((a, b) => (b.score > a.score ? b : a));
  return { afScored, selAF };
}

/* =====================================================================
   THE SELECTED SECTION, AS OPENVSP CAN BUILD IT
   =====================================================================
   THE DEFECT THIS CLOSES. The exporters wrote every wing and tail with
   `Camber = 0` — a SYMMETRIC section — while the sizing loop computed the
   whole polar from a cambered one. A symmetric wing at zero incidence
   makes no lift, so anyone who ran VSPAERO on an exported model analysed
   a different aircraft than the one this tool sized. That is worse than a
   cosmetic error: it silently contradicts the analysis it ships with.

   FOUR ROUTES, ALL FOUR EXECUTED AND READ BACK FROM OPENVSP 3.51.3 rather
   than taken from the documentation. The values below are what OpenVSP
   itself wrote into the .vsp3 after being handed these parms:

     NACA 4415    XS_FOUR_SERIES  Camber 0.04, CamberLoc 0.40, t/c 0.15
                                  -> OpenVSP computed IdealCl 0.512
     NACA 23012   XS_FIVE_DIGIT   IdealCl 0.30, CamberLoc 0.15, t/c 0.12
     NACA 63-415  XS_SIX_SERIES   Series 0 (=63), IdealCl 0.40, t/c 0.15
     FX 63-137    XS_FOUR_SERIES  CamberInputFlag 1 (DESIGN_CL), IdealCl 0.85
                                  -> OpenVSP computed Camber 0.0552

   THE FOURTH ROUTE IS AN EQUIVALENT AND IS LABELLED AS ONE. OpenVSP has no
   parametric Wortmann, GA(W), LS(1), Clark Y or RAF section, and pointing
   XS_FILE_AIRFOIL at a coordinate file would make the export depend on a
   path that exists only on this machine. So those sections are emitted as a
   4-digit driven by DESIGN_CL, which reproduces the one property the sizing
   loop actually consumes — the design lift coefficient — at the right
   thickness. `exact` is false there, and the exporters write the reason into
   the model so a reader is never told it is the named section.

   Sources for the designation arithmetic: Abbott & von Doenhoff, "Theory of
   Wing Sections" (1959), Ch. 6; the 5-digit L-P-Q rule (design CL = L x 0.15,
   max-camber position = P/20) and the 6-series family/IdealCl digits.
   OpenVSP enums from OpenVSP-main/src/geom_core/Airfoil.{h,cpp} and
   src/geom_api/APIDefines.h: XS_FOUR_SERIES 7, XS_SIX_SERIES 8,
   XS_FIVE_DIGIT 16, CAMBER_INPUT_FLAG { MAX_CAMB 0, DESIGN_CL 1 },
   six-series { 63, 64, 65, 66, 67, 63A, 64A, 65A } = 0..7. */
export const XS_FOUR_SERIES = 7, XS_SIX_SERIES = 8, XS_FIVE_DIGIT = 16;

const SIX_FAMILY = { "63": 0, "64": 1, "65": 2, "66": 3, "67": 4,
                     "63A": 5, "64A": 6, "65A": 7 };

export function vspSection(af) {
  const name = String(af?.name || "").trim();
  const tc = Number(af?.tc) || 0.12;
  const CLd = Number(af?.CLd) || 0;

  /* 6-series: NACA 63-215, 63A-412, 65(2)-415, 63(3)-618.
     The family is the digits before the dash, less any low-drag-range
     bracket; the digit after the dash is ten times the design CL. */
  let m = name.match(/^NACA\s+(6[3-7]A?)(?:\((\d)\))?-(\d)(\d\d)$/i);
  if (m) {
    const fam = SIX_FAMILY[m[1].toUpperCase()];
    if (fam != null) return {
      type: XS_SIX_SERIES, container: "SixSeries", exact: true,
      parms: { Series: fam, IdealCl: Number(m[3]) / 10, ThickChord: tc },
      note: `NACA ${m[1]}-series, design CL ${(Number(m[3]) / 10).toFixed(1)}`,
    };
  }
  /* 5-digit: NACA 23012 -> design CL = 2 x 0.15, camber at 3/20 chord. */
  m = name.match(/^NACA\s+(\d)(\d)(\d)(\d\d)$/i);
  if (m) return {
    type: XS_FIVE_DIGIT, container: "FiveDigit", exact: true,
    parms: { IdealCl: Number(m[1]) * 0.15, CamberLoc: Number(m[2]) / 20, ThickChord: tc },
    note: `NACA 5-digit, design CL ${(Number(m[1]) * 0.15).toFixed(2)}`,
  };
  /* 4-digit: NACA 4415 -> 4% camber at 40% chord, 15% thick. */
  m = name.match(/^NACA\s+(\d)(\d)(\d\d)$/i);
  if (m) return {
    type: XS_FOUR_SERIES, container: "FourSeries", exact: true,
    parms: { CamberInputFlag: 0, Camber: Number(m[1]) / 100,
             CamberLoc: Math.max(0.1, Number(m[2]) / 10), ThickChord: tc },
    note: `NACA 4-digit, ${m[1]}% camber at ${Number(m[2]) * 10}% chord`,
  };
  /* Everything OpenVSP cannot build parametrically. */
  return {
    type: XS_FOUR_SERIES, container: "FourSeries", exact: false,
    parms: { CamberInputFlag: 1, IdealCl: Math.min(1, Math.max(0, CLd)), ThickChord: tc },
    note: `EQUIVALENT SECTION, not ${name}: OpenVSP has no parametric form for `
        + `it, so a 4-digit is driven to the same design CL (${CLd.toFixed(2)}) `
        + `and thickness (${(tc * 100).toFixed(1)}%). Aerodynamic data in this `
        + `tool comes from ${af?.source || "the section's published polar"}, not `
        + `from this shape.`,
  };
}
