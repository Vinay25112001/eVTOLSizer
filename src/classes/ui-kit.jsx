/* =====================================================================
   CLASS WORKSPACE KIT — the pieces every non-eVTOL workspace shares
   =====================================================================
   Input rows with their source status, cards, headline figures, tables and
   the page header. Built on the app's own theme, tokens and Slider, so a
   trainer or transport page looks like the rest of the app. The eVTOL
   screens do not use this file.
   ===================================================================== */
import { useMemo } from "react";
import { SC } from "../lib/theme.js";
import { Slider } from "../ui/primitives.jsx";
import { T, S, MONO, SANS } from "../ui/tokens.js";
import { useUnitSystem } from "../lib/unit-system.jsx";
import { convertDisplay } from "../lib/units.js";

export const fmt = (v, d = 0) =>
  (Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

const STATUS = {
  sourced: { label: "S", title: "Sourced: printed in the cited document", key: "nominal" },
  derived: { label: "D", title: "Derived from sourced numbers", key: "advisory" },
  assumed: { label: "A", title: "Assumed: no free source; a stated judgement", key: "caution" },
};

export function StatusChip({ status, source }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span title={`${s.title}. ${source}`} aria-label={`${s.title}. ${source}`}
      style={{ display: "inline-block", minWidth: 14, textAlign: "center", fontSize: T.micro, fontFamily: MONO,
               color: SC[s.key], border: `1px solid ${SC[s.key]}`, borderRadius: 2, padding: "0 3px", marginRight: 6, cursor: "help" }}>
      {s.label}
    </span>
  );
}

export function StatusLegend() {
  return (
    <p style={{ fontSize: T.label, color: SC.muted, marginTop: 0 }}>
      <StatusChip status="sourced" source="" />sourced <StatusChip status="derived" source="" />derived{" "}
      <StatusChip status="assumed" source="" />assumed. Hover a marker for its source.
    </p>
  );
}

