/* =====================================================================
   PROPULSION PANEL — motor and ESC, with the evidence for each
   =====================================================================
   This tab used to say "not computed yet". That was true when it was
   written and is now false: the motor and ESC blocks are built and
   gated. A placeholder that contradicts the code is worse than the empty
   panel it was defending, because it is a claim about the tool that the
   tool disproves.

   Both curves here are swept through the REAL blocks — the same
   functions the sizing loop calls — rather than redrawn from remembered
   shapes.
   ===================================================================== */
import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot, Legend, ComposedChart, Area,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import { motorConstants, motorPointFromShaftPower, constantsSelfConsistency } from "./motor.js";
import { JOINT_RESIDUAL_TABLE, REJECTED_MODELS, ESC_UNDER_TEST, TABLE_PROVENANCE, RESIDUAL_MEANING, rectificationMode } from "./esc.js";
import { staticShaftPowerW, staticThrustN } from "./rotor.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };

export default function PropulsionPanel({ built, result, ok, rho }) {
  const mc = useMemo(() => { try { return motorConstants(built.motor); } catch { return null; } }, [built.motor]);
  const cons = useMemo(() => (mc ? constantsSelfConsistency(mc) : null), [mc]);

  /* Sweep the selected propeller across its MEASURED rpm range and push
     each point through the motor block. Every x value is a measured row. */
  const motorCurve = useMemo(() => {
    if (!mc || !built.propeller?.static?.length) return [];
    return built.propeller.static.map(([rpm]) => {
      const shaft = staticShaftPowerW(built.propeller, rpm, rho).powerW;
      const p = motorPointFromShaftPower(mc, { shaftPowerW: shaft, rpm });
      return {
        rpm, thrustN: staticThrustN(built.propeller, rpm, rho).thrustN,
        etaMotor: 100 * p.etaMotor, currentA: p.currentA, voltageV: p.voltageV,
        copperW: p.copperLossW, noLoadW: p.noLoadLossW, shaftW: shaft,
      };
    });
  }, [mc, built.propeller, rho]);

  const escBand = JOINT_RESIDUAL_TABLE.map((b) => ({
    duty: b.duty, median: 100 * b.median, p10: 100 * b.p10, p90: 100 * b.p90,
    band: [100 * b.p10, 100 * b.p90], n: b.n,
  }));

  const mode = rectificationMode(built.esc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>

      <Card title={`Motor — ${built.motor.manufacturer} ${built.motor.model}`}>
        {mc == null ? (
          <div style={{ fontSize: T.label, color: SC.muted }}>
            This motor cannot be modelled from its datasheet.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: S.sm, marginBottom: S.md }}>
              <Kpi label="Kv" value={num(mc.kv, 0)} unit="rpm/V" />
              <Kpi label="Kt" value={num(mc.ktNmPerA, 4)} unit="Nm/A" sub={mc.ktSource} />
              <Kpi label="Rm" value={num(mc.rmOhm * 1000, 1)} unit="mΩ" sub={mc.resistanceConvention} />
              <Kpi label="I₀" value={num(mc.i0A, 2)} unit="A" sub={`at ${num(mc.i0RefV, 0)} V`} />
              <Kpi label="Mass" value={num(mc.massGWithCables ?? mc.massG, 0)} unit="g" />
              {ok ? <Kpi label="Hover η" value={num(100 * result.hover.motor.etaMotor, 1)} unit="%" /> : null}
            </div>
            {cons?.checkable ? (
              <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
                <b style={{ color: SC.text }}>Vendor self-consistency:</b> Kt against 9.5493/Kv is{" "}
                {num(cons.ktDeltaPct, 2)} %, and Rm against (Kt/Km)² is {num(cons.rDeltaPct, 2)} %.
                Both identities holding is what licenses using the printed resistance
                <i> unmodified</i>: if a vendor's own printed triple satisfies Km = Kt/√R, the R it
                prints is the R the standard model wants, and no convention conversion applies.
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={motorCurve} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis dataKey="rpm" {...axis}
                  label={{ value: "rpm (measured rows)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
                <YAxis yAxisId="l" {...axis} domain={[0, 100]}
                  label={{ value: "η motor (%)", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" {...axis}
                  width={46} label={{ value: "current A", angle: 90, position: "insideRight", fill: SC.muted, fontSize: 11 }} />
                <Tooltip formatter={(x, n) => [num(+x, 2), n]} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="l" type="monotone" dataKey="etaMotor" stroke="#54c7a8" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} name="η motor %" />
                <Line yAxisId="r" type="monotone" dataKey="currentA" stroke="#f2a33c" strokeWidth={2} dot={false} isAnimationActive={false} name="current A" />
                {ok ? <ReferenceLine yAxisId="l" x={result.hover.rpm} stroke={SC.caution} strokeDasharray="4 3"
                  label={{ value: "hover", fill: SC.caution, fontSize: 10, position: "top" }} /> : null}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
              Efficiency rises steeply then plateaus — the classic shape, because the no-load term
              dominates at light load. Computed from published Kv, Kt, I₀ and Rm with{" "}
              <b>no fitted parameter</b>, swept over {motorCurve.length} measured propeller rows.
              Only {" "}
              <b>3 of 24</b> catalogue motors can be modelled this way: 18 state no resistance
              convention and 3 publish no no-load current.
            </div>
          </>
        )}
      </Card>

      <Card title={`ESC — ${built.esc.manufacturer} ${built.esc.model}`}>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
          <b style={{ color: SC.caution }}>This is a JOINT residual, not an ESC efficiency.</b>{" "}
          {RESIDUAL_MEANING.why}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={escBand} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
            <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
            <XAxis dataKey="duty" {...axis} type="number" domain={[0.2, 1]}
              label={{ value: "duty  (V motor / V pack)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
            <YAxis {...axis} domain={[55, 100]}
              label={{ value: "joint residual (%)", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
            <Tooltip formatter={(x, n) => [Array.isArray(x) ? `${num(x[0])}–${num(x[1])}` : num(+x), n]} />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="band" stroke="none" fill="#4ea1ff" fillOpacity={0.18} isAnimationActive={false} name="p10–p90 measured spread" />
            <Line type="monotone" dataKey="median" stroke="#4ea1ff" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} name="median" />
            {ok ? <ReferenceDot x={result.hover.esc.duty} y={100 * result.hover.esc.etaJoint} r={5} fill={SC.caution} stroke="none" /> : null}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
          Measured on {ESC_UNDER_TEST.model}, with <b>{ESC_UNDER_TEST.statedVerbatim}</b>.
          {" "}{TABLE_PROVENANCE.rowsUsed} rows of {TABLE_PROVENANCE.rowsInTruthSet}; the rest are
          excluded — {TABLE_PROVENANCE.excludedAnomalousVoltageBlock} in a block whose printed pack
          voltage is impossible, {TABLE_PROVENANCE.excludedFalsified} where the model already exceeds
          the bus. A fixed efficiency would be <b>17 % wrong at quarter duty</b>, which is why this is
          a table and not a number.
          {ok ? <> The dot is this design at duty {num(result.hover.esc.duty, 3)}.</> : null}
          <br />
          <b style={{ color: mode === "notStated" ? SC.caution : SC.text }}>
            This ESC's rectification mode: {mode === "notStated" ? "NOT STATED" : mode}.
          </b>{" "}
          {mode === "notStated"
            ? "9 of 10 catalogue ESCs do not state it, so whether this measured table applies is unknown. Inferring it from a firmware name would be a guess dressed as a datum."
            : "Stated explicitly by the vendor."}
        </div>
      </Card>

      <Card title="Two ESC models were tried and both were refused">
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
          This is why the layer carries a measured table instead of a model. Both rejections are
          re-derived from the data by the ESC gate on every run, rather than being remembered here.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th()}>Model</th><th style={th()}>Prediction</th>
            <th style={th()}>What the data gave</th><th style={th()}>Verdict</th>
          </tr></thead>
          <tbody>
            {REJECTED_MODELS.map((m) => (
              <tr key={m.name}>
                <td style={{ ...td(), fontSize: 11 }}><b>{m.name}</b><br />
                  <span style={{ color: SC.muted, fontSize: 10 }}>{m.source}</span></td>
                <td style={{ ...td(), fontSize: 11 }}>{m.prediction}</td>
                <td style={{ ...td(), fontSize: 11 }}>{m.result}</td>
                <td style={{ ...td(), fontSize: 11, color: SC.caution }}>{m.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {ok ? (
        <Card title="Where the power goes at hover">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th()}>Stage</th><th style={th(true)}>per rotor</th><th style={th(true)}>all {result.rotors}</th><th style={th(true)}>of bus</th></tr></thead>
            <tbody>
              {[
                ["Rotor shaft", result.hover.shaftPowerW],
                ["Motor copper loss", result.hover.motor.copperLossW],
                ["Motor no-load loss", result.hover.motor.noLoadLossW],
                ["ESC + model residual", result.hover.esc.lossW],
              ].map(([k, perRotor]) => (
                <tr key={k}>
                  <td style={td()}>{k}</td>
                  <td style={td(true)}>{num(perRotor, 1)} W</td>
                  <td style={td(true)}>{num(perRotor * result.rotors, 0)} W</td>
                  <td style={td(true)}>{num(100 * perRotor * result.rotors / result.hover.busPowerW, 1)} %</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td(), fontWeight: 600 }}>Bus total</td>
                <td style={td(true)}>—</td>
                <td style={{ ...td(true), fontWeight: 600 }}>{num(result.hover.busPowerW, 0)} W</td>
                <td style={td(true)}>100 %</td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
