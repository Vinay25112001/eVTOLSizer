import { useState, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { SC } from "./lib/theme.js";
import { DisplaySettings } from "./ui/glass.jsx";

/* ═══════════════════════════════════════════════════════════════
   eVTOL SIZER — AUTH SYSTEM v3.0
   Register: firstName, lastName, mobile, email, password + OTP verify
   Login: email OR mobile OR username + password → OTP verify
   Forgot: enter email → OTP → reset password
   ═══════════════════════════════════════════════════════════════ */

/* ── Colours: the app's own palette ──
   The auth panels had two palettes of their own (Tailwind slate and amber)
   and a setAuthTheme() that each studio called with its own day/night
   state, so whichever studio called last chose the colours. They now read
   the one shared palette (lib/theme.js SC, kept on the current theme by
   lib/display.js) through a getter, so Day/Night reaches them with no call.
   Amber was the accent here, and amber means CAUTION in this tool, so the
   accent role maps to the app's accent. */
const ROLE = { amber: "accent", bg: "inset", panel: "panelSolid" };
const C = {};
for (const k of [...Object.keys(ROLE), ...Object.keys(SC)]) {
  if (!Object.prototype.hasOwnProperty.call(C, k)) Object.defineProperty(C, k, { get: () => SC[ROLE[k] ?? k], enumerable: true });
}
/** Kept for older callers: the theme belongs to lib/display.js now. */
export function setAuthTheme() {}
const SANS = "'IBM Plex Sans',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,monospace";

/* Drawn icons in one stroke style, in place of emoji: an emoji renders
   differently on every system and reads as a toy in an engineering tool. */
const ICONS = {
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M3 3l18 18|M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.1 4.1|M6.6 6.6A17.3 17.3 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6|M9.9 9.9a3 3 0 0 0 4.2 4.2",
  close: "M6 6l12 12|M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 3.5l9.5 16.5h-19z|M12 10v4.5|M12 17.4v.1",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v6|M12 7.6v.1",
  error: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M9 9l6 6|M15 9l-6 6",
  mail: "M3.5 6h17v12h-17z|M3.5 7l8.5 6 8.5-6",
  key: "M15 3a6 6 0 1 1-4.3 10.2L8.5 15.4V18H6v2.5H3.5v-2.9l6.3-6.3A6 6 0 0 1 15 3z|M16.5 7.4v.1",
  building: "M4 21V4.5L12 3v18|M12 8.5h8V21|M2.5 21h19|M7.5 8v.1|M7.5 12v.1|M7.5 16v.1|M16 12.5v.1|M16 16.5v.1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4.5 20.5a7.5 7.5 0 0 1 15 0",
  designs: "M4 20V4l16 16z|M8.5 15.5h3.5V12z",
  file: "M6 2.5h8l4.5 4.5v14.5H6z|M14 2.5V7h4.5|M9 13h6.5|M9 17h6.5",
  logout: "M9.5 20.5H5.5a1.5 1.5 0 0 1-1.5-1.5V5a1.5 1.5 0 0 1 1.5-1.5h4|M16 16.5l4.5-4.5L16 7.5|M20.5 12H9.5",
  phone: "M7.5 2.5h9v19h-9z|M11 18h2",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10.3 21a1.94 1.94 0 0 0 3.4 0",
  plane: "M21 15.5v-2l-8-5V3.6a1.5 1.5 0 0 0-3 0v4.9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z",
  download: "M12 4v11|M7 10l5 5 5-5|M5 20h14",
  trash: "M4 7h16|M10 11v6|M14 11v6|M6 7l1 13h10l1-13|M9 7V4h6v3",
  arrowLeft: "M19 12H5|M11 6l-6 6 6 6",
};
function Icon({name,size=16,style}){
  return(
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,...style}}>
      {(ICONS[name]||ICONS.info).split("|").map((d,i)=><path key={i} d={d}/>)}
    </svg>
  );
}
function Spinner({size=15}){
  return(
    <svg aria-hidden="true" className="gc-spin" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}><path d="M12 3a9 9 0 1 1-9 9"/></svg>
  );
}
/* A large icon in a soft disc: the head of a screen, or an empty list. */
function IconBadge({name,tone}){
  const col=tone||C.accent;
  return(
    <div aria-hidden="true" style={{width:52,height:52,margin:"0 auto 12px",borderRadius:"50%",display:"grid",placeItems:"center",
      color:col,background:`color-mix(in srgb, ${col} 13%, transparent)`,boxShadow:`inset 0 0 0 1px color-mix(in srgb, ${col} 35%, transparent)`}}>
      <Icon name={name} size={24}/>
    </div>
  );
}
/* Dialogs render on <body>, not inside the header that opened them: the
   header is a stacking context (z-index 40), and a dialog inside it was
   painted at the header's level. */
const portal=(node)=>typeof document!=="undefined"&&document.body?createPortal(node,document.body):node;
const initialsOf=(name)=>String(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("")||"?";

/* ── helpers ── */
const uid = () => Math.random().toString(36).slice(2,10);
const nowISO = () => new Date().toISOString();
const fmtTime = (iso) => {
  const d=new Date(iso), diff=(Date.now()-d)/1000;
  if(diff<60) return "just now";
  if(diff<3600) return `${Math.floor(diff/60)}m ago`;
  if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
};

/* ── EmailJS ── */
import { hashPassword, verifyPassword } from "./lib/password.js";
import * as SBAuth from "./lib/supabaseAuth.js";

/* Credentials come from the environment, not from source. NOTE that Vite
   inlines VITE_* into the client bundle, so these are still readable by anyone
   who opens the bundle — moving them out of git history is the win here, not
   secrecy. Anything that must actually stay secret has to live server-side. */
/* NO CREDENTIAL FALLBACKS. These carried the author's own EmailJS service,
   template and public key as `|| "..."` defaults, three lines below a comment
   saying "moving them out of git history is the win here" -- they had never
   actually been moved. Anyone cloning this repository would have sent mail
   through that account by default, and the values shipped in every built
   bundle. Unset now means UNCONFIGURED, which fails loudly in sendOTPEmail
   rather than silently borrowing somebody's account. */
const EJS_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE  || "";
const EJS_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE || "";
const EJS_KEY      = import.meta.env.VITE_EMAILJS_KEY      || "";

async function sendOTPEmail(toEmail, otpCode) {
  if (!EJS_SERVICE || !EJS_TEMPLATE || !EJS_KEY)
    throw new Error("Email delivery is not configured. Set VITE_EMAILJS_SERVICE, "
      + "VITE_EMAILJS_TEMPLATE and VITE_EMAILJS_KEY — see .env.example.");
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      service_id:EJS_SERVICE, template_id:EJS_TEMPLATE, user_id:EJS_KEY,
      template_params:{ to_email:toEmail, otp_code:otpCode },
    }),
  });
  if(!res.ok){ const t=await res.text().catch(()=>""); throw new Error(`EmailJS ${res.status}: ${t}`); }
}

/* ── OTP store ── */
const otpStore = {};
function generateOTP(email) {
  const code = String(Math.floor(100000+Math.random()*900000));
  otpStore[email] = { code, expires: Date.now()+5*60*1000 };
  return code;
}
function verifyOTP(email, code) {
  const e=otpStore[email];
  if(!e||Date.now()>e.expires) return false;
  return /^\d{6}$/.test(code) && e.code===code;
}
function clearOTP(email){ delete otpStore[email]; }

/* ══════════════════════════════════════════════════════════════
   SUPABASE CLIENT — cross-device persistence
   Create a FREE project at https://supabase.com then:
   1. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
   2. Run the SQL setup in your Supabase SQL editor (see README)
   ══════════════════════════════════════════════════════════════ */
export const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_KEY;

async function sbFetch(path, opts={}){
  const { prefer, headers:extraHeaders={}, body, method="GET" } = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers:{
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": prefer||"return=representation",
      ...extraHeaders,
    },
    ...(body ? { body } : {}),
  });
  if(!res.ok){
    const t=await res.text().catch(()=>"");
    console.error(`Supabase error ${res.status} on ${method} ${path}:`, t);
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
  const text=await res.text();
  return text ? JSON.parse(text) : null;
}

/* ── User DB — Supabase table: evtol_users ── */
async function getUsers(){ try{ return await sbFetch("evtol_users?select=*"); }catch{ return []; } }

async function getUserByEmail(email){
  if(!email) return null;
  try{
    const rows=await sbFetch(`evtol_users?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=*`);
    console.log("getUserByEmail:", email, "→ found:", rows?.length, rows?.[0]?.email);
    return rows?.[0]||null;
  }catch(e){ console.error("getUserByEmail error:", e); return null; }
}

async function getUserByMobileOrUsername(identifier){
  try{
    const id=identifier.trim().toLowerCase();
    const rows=await sbFetch(`evtol_users?or=(mobile.eq.${encodeURIComponent(id)},username.eq.${encodeURIComponent(id)})&select=*`);
    return rows?.[0]||null;
  }catch(e){ console.error("getUserByMobileOrUsername error:", e); return null; }
}

async function upsertUser(u){
  try{
    // Only send columns that exist in Supabase (snake_case only)
    const clean={
      id:         u.id,
      email:      u.email?.toLowerCase(),
      first_name: u.first_name||u.firstName||"",
      last_name:  u.last_name||u.lastName||"",
      username:   u.username||"",
      mobile:     u.mobile||null,
      org:        u.org||null,
      pw_hash:    u.pw_hash||u.pwHash||"",
      provider:   u.provider||null,
      avatar:     u.avatar||"",
      created_at: u.created_at||u.createdAt||nowISO(),
    };
    const result=await sbFetch("evtol_users",{
      method:"POST",
      prefer:"resolution=merge-duplicates,return=representation",
      headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify(clean),
    });
    console.log("upsertUser success:", clean.email, result);
    return result;
  }catch(e){ console.error("upsertUser error:",e); throw e; }
}

