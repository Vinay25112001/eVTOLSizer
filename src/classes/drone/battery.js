/* =====================================================================
   BATTERY — energy, and the two ways a published pack lies about it
   =====================================================================
   The ESC block says what the battery must deliver. This block says how
   long it can deliver it, and refuses to answer in the two cases where
   the published data does not support an answer.

   ── THE ARITHMETIC EVERYONE GETS WRONG ───────────────────────────────
   Energy is capacity times the MEAN DISCHARGE voltage. A LiPo cell runs
   4.20 V charged, about 3.85 V mean, 3.0-3.5 V at cut-off. Multiplying
   capacity by the CHARGED voltage over-predicts energy by roughly 14 %,
   and the error is invisible because both numbers came off the same page.

   That is not hypothetical. Of five DJI packs surveyed, four have
   Ah x V_printed equal to their published Wh to the digit. One does not:

     DJI TB60   5935 mAh, "Voltage 52.8 V", published 274 Wh
                5.935 Ah x 52.8 V = 313.4 Wh   ->  +14.4 %

   52.8 V on 12S is 4.40 V/cell. DJI's own Mavic 3 page prints the nominal
   and the limit as SEPARATE fields - "Voltage 15.4 V" (3.85 V/cell) and
   "Charging Voltage Limit 17.6 V" (4.40 V/cell) - so 4.40 is DJI's charge
   limit per cell, sitting in the nominal's field. The published energy
   over the published capacity gives 46.17 V, i.e. 3.85 V/cell, matching
   every other DJI pack exactly.

   SO: read the published Wh. Where Ah x V disagrees with it, the voltage
   field is the fault, not the energy figure. Where there is no published
   Wh, deriving one is allowed ONLY if the voltage field looks like a
   nominal, and the result is labelled derived.

   ── THE SECOND LIE IS AN OMISSION: USABLE FRACTION ───────────────────
   No pack here is flown to zero. A multirotor lands on a reserve, and
   lithium cells are damaged by deep discharge. Not one manufacturer page
   in this survey states a cut-off criterion or a usable fraction.

   So it is NOT a constant in this file. `usableFraction` is a REQUIRED
   argument with no default, the same treatment figure of merit gets in
   the rotor layer, because a buried 0.8 here moves every endurance number
   by 20 % while looking like arithmetic. Two sourced criteria are offered
   for a caller to choose between, and both are cited:

     0.85  Dai, Quan, Ren & Cai (T-Mech 2019) Eq. (38), "the coefficient
           0.85 denotes a 15% remaining capacity to avoid over discharge"
     3.5 V/cell  Bauersfeld & Scaramuzza (arXiv 2109.04741) define end of
           discharge as "discharged to a cell voltage of 3.5 V" - a
           VOLTAGE criterion, which maps to a different fraction on every
           cell chemistry and is not convertible without a discharge curve

   These disagree, and neither is a manufacturer statement. That is the
   state of the published art, not a gap this file fills.

   ── WHAT IS NOT MODELLED HERE, AND WHY ───────────────────────────────
   Capacity falls with discharge rate (Peukert), with temperature, and
   with age. None of the packs surveyed publishes a rate-capacity curve, a
   temperature derating or a cycle-life number - the Molicel cells publish
   a cycle-life GRAPH but print no figure. Modelling any of it would mean
   inventing the curve. Endurance from this block is therefore a
   fresh-pack, room-temperature, constant-power figure, and it says so on
   every result rather than leaving a reader to assume otherwise.
   ===================================================================== */

/* Per-cell reference voltages. Nominal is what multiplies capacity to give
   energy; the others are what vendors sometimes print in its place. */
export const PER_CELL_V = Object.freeze({
  nominalBand: Object.freeze([3.6, 3.95]),
  lipoCharged: 4.20,
  lihvCharged: 4.35,
  typicalCutoff: 3.0,
});

/* Sourced end-of-discharge criteria. Offered, never applied by default. */
export const USABLE_FRACTION_SOURCES = Object.freeze([
  Object.freeze({
    value: 0.85,
    basis: "capacity fraction",
    source: "Dai, Quan, Ren & Cai, IEEE/ASME T-Mech 2019, Eq. (38)",
    verbatim: "the coefficient 0.85 denotes a 15% remaining capacity to avoid over discharge",
  }),
  Object.freeze({
    value: null,
    basis: "cell voltage",
    source: "Bauersfeld & Scaramuzza, arXiv 2109.04741",
    verbatim: "discharged to a cell voltage of 3.5 V",
    note: "A voltage criterion maps to a different capacity fraction on every "
        + "chemistry and cannot be converted without that cell's discharge "
        + "curve, which none of the surveyed packs publishes.",
  }),
]);

