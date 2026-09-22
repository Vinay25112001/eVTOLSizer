/* =====================================================================
   FUSELAGE VIEWS — the internal arrangement, drawn to the section 4.5 rule
   =====================================================================
   Two drawings over fuselage-structure.js:

     FuselageProfile   side elevation: the shell, every frame, the heavy
                       frames at the attachments, both pressure bulkheads,
                       the floor line and the wing carry-through
     FuselageSection   one cross-section: the shell, the stringers around
                       it, the floor and beam, and the 14 CFR 25.365(e)(2)
                       decompression opening drawn to scale against it

   THE COLOUR IS THE ARGUMENT. STRUCTURAL-LAYOUT.md section 4.5 asks for
   exactly two kinds of line and nothing else, so the two are coloured
   apart and the legend says which is which:

     SC.primary   a computed quantity - the shell, the counts, the panel,
                  the vent area
     SC.caution   a sourced convention - the frame and stringer pitches,
                  the floor drop, the spar percent-chord

   Nothing is drawn in a third colour, because nothing else is drawn. The
   features with neither a computed driver nor a source are listed in the
   tab as text, under `notDrawn`, rather than appearing here as plausible
   lines with no provenance.
   ===================================================================== */

import { SC } from "../../lib/theme.js";
import { MONO } from "../../ui/tokens.js";
import { fuselageSideOutline, outlinePath } from "./geometry.js";

const IN = 0.0254;

