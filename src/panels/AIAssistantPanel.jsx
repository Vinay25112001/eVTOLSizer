import { useState, useEffect, useRef } from "react";
import { SC } from "../lib/theme.js";
import { runSizing } from "../engine.js";

import { GROQ_MODEL_FAST, describeModelError } from "../lib/ai-model.js";
export function AIAssistantPanel({ params, SR, SC, onParamChange, user }) {
  const [mode,     setMode]     = useState('design'); // 'design' | 'chat'
  // Keep a ref to the latest SR so async callbacks always read the current value
  const srRef = useRef(SR);
  useEffect(()=>{ srRef.current = SR; }, [SR]);

  // ── SUPABASE CONFIG ──
  const SB_URL = import.meta.env.VITE_SUPABASE_URL;
  const SB_KEY = import.meta.env.VITE_SUPABASE_KEY;
  const SB_HDR = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  const LS_KEY = 'evtol_ai_chat_local'; // localStorage key for instant refresh restore

  const DEFAULT_MSG = [{ role:'assistant', mode:'design',
    content:"I'm your AI Design Assistant.\n\nDescribe your eVTOL requirements and I'll run a deterministic optimizer to find the best feasible design, then inject it directly into all your app sliders.\n\nExample: \"4 passengers, 80km range, EASA SC-VTOL certification\"" }];

  // ── Read from localStorage immediately (synchronous — zero delay on refresh) ──
  const readLocalCache = () => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (!s) return null;
      return JSON.parse(s);
    } catch { return null; }
  };

  // Initialise from localStorage so chat is visible instantly on refresh
  const localCache = readLocalCache();
  const [messages,    setMessages]    = useState(localCache?.messages?.length ? localCache.messages : DEFAULT_MSG);
  const [chatHistory, setChatHistory] = useState(localCache?.chatHistory || []);
  const [input,    setInput]    = useState('');
  const [thinking, setThinking] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [iterCount,setIterCount]= useState(localCache?.iterCount || 0);
  const [chatLoaded, setChatLoaded]   = useState(false);
  const saveDebounce = useRef(null);
  const bottomRef = useRef(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);

  // ── Write to localStorage on every change (synchronous, instant) ──
  useEffect(()=>{
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        messages: messages.slice(-200),
        chatHistory: chatHistory.slice(-40),
        iterCount,
      }));
    } catch {}
  }, [messages, chatHistory, iterCount]);

  // ── LOAD chat from Supabase on mount (when user is logged in) ──
  // Supabase gives cross-device sync; localStorage gives instant refresh restore
  useEffect(()=>{
    if (!user?.id) { setChatLoaded(true); return; }
    const uid = user.id;
    fetch(`${SB_URL}/rest/v1/evtol_ai_chat?user_id=eq.${uid}&order=created_at.desc&limit=1`, { headers: SB_HDR })
      .then(r=>r.json())
      .then(rows=>{
        if (rows && rows[0] && rows[0].messages_json) {
          try {
            const saved = JSON.parse(rows[0].messages_json);
            // Only override localStorage if Supabase has more messages
            // (handles the case where user logged in from another device)
            if (saved.messages?.length > messages.length) {
              setMessages(saved.messages);
              setChatHistory(saved.chatHistory || []);
              setIterCount(saved.iterCount || 0);
            }
          } catch {}
        }
        setChatLoaded(true);
      })
      .catch(()=>setChatLoaded(true));
  }, [user?.id]);

  // ── SAVE chat to Supabase (debounced 2s after last change) ──
  const saveToSupabase = (msgs, hist, iters) => {
    if (!user?.id || !chatLoaded) return;
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      const payload = {
        user_id: user.id,
        messages_json: JSON.stringify({ messages: msgs.slice(-200), chatHistory: hist.slice(-40), iterCount: iters }),
        updated_at: new Date().toISOString(),
      };
      try {
        await fetch(`${SB_URL}/rest/v1/evtol_ai_chat`, {
          method: "POST",
          headers: { ...SB_HDR, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(payload),
        });
      } catch {}
    }, 2000);
  };

  useEffect(()=>{ if(chatLoaded) saveToSupabase(messages, chatHistory, iterCount); }, [messages]);
  useEffect(()=>{ if(chatLoaded) saveToSupabase(messages, chatHistory, iterCount); }, [chatHistory, iterCount]);

  // ── CLEAR chat history ──
  const clearChat = async () => {
    setMessages(DEFAULT_MSG);
    setChatHistory([]);
    setIterCount(0);
    // Clear localStorage immediately
    try { localStorage.removeItem(LS_KEY); } catch {}
    // Clear Supabase if logged in
    if (!user?.id) return;
    try {
      await fetch(`${SB_URL}/rest/v1/evtol_ai_chat?user_id=eq.${user.id}`, {
        method: "DELETE",
        headers: SB_HDR,
      });
    } catch {}
  };

  /* ── Hard clamp to physical bounds ── */
  const clamp = (v,lo,hi) => Math.min(hi, Math.max(lo, isNaN(+v)?lo:+v));
  const sanitize = (p) => ({
    ...p,
    range:      clamp(p.range,      20,  500),
    payload:    clamp(p.payload,    50,  800),
    vCruise:    clamp(p.vCruise,    30,  120),
    LD:         clamp(p.LD,          8,   22),
    AR:         clamp(p.AR,          5,   16),
    sedCell:    clamp(p.sedCell,   150,  400),
    nPropHover: [4,6,8,10,12].reduce((a,b)=>Math.abs(b-p.nPropHover)<Math.abs(a-p.nPropHover)?b:a),
    propDiam:   clamp(p.propDiam,   1.2,  4.0),
    twRatio:    clamp(p.twRatio,    1.0,  1.5),
    ewf:        clamp(p.ewf,       0.30, 0.65),
    etaHov:     clamp(p.etaHov,    0.60, 0.85),
    etaSys:     clamp(p.etaSys,    0.70, 0.92),
  });

  /* ── Inject all params into app sliders ── */
  const inject = (p) => {
    Object.entries(p).forEach(([k,v])=>{ if(onParamChange&&!isNaN(+v)) onParamChange(k)(+v); });
  };

  /* ── Async Optimizer — chunked so browser never freezes ── */
  const optimizeAsync = async (userRange, userPayload, userVCruise) => {
    const R0 = clamp(userRange   || params.range,   20, 500);
    const P0 = clamp(userPayload || params.payload,  50, 800);
    const V0 = clamp(userVCruise || params.vCruise,  30, 120);

    const stable = {
      ...params,
      vCruise: V0,
      vtCh:    Math.max(+(params.vtCh)    || 0.45, 0.40),
      vtCv:    +(params.vtCv)    || 0.05,
      vtGamma: +(params.vtGamma) || 40,
      vtAR:    +(params.vtAR)    || 2.5,
      fusLen:  +(params.fusLen)  || 8.5,
      fusDiam: +(params.fusDiam) || 1.6,
      convTolExp: -3,   // fast convergence during search
    };

    const score = (R) => {
      if (!R || !isFinite(R.MTOW) || R.MTOW < 100) return Infinity;
      let penalty = 0;
      if (R.MTOW > 5700)              penalty += (R.MTOW - 5700) * 3;
      if (R.SM_vt < 0.04)             penalty += (0.04 - R.SM_vt) * 8000;
      if (R.SM_vt > 0.28)             penalty += (R.SM_vt - 0.28) * 5000;
      if (R.Wbat/R.MTOW > 0.55)      penalty += (R.Wbat/R.MTOW - 0.55) * 6000;
      if (R.TipMach > 0.70)           penalty += (R.TipMach - 0.70) * 5000;
      if (R.LDact < 10)               penalty += (10 - R.LDact) * 300;
      if (R.PackkWh < R.Etot)         penalty += (R.Etot - R.PackkWh) * 2000;
      if (!R.feasible)                penalty += 300;
      return R.MTOW + penalty - R.LDact * 40 - R.SM_vt * 800;
    };

    const tryP = (overrides) => {
      try {
        const p = sanitize({ ...stable, range:R0, payload:P0, ...overrides });
        const R = runSizing(p);
        return { p, R, s: score(R) };
      } catch { return { p:null, R:null, s:Infinity }; }
    };

    // Reduced grid — still covers the space well but ~2400 combos (not 60k)
    const sedV  = [200, 250, 300, 350, 400];
    const arV   = [7, 9, 11];
    const ewfV  = [0.38, 0.44, 0.50];
    const nPV   = [6, 8];
    const dV    = [2.0, 2.5, 3.0];
    const ldV   = [12, 14, 16];
    const twV   = [1.1, 1.3];
    const etaSV = [0.80, 0.85, 0.90];

    // Build all combos
    const combos = [];
    for (const sed  of sedV)
    for (const ar   of arV)
    for (const ewf  of ewfV)
    for (const nP   of nPV)
    for (const d    of dV)
    for (const ld   of ldV)
    for (const tw   of twV)
    for (const etaS of etaSV)
      combos.push({ sedCell:sed, AR:ar, ewf, nPropHover:nP, propDiam:d, LD:ld, twRatio:tw, etaSys:etaS });

    let best = { p:null, R:null, s:Infinity };
    const CHUNK = 50; // evaluate 50 combos per frame

    // Process in async chunks — yields to browser between chunks
    for (let i = 0; i < combos.length; i += CHUNK) {
      const slice = combos.slice(i, i + CHUNK);
      for (const ovr of slice) {
        const t = tryP(ovr);
        if (t.s < best.s) best = t;
      }
      // Yield to browser every chunk so UI stays responsive
      await new Promise(r => setTimeout(r, 0));
    }

    // Phase 2: Coordinate descent fine-tune around best found
    if (best.p) {
      const dims  = ['sedCell','AR','ewf','propDiam','LD','twRatio','etaSys','etaHov'];
      const steps = { sedCell:15, AR:0.5, ewf:0.02, propDiam:0.2, LD:1, twRatio:0.05, etaSys:0.02, etaHov:0.02 };
      let improved = true, iters = 0;
      while (improved && iters < 20) {
        improved = false; iters++;
        for (const dim of dims) {
          for (const dir of [-1, 1]) {
            const t = tryP({ ...best.p, [dim]: best.p[dim] + dir * steps[dim] });
            if (t.s < best.s) { best = t; improved = true; }
          }
        }
        Object.keys(steps).forEach(k => { steps[k] *= 0.8; });
        await new Promise(r => setTimeout(r, 0)); // yield each outer iter
      }
    }

    return best.R ? best : null;
  };

    /* ── Parse user intent from text ── */
  const parseIntent = (text) => {
    const lower = text.toLowerCase();
    // Extract range
    const rangeMatch = lower.match(/(\d+)\s*km/);
    const range = rangeMatch ? +rangeMatch[1] : null;
    // Extract passengers → payload (80kg per pax + 20kg bags)
    const paxMatch = lower.match(/(\d+)\s*passenger/);
    const payload = paxMatch ? +paxMatch[1] * 100 : null;
    // Extract speed
    const speedMatch = lower.match(/(\d+)\s*m\/s/);
    const vCruise = speedMatch ? +speedMatch[1] : null;
    return { range, payload, vCruise };
  };

  /* ── Call Groq for natural language summary only ── */
  const getSummary = async (R, p, userMsg) => {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_GROQ_KEY}`},
        body: JSON.stringify({
          model:GROQ_MODEL_FAST, max_tokens:250,
          messages:[
            {role:"system", content:"You are a concise aerospace engineer. Write a 3-sentence design summary. No JSON, no bullet points, just plain sentences."},
            {role:"user", content:`User asked: "${userMsg}". Result: MTOW=${R.MTOW}kg, battery=${R.Wbat}kg (${(R.Wbat/R.MTOW*100).toFixed(1)}% of MTOW), energy=${R.Etot}kWh, hover power=${R.Phov}kW, cruise power=${R.Pcr}kW, L/D=${R.LDact}, wing span=${R.bWing}m, static margin=${(R.SM_vt*100).toFixed(1)}%, tip Mach=${R.TipMach}, feasible=true. Key params: range=${p.range}km, payload=${p.payload}kg, sedCell=${p.sedCell}Wh/kg, AR=${p.AR}, ${p.nPropHover} rotors at ${p.propDiam}m diameter. Write a 3-sentence engineering summary.`}
          ]
        })
      });
      if(!res.ok) return null;
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    } catch { return null; }
  };

  /* ── CHAT MODE: plain conversational AI (no optimizer, no injection) ── */
  const sendChat = async () => {
    if(!input.trim()||thinking) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(p=>[...p,{role:'user',content:userMsg,mode:'chat'}]);
    setThinking(true);

    const newHistory = [...chatHistory, {role:'user',content:userMsg}];
    setChatHistory(newHistory);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_GROQ_KEY}`},
        body: JSON.stringify({
          model:GROQ_MODEL_FAST,
          max_tokens:800,
          messages:[
            {role:"system", content:`You are a knowledgeable aerospace engineering assistant specializing in eVTOL aircraft. You help engineers and students understand concepts, solve problems, and learn about aviation. The user is working on an eVTOL sizing tool. Current design context: MTOW=${SR?.MTOW||'unknown'}kg, missionRange=${params.range}km (total ${SR?(SR.totalRange||params.range):params.range}km incl. reserve), payload=${params.payload}kg, ${params.nPropHover} rotors. Answer clearly and helpfully. For technical questions give depth. For simple questions be concise.`},
            ...newHistory.slice(-10) // keep last 10 for context
          ]
        })
      });
      if(!res.ok){const t=await res.text();
        /* A retired model and an unentitled key both return 404 with the same
           wording, so ask the API which models this key can reach and say so. */
        throw new Error(await describeModelError(res.status, t, import.meta.env.VITE_GROQ_KEY));}
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "No response.";
      setChatHistory(h=>[...h,{role:'assistant',content:reply}]);
      setMessages(p=>[...p,{role:'assistant',content:reply,mode:'chat'}]);
    } catch(e){
      setMessages(p=>[...p,{role:'assistant',content:`⚠ ${e.message}`,mode:'chat'}]);
    }
    setThinking(false);
  };

  /* ── unified send dispatcher ── */
  const send = async () => {
    if(mode==='chat') { await sendChat(); return; }
    await sendDesign();
  };

  const sendDesign = async () => {
    if(!input.trim()||thinking) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(p=>[...p,{role:'user',content:userMsg,mode:'design'}]);
    setThinking(true);
    try {
      /* Step 1: Parse user intent */
      const intent = parseIntent(userMsg);
      setMessages(p=>[...p,{role:'assistant',content:`Parsing requirements…\nRange: ${intent.range||params.range}km | Payload: ${intent.payload||params.payload}kg | Speed: ${intent.vCruise||params.vCruise}m/s\n\nRunning optimizer across ${6*6*5*2*3} design combinations...`}]);

      /* Step 2: Run deterministic optimizer */
      await new Promise(r=>setTimeout(r,50)); // let UI update
      const result = await optimizeAsync(intent.range, intent.payload, intent.vCruise);
      const bestResult = result && result.R ? result : null;

      if(!bestResult) {
        // Fallback: try with relaxed constraints (longer range or higher SED)
        setMessages(p=>[...p,{role:'assistant',content:"⚠ No feasible design found with exact requirements. Trying relaxed parameters..."}]);
        const relaxedRaw = await optimizeAsync(
          Math.max(20, (intent.range||params.range)*0.8),
          Math.max(50, (intent.payload||params.payload)*0.9),
          intent.vCruise
        );
        const relaxed = relaxedRaw && relaxedRaw.R ? relaxedRaw : null;
        if(!relaxed) {
          setMessages(p=>[...p,{role:'assistant',content:"Cannot find a feasible design for these requirements. Try reducing range or payload."}]);
          setThinking(false); return;
        }
        // Use relaxed result
        const {p:rp, R:rR} = relaxed;
        inject(rp);
        setIterCount(c=>c+1);
        setMessages(prev=>[...prev,{role:'assistant',content:`Calculating final results...`}]);
        await new Promise(r=>setTimeout(r,120));
        const liveRx = srRef.current;
        const fx1 = v=>(typeof v==='number'&&isFinite(v))?v.toFixed(1):'—';
        const fx2 = v=>(typeof v==='number'&&isFinite(v))?v.toFixed(2):'—';
        setMessages(prev=>{
          const msgs=[...prev];
          msgs[msgs.length-1]={...msgs[msgs.length-1],content:
            `✓ Feasible design found (relaxed constraints):\nRange reduced to ${rp.range}km, Payload to ${rp.payload}kg\n\n`+
            `MTOW: ${fx1(liveRx.MTOW)}kg | Battery: ${fx1(liveRx.Wbat)}kg (${liveRx.MTOW?((liveRx.Wbat/liveRx.MTOW)*100).toFixed(1):'—'}%) | `+
            `Energy: ${fx2(liveRx.Etot)}kWh | L/D: ${fx2(liveRx.LDact)} | Span: ${fx2(liveRx.bWing)}m\n\n✓ All parameters injected into your app.`
          };
          return msgs;
        });
        setThinking(false); return;
      }

      const {p:bestP, R:bestR} = bestResult;

      /* Step 3: Inject into app live */
      inject(bestP);
      setIterCount(c=>c+1);

      /* Step 4: Show placeholder — then update with live SR values once React re-renders */
      setMessages(prev=>[...prev,{role:'assistant',content:`Calculating final results...`}]);

      // Wait two frames for React to re-render SR with the injected params
      await new Promise(r=>setTimeout(r,120));
      const liveR = srRef.current;  // SR is now recomputed from injected params
      const fmt1 = v => (typeof v==='number'&&isFinite(v)) ? v.toFixed(1) : '—';
      const fmt2 = v => (typeof v==='number'&&isFinite(v)) ? v.toFixed(2) : '—';
      const fmt0 = v => (typeof v==='number'&&isFinite(v)) ? Math.round(v).toString() : '—';

      setMessages(prev=>{
        const msgs=[...prev];
        msgs[msgs.length-1]={...msgs[msgs.length-1],content:
          `✓ FEASIBLE DESIGN FOUND — injected into all app tabs:\n\n` +
          `MTOW:         ${fmt1(liveR.MTOW)} kg\n` +
          `Battery:      ${fmt1(liveR.Wbat)} kg  (${liveR.MTOW?((liveR.Wbat/liveR.MTOW)*100).toFixed(1):'—'}% of MTOW)\n` +
          `Total Energy: ${fmt2(liveR.Etot)} kWh\n` +
          `Hover Power:  ${fmt1(liveR.Phov)} kW\n` +
          `Cruise Power: ${fmt1(liveR.Pcr)} kW\n` +
          `Wing Span:    ${fmt2(liveR.bWing)} m\n` +
          `L/D (actual): ${fmt2(liveR.LDact)}\n` +
          `Static Margin:${liveR.SM_vt!=null?((liveR.SM_vt)*100).toFixed(1):'—'}%\n` +
          `Tip Mach:     ${fmt2(liveR.TipMach)}\n\n` +
          `Key design: ${bestP.sedCell}Wh/kg cells · AR=${bestP.AR} · ${bestP.nPropHover}×${bestP.propDiam.toFixed(2)}m rotors · ewf=${bestP.ewf.toFixed(4)}\n\n` +
          `Getting engineering summary...`
        };
        return msgs;
      });

      /* Step 5: Get AI summary */
      const summary = await getSummary(bestR, bestP, userMsg);
      if(summary) {
        setMessages(prev=>{
          const msgs = [...prev];
          const last = msgs[msgs.length-1];
          msgs[msgs.length-1] = {...last, content: last.content.replace('Getting engineering summary...', `${summary}`)};
          return msgs;
        });
      }

    } catch(e) {
      setMessages(p=>[...p,{role:'assistant',content:`⚠ Error: ${e.message}`}]);
    }
    setThinking(false);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* ── Header ── */}
      <div style={{background:`linear-gradient(135deg,${SC.bg},#120a1f)`,border:`1px solid ${SC.purple}44`,borderRadius:10,padding:'16px 20px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:'0.18em',marginBottom:4}}>
              {mode==='design'?'DETERMINISTIC OPTIMIZER · ALL TABS UPDATE LIVE':'LLAMA 3 VIA GROQ · CONVERSATIONAL · CONTEXT-AWARE'}
            </div>
            <div style={{fontSize:18,fontWeight:800,color:SC.text}}>
              <span style={{color:SC.purple}}>AI</span> {mode==='design'?'Design Assistant':'Chat Assistant'}
              {mode==='design'&&iterCount>0&&<span style={{fontSize:11,color:SC.green,marginLeft:12}}>✓ {iterCount} design{iterCount>1?'s':''} optimized</span>}
          <span style={{fontSize:9,color:SC.subtle,marginLeft:8,fontFamily:"'DM Mono',monospace"}}>auto-saved</span>
            </div>
          </div>

          {/* ── Mode Toggle ── */}
          <div style={{display:'flex',gap:0,background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:8,overflow:'hidden',flexShrink:0}}>
            {[
              {key:'design', icon:'', label:'Design Mode',  tip:'Optimizer finds best feasible aircraft and injects into all tabs'},
              {key:'chat',   icon:'', label:'Chat Mode',    tip:'Ask anything — concepts, theory, problems, comparisons'},
            ].map(({key,icon,label,tip})=>(
              <button key={key} onClick={()=>{
                setMode(key);
                // Add a context message when switching
                setMessages(p=>[...p,{role:'assistant',mode:key,content:
                  key==='design'
                  ?"Switched to Design Mode. Describe your eVTOL requirements and I'll find the optimal design and inject it into all app tabs."
                  :"Switched to Chat Mode. Ask me anything — BEM theory, certification questions, aerodynamics, comparisons, or general eVTOL concepts."
                }]);
              }} type="button" title={tip}
                style={{
                  padding:'8px 16px',
                  background:mode===key?`linear-gradient(135deg,#2d1b69,${SC.purple})`:'transparent',
                  border:'none',
                  color:mode===key?'#e9d5ff':SC.muted,
                  fontSize:10,fontWeight:mode===key?800:500,
                  cursor:'pointer',fontFamily:"'DM Mono',monospace",
                  transition:'all 0.15s',
                }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{fontSize:11,color:SC.muted,lineHeight:1.6,marginTop:8}}>
          {mode==='design'
            ?'Describe requirements → optimizer searches design combinations → injects best feasible design into every tab instantly.'
            :'Ask anything about eVTOL design, aerodynamics, BEM theory, certification, or any engineering concept. Maintains conversation context.'}
        </div>
      </div>

      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,display:'flex',flexDirection:'column',height:460}}>
        <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
              <div style={{maxWidth:'84%',padding:'10px 14px',borderRadius:10,
                background:m.role==='user'?`${SC.purple}33`:SC.bg,
                border:`1px solid ${m.role==='user'?SC.purple+'55':SC.border}`,
                fontSize:11,color:SC.text,fontFamily:"'DM Mono',monospace",lineHeight:1.8,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                {m.role==='assistant'&&<span style={{fontSize:8,color:SC.purple,fontWeight:800,display:'block',marginBottom:4}}>AI ASSISTANT{m.mode==='chat'?' · CHAT':m.mode==='design'?' · DESIGN':''}</span>}
                {m.content}
              </div>
            </div>
          ))}
          {thinking&&(
            <div style={{display:'flex',justifyContent:'flex-start'}}>
              <div style={{padding:'10px 14px',borderRadius:10,background:SC.bg,border:`1px solid ${SC.border}`,fontSize:11,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                <span style={{fontSize:8,color:SC.purple,fontWeight:800,display:'block',marginBottom:4}}>AI ASSISTANT</span>
                {mode==='design'?'⟳ Optimizing…':'⟳ Thinking…'}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
        <div style={{borderTop:`1px solid ${SC.border}`,padding:'10px 14px',display:'flex',gap:10}}>
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
            placeholder={mode==='design'?"e.g. '4 passengers, 100km, EASA SC-VTOL, minimise MTOW'":"Ask anything — BEM theory, certification, aerodynamics, comparisons…"}
            style={{flex:1,background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:6,color:SC.text,fontSize:11,padding:'8px 12px',fontFamily:"'DM Mono',monospace",outline:'none'}}
            disabled={thinking}/>
          <button onClick={send} disabled={thinking||!input.trim()} type="button"
            style={{padding:'8px 20px',background:thinking?'transparent':`linear-gradient(135deg,#2d1b69,${SC.purple})`,border:`2px solid ${SC.purple}`,borderRadius:6,color:thinking?SC.muted:'#e9d5ff',fontSize:11,fontWeight:800,cursor:thinking||!input.trim()?'not-allowed':'pointer',fontFamily:"'DM Mono',monospace"}}>
            {thinking?'⟳':'→ Send'}
          </button>
        </div>
      </div>

      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
            {mode==='design'?'DESIGN QUICK PROMPTS':'CHAT QUICK PROMPTS'}
          </div>
          <button onClick={()=>setConfirmClearChat(true)}
            type="button"
            style={{padding:'3px 10px',background:'transparent',border:`1px solid ${SC.red}55`,borderRadius:4,color:SC.red,fontSize:9,cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
            Clear History
          </button>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {(mode==='design'?[
            "4 passengers, 80km range, EASA SC-VTOL",
            "Minimise MTOW for current range and payload",
            "6 passengers, 150km, minimise battery weight",
            "2 passengers, 50km, urban air taxi",
            "Maximise range with battery under 40% MTOW",
            "Best design for 320kg payload, 100km range",
          ]:[
            "What is Blade Element Momentum theory?",
            "Explain static margin in simple terms",
            "What's the difference between Joby S4 and Archer Midnight?",
            "Why does increasing aspect ratio improve L/D?",
            "How does battery degradation affect eVTOL range?",
            "What is the Glauert correction and when is it needed?",
            "Explain EASA SC-VTOL certification requirements",
            "What is figure of merit for a helicopter rotor?",
          ]).map(q=>(
            <button key={q} onClick={()=>setInput(q)} type="button"
              style={{padding:'5px 12px',background:`${SC.purple}18`,border:`1px solid ${SC.purple}44`,borderRadius:5,color:SC.purple,fontSize:9,cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
              {q}
            </button>
          ))}
        </div>
      </div>
      {/* ── In-app clear chat confirmation ── */}
      {confirmClearChat&&(
        <div style={{position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,0.65)",
          backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:SC.panel,border:`1px solid ${SC.red}66`,borderRadius:12,
            padding:"28px 32px",width:360,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
            
            <div style={{fontSize:15,fontWeight:700,color:SC.text,textAlign:"center",marginBottom:8}}>Clear all chat history?</div>
            <div style={{fontSize:11,color:SC.muted,fontFamily:"'DM Mono',monospace",textAlign:"center",marginBottom:24,lineHeight:1.6}}>All conversation history and design iterations will be permanently deleted. This cannot be undone.</div>
            <div style={{display:"flex",gap:10}}>
              <button type="button" onClick={()=>setConfirmClearChat(false)}
                style={{flex:1,padding:"10px 0",background:"transparent",border:`1px solid ${SC.border}`,borderRadius:6,color:SC.muted,fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:600}}>Cancel</button>
              <button type="button" onClick={()=>{clearChat();setConfirmClearChat(false);}}
                style={{flex:1,padding:"10px 0",background:`${SC.red}22`,border:`1px solid ${SC.red}`,borderRadius:6,color:SC.red,fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif",fontWeight:700}}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
