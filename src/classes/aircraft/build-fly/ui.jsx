/* Small pieces the aircraft Build and Fly tabs share: the provenance chip,
   a fact's value, the buttons, and the lazy three.js mount. */
import { useEffect, useRef } from "react";
import { SC } from "../../../lib/theme.js";
import { T, S, MONO, SANS } from "../../../ui/tokens.js";
import { fmt, Q } from "../../ui-kit.jsx";

const CONVERTS = new Set(["m", "m²", "kg", "kt", "ft", "nm", "kN", "kW"]);

export const PROV_TEXT = Object.freeze({
  sized: "sized", sourced: "sourced", derived: "derived", partly: "partly sized", assumed: "assumed", drawn: "drawn",
});

export function ProvChip({ prov, title }) {
  const tone = prov === "drawn" || prov === "assumed" ? SC.caution : prov === "sourced" || prov === "derived" || prov === "partly" ? SC.advisory : SC.nominal;
  return (
    <span title={title ?? undefined} style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: T.micro,
      fontFamily: SANS, letterSpacing: "0.04em", color: tone, border: `1px solid ${tone}`, whiteSpace: "nowrap" }}>
      {PROV_TEXT[prov] ?? prov}
    </span>
  );
}

/* A number with its unit, converted to the reader's unit system where the
   unit is one the system converts. */
export function Num({ v, u, d = 0 }) {
  if (!Number.isFinite(v)) return <>—</>;
  if (CONVERTS.has(u)) return <Q v={fmt(v, d)} u={u} />;
  return <>{fmt(v, d)}{u === "°" ? "°" : u ? ` ${u}` : ""}</>;
}

export function FactValue({ f }) {
  if (f.prov === "drawn") return <span style={{ color: SC.muted }}>not computed</span>;
  if (f.text) return <>{f.text}</>;
  return <Num v={f.value} u={f.unit} d={f.d} />;
}

export function chip(on) {
  return { padding: "5px 11px", fontSize: T.label, borderRadius: 999, cursor: "pointer", fontFamily: SANS,
    background: on ? SC.inset : "transparent", color: on ? SC.text : SC.muted, border: `1px solid ${on ? SC.caution : SC.border}` };
}
/* The eVTOL build lab's gold (EvtolBuildLab.jsx ACC / ACC_INK): fixed in
   both themes, because the light theme's caution colour is a dark olive
   that the dark ink cannot be read on. */
const ACC = "#F2B23A", ACC_INK = "#1A1405";
export function primaryBtn() {
  return { padding: "7px 16px", fontSize: T.label, borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700,
    background: ACC, color: ACC_INK, border: `1px solid ${ACC}` };
}

export const panel = () => ({ background: SC.panel, border: `1px solid ${SC.border}`, borderRadius: 12, padding: S.lg, marginBottom: S.lg });
export const kicker = () => ({ fontSize: T.micro, letterSpacing: "0.16em", textTransform: "uppercase", color: SC.muted, fontFamily: SANS, fontWeight: 600 });
export const mono = { fontFamily: MONO };

/* Mount a three.js scene on the canvas once it is on the page, and keep
   it sized. `mount(module, canvas)` returns the scene's api; the scene
   module is fetched only here, so three.js never loads unless the tab
   is opened. Remounts when `key` changes; disposes on unmount. */
export function useLazyScene(canvasRef, key, mount) {
  const apiRef = useRef(null);
  useEffect(() => {
    let alive = true, ro = null;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    import("./scene.js").then((m) => {
      if (!alive) return;
      apiRef.current = mount(m, canvas);
      ro = new window.ResizeObserver(() => apiRef.current?.resize());
      ro.observe(canvas);
    }).catch(() => {});
    return () => { alive = false; ro?.disconnect(); apiRef.current?.dispose(); apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return apiRef;
}
