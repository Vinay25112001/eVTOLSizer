/* =====================================================================
   SIZING PANEL — the inputs, the answer, and the evidence for it
   =====================================================================
   This is the first drone tab that computes something, so it sets the
   pattern the rest will follow.

   THREE KINDS OF NUMBER APPEAR HERE AND THEY ARE NOT MIXED.

     SELECTED   a published figure from a real part's datasheet
     COMPUTED   a consequence of selected parts and measured curves
     DECLARED   a value the user supplied because nobody publishes it

   Declared inputs are not ordinary form fields and are not drawn like
   them. Each carries WHY it cannot be defaulted and what the published
   art says about it, because three of the five move the answer more than
   any component choice the tool is nominally making. Structure mass
   alone is the second largest mass in the vehicle, and no manufacturer
   in the survey publishes one.

   NOTHING IS SHOWN WHEN THE LOOP REFUSES. If a propeller cannot make the
   thrust, the panel shows the refusal and its reason, not a greyed-out
   number or a last-iterate. That is the same rule the engine follows.

   EVERY CHART IS MEASURED DATA OR A COMPUTED CONSEQUENCE OF IT. The
   thrust curves are the UIUC wind-tunnel rows themselves; the ESC band
   is the measured joint residual; the convergence plot is the actual
   iterates. No chart here is illustrative.
   ===================================================================== */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot, ScatterChart, Scatter, BarChart, Bar, Cell, Area, AreaChart, Legend,
} from "recharts";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card, Kpi, th, td } from "../ui-kit.jsx";

import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../../data/drone-components.js";
import { VEHICLES } from "../../data/drone-vehicles.js";
import { DECLARED_INPUTS } from "./sizing.js";
import { PROP_CHOICES } from "./design-state.js";
import { staticThrustN, staticShaftPowerW } from "./rotor.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));



function Field({ label, unit, value, onChange, step = 1, min = 0, max = 1e6, hint }) {
  return (
    <label style={{ display: "block", marginBottom: S.sm }}>
      <div style={{ fontSize: T.label, color: SC.muted, marginBottom: 2 }}>
        {label}{unit ? <span style={{ color: SC.muted }}> ({unit})</span> : null}
      </div>
      <input
        type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        style={{
          width: "100%", background: SC.bg, color: SC.text, fontFamily: MONO,
          fontSize: T.body, border: `1px solid ${SC.border}`, borderRadius: 4, padding: "5px 7px",
        }}
      />
      {hint ? <div style={{ fontSize: T.label, color: SC.muted, marginTop: 2, lineHeight: 1.4 }}>{hint}</div> : null}
    </label>
  );
}

function Select({ label, value, onChange, options, hint }) {
  return (
    <label style={{ display: "block", marginBottom: S.sm }}>
      <div style={{ fontSize: T.label, color: SC.muted, marginBottom: 2 }}>{label}</div>
      <select
        value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", background: SC.bg, color: SC.text, fontFamily: SANS,
          fontSize: T.body, border: `1px solid ${SC.border}`, borderRadius: 4, padding: "5px 7px",
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint ? <div style={{ fontSize: T.label, color: SC.muted, marginTop: 2 }}>{hint}</div> : null}
    </label>
  );
}

/* A declared input, drawn so it cannot be mistaken for a computed one. */
function DeclaredField({ spec, value, onChange, step, min, max }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm, marginBottom: S.sm }}>
      <Field label={spec.key} unit={spec.units === "-" ? "" : spec.units}
             value={value} onChange={onChange} step={step} min={min} max={max} />
      <button onClick={() => setOpen(!open)}
        style={{ background: "none", border: "none", color: SC.blue, fontSize: T.label,
                 cursor: "pointer", padding: 0, fontFamily: SANS }}>
        {open ? "− why this is declared" : "+ why this is declared"}
      </button>
      {open ? (
        <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5, marginTop: 4 }}>
          <div style={{ marginBottom: 4 }}>{spec.what}</div>
          <div style={{ marginBottom: 4 }}><b style={{ color: SC.caution }}>Not defaulted:</b> {spec.whyDeclared}</div>
          <div><b style={{ color: SC.text }}>Published art:</b> {spec.reference}</div>
        </div>
      ) : null}
    </div>
  );
}

