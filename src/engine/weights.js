import { boomStructure } from "./booms.js";
import { fuselageWettedArea } from "./constants.js";
import { driveFailure } from "./drivefailure.js";
import { CONFIG_DEFAULTS } from "./configuration.js";
import { landingGear } from "./landinggear.js";
import { avionics } from "./avionics.js";
import { resolveConfiguration, capabilitiesFor } from "./configuration.js";
import { propulsionSizingConditions } from "./sizing-conditions.js";
import { motorTransientRequirement } from "./motor.js";
import { driveSystem } from "./drivesystem.js";
import { nacelleGroup } from "./nacelle.js";
import { motorMass } from "./motormass.js";
import { ROTOR_FLAP_FREQ, rotorGroup } from "./rotorgroup.js";
import { flightControls as flightControlsGroup } from "./flightcontrols.js";

/* =====================================================================
   WEIGHT MODEL
   Component weight buildup. Pure: no DOM, no React, no I/O.
   ===================================================================== */

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENT WEIGHT BUILDUP
   ═══════════════════════════════════════════════════════════════════════
   Replaces  Wempty = ewf · MTOW  with a geometry-driven group buildup, so
   empty weight becomes a RESULT rather than an input guess.

   Why this matters: validation against published aircraft showed MTOW error
   tracking the ewf guess almost one-for-one (Joby implies 0.51, Archer 0.65).
   With a fixed 0.50 default the model was right for Joby by coincidence and
   52% low for Archer.

   PROVENANCE OF EVERY NUMBER — three categories, never blurred:
     [EQ]   published statistical equation, cited inline
     [FRAC] mass fraction from published light-aircraft practice, cited
     [CAL]  calibration constant with NO published source. These are the
            model's honest weak points. Do not quietly tune them to make a
            validation number look good — if one changes, say so.

   Raymer equations are imperial; conversion happens inside this function so
   callers stay in SI.

   Ref: Raymer, "Aircraft Design: A Conceptual Approach", 6th ed., Ch. 15
        (General Aviation statistical group weights, Eq. 15.46 / 15.48)
        Roskam, "Airplane Design Part V" (light-aircraft mass fractions)
   ═══════════════════════════════════════════════════════════════════════ */
