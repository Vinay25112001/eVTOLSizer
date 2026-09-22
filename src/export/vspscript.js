/* =====================================================================
   OPENVSP ANGELSCRIPT EXPORT — the model as a BUILD SCRIPT, not a file
   =====================================================================
   WHY THIS EXISTS ALONGSIDE THE .vsp3 WRITER. The XML writer emits a
   finished model: geoms at absolute positions, with no parent-child tree
   and no Hinge geoms, because writing those by hand into XML means
   reproducing OpenVSP's internal ID graph. The consequence is that the
   TILT MECHANISM — the thing half these layouts are about — cannot be
   moved once the file is open. You get the aircraft frozen at one
   nacelle angle.

   A .vspscript is built by OpenVSP itself. AddGeom() takes a PARENT, so
   the tree comes out right, and a real HINGE geom carries JointRotate
   with its travel limits — which means the exported model converts in
   OpenVSP exactly as it does in the viewer here.

   THE STRUCTURE IS RAVEN'S, READ FROM ParentID AND NOT FROM THE BROWSER'S
   INDENTATION — which is not the same thing, and assuming it was put two
   mistakes in this file:

       Fuselage                                   (top level)
       Wing                                       (top level: a SIBLING of
                                                   the fuselage, not a child)
       Vertical Stabilizer                        (top level)
       Hinge - Horizontal Stabilator Pivot
         Horizontal Stabilator
       Inboard Sponson                            (child of the FUSELAGE,
                                                   not of the wing)
         Hinge - Proprotor Pivot - Inboard All
           Hinge - Inboard Proprotor Pivot
             Inboard Motors,  L/R Inboard Proprotor
         Aft Hover Motors
           Aft Motor Covers,  L/R Hover Proprotor
       Hinge - Proprotor and Sponson Pivot - Outboard All   (top level)
         Hinge - Outboard Proprotor and Sponson Pivot
           Outboard Motor and Sponson Assembly,  L/R Outboard Proprotor
       Nose Gear -> Nose Gear Caster, Nose Gear Spar
       Main Gear -> Main Gear Struts

   TWO CONSEQUENCES FOR THE COORDINATES. X_Rel_Location is relative to the
   PARENT, so a geom parented to the wing and given an absolute station
   lands offset by the wing's own position. Everything here is therefore
   parented to the FUSELAGE, which sits at the origin, so absolute stations
   are correct — except parts under a hinge or a prop, which are written as
   offsets from that parent.

   And SWFT's outboard nacelle is ONE geom, "Outboard Motor and Sponson
   Assembly", a sibling of its proprotors under the hinge. Same finding as
   the viewer reached: the nacelle IS the member, not a pod with a strut.

   THE API IS NOT GUESSED. Every function and parameter name below was
   taken from the scripts OpenVSP 3.51.3 ships in its own scripts/
   directory and from python/openvsp/openvsp/vsp.py:

       AddGeom( type, parent )        vsp.py 4613 — parent is the 2nd arg
       AddGeom types                  BLANK ELLIPSOID FUSELAGE POD PROP
                                      STACK WING, collected from every
                                      AddGeom call in scripts/
       InsertXSec( id, i, XS_* )      scripts/Fuselage.vspscript:9
       "RoundedRect_Width"            scripts/Fuselage.vspscript:10 — and
                                      the same parm name RAVEN's own
                                      fuselage carries
       "Diameter" / "NumBlade"        scripts/VSPAERO_UnsteadyProp:36
       AddSubSurf( id, SS_CONTROL, 0) scripts/TestAnalysisVSPAERO:63
       SetGeomName, WriteVSPFile      vsp.py 4653, 3873

   HINGE IS THE ONE UNCERTAINTY, AND THE SCRIPT CHECKS IT RATHER THAN
   ASSUMING. HINGE_GEOM_SCREEN exists in vsp.py (line 2709), so the geom
   type is real in the application, but no shipped script calls
   AddGeom("HINGE") and the token therefore cannot be confirmed from the
   install. AddGeom returns an EMPTY STRING when it fails, so the emitted
   script tests the first hinge and Prints a clear message if the token is
   wrong — the model still builds, without hinges, and says so. Guessing
   silently would produce a file that looks right and cannot convert.
   ===================================================================== */

import { selectAirfoil, vspSection } from "../engine/airfoils.js";
import { bladeDesign, twistCurve } from "../engine/blade.js";
import { aircraftGeometry, RAVEN_HINGE, RAVEN_ROTOR_STACK,
         RAVEN_GEAR } from "../engine/geometry.js";

