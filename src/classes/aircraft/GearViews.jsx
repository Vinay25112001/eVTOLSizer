/* =====================================================================
   LANDING GEAR VIEWS — the two figures Phase A was supposed to produce
   =====================================================================
     TyreMargins    each governing load case as a bar, against the rating
                    of the tyre chosen for it, so the BINDING case is
                    visible rather than stated
     PavementBars   load per leg and per wheel, with the pressure code

   THE COLOUR CONVENTION is the one the fuselage and balance views
   established: SC.primary for a computed quantity, SC.caution for a
   sourced convention, SC.danger for something that does not comply.

   WHY THE MARGIN CHART SHOWS REQUIRED RATING AND NOT LOAD. 14 CFR 25.733
   is not one rule, and its three parts do not compare the same things: a
   main tyre with more than one wheel per axle must be rated for 1.07 x
   its load, while a nose tyre in the braked cases is ALLOWED to carry
   1.5 x its rating. So the largest LOAD is not the largest REQUIREMENT,
   and a chart of loads would show the wrong case binding. Every bar here
   is load divided by the factor its own rule allows, which is what the
   regulation actually asks the tyre to be rated for.
   ===================================================================== */
import { SC } from "../../lib/theme.js";
import { T, S, MONO } from "../../ui/tokens.js";
import { HBarChart } from "./charts.jsx";

const lbl = { fontSize: T.label, color: SC.subtle, fontFamily: MONO };

/* Required rating per case, against the rating actually selected. */
export function TyreMargins({ gear, height }) {
  if (!gear || !gear.resolved) return null;
  const rows = [];
  const { main, nose } = gear.tyres;

  if (main.resolved) {
    rows.push({
      name: `main — ${main.src.replace("14 CFR ", "")}`,
      value: main.requiredRatingLb ?? main.loadPerTyreLb,
      rating: main.tyre.loadLb, binding: true,
    });
    rows.push({ name: `main tyre ${main.tyre.size} rating`, value: main.tyre.loadLb,
                rating: main.tyre.loadLb, isRating: true });
  }
  if (nose.resolved) {
    for (const d of nose.demands) {
      rows.push({
        name: `nose — ${d.label}${d.limitFactor !== 1 ? ` (÷${d.limitFactor})` : ""}`,
        value: d.requiredRatingLb, rating: nose.tyre.loadLb,
        binding: d.label === nose.binding.label,
      });
    }
    rows.push({ name: `nose tyre ${nose.tyre.size} rating`, value: nose.tyre.loadLb,
                rating: nose.tyre.loadLb, isRating: true });
  }
  if (!rows.length) return null;

  return (
    <div>
      <HBarChart
        rows={rows} unit="lb" height={height}
        colorBy={(r) => (r.isRating ? SC.caution
                       : r.value > r.rating ? SC.danger
                       : r.binding ? SC.primary : SC.advisory)}
      />
      <p style={lbl}>
        Each bar is the rating that case REQUIRES, not the load it applies — 25.733(c)(1)
        multiplies a multi-wheel main load by 1.07, and 25.733(b)(2) and (b)(3) divide the
        braked nose loads by 1.5. The binding case is the tallest bar, not the heaviest load.
      </p>
    </div>
  );
}

/* Load per leg and per wheel, with the pavement pressure code. */
export function PavementBars({ gear, height }) {
  if (!gear || !gear.resolved || !gear.statics.resolved) return null;
  const { main, nose, legs, wheelsPerAxle } = gear.tyres;
  const s = gear.statics;
  const rows = [
    { name: "one main leg", value: s.mainLoadTotal / legs },
    { name: "one main wheel", value: s.mainLoadTotal / (legs * wheelsPerAxle) },
    { name: "nose gear", value: s.noseLoad },
    { name: "one nose wheel", value: s.noseLoad / 2 },
  ];
  return (
    <div>
      <HBarChart rows={rows} unit="lb" height={height}
                 colorBy={() => SC.primary} />
      <p style={lbl}>
        Static split at maximum weight: {(s.noseFraction * 100).toFixed(1)} % on the nose,
        from statics on the gear stations — not a 90/10 rule of thumb.
        {main.resolved && ` Main tyres run at ${Math.round(main.operatingPsi)} psi,`
          + ` pavement code ${gear.tyres.mainPavement?.code ?? "—"}.`}
        {nose.resolved && ` Nose ${Math.round(nose.operatingPsi)} psi,`
          + ` code ${gear.tyres.nosePavement?.code ?? "—"}.`}
      </p>
    </div>
  );
}
