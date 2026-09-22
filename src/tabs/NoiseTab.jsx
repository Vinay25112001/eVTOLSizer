import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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

/* Tab 11 — Noise.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function NoiseTab(ctx) {
  const { SR, TTP, U, darkMode, params, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* Header */}
                <div style={{background:SC.panel,
                  border:`1px solid #8b5cf644`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>ROTOR ACOUSTICS — BPF TONAL + BROADBAND MODEL</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:SC.purple}}>Noise</span> Estimation & dB Contour Map
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:760}}>
                    Semi-empirical model combining <strong style={{color:SC.purple}}>BPF tonal loading noise</strong> (Gutin/Deming),
                    <strong style={{color:SC.teal}}> thickness noise</strong>, and <strong style={{color:SC.blue}}> broadband self-noise</strong> (BPM-simplified).
                    Based on Fleming et al. (VFS 2022), Tinney &amp; Valdez (JASA 2020).
                    A-weighted at BPF. Multi-rotor incoherent summation +10·log₁₀(N).
                    <strong style={{color:SC.amber}}> Same values used in FAA/EASA compliance checker.</strong>
                  </div>
                </div>

                {/* KPI row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="BPF (Blade Pass Freq)" value={SR.BPF.toFixed(1)} unit="Hz"
                    color={SR.BPF<150?SC.green:SC.amber}
                    sub={`${SR.Nbld} blades × ${SR.RPM.toFixed(0)} RPM / 60`}/>
                  <KPI label="OASPL at 1m" value={SR.OASPL_total_1m} unit="dB"
                    color={SC.muted} sub="unweighted, all rotors"/>
                  <KPI label="A-weighted at 150m" value={SR.dBA_150m} unit="dBA"
                    color={SR.dBA_150m<=65?SC.green:SR.dBA_150m<=75?SC.amber:SC.red}
                    sub="EASA UAM limit: 65 dBA"/>
                  <KPI label="65 dBA Contour Radius" value={U.len(SR.dist_65dBA)} unit={U.lenU}
                    color={SR.dist_65dBA<200?SC.green:SR.dist_65dBA<500?SC.amber:SC.red}
                    sub="community noise footprint"/>
                </div>

                {/* SPL vs Distance table + chart */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="A-weighted SPL vs Distance from Aircraft" onSave={true}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart
                        data={[
                          {r:1,   dBA:SR.dBA_1m},
                          {r:5,   dBA:+(SR.dBA_1m-20*Math.log10(5)-(1.8/1000*5)).toFixed(1)},
                          {r:10,  dBA:+(SR.dBA_1m-20*Math.log10(10)-(1.8/1000*10)).toFixed(1)},
                          {r:25,  dBA:SR.dBA_25m},
                          {r:50,  dBA:SR.dBA_50m},
                          {r:100, dBA:SR.dBA_100m},
                          {r:150, dBA:SR.dBA_150m},
                          {r:200, dBA:+(SR.dBA_1m-20*Math.log10(200)-(1.8/1000*200)+2.5).toFixed(1)},
                          {r:300, dBA:SR.dBA_300m},
                          {r:500, dBA:SR.dBA_500m},
                        ]}
                        margin={{top:5,right:20,left:5,bottom:20}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="r" tick={{fontSize:9,fill:SC.muted}}
                          label={{value:`Distance (${U.lenU})`,position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:9,fill:SC.muted}}
                          label={{value:"dBA",angle:-90,position:"insideLeft",fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v)=>[`${v} dBA`,"SPL"]}/>
                        <ReferenceLine y={65} stroke={SC.green}  strokeDasharray="5 3"
                          label={{value:"65 dBA (EASA UAM)",fill:SC.green,fontSize:9,position:"right"}}/>
                        <ReferenceLine y={75} stroke={SC.amber}  strokeDasharray="5 3"
                          label={{value:"75 dBA (FAA op.)",fill:SC.amber,fontSize:9,position:"right"}}/>
                        <ReferenceLine y={85} stroke={SC.red}    strokeDasharray="5 3"
                          label={{value:"85 dBA (hearing)",fill:SC.red,fontSize:9,position:"right"}}/>
                        <Line isAnimationActive={false} type="monotone" dataKey="dBA" stroke={SC.purple} strokeWidth={2.5}
                          dot={{r:3,fill:SC.purple}} name="A-wtd SPL (dBA)"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </Panel>

                  {/* dB distance table */}
                  <Panel title="SPL at Key Reference Distances">
                    <div style={{marginBottom:12}}>
                      {[
                        {dist:1,   val:SR.dBA_1m,   label:`${U.len(1)} ${U.lenU} (near field)`},
                        {dist:25,  val:SR.dBA_25m,  label:`${U.len(25)} ${U.lenU} (helipad edge)`},
                        {dist:50,  val:SR.dBA_50m,  label:`${U.len(50)} ${U.lenU} (building setback)`},
                        {dist:100, val:SR.dBA_100m, label:`${U.len(100)} ${U.lenU} (residential)`},
                        {dist:150, val:SR.dBA_150m, label:`${U.len(150)} ${U.lenU} (EASA UAM ref)`},
                        {dist:300, val:SR.dBA_300m, label:`${U.len(300)} ${U.lenU} (community)`},
                        {dist:500, val:SR.dBA_500m, label:`${U.len(500)} ${U.lenU} (far field)`},
                      ].map(({dist,val,label})=>{
                        const col=val<=55?SC.green:val<=65?SC.teal:val<=75?SC.amber:SC.red;
                        const pct=Math.min(100,Math.max(0,(val-40)/60*100));
                        return(
                          <div key={dist} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"5px 0",borderBottom:`1px solid ${SC.border}`}}>
                            <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",minWidth:160}}>{label}</span>
                            <div style={{flex:1,height:6,background:SC.border,borderRadius:3}}>
                              <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:3,transition:"width 0.4s"}}/>
                            </div>
                            <span style={{fontSize:11,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700,minWidth:52,textAlign:"right"}}>{val} dBA</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Contour table */}
                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.1em"}}>Noise Contour Radii</div>
                    {[
                      ["55 dBA",SR.dist_55dBA,U.lenU,"near-quiet"],
                      ["65 dBA",SR.dist_65dBA,U.lenU,"EASA UAM limit"],
                      ["70 dBA",SR.dist_70dBA,U.lenU,"annoyance threshold"],
                      ["75 dBA",SR.dist_75dBA,U.lenU,"FAA operational limit"],
                    ].map(([lbl,val,unit,note])=>(
                      <div key={lbl} style={{display:"flex",justifyContent:"space-between",
                        padding:"4px 0",borderBottom:`1px solid ${SC.border}22`}}>
                        <span style={{fontSize:10,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{lbl}</span>
                        <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{note}</span>
                        <span style={{fontSize:11,color:val<200?SC.green:val<500?SC.amber:SC.red,
                          fontFamily:"'DM Mono',monospace",fontWeight:700}}>{U.len(val)} {unit}</span>
                      </div>
                    ))}
                  </Panel>
                </div>

                {/* BPF Harmonics spectrum */}
                <Panel title="BPF Tonal Spectrum — First 4 Harmonics (A-weighted)" ht={270} onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
                    Tonal noise at integer multiples of BPF = {SR.BPF.toFixed(1)} Hz.
                    Higher harmonics attenuate at ~6 dB/octave. A-weighting penalises low frequencies.
                  </div>
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={SR.bpfHarmonics} margin={{top:5,right:20,left:5,bottom:20}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="freq" tick={{fontSize:10,fill:SC.muted}}
                        tickFormatter={fhz=>`${fhz} Hz`}
                        label={{value:"Frequency (Hz)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:9,fill:SC.muted}}
                        label={{value:"SPL (dBA at 150m)",angle:-90,position:"insideLeft",fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v)=>[`${v} dBA`,"SPL"]}
                        labelFormatter={fval=>`BPF×${SR.bpfHarmonics.findIndex(harm=>harm.freq===fval)+1} = ${fval} Hz`}/>
                      <Bar isAnimationActive={false} dataKey="SPL" radius={[4,4,0,0]} name="dBA at 150m">
                        {SR.bpfHarmonics.map((harm,i)=>(
                          <Cell key={i} fill={harm.SPL<=65?SC.nominal:harm.SPL<=75?SC.caution:SC.warning}/>
                        ))}
                      </Bar>
                      <ReferenceLine y={65} stroke={SC.green} strokeDasharray="4 3"
                        label={{value:"65 dBA",fill:SC.green,fontSize:9,position:"right"}}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>

                {/* SVG dB Contour Map */}
                <Panel title="dB Noise Contour Map — Top View (hover condition, all rotors)">
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
                    Concentric contours show A-weighted noise level at ground level below hovering aircraft.
                    Aircraft positioned at center. Distances to scale.
                  </div>
                  {(()=>{
                    const W=540,H=400,cx=W/2,cy=H/2;
                    const scale=0.38; // px per meter
                    const contours=[
                      {dBA:85,col:SC.warning,label:"85 dBA", dist:SR.dist_75dBA&&(SR.dBA_1m-85)>0?Math.pow(10,(SR.dBA_1m-85)/20):0},
                      {dBA:75,col:SC.caution,label:"75 dBA", dist:SR.dist_75dBA},
                      {dBA:65,col:SC.nominal,label:"65 dBA", dist:SR.dist_65dBA},
                      {dBA:55,col:"#14b8a6",label:"55 dBA", dist:SR.dist_55dBA},
                    ];
                    return(
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{maxHeight:380,background:darkMode?"#06090e":"#f0f4f8",borderRadius:8}}>
                        {/* Grid */}
                        {[-400,-300,-200,-100,0,100,200,300,400].map(d=>(
                          <g key={d}>
                            <line x1={cx+d*scale} y1={0} x2={cx+d*scale} y2={H} stroke={SC.dim} strokeWidth={0.5}/>
                            <line x1={0} y1={cy+d*scale} x2={W} y2={cy+d*scale} stroke={SC.dim} strokeWidth={0.5}/>
                          </g>
                        ))}
                        {/* Noise contour rings — use SR.dist_*dBA (full propagation model) */}
                        {contours.map(({dBA,col,label,dist})=>{
                          const distM = dist || 0;
                          const r = distM * scale;
                          if(r<=0||r>W) return null;
                          return(
                            <g key={dBA}>
                              <circle cx={cx} cy={cy} r={r} fill={col+"18"} stroke={col} strokeWidth={1.5} strokeDasharray="6 3"/>
                              <text x={cx+r+4} y={cy-4} fontSize={9} fill={col} fontFamily="DM Mono,monospace" fontWeight={700}>{label}</text>
                              <text x={cx+r+4} y={cy+10} fontSize={8} fill={col} fontFamily="DM Mono,monospace">{Math.round(distM)}m</text>
                            </g>
                          );
                        })}
                        {/* Aircraft icon at center */}
                        <circle cx={cx} cy={cy} r={6} fill={SC.amber} opacity={0.9}/>
                        <text x={cx} y={cy+22} textAnchor="middle" fontSize={9} fill={SC.amber} fontFamily="DM Mono,monospace">Aircraft</text>
                        {/* Rotor positions */}
                        {Array.from({length:params.nPropHover}).map((_,i)=>{
                          const ang=i*2*Math.PI/params.nPropHover-Math.PI/2;
                          const rr=SR.bWing/4*scale;
                          return <circle key={i} cx={cx+rr*Math.cos(ang)} cy={cy+rr*Math.sin(ang)}
                            r={SR.Drotor/2*scale} fill={SC.advisory} fillOpacity={0.067} stroke={SC.advisory} strokeWidth={1}/>;
                        })}
                        {/* Scale bar */}
                        <line x1={W-90} y1={H-20} x2={W-90+100*scale} y2={H-20} stroke={SC.muted} strokeWidth={2}/>
                        <text x={W-90} y={H-8} fontSize={9} fill={SC.muted} fontFamily="DM Mono,monospace">0</text>
                        <text x={W-90+100*scale} y={H-8} fontSize={9} fill={SC.muted} fontFamily="DM Mono,monospace">100m</text>
                        {/* Legend */}
                        <text x={10} y={20} fontSize={10} fill={SC.muted} fontFamily="DM Mono,monospace">Hover noise contours</text>
                        <text x={10} y={34} fontSize={9} fill={SC.muted} fontFamily="DM Mono,monospace">BPF={SR.BPF.toFixed(0)}Hz · Vtip={U.speed(SR.TipSpd)}{U.speedU} · {params.nPropHover} rotors</text>
                      </svg>
                    );
                  })()}
                </Panel>

                {/* Noise sensitivity / optimization */}
                <Panel title="Design Sensitivity — How to Reduce Noise">
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {[
                      {title:"↓ Tip Speed",icon:"",current:`${U.speed(SR.TipSpd)} ${U.speedU}`,
                        impact:`−${(SR.noise_sensitivity?.tipSpeed_1pct||0.4).toFixed(2)} dBA per 1% reduction`,
                        action:"Reduce RPM or rotor diameter",
                        col:SC.green},
                      {title:"↑ Rotor Diameter",icon:"",current:`${U.len(SR.Drotor)} ${U.lenU}`,
                        impact:`Larger disk → lower disk loading → quieter`,
                        action:"Increase propDiam slider",
                        col:SC.teal},
                      {title:"↑ Blade Count",icon:"",current:`${SR.Nbld} blades`,
                        impact:`${(SR.noise_sensitivity?.bladeCount_1more||(-1.76)).toFixed(1)} dBA per extra blade`,
                        action:"More blades spread tonal energy",
                        col:SC.blue},
                    ].map(({title,icon,current,impact,action,col})=>(
                      <div key={title} style={{background:SC.bg,border:`1px solid ${col}33`,borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${col}`}}>
                        <div style={{fontSize:13,marginBottom:4}}>{icon} <span style={{fontSize:11,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>{title}</span></div>
                        <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:3}}>Current: {current}</div>
                        <div style={{fontSize:10,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:3}}>{impact}</div>
                        <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace"}}>→ {action}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:10,padding:"8px 12px",background:`${"#a78bfa"}11`,
                    border:`1px solid ${"#a78bfa"}33`,borderRadius:6,fontSize:10,
                    color:SC.purple,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                    ⓘ Model accuracy: ±5 dB (typical for semi-empirical BPF methods at conceptual design phase).
                    Broadband noise dominates in forward flight; tonal noise (BPF harmonics) dominates in hover.
                    For high-fidelity prediction use ANOPP2 or PSU-WOPWOP with CFD inflow data.
                  </div>
                </Panel>

                {/* ── Acoustic Model Methodology ── */}
                <Panel title="Acoustic Model — Methodology & Limitations">
                  <div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0 10px 0'}}>
                      <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                        Gutin-inspired far-field approximation · 8 harmonics · per-frequency A-weighting
                      </span>
                      <span style={{fontSize:9,color:SC.amber,fontFamily:"'DM Mono',monospace",padding:'3px 10px',border:`1px solid ${SC.amber}44`,borderRadius:4}}>
                        Calibrated empirical model — not certification-grade
                      </span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>

                            {/* Formula box */}
                            <div style={{background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:8,padding:'14px 16px'}}>
                              <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:10}}>
                                Exact Formulation
                              </div>
                              {[
                                ['Tonal loading (Gutin + Bessel + compressibility):',
                                 'p_rms = J₁(x)·D(θ)·B·Ω·T / (4π·r₀·ρ·c₀²·√2)   →   SPL₁ = 20·log₁₀(p_rms / 2×10⁻⁵) + K_cal + C_comp',
                                 'K_cal = f(DL, Mtip, B) — multi-param calibration vs Fleming 2022 + Joby/Volocopter data. J₁ Bessel directivity included (FIX 2.1).'],
                                ['Harmonic series (adaptive decay, Gutin-consistent):',
                                 'SPL_n = SPL₁ − α·(n−1),   n = 1…10;   α = f(Mtip, DL) ∈ [2, 7] dB/harm',
                                 'Physically correct — harmonics decay from SPL₁. Removed unphysical +20·log₁₀(n) growth term (FIX 2.4). Fleming 2022 range: 3–6 dB/harm.'],
                                ['Broadband self-noise (Tinney & Valdez 2020):',
                                 'dBA_broadband = dBA_tonal − 8 dB   (midpoint of 5–10 dB experimental range)',
                                 '⚠ Uncertainty ±5 dB — depends on Re, turbulence, blade design. Empirical only.'],
                                ['Incoherent component sum (single rotor):',
                                 'OASPL_single = 10·log₁₀(10^(L_T/10) + 10^(L_thick/10) + 10^(L_BB/10))',
                                 'Sources assumed acoustically uncorrelated'],
                                ['Multi-rotor summation:',
                                 'OASPL_total = OASPL_single + 10·log₁₀(N_rot)',
                                 'Identical uncorrelated rotors — valid at conceptual design level'],
                                ['A-weighting — applied per harmonic frequency:',
                                 'dBA_n = SPL_n + A(f_n),   f_n = B·n·Ω/(2π),   then energy sum',
                                 'Correct approach — NOT single-frequency. IEC 61672. Harmonics 3–5 dominate A-weighted total.'],
                                ['Hover thrust:',
                                 'T = MTOW·g / N_rot   (T/W = 1.0 — hover equilibrium)',
                                 'Not design T/W — rotor operates at W/N in steady hover'],
                                ['Distance propagation:',
                                 'dBA(r) = dBA(1m) − 20·log₁₀(r / 1m)',
                                 'Free-field spherical spreading — no ground reflection or atmosphere'],
                              ].map(([title,formula,note],i)=>(
                                <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<7?`1px solid ${SC.border}22`:'none'}}>
                                  <div style={{fontSize:9,color:SC.amber,fontFamily:"'DM Mono',monospace",fontWeight:700,marginBottom:3}}>{title}</div>
                                  <div style={{fontSize:10,color:SC.teal,fontFamily:"'DM Mono',monospace",marginBottom:2}}>{formula}</div>
                                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{note}</div>
                                </div>
                              ))}
                            </div>

                            {/* Calibration */}
                            <div style={{background:SC.bg,border:`1px solid ${SC.green}33`,borderRadius:8,padding:'12px 16px'}}>
                              <div style={{fontSize:10,fontWeight:700,color:SC.green,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Calibration References</div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                                {[
                                  ['Volocopter 2X (DLR 2020)','18 rotors, R=0.9m','~65 dBA at 100m','Model gives: '+SR.dBA_100m+' dBA at 100m'],
                                  ['Joby S4 (Joby Aviation 2021)','6 rotors, R=1.52m (similar to our design)','~65 dBA at 150m, ~45 at 500m','Model gives: '+SR.dBA_500m+' dBA at 500m (K_cal fitted to this class)'],
                                ].map(([name,config,measured,modelled])=>(
                                  <div key={name} style={{background:`${SC.panel}`,border:`1px solid ${SC.border}`,borderRadius:6,padding:'10px 12px'}}>
                                    <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{name}</div>
                                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{config}</div>
                                    <div style={{fontSize:9,color:SC.green,fontFamily:"'DM Mono',monospace",marginTop:4}}>Measured: {measured}</div>
                                    <div style={{fontSize:9,color:SC.teal,fontFamily:"'DM Mono',monospace"}}>{modelled}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Limitations */}
                            <div style={{background:SC.bg,border:`1px solid ${SC.red}33`,borderRadius:8,padding:'12px 16px'}}>
                              <div style={{fontSize:10,fontWeight:700,color:SC.red,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Validity Envelope & Limitations</div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:9,fontFamily:"'DM Mono',monospace",color:SC.muted,lineHeight:1.7}}>
                                {[
                                  ['Valid for:','Hover and low-speed flight (V∞ ≈ 0)'],
                                  ['Valid for:','M_tip < 0.70 (subsonic, no shock noise)'],
                                  ['Valid for:','Urban eVTOL rotor sizes (R = 0.5–3.0m)'],
                                  ['Valid for:','Conceptual design comparison and trend analysis'],
                                  ['Modelled:','Atmospheric absorption (ISO 9613-1 simplified, 70% RH, 20°C)'],
                                  ['Modelled:','Ground reflection (+2.5 dB image-source, r > 10 m)'],
                                  ['Modelled:','10 harmonics with A-weighting per frequency (IEC 61672)'],
                                  ['Modelled:','Bessel directivity J₁(x) + compressibility C_comp(Mtip)'],
                                  ['Not modelled:','Forward flight noise (BVI, thickness noise in cruise)'],
                                  ['Not modelled:','Directional radiation patterns — in-plane monopole only'],
                                  ['Not modelled:','Rotor–rotor interaction (phasing, wake ingestion)'],
                                  ['⚠ Calibration:','K_cal = f(DL, Mtip, B) — curve-fitted vs Fleming 2022 + Joby/Volocopter data (±2 dB)'],
                                  ['⚠ Harmonic decay:','α ∈ [2–7] dB/harm, adaptive with Mtip and DL. Fleming 2022 range: 3–6 dB/harm'],
                                  ['⚠ Broadband:','−8 dB below tonal + Mtip⁵ scaling. Uncertainty ±5 dB'],
                                  ['⚠ Use for:','Trends and comparisons — NOT certification-level assessment'],
                                ].map(([tag,desc],i)=>(
                                  <div key={i} style={{display:'flex',gap:6}}>
                                    <span style={{color:tag.startsWith('✓')?SC.green:tag.startsWith('✗')?SC.red:SC.amber,minWidth:90,fontWeight:600}}>{tag}</span>
                                    <span>{desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                          </div>
                    </div>
                </Panel>
              </div>
            
  );
}
