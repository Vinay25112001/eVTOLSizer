/* =====================================================================
   CHART PRESENTATION — one set of defaults for every figure in the app
   =====================================================================
   Forty-one charts each configured their own grid and axes inline. They were
   nearly consistent, which is the worst case: close enough that the drift was
   invisible, far enough that no two figures shared a type size (10, 11 and 12
   px all appear) and none used the type scale in ui/tokens.js.

   What the shared defaults change, and why each is a chart-junk removal in
   Tufte's sense rather than a taste preference:

     VERTICAL GRID LINES GO. Every chart drew a full dashed lattice. On a
     categorical axis — mission phase, layout name — a vertical rule carries
     no information: the category is already located by its bar. Horizontal
     rules earn their place because they let a reader carry a value across to
     the axis. So `vertical: false`, horizontal kept.

     THE GRID USES THE GRID COLOUR. It was drawn in SC.border, the colour of
     a panel EDGE, so the lattice sat at the same weight as the frame around
     it and competed with the data. SC.dim is the token that exists for grid
     lines, and is lighter in both themes.

     TICK LINES GO, AXIS LINES STAY. A tick mark and a tick label say the same
     thing twice. The axis line itself is kept: it is the baseline a bar is
     measured from.

     ONE TYPE SIZE. T.micro for ticks, from the scale, so a chart label and a
     table label are the same size — which is what makes a screen look
     designed rather than assembled.

   Every helper is a FUNCTION, not a frozen object. SC is one object mutated
   in place by applyTheme (see lib/theme.js), so a module-level literal would
   capture whichever theme happened to be loaded first and never update.
   ===================================================================== */
import { SC } from "../lib/theme.js";
import { T, MONO } from "./tokens.js";

/** Horizontal-only grid, in the grid colour rather than the border colour. */
export const grid = () => ({
  strokeDasharray: "3 3",
  stroke: SC.dim,
  vertical: false,
});

/** Shared axis presentation. Spread AFTER a chart's own dataKey/label/domain
    so those survive and only the presentation is normalised. */
export const axis = () => ({
  tick: { fontSize: T.micro, fill: SC.muted, fontFamily: MONO },
  tickLine: false,
  axisLine: { stroke: SC.border },
});

/** Tooltip. The recharts default is a white box with a browser-default font,
    which is the one element in these figures a reader sees up close. */
export const tooltip = () => ({
  contentStyle: {
    background: SC.panel,
    border: `1px solid ${SC.border}`,
    borderRadius: 3,
    fontSize: T.label,
    fontFamily: MONO,
    color: SC.text,
    boxShadow: "0 2px 8px rgba(0,0,0,.10)",
    padding: "8px 10px",
  },
  labelStyle: { color: SC.muted, fontSize: T.micro, marginBottom: 4 },
  itemStyle: { color: SC.text, fontSize: T.label, padding: 0 },
  cursor: { fill: SC.inset, fillOpacity: 0.55 },
});

/** Legend, matched to the axis type so a figure has one voice. */
export const legend = () => ({
  wrapperStyle: { fontSize: T.micro, fontFamily: MONO, color: SC.muted },
  iconSize: 8,
});

/* ---------------------------------------------------------------------
   SINGLE-SERIES BARS — one quantity, so one colour
   ---------------------------------------------------------------------
   "Power per phase" drew six bars of one quantity in six different hues,
   pulled from PHC, the CATEGORICAL palette. Colour there encoded nothing that
   the bar's height and its axis label did not already say, and the rainbow
   actively misled: six hues assert six unrelated series, when these are six
   phases of one flight. The weight breakdown was worse — a hard-coded
   ten-colour Tailwind array that never saw the theme at all, so it rendered
   the same saturated primaries on the light ground as on the dark.

   A composition — the phase-duration PIE — is the opposite case and keeps its
   categorical palette: there, colour is the ONLY thing identifying a wedge.

   The emphasis on the largest bar is not decoration. In this tool it is the
   whole result: power peaks in HOVER, energy peaks in CRUISE, and those two
   facts are what size the motors and the pack respectively. Pointing at the
   maximum states the design driver in the figure itself.
   --------------------------------------------------------------------- */
export const seriesBar = (values, hue) => {
  const nums = values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  const max = Math.max(...nums, 0);
  const fill = hue || SC.advisory;
  /* Ties emphasise together, which is correct: takeoff and landing hover at
     the same power, and both ARE the driver. */
  return (i) => ({ fill, fillOpacity: max > 0 && nums[i] >= max ? 1 : 0.45 });
};
