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

import { selectMainTyre, selectLightAircraftTyre } from "../../engine/gear/tyre-select.js";

const FT = 0.3048, IN = 0.0254, LB_PER_KG = 2.20462262;

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

/* ── THE GROUND LINE ──────────────────────────────────────────────────
   How high the aeroplane stands. This was one term and it was the wrong
   one: the previous version set the belly-to-ground distance equal to the
   FLOPS oleo length, `-(fusH/2 + mainOleo)`. That is a category error
   twice over.

   `mainGearOleoIn` is FLOPS's oleo LENGTH, the strut from the TRUNNION to
   the AXLE — LANDING-GEAR.md section 2 says so in as many words — so it is
   measured from neither the belly nor the ground. And an aeroplane stands
   on its TYRES, not on its axles: section 1.5 puts the axle one static
   loaded radius up. Stacked properly there are three terms:

       ground = trunnion station − oleo length − static loaded radius

   WHY THIS WAS WORTH FIXING BEFORE THE GEAR GEOMETRY (G6) IS BUILT. The
   old form put the transport's fuselage centreline 4.118 m up. Boeing's
   737-7 ground-clearance table (ACAP D6-38A004 Rev K section 2.3.1, PDF
   page 29) gives fuselage BOTTOM 1.27–1.55 m and TOP 5.05–5.51 m, i.e. a
   centreline at 3.16–3.53 m. The drawn stance was 17–30 % too tall, and
   the vertical CG, the turnover criterion and the tip-back angle are all
   measured from it.

   ADDING THE MISSING TYRE ALONE MAKES IT WORSE — 4.118 m becomes 4.679 m.
   That is what identifies the REFERENCE, not the missing tyre, as the
   dominant error, and it is checked in the gate so the reasoning cannot
   quietly rot.

   WHAT IS SOURCED HERE AND WHAT IS NOT, because they are not the same:
     - the oleo length is the class's own input (on the transport, the
       Boeing deck's own 84 in, marked `sourced` in its defaults);
     - the static loaded radius is the selected tyre's tabulated `slrIn`,
       from the Goodyear data book;
     - the TRUNNION STATION is sized nowhere in this tool. Main gear on
       these classes hangs off the wing, so it is taken at the wing's
       vertical station — which is itself a drawing convention (see
       `wingZ`). It is not smuggled in: Boeing's published clearance
       implies a trunnion 0.56–0.93 m below the 737-7's centreline, and
       `wingZ` puts it at 0.635 m, inside that. One published band is a
       check on this term, not a derivation of it, and the whole result
       stays `drawn`.

   THE SPLIT WE CANNOT COMPUTE YET, AND WHY IT DOES NOT BIND. Selecting a
   main tyre needs the static load split, which needs the gear stations A
   and B, which is G6 and is not built. It does not bind, but not for the
   comfortable reason: swept across the measured nose-load band the tyre's
   loaded radius moves 12.5 % on the transport, 0.456 m to 0.513 m. What
   saves it is that 0.057 m is small against the 0.37 m width of Boeing's
   own published band, so EVERY pick in the band lands inside it. The gate
   sweeps the band and checks that, rather than checking two ends.

   WHY THE RADIUS IS JUMPY, WHICH IS A PROPERTY OF THE SELECTOR AND WORTH
   KNOWING DOWNSTREAM. `smallestTyre` picks the least-OVER-RATED tyre — it
   minimises rated load, not size — and the Goodyear book is not monotone
   in size against rating: an H49x19.0-22 is rated 41,000 lb and an
   H44.5x16.5-21, four and a half inches smaller, is rated 44,700 lb. So
   which tyre comes back is sharp in LOAD and incidental in GEOMETRY. That
   is the right reading of a regulation that is a load rule, and it is
   what G1–G4 were validated on; but anything geometric downstream — this
   ground line, and G7's stowage volume, which is driven by outside
   diameter — has to know it is reading an incidental number.

   For the same reason, loading the mains with the WHOLE aeroplane as a
   "conservative bound" is not admissible: it returns a 20.00-20, 19 %
   larger in radius than the 737-800's actual tyre. It happens to land
   inside the clearance band anyway, which is exactly why the gate leans
   on reproducing the published TYRE and not only on the band. */

/* Static nose-load fractions actually flown, LANDING-GEAR.md section 3.4:
   seven 737 and 777 rows, 4.6 % (777-200 at the aft CG) to 12.7 % (the
   same aeroplane at the forward CG).

   NOTE A DRIFT IN THE NOTE ITSELF. Its summary table (section 3.7) quotes
   this band as "5.6–12.7 %", which drops the 777 row that sets the
   minimum, and `src/engine/gear/ground-loads.js` copied the summary. The
   DATA table is the authority and is what is used here; the summary and
   the copy are wrong at the low end. */
export const NOSE_LOAD_BAND = Object.freeze({ min: 0.046, max: 0.127 });

/* Wheels per main axle. Two main legs throughout. Dual wheels on the three
   Part 25 classes and a single wheel on the trainer: the trainer is not in
   dispute (the Cessna 172 of section 3.6 has one wheel a side), and the
   other three are a CONVENTION, checked only by its consequence — the tyre
   it produces is compared against the published exemplar for the class. */
export const MAIN_WHEELS_PER_AXLE = Object.freeze({
  transport: 2, bizjet: 2, turboprop: 2, trainer: 1,
});

/* The trainer is sized by pressure, not by load. Section 3.6 is explicit:
   "The tool must not size GA tyres to the section 25.733 limit — it will
   pick a tyre two sizes too small", and measures the Cessna 172's main
   tyre at 69 % of its rating. 42 psi is that aeroplane's own 6.00-6 6PR
   inflation and the low end of the 42–55 psi band section 3.7 gives for
   trainers. It is a declared cap, and it reproduces the 172's published
   tyre, which is the only check available. */
