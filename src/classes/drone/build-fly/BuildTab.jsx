/* =====================================================================
   BUILD — the guided drone build (Drone Sizer · Build)
   =====================================================================
   Nine steps, frame to review, over the ONE design the whole studio
   reads (design-state.js): picking a part here is the same edit as
   picking it on the Sizing tab, and the sizing re-closes as you go. The
   spec sheet on the right is sizeDrone()'s result, never a number this
   tab works out. The hangar view draws the parts as they are chosen;
   it is a drawing (drone-scene.js lists what is to scale and what is
   not), loaded with three.js only when this tab opens.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { T, S, MONO, SANS } from "../../../ui/tokens.js";
import { Card, Kpi } from "../../ui-kit.jsx";
import { FRAME_CLASSES, framesOfClass } from "../../../data/drone-frames.js";
import { MODELLABLE_MOTORS, BLDC_MOTORS, ESCS, BATTERIES, FLIGHT_CONTROLLERS } from "../../../data/drone-components.js";
import { PROP_CHOICES } from "../design-state.js";
import { buildAirframe } from "../geometry3d.js";
import FrameDiagram from "../FrameDiagram.jsx";
import { BUILD_STEPS, rotorMismatch, massLabelG, stepSummary, isFourInOne } from "./build-steps.js";

const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const MASS_COLOURS = { Payload: "#4ea1ff", Structure: "#9b8cff", Avionics: "#54c7a8", Propulsion: "#f2a33c", Battery: "#e0574a" };

function btn(primary, on = false) {
  return { padding: "7px 14px", fontSize: T.label, borderRadius: 4, cursor: "pointer", fontFamily: SANS,
    background: primary ? SC.primary : on ? SC.inset : "transparent", color: primary ? SC.bg : SC.text,
    border: `1px solid ${primary ? SC.primary : on ? SC.caution : SC.border}`, fontWeight: primary ? 600 : 400 };
}

function PartCard({ on, onClick, title, lines, foot, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ textAlign: "left", cursor: "pointer", fontFamily: SANS, background: on ? SC.inset : SC.panel,
               border: `1px solid ${on ? SC.caution : SC.border}`, borderRadius: 6, padding: S.sm, color: SC.text,
               boxShadow: on ? `0 0 0 1px ${SC.caution}` : "none", display: "flex", flexDirection: "column", gap: 4, minHeight: 74 }}>
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
                 border: `1px solid ${SC.border}`, borderRadius: 4, padding: "5px 7px" }} />
      {hint && <div style={{ fontSize: T.micro, color: SC.subtle, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </label>
  );
}

const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: S.sm });

/* ── The hangar: three.js, fetched when the tab opens. ── */
function Hangar({ airframe, step, dark, payload }) {
  const canvasRef = useRef(null), apiRef = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    if (!airframe || typeof window === "undefined") return undefined;
    let cancelled = false;
    import("./drone-scene.js").then((mod) => {
      if (cancelled || !canvasRef.current) return;
      try {
        apiRef.current = mod.mountHangar({ canvas: canvasRef.current, airframe, dark, step, payload });
        setState("ready");
      } catch (e) { setState(`unavailable: ${e.message}`); }
    }).catch((e) => setState(`unavailable: ${e.message}`));
    const ro = window.ResizeObserver ? new window.ResizeObserver(() => apiRef.current?.resize()) : null;
    if (ro && canvasRef.current) ro.observe(canvasRef.current);
    return () => { cancelled = true; ro?.disconnect(); apiRef.current?.dispose(); apiRef.current = null; };
  }, [!!airframe]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (airframe) apiRef.current?.setAirframe(airframe, { payload }); }, [airframe, payload]);
  useEffect(() => { apiRef.current?.setStep(step); }, [step]);
  useEffect(() => { apiRef.current?.setDark(dark); }, [dark]);
  return (
    <div style={{ position: "relative", height: 320, borderRadius: 6, overflow: "hidden", border: `1px solid ${SC.border}`, background: SC.inset }}>
      <canvas ref={canvasRef} aria-label="Hangar: the drone as built so far" style={{ width: "100%", height: "100%", display: "block" }} />
      {state !== "ready" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: SC.muted, fontSize: T.label }}>
          {airframe ? (state === "loading" ? "Loading the 3D hangar…" : `3D view ${state}`) : "Pick a frame the airframe builder can lay out."}
        </div>
      )}
      <div style={{ position: "absolute", left: 8, bottom: 6, fontSize: T.micro, color: SC.subtle, fontFamily: MONO }}>
        drag to turn · arms, rotors and spin directions from the airframe builder · blocks drawn
      </div>
    </div>
  );
}

