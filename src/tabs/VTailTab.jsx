import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
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
import { capabilitiesFor } from "../engine/configuration.js";

/* Tab 7 — VTail.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
/* ── CONVENTIONAL TAIL: FIN + ALL-MOVING STABILATOR ───────────────────
   RAVEN's layout, which the hybrid carries. It was being shown the V-tail
   panel below -- dihedral sweeps, ruddervator area, ruddervator trim and an
   SVG of a V-tail -- none of which this aircraft has. The tab LABEL already
   switched on cap.tailType (App.jsx renders "Fin & Stabilator"); the CONTENT
   did not, so the heading said one aircraft and the body described another.

   The numbers here were already being computed and simply never displayed:
   finArea/finSpan/finAR/finSweep and stabArea/stabSpan/stabAR/stabSweep are
   in the sizing result for every layout, and Sv_eff/Sh_eff are the same two
   areas. Tail volume coefficients are formed here from displayed quantities
   in their textbook definitions rather than read from a field, so the
   formula is visible next to the number. */
function ConventionalTail({ SR, U, params }) {
  const Vh = (SR.stabArea * SR.lv) / (SR.Swing * SR.MAC);
  const Vv = (SR.finArea * SR.lv) / (SR.Swing * SR.bWing);
  const row = (a, b) => [a, b];
  const geo = [
    ["Area", `${U.area(SR.stabArea)} ${U.areaU}`, `${U.area(SR.finArea)} ${U.areaU}`],
    ["Span", `${U.len(SR.stabSpan)} ${U.lenU}`, `${U.len(SR.finSpan)} ${U.lenU}`],
    ["Aspect ratio", SR.stabAR?.toFixed(2), SR.finAR?.toFixed(2)],
    ["Root chord", `${U.len(SR.stabRootChord)} ${U.lenU}`, `${U.len(SR.finRootChord)} ${U.lenU}`],
    ["Tip chord", `${U.len(SR.stabTipChord)} ${U.lenU}`, `${U.len(SR.finTipChord)} ${U.lenU}`],
    ["MAC", `${U.len(SR.stabMAC)} ${U.lenU}`, `${U.len(SR.finMAC)} ${U.lenU}`],
    ["Sweep", `${SR.stabSweep?.toFixed(1)}°`, `${SR.finSweep?.toFixed(1)}°`],
  ];
  const th = { textAlign: "left", padding: "6px 10px", color: SC.muted,
               fontSize: 11, borderBottom: `1px solid ${SC.border}` };
  const td = { padding: "6px 10px", fontSize: 12,
               fontFamily: "DM Mono,monospace", borderBottom: `1px solid ${SC.border}` };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        <KPI label="Stabilator Area" value={U.area(SR.stabArea)} unit={U.areaU} color={SC.amber}
             sub="all-moving horizontal surface"/>
        <KPI label="Fin Area" value={U.area(SR.finArea)} unit={U.areaU} color={SC.blue}
             sub="single vertical surface"/>
        <KPI label="Tail Moment Arm lv" value={U.len(SR.lv)} unit={U.lenU} color={SC.teal}
             sub="wing AC to tail AC"/>
        <KPI label="Static Margin" value={(SR.SM * 100).toFixed(1)} unit="% MAC"
             color={SR.SM > 0.05 && SR.SM < 0.25 ? SC.green : SC.red}
             sub={`target ${((params.targetSM ?? 0.15) * 100).toFixed(0)}%`}/>
        <KPI label="Tail Group Mass" value={U.mass(SR.tailWeightConventional)} unit={U.massU}
             color={SC.purple} sub="fin + stabilator"/>
      </div>

      <Panel title="Fin and stabilator geometry">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}></th><th style={th}>Stabilator</th><th style={th}>Fin</th></tr></thead>
          <tbody>
            {geo.map(([k, a, b]) => (
              <tr key={k}>
                <td style={{ ...td, color: SC.muted, fontFamily: "inherit" }}>{k}</td>
                <td style={td}>{a}</td><td style={td}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Tail volume coefficients">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          <KPI label="Horizontal Vh" value={Vh.toFixed(4)} unit="" color={SC.amber}
               sub="S_stab · l_v / (S_w · MAC)"/>
          <KPI label="Vertical Vv" value={Vv.toFixed(4)} unit="" color={SC.blue}
               sub="S_fin · l_v / (S_w · b)"/>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: SC.muted, lineHeight: 1.55 }}>
          This layout carries a <strong>single fin and an all-moving stabilator</strong>, which is
          RAVEN's arrangement. It therefore has no dihedral angle to optimise and no
          ruddervators: pitch comes from the all-moving stabilator and yaw from the rudder,
          as two separate surfaces rather than one pair working differentially. The V-tail
          panel — dihedral sweep, ruddervator area and ruddervator trim — is shown only for
          the layouts that actually have one.
        </div>
      </Panel>
    </div>
  );
}

