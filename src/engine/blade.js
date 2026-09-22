/* =====================================================================
   BLADE PITCH AND SOLIDITY FOR THE EXPORTED ROTOR
   =====================================================================
   THE DEFECT THIS CLOSES. The exporters wrote only `Diameter` and
   `NumBlade` on every propeller, so the exported rotor was OpenVSP's
   DEFAULT blade scaled to a diameter — no pitch, no solidity, nothing
   connected to the rotor this tool sized. Beta34 stayed at OpenVSP's
   built-in 20 deg whatever the aircraft.

   AND THE REFERENCE CANNOT HELP HERE, which is worth recording because
   every other shape in this project is measured off RAVEN. Read RAVEN
   SWFT's proprotor and it carries

       Beta34 20.0   Solidity 0.1696   CLi 0.5388   AF 151.5384

   and a probe script that creates a bare PROP geom in OpenVSP 3.51.3 and
   touches nothing produces 0.1696 / 0.5388 / 151.5384 exactly. NASA left
   the blade curves at their defaults: the published model is an OML and
   layout model, and its rotors are placeholders. So there is no reference
   blade to copy, and the numbers below come from theory applied to this
   tool's own design point instead.

   ── METHOD: blade element / momentum theory in hover ──────────────────
   Leishman, "Principles of Helicopter Aerodynamics", 2nd ed., Ch. 3.

     CT      = (CT/sigma) * sigma            both already sized here
     lambda  = sqrt(CT/2)                    uniform inflow, hover
     phi     = atan( lambda / 0.75 )         inflow angle at 3/4 radius
     CLbar   = 6 * CT/sigma                  mean section lift coefficient
     alpha   = CLbar / a,   a = 2*pi/rad     thin-airfoil lift-curve slope
     theta75 = phi + alpha                   -> Beta34

   NOTHING HERE IS FITTED. Every term is either an output of the sizing
   loop (CT/sigma, sigma, tip speed) or the closed-form hover result.

   WHAT THIS IS NOT. Beta34 is a single collective, and the value written is
   the HOVER one — which matches how the model is exported, released in
   helicopter mode exactly as RAVEN publishes its own. A proprotor in
   airplane mode runs a much coarser collective; converting the model does
   not repitch the blade, and this tool has no cruise-collective schedule to
   write. Twist is left at OpenVSP's distribution for the same reason: the
   engine has no twist model, and inventing one to fill the field would put
   a number in the export that nothing in this tool can defend. */

/** Blade pitch at 3/4 radius, in degrees, from the hover design point. */
export function beta34Deg({ ctSigma, solidity }) {
  const cts = Number(ctSigma), sig = Number(solidity);
  if (!isFinite(cts) || !isFinite(sig) || cts <= 0 || sig <= 0) return null;
  const CT = cts * sig;
  const lambda = Math.sqrt(CT / 2);              // uniform inflow, hover
  const phi = Math.atan(lambda / 0.75);          // inflow angle at 0.75 R
  const alpha = (6 * cts) / (2 * Math.PI);       // CLbar / a, thin airfoil
  return +(((phi + alpha) * 180) / Math.PI).toFixed(3);
}

/** Everything the exporters need to write a blade, or null if unsized. */
export function bladeDesign(SR = {}, p = {}) {
  const ctSigma = Number(SR.ctSigma);
  const solidity = Number(SR.solidityUsed);
  const b34 = beta34Deg({ ctSigma, solidity });
  if (b34 == null) return null;
  return {
    beta34Deg: b34,
    solidity: +solidity.toFixed(4),
    ctSigma: +ctSigma.toFixed(4),
    nBlades: Math.max(2, Math.round(p.nBlades ?? 3)),
    tipSpeed: Number(p.tipSpeed) || null,
    basis: `blade element/momentum in hover: CT/sigma ${ctSigma.toFixed(4)}, `
         + `sigma ${solidity.toFixed(4)} -> theta(0.75R) ${b34.toFixed(2)} deg`,
  };
}

/* =====================================================================
   BLADE TWIST — the last field in the exported rotor still on a default
   =====================================================================
   Diameter, blade count, collective and solidity are now all derived. The
   twist distribution was left at OpenVSP's built-in curve, and the reason
   given was honest: this engine had no twist model. It has one now, and it
   is the same theory that already produces the collective.

   ── THE ANCHOR IS MEASURED, NOT ASSUMED ──────────────────────────────
   Probing a bare PROP geom in OpenVSP 3.51.3:

       PROP_TWIST default:  r/R 0.20 -> 46.75 deg
                            r/R 0.75 -> 20.00 deg
                            r/R 1.00 -> 13.00 deg
       Beta34            =  20.00 deg

   The twist curve carries ABSOLUTE section pitch, and its value at 0.75 R
   IS Beta34. So the curve and the collective are the same quantity sampled
   differently, and a twist distribution written here must pass through the
   Beta34 that blade element theory already gave us, or the export would
   contradict itself.

   ── IDEAL TWIST, WHICH IS A RESULT NOT A CHOICE ──────────────────────
   Leishman, "Principles of Helicopter Aerodynamics", 2nd ed., Ch. 3. For
   uniform inflow in hover the local inflow angle varies as phi(r) = lambda
   R/r, so holding the section angle of attack constant along the span
   requires

       theta(r) (r/R) = constant          ->      theta(r) = theta_75 (0.75 / (r/R))

   which is the minimum-induced-power twist in hover. Anchoring it on the
   collective already derived means the whole distribution follows from the
   same design point, with nothing else introduced.

   THIS IS A HOVER OPTIMUM AND IS LABELLED AS ONE. The model is exported in
   helicopter mode — released at 90 deg, as RAVEN publishes its own — so a
   hover-optimal twist is the consistent choice for the attitude shown. A
   proprotor that must also work in high-speed axial flight wants
   considerably more twist than this, and picking that compromise needs a
   cruise collective schedule which this engine does not have (see the note
   on Beta34 above). The export therefore carries the hover optimum and says
   so, rather than carrying a compromise nobody computed.

   IDEAL TWIST IS SINGULAR AT THE ROOT, which is why real blades use a linear
   approximation to it. The curve is written from OpenVSP's own inboard
   station (0.20 R) outward and no further in, so the singularity is never
   approached; the value there is reported so the reader can see how steep
   the root pitch has become rather than having it hidden. */

/** Ideal (hover-optimal) twist through the derived collective, in degrees. */
export function idealTwistDeg(beta34Deg, rOverR) {
  const b = Number(beta34Deg), x = Number(rOverR);
  if (!isFinite(b) || !isFinite(x) || x <= 0) return null;
  return b * (0.75 / x);
}

/**
 * The twist curve to write to PROP_TWIST: absolute pitch at each station.
 * Stations are OpenVSP's own three, so the curve replaces the default in
 * place rather than changing its shape resolution.
 */
export function twistCurve(beta34Deg, stations = [0.20, 0.75, 1.00]) {
  const b = Number(beta34Deg);
  if (!isFinite(b)) return null;
  const pts = stations.map((x) => ({ rOverR: x, twistDeg: +idealTwistDeg(b, x).toFixed(3) }));
  const root = pts[0].twistDeg, tip = pts[pts.length - 1].twistDeg;
  return {
    points: pts,
    totalTwistDeg: +(root - tip).toFixed(2),
    rootTwistDeg: root, tipTwistDeg: tip,
    basis: `ideal twist theta(r)(r/R) = const, anchored on Beta34 = `
         + `${b.toFixed(2)} deg at 0.75 R — hover optimum (Leishman Ch. 3)`,
  };
}
