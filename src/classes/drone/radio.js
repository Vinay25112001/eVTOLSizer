/* =====================================================================
   RADIO — a link budget, and the one number nobody states
   =====================================================================
   A control link is the only subsystem on a drone whose failure is
   immediate and total, and the only one whose published headline figure
   — "range" — is almost never accompanied by the conditions that
   produced it. This module computes the range instead, from physics,
   and refuses where the published data cannot support the computation.

   ── THE ARITHMETIC, WHICH IS NOT IN DOUBT ────────────────────────────
   Friis, in the free-space form used throughout radio engineering:

       FSPL(dB) = 20 log10(d_km) + 20 log10(f_MHz) + 32.44
       P_rx(dBm) = EIRP(dBm) + G_rx(dBi) - FSPL(dB)
       margin(dB) = P_rx - sensitivity(dBm)

   and the range at zero margin follows by solving for d. The constant
   32.44 is for kilometres and megahertz and is derived, not remembered:
   20 log10(4*pi/c) with c in km/s and f in MHz.

   FREE SPACE IS OPTIMISTIC AND THE RESULT SAYS SO. There is no ground
   reflection here, no Fresnel obstruction, no fading margin and no
   airframe blockage. A real link is worse, often by 10-20 dB. What this
   computes is a CEILING, which is still useful: a radio whose free-space
   ceiling is below the mission radius cannot fly the mission, and that
   is a decidable fact.

   ── THE NUMBER NOBODY STATES ─────────────────────────────────────────
   EIRP is what the Friis equation needs. Vendors publish "max TX power",
   and whether that figure is CONDUCTED power at the connector or EIRP
   radiated by the antenna is a different quantity:

       EIRP(dBm) = P_conducted(dBm) - cable loss(dB) + G_tx(dBi)

   so the two differ by the antenna gain, which on these products runs
   2 to 5 dBi. Five dB is a factor of 1.8 in range.

   OF FIFTEEN SURVEYED RADIOS, ONE STATES WHICH IT MEANS. RFDesign says
   so explicitly, and says it by giving the conversion formula and then
   quoting the FCC EIRP ceiling separately. Ten say nothing at all. Two
   are close enough to a regulatory limit that the limit's own units
   hint at the answer — the archive records the hint and does not treat
   it as a statement.

   So this module CLASSIFIES rather than converts, exactly as the motor
   block does with resistance:

     stated      the vendor says conducted or EIRP -> range is computed
     unstated    -> range is NOT computed. A BRACKET is returned instead,
                   whose width is the cost of the missing statement.

   A single range number for an unstated radio would be a guess wearing
   a decimal point.

   ── AND THE PUBLISHED RANGE, WHERE THERE IS ONE ──────────────────────
   Six of fifteen publish no range figure at all. Every entry carries
   `range_conditions`, including the ones whose conditions are "NO RANGE
   CLAIM AT ALL" — an absence recorded as data. Where a vendor states
   both a range and the antenna gain it used, the two can be compared,
   and the comparison is the useful output: it says whether the claim is
   consistent with physics or needs conditions the vendor did not give.
   ===================================================================== */

/* 20 log10(4 pi / c), with c in km/s and f in MHz. Derived here rather
   than quoted, so the units cannot drift: c = 299792.458 km/s. */
export const FSPL_CONST = 20 * Math.log10(4 * Math.PI / 299792.458) + 120;

export const dBmOf = (mW) => (mW > 0 ? 10 * Math.log10(mW) : null);
export const mWOf = (dBm) => Math.pow(10, dBm / 10);

export function fsplDb(distanceKm, freqMHz) {
  if (!(distanceKm > 0) || !(freqMHz > 0))
    throw new Error("radio: distance and frequency must be positive");
  return 20 * Math.log10(distanceKm) + 20 * Math.log10(freqMHz) + FSPL_CONST;
}

