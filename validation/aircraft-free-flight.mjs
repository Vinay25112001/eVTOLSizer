/* =====================================================================
   AIRCRAFT FREE-FLIGHT GATE — Fly · yourself
   =====================================================================
   build-fly/free-flight.js flies the sized aeroplane by hand: the class's
   own drag, engine, fuel and atmosphere, moved by GASP's point-mass
   equations (NASA CR-152303 vol. 6, eq. VI.1.105) with the lift tilted by
   the bank. This gate holds it to the sources it names and to the class
   it flies.

   1. THE START is the sized cruise point, at take-off mass less the fuel
      the class lists before cruise, trimmed level; full throttle falls
      short there only where the sizing itself says cruise power is not
      available.
   2. THE DRAG is the class's: the parabola reproduces every point of the
      class's polar curve, and at the class's cruise CL every class's
      polar gives the class's cruise L/D.
   3. A STEADY LEVEL TURN, flown through step(), holds n = 1/cos φ (Airbus
      2002, Fig. C18) and turns at g·tan φ/V (NDARC Theory, p. 82).
   4. THE STALL: at the Cessna 172S POH's weight and wing area, the
      trainer stalls in level turns at the POH's speeds for 0, 30, 45 and
      60° of bank (POH Fig. 5-3), to its 1 kt.
   5. THE LIMITS hold through hard manoeuvres: 0 ≤ n ≤ the limit load
      factor, CL ≤ CLmax, the bank and path limits; the stall and g
      warnings fire where they should.
   6. ENERGY: the change in energy height equals the integral of specific
      excess power (T − D)V/W, so the V equation carries its gravity term.
   7. FUEL: the mass falls by exactly the fuel burned; an empty tank gives
      no thrust; flown level at the cruise speed over the class's cruise
      distance, the model burns the class's cruise fuel to within 5 %.
   8. ROLL: the MIL-F-8785C Level 1, Category B rates (Tables IXa, IXf),
      reached in the table's time; the bank holds when released.
   9. CLEAN CLmax: the trainer's from the POH stall; the others the middle
      of Scholz's Table 5.1 range, adjustable only inside it.
  10. THE ENDINGS: ground, ceiling, Mach and too slow, each where it says.
  11. THE SOURCES: every number the model adds is in its table, labelled.
  12. THE TAB renders on the server with no bad value and every source
      row, keeps three.js lazy, and is listed in the studio.
  13. THE CHECKS CAN FAIL: mutants of free-flight.js, each caught by the
      check built for it and not by another.
   ===================================================================== */
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("AIRCRAFT FREE-FLIGHT GATE");
console.log("=".repeat(72));

const ROOT = process.cwd();
const FF_REL = "src/classes/aircraft/build-fly/free-flight.js";
const FF_PATH = join(ROOT, FF_REL);
const E = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/engine.js")).href);
const MP = await import(pathToFileURL(join(ROOT, "src/classes/aircraft/build-fly/mission-profile.js")).href);
const REAL = await import(pathToFileURL(FF_PATH).href);

