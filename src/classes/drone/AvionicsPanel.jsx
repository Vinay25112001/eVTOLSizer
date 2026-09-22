/* =====================================================================
   ESC & RADIO LINK — selection on published data, and its gaps
   =====================================================================
   Two selection problems that look unalike and are the same problem.

   THE ESC is chosen against a current the sizing loop computed. That
   part is arithmetic. What is not arithmetic is that 8 of 10 publish a
   burst current with NO DURATION, none publishes a BEC output, and one
   is named "45A" while its page says only "45A designed" and never
   states a continuous rating at all.

   THE RADIO is chosen against a mission radius, and the budget is
   Friis, which is not in doubt. What is in doubt is EIRP: only 1 of 15
   vendors states whether its published power is conducted or radiated,
   and the two differ by the antenna gain. So the range is COMPUTED for
   that one and BRACKETED for the rest, with the width of the bracket
   being the cost of the missing statement.

   Both panels therefore rank on what is published and say plainly what
   is not, rather than filling the gaps with typical values.
   ===================================================================== */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, LineChart, Line, Legend,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import { ESCS, RADIO_LINKS } from "../../data/drone-components.js";
import { escCandidates, ESC_KEY_FIELDS } from "./esc.js";
import {
  assessLink, conventionSurvey, bandVariants, sensitivityOptions,
  powerConvention, rangeKm, fsplDb, dBmOf,
} from "./radio.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };

