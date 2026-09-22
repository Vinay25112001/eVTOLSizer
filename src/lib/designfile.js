/* =====================================================================
   DESIGN FILE — a saved design that means the same thing when reopened
   =====================================================================
   WHAT WAS WRONG. A saved design was `params` plus two to five headline
   numbers. It carried no engine version, and every place that reopened one
   MERGED it into whatever was on screen:  setParams(prev => ({...prev, ...p})).
   So an input the record did not carry was taken from the user's current
   session, not from any fixed value, and the same saved design produced
   different aircraft depending on what the user had been doing before they
   opened it. The custom airfoil, which the engine also reads, was never saved
   at all. Nothing checked whether today's engine still gives the saved answer,
   and a failed save was logged to the console while the UI said "Saved".

   WHAT A RECORD IS NOW
     inputs        every UI input, resolved over DEFAULT_PARAMS (a FIXED base)
     customAirfoil the other thing the engine reads from UI state
     inputHash     identity of the two above (canonical JSON, cyrb53) — an
                   integrity check against corruption, NOT a security measure
     engine        the build stamp of the engine that produced the outputs
     outputs       the result fingerprint, by the golden master's own rule
                   (lib/fingerprint.js)

   WHAT IT CANNOT DO, AND WHAT COVERS THAT. The engine reads ~137 inputs that
   are not UI state; it defaults them internally or from the layout tables.
   A record cannot pin those, and pinning them would not make an old design
   reproducible under new physics anyway. What a record CAN do is let any
   later engine re-run it and say exactly which outputs moved. That is the
   "continuity of results between software versions" that EASA's proposed
   CM-S-014 asks a modelling tool to demonstrate, applied per design.

   CROSS-PLATFORM. ECMAScript leaves Math.pow/sin/exp "implementation-
   approximated", so two browsers can disagree in the last bits. The
   comparison therefore uses the golden master's relative tolerance (1e-6),
   never bit equality.
   ===================================================================== */

import { DEFAULT_PARAMS } from "./defaults.js";
import { fingerprint, sameValue } from "./fingerprint.js";
import { runSizing, applyMissionBasis } from "../engine.js";

export const DESIGN_FORMAT = "evtol-sizer-design";
export const DESIGN_FORMAT_VERSION = 1;

/* Stamped at build time by vite.config.js (`define`). Outside a build — the
   Node gates, the dev server before a restart — there is no stamp, and the
   record says so rather than inventing one. */
/* The Node API (src/api.js) has no build step; it reads package.json and git
   once and registers the result here. */
let runtimeStamp = null;
export function setRuntimeStamp(stamp) { runtimeStamp = stamp ? { ...stamp } : null; }

export function buildStamp() {
  /* global __EVTOL_BUILD__ */
  if (typeof __EVTOL_BUILD__ !== "undefined" && __EVTOL_BUILD__) return { ...__EVTOL_BUILD__ };
  if (runtimeStamp) return { ...runtimeStamp };
  return { version: null, commit: "unbuilt", dirty: null, builtAt: null };
}

/* The version shown in the header, the report and screenshots. One source:
   package.json, through the build stamp. */
export function appVersionLabel(stamp = buildStamp()) {
  if (stamp.version) return `v${stamp.version}`;
  return "(unversioned build)";
}

export function engineLabel(stamp) {
  if (!stamp) return "an unrecorded engine version";
  if (stamp.commit === "unbuilt") return "an unstamped engine (run outside a build)";
  if (stamp.mode === "node-api") return `the Node API ${stamp.version ? "v" + stamp.version + " " : ""}at ${stamp.commit}${stamp.dirty ? " (uncommitted changes)" : ""}`;
  if (stamp.mode === "dev-server") return `a development server started at ${stamp.commit} (not a release build)`;
  const v = stamp.version ? `v${stamp.version} ` : "";
  const c = stamp.commit || "unknown";
  return `${v}${c}${stamp.dirty ? " (uncommitted changes)" : ""}`;
}

