/* ═══════════════════════════════════════════════════════════════════════
   DRONE PLAYBACK GATE — the aircraft was not wobbling, the animation was
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT THIS EXISTS FOR. The flight view looked like the aircraft was
   rolling unevenly and wiggling rather than flying steadily. Every physics
   gate passed, because the physics was never wrong: a commanded-level
   hover is steady to 0.0000 deg peak to peak with 0.000000 N of thrust
   spread and zero drift (check 1 below measures it).

   The judder was in FlightPanel's playback loop. It advanced WHOLE trace
   samples and drew `trace[i]` raw. Under 240 s the trace is 50 Hz; a
   display is typically 60 Hz; 50 and 60 do not divide. Replaying that
   loop at 60 Hz and counting samples advanced per frame gives

       1x    0 1 1 1 1 0 1 1 1 1 1 0 1 1 1 1 1 0 ...

   one frozen frame in every six, for ever. It reads worst in ROLL because
   attitude moves most per sample, and a flight past 240 s decimates
   toward 5 Hz where a frame advances only once in twelve.

   NOTHING THAT CHECKS THE TRAJECTORY CAN CATCH THIS. The trajectory was
   correct at every sample. The defect lived between the samples, in how
   they were drawn.

   WHAT THIS GATE DOES
     1. The physics really is steady, so a future wobble means a real
        regression rather than this one coming back.
     2. The un-interpolated cadence IS uneven — the measurement that
        justified the fix, kept so the reasoning stays checkable.
     3. Interpolation makes the drawn pose continuous, and the drawn pose
        always lies ON the segment between two computed states.
     4. Angles take the shortest path, so a yaw wrap cannot spin the
        aircraft the long way round.
     5. The split holds in the source: NUMBERS read the sample, GEOMETRY
        reads the interpolated pose.
     6. The file no longer claims every frame is a computed state, because
        that claim is now false.
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel, simulate, makeScenario } from "../src/classes/drone/dynamics.js";
import { buildAirframe } from "../src/classes/drone/geometry3d.js";
import { sizeDrone } from "../src/classes/drone/sizing.js";
import { assemblePack } from "../src/classes/drone/battery.js";
import { FRAMES } from "../src/data/drone-frames.js";
import { findPropeller } from "../src/data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../src/data/drone-components.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = readFileSync(join(ROOT, "src/classes/drone/FlightPanel.jsx"), "utf8");

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}\n        ${detail}`);
  if (!ok) fails++;
};
const bar = "═".repeat(76);
console.log(bar);
console.log("DRONE PLAYBACK GATE — the aircraft was not wobbling, the animation was");
console.log(bar);

const DD = { motorTimeConstantS: 0.05, bodyDragCoefficient: 1.0 };
const pack = assemblePack(BATTERIES.find((b) => b.id === "molicel-inr21700-p42a"),
  { series: 6, parallel: 3, overheadFraction: 0.15 });
const prop = findPropeller("apce_14x7_static_1006od");
function modelFor(frameClass, frameType) {
  const frame = FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType);
  const sizing = sizeDrone({
    mission: { payloadKg: 0.5, hoverEnduranceMin: 15 },
    selection: {
      rotors: frame.motors.length, propeller: prop, propellerMassG: 45,
      motor: MODELLABLE_MOTORS.find((m) => m.model === "KDE4213XF-360"),
      esc: ESCS.find((e) => e.model.includes("ALPHA 60A")),
      battery: pack, packVoltageV: pack.voltagePrintedV, packCells: 6,
    },
    declared: { structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
                avionicsPowerW: 8, thrustToWeightRequired: 2.0 },
  });
  const airframe = buildAirframe({ frame, propellerDiameterM: prop.diameterM, tipGapFraction: 0.10 });
  return buildModel({ sizing, airframe, declared: DD });
}

/* ── 1. THE PHYSICS IS STEADY ────────────────────────────────────────── */
console.log("\n1. A COMMANDED-LEVEL HOVER DOES NOT WOBBLE");
for (const [fc, ft] of [["QUAD", "X"], ["HEXA", "X"]]) {
  const model = modelFor(fc, ft);
  const scenario = makeScenario({
    label: "level hover", startAltitudeM: 5,
    segments: [{ durationS: 30, rollDeg: 0, pitchDeg: 0, yawDeg: 0 }],
  });
  const tr = simulate({ model, scenario, declared: DD, durationS: 30, dt: 0.002 }).trace;
  const pp = (sel) => { const a = tr.map(sel); return Math.max(...a) - Math.min(...a); };
  const rollPP = pp((s) => s.rollDeg), pitchPP = pp((s) => s.pitchDeg);
  const spread = Math.max(...tr.map((s) => Math.max(...s.thrusts) - Math.min(...s.thrusts)));
  const drift = Math.hypot(tr.at(-1).x, tr.at(-1).y);
  check(rollPP < 1e-6 && pitchPP < 1e-6 && spread < 1e-6 && drift < 1e-6,
    `${fc}/${ft} holds attitude, thrust and position exactly`,
    `roll p-p ${rollPP.toExponential(2)} deg, pitch p-p ${pitchPP.toExponential(2)} deg, `
      + `thrust spread ${spread.toExponential(2)} N, drift ${drift.toExponential(2)} m`);
}

