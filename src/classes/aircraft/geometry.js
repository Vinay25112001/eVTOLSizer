/* =====================================================================
   GENERAL ARRANGEMENT — the sized aeroplane, as a drawable shape
   =====================================================================
   Every class sizes an aircraft and reports its geometry in a different
   shape and a different unit: the jets carry a full FLOPS geometry block in
   feet, the turboprop carries its own inputs in feet, the trainer carries
   inputs in feet and inches under different names again. This module turns
   any of them into one description, in metres, that a drawing can consume.

   WHAT IS SIZED AND WHAT IS DRAWING CONVENTION. A general-arrangement
   drawing needs more shape than a sizing loop produces, and the difference
   matters, so it is carried explicitly: every returned value has a `sized`
   flag. Wing area, span, taper, sweep, thickness, tail areas, fuselage
   length and diameter, nacelle diameter and length and engine count all
   come from the sizing loop and are marked sized. Nose and tail-cone
   length fractions, wing longitudinal position, dihedral and the tail-cone
   upsweep are proportions this tool does not yet size — they are drawn to
   conventional values so the aeroplane looks like an aeroplane, and the
   drawing refuses to put a dimension line on any of them.

   Wing longitudinal position becomes a sized quantity once centre-of-gravity
   and balance are modelled (the audit's Gap 6); until then it is a
   convention and is labelled as one.

   Axes, in metres, origin at the nose on the fuselage centreline:
     x  aft along the fuselage
     y  starboard
     z  up
   ===================================================================== */

const FT = 0.3048, IN = 0.0254;

const sized = (value) => ({ value, sized: true });
const drawn = (value, why) => ({ value, sized: false, why });
/* A proportion the sizing loop does not produce, but which a published
   source gives a range for and this value sits inside. It is not a result,
   so it is not `sized`; it is not a bare convention either, so a drawing may
   dimension it provided it says whose number it is. `cite` is that
   attribution and is rendered, never dropped. */
const sourced = (value, cite) => ({ value, sized: false, sourced: true, cite });
export const val = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

/* Chords of a straight-tapered surface from its area, span and taper. */
function chords(area, span, taper) {
  const root = (2 * area) / (span * (1 + taper));
  return { root, tip: root * taper, mac: (2 / 3) * root * (1 + taper + taper * taper) / (1 + taper) };
}

/* Span of a surface from its area and aspect ratio. */
const spanOf = (area, ar) => Math.sqrt(Math.max(1e-9, area * ar));

/* Leading-edge sweep of a straight-tapered surface from its QUARTER-CHORD
   sweep, which is what every input in this tool carries (`wingSweep` is
   labelled "Quarter-chord sweep" and is the Boeing deck's own figure):

       tan Λ_LE = tan Λ_c/4 + (1/AR)·(1 − λ)/(1 + λ)

   This lives here, exported, because two drawings were computing it
   differently: the general arrangement converted, and the structural
   planform did not, so the same 737 wing was drawn with a 25.0° leading
   edge on one view and 28.6° on the other. Anything that needs a leading
   edge calls this. */
export function leSweepRad(sweepC4Deg, ar, taper) {
  return Math.atan(Math.tan((sweepC4Deg * Math.PI) / 180)
                   + (1 / Math.max(ar, 1e-6)) * ((1 - taper) / (1 + taper)));
}

