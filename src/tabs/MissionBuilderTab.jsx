import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";

/* Tab 13 — MissionBuilder.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function MissionBuilderTab(ctx) {
  const { PHASE_TYPES, SR, TTP, U, computeCustomMission, customPhases, dragIdx, dragOverIdx, mbResults, setCustomPhases, setDragIdx, setDragOverIdx, setMbResults, tab, uid2 } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* Header */}
                <div style={{background:SC.panel,
                  border:`1px solid #06d6a044`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>CUSTOM MISSION PROFILE — DRAG & DROP PHASES</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:"#06d6a0"}}>Mission Builder</span>
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7}}>
                    Build any mission profile by dragging phases into order. Add hover-at-destination, emergency divert, wind correction segments, loiter patterns.
                    Click <strong style={{color:"#06d6a0"}}>▶ Compute Mission</strong> to run the physics engine on your custom profile.
                  </div>
                </div>

                {/* Phase palette */}
                <Panel title="Phase Library — Click to Add to Mission">
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {Object.entries(PHASE_TYPES).map(([type,pt])=>(
                      <button key={type} onClick={()=>{
                          const def=pt.defaults;
                          setCustomPhases(prev=>[...prev,{id:uid2(),type,...def,label:pt.label}]);
                        }} type="button"
                        style={{padding:"6px 12px",background:`${pt.col}15`,
                          border:`1px solid ${pt.col}55`,borderRadius:6,cursor:"pointer",
                          display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:14}}>{pt.icon}</span>
                        <span style={{fontSize:11,color:pt.col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{pt.label}</span>
                        <span style={{fontSize:10,color:SC.muted}}>+</span>
                      </button>
                    ))}
                  </div>
                </Panel>

                {/* Drag-and-drop phase list */}
                <Panel title={`Mission Profile — ${customPhases.length} Phases (drag to reorder)`}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {customPhases.map((ph,i)=>{
                      const pt=PHASE_TYPES[ph.type];
                      const isDragging=dragIdx===i;
                      const isOver=dragOverIdx===i;
                      return(
                        <div key={ph.id}
                          draggable
                          onDragStart={()=>setDragIdx(i)}
                          onDragOver={evt => {evt.preventDefault();setDragOverIdx(i);}}
                          onDrop={evt=>{
                            evt.preventDefault();
                            if(dragIdx===null||dragIdx===i) return;
                            const newPhases=[...customPhases];
                            const [moved]=newPhases.splice(dragIdx,1);
                            newPhases.splice(i,0,moved);
                            setCustomPhases(newPhases);
                            setDragIdx(null); setDragOverIdx(null);
                          }}
                          onDragEnd={()=>{setDragIdx(null);setDragOverIdx(null);}}
                          style={{
                            background:isDragging?`${pt.col}22`:isOver?`${pt.col}15`:SC.bg,
                            border:`1px solid ${isOver?pt.col:pt.col+"44"}`,
                            borderLeft:`3px solid ${pt.col}`,
                            borderRadius:8,padding:"10px 14px",cursor:"grab",
                            opacity:isDragging?0.5:1,transition:"all 0.15s",
                            display:"flex",alignItems:"center",gap:12}}>
                          {/* Drag handle */}
                          <span style={{fontSize:14,color:SC.subtle,cursor:"grab",userSelect:"none"}}>⠿</span>
                          <span style={{fontSize:16}}>{pt.icon}</span>
                          {/* Label */}
                          <input value={ph.label} onChange={evt=>{
                              setCustomPhases(prev=>prev.map((ph_item,j)=>j===i?{...ph_item,label:evt.target.value}:ph_item));
                            }}
                            style={{background:"transparent",border:"none",color:pt.col,fontSize:11,
                              fontWeight:700,fontFamily:"'DM Mono',monospace",outline:"none",width:120}}/>
                          {/* Phase-specific fields */}
                          <div style={{display:"flex",gap:10,flex:1,flexWrap:"wrap"}}>
                            {pt.fields.map(field=>{
                              const fieldLabels={duration:"Duration (s)",altitude:"Altitude (m)",distance:"Distance (km)",
                                angle:"Angle (°)",speed:"Speed (m/s)",windSpeed:"Wind (m/s)"};
                              return(
                                <div key={field} style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{fieldLabels[field]}:</span>
                                  <input type="number" value={ph[field]||0}
                                    onChange={evt=>{
                                      const v=parseFloat(evt.target.value)||0;
                                      setCustomPhases(prev=>prev.map((ph_item,j)=>j===i?{...ph_item,[field]:v}:ph_item));
                                    }}
                                    style={{width:60,background:SC.panel,border:`1px solid ${SC.border}`,
                                      borderRadius:4,color:SC.text,fontSize:11,padding:"3px 6px",
                                      fontFamily:"'DM Mono',monospace",outline:"none"}}
                                    onFocus={evt => evt.target.style.borderColor=pt.col}
                                    onBlur={evt => evt.target.style.borderColor=SC.border}/>
                                </div>
                              );
                            })}
                          </div>
                          {/* Delete */}
                          <button onClick={()=>setCustomPhases(prev=>prev.filter((_,j)=>j!==i))} type="button"
                            style={{background:"transparent",border:`1px solid ${SC.red}44`,borderRadius:4,
                              color:SC.red,fontSize:10,cursor:"pointer",padding:"3px 8px",fontFamily:"'DM Mono',monospace",flexShrink:0}}>
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    {customPhases.length===0&&(
                      <div style={{textAlign:"center",padding:"32px",color:SC.muted,fontFamily:"'DM Mono',monospace",fontSize:12}}>
                        No phases. Click a phase type above to add one.
                      </div>
                    )}
                  </div>
                  <div style={{marginTop:12,display:"flex",gap:8}}>
                    <button onClick={computeCustomMission} type="button"
                      style={{padding:"10px 24px",background:`linear-gradient(135deg,#065f46,#047857)`,
                        border:`1px solid #06d6a0`,borderRadius:6,color:"#6ee7b7",fontSize:12,
                        fontWeight:800,cursor:"pointer",fontFamily:"'DM Mono',monospace",
                        boxShadow:"0 0 16px #06d6a044"}}>
                      ▶ Compute Mission
                    </button>
                    <button onClick={()=>{setCustomPhases([
                        {id:uid2(),type:"hover", duration:30, altitude:15, label:"Takeoff Hover"},
                        {id:uid2(),type:"climb", distance:5,  angle:5,    label:"Climb"},
                        {id:uid2(),type:"cruise",distance:200,speed:67,   label:"Cruise"},
                        {id:uid2(),type:"descent",distance:4, angle:4,    label:"Descent"},
                        {id:uid2(),type:"hover", duration:30, altitude:15,label:"Landing Hover"},
                        {id:uid2(),type:"reserve",distance:40,speed:47,   label:"Reserve"},
                      ]);setMbResults(null);}} type="button"
                      style={{padding:"10px 16px",background:"transparent",border:`1px solid ${SC.border}`,
                        borderRadius:6,color:SC.muted,fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
                      ↺ Reset to Default
                    </button>
                  </div>
                </Panel>

                {/* Results */}
                {mbResults&&(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      <KPI label="Total Energy" value={mbResults.totalE} unit="kWh"
                        color={mbResults.totalE<=SR.PackkWh?SC.green:SC.red}
                        sub={`Pack: ${SR.PackkWh} kWh`}/>
                      <KPI label="Mission Time" value={`${(mbResults.totalT/60).toFixed(1)} min`} unit=""
                        color={SC.blue} sub={`${mbResults.totalT}s total`}/>
                      <KPI label="Total Range" value={U.dist(mbResults.totalRange)} unit={U.distU} color={SC.teal}/>
                      <KPI label="Final SoC" value={`${mbResults.finalSoC.toFixed(1)}%`} unit=""
                        color={mbResults.finalSoC>20?SC.green:mbResults.finalSoC>10?SC.amber:SC.red}
                        sub={mbResults.feasible?"✓ Feasible":"✗ Battery depleted"}/>
                    </div>

                    {/* Phase breakdown chart */}
                    <Panel title="Phase Power & Energy Breakdown" ht={280} onSave={true}>
                      <ResponsiveContainer width="100%" height={235}>
                        <BarChart data={mbResults.phases.map(ph=>({
                            name:ph.label,power:ph.power,energy:ph.energy,
                            fill:PHASE_TYPES[ph.type]?.col||SC.muted}))}
                          margin={{top:5,right:20,left:5,bottom:20}}>
                          <CartesianGrid {...chartGrid()}/>
                          <XAxis dataKey="name" tick={{fontSize:9,fill:SC.muted}} angle={-20} textAnchor="end" {...chartAxis()}/>
                          <YAxis yAxisId="left" tick={{fontSize:10,fill:SC.amber}}
                            label={{value:`Power (${U.powerU})`,angle:-90,position:"insideLeft",fontSize:10,fill:SC.amber}} {...chartAxis()}/>
                          <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:SC.teal}}
                            label={{value:"Energy (kWh)",angle:90,position:"insideRight",fontSize:10,fill:SC.teal}} {...chartAxis()}/>
                          <Tooltip {...TTP} formatter={(v,n)=>n===`Power (${U.powerU})`||n==="Power (kW)"?[`${U.power(v)} ${U.powerU}`,`Power (${U.powerU})`]:[`${v} kWh`,n]}/>
                          <Legend iconSize={9} wrapperStyle={{fontSize:11}} {...chartLegend()}/>
                          <Bar isAnimationActive={false} yAxisId="left" dataKey="power" name={`Power (${U.powerU})`} radius={[3,3,0,0]} maxBarSize={30}>
                            {mbResults.phases.map((ph,i)=><Cell key={i} fill={PHASE_TYPES[ph.type]?.col||SC.muted}/>)}
                          </Bar>
                          <Bar isAnimationActive={false} yAxisId="right" dataKey="energy" name="Energy (kWh)" fill={SC.teal} radius={[3,3,0,0]} maxBarSize={30} opacity={0.7}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </Panel>

                    {/* Phase detail table */}
                    <Panel title="Phase-by-Phase Results">
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"'DM Mono',monospace"}}>
                          <thead><tr style={{background:SC.panel}}>
                            {["Phase","Type",`Power (${U.powerU})`,`Energy (kWh)`,"Time (s)",`Distance (${U.distU})`,"% Total E"].map(hdr=>(
                              <th key={hdr} style={{padding:"5px 8px",color:SC.muted,fontSize:9,fontWeight:600,textAlign:"right"}}>{hdr}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {mbResults.phases.map((ph,i)=>{
                              const col=PHASE_TYPES[ph.type]?.col||SC.muted;
                              return(
                                <tr key={i} style={{borderTop:`1px solid ${SC.border}`,background:i%2?SC.inset:SC.bg}}>
                                  <td style={{padding:"5px 8px",color:col,fontWeight:700}}>{ph.label}</td>
                                  <td style={{padding:"5px 8px",color:SC.muted,textAlign:"right"}}>{PHASE_TYPES[ph.type]?.icon} {PHASE_TYPES[ph.type]?.label}</td>
                                  <td style={{padding:"5px 8px",color:SC.amber,textAlign:"right"}}>{U.power(ph.power)}</td>
                                  <td style={{padding:"5px 8px",color:SC.teal,textAlign:"right"}}>{ph.energy}</td>
                                  <td style={{padding:"5px 8px",color:SC.blue,textAlign:"right"}}>{ph.time}</td>
                                  <td style={{padding:"5px 8px",color:SC.muted,textAlign:"right"}}>{U.dist(ph.distance/1000)}</td>
                                  <td style={{padding:"5px 8px",textAlign:"right"}}>
                                    <div style={{display:"inline-flex",alignItems:"center",gap:6}}>
                                      <div style={{width:36,height:4,background:SC.border,borderRadius:2}}>
                                        <div style={{width:`${(ph.energy/mbResults.totalE*100).toFixed(0)}%`,height:"100%",background:col,borderRadius:2}}/>
                                      </div>
                                      <span style={{color:col}}>{(ph.energy/mbResults.totalE*100).toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr style={{borderTop:`2px solid ${SC.border}`,background:SC.panel,fontWeight:700}}>
                              <td style={{padding:"6px 8px",color:SC.text}} colSpan={2}>TOTAL</td>
                              <td style={{padding:"6px 8px",color:SC.amber,textAlign:"right"}}>—</td>
                              <td style={{padding:"6px 8px",color:SC.teal,textAlign:"right"}}>{mbResults.totalE}</td>
                              <td style={{padding:"6px 8px",color:SC.blue,textAlign:"right"}}>{mbResults.totalT}</td>
                              <td style={{padding:"6px 8px",color:SC.muted,textAlign:"right"}}>{U.dist(mbResults.totalRange)}</td>
                              <td style={{padding:"6px 8px",color:SC.muted,textAlign:"right"}}>100%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </>
                )}
              </div>
            
  );
}
