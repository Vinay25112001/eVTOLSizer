/* =====================================================================
   MOTOR — electrical demand of a shaft operating point, no fitted term
   =====================================================================
   The rotor block says what SHAFT power a propeller needs. This block
   says what ELECTRICAL power the motor must draw to deliver it. Between
   the two sits the motor's own loss, and the whole question is whether a
   catalogue's published constants are good enough to compute it.

   THE MODEL. Standard BLDC lumped equivalent, four published constants
   and nothing else:

       I_motor  = M / Kt + I0                 torque relation
       Kv_rad   = Kv * 2*pi/60                RPM/V -> rad/s/V
       back-EMF = omega / Kv_rad
       V_motor  = back-EMF + I_motor * R
       P_elec   = V_motor * I_motor
       P_mech   = M * omega
       eta      = P_mech / P_elec

   There is no fitted parameter anywhere in it. Scored against 419
   measured KDE rows it reproduces eta_motor at 86-90 %, which is the
   right magnitude for motors of this class and, more tellingly, the right
   SHAPE: eta rises steeply to about half throttle then plateaus, because
   the no-load term dominates at light load.

   ── WHY R IS USED EXACTLY AS PRINTED, AND WHY THAT IS NOT OBVIOUS ────
   Dai, Quan, Ren & Cai (IEEE/ASME T-Mech 2019, p.5) state that the
   catalogue resistance "is usually not accurate enough ... R_m ~ 2-3
   R_m0". If that held generally, every number in the catalogue would be
   unusable and copper loss — an I^2 R term — would be wrong by 2-3x.

   It is not reproduced here, and the reason matters. Fitting a resistance
   against the published AMPERAGE column recovers 2.07-3.61x, landing
   squarely on Dai's claim. That is an artefact: AMPERAGE is DC BUS
   current, and an ESC is a switching converter, so I_bus ~ duty * I_motor
   and fitting against I_bus^2 folds in a 1/duty^2 factor. The tell was
   the SHAPE of the answer, not its size — the fitted "resistance" came
   out 0.26-0.27 ohm for all four motors while their published resistances
   span 0.072-0.130. A real copper resistance varies with the motor.

   Taking motor current from the torque relation instead needs no ESC
   model at all, and then the printed R reproduces the measured loss
   unmodified. This does not refute Dai — different motors, different
   instrumentation — but it does mean a blanket factor must never be
   applied. The engine carries the CONVENTION, not a correction.

   ── WHAT DISQUALIFIES A MOTOR ────────────────────────────────────────
   Phase-to-phase resistance is 2x R_phase on a wye motor and 2/3 x
   R_phase on a delta one, so one printed number can mean values a factor
   of three apart. A motor whose vendor prints only "Internal Resistance"
   is therefore HELD BACK from this model rather than guessed at. So is
   one with no published no-load current, since I0 is not recoverable
   from the other constants.

   In the current catalogue that is 21 of 24 motors: 18 state no
   convention at all, and 3 (iFlight XING-E Pro) state the convention but
   publish no I0. The 3 that qualify are all KDE. That is a finding about
   what the industry publishes, not a gap to paper over, and the selection
   layer must surface it rather than quietly skipping those parts.

   ── THE TWO APPROXIMATIONS THAT REMAIN, NAMED ────────────────────────
   1. I0 is published at a stated reference voltage (10 V on KDE; this
      survey also found 18, 22 and 24 V in use) and is used here as a
      constant at whatever voltage the motor actually runs. Iron loss
      rises with speed and is folded into that constant by the standard
      model, which is why eta is weakest at light load. No vendor in the
      survey publishes a speed-dependent core-loss term.
   2. R is at room temperature. Copper rises ~0.39 %/K, so a winding at
      100 C is about +30 %. No vendor publishes a hot resistance or a
      thermal model. Results here are therefore cold-motor results and
      `assumesColdWinding` says so on every point.
   Both are recorded on the returned object so a caller can see them
   rather than inherit them silently.
   ===================================================================== */

/* Conventions under which the printed resistance can enter the loss model.
   Ordered by how much the vendor actually stated. `phaseToPhase` is
   accepted but flagged: the terminal pair is stated, the winding is not,
   so R_phase is not strictly recoverable — the printed value is used as
   the lumped R the standard model wants, which is what KDE's own
   Km = Kt/sqrt(R) identity shows it to be on the one vendor that states
   both. */