/* ── The spec sheet: sizeDrone()'s result. ── */
function SpecSheet({ design, mismatch }) {
  const match = () => design.set("rotors")(mismatch.frame);
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
    <Card title="Spec sheet · sized">
      <div style={{ fontSize: T.label, fontFamily: MONO, color: ok ? SC.nominal : SC.warning, marginBottom: S.sm }}>
        {ok ? `● ${result.status}${result.meetsMission ? " · meets the mission" : " · does NOT meet the mission"}` : `● ${result.status}: ${result.reason ?? ""}`}
      </div>
      {!ok && result.detail && <p style={{ fontSize: T.micro, color: SC.muted, lineHeight: 1.5, margin: `0 0 ${S.sm}px` }}>{result.detail}</p>}
      {mismatch && (
        <div style={{ margin: `0 0 ${S.sm}px` }}>
          <p style={{ fontSize: T.micro, color: SC.warning, lineHeight: 1.5, margin: "0 0 4px" }}>
            The sizing has {mismatch.sized} rotors but the frame has {mismatch.frame}.</p>
          <button type="button" onClick={match} style={{ ...btn(false, true), padding: "3px 10px" }}>Size it with {mismatch.frame} rotors</button>
        </div>
      )}
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
    </Card>
  );
}

/* initialStep lets the render gate draw every step; the studio opens at 1. */
export default function BuildTab({ design, frame, pickFrame, onFly, dark, initialStep = 0 }) {
  const { v, set, built, result, ok } = design;
  const [step, setStep] = useState(initialStep);
  const [cls, setCls] = useState(frame?.frameClass ?? "QUAD");
  const [band, setBand] = useState("all");
  const mismatch = rotorMismatch(v, frame);

  const airframe = useMemo(() => {
    if (!frame || !built.propeller) return null;
    try { return buildAirframe({ frame, propellerDiameterM: built.propeller.diameterM, tipGapFraction: 0.10 }); }
    catch { return null; }
  }, [frame, built.propeller]);

  const choose = (f) => { pickFrame(f.frameClass, f.frameType); set("rotors")(f.motorCount); };
  const notModellable = BLDC_MOTORS.length - MODELLABLE_MOTORS.length;
  const bands = [["all", "All", () => true], ["s", "≤ 10 in", (p) => p.diameterIn <= 10],
                 ["m", "10–14 in", (p) => p.diameterIn > 10 && p.diameterIn <= 14], ["l", "> 14 in", (p) => p.diameterIn > 14]];
  const props = PROP_CHOICES.filter(bands.find((b) => b[0] === band)[2]);
  const cur = BUILD_STEPS[step];

  let body = null;
  if (cur.key === "frame") body = (
    <>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S.sm }}>
        {FRAME_CLASSES.map((c) => <button key={c} type="button" aria-pressed={c === cls} onClick={() => setCls(c)} style={btn(false, c === cls)}>{c}</button>)}
      </div>
      <div style={grid(150)}>
        {framesOfClass(cls).map((f) => (
          <PartCard key={f.frameType} on={frame?.frameClass === f.frameClass && frame?.frameType === f.frameType && !mismatch}
            onClick={() => choose(f)} title={`${f.frameClass} ${f.frameType}`} lines={[`${f.motorCount} motors`]}>
            <div style={{ alignSelf: "center" }}><FrameDiagram frame={f} size={96} caption={false} /></div>
          </PartCard>
        ))}
      </div>
      <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.5, margin: `${S.sm}px 0 0` }}>
        Motor numbers are ArduPilot output channels and rotation is the propeller seen from above, both read from AP_MotorsMatrix.cpp.
        The diagrams are not to scale; the hangar above lays the arms out from the propeller you size in step 3.
      </p>
      {airframe?.coaxialUnmodelled && <p style={{ fontSize: T.micro, color: SC.warning, lineHeight: 1.5 }}>{airframe.coaxialUnmodelled}</p>}
    </>
  );
  if (cur.key === "motor") body = (
    <>
      <div style={grid(200)}>
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
      <div style={{ ...grid(150), maxHeight: 290, overflowY: "auto", paddingRight: 4 }}>
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
    <div style={grid(200)}>
      {ESCS.map((e) => (
        <PartCard key={e.id} on={built.esc?.id === e.id} onClick={() => set("escId")(e.id)}
          title={e.model} lines={[`${e.continuous_current_a != null ? `${e.continuous_current_a} A continuous` : "continuous current not published"}${e.burst_current_a ? ` · ${e.burst_current_a} A burst` : ""}`,
                                  e.lipo_cell_count_min ? `${e.lipo_cell_count_min}–${e.lipo_cell_count_max} S` : null, massLabelG(e.mass_g)]}
          foot={isFourInOne(e) ? `${e.manufacturer} · 4-in-1 board: the sizing counts its whole mass once per motor` : e.manufacturer} />
      ))}
    </div>
  );
  if (cur.key === "cell") body = (
    <div style={grid(210)}>
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
      <div style={{ fontSize: T.label, fontFamily: MONO, color: SC.text, lineHeight: 1.8 }}>
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
      <div style={{ flex: "1 1 260px" }}>
        <div style={{ fontSize: T.label, color: SC.muted, marginBottom: 4 }}>For scale: flight-controller module masses in the catalogue</div>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
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
    <div style={grid(230)}>
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
        {ok && mismatch && <span style={{ fontSize: T.label, color: SC.warning }}>Match the rotor count to the frame first (step 1).</span>}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, alignItems: "flex-start" }}>
      <nav aria-label="Build steps" style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 230px", maxWidth: 300, minWidth: 0 }}>
        {BUILD_STEPS.map((s, i) => {
          const on = i === step, done = i < step;
          return (
            <button key={s.key} type="button" aria-current={on ? "step" : undefined} onClick={() => setStep(i)}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", cursor: "pointer", fontFamily: SANS, padding: "7px 9px",
                       background: on ? SC.inset : "transparent", border: `1px solid ${on ? SC.caution : SC.border}`, borderRadius: 6, color: SC.text }}>
              <span style={{ flex: "0 0 22px", height: 22, borderRadius: 11, display: "grid", placeItems: "center", fontSize: T.micro, fontFamily: MONO,
                             background: done ? SC.caution : on ? SC.primary : "transparent", color: done || on ? SC.bg : SC.muted, border: `1px solid ${done ? SC.caution : SC.border}` }}>
                {done ? "✓" : i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: T.label, fontWeight: on ? 600 : 500 }}>{s.title}</span>
                <span style={{ display: "block", fontSize: T.micro, color: SC.subtle, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                  {stepSummary(s.key, design, frame)}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ flex: "100 1 540px", minWidth: 0 }}>
        <Hangar airframe={airframe} step={step} dark={dark} payload={v.payloadKg > 0} />
        <Card title={`Step ${step + 1} of ${BUILD_STEPS.length} · ${cur.title}`}>
          <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5, margin: `0 0 ${S.sm}px` }}>{cur.blurb}</p>
          {body}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: S.md, gap: S.sm }}>
            <button type="button" disabled={step === 0} onClick={() => setStep((i) => Math.max(0, i - 1))} style={{ ...btn(false), opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
            {step < BUILD_STEPS.length - 1 && <button type="button" onClick={() => setStep((i) => i + 1)} style={btn(true)}>Next: {BUILD_STEPS[step + 1].title} →</button>}
          </div>
        </Card>
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 0, maxWidth: 420 }}>
        <SpecSheet design={design} mismatch={mismatch} />
      </div>
    </div>
  );
}
