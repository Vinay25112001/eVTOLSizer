/* =====================================================================
   EVTOL BUILD LAB — the sized aircraft, put together step by step on a
   floor ruled in metres, shows the sizing's geometry and nothing else
   =====================================================================
   The lab (src/panels/evtol-build/) sits in the OpenVSP tab between the
   interactive layout view and the mission animations, and builds whichever
   of the six layouts the sizer has selected. This gate holds it to, on
   every layout the app's own layout switch makes from the default design:

     1. THE PLAN (build-plan.js, pure data):
        - every body of the aircraft's geometry is in exactly one part,
          and every part in one of the named groups, none left over;
        - the steps are the layout's own (a multicopter has arms and no
          wing; a tilt-rotor has nacelles and no booms), and every group
          present is fitted by exactly one step;
        - the result is read through sr() only, and only the allowed
          fields; no hidden field is read, named or shown, and none of
          their values appears in any text the lab can show;
        - it follows the sizing: at two payloads every layout converges
          at (300 and 550 kg), the fuselage, the wing and the seats drawn
          are the sizing's, and they move;
        - each layout's own sentences match its geometry (booms above or
          under the wing, the tilting rotors, the side-by-side overlap
          and the multicopter's stepped rotors against the measured
          constants they cite);
        - an unknown layout and an unconverged sizing get their notices.
     2. TRUE SCALE, in Node with three.js (evtol-parts.js): the fuselage
        is mesh.js's own rings, vertex for vertex; the wing tips at the
        span; the tail at its span; every rotor tip at its radius; every
        tyre at its radius and width; every motor stack at its diameter;
        every tilting nacelle posed as mesh.js poses it; parked
        overlapping blades clear of each other; the seats and pack inside;
        the person 1.8 m and clear of every rotor disc.
     3. THE PANEL, rendered (react-dom/server, the real component): every
        step of every layout, no null/undefined/NaN, no hidden quantity;
        the notices.
     4. SOURCE. three.js only in the two scene modules; the scene fetched
        by one dynamic import; imports on allowlists; mounted once between
        the layout view and the mission animation; no new tab; window.*
        observers; a fresh canvas; arrow keys kept from the app's tab
        switch.
   ===================================================================== */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import * as CFG from "../src/engine/configuration.js";
import { aircraftGeometry } from "../src/engine/geometry.js";
import { buildMesh, PALETTE } from "../src/engine/mesh.js";
import { SBS_HUB_SEP_OVER_D, MC_AFT_RISE_OVER_D } from "../src/engine/coaxial.js";
import { cabinAdequacy } from "../src/engine/cabin.js";
import { TABS, TAB_GROUPS } from "../src/lib/tabs.js";
import { engineInputs } from "../src/lib/designfile.js";
import * as P from "../src/panels/evtol-build/build-plan.js";
import * as E from "../src/panels/evtol-build/evtol-parts.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ");
const BAD = /\b(null|undefined|NaN|Infinity)\b/;
/* Words for what the lab must not show: the mass the airframe is sized
   to, power, energy, torque, the pack's C-rate, disk loading. */
const HIDDEN_WORDS = /\bMTOW\b|take-off mass|gross mass|\bkWh?\b|N·m|\bNm\b|C-rate|disk loading/i;

/* THE APP'S CONFIGURATION SWITCH, replayed from the default design as
   validation/mission-flight-3d.mjs replays it (the configType <select>
   handler in App.jsx), and sized through engineInputs as the app sizes. */
const SR0 = runSizing(engineInputs(DEFAULT_PARAMS));
function appSwitch(key) {
  const q = DEFAULT_PARAMS, dflt = CFG.CONFIG_DEFAULTS[key];
  const next = { ...q, configType: key };
  delete next.nRotorsStopped;
  next.nPropHover = dflt.nRotors;
  const solved = CFG.solveRotorDiameter(key, { ...q, configType: key, nPropHover: dflt.nRotors }, runSizing, { seedMTOW: SR0.MTOW || q.payload * 8 });
  const D = solved?.propDiam ?? CFG.rotorDiameterFor(key, SR0.MTOW || q.payload * 8, dflt.nRotors);
  if (D && isFinite(D)) next.propDiam = D;
  if (dflt.vCruise_ms && isFinite(dflt.vCruise_ms)) next.vCruise = dflt.vCruise_ms;
  if (dflt.LD_target && isFinite(dflt.LD_target)) next.LD = dflt.LD_target;
  if (dflt.etaHov && isFinite(dflt.etaHov)) next.etaHov = dflt.etaHov;
  if (dflt.tipSpeed_ms && isFinite(dflt.tipSpeed_ms)) next.tipSpeed = dflt.tipSpeed_ms;
  const w = Number(next.fusDiam) || Number(q.fusDiam) || 1.65;
  if (dflt.fusFineness && isFinite(dflt.fusFineness)) next.fusLen = +(dflt.fusFineness * w).toFixed(2);
  if (dflt.ewf && isFinite(dflt.ewf)) next.ewf = dflt.ewf;
  next.fusHeight = dflt.fusHeightRatio && isFinite(dflt.fusHeightRatio) ? +(dflt.fusHeightRatio * w).toFixed(2) : undefined;
  if (dflt.wingLoadingNm2 && isFinite(dflt.wingLoadingNm2)) next.wingLoadingNm2 = dflt.wingLoadingNm2;
  next.twRatio = Math.max(1.30, CFG.oeiThrustMarginFor(key, dflt.nRotors) ?? 1.30);
  return next;
}
const KEYS = Object.keys(CFG.CONFIGURATIONS);
const CASES = Object.fromEntries(KEYS.map((k) => { const p = appSwitch(k); const r = runSizing(engineInputs(p)); return [k, { p, r, plan: P.buildPlan(p, r) }]; }));
const LC = CASES.liftcruise;
/* Each layout's build, as the step list the student sees. */
const WINGED = ["parts", "fuselage", "cabin", "wing", "tail"];
const WANT_STEPS = {
  liftcruise:   [...WINGED, "booms", "motors", "rotors", "pusher", "gear", "review"],
  hybridPusher: [...WINGED, "booms", "motors", "rotors", "pusher", "gear", "review"],
  hybrid:       [...WINGED, "booms", "motors", "rotors", "gear", "review"],
  tiltrotor:    [...WINGED, "motors", "rotors", "gear", "review"],
  multicopter:  ["parts", "fuselage", "cabin", "arms", "motors", "rotors", "gear", "review"],
  sideBySide:   ["parts", "fuselage", "cabin", "arms", "motors", "rotors", "gear", "review"],
};
const each = (f) => KEYS.map((k) => [k, f(CASES[k], k)]);
const failing = (rows) => rows.filter(([, v]) => v !== true && !(v && v.ok)).map(([k, v]) => `${k}: ${v?.why ?? v}`);