/* ── THE BAND IS A SET OF REGULATORY VARIANTS, NOT A NUMBER ─────────
   `frequency_band_mhz` is an object carrying the variants a product
   ships in: {variants: ["2400-2480 (ISM2400 …)", "868 (EU)", …]}. A
   product is not one frequency, and collapsing it to one would hide
   that the SAME radio is a different link in a different domain — 868
   MHz reaches roughly 2.8x further than 2.4 GHz for the same budget,
   which is most of why the 900 MHz variants exist.

   Each variant is parsed to a centre frequency: a range to its midpoint,
   a bare number as itself, and a figure written in GHz scaled. Anything
   unparseable is returned with `mhz: null` rather than dropped, so a
   band the survey recorded but this code cannot read stays visible. */
export function bandVariants(entry) {
  const b = entry?.frequency_band_mhz;
  const out = [];
  /* Numbers inside one variant string may be a contiguous RANGE
     ("902-928", midpoint is meaningful) or two DISTINCT bands ("2.4 GHz
     and 900 MHz simultaneously", where a midpoint of 1650 MHz is a
     frequency the radio never transmits on). They are told apart by
     span: anything wider than an octave is separate bands, and is
     emitted as separate variants rather than averaged. */
  const parse = (label) => {
    const isGHz = /ghz/i.test(label);
    const raw = (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const nums = raw
      .map((x) => (isGHz && x < 100 ? x * 1000 : x))
      .filter((x) => x >= 100 && x <= 100000)
      .sort((a, b) => a - b);
    if (!nums.length) return [{ label, mhz: null }];
    const clusters = [[nums[0]]];
    for (const n of nums.slice(1)) {
      const c = clusters[clusters.length - 1];
      if (n / c[0] <= 2) c.push(n); else clusters.push([n]);
    }
    return clusters.map((c) => {
      const lo = c[0], hi = c[c.length - 1];
      return {
        label: clusters.length > 1 ? `${label} — ${lo === hi ? lo : `${lo}-${hi}`} MHz` : label,
        mhz: (lo + hi) / 2, loMHz: lo, hiMHz: hi,
      };
    });
  };
  if (typeof b === "number") out.push({ label: `${b}`, mhz: b });
  else if (typeof b === "string") out.push(...parse(b));
  else if (b && Array.isArray(b.variants)) for (const v of b.variants) out.push(...parse(String(v)));
  return out;
}

export function centreFrequencyMHz(entry, variantIndex = 0) {
  const v = bandVariants(entry);
  if (!v.length) return null;
  const pick = v[Math.min(variantIndex, v.length - 1)];
  return pick.mhz ?? (v.find((x) => x.mhz != null)?.mhz ?? null);
}

/* ── SENSITIVITY IS PER PACKET RATE, AND THAT IS THE REAL TRADE ─────
   Several products publish sensitivity as a MAP keyed by packet rate —
   ExpressLRS gives thirteen entries from 25 Hz to 1000 Hz. Sensitivity
   worsens as the rate rises, so range and latency trade directly
   against each other on the SAME hardware. Collapsing that map to one
   number would delete the most useful thing the vendor published.

   Returns a sorted list, best sensitivity first, each with whatever the
   key says about its mode. A plain number comes back as a single
   option. */
export function sensitivityOptions(entry) {
  const s = entry?.receiver_sensitivity_dbm;
  if (typeof s === "number" && isFinite(s))
    return [{ mode: "as published", dBm: s, rateHz: null }];
  if (!s || typeof s !== "object") return [];
  const out = [];
  for (const [mode, dBm] of Object.entries(s)) {
    if (typeof dBm !== "number" || !isFinite(dBm)) continue;
    const m = mode.match(/(\d+)\s*Hz/i);
    out.push({ mode, dBm, rateHz: m ? Number(m[1]) : null });
  }
  return out.sort((a, b) => a.dBm - b.dBm);
}

/* The single figure to use when a caller has not chosen a mode: the
   BEST published sensitivity, which is the longest-range, lowest-rate
   option. Chosen explicitly so a range figure is never quietly the
   average of modes that trade against each other. */
export function bestSensitivityDbm(entry) {
  const o = sensitivityOptions(entry);
  return o.length ? o[0].dBm : null;
}

/* Is the published TX power conducted, EIRP, or unstated?

   Only an explicit statement counts. The archive records, for two
   products, that a figure coincides with a regulatory limit expressed
   in EIRP — that is a hint about what the vendor probably meant, and a
   hint is not a statement. It is surfaced as `hint` and never promoted. */
export function powerConvention(entry) {
  const s = String(entry?.tx_power_conducted_or_eirp ?? "");
  if (!s || s === "null") return { convention: "unstated", stated: false, hint: null, verbatim: null };
  const head = s.trim().toUpperCase();
  if (head.startsWith("CONDUCTED"))
    return { convention: "conducted", stated: true, hint: null, verbatim: s };
  if (head.startsWith("EIRP") || head.startsWith("E.I.R.P"))
    return { convention: "eirp", stated: true, hint: null, verbatim: s };
  const hint = /e\.?i\.?r\.?p|e\.?r\.?p/i.test(s)
    ? "the archive notes the figure coincides with a regulatory limit expressed in radiated "
      + "power, which HINTS at EIRP; the vendor does not say so"
    : null;
  return { convention: "unstated", stated: false, hint, verbatim: s };
}

/* EIRP, where it can be established.

   Needs the convention AND, if the figure is conducted, a transmit
   antenna gain. Returns null with a reason otherwise — the caller gets
   `bracket()` instead. */
export function eirpDbm(entry, { txAntennaGainDbi = null, cableLossDb = 0 } = {}) {
  const p = entry?.max_tx_power_mw;
  if (!(p > 0)) return { dBm: null, why: "no transmit power is published" };
  const conv = powerConvention(entry);
  const pd = dBmOf(p);
  if (conv.convention === "eirp")
    return { dBm: pd, why: null, convention: conv, basis: "the published figure IS EIRP" };
  if (conv.convention === "conducted") {
    const g = txAntennaGainDbi ?? entry?.antenna_gain_dbi ?? null;
    if (g == null)
      return { dBm: null, why: "the figure is conducted, but no transmit antenna gain is published, "
        + "and EIRP = conducted - cable loss + antenna gain", convention: conv };
    return { dBm: pd - cableLossDb + g, why: null, convention: conv,
             basis: `conducted ${pd.toFixed(1)} dBm - ${cableLossDb} dB cable + ${g} dBi antenna` };
  }
  return {
    dBm: null, convention: conv,
    why: "the vendor does not state whether the published power is conducted or EIRP. They differ "
       + "by the antenna gain, so a single range figure here would be a guess.",
  };
}

/* Range at zero margin, in km. */
export function rangeKm({ eirpDbm: eirp, rxGainDbi = 0, sensitivityDbm, freqMHz, marginDb = 0 }) {
  if (!(freqMHz > 0)) throw new Error("radio: frequency must be positive");
  if (!isFinite(eirp) || !isFinite(sensitivityDbm))
    throw new Error("radio: EIRP and sensitivity must be finite");
  const budget = eirp + rxGainDbi - sensitivityDbm - marginDb;
  return Math.pow(10, (budget - 20 * Math.log10(freqMHz) - FSPL_CONST) / 20);
}

/* THE BRACKET, for a radio whose convention is unstated.

   The two readings of the same published number are computed and both
   returned. Their ratio is exactly the antenna gain in range terms, and
   it IS the cost of the missing statement — which is the honest thing
   to show instead of a single number. */
export function rangeBracketKm(entry, { assumedTxGainDbi = 2, rxGainDbi = 2, sensitivityDbm = null, marginDb = 0 } = {}) {
  const f = centreFrequencyMHz(entry);
  const s = sensitivityDbm ?? bestSensitivityDbm(entry);
  const p = entry?.max_tx_power_mw;
  if (!(f > 0) || !(s < 0) || !(p > 0)) return null;
  const pd = dBmOf(p);
  const asEirp = rangeKm({ eirpDbm: pd, rxGainDbi, sensitivityDbm: s, freqMHz: f, marginDb });
  const asConducted = rangeKm({ eirpDbm: pd + assumedTxGainDbi, rxGainDbi, sensitivityDbm: s, freqMHz: f, marginDb });
  return {
    lowKm: asEirp, highKm: asConducted, ratio: asConducted / asEirp,
    assumedTxGainDbi, rxGainDbi, freqMHz: f, sensitivityDbm: s,
    why: `The published ${p} mW is read two ways. If it is already EIRP the ceiling is `
       + `${asEirp.toFixed(1)} km; if it is conducted and the antenna adds `
       + `${assumedTxGainDbi} dBi, ${asConducted.toFixed(1)} km. The span is the cost of the `
       + `statement the vendor did not make.`,
  };
}

/* A full assessment of one radio against a mission radius. */
export function assessLink(entry, opts = {}) {
  const { missionRadiusKm, rxGainDbi = 2, txAntennaGainDbi = null,
          cableLossDb = 0, marginDb = 0, variantIndex = 0 } = opts;
  const f = centreFrequencyMHz(entry, variantIndex);
  const s = opts.sensitivityDbm ?? bestSensitivityDbm(entry);
  const warnings = [];
  const conv = powerConvention(entry);

  if (f == null) warnings.push("the frequency band could not be read, so no budget can be computed");
  if (s == null) warnings.push("no receiver sensitivity is published, so no budget can be computed");

  const e = eirpDbm(entry, { txAntennaGainDbi, cableLossDb });
  let computed = null, bracket = null;
  if (f != null && s != null) {
    if (e.dBm != null) {
      computed = {
        rangeKm: rangeKm({ eirpDbm: e.dBm, rxGainDbi, sensitivityDbm: s, freqMHz: f, marginDb }),
        eirpDbm: e.dBm, basis: e.basis,
      };
    } else {
      bracket = rangeBracketKm(entry, { rxGainDbi, marginDb });
      warnings.push(e.why);
    }
  }
  if (conv.hint) warnings.push(conv.hint);

  /* The stated range, and its conditions. An absence is data. */
  const stated = entry?.stated_range_km ?? null;
  const statedIsNumber = typeof stated === "number" && isFinite(stated);
  if (!statedIsNumber) warnings.push(
    typeof stated === "object" && stated !== null
      ? "the stated range is per-region rather than a single figure"
      : "the vendor publishes no range figure at all");

  let meetsMission = null;
  if (missionRadiusKm > 0) {
    const ceiling = computed ? computed.rangeKm : bracket ? bracket.lowKm : null;
    if (ceiling != null) meetsMission = ceiling >= missionRadiusKm;
  }

  return {
    id: entry.product ?? entry.model, manufacturer: entry.manufacturer,
    freqMHz: f, sensitivityDbm: s, maxTxPowerMw: entry?.max_tx_power_mw ?? null,
    latencyMs: entry?.latency_ms ?? null, massG: entry?.mass_g ?? null,
    convention: conv, computed, bracket,
    statedRangeKm: statedIsNumber ? stated : null,
    rangeConditions: entry?.range_conditions ?? null,
    /* Compared only when BOTH exist. Where the vendor states conditions
       including its antenna gain, the comparison is meaningful; where it
       does not, the difference is uninterpretable and is not shown as a
       discrepancy. */
    statedVsComputed: (statedIsNumber && computed)
      ? { ratio: stated / computed.rangeKm,
          note: "free space is a CEILING; a stated range above it needs conditions the vendor did "
              + "not give, and one below it is consistent with a real path" }
      : null,
    meetsMission, missionRadiusKm: missionRadiusKm ?? null,
    warnings: Object.freeze(warnings),
    sourceUrl: entry?.source_url ?? null,
  };
}

/* Survey-level facts, computed rather than asserted. */
export function conventionSurvey(radios) {
  const stated = radios.filter((r) => powerConvention(r).stated);
  const hinted = radios.filter((r) => !powerConvention(r).stated && powerConvention(r).hint);
  const noPower = radios.filter((r) => !(r.max_tx_power_mw > 0));
  const noRange = radios.filter((r) => typeof r.stated_range_km !== "number");
  return {
    total: radios.length,
    statedConvention: stated.length,
    statedBy: stated.map((r) => `${r.manufacturer} ${r.product}`),
    hintedOnly: hinted.length,
    noPublishedPower: noPower.length,
    noPublishedRange: noRange.length,
    allCarryConditionsField: radios.every((r) => r.range_conditions != null),
  };
}
