/* =====================================================================
   PARAMETRIC AIRCRAFT GEOMETRY — built on NASA's RAVEN layout
   =====================================================================
   ONE geometry, consumed by BOTH the interactive 3D viewer and the .vsp3
   exporter. A viewer that drew its own idea of the aircraft would drift from
   the file the user downloads, and this codebase has been bitten repeatedly by
   one quantity being derived in two places.

   ── WHY THE LAYOUT LOOKS LIKE RAVEN ────────────────────────────────────
   The station fractions below are NOT invented. They were measured out of
   NASA's two released Open eVTOL models (see src/data/vsp-models.js), and the
   two AGREE — across a 3.1x difference in rotor diameter and a 3.4x difference
   in span:

       quantity                      RAVEN     SWFT     spread
       sponson lateral station       0.4305    0.4309   0.1%
       tip-rotor lateral station     1.0392    1.0422   0.3%
       rotor diameter / wing span    0.3104    0.2844   8%

   Two independent vehicles landing within 0.1% on where the sponsons go is a
   DESIGN CONVENTION, not a coincidence, so it is adopted as the template. The
   longitudinal stations spread more (fuselage proportions differ), so the mean
   is used and the spread is recorded here rather than hidden.

   THE TEMPLATE IS A SHAPE, NOT A SIZE. Every absolute dimension comes from the
   user's own sized aircraft — span, rotor diameter, rotor count, fuselage
   length and diameter, tilt split. Change any input and the model changes with
   it. Nothing here replicates a NASA aircraft; it borrows how NASA arrange one.

   ── HOW ONE TEMPLATE SERVES EVERY CONFIGURATION ────────────────────────
     tiltrotor      every rotor tilts — tips and sponsons alike
     hybrid         RAVEN exactly: tilting tips + tilting forward sponson
                    rotors + lift-only aft sponson rotors
     lift+cruise    drop the tilting tip rotors, keep the sponson lift rotors,
                    add a pusher at the tail
     hybridPusher   tilting tips AND a pusher
     multicopter /  no wing, so no sponsons: rotors on radial arms at the
     side-by-side   non-overlap radius
   ===================================================================== */
import { resolveConfiguration } from "./configuration.js";
import { COAX_DISK_GAP_OVER_D, ringRadiusFor, hubSpacingFor, interleavedFor,
         SBS_HUB_SEP_OVER_D, MC_AFT_RISE_OVER_D } from "./coaxial.js";
import { landingGear, GEAR_CONSTANTS } from "./landinggear.js";
import { gearLayout } from "./gearlayout.js";
import { CG_STATIONS } from "./cg.js";
import { RAVEN_PROFILES } from "../data/raven-profiles.js";

/* [SRC] measured from NASA RAVEN v01_003 and RAVEN SWFT. See table above. */
/* =====================================================================
   THE TEMPLATE — measured from NASA, with the ENGINE supplying every station
   it already computes
   =====================================================================
   TWO SOURCES, AND NEITHER IS A GUESS.

   1. THE SIZING LOOP already computes most of this aircraft and the mass model
      has already been PAID for it. Using anything else would draw a different
      aeroplane from the one that was weighed:
        xRotFwd, xRotAft   the fore/aft lift-rotor stations. engine/booms.js
                           sizes the boom bending moment on exactly these
                           (armFwd = |xWing - xRotFwd|, armAft = |xRotAft -
                           xWing|), so drawing rotors anywhere else means the
                           booms in the picture are not the booms in the mass.
        boomDetail         nBooms, radiusM — the tubes that were actually sized.
        xACwing, lv        wing aerodynamic centre and TAIL ARM. The V-tail goes
                           at xACwing + lv - 0.25 Cr_vt, which is where the
                           stability solution put it.
        Cr_, Ct_, bWing, sweep, MAC, Cr_vt, Ct_vt, bvt_panel, sweep_vt,
        vtGamma_opt, wingLEfrac.

   2. NASA'S TWO MODELS supply only what the loop does NOT compute — the
      LATERAL boom station and the VERTICAL stack — and the two agree:

        quantity                             RAVEN     SWFT
        boom / sponson lateral, /half-span   0.4305    0.4309
        tip-rotor lateral, /half-span        1.0392    1.0422
        tilt HINGE height above wing, /D     +0.003    -0.015 / +0.001
        boom-rotor height above wing, /D     +0.121    +0.096 / +0.134
        tip-rotor height above wing, /D      +0.261      —
        boom / sponson height above wing,/D  -0.060      —
        vertical tail below wing, /D         -0.268    -0.286
        horizontal tail below wing, /D       -0.337    -0.369

      Heights are normalised by ROTOR DIAMETER against the WING PLANE, because
      that is what they physically scale with — the earlier version normalised
      by fuselage LENGTH, which is dimensionally meaningless and put the whole
      rotor plane 1.3 m above the wing it was bolted to.

      THE TILT HINGE SITS ON THE WING PLANE in both aircraft (+0.003 D and
      +0.001 D). That is the real attachment: pivot on the wing, nacelle above
      it, disc above that.
   ===================================================================== */
/* ── CONTROL SURFACES, MEASURED FROM RAVEN ─────────────────────────────
   Read directly out of the SS_Control sub-surfaces of
   RAVEN_v01_003_Release.vsp3. `eta` is the span fraction along the half
   wing; `chord` is the surface chord as a fraction of the local chord;
   all four are trailing-edge devices (LE_Flag = 0 in the file).

   THE FLAP GAP IS NOT A GAP. The inboard flap ends at eta 0.386 and the
   outboard flap begins at 0.473. NASA did not leave 9% of the span
   undeflected for nothing: the boom crosses the wing at eta 0.4305
   (NASA_LAYOUT.boomYoverHalfSpan, measured independently from the same
   file), and 0.4305 is almost exactly the midpoint of that gap. The flap
   is SPLIT AROUND THE BOOM. Two measurements taken for different reasons
   agreeing to three decimals is the strongest evidence in this file that
   the layout has been read correctly rather than guessed, and the gate
   asserts it so the two can never drift apart.

   The aileron runs from eta 0.700 to the tip at 45% chord - unusually
   deep for an aileron, and consistent with a configuration that has to
   retain roll authority at the low speeds a lift+cruise vehicle
   transitions through. */
export const RAVEN_CONTROLS = {
  wing: [
    { name: "Flap inboard",  eta0: 0.1058, eta1: 0.3860, chord: 0.2398, kind: "flap" },
    { name: "Flap outboard", eta0: 0.4730, eta1: 0.6963, chord: 0.2398, kind: "flap" },
    { name: "Aileron",       eta0: 0.7003, eta1: 1.0000, chord: 0.4500, kind: "aileron" },
  ],
  vtail: [
    { name: "Rudder",        eta0: 0.0343, eta1: 1.0000, chord: 0.2157, kind: "rudder" },
  ],
};

export const NASA_LAYOUT = {
  boomYoverHalfSpan:     0.431,   // RAVEN 0.4305, SWFT 0.4309
  tipRotorYoverHalfSpan: 1.040,   // RAVEN 1.0392, SWFT 1.0422 — outboard of the tip
  hingeZoverD:           0.000,   // both: the pivot is on the wing plane
  boomZoverD:           -0.060,   // RAVEN sponson, below the wing
  /* ── HUB HEIGHT IS A STACK, NOT A FRACTION OF THE ROTOR ─────────────
     RAVEN puts its boom rotors 0.121 D above the sponson, and taking that as a
     rule of D gave an 8.3 m multicopter rotor a 1.45 m mast. The height is not
     a property of the rotor: it is the NACELLE sitting on the BOOM with the hub
     on top, which is exactly the hub/spacer/motor stack RAVEN models there.

     Computed as nacelle half-height + structure radius, it reproduces RAVEN's
     own 0.343 m to within 3% (0.147 + 0.15 + clearance = 0.334) and stops
     inventing a mast when the rotor is large. */
  boomRotorZoverD:       0.115,   // RAVEN 0.121, SWFT 0.096/0.134 — kept for reference
  tipRotorZoverD:        0.261,   // RAVEN
  /* ── TAIL HEIGHT SCALES WITH THE FUSELAGE, NOT THE ROTOR ────────────
     These were normalised by ROTOR DIAMETER against the wing plane, which is
     wrong in kind: a tail root is bolted to the tail cone, so it scales with
     the BODY. With a large rotor the old form drove the V-tail root to z =
     -0.16 m — below the fuselage centreline, i.e. hanging under the aeroplane.

     Re-measured against the fuselage half-height at the body's own origin,
     both aircraft put every surface ABOVE the centreline:

                          RAVEN    SWFT    used
       wing               +1.30   +1.66     —   (see wingZoverFusDiam)
       vertical tail      +0.33   +0.70   +0.52
       horizontal tail    +0.09   +0.42   +0.26

     The spread is wide because the two bodies differ in fineness, but the SIGN
     and the ORDER are identical: tail on the upper body, below the wing. */
  vTailZoverFusHalfHeight: 0.52,   // RAVEN +0.33, SWFT +0.70
  hTailZoverFusHalfHeight: 0.26,   // RAVEN +0.09, SWFT +0.42
  wingZoverFusDiam:      0.42,    // high wing, as both models are
  src: "measured from the NASA RAVEN v01_003 and RAVEN SWFT .vsp3 releases; "
     + "lateral stations agree to 0.1%, tail heights to 3% of rotor diameter",
};

/* =====================================================================
   THE TILT MECHANISM, READ OUT OF RAVEN SWFT'S OWN HINGE GEOMS
   =====================================================================
   The .vsp3 carries five Hinge geoms. Two of them drive the proprotors
   ("Hinge - Proprotor Pivot - Inboard All", "Hinge - Proprotor and
   Sponson Pivot - Outboard All") and they say exactly how the aircraft
   converts:

     axis            PrimXVec 0, PrimYVec 1, PrimZVec 0  — pure LATERAL
     travel          JointRotMin 0, JointRotMax 110 deg
     as released     JointRotate = 90 deg

   90 deg is HELICOPTER MODE, per the convention NASA state in the RAVEN
   proprotor paper (Wright & Silva, corpus S3568). So the model NASA
   published is sitting in HOVER, and it converts down to 0 (airplane) and
   can go past hover to 110.

   WHERE THE PIVOT IS, AND WHY IT MATTERS. The hinges sit on the WING
   PLANE — 0.0865 m below it inboard and 0.0058 m above it outboard, which
   on a 5.9436 m rotor is -0.015 D and +0.001 D. That independently
   reproduces hingeZoverD = 0.000 above, measured earlier for a different
   reason.

   THE HUB IS NOT ON THE PIVOT. It stands off it, and the offsets are
   measured here rather than assumed:

       station    dx (fwd)     dz (up)
       inboard    -0.0526 D    +0.1105 D
       outboard   -0.0010 D    +0.2829 D

   The outboard +0.2829 D agrees with tipRotorZoverD = 0.261 above, again
   measured separately. So converting is not a rotation of the disc in
   place: the hub SWINGS THROUGH AN ARC about a pivot on the wing, and the
   nacelle swings rigidly with it. Drawing the rotation about the hub
   instead — which this file did — holds the hub still and is the wrong
   mechanism, however similar it looks at small angles.
   ===================================================================== */
export const RAVEN_HINGE = {
  axis:            [0, 1, 0],   // PrimYVec = 1: lateral, on BOTH vehicles
  travelMinDeg:    0,           // JointRotMin — airplane mode, both
  travelMaxDeg:    110,         // JointRotMax — SWFT; v01_003 stops at 90
  asReleasedDeg:   90,          // JointRotate — helicopter mode, BOTH
  hubFwdOverD:     { inboard: 0.0526, outboard: 0.0010 },
  hubAboveOverD:   { inboard: 0.1105, outboard: 0.2829 },
  /* WHERE THE TIP HINGE SITS ON THE WING, AND WHY THE TIP NEEDS NO STRUT.

     The whole tip installation is COLINEAR with its hinge. Measured on
     v01_003, the Tip Nacelle's offsets from its parent hinge are

         Y_Rel_Location  0.0000 m      Z_Rel_Location  0.0000 m
         X/Y/Z_Rel_Rotation  all zero  -> streamwise, aligned with the wing

     and the propeller is a further 0.4877 m FORWARD along that same axis.
     Nothing is offset laterally or vertically from anything, so there is no
     gap for a member to span. This file drew one anyway: it placed the pivot
     at an invented foot 0.97 b/2 inboard and the rotor at 1.0392 b/2, then
     ran a nacelle diagonally between them — 0.47 m across and 0.84 m down.
     That diagonal is the rod at the wingtip.

     THE 0.26 D "HEIGHT" WAS THE AXIAL STAND-OFF ALL ALONG, and the three
     numbers reconcile to the millimetre:

         prop 0.4877 m forward of the hinge, on the axis      /D = 0.2581
         hinge 0.0051 m above the wing plane                  /D = 0.0027
                                                       total  =  0.2608
         tipRotorZoverD, measured hub-to-wing separately      =  0.261

     The hub is 0.26 D from the hinge ALONG THE NACELLE AXIS. That axis
     points up in hover and forward in cruise, so the height is a rotated
     distance, not a translation — and a strut drawn to span it is spanning
     something that does not exist.

     The hinge station is a convention, not one modeller's habit:

         quantity                v01_003        SWFT
         hinge, % local chord    34.9 %         34.6 %
         hinge vs wing plane     +0.0051 m      +0.0058 m

     Two aircraft a factor of three apart in size, agreeing to 0.3 points of
     chord and 0.7 mm of height. */
  tipHingeChordFrac: 0.347,     // v01_003 0.349, SWFT 0.346
  tipHingeAboveWing: 0.0027,    // x D; +0.0051 m on v01_003, +0.0058 on SWFT

  /* ── THE PROPROTOR NACELLE, MEASURED ON SWFT'S OUTBOARD INSTALLATION ──
     RAVEN v01_003's tip pods are small relative to their chord. The aircraft
     that actually carries a TILTROTOR nacelle is SWFT, whose "Outboard Motor
     and Sponson Assembly" is a Fuselage geom parented to the outboard pivot.
     Read out of the release, relative to that hinge and normalised on the
     5.9436 m proprotor:

         nacelle length      3.6402 m   0.6125 D
         nose, forward       1.8260 m   0.3072 D
         tail, aft           1.8142 m   0.3053 D
         proprotor, forward  1.6812 m   0.2829 D
         Y offset            0.0000 m   Z offset  -0.0058 m

     Three things follow, and all three were wrong in this file:

     1. THE NACELLE STRADDLES ITS PIVOT, almost symmetrically — 0.307 D ahead
        and 0.305 D behind. The hinge is at mid-nacelle, not at one end.
     2. THE ROTOR HUB SITS AT THE NACELLE'S LEADING EDGE. The prop plane is
        0.2829 D forward and the nose is 0.3072 D forward, so the hub stands
        0.024 D behind the nose — the spinner, and nothing else.
     3. IT IS COLINEAR WITH THE HINGE in Y and Z, to within 6 mm on a 5.9 m
        rotor, exactly as the tip installation is.

     The prop stand-off is 0.2829 D, which is hubAboveOverD.outboard above,
     measured independently on a different geom of a different aircraft. Two
     routes to the same number. */
  proprotorNacelle: {
    lengthOverD:   0.6125,
    noseFwdOverD:  0.3072,
    tailAftOverD:  0.3053,
    propFwdOverD:  0.2829,
    src: "RAVEN SWFT, Outboard Motor and Sponson Assembly + L/R Outboard "
       + "Proprotor, both parented to Hinge - Outboard Proprotor and Sponson Pivot",
  },
  /* BOTH RELEASES AGREE, which is what makes this a convention rather than
     one modeller's habit:

       quantity            RAVEN v01_003        RAVEN SWFT
       hinge axis          [0, 1, 0]            [0, 1, 0]
       released at         90 deg               90 deg
       travel              0 .. 90              0 .. 110
       hinge vs wing z     +0.0005 / +0.0000 m  -0.0865 / +0.0058 m

     Two independent aircraft, a 4.50 m and a 15.66 m fuselage, both hinged
     laterally and both PUBLISHED IN HELICOPTER MODE. The travel differs
     because SWFT can tilt past hover and the small vehicle cannot. */
  src: "RAVEN_v01_003_Release.vsp3 and RAVEN SWFT VSP Public Release.vsp3, "
     + "Hinge geoms; convention from Wright & Silva, NASA Ames (corpus S3568): "
     + "90 deg = helicopter mode, 0 deg = airplane mode",
};

/* =====================================================================
   THE LANDING GEAR, READ OUT OF RAVEN SWFT
   =====================================================================
   A PREVIOUS COMMIT IN THIS FILE STATED THAT "RAVEN/SWFT publish no gear
   geom, so there is no station to measure". THAT WAS WRONG. The release
   carries five: Nose Gear, Nose Gear Caster, Nose Gear Spar, Main Gear
   and Main Gear Struts. The gear placement no longer needs to be derived
   from statics alone — it has the same kind of referent every other
   station in this file has.

   MEASURED, with x referred to the fuselage nose and normalised on its
   length (15.6566 m) and span (20.8971 m):

     nose wheel        0.0824 fL
     main wheel        0.4114 fL,  track/span 0.1903
     wheelbase         0.3290 fL
     tyre diameter     0.9144 m (3.0 ft),  hub/tyre 0.2500, width/tyre 0.3333
     nose spar         1.6764 m long, raked 40.25 deg, 0.221 m diameter
     main struts       a faired WING geom, not a tube

   Both wheels sit at the same z (-2.8499 m), so the model stands on one
   ground plane — the property the gear gate already asserts.

   WHAT IS TAKEN FROM HERE AND WHAT IS NOT. The ARRANGEMENT and the
   STATION FRACTIONS are RAVEN's. Every SIZE — tyre diameter and width,
   strut stroke, track — stays the tool's own CS-27 result, so the gear
   still changes when the user changes the aircraft. Copying RAVEN's
   absolute dimensions would draw NASA's wheels on the user's aeroplane.
   ===================================================================== */
