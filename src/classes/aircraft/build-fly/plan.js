/* =====================================================================
   AIRCRAFT BUILD PLAN — the sized aeroplane, part by part, as data
   =====================================================================
   The Build tab assembles the aeroplane the studio sized, one group of
   parts at a time, and the Fly tab flies the same shape. Both read THIS
   module and nothing else for the airframe, and this module reads
   generalArrangement() — the description the general-arrangement
   drawing, the structure views and the export are drawn from — plus the
   gear stations and tyres balance.js and gear.js already place. So the
   3D aeroplane cannot drift from the 2D one: there is no second
   description of it to drift from.

   NOTHING HERE SIZES ANYTHING. Every number is either a sizing result,
   a published figure the geometry module already attributes, or a
   drawing convention, and each fact carries which (`prov`):
     sized    produced by the class's sizing loop
     sourced  a published proportion, with its citation
     drawn    a convention so the aeroplane looks like an aeroplane; the
              Build tab prints the reason and never gives it a number
              presented as a result
   The cross-section is the one place this module adds shape: the
   drawing gives a side outline and a plan outline, and a 3D body needs
   a section between them. It is an ellipse through the two, which is
   drawn, and says so.

   Axes are the geometry module's: metres, origin at the nose on the
   fuselage centreline, x aft, y starboard, z up.
   ===================================================================== */
import { generalArrangement, val, fuselageOutlinePoints, fuselagePlanOutline, leSweepRad } from "../geometry.js";
import { balanceOf } from "../balance.js";
import { gearOf } from "../gear.js";

const IN = 0.0254;
const rad = (d) => (d * Math.PI) / 180;

/* The provenance of one geometry value. A plain number in the general
   arrangement is a sizing result; a wrapped one says what it is. */
export function provOf(v, fallback = "sized") {
  if (v && typeof v === "object" && "value" in v) {
    if (v.sized) return { prov: "sized" };
    if (v.sourced) return { prov: "sourced", why: v.cite };
    return { prov: "drawn", why: v.why };
  }
  return { prov: fallback };
}

/* A fact the Build tab prints: label, value and unit, and where it came
   from. `d` is the number of decimals to print. */
function fact(label, v, unit, d = 1, override = null) {
  const value = val(v);
  const prov = override ?? provOf(v);
  /* A drawn value is a drawing convention: the scene uses it, the table
     never prints it, so the fact does not carry it. */
  return { label, value: prov.prov !== "drawn" && Number.isFinite(value) ? value : null, unit, d, ...prov };
}
const drawnFact = (label, why) => ({ label, value: null, unit: "", d: 0, prov: "drawn", why });

/* ── the body, as stations ──────────────────────────────────────────── */

/* Walk a path of M/L/Q/C segments (the geometry module's own outline
   format) into points. */
export function samplePath(segs, n = 28) {
  const pts = [];
  let cur = [0, 0];
  const q = (a, c, b, t) => [0, 1].map((k) => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t * t * b[k]);
  const c3 = (a, c1, c2, b, t) => [0, 1].map((k) => (1 - t) ** 3 * a[k] + 3 * (1 - t) ** 2 * t * c1[k]
                                                 + 3 * (1 - t) * t * t * c2[k] + t ** 3 * b[k]);
  for (const [op, ...a] of segs) {
    if (op === "M" || op === "L") { cur = a[0]; pts.push(cur); }
    else if (op === "Q") { for (let i = 1; i <= n; i++) pts.push(q(cur, a[0], a[1], i / n)); cur = a[1]; }
    else if (op === "C") { for (let i = 1; i <= n; i++) pts.push(c3(cur, a[0], a[1], a[2], i / n)); cur = a[2]; }
  }
  return pts;
}

/* Linear interpolation in a list of [x, y] sorted by x. */
function at(list, x) {
  if (!list.length) return 0;
  if (x <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [x1, y1] = list[i];
    if (x <= x1) {
      const [x0, y0] = list[i - 1];
      return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
    }
  }
  return list[list.length - 1][1];
}
const monotone = (pts) => {
  const out = [];
  for (const p of pts) if (!out.length || p[0] > out[out.length - 1][0] + 1e-9) out.push(p);
  return out;
};

