/* Coverage report over the verification traceability matrix.
   Also flags any engine output that is not registered at all — so a new
   number cannot quietly appear in the UI without someone classifying it.

   And it flags DUPLICATE registry keys. A repeated key in an object literal
   is legal JavaScript: the last one silently wins. Two entries (xCGempty,
   xACwing) had been re-declared as bare "unverified" stubs below their sourced
   entries, so the registry under-reported its own evidence and nothing failed.
   Per this repo's standing rule, a regex is not sufficient to check JS — this
   parses the file. @babel/parser is already present via @vitejs/plugin-react. */
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import { INPUTS, OUTPUTS } from "../src/lib/provenance.js";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { engineInputs } from "../src/lib/designfile.js";

function duplicateKeys(path){
  const ast=parse(readFileSync(path,"utf8"),{sourceType:"module"});
  const dups=[];
  for(const node of ast.program.body){
    if(node.type!=="ExportNamedDeclaration"||!node.declaration) continue;
    for(const d of node.declaration.declarations||[]){
      if(d.init?.type!=="ObjectExpression") continue;
      const seen=new Map();
      for(const pr of d.init.properties){
        const k=pr.key?.name??pr.key?.value;
        if(k==null) continue;
        if(seen.has(k)) dups.push({reg:d.id.name,key:k,line:pr.loc.start.line,over:seen.get(k)});
        seen.set(k,pr.loc.start.line);
      }
    }
  }
  return dups;
}

/* MUST TRACK App.jsx's defaults. The unregistered-output check can only see
   keys the run actually produces, so a parameter set that differs from the
   app's is blind to whole subsystems: this set previously omitted
   autoPositionWing and configType, and the five wingPos* outputs were
   therefore never exercised here at all. If a key shows up under "registered
   but NOT emitted", check this set before assuming the key is dead. */
const P={payload:455,range:190,vCruise:67,cruiseAlt:1000,hoverHeight:15.24,reserveMinutes:20,LD:14,
 AR:9,eOsw:0.85,clDesign:0.55,taper:0.45,tc:0.15,nPropHover:6,propDiam:3.0,twRatio:1.3,convTolExp:-6,
 etaHov:0.70,etaSys:0.80,rateOfClimb:5.08,climbAngle:5,descentAngle:6,climbLDPenalty:0.13,deltaISA:0,
 cRateDerate:0.08,sedCell:300,etaBat:0.90,socMin:0.19,ewf:0.50,fusLen:7.2,fusDiam:1.65,vtGamma:45,
 vtCh:0.45,vtCv:0.032,vtAR:2.5,
 weightModel:"buildup",autoPositionWing:true,targetSM:0.15,
 configType:"hybrid",nRotorsStopped:2};
const R = runSizing({...P, range:P.range+0.76*P.vCruise*20*60/1000});

/* A GATE SINCE 2026-09-16, AND OVER EVERY LAYOUT. This file used to print its
   findings and exit 0, while the conference abstract said "continuous
   integration fails if any output is emitted without" a status. It did not:
   a new output (twinKappa) passed the whole suite unregistered. It also ran
   ONE parameter set, so an output only some layouts emit could never be seen.
   Now the app's own defaults run on all six layouts plus the opt-in
   arrangements, and the union of their keys is what must be classified. */
const LAYOUTS = ["liftcruise","hybrid","hybridPusher","tiltrotor","multicopter","sideBySide"];
const EXTRA_RUNS = [
  ...LAYOUTS.map(c => ({ ...DEFAULT_PARAMS, configType: c })),
  { ...DEFAULT_PARAMS, configType: "multicopter", nPropHover: 8, rotorInterleave: true },
  { ...DEFAULT_PARAMS, configType: "multicopter", nPropHover: 8, rotorArrangement: "coaxial" },
  { ...DEFAULT_PARAMS, weightModel: "fraction" },
  ...LAYOUTS.map(c => ({ ...DEFAULT_PARAMS, configType: c, powertrain: "turboelectric" })),
];
const allKeys = new Set(Object.keys(R));
let runsThrew = 0;
for (const p of EXTRA_RUNS) {
  try { Object.keys(runSizing(engineInputs(p))).forEach(k => allKeys.add(k)); }
  catch { runsThrew++; }
}

const ORDER=["validated","calibrated","sourced","derived","unverified"];
const tally=(reg)=>{const t={};for(const s of ORDER)t[s]=0;
  for(const v of Object.values(reg))t[v.status]=(t[v.status]||0)+1;return t;};

const bar="═".repeat(74);
console.log(bar); console.log("VERIFICATION COVERAGE"); console.log(bar);

for (const [name,reg] of [["INPUTS",INPUTS],["OUTPUTS",OUTPUTS]]) {
  const t=tally(reg), n=Object.keys(reg).length;
  console.log(`\n${name} — ${n} registered`);
  for(const s of ORDER){
    const c=t[s]||0; if(!c) continue;
    console.log(`  ${s.padEnd(11)} ${String(c).padStart(3)}  ${(c/n*100).toFixed(0).padStart(3)}%  ${"█".repeat(Math.round(c/n*40))}`);
  }
}

// anything the engine emits that nobody has classified
const emitted=Object.keys(R);
const unregistered=[...allKeys].filter(k=>!(k in OUTPUTS));
/* Registered but never emitted. Not necessarily a fault — some keys only
   appear on certain configurations — but a name that no run produces is
   usually a typo or a leftover from a removed output. */
const orphaned=Object.keys(OUTPUTS).filter(k=>!allKeys.has(k));
const dups=duplicateKeys(new URL("../src/lib/provenance.js",import.meta.url));
console.log(`\n${bar}`);
console.log(`Engine emits ${allKeys.size} distinct keys over ${EXTRA_RUNS.length + 1} runs (${emitted.length} on the reference run); ${Object.keys(OUTPUTS).length} are registered.`);
if(unregistered.length){
  console.log(`\n${unregistered.length} UNREGISTERED output(s) — nobody has classified these:`);
  for(let i=0;i<unregistered.length;i+=6) console.log("   "+unregistered.slice(i,i+6).join(", "));
}else{
  console.log("Every emitted output is classified.");
}
if(orphaned.length){
  console.log(`\n${orphaned.length} registered key(s) emitted by NO run (a typo, a removed output, or an input filed as an output):`);
  for(let i=0;i<orphaned.length;i+=6) console.log("   "+orphaned.slice(i,i+6).join(", "));
}
if(dups.length){
  console.log(`\nDUPLICATE REGISTRY KEYS — the later entry silently wins:`);
  for(const d of dups) console.log(`   ${d.reg}.${d.key}  line ${d.line} overrides line ${d.over}`);
}
const v=tally(OUTPUTS).validated||0;
console.log(`\nBottom line: ${v} of ${emitted.length} engine outputs (${(v/emitted.length*100).toFixed(0)}%) have been`);
console.log(`compared numerically against published aircraft data.`);

const problems = [];
if (unregistered.length) problems.push(`${unregistered.length} unregistered output(s)`);
if (orphaned.length) problems.push(`${orphaned.length} registered output(s) no run emits`);
if (dups.length) problems.push(`${dups.length} duplicate registry key(s)`);
if (runsThrew) problems.push(`${runsThrew} layout run(s) threw`);
console.log(`\n${bar}`);
if (problems.length) { console.log("PROVENANCE GATE FAILED: " + problems.join("; ")); process.exit(1); }
console.log("PROVENANCE GATE PASSED - every output any layout emits is classified.");