/* ── side elevation ───────────────────────────────────────────────────── */
export function FuselageProfile({ fus, height = 300 }) {
  if (!fus) return null;
  const L = fus.shell.lengthM, H = fus.shell.heightM;
  const nose = fus.shell.noseLengthM, tail = fus.shell.tailConeLengthM;
  const padX = L * 0.03;
  const W = L + 2 * padX;
  /* Vertical room: the shell itself, a line of type above it and two
     staggered rows of attachment labels below. Any more than that and the
     aeroplane ends up a stripe in the middle of an empty box. */
  const u = W / 1000;
  const headroom = u * 22, footroom = u * 58;
  const VH = H + headroom + footroom;
  const X = (x) => padX + x;
  const cz = headroom + H / 2;                      // centreline in view coordinates
  const Z = (z) => cz - z;                          // z up, view y down
  const top = Z(H / 2), bot = Z(-H / 2);
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 15 };
  const small = { ...txt, fontSize: u * 12, fill: SC.dim };

  /* The shell: a rounded nose, a constant-section barrel and an upswept
     tail cone. The curve comes from geometry.js so this profile, the
     general arrangement and the station diagram cannot draw the same body
     three different ways — which they did until the outline was hoisted.
     The tail-cone closure is an unsourced convention and carries no
     dimension line. Straight-sided cones drawn from the same numbers read
     as a dart rather than an aeroplane. */
  const outline = outlinePath(
    fuselageSideOutline({ length: L, height: H, noseLength: nose, tailLength: tail }), X, Z);

  const fwdX = fus.pressure.applies ? fus.pressure.fwdX : nose;
  const aftX = fus.pressure.applies ? fus.pressure.aftX : L - tail;
  const floorZ = fus.floor.present ? fus.floor.zM : null;

  return (
    <svg viewBox={`0 0 ${W} ${VH}`} style={{ width: "100%", height, display: "block" }} role="img"
         aria-label={`Fuselage side elevation: ${fus.frames.drawn ? `${fus.frames.count} frames` : "shell only"}`}>
      <path d={outline} fill={SC.panel} fillOpacity={0.4} stroke={SC.dim} strokeWidth={u * 1.3} />
      <line x1={X(0)} y1={Z(0)} x2={X(L)} y2={Z(0)} stroke={SC.dim} strokeWidth={u * 0.5}
            strokeDasharray={`${u * 8} ${u * 4} ${u * 2} ${u * 4}`} />

      {/* frames */}
      {fus.frames.drawn && fus.frames.stations.map((s) => (
        <line key={`f${s.i}`} x1={X(s.x)} y1={top} x2={X(s.x)} y2={bot}
              stroke={SC.caution} strokeWidth={u * 0.7} opacity={0.55} />
      ))}

      {/* heavy frames at the attachments, labelled on two staggered rows
          with a leader so four labels over forty metres stay legible */}
      {fus.heavy.map((h, i) => {
        const x = h.xFrame ?? h.x;
        if (x < 0 || x > L) return null;
        const row = i % 2, ly = bot + u * 16 + row * u * 15;
        return (
          <g key={`h${i}`}>
            <line x1={X(x)} y1={top} x2={X(x)} y2={bot} stroke={SC.warning} strokeWidth={u * 2.4} opacity={0.9} />
            <line x1={X(x)} y1={bot} x2={X(x)} y2={ly - u * 9} stroke={SC.warning} strokeWidth={u * 0.5} opacity={0.5} />
            <text x={X(x)} y={ly} {...small} fill={SC.warning} textAnchor="middle">{h.label}</text>
          </g>
        );
      })}

      {/* pressure bulkheads */}
      {fus.pressure.applies && [["fwd", fwdX], ["aft", aftX]].map(([k, x]) => (
        <line key={k} x1={X(x)} y1={top} x2={X(x)} y2={bot} stroke={SC.primary} strokeWidth={u * 3} />
      ))}

      {/* floor */}
      {floorZ !== null && (
        <>
          <rect x={X(fwdX)} y={Z(floorZ)} width={aftX - fwdX} height={Math.max(u * 1.5, fus.floor.thicknessM)}
                fill={SC.advisory} fillOpacity={0.5} stroke={SC.caution} strokeWidth={u * 0.8} />
          {/* In the headroom, not across the structure, and kept short: on
              the shorter classes a full sentence here runs into the frame
              label coming the other way. */}
          <text x={X(L)} y={u * 15} {...small} fill={SC.caution} textAnchor="end">
            floor −{fus.floor.dropM.toFixed(2)} m
          </text>
        </>
      )}

      {/* labels */}
      <text x={X(0)} y={u * 15} {...txt}>
        {fus.frames.drawn
          ? `${fus.frames.count} frames at ${(fus.frames.pitchM / IN).toFixed(1)} in`
          : "frames not drawn — no published pitch for this class"}
      </text>
      <text x={X(0)} y={VH - u * 5} {...small} fontSize={u * 11}>
        {fus.pressure.applies ? `pressurized shell ${fus.pressure.shellLengthM.toFixed(1)} m · ` : ""}
        computed: shell, counts, panel · convention: frame pitch, floor drop, nose and tail-cone length,
        and every station’s absolute position
      </text>
    </svg>
  );
}

