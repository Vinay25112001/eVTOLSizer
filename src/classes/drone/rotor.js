/* =====================================================================
   ROTOR — static thrust and power from MEASURED propeller coefficients
   =====================================================================
   This module does not predict a propeller's performance. It looks up a
   real propeller's wind-tunnel measurements and interpolates between
   them, and it refuses when it has no measurement to stand on.

   WHY LOOKUP AND NOT A COEFFICIENT MODEL.
   The textbook form T = C_T * rho * n^2 * D^4 is exact only if C_T is a
   constant. Measured across all 262 propellers in the UIUC database it is
   not: C_T drifts by a MEDIAN 16.2 % across each propeller's own tested
   RPM range, exceeds 5 % on 229 of 239 propellers, and RISES with RPM on
   99 % of them. That is the Reynolds lapse, and it has a consistent sign
   rather than being scatter. A single constant C_T would therefore carry
   roughly three times the 5 % accuracy gate before any other error.

   Interpolating the measured curve instead, scored by leave-one-out over
   3,250 interior points, gives a median error of 0.39 % and 99.8 % of
   points within 5 % — with no fitted parameter anywhere.

   WHAT THIS MODULE WILL NOT DO.
   It will not extrapolate beyond a propeller's measured RPM range. With
   C_T drifting 16 % across that range, an extrapolated coefficient is an
   invented number, and inventing numbers is the one thing this tool must
   not do. Out-of-range requests are CLAMPED and the result says so, so a
   caller can see it rather than discover it in a total.

   ── TWO COEFFICIENT CONVENTIONS, AND THE BRIDGE BETWEEN THEM ─────────
   UIUC publishes in the PROPELLER convention:
       C_T = T / (rho n^2 D^4),   C_P = P / (rho n^3 D^5),   n in rev/s
   Figure of merit is defined in the ROTOR convention, normalised on disc
   area and tip speed:
       C_T' = T / (rho A (OMEGA R)^2),  C_P' = P / (rho A (OMEGA R)^3)
       FM   = C_T'^(3/2) / (sqrt(2) C_P')
   These are NOT the same coefficients, and using a propeller C_T in the
   rotor formula is a silent factor error. With A = pi D^2/4 and
   OMEGA R = pi n D, substituting gives C_T' = (4/pi^3) C_T and
   C_P' = (4/pi^4) C_P, and the factors collapse to

       FM = sqrt(2/pi) * C_T^(3/2) / C_P            (propeller convention)

   Derived a second way as a check, straight from the definition
   FM = ideal power / shaft power with ideal power T^(3/2)/sqrt(2 rho A):
   the same sqrt(2/pi) falls out. Both routes agree, so the constant below
   is not a remembered one.
   ===================================================================== */

/* Sea-level ISA density. A caller sizing for altitude passes its own rho;
   this is only the default, and it is stated rather than buried. */
export const RHO_SEA_LEVEL = 1.225;          // kg/m^3, ISA 15 C
const FM_CONV = Math.sqrt(2 / Math.PI);      // propeller -> rotor convention

/* Measured static coefficients at an RPM.

   Interpolation is linear in log(RPM), which is the form leave-one-out
   cross-validation was run on, so the quoted 0.39 % median applies to
   exactly this arithmetic and not to a variant of it.

   Returns { ct, cp, rpm, mode }, where mode is:
     "measured"      the request landed on a measured point
     "interpolated"  between two measured points
     "clamped-low" / "clamped-high"
                     outside the measured range; the nearest measured
                     coefficient is returned UNCHANGED and flagged. It is
                     not an estimate for that RPM and must not be reported
                     as one. */
