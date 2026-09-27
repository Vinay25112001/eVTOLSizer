/* =====================================================================
   ROTOR GROUP GATE — the reference method, with the reference's own inputs
   =====================================================================
   THE DEFECT THIS EXISTS FOR. The lift+cruise rotor group scored −46.7 %
   against NASA Table 12 and the report called the rotor weight models "out
   of population". They were not out of population; they were fed the wrong
   inputs. NASA distributes the NDARC input deck of every reference vehicle,
   and the decks say what Table 12 does not: the lift+cruise has TWO blades,
   the quadrotor three, the side-by-side four; the flap frequencies; the chord
   law; technology factors of 0.916 on blades and 0.759 on hubs; that the
   rotor group CONTAINS the rotor support structure; and that no deck
   overrides NDARC's default rotor weight model, which is AFDD82, not the
   AFDD00 this engine defaulted to. With every one of those read from the
   decks and nothing tuned, five of seven AFDD82 vehicles reproduce within
   2.2 % and the single main rotor to 0.1 %. The lift+cruise is +15 % and is
   reported as a residual.

   WHAT IS PINNED HERE
     1. the values the engine uses ARE the deck values (identity, per config)
     2. the thrust-weighted -> geometric chord ratio is what each deck's own
        chord law integrates to (recomputed, not copied)
     3. the module equals a direct evaluation of the AFDD82 equations with
        the factors and the geometric chord, to rounding
     4. with the deck inputs the seven-vehicle MAE beats EVERY uniform
        blade-count sweep entry, and removing the technology factors makes
        the vehicles that matched stop matching — facts, not bands
     5. the harness scores blades+hub against Table 12 less the deck's own
        support term, and that term is the deck rule, not a typed number
     6. blade count has one home, and the provenance says what ships
     7. a tilting layout says the reference used a propeller model instead
   Sources: eVTOL_Sizing_Research/benchmarks/nasa-ndarc-decks.md;
   decks vendored at eVTOL_Sizing_Research/sources/nasa-uam-ndarc-decks/.
   ===================================================================== */
import { readFileSync, readdirSync } from "node:fs";
import {
  rotorGroup, ROTOR_DECK_BY_CONFIG, NASA_ROTOR_TECH, bladeCountFor, flapFreqFor, sigmaTwToGeoFor,
  rotorDeckFor, afdd82Blade, afdd82Hub, afdd00Blade, afdd00Hub,
} from "../src/engine/rotorgroup.js";
import { NASA_VEHICLES } from "./nasa-vehicles.js";
import { INPUTS } from "../src/lib/provenance.js";
import { configKeyFor } from "../src/engine/configuration.js";

let fails = 0, passes = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
  ok ? passes++ : fails++;
};
const bar = "═".repeat(76);
console.log(bar); console.log("ROTOR GROUP GATE — NASA's decks, AFDD82, nothing tuned"); console.log(bar);

const LB = 2.20462, FT = 3.28084;
const f1 = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

/* NASA/TM-20210017971 Table 12 (= Silva & Johnson 2018 Table 3 for these
   rows): sized geometry and the published rotor group. The tiltwing is not
   here on the source's own terms — its deck weighs the proprotors with the
   propeller model (tiltwing6.list :220 MODEL_config=3). */
