/* =====================================================================
   EVTOL BUILD LAB — the plan, as data
   =====================================================================
   The OpenVSP tab's build lab puts the SIZED aircraft together step by
   step on a hangar floor ruled in metres. This module decides every
   step, every part, every number and every sentence the lab shows, so a
   gate can hold them in Node. evtol-parts.js shapes the parts and
   hangar-scene.js draws them; neither computes a quantity of the
   aircraft.

   WHERE EACH THING COMES FROM
     every outside part   aircraftGeometry(p, SR): the bodies the layout
                          views, the 3D flight and the .vsp3 export are
                          built from, at their sized dimensions
     seats                drawn: one per occupant the cabin check counts
                          (engine/cabin.js), centred on the sizer's
                          furnishings station (cg.js, an assumption)
     battery pack         drawn: centred on the sizer's pack station
                          (cg.js packSystems, an assumption); its box size
                          is drawn, because no pack volume is modelled
     stands, person       drawn: assembly stands until the gear is on,
                          and a 1.8 m person for scale

   WHAT IT NEVER SHOWS. Outputs under open audit findings (HIDDEN_FIELDS)
   are not read at all: the lab reads the sizing result only through
   `sr()`, which refuses any field not in SR_FIELDS. The airframe is drawn
   true to scale even though its size follows the take-off mass (wing
   area is weight over wing loading), as the 3D flight already draws it;
   the mass itself is never quoted.

   LAYOUTS. Each layout is switched on here once it has been built and
   checked in a browser. Lift + cruise is first; the other five follow.
   ===================================================================== */
import { aircraftGeometry } from "../../engine/geometry.js";
import { CONFIGURATIONS } from "../../engine/configuration.js";
import { cabinAdequacy, OCCUPANT_MASS_KG } from "../../engine/cabin.js";

export const READY_LAYOUTS = Object.freeze(["liftcruise"]);

/* The only sizing-result fields the lab reads. */
export const SR_FIELDS = Object.freeze([
  "r2Converged", "fusLen", "bWing", "Swing", "Cr_", "Ct_", "sweep",
  "bvt_panel", "Cr_vt", "Ct_vt", "vtGamma_opt", "TipSpd", "ChordBl", "solidityUsed",
  "tyreMain", "tyreNose", "cgStations",
]);
/* Under open audit findings (AUDIT/FINDINGS.md and the domain audits it
   indexes): F-19, F-117, F-128, F-R03p (mass); F-25, F-142 (motor); F-13
   (hover power, pack energy); F-E10 (pack layout, C-rate, heat); F-P04
   (disk loading); F-116 (rotor stations); F-126 (gear stroke); F-68, F-69
   (loads); F-24 (stall); F-R01p (OEI). Listed so the gate can prove none
   is read or quoted. */
export const HIDDEN_FIELDS = Object.freeze([
  "MTOW", "PmotKW", "Torque", "MotMass", "motorTorqueNm", "CrateHov", "CrateCr", "Rint", "Pheat", "Ncells",
  "vi_ind", "DLrotor", "DL_installed", "DL_installed_lbft2", "Phov", "Etot", "Wbat", "PackV", "PackAh",
  "Nseries", "Npar", "PackkWh", "PackUsablekWh", "PackInstalledkWh", "xRotFwd", "xRotAft",
  "hoverLoadedRotorRatio", "gearStrokeMm", "gearBottomsOut", "nLimit", "nUltimate", "gustCases",
  "Vstall", "VA", "OEI_margin_pct", "weightGroups", "cgItemised", "xCGtotal",
]);
export function sr(SR, k) {
  if (!SR_FIELDS.includes(k)) throw new Error(`build lab: "${k}" is not a sizing field the lab may read`);
  return SR?.[k];
}

/* ── Parts ──────────────────────────────────────────────────────────── */
export const GROUPS = Object.freeze({
  fuselage: { label: "Fuselage" },
  seats:    { label: "Seats", drawn: true },
  battery:  { label: "Battery pack", drawn: true },
  wing:     { label: "Wing" },
  controls: { label: "Flaps & ailerons" },
  tail:     { label: "Tail" },
  booms:    { label: "Booms" },
  pylons:   { label: "Boom pylons" },
  motors:   { label: "Motors" },
  nacelles: { label: "Nacelles" },
  rotors:   { label: "Lift rotors" },
  pusher:   { label: "Cruise pusher" },
  gear:     { label: "Landing gear" },
});
/* The order the parts are laid out on the floor, and fitted. */
export const GROUP_ORDER = Object.freeze(["fuselage", "wing", "tail", "booms", "pylons", "controls", "rotors", "pusher", "motors", "nacelles", "gear", "seats", "battery"]);

