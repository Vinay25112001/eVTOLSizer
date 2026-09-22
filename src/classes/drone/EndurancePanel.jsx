/* =====================================================================
   BATTERY & ENDURANCE — the pack, its limits, and what moves the answer
   =====================================================================
   The Sizing tab gives one endurance number. This tab gives the things
   that number depends on, which is the more useful half:

     - the voltage-field audit, on every pack in the survey, because one
       of them is wrong by 14.4 % and the others are right to the digit
     - the discharge demand against the published rating
     - how endurance moves with payload and with the declared usable
       fraction, which is the input nobody publishes

   THE SENSITIVITY SWEEP IS THE POINT. Usable fraction is declared, and
   its two cited candidates disagree in kind. Showing endurance against
   it makes the size of that disagreement visible instead of leaving it
   as a number in a form field.
   ===================================================================== */
import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot, Legend, BarChart, Bar, Cell, Area, AreaChart,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import { VEHICLE_BATTERIES, VOLTAGE_FIELD_ANOMALIES } from "../../data/drone-vehicles.js";
import { packEnergyWh, dischargeLimitStatus, USABLE_FRACTION_SOURCES } from "./battery.js";
import { sizeDrone } from "./sizing.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };

export default function EndurancePanel({ v, built, mission, declared, selection, result, ok }) {
  const pack = built.pack;
  const energy = useMemo(() => (pack ? packEnergyWh(pack) : null), [pack]);

  const discharge = useMemo(() => {
    if (!ok || !pack) return null;
    const perPack = result.hover.esc.busCurrentA * result.rotors / result.massBreakdown.packs;
    return dischargeLimitStatus(pack, perPack);
  }, [ok, pack, result]);

  /* Endurance against payload, re-sized at every point — not scaled from
     one answer, because the pack count is a step function of payload. */
  const payloadSweep = useMemo(() => {
    if (!ok || !selection) return [];
    const out = [];
    for (let p = 0; p <= Math.max(2, mission.payloadKg * 3); p += Math.max(0.1, mission.payloadKg / 6)) {
      try {
        const r = sizeDrone({
          mission: { payloadKg: p, hoverEnduranceMin: 1 }, selection, declared,
          options: { altitudeM: v.altitudeM },
        });
        if (r.status?.startsWith("converged"))
          out.push({ payloadKg: p, minutes: r.endurance.minutes, massKg: r.massKg, packs: r.massBreakdown.packs });
      } catch { /* a payload this airframe cannot lift is simply absent */ }
    }
    return out;
  }, [ok, selection, declared, mission.payloadKg, v.altitudeM]);

  /* Endurance against the declared usable fraction. */
  const usableSweep = useMemo(() => {
    if (!ok) return [];
    const out = [];
    for (let f = 0.5; f <= 1.001; f += 0.05) {
      out.push({ usable: f, minutes: result.endurance.totalWh * f / result.hover.busPowerW * 60 });
    }
    return out;
  }, [ok, result]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>

      <Card title={`Pack — ${pack ? pack.model : "not assembled"}`}>
        {!pack ? <div style={{ fontSize: T.label, color: SC.muted }}>{built.packError}</div> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: S.sm }}>
              <Kpi label="Energy" value={num(pack.energyWhPublished, 1)} unit="Wh" sub={energy?.source} />
              <Kpi label="Nominal" value={num(pack.voltagePrintedV, 1)} unit="V" sub={`${pack.cellsSeries}S${pack.cellsParallel}P`} />
              <Kpi label="Mass" value={num(pack.massG, 0)} unit="g" sub={`${num(100 * pack.overheadFraction, 0)} % overhead declared`} />
              <Kpi label="Capacity" value={num(pack.capacityMah / 1000, 2)} unit="Ah" />
              {ok ? <Kpi label="Usable" value={num(result.endurance.usableWh, 1)} unit="Wh"
                         sub={`at ${num(100 * declared.usableFraction, 0)} %`} /> : null}
              {ok ? <Kpi label="Packs" value={result.massBreakdown.packs} unit="" /> : null}
            </div>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginTop: S.sm }}>
              {pack.massNote}
            </div>
          </>
        )}
      </Card>

      <Card title="The voltage field is not always the nominal">
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
          Energy is capacity times the <b>mean discharge</b> voltage. Vendors sometimes print the
          <b> charged</b> voltage in the same field, and the two differ by about 14 % on a LiPo.
          Every surveyed pack is checked: does Ah × V reproduce the published Wh?
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th()}>Pack</th><th style={th(true)}>Ah×V</th><th style={th(true)}>published Wh</th>
            <th style={th(true)}>error</th><th style={th(true)}>V/cell</th><th style={th()}>verdict</th>
          </tr></thead>
          <tbody>
            {VEHICLE_BATTERIES.map((b) => {
              const bad = b.audit.consistent === false;
              return (
                <tr key={b.id} style={{ background: bad ? `${SC.caution}14` : "transparent" }}>
                  <td style={{ ...td(), fontSize: 11 }}>{b.manufacturer} {b.model}</td>
                  <td style={td(true)}>{num(b.audit.ahTimesVprintedWh, 1)}</td>
                  <td style={td(true)}>{b.energyWhPublished == null ? "—" : num(b.energyWhPublished, 1)}</td>
                  <td style={{ ...td(true), color: bad ? SC.caution : SC.muted, fontWeight: bad ? 600 : 400 }}>
                    {b.audit.errorPct == null ? "—" : `${num(b.audit.errorPct, 1)} %`}
                  </td>
                  <td style={td(true)}>{num(b.audit.perCellPrintedV, 2)}</td>
                  <td style={{ ...td(), fontSize: 10, color: bad ? SC.caution : SC.muted }}>
                    {b.audit.consistent == null ? "no published Wh — Ah×V is DERIVED"
                      : bad ? b.audit.printedFieldLooksLike : "nominal"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {VOLTAGE_FIELD_ANOMALIES.map((b) => (
          <div key={b.id} style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginTop: S.sm,
                                    borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
            {b.voltageFieldFinding}
          </div>
        ))}
      </Card>

      {discharge ? (
        <Card title="Discharge demand against the published rating">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={td()}>Current demanded, per pack</td><td style={td(true)}>{num(discharge.currentA, 1)} A</td></tr>
              <tr><td style={td()}>Published continuous limit</td>
                  <td style={td(true)}>{discharge.stated ? `${num(discharge.maxA, 1)} A` : "NOT PUBLISHED"}</td></tr>
              <tr><td style={td()}>C rate demanded</td><td style={td(true)}>{num(discharge.cRateDemanded, 2)} C</td></tr>
              <tr><td style={td()}>Verdict</td>
                  <td style={{ ...td(true), color: discharge.within === false ? SC.caution : discharge.within ? "#54c7a8" : SC.muted, fontWeight: 600 }}>
                    {discharge.within === null ? "UNKNOWN" : discharge.within ? "within" : "EXCEEDED"}
                  </td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: T.label, color: SC.muted, marginTop: 6, lineHeight: 1.5 }}>
            {discharge.stated
              ? `From the ${discharge.source}.`
              : "The vendor publishes neither a continuous discharge current nor a C rating for this cell, so this reads UNKNOWN — never as unlimited."}
          </div>
        </Card>
      ) : null}

      {ok ? (
        <>
          <Card title="Endurance against payload — re-sized at every point">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={payloadSweep} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis dataKey="payloadKg" {...axis} type="number"
                  label={{ value: "payload (kg)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
                <YAxis yAxisId="l" {...axis}
                  label={{ value: "hover endurance (min)", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" {...axis}
                  width={46} label={{ value: "all-up kg", angle: 90, position: "insideRight", fill: SC.muted, fontSize: 11 }} />
                <Tooltip formatter={(x, n) => [num(+x, 2), n]} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="l" type="monotone" dataKey="minutes" stroke="#4ea1ff" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} name="endurance" />
                <Line yAxisId="r" type="monotone" dataKey="massKg" stroke="#9b8cff" strokeWidth={2} dot={false} isAnimationActive={false} name="all-up mass" />
                <ReferenceDot yAxisId="l" x={mission.payloadKg} y={result.endurance.minutes} r={5} fill={SC.caution} stroke="none" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
              Each point is a full re-size, not a scaling of one answer — the pack count is a step
              function of payload, so the curve has genuine steps in it. Payloads the airframe
              cannot lift are absent rather than extrapolated.
            </div>
          </Card>

          <Card title="How much the declared usable fraction moves the answer">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={usableSweep} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis dataKey="usable" {...axis} type="number" domain={[0.5, 1]}
                  label={{ value: "usable fraction (declared)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
                <YAxis {...axis} label={{ value: "minutes", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <Tooltip formatter={(x) => `${num(+x, 1)} min`} />
                <Line type="monotone" dataKey="minutes" stroke="#f2a33c" strokeWidth={2.5} dot={false} isAnimationActive={false} name="endurance" />
                <ReferenceLine x={0.85} stroke={SC.caution} strokeDasharray="4 3"
                  label={{ value: "Dai 0.85", fill: SC.caution, fontSize: 10, position: "top" }} />
                <ReferenceDot x={declared.usableFraction} y={result.endurance.minutes} r={5} fill={SC.caution} stroke="none" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
              This axis is <b>declared, not measured</b>. No manufacturer page in the survey states
              a discharge cut-off, and the two cited criteria disagree in kind:
              {USABLE_FRACTION_SOURCES.map((s, i) => (
                <span key={i}> {s.basis === "capacity fraction"
                  ? <> <b>{s.value}</b> as a capacity fraction ({s.source})</>
                  : <> and a <b>{s.verbatim}</b> voltage criterion ({s.source}), which carries no
                      fraction because converting it needs a discharge curve nobody publishes</>}</span>
              ))}. The slope here is the cost of that disagreement.
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
