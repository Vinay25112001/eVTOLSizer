/* =====================================================================
   FLIGHT VIEW — what the 3D mission view may show, as data
   =====================================================================
   The 3D view in the OpenVSP tab flies the SIZED aircraft along the
   SIZED mission. This module decides every number it shows and every
   choice it draws, so the decisions can be held by a gate in Node; the
   scene (flight-scene.js, three.js) only draws what it is handed.

   WHERE EACH THING COMES FROM
     position, altitude, speed, power   missionPathAt (engine/mission-path.js),
                                        itself the converged result — never
                                        recomputed here
     the aircraft                       aircraftGeometry + buildMesh, the same
                                        faces the 3D layout view and the
                                        .vsp3 export are built from
     which rotors turn, and the         the configuration's own flags on each
     nacelle angle                      rotor body (tilting, stopped), drawn at
                                        the two ends of the convention only

   WHAT IT DOES NOT DO
     No attitude: nothing computes one, so the aircraft is level always.
     No transition: between the vertical and the forward phases the
     sizing STEPS speed and power, and the view stops there and says so
     (transitionsOf) instead of drawing a conversion.
     Power in the vertical phases is Phov, a rotor SHAFT power (audit
     finding F-13); every other phase's is electrical. The readout says
     which, every time.
   ===================================================================== */
import { buildMesh, PALETTE } from "../../engine/mesh.js";
import { missionPathAt, PHASES, PHASE_LABEL } from "../../engine/mission-path.js";

/* RAVEN's convention, which mesh.js states: 90 = helicopter, 0 = airplane. */
export const NACELLE_HELICOPTER_DEG = 90;
export const NACELLE_AIRPLANE_DEG = 0;

const VERTICAL = new Set(["TO", "Land"]);
const FORWARD = new Set(["Climb", "Cruise", "Desc"]);

/* "vertical", "forward" or "ground" (the reserve, which is not flown). */
export function modeOf(phase, flown = true) {
  if (!flown) return "ground";
  if (VERTICAL.has(phase)) return "vertical";
  if (FORWARD.has(phase)) return "forward";
  return "ground";
}

/* The nacelle angle is drawn at an ENDPOINT of the convention, never in
   between: helicopter mode while the sizing hovers, airplane mode while it
   flies forward. The angle in between is the transition, which nothing in
   the tool computes. On the ground (the reserve) it stays as it landed. */
export const nacelleTiltFor = (mode) => (mode === "forward" ? NACELLE_AIRPLANE_DEG : NACELLE_HELICOPTER_DEG);

/* What kind of power the readout carries. */
export function powerKind(phase) {
  if (VERTICAL.has(phase)) return "shaft";
  return "electrical";
}

/* Does a rotor turn in this mode? Read from the configuration's flags:
   a rotor marked `stopped` stops in forward flight; a cruise pusher turns
   in forward flight only; nothing turns on the ground. */
export function rotorTurns(rotor, mode) {
  if (mode === "ground") return false;
  if (rotor.kind === "pusher") return mode === "forward";
  if (rotor.stopped) return mode === "vertical";
  return true;
}

/* When the view refuses to fly, and what it says instead. A cruise run
   below zero is not a short cruise: the climbs and descents (one pair per
   hop) and the reserve take more than the total range the engine is given
   (engine.js, CruiseRange; the app passes mission + reserve). The sizing's
   own "Cruise range > 0 km" check fails, and the path would run backwards
   across the boundary. Drawing it would be drawing a mission that does
   not exist, so the view quotes the check instead. */
export function flightRefusal(r) {
  if (!Array.isArray(r?.tPhases) || r.tPhases.length < 7)
    return { kind: "no-path", text: "This result has no mission profile to fly, so nothing is drawn." };
  if (r.r2Converged !== true)
    return { kind: "not-converged", text: "The sizing has not converged, so there is no sized aircraft or mission to fly. The 3D flight is drawn only from a converged result." };
  const neg = [["climb", r.climbRunM], ["cruise", r.cruiseRunM], ["descent", r.descentRunM]].filter(([, v]) => Number(v) < 0);
  if (neg.length) {
    const chk = (r.checks || []).find((c) => /^Cruise range > 0/.test(c?.label || ""));
    const runs = neg.map(([n, v]) => `the ${n} run is ${(v / 1000).toFixed(1)} km`).join(" and ");
    return {
      kind: "negative-run",
      text: `This mission has no cruise to fly: ${runs}, because its climbs and descents and the reserve take more than the total range.`
        + (chk ? ` The sizing's own check "${chk.label}" fails (${chk.val}).` : "")
        + " Drawn, the path would run backwards, so it is not drawn. Lengthen the mission range to fly it.",
    };
  }
  return null;
}

/* One frame of the view, at mission time t. Every number is missionPathAt's. */
export function flightFrame(r, p, t) {
  const now = missionPathAt(r, p, t);
  if (!now) return null;
  const mode = modeOf(now.phase, now.flown);
  return { ...now, mode, nacelleTiltDeg: nacelleTiltFor(mode), powerKind: powerKind(now.phase) };
}

/* The boundaries where the sizing steps between hovering and forward
   flight: take-off to climb, and descent to landing. Each carries the
   speed and power on either side, as missionPathAt reports them, so the
   view can show the step it refuses to draw. */