/* Every sentence the plan can put on screen. */
function planText(plan) {
  const out = [];
  out.push(...plan.bom.flatMap((b) => [b.text, b.note ?? ""]));
  for (const s of plan.steps) {
    const t = plan.stepText(s);
    out.push(...plan.needs(s).flatMap((b) => [b.text, b.note ?? ""]), ...plan.actions(s));
    out.push(t.title, t.kicker, t.heading, t.blurb);
  }
  for (const g of plan.present) { const f = plan.facts(g); if (f) out.push(f.title, f.scale, ...f.rows.flat()); out.push(plan.groupLabel(g)); }
  out.push(...plan.spec.flat(), ...plan.notes, plan.layout);
  return out.map(String).join("\n");
}
/* The values of the hidden results, as a page would print them. A hidden
   result equal to an input the lab quotes (the cruise speed, the payload)
   is passed over here, and proved separately not to be what is shown: VA
   is capped at the cruise speed (engine.js), so the two are often equal. */
const QUOTED_INPUTS = ["vCruise", "payload"];
const sameAsInput = (k, SR, p) => QUOTED_INPUTS.some((q) => Number(p[q]) === SR[k]);
function hiddenValueHits(txt, SR, p) {
  const hits = [];
  for (const k of P.HIDDEN_FIELDS) {
    const v = SR[k];
    if (typeof v !== "number" || !isFinite(v) || Math.abs(v) < 1 || sameAsInput(k, SR, p)) continue;
    const forms = new Set(Math.abs(v) >= 10
      ? [Math.abs(v) >= 100 ? v.toFixed(0) : null, v.toFixed(1), v.toFixed(2), Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : null]
      : [v.toFixed(2)]);
    for (const f of forms) if (f && new RegExp(`(?<![\\d.,])${f.replace(/[.,]/g, (c) => "\\" + c)}(?![\\d])`).test(txt)) hits.push(`${k}=${f}`);
  }
  return hits;
}

console.log("EVTOL BUILD LAB GATE");
console.log("=".repeat(78));

