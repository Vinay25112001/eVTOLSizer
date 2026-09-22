/* =====================================================================
   PROPULSION SIZING CONDITIONS — installed power is the MAXIMUM over a SET
   =====================================================================
   WHY THIS EXISTS, AND WHY IT IS THE BIGGEST STRUCTURAL GAP THIS ENGINE HAD

   The engine sized every motor from ONE number:

       PmotKW = (Phov * 1.15) / nRotors        // weights.js, a 15% margin

   with no source for the 1.15 and no reference to any flight condition other
   than steady hover. At the same time, engine/motor.js was computing — from
   NASA's published Table 4 — that each motor must be capable of 2.5 to 3.8
   TIMES hover power to reject the disturbance from a failed motor. Those two
   numbers never met. The tool was telling the user "each motor needs 583 kW"
   on one tab while weighing a 265 kW motor on another. An aircraft built to
   that weight statement cannot perform the recovery the same tool requires.

   That is not a tuning error, it is a missing loop.

   ── WHAT THE INDUSTRY METHOD ACTUALLY DOES ───────────────────────────

   NDARC (Johnson, NASA TP-20220000355) section 3-1.1 "Sizing Task" sizes an
   aircraft over a SET of design conditions and missions, taking the maximum:

     "a) Design gross weight WD: maximum gross weight from designated
      conditions and missions ...
      c) Drive system torque limit PDSlimit: maximum torque from designated
      conditions and missions (for each propulsion group) ...
      e) Antitorque or auxiliary thrust rotor design thrust Tdesign: maximum
      rotor thrust from designated conditions and missions."

   and it states which conditions belong in that set:

     "Sizing flight conditions typically include takeoff (hover or specified
      vertical rate of climb), one-engine inoperative, cruise or dash, perhaps
      transmission, and perhaps mission midpoint hover."

   Structurally NDARC runs TWO nested successive-substitution loops:

     "The outer loop is an iteration on performance: engine power or rotor
      radius, jet thrust, charger power. The inner loop is an iteration on
      parameters: WD, WMTO, PDSlimit, Wfuel-cap or Efuel-cap, and Tdesign."

   This engine had only the INNER loop — mass closure at fixed installed power.
   There was no outer loop, because installed power was never a sized quantity;
   it was a fixed multiple of hover power. This module supplies the missing
   piece: the per-condition power demands, and the maximum over them, which is
   then what the motor and inverter masses are built from.

   ── CONSEQUENCE FOR THE SLIDERS ──────────────────────────────────────

   Three controls in the sidebar were measurably INERT because of this gap
   (validation/sensitivity.mjs):

     twRatio       installed thrust-to-weight had NO mass consequence at all
     rateOfClimb   vertical climb was never a sizing condition
     rotorControl  the Table 4 column changed a displayed number and nothing else

   All three are design decisions with real mass consequences on a real
   aircraft. They become live here, which is the point: a control that cannot
   change the design should not be on the panel, and a design decision that
   does change the aircraft must not be missing from it.

   ── WHAT IS AND IS NOT SOURCED HERE ──────────────────────────────────

   [SRC] the SET of conditions, and "installed = max over the set"  — NDARC 3-1.1
   [SRC] the OEI transient factors                                  — Johnson & Silva 2022 Table 4
   [SRC] hover power at installed thrust, P ~ T^1.5                 — momentum theory
   [SRC] peak-to-continuous motor ratio 1.69                        — EMRAX datasheet family
   [LAY] installationMargin, default 1.00                           — no source; kept at unity
         so this module changes the answer only through real conditions.

   ── SUSTAINED AND TRANSIENT ARE NOT THE SAME CURRENCY ────────────────

   The first version of this module took the plain maximum over all conditions
   and fed it straight into motor mass. That is WRONG and it blew the design up
   to 16,610 kg, because it charged a continuous-rated motor for a demand that
   lasts seconds. An electric motor's continuous rating is a THERMAL limit; its
   short-duration peak is far above it. Sizing mass on the peak as though it
   were continuous double-counts the thermal margin the motor already has.

   The ratio is not a guess — it is in this repo's own component database
   (src/Components.jsx, EMRAX datasheets 2024):

       EMRAX 188   60 kW peak / 36 kW cont = 1.67     6.90 / 4.14 kW/kg
       EMRAX 228  124 kW peak / 75 kW cont = 1.65     9.39 / 5.68 kW/kg
       EMRAX 268  210 kW peak /120 kW cont = 1.75    10.24 / 5.85 kW/kg
       EMRAX 348  340 kW peak /200 kW cont = 1.70    11.72 / 6.90 kW/kg
                                    mean  = 1.693

   Note the continuous specific powers, 4.14-6.90 kW/kg, bracket the engine's
   `motorSpecPowerKWkg: 5.0`. So that constant is a CONTINUOUS figure, and the
   mass must therefore be built from a CONTINUOUS rating. (H3X HPDM-250 is the
   outlier at 1.25 and 13.3 kW/kg continuous — an integrated motor-drive with
   AM copper coils, i.e. a different technology level, so it is excluded from
   the family mean rather than allowed to flatter it.)

   So each condition declares whether it is SUSTAINED or TRANSIENT, and:

       P_rated_continuous = max( max(sustained),
                                 max(transient) / peakToContinuous )

   which is the standard way a drive is specified against a duty cycle.
   ===================================================================== */