/* =====================================================================
   THE ROTOR INSTALLATION, FROM RAVEN'S GEOM TREE
   =====================================================================
   RAVEN v01_003's browser tree states the mechanism outright:

     Wing
       Tip Prop 1 Hinge Left  -> Tip Nacelle Left  -> Prop1 (Hub, Spacer, Motor 1)
       Tip Prop 4 Hinge Right -> Tip Nacelle Right -> Prop4 (Hub, Spacer, Motor 4)
       Sponson Left
         Prop 2 Hinge L -> Tilt Nacelle L -> Prop2 (Hub, Spacer, Motor 2)
         Prop5                              (Hub, Spacer, Motor 5)
       Sponson Right
         Prop 3 Hinge R -> Tilt Nacelle R -> Prop3 (Hub, Spacer, Motor 3)
         Prop6                              (Hub, Spacer, Motor 6)

   TWO THINGS FOLLOW, AND THIS FILE HAD BOTH WRONG.

   1. A HINGE EXISTS ONLY WHERE A ROTOR TILTS. Prop5 and Prop6 — the AFT
      sponson pair — hang straight off the sponson with no hinge and NO
      NACELLE. This file gave every rotor a nacelle regardless.

   2. EVERY ROTOR, TILTING OR NOT, STANDS ON A HUB / SPACER / MOTOR STACK.
      That is the part the eye reads as a motor housing, and it was drawn
      as a single smooth pod. Measured off RAVEN, as fractions of rotor
      diameter (D = 1.8898 m):

        Hub     0.2591 m   0.137 D    topmost, largest
        Spacer  0.1524 m   0.081 D    waisted, between hub and motor
        Motor   0.2286 m   0.121 D    the can underneath

      and the heights above the structure carrying them, again in D:

        fixed prop    motor +0.145, spacer +0.152, hub +0.211
        tilting prop  nacelle +0.105, motor +0.146, spacer +0.153, hub +0.277

      A tilting hub sits HIGHER than a fixed one by about 0.066 D, which is
      the tilt nacelle it stands on. That is why RAVEN's forward and aft
      sponson rotors are not level, and it is a real feature, not an error
      to be smoothed away.
   ===================================================================== */
export const RAVEN_ROTOR_STACK = {
  hubDiaOverD:    0.137,
  spacerDiaOverD: 0.081,
  motorDiaOverD:  0.121,
  fixed:   { motor: 0.145, spacer: 0.152, hub: 0.211 },
  tilting: { nacelle: 0.105, motor: 0.146, spacer: 0.153, hub: 0.277 },
  src: "RAVEN_v01_003_Release.vsp3 — Hub / Spacer / Motor and Tilt Nacelle "
     + "geoms, and the Geom Browser tree showing hinges only on Props 1-4",
};

export const RAVEN_GEAR = {
  /* THE MAIN GEAR STATION IS A CONVENTION; THE NOSE STATION IS NOT.
     Measured on both releases, the way NASA_LAYOUT treats every other
     longitudinal station — mean used, spread recorded rather than hidden:

       station        RAVEN v01_003   SWFT      spread
       main gear      0.4009 fL       0.4114    2.6%
       nose gear      0.0403 fL       0.0824    2.0x

     The mains agree to 2.6% across a 3.5x difference in fuselage length,
     which is the same kind of evidence the sponson stations rest on. The
     nose gear does NOT agree and no mean is claimed for it: SWFT's sits
     twice as far aft. The mean is used for the mains and SWFT's value for
     the nose, with the disagreement stated here rather than averaged into
     a number that describes neither aircraft. */
  noseXoverFL:     0.0824,   // SWFT; v01_003 puts it at 0.0403 — see above
  noseXspread:     [0.0403, 0.0824],
  mainXoverFL:     0.4062,   // mean of 0.4009 (v01_003) and 0.4114 (SWFT)
  mainXspread:     [0.4009, 0.4114],
  wheelbaseOverFL: 0.3290,
  trackOverSpan:   0.1903,
  hubOverTyre:     0.2500,
  widthOverTyre:   0.3333,
  noseSparRakeDeg: 40.25,
  noseSparDiaOverTyre: 0.221 / 0.9144,
  /* FAIRING CHORD, MEASURED RATHER THAN CHOSEN. The legs were first drawn
     with a fairing chord of 2.2 tyre radii, which was invented, and in
     profile they came out as slabs — the leg read as a barrel rather than a
     strut. RAVEN's Main Gear Struts is a Wing geom of 3.7161 m2 over a
     5.1816 m total span, i.e. 1.858 m2 per side over 2.59 m, a mean chord of
     0.717 m against its 0.4572 m tyre radius. */
  strutChordOverTyreRadius: 0.717 / 0.4572,
  src: "RAVEN SWFT VSP Public Release.vsp3, Nose Gear / Nose Gear Caster / "
     + "Nose Gear Spar / Main Gear / Main Gear Struts geoms",
};

/* =====================================================================
   RAVEN SWFT'S TAIL, AND THE V-TAIL EQUIVALENT TO IT
   =====================================================================
   SWFT does NOT have a V-tail. It carries a Vertical Stabilizer and a
   Horizontal Stabilator on its own pivot hinge:

       surface                 area        AR      x
       Vertical Stabilizer     9.4244 m2   1.103   11.9908 m
       Horizontal Stabilator  11.7070 m2   2.361   14.0495 m
       (wing area 58.1211 m2)

   so Sv/Sw = 0.1622 and Sh/Sw = 0.2014.

   The V-TAIL THAT DOES THE SAME JOB carries both areas on two panels at a
   dihedral that splits the authority in the same ratio. Equating the
   projected areas, tan(gamma) = sqrt(Sv/Sh), giving

       gamma = atan(sqrt(9.4244 / 11.7070)) = 41.9 deg
       S_total = 9.4244 + 11.7070 = 21.13 m2 = 0.3636 Sw

   That is where a RAVEN-equivalent V-tail sits, and it is close to the
   38 deg this tool's own tail solver picks — two independent routes to
   the same answer, which is worth more than either alone. */
export const RAVEN_TAIL = {
  SvOverSw: 9.4244 / 58.1211,
  ShOverSw: 11.7070 / 58.1211,
  vtailEquivGammaDeg: 41.9,
  vtailEquivAreaOverSw: (9.4244 + 11.7070) / 58.1211,
  src: "RAVEN SWFT VSP Public Release.vsp3, Vertical Stabilizer and "
     + "Horizontal Stabilator geoms",
};

/* =====================================================================
   RAVEN'S ACTUAL TAIL — A FIN AND AN ALL-MOVING STABILATOR
   =====================================================================
   NEITHER RAVEN HAS A V-TAIL. The v01_003 Geom Browser tree lists

       Vertical Tail -> Dorsal Fin
       Ventral Fin
       Stab-Hinge -> Stabilator -> Strakes

   and SWFT the same primary pair under different names. Measured on both,
   the agreement on the two surfaces that matter is strong:

     surface           SWFT                    v01_003
     vertical fin      16.22% Sw, AR 1.103     17.14% Sw, AR 1.104
                       x 0.7793 fL             x 0.7362 fL
     stabilator        20.14% Sw, AR 2.361     22.27% Sw, AR 2.635
                       x 0.9108 fL             x 0.9075 fL

   THE FIN ASPECT RATIO AGREES TO 0.1% and the stabilator STATION to 0.4%,
   across a 3.5x difference in fuselage length. Those are conventions, and
   they are what this table carries.

   The areas are NOT taken from here. Sh_req and Sv_req already come out of
   the tail-volume solution in engine.js, sized on THIS aircraft's static
   margin and yaw authority; taking RAVEN's percentages instead would draw
   NASA's tail on the user's aeroplane. What RAVEN supplies is the shape
   the area is spent on — aspect ratio, station, and the ventral share.

   The ventral fin and dorsal fin appear on v01_003 only, so no two-vehicle
   agreement exists for them and none is claimed. The ventral is carried at
   its single measured value and the dorsal is not modelled at all: at
   AR 0.354 it is a fillet, and a fillet is not a surface this tool sizes. */
export const RAVEN_TAIL_CONVENTIONAL = {
  finAR:          1.103,   // SWFT 1.103, v01_003 1.104 — agree to 0.1%
  finARspread:    [1.103, 1.104],
  stabAR:         2.50,    // mean of SWFT 2.361 and v01_003 2.635
  stabARspread:   [2.361, 2.635],
  finXoverFL:     0.758,   // mean of 0.7793 and 0.7362
  stabXoverFL:    0.909,   // SWFT 0.9108, v01_003 0.9075 — agree to 0.4%
  stabXspread:    [0.9075, 0.9108],
  /* ventral fin, v01_003 only: 0.2533 m2 against a 0.8392 m2 fin */
  ventralOverFin: 0.2533 / 0.8392,
  ventralAR:      4.282,
  taper:          0.40,    // unchanged from the V-tail path (Raymer)
  src: "RAVEN_v01_003_Release.vsp3 (Vertical Tail, Ventral Fin, Stabilator) "
     + "and RAVEN SWFT (Vertical Stabilizer, Horizontal Stabilator)",
};

/** A lofted body: circular-ish stations swept along x. Used for fuselage,
    sponsons and nacelles, which is how NASA build all three. */
const loft = (kind, x0, x1, stations, y = 0, z = 0, extra = {}) =>
  ({ kind, x0, x1, y, z, stations, ...extra });

/* =====================================================================
   THE FUSELAGE IS RAVEN'S SHAPE AT THIS AIRCRAFT'S SIZE
   =====================================================================
   The station table that used to live here was hand-written, near-circular
   (w and h within 8% of each other at every station) and produced a
   torpedo. RAVEN's fuselage is nothing like it: a ROUNDEDRECT section, and
   TALL, with height over width running 0.75 at the nose to 1.69 at the
   cabin and the corners squaring off aft. That is a cabin with people
   sitting upright in it, and it is why NASA's model reads as an aircraft.

   The profile now comes from src/data/raven-profiles.js, generated
   straight out of the .vsp3 by tools/extract-raven-profiles.py, so it is
   measured rather than described.

   HOW IT IS SCALED, AND WHY NOT THE OBVIOUS WAY. The obvious scaling is to
   set the drawn maximum width to fusDiam. That would make the body 2.15x
   the frontal area the ENGINE assumed, because the engine's drag and
   volume terms both treat the fuselage as a body of diameter fusDiam:
   fineness lf = fL/fD at engine.js:519, and volume as (pi/4) fD^2 fL at
   engine.js:1343. The picture would then disagree with the numbers, which
   is the defect this file exists to avoid.

   So the profile is scaled to hold the MAXIMUM CROSS-SECTION AREA equal to
   (pi/4) fD^2 — the equivalent circular diameter of the drawn body is
   exactly fusDiam. Shape from RAVEN, size from the sizing loop, and the
   quantity the engine was paid for is preserved.
   ===================================================================== */
/* ── A POD IS AN ELLIPSOID, AND THE ENGINE ALREADY SAYS SO ──────────
   constants.js models any fuselage below fineness 2.5 as a spheroid, because
   Raymer Eq 12.31 collapses there. A two-seat pod is fineness 1.47, so the
   body this engine WEIGHS and DRAGS is an ellipsoid — and this file exists to
   make the picture the aircraft that was sized.

   Semi-axes are the three measured dimensions of the supplied reference
   cabin, so the drawn bounding box reproduces it exactly. Nothing here is
   read off a render: a perspective image cannot give station widths to any
   known accuracy, and guessing them is what this project does not do.

   w(t) = W * sqrt(1 - (2t-1)^2), and h likewise, so the section aspect h/w is
   H/W at every station — as much taller than wide as the reference is. */
function podFuselageStations(fL, fW, fH) {
  /* EVEN, so t = 0.5 is sampled exactly. At 11 intervals the widest point of
     the ellipsoid falls between stations and the drawn body came out 1.494 m
     across a 1.500 m reference -- 0.4% narrow, and the maximum cross-section
     area the engine was paid for likewise 0.8% light. An even count puts a
     station on the equator and the drawn bounding box reproduces the measured
     one exactly. */
  const N = 12;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 2 * t - 1;
    const f = Math.sqrt(Math.max(0, 1 - u * u));
    /* the poles are true points; give them a sliver so the loft closes
       cleanly rather than degenerating, as the RAVEN nose cap does */
    const g = Math.max(0.05, f);
    out.push({ t, w: fW * g, h: fH * g, dz: 0, r: 0 });
  }
  return out;
}

function fuselageStations(fL, fD, fH) {
  /* A DECLARED SECTION MEANS A POD. Only the multicopter carries one — see
     CONFIG_DEFAULTS.multicopter.fusHeightRatio — so only the multicopter
     stops being drawn as a lift+cruise body with a tail cone on it. */
  if (Number(fH) > 0 && Math.abs(Number(fH) - Number(fD)) > 1e-9)
    return podFuselageStations(fL, Number(fD), Number(fH));

  const P = RAVEN_PROFILES?.swft_fuselage;
  if (!P?.stations?.length) return legacyFuselageStations(fL, fD);

  /* Cross-section area of a rounded rectangle, in units of (max width)^2.
     A = w*h - (4 - pi) r^2, exactly; r is a fraction of w here. */
  const areaOf = (st) => {
    const rr = (st.r || 0) * st.w;
    return Math.max(0, st.w * st.h - (4 - Math.PI) * rr * rr);
  };
  const aMax = Math.max(...P.stations.map(areaOf)) || 1;
  /* width scale k such that k^2 * aMax === (pi/4) fD^2 */
  const k = Math.sqrt((Math.PI / 4) * fD * fD / aMax);

  const out = P.stations.map((st) => ({
    t: st.t,
    w: st.w * k,
    h: st.h * k,
    /* dz is stored as a fraction of LENGTH by OpenVSP, not of diameter */
    dz: st.dz * fL,
    r: st.rounded ? Math.max(0.02, st.r || 0.02) : 0,
  }));

  /* CLOSE THE NOSE. RAVEN's first XSec is a POINT CAP — it carries no width
     or height parm at all, only the cap controls — so the extractor cannot
     emit it and the profile begins at t = 0.007 with a finite section. Lofted
     as-is that leaves the body chopped off square at the front, which is what
     the first render of this profile showed. The cap is restored here as a
     near-point at t = 0, taking the first real section's vertical offset so
     the nose sits on the body's own centreline rather than jumping. */
  if (out.length && out[0].t > 1e-6) {
    out.unshift({ t: 0, w: out[0].w * 0.06, h: out[0].h * 0.06,
                  dz: out[0].dz, r: 0 });
  }
  return out;
}

/** The hand-written near-circular table, kept only as a fallback if the
    generated profile is ever missing. It is not what the tool draws. */
function legacyFuselageStations(fL, fD) {
  const r = fD / 2;
  return [
    { t: 0.00, w: 0.02 * fD, h: 0.02 * fD, dz: 0.10 * r },
    { t: 0.06, w: 0.55 * fD, h: 0.50 * fD, dz: 0.02 * r },
    { t: 0.16, w: 0.92 * fD, h: 0.88 * fD, dz: -0.02 * r },
    { t: 0.30, w: 1.00 * fD, h: 1.00 * fD, dz: 0 },
    { t: 0.52, w: 1.00 * fD, h: 1.00 * fD, dz: 0 },
    { t: 0.68, w: 0.80 * fD, h: 0.82 * fD, dz: 0.06 * r },
    { t: 0.84, w: 0.48 * fD, h: 0.52 * fD, dz: 0.16 * r },
    { t: 1.00, w: 0.14 * fD, h: 0.18 * fD, dz: 0.26 * r },
  ];
}

/* ── THE SPONSON IS A TUBE THAT SWEEPS UP AT THE BACK ─────────────────
   Measured off SWFT's Inboard Sponson: the section is a CONSTANT circle for
   its whole length — w and h are 1.000 at every station, so a cylinder was
   right about the cross-section — but the body is not straight. It runs
   level for 71% of its length and then lifts its tail through 0.053 of the
   length (0.381 m on a 7.19 m sponson).

   This tool drew a straight cylinder, so every boom ended in a blunt tube
   where RAVEN's curves up behind the aft rotor. The upsweep is the whole
   difference, and it is the reason RAVEN's booms read as faired structure
   rather than as scaffolding poles. */
function sponsonStations(radius) {
  const P = RAVEN_PROFILES?.swft_sponson;
  const d = 2 * radius;
  if (!P?.stations?.length)
    return [{ t: 0, w: d, h: d, dz: 0 }, { t: 1, w: d, h: d, dz: 0 }];
  const out = P.stations.map((st) => ({
    t: st.t, w: st.w * d, h: st.h * d, dz: st.dz, r: 0,
  }));
  /* Close both ends so the tube reads as a body rather than an open pipe. */
  out.unshift({ t: 0, w: d * 0.35, h: d * 0.35, dz: out[0].dz, r: 0 });
  out.push({ t: 1, w: d * 0.42, h: d * 0.42, dz: out[out.length - 1].dz, r: 0 });
  return out;
}

/** Nacelle proportions follow NASA's: a slim pod roughly a third of the rotor
    diameter long, sized from the rotor it carries rather than from a constant. */
function nacelleStations(D) {
  /* RAVEN's own motor/sponson pod, from the generated profile, rather than a
     four-station guess. Normalised on its own maximum width and rescaled to
     this rotor, so the pod keeps NASA's proportions at our size. */
  const P = RAVEN_PROFILES?.swft_nacelle;
  const w = 0.155 * D;
  if (!P?.stations?.length) {
    return [
      { t: 0.00, w: 0.30 * w, h: 0.30 * w, dz: 0 },
      { t: 0.18, w: 0.92 * w, h: 0.92 * w, dz: 0 },
      { t: 0.62, w: 1.00 * w, h: 1.00 * w, dz: 0 },
      { t: 1.00, w: 0.42 * w, h: 0.46 * w, dz: 0 },
    ];
  }
  const out = P.stations.map((st) => ({
    t: st.t, w: st.w * w, h: st.h * w, dz: st.dz * w,
    r: st.rounded ? Math.max(0.02, st.r || 0.02) : 0,
  }));
  if (out.length && out[0].t > 1e-6)
    out.unshift({ t: 0, w: out[0].w * 0.15, h: out[0].h * 0.15, dz: out[0].dz, r: 0 });
  if (out.length && out[out.length - 1].t < 1 - 1e-6)
    out.push({ t: 1, w: out[out.length - 1].w * 0.55,
               h: out[out.length - 1].h * 0.6, dz: out[out.length - 1].dz, r: 0 });
  return out;
}

/**
 * Build the aircraft from the USER'S parameters on NASA's layout.
 * @param p  engine inputs (fusLen, fusDiam, propDiam, nPropHover, tc, vtGamma…)
 * @param SR converged sizing result (bWing, chords, boom radius…)
 */
