/* =====================================================================
   DESIGN-FILE GATE — a saved design means the same thing when reopened
   =====================================================================
   What this gate exists to stop (all four were true before it):
     1. every place that reopened a design MERGED it into the on-screen state,
        so an input the record lacked came from the user's session;
     2. a record carried no engine version and nothing checked whether the
        current engine still gives the saved answer;
     3. the custom airfoil, an engine input, was never saved;
     4. a failed save was caught, logged and reported to the user as "Saved".

   It checks the module's behaviour AND scans the UI source, because the
   module can be perfect while a new load button goes back to merging.
   ===================================================================== */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import {
  makeDesignRecord, readDesignRecord, checkContinuity, describeContinuity,
  recordToRow, recordFromRow, embedRecord, engineInputs, inputHashOf,
  resolveInputs, buildStamp, DESIGN_FORMAT_VERSION,
} from "../src/lib/designfile.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`); }
};
const roundTrip = (rec) => readDesignRecord(JSON.stringify(rec));

console.log("═".repeat(72));
console.log("DESIGN FILE — reproducible saved designs");
console.log("═".repeat(72));

/* ── 1. Round trip on every layout, both reserve bases ─────────────── */
console.log("\n1. A saved design reopens to the same result");
const CONFIGS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"];
const cases = [
  ["default", {}],
  ...CONFIGS.map(c => [`config ${c}`, { configType: c }]),
  ["reserve by distance", { reserveBasis: "distance", reserveDistanceKm: 45 }],
  ["manoeuvre load factor set", { nLimitManoeuvre: 3.0 }],
];
let minCompared = Infinity;
for (const [label, over] of cases) {
  const rec = makeDesignRecord({ params: { ...DEFAULT_PARAMS, ...over }, name: label });
  const back = roundTrip(rec);
  const c = checkContinuity(back);
  minCompared = Math.min(minCompared, c.compared);
  check(`${label}: identical after save → JSON → open`, c.status === "identical" && back.hashOK === true,
        `${c.compared} outputs compared, status ${c.status}`);
}
check("a record compares the whole fingerprint, not a handful of headline numbers",
      minCompared > 200, `smallest comparison ${minCompared} outputs`);

/* The record's outputs must be the run of the record's inputs — including
   the reserve transform the screen applies. */
{
  const p = { ...DEFAULT_PARAMS, reserveBasis: "distance", reserveDistanceKm: 45 };
  const rec = makeDesignRecord({ params: p });
  const R = runSizing(engineInputs(p));
  check("stored MTOW is the engine's MTOW for the stored inputs (reserve transform included)",
        Math.abs(rec.outputs.MTOW - R.MTOW) < 1e-9 * R.MTOW, `${rec.outputs.MTOW} vs ${R.MTOW}`);
  const Rraw = runSizing(p);
  check("…and the transform matters (running the raw state gives a different aircraft)",
        Math.abs(Rraw.MTOW - R.MTOW) > 1, `raw ${Rraw.MTOW} vs transformed ${R.MTOW}`);
}

/* ── 2. The session never leaks into a reopened design ─────────────── */
console.log("\n2. Inputs a record lacks come from fixed defaults, never the session");
{
  const legacy = readDesignRecord({ payload: 300, range: 80 });
  const expect = { ...DEFAULT_PARAMS, payload: 300, range: 80 };
  check("a legacy bare-params design resolves over DEFAULT_PARAMS",
        JSON.stringify(legacy.inputs) === JSON.stringify(expect));
  check("…and is flagged legacy with the inputs it lacked listed",
        legacy.legacy === true && legacy.missingInputs.length === Object.keys(DEFAULT_PARAMS).length - 2,
        `${legacy.missingInputs.length} missing`);
  const r = resolveInputs({ payload: 300, _design: { junk: 1 }, bad: undefined });
  check("resolveInputs drops the embedded _design block and undefined values",
        !("_design" in r) && !("bad" in r) && r.payload === 300);
}

/* ── 3. The custom airfoil is part of the design ───────────────────── */
console.log("\n3. The custom airfoil is saved and hashed");
{
  const af = { name: "test", clMax: 1.4, cd0: 0.009 };
  const a = inputHashOf(DEFAULT_PARAMS, null), b = inputHashOf(DEFAULT_PARAMS, af);
  check("changing only the custom airfoil changes the input hash", a !== b, `${a} vs ${b}`);
  const rec = roundTrip(makeDesignRecord({ params: DEFAULT_PARAMS, customAirfoil: af }));
  check("the custom airfoil survives the round trip", JSON.stringify(rec.customAirfoil) === JSON.stringify(af));
  const p2 = { ...DEFAULT_PARAMS, payload: DEFAULT_PARAMS.payload + 1 };
  check("changing one input changes the input hash", inputHashOf(p2) !== inputHashOf(DEFAULT_PARAMS));
  const key = Object.keys(DEFAULT_PARAMS);
  const reordered = Object.fromEntries([...key].reverse().map(k => [k, DEFAULT_PARAMS[k]]));
  check("key order does not change the hash (canonical JSON)", inputHashOf(reordered) === inputHashOf(DEFAULT_PARAMS));
}