/* The fuselage as cross-sections along x: centre height zc, half-height
   a and half-width b. The crown and keel come from the side outline and
   the half-width from the plan outline, so the body passes through both
   drawn outlines exactly. */
export function fuselageStations(fus, count = 56) {
  const L = val(fus.length), H = val(fus.height), W = val(fus.width);
  const spec = { length: L, height: H, noseLength: val(fus.noseLength), tailLength: val(fus.tailLength), closure: fus.closure };
  const side = fuselageOutlinePoints(spec, 32).map((p) => [p.x, p.z]);
  /* The outline runs nose → crown → tail tip, then down the tail and back
     along the keel. Split it where it first reaches the tail. */
  const tip = side.findIndex((p) => p[0] >= L - 1e-9);
  const crown = monotone(side.slice(0, tip + 1));
  const keel = monotone(side.slice(tip + 1).reverse());
  const plan = samplePath(fuselagePlanOutline({ length: L, width: W, noseLength: spec.noseLength, tailLength: spec.tailLength }).slice(0, 4), 32);
  const half = monotone(plan);
  /* Denser at the two closures, where the shape changes. */
  const xs = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    xs.push(L * (0.5 - 0.5 * Math.cos(Math.PI * u)));
  }
  return xs.map((x) => {
    const zt = at(crown, x), zb = keel.length ? at(keel, x) : -zt;
    return { x, zc: (zt + zb) / 2, a: Math.max(0, (zt - zb) / 2), b: Math.max(0, at(half, x)) };
  });
}

/* ── a lifting surface, as its four corners ─────────────────────────── */

function surface({ rootLE, root, tip, semi, sweepLE, z, y0 = 0, dihedral = 0, tc }) {
  return { rootLE, root, tip, semi, sweepLE, z, y0, dihedral, tc };
}

/* ── the plan ───────────────────────────────────────────────────────── */

export const PLAN_STEPS = Object.freeze([
  { key: "fuselage", title: "Fuselage", heading: "Lay down the fuselage",
    blurb: "The body the cabin and payload set: its length, width and height are sized; the nose and tail-cone shapes are drawn." },
  { key: "wing", title: "Wing", heading: "Fit the wing",
    blurb: "Area, span, taper, sweep and thickness come out of the sizing. Where it sits along the body is drawn: placing it needs a balance model." },
  { key: "tail", title: "Tail", heading: "Add the tail",
    blurb: "Tail areas are sized. Their sweep and exact placement are drawn to the general-arrangement drawing." },
  { key: "engines", title: "Engines", heading: "Hang the engines",
    blurb: "Engine count, location and each engine's thrust or power come from the class and its sizing; nacelle and propeller sizes too." },
  { key: "gear", title: "Landing gear", heading: "Put it on its wheels",
    blurb: "The gear stations and the tyres the gear module selected. How far apart the main wheels sit (the track) is not computed, so it is drawn." },
  { key: "ready", title: "Ready to fly", heading: "Ready to fly",
    blurb: "The finished aeroplane at its sized weights. Fly it through the mission it was sized for." },
]);

/* The parts each step adds to the model, cumulatively. */
export const STEP_GROUPS = Object.freeze({
  fuselage: ["fuselage"],
  wing: ["fuselage", "wing"],
  tail: ["fuselage", "wing", "tail"],
  engines: ["fuselage", "wing", "tail", "engines"],
  gear: ["fuselage", "wing", "tail", "engines", "gear"],
  ready: ["fuselage", "wing", "tail", "engines", "gear"],
});

const ENGINE_PLACE = {
  nose: "one engine in the nose, driving a propeller",
  wing: "under the wing",
  "aft-fuselage": "on the rear fuselage, either side of the tail",
  "wing+tail": "under the wing and one in the tail",
  "fuselage-3": "three at the rear",
};

/* Why the plan cannot be built, or null. */
export function planRefusal(result) {
  if (!result) return "There is no design to build: the sizing has not produced a result.";
  if (!generalArrangement(result)) return "The sizing did not produce a wing area and span, so there is no aeroplane to build.";
  return null;
}