/* ── Session — still localStorage (per-device token) ── */
function getSession(){ try{return JSON.parse(localStorage.getItem("evtol_session")||"null");}catch{return null;} }
function saveSession(s){ localStorage.setItem("evtol_session",JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem("evtol_session"); }

/* ── Find user (async, checks Supabase) ── */
async function findUser(identifier){
  const id=identifier.trim().toLowerCase();
  const byEmail=await getUserByEmail(id);
  if(byEmail) return byEmail;
  return getUserByMobileOrUsername(id);
}

/* ── Notifications — Supabase table: evtol_notifs ── */
async function getNotifs(userId){
  try{
    return await sbFetch(`evtol_notifs?user_id=eq.${userId}&order=time.desc&limit=50&select=*`)||[];
  }catch{ return []; }
}
async function saveNotifs(userId, notifs){
  // We save individually; this bulk approach replaces all notifs for user
  // For simplicity just use addNotif for new ones
}
async function addNotif(userId,{title,body,type="info"}){
  try{
    await sbFetch("evtol_notifs",{
      method:"POST",
      body:JSON.stringify({id:userId+"_"+Date.now(),user_id:userId,title,body,type,read:false,time:nowISO()}),
    });
  }catch(e){ console.warn("addNotif failed:",e); }
}
async function markNotifRead(notifId){
  try{ await sbFetch(`evtol_notifs?id=eq.${notifId}`,{method:"PATCH",body:JSON.stringify({read:true})}); }catch{}
}
async function deleteNotif(notifId){
  try{ await sbFetch(`evtol_notifs?id=eq.${notifId}`,{method:"DELETE"}); }catch{}
}

/* ── Designs DB — Supabase table: evtol_designs ── */
async function getDesigns(userId){
  try{
    return await sbFetch(`evtol_designs?user_id=eq.${userId}&order=saved_at.desc&limit=20&select=*`)||[];
  }catch{ return []; }
}
/* THROWS on failure. It used to catch and console.error, and every caller
   then told the user "Design Saved" whether or not anything was written. */
async function saveDesign(userId,{name,params,results,pdfHtml}){
  if(!SUPABASE_URL||!SUPABASE_KEY) throw new Error("this build has no database configured");
  await sbFetch("evtol_designs",{
    method:"POST",
    body:JSON.stringify({id:uid(),user_id:userId,name,params:JSON.stringify(params),results:JSON.stringify(results),pdf_html:pdfHtml,saved_at:nowISO()}),
  });
}
async function deleteDesign(designId){
  try{ await sbFetch(`evtol_designs?id=eq.${designId}`,{method:"DELETE"}); }catch{}
}

/* ── Report History — Supabase table: evtol_reports ── */
async function getReports(userId){
  try{
    return await sbFetch(`evtol_reports?user_id=eq.${userId}&order=generated_at.desc&limit=30&select=*`)||[];
  }catch{ return []; }
}
async function addReport(userId,{name,params,results,pdfHtml}){
  try{
    await sbFetch("evtol_reports",{
      method:"POST",
      body:JSON.stringify({id:uid(),user_id:userId,name,params:JSON.stringify(params),results:JSON.stringify(results),pdf_html:pdfHtml,generated_at:nowISO()}),
    });
  }catch(e){ console.error("addReport:",e); }
}
async function deleteReport(reportId){
  try{ await sbFetch(`evtol_reports?id=eq.${reportId}`,{method:"DELETE"}); }catch{}
}

/* ── Get full user from Supabase ── */
async function getFullUser(email){
  return getUserByEmail(email);
}

/* ── Fix session name — handle old/missing firstName/lastName ── */
function buildDisplayName(u){
  if(!u) return "User";
  const fn=u.first_name||u.firstName||"";
  const ln=u.last_name||u.lastName||"";
  const full=`${fn} ${ln}`.trim();
  if(full) return full;
  if(u.name&&u.name!=="undefined undefined") return u.name;
  return u.email?.split("@")[0]||"User";
}

/* ══════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ══════════════════════════════════════════════════════════════ */
function Input({label,type="text",value,onChange,placeholder,autoFocus,error,hint}){
  const[show,setShow]=useState(false);
  const id=useId();
  const isP=type==="password";
  return(
    <div style={{marginBottom:14}}>
      {label&&<label htmlFor={id} style={{display:"block",fontSize:12,fontWeight:500,color:C.muted,fontFamily:SANS,marginBottom:5}}>{label}</label>}
      <div style={{position:"relative"}}>
        <input id={id} className="gc-field"
          type={isP&&show?"text":type} value={value}
          onChange={e=>onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          aria-invalid={error?true:undefined}
          aria-describedby={error||hint?`${id}-d`:undefined}
          style={{paddingRight:isP?44:12,...(error?{borderColor:C.warning}:null)}}
        />
        {isP&&(
          <button onClick={()=>setShow(s=>!s)} type="button" className="gc-icon-btn"
            aria-label={show?"Hide password":"Show password"} aria-pressed={show}
            style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",width:30,height:30}}>
            <Icon name={show?"eyeOff":"eye"} size={16}/>
          </button>
        )}
      </div>
      {error&&<div id={`${id}-d`} style={{fontSize:12,color:C.warning,marginTop:4,fontFamily:SANS}}>{error}</div>}
      {hint&&!error&&<div id={`${id}-d`} style={{fontSize:11.5,color:C.subtle,marginTop:4,fontFamily:SANS}}>{hint}</div>}
    </div>
  );
}

/* A field in the profile dialog: labelled, and read-only when disabled. */
function ProfileField({label,value,set,placeholder,disabled}){
  const id=useId();
  return(
    <div style={{marginBottom:10}}>
      <label htmlFor={id} style={{display:"block",fontSize:12,fontWeight:500,color:C.muted,fontFamily:SANS,marginBottom:5}}>{label}</label>
      <input id={id} className="gc-field" value={value} onChange={e=>set(e.target.value)} placeholder={placeholder}
        disabled={disabled} readOnly={disabled} type="text" style={disabled?{opacity:0.7,color:C.muted}:undefined}/>
    </div>
  );
}

function Btn({children,onClick,variant="primary",loading,fullWidth,small}){
  /* KEYCAPS FROM THE GLASS COCKPIT (ui/glass.jsx). The primary action is
     the lit key; the rest are plain keys. Before that, `primary` was an
     amber-to-orange gradient and `blue` a navy one: amber means CAUTION in
     this tool's own data, so the loudest control on the screen was a
     warning colour on a button the user is meant to press. */
  const cls={primary:"gc-key gc-key-on",blue:"gc-key gc-key-on"}[variant]||"gc-key";
  return(
    <button onClick={onClick} disabled={loading} aria-busy={loading||undefined} type="button" className={cls}
      style={{width:fullWidth?"100%":"auto",minHeight:small?30:40,padding:small?"0 12px":"0 18px",
        fontSize:small?12:13.5,fontWeight:600,fontFamily:SANS,letterSpacing:0,
        ...(variant==="danger"?{color:C.warning}:null)}}>
      {loading?<><Spinner/><span>Working...</span></>:children}
    </button>
  );
}

function Divider({text}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
      <div style={{flex:1,height:1,background:C.border}}/>
      <span style={{fontSize:12,color:C.muted,fontFamily:SANS}}>{text}</span>
      <div style={{flex:1,height:1,background:C.border}}/>
    </div>
  );
}

function Alert({type,children}){
  const cols={error:C.warning,success:C.nominal,info:C.advisory,warn:C.caution};
  const icons={error:"error",success:"check",info:"info",warn:"alert"};
  const col=cols[type]||C.muted;
  return(
    <div role={type==="error"?"alert":"status"}
      style={{background:`color-mix(in srgb, ${col} 10%, transparent)`,border:`1px solid color-mix(in srgb, ${col} 42%, transparent)`,
        borderRadius:10,padding:"9px 12px",marginBottom:12,display:"flex",gap:9,alignItems:"flex-start"}}>
      <span style={{color:col,display:"inline-flex",marginTop:1}}><Icon name={icons[type]||"info"} size={16}/></span>
      <span style={{fontSize:12.5,color:C.text,fontFamily:SANS,lineHeight:1.5}}>{children}</span>
    </div>
  );
}

/* ── Password strength indicator ── */
function PasswordStrength({password}){
  if(!password) return null;
  const checks=[
    password.length>=8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score=checks.filter(Boolean).length;
  const labels=["","Weak","Fair","Good","Strong"];
  const colors=["",C.warning,C.orange,C.caution,C.nominal];
  return(
    <div style={{marginTop:-8,marginBottom:14}}>
      <div style={{display:"flex",gap:3,marginBottom:4}}>
        {[1,2,3,4].map(i=>(
          <div key={i} style={{flex:1,height:4,borderRadius:2,
            background:i<=score?colors[score]:C.border,transition:"background 0.2s"}}/>
        ))}
      </div>
      <div style={{fontSize:11.5,color:C.muted,fontFamily:SANS}}>
        {score>0?`Password strength: ${labels[score]}`:""}
      </div>
    </div>
  );
}

/* ── 6-box OTP input ── */
function OTPInput({value,onChange}){
  const refs=useRef([]);
  const digits=(value||"").replace(/\D/g,"").split("").slice(0,6);
  while(digits.length<6) digits.push("");
  const handleChange=(i,v)=>{
    const d=v.replace(/\D/g,"").slice(-1);
    const arr=[...digits]; arr[i]=d;
    onChange(arr.join(""));
    if(d&&i<5) refs.current[i+1]?.focus();
  };
  const handleKey=(i,e)=>{
    if(e.key==="Backspace"&&!digits[i]&&i>0){
      const arr=[...digits]; arr[i-1]="";
      onChange(arr.join(""));
      refs.current[i-1]?.focus();
    }
    if(e.key==="ArrowLeft"&&i>0) refs.current[i-1]?.focus();
    if(e.key==="ArrowRight"&&i<5) refs.current[i+1]?.focus();
  };
  const handlePaste=(e)=>{
    const p=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if(p){ onChange(p); refs.current[Math.min(p.length,5)]?.focus(); }
    e.preventDefault();
  };
  return(
    <div role="group" aria-label="Six-digit code" style={{display:"flex",gap:8,justifyContent:"center",margin:"18px 0"}}>
      {[0,1,2,3,4,5].map(i=>(
        <input key={i} ref={el=>refs.current[i]=el}
          type="text" inputMode="numeric" maxLength={1} autoComplete={i===0?"one-time-code":"off"}
          aria-label={`Digit ${i+1} of 6`} className="gc-field"
          value={digits[i]}
          onChange={e=>handleChange(i,e.target.value)}
          onKeyDown={e=>handleKey(i,e)}
          onPaste={handlePaste}
          style={{width:44,height:52,padding:0,textAlign:"center",fontSize:22,fontWeight:600,fontFamily:MONO,
            ...(digits[i]?{borderColor:C.accent}:null)}}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   OTP SCREEN — mandatory after every credential check
   ══════════════════════════════════════════════════════════════ */
function OTPScreen({email, onVerified, onBack, title="Verify Your Email"}){
  const[otp,setOtp]=useState("");
  const[loading,setLoading]=useState(false);
  const[sending,setSending]=useState(true);
  const[err,setErr]=useState("");
  const[info,setInfo]=useState("");
  const[timer,setTimer]=useState(0);
  const timerRef=useRef(null);

  const startTimer=()=>{
    setTimer(60);
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setTimer(t=>{ if(t<=1){clearInterval(timerRef.current);return 0;} return t-1; });
    },1000);
  };

  useEffect(()=>{ sendCode(); return()=>clearInterval(timerRef.current); },[]);

  const sendCode=async()=>{
    setErr(""); setInfo(""); setSending(true); setOtp("");
    try{
      const code=generateOTP(email);
      await sendOTPEmail(email,code);
      startTimer();
      setInfo(`6-digit code sent to ${email}`);
    }catch(e){
      setErr("Failed to send OTP: "+e.message);
    }
    setSending(false);
  };

  const handleVerify=async()=>{
    setErr("");
    const clean=otp.replace(/\D/g,"");
    if(clean.length!==6) return setErr("Enter all 6 digits.");
    setLoading(true);
    await new Promise(r=>setTimeout(r,400));
    if(!verifyOTP(email,clean)){
      setLoading(false); setOtp("");
      return setErr("Wrong or expired code. Try again or request a new one.");
    }
    clearOTP(email);
    setLoading(false);
    onVerified();
  };

  return(
    <div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <IconBadge name="mail"/>
        <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:SANS}}>{title}</div>
        <div style={{fontSize:11,color:C.muted,fontFamily:SANS,marginTop:6,lineHeight:1.8}}>
          We sent a 6-digit code to<br/>
          <span style={{color:C.amber,fontWeight:700}}>{email}</span>
        </div>
      </div>
      {err&&<Alert type="error">{err}</Alert>}
      {info&&!err&&<Alert type="success">{info}</Alert>}
      {sending?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0",color:C.muted,fontSize:12.5,fontFamily:SANS}}>
          <Spinner/><span style={{marginLeft:7}}>Sending code...</span>
        </div>
      ):(
        <>
          <OTPInput value={otp} onChange={setOtp}/>
          <Btn variant="primary" fullWidth onClick={handleVerify} loading={loading}>Verify and continue</Btn>
          <div style={{textAlign:"center",marginTop:12,fontSize:11,color:C.muted,fontFamily:SANS}}>
            {timer>0?<span>Resend in {timer}s</span>:(
              <button onClick={sendCode} type="button"
                style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:11,fontFamily:SANS,fontWeight:700,padding:0}}>
                Resend code
              </button>
            )}
          </div>
          <div style={{fontSize:11,color:C.subtle,fontFamily:SANS,textAlign:"center",marginTop:8,lineHeight:1.6}}>
            Check spam/junk folder if not in inbox. Code expires in 5 minutes.
          </div>
        </>
      )}
      <div style={{textAlign:"center",marginTop:16}}>
        <button onClick={onBack} type="button"
          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11.5,fontFamily:SANS,padding:0}}>
          <Icon name="arrowLeft" size={14} style={{verticalAlign:"-2px",marginRight:4}}/>Back
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RESET PASSWORD SCREEN — after OTP verified for forgot password
   ══════════════════════════════════════════════════════════════ */
