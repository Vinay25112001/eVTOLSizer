import { mark } from "../ui/marks.jsx";
import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { SC } from "../lib/theme.js";
import { ULTIMATE_FACTOR_OF_SAFETY } from "../engine/loadcases.js";

/* Tab 18 — VnDiagram.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function VnDiagramTab(ctx) {
  const { SR, TTP, U, params, tab } = ctx;

              const g0=9.81,rhoMSL=1.225;
              const MTOW=SR.MTOW,WL=SR.WL,g=g0;
              const Vstall=SR.Vstall,VA=SR.VA,VD=SR.VD,VC=params.vCruise;
              /* ── EVERY LOAD FACTOR ON THIS TAB COMES FROM THE ENGINE ──────
                 This block used to be a private structural model:
                   nPosLimit = 3.5, nNegLimit = -1.5     (literals, any design)
                   Kg = 0.88*AR/(5.3+AR)                 (ASPECT RATIO where the
                                                          mass ratio belongs; mu
                                                          was computed on the
                                                          next line and unused)
                   Ug = 15.2 / 7.6 m/s                   (CS-23 aeroplane gusts)
                   "n+ limit >= 2.5 g, CS-VTOL minimum"  (in neither framework)
                 while engine/loadcases.js sized the wing to SC-VTOL's gusts
                 with the proper mass ratio. The tab and the structure disagreed
                 about the same aircraft. Now:
                   manoeuvre caps  SR.vnBasis.capPos / capNeg (MOC VTOL.2200(f)
                                   floors on the design's proposal)
                   gust lines      SR.vnBasis.gustLines (MOC VTOL.2215(f))
                   governing       SR.nLimit / SR.nUltimate, SR.loadGoverningCase */
              const VB=SR.vnBasis||{};
              const nPosLimit=VB.capPos,nNegLimit=VB.capNeg;
              const nUltPos=SR.nUltimate,nUltNeg=ULTIMATE_FACTOR_OF_SAFETY*nNegLimit;
              const gustLines=VB.gustLines||[];
              const worstGust=gustLines.reduce((a,b)=>(!a||b.nPos>a.nPos)?b:a,null);
              const Kg=SR.gustAlleviationKg, mu=SR.massRatioMu;
              // Build V-n envelope
              const rhoCr_vn=SR.rhoCr||rhoMSL; // use cruise density, not MSL
              const CLmax_vn=SR.selAF?.CLmax||1.6;      // positive stall CL
              const CLneg_vn=0.8*CLmax_vn;              // CS-23: neg stall ≈ 0.8×CLmax
              const pts=[];
              for(let i=0;i<=80;i++){
                const v=VD*1.15*i/80;
                const row={v:+v.toFixed(1),nPos:+Math.min(0.5*rhoCr_vn*v*v*CLmax_vn/WL,nPosLimit).toFixed(3),nNeg:+Math.max(-0.5*rhoCr_vn*v*v*CLneg_vn/WL,nNegLimit).toFixed(3)};
                /* each SC-VTOL gust line runs from (0,1) to (V, 1 +/- dn) */
                gustLines.forEach((gl,j)=>{
                  if(v<=gl.V+1e-9){
                    row[`g${j}p`]=+(1+(gl.nPos-1)*v/gl.V).toFixed(3);
                    row[`g${j}n`]=+(1+(gl.nNeg-1)*v/gl.V).toFixed(3);
                  }
                });
                pts.push(row);
              }
              const yMax=Math.max(5,Math.ceil((worstGust?.nPos??0)+0.5),Math.ceil(nPosLimit+0.5));
              const yMin=Math.min(-2.5,Math.floor((gustLines.reduce((m,gl)=>Math.min(m,gl.nNeg),0))-0.5));
              // OEI hover analysis — CS-VTOL SC.VTOL AMC 27.65
              const N=params.nPropHover,Phov_tot=SR.Phov*1000; // W total hover power
              const P_per_motor=Phov_tot/N;         // nominal power per motor (W)
              // CORRECT: each motor is designed for T/W thrust, NOT T/W=1 thrust
              // T_nom_per_motor = MTOW×g×TW / N  (design thrust at T/W ratio)
              const TW_oei = params.twRatio || 1.2;
              const T_per_motor = MTOW*g*TW_oei/N; // actual motor design thrust (N)
              const T_remaining = (N-1)*T_per_motor; // OEI: (N-1) motors at full thrust
              const T_required  = MTOW*g;            // must support aircraft weight
              const OEI_margin_pct = ((T_remaining-T_required)/T_required*100);
              // OEI power: remaining motors must each produce W/(N-1) thrust
              // Power scales with thrust (actuator disk: P ∝ T^1.5), but for display
              // use equal power-sharing: P_oei = Phov_tot/(N-1)
              const P_per_motor_OEI = Phov_tot/(N-1);  // each remaining motor (W)
              const P_overhead_pct  = ((P_per_motor_OEI-P_per_motor)/P_per_motor*100);
              const motorSurvivable=P_per_motor_OEI<=(SR.PpeakKW*1000); // within peak rating?
              // Yaw moment from OEI (assume symmetric layout, worst-case arm = propDiam)
              const Larm=params.propDiam;             // moment arm (m) — conservative
              const Myaw_OEI=T_per_motor*Larm;        // yaw moment (N·m)
              const Myaw_avail=SR.Sv_eff*(0.5*rhoMSL*VC*VC)*SR.lv*0.3; // available yaw authority
              const yawControllable=Myaw_avail>=Myaw_OEI;
              // Structural margins
              const nLimitCheck=nPosLimit>=VB.limitPosMin&&nNegLimit<=VB.limitNegMin; // MOC VTOL.2200(f)
              const manoeuvreGoverns=!SR.gustGoverns;
              return(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:`linear-gradient(135deg,${SC.bg},#0f1a2e)`,border:`1px solid #3b82f644`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:4}}>MOC SC-VTOL VTOL.2200(f) · VTOL.2215(f)</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:"#60a5fa"}}>V-n Diagram</span> & One-Engine-Inoperative Analysis
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:760}}>
                    Manoeuvring envelope capped at this design's limit manoeuvring load factors, floored per MOC VTOL.2200(f). Gust lines are the SC-VTOL MOC VTOL.2215(f) set — the same load cases that size the wing and fuselage — as sharp-edged gusts with the alleviation factor. OEI control authority per CS-VTOL AMC 27.65 — survivability requires remaining motors to absorb load within peak power rating.
                  </div>
                </div>
                {/* V-n Chart */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>V-n Maneuvering Envelope</div>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={pts} margin={{top:10,right:20,left:0,bottom:20}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="v" type="number" domain={[0,VD*1.15]} tick={{fontSize:9,fill:SC.muted}} label={{value:"EAS (m/s)",position:"insideBottom",offset:-8,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis domain={[yMin,yMax]} tick={{fontSize:9,fill:SC.muted}} label={{value:"Load Factor n",angle:-90,position:"insideLeft",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v,n)=>[+v.toFixed(3),n]}/>
                        <ReferenceLine y={0} stroke={SC.border} strokeWidth={1}/>
                        <ReferenceLine y={nPosLimit} stroke={SC.green} strokeDasharray="5 3" label={{value:`n+lim ${nPosLimit}`,fill:SC.green,fontSize:9,position:"right"}}/>
                        <ReferenceLine y={nNegLimit} stroke={SC.red} strokeDasharray="5 3" label={{value:`n-lim ${nNegLimit}`,fill:SC.red,fontSize:9,position:"right"}}/>
                        <ReferenceLine x={Vstall} stroke={SC.amber} strokeDasharray="4 2" label={{value:"VS",fill:SC.amber,fontSize:9,position:"top"}}/>
                        <ReferenceLine x={VA} stroke={SC.purple} strokeDasharray="4 2" label={{value:"VA",fill:SC.purple,fontSize:9,position:"top"}}/>
                        <ReferenceLine x={VC} stroke={SC.teal} strokeDasharray="4 2" label={{value:"VC",fill:SC.teal,fontSize:9,position:"top"}}/>
                        <ReferenceLine x={VD} stroke={SC.red} strokeDasharray="4 2" label={{value:"VD",fill:SC.red,fontSize:9,position:"top"}}/>
                        <Line isAnimationActive={false} type="monotone" dataKey="nPos" stroke={SC.advisory} strokeWidth={2.5} dot={false} name="n+ (manoeuvre)"/>
                        <Line isAnimationActive={false} type="monotone" dataKey="nNeg" stroke={SC.warning} strokeWidth={2} dot={false} name="n- (manoeuvre)"/>
                        {/* SC-VTOL gust lines, MOC VTOL.2215(f) */}
                        {gustLines.flatMap((gl,j)=>[
                          <Line key={`g${j}p`} isAnimationActive={false} type="linear" dataKey={`g${j}p`} stroke={[SC.amber,SC.teal,SC.purple][j%3]} strokeDasharray="3 3" strokeWidth={1.5} dot={false} connectNulls={false} name={`gust ${gl.label}`}/>,
                          <Line key={`g${j}n`} isAnimationActive={false} type="linear" dataKey={`g${j}n`} stroke={[SC.amber,SC.teal,SC.purple][j%3]} strokeDasharray="3 3" strokeWidth={1.5} dot={false} connectNulls={false} legendType="none" name={`gust ${gl.label} (−)`}/>,
                        ])}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Key values */}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Envelope Speeds</div>
                      {[["Stall Speed VS",`${SR.Vstall.toFixed(1)} m/s (${(SR.Vstall*1.944).toFixed(0)} kt)`,SC.amber],
                        ["Manoeuvre Speed VA",`${SR.VA.toFixed(1)} m/s (${(SR.VA*1.944).toFixed(0)} kt)`,SC.green],
                        ["Cruise Speed VC",`${VC.toFixed(1)} m/s (${(VC*1.944).toFixed(0)} kt)`,SC.teal],
                        ["Dive Speed VD",`${SR.VD.toFixed(1)} m/s (${(SR.VD*1.944).toFixed(0)} kt)`,SC.red],
                        ["Manoeuvre limit n+",`${nPosLimit} g`,SC.green],
                        ["Manoeuvre limit n−",`${nNegLimit} g (ult. ${nUltNeg})`,SC.red],
                        ...gustLines.map(gl=>[`Gust ${gl.label}`,`${gl.nPos.toFixed(3)} g at ${gl.V.toFixed(1)} m/s`,SC.amber]),
                        ["Governing limit n",`${SR.nLimit} g (ult. ${nUltPos}) — ${SR.loadGoverningCase}`,manoeuvreGoverns?SC.green:SC.amber],
                        ["Gust alleviation Kg",Kg==null?"—":`${Kg.toFixed(3)} (mass ratio μ ${mu})`,SC.muted],
                      ].map(([k,v,col])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${SC.border}22`}}>
                          <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                          <span style={{fontSize:10,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Structural Checks (CS-VTOL)</div>
                      {[
                        [`n+ ≥ ${VB.limitPosMin} g, n− ≤ ${VB.limitNegMin} g (MOC VTOL.2200(f))`,nLimitCheck,"PASS","FAIL"],
                        ["VD ≥ 1.25 VC",SR.VD>=VC*1.25,"PASS","FAIL"],
                        ["VA = VS×√n+",Math.abs(SR.VA-SR.Vstall*Math.sqrt(nPosLimit))<0.5,"PASS","FAIL"],
                      ].map(([label,ok,p,f])=>(
                        <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${SC.border}22`}}>
                          <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{label}</span>
                          <span style={{fontSize:10,fontWeight:800,fontFamily:"'DM Mono',monospace",color:ok?SC.green:SC.red}}>{ok?`✓ ${p}`:`✗ ${f}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* OEI Analysis */}
                <div style={{background:SC.panel,border:`2px solid ${OEI_margin_pct>0?SC.green:SC.red}`,borderRadius:8,padding:"14px 16px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:OEI_margin_pct>0?SC.green:SC.red,fontFamily:"'DM Mono',monospace",marginBottom:10}}>
                    {mark(OEI_margin_pct>0)} One-Engine-Inoperative (OEI) — CS-VTOL AMC 27.65
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
                    {[["Rotors",N,""],["OEI Thrust Margin",`${OEI_margin_pct.toFixed(1)}%`,OEI_margin_pct>0?SC.green:SC.red],["Power per Motor (OEI)",`${U.power(P_per_motor_OEI/1000)} ${U.powerU}`,motorSurvivable?SC.green:SC.red],["Motor Overload",`+${P_overhead_pct.toFixed(1)}%`,P_overhead_pct<50?SC.green:SC.red],
                    ].map(([k,v,col])=>(
                      <div key={k} style={{background:SC.bg,borderRadius:6,padding:"10px 12px",border:`1px solid ${SC.border}`}}>
                        <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>{k}</div>
                        <div style={{fontSize:14,fontWeight:800,color:col||SC.text,fontFamily:"'DM Mono',monospace"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>Thrust Analysis</div>
                      {[["Total hover thrust req.",`${(T_required/1000).toFixed(2)} kN`],["OEI thrust available",`${(T_remaining/1000).toFixed(2)} kN`],["Thrust margin",`${OEI_margin_pct.toFixed(2)}%`],["Each motor thrust",`${(T_per_motor/1000).toFixed(2)} kN`],
                      ].map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${SC.border}22`,fontSize:9,fontFamily:"'DM Mono',monospace"}}>
                          <span style={{color:SC.muted}}>{k}</span><span style={{color:SC.text,fontWeight:700}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>Power & Control</div>
                      {[["Nominal motor power",`${U.power(P_per_motor/1000)} ${U.powerU}`],["OEI motor power",`${U.power(P_per_motor_OEI/1000)} ${U.powerU}`],["Peak motor rating",`${U.power(SR.PpeakKW)} ${U.powerU}`],["Motor survivable",motorSurvivable?"YES":"NO ✗"],["Yaw controllable",yawControllable?"YES":"NO ✗"],["OEI yaw moment",`${(Myaw_OEI/1000).toFixed(2)} kN·m`],
                      ].map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${SC.border}22`,fontSize:9,fontFamily:"'DM Mono',monospace"}}>
                          <span style={{color:SC.muted}}>{k}</span><span style={{color:SC.text,fontWeight:700}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{marginTop:10,padding:"8px 12px",background:OEI_margin_pct>0?`${SC.green}11`:`${SC.red}11`,borderRadius:6,fontSize:10,color:OEI_margin_pct>0?SC.green:SC.red,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                    {OEI_margin_pct>0
                      ?`✓ OEI SURVIVABLE: With ${N-1} of ${N} motors operating, thrust margin is +${OEI_margin_pct.toFixed(1)}%. Each remaining motor needs ${U.power(P_per_motor_OEI/1000)} ${U.powerU} (${P_overhead_pct.toFixed(0)}% overload vs nominal, ${motorSurvivable?"within":"EXCEEDS"} ${U.power(SR.PpeakKW)} ${U.powerU} peak rating).`
                      :`✗ OEI NOT SURVIVABLE: With 1 motor failed, remaining thrust (${(T_remaining/1000).toFixed(1)} kN) < weight (${(T_required/1000).toFixed(1)} kN). Increase rotor count or T/W ratio. Consider adding a ${Math.ceil(N*1.15)}-rotor configuration.`
                    }
                  </div>
                </div>
              </div>
              );
            
}
