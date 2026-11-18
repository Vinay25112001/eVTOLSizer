/* =====================================================================
   MISSION FLIGHT — 3D, true scale
   =====================================================================
   The 2D animation above draws the path to scale and the aircraft not
   to scale. This draws both to scale: the sized aircraft, built from
   the same faces as the layout view and the .vsp3 export, flying the
   sized mission at its true heights and distances. Only the clock is
   compressed, and the rate is on the control.

   Every number on it is missionPathAt's. The view adds no motion of its
   own: the aircraft is level (no attitude is computed), it does not ease
   between phases (the sizing steps), and where the sizing steps from
   hovering to wing-borne flight the view STOPS and says what the step
   is, instead of drawing a conversion nothing in the tool computes.

   three.js is loaded only when this panel scrolls into view.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC, DARK } from "../../lib/theme.js";
import { Panel } from "../../ui/primitives.jsx";
import { aircraftGeometry } from "../../engine/geometry.js";
import { CONFIGURATIONS } from "../../engine/configuration.js";
import { NOT_MODELLED, PHASES, PHASE_LABEL, missionPathSamples, groundTrackM } from "../../engine/mission-path.js";
import {
  airframeParts, boundsOf, conversionOf, conversionSentence, flightFrame, flightRefusal, rotorTurns,
  transitionsOf, DISC_COLOURS, NACELLE_AIRPLANE_DEG, NACELLE_HELICOPTER_DEG,
} from "./flight-view.js";

const RATES = [1, 5, 20, 40];
const DEFAULT_RATE = 20;
const CAMS = [["chase", "Chase"], ["side", "Side"], ["orbit", "Orbit"]];
const FLOWN = PHASES.slice(0, 5);

const btn = (on) => ({
  background: on ? SC.blue : "transparent", color: on ? SC.bg : SC.text,
  border: `1px solid ${on ? SC.blue : SC.border}`, borderRadius: 4,
  padding: "3px 9px", fontSize: 11, cursor: "pointer",
});
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const kw = (x) => `${Math.round(x)} kW`;
const speedLine = (s) => (s.phase === "TO" || s.phase === "Land" ? `vertical speed ${s.speedMS.toFixed(1)} m/s` : `airspeed ${s.speedMS.toFixed(1)} m/s`);
const powerLine = (s) => `${kw(s.powerKW)} ${s.powerKind === "shaft" ? "shaft (Phov, F-13)" : "electrical"}`;

/* `initialTransition` opens the view stopped at that transition, for the
   render gate, which cannot press play; the page never passes it. */
