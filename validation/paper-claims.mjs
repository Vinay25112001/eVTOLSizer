/* =====================================================================
   PAPER CLAIM GATE
   =====================================================================
   Every numeric claim in paper/ must be one the harnesses still produce.

   WHY THIS EXISTS

   The paper argues that published accuracy figures drift away from the
   code that produced them, and that generating them prevents it. A draft
   containing a hand-typed number that the code no longer reproduces would
   refute its own thesis in the most embarrassing way available.

   So each claim below is MEASURED here, formatted exactly as the paper
   states it, and the paper is searched for that string. A change to the
   engine that moves any of these numbers fails this gate and names the
   claim, the old value and the new one.

   Run: node validation/paper-claims.mjs
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { runSizing as runSizingX } from "../src/engine.js";
import * as CFGX from "../src/engine/configuration.js";
import { readFileSync, readdirSync } from "node:fs";
import { OUTPUTS } from "../src/lib/provenance.js";

const run = f => {
  try { return execFileSync(process.execPath, [`validation/${f}`], { encoding: "utf8", maxBuffer: 64e6 }); }
  catch (e) { return (e.stdout || "") + (e.stderr || ""); }
};

const nasa = run("nasa-configs.mjs");
const comp = run("components.mjs");
const gold = run("golden-master.mjs");

/* Pull each vehicle's rows out of the primary benchmark. NOTE: these are
   regex LITERALS on purpose. An earlier version built them with new RegExp
   from a template string, where `\s` is a string escape long before it is a
   regex one, and every row silently failed to parse. */
const blockFor = re => nasa.split(/^── /m).find(b => re.test(b)) || "";
const rowsOf = block => {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s{3}(\w+)\s+([\d.]+)\s+kg\s+([\d.]+)\s+kg\s+([+-][\d.]+)%/);
    if (m) out[m[1]] = { want: +m[2], got: +m[3], err: +m[4] };
  }
  return out;
};
const lcRows   = rowsOf(blockFor(/^NASA lift\+cruise/));
const quadRows = rowsOf(blockFor(/^NASA quadrotor/));
const struct = lcRows.struct || null;
const rotor  = lcRows.rotor  || null;
const quadRotorErr = quadRows.rotor ? quadRows.rotor.err : null;

const summary = nasa.match(/^PASS: (\d+) published comparisons, mean ([\d.]+)%/m);
const provTotal = Object.keys(OUTPUTS).length;
const validated = Object.values(OUTPUTS).filter(o => o?.status === "validated").length;
const rotorMAE = (comp.match(/AFDD00 3 bl nu BY TYPE.*?([\d.]+)%\s*$/m) || [])[1];
const bestSweep = (comp.match(/best over the swept grid:.*?MAE ([\d.]+)%/) || [])[1];
const goldCases = (gold.match(/GOLDEN MASTER — (\d+) cases/) || [])[1];

/* implied remainder: structures minus the rotor group, both sides */
const remWant = struct && rotor ? struct.want - rotor.want : null;
const remGot  = struct && rotor ? struct.got  - rotor.got  : null;
const remErr  = remWant ? (100 * (remGot - remWant) / remWant) : null;

const f1 = n => n == null ? "??" : n.toFixed(1);
/* Dynamics claims. These are UNVALIDATED quantities, which is exactly why
   they must not drift: an unanchored number that also moves is worthless.
   The gate holds the paper to what the code currently produces. */
const { runSizing: rs2 } = await import("../src/engine.js");
const { hoverQualities: hq } = await import("../src/engine/hoverqualities.js");
const CFGD = await import("../src/engine/configuration.js");
const dynB = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
  etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
  deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
  weightModel:"buildup", fusLen:5.87, fusDiam:1.65 };