/* ── 4. The check catches a changed engine, and only a changed engine ─ */
console.log("\n4. Continuity: a changed engine is reported, platform noise is not");
{
  const rec = roundTrip(makeDesignRecord({ params: DEFAULT_PARAMS }));
  /* An engine-INTERNAL default moving — the case a record cannot pin. */
  const movedDefault = (p) => runSizing({ ...p, structTechFactor: 1.05 });
  const c1 = checkContinuity(rec, movedDefault);
  check("an internal engine default moving is reported as changed", c1.status === "changed",
        `${c1.moved.length} outputs moved`);
  check("…with take-off mass listed first", c1.moved[0]?.field === "MTOW",
        `first: ${c1.moved[0]?.field} ${c1.moved[0]?.was} → ${c1.moved[0]?.now}`);
  const text = describeContinuity(c1).join(" ");
  check("…and the message says the engine changed, not the inputs", /DIFFERENT result/.test(text) && /engine changed/.test(text));

  const noise = (p) => { const R = runSizing(p); return { ...R, MTOW: R.MTOW * (1 + 3e-8) }; };
  check("last-bit noise (3e-8 relative) is NOT reported", checkContinuity(rec, noise).status === "identical");
  const real = (p) => { const R = runSizing(p); return { ...R, MTOW: R.MTOW * (1 + 2e-5) }; };
  check("a 2e-5 relative change IS reported", checkContinuity(rec, real).status === "changed");

  const thrower = () => { throw new Error("boom"); };
  const c3 = checkContinuity(rec, thrower);
  check("an engine that throws is 'unchecked', not 'identical'", c3.status === "unchecked" && /boom/.test(c3.reason));
}

/* ── 5. Legacy rows, embedded rows, tampering, bad files ───────────── */
console.log("\n5. Stored forms and damaged files");
{
  const R = runSizing(engineInputs(DEFAULT_PARAMS));
  const legacyRow = recordFromRow(JSON.stringify(DEFAULT_PARAMS),
    JSON.stringify({ MTOW: +R.MTOW.toFixed(2), Etot: +R.Etot.toFixed(2) }));
  const cl = checkContinuity(legacyRow);
  check("a legacy row is compared on the rounded numbers it kept", cl.status === "identical" && cl.partial && cl.compared === 2,
        `status ${cl.status}, compared ${cl.compared}`);
  check("…and says it kept too few to prove more", /too few/.test(describeContinuity(cl)[0]));
  const staleRow = recordFromRow(JSON.stringify(DEFAULT_PARAMS), JSON.stringify({ MTOW: +(R.MTOW + 40).toFixed(2) }));
  check("a legacy row whose MTOW no longer matches is 'changed'", checkContinuity(staleRow).status === "changed");
  const bare = recordFromRow(JSON.stringify({ payload: 400 }), "{}");
  check("a legacy row with no numbers is 'unchecked'", checkContinuity(bare).status === "unchecked");

  const rec = makeDesignRecord({ params: DEFAULT_PARAMS, name: "row" });
  const row = recordToRow(rec, { MTOW: R.MTOW });
  const fromRow = recordFromRow(JSON.stringify(row.params), JSON.stringify(row.results));
  check("params/results row form round-trips as a full record",
        !fromRow.legacy && fromRow.hashOK && checkContinuity(fromRow).status === "identical");
  const emb = readDesignRecord(JSON.stringify(embedRecord(rec)));
  check("embedded form (gallery) round-trips as a full record",
        !emb.legacy && emb.hashOK && checkContinuity(emb).status === "identical");
  check("embedded form keeps inputs at the top level for readers that pick fields out",
        embedRecord(rec).nPropHover === DEFAULT_PARAMS.nPropHover);

  const tampered = JSON.parse(JSON.stringify(rec));
  tampered.inputs.payload = 999;
  const t = readDesignRecord(JSON.stringify(tampered));
  check("an input edited after saving fails the checksum", t.hashOK === false);
  check("…and the message says so", /checksum/.test(describeContinuity(checkContinuity(t)).join(" ")));

  const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  check("a newer format version is refused with a reason",
        /newer build/.test(throws(() => readDesignRecord({ ...rec, formatVersion: DESIGN_FORMAT_VERSION + 1 })) || ""));
  check("non-JSON is refused", /not valid JSON/.test(throws(() => readDesignRecord("{oops")) || ""));
  check("JSON with no design inputs is refused", /recognises/.test(throws(() => readDesignRecord({ hello: 1 })) || ""));
}