const ENERGY_TOLERANCE_PCT = 2.0;

/* ── ONE PACK SHAPE, FROM TWO SOURCES ───────────────────────────────
   Packs reach this module from two places with different field names:
   the component catalogue (snake_case, generated from the parts survey)
   and the whole-vehicle truth set (camelCase, generated from the vehicle
   survey). Reading the wrong field silently yields `undefined`, which
   would make `packEnergyWh` report "not published" for a pack that
   publishes perfectly well — the exact failure this module exists to
   prevent, arriving by the back door.

   So the mapping is explicit and in one place, and `normalisePack`
   refuses a shape it does not recognise rather than returning a hollow
   object.

   NOTE ON THE CATALOGUE'S TWO C-RATING FIELDS. `c_rating_continuous` is
   what the vendor PRINTS; `c_rating_continuous_computed` is capacity
   divided into the published discharge current, computed because most
   cell makers print no C rating at all. Only the published one is
   carried as published — the computed one would otherwise become a
   vendor claim it never made. */
export function packFromCatalogue(entry) {
  if (!entry || typeof entry !== "object")
    throw new Error("battery: packFromCatalogue needs a catalogue entry");
  return Object.freeze({
    id: entry.id ?? null,
    manufacturer: entry.manufacturer ?? null,
    model: entry.model ?? null,
    chemistry: entry.chemistry ?? null,
    capacityMah: entry.capacity_mah ?? null,
    voltagePrintedV: entry.nominal_voltage_v ?? null,
    voltagePrintedLabel: "nominal_voltage_v",
    energyWhPublished: entry.capacity_wh ?? null,
    energyWhSource: entry.capacity_wh_source ?? null,
    cellsSeries: entry.cell_count_series ?? null,
    cellsParallel: entry.cell_count_parallel ?? null,
    maxChargeVoltageV: entry.max_charge_voltage_v ?? null,
    minDischargeVoltageV: entry.min_discharge_voltage_v ?? null,
    maxContinuousDischargeA: entry.max_continuous_discharge_a ?? null,
    cRatingContinuous: entry.c_rating_continuous ?? null,
    cRatingContinuousComputed: entry.c_rating_continuous_computed ?? null,
    massG: entry.mass_g ?? null,
    sourceUrl: entry.source_url ?? null,
    origin: "catalogue",
  });
}

/* Accepts either shape. A pack already in this module's shape passes
   through; a catalogue entry is converted; anything else is refused. */
export function normalisePack(entry) {
  if (!entry || typeof entry !== "object")
    throw new Error("battery: expected a pack object");
  if (entry.capacityMah != null || entry.energyWhPublished != null) return entry;
  if (entry.capacity_mah != null || entry.capacity_wh != null) return packFromCatalogue(entry);
  throw new Error(`battery: unrecognised pack shape for ${entry.id ?? entry.model ?? "?"} `
    + `— expected capacityMah/energyWhPublished (truth set) or capacity_mah/capacity_wh (catalogue)`);
}

/* ── BUILDING A PACK OUT OF CELLS ───────────────────────────────────
   The catalogue holds both finished packs (Tattu) and bare cells
   (Molicel 21700). A cell is not a pack, and assembling one is real
   arithmetic that must not be done by hand at the call site — doing it
   by hand is what produced a "pack" carrying a single cell's 3.6 V
   beside six cells' energy, which the voltage audit then correctly
   flagged as a 94 % inconsistency.

   Series multiplies voltage, parallel multiplies capacity, and energy
   multiplies by both. Mass scales with the cell count, and the
   interconnect, BMS, case and wiring are NOT included — no cell vendor
   publishes those, and they are real mass. `overheadFraction` is
   therefore declared, defaults to zero, and the result says plainly that
   zero means bare cells only.

   The assembled pack carries `energyWhPublished` because it is built
   from the cell's own published energy, not from Ah x V. That keeps it
   immune to the charged-voltage error by construction. */
