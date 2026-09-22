/* =====================================================================
   DESIGN MODE SWITCH — eVTOL or fixed-wing aircraft
   =====================================================================
   The one control that moves between the two sizing engines. It does not
   size anything and does not know either engine: it announces the choice
   with a "design-mode" window event, which Root (src/classes/Root.jsx)
   answers by showing the eVTOL sizer or the aircraft studio. The eVTOL
   sizer stays mounted while hidden, so its design is exactly as the user
   left it when they come back.
   ===================================================================== */
import { SC } from "../../lib/theme.js";

export const DESIGN_MODE_EVENT = "design-mode";

export function requestDesignMode(mode, type) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new window.CustomEvent(DESIGN_MODE_EVENT, { detail: { mode, type } }));
}

export default function DesignModeSwitch({ mode }) {
  const opt = (id, label, title) => {
    const on = mode === id;
    return (
      <button type="button" key={id} aria-pressed={on} title={title}
        onClick={() => { if (!on) requestDesignMode(id); }}
        style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: on ? "default" : "pointer",
                 fontFamily: "'DM Mono',monospace", border: "none", borderRadius: 3,
                 background: on ? SC.inset : "transparent", color: on ? SC.text : SC.muted }}>
        {label}
      </button>
    );
  };
  return (
    <div role="group" aria-label="Design mode"
      style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${SC.border}`, borderRadius: 4, background: SC.panel }}>
      {opt("evtol", "eVTOL", "Size an electric VTOL aircraft (the eVTOL engine)")}
      {opt("aircraft", "AIRCRAFT", "Size a fixed-wing aircraft: trainer, turboprop, business jet or airliner (the aircraft engine)")}
      {opt("drone", "DRONE", "Size a small uncrewed multirotor: tri, quad, hexa, octo or X8 (the drone engine)")}
    </div>
  );
}
