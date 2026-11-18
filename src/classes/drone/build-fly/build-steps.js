/* =====================================================================
   BUILD STEPS — the guided build, as data
   =====================================================================
   The Build tab walks the reader through the same design every other
   drone tab reads (design-state.js): each step sets fields of that one
   design, and the sizing re-closes live. Nothing here sizes anything.

   Each step also says what you would need on the bench and what to do
   with it. Those lists quote the design (the parts picked, the pack the
   sizing assembled, the airframe builder's arm length and spin
   directions) and otherwise give ordinary build practice. Where a part is
   not a catalogue part (plates, standoffs, wiring, the flight controller)
   the list says it is drawn or declared.

   Kept apart from the React so the step order, what each step sets and
   the rotor-count reconciliation can be checked in Node.
   ===================================================================== */

export const BUILD_STEPS = Object.freeze([
  { key: "parts", title: "Parts", kicker: "Get ready", heading: "Gather the parts", sets: [], blurb: "Everything this design needs, laid out on a cutting mat ruled in true centimetres. Parts with a published size are drawn to it. Hover a row to find it on the mat, or click a part for details." },
  { key: "frame", title: "Frame", kicker: "Build", heading: "Frame & arms", sets: ["rotors"], blurb: "Pick the motor layout. It fixes the rotor count the sizing uses, and the airframe builder sets the arm length from the propeller you size in step 4." },
  { key: "motor", title: "Motors", kicker: "Build", heading: "Mount the motors", sets: ["motorModel"], blurb: "Only motors that publish the constants the motor model needs can be sized. Each motor is drawn to its published stator size." },
  { key: "prop", title: "Propellers", kicker: "Build", heading: "Propellers", sets: ["propellerId", "propellerMassG"], blurb: "Measured UIUC propellers. The data gives thrust and power, not mass, so the mass is yours. The blades are drawn to the diameter, and their twist to the nominal pitch." },
  { key: "esc", title: "ESCs", kicker: "Build", heading: "Speed controllers", sets: ["escId"], blurb: "The sizing counts one ESC per motor, for its mass and for its current: the published continuous current is checked against the hover draw." },
  { key: "cell", title: "Battery cell", kicker: "Build", heading: "Pick the cell", sets: ["cellId"], blurb: "The cell (or pack) the battery is assembled from, drawn to its published size." },
  { key: "pack", title: "Pack", kicker: "Build", heading: "Build the pack", sets: ["series", "parallel", "packOverhead"], blurb: "Cells in series set the voltage; in parallel, the capacity and current. Every cell on the bench is one the sizing counts." },
  { key: "avionics", title: "Avionics", kicker: "Build", heading: "Flight controller & radio", sets: ["avionicsMassKg", "avionicsPowerW"], blurb: "Flight controller, receiver, GPS and wiring, as one declared mass and power. No flight controller is picked, so the module is drawn." },
  { key: "mission", title: "Payload & mission", kicker: "Build", heading: "Payload & mission", sets: ["payloadKg", "hoverEnduranceMin", "thrustToWeightRequired", "structureMassKg", "usableFraction", "altitudeM"], blurb: "What it must carry, for how long, and the margins you require." },
  { key: "review", title: "Review & fly", kicker: "Finish", heading: "Review & fly", sets: [], blurb: "The closed design. Fly it in the arena when it converges." },
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

/* A finished pack in the catalogue (a box with its own S count), as
   against a bare cylindrical cell. */
export const isBoxPack = (cell) => /L\s*x\s*W/i.test(String(cell?.dimensions_mm ?? ""));

/* What the reader has picked at a step, in a few words. */
export function stepSummary(key, design, frame) {
  const { v, built } = design;
  switch (key) {
    case "parts": return `${billOfMaterials(design, frame, null).length} rows to gather`;
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

const mm = (m) => Math.round(m * 1000);
const motorsTurning = (airframe, rot) => (airframe?.rotors ?? []).filter((r) => r.rotation === rot).map((r) => r.motor).sort((a, b) => a - b);

/* "You'll need": what goes on the bench for a step. qty is a count;
   `group` is the part's key on the workbench (drone-parts.js) so a row
   can light its part up; `note` says when a row is drawn or declared. */
export function stepNeeds(key, design, frame, airframe) {
  const { v, built } = design;
  const n = frame?.motorCount ?? Math.round(v.rotors);
  const arms = airframe?.arms ?? n;
  const S = built.pack?.cellsSeries ?? Math.round(v.series), P = built.pack?.cellsParallel ?? Math.round(v.parallel);
  const box = isBoxPack(built.cell);
  switch (key) {
    case "frame": return [
      { qty: 2, text: "centre plates, top and bottom", group: "plates", note: "drawn" },
      { qty: arms, text: airframe ? `arms, motor centre ${mm(airframe.armLengthM)} mm from the frame centre` : "arms", group: "arms" },
      { qty: arms, text: "standoffs with their screws", group: "standoffs", note: "drawn" },
      { qty: 1, text: "landing gear", group: "gear", note: "drawn" },
    ];
    case "motor": return [
      { qty: n, text: built.motor ? [built.motor.model, `${built.motor.kv} rpm/V`, built.motor.stator_size ? `${built.motor.stator_size} stator` : null].filter(Boolean).join(" · ") : "motors", group: "motors" },
      { qty: n, text: built.motor?.mounting_hole_pattern ? `sets of mounting screws (${built.motor.mounting_hole_pattern})` : "sets of mounting screws", group: "motors" },
    ];
    case "prop": {
      const name = built.propeller ? `${built.propeller.label} ${built.propeller.family}` : "propellers";
      return airframe ? [
        { qty: motorsTurning(airframe, "CW").length, text: `${name}, turning CW`, group: "props" },
        { qty: motorsTurning(airframe, "CCW").length, text: `${name}, turning CCW`, group: "props" },
      ] : [{ qty: n, text: name, group: "props" }];
    }
    case "esc": return isFourInOne(built.esc)
      ? [{ qty: Math.ceil(n / 4), text: built.esc.model, group: "escs" }]
      : [{ qty: n, text: built.esc?.model ?? "ESCs", group: "escs" },
         { qty: 1, text: "power distribution board", group: "pdb", note: "drawn" },
         { qty: 2 * n, text: "cable ties", group: "escs", note: "drawn" }];
    case "cell": return [{ qty: S * P, text: box ? `${built.cell?.model ?? "packs"} (finished packs)` : `${built.cell?.model ?? "cell"} cells`, group: "cells" }];
    case "pack": return box
      ? [{ qty: S * P, text: `${built.cell?.model ?? "packs"}, wired ${S} in series × ${P} in parallel`, group: "cells" },
         { qty: 1, text: "series/parallel harness, main lead and connector", group: "pack", note: "drawn" },
         { qty: 2, text: "battery straps", group: "pack", note: "drawn" }]
      : [{ qty: S * P, text: `${built.cell?.model ?? "cell"} cells, as ${S}S${P}P`, group: "cells" },
         { qty: 1, text: "nickel strip, shrink wrap, foam pad", group: "pack", note: "drawn" },
         { qty: 1, text: `main lead with connector, and a ${S + 1}-wire balance lead`, group: "pack", note: "drawn" },
         { qty: 2, text: "battery straps", group: "pack", note: "drawn" }];
    case "avionics": return [
      { qty: 1, text: `flight controller, receiver, GPS and wiring: ${v.avionicsMassKg} kg and ${v.avionicsPowerW} W, declared`, group: "avionics", note: "declared" },
      { qty: 4, text: "vibration dampers", group: "avionics", note: "drawn" },
    ];
    case "mission": return v.payloadKg > 0 ? [{ qty: 1, text: `payload, ${v.payloadKg} kg`, group: "payload", note: "declared" }] : [];
    default: return [];
  }
}

/* The whole bill of materials: every step's needs, in build order. */
export function billOfMaterials(design, frame, airframe) {
  return BUILD_STEPS.flatMap((s) => (s.key === "parts" ? [] : stepNeeds(s.key, design, frame, airframe).map((x) => ({ ...x, step: s.key }))));
}

/* "Do this": the step's instructions, with the design's numbers in them. */
export function stepActions(key, design, frame, airframe) {
  const { v, built } = design;
  const n = frame?.motorCount ?? Math.round(v.rotors);
  const pack = built.pack, S = pack?.cellsSeries, P = pack?.cellsParallel;
  const cw = motorsTurning(airframe, "CW").join(", "), ccw = motorsTurning(airframe, "CCW").join(", ");
  switch (key) {
    case "parts": return [
      "Lay the parts out on the mat and check each one off against the list.",
      frame ? `This frame takes ${frame.motorCount} motors and the sizing has ${Math.round(v.rotors)} rotors; they must match before it can fly.` : "Pick a frame first.",
    ];
    case "frame": return airframe ? [
      `Bolt the ${airframe.arms} arms between the centre plates so each motor centre is ${mm(airframe.armLengthM)} mm from the frame centre. That is the shortest arm at which the nearest propeller tips clear each other by ${mm(2 * airframe.tipGapFraction * airframe.propRadiusM)} mm, the airframe builder's declared tip gap.`,
      "Fit the standoffs between the plates and the landing gear under the bottom plate.",
      `Number the arms 1 to ${n} as the frame diagram shows: those are the ArduPilot motor outputs.`,
    ] : ["Pick a frame the airframe builder can lay out."];
    case "motor": return [
      `Screw one ${built.motor?.model ?? "motor"} to each motor plate${built.motor?.mounting_hole_pattern ? `, on its published hole pattern (${built.motor.mounting_hole_pattern})` : ""}. Use screws short enough not to touch the windings.`,
      "Run each motor's three leads along its arm towards the centre.",
    ];
    case "prop": return airframe ? [
      `Propellers turning clockwise (seen from above) go on motors ${cw || "none"}; anticlockwise on motors ${ccw || "none"}. The spin directions are ArduPilot's (AP_MotorsMatrix.cpp).`,
      "Each blade's leading edge faces the way it turns. Tighten the nuts firmly.",
      "On a real build, fit the propellers last, after the motor-direction check with the battery connected.",
    ] : ["Pick a frame first."];
    case "esc": return isFourInOne(built.esc) ? [
      `Mount the ${built.esc.model} in the stack between the plates.`,
      "Solder each motor's three leads to its pads; swapping any two leads reverses that motor.",
      "Solder the battery leads to the board's power pads, red to +.",
    ] : [
      `Tie one ${built.esc?.model ?? "ESC"} to each arm, its motor leads towards the motor.`,
      "Solder the three motor leads to the ESC; swapping any two reverses the motor.",
      "Solder each ESC's power leads to the power distribution board, red to + and black to −.",
    ];
    case "cell": return [
      "Use cells of one model and one batch, all at the same voltage before they are joined.",
      pack ? `This design takes ${pack.cellCount} of them.` : "The pack cannot be assembled from this cell.",
    ];
    case "pack": return pack ? (isBoxPack(built.cell) ? [
      `Wire ${S} packs in series and ${P} in parallel: ${pack.voltagePrintedV} V nominal, ${pack.capacityMah} mAh.`,
      "Strap the packs to the top plate, centred over the frame centre.",
    ] : [
      `Join the cells ${P} in parallel per group and the ${S} groups in series: ${S}S${P}P, ${pack.voltagePrintedV} V nominal, ${pack.capacityMah} mAh, ${Math.round(pack.energyWhPublished)} Wh.`,
      `Fit the ${S + 1}-wire balance lead and the main lead, then shrink-wrap the pack.`,
      "Strap the pack to the top plate on its foam pad, centred over the frame centre.",
    ]) : [`This pack cannot be assembled: ${built.packError}`];
    case "avionics": return [
      "Mount the flight controller on its dampers at the frame centre, its arrow pointing forward.",
      "Raise the GPS on its mast, away from the power leads, arrow forward.",
      "Fit the receiver and set its two antennas at right angles to each other.",
    ];
    case "mission": return v.payloadKg > 0
      ? [`Hang the ${v.payloadKg} kg payload under the frame, centred under the frame centre.`]
      : ["No payload: the sizing carries none."];
    case "review": return [
      "Check that the sizing converges and every check on the spec sheet passes.",
      "Then fly it in the arena.",
    ];
    default: return [];
  }
}

/* What the workbench shows when a part is clicked: the catalogue's
   numbers for it, and how much of the drawing is to scale. */
export function partFacts(groupKey, design, airframe) {
  const { v, built } = design;
  const m = built.motor, p = built.propeller, e = built.esc, c = built.cell, k = built.pack;
  const dims = (d) => (d == null ? null : typeof d === "string" ? d : Object.values(d).filter((x) => typeof x === "string").join(" or "));
  const declaredStructure = ["the sizing counts the frame as one declared structure mass", `${v.structureMassKg} kg`];
  switch (groupKey) {
    case "motors": return m && { title: m.model, scale: "To scale: stator, shaft and hole circle. Bell and base drawn.", rows: [
      ["Kv", `${m.kv} rpm/V`], ["stator", m.stator_diameter_mm ? `${m.stator_diameter_mm} × ${m.stator_height_mm} mm` : "not published"],
      ["shaft", m.shaft_diameter_mm ? `${m.shaft_diameter_mm} mm` : "not published"], ["mounting", m.mounting_hole_pattern ?? "not published"],
      ["mass", massLabelG(m.mass_g)], ["continuous current", m.max_continuous_current_a != null ? `${m.max_continuous_current_a} A` : "not published"]] };
    case "props": return p && { title: `${p.label} ${p.family}`, scale: "To scale: diameter. Twist drawn from the nominal pitch; planform drawn.", rows: [
      ["diameter", `${mm(p.diameterM)} mm`], ["pitch", `${mm(p.pitchM)} mm`], ["static test points", String(p.static?.length ?? 0)], ["mass, each", `${v.propellerMassG} g, declared`]] };
    case "escs": return e && { title: e.model, scale: dims(e.dimensions_mm) ? "To scale: the published case size. Wires and ties drawn." : "Drawn: no published size.", rows: [
      ["continuous current", e.continuous_current_a != null ? `${e.continuous_current_a} A` : "not published"], ["size", dims(e.dimensions_mm) ? `${dims(e.dimensions_mm)} mm` : "not published"],
      ["mass", massLabelG(e.mass_g)], ...(isFourInOne(e) ? [["counted", "4-in-1 board: the sizing counts its whole mass once per motor"]] : [])] };
    case "cells": return c && { title: c.model, scale: isBoxPack(c) ? "To scale: the published pack size." : "To scale: the published cell size. The grid they sit in is drawn.", rows: [
      ["size", `${dims(c.dimensions_mm) ?? "not published"}${c.dimensions_mm ? " mm" : ""}`], ["capacity", c.capacity_mah != null ? `${c.capacity_mah} mAh` : "not published"],
      ["energy", c.capacity_wh != null ? `${c.capacity_wh} Wh` : "not published"], ["mass", massLabelG(c.mass_g)], ["on this drone", k ? `${k.cellCount}` : "—"]] };
    case "pack": return k && { title: `${k.cellsSeries}S${k.cellsParallel}P pack`, scale: "Cells to scale. Wrap, strip, leads and straps drawn.", rows: [
      ["voltage", `${k.voltagePrintedV} V nominal`], ["capacity", `${k.capacityMah} mAh`], ["energy", `${Math.round(k.energyWhPublished)} Wh`],
      ["mass", `${Math.round(k.massG)} g, with ${Math.round(100 * k.overheadFraction)} % declared overhead`]] };
    case "arms": return airframe && { title: `${airframe.arms} arms`, scale: "Arm length from the airframe builder. Tube and clamps drawn.", rows: [
      ["motor centre from frame centre", `${mm(airframe.armLengthM)} mm`], ["tip gap, declared", `${Math.round(100 * airframe.tipGapFraction)} % of the propeller radius`], declaredStructure] };
    case "plates": case "standoffs": case "gear": return { title: { plates: "Centre plates", standoffs: "Standoffs", gear: "Landing gear" }[groupKey], scale: "Drawn: not a catalogue part.", rows: [declaredStructure] };
    case "pdb": return { title: "Power distribution board", scale: "Drawn: not a catalogue part.", rows: [] };
    case "avionics": return { title: "Flight controller, GPS, receiver", scale: "Drawn: no flight controller is picked; avionics are one declared mass.", rows: [["mass", `${v.avionicsMassKg} kg, declared`], ["power", `${v.avionicsPowerW} W, declared`]] };
    case "payload": return { title: "Payload", scale: "Drawn box; the mass is declared.", rows: [["mass", `${v.payloadKg} kg`]] };
    default: return null;
  }
}