/* [SRC] Peak-to-continuous power ratio, EMRAX axial-flux family mean (n=4,
   spread 1.65-1.75 — tight enough to use the mean). Override per design with
   p.motorPeakToContinuous when a specific motor is chosen. */
export const MOTOR_PEAK_TO_CONTINUOUS = 1.693;

/* ── THE SECONDS-SCALE RATIO, WHICH THIS FILE SAID IT COULD NOT SOURCE ────
   The OEI check below compares a Table 4 disturbance-rejection transient --
   an event lasting SECONDS -- against motor capability. It was scoring that
   against MOTOR_PEAK_TO_CONTINUOUS, and said so plainly:

     "the ratio above is a MINUTES-scale peak from motor datasheets, while the
      Table 4 disturbance-rejection transient lasts seconds ... where the
      available overload is higher but by an amount NO SOURCE WAS FOUND FOR."

   A source was found, and it is NASA's own, in the same document family as the
   Table 12 weights this project validates against:

     NASA/TM-20210017971, "Design of a Tiltwing Concept Vehicle for Urban Air
     Mobility", sec.6.1, citing the EMRAX motor manual v5.4 [29]:
       "It is possible for electric motors to produce power that is upwards of
        200% MCP for 'a few seconds'."

   Corroborated independently, twice:
     NASA/TM GL-10 tilt-wing testing -- "ability to overpower motors over 2x
       the continuous power ratings for short bursts"
     NASA "Silent, Solid-State Propulsion for AAM" -- "burst output power more
       than twice the continuous output power"

   AND NASA HIT EXACTLY THIS SITUATION AND RESOLVED IT THE SAME WAY. In that
   same section they compute a tail-proprotor failure needing "205% MCP" from
   the surviving motor and then state: "For the purposes of this paper, the
   baseline motors described above were used, WITHOUT INCREASING MOTOR POWER
   or cross-shafting." That is precisely this model's architecture: size mass
   on the sustained conditions, then check the transient against burst
   capability -- not against a minutes-scale datasheet peak.

   [SRC] 2.00. Deliberately the "upwards of 200%" floor rather than a higher
   reading of it, so the check still errs toward reporting a shortfall. */
export const MOTOR_BURST_TO_CONTINUOUS = 2.00;

/**
 * Power demanded of ONE lift motor by each design condition, and the maximum.
 *
 * All powers are SHAFT kW per motor. The caller supplies hover power for the
 * whole aircraft; every condition is expressed relative to it so the momentum-
 * theory scaling stays consistent with how Phov itself was computed.
 *
 * @param p   parameter set
 * @param g   { Phov, nRotors, Pcr, nTilting, cruiseThrustUnits, hasCruiseProp,
 *              transientFactor, W, rhoHov, diskArea }
 */
