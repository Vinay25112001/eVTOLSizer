import { mark } from "../ui/marks.jsx";
import { seriesBar } from "../ui/chart.js";
import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";
import { capabilitiesFor } from "../engine/configuration.js";
import { staticMarginCriterion } from "../engine/cg.js";
import { MTOWPie } from "../panels/charts.jsx";

/* Tab 6 — Stability.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function StabilityTab(ctx) {
  const { SR, TTP, U, convertCheckVal, params, tab } = ctx;
  /* WING-BORNE STABILITY IS NOT EVERY AIRCRAFT'S STABILITY. A neutral point,
     a mean aerodynamic chord and a static margin all exist because a WING
     does. On the multicopter and the side-by-side they are NaN, and this tab
     rendered them anyway: "Static Margin NaN% MAC", and worse, a Status row
     reading

       SR.SM>=0.05&&SR.SM<=0.25 ? "OK" : SR.SM<0.05 ? "Too small" : "Too large"

     where NaN fails BOTH comparisons, so the else-branch fired and an aircraft
     with no wing was told its static margin was "Too large". That is not a
     missing number, it is a confident false statement, and no NaN scan finds
     it — it took rendering the tab to see it.

     What replaces it is what a rotor-borne layout actually has: whether the CG
     sits inside the rotor array, the hover thrust split and the hover disk
     loading. Those are real outputs of this engine.

     STILL OPEN, and named rather than papered over: src/lib/tabvisibility.js
     justifies keeping this tab visible on rotor-borne layouts by saying it
     "has hover attitude dynamics (hoverqualities.js) and those are real
     outputs. The tab stays and reports what applies." It does not — no
     hover-dynamics field reaches the sizing result at all, so the tab could
     not show them. Wiring hoverqualities.js into the pipeline is the fix for
     that; inventing a display without the engine behind it would be worse. */
  const hasWing = capabilitiesFor(params.configType, params.nPropHover).hasWing !== false;
  /* THE BAND IS THE ENGINE'S, NOT A PAIR OF LITERALS. This tab graded the
     static margin against a hardcoded 5-25 % in three places, the same band
     the W&B panel attributed to "EASA SC-VTOL 2540-2541" -- a paragraph that
     is marked "(reserved)" and a paragraph that does not exist (regdb.js).
     staticMarginCriterion() resolves to the full-authority fly-by-wire
     criterion, whose floor is -10 % and which is ADVISORY, because SC-VTOL
     compliance is by MHQRM handling qualities rather than static stability.
     Against the literals every winged configuration this tool sizes failed. */
  const smCrit = staticMarginCriterion(params);
  const smOK = (sm) => Number.isFinite(sm) && sm >= smCrit.smMin && sm <= smCrit.smMax;
  const smBand = `${(smCrit.smMin*100).toFixed(0)}-${(smCrit.smMax*100).toFixed(0)}%`;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="CG (MTOW)" value={U.len(SR.xCGtotal)} unit={`${U.lenU} from nose`}/>
                  {hasWing ? <>
                    <KPI label="Neutral Point" value={U.len(SR.xNP)} unit={`${U.lenU} from nose`}/>
                    <KPI label="Static Margin" value={(SR.SM*100).toFixed(1)} unit="% MAC" color={smOK(SR.SM)?SC.green:SC.red}/>
                    <KPI label="MAC" value={U.len(SR.MAC)} unit={U.lenU}/>
                  </> : <>
                    <KPI label="CG inside rotor array" value={SR.cgWithinRotorArray ? "yes" : "no"} unit=""
                         color={SR.cgWithinRotorArray ? SC.green : SC.red} sub="hover trim requires it"/>
                    <KPI label="Hover disk loading" value={SR.DL_hover_Nm2?.toFixed(0)} unit="N/m²"
                         color={SC.teal} sub="at T/W = 1"/>
                    <KPI label="Installed T/W" value={SR.TW_hover?.toFixed(2)} unit=""
                         color={SC.blue} sub="thrust margin in hover"/>
                  </>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title={hasWing ? "CG / NP / AC Positions (from nose)" : "CG Position (from nose)"} ht={320}>
                    <div style={{position:"relative",height:90,margin:"10px 0 8px",background:SC.inset,borderRadius:6,border:"1px solid #1c2333"}}>
                      {/* fuselage body */}
                      <div style={{position:"absolute",left:"10%",right:"8%",top:"44%",height:4,background:"#1e2a3a",borderRadius:2}}/>
                      {/* nose */}
                      <div style={{position:"absolute",left:"6%",top:"41%",width:0,height:0,borderTop:"5px solid transparent",borderBottom:"5px solid transparent",borderLeft:`9px solid ${SC.muted}`}}/>
                      {/* length label */}
                      <div style={{position:"absolute",right:"2%",bottom:4,fontSize:10,color:SC.muted,fontFamily:"'IBM Plex Mono',monospace"}}>{(Number(SR?.fusLen)||Number(params.fusLen)).toFixed(2)} m</div>
                      {/* scale ticks */}
                      {[0.25,0.5,0.75,1.0].map(frac=>(
                        <div key={frac} style={{position:"absolute",left:`${10+frac*82}%`,top:"55%",width:1,height:12,background:"#1e2a3a"}}/>
                      ))}
                      {(hasWing?[[SR.xCGtotal,SC.amber,"CG"],[SR.xNP,SC.blue,"NP"],[SR.xACwing,SC.green,"AC"]]
                        :[[SR.xCGtotal,SC.amber,"CG"]]).map(([x,col,lbl])=>{
                        const pct=Math.min(92,Math.max(10,(x/(Number(SR?.fusLen)||Number(params.fusLen)))*82+10));
                        return(<div key={lbl} style={{position:"absolute",left:`${pct}%`,top:0,bottom:0,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                          <div style={{fontSize:10,color:col,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,
                            writingMode:"vertical-rl",textOrientation:"mixed",transform:"rotate(180deg)",
                            letterSpacing:"0.05em",lineHeight:1,marginBottom:4,whiteSpace:"nowrap"}}>
                            {lbl}={U.len(x)}{U.lenU}
                          </div>
                          <div style={{width:2,height:"100%",background:col,opacity:0.85,borderRadius:1,minHeight:60}}/>
                        </div>);
                      })}
                    </div>
                    {(hasWing?[["CG (MTOW)",`${U.len(SR.xCGtotal)} ${U.lenU}`],["Wing AC",`${U.len(SR.xACwing)} ${U.lenU}`],
                      ["Neutral Point",`${U.len(SR.xNP)} ${U.lenU}`],["Static Margin",`${(SR.SM*100).toFixed(1)}% MAC`],
                      ["MAC",`${U.len(SR.MAC)} ${U.lenU}`],["Status",smOK(SR.SM)?`OK (${smBand})`:SR.SM<smCrit.smMin?"⚠ Too small":"⚠ Too large"],["Criterion",`${smCrit.label}${smCrit.advisory?" — advisory":""}`]]
                      :[["CG (MTOW)",`${U.len(SR.xCGtotal)} ${U.lenU}`],
                        ["Neutral point","n/a — rotor-borne, no wing"],
                        ["Static margin","n/a — requires a wing"],
                        ["CG inside rotor array",SR.cgWithinRotorArray?"yes":"⚠ no"],
                        ["Hover thrust fwd share",SR.hoverFwdThrustShare==null?"—":`${(SR.hoverFwdThrustShare*100).toFixed(1)}%`],
                        ["Loaded-rotor ratio",SR.hoverLoadedRotorRatio==null?"—":SR.hoverLoadedRotorRatio.toFixed(3)]]
                    ).map(([k,v],i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid #0f131a`}}>
                        <span style={{fontSize:10,color:SC.muted}}>{k}</span>
                        <span style={{fontSize:10,color:SC.amber,fontFamily:"'IBM Plex Mono',monospace"}}>{v}</span>
                      </div>
                    ))}
                  </Panel>
                  <Panel title="Empty Weight Breakdown (Roskam)" ht={290}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart layout="vertical" data={SR.weightBreak.map(w=>({...w,val:U.mass(w.val)}))} margin={{top:0,right:30,left:60,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis type="number" tick={{fontSize:11,fill:SC.muted}} label={{value:U.massU,position:"insideBottom",offset:-4,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis dataKey="name" type="category" tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v,n)=>[`${v} ${U.massU}`,n]}/>
                        <Bar isAnimationActive={false} dataKey="val" radius={[0,3,3,0]} name={U.massU}>
                          {(()=>{const f=seriesBar(SR.weightBreak.map(w=>w.val));return SR.weightBreak.map((_,i)=><Cell key={i} {...f(i)}/>);})()}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
                {/* CG Travel Range */}
                <Panel title="CG Travel Range — OEW → MTOW (two loading orders)" onSave={true}>
                  {(()=>{
                    /* THIS WAS CALLED A LOADING ENVELOPE AND WAS NOT ONE. The
                       comment promised "add battery first, then payload
                       (worst-case forward/aft)"; the code blended both at once
                       -- Wb = Wbat*frac AND Wp = payload*frac on the same frac
                       -- which is a single monotone line between two fixed
                       endpoints. One curve between the two points every
                       ordering shares cannot show a worst case, because the
                       spread between orderings IS the worst case. A real
                       envelope needs at least two branches, so both documented
                       orderings are now walked: battery first, then payload,
                       and payload first, then battery. They meet at OEW and at
                       MTOW and bound the CG travel between them.

                       Fuel rides at the battery station on a turboelectric
                       design (engine.js passes Wbat + WfuelOut into
                       componentCG), so it is carried on that branch. */
                    const fLeff=Number(SR?.fusLen)||Number(params.fusLen);
                    const xCGbat=fLeff*(params.batStationFrac??0.38), xCGpay=fLeff*(params.payStationFrac??0.40);
                    const Wbat=SR.Wbat+(Number(SR.fuelMassKg)||0), Wpay=Number(params.payload)||0;
                    /* Each branch loads `first` to full, then `second`. */
                    const branch=(wA,xA,wB,xB)=>Array.from({length:51},(_,i)=>{
                      const t=(i/50)*(wA+wB);                 // mass loaded so far
                      const a=Math.min(t,wA), b=Math.max(0,t-wA);
                      const W=SR.Wempty+a+b;
                      const cg=(SR.Wempty*SR.xCGempty+a*xA+b*xB)/W;
                      return{mass:+W.toFixed(1),cg:+cg.toFixed(4),
                             sm:SR.MAC>0?+((SR.xNP-cg)/SR.MAC*100).toFixed(2):null};
                    });
                    const batFirst=branch(Wbat,xCGbat,Wpay,xCGpay);
                    const payFirst=branch(Wpay,xCGpay,Wbat,xCGbat);
                    /* The chart series stays `pts` so the existing plot is
                       unchanged in shape; the second branch is drawn beside
                       it and the spread between them is the travel. */
                    const pts=batFirst.map((p,i)=>({...p,cgAlt:payFirst[i].cg}));
                    return(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {/* CG vs Mass chart */}
                      <div>
                        <div style={{fontSize:8,color:SC.muted,fontFamily:"'IBM Plex Mono',monospace",marginBottom:4}}>
                          CG position ({U.lenU} from nose) vs Aircraft Mass ({U.massU})
                        </div>
                        <ResponsiveContainer width="100%" height={175}>
                          <LineChart data={pts.map(p=>({...p,mass:U.mass(p.mass),cg:U.len(p.cg),cgAlt:U.len(p.cgAlt)}))} margin={{top:4,right:12,left:-15,bottom:14}}>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="mass" tick={{fontSize:10,fill:SC.muted}}
                              label={{value:`Mass (${U.massU})`,position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:SC.muted}}
                              label={{value:`xCG (${U.lenU})`,angle:-90,position:"insideLeft",offset:12,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} formatter={(v,n)=>[`${v} ${U.lenU}`,n]}/>
                            <ReferenceLine y={U.len(SR.xNP)} stroke={SC.blue} strokeDasharray="4 2"
                              label={{value:"NP",fill:SC.blue,fontSize:9,position:"right"}}/>
                            <ReferenceLine y={U.len(SR.xCGempty)} stroke={SC.muted} strokeDasharray="3 2"
                              label={{value:"OEW",fill:SC.muted,fontSize:9,position:"right"}}/>
                            <ReferenceLine y={U.len(SR.xCGtotal)} stroke={SC.amber} strokeDasharray="3 2"
                              label={{value:"MTOW",fill:SC.amber,fontSize:9,position:"right"}}/>
                            <Line isAnimationActive={false} type="monotone" dataKey="cg" stroke={SC.green} strokeWidth={2} dot={false} name={`battery first (${U.lenU})`}/>
                            <Line isAnimationActive={false} type="monotone" dataKey="cgAlt" stroke={SC.amber} strokeWidth={2} strokeDasharray="4 2" dot={false} name={`payload first (${U.lenU})`}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {/* SM vs Mass chart */}
                      <div>
                        <div style={{fontSize:8,color:SC.muted,fontFamily:"'IBM Plex Mono',monospace",marginBottom:4}}>
                          Static Margin (% MAC) vs Aircraft Mass — band from the engine criterion, advisory
                        </div>
                        <ResponsiveContainer width="100%" height={175}>
                          <AreaChart data={pts.map(p=>({...p,mass:U.mass(p.mass)}))} margin={{top:4,right:12,left:-12,bottom:14}}>
                            <defs>
                              <linearGradient id="smg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={SC.green} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={SC.green} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid {...chartGrid()}/>
                            <XAxis dataKey="mass" tick={{fontSize:10,fill:SC.muted}}
                              label={{value:`Mass (${U.massU})`,position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <YAxis tick={{fontSize:10,fill:SC.muted}}
                              label={{value:"SM (%)",angle:-90,position:"insideLeft",offset:15,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                            <Tooltip {...TTP} formatter={(v,n)=>[`${v}%`,n]}/>
                            <ReferenceLine y={5} stroke={SC.red} strokeDasharray="3 2"
                              label={{value:"5% min",fill:SC.red,fontSize:9,position:"right"}}/>
                            <ReferenceLine y={25} stroke={SC.red} strokeDasharray="3 2"
                              label={{value:"25% max",fill:SC.red,fontSize:9,position:"right"}}/>
                            <Area isAnimationActive={false} type="monotone" dataKey="sm" stroke={SC.green} strokeWidth={2} fill="url(#smg)" dot={false} name="SM %"/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>);
                  })()}
                  <div style={{display:"flex",gap:18,marginTop:8,padding:"5px 8px",background:SC.inset,borderRadius:4}}>
                    {[["OEW CG",`${U.len(SR.xCGempty)} ${U.lenU}`,"#64748b"],["MTOW CG",`${U.len(SR.xCGtotal)} ${U.lenU}`,SC.amber],
                      ["NP",`${U.len(SR.xNP)} ${U.lenU}`,SC.blue],["ΔCG travel",`${U.len(Math.abs(SR.xCGtotal-SR.xCGempty))} ${U.lenU}`,SC.green]
                    ].map(([l,v,col])=>(
                      <div key={l} style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:8,color:SC.muted,fontFamily:"'IBM Plex Mono',monospace"}}>{l}</span>
                        <span style={{fontSize:11,color:col,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="MTOW Composition" ht={235}>
                    <MTOWPie SR={SR} params={params} SC={SC} TTP={TTP} U={U}/>
                  </Panel>
                  <Panel title="Feasibility Checks" ht={235}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:4}}>
                      {SR.checks.map((chk,i)=>(
                        <div key={i} style={{background:SC.bg,borderRadius:5,padding:"7px 9px",border:`1px solid ${chk.ok?SC.green+"33":SC.red+"33"}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                            <span>{mark(chk.ok)}</span>
                            <span style={{fontSize:8,color:chk.ok?SC.green:SC.red,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{chk.ok?"PASS":"FAIL"}</span>
                          </div>
                          <div style={{fontSize:8,color:SC.muted,marginBottom:2}}>{chk.label}</div>
                          <div style={{fontSize:9,color:chk.ok?SC.green:SC.red,fontFamily:"'IBM Plex Mono',monospace"}}>{convertCheckVal(chk.val)}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            
  );
}
