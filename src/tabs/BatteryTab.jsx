import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { PHC, SC } from "../lib/theme.js";

/* Tab 4 — Battery.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function BatteryTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Pack Energy" value={SR.PackkWh} unit="kWh" color={SC.green} sub={`Mission: ${SR.Etot} kWh`}/>
                  <KPI label="Battery Mass" value={U.mass(SR.Wbat)} unit={U.massU} color={SR.Wbat/SR.MTOW<0.4?SC.green:SC.amber} sub={`SED ${U.sed(SR.SEDpack)} ${U.sedU}`}/>
                  <KPI label="Cell Config" value={`${SR.Nseries}s×${SR.Npar}p`} unit="" sub={`${SR.Ncells} cells total`}/>
                  <KPI label="Final SoC" value={((1-SR.Etot/SR.PackkWh)*100).toFixed(1)} unit="%" color={(1-SR.Etot/SR.PackkWh)>=(params.socMin/(1+params.socMin))-0.01?SC.green:SC.red}/>
                </div>
                <Panel title="Battery State of Charge — Full Mission" ht={285} onSave={true}>
                  <ResponsiveContainer width="100%" height={235}>
                    <AreaChart data={SR.socSteps} margin={{top:5,right:10,left:-10,bottom:0}}>
                      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SC.green} stopOpacity={0.5}/><stop offset="95%" stopColor={SC.red} stopOpacity={0.05}/>
                      </linearGradient></defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]} tick={{fontSize:11,fill:SC.muted}} label={{value:"Time (s)",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis domain={[0,105]} tick={{fontSize:11,fill:SC.muted}} label={{value:"SoC (%)",angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v)=>[`${v}%`,"SoC"]}/>
                      <ReferenceLine y={params.socMin/(1+params.socMin)*100} stroke={SC.red} strokeDasharray="5 3"
                        label={{value:`SoCmin ${(params.socMin/(1+params.socMin)*100).toFixed(1)}%`,fill:SC.red,fontSize:11,position:"right"}}/>
                      <Area isAnimationActive={false} type="stepAfter" dataKey="SoC" stroke={SC.green} strokeWidth={2.5} fill="url(#sg)" dot={false}/>
                      {SR.tPhases.slice(1,-1).map((tp,i)=><ReferenceLine key={i} x={Math.round(tp)} stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1}/>)}
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Pack Architecture (21700 NMC)" ht={260}>
                    {[["Cell voltage","3.6 V"],["Cell capacity","5.0 Ah"],["Bus voltage",`${SR.PackV} V`],
                      ["Series cells",SR.Nseries],["Parallel strings",SR.Npar],["Total cells",SR.Ncells],
                      ["Pack energy",`${SR.PackkWh} kWh`],["Battery mass",`${SR.Wbat} kg`],
                      ["SED (pack)",`${SR.SEDpack} Wh/kg`],["C-rate hover",`${SR.CrateHov}C`],
                      ["C-rate cruise",`${SR.CrateCr}C`],["Joule heating",`${SR.Pheat} W`],
                    ].map(([k,v],i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid #0f131a`}}>
                        <span style={{fontSize:9,color:SC.muted}}>{k}</span>
                        <span style={{fontSize:9,color:SC.teal,fontFamily:"'DM Mono',monospace"}}>{v}</span>
                      </div>
                    ))}
                  </Panel>
                  <Panel title="SoC per Phase" ht={260}>
                    {(()=>{
                      const E=[0,SR.Eto,SR.Eto+SR.Ecl,SR.Eto+SR.Ecl+SR.Ecr,SR.Eto+SR.Ecl+SR.Ecr+SR.Edc,SR.Eto+SR.Ecl+SR.Ecr+SR.Edc+SR.Eld,SR.Etot];
                      return["Start","After T/O","After Climb","After Cruise","After Descent","After Landing","After Reserve"].map((lbl,i)=>{
                        const soc=Math.max(0,(1-E[i]/SR.PackkWh)*100),col=soc>60?SC.green:soc>30?SC.amber:SC.red;
                        return(<div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:`1px solid ${SC.border}`}}>
                          <span style={{fontSize:8,color:SC.muted,minWidth:95,fontFamily:"'DM Mono',monospace"}}>{lbl}</span>
                          <div style={{flex:1,height:5,background:SC.border,borderRadius:2}}>
                            <div style={{height:"100%",width:`${soc}%`,background:col,borderRadius:2,transition:"width 0.3s"}}/>
                          </div>
                          <span style={{fontSize:9,color:col,minWidth:42,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{soc.toFixed(1)}%</span>
                        </div>);
                      });
                    })()}
                  </Panel>
                </div>
              </div>
            
  );
}
