/* =====================================================================
   RISK PANEL — the exceedance curve, and what it does NOT cover
   =====================================================================
   The curve is drawn second, under the statement of its own scope,
   because an exceedance curve on a design page reads as a confidence
   band on the design unless something stops it. Nothing above the rotor
   layer has an error distribution, so nothing above the rotor layer gets
   a band here.
   ===================================================================== */
import { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import { exceedance, riskRegister } from "./risk.js";
import { buildAirframe } from "./geometry3d.js";
import { acai, torqueToThrustRatio } from "../../engine/controlauthority.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };
const SEV = { high: "#e0574a", medium: "#f2a33c", low: "#54c7a8" };

export default function RiskPanel({ design, frame }) {
  const { built, result, ok } = design;

  const ex = useMemo(() => exceedance(built.propeller?.id), [built.propeller]);

  const { airframe, acaiPerRotor } = useMemo(() => {
    if (!ok || !frame) return { airframe: null, acaiPerRotor: null };
    try {
      const a = buildAirframe({
        frame, propellerDiameterM: built.propeller.diameterM, tipGapFraction: 0.10,
      });
      const kMu = torqueToThrustRatio({
        thrustPerRotorN: result.hover.thrustPerRotorN, R_m: a.propRadiusM,
        tipSpeed_ms: (result.hover.rpm * 2 * Math.PI / 60) * a.propRadiusM,
        FM: result.hover.figureOfMerit, rho: result.rho,
      });
      if (kMu == null) return { airframe: a, acaiPerRotor: null };
      const W = result.massKg * 9.80665, fMax = result.thrustToWeight.maxThrustPerRotorN;
      const per = a.rotors.map((r, i) => {
        const set = a.rotors.map((x, k) => ({
          r: Math.hypot(x.x, x.y), phi: Math.atan2(x.y, x.x),
          w: x.rotation === "CCW" ? 1 : -1, eta: k === i ? 0 : 1,
        }));
        const v = acai({ rotors: set, kMu, fMaxN: fMax, weightN: W });
        return { motor: r.motor, controllable: v?.controllable ?? null };
      });
      return { airframe: a, acaiPerRotor: per };
    } catch { return { airframe: null, acaiPerRotor: null }; }
  }, [ok, frame, built.propeller, result]);

  const register = useMemo(
    () => riskRegister({ design, airframe, acaiPerRotor }), [design, airframe, acaiPerRotor]);

  const at = (x) => {
    const row = ex.curve.reduce((a, b) => (Math.abs(b.errPct - x) < Math.abs(a.errPct - x) ? b : a));
    return row.exceed;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>

      <Card title="What this page is, and is not">
        <div style={{ fontSize: T.body, color: SC.text, lineHeight: 1.7 }}>
          There is <b>no confidence interval on take-off mass or endurance</b>, because nothing above
          the rotor layer has ever been scored against a real drone. The curve below describes the{" "}
          <b>rotor layer only</b>.
        </div>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7, marginTop: S.sm }}>
          It is not a five-by-five likelihood-consequence matrix: NASA publishes none, and
          NASA/SP-20240014019 (2024) p. 74 states the qualitative form “can no longer be considered
          valid”. It is not a Monte Carlo over input distributions either — three of the five sizing
          inputs are <i>declared</i> precisely because nobody publishes them, so sampling them would
          be sampling this tool’s own plausibility bounds and calling the spread an uncertainty. The
          two cited candidates for usable fraction do not even disagree in degree; they disagree in
          kind.
        </div>
      </Card>

      <Card title="Exceedance — the rotor layer, cross-validated">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: S.sm, marginBottom: S.sm }}>
          <Kpi label="Held-out points" value={ex.n} unit="" />
          <Kpi label="Median |error|" value={num(ex.medianAbs, 2)} unit="%" />
          <Kpi label="95th percentile" value={num(ex.p95Abs, 2)} unit="%" />
          <Kpi label="Worst" value={num(ex.worstAbs, 1)} unit="%" />
          <Kpi label="P(|err| > 1 %)" value={num(at(1), 1)} unit="%" />
          <Kpi label="P(|err| > 5 %)" value={num(at(5), 1)} unit="%" />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={ex.curve} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
            <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
            <XAxis dataKey="errPct" type="number" {...axis}
              label={{ value: "thrust-coefficient error x (%)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
            <YAxis {...axis} domain={[0, 100]} width={50}
              label={{ value: "P(|error| > x)  %", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
            <Tooltip formatter={(v) => `${(+v).toFixed(2)} %`}
              labelFormatter={(x) => `|error| > ${(+x).toFixed(2)} %`} />
            <Area type="stepAfter" dataKey="exceed" stroke="#4ea1ff" strokeWidth={2.5}
                  fill="#4ea1ff" fillOpacity={0.14} isAnimationActive={false} />
            <ReferenceLine x={5} stroke={SC.caution} strokeDasharray="4 3"
              label={{ value: "5 % gate", fill: SC.caution, fontSize: 10, position: "top" }} />
            <ReferenceDot x={ex.medianAbs} y={50} r={4} fill={SC.caution} stroke="none" />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          <b>Stratum:</b> {ex.stratum}.{" "}
          {ex.usedOwnStratum
            ? "This propeller has enough held-out points to be scored on its own."
            : `This propeller has too few held-out points for a 95th percentile to mean anything, so the whole database is used. Database-wide: median ${num(ex.databaseWide.medianAbs, 2)} %, 95th ${num(ex.databaseWide.p95Abs, 2)} %.`}
          <br /><b>Method:</b> {ex.method}
          <br /><b>Scope:</b> {ex.appliesTo}
        </div>
      </Card>

      <Card title={`Risk register — ${register.length} findings about this design`}>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
          Every entry is a fact that can be checked. <b>No likelihood is scored</b> — severity orders
          the list for reading and is never multiplied by anything.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th()}>Severity</th><th style={th()}>Finding</th>
            <th style={th()}>Evidence</th><th style={th()}>Consequence</th><th style={th()}>Reduce it by</th>
          </tr></thead>
          <tbody>
            {register.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td(), color: SEV[r.severity], fontWeight: 600, whiteSpace: "nowrap" }}>
                  {r.severity}
                </td>
                <td style={{ ...td(), fontWeight: 600, minWidth: 150 }}>{r.title}</td>
                <td style={{ ...td(), fontSize: 11, color: SC.muted }}>{r.evidence}</td>
                <td style={{ ...td(), fontSize: 11 }}>{r.consequence}</td>
                <td style={{ ...td(), fontSize: 11, color: SC.muted }}>{r.reduce}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Why the other layers have no curve">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Rotor", "cross-validated", `${ex.databaseWide.n} held-out predictions over the measured database — the curve above`],
              ["Motor", "no residual exists", "eta_motor is not measured on any production thrust stand, so the motor/ESC split is the model's own output. There is nothing to take a residual against."],
              ["ESC", "a spread, not an error", "the p10–p90 band is the disagreement BETWEEN motors at the same duty, which is not a prediction error"],
              ["Battery", "data quality, not model error", "the pack discrepancies are findings about vendor sheets, not about a model"],
              ["Vehicle", "NOTHING", "no aircraft exists whose components are all in the measured databases, so the sizing loop has never been scored against a real drone"],
            ].map(([layer, status, why]) => (
              <tr key={layer}>
                <td style={{ ...td(), fontWeight: 600, whiteSpace: "nowrap" }}>{layer}</td>
                <td style={{ ...td(), color: status === "cross-validated" ? "#54c7a8" : SC.caution, whiteSpace: "nowrap" }}>{status}</td>
                <td style={{ ...td(), fontSize: 11, color: SC.muted }}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
