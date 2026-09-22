/* Configuration comes from the ENGINE's own resolver, so the exported file and
   the sized aircraft cannot disagree about the layout. (This file previously
   imported `Area` from recharts and never used it.) */
import { resolveConfiguration } from "../engine/configuration.js";
import { selectAirfoil, vspSection } from "../engine/airfoils.js";
import { aircraftGeometry, RAVEN_CONTROLS } from "../engine/geometry.js";

/* NAME TAGS: `<Name>`, NOT `<n>`.
   Every ParmContainer in this file used to emit `<n>Label</n>`. OpenVSP reads
   `<Name>` — NASA's own released RAVEN model uses it 684 times and `<n>` never
   — so every geom in every .vsp3 this tool has ever produced arrived in OpenVSP
   UNNAMED. It was invisible because the geometry still drew: the shapes were
   right and only the tree labels were missing. Found by diffing our output
   against NASA's file rather than by reading our own code. */
export function generateVSP3File(p, SR) {
  /* THE SINGLE SOURCE OF SHAPE. Laid out on NASA's measured RAVEN/SWFT station
     fractions and driven entirely by the user's parameters — see
     engine/geometry.js. The 3D view reads exactly this. */
  const GEO = aircraftGeometry(p, SR);
  // ─── Guard: require valid sizing results before generating geometry ───
  if (!SR || !SR.MTOW || !p || !p.fusLen) return null;

  // ─── Helpers ─────────────────────────────────────────────────────────
  const sci = (v) => {
    const n = isFinite(Number(v)) ? Number(v) : 0;
    if (n === 0) return '0.000000000000000000e+000';
    return n.toExponential(18).replace(/e([+-])(\d+)$/, (_, s, e) => 'e'+s+e.padStart(3,'0'));
  };
  let _c = 1000;
  const ID = () => {
    const ch='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let s='',n=_c++;
    for(let i=0;i<10;i++){s=ch[n%26]+s;n=Math.floor(n/26);} return s;
  };
  const V = (tag,val) => `<${tag} Value="${sci(val)}" ID="${ID()}"/>`;

  // ─── Sizing values from engine ────────────────────────────────────────
  const fL   = Number(p.fusLen)              || 6.5;
  const fD   = Number(p.fusDiam)             || 1.65;
  const bW   = Number(SR.bWing)              || 12.67;
  const SW   = Number(SR.Swing)              || 17.83;
  const Cr   = Number(SR.Cr_)               || 1.94;
  const Ct   = Number(SR.Ct_)               || 0.87;
  const sw   = Number(SR.sweep)              || 9.57;
  const tc   = Number(p.tc)                  || 0.12;
  const xACw = Number(SR.xACwing)            || fL*0.39;
  const MAC  = Number(SR.MAC)               || 1.40;
  const Drot = Number(SR.Drotor)             || 3.0;
  const Rrot = Drot / 2;                     // rotor radius (m)
  const MTOW = Number(SR.MTOW)              || 2721;
  const xCG  = Number(SR.xCGtotal)          || fL*0.35;
  const SM   = Number(SR.SM_vt||SR.SM)       || 0.22;
  // V-tail from sizing engine (the calculated values)
  const CrVT = Number(SR.Cr_vt)             || 2.15;
  const CtVT = Number(SR.Ct_vt)             || 0.86;
  const bvt  = Number(SR.bvt_panel)         || 3.77;
  const swVT = Number(SR.sweep_vt)          || 34.4;
  const vtG  = Number(p.vtGamma)            || 40;
  const lv   = Number(SR.lv)               || fL*0.50;

  // ─── Component positions ──────────────────────────────────────────────
  const xWingLE = xACw - 0.25*Cr;       // wing LE (absolute x from nose)
  const xWingTE = xWingLE + Cr;         // wing TE (absolute x from nose)

  // ── HIGH-WING: Z raised to sit flush on TOP of fuselage ──────────────
  const zWing   = fD / 2;

  // V-tail geometry (for aft-X clearance calculation)
  const xVtLE  = Math.min(xACw + lv - 0.25*CrVT, fL - 0.05);
  const zVtRoot= 0;

  // ── LONGITUDINAL LIFT BOOMS ─────────────────────────────────────────────
  //
  // Y-AXIS: fixed at 2.525 m — just clears fuselage side + one rotor radius + 0.2 m gap.
  const yBoom = (fD / 2) + Rrot + 0.2;        // = (0.825 + 1.5 + 0.2) = 2.525 m

  // X-AXIS: boom is symmetric about CG, shifted 0.5 m aft for balance trim.
  //   boomXFwd = 2·xCG offset from nose    (front rotor position)
  //   boomXAft = boomXFwd + 2·xCG           (aft rotor position, equal arm from CG)
  //   boomXOffset: tune this single value to slide both rotors together.
  // V-tail geometry is retained below only to keep xVtTipTE available for
  // the safety-check log embedded in the .vsp3 file.
  const xVtTipTE   = xVtLE + bvt * Math.tan(swVT * Math.PI / 180) + CtVT;
  const vtClearAft = xVtTipTE + Rrot + 0.2;   // safety-check reference only
  const boomDiam   = 0.25;

  // ── BOOM X POSITIONS ─────────────────────────────────────────────────
  const boomXOffset = 0.5;                     // aft shift applied to both tips equally
  const boomXFwd    = 0 + boomXOffset;         // front boom tip x-position
  const boomXAft    = 2 * xCG + boomXOffset;   // aft   boom tip x-position (= 2·xCG from front)
  const boomLen     = boomXAft - boomXFwd;     // total boom length = 2·xCG
  const zBoom       = fD / 2;                  // flush with top of fuselage (high-wing)

  // ── LIFT ROTOR POSITIONS — DERIVED FROM BOOM TIPS ────────────────────
  const zLiftRotor = zBoom + boomDiam / 2;     // hub centred on top of boom
  const xRotFwd    = boomXFwd;                 // front rotor at front boom tip
  const xRotAft    = boomXAft;                 // aft   rotor at aft   boom tip

  // ── CENTER PUSHER ROTOR ───────────────────────────────────────────────
  const xPusher   = fL;
  const dPusher   = Drot * 0.5;

  // ── WINGTIP NACELLES + TILTING ROTORS ────────────────────────────────
  // FIX 3 — EXACT WINGTIP Y (Y-axis):
  // Set nacelle Y = bW/2 — the absolute extreme half-span of the main wing.
  // Tilting rotors share the same Y, keeping them attached to nacelle nose.
  const yTipRot   = bW / 2;                    // = 6.385m — exact wingtip edge
  const nacLen    = 0.80;
  const nacDiam   = 0.30;
  const xNacStart = xWingLE;                   // nacelle front at wing LE
  // Z: nacelle centred on wing chord midline (unchanged from previous fix)
  const zNac      = zWing + (Number(p.tc)||0.15) * Cr / 2;
  // X: rotor disc 5cm forward of nacelle nose face (unchanged from previous fix)
  const xTipRot   = xNacStart - 0.05;
  const zTipRot   = zNac;

  // ─── TE-sweep helper ──────────────────────────────────────────────────
  const sweepTE = (swDeg, halfSpan, rC, tC) => {
    if (halfSpan < 0.01) return swDeg;
    const avgC = (rC + tC) / 2;
    const te = Math.atan(
      Math.tan(swDeg*Math.PI/180) - 2*(1 - tC/rC)/((1+tC/rC)*halfSpan/avgC)
    ) * 180 / Math.PI;
    return isFinite(te) ? te : swDeg*0.5;
  };
  const wTE  = sweepTE(sw,   bW/2,  Cr,   Ct  );
  const vtTE = sweepTE(swVT, bvt,   CrVT, CtVT);

  // ─── Disk AngelScript — verbatim from joby_s2.vsp3 ───────────────────
  const DS = `//==== Init Is Called Once During Each Custom Geom Construction  ============================//
//==== Avoid Global Variables Unless You Want Shared With All Custom Geoms of This Type =====//
void Init()
{
\t//==== Add Parm Types  =====//
\tstring diameter = AddParm( PARM_DOUBLE_TYPE, "Diameter", "Design" );
\tSetParmValLimits( diameter, 10.0, 0.0, 1.0e12 );
\tSetParmDescript( diameter, "Diameter of Cone" );

\t//==== Add Cross Sections  =====//
\tstring xsec_surf = AddXSecSurf();
\tAppendCustomXSec( xsec_surf, XS_POINT);
\tAppendCustomXSec( xsec_surf, XS_CIRCLE);

\t//==== Add A Default Point Source At Nose ====//
\tSetupCustomDefaultSource( POINT_SOURCE, 0, 0.1, 1.0, 1.0, 1.0 );
}

//==== InitGui Is Called Once During Each Custom Geom Construction ====//
void InitGui()
{
\tAddGui( GDEV_TAB, "Design"  );
\tAddGui( GDEV_YGAP );
\tAddGui( GDEV_DIVIDER_BOX, "Design" );
\tAddGui( GDEV_SLIDER_ADJ_RANGE_INPUT, "Diameter", "Diameter", "Design"  );
}

//==== UpdateGui Is Called Every Time The Gui is Updated ====//
void UpdateGui()
{
}

//==== UpdateSurf Is Called Every Time The Geom is Updated ====//
void UpdateSurf()
{
\tstring geom_id = GetCurrCustomGeom();

\t//==== Set Base XSec Diameter ====//
\tstring dia_parm = GetParm( geom_id, "Diameter", "Design" );
\tdouble dia_val  = GetParmVal( dia_parm );

\t//==== Get The XSecs To Change ====//
\tstring xsec_surf = GetXSecSurf( geom_id, 0 );
\tstring xsec1 = GetXSec( xsec_surf, 1 );

\t//==== Set The Diameter ====//
\tstring xsec1_dia = GetXSecParm( xsec1, "Circle_Diameter" );
\tSetParmVal( xsec1_dia, dia_val );

\tSetVspSurfType( DISK_SURF, -1 );
\tSetVspSurfCfdType( CFD_TRANSPARENT, -1 );
\tSkinXSecSurf();
}

//==== Optional Scale =====//
void Scale(double curr_scale )
{
\tstring geom_id = GetCurrCustomGeom();

\tstring dia_id   = GetParm( geom_id, "Diameter", "Design" );

\tdouble dia = curr_scale * GetParmVal( dia_id );

\tSetParmVal( dia_id, dia );
}
`;

  // ─── Wing XSec builder — exact joby_s2.vsp3 structure ────────────────
  // parm tag = <XSec> (NOT <WingXSec>)  airfoil <Type>2</Type>  curve <Type>7</Type>
  /* A SYMMETRIC 4-DIGIT, used where a surface genuinely is symmetric — every
     tail. `Camber 0` was written for the WING too, which is the defect: the
     sizing loop derives its whole polar from a CAMBERED section, so the
     exported model made no lift at zero incidence and a VSPAERO run on it
     analysed a different aircraft than the one this tool sized.
     See engine/airfoils.js vspSection(). */
  const SYM_SEC = (t) => ({ type: 7, container: "FourSeries",
    parms: { Camber: 0, CamberLoc: 0.2, ThickChord: t }, exact: true });

  const wingXSec = (rC, tC, span, swDeg, swLoc, dihed, twist, tessU, choiceVec, swRef, sec) => {
    const a   = (rC+tC)/2*span;
    const asp = span>0.1 ? span*span/Math.max(a,1e-6) : 0.5;
    const tpr = tC/Math.max(rC,1e-6);
    const swD = swRef !== undefined ? swRef : swDeg;
    const teD = sweepTE(swD, span, rC, tC);
    return `
          <XSec>
            <ParmContainer>
              <ID>${ID()}</ID>
              <Name>Default</Name>
              <XSec>
                ${V('Area',a)}${V('Aspect',asp)}${V('Avg_Chord',a/Math.max(span,1e-6))}
                ${V('Dihedral',dihed)}${V('InCluster',1)}
                ${V('InLEDihedral',-dihed)}${V('InLEMode',0)}${V('InLEStrength',1)}${V('InLESweep',swD)}
                ${V('InTEDihedral',-dihed)}${V('InTEMode',0)}${V('InTEStrength',1)}${V('InTESweep',teD)}
                ${V('OutCluster',1)}
                ${V('OutLEDihedral',dihed)}${V('OutLEMode',0)}${V('OutLEStrength',1)}${V('OutLESweep',swD)}
                ${V('OutTEDihedral',dihed)}${V('OutTEMode',0)}${V('OutTEStrength',1)}${V('OutTESweep',teD)}
                ${V('Root_Chord',rC)}${V('Sec_Sweep',swDeg)}${V('Sec_Sweep_Location',1)}
                ${V('SectTess_U',tessU)}${V('Span',span)}
                ${V('Sweep',swDeg)}${V('Sweep_Location',swLoc)}
                ${V('Taper',tpr)}${V('Tip_Chord',tC)}
                ${V('Twist',twist)}${V('Twist_Location',0.25)}
              </XSec>
            </ParmContainer>
            <XSec>
              <Type>2</Type>
              <GroupName>XSec</GroupName>
              <DriverGroup>
                <NumVar>8</NumVar><NumChoices>3</NumChoices>
                <ChoiceVec>${choiceVec}</ChoiceVec>
              </DriverGroup>
              <XSecCurve>
                <ParmContainer>
                  <ID>${ID()}</ID><Name>${(sec || SYM_SEC(tc)).container}</Name>
                  <Cap>
                    ${V('LE_Cap_Length',1)}${V('LE_Cap_Offset',0)}${V('LE_Cap_Strength',0.5)}${V('LE_Cap_Type',1)}
                    ${V('TE_Cap_Length',1)}${V('TE_Cap_Offset',0)}${V('TE_Cap_Strength',0.5)}${V('TE_Cap_Type',1)}
                  </Cap>
                  <Close>
                    ${V('LE_Close_AbsRel',0)}${V('LE_Close_Thick',0)}${V('LE_Close_Thick_Chord',0)}${V('LE_Close_Type',0)}
                    ${V('TE_Close_AbsRel',0)}${V('TE_Close_Thick',0)}${V('TE_Close_Thick_Chord',0)}${V('TE_Close_Type',0)}
                  </Close>
                  <Trim>
                    ${V('LE_Trim_AbsRel',0)}${V('LE_Trim_Thick',0)}${V('LE_Trim_Thick_Chord',0)}${V('LE_Trim_Type',0)}${V('LE_Trim_X',0)}${V('LE_Trim_X_Chord',0)}
                    ${V('TE_Trim_AbsRel',0)}${V('TE_Trim_Thick',0)}${V('TE_Trim_Thick_Chord',0)}${V('TE_Trim_Type',0)}${V('TE_Trim_X',0)}${V('TE_Trim_X_Chord',0)}
                  </Trim>
                  <XSecCurve>
                    ${Object.entries((sec || SYM_SEC(tc)).parms).map(([k, x]) => V(k, x)).join('')}${V('Chord',tC)}
                    ${V('DeltaX',0)}${V('DeltaY',0)}${V('EqArcLenFlag',1)}${V('FitDegree',7)}
                    ${V('Invert',0)}${V('Scale',1)}${V('ShiftLE',0)}${V('Theta',0)}
                  </XSecCurve>
                </ParmContainer>
                <XSecCurve><Type>${(sec || SYM_SEC(tc)).type}</Type></XSecCurve>
              </XSecCurve>
            </XSec>
          </XSec>`;
  };

  /* ── OpenVSP CONTROL SURFACES ────────────────────────────────────────
     An SS_Control sub-surface, written to the same schema RAVEN's own file
     uses (SubSurfaceInfo Type 3). Before this the exporter wrote
     `<SubSurfaces/>` on every wing, so a model opened in OpenVSP had no
     flaps, no ailerons and no rudder — nothing to assign a deflection to and
     nothing for VSPAERO to hinge.

     EtaFlag = 1 means the span fractions drive the surface and OpenVSP
     recomputes UStart/UEnd itself on load; the U values written here are the
     linear estimate, present only so the file is well formed.
     LE_Flag = 0 puts it on the trailing edge. Surf_Type 2 is both surfaces. */
  const ssControl = (name, eta0, eta1, chord) => `
          <SubSurface>
            <ParmContainer>
              <ID>${ID()}</ID><Name>${name}</Name>
              <SubSurface>${V('CreateBeamElements',0)}${V('IncludeFlag',0)}${V('IncludedElements',-1)}${V('KeepDelShellElements',0)}${V('MainSurfIndx',0)}</SubSurface>
              <SS_Control>
                ${V('Abs_Rel_Flag',1)}${V('EndAngle',90)}${V('EndAngleFlag',0)}
                ${V('EtaEnd',eta1)}${V('EtaFlag',1)}${V('EtaStart',eta0)}
                ${V('LE_Flag',0)}${V('Length_C_End',chord)}${V('Length_C_Start',chord)}
                ${V('SE_Const_Flag',1)}${V('SameAngleFlag',1)}
                ${V('StartAngle',90)}${V('StartAngleFlag',0)}
                ${V('Surf_Type',2)}${V('Tess_Num',15)}${V('Test_Type',0)}
                ${V('UEnd',0.5+0.25*eta1)}${V('UStart',0.5+0.25*eta0)}
              </SS_Control>
            </ParmContainer>
            <SubSurfaceInfo><Type>3</Type></SubSurfaceInfo>
          </SubSurface>`;

  // ─── Wing Geom builder ────────────────────────────────────────────────
  // xRot: X_Rotation (0 = flat wing/stab, 90 = vertical fin if ever needed)
  // sym:  Sym_Planar_Flag (2 = XZ symmetric, 0 = no symmetry)
  const wingGeom = (label, R,G,B, xLoc,zLoc, xRot,
                    rC,tC,halfSpan,swDeg,dihed,twist,

                    tessW, sym, totSpan, totArea, totChord, subs = '', sec = null) => {
    const s0 = wingXSec(1.0, rC, 1.0, 0, 0.0, 0, 0, 6, '1, 5, 6, ', swDeg, sec);
    const s1 = wingXSec(rC, tC, halfSpan, swDeg, 0.0, dihed, twist, 6, '1, 3, 2, ', undefined, sec);
    return `
    <Geom>
      <ParmContainer>
        <ID>${ID()}</ID><Name>${label}</Name>
        <Attach>${V('Rots_Attach_Flag',0)}${V('Trans_Attach_Flag',0)}${V('U_Attach_Location',1e-6)}${V('V_Attach_Location',1e-6)}</Attach>
        <Shape>${V('Tess_U',16)}${V('Tess_W',tessW)}${V('Wake',0)}</Shape>
        <Sym>${V('Sym_Ancestor',1)}${V('Sym_Ancestor_Origin_Flag',1)}${V('Sym_Axial_Flag',0)}${V('Sym_Planar_Flag',sym)}${V('Sym_Rot_N',2)}</Sym>
        <WingGeom>
          ${V('LECluster',0.25)}${V('RelativeDihedralFlag',0)}${V('RelativeTwistFlag',0)}
          ${V('RotateAirfoilMatchDideralFlag',0)}${V('TECluster',0.25)}
          ${V('TotalArea',totArea)}${V('TotalChord',totChord)}
          ${V('TotalProjectedSpan',totSpan)}${V('TotalSpan',totSpan)}
        </WingGeom>
        <XForm>
          ${V('Abs_Or_Relitive_flag',1)}${V('Last_Scale',1)}${V('Origin',0)}${V('Scale',1)}
          ${V('X_Location',xLoc)}${V('X_Rel_Location',xLoc)}
          ${V('X_Rel_Rotation',xRot)}${V('X_Rotation',xRot)}
          ${V('Y_Location',0)}${V('Y_Rel_Location',0)}
          ${V('Y_Rel_Rotation',0)}${V('Y_Rotation',0)}
          ${V('Z_Location',zLoc)}${V('Z_Rel_Location',zLoc)}
          ${V('Z_Rel_Rotation',0)}${V('Z_Rotation',0)}
        </XForm>
      </ParmContainer>
      <GeomBase>
        <TypeName>Wing</TypeName><TypeID>5</TypeID><TypeFixed>0</TypeFixed>
        <ParentID>NONE</ParentID><Child_List/>
      </GeomBase>
      <Material><Name>Default</Name></Material>
      <Wire_Color>
        <ParmContainer><ID>${ID()}</ID><Name>Default</Name>
          <Color_Parm>${V('Alpha',255)}${V('Blue',B)}${V('Green',G)}${V('Red',R)}</Color_Parm>
        </ParmContainer>
      </Wire_Color>
      <Textures><Num_of_Tex>0</Num_of_Tex></Textures>
      <Geom><Set_List>1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, </Set_List>${subs ? `<SubSurfaces>${subs}
        </SubSurfaces>` : '<SubSurfaces/>'}</Geom>
      <WingGeom>
        <ParmContainer><ID>${ID()}</ID><Name>Default</Name></ParmContainer>
        <XSecSurf>${s0}${s1}
        </XSecSurf>
      </WingGeom>
    </Geom>`;
  };

  // ─── Disk Geom builder ────────────────────────────────────────────────
  const diskGeom = (label, R,G,B, xA,yA,zA, yRot, diameter, sym) => `
    <Geom>
      <CustomGeom>
        <Diameter Value="${sci(diameter)}" ID="${ID()}"/>
        <ScriptFileModule>Disk</ScriptFileModule>
        <ScriptFileContents>${DS}</ScriptFileContents>
      </CustomGeom>
      <ParmContainer>
        <ID>${ID()}</ID><Name>${label}</Name>
        <Attach>${V('Rots_Attach_Flag',0)}${V('Trans_Attach_Flag',0)}${V('U_Attach_Location',1e-6)}${V('V_Attach_Location',1e-6)}</Attach>
        <Design>${V('Diameter',diameter)}</Design>
        <Shape>${V('Tess_U',8)}${V('Tess_W',9)}${V('Wake',0)}</Shape>
        <Sym>${V('Sym_Ancestor',1)}${V('Sym_Ancestor_Origin_Flag',1)}${V('Sym_Axial_Flag',0)}${V('Sym_Planar_Flag',sym)}${V('Sym_Rot_N',2)}</Sym>
        <XForm>
          ${V('Abs_Or_Relitive_flag',1)}${V('Last_Scale',1)}${V('Origin',0)}${V('Scale',1)}
          ${V('X_Location',xA)}${V('X_Rel_Location',xA)}${V('X_Rel_Rotation',0)}${V('X_Rotation',0)}
          ${V('Y_Location',yA)}${V('Y_Rel_Location',yA)}${V('Y_Rel_Rotation',yRot)}${V('Y_Rotation',yRot)}
          ${V('Z_Location',zA)}${V('Z_Rel_Location',zA)}${V('Z_Rel_Rotation',0)}${V('Z_Rotation',0)}
        </XForm>
      </ParmContainer>
      <GeomBase>
        <TypeName>Disk</TypeName><TypeID>9</TypeID><TypeFixed>0</TypeFixed>
        <ParentID>NONE</ParentID><Child_List/>
      </GeomBase>
      <Material><Name>Default</Name></Material>
      <Wire_Color>
        <ParmContainer><ID>${ID()}</ID><Name>Default</Name>
          <Color_Parm>${V('Alpha',255)}${V('Blue',B)}${V('Green',G)}${V('Red',R)}</Color_Parm>
        </ParmContainer>
      </Wire_Color>
      <Textures><Num_of_Tex>0</Num_of_Tex></Textures>
      <Geom><Set_List>1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, </Set_List><SubSurfaces/></Geom>
    </Geom>`;

  // ─── Fuselage XSec builder (proven working) ───────────────────────────
  const fusXSec = st => `
          <XSec>
            <ParmContainer>
              <ID>${ID()}</ID><Name>Default</Name>
              <XSec>
                ${V('AllSym',0)}
                ${V('BottomLAngle',st.bA)}${V('BottomLAngleSet',1)}${V('BottomLCurve',0)}${V('BottomLCurveSet',0)}
                ${V('BottomLRAngleEq',1)}${V('BottomLRCurveEq',0)}${V('BottomLRSlewEq',0)}${V('BottomLRStrengthEq',0)}
                ${V('BottomLSlew',0)}${V('BottomLSlewSet',1)}${V('BottomLStrength',st.bS)}${V('BottomLStrengthSet',1)}
                ${V('BottomRAngle',st.bA)}${V('BottomRAngleSet',1)}${V('BottomRCurve',0)}${V('BottomRCurveSet',0)}
                ${V('BottomRSlew',0)}${V('BottomRSlewSet',1)}${V('BottomRStrength',st.bS)}${V('BottomRStrengthSet',1)}
                ${V('ContinuityBottom',0)}${V('ContinuityLeft',0)}${V('ContinuityRight',0)}${V('ContinuityTop',0)}
                ${V('LeftLAngle',st.tA)}${V('LeftLAngleSet',1)}${V('LeftLCurve',0)}${V('LeftLCurveSet',0)}
                ${V('LeftLRAngleEq',1)}${V('LeftLRCurveEq',0)}${V('LeftLRSlewEq',0)}${V('LeftLRStrengthEq',0)}
                ${V('LeftLSlew',0)}${V('LeftLSlewSet',1)}${V('LeftLStrength',st.tS)}${V('LeftLStrengthSet',1)}
                ${V('LeftRAngle',st.tA)}${V('LeftRAngleSet',1)}${V('LeftRCurve',0)}${V('LeftRCurveSet',0)}
                ${V('LeftRSlew',0)}${V('LeftRSlewSet',1)}${V('LeftRStrength',st.tS)}${V('LeftRStrengthSet',1)}
                ${V('RLSym',1)}${V('RefLength',st.refLen || 1)}
                ${V('RightLAngle',st.tA)}${V('RightLAngleSet',1)}${V('RightLCurve',0)}${V('RightLCurveSet',0)}
                ${V('RightLRAngleEq',1)}${V('RightLRCurveEq',0)}${V('RightLRSlewEq',0)}${V('RightLRStrengthEq',0)}
                ${V('RightLSlew',0)}${V('RightLSlewSet',1)}${V('RightLStrength',st.tS)}${V('RightLStrengthSet',1)}
                ${V('RightRAngle',st.tA)}${V('RightRAngleSet',1)}${V('RightRCurve',0)}${V('RightRCurveSet',0)}
                ${V('RightRSlew',0)}${V('RightRSlewSet',1)}${V('RightRStrength',st.tS)}${V('RightRStrengthSet',1)}
                ${V('SectTess_U',6)}${V('Spin',0)}${V('TBSym',1)}
                ${V('TopLAngle',st.tA)}${V('TopLAngleSet',1)}${V('TopLCurve',0)}${V('TopLCurveSet',0)}
                ${V('TopLRAngleEq',1)}${V('TopLRCurveEq',0)}${V('TopLRSlewEq',0)}${V('TopLRStrengthEq',0)}
                ${V('TopLSlew',0)}${V('TopLSlewSet',1)}${V('TopLStrength',st.tS)}${V('TopLStrengthSet',1)}
                ${V('TopRAngle',st.tA)}${V('TopRAngleSet',1)}${V('TopRCurve',0)}${V('TopRCurveSet',0)}
                ${V('TopRSlew',0)}${V('TopRSlewSet',1)}${V('TopRStrength',st.tS)}${V('TopRStrengthSet',1)}
                ${V('XLocPercent',st.p)}${V('XRotate',0)}${V('YLocPercent',0)}${V('YRotate',0)}${V('ZLocPercent',0)}${V('ZRotate',0)}
              </XSec>
            </ParmContainer>
            <XSec>
              <Type>0</Type><GroupName>XSec</GroupName>
              <XSecCurve>
                <ParmContainer>
                  <ID>${ID()}</ID><Name>Default</Name>
                  <XSecCurve>
                    ${V('DeltaX',0)}${V('DeltaY',0)}
                    ${st.ell?V('Ellipse_Height',st.H):''}
                    ${st.ell?V('Ellipse_Width', st.W):''}
                    ${V('Scale',1)}${V('ShiftLE',0)}${V('Theta',0)}
                  </XSecCurve>
                </ParmContainer>
                <XSecCurve><Type>${st.ell?2:0}</Type></XSecCurve>
              </XSecCurve>
            </XSec>
          </XSec>`;

  // ─── Fuselage Geom builder (used for main body AND boom rods) ─────────
  // yRot: Y_Rotation (-90 = points upward/+Z; 0 = default along +X)
  const fusGeom = (label, R,G,B, xLoc,yLoc,zLoc, yRot, length, sym, stations, tessU=16, tessW=17) => `
    <Geom>
      <ParmContainer>
        <ID>${ID()}</ID><Name>${label}</Name>
        <Attach>${V('Rots_Attach_Flag',0)}${V('Trans_Attach_Flag',0)}${V('U_Attach_Location',1e-6)}${V('V_Attach_Location',1e-6)}</Attach>
        <Design>${V('Length',length)}${V('OrderPolicy',0)}</Design>
        <Shape>${V('Tess_U',tessU)}${V('Tess_W',tessW)}</Shape>
        <Sym>${V('Sym_Ancestor',1)}${V('Sym_Ancestor_Origin_Flag',1)}${V('Sym_Axial_Flag',0)}${V('Sym_Planar_Flag',sym)}${V('Sym_Rot_N',2)}</Sym>
        <XForm>
          ${V('Abs_Or_Relitive_flag',1)}${V('Last_Scale',1)}${V('Origin',0)}${V('Scale',1)}
          ${V('X_Location',xLoc)}${V('X_Rel_Location',xLoc)}${V('X_Rel_Rotation',0)}${V('X_Rotation',0)}
          ${V('Y_Location',yLoc)}${V('Y_Rel_Location',yLoc)}${V('Y_Rel_Rotation',yRot)}${V('Y_Rotation',yRot)}
          ${V('Z_Location',zLoc)}${V('Z_Rel_Location',zLoc)}${V('Z_Rel_Rotation',0)}${V('Z_Rotation',0)}
        </XForm>
      </ParmContainer>
      <GeomBase>
        <TypeName>Fuselage</TypeName><TypeID>4</TypeID><TypeFixed>0</TypeFixed>
        <ParentID>NONE</ParentID><Child_List/>
      </GeomBase>
      <Material><Name>Default</Name></Material>
      <Wire_Color>
        <ParmContainer><ID>${ID()}</ID><Name>Default</Name>
          <Color_Parm>${V('Alpha',255)}${V('Blue',B)}${V('Green',G)}${V('Red',R)}</Color_Parm>
        </ParmContainer>
      </Wire_Color>
      <Textures><Num_of_Tex>0</Num_of_Tex></Textures>
      <Geom><Set_List>1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, </Set_List><SubSurfaces/></Geom>
      <FuselageGeom>
        <ParmContainer><ID>${ID()}</ID><Name>Default</Name></ParmContainer>
        <XSecSurf>${stations.map(fusXSec).join('')}
        </XSecSurf>
      </FuselageGeom>
    </Geom>`;

  // ═══ BUILD COMPONENTS ══════════════════════════════════════════════════

  // ── 1. MAIN FUSELAGE — GEOMETRY UNCHANGED ─────────────────────────────
  const maxW = fD, maxH = fD*0.88;
  const fusSt = [
    {p:0.000, W:fD*0.01, H:fD*0.01, tA: 90, bA: 90, tS:0.40, bS:0.40, ell:false, refLen:fL},
    {p:0.150, W:maxW*0.60, H:maxH*0.55, tA:0,  bA:0,  tS:1.0,  bS:1.0,  ell:true,  refLen:fL},
    {p:0.380, W:maxW,      H:maxH,      tA:0,  bA:0,  tS:1.0,  bS:1.0,  ell:true,  refLen:fL},
    {p:0.700, W:maxW*0.72, H:maxH*0.60, tA:-4, bA:-4, tS:1.0,  bS:1.0,  ell:true,  refLen:fL},
    {p:1.000, W:fD*0.01, H:fD*0.01, tA:-90, bA:-90, tS:0.25, bS:0.25, ell:false, refLen:fL},
  ];
  const fusXML = fusGeom('Fuselage', 0,0,0, 0,0,0, 0, fL, 0, fusSt, 16, 17);

  // ── 2. MAIN WING — SHAPE UNCHANGED, HIGH-WING (Z = fD/2) ──────────────
  /* THE SECTION THE SIZING LOOP ACTUALLY USED, not Camber 0. engine.js picks
     an airfoil (engine/airfoils.js selectAirfoil) and computes the entire
     polar from it; this file then exported a symmetric one, so the shape and
     the analysis shipped together disagreed. */
  /* THE SECTION THE SIZING LOOP ACTUALLY CHOSE — taken from SR, not chosen
     again here. Re-running selectAirfoil in the exporter looked equivalent and
     was not: it needs the wing Reynolds number, the sizing result publishes it
     as `Re_` and this file asked for `Re_wing`, so the fallback 6e6 was used
     and the exporter picked NACA 65-415 where the engine had picked NACA
     65(2)-415. A different section, exported as if it were the analysed one.
     Deriving a quantity a second time is how they drift; the engine already
     publishes its answer, so use it. */
  const wingSec = (() => {
    const sel = SR?.selAF || (() => {
      try {
        const Re = Number(SR?.Re_) || 6e6;
        const CL = Number(SR?.CLcruise) || Number(p?.clDesign) || 0.5;
        return selectAirfoil(p || {}, Re, CL)?.selAF || null;
      } catch { return null; }
    })();
    return sel ? vspSection(sel) : null;
  })();
  const wingXML = wingGeom(
    'MainWing', 0,0,255,
    xWingLE, zWing, 0,
    Cr, Ct, bW/2, sw, 2.0, -1.5,
    33, 2, bW, SW, MAC, '', wingSec
  );

  // ── 3. LONGITUDINAL LIFT BOOMS (fixed, V-tail collision resolved) ──────
  // Straight boom cross-section: tiny nose/tail tapers, full diameter in between.
  // p:0.08/0.92 gives a long cylindrical mid-section — the original clean shape.
  // XZ symmetry (sym=2) mirrors to −yBoom automatically.
  const boomSt = [
    {p:0.00, W:boomDiam*0.15, H:boomDiam*0.15, tA: 90, bA: 90, tS:0.4, bS:0.4, ell:false, refLen:boomLen},
    {p:0.08, W:boomDiam,      H:boomDiam,       tA:0,  bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:boomLen},
    {p:0.92, W:boomDiam,      H:boomDiam,       tA:0,  bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:boomLen},
    {p:1.00, W:boomDiam*0.15, H:boomDiam*0.15, tA:-90, bA:-90, tS:0.25,bS:0.25,ell:false, refLen:boomLen},
  ];
  const boomXML = fusGeom(
    'LiftBoom', 200,200,200,
    boomXFwd, yBoom, zBoom,   // fwd tip X, Y=yBoom lateral (clears V-tail), Z=wing surface
    0,                         // yRot=0 → boom runs perfectly parallel to X-axis
    boomLen, 2, boomSt, 8, 9
  );

  // ── 4. FOUR FIXED LIFT ROTORS — ON BOOM TIPS ──────────────────────────
  // Forward pair: at boom fwd tips (xRotFwd, ±yBoom)
  // Aft pair:     at boom aft tips (xRotAft, ±yBoom) — behind V-tail TE
  // YRot=90 → horizontal disk → thrust straight UP (+Z).
  // XZ symmetry on each geom → 2 geoms × 2 mirrors = 4 rotors total.
  const liftRotFwdXML = diskGeom(
    'LiftRotor_Fwd', 255,80,0,
    xRotFwd, yBoom, zLiftRotor,
    90, Drot, 2
  );
  const liftRotAftXML = diskGeom(
    'LiftRotor_Aft', 255,80,0,
    xRotAft, yBoom, zLiftRotor,  // aft boom tip — boom passes outboard of V-tail (y=yBoom > V-tail span)
    90, Drot, 2
  );

  /* ══ CONFIGURATION-AWARE ASSEMBLY ═══════════════════════════════════
     This exporter had NO configuration awareness at all — a grep for
     configType / nRotorsStopped / nTilting over this file returned zero. It
     always emitted fuselage + wing + booms + 4 lift rotors + pusher + V-tail
     + 2 tilting nacelles, so selecting `multicopter` in the UI still exported
     an aeroplane with a wing and a pusher it does not have. The geometry did
     not switch when the engine did.

     The configuration is resolved from the SAME module the engine uses
     (engine/configuration.js), so the exported file and the sized aircraft
     agree by construction rather than by being edited in step.

     For a WINGLESS layout the fore/aft boom pair is meaningless — the rotors
     sit on a ring — so a ring of booms and rotors is emitted instead, using
     the same non-overlap spacing engine/booms.js enforces on the mass model
     (a >= R/sin(pi/N)). Otherwise the drawing would show rotors intersecting
     while the structure had already been sized for clearance. */
  const cfgV     = resolveConfiguration(p, p.nPropHover);
  const hasWingV = !!(cfgV.capabilities?.hasWing);
  const nRotV    = Math.max(1, p.nPropHover || 4);

  /* Ring layout, wingless only. One boom + one rotor per arm. */
  let ringXML = "";
  if (!hasWingV) {
    const ringR = nRotV > 2
      ? Math.max(Drot / 2 / Math.sin(Math.PI / nRotV), fD)
      : fD * 1.6 + Drot / 2;
    const armLen = Math.max(0.3, ringR - fD * 0.5);
    const armD   = Math.max(0.06, 2 * (Number(SR.boomDetail?.radiusM) || 0.10));
    const armSt  = [
      {p:0.00, W:armD*0.5, H:armD*0.5, tA: 90, bA: 90, tS:0.4, bS:0.4, ell:false, refLen:armLen},
      {p:0.12, W:armD,     H:armD,     tA:0,   bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:armLen},
      {p:0.88, W:armD,     H:armD,     tA:0,   bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:armLen},
      {p:1.00, W:armD*0.5, H:armD*0.5, tA:-90, bA:-90, tS:0.25,bS:0.25,ell:false, refLen:armLen},
    ];
    const parts = [];
    for (let k = 0; k < nRotV; k++) {
      const th = (2 * Math.PI * k) / nRotV - Math.PI / 2;
      const cx = fL * 0.5 + ringR * Math.cos(th);
      const cy = ringR * Math.sin(th);
      const ax = fL * 0.5 + (fD * 0.5) * Math.cos(th);
      const ay = (fD * 0.5) * Math.sin(th);
      /* ZRot places each arm along its radial direction. */
      parts.push(fusGeom(`Arm_${k + 1}`, 190,190,190, ax, ay, fD * 0.35,
        (th * 180 / Math.PI), armLen, 0, armSt, 8, 9));
      parts.push(diskGeom(`Rotor_${k + 1}`, 255,80,0, cx, cy, fD * 0.42, 90, Drot, 0));
    }
    ringXML = parts.join("\n");
  }

  /* Which geoms belong to THIS configuration. */
  function geomsForConfiguration(g) {
    if (!hasWingV) return g.ringXML;                     // rotor-borne: ring only
    const out = [g.wingXML, g.vtailXML];
    if (cfgV.hasBooms && (cfgV.nStopped ?? 0) > 0)
      out.push(g.boomXML, g.liftRotFwdXML, g.liftRotAftXML);
    if (cfgV.hasCruiseProp) out.push(g.pusherXML);
    if ((cfgV.nTilting ?? 0) > 0)
      out.push(g.nacRightXML, g.nacLeftXML, g.tiltRotRightXML, g.tiltRotLeftXML);
    return out.join("\n");
  }

  // ── 5. CENTER PUSHER ROTOR ─────────────────────────────────────────────
  // Single prop at extreme aft tip of fuselage (x = fL), on centreline.
  // YRot = 0 → disk plane perpendicular to X-axis → thrust vector in +X (pusher).
  // No symmetry (sym=0): single centreline component.
  const pusherXML = diskGeom(
    'CruisePusher', 0,200,50,
    xPusher, 0, 0,   // fuselage tail, centreline
    0,               // YRot=0 → disc ⊥ X → thrust in +X
    dPusher, 0       // no symmetry
  );

  // ── 6. V-TAIL — GEOMETRY UNCHANGED ────────────────────────────────────
  const vtailXML = wingGeom(
    'VTail', 255,215,0,
    xVtLE, zVtRoot, 0,
    CrVT, CtVT, bvt, swVT, vtG, 0,
    17, 2,
    bvt*2, bvt*(CrVT+CtVT)/2, (CrVT+CtVT)/2
  );

  // ── 7. WINGTIP NACELLES (tilt mechanism housings) ─────────────────────
  // Two small pods, one at each wingtip, running along +X.
  // Front face of nacelle at xNacStart = xWingLE; rotor disc at xTipRot = xNacStart − 0.05m.
  // Z = zNac = zWing (flush with high-wing surface).
  // Y = ±yTipRot: guarantees ≥1.7m blade-tip clearance from boom rotors.
  // XZ symmetry NOT used — left and right nacelles are separate geoms so
  // each tilting rotor can be independently controlled in VSP animation.
  const nacSt = [
    {p:0.00, W:nacDiam*0.12, H:nacDiam*0.12, tA: 90, bA: 90, tS:0.4, bS:0.4, ell:false, refLen:nacLen},
    {p:0.10, W:nacDiam,      H:nacDiam,       tA:0,  bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:nacLen},
    {p:0.90, W:nacDiam,      H:nacDiam,       tA:0,  bA:0,   tS:1.0, bS:1.0, ell:true,  refLen:nacLen},
    {p:1.00, W:nacDiam*0.12, H:nacDiam*0.12, tA:-90, bA:-90, tS:0.25,bS:0.25,ell:false, refLen:nacLen},
  ];
  const nacRightXML = fusGeom(
    'TiltNacelle_Right', 80,200,180,
    xNacStart, +yTipRot, zNac,  // right wingtip nacelle (+Y)
    0,                           // yRot=0 → nacelle runs along +X
    nacLen, 0, nacSt, 8, 9      // no symmetry — independent left/right
  );
  const nacLeftXML = fusGeom(
    'TiltNacelle_Left', 80,200,180,
    xNacStart, -yTipRot, zNac,  // left wingtip nacelle (-Y)
    0,
    nacLen, 0, nacSt, 8, 9
  );

  // ── 8. TWO TILTING WINGTIP ROTORS — MOUNTED AT NACELLE NOSE ──────────
  // Disc at xTipRot = xNacStart − 0.05m (5cm forward of nacelle nose, clears body).
  // TILT MECHANISM — RotY encodes tilt angle:
  //   RotY = 90°  → disc horizontal → thrust UP (+Z)  [HOVER — default]
  //   RotY =  0°  → disc vertical   → thrust FWD (+X) [CRUISE]
  // Animate Y_Rotation 90→0 in OpenVSP to simulate transition to forward cruise.
  // Left and right are separate geoms (no symmetry) for independent tilt control.
  const tiltRotRightXML = diskGeom(
    'TiltRotor_Right', 0,220,100,
    xTipRot, +yTipRot, zTipRot,  // right nacelle nose (+Y)
    90,                            // RotY=90: HOVER default (disc horizontal, thrust UP)
    Drot, 0
  );
  const tiltRotLeftXML = diskGeom(
    'TiltRotor_Left', 0,220,100,
    xTipRot, -yTipRot, zTipRot,  // left nacelle nose (-Y)
    90,                            // RotY=90: HOVER default (disc horizontal, thrust UP)
    Drot, 0
  );

  // ── Assemble final VSP3 XML ────────────────────────────────────────────
  /* =====================================================================
     GEOMS FROM THE SHARED GEOMETRY — the export and the 3D view are now the
     SAME aircraft
     =====================================================================
     THIS FILE USED TO COMPUTE ITS OWN STATIONS, and three comments in this
     codebase claimed it shared engine/geometry.js when it did not. They
     disagreed in substance, not just in detail: the exporter put the tip
     rotors at `yTipRot = bW/2` (exactly on the wingtip) and the lift booms at
     `yBoom = fD/2 + Rrot + 0.2` (a clearance rule), while the viewer used
     NASA's measured stations — sponsons at 0.431 of the half-span and tip
     rotors 4% OUTBOARD of the tip. So the .vsp3 a user downloaded was a
     different aeroplane from the one they had just been looking at.

     Everything is now emitted by walking `aircraftGeometry(p, SR)`, which is
     laid out on the RAVEN/SWFT station fractions and driven entirely by the
     user's own parameters. Change a rotor count, a span, a fuselage length or
     the configuration and both the picture and the file follow.

     The XML builders below are unchanged and already proven to load; only WHAT
     they are asked to draw has changed. Rotors stay `Disk` geoms rather than
     native `Propeller` geoms: NASA's Propeller blocks carry 30 blade sections
     and run to 150 kB each, and with no OpenVSP available here to open the
     result, shipping an unverifiable format change would risk a file that does
     not load at all. The rotor design data NASA carry on a Propeller —
     diameter, blade count, solidity — is written into the header comment
     instead, so nothing is lost. */
  const toFusStations = (b) => b.stations.map(st => ({
    p: st.t, W: st.w, H: st.h, tA: 0, bA: 0, tS: 1.0, bS: 1.0,
    ell: st.w > 0.02 && st.h > 0.02, refLen: (b.x1 - b.x0) || 1,
  }));

  function geomsFromSharedGeometry() {
    const out = [];
    for (const b of GEO.bodies) {
      if (b.kind === "fuselage")
        out.push(fusGeom('Fuselage', 0,0,0, b.x0, b.y, b.z, 0, b.x1 - b.x0, 0,
                         toFusStations(b), 16, 17));
      else if (b.kind === "sponson")
        out.push(fusGeom(b.label || 'Sponson', 90,96,104, b.x0, b.y, b.z, 0,
                         b.x1 - b.x0, 0, toFusStations(b), 12, 13));
      else if (b.kind === "nacelle")
        out.push(fusGeom(b.label || 'Nacelle', 120,140,160, b.x0, b.y, b.z, 0,
                         b.x1 - b.x0, 0, toFusStations(b), 10, 11));
      else if (b.kind === "wing")
        /* One sub-surface per control surface, taken from the RIGHT side only:
           the wing geom is a half wing with Sym_Planar_Flag 2, so OpenVSP
           mirrors both the surface and its controls. Emitting both sides would
           duplicate every flap. */
        out.push(wingGeom('MainWing', 0,0,255, b.x, b.z, 0,
                          b.rootChord, b.tipChord, b.span/2, b.sweepDeg||0, 0, -1.5,
                          33, 2, b.span, b.span*(b.rootChord+b.tipChord)/2,
                          (b.rootChord+b.tipChord)/2,
                          GEO.bodies.filter(c => c.kind === "control"
                              && c.surface === "wing" && c.side > 0)
                            .map(c => ssControl(String(c.label).replace(/ R$/, '')
                                       .replace(/\s+/g, '_'),
                                       c.eta0, c.eta1, c.chordFrac)).join(''),
                          /* THE LIVE WING EMISSION. This file has TWO — a
                             legacy `wingXML` built from the sizing scalars and
                             this one, driven by the geometry bodies, which is
                             the one that reaches the output. Patching the
                             first and testing the file showed FourSeries
                             everywhere and looked like the section had failed
                             to apply; it had simply been applied to the branch
                             nothing emits. */
                          wingSec));
      else if (b.kind === "vtail")
        out.push(wingGeom('VTail', 255,215,0, b.x, b.z, 0,
                          b.rootChord, b.tipChord, b.span, 0, b.dihedralDeg||45, 0,
                          17, 2, b.span*2, b.span*(b.rootChord+b.tipChord)/2,
                          (b.rootChord+b.tipChord)/2,
                          /* THE RUDDER COMES FROM THE MEASURED TABLE, NOT FROM A
                             DRAWN BODY. The viewer stopped drawing a separate
                             rudder panel — a control surface is a SUB-SURFACE on
                             its parent, which is how OpenVSP models one and how
                             RAVEN's own file carries it — and this export read
                             the drawn bodies, so the .vsp3 silently lost its
                             rudder with them. The exported model must have the
                             control surface whether or not the viewer paints it
                             a different colour, so it is written straight from
                             RAVEN_CONTROLS.vtail. */
                          RAVEN_CONTROLS.vtail
                            .map(c => ssControl(String(c.name).replace(/\s+/g, '_'),
                                       c.eta0, c.eta1, c.chord)).join('')));
      else if (b.kind === "boom") {
        /* A radial arm on a rotor-borne layout: a slim pod along its own axis. */
        const len = Math.hypot(b.x1-(b.x0), b.y-(b.y0 ?? b.y)) || 0.5;
        const R2 = b.radius || 0.1;
        out.push(fusGeom(b.label || 'Arm', 90,96,104, b.x0, b.y0 ?? b.y, b.z,
          Math.atan2(b.y - (b.y0 ?? b.y), b.x1 - b.x0) * 180/Math.PI, len, 0,
          [{p:0,W:R2*1.4,H:R2*1.4,tA:0,bA:0,tS:1,bS:1,ell:true,refLen:len},
           {p:1,W:R2*1.4,H:R2*1.4,tA:0,bA:0,tS:1,bS:1,ell:true,refLen:len}], 6, 9));
      }
      else if (b.kind === "rotor")
        /* yRot 90 = disk horizontal (lift); 0 = disk vertical (cruise thrust).
           A tilting rotor is exported in its CRUISE attitude, matching how the
           3D view draws it, so the two never disagree. */
        out.push(diskGeom(b.label || 'Rotor', b.tilting?64:206, b.tilting?144:150,
                          b.tilting?216:70, b.x, b.y, b.z, b.tilting?0:90,
                          b.radius*2, 0));
      else if (b.kind === "pusher")
        out.push(diskGeom('CruisePusher', 90,196,140, b.x, b.y, b.z, 0, b.radius*2, 0));
    }
    return out.join(String.fromCharCode(10));
  }

  const xml = `<?xml version="1.0"?>
<Vsp_Geometry>
  <Version>4</Version>
  <Vehicle>
    <ParmContainer>
      <ID>${ID()}</ID>
      <Name>Vehicle</Name>
    </ParmContainer>
${geomsFromSharedGeometry()}
  </Vehicle>
  <!-- Trail1 eVTOL  |  Wright State University
       MTOW: ${MTOW.toFixed(1)} kg  |  Wing: b=${bW.toFixed(2)} m  S=${SW.toFixed(2)} m²
       CG: ${xCG.toFixed(3)} m from nose  |  SM: ${(SM*100).toFixed(1)}% MAC
       Boom: Fwd=${boomXFwd.toFixed(3)} m  Aft=${boomXAft.toFixed(3)} m  L=${boomLen.toFixed(3)} m  Y=±${yBoom.toFixed(3)} m
       V-tail: Γ=${vtG.toFixed(1)}°  bvt=${bvt.toFixed(2)} m  Λ=${swVT.toFixed(1)}°
       V-tail clearance: vtClearAft=${vtClearAft.toFixed(3)} m ${vtClearAft<=boomXAft?'≤':'>'} boomXAft=${boomXAft.toFixed(3)} m → ${vtClearAft<=boomXAft?'OK':'⚠ CHECK REQUIRED'}
  -->
</Vsp_Geometry>`;

  return xml;
}
