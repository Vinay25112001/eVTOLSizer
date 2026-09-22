/* =====================================================================
   STRUCTURE VIEWS — the load path, drawn
   =====================================================================
   Four drawings over the wing-box analysis (wing-structure.js):

     ShearMomentDiagram   the running load, shear force and bending moment
                          against span, stacked and sharing an x axis, as a
                          structures report would set them
     StressMarginPlot     cap stress against the two 25.305 allowables, and
                          where minimum gauge takes over from strength
     BoxSection           the box at a chosen station, to scale, with the
                          cap, web and skin thicknesses called out
     StructuralPlanform   the wing in plan with its front and rear spars,
                          every rib, and the stringer run - the spar and rib
                          views, on one drawing, because they are the same
                          drawing

   Every dimension here comes from the analysis. Where a position is a
   convention rather than a computed quantity - the spar percent-chord for
   the classes where nobody publishes it - the drawing says so on its face
   rather than letting the reader assume it was sized.
   ===================================================================== */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
         ReferenceLine, Area, ComposedChart } from "recharts";
import { SC } from "../../lib/theme.js";
import { grid, axis, tooltip, legend } from "../../ui/chart.js";
import { T, MONO } from "../../ui/tokens.js";
import { leSweepRad } from "./geometry.js";

const r3 = (v) => (Number.isFinite(v) ? +v.toPrecision(4) : null);
const topLegend = () => ({ ...legend(), verticalAlign: "top", align: "right", height: 36,
                           wrapperStyle: { ...(legend().wrapperStyle || {}), paddingBottom: 4 } });
const xT = (t) => ({ value: t, position: "insideBottom", offset: -4, fill: SC.muted, fontSize: 11 });
const yT = (t) => ({ value: t, angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11, style: { textAnchor: "middle" } });

/* ── running load, shear and bending moment ───────────────────────────── */
export function ShearMomentDiagram({ box, height = 200 }) {
  if (!box) return null;
  const data = box.stations.map((s) => ({
    y: r3(s.yM),
    load: r3(s.loadNm / 1e3),          // kN/m
    lift: r3(s.liftNm / 1e3),
    relief: r3(s.reliefNm / 1e3),
    shear: r3(s.shearN / 1e3),         // kN
    moment: r3(s.momentNm / 1e6),      // MN.m
    torsion: r3(s.torsionNm / 1e3),    // kN.m
  }));
  const panel = (key, colour, label, unit, extra = []) => (
    <div style={{ marginBottom: 6 }}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 18 }}>
          <CartesianGrid {...grid()} />
          <XAxis dataKey="y" {...axis()} label={xT("spanwise station y (m)")}
                 interval="preserveStartEnd" minTickGap={44}
                 tickFormatter={(v) => v.toFixed(1)} />
          <YAxis {...axis()} label={yT(`${label} (${unit})`)} width={74} />
          <Tooltip {...tooltip()} />
          <Legend {...topLegend()} />
          <ReferenceLine y={0} stroke={SC.dim} />
          {extra}
          <Line type="monotone" dataKey={key} name={label} stroke={colour} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
  return (
    <div>
      {panel("load", SC.advisory, "net running load", "kN/m", [
        <Line key="lift" type="monotone" dataKey="lift" name="lift (Schrenk)" stroke={SC.nominal} strokeWidth={1}
              strokeDasharray="4 3" dot={false} isAnimationActive={false} />,
        <Line key="relief" type="monotone" dataKey="relief" name="inertia relief" stroke={SC.caution} strokeWidth={1}
              strokeDasharray="4 3" dot={false} isAnimationActive={false} />,
      ])}
      {panel("shear", SC.primary, "shear force V", "kN")}
      {panel("moment", SC.warning, "bending moment M", "MN·m")}
      {panel("torsion", SC.purple, "torsion T", "kN·m")}
    </div>
  );
}

