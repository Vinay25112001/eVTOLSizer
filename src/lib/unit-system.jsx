/* =====================================================================
   THE UNIT SYSTEM THE READER CHOSE — one setting, all three studios
   =====================================================================
   Held above the studios for the same reason the signed-in session is:
   Root.jsx keeps all three mounted at once, so three copies of this
   setting would drift and switching mode would silently change the
   units under you. It is one choice, so it is stored once.

   Persisted, because a reader who works in feet does not want to say so
   again on every reload. localStorage access is wrapped: a private
   window or blocked site data throws on read, and a unit toggle is not
   worth failing the page for.
   ===================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SYSTEMS } from "./units.js";

const KEY = "sizer_unit_system";
const UnitSystemContext = createContext(null);

export function UnitSystemProvider({ children }) {
  const [system, setSystem] = useState(() => {
    /* ?units=IMP wins over the stored preference, the same way ?theme=
       already does: a deep link should show what it says it shows,
       whatever the reader last chose on this machine. */
    try {
      const q = new URLSearchParams(window.location.search).get("units");
      if (q && SYSTEMS.includes(q.toUpperCase())) return q.toUpperCase();
    } catch { /* no window, or an unparseable search */ }
    try {
      const v = window.localStorage?.getItem(KEY);
      return SYSTEMS.includes(v) ? v : "SI";
    } catch { return "SI"; }
  });

  useEffect(() => {
    try { window.localStorage?.setItem(KEY, system); } catch { /* not worth failing for */ }
  }, [system]);

  const toggle = useCallback(() => setSystem((s) => (s === "SI" ? "IMP" : "SI")), []);
  const value = useMemo(() => ({ system, setSystem, toggle }), [system, toggle]);
  return <UnitSystemContext.Provider value={value}>{children}</UnitSystemContext.Provider>;
}

/* Returns SI when there is no provider above, so a component rendered on
   its own in a test still shows its numbers rather than crashing. */
export function useUnitSystem() {
  return useContext(UnitSystemContext) ?? { system: "SI", setSystem: () => {}, toggle: () => {} };
}