export function buildPlanOf(result) {
  const refusal = planRefusal(result);
  if (refusal) return { ok: false, refusal };
  const g = generalArrangement(result);
  const L = val(g.fuselage.length), W = val(g.fuselage.width), H = val(g.fuselage.height);
  const stations = fuselageStations(g.fuselage);

  const ar = g.wing.span ** 2 / Math.max(g.wing.area, 1e-9);
  const wing = surface({
    rootLE: val(g.wing.rootLE), root: g.wing.root, tip: g.wing.tip, semi: g.wing.span / 2,
    sweepLE: leSweepRad(g.wing.sweepDeg, ar, g.wing.taper), z: val(g.wing.z),
    dihedral: rad(val(g.wing.dihedralDeg)), tc: g.wing.tc ?? 0.12,
  });
  const htAr = g.ht.span ** 2 / Math.max(g.ht.area, 1e-9);
  const ht = surface({
    rootLE: g.ht.rootLE, root: g.ht.root, tip: g.ht.tip, semi: g.ht.span / 2,
    sweepLE: leSweepRad(val(g.ht.sweepDeg), htAr, g.ht.tip / Math.max(g.ht.root, 1e-9)),
    z: g.ht.z, y0: g.tTail ? 0 : (W / 2) * 0.6, tc: 0.10,
  });
  const vtAr = g.vt.height ** 2 / Math.max(g.vt.area, 1e-9);
  const vt = surface({
    rootLE: g.vt.rootLE, root: g.vt.root, tip: g.vt.tip, semi: g.vt.height,
    sweepLE: leSweepRad(val(g.vt.sweepDeg), vtAr, g.vt.tip / Math.max(g.vt.root, 1e-9)),
    z: H / 2, tc: 0.10,
  });

  /* Wheels: the stations balance.js places and the tyres gear.js picks.
     The track is not computed anywhere, so the main wheels go at a drawn
     spread, and a class whose gear cannot be resolved gets none. */
  const bal = balanceOf(result);
  const gear = gearOf(result);
  const wheels = [];
  if (gear?.resolved && bal) {
    for (const kind of ["nose", "main"]) {
      const it = (bal.items || []).find((i) => new RegExp(`^${kind === "nose" ? "Nose" : "Main"} gear$`).test(i.name || ""));
      const ty = gear.tyres?.[kind];
      if (!it || !Number.isFinite(it.x) || !(ty?.resolved && ty.tyre?.slrIn > 0)) continue;
      const r = ty.tyre.slrIn * IN;
      const ys = kind === "nose" ? [0] : [-1, 1].map((s) => s * Math.max(W * 0.55, g.wing.span * 0.09));
      for (const y of ys) wheels.push({ kind, x: it.x, y, r, size: ty.tyre.size ?? null });
    }
  }

  const P = result.propulsion ?? {};
  const isProp = g.props.length > 0;
  const steps = PLAN_STEPS.map((s) => ({ ...s, facts: [] }));
  const F = Object.fromEntries(steps.map((s) => [s.key, s.facts]));

  F.fuselage.push(
    fact("Length", g.fuselage.length, "m"),
    fact("Width", g.fuselage.width, "m", 2),
    fact("Height", g.fuselage.height, "m", 2),
    fact("Nose length", g.fuselage.noseLength, "m", 2),
    fact("Tail-cone length", g.fuselage.tailLength, "m", 2),
    drawnFact("Cross-section", "an ellipse through the side and plan outlines; the sizing gives no section shape"),
  );
  F.wing.push(
    fact("Area", g.wing.area, "m²", 1),
    fact("Span", g.wing.span, "m", 1),
    fact("Aspect ratio", ar, "", 2),
    fact("Taper ratio", g.wing.taper, "", 2),
    fact("Quarter-chord sweep", g.wing.sweepDeg, "°", 1),
    fact("Root chord", g.wing.root, "m", 2),
    fact("Tip chord", g.wing.tip, "m", 2),
    fact("Thickness-to-chord", g.wing.tc ?? null, "", 3, Number.isFinite(g.wing.tc) ? { prov: "sized" } : { prov: "drawn", why: "no thickness is given for this class" }),
    fact("Leading edge at the root", g.wing.rootLE, "m", 1),
    fact("Height on the body", g.wing.z, "m", 2),
    fact("Dihedral", g.wing.dihedralDeg, "°", 0),
  );
  F.tail.push(
    fact("Horizontal tail area", g.ht.area, "m²", 1),
    fact("Horizontal tail span", g.ht.span, "m", 1),
    fact("Vertical tail area", g.vt.area, "m²", 1),
    fact("Vertical tail height", g.vt.height, "m", 1),
    { label: "Layout", value: null, text: g.tTail ? "T-tail" : "conventional", unit: "", d: 0, prov: "sized", why: null },
    fact("Tailplane sweep", g.ht.sweepDeg, "°", 0),
    fact("Fin sweep", g.vt.sweepDeg, "°", 0),
  );
  F.engines.push(
    { label: "Engines", value: g.engines, unit: "", d: 0, prov: "sized" },
    { label: "Where", value: null, text: ENGINE_PLACE[g.engineLocation] ?? g.engineLocation, unit: "", d: 0, prov: "sized" },
    { label: P.kind === "thrust" ? "Thrust, each" : "Power, each", value: Number.isFinite(P.perEngine) ? P.perEngine : null,
      unit: P.unit ?? "", d: 0, prov: "sized" },
  );
  const pod = g.nacelles.find((n) => n.kind === "pod" || n.kind === "centre");
  if (pod) F.engines.push(fact("Nacelle diameter", pod.d, "m", 2), fact("Nacelle length", pod.l, "m", 2));
  if (isProp) F.engines.push(fact("Propeller diameter", g.props[0].d, "m", 2));
  if (g.engineLocation === "nose") F.engines.push(drawnFact("Cowling", "the nose cowling is drawn to the fuselage, not sized"));

  if (wheels.length) {
    const nose = wheels.find((w) => w.kind === "nose"), main = wheels.find((w) => w.kind === "main");
    if (nose) F.gear.push({ label: "Nose gear station", value: nose.x, unit: "m", d: 2, prov: "sized" },
                          { label: "Nose tyre", value: null, text: nose.size ?? "—", unit: "", d: 0, prov: "sized" });
    if (main) F.gear.push({ label: "Main gear station", value: main.x, unit: "m", d: 2, prov: "sized" },
                          { label: "Main tyre", value: null, text: main.size ?? "—", unit: "", d: 0, prov: "sized" });
    if (nose && main) F.gear.push({ label: "Wheelbase", value: main.x - nose.x, unit: "m", d: 2, prov: "sized" });
    F.gear.push(drawnFact("Track (main-wheel spread)", "no part of this tool computes the track; the gear module has only a turnover minimum"));
  } else {
    F.gear.push(drawnFact("Wheels", "the gear module could not split this design's gear, so no wheel is placed"));
  }

  F.ready.push(
    fact("Maximum take-off mass", result.mtowKg, "kg", 0),
    fact("Operating empty mass", result.oewKg, "kg", 0),
    fact("Payload", result.payloadKg, "kg", 0),
    fact("Fuel", result.fuelKg, "kg", 0),
    fact("Cruise speed", result.cruise?.speedKt, "kt", 0),
    fact("Cruise altitude", result.cruise?.altFt, "ft", 0),
    fact("Design range", result.designRangeNm, "nm", 0),
  );

  return {
    ok: true, type: g.type, label: g.label,
    size: { length: L, span: g.wing.span, width: W, height: H, groundZ: g.groundZ },
    fuselage: { length: L, width: W, height: H, stations },
    wing, ht, vt, tTail: !!g.tTail,
    nacelles: g.nacelles.map((n) => ({ ...n })),
    props: g.props.map((p) => ({ ...p })),
    engineLocation: g.engineLocation, engines: g.engines,
    wheels, groundZ: g.groundZ,
    steps,
  };
}
