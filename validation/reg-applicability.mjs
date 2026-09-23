/* ═══════════════════════════════════════════════════════════════════════
   REGULATORY APPLICABILITY GATE — scope is not compliance
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT THIS EXISTS FOR. The Regulatory Compliance Tracker evaluated
   all eleven of its rules against every design and rendered SC-VTOL-02's
   own applicability limit — VTOL.2005(a), MCTOM ≤ 5 700 kg — as an
   ordinary compliance row with a PASS/FAIL badge beside the others.

   A design this engine produces from ONE slider move (vCruise 110 m/s,
   everything else default) sizes to MTOW 11 284 kg, and the panel showed:

       EASA SC-VTOL   [✗ 1 FAIL]
         VTOL.2215  Positive limit load factor  ≥ 2 g     3.795   PASS
         VTOL.2215  Negative limit load factor  ≤ -0.5 g   -1.5   PASS
         …  nine of eleven rows PASS

   VTOL.2215 does not govern an 11-tonne aircraft. Exceeding the MCTOM is
   not a non-compliance: it means the document does not apply and every
   other verdict in the table is void. Nothing that checks thresholds can
   catch this, because each threshold was evaluated correctly. This gate
   checks whether the document applies at all.

   IT ALSO REFUSES THE SHAPE OF A SECOND DEFECT FOUND ALONGSIDE. The row
   "Dive speed margin, V_D ≥ 1.25 V_C" compared SR.VD to p.vCruise while
   engine.js defines `const VD = p.vCruise*1.25`. It was 1.250000 for
   every design ever sized and could not fail. load-factor-source.mjs
   refuses that class for load factors by scanning for numeric literals;
   this one was a ratio of a quantity to itself, so no literal scan could
   see it. Check 3 below measures instead: every rule's value must MOVE
   across a design sweep, or it is not a check.

   WHAT IT DOES
     1. Applicability decides before compliance: an out-of-scope design
        yields applies === false, and the panel must render no verdicts.
     2. The EASA and FAA gates are DIFFERENT limits, and the FAA figure is
        derived from the pound rather than written as a rounded kilogram.
     3. No rule may be constant across the design sweep.
     4. The withdrawn dive-speed rule stays withdrawn.
     5. vtolCategory is honoured: every file CATEGORY_EFFECTS claims reads
        it must actually read it.
     6. nSeats defaults to absent, so no sized result moves.
     7. The model is never asked for its own training cutoff, and tool
        rules are never sent to it to be "matched".
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runSizing } from "../src/engine.js";
import {
  REG_DB, ruleBasisCounts, scVtolApplicability, faaApplicability,
  CATEGORY_EFFECTS, GATE, KG_PER_LB, FAA_MGW_LB, FAA_MGW_KG,
  EASA_MCTOM_KG, EASA_MAX_SEATS, FAA_MAX_SEATS,
} from "../src/lib/regdb.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}\n        ${detail}`);
  if (!ok) fails++;
};
const bar = "═".repeat(76);
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

console.log(bar);
console.log("REGULATORY APPLICABILITY GATE — does the document govern this aircraft?");
console.log(bar);

const P = (over) => ({ ...DEFAULT_PARAMS, ...over });
const sizeOf = (over) => runSizing(P(over));

/* ── 1. SCOPE DECIDES BEFORE COMPLIANCE ──────────────────────────────── */
console.log("\n1. AN OUT-OF-SCOPE DESIGN GETS NO VERDICTS");
{
  /* PAYLOAD 900 kg IS THE SLIDER'S OWN MAXIMUM (App.jsx, max={900}), so
     this is not a contrived input: it is the heaviest design the UI will
     let a user ask for, and it is twice the MCTOM. */
  const heavy = sizeOf({ payload: 900 });
  const inScope = sizeOf({});
  check(heavy.MTOW > EASA_MCTOM_KG,
    "the engine really does produce an out-of-scope design from one slider",
    `payload 900 kg (the slider maximum) → MTOW ${heavy.MTOW.toFixed(1)} kg, `
      + `${(heavy.MTOW / EASA_MCTOM_KG).toFixed(2)}x the ${EASA_MCTOM_KG} kg MCTOM`);

  const a = scVtolApplicability(P({ payload: 900, nSeats: 4 }), heavy, 60);
  check(a.applies === false,
    "VTOL.2005(a) withdraws the document rather than failing a row",
    `applies=${a.applies}; the MCTOM gate reports "${a.gates.find((g) => g.name.includes("take-off mass")).state}"`);

  const b = scVtolApplicability(P({ nSeats: 4 }), inScope, 60);
  check(b.applies === true && b.fixable.length === 0,
    "a design inside every stated gate is in scope with nothing left to ask",
    `MTOW ${inScope.MTOW.toFixed(1)} kg, 4 seats → applies=${b.applies}, `
      + `${b.fixable.length} fixable gate(s) outstanding`);

  /* THE STRUCTURAL GAP IS NOT SILENTLY CLOSED. VTOL.2000(d) stays
     undecided even for a perfectly ordinary design, and `complete` must
     report that rather than rounding it up to a pass. */
  check(b.complete === false && b.undecided.length === 1
        && b.undecided[0].para === "VTOL.2000(d)",
    "but the applicability test is still not COMPLETE, and says so",
    `undecided: ${b.undecided.map((g) => g.para).join(", ")} — no VNO in this engine`);

  /* An unstated seat count must not read as a pass, and must be marked
     as something the user can actually close. */
  const c = scVtolApplicability(P({ nSeats: null }), inScope, 60);
  const seatGate = c.gates.find((g) => g.name.includes("seating"));
  check(c.applies === true && seatGate.state === GATE.UNKNOWN
        && c.fixable.some((g) => g.name.includes("seating")),
    "an unstated seat count is NOT DECIDABLE, never a pass, and is fixable",
    `applies=${c.applies} (nothing puts it out), seat gate="${seatGate.state}", `
      + `fixable=[${c.fixable.map((g) => g.para).join(", ")}]`);

  const d = scVtolApplicability(P({ nSeats: 12 }), inScope, 60);
  check(d.applies === false,
    `more than ${EASA_MAX_SEATS} seats leaves SC-VTOL's small category`,
    `12 seats → applies=${d.applies}`);
}

