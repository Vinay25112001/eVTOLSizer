/* =====================================================================
   TRAINER VALIDATION CASES — one list, read by the gate and the screen
   =====================================================================
   Real aircraft whose empty weight is published next to the gross weight,
   wing and engine that `analyzeTrainer` needs. Every number is from the
   named document, read from the page. `band` is a regression band set after
   the first measurement (2026-09-16), not an accuracy claim.
   ===================================================================== */

export const TRAINER_EMPTY_WEIGHT_CASES = Object.freeze([
  { id: "c172s", name: "Cessna 172S", emptyLb: 1663, band: 0.12,
    source: "C172S POH: 2,550 lb, standard empty 1,663 lb, 174 ft², span 36 ft 1 in, 180 hp, "
          + "53 gal usable, length 27 ft 2 in. FAA TCDS 3A12: empty weight includes 18 lb unusable fuel and 15 lb oil",
    inputs: { grossLb: 2550, wingAreaFt2: 174, spanFt: 36.083, hp: 180, usableFuelLb: 318 } },
  { id: "skyhawk76", name: "Cessna Skyhawk (1976)", emptyLb: 1350, band: 0.12,
    source: "Loftin, NASA RP-1060 Table 5.I: 2,300 / 1,350 lb, b 35.0 ft, l 26.9 ft, S 175 ft², 150 hp O-320",
    inputs: { grossLb: 2300, wingAreaFt2: 175, spanFt: 35.0, hp: 150, fuselageLengthFt: 26.9, sfc: 0.45 } },
  { id: "cherokee180", name: "Piper Cherokee 180", emptyLb: 1386, band: 0.12,
    source: "Loftin, NASA RP-1060 Table 5.I: 2,450 / 1,386 lb, b 32.0 ft, l 24.0 ft, S 170 ft², 180 hp O-360; rectangular wing",
    inputs: { grossLb: 2450, wingAreaFt2: 170, spanFt: 32.0, hp: 180, fuselageLengthFt: 24.0, taper: 1.0 } },
]);

/* The C172S sized from its own POH requirements. Its landing CLmax is
   derived from the POH stall table (48 KCAS, 30° flaps, 2,550 lb, 174 ft²). */
export const C172S_SIZING_CASE = Object.freeze({
  clMaxLanding: 2 * 2550 / (0.0023769 * (48 * 1.6878099) ** 2 * 174),
  targets: [
    { key: "grossLb", label: "Gross weight", actual: 2550, unit: "lb", band: 0.05 },
    { key: "wingAreaFt2", label: "Wing area", actual: 174, unit: "ft²", band: 0.05 },
    { key: "emptyLb", label: "Empty weight", actual: 1663, unit: "lb", band: 0.10 },
    { key: "hp", label: "Engine power", actual: 180, unit: "hp", band: 0.15 },
    { key: "fuelLb", label: "Usable fuel", actual: 318, unit: "lb", band: 0.20 },
  ],
});

/* The envelope the validation covers. A design outside it is flagged. */
export const TRAINER_VALIDATED_DOMAIN = Object.freeze({
  grossLb: [2300, 2550], hp: [150, 180], wingAreaFt2: [170, 175], seats: [4, 4],
  note: "Three four-seat, fixed-gear, single piston-engine aeroplanes of 2,300-2,550 lb",
});