/* The UI does not hand the engine its raw state: the reserve is folded into
   the range first. Moved here from App.jsx so the continuity check runs the
   SAME transform the screen does — a check that re-ran a different input
   would be checking something else. */
export function reserveDistanceKm(params) {
  /* Whichever basis drives, the engine is handed ONE total range. When the
     user drives DISTANCE the km are taken directly; when they drive TIME
     the km are derived. The engine then subtracts the same reserve
     distance back out to recover the true cruise leg, so the two paths
     reach identical physics — see the reserveBasis note in engine.js.
     `??` not `||`: a 0-minute reserve is a real input, and `0 || 20` added
     20 minutes of reserve distance that the engine, reading `?? 20`, then
     flew as cruise (validation/total-range.mjs). */
  if (params.reserveBasis === "distance") return params.reserveDistanceKm ?? 60;
  // Vres = 0.76 × vCruise (best-endurance speed for electric)
  return 0.76 * params.vCruise * reserveMinutesOf(params) * 60 / 1000;
}

/* The engine applies the mission basis before it reads the reserve, so an
   unset reserve under the marketing basis is 0 there; it must be 0 here. */
export const reserveMinutesOf = (params) => applyMissionBasis(params).reserveMinutes ?? 20;

/* THE ONLY PLACE the total range is built. Every caller that sizes a
   variant of the inputs (Monte Carlo, sensitivity, design space, layout
   comparison, VSP models) goes through here, so a perturbed cruise speed
   perturbs the reserve distance the same way the engine will. */
export function engineInputs(params, customAirfoil = params.customAirfoil ?? null) {
  // totalRange = mission range + reserve range → fed into runSizing as p.range
  return { ...params, range: params.range + reserveDistanceKm(params), customAirfoil };
}

/* THE ONLY WAY A STORED INPUT SET BECOMES UI STATE. The base is fixed; the
   user's current session never leaks into a reopened design. */
export function resolveInputs(stored) {
  const clean = {};
  for (const [k, v] of Object.entries(stored || {})) {
    if (k === "_design") continue;
    if (v !== undefined && typeof v !== "function") clean[k] = v;
  }
  return { ...DEFAULT_PARAMS, ...clean };
}