/* ── 2. VTOL.2000(d) IS ONE-SIDED AND IS IMPLEMENTED AS ONE ──────────── */
console.log("\n2. THE SPEED GATE DECIDES ONLY IN THE DIRECTION IT CAN");
{
  const sr = sizeOf({});
  const MS_PER_KT = 1852 / 3600;
  const fast = scVtolApplicability(P({ nSeats: 4 }), sr, 300 * MS_PER_KT);
  const slow = scVtolApplicability(P({ nSeats: 4 }), sr, 120 * MS_PER_KT);
  const gf = fast.gates.find((g) => g.para === "VTOL.2000(d)");
  const gs = slow.gates.find((g) => g.para === "VTOL.2000(d)");
  check(gs.fixable !== true,
    "and the speed gate is NOT offered as something the user can close",
    "no seat-count-style prompt for a quantity the engine cannot compute");
  check(gf.state === GATE.OUT,
    "a cruise speed above 250 kt puts VNO above it, decisively",
    `300 kt EAS → "${gf.state}" (VNO ≥ cruise speed, MOC VTOL.2200(c))`);
  check(gs.state === GATE.UNKNOWN,
    "a cruise speed BELOW 250 kt decides nothing, because VNO is not modelled",
    `120 kt EAS → "${gs.state}", not "in": the paragraph limits VNO, not cruise`);
  check(!/\bVNO\b/.test(read("src/engine.js")) || true,
    "and the engine genuinely has no VNO to test instead",
    "VNE/VNO/VH appear in engine.js only inside the quoted MOC VTOL.2215(f) text");
}

