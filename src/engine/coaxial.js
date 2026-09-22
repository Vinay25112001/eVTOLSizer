/* =====================================================================
   COAXIAL (CONTRA-ROTATING) ROTOR INTERFERENCE
   =====================================================================
   WHY THIS EXISTS

   The field builds UAM multicopters in two arrangements, coplanar and
   coaxial, and this tool modelled only the first. Asked for eight rotors
   it drew an eight-armed ring; EHang 184, SkyDrive SD-03 and Moog SureFly
   all carry eight rotors as FOUR coaxial pairs on four arms. That is not
   a drawing difference: it halves the boom count, shrinks the footprint,
   and costs induced power, and the tool could express none of it.

   [SRC] Yang, Y. et al., "Sizing of Multicopter Air Taxis - Weight,
   Endurance, and Range", Aerospace 2024, 11, 200, Eq. 39.

   THE EQUATION, AND WHY IT IS TRUSTED OVER THE PAPER'S OWN PROSE

   Yang's text states two numbers: 27% penalty at a thrust ratio of 0.8,
   and 28% at equal thrust. The equation reproduces the SECOND exactly
   (28.1%) and gives 13.6% for the first. It also has the right limit -
   kappa -> 1 as the lower rotor unloads - and its equal-thrust value of
   1.28 is the classical coaxial figure from Leishman, which Yang cites.

   So the equation is self-consistent and the "27% at 80%" sentence is
   not. THE EQUATION IS IMPLEMENTED, NOT THE SENTENCE. This is recorded
   here so that nobody later "corrects" the model to match the prose: a
   number in a paper's text is a lead, a number you can reproduce is
   evidence. See research note 28.
   ===================================================================== */

/* [SRC] Yang Eq. 39. `aLo` = T_lower / T_upper.
   Returns the induced-power interference factor of a contra-rotating pair
   relative to TWO ISOLATED rotors carrying the same two thrusts. */
export function coaxialInterference(aLo) {
  const a = Math.max(0, Number(aLo) || 0);
  if (a === 0) return 1;                       // no lower rotor, no interference
  const num = 1 + (a / 2) * (Math.sqrt(1 + 4 * a * (1 + a) ** 2) - 1);
  const den = 1 + Math.pow(a, 1.5);
  return num / den;
}

/* [SRC] Yang §3, citing Li et al. AIAA 2023-1011: the lower rotor of a
   contra-rotating pair typically carries 80% of the upper rotor's thrust.
   Equal thrust (1.0) is the worst case and gives the classical 1.28. */
export const COAX_THRUST_RATIO_DEFAULT = 0.80;

/* Boom mass ratio, [SRC] Yang Eq. 71: 4.8 m_r per rotor system for
   coplanar, 9.6 m_r for contra-rotating. Note this is per SYSTEM (per
   arm), so a coaxial arm costs twice a coplanar arm and there are half as
   many of them - the boom mass for a given ROTOR COUNT is a wash by this
   model, and the saving is in footprint, drag and parts count rather than
   in boom mass itself. Recorded because it is easy to assume otherwise. */
export const BOOM_MASS_PER_ROTOR_MASS = { coplanar: 4.8, coaxial: 9.6 };

/* How many boom stations carry N rotors in each arrangement. */
export function rotorStations(nRotors, arrangement) {
  const n = Math.max(1, Math.round(Number(nRotors) || 1));
  return arrangement === "coaxial" ? Math.max(1, Math.round(n / 2)) : n;
}

/* Vertical gap between the two disks of a pair, as a fraction of rotor
   DIAMETER. [LAY] 0.16 — coaxial helicopter separations run roughly
   0.1-0.2 D (Leishman ch. 2); this is geometry only and enters no mass or
   power model, so it is tagged as the assumption it is. */
export const COAX_DISK_GAP_OVER_D = 0.16;

/* Is this rotor count usable coaxially? A contra-rotating layout needs an
   even count, because the rotors come in pairs. */
export function coaxialCountValid(nRotors) {
  const n = Math.round(Number(nRotors) || 0);
  return n >= 2 && n % 2 === 0;
}

