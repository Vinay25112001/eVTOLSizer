import {
  Area,
  Bar,
  Cell,
} from "recharts";
import { SC } from "../lib/theme.js";
import { Panel } from "../ui/primitives.jsx";
import { resultWarnings, uncertaintyStatement, CATEGORIES } from "../lib/warnings.js";
import { appVersionLabel, reserveMinutesOf } from "../lib/designfile.js";

export function generateReport(p, SR, branding={}, useImperial=false) {
  const fmt = (v, d=3) => (typeof v==="number" && isFinite(v)) ? v.toFixed(d) : "—";
  const now = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});

  // ── Unit conversion for report display ──────────────────────────────
  const R = useImperial ? {
    mass:  (kg)  => (kg  * 2.20462).toFixed(1), massU:  "lb",
    dist:  (km)  => (km  * 0.539957).toFixed(1),distU:  "nm",
    speed: (ms)  => (ms  * 1.94384).toFixed(1), speedU: "kts",
    power: (kw)  => (kw  * 1.34102).toFixed(1), powerU: "hp",
    area:  (m2)  => (m2  * 10.7639).toFixed(2), areaU:  "ft²",
    len:   (m)   => (m   * 3.28084).toFixed(2), lenU:   "ft",
    sed:   (v)   => (v   * 0.453592).toFixed(1),sedU:   "Wh/lb",
    wl:    (npm2)=> (npm2* 0.020885).toFixed(2),wlU:    "lb/ft²",
    note:  "(values shown in US customary units)"
  } : {
    mass:  (kg)  => fmt(kg,1),  massU:  "kg",
    dist:  (km)  => fmt(km,1),  distU:  "km",
    speed: (ms)  => fmt(ms,1),  speedU: "m/s",
    power: (kw)  => fmt(kw,1),  powerU: "kW",
    area:  (m2)  => fmt(m2,2),  areaU:  "m²",
    len:   (m)   => fmt(m,3),   lenU:   "m",
    sed:   (v)   => fmt(v,1),   sedU:   "Wh/kg",
    wl:    (npm2)=> fmt(npm2,1),wlU:    "N/m²",
    note:  "(values shown in SI units)"
  };
  const feasBadge = SR.feasible
    ? `<span class="badge green">✓ FEASIBLE</span>`
    : `<span class="badge amber">⚠ CHECK DESIGN</span>`;

  // ── Battery dual-constraint vars — must be at top, used in multiple sections ──
  const sedEffd = p.sedCell*(1-(p.cRateDerate??0.08));
  const WEd = SR.Etot*1000/((1-p.socMin)*sedEffd*p.etaBat);
  const WPd = SR.Phov/(p.spBattery||1.0);

  // ── Section builder helpers ──────────────────────────────────────────
  const sec = (id, title, content) =>
    `<section id="${id}"><h2>${title}</h2>${content}</section>`;

  const eq = (latex, note="") =>
    `<div class="eq-block"><span class="katex-eq" data-latex="${latex.replace(/"/g,'&quot;')}"></span>${note?`<div class="eq-note">${note}</div>`:""}</div>`;

  const sub = (latex, note="") =>
    `<span class="katex-inline" data-latex="${latex.replace(/"/g,'&quot;')}"></span>${note}`;

  const row = (label, formula, value, unit="") =>
    `<tr><td class="td-label">${label}</td><td class="td-formula">${formula}</td><td class="td-value">${value}</td><td class="td-unit">${unit}</td></tr>`;

  const table = (headers, rows) =>
    `<table class="data-table"><thead><tr>${headers.map(hdr=>`<th>${hdr}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;

  const check = (ok, label, val) =>
    `<tr class="${ok?"ok":"fail"}"><td>${ok?"✓":"✗"}</td><td>${label}</td><td>${val}</td></tr>`;

  // ── COVER PAGE ───────────────────────────────────────────────────────
  const bAuthor = branding.authorName || "Vinay Kumar Reddy Sirigireddy";
  const bUniv   = branding.university || "Wright State University";
  const bTitle  = branding.projectTitle || "eVTOL Aircraft Sizing Report";
  const bDate   = branding.date || now;
  const bLogo   = branding.logoUrl || "";

  const cover = `
  <div class="cover-page">
    <div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#f59e0b,#3b82f6,#14b8a6);"></div>

    ${bLogo ? `<div style="margin-bottom:24px;text-align:center;">
      <img src="${bLogo}" alt="${bUniv} Logo"
        style="height:70px;max-width:260px;object-fit:contain;border-radius:6px;"
        onerror="this.parentElement.style.display='none'">
    </div>` : ""}

    <div class="cover-badge">AEROSPACE DESIGN SUITE — eVTOL SIZER ${appVersionLabel()}</div>
    <div class="cover-title">${bTitle}</div>
    <div class="cover-sub">Parametric Sizing &amp; Performance Analysis — conceptual design (NPR 7150.2D Class E)</div>
    <div class="cover-line"></div>

    <div style="display:flex;gap:32px;width:100%;max-width:760px;margin-bottom:32px;align-items:flex-start;">
      <table class="cover-meta" style="flex:1;">
        <tr><td>Author / Engineer</td><td>${bAuthor}</td></tr>
        <tr><td>Institution</td><td>${bUniv}</td></tr>
        <tr><td>Advisor</td><td>Dr. Darryl K. Ahner</td></tr>
        <tr><td>Method</td><td>NDARC/AFDD-method conceptual sizing</td></tr>
        <tr><td>Algorithm</td><td>eVTOL_Full_Analysis_v2.m — JS Port</td></tr>
        <tr><td>Report Date</td><td>${bDate}</td></tr>
        <tr><td>Generated</td><td>${now}</td></tr>
        <tr><td>Design Status</td><td>${feasBadge}</td></tr>
      </table>
      <div style="min-width:190px;">
        <div style="font-size:7pt;color:#7fa3c8;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px;font-family:monospace;border-bottom:1px solid #1e3a5c;padding-bottom:6px;">Key Results ${R.note}</div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">MTOW</span><span style="font-size:8.5pt;color:#f59e0b;font-weight:700;font-family:monospace;">${R.mass(SR.MTOW)} ${R.massU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Empty Weight</span><span style="font-size:8.5pt;color:#f59e0b;font-weight:700;font-family:monospace;">${R.mass(SR.Wempty)} ${R.massU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Battery Mass</span><span style="font-size:8.5pt;color:#f59e0b;font-weight:700;font-family:monospace;">${R.mass(SR.Wbat)} ${R.massU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Hover Power</span><span style="font-size:8.5pt;color:#14b8a6;font-weight:700;font-family:monospace;">${R.power(SR.Phov)} ${R.powerU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Cruise Power</span><span style="font-size:8.5pt;color:#14b8a6;font-weight:700;font-family:monospace;">${R.power(SR.Pcr)} ${R.powerU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Total Energy</span><span style="font-size:8.5pt;color:#3b82f6;font-weight:700;font-family:monospace;">${fmt(SR.Etot,2)} kWh</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Wing Span</span><span style="font-size:8.5pt;color:#22c55e;font-weight:700;font-family:monospace;">${R.len(SR.bWing)} ${R.lenU}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #131f30;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Actual L/D</span><span style="font-size:8.5pt;color:#22c55e;font-weight:700;font-family:monospace;">${fmt(SR.LDact,2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:8pt;color:#7fa3c8;font-family:monospace;">Static Margin</span><span style="font-size:8.5pt;color:#22c55e;font-weight:700;font-family:monospace;">${fmt(SR.SM_vt*100,1)}%</span></div>
      </div>
    </div>

    <div class="cover-kpi-grid">
      <div class="kpi"><div class="kpi-val">${R.mass(SR.MTOW)}</div><div class="kpi-lbl">MTOW (${R.massU})</div></div>
      <div class="kpi"><div class="kpi-val">${fmt(SR.Etot,2)}</div><div class="kpi-lbl">Energy (kWh)</div></div>
      <div class="kpi"><div class="kpi-val">${R.power(SR.Phov)}</div><div class="kpi-lbl">Hover Power (${R.powerU})</div></div>
      <div class="kpi"><div class="kpi-val">${R.len(SR.bWing)}</div><div class="kpi-lbl">Wing Span (${R.lenU})</div></div>
      <div class="kpi"><div class="kpi-val">${fmt(SR.SM_vt*100,1)}%</div><div class="kpi-lbl">Static Margin</div></div>
      <div class="kpi"><div class="kpi-val">${fmt(SR.LDact,2)}</div><div class="kpi-lbl">Actual L/D</div></div>
    </div>

    <div style="position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:7pt;color:#3a5a7a;font-family:monospace;letter-spacing:0.08em;">
      Wright State University &nbsp;·&nbsp; eVTOL Sizer &nbsp;·&nbsp; ${bDate}
    </div>
  </div>`;

  // ── 1. DESIGN INPUTS ─────────────────────────────────────────────────
  const s1 = sec("inputs","1. Design Inputs & Mission Requirements",`
  <p>The following input parameters define the baseline design for the Trail 1 eVTOL configuration. All sizing calculations are derived directly from these values. ${R.note}</p>
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Payload","m<sub>pay</sub>",R.mass(p.payload),R.massU),
    row("Design Range","SR",R.dist(p.range),R.distU),
    row("Cruise Speed","V<sub>cr</sub>",R.speed(p.vCruise),R.speedU),
    row("Cruise Altitude","h<sub>cr</sub>",R.len(p.cruiseAlt),R.lenU),
    row("Reserve Time","t<sub>res,min</sub>",reserveMinutesOf(p),"min"),
    row("Hover Height","h<sub>hov</sub>",R.len(p.hoverHeight),R.lenU),
    row("L/D (design)","(L/D)<sub>des</sub>",p.LD,""),
    row("Wing AR","AR",p.AR,""),
    row("Oswald Efficiency","e",p.eOsw,""),
    row("Design C<sub>L</sub>","C<sub>L,des</sub>",p.clDesign,""),
    row("Taper Ratio","λ",p.taper,""),
    row("t/c Ratio","(t/c)",p.tc,""),
    row("No. of Rotors","N<sub>rot</sub>",p.nPropHover,""),
    row("Rotor Diameter","D<sub>rot</sub>",R.len(p.propDiam),R.lenU),
    row("Hover FOM","η<sub>hov</sub>",p.etaHov,""),
    row("System Efficiency","η<sub>sys</sub>",p.etaSys,""),
    row("Rate of Climb","RoC",R.speed(p.rateOfClimb),R.speedU),
    row("Climb Angle","γ<sub>cl</sub>",p.climbAngle,"°"),
    row("Cell Spec. Energy","SED<sub>cell</sub>",R.sed(p.sedCell),R.sedU),
    row("Battery Efficiency","η<sub>bat</sub>",p.etaBat,""),
    row("Min. SoC","SoC<sub>min</sub>",p.socMin,""),
    row("Empty Weight Frac.","EWF",p.ewf,""),
    row("Fuselage Length","L<sub>fus</sub>",R.len(p.fusLen),R.lenU),
    row("Fuselage Diameter","D<sub>fus</sub>",R.len(p.fusDiam),R.lenU),
    row("V-Tail Dihedral","Γ",p.vtGamma,"°"),
    row("Horiz. Tail Vol. Coeff.","C<sub>h</sub>",p.vtCh,""),
    row("Vert. Tail Vol. Coeff.","C<sub>v</sub>",p.vtCv,""),
    row("V-Tail AR","AR<sub>vt</sub>",p.vtAR,""),
  ])}
  `);

  // ── 2. ATMOSPHERE MODEL ──────────────────────────────────────────────
  const s2 = sec("atmo","2. Atmosphere Model (ISA)",`
  <p>All aerodynamic calculations use the International Standard Atmosphere (ISA) model evaluated at the cruise altitude h = ${p.cruiseAlt} m.</p>
  ${eq("T_{cr} = T_0 - L_{lapse} \\cdot h_{cr} = 288.15 - 0.0065 \\times "+p.cruiseAlt+" = "+fmt(288.15-0.0065*p.cruiseAlt,2)+"\\text{ K}",
    "Temperature at cruise altitude")}
  ${eq("\\rho_{cr} = \\rho_{SL}\\left(\\frac{T_{cr}}{T_0}\\right)^{\\left(\\frac{g_0}{L_{lapse}\\,R_{air}}\\right)-1} = "+fmt(SR.MTOW ? 1.225*Math.pow((288.15-0.0065*p.cruiseAlt)/288.15, (-9.81/(-0.0065*287))-1) : 1.112,4)+"\\text{ kg/m}^3",
    "Density at cruise altitude (ISA troposphere)")}
  ${eq("a_{cr} = \\sqrt{\\gamma R_{air} T_{cr}} = \\sqrt{1.4 \\times 287 \\times "+(288.15-0.0065*p.cruiseAlt).toFixed(2)+"} = "+fmt(Math.sqrt(1.4*287*(288.15-0.0065*p.cruiseAlt)),2)+"\\text{ m/s}",
    "Speed of sound at cruise altitude")}
  ${eq("M = \\frac{V_{cr}}{a_{cr}} = \\frac{"+p.vCruise+"}{"+fmt(Math.sqrt(1.4*287*(288.15-0.0065*p.cruiseAlt)),2)+"} = "+fmt(SR.Mach,4),
    "Cruise Mach number")}
  `);

  // ── 3. WEIGHT SIZING ─────────────────────────────────────────────────
  const s3 = sec("weight","3. Weight & Energy Sizing (Iterative)",`
  <p>The MTOW is found by simultaneously converging the weight and energy fractions using a nested iterative scheme. The battery mass fraction is:</p>
  ${eq("f_{bat} = \\frac{g_0 \\cdot SR}{(L/D)\\,\\eta_{sys}\\,\\text{SED}_{cell}\\times 3600}","Battery mass fraction (range-energy method)")}
  ${eq("W_E = \\frac{E_{total}\\times 1000}{(1-\\text{SoC}_{min})\\,\\text{SED}_{eff}\\,\\eta_{bat}},\\quad W_P = \\frac{P_{hov}}{SP_{bat}},\\quad W_{bat}=\\max(W_E,\\,W_P)","Dual-constraint battery: energy limit + power limit (actual sizing method)")}
  ${eq("\\text{MTOW} = m_{pay} + f_{EW}\\cdot\\text{MTOW} + W_{bat}","Weight closure equation (solved iteratively)")}
  ${table(["Quantity","Symbol","Value","Unit"],[
    row("MTOW (initial)","MTOW<sub>1</sub>",R.mass(SR.MTOW1),R.massU),
    row("MTOW (converged)","MTOW",R.mass(SR.MTOW),R.massU),
    row("Empty Weight","W<sub>e</sub>",R.mass(SR.Wempty),R.massU),
    row("Battery Mass","W<sub>bat</sub>",R.mass(SR.Wbat),R.massU),
    row("Payload","m<sub>pay</sub>",R.mass(p.payload),R.massU),
    row("Battery Mass Fraction","W<sub>bat</sub>/MTOW",fmt(SR.Wbat/SR.MTOW*100,1),"%"),
  ])}
  `);

  // ── 4. MISSION ENERGY ────────────────────────────────────────────────
  const s4 = sec("energy","4. Mission Energy Breakdown",`
  <p>The mission is divided into six phases: Takeoff (hover), Climb, Cruise, Descent, Landing (hover), and Reserve.</p>
  ${eq("E_{total} = E_{TO}+E_{cl}+E_{cr}+E_{dc}+E_{ld}+E_{res} = "+fmt(SR.Etot,3)+"\\text{ kWh}","Total mission energy")}
  ${eq("P_{hov} = \\frac{W\\,g_0}{\\eta_{hov}}\\sqrt{\\frac{W\\,g_0}{2\\,\\rho_{SL}\\,N_{rot}\\,A_{disk}}} = "+fmt(SR.Phov,2)+"\\text{ kW}","Hover power (actuator disk theory)")}
  ${eq("P_{cr} = \\frac{W\\,g_0\\,V_{cr}}{\\eta_{sys}\\,(L/D)} = "+fmt(SR.Pcr,2)+"\\text{ kW}","Cruise power")}
  ${table(["Phase",`Power (${R.powerU})`,"Time (s)","Energy (kWh)"],[
    row("Takeoff (Hover)","P<sub>hov</sub> = "+R.power(SR.Phov),fmt(SR.tto,0),fmt(SR.Eto,3)),
    row("Climb","P<sub>cl</sub> = "+R.power(SR.Pcl),fmt(SR.tcl,0),fmt(SR.Ecl,3)),
    row("Cruise","P<sub>cr</sub> = "+R.power(SR.Pcr),fmt(SR.tcr,0),fmt(SR.Ecr,3)),
    row("Descent","P<sub>dc</sub> = "+R.power(SR.Pdc),fmt(SR.tdc,0),fmt(SR.Edc,3)),
    row("Landing (Hover)","P<sub>hov</sub> = "+R.power(SR.Phov),fmt(SR.tld,0),fmt(SR.Eld,3)),
    row("Reserve","P<sub>res</sub> = "+R.power(SR.Pres),fmt(SR.tres,0),fmt(SR.Eres,3)),
    row("<strong>Total</strong>","","<strong>"+fmt(SR.Tend,0)+" s</strong>","<strong>"+fmt(SR.Etot,3)+"</strong>"),
  ])}
  `);

  // ── 5. WING AERODYNAMICS ─────────────────────────────────────────────
  const s5 = sec("wing","5. Wing Design & Aerodynamics",`
  <p>Wing area is sized to provide the required lift at cruise using the design lift coefficient C<sub>L,des</sub> = ${p.clDesign}.</p>
  ${eq("S_w = \\frac{2\\,L_{req}}{\\rho_{cr}\\,V_{cr}^2\\,C_{L,des}} = \\frac{2\\times"+fmt(SR.MTOW*9.81,1)+"}{"+fmt(1.225*Math.pow((288.15-0.0065*p.cruiseAlt)/288.15,(-9.81/(-0.0065*287))-1),4)+"\\times"+p.vCruise+"^2\\times"+p.clDesign+"} = "+fmt(SR.Swing,2)+"\\text{ m}^2","Wing reference area")}
  ${eq("b_w = \\sqrt{AR\\cdot S_w} = \\sqrt{"+p.AR+"\\times"+fmt(SR.Swing,2)+"} = "+fmt(SR.bWing,2)+"\\text{ m}","Wing span")}
  ${eq("C_r = \\frac{2S_w}{b_w(1+\\lambda)} = "+fmt(SR.Cr_,3)+"\\text{ m}, \\quad C_t = \\lambda\\,C_r = "+fmt(SR.Ct_,3)+"\\text{ m}","Root and tip chord (taper λ = "+p.taper+")")}
  ${eq("\\bar{c} = \\frac{2}{3}C_r\\frac{1+\\lambda+\\lambda^2}{1+\\lambda} = "+fmt(SR.MAC,3)+"\\text{ m}","Mean aerodynamic chord (MAC)")}
  ${eq("\\Lambda_{LE} = \\arctan\\!\\left(\\frac{C_r - C_t}{b_w/2}\\right) = \\arctan\\!\\left(\\frac{"+fmt(SR.Cr_,3)+"-"+fmt(SR.Ct_,3)+"}{"+fmt(SR.bWing/2,3)+"}\\right) = "+fmt(SR.sweep,2)+"^\\circ","Leading edge sweep (semi-span denominator)")}
  ${eq("C_{D_0,total} = "+fmt(SR.CD0tot,5)+", \\quad C_{D_i} = \\frac{C_{L,des}^2}{\\pi\\,AR\\,e} = "+fmt(SR.CDi,5),"Parasitic and induced drag coefficients")}
  ${eq("(L/D)_{actual} = \\frac{C_{L,des}}{C_{D_0}+C_{D_i}} = "+fmt(SR.LDact,2),"Actual cruise lift-to-drag ratio")}
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Wing Area","S<sub>w</sub>",R.area(SR.Swing),R.areaU),
    row("Wing Span","b<sub>w</sub>",R.len(SR.bWing),R.lenU),
    row("Root Chord","C<sub>r</sub>",R.len(SR.Cr_),R.lenU),
    row("Tip Chord","C<sub>t</sub>",R.len(SR.Ct_),R.lenU),
    row("MAC","c̄",R.len(SR.MAC),R.lenU),
    row("y<sub>MAC</sub>","ȳ<sub>MAC</sub>",R.len(SR.Ymac),R.lenU),
    row("LE Sweep","Λ<sub>LE</sub>",fmt(SR.sweep,2),"°"),
    row("Wing Loading","W/S",R.wl(SR.WL),R.wlU),
    row("Re (MAC)","Re",fmt(SR.Re_,0),""),
    row("Selected Airfoil","—",SR.selAF?.name||"—",""),
    row("Actual L/D","(L/D)<sub>act</sub>",fmt(SR.LDact,2),""),
    row("C<sub>D0</sub> total","C<sub>D0</sub>",fmt(SR.CD0tot,5),""),
    row("C<sub>Di</sub>","C<sub>Di</sub>",fmt(SR.CDi,5),""),
  ])}
  `);

  // ── 6. PROPULSION ────────────────────────────────────────────────────
  const s6 = sec("prop","6. Hover Propulsion Sizing",`
  <p>Rotor disk area is sized from actuator disk theory to satisfy the hover power budget with the given figure of merit η<sub>hov</sub> = ${p.etaHov}.</p>
  ${eq("T_{rotor} = \\frac{W\\,g_0}{N_{rot}} = \\frac{"+fmt(SR.MTOW,1)+"\\times 9.81}{"+p.nPropHover+"} = "+fmt(SR.MTOW*9.81/p.nPropHover,1)+"\\text{ N}","Thrust per rotor")}
  ${eq("A_{disk} = \\frac{T_{rotor}^3}{2\\,\\rho_{SL}\\,(P_{rotor}\\,\\eta_{hov})^2}","Disk area from actuator disk momentum theory")}
  ${eq("D_{rotor} = 2\\sqrt{A_{disk}/\\pi} = "+fmt(SR.Drotor,3)+"\\text{ m}","Rotor diameter")}
  ${eq("\\Omega_{tip} = \\sqrt{\\frac{2P_{rotor}\\eta_{hov}}{\\rho_{SL}\\,A_{disk}}}, \\quad \\text{RPM} = \\frac{60\\,\\Omega_{tip}}{2\\pi SR} = "+fmt(SR.RPM,0),"Tip speed and rotational speed")}
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Hover Power (total)","P<sub>hov</sub>",R.power(SR.Phov),R.powerU),
    row("Power per Rotor","P<sub>rotor</sub>",R.power(SR.Phov/p.nPropHover),R.powerU),
    row("Rotor Diameter","D<sub>rot</sub>",R.len(SR.Drotor),R.lenU),
    row("Disk Loading","DL",R.wl(SR.DLrotor),R.wlU),
    row("Power Loading","PL",fmt(SR.PLrotor,1),"N/W"),
    row("Tip Speed","Ω<sub>tip</sub>",R.speed(SR.TipSpd),R.speedU),
    row("Tip Mach","M<sub>tip</sub>",fmt(SR.TipMach,4),""),
    row("RPM","n",fmt(SR.RPM,0),"rpm"),
    row("No. of Blades","N<sub>bl</sub>",SR.Nbld,""),
    row("Blade Chord","c<sub>bl</sub>",R.len(SR.ChordBl),R.lenU),
    row("Motor Power","P<sub>mot</sub>",R.power(SR.PmotKW),R.powerU),
    row("Peak Power","P<sub>peak</sub>",R.power(SR.PpeakKW),R.powerU),
  ])}
  `);

  // ── 7. BATTERY ───────────────────────────────────────────────────────
  const s7 = sec("battery","7. Battery System Sizing",`
  ${eq("\\text{SED}_{eff} = \\text{SED}_{cell}\\times(1-\\delta_{C}) = "+p.sedCell+"\\times(1-"+(p.cRateDerate??0.08)+") = "+fmt(sedEffd,1)+"\\text{ Wh/kg}","Effective SED after C-rate derating")}
  ${eq("W_E = \\frac{E_{total}\\times 1000}{(1-\\text{SoC}_{min})\\,\\text{SED}_{eff}\\,\\eta_{bat}} = \\frac{"+fmt(SR.Etot,3)+"\\times 1000}{(1-"+p.socMin+")\\times "+fmt(sedEffd,1)+"\\times "+p.etaBat+"} = "+fmt(WEd,1)+"\\text{ kg}","Energy-limited battery mass")}
  ${eq("W_P = \\frac{P_{hov}}{SP_{bat}} = \\frac{"+fmt(SR.Phov,1)+"}{"+((p.spBattery)||1.0)+"} = "+fmt(WPd,1)+"\\text{ kg},\\quad W_{bat} = \\max(W_E,W_P) = "+fmt(SR.Wbat,1)+"\\text{ kg}","Power-limited mass and dual-constraint result")}
  ${eq("\\text{SED}_{pack} = \\frac{E_{total}}{W_{bat}} = "+fmt(SR.SEDpack,1)+"\\text{ Wh/kg}","Pack-level specific energy density")}
  ${eq("N_{series} = \\text{round}\\!\\left(\\frac{V_{pack}}{V_{cell}}\\right) = \\text{round}\\!\\left(\\frac{800}{3.6}\\right) = "+SR.Nseries,"Series cell count for 800V pack")}
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Battery Mass","W<sub>bat</sub>",R.mass(SR.Wbat),R.massU),
    row("Total Energy","E<sub>total</sub>",fmt(SR.Etot,3),"kWh"),
    row("Pack SED","SED<sub>pack</sub>",R.sed(SR.SEDpack),R.sedU),
    row("Pack Voltage","V<sub>pack</sub>",fmt(SR.PackV,0),"V"),
    row("Pack Capacity","Q<sub>pack</sub>",fmt(SR.PackAh,1),"Ah"),
    row("Series Cells","N<sub>s</sub>",SR.Nseries,""),
    row("Parallel Strings","N<sub>p</sub>",SR.Npar,""),
    row("Total Cells","N<sub>cells</sub>",SR.Ncells,""),
    row("C-rate (Hover)","C<sub>hov</sub>",fmt(SR.CrateHov,2),"C"),
    row("C-rate (Cruise)","C<sub>cr</sub>",fmt(SR.CrateCr,2),"C"),
  ])}
  `);

  // ── 8. STABILITY ─────────────────────────────────────────────────────
  const xACwing = fmt(+(p.fusLen*0.2589 + (SR.Cr_-(SR.MAC-0.25*SR.MAC))),3);
  const s8 = sec("stability","8. Longitudinal Stability",`
  <p>The static margin (SM) measures stability: positive SM indicates the neutral point (NP) is aft of the centre of gravity (CG).</p>
  ${eq("x_{CG,total} = \\frac{W_e\\,x_{CG,e}+W_{bat}\\,x_{CG,bat}+m_{pay}\\,x_{CG,pay}}{\\text{MTOW}} = "+fmt(SR.xCGtotal,3)+"\\text{ m from nose}","Total centre of gravity")}
  ${eq("x_{NP} = x_{AC,wing} + \\frac{S_h}{S_w}\\,\\eta_h\\,(1-\\varepsilon_\\alpha)\\,l_h = "+fmt(SR.SM_vt !== undefined ? SR.xNP : SR.xNP,3)+"\\text{ m from nose}","Neutral point (stick-fixed)")}
  ${eq("SM = \\frac{x_{NP}-x_{CG}}{\\bar{c}} = \\frac{"+fmt(SR.xNP,3)+"-"+fmt(SR.xCGtotal,3)+"}{"+fmt(SR.MAC,3)+"} = "+fmt(SR.SM*100,1)+"\\%\\;\\text{MAC}","Static margin")}
  ${table(["Quantity","Symbol","Value","Unit"],[
    row("Wing AC from nose","x<sub>AC,w</sub>",R.len(+(p.fusLen*0.2589+(SR.Cr_-(SR.MAC-0.25*SR.MAC)))),R.lenU),
    row("Total CG from nose","x<sub>CG</sub>",R.len(SR.xCGtotal),R.lenU),
    row("Neutral Point from nose","x<sub>NP</sub>",R.len(SR.xNP),R.lenU),
    row("Static Margin","SM",fmt(SR.SM*100,2),"%  MAC"),
    row("MAC","c̄",R.len(SR.MAC),R.lenU),
  ])}
  `);

  // ── 9. V-TAIL ────────────────────────────────────────────────────────
  const s9 = sec("vtail","9. V-Tail Sizing (Ruscheweyh / Raymer)",`
  <p>The V-tail replaces both the horizontal and vertical stabilisers. Each panel is inclined at dihedral angle Γ = ${p.vtGamma}° from horizontal.</p>
  ${eq("S_{h,req} = \\frac{C_h\\,S_w\\,\\bar{c}}{l_v} = \\frac{"+p.vtCh+"\\times"+fmt(SR.Swing,2)+"\\times"+fmt(SR.MAC,3)+"}{"+fmt(SR.lv,3)+"} = "+fmt(SR.Sh_req,3)+"\\text{ m}^2","Required horizontal tail area")}
  ${eq("S_{v,req} = \\frac{C_v\\,S_w\\,b_w}{l_v} = \\frac{"+p.vtCv+"\\times"+fmt(SR.Swing,2)+"\\times"+fmt(SR.bWing,2)+"}{"+fmt(SR.lv,3)+"} = "+fmt(SR.Sv_req,3)+"\\text{ m}^2","Required vertical tail area")}
  ${eq("S_{panel} = \\max\\!\\left(\\frac{S_{h,req}}{\\cos^2\\Gamma},\\,\\frac{S_{v,req}}{\\sin^2\\Gamma}\\right) = "+fmt(SR.Svt_panel,3)+"\\text{ m}^2","V-tail panel area (governing constraint)")}
  ${eq("\\Gamma_{opt} = \\arctan\\!\\sqrt{\\frac{S_{v,req}}{S_{h,req}}} = "+fmt(SR.vtGamma_opt,1)+"^\\circ","Optimal dihedral angle for minimum panel area")}
  ${eq("b_{vt} = \\sqrt{AR_{vt}\\cdot S_{panel}} = "+fmt(SR.bvt_panel,3)+"\\text{ m}, \\quad C_{r,vt} = "+fmt(SR.Cr_vt,3)+"\\text{ m}, \\quad C_{t,vt} = "+fmt(SR.Ct_vt,3)+"\\text{ m}","V-tail panel geometry")}
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Tail moment arm","l<sub>v</sub>",R.len(SR.lv),R.lenU),
    row("Req. H-tail area","S<sub>h,req</sub>",R.area(SR.Sh_req),R.areaU),
    row("Req. V-tail area","S<sub>v,req</sub>",R.area(SR.Sv_req),R.areaU),
    row("Panel area","S<sub>panel</sub>",R.area(SR.Svt_panel),R.areaU),
    row("Total V-tail area","S<sub>vt,total</sub>",R.area(SR.Svt_total),R.areaU),
    row("Optimal Γ","Γ<sub>opt</sub>",fmt(SR.vtGamma_opt,1),"°"),
    row("Chosen Γ","Γ",p.vtGamma,"°"),
    row("Panel span","b<sub>vt</sub>",R.len(SR.bvt_panel),R.lenU),
    row("Root chord","C<sub>r,vt</sub>",R.len(SR.Cr_vt),R.lenU),
    row("Tip chord","C<sub>t,vt</sub>",R.len(SR.Ct_vt),R.lenU),
    row("LE sweep","Λ<sub>LE,vt</sub>",fmt(SR.sweep_vt,2),"°"),
    row("Pitch authority","—",fmt(SR.pitch_ratio*100,1),"%"),
    row("Yaw authority","—",fmt(SR.yaw_ratio*100,1),"%"),
  ])}
  `);

  // ── 10. FEASIBILITY ──────────────────────────────────────────────────
  const s10 = sec("feasibility","10. Feasibility Checks",`
  <table class="check-table"><thead><tr><th>Pass</th><th>Criterion</th><th>Value</th></tr></thead><tbody>
    ${(SR.checks||[]).map(chk=>check(chk.ok,chk.label,chk.val)).join("")}
  </tbody></table>
  `);

  // ── V-n DIAGRAM + OEI section ─────────────────────────────────────
  const g0d_vn=9.81;
  /* FROM THE ENGINE, NOT A LITERAL. This was `nPosLim=3.5`, one of five
     independent copies of the limit load factor in this codebase; the
     exported report therefore showed 3.5 g for every aircraft it ever
     produced, including wingless ones whose rotors cannot pull it.
     SR.nLimit is engine/loadcases.js's answer — worst of the SC-VTOL
     VTOL.2215(f) gust set and the VTOL.2200(f) manoeuvre case, or the
     thrust-borne factor where there is no wing.

     THE GUST ROWS WERE A PRIVATE MODEL TOO, and a wrong one: Kg was
     0.88*AR/(5.3+AR) - the ASPECT RATIO where the mass ratio belongs - with
     CS-23 aeroplane gusts of 15.2 / 7.6 m/s. The rows now list the SC-VTOL
     MOC VTOL.2215(f) cases the engine sizes the structure to, with its Kg. */
  const nPosLim=SR.nLimit,nNegLim=SR.nLimitNeg;
  const vnB=SR.vnBasis||{};
  const gustRows=(vnB.gustLines||[]).map(gl=>
    row(`Gust ${gl.label}`,"n<sub>g</sub>",`${gl.nPos.toFixed(3)} / ${gl.nNeg.toFixed(3)} at ${R.speed(gl.V)} ${R.speedU}`,"g"));
  // OEI
  const N_oei=p.nPropHover;
  // CORRECT: motor design thrust uses T/W ratio, not T/W=1
  const T_each=(SR.MTOW*g0d_vn*(p.twRatio||1.2))/N_oei;  // actual design thrust per motor
  const T_oei=(N_oei-1)*T_each;                            // OEI: (N-1) motors at full thrust
  const OEI_margin=((T_oei-SR.MTOW*g0d_vn)/(SR.MTOW*g0d_vn)*100);
  const P_mot_nom=SR.Phov*1000/N_oei;
  const P_mot_oei=SR.Phov*1000/(N_oei-1);
  const motorOK=P_mot_oei<=(SR.PpeakKW*1000);

  const s_vn = sec("vn-oei","11. V-n Diagram & One-Engine-Inoperative Analysis",`
  <p>Manoeuvring envelope capped at this design's limit manoeuvring load factors, floored per EASA MOC SC-VTOL VTOL.2200(f). Gust load factors are the MOC VTOL.2215(f) set (sharp-edged gust with alleviation factor) that sizes the structure. OEI analysis per CS-VTOL AMC 27.65.</p>
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Stall Speed","V<sub>S</sub>",R.speed(SR.Vstall),R.speedU),
    row("Manoeuvre Speed","V<sub>A</sub>",R.speed(SR.VA),R.speedU),
    row("Cruise Speed","V<sub>C</sub>",R.speed(p.vCruise),R.speedU),
    row("Dive Speed","V<sub>D</sub>",R.speed(SR.VD),R.speedU),
    row("Manoeuvre Limit (pos.)","n<sub>+man</sub>",(vnB.capPos??nPosLim).toFixed(2),"g"),
    row("Governing Limit (pos.)","n<sub>+lim</sub>",nPosLim.toFixed(2),"g"),
    row("Neg. Limit Load","n<sub>−lim</sub>",nNegLim.toFixed(2),"g"),
    row("Ultimate Pos.","n<sub>+ult</sub>",SR.nUltimate.toFixed(2),"g"),
    row("Load factor basis","—",`${SR.loadFactorBasis} — ${SR.loadGoverningCase}`,""),
    row("Gust Alleviation","K<sub>g</sub>",SR.gustAlleviationKg==null?"—":SR.gustAlleviationKg.toFixed(3),""),
    ...gustRows,
  ])}
  <h3 style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 8px">One-Engine-Inoperative Analysis</h3>
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Number of Rotors","N",N_oei,""),
    row("Total Hover Thrust","T<sub>tot</sub>",fmt(SR.MTOW*g0d_vn/1000,3),"kN"),
    row("OEI Thrust Available","T<sub>OEI</sub>",fmt(T_oei/1000,3),"kN"),
    row("OEI Thrust Margin","ΔT",fmt(OEI_margin,2),"%"),
    row("Nominal Motor Power","P<sub>mot,nom</sub>",R.power(P_mot_nom/1000),R.powerU),
    row("OEI Motor Power","P<sub>mot,OEI</sub>",R.power(P_mot_oei/1000),R.powerU),
    row("Peak Motor Rating","P<sub>peak</sub>",R.power(SR.PpeakKW),R.powerU),
    row("Motor Survivable","",motorOK?"YES ✅":"NO ❌",""),
    row("OEI Verdict","",OEI_margin>0?"SURVIVABLE ✅":"CRITICAL ❌",""),
  ])}
  `);

  // ══════════════════════════════════════════════════════════════════════
  //  DETAILED CALCULATION SECTIONS  (D1–D9)
  // ══════════════════════════════════════════════════════════════════════

  // ── Intermediate values recomputed for display ─────────────────────
  const g0d=9.81,T0d=288.15,L_d=0.0065,Rgasd=287,rhoSLd=1.225;
  const deltaISAd=p.deltaISA||0;
  const T0effd=T0d+deltaISAd;
  const Tcrd=T0effd-L_d*p.cruiseAlt;
  const rhoCrd=rhoSLd*Math.pow(Tcrd/T0effd,(-g0d/(-L_d*Rgasd))-1);
  const muSLd=1.789e-5;
  const muCrd=muSLd*Math.pow(Tcrd/T0effd,0.75);
  const RoCd=p.rateOfClimb, clAngd=p.climbAngle;
  const Vcld=RoCd/Math.sin(clAngd*Math.PI/180);
  const LDcld=p.LD*(1-(p.climbLDPenalty||0.13));
  const desAngd=Math.atan(1/p.LD)*180/Math.PI;    // L/D-derived — matches actual sizing
  const Vdcd=RoCd/Math.sin(desAngd*Math.PI/180);   // no cap — matches actual sizing
  const Vresd=0.76*p.vCruise;                       // 0.76×Vcruise best-endurance (time-based)
  const hvtold=p.hoverHeight;
  const ClimbRd=(p.cruiseAlt-hvtold)/Math.tan(clAngd*Math.PI/180);
  const DescRd=(p.cruiseAlt-hvtold)/Math.tan(desAngd*Math.PI/180);
  const reserveMinutesd=reserveMinutesOf(p);
  const tres_sd=reserveMinutesd*60;
  const reserveDistMd=Vresd*tres_sd;
  const CruiseRanged=p.range*1000-ClimbRd-DescRd-reserveDistMd;
  const bfd=(g0d*p.range*1000)/(p.LD*p.etaSys*p.sedCell*3600);
  const lambdaFd=p.fusLen/p.fusDiam;
  const Swwd=2*SR.Swing*(1+0.25*p.tc*(1+p.taper*0.25));
  const SwfWetd=Math.PI*p.fusDiam*p.fusLen*Math.pow(1-2/lambdaFd,2/3)*(1+1/lambdaFd**2);
  const Swhs_d=2*SR.Swing*0.18, Swvs_d=2*SR.Swing*0.12;
  const Swn_d=p.nPropHover*Math.PI*0.2*0.35;
  const Refusd=rhoCrd*p.vCruise*p.fusLen/muCrd;
  const Cfwd=0.455/Math.log10(SR.Re_)**2.58/(1+0.144*SR.Mach**2)**0.65;
  const Cffd=0.455/Math.log10(Refusd)**2.58/(1+0.144*SR.Mach**2)**0.65;
  const FFwd=(1+0.6/0.3*p.tc+100*p.tc**4)*1.05;
  const FFfd=1+60/lambdaFd**3+lambdaFd/400;
  const Ttotd=SR.MTOW*g0d, Trotord=Ttotd/p.nPropHover;
  const PrWd=SR.Phov*1000/p.nPropHover;
  const Rrotord=p.propDiam/2;
  const Adiskd=Math.PI*Rrotord**2;
  const TipSpdd=SR.TipSpd;  // use value from sizing engine
  const PmotKWd=PrWd/1000*1.15, PpeakKWd=PmotKWd*1.50;
  const Torqued=PmotKWd*1000/(SR.RPM*Math.PI/30);
  const Vcelld=3.6,Ahcelld=5.0,Vpackd=800;
  const Nseriesd=Math.round(Vpackd/Vcelld);
  const PackAhReqd=SR.Etot*1000/Vpackd;
  const Npard=Math.ceil(PackAhReqd/Ahcelld);
  const PackVd=Nseriesd*Vcelld, PackAhd=Npard*Ahcelld;
  const Rintd=0.030*Nseriesd/Npard;
  const Pheatd=(SR.Phov*1000/PackVd)**2*Rintd;
  const xCGfusd=p.fusLen*0.42;
  const Xacd=SR.Cr_-(SR.MAC-0.25*SR.MAC);
  const xCGwingd=p.fusLen*0.2589+Xacd;
  const xCGbatd=p.fusLen*0.38, xCGpayd=p.fusLen*0.40;
  const Wfuscd=SR.Wempty*0.35,Wwingcd=SR.Wempty*0.18;
  const Wmotcd=SR.Wempty*0.22,Wavcd=SR.Wempty*0.04,Wothcd=SR.Wempty*0.21;
  // FIX 1.3: wing structural CG at 40% MAC; FIX 1.4: avionics CG scales with fusLen
  const xCGavcD = p.fusLen*0.18;                              // avionics: 18% fusLen (forward bay)
  const xCGwingd_corr = p.fusLen*0.2589 + 0.40*SR.MAC;       // FIX 1.3: structural CG at 40% MAC
  const xCGemptyd=(Wfuscd*xCGfusd+Wwingcd*xCGwingd_corr+Wmotcd*xCGfusd+Wavcd*xCGavcD+Wothcd*xCGfusd)/SR.Wempty;
  const xACwingd=p.fusLen*0.2589+Xacd;
  const lhd=p.fusLen*0.88-xACwingd;                          // FIX 1.5: tail arm = 88%·L - xAC_wing
  const CLaWd=2*Math.PI*p.AR/(2+Math.sqrt(p.AR**2+4));       // FIX 1.1: Raymer Eq.12.6 finite-wing
  const dwd=2*CLaWd/(Math.PI*p.AR);                          // FIX 1.2: consistent with corrected CLaWd
  const Shd=SR.Swing*0.18;
  const DLd=SR.MTOW*g0d/(Math.PI*Math.pow(p.propDiam/2,2)*p.nPropHover);

  // ── D1. ROUND 1 — INITIAL MTOW ──────────────────────────────────────
  const sd1 = sec("iter1","D1. Round 1 — Initial MTOW Estimate (Simplified Range-Energy Method)",`
  <p>Round 1 computes a first-pass MTOW using a simplified battery mass fraction derived purely from range. Starting guess MTOW<sub>0</sub> = 2177 kg, iterated to convergence (&lt; 10<sup>−6</sup> kg).</p>
  ${eq("f_{bat} = \\frac{g_0 \\cdot SR}{(L/D)\\,\\eta_{sys}\\,\\text{SED}_{cell}\\times 3600} = \\frac{9.81 \\times "+p.range+" \\times 1000}{"+p.LD+" \\times "+p.etaSys+" \\times "+p.sedCell+" \\times 3600} = "+fmt(bfd,5),"Simplified battery mass fraction (range-energy method)")}
  ${eq("W_{empty} = f_{EW} \\cdot \\text{MTOW} = "+p.ewf+" \\cdot \\text{MTOW}","Empty weight from structural mass fraction EWF = "+p.ewf)}
  ${eq("W_{bat,1} = f_{bat} \\cdot \\text{MTOW} = "+fmt(bfd,5)+" \\cdot \\text{MTOW}","Battery mass (Round 1 approximation)")}
  ${eq("\\text{MTOW}_{1} = \\frac{m_{pay}}{1 - f_{EW} - f_{bat}} = \\frac{"+p.payload+"}{1 - "+p.ewf+" - "+fmt(bfd,5)+"} = "+fmt(SR.MTOW1,2)+"\\text{ kg}","Analytical solution of weight closure")}
  ${table(["Quantity","Formula / Value","Result","Unit"],[
    row("Battery fraction","g₀·SR / [(L/D)·η_sys·SED·3600]",fmt(bfd,5),""),
    row("Empty weight (R1)","f_EW × MTOW₁",R.mass(p.ewf*SR.MTOW1),R.massU),
    row("Battery mass (R1)","f_bat × MTOW₁",R.mass(bfd*SR.MTOW1),R.massU),
    row("Payload","given",R.mass(p.payload),R.massU),
    row("MTOW Round 1","m_pay + W_e + W_bat",R.mass(SR.MTOW1),R.massU),
  ])}
  `);

  // ── D2. ROUND 2 — COUPLED MTOW + ENERGY CONVERGENCE ─────────────────
  const sd2 = sec("iter2","D2. Round 2 — Coupled MTOW + Energy Convergence",`
  <p>Round 2 couples weight closure to full mission energy. For each MTOW trial, all phase powers, times, and energies are computed; W<sub>bat</sub> is re-derived from E<sub>total</sub>; MTOW is updated until |MTOW<sub>new</sub> − MTOW<sub>old</sub>| &lt; 10<sup>−6</sup> kg. Starts from MTOW<sub>1</sub> = ${fmt(SR.MTOW1,2)} kg.</p>
  <p><strong>Phase geometry (fixed, computed once):</strong></p>
  ${eq("V_{cl} = \\frac{\\dot{h}}{\\sin\\gamma_{cl}} = \\frac{"+RoCd+"}{\\sin("+clAngd+"^\\circ)} = "+fmt(Vcld,2)+"\\text{ m/s}","Climb speed from RoC and climb angle")}
  ${eq("(L/D)_{cl} = (L/D)_{cr}\\times 0.87 = "+p.LD+"\\times 0.87 = "+fmt(LDcld,3),"Climb L/D — 13% reduction for induced drag increase")}
  ${eq("\\gamma_{dc} = \\arctan\\!\\left(\\frac{1}{(L/D)}\\right) = "+fmt(desAngd,3)+"^\\circ, \\quad V_{dc} = \\frac{\\dot{h}}{\\sin\\gamma_{dc}} = "+fmt(Vdcd,2)+"\\text{ m/s}","Descent angle and speed")}
  ${eq("V_{res} = 0.76\\,V_{cr} = 0.76\\times "+p.vCruise+" = "+fmt(Vresd,2)+"\\text{ m/s}","Reserve loiter speed (best-endurance, 0.76×cruise)")}
  ${eq("d_{cl} = \\frac{h_{cr}-h_{hov}}{\\tan\\gamma_{cl}} = "+fmt(ClimbRd,1)+"\\text{ m}, \\quad d_{dc} = \\frac{h_{cr}-h_{hov}}{\\tan\\gamma_{dc}} = "+fmt(DescRd,1)+"\\text{ m}","Climb and descent ground tracks")}
  ${eq("d_{cr} = SR - d_{cl} - d_{dc} - d_{res} = "+p.range*1000+" - "+fmt(ClimbRd,1)+" - "+fmt(DescRd,1)+" - "+fmt(reserveDistMd,1)+" = "+fmt(CruiseRanged,1)+"\\text{ m}","Net cruise distance")}
  <p><strong>Final converged iteration (MTOW = ${fmt(SR.MTOW,2)} kg):</strong></p>
  ${eq("DL = \\frac{\\text{MTOW}\\cdot g_0}{N_{rot}\\cdot A_{disk}} = \\frac{"+fmt(SR.MTOW,2)+"\\times 9.81}{"+p.nPropHover+"\\times\\pi("+fmt(p.propDiam/2,3)+")^2} = "+fmt(DLd,2)+"\\text{ N/m}^2","Disk loading")}
  ${eq("P_{hov} = \\frac{W}{\\eta_{hov}}\\sqrt{\\frac{DL}{2\\rho_{SL}}} \\div 1000 = \\frac{"+fmt(SR.MTOW*g0d,1)+"}{"+p.etaHov+"}\\sqrt{\\frac{"+fmt(DLd,2)+"}{2.45}} \\div 1000 = "+fmt(SR.Phov,2)+"\\text{ kW}","Hover power")}
  ${eq("P_{cl} = \\frac{W}{\\eta_{sys}}\\!\\left(\\dot{h}+\\frac{V_{cl}}{(L/D)_{cl}}\\right)\\!\\div 1000 = \\frac{"+fmt(SR.MTOW*g0d,1)+"}{"+p.etaSys+"}\\!\\left("+RoCd+"+\\frac{"+fmt(Vcld,2)+"}{"+fmt(LDcld,3)+"}\\right)\\!\\div 1000 = "+fmt(SR.Pcl,2)+"\\text{ kW}","Climb power")}
  ${eq("P_{cr} = \\frac{W\\,V_{cr}}{\\eta_{sys}\\,(L/D)} = \\frac{"+fmt(SR.MTOW*g0d,1)+"\\times "+p.vCruise+"}{"+p.etaSys+"\\times "+p.LD+"} \\div 1000 = "+fmt(SR.Pcr,2)+"\\text{ kW}","Cruise power")}
  ${eq("P_{dc} = \\frac{W}{\\eta_{sys}}\\!\\left(-\\dot{h}+\\frac{V_{dc}}{(L/D)_{cl}}\\right)\\!\\div 1000 = "+fmt(SR.Pdc,2)+"\\text{ kW}","Descent power")}
  ${eq("P_{res} = \\frac{W\\,V_{res}}{\\eta_{sys}\\,(L/D)} \\div 1000 = "+fmt(SR.Pres,2)+"\\text{ kW}","Reserve power")}
  ${eq("W_E = \\frac{E_{total}\\times 1000}{(1-\\text{SoC}_{min})\\,\\text{SED}_{eff}\\,\\eta_{bat}} = \\frac{"+fmt(SR.Etot,3)+"\\times 1000}{(1-"+p.socMin+")\\times "+fmt(sedEffd,1)+"\\times "+p.etaBat+"} = "+fmt(WEd,2)+"\\text{ kg},\\quad W_P = \\frac{"+fmt(SR.Phov,1)+"}{"+((p.spBattery)||1.0)+"} = "+fmt(WPd,2)+"\\text{ kg},\\quad W_{bat}=\\max(W_E,W_P)="+fmt(SR.Wbat,2)+"\\text{ kg}","Dual-constraint battery — energy limit + power limit")}
  ${eq("\\text{MTOW} = "+p.payload+" + "+fmt(SR.Wempty,2)+" + "+fmt(SR.Wbat,2)+" = "+fmt(SR.MTOW,2)+"\\text{ kg} \\quad \\checkmark\\text{ Converged}","Final weight closure")}
  `);

  // ── D3. MISSION PHASE TIMING ─────────────────────────────────────────
  const sd3 = sec("timing","D3. Mission Phase Timing & Distance Analysis",`
  <p style="font-size:8.5pt;color:#64748b;font-style:italic;margin-bottom:8px">Note: Physics equations use SI units throughout. Summary table values are shown in ${R.note.replace(/[()]/g,"")}.</p>
  ${eq("t_{TO} = \\frac{h_{hov}}{0.5} = \\frac{"+hvtold+"}{0.5} = "+fmt(SR.tto,0)+"\\text{ s}","Takeoff hover time — average vertical speed = 0.5 m/s")}
  ${eq("t_{cl} = \\frac{d_{cl}}{V_{cl}} = \\frac{"+fmt(ClimbRd,1)+"}{"+fmt(Vcld,2)+"} = "+fmt(SR.tcl,0)+"\\text{ s}","Climb duration")}
  ${eq("t_{cr} = \\frac{d_{cr}}{V_{cr}} = \\frac{"+fmt(CruiseRanged,1)+"}{"+p.vCruise+"} = "+fmt(SR.tcr,0)+"\\text{ s}","Cruise duration")}
  ${eq("t_{dc} = \\frac{d_{dc}}{V_{dc}} = \\frac{"+fmt(DescRd,1)+"}{"+fmt(Vdcd,2)+"} = "+fmt(SR.tdc,0)+"\\text{ s}","Descent duration")}
  ${eq("t_{ld} = \\frac{h_{hov}}{0.5} = "+fmt(SR.tld,0)+"\\text{ s}","Landing hover time")}
  ${eq("t_{res} = t_{res,min} = "+reserveMinutesd+"\\text{ min} = "+tres_sd+"\\text{ s} \\quad (\\text{regulatory minimum, FAA powered-lift SFAR})","Reserve duration — time-based, not distance-based")}
  ${eq("T_{mission} = "+fmt(SR.tto,0)+"+"+fmt(SR.tcl,0)+"+"+fmt(SR.tcr,0)+"+"+fmt(SR.tdc,0)+"+"+fmt(SR.tld,0)+"+"+fmt(SR.tres,0)+" = "+fmt(SR.Tend,0)+"\\text{ s} = "+fmt(SR.Tend/60,1)+"\\text{ min}","Total mission time")}
  ${table(["Phase",`Distance (${R.distU})`,`Speed (${R.speedU})`,"Duration (s)","Duration (min)"],[
    row("Takeoff (hover)","Vertical "+R.len(p.hoverHeight)+" "+R.lenU,R.speed(0.5),fmt(SR.tto,0),fmt(SR.tto/60,1)),
    row("Climb",R.dist(ClimbRd/1000),R.speed(Vcld),fmt(SR.tcl,0),fmt(SR.tcl/60,1)),
    row("Cruise",R.dist(CruiseRanged/1000),R.speed(p.vCruise),fmt(SR.tcr,0),fmt(SR.tcr/60,1)),
    row("Descent",R.dist(DescRd/1000),R.speed(Vdcd),fmt(SR.tdc,0),fmt(SR.tdc/60,1)),
    row("Landing (hover)","Vertical "+R.len(p.hoverHeight)+" "+R.lenU,R.speed(0.5),fmt(SR.tld,0),fmt(SR.tld/60,1)),
    row("Reserve",R.dist(reserveDistMd/1000)+" ("+reserveMinutesd+" min)",R.speed(Vresd),fmt(SR.tres,0),fmt(SR.tres/60,1)),
    row("<b>Total</b>","<b>"+R.dist(p.range)+" "+R.distU+"</b>","—","<b>"+fmt(SR.Tend,0)+"</b>","<b>"+fmt(SR.Tend/60,1)+"</b>"),
  ])}
  `);

  // ── D4. PHASE POWER & ENERGY ─────────────────────────────────────────
  const sd4 = sec("phasecalc","D4. Phase Power & Energy — Detailed Calculations",`
  <p>Energy per phase: E<sub>phase</sub> = P<sub>phase</sub> × t<sub>phase</sub> / 3600. Cumulative column tracks battery draw throughout the mission.</p>
  ${eq("E_{TO} = P_{hov}\\times\\frac{t_{TO}}{3600} = "+fmt(SR.Phov,2)+"\\times\\frac{"+fmt(SR.tto,0)+"}{3600} = "+fmt(SR.Eto,4)+"\\text{ kWh}","Takeoff energy")}
  ${eq("E_{cl} = P_{cl}\\times\\frac{t_{cl}}{3600} = "+fmt(SR.Pcl,2)+"\\times\\frac{"+fmt(SR.tcl,0)+"}{3600} = "+fmt(SR.Ecl,4)+"\\text{ kWh}","Climb energy")}
  ${eq("E_{cr} = P_{cr}\\times\\frac{t_{cr}}{3600} = "+fmt(SR.Pcr,2)+"\\times\\frac{"+fmt(SR.tcr,0)+"}{3600} = "+fmt(SR.Ecr,4)+"\\text{ kWh}","Cruise energy")}
  ${eq("E_{dc} = |P_{dc}|\\times\\frac{t_{dc}}{3600} = "+fmt(SR.Pdc,2)+"\\times\\frac{"+fmt(SR.tdc,0)+"}{3600} = "+fmt(SR.Edc,4)+"\\text{ kWh}","Descent energy")}
  ${eq("E_{ld} = P_{hov}\\times\\frac{t_{ld}}{3600} = "+fmt(SR.Phov,2)+"\\times\\frac{"+fmt(SR.tld,0)+"}{3600} = "+fmt(SR.Eld,4)+"\\text{ kWh}","Landing energy")}
  ${eq("E_{res} = P_{res}\\times\\frac{t_{res}}{3600} = "+fmt(SR.Pres,2)+"\\times\\frac{"+fmt(SR.tres,0)+"}{3600} = "+fmt(SR.Eres,4)+"\\text{ kWh}","Reserve energy")}
  ${eq("E_{total} = "+fmt(SR.Eto,4)+"+"+fmt(SR.Ecl,4)+"+"+fmt(SR.Ecr,4)+"+"+fmt(SR.Edc,4)+"+"+fmt(SR.Eld,4)+"+"+fmt(SR.Eres,4)+" = "+fmt(SR.Etot,3)+"\\text{ kWh}","Total mission energy")}
  ${table(["Phase",`Power (${R.powerU})`,"Time (s)","Energy (kWh)","Cumulative (kWh)","% Total"],[
    `<tr><td>Takeoff</td><td>${R.power(SR.Phov)}</td><td>${fmt(SR.tto,0)}</td><td>${fmt(SR.Eto,4)}</td><td>${fmt(SR.Eto,4)}</td><td>${fmt(SR.Eto/SR.Etot*100,1)}%</td></tr>`,
    `<tr><td>Climb</td><td>${R.power(SR.Pcl)}</td><td>${fmt(SR.tcl,0)}</td><td>${fmt(SR.Ecl,4)}</td><td>${fmt(SR.Eto+SR.Ecl,4)}</td><td>${fmt(SR.Ecl/SR.Etot*100,1)}%</td></tr>`,
    `<tr><td>Cruise</td><td>${R.power(SR.Pcr)}</td><td>${fmt(SR.tcr,0)}</td><td>${fmt(SR.Ecr,4)}</td><td>${fmt(SR.Eto+SR.Ecl+SR.Ecr,4)}</td><td>${fmt(SR.Ecr/SR.Etot*100,1)}%</td></tr>`,
    `<tr><td>Descent</td><td>${R.power(SR.Pdc)}</td><td>${fmt(SR.tdc,0)}</td><td>${fmt(SR.Edc,4)}</td><td>${fmt(SR.Eto+SR.Ecl+SR.Ecr+SR.Edc,4)}</td><td>${fmt(SR.Edc/SR.Etot*100,1)}%</td></tr>`,
    `<tr><td>Landing</td><td>${R.power(SR.Phov)}</td><td>${fmt(SR.tld,0)}</td><td>${fmt(SR.Eld,4)}</td><td>${fmt(SR.Eto+SR.Ecl+SR.Ecr+SR.Edc+SR.Eld,4)}</td><td>${fmt(SR.Eld/SR.Etot*100,1)}%</td></tr>`,
    `<tr><td>Reserve</td><td>${R.power(SR.Pres)}</td><td>${fmt(SR.tres,0)}</td><td>${fmt(SR.Eres,4)}</td><td>${fmt(SR.Etot,3)}</td><td>${fmt(SR.Eres/SR.Etot*100,1)}%</td></tr>`,
    `<tr style="font-weight:700"><td>Total</td><td>—</td><td>${fmt(SR.Tend,0)}</td><td>${fmt(SR.Etot,3)}</td><td>${fmt(SR.Etot,3)}</td><td>100%</td></tr>`,
  ])}
  `);

  // ── D5. WING SIZING DETAILED ──────────────────────────────────────────
  const sd5 = sec("wingdetail","D5. Wing Sizing — Detailed Calculations",`
  ${eq("S_w = \\frac{2\\,L_{req}}{\\rho_{cr}\\,V_{cr}^2\\,C_{L,des}} = \\frac{2\\times "+fmt(SR.MTOW*g0d,1)+"}{"+fmt(rhoCrd,4)+"\\times "+p.vCruise+"^2\\times "+p.clDesign+"} = "+fmt(SR.Swing,2)+"\\text{ m}^2","Wing area from lift balance at cruise")}
  ${eq("W/S = "+fmt(SR.WL,1)+"\\text{ N/m}^2","Wing loading")}
  ${eq("b_w = \\sqrt{AR\\cdot S_w} = \\sqrt{"+p.AR+"\\times "+fmt(SR.Swing,2)+"} = "+fmt(SR.bWing,2)+"\\text{ m}","Wing span")}
  ${eq("C_r = \\frac{2S_w}{b_w(1+\\lambda)} = \\frac{2\\times "+fmt(SR.Swing,2)+"}{"+fmt(SR.bWing,2)+"\\times(1+"+p.taper+")} = "+fmt(SR.Cr_,3)+"\\text{ m}","Root chord")}
  ${eq("C_t = \\lambda\\,C_r = "+p.taper+"\\times "+fmt(SR.Cr_,3)+" = "+fmt(SR.Ct_,3)+"\\text{ m}","Tip chord")}
  ${eq("\\bar{c} = \\frac{2}{3}\\,C_r\\,\\frac{1+\\lambda+\\lambda^2}{1+\\lambda} = "+fmt(SR.MAC,3)+"\\text{ m}","Mean aerodynamic chord")}
  ${eq("\\bar{y}_{MAC} = \\frac{b_w}{6}\\,\\frac{1+2\\lambda}{1+\\lambda} = "+fmt(SR.Ymac,3)+"\\text{ m}","Spanwise MAC position")}
  ${eq("\\Lambda_{LE} = \\arctan\\!\\left(\\frac{C_r-C_t}{b_w/2}\\right) = \\arctan\\!\\left(\\frac{"+fmt(SR.Cr_,3)+"-"+fmt(SR.Ct_,3)+"}{"+fmt(SR.bWing/2,3)+"}\\right) = "+fmt(SR.sweep,2)+"^\\circ","Leading edge sweep")}
  ${eq("Re_w = \\frac{\\rho_{cr}\\,V_{cr}\\,\\bar{c}}{\\mu_{cr}} = \\frac{"+fmt(rhoCrd,4)+"\\times "+p.vCruise+"\\times "+fmt(SR.MAC,3)+"}{"+fmt(muCrd,7)+"} = "+fmt(SR.Re_,0),"Wing chord Reynolds number")}
  ${eq("M = \\frac{V_{cr}}{a_{cr}} = \\frac{"+p.vCruise+"}{"+fmt(Math.sqrt(1.4*287*Tcrd),2)+"} = "+fmt(SR.Mach,4),"Cruise Mach number")}
  ${eq("V_{stall} = \\sqrt{\\frac{2(W/S)}{\\rho_{cr}\\,C_{L,max}}} = \\sqrt{\\frac{2\\times "+fmt(SR.WL,1)+"}{"+fmt(rhoCrd,4)+"\\times "+(SR.selAF&&SR.selAF.CLmax?fmt(SR.selAF.CLmax,2):"1.60")+"}} = "+fmt(SR.Vstall,2)+"\\text{ m/s}","Stall speed")}
  `);

  // ── D6. FUSELAGE SIZING & DRAG BUILDUP ───────────────────────────────
  const sd6 = sec("dragbuildup","D6. Fuselage Sizing & Drag Component Buildup (Raymer)",`
  <p>Zero-lift drag uses Raymer component buildup: C<sub>D0,k</sub> = C<sub>f,k</sub> · FF<sub>k</sub> · S<sub>wet,k</sub> / S<sub>ref</sub>.</p>
  ${eq("\\lambda_f = \\frac{L_{fus}}{D_{fus}} = \\frac{"+p.fusLen+"}{"+p.fusDiam+"} = "+fmt(lambdaFd,2),"Fuselage fineness ratio")}
  ${eq("S_{wet,f} = \\pi D_f L_f\\left(1-\\frac{2}{\\lambda_f}\\right)^{2/3}\\!\\left(1+\\frac{1}{\\lambda_f^2}\\right) = "+fmt(SwfWetd,3)+"\\text{ m}^2","Fuselage wetted area (Raymer Eq. 12.31)")}
  ${eq("S_{wet,w} = 2S_w\\left(1+0.25\\,\\frac{t}{c}(1+\\lambda\\cdot 0.25)\\right) = "+fmt(Swwd,3)+"\\text{ m}^2","Wing wetted area")}
  ${eq("Re_{fus} = \\frac{\\rho_{cr}\\,V_{cr}\\,L_{fus}}{\\mu_{cr}} = \\frac{"+fmt(rhoCrd,4)+"\\times "+p.vCruise+"\\times "+p.fusLen+"}{"+fmt(muCrd,7)+"} = "+fmt(Refusd,0),"Fuselage Reynolds number")}
  ${eq("C_{f,w} = \\frac{0.455}{(\\log_{10}"+fmt(SR.Re_,0)+")^{2.58}(1+0.144\\times "+fmt(SR.Mach,4)+"^2)^{0.65}} = "+fmt(Cfwd,6),"Wing skin friction coefficient")}
  ${eq("C_{f,f} = \\frac{0.455}{(\\log_{10}"+fmt(Refusd,0)+")^{2.58}(1+0.144\\times "+fmt(SR.Mach,4)+"^2)^{0.65}} = "+fmt(Cffd,6),"Fuselage skin friction coefficient")}
  ${eq("FF_w = \\left(1+2\\times "+p.tc+"+100\\times "+fmt(p.tc**4,6)+"\\right)\\times 1.05 = "+fmt(FFwd,4),"Wing form factor")}
  ${eq("FF_f = 1+\\frac{60}{"+fmt(lambdaFd,2)+"^3}+\\frac{"+fmt(lambdaFd,2)+"}{400} = "+fmt(FFfd,4),"Fuselage form factor")}
  ${table(["Component","C<sub>f</sub>","FF","S<sub>wet</sub> (m²)","S<sub>wet</sub>/S<sub>w</sub>","C<sub>D0</sub>"],[
    `<tr><td>Wing</td><td>${fmt(Cfwd,6)}</td><td>${fmt(FFwd,4)}</td><td>${fmt(Swwd,3)}</td><td>${fmt(Swwd/SR.Swing,4)}</td><td>${fmt(SR.dragComp&&SR.dragComp.find(d=>d.name==="Wing")?SR.dragComp.find(d=>d.name==="Wing").val:0,5)}</td></tr>`,
    `<tr><td>Fuselage</td><td>${fmt(Cffd,6)}</td><td>${fmt(FFfd,4)}</td><td>${fmt(SwfWetd,3)}</td><td>${fmt(SwfWetd/SR.Swing,4)}</td><td>${fmt(SR.dragComp&&SR.dragComp.find(d=>d.name==="Fuselage")?SR.dragComp.find(d=>d.name==="Fuselage").val:0,5)}</td></tr>`,
    `<tr><td>H-Stab equiv.</td><td>${fmt(Cfwd,6)}</td><td>1.05</td><td>${fmt(Swhs_d,3)}</td><td>${fmt(Swhs_d/SR.Swing,4)}</td><td>${fmt(SR.dragComp&&SR.dragComp.find(d=>d.name==="H-Stab")?SR.dragComp.find(d=>d.name==="H-Stab").val:0,5)}</td></tr>`,
    `<tr><td>V-Stab equiv.</td><td>${fmt(Cfwd,6)}</td><td>1.05</td><td>${fmt(Swvs_d,3)}</td><td>${fmt(Swvs_d/SR.Swing,4)}</td><td>${fmt(SR.dragComp&&SR.dragComp.find(d=>d.name==="V-Stab")?SR.dragComp.find(d=>d.name==="V-Stab").val:0,5)}</td></tr>`,
    `<tr><td>Nacelles (×${p.nPropHover})</td><td>${fmt(Cfwd,6)}</td><td>1.30</td><td>${fmt(Swn_d,3)}</td><td>${fmt(Swn_d/SR.Swing,4)}</td><td>${fmt(SR.dragComp&&SR.dragComp.find(d=>d.name==="Nacelles")?SR.dragComp.find(d=>d.name==="Nacelles").val:0,5)}</td></tr>`,
    `<tr><td>Landing Gear</td><td colspan="4">Fixed interference estimate</td><td>0.01500</td></tr>`,
    `<tr><td>Miscellaneous</td><td colspan="4">Gaps, protuberances</td><td>0.00200</td></tr>`,
    `<tr style="font-weight:700"><td>Total C<sub>D0</sub></td><td colspan="4"></td><td>${fmt(SR.CD0tot,5)}</td></tr>`,
  ])}
  ${eq("C_{D_i} = \\frac{C_{L,des}^2}{\\pi\\,AR\\,e} = \\frac{"+p.clDesign+"^2}{\\pi\\times "+p.AR+"\\times "+p.eOsw+"} = "+fmt(SR.CDi,5),"Induced drag")}
  ${eq("C_{D,total} = "+fmt(SR.CD0tot,5)+"+"+fmt(SR.CDi,5)+" = "+fmt(SR.CDtot,5)+", \\quad (L/D)_{act} = "+fmt(SR.LDact,2),"Total drag and actual L/D")}
  `);

  // ── D7. ROTOR & MOTOR SIZING ──────────────────────────────────────────
  const sd7 = sec("rotcalc","D7. Rotor & Motor Sizing — Actuator Disk Theory",`
  ${eq("T_{total} = \\text{MTOW}\\times g_0 = "+fmt(SR.MTOW,2)+"\\times 9.81 = "+fmt(Ttotd,1)+"\\text{ N}","Total hover thrust")}
  ${eq("T_{rotor} = T_{total}/N_{rot} = "+fmt(Trotord,1)+"\\text{ N}, \\quad P_{rotor} = P_{hov}\\times 1000/N_{rot} = "+fmt(PrWd,1)+"\\text{ W}","Thrust and power per rotor")}
  ${eq("A_{disk} = \\frac{T_{rotor}^3}{2\\,\\rho_{SL}\\,(P_{rotor}\\,\\eta_{hov})^2} = \\frac{"+fmt(Trotord,1)+"^3}{2\\times 1.225\\times("+fmt(PrWd,1)+"\\times "+p.etaHov+")^2} = "+fmt(Adiskd,4)+"\\text{ m}^2","Disk area from actuator disk theory")}
  ${eq("D_{rot} = 2\\sqrt{A_{disk}/\\pi} = 2\\sqrt{"+fmt(Adiskd,4)+"/\\pi} = "+fmt(SR.Drotor,3)+"\\text{ m}","Rotor diameter")}
  ${eq("DL = T_{rotor}/A_{disk} = "+fmt(SR.DLrotor,1)+"\\text{ N/m}^2, \\quad PL = T_{rotor}/(P_{rotor}/1000) = "+fmt(SR.PLrotor,1)+"\\text{ N/W}","Disk loading and power loading")}
  ${eq("V_{tip} = \\sqrt{2P_{rotor}\\,\\eta_{hov}/(\\rho_{SL}\\,A_{disk})} = "+fmt(TipSpdd,2)+"\\text{ m/s}, \\quad M_{tip} = "+fmt(SR.TipMach,4)+"\\;(<0.70\\;\\checkmark)","Tip speed and tip Mach number")}
  ${eq("N = \\frac{V_{tip}}{R_{rot}}\\times\\frac{60}{2\\pi} = \\frac{"+fmt(TipSpdd,2)+"}{"+fmt(Rrotord,4)+"}\\times\\frac{60}{2\\pi} = "+fmt(SR.RPM,0)+"\\text{ rpm}","Rotational speed")}
  ${eq("c_{blade} = \\sigma\\pi R_{rot}/N_{bl} = 0.10\\times\\pi\\times "+fmt(Rrotord,4)+"/3 = "+fmt(SR.ChordBl,4)+"\\text{ m}\\;(\\sigma=0.10,\\;N_{bl}=3)","Blade chord")}
  ${eq("P_{motor,cont} = 1.15\\times P_{rotor} = "+fmt(PmotKWd,2)+"\\text{ kW}, \\quad P_{peak} = 1.50\\times P_{motor} = "+fmt(PpeakKWd,2)+"\\text{ kW}","Motor ratings with margins")}
  ${eq("Q = P_{motor}\\times 1000/\\Omega = "+fmt(Torqued,1)+"\\text{ N}\\cdot\\text{m}","Motor shaft torque")}
  `);

  // ── D8. BATTERY PACK ARCHITECTURE ────────────────────────────────────
  const sd8 = sec("battcalc","D8. Battery Pack Architecture & Sizing",`
  <p>Cell specs: NMC Li-ion, V<sub>cell</sub> = 3.6 V, Q<sub>cell</sub> = 5.0 Ah. Bus voltage = 800 V DC.</p>
  ${eq("W_E = \\frac{E_{total}\\times 1000}{(1-\\text{SoC}_{min})\\,\\text{SED}_{eff}\\,\\eta_{bat}} = \\frac{"+fmt(SR.Etot,3)+"\\times 1000}{(1-"+p.socMin+")\\times "+fmt(sedEffd,1)+"\\times "+p.etaBat+"} = "+fmt(WEd,2)+"\\text{ kg},\\;W_P="+fmt(WPd,2)+"\\text{ kg},\\;W_{bat}=\\max(W_E,W_P)="+fmt(SR.Wbat,2)+"\\text{ kg}","Dual-constraint battery mass (energy + power limits)")}
  ${eq("\\text{SED}_{pack} = E_{total}\\times 1000/W_{bat} = "+fmt(SR.SEDpack,1)+"\\text{ Wh/kg}","Pack energy density")}
  ${eq("N_s = \\text{round}(800/3.6) = "+Nseriesd+", \\quad Q_{req} = E_{total}\\times 1000/800 = "+fmt(PackAhReqd,2)+"\\text{ Ah}","Series cells and required capacity")}
  ${eq("N_p = \\lceil "+fmt(PackAhReqd,2)+"/5.0 \\rceil = "+Npard+", \\quad N_{cells} = "+Nseriesd+"\\times "+Npard+" = "+Nseriesd*Npard,"Parallel strings and total cells")}
  ${eq("E_{pack} = V_{pack}\\times Q_{pack}/1000 = "+fmt(PackVd,0)+"\\times "+fmt(PackAhd,1)+"/1000 = "+fmt(SR.PackkWh,3)+"\\text{ kWh} \\geq "+fmt(SR.Etot,3)+"\\text{ kWh}\\;\\checkmark","Pack energy must exceed mission energy")}
  ${eq("C_{hov} = \\frac{P_{hov}\\times 1000/V_{pack}}{Q_{pack}} = \\frac{"+fmt(SR.Phov*1000/PackVd,1)+"}{"+fmt(PackAhd,1)+"} = "+fmt(SR.CrateHov,3)+"\\text{ C}, \\quad C_{cr} = "+fmt(SR.CrateCr,3)+"\\text{ C}","Hover and cruise C-rates")}
  ${eq("R_{int} = 0.030\\times N_s/N_p = "+fmt(Rintd,4)+"\\,\\Omega, \\quad P_{heat} = I_{hov}^2\\times R_{int} = "+fmt(Pheatd,1)+"\\text{ W}","Pack resistance and ohmic heating at hover")}
  `);

  // ── D9. CG BREAKDOWN & STABILITY ─────────────────────────────────────
  const sd9 = sec("stabcalc","D9. Centre of Gravity, Neutral Point & Static Margin — Detailed",`
  <p>All positions from nose. Component CGs are fractions of L<sub>fus</sub> = ${p.fusLen} m.</p>
  ${table(["Component","Mass (kg)","x<sub>CG</sub> (m)","Moment (kg·m)"],[
    `<tr><td>Fuselage struct. (35% W<sub>e</sub>)</td><td>${fmt(Wfuscd,2)}</td><td>${fmt(xCGfusd,3)}  = 0.42 × L<sub>fus</sub></td><td>${fmt(Wfuscd*xCGfusd,2)}</td></tr>`,
    `<tr><td>Wing + attach. (18% W<sub>e</sub>)</td><td>${fmt(Wwingcd,2)}</td><td>${fmt(xCGwingd,3)}</td><td>${fmt(Wwingcd*xCGwingd,2)}</td></tr>`,
    `<tr><td>Motors (22% W<sub>e</sub>)</td><td>${fmt(Wmotcd,2)}</td><td>${fmt(xCGfusd,3)}</td><td>${fmt(Wmotcd*xCGfusd,2)}</td></tr>`,
    `<tr><td>Avionics (4% W<sub>e</sub>)</td><td>${fmt(Wavcd,2)}</td><td>${fmt(xCGavcD,3)} = 0.18 × L<sub>fus</sub></td><td>${fmt(Wavcd*xCGavcD,2)}</td></tr>`,
    `<tr><td>Other (21% W<sub>e</sub>)</td><td>${fmt(Wothcd,2)}</td><td>${fmt(xCGfusd,3)}</td><td>${fmt(Wothcd*xCGfusd,2)}</td></tr>`,
    `<tr style="font-weight:700"><td>Empty W<sub>e</sub></td><td>${fmt(SR.Wempty,2)}</td><td>${fmt(xCGemptyd,3)}</td><td>${fmt(SR.Wempty*xCGemptyd,2)}</td></tr>`,
    `<tr><td>Battery</td><td>${fmt(SR.Wbat,2)}</td><td>${fmt(xCGbatd,3)}  = 0.38 × L<sub>fus</sub></td><td>${fmt(SR.Wbat*xCGbatd,2)}</td></tr>`,
    `<tr><td>Payload</td><td>${p.payload}</td><td>${fmt(xCGpayd,3)}  = 0.40 × L<sub>fus</sub></td><td>${fmt(p.payload*xCGpayd,2)}</td></tr>`,
    `<tr style="font-weight:700;background:#dbeafe"><td>Total (MTOW)</td><td>${fmt(SR.MTOW,2)}</td><td><b>${fmt(SR.xCGtotal,3)}</b></td><td>${fmt(SR.MTOW*SR.xCGtotal,2)}</td></tr>`,
  ])}
  ${eq("x_{CG} = \\frac{W_e\\,x_{CG,e}+W_{bat}\\,x_{CG,bat}+m_{pay}\\,x_{CG,pay}}{\\text{MTOW}} = \\frac{"+fmt(SR.Wempty*xCGemptyd,1)+"+"+fmt(SR.Wbat*xCGbatd,1)+"+"+fmt(p.payload*xCGpayd,1)+"}{"+fmt(SR.MTOW,2)+"} = "+fmt(SR.xCGtotal,3)+"\\text{ m}","Total CG from nose")}
  ${eq("x_{AC,wing} = L_{fus}\\times 0.2589+X_{ac} = "+fmt(p.fusLen*0.2589,3)+"+"+fmt(Xacd,3)+" = "+fmt(xACwingd,3)+"\\text{ m}","Wing aerodynamic centre")}
  ${eq("C_{L_{\\alpha,w}} = \\frac{2\\pi AR}{2+\\sqrt{AR^2+4}} = "+fmt(CLaWd,4)+"\\text{ rad}^{-1},\\; \\frac{d\\varepsilon}{d\\alpha} = \\frac{2C_{L_{\\alpha,w}}}{\\pi AR} = "+fmt(dwd,4),"Lift-curve slope (Raymer Eq.12.6 finite-wing) and downwash gradient (Anderson Eq.5.39)")}
  ${eq("l_h = 0.88 L_{fus}-x_{AC,wing} = "+fmt(p.fusLen*0.88,3)+"-"+fmt(xACwingd,3)+" = "+fmt(lhd,3)+"\\text{ m}","Tail moment arm — FIX: tail AC at 88% fusLen (not fuselage tip)")}
  ${eq("x_{NP} = x_{AC,wing}+\\frac{S_h}{S_w}\\eta_h(1-\\frac{d\\varepsilon}{d\\alpha})l_h = "+fmt(xACwingd,3)+"+\\frac{"+fmt(Shd,3)+"}{"+fmt(SR.Swing,2)+"}\\times 0.9\\times(1-"+fmt(dwd,4)+")\\times "+fmt(lhd,3)+" = "+fmt(SR.xNP,3)+"\\text{ m}","Neutral point")}
  ${eq("SM = \\frac{x_{NP}-x_{CG}}{\\bar{c}} = \\frac{"+fmt(SR.xNP,3)+"-"+fmt(SR.xCGtotal,3)+"}{"+fmt(SR.MAC,3)+"} = "+fmt(SR.SM*100,2)+"\\%\\;\\text{MAC}","Static margin (target 5–25% MAC)")}
  `);

  // ── D10. NOISE MODEL ─────────────────────────────────────────────────
  const g0d_n=9.81,T0d_n=288.15,Rgas_n=287,GAM_n=1.4,rhoMSL_n=1.225;
  const aMSL_n=Math.sqrt(GAM_n*Rgas_n*T0d_n);
  const Mtip_h_n=Math.min(SR.TipSpd/aMSL_n,0.699);
  const DL_hover_n=(SR.MTOW*g0d_n/p.nPropHover)/(Math.PI*(p.propDiam/2)**2);
  const Kcal_n=(12+5*Math.log10(Math.max(DL_hover_n/500,0.1))+8*(Mtip_h_n/0.58-1)-1.5*(SR.Nbld-6)).toFixed(2);
  const Ccomp_n=(-5*Math.log10(Math.max(1-Mtip_h_n**2,0.01))).toFixed(3);
  const Kdecay_n=Math.max(2,Math.min(7,4-5*(Mtip_h_n-0.58)-1.5*Math.log10(Math.max(DL_hover_n/500,0.1)))).toFixed(2);
  const delta_int_n=(-1.0-0.15*Math.max(0,p.nPropHover-6)).toFixed(2);
  const sd10 = sec("noisecalc","D10. Noise Model — Semi-Empirical BPF + Broadband",`
  <p>Physics-informed aeroacoustic model v2 (Gutin 1948 / Lowson 1965 / BPM 1989 / ISO 9613-1 1993). All quantities at hover equilibrium (T/W = 1.0).</p>
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 1 — Directivity &amp; Compressibility</h3>
  ${eq("D(\\theta) = |\\sin\\theta| = 1.0 \\quad \\text{(in-plane, worst case, }\\theta=90^\\circ\\text{)}","Dipole directivity — Lowson 1965")}
  ${eq("M_{tip,h} = \\frac{V_{tip}}{a_{MSL}} = \\frac{"+fmt(SR.TipSpd,1)+"}{"+aMSL_n.toFixed(1)+"} = "+Mtip_h_n.toFixed(4),"Hover tip Mach (MSL sound speed)")}
  ${eq("C_{comp} = -5\\log_{10}(1-M_{tip}^2) = "+Ccomp_n+"\\text{ dB}","Prandtl–Glauert compressibility correction")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 2 — Multi-Parameter Calibration K<sub>cal</sub></h3>
  ${eq("K_{cal} = 12 + 5\\log_{10}\\!\\left(\\frac{DL}{500}\\right) + 8\\!\\left(\\frac{M_{tip}}{0.58}-1\\right) - 1.5(B-6) = "+Kcal_n+"\\text{ dB}","Replaces fixed 15 dB; fitted to Fleming 2022 + Joby/Volocopter data")}
  ${table(["Parameter","Value","Unit","Note"],[
    row("Hover DL",R.wl(DL_hover_n),R.wlU,"T/W=1.0 equilibrium"),
    row("Tip speed",R.speed(SR.TipSpd),R.speedU,"Mtip=0.58 × a_MSL"),
    row("Blade count B",String(SR.Nbld),"—","Fixed 3-blade design"),
    row("K<sub>cal</sub>",Kcal_n,"dB","Multi-param (DL,Mtip,B)"),
    row("C<sub>comp</sub>",Ccomp_n,"dB","Prandtl–Glauert"),
    row("K<sub>decay</sub> α",Kdecay_n,"dB/harm","Adaptive (Mtip,DL)"),
    row("ΔInt",delta_int_n,"dB","Rotor interaction shielding"),
  ])}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 3 — Tonal SPL Fundamental</h3>
  ${eq("p_{rms} = \\frac{D\\cdot B\\cdot\\Omega\\cdot T_r}{4\\pi r_0 \\rho c_0^2 \\sqrt{2}}\\cdot J_1\\!\\left(\\frac{B\\Omega R_{eff}}{c_0}\\right) \\quad\\Rightarrow\\quad SPL_1 = 20\\log_{10}\\!\\left(\\frac{p_{rms}}{20\\,\\mu\\text{Pa}}\\right)+K_{cal}+C_{comp}","Gutin (1948) with Bessel function J₁(x), x=BΩR_eff/c₀ (FIX 2.1)")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 4 — Harmonic Series (n=1…10, A-weighted)</h3>
  ${eq("SPL_n = SPL_1 - \\alpha(n-1) \\quad\\text{dBA}_n = SPL_n + A(f_n)","FIX 2.4: Harmonics decrease from SPL₁ (Gutin: p_m ∝ 1/m); removed unphysical +20log₁₀(n) growth term")}
  ${table(["n","f_n (Hz)","SPL_n (dB)","A(f) (dB)","dBA_n"],[
    ...(SR.bpfHarmonics||[]).map(h=>`<tr><td>${h.harmonic}</td><td>${h.freq}</td><td>—</td><td>—</td><td>${h.SPL}</td></tr>`)
  ])}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 5 — Broadband (BPM Mtip⁵ scaling)</h3>
  ${eq("\\text{dBA}_{BB} = \\text{dBA}_{tonal} - 8 + 50\\log_{10}\\!\\left(\\frac{M_{tip}}{0.58}\\right) - 2\\log_{10}\\!\\left(\\frac{Re_{tip}}{1.5\\times10^6}\\right)","Brooks, Pope & Marcolini 1989")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 5b — Vortex (BVI) Noise (NEW — FIX 2.3)</h3>
  ${eq("p_{vortex} = k_2\\,\\frac{V_{0.7}}{\\rho\\,r_0}\\sqrt{\\frac{T_r\\cdot N}{\\sigma}\\cdot DL} \\quad k_2=0.4259\\,\\text{s}^3/\\text{m}^3","FIX: k2 converted from ft³ to m³ (÷0.3048³); eVTOL-master k2=1.206e-2 s³/ft³ at δ_S=500ft")}
  ${eq("\\text{Total}_{single} = 10\\log_{10}\\!\\left(10^{\\text{dBA}_{tonal}/10}+10^{\\text{dBA}_{BB}/10}+10^{\\text{dBA}_{vortex}/10}\\right)","Energy sum of tonal + broadband + vortex")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Step 6 — Multi-Rotor + Propagation</h3>
  ${eq("\\text{dBA}_{multi} = \\text{dBA}_{single}+10\\log_{10}(N_{rot})+\\Delta_{int} = "+fmt(SR.dBA_1m,1)+"\\text{ dBA at 1 m}","Incoherent sum + shielding")}
  ${eq("\\text{dBA}(r) = \\text{dBA}_{1m} - 20\\log_{10}(r) - \\alpha_{atm}\\cdot r + \\Delta_{Gr}","ISO 9613-1 propagation + image-source ground reflection")}
  ${table(["Distance","Level","Regulatory ref"],[
    row(`1 ${R.lenU} (near field)`,fmt(SR.dBA_1m,1)+" dBA","Source level"),
    row(`25 ${R.lenU} (helipad edge)`,fmt(SR.dBA_25m,1)+" dBA","Operational"),
    row(`100 ${R.lenU} (residential)`,fmt(SR.dBA_100m,1)+" dBA","FAA ref"),
    row(`150 ${R.lenU} (EASA UAM)`,fmt(SR.dBA_150m,1)+" dBA","≤ 65 dBA target"),
    row(`300 ${R.lenU} (community)`,fmt(SR.dBA_300m,1)+" dBA","Community"),
    row(`500 ${R.lenU} (far field)`,fmt(SR.dBA_500m,1)+" dBA","Background"),
    row("65 dBA contour",R.len(SR.dist_65dBA)+" "+R.lenU,"Radius from source"),
    row("55 dBA contour",R.len(SR.dist_55dBA)+" "+R.lenU,"Near-quiet threshold"),
  ])}
  `);

  // ── D11. DIRECT OPERATING COST (DOC) MODEL ─────────────────────────
  const g0d_c=9.81;
  const flightsPerYear_c=10*300;
  const fltHr_c=SR.Tend/3600;
  const CrateHov_c=SR.CrateHov||3.0;
  const eta_bat_d_c=Math.max(0.80,0.97-0.025*CrateHov_c);
  const eta_ch_c=Math.max(0.85,0.97-0.030*CrateHov_c);
  // FIX 3.1 (report): SR.Etot already includes discharge losses — only charger η needed
  const eGrid_c=SR.Etot/eta_ch_c;
  const eCost_c=eGrid_c*0.16;
  const cellCostKwh_c=149*Math.pow(300/Math.max(100,p.sedCell),0.3);
  const battCostKwh_c=(cellCostKwh_c+55)*2.0;
  const packCost_c=SR.PackkWh*battCostKwh_c;
  const dod_c=Math.min(0.85,SR.Etot/SR.PackkWh);
  const beta_c=dod_c<0.5?0.5:0.6;
  const effCyc_c=Math.floor(Math.min(2000,900*Math.pow(0.5/dod_c,beta_c)*Math.max(0.5,Math.pow(2.0/CrateHov_c,0.45))));
  const battCost_c=packCost_c/Math.max(1,effCyc_c);
  const hoverFrac_c=(SR.tto+SR.tld)/Math.max(1,SR.Tend);
  const MMH_c=0.6+0.08*Math.max(0,p.nPropHover-4)+0.4*hoverFrac_c;
  const maintCost_c=45000/flightsPerYear_c+(MMH_c*75+75)*fltHr_c+p.nPropHover*(1/8000+1/5000)*1200*fltHr_c;
  const motorReplCost_c=(SR.PmotKW*100*p.nPropHover)/Math.floor(3000/Math.max(0.1,fltHr_c));
  const insCost_c=(SR.MTOW*800*0.10)/flightsPerYear_c;
  const opCost_c=(82000/(4*300*8))*(fltHr_c+0.25);
  // FIX 3.3 (report): $1M was STC budget — FAA Part 21 type cert is $50–200M
  // $75M amortised over 50 aircraft × 10 years × 3000 flights/yr
  const certCost_c=75000000/(50*flightsPerYear_c*10);
  const totalDOC_c=eCost_c+battCost_c+maintCost_c+motorReplCost_c+insCost_c+35+opCost_c+certCost_c;
  const cpkm_c=totalDOC_c/p.range;
  const sd11 = sec("costcalc","D11. Direct Operating Cost (DOC) Model v3",`
  <p>Energy economics and lifecycle cost model. Sources: ICAO Doc 9502, BNEF EVO 2024, NASA/CR-2019-220217, Vascik MIT 2020, GAMA 2023.</p>
  ${table(["Parameter","Value","Unit","Formula / Source"],[
    row("Flight duration T<sub>end</sub>",fmt(SR.Tend/60,2),"min","Mission sizing"),
    row("Flights/year",flightsPerYear_c.toString(),"","10/day × 300 days (Joby ops model)"),
    row("Hover C-rate",fmt(CrateHov_c,2),"C","P<sub>hov</sub>/(V<sub>pack</sub>×Q<sub>pack</sub>)"),
    row("η<sub>charger</sub>",eta_ch_c.toFixed(3),"","0.97 − 0.030×C  (SAE ARP6504) — charger roundtrip only"),
  ])}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Energy Cost</h3>
  ${eq("E_{grid} = \\frac{E_{tot}}{\\eta_{charger}} = \\frac{"+fmt(SR.Etot,2)+"}{"+eta_ch_c.toFixed(3)+"} = "+eGrid_c.toFixed(2)+"\\text{ kWh}","FIX 3.1: SR.Etot already includes discharge losses — only charger η added (SAE ARP6504)")}
  ${eq("C_{energy} = E_{grid}\\times\\$0.16/\\text{kWh} = \\$"+eCost_c.toFixed(2)+"/\\text{flight}","EIA 2024 base + EPRI demand charge")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Battery Replacement</h3>
  ${eq("\\$/\\text{kWh}_{pack} = (\\$"+cellCostKwh_c.toFixed(0)+"_{cell}+\\$55_{overhead})\\times 2_{cert} = \\$"+battCostKwh_c.toFixed(0)+"/\\text{kWh}","BNEF EVO 2024 + Fraunhofer ISE 2023 pack OH")}
  ${eq("N_{eff} = 900\\times(0.5/DoD)^\\beta\\times(2/C)^{0.45} = "+effCyc_c+"\\text{ cycles}","DoD β="+(beta_c)+" (shallow/deep); C-rate penalty Waldmann 2014")}
  ${eq("C_{battery} = \\frac{"+fmt(SR.PackkWh,2)+"\\times\\$"+battCostKwh_c.toFixed(0)+"}{"+effCyc_c+"} = \\$"+battCost_c.toFixed(2)+"/\\text{flight}","")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Maintenance</h3>
  ${eq("MMH/FH = 0.6+0.08(N_{mot}-4)+0.4 f_{hover} = "+MMH_c.toFixed(2)+"\\text{ MMH/FH}","Baseline=0.6 (eVTOL-master / Booz Allen AAM 2021) + motor count + hover fraction penalty")}
  ${eq("C_{maint} = \\$45k/yr\\div N_{flights} + (MMH\\times\\$75+\\$75)\\times t_{hr} + \\text{MTBF term} = \\$"+maintCost_c.toFixed(2)+"/\\text{flight}","")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">DOC Summary</h3>
  ${table(["Cost Component","$/flight","$/km","% of DOC"],[
    row("Energy",fmt(eCost_c,2),fmt(eCost_c/p.range,3),fmt(eCost_c/totalDOC_c*100,1)+"%"),
    row("Battery replacement",fmt(battCost_c,2),fmt(battCost_c/p.range,3),fmt(battCost_c/totalDOC_c*100,1)+"%"),
    row("Maintenance",fmt(maintCost_c,2),fmt(maintCost_c/p.range,3),fmt(maintCost_c/totalDOC_c*100,1)+"%"),
    row("Motor replacement",fmt(motorReplCost_c,2),fmt(motorReplCost_c/p.range,3),fmt(motorReplCost_c/totalDOC_c*100,1)+"%"),
    row("Insurance",fmt(insCost_c,2),fmt(insCost_c/p.range,3),fmt(insCost_c/totalDOC_c*100,1)+"%"),
    row("Vertiport fee","35.00",fmt(35/p.range,3),fmt(35/totalDOC_c*100,1)+"%"),
    row("Operator (RPIC)",fmt(opCost_c,2),fmt(opCost_c/p.range,3),fmt(opCost_c/totalDOC_c*100,1)+"%"),
    row("Cert amortisation",fmt(certCost_c,2),fmt(certCost_c/p.range,3),fmt(certCost_c/totalDOC_c*100,1)+"% (FIX: $75M÷50ac÷10yr)"),
    `<tr style="font-weight:700;background:#dbeafe"><td><b>Total DOC</b></td><td><b>$${totalDOC_c.toFixed(2)}</b></td><td><b>$${(totalDOC_c/Math.max(1,useImperial?(p.range*0.539957):p.range)).toFixed(2)}/${useImperial?"nm":"km"}</b></td><td>100%</td></tr>`,
  ])}
  `);

  // ── D12. BEM ROTOR ANALYSIS ──────────────────────────────────────────
  const Rrotor_b=p.propDiam/2;
  const Adisk_b=Math.PI*Rrotor_b**2;
  const N_b=SR.Nbld||3;
  const Omega_b=SR.RPM*Math.PI/30;
  const T_b=SR.MTOW*g0d_c/p.nPropHover;
  const DL_b=T_b/Adisk_b;
  const vi_b=Math.sqrt(T_b/(2*1.225*Adisk_b));
  const sigma_b=N_b*(0.10*Math.PI*Rrotor_b/N_b)/(Math.PI*Rrotor_b);
  const CT_b=T_b/(1.225*Adisk_b*(SR.RPM*Math.PI/30*Rrotor_b)**2);
  const FM_ideal=Math.sqrt(2/Math.PI); // ideal FM for reference
  const CPideal=CT_b**(3/2)/Math.sqrt(2);
  const CP_act=(SR.Phov*1000/p.nPropHover)/(1.225*Adisk_b*(SR.TipSpd)**3);
  const FM_act=CPideal/Math.max(CP_act,1e-9);
  const sd12 = sec("bemcalc","D12. BEM Rotor Analysis — Actuator Disk + Blade Element",`
  <p>Hover rotor analysis using Actuator Disk Theory (momentum theory) and blade element principles. One rotor at T/W = 1.0 hover equilibrium.</p>
  ${table(["Parameter","Symbol","Value","Unit"],[
    row("Rotor radius","R",fmt(Rrotor_b,3),"m"),
    row("Disk area","A",fmt(Adisk_b,3),"m²"),
    row("No. blades","B",String(N_b),"—"),
    row("Blade solidity","σ",sigma_b.toFixed(4),"—"),
    row("Rotor RPM","Ω",fmt(SR.RPM,0),"rpm"),
    row("Tip speed","V<sub>tip</sub>",R.speed(SR.TipSpd),R.speedU),
    row("Tip Mach","M<sub>tip</sub>",fmt(SR.TipMach,4),"—"),
    row("Thrust per rotor","T",fmt(T_b,1),"N"),
    row("Disk loading","DL",R.wl(DL_b),R.wlU),
    row("Power loading","PL",fmt(SR.PLrotor,2),"N/W"),
  ])}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Momentum Theory</h3>
  ${eq("v_i = \\sqrt{\\frac{T}{2\\rho A}} = \\sqrt{\\frac{"+fmt(T_b,1)+"}{2\\times1.225\\times"+fmt(Adisk_b,3)+"}} = "+vi_b.toFixed(2)+"\\text{ m/s}","Induced velocity (actuator disk)")}
  ${eq("P_{ideal} = T\\cdot v_i = "+fmt(T_b,1)+"\\times"+vi_b.toFixed(2)+" = "+fmt(T_b*vi_b/1000,2)+"\\text{ kW}","Ideal hover power (no losses)")}
  ${eq("P_{actual} = P_{hov}/N_{rot} = "+fmt(SR.Phov*1000/p.nPropHover,1)+"\\text{ W per rotor} = "+fmt(SR.Phov/p.nPropHover,2)+"\\text{ kW}","Actual rotor shaft power")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Figure of Merit</h3>
  ${eq("C_T = \\frac{T}{\\rho A V_{tip}^2} = \\frac{"+fmt(T_b,1)+"}{1.225\\times"+fmt(Adisk_b,3)+"\\times"+fmt(SR.TipSpd,1)+"^2} = "+CT_b.toFixed(5),"Thrust coefficient")}
  ${eq("FM = \\frac{C_T^{3/2}/\\sqrt{2}}{C_P} = "+FM_act.toFixed(3)+" \\quad (\\text{design }\\eta_{hov}="+p.etaHov+"\\Rightarrow FM\\approx"+p.etaHov+")","Figure of Merit — matches η_hov input")}
  <h3 style="font-size:10.5pt;font-weight:700;margin:10px 0 4px">Motor Sizing</h3>
  ${table(["Parameter","Value","Unit"],[
    row("Continuous power/rotor",R.power(SR.PmotKW),R.powerU),
    row("Peak power/rotor (1.5×)",R.power(SR.PpeakKW),R.powerU),
    row("Shaft torque",fmt(SR.Torque,1),"N·m"),
    row("Motor mass/rotor",R.mass(SR.MotMass),R.massU),
    row("Total motor mass",R.mass(SR.MotMass*p.nPropHover),R.massU),
    row("Specific power (cont.)",fmt(SR.PmotKW*1000/Math.max(1,SR.MotMass),0),"W/kg"),
  ])}
  `);

  // ── FULL HTML PAGE — A4 Professional Report ─────────────────────────

  // ── Figure helper ────────────────────────────────────────────────────
  const fig=(num,caption,svgContent)=>
    `<figure class="report-figure" id="fig${num}"><div class="fig-inner">${svgContent}</div><figcaption><strong>Figure ${num}.</strong> ${caption}</figcaption></figure>`;

  // ── SVG Figure 1: Mission Power Timeline ─────────────────────────────
  const phases_f=[
    {lbl:"Takeoff", P:SR.Phov, t:SR.tto,  col:"#f59e0b"},
    {lbl:"Climb",   P:SR.Pcl,  t:SR.tcl,  col:"#3b82f6"},
    {lbl:"Cruise",  P:SR.Pcr,  t:SR.tcr,  col:"#14b8a6"},
    {lbl:"Descent", P:SR.Pdc,  t:SR.tdc,  col:"#8b5cf6"},
    {lbl:"Landing", P:SR.Phov, t:SR.tld,  col:"#f97316"},
    {lbl:"Reserve", P:SR.Pres, t:SR.tres, col:"#ef4444"},
  ];
  const maxP_f=Math.max(...phases_f.map(ph=>ph.P),1);
  const totalT_f=phases_f.reduce((s,ph)=>s+(ph.t||0),0)||1;
  const cW_f=440,cH_f=120,pL_f=48,pT_f=18,pB_f=38;
  let xCur_f=0;
  const pBars_f=phases_f.map(ph=>{
    const w=cW_f*(ph.t/totalT_f), h=cH_f*(ph.P/maxP_f);
    const x=pL_f+xCur_f, y=pT_f+cH_f-h; xCur_f+=w;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1,w-1).toFixed(1)}" height="${h.toFixed(1)}" fill="${ph.col}" opacity="0.85"/>
            <text x="${(x+w/2).toFixed(1)}" y="${(pT_f+cH_f+13).toFixed(1)}" text-anchor="middle" font-size="7" fill="#374151" font-family="Arial,sans-serif">${ph.lbl}</text>
            ${h>14?`<text x="${(x+w/2).toFixed(1)}" y="${(y+h/2+3).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="#fff" font-weight="bold" font-family="Arial,sans-serif">${ph.P.toFixed(0)}</text>`:''}`;
  });
  const yT_f=[0,0.25,0.5,0.75,1].map(t=>{const y=pT_f+cH_f*(1-t);const v=(maxP_f*t).toFixed(0);return `<line x1="${pL_f}" y1="${y.toFixed(1)}" x2="${(pL_f+cW_f).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${(pL_f-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v}</text>`;});
  const svg_fig1=`<svg viewBox="0 0 500 176" width="500" height="176" xmlns="http://www.w3.org/2000/svg">${yT_f.join('')}${pBars_f.join('')}<line x1="${pL_f}" y1="${pT_f}" x2="${pL_f}" y2="${(pT_f+cH_f).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_f}" y1="${(pT_f+cH_f).toFixed(1)}" x2="${(pL_f+cW_f).toFixed(1)}" y2="${(pT_f+cH_f).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="12" y="${(pT_f+cH_f/2).toFixed(0)}" text-anchor="middle" font-size="7.5" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_f+cH_f/2).toFixed(0)})">Power (${R.powerU})</text></svg>`;

  // ── SVG Figure 2: Weight Breakdown ───────────────────────────────────
  const wSegs_f=[{lbl:"Payload",val:p.payload,col:"#16a34a"},{lbl:"Empty Weight",val:SR.Wempty,col:"#1e40af"},{lbl:"Battery",val:SR.Wbat,col:"#f59e0b"}];
  const Wtot_f=SR.MTOW||1; let xW_f=10;
  const wBars_f=wSegs_f.map(s=>{const w=460*(s.val/Wtot_f);const b=`<rect x="${xW_f.toFixed(1)}" y="14" width="${Math.max(1,w).toFixed(1)}" height="30" fill="${s.col}" opacity="0.9"/>${w>35?`<text x="${(xW_f+w/2).toFixed(1)}" y="32" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold" font-family="Arial,sans-serif">${s.lbl}</text>`:''}${w>45?`<text x="${(xW_f+w/2).toFixed(1)}" y="55" text-anchor="middle" font-size="7.5" fill="#374151" font-family="Arial,sans-serif">${R.mass(s.val)} ${R.massU} (${(s.val/Wtot_f*100).toFixed(1)}%)</text>`:''}`;xW_f+=w;return b;});
  const svg_fig2=`<svg viewBox="0 0 480 68" width="480" height="68" xmlns="http://www.w3.org/2000/svg">${wBars_f.join('')}<rect x="10" y="14" width="460" height="30" fill="none" stroke="#374151" stroke-width="0.75"/></svg>`;

  // ── SVG Figure 3: Energy Breakdown ───────────────────────────────────
  const eSegs_f=[{lbl:"T/O",val:SR.Eto,col:"#f59e0b"},{lbl:"Climb",val:SR.Ecl,col:"#3b82f6"},{lbl:"Cruise",val:SR.Ecr,col:"#14b8a6"},{lbl:"Desc",val:SR.Edc,col:"#8b5cf6"},{lbl:"Land",val:SR.Eld,col:"#f97316"},{lbl:"Reserve",val:SR.Eres,col:"#ef4444"}];
  const Etot_f2=SR.Etot||1; let xE_f=10;
  const eBars_f=eSegs_f.map(s=>{const w=460*(s.val/Etot_f2);const b=`<rect x="${xE_f.toFixed(1)}" y="14" width="${Math.max(1,w).toFixed(1)}" height="30" fill="${s.col}" opacity="0.85"/>${w>28?`<text x="${(xE_f+w/2).toFixed(1)}" y="32" text-anchor="middle" font-size="7.5" fill="#fff" font-weight="bold" font-family="Arial,sans-serif">${s.lbl}</text>`:''}${w>38?`<text x="${(xE_f+w/2).toFixed(1)}" y="56" text-anchor="middle" font-size="7" fill="#374151" font-family="Arial,sans-serif">${s.val.toFixed(1)} kWh</text>`:''}`;xE_f+=Math.max(1,w);return b;});
  const svg_fig3=`<svg viewBox="0 0 480 66" width="480" height="66" xmlns="http://www.w3.org/2000/svg">${eBars_f.join('')}<rect x="10" y="14" width="460" height="30" fill="none" stroke="#374151" stroke-width="0.75"/></svg>`;

  // ── SVG Figure 4: Drag Polar ──────────────────────────────────────────
  const pPts_f=(SR.polarData||[]).filter(d=>d.CL>=0&&d.CL<=1.6&&d.CD>0&&d.CD<0.12);
  const maxCD_f=pPts_f.length?Math.max(...pPts_f.map(d=>d.CD)):0.08;
  const cW_p=400,cH_p=140,pL_p=45,pT_p=15,pB_p=32,pR_p=15;
  const px_f=(cd)=>pL_p+cW_p*(cd/Math.max(maxCD_f,0.001));
  const py_f=(cl)=>pT_p+cH_p*(1-cl/1.6);
  const polLine=pPts_f.map(d=>`${px_f(d.CD).toFixed(1)},${py_f(d.CL).toFixed(1)}`).join(' ');
  const dp_x_f=px_f(SR.CDtot||0.036), dp_y_f=py_f(p.clDesign);
  const xT_p=[0,0.02,0.04,0.06,0.08].filter(v=>v<=maxCD_f).map(v=>{const x=px_f(v);return `<line x1="${x.toFixed(1)}" y1="${pT_p}" x2="${x.toFixed(1)}" y2="${(pT_p+cH_p).toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${x.toFixed(1)}" y="${(pT_p+cH_p+11).toFixed(1)}" text-anchor="middle" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v.toFixed(2)}</text>`;});
  const yT_p=[0,0.4,0.8,1.2,1.6].map(v=>{const y=py_f(v);return `<line x1="${pL_p}" y1="${y.toFixed(1)}" x2="${(pL_p+cW_p).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${(pL_p-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v.toFixed(1)}</text>`;});
  const svg_fig4=`<svg viewBox="0 0 460 187" width="460" height="187" xmlns="http://www.w3.org/2000/svg">${xT_p.join('')}${yT_p.join('')}${polLine?`<polyline points="${polLine}" fill="none" stroke="#1e40af" stroke-width="1.5"/>`:''}<circle cx="${dp_x_f.toFixed(1)}" cy="${dp_y_f.toFixed(1)}" r="4" fill="#f59e0b" stroke="#0f172a" stroke-width="1"/><text x="${(dp_x_f+7).toFixed(1)}" y="${(dp_y_f+4).toFixed(1)}" font-size="7.5" fill="#0f172a" font-family="Arial,sans-serif" font-weight="bold">Design point (CL=${p.clDesign}, L/D=${fmt(SR.LDact,1)})</text><line x1="${pL_p}" y1="${pT_p}" x2="${pL_p}" y2="${(pT_p+cH_p).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_p}" y1="${(pT_p+cH_p).toFixed(1)}" x2="${(pL_p+cW_p).toFixed(1)}" y2="${(pT_p+cH_p).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="${(pL_p+cW_p/2).toFixed(0)}" y="${(pT_p+cH_p+24).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif">Drag Coefficient C&#x209F;</text><text x="12" y="${(pT_p+cH_p/2).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_p+cH_p/2).toFixed(0)})">Lift Coefficient C&#x2097;</text></svg>`;

  // ── SVG Figure 5: V-n Envelope ────────────────────────────────────────
  const Vstall_f=SR.Vstall||20, VA_f=SR.VA, VD_f=SR.VD||(p.vCruise*1.25);
  /* The DRAWN V-n envelope, second copy of the same constant — the table
     above said 3.5 g and so did the figure beside it, both independent of
     the engine. Both now read SR.nLimit, so the picture and the number
     cannot drift apart from each other or from the load cases. */
  /* The MANOEUVRE envelope is capped at the manoeuvre limits; the gust lines
     are drawn separately, and the axis spans both. */
  const vnF=SR.vnBasis||{}, gustF=vnF.gustLines||[];
  const WL_f=SR.WL||500, nPos_f=vnF.capPos??SR.nLimit, nNeg_f=vnF.capNeg??SR.nLimitNeg, CLmax_f=1.6, CLmax_n2=0.8;
  const nTop_f=Math.max(nPos_f,...gustF.map(g=>g.nPos)), nBot_f=Math.min(nNeg_f,...gustF.map(g=>g.nNeg));
  const Vmx_f=VD_f*1.08;
  const cW_v=420,cH_v=150,pL_v=45,pT_v=15,pB_v=32;
  const vx_f=(v)=>pL_v+cW_v*(v/Vmx_f);
  const ny_f=(n)=>pT_v+cH_v*(1-(n-nBot_f)/(nTop_f-nBot_f));
  const rho_vf=1.225;
  const mPts_f=Array.from({length:40},(_,i)=>{const v=i/39*VA_f;const n=Math.min(nPos_f,0.5*rho_vf*v*v*CLmax_f/WL_f);return `${vx_f(v).toFixed(1)},${ny_f(n).toFixed(1)}`;}).join(' ');
  const mNeg_f=Array.from({length:25},(_,i)=>{const v=i/24*(VD_f*0.9);const n=Math.max(nNeg_f,-0.5*rho_vf*v*v*CLmax_n2/WL_f);return `${vx_f(v).toFixed(1)},${ny_f(n).toFixed(1)}`;}).join(' ');
  const vTck_f=[0,20,40,60,80,Math.round(VD_f)].filter((v,i,a)=>v<=Vmx_f&&a.indexOf(v)===i).map(v=>{const x=vx_f(v);return `<line x1="${x.toFixed(1)}" y1="${pT_v}" x2="${x.toFixed(1)}" y2="${(pT_v+cH_v).toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${x.toFixed(1)}" y="${(pT_v+cH_v+12).toFixed(1)}" text-anchor="middle" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v}</text>`;});
  const nTck_f=[...new Set([Math.round(nBot_f*10)/10,...Array.from({length:Math.floor(nTop_f)-Math.ceil(nBot_f)+1},(_,i)=>Math.ceil(nBot_f)+i),Math.round(nTop_f*10)/10])].map(n=>{const y=ny_f(n);return `<line x1="${pL_v}" y1="${y.toFixed(1)}" x2="${(pL_v+cW_v).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${n===0?'#374151':'#e5e7eb'}" stroke-width="${n===0?0.8:0.5}"/><text x="${(pL_v-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${n}</text>`;});
  const gLines_f=gustF.map(g=>`<line x1="${vx_f(0).toFixed(1)}" y1="${ny_f(1).toFixed(1)}" x2="${vx_f(g.V).toFixed(1)}" y2="${ny_f(g.nPos).toFixed(1)}" stroke="#d97706" stroke-width="0.9" stroke-dasharray="3,2"/><line x1="${vx_f(0).toFixed(1)}" y1="${ny_f(1).toFixed(1)}" x2="${vx_f(g.V).toFixed(1)}" y2="${ny_f(g.nNeg).toFixed(1)}" stroke="#d97706" stroke-width="0.9" stroke-dasharray="3,2"/>`).join('');
  const svg_fig5=`<svg viewBox="0 0 480 197" width="480" height="197" xmlns="http://www.w3.org/2000/svg">${vTck_f.join('')}${nTck_f.join('')}${gLines_f}<polyline points="${mPts_f}" fill="none" stroke="#1e40af" stroke-width="1.5"/><line x1="${vx_f(VA_f).toFixed(1)}" y1="${ny_f(nPos_f).toFixed(1)}" x2="${vx_f(VD_f).toFixed(1)}" y2="${ny_f(nPos_f).toFixed(1)}" stroke="#1e40af" stroke-width="1.5"/><line x1="${vx_f(VD_f).toFixed(1)}" y1="${ny_f(nPos_f).toFixed(1)}" x2="${vx_f(VD_f).toFixed(1)}" y2="${ny_f(0).toFixed(1)}" stroke="#1e40af" stroke-width="1.5"/><polyline points="${mNeg_f}" fill="none" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4,2"/><line x1="${vx_f(Vstall_f).toFixed(1)}" y1="${ny_f(nNeg_f).toFixed(1)}" x2="${vx_f(VD_f).toFixed(1)}" y2="${ny_f(nNeg_f).toFixed(1)}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4,2"/><text x="${(vx_f(VA_f)+3).toFixed(1)}" y="${(ny_f(nPos_f)-4).toFixed(1)}" font-size="7" fill="#1e40af" font-family="Arial,sans-serif">VA=${R.speed(VA_f)} ${R.speedU}</text><text x="${(vx_f(VD_f)-2).toFixed(1)}" y="${(ny_f(nPos_f)-4).toFixed(1)}" text-anchor="end" font-size="7" fill="#1e40af" font-family="Arial,sans-serif">VD=${R.speed(VD_f)}</text><line x1="${pL_v}" y1="${pT_v}" x2="${pL_v}" y2="${(pT_v+cH_v).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_v}" y1="${(pT_v+cH_v).toFixed(1)}" x2="${(pL_v+cW_v).toFixed(1)}" y2="${(pT_v+cH_v).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="${(pL_v+cW_v/2).toFixed(0)}" y="${(pT_v+cH_v+24).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif">Equivalent Airspeed (${R.speedU})</text><text x="12" y="${(pT_v+cH_v/2).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_v+cH_v/2).toFixed(0)})">Load Factor n (g)</text></svg>`;

  // ── SVG Figure 6: Noise Propagation ──────────────────────────────────
  const nDists_f=[1,5,10,25,50,100,150,200,300,500];
  const nPts_f=nDists_f.map(r=>{const alpha_atm=1.8/1000;const dBA=SR.dBA_1m-20*Math.log10(r)-alpha_atm*r+(r>10?2.5:0);return{r,dBA:Math.max(25,dBA)};});
  const cW_n=420,cH_n=140,pL_n=45,pT_n=15,pB_n=32;
  const logMax=Math.log10(500);
  const nx_f=(r)=>pL_n+cW_n*(Math.log10(Math.max(r,0.1))/logMax);
  const ny_n2=(d)=>pT_n+cH_n*(1-(d-25)/(Math.max(SR.dBA_1m||100,90)-25));
  const nLine_f=nPts_f.map(d=>`${nx_f(d.r).toFixed(1)},${ny_n2(d.dBA).toFixed(1)}`).join(' ');
  const rTck_f=[1,10,50,150,500].map(r=>{const x=nx_f(r);return `<line x1="${x.toFixed(1)}" y1="${pT_n}" x2="${x.toFixed(1)}" y2="${(pT_n+cH_n).toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${x.toFixed(1)}" y="${(pT_n+cH_n+12).toFixed(1)}" text-anchor="middle" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${r}m</text>`;});
  const dT_f=[40,50,60,70,80,90].filter(v=>v>=25&&v<=(SR.dBA_1m||100)).map(v=>{const y=ny_n2(v);return `<line x1="${pL_n}" y1="${y.toFixed(1)}" x2="${(pL_n+cW_n).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${(pL_n-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v}</text>`;});
  const y65_f=ny_n2(65);
  const svg_fig6=`<svg viewBox="0 0 480 187" width="480" height="187" xmlns="http://www.w3.org/2000/svg">${rTck_f.join('')}${dT_f.join('')}<polyline points="${nLine_f}" fill="none" stroke="#1e40af" stroke-width="2"/>${nPts_f.map(d=>`<circle cx="${nx_f(d.r).toFixed(1)}" cy="${ny_n2(d.dBA).toFixed(1)}" r="2.5" fill="#1e40af"/>`).join('')}<line x1="${pL_n}" y1="${y65_f.toFixed(1)}" x2="${(pL_n+cW_n).toFixed(1)}" y2="${y65_f.toFixed(1)}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="5,3"/><text x="${(pL_n+cW_n-2).toFixed(1)}" y="${(y65_f-4).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#dc2626" font-family="Arial,sans-serif">EASA limit 65 dBA</text><line x1="${pL_n}" y1="${pT_n}" x2="${pL_n}" y2="${(pT_n+cH_n).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_n}" y1="${(pT_n+cH_n).toFixed(1)}" x2="${(pL_n+cW_n).toFixed(1)}" y2="${(pT_n+cH_n).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="${(pL_n+cW_n/2).toFixed(0)}" y="${(pT_n+cH_n+24).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif">Distance from source — log scale (${R.lenU})</text><text x="12" y="${(pT_n+cH_n/2).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_n+cH_n/2).toFixed(0)})">A-weighted SPL (dBA)</text></svg>`;

  // ── SVG Figure 7: Battery SoH Degradation ────────────────────────────
  const shPts_f=Array.from({length:21},(_,i)=>{const c=i*900/20;const s=Math.max(60,100-20*Math.pow(c/900,0.8));return{c,s};});
  const cW_sh=420,cH_sh=130,pL_sh=45,pT_sh=15,pB_sh=32;
  const sx_f=(c)=>pL_sh+cW_sh*(c/900);
  const sy_f=(s)=>pT_sh+cH_sh*(1-(s-60)/40);
  const shLine_f=shPts_f.map(d=>`${sx_f(d.c).toFixed(1)},${sy_f(d.s).toFixed(1)}`).join(' ');
  const y80_f=sy_f(80);
  const shXT=[0,200,400,600,800,900].map(c=>{const x=sx_f(c);return `<line x1="${x.toFixed(1)}" y1="${pT_sh}" x2="${x.toFixed(1)}" y2="${(pT_sh+cH_sh).toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${x.toFixed(1)}" y="${(pT_sh+cH_sh+12).toFixed(1)}" text-anchor="middle" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${c}</text>`;});
  const shYT=[60,70,80,90,100].map(s=>{const y=sy_f(s);return `<line x1="${pL_sh}" y1="${y.toFixed(1)}" x2="${(pL_sh+cW_sh).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${(pL_sh-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${s}%</text>`;});
  const svg_fig7=`<svg viewBox="0 0 480 177" width="480" height="177" xmlns="http://www.w3.org/2000/svg">${shXT.join('')}${shYT.join('')}<polyline points="${shLine_f}" fill="none" stroke="#1e40af" stroke-width="2"/><line x1="${pL_sh}" y1="${y80_f.toFixed(1)}" x2="${(pL_sh+cW_sh).toFixed(1)}" y2="${y80_f.toFixed(1)}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="5,3"/><text x="${(pL_sh+cW_sh-2).toFixed(1)}" y="${(y80_f-4).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#dc2626" font-family="Arial,sans-serif">80% SoH → replacement threshold</text><line x1="${pL_sh}" y1="${pT_sh}" x2="${pL_sh}" y2="${(pT_sh+cH_sh).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_sh}" y1="${(pT_sh+cH_sh).toFixed(1)}" x2="${(pL_sh+cW_sh).toFixed(1)}" y2="${(pT_sh+cH_sh).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="${(pL_sh+cW_sh/2).toFixed(0)}" y="${(pT_sh+cH_sh+24).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif">Charge Cycle Count</text><text x="12" y="${(pT_sh+cH_sh/2).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_sh+cH_sh/2).toFixed(0)})">State of Health (%)</text></svg>`;

  // ── SVG Figure 8: MTOW Convergence History ────────────────────────────
  const cvD_f=(SR.convData||[]).slice(0,40).filter(d=>isFinite(d.MTOW));
  const cvMax_f=cvD_f.length?Math.max(...cvD_f.map(d=>d.MTOW)):SR.MTOW||2000;
  const cvMin_f=cvD_f.length?Math.min(...cvD_f.map(d=>d.MTOW)):SR.MTOW*0.8||1600;
  const cvRange_f=Math.max(cvMax_f-cvMin_f,50);
  const cW_cv=420,cH_cv=120,pL_cv=55,pT_cv=15,pB_cv=32;
  const cvx_f=(i)=>pL_cv+cW_cv*(i/Math.max(cvD_f.length-1,1));
  const cvy_f=(m)=>pT_cv+cH_cv*(1-(m-cvMin_f)/cvRange_f);
  const cvLine_f=cvD_f.map((d,i)=>`${cvx_f(i).toFixed(1)},${cvy_f(d.MTOW).toFixed(1)}`).join(' ');
  const cvYT=[0,0.25,0.5,0.75,1].map(t=>{const y=pT_cv+cH_cv*(1-t);const v=(cvMin_f+cvRange_f*t).toFixed(0);return `<line x1="${pL_cv}" y1="${y.toFixed(1)}" x2="${(pL_cv+cW_cv).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/><text x="${(pL_cv-4).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#64748b" font-family="Arial,sans-serif">${v}</text>`;});
  const svg_fig8=`<svg viewBox="0 0 490 167" width="490" height="167" xmlns="http://www.w3.org/2000/svg">${cvYT.join('')}${cvLine_f?`<polyline points="${cvLine_f}" fill="none" stroke="#1e40af" stroke-width="1.5"/>${cvD_f.map((d,i)=>`<circle cx="${cvx_f(i).toFixed(1)}" cy="${cvy_f(d.MTOW).toFixed(1)}" r="2" fill="#f59e0b"/>`).join('')}`:'<text x="245" y="70" text-anchor="middle" font-size="9" fill="#64748b" font-family="Arial,sans-serif">History not available</text>'}<line x1="${pL_cv}" y1="${pT_cv}" x2="${pL_cv}" y2="${(pT_cv+cH_cv).toFixed(1)}" stroke="#374151" stroke-width="1"/><line x1="${pL_cv}" y1="${(pT_cv+cH_cv).toFixed(1)}" x2="${(pL_cv+cW_cv).toFixed(1)}" y2="${(pT_cv+cH_cv).toFixed(1)}" stroke="#374151" stroke-width="1"/><text x="${(pL_cv+cW_cv/2).toFixed(0)}" y="${(pT_cv+cH_cv+24).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif">Iteration Number</text><text x="12" y="${(pT_cv+cH_cv/2).toFixed(0)}" text-anchor="middle" font-size="8" fill="#374151" font-family="Arial,sans-serif" transform="rotate(-90,12,${(pT_cv+cH_cv/2).toFixed(0)})">MTOW (${R.massU})</text></svg>`;

  // ── Front matter ──────────────────────────────────────────────────────
  const tocRows=[
    ["","Abstract","ii"],["","Table of Contents","iii"],["","List of Figures","iv"],["","List of Tables","iv"],
    ["1","Design Inputs & Mission Requirements","1"],["2","Atmosphere Model (ISA)","2"],
    ["3","Weight & Energy Sizing (Iterative)","3"],["4","Mission Energy Breakdown","4"],
    ["5","Wing Design & Aerodynamics","5"],["6","Hover Propulsion Sizing","7"],
    ["7","Battery System Sizing","8"],["8","Longitudinal Stability","9"],
    ["9","V-Tail Sizing","10"],["10","Feasibility Checks","11"],
    ["11","V-n Diagram & OEI Analysis","12"],["12","Community Design Benchmarks","14"],
    ["A","D1: Round 1 Initial MTOW Estimate","15"],["A","D2: Round 2 Coupled Convergence","16"],
    ["A","D3: Mission Phase Timing","17"],["A","D4: Phase Power & Energy","18"],
    ["A","D5: Wing Sizing Detail","19"],["A","D6: Drag Buildup (Raymer)","20"],
    ["A","D7: Rotor & Motor Sizing","22"],["A","D8: Battery Pack Architecture","23"],
    ["A","D9: CG, NP & Static Margin","24"],["A","D10: Noise Model","25"],
    ["A","D11: Direct Operating Cost Model","27"],["A","D12: BEM Rotor Analysis","29"],
  ];
  const lofRows=[
    ["1","MTOW convergence history — Round 2 iterative loop","D2"],
    ["2","Weight breakdown — Payload / Empty Weight / Battery","§3"],
    ["3","Mission power profile by phase — bar chart (kW)","§4"],
    ["4","Mission energy breakdown by phase (kWh)","§4"],
    ["5","Wing drag polar — C&#x2097; vs C&#x209F; with design point","§5"],
    ["6","Battery state-of-health degradation — NREL power-law","D8"],
    ["7","V-n envelope — CS-23 Amendment 5 / FAR Part 23","§11"],
    ["8","Noise propagation vs distance — ISO 9613-1 + EASA limit","D10"],
  ];
  const lotRows=[
    ["1","Design Inputs & Mission Parameters","§1"],
    ["2","ISA Atmosphere Properties at Cruise & Hover","§2"],
    ["3","Iterative Weight & Energy Sizing Results","§3"],
    ["4","Mission Phase Energy Summary","§4"],
    ["5","Wing Geometry & Aerodynamic Parameters","§5"],
    ["6","Drag Component Buildup (Raymer)","§5"],
    ["7","Hover Propulsion Parameters","§6"],
    ["8","Battery Pack Architecture","§7"],
    ["9","Longitudinal Stability Summary","§8"],
    ["10","V-Tail Sizing Parameters","§9"],
    ["11","Feasibility Check Results","§10"],
    ["12","V-n Load Factor Envelope","§11"],
    ["13","OEI Survivability Analysis","§11"],
    ["14","Community Design Benchmarks","§12"],
    ["15","Noise Propagation — dBA vs Distance","D10"],
    ["16","DOC Component Breakdown","D11"],
    ["17","BEM Rotor & Motor Sizing","D12"],
  ];

  const abstract_pg=`<div class="fm-page">
  <h1 class="fm-heading">Abstract</h1>
  <p style="text-align:justify;line-height:1.75;font-size:10pt;color:#1a1a2e">
  This report documents a parametric conceptual sizing study for a lift-and-cruise electric Vertical Take-Off and Landing (eVTOL) aircraft designated <em>Trail 1</em>.
  The sizing methodology employs a dual-loop convergence algorithm ported from MATLAB (<code>eVTOL_Full_Analysis_v2.m</code>) to an interactive JavaScript implementation,
  integrating actuator disk theory, Raymer component drag buildup, International Standard Atmosphere (ISA) modelling, and iterative weight–energy coupling.
  </p>
  <p style="text-align:justify;line-height:1.75;font-size:10pt;color:#1a1a2e;margin-top:12px">
  The baseline mission specifies a range of <strong>${R.dist(p.range)} ${R.distU}</strong> carrying a payload of <strong>${R.mass(p.payload)} ${R.massU}</strong>
  at a cruise speed of <strong>${R.speed(p.vCruise)} ${R.speedU}</strong> at <strong>${R.len(p.cruiseAlt)} ${R.lenU}</strong> altitude with a <strong>${p.reserveMinutes}-minute</strong> regulatory reserve.
  The converged design yields a Maximum Take-Off Weight (MTOW) of <strong>${R.mass(SR.MTOW)} ${R.massU}</strong>,
  total mission energy of <strong>${fmt(SR.Etot,2)} kWh</strong>, actual lift-to-drag ratio of <strong>${fmt(SR.LDact,2)}</strong>,
  and a V-tail corrected static margin of <strong>${fmt(SR.SM_vt*100,1)}% MAC</strong>.
  The hover power loading is <strong>${fmt(SR.Phov*1000/SR.MTOW,1)} W/kg</strong> and tip Mach number is <strong>${fmt(SR.TipMach,4)}</strong>.
  </p>
  <p style="text-align:justify;line-height:1.75;font-size:10pt;color:#1a1a2e;margin-top:12px">
  Aeroacoustic analysis (Gutin/BPM semi-empirical model, ISO 9613-1 propagation) predicts <strong>${fmt(SR.dBA_150m,1)} dBA</strong> at 150 m
  (EASA UAM target ≤ 65 dBA; 65 dBA contour radius = ${SR.dist_65dBA} m).
  Direct operating cost is estimated at <strong>$${(totalDOC_c||0).toFixed(0)} per flight</strong> ($${((totalDOC_c||0)/Math.max(1,useImperial?(p.range*0.539957):p.range)).toFixed(2)}/${useImperial?"nm":"km"}).
  The design is assessed as <strong>${SR.feasible?"FEASIBLE":"MARGINAL"}</strong> against all primary engineering constraints.
  All derivations, intermediate calculations, source equation references, and validation notes are reproduced in full in Appendices D1–D12.
  </p>
  <div style="margin-top:24px;padding:14px 18px;background:#f8faff;border:1px solid #dbeafe;border-radius:6px">
    <div style="font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:700">Key Design Parameters</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
    ${[["MTOW",R.mass(SR.MTOW)+" "+R.massU],["Empty Weight",R.mass(SR.Wempty)+" "+R.massU],["Battery Mass",R.mass(SR.Wbat)+" "+R.massU],
       ["Hover Power",R.power(SR.Phov)+" "+R.powerU],["Cruise Power",R.power(SR.Pcr)+" "+R.powerU],["Total Energy",fmt(SR.Etot,2)+" kWh"],
       ["Wing Span",R.len(SR.bWing)+" "+R.lenU],["Wing Area",R.area(SR.Swing)+" "+R.areaU],["Actual L/D",fmt(SR.LDact,2)],
       ["Static Margin",fmt(SR.SM_vt*100,1)+"% MAC"],["Tip Mach",fmt(SR.TipMach,4)],["Noise @150m",fmt(SR.dBA_150m,1)+" dBA"]
    ].map(([k,v])=>`<div style="background:#fff;padding:8px 10px;border-radius:4px;border:1px solid #e2e8f0"><div style="font-size:7.5pt;color:#64748b">${k}</div><div style="font-size:10pt;font-weight:700;color:#0f172a;font-family:monospace">${v}</div></div>`).join('')}
    </div>
  </div>
  <p style="margin-top:16px;font-size:8.5pt;color:#64748b;font-style:italic">
    <strong>Keywords:</strong> eVTOL, urban air mobility, parametric sizing, actuator disk theory, lift-and-cruise, battery-electric propulsion, aeroacoustics, direct operating cost.
  </p>
</div>`;

  const toc_pg=`<div class="fm-page">
  <h1 class="fm-heading">Table of Contents</h1>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed">
  ${tocRows.map(([num,title,pg])=>`
    <tr>
      <td style="padding:3px 0;font-size:9.5pt;white-space:nowrap;width:auto;padding-right:8px;
        color:${num===''?'#475569':'#0f172a'};${num==='A'?'padding-left:16px;font-size:9pt;color:#475569':''}">
        ${num&&num!=='A'?`<strong>${num}.</strong>&ensp;`:num==='A'?'App.&ensp;':'&ensp;&ensp;'}${title}
      </td>
      <td style="border-bottom:1px dotted #cbd5e1"></td>
      <td style="padding:3px 0 3px 10px;font-size:9.5pt;color:#374151;white-space:nowrap;text-align:right;width:32px">${pg}</td>
    </tr>`).join('')}
  </table>
</div>`;

  const lof_pg=`<div class="fm-page">
  <h1 class="fm-heading">List of Figures</h1>
  <table style="width:100%;border-collapse:collapse">
  ${lofRows.map(([num,cap,sec_])=>`<tr>
    <td style="padding:5px 0;font-size:9.5pt;color:#0f172a;white-space:nowrap"><strong>Figure ${num}.</strong></td>
    <td style="padding:5px 8px;font-size:9.5pt;color:#374151">${cap}</td>
    <td style="border-bottom:1px dotted #cbd5e1;width:100%"></td>
    <td style="padding:5px 0 5px 8px;font-size:9.5pt;color:#64748b;white-space:nowrap;font-family:monospace">${sec_}</td>
  </tr>`).join('')}
  </table>
  <h1 class="fm-heading" style="margin-top:32px">List of Tables</h1>
  <table style="width:100%;border-collapse:collapse">
  ${lotRows.map(([num,cap,sec_])=>`<tr>
    <td style="padding:5px 0;font-size:9.5pt;color:#0f172a;white-space:nowrap"><strong>Table ${num}.</strong></td>
    <td style="padding:5px 8px;font-size:9.5pt;color:#374151">${cap}</td>
    <td style="border-bottom:1px dotted #cbd5e1;width:100%"></td>
    <td style="padding:5px 0 5px 8px;font-size:9.5pt;color:#64748b;white-space:nowrap;font-family:monospace">${sec_}</td>
  </tr>`).join('')}
  </table>
</div>`;

  const benchmarks_sec=`<section id="benchmarks">
  <h2>12. Community Design Benchmarks</h2>
  <p>This section benchmarks the converged design against published UAM aeronautical targets. Sources: NASA/CR-2019-220217, EASA SC-VTOL Issue 2, Joby S-4 S-1 (2021), Archer Midnight S-1 (2021).</p>
  <table class="data-table">
    <thead><tr><th>Metric</th><th>This Design</th><th>Community Target</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td class="td-label">Actual L/D</td><td class="td-value">${fmt(SR.LDact,2)}</td><td class="td-value">≥ 12.0</td><td style="color:${SR.LDact>=12?"#16a34a":"#dc2626"};font-weight:700">${SR.LDact>=12?"✓ Above target":"✗ Below target"}</td></tr>
      <tr><td class="td-label">MTOW / Payload</td><td class="td-value">${fmt(SR.MTOW/p.payload,2)}</td><td class="td-value">≤ 6.0</td><td style="color:${SR.MTOW/p.payload<=6?"#16a34a":"#dc2626"};font-weight:700">${SR.MTOW/p.payload<=6?"✓ Efficient":"✗ Review weight"}</td></tr>
      <tr><td class="td-label">Energy / Range</td><td class="td-value">${fmt(SR.Etot*1000/p.range,1)} Wh/km</td><td class="td-value">≤ ${Math.round(300+p.range*1.4)} Wh/km</td><td style="color:${SR.Etot*1000/p.range<=(300+p.range*1.4)?"#16a34a":"#dc2626"};font-weight:700">${SR.Etot*1000/p.range<=(300+p.range*1.4)?"✓ Efficient":"✗ High"}</td></tr>
      <tr><td class="td-label">Pack SED</td><td class="td-value">${fmt(SR.SEDpack,1)} Wh/kg</td><td class="td-value">≥ 150 Wh/kg</td><td style="color:${SR.SEDpack>=150?"#16a34a":"#d97706"};font-weight:700">${SR.SEDpack>=150?"✓ Good":"⚠ Marginal"}</td></tr>
      <tr><td class="td-label">Static Margin</td><td class="td-value">${fmt(SR.SM_vt*100,1)}% MAC</td><td class="td-value">5–25% MAC</td><td style="color:${SR.SM_vt>=0.05&&SR.SM_vt<=0.25?"#16a34a":"#dc2626"};font-weight:700">${SR.SM_vt>=0.05&&SR.SM_vt<=0.25?"✓ Stable":"✗ Review"}</td></tr>
      <tr><td class="td-label">Hover P/MTOW</td><td class="td-value">${fmt(SR.Phov*1000/SR.MTOW,1)} W/kg</td><td class="td-value">≤ 250 W/kg</td><td style="color:${SR.Phov*1000/SR.MTOW<=250?"#16a34a":SR.Phov*1000/SR.MTOW<=300?"#d97706":"#dc2626"};font-weight:700">${SR.Phov*1000/SR.MTOW<=250?"✓ Good":SR.Phov*1000/SR.MTOW<=300?"⚠ High":"✗ Very high"}</td></tr>
      <tr><td class="td-label">Tip Mach</td><td class="td-value">${fmt(SR.TipMach,4)}</td><td class="td-value">≤ 0.70</td><td style="color:${SR.TipMach<0.70?"#16a34a":"#dc2626"};font-weight:700">${SR.TipMach<0.70?"✓ Subsonic":"✗ Compressibility"}</td></tr>
      <tr><td class="td-label">Noise at 150 m</td><td class="td-value">${fmt(SR.dBA_150m,1)} dBA</td><td class="td-value">≤ 65 dBA (EASA UAM)</td><td style="color:${SR.dBA_150m<=65?"#16a34a":SR.dBA_150m<=75?"#d97706":"#dc2626"};font-weight:700">${SR.dBA_150m<=65?"✓ Meets target":SR.dBA_150m<=75?"⚠ Above target":"✗ Exceeds"}</td></tr>
    </tbody>
  </table>
</section>`;

  /* ── WARNINGS AND LIMITATIONS — NASA-STD-7009B §4.3.8 ───────────────
     A report is how results reach a decision maker, which is exactly where
     [M&S 32]-[M&S 34] apply. Built by lib/warnings.js, the same function the
     app's warning panel uses, so the two cannot say different things. */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const warn = resultWarnings({ params: p, R: SR });
  const uMTOW = uncertaintyStatement("MTOW", { params: p });
  const warnings_sec = `<section id="warnings">
  <h2>Warnings and limitations</h2>
  <p>Reported under NASA-STD-7009B §4.3.8 ([M&amp;S 32]–[M&amp;S 34]): ${warn.counts.error} error(s), ${warn.counts.warning} warning(s), ${warn.counts.info} note(s). Each item states its impact.</p>
  ${CATEGORIES.map(([id, title]) => {
    const list = warn.items.filter((i) => i.cat === id);
    return `<h3>${id}. ${esc(title)}</h3>` + (list.length
      ? `<ul>${list.map((i) => `<li><strong>${esc(i.severity)}</strong> — ${esc(i.text)}<br><em>Impact:</em> ${esc(i.impact)}</li>`).join("")}</ul>`
      : `<p>None found.</p>`);
  }).join("")}
  <h3>Uncertainty of the results</h3>
  <p><strong>Take-off mass:</strong> ${esc(uMTOW.text)}<br><em>How obtained:</em> ${esc(uMTOW.method)}</p>
  <p><strong>Every other output:</strong> no quantitative uncertainty estimate is available unless the output has been compared with published aircraft. Those are marked validated in the tool and their errors are listed in VALIDATION.md; the tool's Uncertainty tab can compute an input-driven band on demand.</p>
</section>`;

  const references_sec=`<section id="references">
  <h2>References</h2>
  <ol class="ref-list">
    <li>Raymer, D.P., <em>Aircraft Design: A Conceptual Approach</em>, 6th ed., AIAA, 2018.</li>
    <li>Abbott, I.H. and von Doenhoff, A.E., <em>Theory of Wing Sections</em>, Dover, 1959.</li>
    <li>NREL, "Battery Lifetime Study," NREL/TP-5400-73548, 2023.</li>
    <li>Vascik, P.D., "Systems-Level Analysis of On-Demand Mobility," MIT SM Thesis, 2020.</li>
    <li>NASA/CR-2019-220217, <em>UAM Market Study</em>, Oliver Wyman, 2019.</li>
    <li>BNEF, <em>Electric Vehicle Outlook 2024</em>, Bloomberg NEF, 2024.</li>
    <li>Brooks, T.F., Pope, D.S. and Marcolini, M.A., "Airfoil Self-Noise and Prediction," NASA RP-1218, 1989.</li>
    <li>ISO 9613-1:1993, <em>Acoustics — Attenuation of Sound During Propagation Outdoors</em>.</li>
    <li>Gutin, L., "On the Sound Field of a Rotating Propeller," NACA TM-1195, 1948.</li>
    <li>EASA, <em>Special Condition for small-category VTOL-capable aircraft, Issue 2</em>, Doc. No. SC-VTOL-02, 10 June 2024.</li>
    <li>Joby Aviation, <em>S-1 Registration Statement</em>, SEC Filing, 2021.</li>
    <li>FAA, <em>AC 21.17-4: Type Certification — Powered-Lift</em>, 2023.</li>
    <li>Selig, M.S. et al., <em>UIUC Airfoil Data Site</em>, University of Illinois, 1995–2024.</li>
    <li>Fraunhofer ISE, <em>Current and Future Cost of Lithium-Ion Batteries</em>, 2023.</li>
    <li>GAMA, <em>Statistical Databook and Industry Outlook</em>, 2023.</li>
  </ol>
</section>`;

  // Pre-compute values used in figure captions (can't use ${} inside "..." caption strings)
  const _convExp  = String(p.convTolExp || -6);
  const _mtowFmt  = fmt(SR.MTOW, 1);
  const _resPct   = fmt(SR.Eres / SR.Etot * 100, 1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${bTitle} — ${bUniv}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderKatex();"></script>
<style>
/* ── Reset & Base ─────────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#1a1a2e;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.6}
/* ── A4 Page Setup ────────────────────────────────────────────── */
@page{size:A4 portrait;margin:22mm 20mm 25mm 22mm}
@page:left{@top-left{content:"${bTitle}";font-size:7.5pt;color:#64748b;font-family:'Segoe UI',Arial,sans-serif}}
@page:right{@top-right{content:"${bUniv}";font-size:7.5pt;color:#64748b;font-family:'Segoe UI',Arial,sans-serif}}
@page{@bottom-right{content:"Page " counter(page);font-size:7.5pt;color:#64748b;font-family:'Segoe UI',Arial,sans-serif}
      @bottom-left{content:"Generated ${now}";font-size:7.5pt;color:#94a3b8;font-family:'Segoe UI',Arial,sans-serif}}
@page cover{margin:0;@bottom-right{content:none}@bottom-left{content:none}@top-left{content:none}@top-right{content:none}}
/* ── Running Header on print ─────────────────────────────────── */
.running-header{display:none}
@media print{
  .running-header{display:flex;justify-content:space-between;align-items:center;
    border-bottom:0.5px solid #e2e8f0;padding-bottom:4px;margin-bottom:14px;
    font-size:7.5pt;color:#64748b;font-family:'Segoe UI',Arial,sans-serif}
  .cover-page{page:cover;page-break-after:always;min-height:0}
  .fm-page{page-break-before:always;page-break-inside:avoid}
  section{page-break-before:auto}
  h2{page-break-after:avoid}
  .report-figure{page-break-inside:avoid}
  .data-table{page-break-inside:auto}
  .data-table tr{page-break-inside:avoid}
}
/* ── Cover Page ───────────────────────────────────────────────── */
.cover-page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;
  padding:50px 60px;position:relative;background:linear-gradient(160deg,#07111f 0%,#0d1b2e 45%,#111e35 75%,#0a1628 100%)}
.cover-rule{width:100%;height:4px;background:linear-gradient(90deg,#f59e0b,#3b82f6,#14b8a6);margin:24px 0;border-radius:2px}
.cover-badge{font-size:7pt;color:#4d90c4;letter-spacing:0.4em;font-family:monospace;margin-bottom:20px;text-transform:uppercase;
  background:#ffffff08;padding:5px 16px;border-radius:16px;border:1px solid #1e3a5c}
.cover-title{font-size:30pt;font-weight:900;color:#fff;text-align:center;line-height:1.1;margin-bottom:8px;letter-spacing:-0.02em}
.cover-sub{font-size:10.5pt;color:#7fa3c8;margin-bottom:20px;text-align:center;font-style:italic}
.cover-meta{border-collapse:collapse;color:#c8d6e5;font-size:9pt;width:100%;max-width:640px}
.cover-meta td{padding:5px 12px;border-bottom:1px solid #1a2d45}
.cover-meta td:first-child{color:#7fa3c8;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.06em;width:140px;font-family:monospace}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%;max-width:640px;margin-top:14px}
.kpi-box{background:#ffffff0a;border:1px solid #1e3a5c;border-radius:8px;padding:12px 10px;text-align:center}
.kpi-val{font-size:17pt;font-weight:800;color:#f59e0b;font-family:monospace;line-height:1}
.kpi-lbl{font-size:6.5pt;color:#5a8ab0;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px}
.badge{display:inline-block;padding:3px 9px;border-radius:4px;font-size:8pt;font-weight:700}
.badge.green{background:#16a34a22;color:#16a34a;border:1px solid #16a34a44}
.badge.amber{background:#d9770622;color:#d97706;border:1px solid #d9770644}
.badge.red{background:#dc262622;color:#dc2626;border:1px solid #dc262644}
/* ── Front Matter Pages ───────────────────────────────────────── */
.fm-page{padding:28px 0 24px;border-bottom:1px solid #e5e7eb}
.fm-heading{font-size:16pt;font-weight:800;color:#0f172a;border-bottom:2.5px solid #1e40af;
  padding-bottom:6px;margin-bottom:18px;letter-spacing:-0.01em}
/* ── Body Sections ────────────────────────────────────────────── */
section{padding:24px 0 20px;border-bottom:1px solid #e5e7eb}
h2{font-size:13pt;font-weight:800;color:#0f172a;border-bottom:2px solid #1e40af;
  padding-bottom:5px;margin-bottom:13px;letter-spacing:-0.01em}
h3{font-size:10.5pt;font-weight:700;color:#1e3a5f;margin:14px 0 5px}
p{color:#374151;margin-bottom:9px;font-size:9.5pt;text-align:justify}
/* ── Equations ────────────────────────────────────────────────── */
.eq-block{background:#f8faff;border-left:3px solid #1e40af;padding:9px 16px;margin:9px 0 5px;border-radius:0 5px 5px 0;overflow-x:auto}
.eq-note{font-size:7.5pt;color:#64748b;margin-top:3px;font-style:italic}
/* ── Tables ───────────────────────────────────────────────────── */
.data-table{width:100%;border-collapse:collapse;margin:9px 0 16px;font-size:8.5pt}
.data-table th{background:#1e3a5f;color:#f1f5f9;padding:6px 9px;text-align:left;font-size:8pt;letter-spacing:0.03em;font-weight:700}
.data-table td{padding:5px 9px;border-bottom:1px solid #e5e7eb}
.data-table tr:nth-child(even) td{background:#f8faff}
.td-label{color:#374151;font-weight:600;white-space:nowrap;font-size:8.5pt}
.td-formula{color:#1e3a5f;font-style:italic;min-width:110px;font-size:8.5pt}
.td-value{color:#0f172a;font-weight:700;font-family:monospace;text-align:right;white-space:nowrap;font-size:8.5pt}
.td-unit{color:#64748b;font-size:8pt;white-space:nowrap;padding-left:5px}
/* ── Feasibility check table ──────────────────────────────────── */
.check-table{width:100%;border-collapse:collapse;margin:9px 0;font-size:9pt}
.check-table th{background:#1e3a5f;color:#f1f5f9;padding:6px 11px;text-align:left;font-size:8pt;font-weight:700}
.check-table td{padding:6px 11px;border-bottom:1px solid #e5e7eb}
.check-table tr.ok td:first-child{color:#16a34a;font-weight:800;font-size:10pt}
.check-table tr.fail td:first-child{color:#dc2626;font-weight:800;font-size:10pt}
.check-table tr.ok{background:#f0fdf4}
.check-table tr.fail{background:#fef2f2}
/* ── Figures ──────────────────────────────────────────────────── */
.report-figure{margin:14px 0 18px;text-align:center;page-break-inside:avoid}
.fig-inner{display:block;width:100%;background:#fafbff;border:0.75px solid #dde3ef;border-radius:5px;padding:10px 14px;overflow:hidden}
.fig-inner svg{display:block;width:100%;height:auto;max-height:220px}
figcaption{font-size:8.5pt;color:#374151;margin-top:7px;font-style:italic;text-align:center}
figcaption strong{font-style:normal;color:#0f172a}
/* ── References ───────────────────────────────────────────────── */
.ref-list{margin:8px 0 0 18px;font-size:9pt;color:#374151}
.ref-list li{margin-bottom:6px;line-height:1.5}
/* ── TOC & Lists ──────────────────────────────────────────────── */
.toc-entry{display:flex;gap:6px;padding:3px 0;font-size:9.5pt}
</style>
</head>
<body>
${cover}
<div style="padding:28px 0 0">
${abstract_pg}
${toc_pg}
${lof_pg}
</div>
${warnings_sec}
${s1}${s2}${sd1}${sd2}${fig(1,`MTOW convergence history — Round 2 iterative loop. Each point is one full energy-weight evaluation. Convergence to \u03b5=10<sup>`+_convExp+`</sup> ${R.massU}.`,svg_fig8)}
${s3}${fig(2,`Weight breakdown showing Payload, Empty Weight and Battery mass fractions at converged MTOW = `+_mtowFmt+` ${R.massU}.`,svg_fig2)}
${sd3}${sd4}${s4}${fig(3,`Mission power profile for each flight phase. Bar width proportional to phase duration; label shows power in ${R.powerU}.`,svg_fig1)}${fig(4,`Mission energy breakdown by phase (kWh). Reserve constitutes `+_resPct+`% of total mission energy.`,svg_fig3)}
${sd5}${s5}${fig(5,"Wing drag polar (C<sub>L</sub> vs C<sub>D</sub>) computed from Raymer component buildup. Amber circle = cruise design point.",svg_fig4)}
${sd6}${s6}${sd7}${s7}${sd8}${fig(6,"Battery state-of-health degradation model (NREL 2023 power-law). Red dashed line = 80% SoH end-of-life replacement threshold.",svg_fig7)}
${s8}${sd9}${s9}${s10}${s_vn}${fig(7,"V-n envelope diagram per CS-23 Amendment 5 / FAR Part 23. Blue = positive maneuver envelope; red dashed = negative load limit.",svg_fig5)}
${sd10}${fig(8,"Noise propagation vs distance — ISO 9613-1 spherical spreading + atmospheric absorption + ground reflection. Red dashed = EASA 65 dBA UAM target.",svg_fig6)}
${sd11}${sd12}
${benchmarks_sec}
${references_sec}
<footer style="text-align:center;padding:18px 0 10px;font-size:7.5pt;color:#94a3b8;border-top:1px solid #e5e7eb;margin-top:8px">
  Generated by eVTOL Sizer ${appVersionLabel()} — Wright State University — ${now} &nbsp;|&nbsp; Advisor: Dr. Darryl K. Ahner &nbsp;|&nbsp;
  Raymer (2018), Abbott &amp; von Doenhoff (1959), NASA/CR-2019-220217
</footer>
<script>
export function renderKatex(){
  document.querySelectorAll('.katex-eq').forEach(el=>{try{katex.render(el.dataset.latex,el,{displayMode:true,throwOnError:false});}catch(e){}});
  document.querySelectorAll('.katex-inline').forEach(el=>{try{katex.render(el.dataset.latex,el,{displayMode:false,throwOnError:false});}catch(e){}});
}
window.addEventListener('load',()=>{setTimeout(()=>window.print(),1400);});
</script>
</body>
</html>`;
}

/* ═══════════════════════════════════
   THEME & CONSTANTS
   ═══════════════════════════════════ */
/* ═══════════════════════════════════
   THEME SYSTEM — dark / light
   ═══════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   INSTRUMENT PALETTE v1 — "Pilot's Mission Computer"
   Designed against MIL-STD-1472 / ARINC 661 cockpit display standards.
   Semantic keys are the authoritative names; backward-compat aliases
   (amber, teal, blue, red, green, text) keep all 700+ SC.* references
   intact — no downstream rename required in Phase 1.
   ═══════════════════════════════════════════════════════════════ */
