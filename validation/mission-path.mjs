/* =====================================================================
   MISSION PATH — the drawing must agree with the sizing that produced it
   =====================================================================
   A mission animation is the easiest thing in this tool to make look
   right and be wrong: an aircraft that moves smoothly and lands at the
   end reads as correct whatever numbers drove it. So this gate never
   checks that the path looks plausible. It checks that the path CLOSES
   on quantities the sizing computed independently.

   THE SHARPEST CHECKS HERE ARE THE RATE ONES. mission-path.js does not
   integrate rateOfClimb; it interpolates between heights the sizing
   already produced, over times the sizing already produced. So the
   climb rate is never an input to the path — which means recovering it
   from the path and comparing it with the engine's own rateOfClimb is a
   genuine cross-check of two separate calculations, not a tautology. If
   the phase times and the climb height ever stopped agreeing, this is
   where it would show.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { CONFIGURATIONS } from "../src/engine/configuration.js";
import {
  missionPathAt, missionPathSamples, groundTrackM, phaseIndexAt,
  PHASES, NOT_MODELLED,
} from "../src/engine/mission-path.js";

const fails = [];
let pass = 0;
const check = (label, ok, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  ok ? pass++ : fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("MISSION PATH GATE");
console.log("=".repeat(78));

const p = { ...DEFAULT_PARAMS };
const r = runSizing(p);

/* ── 1. THE PATH CLOSES ON THE SIZING'S OWN GEOMETRY ─────────────────── */
console.log("\n-- the path ends where the sizing says the mission ends --");

const Tend = r.tPhases[6];
const end = missionPathAt(r, p, Tend);
const start = missionPathAt(r, p, 0);

check("it starts on the ground at zero distance",
  near(start.altitudeAglM, 0, 1e-9) && near(start.groundM, 0, 1e-9),
  `${start.altitudeAglM.toFixed(3)} m AGL, ${start.groundM.toFixed(1)} m out`);

check("and it ends on the ground, not in the air",
  near(end.altitudeAglM, 0, 1e-9),
  `${end.altitudeAglM.toFixed(3)} m AGL at t = ${Tend.toFixed(1)} s`);

const topOfClimb = missionPathAt(r, p, r.tPhases[2]);
check("the top of climb is the cruise altitude the user asked for",
  near(topOfClimb.altitudeMslM, p.cruiseAlt, 0.02),
  `${topOfClimb.altitudeMslM.toFixed(2)} m MSL against cruiseAlt ${p.cruiseAlt} m`);

check("the ground track is the three flown legs and nothing else",
  near(end.groundM, groundTrackM(r), 0.5),
  `${(end.groundM / 1000).toFixed(2)} km = climb ${(r.climbRunM / 1000).toFixed(2)}`
  + ` + cruise ${(r.cruiseRunM / 1000).toFixed(2)} + descent ${(r.descentRunM / 1000).toFixed(2)} km`);

/* THE ACCOUNTING TRAP, held as a check so it cannot be forgotten. */
const reserveRunM = 0.76 * p.vCruise * r.tres;
check("and the range is that track PLUS the reserve that is never flown",
  near(groundTrackM(r) + reserveRunM, p.range * 1000, 2),
  `${((groundTrackM(r) + reserveRunM) / 1000).toFixed(2)} km against range ${p.range} km`
  + ` — the cruise leg is ${(r.cruiseRunM / 1000).toFixed(1)} km, NOT the range`);

/* ── 2. THE RATES, RECOVERED FROM A PATH THAT NEVER USED THEM ───────── */
console.log("\n-- the rates fall out of the path, and match the engine's own --");

/* THE 1/cos GAP, MEASURED RATHER THAN HIDDEN.
   The engine defines the climb rate ALONG THE FLIGHT PATH, RoC = Vcl
   sin(gamma), but it computes the climb TIME as a ground distance over
   a speed it treats as the ground speed: tcl = (h / tan gamma) / gsCl.
   Those two cannot both be true. Dividing them, the height reached per
   second of the sizing's own clock is RoC / cos(gamma), not RoC.

   It is 0.4% at the 5 degree climb and 0.6% at the descent, and it is
   the SIZING's inconsistency, not the path's — the path only makes it
   visible by asking the question. Closing it would change the phase
   times, and therefore the energy, of every aircraft this tool has
   produced, so this gate does what the OEI gate does with the same kind
   of gap: it measures it and holds it where it is. If it ever moves,
   something changed in the mission timing. */
