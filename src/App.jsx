import { mark } from "./ui/marks.jsx";
import React, { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from "react";
import { AuthGate, UserHeaderBar, saveSession, clearSession, addNotif, saveDesign, addReport, setAuthTheme } from "./AuthSystem";
import { useAuthSession } from "./lib/auth-session.jsx";
import { ShareDesignButton, LeaderboardPanel, CollabPanel, PublicDesignBanner } from "./CommunityFeatures";
import { WBEnvelopePanel, ComponentDBPanel } from "./Components";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, RadarChart, Radar,
  ComposedChart, ScatterChart, Scatter,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Cell, PieChart, Pie
} from "recharts";
import { runSizing } from "./engine";
import { CONFIGURATIONS, resolveConfiguration, capabilitiesFor, CONFIG_DEFAULTS, rotorDiameterFor, solveRotorDiameter, oeiThrustMarginFor, twRatioFor, oeiPowerFactorFor } from "./engine/configuration.js";
import { REFERENCE_MISSIONS, referenceMissionFor } from "./engine/mission.js";
import { evaluateProfile } from "./engine/profile.js";
import { PROPOSED_N_LIMIT_MANOEUVRE, PROPOSED_N_LIMIT_MANOEUVRE_NEG, SC_VTOL_N_LIMIT_FLOOR, SC_VTOL_N_NEG_FLOOR, N_LIMIT_MANOEUVRE_INPUT_RANGE } from "./engine/loadcases.js";
import { makeISA } from "./engine/atmosphere.js";
import { constraintDiagram } from "./engine/constraints.js";
import { uncertaintyBand } from "./engine/uncertainty.js";
import { compareConfigurations } from "./engine/explore.js";
import * as ENGINE_CFG from "./engine/configuration.js";


/* ═══════════════════════════════════════════════════════════════════════
   OPENVSP ANGELSCRIPT GENERATOR  v4
   Mirrors the exact confirmed-working API pattern exactly.
   Run in OpenVSP: File -> Run Script -> Execute
   ═══════════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════════
   OPENVSP VSP3 GENERATOR  — rewritten to match joby_s2.vsp3 exactly
   TypeIDs confirmed from reference: Wing=5, Fuselage=4, Disk(Custom)=9
   Disk geometry uses CustomGeom + AngelScript (copied verbatim from joby)
   Fuselage: 5-station ellipse, tangent angles at nose(90°) and tail(-90°)
   Wing/VTail: WING type, two XSec sections, NACA four-series airfoil
   All parm elements: <Name Value="sci_notation" ID="10_CHAR_ID"/>
   ═══════════════════════════════════════════════════════════════════════ */
import { AIAssistantPanel } from "./panels/AIAssistantPanel.jsx";
import { Acc, KPI, Panel, Slider } from "./ui/primitives.jsx";
import { StatusBar } from "./ui/StatusBar.jsx";
import { BEMPanel } from "./panels/BEMPanel.jsx";
import { CFDChecklist } from "./panels/CFDChecklist.jsx";
import { CrossSectionPreview } from "./panels/CrossSectionPreview.jsx";
import { DARK, LIGHT, PHC, SC, applyTheme } from "./lib/theme.js";
import { DesignGallery } from "./panels/DesignGallery.jsx";
import { DesignSpacePanel } from "./panels/DesignSpacePanel.jsx";
import { DesignVersionHistory } from "./panels/DesignVersionHistory.jsx";
import { makeDesignRecord, readDesignRecord, recordFromRow, recordToRow, runRecord, checkContinuity, engineInputs, reserveDistanceKm, reserveMinutesOf, engineLabel, appVersionLabel } from "./lib/designfile.js";
import { DesignNotice, continuityNotice } from "./ui/DesignNotice.jsx";
import { ResultWarnings } from "./ui/ResultWarnings.jsx";
import { PowertrainContext } from "./ui/Provenance.jsx";
import { resultWarnings } from "./lib/warnings.js";
import { generateCPACS } from "./export/cpacs.js";
import { traceabilityCSV } from "./export/traceability.js";
import { vtolContext, quadPlaneParameters, px4VtolParameters, vtolHeader } from "./export/autopilot-vtol.js";
import { writeArduPilotParam, writeQgcParams } from "./export/autopilot-format.js";
import { DragPie, MTOWPie, PhaseDurationPie } from "./panels/charts.jsx";
import { RegTrackerPanel } from "./panels/RegTrackerPanel.jsx";
import { SensPanel } from "./panels/SensPanel.jsx";
import { SensitivityAnalysis } from "./panels/SensitivityAnalysis.jsx";
import { TABS, TAB_GROUPS, GROUP_KEYS } from "./lib/tabs.js";
import DesignModeSwitch, { requestDesignMode } from "./classes/aircraft/DesignModeSwitch.jsx";
import { pressCSS, tap } from "./ui/feedback.js";
import { publishAudit } from "./ui/audit.js";

/* ── ADDRESSABLE STATE ────────────────────────────────────────────────
   Read once, at mount. These set INITIAL state and then get out of the
   way — the app is not a router and pretending otherwise would mean
   keeping history in sync with every click for no benefit. */
const QS = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search) : new URLSearchParams();
const qsTab = (() => {
  const v = parseInt(QS.get("tab"), 10);
  return Number.isInteger(v) && v >= 0 && v < TABS.length ? v : null;
})();
const qsGroup = qsTab == null ? null
  : Math.max(0, TAB_GROUPS.findIndex(g => g.tabs.includes(qsTab)));
const qsTheme = QS.get("theme") === "dark" ? true
              : QS.get("theme") === "light" ? false : null;
const qsAudit = QS.get("audit") === "1";

import { hiddenTabs, tailTabLabel, TAB } from "./lib/tabvisibility.js";
import { OverviewTab } from "./tabs/OverviewTab.jsx";
import { MissionTab } from "./tabs/MissionTab.jsx";
import { WingAeroTab } from "./tabs/WingAeroTab.jsx";
import { PropulsionTab } from "./tabs/PropulsionTab.jsx";
import { BatteryTab } from "./tabs/BatteryTab.jsx";
import { PerformanceTab } from "./tabs/PerformanceTab.jsx";
import { StabilityTab } from "./tabs/StabilityTab.jsx";
import { VTailTab } from "./tabs/VTailTab.jsx";
import { ConvergenceTab } from "./tabs/ConvergenceTab.jsx";
import { MonteCarloTab } from "./tabs/MonteCarloTab.jsx";
import { CertificationTab } from "./tabs/CertificationTab.jsx";
import { NoiseTab } from "./tabs/NoiseTab.jsx";
import { CostTab } from "./tabs/CostTab.jsx";
import { MissionBuilderTab } from "./tabs/MissionBuilderTab.jsx";
import { WeatherTab } from "./tabs/WeatherTab.jsx";
import { OpenVSPTab } from "./tabs/OpenVSPTab.jsx";
import { CommunityTab } from "./tabs/CommunityTab.jsx";
import { VnDiagramTab } from "./tabs/VnDiagramTab.jsx";
import { ConstraintDiagramTab } from "./tabs/ConstraintDiagramTab.jsx";
import { CompareLayoutsTab } from "./tabs/CompareLayoutsTab.jsx";
import { UncertaintyTab } from "./tabs/UncertaintyTab.jsx";
import { VspModelsTab } from "./tabs/VspModelsTab.jsx";
import { TabErrorBoundary } from "./ui/ErrorBoundary.jsx";
import { generateReport } from "./export/report.js";
import { generateVSP3File } from "./export/vsp3.js";

/* ═══════════════════════════════════════════════════════════════════════
   APP — composition root
   ═══════════════════════════════════════════════════════════════════════
   Holds design state, runs the sizing engine, and lays out the tab shell.
   Everything that is not orchestration lives in a sibling module:
       engine/    physics (pure, validated, golden-master tested)
       lib/       theme, tab metadata, unit helpers, persistence
       ui/        presentational primitives (Slider, KPI, Panel, Acc)
       panels/    self-contained analysis panels
       export/    OpenVSP .vsp3 and the HTML/PDF report generator
   The 25 tab bodies are still inline below; they are the next thing to move
   out into tabs/, and are the reason this file is still large.
   ═══════════════════════════════════════════════════════════════════════ */

import { DEFAULT_PARAMS } from "./lib/defaults.js";
export { DEFAULT_PARAMS };