function ResetPasswordScreen({email, onDone}){
  const[pw,setPw]=useState("");
  const[pw2,setPw2]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);

  const handleReset=async()=>{
    setErr("");
    if(pw.length<8) return setErr("Password must be at least 8 characters.");
    if(pw!==pw2) return setErr("Passwords do not match.");
    setLoading(true);
    try{
      const u=await getUserByEmail(email.toLowerCase());
      if(!u){ setLoading(false); return setErr("Account not found."); }
      const setHash=await hashPassword(pw);
      await upsertUser({...u, pw_hash:setHash, pwHash:setHash});
      setLoading(false);
      addNotif(u.id,{title:"Password Reset",body:"Your password has been reset successfully.",type:"success"});
      onDone();
    }catch(e){
      setLoading(false);
      setErr("Failed to reset password — check connection. "+e.message);
    }
  };

  return(
    <div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <IconBadge name="key"/>
        <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:SANS}}>Set New Password</div>
        <div style={{fontSize:11,color:C.muted,fontFamily:SANS,marginTop:6}}>for {email}</div>
      </div>
      {err&&<Alert type="error">{err}</Alert>}
      <Input label="New Password" type="password" value={pw} onChange={setPw} placeholder="Min. 8 characters" autoFocus/>
      <PasswordStrength password={pw}/>
      <Input label="Confirm New Password" type="password" value={pw2} onChange={setPw2} placeholder="Repeat password"/>
      <Btn variant="primary" fullWidth onClick={handleReset} loading={loading}>Save new password</Btn>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   AUTH MODAL
   ══════════════════════════════════════════════════════════════ */
