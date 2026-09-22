/* =====================================================================
   DRONE FRAME GATE — the geometry a wiring diagram is drawn from
   =====================================================================
   WHY THIS FILE EXISTS.

   src/data/drone-frames.js is generated from ArduPilot's own flight code,
   and the frame diagram draws motor numbers, arm angles and propeller
   rotations straight out of it. Every failure mode here is INVISIBLE on
   screen and destructive in the air:

     - a motor number read from the wrong field. ArduPilot's MotorDef is
       { angle_degrees, yaw_factor, testing_order } and the motor number is
       the ARRAY INDEX, not the third field. The third field is the Mission
       Planner motor-test order, a different sequence on most frames: on
       QUAD/X the outputs run 1,2,3,4 while the test order runs 1,3,4,2.
       Confusing them swaps a diagonal pair, and a quad wired that way
       flips on take-off. The generator got this wrong once already.

     - a missing rotation. A drawing that silently omits a direction is
       worse than one that refuses to draw: the reader assumes a default.

     - an unbalanced frame. Equal CW and CCW counts are what make the
       reaction torques cancel in hover. A frame that does not balance
       needs a standing yaw trim, and if that appears it is far more
       likely that the parse broke than that ArduPilot ships such a frame.

   These are checked against the DATA, not against a transcription of it,
   so a bad regeneration fails the build rather than reaching a user.
   ===================================================================== */
import { FRAMES, FRAMES_OMITTED, FRAME_SOURCE } from "../src/data/drone-frames.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE FRAME GATE");
console.log("=".repeat(72));

check("frames are present", FRAMES.length > 0, `${FRAMES.length} frames`);

check("provenance names a file, a commit and a hash",
  Boolean(FRAME_SOURCE?.file && /^[0-9a-f]{40}$/.test(FRAME_SOURCE?.commit ?? "") &&
          /^[0-9a-f]{64}$/.test(FRAME_SOURCE?.sha256 ?? "")),
  `${FRAME_SOURCE?.file} @ ${String(FRAME_SOURCE?.commit).slice(0, 12)}`);

/* Every motor states a rotation. Frames whose source gives none are omitted
   from FRAMES by the generator and listed in FRAMES_OMITTED instead — listed,
   never guessed. */
const nullRot = FRAMES.flatMap((f) =>
  f.motors.filter((m) => m.rotation !== "CW" && m.rotation !== "CCW")
          .map((m) => `${f.frameClass}/${f.frameType} motor ${m.motor}`));
check("every motor states CW or CCW", nullRot.length === 0, nullRot.slice(0, 4).join(", "));

check("frames with no stated rotation are listed, not dropped silently",
  Array.isArray(FRAMES_OMITTED),
  FRAMES_OMITTED.length
    ? FRAMES_OMITTED.map((f) => `${f.frameClass}/${f.frameType}`).join(", ")
    : "none omitted");

/* Reaction torques cancel in hover. */
const unbalanced = FRAMES.filter((f) => {
  const cw = f.motors.filter((m) => m.rotation === "CW").length;
  return cw * 2 !== f.motors.length;
}).map((f) => `${f.frameClass}/${f.frameType}`);
check("CW and CCW counts balance on every frame", unbalanced.length === 0,
  unbalanced.length ? unbalanced.join(", ") : `${FRAMES.length} frames balanced`);

/* Motor numbers are output channels: contiguous 1..N with no repeats. The same
   must hold for the testing order, and the two must be DIFFERENT sequences on
   at least one frame — if they were identical everywhere, the generator would
   have collapsed the two fields and the distinction this gate exists to protect
   would be gone. */
const contiguous = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.every((v, i) => v === i + 1);
};
const badMotorNo = FRAMES.filter((f) => !contiguous(f.motors.map((m) => m.motor)))
  .map((f) => `${f.frameClass}/${f.frameType}`);
check("motor numbers are contiguous 1..N", badMotorNo.length === 0, badMotorNo.join(", "));