export const WEIGHT_CONSTANTS = {
  // [EQ] composite construction credits — Raymer §15.2 gives 0.85–0.90
  compositeWing:        0.85,
  compositeFuselage:    0.90,
  /* ── DEAD CONSTANT, KEPT ONLY AS A LABEL ─────────────────────────────
     `gearFracMTOW` IS NOT USED. Landing gear is sized by engine/landinggear.js
     from CS-27.725 drop-test energy absorption, per EASA SC-VTOL MOC-4 Issue 2.
     This 4% fraction is the superseded model and survives only in that file's
     header comment.

     It is tagged here because the 2026-08-30 method-fidelity audit read the
     [FRAC] tag on this line and flagged landing gear as a method mismatch
     needing migration to NDARC AFDD §29-5. That was WRONG twice over: the
     constant is dead, and the live model is sized to the aircraft's actual
     CERTIFICATION BASIS — which for an eVTOL is a better reference class than
     a helicopter weight regression, not a worse one. A provenance tag on dead
     code is worse than no tag, so this one says so. */
  gearFracMTOW:         0.040,   // UNUSED — see note above
  // [FRAC] systems, fractions of MTOW
  flightControlsFrac:   0.025,  // fly-by-wire, Roskam light aircraft
  /* ── ELECTRICAL AND ENVIRONMENTAL, CALIBRATED TO NASA'S PUBLISHED TOTAL ──
     Were 3.0% and 1.5% of MTOW, flat, with no source beyond a comment saying
     "elevated vs GA". Together 4.5% of MTOW, and they were the residual
     suspect once the avionics buildup was corroborated against FLOPS Eq.108
     (within 4%) and the furnishings seat term was sourced to NASA's 23 lb.

     NO EXTERNAL MODEL EXISTS FOR THIS CLASS, and that was checked properly:
       - NDARC sec.9 gives the electrical group as a SUM OF INPUT COMPONENTS
         (supply, conversion, distribution, lights, supports) — structure, not
         a regression. Same for avionics and furnishings.
       - FLOPS has two electrical equations that disagree by 3.5x here (Eq.106
         transport ~513 kg, Eq.107 short-form ~147 kg for a Joby-sized
         aircraft, against ~89 kg here). Both are fitted to conventional
         aircraft whose electrical architecture is nothing like a
         distributed-electric one. Importing either would be worse than what
         is here. NOT USED.

     SO THEY ARE BACKED OUT OF NASA'S OWN PUBLISHED SYSTEMS TOTAL, which is the
     only ground truth available. Table 12 systems minus the two components now
     independently sourced (avionics 92.5 kg, furnishings 15 kg/seat) leaves,
     for electrical + environmental + instruments + hydraulics + APU + lights:
         Quad-E 60.6 kg = 2.06% MTOW
         SbS-E  47.5 kg = 2.14%
         L+C-E  62.4 kg = 1.68%      mean 1.96%, and a tight spread
     against the 4.50% this model carried — a factor of 2.3.

     THIS ALSO RESOLVES THE GROUP BOUNDARY, by contradiction rather than by
     preference. Doing the same subtraction with flight controls counted INSIDE
     the systems total leaves 11.6 / 5.3 / **-6.5** kg. A negative electrical
     group is impossible, so NASA's `systems_lb` EXCLUDES flight controls.
     That had been an open ambiguity reported as a range.

     [CAL] against NASA/TM-20210017971 Table 12, n=3. The SPLIT between
     electrical and environmental is [LAY] — the 2:1 ratio of the old values is
     kept because nothing published separates them, and these two terms must
     now also carry the instruments, hydraulics, APU and load-handling groups
     that this engine has no separate model for. */
  electricalFrac:       0.0131,  // [CAL] 2/3 of the 1.96% backed out of Table 12
  ecsAntiIceFrac:       0.0065,  // [CAL] 1/3 — split [LAY], total is what is calibrated
  // [FRAC] fixed / per-seat items
  avionicsKg:           45,     // IFR suite + eVTOL sensors, Raymer GA uninstalled
  /* ── FURNISHINGS PER SEAT, NOW WITH THE SOURCED PART SEPARATED ────────
     Was a flat 15 kg/seat with no source anywhere. NDARC sec.8 gives the FORM —
     furnishings = accommodation (seats) + miscellaneous + trim and insulation
     + emergency equipment, with `Waccom = (Useat + Uaccom + Uox) x Nseat` —
     but the per-unit values are NDARC INPUTS, so the structure is sourced and
     the numbers are not.
     THE SEAT NUMBER IS NOW SOURCED: NASA (Silva 2024, "Design Implications of
     UAM Vehicles Performing Public Good Missions") price removable seats as
     "a reduction in furnishings weight of 4 seats at 23 lb each" — 23 lb =
     10.43 kg per seat, for a UAM aircraft of exactly this class.
     The remainder (trim, insulation, emergency equipment) has no published
     value for an eVTOL, so it stays [LAY] and is kept VISIBLE as its own term
     rather than buried in a single rounded 15. */
  furnishingsSeatKg: 10.43,        // [SRC] NASA Silva 2024: 23 lb per seat
  furnishingsOtherKgPerSeat: 4.57, // [LAY] trim, insulation, emergency — unpublished
  furnishingsKgPerSeat: 15,        // retained = 10.43 + 4.57, so behaviour is unchanged
  // [CAL] propulsion specific powers — order-of-magnitude support from the
  // component database in Components.jsx (EMRAX 6.9–11.7, H3X 13.3 kW/kg),
  // derated here for mounts, cooling and installation.
  motorSpecPowerKWkg:    5.0,
  /* [SRC] NASA/TM-20210017971 6.1.2.2 — the tech factor applied to the motor
     torque regression in their final NDARC model. */
  motorTechFactor:       1.322,
  /* [CAL] EMRAX axial-flux fit, W_kg = a * tau_Nm^b, from the four EMRAX
     entries in src/Components.jsx. Worst residual 9.3% over n=4. */
  emraxA: 0.5591, emraxB: 0.6266,
  motorTorqueDensityNmKg: 49,   // [SRC] Joby propulsion motor, rated torque density
  inverterSpecPowerKWkg: 20.0,
  // [CAL] NO published basis — first-order guesses, flagged as such
  rotorMassPerDiskAreaKgM2: 2.0,   // blades + hub, composite
  boomMassPerMetreKgM:      2.5,   // composite tube, per boom
  boomLengthFracFusLen:     0.70,  // boom length as a fraction of fuselage length
  boomCount:                2,
  /* [CAL] STRUCTURAL TECHNOLOGY FACTOR
     WAS 1.409 — a 41% blanket multiplier on every structural group. That was
     never a technology factor, it was a REFERENCE-CLASS error: the wing used
     Raymer Eq.15.46, a regression on metal fuel-burning light aircraft.
     Replacing the wing with NDARC AFDD93 (section 29-1.2 — the model NASA uses
     for the UAM Lift+Cruise) and refitting drove the factor to 1.001, i.e. the
     fudge essentially vanished. That collapse is the evidence the swap was the
     right call; the number itself is now nearly inert.
     REMAINING: the fuselage still uses Raymer Eq.15.48 and gear/systems still
     use Roskam light-aircraft fractions, so this factor still silently absorbs
     those. Finish the migration to AFDD84 before trusting it.
     NASA's NDARC handles this with per-group "technology factors"; this is
     the same idea, reduced to one global multiplier so it stays honest with
     a small validation set.
     Applied to every scaling group, NOT to fixed items (avionics,
     furnishings) which do not scale with airframe technology.
     CALIBRATED, NOT DERIVED — refit any time with:  node validation/calibrate.mjs

     Adopted value 1.179, fitted 2026-08-24 against 3 aircraft (NASA UAM
     Lift+Cruise, Joby S4, Archer Midnight) AFTER the rotorcraft drag terms and
     the L/D loop closure were in place. Residuals at this fit are +15.4%,
     -14.0%, -23.7% — straddling zero rather than all-negative, which is what
     distinguishes "needs a level shift" from "missing physics". Before the
     drag fix the same fit was 1.414 with every residual negative.

     LIMITATIONS, stated plainly: one free parameter fitted to three aircraft.
     It is a level shift, not a prediction of structural technology, and it is
     only valid for winged lift+cruise / tiltrotor eVTOL in this weight class.
     Refit before trusting it on a new configuration. */
  structTechFactor:      1.001,
  /* [CAL] propulsion technology factor — calibrated separately from structure
     against the NASA Table 3 propulsion band (13.4-19.7% of MTOW). */
  propTechFactor:        1.000,
};

/* ── THE ULTIMATE LOAD FACTOR IS AN INPUT, SUPPLIED BY THE LOAD CASES ─
   This was a bare `const Nz = 5.25` ("ultimate load = 1.5 x 3.5g limit"),
   the sixth independent copy of the load factor in this codebase and the
   only one the engine's own load cases never fed. Two consequences, both
   measured on 2026-09-16 before this change:
     - a wingless layout, whose load cases give 3.0g ultimate (MOC VTOL.2200(f)
       floor), had its fuselage sized to 5.25g;
     - setting the manoeuvre limit to SC-VTOL's 2.0g floor moved the load
       cases to 3.9-5.1g and left MTOW IDENTICAL to the kilogram. The
       manoeuvre limit reached the wing-box detail design and nothing else.

   WHY WIRING IT IS THE INTENDED USE, NOT A RE-FIT. NDARC Theory (TP-2025,
   sec. on structural design gross weight): "The design ultimate load factor
   nzult at the structural design gross weight WSD is specified, in
   particular for use in the component weight estimates." AFDD93 and AFDD84
   carry nz as an explicit variable; it is a design input to the equation,
   not a property of the fitted population. NDARC's own input default is 6.0
   (Input manual, nz_ult). The value here is the design's own.

   The calibrated structTechFactor is undisturbed: it was fitted to L+C, Joby
   and Archer, all winged, and every winged layout's load cases give 5.25g at
   the default 3.5g manoeuvre limit - the same number as before.

   REQUIRED. There is no fallback: a silent 5.25 is exactly the defect this
   replaces. engine.js is the only caller and always passes it. */

