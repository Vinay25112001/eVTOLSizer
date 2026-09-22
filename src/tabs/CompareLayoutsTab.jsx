import { useState } from "react";
import { SC } from "../lib/theme.js";
import { compareConfigurations } from "../engine/explore.js";
import * as CFG from "../engine/configuration.js";
import { runSizing } from "../engine";
import { engineInputs } from "../lib/designfile.js";

/* Tab 26 - COMPARE LAYOUTS.
   Sizing all six configurations on ONE mission is the question this tool exists
   to answer, and it was not on screen anywhere. Each layout brings its own
   published design point (rotor count, disk loading, cruise speed, effective
   L/D, figure of merit, tip speed, wing loading, thrust margin) from
   CONFIG_DEFAULTS - the mission is what is held constant, not the aircraft.

   Run ON DEMAND. Six full sizing loops is about 570 ms, which is too slow to
   put behind a slider but fine behind a button. */
export function CompareLayoutsTab(ctx) {
  const { params } = ctx;
  const [res, setRes]   = useState(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const size = (x) => runSizing(engineInputs(x));
      try { setRes(compareConfigurations(size, params, CFG)); }
      catch (e) { setRes({ error: String(e?.message ?? e) }); }
      setBusy(false);
    }, 0);
  };

  const num = (v, d = 0, unit = "") =>
    v == null || !isFinite(v) ? "—" : v.toFixed(d) + unit;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
        Every layout flies the <b>same mission</b> — {params.payload} kg over{" "}
        {params.range} km — and brings its <b>own published design point</b>. A layout
        that does not converge has <i>no design</i> at this mission and is excluded
        from the ranking rather than ranked last.
      </div>

      <div>
        <button type="button" onClick={run} disabled={busy}
          style={{ background: busy ? SC.dim : SC.advisory, color: SC.bg, border: "none",
                   borderRadius: 6, padding: "9px 18px", fontWeight: 600,
                   cursor: busy ? "wait" : "pointer", fontSize: 13 }}>
          {busy ? "Sizing six aircraft…" : "Size all six configurations"}
        </button>
        <span style={{ color: SC.muted, fontSize: 11, marginLeft: 12 }}>
          six full sizing loops, roughly half a second
        </span>
      </div>

      {res?.error && <div style={{ color: SC.warning }}>{res.error}</div>}

      {res?.rows && (
        <>
          <div style={{ overflowX: "auto", background: SC.panel,
                        border: `1px solid ${SC.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: SC.muted, textAlign: "right" }}>
                  {["Layout", "Reference aircraft", "N", "MTOW kg", "Pack kWh", "Span m",
                    "DL lb/ft²", "CT/σ", "L/De", "Checks"].map((h, i) => (
                    <th key={h} style={{ padding: "9px 10px", borderBottom: `1px solid ${SC.border}`,
                                         textAlign: i < 2 ? "left" : "right", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.map(r => {
                  const best = r.key === res.lightestClean;
                  return (
                    <tr key={r.key} style={{ color: SC.primary,
                          background: best ? SC.nominal + "18" : "transparent" }}>
                      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${SC.dim}` }}>
                        <b>{r.label}</b>
                        {!r.converged && <span style={{ color: SC.warning, fontSize: 10 }}>
                          {" "}· did not converge</span>}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${SC.dim}`,
                                   color: SC.muted }}>{r.reference ?? "—"}</td>
                      {[num(r.nRotors), num(r.MTOW_kg), num(r.packKWh), num(r.span_m, 1),
                        num(r.diskLoading_lbft2, 1), num(r.ctSigma, 3), num(r.LDact, 1)
                       ].map((v, i) => (
                        <td key={i} style={{ padding: "8px 10px", textAlign: "right",
                                             borderBottom: `1px solid ${SC.dim}` }}>{v}</td>
                      ))}
                      <td style={{ padding: "8px 10px", textAlign: "right",
                                   borderBottom: `1px solid ${SC.dim}`,
                                   color: r.failing === 0 ? SC.nominal : SC.warning }}>
                        {r.failing === 0
                          ? (r.checksTotal ? r.checksPassed + "/" + r.checksTotal : "all pass")
                          : r.failing + " failing"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── WHAT TO QUOTE, AND WHY IT IS NOT SIMPLY "LIGHTEST" ────────── */}
          <div style={{ background: SC.panel, border: `1px solid ${SC.border}`,
                        borderRadius: 8, padding: 12, fontSize: 12, color: SC.muted,
                        lineHeight: 1.6 }}>
            {res.lightestClean ? (
              <>Lightest layout that passes <b>every</b> feasibility check:{" "}
                <b style={{ color: SC.nominal }}>{res.lightestClean}</b>.</>
            ) : (
              <><b style={{ color: SC.caution }}>No layout closes this mission with every
                check passing.</b> The lightest that converges is <b>{res.lightest}</b>, but it
                is lighter partly <i>because</i> it violates a check — which is why the
                lightest design is the wrong one to quote.</>
            )}
            {res.sharedFailures?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <b style={{ color: SC.primary }}>Reported across most layouts</b> — a property
                of the mission or the model, not of any one configuration, so it wants one
                investigation rather than six:
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  {res.sharedFailures.map(f => (
                    <li key={f.label}>
                      <span style={{ color: f.hard ? SC.warning : SC.muted, fontSize: 10,
                                     textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {f.hard ? "failure" : "advisory"}</span>{" — "}{f.label}{" "}
                      <span style={{ color: SC.caution }}>({f.layouts} of {f.of})</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── per-layout detail ───────────────────────────────────────────
               THREE CLASSES, KEPT APART. An earlier version of this tab lumped
               them together and reported "no layout passes every check" when
               four of six were in fact feasible with every hard check passing.
               A failure is a verdict on the design; an advisory is a criterion
               real aircraft also miss; an omission is physics this model does
               not claim to cover. Rendering them in one red list trains people
               to ignore red. */}
          <div style={{ display: "grid", gap: 8 }}>
            {res.rows.filter(r => r.failedChecks?.length || r.advisories?.length
                                  || r.omissions?.length).map(r => (
              <div key={r.key} style={{ fontSize: 11.5, color: SC.muted, lineHeight: 1.55 }}>
                <b style={{ color: SC.primary }}>{r.label}</b>
                {r.failedChecks?.length > 0 && (
                  <div style={{ color: SC.warning }}>fails: {r.failedChecks.join(" · ")}</div>)}
                {r.advisories?.length > 0 && (
                  <div>advisory: {r.advisories.join(" · ")}</div>)}
                {r.omissions?.length > 0 && (
                  <div style={{ color: SC.subtle }}>not modelled: {r.omissions.join(" · ")}</div>)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
