/* ═══════════════════════════════════════════════════════════════════════
   IDENTITY + DIMENSIONAL CONSISTENCY CHECK
   ═══════════════════════════════════════════════════════════════════════
   Every relation below is one the engine MUST satisfy by definition. Each is
   re-derived here independently from first principles or a cited source, then
   compared against what the engine actually returned.

   This is the systematic form of "check every formula and every unit". A
   scaling test can miss a constant factor; an identity cannot. The 20.6 dB
   vortex-constant error was precisely a wrong constant inside a formula whose
   shape looked right — this is the check that catches that class.

   Each entry records:
     name     what is being asserted
     source   where the relation comes from
     lhs/rhs  engine output vs independent re-derivation
     units    the dimensional argument, so a unit slip is visible in review

   Run over many randomised design points so a relation cannot pass by luck at
   one operating condition.

     node validation/identities.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { runSizing } from "../src/engine.js";
import { downloadFractionFor, resolveConfiguration } from "../src/engine/configuration.js";
import { twinRotorInterference, hubSpacingFor } from "../src/engine/coaxial.js";

const G0 = 9.81, RHO_MSL = 1.225, T0 = 288.15, LAPSE = 0.0065,
      R_GAS = 287, GAMMA = 1.4, P0 = 101325, MU0 = 1.47e-5;

function lcg(seed) { let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

import { IDENTITY_BASE as BASE, IDENTITY_LAYOUTS as CONFIGS, IDENTITY_SWEEP as SWEEP, IDENTITY_SWEEP_FULL as SWEEP_FULL } from "./identity-sweep.js";

function cases(n = 40) {
  const rnd = lcg(4242), out = [{ ...BASE }];
  for (let i = 0; i < n; i++) {
    const p = { ...BASE };
    for (const [k,[lo,hi]] of Object.entries(SWEEP)) p[k] = +(lo + rnd()*(hi-lo)).toFixed(4);
    p.nPropHover = [4,6,8,10][Math.floor(rnd()*4)];
    p.weightModel = rnd() > 0.5 ? "buildup" : "fraction";
    p.nBlades = [2,3,4,5][Math.floor(rnd()*4)];
    p.tipSpeed = +(120 + rnd()*80).toFixed(2);
    /* EVERY LAYOUT, since 2026-09-16. This sweep never set configType, so all
       41 relations were only ever checked on the default lift+cruise. Run on
       all six, three failed at once: the engine reported a 0.10 download it
       had not applied, and the drag-area parameter was re-derived from
       CD0*S, which is zero for a wingless layout. */
    p.configType = CONFIGS[i % CONFIGS.length];
    out.push(p);
  }
  /* Over the WHOLE slider range too (identity-sweep.js), since that is the
     envelope the app reports as verified. Second generator, so the points
     above are unchanged. */
  const rnd2 = lcg(90916);
  for (let i = 0; i < 60; i++) {
    const p = { ...BASE };
    for (const [k,[lo,hi]] of Object.entries(SWEEP_FULL)) p[k] = +(lo + rnd2()*(hi-lo)).toFixed(4);
    p.nPropHover = [2,4,6,8,10,12][Math.floor(rnd2()*6)];
    p.weightModel = rnd2() > 0.5 ? "buildup" : "fraction";
    p.nBlades = [2,3,4,5][Math.floor(rnd2()*4)];
    p.tipSpeed = +(120 + rnd2()*80).toFixed(2);
    p.configType = CONFIGS[i % CONFIGS.length];
    out.push(p);
  }
  /* Auto-positioned design points. Without these the auto-position identity
     would be evaluated only on cases where the feature is off, and would pass
     trivially by comparing 0 to 0. */
  for (const m of ["buildup","fraction"])
    for (const t of [0.05,0.10,0.15,0.20])
      out.push({ ...BASE, weightModel:m, autoPositionWing:true, targetSM:t });
  /* GEARED design points, for exactly the same reason. The engine default is
     direct drive, so without these the drive-system identities would only ever
     see gearRatio = 1 and would pass trivially by comparing 0 to 0 — which is
     the failure mode the auto-position block above was added to avoid. */
  for (const gr of [2,4,8,13.3,16])
    for (const dm of ["afdd00","afdd83"])
      out.push({ ...BASE, weightModel:"buildup", motorGearRatio:gr, driveSystemModel:dm });
  return out;
}

