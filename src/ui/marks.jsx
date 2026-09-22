/* =====================================================================
   STATUS MARKS — one vocabulary, and it is not emoji
   =====================================================================
   The application carried 401 emoji across 86 distinct characters, and the
   pass/fail markers among them were the full-colour ones: a green tick
   emoji and a red cross emoji, 78 of them, rendered by the operating
   system's emoji font.

   Three things are wrong with that in an engineering tool:

     THEY ARE NOT OUR COLOURS. A colour emoji paints itself. The green in
     the tick is the vendor's green, not SC.nominal, so a passing check did
     not match the passing colour used everywhere else on the same screen,
     and neither one changed with the theme.

     THEY ARE NOT THE SAME SHAPE TWICE. Emoji artwork differs per platform
     and per font version, so the mark a reviewer sees is not necessarily
     the mark in the screenshot in the report.

     THEY OUTWEIGH THE DATA. A saturated multi-colour glyph next to a
     number pulls the eye off the number.

   The marks below are text. They take their colour from the semantic
   tokens, so a passing check is the same green as a nominal readout, and
   both follow the theme.
   ===================================================================== */
import { SC } from "../lib/theme.js";

/** Pass / fail mark. Colour carries the state; the glyph carries it again
    for anyone who cannot separate the two colours. */
export const mark = (ok) => (
  <span style={{ color: ok ? SC.nominal : SC.warning, fontWeight: 700 }}>
    {ok ? "✓" : "✗"}
  </span>
);

/** Three-state version, for checklists that have a "review this" rung
    between pass and fail. */
export const mark3 = (state) => {
  const c = state === "ok" ? SC.nominal : state === "warn" ? SC.caution : SC.warning;
  const g = state === "ok" ? "✓" : state === "warn" ? "⚠" : "✗";
  return <span style={{ color: c, fontWeight: 700 }}>{g}</span>;
};