const clAngRad = (Number(p.climbAngle) || 0) * Math.PI / 180;
const climbRate = (topOfClimb.altitudeAglM - missionPathAt(r, p, r.tPhases[1]).altitudeAglM)
                / (r.tPhases[2] - r.tPhases[1]);
check("the climb rate implied by the sizing's own timing is RoC / cos(climb angle)",
  near(climbRate, r.climbRateMS / Math.cos(clAngRad), 1e-3),
  `${climbRate.toFixed(4)} m/s against rateOfClimb ${r.climbRateMS} m/s`
  + ` — ${(100 * (climbRate / r.climbRateMS - 1)).toFixed(2)}% high, exactly 1/cos(${p.climbAngle} deg),`
  + " because the rate is defined along the flight path and the time is computed from ground distance");

const toRate = missionPathAt(r, p, r.tPhases[1]).altitudeAglM / (r.tPhases[1] - r.tPhases[0]);
check("the vertical take-off rate is NASA's 100 ft/min, not the trace's 0.5",
  near(toRate, r.hoverClimbRateMS, 1e-6) && near(toRate, 0.508, 0.001),
  `${toRate.toFixed(4)} m/s = ${(toRate / 0.00508).toFixed(1)} ft/min`
  + ` — hoverHeight ${p.hoverHeight} m in tto ${r.tto} s, TM-20210017971 Table 1`);

const descRate = (missionPathAt(r, p, r.tPhases[3]).altitudeAglM
                - missionPathAt(r, p, r.tPhases[4]).altitudeAglM)
                / (r.tPhases[4] - r.tPhases[3]);
const desAngRad = (Number(r.descentAngleUsedDeg) || 0) * Math.PI / 180;
check("and the descent rate carries the same 1/cos, from the same cause",
  near(descRate, r.descentRateMS / Math.cos(desAngRad), 1e-3),
  `${descRate.toFixed(4)} m/s against descentRateMS ${r.descentRateMS} m/s`
  + ` — ${(100 * (descRate / r.descentRateMS - 1)).toFixed(2)}% high at`
  + ` ${Number(r.descentAngleUsedDeg).toFixed(2)} deg, the converged glide angle`);

/* ── 3. THE RESERVE IS HELD, NOT FLOWN ──────────────────────────────── */
console.log("\n-- the reserve is energy, and the aircraft is on the ground --");

const inReserve = missionPathAt(r, p, (r.tPhases[5] + r.tPhases[6]) / 2);
check("the reserve phase does not fly the aircraft anywhere",
  inReserve.flown === false && near(inReserve.altitudeAglM, 0, 1e-9)
    && near(inReserve.groundM, groundTrackM(r), 0.5),
  "it is held at the landing point — drawing it as flight would show an aircraft taking off after it had landed");

check("but it still reports the power the reserve is held at",
  near(inReserve.powerKW, r.Pres, 0.01),
  `${inReserve.powerKW.toFixed(1)} kW = Pres, at 0.76 x vCruise`);

/* ── 4. MONOTONIC, CONTINUOUS, AND TAKING ITS POWERS FROM THE RESULT ── */
console.log("\n-- nothing jumps, and no power is recomputed here --");

const S = missionPathSamples(r, p, 400);
let backwards = 0, airborne = 0, biggestJump = 0;
for (let i = 1; i < S.length; i++) {
  if (S[i].t < S[i - 1].t || S[i].groundM < S[i - 1].groundM - 1e-6) backwards++;
  biggestJump = Math.max(biggestJump, Math.abs(S[i].altitudeAglM - S[i - 1].altitudeAglM));
  if (S[i].altitudeAglM < -1e-9) airborne++;
}
check("time and ground distance never run backwards", backwards === 0,
  `${S.length} samples, none out of order`);
