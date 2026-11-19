/* =====================================================================
   BUILD — the guided drone build (Drone Sizer · Build)
   =====================================================================
   Ten steps, parts to review, over the ONE design the whole studio reads
   (design-state.js): picking a part here is the same edit as picking it
   on the Sizing tab, and the sizing re-closes as you go. Every number on
   the sheet is sizeDrone()'s result, never one this tab works out.

   The workbench is a drawing (drone-parts.js lists what is to scale and
   what is not): the parts on a cutting mat ruled in true centimetres,
   assembled step by step. It is loaded with three.js only when this tab
   opens, onto a fresh canvas each time.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { T, S, MONO, SANS } from "../../../ui/tokens.js";
import { Kpi } from "../../ui-kit.jsx";
import { FRAME_CLASSES, framesOfClass } from "../../../data/drone-frames.js";
import { MODELLABLE_MOTORS, BLDC_MOTORS, ESCS, BATTERIES, FLIGHT_CONTROLLERS } from "../../../data/drone-components.js";
import { PROP_CHOICES } from "../design-state.js";
import { buildAirframe } from "../geometry3d.js";
import FrameDiagram from "../FrameDiagram.jsx";
import { BUILD_STEPS, rotorMismatch, massLabelG, stepSummary, isFourInOne, stepNeeds, stepActions, billOfMaterials, partFacts } from "./build-steps.js";

const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const MASS_COLOURS = { Payload: "#4ea1ff", Structure: "#9b8cff", Avionics: "#54c7a8", Propulsion: "#f2a33c", Battery: "#e0574a" };
const COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";
const pad2 = (i) => String(i + 1).padStart(2, "0");
/* The workbench yellow: badges, the active step and the next-step button.
   One colour in both themes, always under dark ink (about 10:1). Text that
   must stay readable on the panel uses the theme's SC.caution instead. */
const ACC = "#F2B23A", ACC_INK = "#1A1405";

function btn(primary, on = false) {
  return { padding: "7px 14px", fontSize: T.label, borderRadius: 6, cursor: "pointer", fontFamily: SANS,
    background: primary ? ACC : on ? SC.inset : "transparent", color: primary ? ACC_INK : SC.text,
    border: `1px solid ${primary ? ACC : on ? ACC : SC.border}`, fontWeight: primary ? 700 : 500 };
}
/* Functions, not constants: SC is the live theme object (theme.js mutates
   it in place), so a style built at import time keeps the first theme. */
const panelBox = () => ({ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.12)" });
const kickerStyle = () => ({ fontSize: T.micro, letterSpacing: "0.16em", textTransform: "uppercase", color: SC.muted, fontFamily: COND, fontWeight: 600 });

function PartCard({ on, onClick, title, lines, foot, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ textAlign: "left", cursor: "pointer", fontFamily: SANS, background: on ? SC.inset : SC.panel,
               border: `1px solid ${on ? ACC : SC.border}`, borderRadius: 8, padding: S.sm, color: SC.text,
               boxShadow: on ? `0 0 0 1px ${ACC}` : "none", display: "flex", flexDirection: "column", gap: 4, minHeight: 74 }}>
      {children}
      <div style={{ fontSize: T.body, fontWeight: 600, lineHeight: 1.3 }}>{on ? "✓ " : ""}{title}</div>
      {lines.filter(Boolean).map((l, i) => (
        <div key={i} style={{ fontSize: T.micro, color: SC.muted, fontFamily: MONO, lineHeight: 1.4 }}>{l}</div>
      ))}
      {foot && <div style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.4 }}>{foot}</div>}
    </button>
  );
}

function NumberField({ label, unit, value, onChange, step = 1, min = 0, max = 1e6, hint }) {
  return (
    <label style={{ display: "block", marginBottom: S.sm, maxWidth: 320 }}>
      <div style={{ fontSize: T.label, color: SC.muted, marginBottom: 2 }}>{label}{unit ? ` (${unit})` : ""}</div>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) onChange(Math.min(max, Math.max(min, x))); }}
        style={{ width: "100%", boxSizing: "border-box", background: SC.bg, color: SC.text, fontFamily: MONO, fontSize: T.body,
                 border: `1px solid ${SC.border}`, borderRadius: 6, padding: "5px 7px" }} />
      {hint && <div style={{ fontSize: T.micro, color: SC.subtle, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </label>
  );
}

const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: S.sm });

