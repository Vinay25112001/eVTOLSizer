import { useState, useRef } from "react";

import { GROQ_MODEL_LARGE } from "./lib/ai-model.js";
/* ═══════════════════════════════════════════════════════════════════════
   VERIFIED COMPONENT DATABASE — specs from official datasheets
   Sources: EMRAX datasheets (2024), H3X Technologies (Oct 2024),
   Pipistrel/Textron, Molicel datasheet INR21700P45B-01,
   Samsung SDI, LG Energy Solution, CATL, Amprius, QuantumScape,
   Cascadia Motion, Unitek, Parker Hannifin
   ═══════════════════════════════════════════════════════════════════════ */
const DB = {
  motors: [
    {
      id:"emrax-188", name:"EMRAX 188", mfr:"EMRAX", badge:"Certified-class",
      type:"Axial Flux PMSM", peakKW:60, contKW:36, massKg:8.7,
      spKWkg:6.9, effPct:96, maxRPM:6500, voltage:"50–710 V",
      cooling:"Air / Liquid", year:2024,
      notes:"Compact 188 mm axial flux. Lightest in EMRAX range. Common on smaller eVTOL and UAVs. Stacking option for higher power.",
      url:"https://emrax.com/e-motors/emrax-188/",
      apply:{ etaSys:0.92, label:"EMRAX 188 — η_sys=0.92" }
    },
    {
      id:"emrax-228", name:"EMRAX 228", mfr:"EMRAX", badge:"Most Used",
      type:"Axial Flux PMSM", peakKW:124, contKW:75, massKg:13.2,
      spKWkg:9.4, effPct:96, maxRPM:6500, voltage:"50–710 V",
      cooling:"Air / Liquid / Combined", year:2024,
      notes:"Industry workhorse for 4–6-seat eVTOL. 228 mm diameter, 86 mm axial length. Stackable. 96% peak efficiency. Used in dozens of demonstrators.",
      url:"https://emrax.com/e-motors/emrax-228/",
      apply:{ etaSys:0.93, label:"EMRAX 228 — η_sys=0.93" }
    },
    {
      id:"emrax-268", name:"EMRAX 268", mfr:"EMRAX", badge:"High Efficiency",
      type:"Axial Flux PMSM", peakKW:210, contKW:120, massKg:20.5,
      spKWkg:10.2, effPct:98, maxRPM:4500, voltage:"50–710 V",
      cooling:"Air / Liquid / Combined", year:2024,
      notes:"Best-in-range efficiency at 98%. 268 mm diameter. Preferred for high-power hover rotors where thermal margin matters.",
      url:"https://emrax.com/e-motors/emrax-268/",
      apply:{ etaSys:0.94, label:"EMRAX 268 — η_sys=0.94" }
    },
    {
      id:"emrax-348", name:"EMRAX 348", mfr:"EMRAX", badge:"Max Power",
      type:"Axial Flux PMSM", peakKW:340, contKW:200, massKg:29.0,
      spKWkg:11.7, effPct:98, maxRPM:3500, voltage:"50–710 V",
      cooling:"Air / Liquid / Combined", year:2024,
      notes:"Largest EMRAX production motor. 340 kW peak, suitable for tilt-rotor class eVTOL. Stacking option to 680 kW.",
      url:"https://emrax.com/e-motors/emrax-348/",
      apply:{ etaSys:0.94, label:"EMRAX 348 — η_sys=0.94" }
    },
    {
      id:"h3x-hpdm-250", name:"H3X HPDM-250", mfr:"H3X Technologies", badge:"Highest Density",
      type:"Integrated Motor Drive", peakKW:250, contKW:200, massKg:15.0,
      spKWkg:13.3, effPct:92.9, maxRPM:20000, voltage:"400–800 V",
      cooling:"Liquid", year:2024,
      notes:"Integrated motor + inverter + optional 4:1 gearbox (+3 kg). 13.3 kW/kg continuous — 3× state-of-art. AM copper stator coils. Tested 180 kW Oct 2024. Lockheed Martin backed.",
      url:"https://www.h3x.tech",
      apply:{ etaSys:0.93, label:"H3X HPDM-250 — η_sys=0.93" }
    },
    {
      id:"pipistrel-e811", name:"E-811", mfr:"Pipistrel (Textron)", badge:"EASA Certified",
      type:"Radial Flux PMSM", peakKW:95, contKW:57.6, massKg:22.7,
      spKWkg:2.5, effPct:95.8, maxRPM:2400, voltage:"400 V DC",
      cooling:"Air", year:2021,
      notes:"First EASA-certified electric aircraft motor. Direct-drive propeller. Lower power density than axial-flux but airworthy certification removes regulatory risk.",
      url:"https://www.pipistrel-aircraft.com",
      apply:{ etaSys:0.91, label:"Pipistrel E-811 — η_sys=0.91" }
    },
    {
      id:"magnix-magni500", name:"Magni500", mfr:"Magnix", badge:"Proven Flight",
      type:"Radial Flux PMSM", peakKW:560, contKW:375, massKg:130,
      spKWkg:2.9, effPct:93, maxRPM:1900, voltage:"540 V",
      cooling:"Liquid", year:2023,
      notes:"Flew world's first commercial electric aircraft (Harbour Air, 2019). Heavy for eVTOL hover — better for regional fixed-wing conversion. Benchmark reference.",
      url:"https://magnix.aero",
      apply:{ etaSys:0.90, label:"Magnix Magni500 — η_sys=0.90" }
    },
    {
      id:"joby-est", name:"Joby S-4 Motor (est.)", mfr:"Joby Aviation", badge:"Production 2025",
      type:"Axial Flux PMSM", peakKW:235, contKW:100, massKg:7.5,
      spKWkg:13.3, effPct:96, maxRPM:8000, voltage:"Proprietary",
      cooling:"Liquid", year:2024,
      notes:"Estimated from S-1 SEC filing. 6 motors per aircraft, 3 forward + 3 aft tiltrotors. Not commercially available — included as design benchmark.",
      url:"https://www.jobyaviation.com",
      apply:{ etaSys:0.94, label:"Joby S-4 class — η_sys=0.94" }
    },
  ],

  batteries: [
    {
      id:"molicel-p45b", name:"INR21700-P45B", mfr:"Molicel", badge:"Best eVTOL Cell",
      type:"NMC 21700", sedCellWhkg:242, sedPackWhkg:194,
      capAh:4.5, voltV:3.6, maxCRate:10, cycleLife:800, massG:70, year:2024,
      notes:"Ranked #1 for eVTOL by 2025 MDPI feasibility study (300 cells compared). 242 Wh/kg cell / 10C max discharge. Ideal balance of power and energy. Production cell — available now.",
      url:"https://www.molicel.com/inr-21700-p45b/",
      apply:{ sedCell:242, cRateDerate:0.06, label:"Molicel P45B — 242 Wh/kg, 10C" }
    },
    {
      id:"samsung-50e", name:"INR21700-50E", mfr:"Samsung SDI", badge:"High Energy",
      type:"NMC 21700", sedCellWhkg:265, sedPackWhkg:212,
      capAh:5.0, voltV:3.6, maxCRate:2, cycleLife:500, massG:68, year:2023,
      notes:"Highest energy density production 21700 cell. 265 Wh/kg but only 2C max — limits hover power. Best for range-optimised cruise-dominant designs.",
      url:"https://www.samsungsdi.com",
      apply:{ sedCell:265, cRateDerate:0.10, label:"Samsung 50E — 265 Wh/kg, 2C" }
    },
    {
      id:"lg-m50lt", name:"INR21700-M50LT", mfr:"LG Energy Solution", badge:"Cold Ops",
      type:"NMC 21700", sedCellWhkg:263, sedPackWhkg:210,
      capAh:5.0, voltV:3.6, maxCRate:3.5, cycleLife:600, massG:68, year:2023,
      notes:"Low-temperature variant: rated to −30°C. 263 Wh/kg at 3.5C. Best for cold-climate operations (mountain airports, Nordic routes).",
      url:"https://www.lgensol.com",
      apply:{ sedCell:263, cRateDerate:0.09, label:"LG M50LT — 263 Wh/kg, 3.5C" }
    },
    {
      id:"panasonic-21700t", name:"NCR21700T", mfr:"Panasonic / Tesla", badge:"Long Life",
      type:"NCA 21700", sedCellWhkg:260, sedPackWhkg:208,
      capAh:4.8, voltV:3.6, maxCRate:4, cycleLife:1000, massG:68, year:2023,
      notes:"NCA chemistry gives best calendar aging (~5%/yr). 260 Wh/kg at 4C. Proven in Tesla Model 3/Y production — excellent supply chain.",
      url:"https://www.panasonic.com",
      apply:{ sedCell:260, cRateDerate:0.08, label:"Panasonic NCR21700T — 260 Wh/kg" }
    },
    {
      id:"catl-qilin", name:"Qilin CTP 3.0", mfr:"CATL", badge:"Best Pack Density",
      type:"NMC Pack-level", sedCellWhkg:315, sedPackWhkg:255,
      capAh:null, voltV:3.7, maxCRate:6, cycleLife:1000, massG:null, year:2024,
      notes:"CATL's 3rd-gen cell-to-pack. 255 Wh/kg at pack level — highest production pack density (2024). 6C ultra-fast charge. 72% volume utilisation. Li Auto Mega EV uses this.",
      url:"https://www.catl.com",
      apply:{ sedCell:315, cRateDerate:0.07, label:"CATL Qilin — 315 Wh/kg cell, 255 pack" }
    },
    {
      id:"amprius-simax", name:"SiMaxx™ Ultra", mfr:"Amprius Technologies", badge:"Silicon Anode",
      type:"Si-Anode NMC", sedCellWhkg:450, sedPackWhkg:360,
      capAh:null, voltV:3.8, maxCRate:5, cycleLife:400, massG:null, year:2024,
      notes:"Silicon anode cells at 450 Wh/kg cell. In production for Airbus Zephyr HAPS / stratospheric UAV. Limited cycle life (400 cycles to 80%). Game-changer for range but expensive.",
      url:"https://amprius.com",
      apply:{ sedCell:450, cRateDerate:0.12, label:"Amprius SiMaxx — 450 Wh/kg" }
    },
    {
      id:"quantumscape-qse5", name:"QSE-5 Solid State", mfr:"QuantumScape", badge:"Near-Future",
      type:"Solid-State Li-Metal", sedCellWhkg:400, sedPackWhkg:320,
      capAh:null, voltV:4.0, maxCRate:4, cycleLife:1000, massG:null, year:2025,
      notes:"Solid ceramic separator, no flammable electrolyte. 15-min 0→80% charge. VW pilot sampling 2025. Aviation variant in development. No liquid — aviation safety advantage.",
      url:"https://www.quantumscape.com",
      apply:{ sedCell:400, cRateDerate:0.05, label:"QuantumScape QSE-5 — 400 Wh/kg" }
    },
    {
      id:"solid-power-assb", name:"All-Solid-State EV", mfr:"Solid Power (BMW/Ford)", badge:"Near-Future",
      type:"All-Solid-State", sedCellWhkg:380, sedPackWhkg:304,
      capAh:null, voltV:3.9, maxCRate:3, cycleLife:800, massG:null, year:2025,
      notes:"BMW i7 pilot testing 2024. Bipolar stacking architecture. Combined 380 Wh/kg with improved safety. BMW targets volume production 2027.",
      url:"https://www.solidpowerbattery.com",
      apply:{ sedCell:380, cRateDerate:0.06, label:"Solid Power ASSB — 380 Wh/kg" }
    },
  ],

  inverters: [
    {
      id:"cascadia-cm200", name:"CM200DZ", mfr:"Cascadia Motion", badge:"Ultra-Efficient",
      peakKW:200, contKW:150, massKg:3.5, effPct:98, voltage:"250–800 V",
      cooling:"Liquid", year:2023,
      notes:"98% peak efficiency. Ultra-light 3.5 kg. Commonly paired with EMRAX motors. SiC MOSFET topology. Aviation/motorsport grade.",
      url:"https://www.cascadiamotion.com",
      apply:{ etaSys:0.95, label:"Cascadia CM200DZ — 98% eff" }
    },
    {
      id:"unitek-bamocar", name:"BAMOCAR-PG-D3", mfr:"Unitek", badge:"EMRAX Matched",
      peakKW:120, contKW:80, massKg:4.2, effPct:97, voltage:"50–700 V",
      cooling:"Liquid", year:2023,
      notes:"Official EMRAX partner controller. Resolver + encoder interface. Field-oriented control. Widely used in eVTOL demonstrators with EMRAX 228/268.",
      url:"https://www.unitek-online.de",
      apply:{ etaSys:0.92, label:"Unitek BAMOCAR — 97% eff" }
    },
    {
      id:"rinehart-pm100", name:"PM100DX", mfr:"Rinehart Motion", badge:"Racing-Proven",
      peakKW:100, contKW:60, massKg:2.5, effPct:97.5, voltage:"200–750 V",
      cooling:"Liquid", year:2023,
      notes:"Formula SAE / Formula E proven. 2.5 kg, robust CAN integration. Popular in university eVTOL programs and small eVTOL demonstrators.",
      url:"https://www.rmsmotion.com",
      apply:{ etaSys:0.93, label:"Rinehart PM100DX — 97.5% eff" }
    },
    {
      id:"parker-gem23", name:"GEM23 Motor Drive", mfr:"Parker Hannifin", badge:"DO-160 Qualified",
      peakKW:23, contKW:15, massKg:2.1, effPct:97, voltage:"270 V DC",
      cooling:"Conduction", year:2023,
      notes:"DO-160G environmental qualified. FAA / EASA airworthy. Used in hybrid-electric regional aircraft programs. Only commercially available aviation-certified option.",
      url:"https://www.parker.com",
      apply:{ etaSys:0.91, label:"Parker GEM23 — DO-160 certified" }
    },
  ]
};

