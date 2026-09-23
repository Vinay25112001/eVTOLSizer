/* =====================================================================
   MISSION ANIMATION — the sized mission, flown
   =====================================================================
   Every frame of this is a position mission-path.js computed from the
   converged sizing. Nothing here is keyframed, and nothing is eased:
   the model is piecewise constant between phase boundaries, so the
   drawing is too, and the speed steps at each boundary the way the
   sizing says it does.

   The panel owns the clock. The scene builder takes a time and returns
   a drawing, which is what lets a render gate ask for a frame at a
   declared moment and get the same pixels every time.

   WHAT THIS VIEW REFUSES TO SHOW is not an omission to apologise for —
   it is the reason the rest can be trusted, so it is printed on the
   page rather than buried in a tooltip.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../lib/theme.js";
import { Panel } from "../ui/primitives.jsx";
import { aircraftGeometry } from "../engine/geometry.js";
import { missionPathAt, NOT_MODELLED, PHASE_LABEL } from "../engine/mission-path.js";
import { buildMissionScene } from "./mission-scene.js";

const PHASE_KEYS = ["TO", "Climb", "Cruise", "Desc", "Land", "Res"];

/* A whole mission is half an hour. Played in real time it would be
   unwatchable, so the default compresses it to this many seconds of
   wall clock and says so on the control. */
const WALL_S = 24;

const btn = (on) => ({
  background: on ? SC.blue : "transparent",
  color: on ? SC.bg : SC.text,
  border: `1px solid ${on ? SC.blue : SC.border}`,
  borderRadius: 4, padding: "3px 9px", fontSize: 11, cursor: "pointer",
});

function Prim({ p }) {
  if (p.type === "line") {
    return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke}
      strokeWidth={p.width} strokeOpacity={p.op ?? 1} strokeDasharray={p.dash} />;
  }
  if (p.type === "polygon") {
    return <polygon points={p.pts.map((q) => `${q[0]},${q[1]}`).join(" ")}
      fill={p.fill} fillOpacity={p.op ?? 1} stroke={p.stroke} strokeWidth={p.width ?? 0.7} />;
  }
  if (p.type === "text") {
    return <text x={p.x} y={p.y} textAnchor={p.anchor} fill={p.fill} fontSize={p.size}
      transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}
      style={{ fontFamily: "ui-monospace, monospace" }}>{p.text}</text>;
  }
  return null;
}