console.log(`\n1. The plan, on the ${KEYS.length} layouts the app's switch makes`);
{
  const rows = each(({ r, plan }, k) => (r.r2Converged === true && plan.ready === true && P.READY_LAYOUTS.includes(k)) || `converged ${r.r2Converged}, ready ${plan.ready}`);
  check("every layout converges and the lab has a build for it", KEYS.length === 6 && failing(rows).length === 0 && P.READY_LAYOUTS.length === KEYS.length,
    failing(rows).join(" | ") || KEYS.join(", "));
}
{
  const rows = each(({ p, r, plan }) => {
    const geo = aircraftGeometry(p, r);
    const seen = new Map();
    for (const it of plan.items) for (const b of it.bodies) seen.set(b, (seen.get(b) ?? 0) + 1);
    const twice = [...seen.values()].filter((n) => n !== 1).length;
    const sameBodies = plan.geo.bodies.length === geo.bodies.length && plan.geo.bodies.every((b) => seen.get(b) === 1);
    const other = plan.items.filter((i) => !P.GROUP_ORDER.includes(i.group));
    return (sameBodies && twice === 0 && seen.size === plan.geo.bodies.length && other.length === 0)
      || `${plan.geo.bodies.length} bodies → ${plan.items.length} parts${other.length ? `; left over: ${other.map((i) => i.key)}` : ""}`;
  });
  check("every body of every layout's geometry is in exactly one part, every part in a named group, none left over", failing(rows).length === 0,
    failing(rows).join(" | ") || KEYS.map((k) => `${k} ${CASES[k].plan.geo.bodies.length}→${CASES[k].plan.items.length}`).join(", "));
}
{
  const rows = each(({ plan }, k) => JSON.stringify(plan.steps) === JSON.stringify(WANT_STEPS[k]) || plan.steps.join(">"));
  check("each layout gets its own steps, in order (arms and no wing on the wingless two; no booms on the tilt-rotor)", failing(rows).length === 0,
    failing(rows).join(" | ") || KEYS.map((k) => `${k} ${CASES[k].plan.steps.length}`).join(", "));
  const fit = each(({ plan }) => {
    const fitted = new Map();
    for (const s of plan.steps) for (const g of P.STEP_FITS[s] ?? []) fitted.set(g, (fitted.get(g) ?? 0) + 1);
    const present = [...plan.present];
    const unfitted = present.filter((g) => fitted.get(g) !== 1);
    const empty = plan.steps.filter((s) => s !== "parts" && s !== "review" && !(P.STEP_FITS[s] ?? []).some((g) => present.includes(g)));
    return (unfitted.length === 0 && empty.length === 0) || `fitted ≠ once: ${unfitted}; empty: ${empty}`;
  });
  check("every group present is fitted by exactly one step, and no step fits nothing, on every layout", failing(fit).length === 0, failing(fit).join(" | ") || "6 layouts");
}
{
  const both = P.SR_FIELDS.filter((k) => P.HIDDEN_FIELDS.includes(k));
  let threw = false;
  try { P.sr(LC.r, "MTOW"); } catch { threw = true; }
  check("the allowed and the hidden fields do not overlap, and sr() refuses a hidden one", both.length === 0 && threw, both.join(", ") || "sr(SR, \"MTOW\") throws");
  /* Every read of the result made from build-plan.js, recorded. The
     geometry and cabin modules read it too; they are the engine's. */
  const reads = each(({ p, r }) => {
    const readByPlan = new Set();
    const spy = new Proxy(r, { get(t, k, rcv) {
      if (typeof k === "string" && /build-plan\.js/.test(new Error().stack.split("\n")[2] ?? "")) readByPlan.add(k);
      return Reflect.get(t, k, rcv);
    } });
    planText(P.buildPlan(p, spy));
    const off = [...readByPlan].filter((k) => !P.SR_FIELDS.includes(k));
    return (off.length === 0 && readByPlan.size > 0) || `read: ${off.join(", ")}`;
  });
  check("the plan reads the sizing result through the allowed fields only, on every layout", failing(reads).length === 0, failing(reads).join(" | ") || "6 layouts");
  const shown = each(({ p, r, plan }) => {
    const txt = planText(plan), vals = hiddenValueHits(txt, r, p), word = txt.match(HIDDEN_WORDS)?.[0];
    return (!word && vals.length === 0 && !BAD.test(txt)) || (word ? `"${word}"` : vals.length ? vals.join(", ") : BAD.exec(txt)?.[0]);
  });
  check("no hidden result is named or shown on any layout: no MTOW, power, energy, torque, C-rate or disk loading, and none of their values", failing(shown).length === 0,
    failing(shown).join(" | ") || KEYS.map((k) => `${k} ${planText(CASES[k].plan).length} ch`).join(", "));
  /* A hidden result that equals a quoted input, moved to another value:
     the text does not move, so the number on screen is the input's. */
  const twinsAll = [];
  const twin = each(({ p, r, plan }) => {
    const txt = planText(plan);
    const twins = P.HIDDEN_FIELDS.filter((k) => typeof r[k] === "number" && sameAsInput(k, r, p));
    twinsAll.push(...twins);
    const moved = twins.filter((k) => planText(P.buildPlan(p, { ...r, [k]: r[k] * 1.37 + 3.1 })) !== txt);
    return moved.length === 0 || `moved: ${moved}`;
  });
  check("a hidden result equal to a quoted input is not what is shown: moving it leaves every word of the plan unchanged", failing(twin).length === 0,
    failing(twin).join(" | ") || `${twinsAll.length} twins (${[...new Set(twinsAll)].join(", ") || "none"}) moved, text unchanged`);
}
{
  /* THE BUILD FOLLOWS THE SIZING. Two payloads per layout, through the
     same switch: what is drawn is the sizing's, and it moves with it. */
  const rows = each(({ p }, k) => {
    const at = [300, 550].map((payload) => { const q = { ...p, payload }, r = runSizing(engineInputs(q)); return { q, r, plan: P.buildPlan(q, r) }; });
    const why = [];
    for (const { q, r, plan } of at) {
      if (!plan.ready) { why.push(`${q.payload} kg: ${plan.kind}`); continue; }
      const L = plan.fuselage.x1 - plan.fuselage.x0;
      if (Math.abs(L - r.fusLen) > 1e-9) why.push(`fuselage ${L} vs ${r.fusLen}`);
      if (plan.wing && Math.abs(plan.wing.span - r.bWing) > 1e-9) why.push(`span ${plan.wing.span} vs ${r.bWing}`);
      const occ = cabinAdequacy({ fusLen: r.fusLen, fusDiam: q.fusDiam, payload: q.payload, nOccupants: q.nOccupants ?? q.nSeats }).occupants;
      if (plan.seats.length !== Math.max(1, Math.round(occ))) why.push(`${plan.seats.length} seats for ${occ}`);
      if (!plan.spec.some(([a, b]) => a === "Fuselage length" && b === `${r.fusLen.toFixed(2)} m`)) why.push("spec length");
    }
    const sig = (x) => x.plan.ready ? [x.plan.fuselage.x1 - x.plan.fuselage.x0, x.plan.wing?.span ?? 0, x.plan.seats.length].map((v) => v.toFixed(3)).join("/") : "-";
    if (sig(at[0]) === sig(at[1])) why.push(`nothing moved (${sig(at[0])})`);
    return why.length === 0 ? { ok: true, s: `${sig(at[0])} → ${sig(at[1])}` } : { why: why.join(", ") };
  });
  check("the build follows the sizing: at 300 and 550 kg payload the fuselage, wing span and seats drawn are the sizing's, and they change",
    failing(rows).length === 0, failing(rows).join(" | ") || rows.map(([k, v]) => `${k} ${v.s}`).join("; "));
}
{
  /* Each layout's own sentences, against the geometry they describe. */
  const rows = each(({ plan }, k) => {
    const all = planText(plan), b = plan.geo.bodies, why = [];
    const rotors = b.filter((x) => x.kind === "rotor"), wing = plan.wing;
    const booms = b.filter((x) => x.kind === "boom" && x.stations);
    if (booms.length && wing) {
      const above = booms.every((x) => x.z > wing.z), under = booms.every((x) => x.z < wing.z);
      if (above !== /booms? on top of the wing/.test(all) || under !== /booms? under the wing/.test(all)) why.push("boom side");
    }
    const tilting = rotors.some((r) => r.tilting);
    if (tilting !== /not modelled, so the 3D flight below stops there/.test(all)) why.push("tilt sentence");
    if (tilting !== plan.notes.some((n) => /hover position/.test(n))) why.push("tilt note");
    if (!!b.find((x) => x.kind === "pusher") !== /Fit the cruise pusher/.test(all)) why.push("pusher");
    if (plan.pod !== /ellipsoid pod/.test(all) || plan.pod === /after NASA's RAVEN/.test(all)) why.push("fuselage source");
    if (k === "sideBySide") {
      const [a, c] = rotors, ratio = Math.hypot(a.x - c.x, a.y - c.y) / (a.radius + c.radius);
      if (Math.abs(ratio - SBS_HUB_SEP_OVER_D) > 0.005 || !/AIAA 2018-3847, Fig\. 4/.test(all) || !all.includes(`${SBS_HUB_SEP_OVER_D.toFixed(2)} of a diameter`)) why.push(`overlap ${ratio.toFixed(3)}`);
    } else if (/discs overlap/.test(all)) why.push("overlap sentence on a layout without it");
    if (k === "multicopter") {
      const rise = Math.max(...rotors.map((r) => r.z)) - Math.min(...rotors.map((r) => r.z)), D = 2 * rotors[0].radius;
      if (Math.abs(rise / D - MC_AFT_RISE_OVER_D) > 1e-6 || !/AIAA 2018-3847, Fig\. 1/.test(all) || !all.includes(`${rise.toFixed(2)} m above the lowest`)) why.push(`rise ${(rise / D).toFixed(4)}`);
    } else if (/step up towards the tail/.test(all)) why.push("rise sentence on a layout without it");
    return why.length === 0 || why.join(", ");
  });
  check("each layout's own sentences match its geometry: boom side, tilting rotors, pusher, fuselage source, the side-by-side overlap (0.84 D) and the multicopter rise (0.17 D) they cite",
    failing(rows).length === 0, failing(rows).join(" | ") || "6 layouts");
}
{
  const odd = P.buildPlan({ ...LC.p, configType: "notALayout" }, LC.r);
  check("a layout the lab does not know gets a notice, and no parts", !odd.ready && odd.kind === "not-yet" && !odd.items && odd.text?.length > 20, odd.text);
  const nc = P.buildPlan(LC.p, { ...LC.r, r2Converged: false });
  check("a sizing that has not converged gets its own notice, and no parts", !nc.ready && nc.kind === "not-converged" && !nc.items, nc.text);
}

console.log("\n2. True scale, in Node with three.js, on every layout");
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const BUILT = Object.fromEntries(KEYS.map((k) => {
  const plan = CASES[k].plan, ev = E.buildEvtol(plan);
  ev.group.updateMatrixWorld(true);
  const { fromWorld } = E.worldFrame(plan);
  const boxAc = (o) => {
    const b = new THREE.Box3().setFromObject(o), a = fromWorld(b.min), c = fromWorld(b.max);
    return [0, 1, 2].map((i) => [Math.min(a[i], c[i]), Math.max(a[i], c[i])]);
  };
  return [k, { plan, ev, fromWorld, boxAc, item: (key) => ev.items.find((i) => i.userData.itemKey === key), itemsOf: (g) => ev.items.filter((i) => i.userData.groupKey === g) }];
}));
const eachB = (f, keys = KEYS) => keys.map((k) => [k, f(BUILT[k], k)]);
{
  const rows = eachB(({ plan }) => {
    const fus = plan.fuselage;
    const mine = E.loftRings(fus, { around: 64, maxStep: 0.1 }).filter((r) => r.station != null);
    const pts = buildMesh({ bodies: [fus] }, PALETTE, { seg: 16 }).flatMap((f) => f.v);
    let matched = 0;
    for (const v of pts) {
      let best = Infinity;
      for (const r of mine) for (const q of r.pts) best = Math.min(best, Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]));
      if (best < 1e-9) matched++;
    }
    return (pts.length > 0 && matched === pts.length) ? { ok: true, s: `${matched}/${pts.length}` } : { why: `${matched} of ${pts.length} vertices` };
  });
  check("each fuselage (RAVEN's body, or the multicopter's pod) carries mesh.js's own section rings at every sized station, vertex for vertex",
    failing(rows).length === 0, failing(rows).join(" | ") || rows.map(([k, v]) => `${k} ${v.s}`).join(", "));
}
{
  const winged = KEYS.filter((k) => BUILT[k].plan.wing);
  const rows = eachB(({ plan, boxAc, itemsOf }) => {
    const w = plan.wing, [bx, by] = boxAc(itemsOf("wing")[0]);
    const tipLE = w.x + (w.span / 2) * Math.tan((w.sweepDeg * Math.PI) / 180);
    return (near(by[0], -w.span / 2) && near(by[1], w.span / 2) && near(bx[0], w.x) && near(bx[1], Math.max(w.x + w.rootChord, tipLE + w.tipChord)))
      || `y ${by.map((v) => v.toFixed(4)).join("..")} for span ${w.span.toFixed(4)}`;
  }, winged);
  check("every wing's tips are at ± half the span, its leading and trailing edges where the planform puts them", winged.length === 4 && failing(rows).length === 0,
    failing(rows).join(" | ") || winged.map((k) => `${k} ${BUILT[k].plan.wing.span.toFixed(2)} m`).join(", "));
}
{
  const withTail = KEYS.filter((k) => BUILT[k].plan.present.has("tail"));
  const rows = eachB(({ plan, boxAc, item }) => {
    const b = plan.geo.bodies, vt = b.find((x) => x.kind === "vtail"), fin = b.find((x) => x.kind === "vfin"), st = b.find((x) => x.kind === "htail"), why = [];
    if (vt) {
      const g = (vt.dihedralDeg * Math.PI) / 180, [, by] = boxAc(item("tail:V-tail"));
      const want = vt.span * Math.cos(g), tol = vt.tipChord * (vt.thickRatio ?? 0.12) * 0.6 + 1e-6;
      if (!near(by[1], want, tol) || !near(by[0], -want, tol)) why.push(`V-tail ±${by[1].toFixed(4)} for ${want.toFixed(4)}`);
    }
    if (fin) { const [, , bz] = boxAc(item(`tail:${fin.label}`)); if (!near(bz[0], fin.z) || !near(bz[1], fin.z + fin.span)) why.push(`fin ${bz.map((v) => v.toFixed(4))}`); }
    if (st) { const [, by] = boxAc(item(`tail:${st.label}`)); if (!near(by[0], -st.span / 2) || !near(by[1], st.span / 2)) why.push(`stabilator ${by.map((v) => v.toFixed(4))}`); }
    if (!vt && !fin && !st) why.push("no tail surface");
    return why.length === 0 || why.join(", ");
  }, withTail);
  check("every tail is at its span: a V-tail's panels reach span·cos γ to each side, a fin stands its height, a stabilator spans its span",
    withTail.length === 4 && failing(rows).length === 0, failing(rows).join(" | ") || withTail.join(", "));
}
{
  const rows = eachB(({ plan, ev }) => {
    const bodies = plan.geo.bodies.filter((b) => b.kind === "rotor" || b.kind === "pusher"), bad = [];
    for (const r of ev.rotors) {
      const c = new THREE.Vector3(); r.blades.parent.getWorldPosition(c);
      const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(r.blades.parent.getWorldQuaternion(new THREE.Quaternion()));
      let maxR = 0;
      r.blades.traverse((o) => {
        if (!o.isMesh) return;
        const pa = o.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).sub(c); const al = v.dot(ax); maxR = Math.max(maxR, Math.sqrt(Math.max(0, v.lengthSq() - al * al))); }
      });
      if (!near(maxR, r.radius)) bad.push(`${r.label}: ${maxR.toFixed(5)} for ${r.radius.toFixed(5)}`);
    }
    const radii = (a) => a.map((x) => x.radius).sort((x, y) => x - y).join();
    return (ev.rotors.length === bodies.length && radii(ev.rotors) === radii(bodies) && bad.length === 0) || bad.join("; ") || `${ev.rotors.length} drawn for ${bodies.length}`;
  });
  check("every rotor and pusher of every layout reaches exactly its geometry radius", failing(rows).length === 0,
    failing(rows).join(" | ") || KEYS.map((k) => `${k} ${BUILT[k].ev.rotors.length}×`).join(", "));
}
{
  const rows = eachB(({ plan, ev, boxAc }) => {
    const wheels = plan.geo.bodies.filter((b) => b.kind === "wheel"), bad = [];
    const tyres = []; ev.group.traverse((o) => { if (o.isMesh && o.name === "tyre") tyres.push(o); });
    for (const t of tyres) {
      const [bx, by, bz] = boxAc(t), mid = [(bx[0] + bx[1]) / 2, (by[0] + by[1]) / 2, (bz[0] + bz[1]) / 2];
      const w = wheels.reduce((best, b) => (Math.hypot(b.x - mid[0], b.y - mid[1], b.z - mid[2]) < Math.hypot(best.x - mid[0], best.y - mid[1], best.z - mid[2]) ? b : best));
      if (!near(bx[1] - bx[0], 2 * w.radius) || !near(bz[1] - bz[0], 2 * w.radius) || !near(by[1] - by[0], w.width)) bad.push(`${w.label}: ${(bx[1] - bx[0]).toFixed(4)} × ${(by[1] - by[0]).toFixed(4)}`);
    }
    const lowest = Math.min(...tyres.map((t) => boxAc(t)[2][0]));
    if (!near(lowest, plan.zGround, 1e-4)) bad.push(`lowest ${lowest.toFixed(4)} vs ground ${plan.zGround.toFixed(4)}`);
    return (tyres.length === wheels.length && wheels.length > 0 && bad.length === 0) || bad.join("; ") || `${tyres.length} tyres for ${wheels.length}`;
  });
  check("every tyre is its wheel's diameter and width, and stands on the ground line the plan draws to", failing(rows).length === 0, failing(rows).join(" | ") || "6 layouts");
}
{
  const rows = eachB(({ plan, boxAc, itemsOf }) => {
    const bad = [], motors = itemsOf("motors"), nRotors = plan.geo.bodies.filter((b) => b.kind === "rotor").length;
    for (const m of motors) {
      const it = plan.items.find((i) => i.key === m.userData.itemKey);
      const R = Math.max(...it.bodies.map((b) => b.radius ?? 0));
      const [bx, by] = boxAc(m);
      if (!near(bx[1] - bx[0], 2 * R) || !near(by[1] - by[0], 2 * R)) bad.push(`${it.key}: ${(bx[1] - bx[0]).toFixed(4)} for ${(2 * R).toFixed(4)}`);
    }
    return (motors.length === nRotors && bad.length === 0) ? { ok: true, s: `${motors.length}` } : { why: bad.join("; ") || `${motors.length} stacks for ${nRotors} rotors` };
  });
  check("every layout has one motor stack per rotor, each drawn standing at its geometry diameter", failing(rows).length === 0,
    failing(rows).join(" | ") || rows.map(([k, v]) => `${k} ${v.s}`).join(", "));
}
{
  /* A tilting nacelle is authored in the airplane attitude; mesh.js stands
     it up for the hover about its rotor's hub. The lab's must be where
     mesh.js's is: same box, to the difference between a 32- and a 10-sided
     ring. */
  const tilters = KEYS.filter((k) => BUILT[k].plan.geo.bodies.some((b) => b.kind === "nacelle" && b.tilting));
  const rows = eachB(({ plan, boxAc, item }) => {
    const bad = [];
    const nacs = plan.geo.bodies.filter((b) => b.kind === "nacelle" && b.tilting);
    for (const n of nacs) {
      const stem = String(n.label).replace(/ nacelle$/, ""), mate = plan.geo.bodies.find((o) => o.kind === "rotor" && o.label === stem);
      const v = buildMesh({ bodies: [n, mate] }, PALETTE, { seg: 10 }).filter((f) => f.colour === PALETTE.nacTilt).flatMap((f) => f.v);
      const ref = [0, 1, 2].map((i) => [Math.min(...v.map((p) => p[i])), Math.max(...v.map((p) => p[i]))]);
      const mine = boxAc(item(`nacelle:${stem}`)), tol = 0.03 * Math.max(...n.stations.map((s) => Math.max(s.w, s.h))) + 0.01;
      const off = [0, 1, 2].flatMap((i) => [Math.abs(mine[i][0] - ref[i][0]), Math.abs(mine[i][1] - ref[i][1])]);
      const len = n.x1 - n.x0;
      if (Math.max(...off) > tol || !near(ref[2][1] - ref[2][0], len, 0.02 * len)) bad.push(`${stem}: off ${Math.max(...off).toFixed(3)} m (tol ${tol.toFixed(3)}), height ${(mine[2][1] - mine[2][0]).toFixed(3)} for ${len.toFixed(3)}`);
    }
    return (nacs.length > 0 && bad.length === 0) ? { ok: true, s: `${nacs.length}` } : { why: bad.join("; ") || "no tilting nacelle" };
  }, tilters);
  check("every tilting nacelle hangs below its rotor in the hover pose, where mesh.js's own posing puts it", tilters.length === 3 && failing(rows).length === 0,
    failing(rows).join(" | ") || rows.map(([k, v]) => `${k} ${v.s}`).join(", "));
}
{
  /* Overlapping discs in one plane: the parked blades of one rotor must
     not pass through the other's. Each blade as its centreline in plan,
     hub to tip; two blades clear when their centrelines are more than a
     chord apart. */
  const seg = (p, q, r, s) => {
    const d = (a, b, c) => { const ux = c[0] - b[0], uy = c[1] - b[1], L = ux * ux + uy * uy || 1, t = Math.max(0, Math.min(1, ((a[0] - b[0]) * ux + (a[1] - b[1]) * uy) / L)); return Math.hypot(a[0] - b[0] - t * ux, a[1] - b[1] - t * uy); };
    const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (o(p, q, r) !== o(p, q, s) && o(r, s, p) !== o(r, s, q)) return 0;
    return Math.min(d(p, r, s), d(q, r, s), d(r, p, q), d(s, p, q));
  };
  const { plan, ev, fromWorld } = BUILT.sideBySide;
  const lines = ev.rotors.filter((r) => r.kind === "rotor").map((r) => {
    const body = plan.geo.bodies.find((b) => b.kind === "rotor" && b.label === r.label), hub = [body.x, body.y], out = [];
    r.blades.children.forEach((m) => {
      m.updateMatrixWorld(true);
      const pa = m.geometry.attributes.position, v = new THREE.Vector3(), tips = [];
      for (let i = 0; i < pa.count; i++) { const a = fromWorld(v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld)); if (Math.hypot(a[0] - hub[0], a[1] - hub[1]) > 0.97 * body.radius) tips.push(a); }
      const tip = [tips.reduce((s, a) => s + a[0], 0) / tips.length, tips.reduce((s, a) => s + a[1], 0) / tips.length];
      out.push([hub, tip]);
    });
    return { label: r.label, out };
  });
  const chord = Math.max(...plan.geo.bodies.filter((b) => b.kind === "rotor").map((r) => Math.max(0.04 * r.radius, (r.solidity || 0.1) * Math.PI * r.radius / Math.max(2, r.blades || 3))));
  let min = Infinity;
  for (const [p, q] of lines[0]?.out ?? []) for (const [r, s] of lines[1]?.out ?? []) min = Math.min(min, seg(p, q, r, s));
  check("the side-by-side rotors' parked blades clear each other where the discs overlap", lines.length === 2 && lines.every((l) => l.out.length >= 2) && min > chord,
    `closest blade centrelines ${min.toFixed(3)} m apart, blade chord ${chord.toFixed(3)} m`);
}
{
  const rows = eachB(({ plan, boxAc, item, itemsOf }) => {
    const fb = boxAc(item("fuselage")), why = [];
    const inside = (b) => [0, 1, 2].every((i) => b[i][0] >= fb[i][0] - 1e-6 && b[i][1] <= fb[i][1] + 1e-6);
    const out = [...itemsOf("seats"), ...itemsOf("battery")].filter((m) => !inside(boxAc(m))).map((m) => m.userData.itemKey);
    if (itemsOf("seats").length !== plan.nSeats || itemsOf("battery").length !== 1 || out.length) why.push(`outside: ${out}`);
    /* The person stands where the plan puts them (the scene stands them
       there from the first build step on), clear of every rotor disc. */
    const { x: px, y: py } = plan.person;
    const hit = plan.geo.bodies.filter((b) => b.kind === "rotor" && Math.hypot(px - b.x, py - b.y) < b.radius + 0.3).map((b) => b.label);
    if (hit.length) why.push(`person under ${hit}`);
    return why.length === 0 || why.join(", ");
  });
  const placed = read("src/panels/evtol-build/hangar-scene.js").includes("model.person.position.copy(model.toWorld(curPlan.person.x, curPlan.person.y, curPlan.zGround))");
  check("on every layout the drawn seats and pack sit inside the fuselage, and the person stands clear of every rotor disc where the scene places them", failing(rows).length === 0 && placed,
    failing(rows).join(" | ") || (placed ? KEYS.map((k) => `${k} (${BUILT[k].plan.person.x.toFixed(1)}, ${BUILT[k].plan.person.y.toFixed(1)})`).join(", ") : "the scene does not place the person at plan.person"));
  const h = new THREE.Box3().setFromObject(BUILT.liftcruise.ev.person);
  check("the person is 1.8 m tall, standing on the floor", near(h.max.y - h.min.y, 1.8) && near(h.min.y, 0) && E.PERSON_HEIGHT_M === 1.8, `${(h.max.y - h.min.y).toFixed(4)} m`);
}
for (const k of KEYS) E.disposeGroup(BUILT[k].ev.group);