export function MissionFlight3D({ params, SR, initialTransition = null }) {
  const refusal = useMemo(() => flightRefusal(SR), [SR]);
  const tPhases = SR?.tPhases;
  const flownEnd = refusal ? 0 : tPhases[5];

  const geo = useMemo(() => (refusal ? null : aircraftGeometry(params, SR)), [params, SR, refusal]);
  const conv = useMemo(() => conversionOf(geo), [geo]);
  const variants = useMemo(() => {
    if (!geo) return null;
    const heli = airframeParts(geo, NACELLE_HELICOPTER_DEG);
    return { heli, plane: conv.tilting ? airframeParts(geo, NACELLE_AIRPLANE_DEG) : heli };
  }, [geo, conv.tilting]);
  const bounds = useMemo(() => (variants ? boundsOf(variants.heli) : null), [variants]);
  const profile = useMemo(() => (geo ? missionPathSamples(SR, params, 400).filter((s) => s.flown).map((s) => [s.groundM, s.altitudeAglM]) : []), [geo, SR, params]);
  const trackM = useMemo(() => (geo ? groundTrackM(SR) : 0), [geo, SR]);
  const transitions = useMemo(() => (geo ? transitionsOf(SR, params) : []), [geo, SR, params]);

  const [pending, setPending] = useState(() => (initialTransition != null ? transitions[initialTransition] ?? null : null));
  const [t, setT] = useState(() => (pending ? pending.t - 1e-3 : 0));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [cam, setCam] = useState("chase");
  const [stopAtTransitions, setStopAtTransitions] = useState(true);
  const [wanted, setWanted] = useState(false);
  const [mod, setMod] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [narrow, setNarrow] = useState(false);
  const wrapRef = useRef(null), hostRef = useRef(null), sceneRef = useRef(null), tRef = useRef(0);
  tRef.current = t;
  const dark = SC.bg === DARK.bg;

  /* Load three.js when the panel is on screen, not when the tab opens. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || wanted) return;
    if (typeof window.IntersectionObserver !== "function") { setWanted(true); return; }
    const io = new window.IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setWanted(true); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [wanted, geo]);
  useEffect(() => {
    if (!wanted || mod) return;
    let live = true;
    import("./flight-scene.js").then((m) => live && setMod(m)).catch((e) => live && setLoadError(String(e?.message || e)));
    return () => { live = false; };
  }, [wanted, mod]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof window.ResizeObserver !== "function") return;
    const ro = new window.ResizeObserver(() => setNarrow(el.clientWidth < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, [geo]);

  /* A new aircraft or mission starts the flight over (not the first one,
     which starts wherever the props put it). */
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    setT(0); setPlaying(false); setPending(null);
  }, [variants, profile]);

  const frame = useMemo(() => (refusal ? null : flightFrame(SR, params, Math.min(t, flownEnd))), [SR, params, t, flownEnd, refusal]);
  const active = frame && variants ? (frame.nacelleTiltDeg === NACELLE_AIRPLANE_DEG ? variants.plane : variants.heli) : null;
  const turning = useMemo(() => (active && frame ? active.rotors.map((r) => rotorTurns(r, frame.mode)) : []), [active, frame]);

  /* A FRESH CANVAS FOR EVERY SCENE. A new sizing rebuilds the scene, and
     the old one releases its WebGL context on the way out; a renderer
     created on that same canvas afterwards gets the dead context and
     fails. So the canvas is made here and removed with its scene. */
  useEffect(() => {
    const host = hostRef.current;
    if (!mod || !variants || !host) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", `3D flight of the sized ${(CONFIGURATIONS[params.configType || "hybrid"]?.label || "aircraft").split(" —")[0]}`);
    canvas.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(canvas);
    let s;
    try {
      s = mod.mountFlight({ canvas, variants, bounds, discColours: DISC_COLOURS, profile, trackM, dark });
      setLoadError("");
    } catch (e) { canvas.remove(); setLoadError(String(e?.message || e)); return; }
    sceneRef.current = s;
    s.setCamera(cam);
    return () => { s.dispose(); sceneRef.current = null; canvas.remove(); };
  }, [mod, variants, bounds, profile, trackM, dark]);
  useEffect(() => { sceneRef.current?.setCamera(cam); }, [cam, mod]);
  useEffect(() => {
    if (frame) sceneRef.current?.setFrame({ groundM: frame.groundM, altitudeAglM: frame.altitudeAglM, nacelleTiltDeg: frame.nacelleTiltDeg, turning });
  }, [frame, turning, mod, variants]);

  /* The clock. It stops just short of a transition when asked to, so
     the aircraft is still in the state the sizing has before the step. */
  useEffect(() => {
    if (!playing || !(flownEnd > 0)) return;
    let raf, last = performance.now();
    const step = (now) => {
      /* NEVER BACKWARDS. A frame's timestamp can be earlier than the
         moment this effect started, so the first dt can be negative; it
         stepped the clock back under the transition just continued past,
         and the next frame stopped at the same transition again. */
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      const prev = tRef.current, next = prev + dt * rate;
      const hit = stopAtTransitions ? transitions.find((x) => prev < x.t && next >= x.t) : null;
      if (hit) { setT(hit.t - 1e-3); setPending(hit); setPlaying(false); return; }
      if (next >= flownEnd) { setT(flownEnd); setPlaying(false); return; }
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, flownEnd, transitions, stopAtTransitions]);

  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (pending) { setT(pending.t); setPending(null); }
    else if (t >= flownEnd) setT(0);
    setPlaying(true);
  };
  const jump = (k) => { setPending(null); setPlaying(false); setT(tPhases[PHASES.indexOf(k)]); };
  const carryOn = () => { if (!pending) return; setT(pending.t); setPending(null); setPlaying(true); };

  const title = "Mission flight — 3D, true scale";
  if (refusal) return <Panel title={title} onSave={false}><div data-refusal={refusal.kind} style={{ fontSize: 12, color: SC.muted, lineHeight: 1.5 }}>{refusal.text}</div></Panel>;

  const cfgLabel = (CONFIGURATIONS[params.configType || "hybrid"]?.label || params.configType || "").split(" —")[0];
  const font = narrow ? 10 : 12;
  const hudBox = { position: "absolute", background: dark ? "rgba(8,14,22,0.78)" : "rgba(255,255,255,0.85)", color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 6, padding: narrow ? "4px 7px" : "6px 10px", fontFamily: "ui-monospace, monospace", fontSize: font, lineHeight: 1.45, pointerEvents: "none" };

  return (
    <Panel title={title} onSave={false}>
      <div ref={wrapRef}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <button style={btn(playing)} onClick={play}>{playing ? "❚❚ pause" : "▶ play"}</button>
          {FLOWN.map((k) => <button key={k} style={btn(frame?.phase === k)} onClick={() => jump(k)}>{PHASE_LABEL[k]}</button>)}
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {RATES.map((x) => <button key={x} style={btn(rate === x)} onClick={() => setRate(x)} title={`${x} mission seconds per second`}>{x}×</button>)}
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {CAMS.map(([k, l]) => <button key={k} style={btn(cam === k)} onClick={() => setCam(k)}>{l}</button>)}
          </span>
          <label style={{ fontSize: 11, color: SC.muted, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={stopAtTransitions} onChange={(e) => setStopAtTransitions(e.target.checked)} />
            stop at each transition
          </label>
        </div>
        <input type="range" min={0} max={Math.max(1, flownEnd)} step={Math.max(0.1, flownEnd / 2000)} value={Math.min(t, flownEnd)}
          onChange={(e) => { setPlaying(false); setPending(null); setT(Number(e.target.value)); }} style={{ width: "100%" }} aria-label="mission time, 3D flight" />

        <div data-stage="flight3d" style={{ position: "relative", height: narrow ? 380 : 440, borderRadius: 6, overflow: "hidden", background: dark ? "#0d1826" : "#dce6ef", border: `1px solid ${SC.border}` }}>
          <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
          {!mod && !loadError && <div style={{ ...hudBox, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>Loading the 3D flight…</div>}
          {frame && !(narrow && pending) && (
            <>
              {/* On a phone the two top boxes stack instead of meeting in
                  the middle of a narrow stage. */}
              <div style={narrow ? { position: "absolute", left: 10, right: 10, top: 10, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, pointerEvents: "none" } : { display: "contents" }}>
                <div data-hud="phase" style={{ ...hudBox, ...(narrow ? { position: "static" } : { left: 10, top: 10 }) }}>
                  <div style={{ fontWeight: 700 }}>{frame.label}</div>
                  <div>{mmss(frame.t)} of {mmss(flownEnd)} · {rate}× clock</div>
                </div>
                <div data-hud="aircraft" style={{ ...hudBox, ...(narrow ? { position: "static" } : { right: 10, top: 10, textAlign: "right", maxWidth: 300 }) }}>
                  <div style={{ fontWeight: 700 }}>{cfgLabel}</div>
                  <div>{conv.tilting ? (frame.mode === "forward" ? "airplane mode · " : "helicopter mode · ") : ""}{turning.filter(Boolean).length} of {turning.length} rotors turning</div>
                  <div style={{ color: SC.muted }}>level: attitude not computed</div>
                </div>
              </div>
              <div data-hud="state" style={{ ...hudBox, left: 10, bottom: 10, right: narrow ? 10 : "auto" }}>
                <div>ALT {frame.altitudeAglM.toFixed(0)} m AGL · GROUND {(frame.groundM / 1000).toFixed(2)} km</div>
                <div>{speedLine(frame)}</div>
                <div>{powerLine(frame)}</div>
              </div>
            </>
          )}
          {loadError && <div style={{ ...hudBox, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: narrow ? "80%" : 380, color: SC.warning, fontFamily: "inherit" }}>The 3D flight is unavailable here: {loadError}</div>}
          {pending && (
            <div role="dialog" aria-label="Transition — not modelled" style={{ ...hudBox, pointerEvents: "auto", fontFamily: "inherit",
              ...(narrow ? { left: 8, right: 8, top: 8, bottom: 8, overflowY: "auto", fontSize: 11, padding: 12 }
                         : { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 460, fontSize: 12, padding: 14 }) }}>
              <div style={{ fontWeight: 700, fontSize: narrow ? 12 : 14, marginBottom: 4 }}>Transition — not modelled</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{pending.label}</div>
              <div style={{ fontFamily: "ui-monospace, monospace" }}>before · {speedLine(pending.before)} · {powerLine(pending.before)}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", marginBottom: 6 }}>after · {speedLine(pending.after)} · {powerLine(pending.after)}</div>
              <div style={{ color: SC.muted, marginBottom: 6 }}>
                The sizing steps from one to the other. Nothing in this tool computes how the aircraft gets between them, how long that takes or what it draws on the way, so the view stops here instead of drawing it.
              </div>
              <div style={{ color: SC.muted, marginBottom: 8 }}>{conversionSentence(conv, pending.to !== "Land")}</div>
              <button style={btn(true)} onClick={carryOn}>Continue past the step ▶</button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, color: SC.subtle, marginTop: 8, lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 6px" }}><b>Computed.</b> Position, height, speed and power at every instant are the converged sizing's mission (engine/mission-path.js), the same values the 2D animation above draws. The aircraft is this design's geometry at its true size, from the faces the layout view and the .vsp3 export are built from; the heights and the {(trackM / 1000).toFixed(1)} km ground track are true too. Only the clock is compressed, to the rate on the control. The reserve is energy held at the end, not a leg that is flown, so the flight ends at landing.</p>
          <p style={{ margin: "0 0 6px" }}><b>Power.</b> In vertical take-off and landing the readout is Phov, a rotor <b>shaft</b> power: the sizing has no motor or inverter loss in the hover chain, so it is not what the battery delivers (audit finding F-13). In every other phase it is electrical power. The label says which, every time.</p>
          <p style={{ margin: "0 0 6px" }}><b>Drawn, not computed.</b> The level attitude; rotor spin, which shows which rotors turn, not how fast; the nacelles, at the two ends of their travel only; the ground, pads, posts and sky.</p>
          <p style={{ margin: 0 }}><b>Not modelled</b>, so not drawn; why and where each is recorded is in the table under the 2D animation above: {NOT_MODELLED.map((n) => n.what.charAt(0).toLowerCase() + n.what.slice(1)).join("; ")}.</p>
        </div>
      </div>
    </Panel>
  );
}
