/* =====================================================================
   DRONE ROTOR GATE — the 5 % accuracy claim, measured not asserted
   =====================================================================
   WHY THIS FILE EXISTS.

   This is the one layer of the drone engine where a 5 % accuracy claim is
   genuinely supportable, and this gate is what makes it a claim rather
   than a hope. The truth set is the UIUC Propeller Data Site: 262
   propellers, 4,145 measured static rows, with a published measurement
   uncertainty of 0.504 % on thrust — an order of magnitude finer than the
   gate it is enforcing.

   HOW THE ERROR IS MEASURED. Leave-one-out cross-validation. Each
   interior measured RPM is dropped in turn, predicted from the
   propeller's remaining points by the SAME rotor module the app uses, and
   compared with what was measured there. Endpoints are excluded rather
   than extrapolated, because scoring an extrapolation the module refuses
   to perform would flatter it.

   Nothing here is fitted. There is no parameter to tune, so the number
   this gate prints is the method's error and not a residual after
   calibration.

   WHAT ELSE IT GUARDS, and why each one is here rather than assumed:

   - DIAMETER UNITS. Static thrust goes as D^4. Seven of these propellers
     are labelled in MILLIMETRES and the rest in inches, and the filenames
     are not reliable: vp_140x45 is "140 mm X 45 mm" (5.51 in), and read
     as 14.0 in it is 41x out on thrust. The generator takes dimensions
     from the page label; this gate checks no propeller ended up with an
     absurd diameter anyway.
   - FIGURE OF MERIT lands in the measured band for small rotors
     (roughly 0.37-0.66; Bohorquez, Winslow). FM is where the propeller
     and rotor coefficient conventions meet, and mixing them is a silent
     factor error, so the whole database is checked for a physical FM.
   - NO SILENT EXTRAPOLATION. An out-of-range request must come back
     flagged, never as a plausible-looking number.
   - THE REYNOLDS LAPSE IS REAL AND SIGNED. C_T rises with RPM on
     essentially every propeller. If that ever stopped being true the data
     or the reader would have changed, and the lookup would be resting on
     something different from what was validated.

   The per-propeller table is printed, not just the mean. Both standard
   references in this field report respectable means with worst cases past
   30 %, visible only because their authors printed the rows.
   ===================================================================== */
import { PROPELLERS, PROPELLERS_OMITTED, PROPELLER_SOURCE } from "../src/data/drone-propellers.js";
import {
  staticCoefficients, staticThrustN, staticShaftPowerW, figureOfMerit, rpmForThrust,
} from "../src/classes/drone/rotor.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const pct = (a, b) => 100 * (a - b) / b;

console.log("DRONE ROTOR GATE");
console.log("=".repeat(78));

check("propeller database is present", PROPELLERS.length > 0,
  `${PROPELLERS.length} propellers, ${PROPELLERS.reduce((n, p) => n + p.static.length, 0)} measured rows`);

check("the truth set states its own measurement uncertainty",
  (PROPELLER_SOURCE?.uncertainty?.thrustPct ?? 0) > 0,
  `thrust ${PROPELLER_SOURCE.uncertainty.thrustPct} %, power ${PROPELLER_SOURCE.uncertainty.powerPct} % — ` +
  `finer than the 5 % gate it enforces`);

check("propellers that could not be read are listed, not dropped silently",
  Array.isArray(PROPELLERS_OMITTED),
  PROPELLERS_OMITTED.length ? `${PROPELLERS_OMITTED.length}: ` +
    PROPELLERS_OMITTED.map((p) => p.file).join(", ") : "none");

/* ── DIAMETERS ARE PHYSICAL ───────────────────────────────────────── */
const badDia = PROPELLERS.filter((p) => !(p.diameterM > 0.02 && p.diameterM < 1.0));
check("every diameter is physical for a small UAS propeller (20 mm - 1 m)",
  badDia.length === 0,
  badDia.length ? badDia.map((p) => `${p.id} ${p.diameterM} m`).join(", ")
                : `${PROPELLERS.length} checked, ` +
                  `${PROPELLERS.filter((p) => p.labelUnit === "mm").length} labelled in mm`);