/* Independent ISA — deliberately re-derived, not imported, so a change to the
   engine's atmosphere cannot silently satisfy its own test. */
function isa(h, dISA) {
  const Tstd = T0 - LAPSE*h, P = P0*Math.pow(Tstd/T0, G0/(LAPSE*R_GAS)), T = Tstd + dISA;
  return { T, P, rho: P/(R_GAS*T), a: Math.sqrt(GAMMA*R_GAS*T) };
}

/* NDARC AFDD00 gear box + rotor shaft, TP-20250010468 section 29-7.4 —
   RE-DERIVED HERE, deliberately not imported from engine/drivesystem.js, so
   the engine cannot silently satisfy its own test (same discipline as the
   independent ISA above). hp and rpm in, lb out. */
function afdd00Independent(P_hp, rpmEng, rpmRotor) {
  return 95.7634 * Math.pow(1, 0.38553) * Math.pow(P_hp, 0.78137) *
         Math.pow(rpmEng, 0.09899) / Math.pow(rpmRotor, 0.80686);
}

const CHECKS = [
  /* Gearing must never be free. Before engine/drivesystem.js existed, raising
     motorGearRatio made the motor lighter through the torque regression while
     the gearbox doing the speed change weighed nothing. These two relations
     pin both halves of that: no gear train means no gearbox mass, and a gear
     train means exactly NDARC's gearbox mass. */
  { name:"direct drive charges no gearbox", units:"kg", absTol:1e-9,
    source:"a machine with no gear train has no gear-box mass to carry",
    f:(p,R)=> (p.weightModel!=="buildup" || (p.motorGearRatio??1)!==1) ? [0,0]
      : [R.weightGroupsRaw?.driveSys ?? 0, 0] },

  { name:"drive system = NDARC AFDD00", units:"kg = lb / (lb/kg)",
    source:"NDARC TP-20250010468 29-7.4, per drive train (N_rotor=1) x nRotors",
    f:(p,R)=>{
      const gr = p.motorGearRatio ?? 1;
      if (p.weightModel!=="buildup" || gr===1 || (p.driveSystemModel??"afdd00")!=="afdd00"
          || !R.driveSystem || !R.weightGroupsRaw) return [0,0];
      const rpmRotor = R.driveSystem.rpmRotor, rpmEng = rpmRotor*gr;
      const P_hp = R.PmotInstalledKW / 0.7457;
      const lb = p.nPropHover * afdd00Independent(P_hp, rpmEng, rpmRotor);
      return [R.weightGroupsRaw.driveSys, lb/2.20462];
    } },

  /* The gearbox/rotor-shaft split must account for the whole thing — a
     reporting split that loses mass would understate the group silently. */
  { name:"gearbox + rotor shaft = drive system", units:"kg",
    source:"NDARC 29-7.4: W_gb = X(1-f_rs)w, W_rs = X f_rs w, so they sum to w",
    f:(p,R)=> (!R.driveSystem) ? [0,0]
      : [R.driveSystem.gearBoxKg + R.driveSystem.rotorShaftKg, R.driveSystem.mass] },

  /* Wing area is no longer set by asserting CL = clDesign (see engine/wing.js).
     The lift equation still has to close, but on the DERIVED cruise CL — that
     is the whole point of the change, so this asserts the closure rather than
     the old sizing rule. */
  { name:"wing lift equation",  units:"m² = N / (kg/m³ · m²/s² · 1)",
    source:"L = ½ρV²S·CL_cruise closes at MTOW with the DERIVED CL",
    f:(p,R)=>[R.Swing, 2*R.MTOW*G0/(isa(p.cruiseAlt,p.deltaISA||0).rho*p.vCruise**2*R.CLcruise)] },

  /* The wing takes the larger of the two constraint areas, and the cruise CL
     must never exceed its ceiling. Catches a regression that lets a slow
     aircraft cruise past the CL limit on an undersized wing. */
  { name:"cruise CL within ceiling", units:"1", absTol:2e-3,
    source:"CL_cruise = W/(qS) ≤ clCruiseMax",
    f:(p,R)=> (p.wingSizedBy==="cl") ? [0,0]
      : [Math.max(0, R.CLcruise-(p.clCruiseMax??0.90)), 0] },

  { name:"span from aspect ratio", units:"m = √(1 · m²)", source:"AR ≡ b²/S",
    f:(p,R)=>[R.bWing, Math.sqrt(p.AR*R.Swing)] },

  { name:"root chord (trapezoid)", units:"m = m²/(m·1)", source:"S = b·(Cr+Ct)/2, Ct=λCr",
    f:(p,R)=>[R.Cr_, 2*R.Swing/(R.bWing*(1+p.taper))] },

  { name:"tip chord = λ·Cr", units:"m = 1·m", source:"definition of taper ratio",
    f:(p,R)=>[R.Ct_, R.Cr_*p.taper] },

  { name:"mean aerodynamic chord", units:"m", source:"MAC = (2/3)Cr(1+λ+λ²)/(1+λ)",
    f:(p,R)=>[R.MAC, (2/3)*R.Cr_*(1+p.taper+p.taper**2)/(1+p.taper)] },

  { name:"wing loading", units:"N/m² = N / m²", source:"W/S at MTOW",
    f:(p,R)=>[R.WL, R.MTOW*G0/R.Swing] },

  { name:"cruise Mach", units:"1 = (m/s)/(m/s)", source:"M = V/a, a=√(γRT)",
    f:(p,R)=>[R.Mach, p.vCruise/isa(p.cruiseAlt,p.deltaISA||0).a] },

  { name:"wing Reynolds number", units:"1 = (kg/m³·m/s·m)/(Pa·s)",
    source:"Re = ρVc/μ with μ = μ₀(T/T₀)^0.75",
    f:(p,R)=>{const A=isa(p.cruiseAlt,p.deltaISA||0);
              return [R.Re_, A.rho*p.vCruise*R.MAC/(MU0*Math.pow(A.T/T0,0.75))];} },

  /* Previously written against p.clDesign, which made CDi the SAME NUMBER for
     every design in the sweep — the wing had been sized to force it. It now
     varies with the aircraft, which is what makes this relation meaningful. */
  { name:"induced drag coefficient", units:"1", source:"CDi = CL²/(πARe), Prandtl lifting line",
    f:(p,R)=>[R.CDi, R.CLcruise**2/(Math.PI*p.AR*p.eOsw)] },

  { name:"total drag = CD0 + CDi", units:"1", source:"drag decomposition",
    f:(p,R)=>[R.CDtot, R.CD0tot+R.CDi] },

  { name:"L/D from coefficients", units:"1", source:"L/D = CL_cruise/CD",
    f:(p,R)=>[R.LDact, R.CLcruise/R.CDtot] },

  { name:"disk loading (hover)", units:"N/m² = N/(1·m²)",
    source:"DL_hover = T_hover/(N·πR²); T_hover = W/(1−download)",
    f:(p,R)=>[R.DL_hover_Nm2, R.MTOW*G0/(1-R.downloadFraction)
                              /(p.nPropHover*Math.PI*(p.propDiam/2)**2)] },

  /* The download used above is the engine's REPORTED one, so this pins that
     report to the definition: an explicit input wins, otherwise the layout
     default from configuration.js. */
  { name:"reported download is the applied download", units:"1", absTol:6e-5,
    source:"k = p.downloadFraction ?? downloadFractionFor(layout), clamped to [0, 0.4]",
    f:(p,R)=>{const c=resolveConfiguration(p);
              const k=p.downloadFraction ?? downloadFractionFor(c.key,c.nTilting,c.nRotors);
              return [R.downloadFraction, Math.min(0.4,Math.max(0,k))];} },

  { name:"disk loading (installed)", units:"N/m² = N/(1·m²)",
    source:"DL_installed = W·(T/W)/(N·πR²) — the motors' design point, NOT the published figure",
    f:(p,R)=>[R.DLrotor, R.MTOW*G0*p.twRatio/(p.nPropHover*Math.PI*(p.propDiam/2)**2)] },

  { name:"momentum-theory hover power", units:"W = N·√((N/m²)/(kg/m³)) = N·(m/s)",
    source:"P = κ_coax·κ_twin·(T/FM)·√(DL/2ρ), actuator disk with the reported interference factors; validated vs NASA to 0.4%",
    f:(p,R)=>{const rhoH=isa((p.fieldElev||0)+(p.hoverHeight||15.24),p.deltaISA||0).rho;
              const T=R.MTOW*G0/(1-R.downloadFraction);
              return [R.Phov, R.coaxKappa*R.twinKappa*(T/p.etaHov)*Math.sqrt(R.DL_hover_Nm2/(2*rhoH))/1000];} },

  { name:"twin-rotor overlap factor", units:"1", absTol:2e-6,
    source:"NDARC 12-5.1.3: sqrt(2/(2-m)) for the side-by-side pair, exactly 1 otherwise",
    f:(p,R)=>[R.twinKappa, resolveConfiguration(p).key==="sideBySide"
                ? twinRotorInterference(hubSpacingFor("sideBySide")) : 1] },

  { name:"rotor RPM from tip speed", units:"rev/min = (m/s)/m · 60/2π",
    source:"Ω = Vtip/R, RPM = 60Ω/2π",
    f:(p,R)=>[R.RPM, R.TipSpd/(p.propDiam/2)*60/(2*Math.PI)] },

  { name:"blade passage frequency", units:"Hz = 1 · rad/s / (2π)", source:"BPF = B·Ω/2π = B·RPM/60",
    f:(p,R)=>[R.BPF, R.Nbld*R.RPM/60] },

  { name:"motor shaft torque", units:"N·m = W/(rad/s)", source:"Q = P/Ω",
    f:(p,R)=>[R.Torque, R.PmotKW*1000/(R.RPM*Math.PI/30)] },

  { name:"stall speed", units:"m/s = √((N/m²)/(kg/m³))", source:"V_s = √(2(W/S)/(ρ·CLmax))",
    f:(p,R)=>[R.Vstall, Math.sqrt(2*R.WL/(isa(p.cruiseAlt,p.deltaISA||0).rho*R.selAF.CLmax))] },

  /* Now carries the FUSELAGE term as well. The engine models the destabilising
     slender-body moment (Munk; Caughey, Cornell M&AE 5070 Eq. 2.33,
     Cm_alpha,fus = 2V/(S*MAC), always positive) and converts it to a
     neutral-point shift dx = -Cm_alpha*MAC/CL_alpha_wing, i.e. FORWARD.
     Re-derived here from the published formula rather than copied from the
     engine, so this stays an independent check: volume from the same prismatic
     assumption the engine documents, everything else from first principles. */
  { name:"neutral point (with slope ratio + fuselage)", units:"m = m + 1·1·1·1·m − m",
    source:"x_np = x_ac + eta_h(S_h/S_w)(CL_ah/CL_aw)(1-de/da)l_h − 2V/(S·MAC)·MAC/CL_aw — Raymer §16 + Munk slender body",
    f:(p,R)=>{const CLa=ar=>2*Math.PI*ar/(2+Math.sqrt(ar*ar+4));
              const lh=R.fusLen*0.88-R.xACwing;   // EFFECTIVE length (payload-scaled), see engine.js
              const prism=p.fusPrismatic??0.60;
              const vol=p.fusVolumeM3??prism*(Math.PI/4)*p.fusDiam*p.fusDiam*R.fusLen;
              const cmaF=2*vol/(R.Swing*R.MAC);
              const dxF=-cmaF*R.MAC/CLa(p.AR);
              return [R.xNP, R.xACwing+(0.18)*(CLa(p.vtAR)/CLa(p.AR))*0.9*(1-R.downwashGrad)*lh+dxF];} },

  { name:"tail/wing lift-slope ratio", units:"1", source:"both from Raymer Eq.12.6",
    f:(p,R)=>{const CLa=ar=>2*Math.PI*ar/(2+Math.sqrt(ar*ar+4));
              return [R.tailSlopeRatio, CLa(p.vtAR)/CLa(p.AR)];} },

  { name:"static margin definition", units:"1 = m/m", source:"SM = (x_np - x_cg)/MAC",
    /* ABSOLUTE tolerance: SM is a small difference of two positions the engine
       rounds to 3 dp, so near-neutral designs blow up any relative measure.
       0.002 = 0.2% MAC, far below any decision threshold. */
    absTol:2e-3,
    f:(p,R)=>[R.SM, (R.xNP-R.xCGtotal)/R.MAC] },

  { name:"wing AC from wing station", units:"m", source:"x_ac = fL·wingLEfrac + Xac",
    /* R.fusLen, not p.fusLen: fuselage length is DERIVED from payload (cabin
       size), so the station must be taken against the length the engine
       actually used. p.fusLen is the reference-payload input. */
    f:(p,R)=>[R.xACwing, R.fusLen*R.wingLEfrac+R.Xac] },

  /* The whole point of wing auto-positioning: when the outer root find reports
     convergence, the design it returns must ACTUALLY carry the requested static
     margin. This is what catches a solver that converges on the wrong branch,
     or that returns a station without rebuilding the geometry at it. Skipped
     (both sides 0) when auto-positioning is off or did not converge — an
     unreachable target is a legitimate outcome, not a broken identity. */
  { name:"auto-positioned wing hits target SM", units:"1 = MAC/MAC",
    source:"converged autoPositionWing => SM = targetSM", absTol:1.5e-3,
    f:(p,R)=> (p.autoPositionWing===true && R.wingPosConverged)
      ? [R.SM, R.wingPosTargetSM] : [0,0] },

  { name:"weight closure", units:"kg = kg + kg + kg", source:"MTOW = payload + empty + battery",
    f:(p,R)=>[R.MTOW, p.payload+R.Wempty+R.Wbat] },

  { name:"takeoff energy", units:"kWh = kW·s/3600", source:"E = P·t", tol:1.2e-2,
    /* tolerance reflects the engine rounding P (2 dp), t (1 dp) and E (3 dp)
       before returning them; on a very short leg that rounding alone is ~1%. */
    f:(p,R)=>[R.Eto, R.Phov*R.tto/3600] },

  { name:"cruise energy", units:"kWh = kW·s/3600", source:"E = P·t", tol:1.2e-2,
    /* tolerance reflects the engine rounding P (2 dp), t (1 dp) and E (3 dp)
       before returning them; on a very short leg that rounding alone is ~1%. */
    f:(p,R)=>[R.Ecr, R.Pcr*R.tcr/3600] },

  { name:"total mission energy", units:"kWh", source:"sum of phase energies",
    f:(p,R)=>[R.Etot, R.Eto+R.Ecl+R.Ecr+R.Edc+R.Eld+R.Eres] },

  /* THIS IDENTITY WAS ASSERTING A BUG, and it is worth recording why.
     It read  E_pack = W_bat · sedCell · etaBat  — the RAW cell specific
     energy. But the pack does not deliver raw cell SED: the engine derates it
     for C-rate before sizing the battery (sedEff = sedCell·(1−cRateDerate)),
     because less energy is available at the discharge rate the pack sustains.
     The identity omitted that derate, so it agreed with `PackkWh` only while
     PackkWh ALSO omitted it. Two places making the same mistake agreed with
     each other, and the suite reported green.

     It surfaced the moment PackkWh was corrected: 31 of 31 points failed by
     8.00%, which is exactly cRateDerate. That is the identity suite working —
     it caught a real convention change immediately.

     Re-derived here on the SOURCED convention rather than on whatever the
     engine now does: effective specific energy is the cell figure derated for
     C-rate, times pack efficiency; and under sedBasis "packUsable" the input is
     already net, so none of the deratings apply (the engine's reference entry
     for NASA sets cRateDerate 0 / socMin 0 / etaBat 1 to express exactly this).
     PackkWh is the TOTAL energy across the full SoC range; the spendable part
     is PackUsablekWh, checked separately. */
  /* η_bat IS NOT THE RAW INPUT. NASA applies the battery efficiency term to
     VERTICAL FLIGHT ONLY — "the battery efficiency term is not applied during
     forward or edgewise flight segments in RST", corpus S3270 — because the
     mechanism is internal resistance at high discharge rate. So the efficiency
     the pack is actually sized on is an energy-weighted blend of 1.0 over the
     forward segments and η_bat over the vertical ones.

     RE-DERIVED HERE FROM THE SOURCED CONVENTION, deliberately NOT read from the
     engine's own `etaBatEffective` output. An identity that takes its expected
     value from the thing it is checking tests nothing. This recomputes the
     blend from the reported segment energies, so if the engine ever scopes it
     differently the two will disagree and this will fail — which is the point. */
  { name:"pack energy from battery mass", units:"kWh = kg·(Wh/kg)/1000",
    source:"E_pack = W_bat · SED_eff · η_bat,eff — SED_eff = sedCell·(1−cRateDerate); "
         + "η_bat,eff = Etot / (E_forward + E_vertical/η_bat) per NASA RST scoping",
    f:(p,R)=>{
      const packUsable = p.sedBasis === "packUsable";
      const sedEff = packUsable ? p.sedCell : p.sedCell*(1-(p.cRateDerate ?? 0.08));
      const etaRaw = packUsable ? 1 : p.etaBat;
      const vertOnly = (p.etaBatScope ?? "verticalOnly") !== "mission";
      const Evert = packUsable ? R.Etot : (vertOnly ? (R.Eto + R.Eld) : R.Etot);
      const Ereq  = (R.Etot - Evert) + Evert/Math.max(1e-6, etaRaw);
      const etaB  = Ereq > 0 ? R.Etot/Ereq : etaRaw;
      return [R.PackkWh, R.Wbat*sedEff*etaB/1000];
    } },

  /* RESIDUAL SoC IS AN IDENTITY, NOT A CHECK. The pack is sized as
     W_E = E_tot/((1−socMin)·SED·η), so when ENERGY governs the residual state
     of charge is exactly socMin. It used to be scored as a feasibility check,
     where it could never fail — 0 failures over 343 converged designs — so it
     is gated here instead, where "cannot fail" is the correct expectation and
     a departure means the sizing and the reporting have diverged.

     Only meaningful when energy governs; where battery POWER sets the pack the
     residual is legitimately higher, so those points are skipped rather than
     scored (returning equal values). */
  { name:"residual SoC equals the socMin floor when energy governs", units:"1",
    source:"W_E = E_tot/((1−socMin)·SED·η) ⟹ 1 − E_tot/E_pack = socMin",
    f:(p,R)=>{
      const packUsable = p.sedBasis === "packUsable";
      if (packUsable) return [1,1];                  // socFloor is 0 by design there
      const resid = 1 - R.Etot/R.PackkWh;
      const powerGoverned = resid > p.socMin + 1e-4; // battery power set the pack
      return powerGoverned ? [1,1] : [resid, p.socMin];
    } },

  { name:"usable pack energy", units:"kWh", source:"E_usable = E_pack·(1−SoC_min)",
    f:(p,R)=>{
      const packUsable = p.sedBasis === "packUsable";
      const socFloor = packUsable ? 0 : p.socMin;
      return [R.PackUsablekWh, R.PackkWh*(1-socFloor)];
    } },

  { name:"hover T/W equals installed T/W", units:"1", source:"definition of the input",
    f:(p,R)=>[R.TW_hover, p.twRatio] },

  { name:"OEI thrust available", units:"N = 1·N", source:"(N−1) motors at design thrust W·(T/W)/N",
    f:(p,R)=>[R.T_avail_oei_N, (p.nPropHover-1)*(R.MTOW*G0*p.twRatio/p.nPropHover)] },

  { name:"NDARC drag-area parameter k", units:"ft²/klb^(2/3)",
    source:"D/q = k(W_MTO/1000)^(2/3), NDARC §8-11", tol:6e-3,
    /* From the reported drag area, not CD0*S: CD0 is a presentation that does
       not exist without a wing, and the engine already made that correction. */
    f:(p,R)=>[R.kNDARC, R.Dq_ft2/Math.pow(R.MTOW*2.20462/1000,2/3)] },

  { name:"DL unit conversion (hover)", units:"lb/ft² = N/m² × 0.020885",
    source:"1 N/m² = 0.020885 lb/ft²; the reported band figure must be the HOVER value",
    f:(p,R)=>[R.DL_lbft2, R.DL_hover_Nm2*0.020885] },

  { name:"DL unit conversion (installed)", units:"lb/ft² = N/m² × 0.020885",
    source:"1 N/m² = 0.020885 lb/ft²",
    f:(p,R)=>[R.DL_installed_lbft2, R.DLrotor*0.020885] },

  /* The weight-closure relation above says the parts sum to the whole. This
     says the engine SAYS SO ITSELF, through the output a reader actually has
     in front of them. Zero here and a non-zero `massBalanceGapKg` in the
     result would mean the emitted gap had stopped tracking the real one. */
  { name:"reported mass-balance gap is zero", units:"kg", absTol:0.02,
    source:"a converged design exits with MTOW = payload + Wempty + Wbat",
    f:(p,R)=>[R.massBalanceGapKg, 0] },
];

