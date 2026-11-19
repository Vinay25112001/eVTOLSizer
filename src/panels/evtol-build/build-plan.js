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
                          and a 1.8 m person for scale, placed clear of
                          every rotor disc

   WHAT IT NEVER SHOWS. Outputs under open audit findings (HIDDEN_FIELDS)
   are not read at all: the lab reads the sizing result only through
   `sr()`, which refuses any field not in SR_FIELDS. The airframe is drawn
   true to scale even though its size follows the take-off mass (wing
   area is weight over wing loading), as the 3D flight already draws it;
   the mass itself is never quoted.

   LAYOUTS. All six. The steps a layout gets are the groups its geometry
   has: a multicopter has arms and no wing, a tilt-rotor has nacelles and
   no booms. Every sentence that differs between layouts is decided from
   the geometry itself (which side of the wing the booms are on, which
   rotors tilt, whether discs overlap), not from the layout's name, except
   the two citations that belong to one layout each (the side-by-side
   overlap and the multicopter's stepped rotors, both AIAA 2018-3847).
   ===================================================================== */
import { aircraftGeometry } from "../../engine/geometry.js";
import { CONFIGURATIONS } from "../../engine/configuration.js";
import { cabinAdequacy, OCCUPANT_MASS_KG } from "../../engine/cabin.js";

export const READY_LAYOUTS = Object.freeze(["liftcruise", "multicopter", "sideBySide", "hybridPusher", "hybrid", "tiltrotor"]);

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
  arms:     { label: "Rotor arms" },
  motors:   { label: "Motors" },
  nacelles: { label: "Nacelles" },
  rotors:   { label: "Rotors" },
  pusher:   { label: "Cruise pusher" },
  gear:     { label: "Landing gear" },
});
/* The order the parts are laid out on the floor, and fitted. */
export const GROUP_ORDER = Object.freeze(["fuselage", "wing", "tail", "booms", "pylons", "arms", "controls", "rotors", "pusher", "motors", "nacelles", "gear", "seats", "battery"]);

/* Which item, and which group, a geometry body belongs to. One item is
   one physical part: a rotor with its hub, a motor with its spacer, a
   gear leg with its wheel, the pusher with its shaft. */
