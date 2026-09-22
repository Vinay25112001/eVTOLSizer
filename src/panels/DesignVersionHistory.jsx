import { useState } from "react";
import { SC } from "../lib/theme.js";
import { HISTORY_KEY, MAX_HISTORY, saveVersionToHistory } from "../lib/history.js";
import { KPI } from "../ui/primitives.jsx";
import { AuthModal } from "../AuthSystem";

export function DesignVersionHistory({ params, SR, SC, customAirfoil, onLoadVersion, user, onAuth, U }) {
  const [hist, setHist] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch{ return []; }
  });
  const [selected, setSelected] = useState(0);
  const [editNote, setEditNote] = useState(null);
  const [noteVal, setNoteVal] = useState('');
  const [showAuthModalDVH, setShowAuthModalDVH] = useState(false);

  const refresh = () => {
    try { setHist(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')); } catch{}
  };

  const [saveErr, setSaveErr] = useState(null);
  const saveNow = () => {
    const r = saveVersionToHistory(params, SR, customAirfoil);
    setSaveErr(r.ok ? null : r.error);
    refresh();
  };

  const loadVersion = (idx) => {
    const entry = hist[idx];
    if (entry) onLoadVersion(entry);
  };

  const deleteVersion = (idx) => {
    const h = [...hist];
    h.splice(idx, 1);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    setHist(h);
    setSelected(Math.min(selected, h.length-1));
  };

  const saveNote = (idx) => {
    const h = [...hist];
    h[idx] = {...h[idx], note: noteVal};
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    setHist(h);
    setEditNote(null);
  };

  const [confirmClearHist, setConfirmClearHist] = useState(false);

  const clearAll = () => { setConfirmClearHist(true); };
  const clearAllConfirmed = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHist([]); setSelected(0); setConfirmClearHist(false);
  };

  const uc = U || {mass:v=>+v.toFixed(1),massU:"kg",dist:v=>+v.toFixed(1),distU:"km",len:v=>+v.toFixed(2),lenU:"m"};
  const cur = hist[selected];

  const kpiDelta = (field, unit='', higher=true) => {
    if (hist.length < 2 || !cur) return null;
    const prev = hist[Math.min(selected+1, hist.length-1)];
    const d = Number(cur[field]) - Number(prev[field]);
    if (Math.abs(d) < 0.01) return null;
    const good = higher ? d > 0 : d < 0;
    return <span style={{fontSize:8, color:good?SC.green:SC.red, fontFamily:"'DM Mono',monospace"}}>
      {d>0?'+':''}{d.toFixed(1)}{unit}
    </span>;
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {/* Header controls */}
      <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
        <button onClick={()=>{
            if(!user){if(onAuth)setShowAuthModalDVH(true);return;}
            saveNow();
          }} type="button"
          style={{padding:'7px 18px', background:`linear-gradient(135deg,${SC.green},#16a34a)`,
            border:'none', borderRadius:6, color:'#fff', fontSize:11, fontWeight:800,
            cursor:'pointer', fontFamily:"'DM Mono',monospace",
            display:'flex',alignItems:'center',gap:5}}>
          {!user&&<span style={{fontSize:10}}>⚿</span>}Save Current Design
        </button>
        <span style={{fontSize:9, color:SC.muted, fontFamily:"'DM Mono',monospace"}}>
          {hist.length}/{MAX_HISTORY} versions stored locally
        </span>
        {hist.length > 0 && (
          <button onClick={clearAll} type="button"
            style={{marginLeft:'auto', padding:'5px 12px', background:'transparent',
              border:`1px solid ${SC.red}44`, borderRadius:5, color:SC.red,
              fontSize:9, cursor:'pointer', fontFamily:"'DM Mono',monospace"}}>
            Clear All
          </button>
        )}
      </div>

      {saveErr && (
        <div role="alert" style={{padding:'8px 12px', border:`1px solid ${SC.red}`, borderRadius:6,
          color:SC.red, fontSize:10, fontFamily:"'DM Mono',monospace"}}>
          NOT SAVED — {saveErr}. Delete old versions or use ••• → Download design file.
        </div>
      )}

      {hist.length === 0 ? (
        <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8,
          padding:'40px 20px', textAlign:'center', color:SC.muted,
          fontSize:11, fontFamily:"'DM Mono',monospace"}}>
          No versions saved yet. Click "Save Current Design" to start tracking history.
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:10}}>
          {/* Timeline list */}
          <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8,
            padding:10, maxHeight:420, overflowY:'auto'}}>
            <div style={{fontSize:9, color:SC.muted, fontFamily:"'DM Mono',monospace",
              letterSpacing:'0.1em', marginBottom:8}}>VERSION TIMELINE</div>

            {/* Scrubber */}
            {hist.length > 1 && (
              <div style={{marginBottom:10}}>
                <input type="range" min="0" max={hist.length-1} step="1" value={selected}
                  onChange={e=>setSelected(Number(e.target.value))}
                  style={{width:'100%', accentColor:SC.amber}}/>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:7, color:SC.subtle,
                  fontFamily:"'DM Mono',monospace"}}>
                  <span>Latest</span><span>Oldest</span>
                </div>
              </div>
            )}

            {hist.map((v, idx) => (
              <div key={v.id} onClick={()=>setSelected(idx)}
                style={{padding:'7px 9px', borderRadius:6, marginBottom:4, cursor:'pointer',
                  border:`1px solid ${idx===selected?SC.amber+'66':SC.border}`,
                  background:idx===selected?`${SC.amber}0d`:'transparent',
                  transition:'all 0.15s'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <span style={{fontSize:10, fontWeight:700, color:idx===selected?SC.amber:SC.text,
                    fontFamily:"'DM Mono',monospace"}}>{v.label}</span>
                  <span style={{fontSize:7, color:SC.subtle, fontFamily:"'DM Mono',monospace"}}>
                    {new Date(v.ts).toLocaleDateString()}
                  </span>
                </div>
                <div style={{fontSize:8, color:SC.muted, fontFamily:"'DM Mono',monospace", marginTop:2}}>
                  {uc.mass(v.MTOW)}{uc.massU} · {uc.dist(v.range)}{uc.distU} · b={uc.len(v.bWing)}{uc.lenU}
                </div>
                {v.note && (
                  <div style={{fontSize:8, color:SC.teal, fontFamily:"'DM Mono',monospace",
                    marginTop:2, fontStyle:'italic'}}>"{v.note}"</div>
                )}
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {cur && (
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {/* KPI cards */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6}}>
                {[
                  ['MTOW', uc.mass(cur.MTOW), uc.massU, false],
                  ['Range', uc.dist(cur.range), uc.distU, true],
                  ['Wingspan', uc.len(cur.bWing), uc.lenU, true],
                  ['Stat. Margin', cur.SM, '%', true],
                  ['Energy', cur.Etot, 'kWh', false],
                  ['Payload', uc.mass(cur.payload), uc.massU, true],
                ].map(([lbl, val, unit, higher])=>(
                  <div key={lbl} style={{background:SC.bg, border:`1px solid ${SC.border}`,
                    borderRadius:6, padding:'8px 10px'}}>
                    <div style={{fontSize:8, color:SC.muted, fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                    <div style={{fontSize:16, fontWeight:700, color:SC.amber,
                      fontFamily:"'DM Mono',monospace", lineHeight:1.2}}>{val}
                      <span style={{fontSize:8, color:SC.muted, marginLeft:2}}>{unit}</span>
                    </div>
                    {kpiDelta(lbl==='MTOW'?'MTOW':lbl==='Range'?'range':lbl==='Wingspan'?'bWing':lbl==='Stat. Margin'?'SM':lbl==='Energy'?'Etot':'payload', unit, higher)}
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8, padding:10}}>
                <div style={{fontSize:9, color:SC.muted, fontFamily:"'DM Mono',monospace",
                  marginBottom:6}}>DESIGN NOTES — {cur.label}</div>
                {editNote===selected ? (
                  <div style={{display:'flex', gap:6}}>
                    <input value={noteVal} onChange={e=>setNoteVal(e.target.value)}
                      placeholder="Add a note for this version..."
                      style={{flex:1, background:SC.bg, border:`1px solid ${SC.border}`, borderRadius:4,
                        color:SC.text, fontSize:10, padding:'5px 8px', fontFamily:"'DM Mono',monospace"}}/>
                    <button onClick={()=>saveNote(selected)} type="button"
                      style={{padding:'5px 12px', background:`${SC.green}22`, border:`1px solid ${SC.green}`,
                        borderRadius:4, color:SC.green, fontSize:9, cursor:'pointer', fontFamily:"'DM Mono',monospace"}}>
                      Save
                    </button>
                    <button onClick={()=>setEditNote(null)} type="button"
                      style={{padding:'5px 10px', background:'transparent', border:`1px solid ${SC.border}`,
                        borderRadius:4, color:SC.muted, fontSize:9, cursor:'pointer'}}>✕</button>
                  </div>
                ) : (
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontSize:10, color:cur.note?SC.text:SC.dim, fontFamily:"'DM Mono',monospace",
                      flex:1, fontStyle:cur.note?'normal':'italic'}}>
                      {cur.note || 'No note — click Edit to add one'}
                    </span>
                    <button onClick={()=>{setEditNote(selected);setNoteVal(cur.note||'');}} type="button"
                      style={{padding:'4px 10px', background:'transparent', border:`1px solid ${SC.border}`,
                        borderRadius:4, color:SC.muted, fontSize:8, cursor:'pointer', fontFamily:"'DM Mono',monospace"}}>
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{display:'flex', gap:8}}>
                <button onClick={()=>loadVersion(selected)} type="button"
                  style={{flex:1, padding:'9px', background:`linear-gradient(135deg,${SC.blue},#6366f1)`,
                    border:'none', borderRadius:6, color:'#fff', fontSize:11, fontWeight:800,
                    cursor:'pointer', fontFamily:"'DM Mono',monospace"}}>
                  ↩ Restore This Version
                </button>
                <button onClick={()=>deleteVersion(selected)} type="button"
                  style={{padding:'9px 16px', background:'transparent',
                    border:`1px solid ${SC.red}44`, borderRadius:6, color:SC.red,
                    fontSize:11, cursor:'pointer', fontFamily:"'DM Mono',monospace"}}>
                  ×
                </button>
              </div>

              <div style={{fontSize:8, color:SC.subtle, fontFamily:"'DM Mono',monospace", textAlign:'center'}}>
                Saved {new Date(cur.ts).toLocaleString()} · {cur.label}
              </div>
            </div>
          )}
        </div>
      )}
      {showAuthModalDVH&&<AuthModal onClose={()=>setShowAuthModalDVH(false)} onAuth={(session)=>{setShowAuthModalDVH(false);if(onAuth)onAuth(session);}}/>}
      {confirmClearHist&&(
        <div style={{position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,0.65)",
          backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:SC.panel,border:`1px solid #ef444466`,borderRadius:12,
            padding:"28px 32px",width:360,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
            
            <div style={{fontSize:15,fontWeight:700,color:SC.text,textAlign:"center",marginBottom:8}}>Clear all version history?</div>
            <div style={{fontSize:11,color:SC.muted,fontFamily:"'DM Mono',monospace",textAlign:"center",marginBottom:24,lineHeight:1.6}}>All saved design snapshots will be permanently deleted. This cannot be undone.</div>
            <div style={{display:"flex",gap:10}}>
              <button type="button" onClick={()=>setConfirmClearHist(false)}
                style={{flex:1,padding:"10px 0",background:"transparent",border:`1px solid ${SC.border}`,borderRadius:6,color:SC.muted,fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:600}}>Cancel</button>
              <button type="button" onClick={clearAllConfirmed}
                style={{flex:1,padding:"10px 0",background:"#ef444422",border:"1px solid #ef4444",borderRadius:6,color:SC.warning,fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:700}}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FEATURE 12 — PUBLIC DESIGN GALLERY
   Showcases community designs with inline SVG thumbnails.
   Filterable by MTOW / range / config type.
   ════════════════════════════════════════════════════════════════════════ */
