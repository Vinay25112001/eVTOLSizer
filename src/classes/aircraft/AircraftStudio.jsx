/* =====================================================================
   AIRCRAFT DESIGN STUDIO — the fixed-wing half of the dual sizing tool
   =====================================================================
   Shown when the design mode is "aircraft" (Root.jsx). Its own inputs, its
   own tabs and its own engine (./engine.js); the eVTOL sizer is not
   imported and not changed. One studio serves every fixed-wing type: the
   type picker swaps the input set and the sizing method, and every tab
   reads the engine's common result.
   ===================================================================== */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SC, applyTheme } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { fmt, Card, StatusChip } from "../ui-kit.jsx";
import InputPanel, { InputRow } from "./InputPanel.jsx";
import { appVersionLabel } from "../../lib/designfile.js";
import DesignModeSwitch from "./DesignModeSwitch.jsx";
import { SharedAuthBar } from "../../lib/auth-session.jsx";
import { UnitToggle } from "../../lib/UnitToggle.jsx";
import { useUnitSystem } from "../../lib/unit-system.jsx";
import { convertLabelled } from "../../lib/units.js";
import { AIRCRAFT_TYPES, TYPE_IDS, typeOf, designAircraft, METHOD_ACCURACY } from "./engine.js";
import { uncertaintyOf } from "./uncertainty.js";
import { REFERENCE_AIRCRAFT } from "./reference-aircraft.js";
import * as Tabs from "./tabs.jsx";

export const STUDIO_GROUPS = Object.freeze([
  { name: "Design", tabs: [["overview", "Overview", Tabs.OverviewTab], ["compare", "Compare types", Tabs.CompareTypesTab]] },
  { name: "Physics", tabs: [["constraints", "Matching chart", Tabs.ConstraintTab], ["mission", "Mission", Tabs.MissionTab],
                            ["weights", "Weights", Tabs.WeightsTab], ["structure", "Structure", Tabs.StructureTab],
                            ["fuselage", "Fuselage", Tabs.FuselageTab], ["balance", "Balance", Tabs.BalanceTab], ["controls", "Controls", Tabs.ControlsTab],
                            ["aero", "Aerodynamics", Tabs.AeroTab], ["airfoil", "Airfoil", Tabs.AirfoilTab], ["propulsion", "Propulsion", Tabs.PropulsionTab]] },
  { name: "Trades", tabs: [["payload-range", "Payload-range", Tabs.PayloadRangeTab], ["trade", "Trade study", Tabs.TradeTab],
                           ["sensitivity", "Sensitivity", Tabs.SensitivityTab]] },
  { name: "Compliance", tabs: [["regs", "Regulations", Tabs.ComplianceTab], ["risk", "Risk", Tabs.RiskTab], ["warnings", "Warnings", Tabs.WarningsTab], ["validation", "Validation", Tabs.ValidationTab],
                               ["reality", "Reality check", Tabs.RealityTab]] },
  { name: "Tools", tabs: [["export", "Export", Tabs.ExportTab], ["methods", "Methods & sources", Tabs.MethodsTab]] },
]);
const ALL_TABS = STUDIO_GROUPS.flatMap((g) => g.tabs.map((t) => [...t, g.name]));

const defaultsOf = (id) => ({ ...AIRCRAFT_TYPES[id].defaults });
const analysisOf = (id) => Object.fromEntries(Object.entries(AIRCRAFT_TYPES[id].analysisInputs).map(([k, v]) => [k, v.value]));

function syncUrl(type, tab) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  q.delete("class");
  q.set("mode", "aircraft"); q.set("type", type); q.set("atab", tab);
  window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
}