/* Which item, and which group, a geometry body belongs to. One item is
   one physical part: a rotor with its hub, a motor with its spacer, a
   gear leg with its wheel, the pusher with its shaft. */
export function itemOf(b) {
  const label = String(b.label ?? b.kind);
  const stem = (suffix) => label.replace(new RegExp(` ${suffix}$`), "");
  switch (b.kind) {
    case "fuselage": return { key: "fuselage", group: "fuselage", label: "Fuselage" };
    case "wing": return { key: "wing", group: "wing", label: "Wing" };
    case "control": return { key: `control:${label}`, group: "controls", label };
    case "vtail": case "vfin": case "htail": return { key: `tail:${label}`, group: "tail", label };
    case "rotor": return { key: `rotor:${label}`, group: "rotors", label: `Rotor ${label.replace(/^(Lift|Tilt) /, "")}` };
    case "pusher": return { key: "pusher", group: "pusher", label: "Cruise pusher" };
    case "wheel": return { key: `gear:${label}`, group: "gear", label: `${label} leg` };
    case "nacelle": return { key: `nacelle:${stem("nacelle")}`, group: "nacelles", label: `${stem("nacelle")} nacelle` };
    case "boom": {
      if (b.motorPart && / hub$/.test(label)) return { key: `rotor:${stem("hub")}`, group: "rotors", label: `Rotor ${stem("hub").replace(/^(Lift|Tilt) /, "")}` };
      if (b.motorPart) { const s = label.replace(/ (motor|spacer|linkage)$/, ""); return { key: `motor:${s}`, group: "motors", label: `Motor ${s.replace(/^(Lift|Tilt) /, "")}` }; }
      if (b.nacelleMember) { const s = label.replace(/ nacelle.*$/, ""); return { key: `nacelle:${s}`, group: "nacelles", label: `${s} nacelle` }; }
      if (label === "Pusher shaft") return { key: "pusher", group: "pusher", label: "Cruise pusher" };
      if (/ strut$/.test(label)) { const s = stem("strut"); return { key: `gear:${s}`, group: "gear", label: `${s} leg` }; }
      if (/ pylon$/.test(label)) return { key: `pylon:${label}`, group: "pylons", label };
      if (b.stations) return { key: `boom:${label}`, group: "booms", label };
      return { key: `other:${label}`, group: "other", label };
    }
    default: return { key: `other:${label}`, group: "other", label };
  }
}

