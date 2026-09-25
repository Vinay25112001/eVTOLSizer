/* =====================================================================
   OSWALD SPAN EFFICIENCY — COMPUTED, NOT ASSUMED
   =====================================================================
   e was a flat input defaulting to 0.85, and validation/unverified-leverage
   ranked it SECOND of thirteen unverified inputs at 7.0% of MTOW across its
   plausible range. A span efficiency is not a free constant: it follows from
   the planform, and every term it needs was already known to the engine.

   [SRC] Howe, D., "Aircraft Conceptual Design Synthesis" (2000) eq.6.14a,
   reproduced as eqs.13.26-13.27 of Scholz, D., "Aircraft Design", HAW
   Hamburg ch.13 "Drag":

       e = 1 / { (1 + 0.12 M^6) [ 1 + (0.142 + f(L) A (10 t/c)^0.33)/cos^2 Phi25
                                    + 0.1 (3 Ne + 1)/(4 + A)^0.8 ] }
       f(L) = 0.005 (1 + 1.5 (L - 0.6)^2)

   valid "for the subsonic range and for transonic flows (M < 0.95) for
   aircraft with a wing aspect ratio of A > 5".

   WHAT THIS GATE IS FOR. Not to restate the equation, but to hold the things
   that would silently go wrong: that the fit is not used outside the domain
   its author stated; that it actually responds to every planform term it
   claims to; that the flat 0.85 cannot come back through a default; and that
   an explicit override is honoured AND declared.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { oswaldEfficiency, oswaldTaperTerm, OSWALD_MIN_AR, OSWALD_MAX_MACH }
  from "../src/engine/wing.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("OSWALD EFFICIENCY GATE");
console.log("=".repeat(78));

/* ── 1. THE TAPER TERM, AGAINST THE SOURCE'S OWN STATED VALUE ────────────
   Scholz gives one numeric anchor: "A typical value for f(L) is 0.0062". A
   transport taper of about 0.2 is what returns it, which is the cheap check
   that the coefficients were transcribed the right way round. */
console.log("\n1. The taper term reproduces the source's own quoted value:\n");
console.log("   taper   f(taper)");
for (const l of [0.2, 0.3, 0.45, 0.6, 0.8])
  console.log("   " + l.toFixed(2).padStart(5) + "   " + oswaldTaperTerm(l).toFixed(6));
check(Math.abs(oswaldTaperTerm(0.2) - 0.0062) < 5e-5,
  'f(taper) at a transport taper returns Scholz\'s quoted "typical value ... 0.0062"',
  `${oswaldTaperTerm(0.2).toFixed(6)}`);
check(Math.abs(oswaldTaperTerm(0.6) - 0.005) < 1e-12,
  "and its minimum is exactly 0.005 at taper 0.6, where the quadratic vanishes",
  "so e is MAXIMISED at 0.6 — not the 0.35-0.45 folklore, and this is the sourced answer");

/* ── 2. IT RESPONDS TO EVERY TERM IT CLAIMS TO ──────────────────────────
   A fit that ignores one of its own arguments is a constant wearing a
   formula's name. Each sweep below must move e. */
console.log("\n2. Every planform term actually moves it:\n");
const base = { AR: 9, taper: 0.45, tc: 0.15, mach: 0.15, sweep25Deg: 0, nWingEngines: 0 };
const e0 = oswaldEfficiency(base).e;
const moves = {
  "aspect ratio":   oswaldEfficiency({ ...base, AR: 12 }).e,
  "taper":          oswaldEfficiency({ ...base, taper: 0.60 }).e,
  "thickness":      oswaldEfficiency({ ...base, tc: 0.12 }).e,
  "sweep":          oswaldEfficiency({ ...base, sweep25Deg: 25 }).e,
  "wing engines":   oswaldEfficiency({ ...base, nWingEngines: 2 }).e,
  "Mach":           oswaldEfficiency({ ...base, mach: 0.80 }).e,
};
console.log(`   baseline e = ${e0.toFixed(4)}`);
for (const [k, v] of Object.entries(moves))
  console.log("   " + k.padEnd(16) + v.toFixed(4) + "   " + (v > e0 ? "+" : "") + ((v - e0) / e0 * 100).toFixed(2) + "%");
check(Object.values(moves).every((v) => Math.abs(v - e0) > 1e-6),
  "e responds to aspect ratio, taper, thickness, sweep, wing engines and Mach",
  "a term that moved nothing would mean a mistranscribed equation");
check(moves["aspect ratio"] < e0,
  "higher aspect ratio lowers e in this fit", `AR 12 -> ${moves["aspect ratio"].toFixed(4)}`);
