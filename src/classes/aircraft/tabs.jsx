/* =====================================================================
   AIRCRAFT STUDIO TABS
   =====================================================================
   One component per tab. Each receives ctx = { type, mode, params, result,
   reference, setParams, setType } and renders from the aircraft engine's
   common result, so every tab works for every aircraft type.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { SC } from "../../lib/theme.js";
import { T, S, MONO, SANS } from "../../ui/tokens.js";
import { fmt, Card, Kpi, th, td, Warnings } from "../ui-kit.jsx";
import {
  typeOf, TYPE_IDS, constraintDiagram, payloadRange, polarCurve, sensitivityCases, evaluateCase,
  numericInputs, tradeGrid, compareTypes, realityCheck, typeWarnings, typeValidation, METHOD_ACCURACY,
} from "./engine.js";
import { ConstraintChart, PayloadRangeChart, PolarChart, HBarChart, ReferenceScatter, LineFamily } from "./charts.jsx";
import { GeneralArrangement } from "./GeneralArrangement.jsx";
import { uncertaintyOf } from "./uncertainty.js";
import { wingBox, MATERIALS, MATERIAL_IDS } from "./wing-structure.js";
import { ShearMomentDiagram, StressMarginPlot, BoxSection, StructuralPlanform } from "./StructureViews.jsx";
import { fuselageStructure } from "./fuselage-structure.js";
import { FuselageProfile, FuselageSection } from "./FuselageViews.jsx";
import { balanceOf, BALANCE_DEFAULTS } from "./balance.js";
import { LoadingDiagram, StationDiagram } from "./BalanceViews.jsx";
import { flightEnvelope } from "./flight-envelope.js";
import { controlSurfaces } from "./control-surfaces.js";
import { VnDiagram } from "./EnvelopeViews.jsx";
import { airfoilAdvice } from "./airfoils.js";
import { highLift, FLAP_TYPES, LE_DEVICES, DATCOM_WING_DATABASE } from "../transport/high-lift.js";
import { riskRegister, exceedance } from "./risk.js";
import { complianceMatrix } from "./compliance.js";

const Note = ({ children }) => <p style={{ fontSize: T.label, color: SC.subtle, lineHeight: 1.6, margin: `${S.sm}px 0 0` }}>{children}</p>;
const Lead = ({ children }) => <p style={{ fontSize: T.body, color: SC.muted, lineHeight: 1.6, marginTop: 0 }}>{children}</p>;
const Empty = ({ children }) => <Card title="Not available"><Lead>{children}</Lead></Card>;
/* "ATR" + "ATR 72" + "72-600" reads as "ATR 72-600". */
export function aircraftName(r) {
  const man = (r.manufacturer ?? "").split(/[ (]/)[0];
  const model = r.model ?? "", variant = r.variant ?? "";
  const head = model.toLowerCase().startsWith(man.toLowerCase()) || !man ? model : `${man} ${model}`;
  const v = variant.toLowerCase().startsWith(model.toLowerCase()) ? variant.slice(model.length).trim() : variant;
  return `${head} ${v}`.replace(/\s+/g, " ").trim();
}
const pctTxt = (v) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)} %` : "—");

function Table({ head, rows, numCols = [] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={th(numCols.includes(i))}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={td(numCols.includes(j))}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ── Design ──────────────────────────────────────────────────────────── */

export function OverviewTab({ type, mode, result }) {
  const t = typeOf(type), R = result, pr = R.propulsion;
  const unc = uncertaintyOf(type, R);
  const acc = METHOD_ACCURACY[type];
  return (
    <>
      <Card title="General arrangement">
        <GeneralArrangement result={R} height={640} />
      </Card>
      <Card title={`${t.label} — ${mode === "size" ? "sized from requirements" : "analysed as given"}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Take-off mass" value={fmt(R.mtowKg)} unit="kg"
               sub={unc && unc.kind === "empirical"
                 ? `${fmt(unc.massLoKg)} to ${fmt(unc.massHiKg)} kg, 5th-95th of ${unc.n} like it`
                 : "no interval: three validation aircraft"} />
          <Kpi label="Operating empty mass" value={fmt(R.oewKg)} unit="kg" sub={`${fmt(100 * R.oewKg / R.mtowKg, 1)} % of take-off`} />
          <Kpi label="Payload" value={fmt(R.payloadKg)} unit="kg" />
          <Kpi label={mode === "size" ? "Mission fuel" : "Fuel"} value={fmt(R.fuelKg)} unit="kg"
               sub={Number.isFinite(R.fuelCapacityKg) ? `tanks ${fmt(R.fuelCapacityKg)} kg` : ""} />
          <Kpi label="Wing" value={fmt(R.wingAreaM2, 1)} unit="m²" sub={`span ${fmt(R.spanM, 1)} m · AR ${fmt(R.aspectRatio, 1)} · ${fmt(R.wingLoadingKgM2)} kg/m²`} />
          <Kpi label={pr.kind === "thrust" ? "Thrust per engine" : "Power per engine"} value={fmt(pr.perEngine, 1)} unit={pr.unit}
               sub={`${pr.engines} × · ${fmt(pr.perEngineImperial)} ${pr.unitImperial} · set by ${pr.governedBy}`} />
          <Kpi label="Cruise L/D" value={fmt(R.cruise.LD, 1)} unit="" sub={`max ${fmt(R.cruise.LDmax, 1)} · M ${fmt(R.cruise.mach, 3)} · ${fmt(R.cruise.altFt)} ft`} />
          {Number.isFinite(R.rangeNm) && <Kpi label={mode === "size" ? "Design range" : "Range at this mass"} value={fmt(R.rangeNm)} unit="nm" />}
        </div>
        <Note>
          {mode === "size" ? (R.converged ? `Converged in ${R.iterations} iterations.` : `NOT converged: ${R.stopReason}. The numbers are the last iteration, not a design.`) : "Analysis of a given aircraft: no sizing loop."}
          {" "}{unc && unc.kind === "empirical"
            ? `The mass range is the 5th to 95th percentile of the error the tool actually made on the ${unc.n} validated aircraft in the same stratum (${unc.stratum}), taken as order statistics with nothing fitted. ${unc.note}`
            : `No interval is quoted: ${unc ? unc.note : ""}`}
          {" "}Method accuracy for this type: {acc.summary} ({acc.gate})
        </Note>
      </Card>
      <Card title="Mass breakdown">
        <HBarChart rows={[...R.weightGroups.map((g) => ({ name: g.name.replace(/ \(.*\)/, ""), value: Math.round(g.kg) })),
                          { name: "Payload", value: Math.round(R.payloadKg) }, { name: "Fuel", value: Math.round(R.fuelKg) }]} />
      </Card>
    </>
  );
}

export function CompareTypesTab({ reference, setType, setParamsFor }) {
  const [req, setReq] = useState({ seats: 70, rangeNm: 800, cruiseKt: 300, runwayM: 1500 });
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => { setRows(compareTypes(req, reference)); setBusy(false); }, 20);
  };
  const field = (k, label, unit, min, max, step) => (
    <label style={{ display: "flex", flexDirection: "column", fontSize: T.label, color: SC.muted, gap: 4 }}>
      {label}
      <input type="number" value={req[k]} min={min} max={max} step={step}
        onChange={(e) => setReq((r) => ({ ...r, [k]: Number(e.target.value) }))}
        style={{ width: 110, background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, padding: "4px 6px", fontFamily: MONO }} />
      <span style={{ fontSize: T.micro, color: SC.subtle }}>{unit}</span>
    </label>
  );
  return (
    <>
      <Card title="One requirement, every aircraft type">
        <Lead>
          State the mission once. The engine maps it onto every fixed-wing type, sizes each with its own validated method,
          and says whether real aircraft of that type have ever been built for it, from {reference.length} primary-source aircraft.
        </Lead>
        <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap", alignItems: "flex-end" }}>
          {field("seats", "Seats", "passengers", 1, 500, 1)}
          {field("rangeNm", "Range", "nm", 100, 9000, 50)}
          {field("cruiseKt", "Cruise speed", "kt true airspeed", 80, 520, 10)}
          {field("runwayM", "Runway", "m take-off field length", 300, 3500, 50)}
          <button type="button" onClick={run} disabled={busy}
            style={{ padding: "6px 14px", background: SC.inset, color: SC.text, border: `1px solid ${SC.caution}`, borderRadius: 3, cursor: "pointer", fontFamily: SANS }}>
            {busy ? "Sizing…" : "Size every type"}
          </button>
        </div>
      </Card>
      {rows && (
        <Card title="Result">
          <Table head={["Type", "Built for this?", "Take-off mass", "Fuel", "Fuel per seat-nm", "Cruise", "Block time", ""]}
            numCols={[2, 3, 4, 5, 6]}
            rows={rows.map((r) => [
              r.label,
              r.error ? <span style={{ color: SC.warning }}>no design: {r.error}</span>
                : r.inEnvelope ? <span style={{ color: SC.nominal }}>yes, within the reference envelope</span>
                : <span style={{ color: SC.caution }} title={r.reasons.join("; ")}>outside: {r.reasons[0]}</span>,
              r.result ? `${fmt(r.mtowKg)} kg` : "—",
              r.result ? `${fmt(r.fuelKg)} kg` : "—",
              r.result ? `${fmt(r.fuelPerSeatNm * 1000, 1)} g` : "—",
              r.result ? `${fmt(r.speedKt)} kt` : "—",
              r.result ? `${fmt(r.blockHours, 1)} h` : "—",
              r.result ? <button type="button" onClick={() => { setParamsFor(r.id, r.params); setType(r.id); }}
                style={{ fontSize: T.label, background: "transparent", color: SC.advisory, border: `1px solid ${SC.border}`, borderRadius: 3, cursor: "pointer" }}>open</button> : "",
            ])} />
          <Note>A design outside the reference envelope may still close numerically; it means no aircraft of that type in the
            library was built to that seat count, range or speed (±20 %), so the method is being extrapolated.
            Fuel per seat-nm includes reserves. Block time is range over cruise speed, without taxi or climb.</Note>
        </Card>
      )}
    </>
  );
}

