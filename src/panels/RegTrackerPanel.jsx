import { useState, useMemo } from "react";
import { SC } from "../lib/theme.js";
import {
  REG_DB, ruleBasisCounts, scVtolApplicability, faaApplicability,
  CATEGORY_EFFECTS, GATE, EASA_VNO_LIMIT_KT,
} from "../lib/regdb.js";
import { atmosphereSet } from "../engine/atmosphere.js";

import { GROQ_MODEL_FAST, GROQ_MODEL_LABEL, GROQ_MODEL_CUTOFF, describeModelError } from "../lib/ai-model.js";
export function RegTrackerPanel({ params, SR, SC }) {
  const [checking,  setChecking]  = useState(false);
  const [aiReport,  setAiReport]  = useState(null);
  const [aiDiff,    setAiDiff]    = useState(null);
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
        /* "VD_margin" WAS HERE and evaluated SR.VD/p.vCruise against 1.25
           while engine.js defines VD as exactly p.vCruise*1.25, so it was
           1.250000 for every design ever sized. The rule is withdrawn in
           lib/regdb.js, which records the measurements; this case goes
           with it rather than lingering as dead code that looks like a
           check. validation/reg-applicability.mjs now refuses the shape. */
        case "twRatio":        return p.twRatio;
        default: return null;
      }
    })();
    if (val === null) return { val: 'N/A', pass: null };
    const pass = rule.direction === 'min' ? val >= rule.threshold : val <= rule.threshold;
    return { val, pass };
  };

  /* ── DOES THE DOCUMENT GOVERN THIS AIRCRAFT? ────────────────────────
     Asked BEFORE any rule is evaluated, because a rule from a document
     that does not apply has no verdict to give. See lib/regdb.js for the
     five gates and why only some of them are decidable here.

     The cruise speed is converted to EAS for the VTOL.2000(d) bound:
     EAS = TAS * sqrt(rho_cruise / rho_sea-level). vCruise is true
     airspeed at cruise density (engine.js sizes Vstall on rhoCr), and
     rhoCr is not exported in the sizing result, so it is recomputed here
     from the same atmosphere module the engine uses rather than
     approximated. */
  const scope = useMemo(() => {
    let easMS = null;
    try {
      const atm = atmosphereSet(params);
      const rho0 = atm.isa(0).rho;
      const rhoCr = atm.cruise?.rho;
      if (Number.isFinite(rho0) && Number.isFinite(rhoCr) && rho0 > 0
          && Number.isFinite(Number(params.vCruise)))
        easMS = Number(params.vCruise) * Math.sqrt(rhoCr / rho0);
    } catch { easMS = null; }
    return {
      easa: scVtolApplicability(params, SR, easMS),
      faa:  faaApplicability(params, SR),
    };
  }, [params, SR]);

  const basis = ruleBasisCounts();
  const category = (params.vtolCategory ?? "enhanced") === "basic" ? "Basic" : "Enhanced";

  const gateColour = (s) => s === GATE.OUT ? SC.red : s === GATE.UNKNOWN ? SC.amber : SC.green;
  const gateWord   = (s) => s === GATE.OUT ? "OUT OF SCOPE" : s === GATE.UNKNOWN ? "NOT DECIDABLE" : "in scope";

  const checkUpdates = async () => {
    setChecking(true); setAiErr(""); setAiReport(null); setAiDiff(null);
    try {
      /* ── WHY THE STORED VALUES ARE NOT IN THIS PROMPT ────────────────
         THE OLD PROMPT PASTED THE WHOLE TABLE IN AND THEN ASKED "does it
         MATCH?". That is anchoring by construction, and the answers
         showed it: the model returned MATCH for six rows that the same
         prompt had labelled "[tool rule, not a regulation]" -- OEI
         margin, residual state of charge, blade tip Mach, both static
         margins, hover thrust-to-weight. There is no published rule for
         any of those, so MATCH was not an available answer. It agreed
         with numbers it had just been handed.

         So the model is now asked for a value BEFORE it can see ours, the
         comparison is done in code below, and only the rules whose basis
         is "regulation" are asked about at all. A tool rule has no
         published counterpart to recall, and asking about one can only
         manufacture agreement. */
      const asked = Object.entries(regData).flatMap(([reg, d]) =>
        d.rules.filter((r) => r.basis === "regulation")
               .map((r) => ({ reg, id: r.id, name: r.name, unit: r.unit,
                              threshold: r.threshold, direction: r.direction })));

      const askList = asked.map((r, i) =>
        `${i + 1}. ${r.id} — ${r.name}${r.unit ? ` (answer in ${r.unit})` : ""}`).join("\n");

      const prompt = `You are answering from memory about EASA SC-VTOL-02, the Special Condition for small-category VTOL-capable aircraft. You have no retrieval, no web access, and no document in front of you.

PART 1 — RECALL, WITHOUT BEING TOLD THE ANSWER.
I have stored values for the following, and I am deliberately NOT showing them to you, because I want your independent recollection rather than agreement with mine. Do not guess what I have stored.

${askList}

Answer part 1 as one line per item, in exactly this form and nothing else:
RECALL <number> | <the numeric value you recall, with no unit> | <one short clause on how confident you are and from which issue>
If you do not recall a value, put UNKNOWN in the value field. UNKNOWN is a good answer and is what I expect for anything you are not sure of. A confident wrong number is the worst outcome here, because the reader cannot tell it from a right one without the document.

PART 2 — WHAT BINDS THIS DESIGN.
The aircraft: MTOW ${SR?.MTOW ? Math.round(SR.MTOW) : "unsized"} kg, ${params.nPropHover} lift rotors, ${params.range} km range, ${params.nSeats ? `${params.nSeats} seats` : "seat count not stated"}, certified Category ${(params.vtolCategory ?? "enhanced") === "basic" ? "Basic" : "Enhanced"}.
Which SC-VTOL requirements would you expect to bind this configuration hardest, and why? Name a paragraph number ONLY if you are confident it exists; otherwise describe the requirement in words. Say explicitly where Category ${(params.vtolCategory ?? "enhanced") === "basic" ? "Basic" : "Enhanced"} changes what is required.

PART 3 — the three certification risks you would expect to dominate this configuration.

Do not say a threshold is "current", "unchanged", or "as of" any date. Your training data has a fixed cutoff and this tool already knows what it is — it is printed beside your answer — so any claim about what is in force today is one you cannot support. Plain text.`;

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

      /* THE COMPARISON IS MADE HERE, NOT BY THE MODEL. It was asked for a
         value while blind to ours; this is the only place the two meet.
         A model that never saw the stored number cannot agree with it by
         reflex, and an UNKNOWN stays an UNKNOWN instead of becoming a
         "MATCH". */
      const recalled = new Map();
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*RECALL\s+(\d+)\s*\|\s*([^|]*?)\s*\|\s*(.*)$/i);
        if (m) recalled.set(Number(m[1]), { raw: m[2].trim(), why: m[3].trim() });
      }
      setAiDiff(asked.map((r, i) => {
        const got = recalled.get(i + 1);
        const num = got ? Number(got.raw.replace(/[^\d.+-]/g, "")) : NaN;
        const known = got && !/unknown/i.test(got.raw) && Number.isFinite(num);
        return {
          ...r,
          recalled: known ? num : null,
          why: got?.why ?? "",
          verdict: !got ? "no answer" : !known ? "model does not recall"
                 : Math.abs(num - r.threshold) < 1e-9 ? "agrees" : "DIFFERS",
        };
      }));
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
        {/* THE HEADER USED TO READ "EASA SC-VTOL · FAA AC 21-17-4 ·
            THRESHOLDS READ FROM THE SPECIFICATIONS". Three claims, none
            of them true: the identifier is AC 21.17-4 (dotted, as nine
            other files in this repo spell it), REG_DB holds ZERO FAA
            rules since the invented Part 27 set was removed, and most
            thresholds here are this tool's own. The counts below are
            computed, so the prose cannot drift from the table again. */}
        <div style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", letterSpacing: '0.18em', marginBottom: 4 }}>EASA SC-VTOL-02 ISSUE 2 · {basis.regulation} OF {basis.total} ROWS ARE REGULATION, {basis.tool} ARE THIS TOOL&apos;S OWN</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: SC.text, marginBottom: 6 }}>
          <span style={{ color: SC.amber }}>Regulatory</span> Compliance Tracker
        </div>
        <div style={{ fontSize: 11, color: SC.muted, lineHeight: 1.7, maxWidth: 760 }}>
          Asks first whether EASA SC-VTOL-02 Issue 2 <em>governs this aircraft at all</em>, and only then evaluates the rules against it. A design outside the document&apos;s applicability does not get FAIL badges &mdash; it gets no verdicts, because a rule from a document that does not apply has none to give. Every row says whether its threshold is a verified regulation or this tool&apos;s own rule, and <code>validation/citations.mjs</code> re-confirms each paragraph number on every run. Nothing here monitors the regulators &mdash; the thresholds move when someone reads the documents again and edits them.
        </div>
      </div>

      {/* ── APPLICABILITY, ASKED BEFORE COMPLIANCE ──────────────────────
          VTOL.2005(a)'s mass limit used to sit in the table as an
          ordinary row with a PASS/FAIL badge, so an 11 284 kg design --
          which this engine produces from one slider move -- was reported
          as "1 FAIL" with nine PASS beside it, including VTOL.2215 on an
          aircraft VTOL.2215 does not govern. Scope is not compliance and
          is no longer rendered as though it were. */}
      <div style={{ background: SC.panel, border: `1px solid ${scope.easa.applies ? (scope.easa.fixable.length ? SC.amber : SC.green) : SC.red}66`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: scope.easa.applies ? (scope.easa.fixable.length ? SC.amber : SC.green) : SC.red, marginBottom: 8, letterSpacing: '0.08em' }}>
          {scope.easa.applies
            ? (scope.easa.fixable.length > 0
                ? "SC-VTOL-02 ISSUE 2 — APPLICABILITY INCOMPLETE"
                : "SC-VTOL-02 ISSUE 2 APPLIES, ON THE STATED GATES")
            : "SC-VTOL-02 ISSUE 2 DOES NOT APPLY TO THIS DESIGN"}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: "'DM Mono',monospace" }}>
          <tbody>
            {scope.easa.gates.map((g) => (
              <tr key={g.para + g.name} style={{ borderBottom: `1px solid ${SC.border}22` }}>
                <td style={{ padding: '5px 8px', color: SC.amber, fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{g.para}</td>
                <td style={{ padding: '5px 8px', color: SC.text, verticalAlign: 'top' }}>{g.name}</td>
                <td style={{ padding: '5px 8px', color: SC.muted, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{g.shown}</td>
                <td style={{ padding: '5px 8px', color: gateColour(g.state), fontWeight: 800, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{gateWord(g.state)}</td>
                <td style={{ padding: '5px 8px', color: SC.muted, maxWidth: 340, verticalAlign: 'top' }}>{g.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!scope.easa.applies && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: `${SC.red}11`, border: `1px solid ${SC.red}44`, borderRadius: 6, fontSize: 10, color: SC.red, fontFamily: "'DM Mono',monospace", lineHeight: 1.7 }}>
            The {basis.total} rules below are <strong>withdrawn, not failed</strong>. A threshold from a document that does not govern this aircraft has no verdict to give, and a PASS badge on one would be worse than showing nothing. A certification basis for this design would be another specification entirely &mdash; CS-29, or a special condition written for it.
          </div>
        )}
        {/* TWO DIFFERENT SILENCES. One the reader can close by typing a
            number; one no keystroke closes, because the engine has no
            VNO. Reporting them as a single "incomplete" flag left the
            flag permanently on, and a warning that is always on stops
            being read. So the fixable ones are ASKED FOR and the
            structural one is merely STATED. */}
        {scope.easa.applies && scope.easa.fixable.length > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: `${SC.amber}11`, border: `1px solid ${SC.amber}44`, borderRadius: 6, fontSize: 10, color: SC.amber, fontFamily: "'DM Mono',monospace", lineHeight: 1.7 }}>
            Nothing above puts this design <em>out</em> of scope, but {scope.easa.fixable.length === 1 ? "one gate is" : `${scope.easa.fixable.length} gates are`} undecided and <strong>you can close {scope.easa.fixable.length === 1 ? "it" : "them"}</strong>: {scope.easa.fixable.map((g) => g.para).join(", ")}. The rules below are shown on the assumption {scope.easa.fixable.length === 1 ? "it holds" : "they hold"}.
          </div>
        )}
        {scope.easa.applies && scope.easa.undecided.length > scope.easa.fixable.length && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: `${SC.muted}11`, border: `1px solid ${SC.border}`, borderRadius: 6, fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", lineHeight: 1.7 }}>
            VTOL.2000(d) cannot be decided by this tool at all, at any setting: the paragraph limits V<sub>NO</sub> to {EASA_VNO_LIMIT_KT} KCAS and this engine computes no V<sub>NO</sub>, V<sub>NE</sub> or V<sub>H</sub>. A cruise speed <em>below</em> the line decides nothing. The applicability test against SC-VTOL-02 is therefore never complete here &mdash; it is only never contradicted.
          </div>
        )}

        {/* The FAA's gate is shown beside EASA's so the two mass limits
            are never mistaken for the same number in different units.
            5 700 kg and 12 500 lb differ by 30.1 kg, and the seat limits
            differ by three. See the header of lib/regdb.js. */}
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", cursor: 'pointer' }}>
            FAA AC 21.17-4 appendix A applies differently &mdash; show its gate
          </summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: "'DM Mono',monospace", marginTop: 6 }}>
            <tbody>
              {scope.faa.map((g) => (
                <tr key={g.para + g.name} style={{ borderBottom: `1px solid ${SC.border}22` }}>
                  <td style={{ padding: '5px 8px', color: SC.amber, fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{g.para}</td>
                  <td style={{ padding: '5px 8px', color: SC.text, verticalAlign: 'top' }}>{g.name}</td>
                  <td style={{ padding: '5px 8px', color: SC.muted, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{g.shown}</td>
                  <td style={{ padding: '5px 8px', color: gateColour(g.state), fontWeight: 800, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{gateWord(g.state)}</td>
                  <td style={{ padding: '5px 8px', color: SC.muted, maxWidth: 340, verticalAlign: 'top' }}>{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", marginTop: 6, lineHeight: 1.7 }}>
            No rule in the table below is an FAA rule. This gate is shown for contrast only: the FAA splits on post-failure capability (&ldquo;essential&rdquo; vs &ldquo;increased&rdquo; performance, PL.2000(b)) where EASA splits on the intended operation, and AC 21.17-4 states no energy reserve at all.
          </div>
        </details>
      </div>

      {/* ── CATEGORY, WHICH THE ENGINE ALREADY HONOURS ──────────────────
          vtolCategory has been a real sizing lever for some time and this
          panel was the only consumer ignoring it. Only what the engine
          actually does with it is claimed; the category-conditioned text
          this tool does NOT model is named rather than quietly dropped. */}
      {scope.easa.applies && (
        <div style={{ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: SC.amber, marginBottom: 8, letterSpacing: '0.08em' }}>
            VTOL.2005(b) — CERTIFIED CATEGORY {category.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: SC.muted, fontFamily: "'DM Mono',monospace", lineHeight: 1.7, marginBottom: 10 }}>
            Category Enhanced is <strong style={{ color: SC.amber }}>mandatory</strong> for operations over congested areas or for commercial air transport of passengers &mdash; the mission this tool sizes for. Basic requires only a controlled emergency landing, where Enhanced requires continued safe flight and landing. Set it on the design inputs; it is not a label.
          </div>
          <div style={{ fontSize: 9, color: SC.text, fontFamily: "'DM Mono',monospace", fontWeight: 700, marginBottom: 4 }}>What this engine does with it</div>
          {CATEGORY_EFFECTS.modelled.map((e) => (
            <div key={e.para + e.what} style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", lineHeight: 1.7, paddingLeft: 10 }}>
              <span style={{ color: SC.amber }}>{e.para}</span> &nbsp;{e.what} &nbsp;<span style={{ opacity: 0.6 }}>[{e.where}]</span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: SC.text, fontFamily: "'DM Mono',monospace", fontWeight: 700, margin: '8px 0 4px' }}>Category-conditioned in the specification, NOT modelled here</div>
          {CATEGORY_EFFECTS.notModelled.map((e) => (
            <div key={e.para + e.what} style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", lineHeight: 1.7, paddingLeft: 10, opacity: 0.8 }}>
              <span style={{ color: SC.muted }}>{e.para}</span> &nbsp;{e.what}
            </div>
          ))}
        </div>
      )}

      {/* Live compliance table — only when the document governs this aircraft */}
      {scope.easa.applies && Object.entries(regData).map(([regName, regInfo]) => (
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
          Asks {GROQ_MODEL_LABEL[GROQ_MODEL_FAST]} to state, <em>without being shown the stored values</em>, what threshold it recalls for each of the {basis.regulation} rows whose basis is a real paragraph. The comparison is then made here in code. Tool rules are never sent: they have no published counterpart, so asking about one can only manufacture agreement.
          {' '}<strong style={{ color: SC.amber }}>This is not an update check.</strong> The model has no retrieval and cannot see any document. Its training data ends <strong style={{ color: SC.amber }}>{GROQ_MODEL_CUTOFF[GROQ_MODEL_FAST]}</strong> &mdash; stated here from the published model card, because the model confabulates its own cutoff when asked. Treat what it returns as a prompt to go and read the specification, never as the specification.
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
              Recalled by {GROQ_MODEL_LABEL[GROQ_MODEL_FAST]} from training data ending {GROQ_MODEL_CUTOFF[GROQ_MODEL_FAST]},
              not read from any document. It cannot tell you whether a threshold is current, and it cannot tell you
              its own cutoff either — the date above is from the published model card, not from the model.
              Paragraph numbers below are unverified — the ones in the table above are checked on every run by
              validation/citations.mjs; these are not. Verify against SC-VTOL-02 Issue 2 before relying on anything here.
            </div>

            {/* THE DIFF IS COMPUTED, NOT QUOTED. The model answered blind;
                these are the only lines where its number and ours meet. */}
            {aiDiff && aiDiff.length > 0 && (
              <div style={{ marginTop: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: "'DM Mono',monospace" }}>
                  <thead>
                    <tr style={{ background: SC.bg }}>
                      {['Rule', 'Requirement', 'Stored here', 'Model recalled', 'Verdict', 'Model’s own caveat'].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: SC.muted, fontWeight: 700, borderBottom: `1px solid ${SC.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiDiff.map((d) => (
                      <tr key={d.id + d.name} style={{ borderBottom: `1px solid ${SC.border}22` }}>
                        <td style={{ padding: '6px 10px', color: SC.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>{d.id}</td>
                        <td style={{ padding: '6px 10px', color: SC.text }}>{d.name}</td>
                        <td style={{ padding: '6px 10px', color: SC.muted, whiteSpace: 'nowrap' }}>{d.threshold} {d.unit}</td>
                        <td style={{ padding: '6px 10px', color: SC.text, whiteSpace: 'nowrap' }}>{d.recalled === null ? '—' : `${d.recalled} ${d.unit}`}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap', color: d.verdict === 'DIFFERS' ? SC.red : d.verdict === 'agrees' ? SC.green : SC.muted }}>{d.verdict}</td>
                        <td style={{ padding: '6px 10px', color: SC.muted, maxWidth: 300 }}>{d.why || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 9, color: SC.muted, fontFamily: "'DM Mono',monospace", marginTop: 6, lineHeight: 1.7 }}>
                  &ldquo;agrees&rdquo; means the model produced the same number while blind to ours. It is weak evidence that the
                  stored value is right and <strong>no evidence at all</strong> that it is current: SC-VTOL-02 Issue 2 is dated
                  10 June 2024, within three weeks of this model&apos;s cutoff. &ldquo;DIFFERS&rdquo; is the useful outcome &mdash;
                  it names a row to go and re-read in the specification.
                </div>
              </div>
            )}
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
