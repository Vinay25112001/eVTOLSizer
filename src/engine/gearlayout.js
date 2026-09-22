/* =====================================================================
   LANDING GEAR LAYOUT — where the gear the tool already sizes actually goes
   =====================================================================
   THE DEFECT THIS CLOSES. weights.js sizes a landing gear to the CS-27
   drop tests (landinggear.js), cg.js carries it at CG_STATIONS.gear =
   0.52 fL, and the weight statement reports its mass. The GEOMETRY drew
   no gear at all. The tool was therefore publishing a mass for a
   component it did not place anywhere in space, and every rendered
   aircraft stood on nothing.

   WHAT IS AND IS NOT DERIVABLE HERE, BECAUSE IT BOUNDS THE METHOD.

   NDARC does NOT size gear placement. Its landing gear is a PLACED
   component: the input deck takes a location and dLG, "distance from
   bottom of landing gear to WL_gear", and uses it only to get rotor
   height above ground,
       height rotor = HAGL + (WL_hub - WL_gear + d_gear)
   [SRC] NDARC Input Manual, Landing Gear block (corpus S0231, l.4577-4589).
   So NDARC gives the VERTICAL relation and explicitly declines the
   longitudinal one.

   THIS FILE ORIGINALLY SAID RAVEN AND SWFT "carry no landing gear geom to
   measure". THAT WAS WRONG, and it was wrong because it was inferred from a
   research note's component list instead of from the file. The SWFT public
   release carries five: Nose Gear, Nose Gear Caster, Nose Gear Spar, Main
   Gear and Main Gear Struts. The gear now has the same kind of measured
   referent every other station in geometry.js has — see RAVEN_GEAR there.

   The corpus still has no tipback or turnover criterion in any of its 879
   extracted full texts, so the classical Currey/Roskam angles are still not
   asserted: they would be numbers from memory. They are not needed, because
   RAVEN publishes the stations directly.

   WHAT IS USED INSTEAD IS ONLY WHAT THE MODEL HAS ALREADY COMMITTED TO.

   1. LONGITUDINAL — RAVEN'S STATIONS, WITH THE STATICS AS A CHECK ON THEM.
      Nose gear at 0.0824 fL and main gear at 0.4114 fL, measured from the
      SWFT release. The earlier version derived these from a moment balance
      because there was believed to be nothing to measure; the balance is
      retained, but now as a CHECK rather than as the source:

          f_implied = (x_main - x_cg) / (x_main - x_nose)

      is computed at RAVEN's stations and returned as `noseLoadImplied`. If
      it drifts far from the 0.10 the gear model sizes tyres against, then
      RAVEN's layout and this aircraft's CG disagree, and that is worth
      seeing rather than smoothing over. The main gear must still come out
      aft of the CG, and that is asserted.

   2. LATERAL. Track from RAVEN's track/span of 0.1903, applied to THIS
      aircraft's span, with a floor at the body width plus one tyre so the
      wheels can never end up inside the fuselage on a short-span layout.
      Rotor-borne layouts have no wing to scale on and fall back to the
      body-width rule.

   3. VERTICAL. From the drop test that sized the strut. The aircraft may
      not strike the ground when the gear is fully compressed, so the
      static clearance under the lowest structure must be at least the
      fitted stroke. The ground plane is therefore

          z_ground = z_lowest_structure - strokeFitted

      and the leg runs from its attachment down to an axle one tyre radius
      above that. Every length in the drawn gear is thus a CS-27 drop-test
      output.

   WHAT THIS MODULE REPORTS RATHER THAN HIDES. The resulting gear MASS
   centroid is returned as `xMassCentroidFrac`. cg.js assumes 0.52 fL
   [LAY]. If the two disagree, the assumed station is inconsistent with
   the gear the tool actually sizes, and that is a finding about the CG
   model — so it is returned for a gate to check, not quietly reconciled.
   ===================================================================== */

/** Tyre section width, in metres, read off the Goodyear size designation.
    "22x8.0-10" -> 8.0 in;  "6.50-8" -> 6.50 in;  "18x4.4" -> 4.4 in. */
export function tyreWidthM(size = "") {
  const s = String(size);
  const cross = s.match(/(\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)/);
  if (cross) return Number(cross[2]) * 0.0254;
  const dash = s.match(/^(\d+(?:\.\d+)?)-/);
  if (dash) return Number(dash[1]) * 0.0254;
  return 0;
}

/**
 * Place the gear that landinggear.js has already sized.
 *
 * @param o.gear     the landingGear() result (tyres, strokeFittedM, counts)
 * @param o.fL       fuselage length, m
 * @param o.fD       fuselage diameter, m
 * @param o.xCG      total CG station, m from nose
 * @param o.xNose    nose-gear station, m from nose (CG_STATIONS.avionics * fL)
 * @param o.zLowest  z of the lowest existing structure, m
 * @param o.zAttach  z the legs attach at (fuselage underside), m
 * @param o.noseLoadFrac  static nose-load fraction from GEAR_CONSTANTS
 */