/* ── cap stress against the two allowables ────────────────────────────── */
export function StressMarginPlot({ box, height = 260 }) {
  if (!box) return null;
  const m = box.material;
  const data = box.stations.map((s) => ({
    y: r3(s.yM),
    ult: r3(s.sigmaUltPa / 1e6),
    lim: r3(s.sigmaLimitPa / 1e6),
    strain: r3(s.strainUlt * 1e6),
    gauge: s.gaugeGoverns ? r3(s.sigmaUltPa / 1e6) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 18 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="y" {...axis()} label={xT("spanwise station y (m)")}
                 interval="preserveStartEnd" minTickGap={44}
                 tickFormatter={(v) => v.toFixed(1)} />
        <YAxis {...axis()} label={yT("cap stress (MPa)")} width={74} />
        <Tooltip {...tooltip()} />
        <Legend {...topLegend()} />
        <ReferenceLine y={m.ftu / 1e6} stroke={SC.warning} strokeDasharray="6 4"
          label={{ value: `Ftu ${(m.ftu / 1e6).toFixed(0)} — ultimate, 25.305(b)`, fill: SC.warning, fontSize: 10, position: "insideTopRight" }} />
        <ReferenceLine y={m.fcy / 1e6} stroke={SC.caution} strokeDasharray="6 4"
          label={{ value: `Fcy ${(m.fcy / 1e6).toFixed(0)} — limit, 25.305(a)`, fill: SC.caution, fontSize: 10, position: "insideBottomRight" }} />
        <Line type="monotone" dataKey="ult" name="at ultimate load" stroke={SC.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="lim" name="at limit load" stroke={SC.advisory} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="gauge" name="minimum gauge governs" stroke={SC.nominal} strokeWidth={4} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ── the box at one station, to scale ─────────────────────────────────── */
export function BoxSection({ box, stationIndex = 0, height = 210 }) {
  if (!box) return null;
  const s = box.stations[Math.min(stationIndex, box.stations.length - 1)];
  const w = s.boxWidthM, h = s.boxDepthM;
  const tc = Math.max(s.capThickM, w / 400), tw = Math.max(s.webThickM, w / 500);
  const pad = w * 0.26, W = w + 2 * pad, H = h + 2 * pad * (h / w) + w * 0.12;
  const x0 = pad, y0 = pad * (h / w);
  const u = W / 800;
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 13 };
  const dimc = { stroke: SC.subtle, strokeWidth: u * 0.9, fill: "none" };
  const mm = (v) => `${(v * 1e3).toFixed(1)} mm`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} role="img"
         aria-label={`Wing box section at y = ${s.yM.toFixed(1)} m`}>
      {/* aerofoil thickness envelope, for context */}
      <rect x={x0 - w * 0.10} y={y0} width={w * 1.20} height={h} rx={h * 0.28}
            fill="none" stroke={SC.dim} strokeWidth={u * 0.9} strokeDasharray={`${u * 5} ${u * 4}`} />
      {/* skin/covers */}
      <rect x={x0} y={y0} width={w} height={tc} fill={SC.advisory} fillOpacity={0.55} stroke={SC.primary} strokeWidth={u} />
      <rect x={x0} y={y0 + h - tc} width={w} height={tc} fill={SC.advisory} fillOpacity={0.55} stroke={SC.primary} strokeWidth={u} />
      {/* webs */}
      <rect x={x0} y={y0} width={tw} height={h} fill={SC.caution} fillOpacity={0.5} stroke={SC.primary} strokeWidth={u} />
      <rect x={x0 + w - tw} y={y0} width={tw} height={h} fill={SC.caution} fillOpacity={0.5} stroke={SC.primary} strokeWidth={u} />
      {/* dimensions */}
      <line x1={x0} y1={y0 + h + pad * 0.42} x2={x0 + w} y2={y0 + h + pad * 0.42} {...dimc} />
      <text x={x0 + w / 2} y={y0 + h + pad * 0.42 - u * 5} {...txt} textAnchor="middle">
        box width {w.toFixed(2)} m ({(box.geometry.boxWidthRatio * 100).toFixed(0)} % chord)
      </text>
      <line x1={x0 - pad * 0.45} y1={y0} x2={x0 - pad * 0.45} y2={y0 + h} {...dimc} />
      <text x={x0 - pad * 0.45} y={y0 + h / 2} {...txt} textAnchor="middle"
            transform={`rotate(-90 ${x0 - pad * 0.45} ${y0 + h / 2})`}>depth {h.toFixed(2)} m</text>
      <text x={x0 + w + u * 8} y={y0 + tc * 0.5 + u * 4} {...txt} fill={SC.primary}>cover {mm(s.capThickM)}</text>
      <text x={x0 + w + u * 8} y={y0 + h * 0.55} {...txt} fill={SC.caution}>web {mm(s.webThickM)}</text>
      <text x={x0} y={H - u * 4} {...txt}>
        y = {s.yM.toFixed(1)} m · σ {(s.sigmaUltPa / 1e6).toFixed(0)} MPa at ultimate · {(s.strainUlt * 1e6).toFixed(0)} µε · {s.governedBy}
      </text>
    </svg>
  );
}

/* ── spars, ribs and stringers in plan ────────────────────────────────── */
export function StructuralPlanform({ box, height = 300 }) {
  if (!box) return null;
  const g = box.geometry, L = box.layout;
  const semi = g.semiSpanM, cr = g.rootChordM, taper = g.taper;
  const ct = cr * taper;
  /* The inputs carry QUARTER-CHORD sweep. This line used to be
     `Math.atan(Math.tan(sweepDeg))`, which is a no-op, so the planform drew
     the 737's leading edge at 25.0° while the general arrangement — which
     did convert — drew the same wing at 28.6°. One helper now, for both. */
  const sweepLE = leSweepRad(g.sweepDeg ?? 0, (semi * 2) ** 2 / Math.max(g.areaM2, 1e-9), taper);
  const chordAt = (e) => cr * (1 - (1 - taper) * e);
  const leAt = (e) => e * semi * Math.tan(sweepLE);
  const W = semi * 1.10, H = (cr + semi * Math.tan(sweepLE)) * 1.24;
  const u = W / 900;
  const X = (y) => y + semi * 0.05, Y = (x) => x + cr * 0.12;
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 13 };

  const ribs = [];
  for (let i = 0; i <= L.ribCount; i++) {
    const e = i / L.ribCount, c = chordAt(e), le = leAt(e);
    ribs.push({ y: e * semi, x1: le + g.sparFront * c, x2: le + g.sparRear * c });
  }
  const strings = [];
  for (let k = 1; k < L.stringerCount; k++) {
    const f = k / L.stringerCount;
    strings.push([0, 1].map((e) => {
      const c = chordAt(e), le = leAt(e);
      return [X(e * semi), Y(le + (g.sparFront + (g.sparRear - g.sparFront) * f) * c)];
    }));
  }
  const edge = (frac) => [0, 1].map((e) => {
    const c = chordAt(e), le = leAt(e);
    return `${X(e * semi).toFixed(3)},${Y(le + frac * c).toFixed(3)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} role="img"
         aria-label={`Wing structural planform: ${L.ribCount} ribs, ${L.stringerCount} stringers`}>
      {/* wing outline */}
      <polygon fill={SC.panel} fillOpacity={0.45} stroke={SC.dim} strokeWidth={u * 1.2}
        points={`${X(0)},${Y(0)} ${X(semi)},${Y(leAt(1))} ${X(semi)},${Y(leAt(1) + ct)} ${X(0)},${Y(cr)}`} />
      {/* stringers, drawn faint and behind the spars */}
      {strings.map((pp, i) => (
        <line key={`st${i}`} x1={pp[0][0]} y1={pp[0][1]} x2={pp[1][0]} y2={pp[1][1]}
              stroke={SC.advisory} strokeWidth={u * 0.5} opacity={0.42} />
      ))}
      {/* ribs */}
      {ribs.map((r, i) => (
        <line key={`rb${i}`} x1={X(r.y)} y1={Y(r.x1)} x2={X(r.y)} y2={Y(r.x2)}
              stroke={SC.primary} strokeWidth={u * 0.9} opacity={0.72} />
      ))}
      {/* spars, heaviest */}
      <polyline points={edge(g.sparFront)} fill="none" stroke={SC.caution} strokeWidth={u * 2.4} />
      <polyline points={edge(g.sparRear)} fill="none" stroke={SC.caution} strokeWidth={u * 2.4} />
      <text x={X(semi * 0.42)} y={Y(leAt(0.42) + g.sparFront * chordAt(0.42)) - u * 6} {...txt} fill={SC.caution}>
        front spar {(g.sparFront * 100).toFixed(0)} % chord
      </text>
      <text x={X(semi * 0.42)} y={Y(leAt(0.42) + g.sparRear * chordAt(0.42)) + u * 16} {...txt} fill={SC.caution}>
        rear spar {(g.sparRear * 100).toFixed(0)} % chord
      </text>
      <text x={X(0)} y={H - u * 20} {...txt}>
        {L.ribCount} ribs at {(L.ribPitchM * 1e3).toFixed(0)} mm · {L.stringerCount} stringers at {(L.stringerPitchM * 1e3).toFixed(0)} mm
      </text>
      <text x={X(0)} y={H - u * 5} {...txt} fill={SC.dim} fontSize={u * 11}>
        {L.source}{g.sparsSourced ? "" : ` · spar positions: ${g.sparSource}`}
      </text>
    </svg>
  );
}
