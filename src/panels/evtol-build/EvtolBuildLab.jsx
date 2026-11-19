/* =====================================================================
   EVTOL BUILD LAB — the panel (Build eVTOL tab)
   =====================================================================
   The sized aircraft put together step by step on a hangar floor ruled in
   metres, the way the drone Build tab assembles a drone on its mat. Every
   step, part, number and sentence comes from build-plan.js, which reads
   the geometry the other views draw and an allowed list of sizing fields;
   nothing here works a number out.

   three.js and the hangar scene are fetched only when the panel scrolls
   into view, onto a fresh canvas each time.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC, DARK } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Panel } from "../../ui/primitives.jsx";
import { buildPlan, STEP_TEXT } from "./build-plan.js";

export const LAB_TITLE = "Build lab — the sized aircraft, step by step, true scale";
const FLIGHT_TITLE = "Mission flight — 3D, true scale";
const COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";
const ACC = "#F2B23A", ACC_INK = "#1A1405";
const pad2 = (i) => String(i + 1).padStart(2, "0");

function btn(primary, on = false) {
  return { padding: "7px 14px", fontSize: T.label, borderRadius: 6, cursor: "pointer", fontFamily: SANS,
    background: primary ? ACC : on ? SC.inset : "transparent", color: primary ? ACC_INK : SC.text,
    border: `1px solid ${primary ? ACC : on ? ACC : SC.border}`, fontWeight: primary ? 700 : 500 };
}
/* Functions, not constants: SC is the live theme object. */
const panelBox = () => ({ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.12)" });
const kickerStyle = () => ({ fontSize: T.micro, letterSpacing: "0.16em", textTransform: "uppercase", color: SC.muted, fontFamily: COND, fontWeight: 600 });

const ICON = {
  pause: <path d="M7 5v14M17 5v14" />, play: <path d="M7 4l13 8-13 8z" />, plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />, replay: <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />,
  frame: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />, layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  hangar: <path d="M3 20V10l9-6 9 6v10M7 20v-6h10v6" />,
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

/* ── The hangar: three.js, fetched when the panel is on screen. ── */
function Hangar({ plan, step, dark, highlightKey, onThumbs, narrow }) {
  const wrapRef = useRef(null), hostRef = useRef(null), labelRef = useRef(null), stageRef = useRef(null), apiRef = useRef(null), thumbTimer = useRef(0);
  const [wanted, setWanted] = useState(false);
  const [state, setState] = useState("loading");
  const [tip, setTip] = useState(null);
  const [picked, setPicked] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [labelsOn, setLabelsOn] = useState(true);
  const latest = useRef(null);
  latest.current = { plan, step, dark, onThumbs };
  const shoot = () => {
    clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(function go() {
      const api = apiRef.current; if (!api) return;
      const urls = api.thumbnails();
      if (!urls) { thumbTimer.current = setTimeout(go, 700); return; }
      latest.current.onThumbs?.(urls);
    }, 450);
  };

  /* Load three.js when the panel is on screen, not when the tab opens. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || wanted) return undefined;
    if (typeof window.IntersectionObserver !== "function") { setWanted(true); return undefined; }
    const io = new window.IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setWanted(true); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [wanted]);
  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false, canvas = null;
    import("./hangar-scene.js").then((mod) => {
      if (cancelled || !hostRef.current) return;
      canvas = document.createElement("canvas");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "grab" });
      canvas.setAttribute("aria-label", "Hangar: the sized aircraft and its parts on a floor ruled in metres");
      hostRef.current.appendChild(canvas);
      try {
        const L = latest.current;
        apiRef.current = mod.mountHangar({
          canvas, labelLayer: labelRef.current, plan: L.plan, dark: L.dark, step: L.step,
          onHover: (g, x, y) => { const r = stageRef.current?.getBoundingClientRect(); setTip(g && r ? { g, x: x - r.left, y: y - r.top } : null); },
          onPick: (g) => setPicked(g),
        });
        setState("ready"); shoot();
      } catch (e) { setState(`unavailable: ${e.message}`); }
    }).catch((e) => setState(`unavailable: ${e.message}`));
    const ro = window.ResizeObserver ? new window.ResizeObserver(() => apiRef.current?.resize()) : null;
    if (ro && hostRef.current) ro.observe(hostRef.current);
    return () => { cancelled = true; clearTimeout(thumbTimer.current); ro?.disconnect(); apiRef.current?.dispose(); apiRef.current = null; canvas?.remove(); };
  }, [wanted]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (apiRef.current) { apiRef.current.setPlan(plan); shoot(); } }, [plan]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiRef.current?.setStep(step); setPicked(null); }, [step]);
  useEffect(() => { if (apiRef.current) { apiRef.current.setDark(dark); shoot(); } }, [dark]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiRef.current?.highlight(highlightKey ?? picked?.key ?? null); }, [highlightKey, picked]);
  /* On a phone the floor labels would stack over parts too small to see:
     they start off there, and the layers button turns them on. */
  useEffect(() => { setLabelsOn(!narrow); apiRef.current?.setLabels(!narrow); }, [narrow, state]);

  const api = () => apiRef.current;
  const facts = picked ? plan.facts(picked.key) : null;
  const cur = plan.stepText(plan.steps[step]);
  return (
    <section ref={wrapRef} aria-label="Hangar" style={{ ...panelBox(), padding: S.md, display: "flex", flexDirection: "column", gap: S.sm }}>
      <header style={{ display: "flex", alignItems: "center", gap: S.sm }}>
        <span style={{ width: 36, height: 36, borderRadius: 18, display: "grid", placeItems: "center", background: ACC, color: ACC_INK }}><Icon k="hangar" size={18} /></span>
        <div>
          <div style={{ fontFamily: COND, fontSize: 22, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1, color: SC.text, textTransform: "uppercase" }}>Hangar</div>
          <div style={{ fontSize: T.label, color: SC.muted, marginTop: 2 }}>Step {step + 1} · {cur.heading} · {plan.layout}</div>
        </div>
      </header>
      <div ref={stageRef} style={{ position: "relative", height: narrow ? 440 : 520, borderRadius: 10, overflow: "hidden", background: SC.inset }}>
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        <div ref={labelRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} />
        {state !== "ready" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: SC.muted, fontSize: T.label, padding: S.md, textAlign: "center" }}>
            {state === "loading" ? "Loading the 3D hangar…" : `3D view ${state}`}
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
        {tip && !picked && (
          <div style={{ position: "absolute", left: tip.x + 14, top: tip.y + 14, pointerEvents: "none", background: SC.panel, color: SC.text,
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
        {!facts && (
          <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: T.micro, color: SC.muted, fontFamily: MONO, pointerEvents: "none", maxWidth: "calc(100% - 70px)",
                        background: SC.panel, opacity: 0.92, border: `1px solid ${SC.border}`, borderRadius: 6, padding: "3px 8px" }}>
            {narrow ? "drag to turn · pinch to zoom" : "drag to turn · scroll to zoom · right-drag to pan"}
          </div>
        )}
      </div>
      {/* What is drawn rather than sized, under the picture, not over it. */}
      <div data-lab-notes="" style={{ fontSize: T.micro, color: SC.caution, lineHeight: 1.5, fontFamily: MONO }}>
        {plan.notes.map((n) => <div key={n}>{n}</div>)}
      </div>
    </section>
  );
}

/* ── The step strip: one card per step, with a picture of the hangar. ── */
function StepStrip({ steps, step, setStep, thumbs }) {
  const scroller = useRef(null), refs = useRef([]);
  useEffect(() => {
    const el = refs.current[step], box = scroller.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [step]);
  const arrow = (dir) => (
    <button type="button" aria-label={dir < 0 ? "Previous step" : "Next step"} disabled={dir < 0 ? step === 0 : step === steps.length - 1}
      onClick={() => setStep((i) => Math.min(steps.length - 1, Math.max(0, i + dir)))}
      style={{ flex: "0 0 32px", height: 32, borderRadius: 16, cursor: "pointer", border: `1px solid ${SC.border}`, background: dir > 0 ? SC.text : SC.panel, color: dir > 0 ? SC.panel : SC.muted, fontSize: 16, lineHeight: 1 }}>
      {dir < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <nav aria-label="Build steps" style={{ ...panelBox(), padding: S.sm, display: "flex", alignItems: "center", gap: S.sm, minWidth: 0 }}>
      {arrow(-1)}
      <div ref={scroller} style={{ display: "flex", gap: S.sm, overflowX: "auto", flex: 1, minWidth: 0, scrollbarWidth: "thin", padding: "2px 2px 4px" }}>
        {steps.map((k, i) => {
          const on = i === step, done = i < step;
          return (
            <button key={k} ref={(el) => { refs.current[i] = el; }} type="button" aria-current={on ? "step" : undefined} onClick={() => setStep(i)}
              style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: 6, paddingRight: 14, borderRadius: 10, cursor: "pointer", fontFamily: SANS, textAlign: "left",
                       background: on ? SC.inset : SC.panel, border: `1.5px solid ${on ? ACC : SC.border}`, color: SC.text, boxShadow: on ? `0 0 0 2px ${ACC}55` : "none" }}>
              <span style={{ width: 84, height: 54, borderRadius: 6, overflow: "hidden", background: SC.inset, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                {thumbs?.[i] ? <img src={thumbs[i]} alt="" width={84} height={54} style={{ display: "block", objectFit: "cover" }} /> : <span style={{ color: SC.subtle, fontFamily: MONO, fontSize: T.micro }}>{pad2(i)}</span>}
              </span>
              <span>
                <span style={{ display: "inline-block", fontSize: T.micro, fontFamily: MONO, fontWeight: 700, borderRadius: 999, padding: "0 7px", background: on || done ? ACC : SC.inset, color: on || done ? ACC_INK : SC.muted }}>
                  {done ? "✓ " : ""}{pad2(i)}
                </span>
                <span style={{ display: "block", fontFamily: COND, fontSize: 15, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap" }}>{STEP_TEXT[k].title}</span>
              </span>
            </button>
          );
        })}
      </div>
      {arrow(1)}
    </nav>
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
/* The flight panel is a sibling further down the tab: find it by its title. */
function scrollToFlight() {
  const span = [...document.querySelectorAll("span")].find((s) => s.textContent === FLIGHT_TITLE);
  (span?.closest("div")?.parentElement ?? span)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* initialStep lets a render gate draw any step. */
export function EvtolBuildLab({ params, SR, initialStep = 0 }) {
  const plan = useMemo(() => buildPlan(params, SR), [params, SR]);
  const [step, setStepRaw] = useState(initialStep);
  const [hl, setHl] = useState(null);
  const [ticks, setTicks] = useState(() => new Set());
  const [thumbs, setThumbs] = useState(null);
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef(null), leftRef = useRef(null);
  const [leftH, setLeftH] = useState(null);
  const dark = SC.bg === DARK.bg;
  const nSteps = plan.ready ? plan.steps.length : 1;
  const setStep = (f) => setStepRaw((i) => Math.min(nSteps - 1, Math.max(0, typeof f === "function" ? f(i) : f)));

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => setNarrow(el.clientWidth < 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan.ready]);
  useEffect(() => {
    const el = leftRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => setLeftH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan.ready]);
  /* A new plan keeps the step by name: a layout switch leaves the student
     on the same step when the new layout has it, else as near as it can. */
  const prevSteps = useRef(null);
  useEffect(() => {
    const was = prevSteps.current, now = plan.ready ? plan.steps : null;
    prevSteps.current = now;
    setThumbs(null);
    setStepRaw((i) => { const j = was && now ? now.indexOf(was[i]) : -1; return j >= 0 ? j : Math.min(i, nSteps - 1); });
  }, [plan]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan.ready) {
    return (
      <Panel title={LAB_TITLE} onSave={false}>
        <div data-lab-notice={plan.kind} style={{ fontSize: T.body, color: SC.muted, lineHeight: 1.6 }}>{plan.text}</div>
      </Panel>
    );
  }

  /* The arrow keys step the build only while focus is inside the lab.
     The app also turns its tabs on the arrow keys, from a listener on
     window (App.jsx); stopping the key here keeps a step from also
     switching the tab away from the lab. Outside the lab the app's keys
     work as before. */
  const onKey = (e) => {
    if (e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    setStep((i) => i + (e.key === "ArrowRight" ? 1 : -1));
    e.preventDefault(); e.stopPropagation();
  };
  const key = plan.steps[step], cur = plan.stepText(key);
  const needs = plan.needs(key), actions = plan.actions(key);
  const tick = (id) => setTicks((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const needsDone = needs.filter((_, i) => ticks.has(`${key}:need:${i}`)).length;
  const actsDone = actions.filter((_, i) => ticks.has(`${key}:do:${i}`)).length;

  return (
    <Panel title={LAB_TITLE} onSave={false}>
      <div ref={rootRef} tabIndex={-1} onKeyDown={onKey} data-evtol-build-lab="" style={{ outline: "none", display: "flex", flexWrap: "wrap", gap: S.md, alignItems: "flex-start" }}>
        <div ref={leftRef} style={{ flex: "1 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: S.md }}>
          <Hangar plan={plan} step={step} dark={dark} highlightKey={hl} narrow={narrow} onThumbs={setThumbs} />
          <StepStrip steps={plan.steps} step={step} setStep={setStep} thumbs={thumbs} />
        </div>

        <section aria-label={`Step ${step + 1}: ${cur.heading}`} style={{ ...panelBox(), flex: "1 1 360px", maxWidth: narrow ? "none" : 460, minWidth: 0, display: "flex", flexDirection: "column",
                   maxHeight: narrow || !leftH ? "none" : Math.max(560, leftH) }}>
          <div style={{ padding: `${S.lg}px ${S.lg}px 0`, overflowY: narrow ? "visible" : "auto", flex: "1 1 auto", minHeight: 0 }}>
            <div style={{ display: "flex", gap: S.md, alignItems: "center" }}>
              <span style={{ flex: "0 0 48px", height: 48, borderRadius: 24, display: "grid", placeItems: "center", background: ACC, color: ACC_INK, fontFamily: COND, fontSize: 21, fontWeight: 700 }}>{pad2(step)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={kickerStyle()}>{cur.kicker} · Step {step + 1} of {plan.steps.length}</div>
                <h2 style={{ margin: "2px 0 0", fontFamily: COND, fontSize: 28, lineHeight: 1.05, fontWeight: 700, textTransform: "uppercase", color: SC.text, letterSpacing: "0.01em" }}>{cur.heading}</h2>
              </div>
            </div>
            <p style={{ fontSize: T.body + 1, color: SC.text, lineHeight: 1.6, margin: `${S.md}px 0 0` }}>{cur.blurb}</p>

            {needs.length > 0 && (
              <>
                <SectionHead count={`${needsDone} / ${needs.length}`}>{key === "parts" ? "Bill of materials" : "You'll need"}</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {needs.map((x, i) => {
                    const id = `${key}:need:${i}`, on = ticks.has(id);
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
                    const id = `${key}:do:${i}`, on = ticks.has(id);
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

            {key === "review" && (
              <>
                <SectionHead>The build</SectionHead>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {plan.steps.slice(1, -1).map((k, i) => (
                    <button key={k} type="button" onClick={() => setStep(i + 1)} style={{ ...btn(false), padding: "3px 10px" }}>{STEP_TEXT[k].title}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: S.sm, flexWrap: "wrap", marginTop: S.md, alignItems: "center" }}>
                  <button type="button" onClick={scrollToFlight} style={btn(true)}>Fly the mission in 3D ↓</button>
                  <span style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5 }}>The 3D flight below flies this aircraft through its sized mission, and stops at each hover-to-wing step, which is not modelled.</span>
                </div>
              </>
            )}

            <SectionHead>Sized now</SectionHead>
            <div>
              {plan.spec.map(([k, x]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: S.sm, fontSize: T.label, borderTop: `1px solid ${SC.border}`, padding: "4px 0" }}>
                  <span style={{ color: SC.muted }}>{k}</span><span style={{ fontFamily: MONO, textAlign: "right", color: SC.text }}>{x}</span>
                </div>
              ))}
              <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5, margin: `${S.sm}px 0 0` }}>
                Every figure is the sizer's: its geometry and its result, as the OpenVSP tab's views draw them. Parts marked drawn are shapes the sizing does not model.
              </p>
            </div>
            <div style={{ height: S.md }} />
          </div>

          <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S.sm, padding: S.md, borderTop: `1px solid ${SC.border}` }}>
            <button type="button" disabled={step === 0} onClick={() => setStep((i) => i - 1)} style={{ ...btn(false), opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
            <span style={{ fontSize: T.micro, color: SC.subtle, fontFamily: MONO }}>← → steps</span>
            {step < plan.steps.length - 1
              ? <button type="button" onClick={() => setStep((i) => i + 1)} style={btn(true)}>Next: {STEP_TEXT[plan.steps[step + 1]].title} →</button>
              : <span />}
          </footer>
        </section>
      </div>
    </Panel>
  );
}
