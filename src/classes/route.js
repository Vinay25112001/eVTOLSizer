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

/* ── THE ADDRESS IS READ ONCE AND THEN LEFT ALONE ──────────────────────
   THE BEHAVIOUR THIS REPLACES. Every studio rewrote the address bar as
   you moved: switching to the drone studio set ?mode=drone, opening a
   tab appended &dtab=flight, and so on. Refreshing then reopened
   whatever you were last looking at instead of the eVTOL overview, and
   switching back to eVTOL could leave a stale ?mode= behind.

   The canonical address for this tool is the bare one -- / for the site,
   / for the dev server -- so nothing writes to it any more. Links are
   still READ exactly as before, which is what routeFromSearch does and
   what the gates check, so an address someone types or is sent still
   opens the right studio. It is simply consumed rather than maintained.

   WHY THE SEARCH IS CAPTURED AT MODULE LOAD. The studios are lazy, so
   they mount AFTER Root. If Root cleared the address on its own mount,
   a deep link's ?type= and ?atab= would be gone by the time the studio
   read window.location. Capturing here, at first import, happens before
   any of them exists; the studios read INITIAL_SEARCH and Root clears
   the bar whenever it likes. routeFromSearch itself stays pure, which
   is what keeps validation/aircraft-classes.mjs able to test it. */
export const INITIAL_SEARCH =
  typeof window === "undefined" ? "" : window.location.search;

/** The params this tool routes on. Nothing else in the address is touched. */
export const ROUTING_PARAMS = Object.freeze(
  ["mode", "type", "atab", "class", "dtab", "frame"]);

/**
 * Strip the routing params from the address bar, keeping anything else
 * (a tracking or auth param this tool did not put there stays put).
 * Safe to call repeatedly; does nothing when there is nothing to clear.
 */
export function clearRoutingParams() {
  if (typeof window === "undefined" || !window.history?.replaceState) return false;
  const q = new URLSearchParams(window.location.search);
  if (!ROUTING_PARAMS.some((k) => q.has(k))) return false;
  ROUTING_PARAMS.forEach((k) => q.delete(k));
  const s = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  return true;
}

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