const G = 9.80665, FT = 0.3048, KT = 1852 / 3600, LB = 0.45359237, D2R = Math.PI / 180;
const CASES = [];
for (const type of E.TYPE_IDS) {
  const t = E.typeOf(type);
  const analysis = Object.fromEntries(Object.entries(t.analysisInputs).map(([k, v]) => [k, v.value]));
  for (const mode of ["size", "analyse"]) {
    const params = mode === "analyse" ? { ...t.defaults, ...analysis } : { ...t.defaults };
    CASES.push({ id: `${type}/${mode}`, type, mode, params, analysis, result: E.designAircraft({ type, mode, params }) });
  }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
const f = (x, d = 3) => (Number.isFinite(x) ? Number(x).toFixed(d) : String(x));

/* The sources, as this gate transcribes them (the model carries its own copy). */
const POH = { weightLb: 2550, wingAreaFt2: 174, stall: [[0, 53], [30, 57], [45, 63], [60, 75]] };   // C172S POH Fig. 5-3 p. 5-12, KCAS, flaps up, power off
const MIL = { trainer: ["I", 60, 1.7], turboprop: ["II-L", 45, 1.9], bizjet: ["II-L", 45, 1.9], transport: ["III", 30, 2.0] };   // MIL-F-8785C Tables IXa, IXf
const SCHOLZ = { trainer: [1.3, 1.9], turboprop: [1.2, 1.8], bizjet: [1.4, 1.8], transport: [1.2, 1.8] };   // Scholz Table 5.1, clean
const CRUISE_FUEL_TOL = 0.05;   // a unit or efficiency slip moves cruise fuel by 13 % or more (mutant 7); the class's own Breguet-versus-stepwise spread is under 4 %

/* Fly from state s for `seconds`; `each(before, after)` may return true to stop. */
function run(F, m, s, input, seconds, dt = F.DRAWN.dtS, each) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n && !s.ended; i++) {
    const s1 = F.step(m, s, typeof input === "function" ? input(s, i * dt) : input, dt);
    const stop = each?.(s, s1);
    s = s1;
    if (stop) break;
  }
  return s;
}
/* The throttle that makes thrust equal drag in this state, or 1. */
function trimFor(F, m, s) {
  const D = F.forces(m, s, 0).D, T = (tau) => F.forces(m, s, tau).T;
  if (T(1) < D) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (T(mid) < D) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const easKt = (m, s) => s.V * Math.sqrt(m.atm(s.h).rho / m.RHO0) / KT;
const vs1g = (m, s) => Math.sqrt(2 * s.m * G / (m.atm(s.h).rho * m.S * m.clMax));

/* A hard manoeuvre: [seconds, stick, roll, throttle]. */
const SCRIPT = [[3, 1, 0, 1], [2, 1, 1, 1], [2, -1, 0, 0], [3, 0, -1, 0.5], [5, 1, 0, 0], [3, -0.5, 1, 1], [6, 1, 0, 0]];
function manoeuvre(F, m, each) {
  let s = F.initialState(m);
  for (const [sec, stick, roll, throttle] of SCRIPT) s = run(F, m, s, { stick, roll, throttle }, sec, F.DRAWN.dtS, each);
  return s;
}

/* Each group returns [{ name, problems, detail }]. */
const GROUPS = {
  start(F) {
    return CASES.map((c) => {
      const r = c.result, P = [];
      const m = F.freeFlightModel(r);
      if (!m.ok) return { name: `${c.id}: starts at the sized cruise point`, problems: [`${c.id}: refused (${m.refusal})`] };
      const st = F.initialState(m);
      const prof = MP.missionProfileOf(r);
      const wantFt = prof.ok && Number.isFinite(prof.cruiseFt) ? prof.cruiseFt : r.cruise.altFt;
      const iC = r.mission.findIndex((x) => /^Cruise$|^Trip/.test(x.name));
      const pre = iC > 0 ? r.mission.slice(0, iC).filter((x) => !x.reserve).reduce((a, x) => a + x.kg, 0) : 0;
      const M = st.V / m.atm(st.h).a;
      if (rel(st.h, wantFt * FT) > 1e-9) P.push(`${c.id}: starts at ${f(st.h / FT, 0)} ft, the profile cruises at ${f(wantFt, 0)} ft`);
      if (Number.isFinite(r.cruise.mach) && rel(M, r.cruise.mach) > 2e-3) P.push(`${c.id}: start Mach ${f(M, 4)} vs the class's cruise Mach ${f(r.cruise.mach, 4)}`);
      if (Math.abs(st.m - (r.mtowKg - pre)) > 1e-6 || Math.abs(st.fuel - (r.fuelKg - pre)) > 1e-6)
        P.push(`${c.id}: start mass ${f(st.m, 1)} kg, fuel ${f(st.fuel, 1)} kg; want take-off mass less the ${f(pre, 1)} kg listed before cruise`);
      const fs = F.forces(m, st, st.throttle);
      const short = r.raw?.cruisePowerAvailable === false;
      if (st.trimShort !== short) P.push(`${c.id}: trim short ${st.trimShort}, but the sizing's cruise power available is ${r.raw?.cruisePowerAvailable}`);
      if (!st.trimShort && Math.abs(fs.T - fs.D) / fs.W > 1e-6) P.push(`${c.id}: trim off: thrust ${f(fs.T, 1)} N vs drag ${f(fs.D, 1)} N`);
      if (Math.abs(fs.nEff - 1) > 1e-12 || st.gam !== 0 || st.phi !== 0) P.push(`${c.id}: the start is not level 1 g flight`);
      return { name: `${c.id}: starts at the sized cruise point, at the mass listed there, trimmed`, problems: P,
        detail: `${f(st.h / FT, 0)} ft, M ${f(M, 3)}, ${f(st.m, 0)} kg (less ${f(pre, 1)} kg), throttle ${f(st.throttle * 100, 1)} %`
          + (st.trimShort ? `; full throttle gives ${f(st.trimHaveKN, 2)} of ${f(st.trimNeedKN, 2)} kN, as the sizing flags` : "") };
    });
  },

  polar(F) {
    return CASES.map((c) => {
      const r = c.result, m = F.freeFlightModel(r), P = [];
      let pts = 0;
      if (!m.jet) for (const p of E.polarCurve(r).points) {
        pts++;
        if (Math.abs(m.cd(p.cl) - p.cd) > 1e-9 * Math.max(1, p.cd)) P.push(`${c.id}: polar at CL ${f(p.cl)} gives CD ${f(m.cd(p.cl), 5)}, the class's ${f(p.cd, 5)}`);
      }
      /* The jets report the average of the start- and end-of-cruise L/D
         (Loftin p. 152) beside the start CL, so each end is compared. */
      const rc = r.raw?.cruise ?? {};
      const ends = Number.isFinite(rc.Estart) && Number.isFinite(rc.clEnd)
        ? [["start of cruise", rc.cl, rc.Estart], ["end of cruise", rc.clEnd, rc.Eend]] : [["cruise", r.cruise.cl, r.cruise.LD]];
      const said = [];
      for (const [where, cl, want] of ends) {
        const ld = cl / m.cd(cl, r.cruise.mach, r.cruise.altFt * FT);
        if (rel(ld, want) > 1e-6) P.push(`${c.id}: polar gives L/D ${f(ld)} at the class's ${where} CL ${f(cl)}, the class's ${f(want)}`);
        said.push(`${where} L/D ${f(ld)} vs ${f(want)}`);
      }
      return { name: `${c.id}: the drag is the class's own polar`, problems: P.slice(0, 3),
        detail: `${m.jet ? "the class's polar at each Mach and height" : `all ${pts} points of the class's curve`}; ${said.join(", ")}` };
    });
  },

  turn(F) {
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), st0 = F.initialState(m), P = [], done = [];
      for (const deg of c.type === "trainer" ? [30, 45, 60] : [30, 45]) {
        const phi = deg * D2R, n = 1 / Math.cos(phi);
        let s = { ...st0, phi, n };
        if (F.forces(m, s, 1).nStall < n * 1.05) { done.push(`${deg}° too near the stall at this speed`); continue; }
        s.throttle = trimFor(F, m, s);
        const h0 = s.h;
        let dpsi = 0, want = 0;
        s = run(F, m, s, { stick: 0, roll: 0, throttle: s.throttle }, 20, F.DRAWN.dtS, (a, b) => {
          let d = b.psi - a.psi;
          if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
          dpsi += d; want += G * Math.tan(phi) / ((a.V + b.V) / 2) * F.DRAWN.dtS;
        });
        if (rel(dpsi, want) > 1e-3) P.push(`${c.id} ${deg}°: turn rate ${f(dpsi / 20 / D2R, 4)}°/s vs g·tan φ/V ${f(want / 20 / D2R, 4)}°/s`);
        if (Math.abs(s.n - n) > 1e-6) P.push(`${c.id} ${deg}°: load factor ${f(s.n, 5)} vs 1/cos φ ${f(n, 5)}`);
        if (Math.abs(s.h - h0) > 1) P.push(`${c.id} ${deg}°: not level: ${f((s.h - h0) / FT, 1)} ft in 20 s`);
        if (Math.abs(s.phi - phi) > 1e-12) P.push(`${c.id} ${deg}°: the bank was not held`);
        if (s.ended) P.push(`${c.id} ${deg}°: the turn ended (${s.ended})`);
        done.push(`${deg}° ${f(dpsi / 20 / D2R, 3)}°/s, radius ${f(s.V / (dpsi / 20) / 1852, 2)} nm`);
      }
      return { name: `${c.id}: a steady level turn holds n = 1/cos φ and turns at g·tan φ/V`, problems: P, detail: done.join("; ") };
    });
  },

  stall(F) {
    const c = CASES.find((x) => x.id === "trainer/size");
    const m = { ...F.freeFlightModel(c.result), S: POH.wingAreaFt2 * FT * FT };
    const h = 3000 * FT, sig = Math.sqrt(m.atm(h).rho / m.RHO0), P = [], got = [];
    for (const [deg, kcas] of POH.stall) {
      const phi = deg * D2R, n = 1 / Math.cos(phi);
      const s0 = { t: 0, x: 0, z: 0, h, V: kcas * 1.3 * KT / sig, gam: 0, psi: 0, phi, n, m: POH.weightLb * LB, fuel: 20, throttle: 0, ended: null };
      let at = null;
      run(F, m, s0, { stick: 0, roll: 0, throttle: 0 }, 60, F.DRAWN.dtS, (a, b) => { if (b.stalled) { at = a; return true; } return false; });
      const eas = at ? easKt(m, at) : NaN;
      if (!(Math.abs(eas - kcas) <= 0.5)) P.push(`stall at ${deg}° of bank: ${f(eas, 2)} kt EAS, the POH's ${kcas} KCAS`);
      got.push(`${deg}° ${f(eas, 1)} (POH ${kcas})`);
    }
    return [{ name: "the trainer, at the POH's 2,550 lb and 174 ft², stalls in level turns at the Cessna 172S POH's speeds", problems: P, detail: got.join(", ") + " kt" }];
  },

  limits(F) {
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), P = [], seen = new Set();
      let worstCL = 0, worstN = 0, i = 0;
      manoeuvre(F, m, (a, b) => {
        const fs = F.forces(m, b, b.throttle);
        worstCL = Math.max(worstCL, fs.CL / m.clMax); worstN = Math.max(worstN, fs.nEff / m.nLimit);
        if (fs.CL > m.clMax * (1 + 1e-9)) P.push(`${c.id}: CL ${f(fs.CL, 4)} above CLmax ${f(m.clMax, 4)} at ${f(b.t, 2)} s`);
        if (fs.nEff > m.nLimit * (1 + 1e-9) || fs.nEff < 0) P.push(`${c.id}: load factor ${f(fs.nEff, 4)} outside 0…${f(m.nLimit, 3)} at ${f(b.t, 2)} s`);
        if (Math.abs(b.phi) > F.DRAWN.bankLimitDeg * D2R * (1 + 1e-12) || Math.abs(b.gam) > F.DRAWN.pathLimitDeg * D2R * (1 + 1e-12)) P.push(`${c.id}: bank or path past its limit at ${f(b.t, 2)} s`);
        if (i++ % 12 === 0) for (const w of F.readouts(m, b).warnings) seen.add(w.key);
      });
      /* At 1.1 times the 1 g stall speed, full back stick at idle stalls the
         wing within the stick's lag and holds it at CLmax. */
      const st = F.initialState(m);
      const s1 = run(F, m, { ...st, V: 1.1 * vs1g(m, st), throttle: 0 }, { stick: 1, roll: 0, throttle: 0 }, 2);
      const fs = F.forces(m, s1, s1.throttle);
      const warn = F.readouts(m, s1).warnings.map((w) => w.key);
      if (!s1.stalled || !warn.includes("stall") || rel(fs.CL, m.clMax) > 1e-3) P.push(`${c.id}: full back stick near the stall: stalled ${s1.stalled}, CL ${f(fs.CL, 4)} of ${f(m.clMax, 4)}, warnings ${warn.join(",")}`);
      if (!seen.has("g")) P.push(`${c.id}: full back stick at cruise speed never warned of the limit load factor`);
      return { name: `${c.id}: hard manoeuvres keep 0 ≤ n ≤ limit, CL ≤ CLmax and the bank and path limits; the warnings fire`,
        problems: P.slice(0, 3), detail: `peak CL ${f(worstCL * 100, 1)} % of CLmax, peak n ${f(worstN * 100, 1)} % of the limit; warned: ${[...seen].join(", ")}` };
    });
  },

  energy(F) {
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), P = [];
      const s0 = F.initialState(m);
      let ps = 0, last = s0;
      manoeuvre(F, m, (a, b) => {
        const mid = { ...a, phi: b.phi, n: b.n };
        const p = (s) => { const fs = F.forces(m, s, b.throttle); return (fs.T - fs.D) * s.V / (s.m * G); };
        ps += (p(mid) + p(b)) / 2 * F.DRAWN.dtS;
        last = b;
      });
      const dE = (last.h - s0.h) + (last.V * last.V - s0.V * s0.V) / (2 * G);
      if (Math.abs(dE - ps) > 0.5 + 2e-3 * Math.abs(ps)) P.push(`${c.id}: energy height changed ${f(dE, 2)} m, specific excess power integrates to ${f(ps, 2)} m`);
      return { name: `${c.id}: energy height changes by the integral of (T − D)V/W`, problems: P, detail: `${f(dE, 2)} m vs ${f(ps, 2)} m over ${f(last.t, 1)} s` };
    });
  },

  fuel(F) {
    const out = [];
    for (const c of CASES) {
      const r = c.result, m = F.freeFlightModel(r), P = [];
      let worst = 0;
      const end = manoeuvre(F, m, (a, b) => { worst = Math.max(worst, Math.abs((m.m0 - b.m) - (m.fuel0 - b.fuel))); if (b.fuel < 0) P.push(`${c.id}: negative fuel`); });
      if (worst > 1e-9 * m.m0) P.push(`${c.id}: the mass fell by ${f(m.m0 - end.m, 4)} kg while ${f(m.fuel0 - end.fuel, 4)} kg of fuel burned`);
      /* An almost empty tank: it runs dry, the mass falls by what was left, and the thrust stops. */
      const st = { ...F.initialState(m), fuel: 0.05 };
      const dry = run(F, m, st, { stick: 0, roll: 0, throttle: 1 }, 30, F.DRAWN.dtS);
      if (!(dry.fuel === 0) || Math.abs((st.m - dry.m) - 0.05) > 1e-9 || F.forces(m, dry, 1).T !== 0 || !F.readouts(m, dry).warnings.some((w) => w.key === "fuel"))
        P.push(`${c.id}: an empty tank: fuel ${f(dry.fuel, 4)} kg, mass fell ${f(st.m - dry.m, 4)} kg, thrust ${f(F.forces(m, dry, 1).T, 1)} N`);
      /* The class's cruise, flown level at its speed with the throttle retrimmed every 30 s. */
      const iC = r.mission.findIndex((x) => /^Cruise$|^Trip/.test(x.name));
      let detail = "no cruise segment in this list";
      if (r.missionIsDesign === true) detail = "the list is the design mission's, not this aeroplane's flight: cruise not compared";
      else if (iC >= 0) {
        const seg = r.mission[iC], distM = seg.nm * 1852;
        let s = F.initialState(m), x = 0, k = 0, thr = s.throttle;
        while (x < distM && !s.ended) {
          if (k++ % 30 === 0) thr = trimFor(F, m, s);
          const s1 = F.step(m, s, { stick: 0, roll: 0, throttle: thr }, 1);
          x += Math.hypot(s1.x - s.x, s1.z - s.z); s = s1;
        }
        const burn = m.fuel0 - s.fuel, d = burn / seg.kg - 1;
        if (!(Math.abs(d) <= CRUISE_FUEL_TOL) || s.ended) P.push(`${c.id}: cruise fuel over ${f(seg.nm, 0)} nm: ${f(burn, 1)} kg, the class's ${f(seg.kg, 1)} kg (${f(d * 100, 2)} %)${s.ended ? `, ended ${s.ended}` : ""}`);
        detail = `cruise over ${f(seg.nm, 0)} nm burns ${f(burn, 1)} kg, the class ${f(seg.kg, 1)} kg (${d >= 0 ? "+" : ""}${f(d * 100, 2)} %)`;
      }
      out.push({ name: `${c.id}: mass falls by the fuel burned, a dry tank stops the thrust, cruise fuel is the class's`, problems: P.slice(0, 3), detail });
    }
    return out;
  },

  roll(F) {
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), P = [];
      const [cls, deg, sec] = MIL[c.type];
      if (F.ROLL[c.type].milClass !== cls || F.ROLL[c.type].deg !== deg || F.ROLL[c.type].s !== sec) P.push(`${c.id}: roll table ${JSON.stringify(F.ROLL[c.type])}, MIL-F-8785C Class ${cls} ${deg}° in ${sec} s`);
      let s = run(F, m, F.initialState(m), { stick: 0, roll: 1, throttle: 0.9 }, sec);
      if (Math.abs(s.phi / D2R - deg) > 1e-6) P.push(`${c.id}: full roll for ${sec} s gives ${f(s.phi / D2R, 4)}°, the specification's ${deg}°`);
      const held = s.phi;
      s = run(F, m, s, { stick: 0, roll: 0, throttle: 0.9 }, 3);
      if (s.phi !== held) P.push(`${c.id}: the bank moved after the roll input was released`);
      return { name: `${c.id}: rolls at the MIL-F-8785C Level 1 rate for its class and holds the bank`, problems: P, detail: `Class ${cls}: ${deg}° in ${sec} s = ${f(m.rollRate / D2R, 1)}°/s` };
    });
  },

  clmax(F) {
    const P = [];
    const clPoh = 2 * POH.weightLb * LB * G / (1.225 * (53 * KT) ** 2 * POH.wingAreaFt2 * FT * FT);
    if (rel(F.CLEAN_CLMAX.trainer.value, clPoh) > 2e-3) P.push(`trainer CLmax ${f(F.CLEAN_CLMAX.trainer.value, 4)}, the POH stall gives ${f(clPoh, 4)}`);
    for (const [type, [lo, hi]] of Object.entries(SCHOLZ)) {
      const cl = F.CLEAN_CLMAX[type];
      if (cl.range[0] !== lo || cl.range[1] !== hi) P.push(`${type}: CLmax range ${cl.range.join("–")}, Scholz Table 5.1 ${lo}–${hi}`);
      if (!(cl.value >= lo && cl.value <= hi)) P.push(`${type}: CLmax ${f(cl.value)} outside Scholz's range ${lo}–${hi}`);
      if (cl.prov === "assumed" && Math.abs(cl.value - (lo + hi) / 2) > 1e-12) P.push(`${type}: assumed CLmax ${f(cl.value)} is not the middle of its range`);
      const r = CASES.find((c) => c.type === type).result;
      const hiM = F.freeFlightModel(r, { clMax: 9 }).clMax, loM = F.freeFlightModel(r, { clMax: 0.1 }).clMax;
      const want = cl.prov === "assumed" ? [hi, lo] : [cl.value, cl.value];
      if (hiM !== want[0] || loM !== want[1]) P.push(`${type}: a chosen CLmax of 9 and 0.1 gives ${f(hiM)} and ${f(loM)}, its range ${cl.prov === "assumed" ? `${lo}–${hi}` : "(sourced: fixed)"}`);
    }
    return [{ name: "clean CLmax: the trainer's from the POH stall, the others the middle of Scholz's range and held inside it", problems: P,
      detail: Object.entries(F.CLEAN_CLMAX).map(([k, v]) => `${k} ${f(v.value, 3)} ${v.prov}`).join(", ") }];
  },

  endings(F) {
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), st = F.initialState(m), P = [], got = [];
      const expect = (what, s0, input, sec, dt = 1 / 60) => {
        const s = run(F, m, s0, input, sec, dt);
        if (s.ended !== what || ![s.h, s.V, s.gam].every(Number.isFinite)) P.push(`${c.id}: expected to end at ${what}, ended ${s.ended} at ${f(s.h / FT, 0)} ft`);
        got.push(`${what} at ${f(s.t, 1)} s`);
      };
      if (m.jet) expect("mach", st, { stick: -1, roll: 0, throttle: 0 }, 300);
      else expect("ground", { ...st, h: 600 }, { stick: -1, roll: 0, throttle: 0 }, 120);
      expect("ceiling", { ...st, h: m.ceiling.ft * FT - 3, gam: 20 * D2R }, { stick: 0, roll: 0, throttle: 1 }, 10);
      expect("slow", { ...st, V: 0.5 * vs1g(m, st), gam: 50 * D2R, throttle: 0 }, { stick: 0, roll: 0, throttle: 0 }, 30);
      if (m.deck) {
        const above = F.readouts(m, { ...st, h: (m.deck.topFt + 500) * FT }).warnings.some((w) => w.key === "deck");
        const below = F.readouts(m, { ...st, h: (m.deck.topFt - 500) * FT }).warnings.some((w) => w.key === "deck");
        if (!above || below) P.push(`${c.id}: the engine-deck warning: ${above ? "" : "silent above the deck"}${below ? "on below the deck" : ""}`);
      }
      if (!/no landing model/.test(F.ENDINGS.ground)) P.push("the ground ending does not say there is no landing model");
      return { name: `${c.id}: ends at the ground or the Mach edge, at the ceiling, and when too slow`, problems: P, detail: got.join(", ") };
    });
  },

  sources(F) {
    const PROVS = new Set(["sized", "sourced", "derived", "assumed", "drawn"]);
    return CASES.map((c) => {
      const m = F.freeFlightModel(c.result), rows = F.freeFlightSources(m), P = [];
      for (const r of rows) {
        if (!PROVS.has(r.prov)) P.push(`${c.id}: "${r.what}" is labelled ${r.prov}`);
        if (!r.text || /\bNaN\b|\bundefined\b|Infinity/.test(r.what + r.text)) P.push(`${c.id}: "${r.what}" prints a bad value`);
      }
      const all = rows.map((r) => r.what + " " + r.text).join(" | ");
      for (const [k, want] of [["stickLagS", `${F.DRAWN.stickLagS} s`], ["bankLimitDeg", `±${F.DRAWN.bankLimitDeg}°`], ["pathLimitDeg", `±${F.DRAWN.pathLimitDeg}°`], ["slowFraction", `${F.DRAWN.slowFraction} of the 1 g stall`]])
        if (!all.includes(want)) P.push(`${c.id}: the drawn ${k} (${want}) is not in the sources table`);
      const clRow = rows.find((r) => /^Clean CLmax/.test(r.what));
      if (!clRow || clRow.prov !== F.CLEAN_CLMAX[c.type].prov) P.push(`${c.id}: the CLmax row is labelled ${clRow?.prov}, the table says ${F.CLEAN_CLMAX[c.type].prov}`);
      if (!rows.some((r) => r.what.startsWith("Roll rate") && r.text.includes("MIL-F-8785C"))) P.push(`${c.id}: the roll rate row does not cite MIL-F-8785C`);
      return { name: `${c.id}: every number the model adds is in its sources table, labelled`, problems: P, detail: `${rows.length} rows: ${[...new Set(rows.map((r) => r.prov))].join(", ")}` };
    });
  },
};

