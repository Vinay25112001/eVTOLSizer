/* =====================================================================
   TRADE PANEL — the front is the answer; the ranking is your opinion
   =====================================================================
   The two halves of this tab are deliberately unequal in authority.

   THE PARETO FRONT is a fact about the candidate set. A design off the
   front is beaten by something on every objective at once and can be
   discarded without an argument. Nothing is weighted to produce it.

   THE RANKING is an opinion, produced by weights the user sets. It is
   drawn second, smaller, and carries the sensitivity of its own winner:
   how far each weight has to move before a different design wins. A
   winner that flips when a weight moves 10 % is not a winner, and the
   panel says so rather than printing a number with a trophy on it.

   THE REJECTED CANDIDATES ARE SHOWN. A trade study that quietly drops
   two thirds of its space has produced a conclusion about its filter.
   ===================================================================== */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ZAxis, Legend,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, th, td } from "../ui-kit.jsx";
import { PROPELLERS } from "../../data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../../data/drone-components.js";
import { enumerateDesigns, paretoFront, rankByWeights, OBJECTIVES, discriminatingObjectives } from "./trade.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));

const AXES = ["massKg", "enduranceMin", "thrustMargin", "hoverPowerW", "specificPowerWPerKg"];

export default function TradePanel({ mission, declared, altitudeM = 0, onSelect }) {
  const [x, setX] = useState("massKg");
  const [y, setY] = useState("enduranceMin");
  const [weights, setWeights] = useState({ massKg: 1, enduranceMin: 2, thrustMargin: 1 });
  const [sizeBand, setSizeBand] = useState([0.20, 0.48]);
  const [running, setRunning] = useState(false);
  const [study, setStudy] = useState(null);

  const pools = useMemo(() => ({
    propellers: PROPELLERS.filter((p) => p.static?.length >= 4
      && p.diameterM >= sizeBand[0] && p.diameterM <= sizeBand[1]),
    motors: MODELLABLE_MOTORS,
    escs: ESCS,
    cells: BATTERIES.filter((b) => b.capacity_wh > 0 && b.mass_g > 0 && b.cell_count_series === 1),
  }), [sizeBand]);

  const run = () => {
    setRunning(true);
    /* Synchronous: the enumeration is bounded and fast enough that a
       worker would add more complexity than it removes. */
    setTimeout(() => {
      const s = enumerateDesigns({
        mission, declared, pools,
        options: { propellerMassG: 45, packOverhead: 0.15, altitudeM, maxCandidates: 6000 },
      });
      setStudy(s);
      setRunning(false);
    }, 0);
  };

  const front = useMemo(() => (study?.designs?.length ? paretoFront(study.designs, AXES) : []), [study]);
  const frontIds = useMemo(() => new Set(front.map((d) => d.id)), [front]);
  const ranking = useMemo(() => {
    if (!front.length) return null;
    try { return rankByWeights(front, weights); } catch { return null; }
  }, [front, weights]);
  const discrim = useMemo(
    () => (study?.designs?.length ? discriminatingObjectives(study.designs, AXES) : []), [study]);

  const scatter = (study?.designs ?? []).map((d) => ({
    x: d[x], y: d[y], id: d.id, onFront: frontIds.has(d.id),
    prop: d.propellerDiameterIn, rotors: d.rotors,
  }));

  const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
      <Card title="Trade study">
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
          Enumerates every combination of measured propeller, modellable motor, rotor count and
          pack configuration; sizes each one through the whole measured chain; and keeps the
          reason for every one that fails. The ESC is chosen per candidate as the lightest whose
          <i> published </i>rating covers the current.
        </div>
        <div style={{ display: "flex", gap: S.sm, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>
            propeller band (in){" "}
            <input type="number" value={(sizeBand[0] / 0.0254).toFixed(0)} step={1} min={2} max={24}
              onChange={(e) => setSizeBand([Math.max(0.05, +e.target.value * 0.0254), sizeBand[1]])}
              style={{ width: 54, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} />
            {" – "}
            <input type="number" value={(sizeBand[1] / 0.0254).toFixed(0)} step={1} min={3} max={24}
              onChange={(e) => setSizeBand([sizeBand[0], Math.max(0.06, +e.target.value * 0.0254)])}
              style={{ width: 54, background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                       borderRadius: 4, padding: "3px 5px", fontFamily: MONO }} />
          </label>
          <span style={{ fontSize: T.label, color: SC.muted }}>
            {pools.propellers.length} propellers × {pools.motors.length} motors × {pools.cells.length} cells
          </span>
          <button onClick={run} disabled={running}
            style={{ background: SC.teal, color: SC.bg, border: "none", borderRadius: 4,
                     padding: "6px 14px", fontSize: T.body, fontWeight: 600, cursor: running ? "wait" : "pointer",
                     fontFamily: SANS }}>
            {running ? "enumerating…" : "Run trade study"}
          </button>
        </div>
      </Card>

      {study == null ? null : study.designs.length === 0 ? (
        <Card title="No design met the mission">
          <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
            {study.evaluated} combinations were evaluated and none closed. The reasons are below —
            they are the result, not a failure to produce one.
          </div>
          <RejectTable study={study} />
        </Card>
      ) : (
        <>
          <Card title={`Pareto front — ${front.length} undominated of ${study.designs.length} feasible`}>
            <div style={{ display: "flex", gap: S.sm, marginBottom: S.sm, flexWrap: "wrap" }}>
              <AxisPick label="x" value={x} onChange={setX} />
              <AxisPick label="y" value={y} onChange={setY} />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 26, left: 6 }}>
                <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                <XAxis type="number" dataKey="x" {...axis} domain={["auto", "auto"]}
                  label={{ value: `${OBJECTIVES[x].label} (${OBJECTIVES[x].units})`,
                           position: "insideBottom", offset: -14, fill: SC.muted, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" {...axis} domain={["auto", "auto"]}
                  label={{ value: `${OBJECTIVES[y].label} (${OBJECTIVES[y].units})`,
                           angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                <ZAxis range={[28, 28]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }}
                  formatter={(val, name) => [num(val, 2), name === "x" ? OBJECTIVES[x].label : OBJECTIVES[y].label]}
                  labelFormatter={() => ""} />
                <Scatter data={scatter} isAnimationActive={false}>
                  {scatter.map((p, i) => (
                    <Cell key={i} fill={p.onFront ? SC.caution : "#3b4759"} fillOpacity={p.onFront ? 1 : 0.55} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
              <span style={{ color: SC.caution }}>■</span> on the front —
              nothing beats these on every objective at once.{" "}
              <span style={{ color: "#3b4759" }}>■</span> dominated — each is strictly worse than
              something on the front, and can be discarded without taking a position.
              The front is computed over all {AXES.length} objectives, not only the two plotted,
              so a point can look dominated here and still be on it.
            </div>
          </Card>

          <Card title="Which objectives actually discriminate?">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th()}>Objective</th><th style={th(true)}>min</th>
                <th style={th(true)}>max</th><th style={th(true)}>spread</th><th style={th()}>source</th>
              </tr></thead>
              <tbody>
                {discrim.map((d) => (
                  <tr key={d.objective}>
                    <td style={td()}>{OBJECTIVES[d.objective].label}</td>
                    <td style={td(true)}>{num(d.min, 2)}</td>
                    <td style={td(true)}>{num(d.max, 2)}</td>
                    <td style={td(true)}>{d.spreadPct == null ? "—" : `${num(d.spreadPct, 0)} %`}</td>
                    <td style={{ ...td(), fontSize: 10, color: SC.muted }}>{OBJECTIVES[d.objective].from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Ranking — this half is an opinion">
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: S.sm }}>
              Weights are yours. Change one and the winner may change; that is the point of showing
              the front first.
            </div>
            <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", marginBottom: S.sm }}>
              {Object.keys(weights).map((k) => (
                <label key={k} style={{ fontSize: T.label, color: SC.muted }}>
                  {OBJECTIVES[k].label}{" "}
                  <input type="range" min={0} max={5} step={0.5} value={weights[k]}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: +e.target.value }))} />
                  <span style={{ fontFamily: MONO, color: SC.text }}> {weights[k]}</span>
                </label>
              ))}
            </div>
            {ranking == null ? null : (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th()}>#</th><th style={th()}>Propeller</th><th style={th()}>Motor</th>
                    <th style={th(true)}>N</th><th style={th(true)}>mass</th><th style={th(true)}>endur</th>
                    <th style={th(true)}>T/W</th><th style={th(true)}>W/kg</th><th style={th(true)}>score</th>
                  </tr></thead>
                  <tbody>
                    {ranking.ranked.slice(0, 10).map((d, i) => (
                      <tr key={d.id} onClick={() => onSelect && onSelect(d)}
                          style={{ cursor: onSelect ? "pointer" : "default",
                                   background: i === 0 ? `${SC.caution}18` : "transparent" }}>
                        <td style={td(true)}>{i + 1}</td>
                        <td style={{ ...td(), fontSize: 11 }}>{num(d.propellerDiameterIn, 1)}in {d.propeller.id.slice(0, 22)}</td>
                        <td style={{ ...td(), fontSize: 11 }}>{d.motor.model}</td>
                        <td style={td(true)}>{d.rotors}</td>
                        <td style={td(true)}>{num(d.massKg, 2)}</td>
                        <td style={td(true)}>{num(d.enduranceMin, 1)}</td>
                        <td style={td(true)}>{num(d.thrustMargin, 2)}</td>
                        <td style={td(true)}>{num(d.specificPowerWPerKg, 0)}</td>
                        <td style={td(true)}>{num(d.score, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: S.sm, borderTop: `1px solid ${SC.border}`, paddingTop: S.sm }}>
                  <div style={{ fontSize: T.label, color: SC.text, fontWeight: 600, marginBottom: 4 }}>
                    How firm is that winner?
                  </div>
                  {ranking.sensitivity.map((s) => (
                    <div key={s.objective} style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
                      {OBJECTIVES[s.objective].label}:{" "}
                      {s.firm
                        ? "the winner holds across a 20× change in this weight"
                        : <span style={{ color: SC.caution }}>
                            the winner changes when this weight moves by ×{num(s.winnerChangesAtFactor, 2)}
                          </span>}
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: SC.muted, lineHeight: 1.5, marginTop: 6 }}>
                    {ranking.normalisation.caveat}
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card title={`Rejected — ${study.rejected.length} combinations, and why`}>
            <RejectTable study={study} />
          </Card>
        </>
      )}
    </div>
  );
}

function AxisPick({ label, value, onChange }) {
  return (
    <label style={{ fontSize: T.label, color: SC.muted }}>
      {label}{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: SC.bg, color: SC.text, border: `1px solid ${SC.border}`,
                 borderRadius: 4, padding: "3px 6px", fontSize: T.label, fontFamily: SANS }}>
        {AXES.map((k) => <option key={k} value={k}>{OBJECTIVES[k].label}</option>)}
      </select>
    </label>
  );
}

function RejectTable({ study }) {
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th()}>Reason</th><th style={th(true)}>count</th></tr></thead>
        <tbody>
          {study.rejectionReasons.slice(0, 12).map((r) => (
            <tr key={r.reason}>
              <td style={{ ...td(), fontSize: 11 }}>{r.reason}</td>
              <td style={td(true)}>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: T.label, color: SC.muted, marginTop: 6, lineHeight: 1.5 }}>
        {study.evaluated} combinations evaluated. {study.note}
      </div>
    </>
  );
}