function AuthModal({onClose, onAuth, defaultFlow="login"}){
  // stage: "creds" | "otp" | "reset_otp" | "reset_pw" | "success"
  const[stage,setStage]=useState("creds");
  const[flow,setFlow]=useState(defaultFlow);
  const[dbStatus,setDbStatus]=useState("checking"); // "checking"|"ok"|"error"

  // Test Supabase connection on mount
  useEffect(()=>{
    sbFetch("evtol_users?limit=1&select=id")
      .then(()=>setDbStatus("ok"))
      .catch(e=>{ console.error("DB connection test failed:",e); setDbStatus("error"); });
  },[]);

  // Register fields
  const[firstName,setFirstName]=useState("");
  const[lastName,setLastName]=useState("");
  const[mobile,setMobile]=useState("");
  const[regEmail,setRegEmail]=useState("");
  const[regPw,setRegPw]=useState("");
  const[regPw2,setRegPw2]=useState("");
  const[org,setOrg]=useState("");

  // Login fields
  const[loginId,setLoginId]=useState(""); // email or mobile or username
  const[loginPw,setLoginPw]=useState("");
  const[loginPwErr,setLoginPwErr]=useState("");

  // Google
  const[googleEmail,setGoogleEmail]=useState("");
  const[showGoogleInput,setShowGoogleInput]=useState(false);

  // Forgot
  const[forgotEmail,setForgotEmail]=useState("");

  // Org
  const[orgName,setOrgName]=useState("");
  const[orgCode,setOrgCode]=useState("");

  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");

  // pending user — set after creds verified, before OTP
  const pendingUser=useRef(null);
  // email to use for OTP (could differ from login identifier)
  const otpEmail=useRef("");

  const reset=()=>{ setErr(""); setLoginPwErr(""); };
  const switchFlow=(f)=>{ reset(); setFlow(f); setStage("creds"); };

  /* ── after OTP verified → complete login ── */
  const handleOTPVerified=()=>{
    const u=pendingUser.current;
    if(!u) return;
    const fn=u.first_name||u.firstName||"";
    const ln=u.last_name||u.lastName||"";
    const displayName=buildDisplayName({firstName:fn,lastName:ln,email:u.email});
    const session={
      id:u.id, name:displayName,
      firstName:fn, lastName:ln,
      email:u.email, mobile:u.mobile||null, org:u.org||null,
      avatar:displayName[0].toUpperCase(), token:uid()
    };
    saveSession(session);
    addNotif(u.id,{title:"Login Successful",body:`Welcome back, ${fn||displayName}! OTP verified.`,type:"success"});
    onAuth(session);
  };

  const proceedToOTP=(user,emailForOTP)=>{
    pendingUser.current=user;
    otpEmail.current=emailForOTP||user.email;
    setStage("otp");
  };

  /* ── REGISTER ── */
  const handleRegister=async()=>{
    reset();
    if(!firstName.trim()) return setErr("First name is required.");
    if(!lastName.trim()) return setErr("Last name is required.");
    if(!regEmail.includes("@")) return setErr("Enter a valid email address.");
    if(mobile && !/^\+?[\d\s\-]{7,15}$/.test(mobile)) return setErr("Enter a valid mobile number.");
    if(regPw.length<8) return setErr("Password must be at least 8 characters.");
    if(regPw!==regPw2) return setErr("Passwords do not match.");
    setLoading(true);
    try{
      const emailKey=regEmail.trim().toLowerCase();
      const existing=await getUserByEmail(emailKey);
      if(existing){ setLoading(false); return setErr("An account with this email already exists. Please log in."); }
      const username=`${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s/g,"");
      const u={
        id:uid(),
        first_name:firstName.trim(), last_name:lastName.trim(),
        // keep camelCase only for in-memory session use — NOT sent to Supabase
        firstName:firstName.trim(), lastName:lastName.trim(),
        email:emailKey, mobile:mobile.trim()||null,
        username, org:org.trim()||null,
        /* In supabase mode the credential of record lives in Supabase Auth;
           this column is kept only so a rollback to custom mode still works. */
        pw_hash:await hashPassword(regPw),
        created_at:nowISO(),
        avatar:firstName[0].toUpperCase(),
      };
      /* In supabase mode the credential of record is created SERVER-side first.
         If that fails the account is not written at all — better no account than
         a profile row with no way to authenticate against it. */
      if(SBAuth.usingSupabaseAuth){
        try{
          const {needsEmailConfirm}=await SBAuth.signUp(emailKey,regPw,
            {first_name:u.first_name,last_name:u.last_name});
          await upsertUser(u);
          setLoading(false);
          if(needsEmailConfirm){
            return setErr("Account created. Please confirm your email address, "
              +"then sign in.");
          }
          addNotif(u.id,{title:"Welcome to eVTOL Sizer!",body:`Hi ${u.firstName}, your account is ready.`,type:"success"});
          return proceedToOTP(u,emailKey);
        }catch(e){
          setLoading(false);
          return setErr("Registration failed: "+e.message);
        }
      }

      await upsertUser(u);
      setLoading(false);
      addNotif(u.id,{title:"Welcome to eVTOL Sizer!",body:`Hi ${u.firstName}, your account is ready.`,type:"success"});
      proceedToOTP(u,emailKey);
    }catch(e){
      setLoading(false);
      setErr("Registration failed — check your connection and try again. "+e.message);
    }
  };

  /* ── LOGIN ── */
  const handleLogin=async()=>{
    reset();
    if(!loginId.trim()) return setErr("Enter your email, mobile, or username.");
    if(!loginPw) return setErr("Password is required.");
    setLoading(true);
    try{
      const u=await findUser(loginId.trim());
      if(!u){
        setLoading(false);
        return setErr("No account found with that email, mobile, or username.");
      }
      const storedHash=u.pw_hash||u.pwHash||"";

      /* ── SUPABASE AUTH PATH (opt-in, VITE_AUTH_MODE=supabase) ─────────
         Passwords are verified SERVER-side against bcrypt; the credential
         never reaches this client. Legacy accounts migrate on first sign-in,
         and only after their password has been proven against the local hash —
         so a leaked hash cannot be used to mint an auth account. */
      if(SBAuth.usingSupabaseAuth){
        let signedIn=false;
        try{
          await SBAuth.signIn(u.email, loginPw);
          signedIn=true;
        }catch(_){
          const m=await SBAuth.migrateLegacyAccount(
            u.email, loginPw,
            async(pw)=>(await verifyPassword(pw,storedHash)).ok,
            {first_name:u.first_name||"", last_name:u.last_name||""});
          if(m.migrated) signedIn=true;
          else if(m.needsEmailConfirm){
            setLoading(false);
            return setErr("Your account needs migrating and this project has email "
              +"confirmation enabled. Check your inbox, then sign in again.");
          }
        }
        if(!signedIn){
          setLoading(false);
          setLoginPwErr("Wrong password. Please try again.");
          return;
        }
        setLoading(false);
        proceedToOTP(u,u.email);
        return;
      }

      /* ── CUSTOM TABLE PATH (default) ──────────────────────────────── */
      const {ok,needsUpgrade}=await verifyPassword(loginPw,storedHash);
      if(!ok){
        setLoading(false);
        setLoginPwErr("Wrong password. Please try again.");
        return;
      }
      /* Transparent migration off the old reversible base64 form. Runs only
         after the password is already proven correct, and a failure here must
         never block a valid login. */
      if(needsUpgrade){
        try{
          const upgraded=await hashPassword(loginPw);
          await upsertUser({...u, pw_hash:upgraded, pwHash:upgraded});
        }catch(_){ /* migration is best-effort; the user is already verified */ }
      }
      setLoading(false);
      proceedToOTP(u,u.email);
    }catch(e){
      setLoading(false);
      setErr("Login failed — check your connection. "+e.message);
    }
  };

  /* ── GOOGLE ── */
  const handleGoogle=async()=>{
    reset();
    if(!googleEmail.trim()) return setErr("Enter your Gmail address.");
    if(!googleEmail.includes("@")) return setErr("Enter a valid email.");
    setLoading(true);
    try{
      const gEmail=googleEmail.trim().toLowerCase();
      let u=await getUserByEmail(gEmail);
      if(!u){
        const nameParts=gEmail.split("@")[0].replace(/[._]/g," ").split(" ");
        u={id:uid(),
          first_name:nameParts[0]||"", last_name:nameParts[1]||"",
          firstName:nameParts[0]||"", lastName:nameParts[1]||"",
          email:gEmail, mobile:null, username:gEmail.split("@")[0], org:null,
          pw_hash:"", provider:"google",
          created_at:nowISO(), avatar:(nameParts[0]||"G")[0].toUpperCase()};
        await upsertUser(u);
      }
      setLoading(false);
      proceedToOTP(u,gEmail);
    }catch(e){
      setLoading(false);
      setErr("Google sign-in failed — check your connection. "+e.message);
    }
  };

  /* ── FORGOT PASSWORD ── */
  const handleForgotSend=async()=>{
    reset();
    if(!forgotEmail.includes("@")) return setErr("Enter your registered email.");
    setLoading(true);
    try{
      const u=await getUserByEmail(forgotEmail.trim().toLowerCase());
      if(!u){ setLoading(false); return setErr("No account found with that email."); }
      setLoading(false);
      otpEmail.current=forgotEmail.trim().toLowerCase();
      pendingUser.current=u;
      setStage("reset_otp");
    }catch(e){
      setLoading(false);
      setErr("Could not reach server — check your connection. "+e.message);
    }
  };

  /* ── ORG SSO ── */
  const handleOrg=async()=>{
    reset();
    if(!orgName.trim()) return setErr("Enter your organization name.");
    if(!orgCode.trim()) return setErr("Enter your SSO access code.");
    setLoading(true);
    try{
      /* Demo SSO code. This is an authentication BYPASS: anyone who knows the
         string gets an account. It is behind an env var so it can be changed
         without a code change, and it should be disabled entirely in
         production by setting VITE_SSO_CODE empty. */
      /* DEFAULT IS DISABLED, NOT "WSU2025". .env.example already describes this
         as "AN AUTHENTICATION BYPASS: anyone who knows this string can create an
         account" and says to set it empty in production -- while the code
         defaulted to a guessable literal that shipped in the public bundle. The
         guard below already handles empty by disabling SSO sign-up. */
      const SSO_CODE=(import.meta.env.VITE_SSO_CODE ?? "").toUpperCase();
      if(!SSO_CODE){ setLoading(false); return setErr("SSO sign-up is disabled."); }
      if(orgCode.toUpperCase()!==SSO_CODE){ setLoading(false); return setErr("Invalid SSO code."); }
      const name=orgName.trim();
      const mockEmail=`user@${name.toLowerCase().replace(/\s+/g,"")}.edu`;
      let u=await getUserByEmail(mockEmail);
      if(!u){
        u={id:uid(), first_name:"SSO", last_name:"User",
          firstName:"SSO", lastName:"User",
          email:mockEmail, mobile:null,
          username:`sso_${name.toLowerCase().replace(/\s/g,"")}`, org:name,
          pw_hash:"", created_at:nowISO(), avatar:name[0].toUpperCase()};
        await upsertUser(u);
      }
      setLoading(false);
      proceedToOTP(u,mockEmail);
    }catch(e){
      setLoading(false);
      setErr("SSO failed — check your connection. "+e.message);
    }
  };

  const GoogleSVG=()=>(
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );

  const stageTitles={
    creds:{login:"Sign In",register:"Create Account",forgot:"Forgot Password",org:"Organization Login"},
    otp:"Verify OTP", reset_otp:"Verify Your Email", reset_pw:"Reset Password",
  };

  const getTitle=()=>{
    if(stage==="otp") return "Verify OTP";
    if(stage==="reset_otp") return "Verify Your Email";
    if(stage==="reset_pw") return "Reset Password";
    return stageTitles.creds[flow]||"Sign In";
  };

  /* Escape closes it, as it does every dialog in the tool. */
  useEffect(()=>{
    const k=(e)=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",k);
    return()=>document.removeEventListener("keydown",k);
  },[onClose]);

  return portal(
    <div className="gc-scrim" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="gc-dialog" role="dialog" aria-modal="true" aria-labelledby="gc-auth-title" style={{padding:"22px 26px 24px"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:16}}>
          <div>
            <div className="gc-eyebrow" style={{fontSize:10,marginBottom:4}}>Aerospace design suite</div>
            <h2 id="gc-auth-title" style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"-0.01em",color:C.text,fontFamily:SANS}}>{getTitle()}</h2>
          </div>
          <button onClick={onClose} type="button" className="gc-icon-btn" aria-label="Close"><Icon name="close" size={18}/></button>
        </div>

        {/* The account database's state: an annunciator lamp and words */}
        <div className="gc-well" role="status" style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",marginBottom:16,
          fontSize:12,color:C.muted,fontFamily:SANS}}>
          <span className="gc-lamp" aria-hidden="true" data-state={dbStatus==="ok"?"nominal":dbStatus==="error"?"warning":"caution"}/>
          {dbStatus==="checking"&&"Connecting to the account database..."}
          {dbStatus==="ok"&&"Account database connected: your account works on every device"}
          {dbStatus==="error"&&"Account database unreachable: check your internet connection"}
        </div>

        {/* ── OTP VERIFY (after login/register/google/org) ── */}
        {stage==="otp"&&(
          <OTPScreen email={otpEmail.current} onVerified={handleOTPVerified}
            onBack={()=>{ setStage("creds"); setErr(""); }}
            title="Verify Your Identity"/>
        )}

        {/* ── OTP VERIFY (for forgot password) ── */}
        {stage==="reset_otp"&&(
          <OTPScreen email={otpEmail.current}
            onVerified={()=>setStage("reset_pw")}
            onBack={()=>{ setStage("creds"); setFlow("forgot"); setErr(""); }}
            title="Verify to Reset Password"/>
        )}

        {/* ── RESET PASSWORD ── */}
        {stage==="reset_pw"&&(
          <ResetPasswordScreen email={otpEmail.current}
            onDone={()=>{
              setStage("creds"); setFlow("login");
              setErr("");
              // show success
              setTimeout(()=>setErr("✓ Password reset! Please sign in with your new password."),100);
            }}/>
        )}

        {/* ── CREDENTIALS STAGE ── */}
        {stage==="creds"&&(
          <>
            {err&&<Alert type={err.startsWith("✓")?"success":"error"}>{err.replace(/^✓\s*/,"")}</Alert>}

            {/* ════ LOGIN ════ */}
            {flow==="login"&&(
              <>
                {showGoogleInput?(
                  <div className="gc-well" style={{padding:"12px 14px",marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <GoogleSVG/>
                      <span style={{fontSize:11,fontWeight:700,color:C.text,fontFamily:SANS}}>Continue with Google</span>
                      <button onClick={()=>{setShowGoogleInput(false);reset();}} type="button" className="gc-icon-btn"
                        aria-label="Close" style={{marginLeft:"auto",width:28,height:28}}><Icon name="close" size={15}/></button>
                    </div>
                    <div style={{fontSize:11.5,color:C.muted,fontFamily:SANS,marginBottom:8}}>OTP will be sent to this email to verify.</div>
                    <Input value={googleEmail} onChange={setGoogleEmail} placeholder="yourname@gmail.com" autoFocus type="email"/>
                    <Btn variant="google" fullWidth onClick={handleGoogle} loading={loading}>Send code and continue</Btn>
                  </div>
                ):(
                  <Btn variant="google" fullWidth onClick={()=>{reset();setShowGoogleInput(true);}}>
                    <GoogleSVG/> Continue with Google
                  </Btn>
                )}
                <Divider text="or sign in with credentials"/>
                <Input label="Email / Mobile / Username" value={loginId} onChange={v=>{setLoginId(v);setLoginPwErr("");}}
                  placeholder="email, +1234567890, or username" autoFocus={!showGoogleInput}
                  hint="You can sign in with your email, mobile number, or username"/>
                <Input label="Password" type="password" value={loginPw} onChange={v=>{setLoginPw(v);setLoginPwErr("");}}
                  placeholder="••••••••" error={loginPwErr}/>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:-8,marginBottom:14}}>
                  <button onClick={()=>switchFlow("forgot")} type="button"
                    style={{background:"none",border:"none",color:C.amber,fontSize:11.5,cursor:"pointer",fontFamily:SANS,padding:0,fontWeight:700}}>
                    Forgot password?
                  </button>
                </div>
                <Btn variant="primary" fullWidth onClick={handleLogin} loading={loading}>Sign in and verify</Btn>
                <Divider text="other options"/>
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="secondary" fullWidth onClick={()=>switchFlow("org")}><Icon name="building" size={15}/>Organization sign-in (SSO)</Btn>
                </div>
                <div style={{textAlign:"center",marginTop:16,fontSize:11,color:C.muted,fontFamily:SANS}}>
                  No account?{" "}
                  <button onClick={()=>switchFlow("register")} type="button"
                    style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:11,fontFamily:SANS,fontWeight:700,padding:0}}>
                    Create one
                  </button>
                </div>
              </>
            )}

            {/* ════ REGISTER ════ */}
            {flow==="register"&&(
              <>
                {showGoogleInput?(
                  <div className="gc-well" style={{padding:"12px 14px",marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <GoogleSVG/>
                      <span style={{fontSize:11,fontWeight:700,color:C.text,fontFamily:SANS}}>Sign up with Google</span>
                      <button onClick={()=>{setShowGoogleInput(false);reset();}} type="button" className="gc-icon-btn"
                        aria-label="Close" style={{marginLeft:"auto",width:28,height:28}}><Icon name="close" size={15}/></button>
                    </div>
                    <Input value={googleEmail} onChange={setGoogleEmail} placeholder="yourname@gmail.com" autoFocus type="email"/>
                    <Btn variant="google" fullWidth onClick={handleGoogle} loading={loading}>Send code to Gmail</Btn>
                  </div>
                ):(
                  <Btn variant="google" fullWidth onClick={()=>{reset();setShowGoogleInput(true);}}>
                    <GoogleSVG/> Sign up with Google
                  </Btn>
                )}
                <Divider text="or create with email"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Input label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" autoFocus/>
                  <Input label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith"/>
                </div>
                <Input label="Email Address" type="email" value={regEmail} onChange={setRegEmail} placeholder="jane@example.com"/>
                <Input label="Mobile Number (optional)" value={mobile} onChange={setMobile} placeholder="+1 234 567 8900"
                  hint="Used for login — include country code"/>
                <Input label="Organization (optional)" value={org} onChange={setOrg} placeholder="Wright State University"/>
                <Input label="Password" type="password" value={regPw} onChange={setRegPw} placeholder="Min. 8 characters"/>
                <PasswordStrength password={regPw}/>
                <Input label="Confirm Password" type="password" value={regPw2} onChange={setRegPw2} placeholder="Repeat password"/>
                <div style={{fontSize:11,color:C.subtle,fontFamily:SANS,marginBottom:14,lineHeight:1.7,
                  background:C.bg,padding:"8px 10px",borderRadius:6,border:`1px solid ${C.border}`}}>
                  Your username will be auto-generated as: <span style={{color:C.amber}}>
                    {firstName&&lastName?`${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s/g,""):"firstnamelastname"}
                  </span>
                </div>
                <div style={{fontSize:11,color:C.subtle,fontFamily:SANS,marginBottom:14,lineHeight:1.6}}>
                  By creating an account you agree to our Terms of Service and Privacy Policy. An OTP will be sent to verify your email.
                </div>
                <Btn variant="primary" fullWidth onClick={handleRegister} loading={loading}>Create account and verify email</Btn>
                <div style={{textAlign:"center",marginTop:16,fontSize:11,color:C.muted,fontFamily:SANS}}>
                  Already have one?{" "}
                  <button onClick={()=>switchFlow("login")} type="button"
                    style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:11,fontFamily:SANS,fontWeight:700,padding:0}}>
                    Sign in
                  </button>
                </div>
              </>
            )}

            {/* ════ FORGOT PASSWORD ════ */}
            {flow==="forgot"&&(
              <>
                <div style={{fontSize:11,color:C.muted,fontFamily:SANS,marginBottom:16,lineHeight:1.7}}>
                  Enter your registered email. We'll send an OTP to verify your identity before letting you set a new password.
                </div>
                <Input label="Registered Email" type="email" value={forgotEmail} onChange={setForgotEmail}
                  placeholder="jane@example.com" autoFocus/>
                <Btn variant="primary" fullWidth onClick={handleForgotSend} loading={loading}>Send verification code</Btn>
                <div style={{textAlign:"center",marginTop:16}}>
                  <button onClick={()=>switchFlow("login")} type="button"
                    style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11.5,fontFamily:SANS}}>
                    <Icon name="arrowLeft" size={14} style={{verticalAlign:"-2px",marginRight:4}}/>Back to sign in
                  </button>
                </div>
              </>
            )}

            {/* ════ ORG / SSO ════ */}
            {flow==="org"&&(
              <>
                <div style={{fontSize:11,color:C.muted,fontFamily:SANS,marginBottom:16,lineHeight:1.7}}>
                  Sign in via your institution's SSO portal. OTP verification is still required.
                </div>
                <Input label="Organization / Institution" value={orgName} onChange={setOrgName}
                  placeholder="Wright State University" autoFocus/>
                <Input label="SSO Access Code" value={orgCode} onChange={setOrgCode}
                  placeholder="provided by your institution"/>
                {/* THE PAGE USED TO PRINT THE CODE. "Demo SSO code: WSU2025" was
                    rendered directly under the input, in amber, on the public
                    sign-up form -- so the access code was not merely guessable,
                    it was displayed to every visitor, and it shipped in the
                    built bundle. An access control that publishes its own key
                    is not an access control. */}
                <div style={{fontSize:11,color:C.subtle,fontFamily:SANS,marginBottom:14}}>
                  Contact your institution's administrator for an access code.
                </div>
                <Btn variant="blue" fullWidth onClick={handleOrg} loading={loading}><Icon name="building" size={15}/>Authenticate and send code</Btn>
                <Divider text="supported providers"/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:8}}>
                  {["Okta","Azure AD","Google Workspace","Shibboleth","SAML 2.0"].map(p=>(
                    <span key={p} style={{fontSize:11,color:C.muted,background:C.inset,border:`1px solid ${C.border}`,
                      borderRadius:4,padding:"3px 8px",fontFamily:SANS}}>{p}</span>
                  ))}
                </div>
                <div style={{textAlign:"center",marginTop:16}}>
                  <button onClick={()=>switchFlow("login")} type="button"
                    style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11.5,fontFamily:SANS}}>
                    <Icon name="arrowLeft" size={14} style={{verticalAlign:"-2px",marginRight:4}}/>Back to sign in
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   NOTIFICATION CENTER
   ══════════════════════════════════════════════════════════════ */
