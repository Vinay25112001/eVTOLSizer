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

START your reply with one line in exactly this form, and nothing before it:
TRAINING CUTOFF: <the month and year your knowledge ends>

Then answer only what you can actually answer from that knowledge:
1. For each threshold above, does it MATCH what you recall of the published rule, or differ? Where it differs, give the value you recall and the rule ID. Where you do not know the paragraph, say you do not know it rather than naming one.
2. For an eVTOL with MTOW=${SR?.MTOW||2177}kg, nProp=${params.nPropHover}, range=${params.range}km, which requirements in these specifications are likely to bind hardest? Name the paragraph only if you are confident it exists.
3. The top 3 certification risks for this configuration.

DO NOT claim a threshold has "changed" or is "current" or "unchanged as of" any date. You cannot see anything after your cutoff, so a threshold stored later than your cutoff is one you cannot comment on: say exactly that. Prefer "I do not know" over a paragraph number you are not sure of -- a wrong citation is worse than none, because a reader cannot tell the difference without the document in front of them.

Respond in plain text, clearly structured.`;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL_FAST,
          /* 600 CUT THE ANSWER OFF MID-TABLE. The prompt asks for a
             per-rule comparison plus three risks, which does not fit;
             the reply ended inside a table cell, and a truncated
             regulatory answer reads as a complete one. */
          max_tokens: 2000,
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
        <div style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", letterSpacing: '0.18em', marginBottom: 4 }}>EASA SC-VTOL · FAA AC 21-17-4 · THRESHOLDS READ FROM THE SPECIFICATIONS</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: SC.text, marginBottom: 6 }}>
          <span style={{ color: SC.amber }}>Regulatory</span> Compliance Tracker
        </div>
        <div style={{ fontSize: 11, color: SC.muted, lineHeight: 1.7, maxWidth: 760 }}>
          Evaluates your current design against EASA SC-VTOL and FAA AC 21-17-4 thresholds read from the specifications, in real time. Every row says whether its threshold is a verified regulation or this tool&apos;s own rule, and <code>validation/citations.mjs</code> re-confirms each paragraph number on every run. Nothing on this page monitors the regulators for changes &mdash; the thresholds move when someone reads the documents again and edits them.
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
              <span style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", marginLeft: 12 }} title={regInfo.source}>Thresholds read from the documents: {regInfo.lastChecked}</span>
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

      {/* ── WHAT A LANGUAGE MODEL CAN AND CANNOT BE ASKED HERE ─────────
             This was labelled an "AI-powered update check", and it asked
             the model whether thresholds stored in early 2025 had
             changed. The model answers from frozen weights: no
             retrieval, no web access, no sight of any document. The one
             it calls replied that its knowledge ends in 2021 — so the
             question was unanswerable by construction, and every "no
             change known" it returned was an absence of knowledge
             rendered as reassurance.

             A certification threshold is the worst place in this tool to
             let that stand. regdb.js exists BECAUSE eleven engineering
             numbers once wore invented paragraph numbers, and its
             post-mortem states the rule this section now follows: a
             wrong citation "is worse than no citation at all, because a
             reader cannot tell the difference without the document in
             front of them."

             The feature is not removed — a model's recollection is
             genuinely useful for finding which requirements bind a
             configuration hardest — but it is labelled as recollection,
             made to print its own cutoff, and told not to assert
             currency it cannot have. The table above is the part that
             computes something. */}
      <div style={{ background: SC.panel, border: `1px solid ${SC.amber}33`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: SC.amber, fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>Ask a language model what it recalls of these rules</div>
        <div style={{ fontSize: 10, color: SC.muted, fontFamily: "'DM Mono',monospace", marginBottom: 12, lineHeight: 1.7 }}>
          Asks {GROQ_MODEL_LABEL[GROQ_MODEL_FAST]} for: (1) where its recollection of each threshold differs from the value stored here, (2) which requirements are likely to bind this configuration hardest, (3) the top 3 certification risks.
          {' '}<strong style={{ color: SC.amber }}>This is not an update check.</strong> The model has no retrieval and cannot see any document or anything published after its training cutoff, which it is asked to state on the first line of its answer. Treat what it returns as a prompt to go and read the specification, never as the specification.
        </div>
        <button onClick={checkUpdates} disabled={checking} type="button"
          style={{ padding: '9px 24px', background: checking ? 'transparent' : `linear-gradient(135deg,#1c1000,${SC.amber}88)`, border: `2px solid ${SC.amber}`, borderRadius: 7, color: checking ? SC.muted : SC.amber, fontSize: 11, fontWeight: 800, cursor: checking ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace" }}>
          {checking ? '⟳ Asking the model…' : 'Ask the model'}
        </button>
        {aiErr && <div style={{ marginTop: 10, padding: '8px 12px', background: `${SC.red}11`, border: `1px solid ${SC.red}44`, borderRadius: 6, fontSize: 10, color: SC.red, fontFamily: "'DM Mono',monospace" }}>{aiErr}</div>}
        {aiReport && (
          <>
            {/* THE CAVEAT TRAVELS WITH THE ANSWER, not just with the
                button. The answer is what gets read, screenshotted and
                pasted into a document; a disclaimer that sits above the
                control the reader already clicked does not follow it
                there. Same reasoning as the assumptions printed beside
                the flight's state of charge. */}
            <div style={{ marginTop: 12, padding: '8px 12px', background: `${SC.amber}11`, border: `1px solid ${SC.amber}44`, borderRadius: 6, fontSize: 9, color: SC.amber, fontFamily: "'DM Mono',monospace", lineHeight: 1.6 }}>
              Recalled by {GROQ_MODEL_LABEL[GROQ_MODEL_FAST]} from training data, not read from any document. It
              cannot see anything after its stated cutoff, so it cannot tell you whether a threshold is current.
              Paragraph numbers below are unverified — the ones in the table above are checked on every run by
              validation/citations.mjs; these are not. Verify against SC-VTOL-02 Issue 2 before relying on anything here.
            </div>
            <div style={{ marginTop: 8, padding: '14px 16px', background: SC.bg, border: `1px solid ${SC.border}`, borderRadius: 8, fontSize: 10, color: SC.text, fontFamily: "'DM Mono',monospace", lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
              {aiReport}
            </div>
          </>
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
