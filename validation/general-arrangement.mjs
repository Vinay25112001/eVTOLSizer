/* =====================================================================
   GENERAL ARRANGEMENT GATE — the centre of gravity and the gear stations
   =====================================================================
   WHAT THIS GATE IS FOR

   The drawing gained two things it had never carried: where the aeroplane
   balances, and what it stands on. Neither is a new calculation. Both were
   already solved elsewhere — balance.js owns the CG envelope, gear.js owns
   the stations and the tyres — so the failure mode here is NOT arithmetic.
   It is that the drawing says something the owning module does not, or
   dimensions a number nobody produced.

   So the checks are about IDENTITY, PROVENANCE, TOPOLOGY and REFUSAL:

     - every number in a label equals the owning module's number, read off
       the rendered markup rather than recomputed beside it;
     - the take-off CG lies inside the envelope drawn around it, on every
       class — an envelope that excluded its own operating point would be
       the one mistake that makes the drawing worse than nothing;
     - each wheel is TANGENT to the ground line, which is what "static
       loaded radius" means and is the invariant a stance change would
       break;
     - the TRACK is never dimensioned, because only a turnover minimum
       exists and a minimum is not a layout;
     - a class that cannot split its gear draws none and says why, and the
       refusal is asserted on the DIMENSION, not on the prose — the word
       "wheelbase" appears in the refusal sentence itself, so a check that
       merely greps for it passes on the class it is meant to catch;
     - and nothing drawn falls outside the sheet or under the title block.

   EVERY CHECK RUNS OVER EVERY CLASS. The lesson that cost a commit on the
   tail cone was that an invariant can be true of the DEFAULT convention
   and false of what a class actually draws, so there is no default path
   through this file.
   ===================================================================== */
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? passes++ : fails.push(label);
};
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
/* gear.js's refusal quotes the item name — `one combined "Landing gear"
   item` — and react-dom escapes those quotes on the way to the markup. So
   the comparison escapes too, rather than the sentence being reworded to
   suit the gate. */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

console.log("GENERAL ARRANGEMENT GATE — centre of gravity and gear stations");
console.log("=".repeat(72));

/* ── the drawing is bundled and rendered, as the studio gate does ───── */
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".gagate-"));
const src = (p) => JSON.stringify(join(process.cwd(), p).replace(/\\/g, "/"));
const entry = join(dir, "entry.jsx");
writeFileSync(entry, [
  `export { GeneralArrangement } from ${src("src/classes/aircraft/GeneralArrangement.jsx")};`,
  `export * as E from ${src("src/classes/aircraft/engine.js")};`,
  `export { balanceOf } from ${src("src/classes/aircraft/balance.js")};`,
  `export { gearOf } from ${src("src/classes/aircraft/gear.js")};`,
].join("\n"));
const outfile = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node",
  jsx: "automatic", logLevel: "silent",
  define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
  external: ["react", "react-dom", "react/jsx-runtime", "recharts"],
});
globalThis.window = { location: { search: "", pathname: "/" }, history: { replaceState() {} },
                      matchMedia: () => ({ matches: true }) };
const MOD = await import(pathToFileURL(outfile).href);

const gaSrc = readFileSync(new URL("../src/classes/aircraft/GeneralArrangement.jsx", import.meta.url), "utf8");
const BAD = /\bNaN\b|\bundefined\b|Infinity|\[object Object\]/;
const FT = 0.3048;

/* ── 1. the drawing borrows both quantities, it does not restate them ── */
console.log("\n1. Provenance: the drawing asks the owning module");
check(/import\s*\{[^}]*\bbalanceOf\b[^}]*\}\s*from\s*"\.\/balance\.js"/s.test(gaSrc),
  "the general arrangement IMPORTS balanceOf from balance.js",
  "a view that recomputed the envelope could disagree with the balance tab about the same aeroplane");
check(/import\s*\{[^}]*\bgearOf\b[^}]*\}\s*from\s*"\.\/gear\.js"/s.test(gaSrc),
  "and imports gearOf from gear.js");
check(!/const\s+(balanceOf|gearOf)\s*=/.test(gaSrc),
  "and defines no local copy of either");
/* The stations are the TASOPT deck's fractions of length. If the drawing
   ever writes one down itself, the deck and the drawing can drift the way
   the tail cone and the tail-strike sampler did. */
check(!/\b0\.113\b|\b0\.226\b/.test(gaSrc),
  "and hard-codes none of the deck's own station fractions",
  "0.113 and 0.226 are the deck's nose-gear fractions; the drawing must read the station, not the fraction");

