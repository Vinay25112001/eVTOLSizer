/* =====================================================================
   DRONE DESIGN STUDIO — the small-UAS half of the sizing tool
   =====================================================================
   Shown when the design mode is "drone" (Root.jsx). Its own inputs, its
   own tabs and — when it exists — its own engine. The eVTOL sizer and the
   aircraft studio are not imported and not changed.

   WHY THIS IS A THIRD MODE AND NOT A FOURTH AIRCRAFT TYPE.
   The eVTOL engine already sizes multicopters, but its mass correlations
   are fitted over a validation set spanning 620-3724 kg. A 2 kg quadcopter
   is between 25x and 15000x below that range, and reusing those
   correlations there would be exactly the silent extrapolation this
   project refuses elsewhere. The physics (momentum theory, atmosphere,
   spin arrangement) is scale-free and will be shared; the correlations
   are not, and are not.

   There is a deeper difference that shapes the whole studio. At airliner
   scale component masses are ESTIMATED from correlations and the error
   floor is the correlation's. At drone scale they are not estimated at
   all: you select a real motor, a real propeller, a real pack, each with
   a datasheet mass, and add them up. Drone sizing is a component
   SELECTION problem, not a correlation problem — which is why a tight
   accuracy target is reachable here, and why the component catalogue is
   the foundation rather than an accessory.

   STATE OF THIS FILE. The frame tab is real: it draws from generated
   data taken from ArduPilot's flight code. The physics tabs are declared
   and empty. They say so plainly rather than showing a plausible number,
   because a number with nothing behind it is the one thing this tool must
   never print.
   ===================================================================== */
import { useMemo, useState } from "react";
import { SC, applyTheme } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, th, td } from "../ui-kit.jsx";
import { appVersionLabel } from "../../lib/designfile.js";
import DesignModeSwitch from "../aircraft/DesignModeSwitch.jsx";
import { SharedAuthBar } from "../../lib/auth-session.jsx";
import { FRAMES, FRAME_CLASSES, FRAME_SOURCE, FRAMES_OMITTED, framesOfClass } from "../../data/drone-frames.js";
import { ALL_COMPONENTS, CATEGORIES, BLDC_MOTORS, MODELLABLE_MOTORS } from "../../data/drone-components.js";
import { PROPELLERS, PROPELLER_SOURCE } from "../../data/drone-propellers.js";
import { staticThrustN, staticShaftPowerW, figureOfMerit, RHO_SEA_LEVEL } from "./rotor.js";
import { CONVENTION_ONLY } from "../../data/drone-regulatory.js";
import { classify } from "./classify.js";
import FrameDiagram from "./FrameDiagram.jsx";
import SizingPanel from "./SizingPanel.jsx";
import PropulsionPanel from "./PropulsionPanel.jsx";
import EndurancePanel from "./EndurancePanel.jsx";
import TradePanel from "./TradePanel.jsx";
import Drone3D from "./Drone3D.jsx";
import FlightPanel from "./FlightPanel.jsx";
import RiskPanel from "./RiskPanel.jsx";
import AvionicsPanel from "./AvionicsPanel.jsx";
import AutopilotPanel from "./AutopilotPanel.jsx";
import { useDroneDesign } from "./design-state.js";

/* ── THE ACCURACY GATE ────────────────────────────────────────────────
   Every row is a target the tool will be held to, with the measured data
   that enforces it. The rows are not aspirations: each names a truth set
   that is on disk. The last two rows are deliberately WEAKER than the
   headline "<5%" this work started from, because the evidence does not
   support 5% there — manufacturers publish hover endurance with no stated
   conditions, and for hybrid VTOL no flight-validated comparison exists
   in the published literature at all. Recording that is the point. */
const ACCURACY = Object.freeze([
  { layer: "Rotor aero, hover and axial", gate: "5 %", truth: "UIUC: 4,177 static + 26,045 dynamic measured rows",
    note: "0.504 % thrust uncertainty — the truth set is 10x finer than the gate", state: "planned" },
  { layer: "Motor + ESC electrical", gate: "5 %", truth: "KDE: 420 measured points, conditions stated",
    note: "constants and dyno points from one vendor, so no fitted fudge factor", state: "planned" },
  { layer: "Battery cell + Peukert", gate: "3 %", truth: "Molicel measured discharge curves",
    note: "published methods reach 1.3 % on cell voltage", state: "planned" },
  { layer: "Component mass sum", gate: "1 %", truth: "105 sourced datasheets",
    note: "arithmetic on published masses, not prediction", state: "planned" },
  { layer: "Multirotor hover endurance", gate: "10 %", truth: "7 vehicles, hover-basis rows only",
    note: "NOT 5 %: vendors publish flight time with no stated conditions", state: "planned" },
  { layer: "Hybrid VTOL", gate: "15 %, tool-vs-tool", truth: "reference designs",
    note: "NOT flight-validated: no such comparison exists in the literature", state: "planned" },
]);