/* ═══════════════════════════════════════════════════════════
   WEIGHT & BALANCE ENVELOPE PANEL
   ═══════════════════════════════════════════════════════════ */
export function WBEnvelopePanel({ params, SR, SC, U }) {
  const uc = U || {len:v=>+v.toFixed(3),lenU:"m",mass:v=>+v.toFixed(1),massU:"kg"};
  const fL  = params.fusLen;
  const fD  = params.fusDiam;
  const MAC = SR.MAC;

  // Stability
  const xNP_vt   = SR.xCGtotal + SR.SM_vt * MAC;
  const xCG_fwd  = xNP_vt - 0.25 * MAC;
  const xCG_aft  = xNP_vt - 0.05 * MAC;
  const xACwing  = SR.xACwing;
  const xCGtotal = SR.xCGtotal;
  const inEnv    = xCGtotal >= xCG_fwd && xCGtotal <= xCG_aft;

  // Wing geometry — same values as Wing & Aero tab
  const bHalf     = SR.bWing / 2;
  const Cr        = SR.Cr_;
  const Ct        = SR.Ct_;
  const sweep_rad = SR.sweep * Math.PI / 180;
  const xWingLE   = fL * 0.2589;
  const xTipLE    = xWingLE + bHalf * Math.tan(sweep_rad);

  // Boom/rotor layout (matches VSP generator)
  const Rrot    = params.propDiam / 2;
  const yBoom   = (fD / 2) + Rrot + 0.2;
  const yBatEnd = yBoom - 0.5;           // battery ends 0.5m before boom

  // Seat positions — shifted aft for spaciousness
  const xPilot   = fL * 0.24;
  const xRow1    = fL * 0.36;
  const xRow2    = fL * 0.50;
  const xBatVis  = fL * 0.43;   // visual centre of main battery
  const xBatPhys = fL * 0.38;   // physics CG of main battery (for calculations)

  // ── SINGLE UNIFORM SCALE — VERTICAL LAYOUT (Nose UP, Tail DOWN) ─────────
  // Pick the tighter scale so aircraft fills the canvas without clipping
  const MARG   = 48;
  const scaleW = (820 / 2 - MARG) / bHalf;   // wingspan-constrained
  const scaleH = (820   - MARG*2) / fL;       // fuselage-length-constrained
  const scale  = Math.min(scaleW, scaleH);

  // Canvas sized to exactly fit aircraft + margin
  const SVG_W  = Math.ceil(bHalf * 2 * scale + MARG * 2);
  const SVG_H  = Math.ceil(fL        * scale + MARG * 2);
  const CX     = SVG_W / 2;   // spanwise centre line

  // Centre fuselage vertically
  const fNY = (SVG_H - fL * scale) / 2;
  const fTY = fNY + fL * scale;

  // sx: longitudinal (0=nose → fL=tail) → SVG-y
  const sx = x => fNY + x * scale;
  // sy: spanwise (0=centre, +=right wing) → SVG-x
  const sy = y => CX  + y * scale;
  const xScale = scale;
  const yScale = scale;

  // CY alias used in a few label expressions
  const CY = CX;

  // ── Fuselage profile — same 5-station shape as existing CrossSectionPreview ──
  const fusSt = [
    {p:0.00,w:0.005},{p:0.06,w:0.22},{p:0.15,w:0.68},
    {p:0.35,w:1.00}, {p:0.55,w:0.96},{p:0.70,w:0.82},
    {p:0.82,w:0.52}, {p:0.92,w:0.20},{p:1.00,w:0.04},
  ];
  const fuseHW = t => {
    for (let i = 0; i < fusSt.length-1; i++) {
      const a=fusSt[i], b=fusSt[i+1];
      if (t>=a.p && t<=b.p) {
        const f=(t-a.p)/(b.p-a.p);
        return (fD/2)*(a.w+f*(b.w-a.w));
      }
    }
    return fD*0.02;
  };
  const N=64;
  // In vertical layout: sx=longitudinal(y-axis), sy=spanwise(x-axis)
  // fuselage left side (negative span) goes right-to-left on screen = negative sy
  const topPts = Array.from({length:N+1},(_,i)=>`${sy(-fuseHW(i/N)).toFixed(1)},${sx(i/N*fL).toFixed(1)}`);
  const botPts = Array.from({length:N+1},(_,i)=>`${sy(fuseHW(1-i/N)).toFixed(1)},${sx((1-i/N)*fL).toFixed(1)}`);
  const fusePoints = [...topPts,...botPts].join(' ');

  // ── Wing planform (exact same trapezoid as Wing & Aero tab) ──
  const wingPoly = sgn => [
    `${CX},${sx(xWingLE).toFixed(1)}`,
    `${sy(sgn*bHalf).toFixed(1)},${sx(xTipLE).toFixed(1)}`,
    `${sy(sgn*bHalf).toFixed(1)},${sx(xTipLE+Ct).toFixed(1)}`,
    `${CX},${sx(xWingLE+Cr).toFixed(1)}`,
  ].join(' ');

  // ── Wing battery (parallelogram, 22–72% chord, root → yBatEnd) ──
  const wingBatPoly = sgn => {
    const leE = xWingLE + yBatEnd*Math.tan(sweep_rad);
    const cE  = Cr + (Ct-Cr)*(yBatEnd/bHalf);
    return [
      `${CX},${sx(xWingLE+Cr*0.22).toFixed(1)}`,
      `${sy(sgn*yBatEnd).toFixed(1)},${sx(leE+cE*0.22).toFixed(1)}`,
      `${sy(sgn*yBatEnd).toFixed(1)},${sx(leE+cE*0.72).toFixed(1)}`,
      `${CX},${sx(xWingLE+Cr*0.72).toFixed(1)}`,
    ].join(' ');
  };

  // ── Rotor layout: (nPerSide-1) on boom  +  1 at wing tip ──
  const nPerSide    = Math.max(2, Math.round(params.nPropHover/2));
  const nBoom       = nPerSide - 1;
  const boomXFwd    = fL * 0.18;
  const boomXAft    = fL * 0.68;
  const boomXs      = Array.from({length:nBoom},(_,i)=>
    nBoom===1 ? (boomXFwd+boomXAft)/2 : boomXFwd+i*(boomXAft-boomXFwd)/(nBoom-1));
  const xTipRotor   = xTipLE + Ct*0.5;   // wing tip rotor x
  const Rrx         = Rrot*xScale;        // rotor ellipse x-radius in SVG
  const Rry         = Rrot*yScale;        // rotor ellipse y-radius in SVG

  // ── Cargo bay triangle (aft of Row2, tapers toward tail) ──
  const xCargoBase  = fL * 0.57;
  const xCargoTip   = fL * 0.84;
  const cargoHW     = fuseHW(0.57) * 0.78;
  const cargoPts    = [
    `${sy(-cargoHW).toFixed(1)},${sx(xCargoBase).toFixed(1)}`,
    `${sy( cargoHW).toFixed(1)},${sx(xCargoBase).toFixed(1)}`,
    `${CX},${sx(xCargoTip).toFixed(1)}`,
  ].join(' ');

  // ── Seat dimensions ──
  const sW = Math.max(fL*0.055*xScale, 16);
  const sH = Math.max(fD*0.27*yScale, 9);
  const mbW = fL*0.09*xScale;
  const mbH = fD*0.50*yScale;

  // ── CG markers ──
  const MARKERS = [
    {xm:xCG_fwd,  label:'FWD LIM', col:SC.red,   dash:'9,4'},
    {xm:xACwing,  label:'AC',       col:SC.green, dash:null },
    {xm:xCGtotal, label:'CG',       col:SC.amber, dash:null },
    {xm:xCG_aft,  label:'AFT LIM', col:SC.red,   dash:'9,4'},
    {xm:xNP_vt,   label:'NP',       col:SC.blue,  dash:null },
  ];
  // Sort by x for ruler display
  const sortedM = [...MARKERS].sort((a,b)=>a.xm-b.xm);

  // ── CG ruler (zoomed scale bar) ──
  const rLo = sortedM[0].xm - MAC*0.18;
  const rHi = sortedM[sortedM.length-1].xm + MAC*0.18;
  const RW  = 560, RH = 72, RL = 120;
  const rsc = RW / (rHi-rLo);
  const rx  = x => RL + (x-rLo)*rsc;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* ── Info boxes ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
        {[
          ['FWD CG Limit', uc.len(xCG_fwd)+' '+uc.lenU, 'SM = 25% MAC',  SC.red,   '#ef444420'],
          ['Wing AC',      uc.len(xACwing)+' '+uc.lenU,  'Aero centre',   SC.green, '#22c55e20'],
          ['CG at MTOW',  uc.len(xCGtotal)+' '+uc.lenU, `SM = ${(SR.SM_vt*100).toFixed(1)}%`, inEnv?SC.amber:SC.red, inEnv?'#f59e0b20':'#ef444420'],
          ['AFT CG Limit', uc.len(xCG_aft)+' '+uc.lenU, 'SM = 5% MAC',   SC.red,   '#ef444420'],
          ['Neutral Point',uc.len(xNP_vt)+' '+uc.lenU,   'V-tail corrected', SC.blue,'#3b82f620'],
        ].map(([lbl,val,sub,col,bg])=>(
          <div key={lbl} style={{background:bg,border:`1px solid ${col}44`,borderRadius:7,
            padding:'8px 10px',borderTop:`3px solid ${col}`}}>
            <div style={{fontSize:9,color:col,fontFamily:"'DM Mono',monospace",textTransform:'uppercase',
              letterSpacing:'0.07em',marginBottom:2,fontWeight:700}}>{lbl}</div>
            <div style={{fontSize:14,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
            <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:1}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Status ── */}
      <div style={{padding:'7px 14px',background:inEnv?`${SC.green}12`:`${SC.red}12`,
        border:`1px solid ${inEnv?SC.green:SC.red}44`,borderRadius:6,
        display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:18}}>{inEnv?'✓':'⚠'}</span>
        <div style={{fontSize:11,fontWeight:700,color:inEnv?SC.green:SC.red,fontFamily:'system-ui,sans-serif'}}>
          {inEnv?'CG within safe limits at MTOW':'CG outside safe limits — adjust battery or seat positions'}
          <span style={{fontSize:10,fontWeight:400,color:SC.muted,marginLeft:10,fontFamily:"'DM Mono',monospace"}}>
            Fwd margin: {uc.massU==="lb" ? ((xCGtotal-xCG_fwd)*3.28084*100).toFixed(1)+" ft·%" : ((xCGtotal-xCG_fwd)*100).toFixed(1)+" cm"} · Aft margin: {uc.massU==="lb" ? ((xCG_aft-xCGtotal)*3.28084*100).toFixed(1)+" ft·%" : ((xCG_aft-xCGtotal)*100).toFixed(1)+" cm"}
          </span>
        </div>
      </div>

      {/* ── GA diagram ── */}
      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'14px'}}>
        <div style={{fontSize:11,color:SC.muted,textTransform:'uppercase',letterSpacing:'0.08em',
          fontFamily:'system-ui,sans-serif',marginBottom:8,borderBottom:`1px solid ${SC.border}`,
          paddingBottom:5,display:'flex',justifyContent:'space-between'}}>
          <span>General Arrangement — Plan View (Nose ▲ Top · Bottom ▼ Tail)</span>
          <span style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace"}}>
            fL={uc.len(fL)}{uc.lenU} · b={uc.len(SR.bWing)}{uc.lenU} · Cr={uc.len(Cr)}{uc.lenU} · uniform scale
          </span>
        </div>

        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{display:'block'}}>

          {/* CG reference lines — thin, full width, colour only — labels on ruler below */}
          {MARKERS.map(m=>(
            <line key={`cgl-${m.label}`}
              x1={0}        y1={sx(m.xm).toFixed(1)}
              x2={SVG_W}    y2={sx(m.xm).toFixed(1)}
              stroke={m.col} strokeWidth={m.dash?1.2:2.2}
              strokeDasharray={m.dash||'none'} opacity={0.6}/>
          ))}

          {/* Wings */}
          <polygon points={wingPoly(-1)} fill={`${SC.blue}18`} stroke={SC.blue} strokeWidth={1.8}/>
          <polygon points={wingPoly(+1)} fill={`${SC.blue}18`} stroke={SC.blue} strokeWidth={1.8}/>

          {/* MAC quarter-chord */}
          {(()=>{
            const yM=SR.Ymac, cM=Cr+(Ct-Cr)*(yM/bHalf);
            const xQC=xWingLE+yM*Math.tan(sweep_rad)+cM*0.25;
            return(<>
              <line x1={sy(-yM).toFixed(1)} y1={sx(xQC).toFixed(1)}
                    x2={sy( yM).toFixed(1)} y2={sx(xQC).toFixed(1)}
                    stroke={SC.green} strokeWidth={1} strokeDasharray="5,3" opacity={0.5}/>
              <text x={(sy(-yM)-6).toFixed(1)} y={(sx(xQC)-4).toFixed(1)}
                fontSize={7} fill={SC.green} fontFamily="DM Mono,monospace" opacity={0.8}>MAC c/4</text>
            </>);
          })()}

          {/* Wing batteries */}
          <polygon points={wingBatPoly(-1)} fill={`${SC.teal}55`} stroke={SC.teal} strokeWidth={1.8}/>
          <polygon points={wingBatPoly(+1)} fill={`${SC.teal}55`} stroke={SC.teal} strokeWidth={1.8}/>
          {[-1,+1].map((sgn,i)=>{
            const yM=yBatEnd/2, lM=xWingLE+yM*Math.tan(sweep_rad)+(Cr+(Ct-Cr)*(yM/bHalf))*0.47;
            return(
              <text key={`wbl${i}`} x={(sy(sgn*yM)+3).toFixed(1)} y={sx(lM).toFixed(1)}
                textAnchor="middle" fontSize={8} fill={SC.teal}
                fontFamily="DM Mono,monospace" fontWeight={700}>
                {sgn<0?'R':'L'} BAT
              </text>
            );
          })}

          {/* 0.5 m gap annotation */}
          {[-1,+1].map((sgn,i)=>{
            const cE=Cr+(Ct-Cr)*(yBatEnd/bHalf), leE=xWingLE+yBatEnd*Math.tan(sweep_rad);
            const cB=Cr+(Ct-Cr)*(yBoom/bHalf),   leB=xWingLE+yBoom*Math.tan(sweep_rad);
            return(
              <g key={`gap${i}`}>
                <line x1={sy(sgn*yBatEnd).toFixed(1)} y1={sx(leE+cE*0.47).toFixed(1)}
                      x2={sy(sgn*yBoom).toFixed(1)}   y2={sx(leB+cB*0.47).toFixed(1)}
                      stroke={SC.dim} strokeWidth={0.7} strokeDasharray="3,2"/>
                <text x={(sy(sgn*(yBatEnd+yBoom)/2)+3).toFixed(1)}
                  y={(sx((leE+leB)/2+(cE+cB)/2*0.47)).toFixed(1)}
                  textAnchor="middle" fontSize={7} fill={SC.subtle}
                  fontFamily="DM Mono,monospace">{uc.len(0.5)}{uc.lenU} gap</text>
              </g>
            );
          })}

          {/* Booms */}
          {[-1,+1].map((sgn,i)=>(
            <rect key={`boom${i}`}
              x={(sy(sgn*yBoom)-2.5).toFixed(1)} y={(sx(boomXFwd-0.12)).toFixed(1)}
              width={5} height={((boomXAft-boomXFwd+0.24)*xScale).toFixed(1)}
              fill={`${SC.muted}44`} stroke={SC.muted} strokeWidth={1.2} rx={2.5}/>
          ))}

          {/* Boom rotors */}
          {[-1,+1].map((sgn,si)=>
            boomXs.map((xr,ri)=>(
              <g key={`br${si}-${ri}`}>
                <ellipse cx={sy(sgn*yBoom).toFixed(1)} cy={sx(xr).toFixed(1)}
                  rx={Rry.toFixed(1)} ry={Rrx.toFixed(1)}
                  fill="none" stroke={SC.muted} strokeWidth={1.2}
                  strokeDasharray="5,3" opacity={0.75}/>
                <circle cx={sy(sgn*yBoom).toFixed(1)} cy={sx(xr).toFixed(1)}
                  r={3} fill={SC.muted} opacity={0.8}/>
              </g>
            ))
          )}

          {/* Wing-tip rotors */}
          {[-1,+1].map((sgn,i)=>(
            <g key={`wtr${i}`}>
              <ellipse cx={sy(sgn*bHalf).toFixed(1)} cy={sx(xTipRotor).toFixed(1)}
                rx={Rry.toFixed(1)} ry={Rrx.toFixed(1)}
                fill={`${SC.amber}18`} stroke={SC.amber} strokeWidth={1.8}
                strokeDasharray="5,3"/>
              <circle cx={sy(sgn*bHalf).toFixed(1)} cy={sx(xTipRotor).toFixed(1)}
                r={3.5} fill={SC.amber}/>
              <text x={(sy(sgn*bHalf) + (sgn<0?-Rry-6:Rry+13)).toFixed(1)} y={(sx(xTipRotor)).toFixed(1)}
                textAnchor="middle" fontSize={8} fill={SC.amber}
                fontFamily="DM Mono,monospace" fontWeight={700}>TIP ROTOR</text>
            </g>
          ))}

          {/* Fuselage body */}
          <polygon points={fusePoints}
            fill={SC.panel==='#161b22'?'#1d2636':SC.bg}
            stroke={SC.muted} strokeWidth={2.5}/>

          {/* Cargo bay triangle */}
          <polygon points={cargoPts}
            fill={`${SC.orange}44`} stroke={SC.orange} strokeWidth={1.8}/>
          <text x={(CX+3).toFixed(1)} y={(sx((xCargoBase+xCargoTip*2)/3)).toFixed(1)}
            textAnchor="middle" fontSize={8} fill={SC.orange}
            fontFamily="DM Mono,monospace" fontWeight={700}>CARGO</text>

          {/* Main battery */}
          <rect x={(CX-mbH/2).toFixed(1)} y={(sx(xBatVis)-mbW/2).toFixed(1)}
            width={mbH.toFixed(1)} height={mbW.toFixed(1)}
            fill={`${SC.amber}44`} stroke={SC.amber} strokeWidth={2} rx={4}/>
          <text x={(CX+3).toFixed(1)} y={sx(xBatVis).toFixed(1)}
            textAnchor="middle" fontSize={7} fill={SC.amber}
            fontFamily="DM Mono,monospace" fontWeight={700}>MAIN BAT</text>

          {/* Pilot */}
          <rect x={(CX-sH/2).toFixed(1)} y={(sx(xPilot)-sW/2).toFixed(1)}
            width={sH.toFixed(1)} height={sW.toFixed(1)}
            fill={`${SC.purple}66`} stroke={SC.purple} strokeWidth={2} rx={3}/>
          <text x={(CX+3).toFixed(1)} y={sx(xPilot).toFixed(1)}
            textAnchor="middle" fontSize={7} fill={SC.purple}
            fontFamily="DM Mono,monospace" fontWeight={700}>PILOT</text>

          {/* Row 1 */}
          {[-0.27,+0.27].map((yOff,i)=>(
            <g key={`r1s${i}`}>
              <rect x={(sy(yOff*fD)-sH/2).toFixed(1)} y={(sx(xRow1)-sW/2).toFixed(1)}
                width={sH.toFixed(1)} height={sW.toFixed(1)}
                fill={`${SC.teal}55`} stroke={SC.teal} strokeWidth={2} rx={3}/>
              <text x={(sy(yOff*fD)+3).toFixed(1)} y={sx(xRow1).toFixed(1)}
                textAnchor="middle" fontSize={7} fill={SC.teal}
                fontFamily="DM Mono,monospace">P{i+1}</text>
            </g>
          ))}

          {/* Row 2 */}
          {[-0.27,+0.27].map((yOff,i)=>(
            <g key={`r2s${i}`}>
              <rect x={(sy(yOff*fD)-sH/2).toFixed(1)} y={(sx(xRow2)-sW/2).toFixed(1)}
                width={sH.toFixed(1)} height={sW.toFixed(1)}
                fill={`${SC.green}55`} stroke={SC.green} strokeWidth={2} rx={3}/>
              <text x={(sy(yOff*fD)+3).toFixed(1)} y={sx(xRow2).toFixed(1)}
                textAnchor="middle" fontSize={7} fill={SC.green}
                fontFamily="DM Mono,monospace">P{i+3}</text>
            </g>
          ))}

          {/* CG marker diamonds — left and right edge */}
          {MARKERS.map(m=>{
            const my=sx(m.xm), d=7;
            return(
              <g key={`dm-${m.label}`}>
                <polygon points={`2,${my} ${d+2},${my+d} ${d*2+2},${my} ${d+2},${my-d}`}
                  fill={m.col} opacity={0.95}/>
                <polygon points={`${SVG_W-2},${my} ${SVG_W-d-2},${my+d} ${SVG_W-d*2-2},${my} ${SVG_W-d-2},${my-d}`}
                  fill={m.col} opacity={0.95}/>
              </g>
            );
          })}

          {/* Direction labels */}
          <text x={(CX+4).toFixed(1)} y={(fNY-5).toFixed(1)}
            textAnchor="middle" fontSize={9} fill={SC.muted} fontFamily="DM Mono,monospace">▲ NOSE</text>
          <text x={(CX+4).toFixed(1)} y={(fTY+14).toFixed(1)}
            textAnchor="middle" fontSize={9} fill={SC.muted} fontFamily="DM Mono,monospace">TAIL ▼</text>
          <text x={(sy(-bHalf)-10).toFixed(1)} y={(sx(xTipLE+Ct*0.5)).toFixed(1)}
            textAnchor="middle" fontSize={9} fill={SC.blue} fontFamily="DM Mono,monospace"
            transform={`rotate(-90,${sy(-bHalf)-10},${sx(xTipLE+Ct*0.5)})`}>RIGHT WING</text>
          <text x={(sy(bHalf)+18).toFixed(1)} y={(sx(xTipLE+Ct*0.5)).toFixed(1)}
            textAnchor="middle" fontSize={9} fill={SC.blue} fontFamily="DM Mono,monospace"
            transform={`rotate(90,${sy(bHalf)+18},${sx(xTipLE+Ct*0.5)})`}>LEFT WING</text>

          {/* Dimension annotations */}
          <line x1={(SVG_W-7).toFixed(1)} y1={fNY.toFixed(1)}
                x2={(SVG_W-7).toFixed(1)} y2={fTY.toFixed(1)}
                stroke={SC.dim} strokeWidth={0.5}/>
          <line x1={(SVG_W-11).toFixed(1)} y1={fNY.toFixed(1)} x2={(SVG_W-3).toFixed(1)} y2={fNY.toFixed(1)} stroke={SC.dim} strokeWidth={0.5}/>
          <line x1={(SVG_W-11).toFixed(1)} y1={fTY.toFixed(1)} x2={(SVG_W-3).toFixed(1)} y2={fTY.toFixed(1)} stroke={SC.dim} strokeWidth={0.5}/>
          <text x={(SVG_W-1).toFixed(1)} y={((fNY+fTY)/2).toFixed(1)}
            textAnchor="middle" fontSize={8} fill={SC.dim} fontFamily="DM Mono,monospace"
            transform={`rotate(90,${SVG_W-1},${(fNY+fTY)/2})`}>fL = {uc.len(fL)} {uc.lenU}</text>

          <line x1={sy(-bHalf).toFixed(1)} y1={(sx(xTipLE+Ct*0.9)).toFixed(1)}
                x2={sy( bHalf).toFixed(1)} y2={(sx(xTipLE+Ct*0.9)).toFixed(1)}
                stroke={SC.dim} strokeWidth={0.4}/>
          <text x={(CX+4).toFixed(1)} y={(sx(xTipLE+Ct*0.9)+13).toFixed(1)}
            fontSize={8} fill={SC.dim} fontFamily="DM Mono,monospace">b = {uc.len(SR.bWing)} {uc.lenU}</text>

        </svg>

        {/* Legend */}
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:10,paddingTop:8,
          borderTop:`1px solid ${SC.border}`,fontSize:10,fontFamily:"'DM Mono',monospace"}}>
          {[
            [SC.purple,'■','Pilot seat'],
            [SC.teal,  '■','PAX Row 1 (fwd)'],
            [SC.green, '■','PAX Row 2 (aft)'],
            [SC.amber, '■','Main battery (floor)'],
            [SC.teal,  '▬','Wing batteries (root→boom−0.5m)'],
            [SC.orange,'▲','Cargo bay'],
            [SC.blue,  '━','Wing planform'],
            [SC.muted, '○','Boom rotor'],
            [SC.amber, '○','Tip rotor'],
          ].map(([col,sym,lbl])=>(
            <div key={lbl} style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{color:col,fontSize:14,fontWeight:700,lineHeight:1}}>{sym}</span>
              <span style={{color:SC.muted}}>{lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CG Ruler — zoomed view, no overlap ── */}
      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
        <div style={{fontSize:11,color:SC.muted,textTransform:'uppercase',letterSpacing:'0.08em',
          fontFamily:'system-ui,sans-serif',marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
          CG Position Ruler — Zoomed View ({uc.lenU} from nose)
        </div>
        <svg viewBox={`0 0 700 ${RH}`} width="100%" style={{display:'block',overflow:'visible'}}>
          {/* Track line */}
          <line x1={RL} y1={RH/2} x2={RL+RW} y2={RH/2} stroke={SC.border} strokeWidth={1.5}/>
          {/* Safe zone shading */}
          <rect x={rx(xCG_fwd).toFixed(1)} y={(RH/2-10).toFixed(1)}
            width={(rx(xCG_aft)-rx(xCG_fwd)).toFixed(1)} height={20}
            fill={`${SC.green}22`} stroke="none"/>
          <text x={((rx(xCG_fwd)+rx(xCG_aft))/2).toFixed(1)} y={(RH/2+5).toFixed(1)}
            textAnchor="middle" fontSize={7} fill={SC.green}
            fontFamily="DM Mono,monospace" fontWeight={700}>SAFE ZONE</text>
          {/* Markers — alternating top/bottom to avoid overlap */}
          {sortedM.map((m,i)=>{
            const mx=rx(m.xm);
            const above = i%2===0;
            const labelY = above ? 4 : RH-20;
            const valY   = above ? RH/2-14 : RH/2+22;
            return(
              <g key={`rul-${m.label}`}>
                <line x1={mx.toFixed(1)} y1={(RH/2-12).toFixed(1)}
                      x2={mx.toFixed(1)} y2={(RH/2+12).toFixed(1)}
                      stroke={m.col} strokeWidth={m.dash?2:3}
                      strokeDasharray={m.dash||'none'}/>
                <rect x={(mx-26).toFixed(1)} y={labelY} width={52} height={14} rx={3}
                  fill={`${m.col}22`} stroke={`${m.col}55`} strokeWidth={1}/>
                <text x={mx.toFixed(1)} y={(labelY+10).toFixed(1)}
                  textAnchor="middle" fontSize={8} fill={m.col}
                  fontFamily="DM Mono,monospace" fontWeight={700}>{m.label}</text>
                <text x={mx.toFixed(1)} y={valY.toFixed(1)}
                  textAnchor="middle" fontSize={8} fill={m.col}
                  fontFamily="DM Mono,monospace">{uc.len(m.xm)}</text>
                {/* Connector line from label to tick */}
                <line x1={mx.toFixed(1)} y1={(above?labelY+14:labelY-2).toFixed(1)}
                      x2={mx.toFixed(1)} y2={(above?RH/2-12:RH/2+12).toFixed(1)}
                      stroke={m.col} strokeWidth={0.5} opacity={0.4}/>
              </g>
            );
          })}
          {/* End labels */}
          <text x={(RL-4).toFixed(1)} y={(RH/2+4).toFixed(1)} textAnchor="end"
            fontSize={8} fill={SC.dim} fontFamily="DM Mono,monospace">0 {uc.lenU} nose</text>
        </svg>
      </div>

      {/* ── Loading table ── */}
      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
        <div style={{fontSize:11,color:SC.muted,textTransform:'uppercase',letterSpacing:'0.08em',
          fontFamily:'system-ui,sans-serif',marginBottom:8,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
          Loading Scenario Analysis
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>{[`Condition`,`Weight (${uc.massU})`,`CG (${uc.lenU})`,`SM (% MAC)`,``].map(h=>(
              <th key={h} style={{fontSize:10,color:SC.muted,textAlign:'left',padding:'4px 8px',
                borderBottom:`1px solid ${SC.border}`,fontFamily:"'DM Mono',monospace"}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {(()=>{
              const We=SR.Wempty, Wb=SR.Wbat;
              const cgOEW=(We*SR.xCGempty+Wb*xBatPhys)/(We+Wb);
              return [
                ['OEW + Battery',          We+Wb,     cgOEW],
                ['+ Pilot',                We+Wb+90,  ((We+Wb)*cgOEW+90*xPilot)/(We+Wb+90)],
                ['+ PAX 1&2 (fwd Row 1)',  We+Wb+270, ((We+Wb)*cgOEW+90*xPilot+180*xRow1)/(We+Wb+270)],
                ['MTOW (all pax)',          SR.MTOW,   xCGtotal],
              ].map(([lbl,W,xCG],i)=>{
                const sm=(xNP_vt-xCG)/MAC*100, ok=sm>=5&&sm<=25;
                return(
                  <tr key={i} style={{background:i%2===0?SC.bg:'transparent',borderTop:`1px solid ${SC.border}22`}}>
                    <td style={{fontSize:10,color:SC.text,padding:'4px 8px',fontFamily:"'DM Mono',monospace"}}>{lbl}</td>
                    <td style={{fontSize:10,color:SC.amber,padding:'4px 8px',fontFamily:"'DM Mono',monospace"}}>{uc.mass(W)}</td>
                    <td style={{fontSize:10,color:SC.teal,padding:'4px 8px',fontFamily:"'DM Mono',monospace"}}>{uc.len(xCG)}</td>
                    <td style={{fontSize:10,color:ok?SC.green:SC.red,padding:'4px 8px',fontFamily:"'DM Mono',monospace",fontWeight:700}}>{sm.toFixed(1)}%</td>
                    <td style={{fontSize:12,padding:'4px 8px'}}>{ok?'✓':'⚠'}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Physics note */}
      <div style={{padding:'7px 12px',background:`${SC.blue}0d`,border:`1px solid ${SC.blue}22`,
        borderRadius:5,fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.6}}>
        <span style={{color:SC.blue,fontWeight:700}}>ⓘ </span>
        Battery mass is constant throughout flight (electric — no fuel burn).
        Wing bat: root → {uc.len(yBatEnd)} {uc.lenU} lateral (0.5 m clear of boom at ±{uc.len(yBoom)} {uc.lenU}).
        Tip rotors at wing tips ±{uc.len(bHalf)} {uc.lenU}. Diagram is to uniform scale — true aircraft proportions.
        CG limits: EASA SC-VTOL §2540–2541 (SM 5–25% MAC).
      </div>
    </div>
  );
}

export function ComponentDBPanel({ params, SC, onParamChange, U }) {
  const uc = U || {power:v=>+v.toFixed(1),powerU:"kW",mass:v=>+v.toFixed(1),massU:"kg"};
  const [cat, setCat]       = useState("motors");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiComponents, setAiComponents] = useState([]);
  const [aiError, setAiError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const GROQ_KEY = import.meta.env.VITE_GROQ_KEY;

  // Merge static DB with AI-fetched components
  const allItems = [
    ...(DB[cat] || []),
    ...aiComponents.filter(c => c.category === cat),
  ];

  const filtered = allItems.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q)
      || c.mfr.toLowerCase().includes(q)
      || (c.notes||"").toLowerCase().includes(q)
      || (c.type||"").toLowerCase().includes(q);
  });

  // Apply motor/battery to design
  const applyComponent = (comp) => {
    if (!comp.apply) return;
    const updates = {};
    if (comp.apply.etaSys)    updates.etaSys    = comp.apply.etaSys;
    if (comp.apply.sedCell)   updates.sedCell   = comp.apply.sedCell;
    if (comp.apply.cRateDerate !== undefined) updates.cRateDerate = comp.apply.cRateDerate;
    Object.entries(updates).forEach(([k,v]) => onParamChange(k)(v));
    setApplied(comp.id);
    setTimeout(() => setApplied(null), 3000);
  };

  // Known manufacturers per category for "not manufacturing" check
  const MFR_CATS = {
    motors:    ["emrax","h3x","magnix","pipistrel","textron","joby","siemens","rolls-royce","safran","ge","pratt","honeywell","nidec","parker","continental","rotax","mt-propeller","yuneec","wisk","lilium","volocopter","archer","beta","overair","magni"],
    batteries: ["catl","samsung","lg","panasonic","molicel","murata","sony","amprius","quantumscape","solid power","sila","enovix","factorial","svolt","northvolt","saft","eaglepicher","byd","eve","gotion","ganfeng","sunwoda","tesla","a123","lishen","farasis","enpower","tianneng"],
    inverters: ["cascadia","unitek","rinehart","parker","sevcon","dana","infineon","danfoss","semikron","abb","siemens","ge","nidec","yaskawa","mitsubishi","hitachi","fuji","toshiba","rockwell","emerson","bosch","continental","delphi","valeo","mahle","borgwarner"],
  };
  const isKnownMfr = (q, category) => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return MFR_CATS[category]?.some(m => ql.includes(m) || m.includes(ql));
  };

  // Fetch latest from Groq AI (company-aware, all form factors)
  const fetchLatest = async () => {
    if (!GROQ_KEY) { setAiError("No GROQ key — add VITE_GROQ_KEY to GitHub Secrets."); return; }
    if (search.trim() && !isKnownMfr(search, cat)) {
      setAiError(`"${search}" does not appear to manufacture ${CAT_LABELS[cat].toLowerCase()}. Try a different manufacturer or clear the search to browse all.`);
      return;
    }
    setAiLoading(true); setAiError("");
    const companyFilter = search.trim() ? `from the company "${search.trim()}" specifically` : "";
    const existingNames = allItems.map(c=>c.name).join(", ");
    const catDesc = cat === "motors"
      ? `electric motors (any type — axial flux, radial flux, PMSM, BLDC — any size) ${companyFilter}`
      : cat === "batteries"
      ? `battery cells or packs (any chemistry NMC/NCA/LFP/solid-state/sodium-ion, any form factor cylindrical/prismatic/pouch) ${companyFilter}`
      : `motor controllers, inverters, or ESCs ${companyFilter}`;
    try {
      const specFields = cat === "motors"
        ? `"peakKW": number, "contKW": number, "massKg": number, "spKWkg": number, "effPct": number, "maxRPM": number, "voltage": "string", "cooling": "string"`
        : cat === "batteries"
        ? `"sedCellWhkg": number, "sedPackWhkg": number, "capAh": "number or null", "voltV": number, "maxCRate": number, "cycleLife": "number or null"`
        : `"peakKW": number, "contKW": number, "massKg": number, "effPct": number, "voltage": "string", "cooling": "string"`;
      const prompt = `You are a database of eVTOL propulsion component specs. Return ONLY a valid JSON array (no markdown, no code fences, no explanation) of 4 real ${catDesc} from 2023-2025 NOT already in: [${existingNames}].

Each object must have exactly: {"category":"${cat}","id":"kebab-id","name":"Product","mfr":"Company","badge":"One short badge label","type":"Chemistry or topology",${specFields},"year":number,"notes":"2-3 sentence technical summary","url":"https://..."}

Return ONLY the raw JSON array starting with [ and ending with ].`;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${GROQ_KEY}`},
        body:JSON.stringify({ model:GROQ_MODEL_LARGE, max_tokens:1800,
          messages:[{role:"user",content:prompt}] })
      });
      const data = await res.json();
      const raw  = data.choices?.[0]?.message?.content || "[]";
      const clean = raw.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const withApply = parsed.map(c => {
          if (c.apply) return c;
          if (c.category === "batteries") {
            return { ...c, apply: {
              sedCell:     c.sedCellWhkg || 250,
              cRateDerate: c.maxCRate >= 8 ? 0.05 : c.maxCRate >= 4 ? 0.08 : 0.11,
              label: `${c.name} — ${c.sedCellWhkg} Wh/kg`,
            }};
          }
          if (c.category === "motors") {
            const eff = c.effPct || 94;
            return { ...c, apply: {
              etaSys: +((eff / 100) * 0.97).toFixed(2),
              label:  `${c.name} — η_sys=${+((eff/100)*0.97).toFixed(2)}`,
            }};
          }
          if (c.category === "inverters") {
            const eff = c.effPct || 97;
            return { ...c, apply: {
              etaSys: +((eff / 100) * 0.98).toFixed(2),
              label:  `${c.name} — η_sys=${+((eff/100)*0.98).toFixed(2)}`,
            }};
          }
          return c;
        });
        setAiComponents(prev => [...prev.filter(c=>c.category!==cat), ...withApply]);
      } else {
        setAiError(search.trim()
          ? `No ${CAT_LABELS[cat].toLowerCase()} found for "${search}". This manufacturer may not produce ${CAT_LABELS[cat].toLowerCase()}.`
          : "No new components found. All known components may already be in the database.");
      }
    } catch(e) {
      setAiError(`AI fetch failed: ${e.message}`);
    }
    setAiLoading(false);
  };

  // Spec key/value pairs per category
  const specPairs = (c) => {
    if (cat === "motors") return [
      ["Peak Power", `${uc.power(c.peakKW)} ${uc.powerU}`],
      ["Continuous", `${uc.power(c.contKW)} ${uc.powerU}`],
      ["Mass", `${uc.mass(c.massKg)} ${uc.massU}`],
      ["Sp. Power", `${c.spKWkg} kW/kg`],
      ["Efficiency", `${c.effPct}%`],
      ["Max RPM", c.maxRPM ? c.maxRPM.toLocaleString() : "—"],
    ];
    if (cat === "batteries") return [
      ["Cell SED", `${c.sedCellWhkg} Wh/kg`],
      ["Pack SED", `${c.sedPackWhkg} Wh/kg`],
      ["Capacity", c.capAh ? `${c.capAh} Ah` : "—"],
      ["Max C-rate", `${c.maxCRate}C`],
      ["Cycle life", c.cycleLife ? `${c.cycleLife} cyc` : "—"],
      ["Voltage", `${c.voltV} V`],
    ];
    return [
      ["Peak Power", `${uc.power(c.peakKW)} ${uc.powerU}`],
      ["Continuous", `${uc.power(c.contKW)} ${uc.powerU}`],
      ["Mass", `${uc.mass(c.massKg)} ${uc.massU}`],
      ["Efficiency", `${c.effPct}%`],
      ["Voltage", c.voltage],
      ["Cooling", c.cooling],
    ];
  };

  // Badge color
  const badgeColor = (b="") => {
    if (b.includes("Certified")) return SC.green;
    if (b.includes("Future") || b.includes("2025")) return SC.purple;
    if (b.includes("Highest") || b.includes("Best")) return SC.amber;
    if (b.includes("Proven") || b.includes("Used")) return SC.teal;
    return SC.blue;
  };

  const CATS = ["motors","batteries","inverters"];
  const CAT_LABELS = { motors:"Motors", batteries:"Batteries", inverters:"Inverters/ESC" };
  const CAT_ICONS  = { motors:"", batteries:"", inverters:"" };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Header bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {/* Category tabs */}
        <div style={{display:"flex",gap:2,background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:6,padding:3}}>
          {CATS.map(c=>(
            <button key={c} type="button" onClick={()=>{setCat(c);setSearch("");}}
              style={{padding:"5px 14px",borderRadius:4,border:"none",cursor:"pointer",fontFamily:"system-ui,sans-serif",
                fontSize:11,fontWeight:cat===c?700:400,
                background:cat===c?SC.amber:SC.bg,
                color:cat===c?SC.bg:SC.muted,
                transition:"all 0.15s"}}>
              {CAT_ICONS[c]} {CAT_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by name, manufacturer, type…"
          style={{flex:1,minWidth:200,padding:"6px 12px",background:SC.panel,border:`1px solid ${SC.border}`,
            borderRadius:5,color:SC.text,fontSize:11,fontFamily:"'DM Mono',monospace",outline:"none"}}
          onFocus={e=>e.target.style.borderColor=SC.amber}
          onBlur={e=>e.target.style.borderColor=SC.border}
        />

        {/* AI fetch button */}
        <button type="button" onClick={fetchLatest} disabled={aiLoading}
          style={{padding:"6px 14px",background:aiLoading?"transparent":`${SC.purple}22`,
            border:`1px solid ${SC.purple}66`,borderRadius:5,
            color:SC.purple,fontSize:11,cursor:aiLoading?"default":"pointer",
            fontFamily:"system-ui,sans-serif",fontWeight:600,
            display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
          {aiLoading ? "⏳ Fetching…" : "Fetch Latest via AI"}
        </button>
      </div>

      {aiError && (
        <div style={{padding:"8px 12px",background:`${SC.red}15`,border:`1px solid ${SC.red}44`,
          borderRadius:5,fontSize:10,color:SC.red,fontFamily:"'DM Mono',monospace"}}>
          {aiError}
        </div>
      )}

      {/* Component count */}
      <div style={{fontSize:10,color:SC.subtle,fontFamily:"'DM Mono',monospace"}}>
        {filtered.length} {CAT_LABELS[cat].toLowerCase()} — {DB[cat]?.length||0} curated
        {aiComponents.filter(c=>c.category===cat).length>0 && ` + ${aiComponents.filter(c=>c.category===cat).length} AI-fetched`}
        {search && ` (filtered)`}
      </div>

      {/* Cards grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
        {filtered.map(comp=>{
          const isExpanded = expandedId === comp.id;
          const isApplied  = applied === comp.id;
          const isAI = !DB[cat]?.find(c=>c.id===comp.id);
          return (
            <div key={comp.id}
              style={{background:SC.panel,border:`1px solid ${isApplied?SC.green:SC.border}`,
                borderRadius:8,overflow:"hidden",
                boxShadow:isApplied?`0 0 12px ${SC.green}33`:"none",
                transition:"border-color 0.3s,box-shadow 0.3s"}}>

              {/* Card header */}
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${SC.border}`,
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,fontWeight:700,color:SC.text,fontFamily:"system-ui,sans-serif"}}>{comp.name}</span>
                    {comp.badge && (
                      <span style={{fontSize:8,padding:"1px 6px",borderRadius:10,
                        background:`${badgeColor(comp.badge)}22`,
                        border:`1px solid ${badgeColor(comp.badge)}55`,
                        color:badgeColor(comp.badge),fontFamily:"'DM Mono',monospace",
                        fontWeight:700,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>
                        {comp.badge}
                      </span>
                    )}
                    {isAI && (
                      <span style={{fontSize:8,padding:"1px 6px",borderRadius:10,
                        background:`${SC.purple}22`,border:`1px solid ${SC.purple}55`,
                        color:SC.purple,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>
                        AI
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginTop:2}}>
                    {comp.mfr} · {comp.type} · {comp.year}
                  </div>
                </div>
                <button type="button"
                  onClick={()=>setExpandedId(isExpanded?null:comp.id)}
                  style={{background:"transparent",border:"none",cursor:"pointer",
                    fontSize:12,color:SC.muted,flexShrink:0}}>
                  {isExpanded?"▾":"▸"}
                </button>
              </div>

              {/* Spec grid */}
              <div style={{padding:"8px 12px",
                display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 8px"}}>
                {specPairs(comp).map(([k,v])=>(
                  <div key={k} style={{minWidth:0}}>
                    <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",
                      textTransform:"uppercase",letterSpacing:"0.06em"}}>{k}</div>
                    <div style={{fontSize:11,fontWeight:700,color:SC.amber,
                      fontFamily:"'DM Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Expanded notes */}
              {isExpanded && (
                <div style={{padding:"0 12px 10px",borderTop:`1px solid ${SC.border}33`}}>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",
                    lineHeight:1.7,marginTop:8,marginBottom:8}}>
                    {comp.notes}
                  </div>
                  <a href={comp.url} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:9,color:SC.blue,fontFamily:"'DM Mono',monospace",textDecoration:"none"}}>
                    {comp.url}
                  </a>
                </div>
              )}

              {/* Action footer */}
              <div style={{padding:"6px 12px 10px",display:"flex",alignItems:"center",gap:6}}>
                <button type="button"
                  onClick={()=>applyComponent(comp)}
                  disabled={!comp.apply}
                  style={{flex:1,padding:"6px 0",
                    background:isApplied?`${SC.green}22`:"transparent",
                    border:`1px solid ${isApplied?SC.green:comp.apply?SC.amber:SC.border}`,
                    borderRadius:4,cursor:comp.apply?"pointer":"default",
                    fontSize:10,color:isApplied?SC.green:comp.apply?SC.amber:SC.dim,
                    fontFamily:"system-ui,sans-serif",fontWeight:600,
                    transition:"all 0.2s"}}>
                  {isApplied ? "✓ Applied to design" : "Apply to design"}
                </button>
                <button type="button"
                  onClick={()=>setExpandedId(isExpanded?null:comp.id)}
                  style={{padding:"6px 10px",background:"transparent",
                    border:`1px solid ${SC.border}`,borderRadius:4,cursor:"pointer",
                    fontSize:10,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>
                  {isExpanded?"Less":"Details"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{padding:"10px 14px",background:`${SC.blue}0a`,border:`1px solid ${SC.blue}22`,
        borderRadius:6,fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
        <span style={{color:SC.blue,fontWeight:700}}>ⓘ Sources: </span>
        Specs from official manufacturer datasheets (EMRAX v1.5 2024, H3X Oct 2024, Molicel INR21700P45B-01, MDPI WEVJ 2025).
        Pack SED estimated at 80% of cell SED (BMS + cooling + structure overhead).
        Click <span style={{color:SC.purple}}>Fetch Latest via AI</span> to query Groq for 2024–2025 additions not yet in the curated database.
        "Apply to design" updates efficiency and battery sliders; re-run sizing automatically.
      </div>
    </div>
  );
}