/* ── 2. per class: identity of every number in a label ─────────────── */
console.log("\n2. Every label equals the owning module's number, on every class");
const rendered = {};
for (const type of MOD.E.TYPE_IDS) {
  const result = MOD.E.designAircraft({ type, mode: "size", params: {} });
  let html = "", err = null;
  try { html = renderToStaticMarkup(React.createElement(MOD.GeneralArrangement, { result })); }
  catch (e) { err = e.message; }
  check(!err && html.length > 0, `${type}: the drawing renders`, err || `${html.length} characters`);
  if (err) continue;
  const bal = MOD.balanceOf(result), gear = MOD.gearOf(result);
  rendered[type] = { html, bal, gear, result };

  const m = html.match(new RegExp(`.{0,70}(${BAD.source}).{0,50}`));
  check(!m, `${type}: no NaN, undefined or Infinity reaches the sheet`, m ? m[0] : "");

  /* the CG range label carries balance.js's own per cent MAC figures */
  const wantRange = `${(100 * bal.envelope.fwd.pctMac).toFixed(0)} to ${(100 * bal.envelope.aft.pctMac).toFixed(0)} % MAC`;
  check(html.includes(wantRange), `${type}: the CG range label states balance.js's envelope (${wantRange})`);
  const wantSpanM = `CG range  ${(bal.envelope.aft.x - bal.envelope.fwd.x).toFixed(2)} m`;
  check(html.includes(wantSpanM), `${type}: and the same range in metres (${wantSpanM})`);
  /* the MAC is the datum every per cent MAC figure is measured from */
  check(html.includes(`MAC ${bal.mac.toFixed(2)} m`), `${type}: the MAC is drawn and labelled ${bal.mac.toFixed(2)} m`);
}

/* ── 3. the envelope contains its own operating point ──────────────── */
console.log("\n3. The take-off CG lies inside the envelope drawn around it");
for (const [type, { bal }] of Object.entries(rendered)) {
  const { fwd, aft } = bal.envelope;
  check(bal.takeoff.xM >= fwd.x - 1e-9 && bal.takeoff.xM <= aft.x + 1e-9,
    `${type}: take-off CG ${bal.takeoff.xM.toFixed(3)} m is within ${fwd.x.toFixed(3)}–${aft.x.toFixed(3)} m`,
    "a drawn envelope that excluded the operating point would be worse than drawing nothing");
  check(aft.x > fwd.x,
    `${type}: the envelope has a positive width (${(aft.x - fwd.x).toFixed(3)} m)`);
}

/* ── 4. the wheels stand ON the ground line ────────────────────────── */
console.log("\n4. Each wheel is tangent to the ground line, at the tyre's static loaded radius");
const circleRe = /<circle[^>]*\bcx="([-\d.]+)"[^>]*\bcy="([-\d.]+)"[^>]*\br="([-\d.]+)"/g;
const lineRe = /<line[^>]*\bx1="([-\d.]+)"[^>]*\by1="([-\d.]+)"[^>]*\bx2="([-\d.]+)"[^>]*\by2="([-\d.]+)"/g;

/* THE GROUND LINE, READ OFF THE SHEET — not reproduced from the layout
   formulas beside it, and not inferred from the wheels.

   The first version of this check compared the wheels only with EACH
   OTHER: every circle of the tyre's radius had to agree on where its
   tangent lay. Two mutants walked straight through it — lifting every
   wheel a full radius off the ground, and sinking every wheel to its
   axle — because wheels moved together still agree with one another. A
   tangency check has to name the thing they are supposed to be tangent
   TO, so the ground line is found independently: it is the widest
   horizontal line on the sheet, spanning the body plus half a margin at
   each end, where both centre lines span less. */
const groundLineY = (html) => {
  const horiz = [...html.matchAll(lineRe)]
    .map((m) => ({ y: +m[2], w: Math.abs(+m[3] - +m[1]), flat: Math.abs(+m[2] - +m[4]) < 1e-9 }))
    .filter((l) => l.flat);
  if (!horiz.length) return null;
  return horiz.reduce((a, l) => (l.w > a.w ? l : a), horiz[0]).y;
};
for (const [type, { html, bal, gear }] of Object.entries(rendered)) {
  if (!gear.resolved) {
    check(true, `${type}: no wheel to place — gear declines, checked in section 6`);
    continue;
  }
  const circles = [...html.matchAll(circleRe)].map((m) => ({ cx: +m[1], cy: +m[2], r: +m[3] }));
  for (const kind of ["nose", "main"]) {
    const ty = gear.tyres[kind];
    const item = bal.items.find((i) => new RegExp(`^${kind === "nose" ? "Nose" : "Main"} gear$`).test(i.name || ""));
    if (!ty?.resolved || !item) { check(false, `${type}: ${kind} tyre and station are both available`); continue; }
    const slr = ty.tyre.slrIn * 0.0254;
    /* A circle of exactly the static loaded radius must exist, and it must
       be tangent to the ground line: bottom of the circle, cy + r, ON the
       ground y read off the sheet. */
    const hit = circles.filter((c) => near(c.r, slr, 1e-6));
    check(hit.length >= 1, `${type}: a ${kind} wheel of radius ${slr.toFixed(3)} m (tyre ${ty.tyre.size}) is drawn`,
      hit.length ? "" : `radii drawn: ${circles.map((c) => c.r.toFixed(3)).join(", ")}`);
    if (!hit.length) continue;
    const gy = groundLineY(html);
    check(gy !== null && hit.every((c) => near(c.cy + c.r, gy, 1e-6)),
      `${type}: the ${kind} wheel rests ON the ground line, not above it or through it`,
      `ground y ${gy === null ? "not found" : gy.toFixed(4)}; `
      + `wheel bottoms ${hit.map((c) => (c.cy + c.r).toFixed(4)).join(", ")}`);
  }
}