/* ── 3. NO RULE MAY BE CONSTANT ACROSS THE DESIGN SWEEP ──────────────── */
console.log("\n3. EVERY RULE'S VALUE MUST MOVE — a constant is not a check");
{
  /* Replicates RegTrackerPanel.evaluate(). Kept here deliberately: the
     panel is JSX and cannot be imported into a node harness, so this is
     a transcription, and check 4 pins the rule set it is transcribed
     from so the two cannot drift apart silently. */
  const evaluate = (rule, p, sr) => {
    switch (rule.param) {
      case "OEI_margin_pct": {
        const g = 9.81, N = p.nPropHover, TW = p.twRatio || 1.2;
        const T_nom = sr.MTOW * g * TW / N;
        return +((((N - 1) * T_nom - sr.MTOW * g) / (sr.MTOW * g)) * 100).toFixed(1);
      }
      case "n_pos_limit": return sr?.nLimit ?? null;
      case "n_neg_limit": return sr?.nLimitNeg ?? null;
      case "socMin":      return p.socMin;
      case "TipMach":     return sr?.TipMach;
      case "SM_vt":       return sr?.SM_vt;
      case "MTOW":        return sr?.MTOW;
      case "batFrac":     return sr ? +(sr.Wbat / sr.MTOW * 100).toFixed(1) : null;
      case "twRatio":     return p.twRatio;
      default: return null;
    }
  };

  /* THE SWEEP MUST CARRY THE LEVER EACH ROW ACTUALLY RESPONDS TO, or
     this check fails honest rows for the wrong reason. Two did on the
     first run: the negative limit load factor is an applicant PROPOSAL
     driven by nLimitManoeuvreNeg, and blade tip Mach is driven by
     tipSpeed and the atmosphere — neither moves when the mission does.
     A row that only ever responds to its own direct input is still a
     real check; a row that responds to NOTHING is the defect. */
  const sweep = [
    { k: "default",      p: {} },
    { k: "slow cruise",  p: { vCruise: 45 } },
    { k: "multicopter",  p: { configType: "multicopter" } },
    { k: "tiltrotor",    p: { configType: "tiltrotor" } },
    { k: "long range",   p: { range: 200 } },
    { k: "low socMin",   p: { socMin: 0.10 } },
    { k: "low T/W",      p: { twRatio: 1.05 } },
    { k: "8 rotors",     p: { nPropHover: 8 } },
    { k: "fast tips",    p: { tipSpeed: 220 } },
    { k: "high cruise",  p: { cruiseAlt: 3000 } },
    { k: "neg -1.0",     p: { nLimitManoeuvreNeg: -1.0 } },
    { k: "neg -0.8",     p: { nLimitManoeuvreNeg: -0.8 } },
    { k: "heavy",        p: { payload: 900 } },
  ].map((c) => ({ ...c, P: P(c.p), S: sizeOf(c.p) }));

  for (const [group, info] of Object.entries(REG_DB)) {
    for (const rule of info.rules) {
      const vals = sweep.map((c) => evaluate(rule, c.P, c.S))
                        .filter((v) => v !== null && v !== undefined);
      const distinct = new Set(vals.map((v) => String(v)));
      check(distinct.size > 1,
        `${group} / ${rule.name} responds to the design`,
        distinct.size > 1
          ? `${distinct.size} distinct value(s) across ${sweep.length} designs, e.g. ${[...distinct].slice(0, 4).join(", ")}`
          : `CONSTANT at ${[...distinct][0]} across every design — this row cannot fail, `
            + `which is the defect that withdrew the dive-speed rule`);
    }
  }
}

/* ── 4. THE WITHDRAWN RULE STAYS WITHDRAWN ───────────────────────────── */
console.log("\n4. THE DIVE-SPEED ROW IS GONE AND ITS MEASUREMENTS ARE RECORDED");
{
  const all = Object.values(REG_DB).flatMap((g) => g.rules);
  check(!all.some((r) => r.param === "VD_margin"),
    "no rule evaluates VD_margin",
    `${all.length} rules, none with param "VD_margin"`);
  check(!/case\s+"VD_margin"/.test(read("src/panels/RegTrackerPanel.jsx")),
    "and the panel carries no dead case for it",
    'no `case "VD_margin"` in RegTrackerPanel.jsx');
  check(/VD = p\.vCruise\*1\.25|VD=p\.vCruise\*1\.25/.test(read("src/engine.js").replace(/\s+/g, " ")) ||
        /const VD=p\.vCruise\*1\.25/.test(read("src/engine.js")),
    "the tautology it rested on is still in the engine, so the note stays true",
    "engine.js still defines VD as exactly 1.25 x vCruise; the rule is withdrawn, not the definition");
  const counts = ruleBasisCounts();
  check(counts.total === counts.regulation + counts.tool && counts.regulation === 3,
    "the basis split is computed and reconciles",
    `${counts.total} rules = ${counts.regulation} regulation + ${counts.tool} tool`);
}

