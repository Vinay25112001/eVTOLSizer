import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
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
import { SensitivityAnalysis } from "../panels/SensitivityAnalysis.jsx";

/* Tab 5 — Performance.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function PerformanceTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Stall Speed Vs" value={U.speed(SR.Vstall)} unit={U.speedU}/>
                  <KPI label="Corner Speed Va" value={U.speed(SR.VA)} unit={U.speedU}/>
                  <KPI label="Cruise Speed" value={U.speed(params.vCruise)} unit={U.speedU}/>
                  <KPI label="Dive Speed Vd" value={U.speed(SR.VD)} unit={U.speedU}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="V-n Structural Envelope" ht={310} onSave={true}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={SR.vnData} margin={{top:10,right:30,left:10,bottom:20}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="v" tick={{fontSize:11,fill:SC.muted}}
                          tickFormatter={v=>U.speed(v)}
                          label={{value:`Airspeed (${U.speedU})`,position:"insideBottom",offset:-8,fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis domain={[Math.min(-2.5,(SR.vnBasis?.capNeg??0)-0.5),Math.max(4.5,(SR.vnBasis?.capPos??0)+1)]} tick={{fontSize:11,fill:SC.muted}} label={{value:"Load factor n",angle:-90,position:"insideLeft",offset:10,fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} {...chartTooltip()}/>
                        <ReferenceLine y={0} stroke={SC.muted}/>
                        {/* The design's own manoeuvre limits (engine vnBasis), not the
                            literals 3.5 / -1.5 this chart used to draw for every design. */}
                        <ReferenceLine y={SR.vnBasis?.capPos} stroke={SC.blue} strokeDasharray="4 3" label={{value:`n=${SR.vnBasis?.capPos}`,fill:SC.blue,fontSize:11,fontWeight:600}}/>
                        <ReferenceLine y={SR.vnBasis?.capNeg} stroke={SC.red} strokeDasharray="4 3" label={{value:`n=${SR.vnBasis?.capNeg}`,fill:SC.red,fontSize:11,fontWeight:600}}/>
                        <ReferenceLine x={SR.Vstall} stroke={SC.amber} strokeDasharray="4 3" label={{value:`Vs ${U.speed(SR.Vstall)}${U.speedU}`,fill:SC.amber,fontSize:9,fontWeight:600,position:"top"}}/>
                        <ReferenceLine x={SR.VA} stroke={SC.green} strokeDasharray="4 3" label={{value:`Va ${U.speed(SR.VA)}${U.speedU}`,fill:SC.green,fontSize:9,fontWeight:600,position:"top"}}/>
                        <ReferenceLine x={params.vCruise} stroke={SC.teal} strokeDasharray="4 3" label={{value:`Vc ${U.speed(params.vCruise)}${U.speedU}`,fill:SC.teal,fontSize:9,fontWeight:600,position:"top"}}/>
                        <ReferenceLine x={SR.VD} stroke={SC.red} strokeDasharray="4 3" label={{value:`Vd ${U.speed(SR.VD)}${U.speedU}`,fill:SC.red,fontSize:9,fontWeight:600,position:"top"}}/>
                        <Line isAnimationActive={false} type="monotone" dataKey="nPos" stroke={SC.blue} strokeWidth={2.5} dot={false} name="+n limit"/>
                        <Line isAnimationActive={false} type="monotone" dataKey="nNeg" stroke={SC.red} strokeWidth={2.5} dot={false} name="-n limit"/>
                        <Legend iconSize={10} wrapperStyle={{fontSize:12,color:SC.muted,paddingTop:4}} {...chartLegend()}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </Panel>

                  {/* Speed Envelope Summary — fills the empty right column */}
                  <Panel title="Speed & Maneuver Envelope Summary" ht={310}>
                    <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:6}}>
                      {/* Speed tape */}
                      {[
                        {lbl:"Stall Speed Vs",val:SR.Vstall,col:SC.red,note:"CLmax limit · structural stall"},
                        {lbl:"Corner Speed Va",val:SR.VA,col:SC.green,note:"Full deflection without damage"},
                        {lbl:"Cruise Speed Vc",val:params.vCruise,col:SC.teal,note:"Design cruise · Mach "+SR.Mach},
                        {lbl:"Dive Speed Vd",val:SR.VD,col:SC.blue,note:"1.25 × Vc · structural limit"},
                      ].map(({lbl,val,col,note})=>(
                        <div key={lbl} style={{background:SC.bg,borderRadius:6,padding:"8px 12px",border:`1px solid ${col}33`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                            <span style={{fontSize:9,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>{lbl}</span>
                            <span style={{fontSize:16,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{U.speed(val)} <span style={{fontSize:9,color:SC.subtle}}>{U.speedU}</span></span>
                          </div>
                          {/* Speed tape bar */}
                          <div style={{height:4,background:SC.border,borderRadius:2}}>
                            <div style={{height:"100%",width:`${Math.min(100,(val/SR.VD)*100)}%`,background:col,borderRadius:2,opacity:0.8}}/>
                          </div>
                          <div style={{fontSize:8,color:SC.subtle,marginTop:3,fontFamily:"system-ui,sans-serif"}}>{note}</div>
                        </div>
                      ))}
                      {/* Load factor summary */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:2}}>
                        {[
                          {lbl:"Pos. Load Limit",val:`+${SR.nLimit} g`,col:SC.blue},
                          {lbl:"Neg. Load Limit",val:`${SR.nLimitNeg} g`,col:SC.red},
                          {lbl:"OEI Status",val:SR.oeiSurvivable?"✓ Survivable":"⚠ Check",col:SR.oeiSurvivable?SC.green:SC.red},
                          {lbl:"Design Margin Vd/Vc",val:(SR.VD/params.vCruise).toFixed(2)+"×",col:SC.amber},
                        ].map(({lbl,val,col})=>(
                          <div key={lbl} style={{background:SC.bg,borderRadius:5,padding:"6px 9px",border:`1px solid ${col}33`}}>
                            <div style={{fontSize:8,color:SC.muted}}>{lbl}</div>
                            <div style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                </div>

                {/* ── Full-width Payload-Range Diagram ── */}
                <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                    marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",
                        letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif",marginBottom:3}}>
                        Payload-Range Diagram
                      </div>
                      <div style={{fontSize:11,color:SC.text,fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
                        Operational envelope — how far this aircraft can fly at each payload.
                        Freed payload weight transfers directly to battery (fixed MTOW).
                      </div>
                    </div>
                    {/* Key-point summary pills */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[
                        ["Design Point",`${U.mass(params.payload)} ${U.massU} / ${SR?U.dist(SR.totalRange):U.dist(params.range)} ${U.distU} total`,SC.amber],
                        ["Ferry Range",`0 ${U.massU} / ${U.dist(SR.ferryRange)} ${U.distU}`,SC.teal],
                        ["Max Payload",`${U.mass(SR.maxPayloadRp)} ${U.massU} / 0 ${U.distU}`,SC.red],
                      ].map(([lbl,val,col])=>(
                        <div key={lbl} style={{padding:"4px 10px",borderRadius:5,
                          background:`${col}18`,border:`1px solid ${col}44`}}>
                          <div style={{fontSize:7,color:col,fontFamily:"system-ui,sans-serif",
                            textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
                          <div style={{fontSize:11,fontWeight:700,color:col,
                            fontFamily:"'DM Mono',monospace"}}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                      data={SR.rpData}
                      margin={{top:10,right:40,left:10,bottom:30}}>
                      <defs>
                        <linearGradient id="rpGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={SC.purple} stopOpacity={0.35}/>
                          <stop offset="95%" stopColor={SC.purple} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis
                        dataKey="payload"
                        tick={{fontSize:11,fill:SC.muted}}
                        tickCount={8}
                        tickFormatter={v=>U.mass(v)}
                        label={{value:`Payload (${U.massU})`,position:"insideBottom",offset:-12,fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis
                        domain={[0, Math.ceil(SR.ferryRange*1.1/50)*50]}
                        tick={{fontSize:11,fill:SC.muted}}
                        tickFormatter={v=>U.dist(v)}
                        label={{value:`Range (${U.distU})`,angle:-90,position:"insideLeft",offset:10,fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip
                        {...TTP}
                        formatter={(v,n,props)=>{
                          const seg=props?.payload?.segment;
                          /* Was #a78bfa, PHC_DARK[4], hard-coded and therefore painted in BOTH themes:
                             2.54:1 as 13px bold text on the light ground. SC.purple is the same
                             role and follows the theme. */
                          const col=seg==="A"?SC.red:seg==="design"?SC.amber:SC.purple;
                          return[<span style={{color:col,fontWeight:700}}>{U.dist(v)} {U.distU}</span>,"Range"];
                        }}
                        labelFormatter={(idx,payload)=>{
                          const kg=payload?.[0]?.payload?.payload??idx;
                          return `Payload: ${U.mass(kg)} ${U.massU}`;
                        }}/>
                      <ReferenceLine y={SR?SR.totalRange:params.range} stroke={SC.amber}
                        strokeDasharray="5 3"
                        label={{value:`Design range ${U.dist(SR?SR.totalRange:params.range)} ${U.distU}`,fill:SC.amber,fontSize:10,position:"insideTopRight"}}/>
                      <ReferenceLine x={params.payload} stroke={SC.amber}
                        strokeDasharray="5 3"
                        label={{value:`${U.mass(params.payload)} ${U.massU}`,fill:SC.amber,fontSize:10,position:"top"}}/>
                      <ReferenceLine y={150} stroke={SC.blue} strokeDasharray="3 4" strokeWidth={1}
                        label={{value:"Joby S4 ~150 km",fill:SC.blue,fontSize:9,position:"insideBottomRight"}}/>
                      <ReferenceLine y={100} stroke={SC.teal} strokeDasharray="3 4" strokeWidth={1}
                        label={{value:"Archer Midnight ~100 km",fill:SC.teal,fontSize:9,position:"insideBottomRight"}}/>
                      <Area
                        type="monotone"
                        dataKey="range"
                        stroke={SC.purple}
                        strokeWidth={2.5}
                        fill="url(#rpGrad)"
                        dot={false}
                        name={`Range (${U.distU})`}
                        isAnimationActive={false}
                        activeDot={{r:6,fill:SC.purple,stroke:SC.panel,strokeWidth:2}}/>
                      {/* Design point marker */}
                      <ReferenceLine x={params.payload} stroke="none"
                        label={{
                          value:`● ${U.dist(SR?SR.totalRange:params.range)} ${U.distU}`,
                          fill:SC.amber,fontSize:10,
                          position:"insideTopLeft"
                        }}/>
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* Key-points data table */}
                  <div style={{marginTop:10,display:"grid",
                    gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {[
                      ["Ferry Range (no payload)",     `${U.dist(SR.ferryRange)} ${U.distU}`,       `0 ${U.massU}`,       SC.teal],
                      ["Design Point",                  `${SR?U.dist(SR.totalRange):U.dist(params.range)} ${U.distU}`,`${U.mass(params.payload)} ${U.massU}`, SC.amber],
                      ["Half-payload range",            (()=>{
                        const halfPay=Math.round(params.payload/2);
                        const pt=SR.rpData.find(d=>Math.abs(d.payload-halfPay)<SR.maxPayloadRp/20);
                        return pt?`${U.dist(pt.range)} ${U.distU}`:"—";
                      })(),                              `${U.mass(Math.round(params.payload/2))} ${U.massU}`, SC.purple],
                      ["Max payload (zero range)",      `0 ${U.distU}`,                      `${U.mass(SR.maxPayloadRp)} ${U.massU}`, SC.red],
                    ].map(([label,range,payload,col])=>(
                      <div key={label} style={{background:SC.bg,border:`1px solid ${SC.border}`,
                        borderLeft:`3px solid ${col}`,borderRadius:5,padding:"7px 10px"}}>
                        <div style={{fontSize:8,color:SC.muted,fontFamily:"system-ui,sans-serif",
                          marginBottom:3,lineHeight:1.3}}>{label}</div>
                        <div style={{fontSize:13,fontWeight:700,color:col,
                          fontFamily:"'DM Mono',monospace"}}>{range}</div>
                        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{payload}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop:8,fontSize:9,color:SC.subtle,
                    fontFamily:"system-ui,sans-serif",lineHeight:1.6}}>
                    Model: fixed-MTOW ({U.mass(SR.MTOW)} {U.massU}) — reduced payload → battery mass increases.
                    Blue reference: Joby S4 (2023 spec). Teal reference: Archer Midnight.
                    Ferry range assumes full battery, zero payload.
                  </div>
                </div>

                {/* ── Sensitivity Analysis (MATLAB-style ±20% sweep) ── */}
                <SensitivityAnalysis params={params} SR={SR} SC={SC} TTP={TTP} U={U}/>
              </div>
            
  );
}
