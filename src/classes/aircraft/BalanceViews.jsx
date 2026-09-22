/* =====================================================================
   BALANCE VIEWS — the loading diagram and the mass stations
   =====================================================================
     LoadingDiagram   mass against CG in per cent MAC — the "potato curve" —
                      with the forward and aft loading branches, the neutral
                      point, and the aft limit the static margin allows
     StationDiagram   the fuselage in side elevation with every mass the
                      weight model reports placed at its station, the disc
                      area proportional to the mass, and the wing, the CG
                      and the neutral point marked

   The colour convention is the one the fuselage view established and the
   research note asks for: SC.primary for a computed quantity, SC.caution
   for a sourced convention. On this drawing the wing station is the only
   longitudinal position that is computed — everything else is the TASOPT
   737 deck's layout — so the wing is the only thing drawn in the computed
   colour, and that contrast is the honest picture of what balance has and
   has not yet bought.
   ===================================================================== */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
         ReferenceLine, ReferenceArea, ComposedChart, Scatter } from "recharts";
import { SC } from "../../lib/theme.js";
import { grid, axis, tooltip, legend } from "../../ui/chart.js";
import { MONO } from "../../ui/tokens.js";
import { fuselageSideOutline, outlinePath } from "./geometry.js";

const topLegend = () => ({ ...legend(), verticalAlign: "top", align: "right", height: 34,
                           wrapperStyle: { ...(legend().wrapperStyle || {}), paddingBottom: 4 } });
const xT = (t) => ({ value: t, position: "insideBottom", offset: -4, fill: SC.muted, fontSize: 11 });
const yT = (t) => ({ value: t, angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11, style: { textAnchor: "middle" } });

