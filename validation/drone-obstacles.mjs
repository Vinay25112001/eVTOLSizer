/* =====================================================================
   OBSTACLES — the geometry of a strike, and the limit of the claim
   =====================================================================
   Contact is the one part of an impact this tool can state exactly, so
   this gate checks that it IS exact, and that nothing beyond it is
   claimed.

   WHY A SIGNED DISTANCE AND A BISECTION, rather than "is the centre
   inside the box". Two reasons, both checked below. The trace is sampled
   every 20 ms, so at 10 m/s the aircraft moves 200 mm between samples: a
   per-sample boolean test reports a strike up to a fifth of a metre late
   and can miss a thin wall entirely. And a multirotor hits things with
   its PROPELLER TIPS, so the envelope is spanM/2 — testing the centre
   reports a clean pass for a flight that took the blades off.

   WHAT IS NOT MODELLED, asserted here so it cannot quietly appear later:
   a strike ENDS the flight. There is no bounce, no tumble, no broken
   arm, because `structureMassKg` is a declared scalar with no material
   or geometry, nothing in the component survey publishes a propeller's
   impact strength, and no source here gives a restitution coefficient
   against concrete or foliage. This matches what `simulate()` already
   does at the ground: it breaks the integration on the zero crossing and
   reports `crashed`, rather than modelling the landing.
   ===================================================================== */
import {
  makeBox, makeTree, signedDistance, firstContact, DEFAULT_SCENE, OBSTACLE_KINDS,
  contactNormal, reflectVelocity, DECLARED_IMPACT_INPUTS,
} from "../src/classes/drone/obstacles.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("DRONE OBSTACLE GATE");
console.log("=".repeat(78));

/* ── 1. THE SIGNED DISTANCE IS A DISTANCE ────────────────────────────
   Not a flag. Every value below is a length someone can measure off the
   scene, which is what makes the bisection meaningful. */
console.log("\n-- a box's signed distance is the distance to its surface --");
const b = makeBox({ name: "b", x: 10, y: 0, wx: 4, wy: 4, h: 6 });

check(near(signedDistance(b, 8, 0, 3), 0, 1e-12),
  "zero exactly on the face", "face at x = 8 for a 4 m box centred on 10");
check(near(signedDistance(b, 6, 0, 3), 2, 1e-12),
  "positive outside, equal to the gap", "2 m clear of the face");
check(near(signedDistance(b, 10, 0, 3), -2, 1e-12),
  "NEGATIVE inside, equal to the depth", "centre of a 4 m box is 2 m from every wall");
check(near(signedDistance(b, 10, 0, 10), 4, 1e-12),
  "measured from the roof when above it", "roof at 6 m, point at 10 m");
check(near(signedDistance(b, 15, 4, 3), Math.hypot(3, 2), 1e-12),
  "diagonal past a corner is the true corner distance",
  `dx 3, dy 2 -> ${Math.hypot(3, 2).toFixed(4)} m, not the larger of the two`);

console.log("\n-- a tree is the union of trunk and canopy --");
const t = makeTree({ name: "t", x: 0, y: 0, trunkR: 0.5, canopyR: 2, h: 10 });
check(near(signedDistance(t, 0, 0, 8), -2, 1e-12),
  "inside the canopy is negative by its depth", "canopy centred at h - canopyR = 8 m");
check(near(signedDistance(t, 3, 0, 8), 1, 1e-12),
  "outside the canopy is the gap to its surface", "3 m out, canopy radius 2 m");
check(near(signedDistance(t, 1.5, 0, 2), 1, 1e-12),
  "low down it is the TRUNK that is near, not the canopy",
  "a union takes the min of its parts, so the trunk governs below the crown");

/* ── 2. CONTACT IS FOUND AT THE ENVELOPE, AND EXACTLY ────────────────── */
console.log("\n-- the strike is placed exactly, at the rotor envelope --");
const ENV = 0.45;                                  // rotor envelope radius, m
const sweep = (y, alt, x0 = 0, v = 10, n = 400) =>
  Array.from({ length: n + 1 }, (_, k) => {
    const tt = k * 0.02;
    return { t: tt, x: x0 + tt * v, y, altitudeM: alt, vx: v, vy: 0, vz: 0 };
  });

