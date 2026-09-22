/* =====================================================================
   MULTICOPTER FRAME GEOMETRY - motor position, number and rotation
   =====================================================================
   GENERATED FILE. Do not hand-edit. Regenerate with
   eVTOL_Sizing_Research/datasets/drone/gen_frames.py.

   SOURCE: ArduPilot's own flight code, AP_MotorsMatrix.cpp -- not a
   documentation diagram. Each frame there is a table of MotorDef
   { angle_degrees, yaw_factor, testing_order } and the motor number is
   the ARRAY INDEX, passed to add_motor(i, ...). The third field is the
   Mission Planner motor-test order (A, B, C...), which is a DIFFERENT
   sequence on most frames: on QUAD/X the outputs run 1,2,3,4 while the
   test order runs 1,3,4,2. Reading the third field as the motor number
   swaps a diagonal pair, and a quad wired that way flips on take-off.

   angleDeg is measured CLOCKWISE FROM THE NOSE, ArduPilot's convention:
   0 forward, +90 right, 180 aft, -90 left.

   rotation is the PROPELLER'S OWN direction seen from above, taken from
   yaw_factor (CW = -1, CCW = +1, AP_MotorsMatrix.h:10-11). Checked two
   ways, because naming a prop direction backwards is invisible on screen
   and destroys an airframe on take-off:
     - by the mixer's sign. Yawing the airframe right needs more torque
       from the props whose reaction pushes the nose right, i.e. the
       CCW-spinning ones; those carry +1, the CCW macro. So the macro
       names the prop, not the airframe's response.
     - against ArduPilot's own published QuadX diagram: motors 1 and 2
       (front-right, rear-left) CCW, motors 3 and 4 (front-left,
       rear-right) CW. The parsed table reproduces it exactly.
   Two invariants a gate re-checks: diagonally opposite motors share a
   direction, and CW and CCW counts balance (zero net yaw in hover).

   Frames whose motors carry yaw_factor 0 (the NYT tilt frames) are
   OMITTED: that source does not state a rotation for them, and this file
   records only what the source states.

   Fetched 2025-12-02 at commit 9b81dd194b50
   https://github.com/ArduPilot/ardupilot/blob/9b81dd194b508a7684a8ec36d4effed94f8ce0b0/libraries/AP_Motors/AP_MotorsMatrix.cpp
   sha256(AP_MotorsMatrix.cpp) = 54118f5782b699b890da825ac5bfe44b...
   ===================================================================== */

export const FRAME_SOURCE = Object.freeze({
  file: "AP_MotorsMatrix.cpp", commit: "9b81dd194b508a7684a8ec36d4effed94f8ce0b0", fetched: "2025-12-02",
  url: "https://github.com/ArduPilot/ardupilot/blob/9b81dd194b508a7684a8ec36d4effed94f8ce0b0/libraries/AP_Motors/AP_MotorsMatrix.cpp",
  sha256: "54118f5782b699b890da825ac5bfe44bf11aa0d2db8a279fdd8786dbaf6f92b2",
});

