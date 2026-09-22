/* =====================================================================
   FUSELAGE INTERNAL ARRANGEMENT — what the shell is made of, and where
   =====================================================================
   The general-arrangement drawing draws the fuselage as an outline. This
   module puts the structure inside it: frames, stringers, the pressurized
   shell and its two bulkheads, the floor, and the panel the skin is
   actually divided into.

   THE RULE THIS MODULE OBEYS, from
   eVTOL_Sizing_Research/classes/cross-class/STRUCTURAL-LAYOUT.md section 4.5:

     "Draw only three kinds of line, and colour them differently: (1) lines
      whose position is a computed quantity; (2) lines whose position is a
      sourced convention, with the source in the tooltip; (3) nothing else.
      ... A drawing that invents structure is worse than one that shows
      less."

   So every number here carries where it came from, and the features that
   have neither a computed driver nor a source are returned in `notDrawn`
   with the reason, rather than being quietly drawn to look plausible.
   Longeron count and position, stanchion lateral positions, the keel beam's
   longitudinal extent, the pressure decks over the wheel well, the shape of
   the bulkheads and the window pitch are all in that list. They are real
   members - the sources name them - but nothing obtainable places them.

   WHAT IS SOURCED.

   Frame pitch. Transport: 20-21 in, from the Boeing IAS report Fig. 5-4 and
   ATCAS section 5.1. Light aircraft: 10-23 in, mean 16.8 in, FAA-H-8083-31B
   Fig. 1-88. Business jet and turboprop: NOT VERIFIED, and this module
   therefore draws no individual frames for those classes rather than
   interpolating a number and letting it be read as sourced.

   Stringer pitch. Metal transport: 9.25 in, IAS Fig. 5-4. Composite:
   12-17 in, ATCAS section 5.1 - carried as an alternative only, because
   FLOPS has no fuselage composite term and nothing in this tool selects it.

   Floor. Thickness about 0.2 m, lowered 0 to 1 m below the centreline with
   an average of 0.6 m: Scholz, Aircraft Design, Ch. 6 p. 6-5. Floor beams
   lie in the plane of the frames (ATCAS sections 5.3, 5.4), so their
   stations are the frame stations and need no separate convention.

   WHAT IS COMPUTED.

   The shell cross-section, from the sized fuselage width and height. The
   frame and stringer counts, from that section and the sourced pitches. The
   skin panel size and count, which is frame pitch by stringer pitch and is
   the quantity a stress engineer actually works in. And the decompression
   vent area, which 14 CFR 25.365(e)(2) defines outright:

       H_o = P * A_s,   P = A_s/6240 + 0.024,   H_o need not exceed 20 ft^2

   with A_s the maximum cross-sectional area of the pressurized shell normal
   to the longitudinal axis, in square feet. That is a regulation turning a
   computed area into a required opening, with nothing assumed in between,
   and it is the one number on this view that is neither a convention nor an
   estimate. The 20 ft^2 cap starts to bite at about a 20 ft equivalent
   diameter, which is widebody territory.

   WHAT IS ANCHORED TO A CONVENTION AND SAYS SO.

   Every longitudinal station. Frames are numbered aft from the forward
   pressure bulkhead, which is where a real body-station datum sits, but
   this tool has no cabin layout yet, so that bulkhead's position is the
   general arrangement's drawn nose length. The pitch between frames is
   sourced and the count is computed; the absolute position of frame 1 is
   not. The same goes for the heavy frames at the wing, engine and tail
   attachments - 14 CFR is silent and FAA-H-8083-31B p. 1-8 only says they
   exist there ("The heaviest of these structural members are located at
   intervals to carry concentrated loads and at points where fittings are
   used to attach other units such as wings, powerplants, and stabilizers"),
   so the stations follow the drawing's wing and tail positions and inherit
   their status. Balance (audit Gap 6) is what turns those into computed
   quantities; until then the view is explicit that they are not.
   ===================================================================== */