/* "Lift 1" is rotor 1; "Tip rotor L" already says what it is. */
const NUMBERED = /^(Lift|Tilt|Rotor) /;
const named = (s) => !NUMBERED.test(s) && /rotor/i.test(s);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const rotorName = (s) => (named(s) ? cap(s) : `Rotor ${s.replace(NUMBERED, "")}`);
const motorName = (s) => (named(s) ? `${cap(s)} motor` : `Motor ${s.replace(NUMBERED, "")}`);
export function itemOf(b) {
  const label = String(b.label ?? b.kind);
  const stem = (suffix) => label.replace(new RegExp(` ${suffix}$`), "");
  switch (b.kind) {
    case "fuselage": return { key: "fuselage", group: "fuselage", label: "Fuselage" };
    case "wing": return { key: "wing", group: "wing", label: "Wing" };
    case "control": return { key: `control:${label}`, group: "controls", label };
    case "vtail": case "vfin": case "htail": return { key: `tail:${label}`, group: "tail", label };
    case "rotor": return { key: `rotor:${label}`, group: "rotors", label: rotorName(label) };
    case "pusher": return { key: "pusher", group: "pusher", label: "Cruise pusher" };
    case "wheel": return { key: `gear:${label}`, group: "gear", label: `${label} leg` };
    case "nacelle": return { key: `nacelle:${stem("nacelle")}`, group: "nacelles", label: `${stem("nacelle")} nacelle` };
    case "boom": {
      if (b.motorPart && / hub$/.test(label)) return { key: `rotor:${stem("hub")}`, group: "rotors", label: rotorName(stem("hub")) };
      if (b.motorPart) { const s = label.replace(/ (motor|spacer|linkage)$/, ""); return { key: `motor:${s}`, group: "motors", label: motorName(s) }; }
      if (b.nacelleMember) { const s = label.replace(/ nacelle.*$/, ""); return { key: `nacelle:${s}`, group: "nacelles", label: `${s} nacelle` }; }
      if (label === "Pusher shaft") return { key: "pusher", group: "pusher", label: "Cruise pusher" };
      if (/ strut$/.test(label)) { const s = stem("strut"); return { key: `gear:${s}`, group: "gear", label: `${s} leg` }; }
      /* A multicopter's arms ride on a deck carried by this pylon. */
      if (label === "Rotor pylon") return { key: "arm:pylon", group: "arms", label: "Rotor pylon" };
      if (/^Arm \d+$/.test(label)) return { key: `arm:${label}`, group: "arms", label };
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
  booms: ["booms", "pylons"], arms: ["arms"], motors: ["motors", "nacelles"], rotors: ["rotors"], pusher: ["pusher"], gear: ["gear"],
});
const STEP_ORDER = ["fuselage", "cabin", "wing", "tail", "booms", "arms", "motors", "rotors", "pusher", "gear"];
/* The words every layout shares. A plan's own text(step) starts from these
   and changes what its geometry makes different. */
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
              blurb: "The booms carry rotors clear of the wing and of each other." },
  arms:     { title: "Arms", kicker: "Structure", heading: "Rotor arms",
              blurb: "With no wing, each rotor stands at the end of an arm, spaced so the discs clear the cabin and each other as the layout's spacing rule sets." },
  motors:   { title: "Motors", kicker: "Propulsion", heading: "Mount the motors",
              blurb: "One motor under each rotor. Their shapes follow NASA's RAVEN model, scaled to the rotor; their power, torque and mass are not shown." },
  rotors:   { title: "Rotors", kicker: "Propulsion", heading: "Fit the rotors",
              blurb: "The rotors at the sized diameter and blade count." },
  pusher:   { title: "Pusher", kicker: "Propulsion", heading: "Fit the cruise pusher",
              blurb: "A separate propeller pushes the aircraft in cruise, when the lift rotors stop." },
  gear:     { title: "Landing gear", kicker: "Structure", heading: "Landing gear, then off the stands",
              blurb: "The legs and tyres the gear model picked. With the gear on, the stands come away." },
  review:   { title: "Review & fly", kicker: "Done", heading: "The finished aircraft",
              blurb: "The sized aircraft, complete. Walk round it, then fly it: the same aircraft flies its sized mission in the 3D flight below." },
});

