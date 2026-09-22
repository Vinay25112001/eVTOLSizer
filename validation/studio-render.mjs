/* =====================================================================
   AIRCRAFT STUDIO RENDER GATE
   =====================================================================
   The tab-render gate's method applied to aircraft mode: the whole studio
   and every tab body are bundled with esbuild and rendered to static
   markup with react-dom/server, for every aircraft type, both jobs and
   both themes, and the markup is read for
     - a render that throws,
     - NaN, undefined, Infinity or [object Object] reaching the screen,
     - the eVTOL sizer leaking in (its title must not appear).
   Recharts draws nothing server-side (ResponsiveContainer has no size),
   so the figures are checked by aircraft-engine.mjs on their data.
   ===================================================================== */
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("AIRCRAFT STUDIO RENDER GATE");
console.log("=".repeat(72));

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".studiorender-"));
const src = (p) => JSON.stringify(join(process.cwd(), p).replace(/\\/g, "/"));
const entry = join(dir, "entry.jsx");
writeFileSync(entry, [
  `export { default as AircraftStudio, STUDIO_GROUPS } from ${src("src/classes/aircraft/AircraftStudio.jsx")};`,
  `export * as E from ${src("src/classes/aircraft/engine.js")};`,
  `export { REFERENCE_AIRCRAFT } from ${src("src/classes/aircraft/reference-aircraft.js")};`,
  `export { applyTheme } from ${src("src/lib/theme.js")};`,
].join("\n"));
const outfile = join(dir, "bundle.mjs");
let MOD;
try {
  await build({
    entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
    external: ["react", "react-dom", "react/jsx-runtime", "recharts"],
  });
  /* The studio reads window for its address and theme. */
  globalThis.window = { location: { search: "", pathname: "/" }, history: { replaceState() {} },
                        matchMedia: () => ({ matches: true }) };
  MOD = await import(pathToFileURL(outfile).href);
} finally {
  /* the bundle is loaded; the files can go */
}

const BAD = /\bNaN\b|\bundefined\b|Infinity|\[object Object\]/;
const bad = (html) => { const m = html.match(new RegExp(`.{0,60}(${BAD.source}).{0,40}`)); return m ? m[0] : null; };

console.log("\n1. The whole studio");
for (const dark of [true, false]) {
  for (const type of MOD.E.TYPE_IDS) {
    globalThis.window.location.search = `?mode=aircraft&type=${type}${dark ? "" : "&theme=light"}`;
    let html = "", err = null;
    try { html = renderToStaticMarkup(React.createElement(MOD.AircraftStudio, { initialType: type })); } catch (e) { err = e.message; }
    check(`${type}, ${dark ? "dark" : "light"}: renders with a result and no bad values`,
          /* the status wording is sentence case; assert the meaning, not the casing */
          !err && /(converged|analysed)/i.test(html) && !bad(html) && !/eVTOL<\/span><span[^>]*> SIZER/.test(html),
          err ?? bad(html) ?? `${html.length} characters`);
  }
}

console.log("\n2. Every tab, every type, both jobs");
const tabs = MOD.STUDIO_GROUPS.flatMap((g) => g.tabs);
let rendered = 0;
const problems = [];
for (const type of MOD.E.TYPE_IDS) {
  const t = MOD.E.typeOf(type);
  const analysis = Object.fromEntries(Object.entries(t.analysisInputs).map(([k, v]) => [k, v.value]));
  for (const mode of ["size", "analyse"]) {
    const params = mode === "analyse" ? { ...t.defaults, ...analysis } : { ...t.defaults };
    const result = MOD.E.designAircraft({ type, mode, params });
    for (const [id, , Comp] of tabs) {
      const ctx = { type, mode, params, analysis, result, reference: MOD.REFERENCE_AIRCRAFT,
                    setType() {}, setParamsFor() {}, onOpen() {} };
      let html = "";
      try { html = renderToStaticMarkup(React.createElement(Comp, ctx)); rendered++; }
      catch (e) { problems.push(`${type}/${mode}/${id}: threw ${e.message}`); continue; }
      const b = bad(html);
      if (b) problems.push(`${type}/${mode}/${id}: ${b}`);
      if (html.length < 40) problems.push(`${type}/${mode}/${id}: empty`);
    }
  }
}
check(`${tabs.length} tabs × ${MOD.E.TYPE_IDS.length} types × 2 jobs render without errors or bad values`,
      problems.length === 0, problems.length ? problems.slice(0, 6).join(" | ") : `${rendered} renders`);

rmSync(dir, { recursive: true, force: true });
console.log("");
console.log(fail ? `STUDIO RENDER GATE FAILED: ${fail} check(s)` : `STUDIO RENDER GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
