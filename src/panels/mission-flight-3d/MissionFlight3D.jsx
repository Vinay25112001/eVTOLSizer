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
  instrumentsAt, instrumentScales, flagStopsOf, firstStopBetween,
} from "./flight-view.js";
import { flightFlags, PREFLIGHT } from "./flight-checks.js";
import { Cockpit, LAMP, LAMP_STATE } from "./Cockpit.jsx";

const RATES = [1, 5, 20, 40];
const DEFAULT_RATE = 20;
const CAMS = [["chase", "Chase"], ["side", "Side"], ["orbit", "Orbit"]];
const FLOWN = PHASES.slice(0, 5);

/* Keycaps in the glass cockpit's manner (ui/glass.jsx): the chosen one lit
   in the accent, the rest flat glass. */
const btn = (on) => ({
  background: on ? SC.accent ?? SC.blue : "transparent", color: on ? SC.accentInk ?? SC.bg : SC.text,
  border: `1px solid ${on ? SC.accent ?? SC.blue : SC.rim ?? SC.border}`, borderRadius: 8,
  padding: "4px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
});
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const kw = (x) => `${Math.round(x)} kW`;
const speedLine = (s) => (s.phase === "TO" || s.phase === "Land" ? `vertical speed ${s.speedMS.toFixed(1)} m/s` : `airspeed ${s.speedMS.toFixed(1)} m/s`);
const powerLine = (s) => `${kw(s.powerKW)} ${s.powerKind === "shaft" ? "shaft (Phov, F-13)" : "electrical"}`;

