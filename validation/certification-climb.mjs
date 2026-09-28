/* ═══════════════════════════════════════════════════════════════════════
   MOC VTOL.2120 CLIMB GRADIENT — REFUSAL AND HONESTY OF BASIS
   ═══════════════════════════════════════════════════════════════════════
   This harness exists because of two defects that every other gate in this
   repository was structurally unable to see.

   THE FIRST WAS A PASS ON AN AIRCRAFT THAT DOES NOT EXIST. W and V were
   floored with Math.max(1, …) and Math.max(1e-6, …). Those floors did not
   guard the arithmetic, they invented an aeroplane: a missing or zero mass
   became a 1 N machine, a missing or zero cruise speed a 1 um/s one, and the
   clause then certified it. Measured before the fix, at the app's own unit
   count and rating: MTOW_kg = 0 gave 968,252% with pass:true, vCruise = 0
   gave 2,386,407,994% with pass:true, and both zero gave 6.5e13%.

   WHY NOTHING CAUGHT IT. Every harness here scores an output against a
   reference on a design that closes. A degenerate input never reaches a
   reference comparison, because there is no reference for "no aircraft" —
   so the whole suite could be green while the only safety-performance
   clause this engine evaluates returned PASS for an empty object. The
   check that finds this class is not a comparison, it is an assertion about
   what the function must REFUSE. That is what section 1 does.

   THE SECOND WAS A TRUE SENTENCE ABOUT A COMPUTATION THAT NEVER HAPPENED.
   The basis string read "at 305 m above the take-off surface".
   CLIMB_GRADIENT_ALT_M appeared in the module exactly twice — its
   declaration and that sentence — and never in the arithmetic, and
   rhoAtCondition was documented as an input and never read. Section 3
   asserts the property that makes such a sentence checkable: a named
   condition may appear in the prose only if the module's numbers depend on
   it. A gate cannot read English, but it can require that a constant
   claimed in a basis string move a result, and refuse the claim otherwise.

   Run: node validation/certification-climb.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { certificationClimb, CLIMB_GRADIENT_MIN, CLIMB_GRADIENT_ALT_M }
  from "../src/engine/certification-climb.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (!ok) { fails.push(label + (detail ? " — " + detail : "")); if (detail) console.log("        " + detail); }
  else passes++;
};

/* A design that closes, so the refusals below are demonstrably not refusing
   everything. Numbers are the app's own defaults at commit 3a7a5a4. */
const G = { MTOW_kg: 2772.06, LD: 9.77, g0: 9.80665, hasWing: true,
            nUnits: 12, pMotInstalledKW: 73.72 };
const P = { vCruise: 67, etaSys: 0.8, vtolCategory: "enhanced" };

console.log("\n── 1. A degenerate aircraft is REFUSED, never certified ──────────────");

const nominal = certificationClimb(P, G);
check(nominal.applicable === true && Number.isFinite(nominal.gradientPct),
  "the reference design is still evaluated",
  `applicable=${nominal.applicable} gradientPct=${nominal.gradientPct}`);
check(nominal.pass === true,
  "the reference design still passes (the fix did not break a valid case)",
  `gradientPct=${nominal.gradientPct} required=${nominal.requiredPct}`);

/* The exact cases that used to return pass:true. Each must now be refused.
   `pass` must be null — not false — because false is a finding about an
   aircraft and there is no aircraft here. */
const degenerate = [
  ["MTOW_kg = 0",          P, { ...G, MTOW_kg: 0 }],
  ["MTOW_kg undefined",    P, { ...G, MTOW_kg: undefined }],
  ["MTOW_kg NaN",          P, { ...G, MTOW_kg: NaN }],
  ["MTOW_kg negative",     P, { ...G, MTOW_kg: -2772 }],
  ["vCruise = 0",          { ...P, vCruise: 0 }, G],
  ["vCruise undefined",    { ...P, vCruise: undefined }, G],
  ["vCruise NaN",          { ...P, vCruise: NaN }, G],
  ["vCruise negative",     { ...P, vCruise: -67 }, G],
  ["both mass and speed 0",{ ...P, vCruise: 0 }, { ...G, MTOW_kg: 0 }],
  ["etaSys = 0",           { ...P, etaSys: 0 }, G],
  ["etaSys negative",      { ...P, etaSys: -0.8 }, G],
  ["empty inputs",         {}, {}],
];
for (const [label, p, g] of degenerate) {
  const r = certificationClimb(p, g);
  check(r.pass === null && r.gradientPct === null && r.applicable === false,
    `refused: ${label}`,
    `pass=${r.pass} gradientPct=${r.gradientPct} applicable=${r.applicable}`);
}

