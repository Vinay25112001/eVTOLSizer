import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { SC } from "../lib/theme.js";
import { runSizing } from "../engine.js";

export function SensitivityAnalysis({params,SR,SC,TTP,U}){
  const [sensData,setSensData]=useState(null);
  const [sensRunning,setSensRunning]=useState(false);
  const [sensParam,setSensParam]=useState("ewf");
  const uc=U||{mass:v=>+v.toFixed(1),massU:"kg"};
  const SENS_PARAMS=[
    {k:"ewf",    l:"Empty Wt Fraction", base:params.ewf},
    {k:"LD",     l:"Lift-to-Drag L/D",  base:params.LD},
    {k:"sedCell",l:"Cell SED (Wh/kg)",   base:params.sedCell},
    {k:"payload",l:`Payload (${uc.massU})`, base:params.payload},
    {k:"etaHov", l:"Hover FOM",           base:params.etaHov},
    {k:"propDiam",l:`Rotor Dia (${uc.massU==="lb"?"ft":"m"})`, base:params.propDiam},
  ];
  const runSens=()=>{
    setSensRunning(true);
    setTimeout(()=>{
      const deltas=[-0.20,-0.15,-0.10,-0.05,0,0.05,0.10,0.15,0.20];
      const results={};
      SENS_PARAMS.forEach(({k,base})=>{
        results[k]=deltas.map(d=>{
          try{
            const R=runSizing({...params,[k]:base*(1+d)});
            return{delta:+(d*100).toFixed(0),MTOW:R.MTOW,Wbat:R.Wbat,Etot:R.Etot};
          }catch{return null;}
        }).filter(Boolean);
      });
      setSensData(results); setSensRunning(false);
    },20);
  };
  const cur=SENS_PARAMS.find(p=>p.k===sensParam);
  const data=sensData?sensData[sensParam]:null;
  const baseRow=data?data.find(r=>r.delta===0):null;
  return(
    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:SC.text,fontFamily:"system-ui,sans-serif"}}>Sensitivity Analysis — ±20% Parameter Sweep</div>
          <div style={{fontSize:9,color:SC.muted,fontFamily:"system-ui,sans-serif",marginTop:2}}>How MTOW, battery mass and total energy respond to each parameter variation (MATLAB-style)</div>
        </div>
        <button type="button" onClick={runSens} disabled={sensRunning}
          style={{padding:"7px 18px",background:sensRunning?"transparent":`linear-gradient(135deg,${SC.amber},#f97316)`,
            border:`1px solid ${sensRunning?SC.border:SC.amber}`,borderRadius:6,
            color:sensRunning?SC.muted:"#07090f",fontSize:11,fontWeight:800,
            cursor:sensRunning?"not-allowed":"pointer",fontFamily:"system-ui,sans-serif"}}>
          {sensRunning?"⏳ Computing…":"▶ Run Sensitivity"}
        </button>
      </div>
      {sensData&&(
        <>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {SENS_PARAMS.map(({k,l})=>(
              <button key={k} type="button" onClick={()=>setSensParam(k)}
                style={{padding:"4px 12px",borderRadius:4,fontSize:9,fontWeight:600,cursor:"pointer",
                  fontFamily:"'DM Mono',monospace",border:`1px solid ${sensParam===k?SC.amber:SC.border}`,
                  background:sensParam===k?`${SC.amber}22`:"transparent",color:sensParam===k?SC.amber:SC.muted}}>
                {l}
              </button>
            ))}
          </div>
          {data&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:16,alignItems:"start"}}>
              <div>
                <div style={{fontSize:10,color:SC.muted,marginBottom:6,fontFamily:"system-ui,sans-serif"}}>
                  {cur.l} — base: <b style={{color:SC.amber}}>{cur.base}</b>
                  {baseRow&&<> · base MTOW: <b style={{color:SC.amber}}>{uc.mass(baseRow.MTOW)} {uc.massU}</b></>}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data} margin={{top:8,right:20,left:10,bottom:20}}>
                    <CartesianGrid {...chartGrid()}/>
                    <XAxis dataKey="delta" tick={{fontSize:10,fill:SC.muted}} label={{value:"Parameter change (%)",position:"insideBottom",offset:-8,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                    <YAxis yAxisId="left" tick={{fontSize:10,fill:SC.muted}} tickFormatter={v=>uc.mass(v)} label={{value:`Mass (${uc.massU})`,angle:-90,position:"insideLeft",offset:10,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:SC.muted}} label={{value:"Energy (kWh)",angle:90,position:"insideRight",offset:10,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                    <Tooltip {...TTP} formatter={(v,n)=>[typeof v==="number"?`${uc.mass(v)} ${uc.massU}`:v,n]} labelFormatter={v=>`Δ${v}%`}/>
                    <ReferenceLine x={0} yAxisId="left" stroke={SC.muted} strokeDasharray="3 3"/>
                    <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="MTOW" stroke={SC.amber} strokeWidth={2.5} dot={{r:3}} name={`MTOW (${uc.massU})`}/>
                    <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="Wbat" stroke={SC.blue} strokeWidth={2} dot={{r:3}} name={`W_bat (${uc.massU})`}/>
                    <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="Etot" stroke={SC.teal} strokeWidth={2} dot={{r:3}} name="Energy (kWh)" strokeDasharray="5 3"/>
                    <Legend iconSize={10} wrapperStyle={{fontSize:11,color:SC.muted,paddingTop:4}} {...chartLegend()}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{minWidth:200}}>
                <table style={{borderCollapse:"collapse",fontSize:9,fontFamily:"'DM Mono',monospace",width:"100%"}}>
                  <thead><tr style={{borderBottom:`1px solid ${SC.border}`}}>
                    {["Δ%",`MTOW`,`Wbat`,"E"].map(h=><th key={h} style={{padding:"4px 8px",color:SC.muted,fontWeight:600,textAlign:"right"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{data.map(r=>{
                    const isBase=r.delta===0;
                    const mtowDelta=baseRow?r.MTOW-baseRow.MTOW:0;
                    return(<tr key={r.delta} style={{background:isBase?`${SC.amber}11`:"transparent",borderBottom:`1px solid ${SC.border}22`}}>
                      <td style={{padding:"3px 8px",color:r.delta<0?SC.teal:r.delta>0?SC.red:SC.amber,textAlign:"right",fontWeight:isBase?700:400}}>{r.delta>0?"+":""}{r.delta}%</td>
                      <td style={{padding:"3px 8px",color:SC.text,textAlign:"right",fontWeight:isBase?700:400}}>
                        {uc.mass(r.MTOW)}{!isBase&&<span style={{fontSize:8,color:mtowDelta>0?SC.red:SC.teal}}> {mtowDelta>0?"+":""}{uc.mass(mtowDelta)}</span>}
                      </td>
                      <td style={{padding:"3px 8px",color:SC.blue,textAlign:"right"}}>{uc.mass(r.Wbat)}</td>
                      <td style={{padding:"3px 8px",color:SC.teal,textAlign:"right"}}>{r.Etot}</td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {!sensData&&!sensRunning&&(
        <div style={{textAlign:"center",padding:"28px 0",color:SC.subtle,fontSize:10,fontFamily:"system-ui,sans-serif"}}>
          Click <b style={{color:SC.amber}}>▶ Run Sensitivity</b> to sweep 6 parameters ±20% and see how MTOW, battery mass and energy respond.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ERROR BOUNDARY — catches render errors in any tab so one
   broken tab cannot white-screen the entire application.
   ═══════════════════════════════════════════════════════════ */