export function staticCoefficients(prop, rpm) {
  if (!prop?.static?.length) throw new Error("rotor: propeller has no measured static data");
  if (!Number.isFinite(rpm) || rpm <= 0) throw new Error(`rotor: RPM must be positive, got ${rpm}`);
  const pts = prop.static;
  const lo = pts[0], hi = pts[pts.length - 1];
  if (rpm <= lo[0]) return { ct: lo[1], cp: lo[2], rpm, mode: rpm === lo[0] ? "measured" : "clamped-low", measuredRpm: lo[0] };
  if (rpm >= hi[0]) return { ct: hi[1], cp: hi[2], rpm, mode: rpm === hi[0] ? "measured" : "clamped-high", measuredRpm: hi[0] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (rpm === b[0]) return { ct: b[1], cp: b[2], rpm, mode: "measured", measuredRpm: b[0] };
    if (rpm > a[0] && rpm < b[0]) {
      const t = (Math.log(rpm) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]));
      return { ct: a[1] + t * (b[1] - a[1]), cp: a[2] + t * (b[2] - a[2]), rpm, mode: "interpolated" };
    }
  }
  throw new Error(`rotor: no bracket for ${rpm} rpm in ${prop.id}`);
}

/* Static (hover) thrust in newtons. T = C_T rho n^2 D^4, n in rev/s. */
export function staticThrustN(prop, rpm, rho = RHO_SEA_LEVEL) {
  const { ct, mode } = staticCoefficients(prop, rpm);
  const n = rpm / 60;
  return { thrustN: ct * rho * n * n * Math.pow(prop.diameterM, 4), ct, mode };
}

/* Static shaft power in watts. P = C_P rho n^3 D^5. This is SHAFT power —
   what the motor must deliver. Electrical power is the motor block's job. */
export function staticShaftPowerW(prop, rpm, rho = RHO_SEA_LEVEL) {
  const { cp, mode } = staticCoefficients(prop, rpm);
  const n = rpm / 60;
  return { powerW: cp * rho * n * n * n * Math.pow(prop.diameterM, 5), cp, mode };
}

/* Figure of merit — hover efficiency against the momentum-theory ideal.
   Density-independent, so no rho argument: both thrust and power carry one
   factor of rho and it cancels. Measured small-rotor FM runs roughly
   0.37-0.66 (Bohorquez, Winslow), against ~0.8 for full-scale helicopters,
   so a value outside that band is a signal to check the inputs rather than
   a discovery. */
export function figureOfMerit(prop, rpm) {
  const { ct, cp, mode } = staticCoefficients(prop, rpm);
  return { fm: FM_CONV * Math.pow(ct, 1.5) / cp, ct, cp, mode };
}

/* Disc loading in N/m^2 at an operating point — the quantity that governs
   induced velocity, downwash and hover efficiency. */
export function discLoading(prop, rpm, rho = RHO_SEA_LEVEL) {
  const { thrustN } = staticThrustN(prop, rpm, rho);
  const area = Math.PI * Math.pow(prop.diameterM, 2) / 4;
  return { discLoadingNM2: thrustN / area, areaM2: area, thrustN };
}

/* The RPM at which a propeller makes a required thrust.

   Solved by bisection on the measured range rather than algebraically,
   because C_T itself varies with RPM — the whole reason this module
   exists. Returns null when the requirement lies outside what the
   measurements cover, together with what the measured range can actually
   deliver, so the caller can say "this propeller cannot do it" instead of
   quietly returning an edge value. */
export function rpmForThrust(prop, requiredN, rho = RHO_SEA_LEVEL) {
  const pts = prop.static;
  const loRpm = pts[0][0], hiRpm = pts[pts.length - 1][0];
  const tLo = staticThrustN(prop, loRpm, rho).thrustN;
  const tHi = staticThrustN(prop, hiRpm, rho).thrustN;
  if (!(requiredN >= tLo && requiredN <= tHi))
    return { rpm: null, reason: "outside the measured range",
             measuredThrustRangeN: [tLo, tHi], measuredRpmRange: [loRpm, hiRpm] };
  let a = loRpm, b = hiRpm;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (a + b);
    (staticThrustN(prop, m, rho).thrustN < requiredN ? (a = m) : (b = m));
  }
  const rpm = 0.5 * (a + b);
  return { rpm, ...staticThrustN(prop, rpm, rho), ...staticShaftPowerW(prop, rpm, rho) };
}
