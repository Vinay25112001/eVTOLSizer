import { seriesBar } from "../ui/chart.js";
import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  Area,
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
import { SensPanel } from "../panels/SensPanel.jsx";
import { mtowErrorSummary } from "../lib/warnings.js";
import { PHC, SC } from "../lib/theme.js";

/* Tab 0 — Overview.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function OverviewTab(ctx) {
  const { SR, TTP, U, mcResults, params, tab } = ctx;
  return (
    <>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                  <KPI pk="MTOW" label="MTOW" value={U.mass(SR.MTOW)} unit={U.massU} color={SR.MTOW<4000?SC.green:SR.MTOW<5000?SC.amber:SC.red} sub={mtowErrorSummary(params)}
                    band={` NASA UAM concepts 2,220–3,720 kg`}/>
                  <KPI pk="Wbat" label="Battery Mass" value={U.mass(SR.Wbat)} unit={U.massU} color={SR.Wbat/SR.MTOW<0.4?SC.green:SC.amber} sub={`${(SR.Wbat/SR.MTOW*100).toFixed(1)}% of MTOW`}/>
                  <KPI pk="Etot" label="Total Energy" value={SR.Etot} unit="kWh" sub={`Pack: ${SR.PackkWh} kWh`}/>
                  <KPI pk="LDact" band="NASA L+C 9.3" label="Actual L/D" value={SR.LDact} unit="" color={SR.LDact>12?SC.green:SC.amber} sub={SR.CD0tot == null
                      /* CD0 and CDi are WING-REFERENCED coefficients and engine.js returns
                         null for them without a wing -- deliberately: "a coefficient with no
                         reference area is meaningless". This concatenated them raw and
                         rendered "CD0=null CDi=null" on the multicopter and side-by-side.
                         The dimensional drag area is the primitive and is what those layouts
                         actually have, so it is what they are shown. */
                      ? `drag area D/q=${SR.Dq_m2 != null ? SR.Dq_m2.toFixed(2) : "—"} m² (no wing, so no CD₀)`
                      : `CD₀=${SR.CD0tot} CDi=${SR.CDi}`}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                  <KPI pk="Swing" label="Wing Area" value={U.area(SR.Swing)} unit={U.areaU} sub={`Span ${U.len(SR.bWing)} ${U.lenU}`}/>
                  <KPI pk="Phov" label="Hover Power" value={U.power(SR.Phov)} unit={U.powerU} sub={`Cruise ${U.power(SR.Pcr)} ${U.powerU}`}/>
                  <KPI pk="SM" band="FBW −10 to 25%" label="Static Margin" value={(SR.SM*100).toFixed(1)} unit="% MAC" color={SR.SM>0.05&&SR.SM<0.25?SC.green:SC.red}/>
                  <KPI pk="Mach" label="Mach" value={SR.Mach} unit="" color={SR.Mach<0.35?SC.green:SC.amber} sub={`Re ${(SR.Re_/1e6).toFixed(2)}×10⁶`}/>
                </div>
                {/* ── Uncertainty bands from Monte Carlo (shown when MC has been run) ── */}
                {mcResults&&(
                  <div style={{background:SC.panel,border:`1px solid #7c3aed44`,borderRadius:8,padding:"12px 16px"}}>
                    <div style={{fontSize:9,color:SC.purple,fontFamily:"'DM Mono',monospace",letterSpacing:"0.14em",marginBottom:8}}>MC UNCERTAINTY BANDS — {mcResults.N.toLocaleString()} SAMPLES</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                      {[
                        ["MTOW",SR.MTOW,mcResults.MTOW.stats,"kg",SC.amber],
                        ["Total Energy",SR.Etot,mcResults.Etot.stats,"kWh",SC.teal],
                        ["Hover Power",SR.Phov,mcResults.Phov.stats,"kW",SC.blue],
                        ["Static Margin",(SR.SM_vt*100).toFixed(1),mcResults.SM?.stats||null,"%",SC.purple],
                      ].map(([label,nominal,stats,unit,col])=>(
                        <div key={label} style={{background:SC.bg,border:`1px solid ${col}33`,borderRadius:6,padding:"8px 10px"}}>
                          <div style={{fontSize:9,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700,marginBottom:4}}>{label}</div>
                          <div style={{fontSize:13,fontWeight:800,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{nominal} <span style={{fontSize:9,color:SC.muted}}>{unit}</span></div>
                          <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginTop:3}}>
                            μ={typeof stats.mean==="number"?stats.mean.toFixed(1):stats.mean} ± {typeof stats.std==="number"?stats.std.toFixed(1):stats.std} {unit}
                          </div>
                          <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                            P5={typeof stats.p5==="number"?stats.p5.toFixed(1):stats.p5} — P95={typeof stats.p95==="number"?stats.p95.toFixed(1):stats.p95} {unit}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginTop:6}}>
                      ⓘ Run Monte Carlo (Tab 9) to update these bands. Current nominal is the deterministic point estimate.
                    </div>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title={`Power per Phase (${U.powerU})`} ht={255} onSave={true}>
                    <ResponsiveContainer width="100%" height={205}>
                      <BarChart data={[{ph:"T/O",v:SR.Phov},{ph:"Climb",v:SR.Pcl},{ph:"Cruise",v:SR.Pcr},{ph:"Descent",v:SR.Pdc},{ph:"Land",v:SR.Phov},{ph:"Reserve",v:SR.Pres}]}
                        margin={{top:5,right:8,left:-15,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="ph" tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} tickFormatter={v=>U.power(v)} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v,n)=>[`${U.power(v)} ${U.powerU}`,n]}/>
                        <Bar isAnimationActive={false} dataKey="v" radius={[3,3,0,0]} name={`Power (${U.powerU})`}>{(()=>{const f=seriesBar([SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Phov,SR.Pres]);return [0,1,2,3,4,5].map(i=><Cell key={i} {...f(i)}/>);})()}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel title="Energy per Phase (kWh)" ht={255} onSave={true}>
                    <ResponsiveContainer width="100%" height={205}>
                      <BarChart data={[{ph:"T/O",v:SR.Eto},{ph:"Climb",v:SR.Ecl},{ph:"Cruise",v:SR.Ecr},{ph:"Descent",v:SR.Edc},{ph:"Land",v:SR.Eld},{ph:"Reserve",v:SR.Eres}]}
                        margin={{top:5,right:8,left:-15,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="ph" tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} {...chartTooltip()}/>
                        <Bar isAnimationActive={false} dataKey="v" radius={[3,3,0,0]} name="kWh">{(()=>{const f=seriesBar([SR.Eto,SR.Ecl,SR.Ecr,SR.Edc,SR.Eld,SR.Eres]);return [0,1,2,3,4,5].map(i=><Cell key={i} {...f(i)}/>);})()}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
                <Panel title="Mission Timeline — Final Converged Values">
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                      <thead><tr style={{background:SC.panel}}>
                        {["Phase","Time (s)",`Power (${U.powerU})`,"Energy (kWh)",`Velocity (${U.speedU})`].map(hdr=>(
                          <th key={hdr} style={{padding:"5px 12px",textAlign:"left",color:SC.muted,fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:600,letterSpacing:"0.05em"}}>{hdr}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {[["Takeoff Hover",SR.tto,SR.Phov,SR.Eto,0.5],
                          ["Climb",SR.tcl,SR.Pcl,SR.Ecl,+(params.rateOfClimb/Math.sin(params.climbAngle*Math.PI/180)).toFixed(1)],
                          ["Cruise",SR.tcr,SR.Pcr,SR.Ecr,params.vCruise],
                          ["Descent",SR.tdc,SR.Pdc,SR.Edc,+Math.min(params.rateOfClimb/Math.sin((params.descentAngle||6)*Math.PI/180),params.vCruise).toFixed(1)],
                          ["Landing Hover",SR.tld,SR.Phov,SR.Eld,0.5],
                          ["Reserve",SR.tres,SR.Pres,SR.Eres,+(0.7*params.vCruise).toFixed(1)],
                        ].map(([ph,t,pw,e,v],i)=>(
                          <tr key={i} style={{borderTop:`1px solid ${SC.border}`,background:i%2?SC.inset:SC.bg}}>
                            <td style={{padding:"6px 12px",color:SC.text,fontWeight:600}}>{ph}</td>
                            <td style={{padding:"6px 12px",color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{t}</td>
                            <td style={{padding:"6px 12px",color:PHC[i],fontFamily:"'DM Mono',monospace"}}>{U.power(pw)} {U.powerU}</td>
                            <td style={{padding:"6px 12px",color:SC.teal,fontFamily:"'DM Mono',monospace"}}>{e}</td>
                            <td style={{padding:"6px 12px",color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{U.speed(v)} {U.speedU}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>

      {/* Sensitivity report — Overview tab only */}
      <SensPanel params={params} SR={SR} SC={SC} U={U}/>
    </>
  );
}