export default function App(){
  const[params,setParams]=useState(DEFAULT_PARAMS);
  /* The continuity check of the design last opened, kept with the exact
     inputs object it was opened with: it describes THAT design, so it stops
     being reported the moment the user edits anything. */
  const[openedDesign,setOpenedDesign]=useState(null);
  const[tab,setTab]=useState(qsTab ?? 0);
  const[activeGroup,setActiveGroup]=useState(qsGroup ?? 0);
  /* ── TABS FOLLOW THE CONFIGURATION ───────────────────────────────────
     A rotor-borne layout has no wing and no tail, and the tabs that depend
     on them do not merely go quiet — they print zeros and NaN (Swing 0,
     Vstall 0, Svt_total NaN, SM NaN on the multicopter). Showing NaN where
     a number belongs tells the user something false, so those tabs are
     hidden. The rule reads configuration.js's own capabilities, so a new
     layout gets the right tabs without touching the UI. */
  const cfgCap=useMemo(()=>capabilitiesFor(params.configType,params.nPropHover)||{},
    [params.configType,params.nPropHover]);
  const hiddenForCfg=useMemo(()=>hiddenTabs(cfgCap),[cfgCap]);
  /* If the selected tab has just been hidden by a configuration change, fall
     back to the first visible tab in the group rather than rendering a blank
     panel the user cannot navigate away from. */
  useEffect(()=>{
    if(!hiddenForCfg.has(tab))return;
    const g=TAB_GROUPS[activeGroup];
    const next=(g?.tabs||[]).find(i=>!hiddenForCfg.has(i));
    if(next!=null)setTab(next);
    else{
      for(let gi=0;gi<TAB_GROUPS.length;gi++){
        const alt=TAB_GROUPS[gi].tabs.find(i=>!hiddenForCfg.has(i));
        if(alt!=null){setActiveGroup(gi);setTab(alt);break;}
      }
    }
  },[hiddenForCfg,tab,activeGroup]);

  const[showOverflow,setShowOverflow]=useState(false);
  const[sidebarOpen,setSidebarOpen]=useState(()=>window.innerWidth>768&&localStorage.getItem("sb")!=="0");
  /* THE SESSION IS NOT THIS COMPONENT'S ANY MORE. Root mounts all three
     studios at once and holds one session above them, so this reads it
     rather than keeping a second copy that could disagree with the
     aircraft and drone headers. */
  const auth=useAuthSession();
  const user=auth?auth.user:null;
  const setShowAuthModal=(v)=>{ if(auth) v?auth.openAuth():auth.closeAuth(); };
  const[darkMode,setDarkMode]=useState(()=>qsTheme ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true));
  const[useImperial,setUseImperial]=useState(false);

  /* ── SELF-AUDIT, ONLY WHEN ASKED ──────────────────────────────────────
     Runs after the sizing loop has settled and the tab has painted, so the
     audit sees the screen a person would see rather than a mid-render one.
     Inert without ?audit=1. */
  useEffect(()=>{
    if(!qsAudit) return;
    const id=setTimeout(()=>{
      publishAudit({ tab, tabLabel: TABS[tab], theme: darkMode?"dark":"light" });
    }, 1200);
    return ()=>clearTimeout(id);
  },[tab,darkMode]);

  const prevSRRef=useRef(null);
  const overflowRef=useRef(null);
  const[deltaMap,setDeltaMap]=useState({});
  const undoStackRef=useRef([]);   // stores param snapshots — ref avoids re-render
  const redoStackRef=useRef([]);
  const[undoCount,setUndoCount]=useState(0); // triggers re-render for button state
  const[redoCount,setRedoCount]=useState(0);
  const[showPdfBranding,setShowPdfBranding]=useState(false);

  // ── Branding Supabase sync ──────────────────────────────────────────────
  const BRAND_SB_URL = import.meta.env.VITE_SUPABASE_URL;
  const BRAND_SB_KEY = import.meta.env.VITE_SUPABASE_KEY;
  const BRAND_HDR = {"apikey": BRAND_SB_KEY, "Authorization": "Bearer " + BRAND_SB_KEY, "Content-Type": "application/json"};
  const BRAND_LS_KEY = "evtol_pdfBranding";
  const brandDebounce = useRef(null);
  const [brandSynced, setBrandSynced] = useState(false); // true once remote load attempted

  // Initialise from localStorage immediately (zero delay on refresh)
  const[pdfBranding,setPdfBranding]=useState(()=>{
    try{
      const saved=localStorage.getItem("evtol_pdfBranding");
      if(saved){
        const parsed=JSON.parse(saved);
        return {...parsed, date:new Date().toLocaleDateString()};
      }
    }catch(_){}
    return {authorName:"", university:"Wright State University",
      projectTitle:"eVTOL Sizing Analysis", logoUrl:"", date:new Date().toLocaleDateString()};
  });

  // Guard: prevent the save useEffect from firing when WE loaded from Supabase
  const brandLoadedFromRemote = useRef(false);

  // ── LOAD: fetch branding from Supabase when user logs in ──
  useEffect(()=>{
    if(!user?.id){ setBrandSynced(false); return; }
    setBrandSynced(false);
    fetch(BRAND_SB_URL+"/rest/v1/evtol_user_branding?user_id=eq."+encodeURIComponent(user.id)+"&limit=1",
      {headers:BRAND_HDR})
      .then(r=>{
        if(!r.ok) throw new Error("HTTP "+r.status);
        return r.json();
      })
      .then(rows=>{
        if(rows && rows.length>0 && rows[0].branding_json){
          try{
            const remote = JSON.parse(rows[0].branding_json);
            // Set guard BEFORE calling setPdfBranding so the save effect skips this update
            brandLoadedFromRemote.current = true;
            setPdfBranding({...remote, date:new Date().toLocaleDateString()});
            localStorage.setItem(BRAND_LS_KEY, JSON.stringify(remote));
          }catch(e){ /* parse error — ignore malformed remote branding */ }
        } else {
          // No saved branding for this user yet — use defaults
        }
        setBrandSynced(true);
      })
      .catch(()=>{
        setBrandSynced(true);
      });
  },[user?.id]);

  // ── SAVE: persist branding to localStorage + Supabase on every user change ──
  // Skips the first fire that comes from the remote load above (brandLoadedFromRemote guard)
  useEffect(()=>{
    // Always keep localStorage in sync
    try{ localStorage.setItem(BRAND_LS_KEY, JSON.stringify(pdfBranding)); }catch(_){}

    // Skip saving back to Supabase when the change originated FROM Supabase (avoid echo loop)
    if(brandLoadedFromRemote.current){
      brandLoadedFromRemote.current = false;
      return;
    }

    if(!user?.id) return;

    if(brandDebounce.current) clearTimeout(brandDebounce.current);
    brandDebounce.current = setTimeout(async ()=>{
      try{
        // Use PUT (update) first, fall back to POST (insert) if no row exists yet
        // This is more reliable than merge-duplicates for large payloads
        const payload = {
          user_id:       user.id,
          branding_json: JSON.stringify(pdfBranding),
          updated_at:    new Date().toISOString(),
        };

        // Try UPSERT via POST with on-conflict update
        const resp = await fetch(BRAND_SB_URL+"/rest/v1/evtol_user_branding",{
          method:"POST",
          headers:{
            ...BRAND_HDR,
            "Prefer":"resolution=merge-duplicates,return=minimal",
          },
          body:JSON.stringify(payload),
        });

        if(resp.ok){
          setBrandSynced(true);
        } else {
          // Fallback: try PATCH (update existing row)
          const patchResp = await fetch(
            BRAND_SB_URL+"/rest/v1/evtol_user_branding?user_id=eq."+encodeURIComponent(user.id),{
            method:"PATCH",
            headers:{...BRAND_HDR,"Prefer":"return=minimal"},
            body:JSON.stringify({
              branding_json: JSON.stringify(pdfBranding),
              updated_at:    new Date().toISOString(),
            }),
          });
          if(patchResp.ok){
            setBrandSynced(true);
          }
        }
      }catch(e){ /* network error — branding saved locally via localStorage */ }
    }, 2000);
  },[pdfBranding]);
  // Monte Carlo state
  const[mcRanges,setMcRanges]=useState({
    sedCell:   {min:250, max:350, dist:"normal"},
    ewf:       {min:0.43,max:0.57,dist:"normal"},
    LD:        {min:11,  max:17,  dist:"normal"},
    etaHov:    {min:0.62,max:0.78,dist:"normal"},
    etaSys:    {min:0.73,max:0.87,dist:"normal"},
    etaBat:    {min:0.85,max:0.95,dist:"normal"},
    AR:        {min:7,   max:11,  dist:"normal"},
    payload:   {min:410, max:500, dist:"uniform"},
    propDiam:  {min:2.0, max:4.0, dist:"uniform"},
    vCruise:   {min:55,  max:80,  dist:"uniform"},
    range:     {min:150, max:230, dist:"uniform"},
    nPropHover:{min:4,   max:8,   dist:"uniform"},
  });
  const[mcN,setMcN]=useState(1000);
  // ── Cost model user-adjustable overrides ─────────────────────────────
  const[costElecRate,setCostElecRate]=useState(0.16);         // $/kWh grid rate
  const[costCellKwh,setCostCellKwh]=useState(149);            // $/kWh cell cost (2024 NMC BNEF)
  const[costMotorPerKw,setCostMotorPerKw]=useState(100);      // $/kW motor replacement
  const[costFlightsPerDay,setCostFlightsPerDay]=useState(10); // utilisation
  const[customAirfoilInput,setCustomAirfoilInput]=useState("");
  const[customAFError,setCustomAFError]=useState("");
  const[customAFData,setCustomAFData]=useState(null);
  const[mcResults,setMcResults]=useState(null);
  const[mcRunning,setMcRunning]=useState(false);

  // Mission Builder state
  const PHASE_TYPES={
    hover:    {label:"Hover",      icon:"",col:"#ff6b35",fields:["duration","altitude"], defaults:{duration:60,altitude:15}},
    climb:    {label:"Climb",      icon:"",col:"#ffd23f",fields:["distance","angle"],    defaults:{distance:5,angle:5}},
    cruise:   {label:"Cruise",     icon:"", col:"#06d6a0",fields:["distance","speed"],   defaults:{distance:50,speed:67}},
    descent:  {label:"Descent",    icon:"",col:"#118ab2",fields:["distance","angle"],    defaults:{distance:4,angle:4}},
    divert:   {label:"Divert",     icon:"↗", col:"#8338ec",fields:["distance","speed"],   defaults:{distance:20,speed:60}},
    reserve:  {label:"Reserve",    icon:"",col:"#6c757d",fields:["distance","speed"],    defaults:{distance:40,speed:47}},
    loiter:   {label:"Loiter",     icon:"",col:"#e91e63",fields:["duration","altitude"],  defaults:{duration:120,altitude:100}},
    wind_corr:{label:"Wind Corr",  icon:"",col:"#00bcd4",fields:["distance","windSpeed"],defaults:{distance:10,windSpeed:15}},
  };
  const uid2=()=>Math.random().toString(36).slice(2,8);
  const[customPhases,setCustomPhases]=useState([
    {id:uid2(),type:"hover",  duration:30,  altitude:15,  label:"Takeoff Hover"},
    {id:uid2(),type:"climb",  distance:5,   angle:5,      label:"Climb"},
    {id:uid2(),type:"cruise", distance:200, speed:67,     label:"Cruise"},
    {id:uid2(),type:"descent",distance:4,   angle:4,      label:"Descent"},
    {id:uid2(),type:"hover",  duration:30,  altitude:15,  label:"Landing Hover"},
    {id:uid2(),type:"reserve",distance:40,  speed:47,     label:"Reserve"},
  ]);
  const[dragIdx,setDragIdx]=useState(null);
  const[dragOverIdx,setDragOverIdx]=useState(null);
  const[mbResults,setMbResults]=useState(null);

  // Weather & Atmosphere state
  const[wxSearch,setWxSearch]=useState("");
  const[wxData,setWxData]=useState(null);
  const[wxLoading,setWxLoading]=useState(false);
  const[wxError,setWxError]=useState("");
  const[wxResults,setWxResults]=useState(null);
  const WX_PRESETS=[
    {name:"Denver, CO",   lat:39.7392,lon:-104.9903,alt:1609,flag:""},
    {name:"Miami, FL",    lat:25.7617,lon:-80.1918, alt:1,   flag:""},
    {name:"Chicago, IL",  lat:41.8781,lon:-87.6298, alt:182, flag:""},
    {name:"Los Angeles",  lat:34.0522,lon:-118.2437,alt:71,  flag:""},
    {name:"London, UK",   lat:51.5074,lon:-0.1278,  alt:11,  flag:""},
    {name:"Dubai, UAE",   lat:25.2048,lon:55.2708,  alt:5,   flag:""},
    {name:"Singapore",    lat:1.3521, lon:103.8198, alt:15,  flag:""},
    {name:"Dayton, OH",   lat:39.7589,lon:-84.1916, alt:306, flag:""},
  ];

  // Update global C on every render based on theme
  applyTheme(darkMode);   // mutates the shared SC object in place
  // Sync theme to AuthSystem so modal inputs also update
  setAuthTheme(darkMode);

  /* ── SIGNIFICANT FIGURES: DO NOT CLAIM PRECISION THE MODEL HAS NOT GOT ──
     Masses, powers and energies were displayed to one decimal place, so MTOW
     read "3752.0 kg" — five significant figures, implying the answer is good
     to fifty grams. It is not. The measured mean absolute error against NASA's
     documentation-grade reference vehicles is ~14% (validation/nasa-configs),
     and ~62% against brochure-grade industrial aircraft
     (validation/validate). At 14% the honest precision on 3752 kg is roughly
     +/- 500 kg, i.e. THREE significant figures is already generous and two
     would be strictly defensible.

     Six-figure output on a two-figure answer is what makes a conceptual sizing
     tool look invented rather than computed — the reader cannot tell the model
     from the arithmetic. Rounding to 3 s.f. does not lose anything real; it
     stops the display asserting something the validation does not support.

     Applied to the SCALING quantities only. Ratios, coefficients and
     dimensionless values keep their own formatting, and the underlying engine
     values are untouched — this is a display layer. */
  const sig3 = (v, min = 0.01) => {
    if (!isFinite(v)) return v;
    if (v === 0) return 0;
    const a = Math.abs(v);
    const dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    const r = +v.toFixed(dp);
    return Math.abs(r) < min ? +v.toPrecision(3) : r;
  };

  /* ── FORMATTERS MUST SURVIVE A QUANTITY THAT DOES NOT EXIST ──────────
     Every U.* formatter called `.toFixed()` on its argument directly. That is
     fine for a winged aircraft, where every geometric quantity is defined —
     and fatal for a ROTOR-BORNE one, where the engine CORRECTLY returns null
     for wing area, neutral point, static margin, V-tail dimensions and the
     rest, because those things do not exist on an aircraft with no wing.

     `U.len(SR.xNP)` on a multicopter therefore threw "Cannot read properties
     of null", during render, which took the whole OpenVSP tab down and showed
     the user a blank panel with no error at all.

     Guarding here rather than at each of the ~200 call sites: a formatter is
     exactly the right place to decide how a missing quantity is displayed, and
     "—" is the honest rendering of "this aircraft has no such dimension". */
  const nd_ = (fn) => (v) => (v == null || !isFinite(v) ? "—" : fn(v));

  // ── Unit conversion utility — physics always in SI, display layer converts ──
  const U = useImperial ? {
    mass:    nd_((kg)  => sig3(kg  * 2.20462)),     massU:  "lb",
    dist:    nd_((km)  => +(km * 0.539957).toFixed(1)), distU: "nm",
    speed:   nd_((ms)  => +(ms * 1.94384).toFixed(1)),  speedU:"kts",
    power:   nd_((kw)  => sig3(kw * 1.34102)),      powerU: "hp",
    area:    nd_((m2)  => +(m2 * 10.7639).toFixed(1)),  areaU: "ft²",
    len:     nd_((m)   => +(m  * 3.28084).toFixed(2)),  lenU:  "ft",
    sed:     nd_((whkg)=> +(whkg*0.453592).toFixed(1)), sedU: "Wh/lb",
    wl:      nd_((npm2)=> +(npm2*0.020885).toFixed(2)), wlU:  "lb/ft²",
    energy:  (kwh) => kwh,                            energyU:"kWh",
    // dimensionless — no conversion
    nd:      (v)   => v,                              ndU:    "",
  } : {
    mass:    nd_((kg)  => sig3(kg)),    massU:  "kg",
    dist:    nd_((km)  => +km.toFixed(1)), distU: "km",
    speed:   nd_((ms)  => +ms.toFixed(1)), speedU:"m/s",
    power:   nd_((kw)  => sig3(kw)),    powerU: "kW",
    area:    nd_((m2)  => +m2.toFixed(2)), areaU: "m²",
    len:     nd_((m)   => +m.toFixed(3)),  lenU:  "m",
    sed:     nd_((whkg)=> +whkg.toFixed(1)), sedU:"Wh/kg",
    wl:      nd_((npm2)=> +npm2.toFixed(1)), wlU: "N/m²",
    energy:  nd_((kwh) => sig3(kwh)),   energyU:"kWh",
    nd:      (v)   => v,                ndU:    "",
  };

  // ── Convert raw SI check val strings from runSizing → display units ──
  // runSizing produces val strings like "2968.3 kg", "185.8 km cruise | ..."
  // This converts numeric SI values in those strings to the active unit system.
  const convertCheckVal = useImperial ? (val) => {
    if (!val) return val;
    // Replace "NNN.N kg" patterns
    val = val.replace(/([\d.]+)\s*kg/g, (_, n) => `${+(+n * 2.20462).toFixed(1)} lb`);
    // Replace "NNN.N km" patterns
    val = val.replace(/([\d.]+)\s*km/g, (_, n) => `${+(+n * 0.539957).toFixed(1)} nm`);
    // Replace "NNN.N kW" patterns
    val = val.replace(/([\d.]+)\s*kW/g, (_, n) => `${+(+n * 1.34102).toFixed(1)} hp`);
    // Replace "NNN.N m/s" patterns
    val = val.replace(/([\d.]+)\s*m\/s/g, (_, n) => `${+(+n * 1.94384).toFixed(1)} kts`);
    // Replace "NNN.N m²" patterns
    val = val.replace(/([\d.]+)\s*m²/g, (_, n) => `${+(+n * 10.7639).toFixed(1)} ft²`);
    // Replace standalone " m" (length) — careful: only "NNN.N m " or "NNN.N m)" patterns
    val = val.replace(/([\d.]+)\s*m(?=\s|$|\)|,)/g, (_, n) => `${+(+n * 3.28084).toFixed(2)} ft`);
    return val;
  } : (val) => val; // SI — pass through unchanged

  // Dynamic tooltip style (reads current C — correct for both themes)
  const TTP = {
    contentStyle:{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:6,fontSize:12,
      color:SC.text,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",padding:"8px 12px"},
    labelStyle:{color:SC.muted,fontSize:12,fontWeight:600},
    itemStyle:{color:SC.text,fontSize:12},
  };

  // URL param: ?design=shareId for shared design loading
  const [sharedDesignId] = useState(()=>new URLSearchParams(window.location.search).get("design")||"");
  const [sharedSessionId] = useState(()=>new URLSearchParams(window.location.search).get("session")||"");

  // Auto-load shared design on page open (when ?design= is in URL)
  useEffect(()=>{
    if(!sharedDesignId) return;
    const SB_URL=import.meta.env.VITE_SUPABASE_URL;
    const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;
    fetch(`${SB_URL}/rest/v1/evtol_public_designs?share_id=eq.${sharedDesignId}&is_public=eq.true`,{
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":"application/json"}
    }).then(r=>r.json()).then(rows=>{
      if(!rows||!rows.length) return;
      const d=rows[0];
      // increment view count
      fetch(`${SB_URL}/rest/v1/evtol_public_designs?share_id=eq.${sharedDesignId}`,{
        method:"PATCH",
        headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"},
        body:JSON.stringify({view_count:(d.view_count||0)+1})
      }).catch(()=>{});
      try{
        openDesign(recordFromRow(d.params,d.results),{source:"shared link"});
      }catch(e){ setDesignNotice({tone:"error",title:"Could not open the shared design",lines:[e.message]}); }
    }).catch(()=>{});
  },[]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* Delegated: the provider persists and updates the one session.
     handleAuth is still needed here -- AuthGate and CollabPanel take it as
     a callback for the sign-in they trigger themselves. */
  const handleAuth=(session)=>auth?.handleAuth(session);
  const handleSignOut=()=>auth?.handleSignOut();
  const handleUpdate=(session)=>auth?.handleUpdate(session);

  /* ── CSV Export ── */
  const exportCSV=()=>{
    if(!SR) return;
    const rows=[
      ["eVTOL Sizer — Results Export","",""],
      ["Generated",new Date().toLocaleString(),""],
      ["","",""],
      ["=== WEIGHTS ===","",""],
      ["MTOW (kg)",SR.MTOW,""],
      ["Empty Weight (kg)",SR.Wempty,""],
      ["Battery Mass (kg)",SR.Wbat,""],
      ["Payload (kg)",params.payload,""],
      ["","",""],
      ["=== ENERGY & POWER ===","",""],
      ["Total Mission Energy (kWh)",SR.Etot,""],
      ["Pack Energy (kWh)",SR.PackkWh,""],
      ["Hover Power (kW)",SR.Phov,""],
      ["Climb Power (kW)",SR.Pcl,""],
      ["Cruise Power (kW)",SR.Pcr,""],
      ["Descent Power (kW)",SR.Pdc,""],
      ["Reserve Power (kW)",SR.Pres,""],
      ["","",""],
      ["=== PHASE TIMES (s) ===","",""],
      ["Takeoff",SR.tto,""],["Climb",SR.tcl,""],["Cruise",SR.tcr,""],
      ["Descent",SR.tdc,""],["Landing",SR.tld,""],["Reserve",SR.tres,""],
      ["Total",SR.Tend,""],
      ["","",""],
      ["=== AERODYNAMICS ===","",""],
      ["Wing Area (m²)",SR.Swing,""],["Wing Span (m)",SR.bWing,""],
      ["MAC (m)",SR.MAC,""],["Sweep (°)",SR.sweep,""],
      ["Actual L/D",SR.LDact,""],["CD0 total",SR.CD0tot,""],
      ["Mach",SR.Mach,""],["Reynolds ×10⁶",(SR.Re_/1e6).toFixed(2),""],
      ["Selected Airfoil",SR.selAF.name,""],
      ["","",""],
      ["=== PROPULSION ===","",""],
      ["Rotor Diameter AD (m)",SR.Drotor,""],["Tip Mach",SR.TipMach,""],
      ["RPM",SR.RPM,""],["Disk Loading (N/m²)",SR.DLrotor,""],
      ["Tip Speed (m/s)",SR.TipSpd,""],["Motor Power/rotor (kW)",SR.PmotKW,""],
      ["T/W hover",SR.TW_hover,""],["T/W cruise",SR.TW_cruise,""],
      ["","",""],
      ["=== STABILITY ===","",""],
      ["CG from nose (m)",SR.xCGtotal,""],["NP from nose (m)",SR.xNP,""],
      ["Static Margin baseline (% MAC)",(SR.SM*100).toFixed(2),""],
      ["Static Margin w/ V-tail (% MAC)",(SR.SM_vt*100).toFixed(2),""],
      ["","",""],
      ["=== BATTERY ===","",""],
      ["Pack Energy (kWh)",SR.PackkWh,""],["SED pack (Wh/kg)",SR.SEDpack,""],
      ["Cell config",`${SR.Nseries}s×${SR.Npar}p`,""],["Total cells",SR.Ncells,""],
      ["C-rate hover",SR.CrateHov,""],["C-rate cruise",SR.CrateCr,""],
      ["","",""],
      ["=== INPUT PARAMETERS ===","",""],
      ["Payload (kg)",params.payload,""],["Mission Range (km)",params.range,""],["Reserve Range (km)",SR?(SR.reserveDistKm||0):"—",""],["Total Range (km)",SR?(SR.totalRange||params.range):params.range,""],
      ["Cruise Speed (m/s)",params.vCruise,""],["Cruise Alt (m)",params.cruiseAlt,""],
      ["L/D",params.LD,""],["AR",params.AR,""],["Oswald e",params.eOsw,""],
      ["Design CL",params.clDesign,""],["EWF",params.ewf,""],
      ["Cell SED (Wh/kg)",params.sedCell,""],["Battery η",params.etaBat,""],
      ["Hover FOM",params.etaHov,""],["System η",params.etaSys,""],
      ["T/W ratio",params.twRatio,""],["Rotors",params.nPropHover,""],
    ];
    const csv=rows.map(rowArr=>rowArr.map(cellVal=>`"${cellVal}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`eVTOL_Results_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    if(user) addNotif(user.id,{title:"CSV Exported",body:"Results downloaded as spreadsheet.",type:"success"});
  };

  const deferredParams = useDeferredValue(params);
  const deferredCustomAF = useDeferredValue(customAFData);
  const SR=useMemo(()=>{
    try{
      /* The reserve-into-range transform lives in lib/designfile.js, so a
         reopened design is re-run through exactly the transform the screen
         uses. */
      return runSizing(engineInputs(deferredParams,deferredCustomAF));
    }catch{return null;}
  },[deferredParams,deferredCustomAF]);

  /* NASA-STD-7009B §4.3.8 warnings for the result on screen (lib/warnings.js).
     Built from deferredParams, the same state SR was computed from. */
  const resultWarn=useMemo(()=>{
    try{
      const continuity=openedDesign&&openedDesign.inputs===deferredParams?openedDesign.check:null;
      return resultWarnings({params:deferredParams,R:SR,continuity});
    }catch{return null;}
  },[deferredParams,SR,openedDesign]);

  // Track deltas for KPI header — show what changed after each slider move
  useEffect(()=>{
    if(!SR) return;
    const prev=prevSRRef.current;
    if(prev){
      const dm={};
      const keys=["MTOW","Etot","Phov","LDact","SM_vt"];
      keys.forEach(k=>{
        if(prev[k]!=null&&SR[k]!=null){
          const d=SR[k]-prev[k];
          if(Math.abs(d)>0.001) dm[k]=d;
        }
      });
      if(Object.keys(dm).length>0){
        setDeltaMap(dm);
        const tid=setTimeout(()=>setDeltaMap({}),2500);
        prevSRRef.current=SR;
        return()=>clearTimeout(tid);
      }
    }
    prevSRRef.current=SR;
  },[SR]);

  // ── Click-outside handler for overflow menu ──────────────────────────
  useEffect(()=>{
    if(!showOverflow) return;
    const handler=(e)=>{ if(overflowRef.current&&!overflowRef.current.contains(e.target)) setShowOverflow(false); };
    document.addEventListener('mousedown',handler);
    return()=>document.removeEventListener('mousedown',handler);
  },[showOverflow]);
  /* ── Mission Builder — compute custom mission ──
     BUG FIX: wrapped in useCallback so useEffect dependency is stable.
     Auto-triggers whenever customPhases or SR changes — no manual "Compute" needed. */
  /* ── Mission Builder ──────────────────────────────────────────────────
     REWRITTEN. This function used to carry its OWN copy of the flight physics,
     and it disagreed with the sizing loop it was describing. MEASURED at the
     app default: its hover power came out 890 kW against the loop's 674 kW
     (+32%) and its cruise 290 kW against 242 kW (+20%). Causes, all three the
     same kind of mistake:

       - it applied twRatio to STEADY hover. twRatio is an installed-thrust
         margin for the one-engine-out case, not a weight the aircraft hovers
         at. The Weather tab in this same file already had this right and says
         so in its own comment - so App.jsx contained a correct and an
         incorrect copy of one equation.
       - it used sea-level density for every segment regardless of altitude.
       - it used the LD INPUT (8.5) rather than the loop's computed LDact
         (10.19), which has been a derived quantity since the loop was closed.

     It now calls engine/profile.js, which takes every segment power from the
     CONVERGED RESULT and cannot disagree with it. validation/analysis-layers
     gates that the default profile reproduces the loop's own Etot exactly.
     Off-design cruise speeds are evaluated on the converged drag polar, which
     is gated to return Pcr at the design speed. */
  const computeCustomMission=useCallback(()=>{
    if(!SR) return;
    const rhoCr = makeISA(params.deltaISA ?? 0)(params.cruiseAlt).rho;
    const RoC   = params.rateOfClimb;
    /* Climb and descent are given as distance + angle in the UI, so the
       duration is geometry: V = RoC/sin(angle) along the flight path. */
    const legS = (distKm, angDeg, fallbackAng) => {
      const ang = (angDeg || fallbackAng) * Math.PI/180;
      const V   = RoC / Math.max(1e-3, Math.sin(ang));
      return V > 0 ? (distKm || 0) * 1000 / V : 0;
    };
    const segs = customPhases.map(ph => {
      switch(ph.type){
        case "hover":   return {kind:"hover",  seconds: ph.duration ?? 60, label: ph.label};
        case "loiter":  return {kind:"loiter", seconds: ph.duration ?? 120, label: ph.label};
        case "climb":   return {kind:"climb",  seconds: legS(ph.distance, ph.angle, 5), label: ph.label};
        case "descent": return {kind:"descent",seconds: legS(ph.distance, ph.angle, 4), label: ph.label};
        case "cruise":  return {kind:"cruise", distanceKm: ph.distance ?? 50,
                                speedMS: ph.speed ?? params.vCruise, label: ph.label};
        case "divert":  return {kind:"divert", distanceKm: ph.distance ?? 20,
                                speedMS: ph.speed ?? params.vCruise, label: ph.label};
        /* Reserve keeps the LOOP's own reserve power (Pres, best endurance);
           the speed field only sets how long the leg takes. */
        case "reserve": return {kind:"loiter",
                                seconds: (ph.distance ?? 40)*1000 / Math.max(1, ph.speed ?? 47),
                                label: ph.label ?? "Reserve"};
        /* WIND. The old code cut the airspeed AND multiplied power by
           (1 + wind/100), which is not a thing. A headwind does not change what
           the aircraft costs to fly - it changes how fast the ground goes by,
           so the leg takes longer at the SAME power and therefore burns more
           energy. profile.js models it that way. */
        case "wind_corr": return {kind:"cruise", distanceKm: ph.distance ?? 10,
                                speedMS: ph.speed ?? params.vCruise,
                                headwindMS: ph.windSpeed ?? 15, label: ph.label};
        default: return {kind: ph.type, seconds: ph.duration ?? 0, label: ph.label};
      }
    });
    const ev = evaluateProfile(SR, segs, {
      vCruise: params.vCruise,
      polar: {rho: rhoCr, AR: params.AR, eOsw: params.eOsw, etaSys: params.etaSys},
    });
    const phases = customPhases.map((ph,i) => {
      const r = ev.segments[i] || {};
      return {...ph, power:+(r.powerKW ?? 0).toFixed(2), energy:+(r.energyKWh ?? 0).toFixed(3),
              time:+(r.seconds ?? 0).toFixed(0), distance:+((r.distanceKm ?? 0)*1000).toFixed(0),
              basis:r.basis, offDesign:r.offDesign, segError:r.error};
    });
    setMbResults({phases, totalE:+ev.totalEnergyKWh.toFixed(3), totalT:+ev.totalSeconds.toFixed(0),
      totalRange:+ev.totalDistanceKm.toFixed(1),
      /* State of charge against the USABLE pack, which is what the aircraft can
         actually draw - not the installed capacity. */
      finalSoC:+(100*ev.marginKWh/ev.packUsableKWh).toFixed(1),
      packUsableKWh:ev.packUsableKWh, marginKWh:ev.marginKWh,
      ranDryAt:ev.ranDryAt, segErrors:ev.errors, feasible:ev.feasible, note:ev.note});
  },[customPhases,SR,params]);

  /* Auto-recompute mission whenever phases or aircraft params change */
  useEffect(()=>{ computeCustomMission(); },[computeCustomMission]);

  /* ── Weather fetch — Open-Meteo (no API key needed) ── */
  const fetchWeather=async(lat,lon,cityName,elevation=0)=>{
    setWxLoading(true); setWxError(""); setWxData(null); setWxResults(null);
    try{
      // Fetch current weather — request wind in m/s explicitly with wind_speed_unit=ms
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        +`&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code`
        +`&wind_speed_unit=ms`   // ← explicitly request m/s (default is km/h!)
        +`&forecast_days=1&timezone=auto`;
      const res=await fetch(url);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      const cur=data.current;
      const T_C=cur.temperature_2m;
      const P_hPa=cur.surface_pressure;
      const wind_ms=cur.wind_speed_10m;  // already m/s — requested with wind_speed_unit=ms
      const wind_dir=cur.wind_direction_10m;
      const humidity=cur.relative_humidity_2m;
      // ISA calculations with actual weather
      const T_K=T_C+273.15;
      const T_std=288.15-0.0065*elevation; // ISA temperature at this altitude
      const P_Pa=P_hPa*100;
      const rho_actual=P_Pa/(287*T_K);
      // Correct ISA density at elevation using full ISA formula (not just temperature ratio)
      const rho_ISA_elev=1.225*Math.pow((288.15-0.0065*elevation)/288.15,(-9.81/(-0.0065*287))-1);
      const sigma=rho_actual/1.225; // density ratio vs MSL
      const a_actual=Math.sqrt(1.4*287*T_K);
      const deltaT=T_C-(T_std-273.15); // temp deviation from ISA
      // Run sizing with actual atmospheric conditions
      const MTOW=SR.MTOW,W=MTOW*9.81;
      // ── Hover power — matches runSizing exactly (no twRatio in steady hover) ──
      // runSizing line: Phov=(W/p.etaHov)*Math.sqrt(DL/(2*rhoMSL))
      // DL uses W only (not W×TW) — TW is a structural margin, not applied in steady hover
      const DL_actual=(W)/(Math.PI*Math.pow(params.propDiam/2,2)*params.nPropHover);
      const P_hov_ISA=SR.Phov; // baseline at rhoMSL=1.225
      const P_hov_wx=(W/params.etaHov)*Math.sqrt(DL_actual/(2*rho_actual))/1000;
      // Physics check: P_hov_wx/P_hov_ISA = sqrt(rhoMSL/rho_actual) = 1/sqrt(sigma)
      const P_hov_delta_pct=((P_hov_wx/P_hov_ISA)-1)*100;
      // Cruise power: at lower density aircraft must fly faster to maintain lift (v ∝ 1/√ρ)
      // P_cruise = W/etaSys × v/LD, v_wx = vCruise × √(rhoMSL/rho_actual)
      // → P_cr_wx = SR.Pcr × √(rhoMSL/rho_actual)
      const P_cr_wx=SR.Pcr*Math.sqrt(1.225/rho_actual);
      const P_cr_delta_pct=((P_cr_wx/SR.Pcr)-1)*100;
      // Stall speed: Vstall ∝ 1/√ρ — lower density → higher stall speed
      const V_stall_wx=SR.Vstall*Math.sqrt(1/sigma);
      const V_stall_delta=V_stall_wx-SR.Vstall;
      // Range impact (Breguet — higher density = less drag = more range)
      const range_delta_pct=-P_hov_delta_pct*0.3; // approx
      // Mach change with temperature
      const Mach_wx=params.vCruise/a_actual;
      // Wind impact on range
      const headwind_component=wind_ms*Math.cos((wind_dir||0)*Math.PI/180);
      const Vg=params.vCruise-headwind_component; // ground speed
      const range_wind_pct=((Vg/params.vCruise)-1)*100;
      // Weather code description
      const WX_CODES={0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
        45:"Foggy",48:"Icy fog",51:"Light drizzle",61:"Light rain",71:"Light snow",
        80:"Rain showers",95:"Thunderstorm",99:"Heavy thunderstorm"};
      const wx_desc=WX_CODES[cur.weather_code]||`Code ${cur.weather_code}`;
      setWxData({cityName,lat,lon,elevation,T_C,P_hPa,wind_ms,wind_dir,humidity,wx_desc,
        rho_actual:+rho_actual.toFixed(4),sigma:+sigma.toFixed(4),deltaT:+deltaT.toFixed(1),a_actual:+a_actual.toFixed(1)});
      setWxResults({
        P_hov_wx:+P_hov_wx.toFixed(2),P_hov_delta_pct:+P_hov_delta_pct.toFixed(1),
        P_cr_wx:+P_cr_wx.toFixed(2),P_cr_delta_pct:+P_cr_delta_pct.toFixed(1),
        V_stall_wx:+V_stall_wx.toFixed(2),V_stall_delta:+V_stall_delta.toFixed(2),
        Mach_wx:+Mach_wx.toFixed(4),
        headwind_component:+headwind_component.toFixed(1),
        Vg:+Vg.toFixed(1),range_wind_pct:+range_wind_pct.toFixed(1),
        rho_actual:+rho_actual.toFixed(4),sigma:+sigma.toFixed(4),
      });
      setWxLoading(false);
    }catch(e){
      setWxError(`Failed to fetch weather: ${e.message}`);
      setWxLoading(false);
    }
  };

  const searchCity=async()=>{
    if(!wxSearch.trim()) return;
    setWxLoading(true); setWxError("");
    try{
      const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(wxSearch.trim())}&count=1&language=en&format=json`);
      const gd=await geo.json();
      if(!gd.results?.length){ setWxError("City not found. Try a different name."); setWxLoading(false); return; }
      const loc=gd.results[0];
      await fetchWeather(loc.latitude,loc.longitude,`${loc.name}, ${loc.country}`,loc.elevation||0);
    }catch(e){
      setWxError(`Geocoding failed: ${e.message}`);
      setWxLoading(false);
    }
  };

  /* ── Monte Carlo Runner ── */
  /* Uses Box-Muller transform for normal distribution — mathematically correct */
  const sampleNormal=(mu,sigma)=>{
    let u=0,v=0;
    while(u===0) u=Math.random();
    while(v===0) v=Math.random();
    return mu+sigma*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  };
  const sampleParam=(range)=>{
    const{min,max,dist}=range;
    const mu=(min+max)/2;
    const sigma=(max-min)/6; // 3-sigma = full range (99.7% within bounds)
    if(dist==="uniform") return min+Math.random()*(max-min);
    // Normal — clamp to [min,max] for physical validity
    let s=sampleNormal(mu,sigma);
    return Math.max(min,Math.min(max,s));
  };

  const runMonteCarlo=()=>{
    setMcRunning(true);
    setMcResults(null);
    setTimeout(()=>{
      const N=mcN;
      const MTOWs=[],Etots=[],Phovs=[],LDacts=[],SMs=[],Wbats=[],PackkWhs=[],feasibles=[];
      let failCount=0;
      for(let i=0;i<N;i++){
        try{
          // Sample each uncertain parameter
          const pSample={
            ...params,
            sedCell: sampleParam(mcRanges.sedCell),
            ewf:     sampleParam(mcRanges.ewf),
            LD:      sampleParam(mcRanges.LD),
            etaHov:  sampleParam(mcRanges.etaHov),
            etaSys:  sampleParam(mcRanges.etaSys),
            etaBat:  sampleParam(mcRanges.etaBat),
            AR:      Math.round(sampleParam(mcRanges.AR)*10)/10,
            payload: Math.round(sampleParam(mcRanges.payload)),
            propDiam:+sampleParam(mcRanges.propDiam).toFixed(2),
            vCruise: Math.round(sampleParam(mcRanges.vCruise)),
            range:   Math.round(sampleParam(mcRanges.range)),
            nPropHover: Math.round(sampleParam(mcRanges.nPropHover)/2)*2, // round to nearest even
          };
          // Same totalRange logic as the main sizer
          const Rs=runSizing(engineInputs(pSample));
          if(!Rs||!isFinite(Rs.MTOW)||Rs.MTOW>6000||Rs.MTOW<500) { failCount++; continue; }
          MTOWs.push(Rs.MTOW);
          Etots.push(Rs.Etot);
          Phovs.push(Rs.Phov);
          LDacts.push(Rs.LDact);
          SMs.push(Rs.SM_vt*100);
          Wbats.push(Rs.Wbat);
          PackkWhs.push(Rs.PackkWh);
          feasibles.push(Rs.feasible?1:0);
        }catch{ failCount++; }
      }
      // Compute statistics
      const stats=(arr)=>{
        if(!arr.length) return null;
        const sorted=[...arr].sort((a,b)=>a-b);
        const mean=arr.reduce((s,v)=>s+v,0)/arr.length;
        const variance=arr.reduce((s,v)=>s+(v-mean)**2,0)/arr.length;
        const std=Math.sqrt(variance);
        const p5=sorted[Math.floor(0.05*sorted.length)];
        const p25=sorted[Math.floor(0.25*sorted.length)];
        const p50=sorted[Math.floor(0.50*sorted.length)];
        const p75=sorted[Math.floor(0.75*sorted.length)];
        const p95=sorted[Math.floor(0.95*sorted.length)];
        return{mean,std,p5,p25,p50,p75,p95,min:sorted[0],max:sorted[sorted.length-1],n:arr.length};
      };
      // Build histogram bins for MTOW
      const buildHist=(arr,bins=40)=>{
        if(!arr.length) return [];
        const mn=Math.min(...arr),mx=Math.max(...arr);
        const w=(mx-mn)/bins;
        const counts=Array(bins).fill(0);
        arr.forEach(val=>{ const b=Math.min(bins-1,Math.floor((val-mn)/w)); counts[b]++; });
        return counts.map((cnt,i)=>({
          x:+(mn+i*w+w/2).toFixed(1), count:cnt,
          pct:+(cnt/arr.length*100).toFixed(2)
        }));
      };
      // CDF for MTOW
      const buildCDF=(arr)=>{
        const sorted=[...arr].sort((a,b)=>a-b);
        return sorted.filter((_,i)=>i%Math.max(1,Math.floor(sorted.length/200))===0)
          .map((cdfVal,cdfIdx,cdfArr)=>({x:+cdfVal.toFixed(1),cdf:+((cdfIdx+1)/cdfArr.length*100).toFixed(1)}));
      };
      setMcResults({
        N, failCount,
        MTOW:{stats:stats(MTOWs),hist:buildHist(MTOWs),cdf:buildCDF(MTOWs),raw:MTOWs},
        Etot:{stats:stats(Etots),hist:buildHist(Etots)},
        Phov:{stats:stats(Phovs),hist:buildHist(Phovs)},
        LDact:{stats:stats(LDacts),hist:buildHist(LDacts)},
        SM:{stats:stats(SMs),hist:buildHist(SMs)},
        Wbat:{stats:stats(Wbats),hist:buildHist(Wbats)},
        feasRate:(feasibles.reduce((s,v)=>s+v,0)/feasibles.length*100).toFixed(1),
      });
      setMcRunning(false);
    },50); // defer to allow UI to update
  };


  /* ── DESIGN FILES — see lib/designfile.js ─────────────────────────────
     Every reopened design comes through openDesign: its inputs REPLACE the
     state (never merge into it), and today's engine is checked against the
     outputs it was saved with. Every save goes through makeDesignRecord, and
     a save that fails says so. */
  const[designNotice,setDesignNotice]=useState(null);
  const designFileInputRef=useRef(null);
  const openDesign=(record,{source="design"}={})=>{
    const check=checkContinuity(record);
    setParams(prev=>{
      undoStackRef.current=[...undoStackRef.current.slice(-29),prev];
      redoStackRef.current=[];
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
      return record.inputs;
    });
    setCustomAFData(record.customAirfoil??null);
    setDesignNotice(continuityNotice(check,{source,name:record.name||""}));
    setOpenedDesign({inputs:record.inputs,check:{...check,R:undefined}});
  };
  const openDesignSafely=(load,source)=>{
    try{ openDesign(load(),{source}); }
    catch(e){ setDesignNotice({tone:"error",title:`Could not open ${source}`,lines:[e.message]}); }
  };
  const saveToAccount=async()=>{
    if(!user) return;
    const nm0=`Design · ${new Date().toLocaleDateString()}`;
    const record=makeDesignRecord({params,customAirfoil:customAFData,name:nm0});
    const R=runRecord(record);
    const nm=`Design — MTOW ${R.MTOW}kg · ${new Date().toLocaleDateString()}`;
    record.name=nm;
    const html=generateReport(record.inputs,R,pdfBranding||{},useImperial);
    const row=recordToRow(record,{MTOW:R.MTOW,Etot:R.Etot,Phov:R.Phov,LDact:R.LDact,SM:R.SM});
    try{
      await saveDesign(user.id,{name:nm,params:row.params,results:row.results,pdfHtml:html});
      setDesignNotice({tone:"ok",title:`Saved "${nm}"`,
        lines:[`Stored with every input, the engine stamp (${engineLabel(record.engine)}) and ${Object.keys(record.outputs||{}).length} outputs, so reopening it will say whether a later engine still agrees.`]});
      addNotif(user.id,{title:"Design Saved",body:`"${nm}" saved to My Designs.`,type:"success"});
    }catch(e){
      setDesignNotice({tone:"error",title:"NOT SAVED",
        lines:[`The design was not stored: ${e.message}`,"Nothing was written. Use ••• → Download design file to keep a copy on this computer."]});
    }
  };
  const downloadText=(filename,type,text)=>{
    const url=URL.createObjectURL(new Blob([text],{type}));
    const a=document.createElement("a");
    a.href=url; a.download=filename;
    a.click(); URL.revokeObjectURL(url);
  };
  /* CPACS and traceability are written from a fresh run of the exact inputs
     (a design record), not from SR, which can lag the inputs while typing. */
  const exportInterchange=(kind)=>{
    const stamp=new Date().toISOString().slice(0,10);
    const record=makeDesignRecord({params,customAirfoil:customAFData,name:`eVTOL design ${stamp}`});
    const R=runRecord(record);
    const w=resultWarnings({params:record.inputs,R});
    try{
      if(kind==="cpacs"){
        downloadText(`evtol-design-${stamp}.cpacs.xml`,"application/xml",
          generateCPACS({inputs:record.inputs,R,stamp:record.engine,inputHash:record.inputHash,warningCounts:w.counts,name:record.name}));
      }else if(kind==="autopilot"){
        /* Two files, because the two ecosystems do not share a format:
           ArduPilot's .param is comma delimited with two columns, QGC's
           .params is tab delimited with five and a type. A configuration
           with no wing throws here and is reported rather than exported,
           since every VTOL parameter of consequence is an airspeed. */
        const cfgType=record.inputs.configType??"liftcruise";
        const ctx=vtolContext({configType:cfgType,sizing:R,inputs:record.inputs});
        const head=vtolHeader(ctx);
        downloadText(`evtol-${cfgType}-${stamp}.param`,"text/plain",
          writeArduPilotParam({headerNotes:head,...quadPlaneParameters(ctx)}));
        downloadText(`evtol-${cfgType}-${stamp}.params`,"text/plain",
          writeQgcParams({headerNotes:head,...px4VtolParameters(ctx)}));
      }else{
        downloadText(`evtol-traceability-${stamp}.csv`,"text/csv",
          traceabilityCSV(R,{inputHash:record.inputHash,engine:engineLabel(record.engine),layout:record.inputs.configType??"liftcruise"}));
      }
    }catch(e){
      setDesignNotice({tone:"error",
        title:kind==="cpacs"?"CPACS not exported":kind==="autopilot"?"Autopilot parameters not exported":"Traceability not exported",
        lines:[e.message]});
    }
  };
  const downloadDesignFile=()=>{
    const stamp=new Date().toISOString().slice(0,10);
    const record=makeDesignRecord({params,customAirfoil:customAFData,name:`eVTOL design ${stamp}`});
    const blob=new Blob([JSON.stringify(record,null,1)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`evtol-design-${stamp}.evtol.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const onDesignFileChosen=evt=>{
    const file=evt.target.files?.[0];
    evt.target.value="";
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e2=>openDesignSafely(()=>readDesignRecord(String(e2.target.result)),file.name);
    reader.onerror=()=>setDesignNotice({tone:"error",title:`Could not read ${file.name}`,lines:[String(reader.error)]});
    reader.readAsText(file);
  };

  const set=useCallback(paramKey=>paramVal=>{
    setParams(prev=>{
      undoStackRef.current=[...undoStackRef.current.slice(-29),prev];
      redoStackRef.current=[];
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
      return {...prev,[paramKey]:paramVal};
    });
  },[]);

  // Keyboard shortcuts
  useEffect(()=>{
    const onKey=evt=>{
      const mod=evt.ctrlKey||evt.metaKey;
      // ── Global tab-group shortcuts ──────────────────────────────────
      if(mod&&evt.key==="d"){ evt.preventDefault();
        setActiveGroup(0); setTab(TAB_GROUPS[0].tabs[0]); } // Ctrl+D → Design
      if(mod&&evt.key==="p"){ evt.preventDefault();
        setActiveGroup(1); setTab(TAB_GROUPS[1].tabs[0]); } // Ctrl+P → Physics
      if(mod&&evt.key==="a"){ evt.preventDefault();
        setActiveGroup(2); setTab(TAB_GROUPS[2].tabs[0]); } // Ctrl+A -> group 2 (Trades) -- see GROUP_KEYS in lib/tabs.js
      if(mod&&evt.key==="q"){ evt.preventDefault();
        setActiveGroup(3); setTab(TAB_GROUPS[3].tabs[0]); } // Ctrl+Q -> group 3 (Compliance)
      if(mod&&evt.key==="b"){ evt.preventDefault();
        setActiveGroup(4); setTab(TAB_GROUPS[4].tabs[0]); } // Ctrl+B → Tools
      if(mod&&evt.key==="z"&&!evt.shiftKey){ evt.preventDefault(); undo(); }
      if(mod&&(evt.key==="y"||(evt.key==="z"&&evt.shiftKey))){ evt.preventDefault(); redo(); }
      if(mod&&evt.key==="s"){
        evt.preventDefault();
        if(SR&&user) saveToAccount();
      }
      if(mod&&evt.key==="e"){ evt.preventDefault(); if(SR) exportCSV(); }
      if(!mod&&evt.target.tagName!=="INPUT"&&evt.target.tagName!=="TEXTAREA"){
        if(evt.key==="ArrowRight"){const g=TAB_GROUPS[activeGroup];const idx=g.tabs.indexOf(tab);if(idx<g.tabs.length-1)setTab(g.tabs[idx+1]);}
        if(evt.key==="ArrowLeft") {const g=TAB_GROUPS[activeGroup];const idx=g.tabs.indexOf(tab);if(idx>0)setTab(g.tabs[idx-1]);}
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[SR,user,params,tab,activeGroup]);
  const undo=()=>{
    const stack=undoStackRef.current;
    if(!stack.length) return;
    const snap=stack[stack.length-1];
    undoStackRef.current=stack.slice(0,-1);
    redoStackRef.current=[...redoStackRef.current,params];
    setParams(snap);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  };
  const redo=()=>{
    const stack=redoStackRef.current;
    if(!stack.length) return;
    const snap=stack[stack.length-1];
    redoStackRef.current=stack.slice(0,-1);
    undoStackRef.current=[...undoStackRef.current,params];
    setParams(snap);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  };

  /* Context handed to every extracted tab. One object, built once per
     render, so a tab's dependencies are explicit at both ends: listed here
     and destructured at the top of the tab file. */
  const tabCtx = {
    PHASE_TYPES, SR, TTP, U, WX_PRESETS, computeCustomMission,
    convertCheckVal, costCellKwh, costElecRate, costFlightsPerDay, costMotorPerKw, customAFData,
    customAFError, customAirfoilInput, customPhases, darkMode, dragIdx, dragOverIdx,
    fetchWeather, handleAuth, mbResults, mcN, mcRanges, mcResults, openDesignSafely,
    mcRunning, params, runMonteCarlo, searchCity, set, setCostCellKwh,
    setCostElecRate, setCostFlightsPerDay, setCostMotorPerKw, setCustomAFData, setCustomAFError, setCustomAirfoilInput,
    setCustomPhases, setDragIdx, setDragOverIdx, setMbResults, setMcN, setMcRanges,
    setParams, setWxSearch, tab, uid2, user, wxData,
    wxError, wxLoading, wxResults, wxSearch,
  };

  const stCol=!SR?SC.red:SR.feasible?SC.green:SC.amber;
  const stTxt=!SR?"ERROR":SR.feasible?"FEASIBLE":"CHECK DESIGN";

  return(
    <PowertrainContext.Provider value={deferredParams.powertrain==="turboelectric"?"turboelectric":"battery"}>
    <div style={{display:"flex",flexDirection:"column",height:"100vh",
      background:SC.bg,color:SC.text,
      fontFamily:"'Barlow',system-ui,sans-serif",overflow:"hidden",
      transition:"background 0.2s,color 0.2s"}}>
      <style>{`
        html,body{background:${SC.bg};color:${SC.text};margin:0;padding:0}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${SC.bg}}
        ::-webkit-scrollbar-thumb{background:${SC.border};border-radius:3px}
        input[type=range]{-webkit-appearance:none;appearance:none}
        /* Numeric inputs rendered in the CAUTION hue — every field in the
           left rail was amber, which is most of the orange on screen and
           says 'warning' about a value the user just typed. */
        input[type=number]{-moz-appearance:textfield;background:${SC.panel};color:${SC.text}}
        ${pressCSS(SC)}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .recharts-tooltip-wrapper .recharts-default-tooltip{background:${SC.panel} !important;border:1px solid ${SC.border} !important;border-radius:6px !important;box-shadow:0 4px 20px rgba(0,0,0,0.4) !important;padding:8px 12px !important}
        .recharts-tooltip-wrapper .recharts-tooltip-label{color:${SC.muted} !important;font-size:12px !important;font-weight:600 !important;margin-bottom:4px !important;display:block}
        .recharts-tooltip-wrapper .recharts-tooltip-item{color:${SC.text} !important;font-size:12px !important}
        .recharts-tooltip-wrapper .recharts-tooltip-item-name{color:${SC.muted} !important}
        .recharts-tooltip-wrapper .recharts-tooltip-item-value{color:${SC.amber} !important;font-weight:700 !important}
        .recharts-tooltip-wrapper .recharts-tooltip-item-separator{color:${SC.dim} !important}
        .recharts-legend-item-text{color:${SC.muted} !important;font-size:11px !important}
        .recharts-cartesian-axis-tick text{fill:${SC.muted} !important}
        .recharts-label{fill:${SC.muted} !important}
        .recharts-cartesian-grid line{stroke:${SC.border} !important}
        span,div,td,th{color:inherit}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @media (prefers-reduced-motion: reduce){*,*::before,*::after{transition:none !important;animation:none !important}}
        /* ── Font hierarchy:
           DM Mono  → numeric values, equations, code, unit labels, status badges
           System   → panel headings, section titles, sidebar labels, descriptive text
           Override monospace on headings/labels with .lbl class ── */
        .lbl{font-family:system-ui,-apple-system,sans-serif !important}
        .acc-title{font-family:system-ui,-apple-system,sans-serif !important;letter-spacing:0 !important}
        .panel-title{font-family:system-ui,-apple-system,sans-serif !important;letter-spacing:0.01em !important}
        .tab-label{font-family:system-ui,-apple-system,sans-serif !important}
        /* Slider label — the descriptive name above the track */
        .slider-label{font-family:system-ui,-apple-system,sans-serif !important;font-size:11px}
        /* Tab group category pill */
        .tab-group-pill{font-family:system-ui,-apple-system,sans-serif !important}
      `}</style>

      {/* PDF BRANDING POPUP */}
      {showPdfBranding&&(
        <div style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.7)",
          backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={evt => evt.target===evt.currentTarget&&setShowPdfBranding(false)}>
          <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:12,
            padding:"24px 28px",width:460,maxWidth:"92vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.15em",marginBottom:4}}>PDF REPORT</div>
                <div style={{fontSize:16,fontWeight:800,color:SC.text}}>
                  <span style={{color:SC.amber}}>eVTOL</span> — Report Branding
                </div>
              </div>
              <button onClick={()=>setShowPdfBranding(false)} type="button"
                style={{background:"transparent",border:`1px solid ${SC.border}`,borderRadius:6,
                  color:SC.muted,fontSize:14,cursor:"pointer",padding:"5px 10px"}}>✕ Close</button>
            </div>

            {/* Text fields */}
            {[
              ["Author / Engineer Name","authorName","Your full name"],
              ["University / Organization","university","e.g. Wright State University"],
              ["Project Title","projectTitle","e.g. eVTOL Sizing Analysis"],
              ["Report Date","date",new Date().toLocaleDateString()],
            ].map(([lbl,key,ph])=>(
              <div key={key} style={{marginBottom:12}}>
                <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",
                  textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{lbl}</div>
                <input value={pdfBranding[key]||""} onChange={evt=>setPdfBranding(prev_b=>({...prev_b,[key]:evt.target.value}))}
                  placeholder={ph} type="text"
                  style={{width:"100%",boxSizing:"border-box",background:SC.bg,border:`1px solid ${SC.border}`,
                    borderRadius:6,color:SC.text,fontSize:12,padding:"8px 12px",
                    fontFamily:"'DM Mono',monospace",outline:"none"}}
                  onFocus={evt=>evt.target.style.borderColor=SC.amber}
                  onBlur={evt=>evt.target.style.borderColor=SC.border}/>
              </div>
            ))}

            {/* Logo — file upload (always works) */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",
                textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Logo Image</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {/* Upload button */}
                <label style={{flex:1,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:6,cursor:"pointer",
                  fontSize:11,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>
                  
                  <span>{pdfBranding.logoUrl&&pdfBranding.logoUrl.startsWith("data:")?"✓ Logo loaded — click to change":"Upload logo from computer"}</span>
                  <input type="file" accept="image/*" style={{display:"none"}}
                    onChange={evt=>{
                      const file=evt.target.files?.[0];
                      if(!file) return;
                      const reader=new FileReader();
                      reader.onload=e2=>setPdfBranding(prev=>({...prev,logoUrl:e2.target.result}));
                      reader.readAsDataURL(file);
                    }}/>
                </label>
                {/* Clear button — only shown when logo is set */}
                {pdfBranding.logoUrl&&(
                  <button type="button" onClick={()=>setPdfBranding(prev=>({...prev,logoUrl:""}))}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${SC.border}`,
                      borderRadius:6,color:SC.red,fontSize:11,cursor:"pointer"}}>✕</button>
                )}
              </div>
              {/* Logo preview */}
              {pdfBranding.logoUrl&&pdfBranding.logoUrl.startsWith("data:")&&(
                <div style={{marginTop:8,padding:"8px 12px",background:SC.bg,borderRadius:6,
                  border:`1px solid ${SC.border}`,display:"flex",alignItems:"center",gap:10}}>
                  <img src={pdfBranding.logoUrl} alt="Logo preview"
                    style={{height:40,maxWidth:120,objectFit:"contain",borderRadius:4}}/>
                  <span style={{fontSize:9,color:SC.green,fontFamily:"'DM Mono',monospace"}}>✓ Will appear on PDF cover</span>
                </div>
              )}
              <div style={{fontSize:9,color:SC.subtle,marginTop:5,fontFamily:"'DM Mono',monospace"}}>
                Save the image from your browser first (right-click → Save image), then upload it here.
              </div>
            </div>

            <div style={{marginTop:6,padding:"8px 12px",background:`${SC.green}11`,
              border:`1px solid ${SC.green}44`,borderRadius:6,fontSize:10,color:SC.green,
              fontFamily:"'DM Mono',monospace"}}>
              ✓ These details will appear on the PDF cover page when you click PDF REPORT
            </div>

            {/* Cross-device sync status */}
            <div style={{marginTop:8,padding:"8px 12px",borderRadius:6,fontSize:9,
              fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8,
              background: user ? (brandSynced ? `${SC.teal}15` : `${SC.amber}15`) : `${SC.amber}15`,
              border: `1px solid ${user ? (brandSynced ? SC.teal+"55" : SC.amber+"55") : SC.amber+"55"}`,
              color: user ? (brandSynced ? SC.teal : SC.amber) : SC.amber,
            }}>
              {!user && "⚠ Not logged in — branding saved locally only. Log in to sync across all devices."}
              {user && !brandSynced && "⏳ Syncing branding to your account..."}
              {user && brandSynced && "Synced to your account — logo & branding load on any device when you log in."}
            </div>

            {/* SQL setup reminder — only shown if not logged in or first time */}
            {!user && (
              <div style={{marginTop:6,padding:"7px 12px",background:`${SC.purple}11`,
                border:`1px solid ${SC.purple}33`,borderRadius:6,fontSize:9,color:SC.muted,
                fontFamily:"'DM Mono',monospace",lineHeight:1.6}}>
                 Tip: Log in with your account to save your logo and branding to the cloud. It will automatically load on any browser or device you sign into.
              </div>
            )}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",padding:"8px 18px",background:SC.panel,
        borderBottom:`1px solid ${SC.border}`,gap:14,flexShrink:0,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,color:SC.muted,letterSpacing:"0.2em",fontFamily:"'DM Mono',monospace"}}>AEROSPACE DESIGN SUITE</div>
          <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.03em",lineHeight:1}}>
            <span style={{color:SC.caution}}>eVTOL</span>
            <span style={{color:SC.primary}}> SIZER</span>
            <span style={{fontSize:10,color:SC.subtle,marginLeft:6,fontFamily:"'DM Mono',monospace",fontWeight:400}}>{appVersionLabel()} · NDARC / AFDD methods</span>
          </div>
        </div>
        {/* eVTOL or fixed-wing aircraft: the two engines (src/classes/Root.jsx) */}
        <DesignModeSwitch mode="evtol"/>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",
          background:`${stCol}11`,border:`1px solid ${stCol}44`,borderRadius:4}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:stCol,boxShadow:`0 0 8px ${stCol}`}}/>
          <span style={{fontSize:9,color:stCol,fontFamily:"'DM Mono',monospace",fontWeight:700,letterSpacing:"0.08em"}}>{stTxt}</span>
        </div>
        {SR&&(
          <div style={{display:"flex",gap:14,marginLeft:6,flexWrap:"wrap"}}>
            {[
              [" MTOW",  "MTOW",  U.mass(SR.MTOW),  U.massU,  SR.MTOW<4000?SC.green:SR.MTOW<5000?SC.amber:SC.red, "MTOW",  0,0],
              ["E_total","Etot",  SR.Etot,           U.energyU,SC.teal,                                             "Etot",  5,1],
              ["P_hover","Phov",  U.power(SR.Phov),  U.powerU, SC.blue,                                             "Phov",  5,1],
              ["  L/D",  "LDact", SR.LDact,          "",        SR.LDact>12?SC.green:SC.amber,                       "LDact", 2,0],
              [" SM",    "SM_vt", (SR.SM_vt*100).toFixed(1)+"%","",SR.SM_vt>0.05&&SR.SM_vt<0.25?SC.green:SC.red,   "SM_vt", 6,1],
            ].map(([l,dkey,v,u,col,deltaKey,tabIdx,grpIdx])=>{
              const d=deltaMap[deltaKey];
              const isNum=typeof v==="number";
              const dispVal=isNum?v.toLocaleString():v;
              return(
                <div key={l} style={{textAlign:"center",position:"relative",cursor:"pointer"}}
                  title={`Go to ${TABS[tabIdx]}`}
                  onClick={()=>{setTab(tabIdx);setActiveGroup(grpIdx);}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em"}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace",lineHeight:1.1}}>
                    {dispVal}<span style={{fontSize:10,color:SC.subtle,marginLeft:2}}>{u}</span>
                  </div>
                  {d!=null&&(
                    <div style={{position:"absolute",top:-10,right:-4,fontSize:8,fontFamily:"'DM Mono',monospace",
                      color:d>0?"#f87171":"#34d399",fontWeight:700,whiteSpace:"nowrap",
                      background:SC.panel,borderRadius:3,padding:"0 3px",border:`1px solid ${d>0?"#f8717155":"#34d39955"}`}}>
                      {d>0?"+":""}{d.toFixed(1)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons — primary visible, secondary behind ••• */}
        <div style={{display:"flex",gap:6,marginLeft:"auto",alignItems:"center",position:"relative"}}>
          {/* Units toggle — metric / imperial */}
          <button onClick={()=>setUseImperial(u=>!u)} type="button"
            title={useImperial?"Switch to Metric (SI)":"Switch to Imperial (US)"}
            style={{padding:"5px 10px",background:"transparent",
              border:`1px solid ${useImperial?SC.caution:SC.border}`,borderRadius:4,
              color:useImperial?SC.caution:SC.muted,fontSize:10,cursor:"pointer",
              fontFamily:"'DM Mono',monospace",fontWeight:700,letterSpacing:"0.08em"}}>
            {useImperial?"IMP":"SI"}
          </button>

          {/* Dark/Light toggle — typographic, no emoji */}
          <button onClick={()=>setDarkMode(d=>!d)} type="button"
            title={darkMode?"Switch to Light Mode":"Switch to Dark Mode"}
            style={{padding:"5px 10px",background:"transparent",
              border:`1px solid ${SC.border}`,borderRadius:4,
              color:SC.muted,fontSize:10,cursor:"pointer",lineHeight:1,
              fontFamily:"'DM Mono',monospace",fontWeight:700,letterSpacing:"0.08em"}}>
            {darkMode?"DAY":"NIGHT"}
          </button>

          {/* PRIMARY: Save Design */}
          {SR&&(
            <AuthGate user={user} onAuth={handleAuth}>
              <button onClick={saveToAccount}
                /* Was a dark-green gradient with a neon glow and hard-coded
                   #0f2a0f / #14532d / #86efac — three colours that exist in
                   neither palette. Save is an ordinary action, not a status. */
                style={{padding:"6px 16px",background:"transparent",
                  border:`1px solid ${SC.border}`,borderRadius:3,color:SC.text,fontSize:11,cursor:"pointer",
                  fontFamily:"'DM Mono',monospace",fontWeight:500,letterSpacing:"0.06em",
                  display:"flex",alignItems:"center",gap:5}}>
                {!user&&<span style={{fontSize:10,opacity:0.7}}>⚿</span>}SAVE
              </button>
            </AuthGate>
          )}

          <input ref={designFileInputRef} type="file" accept=".json,application/json"
            style={{display:"none"}} onChange={onDesignFileChosen} data-design-file-input="1"/>
          {/* SECONDARY: overflow ••• menu */}
          <div ref={overflowRef} style={{position:"relative"}}>
            <button type="button" onClick={()=>setShowOverflow(v=>!v)}
              style={{padding:"6px 10px",background:"transparent",
                border:`1px solid ${SC.border}`,borderRadius:4,
                color:SC.muted,fontSize:14,cursor:"pointer",lineHeight:1,
                fontFamily:"'DM Mono',monospace"}}>
              •••
            </button>
            {showOverflow&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:200,
                background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,
                padding:"6px 0",minWidth:190,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                {/* Export CSV */}
                {SR&&(
                  <button onClick={()=>{
                    if(!user){setShowOverflow(false);setShowAuthModal(true);return;}
                    exportCSV();setShowOverflow(false);
                  }} type="button"
                    style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                      cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                      fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
                    {!user&&<span style={{fontSize:10,opacity:0.7}}>⚿</span>}↓ Export CSV
                  </button>
                )}
                {/* PDF Report — login required */}
                {SR&&(
                  <button type="button" onClick={async ()=>{
                      if(!user){setShowOverflow(false);setShowAuthModal(true);return;}
                      try{
                        let brandingWithLogo={...pdfBranding};
                        // Only fetch if it's a URL (not already Base64 from file upload)
                        if(pdfBranding?.logoUrl && !pdfBranding.logoUrl.startsWith("data:")){
                          try{
                            const resp=await fetch(pdfBranding.logoUrl);
                            const ab=await resp.arrayBuffer();
                            const mime=resp.headers.get("content-type")||"image/png";
                            const b64=btoa(String.fromCharCode(...new Uint8Array(ab)));
                            brandingWithLogo={...pdfBranding,logoUrl:`data:${mime};base64,${b64}`};
                          }catch{
                            brandingWithLogo={...pdfBranding,logoUrl:""};
                          }
                        }
                        const html=generateReport(params,SR,brandingWithLogo,useImperial);
                        const blob=new Blob([html],{type:"text/html;charset=utf-8"});
                        const url=URL.createObjectURL(blob);
                        const a=document.createElement("a");
                        a.href=url; a.target="_blank"; a.rel="noopener noreferrer";
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        setTimeout(()=>URL.revokeObjectURL(url),30000);
                        if(user){
                          addNotif(user.id,{title:"PDF Report Opened",body:"Use Ctrl+P → Save as PDF to export.",type:"success"});
                          addReport(user.id,{name:`Report — MTOW ${SR.MTOW}kg · ${new Date().toLocaleDateString()}`,params,results:{MTOW:SR.MTOW,Etot:SR.Etot,Phov:SR.Phov,LDact:SR.LDact,SM:SR.SM},pdfHtml:html});
                        }
                        setShowOverflow(false);
                      }catch(err){
                        alert("Report generation failed: "+err.message);
                      }
                    }}
                    style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                      cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                      fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
                    {!user&&<span style={{fontSize:10,opacity:0.7}}>⚿</span>}↓ PDF Report
                  </button>
                )}
                {/* Brand PDF */}
                {SR&&(
                  <button onClick={()=>{
                    if(!user){setShowOverflow(false);setShowAuthModal(true);return;}
                    setShowPdfBranding(true);setShowOverflow(false);
                  }} type="button"
                    style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                      cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                      fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
                    {!user&&<span style={{fontSize:10,opacity:0.7}}>⚿</span>}◈ Brand PDF
                  </button>
                )}
                {/* Share Design */}
                {SR&&(
                  <div style={{padding:"4px 8px"}}>
                    <ShareDesignButton user={user} params={params} results={SR} customAirfoil={customAFData} C={SC}/>
                  </div>
                )}
                <div style={{height:1,background:SC.border,margin:"4px 0"}}/>
                {/* Undo / Redo */}
                <div style={{display:"flex",gap:4,padding:"4px 8px"}}>
                  <button onClick={()=>{undo();setShowOverflow(false);}} type="button"
                    disabled={!undoCount}
                    style={{flex:1,padding:"7px 8px",background:"transparent",border:`1px solid ${SC.border}`,
                      borderRadius:4,color:undoCount?SC.text:SC.subtle,fontSize:10,
                      cursor:undoCount?"pointer":"default",fontFamily:"system-ui,sans-serif",
                      display:"flex",alignItems:"center",gap:4}}>
                    ↩ Undo <span style={{fontSize:8,color:SC.subtle}}>({undoCount})</span>
                  </button>
                  <button onClick={()=>{redo();setShowOverflow(false);}} type="button"
                    disabled={!redoCount}
                    style={{flex:1,padding:"7px 8px",background:"transparent",border:`1px solid ${SC.border}`,
                      borderRadius:4,color:redoCount?SC.text:SC.subtle,fontSize:10,
                      cursor:redoCount?"pointer":"default",fontFamily:"system-ui,sans-serif",
                      display:"flex",alignItems:"center",gap:4}}>
                    ↪ Redo <span style={{fontSize:8,color:SC.subtle}}>({redoCount})</span>
                  </button>
                </div>
                <div style={{height:1,background:SC.border,margin:"2px 0"}}/>
                {/* Design file — works without an account */}
                <button type="button" onClick={()=>{downloadDesignFile();setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ⤓ Download design file
                </button>
                <button type="button" onClick={()=>{designFileInputRef.current?.click();setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ⤒ Open design file…
                </button>
                <button type="button" onClick={()=>{exportInterchange("cpacs");setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ⤓ Export CPACS 3.5 (.xml)
                </button>
                <button type="button" onClick={()=>{exportInterchange("autopilot");setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ⤓ Export autopilot (.param + .params)
                </button>
                <button type="button" onClick={()=>{exportInterchange("trace");setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ⤓ Export requirements traceability (.csv)
                </button>
                <div style={{height:1,background:SC.border,margin:"2px 0"}}/>
                {/* Fixed-wing aircraft have their own engine and studio
                    (src/classes/aircraft/); this sizer is unchanged. */}
                {[["transport","✈ Size a jet airliner"],["bizjet","✈ Size a business jet"],
                  ["turboprop","✈ Size a turboprop airliner"],["trainer","✈ Size a piston trainer"]].map(([id,label])=>(
                  <button key={id} type="button" onClick={()=>{setShowOverflow(false);requestDesignMode("aircraft",id);}}
                    style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                      cursor:"pointer",textAlign:"left",fontSize:11,color:SC.text,
                      fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                    {label}
                  </button>
                ))}
                <div style={{height:1,background:SC.border,margin:"2px 0"}}/>
                {/* Reset */}
                {/* Uses DEFAULT_PARAMS — see the note there. This button used to
                    carry its own drifted copy that silently dropped
                    weightModel:"buildup" and produced a 19,000 kg runaway. */}
                <button onClick={()=>{setParams(DEFAULT_PARAMS);setShowOverflow(false);}}
                  style={{width:"100%",padding:"8px 16px",background:"transparent",border:"none",
                    cursor:"pointer",textAlign:"left",fontSize:11,color:SC.muted,
                    fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",gap:8}}>
                  ↺ Reset to defaults
                </button>
              </div>
            )}
          </div>

          <UserHeaderBar user={user} onSignOut={handleSignOut} onSignIn={()=>setShowAuthModal(true)} onUpdate={handleUpdate}/>
          {/* AuthModal is rendered once by AuthSessionProvider, above all three studios. */}
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* SIDEBAR — collapsible */}
        <div style={{
          width: sidebarOpen ? 262 : 32,
          minWidth: sidebarOpen ? 262 : 32,
          flexShrink: 0,
          background: SC.panel,
          borderRight: `1px solid ${SC.border}`,
          overflowY: sidebarOpen ? "auto" : "hidden",
          overflowX: "hidden",
          padding: sidebarOpen ? "10px 13px 24px" : "10px 0 24px",
          transition: "width 0.22s cubic-bezier(.4,0,.2,1), min-width 0.22s cubic-bezier(.4,0,.2,1)",
          position: "relative",
        }}>
          {/* Toggle arrow — always visible */}
          <button
            type="button"
            onClick={()=>setSidebarOpen(v=>{ const n=!v; localStorage.setItem("sb",n?"1":"0"); return n; })}
            title={sidebarOpen?"Collapse sidebar":"Expand sidebar"}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: sidebarOpen ? "100%" : 32,
              height: 28,
              marginBottom: 6,
              background: SC.bg,
              border: `1px solid ${SC.border}`,
              borderRadius: 5,
              cursor: "pointer",
              color: SC.muted,
              fontSize: 14,
              lineHeight: 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.background=`${SC.amber}18`}
            onMouseLeave={e=>e.currentTarget.style.background=SC.bg}
          >
            {sidebarOpen ? "‹" : "›"}
          </button>

          {/* Collapsed state — show mini KPI icons */}
          {!sidebarOpen && SR && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingTop:4}}>
              {[
                {icon:"", val:`${U.mass(SR.MTOW)}${U.massU}`,  col:SR.MTOW<4000?SC.green:SC.amber, tip:"MTOW"},
                {icon:"", val:`${SR.Etot}kWh`,                 col:SC.teal, tip:"Energy"},
                {icon:"", val:`${SR.LDact}`,                   col:SR.LDact>12?SC.green:SC.amber, tip:"L/D"},
                {icon:"", val:`${U.power(SR.Phov)}${U.powerU}`,col:SC.blue, tip:"Hover Power"},
              ].map(({icon,val,col,tip})=>(
                <div key={tip} title={`${tip}: ${val}`}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"default"}}>
                  <span style={{fontSize:14,lineHeight:1}}>{icon}</span>
                  <span style={{fontSize:9,color:col,fontFamily:"'DM Mono',monospace",
                    fontWeight:700,lineHeight:1,textAlign:"center",maxWidth:28,
                    overflow:"hidden",whiteSpace:"nowrap"}}>{val}</span>
                </div>
              ))}
              <div style={{width:20,height:1,background:SC.border,margin:"2px 0"}}/>
              {/* Mini check dots */}
              {SR.checks?.slice(0,4).map((chk,i)=>(
                <div key={i} title={chk.label+" — "+convertCheckVal(chk.val)}
                  style={{width:14,height:14,borderRadius:"50%",
                    background:chk.ok?`${SC.green}33`:`${SC.red}33`,
                    border:`1px solid ${chk.ok?SC.green:SC.red}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:7,color:chk.ok?SC.green:SC.red,cursor:"default"}}>
                  {chk.ok?"✓":"✗"}
                </div>
              ))}
            </div>
          )}

          {/* Full sidebar content — hidden when collapsed via CSS (keeps DOM for perf) */}
          <div style={{
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
            transition: "opacity 0.15s",
            display: sidebarOpen ? "block" : "none",
          }}>
          {/* ══ AIRCRAFT CONFIGURATION ══════════════════════════════════
              The engine has been configuration-driven since engine/
              configuration.js landed — six layouts, each changing rotor
              behaviour in cruise, drag, booms, whether there is a wing at all,
              and which failure criteria apply. None of it was reachable from
              the UI: configType could only be set in code, so every user got
              the hybrid default and the other five layouts were dead. This is
              the control that makes the configuration a design choice.

              The summary underneath is not decoration. A configuration decides
              things the sliders cannot express — how many rotors stop in
              cruise, whether a separate pusher exists, whether booms are
              carried — and those are exactly the quantities that were being
              silently inherited before. Showing them makes the layout's
              consequences visible at the moment it is picked. */}
          <Acc title="Aircraft Configuration" icon="">
            {/* POWERTRAIN — engine/turboelectric.js. Battery is every earlier
                result; turboelectric adds a turboshaft-generator and keeps the
                pack for an engine-out landing only. */}
            <div style={{fontSize:11,color:SC.muted,fontFamily:"system-ui,sans-serif",marginBottom:5}}>Powertrain</div>
            <div data-powertrain-toggle="1" style={{display:"flex",gap:4,marginBottom:6}}>
              {[["battery","Battery-electric"],["turboelectric","Turboelectric"]].map(([k,lab])=>(
                <button key={k} type="button" onClick={()=>set("powertrain")(k)}
                  aria-pressed={(params.powertrain??"battery")===k}
                  style={{flex:1,padding:"4px 6px",fontSize:9,borderRadius:4,cursor:"pointer",
                    fontFamily:"system-ui,sans-serif",fontWeight:600,
                    background:(params.powertrain??"battery")===k?`${SC.amber}22`:SC.panel,
                    color:(params.powertrain??"battery")===k?SC.amber:SC.muted,
                    border:`1px solid ${(params.powertrain??"battery")===k?SC.amber+"66":SC.border}`}}>
                  {lab}
                </button>))}
            </div>
            {params.powertrain==="turboelectric"&&SR&&(
              <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.5,marginBottom:8}}>
                Turboshaft {SR.turboshaftRatedKW} kW (SLS) · {SR.turboshaftMassKg} kg · generator {SR.generatorMassKg} kg<br/>
                Fuel {SR.fuelMassKg} kg carried, {SR.fuelBurnKg} kg burned · pack {SR.Wbat} kg for a 2-min engine-out hover<br/>
                NASA's model (Silva 2018; TM-20210017971). Validated on one aircraft only.
              </div>
            )}
            <div style={{fontSize:11,color:SC.muted,fontFamily:"system-ui,sans-serif",marginBottom:5}}>Layout</div>
            {/* ══ SELECTING A LAYOUT MUST APPLY THE LAYOUT ══════════════
                This used to set `configType` alone, leaving rotor count and
                diameter at the previous layout's values. The result was
                designs that contradict themselves — a "side-by-side" with six
                rotors, a "multicopter" at 48 lb/ft² disk loading — and both of
                those then failed to converge at ~19,000 kg.

                A configuration carries its own defining parameters. Rotor
                count and design disk loading now come from CONFIG_DEFAULTS
                (NASA Table 12 where published, Joby/Archer otherwise, each
                tagged), and the rotor DIAMETER is derived from that disk
                loading at the current gross weight rather than inherited.

                `nRotorsStopped` is cleared so the new layout's own stopped
                fraction applies — carrying over "2 stopped" from a hybrid
                into a tiltrotor would assert a layout that does not exist. */}
            <select value={params.configType||"hybrid"} onChange={e=>{
                const key=e.target.value;
                const dflt=CONFIG_DEFAULTS[key];
                setParams(q=>{
                  const next={...q,configType:key};
                  delete next.nRotorsStopped;
                  if(dflt){
                    next.nPropHover=dflt.nRotors;
                    /* SOLVE the rotor diameter with MTOW rather than evaluating it
                       once at whatever mass happens to be on screen. Diameter and
                       MTOW are mutually dependent: sizing the rotor at a stale mass
                       left the design flying a disk loading up to 35% off the target
                       its own configuration defaults specify. */
                    const solved=solveRotorDiameter(key,{...q,configType:key,nPropHover:dflt.nRotors},runSizing,
                      {seedMTOW:(SR&&SR.MTOW)||q.payload*8});
                    const D=solved?.propDiam ?? rotorDiameterFor(key,(SR&&SR.MTOW)||q.payload*8,dflt.nRotors);
                    if(D&&isFinite(D)) next.propDiam=D;
                    /* Cruise speed is a property of the LAYOUT, not a global.
                       NASA fly their rotor-borne concepts at 98 kt and warn that
                       above ~90 kt "blade stall encompasses most of the rotor";
                       carrying a winged 130 kt into a multicopter asks the loop
                       to close a design that cannot fly. */
                    if(dflt.vCruise_ms&&isFinite(dflt.vCruise_ms)) next.vCruise=dflt.vCruise_ms;
                    /* Effective L/D is published per layout (NASA Table 12
                       L/De: quad 5.80, side-by-side 7.20, lift+cruise 8.50).
                       Carrying a clean-wing 14 into a multicopter made the
                       "AR vs LD compatible" check fail a design for producing
                       a perfectly normal rotorcraft L/D. */
                    if(dflt.LD_target&&isFinite(dflt.LD_target)) next.LD=dflt.LD_target;
                    /* Hover figure of merit and tip speed are published PER
                       VEHICLE in Table 12 (FM 0.680-0.740, tip 550-585 ft/s).
                       FM is not a technology constant — a large slow rotor
                       hovers at a different efficiency from eight small stiff
                       ones, and NASA's own three vehicles span that range. */
                    if(dflt.etaHov&&isFinite(dflt.etaHov)) next.etaHov=dflt.etaHov;
                    if(dflt.tipSpeed_ms&&isFinite(dflt.tipSpeed_ms)) next.tipSpeed=dflt.tipSpeed_ms;
                    /* FUSELAGE SHAPE IS A PROPERTY OF THE LAYOUT TOO. Every
                       configuration used one universal 7.2 x 1.65 m body -
                       fineness 4.4, a fixed-wing tube - so the multicopter
                       drew as an aeroplane with spars through it. Yang et al.
                       (Aerospace 2024 11:200) Table 4 measures eight real UAM
                       multicopters at fineness 1.38-3.56, mean 2.26; 4.4 is
                       outside that range entirely. The RATIO transfers, the
                       absolute length does not, so the width keeps carrying
                       the cabin and the length follows from it. */
                    if(dflt.fusFineness&&isFinite(dflt.fusFineness)){
                      const w=Number(next.fusDiam)||Number(q.fusDiam)||1.65;
                      next.fusLen=+(dflt.fusFineness*w).toFixed(2);
                    }
                    /* A capsule body is taller than it is wide, and the area
                       terms need sqrt(W*H) rather than the width alone. Absent
                       on every other layout, which leaves them circular. */
                    /* Empty-weight fraction per layout, where NASA publishes an
                       all-electric anchor (Quad-E, SbS-E, L+C-E). Tiltrotor, hybrid
                       and hybrid-pusher have none and keep the slider's value. */
                    if(dflt.ewf&&isFinite(dflt.ewf)) next.ewf=dflt.ewf;
                    if(dflt.fusHeightRatio&&isFinite(dflt.fusHeightRatio)){
                      const w=Number(next.fusDiam)||Number(q.fusDiam)||1.65;
                      next.fusHeight=+(dflt.fusHeightRatio*w).toFixed(2);
                    } else {
                      next.fusHeight=undefined;
                    }
                    /* Wing loading is published PER AIRCRAFT — Joby 1524,
                       Archer 1371. The old universal 1450 was their midpoint,
                       a number describing neither. */
                    if(dflt.wingLoadingNm2&&isFinite(dflt.wingLoadingNm2))
                      next.wingLoadingNm2=dflt.wingLoadingNm2;
                    /* Installed thrust margin follows the ROTOR COUNT by
                       arithmetic: hovering on N-1 of N independent rotors needs
                       T/W >= N/(N-1). Cross-shafted layouts are exempt. This is
                       the quantitative case for distributed propulsion — 12
                       rotors need 9% margin, 4 need 33%. */
                    /* N/(N-1) is a FLOOR, not the design value — a real
                       aircraft carries margin for gusts, hot-and-high and
                       control authority on top of bare one-rotor-out hover.
                       So the installed margin is the GREATER of the design
                       margin and the OEI floor. For 12 rotors the floor (1.09)
                       is below the design margin and 1.30 stands; for 4 rotors
                       the floor (1.33) binds and raises it. */
                    /* 1.30 THRUST = a 1.482 POWER factor, which sits inside
                       NASA's published 1.3-1.8 band (corpus S3270) — so this
                       value IS sourced, once the currencies are converted; the
                       registry's old "not yet reconciled" note was comparing a
                       thrust ratio against Table 4's POWER ratios.
                       Deriving the whole thing per configuration from N/(N-1)
                       was tried and REFUTED: it took NASA's published weight
                       statements from 13 of 21 metrics within +/-5% down to 6.
                       twRatioFor() is kept as a comparator, not a default. */
                    const oeiTW=oeiThrustMarginFor(key,dflt.nRotors);
                    next.twRatio=Math.max(1.30,oeiTW??1.30);
                    /* The diameter is re-derived HERE, from the disk loading
                       and the current weight, which is what stops it drifting.
                       Doing the same thing INSIDE the sizing loop diverges the
                       multicopter — see the note on rotorSizing above. */
                  }
                  return next;
                });
              }}
              style={{width:"100%",padding:"6px 8px",borderRadius:5,fontSize:11,
                fontFamily:"system-ui,sans-serif",background:SC.panel,color:SC.text,
                border:`1px solid ${SC.border}`,cursor:"pointer",marginBottom:8}}>
              {Object.entries(CONFIGURATIONS).map(([k,c])=>(
                <option key={k} value={k}>{c.label}</option>
              ))}
            </select>
            {(()=>{
              const key=params.configType||"hybrid";
              const c=CONFIGURATIONS[key]||CONFIGURATIONS.hybrid;
              const N=params.nPropHover||6;
              const cap=capabilitiesFor(key,N);
              /* Resolved, not raw: the layout clamps the stopped count (the aft
                 boom station has no hinge, and a pair must keep tilting to
                 carry cruise thrust). Reading params directly showed the user
                 a number the engine had already overruled. */
              const cfgRes=resolveConfiguration({...params,configType:key},N);
              const nStop=cfgRes.nStopped;
              const nTilt=Math.max(0,N-nStop);
              const hasPusher=params.hasPusher!=null?!!params.hasPusher:(c.hasCruiseProp&&nStop>0);
              const ref=referenceMissionFor(key);
              const row=(l,v)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
                  <span style={{fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>{l}</span>
                  <span style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{v}</span>
                </div>);
              return(<>
                <div style={{fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif",
                  lineHeight:1.45,marginBottom:8,fontStyle:"italic"}}>{c.note}</div>
                {/* Rotors that stop in cruise is the single number that most
                    changes a layout's mass and drag, so it is editable here
                    rather than buried — but only where the layout allows it.
                    A tiltrotor and a multicopter stop none BY DEFINITION. */}
                {/* THE SLIDER MUST NOT OFFER VALUES THE LAYOUT CANNOT BUILD.
                    It ran 0..N, so a twelve-rotor hybrid accepted "2 stopped"
                    and silently resolved it to 6 — the aft boom station has no
                    hinge, so those four rotors cannot tilt. Nothing moved when
                    the user dragged it, which reads as a frozen model rather
                    than a constraint. The ends now come from the resolved
                    configuration, and the reason is shown. */}
                {c.stoppedFrac>0&&(()=>{
                  const lo=cfgRes?.stoppedMin??0, hi=cfgRes?.stoppedMax??N;
                  /* Nothing to choose: a layout whose rotors cannot tilt stops
                     all of them, so a slider pinned to one value is a control
                     that does nothing. Say what is fixed and why instead. */
                  if(lo>=hi) return (
                    <div style={{fontSize:10,color:SC.muted,padding:"4px 2px",
                      fontFamily:"system-ui,sans-serif"}}>
                      All {N} lift rotors stop in cruise — this layout has no tilt
                      mechanism, so a rotor left turning would make drag and no thrust.
                      The pusher carries cruise.
                    </div>);
                  return (
                  <Slider label="Rotors stopped in cruise" unit="" value={nStop}
                    min={lo} max={hi} step={1} onChange={set("nRotorsStopped")}
                    note={lo>0||hi<N
                      ? `of ${N} · ${lo}–${hi} on this layout: the aft boom station has no hinge`
                        +(hi<N?", and a pair must keep tilting to carry cruise thrust":"")
                      : `of ${N} · the rest tilt and carry cruise thrust`}/>
                  );})()}
                <div style={{padding:"6px 8px",background:`${SC.teal}0d`,
                  border:`1px solid ${SC.teal}33`,borderRadius:5,marginTop:6}}>
                  {row("Rotors",`${N}`)}
                  {row("Stop in cruise",`${nStop}`)}
                  {row("Tilt for cruise",`${nTilt}`)}
                  {row("Separate pusher",hasPusher?"yes":"no")}
                  {row("Wing",cap.hasWing?"yes":"none — rotor-borne")}
                  {row("Booms",(c.hasBooms&&(c.stoppedFrac===0||nStop>0))?"yes":"no")}
                  {row("Cruise thrust units",`${Math.max(1,nTilt+(hasPusher?1:0))}`)}
                </div>
                {/* Reference missions existed in engine/mission.js and were
                    never offered anywhere. A multicopter flown on the winged
                    air-taxi mission is the commonest way to make this tool
                    produce a meaningless answer, so the matching mission is
                    OFFERED here — and never auto-applied, because which
                    reference is right is the user's call, not ours. */}
                {/* Flag the mismatch AT THE POINT OF SELECTION, not only after
                    the run diverges. A rotor-borne layout on a long winged
                    mission is the single commonest way to get a runaway here. */}
                {!cap.hasWing&&params.range>80&&(
                  <div style={{marginTop:8,padding:"7px 9px",borderRadius:5,
                    background:`${SC.amber}14`,border:`1px solid ${SC.amber}55`}}>
                    <div style={{fontSize:10,color:SC.amber,fontWeight:700,
                      fontFamily:"system-ui,sans-serif",marginBottom:3}}>
                      ⚠ Mission likely too long for a rotor-borne layout
                    </div>
                    <div style={{fontSize:9.5,color:SC.text,lineHeight:1.45,
                      fontFamily:"system-ui,sans-serif"}}>
                      This layout has no wing, so it stays rotor-borne in cruise and
                      its lift-to-drag is roughly 5–7 rather than 10–14. At{" "}
                      {params.range} km the battery grows faster than the aircraft
                      can lift it and the sizing loop will not close. Apply the
                      reference mission below, or cut range to ~35–90 km.
                    </div>
                  </div>
                )}
                {ref&&(
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif",marginBottom:4}}>
                      Reference mission for this layout
                    </div>
                    <button type="button"
                      onClick={()=>setParams(q=>({...q,
                        ...(ref.payload!=null?{payload:ref.payload}:{}),
                        ...(ref.range!=null?{range:ref.range}:{}),
                        ...(ref.vCruise!=null?{vCruise:ref.vCruise}:{}),
                        ...(ref.nPropHover!=null?{nPropHover:ref.nPropHover}:{}),
                        ...(ref.propDiam!=null?{propDiam:ref.propDiam}:{}),
                        ...(ref.tipSpeed!=null?{tipSpeed:ref.tipSpeed}:{}),
                        ...(ref.etaHov!=null?{etaHov:ref.etaHov}:{})}))}
                      title={ref.src}
                      style={{width:"100%",padding:"6px 0",borderRadius:4,cursor:"pointer",
                        fontSize:10,fontFamily:"system-ui,sans-serif",
                        background:"transparent",border:`1px solid ${SC.border}`,color:SC.muted}}>
                      Apply: {ref.label}
                    </button>
                    {ref.note&&<div style={{fontSize:9,color:SC.muted,marginTop:3,
                      fontFamily:"system-ui,sans-serif",fontStyle:"italic"}}>{ref.note}</div>}
                  </div>
                )}
              </>);
            })()}
          </Acc>
          <Acc title="Mission Requirements" icon="">
            <Slider label="Payload" unit="kg" value={params.payload} min={100} max={900} step={5} onChange={set("payload")} note="Passengers + cargo"/>
            {/* SEATS ARE A CERTIFICATION GATE, NOT A SLIDER, and they are
                allowed to be UNSTATED. SC-VTOL-02 VTOL.2005(a) applies only
                at 9 seats or fewer and FAA AC 21.17-4 PL.2000(a) at six, so
                the number decides which document governs the design — but
                payload cannot supply it, because an occupant and a sack of
                cargo are the same kilogrammes to this engine. Left blank,
                the Regulatory tab reports that gate as NOT DECIDABLE rather
                than assuming a pass, and the cabin check keeps deriving
                occupancy from payload exactly as before. */}
            {(()=>{
              const raw=params.nSeats, stated=Number.isFinite(Number(raw))&&Number(raw)>0;
              return(
                <div style={{padding:"4px 0 6px",borderBottom:`1px solid ${SC.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <span style={{fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>Seats</span>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      <input type="number" min={1} max={19} step={1}
                        value={stated?Number(raw):""} placeholder="not stated"
                        onChange={(e)=>{const v=e.target.value.trim();set("nSeats")(v===""?null:Math.max(1,Math.round(Number(v)||0))||null);}}
                        style={{width:64,padding:"2px 6px",background:SC.bg,border:`1px solid ${SC.border}`,borderRadius:4,color:stated?SC.amber:SC.subtle,fontSize:11,fontWeight:700,fontFamily:"'DM Mono',monospace",textAlign:"right"}}/>
                      {stated&&(
                        <button type="button" onClick={()=>set("nSeats")(null)} title="clear — leave the seat count unstated"
                          style={{padding:"2px 7px",background:"transparent",border:`1px solid ${SC.border}`,borderRadius:4,color:SC.muted,fontSize:9,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>clear</button>
                      )}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:SC.subtle,fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
                    Occupants including crew. Sets the applicability gate on the Regulatory tab{stated?"":"; blank leaves it undecided"}.
                    {stated&&Number(raw)>9&&<span style={{color:SC.red}}> Above SC-VTOL&apos;s limit of 9.</span>}
                    {stated&&Number(raw)>6&&Number(raw)<=9&&<span style={{color:SC.amber}}> Above the FAA&apos;s limit of 6.</span>}
                  </div>
                </div>
              );
            })()}
            <Slider label="Mission Range" unit="km" value={params.range} min={50} max={250} step={5} onChange={set("range")} note="Excludes reserve · total = mission + reserve"/>
            {/* Reserve: TIME or DISTANCE. The regulation is written in time
                (FAA powered-lift SFAR 20 min VFR / 30 IFR; EASA VTOL.2430(b)(4) requires a reserve, states no number;
                14 CFR 91.151), so time is the default and distance is derived.
                But a DIVERSION to an alternate vertiport is a distance, and a
                designer siting vertiports thinks in km — so either can drive,
                and whichever is derived is shown greyed as a read-out. */}
            {(()=>{
              const resDist_sb=+reserveDistanceKm(params).toFixed(1);
              const totalRange_sb=+(params.range+resDist_sb).toFixed(1);
              return(
                <div style={{padding:"4px 0 6px",borderBottom:`1px solid ${SC.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <span style={{fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>Reserve Range</span>
                    <span style={{fontSize:11,fontWeight:700,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{resDist_sb} <span style={{fontSize:8,color:SC.subtle}}>km</span></span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 7px",background:`${SC.amber}11`,borderRadius:4,border:`1px solid ${SC.amber}33`}}>
                    <span style={{fontSize:9,color:SC.amber,fontFamily:"system-ui,sans-serif",fontWeight:600}}>Total Range (mission+reserve)</span>
                    <span style={{fontSize:12,fontWeight:800,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>{totalRange_sb} <span style={{fontSize:8}}>km</span></span>
                  </div>
                </div>
              );
            })()}
            {/* Which quantity the user drives. */}
            <div style={{display:"flex",gap:6,padding:"4px 0 6px"}}>
              {[["time","Reserve by TIME"],["distance","by DISTANCE"]].map(([k,lab])=>(
                <button key={k} onClick={()=>setParams(q=>({...q,reserveBasis:k}))}
                  style={{flex:1,padding:"4px 6px",fontSize:9,borderRadius:4,cursor:"pointer",
                    fontFamily:"system-ui,sans-serif",fontWeight:600,
                    background:(params.reserveBasis??"time")===k?`${SC.amber}22`:SC.panel,
                    color:(params.reserveBasis??"time")===k?SC.amber:SC.muted,
                    border:`1px solid ${(params.reserveBasis??"time")===k?SC.amber+"66":SC.border}`}}>
                  {lab}
                </button>))}
            </div>
            {(params.reserveBasis??"time")==="distance"
              ? <Slider label="Reserve Range" unit="km" value={params.reserveDistanceKm??60} min={0} max={150} step={5} onChange={set("reserveDistanceKm")} note={`Diversion to alternate · = ${(( (params.reserveDistanceKm??60)*1000)/(0.76*params.vCruise)/60).toFixed(1)} min at best endurance`}/>
              : <Slider label="Reserve Time" unit="min" value={reserveMinutesOf(params)} min={0} max={45} step={5} onChange={set("reserveMinutes")} note="FAA powered-lift SFAR: 20 min VFR · 30 min IFR. EASA VTOL.2430(b)(4) requires a reserve but states no number"/>}
            <Slider label="Cruise Speed" unit="m/s" value={params.vCruise} min={30} max={120} step={1} onChange={set("vCruise")} note={SR?`Mach ${SR.Mach}`:""}/>
            <Slider label="Cruise Altitude" unit="m" value={params.cruiseAlt} min={200} max={3000} step={50} onChange={set("cruiseAlt")}/>
            <Slider label="Vertical Transition Height" unit="m AGL" value={params.hoverHeight} min={10} max={50} step={0.5} onChange={set("hoverHeight")} note="Top of the vertical segment, above the field — NOT an aircraft dimension. Sets hover density (isa(fieldElev+h)) and where the forward climb begins."/>
          </Acc>
          <Acc title="Aerodynamics" icon="">
            {/* WING LOADING IS THE DESIGN VARIABLE, not a target cruise CL.
                "Design CL" used to live here and was measurably INERT — moving
                it changed nothing anywhere in the result (validation/
                sensitivity.mjs), because engine/wing.js sizes the wing from
                W/S bounded by a cruise-CL ceiling and then DERIVES the cruise
                CL. The panel was showing a dead knob while hiding the live one. */}
            <Slider label="Wing Loading W/S" unit=" N/m²" value={params.wingLoadingNm2} min={700} max={2200} step={25} onChange={set("wingLoadingNm2")}
              note={SR?`Joby ~1524 · Archer ~1371 · gives CL_cruise ${SR.CLcruise?.toFixed(3)} (${SR.wingAreaDriver})`:"Joby ~1524 · Archer ~1371 N/m²"}/>
            <Slider label="Cruise CL Ceiling" unit="" value={params.clCruiseMax} min={0.5} max={1.2} step={0.05} onChange={set("clCruiseMax")}
              note="upper bound before the wing is too loaded to cruise; binds only on slow designs"/>
            <Slider label="Aspect Ratio AR" unit="" value={params.AR} min={4} max={16} step={0.5} onChange={set("AR")}/>
            <Slider label="Oswald e" unit="" value={params.eOsw} min={0.5} max={1.0} step={0.01} onChange={set("eOsw")}/>
            <Slider label="Taper Ratio λ" unit="" value={params.taper} min={0.2} max={0.8} step={0.05} onChange={set("taper")}/>
            {/* L/D IS A TARGET FOR COMPARISON, NOT A DESIGN INPUT. The sizing
                loop was closed on 2026-08-24 and drives itself from the
                computed LDact; this only seeds the first iteration. Measured:
                it moves 12 outputs and ZERO kg of MTOW. Kept, because seeing
                how far the design lands from the target is useful — but
                labelled as what it is instead of looking like a live knob. */}
            <Slider label="L/D target (reference only)" unit="" value={params.LD} min={5} max={22} step={0.5} onChange={set("LD")}
              note={SR?`⚠ does not size the aircraft — computed L/D is ${SR.LDact}. Archer 11.3 · Joby ~16`:"reference target only"}/>
            <Slider label="Thickness t/c" unit="" value={params.tc} min={0.08} max={0.20} step={0.01} onChange={set("tc")}/>
          </Acc>
          <Acc title="Propulsion" icon="">
            <Slider label="Hover Rotors n" unit="" value={params.nPropHover} min={2} max={10} step={2} onChange={set("nPropHover")}/>
            {/* COAXIAL ARRANGEMENT. Offered only where the layout supports it
                and the rotor count is even, because a contra-rotating pair
                needs two. [SRC] Yang et al., Aerospace 2024 11:200: coplanar
                and coaxial are the two arrangements the UAM multicopter field
                uses, and asked for 8 rotors this tool used to draw an 8-armed
                ring - EHang 184, SkyDrive SD-03 and Moog SureFly all carry 8
                as 4 coaxial pairs on 4 arms. */}
            {capabilitiesFor(params.configType)?.supportsCoaxial && (
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"6px 0 2px"}}>
                <span style={{fontSize:11,color:SC.muted,minWidth:118}}>Rotor arrangement</span>
                <select value={params.rotorArrangement||"coplanar"}
                        onChange={e=>setParams(q=>({...q,rotorArrangement:e.target.value}))}
                        style={{flex:1,fontSize:11,padding:"3px 6px",background:SC.panel,
                                color:SC.text,border:`1px solid ${SC.border}`,borderRadius:5}}>
                  <option value="coplanar">Coplanar — one rotor per arm</option>
                  <option value="coaxial" disabled={(params.nPropHover||0)%2!==0}>
                    Coaxial — contra-rotating pairs, half the arms
                  </option>
                </select>
              </div>
            )}
            {params.rotorArrangement==="coaxial"
              && capabilitiesFor(params.configType)?.supportsCoaxial
              && (params.nPropHover||0)%2===0 && (
              <div style={{fontSize:10,color:SC.muted,margin:"0 0 6px 126px",lineHeight:1.35}}>
                {(params.nPropHover||0)/2} arms carrying {params.nPropHover} rotors.
                Induced power x{(SR&&SR.coaxKappa)||"—"} (Yang Eq. 39), booms halved.
              </div>
            )}
            <Slider label="Rotor Diameter" unit="m" value={params.propDiam} min={1.0} max={5.0} step={0.1} onChange={set("propDiam")} note={SR?`AD = ${SR.Drotor} m`:""}/>
            <Slider label="Installed T/W" unit="" value={params.twRatio} min={1.0} max={1.6} step={0.05} onChange={set("twRatio")} note="1.2 = 20% thrust margin above hover weight"/>
            <Slider label="Hover FOM η" unit="" value={params.etaHov} min={0.4} max={0.85} step={0.01} onChange={set("etaHov")} note="Optimised eVTOL rotor: 0.65–0.75"/>
            <Slider label="System η" unit="" value={params.etaSys} min={0.5} max={0.95} step={0.01} onChange={set("etaSys")} note="FULL chain incl. propeller: eta_prop x eta_motor x eta_inv ~ 0.76"/>
            <Slider label="Rate of Climb" unit="m/s" value={params.rateOfClimb} min={1} max={12} step={0.1} onChange={set("rateOfClimb")}/>
            <Slider label="Climb Angle" unit="°" value={params.climbAngle} min={2} max={15} step={0.5} onChange={set("climbAngle")}/>
            <Slider label="Descent Angle" unit="°" value={params.descentAngle ?? (SR?.descentAngleUsedDeg ?? 6)} min={2} max={15} step={0.5} onChange={set("descentAngle")} note={params.descentAngle==null ? `auto — this layout's glide angle, ${SR?.descentAngleUsedDeg ?? "—"}° at ${SR?.descentSpeedMS ?? "—"} m/s (no source gives a mission gradient)` : "set explicitly — overrides the layout's own glide angle"}/>
            {/* "Climb L/D Penalty" was a flat 13% derate on cruise L/D and is
                SUPERSEDED: climb and descent L/D are now read off the same drag
                polar at their own airspeeds, so the derate measures inert
                (0/357 outputs). It survives in params only for the legacy
                p.flatClimbPenalty / useTargetLD paths. Rate of Climb is the
                live control now, and it has a real optimum — climb energy is
                U-shaped in climb speed, which the flat derate hid entirely. */}
            <Slider label="ISA Deviation ΔT" unit="°C" value={params.deltaISA||0} min={-15} max={30} step={1} onChange={set("deltaISA")} note="0=std day · 15=ISA+15 hot day · -15=cold day"/>
          </Acc>
          <Acc title="Battery" icon="">
            <Slider label="Cell SED" unit="Wh/kg" value={params.sedCell} min={150} max={500} step={5} onChange={set("sedCell")} note="CELL level. NASA sizes on 400 Wh/kg PACK (installed+usable) -- do not mix"/>
            <Slider label="Battery η" unit="" value={params.etaBat} min={0.70} max={0.99} step={0.01} onChange={set("etaBat")}/>
            <Slider label="Min SoC" unit="" value={params.socMin} min={0.05} max={0.40} step={0.01} onChange={set("socMin")}/>
            <Slider label="C-Rate SED Derate" unit="" value={params.cRateDerate??0.08} min={0.0} max={0.20} step={0.01} onChange={set("cRateDerate")} note="SED loss at peak hover C-rate (8% default for ~3-4C)"/>
            {/* ══ THE SINGLE BIGGEST REASON THESE AIRCRAFT COME OUT HEAVY ══
                Three derates compound on the cell figure, and the result — not
                the cell number — is what actually sizes the battery. Users
                compare our MTOW against NASA's published concept vehicles and
                find us far heavier; this is why, and it is a TECHNOLOGY
                ASSUMPTION rather than a model error. NASA size on 400 Wh/kg
                installed-usable PACK (their own S3270 derives it as cell
                650 x 0.80 SoC / 1.30 packaging), which is roughly twice what
                a 300 Wh/kg cell delivers after real derates. Their figure is
                explicitly future technology; 300 Wh/kg cell is
                realistic-today. Both are defensible — but the comparison is
                meaningless unless the reader can see the gap. */}
            {(()=>{
              /* etaBat is applied to VERTICAL FLIGHT ONLY (NASA RST, corpus
                 S3270), so the whole-pack figure must use the EFFECTIVE value
                 the sizing actually used — not the raw input. Multiplying the
                 raw 0.90 in here overstated the derate by about 10%, which is
                 the same convention mismatch the engine itself used to have. */
              const etaEff=SR?.etaBatEffective??(params.etaBat??0.90);
              const eff=(params.sedCell||300)*(1-(params.socMin??0.19))
                       *(1-(params.cRateDerate??0.08))*etaEff;
              const ratio=400/Math.max(1,eff);
              return(
                <div style={{marginTop:8,padding:"7px 9px",borderRadius:5,
                  background:`${SC.teal}10`,border:`1px solid ${SC.teal}44`}}>
                  <div style={{fontSize:10,color:SC.teal,fontWeight:700,marginBottom:3,
                    fontFamily:"system-ui,sans-serif"}}>
                    Effective usable energy: {eff.toFixed(0)} Wh/kg
                  </div>
                  <div style={{fontSize:9.5,color:SC.text,lineHeight:1.45,
                    fontFamily:"system-ui,sans-serif"}}>
                    {params.sedCell} cell × {(100*(1-(params.socMin??0.19))).toFixed(0)}% SoC
                    × {(100*(1-(params.cRateDerate??0.08))).toFixed(0)}% C-rate
                    × {(100*etaEff).toFixed(1)}% battery efficiency.
                    <br/>
                    <span style={{color:SC.muted}}>
                      Battery η is <b>{(100*(params.etaBat??0.90)).toFixed(0)}%</b>, but it
                      applies to <b>vertical flight only</b> — internal resistance only bites
                      at high discharge rate ({SR?.CrateHov?.toFixed(1) ?? "~4"}C in hover
                      against {SR?.CrateCr?.toFixed(1) ?? "~1.4"}C in cruise). NASA's RST does
                      the same and states it explicitly. Here vertical flight is{" "}
                      {SR?.EvertKWh?.toFixed(1) ?? "—"} of {SR?.Etot?.toFixed(1) ?? "—"} kWh,
                      so the mission-average is {(100*etaEff).toFixed(1)}%.
                    </span>
                    <br/>
                    NASA's reference vehicles assume <b>400 Wh/kg installed-usable
                    pack</b> — <b>{ratio.toFixed(1)}×</b> this. That gap is the main
                    reason this tool sizes heavier than NASA's published concepts.
                    Their figure is future technology (cell 650 Wh/kg); this one is
                    realistic today.
                  </div>
                </div>
              );
            })()}
          </Acc>
          <Acc title="V-Tail Design" icon="">
            <Slider label="Dihedral Angle Γ" unit="°" value={params.vtGamma} min={20} max={70} step={1} onChange={set("vtGamma")}
              note={SR?`Optimal: ${SR.vtGamma_opt}°`:""}/>
            <Slider label="H-Tail Vol. Coeff Ch" unit="" value={params.vtCh} min={0.15} max={1.00} step={0.01} onChange={set("vtCh")} note="NASA RAVEN 0.85 / SWFT 0.70, measured from their OpenVSP geometry"/>
            <Slider label="V-Tail Vol. Coeff Cv" unit="" value={params.vtCv} min={0.015} max={0.10} step={0.002} onChange={set("vtCv")} note="NASA RAVEN 0.0574 / SWFT 0.0589, measured"/>
            <Slider label="Panel Aspect Ratio" unit="" value={params.vtAR} min={1.5} max={4.0} step={0.1} onChange={set("vtAR")} note="Typical 2.0–3.0"/>
          </Acc>
          <Acc title="Structure" icon="">
            {/* SC-VTOL certification category — drives avionics redundancy and
                the MOC VTOL.2120 climb requirement. */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:SC.muted,fontFamily:"system-ui,sans-serif",marginBottom:4}}>SC-VTOL Category</div>
              <div style={{display:"flex",gap:4}}>
                {[["enhanced","Enhanced","continued safe flight and landing after any single failure — triplex avionics, 2.5% climb gradient one unit down"],
                  ["basic","Basic","controlled emergency landing permitted — duplex avionics, 2.5% climb gradient all-operating at ISA SL"]].map(([k,lbl,tip])=>{
                  const on=(params.vtolCategory||"enhanced")===k;
                  return(
                    <button key={k} type="button" title={tip} onClick={()=>set("vtolCategory")(k)}
                      style={{flex:1,padding:"5px 0",borderRadius:4,cursor:"pointer",
                        fontSize:10,fontWeight:on?700:400,fontFamily:"system-ui,sans-serif",
                        background:on?`${SC.amber}22`:"transparent",
                        border:`1px solid ${on?SC.amber:SC.border}`,
                        color:on?SC.amber:SC.muted}}>{lbl}</button>
                  );
                })}
              </div>
              {SR&&SR.certClimbGradientPct!=null&&(
                <div style={{fontSize:9,color:SR.certClimbPass?SC.green:SC.red,marginTop:4,fontFamily:"'DM Mono',monospace"}}>
                  MOC VTOL.2120: {SR.certClimbGradientPct}% vs {SR.certClimbRequiredPct}% required — CFP {SR.certClimbCFP}
                </div>)}
            </div>
            {/* Limit manoeuvring load factors — the applicant's PROPOSAL under
                MOC VTOL.2200(f). The engine, weights, V-n and report honoured
                these since 2026-09-16 but nothing in the UI could set them, so
                the 2.0 g floor was reachable only from code. The slider's inner
                end IS the floor; the value shown is the proposal, the note says
                what governs. */}
            <Slider label="Manoeuvre Limit n+" unit="g"
              value={params.nLimitManoeuvre ?? PROPOSED_N_LIMIT_MANOEUVRE}
              min={N_LIMIT_MANOEUVRE_INPUT_RANGE.pos.min} max={N_LIMIT_MANOEUVRE_INPUT_RANGE.pos.max}
              step={0.1} onChange={set("nLimitManoeuvre")}
              note={SR?.loadFactorBasis==="thrust-borne"
                ? `Not used by this layout: thrust-borne, limit ${SR.nLimit} g from ${SR.loadGoverningCase}`
                : `Proposal, MOC VTOL.2200(f) floor ${SC_VTOL_N_LIMIT_FLOOR}`
                  + (SR ? ` · governing ${SR.nLimit} g (${SR.loadGoverningCase}) · ultimate ${SR.nUltimate} g sizes the structure` : "")}/>
            <Slider label="Manoeuvre Limit n−" unit="g"
              value={params.nLimitManoeuvreNeg ?? PROPOSED_N_LIMIT_MANOEUVRE_NEG}
              min={N_LIMIT_MANOEUVRE_INPUT_RANGE.neg.min} max={N_LIMIT_MANOEUVRE_INPUT_RANGE.neg.max}
              step={0.1} onChange={set("nLimitManoeuvreNeg")}
              note={`Proposal, MOC VTOL.2200(f) floor ${SC_VTOL_N_NEG_FLOOR} · draws the V-n envelope; sizes no structure here`}/>
            {/* Empty-weight model selector — fraction (input) vs buildup (computed) */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:SC.muted,fontFamily:"system-ui,sans-serif",marginBottom:4}}>Empty Weight Model</div>
              <div style={{display:"flex",gap:4}}>
                {[["fraction","Fraction","ewf slider drives MTOW"],
                  ["buildup","Buildup","component sum drives MTOW"]].map(([k,lbl,tip])=>{
                  const on=(params.weightModel||"fraction")===k;
                  return(
                    <button key={k} type="button" title={tip} onClick={()=>set("weightModel")(k)}
                      style={{flex:1,padding:"5px 0",borderRadius:4,cursor:"pointer",
                        fontSize:10,fontWeight:on?700:400,fontFamily:"system-ui,sans-serif",
                        background:on?`${SC.amber}22`:"transparent",
                        border:`1px solid ${on?SC.amber:SC.border}`,
                        color:on?SC.amber:SC.muted}}>{lbl}</button>
                  );
                })}
              </div>
              {params.weightModel==="buildup"&&SR&&(
                <div style={{marginTop:6,padding:"6px 8px",background:`${SC.teal}0d`,
                  border:`1px solid ${SC.teal}33`,borderRadius:5}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:10,color:SC.teal,fontFamily:"system-ui,sans-serif"}}>Computed EWF</span>
                    <span style={{fontSize:11,fontWeight:800,color:SC.teal,fontFamily:"'DM Mono',monospace"}}>{SR.ewfImplied}</span>
                  </div>
                  {SR.weightGroups&&Object.entries(SR.weightGroups)
                    .sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
                      <span style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                      <span style={{fontSize:9,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{U.mass(v)} {U.massU}</span>
                    </div>
                  ))}
                  <div style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:4,lineHeight:1.4}}>
                    Raymer GA group equations + composite factors. Validated MAE 36.6% vs
                    published aircraft — under-predicts eVTOL structure. Opt-in until calibrated.
                  </div>
                </div>
              )}
            </div>
            <Slider label="Empty Weight Fraction" unit="" value={params.ewf} min={0.30} max={0.70} step={0.01} onChange={set("ewf")} note={params.weightModel==="buildup"?"⚠ ignored — buildup model is active":"Sourced: NASA L+C 0.656 / Archer 0.653 / Joby 0.510 (battery excluded)"}/>
            <Slider label="Fuselage Length" unit="m" value={params.fusLen} min={3.0} max={10.0} step={0.1} onChange={set("fusLen")} note="Affects drag, stability, tail arm"/>
            <Slider label="Fuselage Diameter" unit="m" value={params.fusDiam} min={0.8} max={2.5} step={0.05} onChange={set("fusDiam")} note={`Fineness ratio: ${(params.fusLen/params.fusDiam).toFixed(1)}`}/>
          </Acc>
          {/* Design checks */}
          {SR&&(
            <div style={{marginTop:10,borderTop:`1px solid ${SC.border}`,paddingTop:10}}>
              <div style={{fontSize:10,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:7}}>Design Checks</div>
              {SR.checks.map((chkItem,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:`1px solid #0f131a`}}>
                  <span style={{fontSize:11}}>{mark(chkItem.ok)}</span>
                  <span style={{fontSize:10,color:chkItem.ok?SC.green:SC.red,flex:1,fontFamily:"'DM Mono',monospace"}}>{chkItem.label}</span>
                  <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{convertCheckVal(chkItem.val)}</span>
                </div>
              ))}
            </div>
          )}
          </div>{/* end full sidebar content */}
        </div>{/* end sidebar */}

        {/* MAIN */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Tabs — two-row: category pills on top, sub-tabs below */}
          <div style={{flexShrink:0,background:SC.panel,borderBottom:`1px solid ${SC.border}`}}>
            {/* Row 1 — category pills */}
            <div style={{display:"flex",gap:4,padding:"6px 10px 0",overflowX:"auto"}}>
              {TAB_GROUPS.map((grp,gi)=>{
                const isActive=gi===activeGroup;
                return(
                  <button key={gi} type="button"
                    onClick={()=>{
                      setActiveGroup(gi);
                      // jump to first tab in group if current tab isn't in this group
                      if(!grp.tabs.includes(tab)) setTab(grp.tabs[0]);
                      tap("selection");
                    }}
                    /* Named from the group itself. This was a chain of ternaries keyed on
   the group INDEX, so it would have kept saying "Analysis (Ctrl+A)"
   over a group renamed to Trades -- a tooltip that lies about where a
   key takes you is worse than no tooltip. */
                    title={`${grp.label}${GROUP_KEYS[gi]?" ("+GROUP_KEYS[gi]+")":""}`}
                    /* MONOCHROME GROUP TABS. Each group carried its own hex —
                       amber, blue, green, purple, steel — so the primary
                       navigation was five competing hues before any DATA had
                       been coloured, and all five were dark-theme values used
                       in both themes. The active group now reads by contrast
                       and weight, which is what a label in a tab strip should
                       read by; the group's identity is its name. */
                    style={{padding:"4px 14px",border:`1px solid ${isActive?SC.border:"transparent"}`,
                      borderBottom:"none",borderRadius:"2px 2px 0 0",cursor:"pointer",
                      background:isActive?SC.panel:"transparent",
                      color:isActive?SC.text:SC.muted,
                      fontSize:12,fontWeight:isActive?600:400,
                      whiteSpace:"nowrap",transition:"all 0.15s",
                      fontFamily:"system-ui,sans-serif",letterSpacing:"0.01em"}}>
                    {grp.label}
                  </button>
                );
              })}
            </div>
            {/* Row 2 — sub-tabs for active group */}
            <div style={{display:"flex",overflowX:"auto",padding:"0 6px",
              borderTop:`1px solid ${SC.border}`,background:SC.bg}}>
              {TAB_GROUPS[activeGroup].tabs.filter(i=>!hiddenForCfg.has(i)).map(i=>{
                const grpColor=SC.text;   // one accent, not one per group
                const isActive=i===tab;
                return(
                  <button key={i} type="button" onClick={()=>{setTab(i);tap("selection");}}
                    style={{padding:"7px 14px",background:"transparent",border:"none",cursor:"pointer",
                      borderBottom:isActive?`2px solid ${grpColor}`:"2px solid transparent",
                      color:isActive?SC.text:SC.muted,
                      fontSize:11,fontFamily:"system-ui,sans-serif",
                      whiteSpace:"nowrap",transition:"color 0.15s",letterSpacing:"0.01em"}}>
                    {i===TAB.TAIL?tailTabLabel(cfgCap):TABS[i]}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"14px 18px 28px",background:SC.bg}}>
            <TabErrorBoundary SC={SC}>
            {/* Shared design banner — shown when ?design= is in URL */}
            {sharedDesignId&&(
              <PublicDesignBanner shareId={sharedDesignId} onLoad={row=>openDesignSafely(()=>recordFromRow(row.params,row.results),"shared design")} C={SC}/>
            )}
            <DesignNotice notice={designNotice} onClose={()=>setDesignNotice(null)}/>
            <ResultWarnings warnings={resultWarn} params={deferredParams}/>
            {!SR&&<div style={{color:SC.red,fontFamily:"'DM Mono',monospace",padding:20}}>Calculation error — adjust inputs.</div>}
            {/* ══ NON-CONVERGENCE BANNER ══════════════════════════════════
                A diverged run still returns a full result object, and every
                number in it is the last iterate of a runaway — the engine's
                own provenance calls r2Diverged "THE flag to read before
                trusting any other number in the result".

                That flag was surfaced ONLY on the Convergence tab, which a
                user need never open. So selecting a wingless configuration
                while the mission is still the winged air-taxi one showed a
                runaway 18,862 kg MTOW on the Overview tab as though it were an
                answer. A tool that presents a divergence as a result is worse
                than one that refuses to answer.

                This sits above every tab, states the cause, and names the fix.
                The commonest cause by far is a configuration/mission mismatch:
                a multicopter cannot fly 190 km, so switching to one without
                also changing the mission cannot converge. */}
            {SR&&(SR.r2Diverged||SR.r2Converged===false)&&(
              <div style={{margin:"0 0 14px",padding:"12px 14px",borderRadius:8,
                background:`${SC.red}14`,border:`1px solid ${SC.red}66`}}>
                <div style={{fontSize:13,fontWeight:800,color:SC.red,
                  fontFamily:"system-ui,sans-serif",marginBottom:6}}>
                  ⚠ THIS DESIGN DID NOT CONVERGE — the numbers below are not a result
                </div>
                <div style={{fontSize:11,color:SC.text,fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
                  The sizing loop ran away instead of closing, so every value shown
                  is the last iterate of a divergence rather than a sized aircraft.
                  {SR.configLabel&&<> Current layout: <b>{SR.configLabel}</b>.</>}
                  <br/>
                  <b>Most likely cause:</b> the mission does not suit this
                  configuration. A rotor-borne layout (multicopter, side-by-side)
                  cannot fly a long winged air-taxi mission — its cruise
                  efficiency is far lower, so the battery grows faster than the
                  aircraft can lift it. Open <b>Aircraft Configuration</b> in the
                  sidebar and use <b>Apply reference mission</b>, or reduce range.
                </div>
              </div>
            )}
            {SR&&<>

            {/* ──── TAB 0: OVERVIEW ──── */}
            {tab===0&&SR&&<OverviewTab {...tabCtx}/>}

            {/* ──── TAB 1: MISSION ──── */}
            {tab===1&&<MissionTab {...tabCtx}/>}


            {/* ──── TAB 2: WING & AERO ──── */}
            {tab===2&&SR&&<WingAeroTab {...tabCtx}/>}

            {/* ──── TAB 3: PROPULSION ──── */}
            {tab===3&&SR&&<PropulsionTab {...tabCtx}/>}

            {/* ──── TAB 4: BATTERY ──── */}
            {tab===4&&SR&&<BatteryTab {...tabCtx}/>}

            {/* ──── TAB 5: PERFORMANCE ──── */}
            {tab===5&&SR&&<PerformanceTab {...tabCtx}/>}

            {/* ──── TAB 6: STABILITY ──── */}
            {tab===6&&SR&&<StabilityTab {...tabCtx}/>}

            {/* ──── TAB 7: V-TAIL SIZING ──── */}
            {tab===7&&SR&&<VTailTab {...tabCtx}/>}
            {/* ──── TAB 8: CONVERGENCE ──── */}
            {tab===8&&SR&&<ConvergenceTab {...tabCtx}/>}

            {/* ──── TAB 9: MONTE CARLO UNCERTAINTY ANALYSIS ──── */}
            {tab===9&&<MonteCarloTab {...tabCtx}/>}


            {/* ──── TAB 10: CERTIFICATION COMPLIANCE CHECKER ──── */}
            {tab===10&&SR&&<CertificationTab {...tabCtx}/>}

            {/* ──── TAB 11: NOISE ESTIMATION ──── */}
            {tab===11&&SR&&<NoiseTab {...tabCtx}/>}

            {/* ──── TAB 12: COST ESTIMATOR ──── */}
            {tab===12&&SR&&<CostTab {...tabCtx}/>}

            {/* ──── TAB 13: MISSION BUILDER ──── */}
            {tab===13&&<MissionBuilderTab {...tabCtx}/>}

            {/* ──── TAB 12: WEATHER & ATMOSPHERE ──── */}
            {tab===14&&<WeatherTab {...tabCtx}/>}

            {/* ──── TAB 13: OPENVSP EXPORT ──── */}
            {tab===15&&<OpenVSPTab {...tabCtx}/>}

            {/* ──── TAB 16: COMMUNITY, LEADERBOARD, GALLERY & VERSION HISTORY ──── */}
            {tab===16&&<CommunityTab {...tabCtx}/>}

            </>}   {/* closes {SR&&<> opened above — tabs 0-16 all require SR */}

            {/* ──── TAB 18: V-n DIAGRAM + OEI CHECK ──── */}
            {tab===18&&SR&&<VnDiagramTab {...tabCtx}/>}

            {/* ──── TAB 19: DESIGN SPACE EXPLORER (Pareto Front) ────
                OUTSIDE SR&& so it NEVER unmounts when params change.
                CSS display:none keeps it alive while hidden — same pattern as tab 17. ── */}
            <div style={{display:tab===19?'block':'none'}}>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:`linear-gradient(135deg,${SC.bg},#1a0a2e)`,border:`1px solid #8b5cf644`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:4}}>LATIN HYPERCUBE SAMPLING — PARETO ANALYSIS</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:SC.purple}}>Design Space</span> Explorer
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:760}}>
                    Simultaneously sweeps Range × Payload × MTOW design space using Latin Hypercube Sampling across 8 key design variables. Each point is a full sizing solution. Feasible (green) vs infeasible (red) boundary shows the true design frontier — what Joby and Archer compute with proprietary tools.
                  </div>
                </div>
                <DesignSpacePanel params={params} SC={SC} TTP={TTP} runSizingFn={runSizing} U={U}
                  onApply={pt=>setParams(prev=>({
                    ...prev,
                    range:    pt.range,
                    payload:  Math.round(pt.payload),   // must be integer
                    LD:       pt.LD,
                    sedCell:  Math.round(pt.sedCell),   // must be integer
                    ewf:      pt.ewf,
                    AR:       Math.round(pt.AR*10)/10,  // one decimal
                    etaHov:   pt.etaHov,
                    etaSys:   pt.etaSys,
                  }))}/>
              </div>
            </div>

            {/* ──── TAB 20: BEM ROTOR SOLVER ──── */}
            {tab===20&&(
              <BEMPanel params={params} SR={SR} SC={SC} U={U}/>
            )}

            {/* ──── TAB 21: REGULATORY CHANGE TRACKER ──── */}
            {tab===21&&(
              <RegTrackerPanel params={params} SR={SR} SC={SC}/>
            )}

            {/* ──── TAB 22: AI DESIGN ASSISTANT ──── */}
            {tab===22&&(
              <AIAssistantPanel params={params} SR={SR} SC={SC} onParamChange={set} user={user}/>
            )}

            {/* ──── TAB 17: DESIGN ARCHIVE ────
                Persisted outside SR&&<> so state is never lost on tab switch.
                CSS display:none keeps the component mounted while hidden. ── */}
            <div style={{display:tab===17?'block':'none',minHeight:tab===17?0:0}}>
              <CollabPanel user={user} params={params} onParamChange={set} C={SC} onAuth={handleAuth}/>
            </div>

            {/* ──── TAB 23: WEIGHT & BALANCE ENVELOPE ──── */}
            {tab===23&&SR&&(
              <WBEnvelopePanel params={params} SR={SR} SC={SC} U={U}/>
            )}

            {/* ──── TAB 24: COMPONENT DATABASE ──── */}
            {tab===24&&(
              <ComponentDBPanel params={params} SC={SC} onParamChange={set} U={U}/>
            )}

            {/* ──── TAB 25: CONSTRAINT DIAGRAM ────
                 Wing loading stops being an unexplained slider and becomes a
                 derived result, with the published aircraft as the check. */}
            {tab===25&&<ConstraintDiagramTab {...tabCtx}/>}

            {/* ──── TAB 26: COMPARE LAYOUTS ────
                 All six configurations on ONE mission - the question the tool
                 exists to answer, and until now not on screen anywhere. */}
            {tab===26&&<CompareLayoutsTab {...tabCtx}/>}

            {/* ──── TAB 27: UNCERTAINTY ────
                 An error bar whose input ranking comes from the provenance
                 registry rather than from ranges typed in by hand. */}
            {tab===27&&<UncertaintyTab {...tabCtx}/>}

            {/* ──── TAB 28: NASA OpenVSP MODELS ────
                 Pick a released NASA .vsp3 and size THAT aircraft — geometry
                 straight out of the file, gross weight left as a result. */}
            {tab===28&&<VspModelsTab {...tabCtx}/>}
            </TabErrorBoundary>
          </div>
        </div>
      </div>
      {/* Always-present instrument: convergence, closure margin, growth factor
          and the failing checks. These decide whether anything above is worth
          reading, so they do not live inside a tab. */}
      <StatusBar SR={SR} U={U}/>
    </div>
    </PowertrainContext.Provider>
  );
}
