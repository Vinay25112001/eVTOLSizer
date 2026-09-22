/* =====================================================================
   RESULT FINGERPRINT AND THE RULE FOR "THE SAME NUMBER"
   =====================================================================
   Moved verbatim out of validation/golden-master.mjs so the regression
   gate and the design file (lib/designfile.js) decide whether two runs
   agree by ONE rule. If they used different rules, a saved design could be
   reported unchanged while the golden master called the same engine
   change a behaviour change, or the other way round.
   ===================================================================== */

/* Reduce a result object to a stable, comparable set of scalars. Arrays are
   summarised by length + endpoints + a checksum so that a change anywhere in a
   200-point curve is still caught, without storing megabytes. */
export function fingerprint(R) {
  if (!R || typeof R !== "object") return { _null: true };
  const out = {};
  for (const [k, v] of Object.entries(R)) {
    /* Stored at full precision. Rounding here was tried and cannot work:
       two values arbitrarily close can still straddle a rounding boundary.
       Tolerance is applied at comparison time instead — see sameValue(). */
    if (typeof v === "number") out[k] = Number.isFinite(v) ? +v.toPrecision(12) : String(v);
    else if (typeof v === "boolean" || typeof v === "string") out[k] = v;
    else if (Array.isArray(v)) {
      let sum = 0, cnt = 0;
      const walk = (x) => {
        if (typeof x === "number" && Number.isFinite(x)) { sum += x * (1 + (cnt++ % 7)); }
        else if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") Object.values(x).forEach(walk);
      };
      walk(v);
      out[k] = `arr:${v.length}:${+sum.toPrecision(12)}`;
    } else if (v && typeof v === "object") {
      let sum = 0;
      for (const n of Object.values(v)) if (typeof n === "number" && Number.isFinite(n)) sum += n;
      out[k] = `obj:${Object.keys(v).length}:${+sum.toPrecision(12)}`;
    }
  }
  return out;
}

/* ── WHAT COUNTS AS THE SAME NUMBER ───────────────────────────────
   Math.pow, the trigonometric functions and the like differ in their last
   bits between platforms and V8 builds. Accumulated over a sizing loop that
   runs 60 to 600 iterations that reaches the seventh significant digit, which
   is arithmetic and not behaviour: the runner reported afScored 972.9997283
   against 972.9999583 here, a relative difference of 2.4e-7.

   RTOL clears that four times over while still catching a real change: the
   smallest behavioural movement this project has cared about is 1.1e-5
   relative (multicopter MTOW under the NDARC tolerance fix), which this
   flags with a factor of ten to spare. ATOL covers values at or near zero,
   where a relative test is meaningless. */
export const RTOL = 1e-6, ATOL = 1e-12;

export const relDiff = (a, b) => {
  if (a === b) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
};

/* The array and object fields are `arr:<len>:<checksum>` strings. Length is
   structural and compared exactly; the checksum is a float and is not. */
const CK = /^(arr|obj):(\d+):(.+)$/;

export function sameValue(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    const rel = relDiff(a, b);
    return { same: Math.abs(a - b) <= ATOL || rel <= RTOL, rel };
  }
  if (typeof a === "string" && typeof b === "string") {
    const ma = CK.exec(a), mb = CK.exec(b);
    if (ma && mb) {
      if (ma[1] !== mb[1] || ma[2] !== mb[2]) return { same: false, rel: Infinity };
      const x = +ma[3], y = +mb[3];
      const rel = relDiff(x, y);
      return { same: Math.abs(x - y) <= ATOL || rel <= RTOL, rel };
    }
  }
  const same = JSON.stringify(a) === JSON.stringify(b);
  return { same, rel: same ? 0 : Infinity };
}