import { generalArrangement, val } from "./geometry.js";
import { SPARS_BY_CLASS } from "./wing-structure.js";

const FT = 0.3048, IN = 0.0254;
const M2_PER_FT2 = FT * FT;

/* Frame pitch. Only two classes have a verified number. */
export const FRAME_PITCH_BY_CLASS = Object.freeze({
  transport: { pitchM: 20.5 * IN, loM: 20 * IN, hiM: 21 * IN, sourced: true,
               source: "20-21 in: Boeing IAS (NASA CR-2000-209337) Fig. 5-4, and ATCAS section 5.1" },
  trainer:   { pitchM: 16.8 * IN, loM: 10 * IN, hiM: 23 * IN, sourced: true,
               source: "10-23 in, mean 16.8 in: FAA-H-8083-31B Fig. 1-88, measured over the frames of a light aircraft" },
  bizjet:    { pitchM: null, sourced: false,
               source: "NOT VERIFIED - no published frame pitch for this class, so no individual frames are drawn" },
  turboprop: { pitchM: null, sourced: false,
               source: "NOT VERIFIED - no published frame pitch for this class, so no individual frames are drawn" },
});

/* Stringer pitch. The metal transport figure is the only measured one; the
   composite band is carried so the view can say what it would change. */
export const STRINGER_PITCH = Object.freeze({
  metal:     { pitchM: 9.25 * IN, source: "9.25 in: Boeing IAS (NASA CR-2000-209337) Fig. 5-4, metal built-up panel" },
  composite: { loM: 12 * IN, hiM: 17 * IN, source: "12-17 in: ATCAS section 5.1, composite panel" },
});

/* Scholz, Aircraft Design, Ch. 6 p. 6-5. */
export const FLOOR = Object.freeze({
  thicknessM: 0.2, dropLoM: 0.0, dropHiM: 1.0, dropMeanM: 0.6,
  source: "Scholz, Aircraft Design, Ch. 6 p. 6-5: floor thickness about 0.2 m; the floor sits 0 to 1 m below "
        + "the centreline, average 0.6 m",
});

/* Part 25 classes. The trainer is not certificated under Part 25 and this
   tool models no pressurized compartment for it, so 25.365 is not applied
   to it rather than being applied and quietly passed. */
const PRESSURIZED = new Set(["transport", "bizjet", "turboprop"]);

/* Perimeter of an ellipse, Ramanujan's second approximation. The fuselage
   is not circular on any of these classes and pi*d would misstate the
   stringer count by several per cent on a wide, shallow section. */
