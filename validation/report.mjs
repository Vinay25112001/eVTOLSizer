/* =====================================================================
   VALIDATION REPORT GENERATOR
   =====================================================================
   Emits VALIDATION.md.

   WHY THIS IS A PROGRAM AND NOT A DOCUMENT

   A hand-written validation report drifts from the code the moment either
   one changes, and a stale validation report is worse than none because it
   is confidently wrong. Every number below is captured from a harness run
   at generation time, in this process, and the git commit is stamped into
   the output. If the code changes and the report is not regenerated, the
   commit hash in the header says so.

   The judgement paragraphs -- the eleven NASA-STD-7009B factor levels --
   are authored, because they are judgements. Each one cites evidence
   measured in the same run. They live in ASSESSMENT below so a reader can
   see the claim and the justification in one place, and so that changing a
   claimed level is a reviewable diff.

   STRUCTURE follows NASA-STD-7009B (Standard for Models and Simulations,
   w/Change 1, 5 March 2024) section 4.3.8 and Appendix E -- not anything
   invented here. See research note 24. Section 4.3.8 requires: the best
   estimate, a statement of uncertainty, the capability and results
   assessments, explicit caveats, and the risks of acceptance. [M&S 32]
   requires explicit warnings for unachieved acceptance criteria and
   outstanding defects, which is why this report is REQUIRED to contain a
   section listing what is still wrong.

   Run: node validation/report.mjs
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { reviewFactorLevel } from "../src/lib/review-record.js";
import { OUTPUTS } from "../src/lib/provenance.js";

const STD = "NASA-STD-7009B, Standard for Models and Simulations, w/Change 1, 5 March 2024";

/* The harnesses, in the order `npm test` runs them, each with what it
   PROVES rather than what it is called. The list itself lives in
   harness-manifest.mjs so that report-manifest.mjs can check it against
   package.json without importing this file and running the whole suite. */
import { HARNESSES } from "./harness-manifest.mjs";

/* ── the authored judgements ────────────────────────────────────────────
   7009B scores eleven factors 0-4 across two assessments. The standard is
   explicit that the factors are "nearly orthogonal" and that combining
   them "is not intended and should be avoided in all labeling approaches"
   -- so there is deliberately NO overall score here. A single credibility
   number would violate the standard this report is written to.

   `ceiling` records where a level is capped by the available EVIDENCE
   rather than by the state of the code, so a reader can tell the two
   apart. */
/* The two Technical Review factors are read from docs/reviews/, not typed: a
   favourable informal internal peer review by a peer, recorded in the format
   docs/reviews/README.md states, moves them to 1 (Tables 10 and 19, E.3.5).
   The rule lives in src/lib/review-record.js and validation/review-record.mjs
   gates it on fixtures; nothing here can move the score by editing a string. */
const REVIEW = (() => {
  const dir = new URL("../docs/reviews/", import.meta.url);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md" && f !== "BRIEF.md"); } catch { files = []; }
  return reviewFactorLevel(files.map((f) => ({ file: f, text: readFileSync(new URL(f, dir), "utf8") })));
})();

const CAPABILITY = [
  { factor: "M&S Data Pedigree", level: 2,
    why: "Every one of the engine's outputs carries a machine-readable provenance tag with its citation, and CI fails if an output is emitted untagged, so traceability to formal documentation is enforced rather than asserted. Uncertainty in all tagged inputs is at least estimated, because the band width is derived from the tag class. Level 3 requires ALL data traced to a sufficiently representative referent; inputs tagged [LAY] are by definition assumptions with no referent, so 3 is unavailable while any remain." },
  { factor: "M&S Verification", level: 2,
    why: "Documented practices are applied to all features and run in CI on every push: twenty-one harnesses run on every push, including an identity suite that checks relations the engine must satisfy by definition, a golden master over 277 cases spanning all six configurations, a scope check, tab-reachability and tab-visibility gates, geometry and export gates, per-model component tests, byte-compared 3D renders, EXECUTION of every exported model by OpenVSP, and seven physics harnesses each validated by reproducing a published result rather than by self-consistency. Level 3 requires rigorous end-to-end verification with ALL important errors satisfying requirements; the open defects listed in section 8 are not yet closed, so it is not claimed." },
  { factor: "M&S Validation", level: 2,
    ceiling: true,
    why: "Key outputs compare favorably with a sufficiently similar referent system: ten weight-statement groups across three NASA concept vehicles, plus brochure figures for commercial aircraft. LEVEL 2 IS THE HONEST MAXIMUM AVAILABLE TO THIS PROJECT AND NO CODE CHANGE CAN RAISE IT. Level 3 requires data from the Real World System -- a physical aircraft built, flown and weighed. NASA's concept-vehicle weight statements are NDARC output, i.e. another model's results, and manufacturer figures are brochure claims rather than certified weight statements. Until someone weighs a real eVTOL and publishes the statement, no referent exists that could support level 3." },
  { factor: "M&S Development Technical Review", level: REVIEW.level,
    why: REVIEW.why + (REVIEW.level === 0 ? " This is the lowest score in this assessment and it is accurate." : "") },
  { factor: "M&S Development Process/Product Management", level: 2,
    why: "Formal processes are applied: the source is under version control, every gate runs in CI on every push, changes carry their rationale in the commit message, and the research that justifies each method is written down before the method is built. Level 3 requires controlled processes with compliance measured, which would mean a defined and audited process baseline rather than a convention followed by one developer." },
];

