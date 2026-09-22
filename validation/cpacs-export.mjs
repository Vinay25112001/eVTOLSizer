/* =====================================================================
   CPACS AND TRACEABILITY EXPORT GATE
   =====================================================================
   A CPACS file that does not validate is worse than none: the tool that
   reads it fails, or worse, reads part of it. Every layout's export is
   validated against the vendored CPACS 3.5.1 schema with lxml (Node has no
   XML Schema validator), and its mass statement is checked against the
   engine's. The traceability CSV is checked to carry one row per check,
   the right met/not-met counts, and CSV quoting that survives commas,
   quotes and newlines.
   ===================================================================== */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { size, LAYOUTS, engineVersion } from "../src/api.js";
import { inputHashOf } from "../src/lib/designfile.js";
import { generateCPACS, MASS_GROUPS } from "../src/export/cpacs.js";
import { traceabilityCSV, traceabilityRows, citationsIn } from "../src/export/traceability.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "validation", "schemas", "cpacs-3.5.1", "cpacs_schema.xsd");
const SCHEMA_SHA256 = "091e6dcf38c66e1e37ee935c48f6303db74a318205f290d5131a8153af2d864f";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("CPACS AND TRACEABILITY EXPORT GATE");
console.log("=".repeat(72));

const sha = createHash("sha256").update(readFileSync(SCHEMA)).digest("hex");
check("the vendored schema is the CPACS v3.5.1 release file", sha === SCHEMA_SHA256, sha.slice(0, 16));

const dir = mkdtempSync(join(tmpdir(), "evtol-cpacs-"));
const docs = [];
const stamp = engineVersion();
for (const layout of LAYOUTS) {
  const r = size({ configType: layout });
  const xml = generateCPACS({ inputs: r.inputs, R: r.result, stamp, inputHash: inputHashOf(r.inputs),
    warningCounts: r.warningCounts, name: `Test <${layout}> & "quotes"`, timestamp: "2026-09-16T12:00:00" });
  const f = join(dir, `${layout}.xml`);
  writeFileSync(f, xml);
  docs.push({ layout, f, xml, r });
}

/* ── schema validation ─────────────────────────────────────────────── */
let py = null;
for (const exe of ["python3", "python"]) {
  const t = spawnSync(exe, ["-c", "import lxml"], { encoding: "utf8" });
  if (t.status === 0) { py = exe; break; }
}
check("a Python with lxml is available to validate against the schema", !!py,
      py ?? "install Python 3 and `pip install lxml`; CI does this in verify.yml");
if (py) {
  const v = spawnSync(py, [join(ROOT, "validation", "xsd-validate.py"), SCHEMA, ...docs.map(d => d.f)], { encoding: "utf8" });
  const results = v.stdout.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  for (const d of docs) {
    const res = results.find(x => x.file === d.f);
    check(`${d.layout}: valid CPACS 3.5.1`, res?.valid === true, res?.errors?.[0] ?? "");
  }
  /* A validator that accepts everything proves nothing. */
  const broken = join(dir, "broken.xml");
  writeFileSync(broken, docs[0].xml.replace(/<mZFM [^\n]*<\/mZFM>/, ""));
  const b = spawnSync(py, [join(ROOT, "validation", "xsd-validate.py"), SCHEMA, broken], { encoding: "utf8" });
  check("…and the validator rejects a document missing a required mass", b.status === 1 && /mZFM/.test(b.stdout));
}