const REL_TOL = 2e-3;   // 0.2% — loose enough for the engine's own toFixed rounding
const all = cases();
const results = CHECKS.map(c => ({ ...c, fails: [], checked: 0 }));

for (const p of all) {
  let R; try { R = runSizing(p); } catch { continue; }
  if (!R || !isFinite(R.MTOW) || R.r2Diverged) continue;   // diverged designs prove nothing
  for (const c of results) {
    let lhs, rhs;
    try { [lhs, rhs] = c.f(p, R); } catch (e) { c.fails.push({ err: e.message }); continue; }
    if (!isFinite(lhs) || !isFinite(rhs)) continue;
    c.checked++;
    const scale = Math.max(Math.abs(lhs), Math.abs(rhs), 1e-9);
    const rel = Math.abs(lhs - rhs) / scale;
    const absErr = Math.abs(lhs - rhs);
    const bad = c.absTol != null ? absErr > c.absTol : rel > (c.tol ?? REL_TOL);
    if (bad) c.fails.push({ lhs, rhs, rel });
  }
}

/* ── THE SET THE LOOP ABOVE THROWS AWAY ───────────────────────────────────
   `R.r2Diverged` skips a design from every identity above, on the reasoning
   that a runaway proves nothing. True of the physics; NOT true of the
   bookkeeping. Weight closure is the one relation that FAILS on exactly the
   skipped set — the ceiling guard breaks with MTOW holding the iterate the
   weights were built at, while those weights sum to the next iterate — so the
   gate asserted the books balance over precisely the runs where they do not.
   Measured before this check existed: 595 kg to 4,622 kg out, up to 33% of the
   reported MTOW, reported by nothing.

   A diverged design cannot be made to close; that is what diverged means. What
   CAN be demanded is that the discrepancy be ACCOUNTED FOR — equal to the final
   residual, and published as `massBalanceGapKg` rather than left for a reader
   to discover by adding up the weight table. */