const hangar = DEFAULT_SCENE.find((o) => o.name === "hangar");
const faceX = hangar.x - hangar.wx / 2;
const hit = firstContact(sweep(hangar.y, 4), DEFAULT_SCENE, ENV);
check(!!hit && hit.name === "hangar", "a flight into the hangar reports the hangar by name",
  hit ? `struck "${hit.name}"` : "no contact found");
check(!!hit && near(hit.x, faceX - ENV, 1e-3),
  "contact is at the face MINUS the envelope, not at the face",
  hit ? `x = ${hit.x.toFixed(4)} m against face ${faceX} - ${ENV} = ${(faceX - ENV).toFixed(4)}`
      : "no contact");
check(!!hit && near(hit.speedMps, 10, 1e-6),
  "the reported speed is the speed at contact", hit ? `${hit.speedMps.toFixed(3)} m/s` : "-");

/* THE SAMPLING TEST. A per-sample boolean would report the strike at the
   next 20 ms sample, which at 10 m/s is 200 mm late. Bisection has to do
   better than the sample spacing or it is not earning its place. */
const sampleTravelM = 10 * 0.02;
check(!!hit && Math.abs(hit.x - (faceX - ENV)) < sampleTravelM / 20,
  "and is far finer than the 20 ms sample spacing",
  `error ${Math.abs(hit.x - (faceX - ENV)).toExponential(2)} m against `
  + `${sampleTravelM} m travelled per sample`);

console.log("\n-- height decides it, as it must --");
const wall = DEFAULT_SCENE.find((o) => o.name === "low wall");
const over = firstContact(sweep(0, 6, -30), DEFAULT_SCENE, ENV);
const into = firstContact(sweep(0, 1.5, -30), DEFAULT_SCENE, ENV);
check(over === null || over.name !== "low wall",
  `a pass at 6 m clears the ${wall.h} m wall`,
  over ? `first contact was "${over.name}" instead` : "nothing struck");
check(!!into && into.name === "low wall",
  "the same track at 1.5 m strikes it", into ? `at x = ${into.x.toFixed(3)} m` : "missed");

console.log("\n-- the envelope is the propeller tips, not the hub --");
const grazeY = wall.y + wall.wy / 2 + 0.2;          // 200 mm outside the wall's side
const hub = firstContact(sweep(grazeY, 1.5, -30), DEFAULT_SCENE, 0);
const tips = firstContact(sweep(grazeY, 1.5, -30), DEFAULT_SCENE, ENV);
check(hub === null && !!tips,
  "a graze the HUB clears is still a strike for the DISC",
  `200 mm outside the wall: centre-point test says clear, ${ENV} m envelope says `
  + `${tips ? `struck "${tips.name}"` : "clear"} — this is the blades-off case`);

console.log("\n-- an unobstructed hover never reports a strike --");
const hover = Array.from({ length: 401 }, (_, k) =>
  ({ t: k * 0.02, x: 0, y: 0, altitudeM: 3, vx: 0, vy: 0, vz: 0 }));
check(firstContact(hover, DEFAULT_SCENE, ENV) === null,
  "no spurious contact when nothing is near");
check(firstContact(hover, [], ENV) === null, "and none at all with an empty scene");

/* ── 3. THE RESPONSE IS FALSIFIABLE EVEN THOUGH ITS CONSTANTS ARE NOT ──
   Restitution, scrub and the blade-break speed are DECLARED: nothing in
   this project sources them. What can still be checked is that the
   response obeys the physics it claims to, and these are the checks that
   make a declared coefficient defensible rather than decorative. */
console.log("\n-- the impact response obeys its own physics --");

const n = [-1, 0, 0];                        // a wall face, aircraft flying +x
const vIn = [10, 0, 0];