/* ── Formatting ─────────────────────────────────────────────────────── */
const m = (x, d = 2) => `${Number(x).toFixed(d)} m`;
const deg = (x, d = 0) => `${Number(x).toFixed(d)}°`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
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
             text: `The build lab has no build for this layout (${layout}). Switch the layout in the sizer to one of the six it knows.` };

  const geo = aircraftGeometry(p, SR);
  const bodies = geo.bodies || [];
  const fus = bodies.find((b) => b.kind === "fuselage");
  const wing = bodies.find((b) => b.kind === "wing");
  const vtail = bodies.find((b) => b.kind === "vtail");
  const fin = bodies.find((b) => b.kind === "vfin");
  const stab = bodies.find((b) => b.kind === "htail");
  const rotors = bodies.filter((b) => b.kind === "rotor");
  const pusherB = bodies.find((b) => b.kind === "pusher");
  const wheels = bodies.filter((b) => b.kind === "wheel");
  const controls = bodies.filter((b) => b.kind === "control");
  const booms = bodies.filter((b) => b.kind === "boom" && b.stations);
  const nacelles = bodies.filter((b) => b.kind === "nacelle");
  const arms = bodies.filter((b) => b.kind === "boom" && /^Arm \d+$/.test(String(b.label)));
  const armPylon = bodies.find((b) => b.kind === "boom" && b.label === "Rotor pylon");
  const linkages = bodies.filter((b) => b.kind === "boom" && / linkage$/.test(String(b.label)));
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

  /* What the geometry makes different between layouts. */
  const fusW = Math.max(...fus.stations.map((s) => s.w)), fusH = Math.max(...fus.stations.map((s) => s.h));
  const tilting = rotors.filter((r) => r.tilting), stopped = rotors.filter((r) => r.stopped);
  const rotorWord = tilting.length === rotors.length && rotors.length ? "tilting rotors" : !tilting.length && pusherB ? "lift rotors" : "rotors";
  const RotorWord = rotorWord[0].toUpperCase() + rotorWord.slice(1);
  const sizes = [...new Map(rotors.map((r) => [`${(2 * r.radius).toFixed(2)}|${r.blades}`, r])).values()];
  const sizeText = (sep = "; ") => sizes.map((r) => `${m(2 * r.radius)} across, ${plural(r.blades, "blade")}`).join(sep);
  const D = rotors[0] ? 2 * rotors[0].radius : null, nb = rotors[0]?.blades ?? null;
  const chordDrawn = rotors[0] ? Math.max(0.04 * rotors[0].radius, (rotors[0].solidity || 0.1) * Math.PI * rotors[0].radius / Math.max(2, rotors[0].blades || 3)) : null;
  const kinds = [...new Set(controls.map((c) => c.ctrlKind))];
  const ctrlCount = (k) => controls.filter((c) => c.ctrlKind === k).length;
  const ctrlText = kinds.map((k) => plural(ctrlCount(k), k)).join(", ");
  const mains = wheels.filter((w) => /^Main/.test(w.label)), noses = wheels.filter((w) => /^Nose/.test(w.label));
  const tricycle = mains.length === 2 && noses.length === 1;
  const tyreM = sr(SR, "tyreMain"), tyreN = sr(SR, "tyreNose");
  const boomsAbove = wing && booms.length ? booms[0].z > wing.z : null;
  const boomYs = [...new Set(booms.map((b) => Math.abs(b.y).toFixed(2)))].sort((a, b) => a - b).map((y) => `${y} m`);
  const pusherSet = Number(p.cruisePropDiam) > 0;
  const chordSized = sr(SR, "ChordBl"), solSized = sr(SR, "solidityUsed");
  const chordAgrees = chordDrawn != null && chordSized > 0 && Math.abs(chordDrawn / chordSized - 1) <= 0.05;
  const armLen = (a) => Math.hypot(a.x1 - a.x0, a.y - a.y0);
  /* Two rotors whose discs overlap in plan and turn in one plane. */
  const overlap = (() => {
    for (let i = 0; i < rotors.length; i++) for (let j = i + 1; j < rotors.length; j++) {
      const a = rotors[i], b = rotors[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < a.radius + b.radius - 1e-6 && Math.abs(a.z - b.z) < 0.05) return { sep: d, D: a.radius + b.radius, a: a.label, b: b.label, nb: b.blades };
    }
    return null;
  })();
  const rise = rotors.length ? Math.max(...rotors.map((r) => r.z)) - Math.min(...rotors.map((r) => r.z)) : 0;
  const fixedNacelles = nacelles.filter((n) => !n.tilting).length;
  /* geometry.js draws a declared cabin section (only the multicopter has
     one) as an ellipsoid pod, every other body on NASA RAVEN's profile. */
  const pod = Number(p.fusHeight) > 0 && Math.abs(Number(p.fusHeight) - Number(p.fusDiam)) > 1e-9;
  /* Parked blades: where two discs overlap in one plane, the second rotor is
     parked half a blade spacing round, so the drawn blades do not cross. */
  const rotorPhase = new Map(rotors.map((r) => [r.label, 0]));
  if (overlap) rotorPhase.set(overlap.b, Math.PI / Math.max(2, overlap.nb || 2));

  /* The person stands ahead of the nose and clear of every rotor disc. */
  const px = fus.x0 - 1.4;
  let py = fusW / 2 + 1.3;
  while (py < 40 && rotors.some((r) => Math.hypot(px - r.x, py - r.y) < r.radius + 0.6)) py += 0.25;

  const drawnList = ["seats", "the battery box", "motor shapes", ...(nacelles.length ? ["nacelle shapes"] : []), ...(controls.length ? ["control-surface spans"] : []), "windows", "paint"];

  /* Numbers the lab quotes, every one from the geometry or SR_FIELDS. */
  const N = {
    L: m(sr(SR, "fusLen")), W: m(fusW), H: m(fusH),
    D: D ? m(D) : null, tip: `${Number(sr(SR, "TipSpd")).toFixed(0)} m/s`, chord: chordDrawn ? m(chordDrawn) : null,
    Dp: pusherB ? m(2 * pusherB.radius) : null, nbp: pusherB?.blades ?? null,
    occ: occ.toFixed(1), occKg: OCCUPANT_MASS_KG.toFixed(1), xSeats: m(xSeats), xPack: m(xPack),
    ...(wing ? { b: m(sr(SR, "bWing")), S: `${Number(sr(SR, "Swing")).toFixed(2)} m²`, cr: m(sr(SR, "Cr_")), ct: m(sr(SR, "Ct_")),
                 sweep: deg(sr(SR, "sweep"), 1), xLE: m(wing.x - fus.x0), tc: `${Math.round(wing.thickRatio * 100)}%` } : {}),
    ...(vtail ? { bvt: m(sr(SR, "bvt_panel")), gvt: deg(sr(SR, "vtGamma_opt")), crv: m(sr(SR, "Cr_vt")), ctv: m(sr(SR, "Ct_vt")) } : {}),
  };

  const tailRow = () => {
    if (vtail) return { qty: 1, text: `V-tail: two panels of ${N.bvt} at ${N.gvt}` };
    if (fin || stab) return { qty: count("tail"), text: `Tail: ${[fin ? `vertical fin ${m(fin.span)} tall` : null, stab ? `stabilator ${m(stab.span)} span` : null].filter(Boolean).join(", ")}` };
    return { qty: count("tail"), text: "Tail surfaces" };
  };
  const bomRow = (g) => {
    switch (g) {
      case "fuselage": return { qty: 1, text: `Fuselage: ${N.L} long, ${N.W} wide, ${N.H} tall` };
      case "wing": return { qty: 1, text: `Wing: ${N.b} span, ${N.S}` };
      case "controls": return { qty: count("controls"), text: `Control surfaces: ${ctrlText}`, note: "spans drawn" };
      case "tail": return tailRow();
      case "booms": return { qty: count("booms"), text: `Rotor booms, ${m(2 * booms[0].radius)} across` };
      case "pylons": return { qty: count("pylons"), text: "Boom pylons, wing to boom" };
      case "arms": return { qty: count("arms"), text: `Rotor arms, ${m(2 * arms[0].radius)} across${armPylon ? `: ${arms.length} arms and the pylon that carries them` : ""}` };
      case "motors": return { qty: count("motors"), text: "Motors, one under each rotor", note: "shape drawn" };
      case "nacelles": return { qty: count("nacelles"), text: "Nacelles", note: "shape drawn" };
      case "rotors": return { qty: count("rotors"), text: `${RotorWord}${tilting.length && tilting.length < rotors.length ? ` (${tilting.length} tilting, ${rotors.length - tilting.length} lift-only)` : ""}: ${sizeText()}` };
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
      pod
        ? `Its widest section is ${N.W} across and its tallest ${N.H}: an ellipsoid pod, taller than it is wide, the cabin section the multicopter layout declares.`
        : `Its widest section is ${N.W} across and its tallest ${N.H}: a tall, rounded-rectangle section, after NASA's RAVEN.`,
      `The surface is smoothed between the ${fus.stations.length} sized stations and passes through every one; the windows and the paint are drawn.`,
    ],
    cabin: [
      `Fit ${plural(nSeats, "seat")} for the ${N.occ} occupants the cabin check counts at ${N.occKg} kg each, centred ${N.xSeats} from the nose: the sizer's furnishings station.`,
      `Slide the battery pack under the cabin floor, centred ${N.xPack} from the nose: the sizer's assumed pack station.`,
      "The seats and the pack's box are drawn. The pack's mass and energy are not shown: they are under an open audit finding (F-13).",
    ],
    wing: wing ? [
      `Lower the wing onto the top of the fuselage, leading edge ${N.xLE} from the nose.`,
      `Span ${N.b}, area ${N.S}, root chord ${N.cr}, tip chord ${N.ct}, leading-edge sweep ${N.sweep}, thickness ${N.tc} of the chord.`,
      ...(controls.length ? [`Hang ${list(kinds.map((k) => plural(ctrlCount(k), k)))} on the trailing edge. Their spans and chords are NASA RAVEN's proportions: drawn, not sized.`] : []),
    ] : [],
    tail: vtail ? [
      `Fit the V-tail on the tail cone: two panels, each ${N.bvt} along its span, at ${N.gvt} dihedral.`,
      `Root chord ${N.crv}, tip chord ${N.ctv}.`,
    ] : (fin || stab) ? [
      ...(fin ? [`Stand the vertical fin on the tail cone: ${m(fin.span)} tall, root chord ${m(fin.rootChord)}, tip chord ${m(fin.tipChord)}.`] : []),
      ...(stab ? [`Fit the stabilator across the tail: ${m(stab.span)} span, root chord ${m(stab.rootChord)}, tip chord ${m(stab.tipChord)}.${stab.allMoving ? " The whole surface moves, so it has no separate elevator." : ""}`] : []),
    ] : ["Fit the tail surfaces."],
    booms: [
      `Fix the ${plural(count("booms"), "boom")} ${boomsAbove ? "on top of" : "under"} the wing, ${list(boomYs)} either side of the centreline, each ${m(2 * booms[0]?.radius)} across.`,
      ...(count("pylons") ? [`Join each boom to the wing with its pylon (${plural(count("pylons"), "pylon")}).`] : []),
      "Where along the boom each rotor sits is the sizing's rotor station; that number is not shown (open audit finding F-116).",
    ],
    arms: arms.length ? [
      armPylon
        ? `Stand the rotor pylon on the cabin roof, then bolt the ${plural(arms.length, "arm")} to the deck on top of it, ${m(arms[0].z - fus.z)} above the fuselage centreline.`
        : `Bolt the ${plural(arms.length, "arm")} into the cabin structure, one to each side.`,
      `Each arm runs out to its rotor hub: ${list([...new Set(arms.map((a) => m(armLen(a))))])} long, ${m(2 * arms[0].radius)} across.`,
    ] : [],
    motors: [
      ...(nacelles.length ? [fixedNacelles
        ? `Fit the ${plural(nacelles.length, "nacelle")}: ${nacelles.length - fixedNacelles} turn with their rotor, and ${fixedNacelles} stay fixed while the rotor turns on a linkage (${plural(linkages.length, "linkage")}).`
        : `Fit the ${plural(nacelles.length, "nacelle")}: each turns with its rotor.`] : []),
      `Mount ${plural(count("motors"), "motor")}, one under each rotor${booms.length && !nacelles.length ? ", at the rotor stations on the booms" : arms.length ? ", at the end of each arm" : ""}.`,
      `The motor shapes are NASA RAVEN's proportions for a ${N.D} rotor: drawn. Their power, torque and mass are not shown (open audit findings F-25 and F-142).`,
    ],
    rotors: [
      `Fit the ${plural(count("rotors"), rotorWord.replace(/s$/, ""))}: ${sizeText(", or ")} each, tip speed ${N.tip}.`,
      ...(tilting.length ? [`${tilting.length === rotors.length ? "Every rotor tilts" : `The ${tilting.length} tilting rotors tilt`} forward for cruise. Here they point up, as in the hover. How they move between the two is not modelled, so the 3D flight below stops there.`] : []),
      ...(stopped.length ? [`In cruise ${stopped.length === rotors.length ? "all of them stop" : `the ${stopped.length} lift-only rotors stop`}; here they are parked${booms.length ? " along the booms" : ""}.`] : []),
      ...(overlap ? [`The two discs overlap: the hubs are ${m(overlap.sep)} apart for ${m(overlap.D)} rotors, ${(overlap.sep / overlap.D).toFixed(2)} of a diameter. That spacing is measured off a figure of NASA's side-by-side concept (AIAA 2018-3847, Fig. 4), good to a few percent. The blades must be kept in step to pass each other; how is neither modelled nor drawn, so here the second rotor is simply parked half a blade spacing round.`] : []),
      ...(configKey === "multicopter" && rise > 0.05 ? [`The rotors step up towards the tail: the highest hub is ${m(rise)} above the lowest, measured off the side view of NASA's quadrotor (AIAA 2018-3847, Fig. 1), which lifts its aft rotors out of the forward rotors' wake.`] : []),
      chordAgrees
        ? `The blade chord is drawn at ${N.chord}, the sizing's own chord.`
        : `The blade chord is drawn at ${N.chord}, as the other 3D views draw it. The sizing's own blade chord is ${chordSized != null ? m(chordSized) : "—"} (solidity ${solSized != null ? Number(solSized).toFixed(2) : "—"}); the two disagree, and that is reported, not fixed here.`,
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
      "Walk round it: the person beside it is 1.8 m tall.",
      `Everything outside is at the sizing's numbers. The ${list(drawnList)} are drawn.`,
      "Fly it: the same aircraft flies its sized mission in the 3D flight below.",
    ],
  };
  const actions = (stepKey) => ACTIONS[stepKey] ?? [];

  /* The step card's words: the shared ones, changed where this layout differs. */
  const OWN = {
    wing: controls.length ? {} : { heading: "Fit the wing" },
    tail: vtail ? { heading: "Fit the V-tail" } : {},
    booms: count("pylons") ? {} : { heading: "Fit the booms" },
    motors: nacelles.length ? { heading: "Nacelles and motors" } : {},
    rotors: { heading: `Fit the ${rotorWord}`, blurb: `The ${rotorWord} at the sized diameter and blade count.` },
    gear: { blurb: `${tricycle ? "Tricycle gear, at" : "The legs and"} the tyre sizes the gear model picked. With the gear on, the stands come away.` },
  };
  const stepText = (stepKey) => ({ ...STEP_TEXT[stepKey], ...(OWN[stepKey] ?? {}) });
  const groupLabel = (g) => ({ rotors: RotorWord, motors: rotorWord === "lift rotors" ? "Lift motors" : "Motors", tail: vtail ? "V-tail" : "Tail", controls: kinds.length ? (([s]) => s[0].toUpperCase() + s.slice(1))([list(kinds.map((k) => `${k}s`)).replace(/ and ([^ ]+)$/, " & $1")]) : "Control surfaces" }[g] ?? GROUPS[g]?.label ?? g);

  const FACTS = {
    fuselage: { title: "Fuselage", scale: "To scale: the length and every sized station. Drawn: the smoothing between stations, the windows, the doors and the paint.",
                rows: [["Length", N.L], ["Widest", N.W], ["Tallest", N.H], ["Sized stations", String(fus.stations.length)]] },
    wing: wing ? { title: "Wing", scale: "To scale: the planform and the thickness ratio. Drawn: the section (a symmetric four-digit NACA shape).",
            rows: [["Span", N.b], ["Area", N.S], ["Root chord", N.cr], ["Tip chord", N.ct], ["Leading-edge sweep", N.sweep], ["Thickness", N.tc]] } : null,
    controls: controls.length ? { title: groupLabel("controls"), scale: "Drawn: their spans and chords are NASA RAVEN's proportions (geometry.js). Not sized.",
                rows: kinds.map((k) => { const c = controls.find((x) => x.ctrlKind === k); return [`${k[0].toUpperCase()}${k.slice(1)}s`, `${ctrlCount(k)}${c?.chordFrac ? `, ${Math.round(c.chordFrac * 100)}% of the chord` : ""}`]; }) } : null,
    tail: { title: groupLabel("tail"), scale: "To scale: the spans, chords and angles. Drawn: the section.",
            rows: vtail ? [["Panel span", N.bvt], ["Dihedral", N.gvt], ["Root chord", N.crv], ["Tip chord", N.ctv]]
              : [...(fin ? [["Fin height", m(fin.span)], ["Fin root chord", m(fin.rootChord)], ["Fin tip chord", m(fin.tipChord)]] : []),
                 ...(stab ? [["Stabilator span", m(stab.span)], ["Stabilator root chord", m(stab.rootChord)], ["Stabilator tip chord", m(stab.tipChord)]] : [])] },
    booms: booms.length ? { title: "Booms", scale: "To scale: where they sit across the wing and their diameter. Drawn: nothing.",
             rows: [["Booms", String(count("booms"))], ["From the centreline", list(boomYs)], ["Diameter", m(2 * booms[0].radius)]] } : null,
    pylons: { title: "Boom pylons", scale: "To scale: as the geometry places them.", rows: [["Pylons", String(count("pylons"))]] },
    arms: arms.length ? { title: "Rotor arms", scale: `To scale: as the geometry runs them, from ${armPylon ? "the pylon deck" : "the cabin"} to each rotor hub.`,
             rows: [["Arms", String(arms.length)], ["Length", list([...new Set(arms.map((a) => m(armLen(a))))])], ["Diameter", m(2 * arms[0].radius)], ...(armPylon ? [["Pylon", "carries the arm deck"]] : [])] } : null,
    motors: { title: "Motors", scale: "Drawn: NASA RAVEN's motor proportions, scaled to the rotor diameter. Power, torque and mass are not shown (F-25, F-142).",
              rows: [["Motors", String(count("motors"))], ["For a rotor of", N.D]] },
    nacelles: nacelles.length ? { title: "Nacelles", scale: "Drawn: NASA RAVEN SWFT's nacelle profile, scaled to the rotor.",
              rows: [["Nacelles", String(nacelles.length)], ["Turn with the rotor", String(nacelles.length - fixedNacelles)], ["Fixed", String(fixedNacelles)]] } : null,
    rotors: { title: RotorWord, scale: "To scale: the diameter and the blade count. Drawn: the blade planform, twist and section.",
              rows: [["Rotors", String(count("rotors"))], ["Diameter", sizes.map((r) => m(2 * r.radius)).join(", ")], ["Blades", sizes.map((r) => String(r.blades)).join(", ")], ["Tip speed", N.tip],
                     ["Blade chord drawn", N.chord], ["Blade chord sized", chordSized != null ? m(chordSized) : "—"], ["Tilting", String(tilting.length)], ["Stop in cruise", String(stopped.length)]] },
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
    ["Layout", layout], ["Fuselage length", N.L],
    ...(wing ? [["Wing span", N.b], ["Wing area", N.S], ["Aspect ratio", Number(p.AR).toFixed(1)]] : []),
    [RotorWord, `${count("rotors")} × ${sizes.map((r) => m(2 * r.radius)).join(" / ")}`], ["Blades", sizes.map((r) => String(r.blades)).join(" / ")], ["Tip speed", N.tip],
    ["Cruise speed", `${Number(p.vCruise).toFixed(1)} m/s`], ["Payload", `${Number(p.payload).toFixed(0)} kg`], ["Occupants", N.occ],
  ];

  return {
    ready: true, configKey, layout, geo, zGround, items, steps, present, stands, bom, needs, actions, stepText, groupLabel, facts, spec,
    seats, pack, nSeats, occupants: occ, fuselage: fus, wing, rotorPhase, pod, boomsAbove,
    person: { x: px, y: py, heightM: 1.8 },
    notes: [
      `Drawn, not sized: ${drawnList.join(", ")}, stands, the person.`,
      ...(pusherB && !pusherSet ? ["Pusher drawn at 0.72 × the rotor diameter (no size set)."] : []),
      ...(tilting.length ? ["Tilting rotors drawn in the hover position."] : []),
    ],
  };
}
