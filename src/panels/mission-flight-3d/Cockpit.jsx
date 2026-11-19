/* =====================================================================
   COCKPIT — the test flight's instruments
   =====================================================================
   Five instruments under the 3D flight: airspeed, altitude, vertical
   speed, power and the phase annunciator. Every needle is a number the
   sizing produced (flight-view.js, instrumentsAt); each dial's full scale
   is the largest value this aircraft's own mission reaches, rounded up
   (instrumentScales), so the dials are this aircraft's.

   Power keeps the 3D flight's labelling: in vertical take-off and landing
   it is Phov, a rotor SHAFT power (audit finding F-13), and the dial says
   so; in the other phases it is electrical power.

   The annunciator lamp shows the worst flag on the phase being flown:
   red, a design check fails; amber, an advisory; grey, something the
   model leaves out; green, no check flags this phase.

   The look is the glass cockpit's (ui/glass.jsx): a glass card, recessed
   dial faces, the needle in the accent, and the lamp a lit dome.
   ===================================================================== */
import { SC, DARK } from "../../lib/theme.js";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const START = 135, SWEEP = 270;                    // degrees, clockwise from 3 o'clock
const rad = (d) => (d * Math.PI) / 180;
const at = (cx, cy, r, d) => [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))];
const fmt = (x, n = 0) => (x == null || !isFinite(x) ? "—" : x.toFixed(n));
export const LAMP = Object.freeze({ red: "#d64545", amber: "#e0a526", grey: "#8a96a3", green: "#2f9e6a" });
/* The same verdicts as the glass lamps' states (ui/glass.jsx). */
export const LAMP_STATE = Object.freeze({ red: "warning", amber: "caution", grey: "off", green: "nominal" });

/* Major ticks that land on round numbers for every full scale niceCeil
   gives (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 times a power of ten). */
const niceStep = (st) => { const m = st / 10 ** Math.floor(Math.log10(st) + 1e-9); return [1, 2, 2.5, 5, 10].some((k) => Math.abs(m - k) < 1e-6); };
function majorsFor(span, signed) {
  /* A signed dial keeps an even count, so zero is a major tick. */
  for (const n of signed ? [4, 6, 2] : [4, 5, 3, 6]) if (span > 0 && niceStep(span / n)) return n;
  return 4;
}

function arcPath(cx, cy, r, d0, d1) {
  const [x0, y0] = at(cx, cy, r, d0), [x1, y1] = at(cx, cy, r, d1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/* One round dial. `lo..hi` is the scale; `value` null parks the needle
   and blanks the readout (on the ground, after landing). */
function Dial({ name, value, lo, hi, unit, digits = 0, sub, signed = false, ticks = majorsFor(hi - lo, signed), readout }) {
  const dark = SC.bg === DARK.bg;
  const frac = value == null ? null : Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const cx = 60, cy = 60, R = 50;
  const needle = frac == null ? START : START + frac * SWEEP;
  const [nx, ny] = at(cx, cy, R - 9, needle);
  const marks = [];
  for (let i = 0; i <= ticks * 5; i++) {
    const d = START + (i / (ticks * 5)) * SWEEP, major = i % 5 === 0;
    const [ax, ay] = at(cx, cy, R, d), [bx, by] = at(cx, cy, R - (major ? 8 : 4), d);
    marks.push(<line key={`t${i}`} x1={ax} y1={ay} x2={bx} y2={by} stroke={dark ? "#c8d8e8" : "#1b2a3a"} strokeWidth={major ? 1.6 : 0.8} />);
    if (major) {
      const v = lo + (i / (ticks * 5)) * (hi - lo), [tx, ty] = at(cx, cy, R - 16, d);
      marks.push(<text key={`l${i}`} x={tx} y={ty + 3} textAnchor="middle" fontSize="8.5" fill={dark ? "#9fb3c8" : "#41556b"} fontFamily={MONO}>
        {signed && v > 0 ? "+" : ""}{Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toPrecision(3))}</text>);
    }
  }
  return (
    <figure data-instrument={name} aria-label={`${name}: ${readout ?? `${fmt(value, digits)} ${unit}`}`} style={{ margin: 0, textAlign: "center" }}>
      <svg viewBox="0 0 120 112" width="100%" style={{ maxWidth: 150, display: "block", margin: "0 auto" }} aria-hidden="true">
        <defs>
          <radialGradient id={`face-${name.replace(/\W/g, "")}`} cx="50%" cy="42%" r="62%">
            <stop offset="0" stopColor={dark ? "#132030" : "#FFFFFF"} />
            <stop offset="1" stopColor={dark ? "#070D15" : "#E3EAF1"} />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R + 6} fill="none" stroke={dark ? "#2A3A4C" : "#C3CFDB"} strokeWidth="2" />
        <circle cx={cx} cy={cy} r={R + 5} fill={`url(#face-${name.replace(/\W/g, "")})`} stroke={SC.rim ?? SC.border} />
        <path d={arcPath(cx, cy, R, START, START + SWEEP)} fill="none" stroke={SC.border} strokeWidth="1" />
        {signed && <line x1={at(cx, cy, R, START + SWEEP / 2)[0]} y1={at(cx, cy, R, START + SWEEP / 2)[1]} x2={at(cx, cy, R - 12, START + SWEEP / 2)[0]} y2={at(cx, cy, R - 12, START + SWEEP / 2)[1]} stroke={SC.subtle} strokeWidth="2" />}
        {marks}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={value == null ? SC.subtle : (SC.accent ?? SC.amber)} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4.5" fill={dark ? "#C8D8E8" : "#41556B"} stroke={SC.rim ?? SC.border} />
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="13" fontWeight="700" fill={SC.text} fontFamily={MONO}>{readout ?? `${signed && value > 0 ? "+" : ""}${fmt(value, digits)}`}</text>
        <text x={cx} y={cy + 37} textAnchor="middle" fontSize="8" fill={SC.muted} fontFamily={MONO}>{unit}</text>
      </svg>
      <figcaption style={{ fontSize: 10, color: SC.muted, lineHeight: 1.35, marginTop: 2 }}>
        <b style={{ color: SC.text, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 9.5 }}>{name}</b>
        {sub ? <div>{sub}</div> : null}
      </figcaption>
    </figure>
  );
}