check("altitude never goes below the ground", airborne === 0,
  `minimum ${Math.min(...S.map((x) => x.altitudeAglM)).toFixed(3)} m AGL`);
check("and altitude is continuous — no teleport between phases",
  biggestJump < Math.max(5, r.climbHeightM / 20),
  `largest step between adjacent samples ${biggestJump.toFixed(2)} m`);

const powers = new Set(S.map((x) => +x.powerKW.toFixed(2)));
const fromResult = new Set([r.Phov, r.Pcl, r.Pcr, r.Pdc, r.Pres].map((x) => +Number(x).toFixed(2)));
check("every power on the path is one the sizing already produced",
  [...powers].every((x) => fromResult.has(x)),
  `${powers.size} distinct values, all drawn from Phov/Pcl/Pcr/Pdc/Pres — none recomputed here`);

/* ── 5. EVERY CONFIGURATION, INCLUDING THE WINGLESS ONES ─────────────── */
console.log("\n-- every configuration the tool offers produces a usable path --");

const bad = [];
for (const key of Object.keys(CONFIGURATIONS)) {
  const pc = { ...DEFAULT_PARAMS, configType: key };
  let rc;
  try { rc = runSizing(pc); } catch (e) { bad.push(`${key}: sizing threw ${e.message}`); continue; }
  const e2 = missionPathAt(rc, pc, rc.tPhases[6]);
  const s2 = missionPathSamples(rc, pc, 50);
  const finite = s2.every((x) => Number.isFinite(x.altitudeAglM) && Number.isFinite(x.groundM)
                              && Number.isFinite(x.powerKW) && Number.isFinite(x.speedMS));
  if (!e2 || !finite) { bad.push(`${key}: non-finite or null path`); continue; }
  if (!near(e2.altitudeAglM, 0, 1e-6)) bad.push(`${key}: ends at ${e2.altitudeAglM.toFixed(2)} m`);
}
check("all six land, with no NaN anywhere in the path", bad.length === 0,
  bad.length ? bad.join(" | ") : `${Object.keys(CONFIGURATIONS).length} configurations`);

/* A multicopter has no wing, so it has no wing-borne cruise to draw
   differently — but it still flies the same phase sequence, and the
   path must not quietly special-case it out of existence. */
const pm = { ...DEFAULT_PARAMS, configType: "multicopter" };
const rm = runSizing(pm);
check("a wingless layout still flies all six phases",
  PHASES.every((ph, j) => missionPathAt(rm, pm,
    (rm.tPhases[j] + rm.tPhases[j + 1]) / 2).phase === ph),
  "multicopter — rotor-borne throughout, and the phase sequence is unchanged");

/* ── 6. WHAT IT REFUSES TO DRAW ──────────────────────────────────────── */
console.log("\n-- the refusals are carried with the module, not left to the view --");

check("the transition and the failure transient are named as not modelled",
  NOT_MODELLED.some((x) => /transition/i.test(x.what))
    && NOT_MODELLED.some((x) => /failure/i.test(x.what)),
  `${NOT_MODELLED.length} entries — a view prints these instead of drawing a plausible version`);

check("and every refusal says WHERE the refusal is already recorded",
  NOT_MODELLED.every((x) => typeof x.where === "string" && x.where.includes("src/")
                         && typeof x.why === "string" && x.why.length > 40),
  "so the citation travels with the claim rather than being paraphrased in a card");

check("phaseIndexAt is total — every time in the mission lands in a phase",
  [0, 1e-9, Tend / 3, Tend - 1e-9, Tend, Tend * 2, -5]
    .every((t) => { const j = phaseIndexAt(r.tPhases, t); return j >= 0 && j <= 5; }),
  "including before zero and past the end, which a scrubber will ask for");

console.log("");
console.log("=".repeat(78));
console.log(fails.length ? `MISSION PATH GATE FAILED: ${fails.length} check(s)`
                         : `MISSION PATH GATE PASSED (${pass} checks)`);
console.log("=".repeat(78));
process.exit(fails.length ? 1 : 0);