export function canonicalJSON(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort()
      .filter(k => v[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonicalJSON(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/* cyrb53 (public domain, bryc). 53 bits, synchronous, identical in Node and
   every browser — crypto.subtle is async and absent on plain http. */
export function hashText(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function inputHashOf(inputs, customAirfoil = null) {
  return hashText(canonicalJSON({ inputs, customAirfoil: customAirfoil ?? null }));
}

/* A diverged run has no value to reproduce (see golden-master.mjs); the fact
   of divergence is what is kept. */
function outputsOf(R) {
  if (!R) return null;
  if (R.r2Diverged === true) return { _diverged: true };
  return fingerprint(R);
}

/* Headline outputs, shown first when a reopened design has moved. */
export const HEADLINE_OUTPUTS = [
  ["MTOW", "Take-off mass", "kg"],
  ["Etot", "Battery energy", "kWh"],
  ["Wbat", "Battery mass", "kg"],
  ["Wempty", "Empty mass", "kg"],
  ["Phov", "Hover power", "kW"],
  ["bWing", "Wing span", "m"],
  ["LDact", "Cruise L/D", ""],
  ["SM", "Static margin", ""],
];

/* The outputs are computed HERE from the inputs being saved, by default. The
   app's on-screen result is computed from a deferred copy of its state
   (useDeferredValue), so during typing it can belong to the PREVIOUS inputs;
   storing it would pair one design's inputs with another's numbers. */
export function makeDesignRecord({ params, customAirfoil = null, name = "", run = runSizing }) {
  const inputs = resolveInputs(params);
  let results = null;
  try { results = run(engineInputs(inputs, customAirfoil)); } catch { results = null; }
  return {
    format: DESIGN_FORMAT,
    formatVersion: DESIGN_FORMAT_VERSION,
    name,
    savedAt: new Date().toISOString(),
    engine: buildStamp(),
    inputs,
    customAirfoil: customAirfoil ?? null,
    inputHash: inputHashOf(inputs, customAirfoil),
    outputs: outputsOf(results),
  };
}

/* The run behind a record, for callers that also need the full result
   (headline numbers for a list, the PDF report). Same inputs, same engine. */
export function runRecord(record, run = runSizing) {
  return run(engineInputs(record.inputs, record.customAirfoil));
}

/* Accepts a record, its JSON text, or a LEGACY bare params object (every
   design saved before this format). Never throws on a legacy object; throws
   with a readable message on something that is not a design at all. */
export function readDesignRecord(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { throw new Error("This file is not valid JSON, so it is not a design file."); }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("This file does not contain a design.");
  }
  /* Embedded form (see embedRecord): inputs at the top level, the rest of
     the record under _design. */
  if (obj._design && obj._design.format === DESIGN_FORMAT && obj.format === undefined) {
    const { _design, ...inputs } = obj;
    return readDesignRecord({ ..._design, inputs });
  }
  if (obj.format === DESIGN_FORMAT) {
    if (!(obj.formatVersion <= DESIGN_FORMAT_VERSION)) {
      throw new Error(`This design file is format version ${obj.formatVersion}; this build reads up to ${DESIGN_FORMAT_VERSION}. Open it in a newer build.`);
    }
    if (!obj.inputs || typeof obj.inputs !== "object") throw new Error("This design file has no inputs.");
    const inputs = resolveInputs(obj.inputs);
    const hashOK = obj.inputHash === inputHashOf(obj.inputs, obj.customAirfoil);
    return { ...obj, inputs, legacy: false, hashOK };
  }
  /* Legacy: a bare params object. It must at least look like one. */
  const known = Object.keys(obj).filter(k => k in DEFAULT_PARAMS);
  if (known.length === 0) throw new Error("This file does not contain any design inputs this tool recognises.");
  return {
    format: DESIGN_FORMAT, formatVersion: 0, name: "", savedAt: null, engine: null,
    inputs: resolveInputs(obj), customAirfoil: null, inputHash: null, outputs: null,
    legacy: true, hashOK: null, missingInputs: Object.keys(DEFAULT_PARAMS).filter(k => !(k in obj)),
  };
}

/* The database stores `params` and `results` columns (the gallery and the
   share banner read those), so a record is split across them: params = the
   resolved inputs, results = the headline numbers the list shows, plus the
   rest of the record under `_design`. This joins them back. */
export function recordToRow(record, headline = {}) {
  const { inputs, ...meta } = record;
  return { params: inputs, results: { ...headline, _design: meta } };
}

/* For tables with only a params column (the community gallery), whose
   readers also pick individual inputs out of it: the inputs stay at the top
   level and the rest of the record rides along under _design. */
export function embedRecord(record) {
  const { inputs, ...meta } = record;
  return { ...inputs, _design: meta };
}

export function recordFromRow(params, results) {
  const p = typeof params === "string" ? JSON.parse(params || "{}") : (params || {});
  const r = typeof results === "string" ? JSON.parse(results || "{}") : (results || {});
  if (r && r._design && r._design.format === DESIGN_FORMAT) {
    return readDesignRecord({ ...r._design, inputs: p });
  }
  const rec = readDesignRecord(p);
  if (!rec.legacy) return rec;
  /* A legacy row still has a few numbers worth comparing against. */
  const legacyOutputs = {};
  for (const [k, v] of Object.entries(r || {})) {
    if (typeof v === "number" && Number.isFinite(v)) legacyOutputs[k] = v;
  }
  return { ...rec, outputs: Object.keys(legacyOutputs).length ? legacyOutputs : null, partialOutputs: true };
}

/* ── CONTINUITY ─────────────────────────────────────────────────────────
   Re-run the record on THIS engine and compare. Statuses:
     identical  every stored output agrees within the golden-master tolerance
     changed    at least one stored output moved
     unchecked  the record stored no outputs (a legacy design), or the run threw
   Legacy rows that stored two to five rounded numbers are compared on those
   only, and flagged `partial` so the UI does not call that a full check.
   Legacy numbers were saved rounded for display, so they are compared at the
   precision they were written with, not at 1e-6. */
export function checkContinuity(record, run = runSizing) {
  const engineNow = buildStamp();
  const base = { engineThen: record.engine || null, engineNow, legacy: !!record.legacy,
                 partial: !!record.partialOutputs, hashOK: record.hashOK ?? null,
                 missingInputs: record.missingInputs || [] };
  let R;
  try { R = run(engineInputs(record.inputs, record.customAirfoil)); }
  catch (e) { return { ...base, status: "unchecked", reason: `the engine could not run this design: ${e.message}`, moved: [], compared: 0 }; }
  if (!record.outputs) {
    return { ...base, status: "unchecked", reason: "the design was saved without results, so there is nothing to compare against", moved: [], compared: 0, R };
  }
  const now = outputsOf(R) || { _null: true };
  const moved = [];
  let compared = 0;
  for (const [field, was] of Object.entries(record.outputs)) {
    const cur = now[field];
    compared++;
    let same;
    if (record.partialOutputs && typeof was === "number" && typeof cur === "number") {
      same = Math.abs(cur - was) <= roundingTol(was);
    } else {
      same = sameValue(was, cur).same;
    }
    if (!same) moved.push({ field, was, now: cur, rel: relChange(was, cur) });
  }
  const added = record.partialOutputs ? [] : Object.keys(now).filter(k => !(k in record.outputs));
  const headlineOrder = HEADLINE_OUTPUTS.map(h => h[0]);
  moved.sort((a, b) => {
    const ia = headlineOrder.indexOf(a.field), ib = headlineOrder.indexOf(b.field);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return (Math.abs(b.rel) || 0) - (Math.abs(a.rel) || 0);
  });
  return { ...base, status: moved.length ? "changed" : "identical", moved, compared, added, R };
}

/* Half a unit in the last written decimal place (e.g. 2659.15 -> 0.005). */
function roundingTol(x) {
  const s = String(x);
  const dot = s.indexOf(".");
  const places = dot < 0 ? 0 : s.length - dot - 1;
  return 0.5 * Math.pow(10, -places) + 1e-9 * Math.abs(x);
}

function relChange(a, b) {
  if (typeof a !== "number" || typeof b !== "number") return null;
  if (a === 0) return b === 0 ? 0 : null;
  return (b - a) / Math.abs(a);
}

export function describeContinuity(c) {
  const then = c.engineThen ? engineLabel(c.engineThen) : "an unrecorded engine version";
  const now = engineLabel(c.engineNow);
  const lines = [];
  if (c.hashOK === false) {
    lines.push("The file's inputs do not match its own checksum: it was edited or damaged after saving. The inputs were loaded as they are.");
  }
  if (c.legacy) {
    lines.push(`Saved before design files recorded every input. ${c.missingInputs.length} input(s) it lacks were set to today's defaults, not to what was on screen.`);
  }
  if (c.status === "identical") {
    lines.unshift(c.partial
      ? `Reproduced: the ${c.compared} numbers this older save kept match today's engine (${now}). It kept too few to prove more.`
      : `Reproduced: all ${c.compared} stored outputs match today's engine (${now}) within 1e-6. Saved with ${then}.`);
  } else if (c.status === "changed") {
    lines.unshift(`Today's engine (${now}) gives a DIFFERENT result for this design than ${then} did: ${c.moved.length} of ${c.compared} stored outputs moved. The inputs are exactly as saved; the engine changed.`);
  } else {
    lines.unshift(`Not checked: ${c.reason}.`);
  }
  return lines;
}