const runGroup = (F, g) => GROUPS[g](F);

/* ── 1–11: the model ─────────────────────────────────────────────────── */
const TITLES = { start: "1. The start", polar: "2. The drag", turn: "3. Steady level turns", stall: "4. The stall, against the POH",
  limits: "5. The limits", energy: "6. Energy", fuel: "7. Fuel", roll: "8. Roll", clmax: "9. Clean CLmax", endings: "10. The endings", sources: "11. The sources" };
for (const g of Object.keys(GROUPS)) {
  console.log(`\n${TITLES[g]}`);
  for (const item of runGroup(REAL, g)) check(item.name, item.problems.length === 0, item.problems[0] ?? item.detail);
}

/* ── 12: the tab ─────────────────────────────────────────────────────── */
console.log("\n12. The tab renders, prints its sources, and keeps three.js lazy");
const dir = mkdtempSync(join(ROOT, "node_modules", ".freeflight-"));
try {
  const src = (p) => JSON.stringify(join(ROOT, p).replace(/\\/g, "/"));
  const entry = join(dir, "entry.jsx");
  writeFileSync(entry, `export { AircraftFreeFlyTab } from ${src("src/classes/aircraft/build-fly/FreeFlyTab.jsx")};\n`);
  const outfile = join(dir, "bundle.mjs");
  let UI = null;
  try {
    await build({
      entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
      define: { "import.meta.env": JSON.stringify({ MODE: "test" }) },
      external: ["react", "react-dom", "react/jsx-runtime", "recharts", "three", "three/*"],
    });
    globalThis.window ??= { location: { search: "", pathname: "/" }, history: { replaceState() {} }, matchMedia: () => ({ matches: true }) };
    UI = await import(pathToFileURL(outfile).href);
  } catch (e) { check("the tab bundles", false, e.message); }
  const BAD = /\bNaN\b|\bundefined\b|Infinity|\[object Object\]/;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (UI) for (const c of CASES) {
    const html = renderToStaticMarkup(React.createElement(UI.AircraftFreeFlyTab, { type: c.type, mode: c.mode, params: c.params, analysis: c.analysis, result: c.result, setTab() {} }));
    const m = REAL.freeFlightModel(c.result);
    const missing = REAL.freeFlightSources(m).filter((r) => !html.includes(esc(r.what))).map((r) => r.what);
    const slider = /Clean CLmax/.test(html.replace(/<td[^>]*>Clean CLmax[^<]*<\/td>/g, ""));
    const wantSlider = REAL.CLEAN_CLMAX[c.type].prov === "assumed";
    const disclaim = html.includes("not an FAA-qualified flight simulation training device") && html.includes("no take-off or landing model");
    check(`${c.id}: renders its readouts and every source row, says what it is not${wantSlider ? ", offers the assumed CLmax" : ""}`,
      !BAD.test(html) && missing.length === 0 && slider === wantSlider && disclaim && html.includes("<canvas"),
      BAD.test(html) ? (html.match(new RegExp(`.{0,60}(${BAD.source}).{0,30}`)) ?? [""])[0]
        : missing.length ? `missing: ${missing.join(", ")}` : slider !== wantSlider ? `CLmax control shown ${slider}, wanted ${wantSlider}` : !disclaim ? "the disclaimers are missing" : `${html.length} characters`);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
const BF = "src/classes/aircraft/build-fly";
const staticThree = ["FreeFlyTab.jsx", "free-flight.js"].filter((x) => /^\s*import\b[^;]*?from\s+["'](three(\/[^"']*)?|\.\/scene\.js)["']/m.test(readFileSync(join(ROOT, BF, x), "utf8")));
check("neither the tab nor the model imports three or the scene statically", staticThree.length === 0, staticThree.join(", ") || "FreeFlyTab.jsx, free-flight.js");
const studio = readFileSync(join(ROOT, "src/classes/aircraft/AircraftStudio.jsx"), "utf8");
check("the studio lists the tab as \"Fly · yourself\"", /\["free",\s*"Fly · yourself",\s*AircraftFreeFlyTab\]/.test(studio) && /import \{ AircraftFreeFlyTab \} from "\.\/build-fly\/FreeFlyTab\.jsx";/.test(studio));
check("the scene exports the free-flight mount", /export function mountFree\(/.test(readFileSync(join(ROOT, BF, "scene.js"), "utf8")));

/* ── 13: the checks can fail ─────────────────────────────────────────── */
console.log("\n13. The checks can fail: each is run on a copy of the model broken the way it guards against");
const ffText = readFileSync(FF_PATH, "utf8");
const NL = ffText.includes("\r\n") ? "\r\n" : "\n";
const mdir = mkdtempSync(join(ROOT, "node_modules", ".freeflight-mut-"));
let nMut = 0;
async function copyOf(pairs) {
  let t = ffText;
  for (const [a, b] of pairs) {
    const A = a.replace(/\n/g, NL), k = t.split(A).length - 1;
    if (k !== 1) throw new Error(`mutation anchor found ${k} times: ${a.slice(0, 60)}`);
    t = t.replace(A, () => b.replace(/\n/g, NL));
  }
  t = t.replace(/from "(\.\.?\/[^"]+)"/g, (_, p) => `from "${pathToFileURL(resolve(dirname(FF_PATH), p)).href}"`);
  const out = join(mdir, `ff-${nMut++}.mjs`);
  writeFileSync(out, t);
  return import(pathToFileURL(out).href);
}
const MUTANTS = [
  ["the turn rate without the load factor", "turn", /turn rate/,
    [["psi: G * f.nEff * Math.sin(st.phi) / (st.V * cg),", "psi: G * Math.sin(st.phi) / (st.V * cg),"]]],
  ["the lift not tilted by the bank", "turn", /not level/,
    [["gam: (G / st.V) * (f.nEff * Math.cos(st.phi) - cg),", "gam: (G / st.V) * (f.nEff - cg),"]]],
  ["the stall at sea-level density", "stall", /POH/,
    [["const nStall = q * model.S * model.clMax / W;", "const nStall = 0.5 * model.RHO0 * st.V * st.V * model.S * model.clMax / W;"]]],
  ["the lift not capped at CLmax", "limits", /above CLmax/,
    [["const nEff = Math.max(0, Math.min(st.n, nStall));", "const nEff = Math.max(0, st.n);"],
     ["n = Math.max(0, Math.min(n, model.nLimit, nStall));", "n = Math.max(0, Math.min(n, model.nLimit));"]]],
  ["no gravity along the path", "energy", /energy height/,
    [["V: (f.T - f.D) / st.m - G * Math.sin(st.gam),", "V: (f.T - f.D) / st.m,"]]],
  ["thrust without the propeller efficiency", "fuel", /cruise fuel/,
    [["return { T: eta * P / V, fuelKgS: psfc * P, P };", "return { T: P / V, fuelKgS: psfc * P, P };"]]],
  ["the fuel burned not taken off the mass", "fuel", /mass fell/,
    [["m: st.m - (st.fuel - fuel) };", "m: st.m };"]]],
  ["a tank that never quite runs dry", "fuel", /an empty tank/,
    [["  if (st.fuel > 0 && st.fuel + k1.fuel * dt <= 0) { s1.m = st.m - st.fuel; s1.fuel = 0; }\n", ""]]],
  ["the roll rate in degrees, not radians", "roll", /full roll/,
    [["rollRate: roll.deg / roll.s * D2R,", "rollRate: roll.deg / roll.s,"]]],
  ["an assumed CLmax not held to its range", "clmax", /a chosen CLmax/,
    [["Math.min(cl.range[1], Math.max(cl.range[0], opts.clMax))", "opts.clMax"]]],
  ["no ceiling", "endings", /expected to end at ceiling/,
    [["  if (st.h / FT > model.ceiling.ft) return \"ceiling\";\n", ""]]],
  ["a trim 2 % short", "start", /trim off/,
    [["if (T(mid) < need) lo = mid; else hi = mid;", "if (T(mid) < need * 1.02) lo = mid; else hi = mid;"]]],
  ["the start mass ignoring the fuel burned before cruise", "start", /start mass/,
    [["m0: result.mtowKg - preCruiseKg,", "m0: result.mtowKg,"]]],
  ["the polar's induced term misread", "polar", /polar at CL/,
    [["const k = at1.cd - cd0;", "const k = at1.cd;"]]],
  ["a drawn number left out of the sources", "sources", /not in the sources table/,
    [["full forward zero (GASP's limits); it follows with a ${DRAWN.stickLagS} s lag", "full forward zero (GASP's limits); it follows with a lag"]]],
];
try {
  const clean = await copyOf([]);
  const used = [...new Set(MUTANTS.map((x) => x[1]))];
  const dirty = used.flatMap((g) => runGroup(clean, g).flatMap((i) => i.problems));
  check("the unbroken copy the mutants start from passes every group they use", dirty.length === 0, dirty[0] ?? used.join(", "));
  for (const [name, g, want, pairs] of MUTANTS) {
    let probs;
    try { probs = runGroup(await copyOf(pairs), g).flatMap((i) => i.problems); }
    catch (e) { probs = [`threw: ${e.message}`]; }
    const hit = probs.find((p) => want.test(p));
    check(`rejects ${name}`, !!hit, hit ?? (probs[0] ? `caught only for another reason: ${probs[0]}` : "accepted — the check cannot fail"));
  }
} finally { rmSync(mdir, { recursive: true, force: true }); }

console.log("");
console.log(fail ? `AIRCRAFT FREE-FLIGHT GATE FAILED: ${fail} check(s)` : `AIRCRAFT FREE-FLIGHT GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
