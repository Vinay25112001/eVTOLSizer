/* =====================================================================
   HOVER ATTITUDE DYNAMICS — the reduced multirotor model
   =====================================================================
   [SRC] Malpica, C., Suh, P., Silva, C., "Flight Dynamics Conceptual
   Design Exploration of Multirotor eVTOL", VFS Forum 80, Montreal, 2024.
   Their Eqs. 11-14 reduce a multirotor to four decoupled first-order axes:

     w-dot = Z_w w + SUM Z_Qi c_i,col Q_col     (heave)
     p-dot = L_p p + SUM L_Qi c_i,lat Q_lat     (roll)
     q-dot = M_q q + SUM M_Qi c_i,lon Q_lon     (pitch)
     r-dot = N_r r + SUM N_Qi c_i,dir Q_dir     (yaw)

   with the steady-state response from the final value theorem (their
   Eq. 10): lim x(t) = -b/a.

   WHAT THIS IS VALID FOR, IN THEIR WORDS: "This simplification clearly
   neglects the rotor speed dynamics, but is appropriate for the
   theoretical estimation of the steady state responses." So: control
   power, damping, achievable rates. NOT bandwidth, and explicitly NOT
   pilot-induced oscillation. Their full model carries rotor flapping and
   3-state dynamic inflow per rotor - 48 states for a hexacopter - and is
   not a conceptual sizing calculation.

   THE DERIVATIVES, from momentum theory and geometry:

   Heave damping. In hover T = 2 rho A v_i^2; with a climb rate w,
   T = 2 rho A v_i (v_i + w), so dT/dw = 2 rho A v_i = T / v_i. Summed over
   the rotors that is W / v_i, hence

     Z_w = -g / v_i        with v_i = sqrt(DL / (2 rho))

   which is the classical result and needs nothing but disk loading.

   Roll and pitch damping. Rolling at rate p, the rotor at lateral station
   y_i sees a vertical velocity -p y_i, so its thrust changes by
   (dT/dw)(-p y_i) and the restoring moment is -(dT/dw) p SUM y_i^2:

     L_p = -(dT/dw) SUM y_i^2 / Ixx
     M_q = -(dT/dw) SUM (x_i - x_cg)^2 / Iyy

   Control power. The available thrust differential per rotor comes from
   the margin the sizing loop already carries (T/W above hover), and the
   moment it can generate is that differential on the arms.

   NOT MODELLED, and said out loud rather than approximated: yaw damping
   N_r. Yaw on a multirotor is reaction torque, so N_r depends on the rotor
   torque-vs-speed slope and, for RPM control, on the motor and rotor
   spin-up dynamics - the very thing the reduced model discards. A number
   here would be invented, so `Nr` is returned null and the yaw axis
   reports control power only.
   ===================================================================== */

const G = 9.80665;

/**
 * @param o.rotors   [{x,y,z,radius}] from geometry, hover-lifting rotors only
 * @param o.mass     kg, MTOW
 * @param o.cgX      m
 * @param o.inertia  { Ixx, Iyy, Izz } kg m^2
 * @param o.DL       disk loading, N/m^2
 * @param o.rho      air density at the hover condition, kg/m^3
 * @param o.thrustMargin  T/W available above hover (e.g. 1.30 -> 0.30)
 */
export function hoverDynamics(o = {}) {
  const rotors = (o.rotors || []).filter(r => isFinite(r.x) && isFinite(r.y));
  const n = rotors.length;
  const m = Number(o.mass) || 0;
  const Ixx = Number(o.inertia?.Ixx) || 0;
  const Iyy = Number(o.inertia?.Iyy) || 0;
  const Izz = Number(o.inertia?.Izz) || 0;
  const DL = Number(o.DL) || 0;
  const rho = Number(o.rho) || 1.225;
  if (!(n >= 2 && m > 0 && Ixx > 0 && Iyy > 0 && DL > 0)) {
    return { applicable: false,
      note: "hover attitude dynamics needs >=2 lifting rotors, a mass, an inertia and a disk loading" };
  }

  /* Induced velocity and the thrust slope that produces all the damping. */
  const vi = Math.sqrt(DL / (2 * rho));
  const Thov = (m * G) / n;                 // per rotor, hover
  const dTdw = Thov / vi;                   // per rotor, N per m/s

  const cgX = Number(o.cgX) || 0;
  const sumY2 = rotors.reduce((a, r) => a + r.y * r.y, 0);
  const sumX2 = rotors.reduce((a, r) => a + (r.x - cgX) ** 2, 0);
  const sumAbsY = rotors.reduce((a, r) => a + Math.abs(r.y), 0);
  const sumAbsX = rotors.reduce((a, r) => a + Math.abs(r.x - cgX), 0);

  /* Damping (negative = stable, restoring). */
  const Zw = -G / vi;
  const Lp = -(dTdw * sumY2) / Ixx;
  const Mq = -(dTdw * sumX2) / Iyy;

  /* Control power from the thrust margin the loop already sized. Half the
     rotors push and half pull, so the moment uses the full arm sum. */
  const dT = Thov * Math.max(0, Number(o.thrustMargin) || 0);
  const Lmax = (dT * sumAbsY) / Ixx;        // rad/s^2
  const Mmax = (dT * sumAbsX) / Iyy;

  /* Steady-state rate, final value theorem on x-dot = a x + b:  x_ss = -b/a. */
  const pSS = Lp !== 0 ? Lmax / -Lp : null;
  const qSS = Mq !== 0 ? Mmax / -Mq : null;

  const deg = (x) => (x == null ? null : x * 180 / Math.PI);
  return {
    applicable: true,
    vi_ms: +vi.toFixed(3), dTdw_NsPerM: +dTdw.toFixed(1),
    Zw: +Zw.toFixed(4), Lp: +Lp.toFixed(4), Mq: +Mq.toFixed(4), Nr: null,
    tauRoll_s: Lp !== 0 ? +(-1 / Lp).toFixed(3) : null,
    tauPitch_s: Mq !== 0 ? +(-1 / Mq).toFixed(3) : null,
    tauHeave_s: Zw !== 0 ? +(-1 / Zw).toFixed(3) : null,
    rollControlPower_radss2: +Lmax.toFixed(4),
    pitchControlPower_radss2: +Mmax.toFixed(4),
    rollRateSS_degs: pSS == null ? null : +deg(pSS).toFixed(1),
    pitchRateSS_degs: qSS == null ? null : +deg(qSS).toFixed(1),
    Izz: +Izz.toFixed(0),
    note: "reduced first-order model, Malpica/Suh/Silva VFS Forum 80 Eqs.11-14; "
        + "valid for control power, damping and steady rates, NOT for bandwidth or PIO. "
        + "Yaw damping Nr is not modelled: it depends on rotor torque-speed slope and "
        + "motor spin-up dynamics, which the reduced form discards",
  };
}
