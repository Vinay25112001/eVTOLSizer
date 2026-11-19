import { MissionFlight3D } from "../panels/mission-flight-3d/MissionFlight3D.jsx";
import { EvtolBuildLab } from "../panels/evtol-build/EvtolBuildLab.jsx";

/* Tab 29 — Build eVTOL.
   The sized aircraft put together step by step on a hangar floor ruled in
   metres, then flown through the mission it was sized for. Both panels lived
   on the OpenVSP tab; they moved here (2026-11-18, the user's call) so the
   OpenVSP tab is about the model and its export, and a student building and
   test-flying has one place to do it. Index 29 is appended, not inserted, so
   every numeric ?tab= link keeps pointing where it did; the Tools group lists
   it beside OpenVSP.

   Nothing here computes: both panels read the converged result and the
   engine's geometry, and the flight is positioned by engine/mission-path.js. */
export function BuildEvtolTab(ctx) {
  const { params, SR } = ctx;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The build: its parts at the sizing's own dimensions, the shapes
          nothing sizes marked as drawn. It hands over to the flight below. */}
      <EvtolBuildLab params={params} SR={SR}/>
      {/* The same aircraft flying its sized mission in 3D at true scale. It
          stops at each hover/wing-borne step and says the transition is not
          modelled, rather than drawing one. */}
      <MissionFlight3D params={params} SR={SR}/>
    </div>
  );
}
