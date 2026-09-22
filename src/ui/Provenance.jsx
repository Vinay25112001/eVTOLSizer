import { useState, createContext, useContext } from "react";
import { SC } from "../lib/theme.js";
import { provenanceOf, provenanceLedger, STATUS_META } from "../lib/provenance.js";
import { T, S, R, MONO, SANS, PROV_COLOR } from "./tokens.js";

/* =====================================================================
   PROVENANCE — the signature of this interface
   =====================================================================
   Every other sizing tool shows you a number. The question an engineer is
   actually asked — by a chief engineer, by a regulator, by a reviewer — is
   "where did that come from?", and until now this app could not answer it
   even though the answer already existed in lib/provenance.js.

   So the answer travels WITH the number. A three-letter chip beside any value
   says whether it was validated against a real aircraft, traced to a citable
   source, derived by algebra, fitted to data, or never checked at all. Hover
   gives the full provenance record.

   This is deliberately the one loud idea in the interface. Everything else —
   type, spacing, colour — stays quiet so that this reads.

   WHY THE COLOURS ARE NOT A RAINBOW: they reuse the MIL-STD-1472 alerting
   vocabulary already in the theme. Validated is nominal, calibrated is caution
   because a fit is not a prediction, and unverified is DIM rather than red —
   "nobody has checked this" is not the same as "this is wrong", and making it
   shout would train people to ignore the chips entirely.
   ===================================================================== */

/* The powertrain of the design on screen, so a chip reports the status the
   number has for THIS kind of aircraft (lib/provenance.js). */
export const PowertrainContext = createContext("battery");

export function ProvChip({ k, compact }) {
  const [hover, setHover] = useState(false);
  const powertrain = useContext(PowertrainContext);
  const p = provenanceOf(k, powertrain);

  /* An unregistered key is itself information: the value is on screen and
     nobody has classified it. Saying so is more honest than showing nothing. */
  const status = p?.status ?? "unregistered";
  const meta = p?.meta ?? { short: "—", label: "Unregistered",
    blurb: "This output is not in the traceability registry. Nobody has classified where it comes from." };
  const col = SC[PROV_COLOR[status]] ?? SC.dim;
  const detail = p?.src || p?.note || meta.blurb;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span
        tabIndex={0}
        aria-label={`Provenance: ${meta.label}. ${detail}`}
        onFocus={() => setHover(true)} onBlur={() => setHover(false)}
        style={{
          fontFamily: MONO, fontSize: T.micro, letterSpacing: "0.06em",
          color: col, border: `1px solid ${col}55`, borderRadius: R.sm,
          padding: compact ? "0 3px" : "1px 4px", cursor: "help",
          background: `${col}12`, lineHeight: 1.5, userSelect: "none",
          outlineOffset: 2,
        }}>
        {meta.short}
      </span>
      {hover && (
        <span role="tooltip" style={{
          position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 60,
          width: 290, background: SC.bg, border: `1px solid ${col}66`,
          borderRadius: R.md, padding: `${S.md}px ${S.lg}px`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", pointerEvents: "none",
        }}>
          <span style={{ display: "block", fontFamily: MONO, fontSize: T.label,
            color: col, letterSpacing: "0.08em", marginBottom: S.xs }}>
            {meta.label.toUpperCase()}
          </span>
          <span style={{ display: "block", fontFamily: SANS, fontSize: T.body,
            color: SC.primary, lineHeight: 1.45 }}>
            {detail}
          </span>
        </span>
      )}
    </span>
  );
}

/* ── LEDGER ──────────────────────────────────────────────────────────
   The honesty summary for the whole design. Shown as a single proportional
   bar rather than five numbers, because the question it answers is "how much
   of this rests on evidence?" and that is a shape, not a table. */
export function ProvLedger({ onSelect }) {
  const { counts, total } = provenanceLedger();
  const order = ["validated", "sourced", "derived", "calibrated", "unverified"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
      <div style={{ display: "flex", height: 6, borderRadius: R.sm,
        overflow: "hidden", border: `1px solid ${SC.border}` }}>
        {order.map((k) => counts[k] > 0 && (
          <div key={k} title={`${counts[k]} ${k}`}
            style={{ width: `${(counts[k] / total) * 100}%`,
              background: SC[PROV_COLOR[k]] ?? SC.dim }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${S.xs}px ${S.lg}px` }}>
        {order.filter((k) => counts[k] > 0).map((k) => (
          <button key={k} type="button" onClick={() => onSelect?.(k)}
            title={STATUS_META[k].blurb}
            style={{ display: "flex", alignItems: "center", gap: S.xs,
              background: "transparent", border: "none", padding: 0,
              cursor: onSelect ? "pointer" : "default", fontFamily: MONO,
              fontSize: T.micro, color: SC.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1,
              background: SC[PROV_COLOR[k]] ?? SC.dim }} />
            {counts[k]} {k}
          </button>
        ))}
      </div>
    </div>
  );
}