/* ── 6. Build stamp ────────────────────────────────────────────────── */
console.log("\n6. Engine build stamp");
{
  const s = buildStamp();
  check("outside a build the stamp says 'unbuilt' rather than inventing a commit", s.commit === "unbuilt");
  const vite = src("vite.config.js");
  /* scope-check.mjs allowlists this name; this is the other half of that
     bargain — one reader, always guarded. */
  const readers = [];
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|jsx)$/.test(e.name) && src(rel).includes("__EVTOL_BUILD__")) readers.push(rel);
    }
  };
  walk("src");
  const uses = src("src/lib/designfile.js").split("\n")
    .filter(l => l.includes("__EVTOL_BUILD__") && !/^\s*(\/\*|\/\/|\*)/.test(l));
  check("__EVTOL_BUILD__ is read only in lib/designfile.js, and only under a typeof guard",
        readers.length === 1 && readers[0] === "src/lib/designfile.js"
        && uses.length === 1 && /typeof __EVTOL_BUILD__ !== "undefined"/.test(uses[0]),
        `${readers.join(", ")}; ${uses.length} code line(s)`);
  check("vite.config.js defines __EVTOL_BUILD__ with version, commit and dirty flag",
        /__EVTOL_BUILD__\s*:/.test(vite) && /rev-parse/.test(vite) && /status --porcelain/.test(vite) && /version:/.test(vite));
}

/* ── 7. Source scans — the UI must use the module ──────────────────── */
console.log("\n7. Every save and load path goes through the design file");
{
  const files = ["src/App.jsx", "src/tabs/CommunityTab.jsx", "src/CommunityFeatures.jsx",
                 "src/panels/DesignGallery.jsx", "src/panels/DesignVersionHistory.jsx"];
  const merges = [];
  for (const f of files) {
    const lines = src(f).split("\n");
    lines.forEach((l, i) => { if (/setParams\s*\(\s*\w+\s*=>\s*\(\s*\{\s*\.\.\.\w+\s*,\s*\.\.\./.test(l)) merges.push(`${f}:${i + 1}`); });
  }
  check("no setParams call merges a loaded object into the current state", merges.length === 0, merges.join(", ") || "none");

  const tab = src("src/tabs/CommunityTab.jsx");
  const loads = [...tab.matchAll(/onLoad\w*=\{/g)].length;
  const safe = [...tab.matchAll(/onLoad\w*=\{[^]*?openDesignSafely/g)].length;
  check("every load handler in the Community tab opens through openDesignSafely", loads >= 3 && safe === loads, `${safe}/${loads}`);
  check("leaderboard entries are fetched by share_id (the table has no params)", /getPublicDesign\(row\.share_id\)/.test(tab));

  const app = src("src/App.jsx");
  check("the on-screen result is computed through engineInputs", /runSizing\(engineInputs\(deferredParams,\s*deferredCustomAF\)\)/.test(app));
  check("the shared-link loader and banner open through the design file",
        /openDesign\(recordFromRow\(d\.params,d\.results\)/.test(app) && /PublicDesignBanner[^\n]*openDesignSafely/.test(app));
  const openFn = app.slice(app.indexOf("const openDesign=("), app.indexOf("const openDesignSafely="));
  check("openDesign REPLACES the state with the record's inputs", /return record\.inputs;/.test(openFn) && /setCustomAFData\(record\.customAirfoil/.test(openFn));
  check("Save and Ctrl+S both call saveToAccount", (app.match(/saveToAccount/g) || []).length >= 3 && !/saveDesign\(user\.id,\{name:nm,params(:params)?,results:\{/.test(app));
  const saveFn = app.slice(app.indexOf("const saveToAccount="), app.indexOf("const downloadDesignFile="));
  const tryAt = saveFn.indexOf("try{"), savedAt = saveFn.indexOf("Design Saved"), catchAt = saveFn.indexOf("}catch");
  check("'Design Saved' is only said after the write succeeded", tryAt > 0 && savedAt > tryAt && savedAt < catchAt);
  check("a failed save is shown as NOT SAVED", /title:"NOT SAVED"/.test(saveFn));

  const auth = src("src/AuthSystem.jsx");
  const sd = auth.slice(auth.indexOf("async function saveDesign("), auth.indexOf("async function deleteDesign("));
  check("saveDesign no longer swallows its error", !/catch/.test(sd) && /await sbFetch/.test(sd));

  const hist = src("src/lib/history.js");
  check("local history stores a design record and reports failure", /makeDesignRecord/.test(hist) && /ok: false/.test(hist));
  const cf = src("src/CommunityFeatures.jsx");
  check("publishing a design stores a design record", /publishDesign[^]*?makeDesignRecord[^]*?recordToRow/.test(cf));
  const gal = src("src/panels/DesignGallery.jsx");
  check("gallery writes store an embedded design record", (gal.match(/embedRecord\(makeDesignRecord/g) || []).length === 2);
  const gm = src("validation/golden-master.mjs");
  check("the golden master and the design file share one comparison rule",
        /from "\.\.\/src\/lib\/fingerprint\.js"/.test(gm) && !/function sameValue/.test(gm));
}

console.log("\n" + "═".repeat(72));
console.log(`DESIGN FILE: ${pass} passed, ${fail} failed`);
console.log("═".repeat(72));
process.exit(fail ? 1 : 0);
