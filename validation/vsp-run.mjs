/* =====================================================================
   RUN THE EXPORTED SCRIPT THROUGH OPENVSP
   =====================================================================
   WHY THIS EXISTS. src/export/vspscript.js emits an AngelScript that is
   supposed to BUILD this aircraft in OpenVSP, and tools/vsp3-to-vspscript.py
   was described in its own header as "a CHECK, not a convenience". Neither
   had ever been executed. When one finally was, the very first line OpenVSP
   reached was a compile error:

       No matching signatures to 'WriteVSPFile(const string)'

   so every script this tool had ever produced stopped before building
   anything. Behind that sat three more defects that only running could find:

     1. InsertXSec inserts AFTER an index and the index must be <= n-2. The
        exporter cut the fuselage to 2 sections and then inserted at 1, which
        is out of range: six calls in a row left the count at 2 and every
        station above XSec_1 was written to a section that did not exist.
     2. "XSecCurve_0" and "XSec_0" are how parms appear in the .vsp3 XML but
        are not groups the API can look up on a Geom. Reading the file and
        assuming the API addresses parms the same way is the mistake.
     3. No airfoil was written at all, and vsp3.js wrote Camber 0 — a
        SYMMETRIC section — while the sizing loop computed its polar from a
        cambered one.

   A GENERATOR THAT IS NEVER RUN IS NOT VALIDATED BY ANY AMOUNT OF READING.

   OpenVSP is not a dependency of this project, so the gate SKIPS when the
   binary is absent and says so. When it is present, an error from OpenVSP
   fails the build. Point OPENVSP_EXE at vspscript.exe to override the
   search.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { generateVSPScript } from "../src/export/vspscript.js";
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

function findExe() {
  if (process.env.OPENVSP_EXE && existsSync(process.env.OPENVSP_EXE))
    return process.env.OPENVSP_EXE;
  const roots = [join(process.env.USERPROFILE || "", "Downloads"),
                 "C:/Program Files", "C:/Program Files (x86)", "/usr/local/bin"];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    /* one level of OpenVSP-* directories, then their own single subdir */
    for (const d of readdirSync(r)) {
      if (!/openvsp/i.test(d)) continue;
      /* Downloads holds the zip next to the unpacked tree; scandir on a file
         throws ENOTDIR and took the whole gate down with it. */
      try { if (!statSync(join(r, d)).isDirectory()) continue; } catch { continue; }
      for (const cand of [join(r, d, "vspscript.exe"),
                          ...readdirSync(join(r, d), { withFileTypes: true })
                            .filter(e => e.isDirectory())
                            .map(e => join(r, d, e.name, "vspscript.exe"))]) {
        if (existsSync(cand)) return cand;
      }
    }
  }
  /* eVTOL/ holds the reference releases and the install alongside them */
  const ev = join(process.env.USERPROFILE || "", "Downloads", "eVTOL");
  if (existsSync(ev)) for (const d of readdirSync(ev)) {
    if (!/openvsp/i.test(d)) continue;
    try { if (!statSync(join(ev, d)).isDirectory()) continue; } catch { continue; }
    for (const e of readdirSync(join(ev, d), { withFileTypes: true })) {
      const c = join(ev, d, e.name, "vspscript.exe");
      if (e.isDirectory() && existsSync(c)) return c;
    }
  }
  return null;
}

console.log("OPENVSP SCRIPT-RUN GATE");
console.log("=".repeat(72));

const dir = join(tmpdir(), "evtol-vsp-run");
mkdirSync(dir, { recursive: true });

const keys = Object.keys(CFG.CONFIGURATIONS);
for (const k of keys) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...B, configType: k, nPropHover: d.nRotors,
    vCruise: d.vCruise_ms ?? B.vCruise, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    LD: d.LD_target ?? B.LD, etaHov: d.etaHov ?? B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  writeFileSync(join(dir, `${k}.vspscript`),
    generateVSPScript(p, runSizing(p), { outFile: `${k}.vsp3` }));
}
console.log(`  ${keys.length} scripts written to ${dir}`);

const exe = findExe();
if (!exe) {
  console.log("");
  console.log("  SKIPPED — no vspscript.exe found. OpenVSP is not a dependency of");
  console.log("  this project; set OPENVSP_EXE to run the scripts for real.");
  console.log("  The scripts were still generated, so a syntax-free build is NOT");
  console.log("  what this run proved.");
  process.exit(0);
}
console.log(`  OpenVSP: ${exe}`);
console.log("");

let bad = 0;
for (const k of keys) {
  let out = "";
  try {
    out = execFileSync(exe, ["-script", `${k}.vspscript`],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "") + String(e.message || "");
  }
  const errs = [...new Set(out.split("\n").filter(l => /Error/i.test(l)).map(l => l.trim()))];
  const wrote = existsSync(join(dir, `${k}.vsp3`));
  if (errs.length || !wrote) {
    bad++;
    console.log(`  FAIL  ${k}`);
    if (!wrote) console.log("          no .vsp3 was written");
    for (const e of errs.slice(0, 4)) console.log(`          ${e}`);
  } else {
    console.log(`  PASS  ${k}  — OpenVSP built it and wrote ${k}.vsp3`);
  }
}

console.log("");
if (bad) {
  console.log(`OPENVSP SCRIPT-RUN GATE FAILED: ${bad} of ${keys.length}`);
  process.exit(1);
}
console.log("OPENVSP SCRIPT-RUN GATE PASSED — every configuration builds in OpenVSP");
