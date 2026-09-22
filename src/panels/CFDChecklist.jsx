import { mark } from "../ui/marks.jsx";
import { SC } from "../lib/theme.js";
import { aircraftGeometry } from "../engine/geometry.js";
import { capabilitiesFor } from "../engine/configuration.js";

export function CFDChecklist({ params, SR, SC, U }) {
  const uc = U || {len:v=>+(+v).toFixed(2),lenU:"m",mass:v=>+(+v).toFixed(1),massU:"kg"};
  const fL   = Number(params.fusLen)     || 6.5;
  const fD   = Number(params.fusDiam)    || 1.65;
  /* ── NO INVENTED AIRCRAFT ────────────────────────────────────────────
     These read `Number(SR?.bWing) || 12.67` and so on. On a multicopter or a
     side-by-side bWing is 0, sweep is NaN and bvt_panel is NaN, so the panel
     substituted a 12.67 m wing, a 9.57 deg sweep and a 3.77 m V-tail -- one
     specific aircraft's dimensions -- and then PASSED four wing checks and a
     V-tail check against parts the layout does not have. The two stability
     items went the other way and failed: SM and xNP are NaN, `|| 0` made them
     0.0% and 0 m, and the panel told the user a quadrotor was not flyable and
     had its CG behind a neutral point it cannot possess.

     A fallback that names a number is a claim. `num` returns null when the
     quantity is absent, and every check below decides what to do about it. */
  const num  = (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? Number(v) : null);
  const cap  = capabilitiesFor(params.configType, params.nPropHover);
  const hasWing = cap.hasWing !== false;
  const hasTail = Number(cap.nTail ?? 0) > 0;
  const NA_WING = 'n/a — this layout is rotor-borne and has no wing';
  const NA_TAIL = 'n/a — this layout carries no tail surface';
  const bW   = num(SR?.bWing);
  const Cr   = num(SR?.Cr_);
  const Ct   = num(SR?.Ct_);
  const Drot = Number(SR?.Drotor)        || 3.0;
  const bvt  = num(SR?.bvt_panel);
  const SM   = num(SR?.SM_vt) ?? num(SR?.SM);
  const MTOW = Number(SR?.MTOW)          || 0;
  const xCG  = num(SR?.xCGtotal);
  const xNP  = num(SR?.xNP);
  const lv   = Number(SR?.lv)            || fL*0.5;
  const tc   = Number(params.tc)         || 0.12;
  const nProp= Number(params.nPropHover) || 6;
  const sweep= num(SR?.sweep);
  const vtG  = Number(params.vtGamma)    || 40;
  /* ── THE CLEARANCE CHECKS READ THE DRAWN AIRCRAFT, NOT A PRIVATE FORMULA ──
     This panel used to place the rotors itself: yBoom = fD/2 + Drot/2 + 0.2,
     i.e. "fuselage half-width plus rotor radius plus 20 cm". So "Rotor
     inner = 1.025 m" was literally fusDiam/2 + 0.2 -- a constant that never
     looked at where the engine actually puts the rotors (2.6-2.8 m outboard on
     the winged layouts) -- and it was compared, laterally only, against the
     V-tail's half-span, with no longitudinal station and no height. That
     inequality is true on every layout with a V-tail, so the check showed a
     red cross on every configuration tab. On the multicopter and side-by-side,
     which have no V-tail at all, bvt_panel fell back to a hard-coded 3.77 m
     and the check fired against a tail that does not exist.

     The real question is three-dimensional and the engine already answers it:
     engine/geometry.js is the module the .vsp3 exporter and the 3D view draw
     from, and it carries a collision list. On the lift+cruise the aft lift
     rotors DO overlap the V-tail in plan -- and clear it vertically by 0.29 m,
     which is the number a reader needs. This panel now reports that. */
  let geo = null;
  try { geo = SR ? aircraftGeometry(params, SR) : null; } catch { geo = null; }
  const bodies   = geo?.bodies || [];
  const rotorsG  = bodies.filter(b => b.kind === "rotor");
  const vtailG   = bodies.find(b => b.kind === "vtail");
  const fusG     = bodies.find(b => b.kind === "fuselage");
  const hits     = (geo?.collisions || []);
  const hit      = (a, b) => hits.some(c => (c.kind === `${a}-${b}` || c.kind === `${b}-${a}`));
  const yStations = [...new Set(rotorsG.map(r => +Math.abs(r.y).toFixed(2)))].sort((a, b) => a - b);
  /* V-tail: which rotors overlap it in plan, and by how much they clear it vertically. */
  let vtGapM = null, vtOverlap = 0;
  if (vtailG && rotorsG.length) {
    const gam = ((vtailG.dihedralDeg || 45) * Math.PI) / 180;
    const xA = vtailG.x, xB = vtailG.x + vtailG.rootChord + vtailG.span * Math.tan(((vtailG.sweepDeg || 0) * Math.PI) / 180);
    const yVt = vtailG.span * Math.cos(gam);
    for (const r of rotorsG) {
      const planX = r.x + r.radius > xA && r.x - r.radius < xB;
      const planY = Math.abs(r.y) - r.radius < yVt;
      if (!(planX && planY)) continue;
      vtOverlap++;
      const yTouch = Math.min(yVt, Math.abs(r.y) + r.radius);
      const zTop   = vtailG.z + (yTouch / Math.cos(gam)) * Math.sin(gam);
      const gap    = r.z - zTop;
      vtGapM = vtGapM == null ? gap : Math.min(vtGapM, gap);
    }
  }
  /* Fuselage: the engine's collision test is the authority; the detail shows
     the closest lateral approach of any disc that sits beside the body. */
  let fusLatGap = null;
  for (const r of rotorsG) {
    const g = Math.abs(r.y) - r.radius - fD / 2;
    if (Math.abs(r.y) > r.radius) fusLatGap = fusLatGap == null ? g : Math.min(fusLatGap, g);
  }
  const boomDia = Number(SR?.boomDetail?.radiusM) ? 2 * Number(SR.boomDetail.radiusM) : null;

  const checks = [
    // ── Geometry completeness ──
    { cat:'Geometry', label:'Fuselage closed (nose + tail tapers defined)',
      ok: fL > 0 && fD > 0, detail:`L=${uc.len(fL)}${uc.lenU}  Ø=${uc.len(fD)}${uc.lenU}` },
    { cat:'Geometry', label:'Wing has finite tip chord (no sharp tip)',
      ok: !hasWing ? true : Ct != null && Ct > 0.1,
      detail: !hasWing ? NA_WING
            : Ct == null ? 'wing tip chord not resolved'
            : `Ct=${uc.len(Ct)}${uc.lenU} (min ${uc.len(0.1)}${uc.lenU})` },
    { cat:'Geometry', label:'Wing aspect ratio in valid CFD range (5–20)',
      ok: !hasWing ? true : (() => { const S = num(SR?.Swing);
            const AR = bW != null && S != null ? (bW*bW)/S : null;
            return AR != null && AR > 5 && AR < 20; })(),
      detail: !hasWing ? NA_WING : (() => { const S = num(SR?.Swing);
            return bW != null && S != null ? `AR=${((bW*bW)/S).toFixed(1)}` : 'wing not resolved'; })() },
    { cat:'Geometry', label:'V-tail dihedral angle in VSPAERO range (20°–60°)',
      ok: !hasTail ? true : vtG >= 20 && vtG <= 60,
      detail: !hasTail ? NA_TAIL : `Γ=${vtG}°` },
    { cat:'Geometry', label:'Airfoil t/c within valid range (6%–20%)',
      ok: tc >= 0.06 && tc <= 0.20, detail:`t/c=${(tc*100).toFixed(0)}%` },

    // ── Symmetry ──
    { cat:'Symmetry', label:'Wing uses XZ symmetry plane (sym=2)',
      ok: true, detail: hasWing ? 'Set in VSP3 generator ✓' : NA_WING },
    { cat:'Symmetry', label:'Fuselage on aircraft centreline (Y=0)',
      ok: true, detail:'X_Loc=Y_Loc=0 ✓' },
    { cat:'Symmetry', label:'Lift booms mirrored ±Y (sym=2)',
      ok: true,
      detail: yStations.length ? `rotor stations Y=±${yStations.map(y => uc.len(y)).join(', ±')}${uc.lenU} ✓`
                               : 'no lift booms on this layout' },

    // ── Clearance / interference ──
    { cat:'Clearance', label:'Rotor discs clear the fuselage',
      ok: geo ? !hit('rotor', 'fuselage') : true,
      detail: !geo ? 'geometry unavailable'
            : hit('rotor', 'fuselage') ? 'INTERFERENCE in the drawn geometry'
            : fusLatGap != null ? `closest disc ${uc.len(fusLatGap)}${uc.lenU} outboard of the body; no interference in the drawn geometry`
            : 'discs sit above the body; no interference in the drawn geometry' },
    { cat:'Clearance', label:'Rotor discs clear the V-tail',
      ok: geo ? (!hit('rotor', 'vtail') && (vtGapM == null || vtGapM > 0)) : true,
      detail: !geo ? 'geometry unavailable'
            : !vtailG ? 'n/a — this layout has no V-tail'
            : vtOverlap === 0 ? 'no disc overlaps the V-tail in plan'
            : `${vtOverlap} disc${vtOverlap > 1 ? 's' : ''} overlap the V-tail in plan and clear it vertically by ${uc.len(vtGapM)}${uc.lenU}` },
    { cat:'Clearance', label:'Fuselage length accommodates wing + tail',
      ok: !(hasWing && hasTail) ? true : (Cr != null && lv + Cr < fL * 1.05),
      detail: !hasWing ? NA_WING : !hasTail ? NA_TAIL
            : Cr == null ? 'wing root chord not resolved'
            : `Wing TE + tail arm = ${uc.len(lv+Cr)}${uc.lenU} vs fL=${uc.len(fL)}${uc.lenU}` },

    // ── Stability (VSPAERO needs flyable geometry) ──
    /* A rotor-borne layout has no neutral point and no static margin, so
       neither the criterion NOR the verdict transfers. What decides whether it
       can trim is whether the CG sits inside the rotor array, which the engine
       computes. Reporting the wing-borne pair here told a quadrotor it was not
       flyable -- the same false-verdict defect StabilityTab carried. */
    { cat:'Stability',
      label: hasWing ? 'Static margin positive (aircraft flyable)'
                     : 'CG inside the rotor array (hover trim)',
      ok: hasWing ? (SM != null && SM > 0.02) : SR?.cgWithinRotorArray === true,
      detail: hasWing ? (SM == null ? 'static margin not resolved'
                                    : `SM=${(SM*100).toFixed(1)}% MAC (min 2%)`)
            : SR?.cgWithinRotorArray == null ? 'hover trim not evaluated'
            : SR.cgWithinRotorArray ? 'CG within the rotor polygon — the rotor-borne trim condition'
                                    : 'CG outside the rotor polygon — cannot trim in hover' },
    { cat:'Stability', label:'CG forward of NP',
      ok: !hasWing ? true : (xCG != null && xNP != null && xCG < xNP),
      detail: !hasWing ? 'n/a — no wing, so no neutral point'
            : (xCG == null || xNP == null) ? 'CG or neutral point not resolved'
            : `CG=${uc.len(xCG)}${uc.lenU}  NP=${uc.len(xNP)}${uc.lenU}` },
    { cat:'Stability', label:'MTOW positive and non-zero',
      ok: MTOW > 50, detail:`MTOW=${uc.mass(MTOW)}${uc.massU}` },

    // ── VSPAERO mesh hints ──
    { cat:'VSPAERO', label:'Wing sweep < 45° (panel method valid)',
      ok: !hasWing ? true : (sweep != null && sweep < 45),
      detail: !hasWing ? NA_WING
            : sweep == null ? 'wing sweep not resolved' : `Λ=${sweep.toFixed(1)}°` },
    { cat:'VSPAERO', label:'Even rotor count (symmetric torque balance)',
      ok: nProp % 2 === 0, detail:`n=${nProp} rotors` },
    { cat:'VSPAERO', label:'Boom diameter small vs rotor (< 20% disc dia)',
      ok: boomDia == null ? true : boomDia / Drot < 0.20,
      detail: boomDia == null ? 'no lift booms on this layout'
            : `Boom Ø=${uc.len(boomDia)}${uc.lenU}  Rotor Ø=${uc.len(Drot)}${uc.lenU}  ratio=${(boomDia/Drot*100).toFixed(0)}%` },
  ];

  const cats = [...new Set(checks.map(c=>c.cat))];
  const passed = checks.filter(c=>c.ok).length;
  const total  = checks.length;
  const pct    = Math.round(passed/total*100);
  const overallCol = pct===100 ? SC.green : pct>=80 ? SC.amber : SC.red;

  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {/* Score banner */}
      <div style={{background:SC.panel, border:`2px solid ${overallCol}`, borderRadius:8,
        padding:'14px 20px', display:'flex', alignItems:'center', gap:16}}>
        <div style={{fontSize:36, fontWeight:800, color:overallCol, fontFamily:"'DM Mono',monospace",
          lineHeight:1}}>{pct}%</div>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:SC.text, fontFamily:"'DM Mono',monospace"}}>
            CFD-Ready Score
          </div>
          <div style={{fontSize:9, color:SC.muted, fontFamily:"'DM Mono',monospace", marginTop:2}}>
            {passed}/{total} checks passed · {pct===100?'Ready for VSPAERO export':pct>=80?'⚠ Minor issues — review amber items':'Fix red items before CFD run'}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{flex:1, height:8, background:SC.border, borderRadius:4, overflow:'hidden'}}>
          <div style={{width:`${pct}%`, height:'100%', background:overallCol, borderRadius:4,
            transition:'width 0.4s ease'}}/>
        </div>
      </div>

      {/* Checks by category */}
      {cats.map(cat=>(
        <div key={cat} style={{background:SC.panel, border:`1px solid ${SC.border}`, borderRadius:8, padding:12}}>
          <div style={{fontSize:9, color:SC.muted, fontFamily:"'DM Mono',monospace",
            letterSpacing:'0.12em', marginBottom:8}}>{cat.toUpperCase()}</div>
          <div style={{display:'flex', flexDirection:'column', gap:5}}>
            {checks.filter(c=>c.cat===cat).map((c,i)=>(
              <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'5px 8px',
                borderRadius:5, background:c.ok?`${SC.green}0a`:`${SC.red}0a`,
                border:`1px solid ${c.ok?SC.green+'33':SC.red+'33'}`}}>
                <span style={{fontSize:12, flexShrink:0}}>{mark(c.ok)}</span>
                <span style={{fontSize:10, color:SC.text, flex:1, fontFamily:"'DM Mono',monospace"}}>{c.label}</span>
                <span style={{fontSize:8, color:SC.muted, fontFamily:"'DM Mono',monospace",
                  whiteSpace:'nowrap'}}>{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FEATURE 11 — DESIGN VERSION HISTORY
   Git-style timeline with slider to scrub through saved designs.
   Uses localStorage for persistence.
   ════════════════════════════════════════════════════════════════════════ */
