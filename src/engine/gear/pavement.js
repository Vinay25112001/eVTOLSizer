/* ═══════════════════════════════════════════════════════════════════════
   PAVEMENT LOADING — G8: what a conceptual tool can say, and what it cannot
   ═══════════════════════════════════════════════════════════════════════
   The Aircraft Classification Number cannot be computed here. FAA AC
   150/5335-5D §3.1: the ACR-PCR method's "sole mathematical model" is
   layered elastic analysis, run in ICAO-ACR / FAARFIELD; the older ACN is
   Westergaard on a Winkler foundation for rigid pavement and the CBR method
   for flexible (AC 150/5335-5C §2.4-2.6), computed by the PCA program PDILB
   and S-77-1 (Boeing 737 MAX ACAP D6-38A004 Rev K §7.10, p. 7-2). None of
   that is in this tool and none is pretended. LANDING-GEAR.md §1.6 sets out
   the three things that CAN be said, and this module says exactly those:

   (a) THE TYRE-PRESSURE CODE, exact and free. AC 150/5335-5C Table 4-2:
       W no limit; X limited to 254 psi (1.75 MPa); Y to 181 psi (1.25 MPa);
       Z to 73 psi (0.50 MPa). Already implemented as pavementCode() in
       tyre-select.js from the selected inflation; carried here. (30)

   (b) THE LOAD PER MAIN LEG AND PER WHEEL, exact from the static split of
       G2 (14 CFR 25.733(b)(1) statics at the aft CG). The ACAPs publish the
       same quantity, "load on one main gear leg (%)", at 46.7-47.2 % for
       the 737 MAX family and 47.0 % for the A320-200, so it is reported
       beside those.

   (c) AN ACN ESTIMATE BY LINEAR INTERPOLATION IN GROSS WEIGHT between two
       published anchors of a geometrically similar reference aircraft, the
       approximation Airbus itself sanctions in the A320 ACAP §7-9-0 with
       its own error statement, "the interpolation error may reach 5 % to
       10 %". (31). The anchors are vendored below from the manufacturers'
       ACAP tables, each with its page; the 737 MAX table was read from the
       archived PDF (sources/gear/acap/737MAX_RevK.pdf p. 191) this session
       and the A320's from LANDING-GEAR.md §3.5. Boeing's own worked example
       on p. 190 - a 737-7 at 135,000 lb on a code-B subgrade reads 32.6
       flexible and 37.8 rigid off the charts - is the check the harness
       applies to the rule: linear interpolation between the table's two
       anchors gives 33.6 and 38.1, inside the 5-10 % Airbus states.

   THE ESTIMATE IS REFUSED, NOT EXTRAPOLATED, outside the reference's
   published weight range, and refused for any gear geometry the reference
   table does not hold (both references are twin-wheel, two-leg mains). A
   business jet or a turboprop at 7-10 t sits far below the 42-43 t minimum
   anchors, and the error statement holds only within the published range.
   The reference's tyre pressure is reported beside the aircraft's, because
   the ACN depends on it and the anchors were computed at the reference's.
   ═══════════════════════════════════════════════════════════════════════ */
import { pavementCode } from "./tyre-select.js";

const LB_PER_KG = 2.20462;

