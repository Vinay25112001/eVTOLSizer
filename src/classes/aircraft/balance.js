/* =====================================================================
   BALANCE — where the centre of gravity is, and where the wing must go
   =====================================================================
   This is audit Gap 6, and it is the gap that blocks the most other work.
   Until now the wing's longitudinal station was a drawing convention
   (0.38 of fuselage length), the general arrangement said so on its face,
   and the fuselage view had to declare every one of its stations a
   convention because they all hung off that number. Nothing could size a
   tail from a requirement, and nothing could place a landing gear.

   WHAT THIS BUILDS, and it is packages B1, B2, B4 and B6 of
   eVTOL_Sizing_Research/classes/cross-class/BALANCE-AND-TAIL.md section 4.2,
   in the order that note recommends — a REPORTING feature first, with the
   tail areas still coming from their volume ratios, because B5 (solving
   tail area jointly with wing position) is the part that can fail to
   converge and move MTOW.

     B1  a station for every mass the weight model reports, and the moment
         sum x_CG = Σ m_i x_i / Σ m_i
     B2  the wing placed by Scholz's closed form so the aircraft balances
         where it is asked to
     B4  the neutral point and the static margin
     B6  the fin checked against the engine-out yaw requirement

   B1 — THE MOMENT SUM. TASOPT_doc.pdf section A.2.11 p.40-41, Eqs. (A.278)
   and (A.283)-(A.284); Scholz, Aircraft Design Ch. 10 p. 10-21 Eq. (10.18),
   x_CG = Σ m_i x_i / Σ m_i, with the datum ahead of the nose so every arm
   stays positive. The stations come from BALANCE-AND-TAIL.md section 2.1(a),
   which tabulates the TASOPT 737-800 deck as fractions of fuselage length.

   THAT TABLE IS ONE AEROPLANE'S LAYOUT. It is a convention, not a law, and
   every station returned here is flagged accordingly. The note itself makes
   the point: the 200-seat variant of the same deck moves the nose gear from
   0.113 to 0.226 of fuselage length, "a useful reminder that the nose-gear
   station is a layout choice, not a rule".

   B2 — WING PLACEMENT. Scholz Ch. 10 p. 10-21/22, Eq. (10.24), verbatim in
   the note:

       x_LEMAC = x_FG - x_CG,LEMAC + (m_WG/m_FG)·(x_WG,LEMAC - x_CG,LEMAC)

   with the split he specifies: the WING group is the wing, the landing gear
   and wing-mounted engines; the FUSELAGE group is the tailplanes, the
   fuselage, the systems, and rear-mounted engines if fitted. Pick the target
   CG in per cent MAC and the wing position follows in one step, no
   iteration. This is what turns the wing station from drawn into solved.

   B4 — NEUTRAL POINT. The tail contribution is computed with TASOPT's own
   downwash-corrected tail effectiveness, `src/wsize.f` lines 1025-1029:

       dC_Lh/dC_L = [(β + 2/AR)/(β + 2/AR_h)]
                    · sqrt[(β² + tan²Λ)/(β² + tan²Λ_h)] · (1 - dε/dα)

   with β = √(1-M²) and dε/dα = 0.60, the value in Drela's 737 deck.

   THE FUSELAGE IS THE HONEST DIFFICULTY HERE. A fuselage is destabilising
   and moves the neutral point forward, and the two published routes to it
   are both closed to this tool: GASP takes it from NACA TR-711 as a figure
   that was never fetched, and TASOPT takes C_MVf1 as a per-aircraft deck
   input (2390 ft³ on the 737) precisely because, in its own words, slender
   body theory "will typically be considerably modified by the interaction
   with the wing". So this module computes BOTH — the tail-only neutral
   point, and the slender-body correction of Eq. (A.288), C_MVf1 ≈ 2V_f/C_Lα
   — reports them separately, and checks the slender-body figure against the
   one calibrated value that exists. It does not pretend the answer is one
   number. The tail-only static margin is OPTIMISTIC and is labelled so.

   B6 — THE FIN. TASOPT_doc.pdf p.44, Eq. (A.306):

       q_min·C_Lv,yaw·S_v·l_v = (F_eng + q_min·C_D,eng·A_eng)·y_eng

   This is a CHECK, not yet a sizing: the fin area still comes from its area
   ratio, and this module reports the area that engine-out yaw would demand
   beside it. Douglas measured how big that gap can be (NASA CR-166138 p.69):
   wing-mounted engines on long arms needed the tail volume raised by 50 %,
   and aft-mounted engines on short arms by 25 %. If the two disagree here,
   the disagreement is the finding.

   WHAT THIS DOES NOT DO. It does not size the tail (B5), enumerate a full
   loading diagram over cargo holds and fuel tanks (B3), place the landing
   gear or check tipover (B7), or charge trim drag (B8). It does not feed
   back into the sizing loop at all: the masses it reads are the converged
   ones, and nothing it computes changes them.
   ===================================================================== */

