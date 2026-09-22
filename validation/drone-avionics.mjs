/* =====================================================================
   DRONE AVIONICS GATE — ESC and radio selection, on published data only
   =====================================================================
   Two selection problems with the same failure mode: filling a gap in
   the published data with a typical value and presenting the result as
   a selection.

   THE RADIO IS THE SHARPER CASE. Friis is not in doubt, and neither is
   the arithmetic; what is in doubt is EIRP. A vendor publishes "max TX
   power" and whether that is CONDUCTED at the connector or RADIATED by
   the antenna is a different quantity — they differ by the antenna
   gain, which on these products runs 2 to 5 dBi, and 5 dB is a factor
   of 1.8 in range. ONE of fifteen says which it means. So the gate
   requires a computed range for that one and a BRACKET for the rest,
   and checks that the bracket's width really is the antenna gain.

   WHAT FREE SPACE CAN AND CANNOT DECIDE. It is a CEILING: no ground
   reflection, no Fresnel obstruction, no fade margin, no airframe
   blockage. So it cannot predict a range, and the gate does not ask it
   to. What it CAN do is falsify: a published range above the free-space
   ceiling would be provably impossible. The gate checks every published
   range against its own ceiling, which is a real verification of
   fifteen vendor claims rather than a self-consistency check.

   THE ESC SIDE checks that an unpublished rating is never treated as
   headroom — including for a part whose model name contains "45A" while
   its page states only "45A designed" and never gives a continuous
   rating at all.
   ===================================================================== */
import {
  assessLink, conventionSurvey, bandVariants, sensitivityOptions, bestSensitivityDbm,
  powerConvention, eirpDbm, rangeKm, fsplDb, rangeBracketKm, centreFrequencyMHz,
  FSPL_CONST, dBmOf, mWOf,
} from "../src/classes/drone/radio.js";
import { escCandidates, ESC_KEY_FIELDS } from "../src/classes/drone/esc.js";
import { ESCS, RADIO_LINKS } from "../src/data/drone-components.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE AVIONICS GATE");
console.log("=".repeat(78));

/* ── 1. THE PHYSICS IS RIGHT ───────────────────────────────────────── */
check("the free-space constant is derived, not remembered",
  Math.abs(FSPL_CONST - 32.44) < 0.01,
  `${FSPL_CONST.toFixed(4)} from 20 log10(4 pi / c) with c in km/s — the textbook 32.44 rounded`);

check("FSPL doubles-distance at 6.02 dB, as an inverse-square law must",
  Math.abs((fsplDb(2, 2440) - fsplDb(1, 2440)) - 6.0206) < 1e-3,
  `${(fsplDb(2, 2440) - fsplDb(1, 2440)).toFixed(4)} dB per doubling`);

check("dBm and mW round-trip",
  Math.abs(mWOf(dBmOf(1000)) - 1000) < 1e-9 && Math.abs(dBmOf(1000) - 30) < 1e-9,
  "1000 mW = 30 dBm");

/* A budget solved for range must reproduce itself when put back through
   the loss equation. */
const rTest = rangeKm({ eirpDbm: 30, rxGainDbi: 2, sensitivityDbm: -102, freqMHz: 915 });
check("the range solution inverts the path-loss equation exactly",
  Math.abs((30 + 2 - fsplDb(rTest, 915)) - (-102)) < 1e-9,
  `${rTest.toFixed(2)} km at zero margin closes to the sensitivity`);

/* Doubling needs 20 log10(2) = 6.0206 dB, not 6. A flat 6 dB gives
   1.9953x, and writing the test to "6 dB doubles it" would have been
   asserting a rounded constant against exact arithmetic. */
const sixDb = 20 * Math.log10(2);
check("a 20 log10(2) dB budget increase doubles the range exactly",
  Math.abs(rangeKm({ eirpDbm: 30 + sixDb, rxGainDbi: 2, sensitivityDbm: -102, freqMHz: 915 }) / rTest - 2) < 1e-9,
  `${sixDb.toFixed(4)} dB doubles it; a flat 6 dB gives ` +
  `${(rangeKm({ eirpDbm: 36, rxGainDbi: 2, sensitivityDbm: -102, freqMHz: 915 }) / rTest).toFixed(4)}x`);

/* ── 2. THE CONVENTION IS CLASSIFIED, NEVER CONVERTED ──────────────── */
console.log("-".repeat(78));
const survey = conventionSurvey(RADIO_LINKS);
console.log(`  ${survey.total} radios: ${survey.statedConvention} state conducted vs EIRP, ` +
            `${survey.hintedOnly} carry only a hint, ${survey.noPublishedPower} publish no power, ` +
            `${survey.noPublishedRange} publish no range`);

