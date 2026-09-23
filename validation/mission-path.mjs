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

/* THE 1/cos GAP, NOW CLOSED, AND THIS IS WHAT HOLDS IT CLOSED.
   The engine used to divide a HORIZONTAL distance by an ALONG-PATH
   airspeed: tcl = (h / tan gamma) / (Vcl - wind), where Vcl is defined
   as RoC / sin(gamma). That made every climb and descent 1/cos(gamma)
   too quick — 0.38% on the 5 degree climb, 0.60% on the descent. The
   ground speed is now the horizontal component, Vcl cos(gamma) - wind,
   and the climb time reduces to the textbook h / RoC.

   The check is a real cross-check rather than a restatement: the path
   never uses a rate. It interpolates between heights and times the
   sizing produced, so recovering a rate from it and finding rateOfClimb
   is two separate calculations agreeing. */
const climbRate = (topOfClimb.altitudeAglM - missionPathAt(r, p, r.tPhases[1]).altitudeAglM)
                / (r.tPhases[2] - r.tPhases[1]);
check("the climb rate recovered from the path IS the rateOfClimb asked for",
  near(climbRate, r.climbRateMS, 0.01),
  `${climbRate.toFixed(4)} m/s against rateOfClimb ${r.climbRateMS} m/s`
  + ` — ${(100 * (climbRate / r.climbRateMS - 1)).toFixed(3)}% apart; it was 0.38% before the`
  + " ground speed became the horizontal component of the airspeed");

/* The identity the fix restores, stated as its own check so that a
   regression names the thing that broke rather than a tolerance. */
check("which is the same statement as: time to climb = height / rate of climb",
  near(r.tcl, r.climbHeightM / r.climbRateMS, 0.1),
  `tcl ${r.tcl} s against climbHeight/RoC ${(r.climbHeightM / r.climbRateMS).toFixed(2)} s`
  + " — equal in still air, and this mission has no headwind");

const toRate = missionPathAt(r, p, r.tPhases[1]).altitudeAglM / (r.tPhases[1] - r.tPhases[0]);
check("the vertical take-off rate is NASA's 100 ft/min, not the trace's 0.5",
  near(toRate, r.hoverClimbRateMS, 1e-6) && near(toRate, 0.508, 0.001),
  `${toRate.toFixed(4)} m/s = ${(toRate / 0.00508).toFixed(1)} ft/min`
  + ` — hoverHeight ${p.hoverHeight} m in tto ${r.tto} s, TM-20210017971 Table 1`);

const descRate = (missionPathAt(r, p, r.tPhases[3]).altitudeAglM
                - missionPathAt(r, p, r.tPhases[4]).altitudeAglM)
                / (r.tPhases[4] - r.tPhases[3]);
check("and the descent rate recovered from the path IS descentRateMS",
  near(descRate, r.descentRateMS, 0.01),
  `${descRate.toFixed(4)} m/s against ${r.descentRateMS} m/s at`
  + ` ${Number(r.descentAngleUsedDeg).toFixed(2)} deg, the converged glide angle`
  + ` — ${(100 * (descRate / r.descentRateMS - 1)).toFixed(3)}% apart; it was 0.60% before`);

/* THE HEADWIND CASE IS STILL INCONSISTENT, and saying so here keeps it
   from being rediscovered as a surprise. The climb is defined by the
   STILL-AIR ground distance ClimbR, so into a headwind the aircraft
   takes longer to cover it and therefore climbs past the altitude it
   was aiming at: measured, tcl/(h/RoC) is 1.00 with no wind, 1.09 at
   10 kt and 1.21 at 20 kt. Terminating the climb on HEIGHT instead
   would change ClimbR, and so CruiseRange and the range accounting.
   That is a larger change and is not this one. */
{
  const pw = { ...DEFAULT_PARAMS, headwindMS: 5.144, cruiseAlt: 2500 };
  const rw = runSizing(pw);
  const ratio = rw.tcl / (rw.climbHeightM / rw.climbRateMS);
  check("into a headwind the climb still overruns its height, and that is recorded",
    ratio > 1.05 && ratio < 1.15,
    `tcl/(h/RoC) = ${ratio.toFixed(3)} at 10 kt — the climb is defined by the still-air`
    + " ground distance, so it flies longer and climbs higher than asked. Documented, not fixed");
}

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
