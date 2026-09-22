/* =====================================================================
   DRONE 3D — the airframe drawn from the numbers that define it
   =====================================================================
   Every element here is placed by a computed or PUBLISHED quantity:

     rotor azimuth      ArduPilot's own flight code
     spin direction     the same table's yaw_factor
     disc radius        the MEASURED diameter of the selected propeller
     arm length         the shortest ring radius at which the discs clear,
                        computed from the ACTUAL azimuths of this frame
     rotor speed        the sized hover RPM — the animation is a readout
     motor body         the selected motor's PUBLISHED STATOR diameter and
                        height, which is NOT its can — see below
     cells              the selected cell's PUBLISHED maximum diameter and
                        height, one solid per cell, count from the pack

   What is drawn but NOT measured is drawn differently and labelled:
   the body pod stays a dashed hollow outline, the cell ARRANGEMENT is
   declared, and the reference plane's drop below the aircraft is a
   drawing convention. Nothing here is a landing-gear height.

   A STATOR IS NOT A CAN. Hobby motors are named for their stator - a
   "4213" has a 42 mm stator diameter and a 13 mm stator height, and the
   KDE4213XF-360 publishes exactly those two numbers. The outrunner bell
   around it is always larger and no datasheet in this survey states it.
   So the solid drawn at the rotor hub is the STATOR, at its published
   size, and it is labelled as the stator rather than quietly inflated
   into a motor-shaped object.

   WHY SVG AND NOT A 3D LIBRARY. This project draws all of its geometry
   in SVG and byte-compares the output in a gate. A canvas or WebGL view
   cannot be diffed, so a geometry change could pass unnoticed — which is
   exactly what render-freeze.mjs exists to stop. The projection is
   orthographic, so parallel lengths survive it and a span can be read
   off the screen; a perspective view would look more like a photograph
   and be less useful for the one thing this view is for. Shading,
   shadows and motion blur are added with gradients and opacity, which
   change no vertex: the geometry that byte-compares is the same geometry
   whether it is lit or flat.

   THE GROUND PLANE IS BELOW THE AIRCRAFT, NOT THROUGH IT. The reference
   grid used to sit at z = 0, the same plane as the rotors, so every
   element was coplanar and the view read as a flat schematic however far
   it was orbited. The grid now sits a declared distance below, and each
   disc casts its own outline onto it. Squares are still 100 mm and the
   projection is still orthographic, so a span still reads off the grid.

   ── THE FAILURE VIEW IS NOT A SIMULATION ─────────────────────────────
   Clicking a rotor fails it, and the verdict comes from the ACAI
   controllability test of Du, Quan, Yang & Cai — already implemented and
   validated in this repository against their own published 1.53 kg
   hexacopter. It answers ONE question: with that rotor dead, does a
   thrust set still exist that holds hover and trims all three moments?

   It does NOT say the aircraft recovers, and it does not describe the
   transient. Du et al.'s own scope is hover-linearised and fixed-pitch.
   A recovery trajectory needs a controller and rigid-body dynamics that
   are a separate module, and drawing one here would dress an assumption
   as a result.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { Card } from "../ui-kit.jsx";
import {
  buildAirframe, project, yawBalance, parseDimsMm, cellLayout, DEG,
} from "./geometry3d.js";
import { buildDroneScene, pathOf } from "./scene3d.js";
import { acai, torqueToThrustRatio } from "../../engine/controlauthority.js";

const num = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));

/* DRAWING CONVENTIONS — none of these is a measurement. */
const GROUND_DROP_FRACTION = 0.9;   // reference plane, in prop radii below the arms
const BLUR_GHOSTS = 4;              // trailing blade images
const GHOST_SWEEP_DEG = 24;         // total arc the ghosts cover

/* A propeller at four thousand rpm is a translucent disc with a hint of
   blade in it, not a spoked wheel. The swept annulus carries most of the
   read and the blades are a short bright arc on top of it; a long ghost
   train just draws spokes. */
const SWEPT_OPACITY = 0.16;

const CCW_COLOUR = "#4ea1ff", CW_COLOUR = "#f2a33c", DEAD_COLOUR = "#e0574a";
const W = 720, H = 540;