export function MissionAnimation({ params, SR }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(null);
  const [rate, setRate] = useState(1);

  const geo = useMemo(() => aircraftGeometry(params, SR), [params, SR]);
  const tPhases = SR?.tPhases;
  const Tend = Array.isArray(tPhases) && tPhases.length > 6 ? tPhases[6] : 0;

  /* Choosing a phase jumps to its start and plays it. The window in the
     scene builder follows the same choice, so the two cannot disagree. */
  const pickPhase = (k) => {
    setPhase(k);
    if (k && Array.isArray(tPhases)) { setT(tPhases[PHASE_KEYS.indexOf(k)]); setPlaying(true); }
  };

  /* PLAYBACK COVERS THE FLIGHT, NOT THE RESERVE. On the default mission
     the reserve is 1,200 s of 1,866 — so "play" left the aircraft parked
     on the ground for two thirds of its run, which reads as a stuck
     animation rather than as a reserve. The reserve is still on the
     scrubber and still has its own button; it is just not what the
     whole-mission loop spends its time on. */
  const flownEnd = Array.isArray(tPhases) ? tPhases[5] : Tend;
  const phaseEnd = phase && Array.isArray(tPhases) ? tPhases[PHASE_KEYS.indexOf(phase) + 1] : flownEnd;
  const phaseStart = phase && Array.isArray(tPhases) ? tPhases[PHASE_KEYS.indexOf(phase)] : 0;

  useEffect(() => {
    if (!playing || !(Tend > 0)) return;
    let raf, last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT((prev) => {
        const span = Math.max(1e-6, phaseEnd - phaseStart);
        const next = prev + dt * (Tend / WALL_S) * rate;
        /* Loop within whatever is being watched — the chosen phase, or
           the whole mission — rather than stopping dead at the end. */
        return next >= phaseEnd ? phaseStart + ((next - phaseStart) % span) : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, Tend, phaseStart, phaseEnd]);

  const scene = useMemo(
    () => buildMissionScene({ geo, r: SR, p: params, t, phaseFilter: phase, w: 900, h: 340 }),
    [geo, SR, params, t, phase]);

  if (!scene.meta.ok) {
    return <Panel title="Mission animation">
      <div style={{ fontSize: 12, color: SC.muted }}>
        This result has no mission profile to fly, so nothing is drawn.
      </div>
    </Panel>;
  }

  const now = scene.meta.now || missionPathAt(SR, params, t);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <>
      <Panel title="Mission animation — the sized mission, flown">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <button style={btn(playing)} onClick={() => setPlaying(!playing)}>
            {playing ? "❚❚ pause" : "▶ play"}
          </button>
          <button style={btn(phase === null)} onClick={() => pickPhase(null)}>whole flight</button>
          {PHASE_KEYS.map((k) => (
            <button key={k} style={btn(phase === k)} onClick={() => pickPhase(k)}>
              {PHASE_LABEL[k]}
            </button>
          ))}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {[0.5, 1, 2, 4].map((x) => (
              <button key={x} style={btn(rate === x)} onClick={() => setRate(x)}>{x}×</button>
            ))}
          </span>
        </div>

        <input type="range" min={0} max={Math.max(1, Tend)} step={Math.max(0.1, Tend / 2000)}
          value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          style={{ width: "100%" }} aria-label="mission time" />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10,
                      color: SC.subtle, fontFamily: "ui-monospace, monospace", marginBottom: 6 }}>
          <span>{mmss(t)} of {mmss(Tend)}</span>
          <span>{now ? `${now.label} · ${Math.round(now.powerKW)} kW · ${now.speedMS.toFixed(1)} m/s` : ""}</span>
        </div>

        <svg viewBox="0 0 900 340" width="100%" style={{ background: SC.panel, borderRadius: 4 }}
             role="img" aria-label="mission flight profile">
          {scene.prims.map((p, i) => <Prim key={i} p={p} />)}
        </svg>

        <div style={{ fontSize: 10, color: SC.subtle, marginTop: 6, lineHeight: 1.5 }}>
          The PATH is to scale in both axes. The drawing is not: the vertical
          scale is exaggerated <b>{scene.meta.exaggeration.toFixed(0)}×</b> against the
          horizontal, because a {(scene.meta.trackM / 1000).toFixed(0)} km flight climbing
          to {Math.round(scene.meta.yTopM)} m drawn true is a horizontal line. The aircraft
          is drawn at a readable fixed size and is <b>not to scale</b> — at this
          zoom it would be a fraction of a pixel. It is drawn <b>level at every
          point</b>, because its attitude is not computed anywhere in this tool;
          the flight-path angle is carried by the path, not by the aircraft.
          Playback compresses the flight to about {WALL_S} s at 1×, and covers
          take-off to landing: the reserve is energy held at the end of the
          mission, not a leg that is flown, so the aircraft is on the ground
          for all {Math.round((Tend - flownEnd) / 60)} minutes of it. Scrub past
          the landing, or press Reserve, to see that state.
        </div>
      </Panel>

      <Panel title="What is not shown, and why">
        <div style={{ fontSize: 11, color: SC.muted, marginBottom: 8, lineHeight: 1.5 }}>
          Each of these is something a mission animation would normally show. None
          of them is computed by this tool, so none of them is drawn here. They are
          listed instead of being drawn where they would look right.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Not shown", "Why", "Where that is recorded"].map((hd) => (
              <th key={hd} style={{ textAlign: "left", fontSize: 10, color: SC.muted,
                fontWeight: 500, padding: "4px 8px", borderBottom: `1px solid ${SC.border}` }}>{hd}</th>
            ))}
          </tr></thead>
          <tbody>
            {NOT_MODELLED.map((n, i) => (
              <tr key={i}>
                <td style={{ fontSize: 11, color: SC.text, padding: "5px 8px", borderBottom: `1px solid ${SC.border}`, width: "26%" }}>{n.what}</td>
                <td style={{ fontSize: 11, color: SC.muted, padding: "5px 8px", borderBottom: `1px solid ${SC.border}` }}>{n.why}</td>
                <td style={{ fontSize: 10, color: SC.subtle, padding: "5px 8px", borderBottom: `1px solid ${SC.border}`,
                             fontFamily: "ui-monospace, monospace", width: "22%" }}>{n.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
