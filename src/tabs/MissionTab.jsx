import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  ComposedChart,
  PolarGrid,
  PolarAngleAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { PHC, SC } from "../lib/theme.js";
import { PhaseDurationPie } from "../panels/charts.jsx";

/* Tab 1 — Mission.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function MissionTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* KPI row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
                  {[
                    ["Total Time",`${SR.Tend}s`,SC.muted],
                    ["Total Energy",`${SR.Etot} kWh`,SC.teal],
                    ["Peak Power",`${U.power(SR.Phov)} ${U.powerU}`,SC.amber],
                    ["Cruise Power",`${U.power(SR.Pcr)} ${U.powerU}`,SC.blue],
                    ["Cruise Speed",`${U.speed(params.vCruise)} ${U.speedU}`,SC.green],
                    ["Range",SR?`${U.dist(SR.missionRange||params.range)}+${U.dist(SR.reserveDistKm||0)}=${U.dist(SR.totalRange||params.range)} ${U.distU}`:`${U.dist(params.range)} ${U.distU}`,SC.purple],
                  ].map(([lbl,val,col])=>(
                    <div key={lbl} style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:6,padding:"8px 10px",borderLeft:`2px solid ${col}`}}>
                      <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>{lbl}</div>
                      <div style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Power vs Time */}
                <Panel title={`Power vs Mission Time (${U.powerU})`} ht={270} onSave={true}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={SR.powerSteps} margin={{top:5,right:16,left:-5,bottom:16}}>
                      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SC.amber} stopOpacity={0.4}/><stop offset="95%" stopColor={SC.amber} stopOpacity={0.02}/>
                      </linearGradient></defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:SC.muted}} label={{value:"Time (s)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:10,fill:SC.muted}} tickFormatter={v=>U.power(v)} label={{value:`Power (${U.powerU})`,angle:-90,position:"insideLeft",offset:10,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${U.power(v)} ${U.powerU}`,n]}/>
                      <Area isAnimationActive={false} type="stepAfter" dataKey="P" stroke={SC.amber} strokeWidth={2.5} fill="url(#pg)" dot={false} name="Power (kW)"/>
                      {SR.tPhases.slice(1,-1).map((tp,i)=>(
                        <ReferenceLine key={i} x={Math.round(tp)} stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1.5}
                          label={{value:["Climb","Cruise","Desc","Land","Res"][i],fill:PHC[i],fontSize:9,position:"top"}}/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>

                {/* Energy vs Time — NEW */}
                <Panel title="Cumulative Energy Consumed vs Mission Time (kWh)" ht={270} onSave={true}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={SR.energySteps} margin={{top:5,right:16,left:-5,bottom:16}}>
                      <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SC.teal} stopOpacity={0.45}/><stop offset="95%" stopColor={SC.teal} stopOpacity={0.02}/>
                      </linearGradient></defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:SC.muted}} label={{value:"Time (s)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:10,fill:SC.muted}} label={{value:"Energy (kWh)",angle:-90,position:"insideLeft",offset:10,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${v} kWh`,n]}/>
                      <Area isAnimationActive={false} type="monotone" dataKey="E" stroke={SC.teal} strokeWidth={2.5} fill="url(#eg)" dot={false} name="Cumulative Energy (kWh)"/>
                      <ReferenceLine y={SR.Etot} stroke={SC.green} strokeDasharray="5 3"
                        label={{value:`Total: ${SR.Etot} kWh`,fill:SC.green,fontSize:10,position:"insideTopRight"}}/>
                      <ReferenceLine y={SR.PackkWh} stroke={SC.amber} strokeDasharray="5 3"
                        label={{value:`Pack: ${SR.PackkWh} kWh`,fill:SC.amber,fontSize:10,position:"insideBottomRight"}}/>
                      {SR.tPhases.slice(1,-1).map((tp,i)=>(
                        <ReferenceLine key={i} x={Math.round(tp)} stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1.5}
                          label={{value:["Climb","Cruise","Desc","Land","Res"][i],fill:PHC[i],fontSize:9,position:"top"}}/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>

                {/* Energy Remaining Over Mission */}
                <Panel title="Battery Energy Remaining vs Mission Time" ht={270} onSave={true}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                      data={SR.energySteps.map(s=>({t:s.t, Erem:+Math.max(0,SR.PackkWh-s.E).toFixed(3)}))}
                      margin={{top:10,right:24,left:10,bottom:20}}>
                      <defs><linearGradient id="edg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SC.teal} stopOpacity={0.55}/>
                        <stop offset="95%" stopColor={SC.teal} stopOpacity={0.04}/>
                      </linearGradient></defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]}
                        tick={{fontSize:9,fill:SC.muted}}
                        label={{value:"Mission Time (s)",position:"insideBottom",offset:-8,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis
                        domain={[0, +(SR.PackkWh*1.08).toFixed(1)]}
                        tickCount={6}
                        tickFormatter={v=>v.toFixed(0)}
                        tick={{fontSize:9,fill:SC.muted}}
                        label={{value:"Energy Remaining (kWh)",angle:-90,position:"insideLeft",offset:0,fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v)=>[`${(+v).toFixed(2)} kWh`,"Energy Remaining"]}/>
                      <Area isAnimationActive={false} type="monotone" dataKey="Erem" stroke={SC.teal} strokeWidth={2.5}
                        fill="url(#edg)" dot={false} name="Energy Remaining"/>
                      <ReferenceLine y={SR.PackkWh} stroke={SC.green} strokeDasharray="5 3"
                        label={{value:`Pack full: ${SR.PackkWh} kWh`,fill:SC.green,fontSize:9,position:"insideTopLeft"}}/>
                      <ReferenceLine y={+Math.max(0,SR.PackkWh-SR.Etot).toFixed(2)} stroke={SC.red} strokeDasharray="5 3"
                        label={{value:`Reserve: ${Math.max(0,SR.PackkWh-SR.Etot).toFixed(1)} kWh`,fill:SC.red,fontSize:9,position:"insideBottomRight"}}/>
                      {SR.tPhases.slice(1,-1).map((tp,i)=>(
                        <ReferenceLine key={i} x={Math.round(tp)} stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1.5}
                          label={{value:["Climb","Cruise","Desc","Land","Res"][i],fill:PHC[i],fontSize:9,position:"top"}}/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>

                                {/* Velocity vs Time */}
                <Panel title={`Velocity vs Mission Time (${U.speedU})`} ht={230} onSave={true}>
                  <ResponsiveContainer width="100%" height={185}>
                    <AreaChart data={SR.velSteps} margin={{top:5,right:16,left:-5,bottom:16}}>
                      <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SC.blue} stopOpacity={0.4}/><stop offset="95%" stopColor={SC.blue} stopOpacity={0.02}/>
                      </linearGradient></defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:SC.muted}} label={{value:"Time (s)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:10,fill:SC.muted}} tickFormatter={v=>U.speed(v)} label={{value:`Speed (${U.speedU})`,angle:-90,position:"insideLeft",offset:10,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${U.speed(v)} ${U.speedU}`,n]}/>
                      <Area isAnimationActive={false} type="stepAfter" dataKey="V" stroke={SC.blue} strokeWidth={2.5} fill="url(#vg)" dot={false} name={`Speed (${U.speedU})`}/>
                      <ReferenceLine y={params.vCruise} stroke={SC.amber} strokeDasharray="4 3"
                        label={{value:`Vcr = ${U.speed(params.vCruise)} ${U.speedU}`,fill:SC.amber,fontSize:10,position:"insideTopRight"}}/>
                      {SR.tPhases.slice(1,-1).map((tp,i)=>(
                        <ReferenceLine key={i} x={Math.round(tp)} stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1}/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>

                {/* ── Combined Power + Energy vs Time (dual Y-axis) ── */}
                <Panel title="Power & Energy vs Mission Time — Combined (Dual Axis)" onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:8,paddingLeft:4}}>
                    <span style={{color:SC.amber,fontWeight:700}}>■ Power ({U.powerU})</span> on left axis &nbsp;·&nbsp;
                    <span style={{color:SC.green,fontWeight:700}}>■ Phase Energy (kWh)</span> on right axis — both plotted step-wise per phase, matching the MATLAB reference.
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart
                      data={(()=>{
                        // Build step data: for each phase show power and energy as step-wise blocks
                        // matching the MATLAB "Energy vs Time" shape exactly
                        const phases=[
                          {label:"T/O",   tStart:SR.tPhases[0], tEnd:SR.tPhases[1], power:SR.Phov, energy:SR.Eto},
                          {label:"Climb", tStart:SR.tPhases[1], tEnd:SR.tPhases[2], power:SR.Pcl,  energy:SR.Ecl},
                          {label:"Cruise",tStart:SR.tPhases[2], tEnd:SR.tPhases[3], power:SR.Pcr,  energy:SR.Ecr},
                          {label:"Desc",  tStart:SR.tPhases[3], tEnd:SR.tPhases[4], power:SR.Pdc,  energy:SR.Edc},
                          {label:"Land",  tStart:SR.tPhases[4], tEnd:SR.tPhases[5], power:SR.Phov, energy:SR.Eld},
                          {label:"Res",   tStart:SR.tPhases[5], tEnd:SR.tPhases[6], power:SR.Pres, energy:SR.Eres},
                        ];
                        // Build array with step transitions: each phase generates 2 points (start, end)
                        const pts=[];
                        phases.forEach(ph=>{
                          pts.push({t:+ph.tStart.toFixed(0), P:+ph.power.toFixed(2), E:+ph.energy.toFixed(3), label:ph.label});
                          pts.push({t:+ph.tEnd.toFixed(0),   P:+ph.power.toFixed(2), E:+ph.energy.toFixed(3), label:ph.label});
                        });
                        return pts;
                      })()}
                      margin={{top:10,right:60,left:10,bottom:20}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="t" type="number" domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:SC.muted}}
                        label={{value:"Time (s)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      {/* Left Y — Power */}
                      <YAxis yAxisId="left" tick={{fontSize:10,fill:SC.amber}} tickFormatter={v=>U.power(v)}
                        label={{value:`Power (${U.powerU})`,angle:-90,position:"insideLeft",offset:14,fontSize:11,fill:SC.amber}} {...chartAxis()}/>
                      {/* Right Y — Energy */}
                      <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:SC.green}}
                        label={{value:"Energy (kWh)",angle:90,position:"insideRight",offset:14,fontSize:11,fill:SC.green}} {...chartAxis()}/>
                      <Tooltip {...TTP}
                        formatter={(v,n)=>n===`Power (${U.powerU})`||n==="Power (kW)"?[`${U.power(v)} ${U.powerU}`,`Power (${U.powerU})`]:[`${v} kWh`,n]}
                        labelFormatter={tval=>`t = ${tval} s`}/>
                      <Legend iconSize={10} wrapperStyle={{fontSize:11,color:SC.muted,paddingTop:4}} {...chartLegend()}/>
                      {/* Phase reference lines */}
                      {SR.tPhases.slice(1,-1).map((tp,i)=>(
                        <ReferenceLine key={i} x={Math.round(tp)} yAxisId="left"
                          stroke={PHC[i]} strokeDasharray="4 3" strokeWidth={1.5}
                          label={{value:["Climb","Cruise","Desc","Land","Res"][i],fill:PHC[i],fontSize:9,position:"top"}}/>
                      ))}
                      {/* Power line — amber, step, left axis */}
                      <Line isAnimationActive={false} yAxisId="left" type="stepAfter" dataKey="P" stroke={SC.amber} strokeWidth={2.5}
                        dot={false} name={`Power (${U.powerU})`} connectNulls={false}/>
                      {/* Energy line — green, step, right axis */}
                      <Line isAnimationActive={false} yAxisId="right" type="stepAfter" dataKey="E" stroke={SC.green} strokeWidth={2.5}
                        dot={false} name="Energy (kWh)" connectNulls={false}
                        strokeDasharray="0"/>
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",gap:20,marginTop:8,padding:"8px 12px",background:SC.bg,borderRadius:6,border:`1px solid ${SC.border}`,flexWrap:"wrap"}}>
                    {[
                      ["T/O",   SR.Phov, SR.Eto,  PHC[0]],
                      ["Climb", SR.Pcl,  SR.Ecl,  PHC[1]],
                      ["Cruise",SR.Pcr,  SR.Ecr,  PHC[2]],
                      ["Desc",  SR.Pdc,  SR.Edc,  PHC[3]],
                      ["Land",  SR.Phov, SR.Eld,  PHC[4]],
                      ["Res",   SR.Pres, SR.Eres, PHC[5]],
                    ].map(([lbl,pw,e,col])=>(
                      <div key={lbl} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:col}}/>
                        <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{lbl}</span>
                        <span style={{fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{U.power(pw)} {U.powerU}</span>
                        <span style={{fontSize:10,color:SC.green,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{e} kWh</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                {/* Phase Power vs Phase Energy vs Phase Time — NEW grouped bar chart */}
                <Panel title={`Phase Comparison — Power (${U.powerU}) · Energy (kWh) · Duration (s)`} onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:8,paddingLeft:4}}>
                    Grouped bars show the three key metrics for each mission phase. Each metric is normalised relative to its maximum value so all three can be compared on the same axis.
                    Raw values shown in the data table below.
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={[
                        {ph:"T/O",    power:+(SR.Phov/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1), energy:+(SR.Eto/SR.Etot*100).toFixed(1),  time:+(SR.tto/SR.Tend*100).toFixed(1)},
                        {ph:"Climb",  power:+(SR.Pcl/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1),  energy:+(SR.Ecl/SR.Etot*100).toFixed(1),  time:+(SR.tcl/SR.Tend*100).toFixed(1)},
                        {ph:"Cruise", power:+(SR.Pcr/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1),  energy:+(SR.Ecr/SR.Etot*100).toFixed(1),  time:+(SR.tcr/SR.Tend*100).toFixed(1)},
                        {ph:"Descent",power:+(SR.Pdc/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1),  energy:+(SR.Edc/SR.Etot*100).toFixed(1),  time:+(SR.tdc/SR.Tend*100).toFixed(1)},
                        {ph:"Land",   power:+(SR.Phov/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1), energy:+(SR.Eld/SR.Etot*100).toFixed(1),  time:+(SR.tld/SR.Tend*100).toFixed(1)},
                        {ph:"Reserve",power:+(SR.Pres/Math.max(SR.Phov,SR.Pcl,SR.Pcr,SR.Pdc,SR.Pres)*100).toFixed(1), energy:+(SR.Eres/SR.Etot*100).toFixed(1), time:+(SR.tres/SR.Tend*100).toFixed(1)},
                      ]}
                      margin={{top:5,right:20,left:-10,bottom:0}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="ph" tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:10,fill:SC.muted}} label={{value:"% of max",angle:-90,position:"insideLeft",offset:14,fontSize:11,fill:SC.muted}} domain={[0,110]} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${v}%`,n]}/>
                      <Legend iconSize={9} wrapperStyle={{fontSize:11,color:SC.muted}} {...chartLegend()}/>
                      <Bar isAnimationActive={false} dataKey="power" name="Power (% of peak)" fill={SC.amber} radius={[3,3,0,0]} maxBarSize={28}/>
                      <Bar isAnimationActive={false} dataKey="energy" name="Energy (% of total)" fill={SC.teal} radius={[3,3,0,0]} maxBarSize={28}/>
                      <Bar isAnimationActive={false} dataKey="time" name="Duration (% of total)" fill={SC.blue} radius={[3,3,0,0]} maxBarSize={28}/>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Raw data table below the chart */}
                  <div style={{overflowX:"auto",marginTop:12}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"'DM Mono',monospace"}}>
                      <thead>
                        <tr style={{background:SC.panel}}>
                          {["Phase","Power (kW)","Energy (kWh)","Duration (s)","% Total E","% Total Time"].map(hdr=>(
                            <th key={hdr} style={{padding:"5px 10px",textAlign:"right",color:SC.muted,fontSize:8,fontWeight:600,letterSpacing:"0.05em",
                              textTransform:"uppercase",":first-child":{textAlign:"left"}}}>{hdr}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Takeoff",SR.Phov,SR.Eto,SR.tto,PHC[0]],
                          ["Climb",SR.Pcl,SR.Ecl,SR.tcl,PHC[1]],
                          ["Cruise",SR.Pcr,SR.Ecr,SR.tcr,PHC[2]],
                          ["Descent",SR.Pdc,SR.Edc,SR.tdc,PHC[3]],
                          ["Landing",SR.Phov,SR.Eld,SR.tld,PHC[4]],
                          ["Reserve",SR.Pres,SR.Eres,SR.tres,PHC[5]],
                        ].map(([ph,pw,e,t,col],i)=>(
                          <tr key={i} style={{borderTop:`1px solid ${SC.border}`,background:i%2?SC.inset:SC.bg}}>
                            <td style={{padding:"5px 10px",color:SC.text,fontWeight:600}}>{ph}</td>
                            <td style={{padding:"5px 10px",color:SC.amber,textAlign:"right"}}>{pw}</td>
                            <td style={{padding:"5px 10px",color:SC.teal,textAlign:"right"}}>{e}</td>
                            <td style={{padding:"5px 10px",color:SC.blue,textAlign:"right"}}>{t}</td>
                            <td style={{padding:"5px 10px",textAlign:"right"}}>
                              <div style={{display:"inline-flex",alignItems:"center",gap:6}}>
                                <div style={{width:40,height:5,background:SC.border,borderRadius:2}}>
                                  <div style={{width:`${(e/SR.Etot*100).toFixed(0)}%`,height:"100%",background:col,borderRadius:2}}/>
                                </div>
                                <span style={{color:col,minWidth:32}}>{(e/SR.Etot*100).toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{padding:"5px 10px",textAlign:"right"}}>
                              <div style={{display:"inline-flex",alignItems:"center",gap:6}}>
                                <div style={{width:40,height:5,background:SC.border,borderRadius:2}}>
                                  <div style={{width:`${(t/SR.Tend*100).toFixed(0)}%`,height:"100%",background:SC.muted,borderRadius:2}}/>
                                </div>
                                <span style={{color:SC.muted,minWidth:32}}>{(t/SR.Tend*100).toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr style={{borderTop:`2px solid ${SC.border}`,background:SC.panel}}>
                          <td style={{padding:"6px 10px",color:SC.text,fontWeight:700}}>TOTAL</td>
                          <td style={{padding:"6px 10px",color:SC.amber,textAlign:"right",fontWeight:700}}>—</td>
                          <td style={{padding:"6px 10px",color:SC.teal,textAlign:"right",fontWeight:700}}>{SR.Etot}</td>
                          <td style={{padding:"6px 10px",color:SC.blue,textAlign:"right",fontWeight:700}}>{SR.Tend}</td>
                          <td style={{padding:"6px 10px",color:SC.muted,textAlign:"right",fontWeight:700}}>100%</td>
                          <td style={{padding:"6px 10px",color:SC.muted,textAlign:"right",fontWeight:700}}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Panel>

                {/* Phase Duration + Energy Radar */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Phase Duration (s)" ht={240} onSave={true}>
                    <PhaseDurationPie SR={SR} SC={SC} PHC={PHC} TTP={TTP}/>
                  </Panel>
                  <Panel title="Energy per Phase — Radar (kWh)" ht={240} onSave={true}>
                    <ResponsiveContainer width="100%" height={195}>
                      <RadarChart data={[{ph:"T/O",E:SR.Eto},{ph:"Climb",E:SR.Ecl},{ph:"Cruise",E:SR.Ecr},{ph:"Desc",E:SR.Edc},{ph:"Land",E:SR.Eld},{ph:"Res",E:SR.Eres}]}>
                        <PolarGrid stroke={SC.border}/>
                        <PolarAngleAxis dataKey="ph" tick={{fontSize:11,fill:SC.muted}}/>
                        <Radar dataKey="E" stroke={SC.teal} fill={SC.teal} fillOpacity={0.25} name="Energy (kWh)"/>
                        <Tooltip {...TTP} formatter={(v)=>[`${v} kWh`,"Energy"]}/>
                        <Legend iconSize={8} wrapperStyle={{fontSize:11,color:SC.muted}} {...chartLegend()}/>
                      </RadarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>

              </div>
            
  );
}