import { generalArrangement, val, macOf, leSweepRad } from "./geometry.js";
import { fuselageStructure } from "./fuselage-structure.js";

const FT = 0.3048, LB = 0.45359237;
const RHO0 = 1.225;                                   // kg/m³, ISA sea level

/* Stations as fractions of fuselage length, from BALANCE-AND-TAIL.md
   section 2.1(a): the TASOPT 737-800 deck, runs/737/737.tas and .out, with
   the fractions the note computed against its 124 ft fuselage. Every one is
   a CONVENTION — one aeroplane's layout, applied to all of them. */
export const STATION_FRACTIONS = Object.freeze({
  cockpit:    { f: 0.056, note: "xfix, the fixed cockpit weight, 7.00 ft of 124 ft" },
  fuselage:   { f: 0.400, note: "GASP RELR, \"c.g. of fuselage and contents\", default 0.4" },
  systems:    { f: 0.500, note: "xhpesys 62.0 ft; Scholz Ch.10 p.10-19 gives 40-50 % independently" },
  cabin:      { f: 0.480, note: "xcabin, ½(xshell1+xshell2) = 59.5 ft — overridden by the pressure shell when known" },
  htail:      { f: 0.955, note: "xhtail centroid, 118.45 ft" },
  vtail:      { f: 0.925, note: "xvtail centroid, 114.67 ft" },
  noseGear:   { f: 0.113, note: "xlgnose 14.0 ft — the 200-seat variant of the same deck uses 28.0 ft" },
  apu:        { f: 0.968, note: "xapu 120.0 ft" },
});

/* Wing-group stations, expressed against the wing so they travel with it.
   Both offsets are differences between two numbers in the same deck. */
export const WING_GROUP_OFFSETS = Object.freeze({
  wingCgAftOfLemacMac: 0.35,
  wingCgNote: "GASP CPMRGN = 0.10: the wing CG sits 0.10 MAC aft of the quarter chord, so 0.35 MAC aft of LEMAC",
  engineFwdOfWingCgFrac: 0.082,
  engineNote: "TASOPT 737 deck: xeng 52.0 ft against xwing 62.14 ft, i.e. 0.082 of fuselage length forward",
  mainGearAftOfWingCgFrac: 0.027,
  mainGearNote: "TASOPT 737 deck: xLGmain 65.43 ft against xwing 62.14 ft, i.e. 0.027 of fuselage length aft",
});

/* Criterion inputs, all from BALANCE-AND-TAIL.md section 2.2. */
export const BALANCE_DEFAULTS = Object.freeze({
  targetCgPctMac: 0.25,   // Scholz's own worked example, Ch.10 p.10-22
  staticMarginMin: 0.05,  // runs/737/737.tas line 243, "0.05 ! SMmin"
  downwashDepsDa: 0.60,   // 737.tas line 246
  clvYaw: 0.5,            // 737.tas line 237, VT CL at engine-out trim
  cdEngWindmill: 0.5,     // 737.tas line 116, CDA_fan/A_fan of a dead engine
  /* 14 CFR 25.149(c), verbatim from the extract at
     eVTOL_Sizing_Research/classes/cross-class/extracted/controls/14CFR_25.149.txt:
     "V MC may not exceed 1.13 V SR". NOT the 1.2 that GASP Vol. V section
     V.1.4.2 uses — GASP's figure is against the stall speed and predates
     the V_SR reference-stall-speed definition, and taking it costs 13 % of
     fin area in the unsafe direction. The regulation wins. */
  vmcOverVsr: 1.13,
});

