/* =====================================================================
   TURBOELECTRIC POWERTRAIN — turboshaft + generator, battery for emergency
   =====================================================================
   The architecture NASA uses for its fuel-burning distributed-electric UAM
   concepts (the turboelectric lift+cruise and tiltwing): one turboshaft
   drives a generator; the generator feeds the same electric motors a
   battery aircraft has; a small battery exists only to land after the
   turboshaft or generator fails.

     "the generator power is adjusted in trim for zero battery energy flow,
      so generator power equals the required motor power"
        [SRC Johnson, Silva & Solis, AHS 2018 (NTRS 20180003381), p.7]
     "the reference vehicles are sized for a second mission ... hover for
      two minutes at hover out of ground effect (HOGE) power (roughly
      equivalent to a discharge rate of 30C); the batteries are expected to
      be used only once for this contingency"
        [SRC NASA/TM-20210017971 §3]
     "maximum mission current 4C, emergency 14C"
        [SRC Johnson & Silva, Aeronautical Journal 2022, p.68]; and "The
      discharge rate is the active sizing constraint for the battery."
        [SRC Silva et al., AIAA ATIO 2018 (NTRS 20180006683), p.13]

   THE ENGINE MODEL IS THE SIMPLE FORM OF NDARC'S REFERRED PARAMETER
   TURBOSHAFT ENGINE MODEL (NASA/TP-20220000355 §21, p.204): "For a simple
   model, the power available can be constant, Pa = P0; or the referred power
   can be constant, Pa = P0(δ√θ)", and "the referred performance can be
   constant: w_req = w_0C(δ√θ)q = sfc0C·Pq". The referred-power form is used,
   so power lapses with altitude. Two things it gets wrong are reported as
   model omissions, not patched: sfc does not vary with power setting, and
   √θ gives MORE power on a hot day, where a real turboshaft is
   temperature-limited and gives less (NDARC's full model carries that in
   K_spa(θ); the simple form does not).

   THE ENGINE IS RATED LIKE NASA'S. The turboelectric reference vehicles are
   sized at "Condition 1: ... HOGE at 6,000 ft ISA and 100% Maximum Rated
   Power" and "Condition 2: cruise climb at 500fpm at 10,000 ft ISA ... at
   100% MRP" [SRC NASA/TM-20210017971 §3], with the generator trimmed to
   carry the motors. So the turboshaft sea-level rating is the larger of
   (lift motors at their installed rating, at the hover condition) and (the
   climb or cruise demand, at cruise altitude), each through the generator
   and gearbox efficiencies and divided by that condition's δ√θ.

   THE TECHNOLOGY NUMBERS are NASA's UAM engine table, the one its concept
   vehicles were sized with [SRC Johnson, Silva & Solis 2018, Table 4:
   size hp / weight lb/hp / MCP SLS sfc lb/hp-hr = 4000/0.14/0.35,
   750/0.23/0.48, 200/0.50/0.54, 100/0.70/0.70]. Between rows the tool
   interpolates in log(power) [LAY] on the sea-level rating: the rows are different engines at
   different technology levels, so the interpolation is a trend, not a
   model of any engine. Outside 100-4000 hp the end row is used and a check
   says so.
   ===================================================================== */

export const HP = 0.745699872;    // kW per hp
const LB = 0.45359237;            // kg per lb
const LB_PER_HP_HR_TO_KG_PER_KWH = LB / HP;   // 0.6083

export const TURBOSHAFT_TABLE = [   // [SRC Johnson, Silva & Solis 2018, Table 4]
  { hp: 100,  lbPerHp: 0.70, sfc: 0.70 },
  { hp: 200,  lbPerHp: 0.50, sfc: 0.54 },
  { hp: 750,  lbPerHp: 0.23, sfc: 0.48 },
  { hp: 4000, lbPerHp: 0.14, sfc: 0.35 },
];

export const TURBOELECTRIC_DEFAULTS = {
  /* [SRC Johnson, Silva & Solis 2018, p.5] the motor/generator model has
     "constant efficiency η = 95%". */
  etaGenerator: 0.95,
  /* [SRC ibid., p.5] "All transmissions modeled here have losses of 2%."
     Applied between turboshaft and generator. */
  etaGearbox: 0.98,
  /* [SRC ibid., p.5 and Table 11] "0.15 lb/hp for the tiltwing generator
     (2840 hp)"; Table 11 lists 3239 hp at 0.150. It comes from NDARC's high
     torque-to-weight motor regression "with technology factor 1.63 to account
     for the entire motor system weight", so it covers the machine system.
     The only published generator figure, at a larger size than most designs
     here: a technology assumption, not a scaling law. */
  generatorLbPerHp: 0.150,
  /* [SRC ibid., p.5] "Turboshaft and reciprocating engine fuel flow is
     increased as usual by 5% to account for engine degradation" (NDARC Kffd). */
  fuelFlowFactor: 1.05,
  /* [SRC ibid., Table 10] side-by-side hybrid: 67 lb of fuel tank for a
     350 lb tank capacity; turboshaft variant 69 lb for 364 lb. Both 0.19. */
  tankFraction: 0.19,
  /* Emergency: engine-out hover for 2 min [SRC TM-20210017971 §3] at no more
     than 14C [SRC Johnson & Silva 2022, p.68]. */
  emergencyHoverS: 120,
  emergencyCRate: 14,
};