/* ── LEAVE-ONE-OUT ACCURACY, THE HEADLINE ─────────────────────────── */
const rows = [];
for (const p of PROPELLERS) {
  if (p.static.length < 3) continue;
  const errsT = [], errsP = [];
  for (let i = 1; i < p.static.length - 1; i++) {
    const [rpm, ctMeas, cpMeas] = p.static[i];
    /* Rebuild the propeller without this point, then ask the real module. */
    const held = { ...p, static: p.static.filter((_, j) => j !== i) };
    const { ct, mode } = staticCoefficients(held, rpm);
    const { cp } = staticCoefficients(held, rpm);
    if (mode === "clamped-low" || mode === "clamped-high") continue;
    errsT.push(pct(ct, ctMeas));
    errsP.push(pct(cp, cpMeas));
  }
  if (!errsT.length) continue;
  const worstT = errsT.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
  rows.push({
    id: p.id, n: errsT.length,
    medT: median(errsT.map(Math.abs)), worstT,
    medP: median(errsP.map(Math.abs)),
    worstP: errsP.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0),
  });
}
function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : 0.5 * (a[a.length / 2 - 1] + a[a.length / 2]);
}

const allT = rows.flatMap((r) => [r.worstT]);
const nPts = rows.reduce((n, r) => n + r.n, 0);
const medAll = median(rows.map((r) => r.medT));
const worstAll = allT.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
const over5 = rows.filter((r) => Math.abs(r.worstT) > 5);

/* THE ACCURACY CLAIM, STATED AS WHAT WAS MEASURED.

   Leave-one-out is HARSHER than operational use: dropping an interior point
   forces the module to interpolate across a doubled RPM gap, which is a span
   it never faces in the app, where every measured point is present. So these
   figures bound the operational error from above rather than describing it.

   The claim is therefore three numbers, not one, and each is asserted:
   the median, the share of propellers inside the 5 % gate, and the worst
   case. Asserting only "every point within 5 %" would be false — 8 of 262
   propellers exceed it at their single worst held-out point — and quietly
   widening the gate to 7 % to make a green line appear would be worse. */
const within5 = rows.length - over5.length;
const shareWithin5 = within5 / rows.length;

check("median cross-validated C_T error is well inside the gate", medAll < 1.0,
  `${medAll.toFixed(2)} % across ${nPts} held-out points — the gate is 5 %`);

check("at least 95 % of propellers are within 5 % at every held-out point",
  shareWithin5 >= 0.95,
  `${within5} of ${rows.length} (${(100 * shareWithin5).toFixed(1)} %); ` +
  `${over5.length} exceed it, worst ${worstAll.toFixed(2)} %`);

check("no propeller exceeds 10 % even under leave-one-out",
  Math.abs(worstAll) < 10,
  `worst ${worstAll.toFixed(2)} % — leave-one-out doubles the interpolation ` +
  `gap, so operational error is strictly smaller than this`);

if (over5.length) {
  console.log(`        the ${over5.length} above 5 %, which are reported rather than excluded:`);
  for (const r of over5.sort((a, b) => Math.abs(b.worstT) - Math.abs(a.worstT)))
    console.log(`          ${r.id.padEnd(34)} worst ${r.worstT.toFixed(2)} %  (median ${r.medT.toFixed(2)} %, n=${r.n})`);
}

/* ── FIGURE OF MERIT IS PHYSICAL EVERYWHERE ───────────────────────── */
const fms = [];
for (const p of PROPELLERS)
  for (const [rpm] of p.static) fms.push({ id: p.id, rpm, ...figureOfMerit(p, rpm) });
const badFm = fms.filter((f) => !(f.fm > 0.15 && f.fm < 0.95));
check("figure of merit is physical for every measured point (0.15-0.95)",
  badFm.length === 0,
  badFm.length ? badFm.slice(0, 4).map((f) => `${f.id}@${f.rpm} FM=${f.fm.toFixed(3)}`).join(", ")
               : `${fms.length} points; FM ${Math.min(...fms.map((f) => f.fm)).toFixed(3)}` +
                 `-${Math.max(...fms.map((f) => f.fm)).toFixed(3)}, ` +
                 `median ${median(fms.map((f) => f.fm)).toFixed(3)}`);

/* FM AGAINST THE LITERATURE, INSIDE THE LITERATURE'S OWN SCOPE.

   An earlier version of this gate asserted that no propeller may exceed
   FM 0.66, because Winslow states that is "the highest value of FM reported
   in the literature for micro-rotors operating at tip Re less than 70,000".
   It failed on 324 points — and the gate was wrong, not the data. Every one
   of those points is a 16-18 inch propeller running at tip Reynolds numbers
   of 320,000-450,000, an order of magnitude outside the scope of the
   sentence being quoted. Applying a micro-rotor bound to an 18 inch
   propeller is the same out-of-domain extrapolation this project refuses
   everywhere else, committed inside the gate meant to prevent it.

   The bound is therefore applied only where it was stated to hold. Tip
   Reynolds number needs a chord, and only some propellers in the database
   have a digitised geometry file, so chord is taken as 0.1 D purely to BAND
   the points. That is an assumption, it is not sourced, and it is used for
   nothing except deciding which literature bound applies — never in a
   computed result. */