export function VTailTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;
  /* WHICH TAIL THIS AIRCRAFT ACTUALLY HAS. Driven by capabilitiesFor, the
     same source App.jsx uses for the tab's label, so the heading and the
     body cannot disagree again. */
  const cap = capabilitiesFor(params.configType, params.nPropHover);
  if (cap.tailType === "conventional")
    return <ConventionalTail SR={SR} U={U} params={params}/>;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* KPI row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
                  <KPI label="Total V-Tail Area" value={U.area(SR.Svt_total)} unit={U.areaU} color={SC.amber}
                    sub={`Each panel: ${U.area(SR.Svt_panel)} ${U.areaU}`}/>
                  <KPI label="Tail / Wing Area" value={(SR.tailWingRatio*100).toFixed(1)} unit="%"
                    color={SR.tailWingRatio>=0.20&&SR.tailWingRatio<=0.55?SC.green:SC.red}
                    sub="Target: 25–50%"/>
                  <KPI label="Optimal Dihedral Γ" value={SR.vtGamma_opt} unit="°" color={SC.teal}
                    sub={`Set: ${params.vtGamma}°`}/>
                  <KPI label="Static Margin (w/ Vtail)" value={(SR.SM_vt*100).toFixed(1)} unit="% MAC"
                    color={SR.SM_vt>=0.05&&SR.SM_vt<=0.25?SC.green:SC.red}
                    sub={`Baseline: ${(SR.SM*100).toFixed(1)}%`}/>
                  <KPI label="Ruddervator Area" value={U.area(SR.Srv)} unit={`${U.areaU}/panel`} color={SC.blue}
                    sub="30% chord"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {/* Panel Geometry */}
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.12em",
                        fontFamily:"'DM Mono',monospace",marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                        Panel Geometry
                      </div>
                      {[["Panel span",`${U.len(SR.bvt_panel)} ${U.lenU}`],["Root chord",`${U.len(SR.Cr_vt)} ${U.lenU}`],
                        ["Tip chord",`${U.len(SR.Ct_vt)} ${U.lenU}`],["MAC",`${U.len(SR.MAC_vt)} ${U.lenU}`],
                        ["LE sweep",`${SR.sweep_vt}°`],["Taper ratio","0.40"],
                        ["Airfoil","NACA 0009"],["t/c","9%"],
                        ["Tail moment arm lv",`${U.len(SR.lv)} ${U.lenU}`],["Ruddervator / panel",`${U.area(SR.Srv)} ${U.areaU}`],
                        ["Lf/b ratio",`${SR.fusSpanRatio} (target 0.55–0.70)`],
                      ].map(([k,v],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid #0f131a`}}>
                          <span style={{fontSize:10,color:SC.muted}}>{k}</span>
                          <span style={{fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.12em",
                        fontFamily:"'DM Mono',monospace",marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                        Weight & Drag
                      </div>
                      {[["V-tail total mass",`${U.mass(SR.Wvt_total)} ${U.massU}`],
                        ["V-tail CD₀ contrib.",`${SR.CD0vt.toFixed(5)}`],
                        ["Ruddervator trim δ",`${SR.delta_rv_deg}°`],
                      ].map(([k,v],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid #0f131a`}}>
                          <span style={{fontSize:10,color:SC.muted}}>{k}</span>
                          <span style={{fontSize:10,color:SC.teal,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {/* SVG schematic — below Weight & Drag, beside Control Authority */}
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.12em",
                        fontFamily:"'DM Mono',monospace",marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                        Rear View Schematic
                      </div>
                      <svg viewBox="-110 -95 220 130" width="100%" height={160} style={{overflow:"visible"}}>
                        <circle cx={0} cy={0} r={12} fill={SC.inset} stroke={SC.dim} strokeWidth={1.5}/>
                        <text x={0} y={4} textAnchor="middle" fill={SC.muted} fontSize={7} fontFamily="DM Mono,monospace">fus</text>
                        {(()=>{
                          const gr=params.vtGamma*Math.PI/180;
                          const panelLen=65;
                          const x2l=-(panelLen*Math.cos(gr)), y2l=-(panelLen*Math.sin(gr));
                          const x2r= (panelLen*Math.cos(gr)), y2r=-(panelLen*Math.sin(gr));
                          const chordScale=SR.Cr_vt*12;
                          return(<>
                            <line x1={0} y1={0} x2={x2l} y2={y2l} stroke={SC.amber} strokeWidth={2.5} strokeLinecap="round"/>
                            <polygon points={`${x2l},${y2l} ${x2l-chordScale*0.2},${y2l-4} ${x2l+chordScale*0.6},${y2l-4} ${x2l+chordScale*0.4},${y2l}`}
                              fill={SC.amber} opacity={0.25} stroke={SC.amber} strokeWidth={0.5}/>
                            <line x1={0} y1={0} x2={x2r} y2={y2r} stroke={SC.amber} strokeWidth={2.5} strokeLinecap="round"/>
                            <polygon points={`${x2r},${y2r} ${x2r-chordScale*0.6},${y2r-4} ${x2r+chordScale*0.2},${y2r-4} ${x2r-chordScale*0.4},${y2r}`}
                              fill={SC.amber} opacity={0.25} stroke={SC.amber} strokeWidth={0.5}/>
                            <path d={`M ${28*Math.cos(Math.PI-gr)},${-28*Math.sin(Math.PI-gr)} A 28 28 0 0 1 ${28*Math.cos(gr)},${-28*Math.sin(gr)}`}
                              fill="none" stroke={SC.teal} strokeWidth={1} strokeDasharray="3 2"/>
                            <text x={0} y={-31} textAnchor="middle" fill={SC.teal} fontSize={10} fontFamily="DM Mono,monospace">Γ={params.vtGamma}°</text>
                            <text x={0} y={-43} textAnchor="middle" fill={SC.green} fontSize={9} fontFamily="DM Mono,monospace">opt={SR.vtGamma_opt}°</text>
                            <text x={x2l-3} y={y2l-7} textAnchor="middle" fill={SC.amber} fontSize={8} fontFamily="DM Mono,monospace">{SR.bvt_panel}m</text>
                            <text x={x2r+3} y={y2r-7} textAnchor="middle" fill={SC.amber} fontSize={8} fontFamily="DM Mono,monospace">{SR.bvt_panel}m</text>
                            <line x1={-85} y1={0} x2={85} y2={0} stroke={SC.inset} strokeWidth={1} strokeDasharray="4 3"/>
                            <line x1={0} y1={-85} x2={0} y2={18} stroke={SC.inset} strokeWidth={1} strokeDasharray="4 3"/>
                            <text x={87} y={4} fill={SC.dim} fontSize={7} fontFamily="DM Mono,monospace">H</text>
                            <text x={2} y={-87} fill={SC.dim} fontSize={7} fontFamily="DM Mono,monospace">V</text>
                          </>);
                        })()}
                      </svg>
                    </div>
                  </div>
                  {/* Dihedral trade chart + effectiveness */}
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.12em",
                        fontFamily:"'DM Mono',monospace",marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                        Dihedral Angle Trade — Intrinsic Effectiveness &amp; Required Area
                      </div>
                      {/* Two-panel layout: left = effectiveness curves, right = area cost */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {/* Panel A: cos²/sin² effectiveness — smooth, bounded 0–100% */}
                        <div>
                          <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                            Authority split (fixed panel)
                          </div>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart
                              data={Array.from({length:81},(_,i)=>{
                                const gd=i+10, gr=gd*Math.PI/180;
                                return{
                                  gamma:gd,
                                  pitch:+(Math.cos(gr)**2*100).toFixed(1),  // pure cos²Γ
                                  yaw:+(Math.sin(gr)**2*100).toFixed(1),    // pure sin²Γ
                                };
                              })}
                              margin={{top:4,right:8,left:0,bottom:18}}>
                              <CartesianGrid {...chartGrid()}/>
                              <XAxis dataKey="gamma" tick={{fontSize:10,fill:SC.muted}}
                                label={{value:"Γ (°)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                              <YAxis domain={[0,100]} tick={{fontSize:10,fill:SC.muted}}
                                label={{value:"%",angle:-90,position:"insideLeft",offset:8,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                              <Tooltip {...TTP} formatter={(v,n)=>[`${v}%`,n]}/>
                              <ReferenceLine x={params.vtGamma} stroke={SC.amber} strokeDasharray="3 2"
                                label={{value:"Γ",fill:SC.amber,fontSize:10,position:"top"}}/>
                              <ReferenceLine x={SR.vtGamma_opt} stroke={SC.green} strokeDasharray="3 2"
                                label={{value:"opt",fill:SC.green,fontSize:10,position:"top"}}/>
                              <ReferenceLine y={50} stroke={SC.dim} strokeDasharray="2 2"/>
                              <Line isAnimationActive={false} type="monotone" dataKey="pitch" stroke={SC.blue} strokeWidth={2} dot={false} name="Pitch cos²Γ"/>
                              <Line isAnimationActive={false} type="monotone" dataKey="yaw" stroke={SC.red} strokeWidth={2} dot={false} name="Yaw sin²Γ"/>
                              <Legend iconSize={8} wrapperStyle={{fontSize:10,color:SC.muted}} {...chartLegend()}/>
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Panel B: total panel area required vs Γ — shows area cost of wrong angle */}
                        <div>
                          <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                            Total panel area required (m²)
                          </div>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart
                              data={Array.from({length:81},(_,i)=>{
                                const gd=i+10, gr=gd*Math.PI/180;
                                const c2=Math.cos(gr)**2, s2=Math.sin(gr)**2;
                                // Avoid divide-by-zero at 0° and 90°
                                if(gd<=11||gd>=89) return{gamma:gd,area:null};
                                const Sp=Math.max(SR.Sh_req/c2, SR.Sv_req/s2);
                                return{gamma:gd, area:+(2*Sp).toFixed(2)};
                              })}
                              margin={{top:4,right:8,left:0,bottom:18}}>
                              <CartesianGrid {...chartGrid()}/>
                              <XAxis dataKey="gamma" tick={{fontSize:10,fill:SC.muted}}
                                label={{value:"Γ (°)",position:"insideBottom",offset:-6,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                              <YAxis tick={{fontSize:10,fill:SC.muted}} tickFormatter={v=>U.area(v)}
                                label={{value:U.areaU,angle:-90,position:"insideLeft",offset:8,fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                              <Tooltip {...TTP} formatter={(v,n)=>[`${U.area(v)} ${U.areaU}`,n]}/>
                              <ReferenceLine x={params.vtGamma} stroke={SC.amber} strokeDasharray="3 2"
                                label={{value:"Γ",fill:SC.amber,fontSize:10,position:"top"}}/>
                              <ReferenceLine x={SR.vtGamma_opt} stroke={SC.green} strokeDasharray="3 2"
                                label={{value:"opt",fill:SC.green,fontSize:10,position:"top"}}/>
                              <ReferenceLine y={SR.Svt_total} stroke={SC.teal} strokeDasharray="3 2"
                                label={{value:"cur",fill:SC.teal,fontSize:10,position:"right"}}/>
                              <Line isAnimationActive={false} type="monotone" dataKey="area" stroke={SC.amber} strokeWidth={2}
                                dot={false} name="Total area" connectNulls={false}/>
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div style={{fontSize:8,color:"#4b5563",fontFamily:"'DM Mono',monospace",marginTop:4,padding:"3px 6px",background:SC.inset,borderRadius:3}}>
                        Left: intrinsic authority split for fixed panel area (cos²Γ + sin²Γ = 1, always bounded).
                        Right: total panel area required to meet both Sh_req and Sv_req — minimum at Γ_opt.
                      </div>
                    </div>
                    {/* Control Authority checks */}
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.12em",
                        fontFamily:"'DM Mono',monospace",marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                        Control Authority vs Requirement
                      </div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,padding:"4px 6px",background:SC.inset,borderRadius:4}}>
                        Sh_eff = S_panel·cos²Γ &nbsp;|&nbsp; Sv_eff = S_panel·sin²Γ &nbsp;|&nbsp; Panel sized to governing constraint
                      </div>
                      {[
                        ["Sh_req (pitch needed)",`${U.area(SR.Sh_req)} ${U.areaU}`,"—",SC.muted],
                        ["Sv_req (yaw needed)",`${U.area(SR.Sv_req)} ${U.areaU}`,"—",SC.muted],
                        ["Panel area (per side)",`${U.area(SR.Svt_panel)} ${U.areaU}`,SR.governs_pitch?"↑ pitch governs":"↑ yaw governs",SC.amber],
                        ["Sh_eff = S·cos²(Γ)",`${U.area(SR.Sh_eff)} ${U.areaU}`,`${(SR.pitch_ratio*100).toFixed(0)}% of req.`,SR.pitch_ratio>=1?SC.green:SC.red],
                        ["Sv_eff = S·sin²(Γ)",`${U.area(SR.Sv_eff)} ${U.areaU}`,`${(SR.yaw_ratio*100).toFixed(0)}% of req.`,SR.yaw_ratio>=1?SC.green:SC.red],
                        ["Pitch authority",SR.pitch_ratio>=1?"Sufficient":"Insufficient","",SR.pitch_ratio>=1?SC.green:SC.red],
                        ["Yaw authority",SR.yaw_ratio>=1?"Sufficient":"Insufficient","",SR.yaw_ratio>=1?SC.green:SC.red],
                        ["Combined authority",`${(SR.ruddervator_combined_auth*100).toFixed(0)}%`,"√(p²+y²)",SC.teal],
                        ["Updated SM (V-tail NP)",`${(SR.SM_vt*100).toFixed(1)}% MAC`,"",SR.SM_vt>=0.05&&SR.SM_vt<=0.25?SC.green:SC.red],
                        ["Trim δ ruddervator (pitch)",`${SR.delta_rv_deg}°`,"symmetric",SC.muted],
                        ["Trim δ ruddervator (yaw)",`${SR.delta_yaw_rv_deg}°`,"differential",SC.muted],
                      ].map(([k,v,s,col],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid #0f131a`}}>
                          <span style={{fontSize:10,color:SC.muted}}>{k}</span>
                          <div style={{textAlign:"right"}}>
                            <span style={{fontSize:10,color:col,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>
                            {s&&<div style={{fontSize:9,color:"#4b5563",fontFamily:"'DM Mono',monospace"}}>{s}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* ──── Ruddervator Deflection Angle Plots ──── */}
                <Panel title="Ruddervator Deflection Analysis">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    {/* Plot 1: Pitch trim δ_rv vs Γ */}
                    <div>
                      <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                        Pitch trim δ_rv vs dihedral Γ (symmetric)
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart
                          data={Array.from({length:71},(_,i)=>{
                            const gd=15+i, gr=gd*Math.PI/180;
                            const Sh_eff_g=SR.Svt_panel*Math.cos(gr)**2;
                            if(Sh_eff_g<0.01) return{gamma:gd,delta:null};
                            const CM_ac=SR.selAF?.CM||(-0.02);
                            const de=-(CM_ac*SR.Swing*SR.MAC)/(0.90*Sh_eff_g*SR.lv);
                            const drv=de/Math.cos(gr)*180/Math.PI;
                            return{gamma:gd,delta:+Math.min(Math.max(drv,-35),35).toFixed(2)};
                          })}
                          margin={{top:4,right:8,left:2,bottom:20}}>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="gamma" tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"Γ (°)",position:"insideBottom",offset:-8,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"δ (°)",angle:-90,position:"insideLeft",offset:10,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v)=>[`${v}°`,"δ_rv pitch"]}/>
                          <ReferenceLine y={20} stroke={SC.red} strokeDasharray="3 2"
                            label={{value:"20° lim",fill:SC.red,fontSize:9,position:"right"}}/>
                          <ReferenceLine y={-20} stroke={SC.red} strokeDasharray="3 2"/>
                          <ReferenceLine x={params.vtGamma} stroke={SC.amber} strokeDasharray="3 2"
                            label={{value:`Γ=${params.vtGamma}°`,fill:SC.amber,fontSize:9,position:"top"}}/>
                          <ReferenceLine y={SR.delta_rv_deg} stroke={SC.green} strokeDasharray="3 2"
                            label={{value:`${SR.delta_rv_deg}°`,fill:SC.green,fontSize:9,position:"right"}}/>
                          <Line isAnimationActive={false} type="monotone" dataKey="delta" stroke={SC.blue} strokeWidth={2} dot={false}
                            name="δ_rv pitch" connectNulls={false}/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Plot 2: Yaw trim δ_rv vs sideslip β */}
                    <div>
                      <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                        Yaw trim δ_rv vs sideslip β (differential)
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart
                          data={Array.from({length:41},(_,i)=>{
                            const beta_deg=-10+i*0.5;
                            const beta_rad=beta_deg*Math.PI/180;
                            const CY_beta=-0.30;
                            const dyaw=(CY_beta*beta_rad*SR.Swing)/(2*SR.Sv_eff/SR.lv)*180/Math.PI*(-1);
                            return{beta:+beta_deg.toFixed(1),delta:+Math.min(Math.max(dyaw,-30),30).toFixed(2)};
                          })}
                          margin={{top:4,right:8,left:2,bottom:20}}>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="beta" tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"β (°)",position:"insideBottom",offset:-8,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"δ (°)",angle:-90,position:"insideLeft",offset:10,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v)=>[`${v}°`,"δ_rv yaw"]}/>
                          <ReferenceLine y={20} stroke={SC.red} strokeDasharray="3 2"
                            label={{value:"20° lim",fill:SC.red,fontSize:9,position:"right"}}/>
                          <ReferenceLine y={-20} stroke={SC.red} strokeDasharray="3 2"/>
                          <ReferenceLine x={0} stroke={SC.dim} strokeWidth={1}/>
                          <ReferenceLine x={2} stroke={SC.amber} strokeDasharray="3 2"
                            label={{value:"β=2°",fill:SC.amber,fontSize:9,position:"top"}}/>
                          <ReferenceLine y={SR.delta_yaw_rv_deg} stroke={SC.green} strokeDasharray="3 2"
                            label={{value:`${SR.delta_yaw_rv_deg}°`,fill:SC.green,fontSize:9,position:"right"}}/>
                          <Line isAnimationActive={false} type="monotone" dataKey="delta" stroke={SC.teal} strokeWidth={2} dot={false} name="δ_rv yaw"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Plot 3: Combined deflection vs SM */}
                    <div>
                      <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                        Pitch trim δ_rv vs Static Margin (% MAC)
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart
                          data={Array.from({length:51},(_,i)=>{
                            const sm_pct=-5+i*0.6; // SM from -5% to +25%
                            const sm=sm_pct/100;
                            const xCG_g=SR.xNP-sm*SR.MAC;
                            // Pitch moment about AC: CM_ac from airfoil + CL * (xCG-xAC)/MAC
                            const CL_cr=SR.Swing>0?2*SR.MTOW*9.81/(1.225*params.vCruise**2*SR.Swing):1;
                            const CM_ac=SR.selAF?.CM||(-0.02);
                            const CM_net=CM_ac+CL_cr*sm;  // net pitch moment
                            const Sh_eff_cur=SR.Sh_eff||0.1;
                            const de=-CM_net*SR.Swing*SR.MAC/(0.90*Sh_eff_cur*SR.lv);
                            const drv=de/Math.cos(params.vtGamma*Math.PI/180)*180/Math.PI;
                            return{sm:+sm_pct.toFixed(1),delta:+Math.min(Math.max(drv,-35),35).toFixed(2)};
                          })}
                          margin={{top:4,right:8,left:2,bottom:20}}>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="sm" tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"SM (%)",position:"insideBottom",offset:-8,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <YAxis tick={{fontSize:10,fill:SC.muted}}
                            label={{value:"δ (°)",angle:-90,position:"insideLeft",offset:10,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v)=>[`${v}°`,"δ_rv"]}/>
                          <ReferenceLine y={20} stroke={SC.red} strokeDasharray="3 2"
                            label={{value:"20° lim",fill:SC.red,fontSize:9,position:"right"}}/>
                          <ReferenceLine y={-20} stroke={SC.red} strokeDasharray="3 2"/>
                          <ReferenceLine y={0} stroke={SC.dim} strokeWidth={1}/>
                          <ReferenceLine x={SR.SM_vt*100} stroke={SC.amber} strokeDasharray="3 2"
                            label={{value:`SM=${(SR.SM_vt*100).toFixed(1)}%`,fill:SC.amber,fontSize:9,position:"top"}}/>
                          <Line isAnimationActive={false} type="monotone" dataKey="delta" stroke={SC.green} strokeWidth={2} dot={false} name="δ_rv vs SM"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:18,marginTop:8,padding:"5px 8px",background:SC.inset,borderRadius:4,flexWrap:"wrap"}}>
                    {[
                      ["Pitch trim δ_rv",`${SR.delta_rv_deg}°`,SC.blue,"symmetric, cruise"],
                      ["Yaw trim δ_rv",`${SR.delta_yaw_rv_deg}°`,SC.teal,"differential, β=2°"],
                      ["Authority limit","±20°","#64748b","CS-23 / FAR 23"],
                      ["Pitch OK",Math.abs(SR.delta_rv_deg)<=20?"Within limits":"Exceeds",Math.abs(SR.delta_rv_deg)<=20?SC.green:SC.red,""],
                      ["Yaw OK",Math.abs(SR.delta_yaw_rv_deg)<=20?"Within limits":"Exceeds",Math.abs(SR.delta_yaw_rv_deg)<=20?SC.green:SC.red,""],
                    ].map(([l,v,col,sub])=>(
                      <div key={l} style={{display:"flex",flexDirection:"column",gap:1}}>
                        <span style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{l}</span>
                        <span style={{fontSize:11,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span>
                        {sub&&<span style={{fontSize:8,color:"#4b5563",fontFamily:"'DM Mono',monospace"}}>{sub}</span>}
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            
  );
}