/** Size-dependent specific weight (kg/kW) and sfc (kg/kWh) at a rating. */
export function turboshaftTechnology(ratedKW) {
  const hp = ratedKW / HP;
  const T = TURBOSHAFT_TABLE;
  const clamped = hp < T[0].hp || hp > T[T.length - 1].hp;
  const x = Math.log(Math.min(T[T.length - 1].hp, Math.max(T[0].hp, hp)));
  let i = 0;
  while (i < T.length - 2 && x > Math.log(T[i + 1].hp)) i++;
  const a = T[i], b = T[i + 1];
  const t = (x - Math.log(a.hp)) / (Math.log(b.hp) - Math.log(a.hp));
  const lbPerHp = a.lbPerHp + t * (b.lbPerHp - a.lbPerHp);
  const sfc = a.sfc + t * (b.sfc - a.sfc);
  return {
    hp, clamped,
    kgPerKW: lbPerHp * LB / HP,
    sfcKgPerKWh: sfc * LB_PER_HP_HR_TO_KG_PER_KWH,
    lbPerHp, sfcLbPerHpHr: sfc,
  };
}

/**
 * Size the turboelectric additions for one sizing-loop pass.
 * @param seg  electrical power (kW) and energy (kWh) the motors draw, per
 *             segment: { Phov, Pcl, Pcr, Pdc, Pres, Emission, Eres }
 * @param bat  { sedEff Wh/kg, socFloor, etaB }  — the pack convention in use
 * @param o    overrides of TURBOELECTRIC_DEFAULTS
 */
/** δ√θ for an atmosphere point {P [Pa], T [K]} (NDARC referred power). */
export function referredLapse(atm) {
  return (atm.P / 101325) * Math.sqrt(atm.T / 288.15);
}

/**
 * @param cond { installedHoverKW, installedCruiseKW, lapseHover, lapseCruise }
 *             installed motor power (same convention as seg.Phov) and δ√θ at
 *             the hover and cruise conditions. Omitted: demand only, no lapse.
 */
export function sizeTurboelectric(seg, bat, o = {}, cond = {}) {
  const k = { ...TURBOELECTRIC_DEFAULTS, ...o };
  const hoverKW = Math.max(seg.Phov, cond.installedHoverKW ?? 0, 0);
  const cruiseKW = Math.max(seg.Pcl, seg.Pcr, cond.installedCruiseKW ?? 0, 0);
  const generatorKW = Math.max(hoverKW, cruiseKW);           // zero net battery flow at every rating
  const eta = k.etaGenerator * k.etaGearbox;
  const ratedKW = Math.max(hoverKW / (eta * (cond.lapseHover ?? 1)),
                           cruiseKW / (eta * (cond.lapseCruise ?? 1)));   // sea-level static rating
  const tech = turboshaftTechnology(ratedKW);
  const engineKg = tech.kgPerKW * ratedKW;
  const generatorKg = k.generatorLbPerHp * (generatorKW / HP) * LB;
  const toShaft = 1 / (k.etaGenerator * k.etaGearbox);
  const fuelBurnKg = tech.sfcKgPerKWh * seg.Emission * toShaft * k.fuelFlowFactor;
  const fuelReserveKg = tech.sfcKgPerKWh * seg.Eres * toShaft * k.fuelFlowFactor;
  const fuelKg = fuelBurnKg + fuelReserveKg;                 // carried at take-off
  const tankKg = k.tankFraction * fuelKg;                    // tank sized to what is carried
  /* Emergency battery: power at the emergency C-rate, and the 2-min energy
     through the same usable-energy convention the battery aircraft uses. */
  const Eemerg = seg.Phov * k.emergencyHoverS / 3600;        // kWh drawn
  const capByPowerKWh = seg.Phov / k.emergencyCRate;         // C = P/E
  const WP = capByPowerKWh * 1000 / Math.max(1e-9, bat.sedEff);
  const WE = Eemerg * 1000 / Math.max(1e-9, (1 - bat.socFloor) * bat.sedEff * bat.etaB);
  const batteryKg = Math.max(WP, WE);
  return {
    generatorKW, ratedKW, engineKg, generatorKg, tankKg,
    fuelKg, fuelBurnKg, fuelReserveKg,
    batteryKg, batterySizedBy: WP >= WE ? "power" : "energy",
    emergencyEnergyKWh: Eemerg,
    batteryCapacityKWh: batteryKg * bat.sedEff / 1000,
    tech, k,
    ratingSetBy: hoverKW / (cond.lapseHover ?? 1) >= cruiseKW / (cond.lapseCruise ?? 1) ? "hover" : "climb/cruise",
  };
}
