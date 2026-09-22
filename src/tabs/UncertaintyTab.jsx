import { useState } from "react";
import { SC } from "../lib/theme.js";
import { uncertaintyBand } from "../engine/uncertainty.js";
import { runSizing } from "../engine";
import { engineInputs } from "../lib/designfile.js";

/* Tab 27 - UNCERTAINTY.
   Every input already carries a provenance status. Those tags ARE an
   uncertainty model that nobody had read as one, and reading them as one turns
   "MTOW 3,005 kg" into "MTOW 3,005 kg, -467/+1858, dominated by etaBat".

   This is NOT the Monte Carlo tab with different arithmetic. Monte Carlo
   samples ranges a user types in; this derives which inputs deserve a wide band
   from the registry that CI already enforces, so an input cannot get a narrow
   band without someone upgrading its evidence first. The two answer different
   questions and both are worth having. */
export function UncertaintyTab(ctx) {
  const { params, customAFData } = ctx;
  const [res, setRes]   = useState(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      /* The screen's own transform (lib/designfile.js). This tab carried a
         hand copy of it that also dropped the custom airfoil, so its baseline
         could differ from the MTOW on screen. */
      const size = (x) => runSizing(engineInputs(x, customAFData ?? null));
      try { setRes(uncertaintyBand(size, params)); }
      catch (e) { setRes({ error: String(e?.message ?? e) }); }
      setBusy(false);
    }, 0);
  };

  const STATUS_COL = { validated: SC.nominal, sourced: SC.nominal, calibrated: SC.advisory,
                       unverified: SC.caution };
  const maxHalf = res?.contributions?.[0]?.half ?? 1;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
        Each input is perturbed by a band taken from <b>its provenance status</b> —
        published ±2%, calibrated ±10%, an assumption ±25% — and the sizing loop is
        re-run. The band widths are themselves assumptions and are labelled as such;
        what is <i>not</i> an assumption is <b>which</b> inputs get a wide band.
      </div>

      <div>
        <button type="button" onClick={run} disabled={busy}
          style={{ background: busy ? SC.dim : SC.advisory, color: SC.bg, border: "none",
                   borderRadius: 6, padding: "9px 18px", fontWeight: 600,
                   cursor: busy ? "wait" : "pointer", fontSize: 13 }}>
          {busy ? "Perturbing…" : "Compute the error bar"}
        </button>
        <span style={{ color: SC.muted, fontSize: 11, marginLeft: 12 }}>
          two sizing runs per input, a few seconds
        </span>
      </div>

      {res?.error && <div style={{ color: SC.warning }}>{res.error}</div>}

      {res?.contributions && (
        <>
          <div style={{ background: SC.panel, border: `1px solid ${SC.border}`,
                        borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ color: SC.muted, fontSize: 10.5, textTransform: "uppercase",
                          letterSpacing: 0.7 }}>{res.objective} with an honest error bar</div>
            <div style={{ color: SC.primary, fontSize: 30, fontWeight: 600, margin: "6px 0" }}>
              {res.base.toFixed(0)}
              <span style={{ fontSize: 17, color: SC.caution, marginLeft: 10 }}>
                −{res.rssDown.toFixed(0)} / +{res.rssUp.toFixed(0)} kg
              </span>
            </div>
            <div style={{ color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
              −{(100 * res.rssDown / res.base).toFixed(1)}% / +
              {(100 * res.rssUp / res.base).toFixed(1)}% root-sum-square over{" "}
              {res.inputsPerturbed} inputs. Dominated by{" "}
              <b style={{ color: SC.primary }}>{res.dominatedBy.join(", ")}</b>.
              <div style={{ marginTop: 6 }}>
                <b style={{ color: SC.primary }}>The band is asymmetric</b>, and that is the
                design telling you something: a sizing loop compounds, so a bad assumption
                makes the aircraft much heavier while a good one makes it only slightly
                lighter. Worst case, every assumption wrong the same way at once:{" "}
                {res.envelope.lo.toFixed(0)}–{res.envelope.hi.toFixed(0)} kg.
              </div>
            </div>
          </div>

          {/* ── ranked contributors ─────────────────────────────────────── */}
          <div style={{ background: SC.panel, border: `1px solid ${SC.border}`,
                        borderRadius: 8, padding: 12 }}>
            <div style={{ color: SC.muted, fontSize: 10.5, textTransform: "uppercase",
                          letterSpacing: 0.7, marginBottom: 10 }}>
              what the error bar is made of
            </div>
            {res.contributions.slice(0, 12).map(c => (
              <div key={c.key} style={{ display: "grid",
                    gridTemplateColumns: "150px 84px 1fr 110px", gap: 10,
                    alignItems: "center", padding: "5px 0", fontSize: 11.5 }}>
                <div style={{ color: SC.primary }}>{c.key}
                  {c.oneSided && <span title="physics stopped this input moving one way"
                    style={{ color: SC.muted }}> ◐</span>}</div>
                <div style={{ color: STATUS_COL[c.status] ?? SC.muted }}>
                  {c.status} ±{(c.band * 100).toFixed(0)}%</div>
                <div style={{ background: SC.dim, borderRadius: 3, height: 9 }}>
                  <div style={{ width: (100 * c.half / maxHalf).toFixed(1) + "%",
                                background: STATUS_COL[c.status] ?? SC.muted,
                                height: "100%", borderRadius: 3 }} />
                </div>
                <div style={{ color: SC.muted, textAlign: "right" }}>
                  ±{c.half.toFixed(0)} kg · e={c.elasticity?.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* ── THE ACTIONABLE PART ──────────────────────────────────────── */}
          {res.contributions[0]?.status === "unverified" && (
            <div style={{ background: SC.caution + "14", border: `1px solid ${SC.caution}55`,
                          borderRadius: 8, padding: 12, fontSize: 12, color: SC.primary,
                          lineHeight: 1.6 }}>
              <b>The single highest-value piece of research in this model right now is{" "}
              <span style={{ color: SC.caution }}>{res.contributions[0].key}</span>.</b>{" "}
              It is tagged <i>unverified</i> — an assumption — and it alone accounts for
              ±{res.contributions[0].half.toFixed(0)} kg of the band. Sourcing that one
              input narrows its band from ±25% to ±2% and shrinks the error bar more than
              any modelling change would. That is the argument this tab exists to make:
              the error bar points at what to go and find out.
            </div>
          )}

          <div style={{ color: SC.muted, fontSize: 11, lineHeight: 1.6 }}>
            <b>◐</b> marks an input whose excursion was clamped by physics — an efficiency
            cannot exceed 1, so its band is one-sided.{" "}
            {res.inputsSkipped.requirements.length > 0 && (
              <>Excluded as <b>user requirements</b> rather than uncertainties:{" "}
              {res.inputsSkipped.requirements.join(", ")} — perturbing those sizes a
              different aircraft, not this one.</>
            )}
          </div>
          <div style={{ color: SC.muted, fontSize: 11, lineHeight: 1.6 }}>{res.note}</div>
        </>
      )}
    </div>
  );
}