/* ── 2. THE CADENCE THAT CAUSED IT ───────────────────────────────────── */
console.log("\n2. WHOLE-SAMPLE PLAYBACK IS UNEVEN — the measurement behind the fix");
{
  /* FlightPanel's loop, exactly: acc += dt*speed; while (acc >= sampleDt)
     advance one sample. Counting advances per frame is the judder. */
  const cadence = (sampleDt, speed, frames, hz = 60) => {
    let acc = 0; const out = [];
    for (let f = 0; f < frames; f++) {
      acc += (1 / hz) * speed;
      let n = 0;
      while (acc >= sampleDt) { acc -= sampleDt; n++; }
      out.push(n);
    }
    return out;
  };
  for (const [label, dt, sp] of [
    ["50 Hz trace at 1x", 0.02, 1],
    ["50 Hz trace at 2x", 0.02, 2],
    ["5 Hz trace (long flight) at 1x", 0.2, 1],
  ]) {
    const a = cadence(dt, sp, 60);
    const uniq = [...new Set(a)];
    check(uniq.length > 1,
      `${label} advances unevenly without interpolation`,
      `advances per frame: {${uniq.sort().join(",")}} over 60 frames — `
        + `pattern ${a.slice(0, 18).join("")}…`);
  }
  /* And the fix: the remainder is always a proper fraction of a sample,
     so no frame is ever left with nothing to show. */
  const fracs = [];
  let acc = 0;
  for (let f = 0; f < 600; f++) {
    acc += 1 / 60;
    while (acc >= 0.02) acc -= 0.02;
    fracs.push(acc / 0.02);
  }
  /* PRINTED AT FULL PRECISION ON PURPOSE. At 4 dp the maximum rounds to
     "1.0000", which reads as a violation of the [0,1) this check asserts.
     It is not — the while loop leaves acc strictly below sampleDt — but a
     detail line that looks like it contradicts its own verdict is worse
     than no detail. It also shows why the panel clamps f with
     Math.min(1, ...): the ratio can land one ulp under 1. */
  const fMax = Math.max(...fracs), fMin = Math.min(...fracs);
  check(fracs.every((x) => x >= 0 && x < 1),
    "the carried remainder is always in [0,1), so every frame has a pose",
    `600 frames, min ${fMin.toPrecision(17)}, max ${fMax.toPrecision(17)} (< 1)`);
}

/* ── 3 & 4. THE INTERPOLATION ITSELF ─────────────────────────────────── */
console.log("\n3. THE DRAWN POSE LIES BETWEEN TWO COMPUTED STATES, NEVER OUTSIDE");
{
  /* Transcribed from FlightPanel; check 5 pins that the panel still uses
     this shape, so the transcription cannot drift unnoticed. */
  const lerp = (a, b, f) => a + (b - a) * f;
  const lerpAngleDeg = (a, b, f) => {
    let d = b - a;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return a + d * f;
  };
  const model = modelFor("QUAD", "X");
  const scenario = makeScenario({
    label: "roll pulse", startAltitudeM: 10,
    segments: [{ durationS: 2, rollDeg: 0 }, { durationS: 2, rollDeg: 15 },
               { durationS: 4, rollDeg: 0 }],
  });
  const tr = simulate({ model, scenario, declared: DD, durationS: 8, dt: 0.002 }).trace;

  let outside = 0, maxJump = 0, prev = null;
  for (let i = 0; i < tr.length - 1; i++) {
    const a = tr[i], b = tr[i + 1];
    for (let k = 0; k < 6; k++) {
      const f = k / 6;
      const x = lerp(a.x, b.x, f), roll = lerpAngleDeg(a.rollDeg, b.rollDeg, f);
      if (x < Math.min(a.x, b.x) - 1e-9 || x > Math.max(a.x, b.x) + 1e-9) outside++;
      if (roll < Math.min(a.rollDeg, b.rollDeg) - 1e-9
          || roll > Math.max(a.rollDeg, b.rollDeg) + 1e-9) outside++;
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(roll - prev));
      prev = roll;
    }
  }
  check(outside === 0,
    "no interpolated pose falls outside the segment joining its two samples",
    `${(tr.length - 1) * 6} interpolated poses across a 15 deg roll pulse, ${outside} outside`);

  /* Un-interpolated, the same flight steps by whole samples. The largest
     per-FRAME change is what the eye reads as a jerk. */
  const rawJump = Math.max(...tr.slice(1).map((s, i) => Math.abs(s.rollDeg - tr[i].rollDeg)));
  check(maxJump < rawJump,
    "and interpolation strictly reduces the largest per-frame attitude step",
    `whole-sample step ${rawJump.toFixed(4)} deg -> interpolated ${maxJump.toFixed(4)} deg `
      + `(${(rawJump / Math.max(1e-12, maxJump)).toFixed(1)}x smaller)`);

  console.log("\n4. ANGLES TAKE THE SHORTEST PATH ACROSS THE YAW WRAP");
  const wrapped = lerpAngleDeg(179, -179, 0.5);
  check(Math.abs(Math.abs(wrapped) - 180) < 1e-9,
    "179 deg to -179 deg passes through 180, not through zero",
    `midpoint ${wrapped.toFixed(4)} deg — a naive lerp would give 0.0000 and spin it 358 deg`);
  const ordinary = lerpAngleDeg(10, 20, 0.5);
  check(Math.abs(ordinary - 15) < 1e-9,
    "and an ordinary interval is unaffected",
    `10 -> 20 at f=0.5 gives ${ordinary.toFixed(4)}`);
}

