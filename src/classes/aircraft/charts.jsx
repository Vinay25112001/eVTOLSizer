/* =====================================================================
   AIRCRAFT STUDIO FIGURES
   =====================================================================
   Recharts figures for the aircraft studio, drawn with the app's shared
   chart defaults (ui/chart.js) so both modes look like one tool. Every
   figure takes plain data from the aircraft engine; none computes physics.
   ===================================================================== */
import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
         ReferenceLine, ReferenceDot, ReferenceArea, ScatterChart, Scatter, ZAxis, BarChart, Bar, Cell,
         ComposedChart, Area } from "recharts";
import { SC } from "../../lib/theme.js";
import { grid, axis, tooltip, legend } from "../../ui/chart.js";
import { T, MONO } from "../../ui/tokens.js";

const palette = () => [SC.advisory, SC.caution, SC.purple, SC.nominal, SC.orange, SC.warning];
const r3 = (v) => (Number.isFinite(v) ? +v.toPrecision(4) : null);
const topLegend = () => ({ ...legend(), verticalAlign: "top", align: "right", height: 40, wrapperStyle: { ...(legend().wrapperStyle || {}), paddingBottom: 6 } });
const xTitle = (value) => ({ value, position: "insideBottom", offset: -14, fill: SC.muted, fontSize: T.micro });
const yTitle = (value) => ({ value, angle: -90, position: "insideLeft", offset: 4, fill: SC.muted, fontSize: T.micro, style: { textAnchor: "middle" } });

/* Round axis limits and ticks, as a drawing office would draw them. */
export function niceTicks(lo, hi, n = 6) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const t = [];
  for (let v = a; v <= b + step / 2; v += step) t.push(+v.toPrecision(10));
  return { domain: [a, b], ticks: t };
}

