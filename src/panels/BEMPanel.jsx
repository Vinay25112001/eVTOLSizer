import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import { useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { SC } from "../lib/theme.js";
import { KPI } from "../ui/primitives.jsx";

export function BEMPanel({ params, SR, SC, U }) {
  /* ───────────────────────────────────────────────────────────────────────
   *  PHYSICS MODEL:
   *    BEM equations (Leishman 2006 §3.3–3.4)
   *    Prandtl tip-loss + root-loss (Xu & Sankar 2002)
   *    Buhl (2005) turbulent-wake correction — CT-based trigger
   *    Swirl (tangential induction a') — full 2-equation BEM
   *    Constant chord (first-order approx — stated explicitly)
   *    Empirical polar: Cl=f(α) piecewise, Cd=Cd0+kCl² (approx; not Re-dependent)
   *
   *  NUMERICAL METHOD:
   *    Fixed-point iteration, 150 iter max, tol=1e-7
   *    Under-relaxation ω=0.7 (conservative, avoids oscillation)
   *    Radial initial guess: λ₀ ∝ r/R (improves convergence vs global guess)
   *    Hub cutout: r_hub/R = 0.10 (no load computed inside hub)
   *
   *  SAFEGUARDS:
   *    Denominator floor 1e-6 everywhere
   *    a clipped [0, 0.97],  a' clipped [0, 0.5]
   *    Hub cutout eliminates root singularity
   *    Mach tip check before entry
   *
   *  VALIDITY:
   *    Hover only (V_∞ = 0), incompressible (M_tip < 0.7),
   *    moderate loading (CT < 0.15), rigid blade, no wake distortion
   *
   *  REFERENCES:
   *    Leishman, J.G. (2006) Principles of Helicopter Aerodynamics, §3.3-3.4
   *    Buhl, M.L. (2005) NREL/TP-500-36834
   *    Xu, G. & Sankar, L.N. (2002) J. Am. Helicopter Soc. 47(3)
   *    Ning, S.A. (2013) Wind Energy 17(7), 1199-1210
   * ─────────────────────────────────────────────────────────────────────── */

  const [twist,   setTwist]   = useState(-8);    // deg/R, linear twist (washout)
  const [chord_r, setChordR]  = useState(0.08);  // c/R — CONSTANT chord (1st-order approx)
  const [Nbld,    setNbld]    = useState(3);
  const [theta0,  setTheta0]  = useState(12);    // collective pitch at 0.75R (deg)
  const [Clalpha, setClAlpha] = useState(5.73);  // lift slope per rad (empirical approx)
  const [Cd0,     setCd0]     = useState(0.011); // profile drag at Cl=0
  const [hubR,    setHubR]    = useState(0.10);  // hub cutout r_hub/R
  const [results, setResults] = useState(null);
  const [warning, setWarning] = useState('');

  const runBEM = () => {
    setWarning('');
    const NR    = 40;
    const R     = SR ? SR.Drotor / 2 : +(params.propDiam) / 2;
    const RPM   = +(SR?.RPM) || 500;
    const B     = Nbld;
    const rho   = 1.225;
    const g0    = 9.81;
    const Omega = RPM * Math.PI / 30;
    const Vtip  = Omega * R;
    const c     = chord_r * R;             // constant chord (explicit assumption)
    const nRot  = +(SR?.nPropHover || params.nPropHover) || 6;
    const MTOW  = SR?.MTOW || 2177;
    const T_req = MTOW * g0 / nRot;
    const A_disk = Math.PI * R * R;
    const r_hub  = hubR * R;               // hub cutout in meters

    // ── #12 validity check ─────────────────────────────────────────────
    if (Vtip > 340) { setWarning('⚠ Tip speed ≥ speed of sound — model invalid. Reduce RPM.'); return; }
    if (Vtip / 340 > 0.70) setWarning('⚠ Tip Mach > 0.70 — compressibility effects not modelled. Results approximate.');

    let T_total = 0.0, Q_total = 0.0, P_total = 0.0;
    const stations = [];
    let highIndCount = 0;
    let notConvCount = 0;

    for (let i = 1; i <= NR; i++) {
      // ── #1 Hub cutout: stations distributed over [r_hub/R, 1] ────────
      const r_R = hubR + (1.0 - hubR) * (i - 0.5) / NR;
      const r   = r_R * R;          // dimensional (METERS) — used in dQ, sigma_r
      const dr  = (1.0 - hubR) * R / NR;  // annulus width accounts for hub cutout

      // ── Blade pitch ───────────────────────────────────────────────────
      const theta = (theta0 + twist * (r_R - 0.75)) * Math.PI / 180.0;

      // ── #2 Local solidity (constant chord stated explicitly) ──────────
      // c = const (first-order approx). For tapered blades c=c(r) would be used.
      const sigma_r = B * c / (2.0 * Math.PI * r);

      // ── #9 Radial initial guess: λ₀ ∝ r/R ────────────────────────────
      const lam_global = Math.sqrt(T_req / (2.0 * rho * A_disk)) / Vtip;
      let lam  = lam_global * r_R;           // radial scaling
      let lam_prime = 0.01 * r_R;            // initial tangential induction
      lam  = Math.max(0.001, Math.min(lam,  0.5));
      lam_prime = Math.max(0.0,  Math.min(lam_prime, 0.3));

      let converged = false;

      for (let k = 0; k < 150; k++) {
        // ── #4 Inflow angle — dimensional form (avoids root blow-up) ──
        const vi    = lam       * Vtip;   // axial induced velocity (m/s)
        const v_rot = lam_prime * Omega * r; // tangential induced velocity (m/s)
        // phi = atan(vi / (Omega*r*(1+a'))) — full swirl form
        const phi     = Math.atan2(vi, Omega * r + v_rot);
        const sin_phi = Math.sin(phi);
        const cos_phi = Math.cos(phi);

        // ── #3 Prandtl TIP + ROOT loss ───────────────────────────────
        const f_tip  = (B / 2.0) * (1.0 - r_R) / Math.max(r_R * Math.abs(sin_phi), 1e-6);
        const F_tip  = (2.0 / Math.PI) * Math.acos(Math.min(1.0, Math.exp(-Math.abs(f_tip))));
        const f_root = (B / 2.0) * (r_R - hubR)  / Math.max(r_R * Math.abs(sin_phi), 1e-6);
        const F_root = (2.0 / Math.PI) * Math.acos(Math.min(1.0, Math.exp(-Math.abs(f_root))));
        const F = F_tip * F_root;          // combined loss factor

        // ── #5 Lift model (empirical — not Re-dependent) ───────────────
        const alpha_rad = theta - phi;
        const alpha_deg = alpha_rad * 180.0 / Math.PI;
        const absA = Math.abs(alpha_deg);
        let Cl;
        if (absA <= 10.0) {
          Cl = Clalpha * alpha_rad;
        } else if (absA <= 18.0) {
          const t = (absA - 10.0) / 8.0;
          const Cl10 = Clalpha * 10.0 * Math.PI / 180.0;
          Cl = Math.sign(alpha_rad) * (Cl10 * (1.0 - t) + 0.90 * t);
        } else {
          Cl = Math.sign(alpha_rad) * 0.90;
        }
        // NOTE: empirical approx only. For high fidelity use XFOIL polar table.

        // ── #6 Drag model (empirical polar, k≈0.012) ──────────────────
        // Cd = Cd0 + k*Cl²  where k is an empirical fit to section polar.
        // NOT 1/(π·e·AR) — that double-counts induced drag captured by phi.
        // NOTE: Re-dependence not modelled here.
        const Cd = Cd0 + 0.012 * Cl * Cl;

        // Force coefficients (thrust & torque directions)
        const Cn = Cl * cos_phi - Cd * sin_phi;  // thrust direction
        const Ct = Cl * sin_phi + Cd * cos_phi;  // torque direction

        // ── Relative velocity (hover, includes swirl) ──────────────────
        const W2 = (Omega * r + v_rot) ** 2 + vi ** 2;

        // ── Local CT from blade element (non-dim by ρ·Vtip²·A_disk) ──
        const CT_local = sigma_r * Cn * W2 / (4.0 * Math.max(F, 0.01) * Vtip * Vtip);

        // ── #8 Buhl correction — CT-based trigger (not a-based) ───────
        // Trigger: CT > 0.96·F  (Buhl 2005, Eq. 7)
        let a_new;
        if (CT_local > 0.96 * F) {
          highIndCount++;
          // Buhl quadratic: (50/9 - 4F)·a² + (4F - 40/9)·a + (8/9 - CT) = 0
          const Ab = 50.0 / 9.0 - 4.0 * F;
          const Bb = 4.0 * F - 40.0 / 9.0;
          const Cb = 8.0 / 9.0 - CT_local;
          const disc = Bb * Bb - 4.0 * Ab * Cb;
          if (disc >= 0 && Math.abs(Ab) > 1e-10) {
            a_new = Math.max(0.0, Math.min(0.97, (-Bb + Math.sqrt(disc)) / (2.0 * Ab)));
          } else {
            a_new = Math.max(0.0, Math.min(0.97, CT_local / (4.0 * Math.max(F, 0.01))));
          }
        } else {
          // Standard momentum: CT = 4·F·a·(1-a)  → solve quadratic
          // a² - a + CT/(4F) = 0
          const discS = 1.0 - CT_local / Math.max(F, 0.01);
          a_new = discS >= 0 ? 0.5 * (1.0 - Math.sqrt(discS)) : CT_local / (4.0 * Math.max(F, 0.01));
          a_new = Math.max(0.0, Math.min(0.97, a_new));
        }
        const lam_new = a_new * r_R * Math.sqrt(W2) / Math.max(Vtip * (1.0 - a_new), 1e-6);

        // ── #7 Swirl / tangential induction a' ────────────────────────
        // From torque momentum balance: dQ_mom = 4·F·ρ·a'·(1+a')·(Ω·r)²·2π·r·dr
        // From blade element: dQ_be = 0.5·ρ·W²·B·c·Ct·r·dr
        // → a'·(1+a') = sigma_r·Ct·W² / (4·F·(Ω·r)²)
        // Solve quadratic for a':
        const rhs_prime = sigma_r * Ct * W2 / (4.0 * Math.max(F, 0.01) * (Omega * r) * (Omega * r));
        // a'² + a' - rhs_prime = 0  → a' = (-1 + sqrt(1 + 4*rhs_prime))/2
        const ap_new = rhs_prime > 0
          ? (-1.0 + Math.sqrt(1.0 + 4.0 * rhs_prime)) / 2.0
          : 0.0;
        const lam_prime_new = Math.max(0.0, Math.min(0.5, ap_new));

        // ── #10 Under-relaxation ω = 0.7 (conservative) ──────────────
        const lam_next       = 0.7 * lam       + 0.3 * Math.max(1e-4, Math.min(lam_new,       0.9));
        const lam_prime_next = 0.7 * lam_prime + 0.3 * Math.max(0.0,  Math.min(lam_prime_new, 0.5));

        const err = Math.abs(lam_next - lam) + Math.abs(lam_prime_next - lam_prime);
        lam       = lam_next;
        lam_prime = lam_prime_next;
        if (err < 1e-7) { converged = true; break; }
      }
      if (!converged) notConvCount++;

      // ── Final forces with converged lam, lam_prime ────────────────────
      const vi_f    = lam       * Vtip;
      const v_rot_f = lam_prime * Omega * r;
      const phi_f   = Math.atan2(vi_f, Omega * r + v_rot_f);
      const alpha_f = theta - phi_f;
      const alpha_fdeg = alpha_f * 180.0 / Math.PI;
      const absAf = Math.abs(alpha_fdeg);
      let Cl_f;
      if (absAf <= 10.0) Cl_f = Clalpha * alpha_f;
      else if (absAf <= 18.0) {
        const t = (absAf - 10.0) / 8.0;
        Cl_f = Math.sign(alpha_f) * (Clalpha * 10 * Math.PI / 180 * (1-t) + 0.90 * t);
      } else Cl_f = Math.sign(alpha_f) * 0.90;
      const Cd_f = Cd0 + 0.012 * Cl_f * Cl_f;
      const Cn_f = Cl_f * Math.cos(phi_f) - Cd_f * Math.sin(phi_f);
      const Ct_f = Cl_f * Math.sin(phi_f) + Cd_f * Math.cos(phi_f);
      const W2_f = (Omega * r + v_rot_f) ** 2 + vi_f ** 2;
      const q_f  = 0.5 * rho * W2_f;

      const dT = B * q_f * c * Cn_f * dr;       // thrust  (N)
      const dQ = B * q_f * c * Ct_f * r * dr;    // torque  (N·m), r in METERS
      const dP = dQ * Omega;                      // power   (W)

      T_total += dT;
      Q_total += dQ;
      P_total += dP;

      const f_tip_f  = (B/2)*(1-r_R) / Math.max(r_R * Math.abs(Math.sin(phi_f)), 1e-6);
      const F_tip_f  = (2/Math.PI)*Math.acos(Math.min(1.0, Math.exp(-Math.abs(f_tip_f))));
      const f_root_f = (B/2)*(r_R-hubR) / Math.max(r_R * Math.abs(Math.sin(phi_f)), 1e-6);
      const F_root_f = (2/Math.PI)*Math.acos(Math.min(1.0, Math.exp(-Math.abs(f_root_f))));
      const F_f      = F_tip_f * F_root_f;
      const a_f      = lam / (lam + r_R + 1e-6);

      stations.push({
        rR:        +r_R.toFixed(3),
        lam:       +lam.toFixed(5),
        lam_prime: +lam_prime.toFixed(5),
        phi_deg:   +(phi_f * 180 / Math.PI).toFixed(2),
        alpha_deg: +alpha_fdeg.toFixed(2),
        Cl:        +Cl_f.toFixed(4),
        Cd:        +Cd_f.toFixed(5),
        F:         +F_f.toFixed(4),
        F_tip:     +F_tip_f.toFixed(4),
        F_root:    +F_root_f.toFixed(4),
        a:         +a_f.toFixed(4),
        ap:        +lam_prime.toFixed(5),
        dT:        +(dT / dr).toFixed(2),
        dQ:        +(dQ / dr).toFixed(4),
        converged,
      });
    }

    // ── #14 Figure of Merit ────────────────────────────────────────────
    // FM = P_ideal / P_actual = T^1.5/sqrt(2ρA) / P_actual
    // Typical hover FM: 0.65–0.80 (can exceed in idealised models)
    const P_ideal = Math.pow(Math.max(T_total, 1.0), 1.5) / Math.sqrt(2.0 * rho * A_disk);
    const FM      = P_ideal / Math.max(P_total, 1.0);

    // Actuator disk comparison (#13 validation vs simpler model)
    const P_act_1rot = (T_req / (+(params.etaHov) || 0.72)) * Math.sqrt(T_req / (2 * rho * A_disk));
    const P_BEM_kW   = P_total * nRot / 1000.0;
    const P_AKT_kW   = P_act_1rot * nRot / 1000.0;
    const T_ratio    = T_req > 0 ? +(T_total / T_req * 100).toFixed(1) : 0;
    const delta_pct  = P_AKT_kW > 0 ? +((P_BEM_kW - P_AKT_kW) / P_AKT_kW * 100).toFixed(1) : 0;

    const warns = [];
    if (notConvCount > 5) warns.push(`${notConvCount} stations did not converge — try smoother inputs`);
    if (highIndCount > 10) warns.push(`${highIndCount} stations: Buhl correction active (CT > 0.96F)`);
    if (FM > 0.90) warns.push('FM > 0.90 — model may be over-idealised (empirical polar only)');
    if (T_total / T_req > 1.5) warns.push('T_BEM >> T_req — collective may be too high, check stall');
    if (warns.length) setWarning('⚠ ' + warns.join(' | '));

    setResults({
      T_total:+T_total.toFixed(1), T_req:+T_req.toFixed(1), T_ratio,
      Q_total:+Q_total.toFixed(2),
      P_rotor:+(P_total/1000).toFixed(3),
      P_BEM_kW:+P_BEM_kW.toFixed(1), P_AKT_kW:+P_AKT_kW.toFixed(1), delta_pct,
      FM:+FM.toFixed(4),
      sigma_global: +(B * chord_r / Math.PI).toFixed(4),
      highIndCount, notConvCount, stations,
    });
  };

  const S = { fontSize:10, fontFamily:"'DM Mono',monospace", color:SC.muted };
  const uc = U || {power:v=>+v.toFixed(1), powerU:"kW", speed:v=>+v.toFixed(1), speedU:"m/s", len:v=>+v.toFixed(2), lenU:"m"};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${SC.bg},#0d1f0d)`,border:`1px solid ${SC.green}44`,borderRadius:10,padding:'16px 20px'}}>
        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:'0.18em',marginBottom:4}}>
          ITERATIVE BEM · TIP+ROOT LOSS · BUHL CT-TRIGGER · SWIRL (a′) · HUB CUTOUT
        </div>
        <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
          <span style={{color:SC.green}}>Blade Element Momentum</span> Rotor Solver
        </div>
        <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:780}}>
          Full 2-equation BEM (axial + tangential induction). Hub cutout r_hub/R eliminates root singularity.
          Prandtl tip AND root loss. Buhl correction triggered by C_T {'>'} 0.96F (not induction factor).
          Constant chord (stated assumption). Empirical polar — not Re-dependent.
          <strong style={{color:SC.amber}}> Valid: hover, M_tip {'<'} 0.7, moderate loading.</strong>
        </div>
      </div>

      {/* Controls */}
      <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'14px 16px'}}>
        <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Blade Geometry Inputs</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
          {[
            ['Collective θ₀.₇₅', theta0, setTheta0, 2, 22, 0.5, '°', 'Pitch at 0.75R. Increase until T_BEM ≈ T_required.'],
            ['Linear Twist', twist, setTwist, -20, 0, 0.5, '°/R', 'Washout referenced to 0.75R. Typical: −6° to −14°.'],
            ['Chord/Radius c/R', chord_r, setChordR, 0.03, 0.18, 0.005, '', 'Constant chord (1st-order approx). Typical eVTOL: 0.06–0.12.'],
            ['Blade Count B', Nbld, setNbld, 2, 8, 1, 'blades', 'More blades → smoother thrust, higher noise.'],
            ['Lift Slope Clα', Clalpha, setClAlpha, 4.0, 7.0, 0.05, '/rad', 'Empirical approx. NACA 0012 ≈ 5.73. For accuracy use XFOIL polar.'],
            ['Profile Drag Cd₀', Cd0, setCd0, 0.005, 0.030, 0.001, '', 'NACA 0012 at Re≈1M ≈ 0.011. Not Re-dependent here.'],
            ['Hub Cutout r_hub/R', hubR, setHubR, 0.05, 0.25, 0.01, '', 'Eliminates hub singularity. Typical: 0.08–0.15.'],
          ].map(([label,val,setter,min,max,step,unit,tip]) => (
            <div key={label}>
              <div style={{...S,marginBottom:3}}>{label}{unit&&<span style={{color:SC.amber,marginLeft:4}}>{unit}</span>}</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="range" min={min} max={max} step={step} value={val}
                  onChange={evt=>setter(+evt.target.value)} style={{flex:1}}/>
                <span style={{...S,color:SC.amber,fontWeight:700,minWidth:40,textAlign:'right'}}>{val}</span>
              </div>
              <div style={{fontSize:8,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:2,lineHeight:1.4}}>{tip}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={runBEM} type="button"
            style={{padding:'9px 28px',background:`linear-gradient(135deg,#052e16,${SC.green}88)`,border:`2px solid ${SC.green}`,borderRadius:7,color:SC.green,fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>
            Run BEM Analysis
          </button>
          {SR&&(
            <span style={{...S,color:SC.muted,fontSize:9}}>
              From sizing: R={uc.len(SR.Drotor/2)}{uc.lenU} · RPM={SR.RPM} · {SR.nPropHover} rotors · T_req/rotor={(SR.MTOW*9.81/SR.nPropHover).toFixed(0)}N · V_tip={uc.speed(SR.RPM*Math.PI/30*(SR.Drotor/2))}{uc.speedU} · M_tip={(SR.TipMach).toFixed(3)}
            </span>
          )}
        </div>
        {warning&&<div style={{marginTop:10,padding:'8px 12px',background:`${SC.amber}15`,border:`1px solid ${SC.amber}44`,borderRadius:6,fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>{warning}</div>}
      </div>

      {results&&(<>
        {/* KPI row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          {[
            ['T_BEM / rotor', `${results.T_total} N`, results.T_ratio>=90?SC.green:results.T_ratio>=60?SC.amber:SC.red],
            ['T_required',    `${results.T_req} N`,   SC.muted],
            ['T_BEM/T_req',   `${results.T_ratio}%`,  results.T_ratio>=90?SC.green:SC.red],
            ['Figure of Merit', results.FM,             results.FM>=0.75?SC.green:results.FM>=0.65?SC.amber:SC.red],
            ['σ (global)',    results.sigma_global,    SC.teal],
            ['P_BEM total',   `${uc.power(results.P_BEM_kW)} ${uc.powerU}`, SC.purple],
          ].map(([label,val,col])=>(
            <div key={label} style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'8px 10px',textAlign:'center',borderTop:`2px solid ${col}`}}>
              <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:'uppercase',marginBottom:3}}>{label}</div>
              <div style={{fontSize:13,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Insight box */}
        <div style={{padding:'12px 16px',background:results.T_ratio<80?`${SC.amber}0e`:`${SC.green}0e`,border:`1px solid ${results.T_ratio<80?SC.amber:SC.green}44`,borderRadius:8,fontSize:11,color:SC.text,fontFamily:"'DM Mono',monospace",lineHeight:1.9}}>
          {results.T_ratio<80
            ?`⚠ T_BEM (${results.T_total}N) = ${results.T_ratio}% of T_req. Increase collective θ₀.₇₅ or c/R. σ_global=${results.sigma_global} — target σ > 0.09 for adequate loading.`
            :`✓ T_BEM matches requirement. FM=${results.FM} — typical hover FM: 0.65–0.80 (${results.FM>=0.75?'well-designed':results.FM>=0.65?'acceptable':'review blade geometry'}). BEM: ${uc.power(results.P_BEM_kW)} ${uc.powerU} vs actuator disk: ${uc.power(results.P_AKT_kW)} ${uc.powerU} (Δ${results.delta_pct>0?'+':''}${results.delta_pct}%). Torque/rotor: ${results.Q_total}N·m.`
          }
          {results.highIndCount>0&&` | ${results.highIndCount} stations: Buhl correction (CT>0.96F).`}
        </div>

        {/* Validity / model notes box */}
        <div style={{padding:'10px 14px',background:`${SC.blue}08`,border:`1px solid ${SC.blue}33`,borderRadius:8,fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.8}}>
          <strong style={{color:SC.blue}}>Model assumptions & validity envelope:</strong>{' '}
          Hover only (V∞=0) · Incompressible (M_tip {'<'} 0.7) · Constant chord (1st-order) ·
          Cl=f(α) empirical (not Re-dependent — use XFOIL for high fidelity) ·
          Cd=Cd0+0.012·Cl² (empirical polar, k≈0.012) ·
          Swirl included (a′ solved) · Prandtl tip+root loss · Buhl CT-trigger ·
          Hub cutout r_hub/R={hubR} · Rigid blade, no wake distortion.
        </div>

        {/* Charts 2×2 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Thrust Grading dT/dr (N/m) vs r/R</div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={results.stations} margin={{top:4,right:12,left:-10,bottom:16}}>
                <defs><linearGradient id="bemg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SC.green} stopOpacity={0.45}/>
                  <stop offset="95%" stopColor={SC.green} stopOpacity={0.02}/>
                </linearGradient></defs>
                <CartesianGrid {...chartGrid()}/>
                <XAxis dataKey="rR" tick={{fontSize:9,fill:SC.muted}} label={{value:'r/R',position:'insideBottom',offset:-6,fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <YAxis tick={{fontSize:9,fill:SC.muted}} label={{value:'dT/dr (N/m)',angle:-90,position:'insideLeft',fontSize:8,fill:SC.muted}} {...chartAxis()}/>
                <Tooltip formatter={(v)=>[`${v} N/m`,'dT/dr']} contentStyle={{background:SC.panel,border:`1px solid ${SC.border}`,fontSize:9}}/>
                <Area isAnimationActive={false} type="monotone" dataKey="dT" stroke={SC.green} strokeWidth={2} fill="url(#bemg1)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Axial (a) & Tangential (a′) Induction vs r/R</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={results.stations} margin={{top:4,right:12,left:-10,bottom:16}}>
                <CartesianGrid {...chartGrid()}/>
                <XAxis dataKey="rR" tick={{fontSize:9,fill:SC.muted}} label={{value:'r/R',position:'insideBottom',offset:-6,fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <Tooltip contentStyle={{background:SC.panel,border:`1px solid ${SC.border}`,fontSize:9}} {...chartTooltip()}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:8,fontFamily:"'DM Mono',monospace"}} {...chartLegend()}/>
                <Line isAnimationActive={false} type="monotone" dataKey="a"   stroke={SC.blue}  strokeWidth={2}   dot={false} name="a (axial)"/>
                <Line isAnimationActive={false} type="monotone" dataKey="ap"  stroke={SC.purple} strokeWidth={2}  dot={false} name="a′ (tangential)"/>
                <Line isAnimationActive={false} type="monotone" dataKey="F"   stroke={SC.amber} strokeWidth={1.5} dot={false} name="F (tip+root)"/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Section Cl, Cd & Inflow Angle φ (°) vs r/R</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={results.stations} margin={{top:4,right:12,left:-10,bottom:16}}>
                <CartesianGrid {...chartGrid()}/>
                <XAxis dataKey="rR" tick={{fontSize:9,fill:SC.muted}} label={{value:'r/R',position:'insideBottom',offset:-6,fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <YAxis tick={{fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <Tooltip contentStyle={{background:SC.panel,border:`1px solid ${SC.border}`,fontSize:9}} {...chartTooltip()}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:8,fontFamily:"'DM Mono',monospace"}} {...chartLegend()}/>
                <Line isAnimationActive={false} type="monotone" dataKey="Cl"      stroke={SC.teal}   strokeWidth={2}   dot={false} name="Cl"/>
                <Line isAnimationActive={false} type="monotone" dataKey="phi_deg" stroke={SC.orange} strokeWidth={2}   dot={false} name="φ (°)"/>
                <Line isAnimationActive={false} type="monotone" dataKey="Cd"      stroke={SC.red}    strokeWidth={1.5} dot={false} name="Cd×10" formatter={(v)=>(v*10).toFixed(4)}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>Section AoA α (°) vs r/R — stall onset at 10°</div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={results.stations} margin={{top:4,right:12,left:-10,bottom:16}}>
                <defs><linearGradient id="bemg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SC.blue} stopOpacity={0.35}/>
                  <stop offset="95%" stopColor={SC.blue} stopOpacity={0.02}/>
                </linearGradient></defs>
                <CartesianGrid {...chartGrid()}/>
                <XAxis dataKey="rR" tick={{fontSize:9,fill:SC.muted}} label={{value:'r/R',position:'insideBottom',offset:-6,fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <YAxis tick={{fontSize:9,fill:SC.muted}} label={{value:'α (°)',angle:-90,position:'insideLeft',fontSize:9,fill:SC.muted}} {...chartAxis()}/>
                <Tooltip formatter={(v)=>[`${v}°`,'AoA']} contentStyle={{background:SC.panel,border:`1px solid ${SC.border}`,fontSize:9}}/>
                <ReferenceLine y={10} stroke={SC.amber} strokeDasharray="4 3" label={{value:'Stall onset 10°',fill:SC.amber,fontSize:8,position:'insideTopRight'}}/>
                <ReferenceLine y={-10} stroke={SC.amber} strokeDasharray="4 3"/>
                <Area isAnimationActive={false} type="monotone" dataKey="alpha_deg" stroke={SC.blue} strokeWidth={2} fill="url(#bemg2)" dot={false} name="α (°)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Station table — every 5th */}
        <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:'12px 14px',overflowX:'auto'}}>
          <div style={{fontSize:10,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace",marginBottom:8}}>
            Station Table (every 5th) — chord constant at c/R={chord_r}, hub cutout at r/R={hubR}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:9,fontFamily:"'DM Mono',monospace"}}>
            <thead>
              <tr style={{background:SC.bg}}>
                {['r/R','λ','a′','φ(°)','α(°)','Cl','Cd','F','a','dT/dr(N/m)'].map(h=>(
                  <th key={h} style={{padding:'4px 8px',textAlign:'right',color:SC.muted,borderBottom:`1px solid ${SC.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.stations.filter((_,i)=>i%5===0||i===results.stations.length-1).map((s,i)=>(
                <tr key={i} style={{background:i%2===0?SC.bg:'transparent'}}>
                  {[s.rR, s.lam, s.lam_prime, s.phi_deg, s.alpha_deg, s.Cl, s.Cd, s.F, s.a, s.dT].map((v,j)=>(
                    <td key={j} style={{padding:'4px 8px',textAlign:'right',
                      color: j===4&&Math.abs(v)>10 ? SC.red : j===4&&Math.abs(v)>8 ? SC.amber : SC.text}}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}
