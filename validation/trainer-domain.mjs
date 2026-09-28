/* =====================================================================
   TRAINER INPUT DOMAIN — A NEGATIVE MISSION IS NOT A MISSION
   =====================================================================
   The trainer sizing loop validated finiteness and nothing else, so it
   accepted negative inputs, CONVERGED on them, and published the result with
   converged:true, stopReason:null and no flag of any kind:

       rangeNm    = -518   ->  usable fuel -108.86 lb, cruise fuel -153.63 lb
       reserveMin = -1000  ->  usable fuel -320.28 lb, reserve   -442.64 lb

   Those are genuine fixed points; the residual really is under the 0.01 lb
   tolerance. The loop was right and the physics was not. A gross weight of
   "empty + payload MINUS 108.86 lb of fuel" is not a design, and unlike the
   eVTOL path -- which banners a diverged run in red -- nothing here said
   anything at all.

   ONLY THE SIGN IS POLICED, AND THAT IS DELIBERATE. An earlier draft of this
   fix enforced the whole declared min..max range and was wrong. TRAINER_INPUTS
   publishes `max` as a slider bound, not as a statement about where the model
   is valid, and this loop ALREADY has a way to answer an ambitious but
   meaningful request: converged:false with a stopReason. validation/trainer.mjs
   depends on exactly that -- it asks for 5,000 nm against a declared maximum of
   1,200 and requires a reasoned non-convergence, not an exception. A 50 nm
   mission and a 91 minute reserve are real questions with real answers too.
   Section 2 pins that distinction so it cannot be flattened again.

   A negative range or reserve is not a question at all, and `min >= 0` in the
   schema is the file's own statement that the quantity cannot go below zero.
   That is the contract enforced here: no new number is chosen and no rule is
   invented.

   SECTION 4 IS WHY THERE IS NO RESULT-LEVEL "FUEL MUST BE POSITIVE" GUARD.
   With negatives refused, a non-physical converged design is not reachable
   from a non-negative input: a search over every declared extreme, deliberately
   huge values well past each slider maximum, the degenerate zeros, and 3,000
   random unbounded non-negative points found exactly one flagged case --
   sfc = 0 giving a cruise fuel of 0.00 lb, which is a zero-fuel-consumption
   engine burning no fuel. Degenerate, but consistent, and not negative. A guard
   for negative fuel could therefore never fire, and a guard that cannot fail is
   not a guard. The search runs instead, so if a future change ever makes a
   negative-fuel design reachable this fails and says the guard is now needed.

   Run: node validation/trainer-domain.mjs
   ===================================================================== */
import { sizeTrainer } from "../src/classes/trainer/size.js";
import { TRAINER_INPUTS, TRAINER_DEFAULTS } from "../src/classes/trainer/defaults.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const NUM = Object.entries(TRAINER_INPUTS).filter(([, s]) => typeof s.value === "number");
const NONNEG = NUM.filter(([, s]) => Number.isFinite(s.min) && s.min >= 0);

/* ── 1. every non-negative quantity refuses a negative value ──────────── */
console.log(`\n-- 1. all ${NONNEG.length} inputs the schema declares non-negative refuse a negative --`);
{
  const missed = [];
  for (const [k] of NONNEG) {
    try { sizeTrainer({ [k]: -1 }); missed.push(k); } catch { /* refused, as required */ }
  }
  check(`every input with min >= 0 refuses -1 (${NONNEG.length - missed.length}/${NONNEG.length})`,
    missed.length === 0, missed.join(", "));
  /* The refusal must EXPLAIN, per Phase 18, not merely fail — and this check
     has to be able to tell an explanation from boilerplate. An earlier version
     asked whether the message for rangeNm contained "rangeNm", and a mutant
     that stripped the input's name survived it: the message's own worked
     EXAMPLE cites rangeNm = -518, so the substring was there either way and the
     check passed for the wrong reason. allowanceGal appears nowhere in that
     example text, so only the offending input's real name can satisfy it, and
     the name must lead the message rather than merely occur in it. */
  let msg = "";
  try { sizeTrainer({ allowanceGal: -10 }); } catch (e) { msg = e.message; }
  const s = TRAINER_INPUTS.allowanceGal;
  check("the refusal LEADS with the offending input's name",
    msg.startsWith('Trainer input "allowanceGal"'), msg.slice(0, 90));
  check("  ...and states the offending value and the declared range",
    msg.includes("-10") && msg.includes(String(s.min)) && msg.includes(String(s.max)),
    msg.slice(0, 120));
}

/* ── 2. an ambitious but MEANINGFUL request is answered, not refused ──── */
console.log("\n-- 2. a large positive request is sized and answered, not thrown at --");
{
  /* This is the distinction an earlier draft of the fix destroyed. */
  let r = null, threw = null;
  try { r = sizeTrainer({ rangeNm: 5000 }); } catch (e) { threw = e.message; }
  check("5,000 nm (4.2x the slider maximum) is SIZED, not refused",
    threw === null, threw ? `threw: ${threw.slice(0, 80)}` : "");
  check("  ...and comes back not-converged WITH a reason",
    r && r.converged === false && typeof r.stopReason === "string" && r.stopReason.length > 0,
    r ? `converged=${r.converged} stopReason=${JSON.stringify(r.stopReason).slice(0, 70)}` : "not sized");
  for (const [label, over] of [["rangeNm = 99 (below the slider minimum of 100)", { rangeNm: 99 }],
                               ["reserveMin = 91 (above the slider maximum of 90)", { reserveMin: 91 }],
                               ["rangeNm = 1200 (exactly the maximum)", { rangeNm: 1200 }]]) {
    let ok = false, why = "";
    try { const x = sizeTrainer(over); ok = x.converged === true; why = `converged=${x.converged}`; }
    catch (e) { why = `threw: ${e.message.slice(0, 60)}`; }
    check(`${label} is a real question and still converges`, ok, why);
  }
}