/* Constraint (matching) chart: curves are [[x, y], ...] on a shared x grid. */
export function ConstraintChart({ diagram, height = 380 }) {
  const { data, xAxis, yAxis } = useMemo(() => {
    const xs = diagram.curves[0].points.map((p) => p[0]);
    const rows = xs.map((x, i) => {
      const row = { x: r3(x) };
      let env = 0;
      diagram.curves.forEach((c, j) => { const y = c.points[i]?.[1]; row[`c${j}`] = r3(y); if (Number.isFinite(y)) env = Math.max(env, y); });
      row.infeasible = [0, r3(env)];
      return row;
    });
    const ys = rows.flatMap((r) => diagram.curves.map((_, j) => r[`c${j}`])).filter(Number.isFinite);
    const nx = niceTicks(xs[0], xs[xs.length - 1], 7);
    const x0 = xs[0], x1 = xs[xs.length - 1];
    return { data: rows, xAxis: { domain: [x0, x1], ticks: nx.ticks.filter((t) => t >= x0 && t <= x1) },
             yAxis: niceTicks(0, Math.max(...ys, diagram.design.y) * 1.08, 6) };
  }, [diagram]);
  const P = palette();
  const wsMax = r3(diagram.verticals[0]?.x);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: 28, bottom: 26, left: 14 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="x" type="number" domain={xAxis.domain} ticks={xAxis.ticks} allowDataOverflow {...axis()} label={xTitle(diagram.xLabel)} />
        <YAxis type="number" domain={yAxis.domain} ticks={yAxis.ticks} allowDataOverflow {...axis()} label={yTitle(diagram.yLabel)} />
        <Tooltip {...tooltip()} formatter={(v, n) => (Array.isArray(v) ? [null, null] : [r3(v), n])} />
        <Legend {...topLegend()} />
        <Area dataKey="infeasible" name="Infeasible (below a requirement)" stroke="none" fill={SC.warning} fillOpacity={0.08}
          isAnimationActive={false} legendType="square" />
        {Number.isFinite(wsMax) && (
          <ReferenceArea x1={wsMax} x2={xAxis.domain[1]} fill={SC.warning} fillOpacity={0.08} ifOverflow="hidden" />
        )}
        {diagram.curves.map((c, j) => (
          <Line key={c.name} dataKey={`c${j}`} name={c.name} stroke={P[j % P.length]} dot={false} strokeWidth={1.8} isAnimationActive={false} />
        ))}
        {diagram.verticals.map((v) => (
          <ReferenceLine key={v.name} x={r3(v.x)} stroke={SC.warning} strokeWidth={1.6}
            label={{ value: v.name, fill: SC.warning, fontSize: T.micro, position: "insideBottomRight", offset: 8 }} />
        ))}
        <ReferenceDot x={r3(diagram.design.x)} y={r3(diagram.design.y)} r={6} fill={SC.caution} stroke={SC.bg} strokeWidth={2}
          label={{ value: `design point (${r3(diagram.design.x)}, ${r3(diagram.design.y)})`, fill: SC.text, fontSize: T.micro, position: "left", offset: 10 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PayloadRangeChart({ pr, height = 320 }) {
  const data = pr.points.map((p) => ({ range: Math.round(p.rangeNm), payload: Math.round(p.payloadKg), label: p.label }));
  const xa = niceTicks(0, Math.max(...data.map((d) => d.range)) * 1.05, 8);
  const ya = niceTicks(0, Math.max(...data.map((d) => d.payload)) * 1.15, 5);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 14, right: 28, bottom: 26, left: 14 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="range" type="number" domain={xa.domain} ticks={xa.ticks} {...axis()} label={xTitle("Range (nm)")} />
        <YAxis type="number" domain={ya.domain} ticks={ya.ticks} {...axis()} label={yTitle("Payload (kg)")} />
        <Tooltip {...tooltip()} formatter={(v, n, it) => [`${v.toLocaleString()} kg`, it.payload.label]} labelFormatter={(v) => `${v} nm`} />
        <Area dataKey="payload" stroke="none" fill={SC.advisory} fillOpacity={0.1} isAnimationActive={false} />
        <Line dataKey="payload" stroke={SC.advisory} strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: SC.advisory }} />
        {Number.isFinite(pr.designRangeNm) && (
          <ReferenceDot x={Math.round(pr.designRangeNm)} y={Math.round(pr.designPayloadKg)} r={5} fill={SC.caution}
            label={{ value: "design mission", fill: SC.caution, fontSize: T.micro, position: "top" }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PolarChart({ polar, height = 280 }) {
  const data = polar.points.filter((p) => p.cl > 0).map((p) => ({ cl: +p.cl.toFixed(2), cd: r3(p.cd), ld: r3(p.cl / p.cd) }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid {...grid()} />
          <XAxis dataKey="cd" type="number" domain={["dataMin", "dataMax"]} {...axis()}
            label={{ value: "CD", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: T.micro }} />
          <YAxis dataKey="cl" type="number" {...axis()} label={{ value: "CL", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: T.micro }} />
          <Tooltip {...tooltip()} />
          <Line dataKey="cl" stroke={SC.advisory} dot={false} strokeWidth={1.8} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid {...grid()} />
          <XAxis dataKey="cl" type="number" {...axis()}
            label={{ value: "CL", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: T.micro }} />
          <YAxis {...axis()} label={{ value: "L/D", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: T.micro }} />
          <Tooltip {...tooltip()} />
          <Line dataKey="ld" stroke={SC.caution} dot={false} strokeWidth={1.8} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Horizontal bars: [{ name, value }] in kg or %. */
export function HBarChart({ rows, unit = "kg", height, colorBy }) {
  const h = height ?? Math.max(160, rows.length * 22 + 40);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid {...grid()} horizontal={false} vertical />
        <XAxis type="number" {...axis()} />
        <YAxis type="category" dataKey="name" width={170} {...axis()} />
        <Tooltip {...tooltip()} formatter={(v) => [`${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`]} />
        <Bar dataKey="value" isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={i} fill={colorBy ? colorBy(r) : SC.advisory} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* 1-2-5 ticks across the data's decades. */
function logTicks(points, design) {
  const xs = [...points.map((p) => p.x), design.x].filter((v) => v > 0);
  const lo = Math.min(...xs), hi = Math.max(...xs), out = [];
  for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi * 10; d *= 10)
    for (const m of [1, 2, 5]) if (m * d >= lo * 0.8 && m * d <= hi * 1.25) out.push(m * d);
  return out;
}

/* Reference aircraft against the design: points [{ x, y, name }]. */
export function ReferenceScatter({ points, design, xLabel, yLabel, height = 300, logX = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="x" type="number" scale={logX ? "log" : "auto"} domain={["auto", "auto"]} {...axis()}
          ticks={logX ? logTicks(points, design) : undefined}
          tickFormatter={(v) => (v >= 1e6 ? `${+(v / 1e6).toPrecision(2)}M` : v >= 1000 ? `${+(v / 1000).toPrecision(3)}k` : v)}
          label={xTitle(xLabel)} />
        <YAxis dataKey="y" type="number" domain={["auto", "auto"]} {...axis()} label={yTitle(yLabel)} />
        <ZAxis range={[28, 28]} />
        <Tooltip {...tooltip()} formatter={(v, n) => [r3(v), n]} labelFormatter={() => ""}
          content={({ payload }) => payload?.[0] ? (
            <div style={{ background: SC.panel, border: `1px solid ${SC.border}`, padding: 6, fontSize: T.label, fontFamily: MONO, color: SC.text }}>
              {payload[0].payload.name}<br />{xLabel}: {r3(payload[0].payload.x)}<br />{yLabel}: {r3(payload[0].payload.y)}
            </div>) : null} />
        <Scatter name="Reference aircraft" data={points} fill={SC.muted} isAnimationActive={false} />
        <Scatter name="This design" data={[{ ...design, name: "This design" }]} fill={SC.caution} shape="diamond" isAnimationActive={false} />
        <Legend {...topLegend()} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* A family of lines: rows [{ y, row: [{ x, value }] }] → one line per y. */
export function LineFamily({ family, xLabel, yLabel, seriesLabel, height = 320 }) {
  const xs = family[0]?.row.map((c) => c.x) ?? [];
  const data = xs.map((x, i) => {
    const o = { x: r3(x) };
    family.forEach((f, j) => { o[`s${j}`] = r3(f.row[i]?.value); });
    return o;
  });
  const P = palette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} {...axis()} label={xTitle(xLabel)} />
        <YAxis {...axis()} domain={["auto", "auto"]} label={yTitle(yLabel)} width={70} />
        <Tooltip {...tooltip()} />
        <Legend {...topLegend()} />
        {family.map((f, j) => (
          <Line key={j} dataKey={`s${j}`} name={`${seriesLabel} ${r3(f.y)}`} stroke={P[j % P.length]} dot={{ r: 2 }} isAnimationActive={false} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

