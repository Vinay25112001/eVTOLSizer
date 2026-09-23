/* =====================================================================
   ROOT — the dual sizing tool: eVTOL engine or aircraft engine
   =====================================================================
   Three design modes, each with its own engine, inputs and tabs:
     eVTOL     <App/>, the eVTOL sizer, rendered exactly as before
     aircraft  <AircraftStudio/>, fixed-wing types on the aircraft engine
               (src/classes/aircraft/)
     drone     <DroneStudio/>, small uncrewed multirotors
               (src/classes/drone/) — a separate mode rather than an
               aircraft type because the eVTOL engine's mass correlations
               are fitted from 620 kg up and a 2 kg quadcopter sits orders
               of magnitude below them.
   The mode switch (DesignModeSwitch) announces a choice with a window
   event; this component answers it without a page load. Each studio stays
   mounted while another is shown, so switching back finds each design
   exactly as it was left, and each is only mounted once its mode has been
   visited.

   Addresses: see route.js.
   ===================================================================== */
import { Suspense, lazy, useEffect, useState } from "react";
import App from "../App";
import { CLASS_IDS } from "./registry.js";
import { routeFromSearch, STUDIO_TYPES, INITIAL_SEARCH, clearRoutingParams } from "./route.js";
import { DESIGN_MODE_EVENT } from "./aircraft/DesignModeSwitch.jsx";
import { AuthSessionProvider } from "../lib/auth-session.jsx";
import { UnitSystemProvider } from "../lib/unit-system.jsx";

const AircraftStudio = lazy(() => import("./aircraft/AircraftStudio.jsx"));
const DroneStudio = lazy(() => import("./drone/DroneStudio.jsx"));
const loadingAircraft = <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>Loading the aircraft engine…</div>;
const loadingDrone = <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>Loading the drone engine…</div>;

function UnknownClass({ id }) {
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#C8D8E8", background: "#0A0E14", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20 }}>Unknown aircraft class “{id}”</h1>
      <p style={{ fontSize: 13 }}>This build knows: {CLASS_IDS.join(", ")}.</p>
      <p style={{ fontSize: 13 }}><a href="?" style={{ color: "#4090D8" }}>Open the eVTOL sizer</a></p>
    </div>
  );
}

export default function Root() {
  /* INITIAL_SEARCH, not window.location: Root clears the address on
     mount and the lazy studios read the captured copy afterwards. */
  const [initial] = useState(() => routeFromSearch(INITIAL_SEARCH));
  const [mode, setMode] = useState(initial.mode);
  const [type, setType] = useState(initial.type ?? "transport");
  const [evtolMounted, setEvtolMounted] = useState(initial.mode === "evtol");
  const [studioMounted, setStudioMounted] = useState(initial.mode === "aircraft");
  const [droneMounted, setDroneMounted] = useState(initial.mode === "drone");

  /* The address has been read into `initial` above; clear it so the bar
     is the bare one from here on and a refresh opens the eVTOL overview.
     Runs once, after the captured copy exists. */
  useEffect(() => { clearRoutingParams(); }, []);

  useEffect(() => {
    const on = (e) => {
      const asked = e.detail?.mode;
      const next = asked === "aircraft" ? "aircraft" : asked === "drone" ? "drone" : "evtol";
      if (e.detail?.type && STUDIO_TYPES.includes(e.detail.type)) setType(e.detail.type);
      /* NO ADDRESS IS WRITTEN HERE ANY MORE. Each branch used to
         replaceState its own mode and tabs into the bar, which is why a
         refresh reopened the drone flight sim instead of the eVTOL
         overview. See route.js: the address is read once and then left
         bare. Mounting is all that happens now. */
      if (next === "evtol") setEvtolMounted(true);
      if (next === "aircraft") setStudioMounted(true);
      if (next === "drone") setDroneMounted(true);
      setMode(next);
      window.scrollTo?.(0, 0);
    };
    window.addEventListener(DESIGN_MODE_EVENT, on);
    return () => window.removeEventListener(DESIGN_MODE_EVENT, on);
  }, []);

  if (initial.unknown) return <UnknownClass id={initial.unknown} />;
  /* THE PROVIDER WRAPS ALL THREE, which is the whole point: the studios
     stay mounted together, so one session held above them is one fact
     rather than three copies that can disagree. */
  return (
    <AuthSessionProvider>
      <UnitSystemProvider>
      {evtolMounted && (
        <div style={{ display: mode === "evtol" ? "contents" : "none" }}>
          <App />
        </div>
      )}
      {studioMounted && (
        <div style={{ display: mode === "aircraft" ? "contents" : "none" }}>
          <Suspense fallback={loadingAircraft}><AircraftStudio initialType={type} requestedType={type} /></Suspense>
        </div>
      )}
      {droneMounted && (
        <div style={{ display: mode === "drone" ? "contents" : "none" }}>
          <Suspense fallback={loadingDrone}><DroneStudio /></Suspense>
        </div>
      )}
      </UnitSystemProvider>
    </AuthSessionProvider>
  );
}
