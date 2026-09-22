/* =====================================================================
   DRIVE-SYSTEM FAILURE — the case this engine never had
   =====================================================================
   THE GAP. Everything in engine.js's OEI block models ONE ROTOR STOPPING:
   T_avail = (N-1) T_each. That is the right failure for independent
   distributed propulsion and the wrong one for a cross-shafted aircraft,
   where a motor failure costs POWER, not a rotor. The side-by-side is
   flagged `oeiThrustShare: false` for exactly that reason and so had no
   failure case at all — it was exempt from the test that did not apply and
   subject to none that did.

   NASA's concept vehicles are cross-shafted, and say so. AIAA 2018-3847,
   describing the quadrotor's propulsion topology:

     "A higher-speed (low torque) drive shaft is connected to another input
      to the local gearbox, and is connected to a central combining gearbox.
      ... The overrunning clutches allow operation of the balance of the
      drive train in case of a single motor or engine failing."

   ── NDARC MAKES OEI A TRANSMISSION SIZING CONDITION ───────────────────
   NASA/TP-20220000355, Ch. 17 (Propulsion Group) and Ch. 29-7.4:

     "c) Drive system torque limit PDSlimit: maximum torque from designated
      conditions and missions (for each propulsion group; specified as power
      limit at reference rotor speed)."

     "b) The torque required does not exceed the drive system limit:
      PreqPG/Omega <= (1 + eps) PDSlimit/Omega_prim (for each propulsion
      group)."

     "PDSlimit = flimit (Omega_ref/Omega_prim) sum Neng Preq (largest of all
      conditions and segments)" ... "Default for hover, cruise, maneuver,
      one engine inoperative (OEI), or transmission sizing condition."

   So the drive is sized by the LARGEST demand across conditions, and OEI is
   one of them. This tool sized it for the hover share alone — one motor,
   one gear box, one rotor per train, with no path between trains — so its
   transmission was never asked to carry a failure.

   THE SECOND-ROTOR SHARE IS NDARC'S TOO, section 29-7.4:

     "Typically fP = fQ = 60% for twin main-rotors (tandem, coaxial, and
      tiltrotor); for a single main-rotor and tail-rotor, fQ = 3% and
      fP = 15% (18% for 2-bladed rotors)."

   f_P is the fraction of the total drive power limit that the SECOND rotor's
   path must carry. On a twin main-rotor aircraft that is the interconnect,
   and 60% is what NDARC expects it to be sized for.

   ── WHAT IS AND IS NOT CLAIMED ────────────────────────────────────────
   This computes the post-failure power path and the drive limit it implies,
   and reports whether the installed motors and transmission cover it. It
   does NOT model the transient: NDARC's own note elsewhere in this engine
   records that NASA measured 2.9-3.8x hover power during the failure event
   itself, against the steady share computed here. Steady capability is
   necessary and not sufficient, and the output says so rather than implying
   a clean pass.

   The interconnect shaft's WEIGHT is not added. NDARC's drive-shaft
   equation needs N_ds (number of intermediate shafts) and x_hub (shaft
   length between rotors, ft) from its table 29-14, and the equation itself
   did not extract cleanly from the released PDF. The geometry supplies
   x_hub — it is the rotor separation this project already measures — so
   this is a known, bounded next step, not an unknown.
   ===================================================================== */

/** NDARC 29-7.4: second-rotor power-limit fraction of the total drive limit. */
export const F_P_TWIN_MAIN_ROTOR = 0.60;   // tandem, coaxial, tiltrotor — and side-by-side

/**
 * Drive-system failure for a cross-shafted layout.
 * @param o.PhovKW            total hover power, kW
 * @param o.nMotors           motors on the interconnected propulsion group
 * @param o.PpeakPerMotorKW   per-motor peak (contingency) rating, kW
 * @param o.omegaRotor        rotor speed, rad/s (for the torque form)
 * @param o.fP                second-rotor power fraction; NDARC default 0.60
 */
export function driveFailure(o = {}) {
  const P = Number(o.PhovKW), n = Math.round(Number(o.nMotors));
  const Ppk = Number(o.PpeakPerMotorKW), w = Number(o.omegaRotor);
  const fP = Number.isFinite(o.fP) ? Number(o.fP) : F_P_TWIN_MAIN_ROTOR;
  if (!isFinite(P) || !isFinite(n) || n < 2 || P <= 0) return null;

  /* The surviving motors must carry the whole hover demand between them. */
  const perSurvivorKW = P / (n - 1);
  const motorOK = isFinite(Ppk) ? perSurvivorKW <= Ppk : null;
  const motorMarginPct = isFinite(Ppk) ? (Ppk / perSurvivorKW - 1) * 100 : null;

  /* NDARC: the drive limit is the largest demand over designated conditions,
     OEI included. Normal operation asks each train for P/n; after a failure
     the interconnect must pass the second rotor's share of the total. */
  const perTrainNormalKW = P / n;
  const interconnectKW   = fP * P;
  const PdsLimitKW       = Math.max(perTrainNormalKW, interconnectKW);
  const sizedByFailure   = interconnectKW > perTrainNormalKW;

  /* The limit is properly a torque limit, Q = P/Omega (NDARC 17-4). */
  const QdsLimitNm = isFinite(w) && w > 0 ? (PdsLimitKW * 1000) / w : null;

  return {
    perSurvivorKW: +perSurvivorKW.toFixed(2),
    motorOK, motorMarginPct: motorMarginPct == null ? null : +motorMarginPct.toFixed(1),
    perTrainNormalKW: +perTrainNormalKW.toFixed(2),
    interconnectKW: +interconnectKW.toFixed(2),
    PdsLimitKW: +PdsLimitKW.toFixed(2),
    QdsLimitNm: QdsLimitNm == null ? null : +QdsLimitNm.toFixed(1),
    sizedByFailure, fP, nMotors: n,
    growthOverHoverShare: +(PdsLimitKW / perTrainNormalKW).toFixed(3),
    basis: `NDARC TP-20220000355 17-4 / 29-7.4: PDSlimit is the largest demand `
         + `over designated conditions, OEI included; fP = ${(fP * 100).toFixed(0)}% `
         + `of the drive limit passes to the second rotor. Steady share only — `
         + `the 2.9-3.8x transient during the failure event is not covered here.`,
  };
}