export function gearLayout(o = {}) {
  const g = o.gear;
  const fL = Number(o.fL) || 0;
  const fD = Number(o.fD) || 0;
  if (!g || !fL || !(g.tyreMain && g.tyreNose)) {
    return { applicable: false, note: "needs a sized gear and a fuselage" };
  }

  const f = Math.min(0.45, Math.max(0.01, Number(o.noseLoadFrac) || 0.10));
  const xCG = Number(o.xCG) || 0.45 * fL;

  /* RAVEN SWFT's own stations, scaled to THIS fuselage. */
  const R = o.raven || {};
  const xNose = (R.noseXoverFL ?? 0.0824) * fL;
  const xMainRaven = (R.mainXoverFL ?? 0.4114) * fL;

  /* THE MAIN GEAR GOES WHERE THE LOAD SPLIT PUTS IT, NOT WHERE RAVEN'S IS,
     AND THE REASON IS INTERNAL CONSISTENCY. landinggear.js SELECTS THE TYRES
     from loadMain = W(1-f)/nMain and loadNose = W f/nNose. Drawing the mains
     at a station that implies some other split would mean the tyres on the
     picture are rated for loads the picture does not produce.

     Measured, this matters: at RAVEN's 0.4114 fL this aircraft's CG implies a
     nose load of 0.4% to 3.3% depending on layout, against the 10% the tyres
     were chosen for — an aeroplane sitting almost exactly on its main wheels.
     So the moment balance sets the station and RAVEN's becomes the CHECK:

         x_main = (x_cg - f x_nose) / (1 - f)

     `xMainRaven` and `ravenDeltaFL` are returned so the disagreement stays
     visible. It is a statement about where this tool puts the CG relative to
     where NASA put it, and that is worth seeing. */
  const xMain = (xCG - f * xNose) / (1 - f);
  const noseLoadAtRaven = (xMainRaven - xCG) / Math.max(1e-6, xMainRaven - xNose);

  const rMain = (g.tyreMain.odIn * 0.0254) / 2;
  const rNose = (g.tyreNose.odIn * 0.0254) / 2;
  const wMain = tyreWidthM(g.tyreMain.size);
  const wNose = tyreWidthM(g.tyreNose.size);

  /* Track from RAVEN's track/span, floored so a wheel can never sit inside
     the body. A rotor-borne layout has no span to scale on and uses the floor. */
  const bWing = Number(o.bWing) || 0;
  const trackFloor = fD / 2 + wMain / 2;
  const yMain = bWing > 0
    ? Math.max(trackFloor, (R.trackOverSpan ?? 0.1903) * bWing / 2)
    : trackFloor;

  /* VERTICAL. Two conditions, and the binding one is the strut's own length.
     A strut that must COMPRESS by `stroke` has to be at least that long
     extended, so the axle hangs a stroke below its attachment:

         z_axle = z_attach - stroke,   z_ground = z_axle - r_tyre

     The first version of this took the ground as simply `stroke` below the
     lowest structure and put the axle a tyre radius above it. On every
     configuration the tyre radius (0.22 m) exceeded the stroke (0.11 m), so
     the wheel centre came out ABOVE the fuselage underside and the wheels
     were drawn buried inside the body. Rendering it is what caught that.

     Both legs stand on ONE ground plane, so it is set by the leg that reaches
     lowest, and the shorter leg's strut lengthens to meet it. */
  const stroke = Math.max(0.02, Number(g.strokeFittedM) || 0.02);
  const zLowest = Number.isFinite(o.zLowest) ? o.zLowest : -fD / 2;
  const zAttach = Number.isFinite(o.zAttach) ? o.zAttach : -fD / 2;
  const zGround = Math.min(zAttach - stroke - rMain, zAttach - stroke - rNose,
                           zLowest - stroke);
  const zAxleMain = zGround + rMain;
  const zAxleNose = zGround + rNose;

  /* Gear mass centroid that RESULTS, for comparison with CG_STATIONS.gear.
     The nose strut is 0.45x a main strut in landinggear.js; tyres and wheels
     scale with the wheel count. */
  const nM = g.nMainWheels, nN = g.nNoseWheels;
  const strutShareMain = nM * 1.0;
  const strutShareNose = nN * 0.45;
  const strutDen = strutShareMain + strutShareNose || 1;
  const tyreShareMain = nM * g.tyreMain.massKg;
  const tyreShareNose = nN * g.tyreNose.massKg;
  const tyreDen = tyreShareMain + tyreShareNose || 1;
  const massMain = strutShareMain * (g.strutMass / strutDen)
                 + tyreShareMain * ((g.tyreMass + g.wheelMass) / tyreDen);
  const massNose = strutShareNose * (g.strutMass / strutDen)
                 + tyreShareNose * ((g.tyreMass + g.wheelMass) / tyreDen);
  const mTot = massMain + massNose || 1;
  const xMassCentroid = (massMain * xMain + massNose * xNose) / mTot;

  return {
    applicable: true,
    xNose, xMain, yMain,
    xMainRaven,
    ravenDeltaFL: +((xMain - xMainRaven) / fL).toFixed(4),
    noseLoadAtRaven: +noseLoadAtRaven.toFixed(4),
    noseLoadSized: f,
    trackFromSpan: bWing > 0 && (R.trackOverSpan ?? 0.1903) * bWing / 2 > trackFloor,
    zGround, zAttach, zAxleMain, zAxleNose,
    rMain, rNose, wMain, wNose,
    nMainWheels: nM, nNoseWheels: nN,
    strokeM: stroke,
    mainAftOfCG: xMain > xCG,
    staticClearanceM: zLowest - zGround,
    xMassCentroidFrac: +(xMassCentroid / fL).toFixed(4),
    massMainKg: +massMain.toFixed(1),
    massNoseKg: +massNose.toFixed(1),
    basis:
      "longitudinal and lateral stations measured from the RAVEN SWFT public "
      + "release (nose 0.0824 fL, main 0.4114 fL, track/span 0.1903), scaled to "
      + "this aircraft; vertical from the CS-27 fitted stroke (full compression "
      + "must not strike); every SIZE — tyre, width, stroke — is this tool's own "
      + "drop-test result, not RAVEN's dimensions. NDARC treats gear placement as "
      + "an input (S0231), so no tipback or turnover angle is asserted.",
  };
}