/* Pure helper — exported so it can be unit-tested and swept independently. */
export function componentWeights(p, g, K = WEIGHT_CONSTANTS) {
  const LB = 2.20462, FT2 = 10.7639, FT = 3.28084, PSF = 0.0208854;
  const Nz    = g.nzUltimate;
  if (!(Number.isFinite(Nz) && Nz > 0))
    throw new Error("componentWeights: g.nzUltimate is required (got " + Nz + ")");
  const Wdg   = g.MTOW * LB;                // design gross weight, lb
  const q     = 0.5 * g.rhoCr * g.vCruise ** 2 * PSF;   // dynamic pressure, lb/ft²
  const cosL  = Math.max(0.5, Math.cos((g.sweepLE_deg || 0) * Math.PI / 180));

  /* ── Wing [EQ] ────────────────────────────────────────────────────────
     WAS Raymer Eq. 15.46 — a general-aviation regression fitted to METAL,
     FUEL-BURNING light aircraft. That is the wrong reference population for an
     eVTOL, and the evidence was sitting in this file: it came out uniformly
     light and needed a 1.409 blanket structTechFactor to close. A 41% fudge is
     not a technology factor, it is a reference-class error.

     NOW: NDARC AFDD93 aircraft-wing parametric model (Johnson, NDARC Theory,
     NASA TP-20220000355, section 29-1.2). This is the model NASA itself used
     for the UAM Lift+Cruise concept vehicle — Silva et al. 2018:
       "The wing was modeled using the standard NDARC fixed-wing parametric
        model (AFDD93), since the wing operates as a fixed-wing aircraft in
        forward flight and the lifting loads of the rotors are somewhat
        distributed."
     So a FIXED-WING wing model is correct here; the defect was using a light-GA
     one instead of the rotorcraft community's. NDARC quotes 3.4% average error
     over 25 fixed-wing aircraft for this equation.

       w_wing = 5.66411 f_LGloc [W_SD f_L /(1000 cos Lambda)]^0.847
                n_z^0.39579 S_w^0.21754 A_w^0.50016
                ((1+lambda_w)/tau_w)^0.09359 (1 - b_fold)^-0.14356

     Imperial throughout: W_SD in lb, S_w in ft^2, result in lb.
     f_LGloc = 1.7247 if the landing gear is ON THE WING, else 1.0.
     f_L is the lift factor (wing/rotor lift share). In cruise a lift+cruise or
     tiltrotor eVTOL is fully wing-borne, so f_L = 1.0; lower it only for a
     compound that offloads lift to the rotors in cruise.
     b_fold = 0 (no wing fold on these configurations).

     NOTE the grouping is (1 + taper)/THICKNESS, not (1+taper)/taper — the two
     are easy to confuse and the ASCII text extraction of the manual mangles it. */
  const Sw       = Math.max(1, g.Swing * FT2);
  const fLGloc_w = p.gearOnWing === true ? 1.7247 : 1.0;
  const fLift    = p.wingLiftFactor ?? 1.0;
  const bFold    = p.wingFoldFrac ?? 0;
  const wing_lb = 5.66411 * fLGloc_w
    * Math.pow(Math.max(1e-3, Wdg * fLift / (1000 * cosL)), 0.847)
    * Math.pow(Math.max(1, Nz), 0.39579)
    * Math.pow(Sw, 0.21754)
    * Math.pow(Math.max(1, p.AR), 0.50016)
    * Math.pow((1 + Math.max(0.05, p.taper)) / Math.max(0.04, p.tc), 0.09359)
    * Math.pow(Math.max(0.05, 1 - bFold), -0.14356);
  /* NO WING, NO WING WEIGHT. AFDD93 does not vanish at S=0 — its leading
     bracket is [W_SD f_L/(1000 cos L)]^0.847, which depends on gross weight,
     not on wing area, so a "wingless" aircraft was still being charged ~386 kg
     of wing. NDARC handles this structurally: nWing=0 means the wing group
     does not exist, it is not an equation evaluated at zero. */
  const wing = (g.hasWing === false) ? 0 : (wing_lb / LB) * K.compositeWing;

  /* ── Fuselage [EQ] Raymer Eq. 15.48, unpressurised (ΔP term = 0) ────── */
  const lamF   = Math.max(2, p.fusLen / p.fusDiam);
  /* ONE WETTED AREA, NOT TWO. This was the bare cylinder pi*D*L = 37.3 m2 for
     the default body, while engine.js:595 forms the SAME fuselage's wetted
     area for DRAG with Raymer's fineness correction,
         S = pi D L (1 - 2/lf)^(2/3) (1 + 1/lf^2),
     which gives 26.1 m2. The weight model therefore saw a body 43% larger
     than the drag model did -- the one-quantity-derived-twice defect this
     codebase keeps finding, in a third place. AFDD84's exponent is only
     0.1676, so the mass effect is ~6%, but the two modules now disagree on
     nothing. */
  /* ONE FORM, ONE HOME. See fuselageWettedArea in constants.js for why a bare
     Raymer expression here broke the VoloCity check: the fit is invalid below
     fineness 2.5 and a multicopter pod lives there. */
  const Swf_m2 = fuselageWettedArea(p.fusLen, p.fusDiam)
    * Math.pow(Math.max(1 - 2 / lamF, 0.05), 2 / 3) * (1 + 1 / (lamF * lamF));
  const Sf     = Math.max(1, Swf_m2 * FT2);
  const Lt_ft  = Math.max(1, g.lv * FT);
  const fus_lb = 0.052
    * Math.pow(Sf, 1.086)
    * Math.pow(Nz * Wdg, 0.177)
    * Math.pow(Lt_ft, -0.051)
    * Math.pow(lamF, -0.072)
    * Math.pow(Math.max(q, 1), 0.241);
  /* ── AFDD84 — RECOVERED 2026-08-26, AND IT REPLACES A REFERENCE-CLASS ERROR
     Raymer Eq.15.48 above is a regression on METAL, FUEL-BURNING LIGHT GA
     AEROPLANES. Applying it to a rotorcraft is the same defect that has now
     appeared five times in this engine, and it is why our fuselage came out
     ~2.2x light against NASA's vehicles.

     NDARC's AFDD84 is "a universal body weight equation, used for tiltrotor and
     tiltwing as well as for helicopter configurations" — i.e. it is valid
     across every configuration this tool models. From NASA/TP-20250010468
     section 29-4 (cross-checked against the 2015 and 2009 editions):

       w_basic = 25.41 f_LGloc f_LGret f_ramp
                 (W_MTO/1000)^0.4879 (n_z W_SD/1000)^0.2075
                 S_body^0.1676 l^0.1512

     imperial throughout: weights lb, S_body the WETTED area ft^2, l the
     fuselage length ft. 6.5% average error over 35 aircraft.
       f_LGloc = 1.1627 gear on the fuselage, else 1.0
       f_LGret = 1.1437 gear on the fuselage AND retractable, else 1.0
       f_ramp  = 1.2749 cargo ramp, else 1.0

     THIS EQUATION WAS BLOCKED IN THIS PROJECT FOR MONTHS because every text
     extraction scrambled it, and it was correctly never guessed. It was
     recovered by `pdftotext -raw` (reading order, not column reconstruction),
     a newer 2025 edition, and character-level coordinate extraction — the
     fourth factor is an unmapped glyph, and it was identified by MATCHING that
     same glyph to the parameter-table row reading "length of fuselage, ft",
     not by inference. See eVTOL_Sizing_Research/by-configuration/
     01-afdd84-fuselage-RECOVERED.md for the full recovery and verification.

     VERIFIED BEFORE USE: AFDD84 and the independent AFDD82 helicopter equation
     agree within 3-11% across four vehicles. Two regressions fitted to
     different aircraft sets landing that close is strong evidence the
     exponent-to-base binding is right; a misread exponent would not do that.

     `p.fuselageModel = "raymer"` restores the legacy GA equation. */
  const WSD_lb   = g.MTOW * LB;                 // structural design gross weight
  const fLGloc   = (p.gearOnFuselage !== false) ? 1.1627 : 1.0;
  const fLGret   = (p.gearOnFuselage !== false && p.gearType === "retractable") ? 1.1437 : 1.0;
  const fRamp    = p.cargoRamp === true ? 1.2749 : 1.0;
  const afdd84_lb = 25.41 * fLGloc * fLGret * fRamp
    * Math.pow(Math.max(1e-6, Wdg / 1000), 0.4879)
    * Math.pow(Math.max(1e-6, Nz * WSD_lb / 1000), 0.2075)
    * Math.pow(Sf, 0.1676)
    * Math.pow(Math.max(1, p.fusLen * FT), 0.1512);
  /* NASA'S OWN FUSELAGE FACTORS, AVAILABLE PER RUN. Johnson, Silva & Solis
     (AHS 2018, NTRS 20180003381) Table 6, "Technology factors for all designs
     (net, including calibration factors)": fuselage basic 0.76, crashworthiness
     0.90, crash weight 15% (quadrotor) / 6% (side-by-side) / 6% (tiltwing); and
     p.6: "For the quadrotor with rotor speed control, there is no rotor control
     system weight, and a fuselage weight increment of 25 lb is included to
     cover the AEI design solution." The app default stays K.compositeFuselage
     (Raymer's composite credit); the NASA harness passes NASA's, so it flies
     NASA's vehicles on NASA's assumptions. */
  /* THE STRUCTURE IS NDARC'S, VERIFIED IN THE THEORY MANUAL, NOT INFERRED
     FROM A TABLE. NDARC Theory 29-4 (Vol. 1, NASA/TP-20250010468):
         W_basic = chi_basic * w_basic
         w_cw    = f_cw * (W_basic + W_tfold + W_wfold + W_mar + W_press)
         W_cw    = chi_cw * w_cw                       "typically f_cw = 0.06"
     so with no fold, marinization or pressurisation the fuselage group is
         W = chi_basic * w_basic * (1 + chi_cw * f_cw)  [+ any stated increment]
     A first version of this read Table 6's "basic 0.76 / crashworthiness 0.90
     / crash weight 15%" as three multipliers, 0.76 x 0.90 x 1.15. That is not
     the equation: 0.90 is the technology factor on the CRASH TERM ALONE.
     NASA's net factors are therefore 0.76 x (1 + 0.90 x 0.15) = 0.863 on the
     quadrotor and 0.76 x (1 + 0.90 x 0.06) = 0.801 on the others -- against
     this tool's single 0.90 -- not the 0.787 / 0.725 the misreading gave.
     The app default stays K.compositeFuselage with no crash term; the NASA
     harness passes NASA's three numbers so it flies NASA's vehicles on
     NASA's assumptions. */
  const chiBasic = Number.isFinite(p.fuselageTechFactor) ? p.fuselageTechFactor : K.compositeFuselage;
  const chiCw    = Number.isFinite(p.fuselageCrashTech)  ? p.fuselageCrashTech  : 1.0;
  const fCw      = Number.isFinite(p.fuselageCrashFrac)  ? p.fuselageCrashFrac  : 0;
  const fusInc   = Number.isFinite(p.fuselageIncrementKg) ? p.fuselageIncrementKg : 0;
  const fuselage = (p.fuselageModel === "raymer" ? fus_lb / LB : afdd84_lb / LB)
                 * chiBasic * (1 + chiCw * fCw) + fusInc;

  /* ── V-tail — same Raymer-derived relation already used downstream ──── */
  /* Likewise the empennage: NDARC 2-7 sets nTail=0 for a multicopter — there is
     no tail at all, not a tail of zero area. */
  const vtail = (g.hasWing === false) ? 0 : (g.Wvt != null && isFinite(g.Wvt) ? g.Wvt : 0);

  /* ── Landing gear [FRAC] ──────────────────────────────────────────── */
  /* Gear was a flat 4% of MTOW. Now sized to the CS-27 drop tests that MOC
     SC-VTOL VTOL.2305 names as its means of compliance, with tyres selected
     from published TSO-C62e rated loads — see engine/landinggear.js. */
  const gearOut = landingGear(p, { MTOW: g.MTOW });
  const gear = gearOut.mass;

  /* ── Propulsion ───────────────────────────────────────────────────── */
  const diskArea  = Math.PI * Math.pow(p.propDiam / 2, 2);
  /* INSTALLED MOTOR POWER IS SIZED BY THE WORST DESIGN CONDITION, not by a
     fixed multiple of hover. Was `(Phov * 1.15)/nRotors` — an unsourced 15%
     margin on steady hover, while engine/motor.js was simultaneously computing
     from NASA Table 4 that each motor needs 2.5-3.8x hover power to reject an
     OEI disturbance. The tool required a motor it did not weigh.
     NDARC 3-1.1 sizes installed power as the MAXIMUM over a set of design
     conditions; engine/sizing-conditions.js builds that set. Set
     `p.legacyMotorSizing = true` to restore the 1.15 rule. */
  const cfg0      = resolveConfiguration(p, g.nRotors);
  const sizeCond  = propulsionSizingConditions(p, {
    Phov: g.Phov, nRotors: g.nRotors, Pcr: g.Pcr,
    /* Who carries cruise thrust is a CONFIGURATION property — resolved once in
       engine/configuration.js. Passing a locally re-derived count is how this
       module and sizing-conditions.js came to disagree. */
    nTilting: cfg0.nTilting, cruiseThrustUnits: cfg0.cruiseThrustUnits,
    hasCruiseProp: cfg0.hasCruiseProp,
    transientFactor: motorTransientRequirement(p).factor,
    W: g.MTOW * 9.81, rhoHov: g.rhoHov ?? 1.225, diskArea,
  });
  const PmotKW    = p.legacyMotorSizing === true
    ? (g.Phov * 1.15) / Math.max(1, g.nRotors)
    : sizeCond.installedKW;
  /* ── MOTOR MASS: NASA'S TORQUE REGRESSION, NOT A kW/kg CONSTANT ──────
     WAS  motors = nRotors * PmotKW / 5.0 kW/kg  — a [CAL] constant with no
     published basis, and structurally unable to tell a big slow lift rotor
     from a small fast cruise propulsor at the same shaft power.

     TORQUE is what sizes an electric machine. NASA/TM-20210017971 section
     6.1.2.2 fits a regression to the 30 highest specific-continuous-torque
     motors in the NDARC database (plus Siemens SP70D/SP200D/SP260D):

         W_motor = 0.5663 * tau^0.8207        tau = MAXIMUM CONTINUOUS torque
                                              imperial: tau in ft-lb, W in lb

     applied in their final model with a **tech factor of 1.322**, converged so
     NDARC's internal estimate and the regression agree within 1%. For scale,
     NDARC's ORIGINAL peak-torque regression carries 21.8% mean weight error, so
     no motor mass model here is precise — this one is merely sourced.

     Torque comes from the rating we already size: tau = P_continuous / omega,
     with omega set by tip speed and rotor radius, both real inputs.

     ── GEARING IS AN EXPLICIT CHOICE, NOT AN ASSUMPTION ────────────────
     Default `motorGearRatio = 1` is DIRECT DRIVE, which is this engine's own
     architecture — it models no gearbox, no shafting and no drive-system mass.
     It is also what NASA used for the tiltwing: "all proprotors would be
     directly driven by their respective motors, i.e., without cross shafting".
     BUT their quadrotor and side-by-side DO carry a drive system in Table 12
     (397 lb and 255 lb), so those are geared, and a geared machine spins faster
     and needs far less torque for the same power. Comparing our direct-drive
     motor against their geared one is therefore NOT like for like, and the
     benchmark must say so rather than quietly absorb the difference.
     Set p.motorGearRatio > 1 to model a step-up gearbox. Its mass is now
     modelled too — see engine/drivesystem.js. Until that module existed,
     gearing was a FREE LUNCH: raising the ratio made the motor lighter through
     the torque regression while the gearbox doing the speed change weighed
     nothing, so every geared design scored better than it can be built. Gear
     ratio and gearbox mass now move together or not at all. */
  const omegaRotor = Math.max(1e-6,
    (p.tipSpeed ?? 167.64) / Math.max(1e-6, p.propDiam / 2));   // rad/s
  const gearRatio  = Math.max(1, p.motorGearRatio ?? 1);
  const NM_TO_FTLB = 0.737562;
  /* MOTOR MASS MODELS LIVE IN engine/motormass.js. They were three closures
     here, which left the largest single mass in the aircraft with no
     component-level test while every neighbouring group had one. Extraction
     only — the arithmetic is unchanged and the golden master gates that. */
  let motorTauNm = 0, motorExtrapolated = false;
  const motorOne = (P_kW, omega, model) => {
    const r = motorMass({ model, P_kW, omega, gearRatio, K });
    motorTauNm = r.tauNm;
    if (r.extrapolated) motorExtrapolated = true;
    return r.kg;
  };
  const model = p.motorMassModel ?? "emraxTorque";
  const motors = g.nRotors * motorOne(PmotKW, omegaRotor, model);
  /* [SRC] Gear box + rotor shaft, NDARC AFDD00 (TP-20250010468 29-7.4), applied
     PER DRIVE TRAIN — see engine/drivesystem.js for why the per-train reading
     beats the helicopter whole-aircraft one (0.2-3.8% vs NASA's own published
     drive-system weights, at no technology factor). Zero under direct drive. */
  /* ── THE TRANSMISSION IS SIZED BY THE WORST CONDITION, AND OEI IS ONE ──
     PmotKW is the HOVER share of one drive train. On a cross-shafted layout
     that is not the condition that sizes the transmission: after a motor
     failure the interconnect has to pass the second rotor's share of the
     whole aircraft's power, and NDARC sizes PDSlimit as "the largest of all
     conditions and segments", listing one engine inoperative among them
     (TP-20220000355, 17-4 and 29-7.4).

     Measured on the side-by-side: the hover share is 118.5 kW per train and
     the post-failure interconnect demand is 142.2 kW, so the drive was being
     sized 20% light. Gear-box weight goes as P^0.78 in AFDD00, so this is a
     real mass, not a rounding.

     Independent-rotor layouts are untouched: they have no interconnect, their
     failure case is the rotor-loss one in engine.js, and driveFailure returns
     null for them. */
  /* THE ARCHITECTURE IS THE LAYOUT'S, NOT A USER FLAG. configuration.js
     already marks the cross-shafted layouts with oeiThrustShare: false and
     cites the interconnect shaft; reading it here keeps one fact in one
     place instead of asking the caller to assert it twice. */
  const crossShafted = p.driveCrossShafted
    ?? (CONFIG_DEFAULTS[p?.configType]?.oeiThrustShare === false);
  const dsFail = (crossShafted === true)
    ? driveFailure({ PhovKW: PmotKW * g.nRotors, nMotors: g.nRotors,
                     PpeakPerMotorKW: g.PpeakPerMotorKW, omegaRotor })
    : null;
  /* ── COMPUTED, REPORTED, AND DELIBERATELY NOT CHARGED ──────────────────
     Sizing the transmission to the failure condition was implemented and
     measured, and the only published number we have contradicts it. NASA's
     SbS-E drive system is 255 lb, and this file's per-train hover sizing
     reproduces it to a few percent. Feeding PDSlimit through instead takes
     SbS-E/driveSys to +54.7% and the benchmark mean from 8.7% to 10.0%.

     So the reference vehicle's published drive weight is consistent with
     HOVER-SHARE sizing and not with an OEI-sized interconnect. Either their
     deck did not make OEI a transmission sizing condition, or the published
     breakdown does not carry it. Both are possible and neither is knowable
     from what NASA released.

     Overwriting a measured match with a modelling preference is the trade
     this project has been caught by before, so the failure demand is
     computed and reported — it is a real capability requirement, 20% above
     the hover share — and the WEIGHT stays on the sizing that matches the
     data. If someone wants the heavier transmission, dsFail.PdsLimitKW is
     right there and the reason it is not wired in is this comment. */
  const driveOut  = driveSystem(p, { nRotors: g.nRotors, PmotKW, omegaRotor });
  if (dsFail) { driveOut.sizedByFailure = dsFail.sizedByFailure;
                driveOut.PdsLimitKW = dsFail.PdsLimitKW;
                driveOut.hoverShareKW = +PmotKW.toFixed(2); }
  const driveSys  = driveOut.mass;
  const inverters = g.nRotors * PmotKW / K.inverterSpecPowerKWkg;   // [CAL]
  /* ── ROTOR GROUP — was a single invented constant, now NDARC AFDD ──────
     WAS  rotors = nRotors * 2.0 kg/m^2 * diskArea   // [CAL], no source.
     That constant took no account of blade count, chord, tip speed or flap
     frequency, and MEASURED AGAINST NASA'S OWN PUBLISHED ROTOR GROUP WEIGHTS
     for all eight Table 12 variants it scores a mean absolute error of
     **249%** (range +38% to +463%). It was not a model, it was a placeholder.

     NDARC AFDD (TP-20250010468 29-2) scores **25-31%** on the same eight
     aircraft — an order of magnitude better, and better at every flap
     frequency tested. See engine/rotorgroup.js and validation/components.mjs.

     Chord comes from the published solidity, sigma = N_blade c / (pi R). */
  /* ONLY `p.solidity`. An earlier draft fell back to `p.sigma`, which in this
     codebase is the ATMOSPHERIC DENSITY RATIO (App.jsx line ~758), not rotor
     solidity — it would have fed a density ratio into a chord calculation. */
  /* ── A MIXED LAYOUT HAS TWO KINDS OF ROTOR, SO PRICE THEM SEPARATELY ──
     Flap frequency is a property of the rotor TYPE (see engine/rotorgroup.js:
     NASA publish 1.03 flapping / 1.25 hingeless). A rotor that STOPS in cruise
     must be rigid to survive edgewise flow as a cantilever; a tilting proprotor
     need not be. Archer Midnight has SIX of each, and charging all twelve the
     hingeless frequency over-weighted it by 14 points of MTOW.

     The AFDD blade and hub equations are LINEAR in N_rotor, so splitting the
     count into two groups and summing is EXACT — not an approximation, and far
     better than blending a frequency that enters at the 2.53 power. */
  const nRotTotal   = g.nRotors;
  const nRotStopped = Math.max(0, Math.min(nRotTotal, cfg0.nStopped ?? 0));
  const nRotFree    = nRotTotal - nRotStopped;
  const perRotorArea = nRotTotal > 0 ? diskArea / nRotTotal : 0;
  /* AFDD00's f_tilt = 1.1794 is defined by NDARC "for tilting rotors; 1.0
     otherwise". It was being applied whenever `nTilting > 0`, and nTilting is
     computed as N - nStopped, i.e. "any rotor that does not STOP in cruise".
     A multicopter stops nothing and tilts nothing, so every one of its rotors
     counted as tilting and a plain helicopter rotor carried a 17.9% tiltrotor
     blade penalty. It was measured on the benchmark: Quad-E and SbS-E both ran
     with f_tilt = 1.1794.

     Two corrections. The layout now declares whether its rotors PHYSICALLY
     tilt (`rotorsTilt`), and the factor is applied only to the FREE rotors -
     a rotor that stops in cruise is not a tilting rotor whatever the airframe
     does elsewhere, which is exactly right for the hybrids, where the forward
     rotors tilt and the aft ones stop. */
  const cfgTilts = capabilitiesFor(p?.configType)?.rotorsTilt === true;
  const rotorCall = (n, nu, tilts) => rotorGroup(
    { ...p, solidity: p.solidity ?? 0.10, rotorFlapFreq: p.rotorFlapFreq ?? nu },
    { nRotors: n, radius_m: p.propDiam / 2, tipSpeed_ms: p.tipSpeed ?? 167.64,
      diskArea_m2: perRotorArea * n, isTilting: !!tilts },
    K.rotorMassPerDiskAreaKgM2);
  const rotorStopOut = nRotStopped > 0
    ? rotorCall(nRotStopped, ROTOR_FLAP_FREQ.hingeless.nu, false) : null;
  const rotorFreeOut = nRotFree > 0
    ? rotorCall(nRotFree, ROTOR_FLAP_FREQ.flapping.nu, cfgTilts) : null;
  const rotorOut = rotorStopOut && rotorFreeOut
    ? { mass: rotorStopOut.mass + rotorFreeOut.mass,
        model: rotorStopOut.model,
        note: `${nRotStopped} stopping rotor(s) at nu=${ROTOR_FLAP_FREQ.hingeless.nu} `
            + `(hingeless — must be rigid to stop in edgewise flow) + ${nRotFree} `
            + `free rotor(s) at nu=${ROTOR_FLAP_FREQ.flapping.nu} (flapping)` }
    : (rotorStopOut ?? rotorFreeOut ?? rotorCall(nRotTotal, ROTOR_FLAP_FREQ.flapping.nu));
  const rotors    = rotorOut.mass;
  /* Booms carry the LIFT rotors. A tiltrotor mounts its rotors on the wing and
     tail and has no separate lift booms, so charging every configuration for
     booms over-weighted tiltrotors. Gated on the same stopped-rotor test that
     identifies a lift+cruise layout. */
  const cfg = cfg0;                       // resolved once, above — one layout, one source
  const nStopped0 = cfg.nStopped;
  /* Booms are sized by the rotor thrust they carry and the arm they carry it
     over — see engine/booms.js. The old constant-kg/m version returned ~25 kg
     regardless of rotor count, thrust or arm, which is the largest structural
     omission for a lift+cruise and the one NASA explicitly flags as missing
     from their own analysis. Returns 0 for a tiltrotor, so the configuration
     difference comes out of the statics rather than a technology factor. */
  const boomOut = boomStructure(
    /* BOOM COUNT IS A CONFIGURATION PROPERTY, NOT A CONSTANT. It was
       K.boomCount = 2 for every layout, so a four-rotor quadrotor carried two
       arms and an eight-rotor lift+cruise also carried two. The configuration
       resolver now supplies it: one arm per rotor on a multicopter, two pylons
       on a side-by-side, two wing booms on a lift+cruise, none on a tiltrotor.
       An explicit p.boomCount still overrides. */
    /* cfg0.boomCount is the RESOLVED count — it knows the stopped/tilting
       split, which capabilities.boomCount cannot because it sees only the
       total. See resolveConfiguration. */
    { ...p, boomCount: p.boomCount ?? cfg0.boomCount ?? cfg0.capabilities.boomCount ?? K.boomCount,
      boomLengthFracFusLen: K.boomLengthFracFusLen },
    { MTOW: g.MTOW, nRotors: g.nRotors, Thov: g.Thov });
  const booms = boomOut.mass;

  /* ── Cruise propulsion — LIFT+CRUISE ONLY ──────────────────────────────
     A lift+cruise aircraft carries TWO propulsion systems: lift rotors that
     become dead weight in cruise, and a separate cruise propulsor. A tiltrotor
     reuses the same rotors for both, so it carries one. The buildup counted
     only the lift rotors, so every lift+cruise aircraft was under-weighted
     while the tiltrotor was not — which a single structTechFactor cannot
     correct, because it is a configuration difference, not a technology one.

     NASA Table 3 (Johnson & Silva 2022) lists the Lift+Cruise concept's
     installed power as "8x189 + 838" — eight lift motors PLUS a cruise motor.
     This adds that missing group, sized from the cruise shaft power the engine
     already computes. It is a modelled component, not a fitted factor: it adds
     no free parameter. */
  const hasCruiseProp = cfg.hasCruiseProp && (g.Pcr ?? 0) > 0;
  /* CRUISE THRUST IS SHARED. If rotors keep turning in cruise (tilted to 0 deg)
     they are thrust units too, so a pusher only supplies its share. Sizing the
     pusher for the FULL cruise power over-sizes it on any layout that also has
     tilting rotors — e.g. 2 tip rotors plus a pusher means the pusher does
     about a third, not all of it. Their motors are already counted in `motors`
     and are sized by HOVER power, which exceeds their cruise share anyway. */
  /* Same single definition as the sizing conditions use. This line previously
     read `1 + nTilting`, which counts a pusher that may not exist and
     disagreed with the count passed to propulsionSizingConditions eleven lines
     above — the two halves of the cruise split were computed from different
     denominators, so they did not sum to the cruise power. */
  const nCruiseUnits  = cfg.cruiseThrustUnits ?? 1;
  const pusherShare   = p.pusherThrustShare ?? (1 / Math.max(1, nCruiseUnits));
  const Pcruise_pusher = (g.Pcr ?? 0) * pusherShare;
  /* ── THE PUSHER HAD ZERO THERMAL MARGIN ──────────────────────────────
     Its mass was Pcruise / motorSpecPowerKWkg, and that specific power is a
     CONTINUOUS figure — so the pusher was rated at EXACTLY its cruise power.
     Running a motor at 100% of continuous for a 23-minute leg leaves nothing
     for a hot day, a headwind, or a degraded cell, and it made the engine's own
     "Cruise duty < 80% of continuous rating" check unpassable BY CONSTRUCTION
     for every layout with a dedicated pusher: the numerator and denominator
     were the same number.
     Rated at cruise / dutyLimit instead, which is the same margin that check
     asks for. [LAY] 0.80, inherited from that check rather than invented here,
     so the two cannot disagree again. */
  const cruiseDutyLimit = Math.min(1, Math.max(0.5, p.cruiseDutyLimit ?? 0.80));
  const Pcruise_rating = Pcruise_pusher / cruiseDutyLimit;
  const cruiseMotor    = hasCruiseProp ? Pcruise_rating / K.motorSpecPowerKWkg    : 0;
  const cruiseInverter = hasCruiseProp ? Pcruise_rating / K.inverterSpecPowerKWkg : 0;
  const cruisePropDiam = p.cruisePropDiam ?? p.propDiam;
  const cruiseProp     = hasCruiseProp
    ? K.rotorMassPerDiskAreaKgM2 * Math.PI * Math.pow(cruisePropDiam / 2, 2) : 0;
  const cruisePropulsion = cruiseMotor + cruiseInverter + cruiseProp;
  const cruiseRatingKW   = hasCruiseProp ? Pcruise_rating : 0;

  /* ── Systems [FRAC] ───────────────────────────────────────────────── */
  /* ── PACK SYSTEMS — BTMS, BMS, tray, containment ────────────────────
     These were absent entirely: the engine computed 108 kW of ohmic heat and
     weighed nothing that rejects it, and SC-VTOL's energy-storage retention
     load factors weighed nothing either.

     DOUBLE-COUNTING NOTE: `electrical` below is an HV-distribution fraction and
     the BMS overlaps it somewhat. The overlap is left in rather than netted out
     by guesswork — over-counting a few kg of electronics is the safer error,
     and it is flagged here rather than hidden. */
  const packSys = g.packSystems ?? 0;

  const nSeats        = Math.max(1, Math.round(p.payload / 90));
  /* ── FLIGHT CONTROLS SCALE WITH THE AIRFRAME, NOT WITH MTOW ──────────
     WAS  flightControlsFrac * MTOW.  The fraction (2.5%) turned out to be
     right; the BASE was wrong. Measured against NASA Table 12's published
     flight-controls line for all eight variants:

       vehicle    fc/MTOW    fc/(MTOW - energy storage)
       SMR-TS       2.37%          2.40%
       Quad-TS      2.43%          2.46%
       Quad-E       1.67%          2.43%
       SbS-TS       2.68%          2.71%
       SbS-E        1.90%          2.58%
       L+C-E        1.85%          2.53%

     On MTOW the electric variants scatter from 1.67% to 2.68% because MTOW
     is inflated by battery mass while control hardware is not. On AIRFRAME
     weight, six vehicles spanning TURBOSHAFT AND ELECTRIC and 1 to 8 rotors
     collapse onto **2.40-2.71%, mean 2.518%** — against the 2.5% already in
     use. Charging flight controls for the battery was double-counting it.

     Two vehicles sit outside that band and are recorded, not absorbed:
     the TILTWING at 3.76% (NDARC counts "conversion (rotor tilt) flight
     controls" as its own category — see engine/flightcontrols.js) and
     L+C-TE at 1.49%, which is unexplained given L+C-E is 2.53% for the same
     configuration.

     `WbatPrev` is the previous iteration's battery mass, threaded in the same
     way `packSystems` is, and converges with the outer loop. */
  const airframeMass  = Math.max(0, g.MTOW - (g.WbatPrev ?? 0));
  const fcOut         = flightControlsGroup(p, {
    MTOW: g.MTOW, airframeMass, nRotors: g.nRotors,
    radius_m: p.propDiam / 2, tipSpeed_ms: p.tipSpeed ?? 167.64,
    sHt_m2: 0, nTilting: cfg0.nTilting ?? 0,
  }, K.flightControlsFrac);
  const flightControls= fcOut.mass;
  const electrical    = K.electricalFrac * g.MTOW;
  const ecs           = K.ecsAntiIceFrac * g.MTOW;
  /* Avionics was a flat 45 kg. Now a component list whose lane count on the
     flight-critical chain follows SC-VTOL category — see engine/avionics.js. */
  const avOut         = avionics(p);
  const avionicsMass  = avOut.mass;
  const furnishings   = ((K.furnishingsSeatKg ?? 10.43)
                       + (K.furnishingsOtherKgPerSeat ?? 4.57)) * nSeats;

  /* Technology factor scales the airframe/propulsion groups; fixed equipment
     (avionics, furnishings) is deliberately excluded. */
  /* ── PER-GROUP TECHNOLOGY FACTORS ─────────────────────────────────────
     A single global factor was applied to structure, propulsion AND systems
     alike. Checked against the published group breakdown (NASA Table 3, four
     electric concept vehicles — validation/nasa-table3.js) that is wrong: the
     three groups are off by different amounts and in one case not off at all.

       group        ours        NASA published band
       structure    21.9%       25.7 - 31.4% of MTOW   -> badly light
       propulsion   13.8%       13.4 - 19.7%           -> low in band
       systems      15.1%       ~14.5%                 -> already correct

     Scaling systems by a structural factor therefore introduced an error that
     was not there. NDARC's own approach is per-group technology factors; this
     splits the one factor into two and leaves systems alone. Systems groups
     are already MTOW fractions, so they track MTOW without any factor. */
  const tf  = p.structTechFactor ?? K.structTechFactor;
  const tfp = p.propTechFactor   ?? K.propTechFactor;
  /* [SRC] Engine section / nacelle group, NDARC AFDD82 (TP-20250010468 29-6).
     Belongs to STRUCTURE per NDARC fig. 8-3a, which is why it is added here and
     not to the propulsion groups. Air induction is zero (no combustion) and
     pylon is zero (engine/booms.js already carries that structure) — see
     engine/nacelle.js for all three reference-class judgements. */
  /* LIFT motors only, and the count must match the mass. An earlier revision
     passed nRotors+1 as the count while passing only the lift-motor mass,
     which spread that mass over a motor that was not in it — and the support
     equation is superlinear in mass-per-engine, so the mismatch did not simply
     cancel. The pusher's own nacelle is NOT modelled here: cruisePropulsion
     bundles its motor, inverter and propeller into one figure that cannot be
     split, so charging it a support term would be guessing at the mass being
     supported. Recorded as an omission rather than estimated. */
  const nacOut = nacelleGroup(p, { motorMassKg: motors, nMotors: g.nRotors, MTOW: g.MTOW });
  const nacelle = nacOut.mass;
  const structGroups = { wing, fuselage, vtail, gear, booms, nacelle };
  const propGroups   = { motors, inverters, rotors, cruisePropulsion, driveSys };
  const sysGroups    = { flightControls, electrical, ecs };
  for (const k of Object.keys(structGroups)) structGroups[k] *= tf;
  for (const k of Object.keys(propGroups))   propGroups[k]   *= tfp;
  const scaled = { ...structGroups, ...propGroups, ...sysGroups, packSystems: packSys };

  const groups = { ...scaled, avionics: avionicsMass, furnishings };
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  return { groups, total, techFactor: tf, propTechFactor: tfp, nzUltimateUsed: Nz, boomDetail: boomOut, gearDetail: gearOut, avionicsDetail: avOut, driveDetail: driveOut, nacelleDetail: nacOut, rotorDetail: rotorOut, fcDetail: fcOut,
           cruiseRatingKW,
    motorTorqueNm: +motorTauNm.toFixed(1), motorModelExtrapolated: motorExtrapolated,
        sizingConditions: sizeCond, PmotInstalledKW: PmotKW,
           groupSums: {
             structure: Object.values(structGroups).reduce((a,b)=>a+b,0),
             propulsion: Object.values(propGroups).reduce((a,b)=>a+b,0),
             systems: Object.values(sysGroups).reduce((a,b)=>a+b,0) + avionicsMass + furnishings + packSys,
           } };
}

