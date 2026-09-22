import { useState } from "react";
import { SC } from "../lib/theme.js";
import { CATEGORIES, uncertaintyStatement } from "../lib/warnings.js";

/* The result warnings (lib/warnings.js, NASA-STD-7009B §4.3.8) as one line
   that opens into the full list. Always present: a result with no warnings
   still has standing notes (tool class, no waivers, no independent review),
   and hiding the line when it is quiet would teach users it only appears
   when something is wrong. */
export function ResultWarnings({ warnings, params }) {
  const [open, setOpen] = useState(false);
  if (!warnings) return null;
  const { counts, items } = warnings;
  const tone = counts.error ? SC.red : counts.warning ? SC.amber : SC.green;
  const u = uncertaintyStatement("MTOW", { params });
  const sevColor = { error: SC.red, warning: SC.amber, info: SC.muted };
  return (
    <div data-result-warnings={counts.error ? "error" : counts.warning ? "warning" : "info"}
      style={{marginBottom:10,border:`1px solid ${SC.border}`,borderLeft:`4px solid ${tone}`,borderRadius:6,
        background:SC.panel,fontFamily:"system-ui,sans-serif",fontSize:11,color:SC.text}}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{width:"100%",display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:"none",
          border:"none",cursor:"pointer",color:SC.text,textAlign:"left",fontSize:11}}>
        <span style={{fontWeight:700,color:tone}}>{open ? "▾" : "▸"} Warnings and limitations</span>
        <span style={{color:SC.muted,fontFamily:"'DM Mono',monospace",fontSize:10}}>
          {counts.error} error{counts.error !== 1 ? "s" : ""} · {counts.warning} warning{counts.warning !== 1 ? "s" : ""} · {counts.info} note{counts.info !== 1 ? "s" : ""}
        </span>
        <span style={{marginLeft:"auto",color:SC.muted,fontSize:10}}>
          {warnings.domain.insideValidation ? "inside the validated envelope" : "OUTSIDE the validated envelope"}
        </span>
      </button>
      {open && (
        <div style={{padding:"0 12px 10px"}}>
          <div style={{color:SC.muted,fontSize:10,marginBottom:6}}>
            Reported under NASA-STD-7009B §4.3.8: every warning carries its impact, and the uncertainty statement says how it was obtained.
          </div>
          {CATEGORIES.map(([id, title]) => {
            const list = items.filter(i => i.cat === id);
            return (
              <div key={id} style={{marginTop:6}}>
                <div style={{fontWeight:700}}>{id}. {title}</div>
                {list.length === 0
                  ? <div style={{color:SC.muted,marginLeft:12}}>None found.</div>
                  : list.map((i, k) => (
                    <div key={k} style={{marginLeft:12,marginTop:3,lineHeight:1.45}}>
                      <span style={{color:sevColor[i.severity],fontWeight:700,textTransform:"uppercase",fontSize:9,marginRight:6}}>{i.severity}</span>
                      {i.text}
                      <div style={{color:SC.muted,fontSize:10}}>Impact: {i.impact}</div>
                    </div>
                  ))}
              </div>
            );
          })}
          <div style={{marginTop:8,fontWeight:700}}>Uncertainty of the take-off mass</div>
          <div style={{marginLeft:12,lineHeight:1.45}}>{u.text}
            <div style={{color:SC.muted,fontSize:10}}>How obtained: {u.method}</div>
          </div>
        </div>
      )}
    </div>
  );
}