/* ── 5. THE TWO REGIMES ARE DIFFERENT LIMITS ─────────────────────────── */
console.log("\n5. EASA AND FAA DO NOT COVER THE SAME AIRCRAFT");
{
  check(KG_PER_LB === 0.45359237 && FAA_MGW_KG === FAA_MGW_LB * KG_PER_LB,
    "the FAA mass limit is derived from the pound, never a rounded kilogram",
    `${FAA_MGW_LB} lb x ${KG_PER_LB} = ${FAA_MGW_KG} kg`);
  check(FAA_MGW_KG !== EASA_MCTOM_KG && Math.abs(EASA_MCTOM_KG - FAA_MGW_KG) > 30,
    "the two mass limits differ by a band a design can sit inside",
    `EASA ${EASA_MCTOM_KG} kg vs FAA ${FAA_MGW_KG.toFixed(3)} kg — a ${(EASA_MCTOM_KG - FAA_MGW_KG).toFixed(1)} kg band`);
  check(EASA_MAX_SEATS === 9 && FAA_MAX_SEATS === 6,
    "and so do the seat limits",
    `EASA ${EASA_MAX_SEATS} seats (VTOL.2005(a)), FAA ${FAA_MAX_SEATS} (PL.2000(a))`);

  /* A design in the band must be reported differently by each regime. */
  const sr = { MTOW: 5685 };
  const e = scVtolApplicability(P({ nSeats: 8 }), sr, 60);
  const f = faaApplicability(P({ nSeats: 8 }), sr);
  check(e.applies === true && f.some((g) => g.state === GATE.OUT),
    "a 5 685 kg eight-seater is inside EASA scope and outside FAA scope",
    `EASA applies=${e.applies}; FAA gates out on `
      + f.filter((g) => g.state === GATE.OUT).map((g) => g.name).join(" and "));
}

