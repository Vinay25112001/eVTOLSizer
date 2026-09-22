/* =====================================================================
   DESIGN-MODE ROUTING — which engine an address opens
   =====================================================================
   Plain JavaScript (no JSX) so the gates can test it. Root.jsx uses it.
     (none)                       eVTOL, as every existing link expects
     ?mode=aircraft&type=bizjet   the aircraft studio on a type
     ?mode=drone                  the drone studio (small uncrewed multirotor)
     ?class=trainer|transport|turboprop|bizjet   older links: the studio
     ?class=<anything else>       { unknown }: an error page, never a
                                  silent fallback (registry rule)

   `mode=drone` carries no type: a drone's configuration is a frame class
   and layout (QUAD/X, HEXA/PLUS...), which the drone studio reads from its
   own `frame` parameter. Keeping it out of STUDIO_TYPES means an unknown
   ?class= still reaches the error page rather than opening a drone.
   ===================================================================== */
import { classFromSearch } from "./registry.js";

export const STUDIO_TYPES = Object.freeze(["trainer", "turboprop", "bizjet", "transport"]);
export const DEFAULT_STUDIO_TYPE = "transport";
export const DESIGN_MODES = Object.freeze(["evtol", "aircraft", "drone"]);

export function routeFromSearch(search) {
  const q = new URLSearchParams(search || "");
  const id = classFromSearch(search);
  if (id !== "evtol") return STUDIO_TYPES.includes(id) ? { mode: "aircraft", type: id } : { unknown: id };
  if (q.get("mode") === "drone") return { mode: "drone", type: null };
  if (q.get("mode") === "aircraft") {
    const t = q.get("type");
    return { mode: "aircraft", type: STUDIO_TYPES.includes(t) ? t : DEFAULT_STUDIO_TYPE };
  }
  return { mode: "evtol", type: null };
}
