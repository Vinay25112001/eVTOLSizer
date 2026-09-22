#!/usr/bin/env node
/* evtol-size — size eVTOL designs from the command line. See docs/API.md.

     evtol-size design.json                 a summary on stdout
     evtol-size design.json --json          the full result as JSON
     evtol-size cases.json --json           an ARRAY of input objects: one JSON line each
     evtol-size design.evtol.json --reopen  re-run a saved design file, report continuity
     echo '{"payload":300}' | evtol-size -  read inputs from stdin
     evtol-size --version

   Exit status: 0 when every design converged with no warning of severity
   "error", 1 otherwise, 2 on a usage or file error. A script can therefore
   branch on the result without parsing it. */

import { readFileSync } from "node:fs";
import { size, reopen, engineVersion } from "../src/api.js";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const files = args.filter((a) => a === "-" || !a.startsWith("--"));

if (flag("--version")) {
  const v = engineVersion();
  console.log(`evtol-size ${v.label} (commit ${v.commit}${v.dirty ? ", uncommitted changes" : ""}; API ${v.api}; design format ${v.designFormatVersion})`);
  process.exit(0);
}
if (flag("--help") || files.length !== 1) {
  console.error("usage: evtol-size <inputs.json | cases.json | design.evtol.json | -> [--json] [--reopen] [--version]");
  process.exit(2);
}

let text;
try { text = files[0] === "-" ? readFileSync(0, "utf8") : readFileSync(files[0], "utf8"); }
catch (e) { console.error(`evtol-size: cannot read ${files[0]}: ${e.message}`); process.exit(2); }

let data;
try { data = JSON.parse(text); }
catch { console.error(`evtol-size: ${files[0]} is not valid JSON`); process.exit(2); }

const HEAD = ["MTOW", "Wempty", "Wbat", "Etot", "Phov", "bWing", "LDact"];
const summary = (r) => {
  const R = r.result;
  const lines = [];
  if (!R) lines.push(`engine error: ${r.error}`);
  else {
    lines.push(`${r.inputs.configType ?? "liftcruise"}  payload ${r.inputs.payload} kg  range ${r.inputs.range} km  -> ${r.converged ? "converged" : "DID NOT CONVERGE"}`);
    lines.push("  " + HEAD.filter((k) => R[k] != null).map((k) => `${k} ${R[k]}`).join("  "));
  }
  lines.push(`  warnings: ${r.warningCounts.error} error(s), ${r.warningCounts.warning} warning(s), ${r.warningCounts.info} note(s); `
    + `${r.domain.insideValidation ? "inside" : "OUTSIDE"} the validated envelope`);
  for (const w of r.warnings.filter((x) => x.severity !== "info")) lines.push(`  [${w.cat}] ${w.severity}: ${w.text.slice(0, 160)}`);
  return lines.join("\n");
};
const ok = (r) => r.converged && r.warningCounts.error === 0;

try {
  if (flag("--reopen")) {
    const out = reopen(data);
    const res = { continuity: out.continuity, inputs: out.record.inputs };
    console.log(flag("--json") ? JSON.stringify(res) : `${out.continuity.status}: ${out.continuity.moved?.length ?? 0} of ${out.continuity.compared} stored outputs moved`);
    process.exit(out.continuity.status === "identical" ? 0 : 1);
  }
  const list = Array.isArray(data) ? data : [data?.format ? data.inputs : data];
  let allOk = true;
  for (const inputs of list) {
    const r = size(inputs, { customAirfoil: data?.customAirfoil ?? null });
    allOk &&= ok(r);
    if (flag("--json")) console.log(JSON.stringify({ inputs: r.inputs, converged: r.converged, error: r.error,
      warnings: r.warnings, domain: r.domain, result: r.result }));
    else console.log(summary(r));
  }
  process.exit(allOk ? 0 : 1);
} catch (e) {
  console.error(`evtol-size: ${e.message}`);
  process.exit(2);
}
