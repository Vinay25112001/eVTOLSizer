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
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";
import { DragPie } from "../panels/charts.jsx";

/* Tab 2 — WingAero.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function WingAeroTab(ctx) {
  const { SR, TTP, U, customAFData, customAFError, customAirfoilInput, params, setCustomAFData, setCustomAFError, setCustomAirfoilInput, tab } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Wing Area" value={U.area(SR.Swing)} unit={U.areaU}/><KPI label="Wing Span" value={U.len(SR.bWing)} unit={U.lenU}/>
                  <KPI label="MAC" value={U.len(SR.MAC)} unit={U.lenU}/><KPI label="Sweep" value={SR.sweep} unit="°"/>
                  <KPI label="Root Chord" value={U.len(SR.Cr_)} unit={U.lenU}/><KPI label="Tip Chord" value={U.len(SR.Ct_)} unit={U.lenU}/>
                  <KPI label="Wing Loading" value={U.wl(SR.WL)} unit={U.wlU}/><KPI label="Reynolds ×10⁶" value={(SR.Re_/1e6).toFixed(2)} unit=""/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="CD₀ Breakdown (Raymer Buildup)" ht={265} onSave={true}>
                    <DragPie SR={SR} SC={SC} TTP={TTP}/>
                  </Panel>
                  <Panel title="Airfoil Selection Score" ht={265}>
                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>
                      Re = {(SR.Re_/1e6).toFixed(2)}×10⁶ · CDmin interpolated at operating Re · 24 candidates
                    </div>
                    <div style={{height:185,overflowY:"auto"}}>
                      {[...SR.afScored].sort((a,b)=>b.score-a.score).map((af,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:`1px solid ${SC.border}`}}>
                          <span style={{fontSize:9,minWidth:108,color:af.name===SR.selAF.name?SC.green:af.category==="Custom"?SC.amber:SC.text,
                            fontFamily:"'DM Mono',monospace",fontWeight:af.name===SR.selAF.name?700:400}}>
                            {af.name===SR.selAF.name?"★ ":af.category==="Custom"?"⊕ ":""}{af.name}
                          </span>
                          <div style={{flex:1,height:4,background:SC.border,borderRadius:2}}>
                            <div style={{height:"100%",width:`${af.score*100}%`,background:af.name===SR.selAF.name?SC.green:af.category==="Custom"?SC.amber:SC.muted,borderRadius:2}}/>
                          </div>
                          <span style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",minWidth:42,textAlign:"right"}}>
                            {af.CDmin.toFixed(4)}
                          </span>
                          <span style={{fontSize:9,color:af.name===SR.selAF.name?SC.green:SC.muted,fontFamily:"'DM Mono',monospace",minWidth:32,textAlign:"right"}}>
                            {(af.score*100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                      <div style={{marginTop:8,fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                        ★ {SR.selAF.name} | t/c={SR.selAF.tc} CLmax={SR.selAF.CLmax} CDmin@Re={SR.selAF.CDmin.toFixed(4)} | {SR.selAF.source||""}
                      </div>
                    </div>
                  </Panel>
                </div>

                {/* ── Custom Airfoil Input ── */}
                <Panel title="Custom Airfoil — Paste XFoil / UIUC Polar Data">
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:10,lineHeight:1.7}}>
                    Paste XFoil polar output or UIUC ADB data (alpha, CL, CD columns). The app fits a parabolic drag polar
                    <strong style={{color:SC.text}}> CD = CDmin + k·(CL − CLd)²</strong> and overrides the library selection.
                    Clear the box to revert to automatic selection.
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"start"}}>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                        Format: one row per alpha — <code>alpha  CL  CD</code> (whitespace or comma separated)
                      </div>
                      <textarea
                        value={customAirfoilInput}
                        onChange={e=>setCustomAirfoilInput(e.target.value)}
                        placeholder={"Example (XFoil NACA 63-415 at Re=7M):\n alpha    CL       CD\n-4.00   0.0320   0.00740\n-2.00   0.2480   0.00440\n 0.00   0.4640   0.00420\n 2.00   0.6800   0.00440\n 4.00   0.8960   0.00480\n 6.00   1.1120   0.00580\n 8.00   1.3280   0.00750"}
                        style={{width:"100%",boxSizing:"border-box",height:140,background:SC.bg,
                          border:`1px solid ${SC.border}`,borderRadius:6,color:SC.text,
                          fontSize:10,padding:"8px 10px",fontFamily:"'DM Mono',monospace",
                          outline:"none",resize:"vertical"}}
                      />
                      {customAFError&&(
                        <div style={{fontSize:10,color:SC.red,fontFamily:"'DM Mono',monospace",marginTop:4}}>
                          ⚠ {customAFError}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:160}}>
                      <div style={{background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:6,padding:"10px 12px"}}>
                        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>Airfoil metadata</div>
                        {[
                          ["Name",customAFData?.name||"—"],
                          ["t/c",customAFData?customAFData.tc.toFixed(3):"—"],
                          ["CLmax",customAFData?customAFData.CLmax.toFixed(3):"—"],
                          ["CLd (design)",customAFData?customAFData.CLd.toFixed(3):"—"],
                          ["CDmin",customAFData?customAFData.CDmin.toFixed(5):"—"],
                          ["k (polar)",customAFData?customAFData.kPolar.toFixed(5):"—"],
                          ["CM",customAFData?customAFData.CM.toFixed(3):"—"],
                        ].map(([k,v])=>(
                          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:`1px solid ${SC.border}22`}}>
                            <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                            <span style={{fontSize:9,color:SC.text,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={()=>{
                        const txt=customAirfoilInput.trim();
                        if(!txt){setCustomAFData(null);setCustomAFError("");return;}
                        try{
                          const rows=txt.split('\n').map(l=>l.trim()).filter(l=>l&&!/^[a-zA-Z#]/.test(l));
                          const pts=rows.map(l=>{
                            const cols=l.split(/[\s,]+/);
                            if(cols.length<3)throw new Error("Need at least 3 columns: alpha CL CD");
                            return{alpha:parseFloat(cols[0]),CL:parseFloat(cols[1]),CD:parseFloat(cols[2])};
                          }).filter(r=>!isNaN(r.alpha)&&!isNaN(r.CL)&&!isNaN(r.CD));
                          if(pts.length<5)throw new Error("Need at least 5 data points");
                          const CLmax=Math.max(...pts.map(p=>p.CL));
                          const minCD_pt=pts.reduce((a,b)=>b.CD<a.CD?b:a);
                          const CDmin=minCD_pt.CD, CLd=minCD_pt.CL;
                          // Fit parabolic polar: CD = CDmin + k*(CL-CLd)^2  by least squares
                          let sumX2=0,sumX4=0,sumX2Y=0,n=0;
                          pts.forEach(pt=>{const x=(pt.CL-CLd)**2,y=pt.CD-CDmin;sumX2+=x;sumX4+=x*x;sumX2Y+=x*y;n++;});
                          const kPolar=sumX2>0?sumX2Y/sumX2:0.012;
                          // Estimate CM from moment of polar distribution (approximate)
                          const CM_est=pts.length>0?pts.reduce((s,p)=>s+(-0.01*p.CL),0)/pts.length:-0.05;
                          // Estimate t/c from name input or default
                          const tcEst=0.12;
                          setCustomAFData({
                            name:"Custom (User)",tc:tcEst,CLmax,CLd,CDmin,kPolar,CM:CM_est,
                          });
                          setCustomAFError("");
                        }catch(e){setCustomAFError(e.message);setCustomAFData(null);}
                      }} style={{padding:"8px 0",background:`${SC.teal}22`,border:`1px solid ${SC.teal}55`,
                        borderRadius:6,color:SC.teal,fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:700}}>
                        ⊕ Parse & Apply
                      </button>
                      {customAFData&&(
                        <button type="button" onClick={()=>{setCustomAFData(null);setCustomAirfoilInput("");setCustomAFError("");}}
                          style={{padding:"8px 0",background:`${SC.red}11`,border:`1px solid ${SC.red}33`,
                            borderRadius:6,color:SC.red,fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
                          ✕ Clear Custom
                        </button>
                      )}
                    </div>
                  </div>
                  {customAFData&&(
                    <div style={{marginTop:10,padding:"8px 12px",background:`${SC.teal}11`,border:`1px solid ${SC.teal}33`,
                      borderRadius:6,fontSize:10,color:SC.teal,fontFamily:"'DM Mono',monospace"}}>
                      ✓ Custom airfoil active — overrides library selection. CDmin={customAFData.CDmin.toFixed(5)},
                      CLmax={customAFData.CLmax.toFixed(3)}, k={customAFData.kPolar.toFixed(5)}.
                      Polar fitted from {customAirfoilInput.trim().split('\n').filter(l=>l&&!/^[a-zA-Z#]/.test(l.trim())).length} data points.
                    </div>
                  )}
                </Panel>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <Panel title="Drag Polar" ht={235} onSave={true}>
                    <ResponsiveContainer width="100%" height={185}>
                      <LineChart data={SR.polarData} margin={{top:5,right:8,left:-20,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="CD" tick={{fontSize:11,fill:SC.muted}} label={{value:"CD",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} label={{value:"CL",angle:-90,position:"insideLeft",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} {...chartTooltip()}/>
                        <Line isAnimationActive={false} type="monotone" dataKey="CL" stroke={SC.blue} strokeWidth={2} dot={false}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel title="Lift Curve" ht={235} onSave={true}>
                    <ResponsiveContainer width="100%" height={185}>
                      <LineChart data={SR.polarData} margin={{top:5,right:8,left:-20,bottom:0}}>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="alpha" tick={{fontSize:11,fill:SC.muted}} label={{value:"α (°)",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} {...chartTooltip()}/>
                        <Line isAnimationActive={false} type="monotone" dataKey="CL" stroke={SC.green} strokeWidth={2} dot={false}/>
                        <ReferenceLine y={params.clDesign} stroke={SC.amber} strokeDasharray="3 3" label={{value:"CL_des",fill:SC.amber,fontSize:11}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel title="L/D Ratio" ht={235} onSave={true}>
                    <ResponsiveContainer width="100%" height={185}>
                      <AreaChart data={SR.polarData} margin={{top:5,right:8,left:-20,bottom:0}}>
                        <defs><linearGradient id="ldg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SC.amber} stopOpacity={0.3}/><stop offset="95%" stopColor={SC.amber} stopOpacity={0}/>
                        </linearGradient></defs>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="alpha" tick={{fontSize:11,fill:SC.muted}} label={{value:"α (°)",position:"insideBottom",fontSize:12,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis tick={{fontSize:11,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} {...chartTooltip()}/>
                        <Area isAnimationActive={false} type="monotone" dataKey="LD" stroke={SC.amber} strokeWidth={2} fill="url(#ldg)" dot={false}/>
                        <ReferenceLine y={SR.LDact} stroke={SC.green} strokeDasharray="3 3" label={{value:`${SR.LDact}`,fill:SC.green,fontSize:11}}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
                {/* ──── Wing Planform SVG ──── */}
                <Panel title="Wing Planform — Top View">
                  {(()=>{
                    const W=680, H=220, margin={l:60,r:60,t:28,b:28};
                    const b=SR.bWing, Cr=SR.Cr_, Ct=SR.Ct_, sw=SR.sweep*Math.PI/180;
                    const mac=SR.MAC, ymac=SR.Ymac;
                    // SVG scale: half-span fits in (W/2-margin.l-margin.r)
                    const halfW=(W/2-margin.l-4);
                    const scaleY=halfW/(b/2);        // px per metre (span direction → X in SVG)
                    const maxChord=Cr*scaleY*1.05;
                    const scaleX=Math.min((H-margin.t-margin.b)/maxChord, scaleY);
                    // Actually use uniform scale
                    const sc=Math.min(halfW/(b/2),(H-margin.t-margin.b)/Cr);
                    // Wing coords (right half, then mirror): LE swept
                    const xRoot=0, yRoot=margin.t;                          // root LE (top of SVG = LE)
                    const xTip=b/2*sc, yTip=yRoot+(b/2)*Math.tan(sw)*sc;   // tip LE
                    const xTipTe=xTip, yTipTe=yTip+Ct*sc;
                    const xRootTe=xRoot, yRootTe=yRoot+Cr*sc;
                    // MAC position
                    const xMac=ymac*sc, yMacLE=yRoot+ymac*Math.tan(sw)*sc;
                    const yMacTE=yMacLE+mac*sc;
                    // QC line
                    const yRootQC=yRoot+0.25*Cr*sc, yTipQC=yTip+0.25*Ct*sc;
                    // Center offset so both halves fit
                    const cx=W/2;
                    const pt=(x,y)=>`${(cx+x).toFixed(1)},${y.toFixed(1)}`;
                    const ptL=(x,y)=>`${(cx-x).toFixed(1)},${y.toFixed(1)}`;
                    return(
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{fontFamily:"'DM Mono',monospace",overflow:"visible"}}>
                      {/* grid lines */}
                      {[0.25,0.5,0.75,1.0].map(frac=>{
                        const xg=frac*b/2*sc;
                        return <line key={frac} x1={cx+xg} y1={margin.t-8} x2={cx+xg} y2={H-margin.b+5}
                          stroke={SC.inset} strokeWidth={1} strokeDasharray="3 3"/>;
                      })}
                      {/* Right half */}
                      <polygon points={`${pt(xRoot,yRoot)} ${pt(xTip,yTip)} ${pt(xTipTe,yTipTe)} ${pt(xRootTe,yRootTe)}`}
                        fill={SC.inset} stroke={SC.advisory} strokeWidth={1.5} opacity={0.85}/>
                      {/* Left half */}
                      <polygon points={`${ptL(xRoot,yRoot)} ${ptL(xTip,yTip)} ${ptL(xTipTe,yTipTe)} ${ptL(xRootTe,yRootTe)}`}
                        fill={SC.inset} stroke={SC.advisory} strokeWidth={1.5} opacity={0.85}/>
                      {/* Root chord */}
                      <line x1={cx} y1={yRoot} x2={cx} y2={yRootTe} stroke={SC.muted} strokeWidth={1} strokeDasharray="4 2"/>
                      {/* QC sweep line */}
                      <line x1={cx+xRoot} y1={yRootQC} x2={cx+xTip} y2={yTipQC} stroke={SC.caution} strokeWidth={1.5} strokeDasharray="5 3"/>
                      <line x1={cx-xRoot} y1={yRootQC} x2={cx-xTip} y2={yTipQC} stroke={SC.caution} strokeWidth={1.5} strokeDasharray="5 3"/>
                      {/* MAC bar right */}
                      <rect x={cx+xMac-2} y={yMacLE} width={4} height={mac*sc} fill={SC.nominal} opacity={0.9} rx={2}/>
                      <line x1={cx+xMac-12} y1={yMacLE} x2={cx+xMac+12} y2={yMacLE} stroke={SC.nominal} strokeWidth={1}/>
                      <line x1={cx+xMac-12} y1={yMacTE} x2={cx+xMac+12} y2={yMacTE} stroke={SC.nominal} strokeWidth={1}/>
                      {/* MAC bar left */}
                      <rect x={cx-xMac-2} y={yMacLE} width={4} height={mac*sc} fill={SC.nominal} opacity={0.9} rx={2}/>
                      {/* Span arrow */}
                      <line x1={cx-xTip} y1={H-margin.b+14} x2={cx+xTip} y2={H-margin.b+14} stroke={SC.muted} strokeWidth={1} markerEnd="url(#arr)" markerStart="url(#arrl)"/>
                      <text x={cx} y={H-margin.b+22} textAnchor="middle" fill={SC.muted} fontSize={9}>b = {U.len(b)} {U.lenU}</text>
                      {/* Root chord label */}
                      <text x={cx+6} y={(yRoot+yRootTe)/2+3} fill={SC.muted} fontSize={8}>Cr={U.len(Cr)}{U.lenU}</text>
                      {/* Tip chord label */}
                      <text x={cx+xTip+4} y={(yTip+yTipTe)/2+3} fill={SC.muted} fontSize={8}>Ct={U.len(Ct)}{U.lenU}</text>
                      {/* MAC label */}
                      <text x={cx+xMac+6} y={yMacLE+mac*sc/2+3} fill={SC.nominal} fontSize={8}>MAC={U.len(mac)}{U.lenU}</text>
                      {/* Sweep annotation */}
                      <text x={cx+12} y={yRootQC-4} fill={SC.caution} fontSize={8}>Λ¼={SR.sweep}°</text>
                      {/* LE label */}
                      <text x={cx-xTip-4} y={yTip-4} textAnchor="end" fill={SC.advisory} fontSize={8}>LE</text>
                      <text x={cx-xTipTe-4} y={yTipTe+4} textAnchor="end" fill={SC.advisory} fontSize={8}>TE</text>
                      {/* Span fraction ticks */}
                      {[0.25,0.5,0.75].map(frac=>(
                        <text key={frac} x={cx+frac*b/2*sc} y={margin.t-10} textAnchor="middle" fill={SC.dim} fontSize={7}>{Math.round(frac*100)}%</text>
                      ))}
                      <text x={cx+b/2*sc} y={margin.t-10} textAnchor="middle" fill={SC.dim} fontSize={7}>tip</text>
                      <text x={cx} y={margin.t-10} textAnchor="middle" fill={SC.dim} fontSize={7}>CL</text>
                      {/* AR / taper info */}
                      <text x={8} y={16} fill={SC.muted} fontSize={8}>AR={params.AR}  λ={params.taper}  t/c={params.tc}  Sw={U.area(SR.Swing)}{U.areaU}</text>
                      <defs>
                        <marker id="arr" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
                          <path d="M0,0 L6,3 L0,6 Z" fill={SC.muted}/>
                        </marker>
                        <marker id="arrl" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto-start-reverse">
                          <path d="M0,0 L6,3 L0,6 Z" fill={SC.muted}/>
                        </marker>
                      </defs>
                    </svg>);
                  })()}
                </Panel>
              </div>
            
  );
}