const RESULTS = [
  { factor: "M&S Use Assessment", level: 1,
    why: "The M&S type, application domain and purpose match the proposed use -- conceptual sizing of electric VTOL aircraft -- and the inclusions, exclusions and assumptions are documented and acceptable for it. Level 1 is where a model sits when it has no prior use history, which is the case: this tool has not previously been used for a design decision by anyone." },
  { factor: "M&S Input Pedigree", level: 2,
    why: "Input data are formally traceable through the same provenance registry as the outputs, with estimated uncertainties. Level 3 requires all input data traced to a sufficient referent with acceptable accuracy, precision and uncertainty; the [LAY] inputs are not." },
  { factor: "M&S Uncertainty Characterization", level: 2,
    why: "Sources of uncertainty are identified, expressed quantitatively, classified by provenance class, and propagated two ways: one-at-a-time to an MTOW band with the dominant contributors ranked, and by seeded Latin hypercube over the same bands with the sizing loop re-run per draw (sampled-uncertainty.mjs), which carries the loop's non-linearity and reports P5/P50/P95 as a range with replicates. Level 3 requires propagation of ALL known uncertainty; the band widths are [LAY] assumptions and the untagged and derived inputs are [GAP]s excluded from the propagation and reported separately, so the level-2 wording is the one met and level 3 is not claimed." },
  { factor: "M&S Results Robustness", level: 3,
    why: "Sensitivities are known for many parameters including many of the key ones, by measurement: every sidebar input is perturbed and the full sizing loop re-run, and every provenance-tagged input is perturbed and ranked by its contribution to the band. Level 4 requires most parameters and most key sensitivities; the screen is one-at-a-time and therefore blind to interactions, which it states in its own output, so 4 is not claimed." },
  { factor: "M&S Use/Analysis Technical Review", level: REVIEW.level,
    why: REVIEW.level === 0
      ? "Insufficient evidence, for the same reason as the development review factor. No results produced by this tool have been reviewed by anyone other than its author."
      : "The same record covers this factor: the brief's three questions read the results (VALIDATION.md sections 4 and 7-9 and the abstract's claim gate) as well as the method, so the informal internal peer review that moves the development factor moves this one. " + REVIEW.why },
  { factor: "M&S Use Process/Product Management", level: 2,
    why: "Formal processes are applied: results are reproducible from a stamped commit, the harnesses that produced them run in CI, and this report is generated from those runs rather than written by hand." },
];

