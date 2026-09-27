/* =====================================================================
   GENERAL ARRANGEMENT DRAWING — plan, side and front, to one scale
   =====================================================================
   The tool is built from airport-planning documents: Boeing D6-58325-6 and
   the Airbus AC series, which every dimension in the transport defaults is
   read out of. Those documents open with a general-arrangement three-view,
   dimensioned, to a stated scale, with a title block. This draws the sized
   aeroplane in that idiom, live, from geometry.js.

   Drawing conventions followed, because they carry meaning to the people
   who read them:
     - one scale for all three views, stated, with a scale bar;
     - orthographic alignment — the plan and side share the x axis, the side
       and front share the z axis, so a feature lines up across views;
     - centre lines chain-dashed (long-short-long), never solid;
     - extension lines standing off the object, dimension lines with
       arrowheads between them;
     - the ground line heavier than the airframe outline;
     - dimensions in metres with feet beneath, as the source documents give
       them.

   A dimension line is drawn ONLY against a quantity the sizing loop
   actually produced. geometry.js marks every value sized or drawn, and the
   conventional proportions — nose and tail-cone fineness, wing station,
   dihedral — carry no dimension and are listed in the title block as
   conventions so nobody reads them as results.
   ===================================================================== */

import { SC } from "../../lib/theme.js";
import { MONO, SANS } from "../../ui/tokens.js";
import {
  generalArrangement, val, leSweepRad,
  fuselageSideOutline, fuselagePlanOutline, outlinePath,
  surfacePanelPlan, trailingEdgeRun,
} from "./geometry.js";
import { tailThickness } from "../../engine/control-surfaces.js";
import { SURFACE_CONVENTIONS } from "./control-surfaces.js";
import { surfaceStations, TAIL_SURFACE_SPAN_IMPLIED } from "./control-surface-stations.js";

const FT = 0.3048;
const LOCATION_WORDS = {
  wing: "wing-mounted", "aft-fuselage": "on the rear fuselage",
  "wing+tail": "two on the wing, one in the tail", "fuselage-3": "three on the rear fuselage",
  nose: "tractor, on the nose",
};
const rad = (d) => (d * Math.PI) / 180;
const pts = (a) => a.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(" ");

/* Leading-edge sweep now lives in geometry.js, so that every view of the
   same wing draws the same leading edge. */
const leSweep = leSweepRad;

/* A straight-tapered half-surface in plan, from the root leading edge out to
   the tip, returned as a closed polygon for one side. */
function halfPlanform({ rootLE, root, tip, semi, sweepLE, side, y0 = 0 }) {
  const yTip = side * semi;
  const xTipLE = rootLE + Math.abs(semi - y0) * Math.tan(sweepLE);
  return [[rootLE, side * y0], [xTipLE, yTip], [xTipLE + tip, yTip], [rootLE + root, side * y0]];
}

/* An aerofoil-ish sliver: a surface seen edge-on, drawn with a rounded nose
   and a sharp trailing edge so a side view reads as a wing and not a bar. */
function sliver(x0, chord, z0, thick) {
  const t = Math.max(thick, chord * 0.02);
  return `M ${x0} ${z0} C ${x0 + chord * 0.12} ${z0 - t / 2} ${x0 + chord * 0.4} ${z0 - t / 2} ${x0 + chord} ${z0}`
       + ` C ${x0 + chord * 0.4} ${z0 + t / 2} ${x0 + chord * 0.12} ${z0 + t / 2} ${x0} ${z0} Z`;
}

