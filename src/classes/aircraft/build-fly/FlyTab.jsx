/* =====================================================================
   FLY · MISSION — the sized mission, replayed in 3D
   =====================================================================
   The aircraft studio's counterpart to the eVTOL mission flight: the
   aeroplane from the Build tab flown along the mission this class sized,
   at true scale, from the departure runway to the arrival runway.

   WHAT IS COMPUTED AND WHAT IS DRAWN is the point of this tab, and
   mission-profile.js decides it. Every time, distance and fuel printed is
   the sizing's (or, for one trainer cruise time, arithmetic on two of
   them, and marked). A phase the class does not size is drawn so the
   flight is whole, and prints "not computed" instead of a number. The
   replay clock is not to scale and says so; position inside a phase is a
   straight line between its computed ends and says so.

   Free flight -- throttle, pitch, bank -- needs flight mechanics this
   class does not have (a clean CLmax, drag at off-design conditions). It
   is not here.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { useDarkMode } from "../../../lib/display.js";
import { useUnitSystem } from "../../../lib/unit-system.jsx";
import { T, S, SANS, MONO } from "../../../ui/tokens.js";
import { fmt } from "../../ui-kit.jsx";
import { buildPlanOf } from "./plan.js";
import { missionProfileOf, profileAt, legStarts, pathPoints, PLAY_SECONDS, DRAWN_ROLL_M } from "./mission-profile.js";
import { ProvChip, Num, chip, primaryBtn, panel, kicker, useLazyScene } from "./ui.jsx";

const SPEEDS = [1, 2, 4];
const CAMERA_LABEL = { chase: "Chase", side: "Side", orbit: "Orbit (drag)" };
const SPIN_RAD_PER_S = 28;           // a drawn propeller turn rate, for the eye only
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const NOT = () => <span style={{ color: SC.muted }}>not computed</span>;

/* A "nice" axis step: 1, 2 or 5 × 10^k. */
function niceStep(range, ticks = 5) {
  const raw = range / ticks, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

export function AircraftFlyTab({ result, setTab }) {
  const dark = useDarkMode();
  const { system } = useUnitSystem();
  const plan = useMemo(() => buildPlanOf(result), [result]);
  const profile = useMemo(() => missionProfileOf(result), [result]);
  const ok = plan.ok && profile.ok;
  const path = useMemo(() => (ok ? pathPoints(profile) : []), [ok, profile]);
  const starts = useMemo(() => (ok ? legStarts(profile) : []), [ok, profile]);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState("chase");
  const [hover, setHover] = useState(null);
  const tRef = useRef(0), spinRef = useRef(0), canvasRef = useRef(null);
  const live = useRef(null);
  live.current = { plan, profile, path, dark, cam, speed };

  const api = useLazyScene(canvasRef, ok, (m, canvas) => {
    const L = live.current;
    const a = m.mountFly({ canvas, plan: L.plan, path: L.path, trackM: L.profile.trackM, rollM: DRAWN_ROLL_M, dark: L.dark });
    a.setCamera(L.cam);
    a.seek(profileAt(L.profile, tRef.current), spinRef.current);
    return a;
  });

  /* A new sizing: the same scene, a new aeroplane and track. */
  useEffect(() => {
    if (!ok) return;
    tRef.current = Math.min(tRef.current, profile.playSeconds);
    setT(tRef.current);
    api.current?.setMission({ plan, path, trackM: profile.trackM });
    api.current?.seek(profileAt(profile, tRef.current), spinRef.current);
  }, [plan, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setCamera(cam); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setDark(dark); }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The replay clock. The scene moves every frame; the page's readouts
     follow ten times a second, which is all a reader can see. */
  useEffect(() => {
    if (!playing || !ok) return undefined;
    let raf = 0, prev = performance.now(), lastUi = 0;
    const tick = (now) => {
      const { profile: P, speed: k } = live.current;
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      tRef.current = Math.min(P.playSeconds, tRef.current + dt * k);
      spinRef.current += dt * SPIN_RAD_PER_S;
      api.current?.seek(profileAt(P, tRef.current), spinRef.current);
      const done = tRef.current >= P.playSeconds;
      if (done || now - lastUi > 100) { lastUi = now; setT(tRef.current); }
      if (done) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) {
    return <section style={panel()}><div style={kicker()}>Fly · mission</div>
      <p style={{ color: SC.warning, fontSize: T.body, fontFamily: SANS }}>{plan.ok ? profile.refusal : plan.refusal}</p></section>;
  }

  const seekTo = (s) => {
    tRef.current = Math.max(0, Math.min(profile.playSeconds, s));
    setT(tRef.current);
    api.current?.seek(profileAt(profile, tRef.current), spinRef.current);
  };
  const play = () => { if (tRef.current >= profile.playSeconds) seekTo(0); setPlaying((p) => !p); };
  const now = profileAt(profile, t);
  const leg = now.leg;

  return (
    <section style={panel()} aria-label="Fly the sized mission">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: S.sm }}>
        <div>
          <div style={kicker()}>Fly · mission · {plan.label}</div>
          <h2 style={{ margin: `${S.xs}px 0 0`, fontSize: T.lead, fontFamily: SANS, color: SC.text, fontWeight: 600 }}>
            {leg.label}
          </h2>
        </div>
        <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
          True scale · replay clock not to scale
        </div>
      </div>

      <dl style={{ display: "flex", flexWrap: "wrap", gap: `${S.sm}px ${S.xl}px`, margin: `${S.md}px 0`, fontFamily: SANS }}>
        <Stat k="Cruise speed"><Num v={profile.kt} u="kt" /></Stat>
        <Stat k="Cruise altitude"><Num v={profile.altFt} u="ft" /></Stat>
        {Number.isFinite(profile.mach) && <Stat k="Cruise Mach">{fmt(profile.mach, 3)}</Stat>}
        {profile.belowAsked && <Stat k="Top of climb, flown"><Num v={profile.cruiseFt} u="ft" /></Stat>}
        <Stat k={profile.missionIsDesign ? "Design mission distance" : "Mission distance, sized"}><Num v={profile.missionNm} u="nm" /></Stat>
        <Stat k="Flight time, sized">{Number.isFinite(profile.flightMinutes) ? `${fmt(profile.flightMinutes, 0)} min` : <NOT />}</Stat>
      </dl>

      {profile.missionIsDesign && (
        <p style={{ fontSize: T.body, color: SC.caution, fontFamily: SANS, margin: `0 0 ${S.md}px`, lineHeight: 1.5 }}>
          Analysed: this replay flies the design mission at this weight, which needs{" "}
          <Num v={profile.legs.reduce((a, l) => a + (Number.isFinite(l.kg) ? l.kg : 0), 0) + profile.reserves.reduce((a, r) => a + r.kg, 0)} u="kg" /> of fuel.
          This aircraft carries <Num v={profile.fuelCarriedKg} u="kg" /> and, keeping the same reserves, reaches{" "}
          <Num v={profile.reachNm} u="nm" /> on it.
        </p>
      )}

      {profile.belowAsked && (
        <p style={{ fontSize: T.body, color: SC.caution, fontFamily: SANS, margin: `0 0 ${S.md}px`, lineHeight: 1.5 }}>
          The sized climb levels off below the cruise altitude asked for. The sizing cruises and starts its descent from
          where the climb ended, and so does this replay.
        </p>
      )}

      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", minHeight: 300, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${SC.border}`, background: SC.inset }}>
        <canvas ref={canvasRef} role="img" aria-label={`The sized ${plan.label} flying its mission: ${leg.label.toLowerCase()}`}
                style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        <div style={{ position: "absolute", left: 12, top: 10, padding: "8px 12px", borderRadius: 8, background: SC.panelSolid,
                      border: `1px solid ${SC.border}`, fontFamily: SANS, fontSize: T.label, color: SC.text, maxWidth: "70%" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b>{leg.label}</b><ProvChip prov={leg.prov} title={leg.why ?? undefined} />
            <span style={{ color: SC.muted }}>phase {now.i + 1} of {profile.legs.length}</span>
          </div>
          <LegFacts leg={leg} inline />
        </div>
        <div style={{ position: "absolute", right: 12, top: 10, fontFamily: MONO, fontSize: T.label, color: SC.muted }}>
          replay {clock(t)} / {clock(profile.playSeconds)} · {speed}×
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: S.sm, margin: `${S.md}px 0 ${S.sm}px` }}>
        <button type="button" style={primaryBtn()} onClick={play} aria-pressed={playing}>{playing ? "❚❚ Pause" : t > 0 && t < profile.playSeconds ? "▶ Resume" : "▶ Fly"}</button>
        <button type="button" style={chip(false)} onClick={() => { setPlaying(false); seekTo(0); }}>↺ Restart</button>
        <span style={{ width: 1, height: 22, background: SC.border, margin: "0 4px" }} />
        {SPEEDS.map((k) => <button key={k} type="button" style={chip(k === speed)} aria-pressed={k === speed} onClick={() => setSpeed(k)}>{k}×</button>)}
        <span style={{ width: 1, height: 22, background: SC.border, margin: "0 4px" }} />
        {Object.entries(CAMERA_LABEL).map(([k, l]) => <button key={k} type="button" style={chip(k === cam)} aria-pressed={k === cam} onClick={() => setCam(k)}>{l}</button>)}
      </div>
      <input type="range" min={0} max={profile.playSeconds} step={0.1} value={t} aria-label="Replay position"
             onChange={(e) => { setPlaying(false); seekTo(Number(e.target.value)); }} style={{ width: "100%", accentColor: SC.caution }} />
      <nav aria-label="Mission phases" style={{ display: "flex", flexWrap: "wrap", gap: S.xs, margin: `${S.sm}px 0 ${S.md}px` }}>
        {profile.legs.map((l, k) => (
          <button key={l.key} type="button" style={chip(k === now.i)} aria-current={k === now.i ? "step" : undefined}
                  onClick={() => { setPlaying(false); seekTo(starts[k] + 0.01); }}>{k + 1} {l.label}</button>
        ))}
      </nav>

      <ProfileChart profile={profile} path={path} now={now} system={system} hover={hover} setHover={setHover}
        onSeek={(s) => { setPlaying(false); seekTo(s); }} starts={starts} />

      <h3 style={{ fontSize: T.value, fontFamily: SANS, color: SC.text, margin: `${S.lg}px 0 ${S.sm}px`, fontWeight: 600 }}>The phases, and where each number comes from</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.body, fontFamily: SANS, minWidth: 620 }}>
          <thead>
            <tr style={{ color: SC.muted, fontSize: T.label, textAlign: "left" }}>
              {["Phase", "Time", "Distance", "Fuel", "Source"].map((h) => <th key={h} style={{ padding: "6px 8px", fontWeight: 500 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {profile.legs.map((l, k) => (
              <tr key={l.key} style={{ borderTop: `1px solid ${SC.border}`, background: k === now.i ? SC.inset : "transparent" }}>
                <td style={{ padding: "6px 8px", color: SC.text }}>{l.label}</td>
                <LegFacts leg={l} />
                <td style={{ padding: "6px 8px" }}>
                  <ProvChip prov={l.prov} />
                  {l.why && <span style={{ marginLeft: 8, fontSize: T.label, color: SC.muted }}>{l.why}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(profile.reserves.length > 0 || profile.other.length > 0) && (
        <div style={{ marginTop: S.md, fontSize: T.body, fontFamily: SANS, color: SC.text }}>
          <div style={{ ...kicker(), marginBottom: S.xs }}>Carried, not flown</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {profile.reserves.map((r) => (
              <li key={r.name}>{r.name}: <Num v={r.kg} u="kg" />{Number.isFinite(r.minutes) ? ` · ${fmt(r.minutes, 0)} min` : ""} <span style={{ color: SC.muted }}>(reserve)</span></li>
            ))}
            {profile.other.map((o) => (
              <li key={o.name}>{o.name}: <Num v={o.kg} u="kg" />{" "}
                <span style={{ color: SC.muted }}>(booked by the sizing; not a phase this replay flies)</span></li>
            ))}
          </ul>
        </div>
      )}

      <ul style={{ margin: `${S.md}px 0 0`, paddingLeft: 18, fontSize: T.label, color: SC.muted, fontFamily: SANS, lineHeight: 1.7 }}>
        <li>The replay clock is not to scale. Each phase gets a fixed share of the replay at 1×: take-off {PLAY_SECONDS.ground} s,
            climb {PLAY_SECONDS.climb} s, cruise {PLAY_SECONDS.cruise} s, descent {PLAY_SECONDS.descent} s and landing {PLAY_SECONDS.landing} s.
            The times in the table are the sizing's.</li>
        <li>Between a phase's two computed ends the path is a straight line, so the aeroplane's position inside a phase, and the
            nose-up or nose-down angle you see, come from the drawing, not from flight mechanics.</li>
        <li>The aeroplane, the distances and the heights in the 3D view are at true scale. The runways, the ground, the pylons,
            the gear struts and the propeller blades are drawn.</li>
        <li>This replay flies itself. To fly the aeroplane yourself (throttle, pitch, bank), open Fly · yourself: it starts at
            the sized cruise point and adds a point-mass flight model, a clean maximum lift coefficient and a roll rate, each
            with its source on that tab.</li>
      </ul>

      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: S.md }}>
        <button type="button" style={chip(false)} onClick={() => setTab?.("build")}>← Build it</button>
        <button type="button" style={{ ...chip(false), marginLeft: S.sm }} onClick={() => setTab?.("free")}>Fly it yourself →</button>
      </div>
    </section>
  );
}

function Stat({ k, children }) {
  return (
    <div>
      <dt style={{ fontSize: T.micro, color: SC.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: T.value, color: SC.text, fontVariantNumeric: "tabular-nums" }}>{children}</dd>
    </div>
  );
}

/* A phase's time, distance and fuel: as table cells, or as one line for
   the overlay. A number appears only where the sizing gave one. */
function LegFacts({ leg, inline = false }) {
  const time = Number.isFinite(leg.minutes)
    ? <>{fmt(leg.minutes, 0)} min{leg.prov === "derived" && <span style={{ color: SC.muted }}> (derived)</span>}</> : <NOT />;
  const dist = Number.isFinite(leg.nm) ? <Num v={leg.nm} u="nm" /> : <NOT />;
  const fuel = Number.isFinite(leg.kg)
    ? <><Num v={leg.kg} u="kg" />{leg.tripFuel ? <span style={{ color: SC.muted }}> (whole trip)</span> : leg.kgLabel ? <span style={{ color: SC.muted }}> ({leg.kgLabel})</span> : null}</>
    : <NOT />;
  if (inline) {
    return (
      <div style={{ marginTop: 4, color: SC.muted, fontVariantNumeric: "tabular-nums" }}>
        time {time} · distance {dist} · fuel {fuel}
      </div>
    );
  }
  const td = { padding: "6px 8px", color: SC.text, fontVariantNumeric: "tabular-nums" };
  return <><td style={td}>{time}</td><td style={td}>{dist}</td><td style={td}>{fuel}</td></>;
}

/* Height against distance along the track. One series, so no legend; a
   solid line where the phase's ends are the sizing's, dashed where the
   path is drawn. Height is stretched to be seen at all, and the caption
   says by how much. Hover names a phase; click moves the replay there. */
function ProfileChart({ profile, path, now, system, hover, setHover, onSeek, starts }) {
  const W = 1000, H = 190, pl = 56, pr = 14, pt = 14, pb = 34;
  const iw = W - pl - pr, ih = H - pt - pb;
  const SI = system === "SI";
  const xU = SI ? { k: 1 / 1000, u: "km" } : { k: 1 / 1852, u: "nm" };
  const yU = SI ? { k: 1, u: "m" } : { k: 1 / 0.3048, u: "ft" };
  const maxM = profile.trackM, maxH = Math.max(...path.map((p) => p[1])) * 1.18 || 1;
  const sx = (m) => pl + (m / maxM) * iw, sy = (h) => pt + ih - (h / maxH) * ih;
  const xs = niceStep(maxM * xU.k), ys = niceStep(maxH * yU.k, 3);
  const xt = []; for (let v = 0; v <= maxM * xU.k + 1e-9; v += xs) xt.push(v);
  const yt = []; for (let v = 0; v <= maxH * yU.k + 1e-9; v += ys) yt.push(v);
  const stretch = (maxM / maxH) / (iw / ih);
  const FT = 0.3048;

  const legAt = (m) => profile.legs.findIndex((l) => m >= l.fromM && m <= l.toM);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = ((e.clientX - r.left) / r.width * W - pl) / iw * maxM;
    if (m < 0 || m > maxM) { setHover(null); return; }
    const i = legAt(m);
    setHover(i >= 0 ? { i, m, px: (e.clientX - r.left) / r.width } : null);
  };
  const onClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = ((e.clientX - r.left) / r.width * W - pl) / iw * maxM;
    const i = legAt(Math.max(0, Math.min(maxM, m)));
    if (i < 0) return;
    const l = profile.legs[i];
    const f = (m - l.fromM) / Math.max(1, l.toM - l.fromM);
    onSeek(starts[i] + Math.max(0, Math.min(1, f)) * PLAY_SECONDS[l.kind]);
  };
  const hl = hover ? profile.legs[hover.i] : null;

  return (
    <figure style={{ margin: 0, position: "relative" }}>
      <figcaption style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS, marginBottom: 4 }}>
        Height along the track · height stretched about {fmt(stretch, 0)}× to be visible · dashed where the path is drawn, not computed · click to move the replay
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Height against distance along the track"
           style={{ display: "block", cursor: "pointer" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={pl} x2={W - pr} y1={sy(v / yU.k)} y2={sy(v / yU.k)} stroke={SC.border} strokeWidth={1} />
            <text x={pl - 6} y={sy(v / yU.k) + 4} textAnchor="end" fontSize={11} fill={SC.muted} fontFamily={MONO}>{fmt(v, 0)}</text>
          </g>
        ))}
        <text x={pl - 6} y={pt - 3} textAnchor="end" fontSize={11} fill={SC.muted} fontFamily={SANS}>{yU.u}</text>
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v / xU.k)} y={H - pb + 16} textAnchor="middle" fontSize={11} fill={SC.muted} fontFamily={MONO}>{fmt(v, 0)}</text>
        ))}
        <text x={W - pr} y={H - 4} textAnchor="end" fontSize={11} fill={SC.muted} fontFamily={SANS}>{xU.u} along the track</text>
        <line x1={pl} x2={W - pr} y1={sy(0)} y2={sy(0)} stroke={SC.muted} strokeWidth={1} />
        {hl && <rect x={sx(hl.fromM)} y={pt} width={Math.max(1, sx(hl.toM) - sx(hl.fromM))} height={ih} fill={SC.inset} />}
        {profile.legs.map((l) => (
          <line key={l.key} x1={sx(l.fromM)} y1={sy(l.fromFt * FT)} x2={sx(l.toM)} y2={sy(l.toFt * FT)}
                stroke={SC.blue} strokeWidth={2} strokeLinecap="round" strokeDasharray={l.prov === "sized" || l.prov === "derived" ? undefined : "5 5"} />
        ))}
        <line x1={sx(now.xM)} x2={sx(now.xM)} y1={pt} y2={pt + ih} stroke={SC.caution} strokeWidth={1} />
        <circle cx={sx(now.xM)} cy={sy(now.hM)} r={5} fill={SC.caution} stroke={SC.panelSolid} strokeWidth={2} />
      </svg>
      {hl && (
        <div role="tooltip" style={{ position: "absolute", top: 26, left: `${Math.min(70, Math.max(2, hover.px * 100))}%`, transform: "translateX(-10%)",
                                     padding: "6px 10px", borderRadius: 8, background: SC.panelSolid, border: `1px solid ${SC.border}`,
                                     fontFamily: SANS, fontSize: T.label, color: SC.text, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b>{hl.label}</b><ProvChip prov={hl.prov} /></div>
          <LegFacts leg={hl} inline />
        </div>
      )}
    </figure>
  );
}