export default function AvionicsPanel({ design }) {
  const { result, ok, built } = design;
  const [missionRadiusKm, setRadius] = useState(2);
  const [rxGainDbi, setRxGain] = useState(2);
  const [assumedTxGainDbi, setTxGain] = useState(2);
  const [radioIdx, setRadioIdx] = useState(0);

  /* ── ESC ─────────────────────────────────────────────────────── */
  const demandA = ok ? result.hover.esc.busCurrentA : null;
  const cells = built.pack?.cellsSeries ?? null;
  const escs = useMemo(
    () => (demandA ? escCandidates(ESCS, { busCurrentA: demandA, cells }) : []),
    [demandA, cells]);

  const escChart = escs.filter((c) => c.status.continuousCurrent.stated).map((c) => ({
    /* Model only: the manufacturer is in the table below, and the full
       string sprawled across the plot. */
    name: c.esc.model.replace(/\s*\(.*$/, "").slice(0, 20),
    rating: c.status.continuousCurrent.max, viable: c.viable, mass: c.massG,
    /* The ratio, not the rating. Absolute ratings span 40-240 A while the
       demand is 4.7 A, so on a linear axis the demand line sat on zero and
       on a log axis it fell outside the domain entirely. Rating / demand
       puts every part on one comparable scale and makes 1.0 the line that
       matters. */
    headroomX: c.status.continuousCurrent.max / demandA,
  }));

  const noBurstDuration = ESCS.filter((e) => e.burst_current_a != null && e.burst_duration_s == null).length;
  const withBurst = ESCS.filter((e) => e.burst_current_a != null).length;
  const noBec = ESCS.filter((e) => e.bec_output_v == null).length;
  const noRating = ESCS.filter((e) => e.continuous_current_a == null).length;

  /* ── RADIO ───────────────────────────────────────────────────── */
  const survey = useMemo(() => conventionSurvey(RADIO_LINKS), []);
  const assessed = useMemo(
    () => RADIO_LINKS.map((r) => ({
      entry: r, a: assessLink(r, { missionRadiusKm, rxGainDbi }),
    })), [missionRadiusKm, rxGainDbi]);

  const sel = assessed[Math.min(radioIdx, assessed.length - 1)];
  const selBands = bandVariants(sel.entry);
  const selModes = sensitivityOptions(sel.entry);

  /* Range against packet rate, for a radio that publishes sensitivity
     per mode. This is the trade the vendor actually documented. */
  const rateCurve = useMemo(() => {
    const f = sel.a.freqMHz, p = sel.entry.max_tx_power_mw;
    if (!(f > 0) || !(p > 0) || selModes.length < 2) return [];
    const eirpAsPublished = dBmOf(p);
    return selModes
      .filter((m) => m.rateHz != null)
      .map((m) => ({
        rateHz: m.rateHz, mode: m.mode, sensitivity: m.dBm,
        km: rangeKm({ eirpDbm: eirpAsPublished, rxGainDbi, sensitivityDbm: m.dBm, freqMHz: f }),
      }))
      .sort((a, b) => a.rateHz - b.rateHz);
  }, [sel, selModes, rxGainDbi]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>

      {/* ═══ ESC ═══ */}
      <Card title="ESC — ranked against the current this design draws">
        {!ok ? (
          <div style={{ fontSize: T.label, color: SC.muted }}>
            The design has not converged, so there is no current to select against.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: S.sm, marginBottom: S.sm }}>
              <Kpi label="Bus current, per rotor" value={num(demandA, 1)} unit="A" />
              <Kpi label="Pack" value={`${cells}S`} unit="" />
              <Kpi label="Viable" value={escs.filter((c) => c.viable).length} unit={`of ${ESCS.length}`} />
              <Kpi label="Lightest viable" value={num(escs.find((c) => c.viable)?.massG, 1)} unit="g" />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={escChart} margin={{ top: 8, right: 16, bottom: 74, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis dataKey="name" {...axis} angle={-34} textAnchor="end" interval={0} height={78} />
                {/* Log scale: the catalogue spans 40 A to 240 A, and on a linear
                    axis the demand line sat indistinguishably on zero. */}
                <YAxis {...axis} width={54}
                  label={{ value: "rating / demand", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <Tooltip formatter={(v, n, p) => [`${(+v).toFixed(1)}x  (${p.payload.rating} A)`, "headroom"]} />
                <ReferenceLine y={1} stroke={SC.caution} strokeDasharray="4 3"
                  label={{ value: `demand ${num(demandA, 1)} A = 1.0x`, fill: SC.caution, fontSize: 10, position: "insideTopRight" }} />
                <Bar dataKey="headroomX" isAnimationActive={false}>
                  {escChart.map((d, i) => <Cell key={i} fill={d.viable ? "#4ea1ff" : "#6b7280"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th()}>ESC</th><th style={th(true)}>cont A</th><th style={th(true)}>burst</th>
                <th style={th(true)}>mass g</th><th style={th(true)}>headroom</th>
                <th style={th(true)}>fields</th><th style={th()}>rectification</th><th style={th()}>verdict</th>
              </tr></thead>
              <tbody>
                {escs.map((c) => (
                  <tr key={c.esc.id} style={{ opacity: c.viable ? 1 : 0.55 }}>
                    <td style={{ ...td(), fontSize: 11 }}>{c.esc.manufacturer} {c.esc.model}</td>
                    <td style={td(true)}>{c.esc.continuous_current_a ?? "—"}</td>
                    <td style={td(true)}>
                      {c.esc.burst_current_a ?? "—"}
                      {c.burstStated && !c.burstDurationStated
                        ? <span style={{ color: SC.caution }} title="burst current with no duration"> ⚠</span> : null}
                    </td>
                    <td style={td(true)}>{num(c.massG, 1)}</td>
                    <td style={td(true)}>{c.headroomPct != null ? `${num(c.headroomPct, 0)} %` : "—"}</td>
                    <td style={td(true)}>{c.completeness}/{c.completenessOf}</td>
                    <td style={{ ...td(), fontSize: 11, color: c.rectification === "notStated" ? SC.caution : SC.muted }}>
                      {c.rectification}
                    </td>
                    <td style={{ ...td(), fontSize: 11, color: c.viable ? "#54c7a8" : SC.caution }}>
                      {c.viable ? "viable" : c.excludedBecause[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7, marginTop: S.sm,
                          borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
              <b>What the vendors do not publish.</b>{" "}
              <b>{noBurstDuration} of {withBurst}</b> ESCs that quote a burst current state no
              duration for it — a burst rating without a duration is a number, not a rating.{" "}
              <b>{noBec} of {ESCS.length}</b> publish no BEC output.{" "}
              <b>{noRating} of {ESCS.length}</b> publish no continuous current at all, including one
              whose model name contains “45A”: its page says only “45A designed”, and the survey
              recorded null rather than assuming that is a continuous rating.{" "}
              Ranking is by mass among the viable, because mass is the only axis every vendor
              publishes; the measured loss table is not used to rank, since it describes one
              controller and applies equally to all of them.
            </div>
          </>
        )}
      </Card>

      {/* ═══ RADIO ═══ */}
      <Card title="Radio link — computed where the convention is stated, bracketed where it is not">
        <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", alignItems: "center", marginBottom: S.sm }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>mission radius (km){" "}
            <input type="number" value={missionRadiusKm} step={0.5} min={0.1} max={200}
              onChange={(e) => setRadius(Math.max(0.1, +e.target.value))}
              style={{ width: 70, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} /></label>
          <label style={{ fontSize: T.label, color: SC.muted }}>RX antenna gain (dBi){" "}
            <input type="number" value={rxGainDbi} step={1} min={0} max={12}
              onChange={(e) => setRxGain(+e.target.value)}
              style={{ width: 60, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: S.sm, marginBottom: S.sm }}>
          <Kpi label="Radios surveyed" value={survey.total} unit="" />
          <Kpi label="State conducted vs EIRP" value={survey.statedConvention} unit={`of ${survey.total}`} />
          <Kpi label="Publish no range" value={survey.noPublishedRange} unit={`of ${survey.total}`} />
          <Kpi label="Publish no power" value={survey.noPublishedPower} unit={`of ${survey.total}`} />
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th()}>Radio</th><th style={th(true)}>MHz</th><th style={th(true)}>mW</th>
            <th style={th(true)}>sens dBm</th><th style={th()}>convention</th>
            <th style={th(true)}>free-space ceiling</th><th style={th(true)}>stated</th>
            <th style={th()}>meets {missionRadiusKm} km?</th>
          </tr></thead>
          <tbody>
            {assessed.map(({ entry, a }, i) => (
              <tr key={i} onClick={() => setRadioIdx(i)}
                  style={{ cursor: "pointer", background: i === radioIdx ? `${SC.blue}14` : "transparent" }}>
                <td style={{ ...td(), fontSize: 11 }}>{entry.manufacturer} {entry.product}</td>
                <td style={td(true)}>{num(a.freqMHz, 0)}</td>
                <td style={td(true)}>{a.maxTxPowerMw ?? "—"}</td>
                <td style={td(true)}>{a.sensitivityDbm ?? "—"}</td>
                <td style={{ ...td(), fontSize: 11, color: a.convention.stated ? "#54c7a8" : SC.caution }}>
                  {a.convention.stated ? a.convention.convention : "unstated"}
                </td>
                <td style={td(true)}>
                  {a.computed ? `${num(a.computed.rangeKm, 1)} km`
                    : a.bracket ? `${num(a.bracket.lowKm, 0)}–${num(a.bracket.highKm, 0)}` : "—"}
                </td>
                <td style={td(true)}>{a.statedRangeKm != null ? `${a.statedRangeKm}` : "—"}</td>
                <td style={{ ...td(), color: a.meetsMission === true ? "#54c7a8" : a.meetsMission === false ? "#e0574a" : SC.muted }}>
                  {a.meetsMission === true ? "yes" : a.meetsMission === false ? "NO" : "not computable"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7, marginTop: S.sm }}>
          <b>Free space is a CEILING, not a prediction.</b> There is no ground reflection here, no
          Fresnel obstruction, no fade margin and no airframe blockage; a real link is worse, often by
          10–20 dB. Every stated range in this table sits <i>below</i> its own ceiling, which is the
          check that matters — a claim <i>above</i> free space would be provably false. What the
          ceiling decides is the other direction: a radio whose ceiling is below the mission radius
          cannot fly it, whatever the conditions.
          <br />
          <b>Only {survey.statedConvention} of {survey.total} states whether its power is conducted or
          radiated</b> ({survey.statedBy.join("; ")}). EIRP = conducted − cable loss + antenna gain,
          so the two differ by the gain, and the bracket above is that difference expressed as range.
        </div>
      </Card>

      {/* ═══ SELECTED RADIO DETAIL ═══ */}
      <Card title={`${sel.entry.manufacturer} ${sel.entry.product}`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: S.sm, marginBottom: S.sm }}>
          <Kpi label="Latency" value={sel.a.latencyMs ?? "—"} unit="ms" />
          <Kpi label="Mass" value={typeof sel.a.massG === "number" ? sel.a.massG : "—"} unit="g" />
          <Kpi label="Bands" value={selBands.length} unit="" sub={selBands.map((b) => num(b.mhz, 0)).join(" / ")} />
          <Kpi label="Sensitivity modes" value={selModes.length} unit="" />
        </div>

        {rateCurve.length >= 2 ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={rateCurve} margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis dataKey="rateHz" type="number" scale="log" domain={["dataMin", "dataMax"]} {...axis}
                  label={{ value: "packet rate (Hz)", position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
                <YAxis {...axis} width={54}
                  label={{ value: "free-space ceiling (km)", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [n === "km" ? `${num(+v, 1)} km` : v, n]}
                  labelFormatter={(r) => `${r} Hz`} />
                <Line type="monotone" dataKey="km" stroke="#4ea1ff" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} name="km" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
              <b>This is the trade the vendor actually documented.</b> Sensitivity is published per
              packet rate, and it worsens as the rate rises: {num(rateCurve[0].sensitivity, 0)} dBm at{" "}
              {rateCurve[0].rateHz} Hz against {num(rateCurve[rateCurve.length - 1].sensitivity, 0)} dBm
              at {rateCurve[rateCurve.length - 1].rateHz} Hz. Range and latency trade directly against
              each other on the same hardware — a factor of{" "}
              {num(rateCurve[0].km / rateCurve[rateCurve.length - 1].km, 1)}× in ceiling across the
              published modes. Collapsing that map to one number would delete it.
            </div>
          </>
        ) : (
          <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
            This product publishes {selModes.length === 1 ? "a single sensitivity figure" : "no receiver sensitivity"},
            so no rate-versus-range trade can be drawn for it.
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: S.sm }}>
          <tbody>
            <tr><td style={td()}>Power convention</td>
                <td style={{ ...td(), fontSize: 11 }}>{sel.a.convention.verbatim ?? "not recorded"}</td></tr>
            <tr><td style={td()}>Range conditions</td>
                <td style={{ ...td(), fontSize: 11 }}>{sel.a.rangeConditions ?? "—"}</td></tr>
            {sel.a.bracket ? (
              <tr><td style={td()}>Why a bracket</td>
                  <td style={{ ...td(), fontSize: 11 }}>{sel.a.bracket.why}</td></tr>
            ) : null}
            {sel.a.statedVsComputed ? (
              <tr><td style={td()}>Stated ÷ ceiling</td>
                  <td style={{ ...td(), fontSize: 11 }}>
                    {num(sel.a.statedVsComputed.ratio, 3)} — {sel.a.statedVsComputed.note}
                  </td></tr>
            ) : null}
          </tbody>
        </table>
        {sel.a.warnings.length ? (
          <ul style={{ margin: `${S.sm}px 0 0`, paddingLeft: 18 }}>
            {sel.a.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>{w}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