const sbsD = (() => {
  const d = CFGD.CONFIG_DEFAULTS.sideBySide;
  const p2 = { ...dynB, configType: "sideBySide", nPropHover: d.nRotors,
    /* SOLVED, like the harnesses. This gate kept its own copy of the setup
       with the old 3175 kg placeholder, so it went on cheerfully passing the
       paper's old numbers after the default path had moved - a gate blind to
       drift in itself. */
    propDiam: (CFGD.solveRotorDiameter("sideBySide",
      { ...dynB, configType: "sideBySide", nPropHover: d.nRotors }, rs2)?.propDiam)
      ?? CFGD.rotorDiameterFor("sideBySide", 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? dynB.vCruise, LD: d.LD_target ?? dynB.LD,
    etaHov: d.etaHov ?? dynB.etaHov, tipSpeed: d.tipSpeed_ms ?? dynB.tipSpeed };
  return hq(p2, rs2(p2))?.dynamics || {};
})();

/* ── SECTION 2.1 ADDED FOURTEEN NUMBERS, SO FOURTEEN MORE CLAIMS ──────
   The abstract's own standing rule is that every number in it is produced by
   a harness. Section 2.1 (the binding-constraint result) was written with
   figures measured in validation/battery-binding.mjs, and until they are
   listed here nothing stops them drifting -- which is the exact failure mode
   the paper argues against. Recomputed from the shipping engine below. */
const BIND = (() => {
  const B = { payload:455, range:161, vCruise:50.4, cruiseAlt:1000, hoverHeight:15.24,
    reserveMinutes:20, LD:5.8, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
    clCruiseMax:0.9, clDesign:0.55, twRatio:1.3, convTolExp:-6, etaHov:0.70, tipSpeed:167.64,
    etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6, climbLDPenalty:0.13,
    deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19, ewf:0.5,
    weightModel:"buildup", fusLen:5.87, fusDiam:1.65, vtCh:0.45, vtCv:0.032,
    vtGamma:45, vtAR:2.5 };
  const mk = (k, over) => {
    const d = CFGX.CONFIG_DEFAULTS[k];
    const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms ?? B.vCruise,
      tipSpeed:d.tipSpeed_ms ?? B.tipSpeed, LD:d.LD_target ?? B.LD,
      etaHov:d.etaHov ?? B.etaHov, ...over };
    return { ...p0, propDiam: CFGX.solveRotorDiameter(k, p0, runSizingX)?.propDiam };
  };
  const ratio = (k, R, res) => {
    const S = runSizingX(mk(k, { range:R, reserveMinutes: res ?? 20 }));
    return (S && S.WE_kg > 0) ? S.WP_kg / S.WE_kg : NaN;
  };
  const cross = (k) => {
    let lo = 2, hi = 161;
    if (!(ratio(k, lo) >= 1) || !(ratio(k, hi) < 1)) return null;
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (ratio(k, m) >= 1) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const out = {};
  for (const k of Object.keys(CFGX.CONFIGURATIONS)) {
    const c = cross(k);
    out[k] = { r161: ratio(k, 161).toFixed(3), r10: ratio(k, 10).toFixed(3),
               cross: c === null ? null : c.toFixed(1) + " km",
               r10res5: ratio(k, 10, 5).toFixed(3) };
  }
  return out;
})();

const CLAIMS = [
  /* section 2.1 -- which battery constraint binds, and where it crosses */
  ["binding: lift+cruise ratio at 161 km",   BIND.liftcruise?.r161],
  ["binding: multicopter ratio at 161 km",   BIND.multicopter?.r161],
  ["binding: hybrid ratio at 161 km",        BIND.hybrid?.r161],
  ["binding: lift+cruise crossover",         BIND.liftcruise?.cross],
  ["binding: hybrid crossover",              BIND.hybrid?.cross],
  ["binding: hybrid pusher crossover",       BIND.hybridPusher?.cross],
  ["binding: tiltrotor crossover",           BIND.tiltrotor?.cross],
  ["binding: lift+cruise ratio at 10 km",    BIND.liftcruise?.r10],
  ["binding: tiltrotor ratio at 10 km",      BIND.tiltrotor?.r10],
  ["binding: multicopter ratio at 10 km",    BIND.multicopter?.r10],
  ["binding: side-by-side ratio at 10 km",   BIND.sideBySide?.r10],
  ["binding: multicopter at 5-min reserve",  BIND.multicopter?.r10res5],
  ["binding: side-by-side at 5-min reserve", BIND.sideBySide?.r10res5],

  ["side-by-side pitch damping Mq", sbsD.Mq == null ? null : `−${Math.abs(sbsD.Mq).toFixed(2)}`],
  ["side-by-side roll damping Lp",  sbsD.Lp == null ? null : `−${Math.abs(sbsD.Lp).toFixed(2)}`],

  ["published comparisons",             summary?.[1]],
  /* THE "within +/-5%" CLAIM IS GONE, AND ITS REMOVAL IS THE POINT. It read
     the count out of a summary line that had the wrong label on it, then
     "verified" it with text.includes("13") against the whole paper -- a bare
     two-digit integer, which any document of this length contains by accident.
     It passed for that reason and for no other. The paper makes no such claim:
     it states thirty comparisons at a mean of 8.7% and stops. A gate whose job
     is "every number the paper asserts is reproduced by a harness" must not
     invent an assertion the paper never made and then pass itself on a
     substring. If a count is ever put in the paper, it goes back here WITH its
     criterion named, not as a loose integer. */
  ["benchmark mean error",              summary ? `${summary[2]}%` : null],
  ["L+C structures published",          struct ? `${f1(struct.want)} kg` : null],
  ["L+C structures predicted",          struct ? `${f1(struct.got)} kg` : null],
["L+C structures error",              struct == null ? null
                                        : `${struct.err > 0 ? "+" : "−"}${Math.abs(struct.err).toFixed(1)}%`],
  ["L+C rotor published",               rotor ? `${f1(rotor.want)} kg` : null],
  ["L+C rotor predicted",               rotor ? `${f1(rotor.got)} kg` : null],
  ["L+C rotor error",                   rotor == null ? null
                                        : `${rotor.err > 0 ? "+" : "−"}${Math.abs(rotor.err).toFixed(1)}%`],
  ["implied remainder published",       `${f1(remWant)} kg`],
  ["implied remainder predicted",       `${f1(remGot)} kg`],
  /* THE SIGN WAS HARD-CODED "+". It read `+${f1(remErr)}%` on the assumption
     that the implied remainder is always over-predicted, which was true while
     it was +25.9% and then +11.6%. Correcting the boom load factor took it to
     -4.4% and the gate went looking for "+-4.4%" — a string no document will
     ever contain. A claim checker that cannot express a negative number is
     not checking the claim, it is checking a guess about its sign. */
  ["implied remainder error",           `${remErr >= 0 ? "+" : "−"}${f1(Math.abs(remErr))}%`],
  ["quadrotor rotor error",             quadRotorErr == null ? null
                                        : `${quadRotorErr > 0 ? "+" : "−"}${Math.abs(quadRotorErr).toFixed(1)}%`],
  ["rotor model MAE, 8 variants",       rotorMAE ? `${rotorMAE}%` : null],
  ["best rotor model in sweep",         bestSweep ? `${bestSweep}%` : null],
  ["registered outputs",                String(provTotal)],
  ["validated outputs",                 String(validated)],
  ["golden master cases",               goldCases],
];

const WORDS = {
  "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
  "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven",
  "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen",
  "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen",
  "20": "twenty", "30": "thirty",
  /* A sentence that opens on a number has to spell it, and the benchmark
     count changes as comparisons are added. 33 arrived when installed
     power per lift motor was scored on all three vehicles. */
  "31": "thirty-one", "32": "thirty-two", "33": "thirty-three",
  "34": "thirty-four", "35": "thirty-five", "36": "thirty-six",
};

const papers = readdirSync("paper").filter(f => f.endsWith(".md"));
const text = papers.map(f => readFileSync(`paper/${f}`, "utf8")).join("\n")
  .replace(/−/g, "−");   /* keep the typographic minus distinct from a hyphen */

console.log("PAPER CLAIM GATE");
console.log("=".repeat(72));
console.log(`Checking ${papers.length} document(s): ${papers.join(", ")}\n`);

const missing = [];
for (const [label, value] of CLAIMS) {
  if (value == null) { missing.push([label, "COULD NOT MEASURE", "harness output format changed"]); continue; }
  /* Accept the claim however it is typeset: a typographic minus or an ASCII
     hyphen, and a small integer spelled as a word, which is how a sentence
     that opens on a number has to be written. The gate checks the claim, not
     the typography. */
  const variants = [value, value.replace(/−/g, "-"), value.replace(/-/g, "−")];
  const w = WORDS[value];
  if (w) variants.push(w, w[0].toUpperCase() + w.slice(1));
  /* ── A BARE NUMBER MUST MATCH ON A BOUNDARY, NOT AS A SUBSTRING ──────
     The comment above about text.includes("13") described one instance of this
     bug; here is the second. The "39 published comparisons" claim passed for
     months because the paper contained "639.2 kg" in an unrelated table row.
     The moment that row was legitimately updated to 637.5, the claim failed --
     not because the paper stopped asserting 39, but because the accident that
     had been standing in for the assertion went away. A plain digit string is
     therefore matched with non-digit boundaries on both sides; prose variants
     and signed/typeset numbers keep the old containment test. */
  const boundedFind = (v) => {
    if (!/^\d+$/.test(v)) return text.includes(v);
    /* Built from a plain string, NOT a template literal: `\d` inside backticks
       is an unrecognised escape and collapses to a bare "d", which would have
       excluded the letter d rather than digits and let "415" match inside
       "1415". Caught by testing the boundary rather than trusting it. */
    return new RegExp("(?<![\\d.])" + v + "(?![\\d.])").test(text);
  };
  const found = variants.some(boundedFind);
  console.log(`  ${found ? "ok  " : "MISS"} ${label.padEnd(32)} ${value}`);
  if (!found) missing.push([label, value, "not found in any paper document"]);
}

if (missing.length) {
  console.log(`\nFAIL: ${missing.length} claim(s) in paper/ no longer match the harnesses`);
  for (const [label, value, why] of missing) console.log(`  - ${label}: expected "${value}" (${why})`);
  console.log(`\nThe paper argues that published accuracy figures drift from the code.`);
  console.log(`Update paper/ with the measured values before submitting it.`);
  process.exit(1);
}
console.log(`\nPASS: all ${CLAIMS.length} numeric claims in paper/ are reproduced by the harnesses`);