const T12 = [
  { key: "SMR-TS",  cfg: "helicopter",  nRotors: 1, R_ft: 17.3, sigma: 0.0666, tip: 550, rotor_lb: 279 },
  { key: "Quad-TS", cfg: "multicopter", nRotors: 4, R_ft: 9.20, sigma: 0.0650, tip: 550, rotor_lb: 325 },
  { key: "Quad-E",  cfg: "multicopter", nRotors: 4, R_ft: 13.1, sigma: 0.0550, tip: 550, rotor_lb: 628 },
  { key: "SbS-TS",  cfg: "sideBySide",  nRotors: 2, R_ft: 10.5, sigma: 0.0830, tip: 550, rotor_lb: 196 },
  { key: "SbS-E",   cfg: "sideBySide",  nRotors: 2, R_ft: 14.9, sigma: 0.0580, tip: 550, rotor_lb: 345 },
  { key: "L+C-E",   cfg: "liftcruise",  nRotors: 8, R_ft: 5.00, sigma: 0.267,  tip: 585, rotor_lb: 948 },
  { key: "L+C-TE",  cfg: "liftcruise",  nRotors: 8, R_ft: 5.00, sigma: 0.217,  tip: 668, rotor_lb: 849 },
];
const supportLb = (v) => {
  const d = ROTOR_DECK_BY_CONFIG[v.cfg];
  return d.supportLbPerRotor != null ? v.nRotors * d.supportLbPerRotor : v.nRotors * (d.supportLbPerFt ?? 0) * v.R_ft;
};
const geom = (v) => { const R_m = v.R_ft / FT; return { nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT, diskArea_m2: v.nRotors * Math.PI * R_m * R_m, isTilting: false }; };
const run = (v, extra = {}) => {
  try { return rotorGroup({ configType: v.cfg, solidity: v.sigma, ...extra }, geom(v), 2.0); }
  catch (e) { return { threw: e.message, mass: NaN }; }
};

/* ── 1. THE ENGINE USES THE DECK VALUES ───────────────────────────────── */
console.log("\n1. What the engine uses per configuration is what NASA's deck sets");
for (const [cfg, d] of Object.entries(ROTOR_DECK_BY_CONFIG)) {
  const p = { configType: cfg };
  const out = rotorGroup({ ...p, solidity: 0.08 }, { nRotors: 2, radius_m: 3, tipSpeed_ms: 160, diskArea_m2: 56 }, 2.0);
  check(!out.threw && out.model === "afdd82" && out.nBlades === d.nBlades && out.flapFreq === d.flapFreq
        && out.sigmaTwToGeo === d.sigmaTwToGeo && out.chiBlade === NASA_ROTOR_TECH.blade && out.chiHub === NASA_ROTOR_TECH.hub
        && bladeCountFor(p) === d.nBlades && flapFreqFor(p) === d.flapFreq && sigmaTwToGeoFor(p) === d.sigmaTwToGeo
        && /:\d+/.test(d.src) && /\.list/.test(d.src),
    `${cfg}: AFDD82, ${d.nBlades} blades, nu ${d.flapFreq}, f ${d.sigmaTwToGeo}, chi ${NASA_ROTOR_TECH.blade}/${NASA_ROTOR_TECH.hub}, cited to a deck line`,
    `${out.model ?? "?"} ${out.nBlades ?? "?"} bl nu ${out.flapFreq ?? "?"} f ${out.sigmaTwToGeo ?? "?"} chi ${out.chiBlade ?? "?"}/${out.chiHub ?? "?"} — ${d.src.slice(0, 60)}…`);
}
/* An INDEPENDENT copy of what the decks say, so a mutated table cannot pass
   itself: these are read from the vendored .list files, not from the engine. */
