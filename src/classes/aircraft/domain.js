/* =====================================================================
   INPUT DOMAIN — the one place that says what a negative input means
   =====================================================================
   Every class publishes `min` and `max` for its inputs, and those bounds
   are what the UI sliders are built from. `min >= 0` is the schema's own
   statement that a quantity cannot go below zero: a wing cannot have a
   negative area, an engine cannot burn a negative amount of fuel, and a
   hold cannot last a negative number of minutes.

   The trainer loop was found accepting such inputs, converging on them,
   and publishing the result with `converged: true` and no flag of any
   kind (F-02, CHG-006). It was fixed there and nowhere else, so the same
   defect stood in every other class. Measured on the shipped code before
   this module existed, with every input the schema declares non-negative
   set to -1 one at a time:

     class       declares min >= 0   accepted -1   converged:true   design moved
     transport          84               83             59              38
     bizjet             85               84             57              29
     turboprop          54               53             27              26

   The single refusal in each class was `numEngines`, caught by a rule
   about engine counts rather than about signs. The rest sized an
   aeroplane. `tsfcCruise = -1` returned a CONVERGED transport 68.7 %
   lighter than the baseline, because an engine that consumes negative
   fuel is a fixed point the loop is happy to find; `emptyMarginFraction
   = -1` returned one 62.4 % lighter for the same reason.

   ── ONLY THE SIGN IS POLICED HERE, NOT THE WHOLE DECLARED RANGE ──
   `max` is a slider bound, not a statement about where the model is
   valid, and the loops already have a way to answer an ambitious but
   MEANINGFUL request: they return `converged: false` with a stopReason.
   validation/trainer.mjs depends on exactly that — it asks for 5,000 nm
   against a declared maximum of 1,200 and requires a reasoned
   non-convergence, not an exception. An earlier version of the trainer
   fix enforced the whole range and broke it (CHG-006).

   So this invents no rule and picks no new number. It applies each
   file's own published contract at the places that skipped it, and
   Phase 18's requirement that an illegal input be REFUSED WITH AN
   EXPLANATION is met by naming the input, the offending value, the
   declared range and what the loop used to do with it instead.

   Inputs whose schema declares a NEGATIVE minimum are left alone, and
   they are the proof that this reads the schema rather than banning a
   sign: `fieldElevationFt` (min -1,500 ft, for aerodromes below sea
   level) and `fieldDeltaIsaC` (min -30 C) are legitimately negative and
   stay legitimately negative.
   ===================================================================== */

/* The refusal text. The offending input's NAME LEADS the message —
   validation/trainer-domain.mjs pins that, because an earlier check that
   merely looked for the name as a substring passed for the wrong reason:
   the worked example in the tail cites `rangeNm`, so a mutant that
   stripped the real name survived. */
export function negativeInputMessage(label, key, value, s, evidence) {
  const u = s.unit ? " " + s.unit : "";
  return `${label} input "${key}" cannot be negative (got ${value}${u}; ` +
    `the declared range is ${s.min} to ${s.max}${u}). ${evidence}`;
}

/* Refuse a negative value for any numeric input whose schema declares
   min >= 0. `defaults` names the inputs the class actually consumes,
   `schema` carries the published bounds, `q` is the resolved input set,
   and `evidence` is the class's own measured account of what accepting
   the value used to produce. Returns `q` so it can be used inline. */
export function refuseNegativeInputs(label, defaults, schema, q, evidence) {
  for (const [k, v] of Object.entries(defaults)) {
    if (typeof v !== "number") continue;
    const s = schema[k];
    if (!s || !Number.isFinite(s.min) || s.min < 0) continue;
    const x = Number(q[k]);
    if (!(x < 0)) continue;
    throw new Error(negativeInputMessage(label, k, x, s, evidence));
  }
  return q;
}