/* ── INTERLEAVED (VERTICALLY STAGGERED) COPLANAR ROTORS ────────────────
   A "coplanar" multicopter at high rotor count is not actually coplanar.

   MEASURED ON A PRODUCTION AIRCRAFT. Volocopter publish the VoloCity rotor
   rim diameter twice - 11.3 m INCLUDING the rotors and 9.3 m excluding them -
   which fixes the rotor centre circle at 4.50 m radius rather than leaving it
   inferred. Eighteen 2.3 m rotors on that circle sit 1.563 m apart: they
   OVERLAP IN PLAN BY 32%. The manufacturer's own photographs show the motor
   nacelles alternating between two heights around the ring, which is how the
   overlap is possible.

   This matters because the non-overlap floor `R / sin(pi/N)` in booms.js
   DEMANDS a 16.21 m aircraft for the VoloCity's rotor count and size, against
   the 11.3 m Volocopter actually built - 43% oversize - and boom mass goes as
   L^2 in bending. Sized at its own published inputs with the strict rule, the
   VoloCity comes out at 1,507 kg against a published 900 kg, with the boom
   group alone at 32.4% of MTOW, which is larger than the ENTIRE structural
   fraction Usov et al. use for the whole aircraft.

   [CAL] ONE AIRCRAFT. This ratio is calibrated on the VoloCity alone and is
   NOT a law. It is offered as an option and is not the default, because
   changing the default would re-litigate every multicopter result in the tool
   on the evidence of a single vehicle. What it IS good for is answering
   whether interleaving explains the error - which is a question about our
   model, and one aircraft can answer it. */
export const INTERLEAVE_SPACING_OVER_D = 0.679;   // VoloCity, measured

/* Minimum rotor CENTRE-CIRCLE radius for N rotors of radius R. */
export function ringRadiusFor(nRotors, R, { interleaved = false, margin = 1.05 } = {}) {
  const N = Math.max(1, Math.round(Number(nRotors) || 1));
  if (N < 2) return 0;
  /* strict: discs must not touch. interleaved: they may overlap to the
     measured VoloCity spacing, because they are at different heights. */
  const minSpacing = interleaved ? INTERLEAVE_SPACING_OVER_D * 2 * R : margin * 2 * R;
  return minSpacing / (2 * Math.sin(Math.PI / N));
}

/* =====================================================================
   TWIN SIDE-BY-SIDE ROTORS — NDARC's OVERLAP INTERFERENCE
   =====================================================================
   NDARC Theory 12-5.1.3 treats a side-by-side pair as one actuator. In
   HOVER the pair's projected area is

       A_p = (2 - m) A          m = overlapped fraction of one disc

   so two rotors that overlap present LESS than 2A and the induced velocity
   rises. Momentum theory gives v_i = sqrt(T/(2 rho A_p)), so against the
   naive 2A the induced power is multiplied by

       kappa_twin = sqrt( 2 / (2 - m) )

   and m follows from the hub separation l by the circle-circle lens area:

       m = [ 2R^2 acos(l/2R) - (l/2) sqrt(4R^2 - l^2) ] / (pi R^2)

   NDARC's own escape clause is the l >= 2R case, where the lens area is
   zero, m = 0 and kappa_twin = 1 exactly — so this function needs no
   special-casing for non-overlapping layouts and returns 1.0 for them.

   ── WHY IT NOW APPLIES, WHEN IT PREVIOUSLY DID NOT ────────────────────
   This project recorded the overlap as unknown. It is not: both NASA papers
   name it as the defining feature of the aircraft (see configuration.js).
   What neither publishes is the NUMBER, so it is measured off the released
   three-view instead — the same technique this project already uses on
   RAVEN's .vsp3, and labelled as the weaker measurement it is.

   MEASURED, AIAA 2018-3847 Fig. 4, plan view (top-left panel), in pixels:

       hub separation      585            (both hubs at the same station)
       rotor diameter      695 - 702      (three independent blade pairs)
       -> l/D              0.833 - 0.842

   Cross-checked on the red rotor's horizontal blade pair (695) and its
   vertical pair (690), which agree to 0.7%. Taken as l/D = 0.84, and the
   sensitivity is stated rather than hidden: l/D = 0.81 gives m = 0.098 and
   0.87 gives m = 0.055, i.e. kappa_twin between 1.025 and 1.014.

   A FIGURE IS NOT A FILE. RAVEN's geometry is read from a parametric model
   and is exact; this is a pixel measurement off a rendered view, good to a
   few percent. It is used because the alternative is to keep applying no
   interference at all to an aircraft whose overlap NASA calls its most
   noteworthy attribute. */