/* ── Physics ─────────────────────────────────────────────────────────── */

export function ConstraintTab({ result }) {
  const d = useMemo(() => constraintDiagram(result), [result]);
  if (!d) return <Empty>The matching chart belongs to a sizing: switch the job to "Size from requirements".</Empty>;
  return (
    <Card title="Matching chart (constraint diagram)">
      <Lead>Every requirement drawn as a limit on wing loading and {result.propulsion.kind === "thrust" ? "thrust-to-weight" : "power loading"}.
        The feasible region is {d.feasible}; the design point is the smallest engine that meets all of them at the largest wing loading allowed.</Lead>
      <ConstraintChart diagram={d} />
      <Note>Wing loading is set by {d.verticals[0]?.name}; the engine by {result.propulsion.governedBy}.</Note>
    </Card>
  );
}

export function MissionTab({ result }) {
  const segs = result.mission ?? [];
  if (!segs.length) return <Empty>This method gives mission fuel as a single fraction; there is no segment breakdown.</Empty>;
  const total = segs.reduce((s, x) => s + x.kg, 0);
  return (
    <>
      <Card title="Mission fuel by segment">
        <HBarChart rows={segs.map((s) => ({ name: s.name, value: Math.round(s.kg), reserve: s.reserve }))}
          colorBy={(r) => (r.reserve ? SC.caution : SC.advisory)} />
        <Table head={["Segment", "Fuel (kg)", "Share", "Time (min)", "Distance (nm)"]} numCols={[1, 2, 3, 4]}
          rows={segs.map((s) => [s.name + (s.reserve ? " (reserve)" : ""), fmt(s.kg), `${fmt(100 * s.kg / total, 1)} %`,
                                 Number.isFinite(s.minutes) ? fmt(s.minutes) : "—", Number.isFinite(s.nm) ? fmt(s.nm) : "—"])} />
        {result.topOfClimbFt && <Note>Top of climb {fmt(result.topOfClimbFt)} ft; trip time {fmt(result.missionTimes?.trip)} min.</Note>}
      </Card>
    </>
  );
}

/* ── Structure ───────────────────────────────────────────────────────── */

