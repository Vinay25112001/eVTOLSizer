/* Headless renderer for the 3D viewer's own mesh, so the geometry can be
   LOOKED AT instead of reasoned about from code. Writes PNGs.
   Uses the same buildMesh and the same projection maths as Aircraft3DView. */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { runSizing } from "../src/engine.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { buildMesh } from "../src/engine/mesh.js";
import * as CFG from "../src/engine/configuration.js";

import { PALETTE } from "../src/engine/mesh.js";

const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

function appCase(key) {
  const d = CFG.CONFIG_DEFAULTS[key];
  const p = { ...B, configType: key, nPropHover: d.nRotors,
    /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
    etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    twRatio: Math.max(1.30, CFG.oeiThrustMarginFor(key, d.nRotors) ?? 1.30),
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}),
    ...(d.fusFineness ? { fusLen: +(d.fusFineness * (B.fusDiam ?? 1.65)).toFixed(2) } : {}),
    /* the capsule section, as App.jsx applies it -- without this the
       renderer drew a tube while the app drew a pod */
    ...(d.fusHeightRatio ? { fusHeight: +(d.fusHeightRatio * (B.fusDiam ?? 1.65)).toFixed(2) } : {}) };
  return { ...p, range: 100 + 0.76 * p.vCruise * 20 * 60 / 1000 };
}

const rot = ([x,y,z], yaw, pitch) => {
  const cy=Math.cos(yaw), sy=Math.sin(yaw);
  const X = x*cy - y*sy, Y = x*sy + y*cy;
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  return [X, Y*cp - z*sp, Y*sp + z*cp];
};

export function png(W,H,rgb) {
  const raw = Buffer.alloc((W*3+1)*H);
  for (let y=0;y<H;y++){ raw[y*(W*3+1)]=0; rgb.copy(raw, y*(W*3+1)+1, y*W*3, (y+1)*W*3); }
  const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
  const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  const chunk=(t,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length);
    const td=Buffer.concat([Buffer.from(t),d]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len,td,c]);};
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR",ihdr), chunk("IDAT",deflateSync(raw)), chunk("IEND",Buffer.alloc(0))]);
}

export function render(cfg, yaw, pitch, W=1100, H=740, file, extra) {
  const p = { ...appCase(cfg), ...(extra || {}) };
  const SR = runSizing(p);
  const g = aircraftGeometry(p, SR);
  /* `nacelleTiltDeg` reaches buildMesh so a conversion can be rendered
     headlessly — the viewer's slider was checkable only by eye until now. */
  const faces = buildMesh(g, PALETTE,
    extra && extra.nacelleTiltDeg != null ? { nacelleTiltDeg: extra.nacelleTiltDeg } : {});
  const list = Array.isArray(faces) ? faces : (faces.faces || []);

  const all = list.flatMap(f => f.v);
  const cx = (Math.min(...all.map(v=>v[0])) + Math.max(...all.map(v=>v[0])))/2;
  const cy = 0;
  const cz = (Math.min(...all.map(v=>v[2])) + Math.max(...all.map(v=>v[2])))/2;
  const pts = all.map(v => rot([v[0]-cx, v[1]-cy, v[2]-cz], yaw, pitch));
  const ex = Math.max(...pts.map(q=>Math.abs(q[0]))), ez = Math.max(...pts.map(q=>Math.abs(q[2])));
  const s = 0.86 * Math.min(W/(2*ex||1), H/(2*ez||1));
  const proj = v => { const q = rot([v[0]-cx, v[1]-cy, v[2]-cz], yaw, pitch);
                      return [W/2 + q[0]*s, H/2 - q[2]*s, q[1]]; };

  const buf = Buffer.alloc(W*H*3, 24);
  const zbuf = new Float64Array(W*H).fill(Infinity);
  const tri = list.map(f => {
    const P = f.v.map(proj);
    const depth = P.reduce((a,q)=>a+q[2],0)/P.length;
    return { P, depth, colour: f.colour };
  }).sort((a,b)=> b.depth - a.depth);

  for (const t of tri) {
    const P = t.P;
    /* flat shade from the screen-space normal of the first three points */
    const [a,b,c] = P;
    const nx = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const lit = 0.62 + 0.38 * Math.min(1, Math.abs(nx) / 900);
    const col = (t.colour||[160,160,160]).map(v => Math.max(0, Math.min(255, v*lit)));
    const ys = P.map(q=>q[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H-1, Math.ceil(Math.max(...ys)));
    for (let y=y0; y<=y1; y++) {
      const xs=[];
      for (let i=0;i<P.length;i++){
        const j=(i+1)%P.length, A=P[i], Bp=P[j];
        if ((A[1]<=y && Bp[1]>y) || (Bp[1]<=y && A[1]>y))
          xs.push(A[0] + (y-A[1])/(Bp[1]-A[1])*(Bp[0]-A[0]));
      }
      xs.sort((m,n)=>m-n);
      for (let k=0;k+1<xs.length;k+=2){
        const xa=Math.max(0,Math.ceil(xs[k])), xb=Math.min(W-1,Math.floor(xs[k+1]));
        for (let x=xa;x<=xb;x++){
          const o=y*W+x;
          if (t.depth < zbuf[o]) { zbuf[o]=t.depth;
            buf[o*3]=col[0]; buf[o*3+1]=col[1]; buf[o*3+2]=col[2]; }
        }
      }
    }
  }
  writeFileSync(file, png(W,H,buf));
  return `${cfg}: ${list.length} faces, MTOW ${(SR.MTOW??0).toFixed(0)} kg -> ${file}`;
}

export const VIEWS = { iso: [-0.62, 0.42], top: [0, 1.44], side: [-Math.PI/2, 0], front: [0, 0] };
export const CONFIGS = ["multicopter","sideBySide","liftcruise","tiltrotor","hybrid","hybridPusher"];

/* CLI only when run directly, so the freeze gate can import render() */
const isCLI = !!(process.argv[1] && process.argv[1].split("\\").join("/").endsWith("tools/render3d.mjs"));
if (isCLI) {
const OUT = process.argv[2] || ".";
const which = (process.argv[3] || "iso").split(",");
for (const cfg of CONFIGS)
  for (const v of which) {
    const [yaw,pitch] = VIEWS[v];
    console.log(render(cfg, yaw, pitch, 1100, 740, `${OUT}/${cfg}-${v}.png`));
  }
}