export function propulsionSizingConditions(p, g) {
  const N       = Math.max(1, g.nRotors || 1);
  const PhovEa  = (g.Phov || 0) / N;               // steady hover, per motor
  const conds   = [];

  /* 1. HOVER OGE at design gross weight. NDARC's "takeoff (hover ...)".
        This is the continuous condition every motor must hold for the full
        two-minute OGE allowance. */
  conds.push({ key:"hover", label:"Hover OGE at design gross weight",
    kW: PhovEa, basis:"[SRC] NDARC 3-1.1 sizing condition: takeoff hover",
    duty:"sustained", sustained:true });

  /* 2. HOVER AT INSTALLED THRUST-TO-WEIGHT.
        twRatio is an installed-thrust margin for manoeuvre and control
        authority. Momentum theory gives P ~ T^(3/2), so demanding T/W of
        thrust demands (T/W)^1.5 of hover power — NOT (T/W) of it. Getting
        that exponent wrong is a standard way to under-size a VTOL motor.

        ── SUSTAINED, CORRECTED 2026-08-31 ──────────────────────────────
        This was `sustained:false`, and the comment right here claimed it was
        "the condition that makes the twRatio slider real". It was not: only
        SUSTAINED conditions set the motor rating, so twRatio drove NOTHING.
        Swept 1.0 to 2.0 and MTOW, motor mass, rotor mass, hover power and
        installed power were IDENTICAL TO THE DECIMAL. A slider that moves no
        number is worse than an absent one, because it implies a design lever
        that does not exist.

        WHY SUSTAINED IS THE RIGHT READING. The literal objection — you cannot
        hover at 1.3 W, you accelerate — is about the FLIGHT STATE, not the
        RATING. "Installed" means installed: NASA's own sizing Condition 1 is
        "HOGE at 6,000 ft ISA and 100% Maximum Rated Power", and MRP is a
        RATING, not a burst. A powerplant whose rated output cannot produce the
        installed thrust margin does not HAVE that margin, whatever the
        brochure says. So the rating must cover it.

        THIS IS NOT A SECOND COPY OF THE TABLE 4 TRANSIENT. They are different
        currencies: T/W is a THRUST margin the rating must supply, Table 4 is a
        seconds-scale POWER transient the burst must supply. `twRatio`'s
        provenance flags them as "NOT yet reconciled"; they are reconciled by
        being in different duty classes, and the solver already takes the max
        within each. */
  const tw = Math.max(1, p.twRatio ?? 1.0);
  conds.push({ key:"twInstalled", label:`Hover at installed T/W = ${tw.toFixed(2)}`,
    kW: PhovEa * Math.pow(tw, 1.5),
    basis:"[SRC] momentum theory P ∝ T^1.5 at fixed disk area and density; "
        + "rated because NASA size at 100% MRP, which is a rating",
    duty:"sustained", sustained:true });

  /* 3. VERTICAL CLIMB at the specified rate — NDARC lists "takeoff (hover or
        specified vertical rate of climb)" explicitly. Climbing vertically at
        Vz adds Vz to the induced velocity; for a rotor in axial climb the
        power ratio over hover is
             P/P_hover = Vz/(2 v_h) + sqrt( (Vz/(2 v_h))^2 + 1 )
        which is the standard axial-climb momentum solution. v_h is the hover
        induced velocity sqrt(T/(2 rho A)). */
  const vh = (g.rhoHov > 0 && g.diskArea > 0)
    ? Math.sqrt(Math.max(0, (g.W || 0) / N) / (2 * g.rhoHov * g.diskArea))
    : 0;
  const Vz = Math.max(0, p.rateOfClimb ?? 0);
  const climbRatio = vh > 0
    ? (Vz / (2 * vh)) + Math.sqrt(Math.pow(Vz / (2 * vh), 2) + 1)
    : 1;
  conds.push({ key:"vertClimb", label:`Vertical climb at ${Vz.toFixed(2)} m/s`,
    kW: PhovEa * climbRatio,
    basis:"[SRC] axial-climb momentum theory; NDARC 3-1.1 sizing condition",
    duty:"sustained", sustained:true });

  /* 4. ONE ENGINE INOPERATIVE — the transient, not the steady share.
        NASA Table 4 gives required motor power transient capability as a
        multiple of HOVER power per motor, already selected by rotor count and
        control scheme in engine/motor.js. NDARC lists OEI as a sizing
        condition in its own right. This is normally the governing case, and
        it is the one the old 1.15 factor missed by a factor of two or more. */
  const tf = g.transientFactor || 1;
  conds.push({ key:"oeiTransient", label:"OEI / gust transient (NASA Table 4)",
    kW: PhovEa * tf,
    basis:"[SRC] Johnson & Silva 2022 Table 4 — carries NASA's caveat that "
        + "powerplant sizing criteria for multirotor aircraft do not yet exist",
    duty:"transient", sustained:false });

  /* 5. CRUISE share — CARRIED BY THE TILTING ROTORS ONLY.
        These conditions rate the LIFT motors, so the only cruise power that
        belongs here is the part a lift rotor actually draws. A rotor that is
        STOPPED in cruise draws none, and a separate pusher is sized on its own
        in weights.js.

        This previously divided cruise power by `1 + nTilting` and applied the
        result to every lift motor. On NASA's lift+cruise that put the pusher's
        entire 287 kW onto all 8 stopped lift motors — 2.77x NASA's published
        MRP, and double-counted against the pusher weights.js had already
        sized. It also under-rated a tiltrotor, dividing by nRotors+1 when
        there is no pusher to take the extra share.

        `cruiseThrustUnits` is now resolved once in engine/configuration.js:
        tilting rotors + a pusher if one exists. Zero tilting rotors means no
        cruise condition on the lift motors at all, which is the physically
        right answer for a lift+cruise. */
  const nTilt = Math.max(0, g.nTilting ?? 0);
  const units = Math.max(1, g.cruiseThrustUnits || 1);
  const pusherShare = g.hasCruiseProp ? 1 / units : 0;
  const cruisePerLiftMotor = nTilt > 0
    ? (g.Pcr || 0) * (1 - pusherShare) / nTilt
    : 0;
  conds.push({ key:"cruise",
    label: nTilt > 0 ? "Cruise, per tilting rotor"
                     : "Cruise (lift rotors stopped — no cruise demand)",
    kW: cruisePerLiftMotor,
    basis:"[SRC] cruise power over the TILTING rotors only; stopped rotors draw "
        + "none and any pusher is sized separately in weights.js",
    duty:"sustained", sustained:true });

  /* Reduce the two currencies to one — a CONTINUOUS rating, because that is
     what motorSpecPowerKWkg is denominated in (see the header). */
  const ptc  = Math.max(1, p.motorPeakToContinuous ?? MOTOR_PEAK_TO_CONTINUOUS);
  /* Seconds-scale burst, for the OEI transient. A different question from the
     minutes-scale datasheet peak above, and now a sourced one. */
  const btc  = Math.max(1, p.motorBurstToContinuous ?? MOTOR_BURST_TO_CONTINUOUS);
  const susts = conds.filter(c => c.sustained);
  const trans = conds.filter(c => !c.sustained);
  const worstSust = susts.reduce((a, b) => (b.kW > a.kW ? b : a), susts[0]);
  const worstTran = trans.reduce((a, b) => (b.kW > a.kW ? b : a), trans[0]);

  /* ── WHAT SETS THE MASS, AND WHAT IS ONLY CHECKED ───────────────────
     MASS is built from the SUSTAINED conditions alone. That is the thermally
     correct basis: motorSpecPowerKWkg is a continuous figure (see header), and
     a continuous rating is a thermal limit.

     THE TRANSIENT CONDITIONS ARE NOT PRICED INTO MASS, DELIBERATELY, AND THIS
     IS THE HONEST GAP. Sizing mass on the OEI transient was tried and it does
     not close: at the default it drives MTOW to 17,400 kg and diverges. The
     reason it cannot simply be divided by the peak ratio either is that the
     ratio above is a MINUTES-scale peak from motor datasheets, while the
     Table 4 disturbance-rejection transient lasts seconds — a regime where the
     limit is demagnetisation and inverter current, not temperature, and where
     the available overload is higher but by an amount NO SOURCE WAS FOUND FOR.

     RESOLVED — the transient IS priced in, at the datasheet peak ratio, and
     that is the CONSERVATIVE reading rather than an invented one. The motor
     must be CAPABLE of the transient, so its continuous rating must be at
     least (required peak / peak-to-continuous). Using 1.693 for a seconds-long
     event is conservative BECAUSE the datasheet ratio is a minutes-scale
     figure: real sub-second overload capability is higher, so this demands
     more motor than strictly necessary, not less. Every condition is therefore
     converted to a continuous-equivalent rating and the maximum wins — which
     is NDARC 3-1.1's rule applied consistently across both currencies.

     WHAT THIS COSTS, MEASURED, AND WHY IT IS THE RIGHT ANSWER ANYWAY: with RPM
     control the requirement is 3.8x hover, i.e. 2.245x hover CONTINUOUS, and
     the design DOES NOT CLOSE — it runs away to ~17,800 kg. With collective
     control the requirement is 2.5x, i.e. 1.477x continuous, and it closes at
     3,856 kg with propulsion at 12.1% of MTOW. So the tool now says something
     decision-grade: a six-rotor RPM-controlled aircraft on this mission cannot
     carry motors able to reject an engine-out disturbance, and a variable-pitch
     one can. That matches NASA's own finding, quoted in engine/motor.js:
     "rpm control results in higher power transients at each motor, compared to
     collective control". */
  /* A transient is converted to a continuous-equivalent rating by the ratio
     appropriate to ITS OWN duration. Seconds-long events divide by the burst
     ratio, not the minutes-scale datasheet peak -- dividing by the smaller
     number demanded more motor than any real drive needs, which is exactly
     what the refutation below measured. */
  for (const c of conds) c.contEquivKW = c.sustained ? c.kW : c.kW / btc;
  /* ── RE-MEASURED 2026-08-31. THE OLD REFUTATION WAS AN ARTEFACT. ─────
     The note here used to say that pricing the transient into MASS "makes
     THREE OF FOUR PUBLISHED, FLYING AIRCRAFT fail to close". That was measured
     when the transient was divided by the MINUTES-scale datasheet ratio
     (1.693), which demanded 2.245x hover continuous. With the seconds-scale
     burst ratio now sourced at 2.00 the requirement is 1.90x, and the result
     is different: ALL FOUR aircraft converge and ALL FOUR pass the OEI check.
     The old refutation no longer holds and must not be quoted.

     IT IS STILL OFF BY DEFAULT, FOR A BETTER REASON, AND THE REASON IS
     MEASURED. Turning it on takes the industrial buildup MAE from 42.9% to
     67.1%: NASA's own lift+cruise improves (-17% -> +6.1% on MTOW) but Archer
     goes +1.6% -> +22% and Joby +60% -> +68%. Every aircraft gets HEAVIER than
     the real one.
     That is evidence about the world, not about the model: REAL eVTOLs THAT
     ARE FLYING AND BEING CERTIFIED DO NOT CARRY MOTORS SIZED TO NASA's TABLE 4
     TRANSIENT. Which is exactly what NASA themselves say — "sizing criteria
     for power plant components are not currently available for multirotor
     aircraft; therefore, early stability and control simulations are required".

     So the check below fails on every design, and that is the correct
     behaviour: it is reporting an unresolved industry question, not a defect
     in the user's aircraft. Making it pass would cost 24 points of agreement
     with every aircraft that actually exists.
     Opt in with p.priceTransientIntoMass to size to the criterion anyway;
     EVTOL_PRICE_TRANSIENT=1 runs the whole reference set that way. */
  const governing = p.priceTransientIntoMass === true
    ? conds.reduce((a, b) => (b.contEquivKW > a.contEquivKW ? b : a), conds[0])
    : worstSust;

  const margin = Math.max(1, p.installationMargin ?? 1.00);   // [LAY], unity by default
  const ratedContKW = governing.contEquivKW * margin;

  return {
    conditions: conds,
    governing,
    peakToContinuous: ptc,
    worstSustainedKW: worstSust ? worstSust.kW : 0,
    worstTransientKW: worstTran ? worstTran.kW : 0,
    /* Installed CONTINUOUS shaft rating per lift motor — the maximum over the
       set once every condition is put in the same currency. NDARC 3-1.1's rule,
       with the drive-rating step the first version of this module omitted. */
    installedKW: ratedContKW,
    /* The peak the motor must actually be capable of, versus the peak the
       motor we just sized CAN deliver. The gap between these two is the
       finding; see the check in engine.js. */
    requiredPeakKW: Math.max(worstTran ? worstTran.kW : 0, ratedContKW),
    /* Capability is scored against the SECONDS-scale burst ratio, because the
       Table 4 disturbance-rejection event lasts seconds. Scoring it against
       the minutes-scale ptc compared two different questions and overstated
       the shortfall; see MOTOR_BURST_TO_CONTINUOUS. */
    availablePeakKW: ratedContKW * btc,
    burstToContinuous: btc,
    peakShortfallPct: (() => {
      const req = Math.max(worstTran ? worstTran.kW : 0, ratedContKW);
      const av  = ratedContKW * btc;
      return av > 0 ? +(((req - av) / av) * 100).toFixed(1) : null;
    })(),
    /* TOLERANCE, and it is NOT cosmetic. When the OEI transient is the
       governing condition, ratedContKW is DEFINED as worstTran.kW / ptc, so
       availablePeak = (kW/ptc)*ptc — mathematically an identity, but in
       floating point a hair below kW. Without a tolerance the check read
       "needs 490 kW, delivers 490 kW — SHORT BY 0%" and failed every run.
       This is the same defect the structural margin-of-safety check had (sized
       so stress EQUALS the allowable, then rounded to -0%): a quantity that is
       equal by construction must be compared with a tolerance, or the check
       becomes noise. 1e-9 relative. */
    peakAdequate: ratedContKW * btc >= (worstTran ? worstTran.kW : 0) * (1 - 1e-9),
    hoverPerMotorKW: PhovEa,
    /* How badly the superseded rule under-sized it. Reported so the change is
       auditable instead of silently moving every mass. */
    legacyKW: PhovEa * 1.15,
    installationMargin: margin,
  };
}
