/* =====================================================================
   BUILD · GUIDED — the sized aeroplane, assembled step by step
   =====================================================================
   The aircraft studio's counterpart to the drone Build tab and the eVTOL
   build lab: the aeroplane this class sized, put together on a floor
   ruled in metres, one group of parts per step, with a person for scale.
   Every number printed comes from plan.js, which reads the general
   arrangement the drawing is made from; where a number is a drawing
   convention the table says "not computed" and why, and gives none.
   The last step hands over to the Fly tab.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../../lib/theme.js";
import { useDarkMode } from "../../../lib/display.js";
import { T, S, SANS } from "../../../ui/tokens.js";
import { buildPlanOf, STEP_GROUPS } from "./plan.js";
import { ProvChip, FactValue, chip, primaryBtn, panel, kicker, useLazyScene } from "./ui.jsx";

const pad2 = (i) => String(i + 1).padStart(2, "0");

export function AircraftBuildTab({ result, setTab }) {
  const dark = useDarkMode();
  const plan = useMemo(() => buildPlanOf(result), [result]);
  const [i, setI] = useState(0);
  const canvasRef = useRef(null);
  const live = useRef({ i, dark, plan });
  live.current = { i, dark, plan };

  const steps = plan.ok ? plan.steps : [];
  const step = steps[Math.min(i, Math.max(0, steps.length - 1))];
  const shownOf = (k) => STEP_GROUPS[k] ?? [];
  const highlightOf = (k) => (k === "ready" ? null : (STEP_GROUPS[k] ?? []).slice(-1)[0] ?? null);

  /* One scene per visit: a new sizing rebuilds the aeroplane on the same
     WebGL context rather than opening another. */
  const api = useLazyScene(canvasRef, plan.ok, (m, canvas) => {
    const { plan: p, i: k, dark: d } = live.current;
    const s = p.steps[Math.min(k, p.steps.length - 1)];
    return m.mountBuild({ canvas, plan: p, dark: d, groupsShown: shownOf(s.key), highlight: highlightOf(s.key) });
  });
  useEffect(() => { if (plan.ok) api.current?.setPlan(plan); }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step) api.current?.show(shownOf(step.key), highlightOf(step.key)); }, [step?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.setDark(dark); }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan.ok) {
    return <section style={panel()}><div style={kicker()}>Build · guided</div>
      <p style={{ color: SC.warning, fontSize: T.body, fontFamily: SANS }}>{plan.refusal}</p></section>;
  }
  const last = i === steps.length - 1;

  return (
    <section style={panel()} aria-label="Build the sized aeroplane">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: S.sm }}>
        <div>
          <div style={kicker()}>Build · guided · {plan.label}</div>
          <h2 style={{ margin: `${S.xs}px 0 0`, fontSize: T.lead, fontFamily: SANS, color: SC.text, fontWeight: 600 }}>
            {pad2(i)} · {step.heading}
          </h2>
        </div>
        <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS }}>
          True scale · floor ruled in metres (heavy line every 5 m) · person 1.8 m
        </div>
      </div>

      <nav aria-label="Build steps" style={{ display: "flex", flexWrap: "wrap", gap: S.xs, margin: `${S.md}px 0` }}>
        {steps.map((s, k) => (
          <button key={s.key} type="button" style={chip(k === i)} aria-current={k === i ? "step" : undefined} onClick={() => setI(k)}>
            {pad2(k)} {s.title}
          </button>
        ))}
      </nav>

      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", minHeight: 300, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${SC.border}`, background: SC.inset }}>
        <canvas ref={canvasRef} role="img" aria-label={`The sized ${plan.label}, ${step.title.toLowerCase()} step`}
                style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        <div style={{ position: "absolute", left: 12, bottom: 10, fontSize: T.label, color: SC.muted, fontFamily: SANS, pointerEvents: "none" }}>
          Drag to turn · scroll to zoom
        </div>
      </div>

      <p style={{ fontSize: T.body, color: SC.text, fontFamily: SANS, lineHeight: 1.6, margin: `${S.md}px 0 ${S.sm}px` }}>{step.blurb}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.body, fontFamily: SANS }}>
        <thead>
          <tr style={{ color: SC.muted, fontSize: T.label, textAlign: "left" }}>
            <th style={{ padding: "6px 8px", fontWeight: 500 }}>Part</th>
            <th style={{ padding: "6px 8px", fontWeight: 500 }}>Value</th>
            <th style={{ padding: "6px 8px", fontWeight: 500 }}>Where it comes from</th>
          </tr>
        </thead>
        <tbody>
          {step.facts.map((f) => (
            <tr key={f.label} style={{ borderTop: `1px solid ${SC.border}` }}>
              <td style={{ padding: "6px 8px", color: SC.text }}>{f.label}</td>
              <td style={{ padding: "6px 8px", color: SC.text, fontVariantNumeric: "tabular-nums" }}><FactValue f={f} /></td>
              <td style={{ padding: "6px 8px" }}>
                <ProvChip prov={f.prov} />
                {f.why && <span style={{ marginLeft: 8, fontSize: T.label, color: SC.muted }}>{f.why}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: S.md, gap: S.sm }}>
        <button type="button" style={chip(false)} disabled={i === 0} onClick={() => setI((k) => Math.max(0, k - 1))}>← Back</button>
        {last
          ? <button type="button" style={primaryBtn()} onClick={() => setTab?.("fly")}>Fly it →</button>
          : <button type="button" style={primaryBtn()} onClick={() => setI((k) => Math.min(steps.length - 1, k + 1))}>Next: {steps[i + 1].title} →</button>}
      </div>
    </section>
  );
}