/* ── cross-section ────────────────────────────────────────────────────── */
export function FuselageSection({ fus, height = 300 }) {
  if (!fus) return null;
  const w = fus.shell.widthM, h = fus.shell.heightM;
  const padX = w * 0.10, W = w + 2 * padX;
  /* The section is taller than it is wide, so it renders height-limited and
     the type must be scaled off the depth. Scaling it off the width, as the
     side elevation does, sets it at about six pixels. */
  const u = h / 260;
  /* Headroom carries one label only. Everything else is stacked under the
     dimension line, because the section is barely wider than it is tall and
     two labels in the same band run into each other. */
  const headroom = u * 20, footroom = u * 64;
  const VH = h + headroom + footroom;
  const cx = W / 2, cy = headroom + h / 2;
  const a = w / 2, b = h / 2;
  const txt = { fill: SC.subtle, fontFamily: MONO, fontSize: u * 15 };
  const small = { ...txt, fontSize: u * 12, fill: SC.dim };

  /* Stringers, evenly spaced around the perimeter. Parameterising the
     ellipse by angle would bunch them at the ends, so the spacing is done
     by arc length: walk the perimeter in equal steps. */
  const n = fus.stringers.count;
  const pts = [];
  {
    const STEPS = 4000;
    const xs = [];
    let s = 0, px = a, py = 0;
    for (let i = 1; i <= STEPS; i++) {
      const t = (2 * Math.PI * i) / STEPS;
      const qx = a * Math.cos(t), qy = b * Math.sin(t);
      s += Math.hypot(qx - px, qy - py);
      xs.push({ s, x: qx, y: qy });
      px = qx; py = qy;
    }
    const total = s;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const target = (total * i) / n;
      while (k < xs.length - 1 && xs[k].s < target) k++;
      pts.push([cx + xs[k].x, cy - xs[k].y]);
    }
  }

  const floorZ = fus.floor.present ? fus.floor.zM : null;
  /* Half-width of the floor where it cuts the ellipse. */
  const floorHalf = floorZ !== null && Math.abs(floorZ) < b
    ? a * Math.sqrt(Math.max(0, 1 - (floorZ / b) * (floorZ / b))) : null;

  /* The 25.365(e)(2) opening, as a square of the same area, to scale. */
  const vent = fus.pressure.applies ? fus.pressure.vent : null;
  const ventSide = vent ? Math.sqrt(vent.hoM2) : null;

  return (
    <svg viewBox={`0 0 ${W} ${VH}`} style={{ width: "100%", height, display: "block" }} role="img"
         aria-label={`Fuselage cross-section: ${n} stringers, ${fus.shell.crossSectionFt2.toFixed(0)} sq ft`}>
      <ellipse cx={cx} cy={cy} rx={a} ry={b} fill={SC.panel} fillOpacity={0.45}
               stroke={SC.primary} strokeWidth={u * 1.6} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={u * 3} fill={SC.caution} opacity={0.9} />
      ))}

      {floorHalf !== null && (
        <>
          <rect x={cx - floorHalf} y={cy - floorZ} width={2 * floorHalf}
                height={Math.max(u * 1.5, fus.floor.thicknessM)}
                fill={SC.advisory} fillOpacity={0.55} stroke={SC.caution} strokeWidth={u} />
          <text x={cx} y={cy - floorZ - u * 5} {...small} fill={SC.caution} textAnchor="middle">
            floor beam
          </text>
        </>
      )}

      {vent && (
        <g>
          <rect x={cx - ventSide / 2} y={cy - b * 0.46} width={ventSide} height={ventSide}
                fill={SC.warning} fillOpacity={0.28} stroke={SC.warning} strokeWidth={u * 1.2}
                strokeDasharray={`${u * 4} ${u * 3}`} />
          {/* In the headroom, with a leader — written across the section it
              collided with the shell and with the stringers. */}
          <line x1={cx} y1={cy - b * 0.46} x2={cx} y2={u * 19} stroke={SC.warning}
                strokeWidth={u * 0.5} opacity={0.5} />
          <text x={W - u * 2} y={u * 15} {...small} fill={SC.warning} textAnchor="end">
            H₀ {vent.hoFt2.toFixed(2)} ft²{vent.capped ? " (capped)" : ""}, to scale
          </text>
        </g>
      )}

      {/* dimensions */}
      <line x1={cx - a} y1={cy + b + u * 14} x2={cx + a} y2={cy + b + u * 14}
            stroke={SC.subtle} strokeWidth={u * 0.9} />
      <text x={cx} y={cy + b + u * 30} {...txt} textAnchor="middle">
        {w.toFixed(2)} m wide × {h.toFixed(2)} m deep · A_s {fus.shell.crossSectionFt2.toFixed(1)} ft²
      </text>
      <text x={cx} y={cy + b + u * 48} {...small} fill={SC.caution} textAnchor="middle">
        {n} stringers at {(fus.stringers.pitchM / IN).toFixed(2)} in
      </text>
      <text x={cx} y={cy + b + u * 61} {...small} fontSize={u * 11} textAnchor="middle">
        pitch: convention · count, area: computed
      </text>
    </svg>
  );
}
