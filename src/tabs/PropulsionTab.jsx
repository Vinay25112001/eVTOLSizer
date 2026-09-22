import { seriesBar } from "../ui/chart.js";
import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { PHC, SC } from "../lib/theme.js";

/* Tab 3 — Propulsion.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function PropulsionTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Rotor Diam" value={U.len(SR.Drotor)} unit={U.lenU} color={SC.amber}/>
                  <KPI label="Disk Loading" value={U.wl(SR.DLrotor)} unit={U.wlU}/>
                  <KPI label="Tip Speed" value={U.speed(SR.TipSpd)} unit={U.speedU} color={SR.TipMach<0.7?SC.green:SC.red} sub={`Tip Mach ${SR.TipMach}`}/>
                  <KPI label="RPM" value={SR.RPM} unit="rpm"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Actuator Disk + Motor Sizing" ht={380}>
                    <div style={{overflowY:"auto",maxHeight:320}}>
                    {[[`No. rotors (hover)`,params.nPropHover],[`Design diameter`,`${U.len(params.propDiam)} ${U.lenU}`],
                      [`AD-derived diameter`,`${U.len(SR.Drotor)} ${U.lenU}`],[`Disk loading`,`${U.wl(SR.DLrotor)} ${U.wlU}`],
                      [`Power loading`,`${SR.PLrotor} N/kW`],[`Tip speed`,`${U.speed(SR.TipSpd)} ${U.speedU}`],
                      [`Tip Mach`,SR.TipMach],[`Operating RPM`,`${SR.RPM} rpm`],
                      [`No. blades`,SR.Nbld],[`Solidity σ`,`0.10`],
                      [`Blade chord`,`${U.len(SR.ChordBl)} ${U.lenU}`],[`Blade AR`,SR.BladeAR],
                      [`Continuous power/rotor`,`${U.power(SR.PmotKW)} ${U.powerU}`],[`Peak power/rotor`,`${U.power(SR.PpeakKW)} ${U.powerU}`],
                      [`Shaft torque`,`${SR.Torque} N·m`],[`Motor mass/rotor`,`${U.mass(SR.MotMass)} ${U.massU}`],
                      [`Total motor mass`,`${U.mass(SR.MotMass*params.nPropHover)} ${U.massU}`],
                    ].map(([k,v],i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid #0f131a`}}>
                        <span style={{fontSize:10,color:SC.muted}}>{k}</span>
                        <span style={{fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>
                      </div>
                    ))}
                    </div>
                  </Panel>
                  <Panel title={`Phase Power Comparison (${U.powerU})`} ht={320} onSave={true}>
                    <ResponsiveContainer width="100%" height={270}>
                      <BarChart data={[{ph:"T/O",v:SR.Phov},{ph:"Climb",v:SR.Pcl},{ph:"Cruise",v:SR.Pcr},{ph:"Descent",v:SR.Pdc},{ph:"Land",v:SR.Phov},{ph:"Reserve",v:SR.Pres}]}
                        margin={{top:5,right:8,left:-10,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="ph" tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} tickFormatter={v=>U.power(v)} label={{value:U.powerU,angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v,n)=>[`${U.power(v)} ${U.powerU}`,n]}/>
                        <Bar isAnimationActive={false} dataKey="v" radius={[3,3,0,0]} name={`Power (${U.powerU})`}>{(()=>{const f=seriesBar([SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Phov,SR.Pres]);return [0,1,2,3,4,5].map(i=><Cell key={i} {...f(i)}/>);})()}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
              </div>
            
  );
}
