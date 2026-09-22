import { useState, useEffect, useRef } from "react";
import { SC } from "../lib/theme.js";
import { capturePanel } from "../lib/capture.js";
import { T, S, R, MONO, SANS, numeric, labelStyle } from "./tokens.js";
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
        <span style={{fontSize:11,color:active?SC.text:SC.muted,fontFamily:"system-ui,sans-serif",
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
            style={{width:62,background:SC.panel,border:`1px solid ${active?SC.amber:SC.border}`,borderRadius:3,
              color:SC.amber,fontSize:11,textAlign:"right",padding:"2px 5px",
              fontFamily:"'DM Mono',monospace",outline:"none",transition:"border-color 0.15s"}}
          />
          <span style={{fontSize:9,color:SC.subtle,minWidth:26,fontFamily:"'DM Mono',monospace"}}>{unit}</span>
        </div>
      </div>
      <div style={{position:"relative",height:active?5:3,background:SC.border,borderRadius:3,
        transition:"height 0.12s ease",marginTop:active?-1:0}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,
          background:flash?SC.teal:SC.amber,borderRadius:3,
          transition:"width 0.08s ease, background 0.2s",
          boxShadow:active?`0 0 8px ${SC.amber}88`:flash?`0 0 6px ${SC.teal}66`:"none"}}/>
        <div style={{
          position:"absolute",top:"50%",
          left:`calc(${pct}% - ${active?8:5}px)`,
          transform:"translateY(-50%)",
          width:active?16:10,height:active?16:10,
          background:active?SC.amber:SC.panel,
          border:`2px solid ${flash?SC.teal:SC.amber}`,
          borderRadius:"50%",
          transition:"width 0.12s ease,height 0.12s ease,left 0.08s ease,background 0.15s,border-color 0.2s,box-shadow 0.15s",
          boxShadow:active?`0 0 0 3px ${SC.amber}33,0 0 12px ${SC.amber}55`:flash?`0 0 0 2px ${SC.teal}44`:"none",
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
        fontFamily:"'DM Mono',monospace",transition:"color 0.15s,margin-top 0.12s"}}>{note}</div>}
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
  return(
    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:R.md,
      padding:`${S.md}px ${S.lg}px`,minWidth:0,
      borderLeft: nominal ? `1px solid ${SC.border}` : `2px solid ${col}`}}>
      <div style={{display:"flex",alignItems:"center",gap:S.sm,marginBottom:2}}>
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
      style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px",height:ht||"auto"}}>
      <div style={{fontSize:11,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"system-ui,sans-serif",
        marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>{title}</span>
        {onSave&&(
          <button type="button"
            onClick={()=>{ capturePanel(containerRef,title); onSave(); }}
            title="Save exact chart image as PNG to your device"
            style={{padding:"2px 8px",background:"transparent",
              border:`1px solid ${SC.border}`,borderRadius:4,
              color:SC.amber,fontSize:10,cursor:"pointer",
              fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em",
              transition:"all 0.15s",flexShrink:0,marginLeft:8,
              whiteSpace:"nowrap"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=SC.amber;e.currentTarget.style.background=`${SC.amber}18`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=SC.border;e.currentTarget.style.background="transparent";}}>
            💾 Save Plot
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
        <span style={{fontSize:11,fontWeight:700,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"system-ui,sans-serif"}}>{title}</span>
        <span style={{marginLeft:"auto",color:SC.subtle,fontSize:10}}>{open?"▾":"▸"}</span>
      </button>
      {open&&<div style={{paddingTop:4}}>{children}</div>}
    </div>
  );
}