export function InputRow({ k, spec, value, onChange }) {
  if (Array.isArray(spec.options)) {
    return (
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S.md, fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
        <span><StatusChip status={spec.status} source={spec.source} />{spec.label}</span>
        <select value={value} onChange={e => onChange(k, e.target.value)}
          style={{ background: SC.panel, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, fontSize: T.label, padding: "2px 4px" }}>
          {spec.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (typeof spec.value === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", marginBottom: S.md, fontSize: T.label, color: SC.muted, fontFamily: SANS, gap: 6 }}>
        <StatusChip status={spec.status} source={spec.source} />
        <input type="checkbox" checked={!!value} onChange={e => onChange(k, e.target.checked)} />
        {spec.label}
      </label>
    );
  }
  const span = spec.max - spec.min;
  const step = span > 100 ? 1 : span > 5 ? 0.1 : 0.0001;
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div style={{ paddingTop: 1 }}><StatusChip status={spec.status} source={spec.source} /></div>
      <div style={{ flex: 1 }}>
        <Slider label={spec.label} unit={spec.unit} value={value} min={spec.min} max={spec.max} step={step}
          onChange={v => onChange(k, v)} />
      </div>
    </div>
  );
}

export function InputSections({ inputs, values, onChange }) {
  const sections = useMemo(() => {
    const m = new Map();
    for (const [k, v] of Object.entries(inputs)) {
      if (!m.has(v.section)) m.set(v.section, []);
      m.get(v.section).push([k, v]);
    }
    return [...m.entries()];
  }, [inputs]);
  return sections.map(([name, rows]) => (
    <Card key={name} title={name}>
      {rows.map(([k, spec]) => <InputRow key={k} k={k} spec={spec} value={values[k]} onChange={onChange} />)}
    </Card>
  ));
}

export function Card({ title, children }) {
  return (
    <section style={{ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 3, padding: S.lg, marginBottom: S.lg }}>
      <h2 style={{ margin: `0 0 ${S.md}px`, fontSize: T.body, fontWeight: 600, color: SC.text, fontFamily: SANS, letterSpacing: "0.02em" }}>{title}</h2>
      {children}
    </section>
  );
}

/* THE ONE PLACE UNITS ARE CONVERTED. Both studios render every headline
   number through this component and pass the unit they are labelling it
   with, so the conversion belongs here rather than at 97 call sites,
   each of which would be a chance to attach the wrong factor to a
   number. An unknown unit passes through untouched — see src/lib/units.js
   for why that is the deliberate failure mode. */
/* A QUANTITY INSIDE RUNNING TEXT, converted like a headline figure.

   Kpi converts its own `value`/`unit` pair, which is why the SI/IMP
   toggle needed no changes at the call sites. Its `sub` line had no such
   route: it is free text, so a span written as `${fmt(spanM, 1)} m` kept
   saying metres while the figure above it switched to feet. The tile
   then read "6.56 ft" over "commanded 2.00 m", which is worse than
   showing one system badly — it invites the reader to compare two
   numbers that are not in the same units.

   The fix has to be EXPLICIT rather than a pass over the finished text.
   A converter that rewrote display strings would find the `g` in "at
   3.75 g ultimate" (tabs.jsx) — a LOAD FACTOR, not a mass — and turn it
   into ounces. Only the call site knows which `g` it wrote, so the call
   site names the unit and this component does the conversion.

   `v` is already formatted, as Kpi's `value` is, so the decimals the
   author chose survive the conversion. */
export function Q({ v, u }) {
  const { system } = useUnitSystem();
  const c = convertDisplay(v, u, system);
  return <>{c.value} {c.unit}</>;
}

export function Kpi({ label, value, unit, sub }) {
  const { system } = useUnitSystem();
  const conv = convertDisplay(value, unit, system);
  value = conv.value; unit = conv.unit;
  return (
    <div style={{ minWidth: 130, padding: `${S.sm}px ${S.md}px`, borderLeft: `2px solid ${SC.border}` }}>
      <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>{label}</div>
      <div style={{ fontSize: T.lead, color: SC.text, fontFamily: MONO }}>{value}<span style={{ fontSize: T.label, color: SC.subtle, marginLeft: 4 }}>{unit}</span></div>
      {sub && <div style={{ fontSize: T.micro, color: SC.subtle, fontFamily: MONO }}>{sub}</div>}
    </div>
  );
}

export const th = (right) => ({ textAlign: right ? "right" : "left", fontSize: T.label, color: SC.muted, fontWeight: 500, padding: "4px 8px", borderBottom: `1px solid ${SC.border}`, fontFamily: SANS });
export const td = (num) => ({ fontSize: T.body, color: SC.text, padding: "4px 8px", fontFamily: num ? MONO : SANS, textAlign: num ? "right" : "left", borderBottom: `1px solid ${SC.border}` });

export function Warnings({ items }) {
  return (
    <Card title="Warnings and limitations">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((w, i) => (
          <li key={i} style={{ fontSize: T.body, marginBottom: 6, color: w.level === "error" ? SC.warning : w.level === "caution" ? SC.caution : SC.text }}>
            <span style={{ fontFamily: MONO, fontSize: T.micro, color: SC.subtle, marginRight: 6 }}>{w.category}</span>{w.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const btn = (active) => ({
  padding: "5px 10px", fontSize: T.label, borderRadius: 3, cursor: "pointer", fontFamily: SANS,
  background: active ? SC.inset : "transparent", color: active ? SC.text : SC.muted,
  border: `1px solid ${active ? SC.amber : SC.border}`,
});

export function WorkspaceHeader({ title, modes, mode, setMode, onReset, dark, setDark }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: S.lg, padding: `${S.md}px ${S.xl}px`, borderBottom: `1px solid ${SC.border}`, background: SC.panel, flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: SC.text }}>{title} <span style={{ fontSize: T.label, color: SC.caution, border: `1px solid ${SC.caution}`, borderRadius: 2, padding: "1px 5px", marginLeft: 6 }}>preview</span></h1>
      <nav aria-label="Job" style={{ display: "flex", gap: 4 }}>
        {modes.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} style={btn(mode === k)}>{l}</button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <nav aria-label="Aircraft class" style={{ display: "flex", gap: S.md, fontSize: T.label }}>
        <a href="?" style={{ color: SC.advisory }}>eVTOL</a>
        <a href="?class=trainer" style={{ color: SC.advisory }}>Trainer</a>
        <a href="?class=transport" style={{ color: SC.advisory }}>Jet transport</a>
        <a href="?class=turboprop" style={{ color: SC.advisory }}>Turboprop</a>
      </nav>
      <button type="button" onClick={onReset} style={btn(false)}>Reset to defaults</button>
      <button type="button" onClick={() => setDark(d => !d)} style={btn(false)}>{dark ? "Light theme" : "Dark theme"}</button>
    </header>
  );
}

export function readQuery() {
  const QS = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const theme = QS.get("theme") === "dark" ? true : QS.get("theme") === "light" ? false : null;
  return { QS, theme };
}