/* ── THE FUSELAGE OUTLINE ─────────────────────────────────────────────
   One description of the body, used by every view that draws it.

   This is exported for the same reason `leSweepRad` is: the outline was
   written out by hand in three places — the general arrangement, the
   structural profile and the station diagram — and the copies drifted. The
   general arrangement closed its tail cone on +0.14H..+0.02H while the
   other two closed on +0.22H..+0.05H, so the same aeroplane was drawn with
   two different upsweeps depending on which tab was open. Its nose also
   started 6% of H below the centreline while the other two mirrored theirs.
   Anything that draws the body calls this now.

   WHAT IS SOURCED HERE, AND WHAT IS NOT.

   NOSE AND TAIL-CONE LENGTH ARE SOURCED. Torenbeek, "Synthesis of Subsonic
   Airplane Design", 1982, §3.5.1, pp. 93-94: the tail length "is usually
   2.5 to 3 times the diameter of the cylindrical section", and for the nose
   "a frequently used value for the length/diameter ratio is 1.5 to 2.0".
   The 3.0 and 1.8 used below sit inside those ranges. Corroborated by GASP
   (NASA CR-152303 Vol. 1), whose ELODT default is 3.2 and ELODN 2.0, and by
   the calibrated GASP decks shipped with NASA Aviary: ELODT 3.0 for a
   737-800 class body, 3.368 for a small single aisle, 2.90 for a large
   turboprop freighter. Kroo (2001) §3.2 gives 1.8 to 2.0 for the tail cone
   and is the outlier; his own text does not settle whether he means
   fineness or taper, so the disagreement is recorded rather than averaged.

   THE UPSWEEP IS NOT SOURCED — AND IS NOT INVENTED HERE EITHER. No source
   reachable from this project states where a tail-cone tip sits relative to
   the fuselage centreline, and the sources that do discuss upsweep DO NOT
   SHARE A DATUM: Torenbeek and Raymer measure it on the fuselage CENTRELINE,
   Raymer's 25 deg is a LOWER-SURFACE figure for rear-loading freighters
   only, his 10-12 deg is a contour deviation from the freestream, and Kroo
   measures the centre of cross-sectional area at 75% of tail-cone length.
   Mixing them produces a wrong drawing. This project's own research note
   already ruled on it — CABIN-LAYOUT.md §5: "Tail-cone upsweep angle. Not
   sourced anywhere. ... Do not invent one." So the closure fractions below
   are a declared drawing convention and NO VIEW DIMENSIONS THEM. ESDU 80006
   "Drag increment due to rear fuselage upsweep" is the dedicated primary
   item; it is paywalled, and it is what would replace this constant.

   The convention keeps the two-of-three majority (the structural profile
   and the station diagram), which is also the drawing the upsweep question
   was raised against. */
export const FUSELAGE_FINENESS = Object.freeze({
  nose: 1.8, noseRange: Object.freeze([1.5, 2.0]),
  tailCone: 3.0, tailConeRange: Object.freeze([2.5, 3.0]),
  cite: "Torenbeek 1982, §3.5.1, pp. 93-94",
});

/* Tail-cone closure and nose fullness, as fractions of fuselage height and
   of the cone lengths. UNSOURCED drawing convention — see the note above. */
export const FUSELAGE_CONVENTION = Object.freeze({
  crownTipZ: 0.22, keelTipZ: 0.05,     // tip face, fractions of H above centreline
  crownControlX: 0.40, keelControlX: 0.45,
  noseControlX: 0.30,
  planTipY: 0.055, planShoulderY: 0.16,
  planNoseControlX: [0.42, 0.76], planTailControlX: [0.38, 0.12], planNoseY: 0.30,
});

/* Side elevation, in BODY coordinates: x aft from the nose, z up from the
   centreline, both in metres. The caller maps them to its own sheet.

   The keel rises further than the crown falls — that difference IS the
   upsweep, and it is what gives an aeroplane its profile and its rotation
   clearance. A symmetric tail cone would draw a dart. */
export function fuselageSideOutline({ length, height, noseLength, tailLength }) {
  const L = length, H = height, n = noseLength, t = tailLength, C = FUSELAGE_CONVENTION;
  return [
    ["M", [0, 0]],
    ["Q", [n * C.noseControlX, H / 2], [n, H / 2]],
    ["L", [L - t, H / 2]],
    ["Q", [L - t * C.crownControlX, H / 2], [L, H * C.crownTipZ]],
    ["L", [L, H * C.keelTipZ]],
    ["Q", [L - t * C.keelControlX, -H / 2], [L - t, -H / 2]],
    ["L", [n, -H / 2]],
    ["Q", [n * C.noseControlX, -H / 2], [0, 0]],
    ["Z"],
  ];
}

/* Plan view, in BODY coordinates: x aft, y starboard. An aeroplane is
   symmetric about its vertical plane, so the port half is the exact sign
   flip of the starboard half and is built that way rather than retyped. */
export function fuselagePlanOutline({ length, width, noseLength, tailLength }) {
  const L = length, W = width, n = noseLength, t = tailLength, C = FUSELAGE_CONVENTION;
  const [n1, n2] = C.planNoseControlX, [t1, t2] = C.planTailControlX;
  const starboard = [
    ["M", [0, 0]],
    ["C", [n * n1, W * C.planNoseY], [n * n2, W / 2], [n, W / 2]],
    ["L", [L - t, W / 2]],
    ["C", [L - t * t1, W / 2], [L - t * t2, W * C.planShoulderY], [L, W * C.planTipY]],
  ];
  const port = [
    ["L", [L, -W * C.planTipY]],
    ["C", [L - t * t2, -W * C.planShoulderY], [L - t * t1, -W / 2], [L - t, -W / 2]],
    ["L", [n, -W / 2]],
    ["C", [n * n2, -W / 2], [n * n1, -W * C.planNoseY], [0, 0]],
    ["Z"],
  ];
  return [...starboard, ...port];
}