const byKey = Object.fromEntries(DECLARED_INPUTS.map((d) => [d.key, d]));

export default function SizingPanel({ v, set, built, result, ok, rho }) {


  /* ── CHART DATA, all measured or computed ───────────────────────── */
  const thrustCurve = useMemo(() => {
    const p = built.propeller;
    if (!p?.static?.length) return [];
    return p.static.map(([rpm]) => ({
      rpm, thrustN: staticThrustN(p, rpm, rho).thrustN,
      shaftW: staticShaftPowerW(p, rpm, rho).powerW,
    }));
  }, [built.propeller, rho]);

  /* Every measured propeller, at the CURRENT design's per-rotor thrust:
     what RPM and hover shaft power would it need? Points that cannot
     make the thrust are omitted, which is itself the answer for them. */
  const propSweep = useMemo(() => {
    if (!ok) return [];
    const need = result.hover.thrustPerRotorN;
    const out = [];
    for (const p of PROP_CHOICES) {
      const lo = p.static[0], hi = p.static[p.static.length - 1];
      const tLo = staticThrustN(p, lo[0], rho).thrustN, tHi = staticThrustN(p, hi[0], rho).thrustN;
      if (!(need >= tLo && need <= tHi)) continue;
      let a = lo[0], b = hi[0];
      for (let i = 0; i < 40; i++) {
        const m = 0.5 * (a + b);
        (staticThrustN(p, m, rho).thrustN < need ? (a = m) : (b = m));
      }
      const rpm = 0.5 * (a + b);
      out.push({
        diameterIn: p.diameterM / 0.0254, rpm,
        shaftW: staticShaftPowerW(p, rpm, rho).powerW, id: p.id,
        current: p.id === built.propeller.id,
      });
    }
    return out.sort((x, y) => x.diameterIn - y.diameterIn);
  }, [ok, result, rho, built.propeller]);

  const massBars = ok ? [{
    name: "mass",
    Payload: result.massBreakdown.payloadKg,
    Structure: result.massBreakdown.structureKg,
    Avionics: result.massBreakdown.avionicsKg,
    Propulsion: result.massBreakdown.propulsionKg,
    Battery: result.massBreakdown.batteryKg,
  }] : [];
  const MASS_COLOURS = { Payload: "#4ea1ff", Structure: "#9b8cff", Avionics: "#54c7a8", Propulsion: "#f2a33c", Battery: "#e0574a" };

  /* A design that converges on its first evaluation plots a single dot, which
     reads as a broken chart rather than as the (true) statement that the first
     guess was already right. Plot the resulting mass alongside each iterate so
     the step from guess to answer is visible even when there is only one. */
  const convergence = ok
    ? result.history.map((h) => ({ i: h.iteration, guessKg: h.massKg, solvedKg: h.massNextKg, packs: h.packs }))
    : [];

  const fleet = VEHICLES.filter((x) => x.impliedPowerWPerKg).map((x) => ({
    name: x.model, wkg: x.impliedPowerWPerKg, basis: x.enduranceBasis,
  }));

  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: S.md };
  const axis = { stroke: SC.muted, fontSize: 11, fontFamily: MONO };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: S.md, alignItems: "start" }}>

      {/* ── INPUTS ─────────────────────────────────────────────── */}
      <div>
        <Card title="Mission">
          <Field label="Payload" unit="kg" value={v.payloadKg} onChange={set("payloadKg")} step={0.1} max={50} />
          <Field label="Hover endurance required" unit="min" value={v.hoverEnduranceMin} onChange={set("hoverEnduranceMin")} step={1} min={1} max={240} />
          <Field label="Altitude" unit="m" value={v.altitudeM} onChange={set("altitudeM")} step={100} max={6000}
                 hint={`ISA density ${num(rho, 4)} kg/m³`} />
          <Field label="Rotors" value={v.rotors} onChange={set("rotors")} step={1} min={3} max={16} />
        </Card>

        <Card title="Components — selected, with published masses">
          <Select label="Propeller (measured, UIUC)" value={built.propeller.id} onChange={set("propellerId")}
            options={PROP_CHOICES.map((p) => ({ value: p.id, label: `${(p.diameterM / 0.0254).toFixed(1)}in  ${p.id}` }))}
            hint={`${PROP_CHOICES.length} propellers with measured curves in this size band`} />
          <Field label="Propeller mass (declared — UIUC records no mass)" unit="g"
                 value={v.propellerMassG} onChange={set("propellerMassG")} step={1} max={2000} />
          <Select label="Motor (modellable from datasheet alone)" value={built.motor.model} onChange={set("motorModel")}
            options={MODELLABLE_MOTORS.map((m) => ({ value: m.model, label: `${m.manufacturer} ${m.model}` }))}
            hint={`only ${MODELLABLE_MOTORS.length} of 24 catalogue motors state the resistance convention AND a no-load current`} />
          <Select label="ESC" value={built.esc.id} onChange={set("escId")}
            options={ESCS.map((e) => ({ value: e.id, label: `${e.manufacturer} ${e.model}` }))} />
          <Select label="Cell" value={built.cell.id} onChange={set("cellId")}
            options={BATTERIES.map((b) => ({ value: b.id, label: `${b.manufacturer} ${b.model}` }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.sm }}>
            <Field label="Series" value={v.series} onChange={set("series")} step={1} min={1} max={24} />
            <Field label="Parallel" value={v.parallel} onChange={set("parallel")} step={1} min={1} max={20} />
          </div>
          <Field label="Pack overhead (BMS, case, wiring)" unit="fraction" value={v.packOverhead}
                 onChange={set("packOverhead")} step={0.05} max={1}
                 hint={built.pack ? `${built.pack.model} — ${num(built.pack.energyWhPublished)} Wh, ${num(built.pack.massG, 0)} g, ${num(built.pack.voltagePrintedV)} V` : built.packError} />
        </Card>

        <Card title="Declared inputs — nobody publishes these">
          <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5, marginBottom: S.sm }}>
            Each of these has no default anywhere in the engine. The loop refuses to run
            without them, because a guessed value here would silently set the answer while
            looking like output.
          </div>
          <DeclaredField spec={byKey.structureMassKg} value={v.structureMassKg} onChange={set("structureMassKg")} step={0.05} max={100} />
          <DeclaredField spec={byKey.usableFraction} value={v.usableFraction} onChange={set("usableFraction")} step={0.05} min={0.05} max={1} />
          <DeclaredField spec={byKey.avionicsMassKg} value={v.avionicsMassKg} onChange={set("avionicsMassKg")} step={0.01} max={20} />
          <DeclaredField spec={byKey.avionicsPowerW} value={v.avionicsPowerW} onChange={set("avionicsPowerW")} step={1} max={2000} />
          <DeclaredField spec={byKey.thrustToWeightRequired} value={v.thrustToWeightRequired} onChange={set("thrustToWeightRequired")} step={0.1} min={1} max={6} />
        </Card>
      </div>

      {/* ── RESULTS ────────────────────────────────────────────── */}
      <div>
        {!ok ? (
          <Card title="The loop refused">
            <div style={{ borderLeft: `2px solid ${SC.bad ?? "#e0574a"}`, paddingLeft: S.sm }}>
              <div style={{ fontSize: T.body, color: SC.text, fontWeight: 600, marginBottom: 4 }}>
                {result.reason ?? result.status}
              </div>
              <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>{result.detail}</div>
            </div>
            <div style={{ fontSize: T.label, color: SC.muted, marginTop: S.md, lineHeight: 1.6 }}>
              Nothing is shown above because nothing was computed. A refusal names which link in
              the chain declined and why — extrapolating a measured curve is the one thing this
              tool must not do.
            </div>
          </Card>
        ) : (
          <>
            <Card title={`Sized — ${result.status}`}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: S.sm }}>
                <Kpi label="All-up mass" value={num(result.massKg, 2)} unit="kg" />
                <Kpi label="Hover power" value={num(result.hover.busPowerW, 0)} unit="W"
                     sub={`${num(result.hover.busPowerW / result.massKg, 0)} W/kg`} />
                <Kpi label="Endurance" value={num(result.endurance.minutes, 1)} unit="min"
                     sub={`P10–P90 ${num(result.endurance.minutesP10, 1)}–${num(result.endurance.minutesP90, 1)}`} />
                <Kpi label="Thrust / weight" value={num(result.thrustToWeight.available, 2)} unit=""
                     sub={`hover at ${num(100 * result.thrustToWeight.hoverThrottleFraction, 0)} % of max`} />
                <Kpi label="Rotor speed" value={num(result.hover.rpm, 0)} unit="rpm"
                     sub={`FM ${num(result.hover.figureOfMerit, 3)}`} />
                <Kpi label="Disc loading" value={num(result.hover.discLoadingNM2, 1)} unit="N/m²" />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: S.md }}>
                <thead><tr><th style={th()}>Mission check</th><th style={th()}>Verdict</th></tr></thead>
                <tbody>
                  {Object.entries(result.checks).map(([k, val]) => (
                    <tr key={k}>
                      <td style={td()}>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</td>
                      <td style={{ ...td(), color: val ? (SC.good ?? "#54c7a8") : (SC.bad ?? "#e0574a"), fontWeight: 600 }}>
                        {val ? "MET" : "NOT MET"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div style={grid}>
              <Card title="Mass breakdown">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={massBars} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <XAxis type="number" {...axis} unit=" kg" />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip formatter={(x) => `${(+x).toFixed(3)} kg`} />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(MASS_COLOURS).map((k) => (
                      <Bar key={k} dataKey={k} stackId="m" fill={MASS_COLOURS[k]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(MASS_COLOURS).map(([k, c]) => {
                      const key = k.toLowerCase() + "Kg";
                      const val = result.massBreakdown[key] ?? result.massBreakdown[k.toLowerCase()];
                      return (
                        <tr key={k}>
                          <td style={td()}><span style={{ color: c }}>■</span> {k}</td>
                          <td style={td(true)}>{num(val, 3)} kg</td>
                          <td style={td(true)}>{num(100 * val / result.massKg, 1)} %</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: T.label, color: SC.muted, marginTop: 4 }}>
                  {result.massBreakdown.packs} pack{result.massBreakdown.packs === 1 ? "" : "s"} selected.
                </div>
              </Card>

              <Card title="Propeller thrust — the measured rows themselves">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={thrustCurve} margin={{ top: 6, right: 10, bottom: 18, left: 0 }}>
                    <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                    <XAxis dataKey="rpm" {...axis} label={{ value: "rpm", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: 11 }} />
                    <YAxis {...axis} label={{ value: "N", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                    <Tooltip formatter={(x, n) => [`${(+x).toFixed(2)}`, n]} />
                    <Line type="monotone" dataKey="thrustN" stroke="#4ea1ff" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} name="thrust" />
                    <ReferenceLine y={result.hover.thrustPerRotorN} stroke={SC.caution} strokeDasharray="4 3"
                      label={{ value: `hover ${num(result.hover.thrustPerRotorN, 1)} N`, fill: SC.caution, fontSize: 10, position: "insideTopLeft" }} />
                    <ReferenceDot x={result.hover.rpm} y={result.hover.thrustPerRotorN} r={4} fill={SC.caution} stroke="none" />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                  Every point is a measured wind-tunnel row for {built.propeller.id}. The dashed line
                  is what this design needs per rotor; the dot is where it sits. Outside the plotted
                  range the engine refuses rather than extrapolating.
                </div>
              </Card>

              <Card title="Propeller diameter vs hover shaft power">
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 6, right: 10, bottom: 18, left: 0 }}>
                    <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                    <XAxis type="number" dataKey="diameterIn" {...axis} name="diameter"
                      label={{ value: "diameter (in)", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: 11 }} />
                    <YAxis type="number" dataKey="shaftW" {...axis}
                      label={{ value: "shaft W", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }}
                      formatter={(x, n) => [(+x).toFixed(1), n === "shaftW" ? "shaft W" : n]} />
                    <Scatter data={propSweep} isAnimationActive={false}>
                      {propSweep.map((p, i) => (
                        <Cell key={i} fill={p.current ? SC.caution : "#4ea1ff"} r={p.current ? 6 : 3} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                  {propSweep.length} of {PROP_CHOICES.length} measured propellers can make{" "}
                  {num(result.hover.thrustPerRotorN, 1)} N per rotor. The rest are absent because
                  their measured range does not reach it. Bigger discs cost less power — the
                  momentum-theory result, here drawn only from measurements.
                </div>
              </Card>

              <Card title="Convergence">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={convergence} margin={{ top: 6, right: 10, bottom: 18, left: 0 }}>
                    <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                    <XAxis dataKey="i" {...axis} label={{ value: "iteration", position: "insideBottom", offset: -12, fill: SC.muted, fontSize: 11 }} />
                    <YAxis {...axis} unit=" kg" />
                    <Tooltip />
                    <Line type="monotone" dataKey="guessKg" stroke="#6b7280" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} name="mass in" />
                    <Line type="monotone" dataKey="solvedKg" stroke="#9b8cff" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} name="mass out" />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: T.label, color: SC.muted }}>
                  The actual fixed-point iterates — {result.iterations} step
                  {result.iterations === 1 ? "" : "s"}, ending "{result.status}".{" "}
                  {result.iterations === 1
                    ? "One step means the first guess already satisfied the closure: mass in equals mass out, so no iteration was needed."
                    : "Grey is the mass going in, purple the mass the closure returns; they meet at the fixed point."}{" "}
                  The loop reports how it ended rather than returning the last iterate of a runaway.
                </div>
              </Card>

              <Card title="Specific power against real aircraft">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[...fleet, { name: "THIS DESIGN", wkg: result.hover.busPowerW / result.massKg, basis: "computed" }]}
                            margin={{ top: 6, right: 10, bottom: 50, left: 0 }}>
                    <CartesianGrid stroke={SC.border} strokeDasharray="2 3" />
                    <XAxis dataKey="name" {...axis} angle={-35} textAnchor="end" interval={0} height={60} />
                    <YAxis {...axis} label={{ value: "W/kg", angle: -90, position: "insideLeft", fill: SC.muted, fontSize: 11 }} />
                    <Tooltip formatter={(x) => `${(+x).toFixed(1)} W/kg`} />
                    <Bar dataKey="wkg" isAnimationActive={false}>
                      {[...fleet, { basis: "computed" }].map((f, i) => (
                        <Cell key={i} fill={f.basis === "computed" ? SC.caution : f.basis === "hover" ? "#4ea1ff" : "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                  A BRACKET, not a validation. Blue publishes a hover time; grey publishes only a
                  "max flight time", which is a cruise-basis number. Landing inside the band proves
                  nothing about accuracy — landing outside it would prove something is wrong.
                </div>
              </Card>

              <Card title="Where the power goes">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={td()}>Rotor shaft, all {result.rotors}</td><td style={td(true)}>{num(result.rotors * result.hover.shaftPowerW, 0)} W</td></tr>
                    <tr><td style={td()}>Motor loss</td><td style={td(true)}>{num(result.rotors * (result.hover.motor.elecPowerW - result.hover.shaftPowerW), 0)} W</td></tr>
                    <tr><td style={td()}>ESC + model residual</td><td style={td(true)}>{num(result.rotors * result.hover.esc.lossW, 0)} W</td></tr>
                    <tr><td style={td()}>Avionics (declared)</td><td style={td(true)}>{num(v.avionicsPowerW, 0)} W</td></tr>
                    <tr><td style={{ ...td(), fontWeight: 600 }}>Bus total</td><td style={{ ...td(true), fontWeight: 600 }}>{num(result.hover.busPowerW, 0)} W</td></tr>
                  </tbody>
                </table>
                <div style={{ fontSize: T.label, color: SC.muted, marginTop: 6, lineHeight: 1.5 }}>
                  Motor efficiency {num(100 * result.hover.motor.etaMotor, 1)} % at{" "}
                  {num(result.hover.motor.currentA, 1)} A and {num(result.hover.motor.voltageV, 1)} V.
                  ESC duty {num(result.hover.esc.duty, 3)}, joint residual{" "}
                  {num(100 * result.hover.esc.etaJoint, 1)} % — a JOINT residual, containing ESC loss
                  and any motor-model error inseparably, never an ESC efficiency.
                </div>
              </Card>
            </div>

            {result.warnings.length ? (
              <Card title={`Warnings (${result.warnings.length})`}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.warnings.map((w, i) => (
                    <li key={i} style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6, marginBottom: 4 }}>{w}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
