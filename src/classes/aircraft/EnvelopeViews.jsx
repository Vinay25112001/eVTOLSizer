/* =====================================================================
   V-n DIAGRAM — the manoeuvre envelope, the gust envelope, and both at once
   =====================================================================
   The drawing every structures report opens with, and the one the tool had
   no way to produce: it carried a single limit load factor and none of the
   boundaries around it.

   Two envelopes are drawn, because they ARE two diagrams. 25.333(b) gives
   the manoeuvre envelope as a figure; 25.341 gives the gust case as a set
   of velocities with no figure at all, and the gust envelope is what
   everyone constructs from them. Overlaying them without saying so is how a
   reader comes to believe the outer boundary is a single regulated shape.

   The gust lines are straight through (0, 1) because the Pratt increment is
   linear in speed, and under the CURRENT rule their slopes are in the ratio
   1 : 1 : 0.5 at V_B, V_C and V_D — U_ref is the same between V_B and V_C
   (25.341(a)(5)(i)) and halved at V_D (25.341(a)(5)(ii)). Any V-n diagram
   showing a STEEPER line at V_B is drawing the pre-1996 rule, where V_B
   carried 66 ft/s against V_C's 50. That fossil survives in the 1.32 of
   25.335(a)(2), which is 66/50.
   ===================================================================== */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
         ReferenceLine, ReferenceDot, ComposedChart } from "recharts";
import { SC } from "../../lib/theme.js";
import { grid, axis, tooltip, legend } from "../../ui/chart.js";
import { MONO } from "../../ui/tokens.js";
import { LEVEL_FLIGHT_N } from "./flight-envelope.js";

const topLegend = () => ({ ...legend(), verticalAlign: "top", align: "right", height: 34,
                           wrapperStyle: { ...(legend().wrapperStyle || {}), paddingBottom: 4 } });
const xT = (t) => ({ value: t, position: "insideBottom", offset: -4, fill: SC.muted, fontSize: 11 });
const yT = (t) => ({ value: t, angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11, style: { textAnchor: "middle" } });

export function VnDiagram({ env, height = 380 }) {
  if (!env || env.unavailable) return null;
  const s = env.speeds;
  /* One row per speed, carrying every branch, so Recharts can share the x
     axis. Gaps are null, which Recharts leaves as a break in the line. */
  const vMax = s.vdKt * 1.04;
  const N = 220;
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const v = (vMax * i) / N;
    const stall = v <= s.vaKt ? (v / s.vs1Kt) ** 2 : null;
    const limit = v >= s.vaKt && v <= s.vdKt ? env.manoeuvreN : null;
    const stallNeg = v <= s.vhKt ? -((v / s.vs1NegKt) ** 2) : null;
    const negFlat = v >= s.vhKt && v <= s.vcKt ? -1 : null;
    const negRamp = v >= s.vcKt && v <= s.vdKt
      ? -1 * ((s.vdKt - v) / Math.max(s.vdKt - s.vcKt, 1e-9)) : null;
    /* Gust lines: straight through (0,1), drawn only out to their own speed. */
    const g = env.gust;
    const gl = (which) => {
      const gg = g.find((x) => x.label === which);
      return v <= gg.v ? 1 + (gg.dn * v) / gg.v : null;
    };
    const glNeg = (which) => {
      const gg = g.find((x) => x.label === which);
      return v <= gg.v ? 1 - (gg.dn * v) / gg.v : null;
    };
    rows.push({
      v: +v.toFixed(2),
      stall: stall === null ? null : +stall.toFixed(4),
      limit, stallNeg: stallNeg === null ? null : +stallNeg.toFixed(4),
      negFlat, negRamp: negRamp === null ? null : +negRamp.toFixed(4),
      gustC: gl("V_C") === null ? null : +gl("V_C").toFixed(4),
      gustCneg: glNeg("V_C") === null ? null : +glNeg("V_C").toFixed(4),
      gustD: gl("V_D") === null ? null : +gl("V_D").toFixed(4),
      gustDneg: glNeg("V_D") === null ? null : +glNeg("V_D").toFixed(4),
    });
  }
  const gC = env.gust.find((x) => x.label === "V_C");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 24, left: 8, bottom: 22 }}>
        <CartesianGrid {...grid()} />
        <XAxis dataKey="v" type="number" domain={[0, +vMax.toFixed(0)]} {...axis()}
               label={xT("equivalent airspeed (kt)")} />
        <YAxis {...axis()} label={yT("load factor n")} width={62}
               domain={[Math.floor(Math.min(-1.4, 1 - gC.dn - 0.2)), Math.ceil(env.manoeuvreN + 0.6)]} />
        <Tooltip {...tooltip()} />
        <Legend {...topLegend()} />
        <ReferenceLine y={0} stroke={SC.dim} />
        <ReferenceLine y={LEVEL_FLIGHT_N} stroke={SC.dim} strokeDasharray="2 4" />
        {/* Speed markers. V_A and V_C can sit within a few knots of each
            other, so the labels alternate height rather than overprint. */}
        {[["vaKt", "V_A"], ["vbKt", "V_B"], ["vcKt", "V_C"], ["vdKt", "V_D"]].map(([k, l], i) => (
          <ReferenceLine key={l} x={+s[k].toFixed(1)} stroke={SC.dim} strokeDasharray="3 4"
            label={{ value: l, fill: SC.subtle, fontSize: 10,
                     position: i % 2 === 0 ? "top" : "insideTopLeft" }} />
        ))}
        {/* The vertical D-E leg. It is not a function of speed, so it cannot
            be a data series — without it the envelope reads as open on the
            right, which is exactly the boundary 25.333(b) closes. */}
        <ReferenceLine stroke={SC.primary} strokeWidth={2.4}
          segment={[{ x: +s.vdKt.toFixed(1), y: env.manoeuvreN }, { x: +s.vdKt.toFixed(1), y: 0 }]} />
        {/* manoeuvre envelope */}
        <Line type="monotone" dataKey="stall" name="manoeuvre envelope (25.333)" stroke={SC.primary}
              strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="limit" name="" legendType="none" stroke={SC.primary}
              strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="stallNeg" name="" legendType="none" stroke={SC.primary}
              strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="negFlat" name="" legendType="none" stroke={SC.primary}
              strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="negRamp" name="" legendType="none" stroke={SC.primary}
              strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls={false} />
        {/* gust envelope */}
        <Line type="monotone" dataKey="gustC" name="gust at V_C (25.341, Pratt estimate)" stroke={SC.warning}
              strokeWidth={1.8} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="gustCneg" name="" legendType="none" stroke={SC.warning}
              strokeWidth={1.8} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="gustD" name="gust at V_D (half U_ref)" stroke={SC.caution}
              strokeWidth={1.4} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="gustDneg" name="" legendType="none" stroke={SC.caution}
              strokeWidth={1.4} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
        <ReferenceDot x={+s.vaKt.toFixed(1)} y={env.manoeuvreN} r={4} fill={SC.primary} stroke="none" />
        <ReferenceDot x={+s.vcKt.toFixed(1)} y={+gC.nPos.toFixed(3)} r={4} fill={SC.warning} stroke="none" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
