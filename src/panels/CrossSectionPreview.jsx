import { useState } from "react";
import { SC } from "../lib/theme.js";

export function CrossSectionPreview({ params, SR, SC, U }) {
  const fD   = Number(params.fusDiam) || 1.65;
  const fL   = Number(params.fusLen)  || 6.5;
  const tc   = Number(params.tc)      || 0.12;
  const Cr   = Number(SR?.Cr_)        || 1.94;
  const Ct   = Number(SR?.Ct_)        || 0.87;
  const bW   = Number(SR?.bWing)      || 12.67;
  const sw   = Number(SR?.sweep)      || 9.57;
  const [station, setStation] = useState(0.38); // fraction along fuselage

  // Fuselage cross-section: 5-station superellipse
  const fusSt = [
    {p:0.00, w:fD*0.01, h:fD*0.01},
    {p:0.15, w:fD*0.60, h:fD*0.55*0.88},
    {p:0.38, w:fD,      h:fD*0.88},
    {p:0.70, w:fD*0.72, h:fD*0.60*0.88},
    {p:1.00, w:fD*0.01, h:fD*0.01},
  ];
  // Interpolate width/height at current station
  const interp = (st) => {
    for (let i = 0; i < fusSt.length - 1; i++) {
      const a = fusSt[i], b = fusSt[i+1];
      if (st >= a.p && st <= b.p) {
        const t = (st - a.p) / (b.p - a.p);
        return { w: a.w + t*(b.w-a.w), h: a.h + t*(b.h-a.h) };
      }
    }
    return fusSt[fusSt.length-1];
  };
  const cs = interp(station);

  const uc = U || {len:v=>+v.toFixed(2), lenU:"m", area:v=>+v.toFixed(2), areaU:"m²"};
  // SVG viewport 200×200, centred
  const CX = 100, CY = 100, SCALE = 55 / (fD * 0.5 + 0.1);
  const rx = cs.w * 0.5 * SCALE, ry = cs.h * 0.5 * SCALE;

  // NACA 4-digit airfoil points for wing profile
  const nacaPoints = (tc, nPts=60) => {
    const pts = [];
    for (let i = 0; i <= nPts; i++) {
      const x = 0.5 * (1 - Math.cos(Math.PI * i / nPts));
      const yt = 5*tc*(0.2969*Math.sqrt(x) - 0.1260*x - 0.3516*x*x + 0.2843*x*x*x - 0.1015*x*x*x*x);
      pts.push({x, yt});
    }
    // upper then lower surface
    const upper = pts.map(p => ({x: p.x, y: -p.yt}));
    const lower = pts.slice().reverse().map(p => ({x: p.x, y: p.yt}));
    return [...upper, ...lower];
  };
  const airfoilPts = nacaPoints(tc);
  const W2 = 180, H2 = 80, PAD = 10;
  const toSVG = (x, y) => ({ sx: PAD + x*W2, sy: H2/2 + y*H2*3.5 });
  const airfoilPath = airfoilPts.map((p,i) => {
    const {sx,sy} = toSVG(p.x, p.y);
    return `${i===0?'M':'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ') + ' Z';

  // Wing planform (top-down, simplified trapezoid)
  const halfSpan = 90, rootC = 34, tipC = rootC*(Ct/Cr), swPx = halfSpan*Math.tan(sw*Math.PI/180);
  const planformPath = [
    `M100,10`, `L${100+halfSpan},${10+swPx}`,
    `L${100+halfSpan},${10+swPx+tipC}`, `L100,${10+rootC}`, `Z`,
    `M100,10`, `L${100-halfSpan},${10+swPx}`,
    `L${100-halfSpan},${10+swPx+tipC}`, `L100,${10+rootC}`, `Z`
  ].join(' ');

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
      {/* Fuselage Cross-Section */}
      <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8, padding:12}}>
        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,letterSpacing:'0.1em'}}>
          FUSELAGE X-SECTION @ {(station*100).toFixed(0)}% L
        </div>
        <input type="range" min="0" max="1" step="0.01" value={station}
          onChange={e=>setStation(Number(e.target.value))}
          style={{width:'100%',marginBottom:8,accentColor:SC.amber}}/>
        <svg width="100%" viewBox="0 0 200 200" style={{display:'block'}}>
          <rect width="200" height="200" fill="transparent"/>
          {/* Grid */}
          {[-1,0,1].map(i=>(
            <line key={'hg'+i} x1="0" y1={CY+i*40} x2="200" y2={CY+i*40} stroke={SC.border} strokeWidth="0.5"/>
          ))}
          {[-1,0,1].map(i=>(
            <line key={'vg'+i} x1={CX+i*40} y1="0" x2={CX+i*40} y2="200" stroke={SC.border} strokeWidth="0.5"/>
          ))}
          {/* Dimension labels */}
          <text x={CX} y={CY-ry-6} textAnchor="middle" fontSize="8" fill={SC.muted} fontFamily="DM Mono,monospace">
            {uc.len(cs.h)}{uc.lenU}
          </text>
          <text x={CX+rx+6} y={CY+4} textAnchor="start" fontSize="8" fill={SC.muted} fontFamily="DM Mono,monospace">
            {uc.len(cs.w)}{uc.lenU}
          </text>
          {/* Ellipse cross-section */}
          <ellipse cx={CX} cy={CY} rx={rx} ry={ry}
            fill={`${SC.blue}18`} stroke={SC.blue} strokeWidth="2"/>
          {/* Centreline crosshairs */}
          <line x1={CX-rx-10} y1={CY} x2={CX+rx+10} y2={CY} stroke={SC.amber} strokeWidth="0.8" strokeDasharray="4,3"/>
          <line x1={CX} y1={CY-ry-10} x2={CX} y2={CY+ry+10} stroke={SC.amber} strokeWidth="0.8" strokeDasharray="4,3"/>
        </svg>
      </div>

      {/* Wing Airfoil */}
      <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8, padding:12}}>
        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,letterSpacing:'0.1em'}}>
          WING AIRFOIL — NACA {Math.round(tc*100).toString().padStart(2,'0')} (t/c={tc})
        </div>
        <div style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
          Root chord: {uc.len(Cr)}{uc.lenU}  |  Tip chord: {uc.len(Ct)}{uc.lenU}
        </div>
        <svg width="100%" viewBox={`0 0 ${W2+PAD*2} ${H2}`} style={{display:'block'}}>
          <rect width={W2+PAD*2} height={H2} fill="transparent"/>
          {/* Chord line */}
          <line x1={PAD} y1={H2/2} x2={PAD+W2} y2={H2/2} stroke={SC.border} strokeWidth="0.5" strokeDasharray="4,3"/>
          {/* Airfoil */}
          <path d={airfoilPath} fill={`${SC.teal}22`} stroke={SC.teal} strokeWidth="1.5"/>
          {/* Quarter chord mark */}
          <line x1={PAD+W2*0.25} y1={H2*0.1} x2={PAD+W2*0.25} y2={H2*0.9} stroke={SC.amber} strokeWidth="1" strokeDasharray="3,2"/>
          <text x={PAD+W2*0.25} y={8} textAnchor="middle" fontSize="7" fill={SC.amber} fontFamily="DM Mono,monospace">c/4</text>
        </svg>
      </div>

      {/* Wing Planform */}
      <div style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8, padding:12}}>
        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,letterSpacing:'0.1em'}}>
          WING PLANFORM (TOP VIEW)
        </div>
        <div style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
          b={uc.len(bW)}{uc.lenU}  |  Λ={sw.toFixed(1)}°  |  λ={( Ct/Cr).toFixed(2)}
        </div>
        <svg width="100%" viewBox="0 0 200 80" style={{display:'block'}}>
          <rect width="200" height="80" fill="transparent"/>
          <path d={planformPath} fill={`${SC.blue}18`} stroke={SC.blue} strokeWidth="1.5"/>
          {/* Fuselage centreline */}
          <line x1="100" y1="0" x2="100" y2="80" stroke={SC.amber} strokeWidth="0.8" strokeDasharray="4,3"/>
          {/* Span arrow */}
          <line x1="10" y1="72" x2="190" y2="72" stroke={SC.muted} strokeWidth="0.8"/>
          <text x="100" y="79" textAnchor="middle" fontSize="7" fill={SC.muted} fontFamily="DM Mono,monospace">b={uc.len(bW)}{uc.lenU}</text>
        </svg>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FEATURE 10 — CFD-READY EXPORT CHECKLIST
   Validates geometry for VSPAERO before download.
   ════════════════════════════════════════════════════════════════════════ */