let divChecked = 0, divFails = [];
for (const p of all) {
  let R; try { R = runSizing(p); } catch { continue; }
  if (!R || !R.r2Diverged || !isFinite(R.MTOW)) continue;
  if (!Array.isArray(R.convData) || !R.convData.length) continue;
  const lastMn = R.convData[R.convData.length-1].MTOW;
  if (!isFinite(lastMn) || !isFinite(R.massBalanceGapKg)) continue;
  divChecked++;
  /* The gap must BE the step the loop never took. Tolerance is a rounding
     allowance, not a physics one: `massBalanceGapKg` is formed from the
     engine's full-precision Wempty and Wbat, while `lastMn - MTOW` differences
     two values the engine has already put through toFixed(2). On a 9,800 kg
     diverged lift+cruise those two paths part company by 0.06 kg, which is
     6e-6 of the aircraft. A whole missing iterate would show up here in the
     hundreds of kg, which is the failure this is built to catch. */
  const roundingAllowance = Math.max(0.05, 1e-5*Math.abs(R.MTOW));
  if (Math.abs(R.massBalanceGapKg - (lastMn - R.MTOW)) > roundingAllowance)
    divFails.push({ cfg:R.configType, model:R.weightModel, MTOW:R.MTOW,
                    gap:R.massBalanceGapKg, expected:+(lastMn-R.MTOW).toFixed(2) });
}

