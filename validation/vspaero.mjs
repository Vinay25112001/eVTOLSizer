/* =====================================================================
   VSPAERO GATE — computed aerodynamics against assumed aerodynamics
   =====================================================================
   This project's drag and lift come from NDARC drag areas and an assumed
   Oswald efficiency. Nothing had ever checked them against a solver. It
   can now: the export produces models OpenVSP loads, meshes and solves, so
   a real vortex-lattice polar is available for the lifting surfaces.

   That is only possible because of the export work earlier — before the
   WriteVSPFile arity, InsertXSec and parm-group fixes no model this tool
   produced would even load, and before the airfoil fix every wing was a
   symmetric section that could not have shown camber lift.

   WHAT THIS IS AND IS NOT. VSPAERO is a vortex-lattice / panel solver, not
   RANS CFD. It gives inviscid lifting-surface aerodynamics: lift-curve
   slope, span efficiency, induced drag. It does not give viscous drag,
   separation or stall, and this gate does not pretend otherwise — the
   fuselage is deliberately excluded and its drag stays with NDARC's drag
   areas, which is the method built for it.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { generateVSPScript } from "../src/export/vspscript.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("VSPAERO GATE — vortex-lattice polar on the exported model");
console.log("=".repeat(76));

function findExe() {
  if (process.env.OPENVSP_EXE && existsSync(process.env.OPENVSP_EXE)) return process.env.OPENVSP_EXE;
  const roots = [join(process.env.USERPROFILE || "", "Downloads"),
                 join(process.env.USERPROFILE || "", "Downloads", "eVTOL"),
                 "C:/Program Files", "/usr/local/bin"];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const d of readdirSync(r)) {
      if (!/openvsp/i.test(d)) continue;
      try { if (!statSync(join(r, d)).isDirectory()) continue; } catch { continue; }
      const direct = join(r, d, "vspscript.exe");
      if (existsSync(direct)) return direct;
      for (const e of readdirSync(join(r, d), { withFileTypes: true })) {
        const c = join(r, d, e.name, "vspscript.exe");
        if (e.isDirectory() && existsSync(c)) return c;
      }
    }
  }
  return null;
}

const exe = findExe();
const dir = join(tmpdir(), "evtol-vspaero");
mkdirSync(dir, { recursive: true });

/* The layout with the largest wing is the one worth solving: it has the most
   lifting surface and the cleanest comparison against the engine's polar. */
const KEY = "liftcruise";
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const d = CFG.CONFIG_DEFAULTS[KEY];
const p0 = { ...B, configType:KEY, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
  tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
  ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
const p = { ...p0, propDiam: CFG.solveRotorDiameter(KEY, p0, runSizing)?.propDiam };
const SR = runSizing(p);
const Sref = Number(SR.Swing), bref = Number(SR.bWing), cref = Sref / bref;
const AR = (bref * bref) / Sref;

writeFileSync(join(dir, `${KEY}.vspscript`),
  generateVSPScript(p, SR, { outFile: `${KEY}.vsp3` }));

if (!exe) {
  console.log("");
  console.log("  SKIPPED — no vspscript.exe found. OpenVSP is not a dependency of this");
  console.log("  project; set OPENVSP_EXE to run the solver. The model was still");
  console.log("  generated, so a converged polar is NOT what this run proved.");
  process.exit(0);
}

console.log(`  OpenVSP: ${exe}`);
console.log(`  ${KEY}: Sref ${Sref.toFixed(2)} m2, b ${bref.toFixed(2)} m, AR ${AR.toFixed(3)}`);
console.log("");

const run = (script) => {
  try {
    return execFileSync(exe, ["-script", script],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });
  } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); }
};

run(`${KEY}.vspscript`);            // build the .vsp3
const tpl = readFileSync(join(HERE, "..", "tools", "vspaero-polar.vspscript"), "utf8")
  .replace("@@MODEL@@", `${KEY}.vsp3`)
  .replace("@@SREF@@", Sref.toFixed(5))
  .replace("@@BREF@@", bref.toFixed(5))
  .replace("@@CREF@@", cref.toFixed(5));
writeFileSync(join(dir, "polar.vspscript"), tpl);
const out = run("polar.vspscript");

const pts = [...out.matchAll(/@@POLAR\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g)]
  .map((m) => ({ a: +m[1], CL: +m[2], CDi: +m[3], CDtot: +m[4] }));

check(pts.length >= 4,
  "VSPAERO returns a converged polar on the exported model",
  pts.length ? `${pts.length} alpha points solved` : `no polar — solver output:\n${out.slice(-400)}`);
