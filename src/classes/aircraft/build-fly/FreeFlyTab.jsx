/* =====================================================================
   FLY · YOURSELF — the sized aeroplane, flown by hand
   =====================================================================
   Starts at the cruise point the class sized and hands the reader the
   throttle, the pitch (as a load-factor demand) and the bank. The flight
   model is free-flight.js: the class's own drag, engine, fuel and
   atmosphere, moved by GASP's point-mass equations. Every number it adds
   is printed below the view with where it comes from. The scene is
   three.js, fetched on demand (scene.js mountFree).
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { useDarkMode } from "../../../lib/display.js";
import { useUnitSystem } from "../../../lib/unit-system.jsx";
import { T, S, SANS, MONO } from "../../../ui/tokens.js";
import { fmt } from "../../ui-kit.jsx";
import { buildPlanOf } from "./plan.js";
import { freeFlightModel, initialState, step, readouts, freeFlightSources, ENDINGS, DRAWN, CLEAN_CLMAX } from "./free-flight.js";
import { ProvChip, Num, chip, primaryBtn, panel, kicker, useLazyScene } from "./ui.jsx";

const SPEEDS = [1, 2, 4];
const CAMERA_LABEL = { chase: "Chase", side: "Side", orbit: "Orbit (drag)" };
const SPIN_RAD_PER_S = 28;                 // a drawn propeller turn rate, for the eye only
const STICK_SLEW = 2.5, THROTTLE_SLEW = 0.4;   // per second, while a key or button is held
const KEYMAP = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down",
                 ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
                 "+": "more", "=": "more", PageUp: "more", "-": "less", _: "less", PageDown: "less" };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const pose = (st) => ({ x: st.x, z: st.z, h: st.h, psi: st.psi, gam: st.gam, phi: st.phi });

function Stat({ k, children }) {
  return (
    <div style={{ minWidth: 104 }}>
      <dt style={{ ...kicker(), fontSize: T.micro }}>{k}</dt>
      <dd style={{ margin: "2px 0 0", fontSize: T.body, color: SC.text, fontFamily: MONO }}>{children}</dd>
    </div>
  );
}

function HoldButton({ label, onHold, keyHint }) {
  const on = (v) => (e) => { e.preventDefault(); onHold(v); };
  return (
    <button type="button" onPointerDown={on(true)} onPointerUp={on(false)} onPointerLeave={on(false)} onPointerCancel={on(false)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") on(true)(e); }} onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") on(false)(e); }}
      aria-label={`${label} (hold)`} style={{ ...chip(false), minWidth: 104, touchAction: "none", userSelect: "none" }}>
      {label} <span style={{ color: SC.subtle, fontFamily: MONO }}>{keyHint}</span>
    </button>
  );
}

export function AircraftFreeFlyTab({ result, setTab }) {
  const dark = useDarkMode();
  const { system } = useUnitSystem();
  const plan = useMemo(() => buildPlanOf(result), [result]);
  const clInfo = CLEAN_CLMAX[result?.type];
  const [clMax, setClMax] = useState(null);
  const model = useMemo(() => freeFlightModel(result, { clMax: clMax ?? undefined }), [result, clMax]);
  const ok = plan.ok && model.ok;
  const sources = useMemo(() => (model.ok ? freeFlightSources(model) : []), [model]);

  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState("chase");
  /* The first state exists on the first render, so the readouts (and the
     canvas) are on the page from the start, server render included. */
  const uiOf = (st) => ({ ...readouts(model, st), ended: null, trimShort: st.trimShort, trimNeedKN: st.trimNeedKN, trimHaveKN: st.trimHaveKN });
  const [ui, setUi] = useState(() => (model.ok ? uiOf(initialState(model)) : null));
  const canvasRef = useRef(null), wrapRef = useRef(null);
  const simRef = useRef(null), spinRef = useRef(0);
  const input = useRef({ stick: 0, roll: 0, throttle: 0, held: new Set() });
  const live = useRef(null);
  live.current = { plan, model, dark, cam, speed };

  const ready = ok && ui !== null;
  const api = useLazyScene(canvasRef, ready, (m, canvas) => {
    const L = live.current;
    const a = m.mountFree({ canvas, plan: L.plan, dark: L.dark });
    a.setCamera(L.cam);
    if (simRef.current) a.update(pose(simRef.current), spinRef.current);
    return a;
  });

  /* A new sizing, or a new CLmax: back to the cruise point. */
  const restart = () => {
    if (!model.ok) return;
    const st = initialState(model);
    simRef.current = st;
    input.current = { stick: 0, roll: 0, throttle: st.throttle, held: new Set() };
    setUi(uiOf(st));
    api.current?.clearTrail();
    api.current?.update(pose(st), spinRef.current);
  };
  useEffect(() => { setRunning(false); restart(); }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setPlan?.(plan); }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setCamera(cam); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setDark(dark); }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The flight clock: fixed steps of DRAWN.dtS, as many as the frame's
     time (at the chosen speed) holds. The view moves every frame; the
     readouts follow ten times a second. */
  useEffect(() => {
    if (!running || !ok) return undefined;
    let raf = 0, prev = performance.now(), lastUi = 0, owed = 0;
    const tick = (now) => {
      const { model: M, speed: k } = live.current;
      const dtReal = Math.min(0.1, (now - prev) / 1000); prev = now;
      owed += dtReal * k;
      const inp = input.current, held = inp.held;
      let st = simRef.current;
      while (owed >= DRAWN.dtS && !st.ended) {
        const want = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0);
        const ds = STICK_SLEW * DRAWN.dtS;
        inp.stick = want === 0 ? 0 : Math.max(-1, Math.min(1, inp.stick + Math.sign(want - inp.stick) * Math.min(ds, Math.abs(want - inp.stick))));
        inp.roll = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
        if (held.has("more")) inp.throttle = Math.min(1, inp.throttle + THROTTLE_SLEW * DRAWN.dtS);
        if (held.has("less")) inp.throttle = Math.max(0, inp.throttle - THROTTLE_SLEW * DRAWN.dtS);
        st = step(M, st, inp);
        owed -= DRAWN.dtS;
      }
      simRef.current = st;
      spinRef.current += dtReal * SPIN_RAD_PER_S * Math.min(1, inp.throttle + 0.2);
      api.current?.update(pose(st), spinRef.current);
      if (st.ended || now - lastUi > 100) { lastUi = now; setUi((u) => ({ ...u, ...readouts(M, st), ended: st.ended })); }
      if (st.ended) { setRunning(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, ok]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Keys act while the view has focus, so the page still scrolls and the
     rest of the studio keeps its own keys. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const down = (e) => {
      if (e.key === " ") { e.preventDefault(); setRunning((r) => !r && !simRef.current?.ended); return; }
      const a = KEYMAP[e.key]; if (!a) return;
      e.preventDefault(); input.current.held.add(a);
    };
    const up = (e) => { const a = KEYMAP[e.key]; if (a) input.current.held.delete(a); };
    const blur = () => input.current.held.clear();
    el.addEventListener("keydown", down); el.addEventListener("keyup", up); el.addEventListener("blur", blur);
    return () => { el.removeEventListener("keydown", down); el.removeEventListener("keyup", up); el.removeEventListener("blur", blur); };
  }, [ready]);

  const hold = (a) => (v) => { if (v) input.current.held.add(a); else input.current.held.delete(a); };

  if (!ok) {
    return <section style={panel()}><div style={kicker()}>Fly · yourself</div>
      <p style={{ color: SC.warning, fontSize: T.body, fontFamily: SANS }}>{plan.ok ? model.refusal : plan.refusal}</p></section>;
  }
  if (!ui) return <section style={panel()}><div style={kicker()}>Fly · yourself · {plan.label}</div></section>;

  const vs = system === "IMP" ? `${fmt(ui.vsFpm, 0)} ft/min` : `${fmt(ui.vsFpm * 0.3048 / 60, 1)} m/s`;
  const status = ui.ended ? "Flight ended"
    : !running ? (ui.timeS > 0 ? "Paused" : "Ready at the cruise point")
    : `${Math.abs(ui.vsFpm) < 100 ? "Level" : ui.vsFpm > 0 ? "Climbing" : "Descending"}${Math.abs(ui.bankDeg) > 3 ? `, turning ${ui.bankDeg > 0 ? "right" : "left"}` : ""}`;

  return (
    <section style={panel()} aria-label="Fly the sized aeroplane yourself">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: S.sm }}>
        <div>
          <div style={kicker()}>Fly · yourself · {plan.label}</div>
          <h2 style={{ margin: `${S.xs}px 0 0`, fontSize: T.lead, fontFamily: SANS, color: SC.text, fontWeight: 600 }}>{status}</h2>
        </div>
        <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>True scale · real time at 1×</div>
      </div>

      <dl style={{ display: "flex", flexWrap: "wrap", gap: `${S.sm}px ${S.lg}px`, margin: `${S.md}px 0`, fontFamily: SANS }}>
        <Stat k="True airspeed"><Num v={ui.tasKt} u="kt" /></Stat>
        <Stat k="Equivalent airspeed"><Num v={ui.easKt} u="kt" /></Stat>
        <Stat k="Mach">{fmt(ui.mach, 3)}</Stat>
        <Stat k="Altitude"><Num v={ui.altFt} u="ft" /></Stat>
        <Stat k="Vertical speed">{vs}</Stat>
        <Stat k="Heading">{fmt(ui.headingDeg, 0)}°</Stat>
        <Stat k="Bank">{fmt(ui.bankDeg, 0)}°</Stat>
        <Stat k="Load factor">{fmt(ui.n, 2)} g</Stat>
        <Stat k="Throttle">{fmt(ui.throttle * 100, 0)} %</Stat>
        <Stat k="Fuel on board"><Num v={ui.fuelKg} u="kg" /></Stat>
        <Stat k="Fuel flow">{fmt(ui.fuelKgH, 0)} kg/h</Stat>
        <Stat k="Thrust / drag"><Num v={ui.thrustKN} u="kN" d={1} /> / <Num v={ui.dragKN} u="kN" d={1} /></Stat>
        <Stat k="Stall speed, 1 g"><Num v={ui.stallEasKt} u="kt" /> EAS</Stat>
        <Stat k="Distance · time"><Num v={ui.distanceNm} u="nm" d={1} /> · {clock(ui.timeS)}</Stat>
      </dl>

      {ui.trimShort && ui.timeS === 0 && (
        <p style={{ fontSize: T.body, color: SC.caution, fontFamily: SANS, margin: `0 0 ${S.md}px`, lineHeight: 1.5 }}>
          At full throttle this aeroplane cannot hold its sized cruise speed at this height: level flight here needs{" "}
          <Num v={ui.trimNeedKN} u="kN" d={2} /> of thrust and the engine gives <Num v={ui.trimHaveKN} u="kN" d={2} />, so it slowly loses speed.
          {result.type === "trainer" && " The sizing flags the same: its 75 % cruise power is not available at this altitude by its own power lapse."}
        </p>
      )}

      <div role="status" aria-live="polite" style={{ minHeight: 22, marginBottom: S.sm, fontFamily: SANS, fontSize: T.body }}>
        {ui.ended
          ? <span style={{ color: SC.warning }}>{ENDINGS[ui.ended]}{ui.ended === "ceiling" ? ` Here that is ${model.ceiling.why}.` : ""}</span>
          : ui.warnings.map((w) => <div key={w.key + w.text} style={{ color: w.key === "stall" || w.key === "fuel" ? SC.warning : SC.caution }}>{w.text}</div>)}
      </div>

      <div ref={wrapRef} tabIndex={0} aria-label="Flight view: click here, then fly with the keys"
        style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", minHeight: 300, borderRadius: 10, overflow: "hidden",
                 border: `1px solid ${SC.border}`, background: SC.inset, outlineOffset: 2 }}>
        <canvas ref={canvasRef} role="img" aria-label={`The sized ${plan.label} in free flight: ${status.toLowerCase()}`}
          style={{ width: "100%", height: "100%", display: "block" }} />
        <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: T.micro, color: SC.muted, fontFamily: MONO,
                      background: SC.panel, opacity: 0.9, padding: "3px 8px", borderRadius: 6, pointerEvents: "none" }}>
          click the view · ↑/W nose up · ↓/S nose down · ←/A →/D bank · +/− throttle · space pause
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: S.sm, marginTop: S.md }}>
        <button type="button" style={primaryBtn()} disabled={!!ui.ended}
          onClick={() => { setRunning((r) => !r); wrapRef.current?.focus(); }}>{running ? "❚❚ Pause" : ui.timeS > 0 ? "▶ Resume" : "▶ Fly"}</button>
        <button type="button" style={chip(false)} onClick={() => { setRunning(false); restart(); }}>↺ Back to the cruise point</button>
        <span style={{ width: 1, height: 22, background: SC.border }} />
        {SPEEDS.map((k) => <button key={k} type="button" style={chip(speed === k)} aria-pressed={speed === k} onClick={() => setSpeed(k)}>{k}×</button>)}
        <span style={{ width: 1, height: 22, background: SC.border }} />
        {Object.entries(CAMERA_LABEL).map(([k, v]) => <button key={k} type="button" style={chip(cam === k)} aria-pressed={cam === k} onClick={() => setCam(k)}>{v}</button>)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: S.sm, marginTop: S.md }}>
        <HoldButton label="Nose up" keyHint="↑" onHold={hold("up")} />
        <HoldButton label="Nose down" keyHint="↓" onHold={hold("down")} />
        <HoldButton label="Bank left" keyHint="←" onHold={hold("left")} />
        <HoldButton label="Bank right" keyHint="→" onHold={hold("right")} />
        <label style={{ display: "flex", alignItems: "center", gap: S.sm, fontSize: T.label, color: SC.muted, fontFamily: SANS, flex: "1 1 220px" }}>
          Throttle
          <input type="range" min={0} max={100} step={1} value={Math.round(ui.throttle * 100)} style={{ flex: 1, minWidth: 120, accentColor: SC.caution }}
            onChange={(e) => { const v = Number(e.target.value) / 100; input.current.throttle = v;
                               if (simRef.current) simRef.current = { ...simRef.current, throttle: v }; setUi((u) => ({ ...u, throttle: v })); }} />
          <span style={{ fontFamily: MONO, color: SC.text, minWidth: 44 }}>{fmt(ui.throttle * 100, 0)} %</span>
        </label>
      </div>

      {clInfo?.prov === "assumed" && (
        <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: S.sm, marginTop: S.md, fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
          Clean CLmax <ProvChip prov="assumed" />
          <input type="range" min={clInfo.range[0]} max={clInfo.range[1]} step={0.05} value={model.clMax}
            onChange={(e) => setClMax(Number(e.target.value))} style={{ flex: "1 1 160px", maxWidth: 260, accentColor: SC.caution }} />
          <span style={{ fontFamily: MONO, color: SC.text }}>{fmt(model.clMax, 2)}</span>
          <span>within Scholz's {clInfo.range[0]}–{clInfo.range[1]} for this kind of aeroplane; changing it restarts the flight</span>
        </label>
      )}

      <div style={{ marginTop: S.lg }}>
        <div style={{ fontSize: T.body, fontFamily: SANS, color: SC.text, fontWeight: 600, marginBottom: S.sm }}>Where each piece of the flight comes from</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.label, fontFamily: SANS }}>
            <tbody>
              {sources.map((s) => (
                <tr key={s.what} style={{ borderTop: `1px solid ${SC.border}` }}>
                  <td style={{ padding: "7px 8px", color: SC.text, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{s.what}</td>
                  <td style={{ padding: "7px 8px", verticalAlign: "top" }}><ProvChip prov={s.prov} /></td>
                  <td style={{ padding: "7px 8px", color: SC.muted, lineHeight: 1.5 }}>{s.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul style={{ margin: `${S.md}px 0 0`, paddingLeft: 18, fontSize: T.label, color: SC.muted, fontFamily: SANS, lineHeight: 1.6 }}>
        <li>The flight starts in the air at the sized cruise point. This sizing has no take-off or landing model, so there is no runway, and reaching the ground ends the flight.</li>
        <li>A design study's flight model, not an FAA-qualified flight simulation training device: it earns no flight-training credit and is not flight data for any real aeroplane.</li>
      </ul>

      <div style={{ marginTop: S.md }}>
        <button type="button" style={chip(false)} onClick={() => setTab?.("fly")}>← Fly · mission</button>
      </div>
    </section>
  );
}
