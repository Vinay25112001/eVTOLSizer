import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, Legend, ReferenceLine, ReferenceDot } from "recharts";
import { SC } from "../lib/theme.js";
import { constraintDiagram } from "../engine/constraints.js";
import { capabilitiesFor } from "../engine/configuration.js";

/* Tab 25 - CONSTRAINT DIAGRAM.
   The standard first step of conceptual design, and the one thing the engine
   did not have: wing loading was an INPUT with no derivation behind it. Here it
   is a RESULT, and the published values of Joby and Archer become a CHECK on
   the derived one rather than the source of it. See engine/constraints.js for
   the method and its citations. */
export function ConstraintDiagramTab(ctx) {
  const { SR, params, TTP } = ctx;

  const D = useMemo(() => {
    if (!SR) return null;
    const cap = capabilitiesFor(params.configType, params.nPropHover) ?? {};
    const hasWing = cap.hasWing !== false && !!SR.Swing;
    return constraintDiagram(params, {
      hasWing,
      CD0: SR.CD0tot,
      diskLoadingNm2: SR.DL_lbft2 != null ? SR.DL_lbft2 / 0.0208854 : 0,
      downloadFrac: SR.downloadFrac ?? 0,
    });
  }, [SR, params]);

  if (!SR || !D) return <div style={{ color: SC.muted }}>Size a design first.</div>;

  /* Recharts wants one row per x with a column per series. */
  const data = useMemo(() => {
    const xs = D.curves[0]?.points.map(p => p.WS) ?? [];
    return xs.map((WS, i) => {
      const row = { WS: +WS.toFixed(0) };
      for (const c of D.curves) {
        const wp = c.points[i]?.WP;
        // plot in kg/kW, which is the unit a designer actually quotes
        row[c.key] = wp != null && isFinite(wp) ? +(wp * 1000 / 9.80665).toFixed(2) : null;
      }
      return row;
    });
  }, [D]);

  const COL = { cruise: SC.advisory, climb: SC.caution, turn: SC.purple, hover: SC.warning };
  const dp  = D.designPoint;
  const kgkW = (wp) => wp != null ? wp * 1000 / 9.80665 : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
        Power loading against wing loading. The y-axis is <b>W/P</b> rather than
        thrust-to-weight because this aircraft has propellers, its powertrain is
        sized on power and its battery on energy - all three reasons given in
        corpus S1482 sec.3.2.3.4 (Torenbeek 2013, Roskam 1985, de Vries 2018).
        <b> A high power loading means a SMALL powerplant</b>, so the feasible
        region is <b>below</b> every curve and <b>left</b> of the wing limit, and
        the design point is its top-right corner.
      </div>

      <div style={{ height: 380, background: SC.panel, border: `1px solid ${SC.border}`,
                    borderRadius: 8, padding: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 28, left: 8 }}>
            <CartesianGrid {...chartGrid()}/>
            <XAxis dataKey="WS" stroke={SC.muted} tick={{ fontSize: 11 }}
                   label={{ value: "wing loading W/S  (N/m²)", position: "insideBottom",
                            offset: -16, fill: SC.muted, fontSize: 11 }} {...chartAxis()} />
            <YAxis stroke={SC.muted} tick={{ fontSize: 11 }} domain={[0, "auto"]}
                   label={{ value: "power loading  (kg/kW)", angle: -90,
                            position: "insideLeft", fill: SC.muted, fontSize: 11 }} {...chartAxis()} />
            <Tooltip {...(TTP || {})} {...chartTooltip()} />
            <Legend wrapperStyle={{ fontSize: 11 }} {...chartLegend()} />
            {D.curves.map(c => (
              <Line key={c.key} type="monotone" dataKey={c.key} name={c.label}
                    stroke={COL[c.key] ?? SC.primary}
                    strokeWidth={c.key === D.binding ? 3 : 1.6}
                    strokeDasharray={c.kind === "power-flat" ? "6 3" : undefined}
                    dot={false} isAnimationActive={false} />
            ))}
            {D.stallWS != null && (
              <ReferenceLine x={+D.stallWS.toFixed(0)} stroke={SC.nominal} strokeWidth={2}
                label={{ value: `wing limit ${D.stallWS.toFixed(0)}`, fill: SC.nominal,
                         fontSize: 10, position: "top" }} />
            )}
            {dp?.WS != null && dp?.WP_kgPerKW != null && (
              <ReferenceDot x={+dp.WS.toFixed(0)} y={+dp.WP_kgPerKW.toFixed(2)}
                            r={6} fill={SC.nominal} stroke={SC.bg} strokeWidth={2} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── THE DERIVED ANSWER, AND THE CHECK ON IT ────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                    gap: 10 }}>
        {[
          { k: "Wing loading (an input)",
            v: params.wingLoadingNm2 != null ? params.wingLoadingNm2.toFixed(0) + " N/m²" : "-",
            s: "still an input — the wing limit below is a two-aircraft fit, not a derivation" },
          { k: "Implied transition speed",
            v: D.impliedTransition
              ? D.impliedTransition.slowMS.toFixed(0) + "–"
                + D.impliedTransition.fastMS.toFixed(0) + " m/s"
              : "n/a — rotor-borne",
            s: D.impliedTransition
              ? "the earliest the lift rotors may stop, over CLmax "
                + D.impliedTransition.clMaxHigh + "–" + D.impliedTransition.clMaxLow
              : "" },
          { k: "Binding constraint", v: D.binding ?? "-",
            s: D.binding === "hover"
              ? "hover, as it is for every eVTOL - the line a fixed-wing diagram does not have"
              : "not hover, which is unusual for a VTOL - check the disk loading" },
          { k: "Design power loading",
            v: dp?.WP_kgPerKW != null ? dp.WP_kgPerKW.toFixed(2) + " kg/kW" : "-",
            s: SR.Phov ? "the loop sizes at " + (SR.MTOW / SR.Phov).toFixed(2) + " kg/kW" : "" },
        ].map(c => (
          <div key={c.k} style={{ background: SC.panel, border: `1px solid ${SC.border}`,
                                  borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: SC.muted, fontSize: 10, textTransform: "uppercase",
                          letterSpacing: 0.6 }}>{c.k}</div>
            <div style={{ color: SC.primary, fontSize: 20, fontWeight: 600, margin: "3px 0" }}>
              {c.v}</div>
            <div style={{ color: SC.muted, fontSize: 10.5, lineHeight: 1.45 }}>{c.s}</div>
          </div>
        ))}
      </div>

      {/* ── WHAT THE WING LIMIT IS, STATED PLAINLY ─────────────────────── */}
      {D.stallWS != null && (
        <div style={{ background: SC.panel, border: `1px solid ${SC.border}`,
                      borderRadius: 8, padding: 12, fontSize: 12, color: SC.muted,
                      lineHeight: 1.6 }}>
          <b style={{ color: SC.caution }}>The wing limit on this chart is a fit, not a
          derivation.</b>{" "}
          The wing constraint is <b>transition, not runway stall</b> — a VTOL never has to
          fly slowly, which is why eVTOL wing loadings are high. But CL<sub>max</sub> 1.5 and
          the ~41 m/s transition speed were <b>recovered by inverting</b> the published
          loadings of Archer (1371 N/m²) and Joby (1524 N/m²), so feeding them back returns
          a value between those two <i>by construction</i>. No published eVTOL transition
          speed or CL<sub>max</sub> was found to break that circularity, so wing loading
          <b> remains an input</b>.
          <div style={{ marginTop: 8 }}>
            What <i>is</i> non-circular is the inverse: at your wing loading of{" "}
            <b>{params.wingLoadingNm2?.toFixed(0)} N/m²</b> the wing alone can carry the
            aircraft at{" "}
            <b style={{ color: SC.primary }}>
              {D.impliedTransition?.slowMS.toFixed(0)}–{D.impliedTransition?.fastMS.toFixed(0)} m/s
            </b>{" "}
            ({((D.impliedTransition?.slowMS ?? 0) * 1.94384).toFixed(0)}–
            {((D.impliedTransition?.fastMS ?? 0) * 1.94384).toFixed(0)} kt) — that is the
            earliest the lift rotors may stop. Choosing a wing loading is choosing that speed.
          </div>
          <div style={{ marginTop: 8, color: SC.muted }}>
            The <b>power-loading</b> curves are unaffected by any of this: cruise, climb and
            turn come from the converged drag polar, hover from momentum theory.
          </div>
        </div>
      )}

      <div style={{ color: SC.muted, fontSize: 11.5, lineHeight: 1.6 }}>{D.note}</div>
    </div>
  );
}
