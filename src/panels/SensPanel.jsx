import { useState } from "react";
import {
  Cell,
} from "recharts";
import { SC } from "../lib/theme.js";
import { runSizing } from "../engine.js";
import { engineInputs } from "../lib/designfile.js";

export function SensPanel({params,SR,SC,U}){
  const[running,setRunning]=useState(false);
  const[results,setResults]=useState(null);
  const uc=U||{mass:v=>+v.toFixed(1),massU:"kg"};
  const KEYS=[
    {k:"range",    l:"Range"},    {k:"payload",  l:"Payload"},
    {k:"sedCell",  l:"Cell SED"}, {k:"ewf",      l:"Empty Wt Frac"},
    {k:"LD",       l:"L/D"},      {k:"etaHov",   l:"Hover FOM"},
    {k:"etaSys",   l:"System η"}, {k:"etaBat",   l:"Battery η"},
    {k:"propDiam", l:"Rotor Dia"},{k:"AR",        l:"Aspect Ratio"},
    {k:"twRatio",  l:"T/W"},      {k:"nPropHover",l:"# Rotors"},
  ];
  const run=()=>{
    setRunning(true); setResults(null);
    setTimeout(()=>{
      const base=SR.MTOW;
      const res=KEYS.map(({k,l})=>{
        const v=Number(params[k]);
        if(!isFinite(v)) return null;
        let hi,lo;
        try{
          hi=runSizing(engineInputs({...params,[k]:v*1.1}));
        }catch{return null;}
        try{
          lo=runSizing(engineInputs({...params,[k]:v*0.9}));
        }catch{return null;}
        if(!hi||!lo) return null;
        const impact=Math.abs((hi.MTOW-base)-(lo.MTOW-base))/2;
        return {k,l,impact:+impact.toFixed(1),pct:+(impact/base*100).toFixed(2)};
      }).filter(Boolean).sort((a,b)=>b.impact-a.impact);
      setResults(res); setRunning(false);
    },10);
  };
  const max=results?Math.max(...results.map(r=>r.impact),1):1;
  return(
    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"14px 16px",marginTop:4}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:results?12:0,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:SC.text,fontFamily:"system-ui,sans-serif"}}>One-Click Sensitivity Report</div>
          <div style={{fontSize:10,color:SC.muted,marginTop:2,fontFamily:"system-ui,sans-serif"}}>Sweeps 12 params ±10% — ranks by MTOW impact</div>
        </div>
        <button onClick={run} disabled={running} type="button"
          /* Amber-to-orange gradient on the primary action, in a tool whose
             data uses amber for CAUTION. Solid ink carries the emphasis. */
          style={{padding:"8px 22px",background:running?"transparent":SC.text,
            border:`1px solid ${running?SC.border:SC.amber}`,borderRadius:6,
            color:running?SC.muted:SC.panel,fontSize:12,fontWeight:600,
            cursor:running?"not-allowed":"pointer",fontFamily:"system-ui,sans-serif",whiteSpace:"nowrap"}}>
          {running?"⏳ Running…":"▶ Run Analysis"}
        </button>
      </div>
      {results&&(
        <div>
          {results.map((r,i)=>{
            const col=i===0?SC.red:i<3?SC.amber:i<6?SC.teal:SC.dim;
            return(
              <div key={r.k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:108,fontSize:9,color:SC.muted,textAlign:"right",flexShrink:0,fontFamily:"system-ui,sans-serif"}}>{r.l}</div>
                <div style={{flex:1,height:20,background:SC.bg,borderRadius:3,position:"relative",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(r.impact/max)*100}%`,background:`${col}44`,borderRadius:3}}/>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:8,gap:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>±{uc.mass(r.impact)} {uc.massU}</span>
                    {i===0&&<span style={{fontSize:8,color:SC.red,fontFamily:"system-ui,sans-serif"}}>← most sensitive</span>}
                  </div>
                </div>
                <div style={{width:50,fontSize:8,color:SC.muted,textAlign:"right",fontFamily:"'DM Mono',monospace",flexShrink:0}}>{r.pct}%</div>
                <div style={{width:30,fontSize:8,color:SC.subtle,textAlign:"right",fontFamily:"'DM Mono',monospace",flexShrink:0}}>{i===0?"—":`${(results[0].impact/r.impact).toFixed(1)}×`}</div>
              </div>
            );
          })}
          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${SC.border}`,fontSize:9,color:SC.subtle,fontFamily:"system-ui,sans-serif"}}>
            Base MTOW: <b style={{color:SC.amber}}>{uc.mass(SR.MTOW)} {uc.massU}</b> · ±10% sweep · last col = ratio vs most sensitive
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Interactive Donut: Phase Duration ── */