export function assemblePack(cellIn, { series, parallel = 1, overheadFraction = 0, id = null } = {}) {
  const cell = normalisePack(cellIn);
  if (!Number.isInteger(series) || series < 1)
    throw new Error(`battery: series count must be a positive integer, got ${series}`);
  if (!Number.isInteger(parallel) || parallel < 1)
    throw new Error(`battery: parallel count must be a positive integer, got ${parallel}`);
  if (!(overheadFraction >= 0))
    throw new Error(`battery: overheadFraction must be >= 0, got ${overheadFraction}`);
  const e = packEnergyWh(cell);
  if (e.wh == null)
    throw new Error(`battery: cannot assemble a pack from ${cell.model ?? "?"} — `
      + `its own energy is not established: ${e.warnings[0]}`);
  if (!(cell.massG > 0))
    throw new Error(`battery: cannot assemble a pack from ${cell.model ?? "?"} — no published cell mass`);
  const n = series * parallel;
  const cellsMassG = cell.massG * n;
  return Object.freeze({
    id: id ?? `${cell.id ?? "cell"}-${series}s${parallel}p`,
    manufacturer: cell.manufacturer, model: `${cell.model} ${series}S${parallel}P`,
    chemistry: cell.chemistry,
    capacityMah: (cell.capacityMah ?? 0) * parallel,
    voltagePrintedV: (cell.voltagePrintedV ?? 0) * series,
    voltagePrintedLabel: `${series} x the cell's own nominal`,
    energyWhPublished: e.wh * n,
    energyWhSource: `assembled from ${n} x ${cell.model} at its published ${e.wh} Wh per cell`,
    cellsSeries: series, cellsParallel: parallel, cellCount: n,
    maxChargeVoltageV: cell.maxChargeVoltageV == null ? null : cell.maxChargeVoltageV * series,
    minDischargeVoltageV: cell.minDischargeVoltageV == null ? null : cell.minDischargeVoltageV * series,
    maxContinuousDischargeA: cell.maxContinuousDischargeA == null ? null
      : cell.maxContinuousDischargeA * parallel,
    cRatingContinuous: cell.cRatingContinuous ?? null,
    massG: cellsMassG * (1 + overheadFraction),
    cellsMassG, overheadFraction,
    massNote: overheadFraction === 0
      ? "CELLS ONLY. Interconnect, BMS, case, wiring and connectors are not included — "
        + "no cell vendor publishes them, and they are real mass. Declare overheadFraction."
      : `cells ${cellsMassG.toFixed(0)} g plus a declared ${(100 * overheadFraction).toFixed(0)} % `
        + `for interconnect, BMS, case and wiring`,
    sourceUrl: cell.sourceUrl,
    origin: "assembled",
  });
}

/* Does the printed voltage reproduce the printed energy?

   Returns the audit whether or not it passes, because the interesting
   case is the one that fails. `perCellPrintedV` is the discriminator:
   a nominal sits at 3.6-3.95 V/cell, a charge limit at 4.2 or above. */
export function voltageFieldAudit(packIn) {
  const pack = normalisePack(packIn);
  const ah = (pack.capacityMah ?? 0) / 1000;
  const v = pack.voltagePrintedV ?? null;
  const cells = pack.cellsSeries ?? null;
  const whPub = pack.energyWhPublished ?? null;
  if (!(ah > 0) || !(v > 0))
    return { checkable: false, why: "capacity or voltage not published" };
  const ahTimesV = ah * v;
  const perCellPrinted = cells ? v / cells : null;
  const out = {
    checkable: true, ahTimesVWh: ahTimesV, perCellPrintedV: perCellPrinted,
    energyWhPublished: whPub,
  };
  if (whPub > 0) {
    out.errorPct = 100 * (ahTimesV - whPub) / whPub;
    out.consistent = Math.abs(out.errorPct) <= ENERGY_TOLERANCE_PCT;
    out.impliedNominalV = whPub / ah;
    out.perCellImpliedV = cells ? (whPub / ah) / cells : null;
  } else {
    out.errorPct = null; out.consistent = null;
    out.impliedNominalV = null; out.perCellImpliedV = null;
  }
  out.printedFieldLooksLikeNominal = perCellPrinted != null
    && perCellPrinted >= PER_CELL_V.nominalBand[0]
    && perCellPrinted <= PER_CELL_V.nominalBand[1];
  return out;
}

/* Pack energy in watt-hours.

   Published Wh wins, always. Deriving is permitted only when there is no
   published figure AND the voltage field looks like a nominal — because a
   derivation from a charge limit is exactly the 14 % error this module
   exists to prevent. Where neither holds, it returns null with a reason
   rather than a number, and a caller must handle that. */