function NotifCenter({user,onClose}){
  const[notifs,setNotifs]=useState([]);
  useEffect(()=>{ getNotifs(user.id).then(n=>setNotifs(n||[])).catch(()=>{}); },[user.id]);
  const markAll=async()=>{
    const updated=notifs.map(n=>({...n,read:true}));
    setNotifs(updated);
    await Promise.all(updated.filter(n=>!n.read).map(n=>markNotifRead(n.id)));
  };
  const markOne=async(id)=>{
    setNotifs(prev=>prev.map(n=>n.id===id?{...n,read:true}:n));
    await markNotifRead(id);
  };
  const del=async(id)=>{
    setNotifs(prev=>prev.filter(n=>n.id!==id));
    await deleteNotif(id);
  };
  const kinds={info:["info",C.advisory],success:["check",C.nominal],warn:["alert",C.caution],error:["error",C.warning]};
  const unread=notifs.filter(n=>!n.read).length;
  return(
    <div className="gc-pop" role="dialog" aria-modal="false" aria-label="Notifications"
      style={{padding:0,display:"flex",flexDirection:"column",maxHeight:"min(70dvh, 460px)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14,fontWeight:600,color:C.text}}>Notifications</span>
          {unread>0&&<span style={{background:C.accent,color:C.accentInk,fontSize:11,borderRadius:10,padding:"1px 7px",fontWeight:700}}>{unread}</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {unread>0&&<button onClick={markAll} type="button" className="gc-link" style={{fontSize:12}}>Mark all read</button>}
          <button onClick={onClose} type="button" className="gc-icon-btn" aria-label="Close notifications"><Icon name="close" size={16}/></button>
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        {notifs.length===0?(
          <div style={{padding:"26px 16px",textAlign:"center",color:C.muted,fontSize:12.5}}>
            <IconBadge name="bell" tone={C.muted}/>No notifications yet
          </div>
        ):notifs.map(n=>{
          const[ic,col]=kinds[n.type]||["bell",C.muted];
          return(
            <div key={n.id} onClick={()=>markOne(n.id)}
              style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,
                background:n.read?"transparent":`color-mix(in srgb, ${C.accent} 7%, transparent)`,
                display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
              <span style={{color:col,display:"inline-flex",marginTop:1}}><Icon name={ic} size={16}/></span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
                  <span style={{fontSize:12.5,fontWeight:n.read?400:600,color:C.text}}>{n.title}</span>
                  {!n.read&&<span aria-label="Unread" style={{width:7,height:7,borderRadius:"50%",background:C.accent,flexShrink:0}}/>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2,lineHeight:1.5}}>{n.body}</div>
                <div style={{fontSize:11,color:C.subtle,fontFamily:MONO,marginTop:3}}>{fmtTime(n.time)}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();del(n.id);}} type="button" className="gc-icon-btn"
                aria-label="Delete notification" style={{width:26,height:26}}><Icon name="close" size={13}/></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DIALOG FRAME — profile, designs and reports open in this
   ══════════════════════════════════════════════════════════════ */
function Popup({title,subtitle,onClose,children,width=520}){
  const titleId=useId();
  useEffect(()=>{
    const k=(e)=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",k);
    return()=>document.removeEventListener("keydown",k);
  },[onClose]);
  return portal(
    <div className="gc-scrim" style={{zIndex:2000}} onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="gc-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{width:`min(${width}px, 100%)`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,
          padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div>
            <div className="gc-eyebrow" style={{fontSize:10,marginBottom:4}}>Aerospace design suite</div>
            <h2 id={titleId} style={{margin:0,fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>{title}</h2>
            {subtitle&&<div style={{fontSize:12,color:C.muted,marginTop:3,fontFamily:SANS}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} type="button" className="gc-icon-btn" aria-label="Close"><Icon name="close" size={18}/></button>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"18px 22px 22px"}}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Profile Modal ── */
function ProfileModal({user,onClose,onUpdate}){
  const[fu,setFu]=useState(null);
  const[loadingUser,setLoadingUser]=useState(true);

  useEffect(()=>{
    getUserByEmail(user.email).then(data=>{
      setFu(data);
      setLoadingUser(false);
    }).catch(()=>setLoadingUser(false));
  },[user.email]);

  // Smart name parsing — handle all account types
  const parsedFirstName=(()=>{
    if(fu?.first_name) return fu.first_name;
    if(fu?.firstName) return fu.firstName;
    const n=(fu?.name||user.name||user.firstName||"").trim();
    if(n && n!=="undefined undefined" && n!=="undefined") return n.split(" ")[0]||"";
    return (user.email||"").split("@")[0]||"";
  })();
  const parsedLastName=(()=>{
    if(fu?.last_name) return fu.last_name;
    if(fu?.lastName) return fu.lastName;
    const n=(fu?.name||user.name||"").trim();
    if(n && n!=="undefined undefined" && n!=="undefined"){
      const parts=n.split(" ");
      return parts.slice(1).join(" ")||"";
    }
    return user.lastName||"";
  })();

  const[firstName,setFirstName]=useState(user.firstName||"");
  const[lastName,setLastName]=useState(user.lastName||"");
  const[mobile,setMobile]=useState(user.mobile||"");
  const[org,setOrg]=useState(user.org||"");
  const[saving,setSaving]=useState(false);
  const[saved,setSaved]=useState(false);
  const[showPwSection,setShowPwSection]=useState(false);
  const[oldPw,setOldPw]=useState("");
  const[newPw,setNewPw]=useState("");
  const[newPw2,setNewPw2]=useState("");
  const[pwErr,setPwErr]=useState("");
  const[pwOk,setPwOk]=useState("");

  // Once fu loads from Supabase, sync fields
  useEffect(()=>{
    if(fu){
      setFirstName(fu.first_name||fu.firstName||parsedFirstName);
      setLastName(fu.last_name||fu.lastName||parsedLastName);
      setMobile(fu.mobile||user.mobile||"");
      setOrg(fu.org||user.org||"");
    }
  },[fu]);

  // Auto-generate username from name if not set
  const username=fu?.username||(parsedFirstName+parsedLastName).toLowerCase().replace(/\s/g,"")||user.email.split("@")[0];

  const handleSave=async()=>{
    setSaving(true);
    try{
      const u=await getUserByEmail(user.email);
      if(u){
        const updatedUser={...u,
          first_name:firstName.trim(), last_name:lastName.trim(),
          firstName:firstName.trim(), lastName:lastName.trim(),
          mobile:mobile.trim()||null,
          org:org.trim()||null,
          username:u.username||username,
        };
        await upsertUser(updatedUser);
        const newName=`${firstName.trim()} ${lastName.trim()}`.trim()||parsedFirstName;
        const updatedSession={
          ...getSession(),
          name:newName,
          firstName:firstName.trim(),
          lastName:lastName.trim(),
          mobile:mobile.trim()||null,
          org:org.trim()||null,
          avatar:newName[0].toUpperCase(),
        };
        saveSession(updatedSession);
        onUpdate(updatedSession);
        addNotif(user.id,{title:"Profile Updated",body:"Your profile details have been saved.",type:"success"});
      }
      setSaving(false); setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    }catch(e){
      setSaving(false);
      console.error("Profile save failed:",e);
    }
  };

  const handlePasswordChange=async()=>{
    setPwErr(""); setPwOk("");
    try{
      const u=await getUserByEmail(user.email);
      if(!u) return setPwErr("Account not found.");
      const storedHash=u.pw_hash||u.pwHash||"";
      const {ok:oldOk}=await verifyPassword(oldPw,storedHash);
      if(!oldOk) return setPwErr("Current password is incorrect.");
      if(newPw.length<8) return setPwErr("New password must be ≥ 8 characters.");
      if(newPw!==newPw2) return setPwErr("New passwords do not match.");
      const newHash=await hashPassword(newPw);
      await upsertUser({...u, pw_hash:newHash, pwHash:newHash});
      addNotif(user.id,{title:"Password Changed",body:"Your password has been updated successfully.",type:"success"});
      setPwOk("✓ Password changed successfully!");
      setOldPw(""); setNewPw(""); setNewPw2("");
      setTimeout(()=>setShowPwSection(false),1500);
    }catch(e){
      setPwErr("Failed to update password — check connection. "+e.message);
    }
  };

  const displayAvatar=(firstName[0]||parsedFirstName[0]||user.email[0]||"?").toUpperCase();
  const displayFullName=`${firstName} ${lastName}`.trim()||parsedFirstName;

  const fields=[
    {label:"First Name",value:firstName,set:setFirstName,placeholder:"Enter first name"},
    {label:"Last Name",value:lastName,set:setLastName,placeholder:"Enter last name"},
    {label:"Email Address",value:user.email,set:()=>{},placeholder:"",disabled:true},
    {label:"Mobile Number",value:mobile,set:setMobile,placeholder:"+1 234 567 8900"},
    {label:"Organization",value:org,set:setOrg,placeholder:"e.g. Wright State University"},
    {label:"Username",value:username,set:()=>{},placeholder:"",disabled:true},
  ];

  return(
    <Popup title="My profile" subtitle={`Joined ${fu?.createdAt?new Date(fu.createdAt).toLocaleDateString():"—"}`} onClose={onClose} width={500}>
      <div className="pf-who" style={{marginBottom:18,padding:14,borderRadius:14,border:`1px solid ${C.rim}`,background:"rgb(var(--glass-rgb) / 0.5)"}}>
        <span className="pf-avatar is-big" aria-hidden="true">{initialsOf(displayFullName)||displayAvatar}</span>
        <div style={{minWidth:0}}>
          <h2>{displayFullName}</h2>
          <p>{user.email}</p>
          {username&&<p style={{fontFamily:MONO,fontSize:12}}>@{username}</p>}
          {(org||fu?.org)&&<p style={{display:"flex",alignItems:"center",gap:5}}><Icon name="building" size={13}/>{org||fu?.org}</p>}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:"2px 12px",marginBottom:8}}>
        {fields.map(({label,value,set,placeholder,disabled})=>(
          <ProfileField key={label} label={label} value={value} set={set} placeholder={placeholder} disabled={disabled}/>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} type="button" className="gc-key gc-key-on"
        style={{width:"100%",minHeight:40,fontSize:13.5,fontWeight:600,marginBottom:16}}>
        {saving?<><Spinner/>Saving...</>:saved?<><Icon name="check" size={16}/>Saved</>:"Save changes"}
      </button>

      {/* Change password */}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16}}>
        <button onClick={()=>setShowPwSection(s=>!s)} type="button" className="gc-key" aria-expanded={showPwSection}
          style={{marginBottom:showPwSection?12:0}}>
          <Icon name="key" size={15}/>{showPwSection?"Hide password change":"Change password"}
        </button>
        {showPwSection&&(
          <div className="gc-well" style={{padding:14}}>
            {pwErr&&<Alert type="error">{pwErr}</Alert>}
            {pwOk&&<Alert type="success">{pwOk.replace(/^✓\s*/,"")}</Alert>}
            {[["Current password",oldPw,setOldPw],["New password",newPw,setNewPw],["Confirm new password",newPw2,setNewPw2]].map(([lbl,val,setVal])=>(
              <Input key={lbl} label={lbl} type="password" value={val} onChange={setVal} placeholder="••••••••"/>
            ))}
            <Btn variant="primary" onClick={handlePasswordChange}>Update password</Btn>
          </div>
        )}
      </div>
    </Popup>
  );
}

/* ── My Designs Modal ── */
function MyDesignsModal({user,onClose}){
  const[designs,setDesigns]=useState([]);
  const[loading,setLoading]=useState(true);
  const[confirm,setConfirm]=useState(null);

  useEffect(()=>{
    getDesigns(user.id).then(d=>{
      // Supabase stores params/results as JSON strings, parse them back
      setDesigns((d||[]).map(x=>({
        ...x,
        params: typeof x.params==="string"?JSON.parse(x.params||"{}"):x.params,
        results: typeof x.results==="string"?JSON.parse(x.results||"{}"):x.results,
        pdfHtml: x.pdf_html||x.pdfHtml||null,
        savedAt: x.saved_at||x.savedAt,
      })));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[user.id]);

  const handleDelete=async(id)=>{
    setDesigns(prev=>prev.filter(d=>d.id!==id));
    await deleteDesign(id);
    setConfirm(null);
  };

  const handleDownload=(d)=>{
    if(!d.pdfHtml){ alert("No PDF saved for this design. Re-save it from the main app."); return; }
    const w=window.open("","_blank");
    w.document.write(d.pdfHtml);
    w.document.close();
    addNotif(user.id,{title:"Report Opened",body:`PDF report for "${d.name}" opened.`,type:"info"});
  };

  return(
    <Popup title="My Designs" subtitle={loading?"Loading...":
      `${designs.length} saved design${designs.length!==1?"s":""}`} onClose={onClose} width={580}>
      {loading?(
        <div style={{textAlign:"center",padding:"48px 0",color:C.muted,fontFamily:SANS}}>
          <Spinner size={22}/><div style={{marginTop:10}}>Loading your designs...</div>
        </div>
      ):designs.length===0?(
        <div style={{textAlign:"center",padding:"48px 0",color:C.muted}}>
          <IconBadge name="plane"/>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:8}}>No saved designs yet</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,lineHeight:1.7}}>
            Use <b style={{color:C.text}}>Save design</b> in the eVTOL sizer's header<br/>to keep the current design here.
          </div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {designs.map(d=>(
            <div key={d.id} className="pf-card" style={{display:"block",padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:SANS,marginBottom:4,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                  <div style={{fontSize:11.5,color:C.muted,fontFamily:SANS,marginBottom:8}}>
                    Saved {fmtTime(d.savedAt)}
                  </div>
                  {d.results&&(
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[
                        ["MTOW",d.results.MTOW+"kg",C.amber],
                        ["Energy",d.results.Etot+"kWh",C.teal],
                        ["Hover",d.results.Phov+"kW",C.blue],
                        ["L/D",d.results.LDact,C.green],
                      ].map(([lbl,val,col])=>(
                        <div key={lbl} className="gc-lcd" style={{padding:"3px 8px"}}>
                          <span style={{fontSize:11,color:C.muted,fontFamily:SANS}}>{lbl}: </span>
                          <span style={{fontSize:11.5,color:C.text,fontFamily:MONO,fontWeight:600}}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>handleDownload(d)} type="button" className="gc-key" style={{minHeight:30}}>
                    <Icon name="download" size={14}/>PDF
                  </button>
                  <button onClick={()=>setConfirm(d.id)} type="button" className="gc-key" aria-label={`Delete ${d.name}`}
                    style={{minHeight:30,padding:"0 9px",color:C.warning}}>
                    <Icon name="trash" size={14}/>
                  </button>
                </div>
              </div>
              {confirm===d.id&&(
                <div style={{marginTop:10,padding:"10px 12px",background:`${C.red}11`,border:`1px solid ${C.red}44`,borderRadius:6,
                  display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:11,color:C.red,fontFamily:SANS}}>Delete "{d.name}"?</span>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>handleDelete(d.id)} type="button"
                      style={{padding:"4px 12px",background:C.red,border:"none",borderRadius:4,color:"#fff",fontSize:11.5,cursor:"pointer",fontFamily:SANS,fontWeight:700}}>
                      Delete
                    </button>
                    <button onClick={()=>setConfirm(null)} type="button"
                      style={{padding:"4px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,fontSize:11.5,cursor:"pointer",fontFamily:SANS}}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Popup>
  );
}

/* ── Report History Modal ── */
function ReportHistoryModal({user,onClose}){
  const[reports,setReports]=useState([]);
  const[loadingR,setLoadingR]=useState(true);

  useEffect(()=>{
    getReports(user.id).then(r=>{
      setReports((r||[]).map(x=>({
        ...x,
        results: typeof x.results==="string"?JSON.parse(x.results||"{}"):x.results,
        pdfHtml: x.pdf_html||x.pdfHtml||null,
        generatedAt: x.generated_at||x.generatedAt,
      })));
      setLoadingR(false);
    }).catch(()=>setLoadingR(false));
  },[user.id]);

  const handleOpen=(r)=>{
    if(!r.pdfHtml){ alert("PDF not available for this report."); return; }
    const w=window.open("","_blank");
    w.document.write(r.pdfHtml);
    w.document.close();
  };

  const handleDelete=async(id)=>{
    setReports(prev=>prev.filter(r=>r.id!==id));
    await deleteReport(id);
  };

  return(
    <Popup title="Report History" subtitle={loadingR?"Loading...":
      `${reports.length} report${reports.length!==1?"s":""} generated`} onClose={onClose} width={580}>
      {loadingR?(
        <div style={{textAlign:"center",padding:"48px 0",color:C.muted,fontFamily:SANS}}>
          <Spinner size={22}/><div style={{marginTop:10}}>Loading report history...</div>
        </div>
      ):reports.length===0?(
        <div style={{textAlign:"center",padding:"48px 0"}}>
          <IconBadge name="file"/>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:8}}>No reports yet</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,lineHeight:1.7}}>
            Make a <b style={{color:C.text}}>PDF report</b> from the eVTOL sizer's header<br/>and it is kept here.
          </div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {reports.map(r=>(
            <div key={r.id} className="pf-card" style={{padding:"14px 16px",
              display:"flex",alignItems:"center",gap:14}}>
              <div aria-hidden="true" style={{width:40,height:40,borderRadius:10,display:"grid",placeItems:"center",flexShrink:0,
                color:C.accent,background:`color-mix(in srgb, ${C.accent} 12%, transparent)`}}><Icon name="file" size={20}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,fontFamily:SANS,marginBottom:2,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                <div style={{fontSize:11.5,color:C.muted,fontFamily:SANS}}>{fmtTime(r.generatedAt)}</div>
                {r.results&&(
                  <div style={{fontSize:11.5,color:C.subtle,fontFamily:SANS,marginTop:3}}>
                    MTOW: {r.results.MTOW}kg · E: {r.results.Etot}kWh · SM: {(r.results.SM*100)?.toFixed(1)}%
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>handleOpen(r)} type="button" className="gc-key" style={{minHeight:30}}>
                  <Icon name="download" size={14}/>Open PDF
                </button>
                <button onClick={()=>handleDelete(r.id)} type="button" className="gc-key" aria-label={`Delete ${r.name}`}
                  style={{minHeight:30,padding:"0 9px",color:C.warning}}>
                  <Icon name="trash" size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Popup>
  );
}

/* ══════════════════════════════════════════════════════════════
   PROFILE CARD — the pop-up under the avatar (the SysML course's
   profile pop-up, in this palette): who is signed in, the account
   menu, and the display settings. A non-modal dialog: Escape or a
   click outside closes it, and focus returns to the avatar.
   ══════════════════════════════════════════════════════════════ */
function ProfileCard({user,popRef,popStyle,onClose,onSignIn,onRegister,onSignOut,onOpenProfile,onOpenDesigns,onOpenReports}){
  const[fu,setFu]=useState(null);
  useEffect(()=>{ if(user?.email) getUserByEmail(user.email).then(setFu).catch(()=>{}); },[user?.email]);
  /* close first, then open: the dialogs mount after the card has gone */
  const go=(fn)=>()=>{ onClose(false); setTimeout(()=>fn&&fn(),50); };
  if(!user) return(
    <div ref={popRef} id="gc-profile" className="gc-pop" role="dialog" aria-modal="false" aria-labelledby="gc-profile-h" style={popStyle}>
      <div className="pf-who">
        <span className="pf-avatar is-big" aria-hidden="true"><Icon name="user" size={24}/></span>
        <div>
          <h2 id="gc-profile-h">Your profile</h2>
          <p>Not signed in. Sign in to keep designs and reports in your account.</p>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button type="button" className="gc-key gc-key-on" style={{flex:1,minHeight:36}} onClick={go(onSignIn)}>Sign in</button>
        <button type="button" className="gc-key" style={{flex:1,minHeight:36}} onClick={go(onRegister)}>Create account</button>
      </div>
      <DisplaySettings/>
    </div>
  );
  const displayName=buildDisplayName({...fu,...user});
  const org=fu?.org||user.org;
  return(
    <div ref={popRef} id="gc-profile" className="gc-pop" role="dialog" aria-modal="false" aria-labelledby="gc-profile-h" style={popStyle}>
      <div className="pf-who">
        <span className="pf-avatar is-big" aria-hidden="true">{initialsOf(displayName)}</span>
        <div style={{minWidth:0}}>
          <h2 id="gc-profile-h">{displayName}</h2>
          <p>{user.email}</p>
        </div>
      </div>
      {(org||fu?.mobile||fu?.username)&&(
        <div className="pf-card" style={{marginTop:12,fontSize:12.5,color:C.muted}}>
          {org&&<span style={{display:"flex",alignItems:"center",gap:7}}><Icon name="building" size={14}/>{org}</span>}
          {fu?.mobile&&<span style={{display:"flex",alignItems:"center",gap:7}}><Icon name="phone" size={14}/>{fu.mobile}</span>}
          {fu?.username&&<span style={{display:"flex",alignItems:"center",gap:7,fontFamily:MONO}}><Icon name="user" size={14}/>@{fu.username}</span>}
        </div>
      )}
      <ul className="pf-menu">
        <li><button type="button" onClick={go(onOpenProfile)}><Icon name="user" size={16}/>Profile and settings</button></li>
        <li><button type="button" onClick={go(onOpenDesigns)}><Icon name="designs" size={16}/>My designs</button></li>
        <li><button type="button" onClick={go(onOpenReports)}><Icon name="file" size={16}/>Report history</button></li>
        <li><button type="button" className="is-danger" onClick={()=>{ onClose(false); onSignOut(); }}><Icon name="logout" size={16}/>Sign out</button></li>
      </ul>
      <DisplaySettings/>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   AUTH GATE
   ══════════════════════════════════════════════════════════════ */
function AuthGate({user,onAuth,children}){
  const[showModal,setShowModal]=useState(false);
  const pendingCb=useRef(null);
  const handleCapture=(e)=>{
    e.stopPropagation(); e.preventDefault();
    pendingCb.current=children.props.onClick||null;
    setShowModal(true);
  };
  const handleAuthSuccess=(session)=>{
    setShowModal(false); onAuth(session);
    const cb=pendingCb.current;
    if(cb) setTimeout(()=>cb(),200);
  };
  return(
    <>
      <div style={{position:"relative",display:"inline-flex"}}>
        {children}
        {!user&&(
          <div onClick={handleCapture} title="Sign in required"
            style={{position:"absolute",inset:0,zIndex:10,cursor:"pointer",borderRadius:"inherit",background:"transparent"}}/>
        )}
      </div>
      {showModal&&<AuthModal onClose={()=>setShowModal(false)} onAuth={handleAuthSuccess}/>}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   USER HEADER BAR — modal state lives here so the dialogs survive
   the profile card closing
   ══════════════════════════════════════════════════════════════ */
function UserHeaderBar({user,onSignOut,onSignIn,onRegister,onUpdate}){
  const[showNotifs,setShowNotifs]=useState(false);
  const[showProfile,setShowProfile]=useState(false);
  /* WHERE THE CARD SITS. It is drawn on <body>, placed under the avatar
     and kept inside the window: anchored inside the header it ran off the
     bottom of a phone screen and the status bar was painted over it (the
     header and the status bar are both stacking contexts at z 40). */
  const[popPos,setPopPos]=useState(null);
  const placeCard=()=>{
    const r=avatarRef.current?.getBoundingClientRect(); if(!r) return;
    const W=window.innerWidth,H=window.innerHeight,width=Math.min(360,W-24);
    const top=Math.round(r.bottom+10);
    setPopPos({position:"fixed",top,right:Math.round(Math.min(Math.max(12,W-r.right-4),W-width-12)),
      maxHeight:Math.max(220,H-top-12),zIndex:1500});
  };
  const[notifCount,setNotifCount]=useState(0);
  const notifRef=useRef(null);
  const avatarRef=useRef(null);
  const popRef=useRef(null);

  // Modal state lives HERE — not inside the profile card
  const[showProfileModal,setShowProfileModal]=useState(false);
  const[showDesignsModal,setShowDesignsModal]=useState(false);
  const[showReportsModal,setShowReportsModal]=useState(false);

  useEffect(()=>{
    if(!user) return;
    getNotifs(user.id).then(n=>setNotifCount((n||[]).filter(x=>!x.read).length)).catch(()=>{});
  },[user,showNotifs]);

  const closeProfile=(refocus)=>{ setShowProfile(false); if(refocus) avatarRef.current?.focus(); };

  /* Notifications: a click outside closes them. */
  useEffect(()=>{
    if(!showNotifs) return undefined;
    const h=(e)=>{ if(notifRef.current&&!notifRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener("pointerdown",h);
    return()=>document.removeEventListener("pointerdown",h);
  },[showNotifs]);

  /* The profile card: focus moves into it; Escape or a click outside closes it. */
  useEffect(()=>{
    if(!showProfile) return undefined;
    popRef.current?.querySelector("button, input")?.focus();
    window.addEventListener("resize",placeCard);
    window.addEventListener("scroll",placeCard,true);
    const key=(e)=>{ if(e.key==="Escape"){ e.stopPropagation(); closeProfile(true); } };
    const down=(e)=>{
      if(!popRef.current?.contains(e.target)&&!avatarRef.current?.contains(e.target)) closeProfile(false);
    };
    document.addEventListener("keydown",key);
    document.addEventListener("pointerdown",down);
    return()=>{
      document.removeEventListener("keydown",key); document.removeEventListener("pointerdown",down);
      window.removeEventListener("resize",placeCard); window.removeEventListener("scroll",placeCard,true);
    };
  },[showProfile]);

  const displayName=user?buildDisplayName(user):"";

  return(
    <>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginLeft:"auto",alignItems:"center"}}>
        {!user&&(
          <>
            <button onClick={onSignIn} type="button" className="gc-key">Sign in</button>
            <button onClick={onRegister||onSignIn} type="button" className="gc-key gc-key-on">Register</button>
          </>
        )}
        {user&&(
          <div ref={notifRef} className="pf-wrap">
            <button onClick={()=>{setShowNotifs(s=>!s);setShowProfile(false);}} type="button" className="gc-key"
              aria-label={notifCount>0?`Notifications, ${notifCount} unread`:"Notifications"} aria-expanded={showNotifs}
              style={{padding:"0 9px",position:"relative"}}>
              <Icon name="bell" size={16}/>
              {notifCount>0&&<span aria-hidden="true" style={{position:"absolute",top:-5,right:-5,background:C.accent,color:C.accentInk,
                fontSize:11.5,borderRadius:10,padding:"1px 5px",fontWeight:700,fontFamily:MONO,minWidth:16,textAlign:"center",lineHeight:"14px"}}>
                {notifCount>9?"9+":notifCount}
              </span>}
            </button>
            {showNotifs&&<NotifCenter user={user} onClose={()=>setShowNotifs(false)}/>}
          </div>
        )}

        {/* The avatar: the profile card, and the display settings, signed in or not */}
        <div className="pf-wrap">
          <button ref={avatarRef} type="button" className="pf-avatar"
            aria-haspopup="dialog" aria-expanded={showProfile} aria-controls={showProfile?"gc-profile":undefined}
            title={user?`${displayName}: profile and display settings`:"Profile and display settings"}
            onClick={()=>{ if(!showProfile) placeCard(); setShowProfile(s=>!s);setShowNotifs(false);}}>
            {user?<span aria-hidden="true">{initialsOf(displayName)}</span>:<Icon name="user" size={18}/>}
            <span className="gc-sr">Profile and display settings</span>
          </button>
          {showProfile&&portal(
            <ProfileCard
              user={user}
              popRef={popRef}
              popStyle={popPos||undefined}
              onClose={closeProfile}
              onSignIn={onSignIn}
              onRegister={onRegister||onSignIn}
              onSignOut={onSignOut}
              onOpenProfile={()=>setShowProfileModal(true)}
              onOpenDesigns={()=>setShowDesignsModal(true)}
              onOpenReports={()=>setShowReportsModal(true)}
            />
          )}
        </div>
      </div>

      {/* The dialogs: rendered here, outside the card, and onto <body> */}
      {user&&showProfileModal&&(
        <ProfileModal
          user={user}
          onClose={()=>setShowProfileModal(false)}
          onUpdate={s=>{ onUpdate&&onUpdate(s); }}
        />
      )}
      {user&&showDesignsModal&&(
        <MyDesignsModal
          user={user}
          onClose={()=>setShowDesignsModal(false)}
        />
      )}
      {user&&showReportsModal&&(
        <ReportHistoryModal
          user={user}
          onClose={()=>setShowReportsModal(false)}
        />
      )}
    </>
  );
}

/* ── EXPORTS ── */
export { AuthModal, AuthGate, UserHeaderBar, NotifCenter, getSession, saveSession, clearSession, addNotif, saveDesign, addReport, getDesigns, getReports };
