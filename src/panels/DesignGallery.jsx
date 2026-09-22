import { makeDesignRecord, embedRecord } from "../lib/designfile.js";
import { useState, useEffect } from "react";
import { SC } from "../lib/theme.js";
import { AuthModal } from "../AuthSystem";

export function DesignGallery({ SC, onLoadDesign, SR, params, customAirfoil, user, onAuth, U }) {
  // Unit conversion fallback
  const uc = U || {mass:v=>+v.toFixed(1),massU:"kg",dist:v=>+v.toFixed(1),distU:"km",len:v=>+v.toFixed(2),lenU:"m"};
  // ── Supabase config (same project as auth/chat) ──────────────────────
  const SB_URL = import.meta.env.VITE_SUPABASE_URL;
  const SB_KEY = import.meta.env.VITE_SUPABASE_KEY;
  const SB_HDR = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  const TABLE  = "community_gallery";

  const [filter,         setFilter]         = useState({mtow:'all', range:'all', sort:'mtow'});
  const [expanded,       setExpanded]        = useState(null);
  const [dbDesigns,      setDbDesigns]       = useState([]);   // rows from Supabase
  const [loading,        setLoading]         = useState(true);
  const [showShareModal, setShowShareModal]  = useState(false);
  const [shareName,      setShareName]       = useState('');
  const [shareMsg,       setShareMsg]        = useState('');
  const [editingId,      setEditingId]       = useState(null);
  const [editName,       setEditName]        = useState('');
  const [saving,         setSaving]          = useState(false);
  const [showAuthModalDG, setShowAuthModalDG] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // in-app delete confirm

  // ── Owner identity: email if logged in, stable guest token otherwise ─
  const ownerToken = user?.email || (() => {
    let t = localStorage.getItem('evtol_owner_token');
    if (!t) { t = 'guest_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('evtol_owner_token', t); }
    return t;
  })();

  // ── Fetch all community designs from Supabase ─────────────────────────
  const fetchDesigns = () => {
    setLoading(true);
    fetch(`${SB_URL}/rest/v1/${TABLE}?order=created_at.desc&limit=100`, { headers: SB_HDR })
      .then(r => r.json())
      .then(rows => { setDbDesigns(Array.isArray(rows) ? rows : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchDesigns(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fixed seed: always shown, cannot be deleted ───────────────────────
  const SEED = [{
    id: 'seed_0', name: 'My MATLAB-MBSE Project',
    author: 'Wright State University', config: 'Lift+Cruise',
    mtow: 2969, range_km: 185.8, bwing: 13.5, n_prop: 6, drotor: 3.0,
    payload: 455, sm: 14.0, etot: 192,
    tags: ['Thesis', 'WSU'], color: '#f59e0b', owner_token: '__seed__',
    params: JSON.stringify({
      payload:455, range:185.8, vCruise:67, cruiseAlt:1000, rateOfClimb:5.08, climbAngle:5,
      reserveMinutes:21, hoverHeight:15.24, LD:15, climbLDPenalty:0.13, nPropHover:6,
      propDiam:3.0, etaHov:0.63, etaSys:0.765, etaBat:0.90, sedCell:275, spBattery:1.0,
      socMin:0.20, cRateDerate:0.0, ewf:0.52, fusLen:7.2,
    }),
  }];

  // Helper to normalise both seed (camelCase) and DB rows (snake_case) to same shape
  const norm = (d) => ({
    id:      d.id,
    name:    d.name,
    author:  d.author || 'Community',
    config:  d.config || 'Lift+Cruise',
    MTOW:    d.mtow   || d.MTOW   || 0,
    range:   d.range_km || d.range || 0,
    bWing:   d.bwing  || d.bWing  || 0,
    nProp:   d.n_prop || d.nProp  || 6,
    Drotor:  d.drotor || d.Drotor || 3,
    payload: d.payload || 0,
    SM:      d.sm     || d.SM     || 0,
    Etot:    d.etot   || d.Etot   || 0,
    tags:    (() => { try { return Array.isArray(d.tags) ? d.tags : JSON.parse(d.tags||'[]'); } catch { return []; } })(),
    color:   d.color  || '#22c55e',
    owner:   d.owner_token || '__seed__',
    params:  (() => { try { return typeof d.params==='object'&&d.params!==null ? d.params : JSON.parse(d.params||'{}'); } catch { return {}; } })(),
  });

  // Production-clean filter: accept only structurally valid design records.
  // A valid record has a non-null id, a non-empty name, and a positive MTOW.
  // No personal identifier exclusions — data quality is enforced on schema, not here.
  const filteredDbDesigns = dbDesigns.filter(d =>
    d != null &&
    d.id != null &&
    typeof d.name === 'string' && d.name.trim().length > 0 &&
    (d.mtow || d.MTOW || 0) > 0
  );
  const ALL      = [...SEED, ...filteredDbDesigns].map(norm);
  const isOwner  = (d) => d.owner !== '__seed__' && d.owner === ownerToken;

  const filtered = ALL.filter(d => {
    if (filter.mtow==='light'  && d.MTOW > 1000) return false;
    if (filter.mtow==='medium' && (d.MTOW<=1000||d.MTOW>3500)) return false;
    if (filter.mtow==='heavy'  && d.MTOW <= 3500) return false;
    if (filter.range==='short' && d.range > 80)  return false;
    if (filter.range==='medium'&& (d.range<=80||d.range>180)) return false;
    if (filter.range==='long'  && d.range <= 180) return false;
    return true;
  }).sort((a,b) => filter.sort==='mtow' ? a.MTOW-b.MTOW : filter.sort==='range' ? b.range-a.range : b.payload-a.payload);

  const sel = filtered.find(d => d.id === expanded);

  // ── Publish new design ────────────────────────────────────────────────
  const handleShare = async () => {
    if (!shareName.trim()) { setShareMsg('⚠ Please enter a name for your design.'); return; }
    if (!SR)               { setShareMsg('⚠ Run the sizing first — no results yet.'); return; }
    setSaving(true);
    const row = {
      name:        shareName.trim(),
      author:      user?.email || 'Community',
      config:      'Lift+Cruise',
      mtow:        SR.MTOW,
      range_km:    params?.range || 0,
      bwing:       +(SR.bWing||0).toFixed(1),
      n_prop:      params?.nPropHover || 6,
      drotor:      params?.propDiam   || 3,
      payload:     params?.payload    || 0,
      sm:          +(SR.SM*100).toFixed(1),
      etot:        +(SR.Etot||0).toFixed(1),
      tags:        JSON.stringify(['Community', `${params?.nPropHover||6}-rotor`]),
      color:       '#22c55e',
      owner_token: ownerToken,
      params:      JSON.stringify(embedRecord(makeDesignRecord({params, customAirfoil, name: shareName.trim()}))),
    };
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...SB_HDR, "Prefer": "return=minimal" },
        body: JSON.stringify(row),
      });
      if (r.ok) {
        setShareName(''); setShowShareModal(false); setShareMsg('');
        fetchDesigns();   // refresh grid
      } else {
        const txt = await r.text();
        setShareMsg(`⚠ Save failed: ${txt.slice(0,120)}`);
      }
    } catch (e) { setShareMsg(`⚠ Network error: ${e.message}`); }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await fetch(`${SB_URL}/rest/v1/${TABLE}?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
    setExpanded(null); fetchDesigns();
  };

  // ── Rename ────────────────────────────────────────────────────────────
  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    await fetch(`${SB_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...SB_HDR, "Prefer": "return=minimal" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null); fetchDesigns();
  };

  // ── Update design with current results ───────────────────────────────
  const handleUpdateDesign = async (id) => {
    if (!SR) return;
    await fetch(`${SB_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...SB_HDR, "Prefer": "return=minimal" },
      body: JSON.stringify({
        mtow:     SR.MTOW,
        range_km: params?.range    || 0,
        bwing:    +(SR.bWing||0).toFixed(1),
        payload:  params?.payload  || 0,
        sm:       +(SR.SM*100).toFixed(1),
        etot:     +(SR.Etot||0).toFixed(1),
        params:   JSON.stringify(embedRecord(makeDesignRecord({params, customAirfoil}))),
      }),
    });
    setExpanded(null); fetchDesigns();
  };

  // ── SVG thumbnail ─────────────────────────────────────────────────────
  const AircraftThumb = ({ d, w=160, h=120 }) => {
    const prms = typeof d.params==='object' ? d.params : {};
    const fL = prms.fusLen || 6.5;
    const sc = Math.min(w,h) / ((d.bWing||10) + 2);
    const cx=w/2, cy=h/2;
    const fuseW=fL*sc*0.08, fuseH=fL*sc*0.55;
    const wingSpan=(d.bWing||10)*sc*0.45, wingC=12;
    const rotR=(d.Drotor||2)*sc*0.35;
    const yBoom=(fL*0.13+(d.Drotor||2)*0.5+0.2)*sc*0.45;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
        <ellipse cx={cx} cy={cy} rx={fuseW} ry={fuseH} fill={`${d.color}22`} stroke={d.color} strokeWidth="1.5"/>
        <rect x={cx-wingSpan} y={cy-wingC/2} width={wingSpan*2} height={wingC}
          fill={`${d.color}33`} stroke={d.color} strokeWidth="1" rx="2"/>
        {/* LPC/TR 6-rotor layout:
            - 2 wingtip rotors (one at each wing tip)
            - 4 inboard rotors parallel to fuselage (2 per side: one fore, one aft of wing) */}
        {(()=>{
          const tipX = cx + wingSpan * 0.92;
          const inbX = cx + wingSpan * 0.52;
          const fwdY = cy - fuseH * 0.22;
          const aftY = cy + fuseH * 0.22;
          const tipY = cy;
          const rPositions = [
            { rcx: cx - wingSpan * 0.92, rcy: tipY },
            { rcx: cx + wingSpan * 0.92, rcy: tipY },
            { rcx: cx - wingSpan * 0.52, rcy: fwdY },
            { rcx: cx + wingSpan * 0.52, rcy: fwdY },
            { rcx: cx - wingSpan * 0.52, rcy: aftY },
            { rcx: cx + wingSpan * 0.52, rcy: aftY },
          ];
          return rPositions.map((pos, i) => (
            <circle key={`r${i}`} cx={pos.rcx} cy={pos.rcy}
              r={rotR} fill={`${d.color}18`} stroke={d.color} strokeWidth="1" strokeDasharray="3,2"/>
          ));
        })()}
        <polyline points={`${cx},${cy+fuseH*0.85} ${cx-fuseW*2.5},${cy+fuseH*0.5} ${cx},${cy+fuseH*0.65}`}
          fill={`${d.color}22`} stroke={d.color} strokeWidth="1.2"/>
        <polyline points={`${cx},${cy+fuseH*0.85} ${cx+fuseW*2.5},${cy+fuseH*0.5} ${cx},${cy+fuseH*0.65}`}
          fill={`${d.color}22`} stroke={d.color} strokeWidth="1.2"/>
      </svg>
    );
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* ── Share button ──────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <button type="button" onClick={()=>{
            if(!user){setShowAuthModalDG(true);return;}
            setShowShareModal(v=>!v);setShareMsg('');
          }}
          style={{padding:'7px 18px',background:'linear-gradient(135deg,#22c55e,#16a34a)',
            border:'none',borderRadius:6,color:'#fff',fontSize:11,fontWeight:700,
            cursor:'pointer',fontFamily:"'DM Mono',monospace",
            display:'flex',alignItems:'center',gap:5}}>
          {!user&&<span style={{fontSize:10}}>⚿</span>}Share My Current Design
        </button>
        <button type="button" onClick={fetchDesigns}
          style={{padding:'7px 12px',background:'transparent',border:`1px solid ${SC.border}`,
            borderRadius:6,color:SC.muted,fontSize:10,cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
          ↻ Refresh
        </button>
        <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
          Designs are visible to everyone who opens this app.
        </span>
      </div>

      {/* ── Share / publish modal ─────────────────────────────────────── */}
      {showShareModal && (
        <div style={{background:SC.panel,border:`1px solid #22c55e66`,borderRadius:8,
          padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:12,fontWeight:700,color:'#22c55e',fontFamily:"'DM Mono',monospace"}}>
            Publish to Community Gallery
          </div>
          <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
            Your design will be stored in the cloud and visible to all users.
            Only you can edit or delete it.{' '}
            {SR && <span style={{color:SC.text}}>
              Current sizing: MTOW = {SR.MTOW} kg · E = {+(SR.Etot||0).toFixed(1)} kWh
            </span>}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input value={shareName} onChange={e=>setShareName(e.target.value)}
              placeholder="Give your design a name…"
              style={{flex:1,background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:5,
                color:SC.text,fontSize:11,padding:'7px 10px',
                fontFamily:"'DM Mono',monospace",outline:'none'}}
              onKeyDown={e=>e.key==='Enter'&&handleShare()}/>
            <button type="button" onClick={handleShare} disabled={saving}
              style={{padding:'7px 16px',background:saving?'#166534':'#22c55e',border:'none',
                borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,
                cursor:saving?'default':'pointer',fontFamily:"'DM Mono',monospace"}}>
              {saving ? '…Saving' : '✓ Publish'}
            </button>
            <button type="button" onClick={()=>setShowShareModal(false)}
              style={{padding:'7px 12px',background:SC.bg,border:`1px solid ${SC.border}`,
                borderRadius:5,color:SC.muted,fontSize:11,cursor:'pointer',
                fontFamily:"'DM Mono',monospace"}}>✕</button>
          </div>
          {shareMsg && <div style={{fontSize:9,color:'#f59e0b',fontFamily:"'DM Mono',monospace"}}>{shareMsg}</div>}
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',
        background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'10px 14px'}}>
        <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",whiteSpace:'nowrap'}}>FILTER:</span>
        {[
          ['mtow', [['all','All MTOW'],['light','Light (<1t)'],['medium','Medium (1–3.5t)'],['heavy','Heavy (>3.5t)']]],
          ['range',[['all','All Range'],['short','Short (<80km)'],['medium','Mid (80–180km)'],['long','Long (>180km)']]],
          ['sort', [['mtow','Sort: MTOW'],['range','Sort: Range'],['payload','Sort: Payload']]],
        ].map(([key,opts])=>(
          <select key={key} value={filter[key]} onChange={e=>setFilter(f=>({...f,[key]:e.target.value}))}
            style={{background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:5,color:SC.text,
              fontSize:9,padding:'4px 8px',fontFamily:"'DM Mono',monospace",cursor:'pointer'}}>
            {opts.map(([val,label])=><option key={val} value={val}>{label}</option>)}
          </select>
        ))}
        <span style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginLeft:'auto'}}>
          {loading ? '⟳ loading…' : `${filtered.length} design${filtered.length!==1?'s':''} shown`}
        </span>
      </div>

      {/* ── Cards grid ────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
        {filtered.map(d=>(
          <div key={d.id} onClick={()=>setExpanded(expanded===d.id?null:d.id)}
            style={{background:SC.panel,border:`1px solid ${expanded===d.id?d.color:SC.border}`,
              borderRadius:8,overflow:'hidden',cursor:'pointer',transition:'border-color 0.2s',
              boxShadow:expanded===d.id?`0 0 16px ${d.color}44`:'none',position:'relative'}}>
            {isOwner(d) && (
              <div style={{position:'absolute',top:6,right:6,fontSize:7,padding:'2px 6px',
                background:'#22c55e33',color:'#22c55e',borderRadius:3,
                fontFamily:"'DM Mono',monospace",fontWeight:700,zIndex:2}}>YOURS</div>
            )}
            <div style={{background:SC.bg,display:'flex',justifyContent:'center',alignItems:'center',padding:'8px 0'}}>
              <AircraftThumb d={d}/>
            </div>
            <div style={{padding:'10px 12px'}}>
              <div style={{fontSize:11,fontWeight:700,color:d.color,
                fontFamily:"'DM Mono',monospace",marginBottom:2}}>{d.name}</div>
              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>
                {d.author} · {d.config}
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {d.tags.map(t=>(
                  <span key={t} style={{fontSize:7,padding:'2px 6px',borderRadius:3,
                    background:`${d.color}22`,color:d.color,fontFamily:"'DM Mono',monospace"}}>{t}</span>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                {[['MTOW',uc.mass(d.MTOW)+uc.massU],['Range',uc.dist(d.range)+uc.distU],
                  ['Payload',uc.mass(d.payload)+uc.massU],['SM',d.SM+'%']].map(([l,v])=>(
                  <div key={l} style={{fontSize:8,fontFamily:"'DM Mono',monospace"}}>
                    <span style={{color:SC.muted}}>{l}: </span>
                    <span style={{color:SC.text,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Expanded detail panel ─────────────────────────────────────── */}
      {sel && (
        <div style={{background:SC.panel,border:`2px solid ${sel.color}`,borderRadius:10,
          padding:16,display:'grid',gridTemplateColumns:'auto 1fr',gap:16,alignItems:'start'}}>
          <AircraftThumb d={sel} w={180} h={140}/>
          <div>
            {/* Name — editable for owner */}
            {editingId===sel.id ? (
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <input value={editName} onChange={e=>setEditName(e.target.value)}
                  style={{flex:1,background:SC.bg,border:`1px solid ${sel.color}`,borderRadius:5,
                    color:SC.text,fontSize:14,fontWeight:700,padding:'4px 8px',
                    fontFamily:"'DM Mono',monospace",outline:'none'}}
                  onKeyDown={e=>e.key==='Enter'&&handleSaveEdit(sel.id)}/>
                <button type="button" onClick={()=>handleSaveEdit(sel.id)}
                  style={{padding:'4px 12px',background:'#22c55e',border:'none',borderRadius:4,
                    color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button type="button" onClick={()=>setEditingId(null)}
                  style={{padding:'4px 10px',background:SC.bg,border:`1px solid ${SC.border}`,
                    borderRadius:4,color:SC.muted,fontSize:10,cursor:'pointer'}}>Cancel</button>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <div style={{fontSize:16,fontWeight:800,color:sel.color,
                  fontFamily:"'DM Mono',monospace"}}>{sel.name}</div>
                {isOwner(sel) && (
                  <button type="button"
                    onClick={e=>{e.stopPropagation();setEditingId(sel.id);setEditName(sel.name);}}
                    style={{fontSize:10,padding:'2px 8px',background:'#22c55e22',
                      border:`1px solid #22c55e66`,borderRadius:4,color:'#22c55e',
                      cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>Rename</button>
                )}
              </div>
            )}
            <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:10}}>
              {sel.author} · {sel.config} · {sel.nProp} hover rotors · D={uc.len(sel.Drotor)}{uc.lenU}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
              {[['MTOW',uc.mass(sel.MTOW),uc.massU],['Range',uc.dist(sel.range),uc.distU],
                ['Payload',uc.mass(sel.payload),uc.massU],['Wingspan',uc.len(sel.bWing),uc.lenU],
                ['SM',sel.SM,'%'],['Energy',sel.Etot,'kWh'],
                ['Rotors',sel.nProp,''],['Rotor Ø',uc.len(sel.Drotor),uc.lenU]
              ].map(([l,v,u])=>(
                <div key={l} style={{background:SC.bg,border:`1px solid ${SC.border}`,
                  borderRadius:5,padding:'7px 9px'}}>
                  <div style={{fontSize:7,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700,color:sel.color,fontFamily:"'DM Mono',monospace"}}>
                    {v}<span style={{fontSize:8,color:SC.muted}}> {u}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button type="button" onClick={()=>{onLoadDesign&&onLoadDesign(sel.params,sel.name);setExpanded(null);}}
                style={{padding:'9px 24px',
                  background:`linear-gradient(135deg,${sel.color},${sel.color}aa)`,
                  border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:800,
                  cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
                ↩ Load This Design Into Sizing Tool
              </button>
              {isOwner(sel) && (
                <button type="button"
                  onClick={e=>{e.stopPropagation(); setConfirmDeleteId(sel.id);}}
                  style={{padding:'9px 16px',background:'#ef444422',border:`1px solid #ef4444`,
                    borderRadius:6,color:'#ef4444',fontSize:11,fontWeight:700,
                    cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
                  Delete
                </button>
              )}
              {isOwner(sel) && SR && (
                <button type="button"
                  onClick={e=>{e.stopPropagation();handleUpdateDesign(sel.id);}}
                  style={{padding:'9px 16px',background:'#3b82f622',border:`1px solid #3b82f6`,
                    borderRadius:6,color:'#3b82f6',fontSize:11,fontWeight:700,
                    cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
                  Update with Current Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showAuthModalDG&&<AuthModal onClose={()=>setShowAuthModalDG(false)} onAuth={(session)=>{setShowAuthModalDG(false);if(onAuth)onAuth(session);}}/>}

      {/* ── In-app delete confirmation ── */}
      {confirmDeleteId&&(
        <div style={{position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,0.65)",
          backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setConfirmDeleteId(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:SC.panel,border:`1px solid #ef444466`,borderRadius:12,
              padding:"28px 32px",width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
            
            <div style={{fontSize:15,fontWeight:700,color:SC.text,textAlign:"center",marginBottom:8}}>
              Delete from community gallery?
            </div>
            <div style={{fontSize:11,color:SC.muted,fontFamily:"'DM Mono',monospace",
              textAlign:"center",marginBottom:24,lineHeight:1.6}}>
              This will permanently remove the design from the public gallery. This cannot be undone.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button type="button" onClick={()=>setConfirmDeleteId(null)}
                style={{flex:1,padding:"10px 0",background:"transparent",
                  border:`1px solid ${SC.border}`,borderRadius:6,color:SC.muted,
                  fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:600}}>
                Cancel
              </button>
              <button type="button" onClick={()=>{handleDelete(confirmDeleteId);setConfirmDeleteId(null);}}
                style={{flex:1,padding:"10px 0",background:"#ef444422",
                  border:"1px solid #ef4444",borderRadius:6,color:SC.warning,
                  fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:700}}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