export const TRAINER_MAX_PSI = 42;

/* The main tyre the stance stands on, at a given nose-load fraction.
   Exported so the gate can sweep the fraction rather than trust one. */
export function stanceMainTyre(type, mtowKg, noseFraction) {
  if (!(mtowKg > 0)) return null;
  const wheelsPerAxle = MAIN_WHEELS_PER_AXLE[type] ?? 2;
  const legs = 2;
  const mainLoadLb = mtowKg * LB_PER_KG * (1 - noseFraction);
  const pick = type === "trainer"
    ? selectLightAircraftTyre({ loadPerTyreLb: mainLoadLb / (legs * wheelsPerAxle),
                                maxPsi: TRAINER_MAX_PSI })
    : selectMainTyre({ mainLoadTotalLb: mainLoadLb, legs, wheelsPerAxle });
  return pick.resolved ? pick : null;
}

/* The ground plane, in the drawing's own axes (z up, origin on the
   fuselage centreline). Returns the terms as well as the answer, because
   a drawing that cannot say WHICH term it is unsure of cannot be audited
   — and because G6 will replace the trunnion term first. */
export function groundStance({ type, mtowKg, fusH, wingZ, mainOleo }) {
  const oleo = Math.max(mainOleo || 0, 0.3);   // a class that reports no gear still stands on something
  const band = NOSE_LOAD_BAND;
  const nominalNose = (band.min + band.max) / 2;
  const pick = stanceMainTyre(type, mtowKg, nominalNose);
  const tyreRadius = pick ? pick.tyre.slrIn * IN : 0;
  /* Main gear hangs off the wing on every class this tool draws, so the
     trunnion rides at the wing's vertical station. That station is a
     convention, so this is too. */
  const trunnionZ = wingZ;
  const z = trunnionZ - oleo - tyreRadius;
  /* PROVENANCE, in this module's own vocabulary, because a drawing reads
     it to decide whether it may put a dimension line on the overall
     height. `sourced` is the category made for exactly this: not a
     result, not a bare convention, but a value a published source gives
     a range for and which sits inside it — dimensionable PROVIDED the
     drawing says whose number it is. Where there is no published range
     the stance is `drawn`, and a drawn quantity carries no dimension. */
  const cite = "ground line checked against Boeing 737-7 ACAP §2.3.1 "
             + "(fuselage bottom 1.27–1.55 m, top 5.05–5.51 m)";
  return {
    z,
    zProvenance: type === "transport" ? sourced(z, cite) : drawn(z, "the ground line is a convention for this class"),
    terms: { trunnionZ, oleo, tyreRadius, nominalNose },
    tyre: pick ? pick.tyre : null,
    /* Height of the lowest fuselage point above the ground. Reported, but
       the CENTRELINE height is what the gate checks: belly clearance is
       centreline minus the fuselage RADIUS, and this tool's transport
       fuselage is 3.969 m deep against the real 737's 3.76 m, so the two
       published targets cannot both be met by a correct stance. The
       centreline figure is the one this model predicts; the belly figure
       carries somebody else's 0.21 m. */
    bellyClearance: -(trunnionZ - oleo - tyreRadius) - fusH / 2,
    /* Only the transport has a published ground-clearance table in this
       corpus to be checked against: the three ACAPs held here (737 MAX,
       777, A320) are all jet transports, and no turboprop or trainer
       clearance data was obtainable. The other three classes carry the
       same construction and no external check, and say so. */
    validated: type === "transport",
    why: type === "transport"
      ? "checked against Boeing 737-7 ACAP section 2.3.1 fuselage bottom 1.27–1.55 m"
      : "no published ground-clearance table for this class is held in the corpus; "
      + "the construction is the transport's and is unchecked here",
  };
}

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

  /* Wing VERTICAL station on the body. It lives here for the same reason
     the fuselage outline does: the side view drew the wing at −0.18H and
     the front view at −0.16H, so the same aeroplane carried its wing at two
     heights depending on which view you read. Hoisting it is the fix — one
     number, one place, both views. It is a CONVENTION and stays one:
     nothing in this tool sizes a wing's height on the fuselage, and the
     0.16 is chosen only to match the tail's existing htZ fraction so the
     drawing is internally consistent rather than differently arbitrary. */
  const wingZ = drawn(-val(fusH) * 0.16, "wing vertical station on the body is not sized");

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

  /* Ground line — see THE GROUND LINE above. The drawing still does not
     dimension the track or the wheelbase; those need G6. */
  const stance = groundStance({
    type, mtowKg: result.mtowKg, fusH: val(fusH),
    wingZ: val(wingZ), mainOleo: raw.gear.mainOleo,
  });
  const groundZ = stance.z;

  return {
    type, label: result.typeLabel || type,
    fuselage: { length: fusLen, width: fusW, height: fusH, noseLength: noseLen, tailLength: tailLen },
    wing: { ...wing, ...wc, rootLE: wingRootLE, z: wingZ,
            dihedralDeg: drawn(type === "trainer" ? 2 : 5, "dihedral is not sized") },
    ht: { area: raw.ht.area, span: htSpan, ...htC, rootLE: htRootLE, z: htZ,
          sweepDeg: drawn(wing.sweepDeg + 4, "tail sweep is not sized") },
    vt: { area: raw.vt.area, height: vtHeight, ...vtC, rootLE: vtRootLE,
          sweepDeg: drawn(wing.sweepDeg + 12, "fin sweep is not sized") },
    nacelles, props, groundZ, stance, tTail: raw.tTail, engines: raw.engines,
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