export const SBS_HUB_SEP_OVER_D = 0.84;   // AIAA 2018-3847 Fig. 4, measured

/** Overlapped fraction m of one disc, from hub separation / diameter. */
export function twinOverlapFraction(lOverD) {
  const x = Number(lOverD);
  if (!isFinite(x) || x >= 1) return 0;          // tangent or clear: no overlap
  if (x <= 0) return 1;                          // coincident
  const lens = 2 * Math.acos(x) - x * Math.sqrt(Math.max(0, 4 - 4 * x * x));
  /* lens above is in units of R^2 (l = 2Rx substituted throughout) */
  return Math.min(1, Math.max(0, lens / Math.PI));
}

/** kappa_twin: hover induced-power multiplier for an overlapping pair. */
export function twinRotorInterference(lOverD = SBS_HUB_SEP_OVER_D) {
  const m = twinOverlapFraction(lOverD);
  return Math.sqrt(2 / (2 - m));
}

/* =====================================================================
   HUB SPACING, MEASURED PER LAYOUT INSTEAD OF ASSUMED
   =====================================================================
   `margin` in ringRadiusFor is exactly the ADJACENT HUB SPACING IN ROTOR
   DIAMETERS, for any N: adjacent centres are 2a sin(pi/N) apart and
   a = margin*2R/(2 sin(pi/N)), so the spacing is margin*D identically.
   That makes it directly measurable off a published three-view, and it is
   the same quantity NDARC calls l.

   The default 1.05 is not a design value — it is the geometric non-overlap
   minimum plus 5% so the discs do not graze. Using a MINIMUM as though it
   were the aircraft is how this tool ended up drawing rotors closer than
   any of the vehicles it benchmarks against.

   MEASURED off AIAA 2018-3847, the paper these concept vehicles come from:

     side-by-side   Fig. 4 plan view    l/D = 0.84   discs OVERLAP
     quadrotor      Fig. 1 plan view    l/D = 1.37   hubs on a 547 px square,
                                                     D = 400 px

   The quadrotor's own text explains why it can afford 1.37 and why the
   side-by-side wants less than 1: "in forward flight, the power required by
   the rear rotors is often greater than that required by the front rotors,
   even with a vertical offset between front and rear." Spacing buys the
   quadrotor wake separation; overlap buys the side-by-side span. */