/* ── run the harnesses and capture what they actually printed ──────────── */
function run(file) {
  const t0 = Date.now();
  try {
    const out = execFileSync(process.execPath, [`validation/${file}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { file, out, code: 0, ms: Date.now() - t0 };
  } catch (e) {
    return { file, out: (e.stdout || "") + (e.stderr || ""), code: e.status ?? 1, ms: Date.now() - t0 };
  }
}

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
  catch { return null; }
}

console.log("Running the harnesses...");
const runs = HARNESSES.map(([file, proves]) => {
  const r = run(file);
  console.log(`  ${r.code === 0 ? "ok  " : "FAIL"} ${file.padEnd(22)} ${String(r.ms).padStart(6)} ms`);
  return { ...r, proves };
});
const failed = runs.filter(r => r.code !== 0);

/* ── parse the primary validation into a table ─────────────────────────── */
const nasa = runs.find(r => r.file === "nasa-configs.mjs").out;
const vehicles = [];
for (const line of nasa.split(/\r?\n/)) {
  let m = line.match(/^──\s+(.+?)\s{2,}\[(.+)\]\s*$/);
  if (m) { vehicles.push({ name: m[1].trim(), cfg: m[2].trim(), rows: [] }); continue; }
  m = line.match(/^\s{3}(\w+)\s+([\d.]+)\s+(kg|kWh)\s+([\d.]+)\s+(kg|kWh)\s+([+-][\d.]+)%/);
  if (m && vehicles.length) vehicles.at(-1).rows.push({ k: m[1], want: m[2], unit: m[3], got: m[4], err: +m[6] });
}
const nasaSummary = (nasa.match(/^PASS: .*$/m) || [""])[0];

/* ── provenance census ─────────────────────────────────────────────────── */
const prov = {};
for (const k of Object.keys(OUTPUTS)) {
  const s = OUTPUTS[k]?.status || "untagged";
  prov[s] = (prov[s] || 0) + 1;
}
const provTotal = Object.values(prov).reduce((a, b) => a + b, 0);
const validatedKeys = Object.keys(OUTPUTS).filter(k => OUTPUTS[k]?.status === "validated").sort();

const grab = (file, re) => { const m = runs.find(r => r.file === file)?.out.match(re); return m ? m[0].trim() : null; };

/* ── compose ───────────────────────────────────────────────────────────── */
const L = [];
const p = (...s) => L.push(...s);
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty  = git(["status", "--porcelain"]);
const stamp  = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const lvl = a => a.map(f =>
  `| ${f.factor} | **${f.level}**${f.ceiling ? " (capped by evidence)" : ""} | ${f.why} |`).join("\n");

p(`# Validation Report — eVTOL Conceptual Sizing Tool`, ``,
  `**Generated ${stamp} from commit \`${commit || "unknown"}\`${dirty ? " (WORKING TREE DIRTY — this report does not describe a committed state)" : ""}.**`, ``,
  `This document is produced by \`validation/report.mjs\`, which runs every`,
  `harness and captures what each one printed. It is not written by hand. If`,
  `the code changes and this file is not regenerated, the commit hash above`,
  `will not match \`git rev-parse --short HEAD\` and the report is stale.`, ``,
  `Structure and terminology follow **${STD}**, sections 4.3.8 and Appendix E.`, ``,
  `---`, ``,
  `## 1. Purpose and permissible uses`, ``,
  `**Purpose.** Conceptual-stage sizing of electric vertical-take-off-and-landing`,
  `aircraft: given a mission and a configuration, close the weight, energy and`,
  `power loop and report the resulting vehicle with its geometry.`, ``,
  `**Permissible uses.** Trade studies, configuration comparison, sensitivity and`,
  `feasibility screening at the conceptual stage, and teaching. Results are`,
  `appropriate as an input to a decision about which configurations deserve`,
  `further analysis.`, ``,
  `**Uses NOT permitted by the evidence in this report.** Certification credit;`,
  `structural sizing; performance guarantees; any use where the absolute value of`,
  `a mass or an energy is relied upon without the error bands in section 6. The`,
  `models are empirical weight correlations fitted largely to conventional`,
  `rotorcraft, and section 4 measures what that costs on eVTOL configurations.`, ``,
  `**Why no weight-prediction tool can ever carry certification credit for`,
  `weight — this is a property of the regulation, not of this tool.** CS 27.29`,
  `requires that empty weight and the corresponding centre of gravity be`,
  `determined by WEIGHING the rotorcraft, with fixed ballast, unusable fuel and`,
  `full operating fluids, in a condition that is well defined and repeatable.`,
  `CS 27.25 then builds every weight limit on that measured empty weight. The`,
  `compliance evidence is a set of scales. No prediction — this tool's, NDARC's,`,
  `or a manufacturer's — substitutes for it, and a tool that implied otherwise`,
  `would be misrepresenting the certification basis rather than merely being`,
  `inaccurate.`, ``,
  `That is what makes "is it accurate enough to certify?" the wrong question.`,
  `The right one is whether it is accurate enough for the DESIGN DECISION it`,
  `informs — which configurations deserve further analysis — and that is what`,
  `section 4 measures and section 6 bands.`, ``,
  `---`, ``,
  `## 2. Referents and their pedigree`, ``,
  `**This is the most important section for a reader deciding how much to trust`,
  `the numbers, and it is deliberately placed before the results.**`, ``,
  `| referent | what it actually is | pedigree |`,
  `|---|---|---|`,
  `| NASA UAM concept vehicles (NASA/TM-20210017971 Table 12) | published weight statements for eight concept variants | **Model output, not measured hardware.** These statements are themselves NDARC results. Agreement with them demonstrates that this tool reproduces the reference method; it does not demonstrate agreement with a real aircraft. |`,
  `| Joby S4, Archer Midnight and other commercial types | manufacturer-published MTOW, span, pack energy, range | **Brochure figures, not certified weight statements.** Quoted under unstated mission conventions, which is why the harness brackets mission convention explicitly rather than scoring a single number. |`,
  `| NASA OpenVSP models (RAVEN, SWFT) | published geometry files | Measured directly from the distributed \`.vsp3\` files. The strongest pedigree among the aircraft referents, and it constrains shape rather than mass. |`,
  `| EASA type-certificate data sheets (EASA.E.234 Issue 01, E-811 motor; EASA.A.573 Issue 13, Velis Electro) | certified dry weights and ratings of the one type-certified electric aero engine and its propeller | **Measured hardware, certified by an authority — the only such referent on the eVTOL side, and it is not a VTOL.** Motor 22.7 kg and power controller 7 kg at 220 N·m (57.6 kW at 2500 rpm); propeller P-812, three blades, 1.64 m, 4.88 kg. It checks two electric-propulsion models component by component (\`components.mjs\`, certified hardware) and says nothing about VTOL structure or rotors. No type-certified eVTOL has a public weight statement: the EH216-S data sheet is held inside CAAC's AMOS system, and Joby's certificate is expected late 2026. |`, ``,
  `**Consequence, stated plainly: no AIRCRAFT referent available to this project`,
  `is a Real World System in the sense NASA-STD-7009B means — one that was built,`,
  `flown and weighed. The one measured referent is a motor and a propeller, which`,
  `constrains two component models and says nothing about a VTOL airframe. That`,
  `caps the Validation factor in section 7 at level 2 permanently, regardless of`,
  `any further work on the code.**`, ``,
  `---`, ``,
  `## 3. Verification`, ``,
  `${runs.length} harnesses, all gated in \`npm test\` and run in CI on every push.`, ``,
  `| harness | what it proves | result |`,
  `|---|---|---|`);
for (const r of runs) p(`| \`${r.file}\` | ${r.proves} | ${r.code === 0 ? "pass" : "**FAIL**"} |`);

p(``, `---`, ``,
  `## 4. Validation — every published comparison`, ``,
  `Each vehicle is sized from **its own published parameters**, then ten groups`,
  `of its published weight statement are scored. Nothing is tuned per vehicle.`, ``,
  nasaSummary ? `**${nasaSummary}**` : `**The primary validation harness did not report a summary — see section 8.**`, ``);
for (const v of vehicles) {
  p(`### ${v.name}`, ``, `\`${v.cfg}\``, ``,
    `| group | published | this tool | error |`, `|---|---|---|---|`);
  for (const r of v.rows)
    p(`| ${r.k} | ${r.want} ${r.unit} | ${r.got} ${r.unit} | ${r.err > 0 ? "+" : ""}${r.err.toFixed(1)}%${Math.abs(r.err) <= 5 ? " ✓" : ""} |`);
  p(``);
}
p(`**How to read a large error.** \`struct\` aggregates several groups, so a good`,
  `\`struct\` number can hide offsetting component errors — that is exactly what`,
  `happened before the rotor group was scored separately, where a −46.7% rotor`,
  `error was cancelling inside a −0.7% structures total. Component-level results`,
  `in \`components.mjs\` measure each model alone, with no sizing loop around it,`,
  `and are the right place to attribute a group error to a model.`, ``,
  `### Commercial aircraft, brochure-grade`, ``,
  `\`\`\``,
  (grab("validate.mjs", /Scored metrics[\s\S]*?Worst\s+:.*/m) || "(no summary parsed)"),
  `\`\`\``, ``,
  `The two mean errors are the same aircraft scored two ways — the fraction-based`,
  `empty-weight model and the component buildup — reported side by side so the`,
  `cost of the simpler method is visible rather than assumed.`, ``,
  `---`, ``,
  `## 5. Provenance of every output`, ``,
  `Every value the engine emits carries a machine-readable status. CI fails if an`,
  `output is emitted without one.`, ``,
  `| status | count | share |`, `|---|---|---|`);
for (const [k, v] of Object.entries(prov).sort((a, b) => b[1] - a[1]))
  p(`| ${k} | ${v} | ${(100 * v / provTotal).toFixed(0)}% |`);
p(``,
  `**\`validated\` means one thing only: the value has been numerically compared`,
  `to a published figure and the error is recorded.** ${validatedKeys.length} of ${provTotal} outputs`,
  `(${(100 * validatedKeys.length / provTotal).toFixed(0)}%) meet that bar:`, ``,
  validatedKeys.map(k => `\`${k}\``).join(", "), ``,
  `The remaining outputs are derived from validated quantities, sourced from`,
  `literature, calibrated, or assumed — the table above says which. A reader`,
  `should treat an output's status as the first thing to check before relying`,
  `on it, and the low validated share as the honest state of the art here`,
  `rather than an oversight: most conceptual-sizing outputs have no published`,
  `counterpart to compare against at all.`, ``);

p(`---`, ``,
  `## 6. Uncertainty and sensitivity`, ``,
  `Method: non-intrusive forward propagation by one-at-a-time perturbation of`,
  `every provenance-tagged input, re-running the full sizing loop each time, with`,
  `band widths taken from the provenance class rather than chosen per input. The`,
  `ranking of contributors is therefore sourced from the same registry CI`,
  `enforces, and an input cannot quietly acquire a narrow band.`, ``,
  `This is the same family of method NASA applies to NDARC itself (Khurana,`,
  `Russell & Scott, *Uncertainty Quantification of a Rotorcraft Conceptual Sizing`,
  `Toolsuite*): forward propagation, Latin hypercube sampling, global sensitivity`,
  `attribution. That paper also reports a result worth repeating here — NDARC's`,
  `deterministic baseline did not coincide with the mean of its Monte Carlo`,
  `ensemble. **A single-point answer from this tool is exposed to the same effect,`,
  `so the band should be read alongside the point, not instead of it.**`, ``,
  `**Stated limitation, per [M&S 33]:** the screen is one-at-a-time and is`,
  `therefore blind to interactions between inputs. Where inputs interact, the`,
  `true band is wider than the reported one. The Design Space layer samples`,
  `jointly and is the right tool for that question.`, ``,
  `---`, ``,
  `## 7. Credibility assessment (NASA-STD-7009B Appendix E)`, ``,
  `Scored 0–4 on the standard's own scale, where **0 means "insufficient`,
  `evidence" and is a legitimate, reportable outcome.** The standard "levies no`,
  `requirements with respect to what levels to achieve … merely that the levels`,
  `be determined and reported" (§4.3.6).`, ``,
  `**There is deliberately no overall score.** The standard states that the`,
  `factors are nearly orthogonal and that combining them "is not intended and`,
  `should be avoided in all labeling approaches". Any single credibility number`,
  `would violate the standard this report is written to.`, ``,
  `### 7.1 Capability assessment (outcome of development)`, ``,
  `| factor | level | justification |`, `|---|---|---|`, lvl(CAPABILITY), ``,
  `### 7.2 Results assessment (outcome of use)`, ``,
  `| factor | level | justification |`, `|---|---|---|`, lvl(RESULTS), ``,
  `### 7.3 The two zeros`, ``,
  `Both technical-review factors are **0**. No part of this work — not the`,
  `methods, not the code, not the results — has been reviewed by anyone other`,
  `than its author. Under 7009B even level 1 requires a favorable *informal`,
  `internal* peer review, and self-review does not qualify.`, ``,
  `This is reported first among the weaknesses because it is the one a reader`,
  `cannot verify for themselves from the repository, and because it is the`,
  `weakness that no further engineering can remove.`, ``);

/* Section 8 is REQUIRED by [M&S 32]. The list of out-of-tolerance metrics is
   generated from the same run as section 4, so it cannot fall out of step
   with the results it qualifies. */
const outOfTol = [];
for (const v of vehicles) for (const r of v.rows)
  if (Math.abs(r.err) > 5) outOfTol.push({ v: v.name, ...r });
outOfTol.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));

p(`---`, ``,
  `## 8. Caveats, limits and open defects`, ``,
  `Required by [M&S 32]: explicit warnings for unachieved acceptance criteria,`,
  `violated assumptions, violated limits and outstanding defects. **A validation`,
  `report without this section is not compliant with the standard it cites.**`, ``,
  `### 8.1 Metrics outside ±5% (generated from this run)`, ``);
if (!outOfTol.length) p(`None.`, ``);
else {
  p(`| vehicle | group | published | this tool | error |`, `|---|---|---|---|---|`);
  for (const r of outOfTol)
    p(`| ${r.v} | ${r.k} | ${r.want} ${r.unit} | ${r.got} ${r.unit} | **${r.err > 0 ? "+" : ""}${r.err.toFixed(1)}%** |`);
  p(``);
}
p(`### 8.2 Known limitations of the models`, ``,
  `- **The weight models are empirical correlations fitted mostly to`,
  `  conventional rotorcraft, and eVTOLs are out of that population.** This is`,
  `  measured rather than asserted: \`components.mjs\` scores each model against`,
  `  its own fitting population and against eVTOLs separately, and the`,
  `  degradation is reported. The rotor group is the counter-example that keeps`,
  `  this honest: a −46.7% lift+cruise rotor error was once read as the method`,
  `  being out of population, and it was the INPUTS — NASA's own NDARC decks`,
  `  publish blade count, flap frequency, chord law and technology factors, and`,
  `  with them AFDD82 reproduces five of seven reference rotor groups within`,
  `  2.2% (\`rotor-group.mjs\`). The lift+cruise rotor remains +15% with every`,
  `  deck input and is reported as a residual, not fitted.`,
  `- **No type-certified eVTOL has a public weight statement** (September 2026).`,
  `  The EH216-S data sheet is held inside CAAC's AMOS system, Joby's certificate`,
  `  is expected late 2026, and no flight-test paper publishes a weighed empty`,
  `  weight for a passenger eVTOL. That is a limit of the world, not of the`,
  `  corpus. The measured hardware that does exist — the Velis Electro's E-811`,
  `  motor and P-812 propeller, certified and weighed — is compared in`,
  `  \`components.mjs\` (certified hardware) and reported, not fitted: the`,
  `  default motor fit is light against the certified motor at its certified`,
  `  torque, and the [CAL] propeller constant is light against the certified`,
  `  propeller, each by the amount printed there.`,
  `- **Mission convention moves the answer more than most modelling choices.**`,
  `  Published range and pack figures are quoted under conventions that are`,
  `  usually unstated. The harness brackets the convention rather than scoring`,
  `  one interpretation, and an aircraft whose brochure triple cannot close`,
  `  under ANY convention is reported as such instead of being fitted.`,
  `- **One-at-a-time uncertainty is blind to interactions** (section 6).`,
  `- **Geometry is conceptual.** The shapes are sized from the design`,
  `  variables and checked for overlap, connectivity and agreement with`,
  `  published NASA models. They are not structurally analysed, and the booms in`,
  `  particular are idealised as free cantilevers where a real airframe is a`,
  `  braced frame — an open question recorded in the research notes, not a`,
  `  settled model.`,
  `- **The aerodynamics are partly computed, and which part is stated exactly.**`,
  `  For every winged eVTOL layout the cruise L/D the sizing loop closes on is`,
  `  COMPUTED: skin friction from the turbulent flat-plate law with Raymer's`,
  `  form factors, the rotorcraft drag areas (hub, stopped blade, gear) in`,
  `  NDARC's form, and induced drag on a span efficiency computed from the`,
  `  planform (Howe). The L/D slider is a target shown beside the computed`,
  `  value, not an input to the loop; \`validate.mjs\` prints the two side by`,
  `  side for every validated aircraft, and \`useTargetLD\` restores the legacy`,
  `  behaviour. NOT computed: the rotor-borne layouts' L/De, calibrated to NASA`,
  `  Table 12 and tagged so, and the hub and stopped-blade drag coefficients,`,
  `  which are [CAL] because NDARC leaves them as user inputs. The NASA`,
  `  benchmark forces each vehicle onto its PUBLISHED L/De, because NASA's`,
  `  L/De = W·V/P folds in propulsive efficiency and is the only cruise-`,
  `  efficiency figure Table 12 publishes — a like-for-like choice for the`,
  `  benchmark, not evidence that the tool cannot compute L/D. What that`,
  `  computation is worth is measured, not assumed: on the NASA lift+cruise it`,
  `  gives an aerodynamic L/D of 10.6 against NDARC's 9.9 for the closely`,
  `  related RVLT design, about 7% optimistic, recorded as an open gap in`,
  `  \`nasa-vehicles.js\`. The vortex-lattice polar (\`vspaero.mjs\`) is a CHECK`,
  `  on the planform's lift-curve slope, span efficiency and induced drag, not`,
  `  the loop's source of them: it is inviscid, it does not give viscous drag,`,
  `  separation or stall, and the fuselage is deliberately excluded with its`,
  `  drag left to the NDARC drag areas. It found a real defect on its first`,
  `  clean run — every exported wing had an aspect ratio 65% below the sized`,
  `  value — which is the argument for having it, and also a reminder that it`,
  `  is new.`,
  `- **Failure analyses are hover-linearised and steady.** Controllability`,
  `  (ACAI), drive-system redistribution and autorotation are all evaluated`,
  `  about a trimmed hover. None models the transient DURING the failure, and`,
  `  NASA measured 2.9-3.8x hover power demand in that transient against the`,
  `  steady share these compute. Steady capability is necessary, not sufficient.`,
  `- **Named gaps that are open by choice, not oversight.** NDARC's twin-rotor`,
  `  interference is computed but its WEIGHT consequence is not charged,`,
  `  because the only published drive weight contradicts it. The side-by-side`,
  `  carries no tail, because fitting one needs a boom the fuselage weight model`,
  `  would over-charge. Rotor spin order decides fault tolerance; the engine`,
  `  accepts one and can search for the best, but no control in the app sets`,
  `  it. Each is recorded where it bites, with its measurement.`, ``,
  `### 8.3 What "±5%" means here`, ``,
  `The ±5% figure used throughout is an **acceptance criterion applied to`,
  `comparisons against published data**, adopted as a standing project rule. It`,
  `is not a claim that any individual answer is accurate to 5%. The count of`,
  `metrics meeting it, and the errors of those that do not, are both reported`,
  `above; neither is summarised into a pass.`, ``);

p(`---`, ``,
  `## 9. Risks of accepting these results`, ``,
  `Required by [M&S 49].`, ``,
  `1. **No independent review.** The dominant risk. Every method choice,`,
  `   every boundary between weight groups and every acceptance threshold was`,
  `   set by one person. The harnesses check internal consistency and agreement`,
  `   with published data; they cannot catch a mistake shared between the model`,
  `   and the person checking it.`,
  `2. **Validating against another model's output.** Agreement with the NASA`,
  `   concept vehicles shows this tool reproduces NDARC's answers. If NDARC is`,
  `   wrong for a configuration, this tool will be wrong the same way and the`,
  `   benchmark will report agreement.`,
  `3. **Out-of-population extrapolation.** A user can size a vehicle far from`,
  `   anything in the validation set. The tool reports when a model is`,
  `   extrapolating, but the error in that regime is unmeasured.`,
  `4. **Brochure referents may be inconsistent.** Manufacturer figures are not`,
  `   audited and may not describe one self-consistent aircraft; the harness`,
  `   tests this and reports when a published triple cannot close.`, ``,
  `---`, ``,
  `## Appendix A — verbatim harness output`, ``,
  `Everything below is captured from the run that produced this document.`, ``);
for (const r of runs)
  p(`<details><summary><code>${r.file}</code> — exit ${r.code}, ${r.ms} ms</summary>`, ``,
    "```", r.out.replace(/\r/g, "").trimEnd(), "```", ``, `</details>`, ``);

/* `--check` regenerates the report and compares it with the committed copy, so
   a code change that alters the results cannot be merged while VALIDATION.md
   still describes the old ones. The generated-at line and every measured
   duration are normalised out first, since those legitimately differ between
   two runs of identical code.

   THE COMMIT HASH AND DIRTY FLAG MUST BE NORMALISED FOR THE SAME REASON, and
   until they were, this check could never pass on a clean checkout — which is
   the only thing CI ever runs. api.mjs reports the build's provenance, so the
   report embeds the working copy's HEAD in two places:

       "commit":"<sha>","dirty":<bool>        the API version record
       evtol-size v0.2.0-dev (commit <sha>)   the CLI --version line

   The report is necessarily generated BEFORE the commit that contains it, so a
   committed VALIDATION.md carries its PARENT's hash. Re-running the check after
   that commit regenerates the file with HEAD's hash instead, and the two can
   never agree: a file cannot contain the hash of the commit that contains it.
   Verified against history — the embedded hash was the parent's on every one of
   the last eight commits that touched VALIDATION.md, so report:check had failed
   on a clean tree for its entire existence while passing locally in the dirty
   window between `npm run report` and `git commit`. That is why a report
   believed to be green kept blocking deploy.yml.

   Normalising these does not weaken the gate: the provenance line is about
   WHICH build produced the report, never about what the harnesses computed,
   and every result in the report is still compared verbatim. */
/* THE CHANGE FENCE IS ABOUT GIT TOPOLOGY, NOT ABOUT RESULTS, so it is
   normalised for the same reason the commit hash is. aircraft-classes.mjs
   prints one of three different lines depending on where it is run: "on
   master", "no git history or no master branch here", or a PASS/FAIL naming
   the current branch. A CI runner checks out ONE branch and has no `master`,
   so it always takes the second; a report generated on master always carries
   the first. The two can never agree, and report:check compares the file
   byte for byte, so this alone kept the gate red on the runner while passing
   locally - the same class of failure the commit-hash note above describes,
   and it cost a green build to find because the check said only "STALE".
   What the fence GUARDS is unaffected: it still runs, and still fails a
   branch that moved the engine or the snapshot. Only its report line is
   collapsed, because which branch produced the report is not a result. */
/* WHICH PYTHON, NOT WHETHER PYTHON. The CPACS schema check reports the
   interpreter it found, and that is "python" on Windows and "python3" on the
   Linux runner. The check PASSES on both -- the line records the name of the
   binary, so comparing it byte for byte asks the runner to have been
   installed the same way as the machine that wrote the report. */
const NORM = t => t
  .replace(/^(\s*PASS\s+a Python with lxml is available to validate against the schema\s+—\s+)\S+\s*$/gm,
           "$1<python>")
  .replace(/^\s*SKIP\s+change fence —.*$/gm, "  SKIP  change fence <branch-dependent>")
  .replace(/^\s*(?:PASS|FAIL)\s+on "[^"]*": eVTOL engine, defaults and golden snapshot unchanged since master.*$/gm,
           "  SKIP  change fence <branch-dependent>")
  .replace(/^\*\*Generated .*$/m, "**Generated <stamp>**")
  .replace(/\d+(\.\d+)?\s?ms\b/g, "<t> ms")
  .replace(/"commit":"[0-9a-f]{7,40}"/g, '"commit":"<sha>"')
  .replace(/"dirty":(?:true|false)/g, '"dirty":<dirty>')
  .replace(/commit [0-9a-f]{7,40}(, uncommitted changes)?/g, "commit <sha>")
  .replace(/\r/g, "");