/* Body coordinates to an SVG path, through the caller's own two mappers. */
export function outlinePath(segments, X, Z) {
  return segments
    .map(([op, ...pts]) =>
      op === "Z" ? "Z" : `${op} ${pts.map(([a, b]) => `${X(a)} ${Z(b)}`).join(" ")}`)
    .join(" ");
}

/* Mean aerodynamic chord of a straight-tapered surface, its spanwise
   station, and how far aft of the root leading edge its own leading edge
   sits. Standard trapezoidal-wing geometry; the balance model needs all
   three and so does any drawing that wants to mark the MAC. */
export function macOf({ area, span, taper, sweepC4Deg }) {
  const c = chords(area, span, taper);
  const yMac = (span / 6) * ((1 + 2 * taper) / (1 + taper));
  const ar = (span * span) / Math.max(area, 1e-9);
  const xLeMacFromRootLE = yMac * Math.tan(leSweepRad(sweepC4Deg, ar, taper));
  return { mac: c.mac, yMac, xLeMacFromRootLE, rootChord: c.root, tipChord: c.tip, ar };
}

/* ── per-class readers ────────────────────────────────────────────────
   Each returns raw numbers already converted to metres. They read only
   what their class actually produces; anything absent is left undefined
   and the caller substitutes a convention. */

function jetGeometry(result) {
  const g = result.raw.geometryInputs || {}, p = result.raw.inputs || {};
  const htArea = (g.htArea ?? 0) * FT * FT, vtArea = (g.vtArea ?? 0) * FT * FT;
  return {
    fuselage: { length: (g.fuselageLength ?? 0) * FT, width: (g.fuselageWidth ?? 0) * FT,
                height: (g.fuselageHeight ?? 0) * FT },
    wing: { area: result.wingAreaM2, span: result.spanM, taper: p.wingTaper ?? 0.25,
            sweepDeg: p.wingSweep ?? 25, tc: p.wingTc ?? 0.12 },
    ht: { area: htArea, ar: g.htAspectRatio ?? 5, taper: g.htTaper ?? 0.3 },
    vt: { area: vtArea, ar: g.vtAspectRatio ?? 1.7, taper: g.vtTaper ?? 0.3 },
    nacelle: { diameter: (g.nacelleDiameter ?? 0) * FT, length: (g.nacelleLength ?? 0) * FT },
    gear: { mainOleo: (g.mainGearOleoIn ?? 0) * IN, noseOleo: (g.noseGearOleoIn ?? 0) * IN },
    engines: result.propulsion?.engines ?? p.numEngines ?? 2,
    engineLocation: p.engineLocation ?? "wing",
    tTail: p.tTail === true,
    propeller: null,
  };
}

function turbopropGeometry(result) {
  const p = result.raw.inputs || {};
  const S = result.wingAreaM2;
  return {
    fuselage: { length: (p.fuselageLength ?? 0) * FT, width: (p.fuselageWidth ?? 0) * FT,
                height: (p.fuselageHeight ?? 0) * FT },
    wing: { area: S, span: result.spanM, taper: p.wingTaper ?? 0.5,
            sweepDeg: p.wingSweep ?? 3, tc: p.wingTc ?? 0.15 },
    ht: { area: (p.htAreaRatio ?? 0.2) * S, ar: 4.5, taper: 0.45 },
    vt: { area: (p.vtAreaRatio ?? 0.2) * S, ar: 1.4, taper: 0.5 },
    nacelle: { diameter: (p.nacelleDiameterFt ?? 0) * FT, length: (p.nacelleLengthFt ?? 0) * FT },
    gear: { mainOleo: (p.mainGearOleoIn ?? 0) * IN, noseOleo: (p.noseGearOleoIn ?? 0) * IN },
    engines: result.propulsion?.engines ?? p.numEngines ?? 2,
    engineLocation: "wing",
    tTail: true,                                   // the regional turboprops in the dataset are T-tails
    propeller: { diameter: (p.propellerDiameterFt ?? 0) * FT, blades: p.propellerBlades ?? 6 },
  };
}

