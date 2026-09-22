import { useState } from "react";
import { SC } from "../lib/theme.js";
import { REG_DB } from "../lib/regdb.js";

import { GROQ_MODEL_FAST, GROQ_MODEL_LABEL, describeModelError } from "../lib/ai-model.js";
export function RegTrackerPanel({ params, SR, SC }) {
  const [checking,  setChecking]  = useState(false);
  const [aiReport,  setAiReport]  = useState(null);
  const [aiErr,     setAiErr]     = useState("");
  const [regData,   setRegData]   = useState(REG_DB);
  const [expanded,  setExpanded]  = useState({});

  // Evaluate each rule against current design
  const evaluate = (rule, p, sr) => {
    const val = (() => {
      switch(rule.param) {
        case "OEI_margin_pct": {
          if(!sr) return null;
          const g=9.81, N=p.nPropHover, TW=p.twRatio||1.2;
          const T_nom = sr.MTOW*g*TW/N;         // motor design thrust (uses T/W)
          const T_oei = (N-1)*T_nom;            // (N-1) motors at full thrust
          return +(((T_oei - sr.MTOW*g)/(sr.MTOW*g))*100).toFixed(1);
        }
        /* WAS `return 3.5`, so this panel scored the design's compliance
           against a literal that no design could change — while the rule
           it was being scored against (regdb.js VTOL.2215) already carried
           the correct MOC VTOL.2200(f) floor of 2.0. The tracker read the
           regulation from the database and the aircraft from a constant. */
        case "n_pos_limit":    return sr?.nLimit ?? null;
        /* Also from the engine. loadCases() had computed the negative factor
           as nLimitManoeuvreNeg since it was written and engine.js never
           exported it, so this panel and both V-n renderings in report.js
           each carried their own -1.5. It remains an applicant PROPOSAL, as
           regdb.js says — MOC VTOL.2200(f) only floors it at -0.5 — but it
           is now one proposal in one place instead of three. */
        case "n_neg_limit":    return sr?.nLimitNeg ?? null;
        case "socMin":         return p.socMin;
        case "TipMach":        return sr?.TipMach;
        case "SM_vt":          return sr?.SM_vt;
        case "MTOW":           return sr?.MTOW;
        case "batFrac":        return sr ? +(sr.Wbat/sr.MTOW*100).toFixed(1) : null;
        case "VD_margin":      return sr ? +(sr.VD/p.vCruise).toFixed(3) : null;
        case "twRatio":        return p.twRatio;
        default: return null;
      }
    })();
    if (val === null) return { val: 'N/A', pass: null };
    const pass = rule.direction === 'min' ? val >= rule.threshold : val <= rule.threshold;
    return { val, pass };
  };

  const checkUpdates = async () => {
    setChecking(true); setAiErr(""); setAiReport(null);
    try {
      const rulesText = Object.entries(regData).map(([reg, data]) =>
        `${reg}:\n${data.rules.map(r => `  ${r.basis === 'regulation' ? r.id : '[tool rule, not a regulation]'} ${r.name}: current threshold = ${r.threshold} ${r.unit} (${r.direction}imum)`).join('\n')}`
      ).join('\n\n');

      const prompt = `You are an aviation regulatory expert specializing in eVTOL certification. 

Below are the regulatory thresholds I have stored for EASA SC-VTOL and FAA AC 21-17-4 as of early 2025:

${rulesText}

Based on your knowledge of these regulations up to your training cutoff:
1. Have any of these specific threshold VALUES changed from what I have stored?
2. Are there any NEW requirements I am missing that would affect an eVTOL with: MTOW=${SR?.MTOW||2177}kg, nProp=${params.nPropHover}, range=${params.range}km?
3. What are the top 3 certification risks for this specific design?

Respond in plain text, clearly structured. Be specific about rule IDs and numerical values. If you are uncertain about a specific value, say so.`;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL_FAST,
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) { const t = await res.text();
        throw new Error(await describeModelError(res.status, t, import.meta.env.VITE_GROQ_KEY)); }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (!text) throw new Error("No response from AI");
      setAiReport(text);
    } catch(e) {
      setAiErr("AI check failed: " + e.message);
    }
    setChecking(false);
  };

  const toggleExpand = (key) => setExpanded(p => ({...p, [key]: !p[key]}));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${SC.bg},#1a1200)`, border: `1px solid ${SC.amber}44`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", letterSpacing: '0.18em', marginBottom: 4 }}>EASA SC-VTOL · FAA AC 21-17-4 · AI-POWERED UPDATE CHECK</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: SC.text, marginBottom: 6 }}>
          <span style={{ color: SC.amber }}>Regulatory</span> Change Tracker
        </div>
        <div style={{ fontSize: 11, color: SC.muted, lineHeight: 1.7, maxWidth: 760 }}>
          Evaluates your current design against stored EASA SC-VTOL and FAA AC 21-17-4 thresholds in real time. "Check for Updates" asks a language model ({GROQ_MODEL_LABEL[GROQ_MODEL_FAST]}) to identify any threshold changes and certification risks specific to your design configuration.
        </div>
      </div>

      {/* Live compliance table */}
      {Object.entries(regData).map(([regName, regInfo]) => (
        <div key={regName} style={{ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div
            onClick={() => toggleExpand(regName)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', background: SC.bg, borderBottom: `1px solid ${SC.border}` }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: SC.text, fontFamily: "'DM Mono',monospace" }}>{regName}</span>
              <span style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", marginLeft: 12 }}>Last checked: {regInfo.lastChecked}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(() => {
                const results = regInfo.rules.map(r => evaluate(r, params, SR));
                const fails = results.filter(r => r.pass === false).length;
                return <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: fails > 0 ? SC.red : SC.green }}>{fails > 0 ? `✗ ${fails} FAIL` : 'ALL PASS'}</span>;
              })()}
              <span style={{ color: SC.muted, fontSize: 12 }}>{expanded[regName] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expanded[regName] && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: "'DM Mono',monospace" }}>
                <thead>
                  <tr style={{ background: SC.bg }}>
                    {['Rule ID', 'Requirement', 'Threshold', 'Your Design', 'Status', 'Description'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: SC.muted, fontWeight: 700, borderBottom: `1px solid ${SC.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regInfo.rules.map((rule, i) => {
                    const { val, pass } = evaluate(rule, params, SR);
                    return (
                      <tr key={`${rule.id ?? "tool"}-${rule.name}`} style={{ background: pass === false ? `${SC.red}08` : pass === true ? `${SC.green}05` : 'transparent', borderBottom: `1px solid ${SC.border}22` }}>
                        {/* A rule with no paragraph number is OURS, and says so here
                            rather than borrowing a citation. See lib/regdb.js. */}
                        <td style={{ padding: '7px 10px', color: rule.basis === 'regulation' ? SC.amber : SC.muted, fontWeight: 700 }}
                            title={rule.basis === 'regulation' ? rule.title : "this project's own design rule, not a certification requirement"}>
                          {rule.basis === 'regulation' ? rule.id : 'tool rule'}</td>
                        <td style={{ padding: '7px 10px', color: SC.text, fontWeight: 600 }}>{rule.name}</td>
                        <td style={{ padding: '7px 10px', color: SC.muted }}>{rule.direction === 'min' ? '≥' : '≤'} {rule.threshold} {rule.unit}</td>
                        <td style={{ padding: '7px 10px', color: pass === false ? SC.red : pass === true ? SC.green : SC.muted, fontWeight: 700 }}>{val === 'N/A' ? '—' : val}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: pass === false ? `${SC.red}22` : pass === true ? `${SC.green}22` : `${SC.muted}22`, color: pass === false ? SC.red : pass === true ? SC.green : SC.muted }}>
                            {pass === null ? 'N/A' : pass ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', color: SC.muted, maxWidth: 260 }}>{rule.desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* AI Update Check */}
      <div style={{ background: SC.panel, border: `1px solid ${SC.amber}33`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: SC.amber, fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>AI Regulatory Update Check</div>
        <div style={{ fontSize: 10, color: SC.muted, fontFamily: "'DM Mono',monospace", marginBottom: 12, lineHeight: 1.7 }}>
          Asks {GROQ_MODEL_LABEL[GROQ_MODEL_FAST]} to identify: (1) threshold changes from stored values, (2) new requirements for your specific design, (3) top 3 certification risks.
        </div>
        <button onClick={checkUpdates} disabled={checking} type="button"
          style={{ padding: '9px 24px', background: checking ? 'transparent' : `linear-gradient(135deg,#1c1000,${SC.amber}88)`, border: `2px solid ${SC.amber}`, borderRadius: 7, color: checking ? SC.muted : SC.amber, fontSize: 11, fontWeight: 800, cursor: checking ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace" }}>
          {checking ? '⟳ Checking with the model…' : 'Check for Regulatory Updates'}
        </button>
        {aiErr && <div style={{ marginTop: 10, padding: '8px 12px', background: `${SC.red}11`, border: `1px solid ${SC.red}44`, borderRadius: 6, fontSize: 10, color: SC.red, fontFamily: "'DM Mono',monospace" }}>{aiErr}</div>}
        {aiReport && (
          <div style={{ marginTop: 12, padding: '14px 16px', background: SC.bg, border: `1px solid ${SC.border}`, borderRadius: 8, fontSize: 10, color: SC.text, fontFamily: "'DM Mono',monospace", lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
            {aiReport}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   AI DESIGN ASSISTANT — iterative sizing driven by a language model
   Engineer describes requirements in plain language.
   The model calls run_sizing iteratively, updates sliders live.
   The model id and its label both come from src/lib/ai-model.js. Name the
   model the code actually calls, not the one the feature was prototyped
   against — a label is a claim like any other.
   ════════════════════════════════════════════════════════════════════════ */