if (pts.length < 4) { console.log("\nVSPAERO GATE FAILED"); process.exit(1); }

console.log("");
console.log("    alpha      CL        CDi       CDtot     CDi/CL^2");
for (const q of pts)
  console.log(`    ${String(q.a).padStart(5)}${q.CL.toFixed(4).padStart(10)}`
    + `${q.CDi.toFixed(5).padStart(11)}${q.CDtot.toFixed(5).padStart(11)}`
    + `${(q.CDi / (q.CL * q.CL)).toFixed(4).padStart(11)}`);
console.log("");

/* ── 1. Induced drag must be positive and rise with lift ─────────────── */
check(pts.every((q) => q.CDi > 0),
  "induced drag is positive at every alpha",
  "the mixed thin/thick solve gave NEGATIVE CDi at four of five alphas, which "
  + "is impossible and is why the fuselage is excluded — see tools/vspaero-polar.vspscript");

/* ── 2. CDi = CL^2 / (pi AR e): the ratio must be CONSTANT ────────────
   This is the strongest internal check available. If the solver is
   converging, CDi/CL^2 is one number across the whole polar. */
const ratios = pts.filter((q) => Math.abs(q.CL) > 0.05).map((q) => q.CDi / (q.CL * q.CL));
const rMean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
const rSpread = (Math.max(...ratios) - Math.min(...ratios)) / rMean;
check(rSpread < 0.10,
  "CDi/CL^2 is constant across the polar — the signature of a converged solve",
  `${ratios.map((x) => x.toFixed(4)).join(", ")}, spread ${(100 * rSpread).toFixed(1)}% — `
  + `induced drag follows CL^2 as it must, which a diverging solve does not do`);

/* ── 3. Span efficiency, COMPUTED against the value the engine ASSUMES ─ */
const eVLM = 1 / (Math.PI * AR * rMean);
console.log(`    span efficiency e:  VSPAERO ${eVLM.toFixed(3)}   engine assumes ${B.eOsw}`);
check(eVLM > 0.7 && eVLM < 1.15,
  "the computed span efficiency is physical",
  `e = 1/(pi AR CDi/CL^2) = ${eVLM.toFixed(3)} at AR ${AR.toFixed(2)} — an inviscid `
  + `VLM should land near the ideal 1.0, and above it would mean the solve is wrong`);

/* ── 4. Lift-curve slope against thin-airfoil theory corrected for AR ── */
const lo = pts[0], hi = pts[pts.length - 1];
const claDeg = (hi.CL - lo.CL) / (hi.a - lo.a);
const claRad = claDeg * 180 / Math.PI;
const helmbold = (2 * Math.PI * AR) / (2 + Math.sqrt(AR * AR + 4));
console.log(`    lift slope:  VSPAERO ${claRad.toFixed(2)} /rad   Helmbold ${helmbold.toFixed(2)} /rad`);
check(Math.abs(claRad / helmbold - 1) < 0.25,
  "and the lift-curve slope agrees with finite-wing theory",
  `${claRad.toFixed(2)} against Helmbold's ${helmbold.toFixed(2)} /rad at AR ${AR.toFixed(2)}, `
  + `${(100 * Math.abs(claRad / helmbold - 1)).toFixed(0)}% apart — the tail also lifts on `
  + `the wing's reference area, so the solver reading above theory is expected`);

/* ── 5. THE PAYOFF: camber. A symmetric wing gives CL(0) = 0 ─────────── */
const CL0 = pts.find((q) => Math.abs(q.a) < 1e-6)?.CL;
check(CL0 != null && CL0 > 0.1,
  "the wing makes lift at ZERO incidence — the exported camber is real",
  `CL(0) = ${CL0?.toFixed(4)} on a ${SR.selAF?.name ?? "cambered"} section. Before the `
  + `airfoil fix this exporter wrote Camber 0 and this number would have been ~0: `
  + `the defect is now visible to a solver, not just to a reader of the file`);

console.log("");
console.log("  WHAT THIS SETTLES:");
console.log("    The exported model is not merely well-formed, it is AERODYNAMICALLY");
console.log("    solvable, and the section this tool sized shows up as lift at zero");
console.log("    incidence in an independent solver. The engine's assumed Oswald");
console.log("    efficiency can now be compared with a computed one rather than");
console.log("    carried on faith.");

console.log("");
if (fails) { console.log(`VSPAERO GATE FAILED: ${fails}`); process.exit(1); }
console.log("VSPAERO GATE PASSED");