export function StructureTab({ type, result }) {
  /* The material is a view choice, not a sizing input: the box analysis runs
     on the converged result and does not feed back into it, so putting it in
     the design parameters would pollute the design file for nothing. */
  const [material, setMaterial] = useState("2024-T3");
  const box = useMemo(() => wingBox(result, { material }), [result, material]);
  const env = useMemo(() => flightEnvelope(result), [result]);
  if (!box) return <Empty>This type does not report enough wing geometry to size a box.</Empty>;
  if (box.unavailable) return <Empty>{box.reason}</Empty>;
  const M = box.material, R = box.root;
  const mm = (v) => `${(v * 1e3).toFixed(1)} mm`;
  const mid = Math.round(box.stations.length * 0.35);
  return (
    <>
      <Card title={env && !env.unavailable
        ? `Flight envelope — ${env.governing} governs, by ${fmt(100 * env.margin, 0)} %`
        : "Flight envelope"}>
        {env && !env.unavailable ? (
          <>
            <VnDiagram env={env} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, marginTop: S.md }}>
              <Kpi label="Manoeuvre limit" value={fmt(env.manoeuvreN, 2)} unit="g" sub="25.337(b)" />
              <Kpi label="Gust at V_C" value={fmt(env.nGustMax, 2)} unit="g"
                   sub={`Pratt estimate · K_g ${fmt(env.gustModel.kg, 3)} · U_ds ${fmt(env.gustModel.uDsFtS, 1)} ft/s`} />
              <Kpi label="V_A" value={fmt(env.speeds.vaKt, 0)} unit="kt EAS"
                   sub={`V_S1 ${fmt(env.speeds.vs1Kt, 0)} · V_B ${fmt(env.speeds.vbKt, 0)}`} />
              <Kpi label="V_C / V_D" value={`${fmt(env.speeds.vcKt, 0)} / ${fmt(env.speeds.vdKt, 0)}`} unit="kt"
                   sub={env.speeds.vcIsAssumed ? "at the 25.335(a)(2) minimum — not a real V_C" : "as entered"} />
              <Kpi label="V_B / V_A" value={fmt(env.speeds.vbOverVa, 3)} unit=""
                   sub={env.speeds.vbOverVa > 1 ? "above 1 — the gust case is closing in" : "below 1 — manoeuvre governs"} />
              <Kpi label="Wing loading" value={fmt(env.wingLoadingLbFt2, 1)} unit="lb/ft²"
                   sub="the gust case crosses over near 50" />
            </div>
            <Note>
              <strong>The gust case does not govern here, and on a transport it never will.</strong> Δn from a
              gust falls as 1/(W/S) while 25.337(b) is pinned at 2.5 above 14,000 lb, so the margin widens
              with size — the crossover sits near 50 lb/ft². The tool's single load factor was therefore not
              producing a wrong transport wing box; what was missing was four of the five boundaries above
              and the whole second envelope. V_B/V_A is the cheap indicator: it equals √(n_gust)/√(n_man),
              so it rises above 1 exactly when the gust case takes over.
            </Note>
            <Note>
              The gust lines are straight through n = 1 with slopes in the ratio 1 : 1 : 0.5 at V_B, V_C and
              V_D, because the current rule uses the same U_ref from V_B to V_C and half of it at V_D. A
              diagram with a steeper line at V_B is drawing the pre-1996 rule, whose 66 ft/s at V_B survives
              only as the 1.32 in 25.335(a)(2).
            </Note>
            <ul style={{ margin: `${S.sm}px 0 0`, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
              {env.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </>
        ) : <Lead>{env ? env.why : "This type does not report the geometry an envelope needs."}</Lead>}
      </Card>

      <Card title="Wing box — sized to the load it carries">
        <div style={{ display: "flex", gap: S.md, alignItems: "center", flexWrap: "wrap", marginBottom: S.md }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>Material{" "}
            <select value={material} onChange={(e) => setMaterial(e.target.value)}
              style={{ fontFamily: MONO, fontSize: T.label, background: SC.inset, color: SC.text,
                       border: `1px solid ${SC.border}`, borderRadius: 3, padding: "3px 6px" }}>
              {MATERIAL_IDS.map((id) => <option key={id} value={id}>{MATERIALS[id].label}</option>)}
            </select>
          </label>
          <span style={{ fontSize: T.micro, color: SC.subtle }}>{M.note}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Root bending moment" value={fmt(R.momentNm / 1e6, 2)} unit="MN·m"
               sub={`at ${box.loadFactor.ultimate} g ultimate`} />
          <Kpi label="Root shear" value={fmt(R.shearN / 1e3)} unit="kN" sub={`torsion ${fmt(R.torsionNm / 1e3)} kN·m`} />
          <Kpi label="Cap stress" value={fmt(R.sigmaUltPa / 1e6)} unit="MPa"
               sub={`${fmt(R.strainUlt * 1e6)} µε · ${R.governedBy}`} />
          <Kpi label="Cover thickness" value={mm(R.capThickM)} unit=""
               sub={`web ${mm(R.webThickM)} · skin ${mm(R.skinThickM)}`} />
          <Kpi label="Tip deflection at limit" value={fmt(box.tipDeflectionLimitM, 2)} unit="m"
               sub={`${fmt(box.tipDeflectionLimitPctSemi, 1)} % of semi-span`} />
          <Kpi label="Box mass" value={fmt(box.mass.boxKg)} unit="kg"
               sub={box.mass.deltaPct === null
                 ? `wing ${fmt(box.mass.wingFromBoxKg)} kg — no independent wing mass to compare against`
                 : `wing ${fmt(box.mass.wingFromBoxKg)} kg vs ${fmt(box.mass.referenceWingKg)} kg from the mass model (${box.mass.deltaPct >= 0 ? "+" : ""}${fmt(box.mass.deltaPct, 1)} %)`} />
        </div>
        <Note>
          The cap is sized against both conditions 14 CFR 25.305 asks for — limit load with no permanent
          deformation, against Fcy {fmt(M.fcy / 1e6)} MPa, and ultimate load with no failure, against Ftu
          {" "}{fmt(M.ftu / 1e6)} MPa — and the governing one is named above. A margin of zero at the root is
          not a finding: the station is sized to exactly reach its allowable, so a fully stressed design reads
          zero there by construction. What is a finding is where minimum gauge takes over instead:
          {" "}{box.minGauge.stationsGoverned} of {box.minGauge.totalStations} stations. {box.minGauge.note}
        </Note>
      </Card>

      <Card title={`Fuel load cases — ${box.governingCase.label} governs`}>
        <Lead>
          25.343(a) requires every fuel load &ldquo;from zero fuel and oil to the selected maximum&rdquo;.
          Fuel in the wing relieves bending, so the critical case is the one carrying the least wing fuel at
          the highest gross mass — which is exactly what the maximum zero-fuel mass exists to bound.
        </Lead>
        <Table head={["", "Case", "Gross mass", "Wing fuel", "n ult", "Root moment", "vs design"]}
               numCols={[2, 3, 4, 5, 6]}
               rows={box.loadCases.map((c) => [
                 c.governs ? "▲" : "",
                 c.label,
                 `${fmt(c.grossKg)} kg`,
                 `${fmt(c.fuelInWingKg)} kg`,
                 fmt(c.nUlt, 2),
                 `${fmt(c.rootMomentNm / 1e6, 3)} MN·m`,
                 c.id === "design" ? "—" : `${c.vsDesignPct >= 0 ? "+" : ""}${fmt(c.vsDesignPct, 1)} %`,
               ])} />
        {box.loadCases.map((c) => (
          <Note key={c.id}><strong>{c.label}</strong> — {c.basis}</Note>
        ))}
        {box.casesOmitted.map((o, i) => (
          <div key={i} style={{ borderLeft: `3px solid ${SC.caution}`, padding: `2px 0 2px ${S.md}px`,
                                margin: `${S.sm}px 0 0`, fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>
            {o}
          </div>
        ))}
      </Card>

      <Card title="Load, shear and bending moment">
        <ShearMomentDiagram box={box} />
        <Note>
          Lift by Schrenk's approximation (NACA TM 948): the mean of the chord distribution and an ellipse of
          equal area. The wing's own structure and its fuel act downward and are carried as inertia relief,
          without which the root moment would be materially overstated.
        </Note>
      </Card>

      <Card title="Cap stress against the allowables">
        <StressMarginPlot box={box} />
      </Card>

      <Card title="Box section">
        <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minWidth: 260 }}><BoxSection box={box} stationIndex={0} /></div>
          <div style={{ flex: "1 1 280px", minWidth: 260 }}><BoxSection box={box} stationIndex={mid} /></div>
        </div>
      </Card>

      <Card title="Spars, ribs and stringers">
        <StructuralPlanform box={box} />
      </Card>

      <Card title="What this analysis is, and is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {box.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
    </>
  );
}

/* ── Balance ─────────────────────────────────────────────────────────── */

export function BalanceTab({ type, result }) {
  /* The target CG is a view control, not a design input: moving it moves the
     wing, which is the whole point of the closed form, and seeing that
     happen live is the most instructive thing on this tab. */
  const [target, setTarget] = useState(BALANCE_DEFAULTS.targetCgPctMac);
  const bal = useMemo(() => balanceOf(result, { targetCgPctMac: target }), [result, target]);
  const fus = useMemo(() => fuselageStructure(result), [result]);
  if (!bal) return <Empty>This type does not report the wing geometry and mass breakdown that a balance needs.</Empty>;
  const np = bal.neutralPoint, y = bal.yaw;
  const pct = (v) => `${(100 * v).toFixed(1)} %`;
  return (
    <>
      <Card title="Centre of gravity, and where the wing has to go for it">
        <div style={{ display: "flex", gap: S.md, alignItems: "center", flexWrap: "wrap", marginBottom: S.md }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>Target CG{" "}
            <input type="range" min={0.10} max={0.45} step={0.01} value={target}
                   onChange={(e) => setTarget(+e.target.value)} style={{ verticalAlign: "middle" }} />
            <span style={{ fontFamily: MONO, marginLeft: S.sm, color: SC.text }}>{(100 * target).toFixed(0)} % MAC</span>
          </label>
          <span style={{ fontSize: T.micro, color: SC.subtle }}>
            Scholz Ch.10 Eq. (10.24): pick the balance point, the wing follows in one step.
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Wing root leading edge" value={fmt(bal.xWingRootLE, 2)} unit="m"
               sub={`${fmt(100 * bal.xWingRootLE / bal.fuselageLengthM, 1)} % of fuselage length — solved, not drawn`} />
          <Kpi label="LEMAC" value={fmt(bal.xLemac, 2)} unit="m"
               sub={`MAC ${fmt(bal.mac, 2)} m at y = ${fmt(bal.yMac, 2)} m`} />
          <Kpi label="Operating empty CG" value={fmt(100 * bal.oew.pctMac, 1)} unit="% MAC"
               sub={`${fmt(bal.oew.massKg)} kg at ${fmt(bal.oew.xM, 2)} m`} />
          <Kpi label="Take-off CG" value={fmt(100 * bal.takeoff.pctMac, 1)} unit="% MAC"
               sub={`${fmt(bal.takeoff.massKg)} kg — payload at the cabin centroid, fuel at the wing box`} />
          <Kpi label="CG range, unrestricted" value={fmt(bal.envelope.rangePctMac, 1)} unit="% MAC"
               sub={`${fmt(100 * bal.envelope.fwd.pctMac, 1)} % to ${fmt(100 * bal.envelope.aft.pctMac, 1)} %`} />
          <Kpi label="Leading-edge sweep" value={fmt(bal.leSweepDeg, 2)} unit="°"
               sub={`from ${fmt(result.raw?.inputs?.wingSweep ?? 0, 2)}° at the quarter chord`} />
        </div>
        <Note>
          The wing station is now a computed quantity. Every other station on this page is the TASOPT
          737-800 deck's layout scaled by fuselage length — one aeroplane's choices. The same deck's
          200-seat variant moves its nose gear from 11 % to 23 % of the length, which is the size of the
          judgement involved.
        </Note>
      </Card>

      <Card title="Loading diagram">
        <LoadingDiagram bal={bal} />
        <Note>
          Passengers only, at zero fuel, packed forward against packed aft, swept over load fraction — the
          form of TASOPT Eq. (A.282). The critical case is a PART-FULL cabin, not an empty or a full one,
          which is why the branches bow outward; Drela's own 737 case settles at about 45 % load. This is
          the unrestricted extreme, so it is wider than a published range: airlines control the loading.
        </Note>
      </Card>

      <Card title="Mass stations">
        <StationDiagram bal={bal} fus={fus} />
      </Card>

      <Card title={`Static margin — ${np.verdict}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Neutral point, tail only" value={fmt(100 * np.tailOnly.pctMac, 1)} unit="% MAC"
               sub={`static margin ${pct(np.tailOnly.staticMargin)} — optimistic`} />
          {np.withFuselage && <Kpi label="With slender-body fuselage" value={fmt(100 * np.withFuselage.pctMac, 1)} unit="% MAC"
               sub={`static margin ${pct(np.withFuselage.staticMargin)} — pessimistic`} />}
          <Kpi label="Tail effectiveness dCLh/dCL" value={fmt(np.dClhDcl, 3)} unit=""
               sub={`downwash dε/dα = ${BALANCE_DEFAULTS.downwashDepsDa}, tail arm ${fmt(np.lH, 2)} m`} />
          <Kpi label="Minimum required" value={fmt(100 * np.marginMin, 0)} unit="% MAC"
               sub="737.tas line 243, SMmin" />
        </div>
        <Note>
          <strong>These two numbers bracket the answer; they do not average to it.</strong> The tail-only
          neutral point ignores the fuselage, which is destabilising, so it is optimistic. The slender-body
          correction over-counts it: on this aircraft it returns {np.cmvf1Ratio ? fmt(np.cmvf1Ratio, 2) : "—"}
          {" "}times the value Drela's own 737 deck carries for the same aeroplane, and TASOPT's documentation
          says outright that slender-body theory is &ldquo;considerably modified by the interaction with the
          wing&rdquo;. Closing the gap needs NACA TR-711's figure, which was not obtainable, or a second
          calibrated aircraft.
        </Note>
      </Card>

      <Card title="Vertical tail against engine-out yaw">
        {y.available ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
              <Kpi label="Fin area required" value={fmt(y.svRequiredM2, 1)} unit="m²"
                   sub={`against ${fmt(y.svActualM2, 1)} m² from the area ratio — ${y.ratio <= 1 ? "adequate" : "short"} by ${fmt(Math.abs(100 * (y.ratio - 1)), 0)} %`} />
              <Kpi label="Tail volume V_v" value={fmt(y.vvRequired, 3)} unit=""
                   sub={`required, against ${fmt(y.vvActual, 3)} fitted`} />
              <Kpi label="Yawing moment" value={fmt(y.yawMomentNm / 1e3)} unit="kN·m"
                   sub={`thrust ${fmt(y.thrustN / 1e3)} kN + windmilling ${fmt(y.windmillDragN / 1e3, 1)} kN at ${fmt(y.yEng, 2)} m`} />
              <Kpi label="Control speed used" value={fmt(y.vMc, 0)} unit="m/s"
                   sub={`${fmt(y.vMc / 0.5144, 0)} kt — 25.149(c) ceiling, ${fmt(BALANCE_DEFAULTS.vmcOverVsr, 2)} × V_SR`} />
            </div>
            <Note>{y.vMcBasis}</Note>
            <Note>{y.note} Thrust from {y.thrustFrom}.</Note>
            <Note>
              TASOPT Eq. (A.306). Douglas measured how far the volume-coefficient answer can sit from this
              one (NASA CR-166138 p.69): wing-mounted engines on long arms needed the tail volume raised by
              50 %, and aft-mounted engines on short arms by 25 %.
            </Note>
          </>
        ) : <Lead>{y.why}</Lead>}
      </Card>

      <Card title="Every mass, and the station it was given">
        <Table head={["Item", "kg", "Station (m)", "% MAC", "Group", "Where the station comes from"]}
               numCols={[1, 2, 3]}
               rows={[...bal.items].sort((a, b) => a.x - b.x).map((i) => [
                 i.name, fmt(i.kg), fmt(i.x, 2),
                 fmt(100 * (i.x - bal.xLemac) / bal.mac, 0),
                 i.group === "wing" ? "wing" : "fuselage", i.why])} />
      </Card>

      <Card title="What this is, and is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {bal.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
    </>
  );
}


/* ── Control surfaces ────────────────────────────────────────────────── */

export function ControlsTab({ type, result }) {
  const cs = useMemo(() => controlSurfaces(result), [result]);
  if (!cs) return <Empty>This type does not report the tail and wing geometry a control-surface check needs.</Empty>;
  const kN = (v) => fmt(v / 1e3, 1);
  return (
    <>
      <Card title={`Ground-gust hinge moments — 25.415, ${cs.speedKt} kt, compounded ×${fmt(cs.compounding, 2)}`}>
        <Lead>
          The one closed-form hinge moment in Part 25: <strong>H = K · ½ρ₀V² · c · S</strong> at
          65 knots, needing only an area, a mean chord and a table lookup — no aerodynamics and no charts.
          25.415(d) then applies 1.25 for limit control-system loads and 25.415(e) a further 1.6 for dynamic
          effects, and the two compound to 2.0.
        </Lead>
        <Table head={["Surface", "Area (one)", "Mean chord", "Worst case", "K", "Static H", "Design H", "On the measured spread"]}
               numCols={[1, 2, 4, 5, 6, 7]}
               rows={cs.surfaces.map((s) => [
                 s.label,
                 `${fmt(s.areaPerSurfaceM2, 2)} m²`,
                 `${fmt(s.meanChordM, 3)} m`,
                 s.worst.condition,
                 fmt(s.worst.k, 2),
                 `${kN(s.worst.staticNm)} kN·m`,
                 `${kN(s.worst.designNm)} kN·m`,
                 s.designNmLo === null ? "—" : `${kN(s.designNmLo)} to ${kN(s.designNmHi)} kN·m`,
               ])} />
        <Note>
          <strong>The equation is exact; the geometry is not.</strong> This tool has no control-surface
          geometry and no transport publishes any — the 737 ACAPS has zero occurrences of
          &ldquo;aileron&rdquo;, &ldquo;elevator&rdquo;, &ldquo;rudder&rdquo; or &ldquo;spoiler&rdquo; in
          7,616 lines, and the 737 and 747 type certificates decline to state deflections at all. The areas
          and chords come from conventions measured on four light singles, none over 3,800 lb and none a
          transport. The last column is that measured spread carried through.
        </Note>
      </Card>

      <Card title="Where each area and chord comes from">
        <Table head={["Surface", "Fraction of", "Area fraction", "Chord ratio", "Measured range", "n"]}
               numCols={[2, 3, 5]}
               rows={cs.surfaces.map((s) => [
                 s.label, s.parent,
                 `${fmt(100 * s.areaFraction, 1)} %`,
                 `${fmt(100 * s.chordRatio, 1)} %`,
                 s.measuredRange ? `${fmt(100 * s.measuredRange[0], 1)}–${fmt(100 * s.measuredRange[1], 1)} %` : "—",
                 s.measuredN ?? "—",
               ])} />
        {cs.surfaces.map((s) => (
          <Note key={s.id}><strong>{s.label}</strong> — area: {s.areaSource}. Chord: {s.chordSource}.</Note>
        ))}
      </Card>

      <Card title="Roll requirements — stated, not evaluated">
        <Table head={["Manoeuvre", "Within", "At", "Source"]} numCols={[1]}
               rows={cs.rollRequirements.map((r) => [
                 r.oneWay ? `Roll ${r.bankDeg}° of bank` : `Roll ${r.bankDeg}° to ${r.bankDeg}° the other way`,
                 `${r.seconds} s`, r.at, r.cite])} />
        <Note>{cs.rollWhy}</Note>
        <Note>
          Note what these are <em>not</em>: no military specification is cited, and none is needed. The
          regulation text of 25.147(d) and 25.181 is qualitative, but the FAA publishes the numbers itself in
          its own flight test guide, and 25.149(h)(3) carries one directly.
        </Note>
      </Card>

      <Card title="Asymmetric tail loading">
        <Lead>{cs.asymmetric.text}</Lead>
        <Note>{cs.asymmetric.cite}</Note>
      </Card>

      <Card title="What is not claimed, and why">
        <Table head={["Feature", "Why"]} rows={cs.notClaimed.map((n) => [n.feature, n.why])} />
      </Card>

      <Card title="What this is, and is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {cs.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
    </>
  );
}

/* ── Fuselage internal arrangement ───────────────────────────────────── */

export function FuselageTab({ type, result }) {
  const f = useMemo(() => fuselageStructure(result), [result]);
  if (!f) return <Empty>This type does not report a fuselage length, width and height, which the arrangement needs.</Empty>;
  const IN_ = 0.0254;
  const inches = (v) => `${(v / IN_).toFixed(2)} in`;
  const p = f.pressure;
  return (
    <>
      <Card title="Fuselage shell">
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Length" value={fmt(f.shell.lengthM, 2)} unit="m"
               sub={`fineness ${fmt(f.shell.fineness, 2)} · ${f.shell.lengthSized ? "sized" : "not sized"}`} />
          <Kpi label="Cross-section" value={fmt(f.shell.crossSectionFt2, 1)} unit="ft²"
               sub={`${fmt(f.shell.widthM, 2)} × ${fmt(f.shell.heightM, 2)} m · equivalent diameter ${fmt(f.shell.equivDiaM, 2)} m`} />
          <Kpi label="Frames" value={f.frames.drawn ? f.frames.count : "—"} unit=""
               sub={f.frames.drawn ? `at ${inches(f.frames.pitchM)}${f.frames.inBand ? ", inside the sourced band" : ", outside the sourced band"}`
                                   : "no published pitch for this class"} />
          <Kpi label="Stringers" value={f.stringers.count} unit=""
               sub={`at ${inches(f.stringers.pitchM)} around ${fmt(f.stringers.perimeterM, 2)} m`} />
          {f.panel && <Kpi label="Skin panel" value={`${fmt(f.panel.lengthM * 1e3, 0)} × ${fmt(f.panel.widthM * 1e3, 0)}`} unit="mm"
               sub={`aspect ${fmt(f.panel.aspect, 2)} · ${fmt(f.panel.count)} panels in the shell`} />}
          {p.applies && <Kpi label="Decompression opening H₀" value={fmt(p.vent.hoFt2, 2)} unit="ft²"
               sub={p.vent.capped ? "capped at 20 ft² by the rule" : `P = ${p.vent.P.toFixed(5)} · 25.365(e)(2)`} />}
        </div>
        <Note>
          Frame pitch: {f.sources.framePitch}. Stringer pitch: {f.sources.stringerPitch}. Both are measured off
          real aircraft; neither is sized by a load. The counts and the panel are computed from them and the
          sized shell.
        </Note>
      </Card>

      <Card title="Side elevation">
        <FuselageProfile fus={f} />
        <Note>{f.frames.drawn ? f.frames.anchor : f.frames.why}</Note>
        <Note>
          Heavy frames sit at the wing, engine and tail attachments — {f.sources.heavyFrames} Their stations
          follow the drawing's wing and tail positions, which are conventions until balance is modelled, so
          they are drawn without dimensions.
        </Note>
      </Card>

      <Card title="Cross-section">
        <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}><FuselageSection fus={f} /></div>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            {p.applies ? (
              <>
                <Table head={["Pressure vessel", "Value"]} numCols={[1]} rows={[
                  ["Pressurized shell length", `${fmt(p.shellLengthM, 2)} m`],
                  ["Maximum section area A_s", `${fmt(p.vent.asFt2, 1)} ft²`],
                  ["P = A_s/6240 + 0.024", p.vent.P.toFixed(5)],
                  ["H₀ = P · A_s", `${fmt(p.vent.uncappedFt2, 2)} ft²`],
                  ["Required opening", `${fmt(p.vent.hoFt2, 2)} ft²${p.vent.capped ? " (capped)" : ""}`],
                  ["Burst factor", `×${p.burstFactor} to 45,000 ft`],
                ]} />
                <Note>{p.burstNote}</Note>
                <Note>{p.boundaryWhy}</Note>
                <Note>Bulkheads are drawn {p.bulkheadShape}.</Note>
              </>
            ) : <Lead>{p.why}</Lead>}
          </div>
        </div>
      </Card>

      <Card title="What is not drawn, and why">
        <Lead>
          {f.sources.rule} Everything below is a real, named member that no obtainable source places, so it is
          listed here instead of being drawn where it would look right.
        </Lead>
        <Table head={["Feature", "Why it is not drawn"]} rows={f.notDrawn.map((n) => [n.feature, n.why])} />
      </Card>

      <Card title="What this view is, and is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {f.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
    </>
  );
}

/* ── Airfoil ─────────────────────────────────────────────────────────── */

export function AirfoilTab({ type, result }) {
  const a = useMemo(() => airfoilAdvice(result), [result]);
  if (a.unavailable) return <Empty>{a.reason}</Empty>;
  const t = a.technology, v = t.verdict;
  const tone = v.level === "conventional" ? SC.nominal : v.level === "supercritical" ? SC.caution : SC.warning;
  return (
    <>
      <Card title="What section this wing needs">
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Technology factor needed" value={fmt(t.required, 3)} unit=""
               sub={`conventional 0.87 · supercritical 0.95`} />
          <Kpi label="This wing achieves" value={fmt(t.achievedMdd, 3)} unit="M_dd"
               sub={`cruise M ${fmt(a.design.mach, 3)} · margin ${fmt(t.marginInHand, 3)}`} />
          <Kpi label="At" value={`${fmt(a.design.tc * 100, 1)} %`} unit="t/c"
               sub={`sweep ${fmt(a.design.sweepDeg, 1)}° · CL ${fmt(a.design.cl, 3)}`} />
        </div>
        <p style={{ fontSize: T.body, color: tone, margin: `${S.md}px 0 0`, fontWeight: 600 }}>{v.text}</p>
        <Note>{v.margin}</Note>
        <Note>
          Mason, <i>Configuration Aerodynamics</i> Ch. 7 Eq. (7-4):
          {" "}M_dd = A/cos Λ − (t/c)/cos²Λ − c_l/(10 cos³Λ). The thickness term is not divided by ten.
          {" "}Calibrations: {t.calibrations.map((c) => `A ${c.A} — ${c.label}`).join("; ")}.
          {" "}The FLOPS airfoil-technology scalar on this design is {fmt(t.flopsScalar, 2)}, which maps to A {fmt(t.have, 3)}.
        </Note>
      </Card>

      <Card title={a.note ? "Published sections" : `Published sections that meet it — ${a.met} of the dataset`}>
        {a.note ? <Lead>{a.note}</Lead> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Section", "Family", "t/c", "cl design", "M_dd", "margin over M·cosΛ", "source"].map((h, i) =>
                <th key={h} style={th(i >= 2 && i <= 5)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {a.candidates.map((c) => (
                <tr key={c.id} style={c === a.best ? { background: SC.inset } : undefined}>
                  <td style={td(false)}>{c.name}{c === a.best ? " ★" : ""}</td>
                  <td style={td(false)}>{c.family}</td>
                  <td style={td(true)}>{fmt(c.tc * 100, 1)} %</td>
                  <td style={td(true)}>{c.clDesign === null ? "—" : fmt(c.clDesign, 2)}</td>
                  <td style={td(true)}>{fmt(c.mDd, 3)}</td>
                  <td style={td(true)} title={c.meets ? "meets the requirement" : "does not meet it"}>
                    {c.machMargin >= 0 ? "+" : ""}{fmt(c.machMargin, 3)}
                  </td>
                  <td style={td(false)}>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Note>★ is the section with the most drag-divergence margin in hand at a thickness no thinner than
          the wing's — thinner buys Mach margin but costs structural weight, and FLOPS wing bending goes as
          (t/c)⁻¹ exactly, so the trade is real.</Note>
      </Card>

      <Card title="What this recommendation is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {a.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
      <HighLiftSection result={result} />
    </>
  );
}

/* ── High lift, on the airfoil tab because it is the same subject ─── */

function HighLiftSection({ result }) {
  const p = result.raw?.inputs ?? {};
  const [flapType, setFlapType] = useState("double-slotted");
  const [deflection, setDeflection] = useState(40);
  const [leDevice, setLeDevice] = useState("slat");
  const hl = useMemo(() => highLift({
    flapType, flapDeflectionDeg: deflection, leDevice,
    flapChordRatio: 0.30, etaInner: 0.11, etaOuter: 0.75,
    taper: p.wingTaper ?? 0.24, sweepC4Deg: p.wingSweep ?? 25,
    clMaxCleanSection: 1.60, cl0Section: 0.30, clMaxCleanWing: 1.30,
    aspectRatio: p.wingAspectRatio ?? null, supercritical: true,
  }), [flapType, deflection, leDevice, p.wingTaper, p.wingSweep, p.wingAspectRatio]);
  const inUse = p.clMaxLanding;
  const sel = { fontFamily: MONO, fontSize: T.label, background: SC.inset, color: SC.text,
                border: `1px solid ${SC.border}`, borderRadius: 3, padding: "3px 6px" };
  return (
    <>
      <Card title="High lift — CLmax computed from the flap system">
        <div style={{ display: "flex", gap: S.md, alignItems: "center", flexWrap: "wrap", marginBottom: S.md }}>
          <label style={{ fontSize: T.label, color: SC.muted }}>Flap{" "}
            <select value={flapType} onChange={(e) => setFlapType(e.target.value)} style={sel}>
              {FLAP_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ fontSize: T.label, color: SC.muted }}>Leading edge{" "}
            <select value={leDevice} onChange={(e) => setLeDevice(e.target.value)} style={sel}>
              {LE_DEVICES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ fontSize: T.label, color: SC.muted }}>Deflection{" "}
            <input type="range" min={0} max={60} step={1} value={deflection}
                   onChange={(e) => setDeflection(+e.target.value)} style={{ verticalAlign: "middle" }} />
            <span style={{ fontFamily: MONO, marginLeft: S.sm, color: SC.text }}>{deflection}°</span>
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
          <Kpi label="Section c_lmax" value={fmt(hl.clMaxSection, 2)} unit=""
               sub={`chord extension c'/c ${fmt(hl.terms.cPrimeOverC, 2)} · η_δ ${fmt(hl.terms.etaDelta, 3)}`} />
          <Kpi label="Wing ΔCLmax" value={fmt(hl.dCLmaxWing, 3)} unit=""
               sub={`TE ${fmt(hl.dCLmaxWingTE, 3)} (6.1.4.3-a) + LE ${fmt(hl.dCLmaxWingLE ?? 0, 3)} (6.1.4.3-b) — an upper bound`} />
          <Kpi label="CLmax computed" value={fmt(hl.clMaxWing, 2)} unit=""
               sub="on an assumed clean-wing CLmax of 1.30" />
          <Kpi label="CLmax in use" value={fmt(inUse, 2)} unit=""
               sub={`the sizing loop uses this — computed is ${fmt(100 * (hl.clMaxWing / inUse - 1), 0)} % away`} />
        </div>
        <Note><strong>Route:</strong> {hl.route}{hl.leNote ? ` ${hl.leNote}` : ""}</Note>
      </Card>

      <Card title="Validated in two dimensions; NOT closed in three">
        <Table head={["Configuration", "Computed c_lmax", "Measured (NASA CR-2214)", "Error"]} numCols={[1, 2, 3]}
               rows={[["single-slotted, no slat", "2.88", "2.79", "+3.2 %"],
                      ["double-slotted + slat", "4.32", "4.85", "−10.9 %"],
                      ["triple-slotted + slat", "4.97", "5.50", "−9.6 %"]]} />
        <Note>
          The section method reproduces measured two-dimensional data to about a tenth, untuned. The
          wing-level conversion still does <strong>not</strong> close, but it is no longer unexplained.
          Routing each device through its own DATCOM equation &mdash; 6.1.4.3-a for the flap, 6.1.4.3-b for
          the slat &mdash; instead of pushing Torenbeek&rsquo;s combined section value through the
          trailing-edge factor takes the 737-800 from about 3.34 to {fmt(hl.clMaxWing, 2)} against the
          aircraft&rsquo;s own 2.35. Figure 6.1.4.3-10 is titled, in DATCOM&rsquo;s own words,
          &ldquo;planform correction factor &mdash; <strong>trailing-edge flaps</strong>&rdquo;.
        </Note>
        <Note>
          The residual is an <strong>extrapolation, not a defect</strong>. Figure 6.1.4.3-9 prints its own
          database along the bottom of the chart: twelve planforms at 35&ndash;60&deg; of sweep, aspect ratio
          2.9&ndash;8.0, taper 0.25&ndash;0.62, on 1940s&ndash;50s NACA 6-series and circular-arc sections
          six to twelve per cent thick. No point on it exceeds a CLmax of about 2.05. A modern transport sits
          outside that database on three axes at once, and DATCOM says of its own method that &ldquo;the
          estimation of wing maximum-lift coefficient is at best approximate&rdquo; and that &ldquo;large
          crossflow components on the wing at the stall make estimates based on section data
          inaccurate&rdquo;.
        </Note>
      </Card>

      <Card title="Where this wing sits against DATCOM's own database — Figure 6.1.4.3-9">
        {hl.domain.length === 0 ? (
          <Note>This wing is inside the database Figure 6.1.4.3-9 was fitted on.</Note>
        ) : (
          <>
            <Table head={["Axis", "This wing", "Database", "Direction"]} numCols={[1]}
                   rows={hl.domain.map((d) => [
                     d.axis,
                     typeof d.value === "number" ? fmt(d.value, 2) : String(d.value),
                     Array.isArray(d.range) ? `${d.range[0]} to ${d.range[1]}` : String(d.range),
                     d.direction,
                   ])} />
            <ul style={{ margin: `${S.md}px 0 0`, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
              {hl.domain.map((d, i) => <li key={i}>{d.note}</li>)}
            </ul>
          </>
        )}
        <Note>
          Source: {DATCOM_WING_DATABASE.source}.
        </Note>
      </Card>

      <Card title="What this is, and is not">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: T.label, color: SC.muted, lineHeight: 1.7 }}>
          {hl.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Card>
    </>
  );
}

/* ── Risk ────────────────────────────────────────────────────────────── */

export function RiskTab({ type, result }) {
  const reg = useMemo(() => riskRegister(type, result, { inputSpecs: typeOf(type).inputs }), [type, result]);
  const ex = useMemo(() => exceedance(type, result), [type, result]);
  const colour = { high: SC.warning, medium: SC.caution, low: SC.nominal };
  const at = (x) => ex?.curve.find((c) => c.errPct === x);
  return (
    <>
      {ex && (
        <Card title={`How often has the tool been this wrong? — ${ex.n} aircraft like this one`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
            {[5, 10, 20].map((x) => at(x) && (
              <Kpi key={x} label={`Out by more than ${x} %`} value={fmt(at(x).exceed, 0)} unit="%"
                   sub={`of the ${ex.n} in "${ex.stratum}"`} />
            ))}
          </div>
          <Note>
            These are order statistics of the errors the tool actually made, not a fitted distribution.
            The residuals are not Gaussian — a normal law with the same mean absolute error would put 35 %
            of aircraft inside 5 %, and 51 % are — so nothing is fitted to them.
          </Note>
        </Card>
      )}
      <Card title={`Risk register — ${reg.counts.high} high, ${reg.counts.medium} medium, ${reg.counts.low} low`}>
        {reg.entries.map((e) => (
          <div key={e.id} style={{ borderLeft: `3px solid ${colour[e.severity]}`, padding: `2px 0 2px ${S.md}px`,
                                   margin: `0 0 ${S.md}px` }}>
            <div style={{ fontSize: T.body, color: SC.text, fontWeight: 600 }}>{e.title}</div>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>{e.evidence}</div>
            <div style={{ fontSize: T.label, color: SC.subtle, lineHeight: 1.6 }}>{e.consequence}</div>
            <div style={{ fontSize: T.label, color: colour[e.severity], lineHeight: 1.6 }}>{e.reduce}</div>
          </div>
        ))}
        <Note>{reg.note}</Note>
      </Card>
    </>
  );
}

/* ── Compliance ──────────────────────────────────────────────────────── */

export function ComplianceTab({ type, result }) {
  const m = useMemo(() => complianceMatrix(type, result), [type, result]);
  const tone = { PASS: SC.nominal, FAIL: SC.warning, "NOT EVALUATED": SC.subtle };
  return (
    <>
      <Card title={`Requirement status — ${m.counts.pass} pass, ${m.counts.fail} fail, ${m.counts.notEvaluated} not evaluated`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, marginBottom: S.md }}>
          {m.code && <Kpi label="Aerodrome reference code" value={m.code.code} unit=""
                          sub={`field ${fmt(m.code.arflM)} m · span ${fmt(m.code.spanM, 1)} m`} />}
          <Kpi label="Passing" value={m.counts.pass} unit="" sub="of the rows this tool can feed" />
          <Kpi label="Not evaluated" value={m.counts.notEvaluated} unit="" sub="not a pass" />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["", "14 CFR", "CS-25", "Requirement", "Achieved", "Required", "Margin"].map((h, i) =>
            <th key={h + i} style={th(i >= 4)}>{h}</th>)}</tr></thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td(false), color: tone[r.verdict], fontWeight: 600, whiteSpace: "nowrap" }}>
                  {r.verdict === "PASS" ? "●" : r.verdict === "FAIL" ? "▲" : "○"} {r.verdict}
                </td>
                <td style={td(false)}>{r.faa}</td>
                <td style={td(false)}>{r.cs}</td>
                <td style={td(false)}>{r.title}</td>
                <td style={td(true)}>{r.format && Number.isFinite(r.achieved) ? r.format(r.achieved) : "—"}</td>
                <td style={td(true)}>{r.format && Number.isFinite(r.required) ? r.format(r.required) : "—"}</td>
                <td style={{ ...td(true), color: Number.isFinite(r.margin) ? (r.margin >= 0 ? SC.nominal : SC.warning) : SC.subtle }}>
                  {r.format && Number.isFinite(r.margin) ? (r.margin >= 0 ? "+" : "") + r.format(r.margin) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>{m.disclaimer}</Note>
        <Note>Read at {m.amendments.faa}; {m.amendments.easa}.</Note>
      </Card>

      <Card title="Notes on individual rows">
        {m.rows.filter((r) => r.note || r.detail).map((r) => (
          <div key={r.id} style={{ borderLeft: `3px solid ${tone[r.verdict]}`, padding: `2px 0 2px ${S.md}px`, margin: `0 0 ${S.sm}px` }}>
            <div style={{ fontSize: T.label, color: SC.text, fontWeight: 600 }}>{r.faa} — {r.title}</div>
            <div style={{ fontSize: T.label, color: SC.muted, lineHeight: 1.6 }}>{r.detail || r.note}</div>
          </div>
        ))}
      </Card>
    </>
  );
}

export function WeightsTab({ result }) {
  return (
    <>
      {result.weightGroups.map((g) => (
        <Card key={g.name} title={`${g.name}: ${fmt(g.kg)} kg`}>
          <HBarChart rows={g.items.filter((i) => i.kg > 0).map((i) => ({ name: i.name, value: Math.round(i.kg) }))} />
        </Card>
      ))}
      <Card title="Mass summary">
        <Table head={["Item", "kg", "lb", "% of take-off"]} numCols={[1, 2, 3]}
          rows={[["Empty", result.emptyKg], ["Operating empty", result.oewKg], ["Payload", result.payloadKg],
                 ["Zero fuel", result.zfwKg], ["Fuel", result.fuelKg], ["Take-off", result.mtowKg]].map(([n, v]) =>
            [n, fmt(v), fmt(v / 0.45359237), `${fmt(100 * v / result.mtowKg, 1)} %`])} />
      </Card>
    </>
  );
}

export function AeroTab({ result }) {
  const polar = useMemo(() => polarCurve(result), [result]);
  const b = result.cruise.breakdown;
  return (
    <>
      <Card title={`Drag polar at M ${fmt(polar.mach, 3)}, ${fmt(polar.altFt)} ft`}>
        <Lead>Method: {polar.method}.</Lead>
        <PolarChart polar={polar} />
        <Note>Cruise CL {fmt(result.cruise.cl, 3)}, L/D {fmt(result.cruise.LD, 2)}; best L/D {fmt(result.cruise.LDmax, 2)}.</Note>
      </Card>
      {b && (
        <Card title="FLOPS drag build-up at the cruise point">
          <HBarChart unit="" rows={[["Skin friction and form", b.skinFriction], ["Compressibility", b.compressibility],
                                   ["Lift-dependent pressure (Delta Method)", b.pressure], ["Induced", b.induced]]
                                   .map(([name, v]) => ({ name, value: +(v * 1e4).toFixed(1) }))} />
          <Note>In drag counts (1 count = 0.0001). Total CD {fmt(b.cd, 5)}.</Note>
        </Card>
      )}
    </>
  );
}

export function PropulsionTab({ result }) {
  const pr = result.propulsion, p = result.raw.inputs;
  const rows = [["Engines", pr.engines], [pr.kind === "thrust" ? "Thrust per engine" : "Take-off power per engine", `${fmt(pr.perEngine, 1)} ${pr.unit} (${fmt(pr.perEngineImperial)} ${pr.unitImperial})`],
                [pr.toWeightUnit, fmt(pr.toWeight, pr.kind === "thrust" ? 3 : 1)], ["Sized by", pr.governedBy]];
  if (p.tsfcCruise) rows.push(["Cruise TSFC", `${p.tsfcCruise} lb/(lbf·h)`], ["Bypass ratio", p.bypassRatio]);
  if (p.sfcCruise) rows.push(["Cruise PSFC", `${p.sfcCruise} lb/(hp·h)`]);
  if (p.sfc) rows.push(["Specific fuel consumption", `${p.sfc} lb/(hp·h)`]);
  if (p.engineLocation) rows.push(["Engine location", p.engineLocation]);
  if (pr.group) Object.entries(pr.group).forEach(([k, v]) => { if (Number.isFinite(v)) rows.push([`${k} (each)`, `${fmt(v)} lb`]); });
  return <Card title="Propulsion"><Table head={["Quantity", "Value"]} rows={rows} /></Card>;
}

/* ── Trades ──────────────────────────────────────────────────────────── */

export function PayloadRangeTab({ result }) {
  const pr = useMemo(() => payloadRange(result), [result]);
  return (
    <Card title="Payload-range diagram">
      <PayloadRangeChart pr={pr} />
      <Table head={["Point", "Range (nm)", "Payload (kg)", "Fuel (kg)"]} numCols={[1, 2, 3]}
        rows={pr.points.map((x) => [x.label, fmt(x.rangeNm), fmt(x.payloadKg), Number.isFinite(x.fuelKg) ? fmt(x.fuelKg) : "—"])} />
      <Note>{pr.note}</Note>
    </Card>
  );
}

/* Runs a list of jobs a few at a time so the page stays responsive. */
function useChunked(jobs, runner) {
  const [out, setOut] = useState([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancel = false, i = 0;
    setOut([]); setDone(false);
    if (!jobs) return undefined;
    const step = () => {
      if (cancel) return;
      const t0 = performance.now(), batch = [];
      while (i < jobs.length && performance.now() - t0 < 40) batch.push(runner(jobs[i++]));
      setOut((o) => [...o, ...batch]);
      if (i < jobs.length) setTimeout(step, 0); else setDone(true);
    };
    setTimeout(step, 0);
    return () => { cancel = true; };
  }, [jobs, runner]);
  return { out, done };
}

export function SensitivityTab({ type, mode, params, result }) {
  const [go, setGo] = useState(false);
  const jobs = useMemo(() => (go ? sensitivityCases(type, params) : null), [go, type, params]);
  const runner = useMemo(() => (c) => ({ ...c, r: evaluateCase(type, c.params, mode) }), [type, mode]);
  const { out, done } = useChunked(jobs, runner);
  useEffect(() => setGo(false), [type, params]);
  const base = result.mtowKg;
  const rows = out.filter((c) => c.r.ok).map((c) => ({ name: c.label.slice(0, 40), value: +(100 * (c.r.mtowKg / base - 1)).toFixed(2) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 20);
  return (
    <Card title="What the take-off mass depends on">
      <Lead>Each numeric input is moved by +5 % (integers by one), one at a time, and the aircraft {mode === "size" ? "re-sized" : "re-analysed"}.
        The bars are the change in take-off mass.</Lead>
      {!go && <button type="button" onClick={() => setGo(true)} style={{ padding: "6px 14px", background: SC.inset, color: SC.text, border: `1px solid ${SC.caution}`, borderRadius: 3, cursor: "pointer" }}>
        Run {numericInputs(type).length} cases</button>}
      {go && !done && <Note>Running… {out.length} / {jobs?.length ?? 0}</Note>}
      {rows.length > 0 && <HBarChart rows={rows} unit="%" colorBy={(r) => (r.value > 0 ? SC.caution : SC.nominal)} />}
      {done && <Note>{out.filter((c) => !c.r.ok).length} cases did not close and are left out. The 20 largest effects are shown.</Note>}
    </Card>
  );
}

export function TradeTab({ type, mode, params }) {
  const nums = useMemo(() => numericInputs(type), [type]);
  const defX = nums.find(([k]) => /range|designRange|rangeNm/.test(k))?.[0] ?? nums[0][0];
  const defY = nums.find(([k]) => /aspectRatio|AR$/.test(k))?.[0] ?? nums[1][0];
  const [xKey, setX] = useState(defX), [yKey, setY] = useState(defY);
  const [metric, setMetric] = useState("mtowKg");
  const [go, setGo] = useState(0);
  useEffect(() => { setX(defX); setY(defY); }, [type]);   // eslint-disable-line react-hooks/exhaustive-deps
  const spec = (k) => typeOf(type).inputs[k];
  const grid5 = (k) => { const s = spec(k), v = params[k] ?? s.value; return [0.7, 0.85, 1, 1.15, 1.3].map((f) => Math.min(s.max, Math.max(s.min, v * f))); };
  const jobs = useMemo(() => (go ? grid5(yKey).map((y) => ({ y, xs: grid5(xKey) })) : null), [go]); // eslint-disable-line react-hooks/exhaustive-deps
  const runner = useMemo(() => (j) => tradeGrid(type, params, xKey, j.xs, yKey, [j.y])[0], [type, params, xKey, yKey]);
  const { out, done } = useChunked(jobs, runner);
  const family = out.map((f) => ({ y: f.y, row: f.row.map((c) => ({ x: c.x, value: c.ok ? c[metric] : null })) }));
  const sel = (v, set) => (
    <select value={v} onChange={(e) => set(e.target.value)} style={{ background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, fontSize: T.label, maxWidth: 260 }}>
      {nums.map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
    </select>
  );
  return (
    <Card title="Trade study (carpet)">
      <Lead>Two inputs swept over 70-130 % of their current values (within their allowed range): 25 {mode === "size" ? "sizings" : "analyses"}.</Lead>
      <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", alignItems: "center", fontSize: T.label, color: SC.muted }}>
        x {sel(xKey, setX)} lines {sel(yKey, setY)}
        result <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, fontSize: T.label }}>
          <option value="mtowKg">Take-off mass (kg)</option><option value="fuelKg">Fuel (kg)</option>
          <option value="oewKg">Operating empty mass (kg)</option><option value="wingAreaM2">Wing area (m²)</option>
          <option value="perEngine">Engine size (kN or kW)</option>
        </select>
        <button type="button" onClick={() => setGo((g) => g + 1)} style={{ padding: "5px 12px", background: SC.inset, color: SC.text, border: `1px solid ${SC.caution}`, borderRadius: 3, cursor: "pointer" }}>Run</button>
      </div>
      {family.length > 0 && <LineFamily family={family} xLabel={`${spec(xKey).label} (${spec(xKey).unit})`} yLabel={metric} seriesLabel={`${spec(yKey).label} =`} />}
      {go > 0 && !done && <Note>Running… {out.length} / 5 lines</Note>}
      {done && <Note>Gaps in a line are designs that did not close.</Note>}
    </Card>
  );
}

/* ── Compliance ──────────────────────────────────────────────────────── */

export function WarningsTab({ result }) {
  const w = useMemo(() => typeWarnings(result), [result]);
  return w.length ? <Warnings items={w} /> : <Card title="Warnings and limitations"><Lead>None raised for this design.</Lead></Card>;
}

export function ValidationTab({ type }) {
  const rows = useMemo(() => typeValidation(type), [type]);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <Table head={["Check", "Published", "Predicted", "Error"]} numCols={[1, 2, 3]}
            rows={rows.filter((r) => r.group === g).map((r) => [r.name, `${fmt(r.actual)} ${r.unit}`, `${fmt(r.predicted)} ${r.unit}`, pctTxt(r.errPct)])} />
        </Card>
      ))}
      <Card title="Accuracy on the dataset"><Lead>{METHOD_ACCURACY[type].summary}</Lead><Note>Gate: {METHOD_ACCURACY[type].gate}. Every value above is recomputed live, not quoted.</Note></Card>
    </>
  );
}