export const USABLE_RESISTANCE_CONVENTIONS = Object.freeze([
  "phaseToPhaseDelta", "phaseToPhaseWye", "phaseToPhase",
]);

const RPM_TO_RADS = 2 * Math.PI / 60;

/* Why a motor may not be modelled. Returns every missing quantity rather
   than the first, so a catalogue survey can count causes. */
export function modellability(entry) {
  const missing = [];
  const conv = entry?.resistance_convention ?? null;
  if (!USABLE_RESISTANCE_CONVENTIONS.includes(conv))
    missing.push(conv === "undeclared" || conv == null
      ? "resistance convention not stated by the vendor"
      : `unrecognised resistance convention "${conv}"`);
  if (!(entry?.internal_resistance_mohm > 0)) missing.push("no published resistance");
  if (!(entry?.kt_nm_per_a > 0) && !(entry?.kv > 0))
    missing.push("neither Kt nor Kv published");
  if (!(entry?.no_load_current_i0_a > 0)) missing.push("no no-load current");
  if (entry?.no_load_current_i0_a > 0 && !(entry?.no_load_current_measured_at_v > 0))
    missing.push("no-load current published without its reference voltage");
  return {
    modellable: missing.length === 0,
    missing: Object.freeze(missing),
    convention: conv,
    conventionFullyStated: conv === "phaseToPhaseDelta" || conv === "phaseToPhaseWye",
  };
}

/* Catalogue entry -> the constants this module works in.

   Kt is preferred as published and derived from Kv only when absent, via
   the definition Kt = 9.5493/Kv (60/2pi). On the four KDE motors where
   both are printed the two agree to 0.2 %, so the fallback is a
   definition rather than a guess — but `ktSource` records which was used,
   because a derived Kt inherits Kv's rounding. */
export function motorConstants(entry) {
  const m = modellability(entry);
  if (!m.modellable)
    throw new Error(`motor: ${entry?.manufacturer ?? "?"} ${entry?.model ?? "?"} `
      + `cannot be modelled from its datasheet — ${m.missing.join("; ")}`);
  const kv = entry.kv > 0 ? entry.kv : null;
  const ktPublished = entry.kt_nm_per_a > 0 ? entry.kt_nm_per_a : null;
  const kt = ktPublished ?? (60 / (2 * Math.PI)) / kv;
  return Object.freeze({
    model: entry.model,
    manufacturer: entry.manufacturer,
    kv,
    ktNmPerA: kt,
    ktSource: ktPublished ? "published" : "derived from Kv by Kt = 9.5493/Kv",
    kmNmPerSqrtW: entry.km_nm_per_sqrtw ?? null,
    rmOhm: entry.internal_resistance_mohm / 1000,
    i0A: entry.no_load_current_i0_a,
    i0RefV: entry.no_load_current_measured_at_v,
    resistanceConvention: m.convention,
    windingTopology: entry.winding_topology ?? null,
    resistanceLabelOnSource: entry.internal_resistance_label_on_source ?? null,
    maxContinuousCurrentA: entry.max_continuous_current_a ?? null,
    maxPowerW: entry.max_power_w ?? null,
    massG: entry.mass_g ?? null,
    massGWithCables: entry.mass_g_with_cables ?? null,
    sourceUrl: entry.source_url ?? null,
  });
}

/* Does the vendor's own printed set hang together?

   Km = Kt/sqrt(R) by definition, and Kt = 9.5493/Kv. A vendor that prints
   all four gives two independent identities to check, and if they hold,
   the R it prints IS the R the standard model wants — no conversion
   applies. On KDE's four motors both close to 0.4 %.

   This is the single strongest check available without a bench, so it is
   exposed rather than buried in a gate: a catalogue entry that fails it
   has a transcription error or a resistance measured some other way. */
export function constantsSelfConsistency(c) {
  const out = { model: c.model };
  if (c.kv > 0) {
    out.ktFromKv = (60 / (2 * Math.PI)) / c.kv;
    out.ktDeltaPct = 100 * (c.ktNmPerA - out.ktFromKv) / out.ktFromKv;
  }
  if (c.kmNmPerSqrtW > 0) {
    out.rFromKm = Math.pow(c.ktNmPerA / c.kmNmPerSqrtW, 2);
    out.rDeltaPct = 100 * (c.rmOhm - out.rFromKm) / out.rFromKm;
  }
  out.checkable = out.ktDeltaPct !== undefined && out.rDeltaPct !== undefined;
  return out;
}