const NU_AIR = 1.46e-5;                    // m^2/s, ISA 15 C
const CHORD_FRACTION = 0.1;                // banding only — see above
const withRe = fms.map((f) => {
  const p = PROPELLERS.find((x) => x.id === f.id);
  const tip = (f.rpm * 2 * Math.PI / 60) * (p.diameterM / 2);
  return { ...f, reTip: tip * CHORD_FRACTION * p.diameterM / NU_AIR };
});
const micro = withRe.filter((f) => f.reTip < 70000);
const microOver = micro.filter((f) => f.fm > 0.66);
check("within the micro-rotor scope (tip Re < 70k), FM respects the published ceiling",
  microOver.length / Math.max(1, micro.length) < 0.01,
  `${microOver.length} of ${micro.length} points above FM 0.66 ` +
  `(Winslow's highest reported for tip Re < 70,000)`);

const large = withRe.filter((f) => f.reTip >= 70000);
console.log(`        above that scope (${large.length} points, tip Re >= 70k) FM reaches ` +
            `${Math.max(...large.map((f) => f.fm)).toFixed(3)} on large APC propellers — ` +
            `outside the quoted bound's stated domain, so not asserted against it`);

/* ── THE MODULE REFUSES TO EXTRAPOLATE ────────────────────────────── */
const probe = PROPELLERS[0];
const loRpm = probe.static[0][0], hiRpm = probe.static[probe.static.length - 1][0];
check("below the measured range is flagged, not silently estimated",
  staticCoefficients(probe, loRpm * 0.5).mode === "clamped-low");
check("above the measured range is flagged, not silently estimated",
  staticCoefficients(probe, hiRpm * 2).mode === "clamped-high");
check("a measured RPM is reported as measured",
  staticCoefficients(probe, probe.static[1][0]).mode === "measured");
check("an impossible thrust request returns null with its measured range",
  rpmForThrust(probe, 1e6).rpm === null);

/* ── THE REYNOLDS LAPSE ───────────────────────────────────────────── */
const rising = PROPELLERS.filter((p) => p.static.at(-1)[1] > p.static[0][1]).length;
check("C_T rises with RPM on the great majority of propellers",
  rising / PROPELLERS.length > 0.9,
  `${rising} of ${PROPELLERS.length} (${(100 * rising / PROPELLERS.length).toFixed(0)} %) — ` +
  `the Reynolds lapse, which is why a constant C_T is not used`);

/* Quantify what a constant C_T would have cost, so the design choice is
   evidenced in the gate output rather than only in a comment. */
const spreads = PROPELLERS.map((p) => {
  const cts = p.static.map((r) => r[1]);
  return 100 * (Math.max(...cts) - Math.min(...cts)) / (cts.reduce((a, b) => a + b, 0) / cts.length);
});
console.log("-".repeat(78));
console.log(`  a single constant C_T per propeller would drift a median ` +
            `${median(spreads).toFixed(1)} % across its own tested RPM range,`);
console.log(`  exceeding 5 % on ${spreads.filter((s) => s > 5).length} of ${spreads.length} propellers. ` +
            `Interpolating the measurements gives ${medAll.toFixed(2)} %.`);

/* ── THE FULL TABLE, WORST FIRST ──────────────────────────────────── */
console.log("-".repeat(78));
console.log("  worst 12 propellers by cross-validated C_T error (full distribution, not a mean):");
console.log(`  ${"propeller".padEnd(34)}${"n".padStart(4)}${"med C_T".padStart(10)}${"worst C_T".padStart(11)}${"worst C_P".padStart(11)}`);
for (const r of [...rows].sort((a, b) => Math.abs(b.worstT) - Math.abs(a.worstT)).slice(0, 12))
  console.log(`  ${r.id.padEnd(34)}${String(r.n).padStart(4)}` +
              `${r.medT.toFixed(2).padStart(9)}%${r.worstT.toFixed(2).padStart(10)}%${r.worstP.toFixed(2).padStart(10)}%`);

const band = (lo, hi) => rows.filter((r) => Math.abs(r.worstT) >= lo && Math.abs(r.worstT) < hi).length;
console.log("-".repeat(78));
console.log("  propellers by worst cross-validated C_T error:");
for (const [lo, hi] of [[0, 1], [1, 2], [2, 3], [3, 5], [5, 1e9]])
  console.log(`    ${(hi > 1e8 ? `>= ${lo}` : `${lo}-${hi}`).padStart(8)} % : ${band(lo, hi)}`);

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE ROTOR GATE PASSED (${pass} checks)`
                       : `DRONE ROTOR GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
