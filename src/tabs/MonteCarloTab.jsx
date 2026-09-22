import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";

/* Tab 9 — MonteCarlo.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function MonteCarloTab(ctx) {
  const { SR, TTP, U, mcN, mcRanges, mcResults, mcRunning, runMonteCarlo, setMcN, setMcRanges, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* Header */}
                <div style={{background:SC.panel,
                  border:`1px solid #7c3aed44`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>UNCERTAINTY QUANTIFICATION — MONTE CARLO METHOD</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,letterSpacing:"-0.02em",marginBottom:6}}>
                    <span style={{color:SC.purple}}>Monte Carlo</span> Uncertainty Analysis
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:700}}>
                    Runs <span style={{color:SC.purple,fontWeight:700}}>{mcN.toLocaleString()} simulations</span>, each with parameters randomly sampled from their uncertainty distributions.
                    Produces probability distributions of MTOW, Energy, Hover Power, and Static Margin —
                    giving confidence intervals instead of single-point estimates.
                    Based on literature uncertainty bounds from <em>Raymer, Ng &amp; Willcox (MIT), and Sripad &amp; Viswanathan</em>.
                  </div>
                </div>

                {/* Parameter ranges config */}
                <Panel title="Uncertain Parameter Ranges — Click to Edit">
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:12,lineHeight:1.6}}>
                    Each parameter is sampled from a <span style={{color:SC.purple}}>Normal distribution</span> (μ = midpoint, σ = range/6 so ±3σ covers full range) or
                    <span style={{color:SC.teal}}> Uniform distribution</span>.
                    Ranges are based on peer-reviewed eVTOL uncertainty literature.
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                    {[
                      {key:"sedCell",label:"Battery SED",unit:"Wh/kg",note:"±17% — Joby/Archer 2025 range"},
                      {key:"ewf",    label:"Empty Wt Frac",unit:"",note:"±14% — validated Joby/Lilium/Alia"},
                      {key:"LD",     label:"Lift/Drag L/D",unit:"",note:"±18% — conceptual design uncertainty"},
                      {key:"etaHov", label:"Hover FOM η",unit:"",note:"±11% — rotor efficiency spread"},
                      {key:"etaSys", label:"System η",unit:"",note:"±8% — motor+inverter chain"},
                      {key:"etaBat", label:"Battery η",unit:"",note:"±5% — NMC pack efficiency"},
                      {key:"AR",     label:"Aspect Ratio",unit:"",note:"±20% — wing design freedom"},
                      {key:"payload",label:"Payload",unit:"kg",note:"±10% — mission variation"},
                      {key:"propDiam",label:"Rotor Diameter",unit:"m",note:"±33% — configuration sweep"},
                      {key:"vCruise",label:"Cruise Speed",unit:"m/s",note:"±18% — mission profile variation"},
                      {key:"range",  label:"Mission Range",unit:"km",note:"±20% — route uncertainty"},
                      {key:"nPropHover",label:"No. Rotors",unit:"",note:"4–8 even values — config sweep"},
                    ].map(({key,label,unit,note})=>{
                      const r=mcRanges[key];
                      return(
                        <div key={key} style={{background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:8,padding:"10px 12px"}}>
                          <div style={{fontSize:10,fontWeight:700,color:SC.purple,fontFamily:"'DM Mono',monospace",marginBottom:6}}>{label}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:2}}>MIN</div>
                              <input type="number" value={r.min} step={key==="payload"?5:key==="sedCell"?5:key==="AR"?0.5:0.01}
                                onChange={evt=>setMcRanges(prev=>({...prev,[key]:{...prev[key],min:parseFloat(evt.target.value)||prev[key].min}}))}
                                style={{width:"100%",boxSizing:"border-box",background:SC.panel,border:`1px solid ${SC.border}`,
                                  borderRadius:4,color:SC.text,fontSize:11,padding:"4px 6px",fontFamily:"'DM Mono',monospace",outline:"none"}}/>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:2}}>MAX</div>
                              <input type="number" value={r.max} step={key==="payload"?5:key==="sedCell"?5:key==="AR"?0.5:0.01}
                                onChange={evt=>setMcRanges(prev=>({...prev,[key]:{...prev[key],max:parseFloat(evt.target.value)||prev[key].max}}))}
                                style={{width:"100%",boxSizing:"border-box",background:SC.panel,border:`1px solid ${SC.border}`,
                                  borderRadius:4,color:SC.text,fontSize:11,padding:"4px 6px",fontFamily:"'DM Mono',monospace",outline:"none"}}/>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:4,marginBottom:4}}>
                            {["normal","uniform"].map(d=>(
                              <button key={d} onClick={()=>setMcRanges(prev=>({...prev,[key]:{...prev[key],dist:d}}))} type="button"
                                style={{flex:1,padding:"3px 0",fontSize:8,fontFamily:"'DM Mono',monospace",cursor:"pointer",
                                  background:r.dist===d?SC.inset:"transparent",
                                  border:`1px solid ${r.dist===d?(d==="normal"?SC.purple:SC.teal):SC.border}`,
                                  color:r.dist===d?(d==="normal"?SC.purple:SC.teal):SC.muted,fontWeight:r.dist===d?600:400,borderRadius:3}}>
                                {d==="normal"?"𝒩 Normal":"⊡ Uniform"}
                              </button>
                            ))}
                          </div>
                          <div style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace"}}>{note}</div>
                          {unit&&<div style={{fontSize:8,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{unit}</div>}
                          {/* mini range bar */}
                          <div style={{marginTop:6,height:4,background:SC.border,borderRadius:2,position:"relative"}}>
                            <div style={{position:"absolute",left:"10%",right:"10%",top:0,height:"100%",
                              background:r.dist==="normal"?SC.purple:SC.teal,borderRadius:2,opacity:0.6}}/>
                            <div style={{position:"absolute",left:"50%",top:-3,width:2,height:10,
                              background:SC.amber,transform:"translateX(-50%)"}}/>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:2}}>
                            <span>{r.min}</span><span>μ={(+((r.min+r.max)/2).toFixed(2))}</span><span>{r.max}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* N slider + run button */}
                  <div style={{display:"flex",alignItems:"center",gap:16,marginTop:16,padding:"12px 16px",
                    background:SC.bg,borderRadius:8,border:`1px solid ${SC.border}`}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:11,color:SC.text,fontFamily:"'DM Mono',monospace"}}>
                          Simulations: <span style={{color:SC.purple,fontWeight:700}}>{mcN.toLocaleString()}</span>
                        </span>
                        <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                          ~{(mcN*0.06).toFixed(0)}ms runtime
                        </span>
                      </div>
                      <input type="range" min={100} max={5000} step={100} value={mcN}
                        onChange={evt=>setMcN(+evt.target.value)}
                        style={{width:"100%",accentColor:"#7c3aed",cursor:"pointer"}}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:SC.muted,marginTop:2}}>
                        <span>100 (fast)</span><span>5000 (precise)</span>
                      </div>
                    </div>
                    <button onClick={runMonteCarlo} disabled={mcRunning} type="button"
                      style={{padding:"12px 28px",
                        background:mcRunning?"transparent":`linear-gradient(135deg,#4c1d95,#6d28d9)`,
                        border:`2px solid #7c3aed`,borderRadius:8,color:mcRunning?SC.muted:"#e9d5ff",
                        fontSize:13,fontWeight:800,cursor:mcRunning?"not-allowed":"pointer",
                        fontFamily:"'DM Mono',monospace",letterSpacing:"0.05em",
                        boxShadow:mcRunning?"none":"0 0 20px #7c3aed44",
                        transition:"all 0.2s"}}>
                      {mcRunning?"⟳ Running...":"Run Monte Carlo"}
                    </button>
                  </div>
                </Panel>

                {/* Results */}
                {!mcResults&&!mcRunning&&(
                  <div style={{textAlign:"center",padding:"48px 0",color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                    
                    <div style={{fontSize:14,fontWeight:600,color:SC.text,marginBottom:8}}>No simulation run yet</div>
                    <div style={{fontSize:12,color:SC.muted}}>Configure ranges above and click <span style={{color:SC.purple}}>Run Monte Carlo</span></div>
                  </div>
                )}
                {mcRunning&&(
                  <div style={{textAlign:"center",padding:"48px 0",color:SC.purple,fontFamily:"'DM Mono',monospace"}}>
                    <div style={{fontSize:36,marginBottom:12,animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</div>
                    <div style={{fontSize:14,fontWeight:700}}>Running {mcN.toLocaleString()} simulations...</div>
                    <div style={{fontSize:11,color:SC.muted,marginTop:6}}>Each calling the full eVTOL physics engine</div>
                  </div>
                )}

                {mcResults&&(
                  <>
                    {/* Summary KPIs */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      <KPI label="Simulations Run" value={mcResults.N.toLocaleString()} unit="" color={SC.purple} sub={`${mcResults.failCount} failed/invalid`}/>
                      <KPI label="Feasible Designs" value={mcResults.feasRate+"%"} unit="" color={+mcResults.feasRate>70?SC.green:+mcResults.feasRate>40?SC.amber:SC.red} sub="pass all checks"/>
                      <KPI label="Mean MTOW" value={U.mass(mcResults.MTOW.stats.mean)} unit={U.massU} color={SC.amber} sub={`σ = ${U.mass(mcResults.MTOW.stats.std)} ${U.massU}`}/>
                      <KPI label="P95 MTOW" value={U.mass(mcResults.MTOW.stats.p95)} unit={U.massU} color={SC.red} sub="95% of designs below"/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      <KPI label="P5 MTOW (best)" value={U.mass(mcResults.MTOW.stats.p5)} unit={U.massU} color={SC.green} sub="5th percentile"/>
                      <KPI label="MTOW Range" value={`${U.mass(mcResults.MTOW.stats.min)}–${U.mass(mcResults.MTOW.stats.max)}`} unit={U.massU} color={SC.muted}/>
                      <KPI label="Mean Energy" value={mcResults.Etot.stats.mean.toFixed(2)} unit="kWh" color={SC.teal} sub={`σ = ${mcResults.Etot.stats.std.toFixed(2)}`}/>
                      <KPI label="Mean Hover Pwr" value={U.power(mcResults.Phov.stats.mean)} unit={U.powerU} color={SC.blue} sub={`σ = ${U.power(mcResults.Phov.stats.std)}`}/>
                    </div>

                    {/* MTOW Probability Distribution */}
                    <Panel title={`MTOW Probability Distribution — ${mcResults.N.toLocaleString()} Monte Carlo Samples`} ht={320} onSave={true}>
                      <div style={{fontSize:10,color:SC.muted,marginBottom:6,paddingLeft:4,fontFamily:"'DM Mono',monospace"}}>
                        Each bar = count of designs in that MTOW bin. Bell shape confirms normal convergence.
                        <span style={{color:SC.amber}}> Nominal MTOW = {U.mass(SR.MTOW)} {U.massU}</span> (deterministic).
                        <span style={{color:SC.purple}}> Mean MC = {U.mass(mcResults.MTOW.stats.mean)} {U.massU}</span>.
                      </div>
                      <ResponsiveContainer width="100%" height={255}>
                        <ComposedChart data={mcResults.MTOW.hist} margin={{top:5,right:20,left:5,bottom:20}}>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                            label={{value:`MTOW (${U.massU})`,position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis yAxisId="left" tick={{fontSize:9,fill:SC.muted}}
                            label={{value:"Count",angle:-90,position:"insideLeft",fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis yAxisId="right" orientation="right" tick={{fontSize:9,fill:SC.purple}}
                            label={{value:"% of runs",angle:90,position:"insideRight",fontSize:11,fill:SC.purple}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v,n)=>n==="Count"?[v,n]:[`${v}%`,n]}/>
                          <Legend iconSize={9} wrapperStyle={{fontSize:11,color:SC.muted}} {...chartLegend()}/>
                          <Bar isAnimationActive={false} yAxisId="left" dataKey="count" fill={SC.purple} opacity={0.8} name="Count" radius={[2,2,0,0]}/>
                          <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="pct" stroke={SC.amber} strokeWidth={2} dot={false} name="% of runs"/>
                          <ReferenceLine yAxisId="left" x={mcResults.MTOW.stats.mean.toFixed(1)} stroke={SC.amber} strokeWidth={2} strokeDasharray="6 3"
                            label={{value:`μ=${U.mass(mcResults.MTOW.stats.mean)}`,fill:SC.amber,fontSize:10,position:"top"}}/>
                          <ReferenceLine yAxisId="left" x={mcResults.MTOW.stats.p95.toFixed(1)} stroke={SC.red} strokeWidth={2} strokeDasharray="4 2"
                            label={{value:`P95=${U.mass(mcResults.MTOW.stats.p95)}`,fill:SC.red,fontSize:10,position:"top"}}/>
                          <ReferenceLine yAxisId="left" x={SR.MTOW.toFixed(1)} stroke={SC.green} strokeWidth={2} strokeDasharray="4 2"
                            label={{value:`Nominal=${U.mass(SR.MTOW)}`,fill:SC.green,fontSize:10,position:"top"}}/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </Panel>

                    {/* CDF */}
                    <Panel title="Cumulative Distribution Function (CDF) — MTOW" ht={290} onSave={true}>
                      <div style={{fontSize:10,color:SC.muted,marginBottom:6,paddingLeft:4,fontFamily:"'DM Mono',monospace"}}>
                        Read as: <span style={{color:SC.green}}>P(MTOW ≤ x)</span>. The <span style={{color:SC.amber}}>P90 line</span> shows that 90% of all possible designs have MTOW below this value.
                        This is the key output for design margin decisions.
                      </div>
                      <ResponsiveContainer width="100%" height={230}>
                        <AreaChart data={mcResults.MTOW.cdf} margin={{top:5,right:20,left:5,bottom:20}}>
                          <defs><linearGradient id="cdfg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SC.purple} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={SC.purple} stopOpacity={0.02}/>
                          </linearGradient></defs>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                            label={{value:`MTOW (${U.massU})`,position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis domain={[0,100]} tick={{fontSize:9,fill:SC.muted}}
                            label={{value:"Probability (%)",angle:-90,position:"insideLeft",fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v,n)=>[`${v}%`,"P(MTOW ≤ x)"]}/>
                          <Area isAnimationActive={false} type="monotone" dataKey="cdf" stroke={SC.purple} strokeWidth={2.5} fill="url(#cdfg)" dot={false} name="CDF"/>
                          <ReferenceLine y={50}  stroke={SC.muted}   strokeDasharray="4 2" label={{value:"P50",fill:SC.muted,fontSize:9,position:"right"}}/>
                          <ReferenceLine y={90}  stroke={SC.amber}   strokeDasharray="4 2" label={{value:"P90",fill:SC.amber,fontSize:9,position:"right"}}/>
                          <ReferenceLine y={95}  stroke={SC.red}     strokeDasharray="4 2" label={{value:"P95",fill:SC.red,fontSize:9,position:"right"}}/>
                          <ReferenceLine x={SR.MTOW} stroke={SC.green} strokeDasharray="4 2"
                            label={{value:`Nominal ${U.mass(SR.MTOW)} ${U.massU}`,fill:SC.green,fontSize:9,position:"top"}}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </Panel>

                    {/* Other distributions row */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <Panel title="Total Energy Distribution (kWh)" ht={240} onSave={true}>
                        <ResponsiveContainer width="100%" height={195}>
                          <BarChart data={mcResults.Etot.hist} margin={{top:5,right:10,left:-10,bottom:16}}>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                              label={{value:"Energy (kWh)",position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} {...chartTooltip()}/>
                            <Bar isAnimationActive={false} dataKey="count" fill={SC.teal} opacity={0.8} radius={[2,2,0,0]}/>
                            <ReferenceLine x={mcResults.Etot.stats.mean.toFixed(2)} stroke={SC.amber} strokeDasharray="4 2"
                              label={{value:`μ=${mcResults.Etot.stats.mean.toFixed(1)}`,fill:SC.amber,fontSize:9,position:"top"}}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Panel>
                      <Panel title="Static Margin Distribution (% MAC)" ht={240} onSave={true}>
                        <ResponsiveContainer width="100%" height={195}>
                          <BarChart data={mcResults.SM.hist} margin={{top:5,right:10,left:-10,bottom:16}}>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                              label={{value:"SM (% MAC)",position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} {...chartTooltip()}/>
                            <Bar isAnimationActive={false} dataKey="count" radius={[2,2,0,0]}>
                              {mcResults.SM.hist.map((d,i)=>(
                                <Cell key={i} fill={d.x>=5&&d.x<=25?SC.green:SC.red} opacity={0.8}/>
                              ))}
                            </Bar>
                            <ReferenceLine x={5}  stroke={SC.green} strokeDasharray="3 2" label={{value:"5%",fill:SC.green,fontSize:9}}/>
                            <ReferenceLine x={25} stroke={SC.green} strokeDasharray="3 2" label={{value:"25%",fill:SC.green,fontSize:9}}/>
                            <ReferenceLine x={mcResults.SM.stats.mean.toFixed(1)} stroke={SC.amber} strokeDasharray="4 2"
                              label={{value:`μ=${mcResults.SM.stats.mean.toFixed(1)}%`,fill:SC.amber,fontSize:9,position:"top"}}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Panel>
                      <Panel title={`Hover Power Distribution (${U.powerU})`} ht={240} onSave={true}>
                        <ResponsiveContainer width="100%" height={195}>
                          <BarChart data={mcResults.Phov.hist} margin={{top:5,right:10,left:-10,bottom:16}}>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                              label={{value:`Hover Power (${U.powerU})`,position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} {...chartTooltip()}/>
                            <Bar isAnimationActive={false} dataKey="count" fill={SC.blue} opacity={0.8} radius={[2,2,0,0]}/>
                            <ReferenceLine x={mcResults.Phov.stats.mean.toFixed(1)} stroke={SC.amber} strokeDasharray="4 2"
                              label={{value:`μ=${U.power(mcResults.Phov.stats.mean)}${U.powerU}`,fill:SC.amber,fontSize:9,position:"top"}}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Panel>
                      <Panel title={`Battery Mass Distribution (${U.massU})`} ht={240} onSave={true}>
                        <ResponsiveContainer width="100%" height={195}>
                          <BarChart data={mcResults.Wbat.hist} margin={{top:5,right:10,left:-10,bottom:16}}>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="x" tick={{fontSize:9,fill:SC.muted}}
                              label={{value:`Battery Mass (${U.massU})`,position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} {...chartTooltip()}/>
                            <Bar isAnimationActive={false} dataKey="count" fill={SC.amber} opacity={0.8} radius={[2,2,0,0]}/>
                            <ReferenceLine x={mcResults.Wbat.stats.mean.toFixed(1)} stroke={SC.green} strokeDasharray="4 2"
                              label={{value:`μ=${U.mass(mcResults.Wbat.stats.mean)} ${U.massU}`,fill:SC.green,fontSize:9,position:"top"}}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Panel>
                    </div>

                    {/* Statistics Table */}
                    <Panel title="Full Statistical Summary — All Output Quantities">
                      <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:10}}>
                        P5/P50/P95 = 5th, 50th, 95th percentile. σ = standard deviation. CV = coefficient of variation (σ/μ) — lower is more robust.
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"'DM Mono',monospace"}}>
                          <thead>
                            <tr style={{background:SC.panel}}>
                              {["Quantity","Unit","Min","P5","P25","Median","P75","P95","Max","Mean","σ","CV %"].map(hdr=>(
                                <th key={hdr} style={{padding:"5px 8px",color:SC.muted,fontWeight:600,textAlign:"right",
                                  fontSize:9,letterSpacing:"0.04em"}}>{hdr}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["MTOW",U.massU,mcResults.MTOW.stats,SC.amber],
                              ["Total Energy","kWh",mcResults.Etot.stats,SC.teal],
                              ["Hover Power",U.powerU,mcResults.Phov.stats,SC.blue],
                              ["Battery Mass",U.massU,mcResults.Wbat.stats,SC.amber],
                              ["Actual L/D","",mcResults.LDact.stats,SC.green],
                              ["Static Margin","%",mcResults.SM.stats,SC.green],
                            ].map(([name,unit,s,col],i)=>{
                              const cv=(s.std/Math.abs(s.mean)*100);
                              return(
                                <tr key={i} style={{borderTop:`1px solid ${SC.border}`,background:i%2?SC.inset:SC.bg}}>
                                  <td style={{padding:"5px 8px",color:col,fontWeight:700}}>{name}</td>
                                  <td style={{padding:"5px 8px",color:SC.muted,textAlign:"right"}}>{unit}</td>
                                  {[s.min,s.p5,s.p25,s.p50,s.p75,s.p95,s.max,s.mean,s.std].map((statVal,j)=>(
                                    <td key={j} style={{padding:"5px 8px",color:j===7?col:SC.text,
                                      fontWeight:j===7?700:400,textAlign:"right"}}>{statVal?.toFixed(j>=7?2:1)}</td>
                                  ))}
                                  <td style={{padding:"5px 8px",textAlign:"right",
                                    color:cv<5?SC.green:cv<15?SC.amber:SC.red,fontWeight:700}}>
                                    {cv.toFixed(1)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{marginTop:10,padding:"8px 12px",background:`${"#a78bfa"}11`,
                        border:`1px solid ${"#a78bfa"}44`,borderRadius:6,fontSize:10,
                        color:SC.purple,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                         <strong>Key insight:</strong> There is a <strong>{(mcResults.MTOW.stats.p95/mcResults.MTOW.stats.mean*100-100).toFixed(1)}% mass growth risk</strong> from
                        P50→P95. Design your structure and battery for the <strong>P90 MTOW = {U.mass(mcResults.MTOW.stats.p95)} {U.massU}</strong> to cover
                        95% of all possible technology combinations within the given uncertainty bounds.
                        Feasibility rate: <strong style={{color:+mcResults.feasRate>70?SC.green:SC.red}}>{mcResults.feasRate}%</strong> of designs pass all constraints.
                      </div>
                    </Panel>
                  </>
                )}
              </div>
            
  );
}
