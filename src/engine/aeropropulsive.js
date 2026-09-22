/* =====================================================================
   AERO-PROPULSIVE COUPLING
   =====================================================================
   The classical stability derivatives in wingmodes.js assume the
   propulsion and the airframe do not talk to each other. On a
   distributed-electric aircraft that assumption is indefensible, and the
   literature says so directly:

     "assuming that there are no propulsion-airframe interactions present
      for propeller-driven aircraft LACKS PHYSICAL JUSTIFICATION"
        - Simmons, B.M., "Advances in Aero-Propulsive Modeling for
          Fixed-Wing and eVTOL Aircraft Using Experimental Data",
          PhD dissertation, Virginia Tech, 2023 (corpus S3902)

   READ THIS FIRST, BECAUSE IT BOUNDS EVERYTHING BELOW.

   Simmons' entire body of work — the dissertation, and the NASA Langley
   free-motion wind tunnel papers — is about IDENTIFYING these models from
   EXPERIMENT. There is no closed-form predictive theory to implement. He
   is explicit about why:

     "Significant airframe-propulsion interactions and rapid aerodynamic
      variation with flight condition for eVTOL vehicles suggests that a
      LINEAR aero-propulsive model will have a SMALL REGION OF LOCAL
      VALIDITY. For many applications, identification of a NONLINEAR
      aero-propulsive model will be required"

   So this module does not claim to model aero-propulsive coupling. It
   computes the three first-order effects that ARE derivable from momentum
   theory and geometry, and reports them as corrections with their
   provenance attached. Anything beyond that needs a wind tunnel.

   THE THREE EFFECTS

   1. ROTOR-AIRFRAME THRUST LOSS (rotor-borne layouts). Rotors above a
      body lose thrust to download and wake impingement on the arms.
      [SRC] Altamirano & McCrink, "Investigation of Longitudinal
      Aero-Propulsive Interactions of a Small Quadrotor Unmanned Aircraft
      System", NASA Langley (corpus S3507): "nearly a 12% less thrust
      actually produced", and "the rotor thrust coefficient was decreased
      by approximately 10% to match the hover trim condition". Their
      baseline model without interaction erred by more than 10% in forward
      flight; with it, under 3%.

   2. SLIPSTREAM BLOWING (wing-borne layouts). A propeller ahead of a wing
      raises the dynamic pressure over the blown span. Momentum theory
      gives this exactly: the fully developed slipstream satisfies
      V_j^2 = V^2 + 2T/(rho A), so

        q_j / q_inf = 1 + 2T / (rho A V^2)

      which is first principles, not a correlation. What is [LAY] is the
      BLOWN FRACTION of the wing, taken geometrically as the propeller
      diameters that overlap the span.

   3. THRUST-SPEED DERIVATIVE. Classical phugoid damping assumes constant
      thrust. An electric aircraft is power-limited, so at constant shaft
      power T ~ P/(V + v_i) and

        dT/dV = -T / (V + v_i)

      Thrust falling with speed ADDS phugoid damping, so ignoring it makes
      the phugoid look worse than it is. This is the one aero-propulsive
      term that changes a mode a designer would look at.
   ===================================================================== */

/* [SRC] S3507, NASA Langley quadrotor: 10-12% thrust loss to airframe
   interaction in hover. The midpoint is used and the range is returned so
   a reader can see it is a measured band, not a constant of nature. */
export const ROTOR_AIRFRAME_THRUST_LOSS = { lo: 0.10, hi: 0.12, mid: 0.11 };

/**
 * @param o.thrustTotal  N, total installed hover thrust
 * @param o.rotors       [{x,y,radius}] lifting rotors
 * @param o.V            m/s, flight speed for the blowing terms
 * @param o.rho          kg/m^3
 * @param o.Swing        m^2 (0 for rotor-borne)
 * @param o.bWing        m
 * @param o.viHover      m/s induced velocity in hover
 * @param o.wingBorne    boolean
 */