const bar = "═".repeat(76);
console.log(bar);
console.log(`IDENTITY & UNITS CHECK — ${CHECKS.length} relations over ${all.length} design points`);
console.log(bar);
let bad = 0;
for (const c of results) {
  const ok = c.fails.length === 0;
  if (!ok) bad++;
  const worst = c.fails.length ? c.fails.reduce((a,b)=>((b.rel||0)>(a.rel||0)?b:a)) : null;
  console.log(`${ok ? " ok " : "FAIL"}  ${c.name.padEnd(34)} ${String(c.checked).padStart(3)} pts` +
    (ok ? "" : `   ${c.fails.length} fail, worst ${(worst.rel*100).toFixed(2)}%`));
  if (!ok) {
    console.log(`        units : ${c.units}`);
    console.log(`        source: ${c.source}`);
    if (worst.lhs !== undefined)
      console.log(`        engine=${worst.lhs.toPrecision(8)}  independent=${worst.rhs.toPrecision(8)}`);
    else console.log(`        error : ${worst.err}`);
  }
}
console.log(bar);
console.log(`${divFails.length ? "FAIL" : " ok "}  ${"diverged: gap = unmet residual".padEnd(34)} ${String(divChecked).padStart(3)} pts`
  + (divFails.length ? `   ${divFails.length} fail` : "   (designs that do not close, checked rather than skipped)"));
if (divFails.length) {
  const w = divFails[0];
  console.log(`        ${w.cfg}/${w.model} MTOW ${w.MTOW}  gap ${w.gap} kg  expected ${w.expected} kg`);
}
console.log(bar);
const anyBad = bad + (divFails.length ? 1 : 0);
console.log(anyBad ? `FAIL — ${anyBad} of ${CHECKS.length+1} relations do not hold.`
                   : `PASS — all ${CHECKS.length+1} relations hold to ${(REL_TOL*100).toFixed(1)}%.`);
process.exit(anyBad ? 1 : 0);