export function Cockpit({ inst, scales, lamp, lampText, time }) {
  if (!inst || !scales) return null;
  const kt = inst.airspeedMS == null ? null : inst.airspeedMS * 1.943844;
  const shaft = inst.powerKind === "shaft";
  return (
    <div data-cockpit="" className="gc-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10, alignItems: "start",
      background: SC.panel, border: `1px solid ${SC.rim ?? SC.border}`, borderRadius: 12, padding: "10px 10px 8px", marginTop: 8 }}>
      <Dial name="Airspeed" value={inst.airspeedMS} lo={0} hi={scales.airspeedMS} unit="m/s" digits={1}
        sub={kt == null ? "on the ground" : `${kt.toFixed(0)} kt`} />
      <Dial name="Altitude" value={inst.altitudeM} lo={0} hi={scales.altitudeM} unit="m above the pad" />
      <Dial name="Vertical speed" value={inst.verticalSpeedMS} lo={-scales.verticalSpeedMS} hi={scales.verticalSpeedMS} unit="m/s" digits={1} signed
        sub={inst.verticalSpeedMS == null ? "on the ground" : inst.verticalSpeedMS > 0 ? "climbing" : inst.verticalSpeedMS < 0 ? "descending" : "level"} />
      <Dial name="Power" value={inst.powerKW} lo={0} hi={scales.powerKW} unit={inst.powerKW == null ? "kW" : shaft ? "kW shaft" : "kW electrical"}
        sub={inst.powerKW == null ? "on the ground" : shaft ? "Phov, rotor shaft power (F-13)" : "battery power"} />
      <figure data-instrument="Phase" aria-label={`Phase: ${inst.flying ? inst.label : "landed"}. ${lampText}`} style={{ margin: 0, alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6,
        borderRadius: 10, padding: "10px 8px", textAlign: "center" }} className="gc-well">
        <div style={{ fontSize: 9.5, color: SC.text, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Phase</div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: SC.text }}>{inst.flying ? inst.label : "Landed"}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 10.5, color: SC.muted }}>
          <span aria-hidden="true" className="gc-lamp" data-state={LAMP_STATE[lamp] ?? "nominal"} style={{ width: 11, height: 11, borderRadius: "50%", background: LAMP[lamp] ?? LAMP.green }} />
          <span>{lampText}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: SC.muted }}>{time}</div>
      </figure>
    </div>
  );
}