export function aeroPropulsive(o = {}) {
  const rotors = o.rotors || [];
  const n = rotors.length;
  const V = Number(o.V) || 0;
  const rho = Number(o.rho) || 1.225;
  const T = Number(o.thrustTotal) || 0;
  const S = Number(o.Swing) || 0;
  const b = Number(o.bWing) || 0;
  const vi = Number(o.viHover) || 0;

  const out = { applicable: n > 0 && T > 0, effects: [] };
  if (!out.applicable) return { ...out, note: "needs rotors and a thrust" };

  /* 1. rotor-airframe thrust loss */
  out.thrustLossFraction = ROTOR_AIRFRAME_THRUST_LOSS.mid;
  out.thrustLossRange = [ROTOR_AIRFRAME_THRUST_LOSS.lo, ROTOR_AIRFRAME_THRUST_LOSS.hi];
  out.effectiveThrust_N = +(T * (1 - out.thrustLossFraction)).toFixed(1);
  out.effects.push(
    `rotor-airframe interaction removes ${(100 * out.thrustLossFraction).toFixed(0)}% of installed `
    + `thrust (measured 10-12% on a NASA Langley quadrotor); installed ${T.toFixed(0)} N `
    + `behaves as ${out.effectiveThrust_N.toFixed(0)} N`);

  /* 2. slipstream blowing over the wing.
     ONLY ROTORS THAT ARE STILL TURNING IN CRUISE AND SIT AHEAD OF THE WING
     BLOW IT. A first version used every rotor at hover thrust and reported a
     30% lift augmentation on the LIFT+CRUISE - an aircraft whose lift rotors
     have STOPPED by then and whose pusher is behind the wing. It blows
     nothing. Tilting rotors on the wing leading edge do blow it; stopped
     lift rotors and tail pushers do not. */
  const blowers = rotors.filter(r => r.blowsWing === true);
  const Tcruise = Number(o.cruiseThrust) || 0;
  if (o.wingBorne && S > 0 && b > 0 && V > 0 && blowers.length && Tcruise > 0) {
    const Adisc = blowers.reduce((a, r) => a + Math.PI * (r.radius || 0) ** 2, 0);
    if (Adisc > 0) {
      const qRatio = 1 + (2 * Tcruise) / (rho * Adisc * V * V);
      /* [LAY] blown fraction: the rotor diameters that overlap the span,
         capped at 1. Crude, and the crudest thing in this module. */
      const dSum = blowers.reduce((a, r) => a + 2 * (r.radius || 0), 0);
      const blown = Math.max(0, Math.min(1, dSum / b));
      /* lift on the blown strip scales with the local dynamic pressure */
      const clFactor = 1 + blown * (qRatio - 1);
      out.slipstream = {
        qRatio: +qRatio.toFixed(3), blownFraction: +blown.toFixed(3),
        liftAugmentation: +clFactor.toFixed(3),
      };
      out.effects.push(
        `${blowers.length} wing-mounted rotors still turning in cruise raise dynamic pressure `
        + `over ${(100 * blown).toFixed(0)}% of the span `
        + `by ${((qRatio - 1) * 100).toFixed(0)}%, augmenting lift by `
        + `${((clFactor - 1) * 100).toFixed(1)}% (momentum theory; blown fraction is [LAY])`);
    }
  }

  if (o.wingBorne && !blowers.length) {
    out.slipstream = { qRatio: 1, blownFraction: 0, liftAugmentation: 1 };
    out.effects.push(
      "no slipstream blowing: no rotor both turns in cruise and sits ahead of the wing "
      + "(a lift+cruise stops its lift rotors and pushes from the tail)");
  }

  /* 3. thrust-speed derivative and its effect on phugoid damping */
  if (V > 0) {
    const dTdV = -T / (V + vi);            // constant shaft power
    out.dTdV_NsPerM = +dTdV.toFixed(1);
    out.effects.push(
      `at constant shaft power dT/dV = ${dTdV.toFixed(0)} N per m/s; thrust falling with `
      + `speed ADDS phugoid damping, so omitting it understates the damping`);
  }

  out.caveat =
    "NOT a model of aero-propulsive coupling. Simmons (Virginia Tech 2023, NASA Langley) "
    + "identifies these effects from wind-tunnel and flight EXPERIMENT and states that a "
    + "linear aero-propulsive model has 'a small region of local validity' and that most "
    + "applications need a NONLINEAR identified model. These are the three terms derivable "
    + "from momentum theory and geometry; everything else needs a tunnel.";
  return out;
}

/** Phugoid damping WITH the thrust-speed term, against the Lanchester value. */
export function phugoidWithThrust({ LD, U, vi, m, thrustTotal, g = 9.80665 }) {
  if (!(LD > 0 && U > 0 && m > 0)) return null;
  const wn = (Math.SQRT2 * g) / U;
  const zetaClassic = 1 / (Math.SQRT2 * LD);
  /* X_u picks up (1/m) dT/dV on top of the aerodynamic term. The classical
     result corresponds to the aerodynamic part alone. */
  const dTdV = -(Number(thrustTotal) || 0) / (U + (Number(vi) || 0));
  const dXu = dTdV / m;                       // 1/s, negative
  const zeta = zetaClassic + -dXu / (2 * wn);
  return {
    wn: +wn.toFixed(4),
    zetaClassic: +zetaClassic.toFixed(4),
    zetaWithThrust: +zeta.toFixed(4),
    deltaZeta: +(zeta - zetaClassic).toFixed(4),
    dTdV_NsPerM: +dTdV.toFixed(1),
    note: "constant-shaft-power thrust lapse; the classical phugoid assumes constant thrust "
        + "and therefore understates damping for a power-limited electric aircraft",
  };
}