check("almost no vendor states whether its power is conducted or radiated",
  survey.statedConvention === 1 && survey.total === 15,
  `only ${survey.statedBy.join("; ")} — and it says so by giving the conversion formula and ` +
  `quoting the FCC EIRP ceiling separately`);

check("a regulatory coincidence is recorded as a HINT, never promoted to a statement",
  survey.hintedOnly > 0 &&
  RADIO_LINKS.every((r) => {
    const c = powerConvention(r);
    return c.stated || c.convention === "unstated";
  }),
  `${survey.hintedOnly} products whose figure coincides with a limit expressed in radiated power; ` +
  `a hint about what a vendor probably meant is not a statement`);

check("EIRP is REFUSED where the convention is unstated",
  RADIO_LINKS.filter((r) => !powerConvention(r).stated)
    .every((r) => eirpDbm(r).dBm === null && /conducted or EIRP|no transmit power/.test(eirpDbm(r).why)),
  "a single range figure for an unstated radio would be a guess wearing a decimal point");

check("EIRP is refused for a CONDUCTED figure with no antenna gain published",
  (() => {
    const rfd = RADIO_LINKS.find((r) => powerConvention(r).convention === "conducted");
    return eirpDbm(rfd).dBm === null && /antenna gain/.test(eirpDbm(rfd).why);
  })(),
  "EIRP = conducted - cable loss + antenna gain, so the gain is not optional");

check("EIRP IS computed when the convention and the gain are both known",
  (() => {
    const rfd = RADIO_LINKS.find((r) => powerConvention(r).convention === "conducted");
    const e = eirpDbm(rfd, { txAntennaGainDbi: 3 });
    return e.dBm != null && Math.abs(e.dBm - (30 + 3)) < 1e-9;
  })(), "30 dBm conducted + 3 dBi = 33 dBm EIRP");

/* The bracket's width must BE the antenna gain, expressed as range. */
const withPower = RADIO_LINKS.filter((r) => r.max_tx_power_mw > 0 && bestSensitivityDbm(r) != null);
const brackets = withPower.map((r) => rangeBracketKm(r, { assumedTxGainDbi: 2 })).filter(Boolean);
check("the bracket width is exactly the assumed antenna gain in range terms",
  brackets.length > 0 && brackets.every((b) => Math.abs(b.ratio - Math.pow(10, 2 / 20)) < 1e-9),
  `every bracket spans x${Math.pow(10, 2 / 20).toFixed(4)} for 2 dBi — the cost of the missing statement`);

/* ── 3. FREE SPACE AS A FALSIFIER ──────────────────────────────────── */
console.log("-".repeat(78));
console.log("  every published range against its own free-space ceiling:");
console.log(`  ${"radio".padEnd(34)}${"stated".padStart(9)}${"ceiling".padStart(10)}${"ratio".padStart(9)}`);
let above = 0, compared = 0;
for (const r of RADIO_LINKS) {
  const a = assessLink(r, { rxGainDbi: 2 });
  const ceiling = a.computed ? a.computed.rangeKm : a.bracket ? a.bracket.highKm : null;
  if (a.statedRangeKm == null || ceiling == null) continue;
  compared++;
  const ratio = a.statedRangeKm / ceiling;
  if (ratio > 1) above++;
  console.log(`  ${`${r.manufacturer} ${r.product}`.slice(0, 33).padEnd(34)}` +
    `${`${a.statedRangeKm} km`.padStart(9)}${`${ceiling.toFixed(0)} km`.padStart(10)}${ratio.toFixed(3).padStart(9)}`);
}
check("no vendor claims a range ABOVE its own free-space ceiling",
  above === 0 && compared >= 5,
  `${compared} claims checked, ${above} impossible — a claim above free space would be provably ` +
  `false, and none is`);

check("published ranges sit well BELOW the ceiling, so free space is not the binding constraint",
  (() => {
    const ratios = RADIO_LINKS.map((r) => {
      const a = assessLink(r, { rxGainDbi: 2 });
      const c = a.computed ? a.computed.rangeKm : a.bracket ? a.bracket.highKm : null;
      return a.statedRangeKm != null && c ? a.statedRangeKm / c : null;
    }).filter((x) => x != null);
    return ratios.every((x) => x < 1) && Math.min(...ratios) < 0.1;
  })(),
  "real links are dominated by ground reflection, obstruction and fade margin, none of which " +
  "free space contains — so the ceiling rules radios OUT, it does not predict range");