const f = (v, n = 5) => (Number.isFinite(v) ? Number(v).toFixed(n) : "0");
const q = (s) => String(s ?? "").replace(/"/g, "'");

/**
 * Emit an OpenVSP AngelScript that BUILDS this aircraft.
 * @param p  engine inputs
 * @param SR converged sizing result
 * @param opts.outFile  path the script writes its .vsp3 to
 */
export function generateVSPScript(p = {}, SR = null, opts = {}) {
  const geo = aircraftGeometry(p, SR);
  if (!geo?.bodies?.length) return "// no geometry — the sizing loop did not converge\n";

  const fL = Number(SR?.fusLen) || Number(p.fusLen) || 7.2;
  const fD = Number(p.fusDiam) || 1.65;
  const D  = Number(SR?.propDiam) || Number(p.propDiam) || 3;
  const nB = Math.max(2, Math.round(p.nBlades ?? 3));
  const out = [];
  const w = (s = "") => out.push(s);

  /* THE SECTION THE SIZING LOOP ACTUALLY USED. This exporter wrote no
     airfoil at all, so every wing and tail came out as OpenVSP's default —
     and vsp3.js wrote Camber 0, a SYMMETRIC section, while the polar was
     computed from a cambered one. A symmetric wing at zero incidence makes
     no lift, so a VSPAERO run on the export analysed a different aircraft
     than the one this tool sized. See engine/airfoils.js vspSection(). */
  /* THE SECTION THE SIZING LOOP ACTUALLY CHOSE — taken from SR, not chosen
     again here. Re-running selectAirfoil in the exporter looked equivalent and
     was not: it needs the wing Reynolds number, the sizing result publishes it
     as `Re_` and this file asked for `Re_wing`, so the fallback 6e6 was used
     and the exporter picked NACA 65-415 where the engine had picked NACA
     65(2)-415. A different section, exported as if it were the analysed one.
     Deriving a quantity a second time is how they drift; the engine already
     publishes its answer, so use it. */
  const selAF = SR?.selAF || (() => {
    try {
      const Re = Number(SR?.Re_) || 6e6;
      const CL = Number(SR?.CLcruise) || Number(p.clDesign) || 0.5;
      return selectAirfoil(p, Re, CL)?.selAF || null;
    } catch { return null; }
  })();
  const sec = selAF ? vspSection(selAF) : null;

  const emitAirfoil = (varName, label) => {
    if (!sec) return;
    w(`    // ${label} section: ${q(selAF.name)}${sec.exact ? "" : "  [EQUIVALENT]"}`);
    for (const line of String(sec.note).match(/.{1,72}(\s|$)/g) || [])
      w(`    //   ${line.trim()}`);
    w(`    {`);
    w(`      string xsurf_${varName} = GetXSecSurf( ${varName}, 0 );`);
    w(`      int n_${varName} = GetNumXSec( xsurf_${varName} );`);
    w(`      for ( int i = 0 ; i < n_${varName} ; i++ )`);
    w(`          ChangeXSecShape( xsurf_${varName}, i, ${sec.type} );  // ${sec.container}`);
    w(`      Update();`);
    w(`      for ( int i = 0 ; i < n_${varName} ; i++ )`);
    w(`      {`);
    w(`          string x = GetXSec( xsurf_${varName}, i );`);
    for (const [k, v] of Object.entries(sec.parms))
      w(`          SetParmVal( GetXSecParm( x, "${k}" ), ${f(v)} );`);
    w(`      }`);
    w(`      Update();`);
    w(`    }`);
  };

  /* A TAIL SURFACE IS SYMMETRIC, AND THAT IS AERODYNAMICS, NOT A SHORTCUT.
     A cambered vertical fin carries a side force at zero sideslip — a
     built-in yaw bias the trim would have to cancel — and an all-moving
     stabilator is symmetric for the same reason about pitch. So the tails
     get NACA 0012, which is in the library with published data (CLmax 1.30,
     CM 0.000, Abbott & von Doenhoff 1959), rather than the wing's section. */
  const emitSymAirfoil = (varName, label, tcTail = 0.12) => {
    w(`    // ${label} section: NACA 00${String(Math.round(tcTail * 100)).padStart(2, "0")} — symmetric, so the surface carries no force at zero incidence`);
    w(`    {`);
    w(`      string xsurf_${varName} = GetXSecSurf( ${varName}, 0 );`);
    w(`      int n_${varName} = GetNumXSec( xsurf_${varName} );`);
    w(`      for ( int i = 0 ; i < n_${varName} ; i++ )`);
    w(`          ChangeXSecShape( xsurf_${varName}, i, 7 );  // FourSeries`);
    w(`      Update();`);
    w(`      for ( int i = 0 ; i < n_${varName} ; i++ )`);
    w(`      {`);
    w(`          string x = GetXSec( xsurf_${varName}, i );`);
    w(`          SetParmVal( GetXSecParm( x, "Camber" ), 0.0 );`);
    w(`          SetParmVal( GetXSecParm( x, "ThickChord" ), ${f(tcTail)} );`);
    w(`      }`);
    w(`      Update();`);
    w(`    }`);
  };

  /* THE BLADE. Only Diameter and NumBlade were ever written, so the exported
     rotor was OpenVSP's default blade at its built-in 20 deg pitch. RAVEN
     cannot settle this one — its own proprotors carry the same untouched
     defaults (Beta34 20.0, Solidity 0.1696, CLi 0.5388), which a bare PROP
     geom reproduces exactly. So the pitch comes from this tool's own hover
     design point instead. See engine/blade.js. */
  const blade = bladeDesign(SR || {}, p);

  const fus   = geo.bodies.find(b => b.kind === "fuselage");
  const wing  = geo.bodies.find(b => b.kind === "wing");
  const vtail = geo.bodies.find(b => b.kind === "vtail");
  const vfins = geo.bodies.filter(b => b.kind === "vfin");
  const htail = geo.bodies.find(b => b.kind === "htail");
  const rotors = geo.bodies.filter(b => b.kind === "rotor");
  const pusher = geo.bodies.find(b => b.kind === "pusher");
  const booms = geo.bodies.filter(b => b.kind === "boom" && /^(Boom|Arm) /.test(b.label || ""));
  const gear = geo.gear;

  w("/* ============================================================");
  w(` *  ${q(SR?.configLabel || p.configType || "eVTOL")}`);
  w(" *  Generated by eVTOL Sizer — src/export/vspscript.js");
  w(" *");
  w(" *  Built on the geom tree of NASA's RAVEN releases: a hinge");
  w(" *  carries a nacelle, the nacelle carries the prop, and the prop");
  w(" *  carries its hub, spacer and motor. Because the hinges are real");
  w(" *  HINGE geoms, this model CONVERTS in OpenVSP — drag JointRotate");
  w(` *  on any hinge from ${RAVEN_HINGE.travelMinDeg} (airplane) to`);
  w(` *  ${RAVEN_HINGE.travelMaxDeg} (past hover); it is written at`);
  w(` *  ${RAVEN_HINGE.asReleasedDeg}, helicopter mode, as RAVEN ships its own.`);
  w(" *");
  w(" *  Every dimension below came from the sizing loop, not from RAVEN.");
  w(" *  Edit the PARAMETERS block and re-run to reshape the aircraft.");
  w(" * ============================================================ */");
  w("");
  /* A SELF-CORRECTING SOLIDITY. OpenVSP's Solidity is an OUTPUT computed from
     the blade's chord curve, not an input — setting it is silently ignored,
     which a probe confirmed (asked for 0.12, the file came back 0.1696, the
     untouched default). The chord curve IS writable, and solidity responds
     very nearly linearly to scaling it: scaling by 0.60 moved 0.1696 to
     0.1044, a ratio of 0.616. "Very nearly" is not good enough to open-loop,
     so the emitted script iterates on OpenVSP's own reported value and stops
     when it is within 0.05%. The script converges the model rather than this
     file predicting what OpenVSP will do. */
  if (blade) {
    /* THE TWIST CURVE CARRIES ABSOLUTE PITCH AND MUST PASS THROUGH BETA34.
       Probed on a bare PROP geom: the default curve is 46.75 / 20.00 / 13.00
       deg at r/R 0.20 / 0.75 / 1.00, and Beta34 is 20.00 — the same quantity
       sampled differently. Writing a twist distribution that did NOT pass
       through the collective would make the exported rotor disagree with the
       blade element point it was sized at. */
    w("void setTwist( string prop, array<double> t, array<double> v )");
    w("{");
    w("    SetPCurve( prop, PROP_TWIST, t, v, PCHIP );");
    w("    Update();");
    w("}");
    w("");
    w("void scaleToSolidity( string prop, double propSigma )");
    w("{");
    w("    array<double> t = PCurveGetTVec( prop, PROP_CHORD );");
    w("    array<double> v = PCurveGetValVec( prop, PROP_CHORD );");
    w("    for ( int it = 0 ; it < 8 ; it++ )");
    w("    {");
    w("        double sig = GetParmVal( GetParm( prop, \"Solidity\", \"Design\" ) );");
    w("        if ( sig <= 0.0 ) { break; }");
    w("        double k = propSigma / sig;");
    w("        if ( k > 0.9995 && k < 1.0005 ) { break; }");
    w("        for ( uint i = 0 ; i < v.length() ; i++ ) { v[i] = v[i] * k; }");
    w("        SetPCurve( prop, PROP_CHORD, t, v, PCHIP );");
    w("        Update();");
    w("    }");
    w("}");
    w("");
  }
  w("void main()");
  w("{");
  w("    // ---------------- PARAMETERS ----------------");
  w(`    double fusLen   = ${f(fL)};   // m`);
  w(`    double fusDiam  = ${f(fD)};   // m, equivalent circular diameter`);
  w(`    double propDiam = ${f(D)};   // m`);
  w(`    int    nBlade   = ${nB};`);
  if (blade) {
    w(`    double propBeta34 = ${f(blade.beta34Deg, 3)};   // deg, blade pitch at 3/4 R`);
    w(`    double propSigma  = ${f(blade.solidity, 4)};   // geometric blade solidity`);
    const tw = twistCurve(blade.beta34Deg);
    if (tw) {
      w(`    array<double> twistR = { ${tw.points.map(pt => f(pt.rOverR, 3)).join(", ")} };`);
      w(`    array<double> twistD = { ${tw.points.map(pt => f(pt.twistDeg, 3)).join(", ")} };`);
      w(`    // ${tw.basis}`);
      w(`    // total twist ${tw.totalTwistDeg} deg, root ${tw.rootTwistDeg} at 0.20 R`);
      w(`    // HOVER OPTIMUM: the model is exported in helicopter mode, so this is`);
      w(`    // the consistent twist for the attitude shown. A proprotor working in`);
      w(`    // high-speed axial flight wants more, and that needs a cruise collective`);
      w(`    // schedule this engine does not have.`);
    }
    w(`    // ${blade.basis}`);
  }
  w(`    double tiltDeg  = ${f(RAVEN_HINGE.asReleasedDeg, 1)};  // 90 = helicopter, 0 = airplane`);
  if (wing) {
    w(`    double wingSpan = ${f(wing.span)};   // m`);
    w(`    double wingArea = ${f(Number(SR?.Swing) || 0)};   // m^2`);
    w(`    double wingSweep= ${f(wing.sweepDeg || 0, 3)};   // deg`);
  }
  w("");
  w(`    Print( string("Building: ${q(SR?.configLabel || p.configType)}\\n") );`);
  w("");

  /* ---------------- FUSELAGE ---------------- */
  w("    // ---------------- FUSELAGE ----------------");
  w("    // RAVEN's fuselage is a ROUNDEDRECT stack of sections, not an");
  w("    // ellipse — height over width runs 0.75 at the nose to 1.69 at");
  w("    // the cabin. Sections below are this aircraft's, scaled so the");
  w("    // maximum cross-section area equals (pi/4) fusDiam^2, which is");
  w("    // what the drag and volume terms in the sizing loop assume.");
  w('    string fus = AddGeom( "FUSELAGE", "" );');
  w('    SetGeomName( fus, "Fuselage" );');
  w('    SetParmVal( fus, "Length", "Design", fusLen );');
  w("    Update();");
  const st = fus?.stations || [];
  if (st.length) {
    w(`    // ${st.length} sections`);
    /* INSERTXSEC INSERTS *AFTER* AN INDEX, AND THE INDEX MUST BE <= n-2.
       This emitted `InsertXSec( fus, 1 )` first, when the geom had been cut
       down to 2 sections — index 1 is the last one, so the call was out of
       range and did NOTHING. Six inserts in a row left the count at 2, and
       every station from XSec_2 up was then written to a section that did
       not exist. Measured in OpenVSP 3.51.3:

           cut to 2, insert at 0  ->  3     cut to 2, insert at 1  ->  2
           cut to 5, insert at 1  ->  6     insert at n-2 repeatedly: 5,6,7,8,9

       Growing against the LIVE count is correct for any target, and never
       depends on what a fresh geom happens to start with (5 here). */
    w(`    while ( GetNumXSec( GetXSecSurf( fus, 0 ) ) > ${st.length} ) { CutXSec( fus, 1 ); }`);
    w(`    while ( GetNumXSec( GetXSecSurf( fus, 0 ) ) < ${st.length} )`);
    w(`        InsertXSec( fus, GetNumXSec( GetXSecSurf( fus, 0 ) ) - 2, XS_ROUNDED_RECTANGLE );`);
    w("    Update();");
    /* THE PARM GROUP NAMES WERE INVENTED. "XSecCurve_0" and "XSec_0" are how
       the parms appear in the .vsp3 XML, but they are NOT groups the API can
       look up on a Geom, and every one of these calls failed at run time:
         FindParm::Can't Find Parm RoundedRect_Width XSecCurve_0
       Reading the XML and assuming the API addresses parms the same way is
       the mistake; the API reaches an XSec's parms through the XSec itself.
       Confirmed by probe: GetXSecParm returns a real id for RoundedRect_Width,
       RoundedRect_Height, XLocPercent and ZLocPercent alike, and all four read
       back exactly what was written. */
    st.forEach((s, i) => {
      w(`    ChangeXSecShape( GetXSecSurf( fus, 0 ), ${i}, XS_ROUNDED_RECTANGLE );`);
      w(`    Update();`);
      w(`    {`);
      w(`      string x = GetXSec( GetXSecSurf( fus, 0 ), ${i} );`);
      w(`      SetParmVal( GetXSecParm( x, "RoundedRect_Width"  ), ${f(s.w)} );`);
      w(`      SetParmVal( GetXSecParm( x, "RoundedRect_Height" ), ${f(s.h)} );`);
      w(`      SetParmVal( GetXSecParm( x, "XLocPercent" ), ${f(s.t)} );`);
      w(`      SetParmVal( GetXSecParm( x, "ZLocPercent" ), ${f((s.dz || 0) / fL)} );`);
      w(`    }`);
    });
    w("    Update();");
  }
  w("");

  /* ---------------- WING ---------------- */
  if (wing) {
    w("    // ---------------- WING ----------------");
    w("    // TOP LEVEL, a sibling of the fuselage — what RAVEN's ParentID says,");
    w("    // and it is why absolute stations are correct here.");
    w('    string wing = AddGeom( "WING", "" );');
    w('    SetGeomName( wing, "Wing" );');
    /* ── THE SPAN WAS BEING SILENTLY OVERRIDDEN ────────────────────────
       Setting TotalSpan, then TotalArea, then Taper is THREE constraints on
       a wing section that accepts three DRIVERS, and OpenVSP resolves the
       conflict by keeping its own aspect ratio and recomputing the span:

           emitted   TotalSpan 13.66   TotalArea 20.73   -> AR 9.00
           file      TotalSpan 10.64   TotalArea 20.73   -> AR 5.46

       and 10.6428 is exactly sqrt(AR_default x area). The area was accepted
       and the span discarded, so every wing this exporter has produced had
       an aspect ratio 65% below the one the engine sized. Induced drag goes
       as 1/AR, so that is not cosmetic.

       It was invisible to every check in this repo because nothing compared
       the WRITTEN span to the SIZED span — the geometry gate reads our own
       bodies, not the file OpenVSP wrote back. VSPAERO found it: the polar
       came out with a span efficiency of 0.62, which is not a physical value
       for an inviscid vortex-lattice solve, and the reason was that the
       solver was flying a different wing.

       THE FIX IS TO STATE THE GEOMETRY, NOT THE TOTALS. Span, root chord and
       tip chord are exactly three drivers, they are what this engine
       actually sizes, and they leave nothing for OpenVSP to infer. Verified:
       span 13.66, area 20.738 against a target 20.73, AR 8.998 against 9.00. */
    w('    SetDriverGroup( wing, 1, SPAN_WSECT_DRIVER, ROOTC_WSECT_DRIVER, TIPC_WSECT_DRIVER );');
    w("    Update();");
    w(`    SetParmVal( wing, "Span",       "XSec_1", ${f((wing.span || 0) / 2)} );`);
    w(`    SetParmVal( wing, "Root_Chord", "XSec_1", ${f(wing.rootChord || 1)} );`);
    w(`    SetParmVal( wing, "Tip_Chord",  "XSec_1", ${f(wing.tipChord || 1)} );`);
    w(`    SetParmVal( wing, "Sweep", "XSec_1", wingSweep );`);
    w(`    SetParmVal( wing, "X_Rel_Location", "XForm", ${f(wing.x)} );`);
    w(`    SetParmVal( wing, "Z_Rel_Location", "XForm", ${f(wing.z)} );`);
    w("    Update();");
    emitAirfoil("wing", "WING");
    /* control surfaces as SS_CONTROL sub-surfaces, which is how a control
       surface belongs to its parent — not as a separate body. */
    const wc = geo.bodies.filter(b => b.kind === "control" && b.surface === "wing" && b.side > 0);
    if (wc.length) {
      w(`    // ${wc.length} control surfaces, split around this layout's booms`);
      wc.forEach((c, i) => {
        w(`    string ss_w${i} = AddSubSurf( wing, SS_CONTROL, 0 );`);
        w(`    SetParmVal( wing, "EtaStart", "SS_Control_${i + 1}", ${f(c.eta0)} );`);
        w(`    SetParmVal( wing, "EtaEnd",   "SS_Control_${i + 1}", ${f(c.eta1)} );`);
        w(`    SetParmVal( wing, "Length_C_Start", "SS_Control_${i + 1}", ${f(c.chordFrac)} );`);
      });
      w("    Update();");
    }
    w("");
  }

  /* ---------------- TAIL ---------------- */
  w("    // ---------------- TAIL ----------------");
  if (vtail) {
    w("    // V-tail: ONE geom mirrored, its rudder an SS_CONTROL sub-surface");
    w('    string vt = AddGeom( "WING", "" );');
    w('    SetGeomName( vt, "V-Tail" );');
    w(`    SetParmVal( vt, "TotalSpan", "WingGeom", ${f(vtail.span)} );`);
    w(`    SetParmVal( vt, "X_Rel_Location", "XForm", ${f(vtail.x)} );`);
    w(`    SetParmVal( vt, "Z_Rel_Location", "XForm", ${f(vtail.z)} );`);
    w(`    SetParmVal( vt, "Dihedral", "XSec_1", ${f(vtail.dihedralDeg ?? 45, 3)} );`);
    w(`    SetParmVal( vt, "Sweep", "XSec_1", ${f(vtail.sweepDeg || 0, 3)} );`);
    w("    SetParmVal( vt, \"Sym_Planar_Flag\", \"Sym\", SYM_XZ );");
    w("    string ss_rud = AddSubSurf( vt, SS_CONTROL, 0 );");
    w('    SetParmVal( vt, "EtaStart", "SS_Control_1", 0.03430 );');
    w('    SetParmVal( vt, "EtaEnd",   "SS_Control_1", 1.00000 );');
    w('    SetParmVal( vt, "Length_C_Start", "SS_Control_1", 0.21570 );');
    emitSymAirfoil("vt", "V-TAIL");
    w("    Update();");
  }
  vfins.forEach((v, i) => {
    w(`    // ${q(v.label)} — a fin is a HALF surface, so it is not mirrored`);
    w(`    string fin${i} = AddGeom( "WING", "" );`);
    w(`    SetGeomName( fin${i}, "${q(v.label)}" );`);
    w(`    SetParmVal( fin${i}, "TotalSpan", "WingGeom", ${f(Math.abs(v.span))} );`);
    w(`    SetParmVal( fin${i}, "X_Rel_Location", "XForm", ${f(v.x)} );`);
    w(`    SetParmVal( fin${i}, "Z_Rel_Location", "XForm", ${f(v.z)} );`);
    w(`    SetParmVal( fin${i}, "X_Rel_Rotation", "XForm", ${v.span < 0 ? -90 : 90} );`);
    w(`    SetParmVal( fin${i}, "Sweep", "XSec_1", ${f(v.sweepDeg || 0, 3)} );`);
    emitSymAirfoil(`fin${i}`, q(v.label).toUpperCase());
    if (i === 0) {
      w(`    string ss_fin = AddSubSurf( fin${i}, SS_CONTROL, 0 );`);
      w(`    SetParmVal( fin${i}, "EtaStart", "SS_Control_1", 0.03430 );`);
      w(`    SetParmVal( fin${i}, "EtaEnd",   "SS_Control_1", 1.00000 );`);
      w(`    SetParmVal( fin${i}, "Length_C_Start", "SS_Control_1", 0.21570 );`);
    }
    w("    Update();");
  });
  if (htail) {
    w("    // Stabilator on its own hinge — all-moving, as RAVEN's Stab-Hinge is");
    w('    string stabHinge = AddGeom( "HINGE", "" );');
    w('    if ( stabHinge.length() > 0 ) { SetGeomName( stabHinge, "Stab-Hinge" ); }');
    w(`    string stab = AddGeom( "WING", stabHinge.length() > 0 ? stabHinge : fus );`);
    w('    SetGeomName( stab, "Stabilator" );');
    w(`    SetParmVal( stab, "TotalSpan", "WingGeom", ${f(htail.span)} );`);
    w(`    SetParmVal( stab, "X_Rel_Location", "XForm", ${f(htail.x)} );`);
    w(`    SetParmVal( stab, "Z_Rel_Location", "XForm", ${f(htail.z)} );`);
    w(`    SetParmVal( stab, "Sweep", "XSec_1", ${f(htail.sweepDeg || 0, 3)} );`);
    emitSymAirfoil("stab", "STABILATOR");
    w("    Update();");
  }
  w("");

  /* ---------------- SPONSONS ---------------- */
  if (booms.length) {
    w("    // ---------------- SPONSONS / ARMS ----------------");
    w("    // RAVEN's sponson is a constant circular STACK that sweeps its");
    w("    // tail up through 0.053 of its length.");
    booms.forEach((b, i) => {
      const len = Math.hypot(b.x1 - b.x0, (b.y ?? 0) - (b.y0 ?? b.y));
      w(`    string spon${i} = AddGeom( "STACK", fus );`);   // RAVEN parents its sponson to the FUSELAGE
      w(`    SetGeomName( spon${i}, "${q(b.label)}" );`);
      w(`    SetParmVal( spon${i}, "X_Rel_Location", "XForm", ${f(b.x0)} );`);
      w(`    SetParmVal( spon${i}, "Y_Rel_Location", "XForm", ${f(b.y0 ?? b.y)} );`);
      w(`    SetParmVal( spon${i}, "Z_Rel_Location", "XForm", ${f(b.z)} );`);
      w(`    SetParmVal( spon${i}, "Z_Rel_Rotation", "XForm", ${f(Math.atan2((b.y ?? 0) - (b.y0 ?? b.y), b.x1 - b.x0) * 180 / Math.PI, 3)} );`);
      w(`    // length ${f(len, 3)} m, radius ${f(b.radius, 3)} m`);
      w("    Update();");
    });
    w("");
  }

  /* ---------------- ROTOR INSTALLATIONS ---------------- */
  w("    // ---------------- ROTOR INSTALLATIONS ----------------");
  w("    // Per RAVEN: a TILTING rotor gets Hinge -> Nacelle -> Prop, and a");
  w("    // FIXED one gets no hinge and no nacelle at all — only the stack.");
  w("    // Hub, Spacer and Motor are children of the Prop in RAVEN's tree.");
  w("    bool hingeOK = true;");
  rotors.forEach((r, i) => {
    const tag = `r${i}`;
    const S = r.tilting ? RAVEN_ROTOR_STACK.tilting : RAVEN_ROTOR_STACK.fixed;
    w("");
    w(`    // --- ${q(r.label)} (${r.tilting ? "tilting" : "fixed"}) ---`);
    let parent = "fus";
    if (r.tilting && r.hinge) {
      w(`    string h_${tag} = AddGeom( "HINGE", fus );`);
      w(`    if ( h_${tag}.length() == 0 ) { hingeOK = false; }`);
      w(`    else {`);
      w(`        SetGeomName( h_${tag}, "Hinge - ${q(r.label)}" );`);
      w(`        SetParmVal( h_${tag}, "X_Rel_Location", "XForm", ${f(r.hinge.x)} );`);
      w(`        SetParmVal( h_${tag}, "Y_Rel_Location", "XForm", ${f(r.hinge.y)} );`);
      w(`        SetParmVal( h_${tag}, "Z_Rel_Location", "XForm", ${f(r.hinge.z)} );`);
      w(`        // lateral axis, RAVEN's own hinge orientation`);
      w(`        SetParmVal( h_${tag}, "PrimXVec", "Hinge", ${RAVEN_HINGE.axis[0]} );`);
      w(`        SetParmVal( h_${tag}, "PrimYVec", "Hinge", ${RAVEN_HINGE.axis[1]} );`);
      w(`        SetParmVal( h_${tag}, "PrimZVec", "Hinge", ${RAVEN_HINGE.axis[2]} );`);
      w(`        SetParmVal( h_${tag}, "JointRotMin", "Hinge", ${RAVEN_HINGE.travelMinDeg} );`);
      w(`        SetParmVal( h_${tag}, "JointRotMax", "Hinge", ${RAVEN_HINGE.travelMaxDeg} );`);
      w(`        SetParmVal( h_${tag}, "JointRotate", "Hinge", tiltDeg );`);
      w(`    }`);
      parent = `( h_${tag}.length() > 0 ? h_${tag} : ${parent} )`;
      w(`    string nac_${tag} = AddGeom( "STACK", ${parent} );`);
      w(`    SetGeomName( nac_${tag}, "${q(r.label)} Nacelle" );`);
      w(`    SetParmVal( nac_${tag}, "Y_Rel_Rotation", "XForm", 90 );  // vertical in hover, as RAVEN's is`);
      w("    // offsets below are relative to the HINGE, this geom's parent");
      w(`    SetParmVal( nac_${tag}, "X_Rel_Location", "XForm", ${f((r.x - r.hinge.x) * 0.5)} );`);
      w(`    SetParmVal( nac_${tag}, "Z_Rel_Location", "XForm", ${f((r.z - r.hinge.z) * 0.5)} );`);
      w("    Update();");
      /* THE PROP IS A SIBLING OF THE NACELLE, NOT ITS CHILD. SWFT puts
         'Outboard Motor and Sponson Assembly' and 'L/R Outboard Proprotor'
         both under the hinge. Parenting the prop to the nacelle while writing
         hinge-relative offsets would double-count the nacelle's own offset. */
      parent = `( h_${tag}.length() > 0 ? h_${tag} : fus )`;
    }
    w(`    string prop_${tag} = AddGeom( "PROP", ${parent} );`);
    w(`    SetGeomName( prop_${tag}, "${q(r.label)}" );`);
    w(`    SetParmVal( prop_${tag}, "PropMode", "Design", PROP_BLADES );`);
    w(`    SetParmVal( prop_${tag}, "Diameter", "Design", propDiam );`);
    w(`    SetParmVal( prop_${tag}, "NumBlade", "Design", nBlade );`);
    if (blade) {
      w(`    SetParmVal( prop_${tag}, "UseBeta34Flag", "Design", 1 );`);
      w(`    SetParmVal( prop_${tag}, "Beta34", "Design", propBeta34 );`);
      w("    Update();");
      w(`    setTwist( prop_${tag}, twistR, twistD );`);
      w(`    scaleToSolidity( prop_${tag}, propSigma );`);
    }
    /* Under a hinge the station is an OFFSET from it; at top level it is
       absolute, because the fuselage sits at the origin. */
    const rx = (r.tilting && r.hinge) ? r.x - r.hinge.x : r.x;
    const ry = (r.tilting && r.hinge) ? r.y - r.hinge.y : r.y;
    const rz = (r.tilting && r.hinge) ? r.z - r.hinge.z : r.z;
    w(`    SetParmVal( prop_${tag}, "X_Rel_Location", "XForm", ${f(rx)} );`);
    w(`    SetParmVal( prop_${tag}, "Y_Rel_Location", "XForm", ${f(ry)} );`);
    w(`    SetParmVal( prop_${tag}, "Z_Rel_Location", "XForm", ${f(rz)} );`);
    w(`    SetParmVal( prop_${tag}, "Y_Rel_Rotation", "XForm", 90 );`);
    w("    Update();");
    /* Hub / Spacer / Motor, at RAVEN's measured diameters */
    for (const [nm, dia] of [["Hub", RAVEN_ROTOR_STACK.hubDiaOverD],
                             ["Spacer", RAVEN_ROTOR_STACK.spacerDiaOverD],
                             ["Motor", RAVEN_ROTOR_STACK.motorDiaOverD]]) {
      const t2 = `${nm.toLowerCase()}_${tag}`;
      w(`    string ${t2} = AddGeom( "STACK", prop_${tag} );`);
      w(`    SetGeomName( ${t2}, "${nm}" );`);
      w(`    SetParmVal( ${t2}, "Y_Rel_Rotation", "XForm", 90 );`);
      w(`    // ${nm} diameter ${f(dia * D, 4)} m = ${dia} D  [SRC] RAVEN`);
    }
    w(`    // hub stands ${S.hub} D above the member carrying it  [SRC] RAVEN`);
    w("    Update();");
  });
  w("");

  /* ---------------- PUSHER ---------------- */
  if (pusher) {
    w("    // ---------------- CRUISE PUSHER ----------------");
    w('    string push = AddGeom( "PROP", fus );');
    w('    SetGeomName( push, "Cruise pusher" );');
    w('    SetParmVal( push, "PropMode", "Design", PROP_BLADES );');
    w(`    SetParmVal( push, "Diameter", "Design", ${f(pusher.radius * 2)} );`);
    w(`    SetParmVal( push, "NumBlade", "Design", ${Math.max(2, Math.round(pusher.blades ?? 3))} );`);
    w(`    SetParmVal( push, "X_Rel_Location", "XForm", ${f(pusher.x)} );`);
    w(`    SetParmVal( push, "Z_Rel_Location", "XForm", ${f(pusher.z)} );`);
    w("    Update();");
    w("");
  }

  /* ---------------- LANDING GEAR ---------------- */
  if (gear?.applicable) {
    w("    // ---------------- LANDING GEAR ----------------");
    w("    // Stations from RAVEN SWFT; every SIZE is this tool's own CS-27");
    w("    // drop-test result, so the gear changes with the aircraft.");
    w(`    // nose ${f(gear.xNose / fL, 4)} fL, main ${f(gear.xMain / fL, 4)} fL,`);
    w(`    // track/span ${f(RAVEN_GEAR.trackOverSpan, 4)}, tyre ${f(gear.rMain * 2, 3)} m`);
    w('    string ngear = AddGeom( "STACK", fus );');
    w('    SetGeomName( ngear, "Nose Gear" );');
    w(`    SetParmVal( ngear, "X_Rel_Location", "XForm", ${f(gear.xNose)} );`);
    w(`    SetParmVal( ngear, "Z_Rel_Location", "XForm", ${f(gear.zAxleNose)} );`);
    w('    string mgear = AddGeom( "STACK", fus );');
    w('    SetGeomName( mgear, "Main Gear" );');
    w(`    SetParmVal( mgear, "X_Rel_Location", "XForm", ${f(gear.xMain)} );`);
    w(`    SetParmVal( mgear, "Y_Rel_Location", "XForm", ${f(gear.yMain)} );`);
    w(`    SetParmVal( mgear, "Z_Rel_Location", "XForm", ${f(gear.zAxleMain)} );`);
    w('    SetParmVal( mgear, "Sym_Planar_Flag", "Sym", SYM_XZ );');
    w("    Update();");
    w("");
  }

  /* ---------------- REPORT AND WRITE ---------------- */
  w("    // ---------------- REPORT AND WRITE ----------------");
  w("    if ( !hingeOK )");
  w("    {");
  w('        Print( string("NOTE: AddGeom(\\"HINGE\\") returned nothing on this build.\\n") );');
  w('        Print( string("      The model is complete but its rotors cannot be tilted.\\n") );');
  w('        Print( string("      Add a Hinge by hand and re-parent the nacelles to it.\\n") );');
  w("    }");
  w("    else");
  w("    {");
  w(`        Print( string("Hinges built. Drag JointRotate ${RAVEN_HINGE.travelMinDeg}..${RAVEN_HINGE.travelMaxDeg} to convert.\\n") );`);
  w("    }");
  w("    Update();");
  /* TWO ARGUMENTS. OpenVSP's AngelScript has only
       void WriteVSPFile( const string&in file_name, int set )
     and the one-argument form this file used fails to COMPILE:
       "No matching signatures to 'WriteVSPFile(const string)'".
     Every script this tool has ever emitted stopped there, which went unseen
     because nothing had run one through vspscript.exe. validation/vsp-run.mjs
     now does. */
  w(`    WriteVSPFile( "${q(opts.outFile || "evtol-sizer-model.vsp3")}", SET_ALL );`);
  w('    Print( string("Wrote model.\\n") );');
  w("}");
  w("");
  return out.join("\n");
}
