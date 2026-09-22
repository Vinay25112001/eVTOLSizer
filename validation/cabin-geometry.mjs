/* =====================================================================
   THE CABIN MUST HOLD ITS OCCUPANTS
   =====================================================================
   fusLen and payload were independent sliders, and on the multicopter --
   the one layout whose fuselage is not floored by the room its rotor array
   needs -- that let the body shrink to a two-seat pod while still carrying
   five occupants' mass. MTOW fell 25% and nothing objected.

   This gate holds the constraint that closes that gap, and it holds the
   two sources it rests on so that neither can drift:

     occupant mass    NASA/20180006683, "6 occupants at 1200 lb total"
     cabin floor      one measured two-seat cabin, 2.2 x 1.5 x 1.9 m

   The second is n=1 and this file says so out loud. A gate that asserts a
   one-sample constant as though it were a correlation is worse than no
   gate, so what is checked is that the constant still REPRODUCES the
   vehicle it came from -- which is the only thing one sample can prove.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import { CONFIG_DEFAULTS } from "../src/engine/configuration.js";
import { fuselageWettedArea } from "../src/engine/constants.js";
import {
  OCCUPANT_MASS_KG, CABIN_FLOOR_PER_OCCUPANT_M2, CABIN_REFERENCE,
  occupantsFromPayload, payloadFromOccupants, cabinFloorRequired,
  equivalentDiameter, cabinAdequacy,
} from "../src/engine/cabin.js";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (detail) console.log("          " + detail);
  if (!ok) fails.push(label);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("CABIN GEOMETRY GATE");
console.log("=".repeat(78));

/* ── 1. NASA's occupant mass, from the paper's own arithmetic ─────────── */
const sixOccupants = 6 * OCCUPANT_MASS_KG;
const twelveHundredLb = 1200 * 0.45359237;
check(near(sixOccupants, twelveHundredLb, 0.05),
  "occupant mass reproduces NASA's 6 occupants at 1200 lb",
  `6 x ${OCCUPANT_MASS_KG.toFixed(3)} kg = ${sixOccupants.toFixed(2)} kg against `
  + `1200 lb = ${twelveHundredLb.toFixed(2)} kg [NASA/20180006683]`);

check(near(occupantsFromPayload(payloadFromOccupants(4)), 4, 1e-9),
  "occupants and payload round-trip",
  "payloadFromOccupants then occupantsFromPayload returns the same count");

/* ── 2. the floor constant reproduces the vehicle it was measured on ──── */
const R = CABIN_REFERENCE;
const refArea = R.lengthM * R.widthM;
check(near(cabinFloorRequired(R.occupants), refArea, 1e-9),
  "the floor constant reproduces the cabin it came from",
  `${R.occupants} occupants need ${cabinFloorRequired(R.occupants).toFixed(3)} m2; the `
  + `reference measures ${R.lengthM} x ${R.widthM} = ${refArea.toFixed(3)} m2. `
  + `n=1 -- this proves reproduction, NOT a correlation`);

/* THE CONSTANT IS A FLOOR, NOT A FIT. Recorded so that anyone raising it
   has to come back here and say why. */
check(CABIN_FLOOR_PER_OCCUPANT_M2 === 1.65,
  "the per-occupant floor area is the value the reference measured",
  "1.65 m2 gross plan, the one CAD-measured cabin in the population");

/* THE POPULATION. Yang 2024 Table 4 was on disk the whole time as
   Multi_1.txt. Its eight vehicles are image estimates by the paper's own
   statement; with the measured reference that is nine cabins, eight with a
   known seat count. The floor must sit at the bottom of that range -- a floor
   above real vehicles would reject aircraft that exist. */
const { cabinPopulationStats } = await import("../src/engine/cabin.js");
const pop = cabinPopulationStats();
check(pop.n >= 8 && CABIN_FLOOR_PER_OCCUPANT_M2 <= pop.min * 1.05,
  "the floor sits at the bottom of a real population, not above it",
  `${pop.n} cabins: ${pop.min.toFixed(2)} min, ${pop.mean.toFixed(2)} mean, `
  + `${pop.max.toFixed(2)} max m2/occupant; floor ${CABIN_FLOOR_PER_OCCUPANT_M2} is `
  + `${((CABIN_FLOOR_PER_OCCUPANT_M2 / pop.min - 1) * 100).toFixed(0)}% above the minimum (Gelisim TUSI, an image estimate)`);