/* THE MOTOR POINT. Shaft torque and speed in, electrical demand out.

   Torque and RPM are the natural handoff from the rotor block: a
   propeller at an RPM needs a shaft power, and M = P_shaft/omega.

   Everything returned is computed from published constants and the two
   arguments. Nothing is fitted, nothing is clamped, and no efficiency is
   assumed — eta is an OUTPUT here, never an input. */
export function motorPoint(c, { torqueNm, rpm }) {
  if (!(torqueNm > 0)) throw new Error(`motor: torque must be positive, got ${torqueNm}`);
  if (!(rpm > 0)) throw new Error(`motor: RPM must be positive, got ${rpm}`);
  const omega = rpm * RPM_TO_RADS;
  const currentA = torqueNm / c.ktNmPerA + c.i0A;
  const backEmfV = omega / (c.kv * RPM_TO_RADS);
  const voltageV = backEmfV + currentA * c.rmOhm;
  const elecPowerW = voltageV * currentA;
  const mechPowerW = torqueNm * omega;
  const copperLossW = currentA * currentA * c.rmOhm;
  return {
    torqueNm, rpm, omega,
    currentA, backEmfV, voltageV,
    elecPowerW, mechPowerW,
    copperLossW,
    /* No-load drag: the I0 share of the current carried at the BACK-EMF,
       not at the terminal voltage. I0's share of the resistive drop is
       already inside copperLossW = I^2 R, so charging it at V too would
       double-count it. With those two terms the split is exact:

           P_elec = back-EMF * I + I^2 R
                  = (M/Kt) * back-EMF + I0 * back-EMF + I^2 R

       and the first term is P_mech whenever Kt = 9.5493/Kv. Kt and Kv are
       published independently and agree to 0.23 % across the KDE set, so
       the decomposition closes to that — `closureW` reports the residual
       rather than hiding it. Iron loss is inside the I0 term; see the
       header for why no vendor lets us separate it. */
    noLoadLossW: c.i0A * backEmfV,
    closureW: elecPowerW - (mechPowerW + copperLossW + c.i0A * backEmfV),
    etaMotor: mechPowerW / elecPowerW,
    /* Carried so a caller cannot inherit the approximations silently. */
    assumesColdWinding: true,
    i0RefV: c.i0RefV,
    i0UsedOutsideRefV: true,
    resistanceConvention: c.resistanceConvention,
  };
}

/* Same point, entered from shaft power instead of torque — the form the
   rotor block hands over. */
export function motorPointFromShaftPower(c, { shaftPowerW, rpm }) {
  if (!(rpm > 0)) throw new Error(`motor: RPM must be positive, got ${rpm}`);
  return motorPoint(c, { torqueNm: shaftPowerW / (rpm * RPM_TO_RADS), rpm });
}

/* Is this operating point inside what the vendor publishes?

   Returns a verdict per limit and `null` where the vendor publishes no
   limit — null means "not stated", never "unlimited". A caller must treat
   an unstated limit as unknown, because a motor run past its continuous
   rating fails thermally, and thermal behaviour is precisely what none of
   these datasheets describes. */
export function limitStatus(c, point) {
  const lim = (value, max) =>
    max == null ? { value, max: null, stated: false, within: null, marginPct: null }
                : { value, max, stated: true, within: value <= max,
                    marginPct: 100 * (max - value) / max };
  const current = lim(point.currentA, c.maxContinuousCurrentA);
  const power = lim(point.elecPowerW, c.maxPowerW);
  const exceeded = [current, power].filter((x) => x.within === false).length;
  return {
    current, power,
    withinPublishedLimits: exceeded === 0,
    /* A point can be "within limits" only because no limit was published.
       Say which case it is. */
    limitsStated: [current, power].filter((x) => x.stated).length,
    note: current.stated
      ? "continuous rating; KDE states its continuous ratings hold for 180 s"
      : "vendor publishes no continuous current rating for this motor",
  };
}