const DECK_SAYS = {
  multicopter: { nBlades: 3, flapFreq: 1.03,  src: "quadrotorE6.list :114 nblade=3, :116 flapfreq=1.03" },
  sideBySide:  { nBlades: 4, flapFreq: 1.035, src: "sidebysideE6.list :115 nblade=4, :118 flapfreq=1.035" },
  helicopter:  { nBlades: 4, flapFreq: 1.035, src: "QSMRE.list :114 nblade=4, :117 flapfreq=1.035" },
  liftcruise:  { nBlades: 2, flapFreq: 1.25,  src: "lift-cruiseE6.list :210 nblade=2, :212 flapfreq=1.25; Johnson & Silva 2022 :615 'can only have two blades'" },
};
for (const [cfg, d] of Object.entries(DECK_SAYS)) {
  const t = ROTOR_DECK_BY_CONFIG[cfg];
  check(t && t.nBlades === d.nBlades && t.flapFreq === d.flapFreq, `${cfg}: the engine's table holds the deck's ${d.nBlades} blades and nu ${d.flapFreq}`, d.src);
}
check(NASA_ROTOR_TECH.blade === 0.916 && NASA_ROTOR_TECH.hub === 0.759, "the technology factors are the decks' 0.916 / 0.759", "TECH_blade / TECH_hub, identical in every reference-vehicle deck");
/* THE DEFAULT LAYOUT GETS ITS DECK. The engine resolves a missing configType
   to lift+cruise inside resolveConfiguration, and the first build of this
   change left the rotor model reading the raw parameter object, so every
   caller that omitted configType (the golden-master sweep, the UI default)
   ran with three blades. The mutant that reverted the fix survived this gate
   because nothing here omitted configType. Now something does. */
{
  const k = configKeyFor({});
  const out = rotorGroup({ solidity: 0.2 }, geom(T12[5]), 2.0);
  check(k === "liftcruise" && out.nBlades === ROTOR_DECK_BY_CONFIG[k].nBlades && out.flapFreq === ROTOR_DECK_BY_CONFIG[k].flapFreq
        && bladeCountFor({}) === ROTOR_DECK_BY_CONFIG[k].nBlades && flapFreqFor({}) === ROTOR_DECK_BY_CONFIG[k].flapFreq
        && sigmaTwToGeoFor({}) === ROTOR_DECK_BY_CONFIG[k].sigmaTwToGeo,
    "a parameter set with NO configType takes the deck of the layout the engine resolves it to",
    `engine default ${k}: ${out.nBlades} blades, nu ${out.flapFreq}, f ${out.sigmaTwToGeo}`);
  const unknown = rotorGroup({ configType: "no-such-layout", solidity: 0.2 }, geom(T12[5]), 2.0);
  check(unknown.nBlades === ROTOR_DECK_BY_CONFIG[k].nBlades && unknown.deck === ROTOR_DECK_BY_CONFIG[k].src,
    "an unknown configType resolves the same way the engine resolves it, not to a silent fallback",
    `${unknown.nBlades} blades, deck ${(unknown.deck ?? "none").slice(0, 50)}…`);
}
check(rotorDeckFor("tiltrotor") === null && rotorDeckFor("tiltwing") === null && bladeCountFor({ configType: "tiltrotor" }) === 3
      && sigmaTwToGeoFor({ configType: "tiltrotor" }) === 1,
  "a tilting layout has no deck row: 3 blades and an untapered chord, by declared fallback",
  "NASA weighs tilting proprotors with the propeller model, so no rotor-group deck values exist to copy");
check(bladeCountFor({ configType: "liftcruise", nBlades: 4 }) === 4 && sigmaTwToGeoFor({ configType: "liftcruise", sigmaTwToGeo: 0.9 }) === 0.9
      && rotorGroup({ configType: "liftcruise", solidity: 0.2, rotorBladeTechFactor: 1, rotorHubTechFactor: 1 }, geom(T12[5]), 2.0).chiBlade === 1,
  "every deck default yields to an explicit input", "nBlades, sigmaTwToGeo, rotorBladeTechFactor/rotorHubTechFactor");

/* ── 2. THE CHORD RATIO IS THE DECK'S OWN CHORD LAW, INTEGRATED ─────────
   NDARC theory :7473-7483: thrust-weighted mean chord weights by r^2,
   geometric mean is the plain mean; both over [xroot, 1] (manual :4950). */