/* ── 3. a non-circular section needs an equivalent diameter ───────────── */
const W = R.widthM, H = R.heightM;
const dEq = equivalentDiameter(W, H);
const ellipse = Math.PI / 4 * W * H;
check(near(Math.PI / 4 * dEq * dEq, ellipse, 1e-12),
  "equivalent diameter reproduces the true elliptical frontal area",
  `sqrt(${W} x ${H}) = ${dEq.toFixed(4)} m gives ${(Math.PI / 4 * dEq * dEq).toFixed(4)} m2, `
  + `the ellipse gives ${ellipse.toFixed(4)} m2`);

const circW = Math.PI / 4 * W * W;
check(Math.abs(circW / ellipse - 1) > 0.15,
  "and taking width as the diameter is materially wrong, which is why it exists",
  `a circle of D = W = ${W} m gives ${circW.toFixed(3)} m2, `
  + `${((circW / ellipse - 1) * 100).toFixed(1)}% against the true section`);

/* ── 4. Raymer must not be evaluated where Raymer is undefined ────────── */
/* (1 - 2/lambda) is negative below fineness 2.0, and Math.pow of a negative
   at a fractional exponent is NaN. The helper switches to a spheroid. */
let raymerNaN = 0, helperFinite = 0;
for (const [L, D] of [[2.2, 1.5], [2.43, 1.65], [3.0, 1.65], [5.87, 1.65]]) {
  const lam = L / D;
  const raw = Math.PI * D * L * Math.pow(1 - 2 / lam, 2 / 3) * (1 + 1 / (lam * lam));
  if (!Number.isFinite(raw)) raymerNaN++;
  if (Number.isFinite(fuselageWettedArea(L, D)) && fuselageWettedArea(L, D) > 0) helperFinite++;
}
check(raymerNaN >= 2 && helperFinite === 4,
  "the wetted-area helper is finite where raw Raymer returns NaN",
  `raw Eq 12.31 is NaN on ${raymerNaN} of 4 pod-like bodies; the helper is finite on all 4`);

/* The engine must not open-code it anywhere. This is the actual regression:
   the in-loop path used the helper and the post-loop path did not. */
