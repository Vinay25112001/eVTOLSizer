export const DARK = {
  // ── Structure ──────────────────────────────────────────────────
  bg:      "#0A0E14",   // Cockpit display black  (was #0d1117 / GitHub bg)
  panel:   "#0F1520",   // Dark navy instrument panel
  inset:   "#070B11",   // Recessed surface: table zebra rows, sunken boxes
  border:  "#1C2B3A",   // Steel-blue divider
  // ── Semantic alerting vocabulary (MIL-STD-1472 Table IV) ──────
  nominal: "#00C896",   // Nominal / healthy   (60 Hz annunciator green)
  caution: "#E8A020",   // Caution threshold   (amber — not Tailwind yellow)
  warning: "#D85344",   // Limit exceeded      (warning red). Was #D44030, which
                        // is 3.98:1 on panel against the 4.5:1 WCAG AA asks below
                        // 24px. Lifted in luminance only, hue and saturation held.
  advisory:"#4090D8",   // Advisory / info     (instrument blue)
  // ── Typography ────────────────────────────────────────────────
  primary: "#C8D8E8",   // Instrument white — primary data readout
  muted:   "#638495",   // De-emphasised label text. Was #5C7A8A at 4.01:1 on panel,
                        // which failed AA on 1010 elements across six tabs — the
                        // single largest contrast defect in the interface, and one
                        // token in the wrong role rather than 1010 mistakes.
  dim:     "#2A3A4A",   // Grid lines / dividers — NOT a text colour
  subtle:  "#7A8FA0",   // Low-emphasis TEXT. 5.45:1 on panel, 5.77:1 on bg.
  // ── Extended palette (charts, phase markers) ──────────────────
  purple:  "#8372CC",   // Design-space / V-n trace. Was #7B68C8 at 4.05:1 on panel.
  orange:  "#D07028",   // Phase marker warm
  // ── Backward-compatible aliases (preserves all SC.* refs) ─────
  text:    "#C8D8E8",   // ← SC.text  → primary
  amber:   "#E8A020",   // ← SC.amber → caution
  teal:    "#00C896",   // ← SC.teal  → nominal
  blue:    "#4090D8",   // ← SC.blue  → advisory
  red:     "#D85344",   // ← SC.red   → warning
  green:   "#00C896",   // ← SC.green → nominal
};

export const LIGHT = {
  // ── Structure ──────────────────────────────────────────────────
  /* Near-white, not blue-grey. The reference interface is a white sheet
     with hairline rules; #EEF2F7 tinted every panel edge and made the
     whole screen read cooler and busier than it is. */
  bg:      "#F6F7F8",   // Near-white sheet
  panel:   "#FFFFFF",
  inset:   "#E2E9F1",   // Recessed surface — the LIGHT counterpart. Nine call
                        // sites hard-coded "#0a0d14" for this, which is a
                        // near-black: subtle zebra striping in dark mode and
                        // SOLID BLACK ROWS in light mode. A colour defined in
                        // only one theme is the classic unreadable-UI bug.
  border:  "#E4E7EA",   // Hairline. Was #C8D4E0 — a visible rule around every
                        // card, which is what made the layout read as boxes.
  // ── Semantic ──────────────────────────────────────────────────
  nominal: "#146B30",
  /* #8B5A00 cleared AA on the white panel but not on the INSET zebra row, where
     table values actually sit: 4.02:1 against the 4.5:1 AA asks. Contrast has to
     be met against the surface the text is drawn on, not the lightest one in the
     theme. Darkened until it clears on inset too. */
  caution: "#7F6400",
  warning: "#B01C1C",
  advisory:"#1A4FCC",
  // ── Typography ────────────────────────────────────────────────
  primary: "#0B1524",
  muted:   "#3D5166",
  dim:     "#D0DCE8",   // Grid lines / dividers — NOT a text colour
  /* SC.dim was used as a TEXT colour in 43 places. In light mode that is
     1.39:1 against the panel, where WCAG AA asks 4.5:1 — it is a divider
     colour, and captions, units and help text rendered essentially
     invisible. This is the low-emphasis text colour those sites needed:
     5.21:1 on panel, 4.64:1 on bg. `dim` keeps its real job. */
  subtle:  "#5F6E80",
  // ── Extended ──────────────────────────────────────────────────
  purple:  "#5C22B5",
  orange:  "#A83700",
  // ── Backward-compatible aliases ───────────────────────────────
  text:    "#0B1524",
  amber:   "#7F6400",
  teal:    "#0A6B64",
  blue:    "#1A4FCC",
  red:     "#B01C1C",
  green:   "#146B30",
};

/* LIVE THEME OBJECT.
   Deliberately ONE object identity, mutated in place by applyTheme(). Every
   module that imports SC therefore sees theme changes immediately.
   It cannot be a reassigned binding (`SC = LIGHT`) because ES modules forbid
   assigning to an imported binding — that was fine when everything lived in
   one file, and is the one thing the split had to change. */
export const SC = { ...DARK };

/* ── PHASE COLOURS, PER THEME ─────────────────────────────────────────
   This was ONE hard-coded array shared by both themes:
       ["#ff6b35","#ffd23f","#06d6a0","#118ab2","#8338ec","#6c757d"]
   Measured as text on the light panel, four of the six FAIL WCAG AA:
       T/O 2.84:1   Climb 1.44:1   Cruise 1.89:1   Descent 3.96:1
   Climb at 1.44:1 is why the mission table's "340 kW" was invisible in the
   light theme — the same third-instance-this-week bug as SC.inset and
   SC.subtle: a colour defined for one theme and used in both.

   Both palettes below clear 4.5:1 against their own panel (worst case
   light Climb 4.92:1, dark Descent 6.92:1) while staying six mutually
   distinguishable hues in phase order: takeoff, climb, cruise, descent,
   land, reserve.

   Mutated IN PLACE for exactly the reason the comment above gives for SC —
   every module imports the array by identity, so splice keeps them live. */
const PHC_DARK  = ["#FF8A5C","#F0C24A","#2ED8A7","#4FA8DA","#A78BFA","#9AA7B4"];
/* #8A6D00 at index 1 cleared AA on the white panel and failed on the INSET
   zebra row where the mission-timeline values are drawn: 4.02:1 against 4.5:1.
   A phase colour is used for TEXT in that table as well as for bars, so it has
   to meet the text ratio on the darkest surface it lands on. */
const PHC_LIGHT = ["#C2410C","#7F6400","#0F766E","#0E5C8A","#6D28D9","#4B5563"];
export const PHC = [...PHC_DARK];

export function applyTheme(isDark) {
  Object.assign(SC, isDark ? DARK : LIGHT);
  PHC.splice(0, PHC.length, ...(isDark ? PHC_DARK : PHC_LIGHT));
}

/* ═══════════════════════════════════
   REUSABLE COMPONENTS
   ═══════════════════════════════════ */