/* ── Bundle the REAL panel (as validation/tab-render.mjs does). ── */
console.log("\n3. The panel, rendered");
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".evtol-lab-"));
const abs = (rel) => JSON.stringify(join(process.cwd(), rel).replace(/\\/g, "/"));
writeFileSync(join(dir, "entry.jsx"), `export { EvtolBuildLab, LAB_TITLE } from ${abs("src/panels/evtol-build/EvtolBuildLab.jsx")};\n`);
let MOD;
try {
  await build({
    entryPoints: [join(dir, "entry.jsx")], outfile: join(dir, "bundle.mjs"), bundle: true, format: "esm", platform: "node",
    jsx: "automatic", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
    external: ["react", "react-dom", "react/jsx-runtime", "recharts", "three", "three/*"],
  });
  MOD = await import(pathToFileURL(join(dir, "bundle.mjs")).href);
} finally { rmSync(dir, { recursive: true, force: true }); }
const render = (props) => {
  let html = "", err = null;
  try { html = renderToStaticMarkup(React.createElement(MOD.EvtolBuildLab, props)); } catch (e) { err = e.message; }
  return { html, txt: text(html), err };
};
{
  let n = 0;
  const rows = each(({ p, r, plan }) => {
    const bad = [];
    plan.steps.forEach((s, i) => {
      n++;
      const { txt, err, html } = render({ params: p, SR: r, initialStep: i });
      const need = [MOD.LAB_TITLE, plan.stepText(s).heading, `Step ${i + 1} of ${plan.steps.length}`, "Loading the 3D hangar", "Sized now", plan.layout, ...plan.notes, ...plan.actions(s)];
      const miss = need.filter((x) => !txt.includes(x));
      const word = txt.match(HIDDEN_WORDS)?.[0], vals = hiddenValueHits(txt, r, p);
      if (err || BAD.test(txt) || miss.length || word || vals.length || !/data-evtol-build-lab/.test(html))
        bad.push(`${s}: ${err || BAD.exec(txt)?.[0] || word || vals.join(",") || ""} missing [${miss.join(" / ").slice(0, 120)}]`);
    });
    return bad.length === 0 || bad.slice(0, 2).join("; ");
  });
  check("every step of every layout renders its card, its actions and the drawn-parts notes, with no null/undefined/NaN and no hidden quantity",
    failing(rows).length === 0, failing(rows).join(" | ") || `${n} steps over 6 layouts`);
  const fly = render({ params: LC.p, SR: LC.r, initialStep: LC.plan.steps.length - 1 }).txt;
  check("the last step hands over to the 3D flight, which stops at the transitions it does not model", /Fly the mission in 3D/.test(fly) && /not modelled/.test(fly));
}
{
  const odd = render({ params: { ...LC.p, configType: "notALayout" }, SR: LC.r });
  const nc = render({ params: LC.p, SR: { ...LC.r, r2Converged: false } });
  check("an unknown layout and an unconverged sizing render their notice and no lab",
    /data-lab-notice="not-yet"/.test(odd.html) && /data-lab-notice="not-converged"/.test(nc.html) && !/data-evtol-build-lab/.test(odd.html + nc.html)
    && !odd.err && !nc.err && !BAD.test(odd.txt + nc.txt), `${odd.txt.slice(0, 80)}… | ${nc.txt.slice(0, 80)}…`);
}

