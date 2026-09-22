import { useState, useMemo } from "react";
import { SC } from "../lib/theme.js";
import { VSP_MODELS, VSP_META, derived, paramsFromModel,
         wingLoadingForMTOW, minCruiseSpeedFor, compareToModel } from "../data/vsp-models.js";
import { runSizing } from "../engine";
import { engineInputs } from "../lib/designfile.js";

/* Tab 28 — NASA OpenVSP MODELS.
   Pick a published NASA model and the tool sizes THAT aircraft: rotor count,
   diameter, solidity, blade count, tilt architecture, wing and fuselage all
   come out of the released .vsp3 file rather than from a slider.

   The two things this must not blur:
     - GEOMETRY is published, so it is replicated and then scored.
     - MASS, POWER and MISSION are NOT in the file, so gross weight is a RESULT
       and the mission is the user's. Nothing here invents a weight. */
export function VspModelsTab(ctx) {
  const { params, set } = ctx;
  const [sel, setSel]   = useState("raven");
  const [res, setRes]   = useState(null);
  const [busy, setBusy] = useState(false);

  const m = VSP_MODELS[sel], meta = VSP_META[sel];
  const d = useMemo(() => derived(m), [m]);

  /* Close the airframe: MTOW fixes W/S (holding the published area) and the
     wing fixes the minimum cruise speed, so both iterate with the loop. */
  const replicate = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        let M = params.payload > 600 ? 5000 : 1000, V = params.vCruise, R = null, p = null;
        for (let i = 0; i < 60; i++) {
          V = Math.max(params.vCruise, 1.02 * minCruiseSpeedFor(sel, M, params.clCruiseMax ?? 0.90));
          p = engineInputs({ ...paramsFromModel(sel, params), vCruise: V,
                wingLoadingNm2: wingLoadingForMTOW(sel, M) });
          R = runSizing(p);
          if (!R || !isFinite(R.MTOW)) break;
          const nM = M + 0.5 * (R.MTOW - M);
          if (Math.abs(nM - M) < 0.01) { M = nM; break; }
          M = nM;
        }
        setRes(R && isFinite(R.MTOW)
          ? { R, MTOW: M, V, cmp: compareToModel(sel, R), params: p }
          : { error: "the loop did not close on this mission — try a smaller payload or range" });
      } catch (e) { setRes({ error: String(e?.message ?? e) }); }
      setBusy(false);
    }, 0);
  };

  /* Push the replicated design into the app's own parameters. */
  const applyToDesign = () => {
    if (!res?.params) return;
    for (const k of ["configType","nPropHover","propDiam","solidity","nBlades","nRotorsStopped",
                     "AR","taper","tc","fusLen","fuselageSizing","rotorSizing",
                     "wingLoadingNm2","vCruise"]) {
      if (res.params[k] !== undefined) set(k)(res.params[k]);
    }
  };

  const card = { background: SC.panel, border: `1px solid ${SC.border}`,
                 borderRadius: 8, padding: 12 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
        Geometry read <b>directly out of NASA's released <code>.vsp3</code> files</b> — not
        retyped from a paper. The files publish <b>geometry only</b>, so gross weight is a
        <b> result</b> here and the mission stays yours.
      </div>
      <div style={{ background: SC.advisory + "12", border: `1px solid ${SC.advisory}44`,
                    borderRadius: 8, padding: "10px 12px", fontSize: 11.5,
                    color: SC.primary, lineHeight: 1.6 }}>
        <b>This tab is the CHECK, not the design path.</b> NASA's layout is already the
        template every aircraft in this tool is built on — the station fractions measured
        from these two models drive the <i>OpenVSP</i> tab's 3D view and <code>.vsp3</code>
        export for <i>your</i> parameters, adapting per configuration (drop the tilting tip
        rotors and add a pusher and it is a lift+cruise; tilt them all and it is a
        tiltrotor). What this tab does is prove the parametric model can reproduce a real
        published aircraft when fed that aircraft's numbers — which is the only way to know
        the template is faithful rather than merely plausible.
      </div>

      {/* ── model picker ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
        {Object.keys(VSP_MODELS).map(k => {
          const mm = VSP_META[k], on = k === sel;
          return (
            <button key={k} type="button" onClick={() => { setSel(k); setRes(null); }}
              style={{ textAlign: "left", cursor: "pointer", borderRadius: 8, padding: "10px 12px",
                background: on ? SC.advisory + "1C" : SC.panel,
                border: `1px solid ${on ? SC.advisory : SC.border}`, color: SC.primary }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{mm.label}</div>
              <div style={{ color: SC.muted, fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>
                {mm.subtitle}</div>
              {!mm.isEVTOL && (
                <div style={{ color: SC.caution, fontSize: 10, marginTop: 4 }}>
                  reference only — cannot be sized as an eVTOL</div>)}
            </button>
          );
        })}
      </div>

      {/* ── what the file says ───────────────────────────────────────── */}
      <div style={card}>
        <div style={{ color: SC.muted, fontSize: 10.5, textTransform: "uppercase",
                      letterSpacing: 0.7, marginBottom: 8 }}>
          published geometry — {m.file} (model units {m.modelUnit}, converted to SI)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 10, fontSize: 12 }}>
          {[["Rotors", `${d.nRotors} — ${d.nTilting} tilt + ${d.nLiftOnly} lift-only`],
            ["Rotor diameter", `${d.rotorDiam_m} m`],
            ["Blades / solidity", `${d.blades} / σ ${d.solidity}`],
            ["Blade chord", `${d.bladeChord_m} m (over-determined)`],
            ["Disk area", `${d.diskArea_m2} m²`],
            ["Wing", `${d.wingSpan_m} m span, ${d.wingArea_m2} m²`],
            ["Aspect ratio", d.wingAR],
            ["Fuselage", `${d.fuselageLen_m} m`],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: SC.muted, fontSize: 10 }}>{k}</div>
              <div style={{ color: SC.primary, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ color: SC.muted, fontSize: 11, marginTop: 10, lineHeight: 1.55 }}>
          {meta.src}
          {d.rotorsOutboardOfTip && (
            <> <b style={{ color: SC.primary }}>Rotors sit outboard of the wingtip</b>{" "}
            ({d.rotorHalfSpan_m} m against a {(d.wingSpan_m / 2).toFixed(2)} m wing half-span),
            which the boom model has to respect.</>)}
        </div>
      </div>

      {meta.isEVTOL ? (
        <div>
          <button type="button" onClick={replicate} disabled={busy}
            style={{ background: busy ? SC.dim : SC.advisory, color: SC.bg, border: "none",
                     borderRadius: 6, padding: "9px 18px", fontWeight: 600,
                     cursor: busy ? "wait" : "pointer", fontSize: 13 }}>
            {busy ? "Closing the airframe…" : `Replicate ${meta.label}`}
          </button>
          <span style={{ color: SC.muted, fontSize: 11, marginLeft: 12 }}>
            sizes this airframe on your mission — {params.payload} kg over {params.range} km
          </span>
        </div>
      ) : (
        <div style={{ ...card, color: SC.muted, fontSize: 12, lineHeight: 1.6 }}>
          The BD-6 is a conventional single-prop light aircraft and is <b>not</b> sized here.
          It is included because <b>RAVEN is built on this fuselage</b>: the BD-6 body is
          177.280 in and RAVEN's is 14.7733 ft — the same 4.50 m to five figures. That is
          also what identifies RAVEN as a piloted-scale demonstrator rather than a large
          transport, and it is how the model's units were resolved.
        </div>
      )}

      {res?.error && <div style={{ ...card, color: SC.warning }}>{res.error}</div>}

      {res?.cmp && (
        <>
          <div style={{ ...card }}>
            <div style={{ color: SC.muted, fontSize: 10.5, textTransform: "uppercase",
                          letterSpacing: 0.7, marginBottom: 8 }}>
              replication — engine against the file
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: SC.muted }}>
                  {["Quantity", "Published", "Engine", "Error"].map((h, i) => (
                    <th key={h} style={{ textAlign: i ? "right" : "left", padding: "6px 8px",
                                         borderBottom: `1px solid ${SC.border}` }}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {res.cmp.rows.map(r => (
                  <tr key={r.key} style={{ color: SC.primary }}>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${SC.dim}` }}>
                      {r.key}{r.unit ? ` (${r.unit})` : ""}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right",
                                 borderBottom: `1px solid ${SC.dim}` }}>{r.published}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right",
                                 borderBottom: `1px solid ${SC.dim}` }}>
                      {r.engine != null ? (+r.engine).toFixed(3) : "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right",
                                 borderBottom: `1px solid ${SC.dim}`,
                                 color: r.errPct == null ? SC.muted
                                   : Math.abs(r.errPct) <= 1 ? SC.nominal : SC.caution }}>
                      {r.errPct != null ? `${r.errPct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ color: SC.muted, fontSize: 11, marginTop: 9, lineHeight: 1.55 }}>
              {res.cmp.note}{" "}
              <b style={{ color: SC.primary }}>Aspect ratio</b> is recomputed from the span and
              area the engine produced, and <b style={{ color: SC.primary }}>blade chord</b> is
              over-determined in the file (diameter, blade count and solidity are all
              published) — so those two test the wing and rotor models rather than echo an
              input.
            </div>
          </div>

          <div style={{ ...card, display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            {[["Gross weight", `${res.MTOW.toFixed(0)} kg`, "a RESULT — no mass in the file"],
              ["Cruise speed", `${res.V.toFixed(1)} m/s`,
               `the wing's own minimum at CL ${(params.clCruiseMax ?? 0.9)}`],
              ["Pack", `${res.R.PackkWh?.toFixed(0)} kWh`, "sized on your mission"],
              ["Hover power", `${res.R.Phov?.toFixed(0)} kW`, `${(res.R.Phov/res.MTOW).toFixed(3)} kW/kg`],
            ].map(([k, v, s]) => (
              <div key={k}>
                <div style={{ color: SC.muted, fontSize: 10, textTransform: "uppercase",
                              letterSpacing: 0.6 }}>{k}</div>
                <div style={{ color: SC.primary, fontSize: 19, fontWeight: 600 }}>{v}</div>
                <div style={{ color: SC.muted, fontSize: 10.5, lineHeight: 1.4 }}>{s}</div>
              </div>
            ))}
          </div>

          <div>
            <button type="button" onClick={applyToDesign}
              style={{ background: SC.nominal, color: SC.bg, border: "none", borderRadius: 6,
                       padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              Apply this airframe to the design
            </button>
            <span style={{ color: SC.muted, fontSize: 11, marginLeft: 12 }}>
              pushes the model's geometry into every other tab
            </span>
          </div>
        </>
      )}
    </div>
  );
}