/* ── 4. BANDS AND SENSITIVITY ARE USED AS PUBLISHED ────────────────── */
console.log("-".repeat(78));
const dual = RADIO_LINKS.find((r) => /TD MX/.test(r.product));
check("two distinct bands in one string are kept apart, not averaged",
  (() => {
    const v = bandVariants(dual).filter((x) => x.mhz != null).map((x) => Math.round(x.mhz));
    return v.length === 2 && v.includes(900) && v.includes(2400);
  })(),
  `"2.4 GHz and 900 MHz simultaneously" gives 900 and 2400 — their midpoint, 1650 MHz, is a ` +
  `frequency this radio never transmits on`);

check("a contiguous range still takes its midpoint",
  (() => {
    const v = bandVariants({ frequency_band_mhz: { variants: ["902-928"] } });
    return v.length === 1 && Math.abs(v[0].mhz - 915) < 1e-9;
  })(), "902-928 is one band, and 915 is inside it");

check("an unparseable band is kept visible rather than dropped",
  (() => {
    const v = bandVariants({ frequency_band_mhz: { variants: ["sub-GHz, unspecified"] } });
    return v.length === 1 && v[0].mhz === null && v[0].label;
  })());

const perMode = RADIO_LINKS.filter((r) => sensitivityOptions(r).length > 1);
check("sensitivity published per packet rate is kept as a set, not collapsed",
  perMode.length >= 3 &&
  perMode.every((r) => sensitivityOptions(r).every((o, i, a) => i === 0 || o.dBm >= a[i - 1].dBm)),
  `${perMode.length} products publish sensitivity per mode, up to ` +
  `${Math.max(...perMode.map((r) => sensitivityOptions(r).length))} entries — range and latency ` +
  `trade on the SAME hardware, and averaging the modes would delete that`);

check("the single figure used is the BEST published sensitivity, chosen explicitly",
  RADIO_LINKS.filter((r) => sensitivityOptions(r).length > 1)
    .every((r) => bestSensitivityDbm(r) === Math.min(...sensitivityOptions(r).map((o) => o.dBm))),
  "never a mean of modes that trade against each other");

/* ── 5. THE ESC SIDE ───────────────────────────────────────────────── */
console.log("-".repeat(78));
const cands = escCandidates(ESCS, { busCurrentA: 12, cells: 6 });
const noRating = ESCS.filter((e) => e.continuous_current_a == null);
check("an ESC with no published continuous rating is EXCLUDED, not given headroom",
  noRating.length > 0 &&
  noRating.every((e) => {
    const c = cands.find((x) => x.esc.id === e.id);
    return c && !c.viable && /no continuous current/.test(c.excludedBecause[0]);
  }),
  `${noRating.length} such part — its model name contains "45A" while the page says only ` +
  `"45A designed", and the survey recorded null rather than assuming`);

check("a demand beyond a published rating excludes that ESC",
  escCandidates(ESCS, { busCurrentA: 500, cells: 6 }).every((c) => !c.viable),
  "500 A exceeds every published rating in the catalogue");

check("a pack outside the published cell range excludes that ESC",
  escCandidates(ESCS, { busCurrentA: 5, cells: 14 })
    .some((c) => !c.viable && c.excludedBecause.some((r) => /outside the published/.test(r))));

check("viable parts are ranked by mass, the one axis every vendor publishes",
  (() => {
    const v = cands.filter((c) => c.viable);
    return v.length > 1 && v.every((c, i) => i === 0 || c.massG >= v[i - 1].massG);
  })());

check("an ESC publishing several masses uses the lightest and says so",
  (() => {
    const c = cands.find((x) => x.massNote);
    return !c || (/publishes \d+ masses/.test(c.massNote) && c.massG != null);
  })());

const withBurst = ESCS.filter((e) => e.burst_current_a != null);
const noDuration = withBurst.filter((e) => e.burst_duration_s == null);
check("a burst current with no duration is detectable and counted",
  noDuration.length >= 6 &&
  cands.filter((c) => c.burstStated && !c.burstDurationStated).length === noDuration.length,
  `${noDuration.length} of ${withBurst.length} quote a burst current with no duration — a burst ` +
  `rating without a duration is a number, not a rating`);

check("completeness is reported but never used to rank",
  cands.every((c) => c.completeness >= 0 && c.completenessOf === ESC_KEY_FIELDS.length) &&
  (() => {
    const v = cands.filter((x) => x.viable);
    return v.some((c, i) => i > 0 && c.completeness > v[i - 1].completeness);
  })(),
  "a well-documented part that cannot carry the current is still the wrong part");

check("a non-positive current demand is refused",
  (() => { try { escCandidates(ESCS, { busCurrentA: 0 }); return false; } catch { return true; } })());

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE AVIONICS GATE PASSED (${pass} checks)`
                       : `DRONE AVIONICS GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
