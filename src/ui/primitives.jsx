import { useState, useEffect, useRef } from "react";
import { SC } from "../lib/theme.js";
import { capturePanel } from "../lib/capture.js";
import { T, S, MONO, SANS, numeric, labelStyle } from "./tokens.js";
import { ProvChip } from "./Provenance.jsx";

export function Slider({label,unit,value,min,max,step,onChange,note}){
  const pct=Math.max(0,Math.min(100,((value-min)/(max-min))*100));
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState(false);
  const [flash, setFlash] = useState(false);
  const prevVal = useRef(value);
  const displayVal = draft !== null ? draft : String(value);

  const commit = (raw) => {
    setDraft(null);
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
  };

  useEffect(()=>{
    if(prevVal.current !== value){
      setFlash(true);
      const t = setTimeout(()=>setFlash(false), 500);
      prevVal.current = value;
      return ()=>clearTimeout(t);
    }
  },[value]);

  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"center"}}>
        <span style={{fontSize:11,color:active?SC.text:SC.muted,fontFamily:"'IBM Plex Sans',system-ui,sans-serif",
          letterSpacing:"0.01em",transition:"color 0.15s"}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <input
            type="number"
            value={displayVal}
            step={step} min={min} max={max}
            onChange={evt=>setDraft(evt.target.value)}
            onBlur={evt=>commit(evt.target.value)}
            onKeyDown={evt=>{
              if(evt.key==="Enter") { commit(evt.target.value); evt.target.blur(); }
              if(evt.key==="Escape"){ setDraft(null); evt.target.blur(); }
            }}
            className="gc-lcd"
            style={{width:64,border:`1px solid ${active?SC.accent:"transparent"}`,borderRadius:6,
              color:SC.text,fontSize:11.5,textAlign:"right",padding:"3px 6px",
              fontFamily:"'IBM Plex Mono',monospace",fontVariantNumeric:"tabular-nums",outline:"none",transition:"border-color 0.15s"}}
          />
          <span style={{fontSize:9,color:SC.subtle,minWidth:26,fontFamily:"'IBM Plex Mono',monospace"}}>{unit}</span>
        </div>
      </div>
      {/* A recessed track, the filled run in the ACCENT (the caution amber it
          used said "warning" about every input), and a machined knob. */}
      <div className="gc-well" style={{position:"relative",height:5,borderRadius:3,marginTop:4,marginBottom:6}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,
          background:flash?SC.nominal:SC.accent,borderRadius:3,
          transition:"width 0.08s ease, background 0.2s"}}/>
        <div style={{
          position:"absolute",top:"50%",
          left:`calc(${pct}% - 8px)`,
          transform:`translateY(-50%) scale(${active?1.12:1})`,
          width:16,height:16,
          background:"radial-gradient(circle at 40% 35%, #F4F8FB, #AFC0CF 60%, #6F8294)",
          borderRadius:"50%",
          transition:"left 0.08s ease,transform 0.12s ease,box-shadow 0.15s",
          boxShadow:active
            ?`0 0 0 4px color-mix(in srgb, ${SC.accent} 22%, transparent), 0 2px 4px rgb(0 0 0 / 0.45)`
            :"0 2px 4px rgb(0 0 0 / 0.45), inset 0 -1px 1px rgb(0 0 0 / 0.25)",
          pointerEvents:"none",zIndex:1,
        }}/>
        <input type="range" value={value} min={min} max={max} step={step}
          onMouseDown={()=>setActive(true)}
          onTouchStart={()=>setActive(true)}
          onMouseUp={()=>setActive(false)}
          onTouchEnd={()=>setActive(false)}
          onBlur={()=>setActive(false)}
          onChange={evt=>{setDraft(null);onChange(parseFloat(evt.target.value));}}
          style={{position:"absolute",top:-8,left:0,width:"100%",opacity:0,cursor:"pointer",height:20,zIndex:2}}/>
      </div>
      {/* `SC.dim` at rest made every slider's help text invisible (1.39:1 in the
          light theme) — and at rest is how a control spends nearly all its time.
          The emphasis change on interaction is kept; the resting state is now
          legible rather than a divider colour used as type. */}
      {note&&<div style={{fontSize:10,color:active?SC.text:SC.subtle,marginTop:active?4:2,
        fontFamily:"'IBM Plex Mono',monospace",transition:"color 0.15s,margin-top 0.12s"}}>{note}</div>}
    </div>
  );
}