/* ── 3. the designs the finding recorded ──────────────────────────────── */
console.log("\n-- 3. the negative-fuel designs are refused, not converged --");
for (const [label, over, was] of [
  ["rangeNm = -518", { rangeNm: -518 }, "converged true at usable -108.86 lb, cruise -153.63 lb"],
  ["reserveMin = -1000", { reserveMin: -1000 }, "converged true at usable -320.28 lb, reserve -442.64 lb"],
  ["allowanceGal = -10", { allowanceGal: -10 }, "converged true, published 2426.1 lb gross"],
]) {
  let threw = null;
  try { sizeTrainer(over); } catch (e) { threw = e.message; }
  check(`${label} is refused`, threw !== null, threw ? `previously: ${was}` : `STILL ACCEPTED (${was})`);
}

/* ── 4. no negative-fuel design is reachable from a non-negative input ── */
console.log("\n-- 4. the guard that is deliberately absent, and the search behind it --");
{
  const hits = [];
  let tested = 0, converged = 0;
  const rec = (label, o) => {
    tested++;
    let r; try { r = sizeTrainer(o); } catch { return; }
    if (!r.converged) return;
    converged++;
    const f = r.fuel || {};
    const p = [];
    if (f.usableLb < 0) p.push(`usableLb=${f.usableLb}`);
    if (f.cruiseLb < 0) p.push(`cruiseLb=${f.cruiseLb}`);
    if (f.reserveLb < 0) p.push(`reserveLb=${f.reserveLb}`);
    if (r.emptyLb <= 0) p.push(`emptyLb=${r.emptyLb}`);
    if (r.grossLb < r.emptyLb) p.push("gross<empty");
    if (p.length) hits.push(`${label}: ${p.join(" ")}`);
  };
  for (const [k, s] of NUM) {
    if (Number.isFinite(s.min)) rec(`${k}=min`, { [k]: Math.max(0, s.min) });
    if (Number.isFinite(s.max)) rec(`${k}=max`, { [k]: s.max });
    if (Number.isFinite(s.max)) rec(`${k}=100x max`, { [k]: s.max * 100 });
  }
  let seed = 777;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  /* Two populations, because they answer different questions. The interior
     sample is where designs actually close, so it carries the statistical
     weight; the stretched sample reaches 3x past every slider maximum, which is
     where a sign error would surface if one survived. Sampling only the
     stretched space converges ~4 % of the time and would leave this section
     asserting almost nothing -- which is exactly what the vacuity check below
     caught when it did. */
  for (let i = 0; i < 3000; i++) {
    const o = {};
    for (const [k, s] of NUM) {
      if (!Number.isFinite(s.min) || !Number.isFinite(s.max)) continue;
      o[k] = Math.max(0, s.min) + rnd() * (s.max - Math.max(0, s.min));
    }
    rec("random-interior", o);
  }
  for (let i = 0; i < 3000; i++) {
    const o = {};
    for (const [k, s] of NUM) o[k] = Math.max(0, s.min) + rnd() * Math.max(1, s.max) * 3;
    rec("random-stretched", o);
  }
  check(`no NEGATIVE fuel, empty weight or closure from any non-negative input ` +
        `(${converged} converged of ${tested} tried)`,
    hits.length === 0, hits.slice(0, 3).join(" | "));
  check("the search is not vacuous — it reached converged designs to inspect",
    converged > 200, `converged ${converged} of ${tested}`);
}

/* ── 5. the legal design is untouched ─────────────────────────────────── */
console.log("\n-- 5. the legal design still sizes exactly as before --");
{
  const r = sizeTrainer({});
  for (const [field, want, get] of [
    ["grossLb", 2605.4, (x) => x.grossLb],
    ["usable fuel lb", 265.37, (x) => x.fuel.usableLb],
    ["cruise fuel lb", 204.42, (x) => x.fuel.cruiseLb],
    ["reserve fuel lb", 38.23, (x) => x.fuel.reserveLb],
  ]) {
    check(`default: ${field} unchanged at ${want}`, Math.abs(get(r) - want) < 0.05, `got ${get(r)}`);
  }
  check("default: converged with no stopReason", r.converged === true && r.stopReason === null,
    `converged=${r.converged} stopReason=${JSON.stringify(r.stopReason)}`);
  check("every TRAINER_DEFAULTS value is inside its own declared bounds",
    NUM.every(([k, s]) => !Number.isFinite(s.min) || (TRAINER_DEFAULTS[k] >= s.min && TRAINER_DEFAULTS[k] <= s.max)),
    NUM.filter(([k, s]) => Number.isFinite(s.min) &&
      (TRAINER_DEFAULTS[k] < s.min || TRAINER_DEFAULTS[k] > s.max)).map(([k]) => k).join(", "));
}

console.log("");
console.log(fail ? `TRAINER DOMAIN GATE FAILED: ${fail} check(s)` : `TRAINER DOMAIN GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