console.log("\n2. sigma_t/sigma_g recomputed from each deck's chord law");
const ratio = (cfn, xroot) => {
  const n = 4000, h = (1 - xroot) / n; let ct = 0, cg = 0, r2 = 0, one = 0;
  for (let i = 0; i <= n; i++) {
    const r = xroot + i * h, w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
    ct += w * cfn(r) * r * r; cg += w * cfn(r); r2 += w * r * r; one += w;
  }
  return (ct / r2) / (cg / one);
};
const LAWS = {
  multicopter: { law: (r) => 1 - 0.25 * r, xroot: 0.15, src: "quadrotorE6.list :115 taper=0.75, :117 xroot=0.15" },
  liftcruise:  { law: (r) => 1 - 0.25 * r, xroot: 0.10, src: "lift-cruiseE6.list :211 taper=.75, :213 xroot=0.10" },
  sideBySide:  { law: (r) => (r <= 0.94 ? 1 : 1 - 0.4 * (r - 0.94) / 0.06), xroot: 0.15, src: "sidebysideE6.list :117 fchord 1,1,.6 at 0,.94,1; :119 xroot=0.15" },
  helicopter:  { law: (r) => (r <= 0.94 ? 1 : 1 - 0.4 * (r - 0.94) / 0.06), xroot: 0.15, src: "QSMRE.list :116 fchord 1,1,.6; :118 xroot=0.15" },
};
for (const [cfg, L] of Object.entries(LAWS)) {
  const f = ratio(L.law, L.xroot), d = ROTOR_DECK_BY_CONFIG[cfg].sigmaTwToGeo;
  check(Math.abs(f - d) < 5e-5, `${cfg}: the table's ${d} is the chord law's own ratio`, `integrated ${f.toFixed(6)} (${L.src})`);
}
check(ratio((r) => 1 - 0.25 * r, 0) < 1 && ratio((r) => 1, 0.15) === 1,
  "a tapered blade's geometric chord is LARGER than its thrust-weighted chord; an untapered one is equal",
  `taper 0.75, no cutout: f ${ratio((r) => 1 - 0.25 * r, 0).toFixed(4)}; c.75/c.50 closed form ${((1 - 0.75 * 0.25) / (1 - 0.5 * 0.25)).toFixed(4)}`);

/* ── 3. THE MODULE IS THE EQUATIONS ─────────────────────────────────────── */
console.log("\n3. The module equals a direct AFDD82 evaluation with the factors and the geometric chord");
for (const v of T12) {
  const out = run(v), d = ROTOR_DECK_BY_CONFIG[v.cfg];
  const cGeo = v.sigma * Math.PI * v.R_ft / d.nBlades / d.sigmaTwToGeo;
  const Wb = NASA_ROTOR_TECH.blade * afdd82Blade(v.nRotors, d.nBlades, v.R_ft, cGeo, v.tip, d.flapFreq);
  const Wh = NASA_ROTOR_TECH.hub * afdd82Hub(v.nRotors, d.nBlades, v.R_ft, v.tip, d.flapFreq, Wb);
  const direct = (Wb + Wh) / LB;
  check(!out.threw && Math.abs(out.mass / direct - 1) < 1e-12 && Math.abs(out.bladeKg / (Wb / LB) - 1) < 1e-12
        && Math.abs(out.chord_m * FT / cGeo - 1) < 1e-12,
    `${v.key}: mass, blade mass and geometric chord match the direct evaluation to rounding`,
    out.threw ? `THREW: ${out.threw}` : `${(out.mass * LB).toFixed(3)} lb vs ${(direct * LB).toFixed(3)} lb; chord ${(out.chord_m * FT).toFixed(4)} ft (thrust-weighted ${(out.chordTw_m * FT).toFixed(4)} ft)`);
}
{
  const v = T12[2], noSigma = run(v, { solidity: undefined });
  check(!noSigma.threw && /diskArea/.test(noSigma.model) && noSigma.bladeKg === null,
    "without a solidity the module falls back to the declared [CAL] disk-area model rather than inventing a chord", noSigma.model ?? noSigma.threw);
}

