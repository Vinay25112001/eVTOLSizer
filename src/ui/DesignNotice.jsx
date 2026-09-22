import { useState } from "react";
import { SC } from "../lib/theme.js";
import { describeContinuity, HEADLINE_OUTPUTS } from "../lib/designfile.js";

/* What happened to the design the user just opened or saved. Stays until
   dismissed: a result that CHANGED under a new engine is the one message in
   this tool the user must not miss because a toast timed out. */

const fmt = (v) => typeof v === "number"
  ? (Math.abs(v) >= 100 ? v.toFixed(1) : +v.toPrecision(4))
  : String(v);

export function continuityNotice(check, { source = "design", name = "" } = {}) {
  const tone = check.status === "identical" && check.hashOK !== false && !check.legacy ? "ok"
    : check.status === "changed" || check.hashOK === false ? "error" : "warn";
  const labels = Object.fromEntries(HEADLINE_OUTPUTS.map(([k, l, u]) => [k, [l, u]]));
  const moved = (check.moved || []).map(m => {
    const [label, unit] = labels[m.field] || [m.field, ""];
    const pct = typeof m.rel === "number" ? ` (${m.rel >= 0 ? "+" : ""}${(m.rel * 100).toFixed(2)}%)` : "";
    return `${label}: ${fmt(m.was)} → ${fmt(m.now)}${unit ? " " + unit : ""}${pct}`;
  });
  return {
    tone,
    title: `Opened ${name ? `"${name}"` : source}${name && source ? ` — ${source}` : ""}`,
    lines: describeContinuity(check),
    details: moved,
  };
}

export function DesignNotice({ notice, onClose }) {
  const [open, setOpen] = useState(false);
  if (!notice) return null;
  const color = notice.tone === "ok" ? SC.green : notice.tone === "error" ? SC.red : SC.amber;
  const details = notice.details || [];
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} data-design-notice={notice.tone}
      style={{padding:"10px 14px",marginBottom:10,borderRadius:6,background:SC.panel,
        border:`1px solid ${color}`,borderLeft:`4px solid ${color}`,
        fontFamily:"system-ui,sans-serif",fontSize:11,color:SC.text}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
        <div style={{fontWeight:700,color}}>{notice.title}</div>
        <button type="button" onClick={onClose} aria-label="Dismiss"
          style={{background:"none",border:"none",color:SC.muted,cursor:"pointer",fontSize:13,lineHeight:1}}>✕</button>
      </div>
      {(notice.lines || []).map((l, i) => <div key={i} style={{marginTop:4,lineHeight:1.5}}>{l}</div>)}
      {details.length > 0 && (
        <div style={{marginTop:6}}>
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{background:"none",border:"none",padding:0,color:SC.muted,cursor:"pointer",fontSize:10,
              fontFamily:"'DM Mono',monospace"}}>
            {open ? "▾" : "▸"} {details.length} changed output{details.length !== 1 ? "s" : ""}
          </button>
          {open && (
            <div style={{marginTop:4,maxHeight:180,overflowY:"auto",fontFamily:"'DM Mono',monospace",fontSize:10,color:SC.muted}}>
              {details.map((d, i) => <div key={i}>{d}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