export const HUB_SPACING_OVER_D = {
  sideBySide:  SBS_HUB_SEP_OVER_D,   // 0.84, overlapping and intermeshing
  /* ── APPLIED 2026-09-06. The obstacle was never the spacing. ─────────
     This entry sat commented out with a long note explaining that setting it
     took the multicopter's MTOW from ~2.0 t to 10.06 t, and blaming the rotor:
     "this tool's multicopter default is nRotors = 4 ... which sizes an 8.78 m
     rotor where NASA's quadrotor uses 1.98 m". That diagnosis was MEASURED
     and is wrong. NASA's quadrotor rotor is 13.1 ft radius = 7.99 m diameter
     against this tool's 8.90 m, at the SAME 3.0 lb/ft2 disk loading. The two
     aircraft are the same size.

     The runaway came from booms.js sizing every boom at an ultimate 5.25
     (1.5 x 3.5 g) on rotors that produce 1.3 g. On the sourced SC-VTOL value
     of 3.00 the sweep is smooth and monotonic:

       spacing   MTOW    booms   tip gap
       1.05 D    3242 kg  204 kg    5%      (was: 3644 / 322)
       1.25 D    3609     312      25%
       1.37 D    3925     406      37%      (was: 11,389 / 2,769 — divergent)

     WHY 1.37 D IS THE RIGHT NUMBER TO SHIP. It is measured off NASA's own
     three-view (Silva, Johnson, Antcliff & Patterson, AIAA 2018-3847), the
     same source this file already uses for the side-by-side's 0.84 and for
     the aft-rotor rise. It puts adjacent hubs 2.74 R apart, a 35% tip gap.
     The tool previously shipped 1.05 D — a 5% tip gap, hub separation 2.10 R.

     That 2.10 R is not merely tighter than NASA, it is CLOSER THAN ANY
     PUBLISHED INTERFERENCE DATA COVERS. Healy, Misiorowski & Gandhi (J. Am.
     Helicopter Soc. 67(1) 012006, 2022) tested 2.5 R / 3 R / 3.5 R and found
     that at the closest of those, at 40 kt, an aft rotor already loses 8.4%
     thrust and needs 13.4% more torque, rising to 12.2% at 60 kt and growing
     as spacing falls. Shipping 2.10 R meant extrapolating off the bad end of
     the only data there is, in a tool that models no edgewise interference at
     all. A geometry nobody has measured is worse than a heavier one that
     matches a published aircraft.

     WHAT IT COSTS, and it is not free: at NASA's own quadrotor inputs the
     structures group goes +0.4% -> +15.5% (x2.5 AFDD), and the benchmark mean
     11.4% -> 12.0%. MTOW stays inside AFDD's own error (+3.8%). The structures
     overshoot is real and is now the named open item: at NASA's geometry this
     tool needs 860 kg where NASA publish 744. Note that NASA state their own
     figure OMITS the boom mounting (quoted in booms.js), so part of that gap
     is theirs and part is ours, and which part is not yet separable. */
  /* NOT a flat multicopter entry — see quadrotorSpacing below. NASA's 1.37 D
     is a FOUR-ROTOR datum and applying it to every rotor count breaks. */
};

/* ── 1.37 D IS A QUADROTOR NUMBER, NOT A MULTICOPTER LAW ──────────────
   Applying it at every rotor count was tried and MEASURED, and it does not
   survive. Adjacent hubs 1.37 D apart on a ring of N put the ring at
   a = 1.37 D / (2 sin(pi/N)), which grows without bound in N — 3.51 D at
   N = 16 — and boom mass goes as a^2:

     N    MTOW      booms   boom% MTOW   converged   buildup
     4    3925 kg    406 kg    10.3         yes         ok
     6    7121      1358       19.1         yes         ok
     8   10594      3578       33.8         NO          ok
    10   10832      4784       44.2         NO          ok
    12    5031      3129       62.2         yes    FELL BACK
    16    5184      3289       63.4         yes    FELL BACK

   Two of those do not converge and two fall out of the component buildup
   into the fraction model. A boom group at 63% of MTOW is not a design.

   ONE THING THAT TABLE DOES *NOT* SHOW, and the distinction matters: N >= 10
   ALREADY failed to converge before this change, at the old 1.05 D spacing.
   Measured on the previous commit: N=10 9024 kg NO, N=12 10455 kg NO,
   N=16 9430 kg NO, with boom groups of 26-50% of MTOW. So high-count
   multicopters were broken independently of the spacing, and the N-gating
   below leaves N = 6 and N = 8 byte-identical to what they were. Only N = 4
   moves. The high-N non-convergence is a SEPARATE, PRE-EXISTING defect and is
   not fixed here — it is recorded so it is not later blamed on this.

   AND REAL AIRCRAFT DO NOT DO THIS EITHER, which is the point. NASA measured
   1.37 D on a FOUR-rotor aircraft. Every high-count multicopter in this class
   OVERLAPS instead: Volocopter's VoloCity puts eighteen 2.3 m discs 1.563 m
   apart — 0.679 D, a 32% overlap — with the nacelles alternating between two
   heights, and EHang's 216 carries sixteen the same way. Holding a 35% tip
   gap at N = 16 is the same category error the previous note in this file
   warned about ("the arm ratio is scale-free but the aircraft it is applied
   to is not the same aircraft"), arriving from the other direction.

   So the sourced number is applied WHERE IT IS SOURCED. Above four rotors
   there is no published non-overlapping datum in this class, the real
   aircraft overlap, and the non-overlap minimum stays — which leaves that
   regime exactly as open as it was, rather than pretending a quadrotor
   three-view settled it. */