export function ellipsePerimeter(a, b) {
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/* 14 CFR 25.365(e)(2), verbatim in the research extract
   eVTOL_Sizing_Research/classes/transport/extracted/14CFR_25.365.txt */
export function decompressionVent(crossSectionM2) {
  const asFt2 = crossSectionM2 / M2_PER_FT2;
  const P = asFt2 / 6240 + 0.024;
  const raw = P * asFt2;
  const capped = raw > 20;
  const hoFt2 = capped ? 20 : raw;
  return {
    asFt2, P, uncappedFt2: raw, hoFt2, hoM2: hoFt2 * M2_PER_FT2, capped,
    formula: "H_o = P * A_s, P = A_s/6240 + 0.024, H_o need not exceed 20 ft^2",
    source: "14 CFR 25.365(e)(2)",
  };
}

/* ── the arrangement ─────────────────────────────────────────────────── */

export function fuselageStructure(result, opts = {}) {
  const ga = generalArrangement(result);
  if (!ga) return null;
  const type = ga.type;

  const L = val(ga.fuselage.length), W = val(ga.fuselage.width), H = val(ga.fuselage.height);
  if (!(L > 0 && W > 0 && H > 0)) return null;

  const lengthSized = ga.fuselage.length.sized;
  const widthSized = ga.fuselage.width.sized && ga.fuselage.height.sized;

  const crossSectionM2 = (Math.PI / 4) * W * H;
  const perimeterM = ellipsePerimeter(W / 2, H / 2);
  const equivDiaM = Math.sqrt((4 * crossSectionM2) / Math.PI);

  /* The pressurized shell runs from the back of the nose to the front of
     the tail cone. Both of those lengths are drawing conventions in the
     general arrangement, so the two bulkhead stations are conventions too
     and are reported as such. */
  const noseL = val(ga.fuselage.noseLength), tailL = val(ga.fuselage.tailLength);
  const fwdX = noseL, aftX = L - tailL;
  const shellLengthM = Math.max(0, aftX - fwdX);

  /* Frames. Pitch sourced, count computed, station positions anchored to a
     convention - all three stated separately because they differ. */
  const fp = FRAME_PITCH_BY_CLASS[type] ?? FRAME_PITCH_BY_CLASS.transport;
  let frames = null;
  if (fp.pitchM) {
    const count = Math.max(2, Math.round(shellLengthM / fp.pitchM) + 1);
    const pitchActualM = shellLengthM / (count - 1);
    const stations = [];
    for (let i = 0; i < count; i++) stations.push({ i, x: fwdX + i * pitchActualM });
    frames = {
      drawn: true, pitchNominalM: fp.pitchM, pitchM: pitchActualM,
      bandLoM: fp.loM, bandHiM: fp.hiM, source: fp.source,
      inBand: pitchActualM >= fp.loM && pitchActualM <= fp.hiM,
      count, stations,
      anchor: "numbered aft from the forward pressure bulkhead, whose station is a drawing convention "
            + "until the cabin is laid out; the pitch between frames is sourced and the count is computed",
    };
  } else {
    frames = { drawn: false, source: fp.source,
               why: "No published frame pitch for this class. Interpolating one would be invention, so the "
                  + "view shows the shell and the sourced features and leaves the frames out." };
  }

  /* Stringers around the circumference. */
  const sp = STRINGER_PITCH.metal;
  const stringerCount = Math.max(4, Math.round(perimeterM / sp.pitchM));
  const stringerPitchActualM = perimeterM / stringerCount;
  const stringers = {
    pitchNominalM: sp.pitchM, pitchM: stringerPitchActualM, count: stringerCount,
    perimeterM, source: sp.source,
    composite: { ...STRINGER_PITCH.composite,
      countLo: Math.round(perimeterM / STRINGER_PITCH.composite.hiM),
      countHi: Math.round(perimeterM / STRINGER_PITCH.composite.loM),
      note: "A composite shell is stringer-pitched far wider, which is most of why it has fewer parts. "
          + "FLOPS carries no fuselage composite term, so nothing in this tool selects it and the count "
          + "above is the metal one." },
  };

  /* The skin panel: frame pitch by stringer pitch. This is the unit a
     stiffened-shell stress check works in, and both sides are now known. */
  const panel = frames.drawn
    ? { lengthM: frames.pitchM, widthM: stringerPitchActualM,
        aspect: frames.pitchM / stringerPitchActualM,
        areaM2: frames.pitchM * stringerPitchActualM,
        count: (frames.count - 1) * stringerCount }
    : null;

  /* Heavy frames at the attachments. FAA-H-8083-31B p. 1-8 says they are
     there; the stations follow the drawing's wing and tail positions, which
     are conventions until balance is modelled. */
  const spars = SPARS_BY_CLASS[type] ?? SPARS_BY_CLASS.transport;
  const wingLE = val(ga.wing.rootLE), cRoot = ga.wing.root;
  const heavy = [
    { x: wingLE + spars.front * cRoot, label: "wing front spar, side of body",
      sized: false, why: "wing longitudinal position is a drawing convention (audit Gap 6)" },
    { x: wingLE + spars.rear * cRoot, label: "wing rear spar, side of body",
      sized: false, why: "wing longitudinal position is a drawing convention (audit Gap 6)" },
    { x: val(ga.vt.rootLE), label: "fin front attachment",
      sized: false, why: "tail-cone length is a drawing convention" },
  ];
  if (!ga.tTail) heavy.push({ x: val(ga.ht.rootLE), label: "tailplane attachment",
                              sized: false, why: "tail-cone length is a drawing convention" });
  for (const n of ga.nacelles) {
    if (n.kind === "pod" && Math.abs(n.y) < W) heavy.push({ x: n.x + n.l * 0.5, label: "engine mount frame",
      sized: false, why: "aft-fuselage engine station follows the drawn tail cone" });
    if (n.kind === "centre") heavy.push({ x: n.x, label: "centre engine inlet frame",
      sized: false, why: "centre engine station follows the drawn tail cone" });
  }
  heavy.sort((a, b) => a.x - b.x);
  /* A port and a starboard engine hang off ONE frame, not two. Collapse
     stations that coincide, or the drawing shows a doubled line and the
     count is wrong. */
  const merged = [];
  for (const h of heavy) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.x - h.x) < 1e-6 && prev.label === h.label) continue;
    merged.push(h);
  }
  heavy.length = 0; heavy.push(...merged);
  /* Attach each to its nearest frame, which is what actually happens: a
     heavy frame is a frame, not an extra station between two. */
  if (frames.drawn) {
    for (const h of heavy) {
      let best = frames.stations[0];
      for (const s of frames.stations) if (Math.abs(s.x - h.x) < Math.abs(best.x - h.x)) best = s;
      h.frame = best.i; h.xFrame = best.x;
    }
  }

  /* Pressure vessel. */
  const cruiseAltFt = result.raw?.inputs?.cruiseAltFt ?? null;
  const pressure = PRESSURIZED.has(type)
    ? {
        applies: true,
        fwdX, aftX, shellLengthM,
        boundariesSized: false,
        boundaryWhy: "Both bulkhead stations are the general arrangement's nose and tail-cone lengths, which "
                   + "are drawing conventions. A cabin layout (flight deck + cabin + baggage) is what makes "
                   + "them computed quantities.",
        crossSectionM2, equivDiaM,
        vent: decompressionVent(crossSectionM2),
        burstFactor: 1.33,
        burstNote: "14 CFR 25.365(d): the shell must take the maximum relief-valve differential times 1.33 for "
                 + "approval to 45,000 ft, or 1.67 above it. This tool has no maximum operating altitude and no "
                 + "relief-valve setting, so the factor is quoted, not applied"
                 + (cruiseAltFt ? `; the cruise altitude here is ${cruiseAltFt.toLocaleString("en-US")} ft.` : "."),
        bulkheadShape: "flat, schematic — no source was obtained for a dome radius, so the view draws a plain "
                     + "bulkhead and does not dimension it",
      }
    : { applies: false,
        why: "This class is not certificated under Part 25 and the tool models no pressurized compartment for "
           + "it, so 25.365 is not evaluated. Not evaluated is not a pass." };

  /* Floor. */
  const floor = PRESSURIZED.has(type)
    ? { present: true, dropM: FLOOR.dropMeanM, thicknessM: FLOOR.thicknessM,
        zM: -FLOOR.dropMeanM, source: FLOOR.source,
        beamsAtFrames: frames.drawn,
        beamNote: "Floor beams lie in the plane of the frames (ATCAS sections 5.3 and 5.4), so their stations "
                + "are the frame stations and no separate convention is needed.",
        cabinHeadroomM: H / 2 + FLOOR.dropMeanM - FLOOR.thicknessM,
        drop: { loM: FLOOR.dropLoM, hiM: FLOOR.dropHiM } }
    : { present: false, why: "No floor is drawn for a class with no cabin model." };

  /* The list that keeps this drawing honest. */
  const notDrawn = [
    { feature: "Longerons", why: "Their existence and role are sourced (FAA-H-8083-31B p. 1-8) but no obtainable "
        + "source gives a count or a position." },
    { feature: "Stanchions", why: "ATCAS section 5.3 names them; lateral positions are not sourced." },
    { feature: "Keel beam / keelson web", why: "Named in ATCAS p. 4-1 and NASA CR-159296 Table 4, but its "
        + "longitudinal extent is the wheel-well length, which this tool does not compute." },
    { feature: "Pressure decks over the wheel well", why: "Named in NASA CR-159296 Table 4; position not sourced." },
    { feature: "Seat tracks", why: "14 CFR 25.562(b)(2) assumes floor rails, so they exist; the lateral pitch "
        + "is not verified." },
    { feature: "Window belt and window pitch", why: "ATCAS p. 4-1 names the belt. Window pitch is normally the "
        + "frame or stringer pitch but that was not sourced, so no windows are placed." },
    { feature: "Bulkhead shape", why: "No source for flat against dome, or for a dome radius." },
    { feature: "Doors and cut-out reinforcement", why: "Door count and position need the cabin layout; the "
        + "reinforcement itself would be schematic." },
    { feature: "Shear ties and stringer clips", why: "Real, named members of a built-up panel (IAS Fig. 2-1), "
        + "but they are panel details below the scale of this view." },
    { feature: "Cargo floor and hold", why: "Present only once a cabin layout gives a hold; there is none yet." },
  ];
  if (!frames.drawn) notDrawn.unshift({ feature: "Frames", why: frames.why });

  const caveats = [
    "This is an arrangement, not an analysis. Nothing here is sized by a load: the frame and stringer pitches "
    + "are measured off real aircraft, not chosen to carry this aircraft's loads, and no skin thickness, frame "
    + "section or stringer section is computed.",
    "Every longitudinal station is anchored to the drawing's nose and tail-cone lengths, which are conventions. "
    + "The pitch between frames is sourced and the counts are computed, but frame 1 is where the drawing puts it.",
    frames.drawn && !frames.inBand
      ? `The frame pitch lands at ${(frames.pitchM / IN).toFixed(1)} in, outside the sourced `
        + `${(fp.loM / IN).toFixed(0)}-${(fp.hiM / IN).toFixed(0)} in band, because the count is rounded to fit `
        + "the shell length exactly. Treat the count as the sourced quantity, not the pitch."
      : null,
    pressure.applies && pressure.vent.capped
      ? `The 25.365(e)(2) opening is capped: the formula gives ${pressure.vent.uncappedFt2.toFixed(1)} ft^2 and `
        + "the rule says it need not exceed 20 ft^2, so 20 is used."
      : null,
    "The fuselage mass still comes from the mass model's own fuselage group. Nothing on this view feeds it back.",
  ].filter(Boolean);

  return {
    type, label: ga.label,
    shell: { lengthM: L, widthM: W, heightM: H, lengthSized, sectionSized: widthSized,
             crossSectionM2, crossSectionFt2: crossSectionM2 / M2_PER_FT2,
             perimeterM, equivDiaM, fineness: L / equivDiaM,
             noseLengthM: noseL, tailConeLengthM: tailL },
    frames, stringers, panel, heavy, pressure, floor, notDrawn, caveats,
    sources: {
      framePitch: fp.source, stringerPitch: sp.source, floor: FLOOR.source,
      heavyFrames: "FAA-H-8083-31B p. 1-8: \"The heaviest of these structural members are located at intervals "
                 + "to carry concentrated loads and at points where fittings are used to attach other units such "
                 + "as wings, powerplants, and stabilizers.\"",
      vent: "14 CFR 25.365(e)(2)",
      rule: "STRUCTURAL-LAYOUT.md section 4.5: draw computed lines and sourced conventions, and nothing else.",
    },
  };
}
