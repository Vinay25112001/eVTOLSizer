/* =====================================================================
   FRAME DIAGRAM — motor positions, numbers and rotation directions
   =====================================================================
   The rule this drawing obeys is the one the fuselage work established:
   A DRAWING SHOWS COMPUTED QUANTITIES AND SOURCED CONVENTIONS, AND
   NOTHING ELSE. Everything here comes from src/data/drone-frames.js,
   which is generated from ArduPilot's own AP_MotorsMatrix.cpp — motor
   number, arm angle and propeller rotation are read, never chosen.

   What is NOT drawn, and why:
     - arm LENGTH. Nothing has sized an arm yet. Every arm is drawn at the
       same radius, which is a layout decision, not a claim about geometry.
       The caption says so, so nobody scales a tape measure off it.
     - the centre of gravity. The CG of a multirotor is set by where the
       battery and payload actually sit, and no component has been placed
       yet. An unplaced CG marker would be decoration that looks like data.
     - prop DIAMETER. Not selected yet; the disc radius here is a drawing
       constant, deliberately drawn hollow so it does not read as a
       to-scale disc.

   The angle convention is ArduPilot's: degrees CLOCKWISE FROM THE NOSE,
   with the nose up the screen. Screen x is sin(angle) and screen y is
   -cos(angle), so 0 deg puts a motor at the top and +90 to the right.
   ===================================================================== */
import { useMemo } from "react";
import { SC } from "../../lib/theme.js";
import { T, MONO, SANS } from "../../ui/tokens.js";

/* Drawing constants — geometry of the PICTURE, not of any aircraft. */
const VIEW = 260;           // viewBox extent, square
const C = VIEW / 2;         // centre
const ARM = 86;             // arm length on screen (see header: not sized)
const DISC = 30;            // rotor disc radius on screen (not a diameter)
const HUB = 15;             // body half-width

export function motorXY(angleDeg, radius = ARM) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: C + radius * Math.sin(a), y: C - radius * Math.cos(a) };
}

/* A rotation arrow drawn as an arc around the disc with a head on one end.
   CW and CCW differ by the sweep flag and which end carries the head, so the
   two are never distinguished by colour alone — the shape itself differs. */
