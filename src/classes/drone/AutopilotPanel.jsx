/* =====================================================================
   AUTOPILOT — the parameter files, and what is deliberately missing
   =====================================================================
   This is the only tab whose output is loaded into an aircraft that then
   flies on it, so it is laid out around the refusals rather than around
   the parameters. The "not emitted" table is not an appendix: it is the
   part a user cannot get anywhere else, because any tool can write
   FRAME_CLASS,1 and only one that has read the documentation knows to
   leave MOT_THST_HOVER alone.

   The two ecosystems are shown side by side for the same reason. They
   disagree about the hover-throttle parameter in the strongest possible
   way — ArduPilot documents setting it BELOW the true value, PX4 wants
   the true value — and a user who has only ever seen one of them will
   assume the other behaves the same way.
   ===================================================================== */
import { useMemo, useState } from "react";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";
import {
  exportContext, arduPilotParameters, px4Parameters,
  formatArduPilotParam, formatQgcParams, formatWaypoints, formatPlan,
  hoverTestMission, DEFAULT_TEST_FRACTION, PX4_AIRFRAME,
} from "./autopilot.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));

function download(filename, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* SC has no `accent`; the palette is bg/panel/inset/border plus the
   semantic colours, each measured against its own panel in theme.js.
   This follows the studio's own chip styling rather than inventing a
   token, so the contrast stays the one that file measured. */
const btn = () => ({
  fontFamily: SANS, fontSize: T.body, padding: "6px 12px", borderRadius: 3,
  background: SC.inset, color: SC.text, border: `1px solid ${SC.caution}`,
  cursor: "pointer",
});

function ParamTable({ rows }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr><th style={th()}>Parameter</th><th style={th(true)}>Value</th><th style={th()}>Why this value</th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.name}>
            <td style={{ ...td(), fontFamily: MONO }}>{p.name}</td>
            <td style={td(true)}>{p.value}</td>
            <td style={{ ...td(), color: SC.muted, fontSize: T.label }}>{p.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AutopilotPanel({ design, frame }) {
  const [homeLat, setHomeLat] = useState("");
  const [homeLon, setHomeLon] = useState("");
  const [testFraction, setTestFraction] = useState(DEFAULT_TEST_FRACTION);

  const built = useMemo(() => {
    if (!frame || !design?.ok) return null;
    try {
      const ctx = exportContext({
        frame, selection: design.selection, result: design.result,
        cell: design.built.cell, altitudeM: design.v.altitudeM,
      });
      return { ctx, ap: arduPilotParameters(ctx), px: px4Parameters(ctx) };
    } catch (e) { return { error: e.message }; }
  }, [frame, design]);

  /* Every hook runs before any early return — the mission depends on the
     export context, so it guards internally rather than being skipped. */
  const latN = parseFloat(homeLat), lonN = parseFloat(homeLon);
  const homeOk = Number.isFinite(latN) && Number.isFinite(lonN);
  const mission = useMemo(() => {
    if (!homeOk || !built || built.error) return null;
    try {
      return hoverTestMission(built.ctx, { homeLat: latN, homeLon: lonN, testFraction });
    } catch { return null; }
  }, [built, latN, lonN, homeOk, testFraction]);

  if (!frame) return <Card title="Autopilot">No frame is selected.</Card>;
  if (!built || built.error) {
    return (
      <Card title="Nothing to export yet">
        <div style={{ fontSize: T.body, color: SC.text }}>
          {built?.error ?? "The sizing run has not converged."} A parameter file describes a
          specific aircraft; until the design closes there is no aircraft to describe, and a
          file written from a partial result would be a file that flies.
        </div>
      </Card>
    );
  }

  const { ctx, ap, px } = built;
  const refusals = [...ap.refusals.map((r) => ({ ...r, who: "ArduPilot" })),
                    ...px.refusals.map((r) => ({ ...r, who: "PX4" }))];
  const notes = [...ap.notes, ...px.notes];
  const airframe = PX4_AIRFRAME[`${frame.frameClass}/${frame.frameType}`];

  const stamp =`${frame.frameClass}-${frame.frameType}-${ctx.massKg.toFixed(2)}kg`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md, maxWidth: 1100 }}>

      <div style={{ display: "flex", gap: S.md, flexWrap: "wrap" }}>
        <Kpi label="All-up mass" value={num(ctx.massKg, 2)} unit="kg" />
        <Kpi label="Rotors" value={ctx.rotors} sub={`${frame.frameClass}/${frame.frameType}`} />
        <Kpi label="Propeller" value={num(ctx.propDiameterIn)} unit="in"
             sub="sets the published tuning tables" />
        <Kpi label="Hover thrust" value={num(100 * ctx.hoverThrustFraction, 0)} unit="%"
             sub="of measured maximum" />
        <Kpi label="Hover endurance" value={num(ctx.enduranceMin)} unit="min" />
      </div>

      <Card title="ArduPilot — Mission Planner .param">
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
          Comma separated, <code style={{ fontFamily: MONO }}>NAME,VALUE</code>, the format of
          ArduPilot's own shipped frame files. Mission Planner does not apply it automatically:
          Load from File, review the diff, then Write Params.
        </div>
        <ParamTable rows={ap.params} />
        <div style={{ marginTop: S.sm }}>
          <button type="button" style={btn()}
            onClick={() => download(`${stamp}.param`, "text/plain", formatArduPilotParam(ctx, ap))}>
            Download .param
          </button>
        </div>
      </Card>

      <Card title="PX4 — QGroundControl .params">
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
          A different format, not a different extension: TAB separated, five columns, with a
          MAV_PARAM_TYPE on every row. {airframe
            ? <>PX4 selects the layout from a catalogue rather than composing it, and this one is{" "}
              <code style={{ fontFamily: MONO }}>{airframe.id}</code> “{airframe.name}”.</>
            : <>PX4 has no generic airframe for {frame.frameClass}/{frame.frameType}, so it cannot
              express this layout at all — see below.</>}
        </div>
        <ParamTable rows={px.params} />
        <div style={{ marginTop: S.sm }}>
          <button type="button" style={btn()}
            onClick={() => download(`${stamp}.params`, "text/plain", formatQgcParams(ctx, px))}>
            Download .params
          </button>
        </div>
      </Card>

      <Card title="Not emitted, and why">
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
          Each of these is a parameter this tool could fill in and has decided not to. The reason
          is the point: a refusal with a source behind it is a result.
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr><th style={th()}>Parameter</th><th style={th()}>Ecosystem</th><th style={th()}>Why not</th></tr>
          </thead>
          <tbody>
            {refusals.map((r, i) => (
              <tr key={i}>
                <td style={{ ...td(), fontFamily: MONO, whiteSpace: "normal" }}>{r.name}</td>
                <td style={td()}>{r.who}</td>
                <td style={{ ...td(), color: SC.muted, fontSize: T.label }}>{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {notes.length > 0 && (
        <Card title="Carried with the numbers">
          <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: T.label, color: SC.text }}>
            {notes.map((n, i) => <li key={i} style={{ marginBottom: 6 }}>{n}</li>)}
          </ul>
        </Card>
      )}

      <Card title="Hover endurance test mission">
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: S.sm }}>
          The only mission this tool is entitled to write: it computed a hover endurance, and this
          is that number made flyable. The coordinates are yours — they are not sizing outputs, so
          nothing is exported until you give a home position.
        </div>
        <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap", alignItems: "flex-end", marginBottom: S.sm }}>
          <label style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
            Home latitude<br />
            <input value={homeLat} onChange={(e) => setHomeLat(e.target.value)} placeholder="39.7800"
              style={{ fontFamily: MONO, fontSize: T.body, padding: 4, width: 140 }} />
          </label>
          <label style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
            Home longitude<br />
            <input value={homeLon} onChange={(e) => setHomeLon(e.target.value)} placeholder="-84.0630"
              style={{ fontFamily: MONO, fontSize: T.body, padding: 4, width: 140 }} />
          </label>
          <label style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
            Fraction of endurance to fly<br />
            <input type="range" min={0.1} max={1} step={0.05} value={testFraction}
              onChange={(e) => setTestFraction(parseFloat(e.target.value))} style={{ width: 160 }} />
            <span style={{ fontFamily: MONO, marginLeft: 8 }}>{(100 * testFraction).toFixed(0)} %</span>
          </label>
        </div>

        {mission ? (
          <>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr><th style={th()}>#</th><th style={th()}>Command</th><th style={th()}>What it does</th></tr>
              </thead>
              <tbody>
                {mission.items.map((it, i) => (
                  <tr key={i}>
                    <td style={td(true)}>{i}</td>
                    <td style={{ ...td(), fontFamily: MONO }}>{it.command}</td>
                    <td style={td()}>{it.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: T.label, color: SC.muted, marginTop: S.sm }}>
              The hover is <b>{mission.loiterS} s</b>, not the full {num(ctx.enduranceMin)} min.
              MAVLink defines the loiter clock as starting “only ... once Lat, Lon and Alt is
              reached”, so it excludes the climb and says nothing about the descent, while the
              computed endurance covers the whole time the pack is delivering hover power. Asking
              for the full figure would schedule a landing that begins after the energy budget has
              run out. This leaves <b>{num(mission.reserveMin)} min</b> unspent.
            </div>
            <div style={{ marginTop: S.sm, display: "flex", gap: S.sm, flexWrap: "wrap" }}>
              <button type="button" style={btn()}
                onClick={() => download(`${stamp}.waypoints`, "text/plain", formatWaypoints(mission))}>
                Download .waypoints
              </button>
              <button type="button" style={btn()}
                onClick={() => download(`${stamp}-ardupilot.plan`, "application/json",
                  formatPlan(ctx, mission, { firmware: "ardupilot" }))}>
                Download .plan (ArduPilot)
              </button>
              <button type="button" style={btn()}
                onClick={() => download(`${stamp}-px4.plan`, "application/json",
                  formatPlan(ctx, mission, { firmware: "px4" }))}>
                Download .plan (PX4)
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: T.body, color: SC.muted }}>
            Enter a home latitude and longitude to build the mission.
          </div>
        )}
      </Card>
    </div>
  );
}
