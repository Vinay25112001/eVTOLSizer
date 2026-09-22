import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  Area,
  LineChart,
  Line,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";

/* Tab 8 — Convergence.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function ConvergenceTab(ctx) {
  const { SR, TTP, U, params, set, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Round 1 MTOW" value={U.mass(SR.MTOW1)} unit={U.massU} color={SC.muted}/>
                  <KPI label="Converged MTOW" value={U.mass(SR.MTOW)} unit={U.massU} color={SC.green}/>
                  <KPI label={`R2 Iters @ ε=10^${params.convTolExp}`} value={SR.itersR2} unit="" color={SR.r2Converged?SC.green:SC.red} sub={SR.r2Converged?"✓ converged":"✗ hit 600-iter cap"}/>
                  <KPI label="Installed T/W" value={params.twRatio.toFixed(2)} unit="" color={params.twRatio>=1.0&&params.twRatio<=1.4?SC.green:SC.amber} sub={`Phov = ${U.power(SR.Phov)} ${U.powerU}`}/>
                </div>

                {!SR.r2Converged&&(
                  <div style={{background:`${SC.red}18`,border:`1px solid ${SC.red}55`,borderRadius:6,padding:"10px 14px",fontSize:11,color:SC.red}}>
                    ⚠ R2 loop hit the 600-iteration cap without reaching 0.01·W·ε = {SR.tol.toExponential(1)} kg. A design whose residual is still falling is close to a solution the loop ran out of room to reach; one whose residual is rising has no solution to reach.
                  </div>
                )}

                {/* T/W insight banner */}
                <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 16px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",marginBottom:3}}>THRUST-TO-WEIGHT ANALYSIS</div>
                    <div style={{fontSize:11,color:SC.text,lineHeight:1.6}}>
                      At T/W = <span style={{color:SC.amber,fontWeight:700}}>{params.twRatio.toFixed(2)}</span>, installed hover thrust = <span style={{color:SC.blue,fontWeight:700}}>{(params.twRatio*SR.MTOW*9.81/1000).toFixed(1)} kN</span> → hover power = <span style={{color:SC.blue,fontWeight:700}}>{U.power(SR.Phov)} {U.powerU}</span>.
                      Round 1 gives <span style={{color:SC.muted,fontWeight:700}}>{U.mass(SR.MTOW1)} {U.massU}</span>. Dual-constraint converges to <span style={{color:SC.green,fontWeight:700}}>{U.mass(SR.MTOW)} {U.massU}</span> — a <span style={{color:SC.amber,fontWeight:700}}>{((SR.MTOW/SR.MTOW1-1)*100).toFixed(1)}%</span> increase driven by peak hover power sizing.
                    </div>
                  </div>
                </div>

                {/* Tolerance control */}
                <div style={{background:SC.panel,border:`1px solid ${"#22d3ee"}44`,borderRadius:8,padding:"14px 18px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",marginBottom:8}}>CONVERGENCE TOLERANCE CONTROL</div>
                  <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:220}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:11,color:SC.text}}>ε = 10<sup>{params.convTolExp}</sup> → threshold 0.01·W·ε = <span style={{color:"#22d3ee",fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{SR.tol.toExponential(1)} kg</span></span>
                        <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>Range: 10⁻¹ → 10⁻¹⁰</span>
                      </div>
                      <input type="range" min={-10} max={-1} step={1} value={params.convTolExp}
                        onChange={evt=>set("convTolExp")(+evt.target.value)}
                        style={{width:"100%",accentColor:"#22d3ee",cursor:"pointer"}}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:SC.muted,marginTop:2}}>
                        <span>10⁻¹⁰ (tightest)</span><span>10⁻¹ (loosest)</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:12}}>
                      {[["R1 Iters",SR.itersR1,"#22d3ee"],["R2 Iters",SR.itersR2,SR.r2Converged?SC.amber:SC.red],["Total",SR.itersR1+SR.itersR2,SR.r2Converged?SC.green:SC.red]].map(([l,v,c])=>(
                        <div key={l} style={{textAlign:"center",minWidth:60}}>
                          <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{v}</div>
                          <div style={{fontSize:9,color:SC.muted,marginTop:2}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Panel title={`MTOW Convergence History — Actual Run at ε = 10^${params.convTolExp} (${SR.itersR2} R2 iters${SR.r2Converged?"":", cap hit"})`} ht={280} onSave={true}>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={SR.convData} margin={{top:5,right:20,left:-10,bottom:0}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="iter" tick={{fontSize:11,fill:SC.muted}} label={{value:"Iteration",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:11,fill:SC.muted}} tickFormatter={v=>U.mass(v)} label={{value:`MTOW (${U.massU})`,angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${U.mass(v)} ${U.massU}`,n]}/>
                      <ReferenceLine y={SR.MTOW1} stroke={SC.muted} strokeDasharray="4 3" label={{value:`R1: ${U.mass(SR.MTOW1)} ${U.massU}`,fill:SC.muted,fontSize:10,position:"insideTopLeft"}}/>
                      <Line isAnimationActive={false} type="monotone" dataKey="MTOW" stroke={SC.amber} strokeWidth={2} dot={{r:3,fill:SC.amber}} name={`MTOW (${U.massU})`}/>
                      <ReferenceLine y={SR.MTOW} stroke={SC.green} strokeDasharray="4 3" label={{value:`Converged: ${U.mass(SR.MTOW)} ${U.massU}`,fill:SC.green,fontSize:11}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Energy Convergence History" ht={255} onSave={true}>
                  <ResponsiveContainer width="100%" height={205}>
                    <LineChart data={SR.convData.filter(d=>d.Energy!=null)} margin={{top:5,right:20,left:-10,bottom:0}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="iter" tick={{fontSize:11,fill:SC.muted}} label={{value:"Iteration",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:11,fill:SC.muted}} label={{value:"Total Energy (kWh)",angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} {...chartTooltip()}/>
                      <Line isAnimationActive={false} type="monotone" dataKey="Energy" stroke={SC.teal} strokeWidth={2} dot={{r:3,fill:SC.teal}} name="Energy (kWh)"/>
                      <ReferenceLine y={SR.Etot} stroke={SC.green} strokeDasharray="4 3" label={{value:"Converged",fill:SC.green,fontSize:11}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                {/* Residual log plot */}
                <Panel title={`Residual Convergence — log₁₀(|ΔW₀|) per Iteration  [threshold 0.01·W·ε = ${SR.tol.toExponential(1)} kg]`} ht={270} onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,marginBottom:4,paddingLeft:4}}>
                    Each bar shows log₁₀ of the MTOW change per iteration. Convergence when bar drops below the <span style={{color:"#22d3ee"}}>ε threshold line</span>.
                  </div>
                  <ResponsiveContainer width="100%" height={205}>
                    <ComposedChart data={SR.convData.filter(d=>d.logResidual!=null)} margin={{top:5,right:20,left:5,bottom:0}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="iter" tick={{fontSize:11,fill:SC.muted}} label={{value:"Iteration",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:11,fill:SC.muted}} label={{value:`log₁₀(|ΔW₀| kg)`,angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`10^${v.toFixed(2)} ${U.massU}`,n]}/>
                      {/* the line sits at the threshold as APPLIED. It used to sit at the raw
                          exponent, which was the same number only while tol was absolute. */}
                      <ReferenceLine y={+Math.log10(SR.tol).toFixed(4)} stroke={SC.advisory} strokeDasharray="4 3"
                        label={{value:`0.01·W·ε`,fill:SC.advisory,fontSize:10,position:"right"}}/>
                      <Bar isAnimationActive={false} dataKey="logResidual" fill={SC.amber} opacity={0.8} name="log₁₀(|ΔW|)" radius={[2,2,0,0]}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                {/* Tolerance sweep table */}
                <Panel title="Tolerance Sensitivity Sweep — All 10 Levels">
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'DM Mono',monospace"}}>
                    <thead>
                      <tr style={{borderBottom:`1px solid ${SC.border}`}}>
                        {["Tolerance",`R1 Iters`,"R2 Iters","Total",`MTOW (${U.massU})`,`ΔM vs 1e-10`].map(hdr=>(
                          <th key={hdr} style={{padding:"5px 8px",color:SC.muted,fontWeight:600,textAlign:"right",fontSize:10}}>{hdr}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SR.tolSweepData.map((d,i)=>{
                        const isActive=d.exp===params.convTolExp;
                        const ref=SR.tolSweepData[SR.tolSweepData.length-1].R2MTOW;
                        const delta=Math.abs((d.R2MTOW-ref)*1000);
                        return(
                          <tr key={i} style={{borderBottom:`1px solid ${SC.border}22`,background:isActive?`${"#22d3ee"}18`:"transparent"}}>
                            <td style={{padding:"5px 8px",color:isActive?"#22d3ee":SC.text,fontWeight:isActive?700:400,textAlign:"right"}}>{d.tol}{isActive?" ◄":""}</td>
                            <td style={{padding:"5px 8px",color:"#22d3ee",textAlign:"right"}}>{d.R1iters}</td>
                            <td style={{padding:"5px 8px",color:SC.amber,textAlign:"right"}}>{d.R2iters}</td>
                            <td style={{padding:"5px 8px",color:isActive?SC.green:SC.text,fontWeight:isActive?700:400,textAlign:"right"}}>{d.totalIters}</td>
                            <td style={{padding:"5px 8px",color:isActive?"#22d3ee":SC.green,fontWeight:isActive?700:400,textAlign:"right"}}>{U.mass(d.R2MTOW)}</td>
                            <td style={{padding:"5px 8px",color:delta<1?SC.green:delta<100?SC.amber:SC.red,textAlign:"right"}}>{delta<0.01?"< 0.01":delta.toFixed(2)} g</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>

                {/* T/W vs MTOW Trade Chart */}
                <Panel title={`T/W Ratio vs MTOW — Round 1 vs Round 2 at T/W = ${params.twRatio.toFixed(2)}`} ht={320} onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,marginBottom:6,paddingLeft:4}}>
                    Round 1 is flat (T/W doesn't affect energy-only sizing). Round 2 scales as T/W^1.5 — higher thrust margin → higher hover power → heavier battery → higher MTOW.
                    Current T/W = <span style={{color:SC.amber,fontWeight:700}}>{params.twRatio.toFixed(2)}</span> highlighted.
                  </div>
                  <ResponsiveContainer width="100%" height={255}>
                    <ComposedChart data={SR.twSweepData} margin={{top:5,right:20,left:-10,bottom:20}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="tw" tick={{fontSize:11,fill:SC.muted}}
                        label={{value:"Installed T/W Ratio",position:"insideBottom",offset:-8,fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:11,fill:SC.muted}} tickFormatter={v=>U.mass(v)}
                        label={{value:`MTOW (${U.massU})`,angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}}
                        domain={['auto','auto']} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`${U.mass(v)} ${U.massU}`,n]}/>
                      <Legend iconSize={9} wrapperStyle={{fontSize:12,color:SC.muted,paddingTop:4}} {...chartLegend()}/>
                      <ReferenceLine x={+params.twRatio.toFixed(2)} stroke={SC.amber} strokeWidth={2}
                        label={{value:`Current T/W=${params.twRatio.toFixed(2)}`,fill:SC.amber,fontSize:10,position:"insideTopRight"}}/>
                      <Line isAnimationActive={false} type="monotone" dataKey="R1" stroke={SC.muted} strokeWidth={2} strokeDasharray="6 3"
                        dot={{r:3,fill:SC.muted}} name="Round 1 – Energy Only"/>
                      <Line isAnimationActive={false} type="monotone" dataKey="R2" stroke={SC.green} strokeWidth={2.5}
                        dot={(props)=>{
                          const {cx,cy,payload}=props;
                          const isActive=Math.abs(payload.tw-params.twRatio)<0.01;
                          return <circle key={cx} cx={cx} cy={cy} r={isActive?7:3} fill={isActive?SC.amber:SC.green} stroke={isActive?SC.amber:"none"}/>;
                        }}
                        name="Round 2 – Dual-Constraint"/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                {/* T/W detailed table */}
                <Panel title="T/W Sensitivity Table — Round 1 vs Round 2 MTOW">
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'DM Mono',monospace"}}>
                    <thead>
                      <tr style={{borderBottom:`1px solid ${SC.border}`}}>
                        {["T/W",`R1 MTOW (${U.massU})`,`R2 MTOW (${U.massU})`,`ΔM (${U.massU})`,"Δ% vs R1",`Phov at R2 (${U.powerU})`].map(hdr=>(
                          <th key={hdr} style={{padding:"5px 8px",color:SC.muted,fontWeight:600,textAlign:"right",fontSize:10}}>{hdr}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SR.twSweepData.map((d,i)=>{
                        const isActive=Math.abs(d.tw-params.twRatio)<0.01;
                        const delta=d.R2-d.R1;
                        const pct=((d.R2/d.R1-1)*100);
                        const W2=d.R2*9.81;
                        const DL2=(W2*d.tw)/(Math.PI*Math.pow(params.propDiam/2,2)*params.nPropHover);
                        const phov2=+(W2*d.tw/params.etaHov*Math.sqrt(DL2/(2*1.225))/1000).toFixed(1);
                        return(
                          <tr key={i} style={{borderBottom:`1px solid ${SC.border}22`,background:isActive?`${SC.amber}18`:"transparent"}}>
                            <td style={{padding:"5px 8px",color:isActive?SC.amber:SC.text,fontWeight:isActive?700:400,textAlign:"right"}}>{d.tw.toFixed(2)}{isActive?" ◄ current":""}</td>
                            <td style={{padding:"5px 8px",color:SC.muted,textAlign:"right"}}>{U.mass(d.R1)}</td>
                            <td style={{padding:"5px 8px",color:isActive?SC.amber:SC.green,fontWeight:isActive?700:400,textAlign:"right"}}>{U.mass(d.R2)}</td>
                            <td style={{padding:"5px 8px",color:SC.amber,textAlign:"right"}}>+{U.mass(delta)}</td>
                            <td style={{padding:"5px 8px",color:pct>20?SC.red:pct>10?SC.amber:SC.green,textAlign:"right"}}>+{pct.toFixed(1)}%</td>
                            <td style={{padding:"5px 8px",color:SC.blue,textAlign:"right"}}>{U.power(phov2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>

                <Panel title="Final Converged Design Summary — All Sections">
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {[["MTOW",`${U.mass(SR.MTOW)} ${U.massU}`,SC.amber],["Empty Wt",`${U.mass(SR.Wempty)} ${U.massU}`,SC.amber],
                      ["Battery",`${U.mass(SR.Wbat)} ${U.massU}`,SC.amber],["Payload",`${U.mass(params.payload)} ${U.massU}`,SC.amber],
                      ["Hover Pwr",`${U.power(SR.Phov)} ${U.powerU}`,SC.blue],["Climb Pwr",`${U.power(SR.Pcl)} ${U.powerU}`,SC.blue],
                      ["Cruise Pwr",`${U.power(SR.Pcr)} ${U.powerU}`,SC.blue],["Total E",`${SR.Etot} kWh`,SC.teal],
                      ["Pack E",`${SR.PackkWh} kWh`,SC.teal],["Wing Area",`${U.area(SR.Swing)} ${U.areaU}`,SC.green],
                      ["Wing Span",`${U.len(SR.bWing)} ${U.lenU}`,SC.green],["MAC",`${U.len(SR.MAC)} ${U.lenU}`,SC.green],
                      ["Actual L/D",SR.LDact,SC.green],["Airfoil",SR.selAF.name,SC.green],
                      ["Vstall",`${U.speed(SR.Vstall)} ${U.speedU}`,"#8b5cf6"],["Va",`${U.speed(SR.VA)} ${U.speedU}`,"#8b5cf6"],
                      ["Rotor Diam",`${U.len(SR.Drotor)} ${U.lenU}`,"#f97316"],["Tip Mach",SR.TipMach,"#f97316"],
                      ["T/W hover",SR.TW_hover.toFixed(3),SC.amber],["T/W cruise",SR.TW_cruise.toFixed(3),SC.teal],
                      ["SM",`${(SR.SM*100).toFixed(1)}%`,SR.SM>0.05&&SR.SM<0.25?SC.green:SC.red],
                      ["Mach",SR.Mach,SR.Mach<0.45?SC.green:SC.amber],
                    ].map(([k,v,col],i)=>(
                      <div key={i} style={{background:SC.bg,borderRadius:4,padding:"6px 8px",borderLeft:`2px solid ${col}44`}}>
                        <div style={{fontSize:7,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:1}}>{k}</div>
                        <div style={{fontSize:10,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            
  );
}
