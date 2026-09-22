/* =====================================================================
   CONFIGURATION COMPARISON — the claim this tool is entitled to make
   =====================================================================
   THE REFRAME, AND WHERE IT COMES FROM.

   DiMaggio, Simmons, Geuther, Hartfield & Ahuja (NASA Langley / Auburn,
   SciTech 2025) ran FlightStream, a mid-fidelity surface-vorticity solver
   with actuator disks, viscous coupling and separation models, against
   LA-8 wind tunnel data. Orders of magnitude beyond anything a conceptual
   sizer does. Their finding:

     "Mid-transition results were NOT AS CLOSE IN MAGNITUDE, but the
      trends exhibited reasonable agreement with experimental data"

   and the sentence that decides what this module does:

     "If a TRUE DATA POINT IS KNOWN ... the data from FlightStream can be
      OFFSET with respect to this known performance and the lift and drag
      SLOPES from FlightStream used to make accurate predictions."

   PREDICTION GIVES YOU SLOPES. MEASUREMENT GIVES YOU THE OFFSET. Even a
   vorticity solver needs an experimental anchor to get magnitudes right,
   and that is a property of the problem, not a limitation of anyone's
   effort.

   This project already works that way for mass: the weight model is
   anchored to NASA Table 12 and the paper's result is about a DIFFERENCE
   (aggregate versus component). The dynamics have no anchor available, so
   the absolute values must not be claimed — but the DIFFERENCES BETWEEN
   CONFIGURATIONS can be, provided they survive the things we do not know.

   WHICH IS TESTABLE, AND IS THE POINT OF THIS MODULE. A ranking is
   trustworthy if it does not reorder when the assumed coefficients move.
   A ranking that flips under a plausible perturbation was never a finding;
   it was an artefact of a guess. So every comparison here is returned WITH
   the answer to "does this ordering survive?"
   ===================================================================== */
import { hoverQualities } from "./hoverqualities.js";
import { wingModes } from "./wingmodes.js";

/* The quantities a designer would actually choose between layouts on. Each
   says which direction is "more", so the ranking is unambiguous. */
export const METRICS = {
  rollDamping:      { get: (h) => -(h?.dynamics?.Lp ?? NaN), unit: "1/s", more: "more damped" },
  pitchDamping:     { get: (h) => -(h?.dynamics?.Mq ?? NaN), unit: "1/s", more: "more damped" },
  heaveDamping:     { get: (h) => -(h?.dynamics?.Zw ?? NaN), unit: "1/s", more: "more damped" },
  rollControlPower: { get: (h) => h?.dynamics?.rollControlPower_radss2 ?? NaN, unit: "rad/s^2", more: "more authority" },
  rollAgility:      { get: (h) => h?.dynamics?.rollRateSS_degs ?? NaN, unit: "deg/s", more: "faster" },
};

/**
 * Rank configurations on a metric and report whether the ranking is robust.
 * @param cases [{ key, p, SR }]
 * @param perturb  fraction to move every assumed coefficient by (default 0.5)
 */
export function compareHandling(cases = [], perturb = 0.5) {
  const rows = cases.map(({ key, p, SR }) => ({ key, p, SR, H: hoverQualities(p, SR) }))
                    .filter(r => r.H?.applicable);
  if (rows.length < 2) return { applicable: false, note: "needs at least two sized configurations" };

  const out = { applicable: true, perturbation: perturb, metrics: {} };

  for (const [name, m] of Object.entries(METRICS)) {
    const base = rows.map(r => ({ key: r.key, v: m.get(r.H) })).filter(x => isFinite(x.v));
    if (base.length < 2) continue;
    const order = base.slice().sort((a, b) => b.v - a.v).map(x => x.key);

    /* The only assumed quantity inside the HOVER model is the thrust margin
       the loop carries, and the rotor-airframe loss band. Perturbing the
       margin moves control power but NOT damping, which is why damping
       rankings are the robust ones and authority rankings are not. That
       asymmetry is a result, not an inconvenience, so it is reported. */
    const flips = [];
    for (const sign of [-1, 1]) {
      const alt = rows.map(r => {
        const p2 = { ...r.p, twRatio: 1 + Math.max(0.05, ((r.p.twRatio ?? 1.3) - 1) * (1 + sign * perturb)) };
        return { key: r.key, v: m.get(hoverQualities(p2, r.SR)) };
      }).filter(x => isFinite(x.v));
      const altOrder = alt.slice().sort((a, b) => b.v - a.v).map(x => x.key);
      if (altOrder.join(">") !== order.join(">")) flips.push({ sign, order: altOrder });
    }

    out.metrics[name] = {
      unit: m.unit, more: m.more,
      values: Object.fromEntries(base.map(x => [x.key, +x.v.toFixed(4)])),
      ranking: order,
      robust: flips.length === 0,
      flipsUnder: flips,
      /* the spread matters as much as the order: two layouts 2% apart are
         not distinguishable by a model with no anchor */
      spread: +((Math.max(...base.map(x => x.v)) / Math.min(...base.map(x => x.v)) - 1) * 100).toFixed(1),
    };
  }

  out.note =
    "Rankings, not magnitudes. Absolute values here are UNANCHORED - no eVTOL "
    + "publishes modal or handling-qualities data - so the claim this tool is "
    + "entitled to make is which layout is more damped than which, and only where "
    + "that ordering survives the assumed coefficients moving by "
    + `${(100 * perturb).toFixed(0)}%. Method after DiMaggio et al. (SciTech 2025): `
    + "prediction gives slopes, measurement gives the offset.";
  return out;
}