const stopped = reflectVelocity(vIn, n, { restitution: 0, scrub: 1 });
check(near(stopped[0], 0, 1e-12),
  "e = 0 removes the normal velocity EXACTLY", `${stopped[0].toFixed(12)} m/s`);

const perfect = reflectVelocity(vIn, n, { restitution: 1, scrub: 1 });
check(near(perfect[0], -10, 1e-12),
  "e = 1 reverses it EXACTLY, and no more", `${perfect[0].toFixed(12)} m/s`);

let grew = null;
for (const e of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
  const out = reflectVelocity(vIn, n, { restitution: e, scrub: 1 });
  if (Math.hypot(...out) > Math.hypot(...vIn) + 1e-12) grew = e;
}
check(grew === null, "no restitution in [0,1] increases speed -- energy is never created",
  grew === null ? "checked e = 0, 0.1, 0.25, 0.5, 0.9, 1" : `e = ${grew} created energy`);

const sep = reflectVelocity([-5, 0, 0], n, { restitution: 1, scrub: 1 });
check(near(sep[0], -5, 1e-12),
  "a SEPARATING contact is left alone, not reflected again",
  "reflecting it would inject energy and pin the aircraft to the surface");

/* An APPROACHING velocity, because scrub applies at an impact. A purely
   tangential velocity is not an impact at all - it is a slide - and the
   function correctly leaves it alone; scrubbing it here would be sliding
   friction, which is a force over time and is not modelled. */
const scrubbed = reflectVelocity([10, 6, 0], n, { restitution: 0.5, scrub: 0.25 });
check(near(scrubbed[1], 1.5, 1e-12) && near(scrubbed[0], -5, 1e-12),
  "at an impact the tangential part is scrubbed while the normal part reflects",
  `along the wall 6 x 0.25 = ${scrubbed[1]}, into it 10 x 0.5 -> ${scrubbed[0]} m/s`);
check(near(reflectVelocity([0, 6, 0], n, { restitution: 0.5, scrub: 0.25 })[1], 6, 1e-12),
  "a pure SLIDE is untouched -- sliding friction is a force over time, not an impulse",
  "scrubbing it per step would erase the velocity in milliseconds");

console.log("\n-- the surface normal is a unit vector everywhere --");
const probes = [
  ["-x face", [8, 0, 3], [-1, 0, 0]],
  ["roof", [10, 0, 6], [0, 0, 1]],
  ["vertical corner", [8, -2, 3], [-Math.SQRT1_2, -Math.SQRT1_2, 0]],
];
for (const [what, at, want] of probes) {
  const nn = contactNormal(b, ...at);
  check(near(Math.hypot(...nn), 1, 1e-6) && nn.every((c, i) => near(c, want[i], 1e-3)),
    `unit and correct on the ${what}`,
    `[${nn.map((c) => c.toFixed(4)).join(", ")}]`);
}
const tn = contactNormal(t, 3, 0, 8);
check(near(Math.hypot(...tn), 1, 1e-6),
  "and on a tree canopy, where an analytic normal must pick a branch",
  `|n| = ${Math.hypot(...tn).toFixed(9)}`);

console.log("\n-- the coefficients are declared, and say so --");
for (const [k, v] of Object.entries(DECLARED_IMPACT_INPUTS)) {
  check(v.status === "declared" && typeof v.why === "string" && v.why.length > 40,
    `${k} is marked declared and states why it cannot be sourced`,
    `${v.value} ${v.unit} — ${v.why.slice(0, 68)}...`);
}

check(OBSTACLE_KINDS.every((k) => DEFAULT_SCENE.some((o) => o.kind === k)),
  "the default scene exercises every obstacle kind", OBSTACLE_KINDS.join(", "));
check(DEFAULT_SCENE.every((o) => o.name && o.h > 0),
  "every object is named and has a real height, so a strike names something "
  + "a person recognises");

console.log("");
console.log(fails.length ? `DRONE OBSTACLE GATE FAILED: ${fails.length} check(s)`
                         : `DRONE OBSTACLE GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