/* ── Steps ──────────────────────────────────────────────────────────── */
export const STEP_FITS = Object.freeze({
  fuselage: ["fuselage"], cabin: ["seats", "battery"], wing: ["wing", "controls"], tail: ["tail"],
  booms: ["booms", "pylons"], motors: ["motors", "nacelles"], rotors: ["rotors"], pusher: ["pusher"], gear: ["gear"],
});
const STEP_ORDER = ["fuselage", "cabin", "wing", "tail", "booms", "motors", "rotors", "pusher", "gear"];
export const STEP_TEXT = Object.freeze({
  parts:    { title: "Parts", kicker: "Lay out", heading: "Parts on the hangar floor",
              blurb: "Every part of the sized aircraft, laid out on a floor ruled in metres. The outside parts are the sizing's own geometry at its numbers; the parts marked drawn are shapes the sizing does not model." },
  fuselage: { title: "Fuselage", kicker: "Structure", heading: "Set up the fuselage",
              blurb: "The fuselage goes on two assembly stands until the landing gear is on. Its length and its cross-sections are the ones the aircraft was sized with." },
  cabin:    { title: "Cabin & battery", kicker: "Inside", heading: "Seats and the battery pack",
              blurb: "A cutaway: the skin is see-through for this step. The sizing places the seats and the pack only as stations along the body, so their shapes are drawn." },
  wing:     { title: "Wing", kicker: "Structure", heading: "Wing and control surfaces",
              blurb: "The wing sits on top of the fuselage. Its area is set by the weight it carries at the design wing loading, and its span by the aspect ratio." },
  tail:     { title: "Tail", kicker: "Structure", heading: "Fit the tail",
              blurb: "The tail is sized from the wing and the arm it acts over." },
  booms:    { title: "Booms", kicker: "Structure", heading: "Booms and pylons",
              blurb: "The booms carry the lift rotors clear of the wing and of each other." },
  motors:   { title: "Motors", kicker: "Propulsion", heading: "Mount the motors",
              blurb: "One motor under each lift rotor. Their shapes follow NASA's RAVEN model, scaled to the rotor; their power, torque and mass are not shown." },
  rotors:   { title: "Rotors", kicker: "Propulsion", heading: "Fit the lift rotors",
              blurb: "The lift rotors at the sized diameter and blade count." },
  pusher:   { title: "Pusher", kicker: "Propulsion", heading: "Fit the cruise pusher",
              blurb: "A separate propeller pushes the aircraft in cruise, when the lift rotors stop." },
  gear:     { title: "Landing gear", kicker: "Structure", heading: "Landing gear, then off the stands",
              blurb: "Tricycle gear, at the tyre sizes the gear model picked. With the gear on, the stands come away." },
  review:   { title: "Review & fly", kicker: "Done", heading: "The finished aircraft",
              blurb: "The sized aircraft, complete. Walk round it, then fly it: the same aircraft flies its sized mission in the 3D flight below." },
});

/* ── Formatting ─────────────────────────────────────────────────────── */
const m = (x, d = 2) => `${Number(x).toFixed(d)} m`;
const deg = (x, d = 0) => `${Number(x).toFixed(d)}°`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const tyreDia = (s) => { const x = /^(\d+(?:\.\d+)?)x/.exec(String(s ?? "")); return x ? Number(x[1]) * 0.0254 : null; };

/* Section of the fuselage at x, linearly between its sized stations. */
export function sectionAt(fus, x) {
  const L = fus.x1 - fus.x0, t = Math.min(1, Math.max(0, (x - fus.x0) / L)), st = fus.stations;
  let k = 0;
  while (k < st.length - 2 && st[k + 1].t < t) k++;
  const a = st[k], b = st[k + 1], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const lerp = (p, q) => p + (q - p) * u;
  const w = lerp(a.w, b.w), h = lerp(a.h, b.h), dz = lerp(a.dz || 0, b.dz || 0);
  return { w, h, dz, bottom: fus.z + dz - h / 2, top: fus.z + dz + h / 2 };
}

