import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import { useState } from "react";
import {
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { SC } from "../lib/theme.js";
import { engineInputs, reserveDistanceKm } from "../lib/designfile.js";
import { Panel } from "../ui/primitives.jsx";

export function DesignSpacePanel({ params, SC, TTP, runSizingFn, onApply, U }) {
  const [results,  setResults]  = useState(null);
  const [running,  setRunning]  = useState(false);
  const [dseProgress, setDseProgress] = useState(0);
  const [nSamples, setNSamples] = useState(300);
  const [xAxis,    setXAxis]    = useState("range");
  const [yAxis,    setYAxis]    = useState("MTOW");
  const [colorBy,  setColorBy]  = useState("feasible");
  const [applied,  setApplied]  = useState(null); // last applied point index for highlight
  const [dseFilter, setDseFilter] = useState("all"); // all | feasible | pareto | infeasible
  const uc = U || {mass:v=>+v.toFixed(1),massU:"kg",power:v=>+v.toFixed(1),powerU:"kW",dist:v=>+v.toFixed(1),distU:"km",len:v=>+v.toFixed(2),lenU:"m",area:v=>+v.toFixed(2),areaU:"m²",wl:v=>+v.toFixed(1),wlU:"N/m²"};

  const lhs = (n, dims) => {
    const result = [];
    for (let d = 0; d < dims; d++) {
      const col = Array.from({length:n}, (_,i) => (i + Math.random()) / n);
      for (let i = n-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [col[i],col[j]]=[col[j],col[i]]; }
      result.push(col);
    }
    return result;
  };

  const runDSE = async () => {
    setRunning(true); setResults(null); setDseProgress(0);
    const N = nSamples;
    const vars = [
      {key:"range",   base:params.range,   pct:0.40},
      {key:"payload", base:params.payload, pct:0.40},
      {key:"LD",      base:params.LD,      pct:0.25},
      {key:"sedCell", base:params.sedCell, pct:0.30},
      {key:"ewf",     base:params.ewf,     pct:0.20},
      {key:"AR",      base:params.AR,      pct:0.30},
      {key:"etaHov",  base:params.etaHov,  pct:0.15},
      {key:"etaSys",  base:params.etaSys,  pct:0.15},
    ];
    const samples = lhs(N, vars.length);
    const pts = [];
    const BATCH = 30; // yield UI every 30 samples
    for (let i = 0; i < N; i++) {
      const pS = {...params};
      vars.forEach((v,d) => { pS[v.key] = v.base*(1-v.pct) + samples[d][i]*v.base*2*v.pct; });
      pS.AR = Math.round(pS.AR*10)/10;
      pS.payload = Math.round(pS.payload);
      try {
        const R = runSizingFn(engineInputs(pS));
        if (!R||!isFinite(R.MTOW)||R.MTOW>8000||R.MTOW<200) continue;
        const missionRange_dse = +pS.range.toFixed(1);
        const totalRange_dse   = +(pS.range + reserveDistanceKm(pS)).toFixed(1);
        pts.push({
          range:totalRange_dse, missionRange:missionRange_dse,
          payload:+pS.payload.toFixed(0),
          LD:+pS.LD.toFixed(2), sedCell:+pS.sedCell.toFixed(0),
          ewf:+pS.ewf.toFixed(3), AR:+pS.AR.toFixed(1),
          etaHov:+pS.etaHov.toFixed(3), etaSys:+pS.etaSys.toFixed(3),
          MTOW:+R.MTOW.toFixed(1), Wempty:+R.Wempty.toFixed(1), Wbat:+R.Wbat.toFixed(1),
          Etot:+R.Etot.toFixed(2), Phov:+R.Phov.toFixed(2), Pcr:+R.Pcr.toFixed(2),
          LDact:+R.LDact.toFixed(2), SM:+(R.SM_vt*100).toFixed(2),
          PackkWh:+R.PackkWh.toFixed(2), bWing:+R.bWing.toFixed(2),
          Swing:+R.Swing.toFixed(2), WL:+R.WL.toFixed(1),
          TipMach:+R.TipMach.toFixed(4), RPM:+R.RPM.toFixed(0),
          batFrac:+(R.Wbat/R.MTOW*100).toFixed(1),
          emptyFrac:+(R.Wempty/R.MTOW*100).toFixed(1),
          SEDpack:+R.SEDpack.toFixed(1),
          feasible:R.feasible, pareto:false,
          _params:{range:pS.range, payload:pS.payload, LD:pS.LD, sedCell:pS.sedCell,
            ewf:pS.ewf, AR:pS.AR, etaHov:pS.etaHov, etaSys:pS.etaSys},
        });
      } catch {}
      if (i % BATCH === BATCH-1) {
        setDseProgress(Math.round((i+1)/N*100));
        await new Promise(r=>setTimeout(r,0)); // yield to UI
      }
    }
    const fp = pts.filter(p=>p.feasible);
    fp.forEach(p => { p.pareto = !fp.some(q=>q.MTOW<=p.MTOW&&q.range>=p.range&&q.payload>=p.payload&&(q.MTOW<p.MTOW||q.range>p.range||q.payload>p.payload)); });
    setResults({pts,feasCount:fp.length,paretoCount:fp.filter(p=>p.pareto).length,total:pts.length});
    setDseProgress(100);
    setRunning(false);
  };

  const axes=[
    // ── Outputs ──
    {key:"range",    label:`Range (${uc.distU})`},
    {key:"payload",  label:`Payload (${uc.massU})`},
    {key:"MTOW",     label:`MTOW (${uc.massU})`},
    {key:"Wempty",   label:`Empty Weight (${uc.massU})`},
    {key:"Wbat",     label:`Battery Mass (${uc.massU})`},
    {key:"Etot",     label:"Total Energy (kWh)"},
    {key:"PackkWh",  label:"Pack Capacity (kWh)"},
    {key:"Phov",     label:`Hover Power (${uc.powerU})`},
    {key:"Pcr",      label:`Cruise Power (${uc.powerU})`},
    {key:"LDact",    label:"Actual L/D"},
    {key:"SM",       label:"Static Margin (%)"},
    {key:"bWing",    label:`Wing Span (${uc.lenU})`},
    {key:"Swing",    label:`Wing Area (${uc.areaU})`},
    {key:"WL",       label:`Wing Loading (${uc.wlU})`},
    {key:"TipMach",  label:"Tip Mach"},
    {key:"RPM",      label:"Rotor RPM"},
    {key:"batFrac",  label:"Battery Fraction (%)"},
    {key:"emptyFrac",label:"Empty Weight Fraction (%)"},
    {key:"SEDpack",  label:"Pack SED (Wh/kg)"},
    // ── Sampled inputs ──
    {key:"LD",       label:"Input L/D"},
    {key:"sedCell",  label:"Cell SED (Wh/kg)"},
    {key:"ewf",      label:"Empty Weight Fraction (input)"},
    {key:"AR",       label:"Aspect Ratio"},
    {key:"etaHov",   label:"Hover Efficiency η"},
    {key:"etaSys",   label:"System Efficiency η"},
  ];
  const colorOpts=[
    {key:"feasible", label:"Feasible / Infeasible"},
    {key:"pareto",   label:"Pareto Front"},
    {key:"LDact",    label:"Actual L/D"},
    {key:"batFrac",  label:"Battery Fraction"},
    {key:"SM",       label:"Static Margin"},
    {key:"Etot",     label:"Total Energy"},
    {key:"TipMach",  label:"Tip Mach"},
    {key:"emptyFrac",label:"Empty Frac"},
  ];
  const getColor = pt => {
    if(colorBy==="feasible")  return pt.feasible?"#22c55e":"#ef4444";
    if(colorBy==="pareto")    return pt.pareto?"#f59e0b":(pt.feasible?"#22c55e88":"#ef444455");
    if(colorBy==="LDact")     return `hsl(${Math.min(pt.LDact/20*120,120)},90%,55%)`;
    if(colorBy==="batFrac")   return `hsl(${Math.max(0,120-pt.batFrac*2)},90%,55%)`;
    if(colorBy==="SM")        return `hsl(${Math.min(Math.max(pt.SM,0)/30*120,120)},90%,55%)`;
    if(colorBy==="Etot")      return `hsl(${Math.max(0,200-pt.Etot*1.5)},90%,55%)`;
    if(colorBy==="TipMach")   return `hsl(${Math.max(0,120-pt.TipMach*300)},90%,55%)`;
    if(colorBy==="emptyFrac") return `hsl(${Math.max(0,120-pt.emptyFrac*2)},90%,55%)`;
    return "#60a5fa";
  };
  const sel={background:SC.bg,border:`1px solid ${SC.border}`,color:SC.text,borderRadius:4,padding:"4px 8px",fontSize:10,fontFamily:"'DM Mono',monospace",outline:"none"};
  const sm={fontSize:10,fontFamily:"'DM Mono',monospace",color:SC.muted};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 16px",display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={sm}>Samples:</span><input type="range" min={100} max={800} step={50} value={nSamples} onChange={evt=>setNSamples(+evt.target.value)} style={{width:100}}/><span style={{...sm,color:SC.amber,fontWeight:700}}>{nSamples}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={sm}>X:</span><select value={xAxis} onChange={evt=>setXAxis(evt.target.value)} style={sel}>{axes.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={sm}>Y:</span><select value={yAxis} onChange={evt=>setYAxis(evt.target.value)} style={sel}>{axes.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={sm}>Color:</span><select value={colorBy} onChange={evt=>setColorBy(evt.target.value)} style={sel}>{colorOpts.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
        <button onClick={runDSE} disabled={running} type="button" style={{padding:"7px 20px",background:running?"transparent":`linear-gradient(135deg,#4c1d95,#7c3aed)`,border:"2px solid #7c3aed",borderRadius:6,color:running?SC.muted:"#e9d5ff",fontSize:11,fontWeight:800,cursor:running?"not-allowed":"pointer",fontFamily:"'DM Mono',monospace"}}>
          {running?"⟳ Computing…":"Run Design Space Exploration"}
        </button>
        {results&&(
          <div style={{display:"flex",gap:4,marginLeft:"auto",flexWrap:"wrap"}}>
            {[
              {k:"all",      label:`All (${results.total})`,         col:SC.muted},
              {k:"feasible", label:`✓ Feasible (${results.feasCount})`, col:SC.nominal},
              {k:"pareto",   label:`★ Pareto (${results.paretoCount})`, col:SC.caution},
              {k:"infeasible",label:`✗ Bad (${results.total-results.feasCount})`, col:SC.warning},
            ].map(({k,label,col})=>(
              <button key={k} type="button" onClick={()=>setDseFilter(k)}
                style={{padding:"4px 10px",fontSize:9,fontFamily:"'DM Mono',monospace",cursor:"pointer",
                  background:dseFilter===k?`${col}22`:"transparent",
                  border:`1px solid ${dseFilter===k?col:SC.border}`,
                  color:dseFilter===k?col:SC.muted,borderRadius:4,fontWeight:dseFilter===k?700:400,
                  transition:"all 0.15s"}}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!results&&!running&&(
        <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:32,textAlign:"center"}}>
          
          <div style={{fontSize:13,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Click "Run Design Space Exploration"</div>
          <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.8,maxWidth:500,margin:"0 auto"}}>
            Latin Hypercube Sampling sweeps 8 design variables (±20-40% range).<br/>
            Each sample = complete sizing solution. Green = feasible, Red = infeasible.<br/>
            <strong style={{color:SC.caution}}>Yellow = Pareto-optimal</strong> — no design beats them on all 3 objectives simultaneously.<br/>
            This is what Joby & Archer compute with proprietary tools. Now interactive and free.
          </div>
        </div>
      )}

      {running&&(
        <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:32,textAlign:"center"}}>
          
          <div style={{fontSize:12,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:10}}>
            Running {nSamples} Latin Hypercube samples… {dseProgress}%
          </div>
          <div style={{height:8,background:SC.border,borderRadius:4,maxWidth:320,margin:"0 auto 8px"}}>
            <div style={{width:`${dseProgress}%`,height:"100%",background:"#7c3aed",borderRadius:4,transition:"width 0.15s ease"}}/>
          </div>
          <div style={{fontSize:10,color:SC.subtle,fontFamily:"'DM Mono',monospace"}}>
            {Math.round(dseProgress*nSamples/100)} / {nSamples} points computed
          </div>
        </div>
      )}

      {results&&(<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[["Total Samples",results.total,SC.text],["Feasible",`${results.feasCount} (${(results.feasCount/results.total*100).toFixed(0)}%)`,SC.green],["Infeasible",results.total-results.feasCount,SC.red],["Pareto-Optimal",`${results.paretoCount} ★`,"#f59e0b"]].map(([label,val,col])=>(
            <div key={label} style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",marginBottom:4}}>{label}</div>
              <div style={{fontSize:18,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
            {axes.find(a=>a.key===xAxis)?.label} vs {axes.find(a=>a.key===yAxis)?.label}
            <span style={{color:SC.muted,fontWeight:400,marginLeft:8}}>
              — showing {dseFilter==="all"?"all":dseFilter==="feasible"?"feasible only":dseFilter==="pareto"?"Pareto-optimal only":"infeasible only"} designs
            </span>
            {colorBy==="pareto"&&<span style={{color:SC.caution,marginLeft:12}}>● Pareto-optimal</span>}
            {colorBy==="feasible"&&<><span style={{color:SC.green,marginLeft:12}}>● Feasible</span><span style={{color:SC.red,marginLeft:8}}>● Infeasible</span></>}
          </div>
          {(()=>{
            const filterPts = results.pts.filter(pt=>{
              if(dseFilter==="feasible")   return pt.feasible;
              if(dseFilter==="pareto")     return pt.pareto;
              if(dseFilter==="infeasible") return !pt.feasible;
              return true; // "all"
            });
            // Group points by color bucket for efficient rendering (not one series per point)
            const buckets={};
            filterPts.forEach(pt=>{
              const col=getColor(pt);
              const r=colorBy==="pareto"&&pt.pareto?5:3;
              const key=col+"_"+r;
              if(!buckets[key]) buckets[key]={col,r,pts:[]};
              buckets[key].pts.push(pt);
            });
            const TooltipContent=({payload})=>{
              if(!payload?.length) return null;
              const d=payload[0].payload;
              return(<div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:6,padding:"8px 12px",fontSize:9,fontFamily:"'DM Mono',monospace",maxHeight:320,overflowY:"auto",zIndex:999}}>
                {[["Total Range",uc.dist(d.range)+" "+uc.distU],["Mission Range",uc.dist(d.missionRange||d.range)+" "+uc.distU],["Payload",uc.mass(d.payload)+" "+uc.massU],["MTOW",uc.mass(d.MTOW)+" "+uc.massU],["Empty Wt",uc.mass(d.Wempty)+" "+uc.massU],["Battery",uc.mass(d.Wbat)+" "+uc.massU],["Energy",d.Etot+" kWh"],["Pack Cap",d.PackkWh+" kWh"],["Hover Pwr",uc.power(d.Phov)+" "+uc.powerU],["Cruise Pwr",uc.power(d.Pcr)+" "+uc.powerU],["L/D (actual)",d.LDact],["L/D (input)",d.LD],["Bat Frac",d.batFrac+"%"],["Empty Frac",d.emptyFrac+"%"],["Wing Span",uc.len(d.bWing)+" "+uc.lenU],["Wing Area",uc.area(d.Swing)+" "+uc.areaU],["Wing Loading",uc.wl(d.WL)+" "+uc.wlU],["Static Margin",d.SM+"%"],["Tip Mach",d.TipMach],["RPM",d.RPM],["Cell SED",d.sedCell+" Wh/kg"],["Pack SED",d.SEDpack+" Wh/kg"],["AR",d.AR],["η_hov",d.etaHov],["η_sys",d.etaSys],["Status",d.feasible?"Feasible":"Infeasible"],["Pareto",d.pareto?"Yes":"—"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:16,justifyContent:"space-between"}}><span style={{color:SC.muted}}>{k}</span><span style={{color:SC.text,fontWeight:700}}>{v}</span></div>
                ))}
              </div>);
            };
            return(
            <>
            {onApply&&(
              <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,padding:"4px 8px",background:`${SC.amber}11`,border:`1px solid ${SC.amber}33`,borderRadius:4}}>
                 Click any dot to apply that design's parameters to the sizer — all tabs will update instantly.
                {applied!==null&&<span style={{color:SC.amber,marginLeft:8}}>✓ Point #{applied+1} applied</span>}
              </div>
            )}
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{top:10,right:20,bottom:40,left:10}}>
                <CartesianGrid {...chartGrid()}/>
                <XAxis type="number" dataKey={xAxis} name={axes.find(a=>a.key===xAxis)?.label}
                  tick={{fontSize:9,fill:SC.muted}}
                  label={{value:axes.find(a=>a.key===xAxis)?.label,position:"insideBottom",offset:-18,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                <YAxis type="number" dataKey={yAxis} name={axes.find(a=>a.key===yAxis)?.label}
                  tick={{fontSize:9,fill:SC.muted}}
                  label={{value:axes.find(a=>a.key===yAxis)?.label,angle:-90,position:"insideLeft",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                <Tooltip cursor={{strokeDasharray:"3 3"}} content={TooltipContent} {...chartTooltip()}/>
                {Object.entries(buckets).map(([key,{col,r,pts:bpts}])=>(
                  <Scatter isAnimationActive={false} key={key}
                    data={bpts.map((pt)=>({...pt,x:pt[xAxis],y:pt[yAxis]}))}
                    dataKey="y" fill={col} opacity={0.85}
                    onClick={onApply?(data)=>{
                      // Recharts Scatter onClick: actual point is in data.payload (not data directly)
                      const pt = data?.payload ?? data;
                      if(!pt||pt.range==null) return;
                      // Use _params (full precision) for exact MTOW replay, fall back to display values
                      onApply(pt._params || pt);
                      setApplied(`${pt.range}_${pt.payload}_${pt.MTOW}`);
                    }:undefined}
                    shape={(props)=>{
                      const{cx,cy,payload}=props;
                      const key_=`${payload.range}_${payload.payload}_${payload.MTOW}`;
                      const isApplied=applied!==null&&key_===applied;
                      return(
                        <circle cx={cx} cy={cy} r={isApplied?7:r}
                          fill={isApplied?SC.caution:col}
                          opacity={0.9}
                          stroke={isApplied?SC.panel:"none"}
                          strokeWidth={isApplied?2:0}
                          style={{cursor:onApply?"pointer":"default"}}/>
                      );
                    }}/>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            </>
            );
          })()}
        </div>

          <div style={{background:SC.panel,border:"1px solid #f59e0b44",borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:SC.caution,fontFamily:"'DM Mono',monospace",marginBottom:4}}>★ Pareto-Optimal Designs ({results.paretoCount}) — Non-dominated frontier</div>
            {onApply&&<div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Click any row to apply that design to the sizer.</div>}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:9,fontFamily:"'DM Mono',monospace"}}>
                <thead><tr style={{background:SC.bg}}>{["Range km","Payload kg","MTOW kg","Batt kg","Energy kWh","L/D","SM %","Span m","Bat %","Pack SED"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"right",color:SC.muted,fontWeight:700,borderBottom:`1px solid ${SC.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{results.pts.filter(p=>p.pareto).sort((a,b)=>b.range-a.range).slice(0,10).map((pt,i)=>(
                  <tr key={i} onClick={onApply?()=>{
                    onApply(pt._params || pt);
                    setApplied(`${pt.range}_${pt.payload}_${pt.MTOW}`);
                  }:undefined}
                  style={{background:i%2===0?"#f59e0b08":"transparent",cursor:onApply?"pointer":"default"}}
                  onMouseEnter={e=>{if(onApply)e.currentTarget.style.background="#f59e0b22";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=i%2===0?"#f59e0b08":"transparent";}}>
                    {[pt.range,pt.payload,pt.MTOW,pt.Wbat,pt.Etot,pt.LDact,pt.SM+"%",pt.bWing,pt.batFrac+"%",pt.SEDpack].map((v,j)=>(
                      <td key={j} style={{padding:"5px 8px",textAlign:"right",color:j===0?"#f59e0b":SC.text,fontWeight:j===0?800:400,borderBottom:`1px solid ${SC.border}22`}}>{v}</td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
      </>)}
    </div>
  );
}

/* ── Sensitivity Analysis Panel ── */
