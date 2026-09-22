import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import { useState } from "react";
import {
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { PHC, SC } from "../lib/theme.js";
import { Panel } from "../ui/primitives.jsx";

export function PhaseDurationPie({SR,SC,PHC,TTP}){
  const [activeIdx,setActiveIdx]=useState(null);
  const data=[{n:"T/O",v:SR.tto},{n:"Climb",v:SR.tcl},{n:"Cruise",v:SR.tcr},{n:"Descent",v:SR.tdc},{n:"Land",v:SR.tld},{n:"Reserve",v:SR.tres}];
  const total=data.reduce((s,d)=>s+d.v,0);
  const active=activeIdx!==null?data[activeIdx]:null;
  return(
    <div style={{position:"relative"}}>
      <ResponsiveContainer width="100%" height={195}>
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="v" nameKey="n" cx="50%" cy="50%"
            innerRadius={45} outerRadius={80} paddingAngle={3}
            onMouseEnter={(_,i)=>setActiveIdx(i)} onMouseLeave={()=>setActiveIdx(null)}>
            {PHC.map((clr,i)=><Cell key={i} fill={clr} opacity={activeIdx===null||activeIdx===i?1:0.35} stroke={activeIdx===i?clr:"none"} strokeWidth={activeIdx===i?2:0}/>)}
          </Pie>
          <Tooltip {...TTP} formatter={(v)=>[`${v} s (${(v/total*100).toFixed(1)}%)`,"Duration"]}/>
          <Legend iconSize={8} wrapperStyle={{fontSize:11,color:SC.muted}} {...chartLegend()}/>
        </PieChart>
      </ResponsiveContainer>
      <div style={{position:"absolute",top:"38%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
        {active?(
          <><div style={{fontSize:13,fontWeight:800,color:PHC[activeIdx],fontFamily:"'DM Mono',monospace"}}>{active.v}s</div>
          <div style={{fontSize:8,color:SC.muted}}>{active.n}</div>
          <div style={{fontSize:8,color:PHC[activeIdx]}}>{(active.v/total*100).toFixed(1)}%</div></>
        ):(
          <><div style={{fontSize:11,fontWeight:700,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{total}s</div>
          <div style={{fontSize:8,color:SC.muted}}>total</div></>
        )}
      </div>
    </div>
  );
}

/* ── Interactive Donut: CD0 Drag Buildup ── */
export function DragPie({SR,SC,TTP}){
  const [activeIdx,setActiveIdx]=useState(null);
  const dragColors=["#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4"];
  const total=SR.dragComp.reduce((s,d)=>s+d.val,0);
  const active=activeIdx!==null?SR.dragComp[activeIdx]:null;
  return(
    <div style={{position:"relative"}}>
      <ResponsiveContainer width="100%" height={215}>
        <PieChart>
          <Pie isAnimationActive={false} data={SR.dragComp} dataKey="val" nameKey="name" cx="50%" cy="50%"
            innerRadius={48} outerRadius={85} paddingAngle={3}
            onMouseEnter={(_,i)=>setActiveIdx(i)} onMouseLeave={()=>setActiveIdx(null)}>
            {dragColors.map((clr,i)=><Cell key={i} fill={clr} opacity={activeIdx===null||activeIdx===i?1:0.3} stroke={activeIdx===i?clr:"none"} strokeWidth={activeIdx===i?2:0}/>)}
          </Pie>
          <Tooltip {...TTP} formatter={(v)=>[v.toFixed(5),"CD₀"]}/>
          <Legend iconSize={8} wrapperStyle={{fontSize:12,color:SC.muted}} {...chartLegend()}/>
        </PieChart>
      </ResponsiveContainer>
      <div style={{position:"absolute",top:"40%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
        {active?(
          <><div style={{fontSize:11,fontWeight:800,color:dragColors[activeIdx],fontFamily:"'DM Mono',monospace"}}>{active.val.toFixed(5)}</div>
          <div style={{fontSize:8,color:SC.muted,maxWidth:60}}>{active.name}</div>
          <div style={{fontSize:8,color:dragColors[activeIdx]}}>{(active.val/total*100).toFixed(1)}%</div></>
        ):(
          <><div style={{fontSize:10,fontWeight:700,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{total.toFixed(4)}</div>
          <div style={{fontSize:7,color:SC.muted}}>CD₀ total</div></>
        )}
      </div>
    </div>
  );
}

/* ── Interactive Donut: MTOW Composition ── */
export function MTOWPie({SR,params,SC,TTP,U}){
  const [activeIdx,setActiveIdx]=useState(null);
  const wtData=[{name:"Empty",val:SR.Wempty},{name:"Battery",val:SR.Wbat},{name:"Payload",val:params.payload}];
  const wtColors=[SC.blue,SC.amber,SC.green];
  const active=activeIdx!==null?wtData[activeIdx]:null;
  const uc=U||{mass:v=>+v.toFixed(1),massU:"kg"};
  return(
    <div style={{position:"relative"}}>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie isAnimationActive={false} data={wtData} dataKey="val" nameKey="name" cx="50%" cy="50%"
            innerRadius={48} outerRadius={82} paddingAngle={4}
            onMouseEnter={(_,i)=>setActiveIdx(i)} onMouseLeave={()=>setActiveIdx(null)}>
            {wtColors.map((clr,i)=><Cell key={i} fill={clr} opacity={activeIdx===null||activeIdx===i?1:0.3} stroke={activeIdx===i?clr:"none"} strokeWidth={activeIdx===i?2:0}/>)}
          </Pie>
          <Tooltip {...TTP} formatter={(v,n)=>[`${uc.mass(v)} ${uc.massU} (${(v/SR.MTOW*100).toFixed(1)}%)`,n]}/>
          <Legend iconSize={8} wrapperStyle={{fontSize:12,color:SC.muted}} {...chartLegend()}/>
        </PieChart>
      </ResponsiveContainer>
      <div style={{position:"absolute",top:"38%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
        {active?(
          <><div style={{fontSize:13,fontWeight:800,color:wtColors[activeIdx],fontFamily:"'DM Mono',monospace"}}>{uc.mass(active.val)}</div>
          <div style={{fontSize:7,color:SC.muted}}>{uc.massU}</div>
          <div style={{fontSize:9,color:wtColors[activeIdx]}}>{(active.val/SR.MTOW*100).toFixed(1)}%</div></>
        ):(
          <><div style={{fontSize:13,fontWeight:700,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{uc.mass(SR.MTOW)}</div>
          <div style={{fontSize:7,color:SC.muted}}>{uc.massU} MTOW</div></>
        )}
      </div>
    </div>
  );
}

/* ── Sensitivity Analysis Panel (Performance tab) ── */