check(moves["taper"] > e0,
  "and taper 0.6 raises it, the minimum of f(taper)", `${moves["taper"].toFixed(4)}`);

/* ── 3. THE DOMAIN ITS AUTHOR STATED ───────────────────────────────────── */
console.log("\n3. Howe's stated domain is reported, not extrapolated past:\n");
check(OSWALD_MIN_AR === 5 && OSWALD_MAX_MACH === 0.95,
  "the bounds are the source's own", `A > ${OSWALD_MIN_AR}, M < ${OSWALD_MAX_MACH}`);
check(oswaldEfficiency({ ...base, AR: 4 }).inDomain === false
   && oswaldEfficiency({ ...base, AR: 9 }).inDomain === true,
  "an aspect ratio below 5 is flagged out of domain",
  "the fit still returns a number, but the run says it is outside its stated range");
check(oswaldEfficiency({ ...base, mach: 0.99 }).inDomain === false,
  "and so is a Mach above 0.95");
check(oswaldEfficiency({ AR: 0, taper: 0.45, tc: 0.15 }).e === null,
  "a degenerate planform returns null rather than a number",
  "no wing, no span efficiency");

/* ── 4. THE ENGINE USES IT, AND THE FLAT 0.85 CANNOT RETURN ───────────── */
const build = (k, o = {}) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...DEFAULT_PARAMS, configType: k, nPropHover: d.nRotors,
    vCruise: d.vCruise_ms ?? DEFAULT_PARAMS.vCruise,
    tipSpeed: d.tipSpeed_ms ?? DEFAULT_PARAMS.tipSpeed,
    LD: d.LD_target ?? DEFAULT_PARAMS.LD, etaHov: d.etaHov ?? DEFAULT_PARAMS.etaHov, ...o };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};
const WINGED = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor"];
console.log("\n4. As the engine runs it:\n");
console.log("   layout          e used   inDomain  overridden");
const runs = WINGED.map((k) => ({ k, r: runSizing(build(k)) }));
for (const { k, r } of runs)
  console.log("   " + k.padEnd(14) + (r.eOsw ?? NaN).toFixed(4).padStart(7)
    + String(r.eOswInDomain).padStart(11) + String(r.eOswOverridden).padStart(12));

check(DEFAULT_PARAMS.eOsw === undefined,
  "DEFAULT_PARAMS carries no eOsw",
  "a value there would override the computed one on every run, as it used to");
check(runs.every(({ r }) => r.eOswOverridden === false && r.eOswInDomain === true),
  "every layout uses the COMPUTED value, inside the source's domain");
check(runs.every(({ r }) => Math.abs(r.eOsw - 0.85) > 0.01),
  "and none of them is the flat 0.85 that was assumed",
  `computed ${runs[0].r.eOsw.toFixed(4)} at the default planform`);

/* ── 5. THE OVERRIDE IS HONOURED AND DECLARED ─────────────────────────── */
console.log("\n5. An explicit override is honoured AND declared:\n");
const ovr = runSizing(build("liftcruise", { eOsw: 0.92 }));
check(Math.abs(ovr.eOsw - 0.92) < 1e-9 && ovr.eOswOverridden === true,
  "a supplied eOsw is used and the run says so",
  "a sourced model that can be replaced without saying so is not a sourced model");

/* ── 6. IT REACHES THE DRAG POLAR ──────────────────────────────────────── */
console.log("\n6. It reaches the polar — induced drag responds:\n");
console.log("   eOsw     CDi        LDact");
const lo = runSizing(build("liftcruise", { eOsw: 0.75 }));
const hi = runSizing(build("liftcruise", { eOsw: 0.92 }));
for (const [lbl, r] of [["0.75", lo], ["0.92", hi]])
  console.log("   " + lbl + (r.CDi ?? NaN).toFixed(5).padStart(11) + (r.LDact ?? NaN).toFixed(3).padStart(10));
check(lo.CDi > hi.CDi && lo.LDact < hi.LDact,
  "a lower span efficiency costs induced drag and lift-to-drag",
  `CDi ${lo.CDi.toFixed(5)} -> ${hi.CDi.toFixed(5)}, L/D ${lo.LDact.toFixed(2)} -> ${hi.LDact.toFixed(2)}`);

console.log("\n" + "=".repeat(78));
if (fails.length) {
  console.log(`OSWALD EFFICIENCY GATE FAILED — ${fails.length} check(s):`);
  for (const f of fails) console.log("   - " + f);
  process.exit(1);
}
console.log("OSWALD EFFICIENCY GATE PASSED");