export function aircraftGeometry(p = {}, SR = null) {
  if (!SR || !p.fusLen) return { bodies: [], extents: null, config: null, note: "no sizing result" };

  const cfg     = resolveConfiguration(p, p.nPropHover);
  const hasWing = !!(cfg.capabilities?.hasWing);
  /* THE LENGTH THE AIRCRAFT WAS SIZED WITH, NOT THE ONE THAT WAS TYPED IN.
     The engine derives fuselage length — from payload^(1/3), and now also
     from the room the rotor array needs — and reports it as SR.fusLen. This
     read p.fusLen, the raw input, so once the body started growing the
     GEOMETRY was built on a shorter aeroplane than the one that had been
     weighed: the rotors were packed into a fuselage 3.5 m too short and
     overlapped each other. The picture must be the aircraft that was sized. */
  const fL      = Number(SR?.fusLen) || Number(p.fusLen) || 7.2;
  const fD      = Number(p.fusDiam) || 1.65;
  /* THE SECTION, IF THIS LAYOUT HAS ONE. Absent on every configuration but
     the multicopter, where it makes the body the capsule it actually is. */
  const fH      = Number(p.fusHeight) || 0;
  /* Every fuselage query goes through here so no call site can silently
     forget the section and loft a tube next to a pod. */
  const fusStations = () => fuselageStations(fL, fD, fH);
  const D       = Math.max(0.2, Number(p.propDiam) || 3);
  const Rrot    = D / 2;
  const N       = Math.max(1, p.nPropHover || 4);
  const L       = NASA_LAYOUT;
  const bodies  = [];
  let overlapped = false;          // a rotor row cannot fit its span
  let boomCountMismatch = null;    // drawn booms vs the sized boomCount
  let boomStretched = false;       // engine stations too close to clear
  let tailArmShort = null;         // tail arm the loop wanted vs what the body allows
  let vtRef = null;                // the V-tail, for tail-mounted rotors
  let addWingControls = null;      // deferred: needs the booms to exist
  let addVentralFin = null;        // deferred: needs the ground plane to exist
  let splitRounded = null;         // odd tilt/lift counts rounded to mirrored pairs

  /**
   * Place a rotor AND the structure that carries it.
   *
   * NOTHING MAY FLOAT. An earlier version gave every rotor a short pod centred
   * on the hub, so a row of twelve produced twelve isolated objects hanging in
   * space with no path back to the airframe. A nacelle is not decoration — it
   * is the pylon carrying motor loads into the wing or boom — so it SPANS from
   * the hub to its attachment, and the attachment is passed in by the caller
   * that knows the structure.
   *
   * @param attachX  x the pylon must reach (wing LE, wing TE, boom station…)
   * @param attachY  y it must reach — differs from the rotor only for a rotor
   *                 OUTBOARD of the wingtip, which reaches back inboard
   */
  /* Height of a hub above the structure carrying it: the nacelle rests on the
     boom, the hub sits on the nacelle. Reproduces RAVEN's measured 0.343 m. */
  /* ── HOW FAR A HUB STANDS OFF THE MEMBER CARRYING IT ─────────────────
     This was a part-stack estimate — 0.0775 D of blade clearance, plus the
     structure radius, plus 0.02 D of margin — written before the stack itself
     had been measured. RAVEN publishes the answer directly: its fixed props
     put the hub 0.211 D above the sponson origin and its tilting props
     0.277 D (RAVEN_ROTOR_STACK). Measured, this file was placing hubs at
     0.135 D — three quarters of the stand-off NASA uses — so every rotor sat
     low on its boom and the motor foot sank into the member.

     The estimate is kept as a FLOOR so a hub can never end up inside the
     structure on an unusual boom radius, but the height itself is RAVEN's. */
  const hubAbove = (structRadius, tilting = false) => Math.max(
    0.0775 * D + structRadius + 0.02 * D,
    (tilting ? RAVEN_ROTOR_STACK.tilting.hub : RAVEN_ROTOR_STACK.fixed.hub) * D);

  /* `hingeStation` picks which of RAVEN's two measured hinge offsets applies.
     They are not interchangeable: the inboard hub stands 0.0526 D forward of
     its pivot and the outboard one 0.0010 D — on a 6 m rotor, 0.32 m against
     6 mm. Defaulting every rotor to the inboard pair put the tip hinge a
     third of a metre behind where RAVEN has it. */
  /* ── TWO TILTING MECHANISMS, AND THE S4 USES BOTH ────────────────────
     RAVEN tilts the WHOLE nacelle, engine and all, which is the XV-15 / V-22
     arrangement. The Joby S4 does not do that everywhere. evtol.news (Vertical
     Flight Society): "Four propellers tilt vertically including its entire
     motor nacelle" and "two of the propellers tilt vertically with a linkage
     mechanism" — the V-tail and wing-TIP nacelles rotate, while the INBOARD
     wing nacelles stay fixed and each propeller rotates on an articulated
     linkage at the front.

     So `nacelleTilts` selects between them:
       true  — the nacelle is a tilting body, hinged at mid-length (RAVEN)
       false — the nacelle is STATIC and streamwise; only the rotor head turns,
               about a hinge at the nacelle's NOSE, and the motor stays inside
               the fixed body rather than swinging with the disc.

     This matters beyond appearance: a fixed nacelle keeps its motor mass off
     the tilt actuator and out of the swept arc, which is the reason the S4
     carries the linkage inboard where the nacelle is deepest. */
  const addRotor = (x, y, z, tilting, stopped, label, attachX = null, attachY = null,
                    attachZ = null, attachR = 0, hingeStation = "inboard",
                    nacelleTilts = true) => {
    const ax = attachX == null ? x : attachX;
    const ay = attachY == null ? y : attachY;
    const minPod = 0.34 * D;
    /* THE PYLON REACHES IN ALL THREE AXES. RAVEN's tilt hinge sits on the wing
       plane while the disc is 0.26 D above it, and its boom rotors stand above
       the sponson on a hub/spacer/motor stack. A strut drawn flat at rotor
       height reaches neither — which is why every tip rotor, and then every
       forward boom nacelle, came out floating 0.14 m clear of its own boom. */
    const az = attachZ == null ? z : attachZ;

    /* THE PIVOT SITS ON THE STRUCTURE, WHICH FOR A SIDEWAYS-REACHING ROTOR IS
       THE ATTACH POINT, NOT THE ROTOR'S OWN LATERAL STATION. RAVEN's Tip Prop
       Hinge is a child of the WING; the nacelle hangs off it and the prop off
       that. Putting the pivot at the rotor's y left it outboard of the wingtip,
       hinged to nothing. */
    const reachesSideways = Math.abs(ay - y) > 1e-6 || Math.abs(ax - x) > 1e-6;
    const hinge = tilting
      ? (reachesSideways ? { x: ax, y: ay, z: az }
                         : { x: x + RAVEN_HINGE.hubFwdOverD[hingeStation] * D, y, z: az })
      : null;

    /* A MEMBER ONLY WHERE THE ROTOR REACHES SIDEWAYS OR FORE-AFT. Where the
       stand-off is purely VERTICAL — a rotor sitting straight above its boom —
       the hub/spacer/motor stack already spans that gap, and drawing a pylon
       too put a third concentric cylinder at every rotor alongside the two
       hubs. A tip rotor reaching inboard to the wing, or a tail rotor reaching
       across to the stabilator, still needs a real member and still gets one. */
    if (reachesSideways)
      /* THE ENDPOINTS WERE CROSS-WIRED. boomFaces draws from (x0,y0,z0) to
         (x1,y,z), and this set z0 to the ATTACH height while leaving z at the
         ROTOR height — so the member ran from (rotor x, rotor y, attach z) to
         (attach x, attach y, rotor z). Each end was half one point and half
         the other, and the rod therefore touched neither the rotor above it
         nor the wing it was supposed to land on: a strut floating between two
         places it did not connect.

         It survived the connectivity gate because that test uses an
         axis-aligned bounding box, and the box round a cross-wired diagonal is
         the same box as the box round the correct one — it grazes both bodies
         either way. A member has to be checked by its ENDS, not by its extent. */
      /* ── THE MEMBER IS THE NACELLE, NOT A ROD BESIDE IT ──────────────
         RAVEN's tree for a tip prop is Hinge -> Tip Nacelle -> Prop: ONE body
         spans from the hinge on the wing to the propeller, and the tree has no
         separate strut in it. This file drew both — a rod from the hub to the
         wing, AND a pod hanging under the hub at the rotor's own lateral
         station, which is outboard of the wingtip and therefore touching
         nothing at either end.

         The member is now the nacelle: same body, nacelle section, nacelle
         colour, running hinge-to-hub and pivoting about the hinge with its
         rotor. One body doing the job RAVEN gives to one body. */
      bodies.push({ kind: "boom", label: `${label} nacelle`,
        nacelleMember: true, tilting,
        ...(hinge ? { hinge } : {}),
        x0: x, y0: y, z0: z,          // the rotor
        x1: ax, y: ay, z: az,         // the hinge, on the structure
        radius: Math.max(0.5 * 0.155 * D, 0.06) });
    /* ── THE INSTALLATION, AS RAVEN BUILDS IT ────────────────────────
       A TILTING rotor gets a nacelle; a FIXED one does not. RAVEN's Prop5
       and Prop6 hang off the sponson as bare Hub/Spacer/Motor stacks with
       no nacelle and no hinge above them, and this file used to give every
       rotor a streamwise pod — which is why the aft lift rotors looked like
       tilting ones that had forgotten to tilt. */
    /* THE TILT PIVOT. Defined before the installation is built, because the
       nacelle, the stack and the rotor all convert about it together. */
    const S = RAVEN_ROTOR_STACK;
    if (tilting && !reachesSideways) {
      /* ── THE NACELLE SITS BELOW THE STACK, NOT ON TOP OF IT ───────────
         RAVEN stacks the parts along the rotor axis, and the order is not
         negotiable — measured on v01_003 as heights above the sponson:

             Tilt Nacelle  +0.105 D      <- lowest
             Motor         +0.146 D
             Spacer        +0.153 D
             Hub           +0.277 D      <- at the disc

         This file centred the nacelle ON the hub, so the pod and the
         hub/spacer/motor stack occupied the same space and the aircraft was
         drawn with two hubs at every tilting rotor, one inside the other.

         The nacelle is authored so that AFTER its (a - 90) rotation it lands
         0.172 D below the hub along the axis — the gap RAVEN leaves between
         its hub and its nacelle. Rotating a point by -90 about the hinge maps
         (dx,dz) to (dz,-dx), so the authored position is that mapping
         inverted, which is what the two lines below compute. */
      /* ── AUTHORED AS SWFT BUILDS IT: STRADDLING THE PIVOT ─────────────
         The nacelle is authored in AIRPLANE attitude (it turns by a-90, so at
         airplane the rotation is zero), which is the frame SWFT's own numbers
         are in. So they can be used directly: nose 0.3072 D ahead of the
         hinge, tail 0.3053 D behind it, on the hinge's own y and z.

         WHAT THIS REPLACES. The old form placed a SHORT pod of 0.2856 D total
         length at an offset derived from the hub, so the pivot fell outside
         the body it was supposed to pivot. A nacelle whose hinge is not inside
         it is not a nacelle; it is a pod on a stick, and on the tiltrotor it
         was drawn as literally that — a rod from the rotor back to a hinge
         2.13 m aft and 0.36 m below. See RAVEN_HINGE.proprotorNacelle. */
      const PN = RAVEN_HINGE.proprotorNacelle;
      /* THE NACELLE REACHES ITS OWN ROTOR. SWFT's nose sits 0.0243 D ahead of
         its prop plane — the spinner, and nothing more — so the nose is placed
         that far ahead of THIS rotor's stand-off rather than at SWFT's fixed
         0.3072 D. Where the stand-off is SWFT's, the nacelle is SWFT's; where
         a rotor has to sit further forward to clear a wing, the nacelle grows
         with it and the hub stays at its leading edge. The aft extent is
         RAVEN's throughout: it is behind the pivot and does not depend on
         where the disc is. */
      const standoff = Math.hypot(x - hinge.x, z - hinge.z);
      const noseAhead = PN.noseFwdOverD - PN.propFwdOverD;      // 0.0243 D
      if (nacelleTilts) {
        bodies.push(loft("nacelle",
          hinge.x - (standoff + noseAhead * D), // nose, just ahead of the disc
          hinge.x + PN.tailAftOverD * D,        // tail, aft of the pivot
          nacelleStations(D), y, hinge.z,
          { label: `${label} nacelle`, tilting }));
      } else {
        /* LINKAGE CASE. The body does not carry `tilting`, so mesh.js leaves it
           alone in every attitude: it stays streamwise while the rotor head
           swings. Its NOSE is the pivot, so the nacelle runs aft from there and
           keeps RAVEN's proportions behind the hinge. */
        bodies.push(loft("nacelle",
          hinge.x - noseAhead * D,              // nose, at the pivot
          hinge.x + (PN.lengthOverD - PN.noseFwdOverD + PN.propFwdOverD) * D,
          nacelleStations(D), y, hinge.z,
          { label: `${label} nacelle` }));
      }
    }
    /* Every rotor, tilting or not, stands on hub / spacer / motor. Drawn as
       three short coaxial cylinders under the disc at RAVEN's measured
       diameters, so the thing the eye reads as a motor housing has the
       proportions NASA gave it instead of being one smooth pod. */
    {
      const off = tilting ? S.tilting : S.fixed;
      const zHub = z;
      const zSpacer = zHub - (off.hub - off.spacer) * D;
      const zMotor = zSpacer - (off.spacer - off.motor) * D;
      /* THE STACK TURNS WITH ITS ROTOR. The hub, spacer and motor were drawn
         without the pivot the rotor carries, so when a proprotor converted the
         disc swung forward through its arc and the motor housing stayed
         standing straight up where it had been — the hub detached from the
         blades and the motor appeared to point the wrong way relative to them.
         RAVEN's tree makes the relationship explicit: Hub, Spacer and Motor
         are CHILDREN of the Prop, which is a child of the Tilt Nacelle, which
         is a child of the Hinge. They convert as one body, and now they do. */
      /* ON A LINKAGE INSTALLATION THE MOTOR IS INSIDE THE FIXED NACELLE and
         is not drawn as an external part at all — the nacelle body already
         occupies that volume. What replaces it is the thing that actually
         exists there: the ARTICULATED LINKAGE running from the nacelle's nose
         up to the rotor head, which swings with the head.

         Drawing the motor as a static cylinder above a static nacelle was the
         first attempt, and the connectivity gate was right to reject it: with
         the head swung forward the motor sat alone in the air, attached to
         nothing, because on this mechanism there is nothing for it to be. */
      const linkageCase = tilting && !nacelleTilts;
      const seg = (label2, zTop, zBot, dia) => {
        if (linkageCase && label2 === "motor") return;   // enclosed in the nacelle
        bodies.push({
          kind: "boom", label: `${label} ${label2}`, motorPart: true, tilting,
          ...(hinge ? { hinge } : {}),
          x0: x, x1: x, y0: y, y, z0: zBot, z: zTop,
          radius: Math.max(0.012, (dia * D) / 2) });
      };
      /* THE MOTOR ENDS ON THE STRUCTURE, NOT 0.10 D BELOW THE SPACER. A fixed
         length left the fixed-rotor stacks hanging 0.145 m INSIDE the boom
         they stand on — the motor buried in the sponson rather than bolted to
         it. Running the motor down to the attachment makes the stack the load
         path it represents, and keeps the hub and spacer at RAVEN's measured
         heights above it. */
      /* ON the member, not into it. `az` is the carrying body's CENTRELINE,
         so a foot taken there buried the motor by the member's own radius —
         measured at 0.080 m on the hybrid's booms. `attachR` is that radius
         where the caller knows it. */
      /* WHERE THE STACK ENDS DEPENDS ON WHAT CARRIES THE ROTOR.

         On a rotor sitting straight above its own boom, the stack IS the load
         path, so the motor runs down to the member's skin.

         On a rotor that reaches SIDEWAYS the NACELLE is the load path, and
         extending the motor to the attachment as well gave the tip
         installation TWO members spanning the same gap — the nacelle running
         diagonally to the wing and the motor running vertically to it, side by
         side. That is the extra rod at the wingtip.

         RAVEN's tilting parts occupy a short band up at the prop, not a member
         reaching the wing. Measured on v01_003 as heights above the pivot:

             Tilt Nacelle  +0.105 D   <- the load path, reaching the structure
             Motor         +0.146 D
             Spacer        +0.153 D
             Hub           +0.277 D

         THE DISCRIMINATOR IS THE NACELLE, NOT THE DIRECTION OF REACH. This
         test was `reachesSideways`, which worked only while the tip rotor was
         (wrongly) hung out beside the wing on a diagonal. With the tip
         installation made colinear the test stopped firing there, and the
         motor grew back down to the wing plane — a bare cylinder occupying the
         same space as the nacelle mast standing in it. Two concentric bodies
         again, the same defect one level along.

         A nacelle is built for exactly the TILTING rotors, which is also what
         RAVEN's tree says: its Prop5 and Prop6 hang off the sponson as bare
         Hub/Spacer/Motor stacks with no nacelle, and its tilting props all
         have one. So the stack is the load path exactly when there is no
         nacelle, and that is the condition to test. */
      const zFoot = tilting
        ? zMotor - 0.06 * D                              // the nacelle carries it
        : Math.min(zMotor - 0.06 * D, az + (attachR || 0));
      seg("hub",    zHub,            zSpacer,                   S.hubDiaOverD);
      seg("spacer", zSpacer,         zMotor,                    S.spacerDiaOverD);
      seg("motor",  zMotor,          zFoot,                     S.motorDiaOverD);
      if (linkageCase) {
        /* The linkage arm: nacelle nose to rotor head, swinging with the head.
           Slimmer than the motor it replaces, because it carries a pitch link
           and not a machine. */
        seg("linkage", zSpacer, hinge.z, S.spacerDiaOverD * 0.8);
      }
    }
    bodies.push({ kind: "rotor", label, x, y, z, radius: Rrot, tilting, stopped,
      /* the hub/spacer/motor stack below provides this rotor's hub, so the
         mesh must not draw a second one on the disc axis */
      hasStack: true,
      ...(hinge ? { hinge } : {}),
      blades: Math.max(2, Math.round(p.nBlades ?? 3)),
      solidity: Number(p.solidity) || 0.10 });
  };

  /* `len`/`diam` are carried alongside the station list so the older
     orthographic four-up view keeps working unchanged — it lofts its own body
     of revolution from those two numbers. */
  bodies.push(loft("fuselage", 0, fL, fusStations(), 0, 0,
    { label: "Fuselage", len: fL, diam: fD }));

  const bW    = Number(SR.bWing) || 0;
  const halfB = bW / 2;

  /* WING — position and shape entirely from the sizing loop. */
  const xWingLE = (Number(SR.wingLEfrac) || 0.2589) * fL;
  const Cr      = Number(SR.Cr_) || 1.9, Ct = Number(SR.Ct_) || 0.9;
  /* THE WING SITS ON THE CABIN ROOF, WHICH IS MEASURABLE RATHER THAN A
     FRACTION OF DIAMETER. RAVEN SWFT's wing is at z = 1.9894 m and its
     cabin top computes to 1.9820 m — the wing is 0.2% of cabin height above
     the body it is bolted to. The old form, 0.42 fD, was measured when this
     file drew a CIRCULAR body of diameter fD; now that the fuselage carries
     RAVEN's real tall RoundedRect section, 0.42 fD lands INSIDE the cabin
     and the wing is buried in the fuselage. Taking the drawn body's own
     highest point makes the two agree by construction, at any fineness. */
  const fusSt  = fusStations();
  const zBodyTop = Math.max(...fusSt.map(st => (st.dz || 0) + st.h / 2));
  const zWing   = zBodyTop;                         // high wing, as both NASA models are
  const zHinge  = zWing + L.hingeZoverD * D;        // tilt pivot sits ON the wing plane

  if (hasWing && bW > 0) {
    bodies.push({ kind: "wing", label: "Wing", x: xWingLE, z: zWing, span: bW,
      rootChord: Cr, tipChord: Ct, sweepDeg: Number(SR.sweep) || 0,
      dihedralDeg: 0, thickRatio: Number(p.tc) || 0.15 });

    /* V-TAIL — AT THE TAIL ARM THE STABILITY SOLUTION CHOSE.
       x = xACwing + lv - 0.25 Cr_vt. The previous version put it at a flat
       0.88 x fuselage length, which ignores `lv` entirely — so moving the wing
       or retrimming the aircraft left the tail where it was and the drawing
       stopped being the aeroplane the loop had balanced. */
    const CrVT = Number(SR.Cr_vt) || 1.0, CtVT = Number(SR.Ct_vt) || 0.5;
    const xACw = Number(SR.xACwing) || (xWingLE + 0.25 * Cr);
    const lv   = Number(SR.lv) || fL * 0.45;
    /* ── THE TAIL GOES WHERE THE TAIL ARM PUTS IT ──────────────────────
       An earlier version clamped the tail so its TRAILING EDGE landed on the
       fuselage, and then reported a "tail arm shortfall" of up to 4 m. That
       report was measuring the clamp, not the aeroplane.

       The engine derives lv = 0.88 x fusLen - xACwing, so the tail's
       AERODYNAMIC CENTRE is at 88% of the body BY CONSTRUCTION and its trailing
       edge naturally overhangs the tail cone by a few per cent — which is what
       a vertical tail does on almost every aircraft ever built; the fin TE is
       usually the aftmost point of the airframe.

       So only the ROOT has to land on structure. If the tail is so large that
       even its leading edge falls off the back, the aircraft is not buildable —
       and that is a real result, owned by the engine's own "Tail/Wing area
       25-50%" check, which the oversized cases already fail. */
    const xVTwanted = xACw + lv - 0.25 * CrVT;
    const xVT = Math.min(xVTwanted, fL - 0.30 * CrVT);   // root stays on the body
    if (xVTwanted - xVT > 1e-6)
      tailArmShort = { wanted: xVTwanted, placed: xVT, shortfall: xVTwanted - xVT };
    /* ── THE TAIL MUST CLEAR THE PUSHER ────────────────────────────────
       A pusher sits on the centreline at the tail cone, which is exactly where
       the V-tail root wants to be — and the root was landing INSIDE the disc.
       Real lift+cruise aircraft (BETA ALIA is the reference for this layout)
       mount the V-tail ABOVE the propeller, so the root is lifted clear of the
       disc rather than the propeller being moved off the thrust line. */
    /* ── THE TAIL SITS ON THE FUSELAGE. FULL STOP. ─────────────────────
       An earlier attempt raised the V-tail to clear the pusher disc, which
       "solved" the interference by lifting the tail off the aeroplane — it
       ended up attached to nothing at all. A tail root is bolted to the tail
       cone; if a propeller wants the same space, that is a DESIGN conflict to
       report, not something to fix by floating the tail.

       So the root takes NASA's measured height and is then clamped into the
       fuselage cross-section at its own station, guaranteeing it lands on
       structure. Any remaining clash with the pusher is reported by the
       collision pass below. */
    const bodyAt = fusStations();
    const tVT = Math.max(0, Math.min(1, xVT / fL));
    let hHalf = fD / 2, dzB = 0;
    for (let i = 0; i < bodyAt.length - 1; i++) {
      const s0 = bodyAt[i], s1 = bodyAt[i + 1];
      if (tVT >= s0.t && tVT <= s1.t) {
        const f = (tVT - s0.t) / Math.max(1e-9, s1.t - s0.t);
        hHalf = (s0.h + (s1.h - s0.h) * f) / 2;
        dzB = (s0.dz || 0) + ((s1.dz || 0) - (s0.dz || 0)) * f;
        break;
      }
    }
    /* On the UPPER body at its own station — measured, and guaranteed to land
       on structure rather than under the aeroplane. */
    const zVT = dzB + L.vTailZoverFusHalfHeight * hHalf;
    if (SR.tailType === "conventional") {
      /* ── RAVEN'S TAIL: A FIN, A STABILATOR AND A VENTRAL FIN ──────────
         Neither RAVEN has a V-tail. The fin is a single panel standing on
         the tail boom; the stabilator is an all-moving full-span surface
         AFT of it (SWFT 0.911 fL against the fin's 0.779, v01_003 0.908
         against 0.736); the ventral fin hangs below the boom at the fin's
         own station. Areas come from the sizing loop, aspect ratios and
         stations from RAVEN — see RAVEN_TAIL_CONVENTIONAL. */
      const RT = RAVEN_TAIL_CONVENTIONAL;
      /* THE TAIL BONE MUST FOLLOW THE TAIL CONE, WHICH TAPERS. Fixing the
         root height to the body top at ONE station left both surfaces
         0.224 m ABOVE the skin at their trailing edge — the tail cone had
         shrunk away underneath them and the tail floated off the back.

         The body narrows monotonically aft, so taking the top at the AFT end
         of the root chord puts the whole root at or BELOW the skin: buried
         slightly at the leading edge, which is what a root fairing is, and
         never hanging in air. Beyond the fuselage the surface overhangs, as
         RAVEN's stabilator does over its own tail cone. */
      const bodyTopAt = (x) => {
        const st = fusStations();
        const t = Math.max(0, Math.min(1, x / fL));
        let a = st[0], b2 = st[st.length - 1];
        for (let i = 0; i < st.length - 1; i++)
          if (t >= st[i].t && t <= st[i + 1].t) { a = st[i]; b2 = st[i + 1]; break; }
        const f2 = b2.t > a.t ? (t - a.t) / (b2.t - a.t) : 0;
        return (a.dz + (b2.dz - a.dz) * f2) + (a.h + (b2.h - a.h) * f2) / 2;
      };
      const rootTopFor = (xLE, chord) => bodyTopAt(Math.min(xLE + chord, fL));
      const zBoomTop = bodyTopAt(RT.finXoverFL * fL);

      /* FIN — a half surface: bothSides false, standing vertically. */
      const finX = Math.max(xVT, RT.finXoverFL * fL - 0.25 * (Number(SR.finRootChord) || 1));
      bodies.push({ kind: "vfin", label: "Vertical fin",
        x: finX, z: rootTopFor(finX, Number(SR.finRootChord) || 1),
        span: Number(SR.finSpan) || bW * 0.12,
        rootChord: Number(SR.finRootChord) || 1, tipChord: Number(SR.finTipChord) || 0.4,
        sweepDeg: Number(SR.finSweep) || 0, thickRatio: 0.10 });

      /* STABILATOR — full span, mounted at the fin root on the tail boom, at
         RAVEN's own aft station. All-moving, so it carries no elevator: the
         surface IS the control, which is what Stab-Hinge -> Stabilator means. */
      const stabX = RT.stabXoverFL * fL - 0.25 * (Number(SR.stabRootChord) || 1);
      bodies.push({ kind: "htail", label: "Stabilator",
        x: stabX, z: rootTopFor(stabX, Number(SR.stabRootChord) || 1),
        span: Number(SR.stabSpan) || bW * 0.28,
        rootChord: Number(SR.stabRootChord) || 1, tipChord: Number(SR.stabTipChord) || 0.4,
        sweepDeg: Number(SR.stabSweep) || 0, dihedralDeg: 0, thickRatio: 0.10,
        allMoving: true });

      /* VENTRAL FIN — below the boom, v01_003 only, so its share is the one
         measured value and no two-vehicle agreement is claimed. */
      const zBoomBot = (() => {
        const st = fusStations();
        const t = RT.finXoverFL;
        let a = st[0], b2 = st[st.length - 1];
        for (let i = 0; i < st.length - 1; i++)
          if (t >= st[i].t && t <= st[i + 1].t) { a = st[i]; b2 = st[i + 1]; break; }
        const f2 = b2.t > a.t ? (t - a.t) / (b2.t - a.t) : 0;
        return (a.dz + (b2.dz - a.dz) * f2) - (a.h + (b2.h - a.h) * f2) / 2;
      })();
      if ((Number(SR.ventralArea) || 0) > 1e-4) {
        /* A VENTRAL FIN MAY NOT REACH BELOW THE GROUND. Drawn at the span its
           aspect ratio implies, this one hung to z = -1.70 while the wheels
           stand on z = -1.159: the aeroplane would have rested on its tail fin
           rather than its undercarriage. That is not a proportions quibble, it
           is an aircraft that cannot be parked.

           The AREA is kept — it is part of Sv_req and the yaw sizing paid for
           it — and the SPAN is clamped to the clearance actually available,
           with the chord widened to hold the area. So the fin still does its
           job; it simply stops being taller than the landing gear.

           Deferred because the ground plane does not exist yet at this point
           in the build: the gear is placed further down, and computing this
           here would clamp against a number that has not been worked out. */
        addVentralFin = () => {
          const S = Number(SR.ventralArea) || 0;
          const wanted = Math.abs(Number(SR.ventralSpan) || 0.3);
          /* leave the fin a tenth of the clearance clear of the ground, the
             same order as the tyre's own static deflection */
          const room = gear?.applicable
            ? Math.max(0.05, (zBoomBot - gear.zGround) * 0.90)
            : wanted;
          const span = Math.min(wanted, room);
          const taper = RT.taper;
          const cr = 2 * S / (span * (1 + taper));
          bodies.push({ kind: "vfin", label: "Ventral fin",
            x: finX, z: zBoomBot,
            span: -span,                       // negative: hangs below
            rootChord: cr, tipChord: cr * taper,
            sweepDeg: 0, thickRatio: 0.10,
            spanClampedByGround: span < wanted - 1e-6 });
        };
      }
      /* Tail-mounted rotors reference vtRef; give them the fin so they still
         have a surface to stand on, with the stabilator's span for reach. */
      vtRef = { kind: "vfin", label: "Vertical fin", x: finX,
        z: rootTopFor(finX, Number(SR.finRootChord) || 1),
        span: Number(SR.stabSpan) / 2 || bW * 0.14,
        rootChord: Number(SR.finRootChord) || 1, tipChord: Number(SR.finTipChord) || 0.4,
        sweepDeg: Number(SR.finSweep) || 0, dihedralDeg: 0, thickRatio: 0.10 };
    } else {
      vtRef = { kind: "vtail", label: "V-tail", x: xVT,
        z: zVT,
        span: Number(SR.bvt_panel) || bW * 0.28, rootChord: CrVT, tipChord: CtVT,
        sweepDeg: Number(SR.sweep_vt) || 0,
        dihedralDeg: Number(SR.vtGamma_opt) || Number(p.vtGamma) || 45,
        thickRatio: 0.10 };
      bodies.push(vtRef);
    }
  }

  /* ── WHERE THE WING ACTUALLY IS AT A GIVEN SPAN STATION ─────────────
     A swept, tapered wing is not a rectangle. Attaching pylons at
     `xWingLE + 0.20*rootChord` put the OUTERMOST rotors of a tiltrotor 0.98 m
     ahead of the wing they were supposed to be bolted to — the sweep had moved
     it aft and the strut reached empty air. Sweep and taper are both in the
     sizing result, so both are used. */
  const wingChordAt = (y) => {
    const bw = Number(SR.bWing) || 0;
    if (!(bw > 0)) return Number(SR.Cr_) || 1.9;
    const f = Math.min(1, Math.abs(y) / (bw / 2));
    const cr = Number(SR.Cr_) || 1.9, ct = Number(SR.Ct_) || 0.9;
    return cr + (ct - cr) * f;
  };
  const wingLEat = (y) =>
    ((Number(SR.wingLEfrac) || 0.2589) * fL)
    + Math.abs(y) * Math.tan(((Number(SR.sweep) || 0) * Math.PI) / 180);

  /* ── CONTROL SURFACES ──────────────────────────────────────────────
     Emitted here, AFTER `wingLEat`/`wingChordAt` exist, because a control
     surface is defined off the local chord and a swept, tapered wing has a
     different one at every station. They are real bodies with real corners:
     the viewer draws them, the exporter writes them as OpenVSP SS_Control
     sub-surfaces, and the connectivity gate can see that they touch the wing
     instead of reporting six floating panels.

     Corner order is hinge@eta0, TE@eta0, TE@eta1, hinge@eta1. */
  if (hasWing && bW > 0) {
    const halfW = bW / 2;
    /* ── SPLIT EVERY SURFACE AROUND EVERY BOOM ───────────────────────
       RAVEN's measured control spans leave a gap from eta 0.386 to 0.473,
       and that gap is not decorative: its boom crosses the wing at 0.4305,
       almost exactly the midpoint. NASA SPLIT THE FLAP AROUND THE BOOM.

       RAVEN has ONE boom pair, so its published spans dodge one station.
       This tool draws layouts with three — a twelve-rotor hybrid puts booms
       at eta 0.191, 0.573 and 0.956 — and copying RAVEN's numbers onto it
       ran a boom straight through the inboard flap, the outboard flap AND
       the aileron. Measured on the app's own hybrid before this change:

         Flap inboard  0.1058-0.3860  crossed at 0.1911
         Flap outboard 0.4730-0.6963  crossed at 0.5734
         Aileron       0.7003-1.0000  crossed at 0.9556

       So RAVEN's RULE is applied rather than RAVEN's numbers: each surface
       is cut at every boom station, leaving NASA's own gap width of
       0.473 - 0.386 = 0.0870 of half span centred on the boom. Where a
       layout has one boom in RAVEN's place this reproduces RAVEN exactly;
       where it has three, it does the thing RAVEN did, three times. */
    const BOOM_GAP_ETA = 0.4730 - 0.3860;
    /* Read INSIDE the split, not here: `bodies` has no booms yet at this point
       and capturing the empty list is what made the first deferral a no-op. */
    const boomEtasNow = () => [...new Set(bodies
      .filter(b2 => b2.kind === "boom" && /^Boom /.test(b2.label || ""))
      .map(b2 => Math.abs(b2.y) / halfW))].filter(e => e > 0 && e < 1.001);
    /* Cut [e0,e1] at each boom, returning the surviving segments. */
    const splitSpan = (e0, e1) => {
      const boomEtas = boomEtasNow();
      let segs = [[e0, e1]];
      for (const be of boomEtas) {
        const lo = be - BOOM_GAP_ETA / 2, hi = be + BOOM_GAP_ETA / 2;
        const next = [];
        for (const [a2, b2] of segs) {
          if (hi <= a2 || lo >= b2) { next.push([a2, b2]); continue; }
          if (a2 < lo) next.push([a2, Math.min(lo, b2)]);
          if (b2 > hi) next.push([Math.max(hi, a2), b2]);
        }
        segs = next;
      }
      /* A sliver narrower than a tenth of RAVEN's gap is not a control
         surface; dropping it is better than drawing a tab nobody can hinge. */
      return segs.filter(([a2, b2]) => b2 - a2 > BOOM_GAP_ETA * 0.1);
    };

    /* DEFERRED ON PURPOSE. The booms do not exist yet at this point in the
       build — they are placed with the rotors, further down — so a split
       computed here would see none and silently do nothing, which is exactly
       what the first version of this did. The surfaces are built by a closure
       called once the booms are on the aircraft. */
    addWingControls = () => {
    for (const cs0 of RAVEN_CONTROLS.wing) {
      const segments = splitSpan(cs0.eta0, cs0.eta1);
      segments.forEach(([se0, se1], segIdx) => {
      const cs = { ...cs0, eta0: se0, eta1: se1,
                   name: segments.length > 1 ? `${cs0.name} ${segIdx + 1}` : cs0.name };
      for (const sg of [-1, 1]) {
        const yA = sg * cs.eta0 * halfW, yB = sg * cs.eta1 * halfW;
        const leA = wingLEat(yA), cA = wingChordAt(yA);
        const leB = wingLEat(yB), cB = wingChordAt(yB);
        const hA = leA + (1 - cs.chord) * cA, tA = leA + cA;
        const hB = leB + (1 - cs.chord) * cB, tB = leB + cB;
        bodies.push({
          kind: "control", surface: "wing", ctrlKind: cs.kind,
          label: `${cs.name} ${sg < 0 ? "L" : "R"}`,
          side: sg, eta0: cs.eta0, eta1: cs.eta1, chordFrac: cs.chord,
          z: zWing,
          quad: [[hA, yA, zWing], [tA, yA, zWing], [tB, yB, zWing], [hB, yB, zWing]],
        });
      }
      });
    }
    };
    /* RUDDER on each V-tail panel, from the same file. A V-tail's surfaces are
       ruddervators and do both jobs; the file calls this one Rudder. */
    /* ── A CONVENTIONAL TAIL HAS ONE RUDDER, ON THE FIN ──────────────
       This block kept mirroring the ruddervator pair after the tail became a
       fin and a stabilator, so the aircraft was drawn with TWO rudders
       spreading laterally to y +/-1.09 — a V rudder on an aeroplane with no
       V-tail. A fin carries a single rudder in the x-z plane at y = 0.

       AND THE STABILATOR CARRIES NO ELEVATOR. It is all-moving: the surface
       IS the control, which is what Stab-Hinge -> Stabilator means in RAVEN's
       tree. Adding an elevator to it would draw a hinge line that does not
       exist and imply authority that is already counted once. */
    /* ── THE RUDDER IS NOT A SEPARATE PART ────────────────────────────
       It was drawn as its own panel lying on the tail, in its own colour,
       and it read as a second surface hanging off the empennage rather than
       as a hinge line on it. OpenVSP models a control surface the right way
       already: an SS_Control SUB-SURFACE on the parent, which is exactly what
       the .vsp3 exporter writes and what RAVEN's own file carries. The
       exported model therefore still has its rudder, deflectable, attached to
       the tail — there is simply no separate body in the viewer pretending to
       be one.

       The wing flaps and aileron stay drawn: they lie flat ON the wing where
       a picked-out hinge line reads correctly, and NASA's own RAVEN renders
       show them that way. It is the TAIL surface, standing at a dihedral,
       where a separate panel detaches visually. */
    const DRAW_TAIL_RUDDER = false;
    const finBody = DRAW_TAIL_RUDDER
      && bodies.find(b2 => b2.kind === "vfin" && /Vertical fin/.test(b2.label || ""));
    if (finBody) {
      for (const cs of RAVEN_CONTROLS.vtail) {
        const t = 0.02;                       // stand it proud of the skin
        const pt = (eta) => {
          const c = finBody.rootChord + (finBody.tipChord - finBody.rootChord) * eta;
          const le = finBody.x + eta * Math.abs(finBody.span) *
            Math.tan(((finBody.sweepDeg || 0) * Math.PI) / 180);
          return { c, le, z: finBody.z + eta * finBody.span };
        };
        const A = pt(cs.eta0), Bp = pt(cs.eta1);
        bodies.push({
          kind: "control", surface: "fin", ctrlKind: cs.kind,
          label: cs.name, side: 0, eta0: cs.eta0, eta1: cs.eta1,
          chordFrac: cs.chord, z: finBody.z,
          quad: [
            [A.le + (1 - cs.chord) * A.c,  t, A.z],
            [A.le + A.c,                   t, A.z],
            [Bp.le + Bp.c,                 t, Bp.z],
            [Bp.le + (1 - cs.chord) * Bp.c, t, Bp.z],
          ],
        });
      }
    } else if (DRAW_TAIL_RUDDER && vtRef && vtRef.kind === "vtail") {
      const gam = ((vtRef.dihedralDeg || 45) * Math.PI) / 180;
      for (const cs of RAVEN_CONTROLS.vtail) {
        for (const sg of [-1, 1]) {
          const pt = (eta) => {
            const c = vtRef.rootChord + (vtRef.tipChord - vtRef.rootChord) * eta;
            const le = vtRef.x + eta * vtRef.span *
              Math.tan(((vtRef.sweepDeg || 0) * Math.PI) / 180);
            return { c, le,
              y: sg * eta * vtRef.span * Math.cos(gam),
              z: vtRef.z + eta * vtRef.span * Math.sin(gam) };
          };
          const A = pt(cs.eta0), Bp = pt(cs.eta1);
          bodies.push({
            kind: "control", surface: "vtail", ctrlKind: cs.kind,
            label: `${cs.name} ${sg < 0 ? "L" : "R"}`,
            side: sg, eta0: cs.eta0, eta1: cs.eta1, chordFrac: cs.chord,
            z: vtRef.z,
            quad: [
              [A.le + (1 - cs.chord) * A.c,  A.y,  A.z],
              [A.le + A.c,                   A.y,  A.z],
              [Bp.le + Bp.c,                 Bp.y, Bp.z],
              [Bp.le + (1 - cs.chord) * Bp.c, Bp.y, Bp.z],
            ],
          });
        }
      }
    }
  }

  const nTilting = cfg.nTilting ?? 0;
  const nStopped = cfg.nStopped ?? 0;

  if (!hasWing) {
    /* ROTOR-BORNE: radial arms, one per rotor, at the non-overlap radius the
       mass model itself uses (engine/booms.js applies a = R/sin(pi/N) as a
       FLOOR, so the drawing takes the same rule plus 5% so discs do not graze). */
    /* COAXIAL: N rotors ride N/2 ARMS as contra-rotating pairs, which is how
       EHang 184, SkyDrive SD-03 and Moog SureFly are built. The non-overlap
       ring is then set by the number of STATIONS, not the rotor count - half
       as many arms need a smaller circle for the same disc, which is most of
       why the arrangement exists. */
    const coax  = String(SR.rotorArrangement ?? p?.rotorArrangement ?? "coplanar") === "coaxial";
    const nSt   = coax ? Math.max(1, Math.round(N / 2)) : N;
    /* ONE RULE, IN ONE PLACE. This inlined a copy of ringRadiusFor and then
       special-cased nSt <= 2 to `fD * 1.6 + Rrot` — a fuselage-clearance
       heuristic with no source, which put the side-by-side's rotors at
       span/D = 1.602 while the mass model charged for 0.655 and NASA's own
       tangency datum is 1.000. The tool drew one aircraft and weighed
       another. The guard needs to exclude only the SINGLE-rotor case, where
       sin(pi/1) = 0 and the expression divides by zero. */
    /* THE DRAWING USES THE SAME INTERLEAVE RULE AS THE MASS MODEL. It did
       not: `interleaved` was never passed here, so booms.js weighed the short
       interleaved arm while this drew the long strict ring — the tool
       weighing one aircraft and drawing another, which is exactly what the
       comment above records being fixed for the side-by-side. One rule, in
       one place, is now interleavedFor() in coaxial.js. */
    const interleaved = interleavedFor(p?.configType,
                                       cfg?.nRotors ?? p?.nPropHover, p);
    const ring  = nSt >= 2 ? Math.max(ringRadiusFor(nSt, Rrot,
                              { margin: hubSpacingFor(p?.configType, cfg?.nRotors ?? p?.nPropHover),
                                interleaved }), fD)
                           : fD * 1.6 + Rrot;
    const boomR = Number(SR.boomDetail?.radiusM) || 0.10;
    /* ── THE ARMS GO OVER THE CABIN, NOT THROUGH IT ────────────────
       zArm was fD * 0.34 — 34% of the fuselage WIDTH above the body axis.
       The body's own half-height is 0.5 * fD, so that plane is INSIDE the
       fuselage on every multicopter: the arms left the side of the cabin
       and the disc swept below its roof. Measured on a two-seat pod, arm
       0.51 m, disc 0.89 m, roof 0.95 m — 60 mm of blade inside the cabin.

       On a capsule it is worse, because keying off the width understates a
       body that is taller than wide: the reference is 1.5 m across and
       1.9 m tall, so the width misses its roof by 0.4 m.

       A lifting rotor has to clear the cabin it lifts. That is geometry,
       not styling, and it is why every passenger multicopter carries its
       discs over the cabin — EHang 216 (cited in mission.js), Volocopter,
       and the reference concept. The arm plane is therefore the higher of
       its old value and the top of the body, and the rotor still stands
       hubAbove() over the arm, so the disc clears the roof by RAVEN's own
       measured stand-off. */
    /* Half-height of the drawn body on the centreline, so "is the arm plane
       above the cabin" is asked of the body actually lofted. */
    const bodyHalfHeightAt = () => Math.max(...fusStations().map(st => st.h / 2));
    const zBodyTop = Math.max(fH > 0 ? fH : fD, fD) / 2;
    const xHub  = fL * 0.5, zArm = Math.max(fD * 0.34, zBodyTop);
    const gapZ  = COAX_DISK_GAP_OVER_D * D;   // separation between the two discs
    /* THE PYLON. Absent entirely: the arms were expected to reach the cabin
       skin on their own, which worked only while they sat inside the body.
       It runs from within the cabin structure up to the deck the arms root
       on, and it is the member every rotor load passes through. */
    if (zArm > bodyHalfHeightAt() * 0.999) {
      const rDeck0 = Math.max(2.5 * (Number(SR.boomDetail?.radiusM) || 0.10), 0.18 * fD);
      bodies.push({ kind: "boom", label: "Rotor pylon",
        x0: xHub, x1: xHub, y0: 0, y: 0,
        z0: bodyHalfHeightAt() * 0.55, z: zArm,
        radius: rDeck0 * 0.75 });
    }
    for (let k = 0; k < nSt; k++) {
      const th = (2 * Math.PI * k) / nSt - Math.PI / 2;
      const x = xHub + ring * Math.cos(th), y = ring * Math.sin(th);
      /* THE ARM STARTS AT THE FUSELAGE SKIN, NOT AT ITS CENTRELINE. Every arm
         used to begin at (xHub, 0) - a single point on the axis INSIDE the
         body - so four arms drew as two long spars skewering the cabin, which
         is nothing like the reference aircraft: on an EHang or a Volocopter the
         arms attach at the airframe periphery and the cabin is a pod hung
         within them. Start each arm on the fuselage surface at its own
         azimuth, so it reads as an arm bolted to the side rather than a beam
         passed through the middle. */
      /* Radius of the fuselage ellipse at this azimuth. NOTE THE FORM: the
         first attempt used hypot(cos*a, sin*b), which is NOT an ellipse radius
         - at 45 deg it put the root at y = 0.98 m on a body only 0.825 m in
         half-width, i.e. outside the aircraft, and the connectivity gate
         caught it. The radius of an ellipse with semi-axes a, b is
         1/sqrt((cos/a)^2 + (sin/b)^2).
         Taken at 0.85 of that, not exactly ON the surface: an arm root is
         bolted INTO the structure, and a root placed exactly on the skin sits
         on the boundary of the connectivity test rather than inside it. */
      /* THE ARM STARTS ON THE DRAWN SKIN, NOT ON A NOMINAL DIAMETER. bFus was
         fD/2, which was the body's half width back when the section was a
         circle of diameter fD. With RAVEN's real profile the body is TALLER
         than fD and NARROWER — half width 0.562 m against fD/2 = 0.825 m — so
         every arm began 0.26 m outside the skin and the connectivity gate
         correctly reported the whole multicopter rotor group as floating.
         Taken from the sections actually being lofted, it cannot drift again. */
      const aFus = fL * 0.30;
      const bFus = Math.max(...fusStations().map(st => st.w / 2));
      /* ── ROOT ON THE DECK WHEN THE ARMS RIDE ABOVE THE CABIN ─────────
         0.85 of the ellipse radius is the body's PLAN half-width at its
         WIDEST station. That is the right root while the arm plane is inside
         the body. It is wrong above it: an ellipsoid's plan section shrinks
         to a point at the top, so a root at the widest half-width but at roof
         height is outside the aircraft, and every arm floated.

         Above the roof the arms root on a DECK carried by a PYLON, which is
         what the load path actually is — rotor, arm, deck, pylon, cabin
         structure — and what the reference concept, EHang 216 and Volocopter
         all have. The deck rim is sized to the arms it carries. */
      const raised = zArm > bodyHalfHeightAt(0) * 0.999;
      const rDeck = Math.max(2.5 * boomR, 0.18 * fD);
      const rSkin = raised
        ? rDeck
        : 0.85 / Math.hypot(Math.cos(th) / aFus, Math.sin(th) / bFus);
      const x0Arm = xHub + rSkin * Math.cos(th), y0Arm = rSkin * Math.sin(th);
      bodies.push({ kind: "boom", label: `Arm ${k + 1}`, x0: x0Arm, x1: x,
        y0: y0Arm, y, z: zArm, radius: boomR });
      if (coax) {
        /* Upper and lower disc of the pair, straddling the arm-top hub height
           so the stack sits where a single coplanar rotor would. */
        const zMid = zArm + hubAbove(boomR) + gapZ * 0.5;
        /* boomR passed so the motor foot lands on the arm's SKIN, not on its
           axis — see addRotor. Without it the stack sank into the arm by the
           arm's own radius, measured at 0.328 m on the multicopter. */
        addRotor(x, y, zMid + gapZ * 0.5, false, false,
          `Rotor ${2 * k + 1} upper`, x, y, zArm, boomR);
        addRotor(x, y, zMid - gapZ * 0.5, false, false,
          `Rotor ${2 * k + 2} lower`, x, y, zArm, boomR);
        continue;
      }
      /* ── AFT ROTORS SIT HIGHER, AND NASA SAY WHY ──────────────────────
         Every rotor here was drawn at one height. NASA's quadrotor concept is
         not built that way, and the reason is in AIAA 2018-3847's own text:
         "in forward flight, the power required by the rear rotors is often
         greater than that required by the front rotors, EVEN WITH A VERTICAL
         OFFSET between front and rear." The offset exists to lift the aft
         rotors clear of the forward rotors' wake.

         MEASURED off that paper's Fig. 1 side view: front hub at 405 px,
         rear hub at 288 px, rotor diameter 670 px in the same projection, so
         the rear rotors stand 0.17 D higher. A side elevation does not
         distort z, so this is the one quantity that figure gives cleanly.

         Applied about the rotor ring's own mid-station so the pair is raised
         and lowered symmetrically and the mean rotor height — which is what
         the CG and hover-trim models see — does not move. */
      /* ── INTERLEAVED RINGS ALTERNATE HEIGHT AROUND THE RING ───────────
         An interleaved multicopter's discs OVERLAP in plan, so drawing them
         all at one height puts them physically through each other. That is
         not a check artefact, it is the drawing being wrong: Volocopter's
         photographs show the VoloCity nacelles "alternating between two
         heights", which is what makes the 32% overlap buildable, and it is
         already the justification quoted in provenance.js for allowing the
         overlap at all. The tool allowed the overlap and did not draw the
         stagger that permits it.

         The separation is COAX_DISK_GAP_OVER_D — the same disc-to-disc
         clearance this codebase already requires between the two discs of a
         coaxial pair, rather than a second number invented here. Applied as
         +/- half the gap so the mean rotor height does not move, exactly as
         the fore/aft rise below does. */
      /* ── THE FORE/AFT RISE MUST NOT BE DECIDED BY FLOATING-POINT NOISE ──
         `x > xHub` was the whole test. A side-by-side's two rotors sit ON the
         hub station: x and xHub print identical to four decimals, and which
         side of the comparison the last bits fall on depends on the ring
         radius, which depends on rotor diameter, which depends on MTOW. So
         a 2% change in gross weight flipped the pair from +0.5 D-rise to
         -0.5 D-rise -- a 1.49 m change in hub height on a 2 t aircraft --
         and with it Iyy by 3.3x, Mq from -0.31 to -0.84 and Lp from -4.97
         to -6.57. The hover-qualities numbers this tool had published for
         the side-by-side were the "heads" outcome of that coin.

         The rise is NASA's QUADROTOR feature: rear rotors 0.35 R above the
         front pair to lift them out of the forward rotors' wake. It has a
         direction only for rotors that are genuinely fore or aft of the hub
         station. A lateral pair is neither, and gets none. The tolerance is
         a millimetre-scale fraction of fuselage length, not a bare
         inequality, so the answer cannot change with the last bits again. */
      const dxHub = x - xHub;
      const onStation = Math.abs(dxHub) <= 1e-6 * Math.max(1, fL);
      const zStagger = interleaved
        ? COAX_DISK_GAP_OVER_D * D * (k % 2 ? 0.5 : -0.5)
        : onStation ? 0
        : MC_AFT_RISE_OVER_D * D * (dxHub > 0 ? 0.5 : -0.5);
      addRotor(x, y, zArm + hubAbove(boomR) + zStagger, false, false,
        `Rotor ${k + 1}`, x, y, zArm, boomR);
    }
  } else {
    /* ── ROTORS RIDE FORE-AFT BOOMS: TILT FORWARD, LIFT AFT ────────────
       This is BOTH sources agreeing, and it is not what was drawn before.

       NASA: RAVEN's sponsons carry a TILTING rotor at the forward station
       (Prop2/3, x/fL 0.145) and a LIFT-ONLY rotor at the aft station
       (Prop5/6, x/fL 0.673) — the same pod carries one of each.
       THE ENGINE: engine/booms.js sizes every boom on armFwd = |xWing -
       xRotFwd| and armAft = |xRotAft - xWing|, and says so — "half the stopped
       rotors forward, half aft". Fore-and-aft stations, exactly as NASA build
       them.

       So each boom has TWO stations. Rotors were previously spread SPANWISE,
       which is a different aeroplane from the one the boom mass was computed
       for, and it put a leading-edge rotor 0.88 m from a boom rotor with 1.185 m
       radii — intersecting discs.

       CLEARANCE IS NASA'S OWN. Across all fifteen rotor pairs in RAVEN the
       tightest centre distance is 1.158 x diameter; two rotors touch at 1.0, so
       their design clearance is 15.8%. That figure is used everywhere here
       rather than a number of mine. */
    const CLEAR = 1.158;                        // [SRC] tightest pair in RAVEN

    /* ── TIP ROTORS ONLY WHERE THE REFERENCE AIRCRAFT HAVE THEM ─────────
       RAVEN carries SIX rotors: a tilting pair outboard of the wingtips and
       four on two sponsons. Archer carries TWELVE and has NO tip rotors — all
       twelve sit on six booms, a tilting one forward and a lift one aft of
       each. Both are this same layout at different counts, and the difference
       is not stylistic: once enough rotors are on booms, the outermost boom
       reaches the tip and a tip rotor has nowhere left to go without
       intersecting it.
       So the tip pair is used only for the small-count case both aircraft
       agree on, and beyond that every rotor goes on a boom. */
    /* A NO-BOOM LAYOUT HAS NO WINGTIP PAIR EITHER. The tip stations belong to
       the sponson architecture (RAVEN); Joby, which carries no booms, puts its
       rear pair on the V-TAIL instead. Deciding nTip before knowing that gave
       the tiltrotor both — six discs competing for one wing — and the tip pair
       overlapped the wing row by 1.4 m. */
    const boomsSized0 = cfg.boomCount ?? 2;
    const noBooms = boomsSized0 === 0 || cfg.hasBooms === false;
    const nTip  = (!noBooms && nTilting >= 2 && (nStopped + nTilting - 2) <= 4) ? 2 : 0;
    const tiltOnBooms = Math.max(0, nTilting - nTip);
    const onBooms = nStopped + tiltOnBooms;

    /* Each boom holds at most two rotors — one forward, one aft. That rule
       reproduces the engine's own boomCount for the lift+cruise (4 rotors -> 2
       booms), the hybrid-pusher (4 -> 2) and a six-rotor hybrid (4 -> 2). It
       does NOT reproduce it for a twelve-rotor hybrid, and that is a finding:
       ten boom-mounted rotors need five booms, while configuration.js returns a
       fixed 2. Archer, the reference for this layout, flies twelve rotors on
       six booms. The drawing uses what the geometry requires and reports the
       disagreement rather than drawing rotors through each other. */
    /* EVEN, ALWAYS. An odd count puts a boom on the centreline, straight
       through the fuselage — which is what five booms did. Booms come in
       symmetric pairs on every aircraft either reference builds. */
    /* A LAYOUT WITH NO BOOMS PUTS ITS ROTORS ON THE WING. configuration.js
       gives the tiltrotor boomCount 0 — "rotors on wing and tail, no lift
       booms" — which is Joby S4: six tilting propellers on the wing and the
       V-tail, and not a boom on the aircraft. Placing its tilting rotors on
       booms invented structure the mass model never paid for. */
    const boomsSized  = boomsSized0;
    const wingMounted = noBooms;
    const boomsNeeded = wingMounted ? 0 : Math.max(2, 2 * Math.ceil(onBooms / 4));
    if (!wingMounted && onBooms > 0 && boomsNeeded !== Math.max(1, boomsSized))
      boomCountMismatch = { boomsNeeded, boomsSized: Math.max(1, boomsSized) };
    const nBooms = (!wingMounted && onBooms > 0) ? boomsNeeded : 0;

    const xRF   = Number.isFinite(SR.xRotFwd) ? SR.xRotFwd : fL * 0.10;
    const xRA   = Number.isFinite(SR.xRotAft) ? SR.xRotAft : fL * 0.80;
    const boomR = Number(SR.boomDetail?.radiusM) || 0.10;
    const zBoom = zWing + L.boomZoverD * D;
    const zRotBfixed = zBoom + hubAbove(boomR, false);
    const zRotBtilt  = zBoom + hubAbove(boomR, true);

    if (nBooms > 0) {
      /* Boom lateral stations. Adjacent booms carry rotors at the same x, so
         they must clear each other laterally by the same 1.158 D. The outermost
         pair sits on NASA's measured sponson station where that fits, and moves
         outboard only if the clearance demands it. */
      /* ── LATERAL PITCH: NASA'S CLEARANCE WHERE THERE IS ROOM ────────
         A boom must attach to the WING, so it cannot sit outboard of the tip —
         doing that left the outermost booms of a twelve-rotor hybrid touching
         nothing at all. The row is therefore fitted INSIDE the span:

           preferred   1.158 D, the tightest pair NASA actually build
           allowed     down to 1.000 D, at which two discs exactly touch
           below that  the rotors genuinely do not fit the wing they were sized
                       for, and that is flagged rather than drawn through

         At the app default this lands on 1.128 D — inside NASA's practice, and
         the outermost boom exactly on the wingtip. */
      const room   = nBooms > 1 ? (2 * halfB) / (nBooms - 1) : Infinity;
      const pitchY = Math.min(CLEAR * D, Math.max(D, room));
      if (nBooms > 1 && room < D) overlapped = true;
      const yOuter = Math.min(halfB,
        Math.max(L.boomYoverHalfSpan * halfB, (nBooms - 1) * pitchY / 2));
      const ys = Array.from({ length: nBooms }, (_, i) =>
        nBooms === 1 ? 0 : -yOuter + (2 * yOuter * i) / (nBooms - 1));
      /* Longitudinal stations must clear too; the engine's own pair does on any
         sane fuselage, but if it does not the boom is lengthened rather than
         the rotors overlapped, and the flag is raised. */
      let xF = xRF, xA = xRA;
      if (xA - xF < CLEAR * D) { const mid = (xA + xF) / 2;
        xF = mid - CLEAR * D / 2; xA = mid + CLEAR * D / 2; boomStretched = true; }

      /* ── SLOT-BASED, AND EXACTLY N ROTORS ─────────────────────────
         The previous allocation walked boom pairs and filled every station it
         found, so the drawing did not carry the rotor count the aircraft was
         sized with: a six-rotor lift+cruise came out with EIGHT (four booms x
         two stations, all filled), and a six-rotor hybrid drew a 2/4 tilt-lift
         split where the configuration says 3/3. Rotors were being invented and
         mis-typed — which is what an uneven pattern on screen actually was.

         Stations are now enumerated as MIRRORED PAIRS — the forward pair and
         the aft pair of each boom pair — and exactly the required number are
         taken. Left/right symmetry is structural: a pair is placed or it is not.

         An odd tilting or stopped count cannot be split across a mirror, so it
         is rounded to the nearest pair and the difference REPORTED rather than
         drawn as a lopsided aeroplane. */
      const pairsNeeded = Math.ceil(onBooms / 2);
      const stations = [];
      for (let bp = 0; bp < Math.floor(ys.length / 2); bp++)
        for (const fwd of [true, false])
          stations.push({ x: fwd ? xF : xA, yL: ys[bp], yR: ys[ys.length - 1 - bp], fwd });
      stations.sort((a2, b2) => (a2.fwd === b2.fwd) ? 0 : (a2.fwd ? -1 : 1));
      const use = stations.slice(0, pairsNeeded);
      const tiltPairs = Math.min(use.length, Math.round(tiltOnBooms / 2));
      let placedTilt = 0, placedLift = 0;
      const boomsUsed = new Set();
      const plan = [];                 // (station, boom) -> height, levelled below
      use.forEach((st, k2) => {
        const tilt = k2 < tiltPairs;
        for (const yb of [st.yL, st.yR]) {
          if (!boomsUsed.has(yb)) {
            boomsUsed.add(yb);
            /* Carries `stations` so the mesh lofts RAVEN's upswept sponson
               instead of a straight cylinder. Kind stays "boom" so every gate
               that counts or traces booms is untouched — the change is what it
               LOOKS like, not what it IS. dz is a fraction of the body length,
               as OpenVSP stores it. */
            const bLen = xA - xF;
            bodies.push({ kind: "boom", label: `Boom ${boomsUsed.size}`, x0: xF, x1: xA,
              y0: yb, y: yb, z: zBoom, radius: boomR,
              stations: sponsonStations(boomR).map(st => ({ ...st, dz: st.dz * bLen })) });
          }
          const sfx = yb < 0 ? "L" : "R";
          const nm = `${tilt ? "Tilt" : "Lift"} ${st.fwd ? "F" : "A"}${sfx}${k2 + 1}`;
          /* A BOOM ROTOR MUST ALSO CLEAR THE WING, not just its own boom.
             zRotB stands the hub off the BOOM, and the boom runs UNDER the
             wing — so on a larger aircraft, where the wing is thick, the hub
             ended up INSIDE the wing with the disc sweeping through it. The
             aft rotor is the one that does it: the boom ends near the wing
             trailing edge, so its disc overlaps the chord. Raise the hub to
             clear the local upper surface whenever the disc actually laps the
             wing at that station. Geometry only - hub height is not an input
             to any mass model, so nothing sized changes. */
          let zThis = tilt ? zRotBtilt : zRotBfixed;
          /* THE DISC REACHES THE WING EVEN WHEN THE HUB DOES NOT. This tested
             the HUB's lateral station against the semi-span, so a rotor mounted
             OUTBOARD of the tip skipped the check entirely — while its disc
             swept 1.19 m back inboard, straight through the wing. Caught on the
             six-rotor hybrid, whose forward rotors sit at y = 5.45 on a wing
             that ends before them. The test is the swept band, as it already is
             for the V-tail. */
          const yIn = Math.max(0, Math.abs(yb) - Rrot);
          if (hasWing && bW > 0 && yIn <= bW / 2) {
            const yRef = Math.min(Math.abs(yb), bW / 2) * Math.sign(yb || 1);
            const le = wingLEat(yRef), ch = wingChordAt(yRef);
            const lapsWing = st.x + Rrot > le && st.x - Rrot < le + ch;
            if (lapsWing) {
              const wingTop = zWing + 0.5 * (Number(p.tc) || 0.15) * ch;
              zThis = Math.max(zThis, wingTop + 0.0775 * D);
            }
          }
          /* AND IT MUST CLEAR THE V-TAIL, for exactly the same reason. The
             wing case above has always been handled; the tail case only
             appeared once the wing moved up onto the cabin roof, which lifted
             the booms and with them the aft rotors, into a V-tail that rises
             from the tail boom. The aft disc then grazed the tail skin by
             7 mm. A V-tail panel at lateral offset |y| stands at
             z = z_root + |y| tan(gamma) out to its tip at span cos(gamma), so
             the height under the disc is that evaluated across the swept
             band. Geometry only, as above: hub height feeds no mass model. */
          if (vtRef && Math.abs(st.x - vtRef.x) < Rrot + vtRef.rootChord) {
            const gm = ((vtRef.dihedralDeg ?? 45) * Math.PI) / 180;
            const yTip = vtRef.span * Math.cos(gm);
            const lapsTail = st.x + Rrot > vtRef.x
                          && st.x - Rrot < vtRef.x + vtRef.rootChord;
            if (lapsTail) {
              const yIn = Math.max(0, Math.abs(yb) - Rrot);
              const yOut = Math.min(yTip, Math.abs(yb) + Rrot);
              if (yOut >= yIn) {
                const zTail = vtRef.z + Math.min(yOut, yTip) * Math.tan(gm);
                zThis = Math.max(zThis, zTail + 0.0775 * D);
              }
            }
          }
          plan.push({ st, yb, tilt, nm, zThis });
        }
      });

      /* ── A BOOM IS A STRAIGHT MEMBER, SO ITS ROTOR ROW IS LEVEL ────────
         The wing and tail clearances above are computed per STATION, so on a
         lift+cruise the aft rotor was lifted 0.94 m to clear the V-tail while
         the forward one on the SAME BOOM stayed put. That is a boom bent in
         the middle, and no reference aircraft has one — a rotor row on a boom
         sits level because the boom is straight.

         The clearance any station needs is therefore applied to EVERY rotor on
         that boom: the row rises together, to the height the most constrained
         station demands. */
      /* LEVEL THE BOOM, NOT THE HUBS. Taking the max ROTOR height across a
         boom forced every hub on it to one height — and RAVEN's are not at one
         height. On its sponson the tilting prop's hub sits 0.277 D up and the
         fixed prop's 0.211 D, because the tilting one stands on its tilt
         nacelle. That 0.066 D difference is a real part, not an unevenness to
         flatten.

         What must be common is the BOOM, since it is a single straight member.
         So the boom is placed at the highest level any station needs once its
         OWN stand-off is taken off, and each rotor then sits at its own RAVEN
         height above it. The tail-clearance lift that motivated levelling is
         still shared; the stand-offs stay per-rotor. */
      const standoff = (tilt) => hubAbove(boomR, tilt);
      const perBoom = new Map();
      for (const e of plan)
        perBoom.set(e.yb, Math.max(perBoom.get(e.yb) ?? -Infinity,
                                   e.zThis - standoff(e.tilt)));
      /* ── THE BOOM RISES WITH ITS ROTORS, SO THE MAST STAYS SHORT ───────
         When a row is lifted to clear the wing or the tail, only the ROTOR
         moved and the boom stayed under the wing — so the pylon between them
         stretched into a mast 0.313 D tall against RAVEN's 0.211 D stand-off,
         1.5x too long, and the aircraft grew stilts.

         RAVEN's hub stands a fixed 0.211 D above the sponson that carries it
         [SRC, its Prop5/Prop6 stack], and that stand-off is a property of the
         hub/spacer/motor parts, not of what the rotor has to clear. So when
         the row rises the BOOM rises with it and the mast keeps RAVEN's
         proportion — which is also what a real design does, since the boom is
         the structure and it is cheaper to move than to stilt every rotor. */
      const RAVEN_MAST_OVER_D = RAVEN_ROTOR_STACK.fixed.hub;   // 0.211 D
      for (const e of plan) {
        const zBoomHere = Math.max(zBoom, perBoom.get(e.yb));
        addRotor(e.st.x, e.yb, zBoomHere + standoff(e.tilt), e.tilt, !e.tilt, e.nm,
                 e.st.x, e.yb, zBoomHere, boomR);
        if (e.tilt) placedTilt++; else placedLift++;
      }
      /* Lift the boom bodies themselves to match, so the rotors still stand on
         the member that carries them rather than above it. */
      for (const b2 of bodies) {
        if (b2.kind !== "boom" || !/^Boom /.test(b2.label || "")) continue;
        const zRow = perBoom.get(b2.y);
        if (zRow == null) continue;
        const zNew = Math.max(zBoom, zRow);
        if (zNew > b2.z + 1e-6) {
          const zWas = b2.z;
          b2.z = zNew; if (b2.z0 != null) b2.z0 = zNew;
          /* A BOOM LIFTED OFF THE WING NEEDS A LEG TO STAND ON. Raising it so
             the mast keeps RAVEN's stand-off moves it above the wing plane it
             was resting on, and the connectivity gate correctly reported the
             whole boom as floating. The pylon that used to be implicit in the
             long mast is now an explicit member from the wing to the boom —
             the same load path, drawn where it actually is. */
          /* The foot must land ON the wing, between its LOCAL leading and
             trailing edges — the boom's own midpoint is not necessarily
             inside a swept, tapered chord, and at y = 5.77 it fell 0.17 m
             ahead of the leading edge. Clamped to the local chord, quarter
             chord back, which is where a pylon carries into a spar. */
          const yF = Math.max(-bW / 2, Math.min(bW / 2, b2.y));
          const leF = wingLEat(yF), chF = wingChordAt(yF);
          const xFoot = Math.min(Math.max((b2.x0 + b2.x1) / 2, leF + 0.25 * chF),
                                 leF + 0.75 * chF);
          bodies.push({ kind: "boom", label: `${b2.label} pylon`,
            x0: xFoot, x1: xFoot,
            y0: b2.y, y: b2.y, z0: zWas, z: zNew,
            radius: Math.max(0.6 * (b2.radius || 0.1), 0.05) });
        }
      }
      if (placedTilt !== tiltOnBooms || placedLift !== nStopped)
        splitRounded = { wantedTilt: tiltOnBooms, drawnTilt: placedTilt,
                         wantedLift: nStopped, drawnLift: placedLift };
    }

    /* ── NO BOOMS: ROTORS ON THE WING AND THE TAIL ─────────────────────
       configuration.js gives the tiltrotor "rotors on wing and tail, no lift
       booms", and that is Joby S4: four proprotors on the wing and TWO ON THE
       V-TAIL. The rear pair being aft is the whole point — an earlier version
       put them at the WINGTIPS instead, where they competed for the same
       lateral space as the wing row and overlapped it by 1.4 m.

       Six 3.34 m discs simply do not fit across a 13.1 m wing; they fit because
       two of them are somewhere else entirely. */
    if (wingMounted && onBooms > 0) {
      const isTilt = nStopped === 0;
      const nTailRot = (onBooms >= 6 && vtRef) ? 2 : 0;
      const nWingRot = onBooms - nTailRot;
      const zLE = zWing + L.boomRotorZoverD * D;
      const pitch = CLEAR * D;
      if (nWingRot > 1 && (nWingRot - 1) * pitch > 2 * halfB) overlapped = true;
      /* ── THE WHOLE-TILTING PAIR BELONGS AT THE WING TIP ───────────────
         The source is specific about where each mechanism sits: the nacelles
         that rotate entirely are the ones "on the ends of the main wing". That
         is not a styling detail, it is what makes the mechanism buildable.

         A nacelle hinged at mid-length puts HALF ITS LENGTH BELOW THE PIVOT
         when it stands up for hover. At a wing tip there is nothing under it
         and that is simply what a tiltrotor looks like — a V-22's nacelles
         hang below the wing in hover. At mid-span there IS something under it:
         the wing. Placed on even spacing this pair sat 1.9 m inboard of the
         tip and drove its nacelle straight through the wing, which is what the
         side view showed and what no check caught — the interference test
         looks at rotor DISCS against the wing, never at nacelle bodies.

         So the outermost pair is placed AT the tip and the rest are spaced
         inboard of it. The linkage stations are unaffected: their nacelles do
         not rotate, so nothing of them ever swings below the wing. */
      /* Stations are counted INWARD FROM THE TIP, one non-overlap pitch apart.
         That puts the whole-tilting pair exactly at the ends of the wing where
         the source places them, and every station inboard of it at the same
         spacing the disc clearance already requires — so the row cannot
         collide with itself and cannot drift onto the fuselage, which an
         even-spread about the centreline did on the first attempt. */
      const yMaxWing = halfB;
      for (let k = 0; k < nWingRot; k++) {
        const half = (nWingRot - 1) / 2;
        const rank = k - half;                       // -1.5 .. +1.5 for four
        const fromTip = half - Math.abs(rank);       // 0 at the tip, 1 next in
        const y = Math.sign(rank || 1) * (halfB - pitch * fromTip);
        /* A rotor whose station falls OUTBOARD of the wingtip has no wing in
           front of it to bolt to — the strut reaches past the tip into empty
           air. Those attach laterally to the tip instead, exactly as a tip
           rotor does. Six 3.3 m discs need 11.6 m of span on a 10.9 m wing, so
           the outer pair does land outside; `rotorsOverlap` already says the
           row is wider than the wing. */
        const yA = Math.abs(y) > halfB * 0.97 ? Math.sign(y) * halfB * 0.97 : y;
        /* Same wing-clearance rule as the boom rotors: zLE is a fixed fraction
           of ROTOR diameter above the wing plane, which says nothing about how
           THICK the wing is. On a large aircraft the inboard discs, which do
           lap the chord, ended up inside the wing envelope. */
        let zW = zLE;
        if (Math.abs(y) <= halfB) {
          const le = wingLEat(y), ch = wingChordAt(y);
          const xR = xWingLE - Rrot * 0.62;
          if (xR + Rrot > le && xR - Rrot < le + ch)
            zW = Math.max(zW, zWing + 0.5 * (Number(p.tc) || 0.15) * ch + 0.0775 * D);
        }
        /* ── A PROPROTOR PIVOTS ON THE WING, COLINEAR ─────────────────
           This placed the disc at a chosen station (0.62 R ahead of the root
           leading edge) and then hung it off an attach point at 0.20 chord,
           which are two different places: the installation reached 2.13 m aft
           and 0.36 m down, so `reachesSideways` fired and every proprotor was
           drawn as a ROD from the disc back to its hinge, with no nacelle at
           all. Six rotors, six rods.

           SWFT does not build it that way and neither does any tiltrotor. The
           pivot is a point ON THE WING, the nacelle straddles it, and the
           proprotor sits at the nacelle's leading edge — all on one line, so
           the whole installation swings as one rigid body about a lateral
           axis. Making the attach point the rotor's own station is what turns
           the rod into that nacelle: `reachesSideways` goes false and the
           lofted body is built instead.

           The disc station is therefore no longer free. It is the pivot, at
           RAVEN's measured chord fraction on the wing plane, plus the
           measured 0.2829 D stand-off along the tilt axis — which points up in
           hover and forward in cruise. */
        const leHere = wingLEat(yA), chHere = wingChordAt(yA);
        const isOutermost = Math.abs(Math.abs(y) - yMaxWing) < 1e-6;
        /* ── WHERE THE PIVOT GOES IS SET BY THE SWEPT ARC ─────────────────
           A nacelle hinged at mid-length rotates 90 degrees: its FORWARD half
           sweeps UP and its AFT half sweeps DOWN. Nothing may occupy the
           quarter-circle behind and below the pivot, because the aft half of
           the nacelle passes through it.

           THAT ARGUMENT ONLY BINDS WHERE THERE IS WING BEHIND THE PIVOT, and
           at the tip there is not. A V-22 or XV-15 mounts its tilting nacelle
           AT the wing tip and the wing TERMINATES there — the nacelle is the
           outboard end of the structure, so the quarter-circle behind and
           below it is open air whatever the chord fraction. That is why those
           aircraft carry the conversion axis near mid-chord and the wing sits
           at the nacelle's mid-height.

           An earlier pass here moved this pivot to the TRAILING EDGE. That was
           solving the mid-span case — real when the pair sat 1.9 m inboard of
           the tip, and gone once they were moved out to it. The cost was a
           nacelle hanging off the back of the wing, attached at its own nose
           rather than centred on the structure it pivots on. Mid-chord puts
           the wing back at the middle of the nacelle, which is both what the
           reference aircraft do and what the arc now permits.

           AND RAVEN'S 34.7% DOES NOT APPLY HERE, which is my error to correct.
           That fraction was measured on hinges whose rotors sit at 1.039 and
           1.042 b/2 — OUTBOARD OF THE WING TIP. At that station there is no
           wing in the arc at all, so the fraction is a longitudinal position
           for a rotor beside the wing and says nothing about one mounted on
           it. It is still used where it was measured: the hybrid's tip rotors,
           which are also outboard.

           THE LINKAGE STATIONS TAKE THE OPPOSITE END. Their nacelle never
           rotates, so no arc constrains it; what matters is that the body lies
           ALONG the wing instead of being buried in it, and that the head has
           somewhere to tilt. Pivoting at the LEADING EDGE puts the nacelle aft
           along the chord and swings the head up and forward into open air. */
        const xPivot = isOutermost ? leHere + 0.5 * chHere   // mid-chord
                                   : leHere;                // leading edge
        const zPivot = zWing + RAVEN_HINGE.tipHingeAboveWing * D;
        /* ── HOW FAR FORWARD THE DISC MUST SIT, AND WHY IT IS NOT SWFT'S ──
           SWFT's proprotor stands 0.2829 D from its pivot, and that is enough
           BECAUSE ITS ROTOR IS AT THE TIP — outboard of the wing, so the disc
           never shares a station with it. This layout distributes four rotors
           ALONG the wing, and there the stand-off is set by a constraint
           instead of a constant: when the nacelle rotates to cruise the disc
           becomes VERTICAL at the pivot's station less the stand-off, and a
           vertical disc over the wing cuts through the wing box.

           Applying SWFT's number here put the cruise disc 58 mm ahead of the
           local leading edge, and the interference gate reported the blades
           cutting the wing — correctly. The gate models a tilting disc with a
           0.06 R swept-thickness allowance, and this tool carries a standing
           5% rotor clearance (rotorTipClearFrac). Both are named quantities
           already in the codebase, so the stand-off is the larger of RAVEN's
           value and what those two demand:

               standoff >= (x_pivot - x_LE) + 0.06 R + 0.05 D

           A tip-mounted proprotor keeps RAVEN's number because the first term
           is what it is; a wing-mounted one gets the longer nacelle it needs. */
        const clearReq = (xPivot - leHere) + 0.06 * Rrot + 0.05 * D;
        const standoffT = Math.max(RAVEN_HINGE.hubAboveOverD.outboard * D, clearReq);
        const xDisc  = xPivot - RAVEN_HINGE.hubFwdOverD.outboard * D;
        const zDisc  = zPivot + standoffT;
        /* ── WHICH MECHANISM THIS STATION GETS ────────────────────────
           The S4 splits them by position, not uniformly: "the nacelles on the
           V-tail and on the ends of the main wing rotate to pivot thrust,
           while inboard nacelles on the main wing remain fixed and the
           propeller system of each has an articulated linkage that allows it
           to rotate."

           So the OUTERMOST wing pair tilts whole, and everything inboard of it
           runs a fixed nacelle with a tilting head. With four wing rotors that
           is 2 + 2, and with the V-tail pair also tilting whole it comes to
           the four-and-two the source states. */
        addRotor(xDisc, y, isTilt ? zDisc : zW, isTilt, !isTilt,
          `${isTilt ? "Tilt" : "Lift"} ${k + 1}`,
          isTilt ? xDisc : leHere + 0.20 * chHere,
          isTilt ? y : yA, zPivot, 0, "outboard", isOutermost);
      }
      /* Tail pair, out on the V-tail panels where Joby carries them — or on
         the STABILATOR when the aircraft has RAVEN's conventional tail, which
         is the horizontal surface that reaches out to a lateral station at
         all. Referencing the fin instead put them on a vertical panel of zero
         dihedral, so sin(gamma) was 0, both rotors landed at the fin root and
         the connectivity gate reported the whole tail installation floating. */
      if (nTailRot > 0) {
        const stab = bodies.find(b2 => b2.kind === "htail");
        const host = stab || vtRef;
        const gam = stab ? 0 : ((vtRef.dihedralDeg || 45) * Math.PI / 180);
        /* AT THE PANEL TIP, BECAUSE THE SURFACE HAS TO END AT THE NACELLE.
           This was a bare 0.88 with no source behind it, and at 88% of a 2.5:1
           tapered panel the local chord is 0.682 m while the nacelle is 1.710 m
           (0.6125 D at D = 2.79 m) -- two and a half times longer. The panel
           went in one side of the nacelle and out the other, leaving the tail
           as a stub poking through it. That is not a pivot that needs nudging:
           no fore-aft station fixes a body 2.5x the chord it is mounted on.

           The distinction that matters is not the overhang, which stays. It is
           whether the surface CONTINUES PAST the nacelle. At 88% the panel ran
           on outboard to 2.265 m and emerged the far side; at the tip it
           terminates at the nacelle, which then caps it -- the arrangement
           every production tiltrotor uses, V-22 and XV-15 both, where the wing
           ends at the tip nacelle and the nacelle is the outboard body.

           It also removes the one thing the wing rotors already had and this
           pair did not: the wing tip pair sits at halfB, its own tip. The tail
           was the odd one out at 0.88 for no stated reason. */
        const fOut = 1.0;                        // fraction along the panel
        const yT = stab
          ? (stab.span / 2) * fOut
          : vtRef.span * Math.cos(gam) * fOut;
        /* THE HUB MUST STAND OFF THE SKIN, like every other rotor here.
           This was the one placement that skipped the part stack: the hub was
           put at the point ON the panel, so it sat 0.00 m above the surface
           and in hover the disc plane passed straight THROUGH the V-tail —
           the blades would cut the tail off. Every other rotor on this
           aircraft is lifted by hubAbove(); this one now is too. */
        const zSurf = stab
          ? stab.z
          : vtRef.z + vtRef.span * Math.sin(gam) * fOut;
        const zT = zSurf + hubAbove(0);
        /* THE PIVOT SITS AT THE ROTOR'S OWN SPAN STATION. This carried a
           0.92 factor, putting the foot 8% inboard of the rotor and leaving a
           0.147 m lateral gap for the nacelle to span — the same defect as the
           wingtip's, found by the colinearity gate rather than by eye.

           A hinge with a LATERAL axis cannot swing a mass that is offset along
           that axis: the offset part does not travel the arc, it scribes a cone.
           So a lateral gap is a mechanism that does not work, whereas the
           FORE-AFT reach kept below is real structure — RAVEN's own sponsons
           carry their proprotors well ahead of the surface they mount to. */
        /* THE TAIL PAIR IS A PROPROTOR INSTALLATION TOO. When it tilts it
           gets the same colinear nacelle as the wing rotors, pivoting on the
           surface that carries it at the same measured chord fraction. When it
           does NOT tilt it keeps the fore-aft reach, which is real structure —
           RAVEN's sponsons carry fixed props well ahead of their mounting. */
        /* The V-tail nacelles tilt whole and sit near the panel tip, so they
           are the same case as the wing tips: the surface ends outboard of
           them, the arc is open, and the pivot belongs at mid-chord with the
           panel at the nacelle's mid-height. */
        /* THE PANEL IS SWEPT, SO THE ROOT IS THE WRONG PLACE TO MEASURE FROM.
           Every fore-aft station here was taken from host.x and host.rootChord
           — the ROOT leading edge and the ROOT chord — while the rotor sits at
           88% of the panel. On a V-tail swept 34.4 deg the local leading edge
           has moved 1.53 m aft by that station and the chord has shrunk from
           1.44 m to 0.68 m, so the pivot landed at x 6.71 against a panel that
           occupies 7.51..8.19 there: 0.80 m AHEAD of its own leading edge. The
           nacelle hung in front of the tail attached to nothing, which is
           exactly what it looked like.

           The comment above this one says the pivot sits at the rotor's own
           span station. That was made true LATERALLY and left false FORE-AFT.

           It is also the fourth time this file has measured a swept surface at
           its root — the wing pylon carried the identical defect three times.
           On a swept, tapered panel BOTH the leading edge and the chord are
           functions of span station, and a station taken at the root is
           correct only at the root. */
        const runT = stab ? (host.span / 2) * fOut : host.span * fOut;
        const leT = host.x
          + runT * Math.tan(((host.sweepDeg || 0) * Math.PI) / 180);
        const chT = host.rootChord
          + ((host.tipChord ?? host.rootChord) - host.rootChord) * fOut;
        const xPivT = leT + 0.5 * chT;
        const zPivT = zSurf + RAVEN_HINGE.tipHingeAboveWing * D;
        const xDiscT = xPivT - RAVEN_HINGE.hubFwdOverD.outboard * D;
        const zDiscT = zPivT + RAVEN_HINGE.hubAboveOverD.outboard * D;
        for (const sg of [-1, 1])
          addRotor(isTilt ? xDiscT : leT + chT * 0.30,
            sg * yT, isTilt ? zDiscT : zT, isTilt, !isTilt,
            sg < 0 ? "Tail rotor L" : "Tail rotor R",
            isTilt ? xDiscT : leT + chT * 0.55,
            sg * yT, isTilt ? zPivT : zSurf, 0, "outboard");
      }
    }

    /* Wingtip tilting pair, outboard of the tip on a lateral pylon — RAVEN. */
    if (nTip > 0) {
      /* SAME STACK AS EVERY OTHER ROTOR. This used RAVEN's tip-rotor fraction
         of diameter (0.261 D) while the boom rotors used the part stack, so on
         a 3.4 m rotor the tip pair sat 0.73 m higher than its neighbours — a
         visibly uneven row for no physical reason. The tip nacelle rests on the
         wingtip exactly as a boom nacelle rests on its boom. */
      /* THE PYLON MUST LAND ON THE WING AT ITS OWN SPAN STATION, NOT AT THE
         ROOT. This used the ROOT leading edge and the ROOT chord for both the
         disc position and the pylon foot, on a wing with 9.6 deg of sweep and
         0.45 taper. At y = 0.97 b/2 the local leading edge has moved 2.06 m
         aft, so the pylon foot landed 1.09 m AHEAD of the wing and the tip
         pair hung in open air with a strut pointing at nothing.

         This is the third time this exact mistake has been found in this file
         - boom pylons, then the V-tail, now the tip rotors - which is why
         `wingLEat` and `wingChordAt` exist and why the gate below now proves
         every strut foot lies between the local leading and trailing edges
         rather than trusting that it does. */
      /* ── NOTHING SPANS ANYTHING AT THE TIP ─────────────────────────
         RAVEN's tip nacelle is offset from its hinge by Y 0.0000, Z 0.0000
         with zero rotation, and the prop is forward of it on the same axis.
         The hinge is therefore AT the rotor's own lateral station — not at a
         foot 0.97 b/2 inboard, which is where this file put it and which is
         the only reason a diagonal member existed. See RAVEN_HINGE. */
      const leTip    = wingLEat(halfB);            // LE at the TIP, sweep applied
      const cTip     = wingChordAt(halfB);         // chord at the TIP, taper applied
      /* ── RAVEN'S TIP ROTORS SIT HIGH, AND THAT IS MEASURED TWICE ──────
         This was changed to the part stack on the reasoning that RAVEN's
         0.261 D "put the tip pair 0.73 m higher than its neighbours — a
         visibly uneven row for no physical reason". The neighbours have since
         acquired a physical reason: boom rotors are lifted to clear the wing
         and the V-tail, and on the hybridPusher they now stand at 0.329 D
         while the tips sat at 0.098 D. The row is uneven again, in the
         opposite direction, and now it disagrees with the reference too.

         RAVEN's value is measured twice over: tipRotorZoverD = 0.261 from
         v01_003, and SWFT's outboard hinge puts its hub +0.2829 D above the
         pivot. Two vehicles, 8% apart. The stand-off is taken as the LARGER
         of RAVEN's fraction and the part stack, so a tip rotor can never sit
         below the structure it stands on while still keeping NASA's height. */
      /* The pivot: RAVEN's chord station, on the wing plane. Both releases. */
      const xHingeT = leTip + RAVEN_HINGE.tipHingeChordFrac * cTip;
      const zHingeT = zWing + RAVEN_HINGE.tipHingeAboveWing * D;
      /* The hub, 0.26 D from that pivot ALONG THE AXIS. Authored in hover,
         where the axis is vertical; the hinge swings it forward for cruise.
         `xTipR` is no longer a free choice — the pivot and the stand-off fix
         it, which is why the old `leTip - 0.22 R` is gone. */
      const zTip  = zHingeT + RAVEN_HINGE.hubAboveOverD.outboard * D;
      const xTipR = xHingeT - RAVEN_HINGE.hubFwdOverD.outboard * D;
      /* ── HOW FAR OUTBOARD OF THE TIP, AND WHY NOT A SPAN RATIO ────────
         `tipRotorYoverHalfSpan` = 1.0392 / 1.0422 is measured on both
         releases and is the tighter of the two candidate normalisers (7.7%
         apart, against 17.4% for the same overhang expressed in rotor
         diameters). That comparison is worth nothing here: both reference
         vehicles sit at D/b = 0.28-0.31, ours at 0.094, and two points that
         close together cannot separate the two laws. Extrapolating either one
         to a third of their D/b is unsupported.

         So the ratio is kept as the nominal station and CONSTRAINED by
         something that is not fitted at all. Measure the overhang against the
         nacelle's own half-width (0.155 D / 2 = 0.0775 D):

             v01_003   overhang 0.0631 D   pod half-width 0.0775 D
             SWFT      overhang 0.0741 D   pod half-width 0.0775 D

         Both aircraft put the axis outboard by JUST UNDER the pod's own
         half-width — the nacelle's inboard skin lands on the tip rib, which is
         what carries the pivot. That is a load path, not a correlation.

         The min() reproduces RAVEN exactly on RAVEN (its span ratio is the
         smaller term on both vehicles) and binds only where the ratio is
         unsupported. Unconstrained it put our hybrid's pivot 0.506 m outboard
         of the tip with a 0.184 m pod to bridge it: a hinge attached to air,
         which is what the connectivity gate reported once it began posing the
         bodies instead of testing the authored numbers. */
      const yTipOff = Math.min((L.tipRotorYoverHalfSpan - 1) * halfB,
                               0.5 * 0.155 * D);
      for (let i = 0; i < nTip; i++) {
        const sg = i === 0 ? -1 : 1;
        const yT = sg * (halfB + yTipOff);
        /* attach == the rotor's own x and y: colinear, so no member is built. */
        addRotor(xTipR, yT, zTip, true, false,
          sg < 0 ? "Tip rotor L" : "Tip rotor R",
          xTipR, yT, zHingeT, 0, "outboard");
      }
    }

    /* PUSHER at the tail cone, on the centreline. */
    if (cfg.hasCruiseProp) {
      const dP = Number(p.cruisePropDiam) ? Number(p.cruisePropDiam) : D * 0.72;
      /* ON THE THRUST LINE, BEHIND THE TAIL. The height was previously an
         invented fraction of the tail offset; a propeller runs on the body
         axis, which on this fuselage rises with the tail upsweep. */
      const st = fusStations();
      const zAxis = st[st.length - 1].dz ?? 0;
      /* CLEAR WHATEVER TAIL THIS AIRCRAFT HAS. This looked only for a
         `vtail`, so the moment the conventional tail was built there was
         nothing to find and the pusher fell back to 0.995 fL — 40 mm inside
         the aft lift rotors, which the interference check caught. The pusher
         must sit behind the aft-most tail surface, whichever kind it is. */
      /* CLEAR THE TAIL WHERE THE PUSHER ACTUALLY IS, WHICH IS y = 0. This took
         the tail's maximum aft extent INCLUDING its swept tip, and a V-tail
         tip swept 34 deg sits a metre further back than its root. The pusher
         was pushed to x 10.58 on a 9.41 m fuselage — a 1.45 m shaft sticking
         out behind the aeroplane. On the centreline the tail ends at its ROOT
         trailing edge, and that is what a centreline propeller has to clear. */
      const tailTE = bodies
        .filter(b2 => b2.kind === "vtail" || b2.kind === "vfin" || b2.kind === "htail")
        .reduce((m, b2) => Math.max(m, b2.x + b2.rootChord), 0);
      const xPush = Math.max(fL * 0.995, tailTE > 0 ? tailTE + 0.05 * D : fL * 0.995);
      /* A PUSHER NEEDS A SHAFT. It sits AFT of the tail cone so the tail can
         be ahead of the disc, which left it hanging in space with nothing
         joining it to the aeroplane — a propeller is not self-supporting. The
         spinner/shaft from the tail cone to the hub is the load path. */
      bodies.push({ kind: "boom", label: "Pusher shaft",
        x0: Math.min(fL * 0.97, xPush - 0.12 * D), x1: xPush, y0: 0, y: 0, z: zAxis, z0: zAxis,
        radius: Math.max(0.05 * dP, 0.06) });
      bodies.push({ kind: "pusher", label: "Cruise pusher", x: xPush, y: 0,
        z: zAxis, radius: dP / 2,
        blades: Math.max(2, Math.round(p.nBlades ?? 3)) });
    }
  }

  /* =====================================================================
     COLLISION REPORT — the design faults a picture hides
     =====================================================================
     A drawing will happily show a propeller passing through a tail. These are
     the interferences that actually matter on this layout, checked in 3D and
     reported by name so the user is told WHICH parts foul rather than being
     left to spot it by rotating the model.

     Clearance is NASA's own: across all fifteen rotor pairs in RAVEN the
     tightest centre distance is 1.158 diameters, where touching is 1.000. */
  /* Same rule the ring geometry and the mass model use — coaxial.js is the
     single home for it, so the collision test cannot disagree with what was
     drawn. */
  const interleavedRing = interleavedFor(p?.configType,
                            cfg?.nRotors ?? p?.nPropHover, p);
  const collisions = [];
  const rotors = bodies.filter(b => b.kind === "rotor" || b.kind === "pusher");

  /* 1. Disc against disc. */
  for (let i = 0; i < rotors.length; i++)
    for (let j = i + 1; j < rotors.length; j++) {
      const a1 = rotors[i], b1 = rotors[j];
      const d = Math.hypot(a1.x - b1.x, a1.y - b1.y, a1.z - b1.z);
      const need = a1.radius + b1.radius;
      /* ── INTERMESHING OVERLAP IS THE DESIGN, NOT A COLLISION ──────────
         A side-by-side helicopter's discs overlap on purpose. NASA call it
         the aircraft's defining feature — "its overlapping and intermeshing
         pair of main rotors, which act as a single lifting and thrusting
         actuator" (AIAA 2018-3847) — and it is what buys the cruise
         efficiency this tool takes from their published L/De.

         THEY DO NOT CLEAR BY HEIGHT; THEY CLEAR BY PHASE. The same paper:
         "The intermeshing rotors must remain synchronized, and this is
         typically a low-power, low-torque condition." The blades are timed so
         two never occupy the overlap at once, which is why a synchropter can
         do what a plain twin cannot. A plan-view distance test cannot see
         that, so it read the intended geometry as a strike.

         The exemption is narrow: only this layout, only between its two main
         rotors, and only as far as the measured separation — anything closer
         than the measured l/D would still fail, and every other pair on every
         other layout is checked exactly as before. */
      const intermeshed = cfg.key === "sideBySide"
        && a1.kind === "rotor" && b1.kind === "rotor";
      /* ── AN INTERLEAVED RING CLEARS BY HEIGHT, NOT BY PHASE ────────────
         Different mechanism from the synchropter above, and it needs a
         different test. A side-by-side times its blades so two never occupy
         the overlap at once; an interleaved multicopter simply puts adjacent
         nacelles at two levels — Volocopter's photographs of the VoloCity
         show exactly that, and it is what makes its 32% plan overlap
         buildable and is already the justification provenance.js gives for
         permitting the overlap at all.

         So for these pairs the question is VERTICAL separation against the
         same disc-to-disc clearance this codebase requires between the two
         discs of a coaxial pair — not plan distance, which will always read
         as a strike on a geometry that overlaps on purpose.

         Narrow, like the one above: only a multicopter that is actually
         interleaving, only rotor-rotor, and a pair that does NOT clear
         vertically still fails, which is what the second push below is for. */
      const interleavedPair = interleavedRing && cfg.key === "multicopter"
        && a1.kind === "rotor" && b1.kind === "rotor";
      const dzPair = Math.abs(a1.z - b1.z);
      const needDz = COAX_DISK_GAP_OVER_D * 2 * Math.max(a1.radius, b1.radius);
      const clearsByHeight = interleavedPair && dzPair >= needDz * 0.98;
      if (interleavedPair && d < need && !clearsByHeight)
        collisions.push({ kind: "rotor-rotor", a: a1.label, b: b1.label,
          detail: `interleaved pair overlaps in plan but is only `
                + `${dzPair.toFixed(2)} m apart vertically, needs ${needDz.toFixed(2)} m` });
      if (d < need && !intermeshed && !interleavedPair)
        collisions.push({ kind: "rotor-rotor", a: a1.label, b: b1.label,
          detail: `centres ${d.toFixed(2)} m apart, discs need ${need.toFixed(2)} m` });
      if (intermeshed && d < SBS_HUB_SEP_OVER_D * (a1.radius + b1.radius) * 0.98)
        collisions.push({ kind: "rotor-rotor", a: a1.label, b: b1.label,
          detail: `intermeshing pair ${d.toFixed(2)} m apart, closer than the `
                + `measured ${SBS_HUB_SEP_OVER_D} D separation` });
    }

  /* 2. Pusher against the V-tail. The disc lies in the y-z plane at its own x
        station; each tail panel is a line from the root going out and up at the
        dihedral. If the tail chord does not reach the disc station they cannot
        touch at all, which is the usual and correct outcome. */
  const vt = bodies.find(b => b.kind === "vtail");
  const push = bodies.find(b => b.kind === "pusher");
  if (vt && push) {
    const spansX = push.x >= vt.x && push.x <= vt.x + vt.rootChord;
    if (spansX) {
      const g = (vt.dihedralDeg || 45) * Math.PI / 180;
      /* Distance from the disc centre (0, push.z) to the panel line through
         (0, vt.z) with direction (cos g, sin g), in the y-z plane. */
      /* THE PANEL IS A RAY FROM THE ROOT, NOT AN INFINITE LINE. Measuring to
         the line reported a foul whenever the tail was mounted high, because
         the line continues DOWN through the disc on the far side of the root —
         where there is no aeroplane. Project onto the ray and clamp at the
         root, which for a tail above the propeller makes the root itself the
         nearest point. */
      const dy = 0 - 0, dz = push.z - vt.z;          // disc centre relative to root
      const t = Math.max(0, dy * Math.cos(g) + dz * Math.sin(g));
      const cy = t * Math.cos(g), cz = t * Math.sin(g);
      const dist = Math.hypot(dy - cy, dz - cz);
      if (dist < push.radius)
        collisions.push({ kind: "pusher-vtail", a: "Cruise pusher", b: "V-tail",
          detail: `nearest tail point ${dist.toFixed(2)} m from the thrust line, `
                + `disc radius ${push.radius.toFixed(2)} m `
                + `(tail root ${(vt.z - push.z).toFixed(2)} m above it)` });
    }
  }

  /* 3. Any disc against the wing box it is not mounted on. A rotor sits above
        the wing plane by design; one whose disc reaches down through the wing
        would be cutting its own aircraft. */
  const wing = bodies.find(b => b.kind === "wing");
  if (wing) {
    const halfT = Math.max(wing.rootChord, wing.tipChord) * (wing.thickRatio || 0.15) / 2;
    for (const r of rotors) {
      /* A DISC HAS AN ORIENTATION. A lift rotor turns in the horizontal plane,
         so it sweeps x and y and has almost no extent in z — treating it as a
         sphere of radius R reported every boom-mounted lift rotor as cutting
         through the wing, which is nonsense. Only a rotor drawn in its CRUISE
         attitude (tilting, or the pusher) has a vertical disc that can reach
         down into the wing box. */
      const vertical = r.tilting || r.kind === "pusher";
      /* ── A TILTING DISC IS VERTICAL IN CRUISE, WHERE THE HINGE PUTS IT ──
         This read the AUTHORED position as though it were the cruise pose.
         Tilting rotors are authored in HOVER (see tiltAngleRad in mesh.js), so
         the vertical disc was being tested at the horizontal disc's station —
         two different places, and the test happened to pass only while the
         installation was drawn as a rod that put the disc far forward.

         The vertical disc actually sits at the pivot less the stand-off,
         swung through the arc the hinge defines. That is where it can cut the
         wing, and that is where it is now checked.

         AND AGAINST THE LOCAL CHORD, NOT THE ROOT. A swept, tapered wing's
         leading edge moves aft with span, so a root-chord box overstates how
         much wing sits under an outboard rotor. The disc only has to clear the
         wing AT ITS OWN STATION. */
      const standoffR = (r.tilting && r.hinge)
        ? Math.hypot(r.x - r.hinge.x, r.z - r.hinge.z) : 0;
      const xDiscHere = (r.tilting && r.hinge) ? r.hinge.x - standoffR : r.x;
      const zDiscHere = (r.tilting && r.hinge) ? r.hinge.z : r.z;
      const leLocal = Math.abs(r.y) <= wing.span / 2 ? wingLEat(Math.abs(r.y)) : wing.x;
      const chLocal = Math.abs(r.y) <= wing.span / 2
        ? wingChordAt(Math.abs(r.y)) : wing.tipChord;
      const zLow = vertical ? zDiscHere - r.radius : r.z - 0.06 * r.radius;
      const halfSpanY = vertical ? 0.06 * r.radius : r.radius;
      const halfX = vertical ? 0.06 * r.radius : r.radius;
      const overX = xDiscHere + halfX > leLocal && xDiscHere - halfX < leLocal + chLocal;
      const overY = Math.abs(r.y) - halfSpanY < wing.span / 2;
      if (overX && overY && zLow < wing.z - halfT && zDiscHere > wing.z - halfT)
        collisions.push({ kind: "rotor-wing", a: r.label, b: "Wing",
          detail: `disc at x ${xDiscHere.toFixed(2)} overlaps the local wing box `
                + `${leLocal.toFixed(2)}-${(leLocal + chLocal).toFixed(2)} m and reaches `
                + `${(wing.z - halfT - zLow).toFixed(2)} m below it` });
    }
  }

  /* Bounding box, for auto-fitting the view. */
  const xs = [0, fL], ys = [0], zs = [-fD / 2, fD * 0.9];
  for (const b of bodies) {
    if (b.kind === "wing" || b.kind === "vtail") {
      ys.push(b.span / 2, -b.span / 2); xs.push(b.x, b.x + b.rootChord); zs.push(b.z);
    } else if (b.kind === "boom") {
      xs.push(b.x0, b.x1); ys.push(b.y, b.y0 ?? b.y); zs.push(b.z);
    } else if (b.kind === "rotor" || b.kind === "pusher") {
      xs.push(b.x - b.radius, b.x + b.radius);
      ys.push(b.y - b.radius, b.y + b.radius); zs.push(b.z + b.radius, b.z - b.radius);
    } else if (b.stations) {
      xs.push(b.x0, b.x1);
      const w = Math.max(...b.stations.map(s => s.w));
      ys.push(b.y - w / 2, b.y + w / 2); zs.push(b.z - w / 2, b.z + w / 2);
    }
  }
  const extents = {
    xMin: Math.min(...xs), xMax: Math.max(...xs),
    yMin: Math.min(...ys), yMax: Math.max(...ys),
    zMin: Math.min(...zs), zMax: Math.max(...zs),
  };

  /* Now that the booms are placed, cut the control surfaces around them. */
  if (addWingControls) addWingControls();

  /* ── LANDING GEAR ───────────────────────────────────────────────────
     weights.js has been sizing a CS-27 gear and cg.js carrying it at
     0.52 fL all along, while this function drew none: the tool reported a
     mass for a component it never placed, and every aircraft it rendered
     stood on nothing. See gearlayout.js for why the placement uses only
     quantities the model had already committed to — NDARC treats gear
     location as an INPUT and RAVEN/SWFT publish no gear geom, so there is
     no station to measure and none is invented. */
  let gear = null;
  try {
    const gm = landingGear(p, { MTOW: SR.MTOW });
    /* Lowest structure the gear must hold clear of the ground. Rotors are
       excluded: a rotor disc is swept area, not a body that lands. */
    const zLow = Math.min(
      -fD / 2,
      ...bodies.filter(b => b.kind === "boom" || b.kind === "sponson" || b.kind === "nacelle")
               .map(b => (b.z ?? 0) - (b.radius ?? 0.1)));
    gear = gearLayout({
      gear: gm, fL, fD,
      xCG: Number.isFinite(SR.xCGtotal) ? SR.xCGtotal : 0.45 * fL,
      zLowest: zLow, zAttach: -fD / 2,
      noseLoadFrac: GEAR_CONSTANTS.noseLoadFrac,
      bWing: hasWing ? (Number(SR.bWing) || 0) : 0,
      raven: RAVEN_GEAR,
    });
    if (gear.applicable) {
      /* ── BOTH LEGS MOUNT ON THE FUSELAGE UNDERSIDE. RAVEN DOES. ────────
         A previous version of this block snapped the main gear onto the
         nearest BOOM, reasoning that a boom is the member already carrying
         rotor loads. That was wrong and it looked wrong: on this layout the
         booms sit at WING height, so the leg started at z = +1.19 and ran
         2.13 m straight down past the side of the fuselage. Gear appeared to
         hang off the wing.

         RAVEN puts its Main Gear at z = 0.053 m on a body whose centreline is
         at 0 — on the BODY, low down — and its Nose Gear at z = -0.272 m.
         Both legs come off the underside, which is also the only place the
         drop-test loads have a short path into structure. */
      const legR = Math.max(0.035, 0.045 * gear.rMain / 0.28);
      /* A LEG MUST START ON THE SKIN, NOT NEAR IT. The first version hung the
         strut tops at a fraction of the track at the body's maximum half-depth,
         and the geometry gate's "nothing floats" check caught all six layouts:
         at the gear station the section is neither that wide nor that deep, so
         every main leg began in free air. The attachment is now the point where
         the leg meets the FUSELAGE CROSS-SECTION at its own station — the same
         discipline the arms already follow in plan, applied in section. */
      const st = fusStations();
      const sectionAt = (x) => {
        const t = Math.max(0, Math.min(1, x / fL));
        let a = st[0], b = st[st.length - 1];
        for (let i = 0; i < st.length - 1; i++)
          if (t >= st[i].t && t <= st[i + 1].t) { a = st[i]; b = st[i + 1]; break; }
        const f2 = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
        return { w: a.w + (b.w - a.w) * f2, h: a.h + (b.h - a.h) * f2,
                 dz: a.dz + (b.dz - a.dz) * f2 };
      };
      /* Point on that elliptical section in the direction of the axle. */
      const skinPoint = (x, yTo, zTo) => {
        const S = sectionAt(x);
        const hw = Math.max(1e-3, S.w / 2), hh = Math.max(1e-3, S.h / 2);
        const phi = Math.atan2((zTo - S.dz) / hh, yTo / hw);
        return { y: hw * Math.cos(phi), z: S.dz + hh * Math.sin(phi) };
      };
      const addLeg = (x, y, zAxle, rTyre, wTyre, label) => {
        const a = skinPoint(x, y, zAxle);
        bodies.push({ kind: "boom", label: `${label} strut`,
          x0: x, x1: x, y0: a.y, y, z0: a.z, z: zAxle, radius: legR,
          /* RAVEN fairs its main legs — Main Gear Struts is a Wing geom, not a
             tube. Chord taken from the tyre it carries so it scales with the
             aircraft rather than being set. */
          chord: RAVEN_GEAR.strutChordOverTyreRadius * rTyre });
        bodies.push({ kind: "wheel", label, x, y, z: zAxle,
          radius: rTyre, width: wTyre });
      };
      for (let i = 0; i < gear.nMainWheels; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        addLeg(gear.xMain, side * gear.yMain, gear.zAxleMain,
               gear.rMain, gear.wMain, `Main gear ${i + 1}`);
      }
      for (let i = 0; i < gear.nNoseWheels; i++) {
        /* RAVEN'S NOSE LEG IS RAKED, NOT VERTICAL. Its Nose Gear Spar carries
           Y_Rotation = -40.25 deg, so the leg trails forward-down from a
           mounting well aft of the wheel. Drawn at RAVEN's rake, with the
           length falling out of the geometry rather than being set. */
        /* Rake measured off RAVEN's Nose Gear Spar (Y_Rotation -40.25 deg),
           applied about the ACTUAL skin attachment. The first version took the
           drop from a nominal -fD/2 rather than from the skin the leg lands
           on, and with the taller RoundedRect body that produced a 13 deg leg
           instead of 40 — a lollipop on a stick. Solved properly: find the
           skin point above the wheel, then lay the leg back at RAVEN's angle
           over the real vertical drop. */
        const rake = (RAVEN_GEAR.noseSparRakeDeg * Math.PI) / 180;
        /* Fixed point, because moving the mount forward changes the skin
           height there, which changes the drop, which moves the mount. One
           pass left the leg at 30 deg instead of 40; three converge. */
        /* THE MOUNT MUST STAY ON THE AEROPLANE. Raking by RAVEN's angle over
           the full drop put the top of the leg at x = -0.35 m on a body that
           starts at x = 0 — the nose leg was pinned to a point in front of the
           aircraft. RAVEN can rake 40 deg because its nose wheel is far enough
           aft to have body in front of it; ours sits at 0.082 fL. The mount is
           therefore clamped to the forward body, and the rake becomes whatever
           that allows — reported, not silently forced to a number the layout
           cannot support. */
        /* THE MOUNT MUST BE ON STRUCTURE, NOT ON THE NOSE CONE. Clamping it
           to a bare fraction of length put the top of the leg at 0.04 fL,
           which on RAVEN's RoundedRect profile is the pointed tip where the
           section is 6% of full width — the leg appeared to jut out of the
           nose. RAVEN can rake 40 deg because its nose wheel sits far enough
           aft to have real body ahead of it; ours is at 0.082 fL.

           The mount is therefore limited to the first station where the body
           reaches HALF its maximum width, which is where there is airframe to
           carry a landing load. If the rake would drive it forward of that,
           the leg stands vertical instead — an honest answer for a layout
           that cannot carry RAVEN's rake, rather than a raked leg pinned to
           the nose cone. */
        const stN = fusStations();
        const wMax = Math.max(...stN.map(st2 => st2.w));
        const firstSolid = (stN.find(st2 => st2.w >= 0.5 * wMax)?.t ?? 0.10) * fL;
        const xTopMin = firstSolid;
        let xTop = gear.xNose, an = skinPoint(xTop, 0, gear.zAxleNose);
        for (let it = 0; it < 4; it++) {
          const drop = Math.max(0.05, an.z - gear.zAxleNose);
          xTop = Math.max(xTopMin, gear.xNose - drop * Math.tan(rake));
          an = skinPoint(xTop, 0, gear.zAxleNose);
        }
        /* If the clamp swallowed the whole rake, stand the leg up rather than
           drawing one that leans the wrong way off the nose. */
        if (xTop >= gear.xNose - 1e-6) { xTop = gear.xNose; an = skinPoint(xTop, 0, gear.zAxleNose); }
        gear.noseRakeDrawnDeg = +(180 / Math.PI *
          Math.atan2(Math.abs(gear.xNose - xTop),
                     Math.max(1e-6, an.z - gear.zAxleNose))).toFixed(1);
        gear.noseLegVertical = Math.abs(xTop - gear.xNose) < 1e-6;
        bodies.push({ kind: "boom", label: `Nose gear ${i + 1} strut`,
          x0: xTop, x1: gear.xNose, y0: an.y, y: 0,
          z0: an.z, z: gear.zAxleNose,
          radius: Math.max(0.03, RAVEN_GEAR.noseSparDiaOverTyre * gear.rNose),
          chord: RAVEN_GEAR.strutChordOverTyreRadius * gear.rNose });
        bodies.push({ kind: "wheel", label: `Nose gear ${i + 1}`,
          x: gear.xNose, y: 0, z: gear.zAxleNose,
          radius: gear.rNose, width: gear.wNose });
      }
    }
    /* extents were taken before the gear existed; the wheels are now the
       lowest thing on the aircraft, so the view would clip them. */
    if (gear?.applicable) {
      extents.zMin = Math.min(extents.zMin, gear.zGround);
      extents.yMin = Math.min(extents.yMin, -gear.yMain - gear.wMain / 2);
      extents.yMax = Math.max(extents.yMax, gear.yMain + gear.wMain / 2);
      extents.xMin = Math.min(extents.xMin, gear.xNose - gear.rNose);
      extents.xMax = Math.max(extents.xMax, gear.xMain + gear.rMain);
    }
  } catch { gear = null; }

  /* The ground plane exists now, so the ventral fin can be sized against it. */
  if (addVentralFin) addVentralFin();

  const nRot = bodies.filter(b => b.kind === "rotor").length;
  return {
    gear,
    bodies, extents, config: cfg, layout: NASA_LAYOUT,
    rotorsOverlap: overlapped,
    collisions,
    boomCountMismatch, boomStretched, tailArmShort, splitRounded,
    counts: { rotors: nRot, tilting: cfg.nTilting ?? 0, stopped: cfg.nStopped ?? 0,
              sponsons: bodies.filter(b => b.kind === "sponson").length,
              nacelles: bodies.filter(b => b.kind === "nacelle").length },
    note: `${cfg.label} — ${nRot} rotors (${cfg.nTilting ?? 0} tilting, ${cfg.nStopped ?? 0} stopped)`
        + `${hasWing ? `, wing span ${bW.toFixed(2)} m` : ", no wing (rotor-borne)"}`
        + `${cfg.hasCruiseProp ? ", separate pusher" : ""}`
        + ` — laid out on NASA's RAVEN/SWFT station fractions, scaled to these parameters`,
  };
}