/* ── 5. the wheelbase is dimensioned, the track never is ──────────── */
console.log("\n5. The wheelbase carries a dimension with its source; the track carries none");
for (const [type, { html, gear }] of Object.entries(rendered)) {
  /* ASSERT ON THE DIMENSION, NOT THE PROSE. gear.js's refusal sentence
     contains the word "wheelbase" itself, so a check that greps for the
     word passes on exactly the class it exists to catch. */
  const dimRe = /wheelbase\s+([\d.]+) m/;
  const m = html.match(dimRe);
  if (gear.resolved) {
    check(!!m, `${type}: a wheelbase dimension is drawn`);
    if (m) check(near(+m[1], +gear.geometry.wheelbase.toFixed(2), 5e-3),
      `${type}: and it states gear.js's wheelbase (${gear.geometry.wheelbase.toFixed(2)} m)`);
    check(/wheelbase[^<]*TASOPT deck stations/.test(html),
      `${type}: and its label names the deck it rests on rather than passing as a result`);
  } else {
    check(!m, `${type}: NO wheelbase dimension is drawn, because the class declines`,
      m ? `found "${m[0]}"` : "asserted on the dimension, not on the word");
  }
  /* The only track figure in the tool is a turnover MINIMUM. It may be
     quoted in the title block; it must never appear as a dimension. */
  check(!/(^|[^a-z])track\s+[\d.]+ m\s+·/.test(html),
    `${type}: no track dimension is drawn (only a turnover minimum exists)`);
}

/* ── 6. refusal is visible ─────────────────────────────────────────── */
console.log("\n6. A class that cannot split its gear draws none, and says why");
for (const [type, { html, gear }] of Object.entries(rendered)) {
  if (gear.resolved) {
    check(/Landing gear: nose and main stations are the TASOPT/.test(html),
      `${type}: the title block states where the stations come from`);
    continue;
  }
  check(html.includes("Landing gear: none is drawn"),
    `${type}: the title block says no gear is drawn`);
  check(html.includes(esc(gear.why)), `${type}: and gives gear.js's own reason verbatim`, gear.why);
  /* nothing may be drawn at a station the class does not have */
  const circles = [...html.matchAll(circleRe)].map((m) => +m[3]);
  const slrs = ["nose", "main"].map((k) => gear.tyres?.[k]?.tyre?.slrIn).filter(Boolean);
  check(slrs.length === 0 || !circles.some((r) => slrs.some((s) => near(r, s * 0.0254, 1e-6))),
    `${type}: and draws no wheel`);
}

/* ── 7. the sheet holds everything it draws ────────────────────────── */
console.log("\n7. Nothing drawn falls outside the sheet or under the title block");
for (const [type, { html }] of Object.entries(rendered)) {
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  check(!!vb, `${type}: the sheet declares a viewBox`);
  if (!vb) continue;
  const sheetH = +vb[2];
  const ys = [...html.matchAll(/\b(?:y|y1|y2|cy)="([-\d.]+)"/g)].map((m) => +m[1]);
  const maxY = Math.max(...ys);
  check(maxY <= sheetH + 1e-6, `${type}: the deepest drawn feature (${maxY.toFixed(2)}) is inside the sheet (${sheetH.toFixed(2)})`,
    "the band the CG range and wheelbase are dimensioned in is reserved, not borrowed from the margin");
  /* THE TITLE BLOCK MUST NOT SIT ON THE DIMENSIONS. The title block is
     the only rect drawn with fill="none"; the CG-range dimension is the
     deepest thing above it. This is the check that catches a new band
     being added without the title block being moved down for it. */
  const tRect = html.match(/<rect[^>]*fill="none"[^>]*y="([\d.]+)"|<rect[^>]*y="([\d.]+)"[^>]*fill="none"/);
  const cgText = html.match(/<text[^>]*\by="([\d.]+)"[^>]*>CG range/);
  if (tRect && cgText) {
    const tY = +(tRect[1] ?? tRect[2]), cY = +cgText[1];
    check(cY < tY, `${type}: the CG-range dimension (y ${cY.toFixed(2)}) sits above the title block (y ${tY.toFixed(2)})`);
  } else {
    check(!!tRect, `${type}: the title block rect is found`, tRect ? "" : "the containment check above cannot run without it");
  }
}

console.log("");
console.log(fails.length ? `GENERAL ARRANGEMENT GATE FAILED: ${fails.length} check(s)\n  ${fails.join("\n  ")}`
                         : `GENERAL ARRANGEMENT GATE PASSED (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