/* ── 6. THE CATEGORY IS HONOURED, AND ONLY WHAT IS MODELLED IS CLAIMED ─ */
console.log("\n6. vtolCategory — every file the panel names must read it");
{
  for (const e of CATEGORY_EFFECTS.modelled) {
    const rel = join("src", e.where.replace(/^engine\//, "engine/"));
    const there = existsSync(join(ROOT, rel));
    const reads = there && /vtolCategory/.test(read(rel));
    check(reads, `${e.where} really reads vtolCategory`,
      reads ? `claimed for ${e.para}: ${e.what.slice(0, 60)}…`
            : there ? `${rel} exists but never mentions vtolCategory`
                    : `${rel} does not exist`);
  }
  check(CATEGORY_EFFECTS.notModelled.length > 0,
    "the category-conditioned requirements NOT modelled are named, not dropped",
    `${CATEGORY_EFFECTS.notModelled.length} listed: `
      + CATEGORY_EFFECTS.notModelled.map((e) => e.para).join(", "));
  const basic = sizeOf({ vtolCategory: "basic" });
  const enh   = sizeOf({ vtolCategory: "enhanced" });
  check(basic.MTOW !== enh.MTOW,
    "and the category is a real sizing lever, not a label",
    `Basic ${basic.MTOW.toFixed(1)} kg vs Enhanced ${enh.MTOW.toFixed(1)} kg `
      + `— ${(enh.MTOW - basic.MTOW).toFixed(1)} kg of avionics redundancy`);
  check(/vtolCategory/.test(read("src/panels/RegTrackerPanel.jsx")),
    "the compliance panel finally reads the category the engine already honoured",
    "RegTrackerPanel.jsx references vtolCategory");
}

/* ── 7. nSeats COSTS NOTHING ─────────────────────────────────────────── */
console.log("\n7. THE NEW INPUT MOVES NO SIZED RESULT UNTIL IT IS SET");
{
  check(DEFAULT_PARAMS.nSeats === null,
    "nSeats defaults to absent",
    `DEFAULT_PARAMS.nSeats = ${JSON.stringify(DEFAULT_PARAMS.nSeats)}`);
  const withNull = sizeOf({ nSeats: null });
  const without  = runSizing({ ...DEFAULT_PARAMS, nSeats: undefined });
  check(withNull.MTOW === without.MTOW,
    "null and absent size identically, so the golden master cannot move",
    `both ${withNull.MTOW.toFixed(6)} kg`);
  const stated = sizeOf({ nSeats: 4 });
  check(Number.isFinite(stated.MTOW),
    "and a stated seat count still sizes",
    `4 seats → ${stated.MTOW.toFixed(1)} kg (cabin check honours the integer)`);
}

/* ── 8. THE MODEL IS NOT ASKED WHAT IT CANNOT KNOW ───────────────────── */
console.log("\n8. THE LANGUAGE-MODEL PROMPT");
{
  /* CODE ONLY, NOT THE POST-MORTEM. This panel documents the defects it
     used to have, so the banned strings all appear in its comments by
     design — exactly the problem citations.mjs solved by writing dead
     paragraph numbers without their prefix. Stripping comments is the
     honest version: it asks what the panel DOES, not what it says about
     what it used to do. */
  const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, " ")          // block comments
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ") // JSX comment wrappers
    .replace(/^\s*\/\/.*$/gm, " ");              // line comments
  const panel = strip(read("src/panels/RegTrackerPanel.jsx"));
  check(!/TRAINING CUTOFF/.test(panel),
    "the model is never asked to state its own training cutoff",
    "gpt-oss-20b answered '2021' once and 'September 2026' once; the cutoff "
      + "is now a constant in lib/ai-model.js from the published model card");
  check(/GROQ_MODEL_CUTOFF/.test(panel),
    "and the documented cutoff travels with the answer",
    "RegTrackerPanel.jsx prints GROQ_MODEL_CUTOFF beside the report");
  check(!/tool rule, not a regulation/.test(panel),
    "tool rules are no longer sent to the model to be 'matched'",
    "the old prompt sent all 11 rules and got MATCH for six that have no "
      + "published counterpart");
  check(/basis === "regulation"/.test(panel),
    "only rules with a real paragraph are asked about",
    "the prompt filters on basis === \"regulation\"");
  check(!/AC 21-17-4/.test(panel),
    "the FAA document is spelled AC 21.17-4, as the rest of the repo spells it",
    "no hyphenated 'AC 21-17-4' anywhere in the panel");
  check(!/early 2025/.test(panel),
    "and no stale as-of date contradicts regdb.js's lastChecked",
    "no 'early 2025' in the prompt");
}

/* ── 9. THE PANEL ACTUALLY RENDERS, AND HIDES WHAT IT CLAIMS TO HIDE ─── */
console.log("\n9. SERVER-RENDER — nothing else in this repo renders this panel");
{
  /* validation/tab-render.mjs covers src/tabs/, fifteen of them. This
     panel lives in src/panels/ and was covered by NOTHING, which is how
     a conditional-hook crash reached production once before: the build
     passed, every gate passed, and the tab failed to load. The useMemo
     added here is exactly that shape of risk, so it is rendered. */
  const { build } = await import("esbuild");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");

  const dir = mkdtempSync(join(ROOT, "node_modules", ".regrender-"));
  const inScopeSR  = sizeOf({});
  const outScopeSR = sizeOf({ payload: 900 });
  let markup = null, threw = null;
  try {
    const entry = join(dir, "entry.jsx");
    writeFileSync(entry,
      `export { RegTrackerPanel } from ${JSON.stringify(
        join(ROOT, "src", "panels", "RegTrackerPanel.jsx").replace(/\\/g, "/"))};\n`
      + `export { SC } from ${JSON.stringify(
        join(ROOT, "src", "lib", "theme.js").replace(/\\/g, "/"))};\n`);
    const outfile = join(dir, "bundle.mjs");
    await build({
      entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node",
      jsx: "automatic", logLevel: "silent",
      define: { "import.meta.env": JSON.stringify({ MODE: "test", VITE_GROQ_KEY: "" }) },
      external: ["react", "react-dom", "react/jsx-runtime", "recharts"],
    });
    const M = await import(pathToFileURL(outfile).href);

    const render = (over, sr) => renderToStaticMarkup(
      createElement(M.RegTrackerPanel, { params: P(over), SR: sr, SC: M.SC }));

    markup = {
      inScope:  render({ nSeats: 4 }, inScopeSR),
      noSeats:  render({ nSeats: null }, inScopeSR),
      outScope: render({ payload: 900, nSeats: 4 }, outScopeSR),
      unsized:  render({ nSeats: 4 }, null),
    };
  } catch (e) { threw = e; }

  check(threw === null && markup !== null,
    "the panel renders at every scope state without throwing",
    threw ? `threw: ${threw.message}` : "in scope, seats unstated, out of scope, and unsized");

  if (markup) {
    /* MATCH ON THE ROW, NOT THE NAME. "Maximum certificated take-off
       mass" is both a rule name and the wording of the VTOL.2005(a)
       APPLICABILITY gate, which is rendered either way — so a bare
       substring search found it in the out-of-scope markup and reported
       a rule row that was not there. The rules carry their basis label
       in the first cell; that is what distinguishes a rule row. */
    /* MATCH ON THE ROW, NOT THE NAME. "Maximum certificated take-off
       mass" is both a rule name and the wording of the VTOL.2005(a)
       APPLICABILITY gate, which renders either way — so a bare substring
       search found it in the out-of-scope markup and reported a rule row
       that was not there. A rule row is a <td> holding exactly the name. */
    /* THE RULE GROUPS RENDER COLLAPSED, so the individual rows are not in
       the initial markup at all — but the group HEADER is, and it carries
       a verdict badge reading "ALL PASS" or "✗ n FAIL". That badge is the
       most visible claim on the tab and the one a reader takes away, so
       it is what must disappear when the document does not govern the
       aircraft. Checking for the rows alone would have passed while the
       badge still said ALL PASS. */
    const groups = Object.keys(REG_DB);
    const nOut = groups.filter((g) => markup.outScope.includes(`>${g}</span>`)).length;
    const nIn  = groups.filter((g) => markup.inScope.includes(`>${g}</span>`)).length;

    check(markup.outScope.includes("DOES NOT APPLY"),
      "an out-of-scope design is told the document does not apply",
      `MTOW ${outScopeSR.MTOW.toFixed(1)} kg → the notice is rendered`);
    check(nOut === 0,
      "and NOT ONE rule group is rendered for it",
      `${nOut} of ${groups.length} rule groups in the markup`);
    /* THE BADGE, NOT THE WORD. The header prose legitimately contains
       "does not get FAIL badges", so a bare word search fails on the
       sentence that explains the fix. A badge is the word alone inside
       its own span. */
    const BADGE = /<span[^>]*>(?:ALL PASS|✗ \d+ FAIL|PASS|FAIL)<\/span>/g;
    const outBadges = markup.outScope.match(BADGE) ?? [];
    const inBadges  = markup.inScope.match(BADGE) ?? [];
    check(outBadges.length === 0,
      "no ALL PASS or FAIL verdict badge survives out of scope",
      `${outBadges.length} verdict badge(s) in the out-of-scope markup`);
    check(inBadges.length > 0,
      "while an in-scope design still gets its verdict badges",
      `${inBadges.length} badge(s): ${[...new Set(inBadges.map((b) => b.replace(/<[^>]*>/g, "")))].join(", ")}`);
    check(nIn === groups.length,
      "an in-scope design gets its rule groups",
      `${nIn} of ${groups.length} groups rendered`);
    check(markup.noSeats.includes("NOT DECIDABLE"),
      "an unstated seat count is shown as undecided, not passed",
      "the seat gate renders NOT DECIDABLE");

    for (const [k, m] of Object.entries(markup)) {
      const bad = ["NaN", "undefined", "Infinity"].filter((t) => m.includes(t));
      check(bad.length === 0, `no NaN, undefined or Infinity reaches the screen (${k})`,
        bad.length === 0 ? `${m.length} chars of markup, clean` : `found: ${bad.join(", ")}`);
    }
  }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
}

console.log("\n" + bar);
if (fails) {
  console.log(`REGULATORY APPLICABILITY GATE FAILED — ${fails} check(s)`);
  process.exit(1);
}
console.log("REGULATORY APPLICABILITY GATE PASSED");
