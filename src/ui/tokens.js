/* =====================================================================
   DESIGN TOKENS
   =====================================================================
   Every tab was styling itself with inline magic numbers — fontSize 9, 10,
   11, 12, 13, 18 scattered across 25 files with no relationship between them,
   and padding chosen per-component. That is why the app reads as assembled
   rather than designed: nothing shares a rhythm.

   ── THE DIRECTION ────────────────────────────────────────────────────

   This is an instrument, not a dashboard. The people using it are defending
   numbers to a chief engineer or a regulator, so the design borrows from the
   things in their world that do the same job — flight instrumentation and
   certification documents. That means:

     dense before spacious    an engineer wants more numbers per screen, not
                              generous whitespace around four hero figures
     tabular figures          numbers in a column must align on the digit, so
                              a changing value does not shift its neighbours
     state in the frame       colour alone cannot carry meaning; every state
                              also has a glyph and an edge treatment, which is
                              both an accessibility floor and how real
                              annunciators work
     units always shown       a number without its unit is not a measurement

   The palette already committed to MIL-STD-1472's alerting vocabulary
   (nominal / caution / warning / advisory) in lib/theme.js. These tokens
   extend that discipline to type and space rather than starting over.
   ===================================================================== */

/* Type scale. Deliberately compressed at the small end — this interface lives
   at 10-13px because density is the point, and the jump to 18/24 is reserved
   for the one or two figures that actually lead a view. */
/* ── RAISED FOR THE JOBY PASS ──────────────────────────────────────────
   The floor was 9 px and half the interface sat at 9-11. That is denser than
   any of the reference tools it is being measured against, and density read
   as clutter rather than as capability. Every step moves up, and the gap
   between `value` and `lead` widens so the figure a panel is ABOUT separates
   from the figures supporting it. Nothing here changes what is shown — only
   how much room it gets. */
export const T = {
  micro: 10,   // provenance chips, axis ticks
  label: 11,   // field labels, column heads
  body:  12,   // prose, notes
  value: 14,   // ordinary readouts
  lead:  22,   // the figure a panel is about
  hero:  30,   // the figure a SCREEN is about — at most one per view
};

/* Spacing. A 4px base with a deliberate gap between 8 and 12 so "related" and
   "separate" are unmistakable. */
/* Spacing. A 4px base with a deliberate gap between 8 and 12 so "related" and
   "separate" are unmistakable. WIDENED for the Joby pass: the reference is an
   interface that separates with air rather than with rules, so the upper end
   grows more than the lower — small gaps stay tight, large gaps get generous. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 };

/* Corner radius. Squarer than before: the reference language is closer to
   drawn-sheet than to consumer-app, and an 8px radius on a data card reads
   soft next to a table. */
export const R = { sm: 2, md: 3, lg: 5 };

/* Monospace for anything numeric, so columns align and a value that changes
   does not reflow the row beside it. `tabular-nums` matters more than the
   family choice. */
export const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const numeric = {
  fontFamily: MONO,
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/* Label treatment used everywhere a field is named. One definition so the
   letter-spacing does not drift between tabs. */
export const labelStyle = (SC) => ({
  fontSize: T.label,
  color: SC.muted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: SANS,
});

/* ── STATE ───────────────────────────────────────────────────────────
   Colour AND glyph, never colour alone. The glyphs are the annunciator
   vocabulary: a filled dot reads as live, a triangle as caution, a bar as a
   limit, an outline as inert. */
export const STATE = {
  nominal:  { glyph: "●", key: "nominal"  },
  caution:  { glyph: "▲", key: "caution"  },
  warning:  { glyph: "■", key: "warning"  },
  advisory: { glyph: "◆", key: "advisory" },
  inert:    { glyph: "○", key: "muted"    },
};

export const stateColor = (SC, state) => SC[(STATE[state] || STATE.inert).key];

/* Provenance chip colours, mapped onto the SAME alerting vocabulary rather
   than a second palette: validated reads nominal, calibrated reads caution
   (it is a fit, not a prediction), unverified reads inert because "unknown"
   is not "wrong" and must not shout like a warning. */
export const PROV_COLOR = {
  validated:  "nominal",
  sourced:    "advisory",
  derived:    "muted",
  calibrated: "caution",
  unverified: "dim",
};