/* ── 5. NUMBERS READ THE SAMPLE, GEOMETRY READS THE POSE ─────────────── */
console.log("\n5. THE SPLIT HOLDS IN THE SOURCE");
{
  const kpi = /<Kpi label="(Altitude|Roll|Pitch|Yaw)" value=\{num\(now\./g;
  const nKpi = (PANEL.match(kpi) ?? []).length;
  check(nKpi === 4,
    "the four attitude/altitude KPIs read the computed sample, not the drawn pose",
    `${nKpi} of 4 read now.*`);
  check(/const travelledM = .*now\.x/.test(PANEL),
    "distance travelled reads the computed sample too",
    "travelledM is computed from now.x/now.y");
  for (const [what, re] of [
    ["the follow camera", /\? \[pose\.x, pose\.y, -pose\.altitudeM\]/],
    ["the trail's last point", /trail\.push\(project\(\[pose\.x, pose\.y, -pose\.altitudeM\]\)\)/],
    ["the ground shadow", /const shadow = project\(\[pose\.x, pose\.y, 0\]\)/],
    ["the drawn attitude", /rollRad: pose\.rollDeg \* DEG/],
    ["the body-to-world transform", /return \[pose\.x \+ r\[0\], pose\.y \+ r\[1\], -pose\.altitudeM \+ r\[2\]\]/],
  ]) check(re.test(PANEL), `${what} reads the interpolated pose`, "matched in FlightPanel.jsx");

  check(/playing && nextI !== i \? Math\.min\(1, Math\.max\(0, frac\)\) : 0/.test(PANEL),
    "paused, scrubbed or on the last sample, no interpolation happens at all",
    "f falls back to 0, so the drawn pose IS the computed sample");
  check(/while \(d > 180\) d -= 360;/.test(PANEL) && /while \(d < -180\) d \+= 360;/.test(PANEL),
    "the panel still uses the shortest-path angle helper checked above",
    "both wrap branches present");
}

/* ── 6. THE CLAIM WAS NARROWED, NOT LEFT STANDING ────────────────────── */
console.log("\n6. THE FILE NO LONGER CLAIMS WHAT IS NO LONGER TRUE");
{
  check(!/every frame of this animation is a state the 6-DOF/.test(PANEL),
    "the old 'every frame is a computed state' claim is gone",
    "interpolation made it false; leaving it would be the quiet kind of wrong");
  check(!/every frame on screen is still a state the\n\s*6-DOF integrator produced/.test(PANEL),
    "and so is its restatement in the fly-by-hand note",
    "both copies updated together");
  check(/ONE THING IS INTERPOLATED/.test(PANEL),
    "the narrowed guarantee is stated in full instead",
    "the header lists what still holds and what no longer does");
  check(/NOTHING HERE IS KEYFRAMED/.test(PANEL),
    "and the part that IS still true is kept",
    "nothing is keyframed: the pose is bounded by two computed states");
}

console.log("\n" + bar);
if (fails) {
  console.log(`DRONE PLAYBACK GATE FAILED — ${fails} check(s)`);
  process.exit(1);
}
console.log("DRONE PLAYBACK GATE PASSED");