/* ── The plan ───────────────────────────────────────────────────────── */
export function buildPlan(p, SR) {
  const configKey = p?.configType || "hybrid";
  const layout = (CONFIGURATIONS[configKey]?.label || "aircraft").split(" —")[0];
  if (sr(SR, "r2Converged") !== true)
    return { ready: false, configKey, layout, kind: "not-converged",
             text: "The sizing has not converged, so there is no sized aircraft to build. The build lab draws only a converged result." };
  if (!READY_LAYOUTS.includes(configKey))
    return { ready: false, configKey, layout, kind: "not-yet",
             text: `The build lab is being checked one layout at a time, and Lift + cruise is ready first. This design is a ${layout}; switch the layout to Lift + cruise in the sizer to build one here. The other five layouts follow.` };

  const geo = aircraftGeometry(p, SR);
  const bodies = geo.bodies || [];
  const fus = bodies.find((b) => b.kind === "fuselage");
  const wing = bodies.find((b) => b.kind === "wing");
  const vtail = bodies.find((b) => b.kind === "vtail");
  const rotors = bodies.filter((b) => b.kind === "rotor");
  const pusherB = bodies.find((b) => b.kind === "pusher");
  const wheels = bodies.filter((b) => b.kind === "wheel");
  const controls = bodies.filter((b) => b.kind === "control");
  const booms = bodies.filter((b) => b.kind === "boom" && b.stations);
  const zGround = geo.gear?.zGround ?? Math.min(...bodies.filter((b) => b.kind === "wheel").map((b) => b.z - b.radius));

  /* Items: the bodies, gathered into physical parts. */
  const itemMap = new Map();
  for (const b of bodies) {
    const it = itemOf(b);
    if (!itemMap.has(it.key)) itemMap.set(it.key, { ...it, bodies: [] });
    itemMap.get(it.key).bodies.push(b);
  }

  /* The drawn insides. */
  const occ = cabinAdequacy({ fusLen: sr(SR, "fusLen"), fusDiam: p.fusDiam, payload: p.payload, nOccupants: p.nOccupants ?? p.nSeats }).occupants;
  const nSeats = Math.max(1, Math.round(occ));
  const stations = sr(SR, "cgStations") || {};
  const xSeats = Number(stations.furnishings), xPack = Number(stations.packSystems);
  const PITCH = 0.86, rows = [];
  let left = nSeats;
  if (left % 2 === 1) { rows.push([0]); left--; }
  while (left > 0) { rows.push([-0.27, 0.27]); left -= 2; }
  const x0 = xSeats - ((rows.length - 1) * PITCH) / 2;
  const seats = [];
  rows.forEach((row, i) => {
    const x = x0 + i * PITCH, s = sectionAt(fus, x);
    for (const y of row) seats.push({ x, y, floorZ: s.bottom + 0.3 });
  });
  const packSec = sectionAt(fus, xPack);
  const packL = Math.min(1.8, 0.22 * (fus.x1 - fus.x0));
  const pack = { x: xPack, y: 0, z: packSec.bottom + 0.05 + 0.12, l: packL, w: Math.min(0.9, packSec.w * 0.72), h: 0.24 };
  seats.forEach((s, i) => itemMap.set(`seat:${i}`, { key: `seat:${i}`, group: "seats", label: `Seat ${i + 1}`, bodies: [], seat: s }));
  itemMap.set("battery", { key: "battery", group: "battery", label: "Battery pack", bodies: [], pack });

  const items = [...itemMap.values()];
  const present = new Set(items.map((i) => i.group));
  const steps = ["parts", ...STEP_ORDER.filter((k) => STEP_FITS[k].some((g) => present.has(g))), "review"];
  const count = (g) => items.filter((i) => i.group === g).length;

  /* Assembly stands under the fuselage until the gear is on (drawn). */
  const stands = [0.3, 0.68].map((f) => { const x = fus.x0 + f * (fus.x1 - fus.x0), s = sectionAt(fus, x); return { x, topZ: s.bottom, w: s.w }; });

  /* Numbers the lab quotes, every one from the geometry or SR_FIELDS. */
  const fusW = Math.max(...fus.stations.map((s) => s.w)), fusH = Math.max(...fus.stations.map((s) => s.h));
  const D = rotors[0] ? 2 * rotors[0].radius : null, nb = rotors[0]?.blades ?? null;
  const chordDrawn = rotors[0] ? Math.max(0.04 * rotors[0].radius, (rotors[0].solidity || 0.1) * Math.PI * rotors[0].radius / Math.max(2, rotors[0].blades || 3)) : null;
  const flaps = controls.filter((c) => c.ctrlKind === "flap").length, ails = controls.filter((c) => c.ctrlKind === "aileron").length;
  const mains = wheels.filter((w) => /^Main/.test(w.label)), noses = wheels.filter((w) => /^Nose/.test(w.label));
  const tyreM = sr(SR, "tyreMain"), tyreN = sr(SR, "tyreNose");
  const stopped = rotors.filter((r) => r.stopped).length;
  const boomY = booms.length ? Math.abs(booms[0].y) : null;
  const pusherSet = Number(p.cruisePropDiam) > 0;
  const chordSized = sr(SR, "ChordBl"), solSized = sr(SR, "solidityUsed");

  const N = {
    L: m(sr(SR, "fusLen")), W: m(fusW), H: m(fusH), b: m(sr(SR, "bWing")), S: `${Number(sr(SR, "Swing")).toFixed(2)} m²`,
    cr: m(sr(SR, "Cr_")), ct: m(sr(SR, "Ct_")), sweep: deg(sr(SR, "sweep"), 1), xLE: wing ? m(wing.x - fus.x0) : null, tc: wing ? `${Math.round(wing.thickRatio * 100)}%` : null,
    bvt: m(sr(SR, "bvt_panel")), gvt: deg(sr(SR, "vtGamma_opt")), crv: m(sr(SR, "Cr_vt")), ctv: m(sr(SR, "Ct_vt")),
    D: D ? m(D) : null, tip: `${Number(sr(SR, "TipSpd")).toFixed(0)} m/s`, chord: chordDrawn ? m(chordDrawn) : null,
    Dp: pusherB ? m(2 * pusherB.radius) : null, nbp: pusherB?.blades ?? null,
    occ: occ.toFixed(1), occKg: OCCUPANT_MASS_KG.toFixed(1), xSeats: m(xSeats), xPack: m(xPack),
  };

  const bomRow = (g) => {
    switch (g) {
      case "fuselage": return { qty: 1, text: `Fuselage: ${N.L} long, ${N.W} wide, ${N.H} tall` };
      case "wing": return { qty: 1, text: `Wing: ${N.b} span, ${N.S}` };
      case "controls": return { qty: count("controls"), text: `Control surfaces: ${plural(flaps, "flap")}, ${plural(ails, "aileron")}`, note: "spans drawn" };
      case "tail": return vtail ? { qty: 1, text: `V-tail: two panels of ${N.bvt} at ${N.gvt}` } : { qty: count("tail"), text: "Tail surfaces" };
      case "booms": return { qty: count("booms"), text: `Rotor booms, ${m(2 * booms[0].radius)} across` };
      case "pylons": return { qty: count("pylons"), text: "Boom pylons, wing to boom" };
      case "motors": return { qty: count("motors"), text: "Lift motors", note: "shape drawn" };
      case "nacelles": return { qty: count("nacelles"), text: "Nacelles", note: "shape drawn" };
      case "rotors": return { qty: count("rotors"), text: `Lift rotors: ${N.D} across, ${plural(nb, "blade")}` };
      case "pusher": return { qty: 1, text: `Cruise pusher: ${N.Dp} across, ${plural(N.nbp, "blade")}, on its shaft`, note: pusherSet ? null : "size drawn" };
      case "gear": return { qty: count("gear"), text: `Gear legs: ${plural(mains.length, "main")} (${tyreM}), ${plural(noses.length, "nose", "noses")} (${tyreN})` };
      case "seats": return { qty: count("seats"), text: "Seats, one per occupant", note: "drawn" };
      case "battery": return { qty: 1, text: "Battery pack", note: "drawn" };
      default: return { qty: count(g), text: g };
    }
  };
  const bom = GROUP_ORDER.filter((g) => present.has(g)).map((g) => ({ ...bomRow(g), group: g }));
  const needs = (stepKey) => (stepKey === "parts" ? bom : (STEP_FITS[stepKey] ?? []).filter((g) => present.has(g)).map((g) => ({ ...bomRow(g), group: g })));

  const ACTIONS = {
    parts: [
      `Check off the ${plural(items.length, "part")} on the bill of materials: ${count("seats") + 1} of them (the seats and the battery pack) are drawn.`,
      "The floor is ruled in metres, with a heavier line every 5 m. The person by the build spot is 1.8 m tall.",
    ],
    fuselage: [
      `Set the fuselage on the two stands, nose forward. It is ${N.L} long: the length the sizing used.`,
      `Its widest section is ${N.W} across and its tallest ${N.H}: a tall, rounded-rectangle section, after NASA's RAVEN.`,
      `The surface is smoothed between the ${fus.stations.length} sized stations and passes through every one; the windows and the paint are drawn.`,
    ],
    cabin: [
      `Fit ${plural(nSeats, "seat")} for the ${N.occ} occupants the cabin check counts at ${N.occKg} kg each, centred ${N.xSeats} from the nose: the sizer's furnishings station.`,
      `Slide the battery pack under the cabin floor, centred ${N.xPack} from the nose: the sizer's assumed pack station.`,
      "The seats and the pack's box are drawn. The pack's mass and energy are not shown: they are under an open audit finding (F-13).",
    ],
    wing: [
      `Lower the wing onto the top of the fuselage, leading edge ${N.xLE} from the nose.`,
      `Span ${N.b}, area ${N.S}, root chord ${N.cr}, tip chord ${N.ct}, leading-edge sweep ${N.sweep}, thickness ${N.tc} of the chord.`,
      `Hang ${plural(flaps, "flap")} and ${plural(ails, "aileron")} on the trailing edge. Their spans and chords are NASA RAVEN's proportions, cut around the booms: drawn, not sized.`,
    ],
    tail: vtail ? [
      `Fit the V-tail on the tail cone: two panels, each ${N.bvt} along its span, at ${N.gvt} dihedral.`,
      `Root chord ${N.crv}, tip chord ${N.ctv}.`,
    ] : ["Fit the tail surfaces."],
    booms: [
      `Fix the ${plural(count("booms"), "boom")} on top of the wing, ${boomY != null ? m(boomY) : "—"} either side of the centreline, each ${m(2 * booms[0]?.radius)} across.`,
      `Join each boom to the wing with its pylon (${plural(count("pylons"), "pylon")}).`,
      "Where along the boom each rotor sits is the sizing's rotor station; that number is not shown (open audit finding F-116).",
    ],
    motors: [
      `Stand a lift motor at each rotor station on the booms: ${plural(count("motors"), "motor")}.`,
      `The motor shapes are NASA RAVEN's proportions for a ${N.D} rotor: drawn. Their power, torque and mass are not shown (open audit findings F-25 and F-142).`,
    ],
    rotors: [
      `Fit the ${plural(count("rotors"), "lift rotor")}: ${N.D} across, ${plural(nb, "blade")} each, tip speed ${N.tip}.`,
      ...(stopped ? [`In cruise ${stopped === count("rotors") ? "all of them stop" : `${stopped} of them stop`}; here they are parked along the booms.`] : []),
      `The blade chord is drawn at ${N.chord}, as the other 3D views draw it. The sizing's own blade chord is ${chordSized != null ? m(chordSized) : "—"} (solidity ${solSized != null ? Number(solSized).toFixed(2) : "—"}); the two disagree, and that is reported, not fixed here.`,
    ],
    pusher: [
      `Fit the cruise pusher on its shaft at the tail cone: ${plural(N.nbp, "blade")}, ${N.Dp} across.`,
      ...(pusherSet ? [] : ["No pusher size is set in the design, so the geometry draws it at 0.72 × the lift-rotor diameter. The weight model sizes it at the full lift-rotor diameter: the drawing and the weight disagree."]),
    ],
    gear: [
      `Fit ${plural(mains.length, "main leg")} and ${plural(noses.length, "nose leg")}, then lower the aircraft off the stands.`,
      `Main tyres ${tyreM}${tyreDia(tyreM) ? `, ${m(tyreDia(tyreM))} across` : ""}; nose tyre ${tyreN}${tyreDia(tyreN) ? `, ${m(tyreDia(tyreN))} across` : ""}.`,
      "Where the legs sit is the gear model's. Their stroke is not shown (open audit finding F-126).",
    ],
    review: [
      "Walk round it: the person by the nose is 1.8 m tall.",
      "Everything outside is at the sizing's numbers. The seats, the pack's box, the motor shapes, the control-surface spans, the windows and the paint are drawn.",
      "Fly it: the same aircraft flies its sized mission in the 3D flight below.",
    ],
  };
  const actions = (stepKey) => ACTIONS[stepKey] ?? [];

  const FACTS = {
    fuselage: { title: "Fuselage", scale: "To scale: the length and every sized station. Drawn: the smoothing between stations, the windows, the doors and the paint.",
                rows: [["Length", N.L], ["Widest", N.W], ["Tallest", N.H], ["Sized stations", String(fus.stations.length)]] },
    wing: { title: "Wing", scale: "To scale: the planform and the thickness ratio. Drawn: the section (a symmetric four-digit NACA shape).",
            rows: [["Span", N.b], ["Area", N.S], ["Root chord", N.cr], ["Tip chord", N.ct], ["Leading-edge sweep", N.sweep], ["Thickness", N.tc]] },
    controls: { title: "Flaps & ailerons", scale: "Drawn: their spans and chords are NASA RAVEN's proportions (geometry.js), cut around the booms. Not sized.",
                rows: [["Flaps", String(flaps)], ["Ailerons", String(ails)], ["Flap chord", controls.find((c) => c.ctrlKind === "flap") ? `${Math.round(controls.find((c) => c.ctrlKind === "flap").chordFrac * 100)}% of the wing chord` : "—"], ["Aileron chord", controls.find((c) => c.ctrlKind === "aileron") ? `${Math.round(controls.find((c) => c.ctrlKind === "aileron").chordFrac * 100)}% of the wing chord` : "—"]] },
    tail: { title: vtail ? "V-tail" : "Tail", scale: "To scale: the panel span, chords and dihedral. Drawn: the section.",
            rows: vtail ? [["Panel span", N.bvt], ["Dihedral", N.gvt], ["Root chord", N.crv], ["Tip chord", N.ctv]] : [] },
    booms: { title: "Booms", scale: "To scale: where they sit across the wing and their diameter. Drawn: nothing.",
             rows: [["Booms", String(count("booms"))], ["From the centreline", boomY != null ? m(boomY) : "—"], ["Diameter", booms[0] ? m(2 * booms[0].radius) : "—"]] },
    pylons: { title: "Boom pylons", scale: "To scale: as the geometry places them.", rows: [["Pylons", String(count("pylons"))]] },
    motors: { title: "Lift motors", scale: "Drawn: NASA RAVEN's motor proportions, scaled to the rotor diameter. Power, torque and mass are not shown (F-25, F-142).",
              rows: [["Motors", String(count("motors"))], ["For a rotor of", N.D]] },
    rotors: { title: "Lift rotors", scale: "To scale: the diameter and the blade count. Drawn: the blade planform, twist and section.",
              rows: [["Rotors", String(count("rotors"))], ["Diameter", N.D], ["Blades", String(nb)], ["Tip speed", N.tip], ["Blade chord drawn", N.chord], ["Blade chord sized", chordSized != null ? m(chordSized) : "—"], ["Stop in cruise", String(stopped)]] },
    pusher: { title: "Cruise pusher", scale: pusherSet ? "To scale: the diameter set in the design. Drawn: the blades." : "Drawn: no pusher size is set, so the geometry draws 0.72 × the lift-rotor diameter; the weight model uses the full diameter.",
              rows: [["Diameter", N.Dp], ["Blades", String(N.nbp)]] },
    gear: { title: "Landing gear", scale: "To scale: the tyre sizes the gear model picked and where it puts the legs. Drawn: the hubs and the leg fairings. Stroke not shown (F-126).",
            rows: [["Main legs", String(mains.length)], ["Main tyre", String(tyreM)], ["Nose legs", String(noses.length)], ["Nose tyre", String(tyreN)]] },
    seats: { title: "Seats", scale: "Drawn: the sizing counts occupants by mass and places the furnishings at one station; it has no seat layout.",
             rows: [["Seats drawn", String(nSeats)], ["Occupants counted", N.occ], ["At", `${N.occKg} kg each`], ["Centred at", N.xSeats]] },
    battery: { title: "Battery pack", scale: "Drawn: the box. The sizing places the pack at one station and models no volume. Mass and energy are not shown (F-13).",
               rows: [["Centred at", N.xPack], ["Box drawn", `${m(pack.l)} × ${m(pack.w)} × ${m(pack.h)}`]] },
  };
  const facts = (g) => FACTS[g] ?? null;

  const spec = [
    ["Layout", layout], ["Fuselage length", N.L], ["Wing span", N.b], ["Wing area", N.S], ["Aspect ratio", Number(p.AR).toFixed(1)],
    ["Lift rotors", `${count("rotors")} × ${N.D}`], ["Blades", String(nb)], ["Tip speed", N.tip],
    ["Cruise speed", `${Number(p.vCruise).toFixed(1)} m/s`], ["Payload", `${Number(p.payload).toFixed(0)} kg`], ["Occupants", N.occ],
  ];

  return {
    ready: true, configKey, layout, geo, zGround, items, steps, present, stands, bom, needs, actions, facts, spec,
    seats, pack, nSeats, occupants: occ, fuselage: fus, wing,
    person: { x: fus.x0 - 1.4, y: fusW / 2 + 1.3, heightM: 1.8 },
    notes: [
      "Drawn, not sized: seats, the battery box, motor shapes, control-surface spans, windows, paint, stands, the person.",
      ...(pusherSet ? [] : ["Pusher drawn at 0.72 × the rotor diameter (no size set)."]),
    ],
  };
}