/* The specific regression: not merely "does not pass", but never TRUE. */
for (const [label, p, g] of degenerate) {
  const r = certificationClimb(p, g);
  check(r.pass !== true, `never certifies: ${label}`, `pass=${r.pass}`);
}

console.log("\n── 2. A refusal says which quantity is missing ───────────────────────");

const named = [
  ["maximum take-off mass", P, { ...G, MTOW_kg: 0 }],
  ["cruise speed",          { ...P, vCruise: 0 }, G],
  ["powertrain efficiency", { ...P, etaSys: 0 }, G],
];
for (const [needle, p, g] of named) {
  const r = certificationClimb(p, g);
  check(typeof r.basis === "string" && r.basis.includes(needle),
    `the basis names the missing quantity: "${needle}"`, r.basis);
}
{
  const r = certificationClimb({ ...P, vCruise: 0 }, G);
  check(/not evaluated is not zero/i.test(r.basis),
    "a refusal states that not evaluated is not zero", r.basis);
}

console.log("\n── 3. The basis may only claim a condition the numbers depend on ─────");

/* CLIMB_GRADIENT_ALT_M is exported and was named in the basis string while
   no line of arithmetic used it. The general property: if the prose names a
   condition, the result must move when that condition moves. This module
   does not take an altitude, so the honest form is that the basis must NOT
   assert the 305 m condition as the one computed. */
const basis = nominal.basis;
check(!/at 305 m above the take-off surface(?!,? the rule)/.test(basis)
      && !/^(?=.*at 305 m)(?!.*not at).*$/.test(basis),
  "the basis does not claim the gradient was computed at 305 m",
  basis);
check(/converged cruise condition/i.test(basis),
  "the basis names the condition that WAS computed", basis);
check(nominal.conditionApplied === "converged cruise condition",
  "conditionApplied carries the same fact in a field, not only in prose",
  String(nominal.conditionApplied));
check(new RegExp(String(CLIMB_GRADIENT_ALT_M)).test(basis) && /not at/i.test(basis),
  "the rule's own condition is still cited, explicitly as NOT the one applied",
  basis);

/* Category Basic additionally requires ISA SL, equally unapplied. */
{
  const rb = certificationClimb({ ...P, vtolCategory: "basic" }, G);
  check(/ISA sea level/i.test(rb.basis) && /not at/i.test(rb.basis),
    "Category Basic states that ISA SL is not applied either", rb.basis);
  check(!/nominal conditions, ISA SL(?!.*not)/.test(rb.basis),
    "Category Basic no longer asserts ISA SL as the condition computed", rb.basis);
}

console.log("\n── 4. The arithmetic itself is unchanged for valid designs ───────────");

/* Regression pins, MEASURED against the pre-fix module (git show HEAD:…)
   rather than predicted. The fix removed two floors that could only bind on a
   degenerate input, so every valid case must return exactly what it did, and
   all six of these were confirmed identical before and after:
     enhanced 25.383 / basic 28.621 / wingless null / LD=0 null
     single cruise prop -10.235 / two cruise props -6.997
   The first value written here was a GUESS (27.694) and this harness caught
   it, which is the whole argument for pinning a measurement and not an
   expectation. */
const pins = [
  ["default, enhanced",   P, G, 25.383],
  ["basic category",      { ...P, vtolCategory: "basic" }, G, 28.621],
  ["single cruise prop",  P, { ...G, separateCruiseProp: true, nCruiseProps: 1 }, -10.235],
  ["two cruise props",    P, { ...G, separateCruiseProp: true, nCruiseProps: 2 }, -6.997],
];
for (const [label, p, g, want] of pins) {
  const r = certificationClimb(p, g);
  check(Math.abs(r.gradientPct - want) < 5e-3,
    `gradient unchanged: ${label}`, `got ${r.gradientPct}, expected ${want}`);
}
check(Math.abs(nominal.requiredPct - CLIMB_GRADIENT_MIN * 100) < 1e-12,
  "requiredPct is CLIMB_GRADIENT_MIN, not a second copy of 2.5",
  `${nominal.requiredPct} vs ${CLIMB_GRADIENT_MIN * 100}`);

/* A wingless layout was already refused correctly; prove the new guard did
   not displace that branch or change its wording. */
{
  const r = certificationClimb(P, { ...G, hasWing: false });
  check(r.applicable === false && r.pass === null && /rotor-borne/.test(r.basis),
    "the wingless branch still refuses, and still for the wingless reason",
    r.basis);
}

console.log(`\n${fails.length ? "FAIL" : "PASS"}: ${passes} checks passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
