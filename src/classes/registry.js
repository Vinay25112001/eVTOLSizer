/* =====================================================================
   AIRCRAFT-CLASS REGISTRY — the one place that knows which classes exist
   =====================================================================
   A trainer, an airliner and an eVTOL are not one aircraft with different
   numbers. Each has its own inputs (a trainer has a stall speed and a take-off
   distance but no rotor; an airliner has a cruise Mach and a field length),
   its own sizing loop and its own validation aircraft. So each class is a
   separate entry here, and nothing else in the app decides what a class
   means.

   The design follows the survey in
   eVTOL_Sizing_Research/classes/cross-class/ARCHITECTURES.md §4:
   - one dispatch point (sizeDesign); no other code branches on the class
     name (validation/aircraft-classes.mjs enforces it);
   - an unknown class is an error, never a silent fallback to eVTOL;
   - the eVTOL entry is a thin adapter over the existing engine. Its
     defaults ARE DEFAULT_PARAMS and its sizing function IS runSizing, so
     adding classes cannot move an eVTOL number (the same gate proves it).

   Each entry:
     id, label          identity and display name
     description        one sentence for the class picker
     defaults           the class's complete input set
     prepare(params)    UI inputs -> engine inputs (eVTOL: engineInputs)
     size(inputs)       the class's sizing loop -> results
   ===================================================================== */

import { runSizing } from "../engine.js";
import { DEFAULT_PARAMS } from "../lib/defaults.js";
import { engineInputs } from "../lib/designfile.js";
import { TRAINER_DEFAULTS, TRAINER_INPUTS } from "./trainer/defaults.js";
import { sizeTrainer } from "./trainer/size.js";
import { TRANSPORT_DEFAULTS, TRANSPORT_INPUTS } from "./transport/defaults.js";
import { sizeTransport } from "./transport/size.js";
import { TURBOPROP_DEFAULTS, TURBOPROP_INPUTS } from "./turboprop/defaults.js";
import { BIZJET_DEFAULTS, BIZJET_ALL_INPUTS } from "./bizjet/defaults.js";
import { sizeTurboprop } from "./turboprop/size.js";

export const DEFAULT_CLASS = "evtol";

export const AIRCRAFT_CLASSES = Object.freeze({
  evtol: Object.freeze({
    id: "evtol",
    label: "eVTOL",
    description: "Electric vertical take-off and landing aircraft: six layouts, "
               + "NASA UAM sizing mission, validated against NASA concept vehicles.",
    defaults: DEFAULT_PARAMS,
    prepare: engineInputs,
    size: runSizing,
  }),
  trainer: Object.freeze({
    id: "trainer",
    label: "Trainer (piston)",
    description: "Light single-engine piston aeroplane sized from stall speed, climb rate, "
               + "cruise and range: Loftin (NASA RP-1060) matching, GASP (NASA CR-152303) weights.",
    defaults: TRAINER_DEFAULTS,
    inputs: TRAINER_INPUTS,
    prepare: (params) => ({ ...params }),
    size: sizeTrainer,
  }),
  transport: Object.freeze({
    id: "transport",
    label: "Transport (jet airliner)",
    description: "Twin-engine jet airliner sized from payload, range and runway lengths: Loftin "
               + "(NASA RP-1060) matching and fuel fraction, FLOPS (NASA TM-2017-219627) weights via NASA Aviary.",
    defaults: TRANSPORT_DEFAULTS,
    inputs: TRANSPORT_INPUTS,
    prepare: (params) => ({ ...params }),
    size: sizeTransport,
  }),
  bizjet: Object.freeze({
    id: "bizjet",
    label: "Business jet",
    description: "Twin aft-engine business jet sized from seats, range and runway lengths by the jet-transport method "
               + "(Loftin matching, FLOPS weights, segment mission with NBAA-style reserves) with business-jet inputs.",
    defaults: BIZJET_DEFAULTS,
    inputs: BIZJET_ALL_INPUTS,
    prepare: (params) => {
      const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...rest } = { ...BIZJET_DEFAULTS, ...params };
      return rest;
    },
    size: sizeTransport,
  }),
  turboprop: Object.freeze({
    id: "turboprop",
    label: "Transport (turboprop)",
    description: "Twin-turboprop regional airliner sized from payload, range and runway lengths: Scholz & Nita (2008) "
               + "power matching, FLOPS (NASA TM-2017-219627) airframe weights with a GASP / Hamilton Standard propulsion group.",
    defaults: TURBOPROP_DEFAULTS,
    inputs: TURBOPROP_INPUTS,
    prepare: (params) => ({ ...params }),
    size: sizeTurboprop,
  }),
});

export const CLASS_IDS = Object.freeze(Object.keys(AIRCRAFT_CLASSES));

export function classOf(id = DEFAULT_CLASS) {
  const c = Object.prototype.hasOwnProperty.call(AIRCRAFT_CLASSES, id) ? AIRCRAFT_CLASSES[id] : null;
  if (!c) throw new Error(`Unknown aircraft class "${id}". Known classes: ${CLASS_IDS.join(", ")}.`);
  return c;
}

/* The class a page address asks for. No ?class= means eVTOL (every existing
   link); anything else is returned as written, so an unknown value reaches
   the error page instead of silently opening the eVTOL sizer. */
export function classFromSearch(search) {
  const v = new URLSearchParams(search || "").get("class");
  return v == null || v === "" ? DEFAULT_CLASS : v;
}

/* The single dispatch point. `params` are UI inputs; the class prepares and
   sizes them. */
export function sizeDesign({ aircraftClass = DEFAULT_CLASS, params }) {
  const c = classOf(aircraftClass);
  return c.size(c.prepare(params));
}