export const QUADROTOR_HUB_SPACING_OVER_D = 1.37;   // AIAA 2018-3847 Fig. 1 [SRC]
export const QUADROTOR_MAX_N = 4;

/* ── WHEN A MULTICOPTER INTERLEAVES, IN ONE PLACE ─────────────────────
   `rotorInterleave` existed as an opt-in flag and was read by booms.js and
   NOT by geometry.js, so switching it on made the tool WEIGH the short
   interleaved arm and DRAW the long strict ring. That is the same
   draw-one-aircraft-weigh-another defect the ring comment in geometry.js
   already records for the side-by-side, in a second place.

   THE DEFAULT IS NOW COUNT-DEPENDENT, and the reason is that a strict
   non-overlapping ring stops describing any real aircraft as N grows. Two
   measured facts bracket it:

     a quadrotor demonstrably does NOT interleave — NASA's sits at 1.37 D
       with a 35% tip gap (AIAA 2018-3847);
     the two aircraft in this class at high count DO — Volocopter's VoloCity
       puts eighteen 2.3 m discs 1.563 m apart (0.679 D, 32% overlap) with
       nacelles alternating between two heights, and EHang's 216 carries
       sixteen the same way.

   Nothing published fixes the crossover, so N > 8 is a JUDGMENT between two
   measured endpoints and is tagged [LAY] accordingly. What it is NOT is a
   convergence fix chosen because it converges: the architecture changes
   because that is the architecture built at those counts. That it also
   closes the sizing loop from N = 10 to N = 17 is a consequence, and the
   underlying reason the strict rule fails is recorded in booms.js —
   boom mass grows as MTOW^1.50, so the empty fraction is unbounded. */
export const INTERLEAVE_MIN_ROTORS = 8;   // [LAY] between two measured endpoints

/** Does this layout interleave its rotors? Explicit flag wins. */
export function interleavedFor(configType, nRotors, p) {
  if (p && p.rotorInterleave !== undefined) return p.rotorInterleave === true;
  const n = Number(nRotors);
  /* AN INTERLEAVED RING MUST HAVE AN EVEN COUNT. The discs clear by sitting
     at two alternating heights, and on an odd ring the alternation cannot
     close: rotor 0 and rotor N-1 are neighbours and both land on the same
     level, so that one pair overlaps at equal height with nothing separating
     it. VoloCity has eighteen and EHang's 216 sixteen; both are even, and
     that is not a coincidence. An odd count keeps the strict rule. */
  return configType === "multicopter" && Number.isFinite(n)
    && n > INTERLEAVE_MIN_ROTORS && n % 2 === 0;
}

/** Adjacent hub spacing / D for a layout; the non-overlap minimum otherwise. */
export function hubSpacingFor(configType, nRotors) {
  if (configType === "multicopter") {
    const n = Number(nRotors);
    return Number.isFinite(n) && n > 0 && n <= QUADROTOR_MAX_N
      ? QUADROTOR_HUB_SPACING_OVER_D : 1.05;
  }
  return HUB_SPACING_OVER_D[configType] ?? 1.05;
}

/* Aft-rotor rise on a multicopter, in rotor diameters. NASA quadrotor,
   AIAA 2018-3847 Fig. 1 side view: front hub 405 px, rear hub 288 px,
   D = 670 px in the same projection. Their text gives the purpose —
   the aft rotors are lifted out of the forward rotors' wake. */
export const MC_AFT_RISE_OVER_D = 0.17;