export function GeneralArrangement({ result, height = 460, showTitleBlock = true }) {
  const g = generalArrangement(result);
  if (!g) return null;

  const L = val(g.fuselage.length), W = val(g.fuselage.width), H = val(g.fuselage.height);
  const noseL = val(g.fuselage.noseLength), tailL = val(g.fuselage.tailLength);
  const b = g.wing.span, semi = b / 2;
  const wingLE = val(g.wing.rootLE);
  const vtTop = H / 2 + g.vt.height;
  const zTop = vtTop, zBot = g.groundZ;

  /* Sheet layout, in metres. */
  const m = Math.max(L, b) * 0.045, gap = Math.max(L, b) * 0.055;
  const sheetW = m + L + gap + b + m;
  /* Each view carries a two-line label above it, so the band is reserved
     rather than borrowed from the margin — otherwise the first label clips. */
  const labelH = (sheetW / 1000) * 36;
  const planTop = m + labelH, planH = b;
  const sideTop = planTop + planH + gap + labelH, sideH = zTop - zBot;
  const frontLeft = m + L + gap;
  const titleH = showTitleBlock ? Math.max(L, b) * 0.14 : 0;
  const sheetH = sideTop + sideH + m + titleH;

  const pX = (x) => m + x, pY = (y) => planTop + planH / 2 - y;
  const sX = (x) => m + x, sZ = (z) => sideTop + (zTop - z);
  const fY = (y) => frontLeft + b / 2 + y, fZ = (z) => sZ(z);

  const u = sheetW / 1000;                              // one drawing unit, relative to the sheet
  const line = { stroke: SC.primary, strokeWidth: u * 1.7, fill: "none", strokeLinejoin: "round" };
  const thin = { stroke: SC.primary, strokeWidth: u * 1.0, fill: "none" };
  const fillS = { fill: SC.panel, fillOpacity: 0.55 };
  const centre = { stroke: SC.advisory, strokeWidth: u * 0.9, fill: "none",
                   strokeDasharray: `${u * 22} ${u * 6} ${u * 6} ${u * 6}`, opacity: 0.75 };
  const dim = { stroke: SC.subtle, strokeWidth: u * 0.9, fill: "none" };
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 11, letterSpacing: u * 0.2 };

  /* ── fuselage outlines ─────────────────────────────────────────────── */
  /* Both outlines come from geometry.js so that this drawing, the
     structural profile and the station diagram cannot disagree about the
     same body. They used to: this view closed its tail cone on
     +0.14H..+0.02H and the other two on +0.22H..+0.05H. */
  const planFus = outlinePath(
    fuselagePlanOutline({ length: L, width: W, noseLength: noseL, tailLength: tailL }), pX, pY);

  /* The side view carries the tail-cone upsweep: the underside rises
     further than the crown falls, which is what gives an airliner its
     profile and sets the rotation clearance. Both surfaces converge — an
     earlier comment here claimed the crown stayed level while the code
     dropped it by 36% of H, and the two disagreed for as long as the curve
     was written out by hand. The magnitudes are an unsourced drawing
     convention and are stated as one in geometry.js. */
  const sideFus = outlinePath(
    fuselageSideOutline({ length: L, height: H, noseLength: noseL, tailLength: tailL, closure: g.fuselage.closure }), sX, sZ);

  /* ── lifting surfaces ──────────────────────────────────────────────── */
  const wingSweepLE = leSweep(g.wing.sweepDeg, g.wing.area > 0 ? b * b / g.wing.area : 9, g.wing.taper);
  const wingHalves = [1, -1].map((s) => halfPlanform({
    rootLE: wingLE, root: g.wing.root, tip: g.wing.tip, semi, sweepLE: wingSweepLE, side: s, y0: W / 2 * 0.98 }));

  /* The taper is READ from the chords the planform is actually built from —
     geometry.js sets them per class — rather than restated as a literal
     here. It was a hardcoded 0.4 on both tails while the chords came from
     the class's own taper (0.3 on a jet, 0.45/0.5 on a trainer, 0.6/0.5 on
     a turboprop), so the leading edge this helper returned did not bound
     the planform drawn beside it. That is the same drift the sweep helper
     was hoisted to fix, one argument to the left of it. */
  const taperOf = (s) => (s.root > 0 ? s.tip / s.root : 1);

  const htSemi = g.ht.span / 2, htSweepLE = leSweep(val(g.ht.sweepDeg), g.ht.span ** 2 / Math.max(g.ht.area, 1e-6), taperOf(g.ht));
  const htHalves = [1, -1].map((s) => halfPlanform({
    rootLE: g.ht.rootLE, root: g.ht.root, tip: g.ht.tip, semi: htSemi, sweepLE: htSweepLE, side: s,
    y0: g.tTail ? 0 : W / 2 * 0.6 }));

  const vtSweepLE = leSweep(val(g.vt.sweepDeg), g.vt.height ** 2 / Math.max(g.vt.area, 1e-6), taperOf(g.vt));
  const vtProfile = [
    [sX(g.vt.rootLE), sZ(H / 2)],
    [sX(g.vt.rootLE + g.vt.height * Math.tan(vtSweepLE)), sZ(vtTop)],
    [sX(g.vt.rootLE + g.vt.height * Math.tan(vtSweepLE) + g.vt.tip), sZ(vtTop)],
    [sX(g.vt.rootLE + g.vt.root), sZ(H / 2)],
  ];

  const dih = rad(val(g.wing.dihedralDeg));

  /* ── control surfaces ──────────────────────────────────────────────────
     The drawing had none at all, because control-surfaces.js deliberately
     holds no spanwise geometry: no airport-planning manual publishes any.
     NASA CR-2144 does, on a scaled three-view, so the B-747's stations are
     MEASURED and every other class falls back to a labelled convention.
     See control-surface-stations.js.

     WHAT GETS DRAWN AND WHAT DOES NOT follows the same rule as the rest of
     this sheet. An aileron is drawn as a PANEL, because its chord ratio is
     sourced as well as its station. A flap and a spoiler have a measured
     SPAN and no sourced chord anywhere in the corpus, so they are drawn as
     the RUN they occupy along the trailing edge and no deeper — inventing a
     depth for them would be exactly the plausible-line-with-no-provenance
     this drawing refuses elsewhere. */
  const stations = surfaceStations(g.type);
  const wingGeom = { rootLE: wingLE, root: g.wing.root, tip: g.wing.tip, semi,
                     sweepLE: wingSweepLE, y0: W / 2 * 0.98 };
  const htGeom = { rootLE: g.ht.rootLE, root: g.ht.root, tip: g.ht.tip, semi: htSemi,
                   sweepLE: htSweepLE, y0: g.tTail ? 0 : W / 2 * 0.6 };
  const ailC = SURFACE_CONVENTIONS.aileron.chordRatio;
  const elevC = SURFACE_CONVENTIONS.elevator.chordRatio;
  const rudC = SURFACE_CONVENTIONS.rudder.chordRatio;
  const surf = { fill: SC.primary, fillOpacity: 0.26, stroke: SC.primary, strokeWidth: u * 1.2 };
  const runLine = { stroke: SC.advisory, strokeWidth: u * 3.2, strokeLinecap: "butt", opacity: 0.95 };
  const spoilLine = { stroke: SC.caution, strokeWidth: u * 2.2, strokeLinecap: "butt", opacity: 0.85 };

  /* The rudder, in the SIDE view, is the aft fraction of the fin's local
     chord over its full height. The fin is drawn there as a trapezoid, so
     the rudder is built from the same four corners rather than from a
     second idea of where the fin is. */
  const vtTipLE = g.vt.rootLE + g.vt.height * Math.tan(vtSweepLE);
  const rudderProfile = [
    [sX(g.vt.rootLE + g.vt.root - rudC * g.vt.root), sZ(H / 2)],
    [sX(g.vt.rootLE + g.vt.root), sZ(H / 2)],
    [sX(vtTipLE + g.vt.tip), sZ(vtTop)],
    [sX(vtTipLE + g.vt.tip - rudC * g.vt.tip), sZ(vtTop)],
  ];

  /* Tail section thickness, computed off the wing's per Scholz ch.9 and
     clamped to his published 9–12% band — the SAME sourced relation the
     engine already uses (engine/control-surfaces.js, TAIL_TC_WING_FRACTION).
     This drawing carried four different unsourced literals for it instead:
     0.13 for the tailplane in side view against 0.09 for the same tailplane
     in front view, and 0.11 / 0.055 / 0.06 for the fin. */
  const tailTC = tailThickness(g.wing.tc);

  /* One wing height for both views — see geometry.js. The side view used
     −0.18H and the front view −0.16H. */
  const wingZ = val(g.wing.z);

  /* ── dimension helper: extension lines, arrows, metric over imperial ── */
  const Dim = ({ x1, y1, x2, y2, label, off = 0, vertical = false, tick = u * 7 }) => {
    const a = u * 5;
    const head = (x, y, dir) => vertical
      ? `${x},${y} ${x - a * 0.45},${y + dir * a} ${x + a * 0.45},${y + dir * a}`
      : `${x},${y} ${x + dir * a},${y - a * 0.45} ${x + dir * a},${y + a * 0.45}`;
    return (
      <g>
        <line x1={vertical ? x1 - tick : x1} y1={vertical ? y1 : y1 - tick}
              x2={vertical ? x1 + tick * 0.3 : x1} y2={vertical ? y1 : y1 + tick * 0.3} {...dim} opacity={0.6} />
        <line x1={vertical ? x2 - tick : x2} y1={vertical ? y2 : y2 - tick}
              x2={vertical ? x2 + tick * 0.3 : x2} y2={vertical ? y2 : y2 + tick * 0.3} {...dim} opacity={0.6} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} {...dim} />
        <polygon points={head(x1, y1, 1)} fill={SC.subtle} />
        <polygon points={head(x2, y2, -1)} fill={SC.subtle} />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - (vertical ? 0 : u * 6)} {...txt}
              textAnchor="middle" transform={vertical ? `rotate(-90 ${(x1 + x2) / 2} ${(y1 + y2) / 2})` : undefined}>
          {label}
        </text>
      </g>
    );
  };
  const both = (metres) => `${metres.toFixed(2)} m  ·  ${(metres / FT).toFixed(1)} ft`;

  const viewLabel = (x, y, n, t) => (
    <g>
      <text x={x} y={y - u * 13} {...txt} fill={SC.primary} fontSize={u * 15}
            letterSpacing={u * 1.8} fontWeight={600}>{n}</text>
      <text x={x} y={y} {...txt} fill={SC.muted} fontSize={u * 10.5}>{t}</text>
      <line x1={x} y1={y + u * 5} x2={x + u * 120} y2={y + u * 5}
            stroke={SC.border} strokeWidth={u * 1.1} />
    </g>
  );

  return (
    <svg viewBox={`0 0 ${sheetW} ${sheetH}`} preserveAspectRatio="xMidYMid meet"
         style={{ width: "100%", height: "auto", maxHeight: height, display: "block" }} role="img"
         aria-label={`General arrangement: span ${b.toFixed(1)} m, length ${L.toFixed(1)} m, `
                   + `${g.engines} engine${g.engines === 1 ? "" : "s"}`}>
      {/* ── PLAN ──────────────────────────────────────────────────────── */}
      <g>
        <line x1={pX(-m * 0.4)} y1={pY(0)} x2={pX(L + m * 0.4)} y2={pY(0)} {...centre} />
        {wingHalves.map((h, i) => (
          <polygon key={`w${i}`} points={pts(h.map(([x, y]) => [pX(x), pY(y)]))} {...fillS} {...line} />
        ))}
        {htHalves.map((h, i) => (
          <polygon key={`h${i}`} points={pts(h.map(([x, y]) => [pX(x), pY(y)]))} {...fillS} {...line} />
        ))}
        {/* control surfaces, both wings, from the measured or conventional
            stations — panels where the chord is sourced, runs where it is not */}
        {[1, -1].map((s) => (
          <g key={`cs${s}`}>
            {stations && stations.aileron.map(([e0, e1], i) => (
              <polygon key={`ail${i}`} {...surf}
                points={pts(surfacePanelPlan({ ...wingGeom, side: s, eta0: e0, eta1: e1, chordFrac: ailC })
                  .map(([x, y]) => [pX(x), pY(y)]))} />
            ))}
            {(stations?.flap ?? []).map(([e0, e1], i) => {
              const r = trailingEdgeRun({ ...wingGeom, side: s, eta0: e0, eta1: e1 });
              return <line key={`fl${i}`} x1={pX(r[0][0])} y1={pY(r[0][1])}
                           x2={pX(r[1][0])} y2={pY(r[1][1])} {...runLine} />;
            })}
            {(stations?.spoiler ?? []).map(([e0, e1], i) => {
              const r = trailingEdgeRun({ ...wingGeom, side: s, eta0: e0, eta1: e1 });
              return <line key={`sp${i}`} x1={pX(r[0][0])} y1={pY(r[0][1])}
                           x2={pX(r[1][0])} y2={pY(r[1][1])} {...spoilLine} />;
            })}
            {/* the elevator spans the tailplane at its sourced chord ratio —
                see TAIL_SURFACE_SPAN_IMPLIED for why full span and not the
                area convention's */}
            <polygon key={`elev${s}`} {...surf}
              points={pts(surfacePanelPlan({ ...htGeom, side: s, eta0: htGeom.y0 / htSemi, eta1: 1,
                                             chordFrac: elevC }).map(([x, y]) => [pX(x), pY(y)]))} />
          </g>
        ))}
        <path d={planFus} {...fillS} {...line} />
        {/* the fin, seen from above, is a narrow sliver on the centreline */}
        <path d={sliver(pX(g.vt.rootLE), g.vt.root, pY(0), g.vt.root * tailTC)} {...fillS} {...thin} />
        {g.nacelles.filter((n) => n.kind === "pod").map((n, i) => (
          <g key={`np${i}`}>
            <rect x={pX(n.x)} y={pY(n.y + n.d / 2)} width={n.l} height={n.d} rx={n.d * 0.42}
                  {...fillS} stroke={SC.caution} strokeWidth={u * 1.3} />
          </g>
        ))}
        {g.nacelles.filter((n) => n.kind === "centre").map((n, i) => (
          <rect key={`nc${i}`} x={pX(n.x)} y={pY(n.d / 2)} width={n.l} height={n.d} rx={n.d * 0.42}
                {...fillS} stroke={SC.caution} strokeWidth={u * 1.3} />
        ))}
        {/* propeller discs are edge-on in plan: a line of one diameter */}
        {g.props.map((p, i) => (
          <line key={`pp${i}`} x1={pX(p.x)} y1={pY(p.y - p.d / 2)} x2={pX(p.x)} y2={pY(p.y + p.d / 2)}
                stroke={SC.caution} strokeWidth={u * 1.2} opacity={0.85} />
        ))}
        <Dim x1={pX(0)} y1={pY(0) + planH / 2 + u * 16} x2={pX(L)} y2={pY(0) + planH / 2 + u * 16}
             label={`length  ${both(L)}`} />
        <Dim x1={pX(L) + u * 26} y1={pY(semi)} x2={pX(L) + u * 26} y2={pY(-semi)} vertical
             label={`span  ${both(b)}`} />
        {/* The outboard aileron carries a span dimension ONLY where its
            station was measured off a drawing. On a class that falls back
            to Howe's table the surface is still drawn, because a labelled
            convention may be drawn, but it carries no dimension — the same
            rule the nose fineness and the wing station already obey. */}
        {stations?.measured && (() => {
          const [e0, e1] = stations.aileron[stations.aileron.length - 1];
          return (
            <Dim x1={pX(L) + u * 52} y1={pY(e1 * semi)} x2={pX(L) + u * 52} y2={pY(e0 * semi)} vertical
                 label={`outboard aileron  ${both((e1 - e0) * semi)}`} />
          );
        })()}
        {viewLabel(pX(0), planTop - u * 8, "PLAN", `wing ${g.wing.area.toFixed(1)} m²  ·  sweep ${g.wing.sweepDeg.toFixed(1)}° at c/4`)}
      </g>

      {/* ── SIDE ──────────────────────────────────────────────────────── */}
      <g>
        <line x1={sX(-m * 0.4)} y1={sZ(0)} x2={sX(L + m * 0.4)} y2={sZ(0)} {...centre} />
        <polygon points={pts(vtProfile)} {...fillS} {...line} />
        <polygon points={pts(rudderProfile)} {...surf} />
        <path d={sideFus} {...fillS} {...line} />
        <path d={sliver(sX(wingLE), g.wing.root, sZ(wingZ), g.wing.root * g.wing.tc)}
              {...fillS} stroke={SC.primary} strokeWidth={u * 1.3} />
        <path d={sliver(sX(g.ht.rootLE), g.ht.root, sZ(g.ht.z), g.ht.root * tailTC)}
              fill={SC.inset} fillOpacity={0.9} stroke={SC.primary} strokeWidth={u * 1.6} />
        {g.nacelles.map((n, i) => (
          <rect key={`sn${i}`} x={sX(n.x)} y={sZ(n.z + n.d / 2)} width={n.l} height={n.d} rx={n.d * 0.42}
                {...fillS} stroke={SC.caution} strokeWidth={u * 1.3} />
        ))}
        {g.props.map((p, i) => (
          <line key={`sp${i}`} x1={sX(p.x)} y1={sZ(p.z - p.d / 2)} x2={sX(p.x)} y2={sZ(p.z + p.d / 2)}
                stroke={SC.caution} strokeWidth={u * 1.2} opacity={0.85} />
        ))}
        <line x1={sX(-m * 0.5)} y1={sZ(zBot)} x2={sX(L + m * 0.5)} y2={sZ(zBot)}
              stroke={SC.muted} strokeWidth={u * 2.4} />
        {/* OVERALL HEIGHT is measured to the GROUND LINE, so it is only as
            good as the stance — and the stance is not sized, it is a
            construction resting on the wing station, which this drawing
            lists as a convention. So the dimension is drawn only where
            the ground line has a published range to sit inside, and the
            title block names the source. Everywhere else it is omitted,
            which is the same rule the nose fineness and the wing station
            already obey. Before this the height was dimensioned on every
            class while the title block said "dimensioned features are
            sized", which was not true of any of them. */}
        {g.stance.zProvenance.sourced && (
          <Dim x1={sX(-u * 30)} y1={sZ(vtTop)} x2={sX(-u * 30)} y2={sZ(zBot)} vertical
               label={`height  ${both(vtTop - zBot)}`} />
        )}
        {viewLabel(sX(0), sideTop - u * 8, "SIDE", `fin ${g.vt.area.toFixed(1)} m²  ·  tailplane ${g.ht.area.toFixed(1)} m²`)}
      </g>

      {/* ── FRONT ─────────────────────────────────────────────────────── */}
      <g>
        <line x1={fY(0)} y1={sZ(zTop + m * 0.2)} x2={fY(0)} y2={sZ(zBot - m * 0.2)} {...centre} />
        {[1, -1].map((s) => (
          <polygon key={`fw${s}`} {...fillS} {...line}
            points={pts([[fY(s * W * 0.45), fZ(wingZ)],
                         [fY(s * semi), fZ(wingZ + semi * Math.tan(dih))],
                         [fY(s * semi), fZ(wingZ + semi * Math.tan(dih) - g.wing.tip * g.wing.tc)],
                         [fY(s * W * 0.45), fZ(wingZ - g.wing.root * g.wing.tc)]])} />
        ))}
        <polygon key="fht" {...fillS} {...line}
          points={pts([[fY(-g.ht.span / 2), fZ(g.ht.z)], [fY(g.ht.span / 2), fZ(g.ht.z)],
                       [fY(g.ht.span / 2), fZ(g.ht.z - g.ht.root * tailTC)], [fY(-g.ht.span / 2), fZ(g.ht.z - g.ht.root * tailTC)]])} />
        {/* The fin seen head-on is a section half-width either side of the
            centreline, so it is tailTC/2 — the same thickness the plan view
            draws it at, not a second number. */}
        <polygon key="fvt" {...fillS} {...line}
          points={pts([[fY(-g.vt.root * tailTC / 2), fZ(H / 2)], [fY(-g.vt.tip * tailTC / 2), fZ(vtTop)],
                       [fY(g.vt.tip * tailTC / 2), fZ(vtTop)], [fY(g.vt.root * tailTC / 2), fZ(H / 2)]])} />
        <ellipse cx={fY(0)} cy={fZ(0)} rx={W / 2} ry={H / 2} {...fillS} {...line} />
        {g.nacelles.filter((n) => n.kind !== "nose").map((n, i) => (
          <ellipse key={`fn${i}`} cx={fY(n.y)} cy={fZ(n.z + (n.kind === "pod" && n.eta ? n.eta * semi * Math.tan(dih) : 0))}
                   rx={n.d / 2} ry={n.d / 2} {...fillS} stroke={SC.caution} strokeWidth={u * 1.3} />
        ))}
        {g.props.map((p, i) => (
          <circle key={`fp${i}`} cx={fY(p.y)} cy={fZ(p.z + (p.y ? Math.abs(p.y) * Math.tan(dih) : 0))} r={p.d / 2}
                  fill="none" stroke={SC.caution} strokeWidth={u * 1.0} opacity={0.5} strokeDasharray={`${u * 5} ${u * 4}`} />
        ))}
        <line x1={fY(-b / 2 - m * 0.3)} y1={fZ(zBot)} x2={fY(b / 2 + m * 0.3)} y2={fZ(zBot)}
              stroke={SC.muted} strokeWidth={u * 2.4} />
        {viewLabel(fY(-b / 2), sideTop - u * 8, "FRONT", `${g.engines} engine${g.engines === 1 ? "" : "s"}, ${LOCATION_WORDS[g.engineLocation] || g.engineLocation}`)}
      </g>

      {/* ── title block ───────────────────────────────────────────────── */}
      {showTitleBlock && (() => {
        const tY = sideTop + sideH + m * 0.55, tH = titleH * 0.72, tW = sheetW - 2 * m;
        const cols = [0.30, 0.22, 0.24, 0.24];
        const cells = [
          ["designation", g.label],
          ["wing area · aspect ratio", `${g.wing.area.toFixed(1)} m²  ·  ${(b * b / g.wing.area).toFixed(2)}`],
          ["span · length", `${b.toFixed(2)} m  ·  ${L.toFixed(2)} m`],
          /* NOT a scale ratio. This sheet renders at width:100%, so its
             printed size is whatever the container is and "1 : N on a
             280 mm sheet" asserted a number no reader could ever measure.
             What IS true, and what the idiom actually buys the reader, is
             that the three views share one scale and can be compared. */
          ["drawn to", "one scale, all three views"],
        ];
        let x = m;
        return (
          <g>
            <rect x={m} y={tY} width={tW} height={tH} fill="none" stroke={SC.border} strokeWidth={u * 1.4} />
            {cells.map(([k, v], i) => {
              const w = tW * cols[i], cx = x; x += w;
              return (
                <g key={k}>
                  {i > 0 && <line x1={cx} y1={tY} x2={cx} y2={tY + tH} stroke={SC.border} strokeWidth={u * 1.1} />}
                  <text x={cx + u * 12} y={tY + tH * 0.40} {...txt} fontSize={u * 10} fill={SC.muted}>{k}</text>
                  <text x={cx + u * 12} y={tY + tH * 0.80} {...txt} fontSize={u * 14} fill={SC.primary}>{v}</text>
                </g>
              );
            })}
            <text x={m} y={tY + tH + u * 22} {...txt} fontSize={u * 9.5} fill={SC.subtle} opacity={0.75}>
              Dimensioned features are sized. Tail section thickness {(tailTC * 100).toFixed(1)} % is computed off the
              wing (Scholz ch.9). Tail-cone closure: {g.fuselage.closure.measured
                ? `keel ${g.fuselage.closure.keelTipZ.toFixed(3)} H above the centreline, measured from ${g.fuselage.closure.aircraft.join(" and ")} airport-planning drawings`
                  + (g.fuselage.closure.crownMeasured ? `; crown ${g.fuselage.closure.crownTipZ.toFixed(3)} H measured` : `; crown ${g.fuselage.closure.crownTipZ} H is a convention (the fin hides it)`)
                : `a drawing convention (no dimensioned side view of this class is on disk; its keel value sits below every measured aircraft)`}.
              Control surfaces: {stations
                ? (stations.measured
                    ? `aileron, flap, spoiler and nacelle stations measured off ${stations.drawing}, `
                      + `both wings, ±${stations.etaUncertainty} of semispan`
                    : `aileron station is a convention (${stations.row.label}, Howe 2000 Table 8.2 via Coene 2008 — `
                      + `third-hand), so it is drawn but not dimensioned; no flap or spoiler station is sourced for this class`)
                : "no station is sourced for this class, so none is drawn"}.
              Flaps and spoilers are drawn as the run they occupy along the trailing edge and no deeper, because their
              span is measured and their chord is not sourced anywhere. Elevator and rudder are drawn full span at their
              sourced chord ratios ({(elevC * 100).toFixed(0)} % and {(rudC * 100).toFixed(0)} % of local chord), which
              makes them {(elevC * 100).toFixed(0)} % and {(rudC * 100).toFixed(0)} % of the surfaces they sit on —
              not the {(TAIL_SURFACE_SPAN_IMPLIED.elevator.areaFraction * 100).toFixed(0)} % and
              {" "}{(TAIL_SURFACE_SPAN_IMPLIED.rudder.areaFraction * 100).toFixed(0)} % the separate area convention
              states, because the two conventions come from different samples and together imply a surface
              {" "}{TAIL_SURFACE_SPAN_IMPLIED.elevator.impliedSpanFraction.toFixed(2)}× and
              {" "}{TAIL_SURFACE_SPAN_IMPLIED.rudder.impliedSpanFraction.toFixed(2)}× longer than its parent.
              Nose and tail-cone fineness, wing station longitudinal and vertical, dihedral, tail
              sweep and the tailplane and fin root stations are drawing conventions, not results, and carry no dimension.
              {g.stance.zProvenance.sourced
                ? ` Overall height is measured to the ground line, which is not sized either: it is the wing station
                    less the oleo length less the tyre static loaded radius, and it is dimensioned here only because
                    that construction is ${g.stance.zProvenance.cite}.`
                : " The ground line is a construction on the wing station and has no published range for this class, so"
                  + " overall height carries no dimension."}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