export default function AircraftStudio({ initialType = "transport", requestedType }) {
  const qs = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [dark, setDark] = useState(() => (qs.get("theme") === "light" ? false : qs.get("theme") === "dark" ? true
    : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true)));
  applyTheme(dark);   // the shared palette; applied on every render, as the eVTOL sizer does

  const { system: unitSystem } = useUnitSystem();
  const [type, setType] = useState(TYPE_IDS.includes(initialType) ? initialType : "transport");
  const [job, setJob] = useState("size");
  const [tab, setTab] = useState(() => (ALL_TABS.some(([k]) => k === qs.get("atab")) ? qs.get("atab") : "overview"));
  const [paramsBy, setParamsBy] = useState(() => Object.fromEntries(TYPE_IDS.map((id) => [id, defaultsOf(id)])));
  const [analysisBy, setAnalysisBy] = useState(() => Object.fromEntries(TYPE_IDS.map((id) => [id, analysisOf(id)])));
  useEffect(() => { if (requestedType && TYPE_IDS.includes(requestedType)) setType(requestedType); }, [requestedType]);
  useEffect(() => syncUrl(type, tab), [type, tab]);

  const t = typeOf(type);
  const params = paramsBy[type], analysis = analysisBy[type];
  const setParam = (k, v) => setParamsBy((m) => ({ ...m, [type]: { ...m[type], [k]: v } }));
  const setParamsFor = (id, p) => setParamsBy((m) => ({ ...m, [id]: { ...m[id], ...p } }));
  const input = useMemo(() => ({ type, job, params, analysis }), [type, job, params, analysis]);
  const deferred = useDeferredValue(input);

  const { result, error } = useMemo(() => {
    try {
      const p = deferred.job === "analyse" ? { ...deferred.params, ...deferred.analysis } : deferred.params;
      return { result: designAircraft({ type: deferred.type, mode: deferred.job, params: p }), error: null };
    } catch (e) { return { result: null, error: e.message }; }
  }, [deferred]);
  const stale = deferred !== input;
  /* The empirical uncertainty of this design, from the stratum of the
     validation record it falls in - not the fleet-wide average error. */
  const unc = useMemo(() => (result ? uncertaintyOf(deferred.type, result) : null), [result, deferred.type]);

  const [, , TabBody, groupName] = ALL_TABS.find(([k]) => k === tab) ?? ALL_TABS[0];
  const tabParams = useMemo(() => (job === "analyse" ? { ...params, ...analysis } : params), [job, params, analysis]);
  const ctx = { type, mode: job, params: tabParams, analysis,
                result: result && result.type === type ? result : null, reference: REFERENCE_AIRCRAFT,
                setType, setParamsFor,
                onOpen: (d) => { setType(d.type); setJob(d.mode === "analyse" ? "analyse" : "size");
                                 setParamsFor(d.type, d.params ?? {}); if (d.analysis) setAnalysisBy((m) => ({ ...m, [d.type]: { ...m[d.type], ...d.analysis } })); } };
  const needsResult = !["compare", "validation", "methods"].includes(tab);

  const chip = (on) => ({ padding: "5px 11px", fontSize: T.label, borderRadius: 3, cursor: "pointer", fontFamily: SANS,
    background: on ? SC.inset : "transparent", color: on ? SC.text : SC.muted, border: `1px solid ${on ? SC.caution : SC.border}` });

  return (
    <div style={{ background: SC.bg, color: SC.text, minHeight: "100vh", fontFamily: SANS }}>
      <style>{"body{margin:0} .ads-results b{font-weight:700}"}</style>
      {/* HEADER: identity, mode, type and job; then the results bar */}
      <header style={{ background: SC.panel, borderBottom: `1px solid ${SC.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 18px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1, color: SC.primary }}>
              Aircraft Sizer
            </div>
            <div style={{ fontSize: 11, color: SC.subtle, fontFamily: MONO, lineHeight: 1 }}>
              {appVersionLabel()}
            </div>
          </div>
          <DesignModeSwitch mode="aircraft" />
          <span style={{ width: 1, alignSelf: "stretch", background: SC.border }} />
          <nav aria-label="Aircraft type" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TYPE_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={id === type} title={AIRCRAFT_TYPES[id].blurb}
                onClick={() => setType(id)} style={chip(id === type)}>{AIRCRAFT_TYPES[id].short}</button>
            ))}
          </nav>
          <span style={{ width: 1, alignSelf: "stretch", background: SC.border }} />
          <nav aria-label="Job" style={{ display: "flex", gap: 4 }}>
            <button type="button" aria-pressed={job === "size"} onClick={() => setJob("size")} style={chip(job === "size")}>Size from requirements</button>
            <button type="button" aria-pressed={job === "analyse"} onClick={() => setJob("analyse")} style={chip(job === "analyse")}>Analyse an aircraft</button>
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" style={chip(false)} onClick={() => setTab("export")}>⤓ Export</button>
            <UnitToggle style={chip(false)} />
            <button type="button" style={chip(false)} onClick={() => setDark((d) => !d)}>{dark ? "DAY" : "NIGHT"}</button>
            {/* The same session the eVTOL and drone studios show. */}
            <SharedAuthBar dark={dark} />
          </div>
        </div>
        {result && (
          <div className="ads-results" aria-live="polite"
            style={{ display: "flex", gap: 26, alignItems: "baseline", flexWrap: "nowrap", overflowX: "auto",
                     padding: "9px 18px", borderTop: `1px solid ${SC.border}`,
                     background: SC.inset, opacity: stale ? 0.55 : 1 }}>
            <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flex: "0 0 auto",
                           color: result.converged ? SC.nominal : SC.warning }}>
              ● {result.converged ? (job === "size" ? `Converged · ${result.iterations} iterations` : "Analysed") : "Not converged"}
            </span>
            {[["Take-off mass", `${fmt(result.mtowKg)} kg`, unc && unc.kind === "empirical" ? `${unc.p05.toFixed(0)} to +${unc.p95.toFixed(0)} % (n=${unc.n})` : "no interval"],
              ["Operating empty", `${fmt(result.oewKg)} kg`, `${fmt(100 * result.oewKg / result.mtowKg, 1)} %`],
              ["Payload", `${fmt(result.payloadKg)} kg`, ""],
              ["Fuel", `${fmt(result.fuelKg)} kg`, `${fmt(100 * result.fuelKg / result.mtowKg, 1)} %`],
              ["Wing", `${fmt(result.wingAreaM2, 1)} m²`, `${fmt(result.wingLoadingKgM2)} kg/m²`],
              [result.propulsion.kind === "thrust" ? "T/W" : "P/m", fmt(result.propulsion.toWeight, result.propulsion.kind === "thrust" ? 3 : 1),
               `${result.propulsion.engines} × ${fmt(result.propulsion.perEngine, 1)} ${result.propulsion.unit}`],
              ["Cruise L/D", fmt(result.cruise.LD, 1), `M ${fmt(result.cruise.mach, 2)}`],
              [job === "size" ? "Range" : "Range at MTOW", `${fmt(result.rangeNm)} nm`, ""]].map(([l, v, sub]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1, flex: "0 0 auto" }}>
                <span style={{ fontSize: 10, color: SC.muted, whiteSpace: "nowrap" }}>{l}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
                  {/* These are the most prominent numbers on the page and they
                      carry their unit inside the string, so they convert here
                      rather than through Kpi. */}
                  <b style={{ fontSize: 15, color: SC.primary, fontFamily: MONO, fontWeight: 600,
                              fontVariantNumeric: "tabular-nums" }}>{convertLabelled(v, unitSystem)}</b>
                  {sub && <span style={{ fontSize: 10, color: SC.subtle, fontFamily: MONO }}>{convertLabelled(sub, unitSystem)}</span>}
                </span>
              </div>
            ))}
            <button type="button" style={{ ...chip(false), marginLeft: "auto", padding: "2px 8px" }}
              onClick={() => { setParamsFor(type, defaultsOf(type)); setAnalysisBy((m) => ({ ...m, [type]: analysisOf(type) })); }}>
              ↺ Reset {t.short.toLowerCase()}
            </button>
          </div>
        )}
      </header>

      {/* TAB BAR */}
      <nav aria-label="Sections" className="ads-tabs"
        style={{ display: "flex", gap: 0, padding: "0 18px", borderBottom: `1px solid ${SC.border}`,
                 background: SC.panel, overflowX: "auto", flexWrap: "nowrap" }}>
        {STUDIO_GROUPS.map((g, gi) => (
          <div key={g.name} role="group" aria-label={g.name}
               style={{ display: "flex", alignItems: "stretch", flex: "0 0 auto",
                        borderLeft: gi === 0 ? "none" : `1px solid ${SC.border}`,
                        paddingLeft: gi === 0 ? 0 : 14, marginLeft: gi === 0 ? 0 : 14 }}>
            {g.tabs.map(([k, label]) => {
              const on = k === tab;
              return (
                <button key={k} type="button" aria-current={on ? "page" : undefined} onClick={() => setTab(k)}
                  title={`${g.name} · ${label}`}
                  style={{ padding: "10px 11px 9px", fontSize: T.label, cursor: "pointer", border: "none",
                           background: "transparent", fontFamily: SANS, whiteSpace: "nowrap",
                           color: on ? SC.primary : SC.muted, fontWeight: on ? 600 : 400,
                           borderBottom: `2px solid ${on ? SC.caution : "transparent"}`, marginBottom: -1 }}>
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start" }}>
        <aside aria-label="Inputs" style={{ width: 380, maxWidth: "100%", padding: `${S.md}px ${S.lg}px`, borderRight: `1px solid ${SC.border}`,
                                             boxSizing: "border-box", position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto",
                                             background: SC.bg }}>
          <p style={{ fontSize: T.label, color: SC.muted, margin: `0 0 ${S.xs}px`, lineHeight: 1.5 }}>{t.blurb}</p>
          <p style={{ fontSize: T.micro, color: SC.subtle, margin: `0 0 ${S.sm}px`, fontFamily: MONO }}>
            <StatusChip status="sourced" source="" />sourced&nbsp;&nbsp;<StatusChip status="derived" source="" />derived&nbsp;&nbsp;
            <StatusChip status="assumed" source="" />assumed<br />hover a chip for the source · ↑↓ steps a value
          </p>
          {job === "analyse" && (
            <section aria-label="The aircraft analysed" style={{ border: `1px solid ${SC.caution}`, borderRadius: 3, padding: `2px ${S.sm}px ${S.sm}px`, marginBottom: S.sm, background: SC.panel }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SC.caution, fontFamily: SANS, margin: `${S.md}px 0 3px` }}>The aircraft analysed</div>
              {Object.entries(t.analysisInputs).map(([k, v]) => (
                <InputRow key={k} k={k} spec={{ ...v, status: "sourced", source: "The aircraft being analysed" }} value={analysis[k]}
                  def={AIRCRAFT_TYPES[type].analysisInputs[k].value}
                  onChange={(kk, x) => setAnalysisBy((m) => ({ ...m, [type]: { ...m[type], [kk]: x } }))} />
              ))}
            </section>
          )}
          <InputPanel key={type} type={type} inputs={t.inputs} values={params} defaults={t.defaults} onChange={setParam}
            onResetAll={() => setParamsFor(type, defaultsOf(type))} />
        </aside>
        <main style={{ flex: 1, minWidth: 320, maxWidth: 1680, padding: `${S.lg}px ${S.xl}px`, boxSizing: "border-box" }} aria-label={`${groupName}: ${tab}`}>
          {error && needsResult && <Card title="This design cannot be computed"><p style={{ color: SC.warning, fontSize: T.body }}>{error}</p></Card>}
          {(!needsResult || ctx.result) && <TabBody {...ctx} />}
        </main>
      </div>
    </div>
  );
}