/** Published ACN anchors. Subgrade order A, B, C, D (high, medium, low, ultra-low). */
export const ACN_REFERENCES = Object.freeze([
  {
    aircraft: "Boeing 737-7", gear: "twin-wheel main, two legs",
    source: "Boeing 737 MAX ACAP D6-38A004 Rev K (July 2025) section 7.10, p. 7-17 (PDF p. 191)",
    anchors: [
      { massKg: 80512, massLb: 177500, loadOnOneLegPct: 46.69, tyrePsi: 200, flexible: [43, 46, 51, 56], rigid: [50, 52, 55, 57] },
      { massKg: 43091, massLb: 95000,  loadOnOneLegPct: 46.69, tyrePsi: 200, flexible: [21, 22, 23, 27], rigid: [24, 25, 26, 28] },
    ],
    workedExample: { massLb: 135000, subgrade: "B", flexible: 32.6, rigid: 37.8,
                     src: "same ACAP section 7.10 p. 7-16 (PDF p. 190), read off the charts by Boeing" },
  },
  {
    aircraft: "Boeing 737-8", gear: "twin-wheel main, two legs",
    source: "Boeing 737 MAX ACAP D6-38A004 Rev K (July 2025) section 7.10, p. 7-17 (PDF p. 191)",
    anchors: [
      { massKg: 82871, massLb: 182700, loadOnOneLegPct: 46.67, tyrePsi: 207, flexible: [45, 48, 53, 58], rigid: [52, 55, 57, 59] },
      { massKg: 43091, massLb: 95000,  loadOnOneLegPct: 46.67, tyrePsi: 207, flexible: [21, 22, 23, 27], rigid: [24, 25, 27, 28] },
    ],
  },
  {
    aircraft: "Boeing 737-9", gear: "twin-wheel main, two legs",
    source: "Boeing 737 MAX ACAP D6-38A004 Rev K (July 2025) section 7.10, p. 7-17 (PDF p. 191)",
    anchors: [
      { massKg: 88541, massLb: 195200, loadOnOneLegPct: 47.07, tyrePsi: 225, flexible: [50, 53, 58, 63], rigid: [58, 61, 63, 65] },
      { massKg: 43091, massLb: 95000,  loadOnOneLegPct: 47.07, tyrePsi: 225, flexible: [22, 22, 24, 27], rigid: [25, 26, 27, 29] },
    ],
  },
  {
    aircraft: "Airbus A320-200 (WV008)", gear: "twin-wheel main, two legs",
    source: "Airbus A320 ACAP AC_A320_0624 (Jun 2024) section 7-9-0, transcribed in LANDING-GEAR.md section 3.5",
    anchors: [
      { massKg: 73900, massLb: 73900 * LB_PER_KG, loadOnOneLegPct: 47.0, tyrePsi: 171, flexible: [38, 39, 44, 50], rigid: [41, 44, 47, 49] },
      { massKg: 42000, massLb: 42000 * LB_PER_KG, loadOnOneLegPct: 46.9, tyrePsi: 171, flexible: [20, 20, 22, 25], rigid: [21, 23, 24, 26] },
    ],
  },
]);

export const SUBGRADES = Object.freeze(["A", "B", "C", "D"]);
export const ACN_ERROR_BAND = 0.10;   // Airbus A320 ACAP 7-9-0: "may reach 5 % to 10 %"; the larger is carried

/** (31): linear in gross weight between the reference's two anchors; refused outside them. */
export function interpolateAcn(ref, massKg) {
  const [hi, lo] = ref.anchors[0].massKg > ref.anchors[1].massKg ? ref.anchors : [ref.anchors[1], ref.anchors[0]];
  if (!(massKg >= lo.massKg && massKg <= hi.massKg)) {
    return { resolved: false, aircraft: ref.aircraft,
             why: `${Math.round(massKg)} kg is outside ${ref.aircraft}'s published range ${lo.massKg}-${hi.massKg} kg; ` +
                  "the source's error statement holds only inside it, so nothing is extrapolated" };
  }
  const f = (massKg - lo.massKg) / (hi.massKg - lo.massKg);
  const lerp = (a, b) => a + (b - a) * f;
  return {
    resolved: true, aircraft: ref.aircraft, source: ref.source, fraction: f,
    flexible: lo.flexible.map((v, i) => lerp(v, hi.flexible[i])),
    rigid:    lo.rigid.map((v, i) => lerp(v, hi.rigid[i])),
    referenceTyrePsi: hi.tyrePsi, referenceLoadOnOneLegPct: hi.loadOnOneLegPct,
    band: ACN_ERROR_BAND,
  };
}

/** The nearest reference by maximum weight that still covers the mass, twin-wheel only. */
export function chooseReference(massKg, { wheelsPerAxle, legs }) {
  if (!(wheelsPerAxle === 2 && legs === 2)) {
    return { resolved: false, why: `every published reference here is a twin-wheel, two-leg main gear; this aircraft has ${legs} legs of ${wheelsPerAxle} wheels` };
  }
  const covering = ACN_REFERENCES.filter((r) => interpolateAcn(r, massKg).resolved)
    .sort((a, b) => Math.max(...a.anchors.map((x) => x.massKg)) - Math.max(...b.anchors.map((x) => x.massKg)));
  if (!covering.length) {
    const lo = Math.min(...ACN_REFERENCES.flatMap((r) => r.anchors.map((a) => a.massKg)));
    const hi = Math.max(...ACN_REFERENCES.flatMap((r) => r.anchors.map((a) => a.massKg)));
    return { resolved: false, why: `${Math.round(massKg)} kg is outside every published reference range (${lo}-${hi} kg); no estimate is made` };
  }
  return { resolved: true, ref: covering[0] };
}