/* ── the potato curve ─────────────────────────────────────────────────── */
export function LoadingDiagram({ bal, height = 320 }) {
  if (!bal) return null;
  const pts = bal.envelope.loading;
  const fwd = pts.filter((p) => p.label === "fwd").sort((a, b) => a.mass - b.mass);
  const aft = pts.filter((p) => p.label === "aft").sort((a, b) => a.mass - b.mass);
  /* One row per mass, so the two branches share an x axis in Recharts. */
  const data = fwd.map((p, i) => ({
    mass: Math.round(p.mass),
    fwdPct: +(100 * p.pctMac).toFixed(2),
    aftPct: +(100 * aft[i].pctMac).toFixed(2),
  }));
  const np = 100 * bal.neutralPoint.tailOnly.pctMac;
  const aftLimit = np - 100 * bal.neutralPoint.marginMin;
  /* The neutral point can sit well above the loaded envelope, and with an
     auto domain it fell off the top of the chart with its label on it. The
     axis is set to hold everything that is drawn. */
  const lo = Math.min(...data.map((d) => d.fwdPct), aftLimit, np) - 6;
  const hi = Math.max(...data.map((d) => d.aftPct), aftLimit, np) + 6;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 20, left: 8, bottom: 20 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="mass" {...axis()} type="number" domain={["dataMin", "dataMax"]}
               label={xT("mass (kg), at zero fuel")} tickFormatter={(v) => (v / 1000).toFixed(0) + "t"} />
        <YAxis {...axis()} label={yT("centre of gravity (% MAC)")} width={76}
               domain={[Math.floor(lo), Math.ceil(hi)]} />
        <Tooltip {...tooltip()} />
        <Legend {...topLegend()} />
        <ReferenceArea y1={100 * bal.envelope.fwd.pctMac} y2={100 * bal.envelope.aft.pctMac}
                       fill={SC.advisory} fillOpacity={0.10} />
        {/* The two lines sit one static margin apart — five per cent MAC, a
            dozen pixels — so their labels go to opposite ends. */}
        <ReferenceLine y={np} stroke={SC.warning} strokeDasharray="6 4"
          label={{ value: `neutral point ${np.toFixed(0)} % (tail only)`, fill: SC.warning, fontSize: 10, position: "insideTopLeft" }} />
        <ReferenceLine y={aftLimit} stroke={SC.caution} strokeDasharray="4 3"
          label={{ value: `aft limit — ${(100 * bal.neutralPoint.marginMin).toFixed(0)} % static margin`, fill: SC.caution, fontSize: 10, position: "insideBottomRight" }} />
        <Line type="monotone" dataKey="fwdPct" name="passengers packed forward" stroke={SC.primary}
              strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="aftPct" name="passengers packed aft" stroke={SC.nominal}
              strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ── mass stations on the fuselage ────────────────────────────────────── */
export function StationDiagram({ bal, fus, height = 300 }) {
  if (!bal) return null;
  const L = bal.fuselageLengthM;
  const H = fus ? fus.shell.heightM : L / 9;
  const padX = L * 0.04, W = L + 2 * padX;
  const u = W / 1000;
  const headroom = u * 20, footroom = u * 54;
  const VH = H * 1.7 + headroom + footroom;
  const X = (x) => padX + x;
  const cz = headroom + H * 0.85;
  const Z = (z) => cz - z;
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 15 };
  const small = { ...txt, fontSize: u * 11, fill: SC.dim };

  const nose = fus ? fus.shell.noseLengthM : 0.14 * L;
  const tail = fus ? fus.shell.tailConeLengthM : 0.26 * L;
  /* Same body, same curve as the profile and the general arrangement —
     from geometry.js rather than a third hand-written copy. */
  const outline = outlinePath(
    fuselageSideOutline({ length: L, height: H, noseLength: nose, tailLength: tail }), X, Z);

  const maxKg = Math.max(...bal.items.map((i) => i.kg));
  const rOf = (kg) => Math.max(u * 3, Math.sqrt(kg / maxKg) * H * 0.30);

  return (
    <svg viewBox={`0 0 ${W} ${VH}`} style={{ width: "100%", height, display: "block" }} role="img"
         aria-label={`Mass stations: ${bal.items.length} items on a ${L.toFixed(1)} m fuselage`}>
      <path d={outline} fill={SC.panel} fillOpacity={0.35} stroke={SC.dim} strokeWidth={u * 1.2} />
      <line x1={X(0)} y1={Z(0)} x2={X(L)} y2={Z(0)} stroke={SC.dim} strokeWidth={u * 0.5}
            strokeDasharray={`${u * 8} ${u * 4} ${u * 2} ${u * 4}`} />

      {/* the MAC, and the wing — the only computed station on the drawing */}
      <rect x={X(bal.xLemac)} y={Z(-H * 0.62)} width={bal.mac} height={H * 0.12}
            fill={SC.primary} fillOpacity={0.30} stroke={SC.primary} strokeWidth={u * 1.2} />
      <text x={X(bal.xLemac + bal.mac / 2)} y={Z(-H * 0.62) + u * 26} {...small} fill={SC.primary} textAnchor="middle">
        MAC {bal.mac.toFixed(2)} m — wing placed by Scholz (10.24)
      </text>

      {/* every mass, area proportional to the mass it carries */}
      {bal.items.map((i, k) => (
        <circle key={k} cx={X(i.x)} cy={Z(0)} r={rOf(i.kg)}
                fill={i.group === "wing" ? SC.primary : SC.caution}
                fillOpacity={0.30} stroke={i.group === "wing" ? SC.primary : SC.caution} strokeWidth={u * 0.8}>
          <title>{`${i.name}: ${Math.round(i.kg).toLocaleString("en-US")} kg at ${i.x.toFixed(2)} m — ${i.why}`}</title>
        </circle>
      ))}

      {/* The three stations that matter. Their labels go in a legend at the
          top right, not on the lines: OEW CG, MTOW CG and the neutral point
          sit within a metre or two of each other on a transport, and labels
          hung off each line overprinted one another. */}
      {[[bal.oew.xM, SC.nominal, "OEW CG"], [bal.takeoff.xM, SC.advisory, "MTOW CG"],
        [bal.neutralPoint.tailOnly.xM, SC.warning, "NP (tail only)"]].map(([x, c, label], k) => (
        <g key={label}>
          <line x1={X(x)} y1={Z(H * 0.80)} x2={X(x)} y2={Z(-H * 0.45)} stroke={c} strokeWidth={u * 2} />
          <line x1={X(L) - u * 168} y1={u * 34 + k * u * 15} x2={X(L) - u * 150} y2={u * 34 + k * u * 15}
                stroke={c} strokeWidth={u * 2.4} />
          <text x={X(L) - u * 144} y={u * 38 + k * u * 15} {...small} fill={c}>{label}</text>
        </g>
      ))}

      <text x={X(0)} y={u * 15} {...txt}>
        {bal.items.length} masses · OEW CG {(100 * bal.oew.pctMac).toFixed(1)} % MAC · MTOW CG {(100 * bal.takeoff.pctMac).toFixed(1)} % MAC
      </text>
      <text x={X(0)} y={VH - u * 18} {...small} fontSize={u * 10}>
        computed (blue): the wing station and the MAC
      </text>
      <text x={X(0)} y={VH - u * 5} {...small} fontSize={u * 10}>
        convention (amber): every other station — the TASOPT 737 deck's layout, scaled by fuselage length
      </text>
    </svg>
  );
}