/* Small line icons for the workbench controls. */
const ICON = {
  pause: <path d="M7 5v14M17 5v14" />, play: <path d="M7 4l13 8-13 8z" />, plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />, replay: <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />,
  frame: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />, layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.6-.6-2.5z" />,
};
const Icon = ({ k, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k]}</svg>
);
function ToolBtn({ label, onClick, on = false, children }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick}
      style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: T.label, fontWeight: 600,
               background: on ? ACC : SC.panel, color: on ? ACC_INK : SC.text, border: `1px solid ${on ? ACC : SC.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }}>
      {children}
    </button>
  );
}

/* ── The workbench: three.js, fetched when the tab opens. ── */
function Workbench({ airframe, kit, step, dark, highlightKey, factsFor, onThumbs, narrow, result, ok }) {
  const hostRef = useRef(null), labelRef = useRef(null), stageRef = useRef(null), apiRef = useRef(null), thumbTimer = useRef(0);
  const [state, setState] = useState("loading");
  const [tip, setTip] = useState(null);
  const [picked, setPicked] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [labelsOn, setLabelsOn] = useState(true);
  const [notes, setNotes] = useState([]);
  const latest = useRef(null);
  latest.current = { airframe, kit, step, dark, onThumbs };
  const shoot = () => {
    clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(function go() {
      const api = apiRef.current; if (!api) return;
      const urls = api.thumbnails();
      if (!urls) { thumbTimer.current = setTimeout(go, 700); return; }
      latest.current.onThumbs?.(urls); setNotes(api.notes());
    }, 450);
  };

  useEffect(() => {
    if (!airframe || typeof window === "undefined") return undefined;
    let cancelled = false, canvas = null;
    import("./drone-scene.js").then((mod) => {
      if (cancelled || !hostRef.current) return;
      canvas = document.createElement("canvas");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "grab" });
      canvas.setAttribute("aria-label", "Workbench: the drone and its parts on a cutting mat");
      hostRef.current.appendChild(canvas);
      try {
        const L = latest.current;
        apiRef.current = mod.mountWorkbench({
          canvas, labelLayer: labelRef.current, airframe: L.airframe, kit: L.kit, dark: L.dark, step: L.step,
          onHover: (g, x, y) => { const r = stageRef.current?.getBoundingClientRect(); setTip(g && r ? { g, x: x - r.left, y: y - r.top } : null); },
          onPick: (g) => setPicked(g),
        });
        setState("ready"); shoot();
      } catch (e) { setState(`unavailable: ${e.message}`); }
    }).catch((e) => setState(`unavailable: ${e.message}`));
    const ro = window.ResizeObserver ? new window.ResizeObserver(() => apiRef.current?.resize()) : null;
    if (ro && hostRef.current) ro.observe(hostRef.current);
    return () => { cancelled = true; clearTimeout(thumbTimer.current); ro?.disconnect(); apiRef.current?.dispose(); apiRef.current = null; canvas?.remove(); };
  }, [!!airframe]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (airframe && apiRef.current) { apiRef.current.setAirframe(airframe, kit); shoot(); } }, [airframe, kit]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiRef.current?.setStep(step); setPicked(null); }, [step]);
  useEffect(() => { if (apiRef.current) { apiRef.current.setDark(dark); shoot(); } }, [dark]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiRef.current?.highlight(highlightKey ?? picked?.key ?? null); }, [highlightKey, picked]);

  const api = () => apiRef.current;
  const facts = picked ? factsFor(picked.key) : null;
  const cur = BUILD_STEPS[step];
  return (
    <section aria-label="Workbench" style={{ ...panelBox(), padding: S.md, display: "flex", flexDirection: "column", gap: S.sm }}>
      <header style={{ display: "flex", alignItems: "center", gap: S.sm }}>
        <span style={{ width: 36, height: 36, borderRadius: 18, display: "grid", placeItems: "center", background: ACC, color: ACC_INK }}><Icon k="wrench" size={18} /></span>
        <div>
          <div style={{ fontFamily: COND, fontSize: 22, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1, color: SC.text, textTransform: "uppercase" }}>Workbench</div>
          <div style={{ fontSize: T.label, color: SC.muted, marginTop: 2 }}>Step {step + 1} · {cur.heading}</div>
        </div>
      </header>
      <div ref={stageRef} style={{ position: "relative", height: narrow ? 360 : 520, borderRadius: 10, overflow: "hidden", background: SC.inset }}>
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        <div ref={labelRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} />
        {state !== "ready" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: SC.muted, fontSize: T.label, padding: S.md, textAlign: "center" }}>
            {airframe ? (state === "loading" ? "Loading the 3D workbench…" : `3D view ${state}`) : "Pick a frame the airframe builder can lay out."}
          </div>
        )}
        {state === "ready" && (
          <div style={{ position: "absolute", right: 10, top: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <ToolBtn label={playing ? "Pause the assembly" : "Play the assembly"} on={playing} onClick={() => { const p = !playing; setPlaying(p); api()?.setPlaying(p); }}><Icon k={playing ? "pause" : "play"} /></ToolBtn>
            <ToolBtn label="Assembly speed" onClick={() => { const s = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; setSpeed(s); api()?.setSpeed(s); }}>{speed}×</ToolBtn>
            <ToolBtn label="Replay this step" onClick={() => api()?.replay()}><Icon k="replay" /></ToolBtn>
            <span style={{ height: 4 }} />
            <ToolBtn label="Zoom in" onClick={() => api()?.zoom(1)}><Icon k="plus" /></ToolBtn>
            <ToolBtn label="Zoom out" onClick={() => api()?.zoom(-1)}><Icon k="minus" /></ToolBtn>
            <ToolBtn label="Frame this step" onClick={() => api()?.resetView()}><Icon k="frame" /></ToolBtn>
            <ToolBtn label="Part labels" on={labelsOn} onClick={() => { const l = !labelsOn; setLabelsOn(l); api()?.setLabels(l); }}><Icon k="layers" /></ToolBtn>
          </div>
        )}
        {state === "ready" && ok && result && (
          <div style={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "calc(100% - 70px)" }}>
            {[["mass", `${num(result.massKg, 2)} kg`], ["hover", `${num(result.endurance.minutes, 1)} min`], ["T/W", num(result.thrustToWeight.available, 2)]].map(([k, x]) => (
              <span key={k} style={{ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 999, padding: "3px 10px", fontSize: T.micro, fontFamily: MONO, color: SC.text, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                <span style={{ color: SC.muted }}>{k} </span>{x}
              </span>
            ))}
          </div>
        )}
        {tip && !picked && (
          <div style={{ position: "absolute", left: Math.min(tip.x + 14, 9999), top: tip.y + 14, pointerEvents: "none", background: SC.panel, color: SC.text,
                        border: `1px solid ${ACC}`, borderRadius: 6, padding: "4px 8px", fontSize: T.micro, boxShadow: "0 2px 6px rgba(0,0,0,0.25)", maxWidth: 260 }}>
            <b>{tip.g.label}</b><div style={{ color: SC.muted }}>click for details</div>
          </div>
        )}
        {facts && (
          <div role="dialog" aria-label={`Part: ${facts.title}`}
            style={{ position: "absolute", left: narrow ? 8 : "auto", right: narrow ? 8 : 56, bottom: 10, width: narrow ? "auto" : 300, background: SC.panel, color: SC.text,
                     border: `1px solid ${SC.border}`, borderRadius: 10, padding: S.md, boxShadow: "0 4px 14px rgba(0,0,0,0.3)", maxHeight: "70%", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: S.sm, alignItems: "flex-start" }}>
              <div style={{ fontFamily: COND, fontSize: 17, fontWeight: 700, lineHeight: 1.15 }}>{facts.title}</div>
              <button type="button" aria-label="Close" onClick={() => setPicked(null)} style={{ ...btn(false), padding: "0 8px", lineHeight: "22px" }}>×</button>
            </div>
            <div style={{ fontSize: T.micro, color: SC.caution, margin: "4px 0 6px", lineHeight: 1.4 }}>{facts.scale}</div>
            {facts.rows.map(([k, x]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: S.sm, fontSize: T.micro, borderTop: `1px solid ${SC.border}`, padding: "4px 0" }}>
                <span style={{ color: SC.muted }}>{k}</span><span style={{ fontFamily: MONO, textAlign: "right" }}>{x}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: T.micro, color: SC.muted, fontFamily: MONO, pointerEvents: "none", maxWidth: "60%",
                      background: SC.panel, opacity: 0.92, border: `1px solid ${SC.border}`, borderRadius: 6, padding: "3px 8px" }}>
          drag to turn · scroll to zoom · right-drag to pan
          {notes.map((n) => <div key={n} style={{ color: SC.caution }}>{n}</div>)}
        </div>
      </div>
    </section>
  );
}

/* ── The step strip: one card per step, with a picture of the bench. ── */
function StepStrip({ step, setStep, thumbs }) {
  const scroller = useRef(null), refs = useRef([]);
  useEffect(() => {
    const el = refs.current[step], box = scroller.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [step]);
  const arrow = (dir) => (
    <button type="button" aria-label={dir < 0 ? "Previous step" : "Next step"} disabled={dir < 0 ? step === 0 : step === BUILD_STEPS.length - 1}
      onClick={() => setStep((i) => Math.min(BUILD_STEPS.length - 1, Math.max(0, i + dir)))}
      style={{ flex: "0 0 32px", height: 32, borderRadius: 16, cursor: "pointer", border: `1px solid ${SC.border}`, background: dir > 0 ? SC.text : SC.panel, color: dir > 0 ? SC.panel : SC.muted, fontSize: 16, lineHeight: 1 }}>
      {dir < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <nav aria-label="Build steps" style={{ ...panelBox(), padding: S.sm, display: "flex", alignItems: "center", gap: S.sm, minWidth: 0 }}>
      {arrow(-1)}
      <div ref={scroller} style={{ display: "flex", gap: S.sm, overflowX: "auto", flex: 1, minWidth: 0, scrollbarWidth: "thin", padding: "2px 2px 4px" }}>
        {BUILD_STEPS.map((s, i) => {
          const on = i === step, done = i < step;
          return (
            <button key={s.key} ref={(el) => { refs.current[i] = el; }} type="button" aria-current={on ? "step" : undefined} onClick={() => setStep(i)}
              style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: 6, paddingRight: 14, borderRadius: 10, cursor: "pointer", fontFamily: SANS, textAlign: "left",
                       background: on ? SC.inset : SC.panel, border: `1.5px solid ${on ? ACC : SC.border}`, color: SC.text, boxShadow: on ? `0 0 0 2px ${ACC}55` : "none" }}>
              <span style={{ width: 84, height: 54, borderRadius: 6, overflow: "hidden", background: SC.inset, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                {thumbs?.[i] ? <img src={thumbs[i]} alt="" width={84} height={54} style={{ display: "block", objectFit: "cover" }} /> : <span style={{ color: SC.subtle, fontFamily: MONO, fontSize: T.micro }}>{pad2(i)}</span>}
              </span>
              <span>
                <span style={{ display: "inline-block", fontSize: T.micro, fontFamily: MONO, fontWeight: 700, borderRadius: 999, padding: "0 7px", background: on || done ? ACC : SC.inset, color: on || done ? ACC_INK : SC.muted }}>
                  {done ? "✓ " : ""}{pad2(i)}
                </span>
                <span style={{ display: "block", fontFamily: COND, fontSize: 15, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap" }}>{s.title}</span>
              </span>
            </button>
          );
        })}
      </div>
      {arrow(1)}
    </nav>
  );
}

/* ── The spec sheet: sizeDrone()'s result. ── */
function SpecSheet({ design }) {
  const { result, ok } = design;
  const mb = result.massBreakdown;
  const bars = ok ? [["Payload", mb.payloadKg], ["Structure", mb.structureKg], ["Avionics", mb.avionicsKg],
                     ["Propulsion", mb.propulsionKg], ["Battery", mb.batteryKg]] : [];
  const total = bars.reduce((s, [, x]) => s + x, 0);
  const checks = result.checks ? [
    ["Endurance met", result.checks.enduranceMet], ["Thrust-to-weight met", result.checks.thrustToWeightMet],
    ["Motor within limits", result.checks.motorWithinLimits], ["ESC within limits", result.checks.escWithinLimits],
    ["Pack within limits", result.checks.packWithinLimits],
  ] : [];
  return (
    <div>
      <div style={{ fontSize: T.label, fontFamily: MONO, color: ok ? SC.nominal : SC.warning, marginBottom: S.sm }}>
        {ok ? `● ${result.status}${result.meetsMission ? " · meets the mission" : " · does NOT meet the mission"}` : `● ${result.status}: ${result.reason ?? ""}`}
      </div>
      {!ok && result.detail && <p style={{ fontSize: T.micro, color: SC.muted, lineHeight: 1.5, margin: `0 0 ${S.sm}px` }}>{result.detail}</p>}
      {ok && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", margin: `0 -${S.md}px` }}>
            <Kpi label="All-up mass" value={num(result.massKg, 3)} unit="kg" />
            <Kpi label="Hover endurance" value={num(result.endurance.minutes, 1)} unit="min"
                 sub={`P10–P90 ${num(result.endurance.minutesP10, 1)}–${num(result.endurance.minutesP90, 1)}`} />
            <Kpi label="Thrust / weight" value={num(result.thrustToWeight.available, 2)} unit=""
                 sub={`required ${num(result.thrustToWeight.required, 2)}`} />
            <Kpi label="Hover throttle" value={num(100 * result.thrustToWeight.hoverThrottleFraction, 0)} unit="%" />
            <Kpi label="Hover bus power" value={num(result.hover.busPowerW, 0)} unit="W" />
            <Kpi label="Hover rpm" value={num(result.hover.rpm, 0)} unit="rpm" />
          </div>
          <div style={{ marginTop: S.sm }}>
            <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", border: `1px solid ${SC.border}` }}>
              {bars.map(([k, x]) => <div key={k} title={`${k} ${num(x, 3)} kg`} style={{ width: `${(100 * x) / total}%`, background: MASS_COLOURS[k] }} />)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 4 }}>
              {bars.map(([k, x]) => (
                <span key={k} style={{ fontSize: T.micro, color: SC.muted, fontFamily: MONO }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: MASS_COLOURS[k], marginRight: 4 }} />{k} {num(x, 3)} kg
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      {checks.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: `${S.sm}px 0 0` }}>
          {checks.map(([k, x]) => (
            <li key={k} style={{ fontSize: T.label, color: x ? SC.text : SC.warning, lineHeight: 1.6 }}>{x ? "✓" : "✗"} {k}</li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5, margin: `${S.sm}px 0 0` }}>
        Every figure is the Sizing tab's closure (sizeDrone), recomputed as you build.
      </p>
    </div>
  );
}

function SectionHead({ children, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S.sm, margin: `${S.md}px 0 ${S.sm}px` }}>
      <span style={kickerStyle()}>{children}</span>
      <span style={{ flex: 1, height: 1, background: SC.border }} />
      {count && <span style={{ fontSize: T.micro, fontFamily: MONO, color: SC.muted, background: SC.inset, borderRadius: 999, padding: "1px 8px" }}>{count}</span>}
    </div>
  );
}
function Tick({ on }) {
  return <span aria-hidden="true" style={{ flex: "0 0 18px", height: 18, borderRadius: 5, border: `1.5px solid ${on ? SC.nominal : SC.border}`, background: on ? SC.nominal : "transparent", color: SC.bg, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{on ? "✓" : ""}</span>;
}

/* initialStep lets the render gate draw every step. */
export default function BuildTab({ design, frame, pickFrame, onFly, dark, initialStep = 0 }) {
  const { v, set, built, result, ok } = design;
  const [step, setStep] = useState(initialStep);
  const [cls, setCls] = useState(frame?.frameClass ?? "QUAD");
  const [band, setBand] = useState("all");
  const [hl, setHl] = useState(null);
  const [ticks, setTicks] = useState(() => new Set());
  const [thumbs, setThumbs] = useState(null);
  const [narrow, setNarrow] = useState(false);
  const mismatch = rotorMismatch(v, frame);
  /* The step card is as tall as the workbench beside it, as on a printed
     instruction sheet; it scrolls inside, so Back and Next stay in view. */
  const leftRef = useRef(null);
  const [leftH, setLeftH] = useState(null);
  useEffect(() => {
    const el = leftRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => setLeftH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 760px)");
    if (!mq) return undefined;
    const on = () => setNarrow(mq.matches); on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") setStep((i) => Math.min(BUILD_STEPS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setStep((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const airframe = useMemo(() => {
    if (!frame || !built.propeller) return null;
    try { return buildAirframe({ frame, propellerDiameterM: built.propeller.diameterM, tipGapFraction: 0.10 }); }
    catch { return null; }
  }, [frame, built.propeller]);
  const kit = useMemo(() => ({ motor: built.motor, propeller: built.propeller, esc: built.esc, cell: built.cell, pack: built.pack, payloadKg: v.payloadKg }),
    [built.motor, built.propeller, built.esc, built.cell, built.pack, v.payloadKg]);

  const choose = (f) => { pickFrame(f.frameClass, f.frameType); set("rotors")(f.motorCount); };
  const notModellable = BLDC_MOTORS.length - MODELLABLE_MOTORS.length;
  const bands = [["all", "All", () => true], ["s", "≤ 10 in", (p) => p.diameterIn <= 10],
                 ["m", "10–14 in", (p) => p.diameterIn > 10 && p.diameterIn <= 14], ["l", "> 14 in", (p) => p.diameterIn > 14]];
  const props = PROP_CHOICES.filter(bands.find((b) => b[0] === band)[2]);
  const cur = BUILD_STEPS[step];
  const needs = cur.key === "parts" ? billOfMaterials(design, frame, airframe) : stepNeeds(cur.key, design, frame, airframe);
  const actions = stepActions(cur.key, design, frame, airframe);
  const tick = (id) => setTicks((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const needsDone = needs.filter((_, i) => ticks.has(`${cur.key}:need:${i}`)).length;
  const actsDone = actions.filter((_, i) => ticks.has(`${cur.key}:do:${i}`)).length;

  let body = null;
  if (cur.key === "frame") body = (
    <>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S.sm }}>
        {FRAME_CLASSES.map((c) => <button key={c} type="button" aria-pressed={c === cls} onClick={() => setCls(c)} style={btn(false, c === cls)}>{c}</button>)}
      </div>
      <div style={grid(130)}>
        {framesOfClass(cls).map((f) => (
          <PartCard key={f.frameType} on={frame?.frameClass === f.frameClass && frame?.frameType === f.frameType && !mismatch}
            onClick={() => choose(f)} title={`${f.frameClass} ${f.frameType}`} lines={[`${f.motorCount} motors`]}>
            <div style={{ alignSelf: "center" }}><FrameDiagram frame={f} size={90} caption={false} /></div>
          </PartCard>
        ))}
      </div>
      <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5, margin: `${S.sm}px 0 0` }}>
        Motor numbers are ArduPilot output channels and rotation is the propeller seen from above, both read from AP_MotorsMatrix.cpp.
        The diagrams are not to scale; the workbench lays the arms out from the propeller you size in step 4.
      </p>
      {airframe?.coaxialUnmodelled && <p style={{ fontSize: T.micro, color: SC.warning, lineHeight: 1.5 }}>{airframe.coaxialUnmodelled}</p>}
    </>
  );
  if (cur.key === "motor") body = (
    <>
      <div style={grid(190)}>
        {MODELLABLE_MOTORS.map((m) => (
          <PartCard key={m.model} on={built.motor?.model === m.model} onClick={() => set("motorModel")(m.model)}
            title={m.model} lines={[`${m.kv} rpm/V · ${massLabelG(m.mass_g)}`, `${m.max_continuous_current_a} A continuous`, `Rm ${m.internal_resistance_mohm} mΩ · I0 ${m.no_load_current_i0_a} A`]}
            foot={m.manufacturer} />
        ))}
      </div>
      <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5 }}>
        {notModellable} more motors in the catalogue do not publish every constant the motor model needs (Kv or Kt, no-load current, winding resistance), so they cannot be sized here and are not offered.
      </p>
    </>
  );
  if (cur.key === "prop") body = (
    <>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S.sm, alignItems: "center" }}>
        {bands.map(([k, label]) => <button key={k} type="button" aria-pressed={band === k} onClick={() => setBand(k)} style={btn(false, band === k)}>{label}</button>)}
        <span style={{ fontSize: T.micro, color: SC.subtle, fontFamily: MONO }}>{props.length} measured propellers</span>
      </div>
      <div style={{ ...grid(140), maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
        {props.map((p) => (
          <PartCard key={p.id} on={built.propeller?.id === p.id} onClick={() => set("propellerId")(p.id)}
            title={p.label} lines={[`${p.family} · ${p.static.length} static points`]} />
        ))}
      </div>
      <div style={{ marginTop: S.sm }}>
        <NumberField label="Propeller mass, each" unit="g" value={v.propellerMassG} onChange={set("propellerMassG")} step={1} min={1} max={500}
          hint="Declared: the UIUC data measures thrust and power, not mass." />
      </div>
    </>
  );
  if (cur.key === "esc") body = (
    <div style={grid(190)}>
      {ESCS.map((e) => (
        <PartCard key={e.id} on={built.esc?.id === e.id} onClick={() => set("escId")(e.id)}
          title={e.model} lines={[`${e.continuous_current_a != null ? `${e.continuous_current_a} A continuous` : "continuous current not published"}${e.burst_current_a ? ` · ${e.burst_current_a} A burst` : ""}`,
                                  e.lipo_cell_count_min ? `${e.lipo_cell_count_min}–${e.lipo_cell_count_max} S` : null, massLabelG(e.mass_g)]}
          foot={isFourInOne(e) ? `${e.manufacturer} · 4-in-1 board: the sizing counts its whole mass once per motor` : e.manufacturer} />
      ))}
    </div>
  );
  if (cur.key === "cell") body = (
    <div style={grid(200)}>
      {BATTERIES.map((b) => (
        <PartCard key={b.id} on={built.cell?.id === b.id} onClick={() => set("cellId")(b.id)}
          title={b.model} lines={[b.chemistry, `${b.capacity_wh ?? "—"} Wh · ${b.nominal_voltage_v} V · ${massLabelG(b.mass_g)}`,
                                  b.max_continuous_discharge_a ? `${b.max_continuous_discharge_a} A continuous` : null]}
          foot={b.manufacturer} />
      ))}
    </div>
  );
  if (cur.key === "pack") body = (
    <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <NumberField label="Cells in series" unit="" value={v.series} onChange={set("series")} step={1} min={1} max={14} />
        <NumberField label="Cells in parallel" unit="" value={v.parallel} onChange={set("parallel")} step={1} min={1} max={12} />
        <NumberField label="Pack overhead (wiring, BMS, case)" unit="fraction" value={v.packOverhead} onChange={set("packOverhead")} step={0.01} min={0} max={1}
          hint="Declared: a fraction of the cell mass." />
      </div>
      <div style={{ fontSize: T.label, fontFamily: MONO, color: SC.text, lineHeight: 1.8, minWidth: 0 }}>
        {built.pack ? (
          <>
            <div>{built.pack.model}</div>
            <div>{built.pack.voltagePrintedV} V nominal · {built.pack.capacityMah} mAh</div>
            <div>{num(built.pack.energyWhPublished, 0)} Wh · {num(built.pack.massG, 0)} g</div>
            <div style={{ color: SC.subtle, fontSize: T.micro }}>{built.pack.energyWhSource}</div>
          </>
        ) : <span style={{ color: SC.warning }}>This pack cannot be assembled: {built.packError}</span>}
      </div>
    </div>
  );
  if (cur.key === "avionics") body = (
    <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <NumberField label="Avionics mass" unit="kg" value={v.avionicsMassKg} onChange={set("avionicsMassKg")} step={0.01} min={0} max={5}
          hint="Declared: flight controller, receiver, GPS, wiring." />
        <NumberField label="Avionics power" unit="W" value={v.avionicsPowerW} onChange={set("avionicsPowerW")} step={1} min={0} max={200} />
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: 4 }}>For scale: flight-controller module masses in the catalogue</div>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {FLIGHT_CONTROLLERS.map((c) => (
            <div key={c.model} style={{ display: "flex", justifyContent: "space-between", gap: S.sm, fontSize: T.micro, fontFamily: MONO, color: SC.text, borderBottom: `1px solid ${SC.border}`, padding: "3px 0" }}>
              <span>{c.manufacturer} {c.model}</span><span style={{ color: SC.muted }}>{massLabelG(c.module_mass_g)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (cur.key === "mission") body = (
    <div style={grid(200)}>
      <NumberField label="Payload" unit="kg" value={v.payloadKg} onChange={set("payloadKg")} step={0.1} min={0} max={50} />
      <NumberField label="Hover endurance required" unit="min" value={v.hoverEnduranceMin} onChange={set("hoverEnduranceMin")} step={1} min={1} max={240} />
      <NumberField label="Thrust-to-weight required" unit="" value={v.thrustToWeightRequired} onChange={set("thrustToWeightRequired")} step={0.1} min={1.1} max={6} />
      <NumberField label="Structure mass" unit="kg" value={v.structureMassKg} onChange={set("structureMassKg")} step={0.05} min={0.01} max={50} hint="Declared: frame, arms, landing gear." />
      <NumberField label="Usable pack fraction" unit="fraction" value={v.usableFraction} onChange={set("usableFraction")} step={0.01} min={0.1} max={1} hint="Declared: the energy you allow yourself to use." />
      <NumberField label="Altitude" unit="m" value={v.altitudeM} onChange={set("altitudeM")} step={100} min={0} max={6000} />
    </div>
  );
  if (cur.key === "review") body = (
    <div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {BUILD_STEPS.slice(0, -1).map((s, i) => (
          <li key={s.key} style={{ fontSize: T.label, color: SC.text, lineHeight: 1.8 }}>
            <button type="button" onClick={() => setStep(i)} style={{ ...btn(false), padding: "1px 8px", marginRight: 6 }}>{s.title}</button>
            <span style={{ fontFamily: MONO, color: SC.muted }}>{stepSummary(s.key, design, frame)}</span>
          </li>
        ))}
      </ol>
      <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap", marginTop: S.md, alignItems: "center" }}>
        <button type="button" disabled={!ok || !!mismatch} onClick={onFly} style={{ ...btn(true), opacity: ok && !mismatch ? 1 : 0.45, cursor: ok && !mismatch ? "pointer" : "not-allowed" }}>
          Fly it in the arena →
        </button>
        {!ok && <span style={{ fontSize: T.label, color: SC.warning }}>The design has to converge before it can fly: {result.reason ?? result.status}.</span>}
        {ok && mismatch && <span style={{ fontSize: T.label, color: SC.warning }}>Match the rotor count to the frame first (step 2).</span>}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, alignItems: "flex-start" }}>
      <div ref={leftRef} style={{ flex: "1 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: S.md }}>
        <Workbench airframe={airframe} kit={kit} step={step} dark={dark} highlightKey={hl} narrow={narrow} result={result} ok={ok}
          factsFor={(k) => partFacts(k, design, airframe)} onThumbs={setThumbs} />
        <StepStrip step={step} setStep={setStep} thumbs={thumbs} />
      </div>

      <section aria-label={`Step ${step + 1}: ${cur.heading}`} style={{ ...panelBox(), flex: "1 1 380px", maxWidth: narrow ? "none" : 480, minWidth: 0, display: "flex", flexDirection: "column",
                 maxHeight: narrow || !leftH ? "none" : Math.max(560, leftH) }}>
        {/* The step scrolls inside the panel; Back and Next stay on screen. */}
        <div style={{ padding: `${S.lg}px ${S.lg}px 0`, overflowY: narrow ? "visible" : "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ display: "flex", gap: S.md, alignItems: "center" }}>
            <span style={{ flex: "0 0 48px", height: 48, borderRadius: 24, display: "grid", placeItems: "center", background: ACC, color: ACC_INK, fontFamily: COND, fontSize: 21, fontWeight: 700 }}>{pad2(step)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={kickerStyle()}>{cur.kicker} · Step {step + 1} of {BUILD_STEPS.length}</div>
              <h2 style={{ margin: "2px 0 0", fontFamily: COND, fontSize: 28, lineHeight: 1.05, fontWeight: 700, textTransform: "uppercase", color: SC.text, letterSpacing: "0.01em" }}>{cur.heading}</h2>
            </div>
          </div>
          <p style={{ fontSize: T.body + 1, color: SC.text, lineHeight: 1.6, margin: `${S.md}px 0 0` }}>{cur.blurb}</p>

          {mismatch && (
            <div style={{ margin: `${S.md}px 0 0`, padding: S.sm, borderRadius: 8, border: `1px solid ${SC.warning}` }}>
              <p style={{ fontSize: T.label, color: SC.warning, lineHeight: 1.5, margin: "0 0 6px" }}>
                The sizing has {mismatch.sized} rotors but the frame has {mismatch.frame}.</p>
              <button type="button" onClick={() => set("rotors")(mismatch.frame)} style={{ ...btn(false, true), padding: "3px 10px" }}>Size it with {mismatch.frame} rotors</button>
            </div>
          )}

          {needs.length > 0 && (
            <>
              <SectionHead count={`${needsDone} / ${needs.length}`}>{cur.key === "parts" ? "Bill of materials" : "You'll need"}</SectionHead>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {needs.map((x, i) => {
                  const id = `${cur.key}:need:${i}`, on = ticks.has(id);
                  return (
                    <button key={id} type="button" aria-pressed={on} onClick={() => tick(id)} onMouseEnter={() => setHl(x.group)} onMouseLeave={() => setHl(null)} onFocus={() => setHl(x.group)} onBlur={() => setHl(null)}
                      style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: SANS, padding: "7px 10px", borderRadius: 8,
                               background: hl === x.group ? SC.inset : SC.panel, border: `1px solid ${hl === x.group ? ACC : SC.border}`, color: SC.text }}>
                      <Tick on={on} />
                      <span style={{ flex: "0 0 auto", minWidth: 34, textAlign: "center", fontFamily: MONO, fontSize: T.micro, fontWeight: 700, borderRadius: 5, padding: "2px 6px", background: SC.text, color: SC.panelSolid }}>{x.qty}×</span>
                      <span style={{ flex: 1, fontSize: T.label, lineHeight: 1.4, textDecoration: on ? "line-through" : "none", color: on ? SC.muted : SC.text }}>{x.text}</span>
                      {x.note && <span style={{ fontSize: T.micro, color: SC.subtle, fontStyle: "italic" }}>{x.note}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {actions.length > 0 && (
            <>
              <SectionHead count={`${actsDone} / ${actions.length}`}>Do this</SectionHead>
              <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {actions.map((a, i) => {
                  const id = `${cur.key}:do:${i}`, on = ticks.has(id);
                  return (
                    <li key={id} style={{ borderBottom: i < actions.length - 1 ? `1px solid ${SC.border}` : "none" }}>
                      <button type="button" aria-pressed={on} onClick={() => tick(id)}
                        style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none", padding: "9px 0", color: SC.text, fontFamily: SANS }}>
                        <span style={{ flex: "0 0 26px", height: 26, borderRadius: 13, display: "grid", placeItems: "center", fontFamily: COND, fontWeight: 700, fontSize: 13,
                                       border: `1.5px solid ${on ? SC.nominal : ACC}`, background: on ? SC.nominal : "transparent", color: on ? SC.bg : SC.text }}>{on ? "✓" : i + 1}</span>
                        <span style={{ fontSize: T.body, lineHeight: 1.6, color: on ? SC.muted : SC.text }}>{a}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {body && (
            <>
              <SectionHead>{cur.key === "review" ? "The build" : "Choose"}</SectionHead>
              {body}
            </>
          )}

          <SectionHead>Sized now</SectionHead>
          <SpecSheet design={design} />
          <div style={{ height: S.md }} />
        </div>

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S.sm, padding: S.md, borderTop: `1px solid ${SC.border}` }}>
          <button type="button" disabled={step === 0} onClick={() => setStep((i) => Math.max(0, i - 1))} style={{ ...btn(false), opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          <span style={{ fontSize: T.micro, color: SC.subtle, fontFamily: MONO }}>← → steps</span>
          {step < BUILD_STEPS.length - 1
            ? <button type="button" onClick={() => setStep((i) => i + 1)} style={btn(true)}>Next: {BUILD_STEPS[step + 1].title} →</button>
            : <span />}
        </footer>
      </section>
    </div>
  );
}