/* ── the mass statement is the engine's ─────────────────────────────── */
const val = (xml, re) => { const m = re.exec(xml); return m ? +m[1] : NaN; };
for (const d of docs) {
  const R = d.r.result, xml = d.xml;
  const mtom = val(xml, /<mTOM uID="mTOM"><mass>([\d.]+)</);
  const oem = val(xml, /<massDescription uID="mOEM"><name>[^<]*<\/name><mass>([\d.]+)</);
  const pay = val(xml, /<massDescription uID="mPayload"><name>[^<]*<\/name><mass>([\d.]+)</);
  const groupTotals = Object.keys(MASS_GROUPS).map(t => val(xml, new RegExp(`<massDescription uID="${t}_total"><name>[^<]*</name><mass>([\\d.]+)<`)));
  const elements = [...xml.matchAll(/<mElement uID="m_(\w+?)_(\w+)"><name>[^<]*<\/name><mass>([\d.]+)</g)];
  const perGroup = Object.fromEntries(Object.keys(MASS_GROUPS).map(t => [t, 0]));
  for (const e of elements) perGroup[e[1]] += +e[3];
  /* The engine publishes MTOW, Wempty and Wbat each rounded to 0.01 kg, so
     their sum can miss MTOW by one rounding step on top of float noise. */
  const ok =
    Math.abs(mtom - R.MTOW) < 1e-3 &&
    Math.abs(oem + pay - R.MTOW) < 0.02 &&
    Math.abs(oem - (R.Wempty + R.Wbat)) < 0.01 &&
    Math.abs(groupTotals.reduce((s, x) => s + x, 0) - oem) < 0.01 &&
    Object.keys(MASS_GROUPS).every((t, i) => Math.abs(perGroup[t] - groupTotals[i]) < 0.01);
  check(`${d.layout}: take-off mass, OEM + payload, and group sums all agree with the engine`, ok,
        `MTOM ${mtom}, OEM ${oem} + payload ${pay}`);
}
const q = docs[0].xml;
check("names are XML-escaped", q.includes("Test &lt;liftcruise&gt; &amp; &quot;quotes&quot;") || q.includes("&lt;") && !q.includes("<liftcruise>"));
check("the header names the engine and the input hash", q.includes(stamp.commit) && q.includes(inputHashOf(docs[0].r.inputs)));
{
  const bad = size({ payload: 900, range: 250, ewf: 0.66, weightModel: "fraction" });
  let threw = false;
  try { generateCPACS({ inputs: bad.inputs, R: bad.result, stamp }); } catch { threw = true; }
  check("a non-converged design is refused, not exported", threw);
}
rmSync(dir, { recursive: true, force: true });

/* ── traceability ──────────────────────────────────────────────────── */
{
  const r = size({ configType: "hybrid" });
  const R = r.result;
  const rows = traceabilityRows(R);
  check("one traceability row per engine check", rows.length === R.checks.length && rows.length > 0, `${rows.length}`);
  check("met / not-met match the checks", rows.filter(x => x.result === "met").length === R.checks.filter(c => c.ok).length);
  const csv = traceabilityCSV({ checks: [{ label: 'A "quoted", label', ok: false, val: "line1\nline2 [SRC X, y]" }] }, { inputHash: "h" });
  const lines = csv.trim().split("\r\n");
  check("CSV quoting survives quotes, commas and newlines",
        lines.length === 3 && lines[2].startsWith('"CHK-001","A ""quoted"", label","criterion","NOT met","line1 line2 [SRC X, y]"'), lines[2]);
  check("a check that cites nothing says so", rows.some(x => x.sources === "(no source cited by the check)"));
  check("citations are extracted, not invented",
        citationsIn("per MOC VTOL.2120 and [SRC NASA TM]").join("|") === "[SRC NASA TM]|MOC VTOL.2120|VTOL.2120"
        && citationsIn("no reference here").length === 0);
}

/* ── the app offers both ──────────────────────────────────────────── */
{
  const app = readFileSync(join(ROOT, "src", "App.jsx"), "utf8");
  check("the app menu offers CPACS and traceability exports",
        /exportInterchange\("cpacs"\)/.test(app) && /exportInterchange\("trace"\)/.test(app) && /runRecord\(record\)/.test(app));
  const verify = readFileSync(join(ROOT, ".github", "workflows", "verify.yml"), "utf8");
  check("CI installs lxml before the gates run", /pip install[^\n]*lxml/.test(verify));
}

console.log("");
console.log(fail ? `EXPORT GATE FAILED: ${fail} check(s)` : `EXPORT GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
