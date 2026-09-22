/* =====================================================================
   INPUT PANEL — the aircraft studio's input deck
   =====================================================================
   Replaces the single column of sliders. Layout, top to bottom:
     search      filters every input of the type by label or key
     key         the defining requirements, always visible
     pages       one discipline at a time (input-deck.js)
   Each input is one compact row: source status, label, a numeric field
   with its unit, and a reset mark when it differs from the default.
   A value outside the input's range is kept but flagged; the sizer
   decides whether it closes. Inputs the chosen methods do not use are
   not shown (their values are kept).
   ===================================================================== */
import { useMemo, useState } from "react";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { StatusChip } from "../ui-kit.jsx";
import { deckFor, applies } from "./input-deck.js";

const fieldBox = (bad) => ({
  width: 84, boxSizing: "border-box", textAlign: "right", fontFamily: MONO, fontSize: T.label,
  background: SC.inset, color: SC.text, border: `1px solid ${bad ? SC.warning : SC.border}`, borderRadius: 2, padding: "3px 5px",
});
const decimals = (spec) => {
  const span = (spec.max ?? 1) - (spec.min ?? 0);
  return span > 1000 ? 0 : span > 50 ? 1 : span > 2 ? 2 : 4;
};

function NumberField({ spec, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (Number.isFinite(value) ? String(+value.toFixed(decimals(spec))) : "");
  const n = Number(shown);
  const bad = draft !== null ? !Number.isFinite(n) : (Number.isFinite(spec.min) && (value < spec.min || value > spec.max));
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (Number.isFinite(v)) onChange(v);
    setDraft(null);
  };
  const step = (sign) => {
    const d = decimals(spec);
    const inc = spec.step ?? (d === 0 ? Math.max(1, Math.round((spec.max - spec.min) / 100)) : 10 ** -d * (d >= 4 ? 10 : 1));
    onChange(+(value + sign * inc).toFixed(d));
  };
  return (
    <input type="text" inputMode="decimal" aria-label={spec.label} value={shown} style={fieldBox(bad)}
      title={Number.isFinite(spec.min) ? `range ${spec.min} to ${spec.max}${bad ? " (outside)" : ""}` : undefined}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
        else if (e.key === "Escape") setDraft(null);
        else if (e.key === "ArrowUp") { e.preventDefault(); step(+1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
      }} />
  );
}

export function InputRow({ k, spec, value, def, onChange }) {
  const changed = def !== undefined && value !== def;
  let control;
  if (Array.isArray(spec.options)) {
    control = (
      <select value={value} aria-label={spec.label} onChange={(e) => onChange(k, e.target.value)}
        style={{ ...fieldBox(false), width: 124, textAlign: "left" }}>
        {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (typeof spec.value === "boolean") {
    control = <input type="checkbox" aria-label={spec.label} checked={!!value} onChange={(e) => onChange(k, e.target.checked)} />;
  } else {
    control = <NumberField spec={spec} value={value} onChange={(v) => onChange(k, v)} />;
  }
  return (
    <div role="group" aria-label={spec.label}
      style={{ display: "grid", gridTemplateColumns: "18px 1fr auto 44px 14px", alignItems: "center", columnGap: 6,
               minHeight: 26, padding: "1px 0", borderBottom: `1px solid ${SC.border}` }}>
      <StatusChip status={spec.status} source={spec.source} />
      <span title={spec.source} style={{ fontSize: T.label, color: changed ? SC.text : SC.muted, fontFamily: SANS, lineHeight: 1.25 }}>
        {spec.label}
      </span>
      <span style={{ justifySelf: "end" }}>{control}</span>
      <span style={{ fontSize: T.micro, color: SC.subtle, fontFamily: MONO, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        title={spec.unit}>{spec.unit}</span>
      {changed
        ? <button type="button" title={`Reset to ${def}`} aria-label={`Reset ${spec.label}`} onClick={() => onChange(k, def)}
            style={{ border: "none", background: "transparent", color: SC.caution, cursor: "pointer", padding: 0, fontSize: 11 }}>●</button>
        : <span />}
    </div>
  );
}

const groupTitle = (t) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: `${S.md}px 0 3px` }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: SC.muted, fontFamily: SANS, whiteSpace: "nowrap" }}>{t}</span>
    <span style={{ flex: 1, height: 1, background: SC.border }} />
  </div>
);

export default function InputPanel({ type, inputs, values, defaults, onChange, onResetAll }) {
  const deck = useMemo(() => deckFor(type, inputs), [type, inputs]);
  const [page, setPage] = useState("mission");
  const [query, setQuery] = useState("");
  const current = deck.pages.find((p) => p.id === page) ?? deck.pages[0];
  const changedCount = Object.keys(inputs).filter((k) => defaults[k] !== undefined && values[k] !== defaults[k]).length;
  const row = (k) => (inputs[k] && applies(deck, k, values)
    ? <InputRow key={k} k={k} spec={inputs[k]} value={values[k]} def={defaults[k]} onChange={onChange} /> : null);

  const q = query.trim().toLowerCase();
  const hits = q ? Object.keys(inputs).filter((k) => k.toLowerCase().includes(q) || inputs[k].label.toLowerCase().includes(q)) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="search" placeholder={`Search ${Object.keys(inputs).length} inputs`} value={query} aria-label="Search inputs"
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, padding: "5px 8px", fontSize: T.label, fontFamily: SANS }} />
        {changedCount > 0 && (
          <button type="button" onClick={onResetAll} title="Reset every input of this type"
            style={{ fontSize: T.micro, background: "transparent", color: SC.caution, border: `1px solid ${SC.border}`, borderRadius: 3, padding: "4px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {changedCount} changed ↺
          </button>
        )}
      </div>

      {hits ? (
        <section aria-label="Search results">
          {groupTitle(`${hits.length} match${hits.length === 1 ? "" : "es"}`)}
          {hits.map((k) => <InputRow key={k} k={k} spec={inputs[k]} value={values[k]} def={defaults[k]} onChange={onChange} />)}
        </section>
      ) : (
        <>
          <section aria-label="Key requirements" style={{ border: `1px solid ${SC.border}`, borderRadius: 3, padding: `2px ${S.sm}px ${S.sm}px`, background: SC.panel }}>
            {groupTitle("Key requirements")}
            {deck.key.map(row)}
          </section>

          <nav aria-label="Input pages" style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: S.xs }}>
            {deck.pages.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === current.id} onClick={() => setPage(p.id)}
                style={{ fontSize: T.micro, padding: "4px 7px", borderRadius: 2, cursor: "pointer", fontFamily: SANS,
                         border: `1px solid ${p.id === current.id ? SC.caution : SC.border}`,
                         background: p.id === current.id ? SC.inset : "transparent", color: p.id === current.id ? SC.text : SC.muted }}>
                {p.label}
              </button>
            ))}
          </nav>

          <section aria-label={current.label} style={{ border: `1px solid ${SC.border}`, borderRadius: 3, padding: `2px ${S.sm}px ${S.sm}px`, background: SC.panel }}>
            {current.groups.map((g) => {
              const rows = g.keys.map(row).filter(Boolean);
              return rows.length ? <div key={g.title}>{groupTitle(g.title)}{rows}</div> : null;
            })}
          </section>
        </>
      )}
    </div>
  );
}