export function KPI({label,value,unit,sub,color,pk,band}){
  /* NO VERDICT MEANS MONOCHROME. This defaulted to SC.amber, so every card
     whose caller passed no colour rendered in the CAUTION hue — Wing Area
     among them, permanently amber for a quantity that has no threshold at
     all. A default that means "warning" is the worst possible default. */
  const col=color||SC.text;
  /* ── QUIET WHEN THE NUMBER IS FINE ──────────────────────────────────
     Every card carried a 2 px coloured rail and rendered its value in that
     colour. Callers pass a THRESHOLD verdict — green under a limit, amber
     near it, red past it — so on a healthy design six cards lit up in four
     colours that all meant the same thing: nothing is wrong. Green-when-fine
     is noise; it spends the reader's attention to say there is nothing to
     attend to, and it leaves no contrast for the case that matters.
     The verdict is kept and inverted: a nominal card is monochrome, and the
     rail and the coloured figure appear only when a value is off-nominal. */
  const nominal = col===SC.nominal || col===SC.green || col===SC.text || col===SC.primary;
  /* `pk` is the provenance key — when a tab passes it, the value carries its
     own answer to "where did this come from?". Optional so the 25 existing
     call sites keep working unchanged; they simply show no chip until the key
     is added. `band` is an optional published reference range, so a number can
     be read against what real aircraft do rather than in isolation. */
  /* An off-nominal card shows an annunciator lamp beside its label (it had a
     coloured left rail, a card trope that says "something" without saying
     what); the figure keeps the verdict colour. */
  const lampState = col===SC.warning||col===SC.red ? "warning"
    : col===SC.caution||col===SC.amber ? "caution" : null;
  return(
    <div className="gc-card" style={{background:SC.panel,border:`1px solid ${SC.rim}`,borderRadius:12,
      padding:`${S.md}px ${S.lg}px`,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:S.sm,marginBottom:2}}>
        {lampState&&<span className="gc-lamp" data-state={lampState} aria-hidden="true"/>}
        <span style={{...labelStyle(SC),whiteSpace:"nowrap",overflow:"hidden",
          textOverflow:"ellipsis"}}>{label}</span>
        {pk&&<span style={{marginLeft:"auto",flexShrink:0}}><ProvChip k={pk} compact/></span>}
      </div>
      <div style={{...numeric,fontSize:T.lead,fontWeight:600,color:nominal?SC.text:col,lineHeight:1.15}}>
        {typeof value==="number"?value.toLocaleString():value}
        {unit&&<span style={{fontSize:T.label,color:SC.muted,marginLeft:3,fontWeight:400}}>{unit}</span>}
      </div>
      {sub&&<div style={{...numeric,fontSize:T.label,color:SC.subtle,marginTop:2}}>{sub}</div>}
      {band&&(
        <div style={{...numeric,fontSize:T.micro,color:SC.muted,marginTop:S.xs,
          display:"flex",alignItems:"center",gap:S.xs}}>
          <span style={{color:SC.subtle}}>ref</span>{band}
        </div>
      )}
    </div>
  );
}

/* ─── capturePanel: serialise the real Recharts SVG → PNG download ─── */
export function Panel({title,children,ht,onSave}){
  const containerRef = useRef(null);
  return(
    <div ref={containerRef}
      className="gc-card"
      style={{background:SC.panel,border:`1px solid ${SC.rim}`,borderRadius:12,padding:"12px 14px",height:ht||"auto"}}>
      <div className="gc-eyebrow" style={{
        marginBottom:10,minHeight:20,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>{title}</span>
        {onSave&&(
          <button type="button"
            onClick={()=>{ capturePanel(containerRef,title); onSave(); }}
            title="Save exact chart image as PNG to your device"
            className="gc-key"
            style={{minHeight:24,padding:"0 8px",fontSize:10.5,flexShrink:0,marginLeft:8,
              textTransform:"none",letterSpacing:0}}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
            Save plot
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function Acc({title,icon,children}){
  const[open,setOpen]=useState(true);
  return(
    <div style={{marginBottom:8}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",
        display:"flex",alignItems:"center",gap:7,padding:"4px 0"}}>
        <span style={{fontSize:12}}>{icon}</span>
        <span className="gc-eyebrow">{title}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SC.subtle} strokeWidth="2" strokeLinecap="round"
          style={{marginLeft:"auto",transform:open?"none":"rotate(-90deg)",transition:"transform 0.15s"}}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open&&<div style={{paddingTop:4}}>{children}</div>}
    </div>
  );
}