/* ── 4. THE REPRODUCTION, AND THE TWO FACTS IT PROVES ───────────────────── */
console.log("\n4. Table 12 reproduced with the deck inputs — and what happens without them");
console.log("     key      pub  blades+hub  support  total    err   | blades+hub vs pub-support | no chi | AFDD00");
const errs = [], errsNoChi = {}, rows = [];
for (const v of T12) {
  const out = run(v), sup = supportLb(v), total = out.mass * LB + sup;
  const e = total / v.rotor_lb * 100 - 100, eBH = (out.mass * LB) / (v.rotor_lb - sup) * 100 - 100;
  const noChi = run(v, { rotorBladeTechFactor: 1, rotorHubTechFactor: 1 }); const eNo = (noChi.mass * LB + sup) / v.rotor_lb * 100 - 100;
  const a00 = run(v, { rotorMassModel: "afdd00" }); const e00 = (a00.mass * LB + sup) / v.rotor_lb * 100 - 100;
  errs.push(e); errsNoChi[v.key] = { e, eNo };
  rows.push(`     ${v.key.padEnd(8)} ${String(v.rotor_lb).padStart(4)}  ${(out.mass * LB).toFixed(0).padStart(6)}      ${sup.toFixed(0).padStart(4)}   ${total.toFixed(0).padStart(5)}  ${f1(e).padStart(7)} |        ${f1(eBH).padStart(7)}          | ${f1(eNo).padStart(7)} | ${f1(e00).padStart(7)}`);
}
rows.forEach((r) => console.log(r));
const mae = (a) => a.reduce((s, x) => s + Math.abs(x), 0) / a.length;
const deckMae = mae(errs);
console.log(`     MAE ${deckMae.toFixed(1)} % over ${errs.length} vehicles`);
/* (a) THE REPRODUCTION CLAIM, on the five vehicles whose deck inputs are
   complete. The bound is set from the failure mode, not from the answer:
   the innocent case is at most 2.2 % here, and the smallest known wrong
   variant is 5.8 % away (AFDD00 on the SMR; a thrust-weighted chord on the
   quadrotor is 5.8 % too). 3 % sits between them. The lift+cruise is NOT
   in this check: it is the residual this gate reports, and a bound that
   admitted it would be a thermometer. */
for (const v of T12.filter((x) => x.cfg !== "liftcruise")) {
  const e = errs[T12.indexOf(v)];
  check(Math.abs(e) < 3, `${v.key}: NASA's rotor group reproduced within 3 % with NASA's own inputs`, f1(e));
}
/* A wrong input can score better, which is why "best over a sweep" is not
   evidence and is only REPORTED: a uniform four blades lands the seven-
   vehicle MAE lower than the deck values do, by lightening the lift+cruise
   that NASA say "can only have two blades on the lifting rotors". */
let bestUniform = { mae: Infinity };
for (const model of ["afdd82", "afdd00"]) for (const nb of [2, 3, 4, 5]) {
  const es = T12.map((v) => { const o = run(v, { rotorMassModel: model, nBlades: nb }); return (o.mass * LB + supportLb(v)) / v.rotor_lb * 100 - 100; });
  const m = mae(es); if (m < bestUniform.mae) bestUniform = { mae: m, model, nb };
}
console.log(`     for the record: the best UNIFORM blade count is ${bestUniform.model.toUpperCase()} ${bestUniform.nb} blades at MAE ${bestUniform.mae.toFixed(1)} %`
  + ` against ${deckMae.toFixed(1)} % with the deck values — it scores by contradicting the source on the lift+cruise, and is not used`);
/* (b) the technology factors are not decoration: the vehicles that match stop matching without them */
for (const k of ["SMR-TS", "SbS-TS", "SbS-E"]) {
  const { e, eNo } = errsNoChi[k];
  check(Math.abs(e) < 3 && Math.abs(eNo) > 10 && eNo > e,
    `${k}: within 3 % with NASA's technology factors, more than 10 % heavy without them`, `${f1(e)} with, ${f1(eNo)} without`);
}
/* (c) the residual is REPORTED, not asserted away: say where it is */
const worst = T12[errs.map(Math.abs).indexOf(Math.max(...errs.map(Math.abs)))];
console.log(`     largest residual: ${worst.key} at ${f1(errs[T12.indexOf(worst)])} — reported in the module header and the research note, not fitted`);