const PHASES = Object.freeze([
  ["Frame geometry", "done", "Motor number, arm angle and propeller rotation, generated from ArduPilot's flight code."],
  ["Component catalogue", "done", "105 sourced entries, every numeric field traced to a URL; motor resistance and no-load current carry the convention and reference voltage the vendor stated, or are held back."],
  ["Propulsion core", "part", "Rotor block done: measured coefficients from 262 propellers, gated at a median 0.44 % against 3,621 held-out points. Motor, ESC and battery next."],
  ["Vehicle loop", "planned", "Figure of merit as a declared input with its measured range, never a buried constant."],
  ["Autopilot export", "planned", "ArduPilot .param, QGC .params, .waypoints and .plan files."],
  ["Hybrid VTOL", "planned", "Fixed mass, battery as the residual, endurance as the output."],
]);

const TABS = Object.freeze([
  ["frame", "Frame"],
  ["components", "Components"],
  ["propulsion", "Propulsion"],
  ["sizing", "Sizing"],
  ["trade", "Trade study"],
  ["airframe", "3D airframe"],
  ["flight", "Flight sim"],
  ["risk", "Risk & uncertainty"],
  ["endurance", "Battery & endurance"],
  ["avionics", "ESC & radio"],
  ["class", "Class & rules"],
  ["autopilot", "Autopilot"],
  ["accuracy", "Accuracy & sources"],
]);

function syncUrl(tab, frameClass, frameType) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  q.delete("class"); q.delete("type"); q.delete("atab");
  q.set("mode", "drone"); q.set("dtab", tab);
  q.set("frame", `${frameClass}/${frameType}`);
  window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
}

/* A tab that has not been built yet. It states what will go in it and what
   has to be true before it can — never a placeholder number. */
function NotBuilt({ title, needs, children }) {
  return (
    <Card title={title}>
      <p style={{ fontSize: T.body, color: SC.text, lineHeight: 1.6, margin: `0 0 ${S.sm}px` }}>{children}</p>
      <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, margin: 0,
                  borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
        <b style={{ color: SC.caution }}>Not computed yet.</b> {needs} Nothing is shown here
        until it is, because a plausible number with nothing behind it is worse
        than an empty panel.
      </p>
    </Card>
  );
}

