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
      <button type="button" key={id} aria-pressed={on} title={title} className="gc-key"
        onClick={() => { if (!on) requestDesignMode(id); }}
        style={{ minHeight: 28, padding: "0 11px", cursor: on ? "default" : "pointer" }}>
        {label}
      </button>
    );
  };
  return (
    /* A recessed three-way switch (ui/glass.jsx): the chosen engine is the
       lit key. */
    <div role="group" aria-label="Design mode" className="gc-well"
      style={{ display: "inline-flex", gap: 2, padding: 3 }}>
      {opt("evtol", "eVTOL", "Size an electric VTOL aircraft (the eVTOL engine)")}
      {opt("aircraft", "Aircraft", "Size a fixed-wing aircraft: trainer, turboprop, business jet or airliner (the aircraft engine)")}
      {opt("drone", "Drone", "Size a small uncrewed multirotor: tri, quad, hexa, octo or X8 (the drone engine)")}
    </div>
  );
}