/* Which weight items travel with the wing and which with the fuselage.
   Scholz Ch.10 p.10-21 Step 1, verbatim in the note: "Wing group, WG,
   consists of: wing, landing gear, and engines, if wing-mounted." */
const WING_GROUP = new Set(["Wing", "Main gear"]);
const ENGINE_ITEMS = new Set(["Engines", "Thrust reversers", "Engine controls and starters", "Fuel system", "Nacelles"]);
const COCKPIT_ITEMS = new Set(["Instruments", "Avionics", "Flight crew"]);
const CABIN_ITEMS = new Set(["Furnishings", "Passenger service", "Cabin crew", "Cargo containers"]);
const TAIL_H = new Set(["Horizontal tail"]);
const TAIL_V = new Set(["Vertical tail"]);

export function balanceOf(result, opts = {}) {
  const ga = generalArrangement(result);
  if (!ga || !result.weightGroups?.length) return null;
  const o = { ...BALANCE_DEFAULTS, ...opts };

  const L = val(ga.fuselage.length);
  const S = ga.wing.area, b = ga.wing.span, taper = ga.wing.taper, sweepC4 = ga.wing.sweepDeg;
  if (!(L > 0 && S > 0 && b > 0)) return null;
  const m = macOf({ area: S, span: b, taper, sweepC4Deg: sweepC4 });

  /* The cabin centroid comes from the pressure shell when the fuselage
     module can place one — that is a better number than a fraction of
     length, and it is the first place the two modules join up. */
  const fus = fuselageStructure(result);
  const shell = fus?.pressure?.applies ? { fwd: fus.pressure.fwdX, aft: fus.pressure.aftX } : null;
  const xCabin = shell ? 0.5 * (shell.fwd + shell.aft) : STATION_FRACTIONS.cabin.f * L;
  const lCabin = shell ? shell.aft - shell.fwd : 0.66 * L;

  const engineOnWing = ga.engineLocation === "wing" || ga.engineLocation === "wing+tail";

  /* ── B1: a station for every mass ─────────────────────────────────── */
  const items = [];
  for (const g of result.weightGroups) for (const it of g.items) {
    if (!(it.kg > 0)) continue;
    let group = "fuselage", xFixed = null, xRelWingCg = null, why = "";
    if (WING_GROUP.has(it.name)) {
      group = "wing";
      if (it.name === "Wing") { xRelWingCg = 0; why = WING_GROUP_OFFSETS.wingCgNote; }
      else { xRelWingCg = WING_GROUP_OFFSETS.mainGearAftOfWingCgFrac * L; why = WING_GROUP_OFFSETS.mainGearNote; }
    } else if (ENGINE_ITEMS.has(it.name)) {
      if (engineOnWing) { group = "wing"; xRelWingCg = -WING_GROUP_OFFSETS.engineFwdOfWingCgFrac * L; why = WING_GROUP_OFFSETS.engineNote; }
      else { xFixed = 0.84 * L; why = "aft-fuselage engines ride with the fuselage group (Scholz Step 1); station taken beside the tail cone as the arrangement draws them"; }
    } else if (TAIL_H.has(it.name)) { xFixed = STATION_FRACTIONS.htail.f * L; why = STATION_FRACTIONS.htail.note; }
    else if (TAIL_V.has(it.name)) { xFixed = STATION_FRACTIONS.vtail.f * L; why = STATION_FRACTIONS.vtail.note; }
    else if (it.name === "Nose gear") { xFixed = STATION_FRACTIONS.noseGear.f * L; why = STATION_FRACTIONS.noseGear.note; }
    else if (it.name === "APU") { xFixed = STATION_FRACTIONS.apu.f * L; why = STATION_FRACTIONS.apu.note; }
    else if (COCKPIT_ITEMS.has(it.name)) { xFixed = STATION_FRACTIONS.cockpit.f * L; why = STATION_FRACTIONS.cockpit.note; }
    else if (CABIN_ITEMS.has(it.name)) { xFixed = xCabin; why = shell ? "the cabin centroid, from the pressure shell the fuselage module places" : STATION_FRACTIONS.cabin.note; }
    else if (it.name === "Fuselage" || it.name === "Paint") { xFixed = STATION_FRACTIONS.fuselage.f * L; why = STATION_FRACTIONS.fuselage.note; }
    else { xFixed = STATION_FRACTIONS.systems.f * L; why = STATION_FRACTIONS.systems.note; }
    items.push({ name: it.name, kg: it.kg, group, xFixed, xRelWingCg, why });
  }

  const wingItems = items.filter((i) => i.group === "wing");
  const fusItems = items.filter((i) => i.group === "fuselage");
  const mWG = wingItems.reduce((t, i) => t + i.kg, 0);
  const mFG = fusItems.reduce((t, i) => t + i.kg, 0);
  if (!(mWG > 0 && mFG > 0)) return null;

  /* Fuselage-group CG, from the nose, independent of where the wing goes. */
  const xFG = fusItems.reduce((t, i) => t + i.kg * i.xFixed, 0) / mFG;
  /* Wing-group CG, measured from the WING CG, also independent of the wing
     station — which is what makes Scholz's form closed. */
  const xWGrelWingCg = wingItems.reduce((t, i) => t + i.kg * i.xRelWingCg, 0) / mWG;

  /* ── B2: place the wing, Scholz (10.24) ───────────────────────────── */
  const xCgLemac = o.targetCgPctMac * m.mac;
  const wingCgAftLemac = WING_GROUP_OFFSETS.wingCgAftOfLemacMac * m.mac;
  const xWGLemac = wingCgAftLemac + xWGrelWingCg;
  const xLemac = xFG - xCgLemac + (mWG / mFG) * (xWGLemac - xCgLemac);
  const xWingCg = xLemac + wingCgAftLemac;
  /* The root leading edge, which is what a drawing needs. */
  const xWingRootLE = xLemac - m.xLeMacFromRootLE;

  /* Resolve every station now that the wing is placed. */
  for (const i of items) i.x = i.group === "wing" ? xWingCg + i.xRelWingCg : i.xFixed;
  const mOEW = items.reduce((t, i) => t + i.kg, 0);
  const xCgOew = items.reduce((t, i) => t + i.kg * i.x, 0) / mOEW;

  const pctMac = (x) => (x - xLemac) / m.mac;

  /* ── loaded states ────────────────────────────────────────────────── */
  const payloadKg = result.payloadKg, fuelKg = result.fuelKg;
  const xFuel = xWingCg;        // the tanks are the wing box; the note's Δx terms are not modelled
  /* TASOPT (A.280)-(A.282): a part-full cabin is the critical case, and the
     737 deck's own answer is r_pay ≈ 0.45, which an empty-vs-full sweep
     misses entirely. Enumerated rather than solved as the quadratic of
     (A.302) — same answer, and the sweep is visible on the plot. */
  const loading = [];
  for (let k = 0; k <= 40; k++) {
    const rPay = k / 40;
    for (const [xi, label] of [[0, "fwd"], [1, "aft"]]) {
      const xPay = xCabin + lCabin * (xi - 0.5) * (1 - rPay);
      const mass = mOEW + rPay * payloadKg;
      const x = (mOEW * xCgOew + rPay * payloadKg * xPay) / mass;
      loading.push({ rPay, label, mass, x, pctMac: pctMac(x), fuel: 0 });
    }
  }
  const zeroFuel = loading.filter((p) => Number.isFinite(p.pctMac));
  const cgFwd = zeroFuel.reduce((a, p) => (p.pctMac < a.pctMac ? p : a), zeroFuel[0]);
  const cgAft = zeroFuel.reduce((a, p) => (p.pctMac > a.pctMac ? p : a), zeroFuel[0]);
  const mTow = mOEW + payloadKg + fuelKg;
  const xCgTow = (mOEW * xCgOew + payloadKg * xCabin + fuelKg * xFuel) / mTow;

  /* ── B4: neutral point ────────────────────────────────────────────── */
  const mach = result.cruise?.mach ?? 0.78;
  const beta = Math.sqrt(Math.max(1e-6, 1 - mach * mach));
  const ar = m.ar;
  const htSpan = ga.ht.span, htArea = ga.ht.area;
  const arH = htArea > 0 ? (htSpan * htSpan) / htArea : 5;
  const tanL = Math.tan((sweepC4 * Math.PI) / 180);
  const tanLh = Math.tan(val(ga.ht.sweepDeg) * Math.PI / 180);
  const dClhDcl = ((beta + 2 / ar) / (beta + 2 / arH))
                * Math.sqrt((beta * beta + tanL * tanL) / (beta * beta + tanLh * tanLh))
                * (1 - o.downwashDepsDa);

  /* Wing aerodynamic centre at the quarter chord of the MAC — subsonic thin
     aerofoil, and the assumption every conceptual method here makes. */
  const xAcWing = xLemac + 0.25 * m.mac;
  const xAcTail = ga.ht.rootLE + 0.25 * ga.ht.mac;
  const lH = xAcTail - xAcWing;
  const xNpTailOnly = xAcWing + dClhDcl * (htArea / S) * lH;

  /* The fuselage term, slender body, TASOPT (A.288): C_MVf1 ≈ 2 V_f / C_Lα.
     Reported, checked, and NOT silently folded in. */
  const clAlpha = (2 * Math.PI * ar) / (2 + Math.sqrt(4 + (ar * ar * (1 + tanL * tanL)) / (beta * beta)));
  const vFus = fus ? fus.shell.crossSectionM2 * (L - 0.5 * (fus.shell.noseLengthM + fus.shell.tailConeLengthM)) : null;
  const cmvf1 = vFus !== null ? (2 * vFus) / clAlpha : null;
  /* ΔCm/ΔCL from the fuselage is +C_MVf1/S (destabilising), so the neutral
     point moves FORWARD by C_MVf1/(S·c̄) chords. */
  const dxNpFus = cmvf1 !== null ? -cmvf1 / S : null;
  const xNpWithFuselage = dxNpFus !== null ? xNpTailOnly + dxNpFus : null;
  /* The one calibrated value in the literature, for comparison. */
  const cmvf1Deck = 2390 * FT * FT * FT;          // TASOPT 737 deck, ft³ -> m³
  const cmvf1Ratio = cmvf1 !== null ? cmvf1 / cmvf1Deck : null;

  const smTailOnly = (xNpTailOnly - cgAft.x) / m.mac;
  const smWithFuselage = xNpWithFuselage !== null ? (xNpWithFuselage - cgAft.x) / m.mac : null;

  /* ── B6: the fin against engine-out yaw, TASOPT (A.306) ───────────── */
  const clMaxTo = result.raw?.inputs?.clMaxTakeoff ?? null;
  const nEng = ga.engines;
  const pods = ga.nacelles.filter((n) => Math.abs(n.y) > 1e-6);
  const yEng = pods.length ? Math.max(...pods.map((n) => Math.abs(n.y))) : null;
  let yaw = { available: false, why: "" };
  if (nEng < 2) yaw = { available: false, why: "a single-engine aircraft has no engine-out yawing moment to trim" };
  else if (!yEng) yaw = { available: false, why: "the engines are on the centreline, so there is no engine-out yawing moment to trim" };
  else if (!clMaxTo) yaw = { available: false, why: "this type reports no take-off CLmax, so the control speed cannot be found" };
  else if (clMaxTo && yEng && nEng >= 2) {
    const wsPa = (mTow * 9.80665) / S;
    const vStall = Math.sqrt((2 * wsPa) / (RHO0 * clMaxTo));
    const vMc = o.vmcOverVsr * vStall;
    const qMin = 0.5 * RHO0 * vMc * vMc;
    const dFan = pods[0].d;
    const aEng = (Math.PI / 4) * dFan * dFan;
    /* One engine's thrust at V_MC. The jets report thrust directly. The
       propeller classes report shaft power, so the thrust comes from
       actuator-disc momentum theory at that speed: P = T(V + w) with
       T = 2ρA(V + w)w, solved for the induced velocity w. Static thrust
       would overstate it badly at 60 m/s. */
    const prop = ga.props?.[0] ?? null;
    let fEngN = null, thrustFrom = "";
    if (result.propulsion?.kind === "thrust") {
      fEngN = result.propulsion.perEngine * 1e3;
      thrustFrom = "the sized take-off thrust of one engine";
    } else if (result.propulsion?.kind === "power" && prop && prop.d > 0) {
      const P = result.propulsion.perEngine * 1e3;           // W
      const A = (Math.PI / 4) * prop.d * prop.d;
      let w = Math.cbrt(P / (2 * RHO0 * A));                 // static value as the seed
      for (let k = 0; k < 60; k++) {
        const f = 2 * RHO0 * A * (vMc + w) * (vMc + w) * w - P;
        const df = 2 * RHO0 * A * ((vMc + w) * (vMc + w) + 2 * (vMc + w) * w);
        const step = f / df;
        w -= step;
        if (Math.abs(step) < 1e-9) break;
      }
      fEngN = P / (vMc + w);
      thrustFrom = `actuator-disc momentum theory on ${(P / 1e3).toFixed(0)} kW through a `
                 + `${prop.d.toFixed(2)} m disc at V_MC`;
    }
    if (fEngN) {
      const yawMoment = (fEngN + qMin * o.cdEngWindmill * aEng) * yEng;
      const xAcVt = ga.vt.rootLE + 0.25 * ga.vt.mac;
      const lV = xAcVt - xAcWing;
      const svRequired = yawMoment / (qMin * o.clvYaw * lV);
      yaw = {
        available: true, vStall, vMc, qMin, aEng, yEng, lV, thrustFrom,
        thrustN: fEngN, windmillDragN: qMin * o.cdEngWindmill * aEng, yawMomentNm: yawMoment,
        svRequiredM2: svRequired, svActualM2: ga.vt.area,
        ratio: svRequired / Math.max(ga.vt.area, 1e-9),
        vvRequired: (svRequired * lV) / (S * b), vvActual: (ga.vt.area * lV) / (S * b),
        propClass: result.propulsion?.kind === "power",
        note: result.propulsion?.kind === "power"
          ? "The dead-engine drag term uses the nacelle frontal area with TASOPT's fan CD of 0.5. A feathered "
          + "propeller is a different problem and this does not model it, so the drag term here is indicative only."
          : "The dead-engine drag term is TASOPT's windmilling fan: CD 0.5 on the fan area, approximated here "
          + "by the nacelle frontal area, which overstates it slightly and so sizes the fin conservatively.",
      };
    } else yaw = { available: false, why: "this type reports neither engine thrust nor a propeller to compute it from" };
  }
  if (yaw.available) {
    /* THE SPEED BASIS MATTERS AND CUTS THE UNSAFE WAY. GASP's V_MC <= 1.2
       V_stall (Vol. V section V.1.4.2) is a LIMIT on V_MC, not a statement
       of what V_MC is. Evaluating (A.306) at that limit uses the highest
       dynamic pressure the rule allows, which returns the SMALLEST fin that
       could comply. A real aeroplane with a lower V_MC needs a larger one —
       which is the direction the 737-class result sits in, its actual fin
       being about a tenth larger than this returns. */
    yaw.vMcBasis = `V_MC taken at ${o.vmcOverVsr} x the reference stall speed — 14 CFR 25.149(c), "V MC may `
      + 'not exceed 1.13 V SR". That is the CEILING the rule puts on V_MC, not a computed V_MC, so the fin '
      + "area below is the MINIMUM that could comply rather than the fin the aircraft needs; a real, lower "
      + "V_MC demands more. V_SR is approximated here by the 1-g take-off stall speed, which 25.103 makes "
      + "its lower bound. Note this is NOT GASP's 1.2 x stall: that figure is 13 % of fin area adrift, in "
      + "the unsafe direction.";
    yaw.conservative = false;
  }

  return {
    type: result.type,
    mac: m.mac, yMac: m.yMac, ar: m.ar,
    xLemac, xWingRootLE, xWingCg, fuselageLengthM: L,
    leSweepDeg: (leSweepRad(sweepC4, m.ar, taper) * 180) / Math.PI,
    groups: {
      wing: { massKg: mWG, xRelWingCg: xWGrelWingCg, items: wingItems },
      fuselage: { massKg: mFG, xM: xFG, items: fusItems },
    },
    items,
    oew: { massKg: mOEW, xM: xCgOew, pctMac: pctMac(xCgOew) },
    takeoff: { massKg: mTow, xM: xCgTow, pctMac: pctMac(xCgTow) },
    cabin: { xM: xCabin, lengthM: lCabin, fromShell: !!shell },
    envelope: {
      fwd: { ...cgFwd }, aft: { ...cgAft },
      rangePctMac: (cgAft.pctMac - cgFwd.pctMac) * 100,
      loading,
    },
    neutralPoint: {
      dClhDcl, clAlpha, lH, xAcWing, xAcTail,
      tailOnly: { xM: xNpTailOnly, pctMac: pctMac(xNpTailOnly), staticMargin: smTailOnly },
      withFuselage: xNpWithFuselage === null ? null
        : { xM: xNpWithFuselage, pctMac: pctMac(xNpWithFuselage), staticMargin: smWithFuselage,
            cmvf1M3: cmvf1, fuselageVolumeM3: vFus, shiftM: dxNpFus },
      deckCmvf1M3: cmvf1Deck, cmvf1Ratio,
      marginMin: o.staticMarginMin,
      /* The two numbers BRACKET the answer, they do not average to it. The
         tail-only margin ignores the fuselage entirely and is optimistic;
         the slender-body one over-counts it — measurably so, because on the
         737-class it returns about three times the value Drela's own deck
         carries for the same aeroplane. So the verdict is stated as a
         bracket, and a single static margin is NOT reported as if it were
         known. Closing this needs either NACA TR-711's figure or a second
         calibrated aircraft; both are recorded as open gaps. */
      bracket: { optimisticSm: smTailOnly, pessimisticSm: smWithFuselage },
      verdict: smTailOnly < o.staticMarginMin
        ? "fails even the optimistic bound"
        : smWithFuselage !== null && smWithFuselage >= o.staticMarginMin
          ? "meets the minimum on both bounds"
          : "meets the minimum only when the fuselage is ignored",
      verdictNote: "The fuselage term is bracketed, not known. Read the pair, not a single number.",
    },
    yaw,
    targetCgPctMac: o.targetCgPctMac,
    caveats: [
      "Every station except the wing's is a convention: the TASOPT 737-800 deck's layout, as fractions of "
      + "fuselage length. That deck's own 200-seat variant moves the nose gear from 0.113 to 0.226 of the "
      + "length, so treat these as one aeroplane's choices, not a rule.",
      "The wing station IS solved, by Scholz Eq. (10.24), for the target CG in per cent MAC above. Change "
      + "the target and the wing moves.",
      "The static margin quoted against the tail-only neutral point is OPTIMISTIC: a fuselage is "
      + "destabilising and moves the neutral point forward. The slender-body estimate beside it is an upper "
      + "bound on that shift — TASOPT's own documentation says the theory is \"considerably modified by the "
      + "interaction with the wing\", which is why its 737 deck carries a calibrated input instead.",
      "The loading sweep is passengers only, at zero fuel, packed forward and packed aft. It is not a "
      + "loading diagram: no cargo holds, no fuel-tank sequence, no crew or catering steps.",
      "The CG range it reports is the UNRESTRICTED extreme — every seat forward against every seat aft. "
      + "Published ranges are narrower (the DC-9 Super 80's is 34 % MAC, the L-1011's 12 to 35 %) because "
      + "airlines control the loading. A wider number here is not a disagreement with those.",
      "The tail arm is measured to a tail the drawing placed by convention, so the neutral point and both "
      + "static margins inherit that. On the classes whose tail areas are simply a ratio of wing area, treat "
      + "the margin as an order of magnitude, not a result.",
      "Nothing here feeds back into the sizing loop. The masses are the converged ones and the tail areas "
      + "are still their area ratios; the engine-out fin figure is a comparison, not a size.",
      "Tail arms are measured from the wing's aerodynamic centre. TASOPT measures them from the wing "
      + "centroid instead and says so is \"reasonable for these rather simple sizing relations\"; the two "
      + "differ by a fraction of the MAC.",
    ],
  };
}