/* `let`, because --check may drop tool-gated sections from it below. The file
   WRITTEN by a normal run is always the full report; only the comparison
   copy is ever reduced. */
let body = L.join("\n") + "\n";

/* A HARNESS THAT CANNOT RUN HERE IS NOT A HARNESS THAT DISAGREES.

   vsp-run.mjs and vspaero.mjs EXECUTE OpenVSP, which is deliberately not a
   dependency of this project: both print "SKIPPED — no vspscript.exe found"
   and pass when it is absent. So a report generated on a machine that HAS
   OpenVSP records six configurations built and a VSPAERO polar solved, and a
   CI runner that does not have it records the skip instead. Those two files
   differ by 2,274 lines and no amount of re-running makes them converge --
   report:check was asking the runner to reproduce a tool it does not have.

   Regenerating the report without OpenVSP would fix the check by DELETING the
   evidence: the committed report is the stronger record precisely because the
   models really were built. So the sections a harness SKIPPED FOR A MISSING
   TOOL *in this environment* are excluded from the comparison on both sides,
   by name, and the check says which and why. Everything else is still
   compared verbatim, and on a machine that has OpenVSP nothing is excluded at
   all -- the full report is still verified where it is generated.

   The exclusion is driven by THIS BUILD's output, never by the committed
   file, so a committed report cannot suppress its own comparison. */