/* ── The test flight's flags ───────────────────────────────────────── */
const RANK = { red: 3, amber: 2, grey: 1 };
const worst = (items) => (items ?? []).reduce((w, x) => ((RANK[x.severity] ?? 0) > (RANK[w] ?? 0) ? x.severity : w), null);
const SEV_WORD = { red: "fails", amber: "advisory", grey: "not modelled or not determinable" };
const lampText = (items) => {
  const w = worst(items);
  if (!w) return "no check flags this phase";
  const n = items.filter((x) => x.severity === w).length;
  return w === "red" ? `${n} check${n === 1 ? "" : "s"} fail${n === 1 ? "s" : ""} here` : w === "amber" ? `${n} advisor${n === 1 ? "y" : "ies"} here` : "a gap in the model here";
};
function FlagChip({ severity }) {
  return <span style={{ display: "inline-block", minWidth: 62, textAlign: "center", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase",
    color: severity === "amber" ? "#3a2a00" : "#fff", background: LAMP[severity], borderRadius: 3, padding: "1px 5px", marginRight: 6 }}>{SEV_WORD[severity] === "fails" ? "fails" : severity === "amber" ? "advisory" : "gap"}</span>;
}
function FlagList({ items }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
      {items.map((x) => (
        <li key={x.label} data-flag={x.severity} style={{ lineHeight: 1.45 }}>
          <FlagChip severity={x.severity} />{x.label}
          {x.why ? <span style={{ color: SC.muted }}> — here because {x.why}.</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* `initialTransition` opens the view stopped at that transition, and
   `initialFlag` stopped at that phase's flags, for the render gate, which
   cannot press play; the page passes neither. */
export function MissionFlight3D({ params, SR, initialTransition = null, initialFlag = null }) {
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
  /* The test flight: the sizing's failing checks, sorted by the phase
     each belongs to (flight-checks.js), and a stop just inside each
     phase that has one. Only `label`, `ok` and `kind` are read. */
  const flags = useMemo(() => (geo ? flightFlags(SR) : null), [geo, SR]);
  const flagStops = useMemo(() => (geo ? flagStopsOf(SR, flags) : []), [geo, SR, flags]);
  const scales = useMemo(() => (geo ? instrumentScales(SR, params) : null), [geo, SR, params]);

  const [pending, setPending] = useState(() => (initialTransition != null ? transitions[initialTransition] ?? null
    : initialFlag != null ? flagStops.find((s) => s.phase === initialFlag) ?? null : null));
  const [t, setT] = useState(() => (pending ? (pending.kind === "flag" ? pending.t : pending.t - 1e-3) : 0));
  const [stopAtFlags, setStopAtFlags] = useState(true);
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
      /* Transitions stop 1 ms before their boundary, flags 1 ms inside
         the phase, so at a shared boundary the transition comes first. */
      const hit = firstStopBetween([...(stopAtTransitions ? transitions : []), ...(stopAtFlags ? flagStops : [])], prev, next);
      if (hit) { setT(hit.kind === "flag" ? hit.t : hit.t - 1e-3); setPending(hit); setPlaying(false); return; }
      if (next >= flownEnd) { setT(flownEnd); setPlaying(false); return; }
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, flownEnd, transitions, stopAtTransitions, flagStops, stopAtFlags]);

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
        {flags && (() => {
          const all = [...flags[PREFLIGHT], ...FLOWN.flatMap((k) => flags[k])];
          const n = (s) => all.filter((x) => x.severity === s).length;
          const stops = FLOWN.filter((k) => worst(flags[k]) === "red");
          const marked = FLOWN.filter((k) => flags[k].length && worst(flags[k]) !== "red");
          const names = (ks) => ks.map((k, i) => <span key={k}>{i ? (i === ks.length - 1 ? " and " : ", ") : ""}<b style={{ color: LAMP[worst(flags[k])] }}>{PHASE_LABEL[k].toLowerCase()}</b></span>);
          return (
            <section data-preflight="" aria-label="Pre-flight check" className="gc-well" style={{ borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: SC.text }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", marginBottom: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" className="gc-lamp" data-state={LAMP_STATE[worst(all) ?? "green"]} />
                  <b style={{ fontSize: 12.5 }}>Test flight: pre-flight check</b>
                </span>
                <span style={{ color: SC.muted }}>
                  {all.length === 0 ? "every design check passes: this flight will not stop for one"
                    : [n("red") && `${n("red")} fail${n("red") === 1 ? "s" : ""}`, n("amber") && `${n("amber")} advisor${n("amber") === 1 ? "y" : "ies"}`, n("grey") && `${n("grey")} gap${n("grey") === 1 ? "" : "s"} in the model`].filter(Boolean).join(" · ")}
                </span>
              </div>
              {flags[PREFLIGHT].length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ color: SC.muted, marginBottom: 4 }}>On the design as a whole, before it flies:</div>
                  <FlagList items={flags[PREFLIGHT]} />
                </div>
              )}
              <div style={{ color: SC.muted, lineHeight: 1.5 }}>
                {stops.length
                  ? <>In flight, a check fails at {names(stops)}: the playback stops there with a red flag. </>
                  : "No check fails during the flight, so the playback will not stop for one. "}
                {marked.length ? <>Advisories and gaps in the model are marked at {names(marked)} without stopping. </> : null}
                Change the design on the left and fly again: the checks, the flags and the flight all follow the new sizing.
              </div>
            </section>
          );
        })()}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <button style={btn(playing)} onClick={play}>{playing ? "❚❚ pause" : "▶ play"}</button>
          {FLOWN.map((k) => {
            const w = worst(flags?.[k]);
            return (
              <button key={k} style={btn(frame?.phase === k)} onClick={() => jump(k)} title={w ? lampText(flags[k]) : undefined}>
                {w && <span aria-label={`flag: ${lampText(flags[k])}`} className="gc-lamp" data-state={LAMP_STATE[w]} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: LAMP[w], marginRight: 5, verticalAlign: "middle" }} />}
                {PHASE_LABEL[k]}
              </button>
            );
          })}
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
          <label style={{ fontSize: 11, color: SC.muted, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={stopAtFlags} onChange={(e) => setStopAtFlags(e.target.checked)} />
            stop where a check fails
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
          {pending?.kind === "flag" && (
            <div role="dialog" aria-label={`Flagged: ${pending.label}`} data-flag-stop={pending.phase} style={{ ...hudBox, pointerEvents: "auto", fontFamily: "inherit",
              border: `1px solid ${SC.rim ?? SC.border}`, borderRadius: 12,
              ...(narrow ? { left: 8, right: 8, top: 8, bottom: 8, overflowY: "auto", fontSize: 11, padding: 12 }
                         : { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 500, maxHeight: 400, overflowY: "auto", fontSize: 12, padding: 14 }) }}>
              <div style={{ fontWeight: 700, fontSize: narrow ? 12 : 14, marginBottom: 2 }}>
                <span aria-hidden="true" className="gc-lamp" data-state={LAMP_STATE[worst(pending.items)]} style={{ marginRight: 8, verticalAlign: "middle" }} />Flagged: {pending.label}
              </div>
              <div style={{ color: SC.muted, marginBottom: 8 }}>{lampText(pending.items)}. The sizing's own design checks say this about the phase you are about to fly:</div>
              <FlagList items={pending.items} />
              <div style={{ color: SC.muted, margin: "8px 0" }}>
                A failed check means the design, as sized, does not meet that requirement in this phase; its figures are in the checks list on the bar at the foot of the page.
                {pending.items.some((x) => x.severity === "amber") ? " An advisory is reported but not scored as a failure: the sizing treats it as an open question, not a verdict on the design." : ""}
                {" "}Change the design on the left and fly again to see whether the flag clears.
              </div>
              <button style={btn(true)} onClick={carryOn}>Carry on flying ▶</button>
            </div>
          )}
          {pending && pending.kind !== "flag" && (
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

        {frame && (
          <Cockpit inst={instrumentsAt(SR, frame)} scales={scales} lamp={worst(flags?.[frame.phase]) ?? "green"}
            lampText={frame.flown ? lampText(flags?.[frame.phase]) : "mission flown"} time={`${mmss(frame.t)} of ${mmss(flownEnd)}`} />
        )}

        <div style={{ fontSize: 10, color: SC.subtle, marginTop: 8, lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 6px" }}><b>Test flight.</b> The instruments read the same mission: airspeed, altitude and power are the values above, and the vertical speed is the sizing's own rate for each leg (the hover climb rate up and down, the climb and descent rates, level in cruise). The flags are the sizing's design checks, each placed in the phase its own label names: hover checks at take-off, climb, cruise and descent checks in theirs, end-of-mission checks at landing. A few labels name no phase but test one condition; each of those says why it sits where it does. Checks on the design as a whole are listed before the flight. Red is a failed check and stops the flight; amber is an advisory and grey a gap in the model, which the app does not score as failures, so they are marked but do not stop it.</p>
          <p style={{ margin: "0 0 6px" }}><b>Computed.</b> Position, height, speed and power at every instant are the converged sizing's mission (engine/mission-path.js), the same values the 2D animation above draws. The aircraft is this design's geometry at its true size, from the faces the layout view and the .vsp3 export are built from; the heights and the {(trackM / 1000).toFixed(1)} km ground track are true too. Only the clock is compressed, to the rate on the control. The reserve is energy held at the end, not a leg that is flown, so the flight ends at landing.</p>
          <p style={{ margin: "0 0 6px" }}><b>Power.</b> In vertical take-off and landing the readout is Phov, a rotor <b>shaft</b> power: the sizing has no motor or inverter loss in the hover chain, so it is not what the battery delivers (audit finding F-13). In every other phase it is electrical power. The label says which, every time.</p>
          <p style={{ margin: "0 0 6px" }}><b>Drawn, not computed.</b> The level attitude; rotor spin, which shows which rotors turn, not how fast; the nacelles, at the two ends of their travel only; the ground, pads, posts and sky.</p>
          <p style={{ margin: 0 }}><b>Not modelled</b>, so not drawn; why and where each is recorded is in the table under the 2D animation above: {NOT_MODELLED.map((n) => n.what.charAt(0).toLowerCase() + n.what.slice(1)).join("; ")}.</p>
        </div>
      </div>
    </Panel>
  );
}