const badTest = FRAMES.filter((f) => !contiguous(f.motors.map((m) => m.testingOrder)))
  .map((f) => `${f.frameClass}/${f.frameType}`);
check("testing orders are contiguous 1..N", badTest.length === 0, badTest.join(", "));

const differ = FRAMES.filter((f) => f.motors.some((m) => m.motor !== m.testingOrder));
check("motor number and testing order are distinct sequences", differ.length > 0,
  `${differ.length} of ${FRAMES.length} frames differ — e.g. ` +
  (differ[0] ? `${differ[0].frameClass}/${differ[0].frameType} outputs ` +
    `${differ[0].motors.map((m) => m.motor).join(",")} vs test ` +
    `${differ[0].motors.map((m) => m.testingOrder).join(",")}` : ""));

/* Angles are real numbers in (-180, 180]. An angle outside that range would
   still draw, just in the wrong place. */
const badAngle = FRAMES.flatMap((f) => f.motors
  .filter((m) => !Number.isFinite(m.angleDeg) || m.angleDeg <= -180 || m.angleDeg > 180)
  .map((m) => `${f.frameClass}/${f.frameType} motor ${m.motor} at ${m.angleDeg}`));
check("every arm angle is finite and within (-180, 180]", badAngle.length === 0,
  badAngle.slice(0, 4).join(", "));

check("motorCount matches the motors listed",
  FRAMES.every((f) => f.motorCount === f.motors.length));

/* A coaxial frame puts two motors on one arm at one angle, and ArduPilot ships
   BOTH kinds:

     ordinary coaxial (X8, Y6)  the pair COUNTER-rotates. Two co-rotating props
                                on one arm would add their reaction torques
                                instead of cancelling.
     corotating (_COR)          the pair CO-rotates deliberately — a real frame
                                type, flown with corotating propellers — and the
                                torque balance is struck across ARMS instead,
                                which the CW/CCW count check above already
                                covers for every frame.

   Both are asserted positively rather than the second being waived, because a
   parse that lost the distinction would otherwise pass by looking like the
   first kind. */
const coaxArms = (f) => {
  const byAngle = new Map();
  for (const m of f.motors) {
    if (!byAngle.has(m.angleDeg)) byAngle.set(m.angleDeg, []);
    byAngle.get(m.angleDeg).push(m);
  }
  return [...byAngle.entries()].filter(([, ms]) => ms.length > 1);
};
const isCorotating = (f) => /_COR$/.test(f.frameType);

const coaxBad = [];
for (const f of FRAMES.filter((x) => !isCorotating(x)))
  for (const [angle, ms] of coaxArms(f))
    if (new Set(ms.map((m) => m.rotation)).size !== ms.length)
      coaxBad.push(`${f.frameClass}/${f.frameType} at ${angle}deg`);
const coaxFrames = FRAMES.filter((f) => !isCorotating(f) && coaxArms(f).length > 0);
check("coaxial pairs counter-rotate on ordinary coaxial frames", coaxBad.length === 0,
  coaxBad.length ? coaxBad.join(", ") : `${coaxFrames.length} coaxial frames checked`);

const corFrames = FRAMES.filter(isCorotating);
const corBad = [];
for (const f of corFrames)
  for (const [angle, ms] of coaxArms(f))
    if (new Set(ms.map((m) => m.rotation)).size !== 1)
      corBad.push(`${f.frameClass}/${f.frameType} at ${angle}deg`);
check("corotating (_COR) frames really do corotate within each arm",
  corFrames.length > 0 && corBad.length === 0,
  corBad.length ? corBad.join(", ")
                : `${corFrames.length} frames: ${corFrames.map((f) => f.frameType).join(", ")}`);

console.log("=".repeat(72));
console.log(fail === 0 ? `DRONE FRAME GATE PASSED (${pass} checks)`
                       : `DRONE FRAME GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