/**
 * @param gear  a resolved gearOf() result
 * @param result the sized aircraft (for its take-off mass)
 */
export function pavementOf(gear, result) {
  if (!gear?.resolved) return { resolved: false, why: gear?.why ?? "no landing gear" };
  const massKg = result?.mtowKg;
  const wLb = massKg * LB_PER_KG;
  const { main, nose, legs, wheelsPerAxle } = gear.tyres;
  const st = gear.statics;

  const legLoad = st?.resolved
    ? { perLegLb: st.mainLoadTotal / legs, pctOfWeight: 100 * (st.mainLoadTotal / legs) / wLb,
        perWheelLb: st.mainLoadTotal / (legs * wheelsPerAxle), noseLb: st.noseLoad,
        basis: "static split at the aft CG, G2 (14 CFR 25.733(b)(1)), at the take-off mass" }
    : { resolved: false, why: st?.why ?? "no static split" };

  const code = {
    main: main.resolved ? pavementCode(main.operatingPsi) : null,
    nose: nose.resolved ? pavementCode(nose.operatingPsi) : null,
    src: "AC 150/5335-5C Table 4-2, from the selected operating inflation",
  };

  const pick = chooseReference(massKg, { wheelsPerAxle, legs });
  const acn = pick.resolved
    ? (() => {
        const est = interpolateAcn(pick.ref, massKg);
        return {
          ...est, estimate: true,
          bandFlexible: est.flexible.map((v) => [v * (1 - ACN_ERROR_BAND), v * (1 + ACN_ERROR_BAND)]),
          bandRigid:    est.rigid.map((v) => [v * (1 - ACN_ERROR_BAND), v * (1 + ACN_ERROR_BAND)]),
          aircraftTyrePsi: main.resolved ? main.operatingPsi : null,
          massUsed: { kg: massKg, basis: "take-off mass; the references tabulate maximum TAXI weight, which this tool does not model" },
          note: "An ESTIMATE by linear interpolation in gross weight between two published anchors of a "
              + "geometrically similar aircraft (Airbus A320 ACAP 7-9-0's own approximation, error 'may reach "
              + "5 % to 10 %'); not a computed ACN, which needs FAARFIELD / ICAO-ACR. The reference's tyre "
              + "pressure is not this aircraft's, and the ACN depends on it.",
        };
      })()
    : { resolved: false, estimate: true, why: pick.why };

  return {
    resolved: true,
    code, legLoad, acn,
    references: ACN_REFERENCES.map((r) => ({ aircraft: r.aircraft, source: r.source,
      rangeKg: [Math.min(...r.anchors.map((a) => a.massKg)), Math.max(...r.anchors.map((a) => a.massKg))] })),
    notComputed: [
      "ACN / ACR by layered elastic analysis or Westergaard/CBR (AC 150/5335-5D section 3.1; -5C sections 2.4-2.6): the method is FAARFIELD / ICAO-ACR software, not a closed form.",
      "Maximum taxi weight: the references tabulate ACN at MTW; this tool uses the take-off mass, which is lower by the taxi fuel.",
      "Pavement thickness, subgrade of any real airport, or a PCN comparison: the operating rule (ACN <= PCN, subject to the tyre-pressure code) is stated, not applied.",
    ],
    sources: {
      code: "FAA AC 150/5335-5C Table 4-2",
      legLoad: "14 CFR 25.733(b)(1) static split, G2; ACAPs publish 46.7-47.2 % (737 MAX) and 47.0 % (A320-200) on one main leg",
      acn: "Airbus A320 ACAP section 7-9-0 (the interpolation rule and its error); anchors per ACN_REFERENCES",
    },
  };
}
