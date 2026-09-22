import { Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";
import { CrossSectionPreview } from "../panels/CrossSectionPreview.jsx";
import { CFDChecklist } from "../panels/CFDChecklist.jsx";
import { capabilitiesFor } from "../engine/configuration.js";
import { AuthGate, addNotif } from "../AuthSystem";
import { generateVSP3File } from "../export/vsp3.js";
import { aircraftGeometry } from "../engine/geometry.js";
import { Aircraft3D } from "../panels/Aircraft3D.jsx";
import { Aircraft3DView } from "../panels/Aircraft3DView.jsx";

/* Tab 15 — OpenVSP.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function OpenVSPTab(ctx) {
  const { SR, U, handleAuth, params, tab, user } = ctx;
  /* Same capability source the tab visibility and the tail tab use, so this
     table cannot disagree with them about what the aircraft has. */
  const vspCap = capabilitiesFor(params.configType, params.nPropHover);
  const deg = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) + "\u00b0" : "\u2014");
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* ══ LIVE LAYOUT VIEW ══════════════════════════════════
                    Added 2026-08-30. This tab could previously only hand the
                    user a .vsp3 and tell them to open OpenVSP. The layout the
                    engine has actually sized is now visible here, in the same
                    four views OpenVSP presents, and it switches with the
                    selected configuration because it is drawn from
                    engine/geometry.js — the same module the export uses. */}
                {/* INTERACTIVE, not four fixed projections. The model turns
                    under the mouse the way NASA's own RAVEN viewer does, and it
                    redraws on every parameter change because the geometry comes
                    from engine/geometry.js — the same module the export uses,
                    laid out on NASA's measured RAVEN/SWFT station fractions. */}
                <Panel title="Aircraft layout — interactive 3D" onSave={false}>
                  <Aircraft3DView params={params} SR={SR}/>
                </Panel>
                {/* The old orthographic four-up is kept: it is the view an
                    engineer checks proportions in, and it prints cleanly. */}
                <Panel title="Orthographic four-up (Top / Front / Side / Iso)" onSave={false}>
                  <Aircraft3D params={params} SR={SR}/>
                </Panel>
                {/* Header banner */}
                <div style={{background:SC.panel,
                  border:`1px solid ${SC.border}`,borderRadius:8,padding:"16px 20px",
                  display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.15em",marginBottom:4}}>GEOMETRY EXPORT</div>
                    <div style={{fontSize:22,fontWeight:800,color:SC.amber,letterSpacing:"-0.03em"}}>OpenVSP Export</div>
                    <div style={{fontSize:10,color:SC.muted,marginTop:2,fontFamily:"'DM Mono',monospace"}}>
                      Download the .vsp3 file and open directly in OpenVSP 3.28+
                    </div>
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    {/* ── .vsp3 download button ── */}
                    <AuthGate user={user} onAuth={handleAuth}>
                    <button
                      onClick={()=>{
                        const xml=generateVSP3File(params,SR);
                        const blob=new Blob([xml],{type:"application/xml"});
                        const url=URL.createObjectURL(blob);
                        const a=document.createElement("a");
                        a.href=url; a.download="Trail1_eVTOL.vsp3"; a.click();
                        URL.revokeObjectURL(url);
                        if(user) addNotif(user.id,{title:"VSP3 File Downloaded",body:`Trail1_eVTOL.vsp3 — MTOW=${SR.MTOW} kg, b=${SR.bWing} m`,type:"success"});
                      }}
                      style={{padding:"10px 20px",background:`linear-gradient(135deg,#3b82f6,#6366f1)`,
                        border:"none",borderRadius:6,color:"#ffffff",fontSize:12,fontWeight:800,
                        cursor:"pointer",letterSpacing:"0.04em",fontFamily:"'DM Mono',monospace",
                        boxShadow:"0 0 18px #3b82f644",display:"flex",alignItems:"center",gap:6}}>
                      {!user&&<span>⚿</span>}↓ .vsp3
                    </button>
                    </AuthGate>
                  </div>
                </div>

                {/* Geometry summary cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {[
                    ["Fuselage","Body","L "+U.len(params.fusLen)+" "+U.lenU+"  Ø "+U.len(params.fusDiam)+" "+U.lenU,"#64748b"],
                    ["Main Wing","WING_GEOM","S="+U.area(SR.Swing)+" "+U.areaU+"  b="+U.len(SR.bWing)+" "+U.lenU,"#3b82f6"],
                    ["V-Tail","WING_GEOM","Γ="+params.vtGamma+"°  S="+U.area(SR.Svt_total)+" "+U.areaU,"#8b5cf6"],
                    ["Hover Rotors","PROP_GEOM × "+params.nPropHover,"D="+U.len(SR.Drotor)+" "+U.lenU+"  "+SR.Nbld+" blades","#22c55e"],
                    ["CG + NP","Markers","CG="+U.len(SR.xCGtotal)+U.lenU+"  NP="+U.len(SR.xNP)+U.lenU,"#f59e0b"],
                  ].map(([title,type,detail,col])=>(
                    <div key={title} style={{background:SC.panel,border:`1px solid ${col}33`,
                      borderLeft:`3px solid ${col}`,borderRadius:6,padding:"10px 12px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace",marginBottom:3}}>{title}</div>
                      <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>{type}</div>
                      <div style={{fontSize:9,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{detail}</div>
                    </div>
                  ))}
                </div>

                {/* Two-column: geometry table + coordinate diagram */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Geometry Placement — OpenVSP Coordinates (X: nose→tail, Y: port→stbd, Z: up)">
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"'DM Mono',monospace"}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${SC.border}`}}>
                          {["Component",`x_LE (${U.lenU})`,`y (${U.lenU})`,`z (${U.lenU})`,"Dihedral"].map(hdr=>(
                            <th key={hdr} style={{textAlign:"left",padding:"3px 6px",fontSize:8,color:SC.muted,
                              textTransform:"uppercase",letterSpacing:"0.08em"}}>{hdr}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(()=>{
                          /* ── THIS TABLE ASSUMED A WING, AND CRASHED WITHOUT ONE ──
                             For a ROTOR-BORNE layout (multicopter, side-by-side) the
                             engine correctly returns NULL for every wing, tail and
                             longitudinal-stability quantity — xACwing, Cr_, MAC_vt,
                             lv, xNP, SM — because none of them exist on an aircraft
                             with no wing. This block called .toFixed() on all of them
                             unconditionally, threw "Cannot read properties of null",
                             and took the ENTIRE OpenVSP tab down with it: the throw
                             happens during render, so the user saw a blank tab with
                             no error at all.

                             Same defect class as the exporter, which also assumed a
                             wing. The layout now comes from engine/geometry.js — the
                             same resolved geometry the 3D view and the .vsp3 export
                             use — so the table describes whatever aircraft is
                             actually selected. */
                          const geo=aircraftGeometry(params,SR);
                          const f3=(v)=>(Number.isFinite(v)?v.toFixed(3):"—");
                          const rows=[["Fuselage","0.000","0.000","0.000","0°"]];
                          for(const b of geo.bodies){
                            if(b.kind==="wing")
                              rows.push(["Main Wing",f3(b.x),"0.000 (root)",f3(b.z),"2° (low-wing)"]);
                            else if(b.kind==="vtail")
                              rows.push(["V-Tail",f3(b.x),"0.000 (root)",f3(b.z),
                                (params.vtGamma??45)+"° (panel)"]);
                            else if(b.kind==="boom")
                              rows.push(["Boom / arm",f3(b.x0),(b.y>=0?"+":"")+f3(b.y),f3(b.z),"—"]);
                            else if(b.kind==="pusher")
                              rows.push(["Cruise pusher",f3(b.x),f3(b.y),f3(b.z),"—"]);
                            /* Sponsons and nacelles arrived with the NASA
                               RAVEN-derived layout; listing them keeps this
                               table a description of the whole aircraft rather
                               than of the parts that existed when it was written. */
                            else if(b.kind==="sponson")
                              rows.push([b.label||"Sponson",f3(b.x0),(b.y>=0?"+":"")+f3(b.y),f3(b.z),"—"]);
                          }
                          const rotors=geo.bodies.filter(b=>b.kind==="rotor");
                          rotors.forEach((b,i)=>rows.push([
                            `Rotor ${i+1}${b.tilting?" (tilting)":b.stopped?" (stops in cruise)":""}`,
                            f3(b.x),(b.y>=0?"+":"")+f3(b.y),f3(b.z),"—"]));
                          /* CG always exists; NP and static margin only on a winged
                             aircraft — a rotor-borne one has no neutral point. */
                          rows.push(["CG Marker",f3(SR.xCGtotal),"0","fD×0.55","—"]);
                          if(Number.isFinite(SR.xNP))
                            rows.push(["NP Marker",f3(SR.xNP),"0","fD×0.65","—"]);
                          return rows.map((rowItem,i)=>(
                            <tr key={i} style={{background:i%2===0?SC.bg:"transparent",
                              borderBottom:`1px solid ${SC.border}22`}}>
                              {rowItem.map((cell,j)=>(
                                <td key={j} style={{padding:"4px 6px",
                                  color:j===0?SC.amber:SC.text,
                                  fontSize:j===0?10:9}}>{cell}</td>
                              ))}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </Panel>

                  <Panel title="Parent–Child Tree & Design Values">
                    {/* Tree view */}
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.8}}>
                      {[
                        {indent:0,icon:"",label:"Fuselage (FUSELAGE_GEOM)",detail:`L=${params.fusLen}m  Ø=${params.fusDiam}m`,col:"#94a3b8"},
                        {indent:1,icon:"",label:"Main Wing (WING_GEOM)",detail:`b=${SR.bWing}m  S=${SR.Swing}m²  AR=${params.AR}  λ=${params.taper}`,col:SC.blue},
                        {indent:1,icon:"",label:"V-Tail (WING_GEOM · XZ sym)",detail:`Γ=${params.vtGamma}°  S_panel=${SR.Svt_panel}m²  AR=${params.vtAR}`,col:"#8b5cf6"},
                        {indent:1,icon:"",label:"CG Marker (FUSELAGE_GEOM)",detail:`x=${SR.xCGtotal}m  ${Number.isFinite(SR.SM)?`SM=${(SR.SM*100).toFixed(1)}% MAC`:"no wing — static margin not defined"}`,col:SC.green},
                        {indent:1,icon:"",label:"NP Marker (FUSELAGE_GEOM)",detail:`x=${SR.xNP}m from nose`,col:SC.teal},
                        ...Array.from({length:Math.floor(params.nPropHover/2)},(_,i)=>({
                          indent:1,icon:"",
                          label:`Rotor pair ${i} (PROP_GEOM × 2)`,
                          detail:`D=${SR.Drotor}m  ${SR.Nbld||3} blades${Number.isFinite(SR.bWing)&&SR.bWing>0?`  @y=±${((SR.bWing/2)*(i+0.5)/Math.max(1,Math.floor(params.nPropHover/2))).toFixed(2)}m`:" (rotor-borne layout)"}`,
                          col:SC.amber,
                        })),
                      ].map((node_item,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:4,
                          paddingLeft:node_item.indent*18,paddingTop:1,paddingBottom:1}}>
                          <span style={{color:SC.subtle,flexShrink:0}}>{node_item.indent>0?"└ ":""}</span>
                          <span style={{flexShrink:0}}>{node_item.icon}</span>
                          <div>
                            <span style={{color:node_item.col,fontWeight:600}}>{node_item.label}</span>
                            <div style={{fontSize:8,color:SC.muted,marginTop:1}}>{node_item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                {/* Airfoil / tail note + key design values table */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Design Values Written to Script">
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                      {/* ── ONLY WHAT THIS LAYOUT ACTUALLY HAS ──────────────────
                          This table is titled "Design Values Written to Script"
                          and listed a wing and a V-tail for every layout. On the
                          multicopter and side-by-side that meant "Wing half-span
                          0 m", "Wing root chord — m" and a literal "null°" for a
                          sweep that does not exist, describing parts the exporter
                          does not write. The static-margin row already carried an
                          "n/a — no wing" guard, so the question had been noticed
                          and answered in one row out of sixteen.
                          Rows are now built from the same capabilitiesFor the tab
                          visibility and the tail tab use, and the degrees are
                          formatted rather than string-concatenated -- `SR.sweep +
                          "°"` is what produced "null°". */}
                      {[
                        ["MTOW",`${U.mass(SR.MTOW)} ${U.massU}`],
                        ...(vspCap.hasWing !== false ? [
                          ["Wing LE (from nose)",`${U.len(SR.xACwing-0.25*SR.Cr_)} ${U.lenU}`],
                          ["Wing root chord",`${U.len(SR.Cr_)} ${U.lenU}`],
                          ["Wing tip chord",`${U.len(SR.Ct_)} ${U.lenU}`],
                          ["Wing half-span",`${U.len(SR.bWing/2)} ${U.lenU}`],
                          ["Wing sweep (LE)",deg(SR.sweep)],
                          ["Wing t/c",params.tc],
                        ] : [["Wing","n/a — rotor-borne, none written to the script"]]),
                        ...(Number(vspCap.nTail??0) > 0 ? [
                          ["V-tail root LE",`${U.len((SR.xACwing+SR.lv)-0.25*SR.MAC_vt)} ${U.lenU}`],
                          ["V-tail panel span",`${U.len(SR.bvt_panel)} ${U.lenU}`],
                          ["V-tail root chord",`${U.len(SR.Cr_vt)} ${U.lenU}`],
                          ["V-tail sweep (LE)",deg(SR.sweep_vt)],
                        ] : [["Tail","n/a — no tail surface on this layout"]]),
                        ["Rotor diameter",`${U.len(SR.Drotor)} ${U.lenU}`],
                        ["Blade chord",`${U.len(SR.ChordBl)} ${U.lenU}`],
                        ["CG from nose",`${U.len(SR.xCGtotal)} ${U.lenU}`],
                        ...(vspCap.hasWing !== false ? [
                          ["NP from nose",`${U.len(SR.xNP)} ${U.lenU}`],
                          ["Static margin",Number.isFinite(SR.SM)?(SR.SM*100).toFixed(1)+"% MAC":"not resolved"],
                        ] : []),
                      ].map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",
                          padding:"3px 6px",background:SC.bg,borderRadius:3}}>
                          <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                          <span style={{fontSize:9,color:SC.amber,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="How to Open the .vsp3 in OpenVSP">
                    {[
                      ["1","Download","Click the blue button to download Trail1_eVTOL.vsp3."],
                      ["2","Open VSP","Open OpenVSP 3.28+ (incl. 3.48.2)."],
                      ["3","Open File","File → Open → select Trail1_eVTOL.vsp3.  Geometry loads immediately."],
                      ["4","Verify","Check fuselage (5-station ellipse), wing (S="+U.area(SR.Swing)+" "+U.areaU+", b="+U.len(SR.bWing)+" "+U.lenU+"), V-tail (Γ="+params.vtGamma+"°), "+params.nPropHover+" hover rotors + 1 cruise prop."],
                      ["5","CG / NP","MassProperties block carries CG="+U.len(SR.xCGtotal)+" "+U.lenU+(Number.isFinite(SR.SM_vt||SR.SM)?", SM="+(((SR.SM_vt||SR.SM))*100).toFixed(1)+"% MAC":", no wing so no static margin")+".  View via Model → Edit → MassProperties."],
                      ["6","Rotors","Hover rotors: Y_Rot=90° (disk horizontal, thrust +Z).  Cruise prop: Y_Rot=0° (disk vertical, thrust +X pusher)."],
                      ["7","V-Tail","Two-panel V-tail: XZ symmetry + dihedral Γ. Ruddervators: symmetric=elevator, differential=rudder."],
                      ["8","Iterate","Change any slider → re-download → re-open. Each download regenerates from current sizing."],
                    ].map(([n,title,text])=>(
                      <div key={n} style={{display:"flex",gap:8,marginBottom:8}}>
                        <div style={{width:18,height:18,borderRadius:"50%",background:"#3b82f6",flexShrink:0,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:8,fontWeight:800,color:"#ffffff",fontFamily:"'DM Mono',monospace"}}>{n}</div>
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{title}</div>
                          <div style={{fontSize:9,color:SC.muted,marginTop:1,lineHeight:1.5}}>{text}</div>
                        </div>
                      </div>
                    ))}
                  </Panel>
                </div>

                {/* ── Feature 9: Cross-Section Preview ── */}
                <Panel title="Geometry Preview — Cross-Section &amp; Airfoil">
                  <CrossSectionPreview params={params} SR={SR} SC={SC} U={U}/>
                </Panel>

                {/* ── Feature 10: CFD-Ready Checklist ── */}
                <Panel title="CFD-Ready Export Checklist — VSPAERO Validation">
                  <CFDChecklist params={params} SR={SR} SC={SC} U={U}/>
                </Panel>

                {/* Bottom download buttons — two side by side */}
                <div style={{display:"flex",justifyContent:"center",gap:12,paddingTop:4,paddingBottom:8,flexWrap:"wrap"}}>
                  {/* .vsp3 download */}
                  <AuthGate user={user} onAuth={handleAuth}>
                  <button
                    onClick={()=>{
                      const xml=generateVSP3File(params,SR);
                      const blob=new Blob([xml],{type:"application/xml"});
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement("a");
                      a.href=url; a.download="Trail1_eVTOL.vsp3"; a.click();
                      URL.revokeObjectURL(url);
                      if(user) addNotif(user.id,{title:"VSP3 Downloaded",body:`Trail1_eVTOL.vsp3 — MTOW=${SR.MTOW} kg, b=${SR.bWing} m`,type:"success"});
                    }}
                    style={{padding:"12px 36px",background:`linear-gradient(135deg,#3b82f6,#6366f1)`,
                      border:"none",borderRadius:6,color:"#ffffff",fontSize:13,fontWeight:800,
                      cursor:"pointer",letterSpacing:"0.06em",fontFamily:"'DM Mono',monospace",
                      boxShadow:"0 0 28px #3b82f644",display:"flex",alignItems:"center",gap:8}}>
                    {!user&&<span>⚿</span>}↓  Download Trail1_eVTOL.vsp3
                  </button>
                  </AuthGate>
                </div>
              </div>
            
  );
}