export function transitionsOf(r, p) {
  const tp = r?.tPhases;
  if (!Array.isArray(tp) || tp.length < 7) return [];
  const out = [];
  for (let j = 1; j < 6; j++) {
    const from = PHASES[j - 1], to = PHASES[j];
    const a = modeOf(from), b = modeOf(to, to !== "Res");
    if (!((a === "vertical" && b === "forward") || (a === "forward" && b === "vertical"))) continue;
    const before = missionPathAt(r, p, Math.max(0, tp[j] - 1e-6));
    const after = missionPathAt(r, p, tp[j]);
    out.push({
      t: tp[j], from, to, label: `${PHASE_LABEL[from]} → ${PHASE_LABEL[to]}`,
      before: { phase: before.phase, speedMS: before.speedMS, powerKW: before.powerKW, powerKind: powerKind(before.phase) },
      after: { phase: after.phase, speedMS: after.speedMS, powerKW: after.powerKW, powerKind: powerKind(after.phase) },
    });
  }
  return out;
}

/* Does the aircraft convert at all? One with a wing and tilting or stopped
   rotors changes how it is carried at the step; a multicopter only
   changes speed and power there. */
export function convertsAtTransition(geo) {
  const bodies = geo?.bodies || [];
  return bodies.some((b) => b.kind === "wing") && bodies.some((b) => (b.kind === "rotor" && (b.tilting || b.stopped)) || b.kind === "pusher");
}

/* What the geometry says changes at a transition, counted from the same
   rotor flags the drawing uses, so the sentence and the picture agree. */
export function conversionOf(geo) {
  const bodies = geo?.bodies || [];
  const rotors = bodies.filter((b) => b.kind === "rotor");
  return {
    tilting: rotors.filter((b) => b.tilting).length,
    stopped: rotors.filter((b) => b.stopped).length,
    pushers: bodies.filter((b) => b.kind === "pusher").length,
    rotors: rotors.length,
    wing: bodies.some((b) => b.kind === "wing"),
  };
}

export function conversionSentence(c, toForward) {
  if (!c.wing || (!c.tilting && !c.stopped && !c.pushers))
    return "This layout does not convert: its rotors carry it throughout, so only the speed and the power step here.";
  const parts = [];
  if (c.tilting) parts.push(toForward
    ? `${c.tilting} rotor${c.tilting === 1 ? "" : "s"} drawn going from helicopter mode to airplane mode`
    : `${c.tilting} rotor${c.tilting === 1 ? "" : "s"} drawn going from airplane mode back to helicopter mode`);
  if (c.stopped) parts.push(toForward
    ? `${c.stopped} lift rotor${c.stopped === 1 ? "" : "s"} drawn stopping`
    : `${c.stopped} lift rotor${c.stopped === 1 ? "" : "s"} drawn starting`);
  if (c.pushers) parts.push(toForward ? "the cruise propeller drawn starting" : "the cruise propeller drawn stopping");
  return `Across this step: ${parts.join("; ")}. Each is drawn at the two ends of its travel only.`;
}

/* ── The aircraft, split into the airframe and the parts that turn ───
   buildMesh draws a whole aircraft. To turn a rotor, its faces have to be
   a group of their own, so each rotor (and pusher) is meshed alone with
   the same call, and its faces are taken out of the whole. The gate holds
   the split to EXACT: the airframe and the rotors together are buildMesh's
   faces, no more and no fewer. */
const faceKey = (f) => `${f.colour.join(",")}|${f.v.map((q) => q.join(",")).join(";")}`;

function newellNormal(v) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < v.length; i++) {
    const [ax, ay, az] = v[i], [bx, by, bz] = v[(i + 1) % v.length];
    x += (ay - by) * (az + bz); y += (az - bz) * (ax + bx); z += (ax - bx) * (ay + by);
  }
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

export const DISC_COLOURS = Object.freeze([PALETTE.diskTilt, PALETTE.diskLift, PALETTE.diskPush].map((c) => c.join(",")));

export function airframeParts(geo, nacelleTiltDeg) {
  const all = buildMesh(geo, PALETTE, { nacelleTiltDeg });
  const spinners = (geo?.bodies || []).filter((b) => b.kind === "rotor" || b.kind === "pusher");
  const taken = new Map();
  const rotors = spinners.map((b) => {
    const faces = buildMesh({ ...geo, bodies: [b] }, PALETTE, { nacelleTiltDeg });
    for (const f of faces) { const k = faceKey(f); taken.set(k, (taken.get(k) || 0) + 1); }
    /* The blades and the disc annulus are symmetric about the hub, so the
       mean of their vertices IS the hub; the blade plane's normal is the
       axis they turn about. */
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const f of faces) for (const [x, y, z] of f.v) { sx += x; sy += y; sz += z; n++; }
    const blade = faces.find((f) => !DISC_COLOURS.includes(f.colour.join(",")) && f.v.length === 4) ?? faces[0];
    return {
      label: b.label ?? b.kind, kind: b.kind, tilting: !!b.tilting, stopped: !!b.stopped,
      faces, centre: [sx / n, sy / n, sz / n], axis: newellNormal(blade.v),
    };
  });
  const airframe = [];
  for (const f of all) {
    const k = faceKey(f), left = taken.get(k) || 0;
    if (left > 0) taken.set(k, left - 1); else airframe.push(f);
  }
  const unmatched = [...taken.values()].reduce((s, x) => s + x, 0);
  return { airframe, rotors, totalFaces: all.length, unmatched };
}

/* The box the aircraft occupies in geometry axes (+x aft, +y right, +z up),
   at the helicopter-mode endpoint, so the aircraft sits on the ground at
   take-off and does not jump when its nacelles step. */
export function boundsOf(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const faces = [...parts.airframe, ...parts.rotors.flatMap((r) => r.faces)];
  for (const f of faces) for (const q of f.v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  return { lo, hi, spanM: hi[1] - lo[1], lengthM: hi[0] - lo[0] };
}
