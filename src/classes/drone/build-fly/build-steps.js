/* =====================================================================
   BUILD STEPS — the guided build, as data
   =====================================================================
   The Build tab walks the reader through the same design every other
   drone tab reads (design-state.js): each step sets fields of that one
   design, and the sizing re-closes live. Nothing here sizes anything.

   Kept apart from the React so the step order, what each step sets and
   the rotor-count reconciliation can be checked in Node.
   ===================================================================== */

export const BUILD_STEPS = Object.freeze([
  { key: "frame", title: "Frame", sets: ["rotors"], blurb: "Pick the motor layout. It fixes the rotor count the sizing uses." },
  { key: "motor", title: "Motors", sets: ["motorModel"], blurb: "Only motors that publish the constants the motor model needs can be sized." },
  { key: "prop", title: "Propellers", sets: ["propellerId", "propellerMassG"], blurb: "Measured UIUC propellers. The data gives thrust and power, not mass, so the mass is yours." },
  { key: "esc", title: "ESCs", sets: ["escId"], blurb: "The sizing counts one ESC per motor, for its mass and for its current: the published continuous current is checked against the hover draw." },
  { key: "cell", title: "Battery cell", sets: ["cellId"], blurb: "The cell (or pack) the battery is assembled from." },
  { key: "pack", title: "Pack", sets: ["series", "parallel", "packOverhead"], blurb: "Cells in series set the voltage; in parallel, the capacity and current." },
  { key: "avionics", title: "Avionics", sets: ["avionicsMassKg", "avionicsPowerW"], blurb: "Flight controller, receiver, GPS and wiring, as one declared mass and power." },
  { key: "mission", title: "Payload & mission", sets: ["payloadKg", "hoverEnduranceMin", "thrustToWeightRequired", "structureMassKg", "usableFraction", "altitudeM"], blurb: "What it must carry, for how long, and the margins you require." },
  { key: "review", title: "Review & fly", sets: [], blurb: "The closed design. Fly it in the arena when it converges." },
]);

/* The sizing input `rotors` and the frame's motor count are separate
   values in the studio (the Sizing tab can be edited on its own). The
   flight model mixes the sizing's per-rotor numbers with the frame's
   rotor positions, so a mismatch would fly a different aircraft from the
   one sized. The Build tab keeps them equal; the Fly tab refuses when
   they are not. */
export function rotorMismatch(v, frame) {
  if (!frame) return null;
  const sized = Math.round(v?.rotors ?? 0);
  return sized === frame.motorCount ? null : { sized, frame: frame.motorCount };
}

/* A mass as the catalogue publishes it: a number, versions, or null.
   Where a vendor publishes more than one, the sizing uses the lightest
   (sizing.js), and the label says so. */
export function massLabelG(m) {
  if (m == null) return "mass not published";
  if (typeof m === "number") return `${m} g`;
  if (typeof m === "object") {
    const vals = Object.values(m).filter((x) => typeof x === "number");
    if (!vals.length) return "mass not published";
    return vals.length === 1 ? `${vals[0]} g` : `${vals.join(" / ")} g · sized at ${Math.min(...vals)} g`;
  }
  return String(m);
}

/* A board that drives four motors. The sizing counts an ESC's catalogue
   mass once per motor, so a 4-in-1 board's whole mass is counted once per
   motor too; the Build tab says so on the card rather than hide it. */
export const isFourInOne = (esc) => /4[\s-]?in[\s-]?1/i.test(esc?.model ?? "");

/* What the reader has picked at a step, in a few words. */
export function stepSummary(key, design, frame) {
  const { v, built } = design;
  switch (key) {
    case "frame": return frame ? `${frame.frameClass} ${frame.frameType} · ${frame.motorCount}` : "—";
    case "motor": return built.motor?.model ?? "—";
    case "prop": return built.propeller ? `${built.propeller.label} · ${built.propeller.family}` : "—";
    case "esc": return built.esc?.model ?? "—";
    case "cell": return built.cell?.model ?? "—";
    case "pack": return built.pack ? `${built.pack.cellsSeries}S${built.pack.cellsParallel}P · ${built.pack.voltagePrintedV} V` : "cannot be assembled";
    case "avionics": return `${v.avionicsMassKg} kg · ${v.avionicsPowerW} W`;
    case "mission": return `${v.payloadKg} kg for ${v.hoverEnduranceMin} min`;
    case "review": return design.ok ? "converged" : "not converged";
    default: return "";
  }
}