function RotationArc({ x, y, cw, colour, radius = DISC }) {
  const r = radius + 6;
  const start = cw ? -140 : -40;
  const end = cw ? -40 : -140;
  const p = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  };
  const [x0, y0] = p(start);
  const [x1, y1] = p(end);
  const head = 5;
  const tangent = (cw ? 1 : -1) * 90;
  const ha = ((end + tangent) * Math.PI) / 180;
  return (
    <g>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 ${cw ? 1 : 0} ${x1} ${y1}`}
            fill="none" stroke={colour} strokeWidth={1.6} />
      <path d={`M ${x1} ${y1} L ${x1 - head * Math.cos(ha - 0.45)} ${y1 - head * Math.sin(ha - 0.45)}
                L ${x1 - head * Math.cos(ha + 0.45)} ${y1 - head * Math.sin(ha + 0.45)} Z`}
            fill={colour} stroke="none" />
    </g>
  );
}

/* Motors grouped into ARMS by angle. A coaxial frame (X8, Y6, the dodeca-hexa)
   carries two counter-rotating motors on one arm at one angle; the source
   gives their angle and rotation but NOT which of the pair is the upper and
   which the lower, so this draws them concentrically and the caption says the
   stacking order is not known rather than inventing one. */
function armsOf(frame) {
  const by = new Map();
  for (const m of frame.motors) {
    if (!by.has(m.angleDeg)) by.set(m.angleDeg, []);
    by.get(m.angleDeg).push(m);
  }
  return [...by.entries()].map(([angleDeg, motors]) => ({ angleDeg, motors }));
}

export default function FrameDiagram({ frame, size = 300, showTestOrder = false }) {
  const arms = useMemo(() => (frame ? armsOf(frame) : []), [frame]);
  if (!frame) return null;
  const cwColour = SC.caution;
  const ccwColour = SC.blue ?? SC.primary;
  const coaxial = arms.some((a) => a.motors.length > 1);

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size}
           role="img"
           aria-label={`${frame.frameClass} ${frame.frameType}: ${frame.motorCount} motors, ` +
             frame.motors.map((m) => `motor ${m.motor} at ${m.angleDeg} degrees ${m.rotation}`).join(", ")}
           style={{ display: "block", maxWidth: "100%" }}>
        {/* nose reference — which way is forward */}
        <line x1={C} y1={C} x2={C} y2={18} stroke={SC.border} strokeWidth={1} strokeDasharray="3 3" />
        <path d={`M ${C} 10 L ${C - 5} 21 L ${C + 5} 21 Z`} fill={SC.muted} />
        <text x={C + 9} y={19} fill={SC.muted} fontSize={9} fontFamily={MONO}>FWD</text>

        {/* arms, drawn first so discs sit over them. One arm per ANGLE, not
            per motor: a coaxial frame puts two counter-rotating motors on the
            same arm at the same angle, and drawing one arm per motor would
            stack them invisibly on top of each other. */}
        {arms.map((arm) => {
          const { x, y } = motorXY(arm.angleDeg);
          return <line key={`arm${arm.angleDeg}`} x1={C} y1={C} x2={x} y2={y}
                       stroke={SC.border} strokeWidth={3} strokeLinecap="round" />;
        })}

        {/* body */}
        <rect x={C - HUB} y={C - HUB} width={HUB * 2} height={HUB * 2} rx={3}
              fill={SC.panel} stroke={SC.border} strokeWidth={1} />

        {arms.map((arm) => {
          const { x, y } = motorXY(arm.angleDeg);
          const coax = arm.motors.length > 1;
          return (
            <g key={`rotor${arm.angleDeg}`}>
              {/* One ring per motor, concentric for a coaxial stack. The rings
                  are hollow and dashed: a rotor POSITION, not a to-scale disc. */}
              {arm.motors.map((m, i) => {
                const colour = m.rotation === "CW" ? cwColour : ccwColour;
                const r = DISC - i * 10;
                return (
                  <g key={m.motor}>
                    <circle cx={x} cy={y} r={r} fill="none" stroke={colour}
                            strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
                    <RotationArc x={x} y={y} radius={r} cw={m.rotation === "CW"} colour={colour} />
                  </g>
                );
              })}
              <circle cx={x} cy={y} r={7} fill={SC.inset}
                      stroke={arm.motors[0].rotation === "CW" ? cwColour : ccwColour} strokeWidth={1.5} />
              <text x={x} y={y + 3.4} textAnchor="middle" fill={SC.text}
                    fontSize={coax ? 8 : 10} fontWeight={700} fontFamily={MONO}>
                {coax ? `×${arm.motors.length}` : arm.motors[0].motor}
              </text>
              {/* One label line per motor, so a coaxial pair reads as two
                  motors with two directions rather than one overprinted blur. */}
              {arm.motors.map((m, i) => {
                const colour = m.rotation === "CW" ? cwColour : ccwColour;
                return (
                  <text key={m.motor} x={x} y={y + DISC + 14 + i * 11} textAnchor="middle"
                        fill={colour} fontSize={9} fontFamily={MONO}>
                    {coax ? `${m.motor} ` : ""}{m.rotation}{showTestOrder ? ` · ${m.testingOrder}` : ""}
                  </text>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: T.micro, color: SC.subtle, fontFamily: SANS,
                           lineHeight: 1.5, marginTop: 6, maxWidth: size + 40 }}>
        Motor numbers are ArduPilot output channels; rotation is the propeller
        seen from above. Both are read from <code style={{ fontFamily: MONO }}>AP_MotorsMatrix.cpp</code>.
        {showTestOrder && " The second figure is the Mission Planner motor-test order, which is a different sequence."}
        {coaxial && (
          <> <b style={{ color: SC.muted }}>Coaxial frame:</b> two counter-rotating
          motors share each arm, drawn as concentric rings. The source gives each
          motor&apos;s angle and direction but not which of a pair is the upper, so
          no upper/lower is shown.</>
        )}
        <br />
        <b style={{ color: SC.muted }}>Not to scale.</b> Arm length and disc size are
        drawing constants — no arm or propeller has been sized yet, and no
        centre of gravity is shown because no component has been placed.
      </figcaption>
    </figure>
  );
}
