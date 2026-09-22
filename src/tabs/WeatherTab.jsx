import { Panel } from "../ui/primitives.jsx";
import { SC } from "../lib/theme.js";

/* Tab 14 — Weather.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function WeatherTab(ctx) {
  const { SR, U, WX_PRESETS, fetchWeather, params, searchCity, setWxSearch, tab, wxData, wxError, wxLoading, wxResults, wxSearch } = ctx;
  return (

              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* Header */}
                <div style={{background:SC.panel,
                  border:`1px solid #3b82f644`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>REAL-TIME ATMOSPHERIC CONDITIONS — OPEN-METEO API</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:SC.blue}}>Weather</span> & Atmosphere Integration
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7}}>
                    Pulls real weather data for any city using <span style={{color:SC.blue,fontWeight:700}}>Open-Meteo API</span> (no API key, completely free).
                    Calculates how actual temperature, pressure, and density affect hover power, stall speed, cruise Mach, and range vs ISA standard conditions.
                  </div>
                </div>

                {/* Search */}
                <Panel title="Search Any City or Airport">
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    <input value={wxSearch} onChange={evt=>setWxSearch(evt.target.value)}
                      onKeyDown={evt => evt.key==="Enter"&&searchCity()}
                      placeholder="Type any city, e.g. Denver, Dubai, Singapore..."
                      style={{flex:1,background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:6,
                        color:SC.text,fontSize:12,padding:"9px 14px",fontFamily:"'DM Mono',monospace",outline:"none"}}
                      onFocus={evt => evt.target.style.borderColor=SC.blue}
                      onBlur={evt => evt.target.style.borderColor=SC.border}/>
                    <button onClick={searchCity} disabled={wxLoading} type="button"
                      style={{padding:"9px 20px",background:`linear-gradient(135deg,#1e3a5f,#1e40af)`,
                        border:`1px solid ${SC.blue}`,borderRadius:6,color:"#93c5fd",fontSize:12,
                        fontWeight:700,cursor:wxLoading?"not-allowed":"pointer",fontFamily:"'DM Mono',monospace"}}>
                      {wxLoading?"⟳ Fetching...":"Get Weather"}
                    </button>
                  </div>
                  {wxError&&(
                    <div style={{padding:"8px 12px",background:`${SC.red}15`,border:`1px solid ${SC.red}44`,
                      borderRadius:6,color:SC.red,fontSize:11,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
                      ✗ {wxError}
                    </div>
                  )}
                  {/* Quick presets */}
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,letterSpacing:"0.1em"}}>QUICK ACCESS — REFERENCE CITIES</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {WX_PRESETS.map(city=>(
                      <button key={city.name} onClick={()=>fetchWeather(city.lat,city.lon,city.name,city.alt)} type="button"
                        style={{padding:"5px 10px",background:SC.bg,border:`1px solid ${SC.border}`,
                          borderRadius:5,cursor:"pointer",fontSize:10,fontFamily:"'DM Mono',monospace",
                          color:SC.text,display:"flex",alignItems:"center",gap:4}}
                        onMouseEnter={evt => evt.currentTarget.style.borderColor=SC.blue}
                        onMouseLeave={evt => evt.currentTarget.style.borderColor=SC.border}>
                        <span>{city.flag}</span>{city.name}
                      </button>
                    ))}
                  </div>
                </Panel>

                {/* Weather data display */}
                {wxData&&(
                  <>
                    {/* Location & conditions */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <Panel title={`${wxData.cityName} — Current Conditions`}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {[
                            ["Temperature",`${wxData.T_C.toFixed(1)}°C`,wxData.T_C>35||wxData.T_C<-10?SC.red:SC.text],
                            ["Condition",wxData.wx_desc,SC.teal],
                            ["Pressure",`${wxData.P_hPa.toFixed(0)} hPa`,SC.muted],
                            ["Humidity",`${wxData.humidity}%`,SC.muted],
                            ["Wind Speed",`${(wxData.wind_ms*3.6).toFixed(1)} km/h (${wxData.wind_ms.toFixed(1)} m/s)`,SC.blue],
                            ["Wind Dir",`${wxData.wind_dir}°`,SC.muted],
                            ["Elevation",`${wxData.elevation.toFixed(0)} m AMSL`,SC.amber],
                            ["ΔT from ISA",`${wxData.deltaT>0?"+":""}${wxData.deltaT.toFixed(1)}°C`,wxData.deltaT>10||wxData.deltaT<-10?SC.red:SC.amber],
                          ].map(([lbl,val,col])=>(
                            <div key={lbl} style={{background:SC.bg,borderRadius:6,padding:"8px 10px",border:`1px solid ${SC.border}`}}>
                              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:2}}>{lbl}</div>
                              <div style={{fontSize:11,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </Panel>
                      <Panel title="Atmosphere vs ISA Standard">
                        {[
                          ["Air Density ρ",`${wxData.rho_actual} kg/m³`,"ISA SL: 1.225 kg/m³",wxData.rho_actual>1.15?SC.green:wxData.rho_actual>1.0?SC.amber:SC.red],
                          ["Density Ratio σ",`${wxData.sigma}`,wxData.sigma>0.95?"Near sea-level":wxData.sigma>0.85?"Moderate alt":"High alt",wxData.sigma>0.95?SC.green:wxData.sigma>0.85?SC.amber:SC.red],
                          ["Speed of Sound",`${wxData.a_actual.toFixed(1)} m/s`,`ISA SL: 340.3 m/s`,SC.teal],
                        ].map(([lbl,val,sub,col])=>(
                          <div key={lbl} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"10px 0",borderBottom:`1px solid ${SC.border}`}}>
                            <div>
                              <div style={{fontSize:11,color:SC.text,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{lbl}</div>
                              <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{sub}</div>
                            </div>
                            <div style={{fontSize:14,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                          </div>
                        ))}
                        {/* Density ratio bar */}
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>Density ratio σ = {wxData.sigma.toFixed(3)}</div>
                          <div style={{height:8,background:SC.border,borderRadius:4,overflow:"hidden"}}>
                            <div style={{width:`${wxData.sigma*100}%`,height:"100%",
                              background:`linear-gradient(90deg,${SC.red},${SC.amber},${SC.green})`,
                              borderRadius:4,transition:"width 0.5s"}}/>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:SC.subtle,marginTop:2,fontFamily:"'DM Mono',monospace"}}>
                            <span>0 (vacuum)</span><span>0.5</span><span>1.0 (ISA SL)</span>
                          </div>
                        </div>
                      </Panel>
                    </div>

                    {/* Performance impacts */}
                    {wxResults&&(
                      <Panel title={` Performance Impact vs ISA Standard — at ${wxData.cityName}`}>
                        <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:12,lineHeight:1.6}}>
                          Showing how <span style={{color:SC.blue}}>actual atmospheric conditions</span> change your aircraft's performance
                          vs the ISA standard day (T=15°C, P=1013.25 hPa, ρ=1.225 kg/m³) used in the main physics engine.
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
                          {[
                            {label:"Hover Power",isa:`${U.power(SR.Phov)} ${U.powerU}`,actual:`${U.power(wxResults.P_hov_wx)} ${U.powerU}`,delta:wxResults.P_hov_delta_pct,unit:U.powerU,
                              note:wxResults.P_hov_delta_pct>0?"Lower density → more power needed":"Denser air → less power needed"},
                            {label:"Cruise Power",isa:`${U.power(SR.Pcr)} ${U.powerU}`,actual:`${U.power(wxResults.P_cr_wx)} ${U.powerU}`,delta:wxResults.P_cr_delta_pct,unit:U.powerU,
                              note:wxResults.P_cr_delta_pct>0?"Less dense → higher cruise power":"Denser air → less cruise power"},
                            {label:"Stall Speed",isa:`${U.speed(SR.Vstall)} ${U.speedU}`,actual:`${U.speed(wxResults.V_stall_wx)} ${U.speedU}`,delta:((wxResults.V_stall_wx/SR.Vstall-1)*100),unit:U.speedU,
                              note:wxResults.V_stall_wx>SR.Vstall?"Higher stall speed — lower density":"Lower stall speed — higher density"},
                            {label:"Cruise Mach",isa:`M ${SR.Mach}`,actual:`M ${wxResults.Mach_wx}`,delta:((wxResults.Mach_wx/SR.Mach-1)*100),unit:"",
                              note:wxResults.Mach_wx>SR.Mach?"Warmer air → higher Mach for same TAS":"Cooler air → slightly higher Mach"},
                            {label:"Ground Speed",isa:`${U.speed(params.vCruise)} ${U.speedU} (no wind)`,actual:`${U.speed(wxResults.Vg)} ${U.speedU}`,delta:wxResults.range_wind_pct,unit:U.speedU,
                              note:wxResults.headwind_component>0?`Headwind ${U.speed(wxResults.headwind_component)} ${U.speedU} — reduces range`:`Tailwind ${U.speed(Math.abs(wxResults.headwind_component))} ${U.speedU} — boosts range`},
                            {label:"Air Density",isa:"1.225 kg/m³",actual:`${wxResults.rho_actual} kg/m³`,delta:((wxResults.rho_actual/1.225-1)*100),unit:"kg/m³",
                              note:`σ = ${wxResults.sigma} — ${wxResults.sigma>1?"denser than ISA":"less dense than ISA"}`},
                          ].map(({label,isa,actual,delta,note})=>(
                            <div key={label} style={{background:SC.bg,border:`1px solid ${Math.abs(delta)>10?SC.amber:SC.border}`,
                              borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${delta>5?SC.red:delta<-2?SC.green:SC.amber}`}}>
                              <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:6}}>{label}</div>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>ISA: {isa}</span>
                                <span style={{fontSize:10,color:SC.blue,fontFamily:"'DM Mono',monospace",fontWeight:700}}>→ {actual}</span>
                              </div>
                              <div style={{fontSize:13,fontWeight:800,fontFamily:"'DM Mono',monospace",
                                color:delta>5?SC.red:delta>2?SC.amber:delta<-2?SC.green:SC.muted,marginBottom:4}}>
                                {delta>0?"+":""}{delta.toFixed(1)}%
                              </div>
                              <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",lineHeight:1.4}}>{note}</div>
                            </div>
                          ))}
                        </div>

                        {/* Summary insight */}
                        <div style={{padding:"10px 14px",background:`${SC.blue}11`,border:`1px solid ${SC.blue}33`,
                          borderRadius:6,fontSize:11,color:SC.text,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                          <strong style={{color:SC.blue}}> Summary for {wxData.cityName}:</strong>{" "}
                          Air density is <strong style={{color:wxResults.sigma>1?SC.green:wxResults.sigma<0.9?SC.red:SC.amber}}>
                            {wxResults.sigma>1?"higher":"lower"} than ISA</strong> (σ={wxResults.sigma}).
                          Hover power is <strong style={{color:wxResults.P_hov_delta_pct>5?SC.red:SC.green}}>
                            {wxResults.P_hov_delta_pct>0?"+":""}{wxResults.P_hov_delta_pct.toFixed(1)}%</strong> vs standard day.
                          {Math.abs(wxResults.headwind_component)>2&&(
                            <span> Wind component: <strong style={{color:wxResults.headwind_component>0?SC.red:SC.green}}>
                              {wxResults.headwind_component>0?"headwind":"tailwind"} {U.speed(Math.abs(wxResults.headwind_component))} {U.speedU}
                            </strong> — range {wxResults.range_wind_pct>0?"increases":"decreases"} by{" "}
                            <strong>{Math.abs(wxResults.range_wind_pct).toFixed(1)}%</strong>.</span>
                          )}
                        </div>
                      </Panel>
                    )}
                  </>
                )}

                {!wxData&&!wxLoading&&(
                  <div style={{textAlign:"center",padding:"48px 0",color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                    
                    <div style={{fontSize:14,fontWeight:600,color:SC.text,marginBottom:8}}>No location selected</div>
                    <div style={{fontSize:12,color:SC.muted}}>Search a city or click a preset above</div>
                  </div>
                )}
              </div>
            
  );
}