function trainerGeometry(result) {
  const p = result.raw.inputs || {};
  const S = result.wingAreaM2;
  const htArea = 0.17 * S, vtArea = 0.09 * S;      // conventional light-aircraft ratios
  return {
    fuselage: { length: (p.fuselageLengthFt ?? 0) * FT, width: (p.fuselageWidthFt ?? 0) * FT,
                height: (p.fuselageDepthFt ?? 0) * FT },
    wing: { area: S, span: result.spanM, taper: 0.7, sweepDeg: 1, tc: 0.12 },
    ht: { area: htArea, ar: p.htAR ?? 4, taper: p.tailTaper ?? 0.6 },
    vt: { area: vtArea, ar: p.vtAR ?? 1.5, taper: p.tailTaper ?? 0.5 },
    nacelle: { diameter: 0, length: 0 },
    gear: { mainOleo: 0.5, noseOleo: 0.5 },
    engines: 1,
    engineLocation: "nose",
    tTail: false,
    propeller: { diameter: (p.propDiameterIn ?? 76) * IN, blades: p.propBlades ?? 2 },
  };
}

/* ── the arrangement ─────────────────────────────────────────────────── */

export function generalArrangement(result) {
  if (!result || !Number.isFinite(result.spanM) || !Number.isFinite(result.wingAreaM2)) return null;
  const type = result.type;
  const raw = type === "trainer" ? trainerGeometry(result)
            : type === "turboprop" ? turbopropGeometry(result)
            : jetGeometry(result);

  /* Fall back to a slenderness convention if a class gives no fuselage. */
  const fusLen = raw.fuselage.length > 0 ? sized(raw.fuselage.length)
               : drawn(raw.wing.span * 0.95, "no fuselage length is sized for this type");
  const fusW = raw.fuselage.width > 0 ? sized(raw.fuselage.width)
             : drawn(val(fusLen) / 9, "no fuselage width is sized for this type");
  const fusH = raw.fuselage.height > 0 ? sized(raw.fuselage.height) : drawn(val(fusW) * 1.05, "as the width");

  const L = val(fusLen), D = Math.max(val(fusW), val(fusH));
  const wing = raw.wing;
  const wc = chords(wing.area, wing.span, wing.taper);

  /* Longitudinal positions. The nose and tail-cone fractions and the wing
     station are drawing conventions — a sizing loop with no balance model
     cannot place the wing, and this one says so rather than implying it. */
  /* Each of these is the smaller of a fineness cap and a fraction of
     overall length, and what decides the provenance is the RATIO THE
     DRAWING ACTUALLY ENDS UP WITH — not which term won. Torenbeek publishes
     RANGES, so the only honest test is whether the cone as drawn lands
     inside his, whatever produced it.

     MEASURED, AND IT DOES NOT. On every class this tool sizes, the length
     fraction binds and the result falls BELOW both published ranges:

       transport  nose 1.34  tail 2.49        published  nose 1.5-2.0
       bizjet     nose 1.07  tail 1.99                   tail 2.5-3.0
       turboprop  nose 1.27  tail 2.36
       trainer    nose 0.85  tail 1.57

     So the 1.8 and 3.0 caps never bind and are inert, and these lengths
     stay declared conventions carrying no dimension line. Calling them
     sourced would attribute to Torenbeek a body he did not describe. The
     check is left live rather than deleted: it promotes itself the moment a
     drawn cone does land inside the range, and `validation/fuselage-outline.mjs`
     holds the measured gap so it cannot be quietly forgotten. */
  const fineness = (len) => len / Math.max(D, 1e-9);
  const within = (x, [lo, hi]) => x >= lo && x <= hi;
  const conePart = (len, range, what) =>
    within(fineness(len), range)
      ? sourced(len, `${what} fineness ${fineness(len).toFixed(2)} — inside the published `
                     + `${range.join("–")}, ${FUSELAGE_FINENESS.cite}`)
      : drawn(len, `${what} fineness ${fineness(len).toFixed(2)} is outside the published `
                   + `${range.join("–")} (${FUSELAGE_FINENESS.cite}); the length fraction is not sized`);

  const noseLen = conePart(Math.min(0.14 * L, FUSELAGE_FINENESS.nose * D),
                           FUSELAGE_FINENESS.noseRange, "nose");
  const tailLen = conePart(Math.min(0.26 * L, FUSELAGE_FINENESS.tailCone * D),
                           FUSELAGE_FINENESS.tailConeRange, "tail-cone");
  const wingRootLE = drawn(type === "trainer" ? 0.26 * L : 0.38 * L,
                           "wing longitudinal position needs a balance model (audit Gap 6)");

  const htSpan = spanOf(raw.ht.area, raw.ht.ar), htC = chords(raw.ht.area, htSpan, raw.ht.taper);
  /* A vertical tail's "span" is its height, and its area is counted once,
     so the aspect ratio is defined on that single surface. */
  const vtHeight = spanOf(raw.vt.area, raw.vt.ar), vtC = chords(raw.vt.area, vtHeight, raw.vt.taper);

  const vtRootLE = L - val(tailLen) * 0.72;
  const htRootLE = raw.tTail ? vtRootLE + vtC.root * 0.62 : L - htC.root * 1.45;
  const htZ = raw.tTail ? vtHeight * 0.92 : val(fusH) * 0.16;

  /* Nacelles. Wing-mounted engines sit on spanwise stations; aft-fuselage
     engines sit beside the tail cone; a single propeller sits on the nose. */
  const nacelles = [];
  const nD = raw.nacelle.diameter, nL = raw.nacelle.length;
  const perSide = Math.max(1, Math.round(raw.engines / 2));
  if (raw.engineLocation === "nose") {
    nacelles.push({ x: 0, y: 0, z: 0, d: Math.max(D * 0.62, 0.8), l: val(noseLen) * 0.9, kind: "nose" });
  } else if (raw.engineLocation === "aft-fuselage") {
    for (const s of [-1, 1]) nacelles.push({ x: L - val(tailLen) * 0.95, y: s * (val(fusW) / 2 + nD * 0.62),
                                             z: val(fusH) * 0.16, d: nD, l: nL, kind: "pod" });
  } else {
    for (const s of [-1, 1]) for (let i = 0; i < perSide; i++) {
      const eta = perSide === 1 ? 0.34 : 0.30 + 0.27 * i;
      const y = s * eta * wing.span / 2;
      const leAt = val(wingRootLE) + Math.abs(y) * Math.tan(wing.sweepDeg * Math.PI / 180);
      nacelles.push({ x: leAt - nL * 0.58, y, z: -Math.max(nD * 0.30, 0.25), d: nD, l: nL, kind: "pod", eta });
    }
  }
  if (raw.engineLocation === "wing+tail" || raw.engineLocation === "fuselage-3") {
    nacelles.push({ x: L - val(tailLen) * 0.55, y: 0, z: val(fusH) * 0.42, d: nD, l: nL, kind: "centre" });
  }

  /* Propellers, where the class has them: drawn as a disc on the drawing. */
  const props = raw.propeller && raw.propeller.diameter > 0
    ? (raw.engineLocation === "nose"
        ? [{ x: 0, y: 0, z: 0, d: raw.propeller.diameter }]
        : nacelles.filter((n) => n.kind === "pod").map((n) => ({ x: n.x, y: n.y, z: n.z, d: raw.propeller.diameter })))
    : [];

  /* Ground line. The wheels are not sized yet, so the stance comes from the
     oleo lengths, which are real inputs, and the drawing does not dimension
     the track or the wheelbase until a gear model sizes them. */
  const groundZ = -(val(fusH) / 2 + Math.max(raw.gear.mainOleo, 0.3));

  return {
    type, label: result.typeLabel || type,
    fuselage: { length: fusLen, width: fusW, height: fusH, noseLength: noseLen, tailLength: tailLen },
    wing: { ...wing, ...wc, rootLE: wingRootLE,
            dihedralDeg: drawn(type === "trainer" ? 2 : 5, "dihedral is not sized") },
    ht: { area: raw.ht.area, span: htSpan, ...htC, rootLE: htRootLE, z: htZ,
          sweepDeg: drawn(wing.sweepDeg + 4, "tail sweep is not sized") },
    vt: { area: raw.vt.area, height: vtHeight, ...vtC, rootLE: vtRootLE,
          sweepDeg: drawn(wing.sweepDeg + 12, "fin sweep is not sized") },
    nacelles, props, groundZ, tTail: raw.tTail, engines: raw.engines,
    engineLocation: raw.engineLocation,
    /* Everything a dimension line may legitimately be drawn against. */
    dimensions: {
      span: sized(wing.span),
      length: fusLen,
      htSpan: sized(htSpan),
      vtHeight: sized(vtHeight),
      fuselageWidth: fusW,
      fuselageHeight: fusH,
      wingArea: sized(wing.area),
      sweep: sized(wing.sweepDeg),
    },
  };
}
