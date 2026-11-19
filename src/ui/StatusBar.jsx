import { useState } from "react";
import { SC } from "../lib/theme.js";
import { T, S, MONO, SANS, numeric } from "./tokens.js";
import { ProvLedger } from "./Provenance.jsx";

/* =====================================================================
   STATUS BAR — does this design close, and can I defend it?
   =====================================================================
   Three facts decide whether a sizing run means anything, and all three were
   buried inside tabs the user had to go looking for:

     1. DID IT CONVERGE?  A diverged run still renders numbers. Every one of
        them is meaningless, and nothing on screen said so.

     2. HOW MUCH MARGIN?  Closure margin is 1 - (empty + battery)/MTOW, and
        its reciprocal is the weight-growth amplifier: at 11% margin, one
        kilogram of fixed equipment costs nine kilograms of MTOW. That single
        number explains more about a design's behaviour than MTOW does, and it
        was not displayed anywhere. Watching it while dragging a slider is the
        fastest way to understand why the aircraft is the size it is.

     3. WHAT FAILED?  Feasibility checks were a list inside one tab. The
        failures are the product — a tool that only shows you green is not
        telling you anything you can act on.

   So they live in a bar that is always present. Failures are summarised
   closed and enumerated open; nothing here is behind a click except detail.
   ===================================================================== */

function Metric({ label, value, unit, tone, title }) {
  return (
    <div title={title} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: T.micro, color: SC.muted, fontFamily: SANS,
        textTransform: "uppercase", letterSpacing: "0.09em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ ...numeric, fontSize: T.value, color: tone || SC.primary,
        lineHeight: 1.2, whiteSpace: "nowrap" }}>
        {value}
        {unit && <span style={{ fontSize: T.micro, color: SC.muted, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

export function StatusBar({ SR, U }) {
  const [open, setOpen] = useState(false);
  if (!SR) return null;

  /* THREE CLASSES, NOT ONE. A "check" is a verdict on the DESIGN. Two other
     things were being rendered as failed checks and they are not:
       kind:"omission"  physics deliberately not modelled (fuselage pitch
                        moment, hover download). These can NEVER pass, so
                        counting them meant the shipped default could never
                        show a clean board — which trains people to ignore red.
       kind:"advisory"  a band with no citation that published aircraft also
                        fail (Fus/Span: NASA's own L+C scores 0.462).
     Both stay VISIBLE — they bias the design optimistic and must not be
     hidden — but they are disclosures about the MODEL, not verdicts on the
     aircraft, so they are listed apart and excluded from the tally. */
  const all = SR.checks || [];
  const checks = all.filter((c) => !c.kind);
  const omissions = all.filter((c) => c.kind === "omission");
  const advisories = all.filter((c) => c.kind === "advisory" && !c.ok);
  const failed = checks.filter((c) => !c.ok);
  const passed = checks.length - failed.length;

  /* Convergence is pass/fail and nothing else matters if it failed. */
  const converged = SR.r2Converged !== false && !SR.r2Diverged;

  /* Margin bands: below 10% the design is on the steep part of the curve,
     where small assumption changes move MTOW by hundreds of kilograms. */
  const margin = SR.closureMargin ?? 0;
  const amp = margin > 0 ? 1 / margin : Infinity;
  const marginTone = margin >= 0.15 ? SC.nominal : margin >= 0.10 ? SC.caution : SC.warning;

  const certOK = SR.MTOW < 5700;

  return (
    /* A glass pane (ui/glass.jsx) at the foot of the frame. The lamps are
       annunciators: each one sits beside the words that carry its meaning. */
    <div className="gc-glass" role="region" aria-label="Design status"
      style={{ position: "sticky", bottom: 0, zIndex: 40, flexShrink: 0 }}>

      {open && (
        <div style={{ borderBottom: `1px solid ${SC.border}`, padding: `${S.lg}px ${S.xl}px`,
          display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: S.xl }}>
          <div>
            <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS,
              textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: S.md }}>
              {failed.length
                ? `${failed.length} check${failed.length > 1 ? "s" : ""} not met`
                : `All checks met${advisories.length || omissions.length
                    ? ` · ${advisories.length + omissions.length} advisory/not-modelled`
                    : ""}`}
            </div>
            {failed.length === 0 && (
              <div style={{ fontFamily: SANS, fontSize: T.body, color: SC.muted }}>
                Nothing is flagged. That is not the same as validated — see the
                traceability ledger for how much of this design rests on evidence.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
              {failed.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: S.md, alignItems: "flex-start" }}>
                  <span className="gc-lamp" data-state="warning" style={{ marginTop: 5 }} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: T.body, color: SC.primary }}>{c.label}</div>
                    <div style={{ ...numeric, fontSize: T.micro, color: SC.muted,
                      marginTop: 1, whiteSpace: "pre-wrap" }}>{c.val}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: T.label, color: SC.muted, fontFamily: SANS,
              textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: S.md }}>
              Traceability
            </div>
            <ProvLedger />
            <div style={{ fontFamily: SANS, fontSize: T.micro, color: SC.subtle,
              marginTop: S.md, lineHeight: 1.5 }}>
              How much of this design rests on evidence. Hover any value's chip
              for its individual record.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: S.xxl,
        padding: `${S.sm}px ${S.lg}px`, overflowX: "auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: S.md, flexShrink: 0 }}>
          <span className="gc-lamp" data-state={converged ? "nominal" : "warning"} aria-hidden="true" />
          <span style={{ fontFamily: SANS, fontSize: T.body, fontWeight: 500,
            color: converged ? SC.text : SC.warning }}>
            {converged ? "Converged" : "Did not converge — every value below is meaningless"}
          </span>
        </div>

        {converged && (
          <>
            <Metric label="MTOW" value={U ? U.mass(SR.MTOW) : SR.MTOW?.toFixed(0)}
              unit={U ? U.massU : "kg"} tone={certOK ? SC.primary : SC.warning}
              title={certOK ? "Below the 5,700 kg certification limit" : "Above the 5,700 kg limit"} />

            <Metric label="Closure margin" value={(margin * 100).toFixed(1)} unit="%"
              tone={marginTone}
              title="1 − (empty + battery)/MTOW. Below 10% the design sits on the steep part of the weight-growth curve." />

            <Metric label="Growth factor" value={isFinite(amp) ? `${amp.toFixed(1)}×` : "—"}
              tone={marginTone}
              title="Every 1 kg of fixed mass added costs this much MTOW." />

            <Metric label="Payload fraction"
              value={SR.MTOW ? ((SR.payloadFrac ?? 0) * 100).toFixed(1) : "—"} unit="%"
              title="Published eVTOLs run 12.6% (NASA L+C) to 18.9% (Beta ALIA)." />
          </>
        )}

        <button type="button" onClick={() => setOpen((o) => !o)} className="gc-key"
          aria-expanded={open}
          style={{ marginLeft: "auto", flexShrink: 0, gap: S.md,
            fontFamily: MONO, fontSize: T.label,
            ...(failed.length ? { borderColor: `${SC.warning}88` } : null) }}>
          <span className="gc-lamp" data-state={failed.length ? "warning" : "nominal"} aria-hidden="true" />
          <span>{passed}/{checks.length} checks</span>
          <span style={{ color: SC.subtle }}>{open ? "▾" : "▸"}</span>
        </button>
      </div>
    </div>
  );
}