const TOOL_MISSING = /SKIPPED — no vspscript\.exe found/;
const SECTION = /<details><summary><code>([\w.@-]+)<\/code>[\s\S]*?<\/details>/g;

function toolGatedHere(text) {
  const names = new Set();
  for (const m of text.matchAll(SECTION)) if (TOOL_MISSING.test(m[0])) names.add(m[1]);
  return names;
}
const dropSections = (text, names) =>
  names.size === 0 ? text
    : text.replace(SECTION, (whole, name) =>
        names.has(name)
          ? `<details><summary><code>${name}</code></summary>\n<skipped: tool not available in this environment>\n</details>`
          : whole);

if (process.argv.includes("--check")) {
  let committed = null;
  try { committed = readFileSync("VALIDATION.md", "utf8"); } catch {}
  if (committed == null) {
    console.log("\nFAIL: VALIDATION.md does not exist. Run `npm run report`.");
    process.exit(1);
  }
  const gated = toolGatedHere(body);
  if (gated.size) {
    console.log(`\nNOTE: ${gated.size} harness section(s) not compared, because the tool they`);
    console.log("      execute is absent HERE and they skipped rather than ran:");
    for (const n of gated) console.log(`        ${n}  — needs OpenVSP (vspscript.exe)`);
    console.log("      Every other section is compared verbatim. On a machine with the");
    console.log("      tool installed, nothing is excluded.");
    committed = dropSections(committed, gated);
    body = dropSections(body, gated);
  }
  if (NORM(committed) !== NORM(body)) {
    console.log("\nFAIL: VALIDATION.md is STALE - the code no longer produces it.");
    console.log("      The committed report describes results this build does not");
    console.log("      reproduce. Run `npm run report` and commit the result.");

    /* SAY WHAT DIFFERS. This used to fail with the message above and nothing
       else, which is close to useless when the check passes on the machine
       that generated the report and fails on the runner: the one environment
       that can see the difference is the one that cannot be inspected. The
       lines are printed through JSON.stringify so whitespace, stray CR and
       non-ASCII show up as escapes rather than looking identical on screen. */
    const a = NORM(committed).split("\n"), b = NORM(body).split("\n");
    const cut = (s) => (s === undefined ? "(no such line)" : JSON.stringify(s.slice(0, 160)));
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
      if (a[i] === b[i]) continue;
      console.log(`\n      line ${i + 1}:`);
      console.log(`        committed: ${cut(a[i])}`);
      console.log(`        this build: ${cut(b[i])}`);
      shown++;
    }
    if (a.length !== b.length)
      console.log(`\n      line count: committed ${a.length}, this build ${b.length}`);
    console.log(`\n      ${a.reduce((n, l, i) => n + (l !== b[i] ? 1 : 0), 0)} differing line(s) in total.`);
    process.exit(1);
  }
  console.log("\nPASS: VALIDATION.md matches what the harnesses produce now");
  process.exit(failed.length ? 1 : 0);
}
writeFileSync("VALIDATION.md", body, "utf8");
const kb = (L.join("\n").length / 1024).toFixed(0);
console.log(`\nWrote VALIDATION.md (${kb} kB) from commit ${commit || "unknown"}${dirty ? " [DIRTY]" : ""}`);
console.log(`  ${vehicles.length} vehicles, ${vehicles.reduce((a, v) => a + v.rows.length, 0)} published comparisons parsed`);
console.log(`  ${outOfTol.length} metric(s) outside +/-5%, listed in section 8.1`);
console.log(`  provenance: ${validatedKeys.length} validated of ${provTotal}`);

if (!vehicles.length || !vehicles.every(v => v.rows.length)) {
  console.log(`\nFAIL: the validation table came out empty - the harness output format changed`);
  console.log(`      and the parser in report.mjs no longer matches it. The report would`);
  console.log(`      have been published with no results in section 4.`);
  process.exit(1);
}
if (failed.length) {
  console.log(`\nFAIL: ${failed.map(f => f.file).join(", ")} did not pass; the report describes a failing build`);
  process.exit(1);
}
console.log(`\nPASS: report generated, all ${runs.length} harnesses green`);