/* ── 5. THE HARNESS BOUNDARY IS THE DECK RULE, NOT A TYPED NUMBER ───────── */
console.log("\n5. validation/nasa-vehicles.js subtracts exactly NASA's own rotor-support term");
for (const v of NASA_VEHICLES.filter((x) => ["Quad-E", "SbS-E", "L+C-E"].includes(x.key))) {
  const t = T12.find((x) => x.key === v.key);
  const rule = supportLb({ ...t, nRotors: v.nRotors, R_ft: v.radius_ft });
  check(Math.abs((v.published.rotorSupport_lb ?? NaN) - rule) < 1e-9,
    `${v.key}: published.rotorSupport_lb is the deck rule (${ROTOR_DECK_BY_CONFIG[t.cfg].supportLbPerRotor != null ? "dWrsupt x N" : "Usupt x R x N"})`,
    `${v.published.rotorSupport_lb} lb vs rule ${rule.toFixed(1)} lb; blades+hub target ${(v.published.rotor_lb - rule).toFixed(1)} lb`);
}

/* ── 6. ONE HOME FOR BLADE COUNT, AND PROVENANCE THAT MATCHES ───────────── */
console.log("\n6. Blade count has one home, and the provenance describes what ships");
{
  const dir = "src/engine";
  const offenders = readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "rotorgroup.js")
    .filter((f) => /p\.nBlades\s*\?\?\s*\d/.test(readFileSync(`${dir}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  check(offenders.length === 0, "no engine module defaults its own blade count any more", offenders.length ? `still defaulting: ${offenders.join(", ")}` : "blade.js, flightcontrols.js, geometry.js all read bladeCountFor()");
  const src = readFileSync("src/engine/rotorgroup.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(/p\.rotorMassModel \?\? "afdd82"/.test(src), "the shipped default model is afdd82 in code, not only in prose", "source scan, comments excluded");
  const pm = INPUTS.rotorMassModel?.src ?? "";
  check(/'afdd82' DEFAULT/.test(pm) && /MODEL_Wblade/.test(pm), "provenance says afdd82 is the default and why (NDARC's own default, no deck overrides it)", pm.slice(0, 90) + "…");
  for (const k of ["nBlades", "sigmaTwToGeo", "rotorBladeTechFactor", "rotorHubTechFactor", "rotorFlapFreq"]) {
    const e = INPUTS[k];
    check(e && e.status === "sourced" && /\.list :\d+/.test(e.src ?? ""), `provenance for ${k} is sourced to a deck line`, (e?.src ?? "MISSING").slice(0, 90) + "…");
  }
  const pb = INPUTS.rotorBladeTechFactor?.src ?? "", ph = INPUTS.rotorHubTechFactor?.src ?? "";
  check(pb.includes(String(NASA_ROTOR_TECH.blade)) && ph.includes(String(NASA_ROTOR_TECH.hub)),
    "the provenance notes carry the factor values the engine ships", `${NASA_ROTOR_TECH.blade} / ${NASA_ROTOR_TECH.hub}`);
  const nb = INPUTS.nBlades?.src ?? "";
  check(Object.entries(ROTOR_DECK_BY_CONFIG).every(([, d]) => new RegExp(`\\b${d.nBlades}\\b`).test(nb)),
    "the blade-count note names every deck value the engine ships", nb.slice(0, 90) + "…");
}

/* ── 7. A TILTING LAYOUT SAYS WHAT THE REFERENCE DID INSTEAD ─────────────── */
console.log("\n7. Departure from the reference is declared where it happens");
{
  const out = rotorGroup({ configType: "tiltrotor", solidity: 0.2 }, { nRotors: 6, radius_m: 1.5, tipSpeed_ms: 170, diskArea_m2: 42, isTilting: true }, 2.0);
  check(typeof out.referenceModelNote === "string" && /propeller/.test(out.referenceModelNote) && /MODEL_config=3/.test(out.referenceModelNote),
    "a tilting rotor's detail says NASA used the propeller model and cites the deck line", (out.referenceModelNote ?? "none").slice(0, 90) + "…");
  const lc = run(T12[5]);
  check(lc.referenceModelNote === null && typeof lc.deck === "string" && /lift-cruiseE6/.test(lc.deck),
    "a lift+cruise rotor carries its deck citation and no departure note", (lc.deck ?? "none").slice(0, 80) + "…");
}

console.log(`\n${bar}`); console.log(`ROTOR GROUP GATE: ${passes} passed, ${fails} failed`); console.log(bar);
process.exit(fails > 0 ? 1 : 0);