export function RealityTab({ result, reference }) {
  const rc = useMemo(() => realityCheck(result, reference), [result, reference]);
  if (!rc.count) return <Empty>No reference aircraft of this type in the table.</Empty>;
  const ptile = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}th percentile` : "—");
  return (
    <>
      <Card title={`Where this design sits among ${rc.count} real ${typeOf(result.type).label.toLowerCase()}s`}>
        <Lead>Operating empty fraction {fmt(100 * rc.design.frac, 1)} % ({ptile(rc.percentile.oewFraction)} of the aircraft that publish it);
          wing loading {fmt(rc.design.ws)} kg/m² ({ptile(rc.percentile.wingLoading)}).</Lead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: S.md }}>
          <ReferenceScatter points={rc.oewFraction.map((r) => ({ x: r.mtow, y: +(r.frac * 100).toFixed(1), name: r.name }))}
            design={{ x: rc.design.mtow, y: +(rc.design.frac * 100).toFixed(1) }} xLabel="Take-off mass (kg)" yLabel="Empty / take-off (%)" />
          <ReferenceScatter points={rc.wingLoading.map((r) => ({ x: r.mtow, y: Math.round(r.ws), name: r.name }))}
            design={{ x: rc.design.mtow, y: Math.round(rc.design.ws) }} xLabel="Take-off mass (kg)" yLabel="Wing loading (kg/m²)" />
        </div>
      </Card>
      <Card title="Nearest real aircraft (by take-off mass, range and wing area)">
        <Table head={["Aircraft", "MTOW (kg)", "OEW (kg)", "Wing (m²)", "Range (nm)", "Seats", "Engines", "Source"]} numCols={[1, 2, 3, 4, 5]}
          rows={[[<b key="d">This design</b>, fmt(result.mtowKg), fmt(result.oewKg), fmt(result.wingAreaM2, 1), fmt(result.designRangeNm), "", `${result.propulsion.engines} × ${fmt(result.propulsion.perEngine, 1)} ${result.propulsion.unit}`, ""],
                 ...rc.near.map((r) => [aircraftName(r), fmt(r.mtow_kg), fmt(r.oew_kg), fmt(r.wing_area_m2, 1),
                   fmt(r.range_nm), fmt(r.pax_max ?? r.pax_typical), `${r.engine_count ?? ""} × ${r.engine_model ?? ""}`.slice(0, 40),
                   <span key="s" title={`${r.source_file ?? ""} — ${r.source_pages ?? ""}`}
                     style={{ color: SC.advisory, fontSize: T.micro, cursor: "help", borderBottom: `1px dotted ${SC.advisory}` }}>document</span>])]} />
        <Note>Reference values are manufacturer or regulator figures only. Definitions differ between sources (for example the OEW basis);
          hover a source for its document and pages.</Note>
      </Card>
    </>
  );
}

/* ── Tools ───────────────────────────────────────────────────────────── */

export function ExportTab({ type, mode, params, analysis, result, onOpen }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const download = (name, text, mime) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const design = () => JSON.stringify({ format: "aircraft-design", formatVersion: 1, type, mode, params, analysis,
    summary: { mtowKg: result.mtowKg, oewKg: result.oewKg, fuelKg: result.fuelKg, wingAreaM2: result.wingAreaM2 },
    savedAt: new Date().toISOString() }, null, 2);
  const csv = () => {
    const rows = [["quantity", "value", "unit"], ["type", type, ""], ["mode", mode, ""],
      ["take-off mass", result.mtowKg, "kg"], ["operating empty mass", result.oewKg, "kg"], ["payload", result.payloadKg, "kg"],
      ["fuel", result.fuelKg, "kg"], ["wing area", result.wingAreaM2, "m2"], ["span", result.spanM, "m"],
      [result.propulsion.kind === "thrust" ? "thrust per engine" : "power per engine", result.propulsion.perEngine, result.propulsion.unit],
      ["cruise L/D", result.cruise.LD, ""],
      ...result.weightGroups.flatMap((g) => g.items.map((i) => [`${g.name}: ${i.name}`, i.kg, "kg"])),
      ...Object.entries(params).map(([k, v]) => [`input ${k}`, v, typeOf(type).inputs[k]?.unit ?? ""])];
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  };
  const open = (f) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.format !== "aircraft-design") throw new Error("not an aircraft design file (eVTOL designs open in eVTOL mode)");
        typeOf(d.type);
        onOpen(d); setMsg(`Opened a ${typeOf(d.type).label} design saved ${d.savedAt ?? ""}.`);
      } catch (e) { setMsg(`Could not open: ${e.message}`); }
    };
    rd.readAsText(f);
  };
  const btn = { padding: "6px 14px", background: SC.inset, color: SC.text, border: `1px solid ${SC.border}`, borderRadius: 3, cursor: "pointer", marginRight: S.md, marginBottom: S.md };
  return (
    <Card title="Export and open">
      <button type="button" style={btn} onClick={() => download(`${type}-design.aircraft.json`, design(), "application/json")}>⤓ Design file (.aircraft.json)</button>
      <button type="button" style={btn} onClick={() => download(`${type}-results.csv`, csv(), "text/csv")}>⤓ Results (.csv)</button>
      <button type="button" style={btn} onClick={() => window.print()}>⎙ Print this page</button>
      <button type="button" style={btn} onClick={() => fileRef.current?.click()}>⤒ Open design file…</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) open(e.target.files[0]); e.target.value = ""; }} />
      {msg && <Note>{msg}</Note>}
      <Note>A design file holds the aircraft type, the job, every input and a result summary. It reopens here with today's engine,
        so a changed result means a changed method.</Note>
    </Card>
  );
}

export function MethodsTab({ type }) {
  const t = typeOf(type);
  const src = [...new Set(Object.values(t.inputs).map((s) => s.source).filter(Boolean))];
  const counts = Object.values(t.inputs).reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});
  return (
    <>
      <Card title={`${t.label}: method`}>
        <Lead>{t.blurb}</Lead>
        <Note>Inputs: {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}. Documentation: docs/AIRCRAFT-MODE.md and the class notes in docs/.</Note>
      </Card>
      <Card title="Where every default comes from">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {src.map((s, i) => <li key={i} style={{ fontSize: T.label, color: SC.muted, marginBottom: 4 }}>{s}</li>)}
        </ul>
      </Card>
      <Card title="All types">
        <Table head={["Type", "Method"]} rows={TYPE_IDS.map((id) => [typeOf(id).label, typeOf(id).blurb])} />
      </Card>
    </>
  );
}