export const FRAMES = Object.freeze([
  Object.freeze({
    frameClass: "QUAD", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 90, rotation: "CCW", testingOrder: 2 },
      { motor: 2, angleDeg: -90, rotation: "CCW", testingOrder: 4 },
      { motor: 3, angleDeg: 0, rotation: "CW", testingOrder: 1 },
      { motor: 4, angleDeg: 180, rotation: "CW", testingOrder: 3 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_X", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -135, rotation: "CCW", testingOrder: 3 },
      { motor: 3, angleDeg: -45, rotation: "CW", testingOrder: 4 },
      { motor: 4, angleDeg: 135, rotation: "CW", testingOrder: 2 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "BF_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_BF_X", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 135, rotation: "CW", testingOrder: 2 },
      { motor: 2, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: -45, rotation: "CW", testingOrder: 4 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "X_REV",
    frameTypeEnum: "MOTOR_FRAME_TYPE_BF_X_REV", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 135, rotation: "CCW", testingOrder: 2 },
      { motor: 2, angleDeg: 45, rotation: "CW", testingOrder: 1 },
      { motor: 3, angleDeg: -135, rotation: "CW", testingOrder: 3 },
      { motor: 4, angleDeg: -45, rotation: "CCW", testingOrder: 4 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "DJI_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_DJI_X", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -45, rotation: "CW", testingOrder: 4 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: 135, rotation: "CW", testingOrder: 2 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "CW_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_CW_X", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 135, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: -45, rotation: "CW", testingOrder: 4 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "H",
    frameTypeEnum: "MOTOR_FRAME_TYPE_H", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CW", testingOrder: 1 },
      { motor: 2, angleDeg: -135, rotation: "CW", testingOrder: 3 },
      { motor: 3, angleDeg: -45, rotation: "CCW", testingOrder: 4 },
      { motor: 4, angleDeg: 135, rotation: "CCW", testingOrder: 2 },
    ]),
  }),
  Object.freeze({
    frameClass: "QUAD", frameType: "PLUSREV",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUSREV", motorCount: 4,
    motors: Object.freeze([
      { motor: 1, angleDeg: 90, rotation: "CW", testingOrder: 2 },
      { motor: 2, angleDeg: -90, rotation: "CW", testingOrder: 4 },
      { motor: 3, angleDeg: 0, rotation: "CCW", testingOrder: 1 },
      { motor: 4, angleDeg: 180, rotation: "CCW", testingOrder: 3 },
    ]),
  }),
  Object.freeze({
    frameClass: "HEXA", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 6,
    motors: Object.freeze([
      { motor: 1, angleDeg: 0, rotation: "CW", testingOrder: 1 },
      { motor: 2, angleDeg: 180, rotation: "CCW", testingOrder: 4 },
      { motor: 3, angleDeg: -120, rotation: "CW", testingOrder: 5 },
      { motor: 4, angleDeg: 60, rotation: "CCW", testingOrder: 2 },
      { motor: 5, angleDeg: -60, rotation: "CCW", testingOrder: 6 },
      { motor: 6, angleDeg: 120, rotation: "CW", testingOrder: 3 },
    ]),
  }),
  Object.freeze({
    frameClass: "HEXA", frameType: "X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_X", motorCount: 6,
    motors: Object.freeze([
      { motor: 1, angleDeg: 90, rotation: "CW", testingOrder: 2 },
      { motor: 2, angleDeg: -90, rotation: "CCW", testingOrder: 5 },
      { motor: 3, angleDeg: -30, rotation: "CW", testingOrder: 6 },
      { motor: 4, angleDeg: 150, rotation: "CCW", testingOrder: 3 },
      { motor: 5, angleDeg: 30, rotation: "CCW", testingOrder: 1 },
      { motor: 6, angleDeg: -150, rotation: "CW", testingOrder: 4 },
    ]),
  }),
  Object.freeze({
    frameClass: "HEXA", frameType: "DJI_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_DJI_X", motorCount: 6,
    motors: Object.freeze([
      { motor: 1, angleDeg: 30, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -30, rotation: "CW", testingOrder: 6 },
      { motor: 3, angleDeg: -90, rotation: "CCW", testingOrder: 5 },
      { motor: 4, angleDeg: -150, rotation: "CW", testingOrder: 4 },
      { motor: 5, angleDeg: 150, rotation: "CCW", testingOrder: 3 },
      { motor: 6, angleDeg: 90, rotation: "CW", testingOrder: 2 },
    ]),
  }),
  Object.freeze({
    frameClass: "HEXA", frameType: "CW_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_CW_X", motorCount: 6,
    motors: Object.freeze([
      { motor: 1, angleDeg: 30, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 90, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 150, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: -150, rotation: "CW", testingOrder: 4 },
      { motor: 5, angleDeg: -90, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: -30, rotation: "CW", testingOrder: 6 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTA", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 0, rotation: "CW", testingOrder: 1 },
      { motor: 2, angleDeg: 180, rotation: "CW", testingOrder: 5 },
      { motor: 3, angleDeg: 45, rotation: "CCW", testingOrder: 2 },
      { motor: 4, angleDeg: 135, rotation: "CCW", testingOrder: 4 },
      { motor: 5, angleDeg: -45, rotation: "CCW", testingOrder: 8 },
      { motor: 6, angleDeg: -135, rotation: "CCW", testingOrder: 6 },
      { motor: 7, angleDeg: -90, rotation: "CW", testingOrder: 7 },
      { motor: 8, angleDeg: 90, rotation: "CW", testingOrder: 3 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 0, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -90, rotation: "CW", testingOrder: 7 },
      { motor: 3, angleDeg: 180, rotation: "CCW", testingOrder: 5 },
      { motor: 4, angleDeg: 90, rotation: "CW", testingOrder: 3 },
      { motor: 5, angleDeg: -90, rotation: "CCW", testingOrder: 8 },
      { motor: 6, angleDeg: 0, rotation: "CW", testingOrder: 2 },
      { motor: 7, angleDeg: 90, rotation: "CCW", testingOrder: 4 },
      { motor: 8, angleDeg: 180, rotation: "CW", testingOrder: 6 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_X", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -45, rotation: "CW", testingOrder: 7 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 5 },
      { motor: 4, angleDeg: 135, rotation: "CW", testingOrder: 3 },
      { motor: 5, angleDeg: -45, rotation: "CCW", testingOrder: 8 },
      { motor: 6, angleDeg: 45, rotation: "CW", testingOrder: 2 },
      { motor: 7, angleDeg: 135, rotation: "CCW", testingOrder: 4 },
      { motor: 8, angleDeg: -135, rotation: "CW", testingOrder: 6 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "H",
    frameTypeEnum: "MOTOR_FRAME_TYPE_H", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CW", testingOrder: 1 },
      { motor: 2, angleDeg: -45, rotation: "CCW", testingOrder: 7 },
      { motor: 3, angleDeg: -135, rotation: "CW", testingOrder: 5 },
      { motor: 4, angleDeg: 135, rotation: "CCW", testingOrder: 3 },
      { motor: 5, angleDeg: -45, rotation: "CW", testingOrder: 8 },
      { motor: 6, angleDeg: 45, rotation: "CCW", testingOrder: 2 },
      { motor: 7, angleDeg: 135, rotation: "CW", testingOrder: 4 },
      { motor: 8, angleDeg: -135, rotation: "CCW", testingOrder: 6 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "CW_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_CW_X", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 45, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 135, rotation: "CW", testingOrder: 3 },
      { motor: 4, angleDeg: 135, rotation: "CCW", testingOrder: 4 },
      { motor: 5, angleDeg: -135, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: -135, rotation: "CW", testingOrder: 6 },
      { motor: 7, angleDeg: -45, rotation: "CW", testingOrder: 7 },
      { motor: 8, angleDeg: -45, rotation: "CCW", testingOrder: 8 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "BF_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_BF_X", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 135, rotation: "CW", testingOrder: 3 },
      { motor: 2, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 5 },
      { motor: 4, angleDeg: -45, rotation: "CW", testingOrder: 7 },
      { motor: 5, angleDeg: 135, rotation: "CCW", testingOrder: 4 },
      { motor: 6, angleDeg: 45, rotation: "CW", testingOrder: 2 },
      { motor: 7, angleDeg: -135, rotation: "CW", testingOrder: 6 },
      { motor: 8, angleDeg: -45, rotation: "CCW", testingOrder: 8 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "X_REV",
    frameTypeEnum: "MOTOR_FRAME_TYPE_BF_X_REV", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 135, rotation: "CCW", testingOrder: 3 },
      { motor: 2, angleDeg: 45, rotation: "CW", testingOrder: 1 },
      { motor: 3, angleDeg: -135, rotation: "CW", testingOrder: 5 },
      { motor: 4, angleDeg: -45, rotation: "CCW", testingOrder: 7 },
      { motor: 5, angleDeg: 135, rotation: "CW", testingOrder: 4 },
      { motor: 6, angleDeg: 45, rotation: "CCW", testingOrder: 2 },
      { motor: 7, angleDeg: -135, rotation: "CCW", testingOrder: 6 },
      { motor: 8, angleDeg: -45, rotation: "CW", testingOrder: 8 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "X_COR",
    frameTypeEnum: "MOTOR_FRAME_TYPE_X_COR", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: -45, rotation: "CW", testingOrder: 7 },
      { motor: 3, angleDeg: -135, rotation: "CCW", testingOrder: 5 },
      { motor: 4, angleDeg: 135, rotation: "CW", testingOrder: 3 },
      { motor: 5, angleDeg: -45, rotation: "CW", testingOrder: 8 },
      { motor: 6, angleDeg: 45, rotation: "CCW", testingOrder: 2 },
      { motor: 7, angleDeg: 135, rotation: "CW", testingOrder: 4 },
      { motor: 8, angleDeg: -135, rotation: "CCW", testingOrder: 6 },
    ]),
  }),
  Object.freeze({
    frameClass: "OCTAQUAD", frameType: "CW_X_COR",
    frameTypeEnum: "MOTOR_FRAME_TYPE_CW_X_COR", motorCount: 8,
    motors: Object.freeze([
      { motor: 1, angleDeg: 45, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 45, rotation: "CCW", testingOrder: 2 },
      { motor: 3, angleDeg: 135, rotation: "CW", testingOrder: 3 },
      { motor: 4, angleDeg: 135, rotation: "CW", testingOrder: 4 },
      { motor: 5, angleDeg: -135, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: -135, rotation: "CCW", testingOrder: 6 },
      { motor: 7, angleDeg: -45, rotation: "CW", testingOrder: 7 },
      { motor: 8, angleDeg: -45, rotation: "CW", testingOrder: 8 },
    ]),
  }),
  Object.freeze({
    frameClass: "DODECAHEXA", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 12,
    motors: Object.freeze([
      { motor: 1, angleDeg: 0, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 0, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 60, rotation: "CW", testingOrder: 3 },
      { motor: 4, angleDeg: 60, rotation: "CCW", testingOrder: 4 },
      { motor: 5, angleDeg: 120, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: 120, rotation: "CW", testingOrder: 6 },
      { motor: 7, angleDeg: 180, rotation: "CW", testingOrder: 7 },
      { motor: 8, angleDeg: 180, rotation: "CCW", testingOrder: 8 },
      { motor: 9, angleDeg: -120, rotation: "CCW", testingOrder: 9 },
      { motor: 10, angleDeg: -120, rotation: "CW", testingOrder: 10 },
      { motor: 11, angleDeg: -60, rotation: "CW", testingOrder: 11 },
      { motor: 12, angleDeg: -60, rotation: "CCW", testingOrder: 12 },
    ]),
  }),
  Object.freeze({
    frameClass: "DODECAHEXA", frameType: "X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_X", motorCount: 12,
    motors: Object.freeze([
      { motor: 1, angleDeg: 30, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 30, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 90, rotation: "CW", testingOrder: 3 },
      { motor: 4, angleDeg: 90, rotation: "CCW", testingOrder: 4 },
      { motor: 5, angleDeg: 150, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: 150, rotation: "CW", testingOrder: 6 },
      { motor: 7, angleDeg: -150, rotation: "CW", testingOrder: 7 },
      { motor: 8, angleDeg: -150, rotation: "CCW", testingOrder: 8 },
      { motor: 9, angleDeg: -90, rotation: "CCW", testingOrder: 9 },
      { motor: 10, angleDeg: -90, rotation: "CW", testingOrder: 10 },
      { motor: 11, angleDeg: -30, rotation: "CW", testingOrder: 11 },
      { motor: 12, angleDeg: -30, rotation: "CCW", testingOrder: 12 },
    ]),
  }),
  Object.freeze({
    frameClass: "DECA", frameType: "PLUS",
    frameTypeEnum: "MOTOR_FRAME_TYPE_PLUS", motorCount: 10,
    motors: Object.freeze([
      { motor: 1, angleDeg: 0, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 36, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 72, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: 108, rotation: "CW", testingOrder: 4 },
      { motor: 5, angleDeg: 144, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: 180, rotation: "CW", testingOrder: 6 },
      { motor: 7, angleDeg: -144, rotation: "CCW", testingOrder: 7 },
      { motor: 8, angleDeg: -108, rotation: "CW", testingOrder: 8 },
      { motor: 9, angleDeg: -72, rotation: "CCW", testingOrder: 9 },
      { motor: 10, angleDeg: -36, rotation: "CW", testingOrder: 10 },
    ]),
  }),
  Object.freeze({
    frameClass: "DECA", frameType: "X/CW_X",
    frameTypeEnum: "MOTOR_FRAME_TYPE_CW_X", motorCount: 10,
    motors: Object.freeze([
      { motor: 1, angleDeg: 18, rotation: "CCW", testingOrder: 1 },
      { motor: 2, angleDeg: 54, rotation: "CW", testingOrder: 2 },
      { motor: 3, angleDeg: 90, rotation: "CCW", testingOrder: 3 },
      { motor: 4, angleDeg: 126, rotation: "CW", testingOrder: 4 },
      { motor: 5, angleDeg: 162, rotation: "CCW", testingOrder: 5 },
      { motor: 6, angleDeg: -162, rotation: "CW", testingOrder: 6 },
      { motor: 7, angleDeg: -126, rotation: "CCW", testingOrder: 7 },
      { motor: 8, angleDeg: -90, rotation: "CW", testingOrder: 8 },
      { motor: 9, angleDeg: -54, rotation: "CCW", testingOrder: 9 },
      { motor: 10, angleDeg: -18, rotation: "CW", testingOrder: 10 },
    ]),
  }),
]);

/* Frames present in the source but omitted above, with the reason. */
export const FRAMES_OMITTED = Object.freeze([
  { frameClass: "QUAD", frameType: "NYT_PLUS", reason: "motors carry yaw_factor 0; the source states no rotation" },
  { frameClass: "QUAD", frameType: "NYT_X", reason: "motors carry yaw_factor 0; the source states no rotation" },
]);

export const FRAME_CLASSES = Object.freeze(
  [...new Set(FRAMES.map((f) => f.frameClass))]);

export function framesOfClass(frameClass) {
  return FRAMES.filter((f) => f.frameClass === frameClass);
}

export function findFrame(frameClass, frameType) {
  return FRAMES.find((f) => f.frameClass === frameClass && f.frameType === frameType) ?? null;
}