import { readFileSync } from "node:fs";
const engineSrc = readFileSync("src/engine.js", "utf8");
const openCoded = (engineSrc.match(/Math\.pow\(\s*1\s*-\s*2\s*\/\s*lambda_f\s*,/g) || []).length
                + (engineSrc.match(/Math\.pow\(\s*1\s*-\s*2\s*\/\s*lf\s*,/g) || []).length;
check(openCoded === 0,
  "engine.js never open-codes Raymer Eq 12.31 instead of calling the helper",
  openCoded === 0 ? "every fuselage wetted area goes through fuselageWettedArea()"
                  : `${openCoded} open-coded occurrence(s) -- these go NaN below fineness 2.0`);

/* ── 5. the constraint actually fires in the engine ───────────────────── */
const BASE = {
  payload: 455, range: 190, vCruise: 67, cruiseAlt: 1000, hoverHeight: 15.24,
  reserveMinutes: 20, LD: 14, AR: 9, eOsw: 0.85, clDesign: 0.55, clCruiseMax: 0.9,
  taper: 0.45, tc: 0.15, propDiam: 3.0, twRatio: 1.3, convTolExp: -6, etaHov: 0.70,
  etaSys: 0.80, rateOfClimb: 5.08, climbAngle: 5, descentAngle: 6, climbLDPenalty: 0.13,
  deltaISA: 0, cRateDerate: 0.08, sedCell: 300, etaBat: 0.90, socMin: 0.19, ewf: 0.50,
  fusDiam: 1.65, vtGamma: 45, vtCh: 0.45, vtCv: 0.032, vtAR: 2.5,
  configType: "multicopter", nPropHover: CONFIG_DEFAULTS.multicopter.nRotors,
  weightModel: "buildup",
};
const cabinCheck = (S) => (S.checks || []).find((c) => /Cabin holds/.test(c.label));

const roomy = cabinCheck(runSizing({ ...BASE, fusLen: 5.87 }));
const cramped = cabinCheck(runSizing({ ...BASE, fusLen: 2.43 }));
check(roomy && roomy.ok, "a body that can hold five occupants passes",
  roomy ? roomy.val.split("[")[0].trim() : "check missing");
check(cramped && !cramped.ok,
  "a 2.43 m body carrying five occupants FAILS -- the 25% lever is closed",
  cramped ? cramped.val.split("—")[1]?.trim().slice(0, 110) : "check missing");

/* ── 6. and it reproduces the reference vehicle end to end ────────────── */
const pod = cabinCheck(runSizing({
  ...BASE, payload: payloadFromOccupants(2), fusLen: R.lengthM, fusDiam: R.widthM,
  fuselageSizing: "fixed",
}));
check(pod && pod.ok,
  "the reference two-seat pod passes at its own measured dimensions",
  pod ? pod.val : "check missing");

const adq = cabinAdequacy({ fusLen: R.lengthM, fusDiam: R.widthM,
                            payload: payloadFromOccupants(R.occupants) });
check(near(adq.perOccupantM2, CABIN_FLOOR_PER_OCCUPANT_M2, 1e-9),
  "and does so at exactly the per-occupant area it defined",
  `${adq.perOccupantM2.toFixed(4)} m2 per occupant`);

/* ── 7. the multicopter is a capsule, and only the multicopter ────── */
const mcRatio = CONFIG_DEFAULTS.multicopter.fusHeightRatio;
check(mcRatio && near(mcRatio, R.heightM / R.widthM, 1e-9),
  "the multicopter declares the reference cabin's section aspect",
  `height/width = ${mcRatio ? mcRatio.toFixed(4) : "absent"} against the reference's `
  + `${R.heightM} / ${R.widthM} = ${(R.heightM / R.widthM).toFixed(4)}`);

const others = Object.entries(CONFIG_DEFAULTS)
  .filter(([k, v]) => k !== "multicopter" && v.fusHeightRatio != null).map(([k]) => k);
check(others.length === 0,
  "no other layout invents a section aspect it has no source for",
  others.length ? `declared by ${others.join(", ")}` : "the winged bodies stay circular");

/* the section must actually reach the physics, not just sit in a config */
const POD = {
  ...BASE, payload: payloadFromOccupants(2), fusLen: R.lengthM, fusDiam: R.widthM,
  fuselageSizing: "fixed",
};
const circular = runSizing(POD);
const capsule = runSizing({ ...POD, fusHeight: R.heightM });
const dA = circular.dragAreas?.fuselage, dB = capsule.dragAreas?.fuselage;
check(Number.isFinite(dA) && Number.isFinite(dB) && dB > dA * 1.2,
  "declaring a section changes the fuselage the physics sees",
  `fuselage drag area ${dA} m2 circular against ${dB} m2 as a `
  + `${R.widthM} x ${R.heightM} capsule`);

/* and a body with no section declared must be bit-identical to before */
const plain = runSizing({ ...POD });
check(plain.MTOW === circular.MTOW,
  "omitting the section leaves a circular body untouched",
  `MTOW ${plain.MTOW} kg either way — fusHeight defaults to fusDiam`);

/* ── 8. the OpenVSP export is a SECOND path and must carry it too ─── */
const { generateVSP3File } = await import("../src/export/vsp3.js");
const mcP = {
  ...BASE, fusLen: +(CONFIG_DEFAULTS.multicopter.fusFineness * 1.65).toFixed(2),
  fusHeight: +(CONFIG_DEFAULTS.multicopter.fusHeightRatio * 1.65).toFixed(2),
};
const vsp = generateVSP3File(mcP, runSizing(mcP));
const fusSeg = vsp.slice(vsp.indexOf("<Name>Fuselage</Name>"),
                         vsp.indexOf("<Name>Fuselage</Name>") + 60000);
const eH = [...fusSeg.matchAll(/Ellipse_Height Value="([-0-9.e+]+)"/g)].map((m) => +m[1]);
const eW = [...fusSeg.matchAll(/Ellipse_Width Value="([-0-9.e+]+)"/g)].map((m) => +m[1]);
const vspAspect = (eH.length && eW.length) ? Math.max(...eH) / Math.max(...eW) : 0;
check(near(vspAspect, CONFIG_DEFAULTS.multicopter.fusHeightRatio, 5e-3),
  "the OpenVSP export carries the capsule section, not just the 3D view",
  `exported max section ${eW.length ? Math.max(...eW).toFixed(3) : "?"} wide x `
  + `${eH.length ? Math.max(...eH).toFixed(3) : "?"} tall, aspect ${vspAspect.toFixed(3)} `
  + `against the declared ${CONFIG_DEFAULTS.multicopter.fusHeightRatio.toFixed(3)}`);

console.log("");
console.log(fails.length ? `CABIN GEOMETRY GATE FAILED: ${fails.length} check(s)`
                         : "CABIN GEOMETRY GATE PASSED");
process.exit(fails.length ? 1 : 0);