export function packEnergyWh(packIn) {
  const pack = normalisePack(packIn);
  const audit = voltageFieldAudit(pack);
  const warnings = [];
  if (pack.energyWhPublished > 0) {
    if (audit.checkable && audit.consistent === false)
      warnings.push(`the printed voltage ${pack.voltagePrintedV} V does not reproduce `
        + `the published ${pack.energyWhPublished} Wh (Ah x V gives `
        + `${audit.ahTimesVWh.toFixed(1)} Wh, ${audit.errorPct.toFixed(1)} % out). `
        + `At ${audit.perCellPrintedV.toFixed(2)} V/cell the printed field is a charge `
        + `limit, not a nominal; the published energy implies `
        + `${audit.perCellImpliedV.toFixed(2)} V/cell. The published energy is used.`);
    return {
      wh: pack.energyWhPublished, source: "published", audit,
      warnings: Object.freeze(warnings),
    };
  }
  if (audit.checkable && audit.printedFieldLooksLikeNominal) {
    warnings.push(`no published energy; derived as capacity x the printed nominal `
      + `(${audit.perCellPrintedV.toFixed(2)} V/cell, inside the nominal band). DERIVED, not published.`);
    return { wh: audit.ahTimesVWh, source: "derived", audit, warnings: Object.freeze(warnings) };
  }
  return {
    wh: null, source: "unavailable", audit,
    warnings: Object.freeze([
      audit.checkable
        ? `no published energy, and the printed ${audit.perCellPrintedV?.toFixed(2)} V/cell `
          + `is outside the nominal band ${PER_CELL_V.nominalBand.join("-")}, so deriving `
          + `energy from it would reproduce the charged-voltage error. Refused.`
        : `capacity or voltage not published, so energy cannot be established.`,
    ]),
  };
}

/* Usable energy. `usableFraction` is REQUIRED — see the header. */
export function usableEnergyWh(packIn, { usableFraction, packs = 1 } = {}) {
  const pack = normalisePack(packIn);
  if (!(usableFraction > 0 && usableFraction <= 1))
    throw new Error("battery: usableFraction must be declared explicitly in (0, 1]. "
      + "No manufacturer in this survey publishes a cut-off criterion, so there is "
      + "no defensible default; see USABLE_FRACTION_SOURCES for two cited choices.");
  const e = packEnergyWh(pack);
  if (e.wh == null) return { ...e, usableWh: null, packs, usableFraction };
  return {
    ...e, packs, usableFraction,
    totalWh: e.wh * packs,
    usableWh: e.wh * packs * usableFraction,
  };
}

/* Endurance at a constant power draw.

   Constant power, fresh pack, room temperature. Every one of those is a
   simplification the published data cannot support removing, and each is
   named on the result so it cannot be inherited silently. */
export function enduranceMin({ usableWh, powerW }) {
  if (!(usableWh > 0)) throw new Error(`battery: usable energy must be positive, got ${usableWh}`);
  if (!(powerW > 0)) throw new Error(`battery: power must be positive, got ${powerW}`);
  return {
    minutes: 60 * usableWh / powerW,
    usableWh, powerW,
    assumes: Object.freeze([
      "constant power for the whole flight",
      "a fresh pack at its rated capacity",
      "room temperature",
      "no rate-capacity (Peukert) derating — no surveyed pack publishes the curve",
    ]),
  };
}

/* Can the pack supply this current?

   Checked against the published continuous discharge current where there
   is one, and against a published C rating otherwise. Null means the
   vendor publishes neither — unknown, never unlimited. */
export function dischargeLimitStatus(packIn, busCurrentA) {
  const pack = normalisePack(packIn);
  const ah = (pack.capacityMah ?? 0) / 1000;
  const stated = pack.maxContinuousDischargeA ?? null;
  const cRating = pack.cRatingContinuous ?? null;
  const maxA = stated ?? (cRating && ah ? cRating * ah : null);
  if (maxA == null)
    return { currentA: busCurrentA, maxA: null, stated: false, within: null,
             cRateDemanded: ah ? busCurrentA / ah : null,
             note: "no continuous discharge current or C rating published for this pack" };
  return {
    currentA: busCurrentA, maxA, stated: true,
    source: stated != null ? "published continuous discharge current" : "computed from published C rating",
    within: busCurrentA <= maxA,
    marginPct: 100 * (maxA - busCurrentA) / maxA,
    cRateDemanded: ah ? busCurrentA / ah : null,
  };
}