/* THE VIEWPORT IS AN INSTRUMENT CANVAS AND STAYS DARK IN BOTH THEMES, so
   every colour INSIDE it is fixed rather than a theme token. Tokens flip
   with the theme: in the light palette SC.text is near-black and SC.amber
   darkens to #7F6400, which put the rotor labels and the nose marker as
   dark ink on this dark ground — invisible, and only found by rendering
   the light theme and looking at it. */
const VIEW = Object.freeze({
  text: "#C8D8E8",
  muted: "#7F97A8",
  amber: "#E8A020",
  halo: "#060B12",
  pod: "#8595A5",
});

export default function Drone3D({ frame, propellerDiameterM, sizing, parts, tipGapFraction = 0.10 }) {
  const [view, setView] = useState({ yaw: 38, pitch: 34 });
  const [failed, setFailed] = useState(() => new Set());
  const [spin, setSpin] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const drag = useRef(null);

  /* Rotor spin, at a rate proportional to the sized hover RPM so the
     animation is a readout rather than decoration. Capped so it reads as
     motion rather than a blur. */
  useEffect(() => {
    if (!spinning) return;
    let raf, last = performance.now();
    const rpm = sizing?.hover?.rpm ?? 0;
    const tick = (t) => {
      const dt = (t - last) / 1000; last = t;
      setSpin((s) => (s + Math.min(rpm, 600) * 6 * dt) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, sizing?.hover?.rpm]);

  const air = useMemo(() => {
    try { return buildAirframe({ frame, propellerDiameterM, tipGapFraction }); }
    catch (e) { return { error: e.message }; }
  }, [frame, propellerDiameterM, tipGapFraction]);

  /* Published part geometry, or null where nobody publishes it. */
  const stator = useMemo(() => {
    const m = parts?.motor;
    const d = m?.stator_diameter_mm, h = m?.stator_height_mm;
    return Number.isFinite(d) && Number.isFinite(h)
      ? { radiusM: d / 2000, heightM: h / 1000, model: m.model, d, h } : null;
  }, [parts?.motor]);

  const cells = useMemo(() => {
    const dims = parseDimsMm(parts?.cell?.dimensions_mm);
    return cellLayout(parts?.pack, dims);
  }, [parts?.cell, parts?.pack]);

  /* THE DRAWING ITSELF, from the module the freeze gate renders. The spin
     angle is passed in rather than read from a clock inside, which is
     what lets tools/render-drone.mjs produce a byte-stable PNG of this
     same scene at a fixed angle. */
  const scene = useMemo(() => {
    if (air.error) return null;
    try {
      return buildDroneScene({
        frame, propellerDiameterM, tipGapFraction, stator, cells,
        W, H, viewYawDeg: view.yaw, viewPitchDeg: view.pitch,
        spinDeg: spinning ? spin : 0, failed,
      });
    } catch (e) { return null; }
  }, [air.error, frame, propellerDiameterM, tipGapFraction, stator, cells,
      view.yaw, view.pitch, spin, spinning, failed]);

  /* ── CONTROLLABILITY, from the repository's validated ACAI ─────── */
  const control = useMemo(() => {
    if (air.error || !sizing?.hover) return null;
    const W = sizing.massKg * 9.80665;
    const fMax = sizing.thrustToWeight.maxThrustPerRotorN;
    const kMu = torqueToThrustRatio({
      thrustPerRotorN: sizing.hover.thrustPerRotorN,
      R_m: air.propRadiusM,
      tipSpeed_ms: (sizing.hover.rpm * 2 * Math.PI / 60) * air.propRadiusM,
      FM: sizing.hover.figureOfMerit,
      rho: sizing.rho,
    });
    if (kMu == null) return null;
    const rotors = air.rotors.map((r) => ({
      r: air.armLengthM, phi: r.angleDeg * DEG,
      w: r.rotation === "CCW" ? 1 : -1,
      eta: failed.has(r.motor) ? 0 : 1,
    }));
    const now = acai({ rotors, kMu, fMaxN: fMax, weightN: W });
    /* Every single failure, so the view can say which rotors are
       survivable rather than only the one being poked. */
    const perRotor = air.rotors.map((r, i) => {
      const set = rotors.map((x, k) => (k === i ? { ...x, eta: 0 } : { ...x, eta: 1 }));
      const a = acai({ rotors: set, kMu, fMaxN: fMax, weightN: W });
      return { motor: r.motor, controllable: a?.controllable ?? null, acai: a?.acai ?? null };
    });
    return { kMu, now, perRotor, fMax, W };
  }, [air, sizing, failed]);

  if (air.error || !scene) {
    return <Card title="Airframe"><div style={{ fontSize: T.label, color: SC.muted }}>
      {air.error ?? "the scene could not be built"}
    </div></Card>;
  }

  const scale = scene.scale;
  const balance = yawBalance(air.rotors);

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, ...view }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setView({
      yaw: drag.current.yaw + (e.clientX - drag.current.x) * 0.5,
      pitch: Math.max(-85, Math.min(85, drag.current.pitch + (e.clientY - drag.current.y) * 0.4)),
    });
  };
  const onUp = () => { drag.current = null; };

  return (
    <Card title={`Airframe — ${air.frameClass}/${air.frameType}, ${air.rotors.length} rotors`}>
      <div style={{ display: "flex", gap: S.md, flexWrap: "wrap" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ border: `1px solid ${SC.border}`, borderRadius: 6, cursor: "grab", touchAction: "none" }}>

          <defs>
            {/* Lighting is a gradient, not a vertex: shading changes no
                geometry, so the diffable drawing is unchanged by it. */}
            <linearGradient id="d3-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1622" />
              <stop offset="58%" stopColor="#0a111b" />
              <stop offset="100%" stopColor="#070c14" />
            </linearGradient>
            <radialGradient id="d3-glow" cx="50%" cy="46%" r="62%">
              <stop offset="0%" stopColor="#1b3350" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#1b3350" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="d3-arm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fa6b8" />
              <stop offset="45%" stopColor="#5d7387" />
              <stop offset="100%" stopColor="#2b3946" />
            </linearGradient>
            <linearGradient id="d3-arm-dead" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0897c" />
              <stop offset="100%" stopColor="#7d2a22" />
            </linearGradient>
            <linearGradient id="d3-stator" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2d3a47" />
              <stop offset="32%" stopColor="#7e94a6" />
              <stop offset="62%" stopColor="#4a5b6b" />
              <stop offset="100%" stopColor="#222c37" />
            </linearGradient>
            <linearGradient id="d3-cell" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1d3a2f" />
              <stop offset="34%" stopColor="#4e8f76" />
              <stop offset="66%" stopColor="#2f5d4c" />
              <stop offset="100%" stopColor="#162a23" />
            </linearGradient>
            {[["ccw", CCW_COLOUR], ["cw", CW_COLOUR], ["dead", DEAD_COLOUR]].map(([k, c]) => (
              <radialGradient key={k} id={`d3-disc-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={c} stopOpacity="0.02" />
                <stop offset="62%" stopColor={c} stopOpacity="0.10" />
                <stop offset="100%" stopColor={c} stopOpacity="0.26" />
              </radialGradient>
            ))}
            <filter id="d3-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="d3-softer" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="11" />
            </filter>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#d3-sky)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#d3-glow)" />

          {/* ── THE SCENE ────────────────────────────────────────────
              Every shape below comes from scene3d.js, which is also what
              tools/render-drone.mjs rasterises for the freeze gate. That
              is the whole point: the frozen PNG guards THIS drawing, not
              a second renderer's imitation of it. Gradients, the blur on
              the shadows and the text are applied here, because they are
              presentation rather than geometry. */}
          {scene.primitives.map((p, i) => {
            if (p.k === "line")
              return <line key={i} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]}
                           stroke={p.stroke} strokeWidth={p.width}
                           strokeDasharray={p.dash ?? undefined}
                           strokeLinecap={p.cap ?? undefined}
                           opacity={p.opacity ?? 1} />;
            if (p.k === "circle")
              return <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.r}
                             fill={p.fill ?? "none"} stroke={p.stroke ?? "none"}
                             strokeWidth={p.width ?? 0}
                             strokeDasharray={p.dash ?? undefined}
                             opacity={p.opacity ?? 1} />;
            const d = pathOf(p.pts) + (p.hole ? " " + pathOf(p.hole) : "");
            return <path key={i} d={d}
                         fill={p.gradient ? `url(#d3-${p.gradient})` : (p.fill ?? "none")}
                         fillOpacity={p.fillOpacity ?? 1}
                         fillRule={p.evenOdd ? "evenodd" : undefined}
                         stroke={p.stroke ?? "none"} strokeWidth={p.width ?? 0}
                         strokeOpacity={p.strokeOpacity ?? 1}
                         strokeDasharray={p.dash ?? undefined}
                         filter={p.blur ? "url(#d3-soft)" : undefined}
                         opacity={p.opacity ?? 1} />;
          })}

          {/* Labels and hit targets. Text is not geometry, so it is not in
              the scene and the freeze does not compare it. */}
          {air.rotors.map((r) => {
            const c = project(r, scene.v);
            const dead = failed.has(r.motor);
            const ctrl = control?.perRotor.find((p) => p.motor === r.motor);
            return (
              <g key={r.motor} onClick={() => setFailed((s) => {
                const n = new Set(s); n.has(r.motor) ? n.delete(r.motor) : n.add(r.motor); return n;
              })} style={{ cursor: "pointer" }}>
                <path d={pathOf(scene.discRings[r.motor])} fill="transparent" stroke="none" />
                <text x={c.sx} y={c.sy - 13} fill={VIEW.text} fontSize="11" fontFamily={MONO}
                      textAnchor="middle" stroke={VIEW.halo} strokeWidth="2.6" paintOrder="stroke">
                  {r.motor}{r.rotation === "CCW" ? "↺" : "↻"}
                </text>
                {ctrl && ctrl.controllable === false ? (
                  <text x={c.sx} y={c.sy + 22} fill={DEAD_COLOUR} fontSize="9" fontFamily={MONO}
                        textAnchor="middle" stroke={VIEW.halo} strokeWidth="2.6" paintOrder="stroke">
                    loss ⇒ uncontrollable
                  </text>
                ) : null}
                {dead ? null : null}
              </g>
            );
          })}

          {/* nose label — the marker line itself is in the scene */}
          {(() => {
            const n = project({ x: (air.armLengthM + air.propRadiusM) * 1.06, y: 0, z: 0 }, scene.v);
            return <text x={n.sx} y={n.sy - 8} fill={VIEW.amber} fontSize="11"
                         fontFamily={MONO} textAnchor="middle">nose</text>;
          })()}

          <text x={10} y={H - 24} fill={VIEW.muted} fontSize="10" fontFamily={MONO}>
            drag to orbit · click a rotor to fail it · grid 100 mm · orthographic
          </text>
          <text x={10} y={H - 10} fill={VIEW.muted} fontSize="10" fontFamily={MONO} opacity="0.85">
            {stator ? `stator ${stator.d}×${stator.h} mm published` : "motor size not published"}
            {cells ? ` · ${cells.cells.length} cells ${num(cells.diameterM * 1000, 1)}×${num(cells.heightM * 1000, 1)} mm published, layout declared` : ""}
            {" · pod and plane drop declared"}
          </text>
        </svg>

        <div style={{ minWidth: 250, flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Arm length", `${num(air.armLengthM * 1000, 0)} mm`, air.armIsMinimum ? "minimum for disc clearance" : "declared"],
                ["Tip-to-tip span", `${num(air.spanM * 1000, 0)} mm`, "computed"],
                ["Propeller", `${num(air.propRadiusM * 2 / 0.0254, 1)} in`, "measured diameter"],
                ["Tip gap", `${num(100 * air.tipGapFraction, 0)} %`, "DECLARED — nobody publishes theirs"],
                ["Smallest azimuth gap", `${num(air.smallestAngularGapDeg, 1)}°`, "from the flight code"],
                ["Arms", `${air.arms}`, air.isCoaxial ? `${air.motorsPerArm} motors per arm — COAXIAL` : "one motor each"],
                ["Total disc area", `${num(air.discAreaM2, 3)} m²`, "counts arms, not motors"],
                ["Spin balance", `${balance.cw} CW / ${balance.ccw} CCW`, balance.balanced ? "cancels" : "does NOT cancel"],
                ...(stator ? [["Motor stator", `${stator.d} × ${stator.h} mm`, "published — NOT the can, which nobody states"]] : []),
                ...(cells ? [["Cell", `${num(cells.diameterM * 1000, 1)} × ${num(cells.heightM * 1000, 1)} mm`, `published max · ${cells.cols}S${cells.rows}P laid out as drawn is DECLARED`]] : []),
                ...(sizing?.hover?.rpm ? [["Rotor speed", `${num(sizing.hover.rpm, 0)} rpm`, "sized hover — the animation runs at this, scaled"]] : []),
              ].map(([k, val, src]) => (
                <tr key={k}>
                  <td style={{ fontSize: T.label, color: SC.muted, padding: "3px 6px" }}>{k}</td>
                  <td style={{ fontSize: T.body, color: SC.text, fontFamily: MONO, textAlign: "right", padding: "3px 6px" }}>{val}</td>
                  <td style={{ fontSize: 10, color: SC.muted, padding: "3px 6px" }}>{src}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {air.coaxialUnmodelled ? (
            <div style={{ marginTop: S.sm, borderLeft: `2px solid ${SC.caution}`, paddingLeft: S.sm }}>
              <div style={{ fontSize: T.label, color: SC.caution, fontWeight: 600, marginBottom: 2 }}>
                Thrust for this frame is NOT supported by the measured data
              </div>
              <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                {air.coaxialUnmodelled}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: S.sm, borderTop: `1px solid ${SC.border}`, paddingTop: S.sm }}>
            <div style={{ fontSize: T.label, color: SC.text, fontWeight: 600, marginBottom: 4 }}>
              Rotor-loss controllability (ACAI)
            </div>
            {control == null ? (
              <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                Not computed — ACAI needs at least four rotors and a converged design.
              </div>
            ) : (
              <>
                <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5, marginBottom: 6 }}>
                  With the current failure set:{" "}
                  <b style={{ color: control.now?.controllable ? "#54c7a8" : "#e0574a" }}>
                    {control.now == null ? "not computable" : control.now.controllable ? "controllable" : "NOT controllable"}
                  </b>
                  {control.now?.acai != null ? ` (ACAI ${num(control.now.acai, 2)} N)` : ""}
                  {control.now?.fullRankButUncontrollable
                    ? " — full rank but uncontrollable, the result Du et al. published for the hexacopter" : ""}
                </div>
                <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.5 }}>
                  Single failures survivable:{" "}
                  {control.perRotor.filter((p) => p.controllable).length} of {control.perRotor.length}
                  {control.perRotor.every((p) => p.controllable === false) && air.rotors.length === 4
                    ? " — a quadrotor cannot be made single-failure controllable at any thrust margin: "
                      + "three remaining inputs cannot span four axes. That is structural, not a margin problem."
                    : ""}
                </div>
                <div style={{ fontSize: 10, color: SC.muted, lineHeight: 1.5, marginTop: 6 }}>
                  Du, Quan, Yang &amp; Cai, <i>Controllability Analysis for Multirotor Helicopter Rotor
                  Degradation and Failure</i>. Hover-linearised and fixed-pitch. It answers whether a
                  trimming thrust set exists — not whether the aircraft recovers, and it says nothing
                  about the transient.
                </div>
              </>
            )}
          </div>

          <button onClick={() => setSpinning((s) => !s)}
            style={{ marginTop: S.sm, background: SC.panel, color: SC.text, border: `1px solid ${SC.border}`,
                     borderRadius: 4, padding: "4px 10px", fontSize: T.label, cursor: "pointer", fontFamily: SANS }}>
            {spinning ? "pause rotors" : "spin rotors"}
          </button>
          {failed.size ? (
            <button onClick={() => setFailed(new Set())}
              style={{ marginTop: S.sm, marginLeft: 6, background: SC.panel, color: SC.text,
                       border: `1px solid ${SC.border}`, borderRadius: 4, padding: "4px 10px",
                       fontSize: T.label, cursor: "pointer", fontFamily: SANS }}>
              clear {failed.size} failure{failed.size === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