export default function DroneStudio() {
  const design = useDroneDesign();
  const qs = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [dark, setDark] = useState(() => (qs.get("theme") === "light" ? false : qs.get("theme") === "dark" ? true
    : (typeof window !== "undefined" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true) : true)));
  applyTheme(dark);

  const [frameClass, setFrameClass] = useState(() => {
    const f = (qs.get("frame") || "").split("/")[0];
    return FRAME_CLASSES.includes(f) ? f : "QUAD";
  });
  const [frameType, setFrameType] = useState(() => {
    const [c, t] = (qs.get("frame") || "").split("/");
    return FRAMES.some((x) => x.frameClass === c && x.frameType === t) ? t : "X";
  });
  const [tab, setTab] = useState(() => (TABS.some(([k]) => k === qs.get("dtab")) ? qs.get("dtab") : "frame"));

  const types = useMemo(() => framesOfClass(frameClass), [frameClass]);
  const frame = useMemo(
    () => FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType) ?? types[0] ?? null,
    [frameClass, frameType, types]);

  if (typeof window !== "undefined" && frame) syncUrl(tab, frame.frameClass, frame.frameType);

  const pickClass = (c) => {
    setFrameClass(c);
    const ts = framesOfClass(c);
    if (!ts.some((t) => t.frameType === frameType)) setFrameType(ts[0]?.frameType);
  };

  const chip = (on) => ({ padding: "5px 11px", fontSize: T.label, borderRadius: 3, cursor: "pointer", fontFamily: SANS,
    background: on ? SC.inset : "transparent", color: on ? SC.text : SC.muted,
    border: `1px solid ${on ? SC.caution : SC.border}` });

  /* Two invariants of a balanced multirotor, recomputed from the drawn data
     rather than asserted: diagonally opposite motors share a rotation, and
     the CW and CCW counts balance so hover has no net yaw. */
  const balance = useMemo(() => {
    if (!frame) return null;
    const cw = frame.motors.filter((m) => m.rotation === "CW").length;
    return { cw, ccw: frame.motors.length - cw, balanced: cw * 2 === frame.motors.length };
  }, [frame]);

  /* How many motors state each resistance convention. Counted from the data
     rather than written down, so it tracks the catalogue. */
  const conventionCounts = useMemo(() => {
    const by = new Map();
    for (const m of BLDC_MOTORS) by.set(m.resistance_convention, (by.get(m.resistance_convention) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  /* The propeller shown in the Propulsion tab. Defaults to a widely used
     10x4.7 if the database has one, so the tab opens on something familiar. */
  const [propId, setPropId] = useState(
    () => (PROPELLERS.find((p) => p.id.startsWith("apce_10x4.7")) ?? PROPELLERS[0]).id);
  const prop = useMemo(() => PROPELLERS.find((p) => p.id === propId) ?? PROPELLERS[0], [propId]);
  /* Every measured point, with what the rotor module computes there. Nothing
     is interpolated here: these are the measured RPMs themselves, so the
     table shows the data and the arithmetic, not a fit through them. */
  const rotorRows = useMemo(() => prop.static.map(([rpm, ct, cp]) => {
    const t = staticThrustN(prop, rpm).thrustN;
    const w = staticShaftPowerW(prop, rpm).powerW;
    return { rpm, ct, cp, thrustG: t / 9.80665 * 1000, powerW: w,
             gPerW: (t / 9.80665 * 1000) / w, fm: figureOfMerit(prop, rpm).fm };
  }), [prop]);

  /* Take-off mass for the class lookup. A user-entered number, not a sized
     one: nothing sizes a vehicle yet, so this asks rather than pretends. */
  const [mtomKg, setMtomKg] = useState(2.0);
  const classed = useMemo(() => {
    try { return classify(mtomKg, { rotors: frame?.motorCount ?? 4 }); }
    catch { return null; }
  }, [mtomKg, frame]);

  return (
    <div style={{ background: SC.bg, color: SC.text, minHeight: "100vh", fontFamily: SANS }}>
      <style>{"body{margin:0}"}</style>
      <header style={{ background: SC.panel, borderBottom: `1px solid ${SC.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 18px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1, color: SC.primary }}>
              Drone Sizer
            </div>
            <div style={{ fontSize: 11, color: SC.subtle, fontFamily: MONO, lineHeight: 1 }}>{appVersionLabel()}</div>
          </div>
          <DesignModeSwitch mode="drone" />
          <span style={{ width: 1, alignSelf: "stretch", background: SC.border }} />
          <nav aria-label="Frame class" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FRAME_CLASSES.map((c) => (
              <button key={c} type="button" aria-pressed={c === frameClass} onClick={() => pickClass(c)}
                style={chip(c === frameClass)}>{c}</button>
            ))}
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" style={chip(false)} onClick={() => setDark((d) => !d)}>{dark ? "DAY" : "NIGHT"}</button>
            {/* The same session the eVTOL and aircraft studios show. */}
            <SharedAuthBar dark={dark} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap",
                      padding: "7px 18px", borderTop: `1px solid ${SC.border}`, background: SC.inset }}>
          <span style={{ fontSize: T.micro, color: SC.muted, fontFamily: MONO, marginRight: 4 }}>LAYOUT</span>
          {types.map((t) => (
            <button key={t.frameType} type="button" aria-pressed={t.frameType === frame?.frameType}
              onClick={() => setFrameType(t.frameType)} style={chip(t.frameType === frame?.frameType)}>
              {t.frameType} <span style={{ color: SC.subtle, fontFamily: MONO }}>{t.motorCount}</span>
            </button>
          ))}
        </div>
      </header>

      <nav aria-label="Sections" style={{ display: "flex", padding: "0 18px", borderBottom: `1px solid ${SC.border}`,
                                          background: SC.panel, overflowX: "auto" }}>
        {TABS.map(([k, label]) => {
          const on = k === tab;
          return (
            <button key={k} type="button" aria-current={on ? "page" : undefined} onClick={() => setTab(k)}
              style={{ padding: "10px 12px 9px", fontSize: T.label, cursor: "pointer", border: "none",
                       background: "transparent", fontFamily: SANS, whiteSpace: "nowrap",
                       color: on ? SC.primary : SC.muted, fontWeight: on ? 600 : 400,
                       borderBottom: `2px solid ${on ? SC.caution : "transparent"}`, marginBottom: -1 }}>
              {label}
            </button>
          );
        })}
      </nav>

      <main style={{ padding: `${S.lg}px ${S.xl}px`, maxWidth: 1680, boxSizing: "border-box" }}>
        {tab === "frame" && frame && (
          <div style={{ display: "flex", gap: S.xl, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Card title={`${frame.frameClass} · ${frame.frameType} — ${frame.motorCount} motors`}>
              <FrameDiagram frame={frame} size={330} showTestOrder />
            </Card>
            <div style={{ flex: 1, minWidth: 330, display: "flex", flexDirection: "column", gap: S.md }}>
              <Card title="Motor table">
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th()}>Output</th><th style={th(true)}>Angle</th>
                      <th style={th()}>Position</th><th style={th()}>Rotation</th><th style={th(true)}>Test order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frame.motors.map((m) => (
                      <tr key={m.motor}>
                        <td style={td(true)}>{m.motor}</td>
                        <td style={td(true)}>{m.angleDeg}°</td>
                        <td style={td()}>{describe(m.angleDeg)}</td>
                        <td style={{ ...td(), color: m.rotation === "CW" ? SC.caution : (SC.blue ?? SC.primary), fontFamily: MONO }}>
                          {m.rotation}
                        </td>
                        <td style={td(true)}>{m.testingOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.6, margin: `${S.sm}px 0 0` }}>
                  Output number and test order are <b>different sequences</b>. The third
                  field of ArduPilot&apos;s <code style={{ fontFamily: MONO }}>MotorDef</code> is the
                  motor-test order, not the output channel — reading it as the channel
                  swaps a diagonal pair, and a quad wired that way flips on take-off.
                </p>
              </Card>
              {balance && (
                <Card title="Yaw balance">
                  <p style={{ fontSize: T.body, color: SC.text, margin: 0, lineHeight: 1.6 }}>
                    <b style={{ fontFamily: MONO, color: balance.balanced ? SC.nominal : SC.warning }}>
                      {balance.balanced ? "BALANCED" : "UNBALANCED"}
                    </b>{" "}
                    — {balance.cw} clockwise, {balance.ccw} counter-clockwise.
                    {balance.balanced
                      ? " Equal counts, so the reaction torques cancel and hover needs no standing yaw input."
                      : " Unequal counts: this frame carries a standing yaw torque in hover, which the mixer must trim out."}
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}

        {tab === "components" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S.md, maxWidth: 1180 }}>
            <Card title={`Catalogue — ${ALL_COMPONENTS.length} parts, every one traced to its datasheet`}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={th()}>Category</th><th style={th(true)}>Entries</th><th style={th()}>Makers</th></tr></thead>
                <tbody>
                  {Object.entries(CATEGORIES).map(([name, entries]) => (
                    <tr key={name}>
                      <td style={td()}>{name.replace(/_/g, " ")}</td>
                      <td style={td(true)}>{entries.length}</td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.muted }}>
                        {[...new Set(entries.map((e) => e.manufacturer))].slice(0, 5).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Which motors can be modelled from their datasheet alone">
              <p style={{ fontSize: T.body, color: SC.text, lineHeight: 1.6, margin: `0 0 ${S.md}px` }}>
                A motor&apos;s copper loss is I²·R<sub>phase</sub>. Manufacturers do publish a
                resistance — <b>{BLDC_MOTORS.filter((m) => m.internal_resistance_mohm != null).length} of {BLDC_MOTORS.length}</b> of
                these do — but most do not say <i>which</i> resistance they measured, and the
                answer changes the number by a factor of three: phase-to-phase resistance is
                2×R<sub>phase</sub> on a wye motor and ⅔×R<sub>phase</sub> on a delta one.
                So entries are classified, never converted.
              </p>
              <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: S.md }}>
                <thead><tr><th style={th()}>Convention, as the vendor stated it</th><th style={th(true)}>Motors</th><th style={th()}>Usable as R<sub>phase</sub>?</th></tr></thead>
                <tbody>
                  {conventionCounts.map(([k, n]) => (
                    <tr key={k}>
                      <td style={{ ...td(), fontFamily: MONO, fontSize: T.label }}>{k}</td>
                      <td style={td(true)}>{n}</td>
                      <td style={{ ...td(), color: k === "undeclared" ? SC.warning : SC.nominal, fontSize: T.label }}>
                        {k === "undeclared" ? "no — vendor never said" : "yes"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: T.body, color: SC.text, lineHeight: 1.6, margin: `0 0 ${S.sm}px` }}>
                <b style={{ fontFamily: MONO, color: SC.caution }}>{MODELLABLE_MOTORS.length} of {BLDC_MOTORS.length}</b>{" "}
                carry everything a first-principles loss model needs with no assumed
                parameter anywhere — Kv, a resistance whose convention is stated, and a
                no-load current with the voltage it was measured at:
              </p>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr><th style={th()}>Motor</th><th style={th(true)}>Kv</th><th style={th(true)}>R</th>
                      <th style={th()}>Convention</th><th style={th(true)}>I₀</th><th style={th(true)}>at</th></tr>
                </thead>
                <tbody>
                  {MODELLABLE_MOTORS.map((m) => (
                    <tr key={m.model}>
                      <td style={td()}>{m.manufacturer} {m.model}</td>
                      <td style={td(true)}>{m.kv}</td>
                      <td style={td(true)}>{m.internal_resistance_mohm} mΩ</td>
                      <td style={{ ...td(), fontFamily: MONO, fontSize: T.micro, color: SC.muted }}>
                        {m.resistance_convention}{m.winding_topology ? ` · ${m.winding_topology}` : ""}
                      </td>
                      <td style={td(true)}>{m.no_load_current_i0_a} A</td>
                      <td style={td(true)}>{m.no_load_current_measured_at_v} V</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, margin: `${S.md}px 0 0`,
                          borderLeft: `2px solid ${SC.border}`, paddingLeft: S.sm }}>
                The other {BLDC_MOTORS.length - MODELLABLE_MOTORS.length} keep their published
                numbers — those are real and are what the vendor printed — but are held back
                from the loss model rather than being fed in on an assumed convention. Each
                one records what is missing. Resolving them needs a bench measurement or a
                vendor clarification, and the reference voltages alone run 10, 18, 22 and
                24 V across this survey, so there is no safe default to fall back on.
              </p>
            </Card>
          </div>
        )}

        {tab === "propulsion" && (
          <PropulsionPanel built={design.built} result={design.result}
                           ok={design.ok} rho={design.rho} />
        )}

        {tab === "sizing" && (
          <SizingPanel v={design.v} set={design.set} built={design.built}
                       result={design.result} ok={design.ok} rho={design.rho} />
        )}

        {tab === "trade" && (
          <TradePanel mission={design.mission} declared={design.declared}
                      altitudeM={design.v.altitudeM} />
        )}

        {tab === "flight" && frame && (
          <FlightPanel design={design} frame={frame} />
        )}

        {tab === "avionics" && (
          <AvionicsPanel design={design} />
        )}

        {tab === "risk" && (
          <RiskPanel design={design} frame={frame} />
        )}

        {tab === "airframe" && frame && (
          <Drone3D frame={frame} propellerDiameterM={design.built.propeller.diameterM}
                   sizing={design.ok ? design.result : null} parts={design.built} />
        )}

        {tab === "endurance" && (
          <EndurancePanel v={design.v} built={design.built} mission={design.mission}
                          declared={design.declared} selection={design.selection}
                          result={design.result} ok={design.ok} />
        )}

        {tab === "class" && classed && (
          <div style={{ display: "flex", flexDirection: "column", gap: S.md, maxWidth: 1140 }}>
            <Card title="Take-off mass">
              <div style={{ display: "flex", gap: S.md, alignItems: "center", flexWrap: "wrap" }}>
                <input type="range" min={0.05} max={200} step={0.05} value={Math.min(mtomKg, 200)}
                  onChange={(e) => setMtomKg(Number(e.target.value))} style={{ flex: 1, minWidth: 260 }} />
                <input type="number" min={0.01} step={0.01} value={mtomKg}
                  onChange={(e) => setMtomKg(Math.max(0.01, Number(e.target.value) || 0.01))}
                  style={{ width: 110, fontSize: T.value, fontFamily: MONO, padding: "4px 6px",
                           background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3 }} />
                <span style={{ fontSize: T.label, color: SC.muted, fontFamily: MONO }}>
                  kg · {(mtomKg / 0.45359237).toFixed(2)} lb · {frame?.motorCount ?? 4} rotors
                </span>
              </div>
              <p style={{ fontSize: T.micro, color: SC.subtle, margin: `${S.sm}px 0 0`, lineHeight: 1.6 }}>
                Entered, not sized — no vehicle loop exists yet, so this asks rather than pretends.
              </p>
            </Card>

            <Card title="The two ceilings, which are not the same number">
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {[["United States · 14 CFR Part 107", classed.ceilings.usPart107, "55 lb"],
                    ["Europe · open category", classed.ceilings.euOpen, "25 kg"]].map(([label, c, stated]) => (
                    <tr key={label}>
                      <td style={td()}>{label}</td>
                      <td style={{ ...td(true), fontFamily: MONO }}>{stated} = {c.limitKg.toFixed(6)} kg</td>
                      <td style={{ ...td(), color: c.within ? SC.nominal : SC.warning, fontWeight: 600 }}>
                        {c.within ? "WITHIN" : "ABOVE"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {classed.ceilings.betweenTheTwoCeilings && (
                <p style={{ fontSize: T.label, color: SC.caution, lineHeight: 1.6, margin: `${S.sm}px 0 0`,
                            borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
                  <b>In the 52 g band where the two rules disagree.</b> Above 55 lb and below
                  25 kg: inside Europe&apos;s open category, outside Part 107. Rounding one
                  limit to the other designs straight into this gap.
                </p>
              )}
              {[classed.ceilings.usPart107.note, classed.ceilings.euOpen.note].filter(Boolean).map((n) => (
                <p key={n} style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, margin: `${S.sm}px 0 0` }}>{n}</p>
              ))}
            </Card>

            <Card title={`Thresholds crossed at ${mtomKg} kg`}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                  <thead>
                    <tr><th style={th(true)}>Mass</th><th style={th()}>As stated</th>
                        <th style={th()}>Jurisdiction</th><th style={th()}>Clause</th><th style={th()}>Gates</th></tr>
                  </thead>
                  <tbody>
                    {classed.crossed.map((t) => (
                      <tr key={`${t.kg}-${t.jurisdiction}-${t.clause}`}>
                        <td style={td(true)}>{t.kg} kg</td>
                        <td style={{ ...td(), fontFamily: MONO, fontSize: T.micro }}>{t.statedValue}</td>
                        <td style={{ ...td(), fontSize: T.label }}>{t.jurisdiction}</td>
                        <td style={{ ...td(), fontSize: T.micro, color: SC.muted, fontFamily: MONO }}>{t.clause}</td>
                        <td style={{ ...td(), fontSize: T.micro, color: SC.subtle }}>{t.gates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {classed.next && (
                <p style={{ fontSize: T.label, color: SC.muted, margin: `${S.sm}px 0 0` }}>
                  Next threshold above: <b style={{ fontFamily: MONO }}>{classed.next.kg} kg</b>{" "}
                  ({classed.next.statedValue}, {classed.next.jurisdiction}) — {classed.next.gates}
                </p>
              )}
            </Card>

            <Card title="What a mass cannot decide">
              <p style={{ fontSize: T.body, color: SC.text, lineHeight: 1.6, margin: `0 0 ${S.sm}px` }}>
                These fire independently of take-off mass. A classifier that answered from
                mass alone would be confidently wrong about each of them.
              </p>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {classed.undecidable.map((t) => (
                    <tr key={t.id}>
                      <td style={{ ...td(), width: 210 }}>{t.label}</td>
                      <td style={{ ...td(), width: 90, fontSize: T.micro, color: SC.muted }}>{t.jurisdiction}</td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.subtle }}>
                        {t.gates}{t.note ? ` — ${t.note}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Can this tool size it?">
              <p style={{ fontSize: T.body, lineHeight: 1.6, margin: `0 0 ${S.sm}px`,
                          color: classed.sizing.supported ? SC.nominal : SC.warning, fontWeight: 600 }}>
                {classed.sizing.supported
                  ? `YES — within the measured-data envelope for ${classed.sizing.rotors} rotors (up to ${classed.sizing.maxMassKg} kg).`
                  : `NO — ${classed.sizing.reason}.`}
              </p>
              <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, margin: 0 }}>
                {classed.sizing.supported
                  ? `Basis: ${classed.sizing.basis}. This is an engineering envelope set by the measured propeller database, not by law — the two happen to run out near the same place.`
                  : classed.sizing.gap ?? (classed.sizing.evtolEngineApplies
                      ? "Above this engine's range the eVTOL engine is the validated path — switch design mode."
                      : "")}
              </p>
            </Card>

            <Card title="Words that carry no legal force">
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {CONVENTION_ONLY.map((c) => (
                    <tr key={c.word}>
                      <td style={{ ...td(), width: 120, fontFamily: MONO, color: SC.caution }}>{c.word}</td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.muted }}>{c.finding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: T.micro, color: SC.subtle, lineHeight: 1.6, margin: `${S.sm}px 0 0` }}>
                &quot;Micro&quot; and &quot;medium&quot; are the exception — statutory in Australia
                (CASR 101.022) and Canada (CARs 900.01), but with different numbers from each
                other and from NATO, whose MICRO is under 2 kg against Australia&apos;s 250 g. A
                class word without a jurisdiction attached is meaningless, so none is emitted.
              </p>
            </Card>
          </div>
        )}

        {tab === "autopilot" && (
          <AutopilotPanel design={design} frame={frame} />
        )}

        {tab === "accuracy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S.md, maxWidth: 1100 }}>
            <Card title="The accuracy gate, and the measured data behind each row">
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr><th style={th()}>Layer</th><th style={th(true)}>Gate</th><th style={th()}>Truth set</th><th style={th()}>Note</th></tr>
                </thead>
                <tbody>
                  {ACCURACY.map((r) => (
                    <tr key={r.layer}>
                      <td style={td()}>{r.layer}</td>
                      <td style={{ ...td(true), color: SC.caution, fontFamily: MONO }}>{r.gate}</td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.muted }}>{r.truth}</td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.subtle }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, margin: `${S.md}px 0 0` }}>
                The last two rows are weaker than the rest on purpose. Whole-vehicle
                endurance cannot be held to 5 % because the reference numbers are
                manufacturers&apos; published flight times, which state no test conditions —
                the best published method reaches 1.3-2.7 % against its own instrumented
                measurements and about 10 % against vendor figures. Every gate will print
                its full per-vehicle error table rather than a mean: the two standard
                references in this field have respectable means and worst cases beyond
                30 %, visible only because their authors printed the rows.
              </p>
            </Card>
            <Card title="Build order">
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {PHASES.map(([name, state, what]) => (
                    <tr key={name}>
                      <td style={{ ...td(), width: 170 }}>{name}</td>
                      <td style={{ ...td(), width: 70, fontFamily: MONO, fontSize: T.micro,
                                   color: state === "done" ? SC.nominal : state === "next" ? SC.caution : SC.subtle }}>
                        {state.toUpperCase()}
                      </td>
                      <td style={{ ...td(), fontSize: T.label, color: SC.muted }}>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Frame data provenance">
              <p style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.7, margin: 0 }}>
                Frame geometry is generated from{" "}
                <code style={{ fontFamily: MONO, color: SC.text }}>{FRAME_SOURCE.file}</code> at commit{" "}
                <code style={{ fontFamily: MONO, color: SC.text }}>{FRAME_SOURCE.commit.slice(0, 12)}</code>,
                fetched {FRAME_SOURCE.fetched} — the flight code itself, not a documentation
                diagram. {FRAMES.length} frames carry a stated rotation for every motor and are
                offered here.{" "}
                {FRAMES_OMITTED.length > 0 && (
                  <>
                    {FRAMES_OMITTED.length} are omitted because that source states no rotation for
                    them ({FRAMES_OMITTED.map((f) => `${f.frameClass}/${f.frameType}`).join(", ")}) —
                    listed rather than guessed.
                  </>
                )}
              </p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

/* Plain-language position for a motor angle, ArduPilot's convention: degrees
   clockwise from the nose. Only the exact cardinal and diagonal angles get a
   name; anything else keeps its number rather than being rounded into a word
   it does not mean. */
function describe(a) {
  const named = { 0: "front", 45: "front-right", 90: "right", 135: "rear-right",
                  180: "rear", "-135": "rear-left", "-90": "left", "-45": "front-left" };
  return named[String(a)] ?? `${a}° from nose`;
}