console.log("\n4. Source");
{
  const walk = (d) => readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : [q]; });
  const srcDir = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = walk(srcDir).filter((f) => /\.(m?js|jsx)$/.test(f));
  const rel = (f) => f.slice(srcDir.length + 1).replace(/\\/g, "/");
  const threeUsers = files.filter((f) => /from\s+"three(\/[^"]*)?"/.test(readFileSync(f, "utf8"))).map(rel).sort();
  check("three.js is imported by the scene modules only",
    JSON.stringify(threeUsers) === JSON.stringify(["classes/drone/build-fly/drone-parts.js", "classes/drone/build-fly/drone-scene.js", "panels/evtol-build/evtol-parts.js", "panels/evtol-build/hangar-scene.js", "panels/mission-flight-3d/flight-scene.js"]), threeUsers.join(", "));
  const D = "src/panels/evtol-build/";
  const importsOf = (f) => [...read(D + f).matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  const allow = {
    "build-plan.js": ["../../engine/geometry.js", "../../engine/configuration.js", "../../engine/cabin.js"],
    /* mesh.js for its one posing convention (tiltAngleRad, tiltPt). */
    "evtol-parts.js": ["three", "three/addons/geometries/RoundedBoxGeometry.js", "../../engine/mesh.js"],
    "hangar-scene.js": ["three", "three/addons/controls/OrbitControls.js", "three/addons/environments/RoomEnvironment.js", "three/addons/renderers/CSS2DRenderer.js", "./evtol-parts.js", "./build-plan.js"],
    "EvtolBuildLab.jsx": ["react", "../../lib/theme.js", "../../ui/tokens.js", "../../ui/primitives.jsx", "./build-plan.js"],
  };
  const off = Object.entries(allow).filter(([f, a]) => JSON.stringify(importsOf(f)) !== JSON.stringify(a)).map(([f]) => `${f}: ${importsOf(f).join(", ")}`);
  check("each module imports only its allowlist: the plan reads the engine's geometry, the parts read three.js and mesh.js's posing, the scene reads the parts and the plan, the panel reads the plan",
    off.length === 0, off.join(" | ") || "4 modules");
  const panel = read(D + "EvtolBuildLab.jsx"), scene = read(D + "hangar-scene.js");
  const sceneUsers = files.filter((f) => /(from\s+|import\()\s*"[^"]*hangar-scene/.test(readFileSync(f, "utf8"))).map(rel);
  check("the panel fetches the scene by one dynamic import, and nothing else references it",
    (panel.match(/import\("\.\/hangar-scene\.js"\)/g) || []).length === 1 && JSON.stringify(sceneUsers) === JSON.stringify(["panels/evtol-build/EvtolBuildLab.jsx"]), sceneUsers.join(", "));
  /* The plan names the hidden fields once, in the list sr() refuses. */
  const planSrc = read(D + "build-plan.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/export const HIDDEN_FIELDS = [\s\S]*?\]\);/, "");
  const names = P.HIDDEN_FIELDS.filter((k) => new RegExp(`\\b${k}\\b`).test(planSrc));
  const direct = planSrc.replace(/export function sr\(SR, k\) \{[\s\S]*?\n\}/, "").match(/\bSR\s*(\.|\?\.|\[)|\{[^}]*\}\s*=\s*SR\b/g);
  check("the plan reads the result through sr() only, and names a hidden field nowhere but the list sr() refuses", names.length === 0 && !direct,
    [names.length ? `named: ${names}` : "", direct ? `direct: ${direct}` : ""].filter(Boolean).join(" | ") || "sr() only");
  const FLAGGED = new RegExp(`\\b(${P.HIDDEN_FIELDS.join("|")})\\b`);
  const leak = ["evtol-parts.js", "hangar-scene.js", "EvtolBuildLab.jsx"].filter((f) => FLAGGED.test(read(D + f)) || /\bSR\./.test(read(D + f).replace(/SR=\{SR\}/g, "")));
  check("the parts, the scene and the panel read no sizing result at all", leak.length === 0, leak.join(", "));
  const vsp = read("src/tabs/OpenVSPTab.jsx"), bt = read("src/tabs/BuildEvtolTab.jsx"), app = read("src/App.jsx");
  const iLab = bt.indexOf("<EvtolBuildLab params={params} SR={SR}/>"), iFly = bt.indexOf("<MissionFlight3D params={params} SR={SR}/>");
  check("the Build eVTOL tab mounts the lab once, ahead of the 3D flight it hands over to, and the OpenVSP tab no longer does",
    iLab >= 0 && iFly > iLab && (bt.match(/<EvtolBuildLab /g) || []).length === 1 && !/EvtolBuildLab/.test(vsp.replace(/\/\*[\s\S]*?\*\//g, "")));
  const tools = TAB_GROUPS.find((g) => g.label === "Tools")?.tabs || [];
  check("Build eVTOL is tab 29, appended so no ?tab= link moves, rendered by App and listed right after OpenVSP",
    TABS.length === 30 && TABS[15] === "OpenVSP" && TABS[29] === "Build eVTOL" && tools.indexOf(29) === tools.indexOf(15) + 1
    && /\{tab===29&&<BuildEvtolTab \{\.\.\.tabCtx\}\/>\}/.test(app), `${TABS.length} tabs; Tools ${tools.join(",")}`);
  check("every scene gets a fresh canvas, removed with it, and the WebGL context is released",
    /canvas = document\.createElement\("canvas"\);/.test(panel) && /apiRef\.current\?\.dispose\(\); apiRef\.current = null; canvas\?\.remove\(\);/.test(panel)
    && !/<canvas/.test(panel) && /forceContextLoss/.test(scene));
  check("the panel observes visibility and size through window, as scope-check requires",
    /window\.IntersectionObserver/.test(panel) && /window\.ResizeObserver/.test(panel) && /window\.matchMedia/.test(scene)
    && !/[^.\w](IntersectionObserver|ResizeObserver)\(/.test(panel.replace(/window\.(IntersectionObserver|ResizeObserver)/g, "")));
  /* App.jsx turns the tabs on the arrow keys from window; a step taken in
     the lab must not also turn the tab (found by the Edge probe). */
  check("the lab's arrow keys step the build and stop there, so the app's tab switch does not also fire",
    /onKeyDown=\{onKey\}/.test(panel) && /e\.preventDefault\(\); e\.stopPropagation\(\);/.test(panel) && !/window\.addEventListener\("keydown"/.test(panel));
  /* A layout switch keeps the student on the same step by name. */
  check("a new plan keeps the step by name when the new layout has it", /now\.indexOf\(was\[i\]\)/.test(panel));
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
